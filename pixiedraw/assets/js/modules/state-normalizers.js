(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createStateNormalizers({
    clamp,
    DEFAULT_LAYER_BLEND_MODE,
    LAYER_BLEND_MODE_SET,
    ONION_SKIN_MAX_FRAMES,
    DEFAULT_ONION_SKIN,
    DEFAULT_UI_THEME,
    UI_THEME_SET,
    BRUSH_SHAPE_SQUARE,
    BRUSH_SHAPE_SET,
    SELECT_SAME_MODE_CONNECTED,
    SELECT_SAME_MODE_SET,
    FILL_STYLE_SOLID,
    FILL_STYLE_SET,
    SELECTION_SHAPE_MODE_CONTENT,
    SELECTION_SHAPE_MODE_SET,
    CUSTOM_BRUSH_MAX_PIXELS,
  } = {}) {
    function normalizeLayerBlendMode(value) {
      if (typeof value !== 'string') {
        return DEFAULT_LAYER_BLEND_MODE;
      }
      const normalized = value.trim().toLowerCase();
      if (normalized === 'softlight') {
        return 'soft-light';
      }
      if (normalized === 'hardlight') {
        return 'hard-light';
      }
      if (normalized === 'colordodge') {
        return 'color-dodge';
      }
      if (normalized === 'colorburn') {
        return 'color-burn';
      }
      return LAYER_BLEND_MODE_SET.has(normalized) ? normalized : DEFAULT_LAYER_BLEND_MODE;
    }

    function normalizeLayerOpacity(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return 1;
      }
      return clamp(parsed, 0, 1);
    }

    function normalizeOnionFrameCount(value, fallback = 0) {
      const parsed = Number(value);
      const safeFallback = clamp(Math.round(Number(fallback) || 0), 0, ONION_SKIN_MAX_FRAMES);
      if (!Number.isFinite(parsed)) {
        return safeFallback;
      }
      return clamp(Math.round(parsed), 0, ONION_SKIN_MAX_FRAMES);
    }

    function normalizeOnionOpacity(value, fallback = DEFAULT_ONION_SKIN.opacity) {
      const parsed = Number(value);
      const safeFallback = clamp(Number(fallback) || 0, 0, 1);
      if (!Number.isFinite(parsed)) {
        return safeFallback;
      }
      return clamp(parsed, 0, 1);
    }

    function normalizeOnionSkinState(source) {
      const settings = source && typeof source === 'object' ? source : {};
      return {
        enabled: Boolean(settings.enabled),
        prevFrames: normalizeOnionFrameCount(settings.prevFrames, DEFAULT_ONION_SKIN.prevFrames),
        nextFrames: normalizeOnionFrameCount(settings.nextFrames, DEFAULT_ONION_SKIN.nextFrames),
        opacity: normalizeOnionOpacity(settings.opacity, DEFAULT_ONION_SKIN.opacity),
      };
    }

    function normalizeUiTheme(value, fallback = DEFAULT_UI_THEME) {
      const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (UI_THEME_SET.has(normalizedValue)) {
        return normalizedValue;
      }
      const normalizedFallback = typeof fallback === 'string' ? fallback.trim().toLowerCase() : '';
      if (UI_THEME_SET.has(normalizedFallback)) {
        return normalizedFallback;
      }
      return DEFAULT_UI_THEME;
    }

    function normalizeBrushShape(value, fallback = BRUSH_SHAPE_SQUARE) {
      const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (BRUSH_SHAPE_SET.has(normalizedValue)) {
        return normalizedValue;
      }
      const normalizedFallback = typeof fallback === 'string' ? fallback.trim().toLowerCase() : '';
      if (BRUSH_SHAPE_SET.has(normalizedFallback)) {
        return normalizedFallback;
      }
      return BRUSH_SHAPE_SQUARE;
    }

    function normalizeSelectSameMode(value, fallback = SELECT_SAME_MODE_CONNECTED) {
      const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (SELECT_SAME_MODE_SET.has(normalizedValue)) {
        return normalizedValue;
      }
      const normalizedFallback = typeof fallback === 'string' ? fallback.trim().toLowerCase() : '';
      if (SELECT_SAME_MODE_SET.has(normalizedFallback)) {
        return normalizedFallback;
      }
      return SELECT_SAME_MODE_CONNECTED;
    }

    function normalizeFillStyle(value, fallback = FILL_STYLE_SOLID) {
      const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (FILL_STYLE_SET.has(normalizedValue)) {
        return normalizedValue;
      }
      const normalizedFallback = typeof fallback === 'string' ? fallback.trim().toLowerCase() : '';
      if (FILL_STYLE_SET.has(normalizedFallback)) {
        return normalizedFallback;
      }
      return FILL_STYLE_SOLID;
    }

    function normalizeSelectionShapeMode(value, fallback = SELECTION_SHAPE_MODE_CONTENT) {
      const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
      if (SELECTION_SHAPE_MODE_SET.has(normalizedValue)) {
        return normalizedValue;
      }
      const normalizedFallback = typeof fallback === 'string' ? fallback.trim().toLowerCase() : '';
      if (SELECTION_SHAPE_MODE_SET.has(normalizedFallback)) {
        return normalizedFallback;
      }
      return SELECTION_SHAPE_MODE_CONTENT;
    }

    function normalizeCustomBrushData(source) {
      if (!source || typeof source !== 'object' || !Array.isArray(source.offsets)) {
        return null;
      }
      const offsets = [];
      for (let i = 0; i < source.offsets.length; i += 1) {
        if (offsets.length >= CUSTOM_BRUSH_MAX_PIXELS) {
          break;
        }
        const entry = source.offsets[i];
        if (!entry || typeof entry !== 'object') {
          continue;
        }
        const dx = Number(entry.dx);
        const dy = Number(entry.dy);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
          continue;
        }
        offsets.push({ dx: clamp(Math.round(dx), -8192, 8192), dy: clamp(Math.round(dy), -8192, 8192) });
      }
      if (!offsets.length) {
        return null;
      }
      const width = clamp(Math.round(Number(source.width) || 1), 1, 4096);
      const height = clamp(Math.round(Number(source.height) || 1), 1, 4096);
      return {
        offsets,
        pixelCount: offsets.length,
        width,
        height,
      };
    }

    return Object.freeze({
      normalizeLayerBlendMode,
      normalizeLayerOpacity,
      normalizeOnionFrameCount,
      normalizeOnionOpacity,
      normalizeOnionSkinState,
      normalizeUiTheme,
      normalizeBrushShape,
      normalizeSelectSameMode,
      normalizeFillStyle,
      normalizeSelectionShapeMode,
      normalizeCustomBrushData,
    });
  }

  root.stateNormalizers = Object.freeze({
    createStateNormalizers,
  });
})();
