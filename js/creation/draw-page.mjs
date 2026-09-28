import { createLocalDraftStore, createIndexedDbDraftAdapter } from './local-drafts.mjs';
import { createDrawDocument, createDrawHistory, DRAW_PALETTE, DRAW_PALETTE_ORDER, DRAW_SIZE, DRAW_SIZES, SIMPLE_DRAW_SIZES, toSimpleDrawDocument, encodePng, finishDrawStroke, floodFill, resizeDrawDocument, strokePixels, validateDrawDocument } from './draw-core.mjs?rev=20260927-draw-step08-3';
import { createImportedDrawDocument, decodeDrawImageFile } from './draw-import.mjs?rev=20260927-draw-step08-3';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { DRAW_HANDOFF_KEY, encodeDrawPng, serializeDrawHandoff, validateDrawPixels } from './draw-handoff.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { createPxdProject } from './pxd-codec.mjs';
import { confirmPxdConversion, mountPxdTools } from './pxd-ui.mjs';
import { pxdImageRoles, readPxdImage } from './pxd-project.mjs';
import { readPxdAudioLink, readPxdDrawDocument, synchronizeLinkedAudioImage, writePxdDrawDocument } from './pxd-draw-audio.mjs';

const LAST_DRAFT_KEY = 'pixieed.simple-draw.last-draft.v1';
const $ = (selector) => document.querySelector(selector);
const canvas = $('#draw-canvas'); const pixelSurface = createPixelCanvasSurface(canvas);
const status = $('#draw-status'); const saveButton = $('#draw-save'); const resumeButton = $('#draw-resume');
const globeButton = $('#draw-to-globe');
const sizeSelect = $('#draw-size');
const interactionEffects = createInteractionEffects();
let documentData = createDrawDocument(); let history = createDrawHistory(documentData); let selectedColor = 2; let tool = 'pen'; let drawing = false; let previousPoint = null; let strokeStartPixels = null; let activeDraftId = null; let source = { type: 'hand_drawn', assetId: null, revisionId: null }; let saved = false; let canvasPrepared = false; let sizeWasChosen = false;
let store;
let pxdBridge = null; let pxdImageRole = 'main';
const activePointers = new Map(); let pinchStart = null; let zoom = 1; let panX = 0; let panY = 0;
try { store = createLocalDraftStore(createIndexedDbDraftAdapter()); } catch (error) { status.textContent = `端末内保存を使えません：${error.message}`; saveButton.disabled = true; }

function getLastDraftId() { try { return globalThis.localStorage?.getItem(LAST_DRAFT_KEY) || null; } catch { return null; } }
function setLastDraftId(value) { try { globalThis.localStorage?.setItem(LAST_DRAFT_KEY, value); return true; } catch { return false; } }
function setCanvasDimensions() {
  pixelSurface.resize(documentData.width, documentData.height);
  requestAnimationFrame(() => { placeOverlays(); syncSizeButtons(); showCurrentColor(); });
  canvas.style.aspectRatio = `${documentData.width} / ${documentData.height}`;
  canvas.style.setProperty('--draw-aspect', `${documentData.width} / ${documentData.height}`);
  canvasPrepared = true;
  $('#draw-size-label').textContent = `${documentData.width}×${documentData.height}px`;
  canvas.setAttribute('aria-label', `${documentData.width}×${documentData.height}の透明なキャンバス。色を選んで描きます。`);
}
function updateControls() {
  $('#draw-undo').disabled = !history.canUndo; $('#draw-redo').disabled = !history.canRedo;
  $('#draw-undo').setAttribute('aria-disabled', String(!history.canUndo)); $('#draw-redo').setAttribute('aria-disabled', String(!history.canRedo));
  status.textContent = saved ? '保存しました。' : '編集中です。保存すると端末に残ります。';
}
function paint(changed = null) {
  if (!canvasPrepared || canvas.width !== documentData.width || canvas.height !== documentData.height) setCanvasDimensions();
  pixelSurface.paint(documentData.pixels, documentData.palette, changed);
  updateControls();
}
function renderPalette() {
  const palette = $('#draw-palette'); palette.replaceChildren();
  const transparent = document.createElement('button'); transparent.type = 'button'; transparent.className = 'draw-color draw-color--transparent'; transparent.dataset.colorIndex = '-1'; transparent.setAttribute('aria-label', '透明色'); transparent.setAttribute('aria-pressed', String(selectedColor === -1));
  transparent.addEventListener('click', (event) => chooseColor(-1, event.currentTarget)); palette.append(transparent);
  const order = documentData.palette.length === DRAW_PALETTE_ORDER.length ? DRAW_PALETTE_ORDER : documentData.palette.map((_, index) => index);
  order.forEach((index) => { const color = documentData.palette[index];
    const button = document.createElement('button'); button.dataset.colorIndex = String(index); button.type = 'button'; button.className = 'draw-color'; button.style.setProperty('--draw-color', color); button.setAttribute('aria-label', `色 ${index + 1}`); button.title = `色 ${index + 1}`; button.setAttribute('aria-pressed', String(index === selectedColor));
    let hold = 0; let held = false;
    button.addEventListener('pointerdown', () => { held = false; clearTimeout(hold); hold = setTimeout(() => { held = true; chooseColor(index, button); openColorEditor(index); }, 450); });
    for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, () => clearTimeout(hold));
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      if (held) { held = false; return; }
      // while the sheet is open, a tap on another colour edits that one; on the same colour it closes
      if (colorEdit) { if (colorEdit.index === index) closeColorEditor(); else { chooseColor(index, event.currentTarget); openColorEditor(index); } return; }
      if (index === selectedColor && tool === 'pen') { openColorEditor(index); return; }
      chooseColor(index, event.currentTarget);
    });
    palette.append(button);
  });
}
// ---- changing a colour: hue / vividness / lightness sliders and a few quick colours; one undo step per edit ----
const QUICK_COLORS = ['#17232d', '#ffffff', '#ff4d4d', '#ff9f1c', '#ffe14d', '#7ed957', '#2ec4b6', '#3a86ff', '#8338ec', '#ff6fb5', '#a0522d', '#ffd8b1'];
let colorEdit = null;
const hexToHsl = (hex) => {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255; const g = Number.parseInt(hex.slice(3, 5), 16) / 255; const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2; const d = max - min;
  if (!d) return { h: colorEdit?.h ?? 0, s: 0, l: Math.round(l * 100) };
  const s = d / (1 - Math.abs(2 * l - 1)); let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60); if (h < 0) h += 360; return { h, s: Math.round(s * 100), l: Math.round(l * 100) };
};
const hslToHex = (h, s, l) => {
  s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
function linkedToSong() {
  try { const link = readPxdAudioLink(pxdBridge?.currentProject || pxdBridge?.heldProject); return Boolean(link && link.imageRole === pxdImageRole); } catch { return false; }
}
function openColorEditor(index) {
  if (index < 0) return;
  if (linkedToSong()) { toast('音楽とつながった絵は色を変えられません'); return; }
  closeColorEditor();
  const editor = $('#draw-color-editor'); const base = [...documentData.palette];
  colorEdit = { index, base, ...hexToHsl(base[index].slice(0, 7)) };
  editor.querySelector('.dce-before').style.background = base[index];
  const quick = editor.querySelector('.dce-quick'); quick.replaceChildren(...QUICK_COLORS.map((color) => {
    const b = document.createElement('button'); b.type = 'button'; b.style.setProperty('--c', color); b.setAttribute('aria-label', color); b.addEventListener('click', () => setEditColor(color)); return b;
  }));
  $('#dce-reset').hidden = index >= DRAW_PALETTE.length || base[index] === DRAW_PALETTE[index];
  syncColorEditor(); editor.hidden = false; placeColorEditor(); requestAnimationFrame(() => editor.classList.add('is-open'));
  $('.draw-current')?.setAttribute('aria-expanded', 'true');
}
// the sheet sits just above the palette so the colours (and most of the picture) stay in view
function placeColorEditor() {
  const editor = $('#draw-color-editor'); if (editor.hidden) return;
  const row = $('.draw-control-row').getBoundingClientRect(); const h = editor.offsetHeight;
  const above = row.top - h - 10; const below = row.bottom + 10;
  editor.style.top = `${Math.round(above >= 8 || below + h > innerHeight - 8 ? Math.max(8, above) : below)}px`;
}
addEventListener('resize', placeColorEditor); addEventListener('scroll', placeColorEditor, { passive: true });
function setEditColor(hex) {
  if (!colorEdit) return;
  Object.assign(colorEdit, hexToHsl(hex));
  const palette = [...documentData.palette]; palette[colorEdit.index] = hex; documentData.palette = palette;
  const tile = document.querySelector(`.draw-color[data-color-index="${colorEdit.index}"]`); tile?.style.setProperty('--draw-color', hex);
  showCurrentColor(); paint(); syncColorEditor(false);
}
function syncColorEditor(setInputs = true) {
  const e = colorEdit; if (!e) return; const hex = documentData.palette[e.index];
  const editor = $('#draw-color-editor'); editor.querySelector('.dce-after').style.background = hex;
  if (setInputs) { $('#dce-h').value = e.h; $('#dce-s').value = e.s; $('#dce-l').value = e.l; }
  editor.style.setProperty('--h', e.h); editor.style.setProperty('--s', `${e.s}%`); editor.style.setProperty('--l', `${e.l}%`);
  for (const b of editor.querySelectorAll('.dce-quick button')) b.setAttribute('aria-pressed', String(b.style.getPropertyValue('--c') === hex));
}
function closeColorEditor() {
  const editor = $('#draw-color-editor'); if (!colorEdit) { editor.hidden = true; return; }
  const after = documentData.palette; documentData.palette = colorEdit.base; colorEdit = null;
  if (history.commit({ ...documentData, pixels: [...documentData.pixels], palette: after })) saved = false;
  editor.classList.remove('is-open'); editor.hidden = true; $('.draw-current')?.setAttribute('aria-expanded', 'false');
  renderPalette(); showCurrentColor(); paint();
}
for (const id of ['#dce-h', '#dce-s', '#dce-l']) $(id).addEventListener('input', () => {
  if (!colorEdit) return; colorEdit.h = Number($('#dce-h').value); colorEdit.s = Number($('#dce-s').value); colorEdit.l = Number($('#dce-l').value);
  const hex = hslToHex(colorEdit.h, colorEdit.s, colorEdit.l); const { h, s, l } = colorEdit; setEditColor(hex); Object.assign(colorEdit, { h, s, l }); syncColorEditor(false);
});
$('#dce-done').addEventListener('click', closeColorEditor);
$('#dce-reset').addEventListener('click', () => { if (colorEdit) setEditColor(DRAW_PALETTE[colorEdit.index]); syncColorEditor(); });
$('.draw-current')?.addEventListener('click', () => (colorEdit ? closeColorEditor() : openColorEditor(selectedColor)));
// touching the picture closes the sheet and draws straight away with the new colour
canvas.addEventListener('pointerdown', () => { if (colorEdit) closeColorEditor(); }, true);
addEventListener('keydown', (event) => { if (event.key === 'Escape' && colorEdit) closeColorEditor(); });
function showCurrentColor() {
  const chip = $('.draw-current'); if (!chip) return;
  chip.classList.toggle('is-clear', selectedColor < 0); chip.style.setProperty('--draw-color', selectedColor < 0 ? 'transparent' : documentData.palette[selectedColor]);
}
function chooseColor(index, sourceElement) {
  const penButton = document.querySelector('[data-draw-tool="pen"]');
  interactionEffects.color({ from: sourceElement, to: penButton, color: index < 0 ? '#fff' : documentData.palette[index] });
  selectedColor = index; tool = 'pen'; showCurrentColor();
  document.querySelectorAll('.draw-color').forEach((node) => node.setAttribute('aria-pressed', String(Number(node.dataset.colorIndex) === index)));
  document.querySelectorAll('[data-draw-tool]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.drawTool === 'pen')));
}
// Anything opened here is brought to at most 64px and the 16 colours; the saved original is left as it was.
let fitNotice = '';
function fitToSimple(nextDocument) {
  const fitted = toSimpleDrawDocument(nextDocument);
  fitNotice = fitted.changed ? `${fitted.resized ? `${fitted.document.width}×${fitted.document.height}px` : ''}${fitted.resized && fitted.recolored ? '・' : ''}${fitted.recolored ? '16色' : ''}に合わせました（元の絵はそのまま）` : '';
  return fitted.document;
}
function replaceDocument(nextDocument, nextSource = source, { fromPxd = false } = {}) {
  if (colorEdit) closeColorEditor();
  nextDocument = fitToSimple(nextDocument);
  if (fitNotice) setTimeout(() => { if (fitNotice && !status.textContent.includes(fitNotice)) status.textContent = `${status.textContent} ${fitNotice}`.trim(); }, 0);
  interactionEffects.clear();
  if (!fromPxd) { pxdBridge?.reset(); pxdImageRole = 'main'; }
  documentData = nextDocument; source = nextSource; history = createDrawHistory(documentData); activeDraftId = null; saved = false;
  selectedColor = Math.min(Math.max(selectedColor, 0), documentData.palette.length - 1); renderPalette(); sizeSelect.value = String(documentData.width); setCanvasDimensions(); paint();
}
function commitChange(operation) {
  const next = { ...documentData, palette: documentData.palette, pixels: [...documentData.pixels] }; const changed = operation(next);
  if (history.commit(next)) { saved = false; paint(changed && typeof changed.length === 'number' ? changed : null); }
}
function pointFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.floor((event.clientX - rect.left) * documentData.width / rect.width), y: Math.floor((event.clientY - rect.top) * documentData.height / rect.height) };
}
const ZOOM_MAX = 8;
// The canvas scales about its own centre; keep the point under the fingers / cursor still while zooming
// and never let the picture slide completely out of view.
function layoutCenter() { const r = canvas.getBoundingClientRect(); return { x: r.left + r.width / 2 - panX, y: r.top + r.height / 2 - panY, w: r.width / zoom, h: r.height / zoom }; }
function clampPan() {
  const board = $('.draw-board').getBoundingClientRect(); const c = layoutCenter();
  const limitX = Math.max(0, (c.w * zoom) / 2 + board.width / 2 - 48); const limitY = Math.max(0, (c.h * zoom) / 2 + board.height / 2 - 48);
  panX = Math.max(-limitX, Math.min(limitX, panX)); panY = Math.max(-limitY, Math.min(limitY, panY));
}
function zoomAt(nextZoom, focusX, focusY, base = { zoom, panX, panY }) {
  const c = layoutCenter(); const z = Math.max(1, Math.min(ZOOM_MAX, nextZoom)); const k = z / base.zoom;
  zoom = z; panX = focusX - c.x - (focusX - c.x - base.panX) * k; panY = focusY - c.y - (focusY - c.y - base.panY) * k;
  if (zoom === 1) { panX = 0; panY = 0; }
  updateCanvasView();
}
function resetView() { zoom = 1; panX = 0; panY = 0; updateCanvasView(); }
function updateCanvasView() {
  if (zoom > 1) clampPan();
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  $('#draw-zoom-label').textContent = `${Math.round(zoom * 100)}%`;
  $('#draw-zoom-label').classList.toggle('is-zoomed', zoom > 1.01);
  placeOverlays();
}
function placeOverlays() {
  const board = $('.draw-board'); const grid = $('.draw-grid'); if (!board || !grid) return;
  const b = board.getBoundingClientRect(); const r = canvas.getBoundingClientRect();
  Object.assign(grid.style, { left: `${r.left - b.left}px`, top: `${r.top - b.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  for (const node of [grid, canvas]) { node.style.setProperty('--cols', documentData.width); node.style.setProperty('--rows', documentData.height); }
  grid.classList.toggle('is-fine', r.width / documentData.width < 6);
}
function showCursor(event) {
  const cursor = $('.draw-cursor'); if (!cursor) return;
  if (event.pointerType === 'touch' && !drawing) { cursor.hidden = true; return; }
  const p = pointFromEvent(event);
  if (p.x < 0 || p.y < 0 || p.x >= documentData.width || p.y >= documentData.height) { cursor.hidden = true; return; }
  const board = $('.draw-board').getBoundingClientRect(); const r = canvas.getBoundingClientRect(); const cw = r.width / documentData.width; const ch = r.height / documentData.height;
  Object.assign(cursor.style, { left: `${r.left - board.left + p.x * cw}px`, top: `${r.top - board.top + p.y * ch}px`, width: `${cw}px`, height: `${ch}px` });
  cursor.style.setProperty('--draw-color', tool === 'eraser' || selectedColor < 0 ? 'transparent' : documentData.palette[selectedColor] || 'transparent');
  cursor.dataset.tool = tool; cursor.hidden = false;
  const twin = $('.draw-cursor-twin');
  if (mirror && twin) { Object.assign(twin.style, { left: `${r.left - board.left + (documentData.width - 1 - p.x) * cw}px`, top: cursor.style.top, width: cursor.style.width, height: cursor.style.height }); twin.hidden = false; } else if (twin) twin.hidden = true;
}
canvas.addEventListener('pointerleave', () => { if (!drawing) { $('.draw-cursor').hidden = true; const twin = $('.draw-cursor-twin'); if (twin) twin.hidden = true; } });
// ---- short messages float over the canvas and fade (the status line keeps the full text for screen readers) ----
let toastTimer = 0;
function toast(message) { status.textContent = message; }
const QUIET = new Set(['編集中です。保存すると端末に残ります。', '新しい絵を準備しています。']);
new MutationObserver(() => { if (QUIET.has(status.textContent.trim())) return; status.classList.add('is-show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => status.classList.remove('is-show'), 2600); }).observe(status, { childList: true, characterData: true, subtree: true });
new ResizeObserver(() => placeOverlays()).observe($('.draw-board'));
function pointerPair() { return [...activePointers.values()].slice(0, 2); }
function startPinch() {
  if (drawing && strokeStartPixels) {
    documentData.pixels = strokeStartPixels; strokeStartPixels = null; drawing = false; previousPoint = null; paint();
  }
  const [a, b] = pointerPair(); if (!a || !b) return;
  pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom, panX, panY, centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2, time: performance.now(), moved: 0, fingers: activePointers.size };
}
function selectedPixelValue() { return tool === 'eraser' ? -1 : selectedColor; }
// ---- drawing helpers: a mirror copy of every mark, the straight line, the colour picker ----
let mirror = false; let lineStart = null;
const mirrored = (point) => ({ x: documentData.width - 1 - point.x, y: point.y });
function markSegment(from, to, value) {
  const changed = [...strokePixels(documentData, from, to, value)];
  if (mirror) changed.push(...strokePixels(documentData, mirrored(from), mirrored(to), value));
  return changed;
}
function pickColorAt(point) {
  if (point.x < 0 || point.y < 0 || point.x >= documentData.width || point.y >= documentData.height) return;
  const value = documentData.pixels[point.y * documentData.width + point.x];
  const button = document.querySelector(`.draw-color[data-color-index="${value}"]`);
  chooseColor(value, button); setTool('pen'); toast(value < 0 ? '透明をとりました' : 'この色をとりました');
}
function setTool(next) {
  tool = next; document.querySelectorAll('[data-draw-tool]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.drawTool === next)));
  canvas.dataset.tool = next;
}
let pendingTap = null; let panDrag = null; let spaceHeld = false; let fingerTap = null;
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== undefined && event.button !== 0 && event.button !== 1) return;
  event.preventDefault(); canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (event.pointerType === 'touch' && activePointers.size >= 2) { pendingTap = null; if (fingerTap && !pinchStart) { const tail = fingerTap; fingerTap = null; startPinch(); Object.assign(pinchStart, { time: tail.time, fingers: Math.max(tail.fingers, activePointers.size), moved: tail.moved }); return; } if (pinchStart) { pinchStart.fingers = Math.max(pinchStart.fingers, activePointers.size); return; } startPinch(); return; }
  // desktop: middle button, or Space held, drags the view
  if (event.button === 1 || spaceHeld) { panDrag = { x: event.clientX, y: event.clientY, panX, panY }; canvas.classList.add('is-panning'); return; }
  if (activePointers.size > 1) return;
  drawing = true; const touchedPoint = pointFromEvent(event); previousPoint = touchedPoint;
  if (tool === 'picker' || tool === 'fill') { pendingTap = touchedPoint; drawing = false; previousPoint = null; return; }
  if (tool === 'line') { strokeStartPixels = [...documentData.pixels]; lineStart = touchedPoint; const changed = markSegment(lineStart, touchedPoint, selectedPixelValue()); saved = false; paint(changed); }
  else { strokeStartPixels = [...documentData.pixels]; const changed = markSegment(previousPoint, previousPoint, selectedPixelValue()); saved = false; paint(changed); }
});
canvas.addEventListener('pointermove', (event) => {
  if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (panDrag) { panX = panDrag.panX + event.clientX - panDrag.x; panY = panDrag.panY + event.clientY - panDrag.y; updateCanvasView(); return; }
  if (pinchStart && activePointers.size >= 2) {
    const [a, b] = pointerPair(); const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const centerX = (a.x + b.x) / 2; const centerY = (a.y + b.y) / 2;
    const target = Math.max(1, Math.min(ZOOM_MAX, pinchStart.zoom * distance / Math.max(1, pinchStart.distance)));
    pinchStart.moved = Math.max(pinchStart.moved, Math.hypot(centerX - pinchStart.centerX, centerY - pinchStart.centerY), Math.abs(distance - pinchStart.distance));
    pinchStart.fingers = Math.max(pinchStart.fingers, activePointers.size);
    // zoom about the first centre, then follow the fingers as they move together
    zoomAt(target, pinchStart.centerX, pinchStart.centerY, pinchStart); panX += centerX - pinchStart.centerX; panY += centerY - pinchStart.centerY; updateCanvasView(); return;
  }
  showCursor(event);
  if (!drawing || tool === 'fill' || tool === 'picker') return;
  const point = pointFromEvent(event); if (point.x === previousPoint.x && point.y === previousPoint.y) return;
  if (tool === 'line') { documentData.pixels = [...strokeStartPixels]; markSegment(lineStart, point, selectedPixelValue()); previousPoint = point; paint(); return; }
  const changed = markSegment(previousPoint, point, selectedPixelValue()); previousPoint = point; saved = false; paint(changed);
});
function endStroke() {
  if (drawing && strokeStartPixels && tool !== 'fill') { finishDrawStroke(documentData, history, strokeStartPixels); strokeStartPixels = null; paint(); }
  drawing = false; previousPoint = null; lineStart = null;
}
function applyTap(point) {
  if (tool === 'picker') { pickColorAt(point); return; }
  commitChange((next) => { const a = [...floodFill(next, point.x, point.y, selectedPixelValue())]; if (mirror) { const m = mirrored(point); a.push(...floodFill(next, m.x, m.y, selectedPixelValue())); } return a; });
}
function releasePointer(event) {
  const wasActive = activePointers.delete(event.pointerId);
  if (panDrag) { if (!activePointers.size) { panDrag = null; canvas.classList.remove('is-panning'); } return; }
  if (pendingTap && wasActive && event.type === 'pointerup' && !pinchStart && activePointers.size === 0) { const tap = pendingTap; pendingTap = null; applyTap(tap); return; }
  if (!activePointers.size) pendingTap = null;
  // fingers rarely lift at the same moment: remember the gesture until the last one is up, then a quick,
  // still two-finger tap is undo and a three-finger tap is redo
  if (!pinchStart && fingerTap) {
    if (activePointers.size === 0) { const gesture = fingerTap; fingerTap = null; if (performance.now() - gesture.time < 360 && gesture.moved < 12) { if (gesture.fingers >= 3) redo(); else undo(); } }
    return;
  }
  if (pinchStart) {
    const gesture = pinchStart; pinchStart = null;
    if (activePointers.size >= 1 && activePointers.size < 2) fingerTap = gesture;
    else if (activePointers.size === 0 && performance.now() - gesture.time < 360 && gesture.moved < 12) { if (gesture.fingers >= 3) redo(); else undo(); }
    if (activePointers.size >= 2) { startPinch(); Object.assign(pinchStart, { time: gesture.time, fingers: gesture.fingers, moved: gesture.moved }); }
    else if (activePointers.size === 0) { zoom = Math.max(1, zoom); if (zoom === 1) panX = panY = 0; updateCanvasView(); }
    drawing = false; previousPoint = null; strokeStartPixels = null; return;
  }
  endStroke();
}
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);

SIMPLE_DRAW_SIZES.forEach((size) => { const option = document.createElement('option'); option.value = String(size); option.textContent = `${size}×${size}`; sizeSelect.append(option); });
sizeSelect.value = String(DRAW_SIZE);
sizeSelect.addEventListener('change', () => {
  sizeWasChosen = true;
  const previousSize = documentData.width; const size = Number(sizeSelect.value);
  try { replaceDocument(resizeDrawDocument(documentData, size)); status.textContent = `${size}×${size}にしました`; }
  catch (error) { status.textContent = `サイズを変更できませんでした：${error.message}`; sizeSelect.value = String(previousSize); }
});
renderPalette();
document.querySelectorAll('[data-draw-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.drawTool)));
// ---- mirror and grid toggles ----
const mirrorButton = $('#draw-mirror'); const gridButton = $('#draw-grid-toggle');
mirrorButton?.addEventListener('click', () => { mirror = !mirror; mirrorButton.setAttribute('aria-pressed', String(mirror)); $('.draw-board')?.classList.toggle('is-mirror', mirror); placeOverlays(); toast(mirror ? '左右対称で描きます' : '左右対称をやめました'); });
let showGrid = true; try { showGrid = localStorage.getItem('pixieed:draw:grid') !== 'off'; } catch { /* private mode */ }
function syncGrid() { gridButton?.setAttribute('aria-pressed', String(showGrid)); $('.draw-board')?.classList.toggle('has-grid', showGrid); }
gridButton?.addEventListener('click', () => { showGrid = !showGrid; try { localStorage.setItem('pixieed:draw:grid', showGrid ? 'on' : 'off'); } catch { /* private mode */ } syncGrid(); });
syncGrid();
// ---- size buttons drive the page's own size control ----
const sizeButtons = [...document.querySelectorAll('[data-draw-size]')];
function syncSizeButtons() { for (const b of sizeButtons) b.setAttribute('aria-checked', String(Number(b.dataset.drawSize) === documentData.width && documentData.width === documentData.height)); }
for (const b of sizeButtons) b.addEventListener('click', () => { if (sizeSelect.value === b.dataset.drawSize && documentData.width === Number(b.dataset.drawSize)) return; sizeSelect.value = b.dataset.drawSize; sizeSelect.dispatchEvent(new Event('change')); });
function afterHistoryStep() {
  saved = false; const step = history.lastStep;
  if (step?.paletteChanged) { renderPalette(); showCurrentColor(); paint(); } else paint(step?.indices || null);
}
function undo() { if (drawing) return false; if (colorEdit) closeColorEditor(); if (!history.undo()) return false; afterHistoryStep(); return true; }
function redo() { if (drawing) return false; if (colorEdit) closeColorEditor(); if (!history.redo()) return false; afterHistoryStep(); return true; }
// a tap steps once; holding the button keeps stepping
for (const [id, step] of [['#draw-undo', undo], ['#draw-redo', redo]]) {
  const button = $(id); let timer = 0; let repeated = false;
  const stop = () => { clearTimeout(timer); timer = 0; };
  button.addEventListener('pointerdown', () => { repeated = false; stop(); timer = setTimeout(function again() { repeated = true; if (step()) timer = setTimeout(again, 90); }, 420); });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, stop);
  button.addEventListener('click', () => { if (repeated) { repeated = false; return; } step(); });
}
addEventListener('keydown', (event) => {
  if (event.target.closest?.('input, select, textarea')) return;
  const key = event.key.toLowerCase(); const mod = event.metaKey || event.ctrlKey;
  if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
  if (mod && key === 'y') { event.preventDefault(); redo(); return; }
  if (mod) return;
  if (key === ' ') { if (!spaceHeld && document.activeElement === canvas) event.preventDefault(); spaceHeld = true; canvas.classList.add('is-grab'); return; }
  const tools = { b: 'pen', p: 'pen', e: 'eraser', g: 'fill', l: 'line', i: 'picker' };
  if (tools[key]) { setTool(tools[key]); return; }
  if (key === 'm') { $('#draw-mirror')?.click(); return; }
  if (key === '0') { resetView(); return; }
  if (key === '+' || key === '=') { const r = canvas.getBoundingClientRect(); zoomAt(zoom * 1.5, r.left + r.width / 2, r.top + r.height / 2); return; }
  if (key === '-') { const r = canvas.getBoundingClientRect(); zoomAt(zoom / 1.5, r.left + r.width / 2, r.top + r.height / 2); }
});
addEventListener('keyup', (event) => { if (event.key === ' ') { spaceHeld = false; canvas.classList.remove('is-grab'); } });
// wheel / trackpad pinch zooms about the cursor
$('.draw-board').addEventListener('wheel', (event) => {
  event.preventDefault();
  const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0025));
  zoomAt(zoom * factor, event.clientX, event.clientY);
}, { passive: false });
// the zoom chip puts the whole picture back
$('#draw-zoom-label').addEventListener('click', resetView); $('#draw-zoom-label').title = '全体を表示';
canvas.addEventListener('dblclick', (event) => { if (tool === 'picker' || tool === 'fill') return; event.preventDefault(); });
$('#draw-clear').addEventListener('click', () => commitChange((next) => { next.pixels.fill(-1); return null; }));
async function saveRevision() {
  if (!store) return;
  const snapshot = structuredClone(documentData);
  saveButton.disabled = true; globeButton.disabled = true; status.textContent = '保存しています…';
  try {
    const draftId = activeDraftId || crypto.randomUUID();
    const revision = await store.save({ draftId, kind: 'pixel_art', document: snapshot, source: structuredClone(source) });
    activeDraftId = draftId; saved = true;
    if (!setLastDraftId(draftId)) { status.textContent = '絵は端末に保存しましたが、再開用の目印を残せませんでした。'; }
    else status.textContent = '保存しました';
    if (pxdBridge?.currentProject || pxdBridge?.heldProject) {
      try { await pxdBridge.save(); status.textContent = '保存しました（PXD作品も更新）'; }
      catch (error) { status.textContent = `絵は端末に保存しましたが、PXD更新に失敗しました：${error.message}`; }
    }
    resumeButton.hidden = false; $('#draw-copy-last').hidden = false;
    return revision;
  } catch (error) { status.textContent = `保存できませんでした：${error.message || '端末の空き容量を確認してください。'}`; return null; }
  finally { saveButton.disabled = false; globeButton.disabled = false; }
}
saveButton.addEventListener('click', () => saveRevision());
globeButton.addEventListener('click', async () => {
  try {
    validateDrawPixels(documentData);
    globeButton.disabled = true;
    const revision = await saveRevision();
    if (!revision) return;
    globeButton.disabled = true;
    const png = await encodeDrawPng(revision.document);
    const serialized = await serializeDrawHandoff(png, revision.revisionId);
    sessionStorage.setItem(DRAW_HANDOFF_KEY, serialized);
    location.assign('/?from=draw');
  } catch (error) { status.textContent = `地球儀へ送れませんでした：${error.message}`; }
  finally { globeButton.disabled = false; }
});
async function loadLastDraft({ copy = false } = {}) {
  const draftId = getLastDraftId(); if (!draftId || !store) return;
  resumeButton.disabled = true; $('#draw-copy-last').disabled = true; status.textContent = copy ? '複製しています…' : '前回の絵を開いています…';
  try {
    const revision = await store.load(draftId); if (!revision) throw new Error('保存した絵が見つかりません。');
    validateDrawDocument(revision.document);
    pxdBridge?.reset(); pxdImageRole = 'main';
    const nextSource = copy ? { type: 'local_draft_copy', assetId: revision.asset.assetId, revisionId: revision.revisionId, sourceDraftId: draftId, parentSource: revision.asset.source } : revision.asset.source;
    documentData = fitToSimple(structuredClone(revision.document)); source = nextSource; activeDraftId = copy ? null : draftId; history = createDrawHistory(documentData); saved = !copy && !fitNotice;
    renderPalette(); sizeSelect.value = String(documentData.width); setCanvasDimensions(); paint();
    status.textContent = `${copy ? '複製しました' : 'ひらきました'}${fitNotice ? ` ${fitNotice}` : ''}`;
  } catch (error) { status.textContent = `${copy ? '複製できませんでした' : '開けませんでした'}：${error.message}`; }
  finally { resumeButton.disabled = false; $('#draw-copy-last').disabled = false; }
}
resumeButton.addEventListener('click', () => loadLastDraft());
$('#draw-copy-last').addEventListener('click', () => loadLastDraft({ copy: true }));

async function importImage(file, importSource) {
  $('#draw-import-local').disabled = true; status.textContent = '画像を読み込んでいます…';
  try {
    const image = await decodeDrawImageFile(file);
    const nativeFit = SIMPLE_DRAW_SIZES.find((size) => size >= Math.max(image.width, image.height)) || SIMPLE_DRAW_SIZES.at(-1);
    const targetSize = sizeWasChosen ? Number(sizeSelect.value) : Math.max(Number(sizeSelect.value), nativeFit);
    const imported = createImportedDrawDocument(image, targetSize);
    replaceDocument(imported.document, importSource); fitNotice = '';
    status.textContent = `${imported.copiedWidth}×${imported.copiedHeight}・${documentData.palette.length}色で読み込みました`;
  } catch (error) { status.textContent = `画像を複製できませんでした：${error.message}`; }
  finally { $('#draw-import-local').disabled = false; $('#draw-import-file').value = ''; }
}
$('#draw-import-local').addEventListener('click', () => $('#draw-import-file').click());
$('#draw-import-file').addEventListener('change', () => { const file = $('#draw-import-file').files?.[0]; if (file) importImage(file, { type: 'local_image_copy', assetId: null, revisionId: null }); });
if (getLastDraftId()) { resumeButton.hidden = false; $('#draw-copy-last').hidden = false; }
paint();

$('#draw-export').addEventListener('click', () => {
  try {
    const bytes = encodePng(documentData); const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' })); const link = document.createElement('a'); link.href = url; link.download = `pixieed-drawing-${documentData.width}x${documentData.height}.png`; link.click(); interactionEffects.exportImage({ from: canvas, to: $('#draw-export'), image: canvas }); setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = `${documentData.width}×${documentData.height}pxのPNGを書き出しました。`;
  } catch (error) { status.textContent = `PNGを書き出せませんでした：${error.message}`; }
});

pxdBridge = mountPxdTools({
  tool: 'draw',
  hasContent: () => Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject || activeDraftId || documentData.pixels.some((pixel) => pixel >= 0)),
  setStatus: (message) => { status.textContent = message; },
  async openProject(project) {
    const params = new URLSearchParams(location.search); const requestedRole = params.getAll('pxdImage').length === 1 ? params.get('pxdImage') : null;
    const roles = pxdImageRoles(project);
    let role = requestedRole || (roles.includes('draw') ? 'draw' : roles.includes('main') ? 'main' : roles[0]);
    let nextDocument;
    {
      try { nextDocument = await readPxdDrawDocument(project, role); }
      catch (error) {
        const image = await readPxdImage(project, role);
        if (!image || !(error instanceof RangeError)) throw error;
        const targetSize = SIMPLE_DRAW_SIZES.reduce((best, size) => Math.abs(size - Math.max(image.width, image.height)) < Math.abs(best - Math.max(image.width, image.height)) ? size : best, SIMPLE_DRAW_SIZES[0]);
        const imported = createImportedDrawDocument({ width: image.width, height: image.height, data: new Uint8ClampedArray(image.rgba) }, targetSize); imported.document = toSimpleDrawDocument(imported.document).document;
        const accepted = await confirmPxdConversion({ image, document: imported.document, title: '描画用の絵を確認', applyLabel: 'このコピーで描く', message: `原本 ${image.width} × ${image.height}px をPXDに残し、描画用コピー ${imported.document.width} × ${imported.document.height}px を作ります。${imported.quantized ? 'コピーは128色に整理されます。' : '色はそのまま保ちます。'}` });
        if (!accepted) throw new Error('描画用コピーの作成を中止しました。原本は変更していません。');
        role = role === 'draw' ? 'draw-copy' : 'draw'; nextDocument = imported.document;
      }
    }
    if (!nextDocument) throw new Error('このPXDには描画できる画像部品がありません。別のPXDや保存版を選んでください。');
    validateDrawDocument(nextDocument);
    pxdImageRole = role || 'main';
    replaceDocument(structuredClone(nextDocument), { type: 'pxd_project_copy', assetId: null, revisionId: null, projectId: project.projectId, imageRole: pxdImageRole }, { fromPxd: true });
    saved = true; paint();
  },
  async getProject(project) {
    let next = project || createPxdProject();
    next = await synchronizeLinkedAudioImage(next, documentData, pxdImageRole);
    return writePxdDrawDocument(next, documentData, pxdImageRole);
  }
});
