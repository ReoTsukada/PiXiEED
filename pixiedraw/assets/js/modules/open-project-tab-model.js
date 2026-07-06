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
    normalizeQrEditPayload,
    localizeText,
    MAX_PROJECT_SHEETS,
  } = {}) {
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
      const fileName = normalizeDocumentName(options.fileName || payload.fileName || DEFAULT_DOCUMENT_NAME);
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
        unsaved: Boolean(payload.unsaved),
        source: options.source || (currentProjectIsShared ? 'shared' : 'working'),
        updatedAt: payload.project?.updatedAt || new Date().toISOString(),
        qrEditPayload: normalizeQrEditPayload(options.qrEditPayload, normalizedProjectId),
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
      return {
        ...(currentTab && typeof currentTab === 'object' ? currentTab : {}),
        id: options.tabId || currentTab?.id || createOpenProjectTabId(),
        projectId: normalizedProjectId,
        fileName,
        label: typeof options.label === 'string' && options.label.trim()
          ? options.label.trim()
          : (currentTab?.label || extractDocumentBaseName(fileName)),
        project: payload.project,
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
      };
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
      return {
        id: typeof id === 'string' && id ? id : createOpenProjectTabId(),
        projectId: normalizedProjectId,
        fileName: normalizedFileName,
        label: label || extractDocumentBaseName(normalizedFileName),
        project,
        unsaved: Boolean(unsaved),
        source,
        updatedAt: updatedAt || project?.updatedAt || new Date().toISOString(),
        qrEditPayload: normalizeQrEditPayload(qrEditPayload, projectId || getAutosaveProjectId?.() || ''),
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
        normalized.push({
          id: uniqueId,
          fileName,
          label: typeof sheet.label === 'string' && sheet.label ? sheet.label : localizeText(`シート ${normalized.length + 1}`, `Sheet ${normalized.length + 1}`),
          project: sheet.project,
          unsaved: Boolean(sheet.unsaved),
          source: typeof sheet.source === 'string' && sheet.source ? sheet.source : 'sheet',
          updatedAt: sheet.updatedAt || sheet.project?.updatedAt || new Date().toISOString(),
          qrEditPayload: normalizeQrEditPayload(sheet.qrEditPayload, getAutosaveProjectId?.() || ''),
          ...(sheetSharedProjectKey ? {
            sharedProjectKey: sheetSharedProjectKey,
            sharedProjectBackendId: typeof sheet.sharedProjectBackendId === 'string' ? sheet.sharedProjectBackendId.trim() : '',
            sharedProjectRevision: Math.max(0, Math.round(Number(sheet.sharedProjectRevision) || 0)),
            sharedProjectStructureRevision: Math.max(0, Math.round(Number(sheet.sharedProjectStructureRevision) || 0)),
            sharedRoleHint: sheet.sharedRoleHint || '',
            sharedAutoJoin: sheet.sharedAutoJoin !== false,
          } : {}),
        });
        if (normalized.length >= MAX_PROJECT_SHEETS) {
          break;
        }
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
    };
  }

  root.openProjectTabModel = {
    createOpenProjectTabModel,
  };
})();
