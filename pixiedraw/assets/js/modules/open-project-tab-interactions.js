(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createOpenProjectTabInteractions({
    dom,
    ensureOpenProjectTabsInitialized,
    showProjectHomeScreen,
    hideProjectHomeScreen,
    closeOpenProjectTab,
    activateOpenProjectTab,
    renameOpenProjectTab,
    shouldSuppressOpenProjectTabClick,
    beginOpenProjectTabLongPress,
    updateOpenProjectTabLongPress,
    endOpenProjectTabLongPress,
  } = {}) {
    function setupOpenProjectTabs() {
      const list = dom?.projectTabsList;
      if (!(list instanceof HTMLElement)) return;
      if (list.dataset.bound === 'true') {
        ensureOpenProjectTabsInitialized?.();
        return;
      }
      list.dataset.bound = 'true';
      list.addEventListener('pointerdown', event => {
        const button = (event.target instanceof Element)
          ? event.target.closest('button[data-project-tab-id]')
          : null;
        if (button instanceof HTMLButtonElement) {
          beginOpenProjectTabLongPress?.(event, button.dataset.projectTabId || '');
        }
      }, { passive: true });
      list.addEventListener('pointermove', event => updateOpenProjectTabLongPress?.(event), { passive: true });
      list.addEventListener('pointerup', event => endOpenProjectTabLongPress?.(event), { passive: true });
      list.addEventListener('pointercancel', event => endOpenProjectTabLongPress?.(event), { passive: true });
      list.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;
        if (target.closest('button[data-project-home-tab]') instanceof HTMLButtonElement) {
          showProjectHomeScreen?.({ refresh: true });
          return;
        }
        const closeButton = target.closest('button[data-project-tab-close-id]');
        if (closeButton instanceof HTMLButtonElement) {
          void closeOpenProjectTab?.(closeButton.dataset.projectTabCloseId || '');
          return;
        }
        const selectButton = target.closest('button[data-project-tab-id]');
        if (!(selectButton instanceof HTMLButtonElement)) return;
        const tabId = selectButton.dataset.projectTabId || '';
        if (shouldSuppressOpenProjectTabClick?.(tabId)) {
          event.preventDefault();
          return;
        }
        void activateOpenProjectTab?.(tabId).then(switched => {
          if (switched) hideProjectHomeScreen?.();
        });
      });
      const rename = event => {
        const button = (event.target instanceof Element)
          ? event.target.closest('button[data-project-tab-id]')
          : null;
        if (!(button instanceof HTMLButtonElement)) return;
        const tabId = button.dataset.projectTabId || '';
        if (!tabId) return;
        event.preventDefault();
        renameOpenProjectTab?.(tabId);
      };
      list.addEventListener('dblclick', rename);
      list.addEventListener('contextmenu', rename);
      ensureOpenProjectTabsInitialized?.();
    }

    return Object.freeze({ setupOpenProjectTabs });
  }

  root.openProjectTabInteractions = Object.freeze({ createOpenProjectTabInteractions });
})();
