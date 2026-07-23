(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createMirrorStaticConfig({
    MIRROR_AXIS_VERTICAL,
    MIRROR_AXIS_HORIZONTAL,
    MIRROR_AXIS_DIAGONAL_A,
    MIRROR_AXIS_DIAGONAL_B,
  } = {}) {
    const DEFAULT_MIRROR_AXES = Object.freeze({
      [MIRROR_AXIS_VERTICAL]: true,
      [MIRROR_AXIS_HORIZONTAL]: false,
      [MIRROR_AXIS_DIAGONAL_A]: false,
      [MIRROR_AXIS_DIAGONAL_B]: false,
    });
    const MIRROR_TOOL_ITEMS = Object.freeze([
      Object.freeze({
        key: 'axisVertical',
        type: 'axis',
        axis: MIRROR_AXIS_VERTICAL,
        label: 'taisyou1',
        icon: 'assets/icons/taisyou1.svg',
        section: '対称',
      }),
      Object.freeze({
        key: 'axisHorizontal',
        type: 'axis',
        axis: MIRROR_AXIS_HORIZONTAL,
        label: 'taisyou2',
        icon: 'assets/icons/taisyou2.svg',
        section: '対称',
      }),
      Object.freeze({
        key: 'axisDiagonalA',
        type: 'axis',
        axis: MIRROR_AXIS_DIAGONAL_A,
        label: 'taisyou3',
        icon: 'assets/icons/taisyou3.svg',
        section: '対称',
      }),
      Object.freeze({
        key: 'axisDiagonalB',
        type: 'axis',
        axis: MIRROR_AXIS_DIAGONAL_B,
        label: 'taisyou4',
        icon: 'assets/icons/taisyou4.svg',
        section: '対称',
      }),
    ]);
    return Object.freeze({
      DEFAULT_MIRROR_AXES,
      MIRROR_TOOL_ITEMS,
    });
  }

  function createControlsMirrorModule(rawScope = {}) {
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
  function isVirtualKeyboardLikelyOpen() {
    const active = document.activeElement;
    if (!isCoarsePointerDevice() || !isInputControlElement(active) || !isSoftKeyboardInputTarget(active)) {
      return false;
    }
    const viewport = window.visualViewport;
    if (!viewport) {
      return false;
    }
    const viewportHeight = Math.max(0, Math.round(Number(viewport.height) || 0));
    const innerHeight = Math.max(0, Math.round(Number(window.innerHeight) || 0));
    if (viewportHeight <= 0 || innerHeight <= 0) {
      return false;
    }
    const baseline = Math.max(softKeyboardBaselineViewportHeight || 0, innerHeight);
    const baselineLoss = baseline - viewportHeight;
    const innerLoss = innerHeight - viewportHeight;
    if (baselineLoss > 96 && viewportHeight < baseline * 0.92) {
      return true;
    }
    if (innerLoss > 120 && viewportHeight < innerHeight * 0.88) {
      return true;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedSinceFocus = now - lastSoftKeyboardFocusAt;
    return elapsedSinceFocus >= 0 && elapsedSinceFocus < 700 && baselineLoss > 36;
  }

  function updateRailMetrics() {
    const layoutNode = dom.layout;
    if (!layoutNode) return;
    const isMobile = layoutMode === 'mobilePortrait';
    const leftWidth = isMobile ? 0 : normalizeRailWidth('left', railSizing.left);
    const rightWidth = isMobile ? 0 : normalizeRailWidth('right', railSizing.right);
    const leftFlyoutReserve = isMobile ? 0 : getLeftFloatingRailReserveWidth(leftWidth);
    const rightFlyoutReserve = isMobile ? 0 : getRightFloatingRailReserveWidth(rightWidth);
    const projectTabsInsetLeft = isMobile ? 0 : Math.max(0, Math.min(28, Math.round(leftWidth * 0.36)));
    const toggleMargin = 12;
    layoutNode.style.setProperty('--left-toggle-offset', `${leftWidth ? leftWidth + toggleMargin : toggleMargin}px`);
    layoutNode.style.setProperty('--right-toggle-offset', `${rightWidth ? rightWidth + toggleMargin : toggleMargin}px`);
    layoutNode.style.setProperty('--left-flyout-reserve', `${leftFlyoutReserve}px`);
    layoutNode.style.setProperty('--right-flyout-reserve', `${rightFlyoutReserve}px`);
    layoutNode.style.setProperty('--project-tabs-inset-left', `${projectTabsInsetLeft}px`);
    layoutNode.style.setProperty('--project-tabs-inset-right', '0px');
  }

  function isCoarsePointerDevice() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    try {
      return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
    } catch (error) {
      return false;
    }
  }

  function getVisibleMobileBottomAdHeight() {
    if (typeof document === 'undefined' || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
      return 0;
    }
    const mobileBottomAd = document.getElementById('mobileBottomAd');
    if (!(mobileBottomAd instanceof HTMLElement)) {
      return 0;
    }
    const adStyle = window.getComputedStyle(mobileBottomAd);
    const adRect = mobileBottomAd.getBoundingClientRect();
    const adVisible =
      adStyle.display !== 'none'
      && adStyle.visibility !== 'hidden'
      && adRect.height > 0
      && adRect.bottom > 0
      && adRect.top < window.innerHeight;
    return adVisible ? Math.round(adRect.height) : 0;
  }

  function updateAdaptiveMobileLayoutVars() {
    const root = document.documentElement;
    if (!(root instanceof HTMLElement)) {
      return;
    }
    updateMobileViewportHeightVar();
    if (layoutMode !== 'mobilePortrait') {
      root.style.removeProperty('--mobile-drawer-height');
      root.style.removeProperty('--mobile-topbar-height');
      root.style.removeProperty('--mobile-drawer-peek-height');
      root.style.removeProperty('--mobile-drawer-half-height');
      root.style.removeProperty('--mobile-drawer-full-height');
      root.style.removeProperty('--mobile-bottom-ad-height');
      return;
    }
    const { width, height } = getViewportSize();
    // An embedded preview can be physically small on a portrait phone while
    // its own viewport is intentionally a 16:9 landscape surface.  Do not
    // reintroduce portrait sizing through these adaptive variables.
    const forceEmbeddedLandscape = document.documentElement?.dataset.embedLandscape === 'true';
    const portrait = !forceEmbeddedLandscape && height >= width;
    const topbar = clamp(
      Math.round(height * (portrait ? 0.082 : 0.15)),
      portrait ? 60 : 72,
      portrait ? 76 : 102
    );
    const rootStyles = window.getComputedStyle(root);
    const tileSize = Math.max(
      40,
      Math.round(Number.parseFloat(rootStyles.getPropertyValue('--ui-control-tile-size')) || 44)
    );
    const handleHeight = Math.max(
      8,
      Math.round(Number.parseFloat(rootStyles.getPropertyValue('--mobile-drawer-handle-height')) || 12)
    );
    const panelGap = Math.max(
      0,
      Math.round(Number.parseFloat(rootStyles.getPropertyValue('--mobile-drawer-panel-gap')) || 0)
    );
    const safeBottom = Math.max(
      0,
      Math.round(Number.parseFloat(rootStyles.getPropertyValue('--mobile-safe-area-bottom')) || 0)
    );
    const adHeight = getVisibleMobileBottomAdHeight();
    root.style.setProperty('--mobile-bottom-ad-height', `${adHeight}px`);
    const halfMinBase =
      tileSize
      + handleHeight
      + panelGap
      + 26
      + Math.min(12, safeBottom)
      + MOBILE_DRAWER_PEEK_HEIGHT_OFFSET;
    const halfMin = Math.max(halfMinBase, portrait ? 188 : 210);
    const halfCap = Math.max(halfMin, Math.min(Math.round(height * (portrait ? 0.34 : 0.46)), portrait ? 340 : 305));
    const half = clamp(
      Math.round(height * (portrait ? 0.22 : 0.4)),
      halfMin,
      halfCap
    );
    const fullCapByViewport = Math.round(height - topbar - 52);
    const fullMin = Math.min(
      Math.max(half + 92, portrait ? 420 : 280),
      Math.max(half + 48, fullCapByViewport)
    );
    const fullCap = Math.max(fullMin, Math.min(fullCapByViewport, portrait ? 560 : 360));
    const full = clamp(
      Math.round(height * (portrait ? 0.64 : 0.56)),
      fullMin,
      fullCap
    );
    mobileDrawerState.heights.peek = half;
    mobileDrawerState.heights.half = half;
    mobileDrawerState.heights.full = full;
    root.style.setProperty('--mobile-topbar-height', `${topbar}px`);
    root.style.setProperty('--mobile-drawer-peek-height', `${half}px`);
    root.style.setProperty('--mobile-drawer-half-height', `${half}px`);
    root.style.setProperty('--mobile-drawer-full-height', `${full}px`);
    setMobileDrawerMode(mobileDrawerState.mode, { persist: false });
  }

  function updateLayoutMode() {
    const { width, height } = getViewportSize();
    const forceEmbeddedLandscape = document.documentElement?.dataset.embedLandscape === 'true';
    const orientation = forceEmbeddedLandscape || width > height ? 'landscape' : 'portrait';
    if (!lastViewportOrientation) {
      lastViewportOrientation = orientation;
    } else if (lastViewportOrientation !== orientation) {
      lastViewportOrientation = orientation;
      if (!orientationReloadPending) {
        orientationReloadPending = true;
        window.setTimeout(() => {
          window.location.reload();
        }, 0);
      }
      return;
    }
    const portrait = !forceEmbeddedLandscape && height >= width;
    const coarsePointer = isCoarsePointerDevice();
    const shortestEdge = Math.min(width, height);
    const longestEdge = Math.max(width, height);
    const shouldUseMobilePortrait = !forceEmbeddedLandscape && (
      (coarsePointer && portrait && shortestEdge <= 980 && longestEdge <= 2200) ||
      (!coarsePointer && portrait && width <= 680 && height <= 1280)
    );
    let nextMode = 'desktop';

    if (shouldUseMobilePortrait) {
      nextMode = 'mobilePortrait';
    } else if (width <= 1100 || (coarsePointer && width <= 1366 && height <= 900)) {
      nextMode = 'narrow';
    }

    if (layoutMode === nextMode) {
      updateAdaptiveMobileLayoutVars();
      if (nextMode !== 'mobilePortrait') {
        setRailWidth('left', railSizing.left, { persist: false });
        setRailWidth('right', railSizing.right, { persist: false });
        setBottomTimelineHeight(bottomTimelineSizing.height, { persist: false });
      }
      syncBottomTimelineDockState();
      updateRailToggleVisibility();
      return;
    }

    layoutMode = nextMode;
    applyLayoutMode();
  }

  function resolvePreferredMobileTab() {
    const preferredLeftTab = LEFT_TAB_KEYS.includes(state.activeLeftTab)
      ? state.activeLeftTab
      : '';
    const preferredRightTab = RIGHT_TAB_KEYS.includes(state.activeRightTab)
      ? state.activeRightTab
      : '';
    const prioritizeRightTab = preferredRightTab && preferredRightTab !== 'frames';
    const candidates = prioritizeRightTab
      ? [preferredRightTab, preferredLeftTab]
      : [preferredLeftTab, preferredRightTab];
    for (let index = 0; index < candidates.length; index += 1) {
      const key = candidates[index];
      if (key && dom.mobilePanels[key]) {
        return key;
      }
    }
    return (
      dom.mobileTabs.find(tab => tab.classList.contains('is-active'))?.dataset.mobileTab
      || dom.mobileTabs[0]?.dataset.mobileTab
      || ''
    );
  }

  function applyLayoutMode() {
    const isMobile = layoutMode === 'mobilePortrait';
    if (isMobile || !isDualLeftRailEnabled()) {
      endLeftDualSplitResize({ persist: false });
    }
    if (isMobile || !isUnifiedLeftToolsColorMode()) {
      endLeftUnifiedSplitResize({ persist: false });
    }
    if (isMobile) {
      endBottomTimelineResize({ persist: false });
    }
    // Reset compact right flyout portal before sections are re-mounted by layout map.
    // Without this, orientation changes can return the section to the old desktop parent.
    setCompactRightFlyoutOpen(false);
    setRightUtilityMenuOpen(false);
    document.body.classList.toggle('is-mobile-layout', isMobile);
    document.body.classList.toggle('is-right-tool-rail', !isMobile && isDesktopRightToolRailMode());
    try {
      document.dispatchEvent(new CustomEvent('pixiedraw:ad-layout-change', {
        detail: { layoutMode, isMobileLayout: isMobile }
      }));
    } catch (error) {
      // ignore
    }
    updateAdaptiveMobileLayoutVars();
    dom.mobileDrawer.hidden = !isMobile;
    if (dom.mobileTopBar) {
      dom.mobileTopBar.hidden = !isMobile;
    }
    if (dom.mobileDetailsAction instanceof HTMLElement) {
      dom.mobileDetailsAction.hidden = !isMobile;
      dom.mobileDetailsAction.setAttribute('aria-hidden', String(!isMobile));
    }
    if (dom.canvasControls) {
      if (isMobile && dom.mobileShortcutsMount) {
        dom.canvasControls.dataset.mobile = 'true';
        dom.mobileShortcutsMount.appendChild(dom.canvasControls);
      } else if (!isMobile && dom.editorCommandLaneActions instanceof HTMLElement) {
        delete dom.canvasControls.dataset.mobile;
        dom.editorCommandLaneActions.appendChild(dom.canvasControls);
      } else if (!isMobile && canvasControlsDefaultParent) {
        delete dom.canvasControls.dataset.mobile;
        if (canvasControlsDefaultNextSibling && canvasControlsDefaultNextSibling.parentNode === canvasControlsDefaultParent) {
          canvasControlsDefaultParent.insertBefore(dom.canvasControls, canvasControlsDefaultNextSibling);
        } else {
          canvasControlsDefaultParent.appendChild(dom.canvasControls);
        }
      }
    }
    if (dom.rightUtilityMenu instanceof HTMLElement) {
      if (!isMobile && dom.editorCommandLaneActions instanceof HTMLElement) {
        dom.editorCommandLaneActions.appendChild(dom.rightUtilityMenu);
      } else if (rightUtilityMenuDefaultParent instanceof HTMLElement) {
        if (
          rightUtilityMenuDefaultNextSibling
          && rightUtilityMenuDefaultNextSibling.parentNode === rightUtilityMenuDefaultParent
        ) {
          rightUtilityMenuDefaultParent.insertBefore(dom.rightUtilityMenu, rightUtilityMenuDefaultNextSibling);
        } else {
          rightUtilityMenuDefaultParent.appendChild(dom.rightUtilityMenu);
        }
      }
    }
    if (isMobile) {
      endRailResize({ persist: false });
      dom.leftRail.dataset.collapsed = 'true';
      dom.rightRail.dataset.collapsed = 'true';
      setMobileDrawerMode(MOBILE_DRAWER_DEFAULT_MODE, { persist: false });
    } else {
      endMobileDrawerDrag({ persist: false });
      dom.leftRail.dataset.collapsed = 'false';
      dom.rightRail.dataset.collapsed = 'false';
      setRailWidth('left', RAIL_INITIAL_WIDTH.left, { persist: false });
      setRailWidth('right', RAIL_INITIAL_WIDTH.right, { persist: false });
      setBottomTimelineHeight(BOTTOM_TIMELINE_INITIAL_HEIGHT, { persist: false });
    }

    Object.entries(layoutMap).forEach(([key, placement]) => {
      const section = dom.sections[key];
      if (!section) return;
      const sharedDetailsHost = key === 'details'
        ? document.getElementById('pixieedCommonDetailsSlot')
        : null;
      const target = sharedDetailsHost instanceof HTMLElement
        ? sharedDetailsHost
        : (isMobile ? placement.mobile : placement.desktop);
      if (!target) {
        if (isMobile) {
          section.hidden = true;
          section.setAttribute('aria-hidden', 'true');
          section.classList.remove('is-active', 'is-bottom-docked', 'panel-section--mobile');
        }
        return;
      }
      target.appendChild(section);
      section.classList.add('panel-section');
      section.classList.toggle('panel-section--mobile', isMobile && !(sharedDetailsHost instanceof HTMLElement));
      if (sharedDetailsHost instanceof HTMLElement) {
        section.hidden = false;
        section.setAttribute('aria-hidden', 'false');
        section.classList.remove('is-compact-flyout', 'is-bottom-docked');
        section.classList.add('is-active', 'pixieed-common-details__hosted-section');
      }
    });

    syncBottomTimelineDockState();
    updateLeftTabUI();
    updateLeftTabVisibility();
    updateRightTabUI();
    updateRightTabVisibility();

    if (isMobile) {
      const preferredMobileTab = resolvePreferredMobileTab();
      if (preferredMobileTab) {
        activateMobileTab(preferredMobileTab, { ensureDrawer: false });
      }
    } else {
      syncMobileQuickPanelButtons('');
    }
    enforceMobileSpectatorTabLock({ forceActivate: true });

    updateRailToggleVisibility();
    updateToolVisibility();
    syncVirtualCursorControlVisibility({ syncToggle: true });
    updateFloatingDrawButtonEnabledState();
    updateCanvasControlButtons();
    applyViewportTransform();
    clampFloatingDrawButtonPosition();
    resizeVirtualCursorCanvas();
    if (isMirrorToolPopoverOpen()) {
      syncMirrorToolPopoverMount();
      positionMirrorToolPopover();
    }
    requestOverlayRender();
  }

  function updateRailToggleVisibility() {
    const isMobile = layoutMode === 'mobilePortrait';
    const fixedDesktopSideRails = isDesktopRightToolRailMode();
    updateRailCompactState();
    updateRailMetrics();
    if (dom.resizeHandles.left) {
      dom.resizeHandles.left.hidden = isMobile;
    }
    if (dom.resizeHandles.right) {
      dom.resizeHandles.right.hidden = isMobile || fixedDesktopSideRails;
    }
    if (dom.resizeHandles.bottomTimeline) {
      dom.resizeHandles.bottomTimeline.hidden = isMobile || !isBottomTimelineDockEnabled();
    }
  }

  function setVirtualCursorEnabled(enabled, options = {}) {
    const { persist = true, updateControl = true } = options;
    const next = layoutMode === 'mobilePortrait' && Boolean(enabled);
    const prev = state.showVirtualCursor;

    if (updateControl && dom.controls.toggleVirtualCursor instanceof HTMLInputElement) {
      dom.controls.toggleVirtualCursor.checked = next;
    }
    if (prev === next) {
      syncVirtualCursorControlVisibility({ syncToggle: updateControl });
      return;
    }

    state.showVirtualCursor = next;
    if (next && !virtualCursor) {
      virtualCursor = createInitialVirtualCursor();
    }
    if (!next) {
      releaseVirtualCursorPointer();
      if (!pointerState.active && hoverPixel) {
        hoverPixel = null;
      }
    }
    syncVirtualCursorControlVisibility({ syncToggle: updateControl });
    requestOverlayRender();
    if (persist) {
      scheduleUiStatePersist();
    }
    updateFloatingDrawButtonEnabledState();
    refreshViewportCursorStyle();
    updateVirtualCursorActionToolButtons();
    updateCanvasControlButtons();
  }

  function isMirrorAxisKey(axis) {
    return MIRROR_AXIS_KEYS.includes(axis);
  }

  function isMirrorEnabledForTool(tool = pointerState.tool || state.tool) {
    const mirrorState = getNormalizedMirrorState();
    if (!mirrorState.enabled) {
      return false;
    }
    if (!hasActiveMirrorAxes(mirrorState)) {
      return false;
    }
    return MIRROR_DRAW_TOOLS.has(tool);
  }

  function isMirrorToolPopoverOpen() {
    return Boolean(mirrorToolPopoverState.open && dom.mirrorToolPopover instanceof HTMLElement && !dom.mirrorToolPopover.hidden);
  }

  function shouldDockMirrorToolPopover() {
    if (layoutMode === 'mobilePortrait') {
      return false;
    }
    if (!(dom.leftRail instanceof HTMLElement) || dom.leftRail.dataset.collapsed === 'true') {
      return false;
    }
    if (isCompactToolRailMode()) {
      return false;
    }
    return dom.sections.tools instanceof HTMLElement;
  }

  function getMirrorToolPopoverDockHost() {
    const toolsSection = dom.sections.tools;
    if (!(toolsSection instanceof HTMLElement)) {
      return null;
    }
    const body = toolsSection.querySelector('.panel-section__body');
    return body instanceof HTMLElement ? body : toolsSection;
  }

  function syncMirrorToolPopoverMount() {
    const popover = dom.mirrorToolPopover;
    if (!(popover instanceof HTMLElement)) {
      return;
    }
    if (shouldDockMirrorToolPopover()) {
      const host = getMirrorToolPopoverDockHost();
      if (!(host instanceof HTMLElement)) {
        return;
      }
      if (!mirrorToolPopoverMountState.parent) {
        mirrorToolPopoverMountState.parent = popover.parentNode;
        mirrorToolPopoverMountState.nextSibling = popover.nextSibling;
      }
      const adMount = host.querySelector('.panel-ad-mount');
      if (adMount instanceof HTMLElement && adMount.parentNode === host) {
        host.insertBefore(popover, adMount);
      } else if (popover.parentNode !== host) {
        host.appendChild(popover);
      }
      popover.classList.add('is-docked');
      popover.style.removeProperty('left');
      popover.style.removeProperty('top');
      return;
    }
    const mountParent = mirrorToolPopoverMountState.parent;
    if (mountParent instanceof Node && popover.parentNode !== mountParent) {
      const mountSibling = mirrorToolPopoverMountState.nextSibling;
      if (mountSibling instanceof Node && mountSibling.parentNode === mountParent) {
        mountParent.insertBefore(popover, mountSibling);
      } else {
        mountParent.appendChild(popover);
      }
    }
    popover.classList.remove('is-docked');
  }

  function isMirrorPopoverPersistentTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    if (target.closest(`.tool-button[data-tool="${TOOL_ACTION_MIRROR_POPUP}"], [data-ui-action="${TOP_UI_ACTION_MIRROR_POPUP}"]`)) {
      return true;
    }
    if (dom.mirrorToolPopover instanceof HTMLElement && dom.mirrorToolPopover.contains(target)) {
      return true;
    }
    return false;
  }

  function getMirrorToolPopoverBottomBoundary(viewportBounds, safeArea, padding = 8) {
    const defaultBottom = viewportBounds.bottom - safeArea.bottom - padding;
    if (layoutMode !== 'mobilePortrait') {
      return defaultBottom;
    }
    let boundary = defaultBottom;
    const edgeGap = 8;
    if (dom.mobileDrawer instanceof HTMLElement) {
      const drawerRect = dom.mobileDrawer.getBoundingClientRect();
      if (Number.isFinite(drawerRect.top) && drawerRect.height > 0) {
        boundary = Math.min(boundary, drawerRect.top - edgeGap);
      }
    }
    const mobileBottomAd = document.getElementById('mobileBottomAd');
    if (getVisibleMobileBottomAdHeight() > 0 && mobileBottomAd instanceof HTMLElement) {
      const adRect = mobileBottomAd.getBoundingClientRect();
      if (Number.isFinite(adRect.top)) {
        boundary = Math.min(boundary, adRect.top - edgeGap);
      }
    }
    return boundary;
  }

  function positionMirrorToolPopover() {
    if (!isMirrorToolPopoverOpen()) {
      return;
    }
    const popover = dom.mirrorToolPopover;
    if (!(popover instanceof HTMLElement)) {
      return;
    }
    if (popover.classList.contains('is-docked')) {
      popover.style.removeProperty('left');
      popover.style.removeProperty('top');
      popover.style.removeProperty('max-height');
      popover.style.removeProperty('overflow-y');
      return;
    }
    let anchor = mirrorToolPopoverState.anchor;
    if (!(anchor instanceof HTMLElement) || !anchor.isConnected) {
      anchor = getMirrorActionAnchor();
      mirrorToolPopoverState.anchor = anchor instanceof HTMLElement ? anchor : null;
    }
    if (!(anchor instanceof HTMLElement)) {
      return;
    }
    const anchorRect = anchor.getBoundingClientRect();
    const viewportBounds = getViewportBounds();
    const safeArea = getSafeAreaInsets();
    const padding = 8;
    const safeLeft = viewportBounds.left + safeArea.left + padding;
    const safeTop = viewportBounds.top + safeArea.top + padding;
    const safeRight = viewportBounds.right - safeArea.right - padding;
    const safeBottom = getMirrorToolPopoverBottomBoundary(viewportBounds, safeArea, padding);
    if (layoutMode === 'mobilePortrait') {
      const availableHeight = Math.max(1, Math.round(safeBottom - safeTop));
      popover.style.maxHeight = `${availableHeight}px`;
      popover.style.overflowY = 'auto';
    } else {
      popover.style.removeProperty('max-height');
      popover.style.removeProperty('overflow-y');
    }
    const measuredPopoverRect = popover.getBoundingClientRect();
    const popoverHeight = measuredPopoverRect.height;
    const popoverWidth = measuredPopoverRect.width;
    const maxLeft = Math.max(safeLeft, safeRight - popoverWidth);
    const preferredLeft = anchorRect.left + ((anchorRect.width - popoverWidth) * 0.5);
    const left = clamp(Math.round(preferredLeft), Math.round(safeLeft), Math.round(maxLeft));
    let top;
    if (layoutMode === 'mobilePortrait') {
      top = Math.round(safeBottom - popoverHeight);
    } else {
      const belowTop = anchorRect.bottom + 10;
      const aboveTop = anchorRect.top - popoverHeight - 10;
      top = belowTop;
      if ((top + popoverHeight) > safeBottom && aboveTop >= safeTop) {
        top = aboveTop;
      }
    }
    const maxTop = Math.max(safeTop, safeBottom - popoverHeight);
    top = clamp(Math.round(top), Math.round(safeTop), Math.round(maxTop));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function setMirrorToolPopoverOpen(open, options = {}) {
    const popover = dom.mirrorToolPopover;
    if (!(popover instanceof HTMLElement)) {
      return;
    }
    const next = Boolean(open);
    if (!next) {
      mirrorToolPopoverState.open = false;
      mirrorToolPopoverState.anchor = null;
      popover.hidden = true;
      popover.classList.remove('is-open');
      popover.setAttribute('aria-hidden', 'true');
      updateMirrorActionButtons();
      return;
    }
    if (options.anchor instanceof HTMLElement) {
      mirrorToolPopoverState.anchor = options.anchor;
    }
    if (!(mirrorToolPopoverState.anchor instanceof HTMLElement)) {
      const fallback = getMirrorActionAnchor();
      mirrorToolPopoverState.anchor = fallback instanceof HTMLElement ? fallback : null;
    }
    mirrorToolPopoverState.open = true;
    syncMirrorToolPopoverControls();
    syncMirrorToolPopoverMount();
    popover.hidden = false;
    popover.classList.add('is-open');
    popover.setAttribute('aria-hidden', 'false');
    updateMirrorActionButtons();
    positionMirrorToolPopover();
    window.requestAnimationFrame(positionMirrorToolPopover);
  }

  function toggleMirrorToolPopover(anchor) {
    if (isMirrorToolPopoverOpen()) {
      setMirrorToolPopoverOpen(false);
      return;
    }
    setMirrorToolPopoverOpen(true, { anchor });
  }

  function setMirrorModeEnabled(enabled, options = {}) {
    const { persist = true, updateControl = true } = options;
    const mirrorState = getNormalizedMirrorState();
    const next = Boolean(enabled);
    const enablingFromOff = next && !mirrorState.enabled;
    const needsDefaultAxis = next && !hasActiveMirrorAxes(mirrorState);
    const needsAxisReset = !next && hasActiveMirrorAxes(mirrorState);
    if (mirrorState.enabled === next && !needsDefaultAxis && !needsAxisReset) {
      if (updateControl && dom.controls.toggleMirrorMode instanceof HTMLInputElement) {
        dom.controls.toggleMirrorMode.checked = next;
      }
      syncControlsWithState();
      return;
    }
    if (enablingFromOff) {
      resetMirrorPivotToCanvasCenter(mirrorState);
    }
    if (needsDefaultAxis) {
      mirrorState.axes[MIRROR_AXIS_VERTICAL] = true;
    }
    if (!next) {
      MIRROR_AXIS_KEYS.forEach(axis => {
        mirrorState.axes[axis] = false;
      });
    }
    mirrorState.enabled = next;
    state.mirror = mirrorState;
    if (!next && isMirrorToolPopoverOpen()) {
      setMirrorToolPopoverOpen(false);
    }
    if (updateControl && dom.controls.toggleMirrorMode instanceof HTMLInputElement) {
      dom.controls.toggleMirrorMode.checked = next;
    }
    syncControlsWithState();
    requestOverlayRender();
    if (persist) {
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleSessionPersist();
      if (isMultiMasterMode() && !multiState.applyRemoteInProgress) {
        scheduleMultiSessionStateBroadcast({ immediate: false });
      }
    }
  }

  function setMirrorAxisEnabled(axis, enabled, options = {}) {
    const { persist = true, syncControls = true } = options;
    if (!isMirrorAxisKey(axis)) {
      return;
    }
    const mirrorState = getNormalizedMirrorState();
    const nextEnabled = Boolean(enabled);
    const previousEnabled = Boolean(mirrorState.axes[axis]);
    const shouldEnableMirrorMode = nextEnabled && !mirrorState.enabled;
    if (previousEnabled === nextEnabled && !shouldEnableMirrorMode) {
      if (syncControls) {
        syncControlsWithState();
      }
      return;
    }
    if (shouldEnableMirrorMode) {
      resetMirrorPivotToCanvasCenter(mirrorState);
    }
    mirrorState.axes[axis] = nextEnabled;
    if (nextEnabled) {
      mirrorState.enabled = true;
    }
    state.mirror = mirrorState;
    if (syncControls) {
      syncControlsWithState();
    }
    requestOverlayRender();
    if (persist) {
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleSessionPersist();
      if (isMultiMasterMode() && !multiState.applyRemoteInProgress) {
        scheduleMultiSessionStateBroadcast({ immediate: false });
      }
    }
  }

  function setMirrorPivot(x, y, options = {}) {
    const { persist = true } = options;
    const mirrorState = getNormalizedMirrorState();
    const nextX = clampMirrorAxisX(x, state.width);
    const nextY = clampMirrorAxisY(y, state.height);
    if (Math.abs((mirrorState.axisX ?? 0) - nextX) < 1e-6 && Math.abs((mirrorState.axisY ?? 0) - nextY) < 1e-6) {
      return;
    }
    mirrorState.axisX = nextX;
    mirrorState.axisY = nextY;
    state.mirror = mirrorState;
    requestOverlayRender();
    updateMirrorGuideHandles();
    if (persist) {
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleSessionPersist();
      if (isMultiMasterMode() && !multiState.applyRemoteInProgress) {
        scheduleMultiSessionStateBroadcast({ immediate: false });
      }
    }
  }

  function rescaleMirrorPivotForCanvas(previousWidth, previousHeight, nextWidth, nextHeight) {
    const prevW = Math.max(1, Math.floor(Number(previousWidth) || 1));
    const prevH = Math.max(1, Math.floor(Number(previousHeight) || 1));
    const nextW = Math.max(1, Math.floor(Number(nextWidth) || prevW));
    const nextH = Math.max(1, Math.floor(Number(nextHeight) || prevH));
    const mirrorState = getNormalizedMirrorState();
    const ratioX = (mirrorState.axisX + 0.5) / prevW;
    const ratioY = (mirrorState.axisY + 0.5) / prevH;
    mirrorState.axisX = clampMirrorAxisX((ratioX * nextW) - 0.5, nextW);
    mirrorState.axisY = clampMirrorAxisY((ratioY * nextH) - 0.5, nextH);
    state.mirror = mirrorState;
  }

  function translateMirrorPivotForCanvasResize(nextWidth, nextHeight, { offsetX = 0, offsetY = 0 } = {}) {
    const nextW = Math.max(1, Math.floor(Number(nextWidth) || 1));
    const nextH = Math.max(1, Math.floor(Number(nextHeight) || 1));
    const shiftX = Number(offsetX) || 0;
    const shiftY = Number(offsetY) || 0;
    const mirrorState = getNormalizedMirrorState();
    const fallback = createInitialMirrorState(nextW, nextH);
    const currentAxisX = Number.isFinite(mirrorState.axisX) ? mirrorState.axisX : fallback.axisX;
    const currentAxisY = Number.isFinite(mirrorState.axisY) ? mirrorState.axisY : fallback.axisY;
    mirrorState.axisX = clampMirrorAxisX(currentAxisX + shiftX, nextW);
    mirrorState.axisY = clampMirrorAxisY(currentAxisY + shiftY, nextH);
    state.mirror = mirrorState;
  }

  function reflectPointByMirrorAxis(point, axis, mirrorState) {
    if (!point || !mirrorState) {
      return null;
    }
    const px = Number(point.x);
    const py = Number(point.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      return null;
    }
    const axisX = Number(mirrorState.axisX);
    const axisY = Number(mirrorState.axisY);
    if (!Number.isFinite(axisX) || !Number.isFinite(axisY)) {
      return null;
    }
    if (axis === MIRROR_AXIS_VERTICAL) {
      return { x: Math.round((2 * axisX) - px), y: py };
    }
    if (axis === MIRROR_AXIS_HORIZONTAL) {
      return { x: px, y: Math.round((2 * axisY) - py) };
    }
    if (axis === MIRROR_AXIS_DIAGONAL_A) {
      const tx = px - axisX;
      const ty = py - axisY;
      return {
        x: Math.round(axisX + ty),
        y: Math.round(axisY + tx),
      };
    }
    if (axis === MIRROR_AXIS_DIAGONAL_B) {
      const tx = px - axisX;
      const ty = py - axisY;
      return {
        x: Math.round(axisX - ty),
        y: Math.round(axisY - tx),
      };
    }
    return null;
  }

  function getMirroredPointSet(x, y, options = {}) {
    const {
      tool = pointerState.tool || state.tool,
      includeOriginal = true,
    } = options;
    const width = Math.max(1, Number(state.width) || 1);
    const height = Math.max(1, Number(state.height) || 1);
    const result = [];
    const queue = [];
    const visited = new Set();
    const mirrorState = getNormalizedMirrorState();
    const mirrorEnabled = isMirrorEnabledForTool(tool);

    const addPoint = (candidateX, candidateY) => {
      if (!Number.isFinite(candidateX) || !Number.isFinite(candidateY)) {
        return;
      }
      const ix = Math.round(candidateX);
      const iy = Math.round(candidateY);
      if (ix < 0 || iy < 0 || ix >= width || iy >= height) {
        return;
      }
      const key = iy * width + ix;
      if (visited.has(key)) {
        return;
      }
      visited.add(key);
      result.push({ x: ix, y: iy });
      queue.push({ x: ix, y: iy });
    };

    if (includeOriginal) {
      addPoint(x, y);
    } else {
      queue.push({ x: Math.round(x), y: Math.round(y) });
    }

    if (!mirrorEnabled) {
      return result;
    }

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
      const current = queue[queueIndex];
      for (let i = 0; i < MIRROR_AXIS_KEYS.length; i += 1) {
        const axis = MIRROR_AXIS_KEYS[i];
        if (!mirrorState.axes[axis]) {
          continue;
        }
        const reflected = reflectPointByMirrorAxis(current, axis, mirrorState);
        if (!reflected) {
          continue;
        }
        addPoint(reflected.x, reflected.y);
      }
    }
    return result;
  }

  function forEachMirroredPoint(x, y, tool, callback) {
    if (typeof callback !== 'function') {
      return;
    }
    const points = getMirroredPointSet(x, y, { tool, includeOriginal: true });
    for (let i = 0; i < points.length; i += 1) {
      callback(points[i].x, points[i].y);
    }
  }

  function getDiagonalEndpointsInRect(slope, anchorX, anchorY, rectWidth, rectHeight) {
    if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY) || rectWidth <= 0 || rectHeight <= 0) {
      return null;
    }
    const points = [];
    const pushPoint = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return;
      }
      const epsilon = 1e-6;
      if (x < -epsilon || y < -epsilon || x > rectWidth + epsilon || y > rectHeight + epsilon) {
        return;
      }
      const clampedX = clamp(x, 0, rectWidth);
      const clampedY = clamp(y, 0, rectHeight);
      const duplicate = points.some(point => Math.abs(point.x - clampedX) < 0.25 && Math.abs(point.y - clampedY) < 0.25);
      if (!duplicate) {
        points.push({ x: clampedX, y: clampedY });
      }
    };

    if (slope === 1) {
      const b = anchorY - anchorX;
      pushPoint(0, b);
      pushPoint(rectWidth, rectWidth + b);
      pushPoint(-b, 0);
      pushPoint(rectHeight - b, rectHeight);
    } else if (slope === -1) {
      const c = anchorY + anchorX;
      pushPoint(0, c);
      pushPoint(rectWidth, -rectWidth + c);
      pushPoint(c, 0);
      pushPoint(c - rectHeight, rectHeight);
    }

    if (points.length < 2) {
      return null;
    }
    if (points.length === 2) {
      return [points[0], points[1]];
    }
    let bestA = points[0];
    let bestB = points[1];
    let maxDistanceSq = -1;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const dx = points[i].x - points[j].x;
        const dy = points[i].y - points[j].y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > maxDistanceSq) {
          maxDistanceSq = distanceSq;
          bestA = points[i];
          bestB = points[j];
        }
      }
    }
    return [bestA, bestB];
  }

  function clearCanvasScreenMetricsCache() {
    canvasScreenMetricsCache.key = '';
    canvasScreenMetricsCache.metrics = null;
  }

  function getCanvasScreenMetrics() {
    const viewport = dom.canvasViewport;
    const drawing = dom.canvases.drawing;
    if (!viewport || !drawing) {
      clearCanvasScreenMetricsCache();
      return null;
    }
    const viewportRect = viewport.getBoundingClientRect();
    const drawingRect = drawing.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0 || drawingRect.width <= 0 || drawingRect.height <= 0) {
      clearCanvasScreenMetricsCache();
      return null;
    }
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    const cacheKey = [
      activeCanvasId,
      Math.round(viewport.clientWidth || 0),
      Math.round(viewport.clientHeight || 0),
      Math.round(drawing.clientWidth || 0),
      Math.round(drawing.clientHeight || 0),
      Math.round(viewportRect.left * 10),
      Math.round(viewportRect.top * 10),
      Math.round(drawingRect.left * 10),
      Math.round(drawingRect.top * 10),
      Math.max(1, Math.round(Number(state.width) || 0)),
      Math.max(1, Math.round(Number(state.height) || 0)),
      Math.round((Number(state.scale) || 0) * 1000),
      Math.round(Number(state.pan.x) || 0),
      Math.round(Number(state.pan.y) || 0),
    ].join(':');
    if (canvasScreenMetricsCache.key === cacheKey && canvasScreenMetricsCache.metrics) {
      return canvasScreenMetricsCache.metrics;
    }
    const metrics = {
      viewportRect,
      drawingRect,
      left: drawingRect.left - viewportRect.left,
      top: drawingRect.top - viewportRect.top,
      width: drawingRect.width,
      height: drawingRect.height,
    };
    canvasScreenMetricsCache.key = cacheKey;
    canvasScreenMetricsCache.metrics = metrics;
    return metrics;
  }

  function setMirrorGuideLine(lineElement, start, end, visible) {
    if (!(lineElement instanceof HTMLElement)) {
      return;
    }
    if (!visible || !start || !end) {
      lineElement.classList.remove('is-active');
      lineElement.style.width = '0px';
      return;
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (!Number.isFinite(length) || length <= 0) {
      lineElement.classList.remove('is-active');
      lineElement.style.width = '0px';
      return;
    }
    const angle = Math.atan2(dy, dx);
    lineElement.classList.add('is-active');
    lineElement.style.left = `${start.x}px`;
    lineElement.style.top = `${start.y}px`;
    lineElement.style.width = `${length}px`;
    lineElement.style.transform = `rotate(${angle}rad)`;
  }

  function setMirrorHandlePosition(handle, x, y, visible = true) {
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    if (!visible || !Number.isFinite(x) || !Number.isFinite(y)) {
      handle.classList.add('is-hidden');
      handle.setAttribute('aria-hidden', 'true');
      return;
    }
    handle.classList.remove('is-hidden');
    handle.setAttribute('aria-hidden', 'false');
    handle.style.left = `${x}px`;
    handle.style.top = `${y}px`;
  }

  function getMirrorGuideLineElement(axis) {
    if (!Array.isArray(dom.mirrorGuideLines)) {
      return null;
    }
    return dom.mirrorGuideLines.find(line => line?.dataset?.mirrorAxis === axis) || null;
  }

  function getMirrorHandleElement(axis) {
    if (!Array.isArray(dom.mirrorHandles)) {
      return null;
    }
    return dom.mirrorHandles.find(handle => handle?.dataset?.mirrorAxis === axis) || null;
  }

  function getMirrorAxisHandleLabel(axis, active) {
    let axisLabel = '';
    if (axis === MIRROR_AXIS_VERTICAL) {
      axisLabel = localizeText('左右対称', 'Vertical Mirror');
    } else if (axis === MIRROR_AXIS_HORIZONTAL) {
      axisLabel = localizeText('上下対称', 'Horizontal Mirror');
    } else if (axis === MIRROR_AXIS_DIAGONAL_A) {
      axisLabel = localizeText('斜め対称 (＼)', 'Diagonal Mirror (\\)');
    } else if (axis === MIRROR_AXIS_DIAGONAL_B) {
      axisLabel = localizeText('斜め対称 (/)', 'Diagonal Mirror (/)');
    }
    if (!axisLabel) {
      return '';
    }
    return active
      ? localizeText(`${axisLabel}: クリックでオフ、ドラッグで位置移動`, `${axisLabel}: click to turn off, drag to move`)
      : localizeText(`${axisLabel}をオン`, `Turn ${axisLabel} on`);
  }

  function updateMirrorGuideHandles() {
    const guideContainer = dom.mirrorGuides;
    if (!(guideContainer instanceof HTMLElement)) {
      return;
    }
    if (document.body.classList.contains('is-canvas-surface-moving')) {
      guideContainer.hidden = true;
      guideContainer.setAttribute('aria-hidden', 'true');
      MIRROR_AXIS_KEYS.forEach(axis => {
        setMirrorGuideLine(getMirrorGuideLineElement(axis), null, null, false);
        setMirrorHandlePosition(getMirrorHandleElement(axis), NaN, NaN, false);
      });
      return;
    }
    const mirrorState = getNormalizedMirrorState();
    const metrics = getCanvasScreenMetrics();
    const showControls = Boolean(mirrorState.enabled && metrics);
    const showGuides = Boolean(showControls && hasActiveMirrorAxes(mirrorState));
    guideContainer.hidden = !showControls;
    guideContainer.setAttribute('aria-hidden', String(!showControls));
    if (!showControls) {
      MIRROR_AXIS_KEYS.forEach(axis => {
        setMirrorGuideLine(getMirrorGuideLineElement(axis), null, null, false);
        setMirrorHandlePosition(getMirrorHandleElement(axis), NaN, NaN, false);
      });
      return;
    }

    const { left, top, width, height } = metrics;
    const axisXRatio = (mirrorState.axisX + 0.5) / Math.max(1, state.width);
    const axisYRatio = (mirrorState.axisY + 0.5) / Math.max(1, state.height);
    const pivotX = left + (axisXRatio * width);
    const pivotY = top + (axisYRatio * height);
    const outside = MIRROR_HANDLE_OUTSIDE_OFFSET;
    const diagonalHandleXLeft = left;
    const diagonalHandleXRight = left + width;
    const diagonalHandleY = top - outside;

    const verticalActive = Boolean(mirrorState.axes[MIRROR_AXIS_VERTICAL]);
    const horizontalActive = Boolean(mirrorState.axes[MIRROR_AXIS_HORIZONTAL]);
    const diagonalAActive = Boolean(mirrorState.axes[MIRROR_AXIS_DIAGONAL_A]);
    const diagonalBActive = Boolean(mirrorState.axes[MIRROR_AXIS_DIAGONAL_B]);
    const axisToggleDisabled = !canCurrentClientEditProjectStructure();

    MIRROR_AXIS_KEYS.forEach(axis => {
      const button = getMirrorHandleElement(axis);
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const pressed = Boolean(mirrorState.axes[axis]);
      const controlLabel = getMirrorAxisHandleLabel(axis, pressed);
      button.classList.toggle('is-active', pressed);
      button.classList.toggle('is-disabled', axisToggleDisabled);
      button.setAttribute('aria-pressed', String(pressed));
      button.setAttribute('aria-disabled', String(axisToggleDisabled));
      if (controlLabel) {
        button.setAttribute('aria-label', controlLabel);
        button.setAttribute('title', controlLabel);
      }
      button.disabled = axisToggleDisabled;
    });

    setMirrorGuideLine(
      getMirrorGuideLineElement(MIRROR_AXIS_VERTICAL),
      { x: pivotX, y: top },
      { x: pivotX, y: top + height },
      verticalActive
    );
    setMirrorGuideLine(
      getMirrorGuideLineElement(MIRROR_AXIS_HORIZONTAL),
      { x: left, y: pivotY },
      { x: left + width, y: pivotY },
      horizontalActive
    );

    const diagonalAEndpoints = getDiagonalEndpointsInRect(1, axisXRatio * width, axisYRatio * height, width, height);
    const diagonalAStart = diagonalAEndpoints ? { x: left + diagonalAEndpoints[0].x, y: top + diagonalAEndpoints[0].y } : null;
    const diagonalAEnd = diagonalAEndpoints ? { x: left + diagonalAEndpoints[1].x, y: top + diagonalAEndpoints[1].y } : null;
    setMirrorGuideLine(
      getMirrorGuideLineElement(MIRROR_AXIS_DIAGONAL_A),
      diagonalAStart,
      diagonalAEnd,
      diagonalAActive
    );

    const diagonalBEndpoints = getDiagonalEndpointsInRect(-1, axisXRatio * width, axisYRatio * height, width, height);
    const diagonalBStart = diagonalBEndpoints ? { x: left + diagonalBEndpoints[0].x, y: top + diagonalBEndpoints[0].y } : null;
    const diagonalBEnd = diagonalBEndpoints ? { x: left + diagonalBEndpoints[1].x, y: top + diagonalBEndpoints[1].y } : null;
    setMirrorGuideLine(
      getMirrorGuideLineElement(MIRROR_AXIS_DIAGONAL_B),
      diagonalBStart,
      diagonalBEnd,
      diagonalBActive
    );

    setMirrorHandlePosition(
      getMirrorHandleElement(MIRROR_AXIS_VERTICAL),
      pivotX,
      top - outside,
      true
    );
    setMirrorHandlePosition(
      getMirrorHandleElement(MIRROR_AXIS_HORIZONTAL),
      left - outside,
      pivotY,
      true
    );

    if (diagonalAStart && diagonalAEnd) {
      const pickTopLeft = point => (point.x + point.y);
      const anchor = pickTopLeft(diagonalAStart) <= pickTopLeft(diagonalAEnd) ? diagonalAStart : diagonalAEnd;
      const vx = anchor.x - pivotX;
      const vy = anchor.y - pivotY;
      const norm = Math.hypot(vx, vy) || 1;
      setMirrorHandlePosition(
        getMirrorHandleElement(MIRROR_AXIS_DIAGONAL_A),
        anchor.x + ((vx / norm) * outside),
        anchor.y + ((vy / norm) * outside),
        true
      );
    } else {
      setMirrorHandlePosition(
        getMirrorHandleElement(MIRROR_AXIS_DIAGONAL_A),
        diagonalHandleXLeft,
        diagonalHandleY,
        true
      );
    }

    if (diagonalBStart && diagonalBEnd) {
      const pickTopRight = point => (point.x - point.y);
      const anchor = pickTopRight(diagonalBStart) >= pickTopRight(diagonalBEnd) ? diagonalBStart : diagonalBEnd;
      const vx = anchor.x - pivotX;
      const vy = anchor.y - pivotY;
      const norm = Math.hypot(vx, vy) || 1;
      setMirrorHandlePosition(
        getMirrorHandleElement(MIRROR_AXIS_DIAGONAL_B),
        anchor.x + ((vx / norm) * outside),
        anchor.y + ((vy / norm) * outside),
        true
      );
    } else {
      setMirrorHandlePosition(
        getMirrorHandleElement(MIRROR_AXIS_DIAGONAL_B),
        diagonalHandleXRight,
        diagonalHandleY,
        true
      );
    }
  }

  function updateMirrorFromDragPosition(clientX, clientY, axis) {
    if (!isMirrorAxisKey(axis)) {
      return;
    }
    const startCanvasWidth = Math.max(1, Number(mirrorHandleDragState.startCanvasWidth) || 1);
    const startCanvasHeight = Math.max(1, Number(mirrorHandleDragState.startCanvasHeight) || 1);
    const startClientX = Number(mirrorHandleDragState.startClientX) || 0;
    const startClientY = Number(mirrorHandleDragState.startClientY) || 0;
    const startAxisX = Number(mirrorHandleDragState.startAxisX) || 0;
    const startAxisY = Number(mirrorHandleDragState.startAxisY) || 0;
    const deltaAxisX = ((Number(clientX) - startClientX) / startCanvasWidth) * state.width;
    const deltaAxisY = ((Number(clientY) - startClientY) / startCanvasHeight) * state.height;
    const axisX = clampMirrorAxisX(startAxisX + deltaAxisX, state.width);
    const axisY = clampMirrorAxisY(startAxisY + deltaAxisY, state.height);
    const mirrorState = getNormalizedMirrorState();
    if (axis === MIRROR_AXIS_VERTICAL) {
      setMirrorPivot(axisX, mirrorState.axisY, { persist: false });
      return;
    }
    if (axis === MIRROR_AXIS_HORIZONTAL) {
      setMirrorPivot(mirrorState.axisX, axisY, { persist: false });
      return;
    }
    if (axis === MIRROR_AXIS_DIAGONAL_A || axis === MIRROR_AXIS_DIAGONAL_B) {
      // Diagonal axes share the same pivot as vertical/horizontal axes.
      setMirrorPivot(axisX, axisY, { persist: false });
    }
  }

  function finishMirrorHandleDrag({ persist = true } = {}) {
    if (!mirrorHandleDragState.active) {
      return;
    }
    const handle = mirrorHandleDragState.handle;
    const pointerId = mirrorHandleDragState.pointerId;
    if (handle && pointerId !== null && handle.hasPointerCapture?.(pointerId)) {
      try {
        handle.releasePointerCapture(pointerId);
      } catch (error) {
        // Ignore pointer capture release issues.
      }
    }
    mirrorHandleDragState.active = false;
    mirrorHandleDragState.pointerId = null;
    mirrorHandleDragState.axis = null;
    mirrorHandleDragState.handle = null;
    mirrorHandleDragState.startClientX = 0;
    mirrorHandleDragState.startClientY = 0;
    mirrorHandleDragState.startAxisX = 0;
    mirrorHandleDragState.startAxisY = 0;
    mirrorHandleDragState.startCanvasWidth = 1;
    mirrorHandleDragState.startCanvasHeight = 1;
    if (persist) {
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleSessionPersist();
      if (isMultiMasterMode() && !multiState.applyRemoteInProgress) {
        scheduleMultiSessionStateBroadcast({ immediate: false });
      }
    }
    mirrorHandleDragState.moved = false;
    updateMirrorGuideHandles();
  }

  function shouldSuppressMirrorHandleClick(axis) {
    if (mirrorHandleDragState.suppressClickAxis !== axis) {
      return false;
    }
    if ((Date.now() - mirrorHandleDragState.suppressClickAt) > 350) {
      mirrorHandleDragState.suppressClickAxis = '';
      mirrorHandleDragState.suppressClickAt = 0;
      return false;
    }
    mirrorHandleDragState.suppressClickAxis = '';
    mirrorHandleDragState.suppressClickAt = 0;
    return true;
  }

  function handleMirrorHandlePointerDown(event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const drawing = dom.canvases.drawing;
    if (!(drawing instanceof HTMLCanvasElement)) {
      return;
    }
    const axis = target.dataset.mirrorAxis;
    if (!isMirrorAxisKey(axis)) {
      return;
    }
    const mirrorState = getNormalizedMirrorState();
    if (!mirrorState.enabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!mirrorState.axes[axis]) {
      return;
    }
    const rect = drawing.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    mirrorHandleDragState.active = true;
    mirrorHandleDragState.pointerId = event.pointerId;
    mirrorHandleDragState.axis = axis;
    mirrorHandleDragState.handle = target;
    mirrorHandleDragState.startClientX = Number(event.clientX) || 0;
    mirrorHandleDragState.startClientY = Number(event.clientY) || 0;
    mirrorHandleDragState.startAxisX = Number(mirrorState.axisX) || 0;
    mirrorHandleDragState.startAxisY = Number(mirrorState.axisY) || 0;
    mirrorHandleDragState.startCanvasWidth = Math.max(1, rect.width);
    mirrorHandleDragState.startCanvasHeight = Math.max(1, rect.height);
    mirrorHandleDragState.moved = false;
    mirrorHandleDragState.suppressClickAxis = '';
    mirrorHandleDragState.suppressClickAt = 0;
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore pointer capture failures.
    }
    updateMirrorGuideHandles();
  }

  function handleMirrorHandlePointerMove(event) {
    if (!mirrorHandleDragState.active || mirrorHandleDragState.pointerId !== event.pointerId) {
      return;
    }
    const axis = mirrorHandleDragState.axis;
    if (!axis) {
      return;
    }
    event.preventDefault();
    if (!mirrorHandleDragState.moved) {
      const deltaX = Number(event.clientX) - mirrorHandleDragState.startClientX;
      const deltaY = Number(event.clientY) - mirrorHandleDragState.startClientY;
      mirrorHandleDragState.moved = Math.hypot(deltaX, deltaY) >= MIRROR_HANDLE_DRAG_THRESHOLD;
    }
    if (!mirrorHandleDragState.moved) {
      return;
    }
    updateMirrorFromDragPosition(event.clientX, event.clientY, axis);
    updateMirrorGuideHandles();
  }

  function handleMirrorHandlePointerUp(event) {
    if (!mirrorHandleDragState.active || mirrorHandleDragState.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const axis = mirrorHandleDragState.axis;
    const moved = mirrorHandleDragState.moved;
    finishMirrorHandleDrag({ persist: moved });
    if (moved && isMirrorAxisKey(axis)) {
      mirrorHandleDragState.suppressClickAxis = axis;
      mirrorHandleDragState.suppressClickAt = Date.now();
    }
  }

  function setupMirrorGuides() {
    if (!Array.isArray(dom.mirrorHandles) || !dom.mirrorHandles.length) {
      return;
    }
    dom.mirrorHandles.forEach(handle => {
      if (!(handle instanceof HTMLElement) || handle.dataset.mirrorBound === 'true') {
        return;
      }
      handle.dataset.mirrorBound = 'true';
      handle.addEventListener('pointerdown', handleMirrorHandlePointerDown);
      handle.addEventListener('pointermove', handleMirrorHandlePointerMove);
      handle.addEventListener('pointerup', handleMirrorHandlePointerUp);
      handle.addEventListener('pointercancel', handleMirrorHandlePointerUp);
      handle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const axis = handle.dataset.mirrorAxis || '';
        if (!isMirrorAxisKey(axis)) {
          return;
        }
        const mirrorState = getNormalizedMirrorState();
        if (!mirrorState.enabled || shouldSuppressMirrorHandleClick(axis)) {
          return;
        }
        setMirrorAxisEnabled(axis, !Boolean(mirrorState.axes[axis]));
      });
    });
    updateMirrorGuideHandles();
  }

  function setupMirrorGuideResizeObserver() {
    if (mirrorGuideResizeObserver) {
      mirrorGuideResizeObserver.disconnect();
      mirrorGuideResizeObserver = null;
    }
    if (typeof ResizeObserver !== 'function') {
      return;
    }
    const targets = [dom.canvasViewport, dom.canvases.drawing]
      .filter(node => node instanceof HTMLElement);
    if (!targets.length) {
      return;
    }
    mirrorGuideResizeObserver = new ResizeObserver(() => {
      scheduleMirrorGuideRefresh();
    });
    targets.forEach(target => {
      mirrorGuideResizeObserver?.observe(target);
    });
  }

  function setupMirrorToolPopover() {
    const popover = dom.mirrorToolPopover;
    if (!(popover instanceof HTMLElement) || popover.dataset.bound === 'true') {
      return;
    }
    popover.dataset.bound = 'true';
    popover.hidden = true;
    popover.setAttribute('aria-hidden', 'true');
    renderMirrorToolPopover();
    syncMirrorToolPopoverControls();
    dom.controls.mirrorToolPopoverItems?.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }
      const button = target.closest('.mirror-axis-button[data-mirror-tool-key]');
      if (!(button instanceof HTMLElement)) {
        return;
      }
      const { mirrorToolKey } = button.dataset;
      if (!mirrorToolKey) {
        return;
      }
      event.preventDefault();
      onMirrorToolClick(mirrorToolKey);
    });
    dom.controls.mirrorToolPopoverClose?.addEventListener('click', () => {
      setMirrorToolPopoverOpen(false);
    });

    if (mirrorToolPopoverListenersBound) {
      return;
    }
    mirrorToolPopoverListenersBound = true;
    document.addEventListener(
      'pointerdown',
      event => {
        if (!isMirrorToolPopoverOpen()) {
          return;
        }
        const target = event.target instanceof Element ? event.target : null;
        if (!target) {
          setMirrorToolPopoverOpen(false);
          return;
        }
        if (isMirrorPopoverPersistentTarget(target)) {
          return;
        }
        setMirrorToolPopoverOpen(false);
      },
      true
    );
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isMirrorToolPopoverOpen()) {
        setMirrorToolPopoverOpen(false);
      }
    });
    window.addEventListener('resize', () => {
      if (isMirrorToolPopoverOpen()) {
        positionMirrorToolPopover();
      }
    });
    window.addEventListener(
      'scroll',
      () => {
        if (isMirrorToolPopoverOpen()) {
          positionMirrorToolPopover();
        }
      },
      true
    );
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        if (isMirrorToolPopoverOpen()) {
          positionMirrorToolPopover();
        }
      });
      window.visualViewport.addEventListener('scroll', () => {
        if (isMirrorToolPopoverOpen()) {
          positionMirrorToolPopover();
        }
      });
    }
    document.addEventListener('pixiedraw:ad-layout-change', () => {
      if (isMirrorToolPopoverOpen()) {
        positionMirrorToolPopover();
      }
    });
  }

  /* solidShape tool functions removed */

  function setupControls() {
    bindCoreProjectActionButtons();
    if (dom.controls.pixieedAccountLogin instanceof HTMLAnchorElement && dom.controls.pixieedAccountLogin.dataset.bound !== 'true') {
      dom.controls.pixieedAccountLogin.dataset.bound = 'true';
      dom.controls.pixieedAccountLogin.addEventListener('click', event => {
        event.preventDefault();
        startPixieedAccountLoginFlow();
      });
    }
    [
      dom.controls.multiEntryAccountLogin,
      dom.controls.multiFlowAccountLogin,
    ].forEach(loginAnchor => {
      if (!(loginAnchor instanceof HTMLAnchorElement) || loginAnchor.dataset.bound === 'true') {
        return;
      }
      loginAnchor.dataset.bound = 'true';
      loginAnchor.addEventListener('click', event => {
        event.preventDefault();
        startPixieedAccountLoginFlow();
      });
    });
    if (dom.controls.pixieedAccountLogout instanceof HTMLButtonElement && dom.controls.pixieedAccountLogout.dataset.bound !== 'true') {
      dom.controls.pixieedAccountLogout.dataset.bound = 'true';
      dom.controls.pixieedAccountLogout.addEventListener('click', async () => {
        try {
          const supabase = await ensurePixieedAccountClient();
          if (!supabase) {
            return;
          }
          await supabase.auth.signOut();
        } catch (error) {
          console.warn('Pixieed account sign out failed', error);
        } finally {
          applyPixieedAccountSession(null);
          updatePixieedAccountUi();
        }
      });
    }
    if (dom.controls.pixieedAccountDock instanceof HTMLElement && dom.controls.pixieedAccountDock.dataset.bound !== 'true') {
      dom.controls.pixieedAccountDock.dataset.bound = 'true';
      dom.controls.pixieedAccountDock.addEventListener('click', () => {
        if (accountState.isLoggedIn && !accountState.isAnonymous) {
          return;
        }
        startPixieedAccountLoginFlow();
      });
    }
    if (dom.controls.pwaInstallButton instanceof HTMLButtonElement && dom.controls.pwaInstallButton.dataset.bound !== 'true') {
      dom.controls.pwaInstallButton.dataset.bound = 'true';
      dom.controls.pwaInstallButton.addEventListener('click', () => {
        if (window.pixieedPwaInstall?.open) {
          window.pixieedPwaInstall.open();
        }
      });
    }
    if (!window.__PIXIEED_PWA_INSTALL_LISTENER_BOUND__) {
      window.__PIXIEED_PWA_INSTALL_LISTENER_BOUND__ = true;
      window.addEventListener('pixieed:pwa-install-availability-change', () => {
        syncPwaInstallUi();
      });
    }
    updatePixieedAccountUi();
    syncPwaInstallUi();
    if (dom.controls.toggleGrid instanceof HTMLInputElement) {
      dom.controls.toggleGrid.addEventListener('change', () => {
        state.showGrid = dom.controls.toggleGrid.checked;
        updateGridDecorations();
        requestOverlayRender();
        scheduleUiStatePersist();
      });
    }

    if (dom.controls.toggleMajorGrid instanceof HTMLInputElement) {
      dom.controls.toggleMajorGrid.addEventListener('change', () => {
        state.showMajorGrid = dom.controls.toggleMajorGrid.checked;
        updateGridDecorations();
        requestOverlayRender();
        scheduleUiStatePersist();
      });
    }

    if (dom.controls.toggleQrMode instanceof HTMLInputElement && dom.controls.toggleQrMode.dataset.bound !== 'true') {
      dom.controls.toggleQrMode.dataset.bound = 'true';
      dom.controls.toggleQrMode.addEventListener('change', () => {
        setQrEditPanelVisibleForActiveProject(dom.controls.toggleQrMode.checked);
      });
    }

    dom.controls.toggleBackgroundMode?.addEventListener('click', () => {
      const modes = ['dark', 'light', 'pink'];
      const nextIndex = (modes.indexOf(state.backgroundMode) + 1) % modes.length;
      state.backgroundMode = modes[nextIndex];
      updateGridDecorations();
      syncControlsWithState();
      scheduleUiStatePersist();
    });

    dom.controls.toggleUiTheme?.addEventListener('click', () => {
      const current = normalizeUiTheme(state.uiTheme, DEFAULT_UI_THEME);
      const currentIndex = Math.max(0, UI_THEME_KEYS.indexOf(current));
      const nextTheme = UI_THEME_KEYS[(currentIndex + 1) % UI_THEME_KEYS.length] || DEFAULT_UI_THEME;
      applyUiTheme(nextTheme);
      syncControlsWithState();
    });

    const zoomSlider = dom.controls.zoomSlider;
    if (zoomSlider) {
      zoomSlider.min = String(ZOOM_SLIDER_MIN);
      zoomSlider.max = String(ZOOM_SLIDER_MAX);
      zoomSlider.step = '1';
      zoomSlider.value = String(Math.round(getZoomRatioForScale(state.scale) * 100));
      zoomSlider.addEventListener('input', event => {
        const ratioPercent = Number(event.target.value);
        if (!Number.isFinite(ratioPercent)) {
          return;
        }
        setZoom(getZoomScaleForRatio(ratioPercent / 100));
      });
    }
    const zoomInput = dom.controls.zoomInput;
    if (zoomInput instanceof HTMLInputElement && zoomInput.dataset.bound !== 'true') {
      zoomInput.dataset.bound = 'true';
      const applyZoomInput = () => {
        const parsedScale = parseZoomInputScale(zoomInput.value);
        if (parsedScale === null) {
          syncZoomControls(state.scale);
          return;
        }
        setZoom(parsedScale);
      };
      zoomInput.addEventListener('change', () => {
        applyZoomInput();
      });
      zoomInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applyZoomInput();
          zoomInput.blur();
        }
      });
      zoomInput.addEventListener('blur', () => {
        syncZoomControls(state.scale);
      });
    }

    const handleCanvasControlClick = event => {
      const action = event.currentTarget?.dataset?.action;
      if (!action) return;
      if (action === 'zoomOut') {
        adjustZoomBySteps(-1);
      } else if (action === 'zoomIn') {
        adjustZoomBySteps(1);
      } else if (action === 'copy') {
        performCopyAction();
      } else if (action === 'paste') {
        performPasteAction();
      } else if (action === 'cut') {
        performCutAction();
      } else if (action === 'cancelSelectionMove') {
        cancelPendingSelectionMove();
      } else if (action === 'confirmSelectionMove') {
        confirmPendingSelectionMove({ allowOutOfBoundsClip: true });
      }
      updateCanvasControlButtons();
    };

    dom.controls.canvasControlPrimary?.addEventListener('click', handleCanvasControlClick);
    dom.controls.canvasControlSecondary?.addEventListener('click', handleCanvasControlClick);
    dom.controls.canvasClipboardCopy?.addEventListener('click', handleCanvasControlClick);
    dom.controls.canvasClipboardPaste?.addEventListener('click', handleCanvasControlClick);
    dom.controls.canvasClipboardCut?.addEventListener('click', handleCanvasControlClick);

    if (dom.controls.undoAction) {
      dom.controls.undoAction.replaceChildren(makeIcon('action-undo', '↺', { width: 20, height: 20, extension: 'png' }));
    }
    if (dom.controls.redoAction) {
      dom.controls.redoAction.replaceChildren(makeIcon('action-redo', '↻', { width: 20, height: 20, extension: 'png' }));
    }
    if (dom.controls.appReloadAction instanceof HTMLButtonElement) {
      const reloadIcon = makeIcon('action-reload', '⟳', { width: 20, height: 20, extension: 'png' });
      reloadIcon.addEventListener('error', () => {
        dom.controls.appReloadAction.textContent = '⟳';
      }, { once: true });
      dom.controls.appReloadAction.replaceChildren(reloadIcon);
      dom.controls.appReloadAction.addEventListener('click', () => {
        requestManualAppReload('manual-toolbar-reload');
      });
    }
    if (dom.controls.sharedStatusRecoverAction instanceof HTMLButtonElement) {
      dom.controls.sharedStatusRecoverAction.addEventListener('click', () => {
        requestManualAppReload('manual-status-reload');
      });
    }

    updateCanvasControlButtons();

    dom.controls.brushSize?.addEventListener('input', event => {
      state.brushSize = clamp(Math.round(Number(event.target.value)), 1, 32);
      if (dom.controls.brushSizeValue) {
        dom.controls.brushSizeValue.textContent = `${state.brushSize}px`;
      }
      scheduleUiStatePersist();
    });

    if (Array.isArray(dom.controls.brushShapeButtons)) {
      dom.controls.brushShapeButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        button.addEventListener('click', event => {
          const target = event.currentTarget;
          if (!(target instanceof HTMLButtonElement)) {
            return;
          }
          const next = normalizeBrushShape(target.dataset.brushShape, state.brushShape);
          const hasSelection = selectionMaskHasPixels(state.selectionMask);
          const isCustomAlreadySelected = state.brushShape === BRUSH_SHAPE_CUSTOM;

          // While custom is selected, clicking custom again with a selection refreshes the brush.
          if (next === BRUSH_SHAPE_CUSTOM && isCustomAlreadySelected && hasSelection) {
            createCustomBrushFromSelection();
            return;
          }

          if (next === BRUSH_SHAPE_CUSTOM && !hasCustomBrushData()) {
            if (!hasSelection) {
              state.brushShape = BRUSH_SHAPE_SQUARE;
              syncBrushControls();
              updateAutosaveStatus(
                localizeText('範囲選択中にカスタムを押すとブラシ化できます', 'Select an area and press Custom to create a brush'),
                'info'
              );
              scheduleUiStatePersist();
              return;
            }
            createCustomBrushFromSelection();
            return;
          }
          state.brushShape = next;
          syncBrushControls();
          requestOverlayRender();
          scheduleUiStatePersist();
        });
      });
    }

    if (Array.isArray(dom.controls.selectSameModeButtons)) {
      dom.controls.selectSameModeButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        button.addEventListener('click', event => {
          const target = event.currentTarget;
          if (!(target instanceof HTMLButtonElement)) {
            return;
          }
          const next = normalizeSelectSameMode(target.dataset.selectSameMode, state.selectSameMode);
          if (next === state.selectSameMode) {
            return;
          }
          state.selectSameMode = next;
          syncSelectSameModeControls();
          scheduleUiStatePersist();
        });
      });
      syncSelectSameModeControls();
    }

    if (Array.isArray(dom.controls.selectionShapeModeButtons)) {
      dom.controls.selectionShapeModeButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        button.addEventListener('click', event => {
          const target = event.currentTarget;
          if (!(target instanceof HTMLButtonElement)) {
            return;
          }
          const next = normalizeSelectionShapeMode(target.dataset.selectionShapeMode, state.selectionShapeMode);
          if (next === state.selectionShapeMode) {
            return;
          }
          state.selectionShapeMode = next;
          syncSelectionShapeModeControls();
          scheduleUiStatePersist();
        });
      });
      syncSelectionShapeModeControls();
    }

    dom.controls.selectionOutline4Action?.addEventListener('click', () => {
      applySelectionOutline({ mode: '4' });
      updateCanvasControlButtons();
    });

    dom.controls.selectionOutline8Action?.addEventListener('click', () => {
      applySelectionOutline({ mode: '8' });
      updateCanvasControlButtons();
    });

    dom.controls.outlineSize?.addEventListener('input', event => {
      state.outlineSize = clamp(Math.round(Number(event.target.value)), 1, 8);
      if (dom.controls.outlineSizeValue) {
        dom.controls.outlineSizeValue.textContent = localizeText(`${state.outlineSize}マス`, `${state.outlineSize} cells`);
      }
      scheduleUiStatePersist();
    });

    dom.controls.toggleChecker?.addEventListener('change', event => {
      state.showChecker = Boolean(event.target.checked);
      dom.canvases.stack.classList.toggle('is-flat', !state.showChecker);
      scheduleUiStatePersist();
    });

    dom.controls.togglePixelPreview?.addEventListener('change', event => {
      state.showPixelGuides = Boolean(event.target.checked);
      requestOverlayRender();
      scheduleUiStatePersist();
    });

    dom.controls.toggleMirrorMode?.addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      setMirrorModeEnabled(Boolean(event.target.checked));
    });

    if (dom.controls.mirrorAxisVertical instanceof HTMLInputElement) {
      dom.controls.mirrorAxisVertical.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        setMirrorAxisEnabled(MIRROR_AXIS_VERTICAL, Boolean(event.target.checked));
      });
    }

    if (dom.controls.mirrorAxisHorizontal instanceof HTMLInputElement) {
      dom.controls.mirrorAxisHorizontal.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        setMirrorAxisEnabled(MIRROR_AXIS_HORIZONTAL, Boolean(event.target.checked));
      });
    }

    if (dom.controls.mirrorAxisDiagonalA instanceof HTMLInputElement) {
      dom.controls.mirrorAxisDiagonalA.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        setMirrorAxisEnabled(MIRROR_AXIS_DIAGONAL_A, Boolean(event.target.checked));
      });
    }

    if (dom.controls.mirrorAxisDiagonalB instanceof HTMLInputElement) {
      dom.controls.mirrorAxisDiagonalB.addEventListener('change', event => {
        if (!(event.target instanceof HTMLInputElement)) {
          return;
        }
        setMirrorAxisEnabled(MIRROR_AXIS_DIAGONAL_B, Boolean(event.target.checked));
      });
    }

    const handleVirtualCursorToggleInput = event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      setVirtualCursorEnabled(Boolean(event.target.checked));
    };
    dom.controls.toggleVirtualCursor?.addEventListener('change', handleVirtualCursorToggleInput);
    dom.controls.toggleVirtualCursor?.addEventListener('input', handleVirtualCursorToggleInput);
    const handleFloatingPreviewToggleInput = event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      setFloatingPreviewEnabled(Boolean(event.target.checked));
    };
    dom.controls.toggleFloatingPreview?.addEventListener('change', handleFloatingPreviewToggleInput);
    dom.controls.toggleFloatingPreview?.addEventListener('input', handleFloatingPreviewToggleInput);
    const handleCanvasResizeHandlesToggleInput = event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      state.showCanvasResizeHandles = Boolean(event.target.checked);
      if (!state.showCanvasResizeHandles && canvasResizeHandleState.active) {
        stopCanvasResizeHandleInteraction({ apply: false });
      }
      syncCanvasResizeHandleVisibility();
      updateCanvasResizeHandlePosition();
      scheduleSessionPersist({ includeSnapshots: false });
    };
    dom.controls.toggleCanvasResizeHandles?.addEventListener('change', handleCanvasResizeHandlesToggleInput);
    dom.controls.toggleCanvasResizeHandles?.addEventListener('input', handleCanvasResizeHandlesToggleInput);
    const handleVoxelExtensionToggleInput = event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      if (!canUseVoxelExtensionMode()) {
        event.target.checked = isVoxelExtensionModeEnabled();
        syncVoxelExtensionModeUi();
        return;
      }
      if (!canCurrentClientEditProjectStructure({ announce: true })) {
        event.target.checked = isVoxelExtensionModeEnabled();
        if (!isSharedProjectCollaborativeMode()) {
          announceMultiCanvasEditRestriction();
        }
        syncVoxelExtensionModeUi();
        return;
      }
      const changed = setVoxelExtensionModeEnabled(Boolean(event.target.checked), { announce: true });
      if (!changed) {
        event.target.checked = isVoxelExtensionModeEnabled();
      }
      syncControlsWithState();
    };
    dom.controls.toggleVoxelExtensionMode?.addEventListener('change', handleVoxelExtensionToggleInput);
    dom.controls.toggleVoxelExtensionMode?.addEventListener('input', handleVoxelExtensionToggleInput);
    const applyVoxelPreviewOrientation = (yawValue, pitchValue = voxelExtensionState.previewPitchDeg, { persistProject = false } = {}) => {
      const nextYawDeg = normalizeVoxelPreviewYawDegrees(yawValue);
      const nextPitchDeg = normalizeVoxelPreviewPitchDegrees(pitchValue);
      setVoxelPreviewOrientationForFrameIndex(state.activeFrame, nextYawDeg, nextPitchDeg);
      voxelExtensionState = normalizeVoxelExtensionState({
        ...voxelExtensionState,
        previewYawDeg: nextYawDeg,
        previewPitchDeg: nextPitchDeg,
      }, VOXEL_EXTENSION_DEFAULT_STATE);
      syncVoxelExtensionModeUi();
      if (isVoxelExtensionModeEnabled()) {
        renderVoxelExtensionPreviewSurfaceNow({ updateViewport: true });
        requestRender();
        requestOverlayRender();
      }
      scheduleSessionPersist();
      if (persistProject) {
        markAutosaveDirty();
        scheduleAutosaveSnapshot();
      }
    };
    const applyVoxelPreviewYaw = (value, options = {}) => {
      applyVoxelPreviewOrientation(value, voxelExtensionState.previewPitchDeg, options);
    };
    dom.controls.voxelPreviewYaw?.addEventListener('input', event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      applyVoxelPreviewYaw(event.target.value, { persistProject: false });
    });
    dom.controls.voxelPreviewYaw?.addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      applyVoxelPreviewYaw(event.target.value, { persistProject: true });
    });
    dom.controls.voxelDisplayPx?.addEventListener('input', event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      voxelExtensionState = normalizeVoxelExtensionState({
        ...voxelExtensionState,
        displayPx: event.target.value,
      }, VOXEL_EXTENSION_DEFAULT_STATE);
      syncVoxelExtensionPreviewFromSource({ updateViewport: true });
      requestRender();
      requestOverlayRender();
      scheduleSessionPersist();
    });
    dom.controls.voxelDisplayPx?.addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      voxelExtensionState = normalizeVoxelExtensionState({
        ...voxelExtensionState,
        displayPx: event.target.value,
      }, VOXEL_EXTENSION_DEFAULT_STATE);
      syncVoxelExtensionPreviewFromSource({ updateViewport: true });
      requestRender();
      requestOverlayRender();
      markAutosaveDirty();
      scheduleAutosaveSnapshot();
      scheduleSessionPersist();
    });

    if (dom.controls.virtualCursorButtonScale instanceof HTMLInputElement) {
      const slider = dom.controls.virtualCursorButtonScale;
      slider.min = String(FLOATING_DRAW_BUTTON_SCALE_MIN);
      slider.max = String(FLOATING_DRAW_BUTTON_SCALE_MAX);
      slider.step = String(FLOATING_DRAW_BUTTON_SCALE_STEP);
      slider.addEventListener('input', event => {
        setVirtualCursorButtonScale(event.target.value, { persist: false, updateControl: false });
        updateFloatingDrawButtonScaleControl();
      });
      slider.addEventListener('change', event => {
        setVirtualCursorButtonScale(event.target.value);
      });
    }

    dom.controls.exportProject?.addEventListener('click', () => {
      openExportDialog();
    });

    if (dom.controls.timelapseClear instanceof HTMLButtonElement) {
      dom.controls.timelapseClear.addEventListener('click', () => {
        clearTimelapseRecording();
      });
    }
    const handleTimelapseToggleInput = event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      setTimelapseEnabled(Boolean(event.target.checked));
    };
    dom.controls.toggleTimelapse?.addEventListener('change', handleTimelapseToggleInput);
    dom.controls.toggleTimelapse?.addEventListener('input', handleTimelapseToggleInput);
    if (dom.controls.toggleTimelapse instanceof HTMLInputElement) {
      dom.controls.toggleTimelapse.checked = Boolean(timelapseState.enabled);
    }
    if (dom.controls.timelapseFps instanceof HTMLInputElement) {
      dom.controls.timelapseFps.addEventListener('input', event => {
        timelapseState.fps = normalizeTimelapseFps(event.target.value);
        syncTimelapseControls();
      });
      dom.controls.timelapseFps.addEventListener('change', event => {
        timelapseState.fps = normalizeTimelapseFps(event.target.value);
        syncTimelapseControls();
        scheduleSessionPersist({ includeSnapshots: false });
      });
    }

    dom.controls.togglePixfindMode?.addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      const accepted = setPixfindModeEnabled(Boolean(event.target.checked));
      if (!accepted) {
        updatePixfindModeUI();
      }
    });

    dom.controls.openShortcutHelp?.addEventListener('click', () => {
      openShortcutHelpDialog();
    });
    dom.controls.openOperationHelpPanel?.addEventListener('click', () => {
      openOperationHelpPanel();
    });
    dom.controls.toggleLanguageMode?.addEventListener('click', () => {
      const nextLanguage = getNextUiLanguage();
      setUiLanguage(nextLanguage, { persist: true });
    });
    dom.controls.openUpdateHistory?.addEventListener('click', () => {
      openUpdateHistoryDialog();
    });
    if (document.body?.dataset.detailPanelDialogFallbackBound !== 'true') {
      document.body.dataset.detailPanelDialogFallbackBound = 'true';
      document.addEventListener('click', event => {
        const target = event.target instanceof Element ? event.target.closest('#openShortcutHelp, #openOperationHelpPanel, #openUpdateHistory') : null;
        if (!(target instanceof HTMLButtonElement) || target.disabled) {
          return;
        }
        if (target.id === 'openShortcutHelp') {
          openShortcutHelpDialog();
        } else if (target.id === 'openOperationHelpPanel') {
          openOperationHelpPanel();
        } else if (target.id === 'openUpdateHistory') {
          openUpdateHistoryDialog();
        }
      });
    }
    dom.controls.closeShortcutHelp?.addEventListener('click', () => {
      closeShortcutHelpDialog();
    });
    if (dom.shortcutHelp?.dialog instanceof HTMLDialogElement) {
      if (typeof dom.shortcutHelp.dialog.showModal === 'function') {
        dom.shortcutHelp.dialog.addEventListener('cancel', event => {
          event.preventDefault();
          closeShortcutHelpDialog();
        });
      } else {
        dom.controls.openShortcutHelp?.setAttribute('disabled', 'true');
      }
    }

    dom.controls.sendToPixfind?.addEventListener('click', () => {
      exportProjectToPixfind();
    });
    if (dom.newProject?.form) {
      dom.newProject.form.addEventListener('submit', event => {
        event.preventDefault();
        void handleNewProjectSubmit();
      });
    }
    if (dom.newProject?.cancel) {
      dom.newProject.cancel.addEventListener('click', () => {
        closeNewProjectDialog();
      });
    }
    if (dom.newProject?.dialog) {
      dom.newProject.dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeNewProjectDialog();
      });
    }
    if (Array.isArray(dom.newProject?.modeButtons)) {
      dom.newProject.modeButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement) || button.dataset.bound === 'true') {
          return;
        }
        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
          syncNewProjectCreateModeButtons(button.dataset.createMode || 'local');
        });
      });
    }
    setupGlobalHistoryConfirmDialog();

    if (dom.controls.applySpriteScale) {
      dom.controls.applySpriteScale.addEventListener('click', () => {
        applySettingsSizeChanges();
      });
    }
    if (dom.controls.spriteScaleInput) {
      dom.controls.spriteScaleInput.addEventListener('input', () => {
        updateSpriteScaleControlLimits();
      });
      dom.controls.spriteScaleInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applySettingsSizeChanges();
        }
      });
    }
    dom.controls.spriteScaleDecrement?.addEventListener('click', () => {
      adjustSpriteScaleInputBy(-1);
    });
    dom.controls.spriteScaleIncrement?.addEventListener('click', () => {
      adjustSpriteScaleInputBy(1);
    });

    const bindCanvasSizeInput = input => {
      if (!(input instanceof HTMLInputElement)) return;
      input.addEventListener('input', () => {
        updateCanvasResizeControls();
      });
      input.addEventListener('change', () => {
        updateCanvasResizeControls({ normalizeValues: true });
      });
      input.addEventListener('keydown', event => {
        const isComposing = event.isComposing || event.key === 'Process' || event.keyCode === 229;
        if (event.key === 'Enter' && !isComposing) {
          event.preventDefault();
          event.stopPropagation();
          handleCanvasResizeRequest({ restoreFocusInput: input });
        }
      });
    };
    bindCanvasSizeInput(dom.controls.canvasWidth);
    bindCanvasSizeInput(dom.controls.canvasHeight);
    dom.controls.canvasWidthDecrement?.addEventListener('click', () => {
      adjustCanvasResizeInputBy('width', -1);
    });
    dom.controls.canvasWidthIncrement?.addEventListener('click', () => {
      adjustCanvasResizeInputBy('width', 1);
    });
    dom.controls.canvasHeightDecrement?.addEventListener('click', () => {
      adjustCanvasResizeInputBy('height', -1);
    });
    dom.controls.canvasHeightIncrement?.addEventListener('click', () => {
      adjustCanvasResizeInputBy('height', 1);
    });
    dom.controls.applyCanvasResize?.addEventListener('click', () => {
      applySettingsSizeChanges();
    });

    dom.controls.clearCanvas?.addEventListener('click', () => {
      if (!canCurrentClientEditProjectStructure({ announce: true })) {
        if (!isSharedProjectCollaborativeMode()) {
          setMultiStatus(localizeText('参加/視聴モードではキャンバスクリアはマスターのみ操作できます', 'In participant/viewer mode, only the master can clear the canvas'), 'warn');
        }
        return;
      }
      if (!confirm(localizeText('すべてのフレームをクリアしますか？', 'Clear all frames?'))) {
        return;
      }
      beginHistory('clearCanvas');
      state.frames.forEach(frame => {
        frame.layers.forEach(layer => {
          layer.indices.fill(layer.indices instanceof Uint8Array ? 0 : -1);
          if (layer.direct instanceof Uint8ClampedArray) {
            layer.direct.fill(0);
            layer.direct = null;
          }
        });
      });
      markHistoryDirty();
      requestRender();
      requestOverlayRender();
      commitHistory();
      scheduleSessionPersist();
    });

    dom.controls.undoAction?.addEventListener('click', () => {
      void runHistoryActionWithGuard('undo');
    });
    dom.controls.redoAction?.addEventListener('click', () => {
      void runHistoryActionWithGuard('redo');
    });

    setupNumberSteppers();
    setupMultiModeControls();
    setPixfindHelpExpanded(false);
    syncControlsWithState();
    syncTimelapseControls();
    updateSpriteScaleControlLimits();
    updateCanvasResizeControls({ normalizeValues: true });
    applyEmbedGuardrails();
    applyUiLocalization();
  }

        return Object.freeze({
          isVirtualKeyboardLikelyOpen,
          updateRailMetrics,
          isCoarsePointerDevice,
          getVisibleMobileBottomAdHeight,
          updateAdaptiveMobileLayoutVars,
          updateLayoutMode,
          resolvePreferredMobileTab,
          applyLayoutMode,
          updateRailToggleVisibility,
          setVirtualCursorEnabled,
          isMirrorAxisKey,
          isMirrorEnabledForTool,
          isMirrorToolPopoverOpen,
          shouldDockMirrorToolPopover,
          getMirrorToolPopoverDockHost,
          syncMirrorToolPopoverMount,
          isMirrorPopoverPersistentTarget,
          getMirrorToolPopoverBottomBoundary,
          positionMirrorToolPopover,
          setMirrorToolPopoverOpen,
          toggleMirrorToolPopover,
          setMirrorModeEnabled,
          setMirrorAxisEnabled,
          setMirrorPivot,
          rescaleMirrorPivotForCanvas,
          translateMirrorPivotForCanvasResize,
          reflectPointByMirrorAxis,
          getMirroredPointSet,
          forEachMirroredPoint,
          getDiagonalEndpointsInRect,
          clearCanvasScreenMetricsCache,
          getCanvasScreenMetrics,
          setMirrorGuideLine,
          setMirrorHandlePosition,
          getMirrorGuideLineElement,
          getMirrorHandleElement,
          getMirrorAxisHandleLabel,
          updateMirrorGuideHandles,
          updateMirrorFromDragPosition,
          finishMirrorHandleDrag,
          shouldSuppressMirrorHandleClick,
          handleMirrorHandlePointerDown,
          handleMirrorHandlePointerMove,
          handleMirrorHandlePointerUp,
          setupMirrorGuides,
          setupMirrorGuideResizeObserver,
          setupMirrorToolPopover,
          setupControls,
        });
      }
    })(scope);
  }

  root.controlsMirror = {
    createMirrorStaticConfig,
    createControlsMirrorModule,
  };
})();
