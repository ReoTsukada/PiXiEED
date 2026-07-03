(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createOpenProjectTabView({
    state,
    dom,
    openProjectTabs,
    getActiveOpenProjectTabId,
    getProjectHomeVisible,
    getOpenProjectTabBusy,
    getOpenProjectTabsLastRenderSignature,
    setOpenProjectTabsLastRenderSignature,
    getOpenProjectTabsLastStructureSignature,
    setOpenProjectTabsLastStructureSignature,
    MAX_PROJECT_SHEETS,
    normalizeAutosaveProjectId,
    getAutosaveProjectId,
    extractDocumentBaseName,
    DEFAULT_DOCUMENT_NAME,
    localizeText,
  } = {}) {
    function getOpenProjectTabDisplayLabel(tab, { active = false } = {}) {
      if (typeof tab?.label === 'string' && tab.label.trim()) {
        return tab.label.trim();
      }
      const tabProjectId = normalizeAutosaveProjectId(tab?.projectId || '');
      const activeProjectId = normalizeAutosaveProjectId(getAutosaveProjectId?.() || '');
      if (active && tabProjectId && activeProjectId && tabProjectId === activeProjectId) {
        return extractDocumentBaseName(state.documentName || tab?.fileName || DEFAULT_DOCUMENT_NAME);
      }
      return extractDocumentBaseName(tab?.fileName || DEFAULT_DOCUMENT_NAME);
    }

    function getOpenProjectTabRenderLabel(tab, labelCounts, labelOrdinals, { active = false } = {}) {
      const baseLabel = getOpenProjectTabDisplayLabel(tab, { active });
      const duplicateCount = labelCounts instanceof Map ? (labelCounts.get(baseLabel) || 0) : 0;
      if (duplicateCount <= 1) {
        return baseLabel;
      }
      const nextOrdinal = (labelOrdinals.get(baseLabel) || 0) + 1;
      labelOrdinals.set(baseLabel, nextOrdinal);
      return `${baseLabel} (${nextOrdinal})`;
    }

    function buildOpenProjectTabsStructureSignature() {
      return JSON.stringify({
        maxTabs: MAX_PROJECT_SHEETS,
        tabs: openProjectTabs.map(tab => ({
          id: tab?.id || '',
          projectId: tab?.projectId || '',
          source: tab?.source || '',
          name: tab?.name || '',
          fileName: tab?.fileName || '',
          sharedProjectKey: tab?.sharedProjectKey || '',
          deferredRestore: Boolean(tab?.deferredRestore),
          remoteUpdateAvailable: Boolean(tab?.remoteUpdateAvailable),
        })),
      });
    }

    function syncOpenProjectTabActiveState() {
      const list = dom.projectTabsList;
      const bar = dom.projectTabsBar;
      if (!(list instanceof HTMLElement) || !(bar instanceof HTMLElement)) {
        return false;
      }
      bar.hidden = false;
      const projectHomeVisible = Boolean(getProjectHomeVisible?.());
      const activeOpenProjectTabId = getActiveOpenProjectTabId?.() || '';
      const homeItem = list.querySelector('.project-tab-item--home');
      const homeButton = list.querySelector('[data-project-home-tab="true"]');
      if (homeItem instanceof HTMLElement) {
        homeItem.classList.toggle('is-active', projectHomeVisible);
      }
      if (homeButton instanceof HTMLButtonElement) {
        homeButton.setAttribute('aria-selected', String(projectHomeVisible));
        homeButton.setAttribute('tabindex', projectHomeVisible ? '0' : '-1');
      }
      list.querySelectorAll('[data-project-tab-item-id]').forEach(item => {
        if (!(item instanceof HTMLElement)) return;
        const tabId = item.dataset.projectTabItemId || '';
        item.classList.toggle('is-active', !projectHomeVisible && tabId === activeOpenProjectTabId);
      });
      list.querySelectorAll('[data-project-tab-id]').forEach(button => {
        if (!(button instanceof HTMLButtonElement)) return;
        const tabId = button.dataset.projectTabId || '';
        const isActive = !projectHomeVisible && tabId === activeOpenProjectTabId;
        button.setAttribute('aria-selected', String(isActive));
        button.setAttribute('tabindex', isActive ? '0' : '-1');
      });
      const addButton = list.querySelector('[data-project-tab-add="true"]');
      if (addButton instanceof HTMLButtonElement) {
        addButton.disabled = getOpenProjectTabBusy?.() || openProjectTabs.length >= MAX_PROJECT_SHEETS;
      }
      return true;
    }

    function renderOpenProjectTabs() {
      const list = dom.projectTabsList;
      const bar = dom.projectTabsBar;
      if (!(list instanceof HTMLElement) || !(bar instanceof HTMLElement)) {
        return;
      }
      const structureSignature = buildOpenProjectTabsStructureSignature();
      const activeOpenProjectTabId = getActiveOpenProjectTabId?.() || '';
      const projectHomeVisible = Boolean(getProjectHomeVisible?.());
      const openProjectTabBusy = Boolean(getOpenProjectTabBusy?.());
      const renderSignature = JSON.stringify({
        activeOpenProjectTabId,
        projectHomeVisible,
        openProjectTabBusy,
        structureSignature,
      });
      if (renderSignature === getOpenProjectTabsLastRenderSignature?.()) {
        return;
      }
      if (
        structureSignature === getOpenProjectTabsLastStructureSignature?.()
        && list.childElementCount > 0
        && syncOpenProjectTabActiveState()
      ) {
        setOpenProjectTabsLastRenderSignature?.(renderSignature);
        return;
      }
      setOpenProjectTabsLastRenderSignature?.(renderSignature);
      setOpenProjectTabsLastStructureSignature?.(structureSignature);
      bar.hidden = false;
      list.innerHTML = '';
      const homeItem = document.createElement('div');
      homeItem.className = `project-tab-item project-tab-item--home${projectHomeVisible ? ' is-active' : ''}`;
      homeItem.setAttribute('role', 'presentation');
      const homeButton = document.createElement('button');
      homeButton.type = 'button';
      homeButton.className = 'project-tab-item__button project-tab-item__button--home';
      homeButton.dataset.projectHomeTab = 'true';
      homeButton.setAttribute('role', 'tab');
      homeButton.setAttribute('aria-selected', projectHomeVisible ? 'true' : 'false');
      homeButton.setAttribute('tabindex', projectHomeVisible ? '0' : '-1');
      homeButton.setAttribute('aria-label', localizeText('ホーム: プロジェクト一覧', 'Home: Projects'));
      const homeName = document.createElement('span');
      homeName.className = 'project-tab-item__name';
      homeName.textContent = localizeText('ホーム', 'Home');
      homeButton.appendChild(homeName);
      homeItem.appendChild(homeButton);
      list.appendChild(homeItem);
      const labelCounts = new Map();
      openProjectTabs.forEach(tab => {
        if (!tab || !tab.id) {
          return;
        }
        const isActive = !projectHomeVisible && tab.id === activeOpenProjectTabId;
        const label = getOpenProjectTabDisplayLabel(tab, { active: isActive });
        labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
      });
      const labelOrdinals = new Map();
      openProjectTabs.forEach((tab, index) => {
        if (!tab || !tab.id) {
          return;
        }
        const isActive = !projectHomeVisible && tab.id === activeOpenProjectTabId;
        const item = document.createElement('div');
        item.className = `project-tab-item${isActive ? ' is-active' : ''}`;
        item.dataset.projectTabItemId = tab.id;

        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.className = 'project-tab-item__button';
        selectButton.dataset.projectTabId = tab.id;
        selectButton.setAttribute('role', 'tab');
        selectButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
        selectButton.setAttribute('tabindex', isActive ? '0' : '-1');
        const displayLabel = getOpenProjectTabRenderLabel(tab, labelCounts, labelOrdinals, { active: isActive });
        const slotPrefix = `${index + 1}/${MAX_PROJECT_SHEETS}`;
        selectButton.setAttribute(
          'aria-label',
          localizeText(`シート ${slotPrefix}: ${displayLabel}`, `Sheet ${slotPrefix}: ${displayLabel}`)
        );

        const name = document.createElement('span');
        name.className = 'project-tab-item__name';
        name.textContent = displayLabel;
        selectButton.appendChild(name);
        item.appendChild(selectButton);

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'project-tab-item__close';
        closeButton.dataset.projectTabCloseId = tab.id;
        closeButton.textContent = '×';
        closeButton.setAttribute(
          'aria-label',
          localizeText(`${displayLabel} を閉じる`, `Close ${displayLabel}`)
        );
        item.appendChild(closeButton);

        list.appendChild(item);
      });
      const addItem = document.createElement('div');
      addItem.className = 'project-tab-item project-tab-item--add';
      addItem.setAttribute('role', 'presentation');
      const addButton = document.createElement('button');
      addButton.type = 'button';
      addButton.className = 'project-tab-item__add';
      addButton.dataset.projectTabAdd = 'true';
      addButton.textContent = '+';
      addButton.setAttribute(
        'aria-label',
        localizeText('新規シートを追加', 'Add new sheet')
      );
      addButton.disabled = openProjectTabBusy || openProjectTabs.length >= MAX_PROJECT_SHEETS;
      addItem.appendChild(addButton);
      list.appendChild(addItem);
    }

    return {
      getOpenProjectTabDisplayLabel,
      renderOpenProjectTabs,
    };
  }

  root.openProjectTabView = {
    createOpenProjectTabView,
  };
})();
