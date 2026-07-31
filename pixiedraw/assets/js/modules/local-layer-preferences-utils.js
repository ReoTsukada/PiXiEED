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
    isSharedProjectCollaborativeMode = () => false,
  } = {}) {
    function usesCanonicalSharedLayerState() {
      return Boolean(isSharedProjectCollaborativeMode?.());
    }

    function cloneLocalLayerVisibilityMap(source = getLocalLayerVisibilityById?.()) {
      const map = new Map();
      if (!(source instanceof Map)) {
        return map;
      }
      source.forEach((value, layerId) => {
        if (typeof layerId !== 'string' || !layerId || typeof value !== 'boolean') {
          return;
        }
        map.set(layerId, value);
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
        if (typeof value === 'boolean') map.set(layerId, value);
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
      localLayerVisibilityById.set(layerId, visible !== false);
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
      if (usesCanonicalSharedLayerState()) return;
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
      if (usesCanonicalSharedLayerState()) return;
      const next = cloneLocalLayerVisibilityMap(getLocalLayerVisibilityById?.());
      (state.frames || []).forEach(frame => {
        if (!frame || !Array.isArray(frame.layers)) {
          return;
        }
        frame.layers.forEach(layer => {
          if (!layer || typeof layer.id !== 'string' || !layer.id) {
            return;
          }
          const displayed = getDisplayedLayerVisibility(layer, true);
          if (next.has(layer.id) || displayed !== (layer.visible !== false)) next.set(layer.id, displayed);
          else next.delete(layer.id);
        });
      });
      setLocalLayerVisibilityById?.(next);
    }

    function cloneLocalLayerPreviewOpacityMap(source = getLocalLayerPreviewOpacityById?.()) {
      const map = new Map();
      if (usesCanonicalSharedLayerState()) return map;
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
      if (usesCanonicalSharedLayerState()) return;
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
      const localLayerPreviewOpacityById = usesCanonicalSharedLayerState()
        ? null
        : getLocalLayerPreviewOpacityById?.();
      if (localLayerPreviewOpacityById instanceof Map && typeof layer.id === 'string' && layer.id && localLayerPreviewOpacityById.has(layer.id)) {
        return normalizeLayerOpacity(localLayerPreviewOpacityById.get(layer.id));
      }
      return normalizeLayerOpacity(Object.prototype.hasOwnProperty.call(layer, 'opacity') ? layer.opacity : fallback);
    }

    function applyLocalLayerPreviewOpacityToState() {
      if (usesCanonicalSharedLayerState()) return;
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
      if (usesCanonicalSharedLayerState()) return;
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

    function forgetLocalLayerPreferences(layerId) {
      if (typeof layerId !== 'string' || !layerId) return;
      getLocalLayerVisibilityById?.()?.delete?.(layerId);
      getLocalLayerPreviewOpacityById?.()?.delete?.(layerId);
    }

    function beginCanonicalLayerVisibilityTransaction(layers = []) {
      const records = [];
      const seen = new Set();
      for (const layer of layers || []) {
        if (!layer || typeof layer !== 'object' || seen.has(layer)) continue;
        seen.add(layer);
        const layerId = typeof layer.id === 'string' ? layer.id : '';
        if (layerId) rememberLocalLayerVisibility(layerId, getDisplayedLayerVisibility(layer, true));
        records.push({ layer, visible: layer.visible !== false });
        layer.visible = true;
      }
      let settled = false;
      return Object.freeze({
        commit() { settled = true; },
        rollback() {
          if (settled) return;
          settled = true;
          records.forEach(record => { record.layer.visible = record.visible; });
        },
      });
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
      forgetLocalLayerPreferences,
      beginCanonicalLayerVisibilityTransaction,
    };
  }

  root.localLayerPreferencesUtils = {
    createLocalLayerPreferencesUtils,
  };
})();
