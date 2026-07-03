(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasControlActionsWorkflowUtils(rawScope = {}) {
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
  function openMirrorSettingsPanel(options = {}) {
    const { sourceButton = null } = options;
    if (isMirrorToolPopoverOpen()) {
      setMirrorToolPopoverOpen(false);
    }

    const mobilePeekMode = isMobilePeekToolFlyoutMode();
    if ((isCompactToolRailMode() || mobilePeekMode) && isCompactToolFlyoutOpen()) {
      setCompactToolFlyoutOpen(false, { force: mobilePeekMode });
      updateToolVisibility();
    }

    if (layoutMode === 'mobilePortrait') {
      activateMobileTab('settings', { ensureDrawer: true });
      return;
    }

    setRightTab('settings');
    if (isCompactRightRailMode()) {
      setRailWidth('right', getRailExpandedToggleWidth('right'), { persist: true });
      setCompactRightFlyoutOpen(false);
      updateRightTabVisibility();
    }

    const mirrorAnchor = dom.controls.mirrorAxisOptions instanceof HTMLElement
      ? dom.controls.mirrorAxisOptions
      : (dom.controls.toggleMirrorMode instanceof HTMLElement ? dom.controls.toggleMirrorMode : null);
    if (mirrorAnchor instanceof HTMLElement) {
      requestAnimationFrame(() => {
        mirrorAnchor.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    }

    if (sourceButton instanceof HTMLElement) {
      sourceButton.blur?.();
    }
  }

  function updateCanvasControlButtons() {
    const primary = dom.controls.canvasControlPrimary;
    const secondary = dom.controls.canvasControlSecondary;
    if (!primary || !secondary) {
      return;
    }
    const moveState = pointerState.selectionMove;
    const movePending = Boolean(moveState && moveState.hasCleared);
    const hasSelection = selectionMaskHasPixels(state.selectionMask);
    const hasClipboard = Boolean(internalClipboard.selection);
    const isSelectionToolActive = TOOL_TO_GROUP[state.tool] === 'selection';
    const disableOutline = (
      !hasSelection
      || state.playback.isPlaying
      || !getActiveLayer()
      || isMultiSpectatorMode()
    );
    if (dom.controls.selectionOutline4Action instanceof HTMLButtonElement) {
      dom.controls.selectionOutline4Action.disabled = disableOutline;
    }
    if (dom.controls.selectionOutline8Action instanceof HTMLButtonElement) {
      dom.controls.selectionOutline8Action.disabled = disableOutline;
    }
    const isMobilePortraitLayout = layoutMode === 'mobilePortrait';
    const nextMode = movePending
      ? 'selectionMove'
      : ((hasSelection || hasClipboard) ? 'clipboard' : 'zoom');
    const isZoomMode = nextMode === 'zoom';
    if (canvasControlMode !== nextMode) {
      canvasControlMode = nextMode;
      if (dom.controls.canvasControlButtons) {
        const label = nextMode === 'selectionMove'
          ? '選択範囲の確定操作'
          : (nextMode === 'clipboard' ? 'コピーと貼り付け' : 'ズーム');
        dom.controls.canvasControlButtons.setAttribute('aria-label', label);
      }
      if (nextMode === 'selectionMove') {
        primary.replaceChildren(document.createTextNode('取消'));
        primary.dataset.action = 'cancelSelectionMove';
        primary.setAttribute('aria-label', '選択移動を取り消す');
        secondary.replaceChildren(document.createTextNode('確定'));
        secondary.dataset.action = 'confirmSelectionMove';
        secondary.setAttribute('aria-label', '選択移動を確定する');
      } else if (nextMode === 'clipboard') {
        primary.replaceChildren(document.createTextNode('C'));
        primary.dataset.action = 'copy';
        primary.setAttribute('aria-label', 'コピー');
        secondary.replaceChildren(document.createTextNode('P'));
        secondary.dataset.action = 'paste';
        secondary.setAttribute('aria-label', '貼り付け');
      } else {
        primary.replaceChildren(makeIcon('zoomdown', '−'));
        primary.dataset.action = 'zoomOut';
        primary.setAttribute('aria-label', 'ズームアウト');
        secondary.replaceChildren(makeIcon('zoomup', '＋'));
        secondary.dataset.action = 'zoomIn';
        secondary.setAttribute('aria-label', 'ズームイン');
      }
    }
    if (dom.controls.canvasControlButtons instanceof HTMLElement) {
      dom.controls.canvasControlButtons.classList.toggle('is-clipboard-mode', !isZoomMode);
      const showFloatingSelectionActions = isMobilePortraitLayout
        ? (canvasControlMode === 'selectionMove')
        : (
          isSelectionToolActive
          && (canvasControlMode === 'clipboard' || canvasControlMode === 'selectionMove')
        );
      dom.controls.canvasControlButtons.classList.toggle(
        'is-mobile-selection-actions-visible',
        showFloatingSelectionActions
      );
      if (layoutMode === 'mobilePortrait') {
        dom.controls.canvasControlButtons.dataset.drawerMode = normalizeMobileDrawerMode(mobileDrawerState.mode);
      } else {
        delete dom.controls.canvasControlButtons.dataset.drawerMode;
      }
      dom.controls.canvasControlButtons.setAttribute(
        'aria-hidden',
        String(!showFloatingSelectionActions)
      );
    }
    const showClipboardCopyCut = isSelectionToolActive && hasSelection;
    const showClipboardPaste = hasClipboard;
    const canUseClipboardStrip = showClipboardCopyCut || showClipboardPaste;
    if (dom.controls.canvasClipboardButtons instanceof HTMLElement) {
      dom.controls.canvasClipboardButtons.classList.toggle('is-visible', canUseClipboardStrip);
      dom.controls.canvasClipboardButtons.setAttribute('aria-hidden', String(!canUseClipboardStrip));
    }
    if (dom.controls.canvasClipboardCopy instanceof HTMLButtonElement) {
      dom.controls.canvasClipboardCopy.hidden = !showClipboardCopyCut;
      dom.controls.canvasClipboardCopy.disabled = !showClipboardCopyCut;
    }
    if (dom.controls.canvasClipboardPaste instanceof HTMLButtonElement) {
      dom.controls.canvasClipboardPaste.hidden = !showClipboardPaste;
      dom.controls.canvasClipboardPaste.disabled = !showClipboardPaste;
    }
    if (dom.controls.canvasClipboardCut instanceof HTMLButtonElement) {
      dom.controls.canvasClipboardCut.hidden = !showClipboardCopyCut;
      dom.controls.canvasClipboardCut.disabled = !showClipboardCopyCut;
    }
    if (dom.controls.zoomInput instanceof HTMLInputElement) {
      dom.controls.zoomInput.disabled = !isZoomMode;
    }
    if (canvasControlMode === 'selectionMove') {
      primary.disabled = false;
      secondary.disabled = false;
    } else if (canvasControlMode === 'clipboard') {
      primary.disabled = !hasSelection;
      secondary.disabled = !hasClipboard;
    } else {
      primary.disabled = false;
      secondary.disabled = false;
    }
    syncBrushControls({ hasSelection });
    updateFloatingMovePadVisibilityIfReady();
  }



  return Object.freeze({
    openMirrorSettingsPanel,
    updateCanvasControlButtons,
  });
      }
    })(scope);
  }

  root.canvasControlActionsWorkflowUtils = Object.freeze({
    createCanvasControlActionsWorkflowUtils,
  });
})();
