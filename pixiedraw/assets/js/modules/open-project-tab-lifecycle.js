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
    hasDocumentUnsavedChanges,
    writeAutosaveSnapshot,
    updateAutosaveStatus,
    localizeText,
    hideStartupScreen,
    showStartupScreen,
    updateQrEditPanel,
    syncQrEditModeWithActivePayload,
    scheduleRecentProjectsListRender,
    refreshRecentProjectsUI,
    maybePromptAndTransferRecentProjectsFromHome,
    clearActiveSharedProjectSession,
    makeHistorySnapshot,
    buildProjectSessionPayload,
    buildPackagedProjectPayload,
    replaceActiveProjectSessionFromTab,
  } = {}) {
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
      replaceActiveProjectSessionFromTab?.(initialTab, {
        phase: 'initial-project-session',
      });
      renderOpenProjectTabs?.();
    }

    function setProjectHomeVisible(nextVisible = true, { refresh = false } = {}) {
      const screen = dom.projectHomeScreen;
      if (nextVisible && !(screen instanceof HTMLElement)) {
        setProjectHomeVisibleState?.(false);
        document.body.classList.remove('is-project-home-active');
        showStartupScreen?.({ refreshWorkspace: refresh });
        return;
      }
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
      window.requestAnimationFrame(() => {
        screen?.focus?.({ preventScroll: true });
      });
    }

    function showProjectHomeScreen(options = {}) {
      if (!(dom.projectHomeScreen instanceof HTMLElement)) {
        showStartupScreen?.({ refreshWorkspace: options?.refresh !== false });
        return;
      }
      if (getStartupVisible?.()) {
        hideStartupScreen?.();
      }
      setProjectHomeVisible(true, {
        refresh: options?.refresh !== false,
      });
    }

    function hideProjectHomeScreen() {
      const screen = dom?.projectHomeScreen;
      const visiblyOpen = screen instanceof HTMLElement && screen.hidden === false;
      const classStillActive = document.body?.classList.contains('is-project-home-active') === true;
      // A startup transition or interstitial can leave the home DOM visible
      // after its state flag changed. Clear the actual layer as well, or it
      // continues to sit above project tabs and intercepts their clicks.
      if (!getProjectHomeVisible?.() && !visiblyOpen && !classStillActive) {
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
        canonicalPayloadFormat: options.canonicalPayloadFormat,
        canonicalSchemaVersion: options.canonicalSchemaVersion,
        canonicalSourceMetadata: options.canonicalSourceMetadata,
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
      if (options.activate !== false) {
        replaceActiveProjectSessionFromTab?.(tab, {
          phase: 'append-project-session',
        });
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
        canonicalPayloadFormat: Object.prototype.hasOwnProperty.call(options, 'canonicalPayloadFormat')
          ? options.canonicalPayloadFormat
          : current?.canonicalPayloadFormat,
        canonicalSchemaVersion: Object.prototype.hasOwnProperty.call(options, 'canonicalSchemaVersion')
          ? options.canonicalSchemaVersion
          : current?.canonicalSchemaVersion,
        canonicalSourceMetadata: Object.prototype.hasOwnProperty.call(options, 'canonicalSourceMetadata')
          ? options.canonicalSourceMetadata
          : current?.canonicalSourceMetadata,
      });
      openProjectTabs[index] = updated;
      setActiveOpenProjectTabId?.(updated.id);
      setSuppressOpenProjectTabAutoInitialize?.(false);
      replaceActiveProjectSessionFromTab?.(updated, {
        phase: 'replace-project-session',
      });
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
      // A tab that has not changed already owns an immutable packaged payload.
      // Recreating a history snapshot here clones every GIF frame just before
      // it is replaced by the next sheet, which made ordinary tab switches
      // more expensive than keeping the resident reference.
      const canReuseResidentLocalPayload = Boolean(
        !isSharedOpenProjectTab(current)
        && !hasDocumentUnsavedChanges()
        && (current?.project && typeof current.project === 'object'
          || current?.deferredProjectPayload && typeof current.deferredProjectPayload === 'object')
      );
      let updated = canReuseResidentLocalPayload
        ? {
          ...current,
          project: current.project || current.deferredProjectPayload,
          deferredProjectPayload: current.deferredProjectPayload || current.project,
          residentProjectLoaded: true,
          unsaved: false,
        }
        : (isSharedOpenProjectTab(current)
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
          })
          : createLocalOpenProjectTabFromCurrentState(current, {
            tabId: current?.id || activeOpenProjectTabId,
            source: current?.source || 'working',
            projectId: currentProjectId,
            qrEditPayload: current?.qrEditPayload,
          }));
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
        canonicalPayloadFormat: options.canonicalPayloadFormat,
        canonicalSchemaVersion: options.canonicalSchemaVersion,
        canonicalSourceMetadata: options.canonicalSourceMetadata,
      });
      openProjectTabs.splice(0, openProjectTabs.length, tab);
      setActiveOpenProjectTabId?.(tab.id);
      setSuppressOpenProjectTabAutoInitialize?.(false);
      replaceActiveProjectSessionFromTab?.(tab, {
        phase: 'reset-project-session',
      });
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
