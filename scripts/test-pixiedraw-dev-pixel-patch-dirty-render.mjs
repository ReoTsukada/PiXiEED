import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/pixel-patch-history-utils.js');
const selectionMoveModulePath = path.join(root, 'PiXiEEDrawDEV/assets/js/modules/selection-move-workflow-utils.js');

globalThis.window = { PiXiEEDrawModules: {} };
vm.runInThisContext(fs.readFileSync(modulePath, 'utf8'), { filename: modulePath });
vm.runInThisContext(fs.readFileSync(selectionMoveModulePath, 'utf8'), { filename: selectionMoveModulePath });

const width = 4;
const height = 3;
const layer = {
  id: 'layer-1',
  indices: new Int16Array(width * height).fill(-1),
  direct: null,
  importSourceDirect: null,
};
const frame = { id: 'frame-1', layers: [layer] };
const canvas = { id: 'canvas-1', width, height, frames: [frame] };
const multiState = { connected: false };
const historyState = { pending: null };
const calls = {
  dirtyRects: [],
  renders: 0,
  overlays: 0,
  allSurfaces: 0,
};

const utils = window.PiXiEEDrawModules.pixelPatchHistoryUtils.createPixelPatchHistoryUtils({
  state: { width, height },
  history: historyState,
  HISTORY_ENTRY_TYPE_PIXEL_PATCH: 'pixelPatch',
  PIXEL_PATCH_HISTORY_LABELS: new Set(['pen', 'ellipse', 'ellipseFill', 'selectionMove', 'selectionTransform', 'selectionCut']),
  multiState,
  getActiveSharedProjectKey: () => '',
  isSharedProjectCollaborativeMode: () => false,
  isVoxelExtensionModeEnabled: () => false,
  getActiveLayer: () => layer,
  getActiveProjectCanvasDocument: () => canvas,
  getActiveFrame: () => frame,
  isSimulationLayer: () => false,
  getProjectCanvasDocumentById: id => id === canvas.id ? canvas : null,
  ensureLayerDirect: target => target.direct || (target.direct = new Uint8ClampedArray(width * height * 4)),
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  refreshLayerDirectOnlyFlag() {},
  invalidateFillPreviewCache() {},
  invalidateOnionSkinCache() {},
  clearPlaybackFrameCache() {},
  markDirtyRect: (...args) => calls.dirtyRects.push(args),
  requestRender: () => { calls.renders += 1; },
  requestOverlayRender: () => { calls.overlays += 1; },
  renderAllProjectCanvasSurfaces: () => { calls.allSurfaces += 1; },
});

assert.equal(utils.canUsePixelPatchHistory('ellipse'), true);
assert.equal(utils.canUsePixelPatchHistory('ellipseFill'), true);
assert.equal(utils.canUsePixelPatchHistory('selectionMove'), true);
assert.equal(utils.canUsePixelPatchHistory('selectionTransform'), true);
assert.equal(utils.canUsePixelPatchHistory('selectionCut'), true);
assert.equal(utils.canUsePixelPatchHistory('selectionPaste'), false, 'paste keeps full history because it may expand the palette');

const paletteState = {
  palette: [{ r: 255, g: 0, b: 0, a: 255 }],
  activePaletteIndex: 0,
};
const normalizeColorValue = color => ({
  r: Math.max(0, Math.min(255, Math.round(Number(color?.r) || 0))),
  g: Math.max(0, Math.min(255, Math.round(Number(color?.g) || 0))),
  b: Math.max(0, Math.min(255, Math.round(Number(color?.b) || 0))),
  a: Math.max(0, Math.min(255, Math.round(Number(color?.a) || 0))),
});
const selectionUtils = window.PiXiEEDrawModules.selectionMoveWorkflowUtils.createSelectionMoveWorkflowUtils({
  state: paletteState,
  normalizeColorValue,
  normalizePaletteIndex: value => Math.max(0, Math.round(Number(value) || 0)),
  isIndexColorMode: () => false,
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
});
const makePaletteClip = color => ({
  width: 1,
  height: 1,
  mask: new Uint8Array([1]),
  indices: new Int16Array([0]),
  direct: new Uint8ClampedArray(4),
  palette: [color],
});
assert.equal(selectionUtils.getClipboardPaletteExpansionCount(makePaletteClip({ r: 255, g: 0, b: 0, a: 255 })), 0);
assert.equal(selectionUtils.getClipboardPaletteExpansionCount(makePaletteClip({ r: 0, g: 0, b: 255, a: 255 })), 1);
assert.deepEqual(paletteState.palette, [{ r: 255, g: 0, b: 0, a: 255 }], 'palette preflight must not mutate the document palette');

historyState.pending = utils.createPixelPatchHistoryPending('selectionMove');
utils.recordPendingPixelPatchBefore(layer, 5);
layer.indices[5] = 3;
utils.recordPendingPixelPatchAfter(layer, 5);
const selectionMoveEntry = utils.finalizePixelPatchHistoryEntry(historyState.pending);
assert.equal(selectionMoveEntry?.historyLabel, 'selectionMove');
assert.deepEqual(selectionMoveEntry?.changes?.map(change => change.index), [5]);
assert.equal(selectionMoveEntry?.changes?.[0]?.before?.paletteIndex, -1);
assert.equal(selectionMoveEntry?.changes?.[0]?.after?.paletteIndex, 3);
layer.indices[5] = -1;
historyState.pending = null;

const entry = {
  __historyEntryType: 'pixelPatch',
  version: 1,
  historyLabel: 'ellipse',
  canvasId: canvas.id,
  frameId: frame.id,
  layerId: layer.id,
  width,
  height,
  changes: [
    { index: 1, before: { paletteIndex: -1, direct: null, importSourceDirect: null }, after: { paletteIndex: 2, direct: null, importSourceDirect: null } },
    { index: 10, before: { paletteIndex: -1, direct: null, importSourceDirect: null }, after: { paletteIndex: 2, direct: null, importSourceDirect: null } },
  ],
};

assert.equal(utils.applyPixelPatchHistoryEntry(entry, 'redo'), true);
assert.deepEqual(calls.dirtyRects, [[1, 0, 2, 2]], 'pixel patch must mark only the changed rectangle');
assert.equal(calls.renders, 1, 'active canvas must request one render');
assert.equal(calls.overlays, 1, 'overlay must stay synchronized');
assert.equal(calls.allSurfaces, 0, 'solo active-canvas undo/redo must not rebuild all project surfaces');
assert.equal(layer.indices[1], 2);
assert.equal(layer.indices[10], 2);

assert.equal(utils.applyPixelPatchHistoryEntry(entry, 'undo'), true);
assert.deepEqual(calls.dirtyRects[1], [1, 0, 2, 2]);
assert.equal(calls.renders, 2);
assert.equal(calls.allSurfaces, 0);
assert.equal(layer.indices[1], -1);
assert.equal(layer.indices[10], -1);

multiState.connected = true;
assert.equal(utils.canUsePixelPatchHistory('ellipse'), false, 'new collaborative edits must keep using scoped history');
assert.equal(utils.applyPixelPatchHistoryEntry(entry, 'redo'), true, 'an existing patch must remain replayable after collaboration starts');
assert.equal(calls.allSurfaces, 1, 'collaborative replay must preserve the all-surface refresh path');

const appSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/app.js'), 'utf8');
assert.match(appSource, /PIXEL_PATCH_HISTORY_LABELS = new Set\(\[[^\]]*'ellipse'[^\]]*'ellipseFill'/);
assert.match(appSource, /PIXEL_PATCH_HISTORY_LABELS = new Set\(\[[^\]]*'selectionMove'[^\]]*'selectionTransform'[^\]]*'selectionCut'/);
assert.match(appSource, /PIXEL_PATCH_HISTORY_LABELS = new Set\(\[[^\]]*'selectionPastePixels'/);

const pointerSource = fs.readFileSync(path.join(root, 'PiXiEEDrawDEV/assets/js/modules/canvas-pointer-workflow-utils.js'), 'utf8');
assert.match(pointerSource, /function clearSelectionSourcePixels[\s\S]*?recordPendingPixelPatchBefore\(layer, canvasIndex\);[\s\S]*?recordPendingPixelPatchAfter\(layer, canvasIndex\);/);
assert.match(pointerSource, /function placeSelectionPixels[\s\S]*?recordPendingPixelPatchBefore\(layer, targetIndex\);[\s\S]*?recordPendingPixelPatchAfter\(layer, targetIndex\);/);
assert.match(pointerSource, /getClipboardPaletteExpansionCount\(clip\)[\s\S]*?beginHistory\(paletteExpansionCount > 0 \? 'selectionPaste' : 'selectionPastePixels'\)/);

console.log('PiXiEEDrawDEV pixel-patch dirty-render checks passed.');
