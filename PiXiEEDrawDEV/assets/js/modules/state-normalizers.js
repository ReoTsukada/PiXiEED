(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createDrawingStateStaticConfig() {
    const FILL_TOOL_SOLID = 'fill';
    const FILL_TOOL_DITHER = 'fillDither';
    const FILL_TOOL_GRADIENT = 'fillGradient';
    const MIRROR_TOOL_SECTION_SPLIT_THRESHOLD = 8;
    const BRUSH_SHAPE_SQUARE = 'square';
    const BRUSH_SHAPE_CIRCLE = 'circle';
    const BRUSH_SHAPE_CUSTOM = 'custom';
    const BRUSH_SHAPE_SET = new Set([BRUSH_SHAPE_SQUARE, BRUSH_SHAPE_CIRCLE, BRUSH_SHAPE_CUSTOM]);
    const SELECT_SAME_MODE_CONNECTED = 'connected';
    const SELECT_SAME_MODE_GLOBAL = 'global';
    const SELECT_SAME_MODE_SET = new Set([SELECT_SAME_MODE_CONNECTED, SELECT_SAME_MODE_GLOBAL]);
    const FILL_STYLE_SOLID = 'solid';
    const FILL_STYLE_RGB_GRADIENT = 'rgb-gradient';
    const FILL_STYLE_DITHER_GRADIENT = 'dither-gradient';
    const FILL_STYLE_SET = new Set([FILL_STYLE_SOLID, FILL_STYLE_RGB_GRADIENT, FILL_STYLE_DITHER_GRADIENT]);
    const SELECTION_SHAPE_MODE_CONTENT = 'content';
    const SELECTION_SHAPE_MODE_SHAPE = 'shape';
    const SELECTION_SHAPE_MODE_SET = new Set([SELECTION_SHAPE_MODE_CONTENT, SELECTION_SHAPE_MODE_SHAPE]);
    const CUSTOM_BRUSH_MAX_PIXELS = 8192;
    const SELECT_RECT_GRID_CELL_SIZE = 16;
    const SELECT_RECT_GRID_DOUBLE_TAP_MS = 320;
    const FLOATING_DRAW_BUTTON_SCALE_MIN = 1;
    const FLOATING_DRAW_BUTTON_SCALE_MAX = 2;
    const FLOATING_DRAW_BUTTON_SCALE_STEP = 0.01;
    const DEFAULT_FLOATING_DRAW_BUTTON_SCALE = 2;
    const DEFAULT_LAYER_BLEND_MODE = 'normal';
    const ONION_SKIN_MAX_FRAMES = 6;
    const COLOR_MODE_INDEX = 'index';
    const COLOR_MODE_RGB = 'rgb';
    const FLOATING_PREVIEW_MIN_SIZE = 120;
    const FLOATING_PREVIEW_MAX_SIZE = 640;
    const FLOATING_PREVIEW_DEFAULT_STATE = Object.freeze({
      enabled: false,
      x: 16,
      y: 72,
      width: 220,
      height: 220,
    });
    const MULTI_CANVAS_FEATURE_ENABLED = true;
    const LOCAL_VIEWPORT_CANVAS_SIGNED_IN_MAX_COUNT = 1;
    const LOCAL_VIEWPORT_CANVAS_STANDARD_MAX_COUNT = 3;
    const LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE = Object.freeze({
      count: 0,
      selectedKind: 'main',
      selectedIndex: -1,
      layoutScale: 1,
      positionsRelative: true,
      anchorLeft: null,
      anchorTop: null,
      positions: Object.freeze([]),
    });
    return Object.freeze({
      FILL_TOOL_SOLID,
      FILL_TOOL_DITHER,
      FILL_TOOL_GRADIENT,
      MIRROR_TOOL_SECTION_SPLIT_THRESHOLD,
      BRUSH_SHAPE_SQUARE,
      BRUSH_SHAPE_CIRCLE,
      BRUSH_SHAPE_CUSTOM,
      BRUSH_SHAPE_SET,
      SELECT_SAME_MODE_CONNECTED,
      SELECT_SAME_MODE_GLOBAL,
      SELECT_SAME_MODE_SET,
      FILL_STYLE_SOLID,
      FILL_STYLE_RGB_GRADIENT,
      FILL_STYLE_DITHER_GRADIENT,
      FILL_STYLE_SET,
      SELECTION_SHAPE_MODE_CONTENT,
      SELECTION_SHAPE_MODE_SHAPE,
      SELECTION_SHAPE_MODE_SET,
      CUSTOM_BRUSH_MAX_PIXELS,
      SELECT_RECT_GRID_CELL_SIZE,
      SELECT_RECT_GRID_DOUBLE_TAP_MS,
      FLOATING_DRAW_BUTTON_SCALE_MIN,
      FLOATING_DRAW_BUTTON_SCALE_MAX,
      FLOATING_DRAW_BUTTON_SCALE_STEP,
      DEFAULT_FLOATING_DRAW_BUTTON_SCALE,
      DEFAULT_LAYER_BLEND_MODE,
      ONION_SKIN_MAX_FRAMES,
      COLOR_MODE_INDEX,
      COLOR_MODE_RGB,
      FLOATING_PREVIEW_MIN_SIZE,
      FLOATING_PREVIEW_MAX_SIZE,
      FLOATING_PREVIEW_DEFAULT_STATE,
      MULTI_CANVAS_FEATURE_ENABLED,
      LOCAL_VIEWPORT_CANVAS_SIGNED_IN_MAX_COUNT,
      LOCAL_VIEWPORT_CANVAS_STANDARD_MAX_COUNT,
      LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE,
    });
  }

  function createLayerStateStaticConfig() {
    const LAYER_BLEND_MODE_OPTIONS = Object.freeze([
      Object.freeze({ value: 'normal', label: '通常' }),
      Object.freeze({ value: 'multiply', label: '乗算' }),
      Object.freeze({ value: 'screen', label: 'スクリーン' }),
      Object.freeze({ value: 'overlay', label: 'オーバーレイ' }),
      Object.freeze({ value: 'soft-light', label: 'ソフトライト' }),
      Object.freeze({ value: 'hard-light', label: 'ハードライト' }),
      Object.freeze({ value: 'darken', label: '比較(暗)' }),
      Object.freeze({ value: 'lighten', label: '比較(明)' }),
      Object.freeze({ value: 'color-dodge', label: '覆い焼きカラー' }),
      Object.freeze({ value: 'color-burn', label: '焼き込みカラー' }),
      Object.freeze({ value: 'difference', label: '差の絶対値' }),
      Object.freeze({ value: 'exclusion', label: '除外' }),
    ]);
    const DEFAULT_ONION_SKIN = Object.freeze({
      enabled: false,
      prevFrames: 1,
      nextFrames: 1,
      opacity: 0.35,
    });
    const ONION_SKIN_TINT_PREV = Object.freeze({ r: 92, g: 198, b: 255 });
    const ONION_SKIN_TINT_NEXT = Object.freeze({ r: 255, g: 170, b: 112 });
    return Object.freeze({
      LAYER_BLEND_MODE_OPTIONS,
      DEFAULT_ONION_SKIN,
      ONION_SKIN_TINT_PREV,
      ONION_SKIN_TINT_NEXT,
    });
  }

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
    encodeTypedArray,
    decodeBase64,
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

    function isCustomBrushData(brush) {
      return Boolean(
        brush
        && typeof brush === 'object'
        && Array.isArray(brush.offsets)
        && brush.offsets.length > 0
        && Number.isFinite(brush.pixelCount)
        && brush.pixelCount > 0
      );
    }

    function serializeCustomBrushPayload(brush) {
      const normalized = normalizeCustomBrushData(brush);
      if (!normalized) {
        return null;
      }
      const packed = new Int16Array(normalized.offsets.length * 2);
      for (let i = 0; i < normalized.offsets.length; i += 1) {
        const offset = normalized.offsets[i];
        packed[i * 2] = offset.dx;
        packed[(i * 2) + 1] = offset.dy;
      }
      return {
        width: normalized.width,
        height: normalized.height,
        offsets: encodeTypedArray(packed),
      };
    }

    function deserializeCustomBrushPayload(payload) {
      if (!payload || typeof payload !== 'object' || typeof payload.offsets !== 'string') {
        return null;
      }
      const bytes = decodeBase64(payload.offsets);
      if (!bytes.length || bytes.length % 2 !== 0) {
        return null;
      }
      const source = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      if (source.length % 2 !== 0) {
        return null;
      }
      const offsets = [];
      for (let i = 0; i < source.length; i += 2) {
        if (offsets.length >= CUSTOM_BRUSH_MAX_PIXELS) {
          break;
        }
        offsets.push({ dx: source[i], dy: source[i + 1] });
      }
      return normalizeCustomBrushData({
        width: payload.width,
        height: payload.height,
        offsets,
      });
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
      isCustomBrushData,
      serializeCustomBrushPayload,
      deserializeCustomBrushPayload,
    });
  }

  root.stateNormalizers = Object.freeze({
    createDrawingStateStaticConfig,
    createLayerStateStaticConfig,
    createStateNormalizers,
    createViewportUtils,
  });

  function createViewportUtils({
    clamp,
    FLOATING_PREVIEW_MIN_SIZE,
    FLOATING_PREVIEW_MAX_SIZE,
    FLOATING_PREVIEW_DEFAULT_STATE,
    LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE,
    MULTI_CANVAS_FEATURE_ENABLED,
    getCurrentLocalViewportCanvasLayoutScale,
    getLocalViewportCanvasMaxCount,
  } = {}) {
    function normalizeFloatingPreviewState(source, fallback = FLOATING_PREVIEW_DEFAULT_STATE) {
      const settings = source && typeof source === 'object' ? source : {};
      const safeFallback = fallback && typeof fallback === 'object'
        ? fallback
        : FLOATING_PREVIEW_DEFAULT_STATE;
      const width = clamp(
        Math.round(Number(settings.width) || Number(safeFallback.width) || FLOATING_PREVIEW_DEFAULT_STATE.width),
        FLOATING_PREVIEW_MIN_SIZE,
        FLOATING_PREVIEW_MAX_SIZE
      );
      const height = clamp(
        Math.round(Number(settings.height) || Number(safeFallback.height) || FLOATING_PREVIEW_DEFAULT_STATE.height),
        FLOATING_PREVIEW_MIN_SIZE,
        FLOATING_PREVIEW_MAX_SIZE
      );
      return {
        enabled: Boolean(settings.enabled ?? safeFallback.enabled),
        x: Math.round(Number(settings.x) || Number(safeFallback.x) || FLOATING_PREVIEW_DEFAULT_STATE.x),
        y: Math.round(Number(settings.y) || Number(safeFallback.y) || FLOATING_PREVIEW_DEFAULT_STATE.y),
        width,
        height,
      };
    }

    function parseLocalViewportCanvasAxis(value, fallbackValue = null) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return Math.round(numeric);
      }
      const fallbackNumeric = Number(fallbackValue);
      return Number.isFinite(fallbackNumeric) ? Math.round(fallbackNumeric) : null;
    }

    function parseLocalViewportCanvasUnit(value, fallbackValue = null) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        return Math.round(numeric * 1000) / 1000;
      }
      const fallbackNumeric = Number(fallbackValue);
      return Number.isFinite(fallbackNumeric) ? (Math.round(fallbackNumeric * 1000) / 1000) : null;
    }

    function normalizeLocalViewportCanvasLayoutScale(value, fallbackValue = null) {
      const currentScale = getCurrentLocalViewportCanvasLayoutScale();
      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > 0) {
        return numeric;
      }
      const fallbackNumeric = Number(fallbackValue);
      if (Number.isFinite(fallbackNumeric) && fallbackNumeric > 0) {
        return fallbackNumeric;
      }
      return currentScale;
    }

    function normalizeLocalViewportCanvasPosition(source, fallback = null, options = {}) {
      const {
        relative = true,
        fallbackRelative = true,
        anchorLeft = 0,
        anchorTop = 0,
        layoutScale = 1,
        fallbackAnchorLeft = 0,
        fallbackAnchorTop = 0,
        fallbackLayoutScale = 1,
      } = options || {};
      const settings = source && typeof source === 'object' ? source : {};
      const safeFallback = fallback && typeof fallback === 'object' ? fallback : {};
      const safeLayoutScale = normalizeLocalViewportCanvasLayoutScale(layoutScale, 1);
      const safeFallbackLayoutScale = normalizeLocalViewportCanvasLayoutScale(fallbackLayoutScale, safeLayoutScale);
      const normalizeCoordinate = (value, fallbackValue, isRelative, refAnchor, refScale, fallbackIsRelative, fallbackRefAnchor, fallbackRefScale) => {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          if (isRelative) {
            return parseLocalViewportCanvasUnit(numeric, null);
          }
          return parseLocalViewportCanvasUnit((numeric - refAnchor) / Math.max(refScale, Number.EPSILON), null);
        }
        const fallbackNumeric = Number(fallbackValue);
        if (Number.isFinite(fallbackNumeric)) {
          if (fallbackIsRelative) {
            return parseLocalViewportCanvasUnit(fallbackNumeric, null);
          }
          return parseLocalViewportCanvasUnit(
            (fallbackNumeric - fallbackRefAnchor) / Math.max(fallbackRefScale, Number.EPSILON),
            null
          );
        }
        return null;
      };
      return {
        left: normalizeCoordinate(
          settings.left,
          safeFallback.left,
          relative,
          anchorLeft,
          safeLayoutScale,
          fallbackRelative,
          fallbackAnchorLeft,
          safeFallbackLayoutScale
        ),
        top: normalizeCoordinate(
          settings.top,
          safeFallback.top,
          relative,
          anchorTop,
          safeLayoutScale,
          fallbackRelative,
          fallbackAnchorTop,
          safeFallbackLayoutScale
        ),
      };
    }

    function scaleLocalViewportCanvasAxisForDisplay(value, layoutScale = null) {
      const axis = parseLocalViewportCanvasAxis(value, null);
      if (axis === null) {
        return null;
      }
      const storedScale = normalizeLocalViewportCanvasLayoutScale(layoutScale, getCurrentLocalViewportCanvasLayoutScale());
      const currentScale = getCurrentLocalViewportCanvasLayoutScale();
      return Math.round(axis * (currentScale / storedScale));
    }

    function normalizeLocalViewportCanvasPositions(source, fallback, count) {
      const normalizedCount = Math.max(0, Math.round(Number(count) || 0));
      const sourceList = Array.isArray(source) ? source : [];
      const fallbackList = Array.isArray(fallback) ? fallback : [];
      const options = arguments[3] && typeof arguments[3] === 'object' ? arguments[3] : {};
      const positions = [];
      for (let index = 0; index < normalizedCount; index += 1) {
        positions.push(
          normalizeLocalViewportCanvasPosition(
            sourceList[index],
            fallbackList[index],
            options
          )
        );
      }
      return positions;
    }

    function normalizeLocalViewportCanvasState(source, fallback = LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE) {
      if (!MULTI_CANVAS_FEATURE_ENABLED) {
        return {
          ...LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE,
          layoutScale: getCurrentLocalViewportCanvasLayoutScale(),
          positionsRelative: true,
          anchorLeft: null,
          anchorTop: null,
          positions: [],
        };
      }
      const settings = source && typeof source === 'object' ? source : {};
      const safeFallback = fallback && typeof fallback === 'object'
        ? fallback
        : LOCAL_VIEWPORT_CANVAS_DEFAULT_STATE;
      const requestedCount = Number.isFinite(Number(settings.count))
        ? Number(settings.count)
        : Number(safeFallback.count);
      const normalizedCount = clamp(Math.round(requestedCount || 0), 0, getLocalViewportCanvasMaxCount());
      const requestedSelectedKind = settings.selectedKind === 'local'
        ? 'local'
        : (safeFallback.selectedKind === 'local' ? 'local' : 'main');
      const fallbackSelectedIndex = Number.isFinite(Number(safeFallback.selectedIndex))
        ? Math.round(Number(safeFallback.selectedIndex))
        : -1;
      const requestedSelectedIndex = Number.isFinite(Number(settings.selectedIndex))
        ? Math.round(Number(settings.selectedIndex))
        : fallbackSelectedIndex;
      const normalizedSelectedKind = normalizedCount > 0 && requestedSelectedKind === 'local'
        ? 'local'
        : 'main';
      const normalizedSelectedIndex = normalizedSelectedKind === 'local'
        ? clamp(requestedSelectedIndex, 0, Math.max(0, normalizedCount - 1))
        : -1;
      const layoutScale = normalizeLocalViewportCanvasLayoutScale(
        settings.layoutScale,
        safeFallback.layoutScale
      );
      const anchorLeft = parseLocalViewportCanvasAxis(settings.anchorLeft, safeFallback.anchorLeft);
      const anchorTop = parseLocalViewportCanvasAxis(settings.anchorTop, safeFallback.anchorTop);
      const fallbackAnchorLeft = parseLocalViewportCanvasAxis(safeFallback.anchorLeft, 0) || 0;
      const fallbackAnchorTop = parseLocalViewportCanvasAxis(safeFallback.anchorTop, 0) || 0;
      const positionsRelative = true;
      return {
        count: normalizedCount,
        selectedKind: normalizedSelectedKind,
        selectedIndex: normalizedSelectedIndex,
        layoutScale,
        positionsRelative,
        anchorLeft,
        anchorTop,
        positions: normalizeLocalViewportCanvasPositions(
          settings.positions,
          safeFallback.positions,
          normalizedCount,
          {
            relative: settings.positionsRelative !== false,
            fallbackRelative: safeFallback.positionsRelative !== false,
            anchorLeft: anchorLeft ?? 0,
            anchorTop: anchorTop ?? 0,
            layoutScale,
            fallbackAnchorLeft,
            fallbackAnchorTop,
            fallbackLayoutScale: normalizeLocalViewportCanvasLayoutScale(safeFallback.layoutScale, layoutScale),
          }
        ),
      };
    }

    return Object.freeze({
      normalizeFloatingPreviewState,
      parseLocalViewportCanvasAxis,
      parseLocalViewportCanvasUnit,
      normalizeLocalViewportCanvasPosition,
      normalizeLocalViewportCanvasLayoutScale,
      scaleLocalViewportCanvasAxisForDisplay,
      normalizeLocalViewportCanvasPositions,
      normalizeLocalViewportCanvasState,
    });
  }
})();
