(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createFloatingDrawButtonWorkflowUtils(rawScope = {}) {
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
  function normalizeFloatingDrawButtonScale(value) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_FLOATING_DRAW_BUTTON_SCALE;
    }
    return clamp(numeric, FLOATING_DRAW_BUTTON_SCALE_MIN, FLOATING_DRAW_BUTTON_SCALE_MAX);
  }

  function formatFloatingDrawButtonScale(value) {
    const normalized = normalizeFloatingDrawButtonScale(value);
    return String(Number(normalized.toFixed(2)));
  }

  function updateFloatingDrawButtonScaleControl() {
    const slider = dom.controls.virtualCursorButtonScale;
    const output = dom.controls.virtualCursorButtonScaleValue;
    const scale = state.virtualCursorButtonScale || DEFAULT_FLOATING_DRAW_BUTTON_SCALE;
    if (slider) {
      slider.value = String(scale);
    }
    if (output) {
      output.textContent = `${formatFloatingDrawButtonScale(scale)}×`;
    }
  }

  function setVirtualCursorButtonScale(nextScale, options = {}) {
    const {
      persist = true,
      clampPosition = true,
      updateControl = true,
    } = options || {};
    const normalized = normalizeFloatingDrawButtonScale(nextScale);
    state.virtualCursorButtonScale = normalized;
    floatingDrawButtonState.scale = normalized;
    const button = dom.floatingDrawButton;
    if (button) {
      button.style.setProperty('--floating-draw-button-scale', String(normalized));
    }
    if (dom.floatingMovePad instanceof HTMLElement) {
      dom.floatingMovePad.style.setProperty('--floating-move-pad-scale', String(normalized));
    }
    if (
      clampPosition &&
      button &&
      floatingDrawButtonState.initialized
    ) {
      setFloatingDrawButtonPosition(
        floatingDrawButtonState.position.x,
        floatingDrawButtonState.position.y,
      );
    }
    if (updateControl) {
      updateFloatingDrawButtonScaleControl();
    }
    if (persist) {
      scheduleSessionPersist();
    }
    updateFloatingMovePadPositionIfReady();
  }

  function refreshFloatingDrawButtonScale(button) {
    if (!button || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
      floatingDrawButtonState.scale = state.virtualCursorButtonScale || DEFAULT_FLOATING_DRAW_BUTTON_SCALE;
      return floatingDrawButtonState.scale;
    }
    const computed = window.getComputedStyle(button);
    const raw = computed ? computed.getPropertyValue('--floating-draw-button-scale') : '';
    const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
    const scale = Number.isFinite(parsed) && parsed > 0
      ? normalizeFloatingDrawButtonScale(parsed)
      : (state.virtualCursorButtonScale || DEFAULT_FLOATING_DRAW_BUTTON_SCALE);
    if (!Number.isFinite(parsed) || parsed <= 0 || Math.abs(scale - parsed) > Number.EPSILON) {
      button.style.setProperty('--floating-draw-button-scale', String(scale));
    }
    floatingDrawButtonState.scale = scale;
    state.virtualCursorButtonScale = scale;
    updateFloatingDrawButtonScaleControl();
    return scale;
  }

  function setFloatingDrawButtonPosition(x, y) {
    const button = dom.floatingDrawButton;
    if (!button) {
      return;
    }
    const baseX = floatingDrawButtonState.position.x || 0;
    const baseY = floatingDrawButtonState.position.y || 0;
    const rawX = Number.isFinite(x) ? Math.round(x) : baseX;
    const rawY = Number.isFinite(y) ? Math.round(y) : baseY;
    let scale = floatingDrawButtonState.scale;
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = refreshFloatingDrawButtonScale(button);
    }
    const margin = 8;
    const buttonWidth = button.offsetWidth || button.clientWidth || 0;
    const buttonHeight = button.offsetHeight || button.clientHeight || 0;
    const viewportBounds = getViewportBounds();
    const safeArea = getSafeAreaInsets();
    const scaledWidth = Math.max(0, buttonWidth * scale);
    const scaledHeight = Math.max(0, buttonHeight * scale);
    const minX = Math.round(viewportBounds.left + safeArea.left + margin);
    const minY = Math.round(viewportBounds.top + safeArea.top + margin);
    const maxX = Math.max(minX, Math.round(viewportBounds.right - safeArea.right - scaledWidth - margin));
    const maxY = Math.max(minY, Math.round(viewportBounds.bottom - safeArea.bottom - scaledHeight - margin));
    const clampedX = clamp(rawX, minX, maxX);
    const clampedY = clamp(rawY, minY, maxY);
    floatingDrawButtonState.position.x = clampedX;
    floatingDrawButtonState.position.y = clampedY;
    button.style.setProperty('--floating-draw-button-x', `${clampedX}px`);
    button.style.setProperty('--floating-draw-button-y', `${clampedY}px`);
    floatingDrawButtonState.initialized = true;
    updateFloatingMovePadPositionIfReady();
  }

  function clampFloatingDrawButtonPosition() {
    const button = dom.floatingDrawButton;
    if (!button || !floatingDrawButtonState.initialized) {
      return;
    }
    setFloatingDrawButtonPosition(
      floatingDrawButtonState.position.x,
      floatingDrawButtonState.position.y,
    );
  }

  function handleFloatingDrawButtonResize() {
    resizeVirtualCursorCanvas();
    clampFloatingDrawButtonPosition();
    updateFloatingMovePadPosition();
    handleFloatingPreviewPanelViewportChange();
    requestOverlayRender();
  }

  function getToolIconEntry(tool) {
    if (!tool || !toolButtons.length) {
      return null;
    }
    const button = toolButtons.find(btn => btn.dataset.tool === tool);
    if (!button) {
      return null;
    }
    const img = button.querySelector('img');
    if (!(img instanceof HTMLImageElement)) {
      return null;
    }
    const src = img.currentSrc || img.src;
    if (!src) {
      return null;
    }
    let entry = toolIconCache.get(src);
    if (!entry) {
      const image = new Image();
      entry = {
        image,
        ready: false,
        error: false,
      };
      image.addEventListener('load', () => {
        entry.ready = true;
        requestOverlayRender();
      });
      image.addEventListener('error', () => {
        entry.error = true;
      });
      image.src = src;
      toolIconCache.set(src, entry);
    }
    if (entry.error) {
      return null;
    }
    if (!entry.ready) {
      return null;
    }
    return entry;
  }

  function resolveFloatingDrawButtonPressTarget(event, button) {
    const primaryPaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
    const secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, primaryPaletteIndex);
    if (!(button instanceof HTMLElement)) {
      return { side: 'primary', paletteIndex: primaryPaletteIndex };
    }
    const rect = button.getBoundingClientRect();
    if (Number.isFinite(event?.clientX) && rect.width > 0) {
      const relativeX = event.clientX - rect.left;
      if (relativeX >= rect.width / 2) {
        return { side: 'secondary', paletteIndex: secondaryPaletteIndex };
      }
      return { side: 'primary', paletteIndex: primaryPaletteIndex };
    }
    const localX = Number(event?.offsetX);
    const localWidth = Number(button.clientWidth || button.offsetWidth || 0);
    if (Number.isFinite(localX) && localWidth > 0 && localX >= localWidth / 2) {
      return { side: 'secondary', paletteIndex: secondaryPaletteIndex };
    }
    return { side: 'primary', paletteIndex: primaryPaletteIndex };
  }

  function getColorPerceivedLightness(value) {
    const color = normalizeColorValue(value);
    const alpha = clamp(color.a / 255, 0, 1);
    const lightness = (0.299 * color.r) + (0.587 * color.g) + (0.114 * color.b);
    return (lightness * alpha) + (22 * (1 - alpha));
  }

  function updateFloatingDrawButtonPalettePreview() {
    const button = dom.floatingDrawButton;
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const primaryPaletteIndex = normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex);
    const secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, primaryPaletteIndex);
    const primaryColor = isRgbColorMode()
      ? normalizeColorValue(state.activeRgb)
      : normalizeColorValue(state.palette[primaryPaletteIndex]);
    const secondaryColor = isRgbColorMode()
      ? normalizeColorValue(
        secondaryPaletteIndex !== primaryPaletteIndex
          ? (state.palette[secondaryPaletteIndex] || state.activeRgb)
          : state.activeRgb
      )
      : normalizeColorValue(state.palette[secondaryPaletteIndex] || state.activeRgb);
    button.style.setProperty('--floating-draw-button-primary-color', toCssColor(primaryColor));
    button.style.setProperty('--floating-draw-button-secondary-color', toCssColor(secondaryColor));
    const averageLightness = (
      getColorPerceivedLightness(primaryColor) + getColorPerceivedLightness(secondaryColor)
    ) / 2;
    const isBrightBase = averageLightness >= 152;
    button.style.setProperty(
      '--floating-draw-button-text-color',
      isBrightBase ? 'rgba(16, 22, 30, 0.94)' : 'rgba(248, 252, 255, 0.96)'
    );
    button.style.setProperty(
      '--floating-draw-button-divider-color',
      isBrightBase ? 'rgba(10, 14, 20, 0.46)' : 'rgba(255, 255, 255, 0.42)'
    );
  }

  function performVirtualCursorAction({ drawPaletteIndex = null } = {}) {
    if (state.playback.isPlaying) {
      return;
    }
    if (!state.showVirtualCursor || !virtualCursor) {
      return;
    }
    const position = {
      x: clamp(Math.floor(virtualCursor.x), 0, state.width - 1),
      y: clamp(Math.floor(virtualCursor.y), 0, state.height - 1),
    };
    const activeTool = state.tool;
    const layer = getActiveLayer();
    let startedHistory = false;
    let actionPerformed = false;

    const beginHistoryIfNeeded = () => {
      if (!startedHistory && HISTORY_DRAW_TOOLS.has(activeTool)) {
        beginHistory(activeTool);
        startedHistory = true;
      }
    };

    if (activeTool === 'eyedropper') {
      sampleColor(position.x, position.y);
      actionPerformed = true;
      requestOverlayRender();
      scheduleSessionPersist();
      return;
    }

    if (activeTool === 'selectSame') {
      createSelectionByColor(position.x, position.y);
      actionPerformed = true;
      scheduleSessionPersist();
      return;
    }

    if (activeTool === 'selectRect') {
      createSelectionRect(position, position);
      actionPerformed = true;
      scheduleSessionPersist();
      return;
    }

    if (activeTool === 'selectLasso') {
      const points = [
        { x: position.x, y: position.y },
        { x: clamp(position.x + 1, 0, state.width - 1), y: position.y },
        {
          x: clamp(position.x + 1, 0, state.width - 1),
          y: clamp(position.y + 1, 0, state.height - 1),
        },
        { x: position.x, y: clamp(position.y + 1, 0, state.height - 1) },
      ];
      createSelectionLasso(points);
      actionPerformed = true;
      scheduleSessionPersist();
      return;
    }

    if (activeTool === 'move') {
      // Move tool requires drag; single tap falls back to selection highlight.
      if (state.selectionMask) {
        // keep selection active; nothing else to do
        actionPerformed = true;
      }
      scheduleSessionPersist();
      return;
    }

    if (!layer && HISTORY_DRAW_TOOLS.has(activeTool)) {
      return;
    }

    const previousDrawPaletteIndex = pointerState.drawPaletteIndex;
    pointerState.drawPaletteIndex = HISTORY_DRAW_TOOLS.has(activeTool) && Number.isFinite(drawPaletteIndex)
      ? normalizePaletteIndex(drawPaletteIndex, state.activePaletteIndex)
      : null;

    try {
      beginHistoryIfNeeded();

      switch (activeTool) {
        case 'pen':
        case 'eraser':
          applyBrushStroke(position.x, position.y, position.x, position.y);
          actionPerformed = true;
          break;
        case 'fill':
          floodFill(position.x, position.y, pointerState.drawPaletteIndex);
          actionPerformed = true;
          break;
        case 'line':
          drawLine(position, position);
          actionPerformed = true;
          break;
        case 'rect':
          drawRectangle(position, position, false);
          actionPerformed = true;
          break;
        case 'rectFill':
          drawRectangle(position, position, true);
          actionPerformed = true;
          break;
        case 'ellipse':
          drawEllipse(position, position, false);
          actionPerformed = true;
          break;
        case 'ellipseFill':
          drawEllipse(position, position, true);
          actionPerformed = true;
          break;
        case 'oval':
          drawOval(position, position, false);
          actionPerformed = true;
          break;
        case 'ovalFill':
          drawOval(position, position, true);
          actionPerformed = true;
          break;
        case 'curve':
          applyBrushStroke(position.x, position.y, position.x, position.y);
          actionPerformed = true;
          break;
        default:
          break;
      }
    } finally {
      pointerState.drawPaletteIndex = previousDrawPaletteIndex;
    }

    if (startedHistory) {
      if (actionPerformed) {
        commitHistory();
      } else {
        rollbackPendingHistory({ reRender: false });
      }
    }

    if (actionPerformed) {
      requestOverlayRender();
      scheduleSessionPersist();
    }
  }

  function teardownFloatingDrawButtonPointerHandlers() {
    window.removeEventListener('pointermove', handleFloatingDrawButtonPointerMove);
    window.removeEventListener('pointerup', handleFloatingDrawButtonPointerUp);
    window.removeEventListener('pointercancel', handleFloatingDrawButtonPointerCancel);
  }

  function handleFloatingDrawButtonPointerDown(event) {
    markSaveInteractionActivity();
    if (state.playback.isPlaying) {
      return;
    }
    // Spectators cannot draw using the floating draw button
    if (isMultiSpectatorMode()) {
      setMultiStatus(localizeText('視聴モードでは描画できません', 'Drawing is disabled in viewer mode'), 'warn');
      return;
    }
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    event.preventDefault();
    const button = dom.floatingDrawButton;
    if (!button) {
      return;
    }
    const pressTarget = resolveFloatingDrawButtonPressTarget(event, button);
    floatingDrawButtonState.pointerId = event.pointerId ?? -1;
    floatingDrawButtonState.pointerType = typeof event.pointerType === 'string' ? event.pointerType : null;
    floatingDrawButtonState.dragging = false;
    floatingDrawButtonState.startPointer = { x: event.clientX, y: event.clientY };
    floatingDrawButtonState.startPosition = { ...floatingDrawButtonState.position };
    floatingDrawButtonState.startCursorCell = getVirtualCursorCellPosition();
    floatingDrawButtonState.drawPaletteIndex = pressTarget.paletteIndex;
    floatingDrawButtonState.drawMoved = false;
    floatingDrawButtonState.drawSessionStarted = startVirtualCursorDrawSession({
      drawPaletteIndex: floatingDrawButtonState.drawPaletteIndex,
    });
    button.dataset.drawSide = pressTarget.side;
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // ignore capture errors
    }
    window.addEventListener('pointermove', handleFloatingDrawButtonPointerMove);
    window.addEventListener('pointerup', handleFloatingDrawButtonPointerUp);
    window.addEventListener('pointercancel', handleFloatingDrawButtonPointerCancel);
  }

  function handleFloatingDrawButtonPointerMove(event) {
    markSaveInteractionActivity();
    if (floatingDrawButtonState.pointerId !== event.pointerId) {
      return;
    }
    const drawSessionTool = virtualCursorDrawState.active ? virtualCursorDrawState.tool : null;
    if (
      floatingDrawButtonState.drawSessionStarted
      && drawSessionTool
      && VIRTUAL_CURSOR_MOVE_TOOLS.has(drawSessionTool)
    ) {
      // In selection-move mode, keep this finger anchored on Draw.
      // Virtual cursor movement should come from a second touch on the canvas.
      event.preventDefault();
      return;
    }
    const dx = event.clientX - (floatingDrawButtonState.startPointer?.x || 0);
    const dy = event.clientY - (floatingDrawButtonState.startPointer?.y || 0);
    if (!floatingDrawButtonState.dragging) {
      const distance = Math.hypot(dx, dy);
      const pointerType = floatingDrawButtonState.pointerType;
      const dragThreshold = (pointerType === 'touch' || pointerType === 'pen')
        ? DRAW_BUTTON_DRAG_THRESHOLD_TOUCH
        : DRAW_BUTTON_DRAG_THRESHOLD;
      if (distance >= dragThreshold) {
        const isActiveDrawingHold = floatingDrawButtonState.drawSessionStarted && floatingDrawButtonState.drawMoved;
        if (isActiveDrawingHold) {
          return;
        }
        floatingDrawButtonState.dragging = true;
        if (virtualCursorDrawState.active) {
          cancelVirtualCursorDrawSession();
        }
        floatingDrawButtonState.drawSessionStarted = false;
        floatingDrawButtonState.drawPaletteIndex = null;
        floatingDrawButtonState.drawMoved = false;
        const button = dom.floatingDrawButton;
        if (button instanceof HTMLElement) {
          delete button.dataset.drawSide;
        }
      }
    }
    if (floatingDrawButtonState.dragging) {
      const nextX = (floatingDrawButtonState.startPosition?.x || 0) + dx;
      const nextY = (floatingDrawButtonState.startPosition?.y || 0) + dy;
      setFloatingDrawButtonPosition(nextX, nextY);
    }
  }

  function handleFloatingDrawButtonPointerUp(event) {
    markSaveInteractionActivity();
    if (floatingDrawButtonState.pointerId !== event.pointerId) {
      return;
    }
    teardownFloatingDrawButtonPointerHandlers();
    const button = dom.floatingDrawButton;
    if (button) {
      try {
        button.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        // ignore release errors
      }
    }
    const wasDragging = floatingDrawButtonState.dragging;
    const wasDrawing = virtualCursorDrawState.active;
    const drawPaletteIndex = Number.isFinite(floatingDrawButtonState.drawPaletteIndex)
      ? floatingDrawButtonState.drawPaletteIndex
      : null;
    floatingDrawButtonState.pointerId = null;
    floatingDrawButtonState.pointerType = null;
    floatingDrawButtonState.dragging = false;
    floatingDrawButtonState.startPointer = null;
    floatingDrawButtonState.startPosition = null;
    floatingDrawButtonState.startCursorCell = null;
    floatingDrawButtonState.drawPaletteIndex = null;
    floatingDrawButtonState.drawMoved = false;
    floatingDrawButtonState.drawSessionStarted = false;
    if (button instanceof HTMLElement) {
      delete button.dataset.drawSide;
    }
    if (wasDrawing) {
      if (wasDragging) {
        cancelVirtualCursorDrawSession();
      } else {
        finishVirtualCursorDrawSession({ commit: true });
      }
      return;
    }
    if (!wasDragging) {
      performVirtualCursorAction({ drawPaletteIndex });
    }
  }

  function handleFloatingDrawButtonPointerCancel(event) {
    markSaveInteractionActivity();
    if (floatingDrawButtonState.pointerId !== event.pointerId) {
      return;
    }
    teardownFloatingDrawButtonPointerHandlers();
    const button = dom.floatingDrawButton;
    if (button) {
      try {
        button.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        // ignore release errors
      }
    }
    cancelVirtualCursorDrawSession();
    floatingDrawButtonState.pointerId = null;
    floatingDrawButtonState.pointerType = null;
    floatingDrawButtonState.dragging = false;
    floatingDrawButtonState.startPointer = null;
    floatingDrawButtonState.startPosition = null;
    floatingDrawButtonState.startCursorCell = null;
    floatingDrawButtonState.drawPaletteIndex = null;
    floatingDrawButtonState.drawMoved = false;
    floatingDrawButtonState.drawSessionStarted = false;
    if (button instanceof HTMLElement) {
      delete button.dataset.drawSide;
    }
  }

  function updateFloatingDrawButtonEnabledState() {
    const button = dom.floatingDrawButton;
    if (!(button instanceof HTMLButtonElement)) {
      syncVirtualCursorControlVisibility({ syncToggle: true });
      return;
    }
    updateFloatingDrawButtonPalettePreview();
    const hidden = layoutMode !== 'mobilePortrait' || !state.showVirtualCursor;
    if (hidden) {
      button.classList.add('is-disabled');
      button.classList.add('is-hidden');
      button.setAttribute('hidden', '');
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('aria-disabled', 'true');
      teardownFloatingDrawButtonPointerHandlers();
      try {
        if (floatingDrawButtonState.pointerId !== null) {
          button.releasePointerCapture?.(floatingDrawButtonState.pointerId);
        }
      } catch (error) {
        // ignore release errors
      }
      cancelVirtualCursorDrawSession();
      floatingDrawButtonState.pointerId = null;
      floatingDrawButtonState.pointerType = null;
      floatingDrawButtonState.dragging = false;
      floatingDrawButtonState.startPointer = null;
      floatingDrawButtonState.startPosition = null;
      floatingDrawButtonState.startCursorCell = null;
      floatingDrawButtonState.drawPaletteIndex = null;
      floatingDrawButtonState.drawMoved = false;
      floatingDrawButtonState.drawSessionStarted = false;
      delete button.dataset.drawSide;
    } else {
      button.classList.remove('is-hidden');
      button.classList.remove('is-disabled');
      button.removeAttribute('hidden');
      button.setAttribute('aria-hidden', 'false');
      button.setAttribute('aria-disabled', 'false');
      delete button.dataset.drawSide;
      clampFloatingDrawButtonPosition();
    }
    syncVirtualCursorControlVisibility({ syncToggle: true });
  }

  function setupFloatingDrawButton() {
    const button = dom.floatingDrawButton;
    const viewport = dom.canvasViewport;
    if (!button || !viewport) {
      return;
    }
    setVirtualCursorButtonScale(state.virtualCursorButtonScale, { persist: false, clampPosition: false });
    const scale = refreshFloatingDrawButtonScale(button);
    updateFloatingDrawButtonPalettePreview();
    button.addEventListener('pointerdown', handleFloatingDrawButtonPointerDown);
    button.addEventListener('click', event => event.preventDefault());
    if (!drawButtonResizeListenerBound) {
      window.addEventListener('resize', handleFloatingDrawButtonResize);
      drawButtonResizeListenerBound = true;
    }
    if (!floatingDrawButtonState.initialized) {
      const initialX = 16;
      const baseHeight = button.offsetHeight || button.clientHeight || 48;
      const scaledHeight = Math.max(0, baseHeight * (Number.isFinite(scale) && scale > 0 ? scale : 1));
      const initialY = Math.max(16, (viewport.clientHeight || 0) - scaledHeight - 32);
      setFloatingDrawButtonPosition(initialX, initialY);
    } else {
      clampFloatingDrawButtonPosition();
    }
    updateFloatingDrawButtonEnabledState();
    updateFloatingMovePadPosition();
  }

  return Object.freeze({
    normalizeFloatingDrawButtonScale,
    formatFloatingDrawButtonScale,
    updateFloatingDrawButtonScaleControl,
    setVirtualCursorButtonScale,
    refreshFloatingDrawButtonScale,
    setFloatingDrawButtonPosition,
    clampFloatingDrawButtonPosition,
    handleFloatingDrawButtonResize,
    getToolIconEntry,
    resolveFloatingDrawButtonPressTarget,
    getColorPerceivedLightness,
    updateFloatingDrawButtonPalettePreview,
    performVirtualCursorAction,
    teardownFloatingDrawButtonPointerHandlers,
    handleFloatingDrawButtonPointerDown,
    handleFloatingDrawButtonPointerMove,
    handleFloatingDrawButtonPointerUp,
    handleFloatingDrawButtonPointerCancel,
    updateFloatingDrawButtonEnabledState,
    setupFloatingDrawButton,
  });
      }
    })(scope);
  }

  root.floatingDrawButtonWorkflowUtils = Object.freeze({
    createFloatingDrawButtonWorkflowUtils,
  });
})();
