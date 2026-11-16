// ============ PAINT STUDIO - Main Application ============

(function() {
    'use strict';

    // ---- State ----
    const state = {
        tool: 'brush',
        primaryColor: '#000000',
        secondaryColor: '#ffffff',
        brushSize: 5,
        opacity: 1,
        canvasBg: '#ffffff',
        shapeFill: false,
        zoom: 1,
        baseW: 0,
        baseH: 0,
        isDrawing: false,
        lastX: 0,
        lastY: 0,
        startX: 0,
        startY: 0,
        history: [],
        historyIndex: -1,
        maxHistory: 50,
        recentColors: [],
        textPosition: null,
        pendingImage: null,
        pendingAction: null,
        pendingOffsetX: 0,
        pendingOffsetY: 0,
        resizeAnchor: null,
    };

    // ---- DOM Elements ----
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    const overlayCanvas = document.getElementById('overlayCanvas');
    const overlayCtx = overlayCanvas.getContext('2d');
    const canvasWrapper = document.getElementById('canvasWrapper');
    const canvasViewport = document.getElementById('canvasViewport');

    // ---- Pan with middle mouse button (wheel click) ----
    const pan = { active: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 };

    // ---- Initialize Canvas ----
    function initCanvas() {
        const w = Math.max(800, canvasViewport.clientWidth - 40);
        const h = Math.max(500, canvasViewport.clientHeight - 40);
        canvas.width = w;
        canvas.height = h;
        overlayCanvas.width = w;
        overlayCanvas.height = h;
        state.baseW = w;
        state.baseH = h;
        applyZoomSize();
        document.getElementById('canvasSizeDisplay').textContent = `${w} × ${h}`;
        setCanvasBg(state.canvasBg);
        saveHistory();
    }

    // ---- Zoom ----
    const ZOOM_MIN = 0.25;
    const ZOOM_MAX = 8;

    function applyZoomSize() {
        const z = state.zoom;
        const w = Math.round(state.baseW * z);
        const h = Math.round(state.baseH * z);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        overlayCanvas.style.width = w + 'px';
        overlayCanvas.style.height = h + 'px';
        // Real Paint-like crisp pixels once zoomed in past 2x
        canvasWrapper.classList.toggle('pixelated', z >= 2);
        const badge = document.getElementById('zoomBadge');
        badge.textContent = Math.round(z * 100) + '%';
        badge.classList.remove('bump');
        void badge.offsetWidth;
        badge.classList.add('bump');
    }

    // Zoom so that the canvas point under the anchor stays under it afterwards.
    // Uses getBoundingClientRect for both measurements, so it is immune to
    // scroll position, viewport padding and centering offsets.
    function zoomAt(newZoom, clientX, clientY) {
        newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
        const oldZoom = state.zoom;
        if (Math.abs(newZoom - oldZoom) < 0.001) return;

        const vpRect = canvasViewport.getBoundingClientRect();
        const ax = clientX != null ? clientX : vpRect.left + vpRect.width / 2;
        const ay = clientY != null ? clientY : vpRect.top + vpRect.height / 2;

        // Canvas-space point under the anchor before zooming
        const beforeRect = canvas.getBoundingClientRect();
        const cx = (ax - beforeRect.left) / oldZoom;
        const cy = (ay - beforeRect.top) / oldZoom;

        state.zoom = newZoom;
        applyZoomSize();

        // Where that point ended up on screen, and the correction needed
        const afterRect = canvas.getBoundingClientRect();
        canvasViewport.scrollLeft += afterRect.left + cx * newZoom - ax;
        canvasViewport.scrollTop += afterRect.top + cy * newZoom - ay;

        if (state.pendingImage) renderPendingImage();
    }

    function resetZoom() {
        zoomAt(1);
        showToast('Масштаб сброшен: 100%');
    }

    function setCanvasBg(color) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ---- Color Palette ----
    const paletteColors = [
        '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#ffffff',
        '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff',
        '#4a86e8', '#0000ff', '#9900ff', '#ff00ff', '#e6b8af', '#f4cccc',
        '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3',
        '#d9d2e9', '#ead1dc', '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599',
        '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
    ];

    function buildPalette() {
        const paletteEl = document.getElementById('colorPalette');
        paletteColors.forEach(color => {
            const btn = document.createElement('div');
            btn.className = 'palette-color';
            btn.style.background = color;
            if (color === '#ffffff' || color === '#f5f5f5') {
                btn.style.border = '1px solid #444';
            }
            btn.dataset.color = color;
            btn.addEventListener('click', () => {
                state.primaryColor = color;
                updateColorUI();
                addRecentColor(color);
            });
            paletteEl.appendChild(btn);
        });
    }

    function updateColorUI() {
        document.getElementById('primaryColor').style.background = state.primaryColor;
        document.getElementById('secondaryColor').style.background = state.secondaryColor;
        document.getElementById('colorPicker').value = state.primaryColor;
        document.getElementById('hexInput').value = state.primaryColor;
        updateActivePaletteColor();
    }

    function updateActivePaletteColor() {
        document.querySelectorAll('.palette-color').forEach(el => {
            el.classList.toggle('active', el.dataset.color.toLowerCase() === state.primaryColor.toLowerCase());
        });
    }

    function addRecentColor(color) {
        const idx = state.recentColors.indexOf(color);
        if (idx > -1) state.recentColors.splice(idx, 1);
        state.recentColors.unshift(color);
        if (state.recentColors.length > 12) state.recentColors.pop();
        renderRecentColors();
    }

    function renderRecentColors() {
        const container = document.getElementById('recentColors');
        container.innerHTML = '';
        state.recentColors.forEach(color => {
            const el = document.createElement('div');
            el.className = 'recent-color';
            el.style.background = color;
            el.addEventListener('click', () => {
                state.primaryColor = color;
                updateColorUI();
            });
            container.appendChild(el);
        });
    }

    // ---- Tool Selection ----
    function selectTool(toolName) {
        state.tool = toolName;
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === toolName);
        });
        canvas.style.cursor = 'crosshair';

        const isShape = ['rect', 'circle', 'triangle'].includes(toolName);
        document.getElementById('fillToggleSection').style.display = isShape ? 'flex' : 'none';

        const toolNames = {
            brush: 'Кисть', eraser: 'Ластик', line: 'Линия', rect: 'Прямоугольник',
            circle: 'Круг', triangle: 'Треугольник', fill: 'Заливка', picker: 'Пипетка',
            spray: 'Спрей', text: 'Текст'
        };
        document.getElementById('toolDisplay').textContent = toolNames[toolName] || toolName;
    }

    // ---- Size Slider ----
    function updateSizePreview() {
        const preview = document.getElementById('sizePreview');
        const size = Math.max(2, Math.min(state.brushSize, 40));
        preview.innerHTML = '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:var(--accent);"></div>';
        document.getElementById('sizeValue').textContent = state.brushSize + 'px';
    }

    // ---- History (Undo/Redo) ----
    function saveHistory() {
        const data = canvas.toDataURL();
        if (state.historyIndex < state.history.length - 1) {
            state.history = state.history.slice(0, state.historyIndex + 1);
        }
        state.history.push(data);
        if (state.history.length > state.maxHistory) {
            state.history.shift();
        }
        state.historyIndex = state.history.length - 1;
        updateHistoryButtons();
    }

    function undo() {
        if (state.historyIndex > 0) {
            state.historyIndex--;
            restoreHistory();
        }
    }

    function redo() {
        if (state.historyIndex < state.history.length - 1) {
            state.historyIndex++;
            restoreHistory();
        }
    }

    function restoreHistory() {
        const img = new Image();
        img.onload = function() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = state.canvasBg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            updateHistoryButtons();
        };
        img.src = state.history[state.historyIndex];
    }

    function updateHistoryButtons() {
        document.getElementById('undoBtn').classList.toggle('disabled', state.historyIndex <= 0);
        document.getElementById('redoBtn').classList.toggle('disabled', state.historyIndex >= state.history.length - 1);
    }

    // ---- Drawing Functions ----
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height)
        };
    }

    function startDraw(e) {
        // Middle mouse button → pan, not draw
        if (e.button != null && e.button !== 0) return;
        const coords = getCanvasCoords(e);

        // Floating image captures the mouse first
        if (state.pendingImage) {
            const hit = hitTestPending(coords);
            if (hit === 'move') {
                state.pendingAction = 'move';
                state.pendingOffsetX = coords.x - state.pendingImage.x;
                state.pendingOffsetY = coords.y - state.pendingImage.y;
                return;
            }
            if (hit) {
                state.pendingAction = hit;
                const pi = state.pendingImage;
                const anchors = {
                    'resize-nw': { x: pi.x + pi.w, y: pi.y + pi.h },
                    'resize-ne': { x: pi.x, y: pi.y + pi.h },
                    'resize-sw': { x: pi.x + pi.w, y: pi.y },
                    'resize-se': { x: pi.x, y: pi.y },
                };
                state.resizeAnchor = anchors[hit];
                return;
            }
            // Click outside the frame — commit and continue with the normal tool
            commitPendingImage();
        }

        if (state.tool === 'picker') {
            pickColor(coords.x, coords.y);
            return;
        }

        if (state.tool === 'fill') {
            floodFill(Math.round(coords.x), Math.round(coords.y), state.primaryColor);
            saveHistory();
            return;
        }

        if (state.tool === 'text') {
            state.textPosition = coords;
            openTextModal();
            return;
        }

        state.isDrawing = true;
        state.startX = coords.x;
        state.startY = coords.y;
        state.lastX = coords.x;
        state.lastY = coords.y;

        ctx.globalAlpha = state.opacity;

        if (state.tool === 'brush') {
            ctx.strokeStyle = state.primaryColor;
            ctx.lineWidth = state.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(coords.x, coords.y);
            ctx.lineTo(coords.x + 0.1, coords.y + 0.1);
            ctx.stroke();
        } else if (state.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
            ctx.lineWidth = state.brushSize * 2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(coords.x, coords.y);
            ctx.lineTo(coords.x + 0.1, coords.y + 0.1);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
        } else if (state.tool === 'spray') {
            sprayAt(coords.x, coords.y, state.primaryColor, state.brushSize);
        }
    }

    function draw(e) {
        const coords = getCanvasCoords(e);
        document.getElementById('coordsDisplay').textContent = 'X: ' + Math.round(coords.x) + ', Y: ' + Math.round(coords.y);

        // Manipulating the floating image
        if (state.pendingImage && state.pendingAction) {
            const pi = state.pendingImage;
            if (state.pendingAction === 'move') {
                pi.x = coords.x - state.pendingOffsetX;
                pi.y = coords.y - state.pendingOffsetY;
            } else if (state.resizeAnchor) {
                const a = state.resizeAnchor;
                const dx = coords.x - a.x;
                const dy = coords.y - a.y;
                let w = Math.abs(dx);
                let h = w / pi.aspect;
                if (h < Math.abs(dy)) {
                    h = Math.abs(dy);
                    w = h * pi.aspect;
                }
                if (w < 10) { w = 10; h = w / pi.aspect; }
                pi.w = w;
                pi.h = h;
                pi.x = dx >= 0 ? a.x : a.x - w;
                pi.y = dy >= 0 ? a.y : a.y - h;
            }
            renderPendingImage();
            return;
        }

        if (!state.isDrawing) return;

        if (state.tool === 'brush') {
            ctx.beginPath();
            ctx.moveTo(state.lastX, state.lastY);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
            state.lastX = coords.x;
            state.lastY = coords.y;
        }

        if (state.tool === 'eraser') {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.moveTo(state.lastX, state.lastY);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            state.lastX = coords.x;
            state.lastY = coords.y;
        }

        if (state.tool === 'spray') {
            sprayAt(coords.x, coords.y, state.primaryColor, state.brushSize);
        }

        // Preview shapes on overlay
        if (['line', 'rect', 'circle', 'triangle'].includes(state.tool)) {
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
            overlayCtx.globalAlpha = state.opacity;
            overlayCtx.strokeStyle = state.primaryColor;
            overlayCtx.fillStyle = state.primaryColor;
            overlayCtx.lineWidth = state.brushSize;
            overlayCtx.lineCap = 'round';
            overlayCtx.lineJoin = 'round';

            const fill = state.shapeFill;

            if (state.tool === 'line') {
                overlayCtx.beginPath();
                overlayCtx.moveTo(state.startX, state.startY);
                overlayCtx.lineTo(coords.x, coords.y);
                overlayCtx.stroke();
            } else if (state.tool === 'rect') {
                const w = coords.x - state.startX;
                const h = coords.y - state.startY;
                if (fill) overlayCtx.fillRect(state.startX, state.startY, w, h);
                overlayCtx.strokeRect(state.startX, state.startY, w, h);
            } else if (state.tool === 'circle') {
                const rx = Math.abs(coords.x - state.startX) / 2;
                const ry = Math.abs(coords.y - state.startY) / 2;
                const cx = state.startX + (coords.x - state.startX) / 2;
                const cy = state.startY + (coords.y - state.startY) / 2;
                overlayCtx.beginPath();
                overlayCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                if (fill) overlayCtx.fill();
                overlayCtx.stroke();
            } else if (state.tool === 'triangle') {
                const midX = (state.startX + coords.x) / 2;
                overlayCtx.beginPath();
                overlayCtx.moveTo(midX, state.startY);
                overlayCtx.lineTo(coords.x, coords.y);
                overlayCtx.lineTo(state.startX, coords.y);
                overlayCtx.closePath();
                if (fill) overlayCtx.fill();
                overlayCtx.stroke();
            }
        }
    }

    function endDraw(e) {
        // Finish floating image manipulation
        if (state.pendingImage && state.pendingAction) {
            state.pendingAction = null;
            state.resizeAnchor = null;
            return;
        }

        if (!state.isDrawing) return;
        state.isDrawing = false;

        const coords = getCanvasCoords(e);

        // Commit shape to main canvas
        if (['line', 'rect', 'circle', 'triangle'].includes(state.tool)) {
            ctx.globalAlpha = state.opacity;
            ctx.strokeStyle = state.primaryColor;
            ctx.fillStyle = state.primaryColor;
            ctx.lineWidth = state.brushSize;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            const fill = state.shapeFill;

            if (state.tool === 'line') {
                ctx.beginPath();
                ctx.moveTo(state.startX, state.startY);
                ctx.lineTo(coords.x, coords.y);
                ctx.stroke();
            } else if (state.tool === 'rect') {
                const w = coords.x - state.startX;
                const h = coords.y - state.startY;
                if (fill) ctx.fillRect(state.startX, state.startY, w, h);
                ctx.strokeRect(state.startX, state.startY, w, h);
            } else if (state.tool === 'circle') {
                const rx = Math.abs(coords.x - state.startX) / 2;
                const ry = Math.abs(coords.y - state.startY) / 2;
                const cx = state.startX + (coords.x - state.startX) / 2;
                const cy = state.startY + (coords.y - state.startY) / 2;
                ctx.beginPath();
                ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                if (fill) ctx.fill();
                ctx.stroke();
            } else if (state.tool === 'triangle') {
                const midX = (state.startX + coords.x) / 2;
                ctx.beginPath();
                ctx.moveTo(midX, state.startY);
                ctx.lineTo(coords.x, coords.y);
                ctx.lineTo(state.startX, coords.y);
                ctx.closePath();
                if (fill) ctx.fill();
                ctx.stroke();
            }

            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        saveHistory();
    }

    // ---- Spray Effect ----
    function sprayAt(x, y, color, radius) {
        ctx.fillStyle = color;
        const density = radius * 3;
        for (let i = 0; i < density; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * radius;
            const px = x + r * Math.cos(angle);
            const py = y + r * Math.sin(angle);
            ctx.fillRect(px, py, 1, 1);
        }
    }

    // ---- Flood Fill ----
    function floodFill(startX, startY, fillColor) {
        if (startX < 0 || startY < 0 || startX >= canvas.width || startY >= canvas.height) return;

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        const startIdx = (startY * w + startX) * 4;
        const startR = data[startIdx];
        const startG = data[startIdx + 1];
        const startB = data[startIdx + 2];
        const startA = data[startIdx + 3];

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = fillColor;
        tempCtx.fillRect(0, 0, 1, 1);
        const fc = tempCtx.getImageData(0, 0, 1, 1).data;

        if (startR === fc[0] && startG === fc[1] && startB === fc[2] && startA === fc[3]) return;

        const tolerance = 32;
        const stack = [[startX, startY]];
        const visited = new Set();

        function matches(idx) {
            return Math.abs(data[idx] - startR) <= tolerance &&
                   Math.abs(data[idx + 1] - startG) <= tolerance &&
                   Math.abs(data[idx + 2] - startB) <= tolerance &&
                   Math.abs(data[idx + 3] - startA) <= tolerance;
        }

        while (stack.length > 0) {
            const [cx, cy] = stack.pop();
            const key = cy * w + cx;
            if (cx < 0 || cx >= w || cy < 0 || cy >= h || visited.has(key)) continue;

            const idx = key * 4;
            if (!matches(idx)) continue;

            visited.add(key);
            data[idx] = fc[0];
            data[idx + 1] = fc[1];
            data[idx + 2] = fc[2];
            data[idx + 3] = fc[3];

            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // ---- Color Picker ----
    function pickColor(x, y) {
        const pixel = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        const hex = '#' + [pixel[0], pixel[1], pixel[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        state.primaryColor = hex;
        updateColorUI();
        addRecentColor(hex);
        showToast('Цвет: ' + hex);
    }

    // ---- Text Tool ----
    function openTextModal() {
        const modal = document.getElementById('textModal');
        modal.classList.add('active');
        document.getElementById('textInput').value = '';
        setTimeout(() => document.getElementById('textInput').focus(), 100);
    }

    function closeTextModal() {
        document.getElementById('textModal').classList.remove('active');
    }

    function placeText() {
        const text = document.getElementById('textInput').value;
        if (!text || !state.textPosition) {
            closeTextModal();
            return;
        }

        ctx.globalAlpha = state.opacity;
        ctx.fillStyle = state.primaryColor;
        ctx.font = (state.brushSize * 3 + 14) + 'px Inter, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(text, state.textPosition.x, state.textPosition.y);
        ctx.globalAlpha = 1;

        state.textPosition = null;
        closeTextModal();
        saveHistory();
    }

    // ---- Save ----
    function saveImage() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.fillStyle = state.canvasBg;
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0);

        const link = document.createElement('a');
        link.download = 'paint-studio-' + Date.now() + '.png';
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
        showToast('Изображение сохранено!');
    }

    // ---- Clear ----
    function clearCanvas() {
        ctx.fillStyle = state.canvasBg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        saveHistory();
        showToast('Холст очищен');
    }

    // ---- Image Insertion ----
    function insertImage(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() { createPendingImage(img); };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ---- Floating Image (move + scale before placement) ----
    function createPendingImage(img) {
        let w = img.width;
        let h = img.height;
        const maxW = canvas.width - 60;
        const maxH = canvas.height - 60;
        if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
        }
        state.pendingImage = {
            img: img,
            x: (canvas.width - w) / 2,
            y: (canvas.height - h) / 2,
            w: w,
            h: h,
            aspect: w / h,
        };
        state.pendingAction = null;
        state.resizeAnchor = null;
        renderPendingImage();
        showToast('Рамка: тяни за уголки — масштаб · Enter — разместить · Esc — отмена');
    }

    function pendingCorners(pi) {
        return [
            { name: 'resize-nw', x: pi.x, y: pi.y },
            { name: 'resize-ne', x: pi.x + pi.w, y: pi.y },
            { name: 'resize-sw', x: pi.x, y: pi.y + pi.h },
            { name: 'resize-se', x: pi.x + pi.w, y: pi.y + pi.h },
        ];
    }

    function hitTestPending(coords) {
        const pi = state.pendingImage;
        if (!pi) return null;
        const r = 12;
        for (const c of pendingCorners(pi)) {
            if (Math.abs(coords.x - c.x) <= r && Math.abs(coords.y - c.y) <= r) return c.name;
        }
        if (coords.x >= pi.x && coords.x <= pi.x + pi.w && coords.y >= pi.y && coords.y <= pi.y + pi.h) return 'move';
        return null;
    }

    function renderPendingImage() {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        const pi = state.pendingImage;
        if (!pi) return;

        overlayCtx.globalAlpha = 1;
        overlayCtx.drawImage(pi.img, pi.x, pi.y, pi.w, pi.h);

        // Selection frame
        overlayCtx.strokeStyle = '#6c63ff';
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([8, 5]);
        overlayCtx.strokeRect(pi.x, pi.y, pi.w, pi.h);
        overlayCtx.setLineDash([]);

        // Corner handles
        const hs = 10;
        pendingCorners(pi).forEach(c => {
            overlayCtx.fillStyle = '#ffffff';
            overlayCtx.strokeStyle = '#6c63ff';
            overlayCtx.lineWidth = 2;
            overlayCtx.fillRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
            overlayCtx.strokeRect(c.x - hs / 2, c.y - hs / 2, hs, hs);
        });

        // Size label
        const label = Math.round(pi.w) + ' × ' + Math.round(pi.h);
        overlayCtx.font = '600 13px Inter, sans-serif';
        const tw = overlayCtx.measureText(label).width;
        const lx = pi.x + pi.w / 2 - tw / 2 - 8;
        const ly = Math.max(2, pi.y - 26);
        overlayCtx.fillStyle = 'rgba(108, 99, 255, 0.9)';
        if (typeof overlayCtx.roundRect === 'function') {
            overlayCtx.beginPath();
            overlayCtx.roundRect(lx, ly, tw + 16, 22, 6);
            overlayCtx.fill();
        } else {
            overlayCtx.fillRect(lx, ly, tw + 16, 22);
        }
        overlayCtx.fillStyle = '#ffffff';
        overlayCtx.fillText(label, lx + 8, ly + 15);
    }

    function commitPendingImage() {
        const pi = state.pendingImage;
        if (!pi) return;
        ctx.globalAlpha = 1;
        ctx.drawImage(pi.img, pi.x, pi.y, pi.w, pi.h);
        state.pendingImage = null;
        state.pendingAction = null;
        state.resizeAnchor = null;
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        saveHistory();
        showToast('Картинка размещена: ' + Math.round(pi.w) + '×' + Math.round(pi.h));
    }

    function cancelPendingImage() {
        state.pendingImage = null;
        state.pendingAction = null;
        state.resizeAnchor = null;
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        showToast('Вставка отменена');
    }

    // ---- Toast ----
    function showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // ---- Custom Cursor ----
    function updateCustomCursor(e) {
        const rect = canvasWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        let cursor = canvasWrapper.querySelector('.custom-cursor');
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.className = 'custom-cursor';
            canvasWrapper.appendChild(cursor);
        }

        const size = Math.max(state.brushSize * 2 * state.zoom, 6);
        cursor.style.cssText = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px;border-radius:50%;border:2px solid rgba(108,99,255,0.8);pointer-events:none;transform:translate(-50%,-50%);z-index:100;';
        if (state.tool === 'eraser') {
            cursor.style.borderColor = 'rgba(255,101,132,0.8)';
        }
    }

    function removeCustomCursor() {
        const cursor = canvasWrapper.querySelector('.custom-cursor');
        if (cursor) cursor.remove();
    }

    // ---- Event Listeners ----

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', (e) => {
        // While middle-drag panning, keep the hand cursor and skip drawing
        if (pan.active) {
            canvas.style.cursor = 'grabbing';
            removeCustomCursor();
            return;
        }
        draw(e);
        if (state.pendingImage) {
            removeCustomCursor();
            if (!state.pendingAction) {
                const coords = getCanvasCoords(e);
                const hit = hitTestPending(coords);
                const cursors = {
                    'resize-nw': 'nwse-resize', 'resize-se': 'nwse-resize',
                    'resize-ne': 'nesw-resize', 'resize-sw': 'nesw-resize',
                    'move': 'move',
                };
                canvas.style.cursor = cursors[hit] || 'crosshair';
            }
            return;
        }
        canvas.style.cursor = 'crosshair';
        updateCustomCursor(e);
    });
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('dblclick', () => {
        if (state.pendingImage) commitPendingImage();
    });
    canvas.addEventListener('mouseleave', (e) => {
        if (state.isDrawing) endDraw(e);
        if (state.pendingImage) { state.pendingAction = null; state.resizeAnchor = null; }
        removeCustomCursor();
    });
    canvas.addEventListener('mouseenter', (e) => {
        updateCustomCursor(e);
    });

    // Touch support
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        startDraw({ clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        draw({ clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        endDraw({ clientX: touch.clientX, clientY: touch.clientY });
    }, { passive: false });

    // Ctrl + wheel — zoom towards cursor
    canvasViewport.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey) return; // plain wheel just scrolls
        e.preventDefault();

        // Pinch gestures report small deltas; wheel notches report ~100
        const unit = Math.abs(e.deltaY) > 40 ? e.deltaY / 100 : e.deltaY;
        const factor = Math.pow(0.9, unit);
        zoomAt(state.zoom * factor, e.clientX, e.clientY);
    }, { passive: false });

    document.getElementById('zoomBadge').addEventListener('click', resetZoom);

    // ---- Pan with middle mouse button (wheel click) ----
    function startPan(e) {
        pan.active = true;
        pan.startX = e.clientX;
        pan.startY = e.clientY;
        pan.scrollLeft = canvasViewport.scrollLeft;
        pan.scrollTop = canvasViewport.scrollTop;
        canvasViewport.classList.add('panning');
        removeCustomCursor();
        // Stop any in-progress stroke so the drag doesn't leave a stray mark
        if (state.isDrawing) { state.isDrawing = false; }
        state.pendingAction = null;
        state.resizeAnchor = null;
        document.addEventListener('mousemove', onPanMove);
    }

    function onPanMove(e) {
        if (!pan.active) return;
        canvasViewport.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
        canvasViewport.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
    }

    function endPan() {
        if (!pan.active) return;
        pan.active = false;
        canvasViewport.classList.remove('panning');
        canvas.style.cursor = 'crosshair';
        document.removeEventListener('mousemove', onPanMove);
    }

    // Started from the viewport so it also works over the canvas and the gaps
    canvasViewport.addEventListener('mousedown', (e) => {
        if (e.button !== 1) return;
        e.preventDefault(); // suppress browser autoscroll / middle-click paste
        startPan(e);
    }, true);

    // Releasing the middle button anywhere ends the pan
    document.addEventListener('mouseup', (e) => {
        if (e.button === 1) endPan();
    });

    // Losing focus mid-drag should not leave the app stuck in pan mode
    window.addEventListener('blur', endPan);

    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.addEventListener('click', () => selectTool(btn.dataset.tool));
    });

    // Size slider
    document.getElementById('sizeSlider').addEventListener('input', (e) => {
        state.brushSize = parseInt(e.target.value);
        updateSizePreview();
    });

    // Opacity slider
    document.getElementById('opacitySlider').addEventListener('input', (e) => {
        state.opacity = parseInt(e.target.value) / 100;
        document.getElementById('opacityValue').textContent = e.target.value + '%';
    });

    // Shape fill toggle
    document.getElementById('shapeFillToggle').addEventListener('change', (e) => {
        state.shapeFill = e.target.checked;
    });

    // Color picker
    document.getElementById('colorPicker').addEventListener('input', (e) => {
        state.primaryColor = e.target.value;
        updateColorUI();
        addRecentColor(e.target.value);
    });

    // Hex input
    document.getElementById('hexInput').addEventListener('change', (e) => {
        let val = e.target.value.trim();
        if (!val.startsWith('#')) val = '#' + val;
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            state.primaryColor = val;
            updateColorUI();
            addRecentColor(val);
        }
    });

    // Swap colors
    document.getElementById('swapColors').addEventListener('click', () => {
        const tmp = state.primaryColor;
        state.primaryColor = state.secondaryColor;
        state.secondaryColor = tmp;
        updateColorUI();
    });

    // Background buttons
    document.querySelectorAll('.bg-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bg-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.canvasBg = btn.dataset.bg;

            // Preserve current drawing and change bg
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = state.canvasBg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.putImageData(imgData, 0, 0);
            saveHistory();
        });
    });

    // Undo/Redo
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);

    // Clear
    document.getElementById('clearBtn').addEventListener('click', () => {
        if (confirm('Очистить холст?')) clearCanvas();
    });

    // Save
    document.getElementById('saveBtn').addEventListener('click', saveImage);

    // Text modal
    document.getElementById('textCancel').addEventListener('click', closeTextModal);
    document.getElementById('textConfirm').addEventListener('click', placeText);
    document.getElementById('textInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') placeText();
        if (e.key === 'Escape') closeTextModal();
    });
    document.getElementById('textModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeTextModal();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('textModal').classList.contains('active')) return;
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

        const ctrl = e.ctrlKey || e.metaKey;
        const shift = e.shiftKey;

        // Floating image hotkeys
        if (state.pendingImage) {
            if (e.key === 'Enter') { e.preventDefault(); commitPendingImage(); return; }
            if (e.key === 'Escape') { e.preventDefault(); cancelPendingImage(); return; }
            const step = e.shiftKey ? 10 : 1;
            const pi = state.pendingImage;
            if (e.key === 'ArrowLeft')  { e.preventDefault(); pi.x -= step; renderPendingImage(); return; }
            if (e.key === 'ArrowRight') { e.preventDefault(); pi.x += step; renderPendingImage(); return; }
            if (e.key === 'ArrowUp')    { e.preventDefault(); pi.y -= step; renderPendingImage(); return; }
            if (e.key === 'ArrowDown')  { e.preventDefault(); pi.y += step; renderPendingImage(); return; }
        }

        if (ctrl && e.key === 'z') { e.preventDefault(); undo(); }
        if (ctrl && e.key === 'y') { e.preventDefault(); redo(); }
        if (ctrl && shift && e.key === 'Z') { e.preventDefault(); redo(); }
        if (ctrl && e.key === 's') { e.preventDefault(); saveImage(); }
        if (ctrl && e.key === 'o') { e.preventDefault(); imageFileInput.click(); }

        // Zoom shortcuts
        if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(state.zoom * 1.25); }
        if (ctrl && e.key === '-') { e.preventDefault(); zoomAt(state.zoom / 1.25); }
        if (ctrl && e.key === '0') { e.preventDefault(); resetZoom(); }

        const toolKeys = { b: 'brush', e: 'eraser', l: 'line', r: 'rect', c: 'circle', t: 'triangle', f: 'fill', i: 'picker', s: 'spray', x: 'text' };
        if (!ctrl && !shift && toolKeys[e.key.toLowerCase()]) {
            selectTool(toolKeys[e.key.toLowerCase()]);
        }

        if (e.key === '[') {
            state.brushSize = Math.max(1, state.brushSize - 2);
            document.getElementById('sizeSlider').value = state.brushSize;
            updateSizePreview();
        }
        if (e.key === ']') {
            state.brushSize = Math.min(80, state.brushSize + 2);
            document.getElementById('sizeSlider').value = state.brushSize;
            updateSizePreview();
        }

        if (shift && e.key.toLowerCase() === 'x') {
            const tmp = state.primaryColor;
            state.primaryColor = state.secondaryColor;
            state.secondaryColor = tmp;
            updateColorUI();
        }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- Image Insertion Listeners ----
    const imageFileInput = document.getElementById('imageFileInput');

    document.getElementById('insertImageBtn').addEventListener('click', () => {
        imageFileInput.click();
    });

    imageFileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            insertImage(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Ctrl+V — paste image from clipboard
    document.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                insertImage(item.getAsFile());
                return;
            }
        }
    });

    // Drag & drop image onto canvas
    canvasWrapper.addEventListener('dragover', (e) => {
        e.preventDefault();
        canvasWrapper.style.outline = '2px dashed var(--accent)';
    });

    canvasWrapper.addEventListener('dragleave', (e) => {
        e.preventDefault();
        canvasWrapper.style.outline = 'none';
    });

    canvasWrapper.addEventListener('drop', (e) => {
        e.preventDefault();
        canvasWrapper.style.outline = 'none';
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) {
            insertImage(file);
            return;
        }
        // Drop of image from another browser tab (URL)
        const url = e.dataTransfer.getData('text/uri-list');
        if (url) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function() {
                // If a pending image exists, cancel it and use the new one
                state.pendingImage = null;
                overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                createPendingImage(img);
            };
            img.onerror = function() {
                showToast('Не удалось загрузить картинку по ссылке');
            };
            img.src = url;
        }
    });

    // ---- Initialize ----
    buildPalette();
    initCanvas();
    updateSizePreview();
    updateColorUI();
    selectTool('brush');

    console.log('%c🎨 Paint Studio loaded!', 'color: #6c63ff; font-size: 16px; font-weight: bold;');
    console.log('%cShortcuts: B=Brush E=Eraser L=Line R=Rect C=Circle T=Triangle F=Fill I=Picker S=Spray X=Text', 'color: #a0a0b8; font-size: 11px;');

})();