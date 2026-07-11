import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const V1_ADAPTER_ID = 'pixieedraw-v1-json';
const V2_ADAPTER_ID = 'pixieedraw-v2-zip-experimental';
const originalConsole = globalThis.console;

function loadBrowserModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInThisContext(source, { filename: absolutePath });
}

function normalizeProjectStorageAdapterId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeProjectSaveHandleMeta(value = null, fallback = null) {
  const next = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    fileName: typeof next.fileName === 'string' && next.fileName.trim()
      ? next.fileName.trim()
      : (typeof base.fileName === 'string' && base.fileName.trim() ? base.fileName.trim() : ''),
    adapterId: normalizeProjectStorageAdapterId(
      Object.prototype.hasOwnProperty.call(next, 'adapterId') ? next.adapterId : base.adapterId
    ),
    boundAt: typeof next.boundAt === 'string' && next.boundAt.trim()
      ? next.boundAt.trim()
      : (typeof base.boundAt === 'string' && base.boundAt.trim() ? base.boundAt.trim() : ''),
    sourceProjectToken: typeof next.sourceProjectToken === 'string' && next.sourceProjectToken.trim()
      ? next.sourceProjectToken.trim()
      : (typeof base.sourceProjectToken === 'string' && base.sourceProjectToken.trim() ? base.sourceProjectToken.trim() : null),
    handleKind: typeof next.handleKind === 'string' && next.handleKind.trim()
      ? next.handleKind.trim()
      : (typeof base.handleKind === 'string' && base.handleKind.trim() ? base.handleKind.trim() : 'unknown'),
    permissionState: typeof next.permissionState === 'string' && next.permissionState.trim()
      ? next.permissionState.trim()
      : (typeof base.permissionState === 'string' && base.permissionState.trim() ? base.permissionState.trim() : 'unknown'),
  };
}

function createWritableHandle(name, counterRef) {
  return {
    name,
    async createWritable() {
      counterRef.count += 1;
      return {
        async write() {},
        async close() {},
      };
    },
  };
}

function createOverwriteHarness({
  flagEnabled = false,
  activePersistenceState = null,
  activeProjectSaveBinding = null,
  autosaveHandleSeed = null,
  pendingAutosaveHandleSeed = null,
} = {}) {
  const consoleInfo = [];
  const replaceCalls = [];
  const updateCalls = [];
  const bindCalls = [];
  const triggerCalls = [];
  const boundCounter = { count: 0 };
  const pickerCounter = { count: 0 };
  const autosaveCounter = { count: 0 };
  const pendingCounter = { count: 0 };

  const boundHandle = createWritableHandle('bound-project.pixieedraw', boundCounter);
  const pickerHandle = createWritableHandle('picker-project.pixieedraw', pickerCounter);
  const autosaveHandle = autosaveHandleSeed || createWritableHandle('autosave-seed.pixieedraw', autosaveCounter);
  const pendingAutosaveHandle = pendingAutosaveHandleSeed || createWritableHandle('pending-seed.pixieedraw', pendingCounter);

  let activeBindingState = activeProjectSaveBinding || null;

  globalThis.window = {
    document: {},
    PiXiEEDrawModules: {},
    __pixieedrawUseV2ProjectSave: flagEnabled,
    showSaveFilePicker: async function showSaveFilePicker() {
      return pickerHandle;
    },
  };
  globalThis.document = window.document;
  globalThis.console = {
    info: (...args) => consoleInfo.push(args.join(' ')),
    warn() {},
    error() {},
    log() {},
  };
  globalThis.DISABLE_FILE_SYSTEM_ACCESS_SAVE = false;
  globalThis.PROJECT_FILE_EXTENSION = '.pixieedraw';
  globalThis.PROJECT_FILE_MIME_TYPE = 'application/x-pixieedraw-project';
  globalThis.NATIVE_PROJECTS_SUBDIRECTORY = 'pixieedraw-projects';
  globalThis.autosaveDirty = false;
  globalThis.autosaveProjectId = 'autosave-project';
  globalThis.autosaveHandle = autosaveHandle;
  globalThis.pendingAutosaveHandle = pendingAutosaveHandle;
  globalThis.dom = { controls: {} };
  globalThis.state = {
    documentName: 'phase4i-test.pixieedraw',
    frames: [],
  };

  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/export-rendering.js');

  const exportRenderingModule = window.PiXiEEDrawModules.exportRendering.createExportRenderingModule({
    console,
    state,
    dom,
    PROJECT_FILE_EXTENSION,
    PROJECT_FILE_MIME_TYPE,
    NATIVE_PROJECTS_SUBDIRECTORY,
    DEFAULT_PROJECT_STORAGE_ADAPTER_ID: V1_ADAPTER_ID,
    commitHistory() {},
    makeHistorySnapshot() {
      return {
        version: 1,
        width: 2,
        height: 2,
        frames: [],
      };
    },
    buildProjectSessionPayload() {
      return {
        timelapse: {
          enabled: false,
          fps: 12,
          byCanvas: {},
          operationLogsByCanvas: {},
        },
      };
    },
    getExportFileNameBase() {
      return 'phase4i-test.pixieedraw';
    },
    getActiveProjectPersistenceState() {
      return activePersistenceState;
    },
    getActiveProjectSaveBinding() {
      return activeBindingState;
    },
    bindActiveProjectSaveHandle(handle, meta) {
      const normalizedMeta = normalizeProjectSaveHandleMeta(meta, null);
      activeBindingState = {
        projectSaveHandle: handle,
        projectSaveHandleMeta: normalizedMeta,
        projectSaveHandleState: 'bound',
      };
      bindCalls.push({ handle, meta: normalizedMeta });
      return activeBindingState;
    },
    replaceActiveOpenProjectTabFromCurrentState(options = {}) {
      replaceCalls.push({ ...options });
      return options;
    },
    updateActiveProjectPersistenceState(patch = null) {
      updateCalls.push(patch);
      return patch;
    },
    normalizeProjectSaveHandleMeta,
    async serializeProjectStorageSnapshot(projectState, options) {
      return {
        packaged: {
          type: 'pixieedraw-project',
          packageVersion: 2,
          document: projectState.snapshot,
          session: projectState.session,
        },
        blob: new Blob(['phase4i'], { type: PROJECT_FILE_MIME_TYPE }),
        filename: 'phase4i-test.pixieedraw',
        adapterId: options?.preferredAdapterId || V1_ADAPTER_ID,
        workerUsed: false,
      };
    },
    buildPackagedProjectPayload(snapshot, { session } = {}) {
      return {
        type: 'pixieedraw-project',
        packageVersion: 2,
        document: snapshot,
        session,
      };
    },
    createAutosaveFileName(name = 'phase4i-test.pixieedraw') {
      return name;
    },
    ensureCurrentClientCanExportProject() {
      return true;
    },
    updateAutosaveStatus() {},
    async ensureHandlePermission() {
      return true;
    },
    async recordRecentProjectSnapshot() {},
    resolvePackagedProjectDotStats() {
      return null;
    },
    setTrackedProjectDotBaseline() {},
    markDocumentDurablySaved() {},
    async resolveUniqueExportDirectoryFilename() {
      return null;
    },
    async getFileHandleInExportDirectory() {
      return null;
    },
    async triggerDownloadFromBlob(blob, filename, options = {}) {
      triggerCalls.push({ size: blob?.size || 0, filename, options });
      return 'download';
    },
  });

  return {
    exportRenderingModule,
    boundHandle,
    pickerHandle,
    autosaveHandle,
    pendingAutosaveHandle,
    consoleInfo,
    replaceCalls,
    updateCalls,
    bindCalls,
    triggerCalls,
    boundCounter,
    pickerCounter,
    autosaveCounter,
    pendingCounter,
    get activeBindingState() {
      return activeBindingState;
    },
  };
}

const overwriteHarness = createOverwriteHarness({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    sourceProjectToken: 'token-bound',
    lastSavedStorageAdapterId: V1_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: createWritableHandle('bound-save.pixieedraw', { count: 0 }),
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'bound-save.pixieedraw',
      adapterId: V1_ADAPTER_ID,
      sourceProjectToken: 'token-bound',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'bound',
  },
});
const overwriteBoundCounter = { count: 0 };
overwriteHarness.activeBindingState.projectSaveHandle = createWritableHandle('bound-save.pixieedraw', overwriteBoundCounter);
const overwriteResult = await overwriteHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(overwriteResult.saved, true);
assert.equal(overwriteBoundCounter.count, 1, 'bound project save handle is used for overwrite');
assert.equal(overwriteHarness.pickerCounter.count, 0, 'picker is not used when overwrite binding is valid');
assert.equal(overwriteHarness.autosaveCounter.count, 0, 'autosaveHandle is ignored for overwrite');
assert.equal(overwriteHarness.pendingCounter.count, 0, 'pendingAutosaveHandle is ignored for overwrite');
assert.equal(overwriteHarness.replaceCalls.at(-1)?.projectSaveHandleState, 'bound');
assert.equal(overwriteHarness.replaceCalls.at(-1)?.sourceStorageAdapterId, V1_ADAPTER_ID);
assert.equal(overwriteHarness.replaceCalls.at(-1)?.lastSavedStorageAdapterId, V1_ADAPTER_ID);
assert.equal(overwriteHarness.replaceCalls.at(-1)?.fileName, 'bound-save.pixieedraw');

for (const handleState of ['none', 'unknown', 'unavailable']) {
  const harness = createOverwriteHarness({
    activePersistenceState: {
      sourceKind: 'file',
      sourceStorageAdapterId: V1_ADAPTER_ID,
      sourceProjectToken: `token-${handleState}`,
      lastSavedStorageAdapterId: V1_ADAPTER_ID,
      projectSaveHandleState: handleState,
    },
    activeProjectSaveBinding: {
      projectSaveHandle: createWritableHandle(`ignored-${handleState}.pixieedraw`, { count: 0 }),
      projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
        fileName: `ignored-${handleState}.pixieedraw`,
        adapterId: V1_ADAPTER_ID,
        sourceProjectToken: `token-${handleState}`,
        handleKind: 'file-picker',
        permissionState: 'granted',
      }),
      projectSaveHandleState: handleState,
    },
  });
  const result = await harness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
  assert.equal(result.saved, true);
  assert.equal(harness.pickerCounter.count, 1, `${handleState} falls back to picker save`);
  assert.equal(harness.autosaveCounter.count, 0, `${handleState} does not use autosaveHandle`);
  assert.equal(harness.pendingCounter.count, 0, `${handleState} does not use pendingAutosaveHandle`);
  assert.equal(harness.bindCalls.length, 1, `${handleState} picker save binds external handle`);
}

const conversionHarness = createOverwriteHarness({
  flagEnabled: true,
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    sourceProjectToken: 'token-conversion',
    lastSavedStorageAdapterId: V1_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: createWritableHandle('old-v1-bound.pixieedraw', { count: 0 }),
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'old-v1-bound.pixieedraw',
      adapterId: V1_ADAPTER_ID,
      sourceProjectToken: 'token-conversion',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'bound',
  },
});
const conversionResult = await conversionHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(conversionResult.saved, true);
assert.equal(conversionHarness.pickerCounter.count, 1, 'V1 -> V2 conversion uses new picker save');
assert.equal(conversionHarness.replaceCalls.at(-1)?.sourceStorageAdapterId, V2_ADAPTER_ID);
assert.equal(conversionHarness.replaceCalls.at(-1)?.projectSaveHandleState, 'bound');

const downgradeHarness = createOverwriteHarness({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceProjectToken: 'token-downgrade',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  },
  activeProjectSaveBinding: {
    projectSaveHandle: createWritableHandle('old-v2-bound.pixieedraw', { count: 0 }),
    projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
      fileName: 'old-v2-bound.pixieedraw',
      adapterId: V2_ADAPTER_ID,
      sourceProjectToken: 'token-downgrade',
      handleKind: 'file-picker',
      permissionState: 'granted',
    }),
    projectSaveHandleState: 'bound',
  },
});
const downgradeResult = await downgradeHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(downgradeResult.saved, true);
assert.equal(downgradeHarness.pickerCounter.count, 1, 'V2 -> V1 downgrade uses new picker save');
assert.equal(downgradeHarness.replaceCalls.at(-1)?.sourceStorageAdapterId, V1_ADAPTER_ID);
assert.equal(downgradeHarness.replaceCalls.at(-1)?.projectSaveHandleState, 'bound');

for (const sourceKind of ['recent', 'autosave', 'shared-local', 'import-image', 'unknown', 'mixed']) {
  const harness = createOverwriteHarness({
    activePersistenceState: {
      sourceKind,
      sourceStorageAdapterId: V1_ADAPTER_ID,
      sourceProjectToken: `token-${sourceKind}`,
      lastSavedStorageAdapterId: V1_ADAPTER_ID,
      projectSaveHandleState: 'bound',
    },
    activeProjectSaveBinding: {
      projectSaveHandle: createWritableHandle(`bound-${sourceKind}.pixieedraw`, { count: 0 }),
      projectSaveHandleMeta: normalizeProjectSaveHandleMeta({
        fileName: `bound-${sourceKind}.pixieedraw`,
        adapterId: V1_ADAPTER_ID,
        sourceProjectToken: `token-${sourceKind}`,
        handleKind: 'file-picker',
        permissionState: 'granted',
      }),
      projectSaveHandleState: 'bound',
    },
  });
  const result = await harness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
  assert.equal(result.saved, true);
  assert.equal(harness.pickerCounter.count, 1, `${sourceKind} source does not overwrite bound project handle`);
}

globalThis.console = originalConsole;
originalConsole.log('Phase 4-I overwrite binding checks passed.');
