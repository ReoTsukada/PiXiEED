(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createToolActionStaticConfig() {
    const TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE = 'virtualCursorToggle';
    const TOOL_ACTION_MIRROR_POPUP = 'mirrorPopup';
    const TOOL_ACTION_CAMERA_MODE = 'cameraMode';
    const TOOL_ACTION_FLOATING_PREVIEW_TOGGLE = 'floatingPreviewToggle';
    const TOP_UI_ACTION_MIRROR_POPUP = TOOL_ACTION_MIRROR_POPUP;
    const TOP_UI_ACTION_VIRTUAL_CURSOR_TOGGLE = TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE;
    const TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE = TOOL_ACTION_FLOATING_PREVIEW_TOGGLE;
    const TOP_UI_ACTION_OPEN_LENS_CAMERA = 'openLensCamera';
    const TOP_UI_ACTION_OPEN_QR_EDITOR = 'openQrEditor';
    const TOP_UI_ACTION_OPEN_DETAILS_PANEL = 'openDetailsPanel';
    const EXTERNAL_TOOL_PIXIEELENS_ID = 'pixieelens';
    const EXTERNAL_TOOL_QR_MAKER_ID = 'qrmaker';
    const TOOL_ACTIONS = new Set([
      TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE,
      TOOL_ACTION_MIRROR_POPUP,
      TOOL_ACTION_FLOATING_PREVIEW_TOGGLE,
    ]);
    const TOOL_SHORTCUT_SHAPE_GROUP = '__shapeGroup__';
    const TOOL_SHORTCUT_CREATE_CUSTOM_BRUSH = '__createCustomBrush__';
    const POINTER_TOOL_CUSTOM_BRUSH_RECT = '__customBrushRect__';
    const MOBILE_DRAWER_DEFAULT_MODE = 'half';
    const MOBILE_DRAWER_PEEK_HEIGHT_OFFSET = 3;
    const UNIFIED_LEFT_TOOLS_COLOR_MODE = true;
    const DESKTOP_RIGHT_TOOL_RAIL_MODE = true;
    const INLINE_GUIDES_STORAGE_KEY = 'pixieedraw:inline-guides-visible-v1';
    const INTERNAL_TOOL_DEFINITIONS = Object.freeze({
      pan: Object.freeze({ id: 'pan', internal: true, visibleInToolbar: false }),
      zoom: Object.freeze({ id: 'zoom', internal: true, visibleInToolbar: false }),
    });
    return Object.freeze({
      TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE,
      TOOL_ACTION_MIRROR_POPUP,
      TOOL_ACTION_CAMERA_MODE,
      TOOL_ACTION_FLOATING_PREVIEW_TOGGLE,
      TOP_UI_ACTION_MIRROR_POPUP,
      TOP_UI_ACTION_VIRTUAL_CURSOR_TOGGLE,
      TOP_UI_ACTION_FLOATING_PREVIEW_TOGGLE,
      TOP_UI_ACTION_OPEN_LENS_CAMERA,
      TOP_UI_ACTION_OPEN_QR_EDITOR,
      TOP_UI_ACTION_OPEN_DETAILS_PANEL,
      EXTERNAL_TOOL_PIXIEELENS_ID,
      EXTERNAL_TOOL_QR_MAKER_ID,
      TOOL_ACTIONS,
      TOOL_SHORTCUT_SHAPE_GROUP,
      TOOL_SHORTCUT_CREATE_CUSTOM_BRUSH,
      POINTER_TOOL_CUSTOM_BRUSH_RECT,
      MOBILE_DRAWER_DEFAULT_MODE,
      MOBILE_DRAWER_PEEK_HEIGHT_OFFSET,
      UNIFIED_LEFT_TOOLS_COLOR_MODE,
      DESKTOP_RIGHT_TOOL_RAIL_MODE,
      INLINE_GUIDES_STORAGE_KEY,
      INTERNAL_TOOL_DEFINITIONS,
    });
  }

  function createToolbarStaticConfig({
    TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE,
    TOOL_ACTION_FLOATING_PREVIEW_TOGGLE,
    TOOL_ACTION_MIRROR_POPUP,
    TOOL_SHORTCUT_SHAPE_GROUP,
  } = {}) {
    const LEFT_TAB_KEYS = ['tools', 'color'];
    const RIGHT_TAB_KEYS = ['frames', 'details', 'settings', 'extensions', 'help', 'file', 'multi'];
    const TOOL_GROUPS = {
      selection: { label: '範囲選択', tools: ['move', 'selectRect', 'selectLasso', 'selectSame'] },
      pen: { label: 'ペン', tools: ['pen'] },
      eyedropper: { label: 'スポイト', tools: ['eyedropper'] },
      eraser: { label: '消しゴム', tools: ['eraser'] },
      shape: { label: '図形', tools: ['line', 'curve', 'rect', 'rectFill', 'ellipse', 'ellipseFill', 'oval', 'ovalFill'] },
      fill: { label: '塗りつぶし', tools: ['fill', 'fillDither', 'fillGradient'] },
    };
    const DEFAULT_GROUP_TOOL = {
      selection: 'selectRect',
      pen: 'pen',
      eyedropper: 'eyedropper',
      eraser: 'eraser',
      shape: 'line',
      fill: 'fill',
    };
    const TOOL_TO_GROUP = Object.keys(TOOL_GROUPS).reduce((acc, key) => {
      TOOL_GROUPS[key].tools.forEach(tool => {
        acc[tool] = key;
      });
      return acc;
    }, {});
    const LEGACY_TOOL_ALIASES = Object.freeze({
      virtualCursorCenter: TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE,
      floatingPreviewToggle: TOOL_ACTION_FLOATING_PREVIEW_TOGGLE,
      fillRgbGradient: 'fillGradient',
      fillDitherGradient: 'fillDither',
    });
    const TOOL_SHORTCUT_BINDINGS = Object.freeze({
      v: 'move',
      m: 'selectRect',
      q: 'selectLasso',
      w: 'selectSame',
      b: 'pen',
      e: 'eraser',
      i: 'eyedropper',
      g: 'fill',
      l: 'line',
      c: 'curve',
      u: TOOL_SHORTCUT_SHAPE_GROUP,
      y: TOOL_ACTION_MIRROR_POPUP,
      k: TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE,
    });
    const MOBILE_DRAWER_MODE_ORDER = Object.freeze(['half', 'full']);
    const MOBILE_TAB_DRAWER_MODE = Object.freeze({
      tools: 'half',
      color: 'half',
      frames: 'full',
      details: 'full',
      settings: 'full',
      extensions: 'full',
      help: 'full',
      file: 'full',
      multi: 'full',
    });
    return Object.freeze({
      LEFT_TAB_KEYS,
      RIGHT_TAB_KEYS,
      TOOL_GROUPS,
      DEFAULT_GROUP_TOOL,
      TOOL_TO_GROUP,
      LEGACY_TOOL_ALIASES,
      TOOL_SHORTCUT_BINDINGS,
      MOBILE_DRAWER_MODE_ORDER,
      MOBILE_TAB_DRAWER_MODE,
    });
  }

  function createDrawingToolStaticConfig({
    FILL_TOOL_SOLID,
    FILL_TOOL_DITHER,
    FILL_TOOL_GRADIENT,
  } = {}) {
    const FILL_TOOL_SET = new Set([FILL_TOOL_SOLID, FILL_TOOL_DITHER, FILL_TOOL_GRADIENT]);
    const MIRROR_DRAW_TOOLS = new Set(['pen', 'eraser', 'line', 'curve', 'rect', 'rectFill', 'ellipse', 'ellipseFill', 'oval', 'ovalFill', ...FILL_TOOL_SET]);
    const BRUSH_TOOLS = new Set(['pen', 'eraser']);
    const VIRTUAL_CURSOR_SUPPORTED_TOOLS = new Set([
      'pen',
      'eraser',
      'line',
      'rect',
      'rectFill',
      'ellipse',
      'ellipseFill',
      'oval',
      'ovalFill',
      'move',
      'selectRect',
      'selectLasso',
      'curve',
    ]);
    const VIRTUAL_CURSOR_SHAPE_TOOLS = new Set(['line', 'rect', 'rectFill', 'ellipse', 'ellipseFill', 'oval', 'ovalFill']);
    const VIRTUAL_CURSOR_SELECTION_TOOLS = new Set(['selectRect', 'selectLasso']);
    const VIRTUAL_CURSOR_MOVE_TOOLS = new Set(['move']);
    const FILL_TOOLS = FILL_TOOL_SET;
    const SHAPE_TOOLS = new Set(['line', 'curve', 'rect', 'rectFill', 'ellipse', 'ellipseFill', 'oval', 'ovalFill']);
    const BRUSH_SIZE_TOOLS = new Set([...BRUSH_TOOLS, ...SHAPE_TOOLS]);
    const SELECTION_TOOLS = new Set(['move', 'selectRect', 'selectLasso', 'selectSame', 'selectionMove', 'layerMove', 'selectionTransform']);
    const TOOL_ICON_FALLBACK = {
      move: '⇕',
      selectRect: '□',
      selectLasso: '⌁',
      selectSame: '★',
      line: '／',
      curve: '∿',
      rect: '▢',
      rectFill: '▣',
      ellipse: '◯',
      ellipseFill: '⬤',
      oval: '⬭',
      ovalFill: '⬮',
      fill: '▣',
      fillDither: '░',
      fillGradient: '▥',
    };
    return Object.freeze({
      FILL_TOOL_SET,
      MIRROR_DRAW_TOOLS,
      BRUSH_TOOLS,
      VIRTUAL_CURSOR_SUPPORTED_TOOLS,
      VIRTUAL_CURSOR_SHAPE_TOOLS,
      VIRTUAL_CURSOR_SELECTION_TOOLS,
      VIRTUAL_CURSOR_MOVE_TOOLS,
      FILL_TOOLS,
      SHAPE_TOOLS,
      BRUSH_SIZE_TOOLS,
      SELECTION_TOOLS,
      TOOL_ICON_FALLBACK,
    });
  }

  function createUiStaticConfig() {
    const ZOOM_STEPS = Object.freeze([
      0.5,
      1,
      1.25,
      1.5,
      2,
      2.5,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      12,
      14,
      16,
      18,
      20,
    ]);
    const SPRITE_SCALE_DOWN_PRESETS = Object.freeze([
      { value: 0.2, label: '0.2', numerator: 1, denominator: 5 },
      { value: 0.25, label: '0.25', numerator: 1, denominator: 4 },
      { value: 1 / 3, label: '0.33', numerator: 1, denominator: 3 },
      { value: 0.5, label: '0.5', numerator: 1, denominator: 2 },
    ]);
    const BACKGROUND_TILE_COLORS = Object.freeze({
      dark: [
        { r: 52, g: 56, b: 68, a: 255 },
        { r: 28, g: 31, b: 39, a: 255 },
      ],
      light: [
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 236, g: 236, b: 240, a: 255 },
      ],
      pink: [
        { r: 255, g: 238, b: 245, a: 255 },
        { r: 255, g: 213, b: 230, a: 255 },
      ],
    });
    const UI_THEME_PRESETS = Object.freeze({
      emerald: Object.freeze({ label: '緑色', themeColor: '#0b1415' }),
      pink: Object.freeze({ label: 'ピンク', themeColor: '#16101b' }),
      white: Object.freeze({ label: '白', themeColor: '#111317' }),
      lightblue: Object.freeze({ label: '水色', themeColor: '#0b1420' }),
      yellow: Object.freeze({ label: '黄色', themeColor: '#151207' }),
    });
    return Object.freeze({
      ZOOM_STEPS,
      SPRITE_SCALE_DOWN_PRESETS,
      BACKGROUND_TILE_COLORS,
      UI_THEME_PRESETS,
    });
  }

  function createAppStaticConfig({
    ZOOM_STEPS = Object.freeze([]),
  } = {}) {
    const MIN_ZOOM_RATIO = ZOOM_STEPS[0];
    const MAX_ZOOM_RATIO = ZOOM_STEPS[ZOOM_STEPS.length - 1];
    const ZOOM_SLIDER_MIN = Math.round(MIN_ZOOM_RATIO * 100);
    const ZOOM_SLIDER_MAX = Math.round(MAX_ZOOM_RATIO * 100);
    const MIN_ZOOM_SCALE = 0.05;
    const MAX_ZOOM_SCALE = 4096;
    const MAX_ZOOM_BASE_SCALE = 128;
    const SMALL_CANVAS_BASE_VIEWPORT_FILL_RATIO = 0.5;
    const ZOOM_WHEEL_STEP_BASE = 1.25;
    const WHEEL_ZOOM_RAW_RESET_MS = 160;
    const ZOOM_EPSILON = 1e-6;
    const ZOOM_INDICATOR_TIMEOUT = 1800;
    const DEFAULT_IMPORT_FRAME_DURATION = 1000 / 12;
    const IMPORT_FRAME_DURATION_MIN_MS = 16;
    const IMPORT_FRAME_DURATION_MAX_MS = 2000;
    const IMPORT_INTEGER_SCALE_SAMPLE_GRID = 8;
    const DEFAULT_CANVAS_SIZE = 32;
    const MIN_CANVAS_SIZE = 1;
    const MAX_CANVAS_SIZE = 512;
    const SPRITE_SCALE_MIN = 0.2;
    const SPRITE_SCALE_EPSILON = 1e-6;
    const MAX_IMAGE_IMPORT_SOURCE_SIZE = 2000;
    const PROJECT_FILE_EXTENSION = '.pixieedraw';
    const PROJECT_FILE_MIME_TYPE = 'application/x-pixieedraw';
    const PROJECT_PACKAGE_TYPE = 'pixieedraw-project';
    const PROJECT_PACKAGE_VERSION = 2;
    const MAX_IMPORTED_PALETTE_COLORS = 256;
    const MAX_EXPORT_DIMENSION = 2000;
    const MAX_EXPORT_SCALE_OPTIONS = MAX_EXPORT_DIMENSION;
    const MAX_SELECTION_CANVAS_DIMENSION = 4096;
    const TARGET_EXPORT_OUTPUT_SIZE = 640;
    return Object.freeze({
      MIN_ZOOM_RATIO,
      MAX_ZOOM_RATIO,
      ZOOM_SLIDER_MIN,
      ZOOM_SLIDER_MAX,
      MIN_ZOOM_SCALE,
      MAX_ZOOM_SCALE,
      MAX_ZOOM_BASE_SCALE,
      SMALL_CANVAS_BASE_VIEWPORT_FILL_RATIO,
      ZOOM_WHEEL_STEP_BASE,
      WHEEL_ZOOM_RAW_RESET_MS,
      ZOOM_EPSILON,
      ZOOM_INDICATOR_TIMEOUT,
      DEFAULT_IMPORT_FRAME_DURATION,
      IMPORT_FRAME_DURATION_MIN_MS,
      IMPORT_FRAME_DURATION_MAX_MS,
      IMPORT_INTEGER_SCALE_SAMPLE_GRID,
      DEFAULT_CANVAS_SIZE,
      MIN_CANVAS_SIZE,
      MAX_CANVAS_SIZE,
      SPRITE_SCALE_MIN,
      SPRITE_SCALE_EPSILON,
      MAX_IMAGE_IMPORT_SOURCE_SIZE,
      PROJECT_FILE_EXTENSION,
      PROJECT_FILE_MIME_TYPE,
      PROJECT_PACKAGE_TYPE,
      PROJECT_PACKAGE_VERSION,
      MAX_IMPORTED_PALETTE_COLORS,
      MAX_EXPORT_DIMENSION,
      MAX_EXPORT_SCALE_OPTIONS,
      MAX_SELECTION_CANVAS_DIMENSION,
      TARGET_EXPORT_OUTPUT_SIZE,
    });
  }

  function createStorageStaticConfig() {
    const SESSION_STORAGE_KEY = 'pixieedraw:sessionState';
    const RELOAD_SNAPSHOT_ENABLED = true;
    const RELOAD_SNAPSHOT_STORAGE_KEY = 'pixieedraw:reload-snapshot-v1';
    const RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY = 'pixieedraw:reload-snapshot-fallback-v1';
    const RELOAD_PROJECT_FALLBACK_STORAGE_KEY = 'pixieedraw:reload-project-fallback-v1';
    const RELOAD_TARGET_PROJECT_ID_KEY = 'pixieedraw:reload-target-project-id-v1';
    const RELOAD_SNAPSHOT_VERSION = 1;
    const RELOAD_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const RELOAD_SNAPSHOT_MAX_HISTORY_ITEMS = 24;
    const RELOAD_SNAPSHOT_COMPRESS_THRESHOLD = 4096;
    const RELOAD_SNAPSHOT_MAX_SYNC_CHARS = 2 * 1024 * 1024;
    const STARTUP_SCREEN_DISMISSED_KEY = 'pixieedraw:startupScreenDismissed';
    const STARTUP_ACCOUNT_INIT_TIMEOUT_MS = 5000;
    const STARTUP_RESTORE_TIMEOUT_MS = 8000;
    const UPDATE_TOAST_SEEN_PREFIX = 'pixieedraw:update-toast-seen:';
    const STARTUP_UPDATE_TOAST_HIDDEN_KEY = 'pixieedraw:update-toast-hidden';
    const HIDDEN_SHARED_PROJECT_KEYS_STORAGE_PREFIX = 'pixieedraw:hidden-shared-projects:';
    const UPDATE_HISTORY_STORAGE_KEY = 'pixieedraw:update-history-log-v1';
    const UPDATE_HISTORY_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
    const EXPORT_INTERSTITIAL_LAST_SHOWN_KEY = 'pixieedraw:export-interstitial-last-shown-at';
    const EXPORT_INTERSTITIAL_COOLDOWN_MS = 45 * 1000;
    const STREAMING_HIDE_MONETIZATION_UI = true;
    const SUPPRESSED_UPDATE_HISTORY_IDS = new Set([
      '2026-03-11-local-extension-personal-view-spritemap',
      '2026-03-11-personal-view-copy-paste-stability',
    ]);
    const UI_LANGUAGE_STORAGE_KEY = 'pixieedraw:ui-language';
    const UI_LANGUAGE_JA = 'ja';
    const UI_LANGUAGE_EN = 'en';
    const UI_LANGUAGE_ZH = 'zh';
    const UI_LANGUAGE_SET = new Set([UI_LANGUAGE_JA, UI_LANGUAGE_EN, UI_LANGUAGE_ZH]);
    return Object.freeze({
      SESSION_STORAGE_KEY,
      RELOAD_SNAPSHOT_ENABLED,
      RELOAD_SNAPSHOT_STORAGE_KEY,
      RELOAD_SNAPSHOT_FALLBACK_STORAGE_KEY,
      RELOAD_PROJECT_FALLBACK_STORAGE_KEY,
      RELOAD_TARGET_PROJECT_ID_KEY,
      RELOAD_SNAPSHOT_VERSION,
      RELOAD_SNAPSHOT_MAX_AGE_MS,
      RELOAD_SNAPSHOT_MAX_HISTORY_ITEMS,
      RELOAD_SNAPSHOT_COMPRESS_THRESHOLD,
      RELOAD_SNAPSHOT_MAX_SYNC_CHARS,
      STARTUP_SCREEN_DISMISSED_KEY,
      STARTUP_ACCOUNT_INIT_TIMEOUT_MS,
      STARTUP_RESTORE_TIMEOUT_MS,
      UPDATE_TOAST_SEEN_PREFIX,
      STARTUP_UPDATE_TOAST_HIDDEN_KEY,
      HIDDEN_SHARED_PROJECT_KEYS_STORAGE_PREFIX,
      UPDATE_HISTORY_STORAGE_KEY,
      UPDATE_HISTORY_RETENTION_MS,
      EXPORT_INTERSTITIAL_LAST_SHOWN_KEY,
      EXPORT_INTERSTITIAL_COOLDOWN_MS,
      STREAMING_HIDE_MONETIZATION_UI,
      SUPPRESSED_UPDATE_HISTORY_IDS,
      UI_LANGUAGE_STORAGE_KEY,
      UI_LANGUAGE_JA,
      UI_LANGUAGE_EN,
      UI_LANGUAGE_ZH,
      UI_LANGUAGE_SET,
    });
  }

  function createRuntimeStaticConfig() {
    const USER_AGENT = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const USER_AGENT_LOWER = USER_AGENT.toLowerCase();
    const IS_IOS_DEVICE = /iphone|ipod|ipad/i.test(USER_AGENT_LOWER);
    const IS_ANDROID_DEVICE = /android/i.test(USER_AGENT);
    const AUTOSAVE_SUPPORTED =
      typeof window !== 'undefined' &&
      'indexedDB' in window;
    const SUPPORTS_ANCHOR_DOWNLOAD =
      typeof HTMLAnchorElement !== 'undefined' && 'download' in HTMLAnchorElement.prototype;
    const DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS = 10000;
    const CAN_USE_WEB_SHARE =
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof navigator.canShare === 'function' &&
      typeof File === 'function';
    const SHARE_HASHTAG = '#PiXiEED';
    const CONTEST_PENDING_UPLOAD_STORAGE_KEY = 'pixieed_contest_upload_v1';
    const CONTEST_POST_PAGE_URL = '../contest/index.html';
    const IS_ANDROID_LINE_BROWSER =
      IS_ANDROID_DEVICE
      && /line\//i.test(USER_AGENT);
    // Legacy fallback snapshot path (disabled: autosave now uses IndexedDB project records on all devices).
    const IOS_SNAPSHOT_SUPPORTED = false;
    const IOS_SNAPSHOT_DB_NAME = 'pixieedraw-ios-snapshots';
    const IOS_SNAPSHOT_DB_VERSION = 1;
    const IOS_SNAPSHOT_STORE_NAME = 'snapshots';
    const IOS_SNAPSHOT_KEY = 'latest';
    const IOS_SNAPSHOT_WRITE_DELAY = 0;
    const IOS_SNAPSHOT_COMPRESSION_THRESHOLD = 32 * 1024;
    const SESSION_PERSIST_DELAY = 120;
    const SAVE_INTERACTION_GRACE_MS = 1300;
    const VIEWPORT_INTERACTION_GRACE_MS = 420;
    const AUTOSAVE_LIFECYCLE_FLUSH_THROTTLE_MS = 240;
    return Object.freeze({
      USER_AGENT,
      USER_AGENT_LOWER,
      IS_IOS_DEVICE,
      IS_ANDROID_DEVICE,
      AUTOSAVE_SUPPORTED,
      SUPPORTS_ANCHOR_DOWNLOAD,
      DOWNLOAD_OBJECT_URL_REVOKE_DELAY_MS,
      CAN_USE_WEB_SHARE,
      SHARE_HASHTAG,
      CONTEST_PENDING_UPLOAD_STORAGE_KEY,
      CONTEST_POST_PAGE_URL,
      IS_ANDROID_LINE_BROWSER,
      IOS_SNAPSHOT_SUPPORTED,
      IOS_SNAPSHOT_DB_NAME,
      IOS_SNAPSHOT_DB_VERSION,
      IOS_SNAPSHOT_STORE_NAME,
      IOS_SNAPSHOT_KEY,
      IOS_SNAPSHOT_WRITE_DELAY,
      IOS_SNAPSHOT_COMPRESSION_THRESHOLD,
      SESSION_PERSIST_DELAY,
      SAVE_INTERACTION_GRACE_MS,
      VIEWPORT_INTERACTION_GRACE_MS,
      AUTOSAVE_LIFECYCLE_FLUSH_THROTTLE_MS,
    });
  }

  root.uiStaticConfig = Object.freeze({
    createToolActionStaticConfig,
    createToolbarStaticConfig,
    createDrawingToolStaticConfig,
    createUiStaticConfig,
    createAppStaticConfig,
    createStorageStaticConfig,
    createRuntimeStaticConfig,
  });
})();
