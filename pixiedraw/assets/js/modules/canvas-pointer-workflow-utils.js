(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasPointerWorkflowUtils(rawScope = {}) {
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
  const viewportGestureArbiter = window.PiXiEEDrawModules?.viewportGestureArbiterUtils || {};
  const GestureMode = viewportGestureArbiter.GestureMode || Object.freeze({
    IDLE: 'idle',
    TOUCH_UNDECIDED: 'touch-undecided',
    TOUCH_PAN: 'touch-pan',
    TOUCH_ZOOM: 'touch-zoom',
    CANCELLED_UNTIL_ALL_UP: 'cancelled-until-all-up',
  });
  const VIEWPORT_GESTURE_CONFIG = viewportGestureArbiter.VIEWPORT_GESTURE_CONFIG || {};

  function detachPointerListeners() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }

  function clearPendingCanvasSwitchPointer({ detachListeners: shouldDetachListeners = false } = {}) {
    if (!pointerState.pendingCanvasSwitch) {
      return;
    }
    pointerState.pendingCanvasSwitch = null;
    if (!pointerState.active) {
      pointerState.surface = null;
      pointerState.selectionExtendOnDown = false;
    }
    if (shouldDetachListeners && !pointerState.active) {
      detachPointerListeners();
    }
  }

  function resetPointerState({ commitHistory: shouldCommit = false } = {}) {
    resetExclusiveTouchGesture();
    if (pointerState.pointerId !== null) {
      const captureTarget = pointerState.panCaptureElement || pointerState.surface?.drawing || dom.canvases.drawing;
      if (captureTarget && typeof captureTarget.releasePointerCapture === 'function') {
        try {
          captureTarget.releasePointerCapture(pointerState.pointerId);
        } catch (error) {
          // Ignore release failures when capture is not set.
        }
      }
    }
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.pendingCanvasSwitch = null;
    pointerState.surface = null;
    pointerState.tool = null;
    pointerState.start = null;
    pointerState.current = null;
    pointerState.last = null;
    pointerState.path = [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.drawPaletteIndex = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionRestartedOnDown = false;
    pointerState.selectionExtendOnDown = false;
    pointerState.startClient = null;
    pointerState.voxelPreviewYawStart = null;
    pointerState.voxelPreviewDragWidth = null;
    pointerState.voxelPreviewPitchStart = null;
    pointerState.voxelPreviewDragHeight = null;
    pointerState.voxelPreviewYawChanged = false;
    pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
    pointerState.panMode = null;
    pointerState.touchPanStart = null;
    pointerState.touchPinchStartDistance = null;
    pointerState.touchPinchStartScale = null;
    pointerState.touchPinchFocus = null;
    pointerState.touchGestureMode = null;
    pointerState.touchGestureStartPointers = null;
    pointerState.curveHandle = null;
    pointerState.panCaptureElement = null;
    document.body.classList.remove('is-pan-dragging');
    if (shouldCommit) {
      commitHistory();
    }
    requestOverlayRender();
  }

  function resetPointerStateForVirtualCursor() {
    resetExclusiveTouchGesture();
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.pendingCanvasSwitch = null;
    pointerState.surface = null;
    pointerState.tool = null;
    pointerState.start = null;
    pointerState.current = null;
    pointerState.last = null;
    pointerState.path = [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.drawPaletteIndex = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionExtendOnDown = false;
    pointerState.startClient = null;
    pointerState.voxelPreviewYawStart = null;
    pointerState.voxelPreviewDragWidth = null;
    pointerState.voxelPreviewPitchStart = null;
    pointerState.voxelPreviewDragHeight = null;
    pointerState.voxelPreviewYawChanged = false;
    pointerState.panMode = null;
    pointerState.touchPanStart = null;
    pointerState.touchPinchStartDistance = null;
    pointerState.touchPinchStartScale = null;
    pointerState.touchPinchFocus = null;
    pointerState.touchGestureMode = null;
    pointerState.touchGestureStartPointers = null;
    pointerState.curveHandle = null;
    pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
    pointerState.panCaptureElement = null;
    document.body.classList.remove('is-pan-dragging');
  }

  function abortActivePointerInteraction({ commitHistory: shouldCommit = true } = {}) {
    if (!pointerState.active) {
      return;
    }
    if (pointerState.tool === 'selectionTransform') {
      completeSelectionTransformInteraction(null, { cancel: true });
      return;
    }
    if (pointerState.tool === 'selectionMove' || pointerState.tool === 'layerMove') {
      finalizeSelectionMove();
    }
    detachPointerListeners();
    resetPointerState({ commitHistory: shouldCommit });
  }

  function updateTouchPointer(event) {
    if (event.pointerType !== 'touch') {
      return;
    }
    activeTouchPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function hasActiveMultiTouch() {
    return activeTouchPointers.size >= TOUCH_PAN_MIN_POINTERS;
  }

  function shouldDeferInactiveCanvasPointerDown(event, requestedCanvasId = '', activeCanvasId = '') {
    if (state.showVirtualCursor) {
      return false;
    }
    if (isVoxelPreviewCanvasId(requestedCanvasId)) {
      return false;
    }
    if (!requestedCanvasId || requestedCanvasId === activeCanvasId) {
      return false;
    }
    if (event.pointerType === 'mouse') {
      const button = Number.isFinite(event.button) ? event.button : 0;
      return button === 0 || button === 2;
    }
    return true;
  }

  function canBeginPendingCanvasSwitchDrag(tool) {
    return Boolean(
      keyboardState.customBrushGestureArmed
      || tool === 'pan'
      || tool === 'move'
      || tool === 'selectRect'
      || tool === 'selectLasso'
      || HISTORY_DRAW_TOOLS.has(tool)
    );
  }

  function resolvePendingCanvasSwitchSurface(pendingState) {
    if (!pendingState || typeof pendingState !== 'object') {
      return null;
    }
    const canvasId = typeof pendingState.canvasDocId === 'string' ? pendingState.canvasDocId : '';
    return getProjectCanvasSurfaceByCanvasId(canvasId)
      || getResolvedCanvasInteractionSurface(pendingState.surface || pendingState.target || null);
  }

  function beginPendingCanvasSwitchDrag(event) {
    const pendingState = pointerState.pendingCanvasSwitch;
    if (!pendingState || pendingState.pointerId !== event.pointerId || !pendingState.canDragStart) {
      return false;
    }
    const dx = event.clientX - pendingState.startClient.x;
    const dy = event.clientY - pendingState.startClient.y;
    if (Math.hypot(dx, dy) < INACTIVE_CANVAS_SWITCH_DRAG_THRESHOLD_PX) {
      return false;
    }
    const interactionSurface = resolvePendingCanvasSwitchSurface(pendingState);
    const targetElement = interactionSurface?.drawing || pendingState.target || null;
    clearPendingCanvasSwitchPointer();
    handlePointerDown({
      target: targetElement,
      pointerId: pendingState.pointerId,
      pointerType: pendingState.pointerType,
      button: pendingState.button,
      shiftKey: pendingState.shiftKey,
      clientX: pendingState.startClient.x,
      clientY: pendingState.startClient.y,
      preventDefault() {},
    });
    if (!pointerState.active || pointerState.pointerId !== event.pointerId) {
      if (!pointerState.active) {
        detachPointerListeners();
      }
      return false;
    }
    return true;
  }

  function removeTouchPointer(event) {
    if (event.pointerType !== 'touch') {
      return;
    }
    activeTouchPointers.delete(event.pointerId);
  }

  function getTouchCentroid() {
    if (!activeTouchPointers.size) {
      return null;
    }
    let sumX = 0;
    let sumY = 0;
    activeTouchPointers.forEach(point => {
      sumX += point.x;
      sumY += point.y;
    });
    const count = activeTouchPointers.size;
    return { x: sumX / count, y: sumY / count };
  }

  function getTouchPointerDistance() {
    if (activeTouchPointers.size < 2) {
      return null;
    }
    const points = Array.from(activeTouchPointers.values());
    const first = points[0];
    const second = points[1];
    if (!first || !second) {
      return null;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function getLockedTouchGestureMetrics() {
    const ids = Array.isArray(pointerState.touchGesturePointerIds)
      ? pointerState.touchGesturePointerIds
      : [];
    if (ids.length !== 2) return null;
    const pointA = activeTouchPointers.get(ids[0]);
    const pointB = activeTouchPointers.get(ids[1]);
    return viewportGestureArbiter.getTwoPointMetrics?.(pointA, pointB) || null;
  }

  function captureTouchGestureStartPointers() {
    if (activeTouchPointers.size < TOUCH_PAN_MIN_POINTERS) {
      return null;
    }
    return Array.from(activeTouchPointers.entries())
      .slice(0, 2)
      .map(([id, point]) => ({
        id,
        x: Number(point?.x) || 0,
        y: Number(point?.y) || 0,
      }));
  }

  function getTouchGestureMovementAnalysis() {
    const startPointers = Array.isArray(pointerState.touchGestureStartPointers)
      ? pointerState.touchGestureStartPointers
      : null;
    if (!startPointers || startPointers.length < 2) {
      return null;
    }
    const firstStart = startPointers[0];
    const secondStart = startPointers[1];
    const firstCurrent = activeTouchPointers.get(firstStart.id);
    const secondCurrent = activeTouchPointers.get(secondStart.id);
    if (!firstCurrent || !secondCurrent) {
      return null;
    }
    const firstVector = {
      x: (Number(firstCurrent.x) || 0) - (Number(firstStart.x) || 0),
      y: (Number(firstCurrent.y) || 0) - (Number(firstStart.y) || 0),
    };
    const secondVector = {
      x: (Number(secondCurrent.x) || 0) - (Number(secondStart.x) || 0),
      y: (Number(secondCurrent.y) || 0) - (Number(secondStart.y) || 0),
    };
    const firstDistance = Math.hypot(firstVector.x, firstVector.y);
    const secondDistance = Math.hypot(secondVector.x, secondVector.y);
    const smallerDistance = Math.min(firstDistance, secondDistance);
    const largerDistance = Math.max(firstDistance, secondDistance);
    const dot = (firstVector.x * secondVector.x) + (firstVector.y * secondVector.y);
    const normalizedDot = firstDistance > 0 && secondDistance > 0
      ? dot / (firstDistance * secondDistance)
      : -1;
    const balance = largerDistance > 0 ? smallerDistance / largerDistance : 0;
    return {
      firstDistance,
      secondDistance,
      averageDistance: (firstDistance + secondDistance) / 2,
      normalizedDot,
      balance,
    };
  }

  function getTouchPinchFocusForCentroid(centroid) {
    const nextCentroid = centroid || getTouchCentroid();
    if (!nextCentroid) {
      return null;
    }
    let surface = null;
    if (isMultiCanvasWorldLayoutActive() && typeof document.elementFromPoint === 'function') {
      surface = getCanvasInteractionSurfaceFromTarget(document.elementFromPoint(nextCentroid.x, nextCentroid.y));
    }
    const focus = getCanvasFocusAt(nextCentroid.x, nextCentroid.y, {
      allowOutsideCanvas: true,
      surface,
    });
    if (!focus) {
      return null;
    }
    return {
      clientX: focus.clientX,
      clientY: focus.clientY,
      worldX: focus.worldX,
      worldY: focus.worldY,
      cellX: focus.cellX,
      cellY: focus.cellY,
      surface: focus.surface || null,
      canvasDocId: focus.canvasDocId || '',
    };
  }

  function refreshTouchPanBaseline({ resetPinchFocus = true } = {}) {
    const centroid = getTouchCentroid();
    pointerState.touchPanStart = centroid;
    pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
    pointerState.touchPinchStartDistance = getTouchPointerDistance();
    pointerState.touchPinchStartScale = Number(state.scale) || MIN_ZOOM_SCALE;
    pointerState.touchGestureStartPointers = captureTouchGestureStartPointers();
    if (resetPinchFocus) {
      pointerState.touchPinchFocus = getTouchPinchFocusForCentroid(centroid);
    }
  }

  function clearTouchGestureFrame() {
    if (pointerState.touchGestureRafId !== null && pointerState.touchGestureRafId !== undefined) {
      cancelAnimationFrame(pointerState.touchGestureRafId);
    }
    pointerState.touchGestureRafId = null;
  }

  function resetExclusiveTouchGesture({ waitForAllTouches = false } = {}) {
    clearTouchGestureFrame();
    if (pointerState.touchGestureDecisionTimer !== null && pointerState.touchGestureDecisionTimer !== undefined) {
      window.clearTimeout(pointerState.touchGestureDecisionTimer);
    }
    pointerState.touchGestureDecisionTimer = null;
    const captureElement = pointerState.touchGestureCaptureElement;
    if (captureElement && typeof captureElement.releasePointerCapture === 'function') {
      (pointerState.touchGesturePointerIds || []).forEach(pointerId => {
        try {
          if (!captureElement.hasPointerCapture || captureElement.hasPointerCapture(pointerId)) {
            captureElement.releasePointerCapture(pointerId);
          }
        } catch (_error) {
          // Pointer may already have ended or been cancelled.
        }
      });
    }
    pointerState.touchGestureCaptureElement = null;
    pointerState.touchGestureMode = waitForAllTouches
      ? GestureMode.CANCELLED_UNTIL_ALL_UP
      : GestureMode.IDLE;
    pointerState.touchGesturePointerIds = [];
    pointerState.touchGestureStartedAt = 0;
    pointerState.touchGestureMovedPointerIds = null;
    pointerState.touchGestureStartCentroid = null;
    pointerState.touchGestureStartDistance = null;
    pointerState.touchGestureStartScale = null;
    pointerState.touchGestureStartPan = null;
    pointerState.touchPinchFocus = null;
  }

  function beginExclusiveTouchGesture(event) {
    const ids = Array.from(activeTouchPointers.keys()).slice(0, 2);
    if (ids.length !== 2) return false;
    const metrics = viewportGestureArbiter.getTwoPointMetrics?.(
      activeTouchPointers.get(ids[0]),
      activeTouchPointers.get(ids[1])
    );
    if (!metrics) return false;
    pointerState.touchGesturePointerIds = ids;
    pointerState.touchGestureMovedPointerIds = new Set();
    pointerState.touchGestureMode = GestureMode.TOUCH_UNDECIDED;
    pointerState.touchGestureStartedAt = performance.now();
    pointerState.touchGestureStartCentroid = metrics.centroid;
    pointerState.touchGestureStartDistance = metrics.distance;
    pointerState.touchGestureStartScale = Number(state.scale) || MIN_ZOOM_SCALE;
    pointerState.touchGestureStartPan = { x: Number(state.pan.x) || 0, y: Number(state.pan.y) || 0 };
    pointerState.touchPinchFocus = getTouchPinchFocusForCentroid(metrics.centroid);
    const captureElement = dom.canvasViewport instanceof HTMLElement ? dom.canvasViewport : null;
    pointerState.touchGestureCaptureElement = captureElement;
    if (captureElement && typeof captureElement.setPointerCapture === 'function') {
      ids.forEach(pointerId => {
        try {
          captureElement.setPointerCapture(pointerId);
        } catch (_error) {
          // Continue with window listeners when capture is unavailable.
        }
      });
    }
    pointerState.active = true;
    pointerState.tool = 'pan';
    pointerState.panMode = 'multiTouch';
    pointerState.pointerId = null;
    pointerState.panCaptureElement = null;
    document.body.classList.add('is-pan-dragging');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return true;
  }

  function promoteTouchPointersToExclusiveGesture(event) {
    if (event?.pointerType !== 'touch' || activeTouchPointers.size < TOUCH_PAN_MIN_POINTERS) {
      return false;
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    pointerState.suppressTouchCompatibilityUntil = performance.now() + 800;
    if (activeTouchPointers.size > TOUCH_PAN_MIN_POINTERS) {
      return true;
    }
    clearPendingCanvasSwitchPointer({ detachListeners: true });
    releaseVirtualCursorPointer();
    if (pointerState.active && !(pointerState.tool === 'pan' && pointerState.panMode === 'multiTouch')) {
      const wasSelectionTransform = pointerState.tool === 'selectionTransform';
      abortActivePointerInteraction({ commitHistory: false });
      if (!wasSelectionTransform) {
        // Restore the pixels from before the one-pointer tool interaction. This
        // removes a pen/eraser dot already applied before the second touch.
        rollbackPendingHistory();
      }
      clearSharedProjectInFlightStroke();
    }
    if (!pointerState.active || pointerState.tool !== 'pan' || pointerState.panMode !== 'multiTouch') {
      abortActivePointerInteraction({ commitHistory: false });
      beginExclusiveTouchGesture(event);
    }
    return true;
  }

  function applyLatestExclusiveTouchGesture() {
    const metrics = getLockedTouchGestureMetrics();
    if (!metrics) return;
    let mode = pointerState.touchGestureMode;
    if (mode === GestureMode.TOUCH_UNDECIDED) {
      const decision = viewportGestureArbiter.classifyTouchGesture?.({
        startCentroid: pointerState.touchGestureStartCentroid,
        startDistance: pointerState.touchGestureStartDistance,
        currentCentroid: metrics.centroid,
        currentDistance: metrics.distance,
        elapsedMs: performance.now() - (Number(pointerState.touchGestureStartedAt) || performance.now()),
        config: VIEWPORT_GESTURE_CONFIG,
      });
      mode = decision?.mode || mode;
      if (mode === GestureMode.TOUCH_PAN || mode === GestureMode.TOUCH_ZOOM) {
        // The arbiter locks ownership once. It never switches until every touch is up.
        pointerState.touchGestureMode = mode;
      }
    }
    if (mode === GestureMode.TOUCH_PAN) {
      const targetPan = viewportGestureArbiter.calculateTouchPan?.(
        pointerState.touchGestureStartPan,
        pointerState.touchGestureStartCentroid,
        metrics.centroid
      );
      if (!targetPan) return;
      state.pan.x = Math.round(targetPan.x);
      state.pan.y = Math.round(targetPan.y);
      markViewportInteractionActivity();
      applyViewportTransform();
      return;
    }
    if (mode === GestureMode.TOUCH_ZOOM) {
      const targetScale = viewportGestureArbiter.calculateTouchZoomScale?.(
        pointerState.touchGestureStartScale,
        pointerState.touchGestureStartDistance,
        metrics.distance,
        VIEWPORT_GESTURE_CONFIG
      );
      if (!Number.isFinite(targetScale)) return;
      // setZoom may change pan only to preserve the fixed start anchor. Current
      // centroid movement is intentionally never added as ordinary panning.
      setZoom(normalizeZoomScale(targetScale, state.scale), pointerState.touchPinchFocus || undefined);
    }
  }

  function scheduleExclusiveTouchGestureFrame() {
    // Touch input is applied for every PointerEvent. RAF batching made slow
    // finger motion feel stepped on phones with irregular event delivery.
    applyLatestExclusiveTouchGesture();
  }

  function startPanInteraction(event, { multiTouch = false, captureElement = dom.canvases.drawing } = {}) {
    // Touch pan/zoom is handled only with two-finger gestures.
    if (event?.pointerType === 'touch' && !multiTouch) {
      return;
    }
    pointerState.active = true;
    pointerState.tool = 'pan';
    pointerState.panMode = multiTouch ? 'multiTouch' : 'single';
    pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
    pointerState.path = [];
    pointerState.drawPaletteIndex = null;
    if (multiTouch) {
      pointerState.pointerId = null;
      pointerState.startClient = null;
      pointerState.touchGestureMode = null;
      pointerState.touchGestureStartPointers = captureTouchGestureStartPointers();
      refreshTouchPanBaseline({ resetPinchFocus: true });
      if (!pointerState.touchPanStart) {
        pointerState.touchPanStart = { x: event.clientX, y: event.clientY };
        pointerState.touchPinchStartDistance = null;
        pointerState.touchPinchStartScale = Number(state.scale) || MIN_ZOOM_SCALE;
        pointerState.touchPinchFocus = getTouchPinchFocusForCentroid(pointerState.touchPanStart);
      }
      pointerState.panCaptureElement = null;
    } else {
      pointerState.pointerId = event.pointerId;
      pointerState.startClient = { x: event.clientX, y: event.clientY };
      pointerState.touchPanStart = null;
      pointerState.touchPinchStartDistance = null;
      pointerState.touchPinchStartScale = null;
      pointerState.touchPinchFocus = null;
      pointerState.touchGestureMode = null;
      pointerState.touchGestureStartPointers = null;
      const captureTarget = captureElement && typeof captureElement.setPointerCapture === 'function'
        ? captureElement
        : dom.canvases.drawing;
      pointerState.panCaptureElement = captureTarget || null;
      if (pointerState.panCaptureElement && typeof pointerState.panCaptureElement.setPointerCapture === 'function') {
        try {
          pointerState.panCaptureElement.setPointerCapture(event.pointerId);
        } catch (error) {
          pointerState.panCaptureElement = null;
        }
      }
    }
    document.body.classList.add('is-pan-dragging');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function finishPanInteraction() {
    detachPointerListeners();
    if (pointerState.pointerId !== null) {
      const captureTarget = pointerState.panCaptureElement || pointerState.surface?.drawing || dom.canvases.drawing;
      if (captureTarget && typeof captureTarget.releasePointerCapture === 'function') {
        try {
          captureTarget.releasePointerCapture(pointerState.pointerId);
        } catch (error) {
          // Ignore capture release issues.
        }
      }
    }
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.surface = null;
    pointerState.tool = null;
    pointerState.panMode = null;
    pointerState.touchPanStart = null;
    pointerState.touchPinchStartDistance = null;
    pointerState.touchPinchStartScale = null;
    pointerState.touchPinchFocus = null;
    resetExclusiveTouchGesture({ waitForAllTouches: activeTouchPointers.size > 0 });
    pointerState.touchGestureStartPointers = null;
    pointerState.startClient = null;
    pointerState.path = [];
    pointerState.drawPaletteIndex = null;
    pointerState.panCaptureElement = null;
    document.body.classList.remove('is-pan-dragging');
    requestOverlayRender();
    scheduleSessionPersist({ includeSnapshots: false });
  }

  function cancelActiveViewportGesture(reason = 'cancel') {
    clearTouchGestureFrame();
    activeTouchPointers.clear();
    if (pointerState.active && pointerState.tool === 'pan') {
      finishPanInteraction();
    } else if (pointerState.active) {
      abortActivePointerInteraction({ commitHistory: false });
      rollbackPendingHistory({ reRender: false });
      clearSharedProjectInFlightStroke();
    }
    resetExclusiveTouchGesture();
    releaseVirtualCursorPointer();
    document.body.classList.remove('is-pan-dragging');
    if (VIEWPORT_GESTURE_CONFIG.ENABLE_GESTURE_DEBUG_LOG) {
      console.debug('[PiXiEEDraw gesture cancelled]', reason);
    }
    requestOverlayRender();
  }

  function handlePointerDown(event) {
    markSaveInteractionActivity();
    pointerState.selectionExtendOnDown = false;
    const targetElement = event.target instanceof Element ? event.target : null;
    let interactionSurface = getCanvasInteractionSurfaceFromTarget(targetElement) || getMainCanvasInteractionSurface();
    const activeCanvasIdBeforeDown = getActiveProjectCanvasDocument()?.id || '';
    const requestedCanvasId = interactionSurface?.canvasDocId || '';
    const isTouch = event.pointerType === 'touch';
    if (
      isTouch
      && pointerState.active
      && pointerState.tool === 'pan'
      && pointerState.panMode === 'multiTouch'
    ) {
      event.preventDefault();
      return;
    }
    const shouldDeferInactiveCanvasSwitch = shouldDeferInactiveCanvasPointerDown(
      event,
      requestedCanvasId,
      activeCanvasIdBeforeDown
    );
    if (!finalizePendingSelectionBeforeCanvasSwitch(requestedCanvasId)) {
      event.preventDefault();
      updateCanvasControlButtons();
      requestOverlayRender();
      return;
    }
    syncActiveLayerFromInteractionSurface(interactionSurface, {
      syncUi: shouldDeferInactiveCanvasSwitch,
      persist: false,
    });
    commitPreviewProjectCanvasSelection({ persist: shouldDeferInactiveCanvasSwitch, flushUi: false });
    if (!shouldDeferInactiveCanvasSwitch) {
      flushActiveProjectCanvasUiSync({ persist: false });
    }
    interactionSurface = getCanvasInteractionSurfaceFromTarget(targetElement) || getMainCanvasInteractionSurface();
    if (isTouch) {
      updateTouchPointer(event);
    }
    if (shouldDeferInactiveCanvasSwitch) {
      event.preventDefault();
      pointerState.pendingCanvasSwitch = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        button: Number.isFinite(event.button) ? event.button : 0,
        shiftKey: Boolean(event.shiftKey),
        startClient: {
          x: Number(event.clientX) || 0,
          y: Number(event.clientY) || 0,
        },
        canvasDocId: interactionSurface?.canvasDocId || '',
        surface: interactionSurface,
        target: interactionSurface?.drawing || targetElement || null,
        canDragStart: canBeginPendingCanvasSwitchDrag(state.tool),
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      hoverPixel = null;
      requestOverlayRender();
      return;
    }
    clearTimelineSelectionForCanvasInteraction();
    const isMiddleMousePan = event.pointerType !== 'touch' && event.button === 1;
    if (isMiddleMousePan) {
      event.preventDefault();
      if (pointerState.active) {
        abortActivePointerInteraction();
      }
      startPanInteraction(event);
      return;
    }
    const isPrimaryPointer = event.pointerType !== 'touch' && (event.button === 0 || event.button === undefined);
    if (keyboardState.spacePanActive && isPrimaryPointer) {
      event.preventDefault();
      if (pointerState.active) {
        abortActivePointerInteraction({ commitHistory: false });
      }
      startPanInteraction(event, { captureElement: dom.canvasViewport });
      return;
    }

    if (isTouch && hasActiveMultiTouch()) {
      event.preventDefault();
      if (activeTouchPointers.size > TOUCH_PAN_MIN_POINTERS) {
        return;
      }
      clearPendingCanvasSwitchPointer({ detachListeners: true });
      releaseVirtualCursorPointer();
      if (pointerState.active && pointerState.tool !== 'pan') {
        const wasSelectionTransform = pointerState.tool === 'selectionTransform';
        abortActivePointerInteraction({ commitHistory: false });
        if (!wasSelectionTransform) {
          rollbackPendingHistory();
        }
      }
      if (!pointerState.active || pointerState.tool !== 'pan' || pointerState.panMode !== 'multiTouch') {
        abortActivePointerInteraction();
        beginExclusiveTouchGesture(event);
      }
      return;
    }

    const pointerButton = Number.isFinite(event.button) ? event.button : 0;
    const isMousePointer = event.pointerType === 'mouse';
    const isSecondaryMouseButton = isMousePointer && pointerButton === 2;
    if (isMousePointer && pointerButton !== 0 && pointerButton !== 2) {
      return;
    }

    event.preventDefault();
    const position = getPointerPosition(event, { surface: interactionSurface });
    const activeTool = state.tool;
    // If playback is active, don't allow drawing except pan
    if (state.playback.isPlaying && activeTool !== 'pan') {
      return;
    }
    // Spectator (viewer) mode: only allow pan interactions
    if (isMultiSpectatorMode()) {
      if (activeTool !== 'pan') {
        logSharedProjectDrawBlock('spectator-mode');
        setMultiStatus(localizeText('視聴モードでは描画や選択はできません', 'Drawing and selection are disabled in viewer mode'), 'warn');
        return;
      }
      // allow pan as usual
    } else {
      // Non-spectator: existing restrictions for drawing guests
      const isSharedProjectLocalEditTool = HISTORY_DRAW_TOOLS.has(activeTool) || activeTool === 'move';
      if (isSharedProjectLocalEditTool) {
        const sharedLocalDrawOptions = { allowLocalOpBacklog: true };
        if (!canAcceptSharedProjectLocalDrawOps('', sharedLocalDrawOptions)) {
          const sharedDrawBlockReason = getSharedProjectLocalDrawBlockReason('', sharedLocalDrawOptions);
          const sharedDrawBlockStatus = getSharedProjectDrawBlockStatus(sharedDrawBlockReason);
          logSharedProjectDrawBlock(
            sharedDrawBlockReason || (isSharedProjectAwaitingReady()
              ? (sharedProjectDeferRealtimeUntilSynced
                ? 'shared-sync-awaiting-ready'
                : 'shared-sync-catching-up')
              : 'shared-realtime-not-ready')
          );
          setMultiStatus(sharedDrawBlockStatus.message, sharedDrawBlockStatus.level);
          updateAutosaveStatus(
            sharedDrawBlockStatus.message,
            sharedDrawBlockStatus.level
          );
          requestSharedProjectDrawReadinessRecovery(sharedDrawBlockReason || 'pointer-down').catch(() => {});
          return;
        }
      }
      if (HISTORY_DRAW_TOOLS.has(activeTool)) {
        if (isMultiAssignedCellRestrictedEditorMode() && !enforceGuestAssignedLayerSelection({ announce: true })) {
          logSharedProjectDrawBlock('assigned-cell-restriction');
          return;
        }
      }
    }
    const layer = getActiveLayer();
    const shouldExtendSelection = Boolean(
      event.shiftKey
      && (activeTool === 'selectRect' || activeTool === 'selectLasso' || activeTool === 'selectSame')
    );
    pointerState.selectionExtendOnDown = shouldExtendSelection;

    if (isSecondaryMouseButton && !HISTORY_DRAW_TOOLS.has(activeTool)) {
      return;
    }

    if (HISTORY_DRAW_TOOLS.has(activeTool) && !layer) {
      logSharedProjectDrawBlock('missing-active-layer');
      return;
    }

    if (activeTool === 'pan') {
      if (isTouch) {
        // On mobile, wait for the two-finger pan/zoom branch above.
        return;
      }
      pointerState.surface = interactionSurface;
      startPanInteraction(event, { multiTouch: false, captureElement: interactionSurface?.drawing || dom.canvases.drawing });
      return;
    }
    if (activeTool === 'zoom') {
      // Reserved internal tool. Wheel and two-touch zoom remain handled by the
      // viewport arbiter; no toolbar or one-pointer zoom gesture is exposed.
      return;
    }

    pointerState.drawPaletteIndex = HISTORY_DRAW_TOOLS.has(activeTool)
      ? (isSecondaryMouseButton
        ? normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex)
        : normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex))
      : null;

    const isSelectionToolForTransform = activeTool === 'selectRect'
      || activeTool === 'selectLasso'
      || activeTool === 'selectSame'
      || activeTool === 'move';
    const transformHandle = !isSecondaryMouseButton && isSelectionToolForTransform
      ? getSelectionTransformHandleHit(event.clientX, event.clientY)
      : null;
    if (transformHandle) {
      const transformStartPosition = position || getPointerPosition(event, { clampToCanvas: true, surface: interactionSurface });
      const startedTransform = beginSelectionTransformInteraction(event, transformStartPosition, transformHandle, interactionSurface);
      if (startedTransform) {
        updateCanvasControlButtons();
        return;
      }
    }
    if (!position) {
      pointerState.active = false;
      return;
    }
    const selectRectGridGesture = activeTool === 'selectRect'
      ? detectSelectRectGridDoubleTap(position)
      : { enabled: false, cell: null };

    if (keyboardState.customBrushGestureArmed) {
      if (!(interactionSurface?.drawing instanceof HTMLCanvasElement)) {
        return;
      }
      keyboardState.customBrushGestureUsed = true;
      pointerState.selectionExtendOnDown = false;
      if (state.selectionMask) {
        clearSelection();
      }
      interactionSurface.drawing.setPointerCapture(event.pointerId);
      hoverPixel = null;
      requestOverlayRender();
      pointerState.active = true;
      pointerState.pointerId = event.pointerId;
      pointerState.surface = interactionSurface;
      pointerState.tool = POINTER_TOOL_CUSTOM_BRUSH_RECT;
      pointerState.start = position;
      pointerState.current = position;
      pointerState.last = position;
      pointerState.path = [position];
      pointerState.preview = null;
      pointerState.selectionPreview = { start: position, end: position, points: [position] };
      pointerState.selectionMove = null;
      pointerState.drawPaletteIndex = null;
      pointerState.selectionClearedOnDown = false;
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return;
    }

    if (!(state.showVirtualCursor && event.pointerType === 'touch')) {
      setVirtualCursor(position);
    }

    if (state.showVirtualCursor) {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        mouseInsideViewport = true;
        refreshViewportCursorStyle();
      }
      const keepVirtualDrawState = Boolean(virtualCursorDrawState.active);
      pointerState.active = false;
      pointerState.pointerId = null;
      if (keepVirtualDrawState) {
        pointerState.tool = virtualCursorDrawState.tool || pointerState.tool || state.tool;
      } else {
        pointerState.tool = null;
        pointerState.start = null;
        pointerState.current = null;
        pointerState.last = null;
        pointerState.path = [];
        pointerState.preview = null;
        pointerState.selectionPreview = null;
        pointerState.selectionMove = null;
        pointerState.drawPaletteIndex = null;
        pointerState.selectionClearedOnDown = false;
        pointerState.selectionExtendOnDown = false;
      }
      if (isTouch) {
        hoverPixel = null;
        pointerState.surface = interactionSurface;
        captureVirtualCursorPointer(event.pointerId, event.pointerType, interactionSurface?.drawing || dom.canvases.drawing, event);
        requestOverlayRender();
        return;
      }
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        hoverPixel = null;
        pointerState.surface = interactionSurface;
        captureVirtualCursorPointer(event.pointerId, event.pointerType, interactionSurface?.drawing || dom.canvases.drawing, event);
        requestOverlayRender();
        return;
      }
    }

    pointerState.selectionClearedOnDown = false;

    const selectionMask = state.selectionMask;
    const hasSelection = Boolean(selectionMask && selectionMaskHasPixels(selectionMask));
    const selectionHit = hasSelection && isPositionInCurrentSelection(position);
    const selectionInteractionHit = selectionHit;
    const isSelectionTool = activeTool === 'selectRect' || activeTool === 'selectLasso' || activeTool === 'selectSame' || activeTool === 'move';
    const pendingMoveState = !pointerState.active
      ? (getPendingSelectionMoveState() || state.pendingPasteMoveState)
      : null;
    if (!pendingMoveState) {
      pointerState.selectionMove = null;
    }
    const pendingSelectionHit = Boolean(pendingMoveState && isPositionInMoveState(position, pendingMoveState));
    if (pendingMoveState) {
      // Keep dragging when touching the moved selection preview; confirm when touching outside.
      if (isSelectionTool && (selectionHit || pendingSelectionHit)) {
        const moved = beginSelectionMove(event, position, { reuseOffset: true });
        if (moved) {
          updateCanvasControlButtons();
          return;
        }
      }
      const cleared = clearSelection();
      if (!cleared) {
        updateCanvasControlButtons();
        return;
      }
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.tool = null;
      pointerState.start = null;
      pointerState.current = null;
      pointerState.last = null;
      pointerState.path = [];
      pointerState.preview = null;
      pointerState.selectionPreview = null;
      pointerState.selectionMove = null;
      pointerState.drawPaletteIndex = null;
      pointerState.selectionClearedOnDown = false;
      return;
    }

    if (
      isSelectionTool
      && hasSelection
      && selectionInteractionHit
      && !pointerState.selectionExtendOnDown
      && !(activeTool === 'selectRect' && selectRectGridGesture.enabled)
    ) {
      const moved = beginSelectionMove(event, position, { reuseOffset: Boolean(state.pendingPasteMoveState) });
      if (moved) {
        updateCanvasControlButtons();
        return;
      }
    }

    if (activeTool === 'move') {
      if (hasSelection && !selectionInteractionHit) {
        clearSelection();
      }
      const hasSelectionAfterClear = Boolean(state.selectionMask && selectionMaskHasPixels(state.selectionMask));
      if (!hasSelectionAfterClear) {
        const movedWholeLayer = beginLayerMove(event, position, layer);
        if (movedWholeLayer) {
          return;
        }
      }
      pointerState.active = false;
      return;
    }

    if (
      (activeTool === 'selectRect' || activeTool === 'selectLasso')
      && hasSelection
      && !selectionInteractionHit
      && !pointerState.selectionExtendOnDown
    ) {
      clearSelection();
      pointerState.selectionClearedOnDown = true;
      pointerState.selectionRestartedOnDown = true;
    }
    if (
      activeTool === 'selectRect'
      && selectRectGridGesture.enabled
      && hasSelection
      && !pointerState.selectionExtendOnDown
    ) {
      clearSelection();
      pointerState.selectionClearedOnDown = true;
      pointerState.selectionRestartedOnDown = true;
    }

    if (activeTool === 'curve') {
      if (HISTORY_DRAW_TOOLS.has(activeTool) && !layer) {
        return;
      }
      pointerState.surface = interactionSurface;
      handleCurvePointerDown(event, position, layer);
      return;
    }

    if (!(interactionSurface?.drawing instanceof HTMLCanvasElement)) {
      return;
    }
    interactionSurface.drawing.setPointerCapture(event.pointerId);
    hoverPixel = null;
    requestOverlayRender();
    pointerState.active = true;
    pointerState.pointerId = event.pointerId;
    pointerState.surface = interactionSurface;
    pointerState.tool = activeTool;
    pointerState.start = position;
    pointerState.current = position;
    pointerState.last = position;
    pointerState.path = position ? [position] : [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;

    if (HISTORY_DRAW_TOOLS.has(activeTool)) {
      beginHistory(activeTool);
    }

    if (activeTool === 'eyedropper') {
      sampleColor(position.x, position.y);
      pointerState.active = false;
      pointerState.drawPaletteIndex = null;
      if (interactionSurface?.drawing instanceof HTMLCanvasElement) {
        interactionSurface.drawing.releasePointerCapture(event.pointerId);
      }
      flushActiveProjectCanvasUiSync();
      setActiveTool('pen');
      return;
    }

    if (FILL_TOOLS.has(activeTool)) {
      requestOverlayRender();
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      return;
    }

    if (activeTool === 'selectRect' || activeTool === 'selectLasso') {
      const rawStart = activeTool === 'selectRect'
        ? getPointerPositionRaw(event, { clampToCanvas: true, surface: interactionSurface })
        : null;
      pointerState.selectionPreview = { start: position, points: [position] };
      if (rawStart) {
        pointerState.selectionPreview.rawStart = rawStart;
        pointerState.selectionPreview.rawCurrent = rawStart;
      }
      if (activeTool === 'selectRect' && selectRectGridGesture.enabled) {
        const startCell = selectRectGridGesture.cell || getSelectionGridCellFromPosition(position, SELECT_RECT_GRID_CELL_SIZE);
        if (startCell) {
          pointerState.selectionPreview.gridCellMode = true;
          pointerState.selectionPreview.gridCellSize = SELECT_RECT_GRID_CELL_SIZE;
          pointerState.selectionPreview.gridAnchorCell = { ...startCell };
          pointerState.selectionPreview.gridCurrentCell = { ...startCell };
          updateSelectionGridRectPreview(pointerState.selectionPreview, startCell, startCell);
          if (pointerState.selectionPreview.start) {
            pointerState.start = { ...pointerState.selectionPreview.start };
          }
          if (pointerState.selectionPreview.end) {
            pointerState.current = { ...pointerState.selectionPreview.end };
          }
        }
      }
    } else if (activeTool === 'selectSame') {
      pointerState.selectionPreview = null;
    } else if (activeTool === 'line' || activeTool === 'rect' || activeTool === 'rectFill' || activeTool === 'ellipse' || activeTool === 'ellipseFill') {
      pointerState.preview = { start: position, end: position, points: [position] };
    } else {
      beginSharedProjectStrokeCapture(activeTool, position, interactionSurface);
      applyBrushStroke(position.x, position.y, position.x, position.y);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handlePointerMove(event) {
    markSaveInteractionActivity();
    if (event.pointerType === 'touch' && activeTouchPointers.has(event.pointerId)) {
      updateTouchPointer(event);
    }
    if (!pointerState.active) {
      if (!beginPendingCanvasSwitchDrag(event)) {
        return;
      }
    }
    if (!pointerState.active) return;
    if (pointerState.tool === 'voxelPreviewRotate') {
      if (event.pointerId !== pointerState.pointerId) {
        return;
      }
      event.preventDefault();
      updateVoxelPreviewYawFromDrag(event);
      return;
    }
    if (pointerState.tool === 'pan') {
      if (pointerState.panMode === 'multiTouch') {
        event.preventDefault();
        if (pointerState.touchGestureMode === GestureMode.CANCELLED_UNTIL_ALL_UP) {
          return;
        }
        if (!pointerState.touchGesturePointerIds?.includes(event.pointerId)) {
          return;
        }
        if (pointerState.touchGestureMode === GestureMode.TOUCH_UNDECIDED) {
          pointerState.touchGestureMovedPointerIds?.add(event.pointerId);
          if ((pointerState.touchGestureMovedPointerIds?.size || 0) < 2) {
            if (pointerState.touchGestureDecisionTimer === null || pointerState.touchGestureDecisionTimer === undefined) {
              // Give the other pointer one brief chance to report its move. If
              // it stays still (a common pinch), still classify this gesture.
              pointerState.touchGestureDecisionTimer = window.setTimeout(() => {
                pointerState.touchGestureDecisionTimer = null;
                applyLatestExclusiveTouchGesture();
              }, 16);
            }
            return;
          }
          if (pointerState.touchGestureDecisionTimer !== null && pointerState.touchGestureDecisionTimer !== undefined) {
            window.clearTimeout(pointerState.touchGestureDecisionTimer);
            pointerState.touchGestureDecisionTimer = null;
          }
        }
        scheduleExclusiveTouchGestureFrame();
        return;
      }
      if (event.pointerId !== pointerState.pointerId) return;
      const dx = event.clientX - (pointerState.startClient?.x || 0);
      const dy = event.clientY - (pointerState.startClient?.y || 0);
      const originX = pointerState.panOrigin?.x || 0;
      const originY = pointerState.panOrigin?.y || 0;
      state.pan.x = Math.round(originX + dx);
      state.pan.y = Math.round(originY + dy);
      markViewportInteractionActivity();
      const clampResult = applyViewportTransform();
      if (clampResult?.clampedX || clampResult?.clampedY) {
        pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
        pointerState.startClient = { x: event.clientX, y: event.clientY };
      }
      updateVirtualCursorFromEvent(event);
      return;
    }
    if (event.pointerId !== pointerState.pointerId) return;
    updateVirtualCursorFromEvent(event);
    if (pointerState.tool === 'curve') {
      handleCurvePointerMove(event);
      return;
    }

    const position = getPointerPosition(event, { clampToCanvas: true, surface: pointerState.surface });
    if (!position) return;
    pointerState.current = position;
    pointerState.path.push(position);

    if (pointerState.tool === 'pen' || pointerState.tool === 'eraser') {
      appendSharedProjectStrokePoint(position);
      applyBrushStroke(pointerState.last.x, pointerState.last.y, position.x, position.y);
      pointerState.last = position;
    } else if (FILL_TOOLS.has(pointerState.tool)) {
      const last = pointerState.last;
      if (!last || last.x !== position.x || last.y !== position.y) {
        pointerState.last = position;
        requestOverlayRender();
      }
    } else if (pointerState.tool === 'line' || pointerState.tool === 'rect' || pointerState.tool === 'rectFill' || pointerState.tool === 'ellipse' || pointerState.tool === 'ellipseFill') {
      pointerState.preview = { start: pointerState.start, end: position, points: pointerState.path.slice() };
      requestOverlayRender();
    } else if (pointerState.tool === 'selectionTransform') {
      handleSelectionTransformDrag(event);
    } else if (pointerState.tool === 'selectionMove' || pointerState.tool === 'layerMove') {
      handleSelectionMoveDrag(position);
    } else if (
      pointerState.tool === 'selectRect'
      || pointerState.tool === 'selectLasso'
      || pointerState.tool === POINTER_TOOL_CUSTOM_BRUSH_RECT
    ) {
      if (pointerState.tool === 'selectLasso') {
        pointerState.selectionPreview.points.push(position);
      } else if (pointerState.tool === 'selectRect' && pointerState.selectionPreview?.gridCellMode) {
        const preview = pointerState.selectionPreview;
        const cellSize = Math.max(1, Math.floor(Number(preview.gridCellSize) || SELECT_RECT_GRID_CELL_SIZE));
        const nextCell = getSelectionGridCellFromPosition(position, cellSize);
        if (nextCell) {
          const anchorCell = preview.gridAnchorCell || nextCell;
          preview.gridCurrentCell = { ...nextCell };
          updateSelectionGridRectPreview(preview, anchorCell, nextCell);
          if (preview.end) {
            pointerState.current = { ...preview.end };
          }
        }
      } else {
        if (pointerState.tool === 'selectRect' && pointerState.selectionPreview) {
          const rawCurrent = getPointerPositionRaw(event, { clampToCanvas: true, surface: pointerState.surface });
          if (rawCurrent) {
            pointerState.selectionPreview.rawCurrent = rawCurrent;
          }
        }
        pointerState.selectionPreview.points = [pointerState.selectionPreview.start, position];
        pointerState.selectionPreview.end = position;
      }
      requestOverlayRender();
    }
  }

  function handlePointerUp(event) {
    markSaveInteractionActivity();
    if (
      event.pointerType === 'touch'
      && pointerState.active
      && pointerState.tool === 'pan'
      && pointerState.panMode === 'multiTouch'
    ) {
      pointerState.suppressTouchCompatibilityUntil = performance.now() + 800;
      const wasGesturePointer = pointerState.touchGesturePointerIds?.includes(event.pointerId);
      if (wasGesturePointer) {
        applyLatestExclusiveTouchGesture();
      }
      removeTouchPointer(event);
      if (!wasGesturePointer) {
        return;
      }
      if (activeTouchPointers.size > 0) {
        clearTouchGestureFrame();
        pointerState.touchGestureMode = GestureMode.CANCELLED_UNTIL_ALL_UP;
        return;
      }
      finishPanInteraction();
      return;
    }
    if (event.pointerType === 'touch') {
      removeTouchPointer(event);
    }
    const pendingCanvasSwitch = pointerState.pendingCanvasSwitch;
    if (pendingCanvasSwitch?.pointerId === event.pointerId) {
      const hoverSurface = resolvePendingCanvasSwitchSurface(pendingCanvasSwitch);
      hoverPixel = getPointerPosition(event, { surface: hoverSurface });
      clearPendingCanvasSwitchPointer({ detachListeners: true });
      requestOverlayRender();
      return;
    }
    if (state.showVirtualCursor && virtualCursorControl.pointerId === event.pointerId) {
      const pointerType = virtualCursorControl.pointerType;
      releaseVirtualCursorPointer();
      if (pointerType !== 'touch') {
        updateVirtualCursorFromEvent(event);
      }
      requestOverlayRender();
      if (pointerType === 'mouse' || pointerType === 'pen') {
        if (typeof document.elementFromPoint === 'function') {
          const target = document.elementFromPoint(event.clientX, event.clientY);
          if (!target || !dom.canvasViewport || !dom.canvasViewport.contains(target)) {
            mouseInsideViewport = false;
            refreshViewportCursorStyle();
          }
        }
        performVirtualCursorAction();
      }
      return;
    }
    if (!pointerState.active) return;
    const isPanTool = pointerState.tool === 'pan';
    const isVoxelPreviewRotate = pointerState.tool === 'voxelPreviewRotate';
    const isMultiTouchPan = isPanTool && pointerState.panMode === 'multiTouch';
    if (isVoxelPreviewRotate) {
      if (pointerState.pointerId !== event.pointerId) {
        return;
      }
      finishVoxelPreviewRotateInteraction({ persist: true });
      return;
    }
    if (isPanTool) {
      if (isMultiTouchPan) {
        if (hasActiveMultiTouch()) {
          refreshTouchPanBaseline();
          return;
        }
        finishPanInteraction();
        return;
      }
      if (pointerState.pointerId !== event.pointerId) {
        return;
      }
      finishPanInteraction();
      return;
    }

    if (event.pointerId !== pointerState.pointerId) {
      return;
    }

    updateVirtualCursorFromEvent(event);

    if (pointerState.surface?.drawing instanceof HTMLCanvasElement) {
      pointerState.surface.drawing.releasePointerCapture(event.pointerId);
    }
    pointerState.active = false;
    detachPointerListeners();

    if (pointerState.tool === 'curve') {
      handleCurvePointerUp(event);
      return;
    }

    hoverPixel = getPointerPosition(event, { surface: pointerState.surface });
    let tool = pointerState.tool;
    const moveState = pointerState.selectionMove;
    const movePending = Boolean(moveState && moveState.hasCleared);

    if (tool === 'selectionTransform') {
      completeSelectionTransformInteraction(event, { cancel: false });
      return;
    }

    if ((tool === 'selectionMove' || tool === 'layerMove') && moveState) {
      if (movePending) {
        promotePendingSelectionMove(moveState, {
          hover: hoverPixel || pointerState.current,
        });
        pointerState.surface = null;
        return;
      }
      finalizeSelectionMove();
      tool = pointerState.tool || state.tool;
    }

    if (tool === 'line') {
      captureSharedProjectShapeCommand(tool, pointerState.start, pointerState.current, pointerState.surface);
      drawLine(pointerState.start, pointerState.current);
    } else if (tool === 'rect') {
      captureSharedProjectShapeCommand(tool, pointerState.start, pointerState.current, pointerState.surface);
      drawRectangle(pointerState.start, pointerState.current, false);
    } else if (tool === 'rectFill') {
      captureSharedProjectShapeCommand(tool, pointerState.start, pointerState.current, pointerState.surface);
      drawRectangle(pointerState.start, pointerState.current, true);
    } else if (tool === 'ellipse') {
      captureSharedProjectShapeCommand(tool, pointerState.start, pointerState.current, pointerState.surface);
      drawEllipse(pointerState.start, pointerState.current, false);
    } else if (tool === 'ellipseFill') {
      captureSharedProjectShapeCommand(tool, pointerState.start, pointerState.current, pointerState.surface);
      drawEllipse(pointerState.start, pointerState.current, true);
    } else if (FILL_TOOLS.has(tool)) {
      const fillStyle = normalizeFillStyle(
        getFillStyleForInteraction(tool, pointerState.start, pointerState.current),
        FILL_STYLE_SOLID
      );
      const gradientFill = isGradientFillStyle(fillStyle);
      const fillTarget = gradientFill
        ? pointerState.start
        : (pointerState.current || pointerState.start);
      const fillEnd = pointerState.current || pointerState.start || fillTarget;
      if (fillTarget) {
        captureSharedProjectFillCommand(fillTarget, pointerState.surface, {
          end: fillEnd,
          fillStyle,
        });
        floodFill(fillTarget.x, fillTarget.y, pointerState.drawPaletteIndex, {
          start: fillTarget,
          end: fillEnd,
          fillStyle,
        });
      }
    } else if (tool === 'selectionMove' || tool === 'layerMove') {
      finalizeSelectionMove();
    } else if (tool === 'selectRect') {
      if (pointerState.selectionPreview?.gridCellMode) {
        createSelectionByGridRect(
          pointerState.selectionPreview.gridAnchorCell,
          pointerState.selectionPreview.gridCurrentCell,
          {
            append: pointerState.selectionExtendOnDown,
            cellSize: pointerState.selectionPreview.gridCellSize || SELECT_RECT_GRID_CELL_SIZE,
            selectionShapeMode: state.selectionShapeMode,
          }
        );
      } else if (
        !(!pointerState.selectionRestartedOnDown && pointerState.selectionClearedOnDown && pointerState.path.length <= 1)
        && pointerState.start
        && pointerState.current
        && (
          pointerState.start.x !== pointerState.current.x
          || pointerState.start.y !== pointerState.current.y
          || hasSelectRectHalfCellDrag(pointerState.selectionPreview)
        )
      ) {
        createSelectionRect(pointerState.start, pointerState.current, {
          append: pointerState.selectionExtendOnDown,
          selectionShapeMode: state.selectionShapeMode,
        });
      }
    } else if (tool === 'selectLasso') {
      const pointCount = pointerState.selectionPreview?.points?.length || 0;
      if (!(!pointerState.selectionRestartedOnDown && pointerState.selectionClearedOnDown && pointCount <= 1)) {
        createSelectionLasso(pointerState.selectionPreview.points, {
          append: pointerState.selectionExtendOnDown,
          selectionShapeMode: state.selectionShapeMode,
        });
      }
    } else if (tool === POINTER_TOOL_CUSTOM_BRUSH_RECT) {
      const start = pointerState.start;
      const end = pointerState.current || pointerState.start;
      if (start && end) {
        createSelectionRect(start, end);
        if (keyboardState.customBrushCreateOnPointerUp) {
          createCustomBrushFromSelection();
        }
      } else {
        updateAutosaveStatus('Shift + B を押したままドラッグして範囲を選択してください', 'info');
      }
      keyboardState.customBrushCreateOnPointerUp = false;
    }

    if (HISTORY_DRAW_TOOLS.has(tool)) {
      commitHistory();
      clearSharedProjectInFlightStroke();
    } else if (tool === 'selectSame') {
      const target = pointerState.current || pointerState.start;
      if (target) {
        createSelectionByColor(target.x, target.y, {
          append: pointerState.selectionExtendOnDown,
        });
      }
      commitHistory();
    }

    pointerState.pointerId = null;
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.drawPaletteIndex = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionExtendOnDown = false;
    pointerState.path = [];
    pointerState.surface = null;
    flushActiveProjectCanvasUiSync();
    requestOverlayRender();
  }

  function handlePointerCancel(event) {
    markSaveInteractionActivity();
    if (
      event.pointerType === 'touch'
      && pointerState.active
      && pointerState.tool === 'pan'
      && pointerState.panMode === 'multiTouch'
    ) {
      pointerState.suppressTouchCompatibilityUntil = performance.now() + 800;
      removeTouchPointer(event);
      clearTouchGestureFrame();
      if (activeTouchPointers.size > 0) {
        pointerState.touchGestureMode = GestureMode.CANCELLED_UNTIL_ALL_UP;
      } else {
        finishPanInteraction();
      }
      return;
    }
    if (event.pointerType === 'touch') {
      removeTouchPointer(event);
    }
    if (pointerState.pendingCanvasSwitch?.pointerId === event.pointerId) {
      clearPendingCanvasSwitchPointer({ detachListeners: true });
      requestOverlayRender();
      return;
    }
    if (state.showVirtualCursor && virtualCursorControl.pointerId === event.pointerId) {
      releaseVirtualCursorPointer();
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        mouseInsideViewport = false;
        refreshViewportCursorStyle();
      }
      requestOverlayRender();
      return;
    }
    if (!pointerState.active) {
      return;
    }
    if (pointerState.tool === 'voxelPreviewRotate') {
      if (pointerState.pointerId === event.pointerId) {
        finishVoxelPreviewRotateInteraction({ persist: true });
      }
      return;
    }
    if (pointerState.tool === 'pan') {
      finishPanInteraction();
      return;
    }
    if (pointerState.pointerId === event.pointerId) {
      if (pointerState.tool === POINTER_TOOL_CUSTOM_BRUSH_RECT) {
        keyboardState.customBrushCreateOnPointerUp = false;
      }
      if (pointerState.tool === 'selectionTransform') {
        completeSelectionTransformInteraction(event, { cancel: true });
        return;
      }
      if (FILL_TOOLS.has(pointerState.tool)) {
        abortActivePointerInteraction({ commitHistory: false });
        rollbackPendingHistory({ reRender: false });
        clearSharedProjectInFlightStroke();
        requestOverlayRender();
        return;
      }
      abortActivePointerInteraction();
      clearSharedProjectInFlightStroke();
    }
  }

  function beginLayerMove(event, startPosition, layer) {
    const captureCanvas = pointerState.surface?.drawing instanceof HTMLCanvasElement
      ? pointerState.surface.drawing
      : dom.canvases.drawing;
    if (!layer || !(captureCanvas instanceof HTMLCanvasElement)) {
      return false;
    }
    hideSelectionTransformMenu();
    const moveState = createLayerMoveState(layer);
    if (!moveState) {
      return false;
    }

    captureCanvas.setPointerCapture(event.pointerId);
    hoverPixel = null;
    requestOverlayRender();
    pointerState.active = true;
    pointerState.pointerId = event.pointerId;
    pointerState.tool = 'layerMove';
    pointerState.start = startPosition;
    pointerState.current = startPosition;
    pointerState.last = startPosition;
    pointerState.path = startPosition ? [startPosition] : [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = moveState;
    pointerState.lastSelectionMove = moveState;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return true;
  }

  function beginSelectionMove(event, startPosition, options = {}) {
    const { reuseOffset = false } = options || {};
    hideSelectionTransformMenu();
    const layer = getActiveLayer();
    let moveState = null;
    const pendingMove = reuseOffset
      ? (getPendingSelectionMoveState() || state.pendingPasteMoveState)
      : null;
    if (pendingMove) {
      moveState = pendingMove;
      if (pointerState.selectionMove === pendingMove) {
        pointerState.selectionMove = null;
      }
      if (state.pendingPasteMoveState === pendingMove) {
        state.pendingPasteMoveState = null;
      }
    } else {
      const mask = state.selectionMask;
      const bounds = state.selectionBounds;
      if (!mask || !bounds || !layer) {
        return false;
      }
      moveState = createSelectionMoveState(layer, bounds, mask, state.selectionContentMask);
    }
    if (!moveState) {
      return false;
    }
    if (!moveState.layer && layer) {
      moveState.layer = layer;
    }
    if (!moveState.layerId) {
      moveState.layerId = moveState.layer?.id || layer?.id || null;
    }
    if (!moveState.layer) {
      return false;
    }
    moveState.offset = moveState.offset || { x: 0, y: 0 };
    if (!reuseOffset) {
      moveState.offset.x = 0;
      moveState.offset.y = 0;
    }

    const captureCanvas = pointerState.surface?.drawing instanceof HTMLCanvasElement
      ? pointerState.surface.drawing
      : dom.canvases.drawing;
    captureCanvas?.setPointerCapture(event.pointerId);
    hoverPixel = null;
    requestOverlayRender();
    pointerState.active = true;
    pointerState.pointerId = event.pointerId;
    pointerState.tool = 'selectionMove';
    if (reuseOffset && moveState.hasCleared) {
      pointerState.start = {
        x: startPosition.x - moveState.offset.x,
        y: startPosition.y - moveState.offset.y,
      };
    } else {
      pointerState.start = startPosition;
    }
    pointerState.current = startPosition;
    pointerState.last = startPosition;
    pointerState.path = startPosition ? [startPosition] : [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = moveState;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    updateCanvasControlButtons();
    return true;
  }

  function beginSelectionMoveFromVirtualCursor(startPosition, options = {}) {
    const { reuseOffset = false } = options || {};
    hideSelectionTransformMenu();
    if (!startPosition) {
      return false;
    }
    const layer = getActiveLayer();

    let moveState = null;
    const pendingMove = reuseOffset
      ? (getPendingSelectionMoveState() || state.pendingPasteMoveState)
      : null;
    if (pendingMove) {
      moveState = pendingMove;
      if (pointerState.selectionMove === pendingMove) {
        pointerState.selectionMove = null;
      }
      if (state.pendingPasteMoveState === pendingMove) {
        state.pendingPasteMoveState = null;
      }
    } else {
      const mask = state.selectionMask;
      const bounds = state.selectionBounds;
      if (!mask || !bounds || !layer) {
        return false;
      }
      moveState = createSelectionMoveState(layer, bounds, mask, state.selectionContentMask);
    }
    if (!moveState) {
      return false;
    }

    if (!moveState.layer && layer) {
      moveState.layer = layer;
    }
    if (!moveState.layerId) {
      moveState.layerId = moveState.layer?.id || layer?.id || null;
    }
    if (!moveState.layer) {
      return false;
    }
    moveState.offset = moveState.offset || { x: 0, y: 0 };
    if (!reuseOffset) {
      moveState.offset.x = 0;
      moveState.offset.y = 0;
    }

    hoverPixel = null;
    requestOverlayRender();
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.tool = 'selectionMove';
    if (reuseOffset && moveState.hasCleared) {
      pointerState.start = {
        x: startPosition.x - moveState.offset.x,
        y: startPosition.y - moveState.offset.y,
      };
    } else {
      pointerState.start = { ...startPosition };
    }
    pointerState.current = { ...startPosition };
    pointerState.last = { ...startPosition };
    pointerState.path = [{ ...startPosition }];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = moveState;
    pointerState.lastSelectionMove = moveState;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionExtendOnDown = false;
    updateCanvasControlButtons();
    return true;
  }

  function isPositionInBounds(position, bounds) {
    if (!position || !bounds) {
      return false;
    }
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    return x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1;
  }

  function getCurrentSelectionBounds() {
    return normalizeSelectionBoundsForState(state.selectionBounds) || computeSelectionBoundsFromMask(state.selectionMask);
  }

  function isPositionInCurrentSelection(position) {
    if (!position) {
      return false;
    }
    const mask = state.selectionMask;
    const bounds = state.selectionBounds;
    if (!mask || !bounds) {
      return false;
    }
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    if (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1) {
      return false;
    }
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
      return false;
    }
    const idx = y * state.width + x;
    return mask[idx] === 1;
  }

  function isPositionInCurrentSelectionBounds(position) {
    return isPositionInBounds(position, getCurrentSelectionBounds());
  }

  function isPositionInCurrentSelectionInteractionArea(position) {
    return isPositionInCurrentSelection(position);
  }

  function isPositionInMoveState(position, moveState) {
    if (!position || !moveState || !moveState.bounds || !moveState.mask) {
      return false;
    }
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    const offsetX = Number(moveState.offset?.x) || 0;
    const offsetY = Number(moveState.offset?.y) || 0;
    if (hasSelectionMoveTransform(moveState)) {
      const transformed = buildSelectionMoveTransformedEntries(moveState);
      if (!transformed.bounds || !(transformed.mask instanceof Uint8Array) || transformed.width <= 0 || transformed.height <= 0) {
        return false;
      }
      const originX = (Number(moveState.bounds.x0) || 0) + offsetX + transformed.bounds.x0;
      const originY = (Number(moveState.bounds.y0) || 0) + offsetY + transformed.bounds.y0;
      const localX = x - originX;
      const localY = y - originY;
      if (localX < 0 || localY < 0 || localX >= transformed.width || localY >= transformed.height) {
        return false;
      }
      const localIndex = (localY * transformed.width) + localX;
      return transformed.mask[localIndex] === 1;
    }
    const width = Math.max(0, Number(moveState.width) || 0);
    const height = Math.max(0, Number(moveState.height) || 0);
    if (width <= 0 || height <= 0) {
      return false;
    }
    const originX = (Number(moveState.bounds.x0) || 0) + offsetX;
    const originY = (Number(moveState.bounds.y0) || 0) + offsetY;
    const localX = x - originX;
    const localY = y - originY;
    if (localX < 0 || localY < 0 || localX >= width || localY >= height) {
      return false;
    }
    const localIndex = (localY * width) + localX;
    return moveState.mask[localIndex] === 1;
  }

  function isPositionInMoveVisualBounds(position, moveState) {
    if (!position || !moveState) {
      return false;
    }
    const bounds = getSelectionMoveVisualBounds(moveState);
    if (!bounds) {
      return false;
    }
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    return x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1;
  }

  function getMoveStateSourcePixelAlpha(moveState, sourceIndex) {
    if (!moveState || !Number.isInteger(sourceIndex) || sourceIndex < 0) {
      return 0;
    }
    const indices = moveState.indices instanceof Int16Array ? moveState.indices : null;
    const direct = moveState.direct instanceof Uint8ClampedArray ? moveState.direct : null;
    const paletteIndex = indices && sourceIndex < indices.length ? indices[sourceIndex] : -1;
    if (paletteIndex >= 0 && Array.isArray(state.palette) && state.palette[paletteIndex]) {
      return Number(state.palette[paletteIndex].a) || 0;
    }
    if (direct) {
      const base = sourceIndex * 4;
      if (base + 3 < direct.length) {
        return Number(direct[base + 3]) || 0;
      }
    }
    return 0;
  }

  function selectionDirectHasVisiblePixels(direct, mask = null) {
    if (!(direct instanceof Uint8ClampedArray)) {
      return false;
    }
    if (mask instanceof Uint8Array && mask.length * 4 <= direct.length) {
      for (let i = 0; i < mask.length; i += 1) {
        if (mask[i] !== 1) {
          continue;
        }
        const base = i * 4;
        if (direct[base + 3] > 0) {
          return true;
        }
      }
      return false;
    }
    for (let i = 3; i < direct.length; i += 4) {
      if (direct[i] > 0) {
        return true;
      }
    }
    return false;
  }

  function clearDirectPixel(direct, base) {
    if (!(direct instanceof Uint8ClampedArray) || base < 0 || base + 3 >= direct.length) {
      return;
    }
    direct[base] = 0;
    direct[base + 1] = 0;
    direct[base + 2] = 0;
    direct[base + 3] = 0;
  }

  function writePaletteColorToDirectPixel(direct, base, paletteIndex) {
    if (!(direct instanceof Uint8ClampedArray) || base < 0 || base + 3 >= direct.length) {
      return 0;
    }
    const color = Number.isInteger(paletteIndex) && paletteIndex >= 0
      ? state.palette[paletteIndex]
      : null;
    if (!color) {
      clearDirectPixel(direct, base);
      return 0;
    }
    direct[base] = clamp(Math.round(Number(color.r) || 0), 0, 255);
    direct[base + 1] = clamp(Math.round(Number(color.g) || 0), 0, 255);
    direct[base + 2] = clamp(Math.round(Number(color.b) || 0), 0, 255);
    direct[base + 3] = clamp(Math.round(Number(color.a) || 0), 0, 255);
    return direct[base + 3];
  }

  function refreshLayerDirectOnlyFlag(layer) {
    if (!layer) {
      return;
    }
    layer.directOnly = layer.direct instanceof Uint8ClampedArray
      ? inferDirectOnlyLayer(layer, layer.indices, layer.direct)
      : false;
  }

  function storeSelectionInClipboard(moveState) {
    if (!moveState) {
      internalClipboard.selection = null;
      return;
    }
    internalClipboard.selection = cloneSelectionClipboardPayload({
      width: moveState.width,
      height: moveState.height,
      mask: moveState.mask,
      contentMask: getSelectionMoveContentMask(moveState) instanceof Uint8Array
        ? getSelectionMoveContentMask(moveState)
        : null,
      indices: moveState.indices,
      direct: moveState.direct,
      palette: state.palette.map(color => normalizeColorValue(color)),
      bounds: { ...moveState.bounds },
      imageData: moveState.imageData ? cloneImageData(moveState.imageData) : null,
    });
  }

  function copySelection() {
    const pendingClipboardMoveState = snapshotPendingSelectionMoveForClipboard(getPendingSelectionMoveState());
    const moveState = pendingClipboardMoveState || snapshotSelectionForClipboard();
    if (!moveState) {
      updateCanvasControlButtons();
      return false;
    }
    storeSelectionInClipboard(moveState);
    if (!pendingClipboardMoveState) {
      state.pendingPasteMoveState = null;
    }
    updateCanvasControlButtons();
    return true;
  }

  function hasCanvasSelectionClipboardContext() {
    return hasPendingSelectionMove()
      || Boolean(state.pendingPasteMoveState)
      || selectionMaskHasPixels(state.selectionMask);
  }

  function performCopyAction() {
    if (hasCanvasSelectionClipboardContext()) {
      return copySelection();
    }
    if (hasTimelineStructureSelection()) {
      return copyTimelineSelection();
    }
    return copySelection();
  }

  function performCutAction() {
    if (hasTimelineStructureSelection() && !hasCanvasSelectionClipboardContext()) {
      return false;
    }
    return cutSelection();
  }

  function performPasteAction() {
    if (hasTimelineStructureSelection() && !hasCanvasSelectionClipboardContext()) {
      const timelinePasted = pasteTimelineClipboard();
      if (timelinePasted || !internalClipboard.selection) {
        return timelinePasted;
      }
    }
    return pasteSelection();
  }

  function cutSelection() {
    const pendingMoveState = getPendingSelectionMoveState();
    if (pendingMoveState) {
      const clipboardMoveState = snapshotPendingSelectionMoveForClipboard(pendingMoveState);
      if (!clipboardMoveState) {
        updateCanvasControlButtons();
        return false;
      }
      pointerState.selectionMove = pendingMoveState;
      const finalized = finalizeSelectionMove();
      if (!finalized) {
        updateCanvasControlButtons();
        return false;
      }
      const finalizedMoveState = snapshotSelectionForClipboard();
      if (!finalizedMoveState) {
        updateCanvasControlButtons();
        return false;
      }
      storeSelectionInClipboard(clipboardMoveState);
      beginHistory('selectionCut');
      clearSelectionSourcePixels(finalizedMoveState, { useSelectionMask: true, trackPendingMove: false });
      pointerState.selectionMove = null;
      pointerState.lastSelectionMove = null;
      state.pendingPasteMoveState = null;
      captureSharedProjectRegionCommand(finalizedMoveState.bounds, pointerState.surface || null, 'selectionCut');
      commitHistory();
      clearSelection();
      updateCanvasControlButtons();
      return true;
    }
    const moveState = snapshotSelectionForClipboard();
    if (!moveState) {
      updateCanvasControlButtons();
      return false;
    }
    storeSelectionInClipboard(moveState);
    state.pendingPasteMoveState = null;
    beginHistory('selectionCut');
    clearSelectionSourcePixels(moveState, { useSelectionMask: true, trackPendingMove: false });
    pointerState.selectionMove = null;
    pointerState.lastSelectionMove = null;
    state.pendingPasteMoveState = null;
    captureSharedProjectRegionCommand(moveState.bounds, pointerState.surface || null, 'selectionCut');
    commitHistory();
    clearSelection();
    updateCanvasControlButtons();
    return true;
  }

  function pasteSelection() {
    if (!canCurrentClientImportExternalData()) {
      setMultiStatus(localizeText('参加/視聴モードでは貼り付けインポートはマスターのみ操作できます', 'In participant/viewer mode, only the master can paste-import'), 'warn');
      updateCanvasControlButtons();
      return false;
    }
    if (pointerState.active) {
      updateCanvasControlButtons();
      return false;
    }
    if (hasPendingSelectionMove()) {
      const finalized = confirmPendingSelectionMove({ allowOutOfBoundsClip: true });
      if (!finalized) {
        updateCanvasControlButtons();
        return false;
      }
    }
    const clip = internalClipboard.selection;
    if (!clip) {
      updateCanvasControlButtons();
      return false;
    }
    const layer = getActiveLayer();
    if (!layer) {
      updateCanvasControlButtons();
      return false;
    }
    const width = Math.max(0, Math.floor(clip.width) || 0);
    const height = Math.max(0, Math.floor(clip.height) || 0);
    if (width === 0 || height === 0) {
      updateCanvasControlButtons();
      return false;
    }
    const maxX0 = Math.max(0, state.width - width);
    const maxY0 = Math.max(0, state.height - height);
    let x0 = Number.isFinite(clip.bounds?.x0) ? Math.round(clip.bounds.x0) : 0;
    let y0 = Number.isFinite(clip.bounds?.y0) ? Math.round(clip.bounds.y0) : 0;
    x0 = clamp(x0, 0, maxX0);
    y0 = clamp(y0, 0, maxY0);
    const bounds = { x0, y0, x1: x0 + width - 1, y1: y0 + height - 1 };
    commitHistory();
    beginHistory('selectionPaste');
    const moveState = createMoveStateFromClipboard(clip, bounds, layer, { autoExpandPalette: true });
    if (!moveState) {
      rollbackPendingHistory({ reRender: false });
      updateCanvasControlButtons();
      return false;
    }
    if (moveState.paletteAddedCount > 0) {
      renderPalette();
      syncPaletteInputs();
      applyPaletteChange();
      updateAutosaveStatus(
        localizeText(
          `貼り付け色をパレットへ追加しました (${moveState.paletteAddedCount}色)`,
          `Added pasted colors to palette (${moveState.paletteAddedCount})`
        ),
        'info'
      );
    }
    const restoreSnapshot = createPasteRestoreSnapshot(layer, bounds, width, height);
    moveState.restoreIndices = restoreSnapshot.indices;
    moveState.restoreDirect = restoreSnapshot.direct;
    moveState.layer = layer;
    moveState.layerId = layer?.id || null;
    moveState.offset.x = 0;
    moveState.offset.y = 0;
    moveState.hasCleared = false;
    state.pendingPasteMoveState = moveState;
    const result = placeSelectionPixels(moveState, 0, 0);
    let success = false;
    if (result.placed && result.bounds) {
      markHistoryDirty();
      state.selectionMask = result.mask;
      state.selectionContentMask = result.contentMask;
      state.selectionBounds = result.bounds;
      internalClipboard.selection.bounds = { ...result.bounds };
      markDirtyRect(result.bounds.x0, result.bounds.y0, result.bounds.x1, result.bounds.y1);
      requestRender();
      requestOverlayRender();
      success = true;
    }
    if (!success) {
      state.pendingPasteMoveState = null;
      rollbackPendingHistory({ reRender: false });
    } else {
      captureSharedProjectRegionCommand(result.bounds, pointerState.surface || null, 'selectionPaste');
      commitHistory();
    }
    updateCanvasControlButtons();
    return success;
  }

  function handleSelectionMoveDrag(position) {
    const moveState = pointerState.selectionMove;
    if (!moveState) {
      return;
    }
    const start = pointerState.start || position;
    const offsetX = position.x - start.x;
    const offsetY = position.y - start.y;
    if (!moveState.hasCleared && (offsetX !== 0 || offsetY !== 0)) {
      beginHistory('selectionMove');
      clearSelectionSourcePixels(moveState);
    }
    if (moveState.offset.x === offsetX && moveState.offset.y === offsetY && moveState.hasCleared) {
      return;
    }
    moveState.offset.x = offsetX;
    moveState.offset.y = offsetY;
    if (moveState.hasCleared) {
      requestOverlayRender();
    }
  }

  function promotePendingSelectionMove(moveState, options = {}) {
    if (!moveState || !moveState.hasCleared) {
      return false;
    }
    const hover = options && options.hover && Number.isFinite(options.hover.x) && Number.isFinite(options.hover.y)
      ? { x: Math.floor(options.hover.x), y: Math.floor(options.hover.y) }
      : null;
    pointerState.tool = state.tool;
    pointerState.pointerId = null;
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionExtendOnDown = false;
    const cursorCell = getVirtualCursorCellPosition();
    const nextCurrent = hover || pointerState.current || cursorCell;
    pointerState.current = nextCurrent ? { ...nextCurrent } : null;
    pointerState.last = nextCurrent ? { ...nextCurrent } : null;
    pointerState.path = [];
    pointerState.active = false;
    pointerState.drawPaletteIndex = null;
    state.pendingPasteMoveState = moveState;
    pointerState.lastSelectionMove = moveState;
    updateCanvasControlButtons();
    requestOverlayRender();
    return true;
  }

  function clearSelectionSourcePixels(moveState, options = {}) {
    const { layer, bounds, width, height } = moveState;
    const useSelectionMask = Boolean(options && options.useSelectionMask);
    const trackPendingMove = options?.trackPendingMove !== false;
    const mask = useSelectionMask
      ? moveState.mask
      : (getSelectionMoveContentMask(moveState) || moveState.mask);
    if (!layer) {
      return;
    }
    if (!(mask instanceof Uint8Array) || mask.length !== (width * height)) {
      return;
    }
    const restoreIndices = moveState.restoreIndices instanceof Int16Array ? moveState.restoreIndices : null;
    const restoreDirect = moveState.restoreDirect instanceof Uint8ClampedArray ? moveState.restoreDirect : null;
    let layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    if (!layerDirect && restoreDirect) {
      layerDirect = ensureLayerDirect(layer);
    }
    let modified = false;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const localIndex = y * width + x;
        if (mask[localIndex] !== 1) continue;
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        if (canvasX < 0 || canvasY < 0 || canvasX >= state.width || canvasY >= state.height) continue;
        const canvasIndex = canvasY * state.width + canvasX;
        const base = canvasIndex * 4;
        const previousIndex = layer.indices[canvasIndex];
        let previousAlpha = 0;
        if (previousIndex >= 0 && state.palette[previousIndex]) {
          previousAlpha = state.palette[previousIndex].a;
        } else if (layerDirect) {
          previousAlpha = layerDirect[base + 3];
        }
        let nextIndex = -1;
        let nextAlpha = 0;
        if (restoreIndices) {
          nextIndex = restoreIndices[localIndex] ?? -1;
          layer.indices[canvasIndex] = nextIndex;
        } else {
          layer.indices[canvasIndex] = -1;
        }
        if (layerDirect) {
          if (restoreDirect) {
            const localBase = localIndex * 4;
            layerDirect[base] = restoreDirect[localBase];
            layerDirect[base + 1] = restoreDirect[localBase + 1];
            layerDirect[base + 2] = restoreDirect[localBase + 2];
            layerDirect[base + 3] = restoreDirect[localBase + 3];
            if (nextIndex >= 0 && state.palette[nextIndex]) {
              nextAlpha = writePaletteColorToDirectPixel(layerDirect, base, nextIndex);
            } else {
              nextAlpha = restoreDirect[localBase + 3];
            }
          } else {
            nextAlpha = nextIndex >= 0
              ? writePaletteColorToDirectPixel(layerDirect, base, nextIndex)
              : 0;
            if (nextIndex < 0) {
              clearDirectPixel(layerDirect, base);
            }
          }
        } else {
          if (nextIndex >= 0 && state.palette[nextIndex]) {
            nextAlpha = state.palette[nextIndex].a;
          } else {
            nextAlpha = 0;
          }
        }
        if (layer.indices[canvasIndex] !== previousIndex || nextAlpha !== previousAlpha) {
          modified = true;
        }
      }
    }
    if (modified) {
      refreshLayerDirectOnlyFlag(layer);
      markHistoryDirty();
      markDirtyRect(bounds.x0, bounds.y0, bounds.x1, bounds.y1);
    }
    moveState.hasCleared = true;
    moveState.committed = !trackPendingMove;
    if (trackPendingMove) {
      pointerState.lastSelectionMove = moveState;
    } else if (pointerState.lastSelectionMove === moveState) {
      pointerState.lastSelectionMove = null;
    }
    requestRender();
    updateCanvasControlButtons();
  }

  function finalizeSelectionMove(options = {}) {
    const moveState = pointerState.selectionMove || state.pendingPasteMoveState;
    if (!moveState) {
      pointerState.tool = state.tool;
      return false;
    }
    const isPendingPastePlacement = state.pendingPasteMoveState === moveState && !moveState.committed;
    if (!moveState.hasCleared && !isPendingPastePlacement) {
      pointerState.tool = state.tool;
      pointerState.selectionMove = null;
      state.pendingPasteMoveState = null;
      return false;
    }

    const { offset } = moveState;
    const applySelection = moveState.applySelectionOnFinalize !== false;
    const allowOutOfBoundsClip = Boolean(options && options.allowOutOfBoundsClip);
    const result = placeSelectionPixels(moveState, offset.x, offset.y, {
      requireFullyInBounds: !allowOutOfBoundsClip,
    });

    if (result.blockedByBounds) {
      const hover = getVirtualCursorCellPosition() || pointerState.current || null;
      promotePendingSelectionMove(moveState, { hover });
      updateAutosaveStatus(
        localizeText(
          '選択範囲の一部がキャンバス外にあるため確定できません。内側へ戻してから確定してください。',
          'Cannot confirm because part of the selection is outside the canvas. Move it back inside and confirm.'
        ),
        'warn'
      );
      requestOverlayRender();
      updateCanvasControlButtons();
      return false;
    }

    pointerState.selectionMove = null;
    pointerState.tool = state.tool;
    state.pendingPasteMoveState = null;
    moveState.committed = true;
    pointerState.lastSelectionMove = null;

    if (result.placed) {
      if (result.bounds) {
        markDirtyRect(result.bounds.x0, result.bounds.y0, result.bounds.x1, result.bounds.y1);
      }
      if (applySelection) {
        state.selectionMask = result.mask;
        state.selectionContentMask = result.contentMask;
        state.selectionBounds = result.bounds;
        if (internalClipboard.selection && result.bounds) {
          internalClipboard.selection.bounds = { ...result.bounds };
        }
      } else {
        state.selectionMask = null;
        state.selectionContentMask = null;
        state.selectionBounds = null;
      }
    } else {
      if (applySelection) {
        clearSelection();
      } else {
        state.selectionMask = null;
        state.selectionContentMask = null;
        state.selectionBounds = null;
      }
    }

    const unionBounds = result.bounds
      ? {
        x0: Math.min(Number(moveState.bounds?.x0) || 0, Number(result.bounds.x0) || 0),
        y0: Math.min(Number(moveState.bounds?.y0) || 0, Number(result.bounds.y0) || 0),
        x1: Math.max(Number(moveState.bounds?.x1) || 0, Number(result.bounds.x1) || 0),
        y1: Math.max(Number(moveState.bounds?.y1) || 0, Number(result.bounds.y1) || 0),
      }
      : moveState.bounds;
    captureSharedProjectRegionCommand(
      unionBounds,
      pointerState.surface || null,
      moveState.transformRotationDeg
        || moveState.transformFlipHorizontal
        || moveState.transformFlipVertical
        || Math.abs(normalizeSelectionMoveScale(moveState.transformScaleX) - 1) > SELECTION_TRANSFORM_SCALE_EPSILON
        || Math.abs(normalizeSelectionMoveScale(moveState.transformScaleY) - 1) > SELECTION_TRANSFORM_SCALE_EPSILON
        ? 'selectionTransform'
        : 'selectionMove'
    );
    markHistoryDirty();
    requestRender();
    requestOverlayRender();
    commitHistory();
    updateCanvasControlButtons();
    return true;
  }

  function hasPendingSelectionMove() {
    return Boolean(getPendingSelectionMoveState() || state.pendingPasteMoveState);
  }

  function getPendingSelectionMoveState() {
    const direct = pointerState.selectionMove;
    if (direct && direct.hasCleared && !direct.committed) {
      return direct;
    }
    const pending = state.pendingPasteMoveState;
    if (pending && pending.hasCleared && !pending.committed) {
      return pending;
    }
    const fallback = pointerState.lastSelectionMove;
    if (fallback && fallback.hasCleared && !fallback.committed) {
      return fallback;
    }
    return null;
  }

  function confirmPendingSelectionMove(options = {}) {
    const moveState = getPendingSelectionMoveState();
    if (!moveState) {
      return false;
    }
    pointerState.selectionMove = moveState;
    const finalized = finalizeSelectionMove(options);
    if (finalized) {
      clearSelection();
    }
    updateCanvasControlButtons();
    return finalized;
  }

  function cancelPendingSelectionMove() {
    const moveState = getPendingSelectionMoveState();
    if (!moveState) {
      return;
    }
    pointerState.selectionMove = moveState;
    pointerState.selectionMove = null;
    pointerState.tool = state.tool;
    state.pendingPasteMoveState = null;
    pointerState.lastSelectionMove = null;
    pointerState.pointerId = null;
    pointerState.active = false;
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.path = [];
    rollbackPendingHistory({ reRender: true });
    clearSelection();
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function placeSelectionPixels(moveState, offsetX, offsetY, { requireFullyInBounds = false } = {}) {
    const { layer, bounds, indices, direct } = moveState;
    const transformedSelection = buildSelectionMoveTransformedEntries(moveState);
    const transformedContent = buildSelectionMoveTransformedEntries(moveState, {
      sourceMask: getSelectionMoveContentMask(moveState),
      cacheProperty: 'transformedContentEntryCache',
      cacheScope: 'content',
    });
    const selectionEntries = Array.isArray(transformedSelection.entries) ? transformedSelection.entries : [];
    const contentEntries = Array.isArray(transformedContent.entries) ? transformedContent.entries : [];
    if (requireFullyInBounds) {
      for (let i = 0; i < selectionEntries.length; i += 1) {
        const entry = selectionEntries[i];
        const targetX = (Number(bounds?.x0) || 0) + (Number(entry?.x) || 0) + offsetX;
        const targetY = (Number(bounds?.y0) || 0) + (Number(entry?.y) || 0) + offsetY;
        if (targetX < 0 || targetY < 0 || targetX >= state.width || targetY >= state.height) {
          return {
            placed: false,
            mask: null,
            contentMask: null,
            bounds: null,
            clippedCount: 1,
            blockedByBounds: true,
          };
        }
      }
    }
    const newMask = new Uint8Array(state.width * state.height);
    const newContentMask = new Uint8Array(state.width * state.height);
    const newBounds = { x0: state.width, y0: state.height, x1: -1, y1: -1 };
    let placed = false;
    let clippedCount = 0;

    for (let i = 0; i < selectionEntries.length; i += 1) {
      const entry = selectionEntries[i];
      const targetX = (Number(bounds?.x0) || 0) + (Number(entry?.x) || 0) + offsetX;
      const targetY = (Number(bounds?.y0) || 0) + (Number(entry?.y) || 0) + offsetY;
      if (targetX < 0 || targetY < 0 || targetX >= state.width || targetY >= state.height) {
        continue;
      }
      const targetIndex = (targetY * state.width) + targetX;
      newMask[targetIndex] = 1;
      if (targetX < newBounds.x0) newBounds.x0 = targetX;
      if (targetY < newBounds.y0) newBounds.y0 = targetY;
      if (targetX > newBounds.x1) newBounds.x1 = targetX;
      if (targetY > newBounds.y1) newBounds.y1 = targetY;
    }

    let contentHasDirectPixels = false;
    for (let i = 0; i < contentEntries.length; i += 1) {
      if (Array.isArray(contentEntries[i]?.rgba) && contentEntries[i].rgba.length >= 4) {
        contentHasDirectPixels = true;
        break;
      }
    }
    const sourceDirectHasVisiblePixels = selectionDirectHasVisiblePixels(
      direct,
      getSelectionMoveContentMask(moveState) || moveState.mask
    );
    const existingTargetDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const targetDirect = (sourceDirectHasVisiblePixels || contentHasDirectPixels || existingTargetDirect)
      ? (existingTargetDirect || ensureLayerDirect(layer))
      : null;

    for (let i = 0; i < contentEntries.length; i += 1) {
      const entry = contentEntries[i];
      const sourceIndex = Number(entry?.sourceIndex);
      const hasEntryRgba = Array.isArray(entry?.rgba) && entry.rgba.length >= 4;
      if ((!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= indices.length) && !hasEntryRgba) {
        continue;
      }
      const targetX = (Number(bounds?.x0) || 0) + (Number(entry.x) || 0) + offsetX;
      const targetY = (Number(bounds?.y0) || 0) + (Number(entry.y) || 0) + offsetY;
      if (targetX < 0 || targetY < 0 || targetX >= state.width || targetY >= state.height) {
        clippedCount += 1;
        continue;
      }
      const targetIndex = (targetY * state.width) + targetX;
      const targetBase = targetIndex * 4;
      const sourceBase = sourceIndex * 4;
      const nextPaletteIndex = hasEntryRgba ? -1 : indices[sourceIndex];
      layer.indices[targetIndex] = nextPaletteIndex;
      newContentMask[targetIndex] = 1;
      if (targetDirect) {
        if (hasEntryRgba) {
          targetDirect[targetBase] = clamp(Math.round(Number(entry.rgba[0]) || 0), 0, 255);
          targetDirect[targetBase + 1] = clamp(Math.round(Number(entry.rgba[1]) || 0), 0, 255);
          targetDirect[targetBase + 2] = clamp(Math.round(Number(entry.rgba[2]) || 0), 0, 255);
          targetDirect[targetBase + 3] = clamp(Math.round(Number(entry.rgba[3]) || 0), 0, 255);
        } else if (
          sourceDirectHasVisiblePixels
          && direct instanceof Uint8ClampedArray
          && sourceBase + 3 < direct.length
          && direct[sourceBase + 3] > 0
        ) {
          targetDirect[targetBase] = direct[sourceBase];
          targetDirect[targetBase + 1] = direct[sourceBase + 1];
          targetDirect[targetBase + 2] = direct[sourceBase + 2];
          targetDirect[targetBase + 3] = direct[sourceBase + 3];
        } else if (nextPaletteIndex >= 0) {
          writePaletteColorToDirectPixel(targetDirect, targetBase, nextPaletteIndex);
        } else {
          clearDirectPixel(targetDirect, targetBase);
        }
      }
      if (!placed) {
        placed = true;
      }
    }
    if (placed) {
      refreshLayerDirectOnlyFlag(layer);
    }

    if (newBounds.x0 > newBounds.x1 || newBounds.y0 > newBounds.y1) {
      return {
        placed: false,
        mask: null,
        contentMask: null,
        bounds: null,
        clippedCount,
        blockedByBounds: false,
      };
    }

    return {
      placed: true,
      mask: newMask,
      contentMask: newContentMask,
      bounds: newBounds,
      clippedCount,
      blockedByBounds: false,
    };
  }

  function drawSelectionMovePreview(moveState) {
    if (!moveState || !moveState.hasCleared) {
      return;
    }
    const transformed = hasSelectionMoveTransform(moveState);
    const originXBase = (Number(moveState.bounds?.x0) || 0) + (Number(moveState.offset?.x) || 0);
    const originYBase = (Number(moveState.bounds?.y0) || 0) + (Number(moveState.offset?.y) || 0);
    let originX = originXBase;
    let originY = originYBase;
    let outlineSegments = null;
    let transformedRender = null;

    if (transformed) {
      transformedRender = getSelectionMoveTransformedPreviewRenderData(moveState);
      if (transformedRender) {
        originX = originXBase + transformedRender.originOffsetX;
        originY = originYBase + transformedRender.originOffsetY;
        outlineSegments = transformedRender.outlineSegments;
      }
    }

    if (ctx.overlay) {
      let rendered = false;
      const previewCanvas = transformedRender?.previewCanvas || moveState.previewCanvas;
      if (previewCanvas) {
        try {
          ctx.overlay.drawImage(previewCanvas, originX, originY);
          rendered = true;
        } catch (error) {
          if (transformedRender) {
            moveState.transformedPreviewRenderCache = null;
          } else {
            moveState.previewCanvas = null;
          }
        }
      }
      if (!rendered && transformedRender?.imageData) {
        try {
          ctx.overlay.putImageData(transformedRender.imageData, originX, originY);
          rendered = true;
        } catch (error) {
          // Keep fallback attempts below.
        }
      }
      if (
        !rendered
        && transformedRender
        && transformedRender.mask instanceof Uint8Array
        && transformedRender.width > 0
        && transformedRender.height > 0
      ) {
        const fallbackCanvas = createMovePreviewCanvasFromPixels(
          transformedRender.width,
          transformedRender.height,
          transformedRender.mask,
          null,
          transformedRender.directPixels instanceof Uint8ClampedArray
            ? transformedRender.directPixels
            : null
        );
        if (fallbackCanvas) {
          moveState.transformedPreviewRenderCache = {
            ...transformedRender,
            previewCanvas: fallbackCanvas,
          };
          try {
            ctx.overlay.drawImage(fallbackCanvas, originX, originY);
            rendered = true;
          } catch (error) {
            // Keep outline rendering even if bitmap draw fails.
          }
        }
      }
      if (!rendered && !transformedRender && moveState.imageData) {
        try {
          ctx.overlay.putImageData(moveState.imageData, originX, originY);
          rendered = true;
        } catch (error) {
          const fallbackCanvas = createMovePreviewCanvasFromImageData(moveState.imageData);
          if (fallbackCanvas) {
            moveState.previewCanvas = fallbackCanvas;
            try {
              ctx.overlay.drawImage(fallbackCanvas, originX, originY);
              rendered = true;
            } catch (innerError) {
              // Keep outline rendering even if bitmap draw fails.
            }
          }
        }
      }
      if (!rendered && !transformedRender && shouldCreateSelectionMoveBitmapPreview(moveState.width, moveState.height)) {
        const fallbackCanvas = createMovePreviewCanvasFromPixels(
          moveState.width,
          moveState.height,
          moveState.mask,
          moveState.indices,
          moveState.direct
        );
        if (fallbackCanvas) {
          moveState.previewCanvas = fallbackCanvas;
          try {
            ctx.overlay.drawImage(fallbackCanvas, originX, originY);
            rendered = true;
          } catch (error) {
            // Ignore and continue with outline only.
          }
        }
      }
    }

    if (!ctx.selection) {
      return;
    }

    if (!outlineSegments) {
      outlineSegments = getSelectionMoveOutlineSegments(moveState);
    }
    if (!outlineSegments.length) {
      return;
    }
    strokeSelectionPath((pathCtx, scale) => {
      traceSelectionMoveOutline(pathCtx, outlineSegments, originX, originY, scale);
    }, { ensureResolution: false });
  }

  function getSelectionMoveTransformedPreviewRenderData(moveState) {
    if (!moveState) {
      return null;
    }
    const transformed = buildSelectionMoveTransformedEntries(moveState);
    if (!transformed.bounds || !transformed.width || !transformed.height || !Array.isArray(transformed.entries)) {
      return null;
    }
    const cacheKey = transformed.key;
    if (
      moveState.transformedPreviewRenderCache
      && moveState.transformedPreviewRenderCache.key === cacheKey
    ) {
      return moveState.transformedPreviewRenderCache;
    }

    const outputWidth = transformed.width;
    const outputHeight = transformed.height;
    const pixelCount = outputWidth * outputHeight;
    if (pixelCount > SELECTION_TRANSFORM_LARGE_PREVIEW_MAX_PIXELS) {
      const result = {
        key: cacheKey,
        previewCanvas: null,
        imageData: null,
        directPixels: null,
        mask: null,
        width: outputWidth,
        height: outputHeight,
        originOffsetX: transformed.bounds.x0,
        originOffsetY: transformed.bounds.y0,
        outlineSegments: buildSelectionMoveOutlineSegments(transformed.mask, outputWidth, outputHeight),
      };
      moveState.transformedPreviewRenderCache = result;
      return result;
    }
    const imageData = createBlankImageData(outputWidth, outputHeight);
    const sourceImageData = moveState.imageData && moveState.imageData.data instanceof Uint8ClampedArray
      ? moveState.imageData.data
      : null;
    const sourceIndices = moveState.indices instanceof Int16Array ? moveState.indices : null;
    const sourceDirect = moveState.direct instanceof Uint8ClampedArray ? moveState.direct : null;
    const outputData = imageData && imageData.data instanceof Uint8ClampedArray ? imageData.data : null;

    if (!outputData) {
      return null;
    }

    for (let i = 0; i < transformed.entries.length; i += 1) {
      const entry = transformed.entries[i];
      const sourceIndex = Number(entry?.sourceIndex);
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0) {
        continue;
      }
      const outX = (Number(entry.x) || 0) - transformed.bounds.x0;
      const outY = (Number(entry.y) || 0) - transformed.bounds.y0;
      if (outX < 0 || outY < 0 || outX >= outputWidth || outY >= outputHeight) {
        continue;
      }
      const outputBase = ((outY * outputWidth) + outX) * 4;
      if (Array.isArray(entry.rgba) && entry.rgba.length >= 4) {
        outputData[outputBase] = clamp(Math.round(Number(entry.rgba[0]) || 0), 0, 255);
        outputData[outputBase + 1] = clamp(Math.round(Number(entry.rgba[1]) || 0), 0, 255);
        outputData[outputBase + 2] = clamp(Math.round(Number(entry.rgba[2]) || 0), 0, 255);
        outputData[outputBase + 3] = clamp(Math.round(Number(entry.rgba[3]) || 0), 0, 255);
        continue;
      }
      const sourceBase = sourceIndex * 4;
      if (sourceImageData && sourceBase + 3 < sourceImageData.length) {
        outputData[outputBase] = sourceImageData[sourceBase];
        outputData[outputBase + 1] = sourceImageData[sourceBase + 1];
        outputData[outputBase + 2] = sourceImageData[sourceBase + 2];
        outputData[outputBase + 3] = sourceImageData[sourceBase + 3];
        continue;
      }
      if (sourceIndices && sourceIndex < sourceIndices.length) {
        const paletteIndex = sourceIndices[sourceIndex];
        if (paletteIndex >= 0 && state.palette[paletteIndex]) {
          const color = state.palette[paletteIndex];
          outputData[outputBase] = color.r;
          outputData[outputBase + 1] = color.g;
          outputData[outputBase + 2] = color.b;
          outputData[outputBase + 3] = color.a;
          continue;
        }
      }
      if (sourceDirect && sourceBase + 3 < sourceDirect.length) {
        outputData[outputBase] = sourceDirect[sourceBase];
        outputData[outputBase + 1] = sourceDirect[sourceBase + 1];
        outputData[outputBase + 2] = sourceDirect[sourceBase + 2];
        outputData[outputBase + 3] = sourceDirect[sourceBase + 3];
      }
    }

    const previewCanvas = createMovePreviewCanvasFromImageData(imageData)
      || createMovePreviewCanvasFromPixels(
        outputWidth,
        outputHeight,
        transformed.mask,
        null,
        outputData
      );
    const outlineSegments = buildSelectionMoveOutlineSegments(transformed.mask, outputWidth, outputHeight);
    const result = {
      key: cacheKey,
      previewCanvas,
      imageData,
      directPixels: outputData,
      mask: transformed.mask,
      width: outputWidth,
      height: outputHeight,
      originOffsetX: transformed.bounds.x0,
      originOffsetY: transformed.bounds.y0,
      outlineSegments,
    };
    if (previewCanvas && pixelCount > SELECTION_TRANSFORM_PREVIEW_CACHE_MAX_PIXELS) {
      // Keep only drawImage path for large transformed previews to reduce cache memory.
      result.imageData = null;
      result.directPixels = null;
      result.mask = null;
    }
    moveState.transformedPreviewRenderCache = result;
    return result;
  }

  function getSelectionMoveOutlineSegments(moveState) {
    if (!moveState) {
      return [];
    }
    if (!Array.isArray(moveState.outlineSegments)) {
      const mask = moveState.mask;
      const width = Math.max(0, Math.floor(Number(moveState.width) || 0));
      const height = Math.max(0, Math.floor(Number(moveState.height) || 0));
      moveState.outlineSegments = buildSelectionMoveOutlineSegments(mask, width, height);
    }
    return moveState.outlineSegments;
  }

  function buildSelectionMoveOutlineSegments(mask, width, height) {
    if (!(mask instanceof Uint8Array) || width <= 0 || height <= 0 || mask.length !== width * height) {
      return [];
    }
    if (width * height > SELECTION_TRANSFORM_LARGE_PREVIEW_MAX_PIXELS) {
      return [
        0, 0, width, 0,
        width, 0, width, height,
        width, height, 0, height,
        0, height, 0, 0,
      ];
    }
    const segments = [];
    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        const localIndex = rowOffset + x;
        if (mask[localIndex] !== 1) continue;
        const topFilled = y > 0 && mask[localIndex - width] === 1;
        const bottomFilled = y < height - 1 && mask[localIndex + width] === 1;
        const leftFilled = x > 0 && mask[localIndex - 1] === 1;
        const rightFilled = x < width - 1 && mask[localIndex + 1] === 1;
        if (!topFilled) {
          segments.push(x, y, x + 1, y);
        }
        if (!bottomFilled) {
          segments.push(x, y + 1, x + 1, y + 1);
        }
        if (!leftFilled) {
          segments.push(x, y, x, y + 1);
        }
        if (!rightFilled) {
          segments.push(x + 1, y, x + 1, y + 1);
        }
      }
    }
    return segments;
  }

  function traceSelectionMoveOutline(pathCtx, outlineSegments, originX, originY, scale) {
    if (!Array.isArray(outlineSegments) || !outlineSegments.length) {
      return;
    }
    for (let i = 0; i < outlineSegments.length; i += 4) {
      const x0 = originX + outlineSegments[i];
      const y0 = originY + outlineSegments[i + 1];
      const x1 = originX + outlineSegments[i + 2];
      const y1 = originY + outlineSegments[i + 3];
      pathCtx.moveTo(scaleSelectionPathX(x0, scale), scaleSelectionPathY(y0, scale));
      pathCtx.lineTo(scaleSelectionPathX(x1, scale), scaleSelectionPathY(y1, scale));
    }
  }

  function getPointerPositionRaw(event, { clampToCanvas = false, surface = null } = {}) {
    const metrics = getCanvasInteractionSurfaceMetrics(surface || event?.target || null);
    const drawingCanvas = metrics.surface?.drawing instanceof HTMLCanvasElement
      ? metrics.surface.drawing
      : dom.canvases.drawing;
    if (!drawingCanvas) {
      return null;
    }
    const rect = drawingCanvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) {
      return null;
    }
    const rawX = ((event.clientX - rect.left) / rect.width) * metrics.width;
    const rawY = ((event.clientY - rect.top) / rect.height) * metrics.height;
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
      return null;
    }
    if (clampToCanvas) {
      return {
        x: clamp(rawX, 0, Math.max(0, metrics.width - 1)),
        y: clamp(rawY, 0, Math.max(0, metrics.height - 1)),
      };
    }
    return { x: rawX, y: rawY };
  }

  function getPointerPosition(event, { clampToCanvas = false, surface = null } = {}) {
    const raw = getPointerPositionRaw(event, { clampToCanvas, surface });
    if (!raw) {
      return null;
    }
    const metrics = getCanvasInteractionSurfaceMetrics(surface || event?.target || null);
    let x = Math.floor(raw.x);
    let y = Math.floor(raw.y);
    if (clampToCanvas) {
      x = clamp(x, 0, Math.max(0, metrics.width - 1));
      y = clamp(y, 0, Math.max(0, metrics.height - 1));
      return { x, y };
    }
    if (x < 0 || y < 0 || x >= metrics.width || y >= metrics.height) return null;
    return { x, y };
  }

  function normalizeSignedAngleDeg(value) {
    let angle = Number(value) || 0;
    angle %= 360;
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;
    return angle;
  }

  function invalidateSelectionMoveTransformCache(moveState) {
    if (!moveState || typeof moveState !== 'object') {
      return;
    }
    moveState.transformedEntryCache = null;
    moveState.transformedContentEntryCache = null;
    moveState.transformedPreviewRenderCache = null;
  }

  function shouldRenderSelectionTransformHandles() {
    if (state.playback.isPlaying) {
      return false;
    }
    const activeTool = pointerState.active ? (pointerState.tool || state.tool) : state.tool;
    const isSelectionContext = activeTool === 'selectionTransform'
      || activeTool === 'selectionMove'
      || activeTool === 'move'
      || activeTool === 'selectRect'
      || activeTool === 'selectLasso'
      || activeTool === 'selectSame';
    if (!isSelectionContext) {
      return false;
    }
    if (
      pointerState.active
      && (
        pointerState.tool === 'selectRect'
        || pointerState.tool === 'selectLasso'
        || pointerState.tool === POINTER_TOOL_CUSTOM_BRUSH_RECT
      )
    ) {
      return false;
    }
    const pendingMove = getPendingSelectionMoveState();
    if (pendingMove && pendingMove.hasCleared) {
      return true;
    }
    return Boolean(state.selectionBounds && selectionMaskHasPixels(state.selectionMask));
  }

  function getSelectionTransformWorldCorners() {
    const pendingMove = getPendingSelectionMoveState();
    if (pendingMove && pendingMove.hasCleared) {
      return getSelectionMoveTransformWorldCorners(pendingMove);
    }
    const bounds = state.selectionBounds;
    if (!bounds || !selectionMaskHasPixels(state.selectionMask)) {
      return null;
    }
    const x0 = clamp(Math.round(Number(bounds.x0) || 0), 0, Math.max(0, state.width - 1));
    const y0 = clamp(Math.round(Number(bounds.y0) || 0), 0, Math.max(0, state.height - 1));
    const x1 = clamp(Math.round(Number(bounds.x1) || 0), 0, Math.max(0, state.width - 1));
    const y1 = clamp(Math.round(Number(bounds.y1) || 0), 0, Math.max(0, state.height - 1));
    return [
      { id: 'nw', worldX: x0, worldY: y0 },
      { id: 'ne', worldX: x1 + 1, worldY: y0 },
      { id: 'se', worldX: x1 + 1, worldY: y1 + 1 },
      { id: 'sw', worldX: x0, worldY: y1 + 1 },
    ];
  }

  function getSelectionMoveTransformWorldCorners(moveState) {
    if (!moveState || !moveState.bounds) {
      return null;
    }
    const width = Math.max(1, Number(moveState.width) || 1);
    const height = Math.max(1, Number(moveState.height) || 1);
    const originX = (Number(moveState.bounds.x0) || 0) + (Number(moveState.offset?.x) || 0);
    const originY = (Number(moveState.bounds.y0) || 0) + (Number(moveState.offset?.y) || 0);
    const transform = getSelectionMoveTransformState(moveState);
    const localCorners = [
      { id: 'nw', x: 0, y: 0 },
      { id: 'ne', x: width, y: 0 },
      { id: 'se', x: width, y: height },
      { id: 'sw', x: 0, y: height },
    ];
    return localCorners.map(corner => {
      const mapped = transformSelectionMoveLocalPoint(corner.x, corner.y, width, height, transform);
      return {
        id: corner.id,
        worldX: originX + mapped.x,
        worldY: originY + mapped.y,
      };
    });
  }

  function getWorldCornerBounds(corners) {
    if (!Array.isArray(corners) || !corners.length) {
      return null;
    }
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < corners.length; i += 1) {
      const corner = corners[i];
      const x = Number(corner?.worldX);
      const y = Number(corner?.worldY);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
      return null;
    }
    return {
      x0,
      y0,
      x1,
      y1,
    };
  }

  function hideSelectionTransformMenu() {
    const menu = dom.controls.selectionTransformMenu;
    if (!(menu instanceof HTMLElement)) {
      selectionTransformUi.hoverHandleId = '';
      selectionTransformUi.menuVisible = false;
      selectionTransformUi.menuHandleId = '';
      selectionTransformUi.menuLocalX = null;
      selectionTransformUi.menuLocalY = null;
      return;
    }
    selectionTransformUi.hoverHandleId = '';
    selectionTransformUi.menuVisible = false;
    selectionTransformUi.menuHandleId = '';
    selectionTransformUi.menuLocalX = null;
    selectionTransformUi.menuLocalY = null;
    menu.classList.add('is-hidden');
    menu.setAttribute('hidden', '');
    menu.setAttribute('aria-hidden', 'true');
  }

  function computeSelectionTransformMenuLocalPosition(viewportRect, menuWidth, menuHeight) {
    const handles = Array.isArray(selectionTransformUi.handles) ? selectionTransformUi.handles : [];
    if (!handles.length) {
      return null;
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < handles.length; i += 1) {
      const handle = handles[i];
      const x = Number(handle?.x);
      const y = Number(handle?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return null;
    }
    const margin = 10;
    const gap = 12;
    const minLocalX = margin;
    const minLocalY = margin;
    const maxLocalX = Math.max(minLocalX, Math.round(viewportRect.width - menuWidth - margin));
    const maxLocalY = Math.max(minLocalY, Math.round(viewportRect.height - menuHeight - margin));
    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;

    const clampCandidate = (candidate) => ({
      x: clamp(Math.round(candidate.x), minLocalX, maxLocalX),
      y: clamp(Math.round(candidate.y), minLocalY, maxLocalY),
    });
    const intersectsSelection = (candidate) => !(
      candidate.x + menuWidth <= minX
      || candidate.x >= maxX
      || candidate.y + menuHeight <= minY
      || candidate.y >= maxY
    );
    const candidates = [
      { x: centerX - (menuWidth * 0.5), y: minY - menuHeight - gap },
      { x: centerX - (menuWidth * 0.5), y: maxY + gap },
      { x: maxX + gap, y: centerY - (menuHeight * 0.5) },
      { x: minX - menuWidth - gap, y: centerY - (menuHeight * 0.5) },
    ].map(clampCandidate);

    let best = candidates.find(candidate => !intersectsSelection(candidate));
    if (!best) {
      best = candidates[0];
    }
    return best || null;
  }

  function showSelectionTransformMenu(handleId = '', { preservePosition = false } = {}) {
    const menu = dom.controls.selectionTransformMenu;
    if (!(menu instanceof HTMLElement)) {
      selectionTransformUi.menuVisible = false;
      selectionTransformUi.menuHandleId = '';
      selectionTransformUi.menuLocalX = null;
      selectionTransformUi.menuLocalY = null;
      return;
    }
    selectionTransformUi.menuVisible = true;
    selectionTransformUi.menuHandleId = typeof handleId === 'string' ? handleId : '';
    menu.classList.remove('is-hidden');
    menu.removeAttribute('hidden');
    menu.setAttribute('aria-hidden', 'false');
    if (!preservePosition) {
      selectionTransformUi.menuLocalX = null;
      selectionTransformUi.menuLocalY = null;
    }
    positionSelectionTransformMenu({ recompute: !preservePosition });
  }

  function positionSelectionTransformMenu({ recompute = false } = {}) {
    if (!selectionTransformUi.menuVisible) {
      return;
    }
    const menu = dom.controls.selectionTransformMenu;
    const viewport = dom.canvasViewport;
    if (!(menu instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    if (!(viewportRect.width > 0) || !(viewportRect.height > 0)) {
      return;
    }
    const menuWidth = menu.offsetWidth || 188;
    const menuHeight = menu.offsetHeight || 54;
    const margin = 10;
    const minX = margin;
    const minY = margin;
    const maxX = Math.max(minX, Math.round(viewportRect.width - menuWidth - margin));
    const maxY = Math.max(minY, Math.round(viewportRect.height - menuHeight - margin));
    const needsCompute = recompute
      || !Number.isFinite(selectionTransformUi.menuLocalX)
      || !Number.isFinite(selectionTransformUi.menuLocalY);
    if (needsCompute) {
      const computed = computeSelectionTransformMenuLocalPosition(viewportRect, menuWidth, menuHeight);
      if (computed) {
        selectionTransformUi.menuLocalX = computed.x;
        selectionTransformUi.menuLocalY = computed.y;
      } else {
        selectionTransformUi.menuLocalX = minX;
        selectionTransformUi.menuLocalY = minY;
      }
    }
    const x = clamp(Math.round(Number(selectionTransformUi.menuLocalX) || minX), minX, maxX);
    const y = clamp(Math.round(Number(selectionTransformUi.menuLocalY) || minY), minY, maxY);
    selectionTransformUi.menuLocalX = x;
    selectionTransformUi.menuLocalY = y;
    menu.style.setProperty('--selection-transform-menu-x', `${Math.round(viewportRect.left + x)}px`);
    menu.style.setProperty('--selection-transform-menu-y', `${Math.round(viewportRect.top + y)}px`);
  }

  function drawSelectionTransformHandles() {
    if (!shouldRenderSelectionTransformHandles() || !ctx.virtual) {
      selectionTransformUi.handles = [];
      selectionTransformUi.hoverHandleId = '';
      if (!ctx.virtual || !shouldRenderSelectionTransformHandles()) {
        hideSelectionTransformMenu();
      }
      return;
    }
    const worldCorners = getSelectionTransformWorldCorners();
    const metrics = getCanvasScreenMetrics();
    if (!Array.isArray(worldCorners) || worldCorners.length < 4 || !metrics) {
      selectionTransformUi.handles = [];
      selectionTransformUi.hoverHandleId = '';
      hideSelectionTransformMenu();
      return;
    }
    const unitX = metrics.width / Math.max(1, Number(state.width) || 1);
    const unitY = metrics.height / Math.max(1, Number(state.height) || 1);
    const bounds = getWorldCornerBounds(worldCorners);
    if (!bounds) {
      selectionTransformUi.handles = [];
      selectionTransformUi.hoverHandleId = '';
      hideSelectionTransformMenu();
      return;
    }
    const handles = worldCorners.map(corner => ({
      id: corner.id,
      x: metrics.left + (corner.worldX * unitX),
      y: metrics.top + (corner.worldY * unitY),
      hitRadius: SELECTION_TRANSFORM_HANDLE_HIT_RADIUS_PX,
    }));
    selectionTransformUi.handles = handles;

    const dpr = window.devicePixelRatio || 1;
    ctx.virtual.save();
    ctx.virtual.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < handles.length; i += 1) {
      const handle = handles[i];
      const isActive = selectionTransformUi.interaction?.handleId === handle.id;
      const isHovered = !isActive && selectionTransformUi.hoverHandleId === handle.id;
      const size = (SELECTION_TRANSFORM_HANDLE_DRAW_RADIUS_PX * 2) + (isActive ? 2 : (isHovered ? 1 : 0));
      const drawRect = getSelectionTransformHandleDrawRect(handle.id, handle.x, handle.y, size);
      if (!drawRect) {
        continue;
      }
      ctx.virtual.save();
      if (isHovered) {
        ctx.virtual.shadowColor = 'rgba(255, 218, 118, 0.72)';
        ctx.virtual.shadowBlur = 10;
      }
      ctx.virtual.fillStyle = isActive
        ? 'rgba(255, 124, 124, 0.95)'
        : (isHovered ? 'rgba(255, 218, 118, 0.98)' : 'rgba(88, 196, 255, 0.95)');
      ctx.virtual.fillRect(drawRect.left, drawRect.top, size, size);
      ctx.virtual.lineWidth = 2;
      ctx.virtual.strokeStyle = isHovered ? 'rgba(39, 22, 4, 0.96)' : 'rgba(8, 14, 20, 0.95)';
      ctx.virtual.strokeRect(drawRect.left, drawRect.top, size, size);
      ctx.virtual.restore();
    }
    ctx.virtual.lineWidth = 1;
    ctx.virtual.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.virtual.beginPath();
    const cornersById = new Map(worldCorners.map(corner => [corner.id, corner]));
    const order = ['nw', 'ne', 'se', 'sw'];
    for (let i = 0; i < order.length; i += 1) {
      const current = cornersById.get(order[i]);
      const next = cornersById.get(order[(i + 1) % order.length]);
      if (!current || !next) {
        continue;
      }
      const x0 = metrics.left + (current.worldX * unitX);
      const y0 = metrics.top + (current.worldY * unitY);
      const x1 = metrics.left + (next.worldX * unitX);
      const y1 = metrics.top + (next.worldY * unitY);
      ctx.virtual.moveTo(x0, y0);
      ctx.virtual.lineTo(x1, y1);
    }
    ctx.virtual.stroke();
    ctx.virtual.restore();
    positionSelectionTransformMenu();
  }

  function getSelectionTransformHandleDrawRect(handleId, anchorX, anchorY, size) {
    if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY) || !Number.isFinite(size) || size <= 0) {
      return null;
    }
    const normalizedId = String(handleId || '').toLowerCase();
    const pxSize = Math.max(2, Math.round(size));
    // Place handles outside the selection. The handle corner matches selection corner.
    // nw: bottom-right, ne: bottom-left, se: top-left, sw: top-right.
    switch (normalizedId) {
      case 'nw':
        return { left: anchorX - pxSize, top: anchorY - pxSize, size: pxSize };
      case 'ne':
        return { left: anchorX, top: anchorY - pxSize, size: pxSize };
      case 'se':
        return { left: anchorX, top: anchorY, size: pxSize };
      case 'sw':
        return { left: anchorX - pxSize, top: anchorY, size: pxSize };
      default:
        return {
          left: anchorX - (pxSize / 2),
          top: anchorY - (pxSize / 2),
          size: pxSize,
        };
    }
  }

  function getSelectionTransformHandleHit(clientX, clientY) {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !Array.isArray(selectionTransformUi.handles)) {
      return null;
    }
    const viewport = dom.canvasViewport;
    if (!(viewport instanceof HTMLElement)) {
      return null;
    }
    const rect = viewport.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    for (let i = selectionTransformUi.handles.length - 1; i >= 0; i -= 1) {
      const handle = selectionTransformUi.handles[i];
      const baseSize = SELECTION_TRANSFORM_HANDLE_DRAW_RADIUS_PX * 2;
      const drawRect = getSelectionTransformHandleDrawRect(handle.id, handle.x, handle.y, baseSize);
      if (!drawRect) {
        continue;
      }
      const radius = Math.max(0, Number(handle.hitRadius) || SELECTION_TRANSFORM_HANDLE_HIT_RADIUS_PX);
      const hitPadding = Math.max(0, Math.round(radius - (drawRect.size * 0.5)));
      const hitLeft = drawRect.left - hitPadding;
      const hitTop = drawRect.top - hitPadding;
      const hitRight = drawRect.left + drawRect.size + hitPadding;
      const hitBottom = drawRect.top + drawRect.size + hitPadding;
      if (localX >= hitLeft && localX <= hitRight && localY >= hitTop && localY <= hitBottom) {
        return handle;
      }
    }
    return null;
  }

  function setSelectionTransformHoverHandle(handleId = '') {
    const nextHandleId = typeof handleId === 'string' ? handleId : '';
    if (selectionTransformUi.hoverHandleId === nextHandleId) {
      return false;
    }
    selectionTransformUi.hoverHandleId = nextHandleId;
    return true;
  }

  function updateSelectionTransformHandleHover(clientX, clientY) {
    if (pointerState.active || selectionTransformUi.interaction) {
      return setSelectionTransformHoverHandle('');
    }
    if (!shouldRenderSelectionTransformHandles()) {
      return setSelectionTransformHoverHandle('');
    }
    const hit = getSelectionTransformHandleHit(clientX, clientY);
    return setSelectionTransformHoverHandle(hit?.id || '');
  }

  function getSelectionMoveTransformCenter(moveState) {
    if (!moveState || !moveState.bounds) {
      return null;
    }
    const offsetX = Number(moveState.offset?.x) || 0;
    const offsetY = Number(moveState.offset?.y) || 0;
    const width = Math.max(1, Number(moveState.width) || 1);
    const height = Math.max(1, Number(moveState.height) || 1);
    return {
      x: (Number(moveState.bounds.x0) || 0) + offsetX + (width / 2),
      y: (Number(moveState.bounds.y0) || 0) + offsetY + (height / 2),
    };
  }

  function getSelectionTransformOppositeCornerId(handleId = '') {
    switch (String(handleId || '').toLowerCase()) {
      case 'nw':
        return 'se';
      case 'ne':
        return 'sw';
      case 'se':
        return 'nw';
      case 'sw':
        return 'ne';
      default:
        return '';
    }
  }

  function getSelectionTransformCornerLocalPoint(cornerId, width, height) {
    const safeWidth = Math.max(1, Number(width) || 1);
    const safeHeight = Math.max(1, Number(height) || 1);
    switch (String(cornerId || '').toLowerCase()) {
      case 'nw':
        return { x: 0, y: 0 };
      case 'ne':
        return { x: safeWidth, y: 0 };
      case 'se':
        return { x: safeWidth, y: safeHeight };
      case 'sw':
        return { x: 0, y: safeHeight };
      default:
        return null;
    }
  }

  function getSelectionTransformVectorInResizeSpace(vectorX, vectorY, transform) {
    let dx = Number(vectorX) || 0;
    let dy = Number(vectorY) || 0;
    const rotationDeg = normalizeSelectionMoveRotationDeg(transform?.rotationDeg);
    if (rotationDeg !== 0) {
      const rad = (-rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const nextDx = (dx * cos) - (dy * sin);
      const nextDy = (dx * sin) + (dy * cos);
      dx = nextDx;
      dy = nextDy;
    }
    if (transform?.flipHorizontal) {
      dx = -dx;
    }
    if (transform?.flipVertical) {
      dy = -dy;
    }
    return { x: dx, y: dy };
  }

  function getSelectionTransformResizeAnchorSnapshot(moveState, handleId, raw, transform) {
    if (!moveState || !moveState.bounds || !raw) {
      return null;
    }
    const fixedCornerId = getSelectionTransformOppositeCornerId(handleId);
    if (!fixedCornerId) {
      return null;
    }
    const width = Math.max(1, Number(moveState.width) || 1);
    const height = Math.max(1, Number(moveState.height) || 1);
    const fixedLocal = getSelectionTransformCornerLocalPoint(fixedCornerId, width, height);
    if (!fixedLocal) {
      return null;
    }
    const originX = (Number(moveState.bounds.x0) || 0) + (Number(moveState.offset?.x) || 0);
    const originY = (Number(moveState.bounds.y0) || 0) + (Number(moveState.offset?.y) || 0);
    const mappedFixed = transformSelectionMoveLocalPoint(fixedLocal.x, fixedLocal.y, width, height, transform);
    const fixedWorldX = originX + mappedFixed.x;
    const fixedWorldY = originY + mappedFixed.y;
    const startVector = getSelectionTransformVectorInResizeSpace(
      (Number(raw.x) || 0) - fixedWorldX,
      (Number(raw.y) || 0) - fixedWorldY,
      transform
    );
    return {
      fixedCornerId,
      fixedLocalX: fixedLocal.x,
      fixedLocalY: fixedLocal.y,
      fixedWorldX,
      fixedWorldY,
      startVectorX: startVector.x,
      startVectorY: startVector.y,
    };
  }

  function ensureSelectionMoveForTransform() {
    const pendingMove = getPendingSelectionMoveState();
    if (pendingMove && pendingMove.hasCleared) {
      return pendingMove;
    }
    const mask = state.selectionMask;
    const bounds = state.selectionBounds;
    const layer = getActiveLayer();
    if (!mask || !bounds || !layer || !selectionMaskHasPixels(mask)) {
      return null;
    }
    const moveState = createSelectionMoveState(layer, bounds, mask, state.selectionContentMask);
    if (!moveState) {
      return null;
    }
    beginHistory('selectionTransform');
    clearSelectionSourcePixels(moveState);
    return moveState.hasCleared ? moveState : null;
  }

  function beginSelectionTransformInteraction(event, position, handle, surface = null) {
    if (!dom.canvases.drawing || !handle) {
      return false;
    }
    const moveState = ensureSelectionMoveForTransform();
    if (!moveState) {
      return false;
    }
    pointerState.surface = getResolvedCanvasInteractionSurface(surface || event?.target || null);
    const drawCanvas = dom.canvases.drawing;
    const pointerId = event.pointerId;
    try {
      drawCanvas.setPointerCapture(pointerId);
    } catch (error) {
      // Ignore pointer capture errors.
    }
    pointerState.active = true;
    pointerState.pointerId = pointerId;
    pointerState.tool = 'selectionTransform';
    pointerState.start = position ? { ...position } : null;
    pointerState.current = position ? { ...position } : null;
    pointerState.last = position ? { ...position } : null;
    pointerState.path = position ? [{ ...position }] : [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = moveState;
    pointerState.drawPaletteIndex = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionExtendOnDown = false;

    const raw = getPointerPositionRaw(event, { clampToCanvas: false, surface: pointerState.surface });
    const center = getSelectionMoveTransformCenter(moveState);
    const transform = getSelectionMoveTransformState(moveState);
    const startAngleDeg = raw && center
      ? (Math.atan2(raw.y - center.y, raw.x - center.x) * 180 / Math.PI)
      : 0;
    const startDistance = raw && center ? Math.hypot(raw.x - center.x, raw.y - center.y) : 0;
    const startLocal = raw && center
      ? getSelectionTransformPointerLocalVector(raw, center, transform)
      : { x: 0, y: 0 };
    const resizeAnchor = getSelectionTransformResizeAnchorSnapshot(moveState, handle.id, raw, transform);
    selectionTransformUi.interaction = {
      handleId: handle.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startRotationDeg: transform.rotationDeg,
      startScaleX: transform.scaleX,
      startScaleY: transform.scaleY,
      accumulatedDeg: 0,
      lastAngleDeg: startAngleDeg,
      startAngleDeg,
      startDistance,
      startLocalX: startLocal.x,
      startLocalY: startLocal.y,
      resizeFixedCornerId: resizeAnchor?.fixedCornerId || '',
      resizeFixedLocalX: resizeAnchor?.fixedLocalX ?? null,
      resizeFixedLocalY: resizeAnchor?.fixedLocalY ?? null,
      resizeFixedWorldX: resizeAnchor?.fixedWorldX ?? null,
      resizeFixedWorldY: resizeAnchor?.fixedWorldY ?? null,
      resizeStartVectorX: resizeAnchor?.startVectorX ?? null,
      resizeStartVectorY: resizeAnchor?.startVectorY ?? null,
      mode: event.altKey ? 'rotate' : 'pending',
      moved: false,
    };
    showSelectionTransformMenu(handle.id);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    requestOverlayRender();
    return true;
  }

  function getSelectionTransformPointerLocalVector(raw, center, transform) {
    if (!raw || !center) {
      return { x: 0, y: 0 };
    }
    let dx = (Number(raw.x) || 0) - (Number(center.x) || 0);
    let dy = (Number(raw.y) || 0) - (Number(center.y) || 0);
    const rotationDeg = normalizeSelectionMoveRotationDeg(transform?.rotationDeg);
    if (rotationDeg !== 0) {
      const rad = (-rotationDeg * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const nextDx = (dx * cos) - (dy * sin);
      const nextDy = (dx * sin) + (dy * cos);
      dx = nextDx;
      dy = nextDy;
    }
    if (transform?.flipHorizontal) {
      dx = -dx;
    }
    if (transform?.flipVertical) {
      dy = -dy;
    }
    return { x: dx, y: dy };
  }

  function resolveSelectionTransformInteractionMode(interaction, raw, center, event = null) {
    if (!interaction || !raw || !center) {
      return 'rotate';
    }
    if (interaction.mode === 'rotate' || interaction.mode === 'resize') {
      return interaction.mode;
    }
    let radialDelta = 0;
    let angularPixels = 0;
    let deadzone = SELECTION_TRANSFORM_MODE_DEADZONE_CELLS;
    let useDirectionalProjection = false;
    let resizeProjection = 0;
    let rotateProjection = 0;
    const metrics = event ? getCanvasScreenMetrics() : null;
    if (metrics && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      const unitX = metrics.width / Math.max(1, Number(state.width) || 1);
      const unitY = metrics.height / Math.max(1, Number(state.height) || 1);
      const centerClientX = metrics.viewportRect.left + metrics.left + ((Number(center.x) || 0) * unitX);
      const centerClientY = metrics.viewportRect.top + metrics.top + ((Number(center.y) || 0) * unitY);
      const startDx = (Number(interaction.startClientX) || 0) - centerClientX;
      const startDy = (Number(interaction.startClientY) || 0) - centerClientY;
      const currentDx = event.clientX - centerClientX;
      const currentDy = event.clientY - centerClientY;
      const startDistance = Math.hypot(startDx, startDy);
      const currentDistance = Math.hypot(currentDx, currentDy);
      radialDelta = Math.abs(currentDistance - startDistance);
      const angleDelta = Math.abs(normalizeSignedAngleDeg(
        (Math.atan2(currentDy, currentDx) * 180 / Math.PI)
        - (Math.atan2(startDy, startDx) * 180 / Math.PI)
      ));
      angularPixels = currentDistance * Math.sin(Math.min(Math.PI / 2, angleDelta * Math.PI / 180));
      if (startDistance > 0.001) {
        const resizeUnitX = startDx / startDistance;
        const resizeUnitY = startDy / startDistance;
        const rotateUnitX = -resizeUnitY;
        const rotateUnitY = resizeUnitX;
        const deltaX = event.clientX - (Number(interaction.startClientX) || 0);
        const deltaY = event.clientY - (Number(interaction.startClientY) || 0);
        resizeProjection = Math.abs((deltaX * resizeUnitX) + (deltaY * resizeUnitY));
        rotateProjection = Math.abs((deltaX * rotateUnitX) + (deltaY * rotateUnitY));
        radialDelta = resizeProjection;
        angularPixels = rotateProjection;
        useDirectionalProjection = true;
      }
      deadzone = SELECTION_TRANSFORM_MODE_DEADZONE_PX;
    } else {
      const currentDistance = Math.hypot(raw.x - center.x, raw.y - center.y);
      radialDelta = Math.abs(currentDistance - (Number(interaction.startDistance) || 0));
      const angleDelta = Math.abs(normalizeSignedAngleDeg(
        (Math.atan2(raw.y - center.y, raw.x - center.x) * 180 / Math.PI)
        - (Number(interaction.startAngleDeg) || 0)
      ));
      angularPixels = currentDistance * Math.sin(Math.min(Math.PI / 2, angleDelta * Math.PI / 180));
    }
    if (radialDelta >= deadzone || angularPixels >= deadzone) {
      if (useDirectionalProjection) {
        interaction.mode = rotateProjection > resizeProjection * SELECTION_TRANSFORM_MODE_DIRECTION_BIAS
          ? 'rotate'
          : 'resize';
      } else {
        interaction.mode = angularPixels > radialDelta * 1.25 ? 'rotate' : 'resize';
      }
    }
    return interaction.mode;
  }

  function updateSelectionTransformResizeFromPointer(moveState, interaction, raw, center, event) {
    if (!moveState || !interaction || !raw || !center) {
      return false;
    }
    const transform = getSelectionMoveTransformState(moveState);
    let nextScaleX = normalizeSelectionMoveScale(interaction.startScaleX);
    let nextScaleY = normalizeSelectionMoveScale(interaction.startScaleY);
    let anchoredResize = false;
    const fixedWorldX = Number(interaction.resizeFixedWorldX);
    const fixedWorldY = Number(interaction.resizeFixedWorldY);
    const startVectorX = Number(interaction.resizeStartVectorX);
    const startVectorY = Number(interaction.resizeStartVectorY);
    if (
      Number.isFinite(fixedWorldX)
      && Number.isFinite(fixedWorldY)
      && Number.isFinite(startVectorX)
      && Number.isFinite(startVectorY)
    ) {
      const vector = getSelectionTransformVectorInResizeSpace(
        (Number(raw.x) || 0) - fixedWorldX,
        (Number(raw.y) || 0) - fixedWorldY,
        {
          rotationDeg: interaction.startRotationDeg,
          flipHorizontal: transform.flipHorizontal,
          flipVertical: transform.flipVertical,
        }
      );
      if (Math.abs(startVectorX) >= 0.5) {
        nextScaleX = normalizeSelectionMoveScale(
          normalizeSelectionMoveScale(interaction.startScaleX) * (Math.abs(vector.x) / Math.abs(startVectorX))
        );
        anchoredResize = true;
      }
      if (Math.abs(startVectorY) >= 0.5) {
        nextScaleY = normalizeSelectionMoveScale(
          normalizeSelectionMoveScale(interaction.startScaleY) * (Math.abs(vector.y) / Math.abs(startVectorY))
        );
        anchoredResize = true;
      }
    }
    if (!anchoredResize) {
      const local = getSelectionTransformPointerLocalVector(raw, center, transform);
      const startLocalX = Number(interaction.startLocalX) || 0;
      const startLocalY = Number(interaction.startLocalY) || 0;
      if (Math.abs(startLocalX) >= 0.5) {
        nextScaleX = normalizeSelectionMoveScale(nextScaleX * (Math.abs(local.x) / Math.abs(startLocalX)));
      }
      if (Math.abs(startLocalY) >= 0.5) {
        nextScaleY = normalizeSelectionMoveScale(nextScaleY * (Math.abs(local.y) / Math.abs(startLocalY)));
      }
    }
    if (event?.shiftKey) {
      const uniform = normalizeSelectionMoveScale(Math.max(nextScaleX, nextScaleY));
      nextScaleX = uniform;
      nextScaleY = uniform;
    }
    let nextOffsetX = Number(moveState.offset?.x) || 0;
    let nextOffsetY = Number(moveState.offset?.y) || 0;
    if (anchoredResize) {
      const fixedLocalX = Number(interaction.resizeFixedLocalX);
      const fixedLocalY = Number(interaction.resizeFixedLocalY);
      if (Number.isFinite(fixedLocalX) && Number.isFinite(fixedLocalY)) {
        const width = Math.max(1, Number(moveState.width) || 1);
        const height = Math.max(1, Number(moveState.height) || 1);
        const mappedFixed = transformSelectionMoveLocalPoint(
          fixedLocalX,
          fixedLocalY,
          width,
          height,
          {
            rotationDeg: transform.rotationDeg,
            flipHorizontal: transform.flipHorizontal,
            flipVertical: transform.flipVertical,
            scaleX: nextScaleX,
            scaleY: nextScaleY,
          }
        );
        nextOffsetX = Math.round(fixedWorldX - (Number(moveState.bounds?.x0) || 0) - mappedFixed.x);
        nextOffsetY = Math.round(fixedWorldY - (Number(moveState.bounds?.y0) || 0) - mappedFixed.y);
      }
    }
    const currentOffsetX = Number(moveState.offset?.x) || 0;
    const currentOffsetY = Number(moveState.offset?.y) || 0;
    const changed = Math.abs(nextScaleX - normalizeSelectionMoveScale(moveState.transformScaleX)) > SELECTION_TRANSFORM_SCALE_EPSILON
      || Math.abs(nextScaleY - normalizeSelectionMoveScale(moveState.transformScaleY)) > SELECTION_TRANSFORM_SCALE_EPSILON
      || nextOffsetX !== currentOffsetX
      || nextOffsetY !== currentOffsetY;
    if (!changed) {
      return false;
    }
    moveState.transformScaleX = nextScaleX;
    moveState.transformScaleY = nextScaleY;
    if (!moveState.offset || typeof moveState.offset !== 'object') {
      moveState.offset = { x: 0, y: 0 };
    }
    moveState.offset.x = nextOffsetX;
    moveState.offset.y = nextOffsetY;
    invalidateSelectionMoveTransformCache(moveState);
    return true;
  }

  function handleSelectionTransformDrag(event) {
    const interaction = selectionTransformUi.interaction;
    const moveState = pointerState.selectionMove;
    if (!interaction || !moveState) {
      return;
    }
    const raw = getPointerPositionRaw(event, { clampToCanvas: false, surface: pointerState.surface });
    const center = getSelectionMoveTransformCenter(moveState);
    if (raw && center) {
      const angleDeg = Math.atan2(raw.y - center.y, raw.x - center.x) * 180 / Math.PI;
      const mode = event.altKey ? 'rotate' : resolveSelectionTransformInteractionMode(interaction, raw, center, event);
      if (mode === 'resize') {
        if (updateSelectionTransformResizeFromPointer(moveState, interaction, raw, center, event)) {
          requestOverlayRender();
        }
      } else if (mode === 'rotate') {
        const delta = normalizeSignedAngleDeg(angleDeg - interaction.lastAngleDeg);
        interaction.accumulatedDeg += delta;
        interaction.lastAngleDeg = angleDeg;
        const snappedDelta = Math.round(interaction.accumulatedDeg / SELECTION_TRANSFORM_ROTATION_STEP_DEG) * SELECTION_TRANSFORM_ROTATION_STEP_DEG;
        const nextRotation = normalizeSelectionMoveRotationDeg(interaction.startRotationDeg + snappedDelta);
        if (nextRotation !== normalizeSelectionMoveRotationDeg(moveState.transformRotationDeg)) {
          moveState.transformRotationDeg = nextRotation;
          invalidateSelectionMoveTransformCache(moveState);
          requestOverlayRender();
        }
      }
      if (mode !== 'rotate') {
        interaction.lastAngleDeg = angleDeg;
      }
      if (mode === 'resize' && (selectionTransformUi.menuVisible || !interaction.moved)) {
        requestOverlayRender();
      }
      pointerState.current = { x: Math.floor(raw.x), y: Math.floor(raw.y) };
      pointerState.last = { ...pointerState.current };
    }
    const dragDistance = Math.hypot(
      event.clientX - interaction.startClientX,
      event.clientY - interaction.startClientY
    );
    if (!interaction.moved && dragDistance >= SELECTION_TRANSFORM_DRAG_THRESHOLD_PX) {
      interaction.moved = true;
      hideSelectionTransformMenu();
    }
  }

  function completeSelectionTransformInteraction(event, { cancel = false } = {}) {
    const moveState = pointerState.selectionMove;
    const interaction = selectionTransformUi.interaction;
    const surface = pointerState.surface;
    selectionTransformUi.interaction = null;
    detachPointerListeners();
    const captureCanvas = pointerState.surface?.drawing || dom.canvases.drawing;
    if (captureCanvas && Number.isFinite(pointerState.pointerId)) {
      try {
        captureCanvas.releasePointerCapture(pointerState.pointerId);
      } catch (error) {
        // Ignore pointer capture release errors.
      }
    }
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.path = [];
    pointerState.drawPaletteIndex = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.selectionExtendOnDown = false;
    pointerState.tool = state.tool;
    pointerState.selectionMove = null;

    if (moveState && moveState.hasCleared) {
      const hover = event ? getPointerPosition(event, { clampToCanvas: true, surface }) : null;
      promotePendingSelectionMove(moveState, { hover });
      scheduleSessionPersist();
    }
    pointerState.surface = null;

    if (cancel || !interaction || interaction.moved) {
      hideSelectionTransformMenu();
    } else {
      showSelectionTransformMenu(interaction.handleId || '');
    }
    requestOverlayRender();
  }

  function toggleSelectionMoveFlip(axis) {
    if (state.playback.isPlaying) {
      return false;
    }
    if (isMultiSpectatorMode()) {
      setMultiStatus(localizeText('視聴モードでは描画できません', 'Drawing is disabled in viewer mode'), 'warn');
      return false;
    }
    if (isMultiAssignedCellRestrictedEditorMode() && !enforceGuestAssignedLayerSelection({ announce: true })) {
      return false;
    }
    const moveState = ensureSelectionMoveForTransform();
    if (!moveState) {
      updateAutosaveStatus(localizeText('反転するには範囲選択が必要です', 'Selection is required to flip'), 'warn');
      return false;
    }
    if (axis === 'horizontal') {
      moveState.transformFlipHorizontal = !Boolean(moveState.transformFlipHorizontal);
    } else if (axis === 'vertical') {
      moveState.transformFlipVertical = !Boolean(moveState.transformFlipVertical);
    } else {
      return false;
    }
    invalidateSelectionMoveTransformCache(moveState);
    const hover = getVirtualCursorCellPosition() || pointerState.current || null;
    promotePendingSelectionMove(moveState, { hover });
    showSelectionTransformMenu(selectionTransformUi.menuHandleId || 'se', { preservePosition: true });
    requestOverlayRender();
    scheduleSessionPersist();
    return true;
  }

  function applyBrushStroke(x0, y0, x1, y1) {
    const layer = getActiveLayer();
    if (!layer) return;
    const points = bresenhamLine(x0, y0, x1, y1);
    points.forEach(point => stampBrush(layer, point.x, point.y));
    requestRender();
  }

  function resolveDrawPaletteIndex(paletteIndexOverride) {
    if (Number.isFinite(paletteIndexOverride)) {
      return normalizePaletteIndex(paletteIndexOverride, state.activePaletteIndex);
    }
    if (
      Number.isFinite(pointerState.drawPaletteIndex)
      && (pointerState.active || HISTORY_DRAW_TOOLS.has(pointerState.tool))
    ) {
      return normalizePaletteIndex(pointerState.drawPaletteIndex, state.activePaletteIndex);
    }
    return normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
  }


  function normalizeSelectionBoundsForState(bounds) {
    if (!bounds || typeof bounds !== 'object') {
      return null;
    }
    const width = Math.max(0, Number(state.width) || 0);
    const height = Math.max(0, Number(state.height) || 0);
    if (width <= 0 || height <= 0) {
      return null;
    }
    const x0 = clamp(Math.round(Number(bounds.x0) || 0), 0, width - 1);
    const y0 = clamp(Math.round(Number(bounds.y0) || 0), 0, height - 1);
    const x1 = clamp(Math.round(Number(bounds.x1) || 0), 0, width - 1);
    const y1 = clamp(Math.round(Number(bounds.y1) || 0), 0, height - 1);
    if (x0 > x1 || y0 > y1) {
      return null;
    }
    return { x0, y0, x1, y1 };
  }

  function computeSelectionBoundsFromMask(mask) {
    if (!(mask instanceof Uint8Array)) {
      return null;
    }
    const width = Math.max(0, Number(state.width) || 0);
    const height = Math.max(0, Number(state.height) || 0);
    if (width <= 0 || height <= 0 || mask.length < width * height) {
      return null;
    }
    const bounds = { x0: width, y0: height, x1: -1, y1: -1 };
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (mask[idx] !== 1) {
          continue;
        }
        if (x < bounds.x0) bounds.x0 = x;
        if (y < bounds.y0) bounds.y0 = y;
        if (x > bounds.x1) bounds.x1 = x;
        if (y > bounds.y1) bounds.y1 = y;
      }
    }
    if (bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
      return null;
    }
    return bounds;
  }

  function createSelectionAccumulator(options = {}) {
    const { append = false } = options || {};
    const pixelCount = Math.max(0, Number(state.width) || 0) * Math.max(0, Number(state.height) || 0);
    const hasBaseSelection = Boolean(
      append
      && state.selectionMask instanceof Uint8Array
      && state.selectionMask.length === pixelCount
      && selectionMaskHasPixels(state.selectionMask)
    );
    const mask = hasBaseSelection ? new Uint8Array(state.selectionMask) : new Uint8Array(pixelCount);
    let bounds = null;
    if (hasBaseSelection) {
      bounds = normalizeSelectionBoundsForState(state.selectionBounds) || computeSelectionBoundsFromMask(mask);
    }
    if (!bounds) {
      bounds = {
        x0: Math.max(0, Number(state.width) || 0),
        y0: Math.max(0, Number(state.height) || 0),
        x1: -1,
        y1: -1,
      };
    }
    return { mask, bounds, hasBaseSelection };
  }

  function getSelectionGridCellFromPosition(position, cellSize = SELECT_RECT_GRID_CELL_SIZE) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return null;
    }
    const safeCellSize = Math.max(1, Math.floor(Number(cellSize) || 1));
    const width = Math.max(1, Number(state.width) || 1);
    const height = Math.max(1, Number(state.height) || 1);
    const maxCellX = Math.max(0, Math.ceil(width / safeCellSize) - 1);
    const maxCellY = Math.max(0, Math.ceil(height / safeCellSize) - 1);
    const x = clamp(Math.floor(position.x / safeCellSize), 0, maxCellX);
    const y = clamp(Math.floor(position.y / safeCellSize), 0, maxCellY);
    return { x, y };
  }

  function getSelectionGridCellBounds(cell, cellSize = SELECT_RECT_GRID_CELL_SIZE) {
    if (!cell || !Number.isFinite(cell.x) || !Number.isFinite(cell.y)) {
      return null;
    }
    const safeCellSize = Math.max(1, Math.floor(Number(cellSize) || 1));
    const width = Math.max(1, Number(state.width) || 1);
    const height = Math.max(1, Number(state.height) || 1);
    const x0 = clamp(Math.floor(cell.x) * safeCellSize, 0, width - 1);
    const y0 = clamp(Math.floor(cell.y) * safeCellSize, 0, height - 1);
    const x1 = clamp(x0 + safeCellSize - 1, 0, width - 1);
    const y1 = clamp(y0 + safeCellSize - 1, 0, height - 1);
    return { x0, y0, x1, y1 };
  }

  function detectSelectRectGridDoubleTap(position) {
    const cell = getSelectionGridCellFromPosition(position, SELECT_RECT_GRID_CELL_SIZE);
    if (!cell) {
      return { enabled: false, cell: null };
    }
    const now = performance.now();
    const elapsed = now - (Number(selectRectGridTapState.lastTapAt) || 0);
    const sameCell = (
      cell.x === selectRectGridTapState.lastTapCellX
      && cell.y === selectRectGridTapState.lastTapCellY
    );
    const enabled = elapsed >= 0 && elapsed <= SELECT_RECT_GRID_DOUBLE_TAP_MS && sameCell;
    selectRectGridTapState.lastTapAt = now;
    selectRectGridTapState.lastTapCellX = cell.x;
    selectRectGridTapState.lastTapCellY = cell.y;
    return { enabled, cell };
  }

  function getSelectionGridRectPixelBounds(startCell, endCell, cellSize = SELECT_RECT_GRID_CELL_SIZE) {
    if (!startCell || !endCell) {
      return null;
    }
    const startBounds = getSelectionGridCellBounds(startCell, cellSize);
    const endBounds = getSelectionGridCellBounds(endCell, cellSize);
    if (!startBounds || !endBounds) {
      return null;
    }
    return {
      x0: Math.min(startBounds.x0, endBounds.x0),
      y0: Math.min(startBounds.y0, endBounds.y0),
      x1: Math.max(startBounds.x1, endBounds.x1),
      y1: Math.max(startBounds.y1, endBounds.y1),
    };
  }

  function updateSelectionGridRectPreview(preview, startCell, endCell) {
    if (!preview) {
      return;
    }
    const bounds = getSelectionGridRectPixelBounds(
      startCell,
      endCell,
      preview.gridCellSize || SELECT_RECT_GRID_CELL_SIZE
    );
    if (!bounds) {
      return;
    }
    preview.start = { x: bounds.x0, y: bounds.y0 };
    preview.end = { x: bounds.x1, y: bounds.y1 };
  }

  function markSelectionMaskPixel(mask, bounds, x, y) {
    const idx = y * state.width + x;
    mask[idx] = 1;
    if (x < bounds.x0) bounds.x0 = x;
    if (y < bounds.y0) bounds.y0 = y;
    if (x > bounds.x1) bounds.x1 = x;
    if (y > bounds.y1) bounds.y1 = y;
  }

  function shouldIncludeShapeSelectionPixel(layer, x, y, selectionShapeMode = state.selectionShapeMode) {
    const normalizedMode = normalizeSelectionShapeMode(selectionShapeMode, state.selectionShapeMode);
    if (normalizedMode === SELECTION_SHAPE_MODE_SHAPE) {
      return true;
    }
    return layerHasDrawablePixel(layer, x, y);
  }

  function createSelectionByGridRect(startCell, endCell, options = {}) {
    const {
      append = false,
      cellSize = SELECT_RECT_GRID_CELL_SIZE,
      selectionShapeMode = state.selectionShapeMode,
    } = options || {};
    const boundsRect = getSelectionGridRectPixelBounds(startCell, endCell, cellSize);
    if (!boundsRect) {
      if (!append) {
        clearSelection();
      }
      return;
    }
    const layer = getActiveLayer();
    if (!layer) {
      if (!append) {
        clearSelection();
      }
      return;
    }
    const { mask, bounds, hasBaseSelection } = createSelectionAccumulator({ append });
    for (let y = boundsRect.y0; y <= boundsRect.y1; y += 1) {
      for (let x = boundsRect.x0; x <= boundsRect.x1; x += 1) {
        if (!shouldIncludeShapeSelectionPixel(layer, x, y, selectionShapeMode)) continue;
        markSelectionMaskPixel(mask, bounds, x, y);
      }
    }

    if (bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
      if (!hasBaseSelection) {
        clearSelection();
      }
      return;
    }

    hideSelectionTransformMenu();
    state.selectionMask = mask;
    state.selectionContentMask = null;
    state.selectionBounds = bounds;
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function createSelectionRect(start, end, options = {}) {
    const { append = false, selectionShapeMode = state.selectionShapeMode } = options || {};
    const layer = getActiveLayer();
    if (!layer) {
      if (!append) {
        clearSelection();
      }
      return;
    }
    const x0 = clamp(Math.min(start.x, end.x), 0, state.width - 1);
    const x1 = clamp(Math.max(start.x, end.x), 0, state.width - 1);
    const y0 = clamp(Math.min(start.y, end.y), 0, state.height - 1);
    const y1 = clamp(Math.max(start.y, end.y), 0, state.height - 1);
    const { mask, bounds, hasBaseSelection } = createSelectionAccumulator({ append });

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!shouldIncludeShapeSelectionPixel(layer, x, y, selectionShapeMode)) continue;
        markSelectionMaskPixel(mask, bounds, x, y);
      }
    }

    if (bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
      if (!hasBaseSelection) {
        clearSelection();
      }
      return;
    }

    hideSelectionTransformMenu();
    state.selectionMask = mask;
    state.selectionContentMask = null;
    state.selectionBounds = bounds;
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function hasSelectRectHalfCellDrag(preview) {
    const rawStart = preview?.rawStart;
    const rawCurrent = preview?.rawCurrent;
    if (
      !rawStart
      || !rawCurrent
      || !Number.isFinite(rawStart.x)
      || !Number.isFinite(rawStart.y)
      || !Number.isFinite(rawCurrent.x)
      || !Number.isFinite(rawCurrent.y)
    ) {
      return false;
    }
    return Math.max(Math.abs(rawCurrent.x - rawStart.x), Math.abs(rawCurrent.y - rawStart.y)) >= 0.5;
  }

  function createSelectionLasso(points, options = {}) {
    if (!points || points.length < 3) return;
    const { append = false, selectionShapeMode = state.selectionShapeMode } = options || {};
    const layer = getActiveLayer();
    if (!layer) {
      if (!append) {
        clearSelection();
      }
      return;
    }
    const { mask, bounds, hasBaseSelection } = createSelectionAccumulator({ append });
    const searchBounds = {
      x0: state.width,
      y0: state.height,
      x1: 0,
      y1: 0,
    };
    for (const point of points) {
      searchBounds.x0 = Math.min(searchBounds.x0, point.x);
      searchBounds.y0 = Math.min(searchBounds.y0, point.y);
      searchBounds.x1 = Math.max(searchBounds.x1, point.x);
      searchBounds.y1 = Math.max(searchBounds.y1, point.y);
    }
    searchBounds.x0 = clamp(searchBounds.x0, 0, state.width - 1);
    searchBounds.y0 = clamp(searchBounds.y0, 0, state.height - 1);
    searchBounds.x1 = clamp(searchBounds.x1, 0, state.width - 1);
    searchBounds.y1 = clamp(searchBounds.y1, 0, state.height - 1);

    for (let y = searchBounds.y0; y <= searchBounds.y1; y += 1) {
      for (let x = searchBounds.x0; x <= searchBounds.x1; x += 1) {
        if (!pointInPolygon({ x, y }, points)) continue;
        if (!shouldIncludeShapeSelectionPixel(layer, x, y, selectionShapeMode)) continue;
        markSelectionMaskPixel(mask, bounds, x, y);
      }
    }

    if (bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
      if (!hasBaseSelection) {
        clearSelection();
      }
      return;
    }

    hideSelectionTransformMenu();
    state.selectionMask = mask;
    state.selectionContentMask = null;
    state.selectionBounds = bounds;
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function layerHasDrawablePixel(layer, x, y) {
    if (!layer) return false;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
    const idx = y * state.width + x;
    const paletteIndex = layer.indices instanceof Int16Array ? layer.indices[idx] : -1;
    if (paletteIndex >= 0) {
      const paletteColor = Array.isArray(state.palette) ? state.palette[paletteIndex] : null;
      if (paletteColor && (Number(paletteColor.a) || 0) > 0) {
        return true;
      }
    }
    const base = idx * 4;
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    return direct ? direct[base + 3] > 0 : false;
  }

  function getLayerPixelMatchState(layer, idx) {
    if (!layer || !Number.isInteger(idx) || idx < 0) {
      return null;
    }
    const indices = layer.indices instanceof Int16Array ? layer.indices : null;
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const transparentStorageIndex = resolveTransparentStoragePaletteIndex();
    const paletteIndex = indices ? indices[idx] : -1;
    if (paletteIndex >= 0) {
      const color = state.palette[paletteIndex];
      if (!color) {
        return null;
      }
      if (color.a <= 0) {
        return {
          indices,
          direct,
          transparent: true,
          transparentIndex: paletteIndex,
        };
      }
      return {
        indices,
        direct,
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a,
      };
    }
    if (!(direct instanceof Uint8ClampedArray)) {
      return transparentStorageIndex >= 0 || paletteIndex < 0
        ? {
          indices,
          direct,
          transparent: true,
          transparentIndex: transparentStorageIndex,
        }
        : null;
    }
    const base = idx * 4;
    const alpha = direct[base + 3];
    if (alpha <= 0) {
      return {
        indices,
        direct,
        transparent: true,
        transparentIndex: transparentStorageIndex,
      };
    }
    return {
      indices,
      direct,
      r: direct[base],
      g: direct[base + 1],
      b: direct[base + 2],
      a: alpha,
    };
  }

  function layerPixelMatchesMatchState(matchState, idx) {
    if (!matchState || !Number.isInteger(idx) || idx < 0) {
      return false;
    }
    const paletteIndex = matchState.indices ? matchState.indices[idx] : -1;
    if (matchState.transparent) {
      if (paletteIndex >= 0) {
        const color = state.palette[paletteIndex];
        return Boolean(color && color.a <= 0);
      }
      const direct = matchState.direct;
      if (!(direct instanceof Uint8ClampedArray)) {
        return true;
      }
      const base = idx * 4;
      return direct[base + 3] <= 0;
    }
    if (paletteIndex >= 0) {
      const color = state.palette[paletteIndex];
      return Boolean(
        color
        && color.a > 0
        && color.r === matchState.r
        && color.g === matchState.g
        && color.b === matchState.b
        && color.a === matchState.a
      );
    }
    const direct = matchState.direct;
    if (!(direct instanceof Uint8ClampedArray)) {
      return false;
    }
    const base = idx * 4;
    const alpha = direct[base + 3];
    return alpha > 0
      && direct[base] === matchState.r
      && direct[base + 1] === matchState.g
      && direct[base + 2] === matchState.b
      && alpha === matchState.a;
  }

  function createSelectionByColor(x, y, options = {}) {
    const { append = false, mode = state.selectSameMode } = options || {};
    const layer = getActiveLayer();
    if (!layer) {
      if (!append) {
        clearSelection();
      }
      return;
    }
    const width = state.width;
    const height = state.height;
    const selectionMode = normalizeSelectSameMode(mode, state.selectSameMode);
    const seedX = clamp(Math.round(Number(x) || 0), 0, width - 1);
    const seedY = clamp(Math.round(Number(y) || 0), 0, height - 1);
    const seedIndex = (seedY * width) + seedX;
    const { mask, bounds, hasBaseSelection } = createSelectionAccumulator({ append });
    const matchState = getLayerPixelMatchState(layer, seedIndex);
    if (!matchState) {
      if (!hasBaseSelection) {
        clearSelection();
      }
      return;
    }

    if (selectionMode === SELECT_SAME_MODE_GLOBAL) {
      for (let py = 0; py < height; py += 1) {
        const rowOffset = py * width;
        for (let px = 0; px < width; px += 1) {
          const idx = rowOffset + px;
          if (!layerPixelMatchesMatchState(matchState, idx)) {
            continue;
          }
          mask[idx] = 1;
          bounds.x0 = Math.min(bounds.x0, px);
          bounds.y0 = Math.min(bounds.y0, py);
          bounds.x1 = Math.max(bounds.x1, px);
          bounds.y1 = Math.max(bounds.y1, py);
        }
      }
    } else {
      const stack = [seedX, seedY];
      const visited = new Uint8Array(width * height);
      while (stack.length > 1) {
        const py = stack.pop();
        const px = stack.pop();
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const idx = py * width + px;
        if (visited[idx]) continue;
        visited[idx] = 1;
        if (!layerPixelMatchesMatchState(matchState, idx)) continue;
        mask[idx] = 1;
        bounds.x0 = Math.min(bounds.x0, px);
        bounds.y0 = Math.min(bounds.y0, py);
        bounds.x1 = Math.max(bounds.x1, px);
        bounds.y1 = Math.max(bounds.y1, py);
        stack.push(
          px + 1, py,
          px - 1, py,
          px, py + 1,
          px, py - 1
        );
      }
    }

    if (bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
      if (!hasBaseSelection) {
        clearSelection();
      }
      return;
    }

    hideSelectionTransformMenu();
    state.selectionMask = mask;
    state.selectionContentMask = null;
    state.selectionBounds = bounds;
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function compositeColorMatches(a, b) {
    if (!a.color || !b.color) return false;
    if (a.mode === 'index' && b.mode === 'index') {
      return a.index === b.index;
    }
    return a.color.r === b.color.r && a.color.g === b.color.g && a.color.b === b.color.b && a.color.a === b.color.a;
  }

  function clearSelection() {
    const pendingMoveState = getPendingSelectionMoveState() || state.pendingPasteMoveState;
    if (pendingMoveState) {
      // Clicking away should commit the visible portion even if the selection is partially out of bounds.
      pointerState.selectionMove = pendingMoveState;
      const finalized = finalizeSelectionMove({ allowOutOfBoundsClip: true });
      if (!finalized) {
        updateCanvasControlButtons();
        requestOverlayRender();
        return false;
      }
    }
    hideSelectionTransformMenu();
    state.selectionMask = null;
    state.selectionContentMask = null;
    state.selectionBounds = null;
    state.pendingPasteMoveState = null;
    pointerState.selectionMove = null;
    pointerState.lastSelectionMove = null;
    updateCanvasControlButtons();
    requestOverlayRender();
    return true;
  }

  function refreshViewportCursorStyle() {
    if (!dom.canvasViewport) {
      return;
    }
    const shouldHideCursor = Boolean(state.showVirtualCursor && mouseInsideViewport);
    dom.canvasViewport.classList.toggle('is-virtual-cursor-active', shouldHideCursor);
  }

  function setSpacePanActive(active) {
    const next = Boolean(active);
    if (keyboardState.spacePanActive === next) {
      return;
    }
    keyboardState.spacePanActive = next;
    document.body.classList.toggle('is-space-pan-active', next);
    if (!next && pointerState.active && pointerState.tool === 'pan' && pointerState.panMode === 'single') {
      finishPanInteraction();
    }
  }

  function handleViewportPointerEnter(event) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
      return;
    }
    mouseInsideViewport = true;
    refreshViewportCursorStyle();
  }

  function handleViewportPointerLeave(event) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
      return;
    }
    mouseInsideViewport = false;
    if (!pointerState.active) {
      clearHoveredProjectCanvas();
    }
    if (setSelectionTransformHoverHandle('')) {
      requestOverlayRender();
    }
    refreshViewportCursorStyle();
  }

  function isCanvasSurfaceTarget(target) {
    return Boolean(getCanvasInteractionSurfaceFromTarget(target));
  }

  function isViewportControlTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(
      target.closest('.canvas-controls')
      || target.closest('.floating-draw-button')
      || target.closest('.floating-preview-panel')
      || target.closest('.selection-transform-menu')
      || target.closest('.mirror-handle')
      || target.closest('.canvas-resize-handle')
    );
  }

  function isWithinCanvasViewportTarget(target) {
    return Boolean(
      target instanceof Element
      && dom.canvasViewport instanceof HTMLElement
      && dom.canvasViewport.contains(target)
    );
  }

  function handleViewportPointerDown(event) {
    if (
      event.pointerType === 'mouse'
      && performance.now() < (Number(pointerState.suppressTouchCompatibilityUntil) || 0)
    ) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    const targetElement = event.target instanceof Element ? event.target : null;
    const isCanvasTarget = targetElement && isCanvasSurfaceTarget(targetElement);
    const isControlTarget = targetElement && isViewportControlTarget(targetElement);
    const isWithinCanvasViewport = isWithinCanvasViewportTarget(targetElement);
    const isTouch = event.pointerType === 'touch';
    const activeTool = state.tool;
    const isSelectionToolForTransform = activeTool === 'selectRect'
      || activeTool === 'selectLasso'
      || activeTool === 'selectSame'
      || activeTool === 'move'
      || activeTool === 'selectionTransform';

    // Capture-phase arbiter: register touch pointers before drawingCanvas or a
    // tool can own the second pointer. UI controls remain outside this path.
    if (isTouch && !isControlTarget) {
      updateTouchPointer(event);
      if (promoteTouchPointersToExclusiveGesture(event)) {
        return;
      }
    }

    if (targetElement && !isCanvasTarget && !isControlTarget && !isWithinCanvasViewport) {
      if (pointerState.active && pointerState.tool === 'pan') {
        finishPanInteraction();
      }
      return;
    }

    if (!isCanvasTarget && !isControlTarget && !pointerState.active) {
      const transformHandle = isSelectionToolForTransform
        && !(event.pointerType === 'mouse' && event.button === 2)
        ? getSelectionTransformHandleHit(event.clientX, event.clientY)
        : null;
      if (transformHandle) {
        const interactionSurface = getResolvedCanvasInteractionSurface(targetElement);
        const position = getPointerPosition(event, { clampToCanvas: true, surface: interactionSurface });
        if (position) {
          event.preventDefault();
          clearTimelineSelectionForCanvasInteraction();
          const startedTransform = beginSelectionTransformInteraction(event, position, transformHandle, interactionSurface);
          if (startedTransform) {
            updateCanvasControlButtons();
            return;
          }
        }
      }
    }

    if (!isCanvasTarget && !isControlTarget) {
      if (isTouch) {
        updateTouchPointer(event);
        if (hasActiveMultiTouch()) {
          event.preventDefault();
          if (activeTouchPointers.size > TOUCH_PAN_MIN_POINTERS) {
            return;
          }
          releaseVirtualCursorPointer();
          if (pointerState.active && pointerState.tool !== 'pan') {
            const wasSelectionTransform = pointerState.tool === 'selectionTransform';
            abortActivePointerInteraction({ commitHistory: false });
            if (!wasSelectionTransform) {
              rollbackPendingHistory();
            }
          }
          if (!pointerState.active || pointerState.tool !== 'pan' || pointerState.panMode !== 'multiTouch') {
            abortActivePointerInteraction();
            beginExclusiveTouchGesture(event);
          }
          return;
        }
      }

      const isMiddleMousePan = !isTouch && event.button === 1;
      const isPrimaryButton = !isTouch && (event.button === 0 || event.button === undefined);
      const wantsPan = !isTouch && (isMiddleMousePan || ((state.tool === 'pan' || keyboardState.spacePanActive) && isPrimaryButton));
      const shouldClearSelection = (isTouch || isPrimaryButton)
        && !wantsPan
        && !(isTouch && state.showVirtualCursor)
        && (selectionMaskHasPixels(state.selectionMask) || Boolean(getPendingSelectionMoveState()));
      if (shouldClearSelection) {
        clearSelection();
      }
      if (wantsPan) {
        event.preventDefault();
        if (pointerState.active) {
          abortActivePointerInteraction({ commitHistory: false });
        }
        startPanInteraction(event, { captureElement: dom.canvasViewport });
        return;
      }
    }

    if (!state.showVirtualCursor) {
      return;
    }
    if (event.pointerType !== 'touch') {
      return;
    }
    if (virtualCursorControl.pointerId !== null) {
      return;
    }
    if (targetElement && (isCanvasTarget || isControlTarget)) {
      return;
    }
    updateTouchPointer(event);
    event.preventDefault();
    hoverPixel = null;
    if (!virtualCursorDrawState.active) {
      resetPointerStateForVirtualCursor();
    }
    captureVirtualCursorPointer(event.pointerId, event.pointerType, dom.canvasViewport, event);
  }

  function handleViewportPointerMove(event) {
    if (!pointerState.active && (event.pointerType === 'mouse' || event.pointerType === 'pen')) {
      if (updateSelectionTransformHandleHover(event.clientX, event.clientY)) {
        requestOverlayRender();
      }
    }
    if (!state.showVirtualCursor) {
      return;
    }
    if (virtualCursorControl.pointerId !== event.pointerId) {
      return;
    }
    if (event.pointerType === 'touch') {
      updateTouchPointer(event);
    }
    event.preventDefault();
    updateVirtualCursorFromControlDelta(event);
  }

  function handleViewportPointerUp(event) {
    if (!state.showVirtualCursor) {
      return;
    }
    if (virtualCursorControl.pointerId !== event.pointerId) {
      return;
    }
    if (event.pointerType === 'touch') {
      removeTouchPointer(event);
    }
    releaseVirtualCursorPointer();
    requestOverlayRender();
  }

  function handleViewportPointerCancel(event) {
    if (!state.showVirtualCursor) {
      return;
    }
    if (virtualCursorControl.pointerId !== event.pointerId) {
      return;
    }
    if (event.pointerType === 'touch') {
      removeTouchPointer(event);
    }
    releaseVirtualCursorPointer();
    requestOverlayRender();
  }

  function handleViewportCompatibilityMouseEvent(event) {
    if (performance.now() >= (Number(pointerState.suppressTouchCompatibilityUntil) || 0)) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation?.();
  }


        return Object.freeze({
          detachPointerListeners,
          clearPendingCanvasSwitchPointer,
          resetPointerState,
          resetPointerStateForVirtualCursor,
          abortActivePointerInteraction,
          cancelActiveViewportGesture,
          updateTouchPointer,
          hasActiveMultiTouch,
          shouldDeferInactiveCanvasPointerDown,
          canBeginPendingCanvasSwitchDrag,
          resolvePendingCanvasSwitchSurface,
          beginPendingCanvasSwitchDrag,
          removeTouchPointer,
          getTouchCentroid,
          getTouchPointerDistance,
          captureTouchGestureStartPointers,
          getTouchGestureMovementAnalysis,
          getTouchPinchFocusForCentroid,
          refreshTouchPanBaseline,
          startPanInteraction,
          finishPanInteraction,
          handlePointerDown,
          handlePointerMove,
          handlePointerUp,
          handlePointerCancel,
          beginLayerMove,
          beginSelectionMove,
          beginSelectionMoveFromVirtualCursor,
          isPositionInBounds,
          getCurrentSelectionBounds,
          isPositionInCurrentSelection,
          isPositionInCurrentSelectionBounds,
          isPositionInCurrentSelectionInteractionArea,
          isPositionInMoveState,
          isPositionInMoveVisualBounds,
          getMoveStateSourcePixelAlpha,
          selectionDirectHasVisiblePixels,
          clearDirectPixel,
          writePaletteColorToDirectPixel,
          refreshLayerDirectOnlyFlag,
          storeSelectionInClipboard,
          copySelection,
          hasCanvasSelectionClipboardContext,
          performCopyAction,
          performCutAction,
          performPasteAction,
          cutSelection,
          pasteSelection,
          handleSelectionMoveDrag,
          promotePendingSelectionMove,
          clearSelectionSourcePixels,
          finalizeSelectionMove,
          hasPendingSelectionMove,
          getPendingSelectionMoveState,
          confirmPendingSelectionMove,
          cancelPendingSelectionMove,
          placeSelectionPixels,
          drawSelectionMovePreview,
          getSelectionMoveTransformedPreviewRenderData,
          getSelectionMoveOutlineSegments,
          buildSelectionMoveOutlineSegments,
          traceSelectionMoveOutline,
          getPointerPositionRaw,
          getPointerPosition,
          normalizeSignedAngleDeg,
          invalidateSelectionMoveTransformCache,
          shouldRenderSelectionTransformHandles,
          getSelectionTransformWorldCorners,
          getSelectionMoveTransformWorldCorners,
          getWorldCornerBounds,
          hideSelectionTransformMenu,
          computeSelectionTransformMenuLocalPosition,
          showSelectionTransformMenu,
          positionSelectionTransformMenu,
          drawSelectionTransformHandles,
          getSelectionTransformHandleDrawRect,
          getSelectionTransformHandleHit,
          setSelectionTransformHoverHandle,
          updateSelectionTransformHandleHover,
          getSelectionMoveTransformCenter,
          getSelectionTransformOppositeCornerId,
          getSelectionTransformCornerLocalPoint,
          getSelectionTransformVectorInResizeSpace,
          getSelectionTransformResizeAnchorSnapshot,
          ensureSelectionMoveForTransform,
          beginSelectionTransformInteraction,
          getSelectionTransformPointerLocalVector,
          resolveSelectionTransformInteractionMode,
          updateSelectionTransformResizeFromPointer,
          handleSelectionTransformDrag,
          completeSelectionTransformInteraction,
          toggleSelectionMoveFlip,
          applyBrushStroke,
          resolveDrawPaletteIndex,
          normalizeSelectionBoundsForState,
          computeSelectionBoundsFromMask,
          createSelectionAccumulator,
          getSelectionGridCellFromPosition,
          getSelectionGridCellBounds,
          detectSelectRectGridDoubleTap,
          getSelectionGridRectPixelBounds,
          updateSelectionGridRectPreview,
          markSelectionMaskPixel,
          shouldIncludeShapeSelectionPixel,
          createSelectionByGridRect,
          createSelectionRect,
          hasSelectRectHalfCellDrag,
          createSelectionLasso,
          layerHasDrawablePixel,
          getLayerPixelMatchState,
          layerPixelMatchesMatchState,
          createSelectionByColor,
          compositeColorMatches,
          clearSelection,
          refreshViewportCursorStyle,
          setSpacePanActive,
          handleViewportPointerEnter,
          handleViewportPointerLeave,
          isCanvasSurfaceTarget,
          isViewportControlTarget,
          handleViewportPointerDown,
          handleViewportPointerMove,
          handleViewportPointerUp,
          handleViewportPointerCancel,
          handleViewportCompatibilityMouseEvent,
        });
      }
    })(scope);
  }

  root.canvasPointerWorkflowUtils = Object.freeze({
    createCanvasPointerWorkflowUtils,
  });
})();
