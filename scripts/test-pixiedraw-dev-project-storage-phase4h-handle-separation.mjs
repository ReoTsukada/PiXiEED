import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const V1_ADAPTER_ID = 'pixieedraw-v1-json';
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
  const fileName = typeof next.fileName === 'string' && next.fileName.trim()
    ? next.fileName.trim()
    : (typeof base.fileName === 'string' && base.fileName.trim() ? base.fileName.trim() : '');
  const adapterId = normalizeProjectStorageAdapterId(
    Object.prototype.hasOwnProperty.call(next, 'adapterId') ? next.adapterId : base.adapterId
  );
  const boundAt = typeof next.boundAt === 'string' && next.boundAt.trim()
    ? next.boundAt.trim()
    : (typeof base.boundAt === 'string' && base.boundAt.trim() ? base.boundAt.trim() : '');
  const sourceProjectToken = typeof next.sourceProjectToken === 'string' && next.sourceProjectToken.trim()
    ? next.sourceProjectToken.trim()
    : (typeof base.sourceProjectToken === 'string' && base.sourceProjectToken.trim() ? base.sourceProjectToken.trim() : '');
  const handleKind = typeof next.handleKind === 'string' && next.handleKind.trim()
    ? next.handleKind.trim()
    : (typeof base.handleKind === 'string' && base.handleKind.trim() ? base.handleKind.trim() : 'unknown');
  const permissionState = typeof next.permissionState === 'string' && next.permissionState.trim()
    ? next.permissionState.trim()
    : (typeof base.permissionState === 'string' && base.permissionState.trim() ? base.permissionState.trim() : 'unknown');
  if (!fileName && !adapterId && !boundAt && !sourceProjectToken && handleKind === 'unknown' && permissionState === 'unknown') {
    return null;
  }
  return {
    fileName,
    adapterId,
    boundAt,
    sourceProjectToken: sourceProjectToken || null,
    handleKind,
    permissionState,
  };
}

function createManualProjectSaveHarness({
  disableFileSystemAccess = false,
  pickerHandle = null,
  directoryHandle = null,
  autosaveHandleSeed = null,
  pendingAutosaveHandleSeed = null,
  activePersistenceState = {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    sourceProjectToken: 'phase4h-token',
    projectSaveHandleState: 'none',
  },
} = {}) {
  const bindCalls = [];
  const storeAutosaveHandleCalls = [];
  globalThis.window = {
    document: {},
    PiXiEEDrawModules: {},
    __pixieedrawUseV2ProjectSave: false,
  };
  globalThis.document = window.document;
  globalThis.console = {
    info() {},
    warn() {},
    error() {},
    log() {},
  };
  globalThis.DISABLE_FILE_SYSTEM_ACCESS_SAVE = disableFileSystemAccess;
  globalThis.PROJECT_FILE_EXTENSION = '.pixieedraw';
  globalThis.PROJECT_FILE_MIME_TYPE = 'application/x-pixieedraw-project';
  globalThis.NATIVE_PROJECTS_SUBDIRECTORY = 'pixieedraw-projects';
  globalThis.autosaveDirty = true;
  globalThis.autosaveProjectId = 'autosave-project';
  globalThis.autosaveHandle = autosaveHandleSeed;
  globalThis.pendingAutosaveHandle = pendingAutosaveHandleSeed;
  globalThis.dom = { controls: {} };
  globalThis.state = {
    documentName: 'phase4h-manual.pixieedraw',
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
      return 'phase4h-manual.pixieedraw';
    },
    getActiveProjectPersistenceState() {
      return activePersistenceState;
    },
    normalizeProjectSaveHandleMeta,
    bindActiveProjectSaveHandle(handle, meta) {
      bindCalls.push({ handle, meta });
    },
    async serializeProjectStorageSnapshot(projectState, options) {
      return {
        packaged: {
          type: 'pixieedraw-project',
          packageVersion: 2,
          document: projectState.snapshot,
          session: projectState.session,
        },
        blob: new Blob(['phase4h-manual'], { type: PROJECT_FILE_MIME_TYPE }),
        filename: 'phase4h-manual.pixieedraw',
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
    createAutosaveFileName(name = 'phase4h-manual.pixieedraw') {
      return name;
    },
    ensureCurrentClientCanExportProject() {
      return true;
    },
    updateAutosaveStatus() {},
    async ensureHandlePermission() {
      return true;
    },
    async storeAutosaveHandle(handle) {
      storeAutosaveHandleCalls.push(handle);
    },
    async recordRecentProjectSnapshot() {},
    clearPendingPermissionListener() {},
    schedulePendingAutosavePermission() {},
    createAutosaveProjectId() {
      return 'generated-autosave-project';
    },
    resolvePackagedProjectDotStats() {
      return null;
    },
    setTrackedProjectDotBaseline() {},
    markDocumentDurablySaved() {},
    async resolveUniqueExportDirectoryFilename(filename) {
      return directoryHandle ? filename : null;
    },
    async getFileHandleInExportDirectory() {
      return directoryHandle;
    },
    async triggerDownloadFromBlob() {
      return 'download';
    },
  });

  if (pickerHandle) {
    window.showSaveFilePicker = async function showSaveFilePicker() {
      return pickerHandle;
    };
  } else {
    window.showSaveFilePicker = undefined;
  }

  return {
    exportRenderingModule,
    bindCalls,
    storeAutosaveHandleCalls,
    get autosaveHandle() {
      return globalThis.autosaveHandle;
    },
    get pendingAutosaveHandle() {
      return globalThis.pendingAutosaveHandle;
    },
  };
}

function createAutosaveBindingHarness({
  pickerHandle,
} = {}) {
  const bindCalls = [];
  const storeAutosaveHandleCalls = [];
  const pendingPermissionCalls = [];

  globalThis.window = {
    document: {},
    PiXiEEDrawModules: {},
    showSaveFilePicker: async function showSaveFilePicker() {
      return pickerHandle;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.document = window.document;
  globalThis.console = {
    info() {},
    warn() {},
    error() {},
    log() {},
  };

  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/autosave-workflow-utils.js');

  let autosaveHandle = null;
  let pendingAutosaveHandle = null;
  let autosaveDirty = false;
  let exportDirectorySetupDismissed = true;

  const autosaveWorkflowUtilsModule = window.PiXiEEDrawModules.autosaveWorkflowUtils.createAutosaveWorkflowUtils({
    console,
    window,
    document,
    dom: {
      controls: {},
    },
    FILE_HANDLE_AUTOSAVE_SUPPORTED: true,
    EXPORT_DIRECTORY_SUPPORTED: false,
    EXPORT_WORKSPACE_DIR_NAME: 'PiXiEEDraw Exports',
    get autosaveHandle() {
      return autosaveHandle;
    },
    set autosaveHandle(value) {
      autosaveHandle = value;
    },
    get pendingAutosaveHandle() {
      return pendingAutosaveHandle;
    },
    set pendingAutosaveHandle(value) {
      pendingAutosaveHandle = value;
    },
    get autosaveDirty() {
      return autosaveDirty;
    },
    set autosaveDirty(value) {
      autosaveDirty = value;
    },
    get exportDirectorySetupDismissed() {
      return exportDirectorySetupDismissed;
    },
    set exportDirectorySetupDismissed(value) {
      exportDirectorySetupDismissed = value;
    },
    get exportDirectoryHandle() {
      return null;
    },
    set exportDirectoryHandle(_value) {},
    get autosavePermissionListener() {
      return null;
    },
    set autosavePermissionListener(_value) {},
    createAutosaveFileName() {
      return 'phase4h-autosave.pixieedraw';
    },
    async getFileHandleInExportDirectory() {
      return null;
    },
    async requestExportDirectoryBinding() {
      return false;
    },
    async ensureHandlePermission() {
      return true;
    },
    updateAutosaveStatus() {},
    async storeAutosaveHandle(handle) {
      storeAutosaveHandleCalls.push(handle);
    },
    clearPendingPermissionListener() {},
    markAutosaveDirty() {
      autosaveDirty = true;
    },
    async writeAutosaveSnapshot(force) {
      return true;
    },
    bindActiveProjectSaveHandle(handle, meta) {
      bindCalls.push({ handle, meta });
    },
    schedulePendingAutosavePermission(handle) {
      pendingPermissionCalls.push(handle);
    },
    buildPackagedProjectPayload() {
      return {};
    },
    buildAutosaveSessionPayload() {
      return {};
    },
    makeHistorySnapshot() {
      return {
        version: 1,
        width: 2,
        height: 2,
        frames: [],
      };
    },
    createAutosaveProjectId() {
      return 'autosave-project-id';
    },
    normalizeAutosaveProjectId(value = '') {
      return typeof value === 'string' ? value.trim() : '';
    },
    localizeText(ja) {
      return ja;
    },
    isCanvasSurfaceTarget() {
      return false;
    },
    restoreAutosaveDocument() {
      return Promise.resolve(false);
    },
    loadStoredExportDirectoryHandle() {
      return Promise.resolve(null);
    },
    loadStoredExportDirectoryDisplayLabel() {
      return '';
    },
    sanitizeExportDirectoryDisplayLabel(value = '') {
      return String(value || '');
    },
    storeExportDirectoryHandle() {
      return Promise.resolve();
    },
    storeExportDirectoryDisplayLabel() {
      return Promise.resolve();
    },
    updateExportFolderStatus() {},
    updateExportFolderButtonLabel() {},
    ensureExportWorkspaceDirectory() {
      return Promise.resolve(false);
    },
    schedulePendingExportDirectoryPermission() {},
    attemptExportDirectoryReauthorization() {
      return Promise.resolve(false);
    },
    initializeExportDirectoryBinding() {
      return Promise.resolve();
    },
    sanitizeNativeFilename(value = '', fallback = 'export.bin') {
      return value || fallback;
    },
    buildNumberedFilename(filename) {
      return filename;
    },
    AUTOSAVE_WRITE_DELAY: 0,
    AUTOSAVE_LIFECYCLE_FLUSH_THROTTLE_MS: 0,
    AUTOSAVE_TAB_LOCK_KEY: 'autosave-lock',
    AUTOSAVE_TAB_LOCK_TTL_MS: 0,
    AUTOSAVE_TAB_LOCK_NOTICE_THROTTLE_MS: 0,
    AUTOSAVE_THUMBNAIL_UPDATE_INTERVAL_MS: 0,
    SAVE_INTERACTION_GRACE_MS: 0,
    VIEWPORT_INTERACTION_GRACE_MS: 0,
    MULTI_REPLICA_AUTOSAVE_BLOCKED_STATUS: '',
    canUseSessionStorage() {
      return false;
    },
    state: {
      documentName: 'phase4h-autosave.pixieedraw',
    },
  });

  return {
    autosaveWorkflowUtilsModule,
    bindCalls,
    storeAutosaveHandleCalls,
    pendingPermissionCalls,
    get autosaveHandle() {
      return autosaveHandle;
    },
    get pendingAutosaveHandle() {
      return pendingAutosaveHandle;
    },
    get autosaveDirty() {
      return autosaveDirty;
    },
  };
}

const pickerHandle = {
  name: 'external-picker.pixieedraw',
  async createWritable() {
    return {
      async write() {},
      async close() {},
    };
  },
};

const autosaveSeed = { id: 'autosave-seed-handle' };
const pendingSeed = { id: 'pending-seed-handle' };

const manualPickerHarness = createManualProjectSaveHarness({
  pickerHandle,
  autosaveHandleSeed: autosaveSeed,
  pendingAutosaveHandleSeed: pendingSeed,
});
await manualPickerHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(manualPickerHarness.autosaveHandle, autosaveSeed, 'manual picker save does not replace autosaveHandle');
assert.equal(manualPickerHarness.pendingAutosaveHandle, pendingSeed, 'manual picker save does not clear pendingAutosaveHandle');
assert.equal(manualPickerHarness.storeAutosaveHandleCalls.length, 0, 'manual picker save does not persist autosave handle');
assert.equal(manualPickerHarness.bindCalls.length, 1, 'manual picker save binds external project save handle');
assert.equal(manualPickerHarness.bindCalls[0].handle, pickerHandle);

const manualDownloadHarness = createManualProjectSaveHarness({
  disableFileSystemAccess: true,
  autosaveHandleSeed: autosaveSeed,
  pendingAutosaveHandleSeed: pendingSeed,
});
await manualDownloadHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(manualDownloadHarness.autosaveHandle, autosaveSeed, 'download fallback does not touch autosaveHandle');
assert.equal(manualDownloadHarness.pendingAutosaveHandle, pendingSeed, 'download fallback does not touch pendingAutosaveHandle');
assert.equal(manualDownloadHarness.bindCalls.length, 0, 'download fallback does not bind external project save handle');

const directoryHandle = {
  name: 'directory-save.pixieedraw',
  async createWritable() {
    return {
      async write() {},
      async close() {},
    };
  },
};
const manualDirectoryHarness = createManualProjectSaveHarness({
  directoryHandle,
  autosaveHandleSeed: autosaveSeed,
  pendingAutosaveHandleSeed: pendingSeed,
});
await manualDirectoryHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(manualDirectoryHarness.autosaveHandle, autosaveSeed, 'export directory save does not touch autosaveHandle');
assert.equal(manualDirectoryHarness.bindCalls.length, 0, 'export directory save is not treated as bound external project save handle');

const autosaveBindingHandle = {
  name: 'autosave-binding.pixieedraw',
  async queryPermission() {
    return 'granted';
  },
  async requestPermission() {
    return 'granted';
  },
  async createWritable() {
    return {
      async write() {},
      async close() {},
    };
  },
};
const autosaveBindingHarness = createAutosaveBindingHarness({
  pickerHandle: autosaveBindingHandle,
});
await autosaveBindingHarness.autosaveWorkflowUtilsModule.requestAutosaveBinding({
  suggestedName: 'autosave-binding.pixieedraw',
});
assert.equal(autosaveBindingHarness.autosaveHandle, autosaveBindingHandle, 'autosave binding still updates autosaveHandle in autosave-only path');
assert.equal(autosaveBindingHarness.pendingAutosaveHandle, null, 'autosave binding clears pending autosave handle');
assert.equal(autosaveBindingHarness.storeAutosaveHandleCalls.length, 1, 'autosave-only path still persists autosave handle');
assert.equal(autosaveBindingHarness.bindCalls.length, 0, 'autosave-only path does not bind external project save handle');
assert.equal(autosaveBindingHarness.pendingPermissionCalls.length, 0, 'autosave-only path does not fall back to pending permission on granted picker');

globalThis.console = originalConsole;
originalConsole.log('Phase 4-H handle separation checks passed.');
