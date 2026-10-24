import { planSharedProjectSettings } from './shared-project-core.mjs?rev=20261016-color-capability-1';
import { readPxdAudioLink } from './pxd-audio-link.mjs?rev=20261006-draw-startup-1';
import { mountToolHeaderControls } from '../tool-header-controls.mjs?rev=20261018-direct-runtime-1&nav=20261016-tool-operations-1';
import { scaleNotice } from '../pixel-scale.mjs?rev=20260929-claude-integration-1';
import { createLatestGate } from './pixel-contract.mjs?rev=20260928-data-contract-1';
import { mountPictureShelf } from './picture-shelf.mjs?rev=20260928-picture-shelf-1';
import { createLocalDraftStore, createIndexedDbDraftAdapter } from './local-drafts.mjs';
import { createDrawDocument, createDrawHistory, DRAW_PALETTE, DRAW_PALETTE_ORDER, DRAW_SIZE, documentRgba as indexedDocumentRgba, beginDrawStroke, commitDrawStroke, cancelDrawStroke, floodFill, strokePixels, validateDrawDocument } from './draw-core.mjs?rev=20261011-tool-size-1';
import { createDrawAnimationSession } from './draw-animation-session.mjs?rev=20261016-color-capability-1';
import { ANIMATION_MAX_COLORS, ANIMATION_MAX_PALETTE_ENTRIES, addAnimationFrame, removeAnimationFrame, moveAnimationFrame, addAnimationLayer, removeAnimationLayer, moveAnimationLayer, setLayerProperties, setAnimationFrameDuration, setAnimationPalette, writeAnimationCel, composeAnimationFrame, composeAnimationFrameRgba, animationNeedsRgba, getAnimationCelDocument, resizeAnimation, getAnimationUsedColorIndices, hasAnimationCelContent, serializeAnimationPool, getAnimationDrawRewardBonusColors, setAnimationDrawRewardBonusColors } from './animation-core.mjs?rev=20261016-color-capability-1';
import { composeOutputFrameRgba as composeOutputFrame } from './creation-output-core.mjs?rev=20261016-color-capability-1';
import { DEFAULT_MUSIC_OUTPUT_PREFERENCES, readMusicOutputPreferences, writeMusicOutputPreferences } from './music-output-preferences.mjs';
import { readPxdAnimation, writePxdAnimation } from './pxd-animation.mjs?rev=20261016-color-capability-1';
import { mountAnimationControls } from './animation-controls.mjs?rev=20261019-draw-search-rail-1';
import { rawPixelCellAt } from './pixel-input.mjs?rev=20261001-connected-editor-1';
import { createPixelCanvasSurface } from './pixel-canvas-surface.mjs?rev=20261015-alpha-opacity-1';
import { DRAW_HANDOFF_KEY, encodeDrawPng, serializeDrawHandoff, validateDrawPixels } from './draw-handoff.mjs';
import { navigateToSocialReturn } from '../social/tool-return.mjs?rev=20261021-jigsaw-public-1';
import { createInteractionEffects } from './interaction-effects.mjs?rev=20260928-touch-motion-1';
import { createPxdProject, encodePxd, decodePxd, setPxdBytes } from './pxd-codec.mjs';
import { mountProjectWorkspace as mountPxdTools } from './project-workspace.mjs?rev=20261018-direct-runtime-2';
import { pxdImageRoles, readPxdImage, imageToDrawDocument, readPxdDrawDocument, putPxdDrawDocument, putPxdSharedImage, putPxdImage } from './pxd-project.mjs?rev=20261016-color-capability-1';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20261016-color-capability-1';
import { countSharedImageColors, prepareSharedCanvasImage } from './shared-image.mjs?rev=20261016-color-capability-1';
import { enlargedPng, saveFile } from '../pixel-export.mjs?rev=20261017-analytics-integrity-1';
import { createDrawTimelapse, selectDrawTimelapseFrames } from './draw-timelapse.mjs?rev=20261007-draw-handoff-1';
import { createToolResultView } from '../tool-result-view.mjs?rev=20261012-operation-bar-1';
import { mountCreationEditorUi } from './editor-ui.mjs?rev=20261018-direct-runtime-2';
import { wheelZoomFactor } from './viewport-wheel.mjs';
import { applyDrawingToolIcons, createDrawingToolIcon } from './drawing-tool-icons.mjs?rev=20261004-canvas-settings-1';
import { drawShapePixels, sprayPixels, selectionBounds, moveSelectionPixels } from './draw-tool-operations.mjs?rev=20261016-color-capability-1';
import { createToolStartTracker } from '../site-analytics.mjs?rev=20261017-analytics-integrity-1';
import { sendToolOutputAfterSaving } from './output-handoff.mjs?rev=20261018-direct-runtime-1';
import { prepareCameraTarget } from './draw-camera-core.mjs?rev=20261016-color-capability-1';
import { mountDrawDesktopUi } from './draw-desktop-ui.mjs?rev=20261024-context-controls-1';
import { createSiteRewardDrawPolicy, getDrawBonusColorKeys, preservesDrawBonusColorPixels } from './site-reward-draw-policy.mjs?rev=20261016-color-capability-1';
import { REWARD_LIMITS } from '../ads/site-reward-config.mjs?rev=20261016-color-capability-1';

import { symmetryTransforms, symmetryPoint, symmetryPoints } from './drawing-symmetry.mjs';
import { mountDrawPanelDismissals } from './draw-panel-dismissals.mjs?rev=20261011-polish-1';
import { mountDrawCanvasPanel } from './draw-canvas-panel.mjs?rev=20261009-sprite-scale-1';
import { mountDrawSpriteScalePanel } from './draw-sprite-scale-panel.mjs?rev=20261009-sprite-scale-1';
import { planSpriteScale, scaleSpriteAnimation } from './draw-sprite-scale.mjs?rev=20261016-color-capability-1';
import { resizeDrawView } from './draw-resize-view.mjs?rev=20261016-color-capability-1';
import { mountColorPanel } from './color-panel.mjs?rev=20261016-tool-shell-1';
import { mountDrawAudioTimbrePanel } from './draw-audio-timbre-panel.mjs?rev=20261016-tool-shell-1';
import { getAudioInstrumentIcon, audioInstrumentIconFilter } from './audio-instrument-icons.mjs?rev=20261005-audio-drums-1';
import { mountDrawViewportOverlays, shouldShowDrawOnion } from './draw-viewport-overlays.mjs?rev=20261017-layer-minimum-1';
import { mountDrawVirtualCursor } from './draw-virtual-cursor.mjs?rev=20261009-pointer-selection-1';
import { DRAW_INPUT_SETTINGS_KEY, normalizeDrawInputSettings, serializeDrawInputSettings, readDrawInputSettings } from './draw-input-settings.mjs?rev=20261011-tool-size-1';
import { mountDrawAssignmentInput } from './draw-assignment-input.mjs?rev=20261006-header-controls-1';
import { DRAW_SHORTCUT_COMMANDS, mountDrawShortcuts } from './draw-shortcuts.mjs?rev=20261015-draw-desktop-1';
import { captureDrawSelection, clearDrawSelection, createDrawSelectionClipboard, drawSelectionMask, drawSelectionMaskBounds, selectDrawColorMask } from './draw-selection-operations.mjs?rev=20261016-color-capability-1';
import { createDrawSelectionTransform } from './draw-selection-session.mjs?rev=20261016-color-capability-1';
import { mountDrawSelectionPanel } from './draw-selection-panel.mjs?rev=20261012-operation-bar-1';
import { selectionDefaultPivot, selectionContains, snapSelectionAngle, transformSelectionFromCorner, unwrapSelectionBearing, translateSelectionFrame } from './draw-selection-geometry.mjs?rev=20261006-selection-fix-1';
import { mountDrawSelectionOverlay } from './draw-selection-overlay.mjs?rev=20261010-selection-handles-1';
import { selectionInputOperation, selectionGestureKind, combineDrawInputSelection, combineDrawLassoSelection, lassoDrawSelection } from './draw-selection-input.mjs?rev=20261016-color-capability-1';
import { mountLazyDrawFeaturePanels } from './draw-lazy-panels.mjs?rev=20261024-context-controls-1';
import { mountDrawBrushSettings } from './draw-brush-settings.mjs?rev=20261024-context-controls-1';

const documentRgba = image => image.rgba || indexedDocumentRgba(image);
const DRAW_REWARD_LIMITS = Object.freeze({ ...REWARD_LIMITS.draw });

export async function mountDrawMode({ scope, mountWorkspace = mountPxdTools, isActive = () => true, musicLayer = false } = {}) {
if (!scope) throw new TypeError('Draw mode requires a lifecycle scope');
const siteReward = await import('../ads/site-reward.mjs?rev=20261016-color-capability-1');
siteReward.mountSiteRewardUI();
const drawRewardPolicy = createSiteRewardDrawPolicy({
  enabled: siteReward.isSiteRewardPolicyEnabled,
  hasReward: siteReward.hasSiteReward,
  requireReward: siteReward.requireSiteReward,
  limits: DRAW_REWARD_LIMITS
});
let importedOriginal = null;
let handoffApi = null, returnedCamera = null, initialCameraProject = null, cameraNavigationResume = null;
const handoffParams = new URLSearchParams(location.search);
if (handoffParams.has('drawCamera')) {
  handoffApi = await import('./draw-camera-handoff.mjs?rev=20261016-color-capability-1');
  returnedCamera = handoffApi.takeDrawCameraReturn({ search: location.search, consume: false });
  if (!returnedCamera) throw new Error('撮影の受け渡しを確認できません。元の一時保存は変更していません。');
  if (returnedCamera.project?.pxdBase64) initialCameraProject = {
    project: await decodePxd(decodeCameraBytes(returnedCamera.project.pxdBase64)),
    ...(returnedCamera.project.savedPxdBase64 ? { savedProject: await decodePxd(decodeCameraBytes(returnedCamera.project.savedPxdBase64)) } : {}),
    persisted: returnedCamera.project.persisted === true, edited: returnedCamera.project.edited === true
  };
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
mountToolHeaderControls(document, { scope, selectors: ['.draw-import', '#draw-settings-picker', '#draw-output', '#draw-clear', '#draw-to-globe'] });
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
if (new URLSearchParams(location.search).get('social') === '1') {
  globeButton.setAttribute('aria-label', '投稿の下書きへ');
  globeButton.title = '投稿の下書きへ';
}
const sizeSelect = $('#draw-size');
const interactionEffects = createInteractionEffects();
let documentData = createDrawDocument(); let history = createDrawHistory(documentData); let selectedColor = 2; let tool = 'pen'; let drawing = false; let previousPoint = null; let strokeStartPixels = null; let activeDraftId = null; let source = { type: 'hand_drawn', assetId: null, revisionId: null }; let saved = false; let canvasPrepared = false; let sizeWasChosen = false; let drawRewardNotice = null;
let inputStorage = null; try { inputStorage = globalThis.localStorage; } catch { /* Private mode may block preferences. */ }
let inputSettings = readDrawInputSettings(inputStorage, documentData.palette), lastInputSettings = '', strokeBinding = null, lastInputSide = 'left';
inputSettings.editedSide = 'left';
selectedColor = inputSettings.bindings.left.color; tool = inputSettings.bindings.left.tool;
function effectiveTool() { return strokeBinding?.tool || tool; }
function effectiveColor() { return strokeBinding?.color ?? selectedColor; }
let animationSession = createDrawAnimationSession(documentData, { musicLayer }), animationControls = null, strokeTracker = null;
let drawOperationLease = null, colorEditorLease = null;
let lastHistoryCommitRejected = false;
drawRewardNotice = document.createElement('aside');
drawRewardNotice.dataset.drawRewardNotice = 'true';
drawRewardNotice.setAttribute('role', 'status');
drawRewardNotice.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:6px 10px;margin:8px auto;max-width:720px;padding:8px 12px;border:1px solid #d7c58b;border-radius:8px;background:#fff8dc;color:#332b14;font:13px/1.45 system-ui,sans-serif;position:relative;z-index:2';
const drawRewardText = document.createElement('span');
const drawRewardButton = document.createElement('button');
drawRewardButton.type = 'button'; drawRewardButton.textContent = '60分特典を確認'; drawRewardButton.style.cssText = 'margin-left:8px;font:inherit;cursor:pointer';
drawRewardNotice.append(drawRewardText, drawRewardButton);
$('.draw-viewport')?.before(drawRewardNotice);
drawRewardButton.addEventListener('click', () => siteReward.requireSiteReward('draw'));
const unsubscribeDrawReward = siteReward.subscribeSiteReward(() => { setDrawRewardNotice(); });
scope.listen(window, 'pagehide', unsubscribeDrawReward, { once: true });
function drawRewardTarget(animation = animationSession.animation, frameId = animationSession.frameId, layerId = animationSession.layerId, colorIndex = selectedColor) {
  const frameIndex = animation.frames.findIndex(frame => frame.id === frameId);
  const artLayers = animation.layers.filter(layer => layer.role !== 'music');
  const layer = animation.layers.find(item => item.id === layerId);
  return { frameIndex, layerIndex: layer?.role === 'music' ? -1 : artLayers.findIndex(item => item.id === layerId), colorIndex };
}
function drawRewardStats(animation = animationSession.animation, documentOverride = null, ownershipOverride = null) {
  let colors = new Set();
  if (documentOverride) {
    const other = getAnimationUsedColorIndices(animation, { excludeFrameId: animationSession.frameId, excludeLayerId: animationSession.layerId });
    for (const index of other) {
      // Palette edits are global even while the active cel is being previewed.
      const key = index < 0 ? null : drawColorKey(documentOverride.palette[index]);
      if (key) colors.add(key);
    }
    for (const index of documentOverride.pixels) {
      const key = index < 0 ? null : drawColorKey(documentOverride.palette[index]);
      if (key) colors.add(key);
    }
  } else colors = new Set([...getAnimationUsedColorIndices(animation)].map(index => index < 0 ? null : drawColorKey(animation.palette[index])).filter(Boolean));
  const bonus = new Set(ownershipOverride || drawRewardBonusOwnership(animation, documentOverride));
  return { colors: colors.size, freeColors: [...colors].filter(color => !bonus.has(color)).length,
    layers: animation.layers.filter(layer => layer.role !== 'music').length, frames: animation.frames.length };
}
function drawColorKey(color) {
  const hex = String(color || '').toLowerCase();
  if (!/^#[\da-f]{6}(?:[\da-f]{2})?$/.test(hex)) return null;
  const rgba = hex.length === 7 ? `${hex}ff` : hex;
  return rgba.endsWith('00') ? null : rgba;
}
function drawRewardBonusOwnership(animation, documentOverride = null) {
  const used = new Set(getAnimationUsedColorIndices(animation, documentOverride ? { excludeFrameId: animationSession.frameId, excludeLayerId: animationSession.layerId } : {}));
  if (documentOverride) {
    for (const index of documentOverride.pixels) if (index >= 0) used.add(index);
  } else {
    for (const index of getAnimationUsedColorIndices(animation)) used.add(index);
  }
  const palette = documentOverride?.palette || animation.palette;
  const visible = new Set([...used].map(index => drawColorKey(palette[index])).filter(Boolean));
  const stored = getAnimationDrawRewardBonusColors(animation);
  // Legacy projects initialize once from actual used colors. Current owned
  // identities never shift merely because a free color became unused.
  const storedFreeCount = stored && [...visible].filter(color => !stored.includes(color)).length;
  const ownership = stored ?? getDrawBonusColorKeys(palette, [...used], drawRewardPolicy.limits.colors);
  if (stored === null) setAnimationDrawRewardBonusColors(animation, ownership);
  else if (storedFreeCount > drawRewardPolicy.limits.colors && animation === animationSession.animation) {
    const repaired = getDrawBonusColorKeys(palette, [...used], drawRewardPolicy.limits.colors);
    setAnimationDrawRewardBonusColors(animation, repaired);
    return repaired;
  }
  return ownership;
}
function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
  return true;
}
function drawCelRgba(animation, frameId, layerId) {
  const cel = getAnimationCelDocument(animation, frameId, layerId);
  return cel.rgba ? new Uint8Array(cel.rgba) : indexedDocumentRgba({ ...cel, pixels: Array.from(cel.pixels) });
}
function protectedDrawContentEqual(before, after) {
  const { layers: freeLayers, frames: freeFrames } = drawRewardPolicy.limits;
  const beforeLayers = before.layers.filter(layer => layer.role !== 'music');
  const beforeFrames = before.frames;
  const extraLayerIds = beforeLayers.slice(freeLayers).map(layer => layer.id);
  const extraFrameIds = beforeFrames.slice(freeFrames).map(frame => frame.id);
  try {
    // Preserve the full shape and order of an already-expanded project. Checking
    // only the free prefix lets two bonus layers/frames exchange their indices,
    // and equal-area resize can otherwise leave blank cels byte-identical.
    if ((extraLayerIds.length || extraFrameIds.length)
        && (before.width !== after.width || before.height !== after.height)) return false;
    if (extraLayerIds.length && beforeLayers.map(layer => layer.id).join('\0') !== after.layers.filter(layer => layer.role !== 'music').map(layer => layer.id).join('\0')) return false;
    if (extraFrameIds.length && beforeFrames.map(frame => frame.id).join('\0') !== after.frames.map(frame => frame.id).join('\0')) return false;
    for (const layerId of extraLayerIds) {
      const oldLayer = before.layers.find(layer => layer.id === layerId), newLayer = after.layers.find(layer => layer.id === layerId);
      if (!newLayer || JSON.stringify(oldLayer) !== JSON.stringify(newLayer)) return false;
      for (const frame of before.frames) {
        if (!after.frames.some(item => item.id === frame.id) || !sameBytes(drawCelRgba(before, frame.id, layerId), drawCelRgba(after, frame.id, layerId))) return false;
      }
    }
    for (const frameId of extraFrameIds) {
      const oldFrame = before.frames.find(frame => frame.id === frameId), newFrame = after.frames.find(frame => frame.id === frameId);
      if (!newFrame || JSON.stringify(oldFrame) !== JSON.stringify(newFrame)) return false;
      for (const layer of before.layers) {
        if (!after.layers.some(item => item.id === layer.id) || !sameBytes(drawCelRgba(before, frameId, layer.id), drawCelRgba(after, frameId, layer.id))) return false;
      }
    }
    return true;
  } catch { return false; }
}
function bonusDrawColorContentEqual(before, after, protectedColors = drawRewardBonusOwnership(before)) {
  const bonusColors = new Set(protectedColors);
  if (!bonusColors.size) return true;
  if (before.width !== after.width || before.height !== after.height) return false;
  for (const frame of before.frames) if (!after.frames.some(item => item.id === frame.id)) return false;
  for (const layer of before.layers) if (!after.layers.some(item => item.id === layer.id)) return false;
  const sparseTiles = animation => {
    const tiles = serializeAnimationPool(animation), bytesById = new Map(), result = new Map();
    for (const tile of tiles) if (tile.bytes) bytesById.set(tile.tileId, tile.bytes);
    for (const tile of tiles) {
      const bytes = tile.bytes || bytesById.get(tile.tileId);
      if (bytes) result.set(`${tile.frameId}\0${tile.layerId}\0${tile.x},${tile.y}`, { ...tile, bytes });
    }
    return result;
  };
  const oldTiles = sparseTiles(before), nextTiles = sparseTiles(after);
  const keys = new Set([...oldTiles.keys(), ...nextTiles.keys()]);
  for (const key of keys) {
    const oldTile = oldTiles.get(key), nextTile = nextTiles.get(key);
    const length = oldTile?.bytes.length ?? nextTile?.bytes.length ?? 0;
    if (oldTile && nextTile && (oldTile.width !== nextTile.width || oldTile.height !== nextTile.height)) return false;
    const oldValues = oldTile?.bytes || new Uint8Array(length), nextValues = nextTile?.bytes || new Uint8Array(length);
    // A protected color cannot be repainted, erased, moved, or newly used
    // elsewhere. Reordering palette indices is harmless when RGBA is stable.
    if (!preservesDrawBonusColorPixels(oldValues, nextValues, before.palette, after.palette, bonusColors, { oneBased: true })) return false;
  }
  return true;
}
function guardDrawTransition(nextAnimation, { lease = drawOperationLease || drawRewardPolicy.capture('draw'), target = drawRewardTarget(), mutation = 'edit', documentOverride = null, beforeDocumentOverride = null } = {}) {
  const beforeAnimation = animationSession.animation;
  const bonusColors = drawRewardBonusOwnership(beforeAnimation, beforeDocumentOverride || documentData);
  const before = drawRewardStats(beforeAnimation, beforeDocumentOverride || documentData);
  const after = drawRewardStats(nextAnimation, documentOverride, lease?.enabled && !lease.entitled ? bonusColors : null);
  const result = drawRewardPolicy.validate(before, after, { lease, target, mutation });
  if (!result.allowed) { toast(result.reason); return false; }
  if (lease?.enabled && !lease.entitled) {
    const freeFrames = drawRewardPolicy.limits.frames, freeLayers = drawRewardPolicy.limits.layers;
    const beforeArtLayers = animationSession.animation.layers.filter(layer => layer.role !== 'music');
    const afterArtLayers = nextAnimation.layers.filter(layer => layer.role !== 'music');
    const protectsFrames = animationSession.animation.frames.length > freeFrames || nextAnimation.frames.length > freeFrames;
    const protectsLayers = beforeArtLayers.length > freeLayers || afterArtLayers.length > freeLayers;
    const freeFrameIds = protectsFrames ? animationSession.animation.frames.slice(0, freeFrames).map(frame => frame.id) : [];
    const freeLayerIds = protectsLayers ? beforeArtLayers.slice(0, freeLayers).map(layer => layer.id) : [];
    const nextFrameIds = protectsFrames ? nextAnimation.frames.slice(0, freeFrames).map(frame => frame.id) : [];
    const nextLayerIds = protectsLayers ? afterArtLayers.slice(0, freeLayers).map(layer => layer.id) : [];
    if (protectsFrames && freeFrameIds.join('\0') !== nextFrameIds.join('\0') || protectsLayers && freeLayerIds.join('\0') !== nextLayerIds.join('\0')) {
      toast('特典外では超過コマ・レイヤーを移動したり、無料枠へ入れ替えたりできません。'); return false;
    }
    if (!protectedDrawContentEqual(animationSession.animation, nextAnimation)) {
      toast('特典外では超過レイヤー・コマの内容や色を変更できません。保存データは保持されています。'); return false;
    }
    if (!bonusDrawColorContentEqual(beforeAnimation, nextAnimation, bonusColors)) {
      toast('特典外では32色を超える色の画素を変更できません。保存データは保持されています。'); return false;
    }
  }
  const nextBonusColors = lease?.enabled && lease.entitled
    ? getDrawBonusColorKeys(nextAnimation.palette, [...getAnimationUsedColorIndices(nextAnimation)].filter(index => index >= 0), drawRewardPolicy.limits.colors)
    : bonusColors;
  setAnimationDrawRewardBonusColors(nextAnimation, nextBonusColors);
  if (musicLayer && mutation !== 'restore' && typeof musicTimelineValidator === 'function'
      && musicTimelineValidator({ before: animationSession.animation, after: nextAnimation, operation: mutation,
        rewardActive: Boolean(lease?.enabled && lease.entitled) }) === false) return false;
  return true;
}
function guardDrawDocumentTransition(beforeDocument, nextDocument, { lease = drawOperationLease || drawRewardPolicy.capture('draw'), target = drawRewardTarget(), mutation = 'edit' } = {}) {
  const animation = animationSession.animation;
  const bonusColors = drawRewardBonusOwnership(animation, beforeDocument);
  const before = drawRewardStats(animation, beforeDocument, bonusColors);
  const after = drawRewardStats(animation, nextDocument, lease?.enabled && !lease.entitled ? bonusColors : null);
  const result = drawRewardPolicy.validate(before, after, { lease, target, mutation });
  if (!result.allowed) { toast(result.reason); return false; }
  let nextAnimation = animation;
  if (animation.palette.length !== nextDocument.palette.length || animation.palette.some((color, index) => color !== nextDocument.palette[index]))
    nextAnimation = setAnimationPalette(nextAnimation, nextDocument.palette);
  nextAnimation = writeAnimationCel(nextAnimation, animationSession.frameId, animationSession.layerId, {
    width: nextDocument.width, height: nextDocument.height, pixels: Uint8Array.from(nextDocument.pixels, value => value + 1)
  });
  if (lease?.enabled && !lease.entitled && !protectedDrawContentEqual(animation, nextAnimation)) {
    toast('特典外では超過レイヤー・コマの内容や色を変更できません。保存データは保持されています。'); return false;
  }
  if (lease?.enabled && !lease.entitled && !bonusDrawColorContentEqual(animation, nextAnimation, bonusColors)) {
    toast('特典外では32色を超える色の画素を変更できません。保存データは保持されています。'); return false;
  }
  if (musicLayer && typeof musicTimelineValidator === 'function'
      && musicTimelineValidator({ before: animation, after: nextAnimation, operation: mutation,
        rewardActive: Boolean(lease?.enabled && lease.entitled) }) === false) return false;
  const nextBonusColors = lease?.enabled && lease.entitled
    ? getDrawBonusColorKeys(nextAnimation.palette, [...getAnimationUsedColorIndices(nextAnimation)].filter(index => index >= 0), drawRewardPolicy.limits.colors)
    : bonusColors;
  setAnimationDrawRewardBonusColors(nextAnimation, nextBonusColors);
  return true;
}
function captureDrawOperation({ request = false } = {}) {
  drawOperationLease = drawRewardPolicy.capture('draw', { request });
  return drawOperationLease;
}
function setDrawRewardNotice() {
  if (!drawRewardNotice) return;
  const enabled = drawRewardPolicy.enabled();
  drawRewardNotice.hidden = !enabled;
  if (!enabled) return;
  const limits = drawRewardPolicy.limits;
  const state = drawRewardStats(animationSession.animation, documentData);
  const active = drawRewardPolicy.hasReward();
  const target = drawRewardTarget();
  const lockedLayer = !active && target.layerIndex >= limits.layers;
  const lockedFrame = !active && target.frameIndex >= limits.frames;
  const excess = state.layers > limits.layers || state.frames > limits.frames || state.colors > limits.colors;
  drawRewardText.textContent = active
    ? `特典中：色${limits.rewardColors}色・レイヤー${limits.rewardLayers}・コマ${limits.rewardFrames}まで編集できます。`
    : `無料：色${limits.colors}色・レイヤー${limits.layers}・コマ${limits.frames}。サイズ上限は従来どおり。${lockedLayer || lockedFrame ? ' 選択中の超過レイヤー／コマは表示専用です。' : ''}${excess ? ' 超過分は保持され、削除・縮小されません。' : ''}`;
  drawRewardButton.hidden = active;
}
if (musicLayer) documentData = animationSession.select(animationSession.frameId, animationSession.animation.layers.findLast(layer => layer.role !== 'music').id);
let lastArtLayerId = animationSession.layerId;
let musicReadOnlyReason = '';
let outputPreferences = { ...DEFAULT_MUSIC_OUTPUT_PREFERENCES };
// Every creation mode edits this one immutable timeline and history.
const editorListeners = new Set(), projectHooks = new Set();
let currentOpenedProject = null, projectSettingsRequest = null, creationNavigationRequest = null, musicSettingsPlanner = null;
let musicTimelineValidator = null;
let notifiedAnimation = null;
function notifyEditorChange() {
  if (!editorListeners.size || notifiedAnimation === animationSession.animation) return;
  notifiedAnimation = animationSession.animation;
  for (const listener of editorListeners) listener();
}
const trackDrawStart = createToolStartTracker('draw');
let selection = null, selectionDrag = null, strokeWasSaved = false;
let selectionTransform = null, selectionPreview = null, selectionPanel = null, selectionError = '', selectionRewardLease = null;
let featureSession = null, featurePreviewAnimation = null, featureInertSnapshot = null;
let spriteScalePanel = null, spriteScaling = false, brushSettingsPanel = null;
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
  return resizeDrawView(resizeViewState(), documentData.width, documentData.height, width, height);
}
// Register dismissal before any panel or viewport pointer-capture handlers.
const panelDismissals = mountDrawPanelDismissals({ scope, root: $('#main'), cancelInput: cancelDrawingInput,
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
let timelapse = createDrawTimelapse();
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
function drawingInputBusy() { return Boolean(spriteScaling || drawing || pendingTap || activePointers.size || virtualCursor?.pressed || virtualCursor?.moving); }
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
    const lease = drawRewardPolicy.capture('draw');
    const { prepareCameraTarget, replaceCameraPixels } = await import('./draw-camera-core.mjs?rev=20261016-color-capability-1');
    const target = prepareCameraTarget(documentData, record.mask, record.allowedIndices);
    const next = replaceCameraPixels(documentData, target, record.indices);
    const before = animationSession.animation;
    if (guardDrawDocumentTransition(documentData, next, { lease })) {
      const prepared = animationSession.prepareDocument(next);
      preparedSelectionCommit = prepared;
      const previousLease = drawOperationLease; drawOperationLease = lease;
      let changed;
      try { changed = history.commit(next); } finally { preparedSelectionCommit = null; drawOperationLease = previousLease; }
      if (!changed && !lastHistoryCommitRejected) {
      // A shutter press is one animation-history transaction even for identical pixels.
        prepared();
        if (selection) { selectionViewStates.set(before, { ...selection }); selectionViewStates.set(animationSession.animation, { ...selection }); }
        animationControls?.refresh(); pxdBridge?.markDirty();
      }
      if (changed || !lastHistoryCommitRejected) saved = false;
    } else {
      toast('撮影画像は色の上限を超えるため反映できませんでした。元の作品は保持されています。');
    }
  }
  canvasPrepared = false; renderPalette(); setCanvasDimensions(); paint(); updateCanvasView(); placeSelection(); syncDrawingSettings(); animationControls?.refresh();
  virtualCursor?.setCanvasPosition(record.view?.cursor);
  handoffApi.consumeDrawCameraRequest(record);
  const current = pxdBridge.currentProject;
  const query = current && pxdBridge.persisted ? `?${new URLSearchParams({ pxd: current.projectId, pxdRevision: current.revisionId })}` : '';
  window.history.replaceState(null, '', `/draw/${query}${location.hash}`);
  toast(record.indices ? '撮影を反映しました。1回戻すと撮影前に戻ります。' : '撮影を取消し、元の作品を戻しました。');
}
scope.listen(document, 'keydown', event => {
  if (!cameraOpening) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); cancelCamera(); paint(); toast('カメラを取消しました。'); }
}, { capture: true });
scope.listen(window, 'pagehide', cancelCamera);
scope.listen(document, 'visibilitychange', () => { if (document.hidden) cancelCamera(); });
function updateControls() {
  const busy = drawingInputBusy() || Boolean(featureSession);
  $('#draw-undo').disabled = busy || !selectionTransform && !animationSession.canUndo; $('#draw-redo').disabled = busy || Boolean(selectionTransform) || !animationSession.canRedo;
  $('#draw-undo').setAttribute('aria-disabled', String($('#draw-undo').disabled)); $('#draw-redo').setAttribute('aria-disabled', String($('#draw-redo').disabled));
  status.textContent = cameraFailureNotice && performance.now() < cameraFailureNotice.until ? cameraFailureNotice.message : saved ? '保存しました。' : '編集中です。保存すると端末に残ります。';
  syncPlaybackControl();
  selectionPanel?.sync();
  spriteScalePanel?.sync();
  brushSettingsPanel?.sync();
}
function syncPlaybackControl() {
  const button = $('#draw-animation-play'), badge = $('#draw-playback-position');
  if (cameraOpening) return;
  // The result view temporarily owns this control as its return action.
  if (button.hasAttribute('data-tool-result-return')) return;
  const frames = animationSession.animation.frames;
  button.disabled = Boolean(readOnlyImage || featureSession) || frames.length < 2;
  button.setAttribute('aria-pressed', String(playing));
  const label = playing ? 'アニメーションを停止' : frames.length < 2 ? '2コマ以上でアニメーションを再生できます' : 'アニメーションを再生';
  button.setAttribute('aria-label', label); button.title = label;
  badge.hidden = !playing;
  if (playing) badge.textContent = `▶ ${frames.findIndex(frame => frame.id === playbackFrame) + 1} / ${frames.length}`;
  animationControls?.showPlaybackFrame?.(playing ? playbackFrame : null);
}
function composeDisplayFrame(animation, frameId) {
  return animationNeedsRgba(animation) ? composeAnimationFrameRgba(animation, frameId) : composeAnimationFrame(animation, frameId);
}
function paint(changed = null) {
  if (readOnlyImage) { setCanvasDimensions(); canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(readOnlyImage.rgba), readOnlyImage.width, readOnlyImage.height), 0, 0); paintOnion(readOnlyImage); updateControls(); return; }
  if (!canvasPrepared || canvas.width !== documentData.width || canvas.height !== documentData.height) setCanvasDimensions();
  if (selectionTransform) changed = null;
  const display = playing ? composeDisplayFrame(animationSession.animation, playbackFrame || animationSession.frameId)
    : featurePreviewAnimation ? composeDisplayFrame(featurePreviewAnimation, animationSession.frameId)
      : animationSession.composite(selectionPreview || documentData, changed);
  if (display.rgba) pixelSurface.paintRgba(display.rgba, playing ? null : changed); else pixelSurface.paint(display.pixels, display.palette, playing ? null : changed);
  paintOnion(display);
  if ($('#draw-output')?.open) updateOutputPreview();
  updateControls(); setDrawRewardNotice();
  notifyEditorChange();
}
function installAnimationDocument(doc, { preserveTimelapse = false } = {}) {
  const retainedTimelapse = preserveTimelapse ? timelapse.snapshot() : null;
  cancelCamera();
  const changedSize = documentData.width !== doc.width || documentData.height !== doc.height;
  const view = changedSize ? resizeViewStates.get(animationSession.animation) || translatedResizeView(doc.width, doc.height) : null;
  clearSelection();
  documentData = doc; history = recordedHistory(createDrawHistory(documentData)); saved = false;
  if (retainedTimelapse?.length) timelapse.restore(retainedTimelapse);
  const activeLayer = animationSession.animation.layers.find(layer => layer.id === animationSession.layerId);
  if (activeLayer && activeLayer.role !== 'music') lastArtLayerId = activeLayer.id;
  const selectionState = selectionViewStates.get(animationSession.animation);
  if (selectionState) selection = { ...selectionState };
  if (view) { mirrorOrigin = { ...view.mirrorOrigin }; selection = view.selection && { ...view.selection }; zoom = view.zoom; panX = view.panX; panY = view.panY; }
  selectedColor = Math.min(selectedColor, doc.palette.length - 1); canvasPrepared = false;
  renderPalette(); showCurrentColor(); paint(); syncDrawingSettings(); placeSelection(); animationControls?.refresh(); updateOutputPreview();
  if (view) { updateCanvasView(); placeSelection(); requestAnimationFrame(() => { if (!scope.disposed) virtualCursor?.setCanvasPosition(view.cursor); }); }
  drawOperationLease = null; setDrawRewardNotice();
}
function stopAnimation() {
  const wasPlaying = playing;
  playing = false; playbackFrame = null; cancelAnimationFrame(playbackRequest); playbackRequest = 0;
  animationControls?.refresh();
  syncPlaybackControl();
  syncDrawingSettings();
  // Visibility changes and mode suspension also stop playback. Restore the
  // selected cel and its onion guides instead of leaving the last played cel.
  if (wasPlaying) paint();
}
function toggleAnimation() {
  if (selectionTransform) { toast('✓で確定、×で取消してから再生できます。'); return; }
  cancelSelectionTransform(); selectionPanel?.hide();
  if (playing) { stopAnimation(); return; }
  if (readOnlyImage || animationSession.animation.frames.length < 2) { toast('2コマ以上あるとアニメーションを再生できます。'); return; }
  virtualCursor?.release();
  endStroke(); closeColorEditor();
  const frames = animationSession.animation.frames; playbackOffset = 0;
  for (const frame of frames) { if (frame.id === animationSession.frameId) break; playbackOffset += frame.durationMs; }
  playing = true; playbackStarted = performance.now();
  syncDrawingSettings();
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
  onionCanvas.hidden = !shouldShowDrawOnion({ enabled: onion && animationSession.animation.frames.length >= 2, playing, readOnly: Boolean(readOnlyImage) });
  if (onionCanvas.hidden) return;
  const animation = animationSession.animation, key = `${animationSession.frameId}:${animation.frames.map((frame) => frame.id).join(',')}`;
  if (onionKey !== key || onionGuide?.animation !== animation) {
    const index = animation.frames.findIndex((frame) => frame.id === animationSession.frameId);
    onionGuide = { animation, previous: index > 0 ? composeAnimationFrameRgba(animation, animation.frames[index - 1].id) : null,
      next: index + 1 < animation.frames.length ? composeAnimationFrameRgba(animation, animation.frames[index + 1].id) : null }; onionKey = key;
  }
  onionCanvas.width = display.width; onionCanvas.height = display.height;
  const data = new Uint8ClampedArray(display.width * display.height * 4);
  for (let index = 0; index < display.width * display.height; index++) {
    if (display.rgba ? display.rgba[index * 4 + 3] > 0 : display.pixels[index] >= 0) continue;
    const previous = onionGuide.previous?.rgba[index * 4 + 3] > 0, next = onionGuide.next?.rgba[index * 4 + 3] > 0;
    if (!previous && !next) continue;
    data.set(previous ? [255, 100, 110, 95] : [85, 185, 255, 95], index * 4);
  }
  onionCanvas.getContext('2d').putImageData(new ImageData(data, display.width, display.height), 0, 0); placeOverlays();
}
function handleAnimationAction(action) {
  if (cameraOpening || spriteScaling || featureSession) return false;
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
  if (action.type === 'select-frame' || action.type === 'select-layer') {
    if (selection) selectionViewStates.set(animationSession.animation, { ...selection });
    else selectionViewStates.delete(animationSession.animation);
    const chosenLayer = action.layerId ? animationSession.animation.layers.find(layer => layer.id === action.layerId) : null;
    if (chosenLayer && chosenLayer.role !== 'music') lastArtLayerId = chosenLayer.id;
    installAnimationDocument(animationSession.select(action.frameId, action.layerId)); return;
  }
  const startingStats = drawRewardStats(animationSession.animation, documentData);
  const limits = drawRewardPolicy.limits;
  const needsReward = action.type === 'add-layer' && startingStats.layers >= limits.layers
    || action.type === 'add-frame' && startingStats.frames >= limits.frames;
  const lease = captureDrawOperation({ request: needsReward });
  // Layer locking protects pixels, while its own switch must remain operable.
  const policy = evaluateSharedCanvasPolicy({ width: documentData.width, height: documentData.height, colorCount: 1 }, { passActive: true });
  if (readOnlyImage || !policy.supported) { drawOperationLease = null; toast('キャンバスは256pxまで編集できます。プロジェクトのキャンバス設定でサイズを調整してください。'); return; }
  const a = animationSession.animation; let next = a, targetSelection;
  switch (action.type) {
    case 'add-frame': next = addAnimationFrame(a, { sourceFrameId: action.frameId || animationSession.frameId, copy: action.copy !== false }); targetSelection = { frameId: next.frames.at(-1).id, layerId: animationSession.layerId }; break;
    case 'delete-frame': next = removeAnimationFrame(a, action.frameId); break;
    case 'move-frame': next = moveAnimationFrame(a, action.frameId, action.index); break;
    case 'add-layer': next = addAnimationLayer(a, { name: `レイヤー ${a.layers.length + 1}` }); targetSelection = { frameId: animationSession.frameId, layerId: next.layers.at(-1).id }; break;
    case 'delete-layer': next = removeAnimationLayer(a, action.layerId); break;
    case 'move-layer': next = moveAnimationLayer(a, action.layerId, action.index); break;
    case 'layer-opacity': next = setLayerProperties(a, action.layerId, { opacity: action.opacity }); break;
    case 'visibility': next = setLayerProperties(a, action.layerId, { visible: action.visible }); break;
    case 'lock': next = setLayerProperties(a, action.layerId, { locked: action.locked }); break;
    case 'rename-layer': next = setLayerProperties(a, action.layerId, { name: action.name }); break;
    case 'duration': next = setAnimationFrameDuration(a, action.frameId, action.durationMs); break;
    default: drawOperationLease = null; return;
  }
  const targetLayerId = action.layerId || animationSession.layerId;
  const targetFrameId = action.frameId || animationSession.frameId;
  const target = drawRewardTarget(a, targetFrameId, targetLayerId);
  if (!guardDrawTransition(next, { lease, target, mutation: 'edit' })) { drawOperationLease = null; return false; }
  installAnimationDocument(animationSession.apply(next, targetSelection)); pxdBridge?.markDirty();
}
animationControls = mountAnimationControls({ host: $('#draw-animation-controls'), scope,
  getState: () => ({ ...animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId, playing, playbackFrameId: playbackFrame, onion, readOnly: Boolean(readOnlyImage) }),
  onionControlExternal: true, dismissibleMenus: true,
  onAction: handleAnimationAction,
  getCelHasContent: (frameId, layerId) => hasAnimationCelContent(animationSession.animation, frameId, layerId),
  getFramePreview: (frameId) => { const doc = composeDisplayFrame(animationSession.animation, frameId); return new ImageData(new Uint8ClampedArray(documentRgba(doc)), doc.width, doc.height); }
});
function renderPalette() {
  const palette = $('#draw-palette'); palette.replaceChildren();
  const transparent = document.createElement('button'); transparent.type = 'button'; transparent.className = 'draw-color draw-color--transparent'; transparent.dataset.colorIndex = '-1'; transparent.setAttribute('aria-label', '透明色'); transparent.setAttribute('aria-pressed', String(selectedColor === -1));
  palette.append(transparent);
  const usesDefaultPalette = documentData.palette.length === DRAW_PALETTE.length && documentData.palette.every((color, index) => color.toLowerCase() === DRAW_PALETTE[index].toLowerCase());
  const order = usesDefaultPalette ? DRAW_PALETTE_ORDER : documentData.palette.map((_, index) => index);
  order.forEach((index) => { const color = documentData.palette[index];
    const button = document.createElement('button'); button.dataset.colorIndex = String(index); button.type = 'button'; button.className = 'draw-color'; button.style.setProperty('--draw-color', color); button.setAttribute('aria-label', `色 ${index + 1}`); button.title = `色 ${index + 1}`; button.setAttribute('aria-pressed', String(index === selectedColor));
    renderAudioPaletteIcon(button, index, color);
    palette.append(button);
  });
  if (documentData.palette.length < ANIMATION_MAX_PALETTE_ENTRIES) {
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
function renderAudioPaletteIcon(button, index, color) {
  if (index < 0) {
    button.classList.remove('draw-color--audio-assigned'); button.dataset.musicAssigned = 'false';
    button.querySelector('.draw-audio-instrument-icon')?.remove();
    button.setAttribute('aria-label', '透明色'); button.title = '透明色'; return;
  }
  const instrumentId = audioTimbreApi?.getAssignment?.(index, color) || null;
  button.classList.toggle('draw-color--audio-assigned', Boolean(instrumentId));
  button.dataset.musicAssigned = String(Boolean(instrumentId));
  const existing = button.querySelector('.draw-audio-instrument-icon');
  if (!instrumentId) {
    existing?.remove();
    if (audioTimbreApi) {
      const label = `色 ${index + 1}・未割当。音色タブで設定できます`;
      button.setAttribute('aria-label', label); button.title = label;
    } else {
      button.setAttribute('aria-label', `色 ${index + 1}`); button.title = `色 ${index + 1}`;
    }
    return;
  }
  const icon = getAudioInstrumentIcon(instrumentId);
  const image = existing || document.createElement('img');
  image.className = 'draw-audio-instrument-icon'; image.src = icon.url; image.alt = ''; image.setAttribute('aria-hidden', 'true');
  image.dataset.instrument = instrumentId;
  image.style.filter = audioInstrumentIconFilter(String(color || '').slice(0, 7));
  const label = `色 ${index + 1}・${icon.name}`;
  button.setAttribute('aria-label', label); button.title = label;
  if (!existing) button.append(image);
}
// ---- changing a colour: hue / vividness / lightness sliders and a few quick colours; one undo step per edit ----
let colorEdit = null;
let drawAudioTimbrePanel = null, audioTimbreApi = null;
const colorPanel = mountColorPanel({ scope, getAnchor: () => $('.draw-control-row'), onChange: setEditColor, onClose: closeColorEditor, allowAlpha: true,
  viewTabs: { compactHeader: true, active: 'color', label: '色と音色', items: [{ id: 'color', label: '色' }, { id: 'sound', label: '音色' }],
    onSelect: view => drawAudioTimbrePanel?.onView(view), onEscape: event => drawAudioTimbrePanel?.onEscape(event) === true,
    onHide: () => drawAudioTimbrePanel?.onHide(), onShow: view => drawAudioTimbrePanel?.onShow(view) } });
function linkedToSong() {
  try { const link = readPxdAudioLink(pxdBridge?.currentProject || pxdBridge?.heldProject); return Boolean(link && link.imageRole === pxdImageRole); } catch { return false; }
}
let colorEditorReturnFocus = null;
function openColorEditor(index, sourceElement = null) {
  if (selectionTransform) { toast('✓で確定、×で取消してから色を編集できます。'); return; }
  if (index < 0 || index >= documentData.palette.length || !canEdit()) return;
  cancelSelectionTransform(); selectionPanel?.hide(); editorUi.closePanels(); closeColorEditor();
  colorEditorReturnFocus = sourceElement ? document.querySelector(`.draw-color[data-color-index="${index}"]`) : document.activeElement;
  const base = [...documentData.palette]; colorEdit = { index, base, lease: drawRewardPolicy.capture('draw'), maxColors: ANIMATION_MAX_PALETTE_ENTRIES };
  colorPanel.open({ color: base[index], resetColor: index < DRAW_PALETTE.length ? DRAW_PALETTE[index] : null });
}
function setEditColor(hex) {
  if (!colorEdit) return false;
  const actual = documentData.palette[colorEdit.index];
  if (actual === hex) return actual;
  const candidate = [...documentData.palette]; candidate[colorEdit.index] = hex;
  const previewStats = drawRewardStats(animationSession.animation, { ...documentData, palette: candidate });
  if (colorEdit.lease?.enabled && !colorEdit.lease.entitled && previewStats.freeColors > DRAW_REWARD_LIMITS.colors)
    colorEdit.lease = drawRewardPolicy.capture('draw', { request: true });
  if (!guardDrawDocumentTransition(documentData, { ...documentData, palette: candidate }, { lease: colorEdit.lease, target: drawRewardTarget(animationSession.animation, animationSession.frameId, animationSession.layerId, colorEdit.index) })) return actual;
  documentData.palette = candidate;
  document.querySelector(`.draw-color[data-color-index="${colorEdit.index}"]`)?.style.setProperty('--draw-color', hex);
  saved = false; showCurrentColor(); paint(); pxdBridge?.markDirty(); return hex;
}
function finishColorEdit({ closePanel = true } = {}) {
  const returnFocus = closePanel && colorPanel.element.contains(document.activeElement) ? colorEditorReturnFocus : null;
  if (closePanel) { colorEditorReturnFocus = null; colorPanel.close(); }
  if (!colorEdit) { if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); return; }
  const after = documentData.palette, lease = colorEdit.lease; documentData.palette = colorEdit.base; colorEdit = null;
  const previousLease = drawOperationLease; drawOperationLease = lease;
  try { if (history.commit({ ...documentData, pixels: [...documentData.pixels], palette: after })) saved = false; }
  finally { drawOperationLease = previousLease; }
  renderPalette(); showCurrentColor(); paint();
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
}
function closeColorEditor() { finishColorEdit({ closePanel: true }); }
function beginColorEditForPanel(index = selectedColor) {
  if (colorEdit || index < 0 || index >= documentData.palette.length || !canEdit()) return false;
  colorEdit = { index, base: [...documentData.palette], lease: drawRewardPolicy.capture('draw'), maxColors: ANIMATION_MAX_PALETTE_ENTRIES };
  colorPanel.setColor(colorEdit.base[index], { resetColor: index < DRAW_PALETTE.length ? DRAW_PALETTE[index] : null, beforeColor: colorEdit.base[index] });
  return true;
}
drawAudioTimbrePanel = mountDrawAudioTimbrePanel({ scope, colorPanel, getPalette: () => [...documentData.palette], getSelectedColor: () => selectedColor,
  selectColor: index => {
    if (colorEdit) finishColorEdit({ closePanel: false });
    selectedColor = index; chooseColor(index, document.querySelector(`.draw-color[data-color-index="${index}"]`));
    if (colorPanel.activeView === 'color') beginColorEditForPanel(index);
  },
  onEnterSound: () => finishColorEdit({ closePanel: false }), onEnterColor: () => beginColorEditForPanel(),
  getAudioApi: () => audioTimbreApi });
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
    if (colors.size - Number(colors.has('#00000000')) > 32) break;
  }
  // Transparency is the absence of paint, separate from the shared opaque palette.
  colors.delete('#00000000'); return Math.max(1, colors.size);
}
function canEdit(value = documentData, { shared = false, allowMusicReadOnly = false, lease = drawOperationLease } = {}) {
  if (!shared && !isActive()) return false;
  if (featureSession) { toast('プレビューを適用またはキャンセルしてから編集できます。'); return false; }
  if (cameraOpening) return false;
  if (spriteScaling) { toast('倍率変更の確認が終わるまでお待ちください。'); return false; }
  if (playing) { toast('再生を止めると編集できます。'); return false; }
  if (!allowMusicReadOnly && musicLayer && musicReadOnlyReason && animationSession.animation.layers.find(layer => layer.id === animationSession.layerId)?.role === 'music') { toast(musicReadOnlyReason); return false; }
  if (readOnlyImage) { toast('原本を表示しています。編集するにはプロジェクトのキャンバス設定でサイズと色を合わせてください。'); return false; }
  const policy = evaluateSharedCanvasPolicy({ width: value.width, height: value.height, colorCount: 1 }, { passActive: true });
  if (!policy.supported) { toast('この作品は表示・保存できます。プロジェクトのキャンバス設定で256px以内に合わせると編集できます。'); return false; }
  if (drawRewardPolicy.enabled() && !lease?.entitled && !drawRewardPolicy.hasReward()) {
    const target = drawRewardTarget();
    if (target.layerIndex >= drawRewardPolicy.limits.layers || target.frameIndex >= drawRewardPolicy.limits.frames) {
      toast('選択中の超過レイヤー／コマは表示専用です。特典を再度有効にすると編集できます。'); return false;
    }
  }
  return true;
}
function replaceDocument(nextDocument, nextSource = source, { fromPxd = false } = {}) {
  cancelCamera();
  endStroke(true); clearSelection();
  if (colorEdit) closeColorEditor();
  const nextAnimationSession = createDrawAnimationSession(nextDocument, { musicLayer });
  validateDrawDocument(nextDocument); fitNotice = ''; readOnlyImage = null;
  interactionEffects.clear();
  if (!fromPxd) { pxdBridge?.reset(); pxdImageRole = 'main'; }
  // A staged original belongs only to the document that successfully imported it.
  importedOriginal = null;
  documentData = nextDocument; source = nextSource; activeDraftId = null; baseRevisionId = null; saved = false;
  stopAnimation(); animationSession = nextAnimationSession;
  if (musicLayer) {
    documentData = animationSession.select(animationSession.frameId, animationSession.animation.layers.findLast(layer => layer.role !== 'music').id);
    lastArtLayerId = animationSession.layerId;
  }
  // Cel selection returns the editable document. History must own that exact object.
  history = recordedHistory(createDrawHistory(documentData));
  if (musicLayer) timelapse.reset(documentData);
  syncDrawingSettings(); animationControls?.refresh();
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
function confirmAndDeselect() {
  if (selectionTransform && !confirmSelectionTransform()) return false;
  clearSelection(); toast('編集を確定し、選択を解除しました。'); return true;
}
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
  if (x < 0 || y < 0 || x >= documentData.width || y >= documentData.height) return false;
  const mask = selectionTransform ? selectionTransform.mask(documentData.width, documentData.height) : selectionMask();
  return Boolean(mask?.[y * documentData.width + x]);
}
function selectionOwner() { return { animation: animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId }; }
function selectionOwnerMatches() {
  const owner = selectionTransform?.owner;
  return owner && owner.animation === animationSession.animation && owner.frameId === animationSession.frameId && owner.layerId === animationSession.layerId;
}
function startSelectionTransform() {
  if (selectionTransform) return selectionOwnerMatches();
  if (!selection || animationSession.locked || !canEdit()) return false;
  selectionRewardLease = drawOperationLease || drawRewardPolicy.capture('draw');
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
  selectionTransform = null; selectionPreview = null; selectionError = ''; selectionRewardLease = null;
  paint(); placeSelection(); return true;
}
function confirmSelectionTransform() {
  if (!selectionTransform || !selectionOwnerMatches() || animationSession.locked || !canEdit(documentData, { lease: selectionRewardLease })) return false;
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
    const previousLease = drawOperationLease; drawOperationLease = selectionRewardLease || previousLease;
    try { commitSelectionDocument(next, previousBounds, selection, prepared); } finally { drawOperationLease = previousLease; }
    selectionRewardLease = null;
    renderPalette(); showCurrentColor(); paint(); placeSelection(); canvas.focus({ preventScroll: true });
    if (bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > documentData.width || bounds.y + bounds.height > documentData.height) toast('キャンバス外の部分は切り取りました。「戻す」で復元できます。');
    return true;
  } catch (error) { selectionError = error.message; selectionPanel?.sync(); toast(error.message); return false; }
}
function selectionPanelState() {
  const editable = !playing && !readOnlyImage && !animationSession.locked, busy = drawingInputBusy();
  const hasPixels = selectionHasPixels();
  return { bounds: selectionFrame(), colorMode: selectedMode(lastInputSide) === 'color', selectTool: inputSettings.bindings[lastInputSide].tool === 'select', canConfigure: editable && !featureSession && !cameraOpening, pending: Boolean(selectionTransform), busy, hasClipboard: selectionClipboard.hasValue, error: selectionError,
    canCopy: Boolean(hasPixels && !selectionTransform && !playing && !readOnlyImage && !busy),
    canCut: Boolean(hasPixels && !selectionTransform && editable && !busy), canPaste: Boolean(selectionClipboard.hasValue && editable && !selectionTransform && !busy), canTransform: Boolean(hasPixels && editable) };
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
  if (featureSession) return false;
  if (action === 'back') { setTool('select'); canvas.focus({ preventScroll: true }); return true; }
  if (action === 'deselect') { endStroke(); return confirmAndDeselect(); }
  if (action === 'cancel') { cancelDrawingInput(); return cancelSelectionTransform(); }
  if (action === 'confirm') { endStroke(); return confirmAndDeselect(); }
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
    selectionRewardLease = drawRewardPolicy.capture('draw');
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
  getToolOptions: () => ({ binding: inputSettings.bindings[lastInputSide], side: lastInputSide }),
  onToolOption: (key, side, value) => {
    if (!selectionPanelState().canConfigure || drawingInputBusy() || selection || selectionTransform) return false;
    const binding = inputSettings.bindings[side];
    if (key === 'filled' && /^(rectangle|ellipse)(-fill)?$/.test(binding.tool)) return setTool(binding.tool.replace(/-fill$/, '') + (value ? '-fill' : ''), side);
    if (key !== 'contiguous' || binding.tool !== 'fill') return false;
    binding.contiguous = value; syncInputControls(); return true;
  },
  beforeOpen: () => { cancelDrawingInput(); $('#draw-settings-picker').open = true; placeSettingsPanel(); } });
function featureBlockedReason() {
  if (cameraOpening) return 'カメラを閉じてから使ってください。';
  if (spriteScaling) return '倍率変更の確認が終わってから使ってください。';
  if (playing) return '再生を止めてから使ってください。';
  if (readOnlyImage) return '原本表示中は編集できません。';
  if (animationSession.locked) return 'レイヤーの鍵を外してから使ってください。';
  if (!evaluateSharedCanvasPolicy({ width: documentData.width, height: documentData.height, colorCount: 1 }, { passActive: true }).supported)
    return 'キャンバスは256pxまで編集できます。';
  if (selectionTransform) return '選択の変形を確定または取消してから使ってください。';
  return '';
}
function featureGetState() {
  return { document: documentData, animation: animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId,
    selectionMask: selectionMask(), colorIndex: Math.max(0, effectiveColor()), maxPalette: 128, blockedReason: featureBlockedReason() };
}
function restoreFeatureInert() {
  featureInertSnapshot?.forEach(([node, inert]) => { if (node.isConnected) node.inert = inert; });
  featureInertSnapshot = null;
}
function setFeatureInert(panel) {
  if (!featureInertSnapshot) featureInertSnapshot = [...$('#main').children].map(node => [node, node.inert]);
  for (const node of $('#main').children) node.inert = node === panel ? false : true;
}
function beginDrawFeature(kind) {
  if (featureSession) return false;
  const reason = featureBlockedReason(); if (reason) { toast(reason); return false; }
  endStroke(); cancelDrawingInput(); closeColorEditor(); editorUi.closePanels(); animationControls?.close?.(); selectionPanel.hide();
  drawOperationLease = drawRewardPolicy.capture('draw');
  const panel = kind === 'color' ? colorAdjustmentPanel?.panel : textPanel?.panel;
  featureSession = { kind, animation: animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId, document: documentData };
  featurePreviewAnimation = null; selectionPreview = null;
  if (kind === 'color' && panel) setFeatureInert(panel);
  updateControls(); return true;
}
function featureSourceMatches(payload = {}) {
  const owner = featureSession;
  return owner && owner.animation === animationSession.animation && owner.frameId === animationSession.frameId && owner.layerId === animationSession.layerId
    && owner.document === documentData && (!payload.sourceDocument || payload.sourceDocument === owner.document);
}
function featureDocumentWithinPolicy(doc) {
  return evaluateSharedCanvasPolicy({ width: doc.width, height: doc.height, colorCount: 1 }, { passActive: true }).supported;
}
function previewDrawFeature(value) {
  if (!featureSourceMatches()) return false;
  const data = value?.document || value?.doc ? value : { document: value };
  featurePreviewAnimation = data.animation || null;
  selectionPreview = data.document || data.doc || (featurePreviewAnimation ? getAnimationCelDocument(featurePreviewAnimation, featureSession.frameId, featureSession.layerId) : null);
  if (!selectionPreview) return false;
  paint(); return true;
}
function clearDrawFeature() {
  featureSession = null; featurePreviewAnimation = null; selectionPreview = null; restoreFeatureInert(); paint(); updateControls();
}
function applyDrawFeature(value) {
  if (!featureSourceMatches(value)) return false;
  const session = featureSession, nextDocument = value?.document || value?.doc || (Array.isArray(value?.pixels) ? value : null), nextAnimation = value?.animation || null;
  featureSession = null;
  try {
    if (nextAnimation) {
      const activeDocument = nextDocument || getAnimationCelDocument(nextAnimation, session.frameId, session.layerId);
      validateDrawDocument(activeDocument);
      if (!evaluateSharedCanvasPolicy({ width: activeDocument.width, height: activeDocument.height, colorCount: 1 }, { passActive: true }).supported
          || !guardDrawTransition(nextAnimation, { lease: drawOperationLease, target: drawRewardTarget(nextAnimation, session.frameId, session.layerId), documentOverride: activeDocument })) {
        featureSession = session; toast('この編集は現在の色・レイヤー・コマ上限を超えています。'); updateControls(); return false;
      }
      installAnimationDocument(animationSession.apply(nextAnimation, { frameId: session.frameId, layerId: session.layerId }));
      pxdBridge?.markDirty();
    } else {
      validateDrawDocument(nextDocument);
      if (!featureDocumentWithinPolicy(nextDocument) || !guardDrawDocumentTransition(documentData, nextDocument, { lease: drawOperationLease })) { featureSession = session; toast('この編集は256pxまたは現在の色上限を超えています。'); updateControls(); return false; }
      // Validate palette and sparse animation budgets before the live history
      // document can mutate. A rejected preview must remain safe to cancel.
      const prepared = animationSession.prepareDocument(nextDocument);
      preparedSelectionCommit = prepared;
      let committed;
      try { committed = history.commit(nextDocument); } finally { preparedSelectionCommit = null; }
      if (!committed) { featureSession = session; updateControls(); return false; }
      renderPalette(); showCurrentColor(); paint();
    }
    selectionPreview = null; featurePreviewAnimation = null; saved = false; clearDrawFeature(); toast('編集を1回で適用しました。戻す操作で元に戻せます。'); return true;
  } catch (error) { featureSession = session; updateControls(); throw error; }
}
let colorAdjustmentPanel = null, textPanel = null;
const lazyFeaturePanels = mountLazyDrawFeaturePanels({ scope, host: $('#main'), isActive,
  callbacks: { getState: featureGetState, onBegin: beginDrawFeature, onPreview: previewDrawFeature,
    onApply: applyDrawFeature, onCancel: clearDrawFeature, onLayout: placeOverlays } });
colorAdjustmentPanel = lazyFeaturePanels.color;
textPanel = lazyFeaturePanels.text;
brushSettingsPanel = mountDrawBrushSettings({ scope, host: $('#main'),
  getState: () => ({ bindings: inputSettings.bindings, side: lastInputSide, toolNames: TOOL_NAMES,
    blockedReason: featureBlockedReason() || (featureSession ? '開いている編集を閉じてから使ってください。' : '') }),
  beforeOpen: () => { cancelDrawingInput(); closeColorEditor(); editorUi.closePanels(); animationControls?.close?.(); selectionPanel.hide(); },
  onChange: (side, key, value) => {
    if (featureBlockedReason() || featureSession) return false;
    cancelDrawingInput(); inputSettings.bindings[side][key] = value; syncInputControls(); return true;
  }
});
$('.draw-settings-panel').prepend($('#draw-mirror-rail'));
const featureActions = $('.draw-feature-actions');
// Stable slots survive lazy panel replacement and desktop/mobile reparenting.
const colorSlot = document.createElement('div'); colorSlot.className = 'draw-color-adjustment-slot';
colorSlot.append(colorAdjustmentPanel.opener); fixedLeft.append(colorSlot);
const textSlot = document.createElement('div'); textSlot.className = 'draw-text-tool-slot';
textSlot.append(textPanel.opener); $('.draw-tool-menu .draw-tool-group').append(textSlot);
if (featureActions) {
  featureActions.append(brushSettingsPanel.inlineControl, selectionPanel.deselectButton);
}
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
let overlayResizeFrame = 0;
const overlayObserver = new ResizeObserver(() => {
  if (scope.disposed || overlayResizeFrame) return;
  overlayResizeFrame = requestAnimationFrame(() => {
    overlayResizeFrame = 0;
    if (!scope.disposed && !$('#main').hidden) placeOverlays();
  });
});
scope.add(() => cancelAnimationFrame(overlayResizeFrame));
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
  const gridAvailable = !readOnlyImage, onionAvailable = gridAvailable && frames >= 2 && !playing;
  // Retain the user's preferences, but show an active state only when the
  // corresponding guide can actually appear on this canvas.
  setAttributeIfChanged(gridButton, 'aria-pressed', showGrid && gridAvailable);
  setAttributeIfChanged(onionButton, 'aria-pressed', onion && onionAvailable);
  if (gridButton) { gridButton.disabled = !gridAvailable; gridButton.title = gridAvailable ? gridButton.getAttribute('aria-label') : '原本の表示中はマス目を使えません'; }
  if (onionButton) { onionButton.disabled = !onionAvailable; onionButton.title = readOnlyImage ? '原本の表示中はオニオンスキンを使えません' : playing ? '再生を止めると前後のコマを表示できます' : frames < 2 ? '2コマ以上あると前後のコマを表示できます' : onionButton.getAttribute('aria-label'); }
  $('.draw-board')?.classList.toggle('has-symmetry', available && Object.values(symmetry).some(Boolean));
  $('.draw-board')?.classList.toggle('has-grid', showGrid && gridAvailable);
  syncMirrorRail();
  placeOverlays();
}
function markSegment(from, to, value) {
  const changed = [];
  const flags = drawingSymmetry();
  for (const matrix of symmetryTransforms(flags)) changed.push(...strokePixels(documentData, symmetryPoint(from, documentData.width, documentData.height, matrix, flags.origin), symmetryPoint(to, documentData.width, documentData.height, matrix, flags.origin), value, { trusted: true, tracker: strokeTracker, mask: selectionMask(), brushSize: (strokeBinding || inputSettings.bindings[lastInputSide]).brushSize, brushTransform: matrix }));
  return changed;
}
function pickColorAt(point) {
  if (point.x < 0 || point.y < 0 || point.x >= documentData.width || point.y >= documentData.height) return;
  const value = documentData.pixels[point.y * documentData.width + point.x];
  const button = document.querySelector(`.draw-color[data-color-index="${value}"]`);
  const side = strokeBinding?.side || lastInputSide || 'left';
  chooseColor(value, button, side); setTool('pen', side); toast(value < 0 ? '透明をとりました' : 'この色をとりました');
}
function selectionToolLabel(mode) { return mode === 'color' ? '同じ色選択' : mode === 'lasso' ? '投げ縄選択' : '四角形選択'; }
function selectedMode(side) { return inputSettings.bindings[side]?.selectMode || 'rectangle'; }
function setSelectionMode(mode, side = 'left') {
  if (!['rectangle', 'color', 'lasso'].includes(mode)) return false;
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
  if (next !== 'select') selectionPanel?.setMode('tool');
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
  return drawShapePixels(documentData, from, to, selectedPixelValue(), { shape: effectiveTool().startsWith('rectangle') ? 'rectangle' : 'ellipse', filled: effectiveTool().endsWith('-fill'), brushSize: (strokeBinding || inputSettings.bindings[lastInputSide]).brushSize, symmetry: drawingSymmetry(), tracker: strokeTracker, mask: selectionMask() });
}
function markSpray(from, to) { return sprayPixels(documentData, from, to, selectedPixelValue(), { radius: ((strokeBinding || inputSettings.bindings[lastInputSide]).spraySize - 1) / 2, symmetry: drawingSymmetry(), tracker: strokeTracker, mask: selectionMask() }); }
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
  } else if (selectionDrag?.mode === 'modify') {
    if (selectionDrag.colorPoint) return;
    selectionDrag.range = selectionBounds(lineStart, point, documentData.width, documentData.height);
    if (!selectionTransform) selection = combineDrawInputSelection(selectionDrag.bounds, selectionDrag.range, selectionDrag.operation, documentData.width, documentData.height);
  } else if (selectionDrag?.mode === 'lasso') {
    const points = selectionDrag.points, previous = points.at(-1), distance = Math.hypot(point.x - previous.x, point.y - previous.y);
    if (distance > .01) points.push(point);
    // Polygon edges are straight already; keep raw input points and cap the
    // scanline rasterizer to a bounded amount of work on very long gestures.
    if (points.length > 512) selectionDrag.points = [points[0], ...points.slice(1, -1).filter((_, index) => index % 2 === 0), points.at(-1)];
    else selectionDrag.points = points;
    const incoming = lassoDrawSelection(selectionDrag.points, documentData.width, documentData.height);
    selection = incoming ? combineDrawInputSelection(selectionDrag.bounds, incoming, selectionDrag.operation, documentData.width, documentData.height) : selectionDrag.bounds;
  } else if (!['outside', 'flip', 'empty'].includes(selectionDrag?.mode)) selection = selectionBounds(lineStart, point, documentData.width, documentData.height);
  placeSelection();
}
let pendingTap = null; let pendingTapPointerId = null; let pendingTapMode = null; let pendingTapMask = 1; let pendingTapOperation = 'replace'; let pendingTapScreenOrigin = null; let pendingTapClearOutside = false; let drawingPointerId = null; let panDrag = null; let spaceHeld = false; let fingerTap = null;
function handleCanvasPointerDown(event) {
  if (virtualCursor?.realDown(event)) return;
  if (featureSession) return;
  if (event.button !== undefined && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
  event.preventDefault(); canvas.focus({ preventScroll: true });
  if (!event.virtual) { try { canvas.setPointerCapture(event.pointerId); } catch { /* Synthetic input has no native capture. */ } }
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (event.pointerType === 'touch' && activePointers.size >= 2) { pendingTap = null; pendingTapPointerId = null; pendingTapMode = null; pendingTapScreenOrigin = null; pendingTapClearOutside = false; if (fingerTap && !pinchStart) { const tail = fingerTap; fingerTap = null; startPinch(); Object.assign(pinchStart, { time: tail.time, fingers: Math.max(tail.fingers, activePointers.size), moved: tail.moved }); return; } if (pinchStart) { pinchStart.fingers = Math.max(pinchStart.fingers, activePointers.size); return; } startPinch(); return; }
  // desktop: middle button, or Space held, drags the view
  if (event.button === 1 || spaceHeld) { if (!panDrag && !drawing && !pendingTap) { panDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX, panY }; canvas.classList.add('is-panning'); } return; }
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
  const inside = inputTool === 'select' && selectionMember(touchedPoint);
  const selectionModified = Boolean(event.ctrlKey || event.metaKey || event.shiftKey);
  const selectionOperation = (event.pointerType === 'touch' || event.virtual) && !event.ctrlKey && !event.metaKey && !event.shiftKey ? 'add' : selectionInputOperation(event);
  if (inputTool === 'select' && selectedMode(side) === 'color' && !selectionTransform && !selectionHandle
      && (!inside || selectionModified)
      && (!selection || selectionOperation !== 'replace')) {
    lastInputSide = side; strokeBinding = binding; drawOperationLease = captureDrawOperation(); syncDrawingSettings(); pendingTap = touchedPoint; pendingTapPointerId = event.pointerId; pendingTapMode = 'color'; pendingTapMask = binding.mask; pendingTapOperation = selectionOperation;
    pendingTapScreenOrigin = { x: event.clientX, y: event.clientY };
    pendingTapClearOutside = Boolean(selection && (event.pointerType === 'touch' || event.virtual)
      && !event.ctrlKey && !event.metaKey && !event.shiftKey && !selectionMember(touchedPoint));
    return;
  }
  lastInputSide = side; strokeBinding = binding; syncDrawingSettings();
  const writeColor = inputTool === 'eraser' ? -1 : binding.color;
  const allUsedIndices = getAnimationUsedColorIndices(animationSession.animation);
  const usedKeys = new Set([...allUsedIndices].map(index => index < 0 ? null : drawColorKey(animationSession.animation.palette[index])).filter(Boolean));
  const candidateKey = writeColor < 0 ? null : drawColorKey(documentData.palette[writeColor]);
  const stats = drawRewardStats(animationSession.animation);
  const needsColorReward = candidateKey && !usedKeys.has(candidateKey) && stats.freeColors >= drawRewardPolicy.limits.colors;
  drawOperationLease = captureDrawOperation({ request: Boolean(needsColorReward) });
  const freeColorLimitReached = drawOperationLease.enabled && !drawOperationLease.entitled
    && candidateKey && !usedKeys.has(candidateKey) && stats.freeColors >= drawRewardPolicy.limits.colors;
  const rewardColorLimitReached = drawOperationLease.enabled && drawOperationLease.entitled
    && candidateKey && !usedKeys.has(candidateKey) && stats.colors >= drawRewardPolicy.limits.rewardColors;
  const coreColorLimitReached = candidateKey && !usedKeys.has(candidateKey) && stats.colors >= ANIMATION_MAX_PALETTE_ENTRIES;
  if (freeColorLimitReached || rewardColorLimitReached || coreColorLimitReached) {
    activePointers.delete(event.pointerId); strokeBinding = null; drawOperationLease = null;
    toast(freeColorLimitReached && drawRewardPolicy.limits.rewardColors > drawRewardPolicy.limits.colors
      ? `無料で編集できる色は${drawRewardPolicy.limits.colors}色までです。特典中は${drawRewardPolicy.limits.rewardColors}色まで使えます。`
      : `使用中の色は最大${drawRewardPolicy.limits.rewardColors}色です。`); return;
  }
  strokeWasSaved = saved;
  drawing = true; drawingPointerId = event.pointerId; previousPoint = touchedPoint;
  updateControls();
  if (inputTool === 'picker' || inputTool === 'fill') { pendingTap = touchedPoint; pendingTapPointerId = event.pointerId; pendingTapMode = 'tap'; drawing = false; drawingPointerId = null; previousPoint = null; selectionPanel.sync(); return; }
  if (inputTool === 'select') {
    lineStart = touchedPoint;
    const handle = selectionHandle;
    const hadTransform = Boolean(selectionTransform);
    const origin = exactSelectionPoint(event), screenOrigin = { x: event.clientX, y: event.clientY };
    const gestureKind = selectionGestureKind({ selectionMode: selectedMode(side), operation: selectionOperation, handle, altKey: event.altKey, inside, modified: selectionModified });
    if (gestureKind === 'lasso') {
      const bounds = selectionTransform ? { ...selectionTransform.rect, mask: selectionTransform.mask(documentData.width, documentData.height) } : selection;
      selectionDrag = { mode: 'lasso', operation: selectionOperation, bounds, transaction: selectionTransform, points: [origin], origin, screenOrigin, pointerType: event.pointerType, virtual: Boolean(event.virtual) };
    } else if (gestureKind === 'modify') {
      selectionDrag = { mode: 'modify', operation: selectionOperation, origin, screenOrigin, pointerType: event.pointerType, virtual: Boolean(event.virtual), bounds: selection, transaction: selectionTransform,
        ...(selectedMode(side) === 'color' ? { colorPoint: touchedPoint } : {}), range: selectionBounds(touchedPoint, touchedPoint, documentData.width, documentData.height) };
      if (!selectionTransform) selection = combineDrawInputSelection(selectionDrag.bounds, selectionDrag.range, selectionOperation, documentData.width, documentData.height);
    } else if (handle?.startsWith('flip')) {
      selectionDrag = { mode: 'flip', handle, origin, screenOrigin, pointerType: event.pointerType };
    } else if ((handle || inside) && !animationSession.locked && startSelectionTransform()) {
      const state = selectionTransform.state, r = canvas.getBoundingClientRect(), minRadius = 6 / Math.min(r.width / canvas.width, r.height / canvas.height);
      const corner = ['nw', 'ne', 'sw', 'se'].includes(handle);
      if (corner && Math.hypot(origin.x - state.pivot.x, origin.y - state.pivot.y) <= minRadius) {
        drawing = false; drawingPointerId = null; strokeBinding = null; if (!hadTransform) cancelSelectionTransform(); placeSelection(); toast('中心に近い角です。別の角、中心の移動、または数値補助で調整してください。'); return;
      }
      selectionDrag = { mode: handle === 'pivot' ? 'pivot' : corner ? 'corner' : 'move', handle, origin, screenOrigin, bounds: { ...selection }, state,
        createdTransaction: !hadTransform, minRadius, lastBearing: Math.atan2(origin.y - state.pivot.y, origin.x - state.pivot.x), angleDelta: 0 };
    } else if (inside && event.pointerType !== 'touch' && !event.virtual) {
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
  if (panDrag) {
    if (event.pointerId !== panDrag.pointerId) return;
    if (event.pointerType === 'mouse' && event.buttons === 0) { releasePointer({ type: 'pointerup', pointerId: event.pointerId, pointerType: event.pointerType, buttons: 0 }); return; }
    panX = panDrag.panX + event.clientX - panDrag.x; panY = panDrag.panY + event.clientY - panDrag.y; updateCanvasView(); return;
  }
  if (pinchStart && activePointers.size >= 2) {
    if (!activePointers.has(event.pointerId)) return;
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
  const selected = drawing && effectiveTool() === 'select' && ['select', 'lasso'].includes(selectionDrag?.mode) && !cancel;
  drawing = false; drawingPointerId = null; previousPoint = null; lineStart = null; selectionDrag = null; strokeBinding = null; placeSelection(); if (hadBinding) syncDrawingSettings();
  if (selected && selection) { selectionPanel.setMode('select'); toast('選択の内側をドラッグして移動、四隅で拡縮＋回転。外をタップすると確定・解除。外からタッチドラッグで追加選択。'); }
  if (endedSelectionDrag?.createdTransaction && selectionTransform && (cancel || sameSelectionFrame(endedSelectionDrag.state, selectionTransform.state))) cancelSelectionTransform();
  if (!cancel && releaseEvent?.type === 'pointerup' && endedSelectionDrag) finishSelectionRelease(endedSelectionDrag, releaseEvent);
  drawOperationLease = null; updateControls(); setDrawRewardNotice();
}
function sameSelectionFrame(a, b) {
  return ['x', 'y', 'width', 'height', 'angle'].every(k => Math.abs(a[k] - b[k]) < 1e-7) && Boolean(a.flipX) === Boolean(b.flipX) && Boolean(a.flipY) === Boolean(b.flipY)
    && Math.hypot(a.pivot.x - b.pivot.x, a.pivot.y - b.pivot.y) < 1e-7;
}
function finishSelectionRelease(drag, event) {
  const distance = Math.max(drag.maxDistance || 0, Math.hypot(event.clientX - drag.screenOrigin?.x, event.clientY - drag.screenOrigin?.y)), threshold = drag.pointerType === 'touch' ? 10 : 6;
  if (distance <= threshold && ['modify', 'lasso'].includes(drag.mode) && (drag.operation === 'replace' || drag.pointerType === 'touch' || drag.pointerType === 'virtual' || drag.virtual)) {
    const withinViewport = (() => { const r = $('.draw-board').getBoundingClientRect(); return event.clientX >= r.left && event.clientX < r.right && event.clientY >= r.top && event.clientY < r.bottom; })();
    const originSelected = drag.bounds && drawSelectionMask(drag.bounds, documentData.width, documentData.height)?.[Math.floor(drag.origin.y) * documentData.width + Math.floor(drag.origin.x)];
    if (withinViewport && drag.bounds && !originSelected) {
      if (selectionTransform && !confirmSelectionTransform()) return;
      clearSelection(); toast('編集を確定し、選択を解除しました。'); return;
    }
  }
  if (drag.mode === 'flip') {
    if (distance <= threshold && selectionHandleAtEvent(event) === drag.handle) runSelectionAction(drag.handle);
    return;
  }
  if (drag.mode === 'modify') {
    if (selectionTransform !== drag.transaction && drag.transaction) return;
    if (selectionTransform && !confirmSelectionTransform()) return;
    const base = drag.transaction ? selection : drag.bounds;
    const incoming = drag.colorPoint ? selectDrawColorMask(documentData, drag.colorPoint) : drag.range;
    selection = combineDrawInputSelection(base, incoming, drag.operation, documentData.width, documentData.height);
    selectionPanel.setMode('select'); placeSelection(); return;
  }
  if (drag.mode === 'lasso') {
    if (drag.transaction && selectionTransform !== drag.transaction) return;
    if (selectionTransform && !confirmSelectionTransform()) return;
    const base = drag.transaction ? selection : drag.bounds;
    selection = combineDrawLassoSelection(base, drag.points, drag.operation, documentData.width, documentData.height,
      selectionBounds(drag.origin, drag.origin, documentData.width, documentData.height));
    selectionPanel.setMode('select'); placeSelection(); return;
  }
  if (drag.mode !== 'outside' || selectionTransform !== drag.transaction) return;
  if (distance <= threshold) {
    const viewport = $('.draw-board').getBoundingClientRect();
    if (event.clientX >= viewport.left && event.clientX < viewport.right && event.clientY >= viewport.top && event.clientY < viewport.bottom) confirmAndDeselect();
    return;
  }
  if (selectionTransform && !confirmSelectionTransform()) return;
  const next = selectionBounds(drag.origin, exactSelectionPoint(event), documentData.width, documentData.height);
  if (next) { selection = next; selectionPanel.setMode('select'); placeSelection(); }
}
function applyTap(point) {
  if (effectiveTool() === 'picker') { pickColorAt(point); return; }
  commitChange((next) => symmetryPoints(point, next.width, next.height, drawingSymmetry()).flatMap(p => [...floodFill(next, p.x, p.y, selectedPixelValue(), { mask: selectionMask(), contiguous: (strokeBinding || inputSettings.bindings[lastInputSide]).contiguous })]));
}
function releasePointer(event) {
  if (virtualCursor?.realRelease(event)) return;
  if (event.type === 'pointerup' && event.pointerType === 'mouse' && strokeBinding && typeof event.buttons === 'number' && (event.buttons & strokeBinding.mask)) return;
  if (event.type === 'lostpointercapture' && event.pointerType === 'mouse' && drawing
      && event.pointerId === drawingPointerId && activePointers.has(event.pointerId)) {
    // Some desktop releases/chords deliver capture loss before their up. Preserve
    // only already accepted drawing samples, as in the existing mouse-release fix.
    // Selection gestures restore their checkpoint; pending taps never execute here.
    activePointers.delete(event.pointerId); endStroke(effectiveTool() === 'select'); return;
  }
  if (event.type === 'pointerup' && drawing && event.pointerId === drawingPointerId && activePointers.has(event.pointerId)) {
    applyDrawPoint(pointFromEvent(event), event);
  }
  const wasActive = activePointers.delete(event.pointerId);
  // A late lostpointercapture or a non-owning pointer must not finish a newer gesture.
  if (!wasActive) return;
  if (panDrag) { if (event.pointerId === panDrag.pointerId) { panDrag = null; canvas.classList.remove('is-panning'); } return; }
  if (pendingTap && event.pointerId === pendingTapPointerId) {
    const tap = pendingTap, mode = pendingTapMode, side = lastInputSide; pendingTap = null; pendingTapPointerId = null; pendingTapMode = null;
    const clearOutside = pendingTapClearOutside && pendingTapScreenOrigin
      && Math.hypot(event.clientX - pendingTapScreenOrigin.x, event.clientY - pendingTapScreenOrigin.y) <= (event.pointerType === 'touch' ? 10 : 6)
      && (() => { const r = $('.draw-board').getBoundingClientRect(); return event.clientX >= r.left && event.clientX < r.right && event.clientY >= r.top && event.clientY < r.bottom; })();
    pendingTapScreenOrigin = null; pendingTapClearOutside = false;
    if (event.type === 'pointerup' && !pinchStart && activePointers.size === 0) {
      if (mode === 'color') {
        if (clearOutside && pendingTapOperation === 'add' && selection && !selectionMember(tap)) { clearSelection(); toast('編集を確定し、選択を解除しました。'); }
        else {
          const selected = selectDrawColorMask(documentData, tap);
          if (selected) { lastInputSide = side; selection = combineDrawInputSelection(selection, selected, pendingTapOperation, documentData.width, documentData.height); selectionDrag = null; selectionPanel?.setMode('select'); placeSelection(); syncDrawingSettings(); toast(`${selectionToolLabel('color')}の選択を更新しました。`); }
        }
      } else applyTap(tap);
    }
    strokeBinding = null; drawOperationLease = null; syncDrawingSettings(); updateControls(); setDrawRewardNotice(); return;
  }
  if (!activePointers.size) { pendingTap = null; pendingTapPointerId = null; pendingTapMode = null; pendingTapScreenOrigin = null; pendingTapClearOutside = false; }
  if (event.type !== 'pointerup' && (pinchStart || fingerTap)) { cancelDrawingInput(); return; }
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
  endStroke(event.type !== 'pointerup', event);
}
canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);
// Only pointers registered by the canvas (or its selection controls) may continue here.
// This also supplies a fallback for a missing capture without taking UI-started input.
scope.listen(document, 'pointermove', event => { if (!event.virtual && event.target !== canvas && activePointers.has(event.pointerId)) handleCanvasPointerMove(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) scope.listen(document, type, event => { if (event.target !== canvas && activePointers.has(event.pointerId)) releasePointer(event); });
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
  isBlocked: () => !isActive() || $('#main').inert || $('#main').hidden || document.body.hasAttribute('data-tool-result-open')
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
  if (projectSettingsRequest) { projectSettingsRequest({ width, height }); return false; }
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
    const lease = captureDrawOperation();
    if (!guardDrawTransition(next, { lease, mutation: 'resize' })) { drawOperationLease = null; return false; }
    resizeViewStates.set(next, view);
    installAnimationDocument(animationSession.apply(next));
    syncSizeButtons(true); pxdBridge?.markDirty();
    status.textContent = `${width}×${height}にしました。${cropped ? '外側を切り取りました。戻すで元に戻せます。' : '絵の1pxはそのまま、余白を広げました。'}`; return true;
  } catch (error) { status.textContent = `サイズを変更できませんでした：${error.message}`; return false; }
}
function spriteScaleBlockedReason() {
  if (spriteScaling) return '保存容量を確認しています…';
  if (cameraOpening) return 'カメラの操作を終えてから倍率を変更できます。';
  if (readOnlyImage) return '原本を表示しています。編集できるサイズ・色数へ合わせてから倍率を変更できます。';
  if (selectionTransform) return '選択の変形を✓で確定、×で取消してから倍率を変更できます。';
  if (playing) return '再生を止めてから倍率を変更できます。';
  if (colorEdit || drawingInputBusy()) return '現在の色編集・描画操作を終えてから倍率を変更できます。';
  return '';
}
async function scaleSpriteCanvas(percent) {
  const blocked = spriteScaleBlockedReason();
  if (blocked) { toast(blocked); return false; }
  let applied = false, outcomeMessage = '';
  const before = animationSession.animation;
  try {
    const plan = planSpriteScale(before, percent);
    if (!plan.allowed) { outcomeMessage = plan.reason; return false; }
    if (!plan.changed) { outcomeMessage = '丸め後のサイズが現在と同じため変更はありません。'; return false; }
    const next = scaleSpriteAnimation(before, percent);
    const lease = drawRewardPolicy.capture('draw');
    if (!guardDrawTransition(next, { lease, mutation: 'sprite-scale' })) { outcomeMessage = '特典外では超過レイヤー・コマを含む倍率変更はできません。作品は保持されています。'; return false; }
    const originalSelection = selection, originalDocument = documentData;
    const bridge = pxdBridge, project = bridge?.currentProject || bridge?.heldProject, role = musicLayer ? 'main' : pxdImageRole;
    spriteScaling = true; updateControls();
    // Use the ordinary immutable PXD writer to check combined image/music and
    // poster capacity before replacing the live document or creating an Undo entry.
    if (project) {
      const poster = composeOutputFrame(next, next.frames[0].id, { includeMusic: false });
      let candidate = role === 'main' ? await putPxdSharedImage(project, poster) : await putPxdImage(project, poster, role);
      candidate = await writePxdAnimation(candidate, next, { role, posterFrameId: next.frames[0].id });
    }
    if (scope.disposed || animationSession.animation !== before || documentData !== originalDocument
      || selection !== originalSelection || pxdBridge !== bridge || pxdImageRole !== role
      || (bridge?.currentProject || bridge?.heldProject) !== project || selectionTransform || playing || cameraOpening) {
      outcomeMessage = '確認中に操作対象が変わりました。現在の作品から倍率を指定し直してください。';
      return false;
    }
    const view = resizeViewState();
    resizeViewStates.set(before, view);
    resizeViewStates.set(next, resizeDrawView(view, before.width, before.height, next.width, next.height, { resample: 'nearest' }));
    closeColorEditor(); sizeWasChosen = true;
    installAnimationDocument(animationSession.apply(next));
    syncSizeButtons(true); pxdBridge?.markDirty(); applied = true;
    outcomeMessage = `${percent}%で${next.width}×${next.height}pxにしました。全コマ・全レイヤーを変更しました。戻すで復元できます。`;
    return true;
  } catch (error) {
    outcomeMessage = `倍率を変更できませんでした：${error.message}`;
    if (!scope.disposed) spriteScalePanel?.reportFailure?.(outcomeMessage, before, percent);
    return false;
  } finally {
    spriteScaling = false;
    if (!scope.disposed) { updateControls(); if (applied) canvasSettingsPanel.position(); if (outcomeMessage) toast(outcomeMessage); }
  }
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
  brushSettingsPanel?.sync(); selectionPanel?.sync();
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
  // Desktop draw UI owns the viewport's position while active. The resize
  // handler still runs on the breakpoint transition; wait for its placeholder
  // restoration, then reapply the compact editor's normal DOM order.
  if (document.body.classList.contains('draw-desktop-active')) return;
  const horizontal = matchMedia('(min-width: 900px), (orientation: landscape) and (min-width: 560px)').matches;
  // Keep DOM/tab order aligned with visible placement. Portrait stays canvas then controls.
  if (horizontal && inputSettings.controlsSide === 'left') viewport.before(dock);
  else dock.before(viewport);
  requestAnimationFrame(() => { placeOverlays(); placeToolMenu(); placeSettingsPanel(); });
}
scope.listen(window, 'draw-desktop-layout-restored', applyControlsPlacement);
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
spriteScalePanel = mountDrawSpriteScalePanel({ scope, root: $('.draw-canvas-panel'),
  getState: () => ({ animation: animationSession.animation, blockedReason: spriteScaleBlockedReason(), readOnlyDimensions: readOnlyImage && { width: readOnlyImage.width, height: readOnlyImage.height } }),
  plan: planSpriteScale, onApply: scaleSpriteCanvas, onLayout: () => canvasSettingsPanel.position() });
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
  spriteScalePanel?.sync();
  brushSettingsPanel?.sync();
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
function undo(shared = false) {
  if (featureSession || drawingInputBusy()) return false;
  if (selectionTransform) { cancelDrawingInput(); return cancelSelectionTransform(); }
  if (!canEdit(documentData, { shared, allowMusicReadOnly: true })) return false;
  const lease = drawRewardPolicy.capture('draw');
  const candidate = animationSession.snapshot().timeline.past.at(-1);
  if (candidate && !guardDrawTransition(candidate, { lease, target: drawRewardTarget(), mutation: 'history' })) return false;
  closeColorEditor(); const doc = animationSession.undo(); if (!doc) return false; installAnimationDocument(doc); pxdBridge?.markDirty(); setDrawRewardNotice(); return true;
}
function redo(shared = false) {
  if (featureSession || selectionTransform || drawingInputBusy() || !canEdit(documentData, { shared, allowMusicReadOnly: true })) return false;
  const lease = drawRewardPolicy.capture('draw');
  const candidate = animationSession.snapshot().timeline.future.at(-1);
  if (candidate && !guardDrawTransition(candidate, { lease, target: drawRewardTarget(), mutation: 'history' })) return false;
  closeColorEditor(); const doc = animationSession.redo(); if (!doc) return false; installAnimationDocument(doc); pxdBridge?.markDirty(); setDrawRewardNotice(); return true;
}
function resetDrawingInput(cancel = true) {
  virtualCursor?.cancelInputs(cancel); if (!cancel && pendingTap && pendingTapMode !== 'color') applyTap(pendingTap);
  pendingTap = null; pendingTapPointerId = null; pendingTapMode = null; pendingTapScreenOrigin = null; pendingTapClearOutside = false; endStroke(cancel);
  activePointers.clear(); pinchStart = null; fingerTap = null; panDrag = null; spaceHeld = false;
  canvas.classList.remove('is-panning', 'is-grab'); hideCursors();
  updateControls();
}
function cancelDrawingInput() { resetDrawingInput(true); }
scope.listen($('#draw-virtual-toggle'), 'click', () => resetDrawingInput(false));
scope.listen(window, 'blur', () => { cancelDrawingInput(); cancelSelectionTransform(); selectionPanel?.hide(); });
scope.listen(window, 'pagehide', () => { stopAnimation(); virtualCursor?.release(true); interactionEffects.clear(); cancelDrawingInput(); cancelSelectionTransform(); selectionPanel?.hide(); });
scope.listen(document, 'visibilitychange', () => { if (document.hidden) { stopAnimation(); virtualCursor?.release(true); interactionEffects.clear(); cancelDrawingInput(); cancelSelectionTransform(); selectionPanel?.hide(); } });
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
const drawClearButton = $('#draw-clear');
drawClearButton.setAttribute('aria-haspopup', 'dialog');
let drawClearDialog = null;
function openDrawClearConfirmation() {
  if (drawClearDialog?.open) return;
  if (!drawClearDialog) {
    const dialog = document.createElement('dialog');
    dialog.className = 'project-delete-dialog';
    dialog.setAttribute('aria-labelledby', 'draw-clear-confirmation-title');
    dialog.setAttribute('aria-describedby', 'draw-clear-confirmation-copy');
    const title = document.createElement('h2');
    title.id = 'draw-clear-confirmation-title';
    title.textContent = 'このレイヤーを消去しますか？';
    const copy = document.createElement('p');
    copy.id = 'draw-clear-confirmation-copy';
    copy.textContent = '現在のコマで選択中のレイヤーを消去します。他のコマやレイヤーは変わりません。消去後は「元に戻す」で戻せます。';
    const actions = document.createElement('div');
    actions.className = 'project-sheet__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'キャンセル';
    cancel.autofocus = true;
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.id = 'draw-clear-confirm';
    confirm.textContent = '消去する';
    actions.append(cancel, confirm);
    dialog.append(title, copy, actions);
    document.body.append(dialog);
    cancel.addEventListener('click', () => dialog.close());
    confirm.addEventListener('click', () => {
      dialog.close();
      commitChange((next) => { next.pixels.fill(-1); return null; });
    });
    dialog.addEventListener('close', () => {
      if (!scope.disposed && drawClearButton.isConnected) drawClearButton.focus({ preventScroll: true });
    });
    drawClearDialog = dialog;
    scope.add(() => { if (dialog.open) dialog.close(); dialog.remove(); drawClearDialog = null; });
  }
  drawClearDialog.showModal();
}
drawClearButton.addEventListener('click', openDrawClearConfirmation);
async function saveRevision() {
  if (featureSession) { toast('プレビューを適用またはキャンセルしてから保存できます。'); return null; }
  if (scope.disposed) return null;
  if (!store && !pxdBridge?.currentProject && !pxdBridge?.heldProject) return;
  if (readOnlyImage) { await pxdBridge?.save(); if (!scope.disposed) status.textContent = '原本をそのままプロジェクトに保存しました。'; return null; }
  closeColorEditor(); editorUi.closePanels();
  endStroke(); const rgbaOnly = animationNeedsRgba(animationSession.animation); const snapshot = rgbaOnly ? null : structuredClone(composeAnimationFrame(animationSession.animation, animationSession.frameId));
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
  if (rgbaOnly && projectSaved) { saved = true; status.textContent = 'レイヤーと透明度を含めて作品を保存しました。'; saveButton.disabled = false; globeButton.disabled = false; return { projectSaved: true, document: null }; }
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
  if (animationNeedsRgba(animationSession.animation)) { toast('透明度を含む作品はPNGで保存できます。世界地図への受け渡しはまだ対応していません。'); return; }
  try {
    await pxdBridge?.assertCanSave();
    if (scope.disposed) return;
    validateDrawPixels(documentData);
    globeButton.disabled = true;
    const revision = await saveRevision();
    if (scope.disposed) return;
    if (!revision) return;
    if (!revision.revisionId) {
      status.textContent = 'プロジェクトは保存しました。世界地図へ送るコピーを作成できませんでした。';
      return;
    }
    globeButton.disabled = true;
    const png = await encodeDrawPng(revision.document);
    if (scope.disposed) return;
    const serialized = await serializeDrawHandoff(png, revision.revisionId);
    if (scope.disposed) return;
    sessionStorage.setItem(DRAW_HANDOFF_KEY, serialized);
    if (!navigateToSocialReturn({ kind: 'draw' })) location.assign('/globe/?from=draw');
  } catch (error) { if (!scope.disposed) status.textContent = `世界地図へ送れませんでした：${error.message}`; }
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
  let importLease = captureDrawOperation();
  const ticket = loadGate.begin();
  $('#draw-import-local').disabled = true; status.textContent = '画像を読み込んでいます…';
  try {
    const { decodeDrawImageFile } = await import('./draw-import.mjs?rev=20260928-pixel-roundtrip-1');
    if (scope.disposed || !loadGate.isCurrent(ticket)) return;
    const image = await decodeDrawImageFile(file);
    if (scope.disposed || !loadGate.isCurrent(ticket)) return; // a newer open or import has replaced this one
    const original = { width: image.width, height: image.height, rgba: new Uint8Array(image.data) };
    const originalColors = countSharedImageColors(original);
    if (importLease.enabled && !importLease.entitled && originalColors > DRAW_REWARD_LIMITS.colors)
      importLease = captureDrawOperation({ request: true });
    const importColors = importLease.enabled && !importLease.entitled ? DRAW_REWARD_LIMITS.colors : DRAW_REWARD_LIMITS.rewardColors;
    const prepared = prepareSharedCanvasImage(original, { passActive: !importLease.enabled || importLease.entitled,
      maxColors: importColors, allowConversion: true });
    const next = imageToDrawDocument(prepared.image);
    if (prepared.changed) {
      const { confirmPxdConversion } = await import('./pxd-ui.mjs?rev=20261018-direct-runtime-2');
      if (scope.disposed || !loadGate.isCurrent(ticket)) return;
      if (!await confirmPxdConversion({ image: original, document: next, title: '読み込む絵を確認', applyLabel: 'この絵を使う', message: `${next.width}×${next.height}px・${prepared.colorCount}色に合わせます。元の画像ファイルは変更しません。` })) return;
    }
    const originalBytes = new Uint8Array(await file.arrayBuffer());
    if (scope.disposed || !loadGate.isCurrent(ticket)) return;
    replaceDocument(next, importSource); importedOriginal = { bytes: originalBytes, mime: file.type, name: file.name || 'original.png' }; fitNotice = '';
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

function composeCurrentOutputFrame(frameId = animationSession.frameId, { includeMusic = outputPreferences.includeMusic } = {}) {
  return composeOutputFrame(animationSession.animation, frameId, { includeMusic: musicLayer && includeMusic });
}
function updateOutputPreview() {
  const preview = $('#draw-output-music-preview');
  if (!preview || !musicLayer) return;
  const image = composeCurrentOutputFrame();
  preview.width = image.width; preview.height = image.height;
  preview.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(documentRgba(image)), image.width, image.height), 0, 0);
}
function applyOutputPreferences(preferences = {}, { persist = true } = {}) {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) throw new TypeError('出力設定が不正です。');
  const next = { ...outputPreferences };
  if (Object.hasOwn(preferences, 'includeMusic')) {
    if (typeof preferences.includeMusic !== 'boolean') throw new TypeError('出力設定が不正です。');
    next.includeMusic = Boolean(musicLayer && preferences.includeMusic);
  }
  if (Object.hasOwn(preferences, 'includeAudio')) {
    if (typeof preferences.includeAudio !== 'boolean') throw new TypeError('出力設定が不正です。');
    next.includeAudio = preferences.includeAudio;
  }
  if (Object.hasOwn(preferences, 'loops')) {
    if (![1, 2, 4, 8].includes(preferences.loops)) throw new TypeError('再生回数は1・2・4・8から選んでください。');
    next.loops = preferences.loops;
  }
  const changed = next.includeMusic !== outputPreferences.includeMusic || next.includeAudio !== outputPreferences.includeAudio || next.loops !== outputPreferences.loops;
  outputPreferences = next;
  const checkbox = $('#draw-output-music-layer'); if (checkbox) checkbox.checked = outputPreferences.includeMusic;
  if (persist && changed) pxdBridge?.markDirty();
  updateOutputPreview();
  return { ...outputPreferences, includeMusic: Boolean(musicLayer && outputPreferences.includeMusic) };
}
if (musicLayer) {
  const panel = $('#draw-output .creation-output__panel');
  const section = document.createElement('section'); section.className = 'creation-output__music';
  const label = document.createElement('label'); label.htmlFor = 'draw-output-music-layer';
  const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = 'draw-output-music-layer'; checkbox.checked = false;
  checkbox.addEventListener('change', () => { applyOutputPreferences({ includeMusic: checkbox.checked }); });
  label.append(checkbox, document.createTextNode('出力に音楽レイヤーを含める'));
  const preview = document.createElement('canvas'); preview.id = 'draw-output-music-preview'; preview.setAttribute('aria-label', '出力画像プレビュー');
  preview.style.cssText = 'display:block;width:min(160px,100%);max-width:100%;max-height:96px;height:auto;image-rendering:pixelated;margin-top:.5rem;border:1px solid currentColor';
  section.append(label, preview);
  panel?.insertBefore(section, panel.querySelector('[data-output-project]') || null);
}
scope.listen($('#draw-output'), 'toggle', () => updateOutputPreview());
updateOutputPreview();

// ---- saving: the picture leaves PiXiEED enlarged (crisp dots, about 2048px), on phones via the share sheet ----
$('#draw-export').addEventListener('click', async () => {
  endStroke(); closeColorEditor(); stopAnimation(); paint(); editorUi.closePanels();
  const original = documentData; const originalSource = source;
  const bridge = pxdBridge; let project = bridge?.currentProject; let held = bridge?.heldProject;
  const unchangedSource = () => !scope.disposed && isActive() && documentData === original && source === originalSource && pxdBridge === bridge
    && bridge?.currentProject?.projectId === project?.projectId && bridge?.heldProject?.projectId === held?.projectId;
  const image = readOnlyImage ? { width: readOnlyImage.width, height: readOnlyImage.height, data: new Uint8Array(readOnlyImage.rgba) } : { width: original.width, height: original.height, data: documentRgba(composeCurrentOutputFrame()) };
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
        const doc = composeOutputFrame(animation, frame.id, { includeMusic: musicLayer && outputPreferences.includeMusic });
        return { width: doc.width, height: doc.height, data: new Uint8Array(documentRgba(doc)), delayMs: Math.max(20, frame.durationMs) };
      });
      if (animationFrames[0].width * animationFrames[0].height * animationFrames.length <= 5_000_000) {
        mediaSources.push({ id: 'animation', label: 'アニメーション', kind: 'rgba-frames', frames: animationFrames, loopCount: 0 });
      }
    }
    const timelapseEvents = timelapse.snapshot();
    if (!animationNeedsRgba(animationSession.animation) && timelapseEvents.length > 1) {
      const timelapseFrames = selectDrawTimelapseFrames(timelapseEvents, { detail: false, fps: TIMELAPSE_FPS })
        .map((frame) => ({ ...frame, data: new Uint8Array(frame.data), delayMs: 100 }));
      if (timelapseFrames[0].width * timelapseFrames[0].height * timelapseFrames.length <= 8_000_000) {
        mediaSources.push({ id: 'drawing-process', label: '描いた過程（3秒）', kind: 'rgba-frames', frames: timelapseFrames, loopCount: 0 });
      }
    }
    const staged = await sendToolOutputAfterSaving({ blob, filename: `pixieed-drawing-${image.width}x${image.height}@${width}x${height}.png`, returnUrl: currentToolReturnUrl, title: '作品の出力を確認', source: 'PiXiEEDraw', metadata: { width: image.width, height: image.height, defaultScale: scale }, mediaSources }, bridge, unchangedSource);
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
function legacyTimelapseFrame(animation, frameId) { return animationNeedsRgba(animation) ? getAnimationCelDocument(animation, frameId, animationSession.layerId) : composeAnimationFrame(animation, frameId, { excludeMusic: true }); }
function recordedHistory(target) {
  timelapse.reset(musicLayer ? legacyTimelapseFrame(animationSession.animation, animationSession.frameId) : documentData);
  return new Proxy(target, { get(object, key) {
    const value = Reflect.get(object, key, object);
    if (key === 'commit' || key === 'commitPatch') return (...args) => {
      const lease = drawOperationLease || drawRewardPolicy.capture('draw');
      const beforeDocument = { ...documentData, palette: [...documentData.palette], pixels: [...documentData.pixels] };
      let nextDocument = key === 'commit' ? args[0] : documentData;
      if (key === 'commitPatch' && args[0] instanceof Map) {
        for (const [index, change] of args[0]) beforeDocument.pixels[index] = change[0];
      }
      // Prepare the immutable timeline once, validate that exact object, then
      // commit the same closure after the pixel-history transaction succeeds.
      // Shared Audio's expiry lease and Draw protection both key off this id.
      const preparedByCaller = preparedSelectionCommit;
      const preparedCommit = preparedByCaller || animationSession.prepareDocument(nextDocument);
      if (!guardDrawTransition(preparedCommit.animation, { lease, documentOverride: nextDocument, beforeDocumentOverride: beforeDocument })) {
        lastHistoryCommitRejected = true;
        if (key === 'commitPatch' && args[0] instanceof Map) {
          for (const [index, change] of args[0]) documentData.pixels[index] = change[0];
          saved = strokeWasSaved;
        }
        return false;
      }
      lastHistoryCommitRejected = false;
      const beforeAnimation = animationSession.animation, beforeSelection = selection;
        const beforePixels = documentData.pixels; const beforePalette = documentData.palette;
        const beforeArt = musicLayer ? legacyTimelapseFrame(beforeAnimation, animationSession.frameId) : null;
      const done = value.apply(object, args);
      if (done) {
        preparedCommit();
        if (beforeSelection) { selectionViewStates.set(beforeAnimation, { ...beforeSelection }); selectionViewStates.set(animationSession.animation, { ...beforeSelection }); }
        animationControls?.refresh();
        pxdBridge?.markDirty();
        const editingMusic = musicLayer && animationSession.animation.layers.find(layer => layer.id === animationSession.layerId)?.role === 'music';
        if (!editingMusic) {
          if (musicLayer) {
            const art = legacyTimelapseFrame(animationSession.animation, animationSession.frameId);
            const indices = [];
            if (beforeArt.width === art.width && beforeArt.height === art.height && beforeArt.palette.length === art.palette.length && beforeArt.palette.every((color, index) => color === art.palette[index])) {
              for (let index = 0; index < art.pixels.length; index += 1) if (beforeArt.pixels[index] !== art.pixels[index]) indices.push(index);
            }
            timelapse.record(art, { indices, paletteChanged: beforePalette !== documentData.palette || beforeArt.width !== art.width || beforeArt.height !== art.height });
          } else {
            const paletteChanged = beforePalette !== documentData.palette;
            const indices = [];
            if (key === 'commitPatch') indices.push(...object.lastStep.indices);
            else if (!paletteChanged) for (let index = 0; index < beforePixels.length; index += 1) if (beforePixels[index] !== documentData.pixels[index]) indices.push(index);
            timelapse.record(documentData, { indices, paletteChanged });
          }
        }
      }
      return done;
    };
    if (key === 'undo' || key === 'redo') return (...args) => {
      const done = value.apply(object, args);
      if (done) {
        const editingMusic = musicLayer && animationSession.animation.layers.find(layer => layer.id === animationSession.layerId)?.role === 'music';
        if (!editingMusic) timelapse.record(musicLayer ? legacyTimelapseFrame(animationSession.animation, animationSession.frameId) : documentData, object.lastStep);
        pxdBridge?.markDirty();
      }
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
  if (animationNeedsRgba(animationSession.animation)) { toast('半透明色・レイヤー不透明度を含む制作過程のGIFは未対応です。PNGで出力してください。'); return; }
  if (scope.disposed) return;
  if (timelapseExporting) return;
  const rewardLease = drawRewardPolicy.capture('draw', { request: Boolean(detail) });
  if (detail && rewardLease.enabled && !rewardLease.entitled) {
    toast('8秒の詳細GIFは60分特典中に利用できます。通常の3秒GIFはそのまま使えます。'); return;
  }
  closeColorEditor(); editorUi.closePanels();
  const job = {
    controller: new AbortController(),
    rewardLease,
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
    const { encodeAnimatedGif } = await import('../animated-export.mjs?rev=20261015-alpha-opacity-1');
    if (!timelapseJobIsCurrent(job)) return;
    const { bytes, width, height, scale } = await encodeAnimatedGif(frames, { delayMs: 1000 / TIMELAPSE_FPS, signal: job.controller.signal, longEdge: 1024, maxPixels: 80e6 });
    if (!timelapseJobIsCurrent(job)) return;
    const blob = new Blob([bytes], { type: 'image/gif' });
    const durationSeconds = frames.reduce((total, frame) => total + (frame.delayMs || 1000 / TIMELAPSE_FPS), 0) / 1000;
    const staged = await sendToolOutputAfterSaving({ blob, filename: `pixieed-drawing-timelapse-${width}x${height}.gif`, returnUrl: currentToolReturnUrl, title: '描いた過程を確認', source: 'PiXiEEDraw', metadata: { width: frames[0].width, height: frames[0].height, defaultScale: scale, durationSeconds, frameCount: frames.length }, mediaSource: { kind: 'gif-frames', frames, delayMs: 1000 / TIMELAPSE_FPS, loopCount: 0 } }, job.bridge, () => timelapseJobIsCurrent(job));
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
      const doc = composeOutputFrame(timeline, frame.id, { includeMusic: musicLayer && outputPreferences.includeMusic });
      frames.push({ width: doc.width, height: doc.height, data: documentRgba(doc), delayMs: Math.max(20, frame.durationMs) });
    }
    const { encodeAnimatedGif } = await import('../animated-export.mjs?rev=20261015-alpha-opacity-1');
    if (scope.disposed || controller.signal.aborted) return;
    const result = await encodeAnimatedGif(frames, { longEdge: 1024, maxPixels: 80e6, maxInputPixels: 128 * 256 * 256, signal: controller.signal });
    if (scope.disposed || controller.signal.aborted) return;
    const blob = new Blob([result.bytes], { type: 'image/gif' });
    const durationSeconds = frames.reduce((total, frame) => total + frame.delayMs, 0) / 1000;
    if (scope.disposed || documentData !== exportDocument || source !== exportSource || pxdBridge !== exportBridge || animationSession.animation !== timeline) return;
    const staged = await sendToolOutputAfterSaving({ blob, filename: `pixieed-animation-${result.width}x${result.height}.gif`, returnUrl: currentToolReturnUrl, title: 'アニメーションを確認', source: 'PiXiEEDraw', metadata: { width: frames[0].width, height: frames[0].height, defaultScale: result.scale, durationSeconds, frameCount: frames.length }, mediaSource: { kind: 'gif-frames', frames, loopCount: 0 } }, exportBridge, () => !scope.disposed && documentData === exportDocument && source === exportSource && pxdBridge === exportBridge && animationSession.animation === timeline);
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

function getDrawEditorState() { return { inputSettings: serializeDrawInputSettings(inputSettings, documentData.palette), selectedColor, selectedHex: selectedColor < 0 ? null : documentData.palette[selectedColor], brushColors: [...documentData.palette], tool, zoom, panX, panY, mirror: symmetry.horizontal, symmetry: { ...symmetry }, mirrorOrigin: { ...mirrorOrigin }, showGrid, imageRole: musicLayer ? 'main' : pxdImageRole, frameId: animationSession.frameId, layerId: animationSession.layerId, onion }; }
function restoreDrawEditorState(state) {
    if (state?.imageRole && state.imageRole !== (musicLayer ? 'main' : pxdImageRole)) state = {};
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

const drawProjectOptions = {
  tool: 'draw',
  projectWorkspace: true,
  initialProject: initialCameraProject,
  getEditorState: getDrawEditorState,
  restoreEditorState: restoreDrawEditorState,
  hasContent: () => Boolean(pxdBridge?.currentProject || pxdBridge?.heldProject || activeDraftId || documentData.pixels.some((pixel) => pixel >= 0)),
  setStatus: (message) => { status.textContent = message; },
  async openProject(project, { imageRole = null } = {}) {
    if (scope.disposed) return;
    for (const hook of projectHooks) if (hook.prepareOpen) project = await hook.prepareOpen(project);
    // Legacy song-only PXD requires its explicit pixel reconstruction before opening.
    if (project.entries.some(entry => entry.path === 'audio/state.json') && (!pxdImageRoles(project).length || readPxdAudioLink(project)?.legacyEditorRole)) {
      const { prepareSharedMusicProject } = await import('./draw-music.mjs?rev=20261018-direct-runtime-1');
      project = await prepareSharedMusicProject(project);
    }
    const opened = async () => {
      currentOpenedProject = project;
      for (const hook of projectHooks) await hook.onOpen?.(project, animationSession.animation);
      applyOutputPreferences(readMusicOutputPreferences(project), { persist: false });
      notifiedAnimation = null; notifyEditorChange();
    };
    const params = new URLSearchParams(location.search); const requestedRole = params.get('pxd') === project.projectId && params.getAll('pxdImage').length === 1 ? params.get('pxdImage') : null;
    if (!project.entries.length) { pxdImageRole = 'main'; replaceDocument(createDrawDocument(), { type: 'hand_drawn', assetId: null, revisionId: null }, { fromPxd: true }); await opened(); return; }
    const roles = pxdImageRoles(project);
    const rememberedRole = roles.includes(project.manifest.creationProject?.imageRole) ? project.manifest.creationProject.imageRole : project.manifest.editorState?.draw?.imageRole;
    let role = imageRole || requestedRole || (roles.includes(rememberedRole) ? rememberedRole : roles.includes('main') ? 'main' : roles.includes('draw') ? 'draw' : roles[0]);
    // Multiple independent image roles require an explicit choice unless already remembered.
    if (!imageRole && !requestedRole && !roles.includes(rememberedRole) && roles.length > 1) role = await chooseProjectRole(project, roles);
    // Validate the timeline before replacing the working document. Unknown versions fail closed.
    const storedAnimation = await readPxdAnimation(project, role || 'main');
    if (scope.disposed) return;
    let nextDocument;
    {
      try {
        // An empty poster can have a transparent-only palette. The validated
        // timeline owns its palette and cels, so restore from it directly.
        nextDocument = storedAnimation ? getAnimationCelDocument(storedAnimation, storedAnimation.frames[0].id, storedAnimation.layers.findLast(layer => layer.role !== 'music')?.id || storedAnimation.layers.at(-1).id) : await readPxdDrawDocument(project, role);
        if (nextDocument && !storedAnimation) createDrawAnimationSession(nextDocument, { musicLayer });
        if (scope.disposed) return;
      }
      catch (error) {
        if (scope.disposed) return;
        const image = await readPxdImage(project, role);
        if (scope.disposed) return;
        const imageIsReadOnly = image && (image.width > 256 || image.height > 256 || countSharedImageColors(image, DRAW_REWARD_LIMITS.rewardColors) > DRAW_REWARD_LIMITS.rewardColors);
        // Treat a valid but unrepresentable legacy image as an unsupported
        // editing range; keep its original RGBA in the read-only viewport.
        if (imageIsReadOnly && !(error instanceof RangeError)) error = new RangeError(error.message);
        if (!image || !(error instanceof RangeError)) throw error;
        readOnlyImage = image; importedOriginal = null; pxdImageRole = role || 'main'; saved = true; paint();
        status.textContent = '原本をそのまま表示しています。画像として保存できます。サイズ・色数が対応範囲を超えるため、編集はしていません。'; currentOpenedProject = project; return;
      }
    }
    if (!nextDocument) throw new Error('このPXDには描画できる画像部品がありません。別のPXDや保存版を選んでください。');
    validateDrawDocument(nextDocument);
    pxdImageRole = role || 'main';
    replaceDocument(structuredClone(nextDocument), { type: 'pxd_project_copy', assetId: null, revisionId: null, projectId: project.projectId, imageRole: pxdImageRole }, { fromPxd: true });
    if (storedAnimation) {
      const artLayerId = storedAnimation.layers.findLast(layer => layer.role !== 'music')?.id || storedAnimation.layers.at(-1).id;
      let image = animationSession.load(storedAnimation);
      image = animationSession.select(storedAnimation.frames[0].id, artLayerId);
      installAnimationDocument(image);
    }
    saved = true; paint(); await opened();
  },
  async getProject(project) {
    if (scope.disposed) return project;
    if (readOnlyImage) return project;
    // Autosave can capture while another pointer is still drawing. Capture the
    // committed timeline; releasing the stroke commits it and schedules its save.
    const timeline = colorEdit ? setAnimationPalette(animationSession.animation, documentData.palette) : animationSession.animation;
    const snapshot = composeOutputFrame(timeline, timeline.frames[0].id, { includeMusic: false }); const role = musicLayer ? 'main' : pxdImageRole;
    let next = project || createPxdProject();
    if (importedOriginal) next = setPxdBytes(next, `originals/imported-source.${importedOriginal.mime === 'image/webp' ? 'webp' : 'png'}`, importedOriginal.bytes, importedOriginal.mime);
    if (!next.manifest.creationProject && currentOpenedProject?.entries.length) next = setPxdBytes(next, 'legacy/creation-original.pxd', await encodePxd(currentOpenedProject), 'application/octet-stream');
    next = { ...next, manifest: { ...next.manifest, creationProject: { ...next.manifest.creationProject, schemaVersion: 1, imageRole: role } } };
    next = writeMusicOutputPreferences(next, outputPreferences);
    next = role === 'main' ? await putPxdSharedImage(next, { width: snapshot.width, height: snapshot.height, rgba: documentRgba(snapshot) }) : await putPxdImage(next, { width: snapshot.width, height: snapshot.height, rgba: documentRgba(snapshot) }, role);
    if (role !== 'main') next = { ...next, entries: next.entries.filter(entry => entry.path !== `images/${role}/draw.json`) };
    next = await writePxdAnimation(next, timeline, { role, posterFrameId: timeline.frames[0].id });
    for (const hook of projectHooks) if (hook.onSave) next = await hook.onSave(next, timeline, { imageRole: role });
    return next;
  }
};
pxdBridge = mountWorkspace(drawProjectOptions);
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
function commandOpen(detailsSelector, focusSelector, creationAction = null) {
  selectionPanel?.hide();
  cancelDrawingInput(); closeColorEditor(); animationControls?.close?.(); editorUi.closePanels();
  const creationHandler = creationAction && creationNavigationRequest?.[creationAction];
  if (typeof creationHandler === 'function') return creationHandler();
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
  'selection.confirm': confirmAndDeselect, 'selection.operations': () => { selectionPanel.focus(); return true; },
  'selection.rotateLeft': () => runSelectionAction('rotate-left'), 'selection.rotateRight': () => runSelectionAction('rotate-right'),
  'selection.flipX': () => runSelectionAction('flip-x'), 'selection.flipY': () => runSelectionAction('flip-y'),
  'selection.cancel': () => { cancelDrawingInput(); if (!cancelSelectionTransform()) clearSelection(); selectionPanel?.hide(); return true; },
  'edit.undo': undo, 'edit.redo': redo, 'edit.redoAlt': redo,
  'edit.clear': () => commandClick('#draw-clear'),
  'view.reset': () => { resetView(); return true; },
  'view.zoomIn': () => { const r = canvas.getBoundingClientRect(); zoomAt(zoom * 1.5, r.left + r.width / 2, r.top + r.height / 2); return true; },
  'view.zoomOut': () => { const r = canvas.getBoundingClientRect(); zoomAt(zoom / 1.5, r.left + r.width / 2, r.top + r.height / 2); return true; },
  'pan.hold': () => { spaceHeld = true; canvas.classList.add('is-grab'); return true; },
  'cursor.left': () => selectionTransform || selection ? confirmAndDeselect() : virtualCursor?.enabled ? virtualCursor.pressKeyboard('left') : false,
  'cursor.right': () => virtualCursor?.enabled && virtualCursor.pressKeyboard('right'),
  'cursor.moveLeft': event => keyboardMove(-1, 0, event), 'cursor.moveRight': event => keyboardMove(1, 0, event),
  'cursor.moveUp': event => keyboardMove(0, -1, event), 'cursor.moveDown': event => keyboardMove(0, 1, event),
  'focus.palette': () => commandFocus('#draw-palette .draw-color[data-color-index="' + selectedColor + '"]'),
  'focus.leftControls': () => { toast('色・道具をEnterで左に割り当てます。'); return commandHandlers['focus.palette'](); },
  'focus.rightControls': () => { toast('色・道具をShift＋Enterで右に割り当てます。'); return commandHandlers['focus.palette'](); },
  'focus.tools': () => commandOpen('#draw-tool-picker', '.draw-tool-menu [data-draw-tool]'),
  'focus.settings': () => commandOpen('#draw-settings-picker', '#draw-mirror', 'settings'),
  'focus.fileMenu': () => commandOpen('#draw-output', '#draw-export', 'fileMenu'),
  'open.canvasSettings': () => commandOpen('.draw-import', '#draw-canvas-width', 'canvasSettings'),
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
  if (featureSession) return false;
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
  if (id === 'color.add') return documentData.palette.length < ANIMATION_MAX_PALETTE_ENTRIES && !readOnlyImage;
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
  activePointers.clear(); pendingTap = null; pendingTapPointerId = null; pendingTapMode = null; pendingTapScreenOrigin = null; pendingTapClearOutside = false; drawingPointerId = null; pinchStart = null; panDrag = null; fingerTap = null;
  strokeStartPixels = null; drawing = false; previousPoint = null;
  canvas.classList.remove('is-grab', 'is-panning');
  closeColorEditor();
  editorUi.dispose?.();
  resultView.dispose?.();
  interactionEffects.clear();
}
function clearToastTimer() { clearTimeout(toastTimer); }
scope.add(disposeDrawMode);
mountDrawDesktopUi({ scope, root: $('#main'), drawShortcuts, animationControls, assignDrawInput, cancelInput: cancelDrawingInput, onLayout: updateCanvasView });
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
async function chooseProjectRole(project, roles) {
  const dialog = document.createElement('dialog'); dialog.className = 'project-sheet'; dialog.id = 'creation-project-role';
  const title = document.createElement('h2'); title.textContent = '共有して編集する画像を選ぶ';
  const note = document.createElement('p'); note.textContent = 'このPXDには別々の画像があります。選んだ画像を全モードで編集します。他の画像は元PXDのバックアップと保存版に保持します。'; dialog.append(title, note);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = role => { if (settled) return; settled = true; dialog.close(); dialog.remove(); role ? resolve(role) : reject(new Error('画像の選択を取り消しました。作品は保持しています。')); };
    scope.add(() => finish(null));
    if (scope.disposed) return;
    for (const role of roles) { const button = document.createElement('button'); button.type = 'button'; button.textContent = ({ main: '共通画像', audio: '音楽の画像', draw: '描画の画像' })[role] || role; button.dataset.imageRole = role; button.addEventListener('click', () => finish(role)); dialog.append(button); }
    const cancel = document.createElement('button'); cancel.textContent = '取消'; cancel.addEventListener('click', () => finish(null)); dialog.append(cancel);
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); }); document.body.append(dialog); dialog.showModal();
  });
}
function settingsPlan(settings) {
  if (readOnlyImage) throw new Error('この原本は共有編集の対応範囲外です。原本とPXDは保持しています。');
  const plan = planSharedProjectSettings(animationSession.animation, settings);
  if (!musicLayer || !musicSettingsPlanner) return plan;
  const extra = musicSettingsPlanner(settings, animationSession.animation, plan);
  if (!extra?.summary) return plan;
  const cropped = Number(extra.summary.croppedPixels || 0);
  return { ...plan, summary: { ...plan.summary, ...extra.summary, croppedPixels: plan.summary.croppedPixels + (Number.isFinite(cropped) ? cropped : 0) } };
}
function openAudioTimbre(index = selectedColor, sourceTrigger = null) {
  if (!audioTimbreApi || !drawAudioTimbrePanel?.isEnabled) return false;
  if (selectionTransform) { toast('✓で確定、×で取消してから音色を設定できます。'); return false; }
  if (colorEdit) { toast('色の調整を終えてから音色を設定できます。'); return false; }
  const playableColor = colorIndex => {
    const color = documentData.palette[colorIndex];
    return Number.isInteger(colorIndex) && colorIndex >= 0 && Boolean(color)
      && !(String(color).length === 9 && String(color).endsWith('00'));
  };
  let target = playableColor(index) ? index : null;
  if (target === null) {
    // The shared palette drives both artwork and the reserved music cels.
    // Include all cels so the fallback can target an actual active music color.
    const used = getAnimationUsedColorIndices(animationSession.animation);
    target = [...used].filter(playableColor).sort((a, b) => a - b)
      .find(colorIndex => !audioTimbreApi.getAssignment?.(colorIndex, documentData.palette[colorIndex])
        && !audioTimbreApi.isReadOnly?.(colorIndex)) ?? null;
  }
  if (target === null) { toast('音色を設定できる使用中の色がありません。'); return false; }
  if (audioTimbreApi.isReadOnly?.(target) && !playableColor(index)) {
    toast('この作品の音色は表示専用です。'); return false;
  }

  const isVisible = node => Boolean(node?.isConnected && !node.hidden && node.getClientRects().length);
  const focusReturn = isVisible(sourceTrigger) ? sourceTrigger
    : isVisible(document.activeElement) ? document.activeElement : document.querySelector('#draw-music-play');
  colorEditorReturnFocus = focusReturn?.isConnected ? focusReturn : null;
  selectionPanel?.hide(); editorUi.closePanels();
  if (colorPanel.isOpen) colorPanel.close();
  if (target !== selectedColor) {
    selectedColor = target;
    chooseColor(target, document.querySelector(`.draw-color[data-color-index="${target}"]`));
  }
  const color = documentData.palette[target];
  colorPanel.open({ color, resetColor: target < DRAW_PALETTE.length ? DRAW_PALETTE[target] : null });
  colorPanel.setView('sound');
  requestAnimationFrame(() => {
    if (!scope.disposed && colorPanel.isOpen && colorPanel.activeView === 'sound')
      colorPanel.element.querySelector('#datp-candidate-list [data-instrument]')?.focus({ preventScroll: true });
  });
  return true;
}
return {
  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,
  get bank() { return 'shared'; },
  getTimeline() { return animationSession.animation; }, getImageRole() { return musicLayer ? 'main' : pxdImageRole; },
  getRestoreImageRole() { return pxdImageRole; },
  getTimelineHistoryPosition(timeline) {
    const history = animationSession.snapshot().timeline;
    if (history.current === timeline) return 'current';
    if (history.past.includes(timeline)) return 'past';
    if (history.future.includes(timeline)) return 'future';
    return 'missing';
  },
  getEditorState: getDrawEditorState,
  setAudioTimbreApi(api) { audioTimbreApi = api || null; drawAudioTimbrePanel?.setEnabled(Boolean(audioTimbreApi)); drawAudioTimbrePanel?.setAudioApi(audioTimbreApi); for (const swatch of document.querySelectorAll('#draw-palette [data-color-index]')) renderAudioPaletteIcon(swatch, Number(swatch.dataset.colorIndex), documentData.palette[Number(swatch.dataset.colorIndex)]); },
  refreshAudioTimbrePanel() { for (const swatch of document.querySelectorAll('#draw-palette [data-color-index]')) renderAudioPaletteIcon(swatch, Number(swatch.dataset.colorIndex), documentData.palette[Number(swatch.dataset.colorIndex)]); drawAudioTimbrePanel?.refresh(); },
  openAudioTimbre,
  subscribe(listener) { editorListeners.add(listener); return () => editorListeners.delete(listener); },
  async attachProjectHooks(hooks) {
    await pxdBridge.ready;
    const project = currentOpenedProject || pxdBridge.currentProject || createPxdProject();
    await hooks.onOpen?.(project, animationSession.animation);
    applyOutputPreferences(readMusicOutputPreferences(project), { persist: false });
    projectHooks.add(hooks); return () => projectHooks.delete(hooks);
  },
  setProjectSettingsRequest(callback) { projectSettingsRequest = callback; },
  setCreationNavigation(callback) {
    if (callback != null && (typeof callback !== 'object' || Object.values(callback).some(value => typeof value !== 'function'))) throw new TypeError('制作ナビゲーションの処理が不正です。');
    creationNavigationRequest = callback;
    return () => { if (creationNavigationRequest === callback) creationNavigationRequest = null; };
  },
  setSharedSettingsDismissal(settings) { return scope.add(panelDismissals.registerSharedSettings(settings)); },
  cancelInput() { cancelDrawingInput(); },
  setMusicSettingsPlanner(callback) {
    if (callback != null && typeof callback !== 'function') throw new TypeError('音楽設定プランナーが不正です。');
    musicSettingsPlanner = callback;
    return () => { if (musicSettingsPlanner === callback) musicSettingsPlanner = null; };
  },
  setMusicTimelineValidator(callback) {
    if (callback != null && typeof callback !== 'function') throw new TypeError('音楽タイムライン検証処理が不正です。');
    musicTimelineValidator = callback;
    return () => { if (musicTimelineValidator === callback) musicTimelineValidator = null; };
  },
  snapshotTimeline() { return { session: animationSession.snapshot(), saved, activeDraftId }; },
  restoreTimelineSnapshot(snapshot) {
    const state = snapshot?.session ? snapshot : { session: snapshot, saved: false, activeDraftId };
    if (!state.session) throw new TypeError('Drawタイムラインのスナップショットがありません。');
    const doc = animationSession.restore(state.session);
    installAnimationDocument(doc, { preserveTimelapse: true });
    saved = state.saved === true; activeDraftId = state.activeDraftId ?? activeDraftId;
    paint(); setDrawRewardNotice();
    return animationSession.animation;
  },
  previewProjectSettings(settings) {
    const plan = settingsPlan(settings), doc = composeAnimationFrameRgba(plan.animation, animationSession.frameId);
    return { ...plan, image: { width: doc.width, height: doc.height, rgba: documentRgba(doc.rgba ? doc : { ...doc, pixels: Array.from(doc.pixels) }) } };
  },
  previewSpriteScaleSettings(percent) {
    const blocked = spriteScaleBlockedReason();
    if (blocked) throw new Error(blocked);
    const owner = animationSession.animation;
    const plan = planSpriteScale(owner, percent);
    if (!plan.allowed) {
      const error = new RangeError(plan.reason);
      error.code = plan.reasonCode;
      error.plan = plan;
      throw error;
    }
    const scaled = scaleSpriteAnimation(owner, percent);
    const doc = composeAnimationFrameRgba(scaled, animationSession.frameId);
    return {
      owner,
      changed: plan.changed,
      plan,
      image: { width: doc.width, height: doc.height, rgba: new Uint8ClampedArray(doc.rgba || documentRgba(doc)) },
      summary: {
        croppedPixels: 0,
        remappedColors: 0,
        musicImpact: '全コマ・全レイヤーを同じ倍率で拡縮します。音がある場合は音の配置も拡縮されます。'
      }
    };
  },
  async setSpriteScaleSettings(percent, { expectedOwner = null } = {}) {
    if (expectedOwner && expectedOwner !== animationSession.animation) throw new Error('プレビュー後に作品が変わりました。もう一度確認してください。');
    const blocked = spriteScaleBlockedReason();
    if (blocked) throw new Error(blocked);
    return await scaleSpriteCanvas(percent);
  },
  setProjectSettings(settings, { expectedOwner = null } = {}) {
    if (expectedOwner && expectedOwner !== animationSession.animation) throw new Error('プレビュー後に作品が変わりました。もう一度確認してください。');
    if (featureSession || selectionTransform || drawingInputBusy() || colorEdit || playing || !canEdit(documentData, { shared: true })) throw new Error('現在の編集・再生を終えてから共通設定を変更してください。');
    const plan = settingsPlan(settings); if (!plan.changed) return false;
    const lease = drawRewardPolicy.capture('draw');
    if (!guardDrawTransition(plan.animation, { lease, mutation: 'project-settings' })) throw new Error('特典外では超過レイヤー・コマの内容を変える共通設定を適用できません。作品は保持されています。');
    resizeViewStates.set(animationSession.animation, resizeViewState());
    resizeViewStates.set(plan.animation, translatedResizeView(plan.animation.width, plan.animation.height));
    installAnimationDocument(animationSession.apply(plan.animation)); sizeWasChosen = true; pxdBridge.markDirty(); return true;
  },
  undo: () => undo(true), redo: () => redo(true),
  get canUndo() { return animationSession.canUndo; }, get canRedo() { return animationSession.canRedo; },
  openSpriteScale() { canvasPicker.open = true; canvasSettingsPanel.position(); },
  importImage(image) {
    const doc = imageToDrawDocument({ ...image, rgba: new Uint8Array(image.rgba) });
    const imported = createDrawAnimationSession(doc, { musicLayer }).animation;
    const lease = drawRewardPolicy.capture('draw');
    if (!guardDrawTransition(imported, { lease, mutation: 'import' })) throw new Error('現在の特典状態では追加枠を含む作品を置き換えられません。元の作品は保持されています。');
    const artLayerId = imported.layers.findLast(layer => layer.role !== 'music').id;
    installAnimationDocument(animationSession.apply(imported, { frameId: imported.frames[0].id, layerId: artLayerId }));
    saved = false; pxdBridge?.markDirty();
  },
  applyMusicPage(doc, { record = true, select = false, prepareTimeline } = {}) {
    if (!musicLayer) throw new Error('音楽レイヤーはこのDrawセッションでは有効ではありません。');
    if (typeof record !== 'boolean' || typeof select !== 'boolean' || prepareTimeline != null && typeof prepareTimeline !== 'function') throw new TypeError('音楽ページの適用オプションが不正です。');
    if (musicReadOnlyReason && record) throw new Error(musicReadOnlyReason);
    validateDrawDocument(doc);
    if (doc.width !== animationSession.animation.width || doc.height !== animationSession.animation.height) throw new RangeError('音楽グリッドは共通キャンバスと同じ大きさにしてください。');
    const original = animationSession.animation;
    let next = original;
    if (doc.palette.length !== next.palette.length || doc.palette.some((color, index) => color !== next.palette[index])) next = setAnimationPalette(next, doc.palette);
    const musicId = next.layers.find(layer => layer.role === 'music')?.id;
    if (!musicId) throw new Error('共有音楽レイヤーが見つかりません。');
    next = writeAnimationCel(next, animationSession.frameId, musicId, { width: doc.width, height: doc.height, pixels: Uint8Array.from(doc.pixels, value => value + 1) });
    if (selection) selectionViewStates.set(next, { ...selection });
    else selectionViewStates.delete(next);
    prepareTimeline?.(next);
    if (scope.disposed || animationSession.animation !== original) throw new Error('適用中にDraw作品が変わりました。もう一度お試しください。');
    const chosenCel = { frameId: animationSession.frameId, layerId: select ? musicId : animationSession.layerId };
    if (record && !guardDrawTransition(next, { lease: drawRewardPolicy.capture('draw'), target: drawRewardTarget(next, chosenCel.frameId, chosenCel.layerId), mutation: 'music-page' }))
      throw new Error('この音楽ページは現在の無料枠では適用できません。音楽データは保持されています。');
    const image = record ? animationSession.apply(next, chosenCel) : animationSession.load(next, chosenCel);
    installAnimationDocument(image, { preserveTimelapse: true });
    saved = !record;
    if (record) pxdBridge?.markDirty();
    return next;
  },
  selectMusicLayer() {
    if (!musicLayer) throw new Error('音楽レイヤーはこのDrawセッションでは有効ではありません。');
    const id = animationSession.animation.layers.find(layer => layer.role === 'music')?.id;
    if (!id) throw new Error('共有音楽レイヤーが見つかりません。');
    if (animationSession.layerId === id) return true;
    if (selection) selectionViewStates.set(animationSession.animation, { ...selection });
    else selectionViewStates.delete(animationSession.animation);
    installAnimationDocument(animationSession.select(animationSession.frameId, id), { preserveTimelapse: true });
    return true;
  },
  selectArtLayer(layerId = null) {
    const layer = layerId ? animationSession.animation.layers.find(item => item.id === layerId && item.role !== 'music')
      : animationSession.animation.layers.find(item => item.id === lastArtLayerId && item.role !== 'music') || animationSession.animation.layers.findLast(item => item.role !== 'music');
    if (!layer) throw new Error('描画レイヤーが見つかりません。');
    if (animationSession.layerId === layer.id) return layer.id;
    if (selection) selectionViewStates.set(animationSession.animation, { ...selection });
    else selectionViewStates.delete(animationSession.animation);
    installAnimationDocument(animationSession.select(animationSession.frameId, layer.id), { preserveTimelapse: true });
    return layer.id;
  },
  setMusicReadOnly(reason = '') {
    musicReadOnlyReason = reason ? String(reason) : '';
    return musicReadOnlyReason;
  },
  getOutputPreferences() { return { ...outputPreferences, includeMusic: Boolean(musicLayer && outputPreferences.includeMusic) }; },
  setOutputPreferences(preferences = {}, options = {}) { return applyOutputPreferences(preferences, options); },
  getOutputFrame(frameId = animationSession.frameId, options = {}) {
    return composeCurrentOutputFrame(frameId, options);
  },
  commitMetadata(prepare) {
    if (!canEdit(documentData, { allowMusicReadOnly: true }) || featureSession || selectionTransform || drawingInputBusy()) throw new Error('現在の編集を確定してから音の設定を変更してください。');
    const next = setLayerProperties(animationSession.animation, animationSession.layerId, {});
    prepare(next);
    if (!guardDrawTransition(next, { lease: drawRewardPolicy.capture('draw'), mutation: 'metadata' })) throw new Error('特典外では超過レイヤー・コマに影響する設定を変更できません。');
    animationSession.apply(next); saved = false; paint(); pxdBridge?.markDirty();
  },
  suspend() {
    if (drawAudioTimbrePanel && colorPanel.isOpen) colorPanel.dismiss();
    if (featureSession || selectionTransform || spriteScaling || drawingInputBusy() || colorEdit) throw new Error('現在の編集を確定または取り消してから切り替えてください。');
    activeTimelapseJob?.controller.abort(); animationExportController?.abort();
    stopAnimation(); virtualCursor?.release(true); cancelDrawingInput(); hideCursors();
    interactionEffects.clear();
    editorUi.closePanels(); animationControls?.close?.(); selectionPanel?.hide();
  },
  resume() { setCanvasDimensions(); paint(); updateCanvasView(); updateControls(); },
  getImage() { if (readOnlyImage) return { width: readOnlyImage.width, height: readOnlyImage.height, rgba: new Uint8ClampedArray(readOnlyImage.rgba) }; const doc = animationSession.composite(documentData); return { width: doc.width, height: doc.height, rgba: new Uint8ClampedArray(documentRgba(doc.rgba ? doc : { ...doc, pixels: Array.from(doc.pixels) })) }; },
  /** Narrow bridge used by the spot editor's isolated, memory-only Draw iframe. */
  getDocument() {
    const doc = animationSession.document();
    return { schemaVersion: 1, width: doc.width, height: doc.height, palette: [...doc.palette], pixels: Array.from(doc.pixels) };
  },
  initializeDrawDocument(nextDocument) {
    validateDrawDocument(nextDocument);
    const next = createDrawAnimationSession(structuredClone(nextDocument)).animation;
    if (!guardDrawTransition(next, { lease: captureDrawOperation(), mutation: 'import' })) throw new Error('この画像は現在読み込めません。');
    replaceDocument(structuredClone(nextDocument), { type: 'hand_drawn', assetId: null, revisionId: null });
    const doc = animationSession.load(animationSession.animation);
    installAnimationDocument(doc);
    return this.getDocument();
  },
  establishHistoryBaseline() {
    const doc = animationSession.load(animationSession.animation);
    installAnimationDocument(doc);
    return this.getDocument();
  },
  setDrawingTool(name) {
    if (name !== 'pen' && name !== 'eraser') throw new TypeError('スポット編集で使える道具ではありません。');
    return setTool(name);
  },
  addPaletteColor(value) {
    const color = String(value || '').toLowerCase();
    if (!/^#[\da-f]{6}$/.test(color)) throw new TypeError('色の形式が不正です。');
    let index = documentData.palette.findIndex(candidate => candidate.slice(0, 7).toLowerCase() === color);
    if (index < 0) {
      if (documentData.palette.length >= 32) throw new RangeError('スポット画像は32色までです。');
      const palette = [...documentData.palette, color];
      const next = setAnimationPalette(animationSession.animation, palette);
      if (!guardDrawTransition(next, { lease: captureDrawOperation(), mutation: 'edit' })) throw new Error('この色は現在追加できません。');
      installAnimationDocument(animationSession.apply(next));
      index = palette.length - 1;
    }
    selectedColor = index; inputSettings.bindings.left.color = index; setTool('pen');
    renderPalette(); showCurrentColor(); syncInputControls();
    return index;
  },
  async cameraTarget() {
    const lease = captureDrawOperation();
    const { prepareCameraTarget } = await import('./draw-camera-core.mjs?rev=20261016-color-capability-1');
    if (musicLayer && musicReadOnlyReason && animationSession.animation.layers.find(layer => layer.id === animationSession.layerId)?.role === 'music') throw new Error(musicReadOnlyReason);
    if (readOnlyImage) throw new Error('原本を表示しています。共通キャンバスの設定で編集可能なサイズと色数に合わせてから適用してください。');
    if (animationSession.locked) throw new Error('ロックを解除するか、編集可能なレイヤーを選んでから適用してください。');
    if (selectionTransform || featureSession || colorEdit || playing || drawingInputBusy()) throw new Error('現在の編集を確定または取り消してから適用してください。');
    const mask = selectionMask();
    const target = prepareCameraTarget(documentData, mask);
    const frameNumber = animationSession.animation.frames.findIndex(frame => frame.id === animationSession.frameId) + 1;
    const layer = animationSession.animation.layers.find(item => item.id === animationSession.layerId);
    const area = mask ? `選択範囲 ${target.bounds.width}×${target.bounds.height}（${target.cells.length}ドット）` : 'レイヤー全体';
    return { target, owner: animationSession.animation, frameId: animationSession.frameId, layerId: animationSession.layerId, lease,
      description: `フレーム${frameNumber}・${layer.name}${layer.visible ? '' : '（非表示）'}・${area}` };
  },
  cameraPlacementTarget() {
    const lease = captureDrawOperation();
    const image = readOnlyImage ? { width:readOnlyImage.width, height:readOnlyImage.height } : null;
    const animation = animationSession.animation;
    const frameId = animationSession.frameId;
    const layerId = animationSession.layerId;
    const frameNumber = animation.frames.findIndex(frame => frame.id === frameId) + 1;
    const layer = animation.layers.find(item => item.id === layerId);
    if (readOnlyImage) {
      const width = image.width, height = image.height;
      return { width, height, supported:false, previewAllowed:false, frameNumber:1, layerName:'原本', layerVisible:true, layerLocked:true,
        description:'原本を表示中・撮影画像の配置プレビューは利用できません' };
    }
    const width = animation.width, height = animation.height;
    if (width > 256 || height > 256) return { width, height, supported:false, previewAllowed:false, frameNumber, layerName:layer?.name || 'レイヤー',
      description:`フレーム${frameNumber}・${layer?.name || 'レイヤー'}・このサイズでは配置プレビューを表示できません` };
    const mask = selectionTransform?.mask(width, height) || selectionMask();
    // prepareCameraTarget also supplies the exact cell list and bounds used by apply.
    const target = prepareCameraTarget(documentData, mask);
    const activeIndex = animation.layers.findIndex(item => item.id === layerId);
    const active = getAnimationCelDocument(animation, frameId, layerId);
    const musicOnly = Boolean(musicLayer && layer?.role === 'music');
    const needsRgba = animationNeedsRgba(animation);
    // Keep the established opaque/indexed snapshot for byte-identical output.
    // Alpha colors and layer opacity need their source layers to be composited
    // in the same order and with the same source-over math as Draw itself.
    const rgbaLayers = needsRgba ? animation.layers.map(item => {
      const cel = getAnimationCelDocument(animation, frameId, item.id);
      return { id:item.id, rgba:new Uint8Array(cel.rgba || indexedDocumentRgba({ ...cel, pixels:Array.from(cel.pixels) })), visible:Boolean(item.visible), opacity:item.opacity ?? 1 };
    }) : null;
    let baseRgba = null;
    if (needsRgba) {
      if (musicOnly && !layer?.visible) {
        // The music editor intentionally shows its selected cel when the layer
        // is hidden. The general RGBA compositor correctly honors visibility,
        // so make this one-layer view directly from the cel instead.
        const source = rgbaLayers[activeIndex].rgba, opacity = rgbaLayers[activeIndex].opacity;
        baseRgba = new Uint8ClampedArray(width * height * 4);
        for (let pixel = 0; pixel < width * height; pixel += 1) {
          const offset = pixel * 4;
          baseRgba[offset] = source[offset]; baseRgba[offset + 1] = source[offset + 1]; baseRgba[offset + 2] = source[offset + 2];
          baseRgba[offset + 3] = Math.round(source[offset + 3] * opacity);
        }
      } else baseRgba = new Uint8ClampedArray(composeAnimationFrameRgba(animation, frameId, musicOnly ? { layerIds:[layerId] } : {}).rgba);
    }
    const below = needsRgba ? { pixels:new Int16Array(width * height).fill(-1) } : composeAnimationFrame(animation, frameId, { layerIds:animation.layers.slice(0, activeIndex).map(item => item.id) });
    const above = needsRgba ? { pixels:new Int16Array(width * height).fill(-1) } : composeAnimationFrame(animation, frameId, { layerIds:animation.layers.slice(activeIndex + 1).map(item => item.id) });
    const musicReadOnly = Boolean(musicLayer && musicReadOnlyReason && layer?.role === 'music');
    const busy = selectionTransform || featureSession || colorEdit || playing || drawingInputBusy();
    const description = `フレーム${frameNumber}・${layer?.name || 'レイヤー'}${layer?.visible ? '' : '（非表示）'}・${mask ? `選択範囲 ${target.bounds.width}×${target.bounds.height}（${target.cells.length}ドット）` : 'レイヤー全体'}`;
    return { width, height, supported:true, palette:[...animation.palette], below:Int16Array.from(below.pixels), active:Int16Array.from(active.pixels), above:Int16Array.from(above.pixels),
      ...(rgbaLayers ? { rgbaLayers, activeLayerId:layerId, baseRgba } : {}),
      activeVisible:Boolean(layer?.visible), activeLocked:Boolean(layer?.locked), previewAllowed:!busy && !musicReadOnly, musicOnly, lease,
      allowedIndices:[...animation.palette.keys()], frameId, layerId, frameNumber, layerName:layer?.name || 'レイヤー', layerVisible:Boolean(layer?.visible), layerLocked:Boolean(layer?.locked),
      mask:mask ? new Uint8Array(mask) : null, bounds:{ ...target.bounds }, cells:Uint32Array.from(target.cells), description,
      applyReason:layer?.locked ? '選択レイヤーはロック中です。ロックを解除すると撮影画像を適用できます。' : musicReadOnly ? musicReadOnlyReason : '' };
  },
  previewCamera(target, indices) { return animationSession.composite({ ...target.document, pixels: Array.from(indices) }); },
  async applyCamera(snapshot, indices) {
    const lease = snapshot.lease || drawRewardPolicy.capture('draw');
    if (musicLayer && musicReadOnlyReason && animationSession.animation.layers.find(layer => layer.id === animationSession.layerId)?.role === 'music') throw new Error(musicReadOnlyReason);
    if (animationSession.animation !== snapshot.owner || animationSession.frameId !== snapshot.frameId || animationSession.layerId !== snapshot.layerId) throw new Error('撮影対象が変更されました。撮り直してください。');
    const { replaceCameraPixels } = await import('./draw-camera-core.mjs?rev=20261016-color-capability-1');
    const next = replaceCameraPixels(documentData, snapshot.target, indices);
    if (!guardDrawDocumentTransition(documentData, next, { lease })) return false;
    const previousLease = drawOperationLease; drawOperationLease = lease;
    try { if (history.commit(next)) { saved = false; paint(); animationControls?.refresh(); pxdBridge?.markDirty(); } }
    finally { drawOperationLease = previousLease; }
  },
  async applyCameraRgba(snapshot, rgba, options) {
    const lease = snapshot.lease || drawRewardPolicy.capture('draw');
    if (musicLayer && musicReadOnlyReason && animationSession.animation.layers.find(layer => layer.id === animationSession.layerId)?.role === 'music') throw new Error(musicReadOnlyReason);
    const { planCameraReplacement } = await import('./draw-camera-core.mjs?rev=20261016-color-capability-1');
    if (animationSession.animation !== snapshot.owner || animationSession.frameId !== snapshot.frameId || animationSession.layerId !== snapshot.layerId) throw new Error('撮影対象が変更されました。撮り直してください。');
    const mask = selectionMask();
    if (Boolean(mask) !== Boolean(snapshot.target.mask) || mask && mask.some((value, index) => value !== snapshot.target.mask[index])) throw new Error('適用中に選択範囲が変わりました。対象を確認してもう一度適用してください。');
    const plan = planCameraReplacement(snapshot.target, rgba, { ...options, maxColors: DRAW_REWARD_LIMITS.rewardColors });
    if (!guardDrawDocumentTransition(documentData, plan.document, { lease })) return { additions: plan.additions, applied: false };
    // Validate the animation palette, cel and budgets before touching either history.
    const prepared = animationSession.prepareDocument(plan.document);
    preparedSelectionCommit = prepared;
    try {
      const previousLease = drawOperationLease; drawOperationLease = lease;
      let committed;
      try { committed = history.commit(plan.document); } finally { drawOperationLease = previousLease; }
      if (committed) {
        saved = false; renderPalette(); showCurrentColor(); paint(); animationControls?.refresh(); pxdBridge?.markDirty();
      }
    } finally { preparedSelectionCommit = null; }
    return plan.additions;
  }
};
}
