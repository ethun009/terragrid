/**
 * TerraGrid Pro — Utilities Module
 * Shared helpers: point ID generation, math, interpolation
 */

const Utils = (() => {
    // Generate Excel-like column label: 0→A, 1→B, ..., 25→Z, 26→AA ...
    function colLabel(idx) {
        let label = '';
        let num = idx;
        do {
            label = String.fromCharCode(65 + (num % 26)) + label;
            num = Math.floor(num / 26) - 1;
        } while (num >= 0);
        return label;
    }

    // Generate point ID: row 0 col 0 → A1
    function pointId(row, col) {
        return colLabel(col) + (row + 1);
    }

    // Bilinear interpolation in a grid
    function bilinearInterp(grid, rows, cols, r, c) {
        const r0 = Math.floor(r), c0 = Math.floor(c);
        const r1 = Math.min(r0 + 1, rows - 1), c1 = Math.min(c0 + 1, cols - 1);
        const fr = r - r0, fc = c - c0;
        const v00 = grid[r0][c0], v01 = grid[r0][c1];
        const v10 = grid[r1][c0], v11 = grid[r1][c1];
        if (v00 == null || v01 == null || v10 == null || v11 == null) return null;
        return v00 * (1 - fr) * (1 - fc) + v01 * (1 - fr) * fc + v10 * fr * (1 - fc) + v11 * fr * fc;
    }

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    function lerp(a, b, t) { return a + (b - a) * t; }

    function lerpColor(c1, c2, t) {
        return [
            Math.round(lerp(c1[0], c2[0], t)),
            Math.round(lerp(c1[1], c2[1], t)),
            Math.round(lerp(c1[2], c2[2], t))
        ];
    }

    // Sample a multi-stop color ramp
    function sampleRamp(ramp, t) {
        t = clamp(t, 0, 1);
        const n = ramp.length - 1;
        const idx = t * n;
        const lo = Math.floor(idx), hi = Math.min(lo + 1, n);
        const f = idx - lo;
        const c = lerpColor(ramp[lo], ramp[hi], f);
        return `rgb(${c[0]},${c[1]},${c[2]})`;
    }

    // Predefined color ramps [R,G,B] stops
    const RAMPS = {
        terrain: [
            [20, 60, 120],   // deep blue
            [58, 120, 180],  // blue
            [80, 170, 100],  // green
            [120, 180, 70],  // light green
            [180, 170, 80],  // yellow
            [170, 100, 50],  // brown
            [200, 160, 130], // tan
            [240, 240, 240], // white (peaks)
        ],
        viridis: [
            [68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]
        ],
        plasma: [
            [13, 8, 135], [126, 3, 167], [203, 71, 120], [248, 149, 64], [240, 249, 33]
        ],
        grayscale: [[20, 20, 25], [240, 240, 245]],
        rdbu: [
            [178, 24, 43], [244, 165, 130], [247, 247, 247], [146, 197, 222], [33, 102, 172]
        ]
    };

    function getRamp(name) { return RAMPS[name] || RAMPS.terrain; }

    // Grid elevation stats
    function elevStats(data) {
        const vals = data.flat().filter(v => v != null && !isNaN(v));
        if (!vals.length) return null;
        const min = Math.min(...vals), max = Math.max(...vals);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return { min, max, mean, relief: max - min, count: vals.length };
    }

    // Round to n decimals
    function round(v, n = 3) { return Math.round(v * Math.pow(10, n)) / Math.pow(10, n); }

    // SVG namespace helper
    function svgEl(tag, attrs = {}, children = []) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        for (const c of children) el.appendChild(c);
        return el;
    }

    // Create a canvas-friendly gradient from ramp
    function makeCanvasGradient(ctx, ramp, x0, y0, x1, y1) {
        const grad = ctx.createLinearGradient(x0, y0, x1, y1);
        const stops = ramp.length;
        ramp.forEach((c, i) => {
            grad.addColorStop(i / (stops - 1), `rgb(${c[0]},${c[1]},${c[2]})`);
        });
        return grad;
    }

    // Parse numeric safely
    function parseElev(v) {
        const n = parseFloat(v);
        return isNaN(n) ? null : n;
    }

    // Create a pan/zoom controller for an SVG element
    function createPanZoom(svgEl, onTransform) {
        const transform = { x: 0, y: 0, scale: 1 };
        let isDragging = false;
        let dragStart = { x: 0, y: 0, tx: 0, ty: 0 };

        // Wheel zoom
        svgEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = svgEl.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
            const newScale = clamp(transform.scale * factor, 0.05, 40);
            transform.x = mx - (mx - transform.x) * (newScale / transform.scale);
            transform.y = my - (my - transform.y) * (newScale / transform.scale);
            transform.scale = newScale;
            onTransform(transform);
        }, { passive: false });

        // Pan
        svgEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = true;
            dragStart = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
            svgEl.style.cursor = 'grabbing';
        });

        const onMouseMove = (e) => {
            if (!isDragging) return;
            transform.x = dragStart.tx + (e.clientX - dragStart.x);
            transform.y = dragStart.ty + (e.clientY - dragStart.y);
            onTransform(transform);
        };

        const onMouseUp = () => {
            isDragging = false;
            svgEl.style.cursor = 'grab';
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // Touch support
        let lastTouch = null;
        let lastTouchDist = 0;

        svgEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                lastTouchDist = 0;
                e.preventDefault();
            } else if (e.touches.length === 2) {
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                lastTouchDist = Math.sqrt(dx * dx + dy * dy);
                lastTouch = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };
                e.preventDefault();
            }
        }, { passive: false });

        svgEl.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && lastTouch) {
                const dx = e.touches[0].clientX - lastTouch.x;
                const dy = e.touches[0].clientY - lastTouch.y;
                transform.x += dx;
                transform.y += dy;
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                onTransform(transform);
            } else if (e.touches.length === 2) {
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

                if (lastTouchDist > 0) {
                    const factor = dist / lastTouchDist;
                    const rect = svgEl.getBoundingClientRect();
                    const mx = midX - rect.left;
                    const my = midY - rect.top;
                    const newScale = clamp(transform.scale * factor, 0.05, 40);
                    transform.x = mx - (mx - transform.x) * (newScale / transform.scale);
                    transform.y = my - (my - transform.y) * (newScale / transform.scale);
                    transform.scale = newScale;
                }
                if (lastTouch) {
                    transform.x += midX - lastTouch.x;
                    transform.y += midY - lastTouch.y;
                }
                lastTouchDist = dist;
                lastTouch = { x: midX, y: midY };
                onTransform(transform);
            }
        }, { passive: false });

        svgEl.addEventListener('touchend', (e) => {
            if (e.touches.length === 1) {
                lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                lastTouchDist = 0;
            } else {
                lastTouch = null;
                lastTouchDist = 0;
            }
        }, { passive: true });

        return {
            get transform() { return transform; },
            setTransform(x, y, scale) {
                transform.x = x;
                transform.y = y;
                transform.scale = scale;
                onTransform(transform);
            }
        };
    }

    return {
        colLabel, pointId, bilinearInterp, clamp, lerp, lerpColor,
        sampleRamp, getRamp, RAMPS, elevStats, round, svgEl, parseElev, makeCanvasGradient,
        createPanZoom
    };
})();
