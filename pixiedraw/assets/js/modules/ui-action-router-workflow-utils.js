(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createUiActionRouterWorkflowUtils(rawScope = {}) {
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
  function runToolAction(tool, options = {}) {
    if (tool === TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE) {
      setVirtualCursorEnabled(!state.showVirtualCursor);
      updateVirtualCursorActionToolButtons();
      return true;
    }
    if (tool === TOOL_ACTION_MIRROR_POPUP) {
      setMirrorModeEnabled(!getNormalizedMirrorState().enabled);
      return true;
    }
    if (tool === TOOL_ACTION_CAMERA_MODE) {
      void launchLensCameraMode();
      return true;
    }
    if (tool === TOOL_ACTION_FLOATING_PREVIEW_TOGGLE) {
      if (isVoxelExtensionModeEnabled()) {
        updateFloatingPreviewActionToolButtons();
        return true;
      }
      setFloatingPreviewEnabled(!Boolean(state.floatingPreview?.enabled));
      updateFloatingPreviewActionToolButtons();
      return true;
    }
    
    return false;
  }

  function runUiAction(action, options = {}) {
    if (action === TOP_UI_ACTION_MIRROR_POPUP) {
      return runToolAction(TOOL_ACTION_MIRROR_POPUP, options);
    }
    if (action === TOP_UI_ACTION_VIRTUAL_CURSOR_TOGGLE) {
      return runToolAction(TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE, options);
    }
    if (action === TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE) {
      return runToolAction(TOOL_ACTION_FLOATING_PREVIEW_TOGGLE, options);
    }
    if (action === TOP_UI_ACTION_OPEN_LENS_CAMERA) {
      return runToolAction(TOOL_ACTION_CAMERA_MODE, options);
    }
    if (action === TOP_UI_ACTION_OPEN_QR_EDITOR) {
      void launchQrEditorMode();
      return true;
    }
    if (action === TOP_UI_ACTION_OPEN_DETAILS_PANEL) {
      if (layoutMode === 'mobilePortrait') {
        return activateMobileTab('details', { ensureDrawer: true });
      }
      setRightTab('details');
      if (isDesktopRightToolRailMode()) {
        setCompactRightFlyoutOpen(true);
        updateRightTabVisibility();
        setRightUtilityMenuOpen(false);
      }
      return true;
    }
    return false;
  }



  return Object.freeze({
    runToolAction,
    runUiAction,
  });
      }
    })(scope);
  }

  root.uiActionRouterWorkflowUtils = Object.freeze({
    createUiActionRouterWorkflowUtils,
  });
})();
