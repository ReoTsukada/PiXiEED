import { readPxdAudioLink } from './pxd-audio-link.mjs?rev=20261006-draw-startup-1';
import { mountToolHeaderControls } from '../tool-header-controls.mjs?rev=20261006-header-controls-1';
import { scaleNotice } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';
import { createLatestGate } from './pixel-contract.mjs?rev=20260928-data-contract-1';
import { mountPictureShelf } from './picture-shelf.mjs?rev=20260928-picture-shelf-1';
import { createLocalDraftStore, createIndexedDbDraftAdapter } from './local-drafts.mjs';
import { createDrawDocument, createDrawHistory, DRAW_PALETTE, DRAW_PALETTE_ORDER, DRAW_SIZE, documentRgba, beginDrawStroke, commitDrawStroke, cancelDrawStroke, floodFill, strokePixels, validateDrawDocument } from './draw-core.mjs?rev=20261006-draw-startup-1';
import { createDrawAnimationSession } from './draw-animation-session.mjs?rev=20261007-draw-handoff-1';
import { addAnimationFrame, removeAnimationFrame, moveAnimationFrame, addAnimationLayer, removeAnimationLayer, moveAnimationLayer, setLayerProperties, setAnimationFrameDuration, setAnimationPalette, composeAnimationFrame, resizeAnimation, canvasResizeOffset, getAnimationUsedColorIndices, hasAnimationCelContent } from './animation-core.mjs';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs';
import { mountAnimationControls } from './animation-controls.mjs?rev=20261009-fps-1';
import { rawPixelCellAt } from './pixel-input.mjs?rev=20261001-connected-editor-1';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs';
import { DRAW_HANDOFF_KEY, encodeDrawPng, serializeDrawHandoff, validateDrawPixels } from './draw-handoff.mjs';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { createPxdProject, encodePxd, decodePxd } from './pxd-codec.mjs';
import { mountProjectWorkspace as mountPxdTools } from './project-workspace.mjs?rev=20261007-draw-handoff-1';
import { pxdImageRoles, readPxdImage, imageToDrawDocument, readPxdDrawDocument, putPxdDrawDocument } from './pxd-project.mjs?rev=20261001-free-tools-1';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20261001-free-tools-1';
import { prepareSharedCanvasImage } from './shared-image.mjs?rev=20261001-free-tools-1';
import { enlargedPng, saveFile } from '../pixel-export.mjs?rev=20260928-pixel-roundtrip-1';
import { createDrawTimelapse, selectDrawTimelapseFrames } from './draw-timelapse.mjs?rev=20261007-draw-handoff-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20261002-tool-transfer-1';
import { mountCreationEditorUi } from './editor-ui.mjs?rev=20261006-header-controls-1';
import { wheelZoomFactor } from './viewport-wheel.mjs';
import { applyDrawingToolIcons, createDrawingToolIcon } from './drawing-tool-icons.mjs?rev=20261004-canvas-settings-1';
import { drawShapePixels, sprayPixels, selectionBounds, moveSelectionPixels } from './draw-tool-operations.mjs?rev=20261006-draw-startup-1';
import { createToolStartTracker } from '../site-analytics.mjs';
import { sendToolOutputAfterSaving } from './output-handoff.mjs?rev=20261009-output-12';

import { symmetryTransforms, symmetryPoint, symmetryPoints } from './drawing-symmetry.mjs';
import { mountDrawPanelDismissals } from './draw-panel-dismissals.mjs?rev=20261006-floating-mouse-2';
import { mountDrawCanvasPanel } from './draw-canvas-panel.mjs?rev=20261006-draw-panel-dismiss-1';
import { mountColorPanel } from './color-panel.mjs?rev=20261006-panel-close-1';
import { mountDrawViewportOverlays } from './draw-viewport-overlays.mjs';
import { mountDrawVirtualCursor } from './draw-virtual-cursor.mjs?rev=20261006-floating-mouse-2';
import { DRAW_INPUT_SETTINGS_KEY, normalizeDrawInputSettings, serializeDrawInputSettings, readDrawInputSettings } from './draw-input-settings.mjs?rev=20261007-color-selection-1';
import { mountDrawAssignmentInput } from './draw-assignment-input.mjs?rev=20261006-header-controls-1';
import { DRAW_SHORTCUT_COMMANDS, mountDrawShortcuts } from './draw-shortcuts.mjs?rev=20261006-draw-startup-1';
import { captureDrawSelection, clearDrawSelection, createDrawSelectionClipboard, drawSelectionMask, drawSelectionMaskBounds, selectDrawColorMask } from './draw-selection-operations.mjs?rev=20261007-color-selection-1';
import { createDrawSelectionTransform } from './draw-selection-session.mjs?rev=20261006-selection-fix-1';
import { mountDrawSelectionPanel } from './draw-selection-panel.mjs?rev=20261007-color-selection-1';
import { selectionDefaultPivot, selectionContains, snapSelectionAngle, transformSelectionFromCorner, unwrapSelectionBearing, translateSelectionFrame } from './draw-selection-geometry.mjs?rev=20261006-selection-fix-1';
import { mountDrawSelectionOverlay } from './draw-selection-overlay.mjs?rev=20261007-color-selection-1';

export async function mountDrawMode({ scope, mountWorkspace = mountPxdTools } = {}) {
if (!scope) throw new TypeError('Draw mode requires a lifecycle scope');
let handoffApi = null, returnedCamera = null, initialCameraProject = null, cameraNavigationResume = null;
const handoffParams = new URLSearchParams(location.search);
if (handoffParams.has('drawCamera')) {
  handoffApi = await import('./draw-camera-handoff.mjs?rev=20261007-draw-handoff-1');
  returnedCamera = handoffApi.takeDrawCameraReturn({ search: location.search, consume: false });
  if (!returnedCamera) throw new Error('撮影の受け渡しを確認できません。元の一時保存は変更していません。');
  if (returnedCamera.project?.pxdBase64) initialCameraProject = {
    project: await decodePxd(decodeCameraBytes(returnedCamera.project.pxdBase64)),
    ...(returnedCamera.project.savedPxdBase64 ? { savedProject: await decodePxd(decodeCameraBytes(returnedCamera.project.savedPxdBase64)) } : {}),
    persisted: returnedCamera.project.persisted === true, edited: returnedCamera.project.edited === true
  };
}
function encodeCameraBytes(bytes) {
  let binary = ''; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function decodeCameraBytes(text) { return Uint8Array.from(atob(text), c => c.charCodeAt(0)); }

const setTimeout = (callback, delay) => scope.timeout(callback, delay);
const clearTimeout = (id) => scope.clearTimeout(id);
const requestAnimationFrame = (callback) => scope.frame(callback);
const cancelAnimationFrame = (id) => scope.cancelFrame(id);

const LAST_DRAFT_KEY = 'pixieed.simple-draw.last-draft.v1';
const $ = (selector) => document.querySelector(selector);
const canvas = $('#draw-canvas'); const pixelSurface = createPixelCanvasSurface(canvas);
const viewportOverlays = mountDrawViewportOverlays({ board: $('.draw-board'), canvas, scope });
let virtualCursor = null;
applyDrawingToolIcons($('#main'));
mountToolHeaderControls(document, { selectors: ['.draw-import', '#draw-camera', '#draw-settings-picker', '#draw-output', '#draw-clear', '#draw-to-globe'] });
const fixedLeft = document.createElement('div'); fixedLeft.className = 'draw-fixed-left';
fixedLeft.append($('#draw-tool-picker'), $('#draw-animation-controls'), $('#draw-undo'));
$('.draw-controls').prepend(fixedLeft);
const fixedRight = document.createElement('div'); fixedRight.className = 'draw-fixed-right';
fixedRight.append($('#draw-redo')); $('.draw-controls').append(fixedRight);
$('.draw-toolbar')?.remove();
$('.draw-toggles')?.remove(); $('.draw-actions')?.remove();
const resultView = createToolResultView({ key: 'draw-result', main: $('#main'), returnLabel: '描画に戻る',
  beforeShow: () => { closeColorEditor(); editorUi.closePanels(); animationControls?.close?.(); interactionEffects.clear(); },
  onClose: () => requestAnimationFrame(placeOverlays) });
const status = $('#draw-status'); const saveButton = $('#draw-save'); const resumeButton = $('#draw-resume');
const globeButton = $('#draw-to-globe');
const sizeSelect = $('#draw-size');
const interactionEffects = createInteractionEffects();
let documentData = createDrawDocument(); let history = createDrawHistory(documentData); let selectedColor = 2; let tool = 'pen'; let drawing = false; let previousPoint = null; let strokeStartPixels = null; let activeDraftId = null; let source = { type: 'hand_drawn', assetId: null, revisionId: null }; let saved = false; let canvasPrepared = false; let sizeWasChosen = false;
let inputStorage = null; try { inputStorage = globalThis.localStorage; } catch { /* Private mode may block preferences. */ }
let inputSettings = readDrawInputSettings(inputStorage, documentData.palette), lastInputSettings = '', strokeBinding = null, lastInputSide = 'left';
inputSettings.editedSide = 'left';
selectedColor = inputSettings.bindings.left.color; tool = inputSettings.bindings.left.tool;
function effectiveTool() { return strokeBinding?.tool || tool; }
function effectiveColor() { return strokeBinding?.color ?? selectedColor; }
let animationSession = createDrawAnimationSession(documentData), animationControls = null, strokeTracker = null;
const trackDrawStart = createToolStartTracker('draw');
let selection = null, selectionDrag = null, strokeWasSaved = false;
let selectionTransform = null, selectionPreview = null, selectionPanel = null, selectionError = '';
let selectionRenderRequest = 0;
let selectionMaskCache = null, selectionMaskOwner = null;
let preparedSelectionCommit = null;
let cameraOpening = false, cameraGeneration = 0, cameraUnlock = null, cameraFailureNotice = null;
const colorActivationBusy = new WeakSet();
// Capture held input before the panel dismissal handler releases it.
scope.listen(document, 'pointerdown', event => {
  const swatch = event.target.closest?.('.draw-color[data-color-index]');
  if (!swatch) return;
  colorActivationBusy.delete(swatch);
  if (strokeBinding || document.querySelector('#draw-virtual-controls button[aria-pressed="true"]')) colorActivationBusy.add(swatch);
}, { capture: true });
const selectionClipboard = createDrawSelectionClipboard(), selectionViewStates = new WeakMap();
const resizeViewStates = new WeakMap();
function resizeViewState() { return { mirrorOrigin: { ...mirrorOrigin }, selection: selection && { ...selection }, zoom, panX, panY, cursor: virtualCursor?.canvasPosition() }; }
function translatedResizeView(width, height) {
  const offset = canvasResizeOffset(documentData.width, documentData.height, width, height, 'center');
  const point = virtualCursor?.canvasPosition();
  const clipped = selection && { x: Math.max(0, selection.x + offset.x), y: Math.max(0, selection.y + offset.y),
    width: Math.min(width, selection.x + offset.x + selection.width) - Math.max(0, selection.x + offset.x),
    height: Math.min(height, selection.y + offset.y + selection.height) - Math.max(0, selection.y + offset.y) };
  return { mirrorOrigin: { x: Math.max(0, Math.min(1, (mirrorOrigin.x * documentData.width + offset.x) / width)),
    y: Math.max(0, Math.min(1, (mirrorOrigin.y * documentData.height + offset.y) / height)) },
    selection: clipped?.width > 0 && clipped?.height > 0 ? clipped : null,
    zoom: 1, panX: 0, panY: 0, cursor: point && { x: point.x + offset.x, y: point.y + offset.y } };
}
// Register dismissal before any panel or viewport pointer-capture handlers.
mountDrawPanelDismissals({ scope, root: $('#main'), cancelInput: cancelDrawingInput,
  closeFloating: () => { closeColorEditor(); animationControls?.close?.(); editorUi.closePanels(); },
  hasFloating: () => Boolean(colorEdit || animationControls?.hasOpenPanels) });
const selectionControls = mountDrawSelectionOverlay({ scope, board: $('.draw-board'), canvas, getFrame: selectionFrame });
const TOOL_NAMES = { pen: 'ペン', eraser: '消しゴム', fill: '塗りつぶし', line: '直線', rectangle: '四角形', 'rectangle-fill': '四角塗り', ellipse: '楕円', 'ellipse-fill': '楕円塗り', spray: 'スプレー', select: '範囲選択', picker: 'スポイト' };
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
    viewportOverlays.render({ readOnly: true });
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
function drawingInputBusy() { return Boolean(drawing || pendingTap || activePointers.size || virtualCursor?.pressed || virtualCursor?.moving); }
function cancelCamera() {
  cameraGeneration++;
  cameraOpening = false;
  cameraUnlock?.(); cameraUnlock = null;
}
function cameraStatus(message) {
  if (scope.disposed) return;
  if (!cameraOpening) cameraFailureNotice = { message, until: performance.now() + 2600 };
  toast(message);
}
// Snapshot the complete work before navigation; no camera data enters the editor yet.
function freezeCameraEditor() {
  const nodes = [$('#main'), document.querySelector('body > .site-header')].filter(Boolean);
  const previous = nodes.map(node => node.inert);
  nodes.forEach(node => { node.inert = true; });
  cameraUnlock = () => { nodes.forEach((node, index) => { node.inert = previous[index]; }); };
}
async function openCamera() {
  if (cameraOpening || scope.disposed) return;
  if (selectionTransform) { toast('選択の変形を✓で確定、×で取消してからカメラを開いてください。'); return; }
  if (colorEdit || drawingInputBusy()) { toast('現在の色編集・描画操作を終えてからカメラを開いてください。'); return; }
  if (animationSession.locked) { toast('レイヤーの鍵を外すとカメラを使えます。'); return; }
  if (!canEdit()) return;
  const generation = ++cameraGeneration;
  cameraOpening = true; editorUi.closePanels(); animationControls?.close?.(); selectionPanel?.hide(); hideCursors();
  freezeCameraEditor(); toast('作品をカメラへ受け渡しています…');
  try {
    handoffApi ??= await import('./draw-camera-handoff.mjs?rev=20261007-draw-handoff-1');
    cameraNavigationResume = await pxdBridge.pauseForNavigation();
    if (generation !== cameraGeneration || scope.disposed) { cameraNavigationResume?.(); cameraNavigationResume = null; return; }
    const { chooseCameraPalette } = await import('./draw-camera-core.mjs');
    const owner = animationSession.snapshot();
    const encode = handoffApi.encodeDrawCameraAnimation;
    const timeline = { current: encode(owner.timeline.current), past: owner.timeline.past.map(encode), future: owner.timeline.future.map(encode) };
    // Rehydration can retain more tile buffers than in-memory COW history.
    // Prove the return fits its history budget before leaving the working editor.
    const decode = handoffApi.decodeDrawCameraAnimation;
    const recovery = createDrawAnimationSession(documentData);
    recovery.restore({ timeline: { current: decode(timeline.current), past: timeline.past.map(decode), future: timeline.future.map(decode) }, selections: owner.selections });
    const base = pxdBridge.currentProject;
    let project = null;
    if (base) {
      const pxdBase64 = encodeCameraBytes(await encodePxd(base));
      const persistedBase64 = pxdBridge.persistedProject ? encodeCameraBytes(await encodePxd(pxdBridge.persistedProject)) : null;
      project = { pxdBase64, ...(persistedBase64 && persistedBase64 !== pxdBase64 ? { savedPxdBase64: persistedBase64 } : {}), persisted: pxdBridge.persisted, edited: pxdBridge.dirty };
    }
    if (generation !== cameraGeneration || scope.disposed) { cameraNavigationResume?.(); cameraNavigationResume = null; return; }
    const mask = selectionMask();
    const allowedIndices = chooseCameraPalette(documentData, mask, getAnimationUsedColorIndices(animationSession.animation, { excludeFrameId: animationSession.frameId, excludeLayerId: animationSession.layerId }));
    const clip = selectionClipboard.read();
    const url = handoffApi.beginDrawCamera({ animation: animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId,
      mask, allowedIndices, project, history: { timeline, selections: owner.selections,
        timelapse: timelapse.snapshot().map(event => ({ ...event, data: encodeCameraBytes(event.data), ...(event.indices ? { indices: [...event.indices] } : {}) })) },
      view: { editor: getDrawEditorState(), selection: selection && { ...selection, ...(selection.mask ? { mask: [...selection.mask] } : {}) },
        source, activeDraftId, baseRevisionId, saved, lastInputSide, cursor: virtualCursor?.canvasPosition(),
        clipboard: clip && { ...clip, indices: [...clip.indices], ...(clip.mask ? { mask: [...clip.mask] } : {}) } }
    });
    const id = new URL(url, location.origin).searchParams.get('drawRequest');
    // Browser Back (with or without BFCache) reaches a recoverable, private snapshot.
    window.history.replaceState(null, '', `/draw/?drawCamera=${id}`);
    location.assign(url);
  } catch (error) {
    if (generation === cameraGeneration) { cancelCamera(); cameraNavigationResume?.(); cameraNavigationResume = null; paint(); cameraStatus(`カメラへ移動できませんでした：${error.message}`); }
  }
}
async function restoreCameraReturn(record) {
  const decode = handoffApi.decodeDrawCameraAnimation;
  if (record.history?.timeline) {
    const state = record.history;
    animationSession.restore({ timeline: { current: decode(state.timeline.current), past: state.timeline.past.map(decode), future: state.timeline.future.map(decode) }, selections: state.selections });
  } else animationSession.load(record.animation, { frameId: record.frameId, layerId: record.layerId });
  readOnlyImage = null;
  pxdImageRole = record.view?.editor?.imageRole || 'main';
  restoreDrawEditorState({ ...record.view?.editor, frameId: record.frameId, layerId: record.layerId });
  source = record.view?.source || source; activeDraftId = record.view?.activeDraftId ?? null; baseRevisionId = record.view?.baseRevisionId ?? null;
  saved = record.view?.saved === true; lastInputSide = record.view?.lastInputSide === 'right' ? 'right' : 'left';
  selection = record.view?.selection ? { ...record.view.selection, ...(record.view.selection.mask ? { mask: Uint8Array.from(record.view.selection.mask) } : {}) } : null;
  selectionMaskOwner = null; selectionMaskCache = null;
  if (record.mask) { selectionMaskCache = new Uint8Array(record.mask); selectionMaskOwner = selection; }
  if (selection) selectionViewStates.set(animationSession.animation, { ...selection });
  if (record.view?.clipboard) { const clip = record.view.clipboard; selectionClipboard.set({ ...clip, indices: Uint8Array.from(clip.indices), ...(clip.mask ? { mask: Uint8Array.from(clip.mask) } : {}) }); }
  if (record.history?.timelapse) timelapse.restore(record.history.timelapse.map(event => ({ ...event, data: decodeCameraBytes(event.data), ...(event.indices ? { indices: Uint32Array.from(event.indices) } : {}) })));
  if (record.indices) {
    const { prepareCameraTarget, replaceCameraPixels } = await import('./draw-camera-core.mjs');
    const target = prepareCameraTarget(documentData, record.mask, record.allowedIndices);
    const next = replaceCameraPixels(documentData, target, record.indices);
    const prepared = animationSession.prepareDocument(next);
    const before = animationSession.animation;
    preparedSelectionCommit = prepared;
    let changed;
    try { changed = history.commit(next); } finally { preparedSelectionCommit = null; }
    if (!changed) {
      // A shutter press is one animation-history transaction even for identical pixels.
      prepared();
      if (selection) { selectionViewStates.set(before, { ...selection }); selectionViewStates.set(animationSession.animation, { ...selection }); }
      animationControls?.refresh(); pxdBridge?.markDirty();
    }
    saved = false;
  }
  canvasPrepared = false; renderPalette(); setCanvasDimensions(); paint(); updateCanvasView(); placeSelection(); syncDrawingSettings(); animationControls?.refresh();
  virtualCursor?.setCanvasPosition(record.view?.cursor);
  handoffApi.consumeDrawCameraRequest(record);
  const current = pxdBridge.currentProject;
  const query = current && pxdBridge.persisted ? `?${new URLSearchParams({ pxd: current.projectId, pxdRevision: current.revisionId })}` : '';
  window.history.replaceState(null, '', `/draw/${query}`);
  toast(record.indices ? '撮影を反映しました。1回戻すと撮影前に戻ります。' : '撮影を取消し、元の作品を戻しました。');
}
scope.listen($('#draw-camera'), 'click', openCamera);
scope.listen(document, 'keydown', event => {
  if (!cameraOpening) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancelCamera(); paint(); toast('カメラを取消しました。'); }
}, { capture: true });
scope.listen(window, 'pagehide', cancelCamera);
scope.listen(document, 'visibilitychange', () => { if (document.hidden) cancelCamera(); });
function updateControls() {
  const busy = drawingInputBusy();
  $('#draw-undo').disabled = busy || !selectionTransform && !animationSession.canUndo; $('#draw-redo').disabled = busy || Boolean(selectionTransform) || !animationSession.canRedo;
  $('#draw-undo').setAttribute('aria-disabled', String($('#draw-undo').disabled)); $('#draw-redo').setAttribute('aria-disabled', String($('#draw-redo').disabled));
  status.textContent = cameraFailureNotice && performance.now() < cameraFailureNotice.until ? cameraFailureNotice.message : saved ? '保存しました。' : '編集中です。保存すると端末に残ります。';
  syncPlaybackControl();
  selectionPanel?.sync();
}
function syncPlaybackControl() {
  const button = $('#draw-animation-play'), badge = $('#draw-playback-position');
  if (cameraOpening) return;
  // The result view temporarily owns this control as its return action.
  if (button.hasAttribute('data-tool-result-return')) return;
  const frames = animationSession.animation.frames;
  button.disabled = Boolean(readOnlyImage) || frames.length < 2;
  button.setAttribute('aria-pressed', String(playing));
  const label = playing ? 'アニメーションを停止' : frames.length < 2 ? '2コマ以上でアニメーションを再生できます' : 'アニメーションを再生';
  button.setAttribute('aria-label', label); button.title = label;
  badge.hidden = !playing;
  if (playing) badge.textContent = `▶ ${frames.findIndex(frame => frame.id === playbackFrame) + 1} / ${frames.length}`;
  animationControls?.showPlaybackFrame?.(playing ? playbackFrame : null);
}
function paint(changed = null) {
  if (readOnlyImage) { setCanvasDimensions(); canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(readOnlyImage.rgba), readOnlyImage.width, readOnlyImage.height), 0, 0); updateControls(); return; }
  if (!canvasPrepared || canvas.width !== documentData.width || canvas.height !== documentData.height) setCanvasDimensions();
  if (selectionTransform) changed = null;
  const display = playing ? composeAnimationFrame(animationSession.animation, playbackFrame || animationSession.frameId) : animationSession.composite(selectionPreview || documentData, changed);
  pixelSurface.paint(display.pixels, display.palette, playing ? null : changed);
  paintOnion(display);
  updateControls();
}
function installAnimationDocument(doc) {
  cancelCamera();
  const changedSize = documentData.width !== doc.width || documentData.height !== doc.height;
  const view = changedSize ? resizeViewStates.get(animationSession.animation) || translatedResizeView(doc.width, doc.height) : null;
  clearSelection();
  documentData = doc; history = recordedHistory(createDrawHistory(documentData)); saved = false;
  const selectionState = selectionViewStates.get(animationSession.animation);
  if (selectionState) selection = { ...selectionState };
  if (view) { mirrorOrigin = { ...view.mirrorOrigin }; selection = view.selection && { ...view.selection }; zoom = view.zoom; panX = view.panX; panY = view.panY; }
  selectedColor = Math.min(selectedColor, doc.palette.length - 1); canvasPrepared = false;
  renderPalette(); showCurrentColor(); paint(); syncDrawingSettings(); placeSelection(); animationControls?.refresh();
  if (view) { updateCanvasView(); placeSelection(); requestAnimationFrame(() => { if (!scope.disposed) virtualCursor?.setCanvasPosition(view.cursor); }); }
}
function stopAnimation() {
  playing = false; playbackFrame = null; cancelAnimationFrame(playbackRequest); playbackRequest = 0;
  animationControls?.refresh();
  syncPlaybackControl();
  syncMirrorRail();
}
function toggleAnimation() {
  if (selectionTransform) { toast('✓で確定、×で取消してから再生できます。'); return; }
  cancelSelectionTransform(); selectionPanel?.hide();
  if (playing) { stopAnimation(); paint(); return; }
  if (readOnlyImage || animationSession.animation.frames.length < 2) { toast('2コマ以上あるとアニメーションを再生できます。'); return; }
  virtualCursor?.release();
  endStroke(); closeColorEditor();
  const frames = animationSession.animation.frames; playbackOffset = 0;
  for (const frame of frames) { if (frame.id === animationSession.frameId) break; playbackOffset += frame.durationMs; }
  playing = true; playbackStarted = performance.now();
  syncMirrorRail();
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
  if (cameraOpening) return false;
  if (action.type === 'play') return toggleAnimation();
  if (action.type === 'onion') {
    const enabled = typeof action.enabled === 'boolean' ? action.enabled : !onion;
    const canEnable = animationSession.animation.frames.length >= 2;
    onion = enabled ? canEnable : false;
    paint(); syncDrawingSettings(); animationControls?.refresh(); return;
  }
  if (action.type === 'export-gif') return exportAnimation();
  if (selectionTransform) { toast('✓で確定、×で取消してからコマ・レイヤーを変更できます。'); return false; }
  selectionPanel?.hide(); stopAnimation(); endStroke(); closeColorEditor();
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
  getState: () => ({ ...animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId, playing, playbackFrameId: playbackFrame, onion, readOnly: Boolean(readOnlyImage) }),
  onionControlExternal: true, dismissibleMenus: true,
  onAction: handleAnimationAction,
  getCelHasContent: (frameId, layerId) => hasAnimationCelContent(animationSession.animation, frameId, layerId),
  getFramePreview: (frameId) => { const doc = composeAnimationFrame(animationSession.animation, frameId); return new ImageData(new Uint8ClampedArray(documentRgba(doc)), doc.width, doc.height); }
});
function renderPalette() {
  const palette = $('#draw-palette'); palette.replaceChildren();
  const transparent = document.createElement('button'); transparent.type = 'button'; transparent.className = 'draw-color draw-color--transparent'; transparent.dataset.colorIndex = '-1'; transparent.setAttribute('aria-label', '透明色'); transparent.setAttribute('aria-pressed', String(selectedColor === -1));
  palette.append(transparent);
  const usesDefaultPalette = documentData.palette.length === DRAW_PALETTE.length && documentData.palette.every((color, index) => color.toLowerCase() === DRAW_PALETTE[index].toLowerCase());
  const order = usesDefaultPalette ? DRAW_PALETTE_ORDER : documentData.palette.map((_, index) => index);
  order.forEach((index) => { const color = documentData.palette[index];
    const button = document.createElement('button'); button.dataset.colorIndex = String(index); button.type = 'button'; button.className = 'draw-color'; button.style.setProperty('--draw-color', color); button.setAttribute('aria-label', `色 ${index + 1}`); button.title = `色 ${index + 1}`; button.setAttribute('aria-pressed', String(index === selectedColor));
    palette.append(button);
  });
  if (documentData.palette.length < 32) {
    const add = document.createElement('button'); add.type = 'button'; add.className = 'draw-color'; add.textContent = '+'; add.setAttribute('aria-label', '色を追加する');
    add.addEventListener('click', () => {
      if (!canEdit()) return;
      if (selectionTransform) { toast('✓で確定、×で取消してから色を追加できます。'); return; }
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
let colorEditorReturnFocus = null;
function openColorEditor(index, sourceElement = null) {
  if (selectionTransform) { toast('✓で確定、×で取消してから色を編集できます。'); return; }
  if (index < 0 || index >= documentData.palette.length || !canEdit()) return;
  cancelSelectionTransform(); selectionPanel?.hide(); editorUi.closePanels(); closeColorEditor();
  colorEditorReturnFocus = sourceElement ? document.querySelector(`.draw-color[data-color-index="${index}"]`) : document.activeElement;
  const base = [...documentData.palette]; colorEdit = { index, base, maxColors: 32 };
  colorPanel.open({ color: base[index].slice(0, 7), resetColor: index < DRAW_PALETTE.length ? DRAW_PALETTE[index] : null });
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
  const returnFocus = colorPanel.element.contains(document.activeElement) ? colorEditorReturnFocus : null;
  colorEditorReturnFocus = null; colorPanel.close();
  if (!colorEdit) return;
  const after = documentData.palette; documentData.palette = colorEdit.base; colorEdit = null;
  if (history.commit({ ...documentData, pixels: [...documentData.pixels], palette: after })) saved = false;
  renderPalette(); showCurrentColor(); paint();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}
const editorUi = mountCreationEditorUi($('#main'), { beforePanelOpen: () => { cancelDrawingInput(); closeColorEditor(); animationControls?.close?.(); } });
// touching the picture closes the sheet and draws straight away with the new colour
canvas.addEventListener('pointerdown', () => { if (colorEdit) closeColorEditor(); }, true);
scope.listen(window, 'keydown', (event) => { if (event.key === 'Escape' && colorEdit) closeColorEditor(); });
function showCurrentColor() {
  inputSettings.bindings.left.color = selectedColor; syncInputControls();
}
function chooseColor(index, sourceElement, side = 'left') {
  inputSettings.bindings[side].color = index;
  if (side === 'right') {
    if (!selectionTransform && ['eraser', 'picker', 'select'].includes(inputSettings.bindings.right.tool)) inputSettings.bindings.right.tool = 'pen';
    syncInputControls(); return;
  }
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
  if (cameraOpening) return false;
  if (playing) { toast('再生を止めると編集できます。'); return false; }
  if (readOnlyImage) { toast('原本を表示しています。編集するにはプロジェクトのキャンバス設定でサイズと色を合わせてください。'); return false; }
  const policy = evaluateSharedCanvasPolicy({ width: value.width, height: value.height, colorCount: usedColorCount(value) }, { passActive: true });
  if (policy.supported) return true;
  if (!policy.supported) { toast('この作品は表示・保存できます。プロジェクトのキャンバス設定で256px・32色以内に合わせると編集できます。'); return false; }
  return false;
}
function replaceDocument(nextDocument, nextSource = source, { fromPxd = false } = {}) {
  cancelCamera();
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
  if (history.commit(next)) { trackDrawStart(); saved = false; paint(changed && typeof changed.length === 'number' ? changed : null); }
}
function pointFromEvent(event) {
  return rawPixelCellAt(event, canvas.getBoundingClientRect(), documentData.width, documentData.height);
}
function exactSelectionPoint(event) {
  const r = canvas.getBoundingClientRect();
  return { x: (event.clientX - r.left) * documentData.width / r.width, y: (event.clientY - r.top) * documentData.height / r.height };
}
function selectionHandleAtEvent(event) {
  const handle = selectionControls.hit(exactSelectionPoint(event), event.pointerType);
  if (handle === 'pivot' && event.altKey && selectionFrame() && selectionContains(selectionFrame(), exactSelectionPoint(event))) return null;
  return handle;
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
  grid.style.setProperty('--mirror-x', `${mirrorOrigin.x * 100}%`); grid.style.setProperty('--mirror-y', `${mirrorOrigin.y * 100}%`);
  Object.assign(onionCanvas.style, { left: grid.style.left, top: grid.style.top, width: grid.style.width, height: grid.style.height });
  for (const node of [grid, canvas]) { node.style.setProperty('--cols', documentData.width); node.style.setProperty('--rows', documentData.height); }
  grid.classList.toggle('is-fine', r.width / documentData.width < 6);
  viewportOverlays.render({ width: documentData.width, height: documentData.height, grid: showGrid, readOnly: Boolean(readOnlyImage) });
  virtualCursor?.place();
  placeSelection();
}
function selectionFrame() { return selectionTransform?.state || (selection && { ...selection, angle: 0, pivot: selection.pivot || selectionDefaultPivot(selection) }); }
function clearSelection() { cancelSelectionTransform(); selection = null; selectionDrag = null; selectionControls.render(null, false); selectionPanel?.sync(); }
function placeSelection() {
  selectionPanel?.sync();
  const selectionTool = (strokeBinding?.tool || inputSettings.bindings[lastInputSide]?.tool || tool) === 'select';
  const frame = selection?.mask && !selectionTransform && !selectionHasPixels() ? null : selectionFrame();
  selectionControls.render(frame, selectionTool && Boolean(selectionTransform || selectionHasPixels()) && !animationSession.locked && !readOnlyImage && !playing, selectionDrag?.handle, selection?.mask || null);
}
function selectionMask() {
  if (!selection) return null;
  if (selectionMaskOwner !== selection) { selectionMaskOwner = selection; selectionMaskCache = drawSelectionMask(selection, documentData.width, documentData.height); }
  return selectionMaskCache;
}
function selectionHasPixels() {
  const mask = selectionMask();
  return Boolean(mask && documentData.pixels.some((value, index) => mask[index] && value >= 0 && !documentData.palette[value]?.endsWith('00')));
}
function selectionMember(point) {
  const x = Math.floor(point.x), y = Math.floor(point.y);
  return x >= 0 && y >= 0 && x < documentData.width && y < documentData.height && Boolean(selectionMask()?.[y * documentData.width + x]);
}
function selectionOwner() { return { animation: animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId }; }
function selectionOwnerMatches() {
  const owner = selectionTransform?.owner;
  return owner && owner.animation === animationSession.animation && owner.frameId === animationSession.frameId && owner.layerId === animationSession.layerId;
}
function startSelectionTransform() {
  if (selectionTransform) return selectionOwnerMatches();
  if (!selection || animationSession.locked || !canEdit()) return false;
  selectionTransform = createDrawSelectionTransform(documentData, selection, { owner: selectionOwner(), mask: selectionMask() });
  if (!selectionTransform) { toast('透明だけの範囲です。'); return false; }
  selectionError = ''; return true;
}
function previewSelectionTransform() {
  if (!selectionOwnerMatches()) { cancelSelectionTransform(); return; }
  selection = selectionTransform.rect;
  selectionError = ''; placeSelection();
  if (!selectionRenderRequest) selectionRenderRequest = requestAnimationFrame(() => {
    selectionRenderRequest = 0;
    if (!selectionOwnerMatches()) return;
    try { selectionPreview = selectionTransform.project({ enforceLimits: false }).document; paint(); }
    catch (error) { selectionError = error.message; selectionPanel?.sync(); toast(error.message); }
  });
}
function cancelSelectionTransform() {
  if (!selectionTransform) return false;
  cancelAnimationFrame(selectionRenderRequest); selectionRenderRequest = 0;
  selection = selectionTransform.originalBounds;
  selectionTransform = null; selectionPreview = null; selectionError = '';
  paint(); placeSelection(); return true;
}
function confirmSelectionTransform() {
  if (!selectionTransform || !selectionOwnerMatches() || animationSession.locked || !canEdit()) return false;
  try {
    const otherColors = Array.from(getAnimationUsedColorIndices(animationSession.animation, { excludeFrameId: animationSession.frameId, excludeLayerId: animationSession.layerId }),
      index => index < 0 ? '#00000000' : documentData.palette[index]);
    const next = selectionTransform.project({ otherColors }).document;
    const prepared = animationSession.prepareDocument(next);
    const bounds = selectionTransform.rect;
    const pivot = selectionTransform.state.pivot;
    const mask = selectionTransform.mask(documentData.width, documentData.height);
    const selectedBounds = drawSelectionMaskBounds(mask, documentData.width, documentData.height);
    const previousBounds = selectionTransform.originalBounds;
    cancelAnimationFrame(selectionRenderRequest); selectionRenderRequest = 0;
    selectionTransform = null; selectionPreview = null; selectionError = '';
    selection = { ...selectedBounds, pivot, mask };
    commitSelectionDocument(next, previousBounds, selection, prepared);
    renderPalette(); showCurrentColor(); paint(); placeSelection(); canvas.focus({ preventScroll: true });
    if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > documentData.width || bounds.y + bounds.height > documentData.height) toast('キャンバス外の部分は切り取りました。「戻す」で復元できます。');
    return true;
  } catch (error) { selectionError = error.message; selectionPanel?.sync(); toast(error.message); return false; }
}
function selectionPanelState() {
  const editable = !playing && !readOnlyImage && !animationSession.locked, busy = drawingInputBusy();
  return { bounds: selectionFrame(), colorMode: selectedMode(lastInputSide) === 'color', pending: Boolean(selectionTransform), busy, hasClipboard: selectionClipboard.hasValue, error: selectionError,
    canCopy: Boolean(selection && !selectionTransform && !playing && !readOnlyImage && !busy),
    canCut: Boolean(selection && !selectionTransform && editable && !busy), canPaste: Boolean(selectionClipboard.hasValue && editable && !selectionTransform && !busy), canTransform: Boolean(selectionHasPixels() && editable) };
}
function commitSelectionDocument(next, beforeBounds, afterBounds, prepared = animationSession.prepareDocument(next)) {
  const before = animationSession.animation;
  preparedSelectionCommit = prepared;
  try {
    if (history.commit(next)) {
      if (beforeBounds) selectionViewStates.set(before, { ...beforeBounds });
      if (afterBounds) selectionViewStates.set(animationSession.animation, { ...afterBounds });
      saved = false;
    }
  } finally { preparedSelectionCommit = null; }
}
function runSelectionAction(action, fields = {}) {
  if (action === 'back') { setTool('select'); canvas.focus({ preventScroll: true }); return true; }
  if (action === 'cancel') { cancelDrawingInput(); return cancelSelectionTransform(); }
  if (action === 'confirm') { endStroke(); return confirmSelectionTransform(); }
  if (action === 'copy' || action === 'cut') {
    if (!selection || selectionTransform || playing || readOnlyImage || action === 'cut' && animationSession.locked) return false;
    cancelDrawingInput();
    const clip = captureDrawSelection(documentData, selection, { mask: selectionMask() });
    if (!clip) { toast('透明だけの範囲です。コピーは変更していません。'); return false; }
    if (action === 'cut') {
      if (!canEdit()) return false;
      selectionClipboard.set(clip);
      commitSelectionDocument(clearDrawSelection(documentData, clip, selection), selection, selection); paint();
      toast('カットしました。貼付の取消では戻りません。「戻す」で復元できます。');
    } else { selectionClipboard.set(clip); toast('選択した絵をコピーしました。このタブ内で貼り付けできます。'); }
    selectionPanel.setMode('paste'); return true;
  }
  if (action === 'paste') {
    if (!selectionClipboard.hasValue || selectionTransform || animationSession.locked || !canEdit()) return false;
    cancelDrawingInput(); const clip = selectionClipboard.read(), oldBounds = selection && { ...selection };
    const bounds = { x: selection?.x ?? Math.max(0, Math.floor((documentData.width - clip.width) / 2)), y: selection?.y ?? Math.max(0, Math.floor((documentData.height - clip.height) / 2)), width: clip.width, height: clip.height };
    setTool('select');
    selectionTransform = createDrawSelectionTransform(documentData, bounds, { clipboard: clip, owner: selectionOwner() });
    selectionTransform.originalBounds = oldBounds;
    previewSelectionTransform(); toast('貼付を配置中です。位置・サイズを調整して確定してください。'); return true;
  }
  if (!['resize', 'position', 'angle', 'pivot', 'rotate-left', 'rotate-right', 'flip-x', 'flip-y'].includes(action)) return false;
  cancelDrawingInput(); if (!startSelectionTransform()) return false;
  if (action === 'resize') {
    const axis = fields.axis, other = axis === 'width' ? 'height' : 'width';
    const value = Math.max(1, Math.min(256, Math.round(fields.value)));
    const size = { [axis]: value };
    if (fields.fixedRatio) {
      const paired = Math.round(axis === 'width' ? value / selectionTransform.aspectRatio : value * selectionTransform.aspectRatio);
      if (paired < 1 || paired > 256) { toast('幅・高さは1〜256pxです。'); return false; }
      size[other] = paired;
    }
    selectionTransform.resize(size);
  } else if (action === 'position') selectionTransform.update({ [fields.axis]: fields.value });
  else if (action === 'pivot') selectionTransform.setPivot({ ...selectionTransform.state.pivot, [fields.axis]: fields.value });
  else if (action === 'angle') selectionTransform.setAngle(fields.value);
  else if (action.startsWith('rotate')) selectionTransform.rotate(action === 'rotate-left' ? -1 : 1);
  else selectionTransform.flip(action === 'flip-x' ? 'x' : 'y');
  previewSelectionTransform(); return true;
}
selectionPanel = mountDrawSelectionPanel({ scope, host: $('.draw-control-dock'), auxiliaryHost: $('.draw-input-settings'), getState: selectionPanelState, onAction: runSelectionAction,
  beforeOpen: () => { cancelDrawingInput(); $('#draw-settings-picker').open = true; placeSettingsPanel(); } });
function placeToolMenu() {
  const menu = $('.draw-tool-menu'), summary = $('#draw-tool-summary'); if (!menu || !summary) return;
  const r = summary.getBoundingClientRect(), header = Math.max(document.querySelector('body > .site-header')?.getBoundingClientRect().bottom || 64, document.querySelector('.project-bar')?.getBoundingClientRect().bottom || 0);
  const navigationTop = document.querySelector('.app-tabs')?.getBoundingClientRect().top || innerHeight;
  const width = Math.min(196, innerWidth - 24), controls = $('.draw-controls').getBoundingClientRect();
  const above = Math.max(44, r.top - header - 20), below = Math.max(0, navigationTop - r.bottom - 20);
  const openBelow = below > above;
  const available = Math.max(80, navigationTop - header - 16), fallback = Math.max(above, below) < Math.min(180, available);
  menu.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, controls.left + (controls.width - width) / 2))}px`;
  menu.style.bottom = fallback || openBelow ? 'auto' : `${Math.max(12, innerHeight - r.top + 8)}px`;
  menu.style.top = fallback ? `${header + 8}px` : openBelow ? `${r.bottom + 8}px` : 'auto';
  menu.style.maxHeight = `${Math.min(440, fallback ? available : openBelow ? below : above)}px`;

}
const cursorTwins = Array.from({ length: 7 }, (_, index) => {
  const twin = index === 0 ? $('.draw-cursor-twin') : $('.draw-cursor-twin').cloneNode();
  if (index) { $('.draw-board').append(twin); scope.add(() => twin.remove()); }
  return twin;
});
function hideCursors() { $('.draw-cursor').hidden = true; cursorTwins.forEach(node => { node.hidden = true; }); }
function showCursor(event) {
  selectionControls.hover(selectionDrag?.handle || selectionHandleAtEvent(event) || '');
  const cursor = $('.draw-cursor'); if (!cursor) return;
  if (event.pointerType === 'touch' && !drawing) { hideCursors(); return; }
  const p = pointFromEvent(event);
  if (p.x < 0 || p.y < 0 || p.x >= documentData.width || p.y >= documentData.height) { hideCursors(); return; }
  const board = $('.draw-board'), b = board.getBoundingClientRect(), r = canvas.getBoundingClientRect(), cw = r.width / documentData.width, ch = r.height / documentData.height;
  const points = effectiveTool() === 'select' || effectiveTool() === 'picker' ? [p] : symmetryPoints(p, documentData.width, documentData.height, drawingSymmetry());
  [cursor, ...cursorTwins].forEach((node, index) => {
    const point = points[index]; node.hidden = !point;
    if (!point) return;
    Object.assign(node.style, { left: `${r.left - b.left - board.clientLeft + point.x * cw}px`, top: `${r.top - b.top - board.clientTop + point.y * ch}px`, width: `${cw}px`, height: `${ch}px` });
    node.style.setProperty('--draw-color', effectiveTool() === 'eraser' || effectiveColor() < 0 ? 'transparent' : documentData.palette[effectiveColor()] || 'transparent'); node.dataset.tool = effectiveTool();
  });
}
canvas.addEventListener('pointerleave', () => { if (!drawing && !virtualCursor?.enabled) hideCursors(); });
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
  const selectionOnly = Boolean(selection || selectionTransform || effectiveTool() === 'select');
  if (drawing) endStroke(true);
  const [a, b] = pointerPair(); if (!a || !b) return;
  pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom, panX, panY, centerX: (a.x + b.x) / 2, centerY: (a.y + b.y) / 2, time: performance.now(), moved: 0, fingers: activePointers.size, selectionOnly };
}
function selectedPixelValue() { return effectiveTool() === 'eraser' ? -1 : effectiveColor(); }
// ---- drawing helpers: a mirror copy of every mark, the straight line, the colour picker ----
const SYMMETRY_NAMES = { horizontal: '左右対称', vertical: '上下対称', diagonalDown: '右下がりの対角線', diagonalUp: '右上がりの対角線' };
let symmetry = Object.fromEntries(Object.keys(SYMMETRY_NAMES).map(key => [key, false])); let lineStart = null;
let mirrorOrigin = { x: .5, y: .5 };
function drawingSymmetry() { return { ...symmetry, origin: { x: mirrorOrigin.x * documentData.width - .5, y: mirrorOrigin.y * documentData.height - .5 } }; }
function syncMirrorRail() {
  const available = !readOnlyImage && effectiveTool() !== 'select' && Object.values(symmetry).some(Boolean), rail = $('#draw-mirror-rail');
  rail.classList.toggle('is-disabled', !available); rail.setAttribute('aria-disabled', String(!available));
  for (const axis of ['x', 'y']) {
    const size = axis === 'x' ? documentData.width : documentData.height, input = $(`#draw-mirror-${axis}`);
    const value = Math.round(mirrorOrigin[axis] * size * 2) / 2;
    mirrorOrigin[axis] = value / size;
    input.max = String(size); input.value = String(value); input.disabled = playing || !available;
    $(`#draw-mirror-${axis}-label`).textContent = `${axis.toUpperCase()} ${value}`;
    input.setAttribute('aria-valuetext', `${value}ピクセル`);
  }
  $('#draw-mirror-center').disabled = playing || !available;
}
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
  const frames = animationSession?.animation?.frames?.length || 0, available = effectiveTool() !== 'select';
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
  syncMirrorRail();
  placeOverlays();
}
function markSegment(from, to, value) {
  const changed = [];
  const flags = drawingSymmetry();
  for (const matrix of symmetryTransforms(flags)) changed.push(...strokePixels(documentData, symmetryPoint(from, documentData.width, documentData.height, matrix, flags.origin), symmetryPoint(to, documentData.width, documentData.height, matrix, flags.origin), value, { trusted: true, tracker: strokeTracker, mask: selectionMask() }));
  return changed;
}
function pickColorAt(point) {
  if (point.x < 0 || point.y < 0 || point.x >= documentData.width || point.y >= documentData.height) return;
  const value = documentData.pixels[point.y * documentData.width + point.x];
  const button = document.querySelector(`.draw-color[data-color-index="${value}"]`);
  const side = strokeBinding?.side || lastInputSide || 'left';
  chooseColor(value, button, side); setTool('pen', side); toast(value < 0 ? '透明をとりました' : 'この色をとりました');
}
function selectionToolLabel(mode) { return mode === 'color' ? '同じ色選択' : '四角形選択'; }
function selectedMode(side) { return inputSettings.bindings[side]?.selectMode || 'rectangle'; }
function setSelectionMode(mode, side = 'left') {
  if (!['rectangle', 'color'].includes(mode)) return false;
  const binding = inputSettings.bindings[side];
  if (selectedMode(side) !== mode && selectionTransform) { toast('選択を変形中です。✓で確定、×で取消してから選択方式を変えてください。'); return false; }
  binding.selectMode = mode;
  syncInputControls();
  if (side === 'left' && tool === 'select') {
    const summary = $('#draw-tool-summary'), label = summary?.querySelector('[data-draw-tool-name]');
    if (label) label.textContent = selectionToolLabel(mode);
    if (summary) { summary.setAttribute('aria-label', `${selectionToolLabel(mode)}：道具を選ぶ`); summary.title = `${selectionToolLabel(mode)}：道具を選ぶ`; }
    document.querySelectorAll('.draw-select-tool-modes [data-selection-mode]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.selectionMode === mode)));
  }
  placeSelection(); return true;
}
function setTool(next, side = 'left') {
  if (!Object.hasOwn(TOOL_NAMES, next)) return;
  if (selectionTransform && next !== 'select') { toast('変形・貼付を配置中です。✓で確定、×で取消してから描画へ切り替えてください。'); return false; }
  inputSettings.bindings[side].tool = next;
  if (side === 'right') { lastInputSide = side; syncInputControls(); placeSelection(); return true; }
  if (!strokeBinding) lastInputSide = side;
  tool = next; syncDrawingSettings(); syncInputControls();
  document.querySelectorAll('[data-draw-tool]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.drawTool === next && (next !== 'select' || (node.dataset.selectionMode || 'rectangle') === selectedMode(side)))));
  const other = next !== 'pen' && next !== 'eraser';
  if (other) lastOtherTool = next;
  const summary = $('#draw-tool-summary');
  if (summary) {
    summary.querySelector('svg')?.replaceWith(createDrawingToolIcon(next));
    const label = summary.querySelector('[data-draw-tool-name]'); if (label) label.textContent = next === 'select' ? selectionToolLabel(selectedMode(side)) : TOOL_NAMES[next];
    summary.dataset.active = 'true';
    summary.setAttribute('aria-label', `${next === 'select' ? selectionToolLabel(selectedMode(side)) : TOOL_NAMES[next]}：道具を選ぶ`);
    summary.title = `${next === 'select' ? selectionToolLabel(selectedMode(side)) : TOOL_NAMES[next]}：道具を選ぶ`;
  }
  canvas.dataset.tool = next;
  placeSelection();
}
function assignDrawInput({ side, kind, value, target }) {
  if (kind === 'tool' && value === 'select' && target?.dataset.selectionMode && selectionTransform && selectedMode(side) !== target.dataset.selectionMode) { toast('選択を変形中です。✓で確定、×で取消してから選択方式を変えてください。'); return; }
  const busyActivation = colorActivationBusy.delete(target) || Boolean(strokeBinding)
    || Boolean(document.querySelector('#draw-virtual-controls button[aria-pressed="true"]'));
  const repeatColor = side === 'left' && kind === 'color' && value >= 0 && inputSettings.bindings.left.color === value;
  if (colorEdit) closeColorEditor();
  if (kind === 'color') {
    if (!Number.isInteger(value) || value < -1 || value >= documentData.palette.length) return;
    if (side === 'left') {
      if (repeatColor && !busyActivation) { openColorEditor(value, target); return; }
      const sourceElement = document.querySelector(`.draw-color[data-color-index="${value}"]`);
      chooseColor(value, sourceElement);
    } else {
      inputSettings.bindings.right.color = value;
      syncInputControls();
      toast(value < 0 ? '右ボタンに透明色を割り当てました' : `右ボタンに色${value + 1}を割り当てました`);
    }
    return;
  }
  if (!Object.hasOwn(TOOL_NAMES, value)) return;
  const assignedTool = value;
  const requestedMode = target?.dataset.selectionMode;
  if (assignedTool === 'select' && requestedMode && !setSelectionMode(requestedMode, side)) return;
  if (setTool(assignedTool, side) !== false) toast(side === 'left' ? `${TOOL_NAMES[assignedTool]}を選びました` : `右ボタンに${TOOL_NAMES[assignedTool]}を割り当てました`);
}
const drawAssignmentInput = mountDrawAssignmentInput({ root: $('#main'), onAssign: assignDrawInput });
scope.add(() => drawAssignmentInput.dispose());
function markShape(from, to) {
  if (effectiveTool() === 'line') return markSegment(from, to, selectedPixelValue());
  return drawShapePixels(documentData, from, to, selectedPixelValue(), { shape: effectiveTool().startsWith('rectangle') ? 'rectangle' : 'ellipse', filled: effectiveTool().endsWith('-fill'), symmetry: drawingSymmetry(), tracker: strokeTracker, mask: selectionMask() });
}
function markSpray(from, to) { return sprayPixels(documentData, from, to, selectedPixelValue(), { symmetry: drawingSymmetry(), tracker: strokeTracker, mask: selectionMask() }); }
function updateSelection(point, event = {}) {
  if (selectionDrag?.screenOrigin && Number.isFinite(event.clientX)) selectionDrag.maxDistance = Math.max(selectionDrag.maxDistance || 0,
    Math.hypot(event.clientX - selectionDrag.screenOrigin.x, event.clientY - selectionDrag.screenOrigin.y));
  if (selectionTransform && ['corner', 'pivot', 'move'].includes(selectionDrag?.mode)) {
    const { origin, state, handle, mode } = selectionDrag;
    const dx = point.x - origin.x, dy = point.y - origin.y;
    if (mode === 'corner') {
      if (selectionDrag.suspended) return;
      const pivot = state.pivot, bearing = Math.atan2(point.y - pivot.y, point.x - pivot.x);
      if (Math.hypot(point.x - pivot.x, point.y - pivot.y) <= selectionDrag.minRadius) { selectionDrag.suspended = true; toast('中心付近では操作を止めます。指を離し、別の角または数値で調整してください。'); return; }
      selectionDrag.angleDelta += unwrapSelectionBearing(selectionDrag.lastBearing, bearing) * 180 / Math.PI;
      selectionDrag.lastBearing = bearing;
      const next = transformSelectionFromCorner(state, origin, point, { shiftKey: event.shiftKey, altKey: event.altKey, angleDelta: selectionDrag.angleDelta, minRadius: selectionDrag.minRadius });
      if (next) selectionTransform.update(next);
    }
    else if (mode === 'pivot') selectionTransform.setPivot({ x: Math.max(-1024, Math.min(1024, state.pivot.x + dx)), y: Math.max(-1024, Math.min(1024, state.pivot.y + dy)) });
    else {
      selectionTransform.update(translateSelectionFrame(state, dx, dy));
    }
    previewSelectionTransform();
  } else if (!['outside', 'flip', 'empty'].includes(selectionDrag?.mode)) selection = selectionBounds(lineStart, point, documentData.width, documentData.height);
  placeSelection();
}
let pendingTap = null; let pendingTapPointerId = null; let pendingTapMode = null; let pendingTapMask = 1; let drawingPointerId = null; let panDrag = null; let spaceHeld = false; let fingerTap = null;
function handleCanvasPointerDown(event) {
  if (virtualCursor?.realDown(event)) return;
  if (event.button !== undefined && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  event.preventDefault(); canvas.focus({ preventScroll: true }); if (!event.virtual) canvas.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (event.pointerType === 'touch' && activePointers.size >= 2) { pendingTap = null; pendingTapPointerId = null; pendingTapMode = null; if (fingerTap && !pinchStart) { const tail = fingerTap; fingerTap = null; startPinch(); Object.assign(pinchStart, { time: tail.time, fingers: Math.max(tail.fingers, activePointers.size), moved: tail.moved }); return; } if (pinchStart) { pinchStart.fingers = Math.max(pinchStart.fingers, activePointers.size); return; } startPinch(); return; }
  // desktop: middle button, or Space held, drags the view
  if (event.button === 1 || spaceHeld) { panDrag = { x: event.clientX, y: event.clientY, panX, panY }; canvas.classList.add('is-panning'); return; }
  if (activePointers.size > 1 || drawing || pendingTap) return;
  const side = event.pointerType === 'touch' ? 'left' : event.button === 2 ? 'right' : 'left';
  const binding = { ...inputSettings.bindings[side], side, mask: side === 'right' ? 2 : 1 };
  const inputTool = binding.tool;
  if (inputTool !== 'select' && selectionTransform) { activePointers.delete(event.pointerId); toast('✓で確定、×で取消してから描画できます。'); return; }
  if (inputTool === 'picker' && selection && !selectionMember(pointFromEvent(event))) { activePointers.delete(event.pointerId); return; }
  if (inputTool !== 'picker' && inputTool !== 'select' && animationSession.locked) { toast('レイヤーの鍵を外すと描けます。'); return; }
  if (inputTool !== 'picker' && !canEdit()) return;
  const touchedPoint = pointFromEvent(event);
  const selectionHandle = inputTool === 'select' && selection ? selectionHandleAtEvent(event) : null;
  if (inputTool === 'select' && selectedMode(side) === 'color' && selectionTransform && !selectionHandle && !event.altKey) {
    activePointers.delete(event.pointerId); toast('選択を変形中です。角・中心の操作を続けるか、✓／×で確定・取消してください。'); return;
  }
  if (inputTool === 'select' && selectedMode(side) === 'color' && !selectionTransform && !selectionHandle && !event.altKey) {
    lastInputSide = side; syncDrawingSettings(); pendingTap = touchedPoint; pendingTapPointerId = event.pointerId; pendingTapMode = 'color'; pendingTapMask = binding.mask;
    return;
  }
  if (inputTool !== 'picker' && inputTool !== 'fill' && inputTool !== 'select') {
    const value = inputTool === 'eraser' ? -1 : binding.color; const used = new Set(documentData.pixels);
    if (!used.has(value) && usedColorCount() >= 32) {
      toast('このキャンバスは最大32色です。色を置き換えるか、使わない色を整理してください。');
      return;
    }
  }
  lastInputSide = side; strokeBinding = binding; syncDrawingSettings();
  strokeWasSaved = saved;
  drawing = true; drawingPointerId = event.pointerId; previousPoint = touchedPoint;
  updateControls();
  if (inputTool === 'picker' || inputTool === 'fill') { pendingTap = touchedPoint; pendingTapPointerId = event.pointerId; pendingTapMode = 'tap'; drawing = false; drawingPointerId = null; previousPoint = null; selectionPanel.sync(); return; }
  if (inputTool === 'select') {
    lineStart = touchedPoint;
    const handle = selectionHandleAtEvent(event);
    const inside = selectionTransform ? selectionContains(selectionFrame(), exactSelectionPoint(event)) : selectionMember(touchedPoint);
    const hadTransform = Boolean(selectionTransform);
    const origin = exactSelectionPoint(event), screenOrigin = { x: event.clientX, y: event.clientY };
    if (handle?.startsWith('flip')) {
      selectionDrag = { mode: 'flip', handle, origin, screenOrigin, pointerType: event.pointerType };
    } else if ((handle || inside) && !animationSession.locked && startSelectionTransform()) {
      const state = selectionTransform.state, r = canvas.getBoundingClientRect(), minRadius = 6 / Math.min(r.width / canvas.width, r.height / canvas.height);
      const corner = handle && handle !== 'pivot';
      if (corner && Math.hypot(origin.x - state.pivot.x, origin.y - state.pivot.y) <= minRadius) {
        drawing = false; drawingPointerId = null; strokeBinding = null; if (!hadTransform) cancelSelectionTransform(); placeSelection(); toast('中心に近い角です。別の角、中心の移動、または数値補助で調整してください。'); return;
      }
      selectionDrag = { mode: handle === 'pivot' ? 'pivot' : corner ? 'corner' : 'move', handle, origin, screenOrigin, bounds: { ...selection }, state,
        createdTransaction: !hadTransform, minRadius, lastBearing: Math.atan2(origin.y - state.pivot.y, origin.x - state.pivot.x), angleDelta: 0 };
    } else if (inside) {
      selectionDrag = { mode: 'empty' };
    } else if (selection) {
      selectionDrag = { mode: 'outside', origin, screenOrigin, pointerType: event.pointerType, bounds: selection, transaction: selectionTransform };
    } else {
      selectionDrag = { mode: 'select', bounds: null };
      selection = selectionBounds(touchedPoint, touchedPoint, documentData.width, documentData.height); placeSelection();
    }
    placeSelection(); return;
  }
  strokeTracker = beginDrawStroke(documentData, { trusted: true });
  if (SHAPE_TOOLS.has(inputTool)) { lineStart = touchedPoint; const changed = markShape(lineStart, touchedPoint); saved = false; paint(changed); }
  else { const changed = inputTool === 'spray' ? markSpray(previousPoint, previousPoint) : markSegment(previousPoint, previousPoint, selectedPixelValue()); saved = false; paint(changed); }
}
canvas.addEventListener('pointerdown', handleCanvasPointerDown);
// The controls extend outside the canvas. Their expanded hit areas still
// belong to the viewport and use the same captured-pointer selection path.
scope.listen($('.draw-board'), 'pointerdown', event => {
  if (event.target === canvas || event.virtual || !selection) return;
  const side = event.button === 2 ? 'right' : 'left';
  if (inputSettings.bindings[side].tool === 'select') handleCanvasPointerDown(event);
});
scope.listen($('.draw-board'), 'pointermove', event => {
  if (event.target !== canvas && !drawing && !virtualCursor?.enabled) selectionControls.hover(selectionHandleAtEvent(event) || '');
});
function applyDrawPoint(point, event) {
  if (!drawing || !previousPoint || effectiveTool() === 'fill' || effectiveTool() === 'picker') return;
  if (effectiveTool() === 'select') { updateSelection(selectionDrag?.mode === 'select' || !event ? point : exactSelectionPoint(event), event); previousPoint = point; return; }
  if (point.x === previousPoint.x && point.y === previousPoint.y) return;
  if (SHAPE_TOOLS.has(effectiveTool())) {
    cancelDrawStroke(documentData, strokeTracker); strokeTracker = beginDrawStroke(documentData, { trusted: true });
    markShape(lineStart, point); previousPoint = point; saved = false; paint(); return;
  }
  const changed = effectiveTool() === 'spray' ? markSpray(previousPoint, point) : markSegment(previousPoint, point, selectedPixelValue());
  previousPoint = point; saved = false; paint(changed);
}
function applyPointerMoveSamples(event) {
  if (!drawing || event.pointerId !== drawingPointerId) return;
  const coalescedTool = effectiveTool() === 'pen' || effectiveTool() === 'eraser' || effectiveTool() === 'spray';
  if (coalescedTool && typeof event.getCoalescedEvents === 'function') {
    let samples = [];
    try { samples = event.getCoalescedEvents() || []; } catch { samples = []; }
    for (const sample of samples) applyDrawPoint(pointFromEvent(sample));
  }
  // The dispatched event carries the latest point even on engines whose coalesced list omits it.
  applyDrawPoint(pointFromEvent(event), event);
}
function handleCanvasPointerMove(event) {
  if (virtualCursor?.realMove(event)) return;
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
  if (pendingTap && event.pointerId === pendingTapPointerId && event.pointerType === 'mouse' && (event.buttons & (strokeBinding?.mask || pendingTapMask)) === 0) { releasePointer({ ...event, type: 'pointerup', pointerId: event.pointerId, pointerType: event.pointerType, clientX: event.clientX, clientY: event.clientY, buttons: event.buttons }); return; }
  if (drawing && event.pointerId !== drawingPointerId) return;
  showCursor(event);
  const mousePrimaryReleased = drawing && event.pointerId === drawingPointerId
    && event.pointerType === 'mouse' && typeof event.buttons === 'number' && (event.buttons & (strokeBinding?.mask || 1)) === 0;
  applyPointerMoveSamples(event);
  if (mousePrimaryReleased && drawing && event.pointerId === drawingPointerId) {
    if (event.buttons === 0) activePointers.delete(event.pointerId);
    endStroke(false);
  }
}
canvas.addEventListener('pointermove', handleCanvasPointerMove);
function endStroke(cancel = false, releaseEvent = null) {
  const endedSelectionDrag = selectionDrag;
  const hadBinding = Boolean(strokeBinding);
  if (drawingPointerId === -7106) { activePointers.delete(drawingPointerId); virtualCursor?.resetPress(); }
  if (drawing && strokeTracker) {
    if (cancel) { cancelDrawStroke(documentData, strokeTracker); saved = strokeWasSaved; }
    else if (commitDrawStroke(documentData, history, strokeTracker)) { trackDrawStart(); saved = false; }
    strokeTracker = null; strokeStartPixels = null; paint();
  }
  if (cancel && selectionDrag) {
    if (selectionDrag.state && selectionTransform) { selectionTransform.update(selectionDrag.state); previewSelectionTransform(); }
    else if (Object.hasOwn(selectionDrag, 'bounds')) selection = selectionDrag.bounds;
  }
  const selected = drawing && effectiveTool() === 'select' && selectionDrag?.mode === 'select' && !cancel;
  drawing = false; drawingPointerId = null; previousPoint = null; lineStart = null; selectionDrag = null; strokeBinding = null; placeSelection(); if (hadBinding) syncDrawingSettings();
  if (selected && selection) { selectionPanel.setMode('select'); toast('四隅で拡縮＋回転、二重リングで中心、↔ / ↕で反転。内側で移動、外タップで確定・解除。'); }
  if (endedSelectionDrag?.createdTransaction && selectionTransform && (cancel || sameSelectionFrame(endedSelectionDrag.state, selectionTransform.state))) cancelSelectionTransform();
  if (!cancel && releaseEvent?.type === 'pointerup' && endedSelectionDrag) finishSelectionRelease(endedSelectionDrag, releaseEvent);
  updateControls();
}
function sameSelectionFrame(a, b) {
  return ['x', 'y', 'width', 'height', 'angle'].every(k => Math.abs(a[k] - b[k]) < 1e-7) && Boolean(a.flipX) === Boolean(b.flipX) && Boolean(a.flipY) === Boolean(b.flipY)
    && Math.hypot(a.pivot.x - b.pivot.x, a.pivot.y - b.pivot.y) < 1e-7;
}
function finishSelectionRelease(drag, event) {
  const distance = Math.max(drag.maxDistance || 0, Math.hypot(event.clientX - drag.screenOrigin?.x, event.clientY - drag.screenOrigin?.y)), threshold = drag.pointerType === 'touch' ? 10 : 6;
  if (drag.mode === 'flip') {
    if (distance <= threshold && selectionHandleAtEvent(event) === drag.handle) runSelectionAction(drag.handle);
    return;
  }
  if (drag.mode !== 'outside' || selectionTransform !== drag.transaction) return;
  if (distance <= threshold) {
    if (selectionTransform) confirmSelectionTransform();
    else { clearSelection(); toast('選択を解除しました。画素は変更していません。'); }
    return;
  }
  if (selectionTransform && !confirmSelectionTransform()) return;
  const next = selectionBounds(drag.origin, exactSelectionPoint(event), documentData.width, documentData.height);
  if (next) { selection = next; selectionPanel.setMode('select'); placeSelection(); }
}
function applyTap(point) {
  if (effectiveTool() === 'picker') { pickColorAt(point); return; }
  commitChange((next) => symmetryPoints(point, next.width, next.height, drawingSymmetry()).flatMap(p => [...floodFill(next, p.x, p.y, selectedPixelValue(), { mask: selectionMask() })]));
}
function releasePointer(event) {
  if (virtualCursor?.realRelease(event)) return;
  const ownsMouseStroke = drawing && event.pointerType === 'mouse' && event.pointerId === drawingPointerId;
  if (event.type === 'pointerup' && event.pointerType === 'mouse' && strokeBinding && typeof event.buttons === 'number' && (event.buttons & strokeBinding.mask)) return;
  if (event.type === 'lostpointercapture' && ownsMouseStroke && activePointers.has(event.pointerId)) {
    // A mouse capture loss ends the gesture at its last accepted sample. Do not draw the
    // capture-loss event's coordinates, which may be outside the canvas or stale.
    activePointers.delete(event.pointerId);
    endStroke(effectiveTool() === 'select');
    return;
  }
  if (event.type === 'pointerup' && drawing && event.pointerId === drawingPointerId && activePointers.has(event.pointerId)) {
    applyDrawPoint(pointFromEvent(event), event);
  }
  const wasActive = activePointers.delete(event.pointerId);
  // A late lostpointercapture or a non-owning pointer must not finish a newer gesture.
  if (!wasActive) return;
  if (panDrag) { if (!activePointers.size) { panDrag = null; canvas.classList.remove('is-panning'); } return; }
  if (pendingTap && event.pointerId === pendingTapPointerId) {
    const tap = pendingTap, mode = pendingTapMode, side = lastInputSide; pendingTap = null; pendingTapPointerId = null; pendingTapMode = null;
    if (event.type === 'pointerup' && !pinchStart && activePointers.size === 0) {
      if (mode === 'color') {
        const selected = selectDrawColorMask(documentData, tap);
        if (selected) { lastInputSide = side; selection = selected; selectionDrag = null; selectionPanel?.setMode('select'); placeSelection(); syncDrawingSettings(); toast(`${selectionToolLabel('color')}：${selected.width}×${selected.height}の範囲を選びました。`); }
      } else applyTap(tap);
    }
    strokeBinding = null; syncDrawingSettings(); updateControls(); return;
  }
  if (!activePointers.size) { pendingTap = null; pendingTapPointerId = null; pendingTapMode = null; }
  // fingers rarely lift at the same moment: remember the gesture until the last one is up, then a quick,
  // still two-finger tap is undo and a three-finger tap is redo
  if (!pinchStart && fingerTap) {
    if (activePointers.size === 0) { const gesture = fingerTap; fingerTap = null; if (!gesture.selectionOnly && performance.now() - gesture.time < 360 && gesture.moved < 12) { if (gesture.fingers >= 3) redo(); else undo(); } }
    return;
  }
  if (pinchStart) {
    const gesture = pinchStart; pinchStart = null;
    if (activePointers.size >= 1 && activePointers.size < 2) fingerTap = gesture;
    else if (activePointers.size === 0 && !gesture.selectionOnly && performance.now() - gesture.time < 360 && gesture.moved < 12) { if (gesture.fingers >= 3) redo(); else undo(); }
    if (activePointers.size >= 2) { startPinch(); Object.assign(pinchStart, { time: gesture.time, fingers: gesture.fingers, moved: gesture.moved }); }
    else if (activePointers.size === 0) { zoom = Math.max(1, zoom); if (zoom === 1) panX = panY = 0; updateCanvasView(); }
    drawing = false; drawingPointerId = null; previousPoint = null; strokeStartPixels = null; return;
  }
  if (drawing && event.pointerId !== drawingPointerId) return;
  const viewport = $('.draw-board').getBoundingClientRect();
  const outsideViewport = selectionDrag && (event.clientX < viewport.left || event.clientX >= viewport.right || event.clientY < viewport.top || event.clientY >= viewport.bottom);
  endStroke(event.type !== 'pointerup' || Boolean(outsideViewport), event);
}
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);
scope.listen(document, 'pointerup', (event) => { if (event.pointerType === 'mouse') releasePointer(event); });
scope.listen($('.draw-board'), 'contextmenu', event => event.preventDefault());
scope.listen($('#draw-animation-play'), 'click', event => {
  if (cameraOpening) {
    event.preventDefault(); event.stopImmediatePropagation();
    return;
  }
  toggleAnimation();
});
for (const axis of ['x', 'y']) scope.listen($(`#draw-mirror-${axis}`), 'input', event => {
  const inputValue = Number(event.target.value);
  virtualCursor?.release(); endStroke();
  const size = axis === 'x' ? documentData.width : documentData.height;
  mirrorOrigin[axis] = Math.max(0, Math.min(1, inputValue / size));
  syncMirrorRail(); placeOverlays(); hideCursors(); pxdBridge?.markDirty();
});
scope.listen($('#draw-mirror-center'), 'click', () => {
  virtualCursor?.release(); endStroke(); mirrorOrigin = { x: .5, y: .5 }; syncMirrorRail(); placeOverlays(); hideCursors(); pxdBridge?.markDirty();
});
let virtualGestureBase = null;
virtualCursor = mountDrawVirtualCursor({ scope, board: $('.draw-board'), canvas, toggle: $('#draw-virtual-toggle'), controls: $('#draw-virtual-controls'),
  isBlocked: () => $('#main').inert || $('#main').hidden || document.body.hasAttribute('data-tool-result-open')
    || Boolean(document.querySelector('dialog[open], #draw-tool-picker[open], #draw-settings-picker[open], #draw-output[open], .draw-import[open], .animation-controls__workspace-panel:not([hidden]), #draw-color-editor:not([hidden])')),
  onDown: handleCanvasPointerDown, onMove: handleCanvasPointerMove, onRelease: releasePointer, onStateChange: updateControls,
  allowViewportCursor: () => Boolean(selection && (inputSettings.bindings.left.tool === 'select' || inputSettings.bindings.right.tool === 'select')),
  onHover: showCursor,
  onViewportGestureStart: gesture => { virtualGestureBase = { ...gesture, zoom, panX, panY }; hideCursors(); },
  onViewportGestureMove: gesture => {
    if (!virtualGestureBase) return;
    const base = virtualGestureBase;
    zoomAt(base.zoom * gesture.distance / Math.max(1, base.distance), base.centerX, base.centerY, base);
    panX += gesture.centerX - base.centerX; panY += gesture.centerY - base.centerY; clampPan(); updateCanvasView();
  },
  onViewportGestureEnd: () => { virtualGestureBase = null; },
  getStep: () => { const r = canvas.getBoundingClientRect(); return { x: r.width / documentData.width, y: r.height / documentData.height }; }
});

[16, 32, 64, 128, 256].forEach((size) => { const option = document.createElement('option'); option.value = String(size); option.textContent = `${size}px`; sizeSelect.append(option); });
sizeSelect.value = String(DRAW_SIZE);
function resizeCanvas(width, height) {
  if (selectionTransform) { toast('✓で確定、×で取消してからキャンバスを変更できます。'); return false; }
  if (![width, height].every(value => Number.isInteger(value) && value >= 1 && value <= 256)) {
    status.textContent = '幅と高さは1〜256pxの整数で指定してください。'; return false;
  }
  if (width === documentData.width && height === documentData.height) { syncSizeButtons(true); return true; }
  try {
    if (!canEdit({ ...documentData, width, height })) return false;
    cancelDrawingInput(); closeColorEditor(); sizeWasChosen = true;
    resizeViewStates.set(animationSession.animation, resizeViewState());
    const view = translatedResizeView(width, height), cropped = width < documentData.width || height < documentData.height;
    const next = resizeAnimation(animationSession.animation, width, height, { anchor: 'center' });
    resizeViewStates.set(next, view);
    installAnimationDocument(animationSession.apply(next));
    syncSizeButtons(true); pxdBridge?.markDirty();
    status.textContent = `${width}×${height}にしました。${cropped ? '外側を切り取りました。戻すで元に戻せます。' : '絵の1pxはそのまま、余白を広げました。'}`; return true;
  } catch (error) { status.textContent = `サイズを変更できませんでした：${error.message}`; return false; }
}
sizeSelect.addEventListener('change', () => {
  const size = Number(sizeSelect.value), factor = size / Math.max(documentData.width, documentData.height);
  if (!resizeCanvas(Math.max(1, Math.round(documentData.width * factor)), Math.max(1, Math.round(documentData.height * factor)))) sizeSelect.value = String(Math.max(documentData.width, documentData.height));
});
renderPalette();
$('#draw-tool-picker')?.addEventListener('toggle', placeToolMenu);
// Native toggle is queued; prepare the fixed panel before the opening frame.
$('#draw-tool-summary')?.addEventListener('click', placeToolMenu);
scope.listen(window, 'resize', placeToolMenu);
// ---- drawing settings ----
symmetryButtons.forEach(button => button.addEventListener('click', () => {
  if (tool === 'select') return;
  virtualCursor?.release(); endStroke();
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
  const r = summary.getBoundingClientRect(), header = Math.max(document.querySelector('body > .site-header')?.getBoundingClientRect().bottom || 64, document.querySelector('.project-bar')?.getBoundingClientRect().bottom || 0);
  const navigationTop = document.querySelector('.app-tabs')?.getBoundingClientRect().top || innerHeight;
  const width = Math.min(260, innerWidth - 24), bounds = settingsPicker.closest('[data-editor-header-control]') ? r : controls.getBoundingClientRect();
  const belowAnchor = r.bottom;
  const above = Math.max(44, r.top - header - 20), below = Math.max(0, navigationTop - belowAnchor - 20);
  const openBelow = below > above;
  const available = Math.max(80, navigationTop - header - 16), fallback = Math.max(above, below) < Math.min(180, available);
  panel.style.left = `${Math.max(12, Math.min(innerWidth - width - 12, bounds.left + (bounds.width - width) / 2))}px`;
  panel.style.bottom = fallback || openBelow ? 'auto' : `${Math.max(12, innerHeight - r.top + 8)}px`;
  panel.style.top = fallback ? `${header + 8}px` : openBelow ? `${belowAnchor + 8}px` : 'auto';
  panel.style.maxHeight = `${Math.min(440, fallback ? available : openBelow ? below : above)}px`;
}
settingsPicker?.addEventListener('toggle', placeSettingsPanel);
settingsSummary?.addEventListener('click', placeSettingsPanel);
scope.listen(window, 'resize', placeSettingsPanel);
scope.listen(window, 'resize', placeOverlays);
// Keyboard activation of the animation workspace does not produce the outside-pointer event.
scope.listen($('#draw-animation-controls'), 'click', (event) => {
  if (!event.target.closest?.('[data-action="toggle-frames"]') || !settingsPicker?.open) return;
  settingsPicker.open = false;
});
function syncInputControls() {
  for (const side of ['left', 'right']) {
    const binding = inputSettings.bindings[side];
    if (binding.color >= documentData.palette.length || binding.color < -1) binding.color = Math.min(side === 'left' ? 2 : 4, documentData.palette.length - 1);
    const toolName = binding.tool === 'select' ? selectionToolLabel(selectedMode(side)) : TOOL_NAMES[binding.tool];
    const name = `${side === 'left' ? '左' : '右'}：${toolName}`;
    const icon = $(`[data-button-tool-icon="${side}"]`); if (icon && icon.dataset.tool !== binding.tool) { icon.replaceChildren(createDrawingToolIcon(binding.tool)); icon.dataset.tool = binding.tool; }
    const swatch = $(`[data-button-swatch="${side}"]`); if (swatch) { swatch.style.setProperty('--draw-button-swatch-color', binding.color < 0 ? 'transparent' : documentData.palette[binding.color]); swatch.classList.toggle('is-clear', binding.color < 0 || binding.tool === 'eraser'); }
    const label = $(`[data-button-label="${side}"]`); if (label) label.textContent = side === 'left' ? '左' : '右';
    const button = $(`[data-virtual-${side}]`); if (button) { button.setAttribute('aria-label', `${name}。${binding.tool === 'eraser' || binding.color < 0 ? '透明色' : documentData.palette[binding.color]}。押しながら描画面で動かすと描画します。`); button.title = name; button.dataset.tool = binding.tool; button.dataset.colorIndex = String(binding.color); }
  }
  const placement = $('#draw-controls-side-toggle'), onLeft = inputSettings.controlsSide === 'left';
  if (placement) {
    const label = `操作欄は${onLeft ? '左' : '右'}。${onLeft ? '右' : '左'}に移動`;
    placement.setAttribute('aria-pressed', String(onLeft)); placement.setAttribute('aria-label', label); placement.title = label;
    placement.dataset.side = inputSettings.controlsSide;
    placement.querySelector('path').setAttribute('d', onLeft ? 'M9 4v16' : 'M15 4v16');
    placement.querySelector('[data-controls-side-highlight]').setAttribute('x', onLeft ? '5' : '16');
  }
  const serialized = JSON.stringify(serializeDrawInputSettings(inputSettings, documentData.palette));
  if (serialized !== lastInputSettings) { try { inputStorage?.setItem(DRAW_INPUT_SETTINGS_KEY, serialized); } catch { /* Continue with in-memory settings. */ } lastInputSettings = serialized; }
}
function applyControlsPlacement() {
  document.body.dataset.drawControlsSide = inputSettings.controlsSide;
  const viewport = $('.draw-viewport'), dock = $('.draw-control-dock');
  const horizontal = matchMedia('(min-width: 900px), (orientation: landscape) and (min-width: 560px)').matches;
  // Keep DOM/tab order aligned with visible placement. Portrait stays canvas then controls.
  if (horizontal && inputSettings.controlsSide === 'left') viewport.before(dock);
  else dock.before(viewport);
  requestAnimationFrame(() => { placeOverlays(); placeToolMenu(); placeSettingsPanel(); });
}
function setControlsSide(side) {
  cancelDrawingInput(); inputSettings.controlsSide = side; syncInputControls(); applyControlsPlacement(); return true;
}
scope.listen($('#draw-controls-side-toggle'), 'click', () => setControlsSide(inputSettings.controlsSide === 'left' ? 'right' : 'left'));
scope.listen($('#draw-input-reset'), 'click', () => {
  cancelDrawingInput(); closeColorEditor(); inputSettings = normalizeDrawInputSettings(null, documentData.palette);
  selectedColor = inputSettings.bindings.left.color; setTool(inputSettings.bindings.left.tool); renderPalette(); showCurrentColor(); applyControlsPlacement();
});
scope.listen(window, 'resize', applyControlsPlacement);
applyControlsPlacement();
syncDrawingSettings(); setTool(tool);
// Canvas settings keep the current picture until a valid size is applied.
const sizeButtons = [...document.querySelectorAll('[data-draw-size]')];
const widthInput = $('#draw-canvas-width'), heightInput = $('#draw-canvas-height'), ratioInput = $('#draw-canvas-ratio');
const sizeForm = $('#draw-canvas-form'), sizeApply = $('#draw-canvas-apply');
const canvasPicker = $('.draw-import'); let sizeInputDimensions = '';
scope.listen(canvasPicker.querySelector('summary'), 'click', () => { if (!canvasPicker.open) syncSizeButtons(true); });
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
scope.listen(canvasPicker, 'toggle', () => { if (canvasPicker.open) syncSizeButtons(); });
for (const button of sizeButtons) scope.listen(button, 'click', () => {
  sizeSelect.value = button.dataset.drawSize; sizeSelect.dispatchEvent(new Event('change')); canvasSettingsPanel.position();
});
syncSizeButtons(true);
function afterHistoryStep() {
  saved = false; const step = history.lastStep;
  if (step?.paletteChanged) { renderPalette(); showCurrentColor(); paint(); } else paint(step?.indices || null);
}
function undo() { if (drawingInputBusy()) return false; if (selectionTransform) { cancelDrawingInput(); return cancelSelectionTransform(); } if (!canEdit()) return false; closeColorEditor(); const doc = animationSession.undo(); if (!doc) return false; installAnimationDocument(doc); pxdBridge?.markDirty(); return true; }
function redo() { if (selectionTransform || drawingInputBusy() || !canEdit()) return false; closeColorEditor(); const doc = animationSession.redo(); if (!doc) return false; installAnimationDocument(doc); pxdBridge?.markDirty(); return true; }
function resetDrawingInput(cancel = true) {
  virtualCursor?.cancelInputs(cancel); if (!cancel && pendingTap && pendingTapMode !== 'color') applyTap(pendingTap);
  pendingTap = null; pendingTapPointerId = null; pendingTapMode = null; endStroke(cancel);
  activePointers.clear(); pinchStart = null; fingerTap = null; panDrag = null; spaceHeld = false;
  canvas.classList.remove('is-panning', 'is-grab'); hideCursors();
  updateControls();
}
function cancelDrawingInput() { resetDrawingInput(true); }
scope.listen($('#draw-virtual-toggle'), 'click', () => resetDrawingInput(false));
scope.listen(window, 'blur', () => { cancelDrawingInput(); cancelSelectionTransform(); selectionPanel?.hide(); });
scope.listen(window, 'pagehide', () => { cancelDrawingInput(); cancelSelectionTransform(); selectionPanel?.hide(); });
scope.listen(document, 'visibilitychange', () => { if (document.hidden) { cancelDrawingInput(); cancelSelectionTransform(); selectionPanel?.hide(); } });
// a tap steps once; holding the button keeps stepping
for (const [id, step] of [['#draw-undo', undo], ['#draw-redo', redo]]) {
  const button = $(id); let timer = 0; let repeated = false;
  const stop = () => { clearTimeout(timer); timer = 0; };
  button.addEventListener('pointerdown', () => { repeated = false; stop(); if (button.disabled) return; timer = setTimeout(function again() { if (button.disabled) { stop(); return; } repeated = true; if (step()) timer = setTimeout(again, 90); }, 420); });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) button.addEventListener(type, stop);
  button.addEventListener('click', () => { if (repeated) { repeated = false; return; } step(); });
}
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
    const { decodeDrawImageFile } = await import('./draw-import.mjs?rev=20260928-pixel-roundtrip-1');
    if (scope.disposed || !loadGate.isCurrent(ticket)) return;
    const image = await decodeDrawImageFile(file);
    if (scope.disposed || !loadGate.isCurrent(ticket)) return; // a newer open or import has replaced this one
    const original = { width: image.width, height: image.height, rgba: new Uint8Array(image.data) };
    const prepared = prepareSharedCanvasImage(original, { passActive: true });
    const next = imageToDrawDocument(prepared.image);
    if (prepared.changed) {
      const { confirmPxdConversion } = await import('./pxd-ui.mjs?rev=20261006-header-controls-1');
      if (scope.disposed || !loadGate.isCurrent(ticket)) return;
      if (!await confirmPxdConversion({ image: original, document: next, title: '読み込む絵を確認', applyLabel: 'この絵を使う', message: `${next.width}×${next.height}px・${prepared.colorCount}色に合わせます。元の画像ファイルは変更しません。` })) return;
    }
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
  const bridge = pxdBridge; let project = bridge?.currentProject; let held = bridge?.heldProject;
  const unchangedSource = () => !scope.disposed && documentData === original && source === originalSource && pxdBridge === bridge
    && bridge?.currentProject?.projectId === project?.projectId && bridge?.heldProject?.projectId === held?.projectId;
  const image = readOnlyImage ? { width: readOnlyImage.width, height: readOnlyImage.height, data: new Uint8Array(readOnlyImage.rgba) } : { width: original.width, height: original.height, data: documentRgba(composeAnimationFrame(animationSession.animation, animationSession.frameId)) };
  try {
    await bridge?.assertCanSave?.();
    if (!unchangedSource()) return;
    const { blob, width, height, scale } = await enlargedPng(image);
    if (!unchangedSource()) return;
    interactionEffects.exportImage({ from: canvas, to: $('#draw-export'), image: canvas });
    const mediaSources = [{ id: 'current-image', label: '現在のコマ', kind: 'rgba-frames', frames: [{ width: image.width, height: image.height, data: new Uint8Array(image.data) }] }];
    const animation = animationSession.animation;
    if (!readOnlyImage && animation.frames.length > 1) {
      const animationFrames = animation.frames.map((frame) => {
        const doc = composeAnimationFrame(animation, frame.id);
        return { width: doc.width, height: doc.height, data: new Uint8Array(documentRgba(doc)), delayMs: Math.max(20, frame.durationMs) };
      });
      if (animationFrames[0].width * animationFrames[0].height * animationFrames.length <= 5_000_000) {
        mediaSources.push({ id: 'animation', label: 'アニメーション', kind: 'rgba-frames', frames: animationFrames, loopCount: 0 });
      }
    }
    const timelapseEvents = timelapse.snapshot();
    if (timelapseEvents.length > 1) {
      const timelapseFrames = selectDrawTimelapseFrames(timelapseEvents, { detail: false, fps: TIMELAPSE_FPS })
        .map((frame) => ({ ...frame, data: new Uint8Array(frame.data), delayMs: 100 }));
      if (timelapseFrames[0].width * timelapseFrames[0].height * timelapseFrames.length <= 8_000_000) {
        mediaSources.push({ id: 'drawing-process', label: '描いた過程（3秒）', kind: 'rgba-frames', frames: timelapseFrames, loopCount: 0 });
      }
    }
    const staged = await sendToolOutputAfterSaving({ blob, filename: `pixieed-drawing-${image.width}x${image.height}@${width}x${height}.png`, returnUrl: currentToolReturnUrl, title: '作品の出力を確認', source: 'かんたんドット', metadata: { width: image.width, height: image.height, defaultScale: scale }, mediaSources }, bridge, unchangedSource);
    if (staged.ok) return;
    if (staged.reason === 'source_changed') return;
    const result = await saveFile(blob, `pixieed-drawing-${image.width}x${image.height}@${width}x${height}.png`);
    if (result !== 'cancelled' && unchangedSource()) {
      const shared = result === 'shared';
      status.textContent = staged.reason === 'project_save_failed'
        ? `編集内容を保存できなかったため、この画面に残りました。PNGの${shared ? '共有画面への受け渡し' : 'ダウンロード'}を開始しました。編集内容は保存し直してください。`
        : shared ? `${width}×${height}pxのPNGを共有画面に渡しました。` : `${width}×${height}pxのPNGのダウンロードを開始しました。`;
      if (readOnlyImage || original.pixels.some((pixel) => pixel >= 0)) resultView.show({ title: shared ? 'PNGを共有画面に渡しました' : 'PNGのダウンロードを開始しました', detail: `${width}×${height}px`, preview: canvas });
    }
  } catch (error) { if (unchangedSource()) status.textContent = `PNGを書き出せませんでした：${error.message}`; }
});
// ---- time-lapse: export a bounded replay at regular or detailed quality ----
function recordedHistory(target) {
  timelapse.reset(documentData);
  return new Proxy(target, { get(object, key) {
    const value = Reflect.get(object, key, object);
    if (key === 'commit' || key === 'commitPatch') return (...args) => {
      const beforeAnimation = animationSession.animation, beforeSelection = selection;
      const beforePixels = documentData.pixels; const beforePalette = documentData.palette;
      const done = value.apply(object, args);
      if (done) {
        if (preparedSelectionCommit) preparedSelectionCommit(); else animationSession.commitDocument(documentData);
        if (beforeSelection) { selectionViewStates.set(beforeAnimation, { ...beforeSelection }); selectionViewStates.set(animationSession.animation, { ...beforeSelection }); }
        animationControls?.refresh();
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
    && job.bridge?.currentProject?.projectId === job.currentProject?.projectId
    && job.bridge?.heldProject?.projectId === job.heldProject?.projectId;
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
    const { encodeAnimatedGif } = await import('../animated-export.mjs?v=20261001-animation-1');
    if (!timelapseJobIsCurrent(job)) return;
    const { bytes, width, height, scale } = await encodeAnimatedGif(frames, { delayMs: 1000 / TIMELAPSE_FPS, signal: job.controller.signal, longEdge: 1024, maxPixels: 80e6 });
    if (!timelapseJobIsCurrent(job)) return;
    const blob = new Blob([bytes], { type: 'image/gif' });
    const durationSeconds = frames.reduce((total, frame) => total + (frame.delayMs || 1000 / TIMELAPSE_FPS), 0) / 1000;
    const staged = await sendToolOutputAfterSaving({ blob, filename: `pixieed-drawing-timelapse-${width}x${height}.gif`, returnUrl: currentToolReturnUrl, title: '描いた過程を確認', source: 'かんたんドット', metadata: { width: frames[0].width, height: frames[0].height, defaultScale: scale, durationSeconds, frameCount: frames.length }, mediaSource: { kind: 'gif-frames', frames, delayMs: 1000 / TIMELAPSE_FPS, loopCount: 0 } }, job.bridge, () => timelapseJobIsCurrent(job));
    if (staged.ok) return;
    if (staged.reason === 'source_changed') return;
    const result = await saveFile(blob, `pixieed-drawing-timelapse-${width}x${height}.gif`);
    if (result !== 'cancelled' && timelapseJobIsCurrent(job)) {
      const shared = result === 'shared';
      toast(staged.reason === 'project_save_failed'
        ? `編集内容を保存できなかったため、この画面に残りました。GIFの${shared ? '共有画面への受け渡し' : 'ダウンロード'}を開始しました。編集内容は保存し直してください。`
        : shared ? 'GIFを共有画面に渡しました。' : 'GIFのダウンロードを開始しました。');
      if (job.document.pixels.some((pixel) => pixel >= 0)) resultView.show({ title: shared ? 'GIFを共有画面に渡しました' : 'GIFのダウンロードを開始しました', detail: `${width}×${height}px`, preview: canvas });
    }
  } catch (error) {
    if (timelapseJobIsCurrent(job) && error?.name !== 'AbortError') status.textContent = `GIFを作れませんでした：${error.message}`;
  } finally {
    if (activeTimelapseJob === job) activeTimelapseJob = null;
    timelapseExporting = false;
    basicButton.disabled = false; detailButton.disabled = false;
  }
}
$('#draw-timelapse')?.addEventListener('click', () => exportTimelapse(false));
$('#draw-animation-export')?.addEventListener('click', () => exportAnimation());
let animationExporting = false, animationExportController = null;
async function exportAnimation() {
  if (animationExporting || readOnlyImage || scope.disposed) return;
  endStroke(); closeColorEditor(); stopAnimation(); editorUi.closePanels();
  const timeline = animationSession.animation; const exportDocument = documentData; const exportSource = source; const exportBridge = pxdBridge; animationExporting = true;
  animationExportController = new AbortController(); const controller = animationExportController;
  try {
    await pxdBridge?.assertCanSave?.();
    const frames = [];
    for (const frame of timeline.frames) {
      if (scope.disposed || controller.signal.aborted) return;
      const doc = composeAnimationFrame(timeline, frame.id);
      frames.push({ width: doc.width, height: doc.height, data: documentRgba(doc), delayMs: Math.max(20, frame.durationMs) });
    }
    const { encodeAnimatedGif } = await import('../animated-export.mjs?v=20261001-animation-1');
    if (scope.disposed || controller.signal.aborted) return;
    const result = await encodeAnimatedGif(frames, { longEdge: 1024, maxPixels: 80e6, maxInputPixels: 128 * 256 * 256, signal: controller.signal });
    if (scope.disposed || controller.signal.aborted) return;
    const blob = new Blob([result.bytes], { type: 'image/gif' });
    const durationSeconds = frames.reduce((total, frame) => total + frame.delayMs, 0) / 1000;
    if (scope.disposed || documentData !== exportDocument || source !== exportSource || pxdBridge !== exportBridge || animationSession.animation !== timeline) return;
    const staged = await sendToolOutputAfterSaving({ blob, filename: `pixieed-animation-${result.width}x${result.height}.gif`, returnUrl: currentToolReturnUrl, title: 'アニメーションを確認', source: 'かんたんドット', metadata: { width: frames[0].width, height: frames[0].height, defaultScale: result.scale, durationSeconds, frameCount: frames.length }, mediaSource: { kind: 'gif-frames', frames, loopCount: 0 } }, exportBridge, () => !scope.disposed && documentData === exportDocument && source === exportSource && pxdBridge === exportBridge && animationSession.animation === timeline);
    if (staged.ok) return;
    if (staged.reason === 'source_changed') return;
    const saved = await saveFile(blob, `pixieed-animation-${result.width}x${result.height}.gif`);
    if (saved === 'cancelled') return;
    toast(staged.reason === 'project_save_failed'
      ? `編集内容を保存できなかったため、この画面に残りました。GIFの${saved === 'shared' ? '共有画面への受け渡し' : 'ダウンロード'}を開始しました。編集内容は保存し直してください。`
      : saved === 'shared' ? 'GIFを共有画面に渡しました。' : 'GIFのダウンロードを開始しました。');
  } catch (error) { if (!scope.disposed && error.name !== 'AbortError') toast(`GIFを書き出せませんでした：${error.message}`); }
  finally { if (animationExportController === controller) animationExportController = null; animationExporting = false; }
}
$('#draw-timelapse-detail')?.addEventListener('click', () => exportTimelapse(true));

function currentToolReturnUrl() { return `${location.pathname}${location.search}${location.hash}`; }

function getDrawEditorState() { return { inputSettings: serializeDrawInputSettings(inputSettings, documentData.palette), selectedColor, selectedHex: selectedColor < 0 ? null : documentData.palette[selectedColor], brushColors: [...documentData.palette], tool, zoom, panX, panY, mirror: symmetry.horizontal, symmetry: { ...symmetry }, mirrorOrigin: { ...mirrorOrigin }, showGrid, imageRole: pxdImageRole, frameId: animationSession.frameId, layerId: animationSession.layerId, onion }; }
function restoreDrawEditorState(state) {
    if (state?.imageRole && state.imageRole !== pxdImageRole) state = {};
    if (!readOnlyImage) {
      documentData = animationSession.select(state?.frameId, state?.layerId);
      history = recordedHistory(createDrawHistory(documentData)); onion = state?.onion === true;
    }
    const previousPlacement = inputSettings.controlsSide;
    if (state?.inputSettings?.version === 1) inputSettings = normalizeDrawInputSettings(state.inputSettings, documentData.palette);
    else if (state && (Object.hasOwn(state, 'tool') || Object.hasOwn(state, 'selectedColor'))) {
      // Older PXD editor states describe the original left button only.
      inputSettings = normalizeDrawInputSettings(null, documentData.palette); inputSettings.controlsSide = previousPlacement;
      const oldColor = Number.isInteger(state?.selectedColor) && state.selectedColor >= -1 && state.selectedColor < documentData.palette.length ? state.selectedColor : Math.min(2, documentData.palette.length - 1);
      inputSettings.bindings.left = { tool: Object.hasOwn(TOOL_NAMES, state?.tool) ? state.tool : 'pen', color: state?.selectedHex && documentData.palette.includes(state.selectedHex) ? documentData.palette.indexOf(state.selectedHex) : oldColor };
    }
    inputSettings = normalizeDrawInputSettings(serializeDrawInputSettings(inputSettings, documentData.palette), documentData.palette);
    inputSettings.editedSide = 'left';
    selectedColor = inputSettings.bindings.left.color; setTool(inputSettings.bindings.left.tool); applyControlsPlacement();
    zoom = Number.isFinite(state?.zoom) ? Math.max(1, Math.min(ZOOM_MAX, state.zoom)) : 1;
    panX = Number.isFinite(state?.panX) ? state.panX : 0; panY = Number.isFinite(state?.panY) ? state.panY : 0;
    symmetry = Object.fromEntries(Object.keys(SYMMETRY_NAMES).map(key => [key, state?.symmetry ? state.symmetry[key] === true : key === 'horizontal' && state?.mirror === true]));
    mirrorOrigin = Object.fromEntries(['x', 'y'].map(axis => [axis, Number.isFinite(state?.mirrorOrigin?.[axis]) ? Math.max(0, Math.min(1, state.mirrorOrigin[axis])) : .5]));
    if (typeof state?.showGrid === 'boolean') showGrid = state.showGrid;
    renderPalette(); paint(); updateCanvasView(); syncDrawingSettings(); animationControls?.refresh();
}

pxdBridge = mountWorkspace({
  tool: 'draw',
  projectWorkspace: true,
  initialProject: initialCameraProject,
  getEditorState: getDrawEditorState,
  restoreEditorState: restoreDrawEditorState,
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
    // Autosave can capture while another pointer is still drawing. Capture the
    // committed timeline; releasing the stroke commits it and schedules its save.
    const timeline = colorEdit ? setAnimationPalette(animationSession.animation, documentData.palette) : animationSession.animation;
    const snapshot = composeAnimationFrame(timeline, timeline.frames[0].id); const role = pxdImageRole;
    let next = project || createPxdProject();
    next = await putPxdDrawDocument(next, snapshot, role);
    next = await writePxdAnimation(next, timeline, { role, posterFrameId: timeline.frames[0].id });
    return next;
  }
});
// Commands and keyboard activation share the same operations as the visible controls.
let drawShortcuts = null;
const board = $('.draw-board');
const commandClick = selector => {
  const node = $(selector); if (!node || node.disabled || node.getAttribute('aria-disabled') === 'true') return false;
  node.click(); return true;
};
const commandFocus = selector => {
  const node = $(selector); if (!node || node.disabled) return false;
  node.focus({ preventScroll: true }); node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return true;
};
function commandOpen(detailsSelector, focusSelector) {
  selectionPanel?.hide();
  cancelDrawingInput(); closeColorEditor(); animationControls?.close?.(); editorUi.closePanels();
  const details = $(detailsSelector); if (!details) return false;
  details.open = true;
  if (details.id === 'draw-tool-picker') placeToolMenu();
  if (details.id === 'draw-settings-picker') placeSettingsPanel();
  if (details === canvasPicker) { syncSizeButtons(true); canvasSettingsPanel.position(); }
  if (focusSelector) requestAnimationFrame(() => commandFocus(focusSelector));
  return true;
}
function keyboardMove(dx, dy, event) {
  const scale = event?.shiftKey ? 5 : 1;
  if (spaceHeld) { panX += dx * 12 * scale; panY += dy * 12 * scale; updateCanvasView(); return true; }
  if (virtualCursor?.enabled) return virtualCursor.nudge(dx, dy, scale);
  if (selection && (inputSettings.bindings[lastInputSide]?.tool || tool) === 'select' && !drawing && !animationSession.locked && !readOnlyImage) {
    if (!startSelectionTransform()) return true;
    const frame = selectionTransform.state;
    selectionTransform.update({ x: Math.max(-256, Math.min(512, frame.x + dx * scale)), y: Math.max(-256, Math.min(512, frame.y + dy * scale)) });
    previewSelectionTransform(); return true;
  }
  if (zoom > 1) { panX += dx * 12 * scale; panY += dy * 12 * scale; updateCanvasView(); return true; }
  return false;
}
function focusAnimationControl(action, selector) {
  selectionPanel?.hide();
  cancelDrawingInput(); closeColorEditor(); editorUi.closePanels();
  const launcher = $('#draw-animation-controls [data-action="toggle-frames"]');
  if (launcher?.getAttribute('aria-expanded') !== 'true') launcher?.click();
  if (action) $('[data-action="' + action + '"]')?.click();
  requestAnimationFrame(() => commandFocus(selector || '.animation-controls__workspace-panel [data-action="select-cel"].is-selected'));
  return true;
}
function animateCommand(type, fields = {}) {
  cancelDrawingInput(); return handleAnimationAction({ type, frameId: animationSession.frameId, layerId: animationSession.layerId, ...fields }) !== false;
}
const commandHandlers = {
  'selection.copy': () => runSelectionAction('copy'), 'selection.cut': () => runSelectionAction('cut'), 'selection.paste': () => runSelectionAction('paste'),
  'selection.confirm': confirmSelectionTransform, 'selection.operations': () => { selectionPanel.focus(); return true; },
  'selection.rotateLeft': () => runSelectionAction('rotate-left'), 'selection.rotateRight': () => runSelectionAction('rotate-right'),
  'selection.flipX': () => runSelectionAction('flip-x'), 'selection.flipY': () => runSelectionAction('flip-y'),
  'selection.cancel': () => { cancelDrawingInput(); if (!cancelSelectionTransform()) clearSelection(); selectionPanel?.hide(); return true; },
  'edit.undo': undo, 'edit.redo': redo, 'edit.redoAlt': redo,
  'edit.clear': () => commandClick('#draw-clear'),
  'view.reset': () => { resetView(); return true; },
  'view.zoomIn': () => { const r = canvas.getBoundingClientRect(); zoomAt(zoom * 1.5, r.left + r.width / 2, r.top + r.height / 2); return true; },
  'view.zoomOut': () => { const r = canvas.getBoundingClientRect(); zoomAt(zoom / 1.5, r.left + r.width / 2, r.top + r.height / 2); return true; },
  'pan.hold': () => { spaceHeld = true; canvas.classList.add('is-grab'); return true; },
  'cursor.left': () => selectionTransform ? confirmSelectionTransform() : virtualCursor?.enabled ? virtualCursor.pressKeyboard('left') : selection ? (clearSelection(), true) : false,
  'cursor.right': () => virtualCursor?.enabled && virtualCursor.pressKeyboard('right'),
  'cursor.moveLeft': event => keyboardMove(-1, 0, event), 'cursor.moveRight': event => keyboardMove(1, 0, event),
  'cursor.moveUp': event => keyboardMove(0, -1, event), 'cursor.moveDown': event => keyboardMove(0, 1, event),
  'focus.palette': () => commandFocus('#draw-palette .draw-color[data-color-index="' + selectedColor + '"]'),
  'focus.leftControls': () => { toast('色・道具をEnterで左に割り当てます。'); return commandHandlers['focus.palette'](); },
  'focus.rightControls': () => { toast('色・道具をShift＋Enterで右に割り当てます。'); return commandHandlers['focus.palette'](); },
  'focus.tools': () => commandOpen('#draw-tool-picker', '.draw-tool-menu [data-draw-tool]'),
  'focus.settings': () => commandOpen('#draw-settings-picker', '#draw-mirror'),
  'focus.fileMenu': () => commandOpen('#draw-output', '#draw-export'),
  'open.canvasSettings': () => commandOpen('.draw-import', '#draw-canvas-width'),
  'open.colorEditor': () => { cancelDrawingInput(); editorUi.closePanels(); openColorEditor(Math.max(0, selectedColor)); requestAnimationFrame(() => commandFocus('#dce-h')); return true; },
  'focus.mirrorOriginX': () => commandFocus('#draw-mirror-x'), 'focus.mirrorOriginY': () => commandFocus('#draw-mirror-y'),
  'controls.left': () => setControlsSide('left'),
  'controls.right': () => setControlsSide('right'),
  'controls.reset': () => commandClick('#draw-input-reset'),
  'color.add': () => commandClick('#draw-palette .draw-color:not([data-color-index])'),
  'mirror.horizontal': () => commandClick('#draw-mirror'), 'mirror.vertical': () => commandClick('#draw-mirror-vertical'),
  'mirror.diagonalDown': () => commandClick('#draw-mirror-diagonal-down'), 'mirror.diagonalUp': () => commandClick('#draw-mirror-diagonal-up'),
  'mirror.center': () => commandClick('#draw-mirror-center'),
  'toggle.grid': () => commandClick('#draw-grid-toggle'), 'toggle.onion': () => commandClick('#draw-onion-toggle'),
  'toggle.virtualCursor': () => commandClick('#draw-virtual-toggle'),
  'project.save': () => commandClick('#draw-save'),
  'open.project': () => { cancelDrawingInput(); commandClick('#draw-output [data-output-project]'); return true; },
  'open.copyLast': () => commandClick('#draw-copy-last'), 'open.resume': () => commandClick('#draw-resume'),
  'open.importImage': () => commandClick('#draw-import-local'),
  'export.png': () => commandClick('#draw-export'), 'export.gif': () => commandClick('#draw-export'),
  'export.timelapse': () => commandClick('#draw-export'), 'export.timelapseDetail': () => commandClick('#draw-export'),
  'post.globe': () => commandClick('#draw-to-globe'),
  'animation.play': () => commandClick('#draw-animation-play'),
  'animation.workspace': () => focusAnimationControl(), 'focus.animation': () => focusAnimationControl(),
  'animation.duration': () => focusAnimationControl('toggle-duration', '[data-duration-input]'),
  'animation.renameLayer': () => focusAnimationControl('toggle-layers', '[data-rename-layer="' + animationSession.layerId + '"]'),
  'animation.addFrame': () => animateCommand('add-frame', { copy: true }),
  'animation.addBlankFrame': () => animateCommand('add-frame', { copy: false }),
  'animation.deleteFrame': () => animateCommand('delete-frame'),
  'animation.addLayer': () => animateCommand('add-layer'), 'animation.deleteLayer': () => animateCommand('delete-layer'),
  'animation.toggleLayerVisibility': () => animateCommand('visibility', { visible: animationSession.animation.layers.find(l => l.id === animationSession.layerId)?.visible === false }),
  'animation.toggleLayerLock': () => animateCommand('lock', { locked: !animationSession.locked }),
  'shortcuts.open': () => { drawShortcuts?.open(); return true; }
};
for (const kind of ['Frame', 'Layer']) {
  const list = () => animationSession.animation[kind === 'Frame' ? 'frames' : 'layers'];
  const id = () => animationSession[kind === 'Frame' ? 'frameId' : 'layerId'];
  for (const [name, delta] of [['previous', -1], ['next', 1]]) commandHandlers['animation.' + name + kind] = () => {
    const items = list(), index = items.findIndex(item => item.id === id()), next = items[index + delta];
    if (!next) return false;
    return animateCommand(kind === 'Frame' ? 'select-frame' : 'select-layer', { [kind === 'Frame' ? 'frameId' : 'layerId']: next.id });
  };
  for (const [name, delta] of kind === 'Frame' ? [['Earlier', -1], ['Later', 1]] : [['Down', -1], ['Up', 1]]) commandHandlers['animation.move' + kind + name] = () => {
    const items = list(), index = items.findIndex(item => item.id === id());
    if (!items[index + delta]) return false;
    return animateCommand(kind === 'Frame' ? 'move-frame' : 'move-layer', { index: index + delta });
  };
}
for (const command of DRAW_SHORTCUT_COMMANDS) {
  const parts = command.id.split('.');
  if (parts[0] === 'tool') commandHandlers[command.id] = () => {
    closeColorEditor(); const name = ({ rectangleFill: 'rectangle-fill', ellipseFill: 'ellipse-fill' })[parts[2]] || parts[2];
    setTool(name, parts[1]); return true;
  };
  if (!commandHandlers[command.id]) throw new TypeError('描画コマンドの処理がありません: ' + command.id);
}
function keyboardCommandEnabled(id) {
  if (cameraOpening) return false;
  if (document.body.hasAttribute('data-tool-result-open')) return false;
  if (id === 'selection.copy') return selectionPanelState().canCopy;
  if (id === 'selection.cut') return selectionPanelState().canCut;
  if (id === 'selection.paste') return selectionPanelState().canPaste;
  if (id === 'selection.confirm') return Boolean(selectionTransform);
  if (['selection.rotateLeft', 'selection.rotateRight', 'selection.flipX', 'selection.flipY'].includes(id)) return selectionPanelState().canTransform;
  if (id === 'edit.undo') return !drawingInputBusy() && (Boolean(selectionTransform) || animationSession.canUndo);
  if (id === 'edit.redo' || id === 'edit.redoAlt') return !selectionTransform && !drawingInputBusy() && animationSession.canRedo;
  if (id === 'cursor.right') return Boolean(virtualCursor?.enabled && !spaceHeld);
  if (id === 'cursor.left') return Boolean(!spaceHeld && (virtualCursor?.enabled || selection));
  if (id.startsWith('cursor.move')) return Boolean(spaceHeld || virtualCursor?.enabled || selection || zoom > 1);
  if (id === 'animation.deleteFrame') return animationSession.animation.frames.length > 1 && !readOnlyImage;
  if (id === 'animation.deleteLayer') return animationSession.animation.layers.length > 1 && !animationSession.locked && !readOnlyImage;
  if (id === 'animation.play') return animationSession.animation.frames.length > 1 && !readOnlyImage;
  if (id === 'open.copyLast' || id === 'open.resume') return !$(id === 'open.copyLast' ? '#draw-copy-last' : '#draw-resume')?.hidden;
  if (id === 'color.add') return documentData.palette.length < 32 && !readOnlyImage;
  if (id.startsWith('animation.') && !['animation.workspace', 'animation.duration', 'animation.renameLayer', 'animation.play', 'animation.previousFrame', 'animation.nextFrame', 'animation.previousLayer', 'animation.nextLayer', 'animation.toggleLayerLock', 'animation.toggleLayerVisibility'].includes(id)) return !readOnlyImage && !animationSession.locked;
  return true;
}
drawShortcuts = mountDrawShortcuts({ scope, root: $('#main'), storage: inputStorage,
  onRun: (id, event) => commandHandlers[id]?.(event) ?? false, getEnabled: keyboardCommandEnabled,
  beforeOpen: () => { cancelDrawingInput(); closeColorEditor(); animationControls?.close?.(); editorUi.closePanels(); canvas.focus({ preventScroll: true }); },
  onRelease: (id, { cancel }) => {
    if (id === 'pan.hold') { spaceHeld = false; panDrag = null; canvas.classList.remove('is-grab', 'is-panning'); }
    if (id === 'cursor.left' || id === 'cursor.right') virtualCursor?.releaseKeyboard(id === 'cursor.right' ? 'right' : 'left', cancel);
  }
});
scope.listen($('#draw-shortcuts-open'), 'click', () => drawShortcuts.open());
let modeDisposed = false;
function disposeDrawMode() {
  if (modeDisposed) return;
  modeDisposed = true;
  cancelCamera();
  loadGate.begin();
  activeTimelapseJob?.controller.abort();
  animationExportController?.abort();
  clearToastTimer();
  virtualCursor?.release(true); stopAnimation(); animationControls?.dispose(); if (drawing) endStroke(); clearSelection();
  activePointers.clear(); pendingTap = null; pendingTapPointerId = null; pendingTapMode = null; drawingPointerId = null; pinchStart = null; panDrag = null; fingerTap = null;
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
if (returnedCamera) {
  cameraOpening = true; freezeCameraEditor();
  try { await restoreCameraReturn(returnedCamera); returnedCamera = null; }
  finally { cancelCamera(); paint(); }
}
scope.listen(window, 'pageshow', async event => {
  if (!event.persisted || !handoffApi || scope.disposed) return;
  cancelCamera(); cameraNavigationResume?.(); cameraNavigationResume = null;
  const record = handoffApi.takeDrawCameraReturn({ search: location.search, consume: false });
  if (record) {
    cameraOpening = true; freezeCameraEditor();
    try { await restoreCameraReturn(record); } catch (error) { cameraStatus(`作品を戻せませんでした：${error.message}`); }
    finally { cancelCamera(); paint(); }
  }
});
if (document.activeElement === document.body) canvas.focus({ preventScroll: true });
return { workspace: pxdBridge, dispose: disposeDrawMode };
}
