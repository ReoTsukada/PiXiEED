import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const timelapseModulePath = new URL('../pixiedraw/assets/js/modules/timelapse-session-utils.js', import.meta.url);
const resizeModulePath = new URL('../pixiedraw/assets/js/modules/canvas-resize-workflow-utils.js', import.meta.url);
const context = {
  Array,
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

console.log('PiXiEEDraw resize timelapse checks passed');
