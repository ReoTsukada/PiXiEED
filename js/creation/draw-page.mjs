import { scaleNotice } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';
import { createLatestGate } from './pixel-contract.mjs?rev=20260928-data-contract-1';
import { mountPictureShelf } from './picture-shelf.mjs?rev=20260928-picture-shelf-1';
import { createLocalDraftStore, createIndexedDbDraftAdapter } from './local-drafts.mjs';
import { createDrawDocument, createDrawHistory, DRAW_PALETTE, DRAW_PALETTE_ORDER, DRAW_SIZE, documentRgba, finishDrawStroke, floodFill, resizeDrawRectangle, strokePixels, validateDrawDocument } from './draw-core.mjs?rev=20260930-shared-canvas-5';
import { createImportedDrawDocument, decodeDrawImageFile } from './draw-import.mjs?rev=20260928-pixel-roundtrip-1';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { DRAW_HANDOFF_KEY, encodeDrawPng, serializeDrawHandoff, validateDrawPixels } from './draw-handoff.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { createPxdProject } from './pxd-codec.mjs';
import { confirmPxdConversion } from './pxd-ui.mjs?rev=20260930-ux-fix-1';
import { mountProjectWorkspace as mountPxdTools } from './project-workspace.mjs?rev=20260930-ux-fix-1';
import { pxdImageRoles, readPxdImage, imageToDrawDocument } from './pxd-project.mjs?rev=20260930-shared-canvas-5';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20260930-shared-canvas-5';
import { prepareSharedCanvasImage } from './shared-image.mjs?rev=20260930-shared-canvas-5';
import { enlargedPng, saveFile } from '../pixel-export.mjs?rev=20260928-pixel-roundtrip-1';
import { encodeAnimatedGif } from '../animated-export.mjs?v=20260929-gif-budget-1';
import { requestPass, hasPass } from '../pixieed-pass.mjs?v=20260930-rewarded-gpt-1';
import { createDrawTimelapse, selectDrawTimelapseFrames } from './draw-timelapse.mjs?rev=20260928-draw-timelapse-1';
import { readPxdAudioLink, readPxdDrawDocument, synchronizeLinkedAudioImage, writePxdDrawDocument } from './pxd-draw-audio.mjs?rev=20260930-photo-project-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20260929-compact-results-3';
import { mountCreationEditorUi } from './editor-ui.mjs?rev=20260929-shared-editor-1';

const LAST_DRAFT_KEY = 'pixieed.simple-draw.last-draft.v1';
const $ = (selector) => document.querySelector(selector);
const canvas = $('#draw-canvas'); const pixelSurface = createPixelCanvasSurface(canvas);
const resultView = createToolResultView({ key: 'draw-result', main: $('#main'), returnLabel: '描画に戻る',
  beforeShow: () => { closeColorEditor(); editorUi.closePanels(); interactionEffects.clear(); },
  onClose: () => requestAnimationFrame(placeOverlays) });
const status = $('#draw-status'); const saveButton = $('#draw-save'); const resumeButton = $('#draw-resume');
const globeButton = $('#draw-to-globe');
const sizeSelect = $('#draw-size');
const interactionEffects = createInteractionEffects();
let documentData = createDrawDocument(); let history = createDrawHistory(documentData); let selectedColor = 2; let tool = 'pen'; let drawing = false; let previousPoint = null; let strokeStartPixels = null; let activeDraftId = null; let source = { type: 'hand_drawn', assetId: null, revisionId: null }; let saved = false; let canvasPrepared = false; let sizeWasChosen = false;
// Only the newest open/import may replace the picture; the version an edit started from guards saves.
const loadGate = createLatestGate(); let baseRevisionId = null;
const TIMELAPSE_FPS = 12;
const timelapse = createDrawTimelapse();
let store;
let pxdBridge = null; let pxdImageRole = 'main'; let loadingLegacy = false; let readOnlyImage = null;
const activePointers = new Map(); let pinchStart = null; let zoom = 1; let panX = 0; let panY = 0;
let drawAdapter = null;
try { drawAdapter = createIndexedDbDraftAdapter(); store = createLocalDraftStore(drawAdapter); } catch (error) { status.textContent = `端末内保存を使えません：${error.message}`; saveButton.disabled = true; }

function getLastDraftId() { try { return globalThis.localStorage?.getItem(LAST_DRAFT_KEY) || null; } catch { return null; } }
function setLastDraftId(value) { try { globalThis.localStorage?.setItem(LAST_DRAFT_KEY, value); return true; } catch { return false; } }
function setCanvasDimensions() {
  if (readOnlyImage) {
    pixelSurface.resize(readOnlyImage.width, readOnlyImage.height); canvas.style.aspectRatio = `${readOnlyImage.width} / ${readOnlyImage.height}`; canvasPrepared = true;
    canvas.style.setProperty('--draw-aspect', `${readOnlyImage.width} / ${readOnlyImage.height}`);
    canvas.setAttribute('aria-label', `${readOnlyImage.width}×${readOnlyImage.height}の原本。表示と保存ができます。`);
    $('.draw-grid').hidden = true; $('.draw-cursor').hidden = true;
    $('#draw-size-label').textContent = `${readOnlyImage.width}×${readOnlyImage.height}px`; return;
  }
  pixelSurface.resize(documentData.width, documentData.height);
  $('.draw-grid').hidden = false;
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
  if (readOnlyImage) { setCanvasDimensions(); canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(readOnlyImage.rgba), readOnlyImage.width, readOnlyImage.height), 0, 0); updateControls(); return; }
  if (!canvasPrepared || canvas.width !== documentData.width || canvas.height !== documentData.height) setCanvasDimensions();
  pixelSurface.paint(documentData.pixels, documentData.palette, changed);
  updateControls();
}
function renderPalette() {
  const palette = $('#draw-palette'); palette.replaceChildren();
  const transparent = document.createElement('button'); transparent.type = 'button'; transparent.className = 'draw-color draw-color--transparent'; transparent.dataset.colorIndex = '-1'; transparent.setAttribute('aria-label', '透明色'); transparent.setAttribute('aria-pressed', String(selectedColor === -1));
  transparent.addEventListener('click', (event) => chooseColor(-1, event.currentTarget)); palette.append(transparent);
  const usesDefaultPalette = documentData.palette.length === DRAW_PALETTE.length && documentData.palette.every((color, index) => color.toLowerCase() === DRAW_PALETTE[index].toLowerCase());
  const order = usesDefaultPalette ? DRAW_PALETTE_ORDER : documentData.palette.map((_, index) => index);
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
  if (documentData.palette.length < 32) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'draw-color'; add.textContent = '+'; add.setAttribute('aria-label', '色を追加する');
    add.addEventListener('click', () => {
      if (!canEdit()) return;
      closeColorEditor(); const palette = [...documentData.palette, '#8ecdf0'];
      history.commit({ ...documentData, pixels: [...documentData.pixels], palette });
      selectedColor = palette.length - 1; renderPalette(); showCurrentColor(); openColorEditor(selectedColor);
    }); palette.append(add);
  }
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
  if (!canEdit()) return;
  editorUi.closePanels();
  closeColorEditor();
  const editor = $('#draw-color-editor'); const base = [...documentData.palette];
  colorEdit = { index, base, maxColors: hasPass() ? 32 : 16, ...hexToHsl(base[index].slice(0, 7)) };
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
  const candidate = [...documentData.palette]; candidate[colorEdit.index] = hex;
  if (usedColorCount({ ...documentData, palette: candidate }) > colorEdit.maxColors) { toast(`この操作は${colorEdit.maxColors}色までです。色を増やすには特典時間を追加してください。`); return; }
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
const editorUi = mountCreationEditorUi($('#main'), { beforePanelOpen: closeColorEditor });
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
// A mode switch never changes the shared image's dimensions or colours.
let fitNotice = '';
let passPrompt = false;
function usedColorCount(value = documentData) {
  const colors = new Set();
  for (const index of value.pixels) {
    const hex = index < 0 ? '#00000000' : value.palette[index].toLowerCase();
    colors.add(hex.length === 7 ? `${hex}ff` : hex);
    if (colors.size > 32) break;
  }
  return colors.size;
}
function canEdit(value = documentData) {
  if (readOnlyImage) { toast('原本を表示しています。編集するにはプロジェクトのキャンバス設定でサイズと色を合わせてください。'); return false; }
  const policy = evaluateSharedCanvasPolicy({ width: value.width, height: value.height, colorCount: usedColorCount(value) }, { passActive: hasPass() });
  if (policy.supported && !policy.locked) return true;
  if (!policy.supported) { toast('この作品は表示・保存できます。プロジェクトのキャンバス設定で256px・32色以内に合わせると編集できます。'); return false; }
  toast('このキャンバスの編集には特典時間を追加してください。作品はそのまま保存できます。');
  if (!passPrompt) { passPrompt = true; void requestPass({ perk: 'project.canvas-expanded' }).finally(() => { passPrompt = false; }); }
  return false;
}
function replaceDocument(nextDocument, nextSource = source, { fromPxd = false } = {}) {
  if (colorEdit) closeColorEditor();
  validateDrawDocument(nextDocument); fitNotice = ''; readOnlyImage = null;
  interactionEffects.clear();
  if (!fromPxd) { pxdBridge?.reset(); pxdImageRole = 'main'; }
  documentData = nextDocument; source = nextSource; history = recordedHistory(createDrawHistory(documentData)); activeDraftId = null; baseRevisionId = null; saved = false;
  selectedColor = Math.min(Math.max(selectedColor, 0), documentData.palette.length - 1); renderPalette(); sizeSelect.value = String(documentData.width); setCanvasDimensions(); paint();
}
function commitChange(operation) {
  if (!canEdit()) return;
  const next = { ...documentData, palette: documentData.palette, pixels: [...documentData.pixels] }; const changed = operation(next);
  if (!canEdit(next)) return;
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
  const changed = [...strokePixels(documentData, from, to, value, { trusted: true })];
  if (mirror) changed.push(...strokePixels(documentData, mirrored(from), mirrored(to), value, { trusted: true }));
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
  if (tool !== 'picker' && !canEdit()) return;
  if (tool !== 'picker' && tool !== 'fill') {
    const value = selectedPixelValue(); const used = new Set(documentData.pixels);
    if (!used.has(value) && usedColorCount() >= (hasPass() ? 32 : 16)) {
      if (!hasPass()) { toast('色を増やすには特典時間を追加してください。'); if (!passPrompt) { passPrompt = true; void requestPass({ perk: 'project.canvas-expanded' }).finally(() => { passPrompt = false; }); } }
      else toast('このキャンバスは32色まで使えます。今の色を変更して描いてください。');
      return;
    }
  }
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

[16, 32, 64, 128, 256].forEach((size) => { const option = document.createElement('option'); option.value = String(size); option.textContent = `${size}px`; sizeSelect.append(option); });
sizeSelect.value = String(DRAW_SIZE);
sizeSelect.addEventListener('change', () => {
  sizeWasChosen = true;
  const previousSize = documentData.width; const size = Number(sizeSelect.value);
  try {
    const factor = size / Math.max(documentData.width, documentData.height);
    const next = resizeDrawRectangle(documentData, Math.max(1, Math.round(documentData.width * factor)), Math.max(1, Math.round(documentData.height * factor)));
    if (!canEdit(next)) { sizeSelect.value = String(previousSize); return; }
    replaceDocument(next, source, { fromPxd: true }); pxdBridge?.markDirty(); status.textContent = `${next.width}×${next.height}にしました`;
  }
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
function syncSizeButtons() {
  for (const b of sizeButtons) b.setAttribute('aria-checked', String(Number(b.dataset.drawSize) === documentData.width && documentData.width === documentData.height));
  const chip = $('#draw-size-chip'); if (chip) chip.textContent = String(documentData.width);
}
for (const b of sizeButtons) b.addEventListener('click', () => {
  $('.draw-import')?.removeAttribute('open'); if (sizeSelect.value === b.dataset.drawSize && documentData.width === Number(b.dataset.drawSize)) return; sizeSelect.value = b.dataset.drawSize; sizeSelect.dispatchEvent(new Event('change')); });
function afterHistoryStep() {
  saved = false; const step = history.lastStep;
  if (step?.paletteChanged) { renderPalette(); showCurrentColor(); paint(); } else paint(step?.indices || null);
}
function undo() { if (drawing || !canEdit()) return false; if (colorEdit) closeColorEditor(); if (!history.undo()) return false; afterHistoryStep(); return true; }
function redo() { if (drawing || !canEdit()) return false; if (colorEdit) closeColorEditor(); if (!history.redo()) return false; afterHistoryStep(); return true; }
// a tap steps once; holding the button keeps stepping
for (const [id, step] of [['#draw-undo', undo], ['#draw-redo', redo]]) {
  const button = $(id); let timer = 0; let repeated = false;
  const stop = () => { clearTimeout(timer); timer = 0; };
  button.addEventListener('pointerdown', () => { repeated = false; stop(); timer = setTimeout(function again() { repeated = true; if (step()) timer = setTimeout(again, 90); }, 420); });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, stop);
  button.addEventListener('click', () => { if (repeated) { repeated = false; return; } step(); });
}
addEventListener('keydown', (event) => {
  if (document.body.hasAttribute('data-tool-result-open')) return;
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
  if (!store && !pxdBridge?.currentProject && !pxdBridge?.heldProject) return;
  if (readOnlyImage) { await pxdBridge?.save(); status.textContent = '原本をそのままプロジェクトに保存しました。'; return null; }
  closeColorEditor(); editorUi.closePanels();
  const snapshot = structuredClone(documentData);
  const sourceDocument = documentData; const sourceProjectId = pxdBridge?.currentProject?.projectId;
  saveButton.disabled = true; globeButton.disabled = true; status.textContent = '保存しています…';
  let projectSaved = false;
  try {
    // PXD is the authoritative project. A legacy draft below is a handoff copy only.
    await pxdBridge?.save();
    projectSaved = Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject);
  } catch (error) {
    status.textContent = `プロジェクトを保存できませんでした：${error.message || '保存先を確認してください。'}`;
    saveButton.disabled = false; globeButton.disabled = false;
    return null;
  }
  if (!store) {
    saved = projectSaved;
    status.textContent = projectSaved ? 'プロジェクトを保存しました。端末の再開用コピーは利用できません。' : '端末内保存を使えません。';
    saveButton.disabled = false; globeButton.disabled = false;
    return projectSaved ? { document: snapshot, projectSaved: true } : null;
  }
  try {
    const draftId = activeDraftId || crypto.randomUUID();
    // Save only on top of the version this edit started from; another tab's save stops it (the edit stays on screen).
    const revision = await store.save({ draftId, kind: 'pixel_art', document: snapshot, source: structuredClone(source), expectedRevisionId: activeDraftId ? baseRevisionId : null });
    if (sourceDocument !== documentData || sourceProjectId !== pxdBridge?.currentProject?.projectId) return revision;
    activeDraftId = draftId; baseRevisionId = revision.revisionId; saved = true;
    if (!setLastDraftId(draftId)) { status.textContent = projectSaved ? 'プロジェクトを保存しました。端末の再開用コピーの目印は残せませんでした。' : '絵は端末に保存しましたが、再開用の目印を残せませんでした。'; }
    else status.textContent = projectSaved ? 'PXDプロジェクトと端末の再開用コピーを保存しました。' : '端末に保存しました。';
    resumeButton.hidden = false; $('#draw-copy-last').hidden = false;
    return revision;
  } catch (error) {
    if (projectSaved) {
      saved = true;
      status.textContent = `プロジェクトは保存しました。端末の再開用コピーを保存できませんでした：${error.message || '端末の空き容量を確認してください。'}`;
      return { document: snapshot, projectSaved: true };
    }
    status.textContent = `保存できませんでした：${error.message || '端末の空き容量を確認してください。'}`;
    return null;
  }
  finally { saveButton.disabled = false; globeButton.disabled = false; }
}
saveButton.addEventListener('click', () => saveRevision());
globeButton.addEventListener('click', async () => {
  try {
    await pxdBridge?.assertCanSave();
    validateDrawPixels(documentData);
    globeButton.disabled = true;
    const revision = await saveRevision();
    if (!revision) return;
    if (!revision.revisionId) {
      status.textContent = 'プロジェクトは保存しました。地球儀へ送るコピーを作成できませんでした。';
      return;
    }
    globeButton.disabled = true;
    const png = await encodeDrawPng(revision.document);
    const serialized = await serializeDrawHandoff(png, revision.revisionId);
    sessionStorage.setItem(DRAW_HANDOFF_KEY, serialized);
    location.assign('/globe/?from=draw');
  } catch (error) { status.textContent = `地球儀へ送れませんでした：${error.message}`; }
  finally { globeButton.disabled = false; }
});
async function loadLastDraft({ copy = false } = {}) {
  if (pxdBridge?.beforeReplace && !loadingLegacy) {
    await pxdBridge.beforeReplace(async () => { loadingLegacy = true; try { await loadLastDraft({ copy: true }); } finally { loadingLegacy = false; } }); return;
  }
  const draftId = getLastDraftId(); if (!draftId || !store) return;
  const ticket = loadGate.begin();
  resumeButton.disabled = true; $('#draw-copy-last').disabled = true; status.textContent = copy ? '複製しています…' : '前回の絵を開いています…';
  try {
    const revision = await store.load(draftId); if (!revision) throw new Error('保存した絵が見つかりません。');
    if (!loadGate.isCurrent(ticket)) return;
    validateDrawDocument(revision.document);
    pxdBridge?.reset(); pxdImageRole = 'main';
    const nextSource = copy ? { type: 'local_draft_copy', assetId: revision.asset.assetId, revisionId: revision.revisionId, sourceDraftId: draftId, parentSource: revision.asset.source } : revision.asset.source;
    documentData = structuredClone(revision.document); source = nextSource; activeDraftId = copy ? null : draftId; baseRevisionId = copy ? null : revision.revisionId; history = recordedHistory(createDrawHistory(documentData)); saved = !copy;
    renderPalette(); sizeSelect.value = String(documentData.width); setCanvasDimensions(); paint();
    status.textContent = `${copy ? '複製しました' : 'ひらきました'}${fitNotice ? ` ${fitNotice}` : ''}`;
  } catch (error) { status.textContent = `${copy ? '複製できませんでした' : '開けませんでした'}：${error.message}`; }
  finally { resumeButton.disabled = false; $('#draw-copy-last').disabled = false; }
}
resumeButton.addEventListener('click', () => loadLastDraft());
$('#draw-copy-last').addEventListener('click', () => loadLastDraft({ copy: true }));

async function importImage(file, importSource) {
  if (pxdBridge?.beforeReplace && !loadingLegacy) {
    await pxdBridge.beforeReplace(async () => { loadingLegacy = true; try { await importImage(file, importSource); } finally { loadingLegacy = false; } }); return;
  }
  const ticket = loadGate.begin();
  $('#draw-import-local').disabled = true; status.textContent = '画像を読み込んでいます…';
  try {
    const image = await decodeDrawImageFile(file);
    if (!loadGate.isCurrent(ticket)) return; // a newer open or import has replaced this one
    const original = { width: image.width, height: image.height, rgba: new Uint8Array(image.data) };
    const prepared = prepareSharedCanvasImage(original, { passActive: hasPass() });
    const next = imageToDrawDocument(prepared.image);
    if (prepared.changed && !await confirmPxdConversion({ image: original, document: next, title: '読み込む絵を確認', applyLabel: 'この絵を使う', message: `${next.width}×${next.height}px・${prepared.colorCount}色に合わせます。元の画像ファイルは変更しません。` })) return;
    if (!loadGate.isCurrent(ticket)) return;
    replaceDocument(next, importSource); fitNotice = '';
    status.textContent = `${scaleNotice(image)}${next.width}×${next.height}・${prepared.colorCount}色で読み込みました`;
  } catch (error) { status.textContent = `画像を複製できませんでした：${error.message}`; }
  finally { $('#draw-import-local').disabled = false; $('#draw-import-file').value = ''; }
}
$('#draw-import-local').addEventListener('click', () => $('#draw-import-file').click());
$('#draw-import-file').addEventListener('change', () => { const file = $('#draw-import-file').files?.[0]; if (file) importImage(file, { type: 'local_image_copy', assetId: null, revisionId: null }); });
if (getLastDraftId()) { resumeButton.hidden = false; $('#draw-copy-last').hidden = false; }
// Pictures from the other tools come in as a new version of this tool's own picture, then open.
if (store) mountPictureShelf($('#draw-shelf'), { tool: 'draw', adapter: drawAdapter, onBrought: async ({ from }) => { await loadLastDraft(); status.textContent = `${from.label}の絵を持ってきました`; }, onError: (error) => { status.textContent = `持ってこられませんでした：${error.message}`; } });
paint();

// ---- saving: the picture leaves PiXiEED enlarged (crisp dots, about 2048px), on phones via the share sheet ----
$('#draw-export').addEventListener('click', async () => {
  closeColorEditor(); editorUi.closePanels();
  const original = documentData; const originalSource = source;
  const bridge = pxdBridge; const project = bridge?.currentProject; const held = bridge?.heldProject;
  const unchangedSource = () => documentData === original && source === originalSource && pxdBridge === bridge
    && bridge?.currentProject === project && bridge?.heldProject === held;
  const image = readOnlyImage ? { width: readOnlyImage.width, height: readOnlyImage.height, data: new Uint8Array(readOnlyImage.rgba) } : { width: original.width, height: original.height, data: documentRgba(structuredClone(original)) };
  try {
    await bridge?.assertCanSave?.();
    if (!unchangedSource()) return;
    const { blob, width, height } = await enlargedPng(image);
    if (!unchangedSource()) return;
    interactionEffects.exportImage({ from: canvas, to: $('#draw-export'), image: canvas });
    const result = await saveFile(blob, `pixieed-drawing-${image.width}x${image.height}@${width}x${height}.png`);
    if (result !== 'cancelled' && unchangedSource()) {
      status.textContent = `${width}×${height}pxで保存しました`;
      if (readOnlyImage || original.pixels.some((pixel) => pixel >= 0)) resultView.show({ title: 'PNGを保存しました', detail: `${width}×${height}px`, preview: canvas });
    }
  } catch (error) { if (unchangedSource()) status.textContent = `PNGを書き出せませんでした：${error.message}`; }
});
// ---- time-lapse: a short free replay, with a longer detailed replay as a pass perk ----
function recordedHistory(target) {
  timelapse.reset(documentData);
  return new Proxy(target, { get(object, key) {
    const value = Reflect.get(object, key, object);
    if (key === 'commit') return (...args) => {
      const beforePixels = documentData.pixels; const beforePalette = documentData.palette;
      const done = value.apply(object, args);
      if (done) {
        pxdBridge?.markDirty();
        const paletteChanged = beforePalette !== documentData.palette;
        const indices = [];
        if (!paletteChanged) for (let index = 0; index < beforePixels.length; index += 1) if (beforePixels[index] !== documentData.pixels[index]) indices.push(index);
        timelapse.record(documentData, { indices, paletteChanged });
      }
      return done;
    };
    if (key === 'undo' || key === 'redo') return (...args) => {
      const done = value.apply(object, args);
      if (done) { timelapse.record(documentData, object.lastStep); pxdBridge?.markDirty(); }
      return done;
    };
    return typeof value === 'function' ? value.bind(object) : value;
  } });
}
history = recordedHistory(history);
let timelapseExporting = false;
let activeTimelapseJob = null;
function timelapseJobIsCurrent(job) {
  return activeTimelapseJob === job && !job.controller.signal.aborted
    && documentData === job.document
    && source === job.source
    && pxdBridge === job.bridge
    && job.bridge?.currentProject === job.currentProject
    && job.bridge?.heldProject === job.heldProject;
}
addEventListener('pagehide', () => activeTimelapseJob?.controller.abort());
async function exportTimelapse(detail) {
  if (timelapseExporting) return;
  closeColorEditor(); editorUi.closePanels();
  const job = {
    controller: new AbortController(),
    document: documentData,
    source,
    bridge: pxdBridge,
    currentProject: pxdBridge?.currentProject,
    heldProject: pxdBridge?.heldProject
  };
  const timeline = timelapse.snapshot();
  if (timeline.length < 2) { toast('描くと、その過程をGIFにできます'); return; }
  activeTimelapseJob = job;
  timelapseExporting = true;
  const basicButton = $('#draw-timelapse'); const detailButton = $('#draw-timelapse-detail');
  basicButton.disabled = true; detailButton.disabled = true;
  try {
    // Permission is captured at the button press; expiry never cancels this export.
    if (detail && !await requestPass({ perk: 'draw.timelapse-detail' })) return;
    if (!timelapseJobIsCurrent(job)) return;
    await job.bridge?.assertCanSave?.();
    if (!timelapseJobIsCurrent(job)) return;
    const frames = selectDrawTimelapseFrames(timeline, { detail, fps: TIMELAPSE_FPS });
    const { bytes, width, height } = await encodeAnimatedGif(frames, { delayMs: 1000 / TIMELAPSE_FPS, signal: job.controller.signal, longEdge: 1024, maxPixels: 80e6 });
    if (!timelapseJobIsCurrent(job)) return;
    const result = await saveFile(new Blob([bytes], { type: 'image/gif' }), `pixieed-drawing-timelapse-${width}x${height}.gif`);
    if (result !== 'cancelled' && timelapseJobIsCurrent(job)) {
      toast(detail ? '詳しい描画過程を保存しました' : '描いた過程を保存しました');
      if (job.document.pixels.some((pixel) => pixel >= 0)) resultView.show({ title: 'GIFを保存しました', detail: `${width}×${height}px`, preview: canvas });
    }
  } catch (error) {
    if (timelapseJobIsCurrent(job) && error?.name !== 'AbortError') status.textContent = `GIFを作れませんでした：${error.message}`;
  } finally {
    if (activeTimelapseJob === job) activeTimelapseJob = null;
    timelapseExporting = false;
    basicButton.disabled = false; detailButton.disabled = false;
  }
}
$('#draw-timelapse').addEventListener('click', () => exportTimelapse(false));
// the ⋯ sheet closes when you touch anything else (the PXD panel opened from it counts as inside)
document.addEventListener('pointerdown', (event) => {
  const sheet = $('.draw-import'); if (!sheet?.open) return;
  if (sheet.contains(event.target) || event.target.closest?.('#pxd-panel, .pxd-conversion')) return;
  sheet.removeAttribute('open');
});
$('#draw-timelapse-detail').addEventListener('click', () => exportTimelapse(true));

pxdBridge = mountPxdTools({
  tool: 'draw',
  projectWorkspace: true,
  getEditorState: () => ({ selectedColor, selectedHex: selectedColor < 0 ? null : documentData.palette[selectedColor], brushColors: [...documentData.palette], tool, zoom, panX, panY, mirror, showGrid, imageRole: pxdImageRole }),
  restoreEditorState(state) {
    if (!readOnlyImage) {
      const originalPalette = [...documentData.palette];
      const brushes = (state?.brushColors || []).filter((color) => typeof color === 'string' && /^#[a-f\d]{6}(?:[a-f\d]{2})?$/i.test(color));
      documentData.palette = [...new Set([...originalPalette, ...brushes])].slice(0, Math.max(originalPalette.length, 32));
      history = recordedHistory(createDrawHistory(documentData));
    }
    selectedColor = Number.isInteger(state?.selectedColor) && state.selectedColor >= -1 && state.selectedColor < documentData.palette.length ? state.selectedColor : Math.min(2, documentData.palette.length - 1);
    if (state?.selectedHex && documentData.palette.includes(state.selectedHex)) selectedColor = documentData.palette.indexOf(state.selectedHex);
    setTool(['pen', 'eraser', 'fill', 'picker', 'line'].includes(state?.tool) ? state.tool : 'pen');
    zoom = Number.isFinite(state?.zoom) ? Math.max(1, Math.min(ZOOM_MAX, state.zoom)) : 1;
    panX = Number.isFinite(state?.panX) ? state.panX : 0; panY = Number.isFinite(state?.panY) ? state.panY : 0;
    mirror = state?.mirror === true; mirrorButton?.setAttribute('aria-pressed', String(mirror)); $('.draw-board')?.classList.toggle('is-mirror', mirror);
    showGrid = state?.showGrid !== false; syncGrid(); renderPalette(); updateCanvasView();
  },
  hasContent: () => Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject || activeDraftId || documentData.pixels.some((pixel) => pixel >= 0)),
  setStatus: (message) => { status.textContent = message; },
  async openProject(project) {
    const params = new URLSearchParams(location.search); const requestedRole = params.get('pxd') === project.projectId && params.getAll('pxdImage').length === 1 ? params.get('pxdImage') : null;
    if (!project.entries.length) { pxdImageRole = 'main'; replaceDocument(createDrawDocument(), { type: 'hand_drawn', assetId: null, revisionId: null }, { fromPxd: true }); return; }
    const roles = pxdImageRoles(project);
    const rememberedRole = project.manifest.editorState?.draw?.imageRole;
    let role = project.manifest.sharedCanvas ? 'main' : requestedRole || (roles.includes(rememberedRole) ? rememberedRole : roles.includes('draw') ? 'draw' : roles.includes('main') ? 'main' : roles[0]);
    let nextDocument;
    {
      try { nextDocument = await readPxdDrawDocument(project, role); }
      catch (error) {
        const image = await readPxdImage(project, role);
        if (!image || !(error instanceof RangeError)) throw error;
        readOnlyImage = image; pxdImageRole = role || 'main'; saved = true; paint();
        status.textContent = '原本をそのまま表示しています。PNG・PXDで保存できます。編集するには共通キャンバス設定でサイズと色を合わせてください。'; return;
      }
    }
    if (!nextDocument) throw new Error('このPXDには描画できる画像部品がありません。別のPXDや保存版を選んでください。');
    validateDrawDocument(nextDocument);
    pxdImageRole = role || 'main';
    replaceDocument(structuredClone(nextDocument), { type: 'pxd_project_copy', assetId: null, revisionId: null, projectId: project.projectId, imageRole: pxdImageRole }, { fromPxd: true });
    saved = true; paint();
  },
  async getProject(project) {
    if (readOnlyImage) return project;
    const snapshot = structuredClone(documentData); const role = pxdImageRole;
    let next = project || createPxdProject();
    next = await synchronizeLinkedAudioImage(next, snapshot, role);
    return writePxdDrawDocument(next, snapshot, role);
  }
});
