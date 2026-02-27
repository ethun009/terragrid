/**
 * TerraGrid Pro — 3D WebGL Terrain Viewer
 * Uses Three.js for surface mesh rendering with lighting,
 * shading, and vertical exaggeration control
 */

const Viewer3D = (() => {
    let scene, camera, renderer3d, mesh, wireframeMesh, controls;
    let containerId = null;
    let isInitialized = false;
    let isWireframe = false;
    let animFrameId = null;
    let isVisible = false;
    let labels = [];
    let labelContainer = null;
    let currentToggles = { labels: true, elevValues: true };

    // Simulation state
    let isWaterMode = false;
    let droplets = []; // Array of Droplet instances
    let raycaster = new THREE.Raycaster();
    let mouse = new THREE.Vector2();

    // 3D View Settings
    let viewSettings = {
        smoothing: 0,
        colorMode: 'terrain',
        staticColor: '#3b82f6',
        grid: null,
        rows: 0,
        cols: 0,
        spacing: 10,
        vertExag: 2
    };

    // Orbit Controls state
    let orbitState = {
        isRotating: false,
        isPanning: false,
        lastMouse: { x: 0, y: 0 },
        spherical: { theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 3 },
        panOffset: { x: 0, y: 0 },
        lastTouchDist: 0,
        lastTouchMid: { x: 0, y: 0 }
    };

    function init(cId) {
        containerId = cId;
        labelContainer = document.getElementById('v3d-label-container');
    }

    function setup() {
        if (isInitialized) return;
        const container = document.getElementById(containerId);
        if (!container) return;

        const canvas = document.getElementById('terrain-canvas');
        if (!canvas || typeof THREE === 'undefined') return;

        const w = container.clientWidth;
        const h = container.clientHeight;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080c10);
        scene.fog = new THREE.Fog(0x080c10, 8, 25);

        camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000);

        renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer3d.setSize(w, h);
        renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer3d.shadowMap.enabled = true;
        renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;

        const ambientLight = new THREE.AmbientLight(0x406080, 0.6);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.2);
        sunLight.position.set(5, 10, 5);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 1024;
        sunLight.shadow.mapSize.height = 1024;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 50;
        sunLight.shadow.camera.left = -10;
        sunLight.shadow.camera.right = 10;
        sunLight.shadow.camera.top = 10;
        sunLight.shadow.camera.bottom = -10;
        sunLight.shadow.bias = -0.0005;
        scene.add(sunLight);

        const fillLight = new THREE.DirectionalLight(0x3060aa, 0.3);
        fillLight.position.set(-5, 5, -5);
        scene.add(fillLight);

        const gridHelper = new THREE.GridHelper(10, 20, 0x1c3050, 0x0a1525);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);

        setupOrbitControls(canvas);

        window.addEventListener('resize', () => {
            if (!isVisible) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer3d.setSize(w, h);
        });

        isInitialized = true;
    }

    // --- Water Physics Droplet ---
    class Droplet {
        constructor(x, z, hgrid, rows, cols, spacing, scale, stats, vertExag) {
            this.pos = new THREE.Vector3(x, 0, z); // Logical grid pos
            this.vel = new THREE.Vector3(0, 0, 0);
            this.grid = hgrid;
            this.rows = rows;
            this.cols = cols;
            this.spacing = spacing;
            this.scale = scale;
            this.stats = stats;
            this.vertExag = vertExag;
            this.life = 1.0;
            this.puddleDepth = 0;

            // Visual sphere
            const geom = new THREE.SphereGeometry(0.01, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: 0x44aaff, transparent: true, opacity: 0.8 });
            this.mesh = new THREE.Mesh(geom, mat);
            scene.add(this.mesh);
            this.updateMeshPos();
        }

        getHeight(x, z) {
            // Bi-linear interpolation on grid
            const c = (x + (this.cols - 1) * this.spacing / 2) / this.spacing;
            const r = (z + (this.rows - 1) * this.spacing / 2) / this.spacing;
            if (c < 0 || c >= this.cols - 1 || r < 0 || r >= this.rows - 1) return null;

            const c0 = Math.floor(c), r0 = Math.floor(r);
            const c1 = c0 + 1, r1 = r0 + 1;
            const fx = c - c0, fz = r - r0;

            const h00 = this.grid[r0][c0], h10 = this.grid[r0][c1];
            const h01 = this.grid[r1][c0], h11 = this.grid[r1][c1];

            if (h00 == null || h10 == null || h01 == null || h11 == null) return null;

            const h = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
            const minVisualRelief = 0.1;
            const normalizedH = (h - this.stats.min) / (this.stats.relief || 1);
            return (normalizedH + minVisualRelief * (1 - normalizedH)) * (this.stats.relief || 1) * this.vertExag;
        }

        update(dt) {
            this.life -= dt * 0.1;
            if (this.life <= 0) return false;

            const x = this.pos.x, z = this.pos.z;
            const h = this.getHeight(x, z);
            if (h == null) return false;

            // Gradient calculation (simplified central diff)
            const eps = this.spacing * 0.1;
            const hx = this.getHeight(x + eps, z);
            const hz = this.getHeight(x, z + eps);

            if (hx == null || hz == null) return false;

            const gx = (hx - h) / eps;
            const gz = (hz - h) / eps;

            // Physics step
            const gravity = 2.0;
            const friction = 0.95;
            this.vel.x = (this.vel.x - gx * gravity * dt) * friction;
            this.vel.z = (this.vel.z - gz * gravity * dt) * friction;

            this.pos.x += this.vel.x * dt;
            this.pos.z += this.vel.z * dt;

            // Check if stuck (too slow)
            if (this.vel.length() < 0.001) this.life -= dt * 2.0;

            this.updateMeshPos();
            return true;
        }

        updateMeshPos() {
            const h = this.getHeight(this.pos.x, this.pos.z);
            this.mesh.position.set(this.pos.x * this.scale, h * this.scale + 0.01, this.pos.z * this.scale);
        }

        destroy() {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }

    function setupOrbitControls(canvas) {
        canvas.addEventListener('mousedown', (e) => {
            if (isWaterMode && e.button === 0) {
                dropWaterAtCursor(e);
                return;
            }
            if (e.button === 0) orbitState.isRotating = true;
            if (e.button === 2) orbitState.isPanning = true;
            orbitState.lastMouse = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => {
            orbitState.isRotating = false;
            orbitState.isPanning = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (orbitState.isRotating || orbitState.isPanning) {
                const dx = e.clientX - orbitState.lastMouse.x;
                const dy = e.clientY - orbitState.lastMouse.y;
                orbitState.lastMouse = { x: e.clientX, y: e.clientY };

                if (orbitState.isRotating) {
                    orbitState.spherical.theta -= dx * 0.008;
                    orbitState.spherical.phi = Utils.clamp(orbitState.spherical.phi + dy * 0.008, 0.1, Math.PI - 0.1);
                }
                if (orbitState.isPanning) {
                    orbitState.panOffset.x -= dx * 0.005;
                    orbitState.panOffset.y += dy * 0.005;
                }
            }
        });

        // Touch support
        canvas.addEventListener('touchstart', (e) => {
            if (isWaterMode && e.touches.length === 1) {
                dropWaterAtCursor(e.touches[0]);
                e.preventDefault();
                return;
            }
            if (e.touches.length === 1) {
                orbitState.isRotating = true;
                orbitState.isPanning = false;
                orbitState.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                orbitState.isRotating = false;
                orbitState.isPanning = true;
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                orbitState.lastTouchDist = Math.sqrt(dx * dx + dy * dy);
                orbitState.lastTouchMid = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };
            }
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && orbitState.isRotating) {
                const dx = e.touches[0].clientX - orbitState.lastMouse.x;
                const dy = e.touches[0].clientY - orbitState.lastMouse.y;
                orbitState.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };

                orbitState.spherical.theta -= dx * 0.008;
                orbitState.spherical.phi = Utils.clamp(orbitState.spherical.phi + dy * 0.008, 0.1, Math.PI - 0.1);
            } else if (e.touches.length === 2 && orbitState.isPanning) {
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

                // Zooming
                if (orbitState.lastTouchDist > 0) {
                    const factor = orbitState.lastTouchDist / dist;
                    orbitState.spherical.radius = Utils.clamp(orbitState.spherical.radius * factor, 0.5, 20);
                }

                // Panning
                const pdx = midX - orbitState.lastTouchMid.x;
                const pdy = midY - orbitState.lastTouchMid.y;
                orbitState.panOffset.x -= pdx * 0.005;
                orbitState.panOffset.y += pdy * 0.005;

                orbitState.lastTouchDist = dist;
                orbitState.lastTouchMid = { x: midX, y: midY };
            }
        }, { passive: false });

        canvas.addEventListener('touchend', () => {
            orbitState.isRotating = false;
            orbitState.isPanning = false;
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            orbitState.spherical.radius = Utils.clamp(orbitState.spherical.radius * (e.deltaY > 0 ? 1.15 : 0.87), 0.5, 20);
        }, { passive: false });

        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    function dropWaterAtCursor(e) {
        if (!mesh) return;
        const rect = renderer3d.domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(mesh);

        if (intersects.length > 0) {
            const p = intersects[0].point;
            const scale = mesh.scale.x;
            const lx = p.x / scale;
            const lz = p.z / scale;
            const stats = Utils.elevStats(viewSettings.grid);
            droplets.push(new Droplet(lx, lz, viewSettings.grid, viewSettings.rows, viewSettings.cols, viewSettings.spacing, scale, stats, viewSettings.vertExag));
        }
    }

    function applySmoothing(grid, amount) {
        if (amount <= 0) return grid;
        const rows = grid.length;
        const cols = grid[0].length;
        let current = grid.map(r => [...r]);

        for (let iter = 0; iter < amount; iter++) {
            let next = Array.from({ length: rows }, () => Array(cols).fill(null));
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    let sum = 0, count = 0;
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr, nc = c + dc;
                            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && current[nr][nc] != null) {
                                sum += current[nr][nc];
                                count++;
                            }
                        }
                    }
                    next[r][c] = count > 0 ? sum / count : current[r][c];
                }
            }
            current = next;
        }
        return current;
    }

    function buildTerrain(grid, rows, cols, spacing, vertExag, smoothing = 0, colorMode = 'terrain', staticColor = '#3b82f6') {
        if (!isInitialized) return;
        viewSettings = { grid, rows, cols, spacing, vertExag, smoothing, colorMode, staticColor };

        if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; }
        if (wireframeMesh) { scene.remove(wireframeMesh); wireframeMesh.geometry.dispose(); wireframeMesh = null; }

        const smoothedGrid = applySmoothing(grid, smoothing);
        const stats = Utils.elevStats(smoothedGrid);
        if (!stats || stats.count < 4) return;

        const physW = (cols - 1) * spacing;
        const physH = (rows - 1) * spacing;
        const maxDim = Math.max(physW, physH);
        const scale = 2.0 / maxDim;

        const geom = new THREE.PlaneGeometry(physW, physH, cols - 1, rows - 1);
        geom.rotateX(-Math.PI / 2);

        const minVisualRelief = 0.1;
        const pos = geom.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const rampStops = Utils.getRamp('terrain');

        // Material Logic
        let vertexColors = (colorMode !== 'static');

        for (let i = 0; i < pos.count; i++) {
            const gx = pos.getX(i);
            const gz = pos.getZ(i);
            const c = Utils.clamp(Math.round((gx + physW / 2) / spacing), 0, cols - 1);
            const r = Utils.clamp(Math.round((gz + physH / 2) / spacing), 0, rows - 1);

            const elevation = (smoothedGrid[r] && smoothedGrid[r][c] != null) ? smoothedGrid[r][c] : stats.mean;
            const normalizedH = (elevation - stats.min) / (stats.relief || 1);
            const h = Math.max(normalizedH, 0);
            const finalH = (h + minVisualRelief * (1 - h)) * (stats.relief || 1) * vertExag;
            pos.setY(i, finalH);

            if (colorMode === 'terrain') {
                const colorStr = Utils.sampleRamp(rampStops, h);
                const match = colorStr.match(/\d+/g);
                if (match) {
                    colors[i * 3] = parseInt(match[0]) / 255;
                    colors[i * 3 + 1] = parseInt(match[1]) / 255;
                    colors[i * 3 + 2] = parseInt(match[2]) / 255;
                }
            }
        }

        if (colorMode === 'slope') {
            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
                // Simple neighboring slope check
                const eps = spacing * 0.5;
                const idxXP = i < pos.count - 1 ? i + 1 : i;
                const idxZP = i < pos.count - (cols) ? i + cols : i;
                const sx = (pos.getY(idxXP) - y) / (pos.getX(idxXP) - x || 1);
                const sz = (pos.getY(idxZP) - y) / (pos.getZ(idxZP) - z || 1);
                const slope = Math.sqrt(sx * sx + sz * sz) / vertExag;
                const t = Utils.clamp(slope * 2, 0, 1); // Normalize visibility
                // Green (flat) -> Red (steep)
                colors[i * 3] = t;
                colors[i * 3 + 1] = 1 - t;
                colors[i * 3 + 2] = 0.2;
            }
        }

        if (vertexColors) geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.MeshStandardMaterial({
            color: colorMode === 'static' ? staticColor : 0xffffff,
            vertexColors: vertexColors,
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide,
        });

        mesh = new THREE.Mesh(geom, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.scale.setScalar(scale);
        scene.add(mesh);

        const wfMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, wireframe: true, transparent: true, opacity: 0.15 });
        wireframeMesh = new THREE.Mesh(geom.clone(), wfMat);
        wireframeMesh.scale.setScalar(scale);
        wireframeMesh.visible = isWireframe;
        scene.add(wireframeMesh);

        createLabels(grid, rows, cols, spacing, scale, stats, vertExag);
    }

    function createLabels(grid, rows, cols, spacing, scale, stats, vertExag) {
        if (!labelContainer) return;
        labelContainer.innerHTML = '';
        labels = [];
        const physW = (cols - 1) * spacing, physH = (rows - 1) * spacing;
        const minVisualRelief = 0.1;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const elevation = grid[r][c];
                if (elevation == null) continue;
                const normalizedH = (elevation - stats.min) / (stats.relief || 1);
                const h = Math.max(normalizedH, 0);
                const y = (h + minVisualRelief * (1 - h)) * (stats.relief || 1) * vertExag;
                const worldPos = new THREE.Vector3((c * spacing) - physW / 2, y, (r * spacing) - physH / 2);

                const el = document.createElement('div');
                el.className = 'v3d-label';
                el.innerHTML = `<span class="v3d-id">${Utils.pointId(r, c)}</span><span class="v3d-elev">${elevation.toFixed(1)}</span>`;
                labelContainer.appendChild(el);
                labels.push({ el, pos: worldPos, elevation });
            }
        }
        updateLabelVisibility(currentToggles);
    }

    function updateLabelVisibility(toggles) {
        currentToggles = { ...toggles };
        labels.forEach(l => {
            l.el.style.display = (toggles.labels || toggles.elevValues) ? 'block' : 'none';
            const idS = l.el.querySelector('.v3d-id'), evS = l.el.querySelector('.v3d-elev');
            if (idS) idS.style.display = toggles.labels ? 'inline' : 'none';
            if (evS) evS.style.display = toggles.elevValues ? 'inline' : 'none';
        });
    }

    function toggleWaterMode() {
        isWaterMode = !isWaterMode;
        const btn = document.getElementById('btn-3d-water');
        if (btn) btn.classList.toggle('active-tool', isWaterMode);
        if (!isWaterMode) {
            droplets.forEach(d => d.destroy());
            droplets = [];
        }
    }

    function startRender() {
        if (!isInitialized) setup();
        isVisible = true;
        animate();
    }

    function stopRender() {
        isVisible = false;
        if (animFrameId) cancelAnimationFrame(animFrameId);
    }

    function animate() {
        if (!isVisible) return;
        animFrameId = requestAnimationFrame(animate);
        const dt = 1 / 60;

        // Simulation update
        for (let i = droplets.length - 1; i >= 0; i--) {
            if (!droplets[i].update(dt)) {
                droplets[i].destroy();
                droplets.splice(i, 1);
            }
        }

        const { theta, phi, radius } = orbitState.spherical;
        camera.position.set(
            radius * Math.sin(phi) * Math.cos(theta) + orbitState.panOffset.x,
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
        camera.lookAt(orbitState.panOffset.x, 0, 0);

        if (renderer3d) {
            renderer3d.render(scene, camera);
            if (labels.length && mesh) {
                const wHalf = labelContainer.clientWidth / 2, hHalf = labelContainer.clientHeight / 2;
                labels.forEach(l => {
                    const scaled = l.pos.clone().multiplyScalar(mesh.scale.x);
                    const vec = scaled.project(camera);
                    l.el.style.transform = `translate(-50%, -100%) translate(${(vec.x * wHalf) + wHalf}px, ${-(vec.y * hHalf) + hHalf}px)`;
                    l.el.style.opacity = vec.z < 1 ? 1 : 0;
                });
            }
        }
    }

    return {
        init, setup, buildTerrain, toggleWireframe() { isWireframe = !isWireframe; if (wireframeMesh) wireframeMesh.visible = isWireframe; },
        resetCamera() { orbitState.spherical = { theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 3 }; orbitState.panOffset = { x: 0, y: 0 }; },
        startRender, stopRender, updateLabelVisibility, toggleWaterMode
    };
})();
