(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createFloatingDrawControlsUtils(rawScope = {}) {
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
  function clearFloatingMovePadRepeatTimers() {
    if (floatingMovePadState.repeatDelayId !== null) {
      window.clearTimeout(floatingMovePadState.repeatDelayId);
      floatingMovePadState.repeatDelayId = null;
    }
    if (floatingMovePadState.repeatIntervalId !== null) {
      window.clearInterval(floatingMovePadState.repeatIntervalId);
      floatingMovePadState.repeatIntervalId = null;
    }
  }

  function teardownFloatingMovePadPointerHandlers() {
    window.removeEventListener('pointerup', handleFloatingMovePadPointerUp);
    window.removeEventListener('pointercancel', handleFloatingMovePadPointerCancel);
  }

  function stopFloatingMovePadInteraction({ commit = false } = {}) {
    clearFloatingMovePadRepeatTimers();
    teardownFloatingMovePadPointerHandlers();
    const activeButton = floatingMovePadState.button;
    const activePointerId = floatingMovePadState.pointerId;
    if (activeButton instanceof HTMLButtonElement) {
      activeButton.classList.remove('is-active');
      if (Number.isFinite(activePointerId)) {
        try {
          activeButton.releasePointerCapture?.(activePointerId);
        } catch (error) {
          // ignore release errors
        }
      }
    }
    const shouldCommit = commit && floatingMovePadState.moved && Boolean(pointerState.selectionMove);
    floatingMovePadState.pointerId = null;
    floatingMovePadState.direction = null;
    floatingMovePadState.button = null;
    floatingMovePadState.moved = false;
    if (shouldCommit) {
      finalizeSelectionMove();
    }
  }

  function shouldShowFloatingMovePad() {
    return false;
  }

  function updateFloatingMovePadPosition() {
    const pad = dom.floatingMovePad;
    const drawButton = dom.floatingDrawButton;
    if (!(pad instanceof HTMLElement) || !(drawButton instanceof HTMLElement) || !floatingDrawButtonState.initialized) {
      return;
    }
    let scale = floatingDrawButtonState.scale;
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = refreshFloatingDrawButtonScale(drawButton);
    }
    const viewportBounds = getViewportBounds();
    const safeArea = getSafeAreaInsets();
    const margin = 8;
    const drawWidth = drawButton.offsetWidth || drawButton.clientWidth || 0;
    const drawHeight = drawButton.offsetHeight || drawButton.clientHeight || 0;
    const centerWidth = Math.max(1, Math.round(drawWidth));
    const centerHeight = Math.max(1, Math.round(drawHeight));
    pad.style.setProperty('--floating-move-pad-center-width', `${centerWidth}px`);
    pad.style.setProperty('--floating-move-pad-center-height', `${centerHeight}px`);
    const padWidth = pad.offsetWidth || pad.clientWidth || 0;
    const padHeight = pad.offsetHeight || pad.clientHeight || 0;
    const drawLeft = floatingDrawButtonState.position.x;
    const drawTop = floatingDrawButtonState.position.y;
    const scaledDrawWidth = drawWidth * scale;
    const scaledDrawHeight = drawHeight * scale;
    const scaledPadWidth = padWidth * scale;
    const scaledPadHeight = padHeight * scale;
    const drawCenterX = drawLeft + Math.round(scaledDrawWidth * 0.5);
    const drawCenterY = drawTop + Math.round(scaledDrawHeight * 0.5);
    let nextX = drawCenterX - Math.round(scaledPadWidth * 0.5);
    let nextY = drawCenterY - Math.round(scaledPadHeight * 0.5);

    const minX = Math.round(viewportBounds.left + safeArea.left + margin);
    const minY = Math.round(viewportBounds.top + safeArea.top + margin);
    const maxX = Math.max(minX, Math.round(viewportBounds.right - safeArea.right - scaledPadWidth - margin));
    const maxY = Math.max(minY, Math.round(viewportBounds.bottom - safeArea.bottom - scaledPadHeight - margin));
    nextX = clamp(Math.round(nextX), minX, maxX);
    nextY = clamp(Math.round(nextY), minY, maxY);
    pad.style.setProperty('--floating-move-pad-x', `${nextX}px`);
    pad.style.setProperty('--floating-move-pad-y', `${nextY}px`);
  }

  function updateFloatingMovePadVisibility() {
    const pad = dom.floatingMovePad;
    if (!(pad instanceof HTMLElement)) {
      return;
    }
    const visible = shouldShowFloatingMovePad();
    if (!visible) {
      stopFloatingMovePadInteraction({ commit: true });
      pad.classList.add('is-hidden');
      pad.setAttribute('hidden', '');
      pad.setAttribute('aria-hidden', 'true');
      return;
    }
    pad.classList.remove('is-hidden');
    pad.removeAttribute('hidden');
    pad.setAttribute('aria-hidden', 'false');
    updateFloatingMovePadPosition();
    window.requestAnimationFrame(() => {
      updateFloatingMovePadPosition();
    });
  }

  function getFloatingMovePadDelta(direction) {
    switch (direction) {
      case 'up':
        return { dx: 0, dy: -1 };
      case 'down':
        return { dx: 0, dy: 1 };
      case 'left':
        return { dx: -1, dy: 0 };
      case 'right':
        return { dx: 1, dy: 0 };
      default:
        return null;
    }
  }

  function getDirectionFromArrowKey(key) {
    switch (key) {
      case 'ArrowUp':
        return 'up';
      case 'ArrowDown':
        return 'down';
      case 'ArrowLeft':
        return 'left';
      case 'ArrowRight':
        return 'right';
      default:
        return null;
    }
  }

  function getKeyboardSelectionAnchorCell() {
    return {
      x: clamp(Math.round(Number(state.selectionBounds?.x0) || 0), 0, Math.max(0, state.width - 1)),
      y: clamp(Math.round(Number(state.selectionBounds?.y0) || 0), 0, Math.max(0, state.height - 1)),
    };
  }

  function nudgeSelectionByKeyboard(direction, { announce = true, step = 1 } = {}) {
    const delta = getFloatingMovePadDelta(direction);
    if (!delta) {
      return false;
    }
    if (state.playback.isPlaying) {
      return false;
    }
    if (!selectionMaskHasPixels(state.selectionMask)) {
      return false;
    }
    if (isMultiSpectatorMode()) {
      if (announce) {
        setMultiStatus(localizeText('視聴モードでは描画できません', 'Drawing is disabled in viewer mode'), 'warn');
      }
      return false;
    }
    if (isMultiAssignedCellRestrictedEditorMode() && !enforceGuestAssignedLayerSelection({ announce })) {
      return false;
    }

    const moveStep = clamp(Math.round(Number(step) || 1), 1, 32);
    if (!pointerState.selectionMove) {
      const cursorCell = getVirtualCursorCellPosition() || getKeyboardSelectionAnchorCell();
      const started = beginSelectionMoveFromVirtualCursor(
        cursorCell,
        { reuseOffset: Boolean(state.pendingPasteMoveState) }
      );
      if (!started) {
        if (announce) {
          updateAutosaveStatus(localizeText('選択範囲の移動を開始できませんでした', 'Failed to start selection move'), 'warn');
        }
        return false;
      }
    }

    const moveState = pointerState.selectionMove;
    if (!moveState) {
      return false;
    }
    pointerState.tool = 'selectionMove';
    const start = pointerState.start || getKeyboardSelectionAnchorCell();
    const offsetX = Number(moveState.offset?.x) || 0;
    const offsetY = Number(moveState.offset?.y) || 0;
    const nextPosition = {
      x: start.x + offsetX + (delta.dx * moveStep),
      y: start.y + offsetY + (delta.dy * moveStep),
    };
    handleSelectionMoveDrag(nextPosition);
    pointerState.current = nextPosition;
    pointerState.last = nextPosition;
    // Keep keyboard nudge behavior consistent with drag/move-pad:
    // do not auto-finalize on every arrow step, so out-of-canvas detours
    // can return without destructive clipping.
    updateCanvasControlButtons();
    return true;
  }

  function shouldUseArrowKeysForSelectionMove() {
    if (!selectionMaskHasPixels(state.selectionMask)) {
      return false;
    }
    if (hasPendingSelectionMove() || pointerState.selectionMove) {
      return true;
    }
    const activeTool = getActiveTool();
    return activeTool === 'selectRect'
      || activeTool === 'selectLasso'
      || activeTool === 'selectSame'
      || activeTool === 'selectionMove'
      || activeTool === 'selectionTransform';
  }

  function nudgeLayerFrameByKeyboard(direction, { step = 1 } = {}) {
    if (state.playback.isPlaying) {
      return false;
    }
    const moveStep = clamp(Math.round(Number(step) || 1), 1, 32);
    if (direction === 'left' || direction === 'right') {
      const previousFrame = state.activeFrame;
      const offset = direction === 'left' ? -moveStep : moveStep;
      setActiveFrameIndex(previousFrame + offset, { wrap: false, persist: true, render: true, syncUi: true });
      return state.activeFrame !== previousFrame;
    }
    if (direction === 'up' || direction === 'down') {
      const previousLayer = state.activeLayer;
      const offset = direction === 'up' ? moveStep : -moveStep;
      stepActiveLayerTrack(offset, { persist: true, render: true, syncUi: true });
      return state.activeLayer !== previousLayer;
    }
    return false;
  }

  function nudgeSelectionByVirtualMovePad(direction, { announce = true } = {}) {
    const delta = getFloatingMovePadDelta(direction);
    if (!delta) {
      return false;
    }
    if (!state.showVirtualCursor || state.playback.isPlaying) {
      return false;
    }
    if (!selectionMaskHasPixels(state.selectionMask)) {
      return false;
    }
    if (isMultiSpectatorMode()) {
      if (announce) {
        setMultiStatus(localizeText('視聴モードでは描画できません', 'Drawing is disabled in viewer mode'), 'warn');
      }
      return false;
    }
    if (isMultiAssignedCellRestrictedEditorMode() && !enforceGuestAssignedLayerSelection({ announce })) {
      return false;
    }

    if (!pointerState.selectionMove) {
      const cursorCell = getVirtualCursorCellPosition() || {
        x: clamp(Math.round(Number(state.selectionBounds?.x0) || 0), 0, Math.max(0, state.width - 1)),
        y: clamp(Math.round(Number(state.selectionBounds?.y0) || 0), 0, Math.max(0, state.height - 1)),
      };
      const started = beginSelectionMoveFromVirtualCursor(
        cursorCell,
        { reuseOffset: Boolean(state.pendingPasteMoveState) }
      );
      if (!started) {
        if (announce) {
          updateAutosaveStatus(localizeText('選択範囲の移動を開始できませんでした', 'Failed to start selection move'), 'warn');
        }
        return false;
      }
    }

    const moveState = pointerState.selectionMove;
    if (!moveState) {
      return false;
    }
    pointerState.tool = 'selectionMove';
    const start = pointerState.start || getVirtualCursorCellPosition() || { x: 0, y: 0 };
    const offsetX = Number(moveState.offset?.x) || 0;
    const offsetY = Number(moveState.offset?.y) || 0;
    const nextPosition = {
      x: start.x + offsetX + delta.dx,
      y: start.y + offsetY + delta.dy,
    };
    handleSelectionMoveDrag(nextPosition);
    pointerState.current = nextPosition;
    pointerState.last = nextPosition;
    updateCanvasControlButtons();
    return true;
  }

  function startFloatingMovePadRepeat(direction) {
    clearFloatingMovePadRepeatTimers();
    floatingMovePadState.repeatDelayId = window.setTimeout(() => {
      floatingMovePadState.repeatDelayId = null;
      floatingMovePadState.repeatIntervalId = window.setInterval(() => {
        const moved = nudgeSelectionByVirtualMovePad(direction, { announce: false });
        if (!moved) {
          stopFloatingMovePadInteraction({ commit: true });
        } else {
          floatingMovePadState.moved = true;
        }
      }, MOVE_PAD_REPEAT_INTERVAL_MS);
    }, MOVE_PAD_REPEAT_DELAY_MS);
  }

  function handleFloatingMovePadPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    if (floatingMovePadState.pointerId !== null) {
      return;
    }
    const target = event.currentTarget;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }
    const direction = typeof target.dataset.movePadDir === 'string' ? target.dataset.movePadDir : '';
    if (!direction) {
      return;
    }
    event.preventDefault();
    floatingMovePadState.pointerId = event.pointerId ?? -1;
    floatingMovePadState.direction = direction;
    floatingMovePadState.button = target;
    floatingMovePadState.moved = false;
    target.classList.add('is-active');
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // ignore capture errors
    }
    const moved = nudgeSelectionByVirtualMovePad(direction, { announce: true });
    floatingMovePadState.moved = moved;
    if (moved) {
      startFloatingMovePadRepeat(direction);
    }
    window.addEventListener('pointerup', handleFloatingMovePadPointerUp);
    window.addEventListener('pointercancel', handleFloatingMovePadPointerCancel);
  }

  function handleFloatingMovePadPointerUp(event) {
    if (floatingMovePadState.pointerId !== event.pointerId) {
      return;
    }
    stopFloatingMovePadInteraction({ commit: true });
  }

  function handleFloatingMovePadPointerCancel(event) {
    if (floatingMovePadState.pointerId !== event.pointerId) {
      return;
    }
    stopFloatingMovePadInteraction({ commit: true });
  }

  function setupFloatingMovePad() {
    const pad = dom.floatingMovePad;
    if (!(pad instanceof HTMLElement)) {
      return;
    }
    pad.style.setProperty(
      '--floating-move-pad-scale',
      String(state.virtualCursorButtonScale || DEFAULT_FLOATING_DRAW_BUTTON_SCALE)
    );
    if (Array.isArray(dom.floatingMovePadButtons)) {
      dom.floatingMovePadButtons.forEach(button => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        button.addEventListener('pointerdown', handleFloatingMovePadPointerDown);
        button.addEventListener('click', event => event.preventDefault());
      });
    }
    updateFloatingMovePadVisibility();
  }

  return Object.freeze({
    clearFloatingMovePadRepeatTimers,
    teardownFloatingMovePadPointerHandlers,
    stopFloatingMovePadInteraction,
    shouldShowFloatingMovePad,
    updateFloatingMovePadPosition,
    updateFloatingMovePadVisibility,
    getFloatingMovePadDelta,
    getDirectionFromArrowKey,
    getKeyboardSelectionAnchorCell,
    nudgeSelectionByKeyboard,
    shouldUseArrowKeysForSelectionMove,
    nudgeLayerFrameByKeyboard,
    nudgeSelectionByVirtualMovePad,
    startFloatingMovePadRepeat,
    handleFloatingMovePadPointerDown,
    handleFloatingMovePadPointerUp,
    handleFloatingMovePadPointerCancel,
    setupFloatingMovePad,
  });
      }
    })(scope);
  }

  root.floatingDrawControlsUtils = Object.freeze({
    createFloatingDrawControlsUtils,
  });
})();
