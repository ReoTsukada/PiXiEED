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
    MAX_PROJECT_SHEETS,
    getOpenProjectTabBusy,
    setOpenProjectTabBusy,
    getAutosaveProjectId,
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
  } = {}) {
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

    async function createNewSheetTab() {
      if (getOpenProjectTabBusy?.()) {
        return false;
      }
      ensureOpenProjectTabsInitialized?.();
      if (openProjectTabs.length >= MAX_PROJECT_SHEETS) {
        updateAutosaveStatus(
          localizeText(
            `シートは最大 ${MAX_PROJECT_SHEETS} 枚です`,
            `You can add up to ${MAX_PROJECT_SHEETS} sheets`
          ),
          'warn'
        );
        return false;
      }
      setOpenProjectTabBusy?.(true);
      try {
        await persistActiveOpenProjectTab?.({ flushAutosave: false });
        const sheetIndex = openProjectTabs.length + 1;
        const packaged = createBlankSheetPackagedProject(sheetIndex);
        const fileName = normalizeDocumentName(packaged?.document?.documentName || localizeText(`シート ${sheetIndex}`, `Sheet ${sheetIndex}`));
        const autosaveProjectId = getAutosaveProjectId?.();
        const activePersistenceState = typeof getActiveProjectPersistenceState === 'function'
          ? (getActiveProjectPersistenceState() || null)
          : null;
        const nextTab = createOpenProjectSheetTabFromPackagedProject({
          project: packaged,
          projectId: autosaveProjectId,
          fileName,
          label: extractDocumentBaseName(fileName),
          source: 'sheet',
          sourceStorageAdapterId: activePersistenceState?.sourceStorageAdapterId ?? null,
          sourceKind: activePersistenceState?.sourceKind ?? 'unknown',
          sourceProjectToken: activePersistenceState?.sourceProjectToken ?? null,
          lastSavedStorageAdapterId: activePersistenceState?.lastSavedStorageAdapterId ?? null,
          projectSaveHandleState: activePersistenceState?.projectSaveHandleState ?? 'none',
        });
        if (!nextTab) {
          return false;
        }
        openProjectTabs.push(nextTab);
        setActiveOpenProjectTabId?.(nextTab.id);
        setSuppressOpenProjectTabAutoInitialize?.(false);
        renderOpenProjectTabs?.();
        const loaded = await loadDocumentFromProjectPayload(packaged, {
          projectId: nextTab.projectId || getAutosaveProjectId?.(),
          suppressAutosaveStatus: true,
          suppressProjectSheetsRestore: true,
        });
        if (!loaded) {
          const insertedIndex = findOpenProjectTabIndex(nextTab.id);
          if (insertedIndex >= 0) {
            openProjectTabs.splice(insertedIndex, 1);
          }
          renderOpenProjectTabs?.();
          return false;
        }
        markAutosaveDirty?.();
        markDocumentUnsavedChange?.();
        scheduleSessionPersist?.({ includeSnapshots: true });
        scheduleAutosaveSnapshot?.();
        updateAutosaveStatus(
          localizeText('新規シートを追加しました', 'Added a new sheet'),
          'success'
        );
        return true;
      } finally {
        setOpenProjectTabBusy?.(false);
        renderOpenProjectTabs?.();
      }
    }

    function openProjectTabAddPicker() {
      if (getOpenProjectTabBusy?.()) {
        return;
      }
      void createNewSheetTab();
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
      openProjectTabAddPicker,
      setupOpenProjectTabs,
    };
  }

  root.openProjectTabSheetActions = {
    createOpenProjectTabSheetActions,
  };
})();
