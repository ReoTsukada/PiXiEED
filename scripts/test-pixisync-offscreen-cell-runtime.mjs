import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = {
  Array,
  ArrayBuffer,
  Date,
  Int16Array,
  Map,
  Math,
  Number,
  Object,
  Set,
  Uint8Array,
  Uint8ClampedArray,
  console,
  crypto: globalThis.crypto,
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
for (const moduleName of [
  'document-model.js',
  'pixel-patch-history-utils.js',
  'pixisync-pixel-mutation-bridge-utils.js',
  'pixisync-lazy-cell-sync-utils.js',
  'canvas-render-workflow-utils.js',
]) {
  const modulePath = new URL(`../pixiedraw/assets/js/modules/${moduleName}`, import.meta.url);
  vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, { filename: moduleName });
}

const state = {
  width: 4,
  height: 4,
  rasterModelVersion: 1,
  palette: [
    { r: 0, g: 0, b: 0, a: 0 },
    { r: 255, g: 0, b: 0, a: 255 },
  ],
};
const model = context.window.PiXiEEDrawModules.documentModel.createDocumentModel({
  state,
  DEFAULT_LAYER_BLEND_MODE: 'normal',
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  getDefaultLayerName: index => `Layer ${index}`,
  getDefaultFrameName: index => `Frame ${index}`,
  getTransparentPaletteIndex: colors => colors.findIndex(color => Number(color?.a) <= 0),
  normalizeLayerOpacity: value => Number.isFinite(value) ? value : 1,
  normalizeLayerBlendMode: value => value || 'normal',
  normalizeVoxelPreviewYawDegrees: value => Number(value) || 0,
  normalizeVoxelPreviewPitchDegrees: value => Number(value) || 0,
});

const activeLayer = { id: 'layer-active', indices: new Uint8Array(16), direct: null, directOnly: false };
const offscreenLayer = { id: 'layer-offscreen', indices: new Uint8Array(0), direct: null, directOnly: false };
const visiblePeerLayer = { id: 'layer-visible-peer', visible: true, indices: new Uint8Array(16), direct: null, directOnly: false };
const hiddenPeerLayer = { id: 'layer-hidden-peer', visible: false, indices: new Uint8Array(16), direct: null, directOnly: false };
const activeFrame = { id: 'frame-active', layers: [activeLayer, visiblePeerLayer, hiddenPeerLayer] };
const offscreenFrame = { id: 'frame-offscreen', layers: [offscreenLayer] };
const canvasDoc = { id: 'canvas-a', width: 4, height: 4, frames: [activeFrame, offscreenFrame] };
const historyUtils = context.window.PiXiEEDrawModules.pixelPatchHistoryUtils.createPixelPatchHistoryUtils({
  state,
  history: { pending: null },
  HISTORY_ENTRY_TYPE_PIXEL_PATCH: 'pixelPatch',
  PIXEL_PATCH_HISTORY_LABELS: new Set(['pen']),
  multiState: { connected: true },
  getActiveSharedProjectKey: () => 'shared-project',
  isSharedProjectCollaborativeMode: () => true,
  isVoxelExtensionModeEnabled: () => false,
  getActiveLayer: () => activeLayer,
  getActiveProjectCanvasDocument: () => canvasDoc,
  getActiveFrame: () => activeFrame,
  getProjectCanvasDocumentById: id => id === canvasDoc.id ? canvasDoc : null,
  ensureLayerDirect: () => { throw new Error('indexed PiXiSYNC patch must not allocate direct pixels'); },
  ensureSparseWritableLayerIndices: (...args) => model.ensureSparseWritableLayerIndices(...args),
  ensureWritableLayerIndices: (...args) => model.ensureWritableLayerIndices(...args),
  getRasterLayerRuntimeStoredIndex: (...args) => model.getLayerRuntimeStoredIndex(...args),
  setRasterLayerRuntimeStoredIndex: (...args) => model.setLayerRuntimeStoredIndex(...args),
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  refreshLayerDirectOnlyFlag: () => {},
  invalidateFillPreviewCache: () => {},
  invalidateOnionSkinCache: () => {},
  clearPlaybackFrameCache: () => {},
  markDirtyRect: () => {},
  requestRender: () => {},
  requestOverlayRender: () => {},
  renderAllProjectCanvasSurfaces: () => {},
});

let changedTarget = null;
const bridge = context.window.PiXiEEDrawModules.pixisyncPixelMutationBridgeUtils
  .createPiXiSyncPixelMutationBridgeUtils({
    resolveTarget: mutation => {
      const target = historyUtils.resolvePixelPatchHistoryTarget({
        __historyEntryType: 'pixelPatch',
        canvasId: mutation.canvasId,
        frameId: mutation.frameId,
        layerId: mutation.layerId,
        width: mutation.canvasWidth,
        height: mutation.canvasHeight,
      });
      return target ? { ...target, v1Compatible: true } : null;
    },
    writeLayerPixelPatchValue: historyUtils.writeLayerPixelPatchValue,
    markDirtyRect: (_x0, _y0, _x1, _y1, target) => { changedTarget = target; },
    requestRender: () => {},
    requestOverlayRender: () => {},
  });

const result = bridge.applyPixelMutation({
  canvasId: canvasDoc.id,
  frameId: offscreenFrame.id,
  layerId: offscreenLayer.id,
  canvasWidth: 4,
  canvasHeight: 4,
  changes: [{ index: 10, paletteValue: 1, beforePaletteValue: 0 }],
});
assert.equal(result.applied, 1, 'a remote patch must materialize a never-opened layer before writing');
assert.equal(model.getLayerRuntimeStoredIndex(offscreenLayer, 10), 1);
assert.equal(offscreenLayer.indices.length, 0, 'the deferred layer should stay sparse instead of allocating a dense buffer');
assert.equal(offscreenLayer.indicesTiles instanceof Map, true);
assert.equal(changedTarget?.frame, offscreenFrame, 'the bridge must identify the exact changed frame');
assert.equal(changedTarget?.canvasDoc, canvasDoc, 'the bridge must identify the exact changed canvas');
assert.equal(activeLayer.indices[10], 0, 'receiving an offscreen patch must not write into the selected cell');
assert.equal(activeFrame.id, 'frame-active', 'receiving an offscreen patch must not change the selected frame');
assert.equal(activeFrame.layers[0].id, 'layer-active', 'receiving an offscreen patch must not change the selected layer');

let liveDirtyTargets = 0;
let liveRenderRequests = 0;
const liveBridge = context.window.PiXiEEDrawModules.pixisyncPixelMutationBridgeUtils
  .createPiXiSyncPixelMutationBridgeUtils({
    resolveTarget: mutation => {
      const target = historyUtils.resolvePixelPatchHistoryTarget({
        __historyEntryType: 'pixelPatch',
        canvasId: mutation.canvasId,
        frameId: mutation.frameId,
        layerId: mutation.layerId,
        width: mutation.canvasWidth,
        height: mutation.canvasHeight,
      });
      return target ? { ...target, v1Compatible: true } : null;
    },
    writeLayerPixelPatchValue: historyUtils.writeLayerPixelPatchValue,
    markDirtyRect: (_x0, _y0, _x1, _y1, target) => {
      if (target?.frame === activeFrame) liveDirtyTargets += 1;
    },
    requestRender: () => { liveRenderRequests += 1; },
    requestOverlayRender: () => {},
  });
const lazySync = context.window.PiXiEEDrawModules.pixisyncLazyCellSyncUtils
  .createPiXiSyncLazyCellSyncUtils({
    isTargetActive: target => {
      const targetLayer = activeFrame.layers.find(layer => layer.id === target.layerId);
      return canvasDoc.id === target.canvasId
        && activeFrame.id === target.frameId
        && Boolean(targetLayer?.visible);
    },
    applyPixelMutation: mutation => liveBridge.applyPixelMutation(mutation),
  });
const visibleMutation = {
  canvasId: canvasDoc.id,
  frameId: activeFrame.id,
  layerId: visiblePeerLayer.id,
  canvasWidth: 4,
  canvasHeight: 4,
  changes: [{ index: 5, paletteValue: 1, beforePaletteValue: 0 }],
};
assert.equal(lazySync.shouldDefer(visibleMutation), false, 'a visible layer on the displayed frame must update live');
const visibleResult = liveBridge.applyPixelMutation(visibleMutation);
assert.equal(visibleResult.applied, 1);
assert.equal(visiblePeerLayer.indices[5], 1, 'the visible non-active layer must update without cell navigation');
assert.equal(liveDirtyTargets, 1, 'the displayed frame must be dirtied for a visible non-active layer patch');
assert.equal(liveRenderRequests, 1, 'the displayed frame must request an immediate render');

const hiddenMutation = {
  ...visibleMutation,
  layerId: hiddenPeerLayer.id,
  changes: [{ index: 6, paletteValue: 1, beforePaletteValue: 0 }],
};
assert.equal(lazySync.shouldDefer(hiddenMutation), true, 'a hidden layer may remain deferred');
assert.equal(lazySync.defer(hiddenMutation).deferred, true);
assert.equal(hiddenPeerLayer.indices[6], 0);
hiddenPeerLayer.visible = true;
assert.equal(lazySync.flushActive().applied, 1, 'showing the hidden layer must hydrate its deferred pixels');
assert.equal(hiddenPeerLayer.indices[6], 1);

const rejectedHistoryUtils = context.window.PiXiEEDrawModules.pixelPatchHistoryUtils.createPixelPatchHistoryUtils({
  state,
  history: { pending: null },
  HISTORY_ENTRY_TYPE_PIXEL_PATCH: 'pixelPatch',
  PIXEL_PATCH_HISTORY_LABELS: new Set(['pen']),
  multiState: { connected: true },
  getActiveSharedProjectKey: () => 'shared-project',
  isSharedProjectCollaborativeMode: () => true,
  isVoxelExtensionModeEnabled: () => false,
  getActiveLayer: () => activeLayer,
  getActiveProjectCanvasDocument: () => canvasDoc,
  getActiveFrame: () => activeFrame,
  getProjectCanvasDocumentById: () => canvasDoc,
  ensureLayerDirect: () => null,
  ensureSparseWritableLayerIndices: () => false,
  ensureWritableLayerIndices: () => null,
  getRasterLayerRuntimeStoredIndex: () => 0,
  setRasterLayerRuntimeStoredIndex: () => false,
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  refreshLayerDirectOnlyFlag: () => {},
});
assert.equal(
  rejectedHistoryUtils.writeLayerPixelPatchValue(
    { id: 'unwritable', indices: new Uint8Array(0), direct: null, directOnly: false },
    1,
    { paletteIndex: 1 },
    4,
    4
  ),
  false,
  'an unwritable layer must report failure instead of silently confirming the remote patch'
);

const activeCanvas = { id: 'canvas-active' };
const otherCanvas = { id: 'canvas-other' };
const otherFrame = { id: 'frame-other' };
const cache = {
  byFrame: new Map([
    [`${activeCanvas.id}:${activeFrame.id}`, { bytes: 64 }],
    [`${otherCanvas.id}:${otherFrame.id}`, { bytes: 64 }],
  ]),
  bytes: 128,
  maxBytes: 1024,
  hits: 0,
  misses: 0,
};
const renderWorkflow = context.window.PiXiEEDrawModules.canvasRenderWorkflowUtils
  .createCanvasRenderWorkflowUtils({
    state: { width: 4, height: 4 },
    dirtyRegion: null,
    canvasCompositeFrameCache: cache,
    getActiveProjectCanvasDocument: () => activeCanvas,
    getActiveFrame: () => activeFrame,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  });
assert.equal(renderWorkflow.invalidateCanvasCompositeFrameCacheEntry(otherFrame, otherCanvas), true);
assert.equal(cache.byFrame.has(`${otherCanvas.id}:${otherFrame.id}`), false, 'the changed offscreen cache must be removed');
assert.equal(cache.byFrame.has(`${activeCanvas.id}:${activeFrame.id}`), true, 'the selected frame cache must be preserved');
assert.equal(cache.bytes, 64);

console.log('PiXiSYNC offscreen layer/frame runtime checks passed');
