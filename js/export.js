/**
 * TerraGrid Pro — Export Module
 * PNG, PDF, DXF, JSON project file, CSV export
 */

const ExportEngine = (() => {

    // Helper to get critical SVG styles from document stylesheets
    function getEmbeddedStyles() {
        let css = '';
        try {
            for (const sheet of document.styleSheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        // Only include rules relevant to the SVG map elements
                        if (rule.selectorText && (
                            rule.selectorText.includes('contour-') ||
                            rule.selectorText.includes('grid-line') ||
                            rule.selectorText.includes('point-') ||
                            rule.selectorText.includes('elev-label') ||
                            rule.selectorText.includes('dem-')
                        )) {
                            css += rule.cssText + '\n';
                        }
                    }
                } catch (e) { /* skip cross-origin sheets */ }
            }
        } catch (e) { }
        return css;
    }

    function exportPNG(svgId, filename = 'terragrid-export.png') {
        const svg = document.getElementById(svgId);
        if (!svg) { alert('No map to export. Please switch to a map view.'); return; }

        // Clone and inject styles
        const clone = svg.cloneNode(true);
        const styles = getEmbeddedStyles();
        const styleTag = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleTag.textContent = styles;
        clone.insertBefore(styleTag, clone.firstChild);

        const svgData = new XMLSerializer().serializeToString(clone);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 3; // High DPI
            const vb = svg.viewBox.baseVal;
            const w = vb.width > 0 ? vb.width * scale : svg.clientWidth * scale;
            const h = vb.height > 0 ? vb.height * scale : svg.clientHeight * scale;

            // Add extra space for footer
            const footerH = 40 * scale;
            canvas.width = w;
            canvas.height = h + footerH;

            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.drawImage(img, 0, 0, w, h);

            // Branding Footer
            ctx.fillStyle = 'rgba(139, 148, 158, 0.8)';
            ctx.font = `${10 * scale}px Inter, sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText('Made with ❤️ by Ethun', canvas.width - 20 * scale, canvas.height - 15 * scale);

            URL.revokeObjectURL(url);

            canvas.toBlob(blob => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = filename;
                link.click();
            }, 'image/png');
        };
        img.src = url;
    }

    function exportPDF(svgId, projectName = 'TerraGrid Export') {
        const { jsPDF } = window.jspdf || {};
        if (!jsPDF) { alert('PDF library not loaded.'); return; }

        const svg = document.getElementById(svgId);
        if (!svg) { alert('No map to export.'); return; }

        // Clone and inject styles
        const clone = svg.cloneNode(true);
        const styles = getEmbeddedStyles();
        const styleTag = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleTag.textContent = styles;
        clone.insertBefore(styleTag, clone.firstChild);

        const svgData = new XMLSerializer().serializeToString(clone);
        const img = new Image();
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        img.onload = () => {
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();

            // Background
            doc.setFillColor(13, 17, 23);
            doc.rect(0, 0, pageW, pageH, 'F');

            // Header
            doc.setTextColor(230, 237, 243);
            doc.setFontSize(16);
            doc.text('TerraGrid Pro', 10, 12);
            doc.setFontSize(10);
            doc.setTextColor(139, 148, 158);
            doc.text(projectName, 10, 18);
            doc.text(new Date().toLocaleDateString(), pageW - 10, 18, { align: 'right' });

            // Map image
            const canvas = document.createElement('canvas');
            const scale = 2.5;
            const vb = svg.viewBox.baseVal;
            canvas.width = (vb.width > 0 ? vb.width : 800) * scale;
            canvas.height = (vb.height > 0 ? vb.height : 600) * scale;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0d1117';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const imgW = pageW - 20;
            const imgH = (pageH - 40);
            doc.addImage(dataUrl, 'JPEG', 10, 22, imgW, imgH);

            // Branding Footer
            doc.setFontSize(10);
            doc.setTextColor(139, 148, 158);
            doc.text('Made with ❤️ by Ethun', pageW - 10, pageH - 10, { align: 'right' });

            doc.setFontSize(8);
            doc.setTextColor(72, 79, 88);
            doc.text('Generated by TerraGrid Pro', 10, pageH - 10);

            doc.save(`${projectName.replace(/\s+/g, '_')}_contour.pdf`);
        };
        img.src = url;
    }

    function exportDXF(grid, rows, cols, spacing, contours, units, projectName) {
        // Generate AutoCAD DXF format
        const U = units || 'm';
        let dxf = '';

        // DXF Header section
        dxf += '0\nSECTION\n2\nHEADER\n';
        dxf += '9\n$ACADVER\n1\nAC1015\n';
        dxf += '9\n$INSUNITS\n70\n' + (U === 'm' ? '6' : '2') + '\n';
        dxf += '0\nENDSEC\n';

        // Layer definitions
        dxf += '0\nSECTION\n2\nTABLES\n';
        dxf += '0\nTABLE\n2\nLAYER\n';
        dxf += '0\nLAYER\n2\nGRID_POINTS\n70\n0\n62\n7\n6\nCONTINUOUS\n';
        dxf += '0\nLAYER\n2\nCONTOUR_MINOR\n70\n0\n62\n150\n6\nCONTINUOUS\n'; // Light blue
        dxf += '0\nLAYER\n2\nCONTOUR_MAJOR\n70\n0\n62\n5\n6\nCONTINUOUS\n';   // Blue
        dxf += '0\nLAYER\n2\nBRANDING\n70\n0\n62\n7\n6\nCONTINUOUS\n';
        dxf += '0\nENDTABLE\n0\nENDSEC\n';

        // Entities
        dxf += '0\nSECTION\n2\nENTITIES\n';

        // Grid points as POINT entities
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = grid[r] && grid[r][c];
                if (val == null) continue;
                const x = c * spacing;
                const y = (rows - 1 - r) * spacing; // Flip Y for DXF convention
                const z = val;
                dxf += `0\nPOINT\n8\nGRID_POINTS\n10\n${x.toFixed(4)}\n20\n${y.toFixed(4)}\n30\n${z.toFixed(4)}\n`;
                // Text label
                dxf += `0\nTEXT\n8\nGRID_POINTS\n10\n${x.toFixed(4)}\n20\n${y.toFixed(4)}\n30\n${z.toFixed(4)}\n40\n${(spacing * 0.15).toFixed(4)}\n1\n${Utils.pointId(r, c)}=${val.toFixed(2)}\n`;
            }
        }

        // Contour polylines
        for (const { level, isMajor, polylines } of (contours || [])) {
            const layer = isMajor ? 'CONTOUR_MAJOR' : 'CONTOUR_MINOR';
            for (const pts of polylines) {
                if (pts.length < 2) continue;
                dxf += `0\nPOLYLINE\n8\n${layer}\n66\n1\n39\n0\n`;
                for (const [px, py] of pts) {
                    const x = px * spacing;
                    const y = (rows - 1 - py) * spacing;
                    dxf += `0\nVERTEX\n8\n${layer}\n10\n${x.toFixed(4)}\n20\n${y.toFixed(4)}\n30\n${level.toFixed(4)}\n`;
                }
                dxf += '0\nSEQEND\n';
            }
        }

        // Branding entity
        const footX = (cols - 1) * spacing;
        const footY = -spacing * 0.5;
        dxf += `0\nTEXT\n8\nBRANDING\n10\n${footX.toFixed(4)}\n20\n${footY.toFixed(4)}\n30\n0\n40\n${(spacing * 0.25).toFixed(4)}\n72\n2\n11\n${footX.toFixed(4)}\n21\n${footY.toFixed(4)}\n1\nMade with <3 by Ethun\n`;

        dxf += '0\nENDSEC\n0\nEOF\n';

        const blob = new Blob([dxf], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${(projectName || 'terragrid').replace(/\s+/g, '_')}.dxf`;
        link.click();
    }

    function exportJSON(appState) {
        const data = {
            version: '1.0',
            exported: new Date().toISOString(),
            createdBy: 'Ethun',
            project: {
                name: appState.projectName,
                rows: appState.rows,
                cols: appState.cols,
                spacing: appState.spacing,
                units: appState.units,
                contourInterval: appState.contourInterval,
                majorMultiplier: appState.majorMultiplier,
                dataType: appState.dataType,
                benchmark: appState.benchmark,
                backsight: appState.backsight,
                hi: appState.hi,
            },
            grid: appState.grid,
            fsGrid: appState.fsGrid,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${(appState.projectName || 'terragrid').replace(/\s+/g, '_')}.json`;
        link.click();
    }

    function importJSON(text) {
        try {
            const data = JSON.parse(text);
            if (!data.project || !data.grid) return null;
            return data;
        } catch (e) {
            return null;
        }
    }

    function exportCSVData(grid, rows, cols, units) {
        const ss = Spreadsheet;
        const csvText = ss.exportCSV();
        const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'terragrid_elevation_data_by_ethun.csv';
        link.click();
    }

    // Get active SVG id based on current view
    function getActiveSVGId(currentView) {
        const map = {
            contour: 'contour-svg',
            dem: 'dem-svg',
            analysis: 'analysis-svg'
        };
        return map[currentView] || 'contour-svg';
    }

    return { exportPNG, exportPDF, exportDXF, exportJSON, importJSON, exportCSVData, getActiveSVGId };
})();
