(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasRenderWorkflowUtils(rawScope = {}) {
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
  function renderEverything() {
    requestRender();
  }

  function getCanvasCompositeFrameCacheKey(frame = getActiveFrame()) {
    if (!frame?.id) return '';
    const canvasId = getActiveProjectCanvasDocument()?.id || 'canvas';
    return `${canvasId}:${frame.id}`;
  }

  function getCanvasCompositeVisualKey(frame, width, height) {
    const paletteKey = (Array.isArray(state.palette) ? state.palette : [])
      .map(color => `${color?.r || 0},${color?.g || 0},${color?.b || 0},${color?.a || 0}`)
      .join(';');
    const layerKey = (Array.isArray(frame?.layers) ? frame.layers : [])
      .map(layer => [
        layer?.id || '',
        getDisplayedLayerVisibility(layer, true) ? 1 : 0,
        getDisplayedLayerPreviewOpacity(layer, 1),
        normalizeLayerBlendMode(layer?.blendMode),
        layer?.directOnly === true ? 1 : 0,
        isSimulationLayer(layer) ? 1 : 0,
      ].join(':'))
      .join('|');
    return `${width}x${height}|${paletteKey}|${layerKey}`;
  }

  function deleteCanvasCompositeFrameCacheEntry(cacheKey) {
    if (!cacheKey || !canvasCompositeFrameCache?.byFrame?.has(cacheKey)) {
      return false;
    }
    const entry = canvasCompositeFrameCache.byFrame.get(cacheKey);
    canvasCompositeFrameCache.byFrame.delete(cacheKey);
    canvasCompositeFrameCache.bytes = Math.max(
      0,
      canvasCompositeFrameCache.bytes - Math.max(0, Number(entry?.bytes) || 0)
    );
    return true;
  }

  function invalidateCanvasCompositeFrameCacheEntry(frame = getActiveFrame()) {
    return deleteCanvasCompositeFrameCacheEntry(getCanvasCompositeFrameCacheKey(frame));
  }

  function clearCanvasCompositeFrameCache({ resetStats = false } = {}) {
    canvasCompositeFrameCache.byFrame.clear();
    canvasCompositeFrameCache.bytes = 0;
    if (resetStats) {
      canvasCompositeFrameCache.hits = 0;
      canvasCompositeFrameCache.misses = 0;
    }
  }

  function getCanvasCompositeFrameCacheStats() {
    return {
      entries: canvasCompositeFrameCache.byFrame.size,
      bytes: Math.max(0, Number(canvasCompositeFrameCache.bytes) || 0),
      maxBytes: Math.max(0, Number(canvasCompositeFrameCache.maxBytes) || 0),
      hits: Math.max(0, Number(canvasCompositeFrameCache.hits) || 0),
      misses: Math.max(0, Number(canvasCompositeFrameCache.misses) || 0),
    };
  }

  function readCanvasCompositeFrameCache(frame, width, height) {
    const cacheKey = getCanvasCompositeFrameCacheKey(frame);
    if (!cacheKey) return null;
    const entry = canvasCompositeFrameCache.byFrame.get(cacheKey) || null;
    const visualKey = getCanvasCompositeVisualKey(frame, width, height);
    if (!entry || entry.visualKey !== visualKey || entry.width !== width || entry.height !== height) {
      if (entry) deleteCanvasCompositeFrameCacheEntry(cacheKey);
      canvasCompositeFrameCache.misses += 1;
      return null;
    }
    canvasCompositeFrameCache.byFrame.delete(cacheKey);
    canvasCompositeFrameCache.byFrame.set(cacheKey, entry);
    canvasCompositeFrameCache.hits += 1;
    return entry.imageData;
  }

  function writeCanvasCompositeFrameCache(frame, width, height, imageData) {
    const cacheKey = getCanvasCompositeFrameCacheKey(frame);
    if (!cacheKey || !imageData?.data || imageData.data.length !== width * height * 4) {
      return false;
    }
    const bytes = imageData.data.byteLength;
    const maxBytes = Math.max(0, Number(canvasCompositeFrameCache.maxBytes) || 0);
    // A full 8K RGBA composite is hundreds of MB.  It must never enlarge the
    // cache budget just because it is the only frame: keep the display proxy
    // and dirty-region renderer, but do not retain a second giant snapshot.
    if (!maxBytes || bytes > maxBytes) {
      deleteCanvasCompositeFrameCacheEntry(cacheKey);
      return false;
    }
    deleteCanvasCompositeFrameCacheEntry(cacheKey);
    const entry = {
      width,
      height,
      bytes,
      visualKey: getCanvasCompositeVisualKey(frame, width, height),
      imageData,
    };
    canvasCompositeFrameCache.byFrame.set(cacheKey, entry);
    canvasCompositeFrameCache.bytes += bytes;
    while (canvasCompositeFrameCache.bytes > maxBytes && canvasCompositeFrameCache.byFrame.size > 1) {
      const oldestKey = canvasCompositeFrameCache.byFrame.keys().next().value;
      deleteCanvasCompositeFrameCacheEntry(oldestKey);
    }
    return true;
  }

  function patchCanvasCompositeFrameCache(frame, width, height, imageData, x0, y0) {
    const cacheKey = getCanvasCompositeFrameCacheKey(frame);
    const entry = cacheKey ? canvasCompositeFrameCache.byFrame.get(cacheKey) : null;
    if (!entry || entry.width !== width || entry.height !== height || entry.visualKey !== getCanvasCompositeVisualKey(frame, width, height)) {
      return false;
    }
    const regionWidth = Math.max(0, Math.round(Number(imageData?.width) || 0));
    const regionHeight = Math.max(0, Math.round(Number(imageData?.height) || 0));
    if (!regionWidth || !regionHeight || !(imageData?.data instanceof Uint8ClampedArray)) return false;
    const target = entry.imageData?.data;
    if (!(target instanceof Uint8ClampedArray)) return false;
    for (let row = 0; row < regionHeight; row += 1) {
      const sourceStart = row * regionWidth * 4;
      const targetStart = ((y0 + row) * width + x0) * 4;
      target.set(imageData.data.subarray(sourceStart, sourceStart + regionWidth * 4), targetStart);
    }
    return true;
  }

  function markDirtyRect(x0, y0, x1, y1) {
    const width = state.width;
    const height = state.height;
    if (width <= 0 || height <= 0) {
      return;
    }
    const left = clamp(Math.floor(Math.min(x0, x1)), 0, width - 1);
    const right = clamp(Math.floor(Math.max(x0, x1)), 0, width - 1);
    const top = clamp(Math.floor(Math.min(y0, y1)), 0, height - 1);
    const bottom = clamp(Math.floor(Math.max(y0, y1)), 0, height - 1);
    if (right < left || bottom < top) {
      return;
    }
    // Keep an existing full composite alive for ordinary pixel edits. The
    // renderer patches the dirty rows after it recomposes them, so returning
    // to a whole-canvas view does not require a second full-layer composite.
    if (!dirtyRegion) {
      dirtyRegion = { x0: left, y0: top, x1: right, y1: bottom };
      return;
    }
    if (left < dirtyRegion.x0) dirtyRegion.x0 = left;
    if (top < dirtyRegion.y0) dirtyRegion.y0 = top;
    if (right > dirtyRegion.x1) dirtyRegion.x1 = right;
    if (bottom > dirtyRegion.y1) dirtyRegion.y1 = bottom;
  }

  function markDirtyPixel(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const width = state.width;
    const height = state.height;
    if (width <= 0 || height <= 0) {
      return;
    }
    const px = clamp(Math.round(x), 0, width - 1);
    const py = clamp(Math.round(y), 0, height - 1);
    markDirtyRect(px, py, px, py);
  }

  function markCanvasDirty() {
    const width = state.width;
    const height = state.height;
    if (width <= 0 || height <= 0) {
      dirtyRegion = null;
      return;
    }
    invalidateCanvasCompositeFrameCacheEntry();
    dirtyRegion = { x0: 0, y0: 0, x1: width - 1, y1: height - 1 };
  }

  function takeDirtyRegion() {
    if (!dirtyRegion) {
      return null;
    }
    const region = dirtyRegion;
    dirtyRegion = null;
    return region;
  }

  function requestRender() {
    if (!dirtyRegion) {
      markCanvasDirty();
    }
    if (renderScheduled) {
      renderVoxelExtensionPreviewSurfaceNow({ updateViewport: false });
      return;
    }
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      renderCanvas();
      if (qrEditModeState.active && !state.playback.isPlaying) {
        scheduleQrEditReadabilityCheck();
      }
      if (shouldSyncMultiPublicLobbyRoom() && multiState.publicLobbyThumbnailDirty) {
        scheduleMultiPublicLobbyRoomSync({ immediate: false });
      }
      if (!state.playback.isPlaying) {
        requestOverlayRender();
      }
    });
  }

  function renderCanvas() {
    const renderCtx = getCanvasRenderContext?.() || ctx.drawing;
    if (!renderCtx) {
      return;
    }
    const finishRender = region => {
      presentCanvasRenderOutput?.(region);
      refreshSecondaryCanvasSurfaces();
    };
    if (isVoxelExtensionModeEnabled()) {
      syncVoxelExtensionPreviewFromSource({ updateViewport: false });
    }
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    if (isVoxelPreviewCanvasId(activeCanvasDoc?.id || '')) {
      renderProjectCanvasSurface(activeCanvasSurface || mainViewportCanvasSurface, activeCanvasDoc);
      renderFloatingPreviewPanel();
      refreshInactiveProjectCanvasSurfacesSoon();
      return;
    }
    const { width, height } = state;
    if (width <= 0 || height <= 0) {
      dirtyRegion = null;
      return;
    }
    const pending = takeDirtyRegion();
    if (!pending) {
      return;
    }
    if (state.playback.isPlaying) {
      const frameImage = getPlaybackFrameImageData(state.activeFrame);
      if (frameImage) {
        renderCtx.putImageData(frameImage, 0, 0);
        finishRender();
        return;
      }
    }
    const fullCanvasPending = pending.x0 <= 0
      && pending.y0 <= 0
      && pending.x1 >= width - 1
      && pending.y1 >= height - 1;
    const activeFrame = getActiveFrame();
    if (fullCanvasPending && !state.playback.isPlaying) {
      const cachedImage = readCanvasCompositeFrameCache(activeFrame, width, height);
      if (cachedImage) {
        renderCtx.putImageData(cachedImage, 0, 0);
        finishRender();
        return;
      }
    }
    if (fullCanvasPending) {
      const visibleLayers = (activeFrame?.layers || []).filter(layer => (
        layer
        && getDisplayedLayerVisibility(layer, true)
        && getDisplayedLayerPreviewOpacity(layer, 1) > 0
      ));
      const isImplicitlyEmptyFrame = visibleLayers.length === 0 || visibleLayers.every(layer => (
        !isSimulationLayer(layer)
        && (layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array)
        && layer.indices.length === 0
        && !(layer.direct instanceof Uint8ClampedArray && layer.direct.length > 0)
      ));
      if (isImplicitlyEmptyFrame) {
        renderCtx.clearRect(0, 0, width, height);
        finishRender();
        return;
      }
      if (visibleLayers.length === 1) {
        const layer = visibleLayers[0];
        const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= width * height * 4 ? layer.direct : null;
        if (direct
          && layer.directOnly === true
          && getDisplayedLayerPreviewOpacity(layer, 1) >= 1
          && normalizeLayerBlendMode(layer.blendMode) === DEFAULT_LAYER_BLEND_MODE
          && !isSimulationLayer(layer)) {
          const directImage = new ImageData(new Uint8ClampedArray(direct.subarray(0, width * height * 4)), width, height);
          renderCtx.putImageData(directImage, 0, 0);
          writeCanvasCompositeFrameCache(activeFrame, width, height, directImage);
          finishRender();
          return;
        }
        // Indexed-only projects normally use this compact Uint8 plane. Avoid
        // the generic compositor's per-pixel function calls when the active
        // frame is just one ordinary indexed layer.
        const indexed = layer.indices instanceof Uint8Array
          && layer.indicesEncoding === 'uint8-palette-zero-transparent-v2'
          && layer.indices.length >= width * height;
        if (
          indexed
          && !direct
          && getDisplayedLayerPreviewOpacity(layer, 1) >= 1
          && normalizeLayerBlendMode(layer.blendMode) === DEFAULT_LAYER_BLEND_MODE
          && !isSimulationLayer(layer)
        ) {
          const indexedImage = renderCtx.createImageData(width, height);
          const indexedPixels = layer.indices;
          const indexedPalette = Array.isArray(state.palette) ? state.palette : [];
          const output = indexedImage.data;
          for (let pixelIndex = 0, base = 0; pixelIndex < width * height; pixelIndex += 1, base += 4) {
            // The compact indexed format reserves 0 for the background. Do
            // not render it even when a legacy palette accidentally has an
            // opaque color in slot zero.
            const paletteIndex = indexedPixels[pixelIndex];
            if (paletteIndex === 0) continue;
            const color = indexedPalette[paletteIndex];
            if (!color || Number(color.a) <= 0) continue;
            output[base] = color.r;
            output[base + 1] = color.g;
            output[base + 2] = color.b;
            output[base + 3] = color.a;
          }
          renderCtx.putImageData(indexedImage, 0, 0);
          writeCanvasCompositeFrameCache(activeFrame, width, height, indexedImage);
          finishRender();
          return;
        }
      }
    }
    const x0 = clamp(pending.x0, 0, width - 1);
    const y0 = clamp(pending.y0, 0, height - 1);
    const x1 = clamp(pending.x1, 0, width - 1);
    const y1 = clamp(pending.y1, 0, height - 1);
    if (x1 < x0 || y1 < y0) {
      return;
    }
    const regionWidth = x1 - x0 + 1;
    const regionHeight = y1 - y0 + 1;
    const image = renderCtx.createImageData(regionWidth, regionHeight);
    const data = image.data;

    const layers = activeFrame?.layers || [];
    const palette = state.palette;
    for (let l = 0; l < layers.length; l += 1) {
      const layer = layers[l];
      if (!layer || !getDisplayedLayerVisibility(layer, true) || getDisplayedLayerPreviewOpacity(layer, 1) <= 0) continue;
      const opacity = getDisplayedLayerPreviewOpacity(layer, 1);
      if (opacity <= 0) continue;
      if (isSimulationLayer(layer)) {
        compositeSimulationLayerRegion(data, getActiveFrame(), layer, width, height, x0, y0, x1, y1);
        continue;
      }
      const layerBlendMode = normalizeLayerBlendMode(layer.blendMode);
      const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      for (let py = y0; py <= y1; py += 1) {
        const rowOffset = (py - y0) * regionWidth * 4;
        const layerRow = py * width;
        for (let px = x0; px <= x1; px += 1) {
          const pixelIndex = layerRow + px;
          const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
            ? getStoredRasterLayerPaletteIndex(layer, pixelIndex)
            : (layer.indices instanceof Int16Array ? layer.indices[pixelIndex] : -1);
          let srcR;
          let srcG;
          let srcB;
          let srcA;
          if (paletteIndex >= 0) {
            const color = palette[paletteIndex];
            if (!color) continue;
            srcR = color.r;
            srcG = color.g;
            srcB = color.b;
            srcA = color.a;
          } else if (layerDirect) {
            const directBase = pixelIndex * 4;
            srcA = layerDirect[directBase + 3];
            if (srcA === 0) continue;
            srcR = layerDirect[directBase];
            srcG = layerDirect[directBase + 1];
            srcB = layerDirect[directBase + 2];
          } else {
            continue;
          }
          const destIndex = rowOffset + (px - x0) * 4;
          compositeLayerPixelNormalized(data, destIndex, srcR, srcG, srcB, srcA, opacity, layerBlendMode);
        }
      }
    }

    renderCtx.putImageData(image, x0, y0);
    patchCanvasCompositeFrameCache(activeFrame, width, height, image, x0, y0);
    if (fullCanvasPending && !state.playback.isPlaying) {
      writeCanvasCompositeFrameCache(activeFrame, width, height, image);
    }
    finishRender({ x0, y0, x1, y1 });
  }

  function requestOverlayRender() {
    overlayNeedsRedraw = true;
    if (overlayRenderScheduled) {
      return;
    }
    overlayRenderScheduled = true;
    requestAnimationFrame(timestamp => {
      overlayRenderScheduled = false;
      if (!overlayNeedsRedraw) return;
      overlayNeedsRedraw = false;
      renderOverlay(timestamp);
      renderLocalViewportCanvasOverlays();
    });
  }


  return Object.freeze({
    renderEverything,
    markDirtyRect,
    markDirtyPixel,
    markCanvasDirty,
    invalidateCanvasCompositeFrameCacheEntry,
    clearCanvasCompositeFrameCache,
    getCanvasCompositeFrameCacheStats,
    takeDirtyRegion,
    requestRender,
    renderCanvas,
    requestOverlayRender,
  });
      }
    })(scope);
  }

  root.canvasRenderWorkflowUtils = Object.freeze({
    createCanvasRenderWorkflowUtils,
  });
})();
