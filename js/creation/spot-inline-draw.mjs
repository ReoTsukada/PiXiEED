import { beginDrawStroke, cancelDrawStroke, commitDrawStroke, createDrawHistory, documentRgba, strokePixels, validateDrawDocument } from './draw-core.mjs?rev=20261001-animation-1';

/** A small independent dot editor. The supplied original is display-only. */
export function mountSpotInlineDraw(options) {
  const { canvas, paletteHost, penButton, eraserButton, undoButton, redoButton, originalButton, addColorInput, finishButton, status, onFinish, onChange = () => {} } = options;
  validateDrawDocument(options.original); validateDrawDocument(options.working);
  if (options.original.width !== options.working.width || options.original.height !== options.working.height) throw new RangeError('元の絵と複製した絵の大きさが違います。');
  const original = structuredClone(options.original); const documentData = structuredClone(options.working); const history = createDrawHistory(documentData);
  const abort = new AbortController(); const signal = abort.signal;
  canvas.style.transform = '';
  let selectedColor = Math.max(0, documentData.palette.findIndex((color) => color.slice(0, 7).toLowerCase() === '#f2a433'));
  let erasing = false; let showingOriginal = false; let pointerId = null; let tracker = null; let lastPoint = null; const pointers = new Map(); let gestureStart = null; let zoom = 1; let panX = 0; let panY = 0;
  const say = (text) => { if (status) status.textContent = text; };
  function updateHistoryControls() { undoButton.disabled = !history.canUndo; redoButton.disabled = !history.canRedo; }
  function paint() {
    const image = showingOriginal ? original : documentData;
    canvas.width = image.width; canvas.height = image.height;
    canvas.style.setProperty('--spot-inline-aspect', String(image.width / image.height));
    canvas.getContext('2d', { alpha: true }).putImageData(new ImageData(new Uint8ClampedArray(documentRgba(image)), image.width, image.height), 0, 0);
    updateHistoryControls();
  }
  function applyCanvasTransform() { canvas.style.transform = `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`; }
  function renderPalette() {
    paletteHost.replaceChildren();
    documentData.palette.forEach((color, index) => {
      if (color.slice(0, 7).toLowerCase() === '#000000' && color.length === 9 && color.endsWith('00')) return;
      const button = document.createElement('button'); button.type = 'button'; button.style.setProperty('--spot-draw-color', color.slice(0, 7));
      button.setAttribute('aria-label', `色${index + 1} ${color.slice(0, 7)}`); button.title = color.slice(0, 7); button.setAttribute('aria-pressed', String(index === selectedColor));
      button.addEventListener('click', () => { selectedColor = index; erasing = false; penButton.setAttribute('aria-pressed', 'true'); eraserButton.setAttribute('aria-pressed', 'false'); showingOriginal = false; originalButton.setAttribute('aria-pressed', 'false'); renderPalette(); paint(); }, { signal });
      paletteHost.append(button);
    });
    if (addColorInput) addColorInput.disabled = documentData.palette.length >= 32;
  }
  function pointFrom(event) {
    const rect = canvas.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return null;
    // Match this canvas's centered object-fit:contain bitmap, excluding its border and empty margins.
    const style = getComputedStyle(canvas); const scale = zoom || 1;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0; const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0; const borderBottom = parseFloat(style.borderBottomWidth) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0; const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0; const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const contentWidth = rect.width / scale - borderLeft - borderRight - paddingLeft - paddingRight;
    const contentHeight = rect.height / scale - borderTop - borderBottom - paddingTop - paddingBottom;
    if (contentWidth <= 0 || contentHeight <= 0) return null;
    const fit = Math.min(contentWidth / documentData.width, contentHeight / documentData.height);
    const imageWidth = documentData.width * fit; const imageHeight = documentData.height * fit;
    const imageLeft = borderLeft + paddingLeft + (contentWidth - imageWidth) / 2;
    const imageTop = borderTop + paddingTop + (contentHeight - imageHeight) / 2;
    const localX = (event.clientX - rect.left) / scale - imageLeft;
    const localY = (event.clientY - rect.top) / scale - imageTop;
    if (localX < 0 || localY < 0 || localX >= imageWidth || localY >= imageHeight) return null;
    const x = Math.floor(localX * documentData.width / imageWidth); const y = Math.floor(localY * documentData.height / imageHeight);
    return x < 0 || y < 0 || x >= documentData.width || y >= documentData.height ? null : { x, y };
  }
  function getCanvasBaseCenter(rect = canvas.getBoundingClientRect(), currentPanX = panX, currentPanY = panY) {
    return { x: rect.left + rect.width / 2 - currentPanX, y: rect.top + rect.height / 2 - currentPanY };
  }
  function panForFocus(focusX, focusY, anchorX, anchorY, baseCenterX, baseCenterY, basePanX, basePanY, ratio) {
    return {
      x: focusX - baseCenterX - (anchorX - baseCenterX - basePanX) * ratio,
      y: focusY - baseCenterY - (anchorY - baseCenterY - basePanY) * ratio,
    };
  }
  function drawTo(point) {
    if (!tracker || showingOriginal || !lastPoint) return;
    strokePixels(documentData, lastPoint, point, erasing ? -1 : selectedColor, { trusted: true, tracker }); lastPoint = point; paint();
  }
  const cancelActiveStroke = () => { if (tracker) cancelDrawStroke(documentData, tracker); tracker = null; pointerId = null; lastPoint = null; paint(); };
  canvas.addEventListener('pointerdown', (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      cancelActiveStroke();
      const values = [...pointers.values()]; const centerX = (values[0].x + values[1].x) / 2; const centerY = (values[0].y + values[1].y) / 2; const center = getCanvasBaseCenter();
      gestureStart = { distance: Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y) || 1, scale: zoom, centerX, centerY, canvasCenterX: center.x, canvasCenterY: center.y, panX, panY };
      try { canvas.setPointerCapture(event.pointerId); } catch {} event.preventDefault(); return;
    }
    if (showingOriginal || event.button !== 0) return;
    const point = pointFrom(event); if (!point) return;
    event.preventDefault(); pointerId = event.pointerId; canvas.setPointerCapture(pointerId); tracker = beginDrawStroke(documentData, { trusted: true }); lastPoint = point;
    strokePixels(documentData, point, point, erasing ? -1 : selectedColor, { trusted: true, tracker }); paint();
  }, { signal });
  canvas.addEventListener('pointermove', (event) => { if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && gestureStart) { const values = [...pointers.values()]; const distance = Math.hypot(values[1].x - values[0].x, values[1].y - values[0].y); const nextZoom = Math.max(1, Math.min(16, gestureStart.scale * distance / gestureStart.distance)); const ratio = nextZoom / gestureStart.scale; const centerX = (values[0].x + values[1].x) / 2; const centerY = (values[0].y + values[1].y) / 2; const nextPan = panForFocus(centerX, centerY, gestureStart.centerX, gestureStart.centerY, gestureStart.canvasCenterX, gestureStart.canvasCenterY, gestureStart.panX, gestureStart.panY, ratio); zoom = nextZoom; panX = zoom === 1 ? 0 : nextPan.x; panY = zoom === 1 ? 0 : nextPan.y; applyCanvasTransform(); event.preventDefault(); return; }
    if (event.pointerId === pointerId) { const point = pointFrom(event); if (point) drawTo(point); } }, { signal });
  const finishStroke = (event, cancel = false) => { if (event.pointerId !== pointerId || !tracker) return; if (cancel) cancelDrawStroke(documentData, tracker); else { commitDrawStroke(documentData, history, tracker); onChange(); } pointerId = null; tracker = null; lastPoint = null; paint(); };
  canvas.addEventListener('pointerup', (event) => finishStroke(event), { signal });
  canvas.addEventListener('pointercancel', (event) => finishStroke(event, true), { signal });
  canvas.addEventListener('lostpointercapture', (event) => finishStroke(event, true), { signal });
  const finishGesture = (event) => { pointers.delete(event.pointerId); if (pointers.size < 2) gestureStart = null; };
  canvas.addEventListener('pointerup', finishGesture, { signal }); canvas.addEventListener('pointercancel', finishGesture, { signal }); canvas.addEventListener('lostpointercapture', finishGesture, { signal });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault(); const nextZoom = Math.max(1, Math.min(16, zoom * (event.deltaY < 0 ? 1.12 : 0.89))); const ratio = nextZoom / zoom;
    const center = getCanvasBaseCenter();
    const nextPan = panForFocus(event.clientX, event.clientY, event.clientX, event.clientY, center.x, center.y, panX, panY, ratio);
    zoom = nextZoom; panX = zoom === 1 ? 0 : nextPan.x; panY = zoom === 1 ? 0 : nextPan.y; applyCanvasTransform();
  }, { signal, passive: false });
  penButton.addEventListener('click', () => { erasing = false; penButton.setAttribute('aria-pressed', 'true'); eraserButton.setAttribute('aria-pressed', 'false'); }, { signal });
  eraserButton.addEventListener('click', () => { erasing = true; eraserButton.setAttribute('aria-pressed', 'true'); penButton.setAttribute('aria-pressed', 'false'); }, { signal });
  undoButton.addEventListener('click', () => { if (tracker || !history.canUndo) return; showingOriginal = false; originalButton.setAttribute('aria-pressed', 'false'); history.undo(); paint(); onChange(); }, { signal });
  redoButton.addEventListener('click', () => { if (tracker || !history.canRedo) return; showingOriginal = false; originalButton.setAttribute('aria-pressed', 'false'); history.redo(); paint(); onChange(); }, { signal });
  originalButton.addEventListener('click', () => { showingOriginal = !showingOriginal; originalButton.setAttribute('aria-pressed', String(showingOriginal)); originalButton.setAttribute('aria-label', showingOriginal ? '複製した絵に戻る' : '元の絵と比べる'); paint(); }, { signal });
  addColorInput?.addEventListener('change', () => {
    const color = addColorInput.value.toLowerCase(); let index = documentData.palette.findIndex((candidate) => candidate.slice(0, 7).toLowerCase() === color);
    if (index < 0) { if (documentData.palette.length >= 32) { say('色は32色までです。'); return; } documentData.palette.push(color); index = documentData.palette.length - 1; }
    selectedColor = index; erasing = false; showingOriginal = false; penButton.setAttribute('aria-pressed', 'true'); eraserButton.setAttribute('aria-pressed', 'false'); originalButton.setAttribute('aria-pressed', 'false');
    renderPalette(); paint(); onChange(); say('新しい色を選びました。原画の同色画素は変わりません。');
  }, { signal });
  finishButton.addEventListener('click', async () => { if (pointerId !== null || tracker) return; finishButton.disabled = true; try { await onFinish(structuredClone(documentData)); } catch (error) { say(`候補を作れませんでした：${error.message}`); } finally { finishButton.disabled = false; } }, { signal });
  renderPalette(); paint(); updateHistoryControls();
  return { getDocument: () => structuredClone(documentData), dispose() { abort.abort(); if (tracker) cancelDrawStroke(documentData, tracker); canvas.style.transform = ''; } };
}
