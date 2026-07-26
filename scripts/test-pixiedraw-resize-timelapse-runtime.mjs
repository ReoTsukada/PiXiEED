import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const timelapseModulePath = new URL('../pixiedraw/assets/js/modules/timelapse-session-utils.js', import.meta.url);
const resizeModulePath = new URL('../pixiedraw/assets/js/modules/canvas-resize-workflow-utils.js', import.meta.url);
const context = {
  Array,
  Int16Array,
  Math,
  Number,
  Uint8Array,
  Uint8ClampedArray,
  HTMLInputElement: class HTMLInputElement {},
  console,
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(timelapseModulePath, 'utf8'), context, {
  filename: 'timelapse-session-utils.js',
});
vm.runInContext(fs.readFileSync(resizeModulePath, 'utf8'), context, {
  filename: 'canvas-resize-workflow-utils.js',
});

const canvas = { id: 'canvas-resize-test', width: 2, height: 2, frames: [{ id: 'frame-1', layers: [] }], activeFrame: 0 };
const timelapseState = { enabled: true, tracksByCanvasId: Object.create(null), fps: 12 };
const createEmptyTimelapseTrack = () => ({
  snapshots: [], serializedSnapshots: [], operationLog: null, warningShown: false, sampleStep: 1, lastCaptureToken: -1,
  resizeRevision: 0, resizeEvents: [],
});
const timelapse = context.window.PiXiEEDrawModules.timelapseSessionUtils
  .createTimelapseSessionUtils({
    activeSharedProjectKey: '',
    timelapseState,
    createEmptyTimelapseTrack,
    getActiveProjectCanvasDocument: () => canvas,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    decodeUint8Data: value => value instanceof Uint8ClampedArray ? value : new Uint8ClampedArray(value),
  });

assert.equal(timelapse.recordTimelapseCanvasResize({ canvasId: canvas.id, offsetX: 2, offsetY: 1 }), true);
const track = timelapse.getTimelapseTrack(canvas.id);
assert.equal(track.resizeRevision, 1, 'a resize creates a timelapse coordinate revision');
const oldPixels = new Uint8ClampedArray([
  255, 0, 0, 255, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0,
]);
const placedOld = timelapse.placeTimelapseFrameOnExportCanvas(
  { width: 2, height: 2, resizeRevision: 0, pixels: oldPixels },
  4,
  3,
  track
);
assert.equal(placedOld.length, 4 * 3 * 4, 'old-size frame is retained at the final GIF dimensions');
assert.deepEqual(
  Array.from(placedOld.subarray(((1 * 4) + 2) * 4, ((1 * 4) + 2) * 4 + 4)),
  [255, 0, 0, 255],
  'start-anchored expansion keeps old pixels at their recorded offset without scaling'
);
assert.deepEqual(Array.from(placedOld.subarray(0, 4)), [0, 0, 0, 0], 'old pixels are not stretched into new canvas area');

let beginHistoryCalls = 0;
let commitHistoryCalls = 0;
let sharedResize = false;
const resizeState = { width: 2, height: 2, scale: 1, pan: { x: 0, y: 0 }, frames: [] };
const captureCalls = [];
const resizeEvents = [];
const resize = context.window.PiXiEEDrawModules.canvasResizeWorkflowUtils
  .createCanvasResizeWorkflowUtils({
    state: resizeState,
    MIN_CANVAS_SIZE: 1,
    MAX_CANVAS_SIZE: 64,
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    getPixelAlignedCanvasDisplayScale: value => value,
    beginHistory: () => { beginHistoryCalls += 1; },
    commitHistory: () => { commitHistoryCalls += 1; },
    scheduleTimelapseCaptureFromState: options => { captureCalls.push(options || {}); },
    recordTimelapseCanvasResize: event => { resizeEvents.push(event); },
    resizeAllLayers: () => {},
    translateMirrorPivotForCanvasResize: () => {},
    markHistoryDirty: () => {},
    resizeCanvases: () => {},
    clearSelection: () => {},
    requestRender: () => {},
    requestOverlayRender: () => {},
    isSharedProjectCollaborativeMode: () => sharedResize,
    scheduleSessionPersist: () => {},
    updateCanvasResizeControls: () => {},
    updateMemoryStatus: () => {},
    dom: { controls: { canvasWidth: null, canvasHeight: null } },
  });

assert.equal(resize.applyCanvasResizeDimensions(4, 3), true);
assert.equal(beginHistoryCalls, 0, 'canvas resize must not create an Undo history entry');
assert.equal(commitHistoryCalls, 0, 'canvas resize must not commit an Undo history entry');
assert.equal(captureCalls.length, 2, 'canvas resize captures both sides of the timelapse boundary');
assert.equal(captureCalls[0].immediate, true, 'pre-resize capture is completed before changing dimensions');
assert.equal(resizeEvents.length, 1);
assert.equal(resizeEvents[0].offsetX, 0);
assert.equal(resizeEvents[0].offsetY, 0, 'resize anchor metadata is recorded for GIF composition');

sharedResize = true;
assert.equal(resize.applyCanvasResizeDimensions(5, 3), true);
assert.equal(beginHistoryCalls, 1, 'shared resize retains the structural-history transport for peer synchronization');
assert.equal(commitHistoryCalls, 1, 'shared resize commits its synchronization transport exactly once');

const importedLayer = {
  id: 'imported-layer',
  name: '画像レイヤー',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
  // This is the shape of a compact/tiled imported frame: pixels are not in
  // the empty `indices` buffer.
  indices: new Uint8Array(0),
  indicesEncoding: 'uint8-tiled-zero-transparent-v1',
  indicesTiles: new Map([[0, new Uint8Array([0, 2, 1, 0])]]),
  indicesWidth: 2,
  indicesHeight: 2,
  direct: new Uint8ClampedArray([
    0, 0, 0, 0, 10, 20, 30, 255,
    40, 50, 60, 255, 0, 0, 0, 0,
  ]),
  importSourceDirect: new Uint8ClampedArray([
    0, 0, 0, 0, 10, 20, 30, 255,
    40, 50, 60, 255, 0, 0, 0, 0,
  ]),
  directOnly: true,
};
const importedResizeState = {
  width: 2,
  height: 2,
  palette: [{ r: 0, g: 0, b: 0, a: 0 }, { r: 255, g: 0, b: 0, a: 255 }],
  frames: [{ layers: [importedLayer] }],
};
const importedResize = context.window.PiXiEEDrawModules.canvasResizeWorkflowUtils
  .createCanvasResizeWorkflowUtils({
    state: importedResizeState,
    createLayer: (name, width, height, palette) => ({
      id: 'new-layer', name, visible: true, opacity: 1, blendMode: 'normal',
      indices: Array.isArray(palette) && palette.length > 0
        ? new Uint8Array(width * height)
        : new Int16Array(width * height).fill(-1),
      direct: null,
      importSourceDirect: null,
    }),
    ensureLayerDirect: (layer, width, height) => {
      layer.direct = new Uint8ClampedArray(width * height * 4);
      return layer.direct;
    },
    isCompactLayerIndices: () => false,
    isTiledLayerIndices: layer => layer.indicesEncoding === 'uint8-tiled-zero-transparent-v1',
    isRuntimeUint8LayerIndices: layer => layer.indices instanceof Uint8Array && layer.indices.length > 0,
    materializeLayerIndices: layer => {
      layer.indices = new Int16Array([-1, 1, 0, -1]);
      delete layer.indicesEncoding;
      delete layer.indicesTiles;
      return layer.indices;
    },
    normalizeLayerOpacity: value => value,
    normalizeLayerBlendMode: value => value,
  });
importedResize.resizeAllLayers(3, 3);
const resizedImportedLayer = importedResizeState.frames[0].layers[0];
assert.deepEqual(
  Array.from(resizedImportedLayer.indices),
  [-1, 1, -1, 0, -1, -1, -1, -1, -1],
  'resizing a tiled imported image keeps its visible pixels instead of copying its empty backing array'
);
assert.equal(resizedImportedLayer.directOnly, true, 'imported direct-only rendering remains enabled after resize');
assert.deepEqual(
  Array.from(resizedImportedLayer.direct.subarray(4, 8)),
  [10, 20, 30, 255],
  'direct imported pixels retain their original position after resize'
);
assert.deepEqual(
  Array.from(resizedImportedLayer.importSourceDirect.subarray(12, 16)),
  [40, 50, 60, 255],
  'import source pixels are retained for later image editing'
);

const importedScaleLayer = {
  id: 'imported-scale-layer', name: '画像レイヤー', visible: true, opacity: 1, blendMode: 'normal',
  indices: new Uint8Array(0), indicesEncoding: 'uint8-tiled-zero-transparent-v1',
  indicesTiles: new Map([[0, new Uint8Array([0, 2, 1, 0])]]), indicesWidth: 2, indicesHeight: 2,
  direct: null, importSourceDirect: null,
};
const importedScaleState = {
  width: 2, height: 2, pan: { x: 0, y: 0 }, palette: importedResizeState.palette,
  selectionMask: null, selectionContentMask: null, selectionBounds: null,
  frames: [{ layers: [importedScaleLayer] }],
};
const importedScale = context.window.PiXiEEDrawModules.canvasResizeWorkflowUtils
  .createCanvasResizeWorkflowUtils({
    state: importedScaleState,
    MAX_CANVAS_SIZE: 64,
    createLayer: (name, width, height, palette) => ({
      id: 'new-layer', name, visible: true, opacity: 1, blendMode: 'normal',
      indices: Array.isArray(palette) && palette.length > 0
        ? new Uint8Array(width * height)
        : new Int16Array(width * height).fill(-1),
      direct: null, importSourceDirect: null,
    }),
    ensureLayerDirect: () => null,
    isCompactLayerIndices: () => false,
    isTiledLayerIndices: layer => layer.indicesEncoding === 'uint8-tiled-zero-transparent-v1',
    isRuntimeUint8LayerIndices: layer => layer.indices instanceof Uint8Array && layer.indices.length > 0,
    materializeLayerIndices: layer => {
      layer.indices = new Int16Array([-1, 1, 0, -1]);
      delete layer.indicesEncoding;
      delete layer.indicesTiles;
      return layer.indices;
    },
    normalizeLayerOpacity: value => value,
    normalizeLayerBlendMode: value => value,
    rescaleMirrorPivotForCanvas: () => {},
  });
assert.equal(importedScale.scaleDocumentByRatio(2, 1), true);
assert.deepEqual(
  Array.from(importedScaleState.frames[0].layers[0].indices),
  [-1, -1, 1, 1, -1, -1, 1, 1, 0, 0, -1, -1, 0, 0, -1, -1],
  'scaling a tiled imported image keeps its pixels instead of sampling an empty backing array'
);

console.log('PiXiEEDraw resize timelapse checks passed');
