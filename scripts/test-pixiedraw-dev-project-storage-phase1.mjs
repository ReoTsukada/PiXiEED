import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';

function loadBrowserModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInThisContext(source, { filename: absolutePath });
}

globalThis.window = {
  document: {},
  PiXiEEDrawModules: {},
};

loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-adapter-utils.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v1-json-adapter.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');

const adapterUtils = window.PiXiEEDrawModules.projectStorageAdapterUtils.createProjectStorageAdapterUtils({ console });
const v1Adapter = window.PiXiEEDrawModules.projectStorageV1JsonAdapter.createPixieeDrawV1JsonAdapter({
  PROJECT_FILE_EXTENSION: '.pixieedraw',
  PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
  PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
  buildPackagedProjectPayload(snapshot, { session, updatedAt = '', includeSheets = true } = {}) {
    return {
      type: 'pixieedraw-project',
      packageVersion: 2,
      version: 1,
      document: snapshot,
      session,
      updatedAt: updatedAt || '2026-07-09T00:00:00.000Z',
      includeSheets,
    };
  },
  createAutosaveFileName(name = 'untitled.pixieedraw') {
    return typeof name === 'string' && name.trim() ? name : 'untitled.pixieedraw';
  },
});
const registry = adapterUtils.createProjectStorageAdapterRegistry({
  adapters: [v1Adapter],
  defaultAdapterId: v1Adapter.id,
});

const rawDocument = {
  version: 1,
  width: 4,
  height: 4,
  palette: [],
  frames: [{ id: 'frame-1', layers: [{ id: 'layer-1' }] }],
  activeFrame: 0,
  activeLayer: 'layer-1',
};
const sessionPayload = {
  historyLimit: 24,
  historyPast: [],
  historyFuture: [],
  timelapse: {
    enabled: false,
    fps: 12,
    byCanvas: {},
    operationLogsByCanvas: {},
  },
};
const serialized = registry.serializeProject({
  snapshot: rawDocument,
  session: sessionPayload,
}, {
  fileNameBase: 'phase1-test.pixieedraw',
});

assert.equal(serialized.adapterId, 'pixieedraw-v1-json');
assert.equal(serialized.packaged.document, rawDocument);
assert.equal(serialized.packaged.session, sessionPayload);
assert.equal(serialized.filename, 'phase1-test.pixieedraw');
assert.ok(serialized.blob instanceof Blob);

const parsedText = registry.parseText(serialized.text);
assert.equal(parsedText.adapterId, 'pixieedraw-v1-json');
assert.equal(parsedText.parsed.type, 'pixieedraw-project');

const parsedPayload = registry.parseParsedValue(rawDocument);
assert.equal(parsedPayload.adapterId, 'pixieedraw-v1-json');
assert.equal(parsedPayload.parsed, rawDocument);

const documentSessionUtils = window.PiXiEEDrawModules.documentSessionWorkflowUtils.createDocumentSessionWorkflowUtils({
  DEFAULT_HISTORY_LIMIT: 24,
  MIN_HISTORY_LIMIT: 1,
  history: { limit: 24 },
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },
  deserializeDocumentPayload(payload) {
    return {
      snapshotSource: payload,
      activeCanvasId: payload.activeCanvasId || '',
    };
  },
  resolvePackagedProjectDotStats(parsed) {
    return parsed.dotStats || null;
  },
  normalizePackagedProjectSheets(sheets, activeSheetId) {
    return Array.isArray(sheets) ? sheets : activeSheetId ? [activeSheetId] : [];
  },
  normalizeProjectHistoryLimit(value, fallback) {
    return Number.isFinite(Number(value)) ? Math.max(1, Math.round(Number(value))) : fallback;
  },
  normalizeTimelapseFps(value) {
    return Number.isFinite(Number(value)) ? Math.max(1, Math.round(Number(value))) : 12;
  },
  normalizeTimelapseCanvasId(canvasId, fallback = '') {
    return String(canvasId || fallback || '');
  },
  createEmptyTimelapseTrack() {
    return { snapshots: [], operationLog: null };
  },
  parseProjectStorageText(text) {
    return registry.parseText(text);
  },
  parseProjectStoragePayload(parsed) {
    return registry.parseParsedValue(parsed);
  },
});

const parsedFromText = documentSessionUtils.snapshotFromDocumentText(serialized.text);
assert.equal(parsedFromText.storageAdapterId, 'pixieedraw-v1-json');
assert.deepEqual(parsedFromText.snapshot.snapshotSource, rawDocument);

const parsedFromRawPayload = documentSessionUtils.snapshotFromParsedDocumentValue(rawDocument);
assert.equal(parsedFromRawPayload.storageAdapterId, 'pixieedraw-v1-json');
assert.deepEqual(parsedFromRawPayload.snapshot.snapshotSource, rawDocument);

const exportRenderingModule = window.PiXiEEDrawModules.exportRendering.createExportRenderingModule({
  state: {
    documentName: 'phase1-test.pixieedraw',
    frames: [],
  },
  commitHistory() {},
  makeHistorySnapshot() {
    return rawDocument;
  },
  buildProjectSessionPayload() {
    return sessionPayload;
  },
  serializeProjectStorageSnapshot(projectState, options) {
    return registry.serializeProject(projectState, options);
  },
  buildPackagedProjectPayload(snapshot, { session } = {}) {
    return {
      type: 'pixieedraw-project',
      packageVersion: 2,
      version: 1,
      document: snapshot,
      session,
    };
  },
  createAutosaveFileName(name = 'fallback.pixieedraw') {
    return name;
  },
  PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
});

const bundle = exportRenderingModule.buildProjectExportBundle('phase1-test.pixieedraw');
assert.equal(bundle.storageAdapterId, 'pixieedraw-v1-json');
assert.equal(bundle.filename, 'phase1-test.pixieedraw');
assert.deepEqual(bundle.packaged.document, rawDocument);
assert.ok(bundle.blob instanceof Blob);

console.log('Phase 1 project storage adapter checks passed.');
