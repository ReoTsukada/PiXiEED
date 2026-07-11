(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createOpenProjectTabModel({
    SHARED_PROJECTS_ENABLED,
    state,
    makeHistorySnapshot,
    buildProjectSessionPayload,
    buildPackagedProjectPayload,
    normalizeDocumentName,
    normalizeProjectSaveHandleMeta,
    DEFAULT_DOCUMENT_NAME,
    hasDocumentUnsavedChanges,
    normalizeAutosaveProjectId,
    getAutosaveProjectId,
    createAutosaveProjectId,
    recentProjectsCache,
    isSharedRecentProjectEntry,
    normalizeSharedRecentProjectEntry,
    getActiveSharedProjectKey,
    getActiveSharedProjectId,
    getActiveSharedProjectRevision,
    getActiveSharedProjectStructureRevision,
    buildSharedRecentProjectId,
    getSharedProjectKeyFromProjectId,
    SHARED_PROJECT_ID_PREFIX,
    normalizeMultiProjectKey,
    createOpenProjectTabId,
    extractDocumentBaseName,
    createLightweightLocalProjectTabState,
    createLocalProjectEntrySignature,
    normalizeProjectPersistenceState,
    normalizeQrEditPayload,
    localizeText,
  } = {}) {
    function resolveTabPersistenceState(value = null, fallback = null, { createToken = true } = {}) {
      if (typeof normalizeProjectPersistenceState === 'function') {
        return normalizeProjectPersistenceState(value, fallback, { createToken });
      }
      const base = fallback && typeof fallback === 'object' ? fallback : {};
      const next = value && typeof value === 'object' ? value : {};
      return {
        sourceStorageAdapterId: typeof next.sourceStorageAdapterId === 'string' && next.sourceStorageAdapterId
          ? next.sourceStorageAdapterId
          : (typeof base.sourceStorageAdapterId === 'string' && base.sourceStorageAdapterId ? base.sourceStorageAdapterId : null),
        sourceKind: typeof next.sourceKind === 'string' && next.sourceKind
          ? next.sourceKind
          : (typeof base.sourceKind === 'string' && base.sourceKind ? base.sourceKind : 'unknown'),
        sourceProjectToken: typeof next.sourceProjectToken === 'string' && next.sourceProjectToken
          ? next.sourceProjectToken
          : (typeof base.sourceProjectToken === 'string' && base.sourceProjectToken ? base.sourceProjectToken : (createToken ? `project-${Date.now().toString(36)}` : null)),
        lastSavedStorageAdapterId: typeof next.lastSavedStorageAdapterId === 'string' && next.lastSavedStorageAdapterId
          ? next.lastSavedStorageAdapterId
          : (typeof base.lastSavedStorageAdapterId === 'string' && base.lastSavedStorageAdapterId ? base.lastSavedStorageAdapterId : null),
        projectSaveHandleState: typeof next.projectSaveHandleState === 'string' && next.projectSaveHandleState
          ? next.projectSaveHandleState
          : (typeof base.projectSaveHandleState === 'string' && base.projectSaveHandleState ? base.projectSaveHandleState : 'none'),
      };
    }

    function resolveTabProjectSaveHandle(handle, fallback = null) {
      if (handle && typeof handle === 'object') {
        return handle;
      }
      if (fallback && typeof fallback === 'object') {
        return fallback;
      }
      return null;
    }

    function resolveTabProjectSaveHandleMeta(value = null, fallback = null) {
      if (typeof normalizeProjectSaveHandleMeta === 'function') {
        return normalizeProjectSaveHandleMeta(value, fallback);
      }
      const next = value && typeof value === 'object' ? value : {};
      const base = fallback && typeof fallback === 'object' ? fallback : {};
      const fileName = typeof next.fileName === 'string' && next.fileName.trim()
        ? next.fileName.trim()
        : (typeof base.fileName === 'string' && base.fileName.trim() ? base.fileName.trim() : '');
      const adapterId = typeof next.adapterId === 'string' && next.adapterId.trim()
        ? next.adapterId.trim()
        : (typeof base.adapterId === 'string' && base.adapterId.trim() ? base.adapterId.trim() : '');
      const boundAt = typeof next.boundAt === 'string' && next.boundAt.trim()
        ? next.boundAt.trim()
        : (typeof base.boundAt === 'string' && base.boundAt.trim() ? base.boundAt.trim() : '');
      const sourceProjectToken = typeof next.sourceProjectToken === 'string' && next.sourceProjectToken.trim()
        ? next.sourceProjectToken.trim()
        : (typeof base.sourceProjectToken === 'string' && base.sourceProjectToken.trim() ? base.sourceProjectToken.trim() : '');
      const handleKind = typeof next.handleKind === 'string' && next.handleKind.trim()
        ? next.handleKind.trim()
        : (typeof base.handleKind === 'string' && base.handleKind.trim() ? base.handleKind.trim() : '');
      const permissionState = typeof next.permissionState === 'string' && next.permissionState.trim()
        ? next.permissionState.trim()
        : (typeof base.permissionState === 'string' && base.permissionState.trim() ? base.permissionState.trim() : 'unknown');
      if (!fileName && !adapterId && !boundAt && !sourceProjectToken && !handleKind && !permissionState) {
        return null;
      }
      return {
        fileName,
        adapterId: adapterId || null,
        boundAt,
        sourceProjectToken: sourceProjectToken || null,
        handleKind: handleKind || 'unknown',
        permissionState,
      };
    }

    function getProjectPersistenceStateFromTab(tab = null, options = {}) {
      return resolveTabPersistenceState(tab, null, {
        createToken: options?.createToken === true,
      });
    }

    function buildOpenProjectTabPayloadFromCurrentState() {
      const snapshot = makeHistorySnapshot();
      const session = buildProjectSessionPayload();
      const packaged = buildPackagedProjectPayload(snapshot, { session, includeSheets: false });
      return {
        fileName: normalizeDocumentName(snapshot.documentName || state.documentName || DEFAULT_DOCUMENT_NAME),
        project: packaged,
        unsaved: hasDocumentUnsavedChanges(),
      };
    }

    function createOpenProjectTabFromCurrentState(options = {}) {
      const payload = buildOpenProjectTabPayloadFromCurrentState();
      const normalizedProjectId = normalizeAutosaveProjectId(options.projectId || getAutosaveProjectId?.())
        || createAutosaveProjectId();
      const tabId = options.tabId || createOpenProjectTabId();
      const fileName = normalizeDocumentName(options.fileName || payload.fileName || DEFAULT_DOCUMENT_NAME);
      const persistenceState = resolveTabPersistenceState(options, null, { createToken: true });
      const projectSaveHandle = resolveTabProjectSaveHandle(options.projectSaveHandle, null);
      const projectSaveHandleMeta = resolveTabProjectSaveHandleMeta(options.projectSaveHandleMeta, null);
      if (!SHARED_PROJECTS_ENABLED) {
        const localTab = {
          id: tabId,
          projectId: normalizedProjectId,
          fileName,
          label: typeof options.label === 'string' && options.label.trim()
            ? options.label.trim()
            : extractDocumentBaseName(fileName),
          project: payload.project,
          deferredProjectPayload: payload.project,
          deferredPayloadKey: options.deferredPayloadKey || options.sheetPersistenceKey || tabId,
          unsaved: Boolean(payload.unsaved),
          source: options.source || 'working',
          updatedAt: payload.project?.updatedAt || new Date().toISOString(),
          sharedProjectKey: '',
          sharedProjectBackendId: '',
          sharedProjectRevision: 0,
          sharedProjectStructureRevision: 0,
          sharedRoleHint: '',
          sharedAutoJoin: false,
          deferredRestore: false,
          remoteUpdateAvailable: false,
          qrEditPayload: normalizeQrEditPayload(options.qrEditPayload, normalizedProjectId),
          projectSaveHandle,
          projectSaveHandleMeta,
          sourceProjectId: typeof options.sourceProjectId === 'string' && options.sourceProjectId ? options.sourceProjectId : null,
          sourceSheetId: typeof options.sourceSheetId === 'string' && options.sourceSheetId ? options.sourceSheetId : null,
          isImportedSheet: options.isImportedSheet === true,
          runtimeProjectId: typeof options.runtimeProjectId === 'string' && options.runtimeProjectId ? options.runtimeProjectId : `${tabId}:runtime-project`,
          sheetRuntimeId: typeof options.sheetRuntimeId === 'string' && options.sheetRuntimeId ? options.sheetRuntimeId : `${tabId}:runtime`,
          sheetPersistenceKey: typeof options.sheetPersistenceKey === 'string' && options.sheetPersistenceKey ? options.sheetPersistenceKey : `${tabId}:persistence`,
          historyOwnerId: typeof options.historyOwnerId === 'string' && options.historyOwnerId ? options.historyOwnerId : `${tabId}:history`,
          timelapseOwnerId: typeof options.timelapseOwnerId === 'string' && options.timelapseOwnerId ? options.timelapseOwnerId : `${tabId}:timelapse`,
          ...persistenceState,
        };
        const entrySignature = typeof createLocalProjectEntrySignature === 'function'
          ? createLocalProjectEntrySignature(recentProjectsCache.get(normalizedProjectId) || null)
          : null;
        return typeof createLightweightLocalProjectTabState === 'function'
          ? createLightweightLocalProjectTabState(localTab, entrySignature || {})
          : localTab;
      }
      const sharedEntry = isSharedRecentProjectEntry(recentProjectsCache.get(normalizedProjectId) || null)
        ? normalizeSharedRecentProjectEntry(recentProjectsCache.get(normalizedProjectId))
        : null;
      const activeSharedProjectKey = getActiveSharedProjectKey?.() || '';
      const activeSharedProjectId = getActiveSharedProjectId?.() || '';
      const activeSharedProjectRevision = getActiveSharedProjectRevision?.() || 0;
      const activeSharedProjectStructureRevision = getActiveSharedProjectStructureRevision?.() || 0;
      const activeSharedRecentProjectId = activeSharedProjectKey ? buildSharedRecentProjectId(activeSharedProjectKey) : '';
      const projectIdSharedKey = getSharedProjectKeyFromProjectId(normalizedProjectId);
      const activeSharedProjectAppliesToTab = Boolean(
        activeSharedRecentProjectId
        && normalizedProjectId === activeSharedRecentProjectId
      );
      const currentProjectIsShared = Boolean(
        normalizedProjectId.startsWith(SHARED_PROJECT_ID_PREFIX)
        || sharedEntry
        || activeSharedProjectAppliesToTab
      );
      const currentSharedProjectKey = currentProjectIsShared
        ? normalizeMultiProjectKey(
          options.sharedProjectKey
          || sharedEntry?.sharedProjectKey
          || projectIdSharedKey
          || (activeSharedProjectAppliesToTab ? activeSharedProjectKey : '')
          || ''
        )
        : '';
      return {
        id: options.tabId || createOpenProjectTabId(),
        projectId: normalizedProjectId,
        fileName,
        label: typeof options.label === 'string' && options.label.trim()
          ? options.label.trim()
          : extractDocumentBaseName(fileName),
        project: payload.project,
        deferredProjectPayload: payload.project,
        deferredPayloadKey: options.deferredPayloadKey || options.sheetPersistenceKey || tabId,
        unsaved: Boolean(payload.unsaved),
        source: options.source || (currentProjectIsShared ? 'shared' : 'working'),
        updatedAt: payload.project?.updatedAt || new Date().toISOString(),
        qrEditPayload: normalizeQrEditPayload(options.qrEditPayload, normalizedProjectId),
        projectSaveHandle,
        projectSaveHandleMeta,
        ...persistenceState,
        ...(currentProjectIsShared ? {
          sharedProjectKey: currentSharedProjectKey || getSharedProjectKeyFromProjectId(normalizedProjectId),
          sharedProjectBackendId: typeof options.sharedProjectBackendId === 'string'
            ? options.sharedProjectBackendId
            : (sharedEntry?.sharedProjectBackendId || (activeSharedProjectAppliesToTab ? activeSharedProjectId : '') || ''),
          sharedProjectRevision: Math.max(
            0,
            Math.round(Number(options.sharedProjectRevision) || 0),
            Math.round(Number(sharedEntry?.sharedProjectRevision) || 0),
            activeSharedProjectAppliesToTab ? Math.round(Number(activeSharedProjectRevision) || 0) : 0
          ),
          sharedProjectStructureRevision: Math.max(
            0,
            Math.round(Number(options.sharedProjectStructureRevision) || 0),
            Math.round(Number(sharedEntry?.sharedProjectStructureRevision) || 0),
            activeSharedProjectAppliesToTab ? Math.round(Number(activeSharedProjectStructureRevision) || 0) : 0
          ),
          sharedRoleHint: options.sharedRoleHint || sharedEntry?.sharedRoleHint || 'guest',
          sharedAutoJoin: options.sharedAutoJoin !== false && sharedEntry?.sharedAutoJoin !== false,
        } : {}),
      };
    }

    function createLocalOpenProjectTabFromCurrentState(currentTab = null, options = {}) {
      const payload = buildOpenProjectTabPayloadFromCurrentState();
      const normalizedProjectId = normalizeAutosaveProjectId(
        options.projectId
        || currentTab?.projectId
        || getAutosaveProjectId?.()
      ) || createAutosaveProjectId();
      const fileName = normalizeDocumentName(
        options.fileName
        || currentTab?.fileName
        || payload.fileName
        || DEFAULT_DOCUMENT_NAME
      );
      const persistenceState = resolveTabPersistenceState(options, currentTab, { createToken: true });
      const projectSaveHandle = resolveTabProjectSaveHandle(
        Object.prototype.hasOwnProperty.call(options, 'projectSaveHandle')
          ? options.projectSaveHandle
          : currentTab?.projectSaveHandle,
        currentTab?.projectSaveHandle || null
      );
      const projectSaveHandleMeta = resolveTabProjectSaveHandleMeta(
        Object.prototype.hasOwnProperty.call(options, 'projectSaveHandleMeta')
          ? options.projectSaveHandleMeta
          : currentTab?.projectSaveHandleMeta,
        currentTab?.projectSaveHandleMeta || null
      );
      const nextTab = {
        ...(currentTab && typeof currentTab === 'object' ? currentTab : {}),
        id: options.tabId || currentTab?.id || createOpenProjectTabId(),
        projectId: normalizedProjectId,
        fileName,
        label: typeof options.label === 'string' && options.label.trim()
          ? options.label.trim()
          : (currentTab?.label || extractDocumentBaseName(fileName)),
        project: payload.project,
        deferredProjectPayload: payload.project,
        deferredPayloadKey: currentTab?.deferredPayloadKey || currentTab?.sheetPersistenceKey || options.sheetPersistenceKey || currentTab?.id || '',
        unsaved: Boolean(payload.unsaved),
        source: options.source || currentTab?.source || 'working',
        updatedAt: payload.project?.updatedAt || new Date().toISOString(),
        sharedProjectKey: '',
        sharedProjectBackendId: '',
        sharedProjectRevision: 0,
        sharedProjectStructureRevision: 0,
        sharedRoleHint: '',
        sharedAutoJoin: false,
        deferredRestore: false,
        remoteUpdateAvailable: false,
        qrEditPayload: normalizeQrEditPayload(options.qrEditPayload || currentTab?.qrEditPayload, normalizedProjectId),
        projectSaveHandle,
        projectSaveHandleMeta,
        runtimeProjectId: currentTab?.runtimeProjectId || options.runtimeProjectId || `${currentTab?.id || 'sheet'}:runtime-project`,
        ...persistenceState,
      };
      const entrySignature = typeof createLocalProjectEntrySignature === 'function'
        ? createLocalProjectEntrySignature(recentProjectsCache.get(normalizedProjectId) || null)
        : null;
      return typeof createLightweightLocalProjectTabState === 'function'
        ? createLightweightLocalProjectTabState(nextTab, entrySignature || {})
        : nextTab;
    }

    function createOpenProjectSheetTabFromPackagedProject({
      id = '',
      project = null,
      projectId = '',
      fileName = DEFAULT_DOCUMENT_NAME,
      label = '',
      source = 'sheet',
      unsaved = false,
      updatedAt = '',
      qrEditPayload = null,
      sharedProjectKey = '',
      sharedProjectBackendId = '',
      sharedProjectRevision = 0,
      sharedProjectStructureRevision = 0,
      sharedRoleHint = '',
      sharedAutoJoin = false,
      sourceStorageAdapterId = null,
      sourceKind = 'unknown',
      sourceProjectToken = null,
      lastSavedStorageAdapterId = null,
      projectSaveHandleState = 'none',
      projectSaveHandle = null,
      projectSaveHandleMeta = null,
      sourceProjectId = null,
      sourceSheetId = null,
      isImportedSheet = false,
      runtimeProjectId = '',
      sheetRuntimeId = '',
      deferredPayloadKey = '',
      sheetPersistenceKey = '',
      localPersistenceKey = '',
      autosaveV2SheetId = '',
      historyOwnerId = '',
      timelapseOwnerId = '',
    } = {}) {
      if (!project || typeof project !== 'object') {
        return null;
      }
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || getAutosaveProjectId?.() || '') || createAutosaveProjectId();
      const normalizedSharedProjectKey = SHARED_PROJECTS_ENABLED
        ? (
          normalizeMultiProjectKey(sharedProjectKey || '')
          || getSharedProjectKeyFromProjectId(normalizedProjectId)
        )
        : '';
      const normalizedFileName = normalizeDocumentName(fileName || project?.documentName || project?.document?.documentName || DEFAULT_DOCUMENT_NAME);
      const persistenceState = resolveTabPersistenceState({
        sourceStorageAdapterId,
        sourceKind,
        sourceProjectToken,
        lastSavedStorageAdapterId,
        projectSaveHandleState,
      }, null, { createToken: true });
      const normalizedProjectSaveHandle = resolveTabProjectSaveHandle(projectSaveHandle, null);
      const normalizedProjectSaveHandleMeta = resolveTabProjectSaveHandleMeta(projectSaveHandleMeta, null);
      return {
        id: typeof id === 'string' && id ? id : createOpenProjectTabId(),
        projectId: normalizedProjectId,
        fileName: normalizedFileName,
        label: label || extractDocumentBaseName(normalizedFileName),
        project,
        deferredProjectPayload: project,
        deferredPayloadKey: deferredPayloadKey || sheetPersistenceKey || id || '',
        unsaved: Boolean(unsaved),
        source,
        updatedAt: updatedAt || project?.updatedAt || new Date().toISOString(),
        qrEditPayload: normalizeQrEditPayload(qrEditPayload, projectId || getAutosaveProjectId?.() || ''),
        projectSaveHandle: normalizedProjectSaveHandle,
        projectSaveHandleMeta: normalizedProjectSaveHandleMeta,
        sourceProjectId: typeof sourceProjectId === 'string' && sourceProjectId ? sourceProjectId : null,
        sourceSheetId: typeof sourceSheetId === 'string' && sourceSheetId ? sourceSheetId : null,
        isImportedSheet: isImportedSheet === true,
        runtimeProjectId: typeof runtimeProjectId === 'string' && runtimeProjectId ? runtimeProjectId : `${id || 'sheet'}:runtime-project`,
        sheetRuntimeId: typeof sheetRuntimeId === 'string' && sheetRuntimeId ? sheetRuntimeId : `${id || 'sheet'}:runtime`,
        sheetPersistenceKey: typeof sheetPersistenceKey === 'string' && sheetPersistenceKey ? sheetPersistenceKey : `${id || 'sheet'}:persistence`,
        localPersistenceKey: typeof localPersistenceKey === 'string' && localPersistenceKey ? localPersistenceKey : `${id || 'sheet'}:local`,
        autosaveV2SheetId: typeof autosaveV2SheetId === 'string' && autosaveV2SheetId ? autosaveV2SheetId : `${id || 'sheet'}:autosave-v2`,
        historyOwnerId: typeof historyOwnerId === 'string' && historyOwnerId ? historyOwnerId : `${id || 'sheet'}:history`,
        timelapseOwnerId: typeof timelapseOwnerId === 'string' && timelapseOwnerId ? timelapseOwnerId : `${id || 'sheet'}:timelapse`,
        ...persistenceState,
        ...(normalizedSharedProjectKey ? {
          sharedProjectKey: normalizedSharedProjectKey,
          sharedProjectBackendId: typeof sharedProjectBackendId === 'string' ? sharedProjectBackendId.trim() : '',
          sharedProjectRevision: Math.max(0, Math.round(Number(sharedProjectRevision) || 0)),
          sharedProjectStructureRevision: Math.max(0, Math.round(Number(sharedProjectStructureRevision) || 0)),
          sharedRoleHint: sharedRoleHint || 'guest',
          sharedAutoJoin: sharedAutoJoin !== false,
        } : {}),
      };
    }

    function normalizePackagedProjectSheets(sheets = [], activeSheetId = '') {
      if (!Array.isArray(sheets)) {
        return [];
      }
      const normalized = [];
      const seenIds = new Set();
      for (const sheet of sheets) {
        if (!sheet || typeof sheet !== 'object' || !sheet.project || typeof sheet.project !== 'object') {
          continue;
        }
        const id = typeof sheet.id === 'string' && sheet.id ? sheet.id : createOpenProjectTabId();
        const uniqueId = seenIds.has(id) ? createOpenProjectTabId() : id;
        seenIds.add(uniqueId);
        const fileName = normalizeDocumentName(sheet.fileName || sheet.name || sheet.project?.documentName || sheet.project?.document?.documentName || DEFAULT_DOCUMENT_NAME);
        const sheetSharedProjectKey = SHARED_PROJECTS_ENABLED
          ? normalizeMultiProjectKey(sheet.sharedProjectKey || '')
          : '';
        const persistenceState = resolveTabPersistenceState(sheet, null, { createToken: true });
        const projectSaveHandle = resolveTabProjectSaveHandle(sheet.projectSaveHandle, null);
        const projectSaveHandleMeta = resolveTabProjectSaveHandleMeta(sheet.projectSaveHandleMeta, null);
        normalized.push({
          id: uniqueId,
          fileName,
          label: typeof sheet.label === 'string' && sheet.label ? sheet.label : localizeText(`シート ${normalized.length + 1}`, `Sheet ${normalized.length + 1}`),
          project: sheet.project,
          deferredProjectPayload: sheet.project,
          deferredPayloadKey: typeof sheet.deferredPayloadKey === 'string' && sheet.deferredPayloadKey
            ? sheet.deferredPayloadKey
            : (typeof sheet.sheetPersistenceKey === 'string' && sheet.sheetPersistenceKey ? sheet.sheetPersistenceKey : uniqueId),
          unsaved: Boolean(sheet.unsaved),
          source: typeof sheet.source === 'string' && sheet.source ? sheet.source : 'sheet',
          updatedAt: sheet.updatedAt || sheet.project?.updatedAt || new Date().toISOString(),
          qrEditPayload: normalizeQrEditPayload(sheet.qrEditPayload, getAutosaveProjectId?.() || ''),
          projectSaveHandle,
          projectSaveHandleMeta,
          sourceProjectId: typeof sheet.sourceProjectId === 'string' && sheet.sourceProjectId ? sheet.sourceProjectId : null,
          sourceSheetId: typeof sheet.sourceSheetId === 'string' && sheet.sourceSheetId ? sheet.sourceSheetId : null,
          isImportedSheet: sheet.isImportedSheet === true,
          runtimeProjectId: typeof sheet.runtimeProjectId === 'string' && sheet.runtimeProjectId ? sheet.runtimeProjectId : `${uniqueId}:runtime-project`,
          sheetRuntimeId: typeof sheet.sheetRuntimeId === 'string' && sheet.sheetRuntimeId ? sheet.sheetRuntimeId : `${uniqueId}:runtime`,
          sheetPersistenceKey: typeof sheet.sheetPersistenceKey === 'string' && sheet.sheetPersistenceKey ? sheet.sheetPersistenceKey : `${uniqueId}:persistence`,
          localPersistenceKey: typeof sheet.localPersistenceKey === 'string' && sheet.localPersistenceKey ? sheet.localPersistenceKey : `${uniqueId}:local`,
          autosaveV2SheetId: typeof sheet.autosaveV2SheetId === 'string' && sheet.autosaveV2SheetId ? sheet.autosaveV2SheetId : `${uniqueId}:autosave-v2`,
          historyOwnerId: typeof sheet.historyOwnerId === 'string' && sheet.historyOwnerId ? sheet.historyOwnerId : `${uniqueId}:history`,
          timelapseOwnerId: typeof sheet.timelapseOwnerId === 'string' && sheet.timelapseOwnerId ? sheet.timelapseOwnerId : `${uniqueId}:timelapse`,
          ...persistenceState,
          ...(sheetSharedProjectKey ? {
            sharedProjectKey: sheetSharedProjectKey,
            sharedProjectBackendId: typeof sheet.sharedProjectBackendId === 'string' ? sheet.sharedProjectBackendId.trim() : '',
            sharedProjectRevision: Math.max(0, Math.round(Number(sheet.sharedProjectRevision) || 0)),
            sharedProjectStructureRevision: Math.max(0, Math.round(Number(sheet.sharedProjectStructureRevision) || 0)),
            sharedRoleHint: sheet.sharedRoleHint || '',
            sharedAutoJoin: sheet.sharedAutoJoin !== false,
          } : {}),
        });
      }
      if (!normalized.length) {
        return [];
      }
      const hasActive = activeSheetId && normalized.some(sheet => sheet.id === activeSheetId);
      if (!hasActive) {
        normalized[0].active = true;
      }
      return normalized;
    }

    return {
      createOpenProjectTabFromCurrentState,
      createLocalOpenProjectTabFromCurrentState,
      createOpenProjectSheetTabFromPackagedProject,
      normalizePackagedProjectSheets,
      getProjectPersistenceStateFromTab,
    };
  }

  root.openProjectTabModel = {
    createOpenProjectTabModel,
  };
})();
