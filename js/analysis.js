/**
 * TerraGrid Pro — Analysis Engine
 * Slope percentage map, gradient flow direction, cut & fill volumes
 */

const AnalysisEngine = (() => {

    let renderer = { svgId: null, containerId: null };

    function init(svgId, containerId) {
        renderer.svgId = svgId;
        renderer.containerId = containerId;
    }

    /**
     * Compute slope percentage (%) for each interior cell using central difference.
     * Returns 2D array of slope values.
     */
    function computeSlope(grid, rows, cols, spacing) {
        const slopes = Array.from({ length: rows }, () => Array(cols).fill(null));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const left = c > 0 ? grid[r][c - 1] : null;
                const right = c < cols - 1 ? grid[r][c + 1] : null;
                const up = r > 0 ? grid[r - 1][c] : null;
                const down = r < rows - 1 ? grid[r + 1][c] : null;

                let dzx = 0, dzy = 0, valid = true;

                if (left != null && right != null) {
                    dzx = (right - left) / (2 * spacing);
                } else if (right != null && grid[r][c] != null) {
                    dzx = (right - grid[r][c]) / spacing;
                } else if (left != null && grid[r][c] != null) {
                    dzx = (grid[r][c] - left) / spacing;
                } else { valid = false; }

                if (up != null && down != null) {
                    dzy = (down - up) / (2 * spacing);
                } else if (down != null && grid[r][c] != null) {
                    dzy = (down - grid[r][c]) / spacing;
                } else if (up != null && grid[r][c] != null) {
                    dzy = (grid[r][c] - up) / spacing;
                } else { valid = valid && false; }

                if (valid && grid[r][c] != null) {
                    const grad = Math.sqrt(dzx * dzx + dzy * dzy);
                    slopes[r][c] = grad * 100; // percent
                }
            }
        }
        return slopes;
    }

    /**
     * Compute flow direction (angle in radians) for each cell.
     * Direction of steepest descent.
     */
    function computeFlowDirection(grid, rows, cols, spacing) {
        const flow = Array.from({ length: rows }, () => Array(cols).fill(null));

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (grid[r][c] == null) continue;

                // Find neighbor with lowest elevation
                let minDrop = 0, minDr = 0, minDc = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        if (dr === 0 && dc === 0) continue;
                        const nr = r + dr, nc = c + dc;
                        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
                        if (grid[nr][nc] == null) continue;

                        const dist = spacing * Math.sqrt(dr * dr + dc * dc);
                        const drop = (grid[r][c] - grid[nr][nc]) / dist;
                        if (drop > minDrop) {
                            minDrop = drop;
                            minDr = dr;
                            minDc = dc;
                        }
                    }
                }
                if (minDrop > 0) {
                    flow[r][c] = Math.atan2(minDr, minDc); // angle in radians
                }
            }
        }
        return flow;
    }

    /**
     * Calculate cut & fill volumes above/below a datum elevation.
     * Uses trapezoidal rule on the grid cells.
     */
    function computeCutFill(grid, rows, cols, spacing, datum) {
        let cutVol = 0, fillVol = 0;
        const cellArea = spacing * spacing;

        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                // Average elevation of cell corners
                const vs = [grid[r][c], grid[r][c + 1], grid[r + 1][c], grid[r + 1][c + 1]];
                if (vs.some(v => v == null)) continue;
                const avg = vs.reduce((a, b) => a + b, 0) / 4;
                const diff = avg - datum;
                const vol = Math.abs(diff) * cellArea;
                if (diff > 0) cutVol += vol;
                else fillVol += vol;
            }
        }

        const net = cutVol - fillVol;
        return { cutVol, fillVol, netVol: net };
    }

    // ---- SVG Rendering ----

    function renderSlope(appState) {
        const { grid, rows, cols, cellSize, spacing } = appState;
        const svgEl = document.getElementById(renderer.svgId);
        if (!svgEl || !grid) return;

        const slopes = computeSlope(grid, rows, cols, spacing);
        const allSlopes = slopes.flat().filter(v => v != null);
        if (!allSlopes.length) return;
        const maxSlope = Math.max(...allSlopes);
        const meanSlope = allSlopes.reduce((a, b) => a + b, 0) / allSlopes.length;

        svgEl.innerHTML = '';
        const g = Utils.svgEl('g');

        // Color ramp for slope: white (flat) → yellow → orange → red (steep)
        const slopeRamp = [[240, 245, 255], [120, 200, 100], [255, 220, 60], [255, 120, 30], [200, 30, 30]];

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const s = slopes[r][c];
                if (s == null) continue;
                const t = maxSlope > 0 ? Utils.clamp(s / maxSlope, 0, 1) : 0;
                const color = Utils.sampleRamp(slopeRamp, t);
                g.appendChild(Utils.svgEl('rect', {
                    x: c * cellSize, y: r * cellSize,
                    width: cellSize, height: cellSize,
                    fill: color, opacity: '0.8'
                }));
                // Value label
                if (cellSize > 30) {
                    const lbl = Utils.svgEl('text', {
                        x: c * cellSize + cellSize / 2, y: r * cellSize + cellSize / 2 + 4,
                        'text-anchor': 'middle',
                        'font-family': 'JetBrains Mono, monospace',
                        'font-size': '10',
                        fill: t > 0.5 ? '#fff' : '#333'
                    });
                    lbl.textContent = s.toFixed(1) + '%';
                    g.appendChild(lbl);
                }
            }
        }
        svgEl.appendChild(g);
        fitSVG(svgEl, rows, cols, cellSize);

        // Update stats
        document.getElementById('slope-max').textContent = maxSlope.toFixed(1) + '%';
        document.getElementById('slope-mean').textContent = meanSlope.toFixed(1) + '%';

        // Render legend
        renderSlopeLegend(slopeRamp, maxSlope);

        return { maxSlope, meanSlope, slopes };
    }

    function renderSlopeLegend(ramp, maxSlope) {
        const el = document.getElementById('slope-legend');
        if (!el) return;
        const labels = [0, 0.25, 0.5, 0.75, 1];
        el.innerHTML = labels.map(t => {
            const color = Utils.sampleRamp(ramp, t);
            const val = (t * maxSlope).toFixed(1);
            return `<div class="slope-legend-item">
        <div class="slope-legend-swatch" style="background:${color}"></div>
        <span>${val}%</span>
      </div>`;
        }).join('');
    }

    function renderFlow(appState) {
        const { grid, rows, cols, cellSize, spacing } = appState;
        const svgEl = document.getElementById(renderer.svgId);
        if (!svgEl || !grid) return;

        const flow = computeFlowDirection(grid, rows, cols, spacing);
        svgEl.innerHTML = '';
        const g = Utils.svgEl('g');

        // Light background
        g.appendChild(Utils.svgEl('rect', {
            x: 0, y: 0,
            width: (cols - 1) * cellSize + cellSize,
            height: (rows - 1) * cellSize + cellSize,
            fill: '#0d1a2a'
        }));

        // Grid lines
        for (let r = 0; r <= rows - 1; r++) {
            g.appendChild(Utils.svgEl('line', {
                x1: 0, y1: r * cellSize, x2: (cols - 1) * cellSize, y2: r * cellSize,
                stroke: 'rgba(255,255,255,0.05)', 'stroke-width': '0.5'
            }));
        }
        for (let c = 0; c <= cols - 1; c++) {
            g.appendChild(Utils.svgEl('line', {
                x1: c * cellSize, y1: 0, x2: c * cellSize, y2: (rows - 1) * cellSize,
                stroke: 'rgba(255,255,255,0.05)', 'stroke-width': '0.5'
            }));
        }

        const defs = Utils.svgEl('defs');
        defs.innerHTML = `<marker id="flow-arrow" markerWidth="5" markerHeight="5" refX="2.5" refY="2.5" orient="auto">
      <path d="M0,0 L5,2.5 L0,5 Z" fill="rgba(100,200,255,0.8)"/>
    </marker>`;
        svgEl.appendChild(defs);

        const arrowLen = cellSize * 0.4;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const angle = flow[r][c];
                if (angle == null) continue;
                const cx = c * cellSize, cy = r * cellSize;
                const ex = cx + Math.cos(angle) * arrowLen;
                const ey = cy + Math.sin(angle) * arrowLen;

                g.appendChild(Utils.svgEl('line', {
                    x1: cx, y1: cy, x2: ex, y2: ey,
                    stroke: 'rgba(100,200,255,0.7)',
                    'stroke-width': '1.5',
                    'marker-end': 'url(#flow-arrow)',
                    'stroke-linecap': 'round'
                }));

                // Point dot
                g.appendChild(Utils.svgEl('circle', {
                    cx, cy, r: 2.5,
                    fill: 'rgba(59,130,246,0.6)'
                }));
            }
        }
        svgEl.appendChild(g);
        fitSVG(svgEl, rows, cols, cellSize);
    }

    function renderCutFill(appState, datum) {
        const { grid, rows, cols, cellSize, spacing } = appState;
        const svgEl = document.getElementById(renderer.svgId);
        if (!svgEl || !grid) return;

        svgEl.innerHTML = '';
        const g = Utils.svgEl('g');

        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                const vs = [grid[r][c], grid[r][c + 1], grid[r + 1][c], grid[r + 1][c + 1]];
                if (vs.some(v => v == null)) continue;
                const avg = vs.reduce((a, b) => a + b, 0) / 4;
                const diff = avg - datum;
                const intensity = Math.min(Math.abs(diff) / 5, 1);
                let color;
                if (diff > 0) {
                    color = `rgba(239,68,68,${0.2 + intensity * 0.6})`;  // Red = cut
                } else {
                    color = `rgba(34,197,94,${0.2 + intensity * 0.6})`;  // Green = fill
                }
                g.appendChild(Utils.svgEl('rect', {
                    x: c * cellSize, y: r * cellSize,
                    width: cellSize, height: cellSize,
                    fill: color
                }));
                if (cellSize > 28) {
                    const lbl = Utils.svgEl('text', {
                        x: c * cellSize + cellSize / 2, y: r * cellSize + cellSize / 2 + 4,
                        'text-anchor': 'middle',
                        'font-size': '9',
                        'font-family': 'JetBrains Mono, monospace',
                        fill: 'rgba(255,255,255,0.8)'
                    });
                    lbl.textContent = (diff > 0 ? '+' : '') + diff.toFixed(1);
                    g.appendChild(lbl);
                }
            }
        }
        svgEl.appendChild(g);
        fitSVG(svgEl, rows, cols, cellSize);

        const result = computeCutFill(grid, rows, cols, spacing, datum);
        return result;
    }

    function fitSVG(svgEl, rows, cols, cellSize) {
        const pad = cellSize * 0.5;
        const W = (cols - 1) * cellSize + pad * 2;
        const H = (rows - 1) * cellSize + pad * 2;
        svgEl.setAttribute('viewBox', `-${pad} -${pad} ${W} ${H}`);
        svgEl.setAttributeNS(null, 'preserveAspectRatio', 'xMidYMid meet');
    }

    return { init, computeSlope, computeFlowDirection, computeCutFill, renderSlope, renderFlow, renderCutFill };
})();
