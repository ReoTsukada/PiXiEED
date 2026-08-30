(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createReloadSessionWorkflowUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function buildReloadSnapshotPayload(maxHistoryItems = 0) {
    const rawCurrentSnapshot = makeHistorySnapshot({ clonePixelData: false });
    const currentSnapshot = compressHistorySnapshot(rawCurrentSnapshot);
    const projectSession = buildAutosaveSessionPayload();
    const packagedProject = buildPackagedProjectPayload(rawCurrentSnapshot, { session: projectSession });
    const activeProjectTab = getActiveOpenProjectTab();
    const activeProjectId = normalizeAutosaveProjectId(activeProjectTab?.projectId || '');
    const activeSharedEntry = isCurrentProjectSharedEntry()
      ? getCurrentSharedRecentProjectEntry()
      : null;
    const normalizedHistoryLimit = normalizeProjectHistoryLimit(history.limit, DEFAULT_HISTORY_LIMIT);
    // Undo/Redo is limited to the uninterrupted page session. Reload recovery
    // restores the current document only, keeping the payload substantially
    // smaller and avoiding stale history across a new page instance.
    const past = [];
    const future = [];
    return {
      version: RELOAD_SNAPSHOT_VERSION,
      at: Date.now(),
      projectId: activeProjectId || normalizeAutosaveProjectId(autosaveProjectId || ''),
      sharedProjectKey: activeSharedProjectKey || normalizeMultiProjectKey(activeSharedEntry?.sharedProjectKey || ''),
      sharedProjectRevision: Math.max(
        0,
        Math.round(
          Number(
            activeSharedProjectKey
              ? activeSharedProjectRevision
              : activeSharedEntry?.sharedProjectRevision
          ) || 0
        )
      ),
      sharedProjectStructureRevision: Math.max(
        0,
        Math.round(
          Number(
            activeSharedProjectKey
              ? activeSharedProjectStructureRevision
              : activeSharedEntry?.sharedProjectStructureRevision
          ) || 0
        )
      ),
      current: currentSnapshot,
      project: packagedProject,
      past,
      future,
      historyLimit: normalizedHistoryLimit,
      unsaved: hasDocumentUnsavedChanges(),
    };
  }

  let reloadSnapshotUtilsCache = null;
  function getReloadSnapshotUtils() {
    if (!reloadSnapshotUtilsCache) {
      reloadSnapshotUtilsCache = window.PiXiEEDrawModules?.reloadSnapshotUtils?.createReloadSnapshotUtils?.({
        encodeTypedArray,
        decodeBase64,
        textCompression,
        RELOAD_SNAPSHOT_COMPRESS_THRESHOLD,
        decompressHistorySnapshot,
        normalizeProjectHistoryLimit,
        DEFAULT_HISTORY_LIMIT,
      }) || {};
    }
    return reloadSnapshotUtilsCache;
  }
  function serializeReloadSnapshotValue(...args) {
    return getReloadSnapshotUtils().serializeReloadSnapshotValue(...args);
  }
  function deserializeReloadSnapshotValue(...args) {
    return getReloadSnapshotUtils().deserializeReloadSnapshotValue(...args);
  }
  function encodeReloadSnapshotPayload(...args) {
    return getReloadSnapshotUtils().encodeReloadSnapshotPayload(...args);
  }
  function decodeReloadSnapshotPayload(...args) {
    return getReloadSnapshotUtils().decodeReloadSnapshotPayload(...args);
  }
  function normalizeReloadHistoryList(...args) {
    return getReloadSnapshotUtils().normalizeReloadHistoryList(...args);
  }

  function isTinyStartupSnapshot(snapshot) {
    const width = Math.round(Number(snapshot?.width) || 0);
    const height = Math.round(Number(snapshot?.height) || 0);
    return width <= 1 && height <= 1;
  }

  function persistReloadSessionSnapshot() {
    if (!RELOAD_SNAPSHOT_ENABLED) {
      return;
    }
    if (!canUseSessionStorage) {
      return;
    }
    if ((multiState.connected || multiState.connecting) && !activeSharedProjectKey) {
      return;
    }
    if (!Array.isArray(state.frames) || !state.frames.length) {
      return;
    }
    if (isCurrentProjectSharedEntry()) {
      persistReloadTargetProjectId();
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_STORAGE_KEY);
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY);
      return;
    }
    if (isLargeDocumentPerformanceMode()) {
      persistReloadTargetProjectId();
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_STORAGE_KEY);
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY);
      return;
    }
    const maxAvailable = Math.max(
      Array.isArray(history.past) ? history.past.length : 0,
      Array.isArray(history.future) ? history.future.length : 0
    );
    let maxItems = Math.min(
      RELOAD_SNAPSHOT_MAX_HISTORY_ITEMS,
      normalizeProjectHistoryLimit(history.limit, DEFAULT_HISTORY_LIMIT),
      maxAvailable
    );
    let attempt = 0;
    while (attempt < 8) {
      const payload = buildReloadSnapshotPayload(maxItems);
      const encoded = encodeReloadSnapshotPayload(payload);
      if (!encoded) {
        break;
      }
      try {
        writeSessionStorageForLocalRestore(RELOAD_SNAPSHOT_STORAGE_KEY, encoded);
        writeLocalStorageForLocalRestore(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY, encoded);
        return;
      } catch (error) {
        try {
          writeLocalStorageForLocalRestore(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY, encoded);
          return;
        } catch (fallbackError) {
          // Continue trimming history below.
        }
        if (maxItems <= 0) {
          break;
        }
        maxItems = Math.max(0, Math.floor(maxItems / 2));
      }
      attempt += 1;
    }
    clearLocalRestoreStorage(RELOAD_SNAPSHOT_STORAGE_KEY);
    clearLocalRestoreStorage(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY);
  }

  function persistReloadProjectFallback() {
    if (!canUseSessionStorage) {
      return;
    }
    if (isCurrentProjectSharedEntry()) {
      persistReloadTargetProjectId();
      clearLocalRestoreStorage(RELOAD_PROJECT_FALLBACK_STORAGE_KEY);
      return;
    }
    if (isLargeDocumentPerformanceMode()) {
      persistReloadTargetProjectId();
      clearLocalRestoreStorage(RELOAD_PROJECT_FALLBACK_STORAGE_KEY);
      return;
    }
    try {
      const snapshot = makeHistorySnapshot({ clonePixelData: false });
      const packaged = buildPackagedProjectPayload(snapshot, { session: buildAutosaveSessionPayload() });
      const activeProjectTab = getActiveOpenProjectTab();
      const projectId = normalizeAutosaveProjectId(
        activeProjectTab?.projectId || autosaveProjectId || readReloadTargetProjectId() || ''
      );
      const serialized = JSON.stringify({
        version: 1,
        projectId,
        project: packaged,
      });
      if (!serialized) {
        return;
      }
      writeSessionStorageForLocalRestore(RELOAD_PROJECT_FALLBACK_STORAGE_KEY, serialized);
      writeLocalStorageForLocalRestore(RELOAD_PROJECT_FALLBACK_STORAGE_KEY, serialized);
    } catch (error) {
      // Ignore fallback persistence failures.
    }
  }

  function persistReloadTargetProjectId() {
    if (!canUseSessionStorage) {
      return;
    }
    const activeProjectTab = getActiveOpenProjectTab();
    const activeProjectId = normalizeAutosaveProjectId(
      activeProjectTab?.projectId || autosaveProjectId || ''
    );
    if (!activeProjectId) {
      return;
    }
    try {
      writeSessionStorageForLocalRestore(RELOAD_TARGET_PROJECT_ID_KEY, activeProjectId);
      writeLocalStorageForLocalRestore(RELOAD_TARGET_PROJECT_ID_KEY, activeProjectId);
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function readReloadTargetProjectId() {
    if (!canUseSessionStorage) {
      return '';
    }
    try {
      return normalizeAutosaveProjectId(
        readSessionStorageForLocalRestore(RELOAD_TARGET_PROJECT_ID_KEY)
        || readLocalStorageForLocalRestore(RELOAD_TARGET_PROJECT_ID_KEY)
        || ''
      );
    } catch (error) {
      return '';
    }
  }

  function clearReloadTargetProjectId() {
    if (!canUseSessionStorage) {
      return;
    }
    clearLocalRestoreStorage(RELOAD_TARGET_PROJECT_ID_KEY);
  }

  function restoreReloadProjectFallback() {
    if (!canUseSessionStorage) {
      return false;
    }
    if (readMultiInviteFromUrl()) {
      return false;
    }
    let raw = '';
    try {
      raw = readSessionStorageForLocalRestore(RELOAD_PROJECT_FALLBACK_STORAGE_KEY) || '';
    } catch (error) {
      raw = '';
    }
    if (!raw) {
      try {
        raw = readLocalStorageForLocalRestore(RELOAD_PROJECT_FALLBACK_STORAGE_KEY) || '';
      } catch (error) {
        raw = '';
      }
    }
    if (!raw) {
      return false;
    }
    try {
      let wrappedProjectId = '';
      let documentText = raw;
      try {
        const parsedWrapper = JSON.parse(raw);
        if (parsedWrapper && typeof parsedWrapper === 'object' && parsedWrapper.project && typeof parsedWrapper.project === 'object') {
          wrappedProjectId = normalizeAutosaveProjectId(parsedWrapper.projectId || '');
          documentText = JSON.stringify(parsedWrapper.project);
        }
      } catch (error) {
        // Fallback to legacy raw packaged project payload.
      }
      const parsedDocument = snapshotFromDocumentText(documentText);
      const snapshot = parsedDocument?.snapshot || null;
      if (!snapshot || isTinyStartupSnapshot(snapshot)) {
        return false;
      }
      // Only apply the restored snapshot immediately if it is intended for the
      // currently-active project/tab. If the restored project targets a
      // different project ID (e.g. another tab/window), create a deferred tab
      // so the user can switch to it explicitly instead of being overwritten.
      const restoredProjectId = normalizeAutosaveProjectId(
        wrappedProjectId || readReloadTargetProjectId() || autosaveProjectId || ''
      );
      const activeTab = getActiveOpenProjectTab();
      const activeTabProjectId = normalizeAutosaveProjectId(activeTab?.projectId || autosaveProjectId || '');
      if (restoredProjectId && activeTabProjectId && restoredProjectId !== activeTabProjectId) {
        try {
          const existingRestoreTabIndex = findOpenProjectTabIndexByProjectId(restoredProjectId);
          if (existingRestoreTabIndex >= 0) {
            startupAutosaveRestoreProjectId = restoredProjectId;
            renderOpenProjectTabs();
            return true;
          }
          // Build a packaged project payload for storing in a deferred tab.
          const packaged = buildPackagedProjectPayload(snapshot, { session: buildAutosaveSessionPayload() });
          const fileName = normalizeDocumentName(snapshot.documentName || `${extractDocumentBaseName(packaged?.name || '') || DEFAULT_DOCUMENT_BASENAME}${PROJECT_FILE_EXTENSION}`);
          const tab = {
            id: createOpenProjectTabId(),
            projectId: restoredProjectId,
            fileName,
            label: extractDocumentBaseName(fileName),
            project: packaged,
            unsaved: true,
            source: 'restore',
            updatedAt: packaged?.updatedAt || new Date().toISOString(),
            deferredRestore: true,
            remoteUpdateAvailable: true,
          };
          // Append without activating so user isn't disrupted.
          openProjectTabs.push(tab);
          renderOpenProjectTabs();
          // Keep a marker so other logic can detect a pending startup restore.
          startupAutosaveRestoreProjectId = restoredProjectId;
        } catch (error) {
          // If packaging fails, fall back to applying the snapshot to avoid
          // leaving the user with no state.
          console.warn('Failed to defer restore into a tab, applying snapshot instead', error);
          applyHistorySnapshot(snapshot);
          if (restoredProjectId) {
            startupAutosaveRestoreProjectId = restoredProjectId;
            setActiveAutosaveProjectId(restoredProjectId, { persist: false });
          }
        }
      } else {
        // Safe to apply directly to the current document.
        applyHistorySnapshot(snapshot);
        if (restoredProjectId) {
          startupAutosaveRestoreProjectId = restoredProjectId;
          setActiveAutosaveProjectId(restoredProjectId, {
            persist: false,
            resetHistorySession: true,
          });
        }
        if (parsedDocument?.sheets?.length) {
          Promise.resolve(restoreOpenProjectSheetsFromParsedDocument(parsedDocument, {
            projectId: restoredProjectId || autosaveProjectId,
            source: 'sheet',
          })).catch(error => console.warn('Failed to split restored legacy multi-project package', error));
        }
      }
      history.pending = null;
      history.past = [];
      history.future = [];
      resetDocumentUnsavedChanges();
      updateHistoryButtons();
      markAutosaveDirty();
      return true;
    } catch (error) {
      return false;
    } finally {
        clearLocalRestoreStorage(RELOAD_PROJECT_FALLBACK_STORAGE_KEY);
    }
  }

  function readReloadSessionSnapshotPayload() {
    if (!canUseSessionStorage) {
      return null;
    }
    if (isLargeDocumentPerformanceMode()) {
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_STORAGE_KEY);
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY);
      return null;
    }
    try {
      const multiResumeRaw = window.sessionStorage.getItem(getScopedStorageKey(MULTI_RESUME_STORAGE_KEY));
      if (typeof multiResumeRaw === 'string' && multiResumeRaw.length) {
        return null;
      }
    } catch (error) {
      return null;
    }
    let raw = '';
    try {
      raw = readSessionStorageForLocalRestore(RELOAD_SNAPSHOT_STORAGE_KEY) || '';
    } catch (error) {
      raw = '';
    }
    if (!raw) {
      try {
        raw = readLocalStorageForLocalRestore(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY) || '';
      } catch (error) {
        raw = '';
      }
    }
    if (!raw) {
      return null;
    }
    if (raw.length > RELOAD_SNAPSHOT_MAX_SYNC_CHARS) {
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_STORAGE_KEY);
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY);
      return null;
    }
    const parsed = decodeReloadSnapshotPayload(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const timestamp = Number(parsed.at);
    const age = Date.now() - timestamp;
    if (!Number.isFinite(timestamp) || age < 0 || age > RELOAD_SNAPSHOT_MAX_AGE_MS) {
      return null;
    }
    const currentCompressed = parsed.current;
    if (!currentCompressed || typeof currentCompressed !== 'object') {
      return null;
    }
    let currentSnapshot = null;
    try {
      currentSnapshot = decompressHistorySnapshot(currentCompressed);
    } catch (error) {
      return null;
    }
    if (!currentSnapshot || !Array.isArray(currentSnapshot.frames) || !currentSnapshot.frames.length) {
      return null;
    }
    const historyLimit = normalizeProjectHistoryLimit(parsed.historyLimit, DEFAULT_HISTORY_LIMIT);
    const past = normalizeReloadHistoryList(parsed.past, historyLimit);
    const future = normalizeReloadHistoryList(parsed.future, historyLimit);
    return {
      at: timestamp,
      projectId: normalizeAutosaveProjectId(parsed.projectId || ''),
      sharedProjectKey: normalizeMultiProjectKey(parsed.sharedProjectKey || ''),
      sharedProjectRevision: Math.max(0, Math.round(Number(parsed.sharedProjectRevision) || 0)),
      sharedProjectStructureRevision: Math.max(0, Math.round(Number(parsed.sharedProjectStructureRevision) || 0)),
      currentSnapshot,
      project: parsed.project && typeof parsed.project === 'object' ? parsed.project : null,
      past,
      future,
      historyLimit,
      unsaved: Boolean(parsed.unsaved),
    };
  }

  function clearReloadRecoveryData() {
    clearLocalRestoreStorage(RELOAD_SNAPSHOT_STORAGE_KEY);
    clearLocalRestoreStorage(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY);
    clearLocalRestoreStorage(RELOAD_PROJECT_FALLBACK_STORAGE_KEY);
    clearReloadTargetProjectId();
  }

  function restoreReloadSessionSnapshot() {
    if (!RELOAD_SNAPSHOT_ENABLED) {
      return false;
    }
    if (reloadSnapshotRestored) {
      return false;
    }
    if (readMultiInviteFromUrl()) {
      return false;
    }
    const payload = readReloadSessionSnapshotPayload();
    if (!payload) {
      const restoredFromFallback = restoreReloadProjectFallback();
      if (restoredFromFallback) {
        reloadSnapshotRestored = true;
        updateAutosaveStatus('再読み込み復元: 直前のプロジェクトを復元しました', 'success');
        return true;
      }
      return false;
    }
    if (isTinyStartupSnapshot(payload.currentSnapshot)) {
      return false;
    }
    if (!payload.project || typeof payload.project !== 'object') {
      const restoredFromFallback = restoreReloadProjectFallback();
      if (restoredFromFallback) {
        reloadSnapshotRestored = true;
        updateAutosaveStatus('再読み込み復元: 直前のプロジェクトを復元しました', 'success');
        return true;
      }
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_STORAGE_KEY);
      clearLocalRestoreStorage(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY);
      return false;
    }
    reloadSnapshotRestored = true;
    let parsedProjectDocument = null;
    if (payload.project && typeof payload.project === 'object') {
      try {
        parsedProjectDocument = snapshotFromParsedDocumentValue(payload.project);
      } catch (error) {
        parsedProjectDocument = null;
      }
    }
    applyHistorySnapshot(payload.currentSnapshot);
    history.limit = payload.historyLimit;
    history.past = [];
    history.future = [];
    history.pending = null;
    trimHistoryStacksToLimit();
    if (payload.unsaved) {
      markDocumentUnsavedChange();
    } else {
      resetDocumentUnsavedChanges();
    }
    const restoredProjectId = normalizeAutosaveProjectId(payload.projectId || '');
    const restoredSharedProjectKey = normalizeMultiProjectKey(payload.sharedProjectKey || '');
    const restoredSharedProjectRevision = Math.max(0, Math.round(Number(payload.sharedProjectRevision) || 0));
    const restoredSharedStructureRevision = Math.max(0, Math.round(Number(payload.sharedProjectStructureRevision) || 0));
    const resolvedProjectId = normalizeAutosaveProjectId(
      restoredProjectId || readReloadTargetProjectId() || autosaveProjectId || ''
    );
    const resolvedSharedProjectId = restoredSharedProjectKey
      ? buildSharedRecentProjectId(restoredSharedProjectKey)
      : '';
    const startupProjectId = resolvedSharedProjectId || resolvedProjectId;
    if (startupProjectId) {
      startupAutosaveRestoreProjectId = startupProjectId;
      setActiveAutosaveProjectId(startupProjectId, {
        persist: false,
        resetHistorySession: true,
      });
    }
    if (parsedProjectDocument?.sheets?.length) {
      Promise.resolve(restoreOpenProjectSheetsFromParsedDocument(parsedProjectDocument, {
        projectId: startupProjectId || autosaveProjectId,
        source: restoredSharedProjectKey ? 'shared-sheet' : 'sheet',
      })).catch(error => console.warn('Failed to split restored legacy multi-project package', error));
    }
    if (restoredSharedProjectKey) {
      startupSharedReloadProjectKey = restoredSharedProjectKey;
      startupSharedReloadRevision = restoredSharedProjectRevision;
      startupSharedReloadStructureRevision = restoredSharedStructureRevision;
      activeSharedProjectDocumentLoaded = false;
      setActiveSharedProjectSession(
        restoredSharedProjectKey,
        restoredSharedProjectRevision,
        restoredSharedStructureRevision,
        ''
      );
      setActiveSharedProjectSnapshotState(restoredSharedProjectRevision, {
        structureRevision: restoredSharedStructureRevision,
        synced: false,
        canonicalLoadedAt: 0,
      });
      activeSharedProjectSynced = false;
      setActiveSharedProjectSyncState('catching-up');
      setMultiStatus(
        localizeText('共有モード: サーバーの最新状態を確認中…', 'Shared mode: verifying the latest server state...'),
        'info'
      );
    } else {
      startupSharedReloadProjectKey = '';
      startupSharedReloadRevision = 0;
      startupSharedReloadStructureRevision = 0;
    }
    clearLocalRestoreStorage(RELOAD_SNAPSHOT_STORAGE_KEY);
    clearLocalRestoreStorage(RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY);
    updateHistoryButtons();
    markAutosaveDirty();
    if (parsedProjectDocument?.sheets?.length) {
      scheduleAutosaveSnapshot();
    }
    updateAutosaveStatus('再読み込み復元: 直前の作業状態を復元しました', 'success');
    return true;
  }

  return Object.freeze({
    buildReloadSnapshotPayload,
    isTinyStartupSnapshot,
    persistReloadSessionSnapshot,
    persistReloadProjectFallback,
    persistReloadTargetProjectId,
    readReloadTargetProjectId,
    clearReloadTargetProjectId,
    restoreReloadProjectFallback,
    readReloadSessionSnapshotPayload,
    clearReloadRecoveryData,
    restoreReloadSessionSnapshot,
  });
      }
    })(scope);
  }

  root.reloadSessionWorkflowUtils = Object.freeze({
    createReloadSessionWorkflowUtils,
  });
})();
