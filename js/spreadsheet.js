/**
 * TerraGrid Pro — Spreadsheet Module
 * Spreadsheet-style elevation data input with:
 * - Auto-generated point IDs (A1, B3 format)
 * - Numeric validation with error highlighting
 * - CSV import/export
 * - Backsight Survey mode (FS to RL conversion)
 */

const Spreadsheet = (() => {
    let rows = 0, cols = 0;
    let grid = []; // This holds RL (m) values
    let fsGrid = []; // This holds raw FS (cm) values
    let onChangeCallback = null;
    let containerEl = null;

    let surveyOptions = {
        mode: 'elevation',
        hi: 100
    };

    function init(containerId, r, c, callback, options = {}) {
        rows = r;
        cols = c;
        containerEl = document.getElementById(containerId);
        onChangeCallback = callback;
        surveyOptions = { ...surveyOptions, ...options };

        // Initialize empty grids
        grid = Array.from({ length: rows }, () => Array(cols).fill(null));
        fsGrid = Array.from({ length: rows }, () => Array(cols).fill(null));
        buildTable();
    }

    function reinit(r, c) {
        const oldGrid = grid.map(row => [...row]);
        const oldFsGrid = fsGrid.map(row => [...row]);
        rows = r;
        cols = c;
        grid = Array.from({ length: rows }, (_, ri) =>
            Array.from({ length: cols }, (_, ci) =>
                (oldGrid[ri] && oldGrid[ri][ci] != null) ? oldGrid[ri][ci] : null
            )
        );
        fsGrid = Array.from({ length: rows }, (_, ri) =>
            Array.from({ length: cols }, (_, ci) =>
                (oldFsGrid[ri] && oldFsGrid[ri][ci] != null) ? oldFsGrid[ri][ci] : null
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
        const isBS = surveyOptions.mode === 'backsight';

        for (let r = 0; r < rows; r++) {
            const tr = document.createElement('tr');

            // Row header
            const rowTh = document.createElement('td');
            rowTh.className = 'row-header';
            rowTh.textContent = r + 1;
            tr.appendChild(rowTh);

            // Safety check for grid row
            const gridRow = grid[r] || [];
            const fsGridRow = fsGrid[r] || [];

            for (let c = 0; c < cols; c++) {
                const td = document.createElement('td');
                td.dataset.r = r;
                td.dataset.c = c;
                if (isBS) td.classList.add('backsight-mode');

                const id = Utils.pointId(r, c);
                const val = gridRow[c];
                const fsVal = fsGridRow[c];

                const badge = document.createElement('span');
                badge.className = 'cell-id-badge';
                badge.textContent = id;

                if (isBS) {
                    const split = document.createElement('div');
                    split.className = 'cell-split-container';

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'cell-fs-input';
                    input.id = `cell-${r}-${c}`;
                    input.value = fsVal != null ? fsVal.toString() : '';
                    input.placeholder = 'FS cm';
                    input.dataset.r = r;
                    input.dataset.c = c;
                    input.autocomplete = 'off';

                    const rlDisplay = document.createElement('span');
                    rlDisplay.className = 'cell-rl-display';
                    rlDisplay.id = `rl-${r}-${c}`;
                    rlDisplay.textContent = val != null ? val.toFixed(3) : '—';

                    input.addEventListener('input', handleInput);
                    input.addEventListener('change', handleChange);
                    input.addEventListener('keydown', handleKeydown);
                    input.addEventListener('focus', () => td.classList.add('cell-focused'));
                    input.addEventListener('blur', () => td.classList.remove('cell-focused'));

                    split.appendChild(input);
                    split.appendChild(rlDisplay);
                    td.appendChild(badge);
                    td.appendChild(split);
                } else {
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
                }

                updateCellStyle(td, val, isBS ? fsVal : val);
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        wrapper.appendChild(table);
    }

    function calculateRL(fsCm) {
        if (fsCm == null) return null;
        const fsM = fsCm / 100;
        return surveyOptions.hi - fsM;
    }

    function handleInput(e) {
        const r = parseInt(e.target.dataset.r);
        const c = parseInt(e.target.dataset.c);
        const raw = e.target.value.trim();
        const inputVal = Utils.parseElev(raw);
        const td = e.target.parentElement.closest('td');

        if (surveyOptions.mode === 'backsight') {
            fsGrid[r][c] = inputVal;
            grid[r][c] = calculateRL(inputVal);
            const rlDisplay = document.getElementById(`rl-${r}-${c}`);
            if (rlDisplay) rlDisplay.textContent = grid[r][c] != null ? grid[r][c].toFixed(3) : '—';
            updateCellStyle(td, grid[r][c], raw);
        } else {
            grid[r][c] = inputVal;
            updateCellStyle(td, grid[r][c], raw);
        }
    }

    function handleChange(e) {
        const r = parseInt(e.target.dataset.r);
        const c = parseInt(e.target.dataset.c);
        const raw = e.target.value.trim();
        const inputVal = Utils.parseElev(raw);

        if (surveyOptions.mode === 'backsight') {
            fsGrid[r][c] = inputVal;
            grid[r][c] = calculateRL(inputVal);
            if (inputVal != null) e.target.value = inputVal.toString();
        } else {
            grid[r][c] = inputVal;
            if (inputVal != null) e.target.value = inputVal.toString();
        }

        const td = e.target.parentElement.closest('td');
        updateCellStyle(td, grid[r][c], raw);
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
        if (raw !== undefined && raw !== '' && (raw === null || (typeof raw === 'string' && isNaN(parseFloat(raw))))) {
            // simplified logic: if we have raw text but no parsed value
            td.classList.add('error');
        } else if (val != null) {
            td.classList.add('has-value');
        } else {
            td.classList.add('missing');
        }
    }

    function setGrid(newGrid, newFsGrid = null) {
        grid = newGrid.map(row => [...row]);
        if (newFsGrid) {
            fsGrid = newFsGrid.map(row => [...row]);
        } else {
            fsGrid = Array.from({ length: rows }, () => Array(cols).fill(null));
        }
        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
    }

    function getGrid() { return grid.map(row => [...row]); }
    function getFSGrid() { return fsGrid.map(row => [...row]); }

    function fillDemo(type = 'hill') {
        const baseRL = surveyOptions.mode === 'backsight' ? surveyOptions.hi - 5 : 100;
        const detailLevel = (rows * cols) / 16;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let z = 0;
                const rn = r / (rows - 1 || 1);
                const cn = c / (cols - 1 || 1);

                switch (type) {
                    case 'hill':
                        z = 10 * Math.exp(-(Math.pow(rn - 0.5, 2) + Math.pow(cn - 0.5, 2)) / 0.1);
                        break;
                    case 'ridge':
                        z = 8 * Math.exp(-(Math.pow(rn - 0.5, 2) + Math.pow(cn - (0.2 + 0.6 * rn), 2)) / 0.05);
                        z += 3 * Math.exp(-(Math.pow(rn - 0.2, 2) + Math.pow(cn - 0.3, 2)) / 0.02);
                        break;
                    case 'valley':
                        z = 10 - 10 * Math.exp(-(Math.pow(rn - 0.5, 2) + Math.pow(cn - 0.5, 2)) / 0.2);
                        z -= 4 * Math.exp(-(Math.pow(rn - 0.5, 2) + Math.pow(cn - (0.2 + 0.6 * rn), 2)) / 0.05);
                        break;
                    case 'depression':
                        z = 8 - 10 * Math.exp(-(Math.pow(rn - 0.5, 2) + Math.pow(cn - 0.5, 2)) / 0.1);
                        break;
                    case 'saddle':
                        z = 5 + 6 * (Math.pow(rn - 0.5, 2) - Math.pow(cn - 0.5, 2));
                        z += 3 * Math.exp(-(Math.pow(rn - 0.5, 2) + Math.pow(cn - 0.1, 2)) / 0.05);
                        z += 3 * Math.exp(-(Math.pow(rn - 0.5, 2) + Math.pow(cn - 0.9, 2)) / 0.05);
                        break;
                    case 'spur':
                        const distToSpurLine = Math.abs(rn - cn);
                        z = 10 * Math.exp(-distToSpurLine * distToSpurLine / 0.05) * Math.exp(-(rn + cn) / 1.5);
                        break;
                    case 'natural land':
                    default:
                        z = 6 * Math.sin(rn * 5) * Math.cos(cn * 4);
                        z += 3 * Math.sin(rn * 12) * Math.sin(cn * 10);
                        z += 2 * (Math.random() - 0.5);
                        break;
                }

                // Add detail based on grid size
                if (detailLevel > 1) {
                    z += (Math.sin(rn * 20 * detailLevel) * Math.cos(cn * 15 * detailLevel)) * 0.4;
                }

                // Add minor random noise
                z += (Math.random() - 0.5) * 0.3;

                const finalRL = baseRL + z;
                grid[r][c] = Utils.round(finalRL, 3);

                if (surveyOptions.mode === 'backsight') {
                    // RL = HI - (FS/100)  => FS = (HI - RL) * 100
                    const fs = (surveyOptions.hi - finalRL) * 100;
                    fsGrid[r][c] = Utils.round(fs, 1);
                }
            }
        }

        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
    }

    function clearAll() {
        grid = Array.from({ length: rows }, () => Array(cols).fill(null));
        fsGrid = Array.from({ length: rows }, () => Array(cols).fill(null));
        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
    }

    // ---- CSV Import/Export ----
    function exportCSV() {
        const header = surveyOptions.mode === 'backsight' ?
            ['PointID', 'Row', 'Col', 'FS_cm', 'RL_m'] :
            ['PointID', 'Row', 'Col', 'Elevation'];
        const lines = [header.join(',')];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (surveyOptions.mode === 'backsight') {
                    lines.push(`${Utils.pointId(r, c)},${r + 1},${c + 1},${fsGrid[r][c] || ''},${grid[r][c] || ''}`);
                } else {
                    lines.push(`${Utils.pointId(r, c)},${r + 1},${c + 1},${grid[r][c] || ''}`);
                }
            }
        }
        return lines.join('\n');
    }

    function importCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return false;

        const firstLine = lines[0].toLowerCase();
        const isBacksightFile = firstLine.includes('fs') || firstLine.includes('rl_m');
        const detectedMode = isBacksightFile ? 'backsight' : 'elevation';

        const hasHeader = firstLine.includes('pointid') || firstLine.includes('elevation') || firstLine.includes('row');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        let maxR = 0, maxC = 0;
        const points = [];

        for (const line of dataLines) {
            if (!line.trim()) continue;
            const parts = line.split(',');
            if (parts.length < 4) continue;
            const r = parseInt(parts[1]) - 1;
            const c = parseInt(parts[2]) - 1;

            let fs = null, rl = null;
            if (isBacksightFile && parts.length >= 5) {
                fs = Utils.parseElev(parts[3]);
                rl = Utils.parseElev(parts[4]);
            } else {
                rl = Utils.parseElev(parts[3]);
            }

            if (r >= 0 && c >= 0 && !isNaN(r) && !isNaN(c)) {
                maxR = Math.max(maxR, r);
                maxC = Math.max(maxC, c);
                points.push({ r, c, fs, rl });
            }
        }

        if (points.length === 0) return false;

        rows = maxR + 1;
        cols = maxC + 1;

        // Sync mode if detected
        surveyOptions.mode = detectedMode;

        grid = Array.from({ length: rows }, () => Array(cols).fill(null));
        fsGrid = Array.from({ length: rows }, () => Array(cols).fill(null));
        for (const pt of points) {
            if (pt.r < rows && pt.c < cols) {
                grid[pt.r][pt.c] = pt.rl;
                fsGrid[pt.r][pt.c] = pt.fs;
            }
        }
        buildTable();
        if (onChangeCallback) onChangeCallback(grid);
        return { rows, cols, mode: detectedMode };
    }

    return { init, reinit, setGrid, getGrid, getFSGrid, fillDemo, clearAll, exportCSV, importCSV };
})();
