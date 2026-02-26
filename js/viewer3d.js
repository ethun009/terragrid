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
    let labels = []; // Array of { el, position, elevation }
    let labelContainer = null;
    let currentToggles = { labels: true, elevValues: true };

    // Orbit Controls (inline simple implementation)
    let orbitState = {
        isRotating: false,
        isPanning: false,
        lastMouse: { x: 0, y: 0 },
        spherical: { theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 3 },
        panOffset: { x: 0, y: 0 }
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

        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080c10);
        scene.fog = new THREE.Fog(0x080c10, 8, 20);

        // Camera
        camera = new THREE.PerspectiveCamera(50, w / h, 0.01, 1000);

        // Renderer
        renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer3d.setSize(w, h);
        renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer3d.shadowMap.enabled = true;
        renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;

        // Lights
        const ambientLight = new THREE.AmbientLight(0x224466, 0.8);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.5);
        sunLight.position.set(3, 5, 2);
        sunLight.castShadow = true;
        scene.add(sunLight);

        const fillLight = new THREE.DirectionalLight(0x3060aa, 0.4);
        fillLight.position.set(-2, 2, -3);
        scene.add(fillLight);

        // Grid helper
        const gridHelper = new THREE.GridHelper(6, 12, 0x1c3050, 0x1c3050);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);

        // Setup orbit controls
        setupOrbitControls(canvas);

        // Handle resize
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

    function setupOrbitControls(canvas) {
        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) orbitState.isRotating = true;
            if (e.button === 2) orbitState.isPanning = true;
            orbitState.lastMouse = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => {
            orbitState.isRotating = false;
            orbitState.isPanning = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (!orbitState.isRotating && !orbitState.isPanning) return;
            const dx = e.clientX - orbitState.lastMouse.x;
            const dy = e.clientY - orbitState.lastMouse.y;
            orbitState.lastMouse = { x: e.clientX, y: e.clientY };

            if (orbitState.isRotating) {
                orbitState.spherical.theta -= dx * 0.008;
                orbitState.spherical.phi = Utils.clamp(
                    orbitState.spherical.phi + dy * 0.008,
                    0.1, Math.PI - 0.1
                );
            }
            if (orbitState.isPanning) {
                orbitState.panOffset.x -= dx * 0.005;
                orbitState.panOffset.y += dy * 0.005;
            }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            orbitState.spherical.radius = Utils.clamp(
                orbitState.spherical.radius * (e.deltaY > 0 ? 1.15 : 0.87),
                0.5, 20
            );
        }, { passive: false });

        canvas.addEventListener('contextmenu', e => e.preventDefault());

        // ---- Touch Controls ----
        let touchState = {
            touches: [],
            lastDist: 0,    // for pinch zoom
            lastMidX: 0,    // for 2-finger pan
            lastMidY: 0
        };

        function getTouchMid(touches) {
            return {
                x: (touches[0].clientX + touches[1].clientX) / 2,
                y: (touches[0].clientY + touches[1].clientY) / 2
            };
        }

        function getTouchDist(touches) {
            const dx = touches[1].clientX - touches[0].clientX;
            const dy = touches[1].clientY - touches[0].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            touchState.touches = Array.from(e.touches);
            if (e.touches.length === 1) {
                orbitState.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                touchState.lastDist = getTouchDist(e.touches);
                const mid = getTouchMid(e.touches);
                touchState.lastMidX = mid.x;
                touchState.lastMidY = mid.y;
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                // 1 finger → rotate
                const dx = e.touches[0].clientX - orbitState.lastMouse.x;
                const dy = e.touches[0].clientY - orbitState.lastMouse.y;
                orbitState.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                orbitState.spherical.theta -= dx * 0.008;
                orbitState.spherical.phi = Utils.clamp(
                    orbitState.spherical.phi + dy * 0.008,
                    0.1, Math.PI - 0.1
                );
            } else if (e.touches.length === 2) {
                // 2 fingers → pinch zoom + pan
                const dist = getTouchDist(e.touches);
                const scale = touchState.lastDist > 0 ? touchState.lastDist / dist : 1;
                orbitState.spherical.radius = Utils.clamp(
                    orbitState.spherical.radius * scale,
                    0.5, 20
                );
                touchState.lastDist = dist;

                const mid = getTouchMid(e.touches);
                const dx = mid.x - touchState.lastMidX;
                const dy = mid.y - touchState.lastMidY;
                touchState.lastMidX = mid.x;
                touchState.lastMidY = mid.y;
                orbitState.panOffset.x -= dx * 0.005;
                orbitState.panOffset.y += dy * 0.005;
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            touchState.touches = Array.from(e.touches);
            if (e.touches.length === 1) {
                orbitState.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            touchState.lastDist = 0;
        }, { passive: true });
    }

    function updateCamera() {
        const { theta, phi, radius } = orbitState.spherical;
        camera.position.set(
            radius * Math.sin(phi) * Math.cos(theta) + orbitState.panOffset.x,
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
        camera.lookAt(orbitState.panOffset.x, 0, 0);
    }

    function buildTerrain(grid, rows, cols, spacing, vertExag) {
        if (!isInitialized) return;

        // Remove existing mesh
        if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; }
        if (wireframeMesh) { scene.remove(wireframeMesh); wireframeMesh.geometry.dispose(); wireframeMesh = null; }

        const stats = Utils.elevStats(grid);
        if (!stats || stats.count < 4) return;

        const widthSeg = cols - 1;
        const heightSeg = rows - 1;

        // Physical dimensions in real-world units
        const physW = (cols - 1) * spacing;
        const physH = (rows - 1) * spacing;

        // Uniform scale: map the largest horizontal dimension to 2 world units
        const maxDim = Math.max(physW, physH);
        const scale = 2.0 / maxDim;

        // PlaneGeometry is created in physical units, rotated flat (XZ plane).
        // After rotateX(-PI/2):
        //   X ranges from  -physW/2  to  +physW/2
        //   Z ranges from  -physH/2  to  +physH/2
        const geom = new THREE.PlaneGeometry(physW, physH, widthSeg, heightSeg);
        geom.rotateX(-Math.PI / 2);

        // ---- FIX 1: correct XZ → grid-index mapping -------------------------
        // pos.getX(i) is already in physical units (geometry NOT yet scaled).
        //   col = (x + physW/2) / spacing
        //   row = (z + physH/2) / spacing
        // -----------------------------------------------------------------------

        // Ensure the relief is visually significant: guarantee at least 10% of
        // the horizontal span as height range (before vert-exag). This prevents
        // completely flat-looking meshes when relief is tiny (e.g. 0.6 m / 50 m).
        const minVisualRelief = 0.1; // 10% of normalised horizontal unit
        const effectiveRelief = stats.relief > 0 ? stats.relief : 1;

        const pos = geom.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const gx = pos.getX(i);   // physical coords, centred at 0
            const gz = pos.getZ(i);

            // Convert to 0-based grid indices
            const c = Math.round((gx + physW / 2) / spacing);
            const r = Math.round((gz + physH / 2) / spacing);
            const cc = Utils.clamp(c, 0, cols - 1);
            const cr = Utils.clamp(r, 0, rows - 1);

            const elevation = (grid[cr] && grid[cr][cc] != null) ? grid[cr][cc] : stats.mean;

            // ---- FIX 2: set height in physical units; do NOT pre-multiply by
            // scale.  mesh.scale.setScalar(scale) will scale X, Y, Z uniformly.
            // Pre-multiplying made effective height = h * scale², i.e. ~1600× too
            // small for a 50 m grid (scale = 0.04 → scale² = 0.0016).
            const normalizedH = (elevation - stats.min) / effectiveRelief;

            // Guard: never exactly zero height range — lift by minVisualRelief
            const h = Math.max(normalizedH, 0);
            pos.setY(i, (h + minVisualRelief * (1 - h)) * effectiveRelief * vertExag);
        }
        pos.needsUpdate = true;
        geom.computeVertexNormals();

        // Vertex colours by normalised elevation
        const colors = new Float32Array(pos.count * 3);
        const rampStops = Utils.getRamp('terrain');
        const maxY = pos.array.reduce((m, v, i) => i % 3 === 1 ? Math.max(m, v) : m, 0);
        const minY = pos.array.reduce((m, v, i) => i % 3 === 1 ? Math.min(m, v) : m, Infinity);

        for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i);
            const t = (maxY > minY) ? Utils.clamp((y - minY) / (maxY - minY), 0, 1) : 0.5;
            const colorStr = Utils.sampleRamp(rampStops, t);
            const match = colorStr.match(/\d+/g);
            if (match && match.length >= 3) {
                colors[i * 3] = parseInt(match[0]) / 255;
                colors[i * 3 + 1] = parseInt(match[1]) / 255;
                colors[i * 3 + 2] = parseInt(match[2]) / 255;
            }
        }
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Material
        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.65,
            metalness: 0.05,
            side: THREE.DoubleSide,
        });

        mesh = new THREE.Mesh(geom, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.scale.setScalar(scale);   // uniform scale: X,Y,Z all × scale
        scene.add(mesh);

        // Wireframe overlay (shares same geometry object)
        const wfMat = new THREE.MeshBasicMaterial({
            color: 0x3b82f6, wireframe: true, transparent: true, opacity: 0.18,
        });
        wireframeMesh = new THREE.Mesh(geom.clone(), wfMat);
        wireframeMesh.scale.setScalar(scale);
        wireframeMesh.visible = isWireframe;
        scene.add(wireframeMesh);

        // Position camera to frame the mesh nicely
        const heightSpan = (maxY - minY) * scale;
        orbitState.spherical.radius = Math.max(2.5, 2 + heightSpan * 4);
        orbitState.spherical.phi = Math.PI / 3.5;
        orbitState.panOffset = { x: 0, y: heightSpan * 0.5 };

        // Create HTML labels
        createLabels(grid, rows, cols, spacing, scale, stats, vertExag);
    }

    function createLabels(grid, rows, cols, spacing, scale, stats, vertExag) {
        if (!labelContainer) return;
        labelContainer.innerHTML = '';
        labels = [];

        const physW = (cols - 1) * spacing;
        const physH = (rows - 1) * spacing;
        const minVisualRelief = 0.1;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const elevation = grid[r][c];
                if (elevation == null) continue;

                const id = Utils.pointId(r, c, cols);
                const normalizedH = (elevation - stats.min) / (stats.relief || 1);
                const h = Math.max(normalizedH, 0);
                const y = (h + minVisualRelief * (1 - h)) * (stats.relief || 1) * vertExag;

                // World position in physical units (before mesh.scale)
                const worldPos = new THREE.Vector3(
                    (c * spacing) - physW / 2,
                    y,
                    (r * spacing) - physH / 2
                );

                const el = document.createElement('div');
                el.className = 'v3d-label';
                el.innerHTML = `<span class="v3d-id">${id}</span><span class="v3d-elev">${elevation.toFixed(3)}</span>`;
                labelContainer.appendChild(el);

                labels.push({
                    el: el,
                    pos: worldPos,
                    elevation: elevation,
                    id: id
                });
            }
        }
        updateLabelVisibility(currentToggles);
    }

    function updateLabelVisibility(toggles) {
        currentToggles = { ...toggles };
        labels.forEach(l => {
            const showID = currentToggles.labels;
            const showElev = currentToggles.elevValues;

            if (!showID && !showElev) {
                l.el.style.display = 'none';
                return;
            }

            l.el.style.display = 'block';
            const idSpan = l.el.querySelector('.v3d-id');
            const elevSpan = l.el.querySelector('.v3d-elev');

            if (idSpan) idSpan.style.display = showID ? 'inline' : 'none';
            if (elevSpan) elevSpan.style.display = showElev ? 'inline' : 'none';
        });
    }

    function updateLabels() {
        if (!isVisible || !labels.length || !labelContainer || !mesh) return;

        const widthHalf = labelContainer.clientWidth / 2;
        const heightHalf = labelContainer.clientHeight / 2;

        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(matrix);

        labels.forEach(l => {
            // Apply mesh scale to word position for projection
            const scaledPos = l.pos.clone().multiplyScalar(mesh.scale.x);

            // Check if point is in view and not blocked by the terrain itself
            // (Simple check: points behind camera are hidden by project())
            if (!frustum.containsPoint(scaledPos)) {
                l.el.style.opacity = '0';
                return;
            }

            const vector = scaledPos.project(camera);
            const x = (vector.x * widthHalf) + widthHalf;
            const y = -(vector.y * heightHalf) + heightHalf;

            l.el.style.opacity = '1';
            l.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
        });
    }

    function toggleWireframe() {
        isWireframe = !isWireframe;
        if (wireframeMesh) wireframeMesh.visible = isWireframe;
        if (mesh) mesh.material.wireframe = isWireframe;
    }

    function resetCamera() {
        orbitState.spherical = { theta: Math.PI / 4, phi: Math.PI / 3.5, radius: 3 };
        orbitState.panOffset = { x: 0, y: 0 };
    }

    function startRender() {
        if (!isInitialized) setup();
        isVisible = true;
        if (animFrameId) cancelAnimationFrame(animFrameId);
        animate();
    }

    function stopRender() {
        isVisible = false;
        if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
        }
    }

    function animate() {
        if (!isVisible) return;
        animFrameId = requestAnimationFrame(animate);
        updateCamera();
        if (renderer3d && scene && camera) {
            renderer3d.render(scene, camera);
            updateLabels();
        }
    }

    return { init, setup, buildTerrain, toggleWireframe, resetCamera, startRender, stopRender, updateLabelVisibility };
})();
