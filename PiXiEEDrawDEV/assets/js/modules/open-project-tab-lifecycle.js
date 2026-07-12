(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createOpenProjectTabLifecycle({
    dom,
    openProjectTabs,
    recentProjectsCache,
    SHARED_PROJECTS_ENABLED,
    AUTOSAVE_SUPPORTED,
    getActiveOpenProjectTabId,
    setActiveOpenProjectTabId,
    getSuppressOpenProjectTabAutoInitialize,
    setSuppressOpenProjectTabAutoInitialize,
    getProjectHomeVisible,
    setProjectHomeVisibleState,
    getStartupAutosaveRestoreProjectId,
    getAutosaveProjectId,
    getOpenProjectTabBusy,
    getStartupVisible,
    getActiveSharedProjectKey,
    findOpenProjectTabIndex,
    findOpenProjectTabIndexByProjectId,
    renderOpenProjectTabs,
    normalizeAutosaveProjectId,
    readReloadTargetProjectId,
    setActiveAutosaveProjectId,
    createAutosaveProjectId,
    createOpenProjectTabFromCurrentState,
    createLocalOpenProjectTabFromCurrentState,
    isSharedOpenProjectTab,
    getActiveOpenProjectTab,
    normalizeProjectSaveHandleMeta,
    normalizeProjectSaveHandleState,
    normalizeProjectStorageAdapterId,
    hasDocumentUnsavedChanges,
    writeAutosaveSnapshot,
    updateAutosaveStatus,
    localizeText,
    hideStartupScreen,
    updateQrEditPanel,
    syncQrEditModeWithActivePayload,
    scheduleRecentProjectsListRender,
    refreshRecentProjectsUI,
    maybePromptAndTransferRecentProjectsFromHome,
    clearActiveSharedProjectSession,
    makeHistorySnapshot,
    buildProjectSessionPayload,
    buildPackagedProjectPayload,
  } = {}) {
    function normalizeBindingHandleState(value, fallback = 'none') {
      if (typeof normalizeProjectSaveHandleState === 'function') {
        return normalizeProjectSaveHandleState(value, fallback);
      }
      const normalized = typeof value === 'string' ? value.trim() : '';
      const allowed = new Set(['none', 'bound', 'unknown', 'conversion-required', 'stale', 'unavailable']);
      if (allowed.has(normalized)) {
        return normalized;
      }
      return allowed.has(fallback) ? fallback : 'none';
    }

    function normalizeBindingAdapterId(value) {
      if (typeof normalizeProjectStorageAdapterId === 'function') {
        return normalizeProjectStorageAdapterId(value);
      }
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    }

    function normalizeBindingMeta(value = null, fallback = null, tab = null) {
      if (typeof normalizeProjectSaveHandleMeta === 'function') {
        return normalizeProjectSaveHandleMeta(value, fallback, tab);
      }
      const next = value && typeof value === 'object' ? value : {};
      const base = fallback && typeof fallback === 'object' ? fallback : {};
      const fileName = typeof next.fileName === 'string' && next.fileName.trim()
        ? next.fileName.trim()
        : (typeof base.fileName === 'string' && base.fileName.trim()
          ? base.fileName.trim()
          : (typeof tab?.fileName === 'string' && tab.fileName.trim() ? tab.fileName.trim() : ''));
      const adapterId = normalizeBindingAdapterId(
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

    function getProjectSaveBindingFromTab(tab = null) {
      if (!tab || typeof tab !== 'object') {
        return {
          projectSaveHandle: null,
          projectSaveHandleMeta: null,
          projectSaveHandleState: 'none',
        };
      }
      return {
        projectSaveHandle: tab.projectSaveHandle && typeof tab.projectSaveHandle === 'object'
          ? tab.projectSaveHandle
          : null,
        projectSaveHandleMeta: normalizeBindingMeta(tab.projectSaveHandleMeta, null, tab),
        projectSaveHandleState: normalizeBindingHandleState(tab.projectSaveHandleState, 'none'),
      };
    }

    function getActiveProjectSaveBinding() {
      return getProjectSaveBindingFromTab(getActiveOpenProjectTab?.() || null);
    }

    function updateOpenProjectTabSaveBinding(tabId, binding = null, options = {}) {
      const normalizedTabId = typeof tabId === 'string' ? tabId.trim() : '';
      if (!normalizedTabId) {
        return null;
      }
      const index = findOpenProjectTabIndex(normalizedTabId);
      if (index < 0 || !openProjectTabs[index]) {
        return null;
      }
      const current = openProjectTabs[index];
      const nextBinding = binding && typeof binding === 'object' ? binding : {};
      const nextHandle = Object.prototype.hasOwnProperty.call(nextBinding, 'projectSaveHandle')
        ? (nextBinding.projectSaveHandle && typeof nextBinding.projectSaveHandle === 'object' ? nextBinding.projectSaveHandle : null)
        : (current.projectSaveHandle && typeof current.projectSaveHandle === 'object' ? current.projectSaveHandle : null);
      const nextMeta = normalizeBindingMeta(
        Object.prototype.hasOwnProperty.call(nextBinding, 'projectSaveHandleMeta')
          ? nextBinding.projectSaveHandleMeta
          : current.projectSaveHandleMeta,
        current.projectSaveHandleMeta,
        current
      );
      const nextState = normalizeBindingHandleState(
        Object.prototype.hasOwnProperty.call(nextBinding, 'projectSaveHandleState')
          ? nextBinding.projectSaveHandleState
          : current.projectSaveHandleState,
        'none'
      );
      openProjectTabs[index] = {
        ...current,
        projectSaveHandle: nextHandle,
        projectSaveHandleMeta: nextMeta,
        projectSaveHandleState: nextState,
      };
      if (options?.render !== false) {
        renderOpenProjectTabs?.();
      }
      if (options?.log !== false) {
        console.info('[project-save-handle-debug]', {
          activeTabId: getActiveOpenProjectTabId?.() || '',
          tabId: normalizedTabId,
          projectSaveHandleState: nextState,
          handleBound: Boolean(nextHandle),
          fileName: nextMeta?.fileName || '',
          adapterId: nextMeta?.adapterId || '',
          handleKind: nextMeta?.handleKind || '',
          permissionState: nextMeta?.permissionState || '',
        });
      }
      return getProjectSaveBindingFromTab(openProjectTabs[index]);
    }

    function bindOpenProjectTabSaveHandle(tabId, handle, meta = null, options = {}) {
      const normalizedTabId = typeof tabId === 'string' ? tabId.trim() : '';
      if (!normalizedTabId) {
        return null;
      }
      const index = findOpenProjectTabIndex(normalizedTabId);
      if (index < 0 || !openProjectTabs[index]) {
        return null;
      }
      if (!handle || typeof handle !== 'object') {
        return clearOpenProjectTabSaveHandle(normalizedTabId, 'missing-handle', options);
      }
      const current = openProjectTabs[index];
      const normalizedMeta = normalizeBindingMeta({
        ...(meta && typeof meta === 'object' ? meta : {}),
        fileName: meta?.fileName || handle?.name || current?.fileName || '',
        boundAt: meta?.boundAt || new Date().toISOString(),
        sourceProjectToken: meta?.sourceProjectToken || current?.sourceProjectToken || '',
        handleKind: meta?.handleKind || 'external-project-file',
      }, current.projectSaveHandleMeta, current);
      return updateOpenProjectTabSaveBinding(normalizedTabId, {
        projectSaveHandle: handle,
        projectSaveHandleMeta: normalizedMeta,
        projectSaveHandleState: 'bound',
      }, options);
    }

    function bindActiveProjectSaveHandle(handle, meta = null, options = {}) {
      return bindOpenProjectTabSaveHandle(getActiveOpenProjectTabId?.() || '', handle, meta, options);
    }

    function clearOpenProjectTabSaveHandle(tabId, reason = '', options = {}) {
      const normalizedTabId = typeof tabId === 'string' ? tabId.trim() : '';
      if (!normalizedTabId) {
        return null;
      }
      const index = findOpenProjectTabIndex(normalizedTabId);
      if (index < 0 || !openProjectTabs[index]) {
        return null;
      }
      const current = openProjectTabs[index];
      const nextMeta = options?.preserveMeta === true
        ? normalizeBindingMeta(current.projectSaveHandleMeta, current.projectSaveHandleMeta, current)
        : null;
      return updateOpenProjectTabSaveBinding(normalizedTabId, {
        projectSaveHandle: null,
        projectSaveHandleMeta: nextMeta,
        projectSaveHandleState: 'none',
      }, {
        ...options,
        log: options?.log !== false,
      });
    }

    function clearActiveProjectSaveHandle(reason = '', options = {}) {
      return clearOpenProjectTabSaveHandle(getActiveOpenProjectTabId?.() || '', reason, options);
    }

    function markOpenProjectTabSaveHandleUnavailable(tabId, reason = '', options = {}) {
      const normalizedTabId = typeof tabId === 'string' ? tabId.trim() : '';
      if (!normalizedTabId) {
        return null;
      }
      const index = findOpenProjectTabIndex(normalizedTabId);
      if (index < 0 || !openProjectTabs[index]) {
        return null;
      }
      const current = openProjectTabs[index];
      const currentBinding = getProjectSaveBindingFromTab(current);
      const nextMeta = normalizeBindingMeta({
        ...(currentBinding.projectSaveHandleMeta || {}),
        permissionState: currentBinding.projectSaveHandleMeta?.permissionState || 'unknown',
      }, currentBinding.projectSaveHandleMeta, current);
      return updateOpenProjectTabSaveBinding(normalizedTabId, {
        projectSaveHandle: null,
        projectSaveHandleMeta: nextMeta,
        projectSaveHandleState: 'unavailable',
      }, options);
    }

    function markActiveProjectSaveHandleUnavailable(reason = '', options = {}) {
      return markOpenProjectTabSaveHandleUnavailable(getActiveOpenProjectTabId?.() || '', reason, options);
    }

    function ensureOpenProjectTabsInitialized() {
      const activeOpenProjectTabId = getActiveOpenProjectTabId?.() || '';
      const suppressOpenProjectTabAutoInitialize = Boolean(getSuppressOpenProjectTabAutoInitialize?.());
      const projectHomeVisible = Boolean(getProjectHomeVisible?.());
      if (openProjectTabs.length > 0) {
        if (!activeOpenProjectTabId || findOpenProjectTabIndex(activeOpenProjectTabId) < 0) {
          if (suppressOpenProjectTabAutoInitialize && projectHomeVisible) {
            renderOpenProjectTabs?.();
            return;
          }
          setActiveOpenProjectTabId?.(openProjectTabs[0]?.id || '');
        }
        renderOpenProjectTabs?.();
        return;
      }
      if (suppressOpenProjectTabAutoInitialize && projectHomeVisible) {
        renderOpenProjectTabs?.();
        return;
      }
      const reloadRestoreProjectId = normalizeAutosaveProjectId(
        getStartupAutosaveRestoreProjectId?.()
        || readReloadTargetProjectId?.()
        || getAutosaveProjectId?.()
        || ''
      );
      const normalizedProjectId = reloadRestoreProjectId
        || setActiveAutosaveProjectId(createAutosaveProjectId(), { persist: false });
      if (reloadRestoreProjectId && normalizeAutosaveProjectId(getAutosaveProjectId?.() || '') !== reloadRestoreProjectId) {
        setActiveAutosaveProjectId(reloadRestoreProjectId, { persist: false });
      }
      const initialTab = createOpenProjectTabFromCurrentState({
        projectId: normalizedProjectId,
        source: 'initial',
        label: localizeText('シート 1', 'Sheet 1'),
      });
      openProjectTabs.push(initialTab);
      setActiveOpenProjectTabId?.(initialTab.id);
      setSuppressOpenProjectTabAutoInitialize?.(false);
      renderOpenProjectTabs?.();
    }

    function setProjectHomeVisible(nextVisible = true, { refresh = false } = {}) {
      const screen = dom.projectHomeScreen;
      setProjectHomeVisibleState?.(Boolean(nextVisible));
      const projectHomeVisible = Boolean(getProjectHomeVisible?.());
      if (screen instanceof HTMLElement) {
        screen.hidden = !projectHomeVisible;
        screen.setAttribute('aria-hidden', projectHomeVisible ? 'false' : 'true');
      }
      document.body.classList.toggle('is-project-home-active', projectHomeVisible);
      renderOpenProjectTabs?.();
      if (projectHomeVisible) {
        updateQrEditPanel?.();
      } else {
        syncQrEditModeWithActivePayload?.();
      }
      if (!projectHomeVisible) {
        return;
      }
      scheduleRecentProjectsListRender?.(Array.from(recentProjectsCache.values()), { immediate: true });
      if (refresh && AUTOSAVE_SUPPORTED) {
        refreshRecentProjectsUI?.().catch(error => {
          console.warn('Failed to refresh project home list', error);
        });
      }
      if (AUTOSAVE_SUPPORTED) {
        window.setTimeout(() => {
          maybePromptAndTransferRecentProjectsFromHome?.().catch(error => {
            console.warn('Failed to prompt project transfer from home', error);
          });
        }, 0);
      }
      window.requestAnimationFrame(() => {
        screen?.focus?.({ preventScroll: true });
      });
    }

    function showProjectHomeScreen(options = {}) {
      if (getStartupVisible?.()) {
        hideStartupScreen?.();
      }
      setProjectHomeVisible(true, {
        refresh: options?.refresh !== false,
      });
    }

    function hideProjectHomeScreen() {
      if (!getProjectHomeVisible?.()) {
        return;
      }
      setProjectHomeVisible(false);
    }

    function revealActiveProjectAfterOpen({ hideStartup = true } = {}) {
      if (hideStartup) {
        hideStartupScreen?.();
      }
      hideProjectHomeScreen();
      renderOpenProjectTabs?.();
    }

    function appendOpenProjectTabFromCurrentState(options = {}) {
      ensureOpenProjectTabsInitialized();
      const tab = createOpenProjectTabFromCurrentState({
        source: options.source || 'open',
        projectId: (typeof options.projectId !== 'undefined')
          ? options.projectId
          : getAutosaveProjectId?.(),
        sharedProjectKey: options.sharedProjectKey,
        sharedProjectBackendId: options.sharedProjectBackendId,
        sharedProjectRevision: options.sharedProjectRevision,
        sharedProjectStructureRevision: options.sharedProjectStructureRevision,
        sharedRoleHint: options.sharedRoleHint,
        sharedAutoJoin: options.sharedAutoJoin,
        qrEditPayload: options.qrEditPayload,
        sourceStorageAdapterId: options.sourceStorageAdapterId,
        sourceKind: options.sourceKind,
        sourceProjectToken: options.sourceProjectToken,
        lastSavedStorageAdapterId: options.lastSavedStorageAdapterId,
        projectSaveHandleState: options.projectSaveHandleState,
        projectSaveHandle: options.projectSaveHandle,
        projectSaveHandleMeta: options.projectSaveHandleMeta,
      });
      const normalizedTabProjectId = normalizeAutosaveProjectId(tab.projectId || '');
      if (options.dedupeByProjectId === true && normalizedTabProjectId) {
        const existingIndex = findOpenProjectTabIndexByProjectId(normalizedTabProjectId);
        if (existingIndex >= 0) {
          if (options.activate !== false) {
            setActiveOpenProjectTabId?.(openProjectTabs[existingIndex].id);
            setSuppressOpenProjectTabAutoInitialize?.(false);
          }
          renderOpenProjectTabs?.();
          return openProjectTabs[existingIndex];
        }
      }
      openProjectTabs.push(tab);
      if (options.activate !== false) {
        setActiveOpenProjectTabId?.(tab.id);
        setSuppressOpenProjectTabAutoInitialize?.(false);
      }
      renderOpenProjectTabs?.();
      return tab;
    }

    function replaceActiveOpenProjectTabFromCurrentState(options = {}) {
      ensureOpenProjectTabsInitialized();
      const activeOpenProjectTabId = getActiveOpenProjectTabId?.() || '';
      const index = findOpenProjectTabIndex(activeOpenProjectTabId);
      if (index < 0) {
        return null;
      }
      const current = openProjectTabs[index];
      const updated = createOpenProjectTabFromCurrentState({
        tabId: current?.id || activeOpenProjectTabId,
        source: options.source || current?.source || 'working',
        projectId: normalizeAutosaveProjectId(options.projectId || current?.projectId || getAutosaveProjectId?.()) || '',
        fileName: options.fileName || current?.fileName || '',
        sharedProjectKey: options.sharedProjectKey ?? current?.sharedProjectKey,
        sharedProjectBackendId: options.sharedProjectBackendId ?? current?.sharedProjectBackendId,
        sharedProjectRevision: options.sharedProjectRevision ?? current?.sharedProjectRevision,
        sharedProjectStructureRevision: options.sharedProjectStructureRevision ?? current?.sharedProjectStructureRevision,
        sharedRoleHint: options.sharedRoleHint ?? current?.sharedRoleHint,
        sharedAutoJoin: options.sharedAutoJoin ?? current?.sharedAutoJoin,
        qrEditPayload: typeof options.qrEditPayload !== 'undefined' ? options.qrEditPayload : current?.qrEditPayload,
        sourceStorageAdapterId: Object.prototype.hasOwnProperty.call(options, 'sourceStorageAdapterId')
          ? options.sourceStorageAdapterId
          : current?.sourceStorageAdapterId,
        sourceKind: Object.prototype.hasOwnProperty.call(options, 'sourceKind')
          ? options.sourceKind
          : current?.sourceKind,
        sourceProjectToken: Object.prototype.hasOwnProperty.call(options, 'sourceProjectToken')
          ? options.sourceProjectToken
          : current?.sourceProjectToken,
        lastSavedStorageAdapterId: Object.prototype.hasOwnProperty.call(options, 'lastSavedStorageAdapterId')
          ? options.lastSavedStorageAdapterId
          : current?.lastSavedStorageAdapterId,
        projectSaveHandleState: Object.prototype.hasOwnProperty.call(options, 'projectSaveHandleState')
          ? options.projectSaveHandleState
          : current?.projectSaveHandleState,
        projectSaveHandle: Object.prototype.hasOwnProperty.call(options, 'projectSaveHandle')
          ? options.projectSaveHandle
          : current?.projectSaveHandle,
        projectSaveHandleMeta: Object.prototype.hasOwnProperty.call(options, 'projectSaveHandleMeta')
          ? options.projectSaveHandleMeta
          : current?.projectSaveHandleMeta,
      });
      openProjectTabs[index] = updated;
      setActiveOpenProjectTabId?.(updated.id);
      setSuppressOpenProjectTabAutoInitialize?.(false);
      renderOpenProjectTabs?.();
      return updated;
    }

    function canReuseActiveOpenProjectTabForRecentEntry(entry) {
      const normalizedEntryId = normalizeAutosaveProjectId(entry?.id || '');
      if (!normalizedEntryId) {
        return false;
      }
      const activeOpenProjectTabId = getActiveOpenProjectTabId?.() || '';
      const activeTab = getActiveOpenProjectTab();
      if (!activeTab || activeTab.id !== activeOpenProjectTabId) {
        return false;
      }
      if (activeTab.source !== 'initial') {
        return false;
      }
      if (activeTab.unsaved || hasDocumentUnsavedChanges()) {
        return false;
      }
      const activeProjectId = normalizeAutosaveProjectId(activeTab.projectId || getAutosaveProjectId?.() || '');
      if (!activeProjectId || activeProjectId === normalizedEntryId) {
        return false;
      }
      if (recentProjectsCache.has(activeProjectId)) {
        return false;
      }
      return true;
    }

    async function persistActiveOpenProjectTab({ flushAutosave = false, retainProjectPayload = false } = {}) {
      ensureOpenProjectTabsInitialized();
      const activeOpenProjectTabId = getActiveOpenProjectTabId?.() || '';
      const index = findOpenProjectTabIndex(activeOpenProjectTabId);
      if (index < 0) {
        return false;
      }
      const current = openProjectTabs[index];
      const currentProjectId = normalizeAutosaveProjectId(current?.projectId || getAutosaveProjectId?.() || '')
        || createAutosaveProjectId();
      if (currentProjectId && normalizeAutosaveProjectId(getAutosaveProjectId?.() || '') !== currentProjectId) {
        setActiveAutosaveProjectId(currentProjectId, { persist: false });
      }
      let updated = isSharedOpenProjectTab(current)
        && SHARED_PROJECTS_ENABLED
        ? createOpenProjectTabFromCurrentState({
            tabId: current?.id || activeOpenProjectTabId,
            source: current?.source || 'working',
            projectId: currentProjectId,
            sharedProjectKey: current?.sharedProjectKey || '',
            sharedProjectBackendId: current?.sharedProjectBackendId || '',
            sharedProjectRevision: current?.sharedProjectRevision || 0,
            sharedProjectStructureRevision: current?.sharedProjectStructureRevision || 0,
            sharedRoleHint: current?.sharedRoleHint || '',
            sharedAutoJoin: current?.sharedAutoJoin !== false,
            qrEditPayload: current?.qrEditPayload,
            projectSaveHandle: current?.projectSaveHandle,
            projectSaveHandleMeta: current?.projectSaveHandleMeta,
          })
        : createLocalOpenProjectTabFromCurrentState(current, {
            tabId: current?.id || activeOpenProjectTabId,
            source: current?.source || 'working',
            projectId: currentProjectId,
            qrEditPayload: current?.qrEditPayload,
            projectSaveHandle: current?.projectSaveHandle,
            projectSaveHandleMeta: current?.projectSaveHandleMeta,
          });
      // createLocalOpenProjectTabFromCurrentState already creates the resident
      // payload.  Rebuilding it here created a second full history snapshot on
      // every local sheet switch.
      openProjectTabs[index] = updated;
      setActiveOpenProjectTabId?.(updated.id);
      renderOpenProjectTabs?.();
      if (flushAutosave && AUTOSAVE_SUPPORTED) {
        let saved = false;
        try {
          saved = await writeAutosaveSnapshot(true);
        } catch (error) {
          console.warn('Failed to flush autosave before switching project tab', error);
          saved = false;
        }
        if (!saved) {
          updateAutosaveStatus(
            localizeText('現在のプロジェクトを保存できませんでした', 'Could not save the current project'),
            'error'
          );
          return false;
        }
      }
      return true;
    }

    function resetOpenProjectTabsToCurrentProject(options = {}) {
      const tab = createOpenProjectTabFromCurrentState({
        source: options.source || 'working',
        projectId: options.projectId || getAutosaveProjectId?.(),
        label: options.label || localizeText('シート 1', 'Sheet 1'),
        sharedProjectKey: SHARED_PROJECTS_ENABLED ? options.sharedProjectKey : '',
        sharedProjectBackendId: SHARED_PROJECTS_ENABLED ? options.sharedProjectBackendId : '',
        sharedProjectRevision: SHARED_PROJECTS_ENABLED ? options.sharedProjectRevision : 0,
        sharedProjectStructureRevision: SHARED_PROJECTS_ENABLED ? options.sharedProjectStructureRevision : 0,
        sharedRoleHint: SHARED_PROJECTS_ENABLED ? options.sharedRoleHint : '',
        sharedAutoJoin: SHARED_PROJECTS_ENABLED ? options.sharedAutoJoin : false,
        qrEditPayload: options.qrEditPayload,
        sourceStorageAdapterId: options.sourceStorageAdapterId,
        sourceKind: options.sourceKind,
        sourceProjectToken: options.sourceProjectToken,
        lastSavedStorageAdapterId: options.lastSavedStorageAdapterId,
        projectSaveHandleState: options.projectSaveHandleState,
        projectSaveHandle: options.projectSaveHandle,
        projectSaveHandleMeta: options.projectSaveHandleMeta,
      });
      openProjectTabs.splice(0, openProjectTabs.length, tab);
      setActiveOpenProjectTabId?.(tab.id);
      setSuppressOpenProjectTabAutoInitialize?.(false);
      renderOpenProjectTabs?.();
      return tab;
    }

    async function closeAllOpenProjectTabsForProjectReplacement({ flushAutosave = false, showHome = false } = {}) {
      if (getOpenProjectTabBusy?.()) {
        return false;
      }
      if (openProjectTabs.length && getActiveOpenProjectTabId?.()) {
        const persisted = await persistActiveOpenProjectTab({ flushAutosave });
        if (!persisted) {
          return false;
        }
      }
      openProjectTabs.splice(0, openProjectTabs.length);
      setActiveOpenProjectTabId?.('');
      setSuppressOpenProjectTabAutoInitialize?.(true);
      if (SHARED_PROJECTS_ENABLED && getActiveSharedProjectKey?.()) {
        clearActiveSharedProjectSession?.('project-replace');
      }
      if (showHome) {
        setProjectHomeVisible(true, { refresh: true });
      } else {
        renderOpenProjectTabs?.();
      }
      return true;
    }

    return {
      ensureOpenProjectTabsInitialized,
      setProjectHomeVisible,
      showProjectHomeScreen,
      hideProjectHomeScreen,
      revealActiveProjectAfterOpen,
      appendOpenProjectTabFromCurrentState,
      replaceActiveOpenProjectTabFromCurrentState,
      getProjectSaveBindingFromTab,
      getActiveProjectSaveBinding,
      bindOpenProjectTabSaveHandle,
      bindActiveProjectSaveHandle,
      clearOpenProjectTabSaveHandle,
      clearActiveProjectSaveHandle,
      markOpenProjectTabSaveHandleUnavailable,
      markActiveProjectSaveHandleUnavailable,
      canReuseActiveOpenProjectTabForRecentEntry,
      persistActiveOpenProjectTab,
      resetOpenProjectTabsToCurrentProject,
      closeAllOpenProjectTabsForProjectReplacement,
    };
  }

  root.openProjectTabLifecycle = {
    createOpenProjectTabLifecycle,
  };
})();
