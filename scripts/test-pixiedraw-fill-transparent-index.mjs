import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(
  fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/pixel-patch-history-utils.js'), 'utf8'),
  { filename: 'pixel-patch-history-utils.js' }
);
vm.runInThisContext(
  fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/canvas-pointer-workflow-utils.js'), 'utf8'),
  { filename: 'canvas-pointer-workflow-utils.js' }
);
vm.runInThisContext(
  fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/canvas-drawing-workflow-utils.js'), 'utf8'),
  { filename: 'canvas-drawing-workflow-utils.js' }
);
vm.runInThisContext(
  fs.readFileSync(path.join(repoRoot, 'pixiedraw/assets/js/modules/canvas-overlay-workflow-utils.js'), 'utf8'),
  { filename: 'canvas-overlay-workflow-utils.js' }
);

const state = {
  palette: [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 255, g: 32, b: 32, a: 255 },
    { r: 32, g: 144, b: 255, a: 255 },
  ],
};
const utils = window.PiXiEEDrawModules.canvasPointerWorkflowUtils.createCanvasPointerWorkflowUtils({
  state,
  window,
  Uint8Array,
  Int16Array,
  Uint8ClampedArray,
  Array,
  Number,
});

const transparentLayer = { indices: new Uint8Array([0, 0]), direct: null };
const transparent = utils.getLayerPixelMatchState(transparentLayer, 0);
assert.equal(transparent?.transparent, true, 'index 0 must be a transparent fill/select target');
assert.equal(utils.layerPixelMatchesMatchState(transparent, 0), true);
assert.equal(utils.layerPixelMatchesMatchState(transparent, 1), true);

const mixedLayer = { indices: new Uint8Array([0, 1]), direct: null };
const mixedTransparent = utils.getLayerPixelMatchState(mixedLayer, 0);
assert.equal(utils.layerPixelMatchesMatchState(mixedTransparent, 1), false, 'transparent fill must not cross a painted index');

const directLayer = { indices: new Int16Array([-1]), direct: new Uint8ClampedArray([0, 0, 0, 0]) };
const directTransparent = utils.getLayerPixelMatchState(directLayer, 0);
assert.equal(directTransparent?.transparent, true, 'legacy transparent pixels must be fill/select targets');
assert.equal(utils.layerPixelMatchesMatchState(directTransparent, 0), true);

const fillState = {
  width: 3,
  height: 2,
  palette: state.palette,
  selectSameMode: 'connected',
  selectionMask: null,
  fillStyle: 'solid',
};
let fillLayer = { indices: new Uint8Array([0, 0, 2, 0, 0, 2]), direct: null, directOnly: false };
const fillHistory = new Map();
let preparedPatchCalls = 0;
const dirtyRects = [];
let historyDirtyCalls = 0;
const drawing = window.PiXiEEDrawModules.canvasDrawingWorkflowUtils.createCanvasDrawingWorkflowUtils({
  state: fillState,
  pointerState: { tool: 'fill' },
  Uint8Array,
  Int16Array,
  Uint8ClampedArray,
  Number,
  Math,
  getActiveLayer: () => fillLayer,
  getActiveProjectCanvasDocument: () => fillState,
  isIndexColorMode: () => true,
  isRgbColorMode: () => false,
  isMultiPaletteIsolationEnabled: () => false,
  resolveDrawPaletteIndex: () => 1,
  resolveTransparentStoragePaletteIndex: () => 0,
  getRasterLayerTransparentStorageValue: () => 0,
  getLayerPixelMatchState: utils.getLayerPixelMatchState,
  layerPixelMatchesMatchState: utils.layerPixelMatchesMatchState,
  isMirrorEnabledForTool: () => false,
  isSimulationLayer: () => false,
  writeLayerRuntimeIndex: (layer, index, value) => { layer.indices[index] = value; return true; },
  readLayerRuntimeIndex: (layer, index) => layer.indices[index],
  preparePendingSolidFillPatch: () => { preparedPatchCalls += 1; return {}; },
  preparePendingSolidFillRuns: () => { preparedPatchCalls += 1; return {}; },
  recordPendingPixelPatchBefore: (_layer, index) => {
    if (!fillHistory.has(index)) fillHistory.set(index, { before: fillLayer.indices[index], after: null });
  },
  recordPendingPixelPatchAfter: (_layer, index) => { fillHistory.get(index).after = fillLayer.indices[index]; },
  markHistoryDirty: () => { historyDirtyCalls += 1; },
  markDirtyPixel: () => {},
  markDirtyRect: (...bounds) => { dirtyRects.push(bounds); },
  requestRender: () => {},
  normalizeSelectSameMode: value => value,
  SELECT_SAME_MODE_CONNECTED: 'connected',
  SELECT_SAME_MODE_GLOBAL: 'global',
  normalizeFillStyle: value => value,
  normalizeColorValue: value => value,
  isGradientFillStyle: () => false,
});
drawing.floodFill(0, 0, 1);
assert.deepEqual(Array.from(fillLayer.indices), [1, 1, 2, 1, 1, 2], 'connected Fill must replace an index-0 background without crossing a colored boundary');
assert.equal(historyDirtyCalls, 1, 'a fill must commit history once');
assert.equal(dirtyRects.length, 1, 'a fill must dirty one bounding rectangle');

fillLayer = { indices: new Uint8Array([2, 2, 1, 2, 1, 2]), direct: null, directOnly: false };
fillState.selectSameMode = 'connected';
drawing.floodFill(0, 0, 1);
assert.deepEqual(Array.from(fillLayer.indices), [1, 1, 1, 1, 1, 2], 'connected Fill must recolor the full contiguous decoration but leave a separated same-color decoration unchanged');

fillLayer = { indices: new Uint8Array([0, 1, 0, 1, 0, 0]), direct: null, directOnly: false };
fillState.selectSameMode = 'global';
drawing.floodFill(0, 0, 1);
assert.deepEqual(Array.from(fillLayer.indices), [1, 1, 1, 1, 1, 1], 'global Fill must reference and replace every transparent index-0 pixel');

fillState.width = 512;
fillState.height = 512;
fillState.selectSameMode = 'connected';
fillLayer = { indices: new Uint8Array(fillState.width * fillState.height), direct: null, directOnly: false };
fillHistory.clear();
dirtyRects.length = 0;
historyDirtyCalls = 0;
const startedAt = performance.now();
drawing.floodFill(0, 0, 1);
const elapsedMs = performance.now() - startedAt;
assert.equal(fillHistory.size, 0, 'large fill must not create one JS history object per changed pixel');
assert.ok(preparedPatchCalls >= 4, 'solid fills must use the scoped compressed-history preparation path');
assert.equal(historyDirtyCalls, 1, 'large fill must not repeatedly mark history dirty');
assert.equal(dirtyRects.length, 1, 'large fill must redraw one accumulated rectangle');
assert.ok(elapsedMs < 1500, `512px solid fill should finish within 1.5s in the algorithm test (actual: ${elapsedMs.toFixed(1)}ms)`);

fillState.width = 1024;
fillState.height = 1024;
fillState.selectSameMode = 'global';
fillLayer = { indices: new Uint8Array(fillState.width * fillState.height), direct: null, directOnly: false };
const fullGlobalPreview = drawing.collectFillTargetPixels(fillLayer, 0, 0, { fillMode: 'global', limit: 1048577 });
assert.equal(fullGlobalPreview.length, fillState.width * fillState.height, 'global preview must retain the complete 1024px transparent target set');
const largeFillStartedAt = performance.now();
drawing.floodFill(0, 0, 1);
const largeFillElapsedMs = performance.now() - largeFillStartedAt;
assert.equal(fillLayer.indices[0], 1, '1000px-class fill must update the first pixel');
assert.equal(fillLayer.indices[fillLayer.indices.length - 1], 1, '1000px-class fill must update the final pixel');
assert.ok(largeFillElapsedMs < 3000, `1024px solid fill should finish within 3s in the algorithm test (actual: ${largeFillElapsedMs.toFixed(1)}ms)`);

const previewCalls = [];
const overlay = window.PiXiEEDrawModules.canvasOverlayWorkflowUtils.createCanvasOverlayWorkflowUtils({
  state: { width: 3, height: 2, selectionMask: null, selectSameMode: 'global' },
  ctx: { overlay: { save: () => {}, restore: () => {}, fillRect: (...args) => previewCalls.push(args), fillStyle: '' } },
  pointerState: { drawPaletteIndex: 1 },
  FILL_TOOL_SOLID: 'fill',
  SELECT_SAME_MODE_CONNECTED: 'connected',
  SELECT_SAME_MODE_GLOBAL: 'global',
  FILL_PREVIEW_MIRROR_DEDUP_MAX_PIXELS: 8192,
  normalizeFillStyle: value => value,
  normalizeColorValue: value => value,
  getActiveFillStyle: () => 'solid',
  isGradientFillStyle: () => false,
  isMirrorEnabledForTool: () => false,
  normalizeSelectSameMode: value => value,
  getActiveDrawColor: () => ({ r: 255, g: 32, b: 32, a: 255 }),
  rgbaToCss: () => '#ff2020',
  Uint8Array,
  Number,
  Math,
});
overlay.drawFillPreviewPixels([0, 1, 3, 4], { x: 0, y: 0 }, { x: 0, y: 0 }, 'fill', { fillStyle: 'solid' });
assert.deepEqual(previewCalls, [[0, 0, 2, 1], [0, 1, 2, 1]], 'global fill preview must coalesce and show separated rows, not a fixed prefix column');

const historyState = { width: 5, height: 2 };
const historyLayer = {
  id: 'layer-fill',
  indices: new Uint8Array([0, 0, 2, 0, 0, 2, 2, 0, 0, 2]),
  direct: null,
  directOnly: false,
};
const historyFrame = { id: 'frame-fill', layers: [historyLayer] };
const historyCanvas = { id: 'canvas-fill', width: 5, height: 2, frames: [historyFrame] };
const historyStore = { pending: {
  __historyEntryType: 'pixelPatch', label: 'fill', canvasId: 'canvas-fill', frameId: 'frame-fill', layerId: 'layer-fill', width: 5, height: 2, changesByIndex: new Map(),
} };
const fillHistoryUtils = window.PiXiEEDrawModules.pixelPatchHistoryUtils.createPixelPatchHistoryUtils({
  state: historyState, history: historyStore, HISTORY_ENTRY_TYPE_PIXEL_PATCH: 'pixelPatch', PIXEL_PATCH_HISTORY_LABELS: new Set(['fill']),
  multiState: { connected: false }, getActiveSharedProjectKey: () => '', isSharedProjectCollaborativeMode: () => false, isVoxelExtensionModeEnabled: () => false,
  getActiveLayer: () => historyLayer, getActiveProjectCanvasDocument: () => historyCanvas, getActiveFrame: () => historyFrame,
  isSimulationLayer: () => false, getProjectCanvasDocumentById: id => id === 'canvas-fill' ? historyCanvas : null,
  ensureLayerDirect: () => { throw new Error('solid index fill must not allocate direct pixels'); },
  getRasterLayerRuntimeStoredIndex: (layer, index) => layer.indices[index], setRasterLayerRuntimeStoredIndex: (layer, index, value) => { layer.indices[index] = value; },
  clamp: value => value, refreshLayerDirectOnlyFlag: () => {}, invalidateFillPreviewCache: () => {}, invalidateOnionSkinCache: () => {}, clearPlaybackFrameCache: () => {},
  markDirtyRect: () => {}, requestRender: () => {}, requestOverlayRender: () => {}, renderAllProjectCanvasSurfaces: () => {},
});
const scopedFill = fillHistoryUtils.preparePendingSolidFillPatch(historyLayer, [0, 1, 3, 4, 7, 8], 1);
assert.equal(scopedFill?.kind, 'solid-fill-runs', 'solid fills must create a compressed layer/frame patch');
assert.deepEqual(Array.from(scopedFill.runs), [0, 2, 3, 2, 7, 2], 'separated decorations must be represented as scanline runs');
assert.equal(scopedFill.beforeIndices.length, 6, 'only modified pixels are retained');
assert.equal(scopedFill.canvasId, 'canvas-fill');
assert.equal(scopedFill.frameId, 'frame-fill');
assert.equal(scopedFill.layerId, 'layer-fill');
for (const index of [0, 1, 3, 4, 7, 8]) historyLayer.indices[index] = 1;
assert.equal(fillHistoryUtils.applyPixelPatchHistoryEntry(scopedFill, 'undo'), true);
assert.deepEqual(Array.from(historyLayer.indices), [0, 0, 2, 0, 0, 2, 2, 0, 0, 2], 'undo restores only the affected layer/frame pixels');
assert.equal(fillHistoryUtils.applyPixelPatchHistoryEntry(scopedFill, 'redo'), true);
assert.deepEqual(Array.from(historyLayer.indices), [1, 1, 2, 1, 1, 2, 2, 1, 1, 2], 'redo reapplies the same run patch');

historyStore.pending = fillHistoryUtils.createRasterTilePatchPending('pen');
assert.equal(historyStore.pending?.kind, 'raster-tile-patch-pending', 'large brushes must retain touched tiles only');
assert.equal(fillHistoryUtils.capturePendingRasterTilesForRect(historyLayer, 0, 0, 2, 1), true);
historyLayer.indices.fill(2, 0, 3);
historyStore.pending.dirty = true;
const largeBrushEntry = fillHistoryUtils.finalizePixelPatchHistoryEntry(historyStore.pending);
assert.equal(largeBrushEntry?.kind, 'raster-tile-patch');
assert.equal(largeBrushEntry.frameId, 'frame-fill');
assert.equal(largeBrushEntry.layerId, 'layer-fill');
assert.equal(fillHistoryUtils.applyPixelPatchHistoryEntry(largeBrushEntry, 'undo'), true);
assert.deepEqual(Array.from(historyLayer.indices), [1, 1, 2, 1, 1, 2, 2, 1, 1, 2], 'large-brush undo restores only touched raster tiles');

historyStore.pending = {
  __historyEntryType: 'pixelPatch', label: 'selectionPastePixels', canvasId: 'canvas-fill', frameId: 'frame-fill', layerId: 'layer-fill',
  width: 5, height: 2, dirty: false, changesByIndex: new Map(),
};
assert.equal(fillHistoryUtils.promotePendingPixelPatchToRasterTiles(), true, 'a large paste can promote an untouched pixel transaction to tiles');
assert.equal(historyStore.pending?.kind, 'raster-tile-patch-pending');
fillHistoryUtils.capturePendingRasterTilesForRect(historyLayer, 1, 0, 3, 1);
historyLayer.indices.fill(2, 1, 4);
historyStore.pending.dirty = true;
const largePasteEntry = fillHistoryUtils.finalizePixelPatchHistoryEntry(historyStore.pending);
assert.equal(largePasteEntry?.kind, 'raster-tile-patch', 'promoted paste history remains a tile patch');
assert.equal(fillHistoryUtils.applyPixelPatchHistoryEntry(largePasteEntry, 'undo'), true);
assert.deepEqual(Array.from(historyLayer.indices), [1, 1, 2, 1, 1, 2, 2, 1, 1, 2], 'promoted paste undo restores the affected tile data');

console.log(`PiXiEEDraw transparent index fill guard passed (${elapsedMs.toFixed(1)}ms for 512px fill; ${largeFillElapsedMs.toFixed(1)}ms for 1024px fill).`);
