/**
 * TerraGrid Pro — DEM Renderer
 * Color-filled Digital Elevation Model with gradient legend
 */

const DEMRenderer = (() => {
    let svgId = null, containerId = null;
    let rootG = null;
    let pz = null;

    function init(sId, cId) {
        svgId = sId;
        containerId = cId;
        const svgEl = document.getElementById(svgId);
        if (!svgEl) return;

        svgEl.innerHTML = '';
        rootG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        rootG.setAttribute('id', 'dem-root-g');
        svgEl.appendChild(rootG);

        pz = Utils.createPanZoom(svgEl, applyTransform);
    }

    function applyTransform(transform) {
        if (rootG) {
            rootG.setAttribute('transform', `translate(${transform.x},${transform.y}) scale(${transform.scale})`);
        }
    }

    function fitToView(rows, cols, cellSize) {
        const svgEl = document.getElementById(svgId);
        const containerEl = document.getElementById(containerId);
        if (!svgEl || !containerEl || !pz) return;

        const cw = containerEl.clientWidth;
        const ch = containerEl.clientHeight;
        const mapW = (cols - 1) * cellSize;
        const mapH = (rows - 1) * cellSize;
        const padding = 40;
        const scale = Math.min((cw - padding * 2) / mapW, (ch - padding * 2) / mapH, 2);
        const tx = (cw - mapW * scale) / 2;
        const ty = (ch - mapH * scale) / 2;
        pz.setTransform(tx, ty, scale);
    }

    function render(appState) {
        const { grid, rows, cols, cellSize, ramp } = appState;
        const svgEl = document.getElementById(svgId);
        if (!svgEl || !grid || !rootG) return;

        const stats = Utils.elevStats(grid);
        if (!stats) return;

        const colorRamp = Utils.getRamp(ramp || 'terrain');
        rootG.innerHTML = '';

        const defs = Utils.svgEl('defs');
        // Define clip-path for rounded corners
        defs.innerHTML = `<clipPath id="dem-clip"><rect width="${(cols - 1) * cellSize}" height="${(rows - 1) * cellSize}" rx="6"/></clipPath>`;
        rootG.appendChild(defs);

        const g = Utils.svgEl('g');

        // Render per-cell color based on average elevation
        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                const vs = [grid[r][c], grid[r][c + 1], grid[r + 1][c], grid[r + 1][c + 1]];
                if (vs.some(v => v == null)) {
                    // Render missing cell with hatching
                    g.appendChild(Utils.svgEl('rect', {
                        x: c * cellSize, y: r * cellSize,
                        width: cellSize, height: cellSize,
                        fill: '#1a1a2e', stroke: 'rgba(255,255,255,0.05)', 'stroke-width': '0.5'
                    }));
                    continue;
                }
                const avg = vs.reduce((a, b) => a + b, 0) / 4;
                const t = stats.relief > 0 ? (avg - stats.min) / stats.relief : 0.5;
                const color = Utils.sampleRamp(colorRamp, t);

                g.appendChild(Utils.svgEl('rect', {
                    x: c * cellSize, y: r * cellSize,
                    width: cellSize + 0.5, height: cellSize + 0.5,
                    fill: color
                }));
            }
        }

        // Grid lines overlay
        for (let r = 0; r <= rows - 1; r++) {
            g.appendChild(Utils.svgEl('line', {
                x1: 0, y1: r * cellSize, x2: (cols - 1) * cellSize, y2: r * cellSize,
                stroke: 'rgba(0,0,0,0.15)', 'stroke-width': '0.5'
            }));
        }
        for (let c = 0; c <= cols - 1; c++) {
            g.appendChild(Utils.svgEl('line', {
                x1: c * cellSize, y1: 0, x2: c * cellSize, y2: (rows - 1) * cellSize,
                stroke: 'rgba(0,0,0,0.15)', 'stroke-width': '0.5'
            }));
        }

        // Point elevation labels
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = grid[r][c];
                if (val == null) continue;
                const t = stats.relief > 0 ? (val - stats.min) / stats.relief : 0.5;
                const textColor = t > 0.5 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.85)';

                const dot = Utils.svgEl('circle', {
                    cx: c * cellSize, cy: r * cellSize, r: 3,
                    fill: 'rgba(255,255,255,0.3)',
                    stroke: 'rgba(0,0,0,0.3)', 'stroke-width': '0.5'
                });
                g.appendChild(dot);

                if (cellSize > 24) {
                    const lbl = Utils.svgEl('text', {
                        x: c * cellSize, y: r * cellSize + 12,
                        'text-anchor': 'middle',
                        'font-family': 'JetBrains Mono, monospace',
                        'font-size': '9',
                        fill: textColor,
                        'font-weight': '600'
                    });
                    lbl.textContent = val.toFixed(1);
                    g.appendChild(lbl);
                }
            }
        }

        rootG.appendChild(g);

        // Fix svg display for better interaction
        const containerEl = document.getElementById(containerId);
        if (containerEl) {
            svgEl.style.width = containerEl.clientWidth + 'px';
            svgEl.style.height = containerEl.clientHeight + 'px';
            svgEl.setAttribute('viewBox', `0 0 ${containerEl.clientWidth} ${containerEl.clientHeight}`);
        }

        // Render legend
        renderLegend(stats, colorRamp, appState.units || 'm');
    }

    function renderLegend(stats, ramp, units) {
        const legendEl = document.getElementById('dem-legend-bar');
        if (!legendEl) return;

        // Build a vertical gradient bar using canvas
        const canvas = document.createElement('canvas');
        canvas.width = 20;
        canvas.height = 120;
        const ctx = canvas.getContext('2d');
        for (let y = 0; y < 120; y++) {
            const t = 1 - y / 119; // top = max
            const color = Utils.sampleRamp(ramp, t);
            ctx.fillStyle = color;
            ctx.fillRect(0, y, 20, 1);
        }

        const numLabels = 5;
        const labelItems = Array.from({ length: numLabels }, (_, i) => {
            const t = i / (numLabels - 1);
            const val = stats.max - t * stats.relief;
            return `<div style="font-size:10px;font-family:JetBrains Mono,monospace;color:#8b949e">${val.toFixed(1)}${units}</div>`;
        });

        legendEl.innerHTML = `
      <div style="font-size:10px;font-weight:600;color:#8b949e;margin-bottom:6px">Elevation</div>
      <div class="dem-legend-inner">
        <img src="${canvas.toDataURL()}" class="legend-gradient" width="20" height="120"/>
        <div class="legend-labels">${labelItems.join('')}</div>
      </div>
    `;
    }

    return { init, render, fitToView };
})();
