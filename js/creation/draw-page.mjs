import { createLocalDraftStore, createIndexedDbDraftAdapter } from './local-drafts.mjs';
import { createDrawDocument, createDrawHistory, DRAW_PALETTE, DRAW_PALETTE_ORDER, DRAW_SIZE, DRAW_SIZES, SIMPLE_DRAW_SIZES, toSimpleDrawDocument, encodePng, finishDrawStroke, floodFill, resizeDrawDocument, strokePixels, validateDrawDocument } from './draw-core.mjs?rev=20260927-draw-step08-3';
import { createImportedDrawDocument, decodeDrawImageFile } from './draw-import.mjs?rev=20260927-draw-step08-3';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { DRAW_HANDOFF_KEY, encodeDrawPng, serializeDrawHandoff, validateDrawPixels } from './draw-handoff.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { createPxdProject } from './pxd-codec.mjs';
import { confirmPxdConversion, mountPxdTools } from './pxd-ui.mjs';
import { pxdImageRoles, readPxdImage } from './pxd-project.mjs';
import { readPxdDrawDocument, synchronizeLinkedAudioImage, writePxdDrawDocument } from './pxd-draw-audio.mjs';

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
    button.addEventListener('click', (event) => chooseColor(index, event.currentTarget)); palette.append(button);
  });
}
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
function updateCanvasView() {
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
  pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom, panX, panY, centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2 };
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
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault(); canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (event.pointerType === 'touch' && activePointers.size >= 2) { startPinch(); return; }
  if (activePointers.size > 1) return;
  drawing = true; const touchedPoint = pointFromEvent(event); previousPoint = touchedPoint;
  if (tool === 'picker') { pickColorAt(touchedPoint); drawing = false; previousPoint = null; return; }
  if (tool === 'fill') {
    commitChange((next) => { const a = [...floodFill(next, previousPoint.x, previousPoint.y, selectedPixelValue())]; if (mirror) { const m = mirrored(previousPoint); a.push(...floodFill(next, m.x, m.y, selectedPixelValue())); } return a; });
    drawing = false; previousPoint = null;
  } else if (tool === 'line') { strokeStartPixels = [...documentData.pixels]; lineStart = touchedPoint; const changed = markSegment(lineStart, touchedPoint, selectedPixelValue()); saved = false; paint(changed); }
  else { strokeStartPixels = [...documentData.pixels]; const changed = markSegment(previousPoint, previousPoint, selectedPixelValue()); saved = false; paint(changed); }
});
canvas.addEventListener('pointermove', (event) => {
  if (activePointers.has(event.pointerId)) activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinchStart && activePointers.size >= 2) {
    const [a, b] = pointerPair(); const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const centerX = (a.x + b.x) / 2; const centerY = (a.y + b.y) / 2;
    zoom = Math.max(1, Math.min(4, pinchStart.zoom * distance / Math.max(1, pinchStart.distance)));
    panX = pinchStart.panX + centerX - pinchStart.centerX; panY = pinchStart.panY + centerY - pinchStart.centerY;
    updateCanvasView(); return;
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
function releasePointer(event) {
  activePointers.delete(event.pointerId);
  if (pinchStart) {
    pinchStart = null;
    if (activePointers.size >= 2) startPinch();
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
$('#draw-undo').addEventListener('click', () => { if (history.undo()) { saved = false; paint(); } });
$('#draw-redo').addEventListener('click', () => { if (history.redo()) { saved = false; paint(); } });
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
