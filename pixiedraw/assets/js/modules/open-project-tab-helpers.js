(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createOpenProjectTabHelpers({
    openProjectTabs,
    recentProjectsCache,
    openProjectTabProjectWriteGuards,
    openProjectTabLongPressState,
    SHARED_PROJECTS_ENABLED,
    getActiveOpenProjectTabId,
    getOpenProjectTabBusy,
    getOpenProjectTabSequence,
    setOpenProjectTabSequence,
    getProjectTabViewportResetToken,
    setProjectTabViewportResetToken,
    normalizeAutosaveProjectId,
    normalizeMultiProjectKey,
    SHARED_PROJECT_ID_PREFIX,
    buildSharedRecentProjectId,
    isSharedRecentProjectEntry,
    normalizeSharedRecentProjectEntry,
    resetOpenedDocumentViewport,
    OPEN_PROJECT_TAB_LONG_PRESS_MS,
    OPEN_PROJECT_TAB_LONG_PRESS_MOVE_TOLERANCE_PX,
    renameOpenProjectTab,
  } = {}) {
    function createOpenProjectTabId() {
      const nextSequence = Math.max(0, Math.round(Number(getOpenProjectTabSequence?.()) || 0)) + 1;
      setOpenProjectTabSequence?.(nextSequence);
      return `project-tab-${Date.now().toString(36)}-${nextSequence.toString(36)}`;
    }

    function findOpenProjectTabIndex(tabId) {
      if (!tabId) {
        return -1;
      }
      return openProjectTabs.findIndex(tab => tab?.id === tabId);
    }

    function findOpenProjectTabIndexByProjectId(projectId) {
      const normalized = normalizeAutosaveProjectId(projectId || '');
      if (!normalized) {
        return -1;
      }
      return openProjectTabs.findIndex(tab => normalizeAutosaveProjectId(tab?.projectId || '') === normalized);
    }

    function queueProjectTabViewportReset(tabId = getActiveOpenProjectTabId?.()) {
      const expectedTabId = typeof tabId === 'string' ? tabId : '';
      const token = Math.max(0, Math.round(Number(getProjectTabViewportResetToken?.()) || 0)) + 1;
      setProjectTabViewportResetToken?.(token);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (token !== getProjectTabViewportResetToken?.()) {
            return;
          }
          if (expectedTabId && expectedTabId !== getActiveOpenProjectTabId?.()) {
            return;
          }
          resetOpenedDocumentViewport?.({ defer: false });
        });
      });
    }

    function getSharedProjectKeyFromProjectId(projectId = '') {
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || '');
      if (!normalizedProjectId || !normalizedProjectId.startsWith(SHARED_PROJECT_ID_PREFIX)) {
        return '';
      }
      return normalizeMultiProjectKey(normalizedProjectId.slice(SHARED_PROJECT_ID_PREFIX.length));
    }

    function getSharedRecentProjectEntryForTab(tab = null) {
      if (!SHARED_PROJECTS_ENABLED) {
        return null;
      }
      if (!tab || typeof tab !== 'object') {
        return null;
      }
      const tabProjectId = normalizeAutosaveProjectId(tab.projectId || '');
      const directEntry = tabProjectId ? recentProjectsCache.get(tabProjectId) : null;
      if (isSharedRecentProjectEntry(directEntry)) {
        return normalizeSharedRecentProjectEntry(directEntry);
      }
      const tabProjectKey = normalizeMultiProjectKey(tab.sharedProjectKey || '')
        || getSharedProjectKeyFromProjectId(tabProjectId);
      if (!tabProjectKey) {
        return null;
      }
      const sharedRecentProjectId = buildSharedRecentProjectId(tabProjectKey);
      const canonicalEntry = recentProjectsCache.get(sharedRecentProjectId) || null;
      if (isSharedRecentProjectEntry(canonicalEntry)) {
        return normalizeSharedRecentProjectEntry(canonicalEntry);
      }
      return normalizeSharedRecentProjectEntry({
        id: sharedRecentProjectId,
        sharedProjectKey: tabProjectKey,
        sharedProjectBackendId: typeof tab.sharedProjectBackendId === 'string' ? tab.sharedProjectBackendId : '',
        sharedProjectRevision: Math.max(0, Math.round(Number(tab.sharedProjectRevision) || 0)),
        sharedProjectStructureRevision: Math.max(0, Math.round(Number(tab.sharedProjectStructureRevision) || 0)),
        name: tab.label || tab.fileName || tabProjectKey,
        fileName: tab.fileName || `${tabProjectKey}.pixiedraw`,
        sharedRoleHint: tab.sharedRoleHint || 'guest',
        sharedAutoJoin: tab.sharedAutoJoin !== false,
        project: tab.project && typeof tab.project === 'object' ? tab.project : null,
      });
    }

    function getOpenProjectTabSharedKey(tab = null) {
      if (!tab || typeof tab !== 'object') {
        return '';
      }
      if (!SHARED_PROJECTS_ENABLED) {
        return '';
      }
      return normalizeMultiProjectKey(tab.sharedProjectKey || '')
        || getSharedProjectKeyFromProjectId(tab.projectId || '');
    }

    function retainOpenProjectTabProjectWriteGuard(tabId = '') {
      const normalizedTabId = typeof tabId === 'string' ? tabId : '';
      if (!normalizedTabId) {
        return;
      }
      openProjectTabProjectWriteGuards.set(
        normalizedTabId,
        Math.max(0, Math.round(Number(openProjectTabProjectWriteGuards.get(normalizedTabId)) || 0)) + 1
      );
    }

    function releaseOpenProjectTabProjectWriteGuard(tabId = '') {
      const normalizedTabId = typeof tabId === 'string' ? tabId : '';
      if (!normalizedTabId || !openProjectTabProjectWriteGuards.has(normalizedTabId)) {
        return;
      }
      const nextCount = Math.max(0, Math.round(Number(openProjectTabProjectWriteGuards.get(normalizedTabId)) || 0) - 1);
      if (nextCount > 0) {
        openProjectTabProjectWriteGuards.set(normalizedTabId, nextCount);
      } else {
        openProjectTabProjectWriteGuards.delete(normalizedTabId);
      }
    }

    function isOpenProjectTabProjectWriteGuarded(tabId = '') {
      const normalizedTabId = typeof tabId === 'string' ? tabId : '';
      return Boolean(normalizedTabId && openProjectTabProjectWriteGuards.has(normalizedTabId));
    }

    function matchesDeletedProjectOpenTab(tab = null, {
      projectId = '',
      projectKey = '',
      backendId = '',
    } = {}) {
      if (!tab || typeof tab !== 'object') {
        return false;
      }
      const normalizedProjectId = normalizeAutosaveProjectId(projectId || '');
      const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '')
        || getSharedProjectKeyFromProjectId(normalizedProjectId);
      const normalizedBackendId = typeof backendId === 'string' ? backendId.trim() : '';
      const sharedRecentProjectId = normalizedProjectKey
        ? buildSharedRecentProjectId(normalizedProjectKey)
        : '';
      const tabProjectId = normalizeAutosaveProjectId(tab.projectId || '');
      const tabSharedKey = getOpenProjectTabSharedKey(tab);
      const tabBackendId = typeof tab.sharedProjectBackendId === 'string'
        ? tab.sharedProjectBackendId.trim()
        : '';
      return Boolean(
        (normalizedProjectId && tabProjectId === normalizedProjectId)
        || (sharedRecentProjectId && tabProjectId === sharedRecentProjectId)
        || (normalizedProjectKey && tabSharedKey === normalizedProjectKey)
        || (normalizedBackendId && tabBackendId && tabBackendId === normalizedBackendId)
      );
    }

    function getRecentProjectOpenTabProjectId(entry = null) {
      if (!entry || typeof entry !== 'object') {
        return '';
      }
      const sharedEntry = normalizeSharedRecentProjectEntry(entry);
      if (sharedEntry) {
        return buildSharedRecentProjectId(sharedEntry.sharedProjectKey || '');
      }
      return normalizeAutosaveProjectId(entry.id || '');
    }

    function findOpenProjectTabIndexForRecentProjectEntry(entry = null) {
      if (!entry || typeof entry !== 'object') {
        return -1;
      }
      const sharedEntry = normalizeSharedRecentProjectEntry(entry);
      const projectId = getRecentProjectOpenTabProjectId(entry);
      const exactIndex = projectId ? findOpenProjectTabIndexByProjectId(projectId) : -1;
      if (exactIndex >= 0) {
        return exactIndex;
      }
      if (!sharedEntry) {
        return -1;
      }
      return openProjectTabs.findIndex(tab => matchesDeletedProjectOpenTab(tab, {
        projectId,
        projectKey: sharedEntry.sharedProjectKey || '',
        backendId: sharedEntry.sharedProjectBackendId || '',
      }));
    }

    function getActiveOpenProjectTab() {
      const index = findOpenProjectTabIndex(getActiveOpenProjectTabId?.());
      return index >= 0 ? openProjectTabs[index] : null;
    }

    function isSharedOpenProjectTab(tab = null) {
      if (!SHARED_PROJECTS_ENABLED) {
        return false;
      }
      if (!tab || typeof tab !== 'object') {
        return false;
      }
      const tabProjectId = normalizeAutosaveProjectId(tab.projectId || '');
      return Boolean(
        getOpenProjectTabSharedKey(tab)
        || tabProjectId.startsWith(SHARED_PROJECT_ID_PREFIX)
        || tab.source === 'shared'
        || tab.source === 'shared-recent'
      );
    }

    function clearOpenProjectTabLongPressTimer() {
      if (openProjectTabLongPressState.timerId !== null) {
        window.clearTimeout(openProjectTabLongPressState.timerId);
        openProjectTabLongPressState.timerId = null;
      }
    }

    function cleanupOpenProjectTabLongPressTracking() {
      clearOpenProjectTabLongPressTimer();
      openProjectTabLongPressState.pointerId = null;
      openProjectTabLongPressState.tabId = '';
      openProjectTabLongPressState.startX = 0;
      openProjectTabLongPressState.startY = 0;
      openProjectTabLongPressState.fired = false;
    }

    function suppressNextOpenProjectTabClick(tabId = '') {
      openProjectTabLongPressState.suppressClickTabId = typeof tabId === 'string' ? tabId : '';
      openProjectTabLongPressState.suppressClickUntil = Date.now() + 900;
    }

    function shouldSuppressOpenProjectTabClick(tabId = '') {
      const targetId = typeof tabId === 'string' ? tabId : '';
      if (!targetId) {
        return false;
      }
      if (Date.now() > openProjectTabLongPressState.suppressClickUntil) {
        openProjectTabLongPressState.suppressClickTabId = '';
        openProjectTabLongPressState.suppressClickUntil = 0;
        return false;
      }
      return openProjectTabLongPressState.suppressClickTabId === targetId;
    }

    function beginOpenProjectTabLongPress(event, tabId = '') {
      if (!event || getOpenProjectTabBusy?.() || !tabId) {
        return;
      }
      const pointerType = typeof event.pointerType === 'string' ? event.pointerType : '';
      if (pointerType !== 'touch' && pointerType !== 'pen') {
        return;
      }
      cleanupOpenProjectTabLongPressTracking();
      openProjectTabLongPressState.pointerId = event.pointerId ?? null;
      openProjectTabLongPressState.tabId = tabId;
      openProjectTabLongPressState.startX = Number(event.clientX) || 0;
      openProjectTabLongPressState.startY = Number(event.clientY) || 0;
      openProjectTabLongPressState.timerId = window.setTimeout(() => {
        openProjectTabLongPressState.timerId = null;
        if (!openProjectTabLongPressState.tabId) {
          return;
        }
        openProjectTabLongPressState.fired = true;
        suppressNextOpenProjectTabClick(openProjectTabLongPressState.tabId);
        renameOpenProjectTab?.(openProjectTabLongPressState.tabId);
      }, OPEN_PROJECT_TAB_LONG_PRESS_MS);
    }

    function updateOpenProjectTabLongPress(event) {
      if (openProjectTabLongPressState.pointerId === null) {
        return;
      }
      if ((event.pointerId ?? null) !== openProjectTabLongPressState.pointerId) {
        return;
      }
      const dx = (Number(event.clientX) || 0) - openProjectTabLongPressState.startX;
      const dy = (Number(event.clientY) || 0) - openProjectTabLongPressState.startY;
      if (Math.hypot(dx, dy) > OPEN_PROJECT_TAB_LONG_PRESS_MOVE_TOLERANCE_PX) {
        cleanupOpenProjectTabLongPressTracking();
      }
    }

    function endOpenProjectTabLongPress(event) {
      if (openProjectTabLongPressState.pointerId === null) {
        return;
      }
      if (event && (event.pointerId ?? null) !== openProjectTabLongPressState.pointerId) {
        return;
      }
      cleanupOpenProjectTabLongPressTracking();
    }

    return {
      createOpenProjectTabId,
      findOpenProjectTabIndex,
      findOpenProjectTabIndexByProjectId,
      queueProjectTabViewportReset,
      getSharedProjectKeyFromProjectId,
      getSharedRecentProjectEntryForTab,
      getOpenProjectTabSharedKey,
      retainOpenProjectTabProjectWriteGuard,
      releaseOpenProjectTabProjectWriteGuard,
      isOpenProjectTabProjectWriteGuarded,
      matchesDeletedProjectOpenTab,
      getRecentProjectOpenTabProjectId,
      findOpenProjectTabIndexForRecentProjectEntry,
      getActiveOpenProjectTab,
      isSharedOpenProjectTab,
      clearOpenProjectTabLongPressTimer,
      cleanupOpenProjectTabLongPressTracking,
      suppressNextOpenProjectTabClick,
      shouldSuppressOpenProjectTabClick,
      beginOpenProjectTabLongPress,
      updateOpenProjectTabLongPress,
      endOpenProjectTabLongPress,
    };
  }

  root.openProjectTabHelpers = {
    createOpenProjectTabHelpers,
  };
})();
