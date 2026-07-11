(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createOpenProjectTabSheetActions({
    state,
    dom,
    openProjectTabs,
    DEFAULT_CANVAS_SIZE,
    NEW_PROJECT_PALETTE_PRESET_DEFAULT,
    getOpenProjectTabBusy,
    setOpenProjectTabBusy,
    getAutosaveProjectId,
    getActiveOpenProjectTabId,
    getActiveProjectPersistenceState,
    getNewProjectPalettePresetId,
    setActiveOpenProjectTabId,
    setSuppressOpenProjectTabAutoInitialize,
    normalizeDocumentName,
    localizeText,
    createInitialState,
    buildPackagedProjectPayload,
    ensureOpenProjectTabsInitialized,
    persistActiveOpenProjectTab,
    createOpenProjectSheetTabFromPackagedProject,
    extractDocumentBaseName,
    renderOpenProjectTabs,
    loadDocumentFromProjectPayload,
    findOpenProjectTabIndex,
    markAutosaveDirty,
    markDocumentUnsavedChange,
    scheduleSessionPersist,
    scheduleAutosaveSnapshot,
    updateAutosaveStatus,
    beginOpenProjectTabLongPress,
    updateOpenProjectTabLongPress,
    endOpenProjectTabLongPress,
    showProjectHomeScreen,
    closeOpenProjectTab,
    shouldSuppressOpenProjectTabClick,
    activateOpenProjectTab,
    hideProjectHomeScreen,
    renameOpenProjectTab,
    openProjectSheetDialog,
    openImageSheetDialog,
    openGifSheetDialog,
    loadRecentProjects,
    appendRecentProjectAsSheets,
  } = {}) {
    const collectionUtils = root.projectSheetCollectionUtils?.createProjectSheetCollectionUtils?.();
    const transactionUtils = root.projectSheetTransactionUtils?.createProjectSheetTransactionUtils?.({ collectionUtils });
    let addMenu = null;
    let addMenuAbortController = null;
    let addMenuBusy = false;
    function createBlankSheetPackagedProject(index = openProjectTabs.length + 1) {
      const sheetName = normalizeDocumentName(localizeText(`シート ${index}`, `Sheet ${index}`));
      const snapshot = createInitialState({
        width: DEFAULT_CANVAS_SIZE,
        height: DEFAULT_CANVAS_SIZE,
        name: sheetName,
        uiTheme: state.uiTheme,
        palettePreset: getNewProjectPalettePresetId?.() || NEW_PROJECT_PALETTE_PRESET_DEFAULT,
      });
      return buildPackagedProjectPayload(snapshot, {
        session: null,
        includeSheets: false,
      });
    }

    async function restoreTransactionRuntime(transaction) {
      const previous = transaction?.tabs?.find(tab => tab?.id === transaction?.activeOpenProjectTabId);
      if (!previous?.project) return;
      await loadDocumentFromProjectPayload?.(previous.project, {
        projectId: previous.projectId || getAutosaveProjectId?.(),
        suppressAutosaveStatus: true,
        suppressProjectSheetsRestore: true,
      });
    }

    async function commitSheetCandidate(candidate, { announce = true } = {}) {
      const validation = transactionUtils?.validateCandidates?.([candidate], {
        existingSheetIds: openProjectTabs.map(tab => tab?.id || ''),
      });
      if (!validation?.valid) return { committed: false, reason: validation?.code || 'ERR_SHEET_CANDIDATE_INVALID' };

      const transaction = transactionUtils?.createTransactionSnapshot?.({
        openProjectTabs,
        activeOpenProjectTabId: getActiveOpenProjectTabId?.() || '',
      }) || { tabs: openProjectTabs.slice(), activeOpenProjectTabId: getActiveOpenProjectTabId?.() || '' };
      try {
        const sheetIndex = openProjectTabs.length + 1;
        const fileName = normalizeDocumentName(candidate.fileName || candidate.project?.document?.documentName || localizeText(`シート ${sheetIndex}`, `Sheet ${sheetIndex}`));
        const nextTab = createOpenProjectSheetTabFromPackagedProject({
          id: candidate.id,
          project: candidate.project,
          projectId: getAutosaveProjectId?.(),
          fileName,
          label: candidate.label || extractDocumentBaseName(fileName),
          source: 'sheet',
          sourceStorageAdapterId: candidate.sourceStorageAdapterId || null,
          sourceKind: candidate.sourceKind || 'new',
          sourceProjectToken: candidate.sourceProjectToken || null,
          lastSavedStorageAdapterId: null,
          projectSaveHandleState: 'none',
          projectSaveHandle: null,
          projectSaveHandleMeta: null,
        });
        if (!nextTab) throw new Error('ERR_SHEET_TAB_CREATE_FAILED');
        openProjectTabs.push(nextTab);
        setActiveOpenProjectTabId?.(nextTab.id);
        setSuppressOpenProjectTabAutoInitialize?.(false);
        renderOpenProjectTabs?.();
        const loaded = await loadDocumentFromProjectPayload(candidate.project, {
          projectId: nextTab.projectId || getAutosaveProjectId?.(),
          suppressAutosaveStatus: true,
          suppressProjectSheetsRestore: true,
        });
        if (!loaded) throw new Error('ERR_SHEET_ACTIVATE_FAILED');
        markAutosaveDirty?.();
        markDocumentUnsavedChange?.();
        scheduleSessionPersist?.({ includeSnapshots: true });
        scheduleAutosaveSnapshot?.();
        if (announce) updateAutosaveStatus(localizeText('新規シートを追加しました', 'Added a new sheet'), 'success');
        return { committed: true, addedSheetIds: [nextTab.id], failures: [], warnings: [] };
      } catch (error) {
        transactionUtils?.rollbackSheetCandidate?.(transaction, { openProjectTabs, setActiveOpenProjectTabId });
        await restoreTransactionRuntime(transaction);
        renderOpenProjectTabs?.();
        console.warn('Failed to commit sheet candidate', error);
        return { committed: false, addedSheetIds: [], failures: [{ reason: error?.message || 'ERR_SHEET_COMMIT_FAILED' }], warnings: [] };
      }
    }

    async function createNewSheetTab() {
      if (getOpenProjectTabBusy?.()) {
        return false;
      }
      ensureOpenProjectTabsInitialized?.();
      setOpenProjectTabBusy?.(true);
      try {
        await persistActiveOpenProjectTab?.({ flushAutosave: false });
        const sheetIndex = openProjectTabs.length + 1;
        const packaged = createBlankSheetPackagedProject(sheetIndex);
        const candidate = collectionUtils?.prepareSheetCandidate?.('new', {
          project: packaged,
          fileName: normalizeDocumentName(packaged?.document?.documentName || localizeText(`シート ${sheetIndex}`, `Sheet ${sheetIndex}`)),
          sourceKind: 'new',
        }, {
          createId: () => `sheet-${crypto.randomUUID?.() || Date.now().toString(36)}`,
        });
        const result = await commitSheetCandidate(candidate);
        return result.committed;
      } finally {
        setOpenProjectTabBusy?.(false);
        renderOpenProjectTabs?.();
      }
    }

    function openProjectTabAddPicker() {
      if (getOpenProjectTabBusy?.()) {
        return;
      }
      if (addMenu) {
        closeProjectTabAddMenu();
        return;
      }
      addMenu = document.createElement('div');
      addMenu.className = 'project-tab-add-menu';
      addMenu.setAttribute('role', 'menu');
      addMenu.setAttribute('aria-label', localizeText('シートを追加', 'Add sheet'));
      addMenu.tabIndex = -1;
      const anchor = dom.projectTabsList?.querySelector?.('[data-project-tab-add="true"]');
      const rect = anchor?.getBoundingClientRect?.();
      if (rect) {
        const menuWidth = Math.min(260, Math.max(0, window.innerWidth - 16));
        addMenu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8))}px`;
        addMenu.style.top = `${Math.max(8, rect.bottom + 6)}px`;
      }
      document.body.appendChild(addMenu);
      addMenuAbortController = new AbortController();
      const { signal } = addMenuAbortController;
      document.addEventListener('pointerdown', event => {
        const target = event.target instanceof Node ? event.target : null;
        if (target && (addMenu?.contains(target) || anchor?.contains(target))) return;
        closeProjectTabAddMenu();
      }, { capture: true, signal });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        closeProjectTabAddMenu();
        anchor?.focus?.();
      }, { signal });

      const setBusy = busy => {
        addMenuBusy = Boolean(busy);
        addMenu?.querySelectorAll('button').forEach(button => { button.disabled = addMenuBusy; });
      };
      const run = async action => {
        if (addMenuBusy) return;
        setBusy(true);
        try {
          await action();
        } catch (error) {
          console.warn('Failed to add project sheet', error);
          updateAutosaveStatus?.(localizeText('シートの追加に失敗しました', 'Failed to add sheet'), 'warn');
        } finally {
          closeProjectTabAddMenu();
        }
      };
      const appendAction = (label, action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.textContent = label;
        button.addEventListener('click', () => { void run(action); });
        addMenu.appendChild(button);
        return button;
      };
      const firstButton = appendAction(localizeText('空のシートを作成', 'Create empty sheet'), () => createNewSheetTab());
      appendAction(localizeText('プロジェクトをシートとして追加', 'Add project as sheet'), () => openProjectSheetDialog?.());
      appendAction(localizeText('画像を追加', 'Add image'), () => openImageSheetDialog?.());
      appendAction(localizeText('GIFを追加', 'Add GIF'), () => openGifSheetDialog?.());
      const recentButton = document.createElement('button');
      recentButton.type = 'button';
      recentButton.setAttribute('role', 'menuitem');
      recentButton.textContent = localizeText('最近使ったプロジェクトから追加', 'Add from recent projects');
      recentButton.addEventListener('click', async () => {
        if (addMenuBusy) return;
        setBusy(true);
        try {
          const entries = await loadRecentProjects?.();
          if (!Array.isArray(entries) || !entries.length) {
            updateAutosaveStatus?.(localizeText('追加できる最近使ったプロジェクトがありません', 'No recent projects are available'), 'info');
            return;
          }
          addMenu.textContent = '';
          entries.slice(0, 12).forEach(entry => {
            const entryButton = document.createElement('button');
            entryButton.type = 'button';
            entryButton.setAttribute('role', 'menuitem');
            entryButton.textContent = entry?.name || entry?.project?.document?.documentName || localizeText('名称未設定', 'Untitled');
            entryButton.addEventListener('click', () => { void run(() => appendRecentProjectAsSheets?.(entry)); });
            addMenu.appendChild(entryButton);
          });
          addMenu.querySelector('button')?.focus();
        } catch (error) {
          console.warn('Failed to list recent projects for sheet append', error);
          updateAutosaveStatus?.(localizeText('最近使ったプロジェクトを取得できませんでした', 'Unable to load recent projects'), 'warn');
          closeProjectTabAddMenu();
        } finally {
          if (addMenu) setBusy(false);
        }
      });
      addMenu.appendChild(recentButton);
      firstButton.focus();
    }

    function closeProjectTabAddMenu() {
      addMenuAbortController?.abort();
      addMenuAbortController = null;
      addMenu?.remove();
      addMenu = null;
      addMenuBusy = false;
    }

    function getProjectTabAddDebugState() {
      const addButton = dom.projectTabsList?.querySelector?.('[data-project-tab-add="true"]') || null;
      const menuOpen = Boolean(addMenu?.isConnected);
      return {
        disabled: Boolean(addButton?.disabled),
        ariaDisabled: addButton?.getAttribute?.('aria-disabled') || null,
        pointerEvents: addButton ? window.getComputedStyle(addButton).pointerEvents : null,
        menuOpen,
        inFlight: addMenuBusy,
        commandInFlight: Boolean(getOpenProjectTabBusy?.()),
        overlayCount: document.querySelectorAll('[data-sheet-add-overlay]').length,
        connected: Boolean(addButton?.isConnected),
      };
    }

    function setupOpenProjectTabs() {
      const list = dom.projectTabsList;
      if (!(list instanceof HTMLElement)) {
        return;
      }
      if (list.dataset.bound === 'true') {
        ensureOpenProjectTabsInitialized?.();
        return;
      }
      list.dataset.bound = 'true';
      list.addEventListener('pointerdown', event => {
        const target = event.target instanceof Element ? event.target : null;
        const selectButton = target?.closest('button[data-project-tab-id]');
        if (!(selectButton instanceof HTMLButtonElement)) {
          return;
        }
        const tabId = selectButton.dataset.projectTabId || '';
        beginOpenProjectTabLongPress?.(event, tabId);
      }, { passive: true });
      list.addEventListener('pointermove', event => {
        updateOpenProjectTabLongPress?.(event);
      }, { passive: true });
      list.addEventListener('pointerup', event => {
        endOpenProjectTabLongPress?.(event);
      }, { passive: true });
      list.addEventListener('pointercancel', event => {
        endOpenProjectTabLongPress?.(event);
      }, { passive: true });
      list.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
          return;
        }
        const homeButton = target.closest('button[data-project-home-tab]');
        if (homeButton instanceof HTMLButtonElement) {
          showProjectHomeScreen?.({ refresh: true });
          return;
        }
        const closeButton = target.closest('button[data-project-tab-close-id]');
        if (closeButton instanceof HTMLButtonElement) {
          const tabId = closeButton.dataset.projectTabCloseId || '';
          void closeOpenProjectTab?.(tabId);
          return;
        }
        const addButton = target.closest('button[data-project-tab-add]');
        if (addButton instanceof HTMLButtonElement) {
          openProjectTabAddPicker();
          return;
        }
        const selectButton = target.closest('button[data-project-tab-id]');
        if (selectButton instanceof HTMLButtonElement) {
          const tabId = selectButton.dataset.projectTabId || '';
          if (shouldSuppressOpenProjectTabClick?.(tabId)) {
            event.preventDefault();
            return;
          }
          void activateOpenProjectTab?.(tabId).then(switched => {
            if (switched) {
              hideProjectHomeScreen?.();
            }
          });
        }
      });
      list.addEventListener('dblclick', event => {
        const target = event.target instanceof Element ? event.target : null;
        const selectButton = target?.closest('button[data-project-tab-id]');
        if (!(selectButton instanceof HTMLButtonElement)) {
          return;
        }
        const tabId = selectButton.dataset.projectTabId || '';
        if (!tabId) {
          return;
        }
        event.preventDefault();
        renameOpenProjectTab?.(tabId);
      });
      list.addEventListener('contextmenu', event => {
        const target = event.target instanceof Element ? event.target : null;
        const selectButton = target?.closest('button[data-project-tab-id]');
        if (!(selectButton instanceof HTMLButtonElement)) {
          return;
        }
        const tabId = selectButton.dataset.projectTabId || '';
        if (!tabId) {
          return;
        }
        event.preventDefault();
        renameOpenProjectTab?.(tabId);
      });
      ensureOpenProjectTabsInitialized?.();
    }

    return {
      createBlankSheetPackagedProject,
      createNewSheetTab,
      commitSheetCandidate,
      openProjectTabAddPicker,
      getProjectTabAddDebugState,
      setupOpenProjectTabs,
    };
  }

  root.openProjectTabSheetActions = {
    createOpenProjectTabSheetActions,
  };
})();
