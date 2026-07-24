(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPlaybackCacheUtils({
    state,
    ctx,
    playbackFrameCache,
    PLAYBACK_LARGE_FRAME_BYTES,
    PLAYBACK_CACHE_MAX_BYTES,
    PLAYBACK_CACHE_MAX_NEARBY_RADIUS,
    DEFAULT_LAYER_BLEND_MODE,
    clamp,
    getDisplayedLayerVisibility,
    getDisplayedLayerPreviewOpacity,
    normalizeLayerBlendMode,
    isSimulationLayer,
    compositeFramePixels,
  } = {}) {
    function clearPlaybackFrameCache() {
      playbackFrameCache.active = false;
      playbackFrameCache.mode = 'lazy';
      playbackFrameCache.width = 0;
      playbackFrameCache.height = 0;
      playbackFrameCache.radius = 0;
      playbackFrameCache.byFrame.clear();
    }

    function buildPlaybackFrameImageData(frameIndex) {
      if (!ctx.drawing) {
        return null;
      }
      if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= state.frames.length) {
        return null;
      }
      const width = Math.max(1, Math.floor(Number(state.width) || 0));
      const height = Math.max(1, Math.floor(Number(state.height) || 0));
      const frame = state.frames[frameIndex];
      if (!frame) {
        return null;
      }
      const visibleLayers = Array.isArray(frame.layers)
        ? frame.layers.filter(layer => (
          layer
          && getDisplayedLayerVisibility(layer, true)
          && getDisplayedLayerPreviewOpacity(layer, 1) > 0
        ))
        : [];
      if (visibleLayers.length === 1) {
        const layer = visibleLayers[0];
        const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= width * height * 4 ? layer.direct : null;
        if (direct
          && layer.directOnly === true
          && getDisplayedLayerPreviewOpacity(layer, 1) >= 1
          && normalizeLayerBlendMode(layer.blendMode) === DEFAULT_LAYER_BLEND_MODE
          && !isSimulationLayer(layer)) {
          return new ImageData(new Uint8ClampedArray(direct.subarray(0, width * height * 4)), width, height);
        }
      }
      const pixels = compositeFramePixels(frame, width, height, state.palette, {
        useLocalLayerPreviewVisibility: true,
        useLocalLayerPreviewOpacity: true,
      });
      if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4) {
        return null;
      }
      // Playback cache stores logical document pixels. Do not allocate it
      // from the zoom-dependent presentation canvas.
      const imageData = new ImageData(width, height);
      imageData.data.set(pixels);
      return imageData;
    }

    function getPlaybackCacheRadius(width, height) {
      const bytesPerFrame = Math.max(1, Math.floor(Number(width) || 0) * Math.floor(Number(height) || 0) * 4);
      if (bytesPerFrame >= PLAYBACK_LARGE_FRAME_BYTES) {
        return 0;
      }
      const maxFramesByBudget = Math.max(1, Math.floor(PLAYBACK_CACHE_MAX_BYTES / bytesPerFrame));
      return clamp(
        Math.floor((maxFramesByBudget - 1) / 2),
        0,
        PLAYBACK_CACHE_MAX_NEARBY_RADIUS
      );
    }

    function getPlaybackFrameDistance(frameIndex, centerFrameIndex) {
      const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
      if (!frameCount) {
        return Number.POSITIVE_INFINITY;
      }
      const a = clamp(Math.round(Number(frameIndex) || 0), 0, frameCount - 1);
      const b = clamp(Math.round(Number(centerFrameIndex) || 0), 0, frameCount - 1);
      const direct = Math.abs(a - b);
      return state.playback?.loop === false ? direct : Math.min(direct, frameCount - direct);
    }

    function trimPlaybackNearbyCache(centerFrameIndex) {
      const center = Number.isInteger(centerFrameIndex) ? centerFrameIndex : state.activeFrame;
      const radius = Math.max(0, Math.round(Number(playbackFrameCache.radius) || 0));
      playbackFrameCache.byFrame.forEach((_, frameIndex) => {
        if (getPlaybackFrameDistance(frameIndex, center) > radius) {
          playbackFrameCache.byFrame.delete(frameIndex);
        }
      });
    }

    function warmPlaybackNearbyCache(centerFrameIndex) {
      if (!playbackFrameCache.active || !ctx.drawing) {
        return;
      }
      const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
      if (!frameCount) {
        return;
      }
      const center = clamp(Math.round(Number(centerFrameIndex) || 0), 0, frameCount - 1);
      const radius = Math.max(0, Math.round(Number(playbackFrameCache.radius) || 0));
      for (let offset = -radius; offset <= radius; offset += 1) {
        let frameIndex = center + offset;
        if (state.playback?.loop === false) {
          if (frameIndex < 0 || frameIndex >= frameCount) {
            continue;
          }
        } else {
          frameIndex = ((frameIndex % frameCount) + frameCount) % frameCount;
        }
        if (playbackFrameCache.byFrame.has(frameIndex)) {
          continue;
        }
        const imageData = buildPlaybackFrameImageData(frameIndex);
        if (imageData) {
          playbackFrameCache.byFrame.set(frameIndex, imageData);
        }
      }
      trimPlaybackNearbyCache(center);
    }

    function preparePlaybackFrameCache() {
      clearPlaybackFrameCache();
      const width = Math.max(1, Math.floor(Number(state.width) || 0));
      const height = Math.max(1, Math.floor(Number(state.height) || 0));
      const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
      if (!frameCount || width <= 0 || height <= 0) {
        return;
      }
      playbackFrameCache.active = true;
      playbackFrameCache.width = width;
      playbackFrameCache.height = height;
      playbackFrameCache.radius = getPlaybackCacheRadius(width, height);
      playbackFrameCache.mode = 'nearby';
    }

    function getPlaybackFrameImageData(frameIndex) {
      if (!state.playback.isPlaying || !playbackFrameCache.active || !ctx.drawing) {
        return null;
      }
      if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= state.frames.length) {
        return null;
      }
      const width = Math.max(1, Math.floor(Number(state.width) || 0));
      const height = Math.max(1, Math.floor(Number(state.height) || 0));
      if (playbackFrameCache.width !== width || playbackFrameCache.height !== height) {
        preparePlaybackFrameCache();
      }
      let imageData = playbackFrameCache.byFrame.get(frameIndex) || null;
      if (!imageData) {
        imageData = buildPlaybackFrameImageData(frameIndex);
        if (!imageData) {
          return null;
        }
        playbackFrameCache.byFrame.set(frameIndex, imageData);
      }
      if (playbackFrameCache.radius > 0) {
        const warm = () => warmPlaybackNearbyCache(frameIndex);
        if (typeof window.requestIdleCallback === 'function') {
          window.requestIdleCallback(warm, { timeout: 250 });
        } else {
          window.setTimeout(warm, 0);
        }
      }
      return imageData;
    }

    return {
      clearPlaybackFrameCache,
      buildPlaybackFrameImageData,
      getPlaybackCacheRadius,
      getPlaybackFrameDistance,
      trimPlaybackNearbyCache,
      warmPlaybackNearbyCache,
      preparePlaybackFrameCache,
      getPlaybackFrameImageData,
    };
  }

  root.playbackCacheUtils = {
    createPlaybackCacheUtils,
  };
})();
