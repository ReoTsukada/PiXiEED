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
    if (!SHARED_PROJECTS_ENABLED) {
      return null;
    }
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
    if (!SHARED_PROJECTS_ENABLED) {
      return false;
    }
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
    if (!SHARED_PROJECTS_ENABLED) {
      return false;
    }
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
    return true;
  }

  async function purgeDeletedSharedProjectLocalReferences(projectKey = '', projectId = '') {
    if (!SHARED_PROJECTS_ENABLED) {
      return false;
    }
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
    const isLastSheet = openProjectTabs.length === 1;
    return window.confirm(
      localizeText(
        isLastSheet
          ? `最後のシート「${displayLabel}」をプロジェクトから削除し、新しい空のシートを作成します。`
          : `シート「${displayLabel}」をプロジェクトから削除します。`,
        isLastSheet
          ? `Delete the last sheet "${displayLabel}" and create a new empty sheet?`
          : `Delete the sheet "${displayLabel}" from this project?`
      )
    );
  }

  function planProjectSheetRemoval(sheetId) {
    const targetId = typeof sheetId === 'string' ? sheetId : '';
    const index = findOpenProjectTabIndex(targetId);
    if (!targetId || index < 0) return null;
    const target = openProjectTabs[index];
    if (!target) return null;
    const wasActive = target.id === activeOpenProjectTabId;
    const fallback = wasActive
      ? (openProjectTabs[index + 1] || openProjectTabs[index - 1] || null)
      : null;
    return {
      targetId,
      target,
      index,
      wasActive,
      isLastSheet: openProjectTabs.length === 1,
      nextActiveSheetId: fallback?.id || '',
      sheetOrder: openProjectTabs.map(tab => tab?.id || ''),
    };
  }

  async function rollbackProjectSheetRemoval(transaction) {
    if (!transaction || !Array.isArray(transaction.tabs)) return false;
    openProjectTabs.splice(0, openProjectTabs.length, ...transaction.tabs);
    activeOpenProjectTabId = transaction.activeOpenProjectTabId;
    const previous = transaction.tabs.find(tab => tab?.id === transaction.activeOpenProjectTabId);
    if (previous?.project && typeof previous.project === 'object') {
      await loadDocumentFromProjectPayload(previous.project, {
        projectId: previous.projectId || autosaveProjectId || '',
        suppressAutosaveStatus: true,
        suppressProjectSheetsRestore: true,
      });
    }
    renderOpenProjectTabs();
    return true;
  }

  async function commitProjectSheetRemoval(plan) {
    if (!plan?.targetId || openProjectTabBusy) return false;
    const currentIndex = findOpenProjectTabIndex(plan.targetId);
    if (currentIndex < 0 || openProjectTabs[currentIndex] !== plan.target) return false;
    const transaction = {
      tabs: openProjectTabs.slice(),
      activeOpenProjectTabId,
      projectHomeVisible,
    };
    openProjectTabBusy = true;
    try {
      if (plan.isLastSheet) {
        const replacement = await createReplacementEmptySheetTab?.({
          projectId: plan.target.projectId || autosaveProjectId || '',
          sheetIndex: 1,
        });
        if (!replacement?.project || !replacement.id) throw new Error('ERR_EMPTY_SHEET_CANDIDATE_FAILED');
        openProjectTabs.splice(currentIndex, 1, replacement);
        activeOpenProjectTabId = replacement.id;
        suppressOpenProjectTabAutoInitialize = false;
        const loaded = await loadDocumentFromProjectPayload(replacement.project, {
          projectId: replacement.projectId || autosaveProjectId || '',
          suppressAutosaveStatus: true,
          suppressProjectSheetsRestore: true,
          sourcePersistenceState: {
            sourceStorageAdapterId: null,
            sourceKind: 'new',
            sourceProjectToken: replacement.sourceProjectToken || null,
            lastSavedStorageAdapterId: null,
            projectSaveHandleState: 'none',
          },
        });
        if (!loaded || loaded === 'deferred') throw new Error('ERR_EMPTY_SHEET_ACTIVATE_FAILED');
      } else {
        if (plan.wasActive) {
          const activateTarget = typeof activateProjectSheetForRemoval === 'function'
            ? activateProjectSheetForRemoval
            : activateOpenProjectTab;
          const switched = await activateTarget(plan.nextActiveSheetId, {
            skipPersistCurrent: true,
            announce: false,
          });
          if (!switched) throw new Error('ERR_SHEET_REMOVAL_ACTIVATE_FAILED');
        }
        const removalIndex = findOpenProjectTabIndex(plan.targetId);
        if (removalIndex < 0) throw new Error('ERR_SHEET_REMOVAL_TARGET_MISSING');
        openProjectTabs.splice(removalIndex, 1);
      }
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleSessionPersist({ includeSnapshots: true });
      scheduleAutosaveSnapshot();
      renderOpenProjectTabs();
      updateAutosaveStatus(
        plan.isLastSheet
          ? localizeText('最後のシートを削除し、新しい空のシートを作成しました', 'Deleted the last sheet and created a new empty sheet')
          : localizeText('シートをプロジェクトから削除しました', 'Deleted sheet from project'),
        'success'
      );
      return true;
    } catch (error) {
      console.warn('Failed to remove project sheet; rolling back', error);
      await rollbackProjectSheetRemoval(transaction);
      updateAutosaveStatus(localizeText('シートの削除に失敗しました', 'Failed to delete sheet'), 'error');
      return false;
    } finally {
      openProjectTabBusy = false;
    }
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
      ensureOpenProjectTabsInitialized?.();
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
    console.info('[sheet-switch-debug:start]', {
      fromSheetId: previousActiveId,
      toSheetId: targetId,
      activeSheetIdBefore: previousActiveId,
      sheetIds: openProjectTabs.map(tab => tab?.id || ''),
      target: {
        id: target?.id || '',
        source: target?.source || '',
        fileName: target?.fileName || '',
        hasProject: Boolean(target?.project && typeof target.project === 'object'),
        hasDocument: Boolean(target?.project?.document && typeof target.project.document === 'object'),
        hasCanvases: Array.isArray(target?.project?.document?.canvases),
        hasFrames: Array.isArray(target?.project?.document?.frames),
      },
    });
    const targetProjectId = normalizeAutosaveProjectId(target?.projectId || '');
    let targetProjectPayload = target?.project && typeof target.project === 'object'
      ? target.project
      : null;
    const guardedProjectTabIds = Array.from(new Set([previousActiveId, target.id].filter(Boolean)));
    guardedProjectTabIds.forEach(retainOpenProjectTabProjectWriteGuard);
    if (!skipPersistCurrent && previousActiveId && findOpenProjectTabIndex(previousActiveId) >= 0) {
      const persistedCurrentSheet = await persistActiveOpenProjectTab({
        flushAutosave: true,
        retainProjectPayload: true,
      });
      if (!persistedCurrentSheet) {
        updateAutosaveStatus(localizeText('現在のシートを保持できなかったため、切替を中止しました', 'Sheet switch was canceled because the current sheet could not be preserved'), 'error');
        guardedProjectTabIds.forEach(releaseOpenProjectTabProjectWriteGuard);
        return false;
      }
    }
    if (!targetProjectPayload) {
      const storedPackagedProject = typeof resolveStoredLocalProjectPayloadForProjectId === 'function'
        ? resolveStoredLocalProjectPayloadForProjectId(targetProjectId)
        : null;
      const latestEntries = storedPackagedProject ? [] : await loadRecentProjectsMetadata();
      const latestEntry = storedPackagedProject
        ? null
        : (latestEntries.find(entry => normalizeAutosaveProjectId(entry?.id || '') === targetProjectId) || recentProjectsCache.get(targetProjectId) || null);
      const reconstructed = storedPackagedProject && typeof storedPackagedProject === 'object'
        ? storedPackagedProject
        : (typeof reconstructLocalRecentProjectPayload === 'function'
          ? reconstructLocalRecentProjectPayload(latestEntry)
          : null);
      targetProjectPayload = reconstructed && typeof reconstructed === 'object'
        ? (typeof extractLocalProjectSheetPayload === 'function'
          ? extractLocalProjectSheetPayload(reconstructed, target.id) || reconstructed
          : reconstructed)
        : null;
      console.info('[sheet-switch-debug:reconstruct]', {
        fromSheetId: previousActiveId,
        toSheetId: targetId,
        projectId: targetProjectId,
        reconstructed: Boolean(reconstructed && typeof reconstructed === 'object'),
        hasTargetProjectPayload: Boolean(targetProjectPayload && typeof targetProjectPayload === 'object'),
        reconstructedActiveSheetId: typeof reconstructed?.activeSheetId === 'string' ? reconstructed.activeSheetId : '',
        reconstructedSheetIds: Array.isArray(reconstructed?.sheets)
          ? reconstructed.sheets.map(sheet => sheet?.id || '')
          : [],
      });
      if (!targetProjectPayload) {
        console.warn('[sheet-switch-debug:missing-target-project]', {
          fromSheetId: previousActiveId,
          toSheetId: targetId,
          projectId: targetProjectId,
          sheetIds: openProjectTabs.map(tab => tab?.id || ''),
        });
        guardedProjectTabIds.forEach(releaseOpenProjectTabProjectWriteGuard);
        return false;
      }
    }
    // Clear any leftover shared session before activating a local-only tab.
    try {
      if (activeSharedProjectKey) {
        clearActiveSharedProjectSession('tab-switch');
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
      const loaded = await loadDocumentFromProjectPayload(targetProjectPayload, {
        projectId: target.projectId || '',
        suppressAutosaveStatus: true,
        qrEditPayload: target?.qrEditPayload || null,
        suppressProjectSheetsRestore: true,
      });
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
        console.warn('[sheet-switch-debug:load-failed]', {
          fromSheetId: previousActiveId,
          toSheetId: targetId,
          activeSheetIdAfter: activeOpenProjectTabId,
          hasTargetProjectPayload: Boolean(targetProjectPayload && typeof targetProjectPayload === 'object'),
          hasTargetDocument: Boolean(targetProjectPayload?.document && typeof targetProjectPayload.document === 'object'),
          hasTargetCanvases: Array.isArray(targetProjectPayload?.document?.canvases),
          hasTargetFrames: Array.isArray(targetProjectPayload?.document?.frames),
        });
        updateAutosaveStatus(localizeText('シートの切替に失敗しました', 'Failed to switch sheet'), 'error');
        return false;
      }
      queueProjectTabViewportReset(target.id);
      if (target.unsaved) {
        markDocumentUnsavedChange();
      } else {
        resetDocumentUnsavedChanges();
      }
      hydrateActiveLocalProjectJournalFromRecentEntry?.(
        recentProjectsCache.get(targetProjectId) || null,
        targetProjectId
      );
      openProjectTabs.forEach((tab, index) => {
        if (!tab || tab.id === target.id) {
          return;
        }
        if (tab.residentProjectLoaded === true && tab.project && typeof tab.project === 'object') {
          return;
        }
        openProjectTabs[index] = {
          ...tab,
          project: null,
          residentProjectLoaded: false,
        };
      });
      pruneInactiveCanvasDirectCaches?.();
      console.info('[sheet-switch-debug:success]', {
        fromSheetId: previousActiveId,
        toSheetId: targetId,
        activeSheetIdAfter: activeOpenProjectTabId,
        activeDocumentName: state.documentName || '',
        targetSource: target?.source || '',
        targetFileName: target?.fileName || '',
      });
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
      console.warn('Failed to activate local project tab', error);
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
    ensureOpenProjectTabsInitialized?.();
    const plan = planProjectSheetRemoval(targetId);
    if (!plan) {
      return false;
    }
    if (plan.wasActive && isMultiMasterProjectReplacementBlocked()) {
      setMultiStatus(
        localizeText(
          '共有中のメインプロジェクトは、マスター接続中は閉じられません。先に共有を切断してください。',
          'You cannot close the shared main project while connected as master. Disconnect collab first.'
        ),
        'warn'
      );
      return false;
    }
    if (!confirmCloseOpenProjectTab(plan.target, { active: plan.wasActive })) {
      return false;
    }
    return await commitProjectSheetRemoval(plan);
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
    planProjectSheetRemoval,
    commitProjectSheetRemoval,
    rollbackProjectSheetRemoval,
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
