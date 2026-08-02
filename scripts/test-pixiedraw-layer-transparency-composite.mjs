import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({
  console,
  performance,
  Map,
  Set,
  WeakMap,
  WeakSet,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
});
context.window = {};
context.globalThis = context;

for (const relativePath of [
  '../pixiedraw/assets/js/modules/canvas-core-workflow-utils.js',
  '../pixiedraw/assets/js/modules/canvas-render-workflow-utils.js',
]) {
  const fileUrl = new URL(relativePath, import.meta.url);
  vm.runInContext(fs.readFileSync(fileUrl, 'utf8'), context, { filename: fileUrl.pathname });
}

const palette = [
  { r: 0, g: 0, b: 0, a: 0 },
  { r: 24, g: 80, b: 176, a: 255 },
  { r: 224, g: 64, b: 48, a: 255 },
];
const getStoredPaletteIndex = (layer, pixelIndex) => layer.indices?.[pixelIndex] ?? -1;
const core = context.window.PiXiEEDrawModules.canvasCoreWorkflowUtils.createCanvasCoreWorkflowUtils({
  DEFAULT_LAYER_BLEND_MODE: 'normal',
  getStoredRasterLayerPaletteIndex: getStoredPaletteIndex,
  state: { palette },
});

const staleDirectOnlyLayer = {
  indices: new Int16Array([2]),
  direct: new Uint8ClampedArray([220, 20, 20, 0]),
  directOnly: true,
};
assert.equal(
  core.resolveLayerPixelRgba(staleDirectOnlyLayer, 0, palette),
  null,
  'a transparent direct-only pixel must not fall back to stale indexed color'
);
staleDirectOnlyLayer.direct.set([32, 200, 96, 255]);
assert.deepEqual(
  { ...core.resolveLayerPixelRgba(staleDirectOnlyLayer, 0, palette) },
  { r: 32, g: 200, b: 96, a: 255, mode: 'rgb', index: -1 },
  'a direct-only layer must use its RGBA plane as the source of truth'
);

const mixedLayer = {
  indices: new Int16Array([1]),
  direct: new Uint8ClampedArray([32, 200, 96, 255]),
  directOnly: false,
};
assert.deepEqual(
  { ...core.resolveLayerPixelRgba(mixedLayer, 0, palette) },
  { ...palette[1], mode: 'index', index: 1 },
  'an indexed pixel in a mixed layer must remain authoritative over compatibility RGBA data'
);

const lowerLayer = {
  id: 'lower',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
  indices: new Int16Array([1]),
  direct: null,
  directOnly: false,
};
const upperTransparentLayer = {
  id: 'upper',
  visible: true,
  opacity: 1,
  blendMode: 'normal',
  indices: new Int16Array([2]),
  direct: new Uint8ClampedArray([224, 64, 48, 0]),
  directOnly: true,
};
const frame = { id: 'frame', layers: [lowerLayer, upperTransparentLayer] };
const rendered = [];
const renderContext = {
  clearRect() {},
  createImageData(width, height) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  },
  putImageData(image) {
    rendered.push(image);
  },
};
const noOp = () => {};
const renderer = context.window.PiXiEEDrawModules.canvasRenderWorkflowUtils.createCanvasRenderWorkflowUtils({
  canvasCompositeFrameCache: { byFrame: new Map(), bytes: 0, maxBytes: 0, hits: 0, misses: 0 },
  DEFAULT_LAYER_BLEND_MODE: 'normal',
  clamp: (value, min, max) => Math.min(max, Math.max(min, value)),
  compositeLayerPixelNormalized: core.compositeLayerPixelNormalized,
  resolveLayerPixelRgba: core.resolveLayerPixelRgba,
  ctx: { drawing: renderContext },
  getCanvasRenderContext: () => renderContext,
  presentCanvasRenderOutput: noOp,
  dirtyRegion: { x0: 0, y0: 0, x1: 0, y1: 0 },
  getActiveFrame: () => frame,
  getActiveProjectCanvasDocument: () => ({ id: 'canvas', width: 1, height: 1 }),
  getDisplayedLayerPreviewOpacity: layer => layer.opacity,
  getDisplayedLayerVisibility: layer => layer.visible,
  getStoredRasterLayerPaletteIndex: getStoredPaletteIndex,
  getPlaybackFrameImageData: () => null,
  isTiledLayerIndices: () => false,
  isVoxelExtensionModeEnabled: () => false,
  isVoxelPreviewCanvasId: () => false,
  normalizeLayerBlendMode: value => value || 'normal',
  refreshSecondaryCanvasSurfaces: noOp,
  state: { width: 1, height: 1, palette, playback: { isPlaying: false } },
});
renderer.renderCanvas();
assert.equal(rendered.length, 1);
assert.deepEqual(
  Array.from(rendered[0].data),
  [24, 80, 176, 255],
  'transparent pixels on an upper layer must preserve the lower layer composite'
);

const timelapseUrl = new URL('../pixiedraw/assets/js/modules/timelapse-replay-utils.js', import.meta.url);
vm.runInContext(fs.readFileSync(timelapseUrl, 'utf8'), context, { filename: timelapseUrl.pathname });
let replayImage = null;
const replayContext = {
  createImageData(width, height) {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  },
  putImageData(image) {
    replayImage = image;
  },
};
const replayCanvas = {
  width: 0,
  height: 0,
  getContext() {
    return replayContext;
  },
};
const replay = context.window.PiXiEEDrawModules.timelapseReplayUtils.createTimelapseReplayUtils();
replay.renderSnapshotToCanvas({
  width: 1,
  height: 1,
  activeFrame: 0,
  palette,
  frames: [{ layers: [lowerLayer, upperTransparentLayer] }],
}, replayCanvas);
assert.deepEqual(
  Array.from(replayImage.data),
  [24, 80, 176, 255],
  'timelapse replay must preserve lower content beneath a transparent direct-only layer'
);

const replayIndexedLayer = {
  id: 'replay-indexed',
  visible: true,
  opacity: 1,
  indices: new Int16Array([-1]),
  direct: new Uint8ClampedArray([224, 64, 48, 0]),
  directOnly: true,
};
const replaySnapshot = {
  width: 1,
  height: 1,
  activeFrame: 0,
  palette,
  frames: [{ id: 'replay-frame', layers: [replayIndexedLayer] }],
};
assert.equal(replay.applyForwardDiff(replaySnapshot, {
  __historyEntryType: 'pixel-patch',
  frameId: 'replay-frame',
  layerId: 'replay-indexed',
  changes: [{ index: 0, after: { paletteIndex: 2, direct: [224, 64, 48, 0] } }],
}), true);
assert.equal(replayIndexedLayer.directOnly, false, 'an indexed replay diff must restore indexed authority');
replay.renderSnapshotToCanvas(replaySnapshot, replayCanvas);
assert.deepEqual(
  Array.from(replayImage.data),
  [224, 64, 48, 255],
  'timelapse replay must display an indexed diff applied to a direct-only baseline'
);

const drawingSource = fs.readFileSync(
  new URL('../pixiedraw/assets/js/modules/canvas-drawing-workflow-utils.js', import.meta.url),
  'utf8'
);
assert.match(drawingSource, /resolveLayerPixelRgba\(/, 'the composite sampling path must use the shared resolver');

for (const relativePath of [
  '../pixiedraw/assets/js/modules/canvas-render-workflow-utils.js',
  '../pixiedraw/assets/js/modules/export-rendering.js',
  '../pixiedraw/assets/js/modules/floating-preview-panel-utils.js',
]) {
  const source = fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  assert.match(source, /layer\.directOnly !== true/, `${relativePath} must preserve the inline direct-only fast path`);
}

console.log('PiXiEEDraw transparent layer composite checks passed');
