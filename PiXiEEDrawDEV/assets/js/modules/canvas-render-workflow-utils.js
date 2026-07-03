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
    if (!ctx.drawing) {
      return;
    }
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
        ctx.drawing.putImageData(frameImage, 0, 0);
        refreshSecondaryCanvasSurfaces();
        return;
      }
    }
    const fullCanvasPending = pending.x0 <= 0
      && pending.y0 <= 0
      && pending.x1 >= width - 1
      && pending.y1 >= height - 1;
    if (fullCanvasPending) {
      const visibleLayers = (getActiveFrame()?.layers || []).filter(layer => (
        layer
        && getDisplayedLayerVisibility(layer, true)
        && getDisplayedLayerPreviewOpacity(layer, 1) > 0
      ));
      if (visibleLayers.length === 1) {
        const layer = visibleLayers[0];
        const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= width * height * 4 ? layer.direct : null;
        if (direct
          && layer.directOnly === true
          && getDisplayedLayerPreviewOpacity(layer, 1) >= 1
          && normalizeLayerBlendMode(layer.blendMode) === DEFAULT_LAYER_BLEND_MODE
          && !isSimulationLayer(layer)) {
          ctx.drawing.putImageData(new ImageData(new Uint8ClampedArray(direct.subarray(0, width * height * 4)), width, height), 0, 0);
          refreshSecondaryCanvasSurfaces();
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
    const image = ctx.drawing.createImageData(regionWidth, regionHeight);
    const data = image.data;

    const layers = getActiveFrame()?.layers || [];
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
      const layerIndices = layer.indices instanceof Int16Array ? layer.indices : null;
      const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      for (let py = y0; py <= y1; py += 1) {
        const rowOffset = (py - y0) * regionWidth * 4;
        const layerRow = py * width;
        for (let px = x0; px <= x1; px += 1) {
          const pixelIndex = layerRow + px;
          const paletteIndex = layerIndices ? layerIndices[pixelIndex] : -1;
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

    ctx.drawing.putImageData(image, x0, y0);
    refreshSecondaryCanvasSurfaces();
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
