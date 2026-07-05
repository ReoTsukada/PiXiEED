(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createLocalLayerPreferencesUtils({
    state,
    getLocalLayerVisibilityById,
    setLocalLayerVisibilityById,
    getLocalLayerPreviewOpacityById,
    setLocalLayerPreviewOpacityById,
    normalizeLayerOpacity,
  } = {}) {
    function cloneLocalLayerVisibilityMap(source = getLocalLayerVisibilityById?.()) {
      const map = new Map();
      if (!(source instanceof Map)) {
        return map;
      }
      source.forEach((value, layerId) => {
        if (typeof layerId !== 'string' || !layerId || value !== false) {
          return;
        }
        map.set(layerId, false);
      });
      return map;
    }

    function serializeLocalLayerVisibilityMap(source = getLocalLayerVisibilityById?.()) {
      const payload = {};
      cloneLocalLayerVisibilityMap(source).forEach((value, layerId) => {
        payload[layerId] = value;
      });
      return payload;
    }

    function deserializeLocalLayerVisibilityMap(raw, fallback = getLocalLayerVisibilityById?.()) {
      const map = cloneLocalLayerVisibilityMap(fallback);
      if (!raw || typeof raw !== 'object') {
        return map;
      }
      Object.entries(raw).forEach(([layerId, value]) => {
        if (typeof layerId !== 'string' || !layerId) {
          return;
        }
        if (value === false) {
          map.set(layerId, false);
        } else {
          map.delete(layerId);
        }
      });
      return map;
    }

    function rememberLocalLayerVisibility(layerId, visible) {
      if (typeof layerId !== 'string' || !layerId) {
        return;
      }
      const localLayerVisibilityById = getLocalLayerVisibilityById?.();
      if (!(localLayerVisibilityById instanceof Map)) {
        return;
      }
      if (visible === false) {
        localLayerVisibilityById.set(layerId, false);
        return;
      }
      localLayerVisibilityById.delete(layerId);
    }

    function getDisplayedLayerVisibility(layer, fallback = true) {
      if (!layer || typeof layer !== 'object') {
        return fallback !== false;
      }
      const localLayerVisibilityById = getLocalLayerVisibilityById?.();
      if (localLayerVisibilityById instanceof Map && typeof layer.id === 'string' && layer.id && localLayerVisibilityById.has(layer.id)) {
        return localLayerVisibilityById.get(layer.id) !== false;
      }
      return Object.prototype.hasOwnProperty.call(layer, 'visible') ? layer.visible !== false : fallback !== false;
    }

    function applyLocalLayerVisibilityToState() {
      (state.frames || []).forEach(frame => {
        if (!frame || !Array.isArray(frame.layers)) {
          return;
        }
        frame.layers.forEach(layer => {
          if (!layer || typeof layer !== 'object') {
            return;
          }
          layer.visible = getDisplayedLayerVisibility(layer, true);
        });
      });
    }

    function syncLocalLayerVisibilityMapFromState() {
      const next = cloneLocalLayerVisibilityMap(getLocalLayerVisibilityById?.());
      (state.frames || []).forEach(frame => {
        if (!frame || !Array.isArray(frame.layers)) {
          return;
        }
        frame.layers.forEach(layer => {
          if (!layer || typeof layer.id !== 'string' || !layer.id) {
            return;
          }
          if (layer.visible === false) {
            next.set(layer.id, false);
          } else {
            next.delete(layer.id);
          }
        });
      });
      setLocalLayerVisibilityById?.(next);
    }

    function cloneLocalLayerPreviewOpacityMap(source = getLocalLayerPreviewOpacityById?.()) {
      const map = new Map();
      if (!(source instanceof Map)) {
        return map;
      }
      source.forEach((value, layerId) => {
        if (typeof layerId !== 'string' || !layerId) {
          return;
        }
        const normalized = normalizeLayerOpacity(value);
        if (Math.abs(normalized - 1) <= 0.0001) {
          return;
        }
        map.set(layerId, normalized);
      });
      return map;
    }

    function serializeLocalLayerPreviewOpacityMap(source = getLocalLayerPreviewOpacityById?.()) {
      const payload = {};
      cloneLocalLayerPreviewOpacityMap(source).forEach((value, layerId) => {
        payload[layerId] = value;
      });
      return payload;
    }

    function deserializeLocalLayerPreviewOpacityMap(raw, fallback = getLocalLayerPreviewOpacityById?.()) {
      const map = cloneLocalLayerPreviewOpacityMap(fallback);
      if (!raw || typeof raw !== 'object') {
        return map;
      }
      Object.entries(raw).forEach(([layerId, value]) => {
        if (typeof layerId !== 'string' || !layerId) {
          return;
        }
        const normalized = normalizeLayerOpacity(value);
        if (Math.abs(normalized - 1) <= 0.0001) {
          map.delete(layerId);
        } else {
          map.set(layerId, normalized);
        }
      });
      return map;
    }

    function rememberLocalLayerPreviewOpacity(layerId, opacity) {
      if (typeof layerId !== 'string' || !layerId) {
        return;
      }
      const localLayerPreviewOpacityById = getLocalLayerPreviewOpacityById?.();
      if (!(localLayerPreviewOpacityById instanceof Map)) {
        return;
      }
      const normalized = normalizeLayerOpacity(opacity);
      if (Math.abs(normalized - 1) <= 0.0001) {
        localLayerPreviewOpacityById.delete(layerId);
        return;
      }
      localLayerPreviewOpacityById.set(layerId, normalized);
    }

    function getDisplayedLayerPreviewOpacity(layer, fallback = 1) {
      if (!layer || typeof layer !== 'object') {
        return normalizeLayerOpacity(fallback);
      }
      const localLayerPreviewOpacityById = getLocalLayerPreviewOpacityById?.();
      if (localLayerPreviewOpacityById instanceof Map && typeof layer.id === 'string' && layer.id && localLayerPreviewOpacityById.has(layer.id)) {
        return normalizeLayerOpacity(localLayerPreviewOpacityById.get(layer.id));
      }
      return normalizeLayerOpacity(Object.prototype.hasOwnProperty.call(layer, 'opacity') ? layer.opacity : fallback);
    }

    function applyLocalLayerPreviewOpacityToState() {
      (state.frames || []).forEach(frame => {
        if (!frame || !Array.isArray(frame.layers)) {
          return;
        }
        frame.layers.forEach(layer => {
          if (!layer || typeof layer !== 'object') {
            return;
          }
          layer.opacity = getDisplayedLayerPreviewOpacity(layer, 1);
        });
      });
    }

    function syncLocalLayerPreviewOpacityMapFromState() {
      const next = cloneLocalLayerPreviewOpacityMap(getLocalLayerPreviewOpacityById?.());
      (state.frames || []).forEach(frame => {
        if (!frame || !Array.isArray(frame.layers)) {
          return;
        }
        frame.layers.forEach(layer => {
          if (!layer || typeof layer.id !== 'string' || !layer.id) {
            return;
          }
          const normalized = normalizeLayerOpacity(layer.opacity);
          if (Math.abs(normalized - 1) > 0.0001) {
            next.set(layer.id, normalized);
          } else {
            next.delete(layer.id);
          }
        });
      });
      setLocalLayerPreviewOpacityById?.(next);
    }

    return {
      cloneLocalLayerVisibilityMap,
      serializeLocalLayerVisibilityMap,
      deserializeLocalLayerVisibilityMap,
      rememberLocalLayerVisibility,
      getDisplayedLayerVisibility,
      applyLocalLayerVisibilityToState,
      syncLocalLayerVisibilityMapFromState,
      cloneLocalLayerPreviewOpacityMap,
      serializeLocalLayerPreviewOpacityMap,
      deserializeLocalLayerPreviewOpacityMap,
      rememberLocalLayerPreviewOpacity,
      getDisplayedLayerPreviewOpacity,
      applyLocalLayerPreviewOpacityToState,
      syncLocalLayerPreviewOpacityMapFromState,
    };
  }

  root.localLayerPreferencesUtils = {
    createLocalLayerPreferencesUtils,
  };
})();
