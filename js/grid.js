/**
 * TerraGrid Pro — SVG Grid Renderer
 * Handles the SVG map rendering: zoom/pan, contour lines,
 * grid lines, point labels, elevation labels
 */

const GridRenderer = (() => {

    let state = null;
    let svgEl = null;
    let containerEl = null;

    // Pan/Zoom controller instance
    let pz = null;

    // The inner <g> that gets the transform
    let rootG = null;

    function init(svgId, containerId) {
        svgEl = document.getElementById(svgId);
        containerEl = document.getElementById(containerId);
        if (!svgEl || !containerEl) return;

        // Build inner group for transform
        rootG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        rootG.setAttribute('id', 'root-g');
        svgEl.innerHTML = '';
        svgEl.appendChild(rootG);

        pz = Utils.createPanZoom(svgEl, applyTransform);
    }

    function applyTransform(transform) {
        if (rootG) {
            rootG.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.scale})`);
        }
    }

    function fitToView(rows, cols, cellSize) {
        if (!svgEl || !containerEl || !pz) return;
        const cw = containerEl.clientWidth;
        const ch = containerEl.clientHeight;
        const mapW = (cols - 1) * cellSize;
        const mapH = (rows - 1) * cellSize;
        const padding = 60;
        const scale = Math.min((cw - padding * 2) / mapW, (ch - padding * 2) / mapH, 2);
        const tx = (cw - mapW * scale) / 2;
        const ty = (ch - mapH * scale) / 2;
        pz.setTransform(tx, ty, scale);
    }

    function zoom(factor) {
        if (!pz) return;
        const transform = pz.transform;
        const cw = containerEl.clientWidth;
        const ch = containerEl.clientHeight;
        const mx = cw / 2, my = ch / 2;
        const newScale = Utils.clamp(transform.scale * factor, 0.05, 40);
        const tx = mx - (mx - transform.x) * (newScale / transform.scale);
        const ty = my - (my - transform.y) * (newScale / transform.scale);
        pz.setTransform(tx, ty, newScale);
    }

    /**
     * Main render function.
     * appState contains grid data + all display toggles + contour data
     */
    function render(appState) {
        if (!rootG) return;
        state = appState;

        const { grid, rows, cols, cellSize, toggles, contours, smoothing, ramp } = appState;
        rootG.innerHTML = '';

        // Add defs for markers
        const defs = Utils.svgEl('defs');
        defs.innerHTML = `
      <marker id="arrow-head" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
        <path d="M0,0 L6,3 L0,6 Z" fill="rgba(100,200,255,0.7)"/>
      </marker>
      <filter id="elev-glow">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    `;
        rootG.appendChild(defs);

        // Background
        const bg = Utils.svgEl('rect', {
            x: -cellSize * 0.5, y: -cellSize * 0.5,
            width: (cols - 1 + 1) * cellSize, height: (rows - 1 + 1) * cellSize,
            fill: '#0d1117', rx: 8
        });
        rootG.appendChild(bg);

        // DEM fill layer (if toggle on)
        if (toggles.demFill && grid) {
            renderDEMFill(rootG, grid, rows, cols, cellSize, ramp);
        }

        // Grid lines
        if (toggles.gridLines) {
            renderGridLines(rootG, rows, cols, cellSize);
        }

        // Contour lines
        if (toggles.contours && contours && contours.length > 0) {
            renderContourLines(rootG, contours, cellSize, smoothing, toggles.contourLabels);
        }

        // Point dots
        renderPoints(rootG, grid, rows, cols, cellSize, toggles);
    }

    function renderGridLines(g, rows, cols, cs) {
        const grp = Utils.svgEl('g', { 'class': 'grid-lines' });
        for (let r = 0; r < rows; r++) {
            grp.appendChild(Utils.svgEl('line', {
                class: 'grid-line',
                x1: 0, y1: r * cs, x2: (cols - 1) * cs, y2: r * cs
            }));
        }
        for (let c = 0; c < cols; c++) {
            grp.appendChild(Utils.svgEl('line', {
                class: 'grid-line',
                x1: c * cs, y1: 0, x2: c * cs, y2: (rows - 1) * cs
            }));
        }
        g.appendChild(grp);
    }

    function renderDEMFill(g, grid, rows, cols, cs, rampName) {
        const stats = Utils.elevStats(grid);
        if (!stats) return;
        const ramp = Utils.getRamp(rampName || 'terrain');
        const grp = Utils.svgEl('g', { 'class': 'dem-cells' });

        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                const vs = [grid[r][c], grid[r][c + 1], grid[r + 1][c], grid[r + 1][c + 1]];
                if (vs.some(v => v == null)) continue;
                // Average of cell corners
                const avg = vs.reduce((a, b) => a + b, 0) / 4;
                const t = stats.relief > 0 ? (avg - stats.min) / stats.relief : 0.5;
                const color = Utils.sampleRamp(ramp, t);
                grp.appendChild(Utils.svgEl('rect', {
                    x: c * cs, y: r * cs,
                    width: cs, height: cs,
                    fill: color, opacity: '0.65'
                }));
            }
        }
        g.appendChild(grp);
    }

    function renderContourLines(g, contours, cs, smoothing, showLabels) {
        const grp = Utils.svgEl('g', { 'class': 'contour-layer' });

        for (const { level, isMajor, polylines } of contours) {
            for (const pts of polylines) {
                if (pts.length < 2) continue;

                // Scale pts from grid coords to pixel coords
                const scaledPts = pts.map(([x, y]) => [x * cs, y * cs]);
                const d = ContourEngine.polylineToPath(scaledPts, smoothing);
                if (!d) continue;

                const path = Utils.svgEl('path', {
                    d,
                    class: `contour-line ${isMajor ? 'contour-major' : 'contour-minor'}`,
                });
                grp.appendChild(path);

                // Labels on major contours
                if (showLabels && isMajor && pts.length >= 3) {
                    const midIdx = Math.floor(pts.length / 2);
                    const [mx, my] = scaledPts[midIdx];
                    const label = Utils.svgEl('text', {
                        class: 'contour-label',
                        x: mx, y: my,
                        'text-anchor': 'middle',
                        dy: '-3'
                    });
                    label.textContent = level.toFixed(3);

                    // White halo background
                    const bg = Utils.svgEl('text', {
                        class: 'contour-label',
                        x: mx, y: my,
                        'text-anchor': 'middle',
                        dy: '-3',
                        stroke: 'rgba(13,17,23,0.9)',
                        'stroke-width': '3',
                        'paint-order': 'stroke',
                        fill: 'rgba(200,220,255,0.8)'
                    });
                    bg.textContent = level.toFixed(3);
                    grp.appendChild(bg);
                    grp.appendChild(label);
                }
            }
        }

        g.appendChild(grp);
    }

    function renderPoints(g, grid, rows, cols, cs, toggles) {
        if (!grid) return;
        const stats = Utils.elevStats(grid);
        const grp = Utils.svgEl('g', { 'class': 'point-layer' });

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = grid[r][c];
                const px = c * cs, py = r * cs;
                const id = Utils.pointId(r, c);

                // Dot
                grp.appendChild(Utils.svgEl('circle', {
                    class: 'point-dot',
                    cx: px, cy: py, r: val != null ? 2.5 : 2,
                    fill: val != null ? 'rgba(59,130,246,0.8)' : 'rgba(239,68,68,0.6)'
                }));

                // Point ID label
                if (toggles.labels) {
                    const lbl = Utils.svgEl('text', {
                        class: 'point-label',
                        x: px - 4, y: py - 5,
                        'text-anchor': 'middle'
                    });
                    lbl.textContent = id;
                    grp.appendChild(lbl);
                }

                // Elevation value
                if (toggles.elevValues && val != null) {
                    const ev = Utils.svgEl('text', {
                        class: 'elev-label',
                        x: px, y: py + 14,
                        'text-anchor': 'middle'
                    });
                    ev.textContent = val.toFixed(3);
                    grp.appendChild(ev);
                }
            }
        }
        g.appendChild(grp);
    }

    return { init, render, fitToView, zoom, applyTransform };
})();
