/**
 * TerraGrid Pro — Contour Engine
 * Implements Marching Squares algorithm with path merging,
 * bezier smoothing, and contour labeling
 */

const ContourEngine = (() => {

    // Lookup table for Marching Squares: 16 cases → edge segments
    // Each case produces 0, 1, or 2 line segments between edge midpoints
    // Edge numbering: 0=top, 1=right, 2=bottom, 3=left
    const MS_SEGMENTS = {
        0: [],
        1: [[3, 2]],
        2: [[2, 1]],
        3: [[3, 1]],
        4: [[0, 1]],
        5: [[3, 0], [2, 1]],  // ambiguous - use linear interpolation to resolve
        6: [[0, 2]],
        7: [[3, 0]],
        8: [[3, 0]],
        9: [[0, 2]],
        10: [[0, 3], [1, 2]],  // ambiguous
        11: [[0, 1]],
        12: [[3, 1]],
        13: [[2, 1]],
        14: [[3, 2]],
        15: [],
    };

    // Edge midpoint coordinates for a cell (fraction along edge)
    // Edges : 0=top(x interp,y=0), 1=right(x=1,y interp), 2=bottom(x interp, y=1), 3=left(x=0, y interp)
    function edgeMidpoint(edge, v00, v10, v01, v11, level) {
        switch (edge) {
            case 0: { // top: between (0,0)→(1,0)
                const t = (level - v00) / (v10 - v00);
                return [t, 0];
            }
            case 1: { // right: between (1,0)→(1,1)
                const t = (level - v10) / (v11 - v10);
                return [1, t];
            }
            case 2: { // bottom: between (0,1)→(1,1)
                const t = (level - v01) / (v11 - v01);
                return [t, 1];
            }
            case 3: { // left: between (0,0)→(0,1)
                const t = (level - v00) / (v01 - v00);
                return [0, t];
            }
        }
    }

    /**
     * Compute contour segments for all cells at a given elevation level.
     * Returns array of {x1,y1,x2,y2} segments in grid coordinates.
     */
    function computeSegments(grid, rows, cols, level) {
        const segments = [];

        for (let r = 0; r < rows - 1; r++) {
            for (let c = 0; c < cols - 1; c++) {
                const v00 = grid[r][c];
                const v10 = grid[r][c + 1];
                const v01 = grid[r + 1][c];
                const v11 = grid[r + 1][c + 1];

                if (v00 == null || v10 == null || v01 == null || v11 == null) continue;

                // Determine case index
                const b00 = v00 >= level ? 1 : 0;
                const b10 = v10 >= level ? 1 : 0;
                const b01 = v01 >= level ? 1 : 0;
                const b11 = v11 >= level ? 1 : 0;
                const caseIdx = (b00 << 3) | (b10 << 2) | (b11 << 1) | b01;

                const segs = MS_SEGMENTS[caseIdx];
                if (!segs || segs.length === 0) continue;

                for (const [e1, e2] of segs) {
                    try {
                        const [fx1, fy1] = edgeMidpoint(e1, v00, v10, v01, v11, level);
                        const [fx2, fy2] = edgeMidpoint(e2, v00, v10, v01, v11, level);

                        if (!isFinite(fx1) || !isFinite(fy1) || !isFinite(fx2) || !isFinite(fy2)) continue;

                        segments.push({
                            x1: c + fx1, y1: r + fy1,
                            x2: c + fx2, y2: r + fy2,
                        });
                    } catch (e) { /* skip degenerate edge */ }
                }
            }
        }
        return segments;
    }

    /**
     * Merge segments into continuous polylines using endpoint matching.
     * Uses a map keyed by rounded endpoint coordinates.
     */
    function mergeSegments(segments, tol = 1e-6) {
        if (!segments.length) return [];

        function key(x, y) {
            return `${Math.round(x / tol) * tol},${Math.round(y / tol) * tol}`;
        }

        // Build adjacency: endpoint → [segment index, which end]
        const adj = new Map();
        const used = new Array(segments.length).fill(false);

        function addToAdj(segIdx, x, y, end) {
            const k = key(x, y);
            if (!adj.has(k)) adj.set(k, []);
            adj.get(k).push({ segIdx, end });
        }

        segments.forEach((s, i) => {
            addToAdj(i, s.x1, s.y1, 1);
            addToAdj(i, s.x2, s.y2, 2);
        });

        const polylines = [];

        for (let startIdx = 0; startIdx < segments.length; startIdx++) {
            if (used[startIdx]) continue;

            // Start a new polyline
            const pts = [];
            let curIdx = startIdx;
            let curEnd = 2; // we'll expand in direction of end 2 first

            // Build forward
            used[curIdx] = true;
            const s0 = segments[curIdx];
            pts.push([s0.x1, s0.y1], [s0.x2, s0.y2]);

            // Extend forward
            let keepGoing = true;
            while (keepGoing) {
                keepGoing = false;
                const last = pts[pts.length - 1];
                const k = key(last[0], last[1]);
                const neighbors = adj.get(k) || [];
                for (const { segIdx, end } of neighbors) {
                    if (used[segIdx]) continue;
                    used[segIdx] = true;
                    const seg = segments[segIdx];
                    if (end === 1) {
                        pts.push([seg.x2, seg.y2]);
                    } else {
                        pts.push([seg.x1, seg.y1]);
                    }
                    keepGoing = true;
                    break;
                }
            }

            // Extend backward
            keepGoing = true;
            while (keepGoing) {
                keepGoing = false;
                const first = pts[0];
                const k = key(first[0], first[1]);
                const neighbors = adj.get(k) || [];
                for (const { segIdx, end } of neighbors) {
                    if (used[segIdx]) continue;
                    used[segIdx] = true;
                    const seg = segments[segIdx];
                    if (end === 2) {
                        pts.unshift([seg.x1, seg.y1]);
                    } else {
                        pts.unshift([seg.x2, seg.y2]);
                    }
                    keepGoing = true;
                    break;
                }
            }

            if (pts.length >= 2) polylines.push(pts);
        }

        return polylines;
    }

    /**
     * Convert polyline to smooth SVG path using Catmull-Rom → Bezier.
     * smoothing: 0 = polyline, 1 = max smooth
     */
    function polylineToPath(pts, smoothing = 0.5) {
        if (pts.length < 2) return '';
        if (pts.length === 2 || smoothing === 0) {
            return 'M' + pts.map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join('L');
        }

        // Catmull-Rom control points
        function controlPts(p0, p1, p2, p3, t) {
            return [
                p1[0] + (p2[0] - p0[0]) * t / 6,
                p1[1] + (p2[1] - p0[1]) * t / 6,
                p2[0] - (p3[0] - p1[0]) * t / 6,
                p2[1] - (p3[1] - p1[1]) * t / 6,
            ];
        }

        let d = `M${pts[0][0].toFixed(3)},${pts[0][1].toFixed(3)}`;
        const n = pts.length;
        for (let i = 0; i < n - 1; i++) {
            const p0 = pts[Math.max(0, i - 1)];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[Math.min(n - 1, i + 2)];
            const [c1x, c1y, c2x, c2y] = controlPts(p0, p1, p2, p3, smoothing * 6);
            d += ` C${c1x.toFixed(3)},${c1y.toFixed(3)} ${c2x.toFixed(3)},${c2y.toFixed(3)} ${p2[0].toFixed(3)},${p2[1].toFixed(3)}`;
        }
        return d;
    }

    /**
     * Main contour generation.
     * Returns: { levels: [{level, isMajor, polylines}] }
     */
    function generateContours(grid, rows, cols, interval, majorMultiplier) {
        if (!grid || rows < 2 || cols < 2) return [];

        const vals = grid.flat().filter(v => v != null && !isNaN(v));
        if (vals.length < 4) return [];

        const minV = Math.min(...vals);
        const maxV = Math.max(...vals);

        const startLevel = Math.ceil(minV / interval) * interval;
        const result = [];

        for (let level = startLevel; level <= maxV; level += interval) {
            level = Utils.round(level, 6);
            const segs = computeSegments(grid, rows, cols, level);
            const polylines = mergeSegments(segs);
            const isMajor = Math.round(level / interval) % majorMultiplier === 0;
            if (polylines.length > 0) {
                result.push({ level, isMajor, polylines });
            }
        }

        return result;
    }

    return { generateContours, polylineToPath, computeSegments, mergeSegments };
})();
