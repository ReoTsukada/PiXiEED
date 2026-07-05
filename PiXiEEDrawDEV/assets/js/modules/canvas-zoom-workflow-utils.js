(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasZoomWorkflowUtils(rawScope = {}) {
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
  function showZoomIndicator(scale) {
    showViewportIndicator(formatZoomLabel(scale), { autoHideMs: ZOOM_INDICATOR_TIMEOUT });
  }

  function syncZoomFollowerUi() {
    clearCanvasScreenMetricsCache();
    updateMirrorGuideHandles();
    updateCanvasResizeHandlePosition();
    syncCanvasResizeHandleVisibility();
    requestOverlayRender();
  }

  function scheduleZoomSettledViewportRefresh() {
    if (zoomSettledViewportRefreshHandle !== null) {
      window.clearTimeout(zoomSettledViewportRefreshHandle);
      zoomSettledViewportRefreshHandle = null;
    }
    const delayMs = isLargeDocumentPerformanceMode() ? 180 : 90;
    zoomSettledViewportRefreshHandle = window.setTimeout(() => {
      zoomSettledViewportRefreshHandle = null;
      updateGridDecorations();
      resizeVirtualCursorCanvas();
      // Zoom changes viewport sizing/placement, but does not change local canvas pixel data.
      // In multi-canvas mode, keep local panels in the same shared 2D zoom space.
      if (isMultiCanvasWorldLayoutActive()) {
        syncAllProjectCanvasSurfaceDimensions();
        syncLocalViewportCanvasDockLayout();
        syncMultiCanvasSelectionUi();
      } else {
        syncLocalViewportCanvasDockVisibility({ persist: false, render: false });
      }
      updateMirrorGuideHandles();
      updateCanvasResizeHandlePosition();
      syncCanvasResizeHandleVisibility();
      requestOverlayRender();
    }, delayMs);
  }

  function getVirtualCursorZoomFocus() {
    if (!state.showVirtualCursor || !virtualCursor) {
      return null;
    }
    const width = Math.max(1, Number(state.width) || 1);
    const height = Math.max(1, Number(state.height) || 1);
    const worldX = clamp(Number(virtualCursor.x), 0, width - 1);
    const worldY = clamp(Number(virtualCursor.y), 0, height - 1);
    const scale = getPixelAlignedCanvasDisplayScale(state.scale);
    const drawing = dom.canvases.drawing;
    if (!drawing) {
      return {
        worldX,
        worldY,
        cellX: Math.floor(worldX),
        cellY: Math.floor(worldY),
      };
    }
    const rect = drawing.getBoundingClientRect();
    return {
      clientX: rect.left + worldX * scale,
      clientY: rect.top + worldY * scale,
      worldX,
      worldY,
      cellX: Math.floor(worldX),
      cellY: Math.floor(worldY),
    };
  }

  function getCanvasSurfacePanelLayoutOffset(surface, fallback = { x: 0, y: 0 }) {
    const panel = surface?.panel instanceof HTMLElement ? surface.panel : null;
    if (!panel) {
      return {
        x: Number(fallback?.x) || 0,
        y: Number(fallback?.y) || 0,
      };
    }
    const workspace = dom.viewportWorkspace instanceof HTMLElement ? dom.viewportWorkspace : null;
    const panelRect = panel.getBoundingClientRect?.();
    const workspaceRect = workspace?.getBoundingClientRect?.();
    if (
      panelRect
      && workspaceRect
      && Number.isFinite(panelRect.left)
      && Number.isFinite(panelRect.top)
      && Number.isFinite(workspaceRect.left)
      && Number.isFinite(workspaceRect.top)
    ) {
      return {
        x: panelRect.left - workspaceRect.left,
        y: panelRect.top - workspaceRect.top,
      };
    }
    return {
      x: parseLocalViewportCanvasAxis(panel.style.left, panel.offsetLeft) ?? (Number(fallback?.x) || 0),
      y: parseLocalViewportCanvasAxis(panel.style.top, panel.offsetTop) ?? (Number(fallback?.y) || 0),
    };
  }

  function getCanvasSurfaceDrawingLocalOffset(surface) {
    const panel = surface?.panel instanceof HTMLElement ? surface.panel : null;
    const drawing = surface?.drawing instanceof HTMLCanvasElement ? surface.drawing : null;
    if (!panel || !drawing) {
      return { x: 0, y: 0 };
    }
    const panelRect = panel.getBoundingClientRect?.();
    const drawingRect = drawing.getBoundingClientRect?.();
    if (
      !panelRect
      || !drawingRect
      || !Number.isFinite(panelRect.left)
      || !Number.isFinite(panelRect.top)
      || !Number.isFinite(drawingRect.left)
      || !Number.isFinite(drawingRect.top)
    ) {
      return { x: 0, y: 0 };
    }
    return {
      x: drawingRect.left - panelRect.left,
      y: drawingRect.top - panelRect.top,
    };
  }

  function getCanvasSurfaceDrawingDisplayScale(surface, canvasDoc, fallbackScale) {
    const drawing = surface?.drawing instanceof HTMLCanvasElement ? surface.drawing : null;
    const rect = drawing?.getBoundingClientRect?.();
    const width = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(state.height) || 1));
    const safeFallback = Math.max(Number(fallbackScale) || MIN_ZOOM_SCALE, Number.EPSILON);
    return {
      x: rect && rect.width > 0 ? rect.width / width : safeFallback,
      y: rect && rect.height > 0 ? rect.height / height : safeFallback,
    };
  }

  function getViewportCenterZoomFocus() {
    const viewport = dom.canvasViewport instanceof HTMLElement ? dom.canvasViewport : null;
    const viewportRect = viewport?.getBoundingClientRect?.();
    if (!viewportRect || viewportRect.width <= 0 || viewportRect.height <= 0) {
      return null;
    }
    const centerX = viewportRect.left + (viewportRect.width / 2);
    const centerY = viewportRect.top + (viewportRect.height / 2);
    let surface = null;
    if (isMultiCanvasWorldLayoutActive() && typeof document.elementFromPoint === 'function') {
      surface = getCanvasInteractionSurfaceFromTarget(document.elementFromPoint(centerX, centerY));
    }
    surface = surface || getViewportVisibilityTargetSurface();
    return getCanvasFocusAt(centerX, centerY, {
      clampToCanvas: true,
      surface,
    });
  }

  function setZoom(nextScale, focus) {
    markViewportInteractionActivity();
    if (!wheelZoomApplying) {
      wheelZoomPendingRawScale = null;
      if (wheelZoomRawResetTimer !== null) {
        window.clearTimeout(wheelZoomRawResetTimer);
        wheelZoomRawResetTimer = null;
      }
    }
    if (!wheelZoomApplying && wheelZoomRaf !== null) {
      cancelAnimationFrame(wheelZoomRaf);
      wheelZoomRaf = null;
      wheelZoomPendingScale = null;
      wheelZoomPendingFocus = null;
    }
    const prevScale = Number(state.scale) || MIN_ZOOM_SCALE;
    const prevDisplayScale = getPixelAlignedCanvasDisplayScale(prevScale);
    const targetScale = normalizeZoomScale(nextScale, prevScale);
    const targetDisplayScale = getPixelAlignedCanvasDisplayScale(targetScale);
    if (Math.abs(targetScale - prevScale) < ZOOM_EPSILON) {
      syncControlsWithState();
      return;
    }

    const previousPan = {
      x: Number(state.pan.x) || 0,
      y: Number(state.pan.y) || 0,
    };
    let zoomFocus = focus && Number.isFinite(focus.worldX) && Number.isFinite(focus.worldY)
      ? focus
      : null;
    if (!zoomFocus && state.showVirtualCursor) {
      zoomFocus = getVirtualCursorZoomFocus();
    }
    if (!zoomFocus) {
      zoomFocus = getViewportCenterZoomFocus();
    }
    const multiCanvasWorldLayoutActive = isMultiCanvasWorldLayoutActive();
    const focusSurface = zoomFocus?.surface
      ? getResolvedCanvasInteractionSurface(zoomFocus.surface)
      : getViewportVisibilityTargetSurface();
    const focusCanvasId = zoomFocus?.canvasDocId || focusSurface?.canvasDocId || focusSurface?.canvasDoc?.id || '';
    const viewportRectBeforeResize = dom.canvasViewport?.getBoundingClientRect?.() || null;
    const focusCanvasDocBefore = focusSurface?.canvasDoc || getProjectCanvasDocumentById(focusSurface?.canvasDocId) || getActiveProjectCanvasDocument();
    const panelOffsetBefore = getCanvasSurfacePanelLayoutOffset(focusSurface);
    const drawingOffsetBefore = getCanvasSurfaceDrawingLocalOffset(focusSurface);
    const previousDrawingScale = getCanvasSurfaceDrawingDisplayScale(focusSurface, focusCanvasDocBefore, prevDisplayScale);
    const focusViewportOffsetX = zoomFocus && viewportRectBeforeResize && Number.isFinite(zoomFocus.clientX)
      ? (Number(zoomFocus.clientX) - viewportRectBeforeResize.left)
      : (zoomFocus
        ? previousPan.x + panelOffsetBefore.x + drawingOffsetBefore.x + ((Number(zoomFocus.worldX) || 0) * previousDrawingScale.x)
        : null);
    const focusViewportOffsetY = zoomFocus && viewportRectBeforeResize && Number.isFinite(zoomFocus.clientY)
      ? (Number(zoomFocus.clientY) - viewportRectBeforeResize.top)
      : (zoomFocus
        ? previousPan.y + panelOffsetBefore.y + drawingOffsetBefore.y + ((Number(zoomFocus.worldY) || 0) * previousDrawingScale.y)
        : null);

    state.scale = targetScale;
    rememberViewportZoomRatioFromScale(targetScale);
    resizeCanvases({
      forceRender: false,
      applyTransform: false,
      syncControls: false,
      updateScaleLimits: false,
      renderLocalViewports: false,
      renderOverlay: false,
      syncLocalViewportDock: false,
      resizeVirtualCursor: false,
    });
    if (multiCanvasWorldLayoutActive) {
      syncAllProjectCanvasSurfaceDimensions();
      syncLocalViewportCanvasDockLayout();
    }

    let anchorCorrectionSurface = null;
    let anchorCorrectionCanvasDoc = null;
    if (
      zoomFocus
      && Number.isFinite(focusViewportOffsetX)
      && Number.isFinite(focusViewportOffsetY)
    ) {
      const focusedSurface = focusCanvasId
        ? getProjectCanvasSurfaceByCanvasId(focusCanvasId)
        : focusSurface;
      const panelOffset = getCanvasSurfacePanelLayoutOffset(focusedSurface, panelOffsetBefore);
      const drawingOffset = getCanvasSurfaceDrawingLocalOffset(focusedSurface);
      const focusedCanvasDoc = focusedSurface?.canvasDoc || getProjectCanvasDocumentById(focusedSurface?.canvasDocId) || getActiveProjectCanvasDocument();
      const actualTargetScale = getCanvasSurfaceDrawingDisplayScale(focusedSurface, focusedCanvasDoc, targetDisplayScale);
      state.pan.x = (
        focusViewportOffsetX
        - (panelOffset.x + drawingOffset.x + ((Number(zoomFocus.worldX) || 0) * actualTargetScale.x))
      );
      state.pan.y = (
        focusViewportOffsetY
        - (panelOffset.y + drawingOffset.y + ((Number(zoomFocus.worldY) || 0) * actualTargetScale.y))
      );
      anchorCorrectionSurface = focusedSurface;
      anchorCorrectionCanvasDoc = focusedCanvasDoc;
    } else {
      const ratio = targetDisplayScale / Math.max(prevDisplayScale, MIN_ZOOM_SCALE);
      state.pan.x = previousPan.x * ratio;
      state.pan.y = previousPan.y * ratio;
    }

    applyViewportTransform({
      updateDecorations: false,
      clampVisibility: false,
    });
    if (
      zoomFocus
      && anchorCorrectionSurface
      && dom.canvasViewport instanceof HTMLElement
      && anchorCorrectionSurface.drawing instanceof HTMLCanvasElement
      && Number.isFinite(focusViewportOffsetX)
      && Number.isFinite(focusViewportOffsetY)
    ) {
      const viewportRectNow = dom.canvasViewport.getBoundingClientRect();
      const drawingRectNow = anchorCorrectionSurface.drawing.getBoundingClientRect();
      const actualScaleNow = getCanvasSurfaceDrawingDisplayScale(anchorCorrectionSurface, anchorCorrectionCanvasDoc, targetDisplayScale);
      const anchorViewportX = (drawingRectNow.left - viewportRectNow.left) + ((Number(zoomFocus.worldX) || 0) * actualScaleNow.x);
      const anchorViewportY = (drawingRectNow.top - viewportRectNow.top) + ((Number(zoomFocus.worldY) || 0) * actualScaleNow.y);
      const correctionX = focusViewportOffsetX - anchorViewportX;
      const correctionY = focusViewportOffsetY - anchorViewportY;
      if (Math.abs(correctionX) > 0.01 || Math.abs(correctionY) > 0.01) {
        state.pan.x = (Number(state.pan.x) || 0) + correctionX;
        state.pan.y = (Number(state.pan.y) || 0) + correctionY;
        applyViewportTransform({
          updateDecorations: false,
          clampVisibility: false,
        });
      }
    }
    syncZoomFollowerUi();
    syncZoomControls(targetScale);
    showZoomIndicator(targetScale);
    scheduleZoomSettledViewportRefresh();
    scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
  }

  function adjustZoomBySteps(delta, focus) {
    const direction = Math.sign(Number(delta) || 0);
    if (!direction) {
      syncControlsWithState();
      return;
    }
    const currentRatio = getZoomRatioForScale(state.scale);
    const nextRatio = clamp(
      currentRatio * (direction > 0 ? 1.1 : (1 / 1.1)),
      MIN_ZOOM_RATIO,
      MAX_ZOOM_RATIO
    );
    setZoom(getZoomScaleForRatio(nextRatio), focus);
  }


  return Object.freeze({
    showZoomIndicator,
    syncZoomFollowerUi,
    scheduleZoomSettledViewportRefresh,
    getVirtualCursorZoomFocus,
    getCanvasSurfacePanelLayoutOffset,
    getCanvasSurfaceDrawingLocalOffset,
    getCanvasSurfaceDrawingDisplayScale,
    getViewportCenterZoomFocus,
    setZoom,
    adjustZoomBySteps,
  });
      }
    })(scope);
  }

  root.canvasZoomWorkflowUtils = Object.freeze({
    createCanvasZoomWorkflowUtils,
  });
})();
