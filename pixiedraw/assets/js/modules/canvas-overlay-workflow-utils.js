(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasOverlayWorkflowUtils(rawScope = {}) {
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
  let selectionDashRefreshTimer = null;
  let deferredBrushPreviewCache = null;
  let lastOverlayVisualSignature = null;
  let lastShapePreviewSignature = null;
  let lastSelectionPreviewSignature = null;
  const SELECTION_DASH_REFRESH_INTERVAL_MS = 120;
  // Whole-canvas Same Color previews stay cached and are painted as scanline
  // runs. Keep a full 1024x1024 target set instead of clipping at 256 Ki
  // pixels, which previously made the preview look like a fixed strip.
  // The extra slot prevents an exact full-canvas match from being flagged as
  // truncated before the scan proves there are more matching pixels.
  const FILL_PREVIEW_GLOBAL_MAX_PIXELS = 1048577;

  function overlayPointSignature(point) {
    if (!point) return '-';
    return `${Math.round(Number(point.x) || 0)},${Math.round(Number(point.y) || 0)}`;
  }

  function overlayBoundsSignature(bounds) {
    if (!bounds) return '-';
    return `${bounds.x0 ?? ''},${bounds.y0 ?? ''},${bounds.x1 ?? ''},${bounds.y1 ?? ''}`;
  }

  function isShapePreviewTool(tool) {
    return tool === 'line'
      || tool === 'rect'
      || tool === 'rectFill'
      || tool === 'ellipse'
      || tool === 'ellipseFill'
      || tool === 'curve';
  }

  function getShapePreviewSignature() {
    const preview = pointerState.preview || null;
    const tool = pointerState.tool || state.tool;
    if (!pointerState.active || !preview || !isShapePreviewTool(tool)) {
      return '';
    }
    const color = state.activeRgb || state.palette?.[state.activePaletteIndex] || {};
    const mirror = state.mirror || {};
    const axes = mirror.axes || {};
    return [
      tool,
      overlayPointSignature(preview.start), overlayPointSignature(preview.end),
      state.width, state.height, state.brushSize, state.brushShape,
      state.activePaletteIndex, color.r, color.g, color.b, color.a,
      state.selectionMask ? getSelectionMaskCacheId(state.selectionMask) : 'none',
      mirror.enabled ? 1 : 0, axes.vertical ? 1 : 0, axes.horizontal ? 1 : 0,
      axes.diagonalDown ? 1 : 0, axes.diagonalUp ? 1 : 0,
      overlayPointSignature(mirror.pivot),
    ].join('|');
  }

  function getSelectionPreviewSignature() {
    const preview = pointerState.selectionPreview || null;
    const tool = pointerState.tool || state.tool;
    if (
      !pointerState.active
      || !preview
      || (tool !== 'selectLasso' && tool !== 'selectRect' && tool !== POINTER_TOOL_CUSTOM_BRUSH_RECT)
    ) {
      return '';
    }
    const points = Array.isArray(preview.points) ? preview.points : [];
    const lastPoint = points[points.length - 1] || preview.end || null;
    return [
      tool,
      overlayPointSignature(preview.start), overlayPointSignature(preview.end),
      points.length, overlayPointSignature(lastPoint),
      preview.gridCellMode ? 1 : 0,
      preview.gridAnchorCell?.x ?? '', preview.gridAnchorCell?.y ?? '',
      preview.gridCurrentCell?.x ?? '', preview.gridCurrentCell?.y ?? '',
    ].join('|');
  }

  // Every interactive tool feeds this one visual-state key. A request to
  // redraw is deliberately not enough by itself: if no visible preview input
  // changed, the canvases keep their contents and no clear/composite work is
  // performed. This is the common scheduling contract for brush, fill,
  // shapes, selection, mirror guides, virtual cursor, and onion skin.
  function getOverlayVisualSignature() {
    const preview = pointerState.preview || null;
    const previewPoints = Array.isArray(preview?.points) ? preview.points : [];
    const previewLastPoint = previewPoints.length ? previewPoints[previewPoints.length - 1] : null;
    const selectionPreview = pointerState.selectionPreview || null;
    const selectionPoints = Array.isArray(selectionPreview?.points) ? selectionPreview.points : [];
    const selectionLastPoint = selectionPoints.length ? selectionPoints[selectionPoints.length - 1] : null;
    const selectionMaskKey = state.selectionMask ? getSelectionMaskCacheId(state.selectionMask) : 'none';
    const activeCanvasId = getActiveProjectCanvasDocument?.()?.id || '';
    const color = state.activeRgb || state.palette?.[state.activePaletteIndex] || {};
    const onion = state.onionSkin || {};
    const mirror = state.mirror || {};
    const mirrorAxes = mirror.axes || {};
    const shapePreviewIsSeparate = Boolean(
      pointerState.active
      && pointerState.preview
      && isShapePreviewTool(pointerState.tool || state.tool)
      && !state.showPixelGuides
      && !state.showVirtualCursor
    );
    const selectionPreviewIsSeparate = Boolean(
      pointerState.active
      && selectionPreview
      && (pointerState.tool === 'selectLasso'
        || pointerState.tool === 'selectRect'
        || pointerState.tool === POINTER_TOOL_CUSTOM_BRUSH_RECT)
      && canRenderSelectionOutlineAsSvg()
      && !state.showPixelGuides
      && !state.showVirtualCursor
    );
    const pointerPreviewIsSeparate = shapePreviewIsSeparate || selectionPreviewIsSeparate;
    return [
      activeCanvasId,
      state.width, state.height, state.scale,
      ctx.overlay?.canvas?.width || 0, ctx.overlay?.canvas?.height || 0,
      ctx.brushPreview?.canvas?.width || 0, ctx.brushPreview?.canvas?.height || 0,
      state.tool, state.brushSize, state.brushShape,
      state.activePaletteIndex, state.secondaryPaletteIndex,
      color.r, color.g, color.b, color.a,
      state.showPixelGuides ? 1 : 0,
      state.showVirtualCursor ? 1 : 0,
      state.activeFrame, state.frames?.length || 0,
      onion.enabled ? 1 : 0, onion.prevFrames, onion.nextFrames, onion.opacity,
      mirror.enabled ? 1 : 0, mirrorAxes.vertical ? 1 : 0, mirrorAxes.horizontal ? 1 : 0,
      mirrorAxes.diagonalDown ? 1 : 0, mirrorAxes.diagonalUp ? 1 : 0,
      overlayPointSignature(mirror.pivot),
      selectionMaskKey, overlayBoundsSignature(state.selectionBounds), state.selectionOutlineMode,
      hoveredProjectCanvasId || '', overlayPointSignature(hoverPixel), overlayPointSignature(virtualCursor),
      pointerState.active ? 1 : 0, pointerState.tool || '',
      pointerPreviewIsSeparate ? '-' : overlayPointSignature(pointerState.start),
      pointerPreviewIsSeparate ? '-' : overlayPointSignature(pointerState.current),
      pointerPreviewIsSeparate ? '-' : overlayPointSignature(pointerState.last),
      shapePreviewIsSeparate ? 'shape-layer' : (preview?.kind || ''),
      shapePreviewIsSeparate ? 0 : previewPoints.length,
      shapePreviewIsSeparate ? '-' : overlayPointSignature(previewLastPoint),
      shapePreviewIsSeparate ? 0 : (preview?.committedStampCount || 0),
      selectionPreviewIsSeparate ? 'selection-layer' : (selectionPreview?.tool || ''),
      selectionPreviewIsSeparate ? 0 : selectionPoints.length,
      selectionPreviewIsSeparate ? '-' : overlayPointSignature(selectionLastPoint),
      selectionPreviewIsSeparate ? '-' : overlayPointSignature(selectionPreview?.start),
      selectionPreviewIsSeparate ? '-' : overlayPointSignature(selectionPreview?.end),
      curveBuilder ? (pointerState.path?.length || 0) : 0,
    ].join('|');
  }

  function canRenderSelectionOutlineAsSvg() {
    return typeof SVGSVGElement !== 'undefined' && typeof SVGPathElement !== 'undefined';
  }

  function scheduleSelectionDashRefresh() {
    if (selectionDashRefreshTimer !== null) {
      return;
    }
    selectionDashRefreshTimer = window.setTimeout(() => {
      selectionDashRefreshTimer = null;
      // Modern browsers render the selection outline as SVG. Updating only
      // its dash offset must not cause the overlay canvas (including fill
      // previews and onion skin) to be cleared and rebuilt every 120ms.
      // Keep the canvas fallback on the established rAF path.
      if (refreshSelectionDashSvg()) {
        scheduleSelectionDashRefresh();
        return;
      }
      requestOverlayRender();
    }, SELECTION_DASH_REFRESH_INTERVAL_MS);
  }

  function cancelSelectionDashRefresh() {
    if (selectionDashRefreshTimer === null) {
      return;
    }
    window.clearTimeout(selectionDashRefreshTimer);
    selectionDashRefreshTimer = null;
  }

  function clearVirtualCursorCanvas() {
    if (!ctx.virtual) {
      return;
    }
    const canvas = ctx.virtual.canvas;
    if (!canvas) {
      return;
    }
    ctx.virtual.setTransform(1, 0, 0, 1, 0, 0);
    ctx.virtual.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawVirtualCursor(position) {
    if (!position) {
      return;
    }
    const viewportElement = dom.canvasViewport;
    const drawingCanvas = dom.canvases.drawing;
    if (ctx.virtual && viewportElement && drawingCanvas) {
      const viewportRect = viewportElement.getBoundingClientRect();
      const drawingRect = drawingCanvas.getBoundingClientRect();
      const width = Math.max(1, Number(state.width) || 0);
      const height = Math.max(1, Number(state.height) || 0);
      if (viewportRect.width > 0 && viewportRect.height > 0 && drawingRect.width > 0 && drawingRect.height > 0) {
        const unitX = drawingRect.width / width;
        const unitY = drawingRect.height / height;
        const clampedX = clamp(position.x, -2, state.width + 2);
        const clampedY = clamp(position.y, -2, state.height + 2);
        const offsetX = drawingRect.left - viewportRect.left;
        const offsetY = drawingRect.top - viewportRect.top;
        const anchorX = offsetX + clampedX * unitX;
        const anchorY = offsetY + clampedY * unitY;
        const dpr = window.devicePixelRatio || 1;
        const activeTool = getActiveTool();
        const iconEntry = getToolIconEntry(activeTool);

        ctx.virtual.save();
        ctx.virtual.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (iconEntry && iconEntry.ready) {
          const image = iconEntry.image;
          const sourceWidth = image.naturalWidth || image.width;
          const sourceHeight = image.naturalHeight || image.height;
          if (sourceWidth > 0 && sourceHeight > 0) {
            const targetPixelSize = 24;
            const scaleFactor = targetPixelSize / Math.max(sourceWidth, sourceHeight);
            const drawWidth = sourceWidth * scaleFactor;
            const drawHeight = sourceHeight * scaleFactor;
            const drawX = anchorX;
            const drawY = anchorY;
            ctx.virtual.drawImage(image, drawX, drawY - drawHeight, drawWidth, drawHeight);
            ctx.virtual.restore();
            return;
          }
        }

        const markerSize = 12;
        ctx.virtual.lineWidth = 2;
        ctx.virtual.strokeStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.virtual.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.virtual.beginPath();
        ctx.virtual.moveTo(anchorX, anchorY);
        ctx.virtual.lineTo(anchorX, anchorY - markerSize * 2);
        ctx.virtual.lineTo(anchorX + markerSize * 1.4, anchorY - markerSize);
        ctx.virtual.closePath();
        ctx.virtual.fill();
        ctx.virtual.stroke();
        ctx.virtual.restore();
        return;
      }
    }

    if (!ctx.overlay) {
      return;
    }

    const clampedX = clamp(position.x, -2, state.width + 2);
    const clampedY = clamp(position.y, -2, state.height + 2);
    const viewportScale = getPixelAlignedCanvasDisplayScale(state.scale);
    const activeTool = getActiveTool();
    const iconEntry = getToolIconEntry(activeTool);
    if (iconEntry && iconEntry.ready) {
      const image = iconEntry.image;
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      if (sourceWidth > 0 && sourceHeight > 0) {
        const targetPixelSize = 24;
        const scaleFactor = targetPixelSize / Math.max(sourceWidth, sourceHeight);
        const drawWidth = (sourceWidth * scaleFactor) / viewportScale;
        const drawHeight = (sourceHeight * scaleFactor) / viewportScale;
        const drawX = clampedX;
        const drawY = clampedY;
        ctx.overlay.drawImage(image, drawX, drawY - drawHeight, drawWidth, drawHeight);
        return;
      }
    }

    ctx.overlay.save();
    const markerSize = Math.max(1.2 / viewportScale, 0.4);
    ctx.overlay.lineWidth = Math.max(0.5 / viewportScale, 0.2);
    ctx.overlay.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.overlay.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.overlay.beginPath();
    ctx.overlay.moveTo(clampedX, clampedY);
    ctx.overlay.lineTo(clampedX, clampedY - (markerSize * 2));
    ctx.overlay.lineTo(clampedX + markerSize * 1.5, clampedY - markerSize);
    ctx.overlay.closePath();
    ctx.overlay.fill();
    ctx.overlay.stroke();
    ctx.overlay.restore();
  }


  function getOnionSkinFrameCacheEntry(frameIndex) {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
      return null;
    }
    if (onionSkinCache.revision !== onionSkinCacheRevision) {
      onionSkinCache.byFrame.clear();
      onionSkinCache.revision = onionSkinCacheRevision;
    }
    let entry = onionSkinCache.byFrame.get(frameIndex);
    if (!entry) {
      entry = { prev: null, next: null };
      onionSkinCache.byFrame.set(frameIndex, entry);
    }
    return entry;
  }

  function buildOnionSkinTintCanvas(frameIndex, _tintColor) {
    const frame = Array.isArray(state.frames) ? state.frames[frameIndex] : null;
    const width = Math.floor(Number(state.width) || 0);
    const height = Math.floor(Number(state.height) || 0);
    if (!frame || !Array.isArray(frame.layers) || width <= 0 || height <= 0) {
      return null;
    }
    const sourcePixels = compositeFramePixels(frame, width, height, state.palette, {
      useLocalLayerPreviewVisibility: true,
      useLocalLayerPreviewOpacity: true,
    });
    if (!(sourcePixels instanceof Uint8ClampedArray) || sourcePixels.length !== width * height * 4) {
      return null;
    }
    return createFrameCanvas(sourcePixels, width, height);
  }

  function getOnionSkinTintCanvas(frameIndex, direction) {
    const cacheEntry = getOnionSkinFrameCacheEntry(frameIndex);
    if (!cacheEntry) {
      return null;
    }
    if (direction === 'next') {
      if (!cacheEntry.next) {
        cacheEntry.next = buildOnionSkinTintCanvas(frameIndex, ONION_SKIN_TINT_NEXT);
      }
      return cacheEntry.next;
    }
    if (!cacheEntry.prev) {
      cacheEntry.prev = buildOnionSkinTintCanvas(frameIndex, ONION_SKIN_TINT_PREV);
    }
    return cacheEntry.prev;
  }

  function renderOnionSkin() {
    if (!ctx.overlay) {
      return;
    }
    const settings = normalizeOnionSkinState(state.onionSkin);
    state.onionSkin = settings;
    if (!settings.enabled) {
      return;
    }
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    if (frameCount <= 1) {
      return;
    }
    const activeFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, frameCount - 1);
    const prevFrames = normalizeOnionFrameCount(settings.prevFrames, DEFAULT_ONION_SKIN.prevFrames);
    const nextFrames = normalizeOnionFrameCount(settings.nextFrames, DEFAULT_ONION_SKIN.nextFrames);
    if (prevFrames <= 0 && nextFrames <= 0) {
      return;
    }
    const baseOpacity = normalizeOnionOpacity(settings.opacity, DEFAULT_ONION_SKIN.opacity);
    if (baseOpacity <= 0.001) {
      return;
    }
    const depth = Math.max(prevFrames, nextFrames);
    ctx.overlay.save();
    for (let offset = depth; offset >= 1; offset -= 1) {
      const layerOpacity = clamp(baseOpacity / offset, 0, 1);
      if (layerOpacity <= 0.001) {
        continue;
      }
      if (offset <= prevFrames) {
        const frameIndex = activeFrameIndex - offset;
        if (frameIndex >= 0) {
          const canvas = getOnionSkinTintCanvas(frameIndex, 'prev');
          if (canvas) {
            ctx.overlay.globalAlpha = layerOpacity;
            ctx.overlay.drawImage(canvas, 0, 0, state.width, state.height);
          }
        }
      }
      if (offset <= nextFrames) {
        const frameIndex = activeFrameIndex + offset;
        if (frameIndex < frameCount) {
          const canvas = getOnionSkinTintCanvas(frameIndex, 'next');
          if (canvas) {
            ctx.overlay.globalAlpha = layerOpacity;
            ctx.overlay.drawImage(canvas, 0, 0, state.width, state.height);
          }
        }
      }
    }
    ctx.overlay.restore();
  }

  function renderOverlay(timestamp, _trace = null) {
    const metrics = {
      timings: {
        virtualCursorMs: 0,
        clearMs: 0,
        onionSkinMs: 0,
        selectionMs: 0,
        movePreviewMs: 0,
        transformHandlesMs: 0,
        guidesCursorMirrorMs: 0,
        hoverPreviewMs: 0,
        fillPreviewMs: 0,
        deferredBrushPreviewMs: 0,
        deferredBrushPreviewCacheUpdateMs: 0,
        deferredBrushPreviewDrawImageMs: 0,
        shapePreviewMs: 0,
        selectionPreviewMs: 0,
      },
      counts: {
        skippedUnchanged: false,
        deferredBrushPreview: false,
        previewStampCount: 0,
        previewStartIndex: 0,
        newPreviewStampCount: 0,
        renderedPreviewStampCount: 0,
        deferredPreviewCacheReset: false,
        previewCacheCanvasWidth: 0,
        previewCacheCanvasHeight: 0,
        previewCacheCanvasArea: 0,
        previewDirtyRectArea: 0,
        overlayWidth: Math.max(0, Number(state.width) || 0),
        overlayHeight: Math.max(0, Number(state.height) || 0),
        clearPixelArea: 0,
        hasSelection: Boolean(state.selectionMask),
        onionSkinEnabled: Boolean(state.onionSkin?.enabled),
        mirrorEnabled: false,
        shapePreviewUpdated: false,
        selectionPreviewUpdated: false,
      },
    };
    const visualSignature = getOverlayVisualSignature();
    const shapePreviewSignature = getShapePreviewSignature();
    const selectionPreviewSignature = getSelectionPreviewSignature();
    const forceVisualRefresh = _trace?.reason === 'main-render' || _trace?.force === true;
    const overlayVisualUnchanged = visualSignature === lastOverlayVisualSignature;
    const shouldRefreshShapePreview = shapePreviewSignature !== lastShapePreviewSignature;
    const shouldRefreshSelectionPreview = selectionPreviewSignature !== lastSelectionPreviewSignature;
    if (!forceVisualRefresh && overlayVisualUnchanged && !shouldRefreshShapePreview && !shouldRefreshSelectionPreview) {
      metrics.counts.skippedUnchanged = true;
      return metrics;
    }
    lastOverlayVisualSignature = visualSignature;
    lastShapePreviewSignature = shapePreviewSignature;
    lastSelectionPreviewSignature = selectionPreviewSignature;
    if (
      pointerState.active
      && pointerState.surface?.drawing instanceof HTMLCanvasElement
      && dom.canvases.drawing !== pointerState.surface.drawing
    ) {
      const interactionSurface = getCanvasInteractionSurfaceFromTarget(pointerState.surface.drawing);
      if (interactionSurface?.entry) {
        bindActiveCanvasSurface(interactionSurface.entry);
      }
    }
    const { width, height } = state;
    const hasShapePreview = Boolean(shapePreviewSignature);
    const hasDeferredBrushPreview = pointerState.preview?.kind === 'deferredBrushStroke';
    if (!hasShapePreview && !hasDeferredBrushPreview && deferredBrushPreviewCache && ctx.brushPreview) {
      const previewCanvas = deferredBrushPreviewCache.canvas;
      ctx.brushPreview.save();
      ctx.brushPreview.setTransform(1, 0, 0, 1, 0, 0);
      ctx.brushPreview.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      ctx.brushPreview.restore();
      deferredBrushPreviewCache = null;
    }
    if (shouldRefreshShapePreview && ctx.brushPreview) {
      const shapePreviewStartedAt = performance.now();
      const previewCanvas = dom.canvases.brushPreview;
      ctx.brushPreview.save();
      ctx.brushPreview.setTransform(1, 0, 0, 1, 0, 0);
      ctx.brushPreview.clearRect(0, 0, previewCanvas?.width || width, previewCanvas?.height || height);
      ctx.brushPreview.restore();
      if (hasShapePreview) {
        drawPreviewShape({
          preview: pointerState.preview,
          tool: pointerState.tool || state.tool,
        }, ctx.brushPreview);
      }
      metrics.timings.shapePreviewMs = performance.now() - shapePreviewStartedAt;
      metrics.counts.shapePreviewUpdated = true;
    }
    if (shouldRefreshSelectionPreview) {
      const selectionPreviewStartedAt = performance.now();
      syncSelectionOutlineToViewportTransform();
      metrics.timings.selectionPreviewMs = performance.now() - selectionPreviewStartedAt;
      metrics.counts.selectionPreviewUpdated = true;
    }
    // Shape pixels live on their own preview canvas. While a drag changes
    // only that layer, leave the interaction overlay, selection SVG and onion
    // skin untouched instead of clearing and rebuilding them every move.
    if (!forceVisualRefresh && overlayVisualUnchanged && (shouldRefreshShapePreview || shouldRefreshSelectionPreview)) {
      return metrics;
    }
    if (state.playback.isPlaying) {
      const clearStartedAt = performance.now();
      cancelSelectionDashRefresh();
      resizeVirtualCursorCanvas();
      clearVirtualCursorCanvas();
      if (ctx.overlay) {
        ctx.overlay.clearRect(0, 0, width, height);
      }
      if (ctx.selection) {
        const selectionCanvas = dom.canvases.selection;
        const clearWidth = selectionCanvas ? selectionCanvas.width : width;
        const clearHeight = selectionCanvas ? selectionCanvas.height : height;
        ctx.selection.clearRect(0, 0, clearWidth, clearHeight);
      }
      clearSelectionOutlineSvg();
      metrics.timings.clearMs = performance.now() - clearStartedAt;
      metrics.counts.clearPixelArea = width * height;
      return metrics;
    }
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const moveState = getPendingSelectionMoveState();
    const hasSelectionPreview = Boolean(pointerState.selectionPreview
      && (
        pointerState.tool === 'selectLasso'
        || pointerState.tool === 'selectRect'
        || pointerState.tool === POINTER_TOOL_CUSTOM_BRUSH_RECT
      ));
    const hasSelectionOutline = Boolean(state.selectionMask)
      || hasSelectionPreview
      || Boolean(moveState && moveState.hasCleared);

    const virtualCursorStartedAt = performance.now();
    resizeVirtualCursorCanvas();
    clearVirtualCursorCanvas();
    metrics.timings.virtualCursorMs = performance.now() - virtualCursorStartedAt;
    const clearStartedAt = performance.now();
    if (ctx.overlay) {
      ctx.overlay.clearRect(0, 0, width, height);
      metrics.counts.clearPixelArea += width * height;
    }
    // All supported browsers use the SVG outline path below. Keeping a
    // high-resolution fallback canvas alive meant clearing up to 2048² pixels
    // every animation frame while a selection existed, even though it was not
    // visible. Only allocate it for the legacy fallback path.
    const useSvgSelectionOutline = canRenderSelectionOutlineAsSvg();
    if (ctx.selection) {
      const selectionCanvas = dom.canvases.selection;
      if (hasSelectionOutline && !useSvgSelectionOutline) {
        ensureSelectionCanvasResolution(Math.max(Number(state.scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE));
        const clearWidth = selectionCanvas ? selectionCanvas.width : width * state.scale;
        const clearHeight = selectionCanvas ? selectionCanvas.height : height * state.scale;
        ctx.selection.clearRect(0, 0, clearWidth, clearHeight);
        selectionCanvasActive = true;
      } else if (selectionCanvas && selectionCanvasActive) {
        ctx.selection.clearRect(0, 0, selectionCanvas.width, selectionCanvas.height);
        if (selectionCanvas.width !== 1 || selectionCanvas.height !== 1) {
          selectionCanvas.width = 1;
          selectionCanvas.height = 1;
          ctx.selection.setTransform(1, 0, 0, 1, 0, 0);
          ctx.selection.imageSmoothingEnabled = false;
        }
        selectionCanvasActive = false;
      }
    }
    metrics.timings.clearMs = performance.now() - clearStartedAt;
    const onionSkinStartedAt = performance.now();
    renderOnionSkin();
    metrics.timings.onionSkinMs = performance.now() - onionSkinStartedAt;
    const selectionStateStartedAt = performance.now();
    if (hasSelectionOutline) {
      updateSelectionDashAnimation(now);
    } else {
      cancelSelectionDashRefresh();
      resetSelectionDashAnimation();
      clearSelectionOutlineSvg();
    }
    metrics.timings.selectionMs += performance.now() - selectionStateStartedAt;
    if (moveState && moveState.hasCleared) {
      const movePreviewStartedAt = performance.now();
      drawSelectionMovePreview(moveState);
      metrics.timings.movePreviewMs = performance.now() - movePreviewStartedAt;
    } else if (state.selectionMask) {
      const selectionStartedAt = performance.now();
      drawSelectionOverlay();
      metrics.timings.selectionMs += performance.now() - selectionStartedAt;
    }
    const transformHandlesStartedAt = performance.now();
    drawSelectionTransformHandles();
    metrics.timings.transformHandlesMs = performance.now() - transformHandlesStartedAt;

    const hoveredSurface = !pointerState.active
      ? getProjectCanvasSurfaceByCanvasId(hoveredProjectCanvasId)
      : null;
    const hoverPreviewUsesSeparateSurface = Boolean(
      hoveredSurface
      && activeCanvasSurface
      && hoveredSurface !== activeCanvasSurface
    );
    const virtualFocusPixel = state.showVirtualCursor ? getVirtualCursorCellPosition() : null;
    const focusPixel = pointerState.active
      ? pointerState.current
      : (virtualFocusPixel || (hoverPreviewUsesSeparateSurface ? null : hoverPixel));
    const activeTool = (virtualCursorDrawState.active && virtualCursorDrawState.tool)
      ? virtualCursorDrawState.tool
      : getActiveTool();
    const shouldShowGuidePreview = state.showPixelGuides || state.showVirtualCursor;
    const guidesStartedAt = performance.now();
    if (shouldShowGuidePreview && focusPixel) {
      const overrideSize = FILL_TOOLS.has(activeTool) ? 1 : undefined;
      const hoverPreviewStartedAt = performance.now();
      drawBrushPreview(focusPixel, activeTool, overrideSize);
      metrics.timings.hoverPreviewMs += performance.now() - hoverPreviewStartedAt;
    }

    const activeFillPreviewStyle = pointerState.active && FILL_TOOLS.has(pointerState.tool)
      ? getFillStyleForInteraction(pointerState.tool, pointerState.start, pointerState.current || focusPixel)
      : null;
    // Solid bucket fills have no moving intermediate state. Keep their
    // preview as the inexpensive cursor above; only a gradient needs a live
    // drag preview because its endpoint changes the eventual pixels.
    const isTouchFillHoldPreview = Boolean(
      pointerState.active
      && FILL_TOOLS.has(pointerState.tool)
      && activeFillPreviewStyle
      && isGradientFillStyle(activeFillPreviewStyle)
      && pointerState.start
    );
    if (
      ctx.overlay
      && FILL_TOOLS.has(activeTool)
      && focusPixel
      && isTouchFillHoldPreview
      // A gradient is the only fill with a changing pre-commit result.
      && !shouldShowGuidePreview
    ) {
      const seed = pointerState.start;
      const endpoint = pointerState.current || focusPixel;
      const previewPixels = getFillPreviewPixels(seed.x, seed.y, { fillStyle: activeFillPreviewStyle });
      if (previewPixels && previewPixels.length) {
        const fillPreviewStartedAt = performance.now();
        ctx.overlay.save();
        drawFillPreviewPixels(previewPixels, seed, endpoint, activeTool, { fillStyle: activeFillPreviewStyle });
        ctx.overlay.restore();
        metrics.timings.fillPreviewMs += performance.now() - fillPreviewStartedAt;
      }
    }
    metrics.timings.guidesCursorMirrorMs += performance.now() - guidesStartedAt;

    const previewTool = (virtualCursorDrawState.active && virtualCursorDrawState.tool)
      ? virtualCursorDrawState.tool
      : (pointerState.tool || state.tool);
    // Shape previews are rendered above on brushPreviewCanvas so their
    // updates do not require an Overlay Canvas redraw.

    if (hasDeferredBrushPreview && ctx.brushPreview) {
      const deferredBrushStartedAt = performance.now();
      metrics.counts.deferredBrushPreview = true;
      metrics.counts.previewStampCount = Array.isArray(pointerState.preview.points)
        ? pointerState.preview.points.length
        : 0;
      const previewStats = drawDeferredBrushStrokePreview(pointerState.preview.points, pointerState.tool) || {};
      metrics.timings.deferredBrushPreviewMs = performance.now() - deferredBrushStartedAt;
      metrics.timings.deferredBrushPreviewCacheUpdateMs = Number(previewStats.cacheUpdateMs) || 0;
      metrics.timings.deferredBrushPreviewDrawImageMs = Number(previewStats.drawImageMs) || 0;
      metrics.counts.previewStartIndex = Math.max(0, Number(previewStats.previewStartIndex) || 0);
      metrics.counts.newPreviewStampCount = Math.max(0, Number(previewStats.newPreviewStampCount) || 0);
      metrics.counts.renderedPreviewStampCount = Math.max(0, Number(previewStats.renderedPreviewStampCount) || 0);
      metrics.counts.pendingPreviewStampCount = Math.max(0, Number(previewStats.pendingPreviewStampCount) || 0);
      metrics.counts.deferredPreviewCacheReset = previewStats.cacheReset === true;
      metrics.counts.previewCacheCanvasWidth = Math.max(0, Number(previewStats.cacheCanvasWidth) || 0);
      metrics.counts.previewCacheCanvasHeight = Math.max(0, Number(previewStats.cacheCanvasHeight) || 0);
      metrics.counts.previewCacheCanvasArea = Math.max(0, Number(previewStats.cacheCanvasArea) || 0);
      metrics.counts.previewDirtyRectArea = Math.max(0, Number(previewStats.dirtyRectArea) || 0);
      metrics.counts.mirrorEnabled = previewStats.mirrorEnabled === true;
    }

    if ((state.showPixelGuides || state.showVirtualCursor) && ctx.overlay && state.tool === 'curve' && curveBuilder) {
      drawCurveGuides(curveBuilder);
    }

    if (pointerState.selectionPreview && pointerState.tool === 'selectLasso') {
      drawLassoPreview(pointerState.selectionPreview.points);
    }

    if (
      pointerState.selectionPreview
      && (pointerState.tool === 'selectRect' || pointerState.tool === POINTER_TOOL_CUSTOM_BRUSH_RECT)
    ) {
      drawRectanglePreview(pointerState.selectionPreview.start, pointerState.selectionPreview.end);
    }

    if (state.showVirtualCursor && virtualCursor) {
      const virtualCursorDrawStartedAt = performance.now();
      drawVirtualCursor(virtualCursor);
      metrics.timings.virtualCursorMs += performance.now() - virtualCursorDrawStartedAt;
    }

    if (hasSelectionOutline) {
      // The dash does not need a 60fps full-canvas redraw. Pointer events
      // still request immediate updates while the user drags; idle animation
      // is intentionally capped to keep editing responsive.
      scheduleSelectionDashRefresh();
    }
    return metrics;
  }

  function getBackgroundTileColor(x, y) {
    const tiles = BACKGROUND_TILE_COLORS[state.backgroundMode] || BACKGROUND_TILE_COLORS.dark;
    const tileSize = TRANSPARENT_TILE_SIZE;
    const parity = (Math.floor(x / tileSize) + Math.floor(y / tileSize)) & 1;
    return tiles[parity] || tiles[0];
  }

  function getEraserPreviewColor(x, y) {
    const activeLayer = getActiveLayer();
    if (!activeLayer) {
      return getBackgroundTileColor(x, y);
    }
    const color = sampleCompositeColorExcludingLayer(x, y, activeLayer.id);
    if (color) {
      return color;
    }
    return getBackgroundTileColor(x, y);
  }

  function resolveSampledColor(sample) {
    if (!sample) {
      return null;
    }
    if (sample.mode === 'index') {
      const paletteColor = state.palette[sample.index];
      if (paletteColor) {
        return normalizeColorValue(paletteColor);
      }
      return null;
    }
    if (sample.color) {
      return normalizeColorValue(sample.color);
    }
    return null;
  }

  function getActiveSwatchColor() {
    if (isRgbColorMode()) {
      return normalizeColorValue(state.activeRgb);
    }
    const paletteColor = state.palette[state.activePaletteIndex];
    if (paletteColor) {
      return normalizeColorValue(paletteColor);
    }
    return normalizeColorValue(state.activeRgb);
  }

  function invertPreviewColor(color) {
    if (!color) {
      return { r: 255, g: 255, b: 255, a: 255 };
    }
    const r = clamp(Math.round(Number(color.r) || 0), 0, 255);
    const g = clamp(Math.round(Number(color.g) || 0), 0, 255);
    const b = clamp(Math.round(Number(color.b) || 0), 0, 255);
    return {
      r: 255 - r,
      g: 255 - g,
      b: 255 - b,
      a: 255,
    };
  }

  function updateColorTabSwatch() {
    const color = getActiveSwatchColor();
    if (!color) return;
    const borderColor = color.a >= 192 ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.75)';
    [dom.colorTabSwatch, dom.mobileColorTabSwatch].forEach(element => {
      if (!element) return;
      applyPixelFrameBackground(element, color, { borderColor });
    });
    if (dom.mobileDrawerColorTabSwatch instanceof HTMLElement) {
      dom.mobileDrawerColorTabSwatch.style.background = 'transparent';
      dom.mobileDrawerColorTabSwatch.style.backgroundImage = 'none';
      dom.mobileDrawerColorTabSwatch.style.border = '0';
      dom.mobileDrawerColorTabSwatch.style.boxShadow = 'none';
    }
    const mobileToolsButton = document.getElementById('mobileTabTools');
    if (mobileToolsButton instanceof HTMLElement) {
      const r = clamp(Math.round(Number(color.r) || 0), 0, 255);
      const g = clamp(Math.round(Number(color.g) || 0), 0, 255);
      const b = clamp(Math.round(Number(color.b) || 0), 0, 255);
      const alpha = clamp((Number(color.a) || 255) / 255, 0, 1);
      const luminance = ((0.2126 * r) + (0.7152 * g) + (0.0722 * b)) / 255;
      const iconColor = luminance >= 0.62 ? 'rgba(12, 18, 26, 0.96)' : 'rgba(244, 248, 252, 0.98)';
      mobileToolsButton.style.setProperty(
        '--mobile-tool-current-color',
        `rgba(${r}, ${g}, ${b}, ${Math.max(0.76, alpha * 0.96)})`
      );
      mobileToolsButton.style.setProperty('--mobile-tool-icon-color', iconColor);
    }
  }

  function getActiveToolIconNode() {
    if (!toolButtons || !toolButtons.length) {
      return null;
    }
    const activeTool = state.tool;
    const button = toolButtons.find(btn => btn.dataset.tool === activeTool);
    if (!button) {
      return null;
    }
    const icon = button.querySelector('img, svg');
    if (icon) {
      return icon.cloneNode(true);
    }
    return null;
  }

  function updateToolTabIcon() {
    const targets = [dom.toolTabIcon, dom.mobileToolTabIcon, dom.mobileDrawerToolTabIcon].filter(Boolean);
    if (!targets.length) {
      return;
    }
    const activeTool = state.tool;
    const iconNode = getActiveToolIconNode();
    targets.forEach(target => {
      if (!target) return;
      target.innerHTML = '';
      if (iconNode) {
        target.appendChild(iconNode.cloneNode(true));
      } else {
        const span = document.createElement('span');
        span.textContent = TOOL_ICON_FALLBACK[activeTool] || activeTool?.slice(0, 1)?.toUpperCase() || '?';
        span.style.fontSize = '12px';
        span.style.lineHeight = '1';
        span.style.fontWeight = '600';
        target.appendChild(span);
      }
    });
  }

  function drawEyedropperPreview(center, selectionMask) {
    const { width, height } = state;
    if (center.x < 0 || center.y < 0 || center.x >= width || center.y >= height) {
      return;
    }
    const idx = center.y * width + center.x;
    if (selectionMask && selectionMask[idx] !== 1) {
      return;
    }
    const sample = sampleCompositeColor(center.x, center.y);
    let sampledColor = resolveSampledColor(sample);
    if (!sampledColor) {
      sampledColor = getBackgroundTileColor(center.x, center.y);
    }
    const previewColor = invertPreviewColor(sampledColor);
    ctx.overlay.fillStyle = rgbaToCss(previewColor);
    ctx.overlay.fillRect(center.x, center.y, 1, 1);
    // Keep the outline inside the sampled pixel so eyedropper preview stays visually 1x1.
    const scale = getPixelAlignedCanvasDisplayScale(state.scale);
    const inset = clamp(1 / scale, 0.06, 0.22);
    const innerSize = Math.max(0, 1 - (inset * 2));
    if (innerSize > 0) {
      const outlineAlpha = clamp(Math.round(Number(sampledColor.a) || 255), 128, 255);
      ctx.overlay.strokeStyle = rgbaToCss({
        r: sampledColor.r,
        g: sampledColor.g,
        b: sampledColor.b,
        a: outlineAlpha,
      });
      ctx.overlay.lineWidth = inset;
      ctx.overlay.strokeRect(center.x + (inset * 0.5), center.y + (inset * 0.5), innerSize, innerSize);
    }
  }

  function drawHoverPreviewOnSurface(surface, center, tool = getActiveTool()) {
    if (!surface?.overlayCtx || !center) {
      return;
    }
    const canvasDoc = surface.canvasDoc || getProjectCanvasDocumentById(surface.canvasDocId);
    const width = Math.max(1, Math.round(Number(canvasDoc?.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc?.height) || 1));
    const x = Math.floor(Number(center.x) || 0);
    const y = Math.floor(Number(center.y) || 0);
    if (x < 0 || y < 0 || x >= width || y >= height) {
      surface.overlayCtx.clearRect(0, 0, surface.overlay.width, surface.overlay.height);
      return;
    }
    const overlayCtx = surface.overlayCtx;
    overlayCtx.clearRect(0, 0, surface.overlay.width, surface.overlay.height);
    overlayCtx.save();
    if (SELECTION_TOOLS.has(tool) || tool === 'eyedropper' || FILL_TOOLS.has(tool)) {
      overlayCtx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      overlayCtx.fillRect(x, y, 1, 1);
      overlayCtx.strokeStyle = 'rgba(9, 18, 34, 0.92)';
      overlayCtx.lineWidth = 0.14;
      overlayCtx.strokeRect(x + 0.07, y + 0.07, 0.86, 0.86);
      overlayCtx.restore();
      return;
    }
    const previewColor = tool === 'eraser'
      ? { r: 255, g: 255, b: 255, a: 180 }
      : normalizeColorValue(getActiveDrawColor());
    const offsets = getBrushOffsets(clamp(Math.round(state.brushSize || 1), 1, 64));
    overlayCtx.fillStyle = rgbaToCss(previewColor);
    for (let i = 0; i < offsets.length; i += 1) {
      const { dx, dy } = offsets[i];
      const px = x + dx;
      const py = y + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) {
        continue;
      }
      overlayCtx.fillRect(px, py, 1, 1);
    }
    overlayCtx.restore();
  }

  function drawFillPreviewPixels(pixels, seed, end, tool = FILL_TOOL_SOLID, options = {}) {
    if (!ctx.overlay || !Array.isArray(pixels) || !pixels.length) {
      return;
    }
    const { width, height } = state;
    const selectionMask = state.selectionMask;
    const fillStyle = normalizeFillStyle(options.fillStyle, getActiveFillStyle(tool));
    const gradientPreview = isGradientFillStyle(fillStyle) && seed && end;
    const paletteIndexOverride = Number.isFinite(pointerState.drawPaletteIndex)
      ? pointerState.drawPaletteIndex
      : undefined;
    const gradientContext = gradientPreview
      ? {
        fillStyle,
        start: normalizeFillGradientPoint(seed, seed),
        end: normalizeFillGradientPoint(end, seed),
        colors: getFillGradientColors(paletteIndexOverride),
        paletteIndexOverride,
        paletteGradient: isIndexColorMode() && !isMultiPaletteIsolationEnabled(),
      }
      : null;
    const solidColor = gradientPreview ? null : normalizeColorValue(getActiveDrawColor(undefined, paletteIndexOverride));
    const useMirrorDedup = pixels.length <= FILL_PREVIEW_MIRROR_DEDUP_MAX_PIXELS;
    const mirrorEnabled = isMirrorEnabledForTool(tool);
    const useGlobalRuns = !gradientPreview
      && !mirrorEnabled
      && normalizeSelectSameMode(state.selectSameMode, SELECT_SAME_MODE_CONNECTED) === SELECT_SAME_MODE_GLOBAL;
    const painted = mirrorEnabled && useMirrorDedup ? new Set() : null;
    // For an opaque solid fill, overlapping source-over writes produce the
    // same result as one write. Batch the common connected-fill preview into
    // one path to avoid a canvas API call per pixel. Keep gradients, alpha
    // colors, very large regions, and the existing global scanline fast path
    // on their specialised paths.
    const canBatchOpaqueSolidPixels = !gradientPreview
      && !useGlobalRuns
      && Number(solidColor?.a) >= 255
      && pixels.length <= 131072;
    let hasBatchedOpaquePixel = false;
    if (canBatchOpaqueSolidPixels) {
      ctx.overlay.fillStyle = rgbaToCss(solidColor);
      ctx.overlay.beginPath();
    }
    let lastColorKey = '';
    const paintPoint = (px, py) => {
      if (px < 0 || py < 0 || px >= width || py >= height) {
        return;
      }
      const maskIndex = py * width + px;
      if (selectionMask && selectionMask[maskIndex] !== 1) {
        return;
      }
      if (painted && painted.has(maskIndex)) {
        return;
      }
      if (painted) {
        painted.add(maskIndex);
      }
      if (canBatchOpaqueSolidPixels) {
        ctx.overlay.rect(px, py, 1, 1);
        hasBatchedOpaquePixel = true;
      } else {
        const color = gradientContext
          ? resolveFillGradientPixel(px, py, gradientContext).color
          : solidColor;
        if (!color) {
          return;
        }
        const colorKey = `${color.r}-${color.g}-${color.b}-${color.a}`;
        if (colorKey !== lastColorKey) {
          ctx.overlay.fillStyle = rgbaToCss(color);
          lastColorKey = colorKey;
        }
        ctx.overlay.fillRect(px, py, 1, 1);
      }
    };

    if (useGlobalRuns) {
      // Global target pixels are gathered in raster order. Coalesce adjacent
      // cells to avoid one fillRect call per pixel on large previews.
      let runStart = -1;
      let runEnd = -1;
      let runY = -1;
      const paintRun = (startX, y, runWidth) => {
        if (runWidth <= 0) return;
        const color = solidColor;
        if (!color) return;
        const colorKey = `${color.r}-${color.g}-${color.b}-${color.a}`;
        if (colorKey !== lastColorKey) {
          ctx.overlay.fillStyle = rgbaToCss(color);
          lastColorKey = colorKey;
        }
        ctx.overlay.fillRect(startX, y, runWidth, 1);
      };
      const flushGlobalRun = () => {
        if (runStart >= 0) paintRun(runStart, runY, runEnd - runStart + 1);
        runStart = -1;
      };
      for (let i = 0; i < pixels.length; i += 1) {
        const idx = pixels[i];
        const px = idx % width;
        const py = Math.floor(idx / width);
        if (selectionMask && selectionMask[idx] !== 1) continue;
        if (runStart >= 0 && py === runY && px === runEnd + 1) {
          runEnd = px;
          continue;
        }
        flushGlobalRun();
        runStart = px;
        runEnd = px;
        runY = py;
      }
      flushGlobalRun();
      return;
    }

    for (let i = 0; i < pixels.length; i += 1) {
      const idx = pixels[i];
      const px = idx % width;
      const py = Math.floor(idx / width);
      if (!mirrorEnabled) {
        paintPoint(px, py);
        continue;
      }
      forEachMirroredPoint(px, py, tool, paintPoint);
    }
    if (canBatchOpaqueSolidPixels && hasBatchedOpaquePixel) {
      ctx.overlay.fill();
    }
  }

  function drawBrushPreview(center, tool = getActiveTool(), sizeOverride) {
    if (!center || !ctx.overlay) return;
    const { width, height } = state;
    if (width <= 0 || height <= 0) return;
    const selectionMask = state.selectionMask;
    const size = clamp(Math.round(sizeOverride || state.brushSize || 1), 1, 64);
    if (SELECTION_TOOLS.has(tool)) {
      ctx.overlay.save();
      drawEyedropperPreview(center, null);
      ctx.overlay.restore();
      return;
    }

    ctx.overlay.save();
    if (tool === 'eyedropper') {
      drawEyedropperPreview(center, selectionMask);
      ctx.overlay.restore();
      return;
    }
    if (BRUSH_TOOLS.has(tool)) {
      const penColor = getActiveDrawColor();
      const resolver = tool === 'pen'
        ? () => penColor
        : (x, y) => getEraserPreviewColor(x, y);
      drawFilledPreview(center, size, selectionMask, resolver);
      ctx.overlay.restore();
      return;
    }

    if (FILL_TOOLS.has(tool)) {
      // Paint Bucket is direct like Aseprite: show only its target cursor
      // while hovering.  Computing and rasterizing a flood preview for every
      // hover cell makes large canvases feel slower than the actual fill.
      drawBrushCrosshair(center, 1, selectionMask);
      ctx.overlay.restore();
      return;
    }

    const color = getActiveDrawColor();
    ctx.overlay.fillStyle = rgbaToCss(color);
    drawFilledPreview(center, size, selectionMask, () => color);
    ctx.overlay.restore();
  }

  function drawDeferredBrushStrokePreview(points, tool = pointerState.tool || state.tool) {
    if (!Array.isArray(points) || !points.length || !ctx.brushPreview || !(dom.canvases.brushPreview instanceof HTMLCanvasElement)) return null;
    const cacheUpdateStartedAt = performance.now();
    const size = clamp(Math.round(state.brushSize || 1), 1, 64);
    const width = Math.max(1, Math.round(Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(state.height) || 1));
    const shape = state.brushShape || 'square';
    const paletteIndex = Number.isFinite(pointerState.drawPaletteIndex)
      ? pointerState.drawPaletteIndex
      : undefined;
    const color = tool === 'eraser' ? null : getActiveDrawColor(undefined, paletteIndex);
    const colorKey = color ? `${color.r}-${color.g}-${color.b}-${color.a}` : '';
    const committedStampCount = clamp(
      Math.round(Number(pointerState.preview?.committedStampCount) || 0),
      0,
      points.length
    );
    const shouldResetCache = !deferredBrushPreviewCache
      || deferredBrushPreviewCache.points !== points
      || deferredBrushPreviewCache.width !== width
      || deferredBrushPreviewCache.height !== height
      || deferredBrushPreviewCache.size !== size
      || deferredBrushPreviewCache.shape !== shape
      || deferredBrushPreviewCache.tool !== tool
      || deferredBrushPreviewCache.colorKey !== colorKey
      || deferredBrushPreviewCache.committedStampCount !== committedStampCount;
    if (shouldResetCache) {
      const canvas = dom.canvases.brushPreview;
      const context = ctx.brushPreview;
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = false;
      deferredBrushPreviewCache = {
        points,
        width,
        height,
        size,
        shape,
        tool,
        colorKey,
        canvas,
        context,
        offsets: getBrushOffsets(size),
        committedStampCount,
        processedPointCount: committedStampCount,
        lastStamp: null,
      };
    }

    const cache = deferredBrushPreviewCache;
    const previewStartIndex = Math.max(0, cache.processedPointCount);
    let renderedPreviewStampCount = 0;
    let dirtyX0 = width;
    let dirtyY0 = height;
    let dirtyX1 = -1;
    let dirtyY1 = -1;
    const previewStride = Math.max(1, Math.floor(size / 5));
    const minDistanceSq = previewStride * previewStride;
    // Read once for this preview pass. The stamp loop already needs this
    // value, so the metric does not introduce an additional mirror check.
    const mirrorEnabled = isMirrorEnabledForTool(tool);
    // Mirrored thick brushes expand one logical stamp into hundreds of canvas
    // rectangles.  The preview is deliberately progressive: limiting the
    // uncommitted work per rAF keeps pointer feedback responsive while the
    // incremental raster writer catches up with the exact stroke underneath.
    const previewStampBudget = mirrorEnabled
      ? Math.max(1, Math.floor(512 / Math.max(1, cache.offsets.length * 2)))
      : Number.POSITIVE_INFINITY;
    const previewInputPointBudget = mirrorEnabled ? 2 : Number.POSITIVE_INFINITY;
    let remainingPreviewStamps = previewStampBudget;
    const colorResolver = tool === 'eraser'
      ? (x, y) => getEraserPreviewColor(x, y)
      : () => color;
    // A normal opaque brush always produces the same final pixel even when
    // mirrored stamps overlap.  Accumulating its 1px rectangles into one
    // canvas path removes thousands of fillRect calls without changing that
    // result. Eraser and translucent colors retain the per-pixel path because
    // their source-over compositing can depend on write order.
    const canBatchOpaqueBrushPixels = tool !== 'eraser' && Number(color?.a) >= 255;
    if (canBatchOpaqueBrushPixels) {
      cache.context.fillStyle = rgbaToCss(color);
      cache.context.beginPath();
    }
    const stampPreview = (point, { force = false } = {}) => {
      if (!point) return;
      const dx = cache.lastStamp ? point.x - cache.lastStamp.x : Infinity;
      const dy = cache.lastStamp ? point.y - cache.lastStamp.y : Infinity;
      if (!force && cache.lastStamp && (dx * dx) + (dy * dy) < minDistanceSq) return;
      if (remainingPreviewStamps <= 0) return false;
      remainingPreviewStamps -= 1;
      renderedPreviewStampCount += 1;
      cache.offsets.forEach(({ dx: offsetX, dy: offsetY }) => {
        const paintPixel = (x, y) => {
          if (x < 0 || y < 0 || x >= width || y >= height) return;
          const index = (y * width) + x;
          if (state.selectionMask && state.selectionMask[index] !== 1) return;
          if (canBatchOpaqueBrushPixels) {
            cache.context.rect(x, y, 1, 1);
          } else {
            const pixelColor = colorResolver(x, y);
            if (!pixelColor) return;
            cache.context.fillStyle = rgbaToCss(pixelColor);
            cache.context.fillRect(x, y, 1, 1);
          }
          if (x < dirtyX0) dirtyX0 = x;
          if (y < dirtyY0) dirtyY0 = y;
          if (x > dirtyX1) dirtyX1 = x;
          if (y > dirtyY1) dirtyY1 = y;
        };
        const x = point.x + offsetX;
        const y = point.y + offsetY;
        if (mirrorEnabled) {
          forEachMirroredPoint(x, y, tool, paintPixel);
        } else {
          paintPixel(x, y);
        }
      });
      cache.lastStamp = point;
      return true;
    };

    if (cache.processedPointCount === 0) {
      stampPreview(points[0]);
      cache.processedPointCount = 1;
    }
    const previewEndIndex = Math.min(
      points.length,
      Math.max(1, cache.processedPointCount) + previewInputPointBudget
    );
    for (let index = Math.max(1, cache.processedPointCount); index < previewEndIndex; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const segment = bresenhamLine(previous.x, previous.y, current.x, current.y);
      const segmentStep = mirrorEnabled
        ? Math.max(1, Math.ceil(Math.max(0, segment.length - 1) / Math.max(1, remainingPreviewStamps)))
        : 1;
      for (let pointIndex = 1; pointIndex < segment.length && remainingPreviewStamps > 0; pointIndex += segmentStep) {
        stampPreview(segment[pointIndex]);
      }
      cache.processedPointCount = index + 1;
    }
    const hasPendingPreviewPoints = cache.processedPointCount < points.length;
    const last = points[points.length - 1];
    if (!hasPendingPreviewPoints && last && (!cache.lastStamp || last.x !== cache.lastStamp.x || last.y !== cache.lastStamp.y)) {
      // applyBrushPath() always stamps the final coordinate. Mirror that
      // contract so the in-progress preview reaches the pointer exactly.
      stampPreview(last, { force: true });
    }
    if (canBatchOpaqueBrushPixels) {
      cache.context.fill();
    }
    const drawImageStartedAt = performance.now();
    const dirtyRectArea = dirtyX1 >= dirtyX0 && dirtyY1 >= dirtyY0
      ? (dirtyX1 - dirtyX0 + 1) * (dirtyY1 - dirtyY0 + 1)
      : 0;
    if (hasPendingPreviewPoints) {
      requestOverlayRender();
    }
    return {
      cacheReset: shouldResetCache,
      previewStartIndex,
      newPreviewStampCount: Math.max(0, cache.processedPointCount - previewStartIndex),
      renderedPreviewStampCount,
      pendingPreviewStampCount: Math.max(0, points.length - cache.processedPointCount),
      cacheCanvasWidth: cache.canvas.width,
      cacheCanvasHeight: cache.canvas.height,
      cacheCanvasArea: cache.canvas.width * cache.canvas.height,
      dirtyRectArea,
      mirrorEnabled,
      cacheUpdateMs: drawImageStartedAt - cacheUpdateStartedAt,
      drawImageMs: performance.now() - drawImageStartedAt,
    };
  }

  function drawFilledPreview(center, size, selectionMask, colorResolver, tool = pointerState.tool || state.tool) {
    const { width, height } = state;
    const offsets = getBrushOffsets(size || 1);
    if (!offsets.length) {
      return;
    }
    let lastKey = null;
    const mirrorEnabled = isMirrorEnabledForTool(tool);

    if (!mirrorEnabled) {
      // The ordinary pen preview has one constant color. Coalesce each brush
      // row into one canvas operation instead of issuing up to 30x30 calls.
      if (!selectionMask && tool === 'pen' && offsets.length > 8) {
        const color = colorResolver ? colorResolver(center.x, center.y) : getActiveDrawColor();
        if (color) ctx.overlay.fillStyle = rgbaToCss(color);
        let offset = 0;
        while (offset < offsets.length) {
          const dy = offsets[offset].dy;
          let startDx = offsets[offset].dx;
          let endDx = startDx;
          offset += 1;
          while (offset < offsets.length && offsets[offset].dy === dy && offsets[offset].dx === endDx + 1) {
            endDx = offsets[offset].dx;
            offset += 1;
          }
          const y = center.y + dy;
          const x0 = center.x + startDx;
          const x1 = center.x + endDx;
          if (y < 0 || y >= height || x1 < 0 || x0 >= width) continue;
          ctx.overlay.fillRect(Math.max(0, x0), y, Math.min(width - 1, x1) - Math.max(0, x0) + 1, 1);
        }
        return;
      }
      for (let i = 0; i < offsets.length; i += 1) {
        const { dx, dy } = offsets[i];
        const x = center.x + dx;
        const y = center.y + dy;
        if (x < 0 || y < 0 || x >= width || y >= height) {
          continue;
        }
        const color = colorResolver ? colorResolver(x, y) : getActiveDrawColor();
        if (!color) {
          continue;
        }
        const idx = y * width + x;
        if (selectionMask && selectionMask[idx] !== 1) {
          continue;
        }
        const colorKey = `${color.r}-${color.g}-${color.b}-${color.a}`;
        if (colorKey !== lastKey) {
          ctx.overlay.fillStyle = rgbaToCss(color);
          lastKey = colorKey;
        }
        ctx.overlay.fillRect(x, y, 1, 1);
      }
      return;
    }

    const painted = new Set();
    for (let i = 0; i < offsets.length; i += 1) {
      const { dx, dy } = offsets[i];
      const x = center.x + dx;
      const y = center.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) {
        continue;
      }
      const color = colorResolver ? colorResolver(x, y) : getActiveDrawColor();
      if (!color) {
        continue;
      }
      forEachMirroredPoint(x, y, tool, (mx, my) => {
        if (mx < 0 || my < 0 || mx >= width || my >= height) {
          return;
        }
        const idx = my * width + mx;
        if (selectionMask && selectionMask[idx] !== 1) {
          return;
        }
        if (painted.has(idx)) {
          return;
        }
        painted.add(idx);
        const colorKey = `${color.r}-${color.g}-${color.b}-${color.a}`;
        if (colorKey !== lastKey) {
          ctx.overlay.fillStyle = rgbaToCss(color);
          lastKey = colorKey;
        }
        ctx.overlay.fillRect(mx, my, 1, 1);
      });
    }
  }

  function drawBrushCrosshair(center, size, selectionMask) {
    const { width, height } = state;
    const halfDown = Math.floor(size / 2);
    const halfUp = Math.ceil(size / 2);
    const minX = clamp(center.x - halfDown, 0, width - 1);
    const maxX = clamp(center.x + halfUp - 1, 0, width - 1);
    const minY = clamp(center.y - halfDown, 0, height - 1);
    const maxY = clamp(center.y + halfUp - 1, 0, height - 1);
    const crossY = clamp(center.y, minY, maxY);
    for (let x = minX; x <= maxX; x += 1) {
      const idx = crossY * width + x;
      if (!selectionMask || selectionMask[idx] === 1) {
        ctx.overlay.fillRect(x, crossY, 1, 1);
      }
    }
    const crossX = clamp(center.x, minX, maxX);
    for (let y = minY; y <= maxY; y += 1) {
      const idx = y * width + crossX;
      if (!selectionMask || selectionMask[idx] === 1) {
        ctx.overlay.fillRect(crossX, y, 1, 1);
      }
    }
  }

  function computeFillPreview(x, y, options = {}) {
    const layer = getActiveLayer();
    if (!layer) return null;
    const width = state.width;
    const height = state.height;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return [];
    }
    const selectionMask = state.selectionMask;
    const startIdx = y * width + x;
    if (selectionMask && selectionMask[startIdx] !== 1) {
      return [];
    }
    const matchState = getLayerPixelMatchState(layer, startIdx);
    if (!matchState) {
      return [];
    }
    const indexMode = isIndexColorMode();
    const fillMode = normalizeSelectSameMode(state.selectSameMode, SELECT_SAME_MODE_CONNECTED);
    const fillStyle = normalizeFillStyle(options.fillStyle, getActiveFillStyle());
    const gradientFill = isGradientFillStyle(fillStyle);
    const paletteIndex = indexMode
      ? normalizePaletteIndex(state.activePaletteIndex, state.activePaletteIndex)
      : -1;
    const drawRgbColor = indexMode ? null : normalizeColorValue(getActiveDrawColor());
    const targetIndex = Number.isInteger(matchState.paletteIndex)
      ? matchState.paletteIndex
      : -1;
    if (!gradientFill && indexMode && targetIndex >= 0 && targetIndex === paletteIndex) {
      return [];
    }
    if (!gradientFill && !indexMode && drawRgbColor) {
      const sourceColor = {
        r: matchState.r,
        g: matchState.g,
        b: matchState.b,
        a: matchState.a,
      };
      if (colorsMatchRgba(sourceColor, drawRgbColor)) {
        return [];
      }
    }
    const previewLimit = fillMode === SELECT_SAME_MODE_GLOBAL
      ? FILL_PREVIEW_GLOBAL_MAX_PIXELS
      : FILL_PREVIEW_MAX_PIXELS;
    return collectFillTargetPixels(layer, x, y, { fillMode, selectionMask, limit: previewLimit });
  }

  function markFillPreviewPixelsTruncated(pixels) {
    if (!Array.isArray(pixels) || !pixels.length) {
      return;
    }
    try {
      pixels[FILL_PREVIEW_TRUNCATED_FLAG] = true;
    } catch (error) {
      // Ignore if the array cannot be flagged.
    }
  }

  function isFillPreviewPixelsTruncated(pixels) {
    return Boolean(
      Array.isArray(pixels)
      && pixels.length
      && pixels[FILL_PREVIEW_TRUNCATED_FLAG]
    );
  }

  function getFillPreviewContextKey(options = {}) {
    const frame = getActiveFrame();
    const layer = getActiveLayer();
    if (!frame || !layer) return null;
    const selectionMask = state.selectionMask;
    const selectionMaskId = getSelectionMaskCacheId(selectionMask);
    const selectionBounds = state.selectionBounds;
    const selectionKey = selectionMask
      ? `${selectionMaskId}:${selectionBounds?.x0 ?? ''},${selectionBounds?.y0 ?? ''},${selectionBounds?.x1 ?? ''},${selectionBounds?.y1 ?? ''}`
      : 'none';
    const fillMode = normalizeSelectSameMode(state.selectSameMode, SELECT_SAME_MODE_CONNECTED);
    const activeColor = normalizeColorValue(getActiveDrawColor());
    const secondaryColor = normalizeColorValue(state.palette[state.secondaryPaletteIndex] || state.activeRgb);
    const fillStyle = normalizeFillStyle(options.fillStyle, getActiveFillStyle());
    const colorKey = `${normalizeColorMode(state.colorMode, COLOR_MODE_INDEX)}-${state.activePaletteIndex}-${state.secondaryPaletteIndex}-${activeColor.r},${activeColor.g},${activeColor.b},${activeColor.a}-${secondaryColor.r},${secondaryColor.g},${secondaryColor.b},${secondaryColor.a}`;
    return `${frame.id}|${layer.id}|${state.width}x${state.height}|${selectionKey}|fill-mode-${fillMode}|fill-style-${fillStyle}|${colorKey}`;
  }

  function ensureFillPreviewLookup(contextKey) {
    const totalPixels = Math.max(1, state.width * state.height);
    if (fillPreviewCache.contextKey !== contextKey
      || !Array.isArray(fillPreviewCache.byPixel)
      || fillPreviewCache.byPixel.length !== totalPixels) {
      fillPreviewCache.contextKey = contextKey;
      fillPreviewCache.byPixel = new Array(totalPixels);
    }
    return fillPreviewCache.byPixel;
  }

  function getFillPreviewPixels(x, y, options = {}) {
    const fillStyle = normalizeFillStyle(options.fillStyle, getActiveFillStyle());
    const contextKey = getFillPreviewContextKey({ fillStyle });
    if (!contextKey) {
      return null;
    }
    const width = Math.max(1, state.width);
    const cacheIndex = clamp(y, 0, Math.max(0, state.height - 1)) * width + clamp(x, 0, width - 1);
    const lookup = ensureFillPreviewLookup(contextKey);
    const cached = lookup[cacheIndex];
    if (cached !== undefined) {
      return cached;
    }
    const pixels = computeFillPreview(x, y, { fillStyle }) || EMPTY_FILL_PREVIEW_PIXELS;
    if (!pixels.length) {
      lookup[cacheIndex] = EMPTY_FILL_PREVIEW_PIXELS;
      return EMPTY_FILL_PREVIEW_PIXELS;
    }
    const fillMode = normalizeSelectSameMode(state.selectSameMode, SELECT_SAME_MODE_CONNECTED);
    const cacheBackfillLimit = fillMode === SELECT_SAME_MODE_GLOBAL
      ? FILL_PREVIEW_GLOBAL_MAX_PIXELS
      : FILL_PREVIEW_CACHE_BACKFILL_MAX_PIXELS;
    const canBackfill = (
      pixels.length <= cacheBackfillLimit
      && !isFillPreviewPixelsTruncated(pixels)
    );
    if (canBackfill) {
      pixels.forEach(idx => {
        if (idx >= 0 && idx < lookup.length) {
          lookup[idx] = pixels;
        }
      });
    }
    lookup[cacheIndex] = pixels;
    return pixels;
  }

  function getSelectionMaskCacheId(mask) {
    if (!mask) {
      return 'none';
    }
    let id = selectionMaskCacheIds.get(mask);
    if (!id) {
      id = `sel-${selectionMaskCacheIdCounter}`;
      selectionMaskCacheIdCounter += 1;
      selectionMaskCacheIds.set(mask, id);
    }
    return id;
  }

  function drawSelectionOverlay() {
    const mask = state.selectionMask;
    if (!mask) return;
    const { width, height } = state;
    const bounds = state.selectionBounds;
    const usePixelOutline = state.selectionOutlineMode === 'pixel';
    strokeSelectionPath((pathCtx, scale) => {
      // The selection data remains pixel-perfect. For broad selections the
      // visible marching-ants line is intentionally reduced to its bounds:
      // tracing every selected pixel into an SVG path is expensive and does
      // not provide useful detail at that scale.
      if (!usePixelOutline && bounds) {
        traceSelectionBoundsOutline(pathCtx, bounds, scale);
      } else {
        traceSelectionOutline(pathCtx, mask, width, height, scale);
      }
    }, { ensureResolution: false });
  }

  function syncSelectionOutlineToViewportTransform() {
    const pendingMove = getPendingSelectionMoveState();
    if (pendingMove && pendingMove.hasCleared) {
      // During a move, state.selectionMask still describes the source. Zoom
      // and pan must keep drawing the pending destination instead of briefly
      // restoring a ghost outline at the cleared source position.
      drawSelectionMovePreview(pendingMove);
      return;
    }
    const preview = pointerState.selectionPreview;
    if (preview && pointerState.tool === 'selectLasso') {
      drawLassoPreview(preview.points);
      return;
    }
    if (
      preview
      && (
        pointerState.tool === 'selectRect'
        || pointerState.tool === POINTER_TOOL_CUSTOM_BRUSH_RECT
      )
    ) {
      drawRectanglePreview(preview.start, preview.end);
      return;
    }
    if (state.selectionMask) {
      drawSelectionOverlay();
      return;
    }
    clearSelectionOutlineSvg();
  }

  function updateSelectionDashAnimation(timestamp) {
    if (!Number.isFinite(timestamp)) {
      timestamp = performance.now();
    }
    if (!lastSelectionDashTime) {
      lastSelectionDashTime = timestamp;
      return;
    }
    const delta = Math.max(0, timestamp - lastSelectionDashTime);
    lastSelectionDashTime = timestamp;
    if (delta === 0) return;
    const advance = (delta / 1000) * SELECTION_DASH_SPEED;
    selectionDashScreenOffset = (selectionDashScreenOffset + advance) % 1024;
  }

  function resetSelectionDashAnimation() {
    selectionDashScreenOffset = 0;
    lastSelectionDashTime = 0;
  }

  function refreshSelectionDashSvg() {
    if (
      !(selectionOutlineSvg instanceof SVGSVGElement)
      || !(selectionOutlinePathDark instanceof SVGPathElement)
      || !(selectionOutlinePathLight instanceof SVGPathElement)
      || selectionOutlineSvg.classList.contains('is-hidden')
      || !selectionOutlinePathDark.getAttribute('d')
    ) {
      return false;
    }
    updateSelectionDashAnimation(performance.now());
    const dashPattern = [8, 5];
    const dashCycle = dashPattern.reduce((sum, value) => sum + value, 0) || 8;
    const dashOffset = ((selectionDashScreenOffset % dashCycle) + dashCycle) % dashCycle;
    selectionOutlinePathDark.setAttribute('stroke-dashoffset', String(dashOffset));
    selectionOutlinePathLight.setAttribute('stroke-dashoffset', String(dashOffset + dashPattern[0]));
    return true;
  }

  function getSelectionOutlineSvg() {
    const stack = activeCanvasSurface?.stack instanceof HTMLElement
      ? activeCanvasSurface.stack
      : dom.canvases.stack;
    if (!(stack instanceof HTMLElement)) {
      return null;
    }
    if (!(selectionOutlineSvg instanceof SVGSVGElement)) {
      selectionOutlineSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      selectionOutlineSvg.classList.add('selection-outline-svg');
      selectionOutlineSvg.setAttribute('aria-hidden', 'true');
      selectionOutlineSvg.setAttribute('focusable', 'false');
      selectionOutlinePathDark = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      selectionOutlinePathLight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      selectionOutlinePathDark.classList.add('selection-outline-svg__path', 'selection-outline-svg__path--dark');
      selectionOutlinePathLight.classList.add('selection-outline-svg__path', 'selection-outline-svg__path--light');
      selectionOutlineSvg.append(selectionOutlinePathDark, selectionOutlinePathLight);
    }
    if (selectionOutlineSvg.parentElement !== stack) {
      stack.appendChild(selectionOutlineSvg);
    }
    return selectionOutlineSvg;
  }

  function clearSelectionOutlineSvg() {
    if (selectionOutlinePathDark instanceof SVGPathElement) {
      selectionOutlinePathDark.setAttribute('d', '');
    }
    if (selectionOutlinePathLight instanceof SVGPathElement) {
      selectionOutlinePathLight.setAttribute('d', '');
    }
    if (selectionOutlineSvg instanceof SVGSVGElement) {
      selectionOutlineSvg.classList.add('is-hidden');
    }
  }

  function createSvgPathTraceBuilder() {
    const commands = [];
    const format = value => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return '0';
      }
      return Number(numeric.toFixed(3)).toString();
    };
    return {
      moveTo(x, y) {
        commands.push(`M${format(x)} ${format(y)}`);
      },
      lineTo(x, y) {
        commands.push(`L${format(x)} ${format(y)}`);
      },
      rect(x, y, width, height) {
        const x0 = Number(x) || 0;
        const y0 = Number(y) || 0;
        const x1 = x0 + (Number(width) || 0);
        const y1 = y0 + (Number(height) || 0);
        commands.push(
          `M${format(x0)} ${format(y0)}`,
          `L${format(x1)} ${format(y0)}`,
          `L${format(x1)} ${format(y1)}`,
          `L${format(x0)} ${format(y1)}`,
          'Z'
        );
      },
      closePath() {
        commands.push('Z');
      },
      toString() {
        return commands.join(' ');
      },
    };
  }

  function ensureSelectionCanvasResolution(scale) {
    const canvas = dom.canvases.selection;
    if (!canvas) return;
    selectionCanvasActive = true;
    const displayScale = Math.max(Number(scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
    const maxScaleForWidth = MAX_SELECTION_CANVAS_DIMENSION / Math.max(1, state.width);
    const maxScaleForHeight = MAX_SELECTION_CANVAS_DIMENSION / Math.max(1, state.height);
    const renderScale = Math.max(
      MIN_ZOOM_SCALE,
      Math.min(displayScale, maxScaleForWidth, maxScaleForHeight)
    );
    selectionDisplayScale = displayScale;
    selectionRenderScale = renderScale;

    const renderWidth = Math.max(1, Math.round(state.width * renderScale));
    const renderHeight = Math.max(1, Math.round(state.height * renderScale));
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
      if (ctx.selection) {
        ctx.selection.setTransform(1, 0, 0, 1, 0, 0);
        ctx.selection.imageSmoothingEnabled = false;
      }
    }
    const cssWidth = `${state.width * displayScale}px`;
    const cssHeight = `${state.height * displayScale}px`;
    if (canvas.style.width !== cssWidth) {
      canvas.style.width = cssWidth;
    }
    if (canvas.style.height !== cssHeight) {
      canvas.style.height = cssHeight;
    }
  }

  function getSelectionPathScaleAxis(scale, axis) {
    if (scale && typeof scale === 'object') {
      const value = axis === 'y' ? scale.y : scale.x;
      return Math.max(Number(value) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
    }
    return Math.max(Number(scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
  }

  function scaleSelectionPathX(value, scale) {
    return (Number(value) || 0) * getSelectionPathScaleAxis(scale, 'x');
  }

  function scaleSelectionPathY(value, scale) {
    return (Number(value) || 0) * getSelectionPathScaleAxis(scale, 'y');
  }

  function strokeSelectionPath(trace, options = {}) {
    if (typeof trace !== 'function') return;
    const svg = getSelectionOutlineSvg();
    if (
      svg instanceof SVGSVGElement
      && selectionOutlinePathDark instanceof SVGPathElement
      && selectionOutlinePathLight instanceof SVGPathElement
    ) {
      const canvasDoc = getActiveProjectCanvasDocument();
      const logicalWidth = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1));
      const logicalHeight = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(state.height) || 1));
      const displayScale = getProjectCanvasDisplayScale(canvasDoc);
      const displayWidth = logicalWidth * displayScale;
      const displayHeight = logicalHeight * displayScale;
      svg.setAttribute('viewBox', `0 0 ${logicalWidth} ${logicalHeight}`);
      svg.style.width = `${displayWidth}px`;
      svg.style.height = `${displayHeight}px`;
      const pathBuilder = createSvgPathTraceBuilder();
      trace(pathBuilder, { x: 1, y: 1 });
      const pathData = pathBuilder.toString();
      const dashPattern = options.dashPattern || [8, 5];
      const dashCycle = dashPattern.reduce((sum, value) => sum + value, 0) || 8;
      const dashOffset = ((selectionDashScreenOffset) % dashCycle + dashCycle) % dashCycle;
      const firstDash = dashPattern[0] || dashCycle;
      const dashArray = dashPattern.map(value => Math.max(0.001, Number(value) || 0)).join(' ');
      selectionOutlinePathDark.setAttribute('d', pathData);
      selectionOutlinePathLight.setAttribute('d', pathData);
      selectionOutlinePathDark.setAttribute('stroke-dasharray', dashArray);
      selectionOutlinePathLight.setAttribute('stroke-dasharray', dashArray);
      selectionOutlinePathDark.setAttribute('stroke-dashoffset', String(dashOffset));
      selectionOutlinePathLight.setAttribute('stroke-dashoffset', String(dashOffset + firstDash));
      svg.classList.toggle('is-hidden', !pathData);
      return;
    }

    const targetCtx = ctx.selection;
    if (!targetCtx || typeof targetCtx.setLineDash !== 'function') {
      return;
    }
    const displayScale = Math.max(Number(state.scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
    if (options.ensureResolution !== false) {
      ensureSelectionCanvasResolution(displayScale);
    }
    const renderScale = selectionRenderScale;
    const scaleRatio = renderScale / selectionDisplayScale;
    const dashPatternScreen = options.dashPattern || [8, 5];
    const dashPatternRender = dashPatternScreen.map(value => value * scaleRatio);
    const dashCycleScreen = dashPatternScreen.reduce((sum, value) => sum + value, 0) || 8;
    const dashOffsetScreen = ((selectionDashScreenOffset) % dashCycleScreen + dashCycleScreen) % dashCycleScreen;
    const firstDashScreen = dashPatternScreen[0] || dashCycleScreen;

    targetCtx.save();
    if (options.translateHalf) {
      targetCtx.translate(0.5 * scaleRatio, 0.5 * scaleRatio);
    }
    targetCtx.lineWidth = scaleRatio;
    targetCtx.setLineDash(dashPatternRender);
    targetCtx.lineJoin = 'miter';
    targetCtx.lineCap = 'butt';

    targetCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    targetCtx.lineDashOffset = dashOffsetScreen * scaleRatio;
    targetCtx.beginPath();
    trace(targetCtx, renderScale);
    targetCtx.stroke();

    targetCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    targetCtx.lineDashOffset = (dashOffsetScreen + firstDashScreen) * scaleRatio;
    targetCtx.beginPath();
    trace(targetCtx, renderScale);
    targetCtx.stroke();

    targetCtx.restore();
  }

  function traceSelectionOutline(pathCtx, mask, width, height, scale) {
    const scaleX = getSelectionPathScaleAxis(scale, 'x');
    const scaleY = getSelectionPathScaleAxis(scale, 'y');
    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = rowOffset + x;
        if (mask[idx] !== 1) continue;
        const topFilled = y > 0 && mask[idx - width] === 1;
        const bottomFilled = y < height - 1 && mask[idx + width] === 1;
        const leftFilled = x > 0 && mask[idx - 1] === 1;
        const rightFilled = x < width - 1 && mask[idx + 1] === 1;

        const sx = x * scaleX;
        const sy = y * scaleY;
        const ex = sx + scaleX;
        const ey = sy + scaleY;

        if (!topFilled) {
          pathCtx.moveTo(sx, sy);
          pathCtx.lineTo(ex, sy);
        }
        if (!bottomFilled) {
          pathCtx.moveTo(sx, ey);
          pathCtx.lineTo(ex, ey);
        }
        if (!leftFilled) {
          pathCtx.moveTo(sx, sy);
          pathCtx.lineTo(sx, ey);
        }
        if (!rightFilled) {
          pathCtx.moveTo(ex, sy);
          pathCtx.lineTo(ex, ey);
        }
      }
    }
  }

  function traceSelectionBoundsOutline(pathCtx, bounds, scale) {
    if (!bounds) {
      return;
    }
    const x0 = scaleSelectionPathX(bounds.x0, scale);
    const y0 = scaleSelectionPathY(bounds.y0, scale);
    const x1 = scaleSelectionPathX((Number(bounds.x1) || 0) + 1, scale);
    const y1 = scaleSelectionPathY((Number(bounds.y1) || 0) + 1, scale);
    pathCtx.moveTo(x0, y0);
    pathCtx.lineTo(x1, y0);
    pathCtx.lineTo(x1, y1);
    pathCtx.lineTo(x0, y1);
    pathCtx.lineTo(x0, y0);
  }

  function drawPreviewShape(previewState, targetContext = ctx.overlay) {
    const tool = (previewState && typeof previewState.tool === 'string')
      ? previewState.tool
      : (pointerState.tool || state.tool);
    const preview = previewState.preview;
    if (!preview || !targetContext) return;
    const { start, end, points } = preview;
    if (!start || !end) return;
    const width = state.width;
    const height = state.height;
    const selectionMask = state.selectionMask;
    const color = getActiveDrawColor();
    const previewTool = tool;
    const mirrorEnabled = isMirrorEnabledForTool(previewTool);
    // Mirror axes and pivot cannot change during this render. Normalize them
    // once, then reuse the same state for every source pixel in this shape.
    const normalizedMirrorState = mirrorEnabled ? getNormalizedMirrorState() : null;
    const offsets = getBrushOffsets(state.brushSize || 1);
    const usePaintDedup = mirrorEnabled || Boolean(selectionMask);
    const painted = usePaintDedup ? new Set() : null;
    const brushSize = Math.max(1, Math.round(Number(state.brushSize) || 1));
    const stampStride = brushSize >= 12 ? Math.max(1, Math.floor(brushSize / 5)) : 1;
    const stampPointSequence = sequence => {
      let last = null;
      for (let index = 0; index < sequence.length; index += stampStride) {
        last = sequence[index];
        stamp(last.x, last.y);
      }
      const finalPoint = sequence[sequence.length - 1];
      if (finalPoint && finalPoint !== last) stamp(finalPoint.x, finalPoint.y);
    };
    // A shape preview can contain thousands of stamped pixels when a thick
    // brush or mirror is active.  Build one opaque canvas path per preview
    // instead of issuing a fillRect call for each pixel.
    const canBatchOpaqueShapePixels = Number(color?.a) >= 255;
    let hasBatchedOpaqueShapePixel = false;
    // Consecutive thick mirrored stamps overlap heavily. Cache their reflected
    // point sets for this one preview and coalesce opaque pixels into runs so
    // the hot loop does not repeat Set/object work or emit one path rect per
    // reflected pixel.
    const mirroredPointCache = mirrorEnabled ? new Map() : null;
    const opaqueMirrorRows = mirrorEnabled && canBatchOpaqueShapePixels ? new Map() : null;
    targetContext.save();
    targetContext.fillStyle = rgbaToCss(color);
    if (canBatchOpaqueShapePixels) {
      targetContext.beginPath();
    }
    const paintPixel = (px, py) => {
      if (px < 0 || py < 0 || px >= width || py >= height) {
        return;
      }
      const idx = py * width + px;
      if (selectionMask && selectionMask[idx] !== 1) {
        return;
      }
      if (painted && painted.has(idx)) {
        return;
      }
      if (painted) {
        painted.add(idx);
      }
      if (opaqueMirrorRows) {
        let row = opaqueMirrorRows.get(py);
        if (!row) {
          row = new Set();
          opaqueMirrorRows.set(py, row);
        }
        row.add(px);
        hasBatchedOpaqueShapePixel = true;
      } else if (canBatchOpaqueShapePixels) {
        targetContext.rect(px, py, 1, 1);
        hasBatchedOpaqueShapePixel = true;
      } else {
        targetContext.fillRect(px, py, 1, 1);
      }
    };
    const stamp = (x, y) => {
      for (let offsetIndex = 0; offsetIndex < offsets.length; offsetIndex += 1) {
        const { dx, dy } = offsets[offsetIndex];
        const px = x + dx;
        const py = y + dy;

        if (!mirrorEnabled) {
          paintPixel(px, py);
          continue;
        }
        const sourceIndex = (py >= 0 && py < height && px >= 0 && px < width)
          ? (py * width) + px
          : -1;
        if (sourceIndex >= 0 && painted?.has(sourceIndex)) {
          continue;
        }
        const cacheKey = sourceIndex >= 0 ? sourceIndex : `${px},${py}`;
        let mirroredPoints = mirroredPointCache.get(cacheKey);
        if (!mirroredPoints) {
          mirroredPoints = getMirroredPointSet(px, py, {
            tool: previewTool,
            includeOriginal: true,
            mirrorState: normalizedMirrorState,
          });
          mirroredPointCache.set(cacheKey, mirroredPoints);
        }
        for (let pointIndex = 0; pointIndex < mirroredPoints.length; pointIndex += 1) {
          const point = mirroredPoints[pointIndex];
          paintPixel(point.x, point.y);
        }
      }
    };

    if (tool === 'line' || tool === 'curve') {
      const linePoints = bresenhamLine(start.x, start.y, end.x, end.y);
      stampPointSequence(linePoints);
    } else if (tool === 'rect' || tool === 'rectFill') {
      const x0 = Math.min(start.x, end.x);
      const x1 = Math.max(start.x, end.x);
      const y0 = Math.min(start.y, end.y);
      const y1 = Math.max(start.y, end.y);
      if (!mirrorEnabled && !selectionMask && brushSize === 1) {
        const rectWidth = Math.max(0, (x1 - x0) + 1);
        const rectHeight = Math.max(0, (y1 - y0) + 1);
        if (rectWidth > 0 && rectHeight > 0) {
          if (tool === 'rectFill') {
            targetContext.fillRect(x0, y0, rectWidth, rectHeight);
          } else {
            targetContext.fillRect(x0, y0, rectWidth, 1);
            if (rectHeight > 1) {
              targetContext.fillRect(x0, y1, rectWidth, 1);
            }
            if (rectHeight > 2) {
              targetContext.fillRect(x0, y0 + 1, 1, rectHeight - 2);
              if (rectWidth > 1) {
                targetContext.fillRect(x1, y0 + 1, 1, rectHeight - 2);
              }
            }
          }
          targetContext.restore();
          return;
        }
      }
      if (tool === 'rectFill') {
        const ys = []; const xs = [];
        for (let y = y0; y <= y1; y += stampStride) ys.push(y);
        if (ys[ys.length - 1] !== y1) ys.push(y1);
        for (let x = x0; x <= x1; x += stampStride) xs.push(x);
        if (xs[xs.length - 1] !== x1) xs.push(x1);
        ys.forEach(y => xs.forEach(x => stamp(x, y)));
      } else {
        const xs = []; const ys = [];
        for (let x = x0; x <= x1; x += stampStride) xs.push(x);
        if (xs[xs.length - 1] !== x1) xs.push(x1);
        for (let y = y0; y <= y1; y += stampStride) ys.push(y);
        if (ys[ys.length - 1] !== y1) ys.push(y1);
        xs.forEach(x => {
          stamp(x, y0);
          stamp(x, y1);
        });
        ys.forEach(y => {
          stamp(x0, y);
          stamp(x1, y);
        });
      }
    } else if (tool === 'ellipse' || tool === 'ellipseFill') {
      const x0 = Math.min(start.x, end.x);
      const x1 = Math.max(start.x, end.x);
      const y0 = Math.min(start.y, end.y);
      const y1 = Math.max(start.y, end.y);
      const filled = tool === 'ellipseFill';
      let pixelCount = 0;
      let lastPoint = null;
      drawEllipsePixels(x0, y0, x1, y1, filled, (x, y) => {
        lastPoint = { x, y };
        if ((pixelCount++ % stampStride) === 0) stamp(x, y);
      });
      if (lastPoint && ((pixelCount - 1) % stampStride) !== 0) stamp(lastPoint.x, lastPoint.y);
    }

    if (opaqueMirrorRows) {
      opaqueMirrorRows.forEach((row, y) => {
        const xs = Array.from(row).sort((a, b) => a - b);
        let startX = -1;
        let previousX = -2;
        const flushRun = () => {
          if (startX >= 0) {
            targetContext.rect(startX, y, previousX - startX + 1, 1);
          }
        };
        for (let index = 0; index < xs.length; index += 1) {
          const x = xs[index];
          if (x !== previousX + 1) {
            flushRun();
            startX = x;
          }
          previousX = x;
        }
        flushRun();
      });
    }
    if (canBatchOpaqueShapePixels && hasBatchedOpaqueShapePixel) {
      targetContext.fill();
    }
    targetContext.restore();
  }

  function drawLassoPreview(points) {
    if (!points || points.length < 2) return;
    strokeSelectionPath((pathCtx, scale) => {
      pathCtx.moveTo(scaleSelectionPathX(points[0].x, scale), scaleSelectionPathY(points[0].y, scale));
      for (let i = 1; i < points.length; i += 1) {
        const point = points[i];
        pathCtx.lineTo(scaleSelectionPathX(point.x, scale), scaleSelectionPathY(point.y, scale));
      }
      pathCtx.closePath();
    });
  }

  function drawRectanglePreview(start, end) {
    if (!start || !end) return;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x) + 1;
    const h = Math.abs(end.y - start.y) + 1;
    strokeSelectionPath((pathCtx, scale) => {
      pathCtx.rect(
        scaleSelectionPathX(x, scale),
        scaleSelectionPathY(y, scale),
        w * getSelectionPathScaleAxis(scale, 'x'),
        h * getSelectionPathScaleAxis(scale, 'y')
      );
    });
  }


  return Object.freeze({
    clearVirtualCursorCanvas,
    drawVirtualCursor,
    getOnionSkinFrameCacheEntry,
    buildOnionSkinTintCanvas,
    getOnionSkinTintCanvas,
    renderOnionSkin,
    renderOverlay,
    getBackgroundTileColor,
    getEraserPreviewColor,
    resolveSampledColor,
    getActiveSwatchColor,
    invertPreviewColor,
    updateColorTabSwatch,
    getActiveToolIconNode,
    updateToolTabIcon,
    drawEyedropperPreview,
    drawHoverPreviewOnSurface,
    drawFillPreviewPixels,
    drawBrushPreview,
    drawDeferredBrushStrokePreview,
    drawFilledPreview,
    drawBrushCrosshair,
    computeFillPreview,
    markFillPreviewPixelsTruncated,
    isFillPreviewPixelsTruncated,
    getFillPreviewContextKey,
    ensureFillPreviewLookup,
    getFillPreviewPixels,
    getSelectionMaskCacheId,
    drawSelectionOverlay,
    syncSelectionOutlineToViewportTransform,
    updateSelectionDashAnimation,
    resetSelectionDashAnimation,
    getSelectionOutlineSvg,
    clearSelectionOutlineSvg,
    createSvgPathTraceBuilder,
    ensureSelectionCanvasResolution,
    getSelectionPathScaleAxis,
    scaleSelectionPathX,
    scaleSelectionPathY,
    strokeSelectionPath,
    traceSelectionOutline,
    traceSelectionBoundsOutline,
    drawPreviewShape,
    drawLassoPreview,
    drawRectanglePreview,
  });
      }
    })(scope);
  }

  root.canvasOverlayWorkflowUtils = Object.freeze({
    createCanvasOverlayWorkflowUtils,
  });
})();
