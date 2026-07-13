import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
function load(relativePath) {
  vm.runInThisContext(fs.readFileSync(path.join(root, relativePath), 'utf8'), { filename: relativePath });
}

globalThis.window = { PiXiEEDrawModules: {} };
load('PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-utils.js');
const schema = window.PiXiEEDrawModules.autosaveSchemaV2Utils.createAutosaveSchemaV2Utils();

const project = {
  type: 'pixieedraw-project',
  packageVersion: 2,
  document: {
    version: 1,
    documentName: 'single-v2.pixieedraw',
    width: 1,
    height: 1,
    palette: [[0, 0, 0, 0], [255, 20, 30, 255]],
    activeCanvasId: 'canvas-1',
    canvases: [{ id: 'canvas-1', width: 1, height: 1, activeFrame: 0, frames: [{ id: 'frame-1', layers: [{ id: 'layer-1', indices: [0], direct: null, importSourceDirect: null }] }] }],
  },
  session: { historyPast: [], historyFuture: [], timelapse: { enabled: false, fps: 12, byCanvas: {}, operationLogsByCanvas: {} } },
  sheets: [{ id: 'must-not-persist' }],
  activeSheetId: 'must-not-persist',
};

const bundle = schema.createSchemaV2Revision({
  projectId: 'single-v2-project',
  name: 'single-v2',
  fileName: 'single-v2.pixieedraw',
  sourceKind: 'file',
  project,
});
assert.equal(bundle.manifest.projectLayout, 'single-project');
assert.equal(Object.hasOwn(bundle.manifest, 'sheets'), false);
assert.equal(Object.hasOwn(bundle.manifest, 'activeSheetId'), false);
assert.equal(bundle.checkpoints.length, 1);
assert.equal(Object.hasOwn(bundle.checkpoints[0], 'sheetId'), false);
assert.equal(Object.hasOwn(bundle.checkpoints[0].project, 'sheets'), false);
assert.equal(Object.hasOwn(bundle.checkpoints[0].project, 'activeSheetId'), false);

const store = schema.createInMemoryAutosaveSchemaV2Store();
assert.equal(schema.commitSchemaV2Revision(store, bundle).committed, true);
const restored = schema.restoreSchemaV2WithFallback(store, bundle.recentEntry);
assert.equal(restored.packaged.projectLayout, 'single-project');
assert.equal(Object.hasOwn(restored.packaged, 'sheets'), false);
assert.equal(restored.packaged.document.documentName, 'single-v2.pixieedraw');

const journalBundle = schema.createSchemaV2JournalRevision(bundle.manifest, [{
  sequence: 1,
  kind: 'pixel-patch',
  canvasId: 'canvas-1',
  frameId: 'frame-1',
  layerId: 'layer-1',
  changes: [{ index: 0, after: { paletteIndex: 1 } }],
}]);
assert.equal(journalBundle.manifest.projectLayout, 'single-project');
assert.equal(schema.commitSchemaV2Revision(store, journalBundle).committed, true);
const journalRestored = schema.restoreSchemaV2WithFallback(store, journalBundle.recentEntry);
assert.equal(journalRestored.packaged.document.canvases[0].frames[0].layers[0].indices[0], 1);

const legacyBundle = schema.createSchemaV2Revision({
  projectId: 'legacy-v2-project',
  activeSheetId: 'legacy-sheet',
  sheets: [{ id: 'legacy-sheet', fileName: 'legacy.pixieedraw', project: { ...project, sheets: undefined, activeSheetId: undefined } }],
});
const legacyStore = schema.createInMemoryAutosaveSchemaV2Store();
assert.equal(schema.commitSchemaV2Revision(legacyStore, legacyBundle).committed, true);
assert.equal(schema.restoreSchemaV2WithFallback(legacyStore, legacyBundle.recentEntry).packaged.sheets.length, 1);

load('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js');
load('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-zip-adapter.js');
const adapter = window.PiXiEEDrawModules.projectStorageV2ZipAdapter.createPixieeDrawV2ZipAdapter({
  buildPackagedProjectPayload(snapshot, { session } = {}) { return { type: 'pixieedraw-project', packageVersion: 2, document: snapshot, session }; },
  encodeTypedArray(view) { return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64'); },
  decodeBase64(value) { return new Uint8Array(Buffer.from(String(value || ''), 'base64')); },
  compressBytes(bytes) { return new Uint8Array(deflateSync(bytes)); },
  decompressBytes(bytes) { return new Uint8Array(inflateSync(bytes)); },
  digestBytes(bytes) { return new Uint8Array(createHash('sha256').update(bytes).digest()); },
});
const archive = await adapter.serializeProject({ packaged: project }, { includeSheets: true });
assert.equal(Object.hasOwn(archive.archiveProject, 'sheets'), false);
assert.equal(Object.hasOwn(archive.archiveProject, 'activeSheetId'), false);
assert.equal(archive.archiveManifest.sheetCount, 0);
const parsed = await adapter.parseBytes(new Uint8Array(await archive.blob.arrayBuffer()));
assert.equal(Object.hasOwn(parsed, 'sheets'), false);
assert.equal(parsed.document.documentName, 'single-v2.pixieedraw');

console.log('PiXiEEDraw DEV R3 single-project V2 checks passed.');
