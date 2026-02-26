/**
 * TerraGrid Pro — Spreadsheet Module
 * Spreadsheet-style elevation data input with:
 * - Auto-generated point IDs (A1, B3 format)
 * - Numeric validation with error highlighting
 * - CSV import/export
 */

const Spreadsheet = (() => {
    let rows = 0, cols = 0;
    let grid = [];
    let onChangeCallback = null;
    let containerEl = null;

    function init(containerId, r, c, callback) {
        rows = r;
        cols = c;
        containerEl = document.getElementById(containerId);
        onChangeCallback = callback;

        // Initialize empty grid
        grid = Array.from({ length: rows }, () => Array(cols).fill(null));
        buildTable();
    }

    function reinit(r, c) {
        const oldGrid = grid.map(row => [...row]);
        rows = r;
        cols = c;
        grid = Array.from({ length: rows }, (_, ri) =>
            Array.from({ length: cols }, (_, ci) =>
                (oldGrid[ri] && oldGrid[ri][ci] != null) ? oldGrid[ri][ci] : null
            )
        );
        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
    }

    function buildTable() {
        if (!containerEl) return;

        const wrapper = document.getElementById('spreadsheet-wrapper');
        if (!wrapper) return;
        wrapper.innerHTML = '';

        const table = document.createElement('table');
        table.className = 'spreadsheet-table';
        table.id = 'ss-table';

        // Header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const cornerTh = document.createElement('th');
        cornerTh.className = 'row-header';
        cornerTh.textContent = '';
        headerRow.appendChild(cornerTh);

        for (let c = 0; c < cols; c++) {
            const th = document.createElement('th');
            th.textContent = Utils.colLabel(c);
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Data rows
        const tbody = document.createElement('tbody');
        for (let r = 0; r < rows; r++) {
            const tr = document.createElement('tr');

            // Row header
            const rowTh = document.createElement('td');
            rowTh.textContent = r + 1;
            tr.appendChild(rowTh);

            for (let c = 0; c < cols; c++) {
                const td = document.createElement('td');
                td.dataset.r = r;
                td.dataset.c = c;

                const id = Utils.pointId(r, c);
                const val = grid[r][c];

                const badge = document.createElement('span');
                badge.className = 'cell-id-badge';
                badge.textContent = id;

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'cell-input';
                input.id = `cell-${r}-${c}`;
                input.value = val != null ? val.toString() : '';
                input.placeholder = '—';
                input.dataset.r = r;
                input.dataset.c = c;
                input.autocomplete = 'off';

                input.addEventListener('input', handleInput);
                input.addEventListener('change', handleChange);
                input.addEventListener('keydown', handleKeydown);
                input.addEventListener('focus', () => td.classList.add('cell-focused'));
                input.addEventListener('blur', () => td.classList.remove('cell-focused'));

                td.appendChild(badge);
                td.appendChild(input);
                updateCellStyle(td, val);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrapper.appendChild(table);
    }

    function handleInput(e) {
        const r = parseInt(e.target.dataset.r);
        const c = parseInt(e.target.dataset.c);
        const raw = e.target.value.trim();
        const val = Utils.parseElev(raw);
        const td = e.target.parentElement;
        updateCellStyle(td, val, raw);
        // Live update grid
        grid[r][c] = val;
    }

    function handleChange(e) {
        const r = parseInt(e.target.dataset.r);
        const c = parseInt(e.target.dataset.c);
        const raw = e.target.value.trim();
        const val = Utils.parseElev(raw);
        grid[r][c] = val;
        if (val != null) e.target.value = val.toString();
        const td = e.target.parentElement;
        updateCellStyle(td, val, raw);
        if (onChangeCallback) onChangeCallback(grid);
    }

    function handleKeydown(e) {
        const r = parseInt(e.target.dataset.r);
        const c = parseInt(e.target.dataset.c);
        let nr = r, nc = c;
        if (e.key === 'Tab' && !e.shiftKey) { nc = c + 1; if (nc >= cols) { nc = 0; nr = r + 1; } }
        else if (e.key === 'Tab' && e.shiftKey) { nc = c - 1; if (nc < 0) { nc = cols - 1; nr = r - 1; } }
        else if (e.key === 'Enter' || e.key === 'ArrowDown') { nr = r + 1; }
        else if (e.key === 'ArrowUp') { nr = r - 1; }
        else if (e.key === 'ArrowLeft' && e.target.selectionStart === 0) { nc = c - 1; }
        else if (e.key === 'ArrowRight' && e.target.selectionStart === e.target.value.length) { nc = c + 1; }
        else return;

        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            e.preventDefault();
            const nextInput = document.getElementById(`cell-${nr}-${nc}`);
            if (nextInput) nextInput.focus();
        }
    }

    function updateCellStyle(td, val, raw) {
        td.classList.remove('missing', 'has-value', 'error');
        if (raw !== undefined && raw !== '' && val == null) {
            td.classList.add('error');
        } else if (val != null) {
            td.classList.add('has-value');
        } else {
            td.classList.add('missing');
        }
    }

    function setGrid(newGrid) {
        const r = newGrid.length, c = newGrid[0]?.length || 0;
        rows = r;
        cols = c;
        grid = newGrid.map(row => [...row]);
        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
    }

    function getGrid() { return grid.map(row => [...row]); }

    function fillDemo() {
        // Create a natural-looking terrain
        const base = 95;
        const peak1 = { r: rows * 0.3, c: cols * 0.3, h: 12, w: 2 };
        const peak2 = { r: rows * 0.7, c: cols * 0.65, h: 8, w: 2.5 };
        const valley = { r: rows * 0.8, c: cols * 0.2, h: -5, w: 3 };

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let z = base;
                const d1 = Math.sqrt(Math.pow(r - peak1.r, 2) + Math.pow(c - peak1.c, 2));
                const d2 = Math.sqrt(Math.pow(r - peak2.r, 2) + Math.pow(c - peak2.c, 2));
                const dv = Math.sqrt(Math.pow(r - valley.r, 2) + Math.pow(c - valley.c, 2));
                z += peak1.h * Math.exp(-d1 * d1 / (2 * peak1.w * peak1.w));
                z += peak2.h * Math.exp(-d2 * d2 / (2 * peak2.w * peak2.w));
                z += valley.h * Math.exp(-dv * dv / (2 * valley.w * valley.w));
                // Slight tilt
                z += (c / cols) * 2 - (r / rows) * 1.5;
                // Noise
                z += (Math.sin(r * 1.3) * Math.cos(c * 0.9) * 0.5);
                grid[r][c] = Math.round(z * 1000) / 1000;
            }
        }
        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
    }

    function clearAll() {
        grid = Array.from({ length: rows }, () => Array(cols).fill(null));
        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
    }

    // ---- CSV Import/Export ----
    function exportCSV() {
        const header = ['PointID', 'Row', 'Col', 'Elevation'];
        const lines = [header.join(',')];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = grid[r][c];
                lines.push(`${Utils.pointId(r, c)},${r + 1},${c + 1},${val != null ? val : ''}`);
            }
        }
        return lines.join('\n');
    }

    function importCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return false;

        // Detect if first line is header
        const firstLine = lines[0].toLowerCase();
        const hasHeader = firstLine.includes('pointid') || firstLine.includes('elevation') || firstLine.includes('row');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        let maxR = 0, maxC = 0;
        const points = [];

        for (const line of dataLines) {
            if (!line.trim()) continue;
            const parts = line.split(',');
            if (parts.length < 4) {
                // Try to parse as simple grid: col1,col2,...
                continue;
            }
            const [pid, rowStr, colStr, elevStr] = parts;
            const r = parseInt(rowStr) - 1;
            const c = parseInt(colStr) - 1;
            const elev = Utils.parseElev(elevStr);
            if (r >= 0 && c >= 0 && !isNaN(r) && !isNaN(c)) {
                maxR = Math.max(maxR, r);
                maxC = Math.max(maxC, c);
                points.push({ r, c, elev });
            }
        }

        if (points.length === 0) {
            // Try simple 2D CSV (matrix)
            const newGrid = dataLines
                .filter(l => l.trim())
                .map(l => l.split(',').map(v => Utils.parseElev(v.trim())));
            if (newGrid.length > 1) {
                setGrid(newGrid);
                return true;
            }
            return false;
        }

        rows = maxR + 1;
        cols = maxC + 1;
        grid = Array.from({ length: rows }, () => Array(cols).fill(null));
        for (const { r, c, elev } of points) {
            if (r < rows && c < cols) grid[r][c] = elev;
        }
        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
        return { rows, cols };
    }

    return { init, reinit, setGrid, getGrid, fillDemo, clearAll, exportCSV, importCSV };
})();
