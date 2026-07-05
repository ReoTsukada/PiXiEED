(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasWheelZoomWorkflowUtils(rawScope = {}) {
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
  function getCanvasFocusAt(clientX, clientY, { clampToCanvas = false, surface = null } = {}) {
    const metrics = getCanvasInteractionSurfaceMetrics(surface || null);
    const resolvedSurface = metrics.surface || null;
    const drawing = resolvedSurface?.drawing instanceof HTMLCanvasElement
      ? resolvedSurface.drawing
      : dom.canvases.drawing;
    if (!drawing) {
      return null;
    }
    const rect = drawing.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const outsideX = clientX < rect.left || clientX > rect.right;
    const outsideY = clientY < rect.top || clientY > rect.bottom;
    if ((outsideX || outsideY) && !clampToCanvas) {
      return null;
    }
    const clampedClientX = clampToCanvas ? clamp(clientX, rect.left, rect.right) : clientX;
    const clampedClientY = clampToCanvas ? clamp(clientY, rect.top, rect.bottom) : clientY;
    const canvasDoc = resolvedSurface?.canvasDoc || getProjectCanvasDocumentById(resolvedSurface?.canvasDocId) || getActiveProjectCanvasDocument();
    const width = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(metrics.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(metrics.height) || 1));
    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    const fallbackScale = getProjectCanvasDisplayScale(canvasDoc);
    const worldX = (clampedClientX - rect.left) / Math.max(Number(scaleX) || fallbackScale, Number.EPSILON);
    const worldY = (clampedClientY - rect.top) / Math.max(Number(scaleY) || fallbackScale, Number.EPSILON);
    return {
      clientX: clampedClientX,
      clientY: clampedClientY,
      worldX,
      worldY,
      cellX: Math.floor(worldX),
      cellY: Math.floor(worldY),
      surface: resolvedSurface,
      canvasDocId: resolvedSurface?.canvasDocId || canvasDoc?.id || '',
    };
  }

  function queueWheelZoom(targetScale, focus) {
    if (!Number.isFinite(targetScale)) {
      return;
    }
    wheelZoomPendingScale = targetScale;
    wheelZoomPendingFocus = focus || null;
    if (wheelZoomRaf !== null) {
      return;
    }
    wheelZoomRaf = requestAnimationFrame(() => {
      wheelZoomRaf = null;
      const nextScale = wheelZoomPendingScale;
      const nextFocus = wheelZoomPendingFocus;
      wheelZoomPendingScale = null;
      wheelZoomPendingFocus = null;
      if (!Number.isFinite(nextScale)) {
        return;
      }
      wheelZoomApplying = true;
      try {
        setZoom(nextScale, nextFocus || undefined);
      } finally {
        wheelZoomApplying = false;
      }
    });
  }

  function scheduleWheelZoomRawReset() {
    if (wheelZoomRawResetTimer !== null) {
      window.clearTimeout(wheelZoomRawResetTimer);
    }
    wheelZoomRawResetTimer = window.setTimeout(() => {
      wheelZoomRawResetTimer = null;
      wheelZoomPendingRawScale = null;
    }, WHEEL_ZOOM_RAW_RESET_MS);
  }

  function handleCanvasWheel(event) {
    const targetElement = event.target instanceof Element
      ? event.target
      : (event.currentTarget instanceof Element ? event.currentTarget : null);
    const targetSurface = getCanvasInteractionSurfaceFromTarget(targetElement);
    if (!targetSurface?.canvasDoc) {
      return;
    }
    if (!finalizePendingSelectionBeforeCanvasSwitch(targetSurface.canvasDocId || '')) {
      return;
    }
    if (targetSurface.canvasDocId && targetSurface.canvasDocId !== (getActiveProjectCanvasDocument()?.id || '')) {
      syncActiveLayerFromInteractionSurface(targetSurface, { syncUi: true, persist: false });
    }
    commitPreviewProjectCanvasSelection({ persist: false, flushUi: false });
    flushActiveProjectCanvasUiSync({ persist: false });
    const resolvedSurface = getResolvedCanvasInteractionSurface(targetSurface);
    const pointerFocus = getCanvasFocusAt(event.clientX, event.clientY, { surface: resolvedSurface });
    const focus = pointerFocus || (state.showVirtualCursor ? getVirtualCursorZoomFocus() : null);
    if (!focus) {
      return;
    }
    const deltaY = event.deltaY;
    if (!Number.isFinite(deltaY) || deltaY === 0) {
      return;
    }
    event.preventDefault();
    const deltaModeScale = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? 180 : 1);
    const normalizedDelta = clamp(deltaY * deltaModeScale, -600, 600);
    const wheelSteps = normalizedDelta / 100;
    if (!Number.isFinite(wheelSteps) || Math.abs(wheelSteps) < 0.001) {
      return;
    }
    const zoomFactor = Math.pow(ZOOM_WHEEL_STEP_BASE, -wheelSteps);
    if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
      return;
    }
    const focusCanvasDoc = focus.canvasDocId
      ? (getProjectCanvasDocumentById(focus.canvasDocId) || targetSurface.canvasDoc || getActiveProjectCanvasDocument())
      : (targetSurface.canvasDoc || getActiveProjectCanvasDocument());
    focus.cellX = clamp(focus.cellX, 0, Math.max(0, Math.round(Number(focusCanvasDoc?.width) || state.width || 1) - 1));
    focus.cellY = clamp(focus.cellY, 0, Math.max(0, Math.round(Number(focusCanvasDoc?.height) || state.height || 1) - 1));
    const currentScale = Number.isFinite(wheelZoomPendingScale)
      ? wheelZoomPendingScale
      : (Number(state.scale) || MIN_ZOOM_SCALE);
    const currentRawScale = normalizeZoomScale(
      Number.isFinite(wheelZoomPendingRawScale)
        ? wheelZoomPendingRawScale
        : currentScale,
      currentScale
    );
    const nextRawScale = normalizeZoomScale(currentRawScale * zoomFactor, currentRawScale);
    if (!Number.isFinite(nextRawScale) || nextRawScale <= 0) {
      return;
    }
    wheelZoomPendingRawScale = nextRawScale;
    scheduleWheelZoomRawReset();
    const targetScale = normalizeZoomScale(nextRawScale, currentRawScale);
    if (Math.abs(targetScale - currentScale) < ZOOM_EPSILON) {
      return;
    }
    queueWheelZoom(targetScale, focus);
  }


  return Object.freeze({
    getCanvasFocusAt,
    queueWheelZoom,
    scheduleWheelZoomRawReset,
    handleCanvasWheel,
  });
      }
    })(scope);
  }

  root.canvasWheelZoomWorkflowUtils = Object.freeze({
    createCanvasWheelZoomWorkflowUtils,
  });
})();
