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
  width: 3,
  height: 2,
  palette: [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 255, g: 32, b: 32, a: 255 },
    { r: 32, g: 144, b: 255, a: 255 },
  ],
};
const getStoredRasterLayerPaletteIndex = (layer, index) => {
  if (layer?.indicesTiles instanceof Map) {
    const width = Math.max(1, Number(layer.indicesWidth) || state.width);
    const tileSize = Math.max(1, Number(layer.indicesTileSize) || 32);
    const x = index % width;
    const y = Math.floor(index / width);
    const tileCols = Math.ceil(width / tileSize);
    const tileIndex = Math.floor(y / tileSize) * tileCols + Math.floor(x / tileSize);
    const localIndex = (y % tileSize) * tileSize + (x % tileSize);
    const stored = layer.indicesTiles.get(tileIndex)?.[localIndex] || 0;
    return stored === 0 ? -1 : stored - 1;
  }
  const stored = layer?.indices?.[index];
  if (layer?.indices instanceof Uint8Array) {
    return stored > 0 ? stored : -1;
  }
  return Number.isFinite(stored) ? stored : -1;
};
const setRasterLayerRuntimeStoredIndex = (layer, index, value) => {
  if (!(layer?.indicesTiles instanceof Map)) {
    layer.indices[index] = value;
    return true;
  }
  const width = Math.max(1, Number(layer.indicesWidth) || state.width);
  const tileSize = Math.max(1, Number(layer.indicesTileSize) || 32);
  const x = index % width;
  const y = Math.floor(index / width);
  const tileCols = Math.ceil(width / tileSize);
  const tileIndex = Math.floor(y / tileSize) * tileCols + Math.floor(x / tileSize);
  const localIndex = (y % tileSize) * tileSize + (x % tileSize);
  let tile = layer.indicesTiles.get(tileIndex);
  if (!tile) {
    tile = new Uint8Array(tileSize * tileSize);
    layer.indicesTiles.set(tileIndex, tile);
  }
  tile[localIndex] = value <= 0 ? 0 : value + 1;
  return true;
};
const utils = window.PiXiEEDrawModules.canvasPointerWorkflowUtils.createCanvasPointerWorkflowUtils({
  state,
  getStoredRasterLayerPaletteIndex,
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

const tiledPixels = new Uint8Array(32 * 32);
tiledPixels[0] = 2;
const tiledLayer = {
  indices: new Uint8Array(0),
  indicesEncoding: 'uint8-tiled-zero-transparent-v1',
  indicesTiles: new Map([[0, tiledPixels]]),
  indicesWidth: 3,
  indicesHeight: 2,
  indicesTileSize: 32,
  direct: null,
};
assert.equal(utils.layerHasDrawablePixel(tiledLayer, 0, 0), true, 'selection tools must see a painted tiled pixel');
assert.equal(utils.layerHasDrawablePixel(tiledLayer, 1, 0), false, 'selection tools must keep an empty tiled pixel transparent');
const tiledMatch = utils.getLayerPixelMatchState(tiledLayer, 0);
assert.equal(tiledMatch?.paletteIndex, 1);
assert.equal(utils.layerPixelMatchesMatchState(tiledMatch, 0), true);
assert.equal(utils.layerPixelMatchesMatchState(tiledMatch, 1), false);

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
  getActiveFrame: () => ({ layers: [fillLayer] }),
  getActiveProjectCanvasDocument: () => fillState,
  getStoredRasterLayerPaletteIndex,
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
  getRasterLayerRuntimeStoredIndex: (layer, index) => {
    const paletteIndex = getStoredRasterLayerPaletteIndex(layer, index);
    return paletteIndex >= 0 ? paletteIndex : 0;
  },
  setRasterLayerRuntimeStoredIndex,
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
  getDisplayedLayerVisibility: () => true,
  getDisplayedLayerPreviewOpacity: () => 1,
  normalizeLayerBlendMode: value => value || 'normal',
  compositeLayerPixelNormalized: (data, offset, r, g, b, a) => {
    data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = a;
  },
  findNearestPaletteIndexForColor: color => fillState.palette.findIndex(candidate => (
    candidate.r === color.r
    && candidate.g === color.g
    && candidate.b === color.b
    && candidate.a === color.a
  )),
  colorsMatchRgba: (left, right) => left?.r === right?.r
    && left?.g === right?.g
    && left?.b === right?.b
    && left?.a === right?.a,
  isGradientFillStyle: () => false,
});
drawing.floodFill(0, 0, 1);
assert.deepEqual(Array.from(fillLayer.indices), [1, 1, 2, 1, 1, 2], 'connected Fill must replace an index-0 background without crossing a colored boundary');
assert.equal(historyDirtyCalls, 1, 'a fill must commit history once');
assert.equal(dirtyRects.length, 1, 'a fill must dirty one bounding rectangle');

fillState.width = 3;
fillState.height = 2;
const sparseFillTile = new Uint8Array(32 * 32);
sparseFillTile[2] = 3;
sparseFillTile[34] = 3;
fillLayer = {
  indices: new Uint8Array(0),
  indicesEncoding: 'uint8-tiled-zero-transparent-v1',
  indicesTiles: new Map([[0, sparseFillTile]]),
  indicesWidth: 3,
  indicesHeight: 2,
  indicesTileSize: 32,
  direct: null,
  directOnly: false,
};
const sampledTiledColor = drawing.sampleCompositeColor(0, 0);
assert.equal(sampledTiledColor.color, null, 'eyedropper must keep a transparent tiled pixel empty');
drawing.floodFill(0, 0, 1);
assert.deepEqual(
  [0, 1, 2, 3, 4, 5].map(index => getStoredRasterLayerPaletteIndex(fillLayer, index)),
  [1, 1, 2, 1, 1, 2],
  'Fill must paint a transparent tiled region without crossing existing content'
);
const sampledFilledColor = drawing.sampleCompositeColor(0, 0);
assert.equal(sampledFilledColor.mode, 'index', 'eyedropper must recognize a color painted into tiled storage');
assert.equal(sampledFilledColor.index, 1);

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
