import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const V1_ADAPTER_ID = 'pixieedraw-v1-json';
const V2_ADAPTER_ID = 'pixieedraw-v2-zip-experimental';

function loadBrowserModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInThisContext(source, { filename: absolutePath });
}

globalThis.window = {
  document: {},
  PiXiEEDrawModules: {},
};
globalThis.document = window.document;

loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-adapter-utils.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v1-json-adapter.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-archive-codec.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/project-storage-v2-zip-adapter.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/open-project-tab-model.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');
loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');

const adapterUtils = window.PiXiEEDrawModules.projectStorageAdapterUtils.createProjectStorageAdapterUtils({ console });

function encodeTypedArray(view) {
  if (!view) {
    return null;
  }
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('base64');
}

function decodeBase64(value) {
  return new Uint8Array(Buffer.from(String(value || ''), 'base64'));
}

function buildPackagedProjectPayload(snapshot, { session, updatedAt = '', includeSheets = true } = {}) {
  return {
    type: 'pixieedraw-project',
    packageVersion: 2,
    version: 1,
    document: snapshot,
    session,
    updatedAt: updatedAt || '2026-07-10T00:00:00.000Z',
    includeSheets,
  };
}

const v1Adapter = window.PiXiEEDrawModules.projectStorageV1JsonAdapter.createPixieeDrawV1JsonAdapter({
  PROJECT_FILE_EXTENSION: '.pixieedraw',
  PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
  PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
  buildPackagedProjectPayload,
  createAutosaveFileName(name = 'phase4d-test.pixieedraw') {
    return typeof name === 'string' && name.trim() ? name : 'phase4d-test.pixieedraw';
  },
});

const v2Adapter = window.PiXiEEDrawModules.projectStorageV2ZipAdapter.createPixieeDrawV2ZipAdapter({
  PROJECT_FILE_EXTENSION: '.pixieedraw',
  PROJECT_FILE_MIME_TYPE: 'application/x-pixieedraw',
  PROJECT_PACKAGE_TYPE: 'pixieedraw-project',
  buildPackagedProjectPayload,
  createAutosaveFileName(name = 'phase4d-test.pixieedraw') {
    return typeof name === 'string' && name.trim() ? name : 'phase4d-test.pixieedraw';
  },
  decodeBase64,
  encodeTypedArray,
  compressBytes(bytes) {
    return new Uint8Array(deflateSync(bytes));
  },
  decompressBytes(bytes) {
    return new Uint8Array(inflateSync(bytes));
  },
  digestBytes(bytes) {
    return new Uint8Array(createHash('sha256').update(bytes).digest());
  },
});

const registry = adapterUtils.createProjectStorageAdapterRegistry({
  adapters: [v1Adapter, v2Adapter],
  defaultAdapterId: v1Adapter.id,
});

let projectTokenCounter = 0;
let tabIdCounter = 0;
let autosaveProjectCounter = 0;
let currentSnapshot = null;
const openProjectTabs = [];
let activeOpenProjectTabId = '';
let autosaveProjectId = 'autosave-root';
let autosaveRestoring = false;
const recentProjectsCache = new Map();
const history = {
  limit: 24,
  past: [],
  future: [],
  pending: null,
};
const timelapseState = {
  tracksByCanvasId: Object.create(null),
  enabled: false,
  fps: 12,
};
const state = {
  documentName: 'phase4d-test.pixieedraw',
  width: 2,
  height: 2,
  uiTheme: 'light',
};
const autosaveHandle = { kind: 'autosave-bound-handle' };

function normalizeProjectStorageAdapterId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeProjectSourceKind(value, fallback = 'unknown') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const allowed = new Set(['new', 'file', 'recent', 'autosave', 'shared-local', 'import-image', 'mixed', 'unknown']);
  if (allowed.has(normalized)) {
    return normalized;
  }
  return allowed.has(fallback) ? fallback : 'unknown';
}

function normalizeProjectSaveHandleState(value, fallback = 'none') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const allowed = new Set(['none', 'bound', 'unknown']);
  if (allowed.has(normalized)) {
    return normalized;
  }
  return allowed.has(fallback) ? fallback : 'none';
}

function createProjectPersistenceToken(seed = '') {
  projectTokenCounter += 1;
  const prefix = typeof seed === 'string' && seed.trim() ? seed.trim() : 'project';
  return `${prefix}:token-${projectTokenCounter}`;
}

function normalizeProjectPersistenceState(value = null, fallback = null, { createToken = true } = {}) {
  const next = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const sourceKind = normalizeProjectSourceKind(
    Object.prototype.hasOwnProperty.call(next, 'sourceKind') ? next.sourceKind : base.sourceKind,
    'unknown'
  );
  const sourceStorageAdapterId = Object.prototype.hasOwnProperty.call(next, 'sourceStorageAdapterId')
    ? normalizeProjectStorageAdapterId(next.sourceStorageAdapterId)
    : normalizeProjectStorageAdapterId(base.sourceStorageAdapterId);
  const lastSavedStorageAdapterId = Object.prototype.hasOwnProperty.call(next, 'lastSavedStorageAdapterId')
    ? normalizeProjectStorageAdapterId(next.lastSavedStorageAdapterId)
    : normalizeProjectStorageAdapterId(base.lastSavedStorageAdapterId);
  const sourceProjectToken = (() => {
    const candidate = typeof next.sourceProjectToken === 'string' && next.sourceProjectToken.trim()
      ? next.sourceProjectToken.trim()
      : (typeof base.sourceProjectToken === 'string' && base.sourceProjectToken.trim() ? base.sourceProjectToken.trim() : '');
    if (candidate) {
      return candidate;
    }
    return createToken ? createProjectPersistenceToken(sourceKind) : null;
  })();
  return {
    sourceStorageAdapterId,
    sourceKind,
    sourceProjectToken,
    lastSavedStorageAdapterId,
    projectSaveHandleState: normalizeProjectSaveHandleState(
      Object.prototype.hasOwnProperty.call(next, 'projectSaveHandleState')
        ? next.projectSaveHandleState
        : base.projectSaveHandleState,
      'none'
    ),
  };
}

function createAutosaveProjectId() {
  autosaveProjectCounter += 1;
  return `autosave-project-${autosaveProjectCounter}`;
}

function normalizeAutosaveProjectId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function getActiveOpenProjectTab() {
  return openProjectTabs.find(tab => tab?.id === activeOpenProjectTabId) || null;
}

function getProjectPersistenceStateFromTab(tab = null, options = {}) {
  return normalizeProjectPersistenceState(tab, null, {
    createToken: options?.createToken === true,
  });
}

function getActiveProjectPersistenceState(options = {}) {
  return getProjectPersistenceStateFromTab(getActiveOpenProjectTab(), options);
}

function updateActiveProjectPersistenceState(patch = null) {
  const activeTab = getActiveOpenProjectTab();
  if (!activeTab) {
    return null;
  }
  const nextState = normalizeProjectPersistenceState(patch, activeTab, { createToken: true });
  const index = openProjectTabs.findIndex(tab => tab?.id === activeOpenProjectTabId);
  openProjectTabs[index] = {
    ...activeTab,
    ...nextState,
  };
  return nextState;
}

function resolveProjectSourceKind(options = {}) {
  if (typeof options?.sourceKind === 'string' && options.sourceKind.trim()) {
    return normalizeProjectSourceKind(options.sourceKind, 'unknown');
  }
  if (options?.openedFromRecent) {
    return 'recent';
  }
  if (options?.restoredFromAutosave) {
    return 'autosave';
  }
  if (options?.sharedLocalRestore) {
    return 'shared-local';
  }
  if (options?.importImage) {
    return 'import-image';
  }
  if (options?.newProject) {
    return 'new';
  }
  if (options?.handle || options?.fileLoad) {
    return 'file';
  }
  return 'unknown';
}

const openProjectTabModel = window.PiXiEEDrawModules.openProjectTabModel.createOpenProjectTabModel({
  SHARED_PROJECTS_ENABLED: false,
  state,
  makeHistorySnapshot() {
    return currentSnapshot;
  },
  buildProjectSessionPayload() {
    return {
      historyLimit: history.limit,
      historyPast: [],
      historyFuture: [],
      timelapse: {
        enabled: timelapseState.enabled,
        fps: timelapseState.fps,
        byCanvas: {},
        operationLogsByCanvas: {},
      },
    };
  },
  buildPackagedProjectPayload,
  normalizeDocumentName(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : 'phase4d-test.pixieedraw';
  },
  DEFAULT_DOCUMENT_NAME: 'phase4d-test.pixieedraw',
  hasDocumentUnsavedChanges() {
    return false;
  },
  normalizeAutosaveProjectId,
  getAutosaveProjectId() {
    return autosaveProjectId;
  },
  createAutosaveProjectId,
  recentProjectsCache,
  isSharedRecentProjectEntry() {
    return false;
  },
  normalizeSharedRecentProjectEntry(value) {
    return value;
  },
  getActiveSharedProjectKey() {
    return '';
  },
  getActiveSharedProjectId() {
    return '';
  },
  getActiveSharedProjectRevision() {
    return 0;
  },
  getActiveSharedProjectStructureRevision() {
    return 0;
  },
  buildSharedRecentProjectId(value) {
    return String(value || '');
  },
  getSharedProjectKeyFromProjectId() {
    return '';
  },
  SHARED_PROJECT_ID_PREFIX: 'shared-',
  normalizeMultiProjectKey(value) {
    return typeof value === 'string' ? value.trim() : '';
  },
  createOpenProjectTabId() {
    tabIdCounter += 1;
    return `tab-${tabIdCounter}`;
  },
  extractDocumentBaseName(value) {
    return String(value || '').replace(/\.[^.]+$/, '') || 'phase4d-test';
  },
  createLightweightLocalProjectTabState(tab) {
    return tab;
  },
  createLocalProjectEntrySignature() {
    return {};
  },
  normalizeProjectPersistenceState,
  normalizeQrEditPayload(value) {
    return value || null;
  },
  localizeText(ja) {
    return ja;
  },
  MAX_PROJECT_SHEETS: 8,
});

function resetOpenProjectTabsToCurrentProject(options = {}) {
  const tab = openProjectTabModel.createOpenProjectTabFromCurrentState({
    source: options.source || 'working',
    projectId: options.projectId || autosaveProjectId,
    label: options.label || 'シート 1',
    qrEditPayload: options.qrEditPayload || null,
    sourceStorageAdapterId: options.sourceStorageAdapterId,
    sourceKind: options.sourceKind,
    sourceProjectToken: options.sourceProjectToken,
    lastSavedStorageAdapterId: options.lastSavedStorageAdapterId,
    projectSaveHandleState: options.projectSaveHandleState,
  });
  openProjectTabs.splice(0, openProjectTabs.length, tab);
  activeOpenProjectTabId = tab.id;
  return tab;
}

const documentSessionUtils = window.PiXiEEDrawModules.documentSessionWorkflowUtils.createDocumentSessionWorkflowUtils({
  DEFAULT_HISTORY_LIMIT: 24,
  MIN_HISTORY_LIMIT: 1,
  MAX_PROJECT_SHEETS: 8,
  SHARED_PROJECTS_ENABLED: false,
  SHARED_PROJECT_ID_PREFIX: 'shared-',
  history,
  state,
  timelapseState,
  openProjectTabs,
  getActiveOpenProjectTab,
  getOpenProjectTabSharedKey() {
    return '';
  },
  recentProjectsCache,
  activeOpenProjectTabId,
  get activeOpenProjectTabId() {
    return activeOpenProjectTabId;
  },
  set activeOpenProjectTabId(value) {
    activeOpenProjectTabId = value;
  },
  autosaveProjectId,
  get autosaveProjectId() {
    return autosaveProjectId;
  },
  set autosaveProjectId(value) {
    autosaveProjectId = value;
  },
  get autosaveRestoring() {
    return autosaveRestoring;
  },
  set autosaveRestoring(value) {
    autosaveRestoring = Boolean(value);
  },
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },
  clearActiveSharedProjectSession() {},
  clearTimelapseRecording() {},
  cloneTimelapsePixelPatchValue(value) {
    return value ? { ...value } : null;
  },
  compressHistorySnapshot(snapshot) {
    return snapshot;
  },
  compressUint8Array(value) {
    return value;
  },
  createAutosaveProjectId,
  createEmptyTimelapseTrack() {
    return { snapshots: [], operationLog: null };
  },
  createOpenProjectSheetTabFromPackagedProject: openProjectTabModel.createOpenProjectSheetTabFromPackagedProject,
  createProjectPersistenceToken,
  decodeBase64,
  decompressHistorySnapshot(entry) {
    return entry;
  },
  deserializeDocumentPayload(payload) {
    return JSON.parse(JSON.stringify(payload));
  },
  encodeTypedArray,
  ensureCurrentClientCanReplaceActiveProject() {
    return true;
  },
  ensureTimelapseStartCapture() {},
  flushPendingTimelapseCapture() {},
  getActiveQrEditPayload() {
    return null;
  },
  getAllTimelapseStepCount() {
    return 0;
  },
  getAllTimelapseTracks() {
    return timelapseState.tracksByCanvasId;
  },
  getSharedProjectKeyFromProjectId() {
    return '';
  },
  initializeSharedProjectCanvasIdentityFromCurrentDocument() {},
  isImportableImageFile(file) {
    const name = typeof file?.name === 'string' ? file.name.toLowerCase() : '';
    return name.endsWith('.png');
  },
  isSharedRecentProjectEntry() {
    return false;
  },
  loadDocumentFromImageFile() {
    return false;
  },
  localizeText(ja) {
    return ja;
  },
  markAutosaveDirty() {},
  normalizeAutosaveProjectId,
  normalizeMultiProjectKey(value) {
    return typeof value === 'string' ? value.trim() : '';
  },
  normalizePackagedProjectSheets: openProjectTabModel.normalizePackagedProjectSheets,
  normalizeProjectPersistenceState,
  normalizeProjectSaveHandleState,
  normalizeProjectSourceKind,
  normalizeProjectStorageAdapterId,
  parseProjectStorageBlob(blob) {
    return registry.parseBlob(blob);
  },
  parseProjectStoragePayload(parsed) {
    return registry.parseParsedValue(parsed);
  },
  parseProjectStorageText(text) {
    return registry.parseText(text);
  },
  normalizeTimelapseCanvasId(canvasId, fallback = '') {
    return String(canvasId || fallback || '');
  },
  normalizeTimelapseFps(value) {
    return Number.isFinite(Number(value)) ? Math.max(1, Math.round(Number(value))) : 12;
  },
  preserveCanvasSelectionClipboard() {
    return null;
  },
  reconcileTimelapseTracksForSingleCanvas() {},
  renderOpenProjectTabs() {},
  resetDocumentUnsavedChanges() {},
  resetExportScaleDefaults() {},
  resetOpenedDocumentViewport() {},
  resetOpenProjectTabsToCurrentProject,
  resolvePackagedProjectDotStats(parsed) {
    return parsed?.dotStats || null;
  },
  resolveProjectSourceKind,
  resolveTimelapseFrameEntry(value) {
    return value;
  },
  restoreCanvasSelectionClipboard() {},
  scheduleAutosaveSnapshot() {},
  scheduleSessionPersist() {},
  serializeDocumentSnapshot(snapshot) {
    return snapshot;
  },
  setActiveAutosaveProjectId(value) {
    autosaveProjectId = normalizeAutosaveProjectId(value) || createAutosaveProjectId();
  },
  setActiveSharedProjectSession() {},
  setMultiStatus() {},
  setTrackedProjectDotBaseline() {},
  suppressOpenProjectTabAutoInitialize: false,
  syncPixfindSnapshotAfterDocumentReset() {},
  synchronizeImportedSnapshotPalette() {},
  syncTimelapseControls() {},
  trimHistoryStacksToLimit() {},
  updateActiveProjectPersistenceState,
  updateAutosaveStatus() {},
  updateHistoryButtons() {},
  updateMemoryStatus() {},
  activateQrEditMode() {},
  applyHistorySnapshot(snapshot) {
    currentSnapshot = snapshot;
  },
});

const autosaveWorkflowUtils = window.PiXiEEDrawModules.autosaveWorkflowUtils.createAutosaveWorkflowUtils({
  history,
  timelapseState,
  dom: { controls: {} },
  ensureCurrentClientCanReplaceActiveProject() {
    return true;
  },
  snapshotFromDocumentText: documentSessionUtils.snapshotFromDocumentText,
  isTinyStartupSnapshot() {
    return false;
  },
  synchronizeImportedSnapshotPalette() {},
  applyHistorySnapshot(snapshot) {
    currentSnapshot = snapshot;
  },
  normalizeSerializedTimelapseOperationEntry(entry) {
    return entry;
  },
  trimHistoryStacksToLimit() {},
  clearTimelapseRecording() {},
  reconcileTimelapseTracksForSingleCanvas() {},
  ensureTimelapseStartCapture() {},
  syncTimelapseControls() {},
  updateHistoryButtons() {},
  resetDocumentUnsavedChanges() {},
  syncPixfindSnapshotAfterDocumentReset() {},
  updateMemoryStatus() {},
  setTrackedProjectDotBaseline() {},
  resetOpenedDocumentViewport() {},
  createProjectPersistenceToken,
  updateActiveProjectPersistenceState,
  updateAutosaveStatus() {},
  get autosaveRestoring() {
    return autosaveRestoring;
  },
  set autosaveRestoring(value) {
    autosaveRestoring = Boolean(value);
  },
});

function buildSampleSnapshot(documentName = 'phase4d-test.pixieedraw') {
  return {
    version: 1,
    documentName,
    width: 2,
    height: 2,
    palette: [
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 255, g: 0, b: 0, a: 255 },
    ],
    canvases: [{
      id: 'canvas-1',
      name: 'Canvas 1',
      width: 2,
      height: 2,
      activeFrame: 0,
      activeLayer: 'layer-1',
      mirror: { enabled: false },
      selectionMask: null,
      selectionContentMask: null,
      selectionBounds: null,
      frames: [{
        id: 'frame-1',
        name: 'Frame 1',
        duration: 100,
        layers: [{
          id: 'layer-1',
          name: 'Layer 1',
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          indices: encodeTypedArray(new Int16Array([1, 1, 1, 1])),
          direct: null,
          importSourceDirect: null,
          directOnly: false,
        }],
      }],
    }],
    activeCanvasId: 'canvas-1',
  };
}

function buildSampleSession() {
  return {
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
}

const sampleSnapshot = buildSampleSnapshot();
const sampleSession = buildSampleSession();
currentSnapshot = sampleSnapshot;

const serializedV1 = await registry.serializeProject({
  snapshot: sampleSnapshot,
  session: sampleSession,
}, {
  fileNameBase: 'phase4d-v1.pixieedraw',
});

const serializedV2 = await registry.serializeProject({
  snapshot: sampleSnapshot,
  session: sampleSession,
}, {
  fileNameBase: 'phase4d-v2.pixieedraw',
  preferredAdapterId: V2_ADAPTER_ID,
});

assert.equal(
  (await documentSessionUtils.loadDocumentFromText(serializedV1.text, null, {
    suppressAutosaveStatus: true,
    sourceKind: 'file',
    fileLoad: true,
    projectSaveHandleState: 'none',
  })),
  true
);
assert.equal(openProjectTabs.length, 1);
assert.equal(openProjectTabs[0].sourceKind, 'file');
assert.equal(openProjectTabs[0].sourceStorageAdapterId, V1_ADAPTER_ID);
assert.equal(openProjectTabs[0].lastSavedStorageAdapterId, V1_ADAPTER_ID);
assert.equal(openProjectTabs[0].projectSaveHandleState, 'none');

assert.equal(
  (await documentSessionUtils.loadDocumentFromBlob(serializedV2.blob, null, {
    suppressAutosaveStatus: true,
    sourceKind: 'file',
    fileLoad: true,
    projectSaveHandleState: 'none',
  })),
  true
);
assert.equal(openProjectTabs.length, 1);
assert.equal(openProjectTabs[0].sourceKind, 'file');
assert.equal(openProjectTabs[0].sourceStorageAdapterId, V2_ADAPTER_ID);
assert.equal(openProjectTabs[0].lastSavedStorageAdapterId, V2_ADAPTER_ID);

const newTab = resetOpenProjectTabsToCurrentProject({
  source: 'new-project',
  projectId: 'new-project-1',
  sourceStorageAdapterId: null,
  sourceKind: 'new',
  lastSavedStorageAdapterId: null,
  projectSaveHandleState: 'none',
});
assert.equal(newTab.sourceKind, 'new');
assert.equal(newTab.sourceStorageAdapterId, null);

assert.equal(
  (await documentSessionUtils.loadDocumentFromText(JSON.stringify(serializedV1.packaged), null, {
    projectId: 'recent-project-1',
    suppressAutosaveStatus: true,
    openedFromRecent: true,
    allowProjectMismatchLoad: true,
    sourceKind: 'recent',
    sourceStorageAdapterId: null,
    lastSavedStorageAdapterId: null,
    projectSaveHandleState: 'none',
  })),
  true
);
assert.equal(openProjectTabs[0].sourceKind, 'recent');
assert.equal(openProjectTabs[0].sourceStorageAdapterId, null);
assert.equal(openProjectTabs[0].lastSavedStorageAdapterId, null);

assert.equal(
  (await documentSessionUtils.loadDocumentFromText(JSON.stringify(serializedV1.packaged), null, {
    projectId: 'shared-local-project-1',
    suppressAutosaveStatus: true,
    allowProjectMismatchLoad: true,
    sourceKind: 'shared-local',
    sourceStorageAdapterId: null,
    lastSavedStorageAdapterId: null,
    projectSaveHandleState: 'none',
    sharedLocalRestore: true,
  })),
  true
);
assert.equal(openProjectTabs[0].sourceKind, 'shared-local');

resetOpenProjectTabsToCurrentProject({
  source: 'import',
  projectId: 'image-import-project-1',
  sourceStorageAdapterId: null,
  sourceKind: 'import-image',
  lastSavedStorageAdapterId: null,
  projectSaveHandleState: 'none',
});
assert.equal(openProjectTabs[0].sourceKind, 'import-image');

resetOpenProjectTabsToCurrentProject({
  source: 'working',
  projectId: 'autosave-project-restore',
  sourceStorageAdapterId: null,
  sourceKind: 'unknown',
  lastSavedStorageAdapterId: null,
  projectSaveHandleState: 'none',
});
const autosavePayload = JSON.stringify(serializedV1.packaged);
await autosaveWorkflowUtils.restoreAutosaveDocument({
  async getFile() {
    return new Blob([autosavePayload], { type: 'application/json' });
  },
});
assert.equal(openProjectTabs[0].sourceKind, 'autosave');
assert.equal(openProjectTabs[0].sourceStorageAdapterId, null);
assert.equal(openProjectTabs[0].projectSaveHandleState, 'none');
assert.equal(autosaveHandle.kind, 'autosave-bound-handle');

const tabA = openProjectTabModel.createOpenProjectSheetTabFromPackagedProject({
  project: serializedV1.packaged,
  projectId: 'tab-project-a',
  fileName: 'tab-a.pixieedraw',
  source: 'sheet',
  sourceStorageAdapterId: V1_ADAPTER_ID,
  sourceKind: 'file',
  lastSavedStorageAdapterId: V1_ADAPTER_ID,
  projectSaveHandleState: 'unknown',
});
const tabB = openProjectTabModel.createOpenProjectSheetTabFromPackagedProject({
  project: serializedV2.packaged,
  projectId: 'tab-project-b',
  fileName: 'tab-b.pixieedraw',
  source: 'sheet',
  sourceStorageAdapterId: null,
  sourceKind: 'recent',
  lastSavedStorageAdapterId: null,
  projectSaveHandleState: 'none',
});
assert.ok(tabA?.sourceProjectToken);
assert.ok(tabB?.sourceProjectToken);
assert.notEqual(tabA.sourceProjectToken, tabB.sourceProjectToken);
openProjectTabs.splice(0, openProjectTabs.length, tabA, tabB);
activeOpenProjectTabId = tabA.id;
assert.equal(getActiveProjectPersistenceState().sourceKind, 'file');
assert.equal(getActiveProjectPersistenceState().sourceStorageAdapterId, V1_ADAPTER_ID);
activeOpenProjectTabId = tabB.id;
assert.equal(getActiveProjectPersistenceState().sourceKind, 'recent');
assert.equal(getActiveProjectPersistenceState().sourceStorageAdapterId, null);
assert.equal(openProjectTabs[0].sourceKind, 'file');
assert.equal(openProjectTabs[1].sourceKind, 'recent');

const openImportSource = fs.readFileSync(
  path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js'),
  'utf8'
);
const sharedLocalSource = fs.readFileSync(
  path.join(repoRoot, 'PiXiEEDrawDEV/assets/js/modules/shared-project-local-conversion-utils.js'),
  'utf8'
);
assert.match(openImportSource, /sourceKind:\s*'import-image'/);
assert.match(openImportSource, /sourceKind:\s*'new'/);
assert.match(sharedLocalSource, /sourceKind:\s*'shared-local'/);

console.log('Phase 4-D project persistence state checks passed.');
