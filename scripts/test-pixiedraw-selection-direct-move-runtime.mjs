import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const modulePath = new URL('../pixiedraw/assets/js/modules/canvas-pointer-workflow-utils.js', import.meta.url);
const selectionModulePath = new URL('../pixiedraw/assets/js/modules/selection-move-workflow-utils.js', import.meta.url);
const context = {
  Array,
  ArrayBuffer,
  Int16Array,
  Math,
  Uint8Array,
  Uint8ClampedArray,
  HTMLElement: class HTMLElement {},
  console,
  window: { PiXiEEDrawModules: {} },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(modulePath, 'utf8'), context, {
  filename: 'canvas-pointer-workflow-utils.js',
});
vm.runInContext(fs.readFileSync(selectionModulePath, 'utf8'), context, {
  filename: 'selection-move-workflow-utils.js',
});

const palette = [
  { r: 0, g: 0, b: 0, a: 0 },
  { r: 220, g: 40, b: 30, a: 255 },
];
const state = { width: 2, height: 2, palette };
const pointerState = { lastSelectionMove: null };
let activeLayer = null;
let dirtyRectCount = 0;
let renderCount = 0;
let historyDirtyCount = 0;

const workflow = context.window.PiXiEEDrawModules.canvasPointerWorkflowUtils
  .createCanvasPointerWorkflowUtils({
    state,
    pointerState,
    dom: { controls: { selectionTransformMenu: null } },
    selectionTransformUi: {
      hoverHandleId: '',
      menuVisible: false,
      menuHandleId: '',
      menuLocalX: null,
      menuLocalY: null,
    },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    getActiveLayer: () => activeLayer,
    getSelectionMoveContentMask: moveState => moveState.contentMask,
    getSelectionMoveVisualBounds: moveState => ({
      x0: moveState.bounds.x0 + (Number(moveState.offset?.x) || 0),
      y0: moveState.bounds.y0 + (Number(moveState.offset?.y) || 0),
      x1: moveState.bounds.x1 + (Number(moveState.offset?.x) || 0),
      y1: moveState.bounds.y1 + (Number(moveState.offset?.y) || 0),
    }),
    buildSelectionMoveTransformedEntries: (moveState, options = {}) => {
      const sourceMask = options.sourceMask || moveState.mask;
      const entries = [];
      let x0 = moveState.width;
      let y0 = moveState.height;
      let x1 = -1;
      let y1 = -1;
      for (let sourceIndex = 0; sourceIndex < sourceMask.length; sourceIndex += 1) {
        if (sourceMask[sourceIndex] !== 1) continue;
        const x = sourceIndex % moveState.width;
        const y = Math.floor(sourceIndex / moveState.width);
        entries.push({ x, y, sourceIndex });
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      return {
        entries,
        bounds: entries.length ? { x0, y0, x1, y1 } : null,
        mask: entries.length ? new Uint8Array(sourceMask) : null,
        width: entries.length ? x1 - x0 + 1 : 0,
        height: entries.length ? y1 - y0 + 1 : 0,
      };
    },
    getStoredRasterLayerPaletteIndex: (layer, index) => layer.indices[index] === 0 ? -1 : layer.indices[index],
    getRasterLayerTransparentStorageValue: () => 0,
    recordPendingPixelPatchBefore: () => {},
    recordPendingPixelPatchAfter: () => {},
    ensureLayerDirect: layer => {
      layer.direct = new Uint8ClampedArray(state.width * state.height * 4);
      return layer.direct;
    },
    inferDirectOnlyLayer: (_layer, _indices, direct) => direct instanceof Uint8ClampedArray,
    markHistoryDirty: () => { historyDirtyCount += 1; },
    markDirtyRect: () => { dirtyRectCount += 1; },
    requestRender: () => { renderCount += 1; },
    requestOverlayRender: () => {},
    updateCanvasControlButtons: () => {},
  });

activeLayer = {
  id: 'rect-selection-layer',
  indices: new Uint8Array([
    1, 0,
    0, 0,
  ]),
  indicesEncoding: 'uint8-palette-zero-transparent-v2',
  direct: null,
};
workflow.createSelectionRect({ x: 0, y: 0 }, { x: 1, y: 1 });
assert.deepEqual(
  Array.from(state.selectionMask),
  [1, 1, 1, 1],
  'rect selection must include every transparent and painted cell inside its bounds'
);
assert.equal(
  state.selectionContentMask,
  null,
  'rect selection must defer content sampling so later drawing inside transparent selected cells is included'
);
const rectSelectionMask = new Uint8Array(state.selectionMask);
const rectSelectionBounds = { ...state.selectionBounds };

state.selectionMask = new Uint8Array([
  1, 0,
  0, 1,
]);
state.selectionBounds = { x0: 0, y0: 0, x1: 1, y1: 1 };
assert.equal(
  workflow.isPositionInCurrentSelectionInteractionArea({ x: 1, y: 0 }),
  true,
  'selection interaction keeps transparent cells inside the bounding rectangle active'
);
assert.equal(
  workflow.isPositionInCurrentSelectionInteractionArea({ x: 2, y: 0 }),
  false,
  'selection interaction excludes positions outside the bounding rectangle'
);
assert.equal(
  workflow.isPositionInMoveVisualBounds(
    { x: 2, y: 0 },
    { bounds: { x0: 0, y0: 0, x1: 1, y1: 1 }, offset: { x: 1, y: 0 } }
  ),
  true,
  'floating selection keeps transparent cells inside its moved bounding rectangle active'
);

const selectionWorkflow = context.window.PiXiEEDrawModules.selectionMoveWorkflowUtils
  .createSelectionMoveWorkflowUtils({
    state,
    ctx: { overlay: null },
    isRuntimeUint8LayerIndices: layer => layer?.indicesEncoding === 'uint8-palette-zero-transparent-v2',
    getStoredRasterLayerPaletteIndex: (layer, index) => layer.indices[index] === 0 && layer.indicesEncoding
      ? -1
      : layer.indices[index],
    createBlankImageData: () => null,
    createMovePreviewCanvasFromImageData: () => null,
    createMovePreviewCanvasFromPixels: () => null,
    SELECTION_TRANSFORM_LARGE_PREVIEW_MAX_PIXELS: 4096,
  });

activeLayer.indices[1] = 1;
const freshlyDrawnRectMove = selectionWorkflow.createSelectionMoveState(
  activeLayer,
  rectSelectionBounds,
  rectSelectionMask,
  null
);
assert.deepEqual(
  Array.from(freshlyDrawnRectMove.contentMask),
  [1, 1, 0, 0],
  'copy/move must sample content after pen drawing and still exclude untouched transparent selected cells'
);

const legacyDirectLayer = {
  id: 'legacy-direct-layer',
  indices: new Int16Array([-1, -1, -1, -1]),
  direct: new Uint8ClampedArray([
    31, 61, 91, 255,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]),
};
const legacyDirectMove = selectionWorkflow.createSelectionMoveState(
  legacyDirectLayer,
  { x0: 0, y0: 0, x1: 0, y1: 0 },
  new Uint8Array([1, 0, 0, 0])
);
assert.equal(legacyDirectMove.indices[0], -1, 'Int16 direct-color selection keeps -1 transparency sentinel');
assert.equal(legacyDirectMove.contentMask[0], 1, 'visible direct-color selection remains move content');

const indexedMove = selectionWorkflow.createSelectionMoveState(
  { id: 'indexed-layer', indices: new Int16Array([1, -1, -1, -1]), direct: null },
  { x0: 0, y0: 0, x1: 1, y1: 1 },
  new Uint8Array([1, 0, 0, 0])
);
assert.equal(indexedMove.direct, null, 'indexed selection moves do not allocate an unused RGBA copy');

const protectedDestinationLayer = {
  id: 'protected-destination-layer',
  indices: new Uint8Array([2, 2, 2, 2]),
  indicesEncoding: 'uint8-palette-zero-transparent-v2',
  direct: null,
  directOnly: false,
};
const protectedPasteState = {
  layer: protectedDestinationLayer,
  bounds: { x0: 0, y0: 0, x1: 1, y1: 1 },
  width: 2,
  height: 2,
  mask: new Uint8Array([1, 1, 1, 1]),
  contentMask: new Uint8Array([1, 0, 0, 0]),
  indices: new Uint8Array([1, 0, 0, 0]),
  direct: null,
  offset: { x: 0, y: 0 },
};
const protectedPasteResult = workflow.placeSelectionPixels(protectedPasteState, 0, 0);
assert.equal(protectedPasteResult.placed, true);
assert.deepEqual(
  Array.from(protectedDestinationLayer.indices),
  [1, 2, 2, 2],
  'transparent cells in a rectangular clipboard selection must not erase painted destination pixels'
);

const layer = {
  id: 'direct-layer',
  indices: new Uint8Array([0, 0, 0, 0]),
  indicesEncoding: 'uint8-palette-zero-transparent-v2',
  direct: new Uint8ClampedArray([
    12, 34, 56, 255,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]),
  directOnly: true,
};
const moveState = {
  layer,
  bounds: { x0: 0, y0: 0, x1: 1, y1: 1 },
  width: 2,
  height: 2,
  mask: new Uint8Array([1, 0, 0, 0]),
  contentMask: new Uint8Array([1, 0, 0, 0]),
  restoreIndices: null,
  restoreDirect: null,
  hasCleared: false,
  committed: false,
};

workflow.clearSelectionSourcePixels(moveState);
assert.equal(layer.indices[0], 0, 'runtime transparent storage value remains zero');
assert.deepEqual(Array.from(layer.direct.subarray(0, 4)), [0, 0, 0, 0], 'direct source pixel is cleared');
assert.equal(dirtyRectCount, 1, 'direct-only changes must invalidate the rendered region');
assert.equal(historyDirtyCount, 1, 'direct-only move clear is tracked in history');
assert.equal(renderCount, 1, 'move clear requests a canvas render');

layer.direct.set([12, 34, 56, 255], 0);
const directMoveState = {
  ...moveState,
  indices: new Uint8Array([0, 0, 0, 0]),
  direct: new Uint8ClampedArray([
    12, 34, 56, 255,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
  ]),
  hasCleared: false,
  restoreIndices: null,
  restoreDirect: null,
};
workflow.clearSelectionSourcePixels(directMoveState);
const placedDirectMove = workflow.placeSelectionPixels(directMoveState, 1, 0);
assert.equal(placedDirectMove.placed, true, 'direct-color selection move places content');
assert.deepEqual(
  Array.from(layer.direct.subarray(4, 8)),
  [12, 34, 56, 255],
  'direct-color selection move keeps the destination pixel after source clear'
);

layer.direct.fill(0);
moveState.restoreIndices = new Uint8Array([0, 0, 0, 0]);
moveState.restoreDirect = new Uint8ClampedArray([
  90, 80, 70, 255,
  0, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 0,
]);
moveState.hasCleared = false;
workflow.clearSelectionSourcePixels(moveState);
assert.deepEqual(
  Array.from(layer.direct.subarray(0, 4)),
  [90, 80, 70, 255],
  'runtime transparent index must not overwrite restored direct color'
);

state.width = 256;
state.height = 256;
const largeSelectionMove = selectionWorkflow.createSelectionMoveState(
  { id: 'large-indexed-layer', indices: new Int16Array(256 * 256).fill(1), direct: null },
  { x0: 0, y0: 0, x1: 255, y1: 255 },
  new Uint8Array(256 * 256).fill(1)
);
assert.equal(largeSelectionMove.direct, null, 'large indexed selections still avoid an RGBA copy');
assert.equal(largeSelectionMove.selectedSourceIndices, null, 'large selections do not allocate a huge JS index list at pointer-down');
assert.equal(largeSelectionMove.contentSourceIndices, null, 'large visible selections do not allocate a second JS index list');

console.log('PiXiEEDraw direct-color selection move checks passed');
