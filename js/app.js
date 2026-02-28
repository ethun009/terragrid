/**
 * TerraGrid Pro — Main Application Controller
 * Orchestrates all modules, handles state, routing between views
 */

(function () {
    'use strict';

    // ============================================================
    // APPLICATION STATE
    // ============================================================
    const AppState = {
        projectName: 'TerraGrid Survey',
        rows: 6,
        cols: 6,
        spacing: 10,
        units: 'm',
        contourInterval: 1,
        majorMultiplier: 5,
        smoothing: 0.5,
        vertExag: 2,
        v3dSmoothing: 0,
        v3dColorMode: 'terrain',
        v3dStaticColor: '#3b82f6',
        ramp: 'terrain',
        currentView: 'spreadsheet',
        // Backsight Data
        dataType: 'elevation', // 'elevation' or 'backsight'
        benchmark: 100,
        backsight: 1.5,
        hi: 101.5,
        fsGrid: null, // Stores raw FS values in cm
        toggles: {
            gridLines: false,
            labels: true,
            elevValues: true,
            contours: true,
            contourLabels: true,
            demFill: false,
        },
        grid: null,
        contours: null,
        get cellSize() {
            return Math.max(40, Math.min(80, 480 / Math.max(this.rows, this.cols)));
        }
    };

    // ============================================================
    // INIT
    // ============================================================
    function boot() {
        handleSplashScreen();
        setupWizard();
        setupTopbar();
        setupSidebar();
        setupExport();
        setupAnalysisPanel();
        GridRenderer.init('contour-svg', 'contour-map-container');
        DEMRenderer.init('dem-svg', 'dem-map-container');
        AnalysisEngine.init('analysis-svg', 'analysis-map-container');
        Viewer3D.init('viewer3d-container');
    }

    function handleSplashScreen() {
        const splash = document.getElementById('splash-screen');
        if (!splash) return;

        // Sequence: Brand (0.2s delay, 0.8s dur) -> Author (1.2s delay, 0.8s dur)
        // Total sequence finishes at ~2.0s. We hold for another 1.5s.
        setTimeout(() => {
            splash.classList.add('fade-out');
            setTimeout(() => {
                splash.remove();
            }, 800);
        }, 3500);
    }

    // ============================================================
    // WIZARD
    // ============================================================
    function setupWizard() {
        document.getElementById('btn-create-project').addEventListener('click', startProject);
        document.getElementById('btn-load-sample').addEventListener('click', loadSampleProject);
        document.getElementById('btn-back-wizard').addEventListener('click', () => {
            Viewer3D.stopRender();
            showScreen('wizard');
        });

        // Toggle backsight fields
        document.getElementById('data-input-mode').addEventListener('change', (e) => {
            const fields = document.getElementById('backsight-fields');
            fields.classList.toggle('hidden', e.target.value !== 'backsight');
        });

        // Sync benchmark unit in wizard
        document.getElementById('grid-units').addEventListener('change', (e) => {
            const bmUnitLabel = document.querySelector('label[for="survey-bm"] .unit-label');
            if (bmUnitLabel) bmUnitLabel.textContent = e.target.value;
        });
    }

    function startProject() {
        const name = document.getElementById('proj-name').value.trim() || 'Unnamed Project';
        const rows = parseInt(document.getElementById('grid-rows').value) || 6;
        const cols = parseInt(document.getElementById('grid-cols').value) || 6;
        const spacing = parseFloat(document.getElementById('grid-spacing').value) || 10;
        const units = document.getElementById('grid-units').value || 'm';
        const interval = parseFloat(document.getElementById('contour-interval').value) || 1;
        const majorMult = parseInt(document.getElementById('major-interval-mult').value) || 5;

        // Backsight
        const mode = document.getElementById('data-input-mode').value;
        const bm = parseFloat(document.getElementById('survey-bm').value) || 100;
        const bs = parseFloat(document.getElementById('survey-bs').value) || 0;

        AppState.projectName = name;
        AppState.rows = Math.max(2, Math.min(30, rows));
        AppState.cols = Math.max(2, Math.min(30, cols));
        AppState.spacing = spacing;
        AppState.units = units;
        AppState.contourInterval = interval;
        AppState.majorMultiplier = majorMult;

        AppState.dataType = mode;
        AppState.benchmark = bm;
        AppState.backsight = bs;
        AppState.hi = bm + (bs / 100);

        AppState.grid = Array.from({ length: AppState.rows }, () => Array(AppState.cols).fill(null));
        if (AppState.dataType === 'backsight') {
            AppState.fsGrid = Array.from({ length: AppState.rows }, () => Array(AppState.cols).fill(null));
        } else {
            AppState.fsGrid = null;
        }

        launchApp();
    }

    function loadSampleProject() {
        AppState.projectName = 'Demo Terrain Site';
        AppState.rows = 8;
        AppState.cols = 8;
        AppState.spacing = 10;
        AppState.units = 'm';
        AppState.contourInterval = 1;
        AppState.majorMultiplier = 5;
        AppState.dataType = 'elevation';
        document.getElementById('grid-rows').value = 8;
        document.getElementById('grid-cols').value = 8;
        document.getElementById('proj-name').value = 'Demo Terrain Site';
        AppState.grid = Array.from({ length: AppState.rows }, () => Array(AppState.cols).fill(null));
        launchApp();
        // Fill demo data after launching
        setTimeout(() => {
            Spreadsheet.fillDemo();
        }, 100);
    }

    function launchApp() {
        // Update topbar title
        document.getElementById('topbar-project-name').textContent = AppState.projectName;

        // Set unit labels
        document.querySelectorAll('.unit-label, #sb-unit-label, #datum-unit-label').forEach(el => {
            el.textContent = AppState.units;
        });

        // Toggle SS legend for backsight
        const ssLegend = document.getElementById('ss-legend');
        if (ssLegend) {
            ssLegend.classList.toggle('hidden', AppState.dataType !== 'backsight');
        }

        // Sync wizard BM unit if visible
        const bmLabel = document.querySelector('label[for="survey-bm"] .unit-label');
        if (bmLabel) bmLabel.textContent = AppState.units;


        // Sync sidebar controls
        document.getElementById('sb-contour-interval').value = AppState.contourInterval;
        document.getElementById('sb-major-mult').value = AppState.majorMultiplier;

        // Sync sidebar backsight stats row
        const bsRow = document.getElementById('stats-backsight-row');
        if (bsRow) {
            bsRow.classList.toggle('hidden', AppState.dataType !== 'backsight');
            if (AppState.dataType === 'backsight') {
                document.getElementById('stat-bm').textContent = AppState.benchmark.toFixed(3);
                document.getElementById('stat-hi').textContent = AppState.hi.toFixed(3);
            }
        }

        // Init spreadsheet
        Spreadsheet.init('spreadsheet-container', AppState.rows, AppState.cols, onGridChange, {
            mode: AppState.dataType,
            hi: AppState.hi
        });

        if (AppState.grid && AppState.grid.flat().some(v => v != null)) {
            Spreadsheet.setGrid(AppState.grid, AppState.fsGrid);
        }

        showScreen('app');
        switchView('spreadsheet');
    }

    function showScreen(name) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(`screen-${name}`).classList.add('active');
    }

    // ============================================================
    // GRID CHANGE CALLBACK
    // ============================================================
    function onGridChange(newGrid) {
        AppState.grid = newGrid;
        AppState.fsGrid = Spreadsheet.getFSGrid();
        updateStats();
        // Regenerate contours in background
        regenerateContours();
        // If currently on a map view, re-render
        if (AppState.currentView === 'contour') renderContourView();
        else if (AppState.currentView === 'dem') renderDEMView();
        else if (AppState.currentView === 'analysis') renderAnalysisView();
        else if (AppState.currentView === 'viewer3d') {
            refresh3D();
        }
    }

    function regenerateContours() {
        if (!AppState.grid) return;
        AppState.contours = ContourEngine.generateContours(
            AppState.grid, AppState.rows, AppState.cols,
            AppState.contourInterval, AppState.majorMultiplier
        );
    }

    function updateStats() {
        const stats = Utils.elevStats(AppState.grid || []);
        if (!stats) {
            ['stat-min', 'stat-max', 'stat-mean', 'stat-relief', 'stat-points'].forEach(id => {
                document.getElementById(id).textContent = '—';
            });
            return;
        }
        const u = AppState.units;
        document.getElementById('stat-min').textContent = stats.min.toFixed(3) + u;
        document.getElementById('stat-max').textContent = stats.max.toFixed(3) + u;
        document.getElementById('stat-mean').textContent = stats.mean.toFixed(3) + u;
        document.getElementById('stat-relief').textContent = stats.relief.toFixed(3) + u;
        document.getElementById('stat-points').textContent = stats.count + '/' + (AppState.rows * AppState.cols);
    }

    // ============================================================
    // VIEW SWITCHING
    // ============================================================
    function setupTopbar() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                switchView(view);
            });
        });

        // Demo Picker - Level 1 (Terrain) & Level 2 (Size)
        setupDemoPicker();
        document.getElementById('btn-clear-data').addEventListener('click', () => {
            if (confirm('Clear all elevation data?')) Spreadsheet.clearAll();
        });

        document.getElementById('btn-zoom-fit').addEventListener('click', () => {
            GridRenderer.fitToView(AppState.rows, AppState.cols, AppState.cellSize);
        });
        document.getElementById('btn-zoom-in').addEventListener('click', () => GridRenderer.zoom(1.3));
        document.getElementById('btn-zoom-out').addEventListener('click', () => GridRenderer.zoom(1 / 1.3));
        document.getElementById('btn-regen-contour').addEventListener('click', () => {
            regenerateContours();
            renderContourView();
        });

        document.getElementById('btn-dem-fit').addEventListener('click', () => {
            DEMRenderer.fitToView(AppState.rows, AppState.cols, AppState.cellSize);
        });

        document.getElementById('btn-3d-reset').addEventListener('click', () => Viewer3D.resetCamera());
        document.getElementById('btn-3d-wireframe').addEventListener('click', () => {
            const btn = document.getElementById('btn-3d-wireframe');
            Viewer3D.toggleWireframe();
            btn.classList.toggle('active-tool');
        });
        document.getElementById('btn-3d-water').addEventListener('click', () => {
            Viewer3D.toggleWaterMode();
        });

        // CSV import
        document.getElementById('btn-import-csv').addEventListener('click', () => {
            document.getElementById('csv-file-input').click();
        });
        document.getElementById('csv-file-input').addEventListener('change', handleFileImport);
    }

    function switchView(view) {
        AppState.currentView = view;

        // Tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === view);
        });

        // Panels
        document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`view-${view}`).classList.add('active');

        // Stop 3D render if leaving it
        if (view !== 'viewer3d') Viewer3D.stopRender();

        // Render corresponding view
        if (view === 'contour') {
            setTimeout(() => {
                renderContourView();
                GridRenderer.fitToView(AppState.rows, AppState.cols, AppState.cellSize);
            }, 50);
        } else if (view === 'dem') {
            setTimeout(() => {
                renderDEMView();
                DEMRenderer.fitToView(AppState.rows, AppState.cols, AppState.cellSize);
            }, 50);
        } else if (view === 'analysis') {
            setTimeout(() => {
                renderAnalysisView();
                AnalysisEngine.fitToView(AppState.rows, AppState.cols, AppState.cellSize);
            }, 50);
        } else if (view === 'viewer3d') {
            Viewer3D.setup();
            refresh3D();
            Viewer3D.updateLabelVisibility(AppState.toggles);
            Viewer3D.startRender();
        }

        // On mobile, close sidebar after view change
        if (window.innerWidth <= 768) {
            const sidebar = document.querySelector('.sidebar');
            const backdrop = document.getElementById('sidebar-backdrop');
            if (sidebar) sidebar.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');
        }
    }

    // ============================================================
    // RENDERING
    // ============================================================
    function renderContourView() {
        if (!AppState.contours) regenerateContours();
        GridRenderer.render({
            grid: AppState.grid,
            rows: AppState.rows,
            cols: AppState.cols,
            cellSize: AppState.cellSize,
            toggles: AppState.toggles,
            contours: AppState.contours,
            smoothing: AppState.smoothing,
            ramp: AppState.ramp,
        });

        // Fix viewBox for zoom/pan to work nicely
        fitContourViewBox();
    }

    function refresh3D() {
        if (AppState.grid) {
            Viewer3D.buildTerrain(
                AppState.grid, AppState.rows, AppState.cols, AppState.spacing,
                AppState.vertExag, AppState.v3dSmoothing, AppState.v3dColorMode, AppState.v3dStaticColor
            );
        }
    }

    function fitContourViewBox() {
        const svg = document.getElementById('contour-svg');
        if (!svg) return;
        const container = document.getElementById('contour-map-container');
        const w = container.clientWidth;
        const h = container.clientHeight;
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        svg.style.width = w + 'px';
        svg.style.height = h + 'px';
    }

    function renderDEMView() {
        DEMRenderer.render({
            grid: AppState.grid,
            rows: AppState.rows,
            cols: AppState.cols,
            cellSize: AppState.cellSize,
            ramp: AppState.ramp,
            units: AppState.units,
        });
        // Update floating bar ramp label
        const rampLabel = document.getElementById('dem-ramp-label');
        if (rampLabel) {
            const names = { terrain: 'Terrain', viridis: 'Viridis', plasma: 'Plasma', grayscale: 'Grayscale', rdbu: 'RdBu' };
            rampLabel.textContent = names[AppState.ramp] || AppState.ramp;
        }
    }

    function renderAnalysisView() {
        const activeAnalysis = document.querySelector('.tool-btn.active-tool')?.dataset.analysis || 'slope';
        if (activeAnalysis === 'slope') {
            AnalysisEngine.renderSlope({
                grid: AppState.grid, rows: AppState.rows, cols: AppState.cols,
                cellSize: AppState.cellSize, spacing: AppState.spacing,
            });
        } else if (activeAnalysis === 'flow') {
            AnalysisEngine.renderFlow({
                grid: AppState.grid, rows: AppState.rows, cols: AppState.cols,
                cellSize: AppState.cellSize, spacing: AppState.spacing,
            });
        } else if (activeAnalysis === 'cutfill') {
            const datum = parseFloat(document.getElementById('datum-elev').value) || 0;
            const result = AnalysisEngine.renderCutFill({
                grid: AppState.grid, rows: AppState.rows, cols: AppState.cols,
                cellSize: AppState.cellSize, spacing: AppState.spacing,
            }, datum);
            displayCutFillResults(result);
        }
    }

    function displayCutFillResults(result) {
        if (!result) return;
        const container = document.getElementById('cutfill-results');
        const u = AppState.units;
        const u3 = u === 'm' ? 'm³' : 'ft³';
        container.innerHTML = `
      <div class="cutfill-item">
        <span class="cf-label">✂ Cut Volume</span>
        <span class="cf-value cf-cut">${result.cutVol.toFixed(2)} ${u3}</span>
      </div>
      <div class="cutfill-item">
        <span class="cf-label">🏗 Fill Volume</span>
        <span class="cf-value cf-fill">${result.fillVol.toFixed(2)} ${u3}</span>
      </div>
      <div class="cutfill-item">
        <span class="cf-label">⚖ Net</span>
        <span class="cf-value cf-net">${result.netVol >= 0 ? '+' : ''}${result.netVol.toFixed(2)} ${u3}</span>
      </div>
    `;
    }

    // ============================================================
    // SIDEBAR CONTROLS
    // ============================================================
    function setupSidebar() {
        // Toggle switches
        const toggleMap = {
            'toggle-grid': 'gridLines',
            'toggle-labels': 'labels',
            'toggle-elev': 'elevValues',
            'toggle-contours': 'contours',
            'toggle-contour-labels': 'contourLabels',
            'toggle-dem-fill': 'demFill',
        };

        for (const [id, key] of Object.entries(toggleMap)) {
            const el = document.getElementById(id);
            if (!el) continue;
            el.addEventListener('click', () => {
                el.classList.toggle('active');
                AppState.toggles[key] = el.classList.contains('active');
                if (AppState.currentView === 'contour') renderContourView();
                else if (AppState.currentView === 'dem') renderDEMView();
                else if (AppState.currentView === 'viewer3d') {
                    Viewer3D.updateLabelVisibility(AppState.toggles);
                }
            });
        }

        // Contour interval
        document.getElementById('sb-contour-interval').addEventListener('change', (e) => {
            AppState.contourInterval = parseFloat(e.target.value) || 1;
            regenerateContours();
            if (AppState.currentView === 'contour') renderContourView();
        });

        document.getElementById('sb-major-mult').addEventListener('change', (e) => {
            AppState.majorMultiplier = parseInt(e.target.value) || 5;
            regenerateContours();
            if (AppState.currentView === 'contour') renderContourView();
        });

        // Smoothing
        document.getElementById('sb-smoothing').addEventListener('input', (e) => {
            AppState.smoothing = parseFloat(e.target.value);
            if (AppState.currentView === 'contour') renderContourView();
        });

        // Vertical exaggeration
        const vertExagSlider = document.getElementById('sb-vert-exag');
        const vertExagVal = document.getElementById('sb-vert-exag-val');
        vertExagSlider.addEventListener('input', (e) => {
            AppState.vertExag = parseFloat(e.target.value);
            vertExagVal.textContent = AppState.vertExag + '×';
            if (AppState.currentView === 'viewer3d') refresh3D();
        });

        // 3D Smoothing
        const smoothVal = document.getElementById('sb-3d-smoothing-val');
        document.getElementById('sb-3d-smoothing').addEventListener('input', (e) => {
            const v = parseInt(e.target.value);
            AppState.v3dSmoothing = v;
            smoothVal.textContent = v === 0 ? 'Off' : v;
            if (AppState.currentView === 'viewer3d') refresh3D();
        });

        // 3D Color Mode
        const staticGroup = document.getElementById('static-color-group');
        document.getElementById('sb-3d-color-mode').addEventListener('change', (e) => {
            AppState.v3dColorMode = e.target.value;
            staticGroup.classList.toggle('hidden', e.target.value !== 'static');
            if (AppState.currentView === 'viewer3d') refresh3D();
        });

        document.getElementById('sb-3d-static-color').addEventListener('input', (e) => {
            AppState.v3dStaticColor = e.target.value;
            if (AppState.currentView === 'viewer3d') refresh3D();
        });

        // Color ramp
        document.querySelectorAll('.ramp-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ramp-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                AppState.ramp = btn.dataset.ramp;
                if (AppState.currentView === 'contour') renderContourView();
                else if (AppState.currentView === 'dem') renderDEMView();
            });
        });

        // Mobile Sidebar Toggle + Backdrop
        const toggleBtn = document.getElementById('sidebar-toggle');
        const sidebar = document.querySelector('.sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');

        function openSidebar() {
            sidebar.classList.add('active');
            if (backdrop) backdrop.classList.add('active');
        }
        function closeSidebar() {
            sidebar.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');
        }

        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                sidebar.classList.contains('active') ? closeSidebar() : openSidebar();
            });
        }
        if (backdrop) {
            backdrop.addEventListener('click', closeSidebar);
        }
    }

    // ============================================================
    // ANALYSIS PANEL (mobile bottom-sheet)
    // ============================================================
    function setupAnalysisPanel() {
        const analysisBtns = document.querySelectorAll('[data-analysis]');
        analysisBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                analysisBtns.forEach(b => b.classList.remove('active-tool'));
                btn.classList.add('active-tool');

                const type = btn.dataset.analysis;
                document.querySelectorAll('.analysis-card').forEach(c => c.classList.add('hidden'));
                document.getElementById(`${type}-card`).classList.remove('hidden');

                renderAnalysisView();

                // On mobile, expand the panel when an analysis type is chosen
                const panel = document.getElementById('analysis-info-panel');
                if (panel && window.innerWidth <= 768) {
                    panel.classList.remove('collapsed');
                }
            });
        });

        document.getElementById('btn-calc-cutfill').addEventListener('click', () => {
            const datum = parseFloat(document.getElementById('datum-elev').value) || 0;
            const result = AnalysisEngine.renderCutFill({
                grid: AppState.grid, rows: AppState.rows, cols: AppState.cols,
                cellSize: AppState.cellSize, spacing: AppState.spacing,
            }, datum);
            displayCutFillResults(result);
        });

        // Mobile bottom-sheet: drag handle tap to toggle
        const handle = document.getElementById('analysis-panel-handle');
        const panel = document.getElementById('analysis-info-panel');
        if (handle && panel) {
            handle.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
            });

            // Swipe up to expand, down to collapse
            let touchStartY = 0;
            panel.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            }, { passive: true });
            panel.addEventListener('touchend', (e) => {
                const dy = e.changedTouches[0].clientY - touchStartY;
                if (dy < -30) panel.classList.remove('collapsed');   // swipe up → expand
                if (dy > 30) panel.classList.add('collapsed');      // swipe down → collapse
            }, { passive: true });
        }
    }

    // ============================================================
    // EXPORT
    // ============================================================
    function setupExport() {
        const exportBtn = document.getElementById('btn-export-menu');
        const dropdown = document.getElementById('export-dropdown');

        exportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', () => dropdown.classList.add('hidden'));

        document.querySelectorAll('[data-export]').forEach(item => {
            item.addEventListener('click', (e) => {
                const type = e.target.dataset.export;
                dropdown.classList.add('hidden');

                const svgId = ExportEngine.getActiveSVGId(AppState.currentView);

                switch (type) {
                    case 'png':
                        ExportEngine.exportPNG(svgId, `${AppState.projectName.replace(/\s+/g, '_')}_map.png`);
                        break;
                    case 'pdf':
                        ExportEngine.exportPDF(svgId, AppState.projectName);
                        break;
                    case 'dxf':
                        if (!AppState.contours) regenerateContours();
                        ExportEngine.exportDXF(
                            AppState.grid, AppState.rows, AppState.cols,
                            AppState.spacing, AppState.contours, AppState.units, AppState.projectName
                        );
                        break;
                    case 'json':
                        ExportEngine.exportJSON(AppState);
                        break;
                    case 'csv':
                        ExportEngine.exportCSVData();
                        break;
                }
            });
        });
    }

    // ============================================================
    // FILE IMPORT
    // ============================================================
    function handleFileImport(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;

            // Try JSON first
            if (file.name.endsWith('.json')) {
                const data = ExportEngine.importJSON(text);
                if (data) {
                    const p = data.project;
                    AppState.projectName = p.name || 'Imported Project';
                    AppState.rows = p.rows || 6;
                    AppState.cols = p.cols || 6;
                    AppState.spacing = p.spacing || 10;
                    AppState.units = p.units || 'm';
                    AppState.contourInterval = p.contourInterval || 1;
                    AppState.majorMultiplier = p.majorMultiplier || 5;

                    AppState.dataType = p.dataType || 'elevation';
                    AppState.benchmark = p.benchmark || 100;
                    AppState.backsight = p.backsight || 0;
                    AppState.hi = p.hi || (AppState.benchmark + (AppState.backsight / 100));
                    AppState.grid = data.grid;
                    AppState.fsGrid = data.fsGrid || null;

                    // Re-launch with imported data
                    launchApp();
                    return;
                }
            }

            // Try CSV
            const result = Spreadsheet.importCSV(text);
            if (result) {
                if (result.mode && result.mode !== AppState.dataType) {
                    AppState.dataType = result.mode;
                    // Re-launch to sync UI mode
                    launchApp();
                }
                if (result.rows) {
                    AppState.rows = result.rows;
                    AppState.cols = result.cols;
                }
                AppState.grid = Spreadsheet.getGrid();
                updateStats();
                regenerateContours();
                alert(`Imported ${file.name} successfully.`);
            } else {
                alert('Could not parse file. Please use CSV (PointID,Row,Col,Elevation) or JSON project format.');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // ============================================================
    // WINDOW RESIZE
    // ============================================================
    window.addEventListener('resize', () => {
        if (AppState.currentView === 'contour') {
            fitContourViewBox();
            GridRenderer.applyTransform();
        } else if (AppState.currentView === 'dem') {
            renderDEMView();
        } else if (AppState.currentView === 'analysis') {
            renderAnalysisView();
        }
    });

    function setupDemoPicker() {
        const pickerBtn = document.getElementById('btn-demo-picker');
        const pickerMenu = document.getElementById('demo-picker-menu');
        if (!pickerBtn || !pickerMenu) return;

        const types = ['Hill', 'Ridge', 'Valley', 'Depression', 'Saddle', 'Spur', 'Natural Land'];
        const sizes = [4, 5, 6, 7, 8];

        pickerMenu.innerHTML = types.map(t => `
            <div class="demo-type-item" data-type="${t.toLowerCase()}">
                <span>${t}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                <div class="demo-size-submenu">
                    ${sizes.map(s => `<div class="demo-size-item" data-type="${t.toLowerCase()}" data-size="${s}">${s}x${s}</div>`).join('')}
                </div>
            </div>
        `).join('');

        pickerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            pickerMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', () => pickerMenu.classList.add('hidden'));

        pickerMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.demo-size-item');
            if (item) {
                const type = item.dataset.type;
                const size = parseInt(item.dataset.size);

                if (size !== AppState.rows) {
                    AppState.rows = size;
                    AppState.cols = size;
                    // Re-init spreadsheet with correct signature: (containerId, rows, cols, callback, options)
                    Spreadsheet.init('spreadsheet-container', size, size, onGridChange, {
                        mode: AppState.dataType,
                        hi: AppState.hi
                    });
                }
                Spreadsheet.fillDemo(type);
                pickerMenu.classList.add('hidden');
            }
        });
    }

    // ============================================================
    // BOOT
    // ============================================================
    document.addEventListener('DOMContentLoaded', boot);

})();
