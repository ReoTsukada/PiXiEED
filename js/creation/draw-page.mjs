import { scaleNotice } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';
import { createLatestGate } from './pixel-contract.mjs?rev=20260928-data-contract-1';
import { mountPictureShelf } from './picture-shelf.mjs?rev=20260928-picture-shelf-1';
import { createLocalDraftStore, createIndexedDbDraftAdapter } from './local-drafts.mjs';
import { createDrawDocument, createDrawHistory, DRAW_PALETTE, DRAW_PALETTE_ORDER, DRAW_SIZE, documentRgba, beginDrawStroke, commitDrawStroke, cancelDrawStroke, floodFill, resizeDrawRectangle, strokePixels, validateDrawDocument } from './draw-core.mjs?rev=20261001-animation-1';
import { createDrawAnimationSession } from './draw-animation-session.mjs';
import { addAnimationFrame, removeAnimationFrame, moveAnimationFrame, addAnimationLayer, removeAnimationLayer, moveAnimationLayer, setLayerProperties, setAnimationFrameDuration, setAnimationPalette, composeAnimationFrame, resizeAnimation, getAnimationUsedColorIndices, hasAnimationCelContent } from './animation-core.mjs';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs';
import { mountAnimationControls } from './animation-controls.mjs?rev=20261004-layer-add-bottom-1';
import { rawPixelCellAt } from './pixel-input.mjs?rev=20261001-connected-editor-1';
import { createImportedDrawDocument, decodeDrawImageFile } from './draw-import.mjs?rev=20260928-pixel-roundtrip-1';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { DRAW_HANDOFF_KEY, encodeDrawPng, serializeDrawHandoff, validateDrawPixels } from './draw-handoff.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { createPxdProject } from './pxd-codec.mjs';
import { confirmPxdConversion } from './pxd-ui.mjs?rev=20261006-panel-close-1';
import { mountProjectWorkspace as mountPxdTools } from './project-workspace.mjs?rev=20261006-panel-close-1';
import { pxdImageRoles, readPxdImage, imageToDrawDocument } from './pxd-project.mjs?rev=20261001-free-tools-1';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20261001-free-tools-1';
import { prepareSharedCanvasImage } from './shared-image.mjs?rev=20261001-free-tools-1';
import { enlargedPng, saveFile } from '../pixel-export.mjs?rev=20260928-pixel-roundtrip-1';
import { encodeAnimatedGif } from '../animated-export.mjs?v=20261001-animation-1';
import { createDrawTimelapse, selectDrawTimelapseFrames } from './draw-timelapse.mjs?rev=20260928-draw-timelapse-1';
import { readPxdAudioLink, readPxdDrawDocument, writePxdDrawDocument } from './pxd-draw-audio.mjs?rev=20261001-free-tools-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20261002-tool-transfer-1';
import { mountCreationEditorUi } from './editor-ui.mjs?rev=20260929-shared-editor-1';
import { wheelZoomFactor } from './viewport-wheel.mjs';
import { applyDrawingToolIcons, createDrawingToolIcon } from './drawing-tool-icons.mjs?rev=20261004-canvas-settings-1';
import { drawShapePixels, sprayPixels, selectionBounds, moveSelectionPixels } from './draw-tool-operations.mjs?rev=20261004-symmetry-color-panel-1';

import { symmetryTransforms, symmetryPoint, symmetryPoints } from './drawing-symmetry.mjs?rev=20261004-symmetry-color-panel-1';
import { mountDrawCanvasPanel } from './draw-canvas-panel.mjs?rev=20261004-canvas-settings-1';
import { mountColorPanel } from './color-panel.mjs?rev=20261006-panel-close-1';

export async function mountDrawMode({ scope, mountWorkspace = mountPxdTools } = {}) {
if (!scope) throw new TypeError('Draw mode requires a lifecycle scope');
const setTimeout = (callback, delay) => scope.timeout(callback, delay);
const clearTimeout = (id) => scope.clearTimeout(id);
const requestAnimationFrame = (callback) => scope.frame(callback);
const cancelAnimationFrame = (id) => scope.cancelFrame(id);

const LAST_DRAFT_KEY = 'pixieed.simple-draw.last-draft.v1';
const $ = (selector) => document.querySelector(selector);
const canvas = $('#draw-canvas'); const pixelSurface = createPixelCanvasSurface(canvas);
applyDrawingToolIcons($('#main'));
const penControl = $('[data-draw-tool="pen"]');
const eraserControl = $('[data-draw-tool="eraser"]');
const penIcon = createDrawingToolIcon('pen');
const eraserIcon = createDrawingToolIcon('eraser');
// One visible control alternates between drawing and erasing.
eraserControl?.remove();
const resultView = createToolResultView({ key: 'draw-result', main: $('#main'), returnLabel: '描画に戻る',
  beforeShow: () => { closeColorEditor(); editorUi.closePanels(); animationControls?.close?.(); interactionEffects.clear(); },
  onClose: () => requestAnimationFrame(placeOverlays) });
const status = $('#draw-status'); const saveButton = $('#draw-save'); const resumeButton = $('#draw-resume');
const globeButton = $('#draw-to-globe');
const sizeSelect = $('#draw-size');
const interactionEffects = createInteractionEffects();
let documentData = createDrawDocument(); let history = createDrawHistory(documentData); let selectedColor = 2; let tool = 'pen'; let drawing = false; let previousPoint = null; let strokeStartPixels = null; let activeDraftId = null; let source = { type: 'hand_drawn', assetId: null, revisionId: null }; let saved = false; let canvasPrepared = false; let sizeWasChosen = false;
let animationSession = createDrawAnimationSession(documentData), animationControls = null, strokeTracker = null;
let selection = null, selectionDrag = null, strokeWasSaved = false;
const selectionOverlay = document.createElement('div'); selectionOverlay.className = 'draw-selection'; selectionOverlay.setAttribute('aria-hidden', 'true'); selectionOverlay.hidden = true; $('.draw-board').append(selectionOverlay);
scope.add(() => selectionOverlay.remove());
const TOOL_NAMES = { pen: 'ペン', eraser: '消しゴム', fill: '塗りつぶし', line: '直線', rectangle: '四角形', 'rectangle-fill': '四角塗り', ellipse: '楕円', 'ellipse-fill': '楕円塗り', spray: 'スプレー', select: '範囲移動', picker: 'スポイト' };
const SHAPE_TOOLS = new Set(['line', 'rectangle', 'rectangle-fill', 'ellipse', 'ellipse-fill']);
let lastOtherTool = 'fill';
let playing = false, onion = false, playbackFrame = null, playbackStarted = 0, playbackOffset = 0, playbackRequest = 0;
const onionCanvas = document.createElement('canvas'); onionCanvas.className = 'draw-onion'; onionCanvas.setAttribute('aria-hidden', 'true'); onionCanvas.style.cssText = 'position:absolute;pointer-events:none;image-rendering:pixelated;z-index:1'; $('.draw-board').append(onionCanvas); onionCanvas.hidden = true;
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
    $('.draw-grid').hidden = true; $('.draw-cursor').hidden = true; requestAnimationFrame(() => syncSizeButtons(true));
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
  $('#draw-undo').disabled = !animationSession.canUndo; $('#draw-redo').disabled = !animationSession.canRedo;
  $('#draw-undo').setAttribute('aria-disabled', String(!animationSession.canUndo)); $('#draw-redo').setAttribute('aria-disabled', String(!animationSession.canRedo));
  status.textContent = saved ? '保存しました。' : '編集中です。保存すると端末に残ります。';
}
function paint(changed = null) {
  if (readOnlyImage) { setCanvasDimensions(); canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(readOnlyImage.rgba), readOnlyImage.width, readOnlyImage.height), 0, 0); updateControls(); return; }
  if (!canvasPrepared || canvas.width !== documentData.width || canvas.height !== documentData.height) setCanvasDimensions();
  const display = playing ? composeAnimationFrame(animationSession.animation, playbackFrame || animationSession.frameId) : animationSession.composite(documentData, changed);
  pixelSurface.paint(display.pixels, display.palette, playing ? null : changed);
  paintOnion(display);
  updateControls();
}
function installAnimationDocument(doc) {
  clearSelection();
  documentData = doc; history = recordedHistory(createDrawHistory(documentData)); saved = false;
  selectedColor = Math.min(selectedColor, doc.palette.length - 1); canvasPrepared = false;
  renderPalette(); showCurrentColor(); paint(); syncDrawingSettings(); animationControls?.refresh();
}
function stopAnimation() {
  playing = false; playbackFrame = null; cancelAnimationFrame(playbackRequest); playbackRequest = 0;
  animationControls?.refresh();
}
function toggleAnimation() {
  if (playing) { stopAnimation(); paint(); return; }
  endStroke(); closeColorEditor();
  const frames = animationSession.animation.frames; playbackOffset = 0;
  for (const frame of frames) { if (frame.id === animationSession.frameId) break; playbackOffset += frame.durationMs; }
  playing = true; playbackStarted = performance.now();
  const tick = (now) => {
    if (!playing || scope.disposed) return;
    const sequence = animationSession.animation.frames, total = sequence.reduce((sum, frame) => sum + frame.durationMs, 0);
    let time = (now - playbackStarted + playbackOffset) % total, current = sequence[0].id;
    for (const frame of sequence) { current = frame.id; if (time < frame.durationMs) break; time -= frame.durationMs; }
    if (current !== playbackFrame) { playbackFrame = current; paint(); }
    playbackRequest = requestAnimationFrame(tick);
  };
  animationControls?.refresh(); tick(playbackStarted);
}
let onionKey = '', onionGuide = null;
function paintOnion(display) {
  onionCanvas.hidden = !onion || playing || readOnlyImage;
  if (onionCanvas.hidden) return;
  const animation = animationSession.animation, key = `${animationSession.frameId}:${animation.frames.map((frame) => frame.id).join(',')}`;
  if (onionKey !== key || onionGuide?.animation !== animation) {
    const index = animation.frames.findIndex((frame) => frame.id === animationSession.frameId);
    onionGuide = { animation, previous: index > 0 ? composeAnimationFrame(animation, animation.frames[index - 1].id) : null,
      next: index + 1 < animation.frames.length ? composeAnimationFrame(animation, animation.frames[index + 1].id) : null }; onionKey = key;
  }
  onionCanvas.width = display.width; onionCanvas.height = display.height;
  const data = new Uint8ClampedArray(display.width * display.height * 4);
  for (let index = 0; index < display.pixels.length; index++) {
    if (display.pixels[index] >= 0) continue;
    const previous = onionGuide.previous?.pixels[index] >= 0, next = onionGuide.next?.pixels[index] >= 0;
    if (!previous && !next) continue;
    data.set(previous ? [255, 100, 110, 95] : [85, 185, 255, 95], index * 4);
  }
  onionCanvas.getContext('2d').putImageData(new ImageData(data, display.width, display.height), 0, 0); placeOverlays();
}
function handleAnimationAction(action) {
  if (action.type === 'play') return toggleAnimation();
  if (action.type === 'onion') {
    const enabled = typeof action.enabled === 'boolean' ? action.enabled : !onion;
    const canEnable = animationSession.animation.frames.length >= 2;
    onion = enabled ? canEnable : false;
    paint(); syncDrawingSettings(); animationControls?.refresh(); return;
  }
  if (action.type === 'export-gif') return exportAnimation();
  stopAnimation(); endStroke(); closeColorEditor();
  if (action.type === 'select-frame' || action.type === 'select-layer') { installAnimationDocument(animationSession.select(action.frameId, action.layerId)); return; }
  // Layer locking protects pixels, while its own switch must remain operable.
  const policy = evaluateSharedCanvasPolicy({ width: documentData.width, height: documentData.height, colorCount: usedColorCount() }, { passActive: true });
  if (readOnlyImage || !policy.supported) { toast('キャンバスは256px・32色まで編集できます。プロジェクトのキャンバス設定でサイズと色数を調整してください。'); return; }
  const a = animationSession.animation; let next = a, selection;
  switch (action.type) {
    case 'add-frame': next = addAnimationFrame(a, { sourceFrameId: action.frameId || animationSession.frameId, copy: action.copy !== false }); selection = { frameId: next.frames.at(-1).id, layerId: animationSession.layerId }; break;
    case 'delete-frame': next = removeAnimationFrame(a, action.frameId); break;
    case 'move-frame': next = moveAnimationFrame(a, action.frameId, action.index); break;
    case 'add-layer': next = addAnimationLayer(a, { name: `レイヤー ${a.layers.length + 1}` }); selection = { frameId: animationSession.frameId, layerId: next.layers.at(-1).id }; break;
    case 'delete-layer': next = removeAnimationLayer(a, action.layerId); break;
    case 'move-layer': next = moveAnimationLayer(a, action.layerId, action.index); break;
    case 'visibility': next = setLayerProperties(a, action.layerId, { visible: action.visible }); break;
    case 'lock': next = setLayerProperties(a, action.layerId, { locked: action.locked }); break;
    case 'rename-layer': next = setLayerProperties(a, action.layerId, { name: action.name }); break;
    case 'duration': next = setAnimationFrameDuration(a, action.frameId, action.durationMs); break;
    default: return;
  }
  installAnimationDocument(animationSession.apply(next, selection)); pxdBridge?.markDirty();
}
animationControls = mountAnimationControls({ host: $('#draw-animation-controls'), scope,
  getState: () => ({ ...animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId, playing, onion, readOnly: Boolean(readOnlyImage) }),
  onionControlExternal: true,
  onAction: handleAnimationAction,
  getCelHasContent: (frameId, layerId) => hasAnimationCelContent(animationSession.animation, frameId, layerId),
  getFramePreview: (frameId) => { const doc = composeAnimationFrame(animationSession.animation, frameId); return new ImageData(new Uint8ClampedArray(documentRgba(doc)), doc.width, doc.height); }
});
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
let colorEdit = null;
const colorPanel = mountColorPanel({ scope, getAnchor: () => $('.draw-control-row'), onChange: setEditColor, onClose: closeColorEditor });
function linkedToSong() {
  try { const link = readPxdAudioLink(pxdBridge?.currentProject || pxdBridge?.heldProject); return Boolean(link && link.imageRole === pxdImageRole); } catch { return false; }
}
function openColorEditor(index) {
  if (index < 0 || index >= documentData.palette.length || !canEdit()) return;
  editorUi.closePanels(); closeColorEditor();
  const base = [...documentData.palette]; colorEdit = { index, base, maxColors: 32 };
  colorPanel.open({ color: base[index].slice(0, 7), resetColor: index < DRAW_PALETTE.length ? DRAW_PALETTE[index] : null });
  $('.draw-current')?.setAttribute('aria-expanded', 'true');
}
function setEditColor(hex) {
  if (!colorEdit) return false;
  const actual = documentData.palette[colorEdit.index];
  if (actual === hex) return actual;
  const candidate = [...documentData.palette]; candidate[colorEdit.index] = hex;
  if (usedColorCount({ ...documentData, palette: candidate }) > colorEdit.maxColors) { toast(`このキャンバスは最大${colorEdit.maxColors}色です。使用中の色を置き換えてください。`); return actual; }
  documentData.palette = candidate;
  document.querySelector(`.draw-color[data-color-index="${colorEdit.index}"]`)?.style.setProperty('--draw-color', hex);
  saved = false; showCurrentColor(); paint(); pxdBridge?.markDirty(); return hex;
}
function closeColorEditor() {
  colorPanel.close();
  if (!colorEdit) return;
  const after = documentData.palette; documentData.palette = colorEdit.base; colorEdit = null;
  if (history.commit({ ...documentData, pixels: [...documentData.pixels], palette: after })) saved = false;
  $('.draw-current')?.setAttribute('aria-expanded', 'false');
  renderPalette(); showCurrentColor(); paint();
}
$('.draw-current')?.addEventListener('click', () => (colorEdit ? closeColorEditor() : openColorEditor(selectedColor)));
const editorUi = mountCreationEditorUi($('#main'), { beforePanelOpen: () => { closeColorEditor(); animationControls?.close?.(); } });
// touching the picture closes the sheet and draws straight away with the new colour
canvas.addEventListener('pointerdown', () => { if (colorEdit) closeColorEditor(); }, true);
scope.listen(window, 'keydown', (event) => { if (event.key === 'Escape' && colorEdit) closeColorEditor(); });
function showCurrentColor() {
  const chip = $('.draw-current'); if (!chip) return;
  chip.classList.toggle('is-clear', selectedColor < 0); chip.style.setProperty('--draw-color', selectedColor < 0 ? 'transparent' : documentData.palette[selectedColor]);
}
function chooseColor(index, sourceElement) {
  const penButton = document.querySelector('[data-draw-tool="pen"]');
  interactionEffects.color({ from: sourceElement, to: penButton, color: index < 0 ? '#fff' : documentData.palette[index] });
  selectedColor = index; if (tool === 'eraser' || tool === 'picker' || tool === 'select') setTool('pen'); showCurrentColor();
  document.querySelectorAll('.draw-color').forEach((node) => node.setAttribute('aria-pressed', String(Number(node.dataset.colorIndex) === index)));
}
// A mode switch never changes the shared image's dimensions or colours.
let fitNotice = '';
function usedColorCount(value = documentData) {
  const colors = new Set();
  if (value === documentData || value.pixels === documentData.pixels) {
    for (const index of getAnimationUsedColorIndices(animationSession.animation, { excludeFrameId: animationSession.frameId, excludeLayerId: animationSession.layerId })) {
      const hex = index < 0 ? '#00000000' : value.palette[index]?.toLowerCase();
      if (hex) colors.add(hex.length === 7 ? `${hex}ff` : hex);
    }
  }
  for (const index of value.pixels) {
    const hex = index < 0 ? '#00000000' : value.palette[index].toLowerCase();
    colors.add(hex.length === 7 ? `${hex}ff` : hex);
    if (colors.size > 32) break;
  }
  return colors.size;
}
function canEdit(value = documentData) {
  if (playing) { toast('再生を止めると編集できます。'); return false; }
  if (readOnlyImage) { toast('原本を表示しています。編集するにはプロジェクトのキャンバス設定でサイズと色を合わせてください。'); return false; }
  const policy = evaluateSharedCanvasPolicy({ width: value.width, height: value.height, colorCount: usedColorCount(value) }, { passActive: true });
  if (policy.supported) return true;
  if (!policy.supported) { toast('この作品は表示・保存できます。プロジェクトのキャンバス設定で256px・32色以内に合わせると編集できます。'); return false; }
  return false;
}
function replaceDocument(nextDocument, nextSource = source, { fromPxd = false } = {}) {
  endStroke(true); clearSelection();
  if (colorEdit) closeColorEditor();
  const nextAnimationSession = createDrawAnimationSession(nextDocument);
  validateDrawDocument(nextDocument); fitNotice = ''; readOnlyImage = null;
  interactionEffects.clear();
  if (!fromPxd) { pxdBridge?.reset(); pxdImageRole = 'main'; }
  documentData = nextDocument; source = nextSource; history = recordedHistory(createDrawHistory(documentData)); activeDraftId = null; baseRevisionId = null; saved = false;
  stopAnimation(); animationSession = nextAnimationSession; syncDrawingSettings(); animationControls?.refresh();
  selectedColor = Math.min(Math.max(selectedColor, 0), documentData.palette.length - 1); renderPalette(); sizeSelect.value = String(documentData.width); setCanvasDimensions(); paint();
}
function commitChange(operation) {
  if (animationSession.locked) { toast('レイヤーの鍵を外すと描けます。'); return; }
  if (!canEdit()) return;
  const next = { ...documentData, palette: documentData.palette, pixels: [...documentData.pixels] }; const changed = operation(next);
  if (!canEdit(next)) return;
  if (history.commit(next)) { saved = false; paint(changed && typeof changed.length === 'number' ? changed : null); }
}
function pointFromEvent(event) {
  return rawPixelCellAt(event, canvas.getBoundingClientRect(), documentData.width, documentData.height);
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
  Object.assign(grid.style, { left: `${r.left - b.left - board.clientLeft}px`, top: `${r.top - b.top - board.clientTop}px`, width: `${r.width}px`, height: `${r.height}px` });
  grid.style.setProperty('--symmetry-length', `${2 * Math.max(r.width, r.height)}px`);
  Object.assign(onionCanvas.style, { left: grid.style.left, top: grid.style.top, width: grid.style.width, height: grid.style.height });
  for (const node of [grid, canvas]) { node.style.setProperty('--cols', documentData.width); node.style.setProperty('--rows', documentData.height); }
  grid.classList.toggle('is-fine', r.width / documentData.width < 6);
  placeSelection();
}
function clearSelection() { selection = null; selectionDrag = null; selectionOverlay.hidden = true; }
function placeSelection() {
  selectionOverlay.hidden = !selection || tool !== 'select';
  if (selectionOverlay.hidden) return;
  const board = $('.draw-board'), b = board.getBoundingClientRect(), r = canvas.getBoundingClientRect();
  Object.assign(selectionOverlay.style, { left: `${r.left - b.left - board.clientLeft + selection.x * r.width / documentData.width}px`, top: `${r.top - b.top - board.clientTop + selection.y * r.height / documentData.height}px`, width: `${selection.width * r.width / documentData.width}px`, height: `${selection.height * r.height / documentData.height}px` });
}
function placeToolMenu() {
  const menu = $('.draw-tool-menu'), summary = $('#draw-tool-summary'); if (!menu || !summary) return;
  const r = summary.getBoundingClientRect(), header = document.querySelector('body > .site-header')?.getBoundingClientRect().bottom || 64;
  const navigationTop = document.querySelector('.app-tabs')?.getBoundingClientRect().top || innerHeight;
  const width = Math.min(196, innerWidth - 24), controls = $('.draw-controls').getBoundingClientRect();
  const above = Math.max(44, r.top - header - 20), below = Math.max(0, navigationTop - r.bottom - 20);
  const openBelow = below > above;
  menu.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, controls.left + (controls.width - width) / 2))}px`;
  menu.style.bottom = openBelow ? 'auto' : `${Math.max(12, innerHeight - r.top + 8)}px`;
  menu.style.top = openBelow ? `${r.bottom + 8}px` : 'auto';
  menu.style.maxHeight = `${Math.min(440, openBelow ? below : above)}px`;

}
const cursorTwins = Array.from({ length: 7 }, (_, index) => {
  const twin = index === 0 ? $('.draw-cursor-twin') : $('.draw-cursor-twin').cloneNode();
  if (index) { $('.draw-board').append(twin); scope.add(() => twin.remove()); }
  return twin;
});
function hideCursors() { $('.draw-cursor').hidden = true; cursorTwins.forEach(node => { node.hidden = true; }); }
function showCursor(event) {
  const cursor = $('.draw-cursor'); if (!cursor) return;
  if (event.pointerType === 'touch' && !drawing) { hideCursors(); return; }
  const p = pointFromEvent(event);
  if (p.x < 0 || p.y < 0 || p.x >= documentData.width || p.y >= documentData.height) { hideCursors(); return; }
  const board = $('.draw-board'), b = board.getBoundingClientRect(), r = canvas.getBoundingClientRect(), cw = r.width / documentData.width, ch = r.height / documentData.height;
  const points = tool === 'select' || tool === 'picker' ? [p] : symmetryPoints(p, documentData.width, documentData.height, symmetry);
  [cursor, ...cursorTwins].forEach((node, index) => {
    const point = points[index]; node.hidden = !point;
    if (!point) return;
    Object.assign(node.style, { left: `${r.left - b.left - board.clientLeft + point.x * cw}px`, top: `${r.top - b.top - board.clientTop + point.y * ch}px`, width: `${cw}px`, height: `${ch}px` });
    node.style.setProperty('--draw-color', tool === 'eraser' || selectedColor < 0 ? 'transparent' : documentData.palette[selectedColor] || 'transparent'); node.dataset.tool = tool;
  });
}
canvas.addEventListener('pointerleave', () => { if (!drawing) hideCursors(); });
// ---- short messages float over the canvas and fade (the status line keeps the full text for screen readers) ----
let toastTimer = 0;
function toast(message) { status.textContent = message; }
const QUIET = new Set(['編集中です。保存すると端末に残ります。', '新しい絵を準備しています。']);
const statusObserver = new MutationObserver(() => { if (scope.disposed || QUIET.has(status.textContent.trim())) return; status.classList.add('is-show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => { if (!scope.disposed) status.classList.remove('is-show'); }, 2600); });
scope.observe(statusObserver, status, { childList: true, characterData: true, subtree: true });
const overlayObserver = new ResizeObserver(() => { if (!scope.disposed) placeOverlays(); });
scope.observe(overlayObserver, $('.draw-board'));
function pointerPair() { return [...activePointers.values()].slice(0, 2); }
function startPinch() {
  if (drawing) endStroke(true);
  const [a, b] = pointerPair(); if (!a || !b) return;
  pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom, panX, panY, centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2, time: performance.now(), moved: 0, fingers: activePointers.size };
}
function selectedPixelValue() { return tool === 'eraser' ? -1 : selectedColor; }
// ---- drawing helpers: a mirror copy of every mark, the straight line, the colour picker ----
const SYMMETRY_NAMES = { horizontal: '左右対称', vertical: '上下対称', diagonalDown: '右下がりの対角線', diagonalUp: '右上がりの対角線' };
let symmetry = Object.fromEntries(Object.keys(SYMMETRY_NAMES).map(key => [key, false])); let lineStart = null;
let showGrid = true; try { showGrid = localStorage.getItem('pixieed:draw:grid') !== 'off'; } catch { /* private mode */ }
const symmetryButtons = [...document.querySelectorAll('[data-symmetry]')];
const gridButton = $('#draw-grid-toggle'), onionButton = $('#draw-onion-toggle');
const settingsPicker = $('#draw-settings-picker'), settingsSummary = $('#draw-settings-summary');
const symmetryAxes = symmetryButtons.map(button => {
  const axis = document.createElement('span'); axis.className = `draw-symmetry-axis axis-${button.dataset.symmetry}`; axis.hidden = true;
  $('.draw-grid').append(axis); scope.add(() => axis.remove()); return axis;
});
function setAttributeIfChanged(node, name, value) {
  const text = String(value); if (node && node.getAttribute(name) !== text) node.setAttribute(name, text);
}
function syncDrawingSettings() {
  const frames = animationSession?.animation?.frames?.length || 0, available = tool !== 'select';
  symmetryButtons.forEach((button, index) => {
    const key = button.dataset.symmetry; setAttributeIfChanged(button, 'aria-pressed', symmetry[key]); button.disabled = !available;
    button.title = available ? button.getAttribute('aria-label') : '範囲移動中は対称描画を使えません';
    if (!available) button.setAttribute('aria-description', button.title); else button.removeAttribute('aria-description');
    symmetryAxes[index].hidden = !available || !symmetry[key];
  });
  setAttributeIfChanged(gridButton, 'aria-pressed', showGrid); setAttributeIfChanged(onionButton, 'aria-pressed', onion);
  if (onionButton) { onionButton.disabled = frames < 2 && !onion; onionButton.title = onionButton.disabled ? '2コマ以上あると前後のコマを表示できます' : onionButton.getAttribute('aria-label'); }
  $('.draw-board')?.classList.toggle('has-symmetry', available && Object.values(symmetry).some(Boolean));
  $('.draw-board')?.classList.toggle('has-grid', showGrid);
}
function markSegment(from, to, value) {
  const changed = [];
  for (const matrix of symmetryTransforms(symmetry)) changed.push(...strokePixels(documentData, symmetryPoint(from, documentData.width, documentData.height, matrix), symmetryPoint(to, documentData.width, documentData.height, matrix), value, { trusted: true, tracker: strokeTracker }));
  return changed;
}
function pickColorAt(point) {
  if (point.x < 0 || point.y < 0 || point.x >= documentData.width || point.y >= documentData.height) return;
  const value = documentData.pixels[point.y * documentData.width + point.x];
  const button = document.querySelector(`.draw-color[data-color-index="${value}"]`);
  chooseColor(value, button); setTool('pen'); toast(value < 0 ? '透明をとりました' : 'この色をとりました');
}
function setTool(next) {
  if (!Object.hasOwn(TOOL_NAMES, next)) return;
  if (drawing) endStroke();
  if (next !== 'select') clearSelection();
  tool = next; syncDrawingSettings();
  document.querySelectorAll('[data-draw-tool]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.drawTool === next || (node === penControl && next === 'eraser'))));
  if (penControl) {
    const erasing = next === 'eraser';
    const glyph = erasing ? eraserIcon : penIcon;
    penControl.replaceChildren(glyph.cloneNode(true));
    const label = erasing ? '消しゴム（もう一度押すとペン）' : 'ペン（選択中に押すと消しゴム）';
    penControl.setAttribute('aria-label', label); penControl.title = label;
    penControl.classList.toggle('is-eraser', erasing);
  }
  const other = next !== 'pen' && next !== 'eraser';
  if (other) lastOtherTool = next;
  const summary = $('#draw-tool-summary');
  if (summary) {
    summary.querySelector('svg')?.replaceWith(createDrawingToolIcon(lastOtherTool));
    const label = summary.querySelector('[data-draw-tool-name]'); if (label) label.textContent = TOOL_NAMES[lastOtherTool];
    summary.dataset.active = String(other);
    summary.setAttribute('aria-label', `${TOOL_NAMES[lastOtherTool]}：道具を選ぶ`);
    summary.title = `${TOOL_NAMES[lastOtherTool]}：道具を選ぶ`;
  }
  canvas.dataset.tool = next;
  placeSelection();
}
function markShape(from, to) {
  if (tool === 'line') return markSegment(from, to, selectedPixelValue());
  return drawShapePixels(documentData, from, to, selectedPixelValue(), { shape: tool.startsWith('rectangle') ? 'rectangle' : 'ellipse', filled: tool.endsWith('-fill'), symmetry, tracker: strokeTracker });
}
function markSpray(from, to) { return sprayPixels(documentData, from, to, selectedPixelValue(), { symmetry, tracker: strokeTracker }); }
function updateSelection(point) {
  if (selectionDrag?.mode === 'move') {
    const { origin, bounds, pixels } = selectionDrag;
    const dx = Math.max(-bounds.x, Math.min(documentData.width - bounds.x - bounds.width, point.x - origin.x));
    const dy = Math.max(-bounds.y, Math.min(documentData.height - bounds.y - bounds.height, point.y - origin.y));
    cancelDrawStroke(documentData, strokeTracker); strokeTracker = beginDrawStroke(documentData, { trusted: true });
    moveSelectionPixels(documentData, pixels, bounds, dx, dy, { tracker: strokeTracker });
    selection = { ...bounds, x: bounds.x + dx, y: bounds.y + dy }; paint();
  } else selection = selectionBounds(lineStart, point, documentData.width, documentData.height);
  placeSelection();
}
let pendingTap = null; let pendingTapPointerId = null; let drawingPointerId = null; let panDrag = null; let spaceHeld = false; let fingerTap = null;
canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== undefined && event.button !== 0 && event.button !== 1) return;
  event.preventDefault(); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (event.pointerType === 'touch' && activePointers.size >= 2) { pendingTap = null; pendingTapPointerId = null; if (fingerTap && !pinchStart) { const tail = fingerTap; fingerTap = null; startPinch(); Object.assign(pinchStart, { time: tail.time, fingers: Math.max(tail.fingers, activePointers.size), moved: tail.moved }); return; } if (pinchStart) { pinchStart.fingers = Math.max(pinchStart.fingers, activePointers.size); return; } startPinch(); return; }
  // desktop: middle button, or Space held, drags the view
  if (event.button === 1 || spaceHeld) { panDrag = { x: event.clientX, y: event.clientY, panX, panY }; canvas.classList.add('is-panning'); return; }
  if (activePointers.size > 1) return;
  if (tool !== 'picker' && animationSession.locked) { toast('レイヤーの鍵を外すと描けます。'); return; }
  if (tool !== 'picker' && !canEdit()) return;
  if (tool !== 'picker' && tool !== 'fill' && tool !== 'select') {
    const value = selectedPixelValue(); const used = new Set(documentData.pixels);
    if (!used.has(value) && usedColorCount() >= 32) {
      toast('このキャンバスは最大32色です。色を置き換えるか、使わない色を整理してください。');
      return;
    }
  }
  strokeWasSaved = saved;
  drawing = true; drawingPointerId = event.pointerId; const touchedPoint = pointFromEvent(event); previousPoint = touchedPoint;
  if (tool === 'picker' || tool === 'fill') { pendingTap = touchedPoint; pendingTapPointerId = event.pointerId; drawing = false; drawingPointerId = null; previousPoint = null; return; }
  if (tool === 'select') {
    lineStart = touchedPoint;
    const inside = selection && touchedPoint.x >= selection.x && touchedPoint.x < selection.x + selection.width && touchedPoint.y >= selection.y && touchedPoint.y < selection.y + selection.height;
    selectionDrag = { mode: inside ? 'move' : 'select', origin: touchedPoint, bounds: selection && { ...selection }, pixels: inside ? [...documentData.pixels] : null };
    if (inside) strokeTracker = beginDrawStroke(documentData, { trusted: true });
    else { selection = selectionBounds(touchedPoint, touchedPoint, documentData.width, documentData.height); placeSelection(); }
    return;
  }
  strokeTracker = beginDrawStroke(documentData, { trusted: true });
  if (SHAPE_TOOLS.has(tool)) { lineStart = touchedPoint; const changed = markShape(lineStart, touchedPoint); saved = false; paint(changed); }
  else { const changed = tool === 'spray' ? markSpray(previousPoint, previousPoint) : markSegment(previousPoint, previousPoint, selectedPixelValue()); saved = false; paint(changed); }
});
function applyDrawPoint(point) {
  if (!drawing || !previousPoint || tool === 'fill' || tool === 'picker') return;
  if (point.x === previousPoint.x && point.y === previousPoint.y) return;
  if (tool === 'select') { updateSelection(point); previousPoint = point; return; }
  if (SHAPE_TOOLS.has(tool)) {
    cancelDrawStroke(documentData, strokeTracker); strokeTracker = beginDrawStroke(documentData, { trusted: true });
    markShape(lineStart, point); previousPoint = point; saved = false; paint(); return;
  }
  const changed = tool === 'spray' ? markSpray(previousPoint, point) : markSegment(previousPoint, point, selectedPixelValue());
  previousPoint = point; saved = false; paint(changed);
}
function applyPointerMoveSamples(event) {
  if (!drawing || event.pointerId !== drawingPointerId) return;
  const coalescedTool = tool === 'pen' || tool === 'eraser' || tool === 'spray';
  if (coalescedTool && typeof event.getCoalescedEvents === 'function') {
    let samples = [];
    try { samples = event.getCoalescedEvents() || []; } catch { samples = []; }
    for (const sample of samples) applyDrawPoint(pointFromEvent(sample));
  }
  // The dispatched event carries the latest point even on engines whose coalesced list omits it.
  applyDrawPoint(pointFromEvent(event));
}
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
  if (drawing && event.pointerId !== drawingPointerId) return;
  showCursor(event);
  const mousePrimaryReleased = drawing && event.pointerId === drawingPointerId
    && event.pointerType === 'mouse' && typeof event.buttons === 'number' && (event.buttons & 1) === 0;
  applyPointerMoveSamples(event);
  if (mousePrimaryReleased && drawing && event.pointerId === drawingPointerId) {
    if (event.buttons === 0) activePointers.delete(event.pointerId);
    endStroke(false);
  }
});
function endStroke(cancel = false) {
  if (drawing && strokeTracker) {
    if (cancel) { cancelDrawStroke(documentData, strokeTracker); saved = strokeWasSaved; }
    else if (commitDrawStroke(documentData, history, strokeTracker)) saved = false;
    strokeTracker = null; strokeStartPixels = null; paint();
  }
  if (cancel && selectionDrag) selection = selectionDrag.bounds;
  const selected = drawing && tool === 'select' && selectionDrag?.mode === 'select' && !cancel;
  drawing = false; drawingPointerId = null; previousPoint = null; lineStart = null; selectionDrag = null; placeSelection();
  if (selected && selection) toast('枠の内側をドラッグして移動します。外側で選び直せます。');
}
function applyTap(point) {
  if (tool === 'picker') { pickColorAt(point); return; }
  commitChange((next) => symmetryPoints(point, next.width, next.height, symmetry).flatMap(p => [...floodFill(next, p.x, p.y, selectedPixelValue())]));
}
function releasePointer(event) {
  const ownsMouseStroke = drawing && event.pointerType === 'mouse' && event.pointerId === drawingPointerId;
  if (event.type === 'lostpointercapture' && ownsMouseStroke && activePointers.has(event.pointerId)) {
    // A mouse capture loss ends the gesture at its last accepted sample. Do not draw the
    // capture-loss event's coordinates, which may be outside the canvas or stale.
    activePointers.delete(event.pointerId);
    endStroke(false);
    return;
  }
  if (event.type === 'pointerup' && drawing && event.pointerId === drawingPointerId && activePointers.has(event.pointerId)) {
    applyDrawPoint(pointFromEvent(event));
  }
  const wasActive = activePointers.delete(event.pointerId);
  // A late lostpointercapture or a non-owning pointer must not finish a newer gesture.
  if (!wasActive) return;
  if (panDrag) { if (!activePointers.size) { panDrag = null; canvas.classList.remove('is-panning'); } return; }
  if (pendingTap && event.pointerId === pendingTapPointerId) {
    const tap = pendingTap; pendingTap = null; pendingTapPointerId = null;
    if (event.type === 'pointerup' && !pinchStart && activePointers.size === 0) applyTap(tap);
    return;
  }
  if (!activePointers.size) { pendingTap = null; pendingTapPointerId = null; }
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
    drawing = false; drawingPointerId = null; previousPoint = null; strokeStartPixels = null; return;
  }
  if (drawing && event.pointerId !== drawingPointerId) return;
  endStroke(event.type !== 'pointerup');
}
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);
scope.listen(document, 'pointerup', (event) => { if (event.pointerType === 'mouse') releasePointer(event); });

[16, 32, 64, 128, 256].forEach((size) => { const option = document.createElement('option'); option.value = String(size); option.textContent = `${size}px`; sizeSelect.append(option); });
sizeSelect.value = String(DRAW_SIZE);
function resizeCanvas(width, height) {
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= 256)) {
    status.textContent = '幅と高さは1〜256pxの整数で指定してください。'; return false;
  }
  if (width === documentData.width && height === documentData.height) { syncSizeButtons(true); return true; }
  try {
    const next = resizeDrawRectangle(documentData, width, height);
    if (!canEdit(next)) return false;
    endStroke(); closeColorEditor(); sizeWasChosen = true;
    installAnimationDocument(animationSession.apply(resizeAnimation(animationSession.animation, width, height, { resample: 'nearest' })));
    syncSizeButtons(true); pxdBridge?.markDirty(); status.textContent = `${width}×${height}にしました`; return true;
  } catch (error) { status.textContent = `サイズを変更できませんでした：${error.message}`; return false; }
}
sizeSelect.addEventListener('change', () => {
  const size = Number(sizeSelect.value), factor = size / Math.max(documentData.width, documentData.height);
  if (!resizeCanvas(Math.max(1, Math.round(documentData.width * factor)), Math.max(1, Math.round(documentData.height * factor)))) sizeSelect.value = String(Math.max(documentData.width, documentData.height));
});
renderPalette();
document.querySelectorAll('[data-draw-tool]').forEach((button) => button.addEventListener('click', () => {
  const next = button.dataset.drawTool;
  setTool(next === 'pen' && tool === 'pen' ? 'eraser' : next);
  const chooser = $('#draw-tool-picker'); if (chooser?.contains(button)) { chooser.open = false; $('#draw-tool-summary')?.focus({ preventScroll: true }); toast(`${TOOL_NAMES[next]}を選びました`); }
}));
$('#draw-tool-picker')?.addEventListener('toggle', placeToolMenu);
// Native toggle is queued; prepare the fixed panel before the opening frame.
$('#draw-tool-summary')?.addEventListener('click', placeToolMenu);
scope.listen(window, 'resize', placeToolMenu);
// ---- drawing settings ----
symmetryButtons.forEach(button => button.addEventListener('click', () => {
  if (tool === 'select') return;
  const key = button.dataset.symmetry; symmetry[key] = !symmetry[key];
  syncDrawingSettings(); placeOverlays(); hideCursors(); pxdBridge?.markDirty();
  toast(`${SYMMETRY_NAMES[key]}を${symmetry[key] ? '使います' : '解除しました'}`);
}));
gridButton?.addEventListener('click', () => {
  showGrid = !showGrid; try { localStorage.setItem('pixieed:draw:grid', showGrid ? 'on' : 'off'); } catch { /* private mode */ }
  syncDrawingSettings();
});
onionButton?.addEventListener('click', () => handleAnimationAction({ type: 'onion', enabled: !onion }));
function placeSettingsPanel() {
  const panel = $('.draw-settings-panel'), summary = settingsSummary, controls = $('.draw-controls');
  if (!panel || !summary || !controls) return;
  const r = summary.getBoundingClientRect(), header = document.querySelector('body > .site-header')?.getBoundingClientRect().bottom || 64;
  const navigationTop = document.querySelector('.app-tabs')?.getBoundingClientRect().top || innerHeight;
  const width = Math.min(260, innerWidth - 24), bounds = controls.getBoundingClientRect();
  const actionsBottom = $('.draw-actions')?.getBoundingClientRect().bottom || r.bottom;
  const belowAnchor = Math.max(r.bottom, actionsBottom);
  const above = Math.max(44, r.top - header - 20), below = Math.max(0, navigationTop - belowAnchor - 20);
  const openBelow = below > above;
  panel.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, bounds.left + (bounds.width - width) / 2))}px`;
  panel.style.bottom = openBelow ? 'auto' : `${Math.max(12, innerHeight - r.top + 8)}px`;
  panel.style.top = openBelow ? `${belowAnchor + 8}px` : 'auto';
  panel.style.maxHeight = `${Math.min(440, openBelow ? below : above)}px`;
}
settingsPicker?.addEventListener('toggle', placeSettingsPanel);
settingsSummary?.addEventListener('click', placeSettingsPanel);
scope.listen(window, 'resize', placeSettingsPanel);
// Keyboard activation of the animation workspace does not produce the outside-pointer event.
scope.listen($('#draw-animation-controls'), 'click', (event) => {
  if (!event.target.closest?.('[data-action="toggle-frames"]') || !settingsPicker?.open) return;
  settingsPicker.open = false;
});
syncDrawingSettings(); setTool(tool);
// Canvas settings keep the current picture until a valid size is applied.
const sizeButtons = [...document.querySelectorAll('[data-draw-size]')];
const widthInput = $('#draw-canvas-width'), heightInput = $('#draw-canvas-height'), ratioInput = $('#draw-canvas-ratio');
const sizeForm = $('#draw-canvas-form'), sizeApply = $('#draw-canvas-apply');
const canvasPicker = $('.draw-import'); let sizeInputDimensions = '';
const canvasSettingsPanel = mountDrawCanvasPanel({ scope, picker: canvasPicker, summary: canvasPicker.querySelector('summary'), panel: $('.draw-canvas-panel') });
function syncSizeButtons(resetInputs = false) {
  const width = readOnlyImage?.width ?? documentData.width, height = readOnlyImage?.height ?? documentData.height;
  for (const button of sizeButtons) { button.setAttribute('aria-checked', String(Number(button.dataset.drawSize) === Math.max(width, height))); button.disabled = Boolean(readOnlyImage); }
  const chip = $('#draw-size-chip'); if (chip) chip.textContent = String(Math.max(width, height));
  const dimensions = `${width}×${height}`; $('#draw-canvas-dimensions').textContent = `${dimensions} px`;
  if (resetInputs || sizeInputDimensions !== dimensions) {
    widthInput.value = String(width); heightInput.value = String(height); sizeInputDimensions = dimensions;
  }
  widthInput.disabled = heightInput.disabled = ratioInput.disabled = Boolean(readOnlyImage);
  sizeApply.disabled = Boolean(readOnlyImage);
}
function syncDimensionRatio(event) {
  if (!ratioInput.checked) return;
  const sourceInput = event.target, counterpart = sourceInput === widthInput ? heightInput : widthInput;
  const value = Number(sourceInput.value); if (!sourceInput.value || !Number.isInteger(value) || value < 1 || value > 256) return;
  const ratio = sourceInput === widthInput ? documentData.height / documentData.width : documentData.width / documentData.height;
  let other = Math.max(1, Math.round(value * ratio));
  if (other > 256) { other = 256; sourceInput.value = String(Math.max(1, Math.round(other / ratio))); }
  counterpart.value = String(other);
}
scope.listen(widthInput, 'input', syncDimensionRatio); scope.listen(heightInput, 'input', syncDimensionRatio);
scope.listen(ratioInput, 'change', () => { if (ratioInput.checked) syncDimensionRatio({ target: widthInput }); });
scope.listen(sizeForm, 'submit', event => {
  event.preventDefault(); if (!sizeForm.reportValidity()) return;
  resizeCanvas(Number(widthInput.value), Number(heightInput.value)); canvasSettingsPanel.position();
});
scope.listen(canvasPicker, 'toggle', () => { if (canvasPicker.open) syncSizeButtons(true); });
for (const button of sizeButtons) scope.listen(button, 'click', () => {
  sizeSelect.value = button.dataset.drawSize; sizeSelect.dispatchEvent(new Event('change')); canvasSettingsPanel.position();
});
syncSizeButtons(true);
function afterHistoryStep() {
  saved = false; const step = history.lastStep;
  if (step?.paletteChanged) { renderPalette(); showCurrentColor(); paint(); } else paint(step?.indices || null);
}
function undo() { if (drawing || !canEdit()) return false; closeColorEditor(); const doc = animationSession.undo(); if (!doc) return false; installAnimationDocument(doc); pxdBridge?.markDirty(); return true; }
function redo() { if (drawing || !canEdit()) return false; closeColorEditor(); const doc = animationSession.redo(); if (!doc) return false; installAnimationDocument(doc); pxdBridge?.markDirty(); return true; }
// a tap steps once; holding the button keeps stepping
for (const [id, step] of [['#draw-undo', undo], ['#draw-redo', redo]]) {
  const button = $(id); let timer = 0; let repeated = false;
  const stop = () => { clearTimeout(timer); timer = 0; };
  button.addEventListener('pointerdown', () => { repeated = false; stop(); timer = setTimeout(function again() { repeated = true; if (step()) timer = setTimeout(again, 90); }, 420); });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, stop);
  button.addEventListener('click', () => { if (repeated) { repeated = false; return; } step(); });
}
scope.listen(window, 'keydown', (event) => {
  if (document.body.hasAttribute('data-tool-result-open')) return;
  if (event.target.closest?.('input, select, textarea')) return;
  const key = event.key.toLowerCase(); const mod = event.metaKey || event.ctrlKey;
  if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
  if (mod && key === 'y') { event.preventDefault(); redo(); return; }
  if (mod) return;
  if (key === 'escape') { if (drawing) endStroke(true); clearSelection(); return; }
  if (key === 'enter' && tool === 'select' && event.target === canvas) { clearSelection(); return; }
  if (key === ' ') { if (!spaceHeld && document.activeElement === canvas) event.preventDefault(); spaceHeld = true; canvas.classList.add('is-grab'); return; }
  const tools = { b: 'pen', p: 'pen', e: 'eraser', g: 'fill', l: 'line', i: 'picker', r: event.shiftKey ? 'rectangle-fill' : 'rectangle', o: event.shiftKey ? 'ellipse-fill' : 'ellipse', a: 'spray', v: 'select' };
  if (tools[key]) { setTool(tools[key]); return; }
  if (key === 'm') { $('#draw-mirror')?.click(); return; }
  if (key === '0') { resetView(); return; }
  if (key === '+' || key === '=') { const r = canvas.getBoundingClientRect(); zoomAt(zoom * 1.5, r.left + r.width / 2, r.top + r.height / 2); return; }
  if (key === '-') { const r = canvas.getBoundingClientRect(); zoomAt(zoom / 1.5, r.left + r.width / 2, r.top + r.height / 2); }
});
scope.listen(window, 'keyup', (event) => { if (event.key === ' ') { spaceHeld = false; canvas.classList.remove('is-grab'); } });
// wheel / trackpad pinch zooms about the cursor
$('.draw-board').addEventListener('wheel', (event) => {
  event.preventDefault();
  const factor = wheelZoomFactor(event.deltaY, event.deltaMode, $('.draw-board').clientHeight);
  zoomAt(zoom * factor, event.clientX, event.clientY);
}, { passive: false });
// the zoom chip puts the whole picture back
$('#draw-zoom-label').addEventListener('click', resetView); $('#draw-zoom-label').title = '全体を表示';
canvas.addEventListener('dblclick', (event) => { if (tool === 'picker' || tool === 'fill') return; event.preventDefault(); });
$('#draw-clear').addEventListener('click', () => commitChange((next) => { next.pixels.fill(-1); return null; }));
async function saveRevision() {
  if (scope.disposed) return null;
  if (!store && !pxdBridge?.currentProject && !pxdBridge?.heldProject) return;
  if (readOnlyImage) { await pxdBridge?.save(); if (!scope.disposed) status.textContent = '原本をそのままプロジェクトに保存しました。'; return null; }
  closeColorEditor(); editorUi.closePanels();
  endStroke(); const snapshot = structuredClone(composeAnimationFrame(animationSession.animation, animationSession.frameId));
  const sourceDocument = documentData; const sourceProjectId = pxdBridge?.currentProject?.projectId;
  saveButton.disabled = true; globeButton.disabled = true; status.textContent = '保存しています…';
  let projectSaved = false;
  try {
    // PXD is the authoritative project. A legacy draft below is a handoff copy only.
    await pxdBridge?.save();
    if (scope.disposed) return null;
    projectSaved = Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject);
  } catch (error) {
    if (scope.disposed) return null;
    status.textContent = `プロジェクトを保存できませんでした：${error.message || '保存先を確認してください。'}`;
    saveButton.disabled = false; globeButton.disabled = false;
    return null;
  }
  if (!store) {
    if (scope.disposed) return null;
    saved = projectSaved;
    status.textContent = projectSaved ? 'プロジェクトを保存しました。端末の再開用コピーは利用できません。' : '端末内保存を使えません。';
    saveButton.disabled = false; globeButton.disabled = false;
    return projectSaved ? { document: snapshot, projectSaved: true } : null;
  }
  try {
    const draftId = activeDraftId || crypto.randomUUID();
    // Save only on top of the version this edit started from; another tab's save stops it (the edit stays on screen).
    const revision = await store.save({ draftId, kind: 'pixel_art', document: snapshot, source: structuredClone(source), expectedRevisionId: activeDraftId ? baseRevisionId : null });
    if (scope.disposed) return revision;
    if (sourceDocument !== documentData || sourceProjectId !== pxdBridge?.currentProject?.projectId) return revision;
    activeDraftId = draftId; baseRevisionId = revision.revisionId; saved = true;
    if (!setLastDraftId(draftId)) { status.textContent = '作品をこのブラウザーに保存しました。作品一覧から開いてください。'; }
    else status.textContent = '作品をこのブラウザーに保存しました。';
    resumeButton.hidden = false; $('#draw-copy-last').hidden = false;
    return revision;
  } catch (error) {
    if (scope.disposed) return null;
    if (projectSaved) {
      saved = true;
      status.textContent = `作品は保存しました。復元用のコピーを保存できませんでした：${error.message || '端末の空き容量を確認してください。'}`;
      return { document: snapshot, projectSaved: true };
    }
    status.textContent = `保存できませんでした：${error.message || '端末の空き容量を確認してください。'}`;
    return null;
  }
  finally { if (!scope.disposed) { saveButton.disabled = false; globeButton.disabled = false; } }
}
saveButton.addEventListener('click', () => saveRevision());
globeButton.addEventListener('click', async () => {
  try {
    await pxdBridge?.assertCanSave();
    if (scope.disposed) return;
    validateDrawPixels(documentData);
    globeButton.disabled = true;
    const revision = await saveRevision();
    if (scope.disposed) return;
    if (!revision) return;
    if (!revision.revisionId) {
      status.textContent = 'プロジェクトは保存しました。地球儀へ送るコピーを作成できませんでした。';
      return;
    }
    globeButton.disabled = true;
    const png = await encodeDrawPng(revision.document);
    if (scope.disposed) return;
    const serialized = await serializeDrawHandoff(png, revision.revisionId);
    if (scope.disposed) return;
    sessionStorage.setItem(DRAW_HANDOFF_KEY, serialized);
    location.assign('/globe/?from=draw');
  } catch (error) { if (!scope.disposed) status.textContent = `地球儀へ送れませんでした：${error.message}`; }
  finally { if (!scope.disposed) globeButton.disabled = false; }
});
async function loadLastDraft({ copy = false } = {}) {
  if (scope.disposed) return;
  if (pxdBridge?.beforeReplace && !loadingLegacy) {
    await pxdBridge.beforeReplace(async () => { loadingLegacy = true; try { await loadLastDraft({ copy: true }); } finally { loadingLegacy = false; } }); return;
  }
  const draftId = getLastDraftId(); if (!draftId || !store) return;
  const ticket = loadGate.begin();
  resumeButton.disabled = true; $('#draw-copy-last').disabled = true; status.textContent = copy ? '複製しています…' : '前回の絵を開いています…';
  try {
    const revision = await store.load(draftId); if (!revision) throw new Error('保存した絵が見つかりません。');
    if (scope.disposed || !loadGate.isCurrent(ticket)) return;
    validateDrawDocument(revision.document);
    pxdBridge?.reset(); pxdImageRole = 'main';
    const nextSource = copy ? { type: 'local_draft_copy', assetId: revision.asset.assetId, revisionId: revision.revisionId, sourceDraftId: draftId, parentSource: revision.asset.source } : revision.asset.source;
    documentData = structuredClone(revision.document); source = nextSource; activeDraftId = copy ? null : draftId; baseRevisionId = copy ? null : revision.revisionId; history = recordedHistory(createDrawHistory(documentData)); saved = !copy;
    renderPalette(); sizeSelect.value = String(documentData.width); setCanvasDimensions(); paint();
    status.textContent = `${copy ? '複製しました' : 'ひらきました'}${fitNotice ? ` ${fitNotice}` : ''}`;
  } catch (error) { if (!scope.disposed) status.textContent = `${copy ? '複製できませんでした' : '開けませんでした'}：${error.message}`; }
  finally { if (!scope.disposed) { resumeButton.disabled = false; $('#draw-copy-last').disabled = false; } }
}
resumeButton.addEventListener('click', () => loadLastDraft());
$('#draw-copy-last').addEventListener('click', () => loadLastDraft({ copy: true }));

async function importImage(file, importSource) {
  if (scope.disposed) return;
  if (pxdBridge?.beforeReplace && !loadingLegacy) {
    await pxdBridge.beforeReplace(async () => { loadingLegacy = true; try { await importImage(file, importSource); } finally { loadingLegacy = false; } }); return;
  }
  const ticket = loadGate.begin();
  $('#draw-import-local').disabled = true; status.textContent = '画像を読み込んでいます…';
  try {
    const image = await decodeDrawImageFile(file);
    if (scope.disposed || !loadGate.isCurrent(ticket)) return; // a newer open or import has replaced this one
    const original = { width: image.width, height: image.height, rgba: new Uint8Array(image.data) };
    const prepared = prepareSharedCanvasImage(original, { passActive: true });
    const next = imageToDrawDocument(prepared.image);
    if (prepared.changed && !await confirmPxdConversion({ image: original, document: next, title: '読み込む絵を確認', applyLabel: 'この絵を使う', message: `${next.width}×${next.height}px・${prepared.colorCount}色に合わせます。元の画像ファイルは変更しません。` })) return;
    if (scope.disposed || !loadGate.isCurrent(ticket)) return;
    replaceDocument(next, importSource); fitNotice = '';
    status.textContent = `${scaleNotice(image)}${next.width}×${next.height}・${prepared.colorCount}色で読み込みました`;
  } catch (error) { if (!scope.disposed) status.textContent = `画像を複製できませんでした：${error.message}`; }
  finally { if (!scope.disposed) { $('#draw-import-local').disabled = false; $('#draw-import-file').value = ''; } }
}
$('#draw-import-local').addEventListener('click', () => $('#draw-import-file').click());
$('#draw-import-file').addEventListener('change', () => { const file = $('#draw-import-file').files?.[0]; if (file) importImage(file, { type: 'local_image_copy', assetId: null, revisionId: null }); });
if (getLastDraftId()) { resumeButton.hidden = false; $('#draw-copy-last').hidden = false; }
// Pictures from the other tools come in as a new version of this tool's own picture, then open.
const shelfContainer = $('#draw-shelf');
const pictureShelf = store ? mountPictureShelf(shelfContainer, { tool: 'draw', adapter: drawAdapter, onBrought: async ({ from }) => { await loadLastDraft(); if (!scope.disposed) status.textContent = `${from.label}の絵を持ってきました`; }, onError: (error) => { if (!scope.disposed) status.textContent = `持ってこられませんでした：${error.message}`; } }) : null;
scope.add(() => { pictureShelf?.dispose?.(); shelfContainer?.replaceChildren(); });
paint();

$('#draw-output [data-output-project]')?.addEventListener('click', () => {
  closeColorEditor(); editorUi.closePanels();
  void pxdBridge?.showProjects();
});

// ---- saving: the picture leaves PiXiEED enlarged (crisp dots, about 2048px), on phones via the share sheet ----
$('#draw-export').addEventListener('click', async () => {
  endStroke(); closeColorEditor(); stopAnimation(); paint(); editorUi.closePanels();
  const original = documentData; const originalSource = source;
  const bridge = pxdBridge; const project = bridge?.currentProject; const held = bridge?.heldProject;
  const unchangedSource = () => !scope.disposed && documentData === original && source === originalSource && pxdBridge === bridge
    && bridge?.currentProject === project && bridge?.heldProject === held;
  const image = readOnlyImage ? { width: readOnlyImage.width, height: readOnlyImage.height, data: new Uint8Array(readOnlyImage.rgba) } : { width: original.width, height: original.height, data: documentRgba(composeAnimationFrame(animationSession.animation, animationSession.frameId)) };
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
// ---- time-lapse: export a bounded replay at regular or detailed quality ----
function recordedHistory(target) {
  timelapse.reset(documentData);
  return new Proxy(target, { get(object, key) {
    const value = Reflect.get(object, key, object);
    if (key === 'commit' || key === 'commitPatch') return (...args) => {
      const beforePixels = documentData.pixels; const beforePalette = documentData.palette;
      const done = value.apply(object, args);
      if (done) {
        animationSession.commitDocument(documentData); animationControls?.refresh();
        pxdBridge?.markDirty();
        const paletteChanged = beforePalette !== documentData.palette;
        const indices = [];
        if (key === 'commitPatch') indices.push(...object.lastStep.indices);
        else if (!paletteChanged) for (let index = 0; index < beforePixels.length; index += 1) if (beforePixels[index] !== documentData.pixels[index]) indices.push(index);
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
  return !scope.disposed && activeTimelapseJob === job && !job.controller.signal.aborted
    && documentData === job.document
    && source === job.source
    && pxdBridge === job.bridge
    && job.bridge?.currentProject === job.currentProject
    && job.bridge?.heldProject === job.heldProject;
}
scope.listen(window, 'pagehide', () => activeTimelapseJob?.controller.abort());
async function exportTimelapse(detail) {
  if (scope.disposed) return;
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
$('#draw-animation-export')?.addEventListener('click', () => exportAnimation());
let animationExporting = false, animationExportController = null;
async function exportAnimation() {
  if (animationExporting || readOnlyImage || scope.disposed) return;
  endStroke(); closeColorEditor(); stopAnimation(); editorUi.closePanels();
  const timeline = animationSession.animation; animationExporting = true;
  animationExportController = new AbortController(); const controller = animationExportController;
  try {
    await pxdBridge?.assertCanSave?.();
    const frames = [];
    for (const frame of timeline.frames) {
      if (scope.disposed || controller.signal.aborted) return;
      const doc = composeAnimationFrame(timeline, frame.id);
      frames.push({ width: doc.width, height: doc.height, data: documentRgba(doc), delayMs: Math.max(20, frame.durationMs) });
    }
    const result = await encodeAnimatedGif(frames, { longEdge: 1024, maxPixels: 80e6, maxInputPixels: 128 * 256 * 256, signal: controller.signal });
    if (scope.disposed || controller.signal.aborted) return;
    await saveFile(new Blob([result.bytes], { type: 'image/gif' }), `pixieed-animation-${result.width}x${result.height}.gif`);
    toast(`${frames.length}コマのアニメーションを保存しました。`);
  } catch (error) { if (!scope.disposed && error.name !== 'AbortError') toast(`GIFを書き出せませんでした：${error.message}`); }
  finally { if (animationExportController === controller) animationExportController = null; animationExporting = false; }
}
$('#draw-timelapse-detail').addEventListener('click', () => exportTimelapse(true));

pxdBridge = mountWorkspace({
  tool: 'draw',
  projectWorkspace: true,
  getEditorState: () => ({ selectedColor, selectedHex: selectedColor < 0 ? null : documentData.palette[selectedColor], brushColors: [...documentData.palette], tool, zoom, panX, panY, mirror: symmetry.horizontal, symmetry: { ...symmetry }, showGrid, imageRole: pxdImageRole, frameId: animationSession.frameId, layerId: animationSession.layerId, onion }),
  restoreEditorState(state) {
    if (state?.imageRole && state.imageRole !== pxdImageRole) state = {};
    if (!readOnlyImage) {
      documentData = animationSession.select(state?.frameId, state?.layerId);
      history = recordedHistory(createDrawHistory(documentData)); onion = state?.onion === true;
    }
    selectedColor = Number.isInteger(state?.selectedColor) && state.selectedColor >= -1 && state.selectedColor < documentData.palette.length ? state.selectedColor : Math.min(2, documentData.palette.length - 1);
    if (state?.selectedHex && documentData.palette.includes(state.selectedHex)) selectedColor = documentData.palette.indexOf(state.selectedHex);
    setTool(Object.hasOwn(TOOL_NAMES, state?.tool) ? state.tool : 'pen');
    zoom = Number.isFinite(state?.zoom) ? Math.max(1, Math.min(ZOOM_MAX, state.zoom)) : 1;
    panX = Number.isFinite(state?.panX) ? state.panX : 0; panY = Number.isFinite(state?.panY) ? state.panY : 0;
    symmetry = Object.fromEntries(Object.keys(SYMMETRY_NAMES).map(key => [key, state?.symmetry ? state.symmetry[key] === true : key === 'horizontal' && state?.mirror === true]));
    if (typeof state?.showGrid === 'boolean') showGrid = state.showGrid;
    renderPalette(); paint(); updateCanvasView(); syncDrawingSettings(); animationControls?.refresh();
  },
  hasContent: () => Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject || activeDraftId || documentData.pixels.some((pixel) => pixel >= 0)),
  setStatus: (message) => { status.textContent = message; },
  async openProject(project) {
    if (scope.disposed) return;
    const params = new URLSearchParams(location.search); const requestedRole = params.get('pxd') === project.projectId && params.getAll('pxdImage').length === 1 ? params.get('pxdImage') : null;
    if (!project.entries.length) { pxdImageRole = 'main'; replaceDocument(createDrawDocument(), { type: 'hand_drawn', assetId: null, revisionId: null }, { fromPxd: true }); return; }
    const roles = pxdImageRoles(project);
    const rememberedRole = project.manifest.editorState?.draw?.imageRole;
    let role = requestedRole || (roles.includes(rememberedRole) ? rememberedRole : roles.includes('main') ? 'main' : roles.includes('draw') ? 'draw' : roles[0]);
    // Validate the timeline before replacing the working document. Unknown versions fail closed.
    const storedAnimation = await readPxdAnimation(project, role || 'main');
    if (scope.disposed) return;
    let nextDocument;
    {
      try {
        // An empty poster can have a transparent-only palette. The validated
        // timeline owns its palette and cels, so restore from it directly.
        nextDocument = storedAnimation ? composeAnimationFrame(storedAnimation, storedAnimation.frames[0].id) : await readPxdDrawDocument(project, role);
        if (nextDocument && !storedAnimation) createDrawAnimationSession(nextDocument);
        if (scope.disposed) return;
      }
      catch (error) {
        if (scope.disposed) return;
        const image = await readPxdImage(project, role);
        if (scope.disposed) return;
        if (!image || !(error instanceof RangeError)) throw error;
        readOnlyImage = image; pxdImageRole = role || 'main'; saved = true; paint();
        status.textContent = '原本をそのまま表示しています。画像として保存できます。サイズ・色数が対応範囲を超えるため、編集はしていません。'; return;
      }
    }
    if (!nextDocument) throw new Error('このPXDには描画できる画像部品がありません。別のPXDや保存版を選んでください。');
    validateDrawDocument(nextDocument);
    pxdImageRole = role || 'main';
    replaceDocument(structuredClone(nextDocument), { type: 'pxd_project_copy', assetId: null, revisionId: null, projectId: project.projectId, imageRole: pxdImageRole }, { fromPxd: true });
    if (storedAnimation) installAnimationDocument(animationSession.load(storedAnimation));
    saved = true; paint();
  },
  async getProject(project) {
    if (scope.disposed) return project;
    if (readOnlyImage) return project;
    endStroke(); const timeline = colorEdit ? setAnimationPalette(animationSession.animation, documentData.palette) : animationSession.animation;
    const snapshot = composeAnimationFrame(timeline, timeline.frames[0].id); const role = pxdImageRole;
    let next = project || createPxdProject();
    next = await writePxdDrawDocument(next, snapshot, role);
    next = await writePxdAnimation(next, timeline, { role, posterFrameId: timeline.frames[0].id });
    return next;
  }
});
let modeDisposed = false;
function disposeDrawMode() {
  if (modeDisposed) return;
  modeDisposed = true;
  loadGate.begin();
  activeTimelapseJob?.controller.abort();
  animationExportController?.abort();
  clearToastTimer();
  stopAnimation(); animationControls?.dispose(); if (drawing) endStroke(); clearSelection();
  activePointers.clear(); pendingTap = null; pendingTapPointerId = null; drawingPointerId = null; pinchStart = null; panDrag = null; fingerTap = null;
  strokeStartPixels = null; drawing = false; previousPoint = null;
  canvas.classList.remove('is-grab', 'is-panning');
  closeColorEditor();
  editorUi.dispose?.();
  resultView.dispose?.();
  interactionEffects.clear();
}
function clearToastTimer() { clearTimeout(toastTimer); }
scope.add(disposeDrawMode);
await pxdBridge.ready;
return { workspace: pxdBridge, dispose: disposeDrawMode };
}
