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

function normalizeProjectSaveHandleState(value, fallback = 'none') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const allowed = new Set(['none', 'bound', 'unknown', 'conversion-required', 'stale', 'unavailable']);
  if (allowed.has(normalized)) {
    return normalized;
  }
  return allowed.has(fallback) ? fallback : 'none';
}

function normalizeProjectSaveHandleMeta(value = null, fallback = null, tab = null) {
  const next = value && typeof value === 'object' ? value : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const fileName = typeof next.fileName === 'string' && next.fileName.trim()
    ? next.fileName.trim()
    : (typeof base.fileName === 'string' && base.fileName.trim()
      ? base.fileName.trim()
      : (typeof tab?.fileName === 'string' && tab.fileName.trim() ? tab.fileName.trim() : ''));
  const adapterId = normalizeProjectStorageAdapterId(
    Object.prototype.hasOwnProperty.call(next, 'adapterId')
      ? next.adapterId
      : (Object.prototype.hasOwnProperty.call(base, 'adapterId') ? base.adapterId : (tab?.lastSavedStorageAdapterId || tab?.sourceStorageAdapterId || null))
  );
  const boundAt = typeof next.boundAt === 'string' && next.boundAt.trim()
    ? next.boundAt.trim()
    : (typeof base.boundAt === 'string' && base.boundAt.trim() ? base.boundAt.trim() : '');
  const sourceProjectToken = typeof next.sourceProjectToken === 'string' && next.sourceProjectToken.trim()
    ? next.sourceProjectToken.trim()
    : (typeof base.sourceProjectToken === 'string' && base.sourceProjectToken.trim()
      ? base.sourceProjectToken.trim()
      : (typeof tab?.sourceProjectToken === 'string' && tab.sourceProjectToken.trim() ? tab.sourceProjectToken.trim() : ''));
  const handleKind = typeof next.handleKind === 'string' && next.handleKind.trim()
    ? next.handleKind.trim()
    : (typeof base.handleKind === 'string' && base.handleKind.trim() ? base.handleKind.trim() : 'unknown');
  const permissionState = (() => {
    const candidate = typeof next.permissionState === 'string' && next.permissionState.trim()
      ? next.permissionState.trim()
      : (typeof base.permissionState === 'string' && base.permissionState.trim() ? base.permissionState.trim() : 'unknown');
    const allowed = new Set(['granted', 'prompt', 'denied', 'unknown']);
    return allowed.has(candidate) ? candidate : 'unknown';
  })();
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

function createLifecycleHarness() {
  globalThis.window = {
    document: {},
    PiXiEEDrawModules: {},
  };
  globalThis.document = window.document;

  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/open-project-tab-model.js');
  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/open-project-tab-lifecycle.js');

  let autosaveProjectCounter = 0;
  let openProjectTabCounter = 0;
  let activeOpenProjectTabId = '';
  let suppressOpenProjectTabAutoInitialize = false;
  let projectHomeVisible = false;
  const openProjectTabs = [];
  const recentProjectsCache = new Map();
  const state = {
    documentName: 'phase4g-binding.pixieedraw',
  };

  function createAutosaveProjectId() {
    autosaveProjectCounter += 1;
    return `autosave-project-${autosaveProjectCounter}`;
  }

  function createOpenProjectTabId() {
    openProjectTabCounter += 1;
    return `tab-${openProjectTabCounter}`;
  }

  function normalizeAutosaveProjectId(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  const openProjectTabModel = window.PiXiEEDrawModules.openProjectTabModel.createOpenProjectTabModel({
    SHARED_PROJECTS_ENABLED: false,
    state,
    makeHistorySnapshot() {
      return {
        width: 2,
        height: 2,
        frames: [],
        documentName: state.documentName,
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
    buildPackagedProjectPayload(snapshot, { session } = {}) {
      return {
        type: 'pixieedraw-project',
        packageVersion: 2,
        document: snapshot,
        session,
      };
    },
    normalizeDocumentName(value = '') {
      return typeof value === 'string' && value.trim() ? value.trim() : 'phase4g-binding.pixieedraw';
    },
    normalizeProjectSaveHandleMeta,
    DEFAULT_DOCUMENT_NAME: 'phase4g-binding.pixieedraw',
    hasDocumentUnsavedChanges() {
      return false;
    },
    normalizeAutosaveProjectId,
    getAutosaveProjectId() {
      return 'autosave-root';
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
    buildSharedRecentProjectId(value = '') {
      return value;
    },
    getSharedProjectKeyFromProjectId() {
      return '';
    },
    SHARED_PROJECT_ID_PREFIX: 'shared:',
    normalizeMultiProjectKey(value = '') {
      return typeof value === 'string' ? value.trim() : '';
    },
    createOpenProjectTabId,
    extractDocumentBaseName(value = '') {
      return String(value || '').replace(/\.pixieedraw$/i, '') || 'project';
    },
    createLightweightLocalProjectTabState(tab) {
      return tab;
    },
    createLocalProjectEntrySignature() {
      return {};
    },
    normalizeProjectPersistenceState(value = null, fallback = null, { createToken = true } = {}) {
      const next = value && typeof value === 'object' ? value : {};
      const base = fallback && typeof fallback === 'object' ? fallback : {};
      const sourceKind = typeof next.sourceKind === 'string' && next.sourceKind.trim()
        ? next.sourceKind.trim()
        : (typeof base.sourceKind === 'string' && base.sourceKind.trim() ? base.sourceKind.trim() : 'unknown');
      const sourceProjectToken = typeof next.sourceProjectToken === 'string' && next.sourceProjectToken.trim()
        ? next.sourceProjectToken.trim()
        : (typeof base.sourceProjectToken === 'string' && base.sourceProjectToken.trim()
          ? base.sourceProjectToken.trim()
          : (createToken ? `token-${openProjectTabCounter + 1}` : null));
      return {
        sourceStorageAdapterId: normalizeProjectStorageAdapterId(
          Object.prototype.hasOwnProperty.call(next, 'sourceStorageAdapterId') ? next.sourceStorageAdapterId : base.sourceStorageAdapterId
        ),
        sourceKind,
        sourceProjectToken,
        lastSavedStorageAdapterId: normalizeProjectStorageAdapterId(
          Object.prototype.hasOwnProperty.call(next, 'lastSavedStorageAdapterId') ? next.lastSavedStorageAdapterId : base.lastSavedStorageAdapterId
        ),
        projectSaveHandleState: normalizeProjectSaveHandleState(
          Object.prototype.hasOwnProperty.call(next, 'projectSaveHandleState') ? next.projectSaveHandleState : base.projectSaveHandleState,
          'none'
        ),
      };
    },
    normalizeQrEditPayload(value) {
      return value || null;
    },
    localizeText(ja) {
      return ja;
    },
    MAX_PROJECT_SHEETS: 8,
  });

  const lifecycle = window.PiXiEEDrawModules.openProjectTabLifecycle.createOpenProjectTabLifecycle({
    dom: {},
    openProjectTabs,
    recentProjectsCache,
    SHARED_PROJECTS_ENABLED: false,
    MAX_PROJECT_SHEETS: 8,
    AUTOSAVE_SUPPORTED: true,
    getActiveOpenProjectTabId() {
      return activeOpenProjectTabId;
    },
    setActiveOpenProjectTabId(value) {
      activeOpenProjectTabId = value;
    },
    getSuppressOpenProjectTabAutoInitialize() {
      return suppressOpenProjectTabAutoInitialize;
    },
    setSuppressOpenProjectTabAutoInitialize(value) {
      suppressOpenProjectTabAutoInitialize = Boolean(value);
    },
    getProjectHomeVisible() {
      return projectHomeVisible;
    },
    setProjectHomeVisibleState(value) {
      projectHomeVisible = Boolean(value);
    },
    getStartupAutosaveRestoreProjectId() {
      return '';
    },
    getAutosaveProjectId() {
      return 'autosave-root';
    },
    getOpenProjectTabBusy() {
      return false;
    },
    getStartupVisible() {
      return false;
    },
    getActiveSharedProjectKey() {
      return '';
    },
    findOpenProjectTabIndex(tabId) {
      return openProjectTabs.findIndex(tab => tab?.id === tabId);
    },
    findOpenProjectTabIndexByProjectId(projectId) {
      return openProjectTabs.findIndex(tab => tab?.projectId === projectId);
    },
    renderOpenProjectTabs() {},
    normalizeAutosaveProjectId,
    readReloadTargetProjectId() {
      return '';
    },
    setActiveAutosaveProjectId(value) {
      return value;
    },
    createAutosaveProjectId,
    createOpenProjectTabFromCurrentState: openProjectTabModel.createOpenProjectTabFromCurrentState,
    createLocalOpenProjectTabFromCurrentState: openProjectTabModel.createLocalOpenProjectTabFromCurrentState,
    isSharedOpenProjectTab() {
      return false;
    },
    getActiveOpenProjectTab() {
      return openProjectTabs.find(tab => tab?.id === activeOpenProjectTabId) || null;
    },
    normalizeProjectSaveHandleMeta,
    normalizeProjectSaveHandleState,
    normalizeProjectStorageAdapterId,
    hasDocumentUnsavedChanges() {
      return false;
    },
    async writeAutosaveSnapshot() {
      return true;
    },
    updateAutosaveStatus() {},
    localizeText(ja) {
      return ja;
    },
    hideStartupScreen() {},
    updateQrEditPanel() {},
    syncQrEditModeWithActivePayload() {},
    scheduleRecentProjectsListRender() {},
    refreshRecentProjectsUI() {
      return Promise.resolve();
    },
    maybePromptAndTransferRecentProjectsFromHome() {
      return Promise.resolve();
    },
    clearActiveSharedProjectSession() {},
  });

  const initialTab = lifecycle.resetOpenProjectTabsToCurrentProject({
    sourceKind: 'new',
    sourceStorageAdapterId: null,
    projectSaveHandleState: 'none',
  });

  return {
    openProjectTabs,
    lifecycle,
    model: openProjectTabModel,
    get activeTab() {
      return openProjectTabs.find(tab => tab?.id === activeOpenProjectTabId) || null;
    },
    setActiveTab(tabId) {
      activeOpenProjectTabId = tabId;
    },
    initialTab,
  };
}

function createExportHarness({
  activePersistenceState = null,
  disableFileSystemAccess = false,
  directoryHandle = null,
  pickerHandle = null,
  useAutosaveBoundHandle = false,
} = {}) {
  const bindCalls = [];
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
  globalThis.autosaveDirty = false;
  globalThis.autosaveProjectId = 'autosave-project';
  globalThis.pendingAutosaveHandle = null;
  globalThis.dom = { controls: {} };
  globalThis.state = {
    documentName: 'phase4g-save.pixieedraw',
    frames: [],
  };
  globalThis.autosaveHandle = useAutosaveBoundHandle
    ? {
        async createWritable() {
          return {
            async write() {},
            async close() {},
          };
        },
      }
    : null;

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
      return 'phase4g-save.pixieedraw';
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
        blob: new Blob(['phase4g'], { type: PROJECT_FILE_MIME_TYPE }),
        filename: 'phase4g-save.pixieedraw',
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
    createAutosaveFileName(name = 'phase4g-save.pixieedraw') {
      return name;
    },
    ensureCurrentClientCanExportProject() {
      return true;
    },
    updateAutosaveStatus() {},
    async ensureHandlePermission() {
      return true;
    },
    async storeAutosaveHandle() {},
    async recordRecentProjectSnapshot() {},
    clearPendingPermissionListener() {},
    schedulePendingAutosavePermission() {},
    createAutosaveProjectId() {
      return 'generated-project-id';
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
  };
}

const lifecycleHarness = createLifecycleHarness();

assert.equal(lifecycleHarness.initialTab.projectSaveHandleState, 'none', 'new tab starts without external project save handle');
assert.equal(lifecycleHarness.initialTab.projectSaveHandle, null);
assert.equal(lifecycleHarness.initialTab.projectSaveHandleMeta, null);

const v1Tab = lifecycleHarness.model.createOpenProjectSheetTabFromPackagedProject({
  id: 'v1-tab',
  projectId: 'v1-project',
  fileName: 'v1-opened.pixieedraw',
  source: 'sheet',
  project: {
    type: 'pixieedraw-project',
    packageVersion: 2,
    document: { width: 2, height: 2, frames: [] },
    session: {},
  },
  sourceKind: 'file',
  sourceStorageAdapterId: V1_ADAPTER_ID,
  projectSaveHandleState: 'unknown',
});
assert.equal(v1Tab.projectSaveHandleState, 'unknown');
assert.equal(v1Tab.projectSaveHandle, null);

const v2Tab = lifecycleHarness.model.createOpenProjectSheetTabFromPackagedProject({
  id: 'v2-tab',
  projectId: 'v2-project',
  fileName: 'v2-opened.pixieedraw',
  source: 'sheet',
  project: {
    type: 'pixieedraw-project',
    packageVersion: 2,
    document: { width: 2, height: 2, frames: [] },
    session: {},
  },
  sourceKind: 'file',
  sourceStorageAdapterId: V2_ADAPTER_ID,
  projectSaveHandleState: 'unknown',
});
assert.equal(v2Tab.projectSaveHandleState, 'unknown');
assert.equal(v2Tab.projectSaveHandle, null);

lifecycleHarness.openProjectTabs.push(v1Tab, v2Tab);

const handleA = {
  name: 'picked-a.pixieedraw',
  async createWritable() {
    return {
      async write() {},
      async close() {},
    };
  },
};
const handleB = {
  name: 'picked-b.pixieedraw',
  async createWritable() {
    return {
      async write() {},
      async close() {},
    };
  },
};

lifecycleHarness.setActiveTab(v1Tab.id);
const boundA = lifecycleHarness.lifecycle.bindActiveProjectSaveHandle(handleA, {
  fileName: 'picked-a.pixieedraw',
  adapterId: V1_ADAPTER_ID,
  handleKind: 'file-picker',
  permissionState: 'granted',
});
assert.equal(boundA.projectSaveHandleState, 'bound');
assert.equal(lifecycleHarness.activeTab.projectSaveHandle, handleA);
assert.equal(lifecycleHarness.activeTab.projectSaveHandleMeta?.handleKind, 'file-picker');

lifecycleHarness.setActiveTab(v2Tab.id);
assert.equal(lifecycleHarness.activeTab.projectSaveHandle, null, 'tab B does not inherit tab A binding');
const boundB = lifecycleHarness.lifecycle.bindActiveProjectSaveHandle(handleB, {
  fileName: 'picked-b.pixieedraw',
  adapterId: V2_ADAPTER_ID,
  handleKind: 'file-picker',
  permissionState: 'granted',
});
assert.equal(boundB.projectSaveHandleState, 'bound');
assert.equal(lifecycleHarness.activeTab.projectSaveHandle, handleB);

const tabAAfterTabBSave = lifecycleHarness.openProjectTabs.find(tab => tab.id === v1Tab.id);
assert.equal(tabAAfterTabBSave.projectSaveHandle, handleA, 'tab A binding remains isolated');

const clearedA = lifecycleHarness.lifecycle.clearOpenProjectTabSaveHandle(v1Tab.id, 'test-clear');
assert.equal(clearedA.projectSaveHandleState, 'none');
assert.equal(lifecycleHarness.openProjectTabs.find(tab => tab.id === v1Tab.id).projectSaveHandle, null);

const unavailableB = lifecycleHarness.lifecycle.markOpenProjectTabSaveHandleUnavailable(v2Tab.id, 'test-unavailable');
assert.equal(unavailableB.projectSaveHandleState, 'unavailable');
assert.equal(lifecycleHarness.openProjectTabs.find(tab => tab.id === v2Tab.id).projectSaveHandle, null);

const pickerHandle = {
  name: 'picker-save.pixieedraw',
  async createWritable() {
    return {
      async write() {},
      async close() {},
    };
  },
};
const pickerHarness = createExportHarness({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    sourceProjectToken: 'token-picker',
    projectSaveHandleState: 'none',
  },
  pickerHandle,
});
await pickerHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(pickerHarness.bindCalls.length, 1, 'picker save binds external project save handle once');
assert.equal(pickerHarness.bindCalls[0].handle, pickerHandle);
assert.equal(pickerHarness.bindCalls[0].meta?.handleKind, 'file-picker');

const downloadHarness = createExportHarness({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    sourceProjectToken: 'token-download',
    projectSaveHandleState: 'none',
  },
  disableFileSystemAccess: true,
});
await downloadHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(downloadHarness.bindCalls.length, 0, 'download fallback never binds external project save handle');

const directoryHandle = {
  name: 'directory-save.pixieedraw',
  async createWritable() {
    return {
      async write() {},
      async close() {},
    };
  },
};
const directoryHarness = createExportHarness({
  activePersistenceState: {
    sourceKind: 'file',
    sourceStorageAdapterId: V1_ADAPTER_ID,
    sourceProjectToken: 'token-directory',
    projectSaveHandleState: 'none',
  },
  directoryHandle,
});
await directoryHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(directoryHarness.bindCalls.length, 0, 'export directory handle is not treated as bound external project save handle');

const autosaveHarness = createExportHarness({
  activePersistenceState: null,
  useAutosaveBoundHandle: true,
});
await autosaveHarness.exportRenderingModule.saveProjectAsPixieedraw({ announceStatus: false });
assert.equal(autosaveHarness.bindCalls.length, 0, 'autosave handle path is not rebound as external project save handle');

globalThis.console = originalConsole;
console.log('Phase 4-G external project save handle binding tests passed');
