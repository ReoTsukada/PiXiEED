(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasResizeWorkflowUtils(rawScope = {}) {
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
  let canvasResizeViewportPreviewRefreshRaf = 0;

  function queueCanvasResizeViewportPreviewRefresh() {
    if (canvasResizeViewportPreviewRefreshRaf || !(dom.canvasResizeExpansionPreview instanceof HTMLElement)) return;
    canvasResizeViewportPreviewRefreshRaf = window.requestAnimationFrame(() => {
      canvasResizeViewportPreviewRefreshRaf = 0;
      const { width, height, edges } = syncCanvasResizeDimensionsFromEdges();
      updateCanvasResizePreview(width, height, { offsetX: edges.left, offsetY: edges.top });
    });
  }

  function applyEmbedGuardrails() {
    const lockWidth = lockedCanvasWidth !== null;
    const lockHeight = lockedCanvasHeight !== null;
    const lockAnySize = lockWidth || lockHeight;
    if (dom.controls.canvasWidth instanceof HTMLInputElement) {
      if (lockWidth) {
        dom.controls.canvasWidth.value = String(lockedCanvasWidth);
      }
      if (lockAnySize) {
        dom.controls.canvasWidth.setAttribute('disabled', 'true');
        dom.controls.canvasWidth.setAttribute('aria-disabled', 'true');
      }
    }
    if (dom.controls.canvasHeight instanceof HTMLInputElement) {
      if (lockHeight) {
        dom.controls.canvasHeight.value = String(lockedCanvasHeight);
      }
      if (lockAnySize) {
        dom.controls.canvasHeight.setAttribute('disabled', 'true');
        dom.controls.canvasHeight.setAttribute('aria-disabled', 'true');
      }
    }
    if (lockWidth && dom.newProject?.widthInput) {
      dom.newProject.widthInput.value = String(lockedCanvasWidth);
      dom.newProject.widthInput.readOnly = true;
      dom.newProject.widthInput.setAttribute('aria-readonly', 'true');
      dom.newProject.widthInput.title = 'キャンバスは固定サイズで利用中';
    }
    if (lockHeight && dom.newProject?.heightInput) {
      dom.newProject.heightInput.value = String(lockedCanvasHeight);
      dom.newProject.heightInput.readOnly = true;
      dom.newProject.heightInput.setAttribute('aria-readonly', 'true');
      dom.newProject.heightInput.title = 'キャンバスは固定サイズで利用中';
    }
    updateCanvasResizeControls({ normalizeValues: true });
  }

  function getCanvasResizeInputValue(input, fallback) {
    const fallbackValue = clamp(Math.round(Number(fallback) || MIN_CANVAS_SIZE), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const numeric = Math.round(Number(input?.value));
    if (!Number.isFinite(numeric)) {
      return fallbackValue;
    }
    return clamp(numeric, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
  }

  function getCanvasResizeEdgeValue(input) {
    const value = Math.round(Number(input?.value));
    return Number.isFinite(value) ? clamp(value, -(MAX_CANVAS_SIZE - 1), MAX_CANVAS_SIZE - 1) : 0;
  }

  function getCanvasResizeEdges() {
    return {
      top: getCanvasResizeEdgeValue(dom.controls.canvasExpandTop),
      right: getCanvasResizeEdgeValue(dom.controls.canvasExpandRight),
      bottom: getCanvasResizeEdgeValue(dom.controls.canvasExpandBottom),
      left: getCanvasResizeEdgeValue(dom.controls.canvasExpandLeft),
    };
  }

  function syncCanvasResizeDimensionsFromEdges({ normalizeValues = false } = {}) {
    const edges = getCanvasResizeEdges();
    const width = clamp(state.width + edges.left + edges.right, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const height = clamp(state.height + edges.top + edges.bottom, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    if (dom.controls.canvasWidth instanceof HTMLInputElement) dom.controls.canvasWidth.value = String(width);
    if (dom.controls.canvasHeight instanceof HTMLInputElement) dom.controls.canvasHeight.value = String(height);
    if (normalizeValues) {
      const inputByEdge = { top: dom.controls.canvasExpandTop, right: dom.controls.canvasExpandRight, bottom: dom.controls.canvasExpandBottom, left: dom.controls.canvasExpandLeft };
      Object.entries(edges).forEach(([edge, value]) => {
        if (inputByEdge[edge] instanceof HTMLInputElement) inputByEdge[edge].value = String(value);
      });
    }
    return { width, height, edges };
  }

  function updateCanvasResizePreview(width, height, { offsetX, offsetY }) {
    const preview = dom.controls.canvasResizeViewportPreview;
    const shades = Array.isArray(dom.controls.canvasResizeViewportShades) ? dom.controls.canvasResizeViewportShades : [];
    const expansionPreview = dom.canvasResizeExpansionPreview;
    const expansionRegions = Array.isArray(dom.canvasResizeExpansionRegions) ? dom.canvasResizeExpansionRegions : [];
    const cropLeft = clamp(-offsetX, 0, state.width);
    const cropTop = clamp(-offsetY, 0, state.height);
    const cropRight = clamp(state.width - (width - offsetX), 0, state.width);
    const cropBottom = clamp(state.height - (height - offsetY), 0, state.height);
    const crop = { top: cropTop, right: cropRight, bottom: cropBottom, left: cropLeft };
    const expansion = {
      left: clamp(offsetX, 0, Number.MAX_SAFE_INTEGER),
      top: clamp(offsetY, 0, Number.MAX_SAFE_INTEGER),
      right: clamp(width - offsetX - state.width, 0, Number.MAX_SAFE_INTEGER),
      bottom: clamp(height - offsetY - state.height, 0, Number.MAX_SAFE_INTEGER),
    };
    const drawingCanvas = dom.canvases?.drawing;
    const expansionHost = dom.mainCanvasArea;
    const drawingRect = drawingCanvas instanceof HTMLCanvasElement ? drawingCanvas.getBoundingClientRect() : null;
    const hostRect = expansionHost instanceof HTMLElement ? expansionHost.getBoundingClientRect() : null;
    if (preview instanceof HTMLElement) {
      preview.hidden = !Object.values(crop).some(value => value > 0);
      shades.forEach(shade => {
        if (!(shade instanceof HTMLElement)) return;
        const side = shade.dataset.canvasResizeShade;
        const value = crop[side] || 0;
        shade.style.setProperty('--canvas-resize-crop', `${(value / (side === 'top' || side === 'bottom' ? Math.max(1, state.height) : Math.max(1, state.width))) * 100}%`);
        shade.hidden = value <= 0;
      });
    }
    if (!(expansionPreview instanceof HTMLElement) || !drawingRect || !hostRect) return;
    const hasExpansion = Object.values(expansion).some(value => value > 0);
    expansionPreview.hidden = !hasExpansion;
    if (!hasExpansion) return;
    const scaleX = drawingRect.width / Math.max(1, state.width);
    const scaleY = drawingRect.height / Math.max(1, state.height);
    const leftPx = expansion.left * scaleX;
    const rightPx = expansion.right * scaleX;
    const topPx = expansion.top * scaleY;
    const bottomPx = expansion.bottom * scaleY;
    expansionPreview.style.left = `${Math.round(drawingRect.left - hostRect.left - leftPx)}px`;
    expansionPreview.style.top = `${Math.round(drawingRect.top - hostRect.top - topPx)}px`;
    expansionPreview.style.width = `${Math.round(drawingRect.width + leftPx + rightPx)}px`;
    expansionPreview.style.height = `${Math.round(drawingRect.height + topPx + bottomPx)}px`;
    expansionRegions.forEach(region => {
      if (!(region instanceof HTMLElement)) return;
      const side = region.dataset.canvasResizeExpansion;
      const value = side === 'left' || side === 'right'
        ? expansion[side] * scaleX
        : expansion[side] * scaleY;
      region.hidden = value <= 0;
      region.style.setProperty('--canvas-resize-expansion-size', `${Math.round(value)}px`);
      region.style.setProperty('--canvas-resize-expansion-top', `${Math.round(topPx)}px`);
      region.style.setProperty('--canvas-resize-expansion-bottom', `${Math.round(bottomPx)}px`);
    });
  }

  function resetCanvasResizeEdges() {
    [dom.controls.canvasExpandTop, dom.controls.canvasExpandRight, dom.controls.canvasExpandBottom, dom.controls.canvasExpandLeft].forEach(input => {
      if (input instanceof HTMLInputElement) input.value = '0';
    });
    syncCanvasResizeDimensionsFromEdges({ normalizeValues: true });
  }

  function updateCanvasResizeEdgeControls() {
    const disabled = !canCurrentClientEditProjectStructure()
      || lockedCanvasWidth !== null
      || lockedCanvasHeight !== null;
    [dom.controls.canvasExpandTop, dom.controls.canvasExpandRight, dom.controls.canvasExpandBottom, dom.controls.canvasExpandLeft].forEach(input => {
      if (input instanceof HTMLInputElement) input.disabled = disabled;
    });
    if (dom.controls.resetCanvasResize instanceof HTMLButtonElement) dom.controls.resetCanvasResize.disabled = disabled;
  }

  function updateCanvasResizeAnchorControls() {
    updateCanvasResizeEdgeControls();
    updateCanvasResizeSummary();
  }

  function updateCanvasResizeSummary() {
    const summary = dom.controls.canvasResizeSummary;
    const { width, height, edges } = syncCanvasResizeDimensionsFromEdges();
    const offset = { offsetX: edges.left, offsetY: edges.top };
    updateCanvasResizePreview(width, height, offset);
    if (!(summary instanceof HTMLOutputElement)) return;
    summary.textContent = `${width} × ${height} px`;
  }

  function updateCanvasResizeControls({ normalizeValues = false } = {}) {
    const widthInput = dom.controls.canvasWidth;
    const heightInput = dom.controls.canvasHeight;
    if (!(widthInput instanceof HTMLInputElement) || !(heightInput instanceof HTMLInputElement)) {
      return;
    }
    const canResize = canCurrentClientEditProjectStructure()
      && lockedCanvasWidth === null
      && lockedCanvasHeight === null;

    widthInput.min = String(MIN_CANVAS_SIZE);
    widthInput.max = String(MAX_CANVAS_SIZE);
    widthInput.step = '1';
    heightInput.min = String(MIN_CANVAS_SIZE);
    heightInput.max = String(MAX_CANVAS_SIZE);
    heightInput.step = '1';

    const edgeResize = syncCanvasResizeDimensionsFromEdges({ normalizeValues });
    const width = edgeResize.width;
    const height = edgeResize.height;
    const active = document.activeElement;
    if (normalizeValues || active !== widthInput) {
      widthInput.value = String(width);
    }
    if (normalizeValues || active !== heightInput) {
      heightInput.value = String(height);
    }

    const decWidthDisabled = !canResize || width <= MIN_CANVAS_SIZE;
    const incWidthDisabled = !canResize || width >= MAX_CANVAS_SIZE;
    const decHeightDisabled = !canResize || height <= MIN_CANVAS_SIZE;
    const incHeightDisabled = !canResize || height >= MAX_CANVAS_SIZE;
    if (dom.controls.canvasWidthDecrement instanceof HTMLButtonElement) {
      dom.controls.canvasWidthDecrement.disabled = decWidthDisabled;
    }
    if (dom.controls.canvasWidthIncrement instanceof HTMLButtonElement) {
      dom.controls.canvasWidthIncrement.disabled = incWidthDisabled;
    }
    if (dom.controls.canvasHeightDecrement instanceof HTMLButtonElement) {
      dom.controls.canvasHeightDecrement.disabled = decHeightDisabled;
    }
    if (dom.controls.canvasHeightIncrement instanceof HTMLButtonElement) {
      dom.controls.canvasHeightIncrement.disabled = incHeightDisabled;
    }
    updateCanvasResizeAnchorControls();
    updateSettingsSizeApplyButtonState();
  }

  function adjustCanvasResizeInputBy(target, delta) {
    const axis = target === 'height' ? 'height' : 'width';
    const input = axis === 'height' ? dom.controls.canvasHeight : dom.controls.canvasWidth;
    if (!(input instanceof HTMLInputElement) || input.disabled) {
      return;
    }
    const base = axis === 'height' ? state.height : state.width;
    const current = getCanvasResizeInputValue(input, base);
    const step = Math.max(1, Math.round(Number(delta) || 0));
    const next = clamp(current + (delta < 0 ? -step : step), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    if (next === current) {
      updateCanvasResizeControls();
      return;
    }
    input.value = String(next);
    updateCanvasResizeControls();
  }

  function applyCanvasResizeDimensions(
    width,
    height,
    {
      restoreFocusInput = null,
      preserveAnchoredContent = false,
      contentOffsetX = 0,
      contentOffsetY = 0,
    } = {}
  ) {
    const nextWidth = clamp(Math.round(Number(width) || state.width), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const nextHeight = clamp(Math.round(Number(height) || state.height), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    if (nextWidth === state.width && nextHeight === state.height) {
      updateCanvasResizeControls({ normalizeValues: true });
      return false;
    }

    const resizeStartedAt = typeof performance?.now === 'function' ? performance.now() : Date.now();
    const previousWidth = state.width;
    const previousHeight = state.height;
    const scale = getPixelAlignedCanvasDisplayScale(state.scale);
    // Local projects use a dedicated resize entry; shared projects keep the
    // established structural snapshot transport for peer synchronization.
    beginHistory('resizeCanvas');
    const historyPreparedAt = typeof performance?.now === 'function' ? performance.now() : Date.now();
    resizeAllLayers(nextWidth, nextHeight, {
      offsetX: Math.round(Number(contentOffsetX) || 0),
      offsetY: Math.round(Number(contentOffsetY) || 0),
    });
    const layersResizedAt = typeof performance?.now === 'function' ? performance.now() : Date.now();
    state.width = nextWidth;
    state.height = nextHeight;
    setPendingCanvasResizeHistoryResult({
      offsetX: Math.round(Number(contentOffsetX) || 0),
      offsetY: Math.round(Number(contentOffsetY) || 0),
    });
    translateMirrorPivotForCanvasResize(nextWidth, nextHeight, {
      offsetX: Math.round(Number(contentOffsetX) || 0),
      offsetY: Math.round(Number(contentOffsetY) || 0),
    });
    if (preserveAnchoredContent) {
      const widthDelta = nextWidth - previousWidth;
      const heightDelta = nextHeight - previousHeight;
      state.pan.x = Math.round(
        (Number(state.pan.x) || 0) + ((((widthDelta) / 2) - contentOffsetX) * scale)
      );
      state.pan.y = Math.round(
        (Number(state.pan.y) || 0) + ((((heightDelta) / 2) - contentOffsetY) * scale)
      );
    }
    if (dom.controls.canvasWidth instanceof HTMLInputElement) {
      dom.controls.canvasWidth.value = String(nextWidth);
    }
    if (dom.controls.canvasHeight instanceof HTMLInputElement) {
      dom.controls.canvasHeight.value = String(nextHeight);
    }
    resetCanvasResizeEdges();
    markHistoryDirty();
    resizeCanvases();
    clearSelection();
    requestRender();
    requestOverlayRender();
    commitHistory();
    const historyCommittedAt = typeof performance?.now === 'function' ? performance.now() : Date.now();
    scheduleSessionPersist();
    updateCanvasResizeControls({ normalizeValues: true });
    const resizeFinishedAt = typeof performance?.now === 'function' ? performance.now() : Date.now();
    console.info('[pixiedraw:performance]', {
      phase: 'pixiedraw:canvas-resize',
      from: { width: previousWidth, height: previousHeight },
      to: { width: nextWidth, height: nextHeight },
      frameCount: Array.isArray(state.frames) ? state.frames.length : 0,
      layerCount: Array.isArray(state.frames)
        ? state.frames.reduce((total, frame) => total + (Array.isArray(frame?.layers) ? frame.layers.length : 0), 0)
        : 0,
      historyPrepareMs: Math.round(historyPreparedAt - resizeStartedAt),
      resizeLayersMs: Math.round(layersResizedAt - historyPreparedAt),
      historyCommitMs: Math.round(historyCommittedAt - layersResizedAt),
      uiSyncMs: Math.round(resizeFinishedAt - historyCommittedAt),
      totalMs: Math.round(resizeFinishedAt - resizeStartedAt),
    });

    if (restoreFocusInput instanceof HTMLInputElement && !restoreFocusInput.disabled && restoreFocusInput.isConnected) {
      window.requestAnimationFrame(() => {
        try {
          restoreFocusInput.focus({ preventScroll: true });
        } catch (error) {
          restoreFocusInput.focus();
        }
        const valueLength = String(restoreFocusInput.value || '').length;
        if (typeof restoreFocusInput.setSelectionRange === 'function') {
          try {
            restoreFocusInput.setSelectionRange(valueLength, valueLength);
          } catch (error) {
            // Ignore selection range errors for unsupported input types/browsers.
          }
        }
      });
    }
    return true;
  }

  function handleCanvasResizeRequest(options = {}) {
    const restoreFocusInput = options.restoreFocusInput instanceof HTMLInputElement
      ? options.restoreFocusInput
      : null;
    const restoreFocus = () => {
      if (!(restoreFocusInput instanceof HTMLInputElement) || restoreFocusInput.disabled || !restoreFocusInput.isConnected) {
        return;
      }
      window.requestAnimationFrame(() => {
        try {
          restoreFocusInput.focus({ preventScroll: true });
        } catch (error) {
          restoreFocusInput.focus();
        }
        const valueLength = String(restoreFocusInput.value || '').length;
        if (typeof restoreFocusInput.setSelectionRange === 'function') {
          try {
            restoreFocusInput.setSelectionRange(valueLength, valueLength);
          } catch (error) {
            // Ignore selection range errors for unsupported input types/browsers.
          }
        }
      });
    };

    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(localizeText('参加/視聴モードではキャンバスサイズはマスターのみ変更できます', 'In participant/viewer mode, only the master can change canvas size'), 'warn');
      }
      updateCanvasResizeControls({ normalizeValues: true });
      restoreFocus();
      return;
    }
    if (lockedCanvasWidth !== null || lockedCanvasHeight !== null) {
      if (dom.controls.canvasWidth) {
        dom.controls.canvasWidth.value = String(state.width);
      }
      if (dom.controls.canvasHeight) {
        dom.controls.canvasHeight.value = String(state.height);
      }
      updateCanvasResizeControls({ normalizeValues: true });
      restoreFocus();
      return;
    }
    const { width, height, edges } = syncCanvasResizeDimensionsFromEdges({ normalizeValues: true });
    if (width === state.width && height === state.height) {
      dom.controls.canvasWidth.value = String(state.width);
      dom.controls.canvasHeight.value = String(state.height);
      updateCanvasResizeControls({ normalizeValues: true });
      restoreFocus();
      return;
    }
    applyCanvasResizeDimensions(width, height, {
      restoreFocusInput,
      contentOffsetX: edges.left,
      contentOffsetY: edges.top,
    });
  }

  function applySettingsSizeChanges() {
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(localizeText('参加/視聴モードではサイズ変更はマスターのみ操作できます', 'In participant/viewer mode, only the master can change size settings'), 'warn');
      }
      updateCanvasResizeControls({ normalizeValues: true });
      updateSpriteScaleControlLimits();
      return;
    }
    const shouldResizeCanvas = hasPendingCanvasResizeInputChange();
    const spriteScaleValue = dom.controls.spriteScaleInput?.value ?? 1;
    const shouldScaleSprite = hasPendingSpriteScaleInputChange();
    if (shouldResizeCanvas) {
      handleCanvasResizeRequest();
    }
    if (shouldScaleSprite) {
      applySpriteScaleMultiplier(spriteScaleValue);
      return;
    }
    updateCanvasResizeControls({ normalizeValues: true });
    updateSpriteScaleControlLimits();
  }

  function setupNumberSteppers() {
    const expansionPreview = dom.canvasResizeExpansionPreview;
    if (expansionPreview instanceof HTMLElement && expansionPreview.dataset.viewportFollowBound !== 'true') {
      expansionPreview.dataset.viewportFollowBound = 'true';
      window.addEventListener('pixiedraw:viewport-transform', queueCanvasResizeViewportPreviewRefresh);
      window.addEventListener('resize', queueCanvasResizeViewportPreviewRefresh, { passive: true });
    }
    [dom.controls.canvasExpandTop, dom.controls.canvasExpandRight, dom.controls.canvasExpandBottom, dom.controls.canvasExpandLeft].forEach(input => {
      if (!(input instanceof HTMLInputElement) || input.dataset.canvasResizeBound === 'true') return;
      input.dataset.canvasResizeBound = 'true';
      input.addEventListener('input', () => updateCanvasResizeControls());
      input.addEventListener('change', () => updateCanvasResizeControls({ normalizeValues: true }));
      input.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.isComposing) return;
        event.preventDefault();
        applySettingsSizeChanges();
      });
    });
    const resetButton = dom.controls.resetCanvasResize;
    if (resetButton instanceof HTMLButtonElement && resetButton.dataset.canvasResizeBound !== 'true') {
      resetButton.dataset.canvasResizeBound = 'true';
      resetButton.addEventListener('click', () => {
        resetCanvasResizeEdges();
        updateCanvasResizeControls({ normalizeValues: true });
      });
    }
    const inputs = document.querySelectorAll('input[type="number"][data-stepper]');
    inputs.forEach(input => {
      const wrapper = input.closest('.number-stepper');
      if (wrapper instanceof HTMLElement && wrapper.parentElement) {
        wrapper.parentElement.insertBefore(input, wrapper);
        wrapper.remove();
      }
      input.dataset.stepperAttached = 'true';
    });
  }

  function resizeAllLayers(width, height, { offsetX = 0, offsetY = 0 } = {}) {
    const shiftX = Math.round(Number(offsetX) || 0);
    const shiftY = Math.round(Number(offsetY) || 0);
    const sourceWidth = state.width;
    const sourceHeight = state.height;
    const sourceStartX = Math.max(0, -shiftX);
    const sourceEndX = Math.min(sourceWidth, width - shiftX);
    const sourceStartY = Math.max(0, -shiftY);
    const sourceEndY = Math.min(sourceHeight, height - shiftY);
    const copyWidth = Math.max(0, sourceEndX - sourceStartX);
    state.frames.forEach(frame => {
      frame.layers = frame.layers.map(layer => {
        // Imported GIF frames and inactive cels can use compact/tiled backing
        // storage. Their `indices` buffer is intentionally empty, with the
        // actual pixels held in `indicesTiles`; copying that buffer directly
        // turns the resized image into a transparent layer. A resize already
        // creates a new dense raster, so materialize only those source layers
        // before the fast row copy below.
        if (
          isCompactLayerIndices(layer, sourceWidth * sourceHeight)
          || isTiledLayerIndices(layer, sourceWidth * sourceHeight)
        ) {
          materializeLayerIndices(layer, sourceWidth, sourceHeight, state.palette);
        }
        const sourceUsesRuntimeUint8 = isRuntimeUint8LayerIndices(layer, sourceWidth * sourceHeight);
        const resized = createLayer(
          layer.name,
          width,
          height,
          // Preserve the source storage encoding. Compact/tiled layers are
          // materialized as Int16, while imported indexed images remain in
          // their Uint8 runtime representation.
          sourceUsesRuntimeUint8 ? state.palette : [],
          { trackId: layer.trackId }
        );
        resized.id = layer.id;
        const sourceDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
        const targetDirect = sourceDirect ? ensureLayerDirect(resized, width, height) : null;
        const sourceImportDirect = layer.importSourceDirect instanceof Uint8ClampedArray
          ? layer.importSourceDirect
          : null;
        const targetImportDirect = sourceImportDirect ? new Uint8ClampedArray(width * height * 4) : null;
        if (copyWidth > 0 && sourceEndY > sourceStartY) {
          for (let sourceY = sourceStartY; sourceY < sourceEndY; sourceY += 1) {
            const destinationY = sourceY + shiftY;
            const sourceIndex = (sourceY * sourceWidth) + sourceStartX;
            const destinationIndex = (destinationY * width) + sourceStartX + shiftX;
            // TypedArray#set copies a complete row in native code. The previous
            // per-pixel loop made a large GIF's frame/layer matrix block pointerup.
            resized.indices.set(layer.indices.subarray(sourceIndex, sourceIndex + copyWidth), destinationIndex);
            if (sourceDirect && targetDirect) {
              const sourceByteIndex = sourceIndex * 4;
              const destinationByteIndex = destinationIndex * 4;
              targetDirect.set(
                sourceDirect.subarray(sourceByteIndex, sourceByteIndex + (copyWidth * 4)),
                destinationByteIndex
              );
            }
            if (sourceImportDirect && targetImportDirect) {
              const sourceByteIndex = sourceIndex * 4;
              const destinationByteIndex = destinationIndex * 4;
              targetImportDirect.set(
                sourceImportDirect.subarray(sourceByteIndex, sourceByteIndex + (copyWidth * 4)),
                destinationByteIndex
              );
            }
          }
        }
        resized.visible = layer.visible;
        resized.opacity = normalizeLayerOpacity(layer.opacity);
        resized.blendMode = normalizeLayerBlendMode(layer.blendMode);
        resized.directOnly = layer.directOnly === true;
        if (targetImportDirect) {
          resized.importSourceDirect = targetImportDirect;
        }
        return resized;
      });
    });
  }

  function scaleDocumentByRatio(numerator, denominator) {
    const num = Math.floor(Number(numerator));
    const den = Math.floor(Number(denominator));
    if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) {
      return false;
    }
    const originalWidth = state.width;
    const originalHeight = state.height;
    const newWidth = Math.round((originalWidth * num) / den);
    const newHeight = Math.round((originalHeight * num) / den);
    if (newWidth < 1 || newHeight < 1 || newWidth > MAX_CANVAS_SIZE || newHeight > MAX_CANVAS_SIZE) {
      return false;
    }

    state.frames.forEach(frame => {
      frame.layers = frame.layers.map(layer => {
        // Sprite scaling has the same requirement as canvas resizing: an
        // imported compact/tiled layer stores its visible pixels outside of
        // `indices`. Materialize it before nearest-neighbor sampling.
        if (
          isCompactLayerIndices(layer, originalWidth * originalHeight)
          || isTiledLayerIndices(layer, originalWidth * originalHeight)
        ) {
          materializeLayerIndices(layer, originalWidth, originalHeight, state.palette);
        }
        const sourceUsesRuntimeUint8 = isRuntimeUint8LayerIndices(layer, originalWidth * originalHeight);
        const scaled = createLayer(
          layer.name,
          newWidth,
          newHeight,
          sourceUsesRuntimeUint8 ? state.palette : [],
          { trackId: layer.trackId }
        );
        scaled.id = layer.id;
        scaled.visible = layer.visible;
        scaled.opacity = normalizeLayerOpacity(layer.opacity);
        scaled.blendMode = normalizeLayerBlendMode(layer.blendMode);

        const sourceIndices = layer.indices;
        const destIndices = scaled.indices;
        const hasDirect = layer.direct instanceof Uint8ClampedArray;
        const sourceDirect = hasDirect ? layer.direct : null;
        const targetDirect = hasDirect ? ensureLayerDirect(scaled, newWidth, newHeight) : null;
        const sourceImportDirect = layer.importSourceDirect instanceof Uint8ClampedArray
          ? layer.importSourceDirect
          : null;
        const targetImportDirect = sourceImportDirect
          ? new Uint8ClampedArray(newWidth * newHeight * 4)
          : null;

        for (let y = 0; y < newHeight; y += 1) {
          const srcY = Math.min(originalHeight - 1, Math.floor((y * den) / num));
          const srcRowStart = srcY * originalWidth;
          const destRowStart = y * newWidth;
          for (let x = 0; x < newWidth; x += 1) {
            const srcX = Math.min(originalWidth - 1, Math.floor((x * den) / num));
            const srcIndex = srcRowStart + srcX;
            const destIndex = destRowStart + x;
            destIndices[destIndex] = sourceIndices[srcIndex];
            if (targetDirect && sourceDirect) {
              const baseSrc = srcIndex * 4;
              const baseDst = destIndex * 4;
              targetDirect[baseDst] = sourceDirect[baseSrc];
              targetDirect[baseDst + 1] = sourceDirect[baseSrc + 1];
              targetDirect[baseDst + 2] = sourceDirect[baseSrc + 2];
              targetDirect[baseDst + 3] = sourceDirect[baseSrc + 3];
            }
            if (targetImportDirect && sourceImportDirect) {
              const baseSrc = srcIndex * 4;
              const baseDst = destIndex * 4;
              targetImportDirect[baseDst] = sourceImportDirect[baseSrc];
              targetImportDirect[baseDst + 1] = sourceImportDirect[baseSrc + 1];
              targetImportDirect[baseDst + 2] = sourceImportDirect[baseSrc + 2];
              targetImportDirect[baseDst + 3] = sourceImportDirect[baseSrc + 3];
            }
          }
        }

        scaled.directOnly = layer.directOnly === true;
        if (targetImportDirect) {
          scaled.importSourceDirect = targetImportDirect;
        }
        return scaled;
      });
    });

    const previousWidth = state.width;
    const previousHeight = state.height;
    state.width = newWidth;
    state.height = newHeight;
    rescaleMirrorPivotForCanvas(previousWidth, previousHeight, newWidth, newHeight);
    const ratio = num / den;
    state.pan.x = Math.round((state.pan.x || 0) * ratio);
    state.pan.y = Math.round((state.pan.y || 0) * ratio);
    state.selectionMask = null;
    state.selectionContentMask = null;
    state.selectionBounds = null;
    return true;
  }

  function getSpriteScaleRatioForValue(rawValue) {
    const option = getNearestSpriteScaleOption(rawValue);
    const preset = SPRITE_SCALE_DOWN_PRESETS.find(item => (
      Math.abs(item.value - option.value) <= SPRITE_SCALE_EPSILON
      || item.label === option.label
    ));
    if (preset) {
      return {
        value: preset.value,
        label: preset.label,
        numerator: preset.numerator,
        denominator: preset.denominator,
      };
    }
    const multiplier = Math.max(1, Math.floor(Number(option.value) || 1));
    return {
      value: multiplier,
      label: String(multiplier),
      numerator: multiplier,
      denominator: 1,
    };
  }

  function applySpriteScaleMultiplier(rawValue) {
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(localizeText('参加/視聴モードではスプライト倍率はマスターのみ変更できます', 'In participant/viewer mode, only the master can change sprite scale'), 'warn');
      }
      return;
    }
    const input = dom.controls.spriteScaleInput;
    const scaleRatio = getSpriteScaleRatioForValue(rawValue);
    const factor = scaleRatio.value;
    if (input) {
      input.value = scaleRatio.label;
    }

    const maxMultiplier = getMaxSpriteMultiplier();
    if (Math.abs(factor - 1) <= SPRITE_SCALE_EPSILON) {
      updateSpriteScaleControlLimits();
      return;
    }
    if (factor > maxMultiplier) {
      window.alert(`拡大後のサイズが上限 (${MAX_CANVAS_SIZE}px) を超えます。最大倍率は ×${maxMultiplier} です。`);
      updateSpriteScaleControlLimits();
      return;
    }

    beginHistory('scaleSprite');
    const success = scaleDocumentByRatio(scaleRatio.numerator, scaleRatio.denominator);
    if (!success) {
      rollbackPendingHistory({ reRender: false });
      updateAutosaveStatus('スプライト倍率を適用できませんでした', 'warn');
      updateSpriteScaleControlLimits();
      return;
    }

    markHistoryDirty();
    resizeCanvases();
    clearSelection();
    requestRender();
    requestOverlayRender();
    commitHistory();
    scheduleSessionPersist();
    updateMemoryStatus();
    if (input) {
      input.value = '1';
    }
    updateSpriteScaleControlLimits();
    updateAutosaveStatus(`スプライト倍率 ×${scaleRatio.label} を適用しました`, 'info');
  }



  return Object.freeze({
    applyEmbedGuardrails,
    getCanvasResizeInputValue,
    updateCanvasResizeControls,
    adjustCanvasResizeInputBy,
    applyCanvasResizeDimensions,
    handleCanvasResizeRequest,
    applySettingsSizeChanges,
    setupNumberSteppers,
    resizeAllLayers,
    scaleDocumentByRatio,
    getSpriteScaleRatioForValue,
    applySpriteScaleMultiplier,
  });
      }
    })(scope);
  }

  root.canvasResizeWorkflowUtils = Object.freeze({
    createCanvasResizeWorkflowUtils,
  });
})();
