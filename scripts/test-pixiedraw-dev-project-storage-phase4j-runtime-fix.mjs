import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const V2_ADAPTER_ID = 'pixieedraw-v2-zip-experimental';
const originalConsole = globalThis.console;

function loadBrowserModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInThisContext(source, { filename: absolutePath });
}

function setupBrowserGlobals() {
  globalThis.window = {
    document: {},
    PiXiEEDrawModules: {},
    confirm() {
      return true;
    },
  };
  globalThis.document = window.document;
}

function normalizeAutosaveProjectId(value = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function normalizeDocumentName(value = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : 'phase4j-runtime.pixieedraw';
}

function createPackagedProject(id, fileName) {
  return {
    type: 'pixieedraw-project',
    packageVersion: 2,
    updatedAt: `2026-07-11T00:00:0${id === 'sheet-a' ? '1' : '2'}Z`,
    document: {
      documentName: fileName,
      version: 1,
      width: 2,
      height: 2,
      activeCanvasId: `${id}-canvas`,
      canvases: [{
        id: `${id}-canvas`,
        width: 2,
        height: 2,
        activeFrame: 0,
        frames: [{
          id: `${id}-frame`,
          layers: [{
            id: `${id}-layer`,
            name: id,
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'normal',
            indices: [0, 0, 0, 0],
          }],
        }],
      }],
      frames: [{
        id: `${id}-frame`,
        layers: [{
          id: `${id}-layer`,
          name: id,
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          indices: [0, 0, 0, 0],
        }],
      }],
      palette: [],
    },
    session: {
      historyLimit: 30,
      historyPast: [],
      historyFuture: [],
      timelapse: {
        enabled: false,
        fps: 12,
        byCanvas: {},
        operationLogsByCanvas: {},
        tracksByCanvasId: {},
      },
    },
  };
}

function createRootProject() {
  const sheetAProject = createPackagedProject('sheet-a', 'sheet-a.pixieedraw');
  const sheetBProject = createPackagedProject('sheet-b', 'sheet-b.pixieedraw');
  return {
    ...sheetAProject,
    sheets: [
      {
        id: 'sheet-a',
        fileName: 'sheet-a.pixieedraw',
        label: 'Sheet A',
        project: sheetAProject,
        source: 'sheet',
      },
      {
        id: 'sheet-b',
        fileName: 'sheet-b.pixieedraw',
        label: 'Sheet B',
        project: sheetBProject,
        source: 'sheet',
      },
    ],
    activeSheetId: 'sheet-a',
  };
}

function createPersistenceState(overrides = {}) {
  return {
    sourceKind: 'file',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceProjectToken: 'token-v2-runtime',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'bound',
    ...overrides,
  };
}

async function runDocumentSessionPersistenceTest() {
  setupBrowserGlobals();
  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/document-session-workflow-utils.js');

  const capturedPersistenceUpdates = [];
  const openProjectTabs = [];
  let activeOpenProjectTabId = '';
  let autosaveProjectId = 'local-runtime-project';

  const rootProject = createRootProject();
  const module = window.PiXiEEDrawModules.documentSessionWorkflowUtils.createDocumentSessionWorkflowUtils({
    ensureCurrentClientCanReplaceActiveProject() {
      return true;
    },
    snapshotFromParsedDocumentValue(projectPayload) {
      return {
        snapshot: projectPayload.document,
        projectSession: projectPayload.session,
        sheets: projectPayload.sheets,
        activeSheetId: projectPayload.activeSheetId,
      };
    },
    deserializeDocumentPayload(payload) {
      return payload;
    },
    parseProjectSessionPayload(session) {
      return session;
    },
    resolvePackagedProjectDotStats() {
      return null;
    },
    normalizePackagedProjectSheets(sheets = [], activeSheetId = '') {
      return Array.isArray(sheets)
        ? sheets.map(sheet => ({
            ...sheet,
            active: sheet?.id === activeSheetId,
          }))
        : [];
    },
    clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    },
    normalizeTimelapseCanvasId(value = '', fallback = '') {
      return typeof value === 'string' && value.trim()
        ? value.trim()
        : (typeof fallback === 'string' && fallback.trim() ? fallback.trim() : '');
    },
    normalizeTimelapseFps(value) {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 12;
    },
    synchronizeImportedSnapshotPalette() {},
    applyHistorySnapshot() {},
    history: { pending: null, past: [], future: [], limit: 30 },
    trimHistoryStacksToLimit() {},
    timelapseState: {
      tracksByCanvasId: Object.create(null),
      enabled: false,
      fps: 12,
    },
    clearTimelapseRecording() {},
    reconcileTimelapseTracksForSingleCanvas() {},
    ensureTimelapseStartCapture() {},
    syncTimelapseControls() {},
    updateHistoryButtons() {},
    updateMemoryStatus() {},
    preserveCanvasSelectionClipboard() {
      return null;
    },
    restoreCanvasSelectionClipboard() {},
    resetDocumentUnsavedChanges() {},
    resetExportScaleDefaults() {},
    syncPixfindSnapshotAfterDocumentReset() {},
    setTrackedProjectDotBaseline() {},
    resetOpenedDocumentViewport() {},
    normalizeAutosaveProjectId,
    normalizeMultiProjectKey(value = '') {
      return typeof value === 'string' ? value.trim() : '';
    },
    createAutosaveProjectId() {
      return 'local-runtime-project';
    },
    autosaveProjectId,
    setActiveAutosaveProjectId(value) {
      autosaveProjectId = value;
    },
    recentProjectsCache: new Map(),
    SHARED_PROJECTS_ENABLED: false,
    getSharedProjectKeyFromProjectId() {
      return '';
    },
    resetOpenProjectTabsToCurrentProject() {
      return null;
    },
    createOpenProjectSheetTabFromPackagedProject(sheet) {
      return {
        ...sheet,
        residentProjectLoaded: true,
      };
    },
    openProjectTabs,
    renderOpenProjectTabs() {},
    localizeText(ja) {
      return ja;
    },
    MAX_PROJECT_SHEETS: 8,
    activeOpenProjectTabId,
    suppressOpenProjectTabAutoInitialize: false,
    updateActiveProjectPersistenceState(patch) {
      capturedPersistenceUpdates.push({ ...patch });
      return patch;
    },
    Object,
    activateQrEditMode() {},
    getActiveQrEditPayload() {
      return null;
    },
    getOpenProjectTabSharedKey() {
      return '';
    },
    setActiveSharedProjectSession() {},
    initializeSharedProjectCanvasIdentityFromCurrentDocument() {},
    setMultiStatus() {},
    clearActiveSharedProjectSession() {},
    isSharedRecentProjectEntry() {
      return false;
    },
    normalizeSharedRecentProjectEntry(value) {
      return value;
    },
    updateAutosaveStatus() {},
    markAutosaveDirty() {},
    scheduleSessionPersist() {},
    scheduleAutosaveSnapshot() {},
    resolveProjectSourceKind(options = {}) {
      return options?.sourceKind || 'unknown';
    },
    createProjectPersistenceToken(seed = '') {
      return `token:${seed || 'unknown'}`;
    },
    normalizeProjectPersistenceState(value = null) {
      return {
        sourceStorageAdapterId: value?.sourceStorageAdapterId || null,
        sourceKind: value?.sourceKind || 'unknown',
        sourceProjectToken: value?.sourceProjectToken || null,
        lastSavedStorageAdapterId: value?.lastSavedStorageAdapterId || null,
        projectSaveHandleState: value?.projectSaveHandleState || 'none',
      };
    },
    SHARED_PROJECT_ID_PREFIX: 'shared:',
    state: {
      documentName: 'runtime-fix.pixieedraw',
    },
  });

  const loaded = await module.loadDocumentFromProjectPayload(rootProject, {
    sourcePersistenceState: createPersistenceState(),
  });
  assert.equal(loaded, true);
  assert.equal(capturedPersistenceUpdates.at(-1)?.sourceKind, 'file');
  assert.equal(capturedPersistenceUpdates.at(-1)?.sourceStorageAdapterId, V2_ADAPTER_ID);
  assert.equal(capturedPersistenceUpdates.at(-1)?.lastSavedStorageAdapterId, V2_ADAPTER_ID);
  assert.equal(capturedPersistenceUpdates.at(-1)?.projectSaveHandleState, 'bound');
}

async function runTabWorkflowRuntimeFixTest() {
  setupBrowserGlobals();
  const warnings = [];
  globalThis.console = {
    ...originalConsole,
    warn: (...args) => warnings.push(args.map(value => String(value)).join(' ')),
    info() {},
    log() {},
    error() {},
  };

  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/open-project-tab-model.js');
  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/open-project-tab-lifecycle.js');
  loadBrowserModule('PiXiEEDrawDEV/assets/js/modules/open-project-tab-workflow-utils.js');

  const openProjectTabs = [];
  const recentProjectsCache = new Map();
  const state = {
    documentName: 'phase4j-runtime.pixieedraw',
  };
  const sharedState = {
    activeOpenProjectTabId: '',
    suppressOpenProjectTabAutoInitialize: false,
    projectHomeVisible: false,
    startupAutosaveRestoreProjectId: '',
    autosaveProjectId: 'local-runtime-project',
    openProjectTabBusy: false,
  };
  let currentLoadedProject = createRootProject().sheets[0].project;
  let autosaveSnapshotCalls = 0;
  let viewportResetTarget = '';

  function createAutosaveProjectId() {
    return 'local-runtime-project';
  }

  let tabCounter = 0;
  function createOpenProjectTabId() {
    tabCounter += 1;
    return `tab-${tabCounter}`;
  }

  function extractDocumentBaseName(value = '') {
    return String(value || '').replace(/\.pixieedraw$/i, '') || 'project';
  }

  const openProjectTabModel = window.PiXiEEDrawModules.openProjectTabModel.createOpenProjectTabModel({
    SHARED_PROJECTS_ENABLED: false,
    state,
    makeHistorySnapshot() {
      return currentLoadedProject?.document || createPackagedProject('fallback', state.documentName).document;
    },
    buildProjectSessionPayload() {
      return currentLoadedProject?.session || {
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
        session: session || currentLoadedProject?.session || {
          timelapse: {
            enabled: false,
            fps: 12,
            byCanvas: {},
            operationLogsByCanvas: {},
          },
        },
        updatedAt: new Date().toISOString(),
      };
    },
    normalizeDocumentName,
    normalizeProjectSaveHandleMeta(value = null) {
      return value;
    },
    DEFAULT_DOCUMENT_NAME: 'phase4j-runtime.pixieedraw',
    hasDocumentUnsavedChanges() {
      return false;
    },
    normalizeAutosaveProjectId,
    getAutosaveProjectId() {
      return sharedState.autosaveProjectId;
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
    extractDocumentBaseName,
    createLightweightLocalProjectTabState(tab = null, overrides = {}) {
      const base = tab && typeof tab === 'object' ? tab : {};
      return {
        ...base,
        ...overrides,
        project: null,
        residentProjectLoaded: false,
      };
    },
    createLocalProjectEntrySignature() {
      return {};
    },
    normalizeProjectPersistenceState(value = null, fallback = null, { createToken = true } = {}) {
      const next = value && typeof value === 'object' ? value : {};
      const base = fallback && typeof fallback === 'object' ? fallback : {};
      return {
        sourceStorageAdapterId: next.sourceStorageAdapterId ?? base.sourceStorageAdapterId ?? null,
        sourceKind: next.sourceKind ?? base.sourceKind ?? 'unknown',
        sourceProjectToken: next.sourceProjectToken ?? base.sourceProjectToken ?? (createToken ? `token-${tabCounter + 1}` : null),
        lastSavedStorageAdapterId: next.lastSavedStorageAdapterId ?? base.lastSavedStorageAdapterId ?? null,
        projectSaveHandleState: next.projectSaveHandleState ?? base.projectSaveHandleState ?? 'none',
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
      return sharedState.activeOpenProjectTabId;
    },
    setActiveOpenProjectTabId(value) {
      sharedState.activeOpenProjectTabId = value;
    },
    getSuppressOpenProjectTabAutoInitialize() {
      return sharedState.suppressOpenProjectTabAutoInitialize;
    },
    setSuppressOpenProjectTabAutoInitialize(value) {
      sharedState.suppressOpenProjectTabAutoInitialize = Boolean(value);
    },
    getProjectHomeVisible() {
      return sharedState.projectHomeVisible;
    },
    setProjectHomeVisibleState(value) {
      sharedState.projectHomeVisible = Boolean(value);
    },
    getStartupAutosaveRestoreProjectId() {
      return sharedState.startupAutosaveRestoreProjectId;
    },
    getAutosaveProjectId() {
      return sharedState.autosaveProjectId;
    },
    getOpenProjectTabBusy() {
      return sharedState.openProjectTabBusy;
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
      sharedState.autosaveProjectId = value;
    },
    createAutosaveProjectId,
    createOpenProjectTabFromCurrentState: openProjectTabModel.createOpenProjectTabFromCurrentState,
    createLocalOpenProjectTabFromCurrentState: openProjectTabModel.createLocalOpenProjectTabFromCurrentState,
    isSharedOpenProjectTab() {
      return false;
    },
    getActiveOpenProjectTab() {
      return openProjectTabs.find(tab => tab?.id === sharedState.activeOpenProjectTabId) || null;
    },
    normalizeProjectSaveHandleMeta(value = null) {
      return value;
    },
    normalizeProjectSaveHandleState(value, fallback = 'none') {
      return typeof value === 'string' && value ? value : fallback;
    },
    normalizeProjectStorageAdapterId(value = null) {
      return value;
    },
    hasDocumentUnsavedChanges() {
      return false;
    },
    writeAutosaveSnapshot: async () => {
      autosaveSnapshotCalls += 1;
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
    refreshRecentProjectsUI() {},
    maybePromptAndTransferRecentProjectsFromHome() {},
    clearActiveSharedProjectSession() {},
    makeHistorySnapshot() {
      return currentLoadedProject?.document || createPackagedProject('fallback', state.documentName).document;
    },
    buildProjectSessionPayload() {
      return currentLoadedProject?.session || {
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
        session: session || currentLoadedProject?.session || {
          timelapse: {
            enabled: false,
            fps: 12,
            byCanvas: {},
            operationLogsByCanvas: {},
          },
        },
        updatedAt: new Date().toISOString(),
      };
    },
  });

  const rootProject = createRootProject();
  const tabA = openProjectTabModel.createOpenProjectSheetTabFromPackagedProject({
    id: 'sheet-a',
    project: rootProject.sheets[0].project,
    projectId: sharedState.autosaveProjectId,
    fileName: 'sheet-a.pixieedraw',
    label: 'Sheet A',
    source: 'sheet',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceKind: 'file',
    sourceProjectToken: 'token-v2-runtime',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  });
  const tabB = openProjectTabModel.createOpenProjectSheetTabFromPackagedProject({
    id: 'sheet-b',
    project: rootProject.sheets[1].project,
    projectId: sharedState.autosaveProjectId,
    fileName: 'sheet-b.pixieedraw',
    label: 'Sheet B',
    source: 'sheet',
    sourceStorageAdapterId: V2_ADAPTER_ID,
    sourceKind: 'file',
    sourceProjectToken: 'token-v2-runtime',
    lastSavedStorageAdapterId: V2_ADAPTER_ID,
    projectSaveHandleState: 'bound',
  });
  openProjectTabs.push(
    { ...tabA, residentProjectLoaded: true },
    { ...tabB, residentProjectLoaded: true },
  );
  sharedState.activeOpenProjectTabId = 'sheet-a';
  currentLoadedProject = rootProject.sheets[0].project;

  const persisted = await lifecycle.persistActiveOpenProjectTab({
    flushAutosave: false,
    retainProjectPayload: true,
  });
  assert.equal(persisted, true);
  assert.equal(Boolean(openProjectTabs[0]?.project), true, 'persistActiveOpenProjectTab keeps resident project payload when requested');
  assert.equal(openProjectTabs[0]?.residentProjectLoaded, true, 'persistActiveOpenProjectTab keeps residentProjectLoaded when retaining payload');

  const workflowScope = {
    AUTOSAVE_SUPPORTED: true,
    SHARED_PROJECT_ID_PREFIX: 'shared:',
    get activeOpenProjectTabId() {
      return sharedState.activeOpenProjectTabId;
    },
    set activeOpenProjectTabId(value) {
      sharedState.activeOpenProjectTabId = value;
    },
    activeSharedProjectKey: '',
    activeSharedProjectId: '',
    activeSharedProjectMembershipRole: '',
    activeSharedProjectRevision: 0,
    activeSharedProjectStructureRevision: 0,
    get autosaveProjectId() {
      return sharedState.autosaveProjectId;
    },
    set autosaveProjectId(value) {
      sharedState.autosaveProjectId = value;
    },
    buildSharedRecentProjectId(value = '') {
      return value;
    },
    checkpoint: null,
    clearActiveSharedProjectSession() {},
    clearPendingSharedInvite() {},
    createAutosaveProjectId,
    ensureCurrentClientCanReplaceActiveProject() {
      return true;
    },
    extractDocumentBaseName,
    findOpenProjectTabIndex(tabId) {
      return openProjectTabs.findIndex(tab => tab?.id === tabId);
    },
    findOpenProjectTabIndexForRecentProjectEntry() {
      return -1;
    },
    matchesDeletedProjectOpenTab() {
      return false;
    },
    getCurrentSharedRecentProjectEntry() {
      return null;
    },
    getOpenProjectTabDisplayLabel(tab) {
      return tab?.label || '';
    },
    getOpenProjectTabSharedKey() {
      return '';
    },
    getSharedProjectKeyFromProjectId() {
      return '';
    },
    getSharedRecentProjectEntryForTab() {
      return null;
    },
    handleMultiLocalCommit() {},
    hideProjectHomeScreen() {},
    hideStartupScreen() {},
    isCurrentProjectSharedEntry() {
      return false;
    },
    isMultiMasterProjectReplacementBlocked() {
      return false;
    },
    isSharedProjectRealtimePrimaryActive() {
      return false;
    },
    isSharedRecentProjectEntry() {
      return false;
    },
    async loadDocumentFromProjectPayload(projectPayload) {
      currentLoadedProject = projectPayload;
      return true;
    },
    async loadDocumentFromText() {
      return true;
    },
    async loadRecentProjectsMetadata() {
      return [];
    },
    localizeText(ja) {
      return ja;
    },
    mapSharedProjectMembershipRoleToUiRole() {
      return 'guest';
    },
    markAutosaveDirty() {},
    markDocumentUnsavedChange() {},
    multiState: {},
    normalizeAutosaveProjectId,
    normalizeMultiProjectKey(value = '') {
      return typeof value === 'string' ? value.trim() : '';
    },
    get openProjectTabBusy() {
      return sharedState.openProjectTabBusy;
    },
    set openProjectTabBusy(value) {
      sharedState.openProjectTabBusy = Boolean(value);
    },
    openProjectTabs,
    openSharedRecentProject() {},
    persistActiveOpenProjectTab: (...args) => lifecycle.persistActiveOpenProjectTab(...args),
    projectHomeVisible: false,
    queueProjectTabViewportReset(tabId) {
      viewportResetTarget = tabId;
    },
    queueSharedProjectCurrentSnapshotCapture() {},
    readPendingSharedInvite() {
      return null;
    },
    recentProjectsCache,
    releaseOpenProjectTabProjectWriteGuard() {},
    renderOpenProjectTabs() {},
    resetDocumentUnsavedChanges() {},
    pruneInactiveCanvasDirectCaches() {},
    retainOpenProjectTabProjectWriteGuard() {},
    saveRecentProjectsList() {},
    scheduleAutosaveSnapshot() {},
    scheduleSessionPersist() {},
    setActiveAutosaveProjectId(value) {
      sharedState.autosaveProjectId = value;
    },
    setMultiStatus() {},
    setProjectHomeVisible() {},
    setRecentProjectsCache() {},
    startupAutosaveRestoreProjectId: '',
    state,
    storeMultiProjectKey() {},
    get suppressOpenProjectTabAutoInitialize() {
      return sharedState.suppressOpenProjectTabAutoInitialize;
    },
    set suppressOpenProjectTabAutoInitialize(value) {
      sharedState.suppressOpenProjectTabAutoInitialize = Boolean(value);
    },
    syncMultiProjectKeyInputValues() {},
    unhideSharedProjectFromRecentSync() {},
    updateAutosaveStatus() {},
    writeAutosaveSnapshot: async () => {
      autosaveSnapshotCalls += 1;
      return true;
    },
    hydrateActiveLocalProjectJournalFromRecentEntry() {},
    reconstructLocalRecentProjectPayload() {
      return null;
    },
    extractLocalProjectSheetPayload(packagedProject, sheetId) {
      if (!packagedProject || !Array.isArray(packagedProject.sheets)) {
        return null;
      }
      return packagedProject.sheets.find(sheet => sheet?.id === sheetId)?.project || null;
    },
    resolveStoredLocalProjectPayloadForProjectId(projectId) {
      return projectId === sharedState.autosaveProjectId ? rootProject : null;
    },
    confirmCloseOpenProjectTab() {
      return true;
    },
  };

  const workflow = window.PiXiEEDrawModules.openProjectTabWorkflowUtils.createOpenProjectTabWorkflowUtils(workflowScope);

  const switchedToB = await workflow.activateOpenProjectTab('sheet-b', {
    skipPersistCurrent: false,
    announce: false,
  });
  assert.equal(switchedToB, true);
  assert.equal(sharedState.activeOpenProjectTabId, 'sheet-b');
  assert.equal(viewportResetTarget, 'sheet-b');

  openProjectTabs[0] = {
    ...openProjectTabs[0],
    project: null,
    residentProjectLoaded: false,
  };

  const switchedBackToA = await workflow.activateOpenProjectTab('sheet-a', {
    skipPersistCurrent: false,
    announce: false,
  });
  assert.equal(switchedBackToA, true, 'sheet switch reconstructs target payload when tab.project is null');
  assert.equal(sharedState.activeOpenProjectTabId, 'sheet-a');
  assert.equal(viewportResetTarget, 'sheet-a');
  assert.equal(
    warnings.some(message => message.includes('[sheet-switch-debug:missing-target-project]')),
    false,
    'sheet switch no longer hits missing-target-project during round trip'
  );

  const closeResult = await workflow.closeOpenProjectTab('sheet-b');
  assert.equal(closeResult, true);
  assert.equal(autosaveSnapshotCalls > 0, true, 'closing a tab calls writeAutosaveSnapshot successfully');
  assert.equal(
    warnings.some(message => message.includes('writeAutosaveSnapshot is not a function')),
    false,
    'closing a tab no longer throws writeAutosaveSnapshot is not a function'
  );
}

await runDocumentSessionPersistenceTest();
await runTabWorkflowRuntimeFixTest();

globalThis.console = originalConsole;
console.log('Phase 4-J runtime fix tests passed');
