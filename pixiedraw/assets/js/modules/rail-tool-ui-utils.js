(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createRailToolUiUtils(rawScope = {}) {
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
  function isDualLeftRailEnabled() {
    return false;
  }

  function getKeyboardNavigableTabButtons(buttons) {
    if (!Array.isArray(buttons)) {
      return [];
    }
    return buttons.filter(button => (
      button instanceof HTMLButtonElement
      && !button.hidden
      && !button.disabled
      && button.getAttribute('aria-hidden') !== 'true'
    ));
  }

  function bindTabKeyboardNavigation(button, getButtons) {
    if (!(button instanceof HTMLButtonElement) || button.dataset.tabKeynavBound === 'true') {
      return;
    }
    button.dataset.tabKeynavBound = 'true';
    button.addEventListener('keydown', event => {
      const isHome = event.key === 'Home';
      const isEnd = event.key === 'End';
      if (!isHome && !isEnd) {
        return;
      }
      const buttons = getKeyboardNavigableTabButtons(getButtons());
      if (!buttons.length) {
        return;
      }
      const currentIndex = buttons.indexOf(button);
      if (currentIndex < 0) {
        return;
      }
      let targetIndex = currentIndex;
      if (isHome) {
        targetIndex = 0;
      } else if (isEnd) {
        targetIndex = buttons.length - 1;
      }
      const targetButton = buttons[targetIndex];
      if (!(targetButton instanceof HTMLButtonElement)) {
        return;
      }
      event.preventDefault();
      if (targetButton !== button) {
        targetButton.focus();
        targetButton.click();
      }
    });
  }

  function setDualLeftRailEnabled(enabled, { persist = true } = {}) {
    state.dualLeftRail = false;
    endLeftDualSplitResize({ persist: false });
    updateRailCompactState('left');
    clearLeftDualRailLayout();
    updateLeftTabUI();
    updateLeftTabVisibility();
    updateToolVisibility();
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function setupLeftTabs() {
    dom.leftTabButtons = Array.from(document.querySelectorAll('[data-left-tab]'));
    if (!dom.leftTabButtons || !dom.leftTabButtons.length) return;
    dom.leftTabButtons.forEach(button => {
      bindTabKeyboardNavigation(button, () => dom.leftTabButtons);
      button.addEventListener('click', () => {
        if (layoutMode === 'mobilePortrait') return;
        const target = button.dataset.leftTab;
        if (!target) return;
        setLeftTab(target);
      });
      button.addEventListener('dblclick', event => {
        if (layoutMode === 'mobilePortrait') return;
        event.preventDefault();
        event.stopPropagation();
        const target = button.dataset.leftTab;
        if (target) {
          setLeftTab(target, { persist: false });
        }
        openLeftRailMaxWidth();
      });
    });
    updateLeftTabUI();
  }

  function isDesktopRightToolRailMode() {
    return DESKTOP_RIGHT_TOOL_RAIL_MODE && layoutMode !== 'mobilePortrait';
  }

  function isUnifiedLeftToolsColorMode() {
    return UNIFIED_LEFT_TOOLS_COLOR_MODE && !isDesktopRightToolRailMode();
  }

  function setLeftTab(tab, { persist = true } = {}) {
    if (!LEFT_TAB_KEYS.includes(tab)) return;
    if (state.activeLeftTab === tab) return;
    state.activeLeftTab = tab;
    if (tab !== 'tools') {
      setCompactToolFlyoutOpen(false);
    }
    updateLeftTabUI();
    updateLeftTabVisibility();
    updateToolVisibility();
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
  }

  function focusUnifiedLeftContext(tab, { persist = false } = {}) {
    if (!isUnifiedLeftToolsColorMode()) {
      return;
    }
    const target = tab === 'color' ? 'color' : 'tools';
    setLeftTab(target, { persist });
    if (layoutMode === 'mobilePortrait') {
      const activeKey = Array.isArray(dom.mobileTabs)
        ? (dom.mobileTabs.find(button => button.classList.contains('is-active'))?.dataset.mobileTab || '')
        : '';
      if (activeKey === 'tools' || activeKey === 'color') {
        activateMobileTab('tools', { ensureDrawer: false });
      }
    }
  }

  function updateLeftTabUI() {
    if (!dom.leftTabButtons) return;
    dom.leftTabButtons.forEach(button => {
      const tab = button.dataset.leftTab;
      const isActive = tab === state.activeLeftTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function updateLeftTabVisibility() {
    const isMobile = layoutMode === 'mobilePortrait';
    const desktopRightTools = isDesktopRightToolRailMode();
    const dualLeft = isDualLeftRailEnabled();
    const unified = isUnifiedLeftToolsColorMode();
    const colorFocused = unified && state.activeLeftTab === 'color';
    if (!unified || isMobile) {
      endLeftUnifiedSplitResize({ persist: false });
    }
    document.body.classList.toggle('is-dual-left-rail', dualLeft);
    document.body.classList.toggle('is-unified-left-tools-color', unified);
    document.body.classList.toggle('is-unified-left-color-focus', colorFocused);
    document.body.classList.toggle('is-right-tool-rail', desktopRightTools && !isMobile);
    if (!dualLeft) {
      clearLeftDualRailLayout();
    } else {
      syncLeftDualRailLayout();
    }
    if (Array.isArray(dom.mobileTabs)) {
      dom.mobileTabs.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        if (button.dataset.mobileTab === 'color') {
          button.hidden = unified;
          button.setAttribute('aria-hidden', String(unified));
        }
      });
    }
    if (unified && dom.mobilePanels.color instanceof HTMLElement && dom.mobilePanels.color !== dom.mobilePanels.tools) {
      dom.mobilePanels.color.hidden = true;
      dom.mobilePanels.color.classList.remove('is-active');
      dom.mobilePanels.color.setAttribute('aria-hidden', 'true');
    }
    if (dom.leftTabsBar) {
      dom.leftTabsBar.toggleAttribute('hidden', isMobile || dualLeft || unified || desktopRightTools);
    }
    if (desktopRightTools && !isMobile) {
      clearLeftDualRailLayout();
      const toolsSection = dom.sections.tools;
      const colorSection = dom.sections.color;
      if (toolsSection) {
        toolsSection.hidden = false;
        toolsSection.setAttribute('aria-hidden', 'false');
        toolsSection.classList.add('is-active');
        const toolsFieldGroup = toolsSection.querySelector('.field-group--tools');
        if (toolsFieldGroup instanceof HTMLElement) {
          toolsFieldGroup.hidden = false;
          toolsFieldGroup.setAttribute('aria-hidden', 'false');
        }
        const toolsQuickPalette = toolsSection.querySelector('.tool-quick-color');
        if (toolsQuickPalette instanceof HTMLElement) {
          toolsQuickPalette.hidden = true;
          toolsQuickPalette.setAttribute('aria-hidden', 'true');
        }
      }
      if (colorSection) {
        colorSection.hidden = false;
        colorSection.setAttribute('aria-hidden', 'false');
        colorSection.classList.add('is-active');
      }
      if (state.activeLeftTab !== 'color') {
        state.activeLeftTab = 'color';
        updateLeftTabUI();
      }
      setCompactToolFlyoutOpen(false);
      syncLeftUnifiedSplitLayout();
      return;
    }
    if (unified) {
      const toolsSection = dom.sections.tools;
      const colorSection = dom.sections.color;
      if (toolsSection) {
        toolsSection.hidden = false;
        toolsSection.setAttribute('aria-hidden', 'false');
        toolsSection.classList.add('is-active');
      }
      const toolsFieldGroup = toolsSection?.querySelector('.field-group--tools');
      if (toolsFieldGroup instanceof HTMLElement) {
        toolsFieldGroup.hidden = false;
        toolsFieldGroup.setAttribute('aria-hidden', 'false');
      }
      const toolsQuickPalette = toolsSection?.querySelector('.tool-quick-color');
      if (toolsQuickPalette instanceof HTMLElement) {
        const showQuickPalette = isMobile;
        toolsQuickPalette.hidden = !showQuickPalette;
        toolsQuickPalette.setAttribute('aria-hidden', String(!showQuickPalette));
      }
      if (colorSection) {
        colorSection.hidden = false;
        colorSection.setAttribute('aria-hidden', 'false');
        colorSection.classList.add('is-active');
        const colorEditor = colorSection.querySelector('.palette-editor');
        if (colorEditor instanceof HTMLElement) {
          colorEditor.hidden = false;
          colorEditor.setAttribute('aria-hidden', 'false');
        }
      }
      if (!isCompactToolRailMode()) {
        setCompactToolFlyoutOpen(false);
      }
      syncLeftUnifiedSplitLayout();
      return;
    }
    if (isMobile) {
      LEFT_TAB_KEYS.forEach(key => {
        const section = dom.sections[key];
        if (!section) return;
        section.hidden = false;
        section.setAttribute('aria-hidden', 'false');
        section.classList.add('is-active');
      });
      setCompactToolFlyoutOpen(false);
      syncLeftUnifiedSplitLayout();
      return;
    }
    if (dualLeft) {
      LEFT_TAB_KEYS.forEach(key => {
        const section = dom.sections[key];
        if (!section) return;
        section.hidden = false;
        section.setAttribute('aria-hidden', 'false');
        section.classList.add('is-active');
      });
      if (state.activeLeftTab !== 'tools') {
        state.activeLeftTab = 'tools';
        updateLeftTabUI();
      }
      if (!isCompactToolRailMode()) {
        setCompactToolFlyoutOpen(false);
      }
      syncLeftUnifiedSplitLayout();
      return;
    }
    LEFT_TAB_KEYS.forEach(key => {
      const section = dom.sections[key];
      if (!section) return;
      const isActive = state.activeLeftTab === key;
      section.hidden = !isActive;
      section.setAttribute('aria-hidden', String(!isActive));
      section.classList.toggle('is-active', isActive);
    });
    if (!isCompactToolRailMode()) {
      setCompactToolFlyoutOpen(false);
    }
    syncLeftUnifiedSplitLayout();
  }

  function isCompactRightRailMode() {
    if (layoutMode === 'mobilePortrait') {
      return false;
    }
    return dom.rightRail instanceof HTMLElement && dom.rightRail.dataset.compact === 'true';
  }

  function isCompactRightFlyoutOpen() {
    return dom.rightRail instanceof HTMLElement && dom.rightRail.dataset.compactFlyoutOpen === 'true';
  }

  function shouldKeepRailPanelsPinned() {
    return !isDesktopRightToolRailMode();
  }

  function updateCompactFlyoutBackdropState() {
    const visible = isCompactToolFlyoutOpen() || isCompactRightFlyoutOpen();
    document.body.classList.toggle('is-compact-flyout-open', visible);
  }

  function ensureCompactRightFlyoutPortal(open, section = null) {
    if (!open) {
      if (!compactRightFlyoutPortal.active || !(compactRightFlyoutPortal.section instanceof HTMLElement)) {
        return;
      }
      const activeSection = compactRightFlyoutPortal.section;
      const { parent, nextSibling } = compactRightFlyoutPortal;
      if (parent instanceof Node && parent.isConnected) {
        if (nextSibling instanceof Node && nextSibling.parentNode === parent) {
          parent.insertBefore(activeSection, nextSibling);
        } else {
          parent.appendChild(activeSection);
        }
      }
      compactRightFlyoutPortal.active = false;
      compactRightFlyoutPortal.section = null;
      compactRightFlyoutPortal.parent = null;
      compactRightFlyoutPortal.nextSibling = null;
      return;
    }
    if (!(section instanceof HTMLElement)) {
      ensureCompactRightFlyoutPortal(false);
      return;
    }
    if (compactRightFlyoutPortal.active && compactRightFlyoutPortal.section === section) {
      return;
    }
    ensureCompactRightFlyoutPortal(false);
    compactRightFlyoutPortal.parent = section.parentNode;
    compactRightFlyoutPortal.nextSibling = section.nextSibling;
    document.body.appendChild(section);
    compactRightFlyoutPortal.section = section;
    compactRightFlyoutPortal.active = true;
  }

  function clearCompactRightFlyoutStyles() {
    RIGHT_TAB_KEYS.forEach(key => {
      const section = dom.sections[key];
      if (!(section instanceof HTMLElement)) {
        return;
      }
      section.classList.remove('is-compact-flyout');
      section.style.removeProperty('position');
      section.style.removeProperty('left');
      section.style.removeProperty('top');
      section.style.removeProperty('width');
      section.style.removeProperty('max-height');
      section.style.removeProperty('z-index');
      section.style.removeProperty('overflow');
    });
  }

  function clearCompactRightFlyoutPosition() {
    compactRightFlyoutLockedLeft = null;
    clearCompactRightFlyoutStyles();
    ensureCompactRightFlyoutPortal(false);
    scheduleRailLayoutRefresh();
  }

  function updateCompactRightFlyoutPosition() {
    const compactMode = isCompactRightRailMode() || isDesktopRightToolRailMode();
    const open = isCompactRightFlyoutOpen();
    if (
      !compactMode
      || !open
      || !(dom.rightRail instanceof HTMLElement)
      || (state.activeRightTab === 'frames' && isBottomTimelineDockEnabled())
    ) {
      clearCompactRightFlyoutPosition();
      return;
    }
    const section = dom.sections[state.activeRightTab];
    if (!(section instanceof HTMLElement)) {
      clearCompactRightFlyoutPosition();
      return;
    }
    const railRect = dom.rightRail.getBoundingClientRect();
    const viewportBounds = getLayoutViewportBounds();
    const safeArea = {
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    };
    const edgePadding = 4;
    const railGap = 8;
    const safeLeft = viewportBounds.left + safeArea.left;
    const safeTop = viewportBounds.top + safeArea.top;
    const safeRight = viewportBounds.right - safeArea.right;
    const safeBottom = viewportBounds.bottom - safeArea.bottom;
    const safeWidth = Math.max(1, safeRight - safeLeft);
    const isWideFlyout = state.activeRightTab === 'frames' || state.activeRightTab === 'help';
    const widthRatio = isWideFlyout ? 0.4 : 0.34;
    const minWidth = isWideFlyout ? 360 : 320;
    const maxWidth = isWideFlyout ? 520 : 440;
    const minLeft = safeLeft + edgePadding;
    const maxAvailableWidth = Math.max(160, Math.round(safeRight - minLeft - edgePadding));
    const maxAvailableWidthByRail = Math.max(1, Math.round(railRect.left - minLeft - railGap));
    const preferredWidth = clamp(Math.round(safeWidth * widthRatio), minWidth, maxWidth);
    let width = Math.min(preferredWidth, maxAvailableWidth, maxAvailableWidthByRail);
    width = Math.max(1, Math.round(width));
    let computedLeft = Math.round(railRect.left - width - railGap);
    if (computedLeft < minLeft) {
      computedLeft = minLeft;
    }
    const maxLeft = Math.max(
      minLeft,
      Math.min(
        Math.round(safeRight - width - edgePadding),
        Math.round(railRect.left - width - railGap)
      )
    );
    const preferredLeft = Number.isFinite(compactRightFlyoutLockedLeft)
      ? compactRightFlyoutLockedLeft
      : computedLeft;
    const left = clamp(Math.round(preferredLeft), minLeft, maxLeft);
    compactRightFlyoutLockedLeft = left;
    let top = clamp(
      Math.round(railRect.top + 4),
      safeTop + edgePadding,
      Math.max(safeTop + edgePadding, safeBottom - 120)
    );
    let maxHeight = Math.max(140, Math.round(safeBottom - top - edgePadding));
    if (maxHeight < 220) {
      top = Math.max(safeTop + edgePadding, Math.round(safeBottom - 220 - edgePadding));
      maxHeight = Math.max(140, Math.round(safeBottom - top - edgePadding));
    }
    clearCompactRightFlyoutStyles();
    ensureCompactRightFlyoutPortal(true, section);
    section.classList.add('is-compact-flyout');
    section.style.position = 'fixed';
    section.style.left = `${left}px`;
    section.style.top = `${top}px`;
    section.style.width = `${width}px`;
    section.style.maxHeight = `${maxHeight}px`;
    section.style.zIndex = '14000';
    section.style.overflow = 'auto';
    scheduleRailLayoutRefresh();
  }

  function setCompactRightFlyoutOpen(open) {
    if (!(dom.rightRail instanceof HTMLElement)) {
      return;
    }
    const shouldOpen = Boolean(open) && (isCompactRightRailMode() || isDesktopRightToolRailMode());
    dom.rightRail.dataset.compactFlyoutOpen = shouldOpen ? 'true' : 'false';
    if (!shouldOpen) {
      clearCompactRightFlyoutPosition();
    } else {
      updateCompactRightFlyoutPosition();
    }
    updateCompactFlyoutBackdropState();
  }

  function getRightTransientPanelOpenWidth() {
    return normalizeRailWidth('right', RIGHT_TRANSIENT_PANEL_WIDTH);
  }

  function isRightTransientPanelOpen() {
    if (isDesktopRightToolRailMode()) {
      return false;
    }
    return layoutMode !== 'mobilePortrait'
      && dom.rightRail instanceof HTMLElement
      && dom.rightRail.dataset.collapsed !== 'true'
      && !isRailCompactMode('right')
      && Math.round(Number(railSizing.right) || 0) > RAIL_COMPACT_THRESHOLD.right;
  }

  function closeRightTransientPanel({ persist = true } = {}) {
    if (layoutMode === 'mobilePortrait') {
      return;
    }
    if (isDesktopRightToolRailMode()) {
      setCompactRightFlyoutOpen(false);
      updateRightTabVisibility();
      return;
    }
    setCompactRightFlyoutOpen(false);
    setRailWidth('right', RAIL_MIN_WIDTH, { persist });
  }

  function openRightTransientPanel(tab = '') {
    if (layoutMode === 'mobilePortrait') {
      return;
    }
    if (isDesktopRightToolRailMode()) {
      if (RIGHT_TAB_KEYS.includes(tab)) {
        setRightTab(tab);
      }
      setCompactRightFlyoutOpen(true);
      updateRightTabVisibility();
      return;
    }
    setCompactRightFlyoutOpen(false);
    setRailWidth('right', getRightTransientPanelOpenWidth(), { persist: true });
    if (RIGHT_TAB_KEYS.includes(tab)) {
      setRightTab(tab);
    } else {
      updateRightTabVisibility();
    }
  }

  function shouldDismissRightTransientPanelForTarget(target) {
    if (!isRightTransientPanelOpen() || !(target instanceof Node)) {
      return false;
    }
    if (dom.rightRail instanceof HTMLElement && dom.rightRail.contains(target)) {
      return false;
    }
    if (dom.resizeHandles.right instanceof HTMLElement && dom.resizeHandles.right.contains(target)) {
      return false;
    }
    return true;
  }

  function setRightUtilityMenuOpen(open) {
    const button = dom.rightUtilityMenuButton;
    const popover = dom.rightUtilityMenuPopover;
    if (!(button instanceof HTMLButtonElement) || !(popover instanceof HTMLElement)) {
      return;
    }
    const shouldOpen = Boolean(open) && layoutMode !== 'mobilePortrait';
    popover.hidden = !shouldOpen;
    popover.setAttribute('aria-hidden', String(!shouldOpen));
    button.setAttribute('aria-expanded', String(shouldOpen));
  }

  function isRightUtilityMenuOpen() {
    return dom.rightUtilityMenuPopover instanceof HTMLElement && !dom.rightUtilityMenuPopover.hidden;
  }

  function setupRightUtilityMenu() {
    const button = dom.rightUtilityMenuButton;
    const popover = dom.rightUtilityMenuPopover;
    if (!(button instanceof HTMLButtonElement) || !(popover instanceof HTMLElement)) {
      return;
    }
    if (button.dataset.bound !== 'true') {
      button.dataset.bound = 'true';
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setRightUtilityMenuOpen(!isRightUtilityMenuOpen());
      });
    }
    if (popover.dataset.bound !== 'true') {
      popover.dataset.bound = 'true';
      popover.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
          return;
        }
        const utilityButton = target.closest('[data-utility-action]');
        if (utilityButton instanceof HTMLElement) {
          const action = utilityButton.dataset.utilityAction || '';
          if (action === 'account') {
            setRightTab('settings');
            setCompactRightFlyoutOpen(true);
            updateRightTabVisibility();
            window.requestAnimationFrame(() => {
              const accountField = document.getElementById('pixieedAccountLabel')?.closest('.settings-account-field');
              if (accountField instanceof HTMLElement) {
                accountField.scrollIntoView({ block: 'nearest' });
              }
              dom.controls.pixieedAccountLogin?.focus?.({ preventScroll: true });
            });
          } else if (action === 'shortcuts') {
            openShortcutHelpDialog();
          }
          setRightUtilityMenuOpen(false);
          return;
        }
        if (target.closest('[data-right-tab], [data-ui-action]')) {
          setRightUtilityMenuOpen(false);
        }
      });
    }
    if (dom.rightUtilityMenu instanceof HTMLElement && dom.rightUtilityMenu.dataset.dismissBound !== 'true') {
      dom.rightUtilityMenu.dataset.dismissBound = 'true';
      document.addEventListener('pointerdown', event => {
        if (!isRightUtilityMenuOpen()) {
          return;
        }
        const target = event.target;
        if (target instanceof Node && dom.rightUtilityMenu instanceof HTMLElement && dom.rightUtilityMenu.contains(target)) {
          return;
        }
        setRightUtilityMenuOpen(false);
      }, true);
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') {
          return;
        }
        if (isRightUtilityMenuOpen()) {
          setRightUtilityMenuOpen(false);
          return;
        }
        if (isCompactRightFlyoutOpen() && isDesktopRightToolRailMode()) {
          setCompactRightFlyoutOpen(false);
          updateRightTabVisibility();
        }
      });
    }
  }

  function setupPaletteActionMenus() {
    const menus = Array.from(document.querySelectorAll('#panelColor .palette-action-menu'))
      .filter(menu => menu instanceof HTMLDetailsElement);
    if (!menus.length) {
      return;
    }
    menus.forEach(menu => {
      if (menu.dataset.paletteActionMenuBound === 'true') {
        return;
      }
      menu.dataset.paletteActionMenuBound = 'true';
      menu.addEventListener('toggle', () => {
        if (!menu.open) {
          return;
        }
        menus.forEach(other => {
          if (other !== menu) {
            other.open = false;
          }
        });
      });
      menu.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('.palette-action-menu__content .chip')) {
          window.setTimeout(() => {
            menu.open = false;
          }, 0);
        }
      });
    });
    if (document.body.dataset.paletteActionMenusDismissBound !== 'true') {
      document.body.dataset.paletteActionMenusDismissBound = 'true';
      document.addEventListener('pointerdown', event => {
        const target = event.target instanceof Node ? event.target : null;
        if (!target) {
          return;
        }
        if (menus.some(menu => menu.contains(target))) {
          return;
        }
        menus.forEach(menu => {
          menu.open = false;
        });
      }, true);
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') {
          return;
        }
        menus.forEach(menu => {
          menu.open = false;
        });
      });
    }
  }

  function setupRightTabs() {
    dom.rightTabButtons = Array.from(document.querySelectorAll('[data-right-tab]'));
    if (!RIGHT_TAB_KEYS.includes(state.activeRightTab) || state.activeRightTab === 'extensions') {
      state.activeRightTab = 'settings';
    }
    if (!RIGHT_TAB_KEYS.includes(state.activeRightTab)) {
      state.activeRightTab = 'frames';
    }
    if (dom.rightTabButtons && dom.rightTabButtons.length) {
      dom.rightTabButtons.forEach(button => {
        bindTabKeyboardNavigation(button, () => dom.rightTabButtons);
        if (button.dataset.bound === 'true') return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
          if (layoutMode === 'mobilePortrait') return;
          const target = button.dataset.rightTab;
          if (!target) return;
          if (target === 'extensions') {
            notifyExtensionsUnavailable();
            return;
          }
          if (isDesktopRightToolRailMode()) {
            if (target === 'frames') {
              setRightTab('frames');
              setCompactRightFlyoutOpen(false);
              dom.bottomTimelineDock?.focus?.({ preventScroll: true });
              return;
            }
            setRightTab(target);
            setCompactRightFlyoutOpen(true);
            updateRightTabVisibility();
            setRightUtilityMenuOpen(false);
            return;
          }
          if (target === 'frames' && isBottomTimelineDockEnabled()) {
            setRightTab('frames');
            dom.bottomTimelineDock?.focus?.({ preventScroll: true });
            return;
          }
          const compactMode = isCompactRightRailMode();
          if (compactMode) {
            openRightTransientPanel(target);
            return;
          }
          setRightTab(target);
        });
      });
    }
    if (!compactRightFlyoutDismissBound) {
      compactRightFlyoutDismissBound = true;
      const dismissCompactRightFlyout = event => {
        const target = event.target;
        if (!(target instanceof Node)) {
          return;
        }
        if (isCompactRightFlyoutOpen()) {
          const activeSection = dom.sections[state.activeRightTab];
          if (activeSection instanceof HTMLElement && activeSection.contains(target)) {
            return;
          }
          if (dom.rightRail instanceof HTMLElement && dom.rightRail.contains(target)) {
            return;
          }
          if (!shouldKeepRailPanelsPinned()) {
            setCompactRightFlyoutOpen(false);
            updateRightTabVisibility();
            return;
          }
        }
        if (shouldDismissRightTransientPanelForTarget(target)) {
          closeRightTransientPanel({ persist: true });
        }
      };
      document.addEventListener('pointerdown', dismissCompactRightFlyout, true);
      document.addEventListener('click', dismissCompactRightFlyout, true);
      document.addEventListener('touchstart', dismissCompactRightFlyout, { capture: true, passive: true });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') {
          return;
        }
        if (isCompactRightFlyoutOpen() && !shouldKeepRailPanelsPinned()) {
          setCompactRightFlyoutOpen(false);
          updateRightTabVisibility();
          return;
        }
        if (isRightTransientPanelOpen()) {
          closeRightTransientPanel({ persist: true });
        }
      });
    }
    if (!compactRightFlyoutPositionBound) {
      compactRightFlyoutPositionBound = true;
      window.addEventListener('resize', updateCompactRightFlyoutPosition, { passive: true });
      window.addEventListener('scroll', updateCompactRightFlyoutPosition, true);
      dom.rightRail?.addEventListener('scroll', updateCompactRightFlyoutPosition, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateCompactRightFlyoutPosition, { passive: true });
        window.visualViewport.addEventListener('scroll', updateCompactRightFlyoutPosition, { passive: true });
      }
      dom.rightRail?.addEventListener('transitionend', event => {
        if (!(event instanceof TransitionEvent)) {
          updateCompactRightFlyoutPosition();
          return;
        }
        if (event.propertyName === 'width' || event.propertyName === 'padding' || event.propertyName === 'gap') {
          updateCompactRightFlyoutPosition();
        }
      });
    }
    setCompactRightFlyoutOpen(false);
    updateRightTabUI();
    updateRightTabVisibility();
  }

  function setRightTab(tab) {
    if (!RIGHT_TAB_KEYS.includes(tab)) return;
    if (tab === 'extensions') {
      notifyExtensionsUnavailable();
      return;
    }
    if (state.activeRightTab === tab) return;
    state.activeRightTab = tab;
    updateRightTabUI();
    updateRightTabVisibility();
    if (tab === 'frames') {
      flushTimelineMatrixRenderIfVisible({ immediate: true });
    }
    // Clear multi tab notification when user opens the multi tab
    if (tab === 'multi') {
      setMultiTabNotification(false);
    }
    scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
  }

  function updateRightTabUI() {
    if (!dom.rightTabButtons) return;
    dom.rightTabButtons.forEach(button => {
      const tab = button.dataset.rightTab;
      const isActive = tab === state.activeRightTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  // Notification helpers for the multi tab (red dot when comments arrive and danmaku is off)
  function setMultiTabNotification(enabled) {
    try {
      if (!dom.rightTabButtons || !dom.rightTabButtons.length) return;
      const btn = dom.rightTabButtons.find(b => (b && b.dataset && b.dataset.rightTab) === 'multi');
      if (!btn) return;
      btn.classList.toggle('has-notification', Boolean(enabled));
      // also toggle mobile tab indicator if present
      try {
        const mobileBtn = document.getElementById('mobileTabMulti');
        if (mobileBtn instanceof HTMLElement) {
          mobileBtn.classList.toggle('has-notification', Boolean(enabled));
        }
      } catch (e) {
        /* ignore */
      }
    } catch (e) {
      /* ignore */
    }
  }

  function updateRightTabVisibility() {
    const isMobile = layoutMode === 'mobilePortrait';
    if (dom.rightTabsBar) {
      dom.rightTabsBar.toggleAttribute('hidden', isMobile);
    }
    if (isMobile) {
      setCompactRightFlyoutOpen(false);
      RIGHT_TAB_KEYS.forEach(key => {
        const section = dom.sections[key];
        if (!section) return;
        section.hidden = false;
        section.setAttribute('aria-hidden', 'false');
        section.classList.add('is-active');
        section.classList.remove('is-bottom-docked');
      });
      flushTimelineMatrixRenderIfVisible({ immediate: true });
      return;
    }
    const desktopRightTools = isDesktopRightToolRailMode();
    const compactMode = isCompactRightRailMode();
    if (!compactMode && isCompactRightFlyoutOpen()) {
      if (!desktopRightTools) {
        setCompactRightFlyoutOpen(false);
      }
    }
    const flyoutMode = compactMode || desktopRightTools;
    const showCompactFlyout = flyoutMode && isCompactRightFlyoutOpen();
    const framesDocked = isBottomTimelineDockEnabled();
    RIGHT_TAB_KEYS.forEach(key => {
      const section = dom.sections[key];
      if (!section) return;
      if (key === 'frames' && framesDocked) {
        section.hidden = false;
        section.setAttribute('aria-hidden', 'false');
        section.classList.add('is-active', 'is-bottom-docked');
        return;
      }
      section.classList.remove('is-bottom-docked');
      const isActive = state.activeRightTab === key;
      const visible = flyoutMode ? (isActive && showCompactFlyout) : isActive;
      section.hidden = !visible;
      section.setAttribute('aria-hidden', String(!visible));
      section.classList.toggle('is-active', visible);
    });
    updateCompactRightFlyoutPosition();
    if (!isMobile && state.activeRightTab === 'multi') {
      scheduleMultiEntryScreenMetricsUpdate();
    }
    flushTimelineMatrixRenderIfVisible({ immediate: true });
  }

  function resetCurveBuilder() {
    if (!curveBuilder) return;
    curveBuilder = null;
    pointerState.curveHandle = null;
    pointerState.drawPaletteIndex = null;
    hoverPixel = null;
    pointerState.preview = null;
    pointerState.tool = null;
    if (history.pending && history.pending.label === 'curve' && !history.pending.dirty) {
      history.pending = null;
    }
    requestOverlayRender();
  }

  function cancelPendingCurveInteraction() {
    const hasCurveBuilder = Boolean(curveBuilder);
    const hasCurveHistoryPending = Boolean(history.pending && history.pending.label === 'curve');
    const isCurvePointerActive = Boolean(pointerState.active && pointerState.tool === 'curve');
    if (!hasCurveBuilder && !hasCurveHistoryPending && !isCurvePointerActive) {
      return false;
    }

    if (isCurvePointerActive) {
      detachPointerListeners();
      const captureCanvas = pointerState.surface?.drawing || dom.canvases.drawing;
      if (pointerState.pointerId !== null && captureCanvas) {
        try {
          captureCanvas.releasePointerCapture(pointerState.pointerId);
        } catch (error) {
          // Ignore capture release issues while cancelling unfinished curve edit.
        }
      }
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.surface = null;
      pointerState.path = [];
      pointerState.preview = null;
    }

    if (hasCurveHistoryPending) {
      history.pending = null;
      updateHistoryButtons();
    }

    resetCurveBuilder();
    pointerState.tool = state.tool;
    pointerState.curveHandle = null;
    pointerState.drawPaletteIndex = null;
    requestOverlayRender();
    return true;
  }

  function setupToolGroups() {
    dom.toolGroupButtons = Array.from(document.querySelectorAll('.tool-group-button[data-tool-group]'));
    if (!state.lastGroupTool) {
      state.lastGroupTool = { ...DEFAULT_GROUP_TOOL };
    }
    if (!TOOL_GROUPS[state.activeToolGroup]) {
      state.activeToolGroup = TOOL_TO_GROUP[state.tool] || 'pen';
    }
    if (dom.toolGroupButtons && dom.toolGroupButtons.length) {
      dom.toolGroupButtons.forEach(button => {
        button.addEventListener('click', () => {
          compactToolFlyoutAnchorButton = button;
          const target = button.dataset.toolGroup;
          if (!target) return;
          const targetTools = TOOL_GROUPS[target]?.tools || [];
          const hasSingleTool = targetTools.length === 1;
          const singleTool = hasSingleTool ? targetTools[0] : null;
          const mobilePeekMode = isMobilePeekToolFlyoutMode();
          const desktopCompactMode = isCompactToolRailMode() && !mobilePeekMode && layoutMode !== 'mobilePortrait';
          const compactMode = isCompactToolRailMode() || mobilePeekMode;
          if (!compactMode) {
            setCompactToolFlyoutOpen(false);
            setToolGroup(target);
            if (singleTool) {
              if (TOOL_ACTIONS.has(singleTool)) {
                runToolAction(singleTool, { sourceButton: button });
              } else {
                setActiveTool(singleTool);
              }
            }
            return;
          }
          if (desktopCompactMode) {
            setToolGroup(target);
            if (singleTool) {
              if (TOOL_ACTIONS.has(singleTool)) {
                runToolAction(singleTool, { sourceButton: button });
                setCompactToolFlyoutOpen(false);
                updateToolVisibility();
                return;
              } else {
                setActiveTool(singleTool);
              }
            }
            setCompactToolFlyoutOpen(true);
            updateToolVisibility();
            return;
          }
          if (singleTool) {
            setToolGroup(target);
            if (TOOL_ACTIONS.has(singleTool)) {
              runToolAction(singleTool, { sourceButton: button });
              setCompactToolFlyoutOpen(false, {
                force: mobilePeekMode,
              });
              updateToolVisibility();
              return;
            } else {
              setActiveTool(singleTool);
            }
            setCompactToolFlyoutOpen(true, {
              force: mobilePeekMode,
              keepMirrorPopover: singleTool === TOOL_ACTION_MIRROR_POPUP,
            });
            updateToolVisibility();
            return;
          }
          const wasOpen = isCompactToolFlyoutOpen();
          const isSameGroup = state.activeToolGroup === target;
          setToolGroup(target);
          if (isSameGroup && wasOpen) {
            setCompactToolFlyoutOpen(true, { force: mobilePeekMode });
          } else {
            setCompactToolFlyoutOpen(true, { force: mobilePeekMode });
          }
          updateToolVisibility();
        });
        button.addEventListener('dblclick', event => {
          if (layoutMode === 'mobilePortrait') return;
          if (isDesktopRightToolRailMode()) return;
          if (!isCompactToolRailMode()) return;
          if (isMobilePeekToolFlyoutMode()) return;
          event.preventDefault();
          event.stopPropagation();
          openLeftRailMaxWidth();
        });
      });
    }
    if (!compactToolFlyoutDismissBound) {
      compactToolFlyoutDismissBound = true;
      document.addEventListener(
        'pointerdown',
        event => {
          if (!isCompactToolFlyoutOpen()) {
            return;
          }
          const target = event.target;
          if (!(target instanceof Node)) {
            return;
          }
          const toolsPanel = dom.sections.tools;
          if (toolsPanel instanceof HTMLElement && toolsPanel.contains(target)) {
            return;
          }
          if (dom.toolGrid instanceof HTMLElement && dom.toolGrid.contains(target)) {
            return;
          }
          if (isMirrorToolPopoverOpen() && target instanceof Element && isMirrorPopoverPersistentTarget(target)) {
            return;
          }
          setCompactToolFlyoutOpen(false);
          updateToolVisibility();
        },
        true
      );
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !isCompactToolFlyoutOpen()) {
          return;
        }
        setCompactToolFlyoutOpen(false);
        updateToolVisibility();
      });
    }
    if (!compactToolFlyoutPositionBound) {
      compactToolFlyoutPositionBound = true;
      window.addEventListener('resize', updateCompactToolFlyoutPosition, { passive: true });
      window.addEventListener('scroll', updateCompactToolFlyoutPosition, true);
      dom.leftRail?.addEventListener('scroll', updateCompactToolFlyoutPosition, { passive: true });
      dom.rightRail?.addEventListener('scroll', updateCompactToolFlyoutPosition, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateCompactToolFlyoutPosition, { passive: true });
        window.visualViewport.addEventListener('scroll', updateCompactToolFlyoutPosition, { passive: true });
      }
      dom.leftRail?.addEventListener('transitionend', event => {
        if (!(event instanceof TransitionEvent)) {
          updateCompactToolFlyoutPosition();
          return;
        }
        if (event.propertyName === 'width' || event.propertyName === 'padding' || event.propertyName === 'gap') {
          updateCompactToolFlyoutPosition();
        }
      });
    }
    setCompactToolFlyoutOpen(false);
    updateToolGroupButtons();
    updateToolVisibility();
    const activeGroupTools = TOOL_GROUPS[state.activeToolGroup]?.tools || [];
    if (activeGroupTools.length && !activeGroupTools.includes(state.tool)) {
      const fallback = state.lastGroupTool[state.activeToolGroup] && activeGroupTools.includes(state.lastGroupTool[state.activeToolGroup])
        ? state.lastGroupTool[state.activeToolGroup]
        : activeGroupTools[0];
      setActiveTool(fallback, toolButtons, { persist: false, skipGroupUpdate: true });
    } else if (activeGroupTools.includes(state.tool)) {
      state.lastGroupTool[state.activeToolGroup] = state.tool;
    }
  }

  function isCompactToolRailMode() {
    if (layoutMode === 'mobilePortrait') {
      const isPeek = dom.mobileDrawer instanceof HTMLElement
        ? dom.mobileDrawer.dataset.mode === 'peek'
        : normalizeMobileDrawerMode(mobileDrawerState.mode) === 'peek';
      const toolsPanel = dom.mobilePanels.tools;
      const toolsTabActive = toolsPanel instanceof HTMLElement && toolsPanel.classList.contains('is-active') && !toolsPanel.hidden;
      return isPeek && toolsTabActive;
    }
    if (isDesktopRightToolRailMode()) {
      return true;
    }
    if (!(dom.leftRail instanceof HTMLElement) || dom.leftRail.dataset.compact !== 'true') {
      return false;
    }
    if (isUnifiedLeftToolsColorMode()) {
      return true;
    }
    return state.activeLeftTab === 'tools' || isDualLeftRailEnabled();
  }

  function isMobilePeekToolFlyoutMode() {
    if (layoutMode !== 'mobilePortrait') {
      return false;
    }
    return dom.mobileDrawer?.dataset.mode === 'peek'
      || normalizeMobileDrawerMode(mobileDrawerState.mode) === 'peek';
  }

  function ensureMobileToolGridPortal(open, { mobilePeek = false } = {}) {
    if (!(dom.toolGrid instanceof HTMLElement)) {
      return;
    }
    if (!open) {
      if (!mobileToolGridPortal.active) {
        dom.toolGrid.classList.remove('is-compact-flyout-portal');
        dom.toolGrid.classList.remove('is-mobile-peek-flyout');
        return;
      }
      const { parent, nextSibling } = mobileToolGridPortal;
      if (parent instanceof Node && parent.isConnected) {
        if (nextSibling instanceof Node && nextSibling.parentNode === parent) {
          parent.insertBefore(dom.toolGrid, nextSibling);
        } else {
          parent.appendChild(dom.toolGrid);
        }
      }
      mobileToolGridPortal.active = false;
      mobileToolGridPortal.parent = null;
      mobileToolGridPortal.nextSibling = null;
      dom.toolGrid.classList.remove('is-compact-flyout-portal');
      dom.toolGrid.classList.remove('is-mobile-peek-flyout');
      return;
    }
    dom.toolGrid.classList.toggle('is-compact-flyout-portal', !mobilePeek);
    dom.toolGrid.classList.toggle('is-mobile-peek-flyout', mobilePeek);
    if (mobileToolGridPortal.active) {
      return;
    }
    mobileToolGridPortal.parent = dom.toolGrid.parentNode;
    mobileToolGridPortal.nextSibling = dom.toolGrid.nextSibling;
    document.body.appendChild(dom.toolGrid);
    mobileToolGridPortal.active = true;
  }

  function isCompactToolFlyoutOpen() {
    return dom.sections.tools instanceof HTMLElement && dom.sections.tools.dataset.compactFlyoutOpen === 'true';
  }

  function clearCompactToolFlyoutPosition() {
    if (!(dom.toolGrid instanceof HTMLElement)) {
      return;
    }
    compactToolFlyoutLockedLeft = null;
    compactToolFlyoutAnchorButton = null;
    dom.toolGrid.style.removeProperty('position');
    dom.toolGrid.style.removeProperty('left');
    dom.toolGrid.style.removeProperty('top');
    dom.toolGrid.style.removeProperty('width');
    dom.toolGrid.style.removeProperty('max-height');
    dom.toolGrid.style.removeProperty('grid-template-columns');
    dom.toolGrid.style.removeProperty('z-index');
    dom.toolGrid.style.removeProperty('display');
    ensureMobileToolGridPortal(false);
    scheduleRailLayoutRefresh();
  }

  function updateCompactToolFlyoutPosition() {
    if (!(dom.toolGrid instanceof HTMLElement)) {
      return;
    }
    const mobilePeekMode = isMobilePeekToolFlyoutMode();
    const shouldFloat = (isCompactToolRailMode() || mobilePeekMode) && isCompactToolFlyoutOpen();
    if (!shouldFloat) {
      clearCompactToolFlyoutPosition();
      return;
    }
    const toolsPanel = dom.sections.tools;
    const activeGroupButton = compactToolFlyoutAnchorButton instanceof HTMLElement
      ? compactToolFlyoutAnchorButton
      : toolsPanel?.querySelector(`.tool-group-button[data-tool-group="${state.activeToolGroup}"]`);
    const anchor = activeGroupButton instanceof HTMLElement ? activeGroupButton : (toolsPanel?.querySelector('.panel-section__body') || toolsPanel);
    if (!(anchor instanceof HTMLElement)) {
      clearCompactToolFlyoutPosition();
      return;
    }
    const isMobileCompact = layoutMode === 'mobilePortrait';
    const anchorRect = anchor.getBoundingClientRect();
    const viewportBounds = isMobileCompact ? getViewportBounds() : getLayoutViewportBounds();
    const safeArea = isMobileCompact
      ? getSafeAreaInsets()
      : {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      };
    const edgePadding = 8;
    const safeLeft = viewportBounds.left + safeArea.left;
    const safeTop = viewportBounds.top + safeArea.top;
    const safeRight = viewportBounds.right - safeArea.right;
    const safeBottom = viewportBounds.bottom - safeArea.bottom;
    let flyoutWidth;
    let left;
    let top;
    let maxHeight;

    if (isMobileCompact) {
      compactToolFlyoutLockedLeft = null;
      ensureMobileToolGridPortal(true, { mobilePeek: true });
      const toolCount = getVisibleToolGridButtonCount();
      const itemSize = 44;
      const gap = 8;
      const padding = 16;
      const availableWidth = Math.max(72, safeRight - safeLeft - (edgePadding * 2));
      const maxColumns = Math.max(1, Math.min(4, Math.floor((availableWidth - padding + gap) / (itemSize + gap))));
      const columns = Math.max(1, Math.min(toolCount, maxColumns));
      const rows = Math.max(1, Math.ceil(toolCount / columns));
      const desiredWidth = (columns * itemSize) + (Math.max(0, columns - 1) * gap) + padding;
      const desiredHeight = (rows * itemSize) + (Math.max(0, rows - 1) * gap) + padding;
      flyoutWidth = clamp(Math.round(desiredWidth), 72, Math.max(72, availableWidth));
      const minLeft = Math.round(safeLeft + edgePadding);
      const maxLeft = Math.max(minLeft, Math.round(safeRight - flyoutWidth - edgePadding));
      left = clamp(Math.round(anchorRect.left + ((anchorRect.width - flyoutWidth) * 0.5)), minLeft, maxLeft);
      const maxFlyoutHeight = Math.max(96, Math.round((safeBottom - safeTop) * 0.68));
      const flyoutHeight = clamp(Math.round(desiredHeight), 88, maxFlyoutHeight);
      const preferredTop = Math.round(anchorRect.top - flyoutHeight - 10);
      const fallbackTop = Math.round(anchorRect.bottom + 10);
      const minTop = Math.round(safeTop + edgePadding);
      const maxBottom = Math.round(safeBottom - edgePadding);
      if (preferredTop >= minTop) {
        top = preferredTop;
      } else if (fallbackTop + flyoutHeight <= maxBottom) {
        top = fallbackTop;
      } else {
        const maxTop = Math.max(minTop, Math.round(maxBottom - flyoutHeight));
        top = clamp(preferredTop, minTop, maxTop);
      }
      maxHeight = flyoutHeight;
      dom.toolGrid.style.gridTemplateColumns = `repeat(${columns}, ${itemSize}px)`;
    } else {
      ensureMobileToolGridPortal(true, { mobilePeek: false });
      const toolCount = getVisibleToolGridButtonCount();
      const compactItemSize = 44;
      const compactGap = 8;
      const compactPadding = 16;
      const desktopRightTools = isDesktopRightToolRailMode();
      const railNode = desktopRightTools ? dom.rightRail : dom.leftRail;
      const railRect = railNode instanceof HTMLElement ? railNode.getBoundingClientRect() : null;
      const railWidth = Math.max(68, railNode?.offsetWidth || 78);
      const maxAllowedWidth = Math.max(96, Math.round(safeRight - safeLeft - (edgePadding * 2)));
      const compactTwoColumnMinWidth = (2 * compactItemSize) + compactGap + compactPadding;
      const maxColumnsByWidth = Math.max(
        1,
        Math.floor((maxAllowedWidth - compactPadding + compactGap) / (compactItemSize + compactGap))
      );
      const requestedColumns = toolCount >= 2 && maxAllowedWidth >= compactTwoColumnMinWidth ? 2 : 1;
      const compactColumns = clamp(
        Math.min(toolCount, requestedColumns),
        1,
        Math.min(2, maxColumnsByWidth)
      );
      const compactGridWidth =
        (compactColumns * compactItemSize)
        + (Math.max(0, compactColumns - 1) * compactGap)
        + compactPadding;
      const desiredCompactWidth = Math.max(
        Math.round(railWidth + (compactColumns === 1 ? 24 : 36)),
        compactGridWidth
      );
      const minAllowedWidth = Math.min(compactColumns === 1 ? 88 : 120, maxAllowedWidth);
      flyoutWidth = clamp(Math.round(desiredCompactWidth), minAllowedWidth, maxAllowedWidth);
      let computedLeft = desktopRightTools
        ? Math.round((railRect ? railRect.left : anchorRect.left) - 8 - flyoutWidth)
        : (railRect ? Math.round(railRect.right + 8) : Math.round(anchorRect.right + 10));
      const minLeft = Math.round(safeLeft + edgePadding);
      const maxRight = Math.round(safeRight - edgePadding);
      if (desktopRightTools && computedLeft < minLeft) {
        computedLeft = Math.max(minLeft, Math.round(anchorRect.left - flyoutWidth - 10));
      } else if (!desktopRightTools && computedLeft + flyoutWidth > maxRight) {
        const fallbackAnchorLeft = railRect ? railRect.left : anchorRect.left;
        computedLeft = Math.max(minLeft, Math.round(fallbackAnchorLeft - 10 - flyoutWidth));
      }
      const maxLeft = Math.max(minLeft, maxRight - flyoutWidth);
      const preferredLeft = Number.isFinite(compactToolFlyoutLockedLeft)
        ? compactToolFlyoutLockedLeft
        : computedLeft;
      left = clamp(Math.round(preferredLeft), minLeft, maxLeft);
      compactToolFlyoutLockedLeft = left;
      const preferredTop = Math.round(anchorRect.top + ((anchorRect.height - compactItemSize) * 0.5) - 8);
      top = clamp(
        preferredTop,
        Math.round(safeTop + edgePadding),
        Math.max(Math.round(safeTop + edgePadding), Math.round(safeBottom - 64))
      );
      maxHeight = Math.max(160, Math.round(safeBottom - top - 12));
      if (maxHeight < 220) {
        top = Math.max(Math.round(safeTop + edgePadding), Math.round(safeBottom - 220 - edgePadding));
        maxHeight = Math.max(120, Math.round(safeBottom - top - edgePadding));
      }
      dom.toolGrid.style.gridTemplateColumns =
        compactColumns === 1
          ? `minmax(${compactItemSize}px, 1fr)`
          : `repeat(${compactColumns}, minmax(${compactItemSize}px, 1fr))`;
    }

    dom.toolGrid.style.position = 'fixed';
    dom.toolGrid.style.left = `${left}px`;
    dom.toolGrid.style.top = `${top}px`;
    dom.toolGrid.style.width = `${flyoutWidth}px`;
    dom.toolGrid.style.maxHeight = `${maxHeight}px`;
    dom.toolGrid.style.zIndex = '14000';
    scheduleRailLayoutRefresh();
    if (isMirrorToolPopoverOpen()) {
      positionMirrorToolPopover();
    }
  }

  function getVisibleToolGridButtonCount() {
    if (!(dom.toolGrid instanceof HTMLElement)) {
      return 1;
    }
    const visibleCount = Array.from(dom.toolGrid.querySelectorAll('.tool-button'))
      .filter(button => button instanceof HTMLElement && !button.hidden && button.getAttribute('aria-hidden') !== 'true')
      .length;
    return Math.max(1, visibleCount);
  }

  function setCompactToolFlyoutOpen(open, { force = false, keepMirrorPopover = false } = {}) {
    if (!(dom.sections.tools instanceof HTMLElement)) {
      return;
    }
    const shouldOpen = Boolean(open) && (Boolean(force) || isCompactToolRailMode() || isMobilePeekToolFlyoutMode());
    dom.sections.tools.dataset.compactFlyoutOpen = shouldOpen ? 'true' : 'false';
    updateCompactToolFlyoutPosition();
    updateCompactFlyoutBackdropState();
  }

  function setToolGroup(group, { persist = true } = {}) {
    if (!TOOL_GROUPS[group]) return;
    if (!state.lastGroupTool) {
      state.lastGroupTool = { ...DEFAULT_GROUP_TOOL };
    }
    if (!state.lastGroupTool[group]) {
      state.lastGroupTool[group] = DEFAULT_GROUP_TOOL[group] || TOOL_GROUPS[group].tools[0];
    }
    state.activeToolGroup = group;
    focusUnifiedLeftContext('tools', { persist: false });
    updateToolGroupButtons();
    updateToolVisibility();
    const tools = TOOL_GROUPS[group].tools;
    const hasSelectableTool = tools.some(tool => !TOOL_ACTIONS.has(tool));
    if (!hasSelectableTool) {
      if (persist) scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
      return;
    }
    const desired = state.lastGroupTool[group] && tools.includes(state.lastGroupTool[group])
      ? state.lastGroupTool[group]
      : tools[0];
    if (!tools.includes(state.tool)) {
      setActiveTool(desired, toolButtons, { persist, skipGroupUpdate: true });
    } else {
      state.lastGroupTool[group] = state.tool;
      if (persist) scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
  }

  function getPreferredToolForGroup(group) {
    const config = group ? TOOL_GROUPS[group] : null;
    if (!config || !Array.isArray(config.tools) || config.tools.length === 0) {
      return null;
    }
    const tools = config.tools;
    if (tools.includes(state.tool)) {
      return state.tool;
    }
    const remembered = state.lastGroupTool?.[group];
    if (typeof remembered === 'string' && tools.includes(remembered)) {
      return remembered;
    }
    const fallback = DEFAULT_GROUP_TOOL[group];
    if (typeof fallback === 'string' && tools.includes(fallback)) {
      return fallback;
    }
    return tools[0];
  }

  function getToolIconSource(tool) {
    if (!tool || !toolButtons || !toolButtons.length) {
      return null;
    }
    const button = toolButtons.find(btn => btn.dataset.tool === tool);
    if (!(button instanceof HTMLElement)) {
      return null;
    }
    const image = button.querySelector('img');
    if (!(image instanceof HTMLImageElement)) {
      return null;
    }
    return image.getAttribute('src') || image.src || null;
  }

  function updateToolGroupButtons() {
    if (!dom.toolGroupButtons) return;
    dom.toolGroupButtons.forEach(button => {
      const group = button.dataset.toolGroup;
      const isActive = group === state.activeToolGroup;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
      const icon = button.querySelector('.tool-group-icon');
      if (!(icon instanceof HTMLImageElement) || !group || !TOOL_GROUPS[group]) {
        return;
      }
      if (!button.dataset.defaultIconSrc) {
        const current = icon.getAttribute('src');
        if (current) {
          button.dataset.defaultIconSrc = current;
        }
      }
      const preferredTool = getPreferredToolForGroup(group);
      const preferredIconSrc = getToolIconSource(preferredTool);
      const nextSrc = preferredIconSrc || button.dataset.defaultIconSrc;
      if (nextSrc && icon.getAttribute('src') !== nextSrc) {
        icon.setAttribute('src', nextSrc);
      }
    });
  }

  function updateToolVisibility() {
    if (!toolButtons || !toolButtons.length) return;
    const activeGroup = state.activeToolGroup || TOOL_TO_GROUP[state.tool] || 'pen';
    const mobilePeekMode = isMobilePeekToolFlyoutMode();
    const compactMode = isCompactToolRailMode() || mobilePeekMode;
    const compactFlyoutOpen = compactMode && isCompactToolFlyoutOpen();
    toolButtons.forEach(button => {
      const tool = button.dataset.tool || '';
      const group = button.dataset.toolGroup || TOOL_TO_GROUP[button.dataset.tool];
      const isActionTool = TOOL_ACTIONS.has(tool);
      const show = compactMode
        ? (compactFlyoutOpen && !isActionTool && group === activeGroup)
        : (!isActionTool && (!group || group === activeGroup));
      button.hidden = !show;
      button.setAttribute('aria-hidden', String(!show));
    });
    if (dom.toolGrid) {
      if (activeGroup) {
        dom.toolGrid.dataset.activeGroup = activeGroup;
      } else {
        dom.toolGrid.removeAttribute('data-active-group');
      }
    }
    updateCompactToolFlyoutPosition();
  }


  return Object.freeze({
    isDualLeftRailEnabled,
    getKeyboardNavigableTabButtons,
    bindTabKeyboardNavigation,
    setDualLeftRailEnabled,
    setupLeftTabs,
    isDesktopRightToolRailMode,
    isUnifiedLeftToolsColorMode,
    setLeftTab,
    focusUnifiedLeftContext,
    updateLeftTabUI,
    updateLeftTabVisibility,
    isCompactRightRailMode,
    isCompactRightFlyoutOpen,
    shouldKeepRailPanelsPinned,
    updateCompactFlyoutBackdropState,
    ensureCompactRightFlyoutPortal,
    clearCompactRightFlyoutStyles,
    clearCompactRightFlyoutPosition,
    updateCompactRightFlyoutPosition,
    setCompactRightFlyoutOpen,
    getRightTransientPanelOpenWidth,
    isRightTransientPanelOpen,
    closeRightTransientPanel,
    openRightTransientPanel,
    shouldDismissRightTransientPanelForTarget,
    setRightUtilityMenuOpen,
    isRightUtilityMenuOpen,
    setupRightUtilityMenu,
    setupPaletteActionMenus,
    setupRightTabs,
    setRightTab,
    updateRightTabUI,
    setMultiTabNotification,
    updateRightTabVisibility,
    resetCurveBuilder,
    cancelPendingCurveInteraction,
    setupToolGroups,
    isCompactToolRailMode,
    isMobilePeekToolFlyoutMode,
    ensureMobileToolGridPortal,
    isCompactToolFlyoutOpen,
    clearCompactToolFlyoutPosition,
    updateCompactToolFlyoutPosition,
    getVisibleToolGridButtonCount,
    setCompactToolFlyoutOpen,
    setToolGroup,
    getPreferredToolForGroup,
    getToolIconSource,
    updateToolGroupButtons,
    updateToolVisibility,
  });
      }
    })(scope);
  }

  root.railToolUiUtils = Object.freeze({
    createRailToolUiUtils,
  });
})();
