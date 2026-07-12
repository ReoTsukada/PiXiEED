import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const load = relativePath => vm.runInThisContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), { filename: relativePath });
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

globalThis.window = { PiXiEEDrawModules: {} };
globalThis.document = {};
load('PiXiEEDrawDEV/assets/js/modules/pixel-patch-history-utils.js');
load('PiXiEEDrawDEV/assets/js/modules/canvas-drawing-workflow-utils.js');
load('PiXiEEDrawDEV/assets/js/modules/local-project-journal-utils.js');

const canvas = { id: 'canvas-1', width: 1, height: 1, frames: [] };
const frame = { id: 'frame-1', layers: [] };
const layer = { id: 'layer-1', indices: new Int16Array([-1]), direct: new Uint8ClampedArray([1, 2, 3, 255]), importSourceDirect: null, directOnly: true };
frame.layers.push(layer);
canvas.frames.push(frame);
const patchUtils = window.PiXiEEDrawModules.pixelPatchHistoryUtils.createPixelPatchHistoryUtils({
  state: { width: 1, height: 1 },
  history: { pending: null },
  HISTORY_ENTRY_TYPE_PIXEL_PATCH: 'pixelPatch',
  PIXEL_PATCH_HISTORY_LABELS: new Set(['pen']),
  multiState: { connected: false },
  getActiveSharedProjectKey: () => '',
  isSharedProjectCollaborativeMode: () => false,
  isVoxelExtensionModeEnabled: () => false,
  getActiveLayer: () => layer,
  getActiveProjectCanvasDocument: () => canvas,
  getActiveFrame: () => frame,
  isSimulationLayer: () => false,
  getProjectCanvasDocumentById: id => id === canvas.id ? canvas : null,
  ensureLayerDirect: target => target.direct || (target.direct = new Uint8ClampedArray(4)),
  clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  refreshLayerDirectOnlyFlag() {},
  invalidateFillPreviewCache() {},
  invalidateOnionSkinCache() {},
  clearPlaybackFrameCache() {},
  requestRender() {},
  requestOverlayRender() {},
  renderAllProjectCanvasSurfaces() {},
});

const legacyPatch = {
  __historyEntryType: 'pixelPatch', version: 1, canvasId: canvas.id, frameId: frame.id, layerId: layer.id, width: 1, height: 1,
  changes: [{ index: 0, before: { paletteIndex: -1, direct: [1, 2, 3, 255], importSourceDirect: [1, 2, 3, 255] }, after: { paletteIndex: -1, direct: [9, 8, 7, 255], importSourceDirect: [9, 8, 7, 255] } }],
};
assert.equal(patchUtils.applyPixelPatchHistoryEntry(legacyPatch, 'redo'), true);
assert.deepEqual(Array.from(layer.direct), [9, 8, 7, 255]);
assert.equal(layer.importSourceDirect, null, 'legacy patch must not materialize a missing buffer');
assert.equal(patchUtils.applyPixelPatchHistoryEntry(legacyPatch, 'undo'), true);
assert.equal(layer.importSourceDirect, null, 'undo must preserve the missing buffer');

layer.importSourceDirect = new Uint8ClampedArray([1, 2, 3, 255]);
assert.equal(patchUtils.applyPixelPatchHistoryEntry(legacyPatch, 'redo'), true);
assert.deepEqual(Array.from(layer.direct), [9, 8, 7, 255]);
assert.deepEqual(Array.from(layer.importSourceDirect), [9, 8, 7, 255], 'existing legacy buffers remain replayable');

const drawingLayer = { indices: new Int16Array([-1]), direct: null, importSourceDirect: null, directOnly: false };
const drawingUtils = window.PiXiEEDrawModules.canvasDrawingWorkflowUtils.createCanvasDrawingWorkflowUtils({
  state: { width: 1, height: 1, selectionMask: null },
  pointerState: { tool: 'pen' },
  getActiveProjectCanvasDocument: () => canvas,
  isSimulationLayer: () => false,
  normalizeColorValue: value => value,
  resolveTransparentStoragePaletteIndex: () => 0,
  ensureLayerDirect: target => target.direct || (target.direct = new Uint8ClampedArray(4)),
  recordPendingPixelPatchBefore() {}, recordPendingPixelPatchAfter() {}, markHistoryDirty() {}, markDirtyPixel() {},
});
assert.equal(drawingUtils.setLayerPixelDirectColorSingle(drawingLayer, 0, 0, { r: 5, g: 6, b: 7, a: 255 }), true);
assert.deepEqual(Array.from(drawingLayer.direct), [5, 6, 7, 255]);
assert.equal(drawingLayer.importSourceDirect, null, 'RGB draw must not create importSourceDirect');
assert.equal(drawingUtils.setLayerPixelDirectColorSingle(drawingLayer, 0, 0, { r: 0, g: 0, b: 0, a: 0 }), true);
assert.equal(drawingLayer.importSourceDirect, null, 'RGB erase must not create importSourceDirect');

const journalLayer = { id: 'layer-journal', indices: new Int16Array([-1]), direct: new Uint8ClampedArray([3, 3, 3, 255]), importSourceDirect: null };
const journalSnapshot = { canvases: [{ id: 'canvas-journal', width: 1, height: 1, frames: [{ id: 'frame-journal', layers: [journalLayer] }] }] };
const journalUtils = window.PiXiEEDrawModules.localProjectJournalUtils.createLocalProjectJournalUtils({
  LOCAL_PROJECT_CHECKPOINT_HISTORY_INTERVAL: 10,
  PROJECT_PACKAGE_TYPE: 'pixieedraw-project', PROJECT_PACKAGE_VERSION: 2, DOCUMENT_FILE_VERSION: 1, DEFAULT_DOCUMENT_NAME: 'project.pixieedraw',
  history: { limit: 30 }, state: {}, recentProjectsCache: new Map(), normalizeAutosaveProjectId: value => String(value || ''), normalizeDocumentName: value => value,
  extractDocumentBaseName: value => value, createAutosaveProjectId: () => 'journal-project', snapshotFromParsedDocumentValue: () => ({ snapshot: journalSnapshot }),
  serializeDocumentSnapshot: value => value, buildProjectSessionPayload: () => ({}), isPixelPatchHistoryEntry: entry => entry?.__historyEntryType === 'pixelPatch',
  getProjectCanvasDocuments: () => [], getActiveProjectCanvasDocument: () => null, getActiveOpenProjectTabId: () => '', findOpenProjectTabIndex: () => -1,
  openProjectTabs: [], getRecentProjectEntryFileName: () => '', localizeText: value => value,
});
const journalResult = journalUtils.reconstructPackagedProjectFromEntry({
  id: 'journal-project', project: { type: 'pixieedraw-project', document: {} },
  projectJournal: { ops: [{ kind: 'pixel-patch', historyEntry: { __historyEntryType: 'pixelPatch', canvasId: 'canvas-journal', frameId: 'frame-journal', layerId: 'layer-journal', width: 1, height: 1, changes: [{ index: 0, after: { paletteIndex: -1, direct: [4, 5, 6, 255], importSourceDirect: [4, 5, 6, 255] } }] } }] },
});
assert.deepEqual(Array.from(journalResult.document.canvases[0].frames[0].layers[0].direct), [4, 5, 6, 255]);
assert.equal(journalResult.document.canvases[0].frames[0].layers[0].importSourceDirect, null, 'journal replay must not materialize a missing buffer');

const palette = read('PiXiEEDrawDEV/assets/js/modules/palette-panel-utils.js');
const drawing = read('PiXiEEDrawDEV/assets/js/modules/canvas-drawing-workflow-utils.js');
const patch = read('PiXiEEDrawDEV/assets/js/modules/pixel-patch-history-utils.js');
const journal = read('PiXiEEDrawDEV/assets/js/modules/local-project-journal-utils.js');
const history = read('PiXiEEDrawDEV/assets/js/modules/history-snapshot-workflow-utils.js');
assert.match(palette, /const direct = layer\.direct instanceof Uint8ClampedArray/);
assert.doesNotMatch(drawing, /layer\.importSourceDirect = new Uint8ClampedArray\(direct\)/);
assert.doesNotMatch(patch, /layer\.importSourceDirect = new Uint8ClampedArray\(length\)/);
assert.doesNotMatch(journal, /ensureTypedDirectBuffer\(layer, 'importSourceDirect'/);
assert.match(history, /importSourceDirect: layer\.importSourceDirect \? compressUint8Array/);

console.log('G-MEM-2A direct-authority checks passed.');
