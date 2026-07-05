(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createKeyboardWorkflowUtils(rawScope = {}) {
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
  function hasOpenBlockingDialog() {
    const dialogs = [
      dom.newProject?.dialog,
      dom.exportDialog?.dialog,
      dom.exportInterstitial?.dialog,
      dom.globalHistoryConfirm?.dialog,
      dom.shortcutHelp?.dialog,
      dom.updateHistory?.dialog,
      dom.toolSpotlight?.dialog,
    ];
    return dialogs.some(dialog => dialog instanceof HTMLDialogElement && dialog.open);
  }

  function resolveToolShortcut(event) {
    if (!event || event.isComposing || event.key === 'Process') {
      return null;
    }
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (!key || key.length !== 1) {
      return null;
    }
    if (key === 'r') {
      return event.shiftKey ? 'rectFill' : 'rect';
    }
    if (key === 'o') {
      return event.shiftKey ? 'ellipseFill' : 'ellipse';
    }
    if (key === 'b' && event.shiftKey) {
      return TOOL_SHORTCUT_CREATE_CUSTOM_BRUSH;
    }
    const mapped = TOOL_SHORTCUT_BINDINGS[key];
    if (!mapped) {
      return null;
    }
    if (mapped === TOOL_SHORTCUT_SHAPE_GROUP) {
      return getPreferredToolForGroup('shape') || DEFAULT_GROUP_TOOL.shape || 'line';
    }
    return mapped;
  }

  function handleToolShortcut(event) {
    if (!event || event.altKey || event.ctrlKey || event.metaKey || event.repeat) {
      return false;
    }
    if (pointerState.active || isEditableTarget(event.target)) {
      return false;
    }
    if (startupVisible || hasOpenBlockingDialog()) {
      return false;
    }
    const tool = resolveToolShortcut(event);
    if (!tool) {
      return false;
    }
    if (tool === TOOL_SHORTCUT_CREATE_CUSTOM_BRUSH) {
      keyboardState.customBrushGestureArmed = true;
      keyboardState.customBrushGestureUsed = false;
      keyboardState.customBrushCreateOnPointerUp = false;
      return true;
    }
    if (TOOL_ACTIONS.has(tool)) {
      runToolAction(tool);
    } else {
      setActiveTool(tool);
    }
    return true;
  }

  function handleFramePlaybackShortcut(event) {
    if (!event || event.altKey || event.ctrlKey || event.metaKey) {
      return false;
    }
    if (startupVisible || hasOpenBlockingDialog() || pointerState.active) {
      return false;
    }
    if (isEditableTarget(event.target)) {
      return false;
    }
    const code = typeof event.code === 'string' ? event.code : '';
    if (code === 'Comma' || code === 'Period') {
      if (state.playback.isPlaying) {
        stopPlayback();
      }
      const offset = code === 'Comma' ? -1 : 1;
      const previousFrame = state.activeFrame;
      setActiveFrameIndex(previousFrame + offset, { wrap: false, persist: true, render: true, syncUi: true });
      return state.activeFrame !== previousFrame;
    }
    if (event.repeat) {
      return false;
    }
    if (code === 'KeyN') {
      return addOrDuplicateFrameAfterActive({ duplicate: event.shiftKey });
    }
    if (code === 'KeyP' && !event.shiftKey) {
      return togglePlaybackFromShortcut();
    }
    return false;
  }

  function setupKeyboard() {
    document.addEventListener('keydown', event => {
      const target = event.target;
      const editable = isEditableTarget(target);
      const isPlainArrowKey = !event.metaKey && !event.ctrlKey && !event.altKey;
      const arrowDirection = isPlainArrowKey ? getDirectionFromArrowKey(event.key) : null;
      if (event.code === 'Space' && !editable && !event.metaKey && !event.ctrlKey && !event.altKey) {
        setSpacePanActive(true);
        event.preventDefault();
      }
      if (event.key === 'Escape') {
        if (startupVisible || hasOpenBlockingDialog()) {
          return;
        }
        if (hasPendingSelectionMove()) {
          cancelPendingSelectionMove();
        } else {
          clearSelection();
        }
        clearTimelineSelectionForCanvasInteraction();
        return;
      }
      if (
        !editable
        && !pointerState.active
        && arrowDirection
        && !startupVisible
        && !hasOpenBlockingDialog()
      ) {
        const step = event.shiftKey ? 4 : 1;
        let handled = false;
        if (shouldUseArrowKeysForSelectionMove()) {
          handled = nudgeSelectionByKeyboard(arrowDirection, { step, announce: true });
        }
        if (!handled && !state.playback.isPlaying) {
          handled = nudgeLayerFrameByKeyboard(arrowDirection, { step });
        }
        event.preventDefault();
        return;
      }
      if (state.playback.isPlaying) {
        return;
      }
      if (!editable && handleFramePlaybackShortcut(event)) {
        event.preventDefault();
        return;
      }
      if (!editable && handleToolShortcut(event)) {
        event.preventDefault();
        return;
      }
      const isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) {
        return;
      }
      if (editable) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        void runHistoryActionWithGuard('undo');
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        void runHistoryActionWithGuard('redo');
      } else if (key === 'c') {
        const success = performCopyAction();
        if (success) {
          event.preventDefault();
        }
      } else if (key === 'x') {
        const success = performCutAction();
        if (success) {
          event.preventDefault();
        }
      } else if (key === 'v') {
        const success = performPasteAction();
        if (success) {
          event.preventDefault();
        }
      }
    });
    document.addEventListener('keyup', event => {
      if (event.code === 'Space') {
        setSpacePanActive(false);
      }
      if (state.playback.isPlaying) {
        keyboardState.customBrushGestureArmed = false;
        keyboardState.customBrushGestureUsed = false;
        keyboardState.customBrushCreateOnPointerUp = false;
        return;
      }
      const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
      if (key === 'b' && keyboardState.customBrushGestureArmed) {
        const shouldCreate = !startupVisible
          && !hasOpenBlockingDialog()
          && !isEditableTarget(event.target);
        const gestureActive = pointerState.active && pointerState.tool === POINTER_TOOL_CUSTOM_BRUSH_RECT;
        keyboardState.customBrushGestureArmed = false;
        if (gestureActive) {
          keyboardState.customBrushCreateOnPointerUp = shouldCreate;
          return;
        }
        keyboardState.customBrushGestureUsed = false;
        keyboardState.customBrushCreateOnPointerUp = false;
        if (shouldCreate) {
          createCustomBrushFromSelection();
        }
      }
    });
    window.addEventListener('blur', () => {
      setSpacePanActive(false);
      keyboardState.customBrushGestureArmed = false;
      keyboardState.customBrushGestureUsed = false;
      keyboardState.customBrushCreateOnPointerUp = false;
    });
  }



  return Object.freeze({
    hasOpenBlockingDialog,
    resolveToolShortcut,
    handleToolShortcut,
    handleFramePlaybackShortcut,
    setupKeyboard,
  });
      }
    })(scope);
  }

  root.keyboardWorkflowUtils = Object.freeze({
    createKeyboardWorkflowUtils,
  });
})();
