import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const modulePath = new URL('../pixiedraw/assets/js/modules/document-model.js', import.meta.url);
const timelineNavigationPath = new URL('../pixiedraw/assets/js/modules/timeline-navigation-workflow-utils.js', import.meta.url);
const memoryUtilsPath = new URL('../pixiedraw/assets/js/modules/memory-utils.js', import.meta.url);
const documentFixture = {};
const context = {
  Array,
  ArrayBuffer,
  Date,
  Int16Array,
  Math,
  Uint8Array,
  Uint8ClampedArray,
  console,
  crypto: globalThis.crypto,
  document: documentFixture,
  navigator: {},
  performance: { now: () => 0 },
  window: { document: documentFixture, PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: 'document-model.js' });
vm.runInContext(fs.readFileSync(timelineNavigationPath, 'utf8'), context, {
  filename: 'timeline-navigation-workflow-utils.js',
});
vm.runInContext(fs.readFileSync(memoryUtilsPath, 'utf8'), context, { filename: 'memory-utils.js' });

const palette = [
  { r: 255, g: 0, b: 0, a: 255 },
  { r: 0, g: 255, b: 0, a: 255 },
];
const model = context.window.PiXiEEDrawModules.documentModel.createDocumentModel({
  state: { width: 2, height: 2, palette },
  DEFAULT_LAYER_BLEND_MODE: 'normal',
  SIM_LAYER_TYPE: 'simulation',
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  getDefaultLayerName: index => `Layer ${index}`,
  getDefaultFrameName: index => `Frame ${index}`,
  getTransparentPaletteIndex: colors => colors.findIndex(color => Number(color?.a) <= 0),
  normalizeLayerOpacity: value => Number.isFinite(value) ? value : 1,
  normalizeLayerBlendMode: value => value || 'normal',
  normalizeVoxelPreviewYawDegrees: value => Number(value) || 0,
  normalizeVoxelPreviewPitchDegrees: value => Number(value) || 0,
});

const layer = {
  id: 'layer-1',
  name: 'Layer 1',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
  indices: new Int16Array([-1, 0, 1, -1]),
  direct: null,
  directOnly: false,
};
assert.equal(model.compactLayerIndices(layer, palette, 4), true);
assert.equal(layer.indices instanceof Uint8Array, true);
assert.deepEqual(Array.from(layer.indices), [0, 1, 2, 0]);
assert.deepEqual(
  [0, 1, 2, 3].map(index => model.getStoredLayerPaletteIndex(layer, index)),
  [-1, 0, 1, -1]
);

const cloned = model.cloneLayerForSnapshot(layer);
assert.equal(cloned.indices instanceof Uint8Array, true);
assert.notEqual(cloned.indices, layer.indices);
assert.equal(cloned.indicesEncoding, 'uint8-zero-transparent-v1');
assert.deepEqual(Array.from(cloned.indices), [0, 1, 2, 0]);

const clonedFrames = model.cloneCanvasDocumentFrames([{
  id: 'frame-1',
  name: 'Frame 1',
  duration: 100,
  layers: [layer],
}], 2, 2);
assert.equal(clonedFrames[0].layers[0].indices instanceof Uint8Array, true);
assert.equal(clonedFrames[0].layers[0].indicesEncoding, 'uint8-zero-transparent-v1');
assert.deepEqual(Array.from(clonedFrames[0].layers[0].indices), [0, 1, 2, 0]);

const storedLayer = model.serializeLayerForDocument(layer, {
  preserveTypedArrays: true,
  width: 2,
  height: 2,
  palette,
});
assert.equal(storedLayer.indices instanceof Uint8Array, true);
assert.equal(storedLayer.indicesEncoding, 'uint8-zero-transparent-v1');
const restoredLayer = model.deserializeLayerFromDocument(
  storedLayer,
  4,
  'restored-layer',
  'Restored Layer',
  2,
  2,
  { reuseTypedArrays: false, trustStoredLayerFlags: true }
);
assert.equal(restoredLayer.indices instanceof Uint8Array, true);
assert.equal(restoredLayer.indicesEncoding, 'uint8-zero-transparent-v1');
assert.deepEqual(Array.from(restoredLayer.indices), [0, 1, 2, 0]);

const materialized = model.materializeLayerIndices(layer, 2, 2, palette);
assert.equal(materialized instanceof Int16Array, true);
assert.deepEqual(Array.from(materialized), [-1, 0, 1, -1]);
assert.equal(Object.hasOwn(layer, 'indicesEncoding'), false);

const fullPalette = Array.from({ length: 256 }, (_, index) => ({
  r: index,
  g: index,
  b: index,
  a: 255,
}));
const fullPaletteLayer = {
  indices: new Int16Array([255]),
};
assert.equal(model.compactLayerIndices(fullPaletteLayer, fullPalette, 1), false);
assert.equal(fullPaletteLayer.indices instanceof Int16Array, true);
assert.deepEqual(Array.from(fullPaletteLayer.indices), [255]);

const tiledBase = {
  indices: new Int16Array(64 * 64),
};
assert.equal(model.compactLayerIndicesToTiles(tiledBase, palette, 64, 64), true);
assert.equal(tiledBase.indicesEncoding, 'uint8-tiled-zero-transparent-v1');
assert.equal(tiledBase.indicesTiles.length, 4);
assert.equal(new Set(tiledBase.indicesTiles.map(tile => tile.buffer)).size, 1);

const tiledNext = {
  indices: new Int16Array(64 * 64),
};
tiledNext.indices[0] = 1;
assert.equal(model.compactLayerIndicesToTiles(tiledNext, palette, 64, 64, tiledBase), true);
assert.equal(tiledNext.indicesEncoding, 'uint8-tiled-zero-transparent-v1');
assert.notEqual(tiledNext.indicesTiles[0], tiledBase.indicesTiles[0]);
assert.equal(tiledNext.indicesTiles[1], tiledBase.indicesTiles[1]);
assert.equal(tiledNext.indicesTiles[2], tiledBase.indicesTiles[2]);
assert.equal(tiledNext.indicesTiles[3], tiledBase.indicesTiles[3]);
assert.equal(model.getStoredLayerPaletteIndex(tiledNext, 0), 1);
assert.equal(model.getStoredLayerPaletteIndex(tiledNext, 63), 0);

const tiledStored = model.serializeLayerForDocument(tiledNext, {
  preserveTypedArrays: true,
  width: 64,
  height: 64,
  palette,
});
assert.equal(tiledStored.indices instanceof Uint8Array, true);
assert.equal(tiledStored.indices.length, 64 * 64);
assert.equal(tiledStored.indicesEncoding, 'uint8-zero-transparent-v1');
assert.equal(tiledStored.indices[0], 2);
assert.equal(tiledStored.indices[63], 1);

const memory = context.window.PiXiEEDrawModules.memoryUtils.createMemoryUtils({
  dom: { controls: {} },
  state: {
    frames: [
      { layers: [tiledBase] },
      { layers: [tiledNext] },
    ],
    palette,
    selectionMask: null,
    selectionContentMask: null,
  },
  history: { past: [], future: [], pending: null, limit: 20 },
  DEFAULT_HISTORY_LIMIT: 20,
  MEMORY_MONITOR_INTERVAL: 1000,
  MEMORY_WARNING_DEFAULT: 1024 * 1024 * 1024,
  MIN_HISTORY_LIMIT: 2,
  HISTORY_MEMORY_BUDGET_BYTES: 64 * 1024 * 1024,
  estimateEncodedByteLength: (value, itemBytes) => ArrayBuffer.isView(value)
    ? value.byteLength
    : (Array.isArray(value) ? value.length * itemBytes : 0),
  isPixelPatchHistoryEntry: () => false,
  finalizePixelPatchHistoryEntry: value => value,
  getAllTimelapseTracks: () => ({}),
  getAllTimelapseStepCount: () => 0,
  getActiveTimelapseTrack: () => null,
  clearTimelapseRecording: () => {},
  fillPreviewCache: { clear: () => {} },
  updateHistoryButtons: () => {},
  markAutosaveDirty: () => {},
  scheduleAutosaveSnapshot: () => {},
  localizeText: value => value,
  formatBytes: value => String(value),
  normalizeProjectHistoryLimit: value => value,
  getCanvasCompositeCacheBytes: () => 4096,
});
assert.equal(
  memory.estimateStateBytes(),
  (32 * 32 * 2) + (palette.length * 16),
  'shared tile buffers must be counted once in the memory indicator'
);
assert.equal(memory.getMemoryUsageBreakdown().compositeCache, 4096);
assert.equal(memory.getMemoryUsageBreakdown().total, memory.estimateStateBytes() + 4096);

const tiledMaterialized = model.materializeLayerIndices(tiledNext, 64, 64, palette);
assert.equal(tiledMaterialized instanceof Int16Array, true);
assert.equal(tiledMaterialized[0], 1);
assert.equal(tiledMaterialized[63], 0);
assert.equal(Object.hasOwn(tiledNext, 'indicesTiles'), false);

const navigationState = {
  activeFrame: 0,
  activeLayer: 'layer-1',
  palette,
  pendingPasteMoveState: null,
  frames: [
    { id: 'frame-1', layers: [{ id: 'layer-1' }] },
    { id: 'frame-2', layers: [{ id: 'layer-2' }] },
  ],
};
const navigationCanvas = {
  width: 2,
  height: 2,
  activeFrame: 0,
  activeLayer: 'layer-1',
  frames: navigationState.frames,
};
const compactedFrames = [];
const noOp = () => {};
const navigation = context.window.PiXiEEDrawModules.timelineNavigationWorkflowUtils
  .createTimelineNavigationWorkflowUtils({
    state: navigationState,
    pointerState: { active: false, selectionMove: null, lastSelectionMove: null },
    virtualCursorDrawState: { active: false },
    clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
    getProjectCanvasDocuments: () => [navigationCanvas],
    getActiveProjectCanvasDocument: () => navigationCanvas,
    compactInactiveRasterFrameIndices: frame => compactedFrames.push(frame),
    invalidateActiveCanvasCompositeRenderState: noOp,
    isVoxelExtensionModeEnabled: () => false,
    isMultiAssignedCellRestrictedEditorMode: () => false,
    updatePixfindModeUI: noOp,
    scheduleSharedProjectCellPresenceBroadcast: noOp,
  });
navigation.setActiveFrameIndex(1, {
  persist: false,
  render: false,
  syncUi: false,
  broadcastPresence: false,
});
assert.equal(navigationState.activeFrame, 1);
assert.equal(navigationState.activeLayer, 'layer-2');
assert.deepEqual(compactedFrames, [navigationState.frames[0]]);

console.log('PiXiEEDraw compact layer index runtime checks passed');
