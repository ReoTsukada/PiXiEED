(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasResizeHandleWorkflowUtils(rawScope = {}) {
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
  function canUseCanvasResizeHandle({ ignoreLocalInteraction = false } = {}) {
    return canCurrentClientEditProjectStructure({ ignoreLocalInteraction })
      && Boolean(state.showCanvasResizeHandles ?? true)
      && lockedCanvasWidth === null
      && lockedCanvasHeight === null;
  }

  function syncCanvasResizeOverlayHost() {
    const stack = activeCanvasSurface?.stack instanceof HTMLElement
      ? activeCanvasSurface.stack
      : dom.canvases.stack;
    if (!(stack instanceof HTMLElement)) {
      return false;
    }
    [dom.canvasResizePreview, dom.canvasResizeHandleStart, dom.canvasResizeHandleCorner].forEach(element => {
      if (element instanceof HTMLElement && element.parentElement !== stack) {
        stack.appendChild(element);
      }
    });
    return true;
  }

  function getCanvasResizeOverlayMetrics() {
    const drawing = activeCanvasSurface?.drawing instanceof HTMLCanvasElement
      ? activeCanvasSurface.drawing
      : dom.canvases.drawing;
    const stack = activeCanvasSurface?.stack instanceof HTMLElement
      ? activeCanvasSurface.stack
      : dom.canvases.stack;
    if (!(stack instanceof HTMLElement) || !(drawing instanceof HTMLCanvasElement)) {
      return null;
    }
    const width = parseLocalViewportCanvasAxis(drawing.style.width, drawing.offsetWidth);
    const height = parseLocalViewportCanvasAxis(drawing.style.height, drawing.offsetHeight);
    if (!(width > 0) || !(height > 0)) {
      return null;
    }
    return {
      left: 0,
      top: 0,
      width,
      height,
    };
  }

  function setCanvasResizePreviewRect(widthPx, heightPx, { offsetXPx = 0, offsetYPx = 0 } = {}) {
    const preview = dom.canvasResizePreview;
    const metrics = getCanvasResizeOverlayMetrics();
    if (!(preview instanceof HTMLElement) || !metrics) {
      return;
    }
    preview.style.left = `${Math.round(metrics.left - offsetXPx)}px`;
    preview.style.top = `${Math.round(metrics.top - offsetYPx)}px`;
    preview.style.width = `${Math.max(1, Math.round(widthPx))}px`;
    preview.style.height = `${Math.max(1, Math.round(heightPx))}px`;
  }

  function syncCanvasResizeHandleVisibility() {
    syncCanvasResizeOverlayHost();
    const handles = [dom.canvasResizeHandleStart, dom.canvasResizeHandleCorner];
    const preview = dom.canvasResizePreview;
    const enabled = canUseCanvasResizeHandle({ ignoreLocalInteraction: true });
    const metrics = getCanvasResizeOverlayMetrics();
    const visible = Boolean(enabled && !state.playback.isPlaying && (metrics || canvasResizeHandleState.layoutReady));
    if (enabled && !state.playback.isPlaying && !metrics && canvasResizeHandleState.layoutReady) {
      scheduleCanvasResizeHandleLayoutRefresh();
    }
    if (!enabled || state.playback.isPlaying) {
      canvasResizeHandleState.layoutReady = false;
    }
    handles.forEach(handle => {
      if (!(handle instanceof HTMLElement)) {
        return;
      }
      handle.classList.toggle('is-hidden', !visible);
      handle.hidden = !visible;
      handle.setAttribute('aria-hidden', String(!visible));
    });
    if (!(preview instanceof HTMLElement)) {
      return;
    }
    if (!canvasResizeHandleState.active) {
      preview.classList.add('is-hidden');
      preview.hidden = true;
      preview.setAttribute('aria-hidden', 'true');
    }
  }

  function updateCanvasResizeHandlePosition() {
    syncCanvasResizeOverlayHost();
    const metrics = getCanvasResizeOverlayMetrics();
    const startHandle = dom.canvasResizeHandleStart;
    const endHandle = dom.canvasResizeHandleCorner;
    if (!(startHandle instanceof HTMLElement) || !(endHandle instanceof HTMLElement) || !metrics || !canUseCanvasResizeHandle({ ignoreLocalInteraction: true })) {
      syncCanvasResizeHandleVisibility();
      return;
    }
    canvasResizeHandleState.layoutReady = true;
    const selectionHandleClearance = (SELECTION_TRANSFORM_HANDLE_DRAW_RADIUS_PX * 2) + 6;
    const handleGap = Math.max(CANVAS_RESIZE_HANDLE_GAP, selectionHandleClearance);
    const startX = metrics.left - CANVAS_RESIZE_HANDLE_SIZE - handleGap;
    const startY = metrics.top - CANVAS_RESIZE_HANDLE_SIZE - handleGap;
    const endX = metrics.left + metrics.width + handleGap;
    const endY = metrics.top + metrics.height + handleGap;
    startHandle.style.left = `${Math.round(startX)}px`;
    startHandle.style.top = `${Math.round(startY)}px`;
    endHandle.style.left = `${Math.round(endX)}px`;
    endHandle.style.top = `${Math.round(endY)}px`;
    startHandle.classList.remove('is-hidden');
    startHandle.hidden = false;
    startHandle.setAttribute('aria-hidden', 'false');
    endHandle.classList.remove('is-hidden');
    endHandle.hidden = false;
    endHandle.setAttribute('aria-hidden', 'false');
    if (canvasResizeHandleState.active) {
      const scale = getPixelAlignedCanvasDisplayScale(state.scale);
      setCanvasResizePreviewRect(
        canvasResizeHandleState.previewWidth * scale,
        canvasResizeHandleState.previewHeight * scale,
        {
          offsetXPx: canvasResizeHandleState.previewOffsetX * scale,
          offsetYPx: canvasResizeHandleState.previewOffsetY * scale,
        }
      );
    }
  }

  function formatCanvasResizeIndicatorLabel(width, height) {
    const safeWidth = Math.max(1, Math.round(Number(width) || 1));
    const safeHeight = Math.max(1, Math.round(Number(height) || 1));
    return `X: ${safeWidth}, Y: ${safeHeight}`;
  }

  function hideViewportIndicator() {
    const indicator = dom.zoomIndicator;
    if (!indicator) {
      return;
    }
    if (zoomIndicatorTimeoutId !== null) {
      window.clearTimeout(zoomIndicatorTimeoutId);
      zoomIndicatorTimeoutId = null;
    }
    indicator.classList.remove('is-visible');
    indicator.setAttribute('aria-hidden', 'true');
  }

  function showViewportIndicator(label, { autoHideMs = ZOOM_INDICATOR_TIMEOUT } = {}) {
    const indicator = dom.zoomIndicator;
    if (!indicator) {
      return;
    }
    indicator.textContent = String(label || '');
    indicator.classList.add('is-visible');
    indicator.setAttribute('aria-hidden', 'false');
    if (zoomIndicatorTimeoutId !== null) {
      window.clearTimeout(zoomIndicatorTimeoutId);
      zoomIndicatorTimeoutId = null;
    }
    if (Number.isFinite(autoHideMs) && autoHideMs > 0) {
      zoomIndicatorTimeoutId = window.setTimeout(() => {
        indicator.classList.remove('is-visible');
        indicator.setAttribute('aria-hidden', 'true');
        zoomIndicatorTimeoutId = null;
      }, autoHideMs);
    }
  }

  function stopCanvasResizeHandleInteraction({ apply = true } = {}) {
    const activeHandle = canvasResizeHandleState.handle;
    const preview = dom.canvasResizePreview;
    const nextWidth = canvasResizeHandleState.previewWidth;
    const nextHeight = canvasResizeHandleState.previewHeight;
    const shouldApply = apply
      && canvasResizeHandleState.active
      && nextWidth > 0
      && nextHeight > 0
      && (nextWidth !== canvasResizeHandleState.startWidth || nextHeight !== canvasResizeHandleState.startHeight);
    if (activeHandle instanceof HTMLElement) {
      activeHandle.classList.remove('is-active');
      if (Number.isFinite(canvasResizeHandleState.pointerId)) {
        try {
          activeHandle.releasePointerCapture?.(canvasResizeHandleState.pointerId);
        } catch (error) {
          // Ignore pointer release errors.
        }
      }
    }
    if (preview instanceof HTMLElement) {
      preview.classList.add('is-hidden');
      preview.hidden = true;
      preview.setAttribute('aria-hidden', 'true');
    }
    window.removeEventListener('pointermove', handleCanvasResizeHandlePointerMove);
    window.removeEventListener('pointerup', handleCanvasResizeHandlePointerUp);
    window.removeEventListener('pointercancel', handleCanvasResizeHandlePointerCancel);
    canvasResizeHandleState.pointerId = null;
    canvasResizeHandleState.handle = null;
    canvasResizeHandleState.anchor = '';
    canvasResizeHandleState.active = false;
    if (shouldApply) {
      applyCanvasResizeDimensions(nextWidth, nextHeight, {
        preserveAnchoredContent: true,
        contentOffsetX: canvasResizeHandleState.previewOffsetX,
        contentOffsetY: canvasResizeHandleState.previewOffsetY,
      });
    }
    canvasResizeHandleState.startWidth = 0;
    canvasResizeHandleState.startHeight = 0;
    canvasResizeHandleState.previewWidth = 0;
    canvasResizeHandleState.previewHeight = 0;
    canvasResizeHandleState.previewOffsetX = 0;
    canvasResizeHandleState.previewOffsetY = 0;
    hideViewportIndicator();
    syncCanvasResizeHandleVisibility();
    updateCanvasResizeHandlePosition();
  }

  function beginCanvasResizeHandleInteraction(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    if (!canUseCanvasResizeHandle() || state.playback.isPlaying) {
      return;
    }
    const handle = event.currentTarget;
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    syncCanvasResizeOverlayHost();
    canvasResizeHandleState.pointerId = event.pointerId ?? -1;
    canvasResizeHandleState.handle = handle;
    canvasResizeHandleState.anchor = handle.dataset.resizeAnchor === 'start' ? 'start' : 'end';
    canvasResizeHandleState.startClientX = event.clientX;
    canvasResizeHandleState.startClientY = event.clientY;
    canvasResizeHandleState.startWidth = Math.max(1, Math.round(Number(state.width) || 1));
    canvasResizeHandleState.startHeight = Math.max(1, Math.round(Number(state.height) || 1));
    canvasResizeHandleState.previewWidth = canvasResizeHandleState.startWidth;
    canvasResizeHandleState.previewHeight = canvasResizeHandleState.startHeight;
    canvasResizeHandleState.previewOffsetX = 0;
    canvasResizeHandleState.previewOffsetY = 0;
    canvasResizeHandleState.active = true;
    handle.classList.add('is-active');
    try {
      handle.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // Ignore pointer capture errors.
    }
    const preview = dom.canvasResizePreview;
    if (preview instanceof HTMLElement) {
      preview.classList.remove('is-hidden');
      preview.hidden = false;
      preview.setAttribute('aria-hidden', 'false');
      const scale = getPixelAlignedCanvasDisplayScale(state.scale);
      setCanvasResizePreviewRect(
        canvasResizeHandleState.previewWidth * scale,
        canvasResizeHandleState.previewHeight * scale,
        {
          offsetXPx: 0,
          offsetYPx: 0,
        }
      );
    }
    showViewportIndicator(
      formatCanvasResizeIndicatorLabel(
        canvasResizeHandleState.previewWidth,
        canvasResizeHandleState.previewHeight
      ),
      { autoHideMs: null }
    );
    window.addEventListener('pointermove', handleCanvasResizeHandlePointerMove, { passive: false });
    window.addEventListener('pointerup', handleCanvasResizeHandlePointerUp);
    window.addEventListener('pointercancel', handleCanvasResizeHandlePointerCancel);
  }

  function handleCanvasResizeHandlePointerMove(event) {
    if (canvasResizeHandleState.pointerId !== event.pointerId || !canvasResizeHandleState.active) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const scale = getPixelAlignedCanvasDisplayScale(state.scale);
    const dx = event.clientX - canvasResizeHandleState.startClientX;
    const dy = event.clientY - canvasResizeHandleState.startClientY;
    const deltaWidth = Math.round(dx / scale);
    const deltaHeight = Math.round(dy / scale);
    if (canvasResizeHandleState.anchor === 'start') {
      canvasResizeHandleState.previewWidth = clamp(
        canvasResizeHandleState.startWidth - deltaWidth,
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE
      );
      canvasResizeHandleState.previewHeight = clamp(
        canvasResizeHandleState.startHeight - deltaHeight,
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE
      );
      canvasResizeHandleState.previewOffsetX = canvasResizeHandleState.previewWidth - canvasResizeHandleState.startWidth;
      canvasResizeHandleState.previewOffsetY = canvasResizeHandleState.previewHeight - canvasResizeHandleState.startHeight;
    } else {
      canvasResizeHandleState.previewWidth = clamp(
        canvasResizeHandleState.startWidth + deltaWidth,
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE
      );
      canvasResizeHandleState.previewHeight = clamp(
        canvasResizeHandleState.startHeight + deltaHeight,
        MIN_CANVAS_SIZE,
        MAX_CANVAS_SIZE
      );
      canvasResizeHandleState.previewOffsetX = 0;
      canvasResizeHandleState.previewOffsetY = 0;
    }
    setCanvasResizePreviewRect(
      canvasResizeHandleState.previewWidth * scale,
      canvasResizeHandleState.previewHeight * scale,
      {
        offsetXPx: canvasResizeHandleState.previewOffsetX * scale,
        offsetYPx: canvasResizeHandleState.previewOffsetY * scale,
      }
    );
    showViewportIndicator(
      formatCanvasResizeIndicatorLabel(
        canvasResizeHandleState.previewWidth,
        canvasResizeHandleState.previewHeight
      ),
      { autoHideMs: null }
    );
  }

  function handleCanvasResizeHandlePointerUp(event) {
    if (canvasResizeHandleState.pointerId !== event.pointerId) {
      return;
    }
    stopCanvasResizeHandleInteraction({ apply: true });
  }

  function handleCanvasResizeHandlePointerCancel(event) {
    if (canvasResizeHandleState.pointerId !== event.pointerId) {
      return;
    }
    stopCanvasResizeHandleInteraction({ apply: false });
  }

  function setupCanvasResizeHandle() {
    const handles = [dom.canvasResizeHandleStart, dom.canvasResizeHandleCorner].filter(handle => handle instanceof HTMLButtonElement);
    if (!handles.length) {
      return;
    }
    handles.forEach(handle => {
      if (handle.dataset.bound === 'true') {
        return;
      }
      handle.dataset.bound = 'true';
      handle.addEventListener('pointerdown', beginCanvasResizeHandleInteraction);
      handle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
      });
    });
    updateCanvasResizeHandlePosition();
    syncCanvasResizeHandleVisibility();
  }

  return Object.freeze({
    canUseCanvasResizeHandle,
    syncCanvasResizeOverlayHost,
    getCanvasResizeOverlayMetrics,
    setCanvasResizePreviewRect,
    syncCanvasResizeHandleVisibility,
    updateCanvasResizeHandlePosition,
    formatCanvasResizeIndicatorLabel,
    hideViewportIndicator,
    showViewportIndicator,
    stopCanvasResizeHandleInteraction,
    beginCanvasResizeHandleInteraction,
    handleCanvasResizeHandlePointerMove,
    handleCanvasResizeHandlePointerUp,
    handleCanvasResizeHandlePointerCancel,
    setupCanvasResizeHandle,
  });
      }
    })(scope);
  }

  root.canvasResizeHandleWorkflowUtils = Object.freeze({
    createCanvasResizeHandleWorkflowUtils,
  });
})();
