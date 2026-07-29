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

  // Keep ordinary structural edits on the established bounding-rectangle
  // path.  Brush/eraser batches additionally register the 32px raster tiles
  // they actually changed, letting a long sparse stroke avoid recomposing its
  // whole bounding box.
  const DIRTY_TILE_SIZE = 32;
  const SLOW_RAF_THRESHOLD_MS = 16;
  const dirtyTileIndices = new Set();
  let dirtyRegionHasUntiledChanges = false;
  let renderTraceSequence = 0;
  let pendingOverlayTrace = null;
  let overlayRequestCount = 0;
  let overlayAlreadyScheduledCount = 0;

  function nowPerformance() {
    return globalThis.performance?.now?.() ?? Date.now();
  }

  function roundPerformanceMs(value) {
    return Math.round(Math.max(0, Number(value) || 0) * 10) / 10;
  }

  function logSlowRenderPerformance(phase, startedAt, details = {}) {
    const elapsedMs = nowPerformance() - startedAt;
    if (elapsedMs < SLOW_RAF_THRESHOLD_MS) return elapsedMs;
    console.info('[pixiedraw:performance]', {
      phase,
      elapsedMs: roundPerformanceMs(elapsedMs),
      ...details,
    });
    return elapsedMs;
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

  function addDirtyRect(x0, y0, x1, y1, { tileBacked = false } = {}) {
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
    if (!tileBacked) {
      dirtyRegionHasUntiledChanges = true;
    }
    // Keep an existing full composite alive for ordinary pixel edits. The
    // renderer patches the dirty rows after it recomposes them, so returning
    // to a whole-canvas view does not require a second full-layer composite.
    if (!dirtyRegion) {
      dirtyRegion = { x0: left, y0: top, x1: right, y1: bottom };
    } else {
      if (left < dirtyRegion.x0) dirtyRegion.x0 = left;
      if (top < dirtyRegion.y0) dirtyRegion.y0 = top;
      if (right > dirtyRegion.x1) dirtyRegion.x1 = right;
      if (bottom > dirtyRegion.y1) dirtyRegion.y1 = bottom;
    }
    // A full-canvas edit (for example, filling a transparent background)
    // cannot patch the retained composite because renderCanvas would otherwise
    // take its full-frame cache shortcut before recomposing the dirty pixels.
    if (
      dirtyRegion.x0 === 0
      && dirtyRegion.y0 === 0
      && dirtyRegion.x1 === width - 1
      && dirtyRegion.y1 === height - 1
    ) {
      invalidateCanvasCompositeFrameCacheEntry();
    }
  }

  function markDirtyRect(x0, y0, x1, y1) {
    addDirtyRect(x0, y0, x1, y1);
  }

  function markDirtyTilesRect(x0, y0, x1, y1) {
    const width = state.width;
    const height = state.height;
    if (width <= 0 || height <= 0) return;
    const left = clamp(Math.floor(Math.min(x0, x1)), 0, width - 1);
    const right = clamp(Math.floor(Math.max(x0, x1)), 0, width - 1);
    const top = clamp(Math.floor(Math.min(y0, y1)), 0, height - 1);
    const bottom = clamp(Math.floor(Math.max(y0, y1)), 0, height - 1);
    if (right < left || bottom < top) return;
    const tilesPerRow = Math.ceil(width / DIRTY_TILE_SIZE);
    const tileX0 = Math.floor(left / DIRTY_TILE_SIZE);
    const tileX1 = Math.floor(right / DIRTY_TILE_SIZE);
    const tileY0 = Math.floor(top / DIRTY_TILE_SIZE);
    const tileY1 = Math.floor(bottom / DIRTY_TILE_SIZE);
    for (let tileY = tileY0; tileY <= tileY1; tileY += 1) {
      for (let tileX = tileX0; tileX <= tileX1; tileX += 1) {
        dirtyTileIndices.add((tileY * tilesPerRow) + tileX);
      }
    }
    addDirtyRect(left, top, right, bottom, { tileBacked: true });
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
    dirtyTileIndices.clear();
    dirtyRegionHasUntiledChanges = true;
  }

  function takeDirtyRegion() {
    if (!dirtyRegion) {
      return null;
    }
    const region = dirtyRegion;
    dirtyRegion = null;
    return region;
  }

  function takeDirtyRenderState() {
    const region = takeDirtyRegion();
    const tiles = new Set(dirtyTileIndices);
    dirtyTileIndices.clear();
    const hasUntiledChanges = dirtyRegionHasUntiledChanges;
    dirtyRegionHasUntiledChanges = false;
    return { region, tiles, hasUntiledChanges };
  }

  function mergeDirtyTilesIntoRowRuns(tileIndices, width, height) {
    const tilesPerRow = Math.ceil(width / DIRTY_TILE_SIZE);
    const rows = new Map();
    for (const tileIndex of tileIndices) {
      const tileY = Math.floor(tileIndex / tilesPerRow);
      const tileX = tileIndex % tilesPerRow;
      let tileXs = rows.get(tileY);
      if (!tileXs) rows.set(tileY, tileXs = []);
      tileXs.push(tileX);
    }
    const regions = [];
    for (const [tileY, tileXs] of rows) {
      tileXs.sort((a, b) => a - b);
      let start = tileXs[0];
      let end = start;
      for (let index = 1; index < tileXs.length; index += 1) {
        const tileX = tileXs[index];
        if (tileX === end + 1) {
          end = tileX;
          continue;
        }
        regions.push({
          x0: start * DIRTY_TILE_SIZE,
          y0: tileY * DIRTY_TILE_SIZE,
          x1: Math.min(width - 1, ((end + 1) * DIRTY_TILE_SIZE) - 1),
          y1: Math.min(height - 1, ((tileY + 1) * DIRTY_TILE_SIZE) - 1),
        });
        start = end = tileX;
      }
      regions.push({
        x0: start * DIRTY_TILE_SIZE,
        y0: tileY * DIRTY_TILE_SIZE,
        x1: Math.min(width - 1, ((end + 1) * DIRTY_TILE_SIZE) - 1),
        y1: Math.min(height - 1, ((tileY + 1) * DIRTY_TILE_SIZE) - 1),
      });
    }
    return regions;
  }

  function getDirtyTileCoveredArea(tileIndices, width, height) {
    const tilesPerRow = Math.ceil(width / DIRTY_TILE_SIZE);
    let area = 0;
    for (const tileIndex of tileIndices) {
      const tileY = Math.floor(tileIndex / tilesPerRow);
      const tileX = tileIndex % tilesPerRow;
      const tileWidth = Math.max(0, Math.min(DIRTY_TILE_SIZE, width - (tileX * DIRTY_TILE_SIZE)));
      const tileHeight = Math.max(0, Math.min(DIRTY_TILE_SIZE, height - (tileY * DIRTY_TILE_SIZE)));
      area += tileWidth * tileHeight;
    }
    return area;
  }

  function resolveDirtyRenderRegions({ region, tiles, hasUntiledChanges }, width, height) {
    if (!region || hasUntiledChanges || !tiles.size) {
      return {
        regions: region ? [region] : [],
        usedBoundsFallback: Boolean(region && hasUntiledChanges),
        dirtyTileCoveredArea: getDirtyTileCoveredArea(tiles, width, height),
        mergedRegionsAreaBeforeFallback: 0,
      };
    }
    const merged = mergeDirtyTilesIntoRowRuns(tiles, width, height);
    const dirtyTileCoveredArea = getDirtyTileCoveredArea(tiles, width, height);
    const mergedRegionsAreaBeforeFallback = merged.reduce((area, item) => (
      area + ((item.x1 - item.x0 + 1) * (item.y1 - item.y0 + 1))
    ), 0);
    if (!merged.length || merged.length > 32 || tiles.size > 64) {
      return { regions: [region], usedBoundsFallback: true, dirtyTileCoveredArea, mergedRegionsAreaBeforeFallback };
    }
    const boundsArea = (region.x1 - region.x0 + 1) * (region.y1 - region.y0 + 1);
    const coveredTileArea = tiles.size * DIRTY_TILE_SIZE * DIRTY_TILE_SIZE;
    if (!boundsArea || (coveredTileArea / boundsArea) > 0.6) {
      return { regions: [region], usedBoundsFallback: true, dirtyTileCoveredArea, mergedRegionsAreaBeforeFallback };
    }
    return { regions: merged, usedBoundsFallback: false, dirtyTileCoveredArea, mergedRegionsAreaBeforeFallback };
  }

  function requestRender(reason = 'render-request') {
    if (!dirtyRegion && !dirtyTileIndices.size) {
      markCanvasDirty();
    }
    if (renderScheduled) {
      renderVoxelExtensionPreviewSurfaceNow({ updateViewport: false });
      return;
    }
    renderScheduled = true;
    const renderTraceId = ++renderTraceSequence;
    requestAnimationFrame(() => {
      const rafStartedAt = nowPerformance();
      renderScheduled = false;
      const metrics = renderCanvas();
      if (qrEditModeState.active && !state.playback.isPlaying) {
        scheduleQrEditReadabilityCheck();
      }
      if (shouldSyncMultiPublicLobbyRoom() && multiState.publicLobbyThumbnailDirty) {
        scheduleMultiPublicLobbyRoomSync({ immediate: false });
      }
      if (!state.playback.isPlaying) {
        requestOverlayRender({ renderTraceId, reason: 'main-render', pointerActive: Boolean(pointerState?.active) });
      }
      logSlowRenderPerformance('pixiedraw:render:main-raf', rafStartedAt, {
        renderTraceId,
        reason,
        pointerActive: Boolean(pointerState?.active),
        timings: metrics?.timings || {},
        counts: metrics?.counts || {},
        path: metrics?.path || {},
      });
    });
  }

  function renderCanvasRegion(renderCtx, activeFrame, width, height, pending, metrics) {
    const x0 = clamp(pending.x0, 0, width - 1);
    const y0 = clamp(pending.y0, 0, height - 1);
    const x1 = clamp(pending.x1, 0, width - 1);
    const y1 = clamp(pending.y1, 0, height - 1);
    if (x1 < x0 || y1 < y0) return null;
    const regionWidth = x1 - x0 + 1;
    const regionHeight = y1 - y0 + 1;
    const allocationStartedAt = nowPerformance();
    const image = renderCtx.createImageData(regionWidth, regionHeight);
    metrics.timings.allocateImageDataMs += nowPerformance() - allocationStartedAt;
    const data = image.data;

    const composeStartedAt = nowPerformance();
    const layers = activeFrame?.layers || [];
    const palette = state.palette;
    for (let l = 0; l < layers.length; l += 1) {
      const layer = layers[l];
      if (!layer || !getDisplayedLayerVisibility(layer, true) || getDisplayedLayerPreviewOpacity(layer, 1) <= 0) continue;
      const layerUsesSparseTiles = isTiledLayerIndices(layer);
      const opacity = getDisplayedLayerPreviewOpacity(layer, 1);
      if (opacity <= 0) continue;
      const layerBlendMode = normalizeLayerBlendMode(layer.blendMode);
      const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      for (let py = y0; py <= y1; py += 1) {
        const rowOffset = (py - y0) * regionWidth * 4;
        const layerRow = py * width;
        for (let px = x0; px <= x1; px += 1) {
          metrics.counts.composedPixelCount += 1;
          if (layerUsesSparseTiles) metrics.counts.tileLookupCount += 1;
          const pixelIndex = layerRow + px;
          const paletteIndex = typeof getStoredRasterLayerPaletteIndex === 'function'
            ? getStoredRasterLayerPaletteIndex(layer, pixelIndex)
            : (layer.indices instanceof Int16Array ? layer.indices[pixelIndex] : -1);
          let srcR;
          let srcG;
          let srcB;
          let srcA;
          if (paletteIndex >= 0) {
            metrics.counts.paletteLookupCount += 1;
            if (paletteIndex === 0) metrics.counts.transparentPixelCount += 1;
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
            metrics.counts.transparentPixelCount += 1;
            continue;
          }
          const destIndex = rowOffset + (px - x0) * 4;
          compositeLayerPixelNormalized(data, destIndex, srcR, srcG, srcB, srcA, opacity, layerBlendMode);
        }
      }
    }
    metrics.timings.composeRegionsMs += nowPerformance() - composeStartedAt;
    const transferStartedAt = nowPerformance();
    renderCtx.putImageData(image, x0, y0);
    metrics.timings.putImageDataMs += nowPerformance() - transferStartedAt;
    metrics.counts.putImageDataCount += 1;
    const cacheStartedAt = nowPerformance();
    patchCanvasCompositeFrameCache(activeFrame, width, height, image, x0, y0);
    metrics.timings.compositeCacheMs += nowPerformance() - cacheStartedAt;
    return { x0, y0, x1, y1, image };
  }

  function renderCanvas() {
    const metrics = {
      timings: {
        consumeDirtyMs: 0,
        mergeDirtyMs: 0,
        allocateImageDataMs: 0,
        composeRegionsMs: 0,
        putImageDataMs: 0,
        compositeCacheMs: 0,
        secondarySurfacesMs: 0,
      },
      counts: {
        dirtyTileCount: 0,
        mergedRegionCount: 0,
        dirtyPixelArea: 0,
        boundingPixelArea: 0,
        usedBoundsFallback: false,
        visibleLayerCount: 0,
        putImageDataCount: 0,
        secondaryCanvasCount: 0,
        composedPixelCount: 0,
        tileLookupCount: 0,
        transparentPixelCount: 0,
        paletteLookupCount: 0,
        dirtyTileCoveredArea: 0,
        mergedRegionsAreaBeforeFallback: 0,
        boundsAreaAfterFallback: 0,
      },
      path: {
        usedSingleIndexedFastPath: false,
        layerStorageType: 'none',
        layerOpacity: null,
        layerBlendMode: '',
        hasDirectRgbaCompatibilityLayer: false,
      },
    };
    const renderCtx = getCanvasRenderContext?.() || ctx.drawing;
    if (!renderCtx) {
      return metrics;
    }
    const finishRender = region => {
      presentCanvasRenderOutput?.(region);
      const secondaryStartedAt = nowPerformance();
      refreshSecondaryCanvasSurfaces();
      metrics.timings.secondarySurfacesMs += nowPerformance() - secondaryStartedAt;
    };
    if (isVoxelExtensionModeEnabled()) {
      syncVoxelExtensionPreviewFromSource({ updateViewport: false });
    }
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    if (isVoxelPreviewCanvasId(activeCanvasDoc?.id || '')) {
      renderProjectCanvasSurface(activeCanvasSurface || mainViewportCanvasSurface, activeCanvasDoc);
      renderFloatingPreviewPanel();
      refreshInactiveProjectCanvasSurfacesSoon();
      return metrics;
    }
    const { width, height } = state;
    if (width <= 0 || height <= 0) {
      dirtyRegion = null;
      return metrics;
    }
    const consumeStartedAt = nowPerformance();
    const dirtyState = takeDirtyRenderState();
    metrics.timings.consumeDirtyMs = nowPerformance() - consumeStartedAt;
    const pending = dirtyState.region;
    metrics.counts.dirtyTileCount = dirtyState.tiles.size;
    if (!pending) {
      return metrics;
    }
    metrics.counts.boundingPixelArea = (pending.x1 - pending.x0 + 1) * (pending.y1 - pending.y0 + 1);
    if (state.playback.isPlaying) {
      const frameImage = getPlaybackFrameImageData(state.activeFrame);
      if (frameImage) {
        renderCtx.putImageData(frameImage, 0, 0);
        metrics.counts.putImageDataCount += 1;
        finishRender();
        return metrics;
      }
    }
    const fullCanvasPending = pending.x0 <= 0
      && pending.y0 <= 0
      && pending.x1 >= width - 1
      && pending.y1 >= height - 1;
    const activeFrame = getActiveFrame();
    metrics.counts.visibleLayerCount = (activeFrame?.layers || []).filter(layer => (
      layer && getDisplayedLayerVisibility(layer, true) && getDisplayedLayerPreviewOpacity(layer, 1) > 0
    )).length;
    if (metrics.counts.visibleLayerCount === 1) {
      const singleLayer = (activeFrame?.layers || []).find(layer => (
        layer && getDisplayedLayerVisibility(layer, true) && getDisplayedLayerPreviewOpacity(layer, 1) > 0
      ));
      metrics.path.layerStorageType = isTiledLayerIndices(singleLayer)
        ? 'sparse-indexed'
        : (singleLayer?.indices instanceof Uint8Array ? 'dense-indexed' : 'legacy-or-direct');
      metrics.path.layerOpacity = getDisplayedLayerPreviewOpacity(singleLayer, 1);
      metrics.path.layerBlendMode = normalizeLayerBlendMode(singleLayer?.blendMode);
      metrics.path.hasDirectRgbaCompatibilityLayer = singleLayer?.direct instanceof Uint8ClampedArray;
    }
    if (fullCanvasPending && !state.playback.isPlaying) {
      const cachedImage = readCanvasCompositeFrameCache(activeFrame, width, height);
      if (cachedImage) {
        renderCtx.putImageData(cachedImage, 0, 0);
        metrics.counts.putImageDataCount += 1;
        finishRender();
        return metrics;
      }
    }
    if (fullCanvasPending) {
      const visibleLayers = (activeFrame?.layers || []).filter(layer => (
        layer
        && getDisplayedLayerVisibility(layer, true)
        && getDisplayedLayerPreviewOpacity(layer, 1) > 0
      ));
      const isImplicitlyEmptyFrame = visibleLayers.length === 0 || visibleLayers.every(layer => (
        !isTiledLayerIndices(layer)
        && (layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array)
        && layer.indices.length === 0
        && !(layer.direct instanceof Uint8ClampedArray && layer.direct.length > 0)
      ));
      if (isImplicitlyEmptyFrame) {
        renderCtx.clearRect(0, 0, width, height);
        finishRender();
        return metrics;
      }
      if (visibleLayers.length === 1) {
        const layer = visibleLayers[0];
        const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= width * height * 4 ? layer.direct : null;
        if (direct
          && layer.directOnly === true
          && getDisplayedLayerPreviewOpacity(layer, 1) >= 1
          && normalizeLayerBlendMode(layer.blendMode) === DEFAULT_LAYER_BLEND_MODE) {
          const directImage = new ImageData(new Uint8ClampedArray(direct.subarray(0, width * height * 4)), width, height);
          renderCtx.putImageData(directImage, 0, 0);
          metrics.counts.putImageDataCount += 1;
          writeCanvasCompositeFrameCache(activeFrame, width, height, directImage);
          finishRender();
          return metrics;
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
        ) {
          metrics.path.usedSingleIndexedFastPath = true;
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
          metrics.counts.putImageDataCount += 1;
          writeCanvasCompositeFrameCache(activeFrame, width, height, indexedImage);
          finishRender();
          return metrics;
        }
      }
    }
    const mergeStartedAt = nowPerformance();
    const dirtyRenderPlan = resolveDirtyRenderRegions(dirtyState, width, height);
    metrics.timings.mergeDirtyMs = nowPerformance() - mergeStartedAt;
    metrics.counts.mergedRegionCount = dirtyRenderPlan.regions.length;
    metrics.counts.usedBoundsFallback = dirtyRenderPlan.usedBoundsFallback;
    metrics.counts.dirtyTileCoveredArea = dirtyRenderPlan.dirtyTileCoveredArea;
    metrics.counts.mergedRegionsAreaBeforeFallback = dirtyRenderPlan.mergedRegionsAreaBeforeFallback;
    metrics.counts.dirtyPixelArea = dirtyRenderPlan.regions.reduce((area, region) => (
      area + ((region.x1 - region.x0 + 1) * (region.y1 - region.y0 + 1))
    ), 0);
    metrics.counts.boundsAreaAfterFallback = dirtyRenderPlan.usedBoundsFallback
      ? metrics.counts.dirtyPixelArea
      : 0;
    const renderedRegions = dirtyRenderPlan.regions
      .map(region => renderCanvasRegion(renderCtx, activeFrame, width, height, region, metrics))
      .filter(Boolean);
    if (!renderedRegions.length) return metrics;
    if (fullCanvasPending && !state.playback.isPlaying && renderedRegions.length === 1) {
      const cacheStartedAt = nowPerformance();
      writeCanvasCompositeFrameCache(activeFrame, width, height, renderedRegions[0].image);
      metrics.timings.compositeCacheMs += nowPerformance() - cacheStartedAt;
    }
    finishRender({
      x0: Math.min(...renderedRegions.map(region => region.x0)),
      y0: Math.min(...renderedRegions.map(region => region.y0)),
      x1: Math.max(...renderedRegions.map(region => region.x1)),
      y1: Math.max(...renderedRegions.map(region => region.y1)),
    });
    return metrics;
  }

  function requestOverlayRender(trace = null) {
    overlayRequestCount += 1;
    if (trace?.renderTraceId) pendingOverlayTrace = trace;
    overlayNeedsRedraw = true;
    if (overlayRenderScheduled) {
      overlayAlreadyScheduledCount += 1;
      return;
    }
    overlayRenderScheduled = true;
    requestAnimationFrame(timestamp => {
      const rafStartedAt = nowPerformance();
      const overlayTrace = pendingOverlayTrace || {
        renderTraceId: ++renderTraceSequence,
        reason: 'overlay-refresh',
        pointerActive: Boolean(pointerState?.active),
      };
      const requestCount = overlayRequestCount;
      const alreadyScheduledCount = overlayAlreadyScheduledCount;
      pendingOverlayTrace = null;
      overlayRequestCount = 0;
      overlayAlreadyScheduledCount = 0;
      overlayRenderScheduled = false;
      if (!overlayNeedsRedraw) return;
      overlayNeedsRedraw = false;
      const overlayMetrics = renderOverlay(timestamp, overlayTrace) || {};
      const localViewportMetrics = renderLocalViewportCanvasOverlays(overlayTrace) || {};
      logSlowRenderPerformance('pixiedraw:render:overlay-raf', rafStartedAt, {
        renderTraceId: overlayTrace.renderTraceId,
        reason: overlayTrace.reason,
        pointerActive: Boolean(pointerState?.active),
        overlayRequestCount: requestCount,
        overlayAlreadyScheduled: alreadyScheduledCount > 0,
        timings: overlayMetrics.timings || {},
        counts: {
          ...(overlayMetrics.counts || {}),
          localViewportCount: localViewportMetrics.surfaceCount || 0,
          localViewportClearCount: localViewportMetrics.clearCount || 0,
        },
        localViewportTimings: localViewportMetrics.timings || {},
      });
    });
  }


  return Object.freeze({
    renderEverything,
    markDirtyRect,
    markDirtyTilesRect,
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
