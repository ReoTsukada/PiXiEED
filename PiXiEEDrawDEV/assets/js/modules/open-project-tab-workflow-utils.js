(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createOpenProjectTabWorkflowUtils(rawScope = {}) {
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
  function releaseAutosaveProjectId(projectId) {
    const normalized = normalizeAutosaveProjectId(projectId || '');
    if (!normalized) {
      return false;
    }
    let changed = false;
    openProjectTabs.forEach((tab, index) => {
      if (!tab || normalizeAutosaveProjectId(tab.projectId || '') !== normalized) {
        return;
      }
      openProjectTabs[index] = {
        ...tab,
        projectId: createAutosaveProjectId(),
      };
      changed = true;
    });
    if (normalizeAutosaveProjectId(autosaveProjectId || '') === normalized) {
      setActiveAutosaveProjectId(createAutosaveProjectId());
      changed = true;
    }
    if (changed) {
      renderOpenProjectTabs();
    }
    return changed;
  }

  function buildActiveSharedProjectSheetTabFields(projectId = autosaveProjectId) {
    const normalizedProjectId = normalizeAutosaveProjectId(projectId || autosaveProjectId || '');
    const sharedProjectKey = normalizeMultiProjectKey(activeSharedProjectKey || '')
      || getSharedProjectKeyFromProjectId(normalizedProjectId);
    if (!sharedProjectKey || !isCurrentProjectSharedEntry()) {
      return null;
    }
    const sharedEntry = getCurrentSharedRecentProjectEntry(sharedProjectKey);
    return {
      projectId: buildSharedRecentProjectId(sharedProjectKey) || normalizedProjectId || createAutosaveProjectId(),
      sharedProjectKey,
      sharedProjectBackendId: activeSharedProjectId || sharedEntry?.sharedProjectBackendId || '',
      sharedProjectRevision: Math.max(
        0,
        Math.round(Number(activeSharedProjectRevision) || 0),
        Math.round(Number(sharedEntry?.sharedProjectRevision) || 0)
      ),
      sharedProjectStructureRevision: Math.max(
        0,
        Math.round(Number(activeSharedProjectStructureRevision) || 0),
        Math.round(Number(sharedEntry?.sharedProjectStructureRevision) || 0)
      ),
      sharedRoleHint: sharedEntry?.sharedRoleHint || mapSharedProjectMembershipRoleToUiRole(activeSharedProjectMembershipRole) || 'guest',
      sharedAutoJoin: sharedEntry?.sharedAutoJoin !== false,
    };
  }

  function queueSharedProjectSheetsSnapshot(historyLabel = 'addSheet') {
    if (!activeSharedProjectKey || !isCurrentProjectSharedEntry()) {
      return false;
    }
    markAutosaveDirty();
    markDocumentUnsavedChange();
    scheduleSessionPersist({ includeSnapshots: true });
    scheduleAutosaveSnapshot();
    if (isSharedProjectRealtimePrimaryActive(activeSharedProjectKey)) {
      handleMultiLocalCommit('addSheet');
      return true;
    }
    queueSharedProjectCurrentSnapshotCapture({
      delayMs: 0,
      projectKey: activeSharedProjectKey,
      historyLabel: historyLabel === 'addSheet' ? 'structure-checkpoint' : historyLabel,
      force: true,
    });
    return true;
  }

  async function switchToOpenProjectTabForRecentProjectEntry(entry = null, {
    hideStartup = false,
    silent = false,
  } = {}) {
    const existingIndex = findOpenProjectTabIndexForRecentProjectEntry(entry);
    if (existingIndex < 0) {
      return { found: false, switched: false };
    }
    const existingTab = openProjectTabs[existingIndex];
    const switched = await activateOpenProjectTab(existingTab?.id || '', {
      announce: !silent,
    });
    if (!switched) {
      return { found: true, switched: false };
    }
    if (hideStartup) {
      hideStartupScreen();
    }
    if (projectHomeVisible) {
      hideProjectHomeScreen();
    }
    return { found: true, switched: true };
  }

  function closeOpenProjectTabsForDeletedProject({
    projectId = '',
    projectKey = '',
    backendId = '',
    reason = 'deleted-project',
    showHome = true,
  } = {}) {
    if (!openProjectTabs.length) {
      return false;
    }
    const normalizedProjectId = normalizeAutosaveProjectId(projectId || '');
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '')
      || getSharedProjectKeyFromProjectId(normalizedProjectId);
    const sharedRecentProjectId = normalizedProjectKey
      ? buildSharedRecentProjectId(normalizedProjectKey)
      : '';
    const removedTabs = [];
    const currentProjectId = normalizeAutosaveProjectId(autosaveProjectId || '');
    for (let index = openProjectTabs.length - 1; index >= 0; index -= 1) {
      const tab = openProjectTabs[index];
      const activeTabMatchesCurrentDeletedProject = Boolean(
        tab?.id
        && tab.id === activeOpenProjectTabId
        && normalizedProjectId
        && currentProjectId === normalizedProjectId
      );
      if (!activeTabMatchesCurrentDeletedProject && !matchesDeletedProjectOpenTab(tab, {
        projectId: normalizedProjectId,
        projectKey: normalizedProjectKey,
        backendId,
      })) {
        continue;
      }
      removedTabs.push(tab);
      openProjectTabs.splice(index, 1);
    }
    if (!removedTabs.length) {
      return false;
    }
    const removedActiveTab = removedTabs.some(tab => tab?.id && tab.id === activeOpenProjectTabId);
    const removedSharedKeys = new Set(
      removedTabs
        .map(tab => getOpenProjectTabSharedKey(tab))
        .filter(Boolean)
    );
    const activeSharedKey = normalizeMultiProjectKey(activeSharedProjectKey || '');
    const currentProjectRemoved = Boolean(
      (normalizedProjectId && currentProjectId === normalizedProjectId)
      || (sharedRecentProjectId && currentProjectId === sharedRecentProjectId)
    );
    if (removedActiveTab) {
      activeOpenProjectTabId = '';
      suppressOpenProjectTabAutoInitialize = true;
    }
    if (
      activeSharedKey
      && (
        removedSharedKeys.has(activeSharedKey)
        || (normalizedProjectKey && activeSharedKey === normalizedProjectKey)
      )
    ) {
      clearActiveSharedProjectSession(reason);
    }
    if (currentProjectRemoved) {
      setActiveAutosaveProjectId(createAutosaveProjectId());
    }
    if (normalizedProjectId && startupAutosaveRestoreProjectId === normalizedProjectId) {
      startupAutosaveRestoreProjectId = '';
    }
    if (sharedRecentProjectId && startupAutosaveRestoreProjectId === sharedRecentProjectId) {
      startupAutosaveRestoreProjectId = '';
    }
    if (showHome) {
      setProjectHomeVisible(true, { refresh: true });
    } else {
      renderOpenProjectTabs();
    }
    return true;
  }

  function retargetAutosaveProjectId(previousProjectId, nextProjectId) {
    const previous = normalizeAutosaveProjectId(previousProjectId || '');
    const next = normalizeAutosaveProjectId(nextProjectId || '');
    if (!previous || !next || previous === next) {
      return false;
    }
    let changed = false;
    openProjectTabs.forEach((tab, index) => {
      if (!tab || normalizeAutosaveProjectId(tab.projectId || '') !== previous) {
        return;
      }
      openProjectTabs[index] = {
        ...tab,
        projectId: next,
        source: isSharedRecentProjectEntry(recentProjectsCache.get(next) || null) ? 'shared' : (tab.source || 'working'),
      };
      changed = true;
    });
    if (normalizeAutosaveProjectId(autosaveProjectId || '') === previous) {
      setActiveAutosaveProjectId(next);
      changed = true;
    }
    if (startupAutosaveRestoreProjectId === previous) {
      startupAutosaveRestoreProjectId = next;
      changed = true;
    }
    if (changed) {
      renderOpenProjectTabs();
    }
    return changed;
  }

  function clearDeletedSharedProjectLocalState(projectKey = '', projectId = '') {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    const normalizedProjectId = normalizeAutosaveProjectId(projectId || '');
    const sharedRecentProjectId = normalizedProjectKey
      ? buildSharedRecentProjectId(normalizedProjectKey)
      : '';
    const matchesActiveSharedProject = normalizedProjectKey && activeSharedProjectKey === normalizedProjectKey;
    const matchesAutosaveProject = normalizedProjectId
      && normalizeAutosaveProjectId(autosaveProjectId || '') === normalizedProjectId;
    const matchesSharedAutosaveProject = sharedRecentProjectId
      && normalizeAutosaveProjectId(autosaveProjectId || '') === sharedRecentProjectId;
    const pendingInvite = readPendingSharedInvite();
    const matchesPendingInvite = Boolean(
      pendingInvite
      && (
        (normalizedProjectKey && normalizeMultiProjectKey(pendingInvite.projectKey || '') === normalizedProjectKey)
        || (
          sharedRecentProjectId
          && typeof pendingInvite.projectKey === 'string'
          && normalizeMultiProjectKey(pendingInvite.projectKey || '') === normalizedProjectKey
        )
      )
    );

    if (matchesPendingInvite) {
      clearPendingSharedInvite();
    }
    if (normalizedProjectKey && normalizeMultiProjectKey(multiState.projectKey || '') === normalizedProjectKey) {
      storeMultiProjectKey('');
      syncMultiProjectKeyInputValues('', { preserveFocused: false });
    }
    if (matchesActiveSharedProject || matchesSharedAutosaveProject) {
      clearActiveSharedProjectSession('deleted-shared-project');
    }
    if (matchesAutosaveProject || matchesSharedAutosaveProject) {
      setActiveAutosaveProjectId(createAutosaveProjectId());
    }
    if (sharedRecentProjectId) {
      closeOpenProjectTabsForDeletedProject({
        projectId: sharedRecentProjectId,
        projectKey: normalizedProjectKey,
        backendId: normalizedProjectId,
        reason: 'deleted-shared-project-tab',
        showHome: true,
      });
    }
    if (sharedRecentProjectId && startupAutosaveRestoreProjectId === sharedRecentProjectId) {
      startupAutosaveRestoreProjectId = '';
    }
  }

  async function purgeDeletedSharedProjectLocalReferences(projectKey = '', projectId = '') {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    const normalizedProjectId = normalizeAutosaveProjectId(projectId || '');
    if (normalizedProjectKey) {
      unhideSharedProjectFromRecentSync(normalizedProjectKey);
    }
    clearDeletedSharedProjectLocalState(normalizedProjectKey, normalizedProjectId);
    if (!AUTOSAVE_SUPPORTED) {
      return false;
    }
    const existingEntries = await loadRecentProjectsMetadata();
    const idsToRemove = existingEntries
      .filter(entry => {
        const entryId = normalizeAutosaveProjectId(entry?.id || '');
        const entryProjectKey = normalizeMultiProjectKey(entry?.sharedProjectKey || '');
        const entryBackendId = typeof entry?.sharedProjectBackendId === 'string' ? entry.sharedProjectBackendId.trim() : '';
        const matchesProjectKey = normalizedProjectKey && entryProjectKey === normalizedProjectKey;
        const matchesProjectId = normalizedProjectId && entryId === normalizedProjectId;
        const matchesSharedRecentId = normalizedProjectKey && entryId === buildSharedRecentProjectId(normalizedProjectKey);
        const matchesBackendId = normalizedProjectId && entryBackendId && entryBackendId === normalizedProjectId;
        return matchesProjectKey || matchesProjectId || matchesSharedRecentId || matchesBackendId;
      })
      .map(entry => normalizeAutosaveProjectId(entry?.id || ''))
      .filter(Boolean);
    if (!idsToRemove.length) {
      return false;
    }
    const nextEntries = existingEntries.filter(entry => !idsToRemove.includes(normalizeAutosaveProjectId(entry?.id || '')));
    await saveRecentProjectsList(existingEntries, nextEntries);
    setRecentProjectsCache(nextEntries);
    idsToRemove.forEach(id => {
      closeOpenProjectTabsForDeletedProject({
        projectId: id,
        projectKey: normalizedProjectKey,
        backendId: normalizedProjectId,
        reason: 'deleted-shared-project-tab',
        showHome: true,
      });
      if (startupAutosaveRestoreProjectId === id) {
        startupAutosaveRestoreProjectId = '';
      }
    });
    if (idsToRemove.includes(normalizeAutosaveProjectId(autosaveProjectId || ''))) {
      setActiveAutosaveProjectId(createAutosaveProjectId());
    }
    return true;
  }

  function confirmCloseOpenProjectTab(tab, { active = false } = {}) {
    const displayLabel = getOpenProjectTabDisplayLabel(tab, { active });
    return window.confirm(
      localizeText(
        `シート「${displayLabel}」を閉じますか？\n端末内プロジェクトは削除されません。`,
        `Close the sheet "${displayLabel}"?\nThe local project will not be deleted.`
      )
    );
  }

  function renameOpenProjectTab(tabId) {
    const targetId = typeof tabId === 'string' ? tabId : '';
    if (!targetId || openProjectTabBusy) {
      return false;
    }
    const index = findOpenProjectTabIndex(targetId);
    if (index < 0 || !openProjectTabs[index]) {
      return false;
    }
    const targetTab = openProjectTabs[index];
    const fallbackLabel = localizeText(`シート ${index + 1}`, `Sheet ${index + 1}`);
    const currentLabel = getOpenProjectTabDisplayLabel(
      targetTab,
      { active: !projectHomeVisible && targetId === activeOpenProjectTabId }
    ) || fallbackLabel;
    const nextLabel = window.prompt(
      localizeText('シート名を入力してください', 'Enter the sheet name'),
      currentLabel
    );
    if (nextLabel === null) {
      return false;
    }
    const normalizedLabel = String(nextLabel).trim() || fallbackLabel;
    if (normalizedLabel === (targetTab.label || '').trim()) {
      return false;
    }
    openProjectTabs[index] = {
      ...targetTab,
      label: normalizedLabel,
      updatedAt: new Date().toISOString(),
    };
    renderOpenProjectTabs();
    markDocumentUnsavedChange();
    scheduleSessionPersist({ includeSnapshots: true });
    scheduleAutosaveSnapshot();
    updateAutosaveStatus(
      localizeText(`シート名を変更しました (${normalizedLabel})`, `Renamed sheet (${normalizedLabel})`),
      'success'
    );
    return true;
  }


  async function activateOpenProjectTab(tabId, { skipPersistCurrent = false, announce = true, skipBusyGuard = false } = {}) {
    const targetId = typeof tabId === 'string' ? tabId : '';
    if (!targetId) {
      return false;
    }
    if (!ensureCurrentClientCanReplaceActiveProject({ announce })) {
      return false;
    }
    if (openProjectTabBusy && !skipBusyGuard) {
      return false;
    }
    if (!openProjectTabs.length) {
      ensureOpenProjectTabsInitialized();
    }
    const previousActiveId = activeOpenProjectTabId;
    if (targetId === previousActiveId) {
      return true;
    }
    const targetIndex = findOpenProjectTabIndex(targetId);
    if (targetIndex < 0) {
      return false;
    }
    const target = openProjectTabs[targetIndex];
    const targetRecentEntry = getSharedRecentProjectEntryForTab(target);
    const targetIsShared = Boolean(targetRecentEntry && isSharedRecentProjectEntry(targetRecentEntry));
    const targetProjectId = normalizeAutosaveProjectId(target?.projectId || '');
    const targetSharedKey = getOpenProjectTabSharedKey(target);
    const canLoadActiveSharedSheetFromTab = Boolean(
      targetIsShared
      && target?.project
      && typeof target.project === 'object'
      && activeSharedProjectKey
      && targetSharedKey
      && normalizeMultiProjectKey(targetSharedKey) === normalizeMultiProjectKey(activeSharedProjectKey)
      && isCurrentProjectSharedEntry()
    );
    if (!targetIsShared && targetProjectId.startsWith(SHARED_PROJECT_ID_PREFIX)) {
      updateAutosaveStatus(
        localizeText(
          '共有プロジェクト情報を確認できないため、通常プロジェクトとしては開きませんでした。',
          'Shared project metadata is unavailable, so it was not opened as a local project.'
        ),
        'warn'
      );
      return false;
    }
    if (!targetIsShared && (!target?.project || typeof target.project !== 'object')) {
      return false;
    }
    const guardedProjectTabIds = Array.from(new Set([previousActiveId, target.id].filter(Boolean)));
    guardedProjectTabIds.forEach(retainOpenProjectTabProjectWriteGuard);
    if (!skipPersistCurrent && previousActiveId && findOpenProjectTabIndex(previousActiveId) >= 0) {
      const persistedCurrentSheet = await persistActiveOpenProjectTab({ flushAutosave: false });
      if (!persistedCurrentSheet) {
        updateAutosaveStatus(localizeText('現在のシートを保持できなかったため、切替を中止しました', 'Sheet switch was canceled because the current sheet could not be preserved'), 'error');
        guardedProjectTabIds.forEach(releaseOpenProjectTabProjectWriteGuard);
        return false;
      }
    }
    // If there is an active shared project session for a different project/tab,
    // clear it before loading the target. This prevents incoming shared-project
    // remote ops or refreshes from being applied to the wrong tab while
    // switching tabs.
    try {
      const previousTab = previousActiveId ? openProjectTabs[findOpenProjectTabIndex(previousActiveId)] : null;
      const previousSharedKey = getOpenProjectTabSharedKey(previousTab);
      if (activeSharedProjectKey) {
        // If the target does not map to the same shared project key, clear the
        // current shared session to stop background sync from affecting the
        // newly active document.
        if (!targetSharedKey || normalizeMultiProjectKey(targetSharedKey) !== normalizeMultiProjectKey(activeSharedProjectKey)) {
          clearActiveSharedProjectSession('tab-switch');
        }
      }
    } catch (e) {
      // Non-fatal: if anything goes wrong here, continue with tab activation.
      console.warn('Error while checking/clearing shared project session on tab switch', e);
    }

    activeOpenProjectTabId = target.id;
    suppressOpenProjectTabAutoInitialize = false;
    renderOpenProjectTabs();
    openProjectTabBusy = true;
    try {
      let loaded = false;
      if (targetIsShared) {
        if (canLoadActiveSharedSheetFromTab) {
          loaded = await loadDocumentFromProjectPayload(target.project, {
            projectId: target.projectId || buildSharedRecentProjectId(targetSharedKey),
            suppressAutosaveStatus: true,
            qrEditPayload: target?.qrEditPayload || null,
            suppressProjectSheetsRestore: true,
            preserveDocumentIds: true,
            preserveCanvasIds: true,
            preserveFrameIds: true,
            preserveLayerIds: true,
            sharedProjectKey: targetSharedKey,
            sharedProjectBackendId: target.sharedProjectBackendId || targetRecentEntry?.sharedProjectBackendId || activeSharedProjectId || '',
            sharedProjectRevision: Math.max(
              0,
              Math.round(Number(target.sharedProjectRevision) || 0),
              Math.round(Number(targetRecentEntry?.sharedProjectRevision) || 0),
              Math.round(Number(activeSharedProjectRevision) || 0)
            ),
            sharedProjectStructureRevision: Math.max(
              0,
              Math.round(Number(target.sharedProjectStructureRevision) || 0),
              Math.round(Number(targetRecentEntry?.sharedProjectStructureRevision) || 0),
              Math.round(Number(activeSharedProjectStructureRevision) || 0)
            ),
            sharedRoleHint: target.sharedRoleHint || targetRecentEntry?.sharedRoleHint || 'guest',
            sharedAutoJoin: target.sharedAutoJoin !== false && targetRecentEntry?.sharedAutoJoin !== false,
          });
        } else {
          loaded = await openSharedRecentProject(targetRecentEntry, {
            hideStartup: false,
            silent: true,
            skipLatestRefresh: true,
          });
        }
      } else {
        loaded = await loadDocumentFromProjectPayload(target.project, {
          projectId: target.projectId || '',
          suppressAutosaveStatus: true,
          qrEditPayload: target?.qrEditPayload || null,
          suppressProjectSheetsRestore: true,
        });
      }
      // If loadDocumentFromText returned the 'deferred' sentinel, it means
      // the snapshot targets a different project/sheet and should not be
      // applied into the currently active sheet. Mark the sheet as having
      // a deferred restore / remote update available and keep the previous
      // active sheet visible (avoid blank canvas).
      if (loaded === 'deferred') {
        try {
          openProjectTabs[targetIndex] = Object.assign({}, target, {
            deferredRestore: true,
            remoteUpdateAvailable: true,
          });
          // Revert active tab to the previous one so the document state
          // that was visible remains active.
          activeOpenProjectTabId = previousActiveId;
          renderOpenProjectTabs();
          updateAutosaveStatus(
            localizeText(
              'このプロジェクトは別タブで復元が必要なため保留されました。',
              'This project requires restore into a different tab and has been deferred.'
            ),
            'info'
          );
          return true;
        } catch (e) {
          console.warn('Failed to mark deferred project tab', e);
          // Fall through to the existing error path below.
        }
      }
      if (!loaded) {
        activeOpenProjectTabId = previousActiveId;
        renderOpenProjectTabs();
        updateAutosaveStatus(localizeText('シートの切替に失敗しました', 'Failed to switch sheet'), 'error');
        return false;
      }
      queueProjectTabViewportReset(target.id);
      if (target.unsaved) {
        markDocumentUnsavedChange();
      } else {
        resetDocumentUnsavedChanges();
      }
      renderOpenProjectTabs();
      if (announce) {
        updateAutosaveStatus(
          localizeText(
            `プロジェクトを切り替えました (${extractDocumentBaseName(state.documentName)})`,
            `Switched project (${extractDocumentBaseName(state.documentName)})`
          ),
          'info'
        );
      }
      return true;
    } catch (error) {
      console.warn('Failed to activate project tab', error);
      activeOpenProjectTabId = previousActiveId;
      renderOpenProjectTabs();
      updateAutosaveStatus(localizeText('シートの切替に失敗しました', 'Failed to switch sheet'), 'error');
      return false;
    } finally {
      guardedProjectTabIds.forEach(releaseOpenProjectTabProjectWriteGuard);
      openProjectTabBusy = false;
    }
  }

  async function closeOpenProjectTab(tabId) {
    const targetId = typeof tabId === 'string' ? tabId : '';
    if (!targetId || openProjectTabBusy) {
      return false;
    }
    ensureOpenProjectTabsInitialized();
    const index = findOpenProjectTabIndex(targetId);
    if (index < 0) {
      return false;
    }
    const target = openProjectTabs[index];
    const wasActive = target?.id === activeOpenProjectTabId;
    const targetProjectId = normalizeAutosaveProjectId(target?.projectId || '');
    if (wasActive && isMultiMasterProjectReplacementBlocked()) {
      setMultiStatus(
        localizeText(
          '共有中のメインプロジェクトは、マスター接続中は閉じられません。先に共有を切断してください。',
          'You cannot close the shared main project while connected as master. Disconnect collab first.'
        ),
        'warn'
      );
      return false;
    }
    if (!confirmCloseOpenProjectTab(target, { active: wasActive })) {
      return false;
    }
    const fallback = wasActive
      ? (openProjectTabs[index - 1] || openProjectTabs[index + 1] || null)
      : null;
    if (fallback?.id) {
      const switched = await activateOpenProjectTab(fallback.id, {
        skipPersistCurrent: true,
        announce: false,
      });
      if (!switched) {
        updateAutosaveStatus(localizeText('シートの切替に失敗しました', 'Failed to switch sheet'), 'warn');
        return false;
      }
    }
    if (targetProjectId && startupAutosaveRestoreProjectId === targetProjectId) {
      startupAutosaveRestoreProjectId = '';
    }
    const removalIndex = findOpenProjectTabIndex(targetId);
    if (removalIndex >= 0) {
      openProjectTabs.splice(removalIndex, 1);
    }
    if (wasActive && !fallback) {
      activeOpenProjectTabId = '';
      suppressOpenProjectTabAutoInitialize = true;
      if (targetProjectId && normalizeAutosaveProjectId(autosaveProjectId || '') === targetProjectId) {
        setActiveAutosaveProjectId(createAutosaveProjectId());
      }
      if (activeSharedProjectKey) {
        clearActiveSharedProjectSession('project-tab-close');
      }
      setProjectHomeVisible(true, { refresh: true });
    } else {
      renderOpenProjectTabs();
    }
    updateAutosaveStatus(
      localizeText('シートを閉じました（端末内保存は保持）', 'Closed sheet (local save kept)'),
      'info'
    );
    return true;
  }



  return Object.freeze({
    releaseAutosaveProjectId,
    buildActiveSharedProjectSheetTabFields,
    queueSharedProjectSheetsSnapshot,
    switchToOpenProjectTabForRecentProjectEntry,
    closeOpenProjectTabsForDeletedProject,
    retargetAutosaveProjectId,
    clearDeletedSharedProjectLocalState,
    purgeDeletedSharedProjectLocalReferences,
    confirmCloseOpenProjectTab,
    renameOpenProjectTab,
    activateOpenProjectTab,
    closeOpenProjectTab,
  });
      }
    })(scope);
  }

  root.openProjectTabWorkflowUtils = Object.freeze({
    createOpenProjectTabWorkflowUtils,
  });
})();
