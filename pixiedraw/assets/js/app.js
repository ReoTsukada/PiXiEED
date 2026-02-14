(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const dom = {
    appRoot: document.getElementById('appRoot'),
    layout: document.getElementById('appLayout'),
    stage: document.getElementById('stage'),
    leftRail: document.getElementById('leftRail'),
    rightRail: document.getElementById('rightRail'),
    leftTabsBar: document.getElementById('leftRailTabs'),
    leftTabButtons: Array.from(document.querySelectorAll('[data-left-tab]')),
    leftTabPanes: document.getElementById('leftRailPanes'),
    rightTabsBar: document.getElementById('rightRailTabs'),
    rightTabButtons: Array.from(document.querySelectorAll('[data-right-tab]')),
    rightTabPanes: document.getElementById('rightRailPanes'),
    mobileDrawer: document.getElementById('mobileDrawer'),
    mobileDrawerHandle: document.getElementById('mobileDrawerHandle'),
    mobileTopBar: document.getElementById('mobileTopBar'),
    mobileShortcutsMount: document.getElementById('mobileShortcutsMount'),
    mobileTabs: Array.from(document.querySelectorAll('.mobile-tab')),
    colorTabSwatch: document.getElementById('colorTabSwatch'),
    mobileColorTabSwatch: document.getElementById('mobileColorTabSwatch'),
    toolTabIcon: document.getElementById('toolTabIcon'),
    mobileToolTabIcon: document.getElementById('mobileToolTabIcon'),
    mobilePanels: {
      tools: document.getElementById('mobilePanelTools'),
      color: document.getElementById('mobilePanelColor'),
      frames: document.getElementById('mobilePanelFrames'),
      settings: document.getElementById('mobilePanelSettings'),
      file: document.getElementById('mobilePanelFile'),
      pixfind: document.getElementById('mobilePanelPixfind'),
    },
    sections: {
      tools: document.getElementById('panelTools'),
      color: document.getElementById('panelColor'),
      frames: document.getElementById('panelFrames'),
      settings: document.getElementById('panelSettings'),
      file: document.getElementById('panelFile'),
      pixfind: document.getElementById('panelPixfind'),
    },
    canvases: {
      stack: document.getElementById('canvasStack'),
      drawing: /** @type {HTMLCanvasElement} */ (document.getElementById('drawingCanvas')),
      overlay: /** @type {HTMLCanvasElement} */ (document.getElementById('overlayCanvas')),
      selection: /** @type {HTMLCanvasElement} */ (document.getElementById('selectionCanvas')),
      virtualCursor: /** @type {HTMLCanvasElement} */ (document.getElementById('virtualCursorCanvas')),
    },
    canvasViewport: document.getElementById('canvasViewport'),
    canvasControls: document.querySelector('.canvas-controls'),
    floatingDrawButton: document.getElementById('floatingDrawButton'),
    zoomIndicator: document.getElementById('zoomIndicator'),
    resizeHandles: {
      left: document.getElementById('resizeLeftRail'),
      right: document.getElementById('resizeRightRail'),
    },
    toolGroupButtons: Array.from(document.querySelectorAll('.tool-group-button[data-tool-group]')),
    toolGrid: document.getElementById('toolGrid'),
    controls: {
      toggleGrid: document.getElementById('toggleGrid'),
      toggleMajorGrid: document.getElementById('toggleMajorGrid'),
      toggleBackgroundMode: document.getElementById('toggleBackgroundMode'),
      undoAction: document.getElementById('undoAction'),
      redoAction: document.getElementById('redoAction'),
      canvasControlButtons: document.getElementById('canvasControlButtons'),
      canvasControlPrimary: document.getElementById('canvasControlPrimary'),
      canvasControlSecondary: document.getElementById('canvasControlSecondary'),
      zoomSlider: document.getElementById('zoomSlider'),
      brushSize: document.getElementById('brushSize'),
      brushSizeValue: document.getElementById('brushSizeValue'),
      colorMode: Array.from(document.querySelectorAll('input[name="colorMode"]')),
      paletteList: document.getElementById('paletteList'),
      addPaletteColor: document.getElementById('addPaletteColor'),
      removePaletteColor: document.getElementById('removePaletteColor'),
      paletteIndex: document.getElementById('paletteIndex'),
      paletteHue: document.getElementById('paletteHue'),
      paletteSaturation: document.getElementById('paletteSaturation'),
      paletteValue: document.getElementById('paletteValue'),
      paletteAlphaSlider: document.getElementById('paletteAlphaSlider'),
      paletteAlphaValue: document.getElementById('paletteAlphaValue'),
      paletteWheel: /** @type {HTMLCanvasElement|null} */ (document.getElementById('paletteColorWheel')),
      paletteWheelCursor: document.getElementById('paletteWheelCursor'),
      palettePreview: document.getElementById('palettePreview'),
      timelineMatrix: document.getElementById('timelineMatrix'),
      addLayer: document.getElementById('addLayer'),
      removeLayer: document.getElementById('removeLayer'),
      moveLayerUp: document.getElementById('moveLayerUp'),
      moveLayerDown: document.getElementById('moveLayerDown'),
      addFrame: document.getElementById('addFrame'),
      removeFrame: document.getElementById('removeFrame'),
      moveFrameUp: document.getElementById('moveFrameUp'),
      moveFrameDown: document.getElementById('moveFrameDown'),
      playAnimation: document.getElementById('playAnimation'),
      stopAnimation: document.getElementById('stopAnimation'),
      rewindAnimation: document.getElementById('rewindAnimation'),
      forwardAnimation: document.getElementById('forwardAnimation'),
      animationFps: document.getElementById('animationFps'),
      animationFpsMs: document.getElementById('animationFpsMs'),
      applyFpsAll: document.getElementById('applyFpsAll'),
      canvasWidth: document.getElementById('canvasWidth'),
      canvasHeight: document.getElementById('canvasHeight'),
      toggleChecker: document.getElementById('toggleChecker'),
      togglePixelPreview: document.getElementById('togglePixelPreview'),
      toggleVirtualCursor: document.getElementById('toggleVirtualCursor'),
      virtualCursorButtonScale: document.getElementById('virtualCursorButtonScale'),
      virtualCursorButtonScaleValue: document.getElementById('virtualCursorButtonScaleValue'),
      openDocument: document.getElementById('openDocument'),
      exportProject: document.getElementById('exportProject'),
      togglePixfindMode: document.getElementById('togglePixfindMode'),
      refreshPixfindBase: document.getElementById('refreshPixfindBase'),
      sendToPixfind: document.getElementById('sendToPixfind'),
      clearCanvas: document.getElementById('clearCanvas'),
      enableAutosave: document.getElementById('enableAutosave'),
      autosaveStatus: document.getElementById('autosaveStatus'),
      memoryUsage: document.getElementById('memoryUsage'),
      memoryClear: document.getElementById('memoryClear'),
      spriteScaleInput: document.getElementById('spriteScaleInput'),
      applySpriteScale: document.getElementById('applySpriteScale'),
    },
    startup: {
      screen: document.getElementById('startupScreen'),
      newButton: document.getElementById('startupActionNew'),
      openButton: document.getElementById('startupActionOpen'),
      skipButton: document.getElementById('startupActionSkip'),
      hint: document.getElementById('startupScreenHint'),
      recentSection: document.getElementById('startupRecentProjects'),
      recentList: document.getElementById('startupRecentList'),
    },
    newProject: {
      button: document.getElementById('newProject'),
      dialog: /** @type {HTMLDialogElement|null} */ (document.getElementById('newProjectDialog')),
      form: document.getElementById('newProjectForm'),
      nameInput: document.getElementById('newProjectName'),
      widthInput: document.getElementById('newProjectWidth'),
      heightInput: document.getElementById('newProjectHeight'),
      cancel: document.getElementById('cancelNewProject'),
      confirm: document.getElementById('confirmNewProject'),
    },
    exportDialog: {
      dialog: /** @type {HTMLDialogElement|null} */ (document.getElementById('exportDialog')),
      form: document.getElementById('exportDialogForm'),
      confirm: document.getElementById('confirmExport'),
      format: document.getElementById('exportFormat'),
      cancel: document.getElementById('cancelExport'),
      scaleSlider: document.getElementById('exportScaleSlider'),
      scaleInput: document.getElementById('exportScaleInput'),
      includeOriginalToggle: document.getElementById('exportIncludeOriginalToggle'),
      pixelWidthInput: document.getElementById('exportPixelWidth'),
      pixelHeightInput: document.getElementById('exportPixelHeight'),
      scaleHint: document.getElementById('exportScaleHint'),
      adContainer: document.getElementById('exportAdContainer'),
      adSlot: document.getElementById('exportAdSlot'),
    },
  };

  const preventBrowserZoom = (event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
    }
  };

  window.addEventListener('wheel', preventBrowserZoom, { passive: false });
  window.addEventListener(
    'keydown',
    (event) => {
      if ((event.ctrlKey || event.metaKey) && ['=', '+', '-', '_', '0', 'Add', 'Subtract'].includes(event.key)) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
  window.addEventListener('gesturestart', (event) => {
    event.preventDefault();
  });

  document.addEventListener('selectstart', (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, .button, .tool-button, .pixel-button, .rail-tab, .chip, .timeline-slot, .timeline-frame-button, .timeline-layer-tag, .mobile-tab, .mobile-shortcut')) {
      event.preventDefault();
    }
  });

  function disableImageLongPress(element) {
    if (!element || !(element instanceof HTMLElement)) {
      return;
    }
    element.setAttribute('draggable', 'false');
    ['pointerdown', 'touchstart', 'mousedown'].forEach((type) => {
      element.addEventListener(type, (event) => {
        event.stopPropagation();
      }, { passive: false });
    });
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });
  }

  document.querySelectorAll('img, svg, [data-longpress-block="true"]').forEach(disableImageLongPress);

  const referenceDom = {
    overlay: document.getElementById('referenceOverlay'),
    wrap: document.getElementById('referenceWrap'),
    image: document.getElementById('referenceImage'),
    handles: Array.from(document.querySelectorAll('.reference-handle')),
    loadButton: document.getElementById('loadReferenceImageBtn'),
    clearButton: document.getElementById('clearReferenceImageBtn'),
    input: document.getElementById('referenceImageInput'),
  };

  const LEFT_TAB_KEYS = ['tools', 'color'];
  const RIGHT_TAB_KEYS = ['frames', 'settings', 'file', 'pixfind'];
  const TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE = 'virtualCursorToggle';
  const TOOL_ACTION_VIRTUAL_CURSOR_CENTER = 'virtualCursorCenter';
  const TOOL_ACTIONS = new Set([
    TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE,
    TOOL_ACTION_VIRTUAL_CURSOR_CENTER,
  ]);
  const TOOL_GROUPS = {
    selection: { label: '範囲選択', tools: ['move', 'selectRect', 'selectLasso', 'selectSame'] },
    pen: { label: 'ペン', tools: ['pen', 'eyedropper'] },
    eraser: { label: '消しゴム', tools: ['eraser'] },
    shape: { label: '図形', tools: ['line', 'curve', 'rect', 'rectFill', 'ellipse', 'ellipseFill'] },
    fill: { label: '塗りつぶし', tools: ['fill'] },
    virtualCursor: { label: '仮想カーソル', tools: [TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE, TOOL_ACTION_VIRTUAL_CURSOR_CENTER] },
  };
  const DEFAULT_GROUP_TOOL = {
    selection: 'selectRect',
    pen: 'pen',
    eraser: 'eraser',
    shape: 'line',
    fill: 'fill',
    virtualCursor: TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE,
  };
  const TOOL_TO_GROUP = Object.keys(TOOL_GROUPS).reduce((acc, key) => {
    TOOL_GROUPS[key].tools.forEach(tool => {
      acc[tool] = key;
    });
    return acc;
  }, {});
  const MOBILE_DRAWER_MODE_ORDER = Object.freeze(['peek', 'full']);
  const MOBILE_DRAWER_DEFAULT_MODE = 'full';
  const MOBILE_DRAWER_PEEK_HEIGHT_OFFSET = 3;
  const MOBILE_TAB_DRAWER_MODE = Object.freeze({
    tools: 'full',
    color: 'full',
    frames: 'full',
    settings: 'full',
    file: 'full',
    pixfind: 'full',
  });

  const ZOOM_STEPS = Object.freeze([
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
    24,
    28,
    30,
    32,
    40,
  ]);
  const MIN_ZOOM_SCALE = ZOOM_STEPS[0];
  const MAX_ZOOM_SCALE = ZOOM_STEPS[ZOOM_STEPS.length - 1];
  const ZOOM_WHEEL_STEP_BASE = 1.25;
  const ZOOM_EPSILON = 1e-6;
  const ZOOM_INDICATOR_TIMEOUT = 1800;
  const DEFAULT_IMPORT_FRAME_DURATION = 1000 / 12;
  const IMPORT_FRAME_DURATION_MIN_MS = 16;
  const IMPORT_FRAME_DURATION_MAX_MS = 2000;

  const DEFAULT_CANVAS_SIZE = 32;
  const MIN_CANVAS_SIZE = 1;
  const MAX_CANVAS_SIZE = 512;
  const MAX_IMAGE_IMPORT_SOURCE_SIZE = 2000;
  const PROJECT_FILE_EXTENSION = '.pixieedraw';
  const EMBED_CONFIG = parseEmbedConfig();
  const DEFAULT_DOCUMENT_BASENAME = EMBED_CONFIG.documentName
    ? String(EMBED_CONFIG.documentName).trim()
    : '新規ドキュメント';
  const DEFAULT_DOCUMENT_NAME = `${DEFAULT_DOCUMENT_BASENAME}${PROJECT_FILE_EXTENSION}`;
  const MAX_IMPORTED_PALETTE_COLORS = 256;
  const MAX_EXPORT_DIMENSION = 2000;
  const MAX_EXPORT_SCALE_OPTIONS = MAX_EXPORT_DIMENSION;
  const MAX_SELECTION_CANVAS_DIMENSION = 8192;
  const TARGET_EXPORT_OUTPUT_SIZE = 640;

  function parseEmbedConfig() {
    const raw =
      typeof window !== 'undefined' &&
      window.PIXIEEDRAW_EMBED_CONFIG &&
      typeof window.PIXIEEDRAW_EMBED_CONFIG === 'object' &&
      !Array.isArray(window.PIXIEEDRAW_EMBED_CONFIG)
        ? { ...window.PIXIEEDRAW_EMBED_CONFIG }
        : {};

    let params = null;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (error) {
      params = null;
    }

    const normalizeDim = value => {
      const num = Math.round(Number(value));
      return Number.isFinite(num) ? clamp(num, MIN_CANVAS_SIZE, MAX_CANVAS_SIZE) : null;
    };

    const setDim = (key, value) => {
      const dim = normalizeDim(value);
      if (dim !== null) {
        raw[key] = dim;
      }
    };

    if (params) {
      const sizeParam = params.get('size');
      if (sizeParam && /^\d+x\d+$/i.test(sizeParam)) {
        const [w, h] = sizeParam.toLowerCase().split('x');
        setDim('initialWidth', w);
        setDim('initialHeight', h);
      }
      setDim('initialWidth', params.get('width') ?? params.get('w'));
      setDim('initialHeight', params.get('height') ?? params.get('h'));
      const lockParam = params.get('lockSize') ?? params.get('lockCanvas') ?? params.get('lock');
      if (lockParam === '1' || lockParam === 'true') {
        raw.lockCanvasSize = true;
      }
      const skipParam = params.get('skipStartup') ?? params.get('embed');
      if (skipParam === '1' || skipParam === 'true') {
        raw.skipStartup = true;
      }
      const nameParam = params.get('name') ?? params.get('title');
      if (nameParam) {
        raw.documentName = nameParam;
      }
    }

    const normalizedWidth = normalizeDim(raw.initialWidth ?? raw.width);
    const normalizedHeight = normalizeDim(raw.initialHeight ?? raw.height ?? normalizedWidth);

    const normalized = {};
    if (normalizedWidth !== null) {
      normalized.initialWidth = normalizedWidth;
    }
    if (normalizedHeight !== null) {
      normalized.initialHeight = normalizedHeight;
    }
    if (typeof raw.documentName === 'string') {
      normalized.documentName = raw.documentName.trim();
    }
    if (raw.lockCanvasSize === 'true') {
      normalized.lockCanvasSize = true;
    } else if (typeof raw.lockCanvasSize === 'boolean') {
      normalized.lockCanvasSize = raw.lockCanvasSize;
    }
    if (raw.skipStartup === 'true') {
      normalized.skipStartup = true;
    } else if (typeof raw.skipStartup === 'boolean') {
      normalized.skipStartup = raw.skipStartup;
    }
    return normalized;
  }

  const layoutMap = {
    tools: { desktop: dom.leftTabPanes || dom.leftRail, mobile: dom.mobilePanels.tools },
    color: { desktop: dom.leftTabPanes || dom.leftRail, mobile: dom.mobilePanels.color },
    frames: { desktop: dom.rightTabPanes || dom.rightRail, mobile: dom.mobilePanels.frames },
    settings: { desktop: dom.rightTabPanes || dom.rightRail, mobile: dom.mobilePanels.settings },
    file: { desktop: dom.rightTabPanes || dom.rightRail, mobile: dom.mobilePanels.file },
    pixfind: { desktop: dom.rightTabPanes || dom.rightRail, mobile: dom.mobilePanels.pixfind },
  };

  const canvasControlsDefaultParent = dom.canvasControls?.parentElement || null;
  const canvasControlsDefaultNextSibling = dom.canvasControls?.nextSibling || null;

  const ctx = {
    drawing: dom.canvases.drawing?.getContext('2d', { willReadFrequently: true }) || null,
    overlay: dom.canvases.overlay?.getContext('2d', { willReadFrequently: true }) || null,
    selection: dom.canvases.selection?.getContext('2d', { willReadFrequently: true }) || null,
    virtual: dom.canvases.virtualCursor?.getContext('2d') || null,
  };

  let selectionDisplayScale = MIN_ZOOM_SCALE;
  let selectionRenderScale = MIN_ZOOM_SCALE;

  if (ctx.drawing) {
    ctx.drawing.imageSmoothingEnabled = false;
  }
  if (ctx.overlay) {
    ctx.overlay.imageSmoothingEnabled = false;
  }
  if (ctx.selection) {
    ctx.selection.imageSmoothingEnabled = false;
  }
  if (ctx.virtual) {
    ctx.virtual.imageSmoothingEnabled = true;
  }

  const SESSION_STORAGE_KEY = 'pixieedraw:sessionState';
  const STARTUP_SCREEN_DISMISSED_KEY = 'pixieedraw:startupScreenDismissed';
  const canUseSessionStorage = (() => {
    try {
      return typeof window !== 'undefined' && 'localStorage' in window && window.localStorage !== null;
    } catch (error) {
      return false;
    }
  })();
  let sessionPersistHandle = null;
  const AUTOSAVE_SUPPORTED = typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'indexedDB' in window;
  const SUPPORTS_ANCHOR_DOWNLOAD =
    typeof HTMLAnchorElement !== 'undefined' && 'download' in HTMLAnchorElement.prototype;
  const CAN_USE_WEB_SHARE =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    typeof File === 'function';
  const SHARE_HASHTAG = '#PiXiEED';
  const IS_IOS_DEVICE =
    typeof navigator !== 'undefined' && /iphone|ipod|ipad/i.test((navigator.userAgent || '').toLowerCase());
  const IS_ANDROID_LINE_BROWSER =
    typeof navigator !== 'undefined'
    && /android/i.test(navigator.userAgent || '')
    && /line\//i.test(navigator.userAgent || '');
  const IOS_SNAPSHOT_SUPPORTED =
    IS_IOS_DEVICE && typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined' && window.indexedDB !== null;
  const IOS_SNAPSHOT_DB_NAME = 'pixieedraw-ios-snapshots';
  const IOS_SNAPSHOT_DB_VERSION = 1;
  const IOS_SNAPSHOT_STORE_NAME = 'snapshots';
  const IOS_SNAPSHOT_KEY = 'latest';
  const IOS_SNAPSHOT_WRITE_DELAY = 60 * 1000;
  const IOS_SNAPSHOT_COMPRESSION_THRESHOLD = 32 * 1024;
  const textCompression = createTextCompression();
  const LENS_IMPORT_SESSION_FLAG = 'pixiee-lens:import-request';
  let lensImportRequested = (() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('lens') === '1') {
        setLensImportSessionFlag();
        return true;
      }
    } catch (error) {
      return false;
    }
    if (canUseSessionStorage) {
      try {
        return window.sessionStorage.getItem(LENS_IMPORT_SESSION_FLAG) === '1';
      } catch (error) {
        return false;
      }
    }
    return false;
  })();
  const AUTOSAVE_DB_NAME = 'pixieedraw-autosave';
  const AUTOSAVE_DB_VERSION = 2;
  const AUTOSAVE_STORE_NAME = 'handles';
  const RECENT_PROJECTS_STORE = 'recentProjects';
  const AUTOSAVE_HANDLE_KEY = 'document';
  const AUTOSAVE_WRITE_DELAY = 1000;
  const RECENT_PROJECT_LIMIT = 12;
  const THUMBNAIL_MAX_EDGE = 144;
  const THUMBNAIL_CANVAS_SIZE = 160;
  const DOCUMENT_FILE_VERSION = 1;
  const LENS_IMPORT_STORAGE_KEY = 'pixiee-lens:pending-draw-import';
  const PIXFIND_UPLOAD_KEY = 'pixfind_creator_upload_v1';
  function upgradeAutosaveDatabase(db) {
    if (!db) return;
    if (!db.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
      db.createObjectStore(AUTOSAVE_STORE_NAME);
    }
    if (!db.objectStoreNames.contains(RECENT_PROJECTS_STORE)) {
      db.createObjectStore(RECENT_PROJECTS_STORE);
    }
  }

  function openAutosaveDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        upgradeAutosaveDatabase(db);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }
  let autosaveHandle = null;
  let pendingAutosaveHandle = null;
  let autosavePermissionListener = null;
  let autosaveWriteTimer = null;
  let autosaveRestoring = false;
  let autosaveDirty = false;
  let iosSnapshotDbPromise = null;
  let iosSnapshotDirty = false;
  let iosSnapshotTimer = null;
  let iosSnapshotRestoring = false;
  let iosSnapshotInitialized = false;
  let iosSnapshotUnloadListenerBound = false;
  const brushOffsetCache = new Map();
  let exportScale = 1;
  let exportSheetInfo = null;
  let exportMaxScale = 1;
  let exportScaleUserOverride = false;
  let exportIncludeOriginalSize = false;
  let exportAdRequested = false;
  let pixfindModeEnabled = false;
  let pixfindModeFirstEnableConfirmed = false;
  let pixfindBaseSnapshot = null;

  const RAIL_DEFAULT_WIDTH = Object.freeze({ left: 78, right: 78 });
  const RAIL_MIN_WIDTH = 68;
  const RAIL_MAX_WIDTH = 440;
  const RAIL_COMPACT_THRESHOLD = Object.freeze({ left: 132, right: 168 });
  const railSizing = {
    left: RAIL_DEFAULT_WIDTH.left,
    right: RAIL_DEFAULT_WIDTH.right,
    activeSide: null,
    pointerId: null,
    startClientX: 0,
    startWidth: 0,
    captureTarget: null,
  };
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
  const TRANSPARENT_TILE_SIZE = 8;
  const BRUSH_TOOLS = new Set(['pen', 'eraser']);
  const VIRTUAL_CURSOR_SUPPORTED_TOOLS = new Set([
    'pen',
    'eraser',
    'line',
    'rect',
    'rectFill',
    'ellipse',
    'ellipseFill',
    'selectRect',
    'selectLasso',
    'curve',
  ]);
  const VIRTUAL_CURSOR_SHAPE_TOOLS = new Set(['line', 'rect', 'rectFill', 'ellipse', 'ellipseFill']);
  const VIRTUAL_CURSOR_SELECTION_TOOLS = new Set(['selectRect', 'selectLasso']);
  const FILL_TOOLS = new Set(['fill']);
  const SHAPE_TOOLS = new Set(['line', 'curve', 'rect', 'rectFill', 'ellipse', 'ellipseFill']);
  const SELECTION_TOOLS = new Set(['move', 'selectRect', 'selectLasso', 'selectSame', 'selectionMove', 'layerMove']);
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
  };
  const FLOATING_DRAW_BUTTON_SCALE_VALUES = [1, 1.5, 2];
  const DEFAULT_FLOATING_DRAW_BUTTON_SCALE = 2;
  let lockedCanvasWidth = null;
  let lockedCanvasHeight = null;
  const state = createInitialState();
  if (EMBED_CONFIG.lockCanvasSize) {
    lockedCanvasWidth = state.width;
    lockedCanvasHeight = state.height;
  }
  let virtualCursor = createInitialVirtualCursor(state);
  const virtualCursorControl = {
    pointerId: null,
    pointerType: null,
    captureElement: null,
    startClient: null,
    baseCursor: null,
  };
  let mouseInsideViewport = false;
  const floatingDrawButtonState = {
    position: { x: 16, y: 16 },
    pointerId: null,
    pointerType: null,
    dragging: false,
    startPointer: null,
    startPosition: null,
    startCursorCell: null,
    drawSessionStarted: false,
    drawMoved: false,
    initialized: false,
    scale: DEFAULT_FLOATING_DRAW_BUTTON_SCALE,
  };
  const virtualCursorDrawState = {
    active: false,
    historyStarted: false,
    lastPosition: null,
    tool: null,
    startPosition: null,
    currentPosition: null,
    path: [],
    points: [],
    selectionClearedOnStart: false,
    curveStage: null,
  };
  let drawButtonResizeListenerBound = false;
  let compactToolFlyoutDismissBound = false;
  let compactToolFlyoutPositionBound = false;
  let compactRightFlyoutDismissBound = false;
  let compactRightFlyoutPositionBound = false;
  const mobileToolGridPortal = {
    active: false,
    parent: null,
    nextSibling: null,
  };
  const compactRightFlyoutPortal = {
    active: false,
    section: null,
    parent: null,
    nextSibling: null,
  };
  const mobileDrawerState = {
    mode: MOBILE_DRAWER_DEFAULT_MODE,
    heights: {
      peek: 127,
      half: 320,
      full: 320,
    },
    drag: {
      active: false,
      pointerId: null,
      startY: 0,
      startHeight: 0,
      currentHeight: 0,
      moved: false,
    },
  };
  const toolIconCache = new Map();
  let startupVisible = false;
  let startupVirtualCursorState = null;
  restoreSessionState();
  state.colorMode = 'index';
  updateGridDecorations();
  const pointerState = createPointerState();
  if (canUseSessionStorage) {
    window.addEventListener('beforeunload', persistSessionState);
  }
  let hoverPixel = null;
  let zoomIndicatorTimeoutId = null;
  let overlayNeedsRedraw = true;
  const recentProjectsCache = new Map();
  const SELECTION_DASH_SPEED = 40;
  let selectionDashScreenOffset = 0;
  let lastSelectionDashTime = 0;
  const history = { past: [], future: [], pending: null, limit: 20 };
  let historyTrimmedRecently = false;
  let historyTrimmedAt = 0;
  const EMPTY_FILL_PREVIEW_PIXELS = Object.freeze([]);
  const fillPreviewCache = { contextKey: null, byPixel: null };
  const selectionMaskCacheIds = new WeakMap();
  let selectionMaskCacheIdCounter = 1;
  const HISTORY_DRAW_TOOLS = new Set(['pen', 'eraser', 'line', 'curve', 'rect', 'rectFill', 'ellipse', 'ellipseFill', 'fill']);
  const MEMORY_MONITOR_INTERVAL = 2000;
  const MEMORY_WARNING_DEFAULT = 250 * 1024 * 1024;
  const DRAW_BUTTON_DRAG_THRESHOLD = 6;
  const DRAW_BUTTON_DRAG_THRESHOLD_TOUCH = 12;
  const TIMELINE_CELL_SIZE = 32;
  const TIMELINE_CELL_VARIANTS = {
    corner: { fill: 'rgba(16, 22, 32, 0.94)', border: 'rgba(210, 220, 240, 0.45)' },
    frameHeader: { fill: 'rgba(18, 26, 38, 0.9)', border: 'rgba(160, 172, 190, 0.45)' },
    frameHeaderActive: { fill: 'rgba(88, 196, 255, 0.3)', border: 'rgba(88, 196, 255, 0.7)' },
    layer: { fill: 'rgba(18, 26, 38, 0.9)', border: 'rgba(160, 172, 190, 0.45)' },
    layerActive: { fill: 'rgba(88, 196, 255, 0.26)', border: 'rgba(88, 196, 255, 0.68)' },
    layerPlaceholder: { fill: 'rgba(12, 16, 24, 0.6)', border: 'rgba(130, 142, 162, 0.45)' },
    layerHidden: { fill: 'rgba(26, 32, 44, 0.7)', border: 'rgba(118, 128, 148, 0.45)' },
    layerActiveHidden: { fill: 'rgba(70, 100, 132, 0.6)', border: 'rgba(118, 128, 148, 0.6)' },
    body: { fill: 'rgba(12, 16, 24, 0.7)', border: 'rgba(96, 108, 128, 0.42)' },
    bodyActiveRow: { fill: 'rgba(88, 196, 255, 0.18)', border: 'rgba(88, 196, 255, 0.55)' },
    bodyActiveColumn: { fill: 'rgba(88, 196, 255, 0.16)', border: 'rgba(88, 196, 255, 0.5)' },
    bodyActiveCell: { fill: 'rgba(88, 196, 255, 0.32)', border: 'rgba(88, 196, 255, 0.75)' },
    bodyEmpty: { fill: 'rgba(9, 13, 19, 0.55)', border: 'rgba(112, 124, 146, 0.42)' },
    bodyHidden: { fill: 'rgba(20, 26, 36, 0.62)', border: 'rgba(112, 124, 146, 0.46)' },
  };
  const TIMELINE_SLOT_VARIANTS = {
    default: { fill: 'rgba(16, 22, 30, 0.78)', border: 'rgba(136, 148, 168, 0.55)' },
    active: { fill: 'rgba(88, 196, 255, 0.38)', border: 'rgba(88, 196, 255, 0.75)' },
    hidden: { fill: 'rgba(14, 18, 26, 0.55)', border: 'rgba(120, 130, 150, 0.45)' },
    disabled: { fill: 'rgba(9, 13, 19, 0.48)', border: 'rgba(96, 108, 128, 0.4)' },
  };
  const TIMELINE_BUTTON_VARIANTS = {
    add: { fill: 'rgba(88, 196, 255, 0.3)', border: 'rgba(88, 196, 255, 0.7)' },
    remove: { fill: 'rgba(255, 107, 107, 0.32)', border: 'rgba(255, 130, 130, 0.68)' },
    playback: { fill: 'rgba(120, 150, 190, 0.28)', border: 'rgba(184, 200, 224, 0.6)' },
    playbackActive: { fill: 'rgba(88, 196, 255, 0.36)', border: 'rgba(88, 196, 255, 0.78)' },
    stop: { fill: 'rgba(255, 156, 126, 0.32)', border: 'rgba(255, 181, 152, 0.72)' },
  };
  let memoryMonitorHandle = null;
  let toolButtons = [];
  let renderScheduled = false;
  let layoutMode = null;
  let playbackHandle = null;
  let lastFrameTime = 0;
  let curveBuilder = null;
  let paletteWheelCtx = null;
  let canvasWheelListenerBound = false;
  const paletteEditorState = {
    hsv: { h: 0, s: 0, v: 1, a: 255 },
    wheelPointer: { active: false, pointerId: null, upHandler: null },
  };
  let dirtyRegion = null;
  let canvasControlMode = 'zoom';

  function makeIcon(name, fallback, opts = {}) {
    const img = new Image(opts.width || 24, opts.height || 24);
    img.src = `assets/icons/${name}.svg`;
    img.alt = fallback;
    img.width = opts.width || 24;
    img.height = opts.height || 24;
    return img;
  }

  function createInitialState(options = {}) {
    const preferredWidth = EMBED_CONFIG.initialWidth ?? EMBED_CONFIG.width ?? DEFAULT_CANVAS_SIZE;
    const preferredHeight =
      EMBED_CONFIG.initialHeight ?? EMBED_CONFIG.height ?? EMBED_CONFIG.initialWidth ?? DEFAULT_CANVAS_SIZE;
    const {
      width: requestedWidth = preferredWidth,
      height: requestedHeight = preferredHeight,
      name: requestedName = DEFAULT_DOCUMENT_NAME,
    } = options || {};
    const width = clamp(
      Math.round(Number(requestedWidth) || preferredWidth || DEFAULT_CANVAS_SIZE),
      MIN_CANVAS_SIZE,
      MAX_CANVAS_SIZE
    );
    const height = clamp(
      Math.round(Number(requestedHeight) || preferredHeight || DEFAULT_CANVAS_SIZE),
      MIN_CANVAS_SIZE,
      MAX_CANVAS_SIZE
    );
    const palette = [
      { r: 0, g: 0, b: 0, a: 0 },
      { r: 20, g: 20, b: 20, a: 255 },
      { r: 88, g: 196, b: 255, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 255, g: 96, b: 96, a: 255 },
    ];
    const layers = [createLayer('レイヤー 1', width, height)];
    const frames = [createFrame('フレーム 1', layers, width, height)];

    return {
      width,
      height,
      scale: normalizeZoomScale(8, 8),
      pan: { x: 0, y: 0 },
      tool: 'pen',
      brushSize: 1,
      showGrid: true,
      showPixelGuides: true,
      showVirtualCursor: false,
      virtualCursorButtonScale: DEFAULT_FLOATING_DRAW_BUTTON_SCALE,
      showMajorGrid: true,
      gridScreenStep: 8,
      majorGridSpacing: 16,
      backgroundMode: 'dark',
      activeToolGroup: 'pen',
      lastGroupTool: { ...DEFAULT_GROUP_TOOL },
      activeLeftTab: 'tools',
      activeRightTab: 'frames',
      showChecker: true,
      colorMode: 'index',
      palette,
      activePaletteIndex: 2,
      activeRgb: { r: 88, g: 196, b: 255, a: 255 },
      frames,
      activeFrame: 0,
      activeLayer: frames[0].layers[0].id,
      selectionMask: null,
      selectionBounds: null,
      pendingPasteMoveState: null,
      playback: { isPlaying: false, lastFrame: 0 },
      documentName: normalizeDocumentName(requestedName),
    };
  }

  function createInitialVirtualCursor(source = state) {
    const width = Math.max(1, Math.floor(Number(source?.width) || DEFAULT_CANVAS_SIZE));
    const height = Math.max(1, Math.floor(Number(source?.height) || DEFAULT_CANVAS_SIZE));
    const centerX = Math.min(width - 1, Math.max(0, Math.floor(width / 2)));
    const centerY = Math.min(height - 1, Math.max(0, Math.floor(height / 2)));
    return { x: centerX, y: centerY };
  }

  function createLayer(name, width, height) {
    const size = width * height;
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `layer-${Math.random().toString(36).slice(2)}`,
      name,
      visible: true,
      opacity: 1,
      indices: new Int16Array(size).fill(-1),
      direct: null,
    };
  }

  function ensureLayerDirect(layer, width = state.width, height = state.height) {
    const length = Math.max(0, Math.floor(width) || 0) * Math.max(0, Math.floor(height) || 0) * 4;
    if (!(layer.direct instanceof Uint8ClampedArray) || layer.direct.length !== length) {
      layer.direct = new Uint8ClampedArray(length);
    }
    return layer.direct;
  }

  function cloneLayer(baseLayer, width, height) {
    const size = width * height;
    const layer = {
      id: crypto.randomUUID ? crypto.randomUUID() : `layer-${Math.random().toString(36).slice(2)}`,
      name: baseLayer.name,
      visible: baseLayer.visible,
      opacity: baseLayer.opacity,
      indices: new Int16Array(size),
      direct: null,
    };
    layer.indices.set(baseLayer.indices);
    if (baseLayer.direct instanceof Uint8ClampedArray) {
      const direct = ensureLayerDirect(layer, width, height);
      direct.set(baseLayer.direct);
    }
    return layer;
  }

  function createFrame(name, layers, width, height) {
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `frame-${Math.random().toString(36).slice(2)}`,
      name,
      duration: 1000 / 12,
      layers: layers.map(layer => cloneLayer(layer, width ?? state.width, height ?? state.height)),
    };
  }

  function createPointerState() {
    return {
      active: false,
      pointerId: null,
      tool: null,
      start: null,
      current: null,
      last: null,
      path: [],
      preview: null,
      selectionPreview: null,
      selectionMove: null,
      selectionClearedOnDown: false,
      startClient: null,
      panOrigin: { x: 0, y: 0 },
      panMode: null,
      touchPanStart: null,
      touchPinchStartDistance: null,
      touchPinchStartScale: null,
      curveHandle: null,
      panCaptureElement: null,
    };
  }

  const internalClipboard = {
    selection: null,
  };

  const TOUCH_PAN_MIN_POINTERS = 2;
  const TOUCH_PINCH_SENSITIVITY = 1.45;
  const TOUCH_PINCH_DEADZONE_RATIO = 0.008;
  const TOUCH_PINCH_MAX_STEP_RATIO = 1.18;
  const TOUCH_PINCH_MIN_RATIO = 0.05;
  const activeTouchPointers = new Map();
  const keyboardState = {
    spacePanActive: false,
  };
  let lastSingleTouchClientY = null;
  let editableTouchSession = false;
  let softKeyboardBaselineViewportHeight = 0;
  let lastSoftKeyboardFocusAt = 0;
  let softKeyboardFocusGuardBound = false;

  function handleGlobalTouchPointerEnd(event) {
    if (event.pointerType !== 'touch') {
      return;
    }
    activeTouchPointers.delete(event.pointerId);
  }

  window.addEventListener('pointerup', handleGlobalTouchPointerEnd, { passive: true });
  window.addEventListener('pointercancel', handleGlobalTouchPointerEnd, { passive: true });
  window.addEventListener('blur', () => {
    activeTouchPointers.clear();
    lastSingleTouchClientY = null;
  });

  function getScrollableAncestor(node) {
    let current = node instanceof Element ? node : null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      const canScrollY = (style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 1;
      if (canScrollY) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function isEditableTouchTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(
      target.closest(
        'input, textarea, select, [contenteditable="true"], [contenteditable=""], [contenteditable]'
      )
    );
  }

  function isSoftKeyboardInputTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    if (target instanceof HTMLTextAreaElement) {
      return true;
    }
    if (target instanceof HTMLInputElement) {
      const type = String(target.type || 'text').toLowerCase();
      return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
    }
    return Boolean(target.isContentEditable);
  }

  function shouldAllowNativeTouchMove(event) {
    if (editableTouchSession) {
      return true;
    }
    if (isEditableTouchTarget(document.activeElement)) {
      return true;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (!target) {
      return false;
    }
    if (isEditableTouchTarget(target) || target.closest('input[type="range"]')) {
      return true;
    }
    const scrollable = getScrollableAncestor(target);
    if (!scrollable) {
      return false;
    }
    if (!event.touches || event.touches.length !== 1) {
      return false;
    }
    const touch = event.touches[0];
    if (!touch) {
      return false;
    }
    const currentY = touch.clientY;
    if (!Number.isFinite(currentY) || !Number.isFinite(lastSingleTouchClientY)) {
      lastSingleTouchClientY = currentY;
      return true;
    }
    const deltaY = currentY - lastSingleTouchClientY;
    const atTop = scrollable.scrollTop <= 0;
    const atBottom = scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;
    // Block rubber-band overscroll at boundaries to avoid browser pull/close gestures.
    if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
      return false;
    }
    return true;
  }

  window.addEventListener('touchstart', (event) => {
    const startTarget = event.target instanceof Element ? event.target : null;
    editableTouchSession = Boolean(startTarget && isEditableTouchTarget(startTarget));
    if (!event.touches || event.touches.length !== 1) {
      lastSingleTouchClientY = null;
      return;
    }
    const touch = event.touches[0];
    lastSingleTouchClientY = touch ? touch.clientY : null;
  }, { passive: true });

  window.addEventListener('touchmove', (event) => {
    if (shouldAllowNativeTouchMove(event)) {
      if (event.touches && event.touches.length === 1) {
        const touch = event.touches[0];
        lastSingleTouchClientY = touch ? touch.clientY : lastSingleTouchClientY;
      } else {
        lastSingleTouchClientY = null;
      }
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const shouldGuardCanvasGesture = Boolean(
      target
      && (
        (dom.canvasViewport && dom.canvasViewport.contains(target))
        || (dom.stage && dom.stage.contains(target))
        || (dom.mobileDrawerHandle && dom.mobileDrawerHandle.contains(target))
      )
    );
    if (!shouldGuardCanvasGesture) {
      return;
    }
    event.preventDefault();
  }, { passive: false });

  window.addEventListener('touchend', () => {
    if (!document.activeElement || !isEditableTouchTarget(document.activeElement)) {
      editableTouchSession = false;
    }
    if (activeTouchPointers.size === 0) {
      lastSingleTouchClientY = null;
    }
  }, { passive: true });

  window.addEventListener('touchcancel', () => {
    lastSingleTouchClientY = null;
    editableTouchSession = false;
  }, { passive: true });

  function isEditableTarget(target) {
    return Boolean(
      target &&
      (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
    );
  }

  function makeHistorySnapshot({ includeUiState = true, includeSelection = true, clonePixelData = true } = {}) {
    const snapshot = {
      width: state.width,
      height: state.height,
      scale: state.scale,
      pan: { x: state.pan.x, y: state.pan.y },
      palette: state.palette.map(color => ({ ...color })),
      activePaletteIndex: state.activePaletteIndex,
      activeRgb: { ...state.activeRgb },
      frames: state.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
          layers: frame.layers.map(layer => ({
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            opacity: layer.opacity,
            indices: clonePixelData ? new Int16Array(layer.indices) : layer.indices,
            direct: layer.direct instanceof Uint8ClampedArray
              ? (clonePixelData ? new Uint8ClampedArray(layer.direct) : layer.direct)
              : null,
          })),
        })),
      showGrid: state.showGrid,
      showMajorGrid: state.showMajorGrid,
      gridScreenStep: state.gridScreenStep,
      majorGridSpacing: state.majorGridSpacing,
      backgroundMode: state.backgroundMode,
      showPixelGuides: state.showPixelGuides,
      showVirtualCursor: state.showVirtualCursor,
      showChecker: state.showChecker,
      documentName: state.documentName,
    };

    if (includeSelection) {
      snapshot.activeFrame = state.activeFrame;
      snapshot.activeLayer = state.activeLayer;
      if (state.selectionMask) {
        snapshot.selectionMask = new Uint8Array(state.selectionMask);
      }
      if (state.selectionBounds) {
        snapshot.selectionBounds = { ...state.selectionBounds };
      }
    }

    if (includeUiState) {
      snapshot.tool = state.tool;
      snapshot.brushSize = state.brushSize;
      snapshot.colorMode = state.colorMode;
      snapshot.activeToolGroup = state.activeToolGroup;
      snapshot.lastGroupTool = { ...(state.lastGroupTool || DEFAULT_GROUP_TOOL) };
      snapshot.activeLeftTab = state.activeLeftTab;
      snapshot.activeRightTab = state.activeRightTab;
      snapshot.playback = { ...state.playback };
    }

    applyPendingSelectionMoveToSnapshot(snapshot, { includeSelection, clonePixelData });
    return snapshot;
  }

  function applyPendingSelectionMoveToSnapshot(snapshot, { includeSelection = true, clonePixelData = true } = {}) {
    if (!snapshot || !clonePixelData) {
      return;
    }
    const moveState = getPendingSelectionMoveState();
    if (!moveState || !moveState.hasCleared || !moveState.bounds || !Array.isArray(snapshot.frames) || !snapshot.frames.length) {
      return;
    }
    const width = Math.max(1, Number(snapshot.width) || 0);
    const height = Math.max(1, Number(snapshot.height) || 0);
    const pixelCount = width * height;
    if (!pixelCount) {
      return;
    }

    const moveLayerId = typeof moveState.layerId === 'string' && moveState.layerId
      ? moveState.layerId
      : (typeof moveState.layer?.id === 'string' ? moveState.layer.id : null);

    const frameCount = snapshot.frames.length;
    const activeFrameIndex = clamp(Math.round(Number(snapshot.activeFrame) || 0), 0, frameCount - 1);
    const candidateFrameIndexes = [activeFrameIndex];
    for (let i = 0; i < frameCount; i += 1) {
      if (i !== activeFrameIndex) {
        candidateFrameIndexes.push(i);
      }
    }

    let targetFrameIndex = -1;
    let targetLayer = null;
    for (let i = 0; i < candidateFrameIndexes.length; i += 1) {
      const frameIndex = candidateFrameIndexes[i];
      const frame = snapshot.frames[frameIndex];
      if (!frame || !Array.isArray(frame.layers) || !frame.layers.length) {
        continue;
      }
      if (moveLayerId) {
        const matched = frame.layers.find(layer => layer?.id === moveLayerId);
        if (matched) {
          targetFrameIndex = frameIndex;
          targetLayer = matched;
          break;
        }
      }
      if (frameIndex === activeFrameIndex) {
        const activeLayerId = typeof snapshot.activeLayer === 'string' ? snapshot.activeLayer : null;
        const fallback = (activeLayerId && frame.layers.find(layer => layer?.id === activeLayerId))
          || frame.layers[frame.layers.length - 1];
        if (fallback) {
          targetFrameIndex = frameIndex;
          targetLayer = fallback;
          if (!moveLayerId) {
            break;
          }
        }
      }
    }

    if (!targetLayer || targetFrameIndex < 0) {
      return;
    }

    const sourceMask = moveState.mask instanceof Uint8Array ? moveState.mask : null;
    const sourceIndices = moveState.indices instanceof Int16Array ? moveState.indices : null;
    const sourceDirect = moveState.direct instanceof Uint8ClampedArray ? moveState.direct : null;
    const moveWidth = Math.max(0, Number(moveState.width) || 0);
    const moveHeight = Math.max(0, Number(moveState.height) || 0);
    if (!sourceMask || !sourceIndices || moveWidth <= 0 || moveHeight <= 0) {
      return;
    }
    if (sourceMask.length !== moveWidth * moveHeight || sourceIndices.length !== moveWidth * moveHeight) {
      return;
    }

    let targetIndices = targetLayer.indices instanceof Int16Array ? targetLayer.indices : null;
    if (!targetIndices || targetIndices.length !== pixelCount) {
      targetIndices = new Int16Array(pixelCount);
      if (targetLayer.indices && targetLayer.indices.length === pixelCount) {
        targetIndices.set(targetLayer.indices);
      }
      targetLayer.indices = targetIndices;
    }

    let targetDirect = targetLayer.direct instanceof Uint8ClampedArray ? targetLayer.direct : null;
    if (sourceDirect && (!targetDirect || targetDirect.length !== pixelCount * 4)) {
      const nextDirect = new Uint8ClampedArray(pixelCount * 4);
      if (targetDirect && targetDirect.length === pixelCount * 4) {
        nextDirect.set(targetDirect);
      }
      targetDirect = nextDirect;
      targetLayer.direct = targetDirect;
    }

    const offsetX = Math.round(Number(moveState.offset?.x) || 0);
    const offsetY = Math.round(Number(moveState.offset?.y) || 0);
    const originX = Math.round(Number(moveState.bounds.x0) || 0);
    const originY = Math.round(Number(moveState.bounds.y0) || 0);
    const newMask = new Uint8Array(pixelCount);
    const newBounds = { x0: width, y0: height, x1: -1, y1: -1 };
    let placed = false;

    for (let y = 0; y < moveHeight; y += 1) {
      for (let x = 0; x < moveWidth; x += 1) {
        const localIndex = y * moveWidth + x;
        if (sourceMask[localIndex] !== 1) {
          continue;
        }
        const targetX = originX + x + offsetX;
        const targetY = originY + y + offsetY;
        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) {
          continue;
        }
        const targetIndex = targetY * width + targetX;
        targetIndices[targetIndex] = sourceIndices[localIndex];
        if (targetDirect) {
          const targetBase = targetIndex * 4;
          if (sourceDirect && sourceDirect.length >= (localIndex * 4) + 4) {
            const localBase = localIndex * 4;
            targetDirect[targetBase] = sourceDirect[localBase];
            targetDirect[targetBase + 1] = sourceDirect[localBase + 1];
            targetDirect[targetBase + 2] = sourceDirect[localBase + 2];
            targetDirect[targetBase + 3] = sourceDirect[localBase + 3];
          } else {
            targetDirect[targetBase] = 0;
            targetDirect[targetBase + 1] = 0;
            targetDirect[targetBase + 2] = 0;
            targetDirect[targetBase + 3] = 0;
          }
        }
        newMask[targetIndex] = 1;
        if (!placed) {
          placed = true;
        }
        if (targetX < newBounds.x0) newBounds.x0 = targetX;
        if (targetY < newBounds.y0) newBounds.y0 = targetY;
        if (targetX > newBounds.x1) newBounds.x1 = targetX;
        if (targetY > newBounds.y1) newBounds.y1 = targetY;
      }
    }

    if (!includeSelection) {
      return;
    }

    if (placed && moveState.applySelectionOnFinalize !== false) {
      snapshot.selectionMask = newMask;
      snapshot.selectionBounds = newBounds;
      snapshot.activeFrame = targetFrameIndex;
      snapshot.activeLayer = targetLayer.id || snapshot.activeLayer;
    } else {
      snapshot.selectionMask = null;
      snapshot.selectionBounds = null;
    }
  }

  function encodeInt16Rle(view) {
    const length = view.length;
    if (length === 0) {
      return { type: 'int16-rle', length: 0, values: new Int16Array(0), counts: new Uint32Array(0) };
    }
    const values = [];
    const counts = [];
    let current = view[0];
    let count = 1;
    for (let i = 1; i < length; i += 1) {
      const value = view[i];
      if (value === current) {
        count += 1;
      } else {
        values.push(current);
        counts.push(count);
        current = value;
        count = 1;
      }
    }
    values.push(current);
    counts.push(count);
    const valueArray = new Int16Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
      valueArray[i] = values[i];
    }
    const countArray = new Uint32Array(counts.length);
    for (let i = 0; i < counts.length; i += 1) {
      countArray[i] = counts[i];
    }
    return { type: 'int16-rle', length, values: valueArray, counts: countArray };
  }

  function decodeInt16Data(source) {
    if (!source) {
      return new Int16Array(0);
    }
    if (source instanceof Int16Array) {
      return new Int16Array(source);
    }
    if (ArrayBuffer.isView(source) && source.BYTES_PER_ELEMENT === 2) {
      return new Int16Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
    }
    if (typeof source === 'object' && source.type === 'int16-rle') {
      const { length, values, counts } = source;
      const output = new Int16Array(length);
      let offset = 0;
      for (let i = 0; i < values.length; i += 1) {
        const runValue = values[i];
        const runLength = counts[i];
        output.fill(runValue, offset, offset + runLength);
        offset += runLength;
      }
      return output;
    }
    throw new Error('Unsupported Int16 encoding');
  }

  function encodeUint8Rle(view) {
    const length = view.length;
    if (length === 0) {
      return { type: 'uint8-rle', length: 0, values: new Uint8Array(0), counts: new Uint32Array(0) };
    }
    const values = [];
    const counts = [];
    let current = view[0];
    let count = 1;
    for (let i = 1; i < length; i += 1) {
      const value = view[i];
      if (value === current) {
        count += 1;
      } else {
        values.push(current);
        counts.push(count);
        current = value;
        count = 1;
      }
    }
    values.push(current);
    counts.push(count);
    const valueArray = new Uint8Array(values.length);
    for (let i = 0; i < values.length; i += 1) {
      valueArray[i] = values[i];
    }
    const countArray = new Uint32Array(counts.length);
    for (let i = 0; i < counts.length; i += 1) {
      countArray[i] = counts[i];
    }
    return { type: 'uint8-rle', length, values: valueArray, counts: countArray };
  }

  function decodeUint8Data(source, { clamped = false } = {}) {
    if (!source) {
      return clamped ? new Uint8ClampedArray(0) : new Uint8Array(0);
    }
    if (ArrayBuffer.isView(source) && source.BYTES_PER_ELEMENT === 1 && source.constructor !== Uint32Array) {
      const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
      return clamped ? new Uint8ClampedArray(buffer) : new Uint8Array(buffer);
    }
    if (typeof source === 'object' && source.type === 'uint8-rle') {
      const { length, values, counts } = source;
      const shouldClamp = Object.prototype.hasOwnProperty.call(source, 'clamped') ? Boolean(source.clamped) : clamped;
      const output = shouldClamp ? new Uint8ClampedArray(length) : new Uint8Array(length);
      let offset = 0;
      for (let i = 0; i < values.length; i += 1) {
        const runValue = values[i];
        const runLength = counts[i];
        output.fill(runValue, offset, offset + runLength);
        offset += runLength;
      }
      return output;
    }
    throw new Error('Unsupported Uint8 encoding');
  }

  function compressInt16Array(view) {
    if (!view) {
      return new Int16Array(0);
    }
    if (!(view instanceof Int16Array)) {
      view = new Int16Array(view);
    }
    const encoded = encodeInt16Rle(view);
    const encodedBytes = encoded.values.byteLength + encoded.counts.byteLength;
    if (encodedBytes >= view.byteLength) {
      return view.slice();
    }
    return encoded;
  }

  function compressUint8Array(view, { clamped = false } = {}) {
    if (!view) {
      return clamped ? new Uint8ClampedArray(0) : new Uint8Array(0);
    }
    const source = clamped && view instanceof Uint8ClampedArray ? view : new Uint8Array(view);
    const encoded = encodeUint8Rle(source);
    const encodedBytes = encoded.values.byteLength + encoded.counts.byteLength;
    const originalBytes = source.byteLength;
    if (encodedBytes >= originalBytes) {
      if (clamped) {
        return view instanceof Uint8ClampedArray ? view.slice() : new Uint8ClampedArray(source);
      }
      return source.slice ? source.slice() : new Uint8Array(source);
    }
    return { ...encoded, clamped: Boolean(clamped) };
  }

  function estimateEncodedByteLength(data, elementSize) {
    if (!data) return 0;
    if (ArrayBuffer.isView(data)) {
      return data.byteLength;
    }
    if (typeof data === 'object') {
      if (data.type === 'int16-rle' || data.type === 'uint8-rle') {
        const valuesBytes = data.values?.byteLength || 0;
        const countsBytes = data.counts?.byteLength || 0;
        return valuesBytes + countsBytes;
      }
      if (typeof data.length === 'number' && data.BYTES_PER_ELEMENT) {
        return data.length * data.BYTES_PER_ELEMENT;
      }
    }
    if (typeof data.length === 'number' && Number.isFinite(elementSize)) {
      return data.length * elementSize;
    }
    if (typeof data === 'string') {
      return data.length;
    }
    return 0;
  }

  function compressHistorySnapshot(snapshot) {
    if (!snapshot) return snapshot;
    const compressed = {
      width: snapshot.width,
      height: snapshot.height,
      scale: snapshot.scale,
      pan: { x: snapshot.pan.x, y: snapshot.pan.y },
      palette: snapshot.palette.map(color => ({ ...color })),
      activePaletteIndex: snapshot.activePaletteIndex,
      activeRgb: { ...snapshot.activeRgb },
      frames: snapshot.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
        layers: frame.layers.map(layer => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          indices: compressInt16Array(layer.indices),
          direct: layer.direct ? compressUint8Array(layer.direct, { clamped: true }) : null,
        })),
      })),
      showGrid: snapshot.showGrid,
      showMajorGrid: snapshot.showMajorGrid,
      gridScreenStep: snapshot.gridScreenStep,
      majorGridSpacing: snapshot.majorGridSpacing,
      backgroundMode: snapshot.backgroundMode,
      showPixelGuides: snapshot.showPixelGuides,
      showVirtualCursor: snapshot.showVirtualCursor,
      showChecker: snapshot.showChecker,
      documentName: snapshot.documentName,
    };
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeFrame')) {
      compressed.activeFrame = snapshot.activeFrame;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeLayer')) {
      compressed.activeLayer = snapshot.activeLayer;
    }
    if (snapshot.selectionMask) {
      compressed.selectionMask = compressUint8Array(snapshot.selectionMask, { clamped: false });
    }
    if (snapshot.selectionBounds) {
      compressed.selectionBounds = { ...snapshot.selectionBounds };
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'tool')) {
      compressed.tool = snapshot.tool;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'brushSize')) {
      compressed.brushSize = snapshot.brushSize;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'colorMode')) {
      compressed.colorMode = snapshot.colorMode;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeToolGroup')) {
      compressed.activeToolGroup = snapshot.activeToolGroup;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'lastGroupTool')) {
      compressed.lastGroupTool = { ...snapshot.lastGroupTool };
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeLeftTab')) {
      compressed.activeLeftTab = snapshot.activeLeftTab;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeRightTab')) {
      compressed.activeRightTab = snapshot.activeRightTab;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'playback')) {
      compressed.playback = { ...snapshot.playback };
    }
    return compressed;
  }

  function decompressHistorySnapshot(snapshot) {
    if (!snapshot) return snapshot;
    const decompressed = {
      width: snapshot.width,
      height: snapshot.height,
      scale: snapshot.scale,
      pan: { x: snapshot.pan.x, y: snapshot.pan.y },
      palette: snapshot.palette.map(color => ({ ...color })),
      activePaletteIndex: snapshot.activePaletteIndex,
      activeRgb: { ...snapshot.activeRgb },
      frames: snapshot.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
        layers: frame.layers.map(layer => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          indices: decodeInt16Data(layer.indices),
          direct: layer.direct ? decodeUint8Data(layer.direct, { clamped: true }) : null,
        })),
      })),
      showGrid: snapshot.showGrid,
      showMajorGrid: snapshot.showMajorGrid,
      gridScreenStep: snapshot.gridScreenStep,
      majorGridSpacing: snapshot.majorGridSpacing,
      backgroundMode: snapshot.backgroundMode,
      showPixelGuides: snapshot.showPixelGuides,
      showVirtualCursor: snapshot.showVirtualCursor,
      showChecker: snapshot.showChecker,
      documentName: snapshot.documentName,
    };
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeFrame')) {
      decompressed.activeFrame = snapshot.activeFrame;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeLayer')) {
      decompressed.activeLayer = snapshot.activeLayer;
    }
    if (snapshot.selectionMask) {
      decompressed.selectionMask = decodeUint8Data(snapshot.selectionMask, { clamped: false });
    }
    if (snapshot.selectionBounds) {
      decompressed.selectionBounds = { ...snapshot.selectionBounds };
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'tool')) {
      decompressed.tool = snapshot.tool;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'brushSize')) {
      decompressed.brushSize = snapshot.brushSize;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'colorMode')) {
      decompressed.colorMode = snapshot.colorMode;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeToolGroup')) {
      decompressed.activeToolGroup = snapshot.activeToolGroup;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'lastGroupTool')) {
      decompressed.lastGroupTool = { ...snapshot.lastGroupTool };
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeLeftTab')) {
      decompressed.activeLeftTab = snapshot.activeLeftTab;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeRightTab')) {
      decompressed.activeRightTab = snapshot.activeRightTab;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'playback')) {
      decompressed.playback = { ...snapshot.playback };
    }
    return decompressed;
  }

  function bytesForLayer(layer) {
    if (!layer) return 0;
    const indices = layer.indices;
    const direct = layer.direct;
    const indicesBytes = estimateEncodedByteLength(indices, 2);
    const directBytes = estimateEncodedByteLength(direct, 1);
    return indicesBytes + directBytes;
  }

  function estimateStateBytes() {
    let total = 0;
    state.frames.forEach(frame => {
      frame.layers.forEach(layer => {
        total += bytesForLayer(layer);
      });
    });
    if (state.selectionMask) {
      total += state.selectionMask.length;
    }
    total += state.palette.length * 16;
    return total;
  }

  function estimateSnapshotBytes(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return 0;
    let total = 0;
    if (Array.isArray(snapshot.frames)) {
      snapshot.frames.forEach(frame => {
        if (!frame || !Array.isArray(frame.layers)) return;
        frame.layers.forEach(layer => {
          total += bytesForLayer(layer);
        });
      });
    }
    if (snapshot.selectionMask) {
      total += estimateEncodedByteLength(snapshot.selectionMask, 1);
    }
    if (Array.isArray(snapshot.palette)) {
      total += snapshot.palette.length * 16;
    }
    return total;
  }

  function estimateHistoryBytes(list) {
    if (!Array.isArray(list)) return 0;
    return list.reduce((sum, snapshot) => sum + estimateSnapshotBytes(snapshot), 0);
  }

  function getMemoryUsageBreakdown() {
    const current = estimateStateBytes();
    const past = estimateHistoryBytes(history.past);
    const future = estimateHistoryBytes(history.future);
    const pending = history.pending && history.pending.before ? estimateSnapshotBytes(history.pending.before) : 0;
    return { current, past, future, pending, total: current + past + future + pending };
  }

  function trimHistoryForMemoryIfNeeded(breakdown) {
    if (!memoryThresholds || !Number.isFinite(memoryThresholds.warningBytes)) {
      return breakdown || getMemoryUsageBreakdown();
    }
    let usage = breakdown || getMemoryUsageBreakdown();
    if (usage.total <= memoryThresholds.warningBytes) {
      return usage;
    }
    let total = usage.total;
    const warning = memoryThresholds.warningBytes;
    let trimmed = false;
    while (total > warning && (history.past.length || history.future.length)) {
      let removed;
      if (history.future.length && history.future.length >= history.past.length) {
        removed = history.future.shift();
      } else {
        removed = history.past.shift();
      }
      total -= estimateSnapshotBytes(removed);
      trimmed = true;
    }
    if (trimmed) {
      updateHistoryButtons();
      autosaveDirty = true;
      scheduleAutosaveSnapshot();
      usage = getMemoryUsageBreakdown();
      history.limit = Math.max(5, Math.min(history.limit, Math.ceil(history.limit * 0.75)));
      while (history.past.length > history.limit) {
        history.past.shift();
      }
      while (history.future.length > history.limit) {
        history.future.shift();
      }
      historyTrimmedRecently = true;
      historyTrimmedAt = performance && typeof performance.now === 'function' ? performance.now() : Date.now();
    }
    return usage;
  }

  function computeMemoryThresholds() {
    let maxBytes = null;
    if (performance && performance.memory && Number.isFinite(performance.memory.jsHeapSizeLimit)) {
      maxBytes = performance.memory.jsHeapSizeLimit;
    } else if (navigator && Number.isFinite(navigator.deviceMemory)) {
      maxBytes = navigator.deviceMemory * 1024 * 1024 * 1024;
    }
    const warningBytes = maxBytes ? Math.floor(maxBytes * 0.7) : MEMORY_WARNING_DEFAULT;
    return { maxBytes, warningBytes };
  }

  const memoryThresholds = computeMemoryThresholds();

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
    if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
    if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
    return `${bytes} B`;
  }

  function updateMemoryStatus() {
    const usageNode = dom.controls.memoryUsage || document.getElementById('memoryUsage');
    if (!usageNode) return;
  let usage = getMemoryUsageBreakdown();
  usage = trimHistoryForMemoryIfNeeded(usage);
  let text = `メモリ: ${formatBytes(usage.total)}`;
  if (memoryThresholds.maxBytes) {
    text += ` | 上限目安 ${formatBytes(memoryThresholds.maxBytes)}`;
  }
  text += ` | ヒストリー ${history.past.length}/${history.limit}`;
    const now = performance && typeof performance.now === 'function' ? performance.now() : Date.now();
    if (historyTrimmedRecently) {
      if (now - historyTrimmedAt <= 6000) {
        text += ' | ヒストリー自動整理';
      } else {
        historyTrimmedRecently = false;
      }
    }
  usageNode.textContent = text;
  usageNode.style.color = usage.total >= memoryThresholds.warningBytes ? '#ff5c5c' : '';
}

  function clearMemoryUsage() {
    history.past = [];
    history.future = [];
    history.pending = null;
    fillPreviewCache.contextKey = null;
    fillPreviewCache.byPixel = null;
    updateHistoryButtons();
    autosaveDirty = true;
    updateMemoryStatus();
    scheduleAutosaveSnapshot();
  }

  function initMemoryMonitor() {
    if (!dom.controls.memoryUsage) {
      dom.controls.memoryUsage = document.getElementById('memoryUsage');
    }
    if (!dom.controls.memoryClear) {
      dom.controls.memoryClear = document.getElementById('memoryClear');
    }
    const usageNode = dom.controls.memoryUsage;
    if (!usageNode) return;
    updateMemoryStatus();
    if (memoryMonitorHandle !== null) {
      window.clearInterval(memoryMonitorHandle);
    }
    memoryMonitorHandle = window.setInterval(updateMemoryStatus, MEMORY_MONITOR_INTERVAL);
    const clearButtons = document.querySelectorAll('#memoryClear');
    clearButtons.forEach(button => {
      if (button.dataset.memoryBound) return;
      button.dataset.memoryBound = 'true';
      button.addEventListener('click', () => {
        clearMemoryUsage();
        updateMemoryStatus();
      });
    });
  }

  function applyHistorySnapshot(snapshot) {
    state.width = snapshot.width;
    state.height = snapshot.height;
    state.scale = normalizeZoomScale(snapshot.scale, state.scale || MIN_ZOOM_SCALE);
    state.pan = { x: snapshot.pan.x, y: snapshot.pan.y };
    if (Object.prototype.hasOwnProperty.call(snapshot, 'tool')) {
      state.tool = snapshot.tool;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'brushSize')) {
      state.brushSize = snapshot.brushSize;
    }
    state.colorMode = 'index';
    state.palette = snapshot.palette.map(color => ({ ...color }));
    state.activePaletteIndex = snapshot.activePaletteIndex;
    state.activeRgb = { ...snapshot.activeRgb };
    state.frames = snapshot.frames.map(frame => ({
      id: frame.id,
      name: frame.name,
      duration: frame.duration,
      layers: frame.layers.map(layer => {
        const clonedLayer = {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          indices: new Int16Array(layer.indices),
          direct: null,
        };
        if (layer.direct instanceof Uint8ClampedArray) {
          clonedLayer.direct = new Uint8ClampedArray(layer.direct);
        } else if (ArrayBuffer.isView(layer.direct)) {
          clonedLayer.direct = new Uint8ClampedArray(layer.direct.buffer.slice(0));
        }
        return clonedLayer;
      }),
    }));
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeFrame')) {
      state.activeFrame = snapshot.activeFrame;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeLayer')) {
      state.activeLayer = snapshot.activeLayer;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'selectionMask')) {
      state.selectionMask = snapshot.selectionMask ? new Uint8Array(snapshot.selectionMask) : null;
    } else {
      state.selectionMask = null;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'selectionBounds')) {
      state.selectionBounds = snapshot.selectionBounds ? { ...snapshot.selectionBounds } : null;
    } else {
      state.selectionBounds = null;
    }
    state.pendingPasteMoveState = null;
    updateCanvasControlButtons();
    state.showGrid = snapshot.showGrid;
    state.showMajorGrid = snapshot.showMajorGrid ?? true;
    state.gridScreenStep = snapshot.gridScreenStep ?? state.gridScreenStep ?? 16;
    state.majorGridSpacing = snapshot.majorGridSpacing ?? state.majorGridSpacing ?? 16;
    state.backgroundMode = snapshot.backgroundMode ?? 'dark';
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeToolGroup')) {
      state.activeToolGroup = snapshot.activeToolGroup ?? state.activeToolGroup ?? TOOL_TO_GROUP[state.tool] ?? 'pen';
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'lastGroupTool')) {
      state.lastGroupTool = { ...DEFAULT_GROUP_TOOL, ...(snapshot.lastGroupTool || {}) };
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeLeftTab')) {
      state.activeLeftTab = snapshot.activeLeftTab ?? state.activeLeftTab ?? 'tools';
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'activeRightTab')) {
      state.activeRightTab = snapshot.activeRightTab ?? state.activeRightTab ?? 'frames';
    }
    state.showPixelGuides = snapshot.showPixelGuides;
    state.showVirtualCursor = Boolean(snapshot.showVirtualCursor);
    state.showChecker = snapshot.showChecker;
    if (Object.prototype.hasOwnProperty.call(snapshot, 'playback')) {
      state.playback = { ...snapshot.playback };
    }
    state.documentName = normalizeDocumentName(snapshot.documentName);

    pointerState.active = false;
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.path = [];
    pointerState.startClient = null;
    pointerState.panOrigin = { x: 0, y: 0 };
    hoverPixel = null;
    if (state.showVirtualCursor && !virtualCursor) {
      virtualCursor = createInitialVirtualCursor();
    }
    if (!state.showVirtualCursor) {
      releaseVirtualCursorPointer();
    }
    updateFloatingDrawButtonEnabledState();
    refreshViewportCursorStyle();

    resizeCanvases();
    renderFrameList();
    renderLayerList();
    renderPalette();
    syncPaletteInputs();
    syncControlsWithState();
    applyViewportTransform();
    invalidateFillPreviewCache();
    requestRender();
    requestOverlayRender();
    updateHistoryButtons();
    updateDocumentMetadata();
    scheduleSessionPersist();
    updateMemoryStatus();
  }

  function extractDocumentBaseName(value) {
    if (typeof value !== 'string') {
      return DEFAULT_DOCUMENT_BASENAME;
    }
    const ext = PROJECT_FILE_EXTENSION;
    let base = value.trim();
    if (!base) {
      return DEFAULT_DOCUMENT_BASENAME;
    }
    if (base.toLowerCase().endsWith(ext)) {
      base = base.slice(0, -ext.length);
    }
    base = base.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
    return base || DEFAULT_DOCUMENT_BASENAME;
  }

  function normalizeDocumentName(value) {
    const base = extractDocumentBaseName(value);
    const maxBaseLength = Math.max(1, 120 - PROJECT_FILE_EXTENSION.length);
    const limitedBase = base.slice(0, maxBaseLength);
    return `${limitedBase}${PROJECT_FILE_EXTENSION}`;
  }

  function updateDocumentMetadata() {
    const name = normalizeDocumentName(state.documentName);
    if (state.documentName !== name) {
      state.documentName = name;
    }
    const baseTitle = 'PiXiEEDraw';
    document.title = `${name} • ${baseTitle}`;
  }

  function sanitizeDocumentFileBase(name) {
    const base = extractDocumentBaseName(name);
    return base
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || DEFAULT_DOCUMENT_BASENAME.replace(/\s+/g, '_');
  }

  function createAutosaveFileName(name = state.documentName) {
    const sanitizedBase = sanitizeDocumentFileBase(name);
    return `${sanitizedBase}${PROJECT_FILE_EXTENSION}`;
  }

  function createExportFileName(extension, suffix = '') {
    const sanitized = sanitizeDocumentFileBase(state.documentName);
    const safeBase =
      sanitized || DEFAULT_DOCUMENT_BASENAME.replace(/\s+/g, '_');
    const safeSuffix = suffix ? `_${suffix}` : '';
    const normalizedExt = extension ? extension.replace(/^\.+/, '') : '';
    return normalizedExt ? `${safeBase}${safeSuffix}.${normalizedExt}` : `${safeBase}${safeSuffix}`;
  }

  function beginHistory(label) {
    if (history.pending) return;
    history.pending = {
      before: compressHistorySnapshot(makeHistorySnapshot()),
      dirty: false,
      label,
    };
  }

  function invalidateFillPreviewCache() {
    fillPreviewCache.contextKey = null;
    fillPreviewCache.byPixel = null;
  }

  function markHistoryDirty() {
    invalidateFillPreviewCache();
    autosaveDirty = true;
    if (history.pending) {
      history.pending.dirty = true;
    }
  }

  function commitHistory() {
    if (!history.pending) return;
    if (history.pending.dirty) {
      history.past.push(history.pending.before);
      if (history.past.length > history.limit) {
        history.past.shift();
      }
      history.future.length = 0;
      scheduleAutosaveSnapshot();
    }
    history.pending = null;
    updateHistoryButtons();
    scheduleSessionPersist();
    updateMemoryStatus();
  }

  function undo() {
    commitHistory();
    if (!history.past.length) return;
    const snapshot = compressHistorySnapshot(makeHistorySnapshot());
    history.future.push(snapshot);
    if (history.future.length > history.limit) {
      history.future.shift();
    }
    const previous = history.past.pop();
    applyHistorySnapshot(decompressHistorySnapshot(previous));
    updateHistoryButtons();
    autosaveDirty = true;
    scheduleAutosaveSnapshot();
  }

  function redo() {
    commitHistory();
    if (!history.future.length) return;
    const snapshot = compressHistorySnapshot(makeHistorySnapshot());
    history.past.push(snapshot);
    if (history.past.length > history.limit) {
      history.past.shift();
    }
    const next = history.future.pop();
    applyHistorySnapshot(decompressHistorySnapshot(next));
    updateHistoryButtons();
    autosaveDirty = true;
    scheduleAutosaveSnapshot();
  }

  function rollbackPendingHistory({ reRender = true } = {}) {
    if (!history.pending || !history.pending.before) {
      history.pending = null;
      return false;
    }
    const snapshot = decompressHistorySnapshot(history.pending.before);
    history.pending = null;
    applyHistorySnapshot(snapshot);
    updateHistoryButtons();
    autosaveDirty = true;
    if (reRender) {
      renderEverything();
      requestOverlayRender();
    } else {
      requestRender();
      requestOverlayRender();
    }
    scheduleSessionPersist();
    return true;
  }

  function updateHistoryButtons() {
    if (dom.controls.undoAction) {
      dom.controls.undoAction.disabled = history.past.length === 0;
    }
    if (dom.controls.redoAction) {
      dom.controls.redoAction.disabled = history.future.length === 0;
    }
  }

  function updateVirtualCursorActionToolButtons() {
    const enabled = Boolean(state.showVirtualCursor);
    const toggleButtons = Array.from(document.querySelectorAll(`.tool-button[data-tool="${TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE}"]`));
    toggleButtons.forEach(button => {
      const icon = button.querySelector('img');
      const label = button.querySelector('span');
      button.setAttribute('aria-label', enabled ? '仮想カーソルを非表示' : '仮想カーソルを表示');
      if (icon instanceof HTMLImageElement) {
        icon.src = 'assets/icons/tool-cursor.png';
        icon.alt = '仮想カーソル';
      }
      if (label) {
        label.textContent = enabled ? '仮想OFF' : '仮想ON';
      }
    });
  }

  function runToolAction(tool) {
    if (tool === TOOL_ACTION_VIRTUAL_CURSOR_TOGGLE) {
      setVirtualCursorEnabled(!state.showVirtualCursor);
      updateVirtualCursorActionToolButtons();
      return true;
    }
    if (tool === TOOL_ACTION_VIRTUAL_CURSOR_CENTER) {
      if (!state.showVirtualCursor) {
        setVirtualCursorEnabled(true);
      }
      const centered = createInitialVirtualCursor(state);
      setVirtualCursor(centered);
      requestOverlayRender();
      scheduleSessionPersist();
      updateVirtualCursorActionToolButtons();
      return true;
    }
    return false;
  }

  function updateCanvasControlButtons() {
    const primary = dom.controls.canvasControlPrimary;
    const secondary = dom.controls.canvasControlSecondary;
    if (!primary || !secondary) {
      return;
    }
    const moveState = pointerState.selectionMove;
    const movePending = Boolean(moveState && moveState.hasCleared);
    const hasSelection = selectionMaskHasPixels(state.selectionMask);
    const hasClipboard = Boolean(internalClipboard.selection);
    const nextMode = movePending ? 'selectionMove' : (hasSelection ? 'clipboard' : 'zoom');
    if (canvasControlMode !== nextMode) {
      canvasControlMode = nextMode;
      if (dom.controls.canvasControlButtons) {
        const label = nextMode === 'selectionMove'
          ? '選択範囲の確定操作'
          : (nextMode === 'clipboard' ? 'コピーと貼り付け' : 'ズーム');
        dom.controls.canvasControlButtons.setAttribute('aria-label', label);
      }
      if (nextMode === 'selectionMove') {
        primary.replaceChildren(document.createTextNode('取消'));
        primary.dataset.action = 'cancelSelectionMove';
        primary.setAttribute('aria-label', '選択移動を取り消す');
        secondary.replaceChildren(document.createTextNode('確定'));
        secondary.dataset.action = 'confirmSelectionMove';
        secondary.setAttribute('aria-label', '選択移動を確定する');
      } else if (nextMode === 'clipboard') {
        primary.replaceChildren(document.createTextNode('C'));
        primary.dataset.action = 'copy';
        primary.setAttribute('aria-label', 'コピー');
        secondary.replaceChildren(document.createTextNode('P'));
        secondary.dataset.action = 'paste';
        secondary.setAttribute('aria-label', '貼り付け');
      } else {
        primary.replaceChildren(makeIcon('zoomdown', '−'));
        primary.dataset.action = 'zoomOut';
        primary.setAttribute('aria-label', 'ズームアウト');
        secondary.replaceChildren(makeIcon('zoomup', '＋'));
        secondary.dataset.action = 'zoomIn';
        secondary.setAttribute('aria-label', 'ズームイン');
      }
    }
    if (canvasControlMode === 'selectionMove') {
      primary.disabled = false;
      secondary.disabled = false;
    } else if (canvasControlMode === 'clipboard') {
      primary.disabled = !hasSelection;
      secondary.disabled = !hasClipboard;
    } else {
      primary.disabled = false;
      secondary.disabled = false;
    }
  }

  function setupLeftTabs() {
    dom.leftTabButtons = Array.from(document.querySelectorAll('[data-left-tab]'));
    if (!dom.leftTabButtons || !dom.leftTabButtons.length) return;
    dom.leftTabButtons.forEach(button => {
      button.addEventListener('click', () => {
        if (layoutMode === 'mobilePortrait') return;
        const target = button.dataset.leftTab;
        if (!target) return;
        setLeftTab(target);
      });
    });
    updateLeftTabUI();
  }

  function setLeftTab(tab) {
    if (!LEFT_TAB_KEYS.includes(tab)) return;
    if (state.activeLeftTab === tab) return;
    state.activeLeftTab = tab;
    if (tab !== 'tools') {
      setCompactToolFlyoutOpen(false);
    }
    updateLeftTabUI();
    updateLeftTabVisibility();
    updateToolVisibility();
    scheduleSessionPersist();
  }

  function updateLeftTabUI() {
    if (!dom.leftTabButtons) return;
    dom.leftTabButtons.forEach(button => {
      const tab = button.dataset.leftTab;
      const isActive = tab === state.activeLeftTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function updateLeftTabVisibility() {
    const isMobile = layoutMode === 'mobilePortrait';
    if (dom.leftTabsBar) {
      dom.leftTabsBar.toggleAttribute('hidden', isMobile);
    }
    if (isMobile) {
      LEFT_TAB_KEYS.forEach(key => {
        const section = dom.sections[key];
        if (!section) return;
        section.hidden = false;
        section.setAttribute('aria-hidden', 'false');
        section.classList.add('is-active');
      });
      setCompactToolFlyoutOpen(false);
      return;
    }
    LEFT_TAB_KEYS.forEach(key => {
      const section = dom.sections[key];
      if (!section) return;
      const isActive = state.activeLeftTab === key;
      section.hidden = !isActive;
      section.setAttribute('aria-hidden', String(!isActive));
      section.classList.toggle('is-active', isActive);
    });
    if (!isCompactToolRailMode()) {
      setCompactToolFlyoutOpen(false);
    }
  }

  function isCompactRightRailMode() {
    if (layoutMode === 'mobilePortrait') {
      return false;
    }
    return dom.rightRail instanceof HTMLElement && dom.rightRail.dataset.compact === 'true';
  }

  function isCompactRightFlyoutOpen() {
    return dom.rightRail instanceof HTMLElement && dom.rightRail.dataset.compactFlyoutOpen === 'true';
  }

  function updateCompactFlyoutBackdropState() {
    const visible = isCompactToolFlyoutOpen() || isCompactRightFlyoutOpen();
    document.body.classList.toggle('is-compact-flyout-open', visible);
  }

  function ensureCompactRightFlyoutPortal(open, section = null) {
    if (!open) {
      if (!compactRightFlyoutPortal.active || !(compactRightFlyoutPortal.section instanceof HTMLElement)) {
        return;
      }
      const activeSection = compactRightFlyoutPortal.section;
      const { parent, nextSibling } = compactRightFlyoutPortal;
      if (parent instanceof Node && parent.isConnected) {
        if (nextSibling instanceof Node && nextSibling.parentNode === parent) {
          parent.insertBefore(activeSection, nextSibling);
        } else {
          parent.appendChild(activeSection);
        }
      }
      compactRightFlyoutPortal.active = false;
      compactRightFlyoutPortal.section = null;
      compactRightFlyoutPortal.parent = null;
      compactRightFlyoutPortal.nextSibling = null;
      return;
    }
    if (!(section instanceof HTMLElement)) {
      ensureCompactRightFlyoutPortal(false);
      return;
    }
    if (compactRightFlyoutPortal.active && compactRightFlyoutPortal.section === section) {
      return;
    }
    ensureCompactRightFlyoutPortal(false);
    compactRightFlyoutPortal.parent = section.parentNode;
    compactRightFlyoutPortal.nextSibling = section.nextSibling;
    document.body.appendChild(section);
    compactRightFlyoutPortal.section = section;
    compactRightFlyoutPortal.active = true;
  }

  function clearCompactRightFlyoutStyles() {
    RIGHT_TAB_KEYS.forEach(key => {
      const section = dom.sections[key];
      if (!(section instanceof HTMLElement)) {
        return;
      }
      section.classList.remove('is-compact-flyout');
      section.style.removeProperty('position');
      section.style.removeProperty('left');
      section.style.removeProperty('top');
      section.style.removeProperty('width');
      section.style.removeProperty('max-height');
      section.style.removeProperty('z-index');
      section.style.removeProperty('overflow');
    });
  }

  function clearCompactRightFlyoutPosition() {
    clearCompactRightFlyoutStyles();
    ensureCompactRightFlyoutPortal(false);
  }

  function updateCompactRightFlyoutPosition() {
    const compactMode = isCompactRightRailMode();
    const open = isCompactRightFlyoutOpen();
    if (!compactMode || !open || !(dom.rightRail instanceof HTMLElement)) {
      clearCompactRightFlyoutPosition();
      return;
    }
    const section = dom.sections[state.activeRightTab];
    if (!(section instanceof HTMLElement)) {
      clearCompactRightFlyoutPosition();
      return;
    }
    const railRect = dom.rightRail.getBoundingClientRect();
    const viewportBounds = getViewportBounds();
    const safeArea = getSafeAreaInsets();
    const edgePadding = 8;
    const safeLeft = viewportBounds.left + safeArea.left;
    const safeTop = viewportBounds.top + safeArea.top;
    const safeRight = viewportBounds.right - safeArea.right;
    const safeBottom = viewportBounds.bottom - safeArea.bottom;
    const safeWidth = Math.max(1, safeRight - safeLeft);
    let width = clamp(Math.round(safeWidth * 0.34), 260, 460);
    let left = Math.round(railRect.left - width - 10);
    if (left < safeLeft + edgePadding) {
      left = safeLeft + edgePadding;
      width = Math.max(220, Math.min(width, safeRight - left - edgePadding));
    }
    let top = clamp(
      Math.round(railRect.top + 8),
      safeTop + edgePadding,
      Math.max(safeTop + edgePadding, safeBottom - 120)
    );
    let maxHeight = Math.max(140, Math.round(safeBottom - top - edgePadding));
    if (maxHeight < 220) {
      top = Math.max(safeTop + edgePadding, Math.round(safeBottom - 220 - edgePadding));
      maxHeight = Math.max(140, Math.round(safeBottom - top - edgePadding));
    }
    clearCompactRightFlyoutStyles();
    ensureCompactRightFlyoutPortal(true, section);
    section.classList.add('is-compact-flyout');
    section.style.position = 'fixed';
    section.style.left = `${left}px`;
    section.style.top = `${top}px`;
    section.style.width = `${width}px`;
    section.style.maxHeight = `${maxHeight}px`;
    section.style.zIndex = '14000';
    section.style.overflow = 'auto';
  }

  function setCompactRightFlyoutOpen(open) {
    if (!(dom.rightRail instanceof HTMLElement)) {
      return;
    }
    const shouldOpen = Boolean(open) && isCompactRightRailMode();
    dom.rightRail.dataset.compactFlyoutOpen = shouldOpen ? 'true' : 'false';
    if (!shouldOpen) {
      clearCompactRightFlyoutPosition();
    } else {
      updateCompactRightFlyoutPosition();
    }
    updateCompactFlyoutBackdropState();
  }

  function setupRightTabs() {
    dom.rightTabButtons = Array.from(document.querySelectorAll('[data-right-tab]'));
    if (!RIGHT_TAB_KEYS.includes(state.activeRightTab)) {
      state.activeRightTab = 'frames';
    }
    if (!dom.rightTabButtons || !dom.rightTabButtons.length) return;
    dom.rightTabButtons.forEach(button => {
      if (button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        if (layoutMode === 'mobilePortrait') return;
        const target = button.dataset.rightTab;
        if (!target) return;
        const compactMode = isCompactRightRailMode();
        if (compactMode && state.activeRightTab === target) {
          setCompactRightFlyoutOpen(!isCompactRightFlyoutOpen());
          updateRightTabVisibility();
          return;
        }
        setRightTab(target);
        if (compactMode) {
          setCompactRightFlyoutOpen(true);
          updateRightTabVisibility();
        }
      });
    });
    if (!compactRightFlyoutDismissBound) {
      compactRightFlyoutDismissBound = true;
      const dismissCompactRightFlyout = event => {
        if (!isCompactRightFlyoutOpen()) {
          return;
        }
        const target = event.target;
        if (!(target instanceof Node)) {
          return;
        }
        const activeSection = dom.sections[state.activeRightTab];
        if (activeSection instanceof HTMLElement && activeSection.contains(target)) {
          return;
        }
        if (dom.rightRail instanceof HTMLElement && dom.rightRail.contains(target)) {
          return;
        }
        setCompactRightFlyoutOpen(false);
        updateRightTabVisibility();
      };
      document.addEventListener('pointerdown', dismissCompactRightFlyout, true);
      document.addEventListener('click', dismissCompactRightFlyout, true);
      document.addEventListener('touchstart', dismissCompactRightFlyout, { capture: true, passive: true });
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !isCompactRightFlyoutOpen()) {
          return;
        }
        setCompactRightFlyoutOpen(false);
        updateRightTabVisibility();
      });
    }
    if (!compactRightFlyoutPositionBound) {
      compactRightFlyoutPositionBound = true;
      window.addEventListener('resize', updateCompactRightFlyoutPosition, { passive: true });
      window.addEventListener('scroll', updateCompactRightFlyoutPosition, true);
      dom.rightRail?.addEventListener('scroll', updateCompactRightFlyoutPosition, { passive: true });
    }
    setCompactRightFlyoutOpen(false);
    updateRightTabUI();
    updateRightTabVisibility();
  }

  function setRightTab(tab) {
    if (!RIGHT_TAB_KEYS.includes(tab)) return;
    if (state.activeRightTab === tab) return;
    state.activeRightTab = tab;
    updateRightTabUI();
    updateRightTabVisibility();
    scheduleSessionPersist();
  }

  function updateRightTabUI() {
    if (!dom.rightTabButtons) return;
    dom.rightTabButtons.forEach(button => {
      const tab = button.dataset.rightTab;
      const isActive = tab === state.activeRightTab;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  }

  function updateRightTabVisibility() {
    const isMobile = layoutMode === 'mobilePortrait';
    if (dom.rightTabsBar) {
      dom.rightTabsBar.toggleAttribute('hidden', isMobile);
    }
    if (isMobile) {
      setCompactRightFlyoutOpen(false);
      RIGHT_TAB_KEYS.forEach(key => {
        const section = dom.sections[key];
        if (!section) return;
        section.hidden = false;
        section.setAttribute('aria-hidden', 'false');
        section.classList.add('is-active');
      });
      return;
    }
    const compactMode = isCompactRightRailMode();
    if (!compactMode && isCompactRightFlyoutOpen()) {
      setCompactRightFlyoutOpen(false);
    }
    const showCompactFlyout = compactMode && isCompactRightFlyoutOpen();
    RIGHT_TAB_KEYS.forEach(key => {
      const section = dom.sections[key];
      if (!section) return;
      const isActive = state.activeRightTab === key;
      const visible = compactMode ? (isActive && showCompactFlyout) : isActive;
      section.hidden = !visible;
      section.setAttribute('aria-hidden', String(!visible));
      section.classList.toggle('is-active', visible);
    });
    updateCompactRightFlyoutPosition();
  }

  function resetCurveBuilder() {
    if (!curveBuilder) return;
    curveBuilder = null;
    pointerState.curveHandle = null;
    hoverPixel = null;
    pointerState.preview = null;
    pointerState.tool = null;
    if (history.pending && history.pending.label === 'curve' && !history.pending.dirty) {
      history.pending = null;
    }
    requestOverlayRender();
  }

  function setupToolGroups() {
    dom.toolGroupButtons = Array.from(document.querySelectorAll('.tool-group-button[data-tool-group]'));
    if (!state.lastGroupTool) {
      state.lastGroupTool = { ...DEFAULT_GROUP_TOOL };
    }
    if (!TOOL_GROUPS[state.activeToolGroup]) {
      state.activeToolGroup = TOOL_TO_GROUP[state.tool] || 'pen';
    }
    if (dom.toolGroupButtons && dom.toolGroupButtons.length) {
      dom.toolGroupButtons.forEach(button => {
        button.addEventListener('click', () => {
          const target = button.dataset.toolGroup;
          if (!target) return;
          const mobilePeekMode = isMobilePeekToolFlyoutMode();
          const compactMode = isCompactToolRailMode() || mobilePeekMode;
          if (!compactMode) {
            setCompactToolFlyoutOpen(false);
            setToolGroup(target);
            return;
          }
          const wasOpen = isCompactToolFlyoutOpen();
          const isSameGroup = state.activeToolGroup === target;
          setToolGroup(target);
          if (isSameGroup && wasOpen) {
            setCompactToolFlyoutOpen(false, { force: mobilePeekMode });
          } else {
            setCompactToolFlyoutOpen(true, { force: mobilePeekMode });
          }
          updateToolVisibility();
        });
      });
    }
    if (!compactToolFlyoutDismissBound) {
      compactToolFlyoutDismissBound = true;
      document.addEventListener(
        'pointerdown',
        event => {
          if (!isCompactToolFlyoutOpen()) {
            return;
          }
          const target = event.target;
          if (!(target instanceof Node)) {
            return;
          }
          const toolsPanel = dom.sections.tools;
          if (toolsPanel instanceof HTMLElement && toolsPanel.contains(target)) {
            return;
          }
          if (dom.toolGrid instanceof HTMLElement && dom.toolGrid.contains(target)) {
            return;
          }
          setCompactToolFlyoutOpen(false);
          updateToolVisibility();
        },
        true
      );
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || !isCompactToolFlyoutOpen()) {
          return;
        }
        setCompactToolFlyoutOpen(false);
        updateToolVisibility();
      });
    }
    if (!compactToolFlyoutPositionBound) {
      compactToolFlyoutPositionBound = true;
      window.addEventListener('resize', updateCompactToolFlyoutPosition, { passive: true });
      window.addEventListener('scroll', updateCompactToolFlyoutPosition, true);
      dom.leftRail?.addEventListener('scroll', updateCompactToolFlyoutPosition, { passive: true });
    }
    setCompactToolFlyoutOpen(false);
    updateToolGroupButtons();
    updateToolVisibility();
    const activeGroupTools = TOOL_GROUPS[state.activeToolGroup]?.tools || [];
    if (activeGroupTools.length && !activeGroupTools.includes(state.tool)) {
      const fallback = state.lastGroupTool[state.activeToolGroup] && activeGroupTools.includes(state.lastGroupTool[state.activeToolGroup])
        ? state.lastGroupTool[state.activeToolGroup]
        : activeGroupTools[0];
      setActiveTool(fallback, toolButtons, { persist: false, skipGroupUpdate: true });
    } else if (activeGroupTools.includes(state.tool)) {
      state.lastGroupTool[state.activeToolGroup] = state.tool;
    }
  }

  function isCompactToolRailMode() {
    if (layoutMode === 'mobilePortrait') {
      const isPeek = dom.mobileDrawer instanceof HTMLElement
        ? dom.mobileDrawer.dataset.mode === 'peek'
        : normalizeMobileDrawerMode(mobileDrawerState.mode) === 'peek';
      const toolsPanel = dom.mobilePanels.tools;
      const toolsTabActive = toolsPanel instanceof HTMLElement && toolsPanel.classList.contains('is-active') && !toolsPanel.hidden;
      return isPeek && toolsTabActive;
    }
    if (!(dom.leftRail instanceof HTMLElement) || dom.leftRail.dataset.compact !== 'true') {
      return false;
    }
    return state.activeLeftTab === 'tools';
  }

  function isMobilePeekToolFlyoutMode() {
    if (layoutMode !== 'mobilePortrait') {
      return false;
    }
    return dom.mobileDrawer?.dataset.mode === 'peek'
      || normalizeMobileDrawerMode(mobileDrawerState.mode) === 'peek';
  }

  function ensureMobileToolGridPortal(open, { mobilePeek = false } = {}) {
    if (!(dom.toolGrid instanceof HTMLElement)) {
      return;
    }
    if (!open) {
      if (!mobileToolGridPortal.active) {
        dom.toolGrid.classList.remove('is-compact-flyout-portal');
        dom.toolGrid.classList.remove('is-mobile-peek-flyout');
        return;
      }
      const { parent, nextSibling } = mobileToolGridPortal;
      if (parent instanceof Node && parent.isConnected) {
        if (nextSibling instanceof Node && nextSibling.parentNode === parent) {
          parent.insertBefore(dom.toolGrid, nextSibling);
        } else {
          parent.appendChild(dom.toolGrid);
        }
      }
      mobileToolGridPortal.active = false;
      mobileToolGridPortal.parent = null;
      mobileToolGridPortal.nextSibling = null;
      dom.toolGrid.classList.remove('is-compact-flyout-portal');
      dom.toolGrid.classList.remove('is-mobile-peek-flyout');
      return;
    }
    dom.toolGrid.classList.toggle('is-compact-flyout-portal', !mobilePeek);
    dom.toolGrid.classList.toggle('is-mobile-peek-flyout', mobilePeek);
    if (mobileToolGridPortal.active) {
      return;
    }
    mobileToolGridPortal.parent = dom.toolGrid.parentNode;
    mobileToolGridPortal.nextSibling = dom.toolGrid.nextSibling;
    document.body.appendChild(dom.toolGrid);
    mobileToolGridPortal.active = true;
  }

  function isCompactToolFlyoutOpen() {
    return dom.sections.tools instanceof HTMLElement && dom.sections.tools.dataset.compactFlyoutOpen === 'true';
  }

  function clearCompactToolFlyoutPosition() {
    if (!(dom.toolGrid instanceof HTMLElement)) {
      return;
    }
    dom.toolGrid.style.removeProperty('position');
    dom.toolGrid.style.removeProperty('left');
    dom.toolGrid.style.removeProperty('top');
    dom.toolGrid.style.removeProperty('width');
    dom.toolGrid.style.removeProperty('max-height');
    dom.toolGrid.style.removeProperty('grid-template-columns');
    dom.toolGrid.style.removeProperty('z-index');
    dom.toolGrid.style.removeProperty('display');
    ensureMobileToolGridPortal(false);
  }

  function updateCompactToolFlyoutPosition() {
    if (!(dom.toolGrid instanceof HTMLElement)) {
      return;
    }
    const mobilePeekMode = isMobilePeekToolFlyoutMode();
    const shouldFloat = (isCompactToolRailMode() || mobilePeekMode) && isCompactToolFlyoutOpen();
    if (!shouldFloat) {
      clearCompactToolFlyoutPosition();
      return;
    }
    const toolsPanel = dom.sections.tools;
    const activeGroupButton = toolsPanel?.querySelector(`.tool-group-button[data-tool-group="${state.activeToolGroup}"]`);
    const anchor = activeGroupButton instanceof HTMLElement ? activeGroupButton : (toolsPanel?.querySelector('.panel-section__body') || toolsPanel);
    if (!(anchor instanceof HTMLElement)) {
      clearCompactToolFlyoutPosition();
      return;
    }
    const isMobileCompact = layoutMode === 'mobilePortrait';
    const anchorRect = anchor.getBoundingClientRect();
    const viewportBounds = getViewportBounds();
    const safeArea = getSafeAreaInsets();
    const edgePadding = 8;
    const safeLeft = viewportBounds.left + safeArea.left;
    const safeTop = viewportBounds.top + safeArea.top;
    const safeRight = viewportBounds.right - safeArea.right;
    const safeBottom = viewportBounds.bottom - safeArea.bottom;
    let flyoutWidth;
    let left;
    let top;
    let maxHeight;

    if (isMobileCompact) {
      ensureMobileToolGridPortal(true, { mobilePeek: true });
      const activeTools = TOOL_GROUPS[state.activeToolGroup]?.tools || [];
      const toolCount = Math.max(1, activeTools.length);
      const itemSize = 64;
      const gap = 8;
      const padding = 16;
      const availableWidth = Math.max(72, safeRight - safeLeft - (edgePadding * 2));
      const maxColumns = Math.max(1, Math.min(4, Math.floor((availableWidth - padding + gap) / (itemSize + gap))));
      const columns = Math.max(1, Math.min(toolCount, maxColumns));
      const rows = Math.max(1, Math.ceil(toolCount / columns));
      const desiredWidth = (columns * itemSize) + (Math.max(0, columns - 1) * gap) + padding;
      const desiredHeight = (rows * itemSize) + (Math.max(0, rows - 1) * gap) + padding;
      flyoutWidth = clamp(Math.round(desiredWidth), 72, Math.max(72, availableWidth));
      const minLeft = Math.round(safeLeft + edgePadding);
      const maxLeft = Math.max(minLeft, Math.round(safeRight - flyoutWidth - edgePadding));
      left = clamp(Math.round(anchorRect.left + ((anchorRect.width - flyoutWidth) * 0.5)), minLeft, maxLeft);
      const maxFlyoutHeight = Math.max(96, Math.round((safeBottom - safeTop) * 0.68));
      const flyoutHeight = clamp(Math.round(desiredHeight), 88, maxFlyoutHeight);
      const preferredTop = Math.round(anchorRect.top - flyoutHeight - 10);
      const fallbackTop = Math.round(anchorRect.bottom + 10);
      const minTop = Math.round(safeTop + edgePadding);
      const maxBottom = Math.round(safeBottom - edgePadding);
      if (preferredTop >= minTop) {
        top = preferredTop;
      } else if (fallbackTop + flyoutHeight <= maxBottom) {
        top = fallbackTop;
      } else {
        const maxTop = Math.max(minTop, Math.round(maxBottom - flyoutHeight));
        top = clamp(preferredTop, minTop, maxTop);
      }
      maxHeight = flyoutHeight;
      dom.toolGrid.style.gridTemplateColumns = `repeat(${columns}, ${itemSize}px)`;
    } else {
      ensureMobileToolGridPortal(true, { mobilePeek: false });
      dom.toolGrid.style.removeProperty('grid-template-columns');
      const railWidth = Math.max(68, dom.leftRail?.offsetWidth || 78);
      flyoutWidth = clamp(Math.round(railWidth - 16), 64, 96);
      left = Math.round(anchorRect.right + 10);
      const minLeft = Math.round(safeLeft + edgePadding);
      const maxRight = Math.round(safeRight - edgePadding);
      if (left + flyoutWidth > maxRight) {
        left = Math.max(minLeft, Math.round(anchorRect.left - 10 - flyoutWidth));
      }
      left = clamp(left, minLeft, Math.max(minLeft, maxRight - flyoutWidth));
      top = clamp(
        Math.round(anchorRect.top),
        Math.round(safeTop + edgePadding),
        Math.max(Math.round(safeTop + edgePadding), Math.round(safeBottom - 64))
      );
      maxHeight = Math.max(120, Math.round(safeBottom - top - 12));
      if (maxHeight < 220) {
        top = Math.max(Math.round(safeTop + edgePadding), Math.round(safeBottom - 220 - edgePadding));
        maxHeight = Math.max(120, Math.round(safeBottom - top - edgePadding));
      }
    }

    dom.toolGrid.style.position = 'fixed';
    dom.toolGrid.style.left = `${left}px`;
    dom.toolGrid.style.top = `${top}px`;
    dom.toolGrid.style.width = `${flyoutWidth}px`;
    dom.toolGrid.style.maxHeight = `${maxHeight}px`;
    dom.toolGrid.style.zIndex = '14000';
  }

  function setCompactToolFlyoutOpen(open, { force = false } = {}) {
    if (!(dom.sections.tools instanceof HTMLElement)) {
      return;
    }
    const shouldOpen = Boolean(open) && (Boolean(force) || isCompactToolRailMode() || isMobilePeekToolFlyoutMode());
    dom.sections.tools.dataset.compactFlyoutOpen = shouldOpen ? 'true' : 'false';
    updateCompactToolFlyoutPosition();
    updateCompactFlyoutBackdropState();
  }

  function setToolGroup(group, { persist = true } = {}) {
    if (!TOOL_GROUPS[group]) return;
    if (!state.lastGroupTool) {
      state.lastGroupTool = { ...DEFAULT_GROUP_TOOL };
    }
    if (!state.lastGroupTool[group]) {
      state.lastGroupTool[group] = DEFAULT_GROUP_TOOL[group] || TOOL_GROUPS[group].tools[0];
    }
    state.activeToolGroup = group;
    updateToolGroupButtons();
    updateToolVisibility();
    const tools = TOOL_GROUPS[group].tools;
    const hasSelectableTool = tools.some(tool => !TOOL_ACTIONS.has(tool));
    if (!hasSelectableTool) {
      if (persist) scheduleSessionPersist();
      return;
    }
    const desired = state.lastGroupTool[group] && tools.includes(state.lastGroupTool[group])
      ? state.lastGroupTool[group]
      : tools[0];
    if (!tools.includes(state.tool)) {
      setActiveTool(desired, toolButtons, { persist, skipGroupUpdate: true });
    } else {
      state.lastGroupTool[group] = state.tool;
      if (persist) scheduleSessionPersist();
    }
  }

  function getPreferredToolForGroup(group) {
    const config = group ? TOOL_GROUPS[group] : null;
    if (!config || !Array.isArray(config.tools) || config.tools.length === 0) {
      return null;
    }
    const tools = config.tools;
    if (tools.includes(state.tool)) {
      return state.tool;
    }
    const remembered = state.lastGroupTool?.[group];
    if (typeof remembered === 'string' && tools.includes(remembered)) {
      return remembered;
    }
    const fallback = DEFAULT_GROUP_TOOL[group];
    if (typeof fallback === 'string' && tools.includes(fallback)) {
      return fallback;
    }
    return tools[0];
  }

  function getToolIconSource(tool) {
    if (!tool || !toolButtons || !toolButtons.length) {
      return null;
    }
    const button = toolButtons.find(btn => btn.dataset.tool === tool);
    if (!(button instanceof HTMLElement)) {
      return null;
    }
    const image = button.querySelector('img');
    if (!(image instanceof HTMLImageElement)) {
      return null;
    }
    return image.getAttribute('src') || image.src || null;
  }

  function updateToolGroupButtons() {
    if (!dom.toolGroupButtons) return;
    dom.toolGroupButtons.forEach(button => {
      const group = button.dataset.toolGroup;
      const isActive = group === state.activeToolGroup;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
      const icon = button.querySelector('.tool-group-icon');
      if (!(icon instanceof HTMLImageElement) || !group || !TOOL_GROUPS[group]) {
        return;
      }
      if (!button.dataset.defaultIconSrc) {
        const current = icon.getAttribute('src');
        if (current) {
          button.dataset.defaultIconSrc = current;
        }
      }
      const preferredTool = getPreferredToolForGroup(group);
      const preferredIconSrc = getToolIconSource(preferredTool);
      const nextSrc = preferredIconSrc || button.dataset.defaultIconSrc;
      if (nextSrc && icon.getAttribute('src') !== nextSrc) {
        icon.setAttribute('src', nextSrc);
      }
    });
  }

  function updateToolVisibility() {
    if (!toolButtons || !toolButtons.length) return;
    const activeGroup = state.activeToolGroup || TOOL_TO_GROUP[state.tool] || 'pen';
    const mobilePeekMode = isMobilePeekToolFlyoutMode();
    const compactMode = isCompactToolRailMode() || mobilePeekMode;
    const compactFlyoutOpen = compactMode && isCompactToolFlyoutOpen();
    toolButtons.forEach(button => {
      const group = button.dataset.toolGroup || TOOL_TO_GROUP[button.dataset.tool];
      const show = compactMode ? (compactFlyoutOpen && (!group || group === activeGroup)) : (!group || group === activeGroup);
      button.hidden = !show;
      button.setAttribute('aria-hidden', String(!show));
    });
    if (dom.toolGrid) {
      if (activeGroup) {
        dom.toolGrid.dataset.activeGroup = activeGroup;
      } else {
        dom.toolGrid.removeAttribute('data-active-group');
      }
    }
    updateCompactToolFlyoutPosition();
  }

  function handleCurvePointerDown(event, position, layer) {
    if (!position || !layer) {
      pointerState.active = false;
      return;
    }
    hoverPixel = null;
    requestOverlayRender();

    if (!curveBuilder) {
      beginHistory('curve');
      curveBuilder = {
        stage: 'line',
        start: position,
        end: position,
        control1: null,
        control2: null,
        awaitingEndPoint: true,
      };
    }

    if (curveBuilder.stage === 'line') {
      pointerState.active = true;
      pointerState.pointerId = event.pointerId;
      pointerState.tool = 'curve';
      pointerState.start = curveBuilder.start || position;
      pointerState.current = position;
      pointerState.last = position;
      pointerState.path = [position];
      pointerState.curveHandle = null;
      curveBuilder.end = position;
      pointerState.preview = { start: pointerState.start, end: position };
      dom.canvases.drawing.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      requestOverlayRender();
      return;
    }

    if (curveBuilder.stage === 'control1' || curveBuilder.stage === 'control2') {
      pointerState.active = true;
      pointerState.pointerId = event.pointerId;
      pointerState.tool = 'curve';
      pointerState.curveHandle = curveBuilder.stage;
      pointerState.start = position;
      pointerState.current = position;
      pointerState.last = position;
      pointerState.path = [position];
      pointerState.preview = null;
      dom.canvases.drawing.setPointerCapture(event.pointerId);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      if (curveBuilder.stage === 'control1') {
        curveBuilder.control1 = position;
      } else {
        curveBuilder.control2 = position;
      }
      requestOverlayRender();
      return;
    }

    resetCurveBuilder();
  }

  function handleCurvePointerMove(event) {
    const position = getPointerPosition(event);
    if (!position || !curveBuilder) return;
    pointerState.current = position;
    if (curveBuilder.stage === 'line') {
      curveBuilder.end = position;
      pointerState.path.push(position);
      const lineStart = curveBuilder.start || pointerState.start || position;
      pointerState.preview = { start: lineStart, end: position };
    } else if (pointerState.curveHandle === 'control1') {
      curveBuilder.control1 = position;
    } else if (pointerState.curveHandle === 'control2') {
      curveBuilder.control2 = position;
    }
    requestOverlayRender();
  }

  function handleCurvePointerUp(event) {
    if (!curveBuilder) {
      dom.canvases.drawing.releasePointerCapture(event.pointerId);
      return;
    }
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    const position = getPointerPosition(event) || pointerState.current || curveBuilder.end;
    if (curveBuilder.stage === 'line') {
      const start = curveBuilder.start;
      curveBuilder.end = position;
      const moved = start && position && (start.x !== position.x || start.y !== position.y);
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.path = [];
      pointerState.curveHandle = null;
      dom.canvases.drawing.releasePointerCapture(event.pointerId);
      if (!moved) {
        curveBuilder.awaitingEndPoint = true;
        pointerState.preview = null;
        pointerState.tool = null;
        requestOverlayRender();
        return;
      }

      curveBuilder.awaitingEndPoint = false;
      if (!curveBuilder.control1) curveBuilder.control1 = { ...curveBuilder.start };
      if (!curveBuilder.control2) curveBuilder.control2 = { ...curveBuilder.end };
      curveBuilder.stage = 'control1';
      pointerState.preview = null;
      pointerState.tool = null;
      requestOverlayRender();
      return;
    }

    if (pointerState.curveHandle === 'control1') {
      curveBuilder.control1 = position;
      curveBuilder.stage = 'control2';
      pointerState.curveHandle = null;
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.path = [];
      dom.canvases.drawing.releasePointerCapture(event.pointerId);
      requestOverlayRender();
      scheduleSessionPersist();
      return;
    }

    if (pointerState.curveHandle === 'control2') {
      curveBuilder.control2 = position;
      pointerState.curveHandle = null;
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.path = [];
      dom.canvases.drawing.releasePointerCapture(event.pointerId);
      finalizeCurve();
      return;
    }
  }

  function finalizeCurve() {
    if (!curveBuilder) return;
    const layer = getActiveLayer();
    if (!layer) {
      resetCurveBuilder();
      return;
    }
    const { start, end } = curveBuilder;
    let { control1, control2 } = curveBuilder;
    control1 = control1 || { ...start };
    control2 = control2 || { ...end };
    const points = sampleCubicBezierPoints(start, control1, control2, end);
    forEachCurveStrokePixel(points, (x, y) => stampBrush(layer, x, y));
    requestRender();
    commitHistory();
    scheduleSessionPersist();
    resetCurveBuilder();
  }

  function drawCurveGuides(builder) {
    if (!builder || !builder.start || !builder.end) return;
    const { start, end, control1, control2 } = builder;
    ctx.overlay.save();
    ctx.overlay.lineWidth = 0.5;
    ctx.overlay.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.overlay.setLineDash([1, 1]);
    ctx.overlay.beginPath();
    ctx.overlay.moveTo(start.x + 0.5, start.y + 0.5);
    ctx.overlay.lineTo(end.x + 0.5, end.y + 0.5);
    ctx.overlay.stroke();

    if (control1) {
      ctx.overlay.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.overlay.beginPath();
      ctx.overlay.moveTo(start.x + 0.5, start.y + 0.5);
      ctx.overlay.lineTo(control1.x + 0.5, control1.y + 0.5);
      ctx.overlay.stroke();
      drawHandle(control1);
    }
    if (control2) {
      ctx.overlay.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.overlay.beginPath();
      ctx.overlay.moveTo(end.x + 0.5, end.y + 0.5);
      ctx.overlay.lineTo(control2.x + 0.5, control2.y + 0.5);
      ctx.overlay.stroke();
      drawHandle(control2);
    }

    if (builder.stage !== 'line') {
      const previewControl1 = control1 || { ...start };
      const previewControl2 = control2 || { ...end };
      const curvePoints = sampleCubicBezierPoints(start, previewControl1, previewControl2, end);
      const color = rgbaToCss(getActiveDrawColor());
      const width = state.width;
      const height = state.height;
      const selectionMask = state.selectionMask;
      ctx.overlay.fillStyle = color;
      const stamp = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        if (selectionMask && selectionMask[y * width + x] !== 1) return;
        forEachBrushOffset((dx, dy) => {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) return;
          if (selectionMask && selectionMask[py * width + px] !== 1) return;
          ctx.overlay.fillRect(px, py, 1, 1);
        });
      };
      forEachCurveStrokePixel(curvePoints, stamp);
    }
    ctx.overlay.restore();
  }

  function drawHandle(point) {
    if (!ctx.overlay || !point) {
      return;
    }
    const px = clamp(Math.round(point.x), 0, Math.max(0, state.width - 1));
    const py = clamp(Math.round(point.y), 0, Math.max(0, state.height - 1));
    const sample = sampleCompositeColor(px, py);
    let sampledColor = resolveSampledColor(sample);
    if (!sampledColor) {
      sampledColor = getBackgroundTileColor(px, py);
    }
    const markerColor = invertPreviewColor(sampledColor);
    ctx.overlay.save();
    ctx.overlay.fillStyle = rgbaToCss(markerColor);
    ctx.overlay.fillRect(px, py, 1, 1);
    ctx.overlay.restore();
  }

  function sampleCubicBezierPoints(p0, p1, p2, p3) {
    const tolerance = Math.max(0.1, Math.min(0.5, (state.brushSize || 1) * 0.2));
    const stack = [{ p0, p1, p2, p3, depth: 0 }];
    const seen = new Set();
    const points = [];

    const pushPoint = point => {
      const px = Math.round(point.x);
      const py = Math.round(point.y);
      const key = `${px},${py}`;
      if (seen.has(key)) return;
      seen.add(key);
      points.push({ x: px, y: py });
    };

    pushPoint(p0);

    while (stack.length) {
      const segment = stack.pop();
      const { p0: s0, p1: s1, p2: s2, p3: s3, depth } = segment;
      if (depth > 18 || cubicBezierFlatEnough(s0, s1, s2, s3, tolerance)) {
        pushPoint(s3);
        continue;
      }
      const [left, right] = subdivideCubicBezier(s0, s1, s2, s3);
      stack.push({ ...right, depth: depth + 1 });
      stack.push({ ...left, depth: depth + 1 });
    }

    return points;
  }

  function cubicBezierComponent(a, b, c, d, t) {
    const mt = 1 - t;
    return (mt ** 3) * a + 3 * (mt ** 2) * t * b + 3 * mt * (t ** 2) * c + (t ** 3) * d;
  }

  function cubicBezierFlatEnough(p0, p1, p2, p3, tolerance) {
    const d1 = distancePointToSegment(p1, p0, p3);
    const d2 = distancePointToSegment(p2, p0, p3);
    return d1 <= tolerance && d2 <= tolerance;
  }

  function subdivideCubicBezier(p0, p1, p2, p3) {
    const p01 = midpoint(p0, p1);
    const p12 = midpoint(p1, p2);
    const p23 = midpoint(p2, p3);
    const p012 = midpoint(p01, p12);
    const p123 = midpoint(p12, p23);
    const p0123 = midpoint(p012, p123);
    return [
      { p0, p1: p01, p2: p012, p3: p0123 },
      { p0: p0123, p1: p123, p2: p23, p3 },
    ];
  }

  function midpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function distancePointToSegment(point, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    if (dx === 0 && dy === 0) {
      return Math.hypot(point.x - a.x, point.y - a.y);
    }
    const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
    const clamped = Math.max(0, Math.min(1, t));
    const px = a.x + clamped * dx;
    const py = a.y + clamped * dy;
    return Math.hypot(point.x - px, point.y - py);
  }

  function forEachCurveStrokePixel(points, callback) {
    if (!points || points.length === 0) return;
    let previous = points[0];
    callback(previous.x, previous.y);
    for (let i = 1; i < points.length; i += 1) {
      const current = points[i];
      if (current.x === previous.x && current.y === previous.y) {
        continue;
      }
      const segment = bresenhamLine(previous.x, previous.y, current.x, current.y);
      for (let j = 1; j < segment.length; j += 1) {
        callback(segment[j].x, segment[j].y);
      }
      previous = current;
    }
  }

  function updateGridDecorations() {
    const stack = dom.canvases.stack;
    if (!stack) return;
    const scale = Math.max(Number(state.scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
    const tileScreenSize = 16 * scale;
    const minorStep = scale;
    const majorMultiplier = Math.max(Number(state.majorGridSpacing) || 16, 1);
    const majorStep = Math.max(minorStep, majorMultiplier * minorStep);
    state.gridScreenStep = minorStep;
    stack.dataset.grid = state.showGrid ? 'true' : 'false';
    stack.dataset.majorGrid = state.showMajorGrid ? 'true' : 'false';
    stack.style.setProperty('--grid-screen-step', `${minorStep}px`);
    stack.style.setProperty('--grid-major-step', `${majorStep}px`);
    stack.style.setProperty('--grid-offset-x', '0px');
    stack.style.setProperty('--grid-offset-y', '0px');
    stack.style.setProperty('--grid-major-offset-x', '0px');
    stack.style.setProperty('--grid-major-offset-y', '0px');
    stack.style.setProperty('--tile-screen-size', `${tileScreenSize}px`);
    stack.style.setProperty('--tile-offset-x', '0px');
    stack.style.setProperty('--tile-offset-y', '0px');
    stack.dataset.background = state.backgroundMode;
  }

  function syncControlsWithState() {
    if (dom.controls.brushSize) {
      dom.controls.brushSize.value = String(state.brushSize);
    }
    if (dom.controls.brushSizeValue) {
      dom.controls.brushSizeValue.textContent = `${state.brushSize}px`;
    }
    if (dom.controls.canvasWidth) {
      dom.controls.canvasWidth.value = String(state.width);
    }
    if (dom.controls.canvasHeight) {
      dom.controls.canvasHeight.value = String(state.height);
    }
    if (dom.controls.toggleGrid instanceof HTMLInputElement) {
      dom.controls.toggleGrid.checked = state.showGrid;
    }
    if (dom.controls.toggleMajorGrid instanceof HTMLInputElement) {
      dom.controls.toggleMajorGrid.checked = state.showMajorGrid;
    }
    if (dom.controls.toggleBackgroundMode) {
      const labelMap = {
        dark: '背景:黒',
        light: '背景:白',
        pink: '背景:桃',
      };
      dom.controls.toggleBackgroundMode.setAttribute('aria-pressed', String(state.backgroundMode !== 'dark'));
      dom.controls.toggleBackgroundMode.textContent = labelMap[state.backgroundMode] || '背景';
    }
    if (dom.controls.toggleChecker) {
      dom.controls.toggleChecker.checked = state.showChecker;
    }
    if (dom.canvases.stack) {
      dom.canvases.stack.classList.toggle('is-flat', !state.showChecker);
    }
    if (dom.controls.togglePixelPreview) {
      dom.controls.togglePixelPreview.checked = state.showPixelGuides;
    }
    if (dom.controls.toggleVirtualCursor) {
      dom.controls.toggleVirtualCursor.checked = state.showVirtualCursor;
    }
    updateFloatingDrawButtonScaleControl();
    if (dom.controls.zoomSlider) {
      dom.controls.zoomSlider.value = String(getZoomStepIndex(state.scale));
    }
    if (dom.controls.zoomLevel) {
      dom.controls.zoomLevel.textContent = formatZoomLabel(state.scale);
    }
    if (toolButtons.length) {
      setActiveTool(state.tool, toolButtons, { persist: false });
    }
    updateColorTabSwatch();
    updateLeftTabUI();
    updateLeftTabVisibility();
    updateRightTabUI();
    updateRightTabVisibility();
    updateGridDecorations();
    updateHistoryButtons();
    updateCanvasControlButtons();
    updatePixfindModeUI();
    updateExportOriginalToggleUI();
  }

  function getMaxSpriteMultiplier() {
    const largest = Math.max(state.width || 0, state.height || 0);
    if (!largest) return 1;
    return Math.max(1, Math.floor(MAX_CANVAS_SIZE / largest));
  }

  function updateSpriteScaleControlLimits() {
    const input = dom.controls.spriteScaleInput;
    const button = dom.controls.applySpriteScale;
    if (!input) return;
    const maxMultiplier = getMaxSpriteMultiplier();
    if (maxMultiplier <= 1) {
      input.min = '1';
      input.max = '1';
      input.value = '1';
      input.disabled = true;
      if (button) button.setAttribute('disabled', 'true');
    } else {
      input.min = '1';
      input.max = String(maxMultiplier);
      const current = Math.max(1, Math.min(maxMultiplier, Math.floor(Number(input.value) || 1)));
      input.value = String(current);
      input.disabled = false;
      if (button) {
        if (current > 1) button.removeAttribute('disabled');
        else button.setAttribute('disabled', 'true');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Autosave & File System Access support
  // -------------------------------------------------------------------------

  function updateAutosaveStatus(message, tone = 'info') {
    const statusNode = dom.controls.autosaveStatus;
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.dataset.tone = tone;
  }

  function setupAutosaveControls() {
    const button = dom.controls.enableAutosave;
    if (!button) return;
    if (!AUTOSAVE_SUPPORTED) {
      button.disabled = true;
      updateAutosaveStatus('自動保存: このブラウザでは利用できません', 'warn');
      return;
    }
    if (button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', async () => {
      if (pendingAutosaveHandle && !autosaveHandle) {
        const reauthorized = await attemptAutosaveReauthorization();
        if (reauthorized) {
          return;
        }
      }
      requestAutosaveBinding({ suggestedName: createAutosaveFileName() });
    });
  }

  async function initializeAutosave() {
    setupAutosaveControls();
    const button = dom.controls.enableAutosave;
    if (!AUTOSAVE_SUPPORTED) {
      return;
    }

    updateAutosaveStatus('自動保存: 初期化中…');

    try {
      const handle = await loadStoredAutosaveHandle();
      if (!handle) {
        updateAutosaveStatus('自動保存: 未設定');
        return;
      }
      const granted = await ensureHandlePermission(handle, { request: false });
      if (granted) {
        autosaveHandle = handle;
        if (button) {
          button.textContent = '自動保存先を変更';
        }
        if (lensImportRequested) {
          updateAutosaveStatus('自動保存: 設定済み (PiXiEELENS からの画像を読み込み中)', 'info');
        } else {
          const restored = await restoreAutosaveDocument(handle);
          if (restored) {
            updateAutosaveStatus('自動保存: 有効');
          }
        }
      } else {
        schedulePendingAutosavePermission(handle);
      }
    } catch (error) {
      console.warn('Autosave initialisation failed', error);
      updateAutosaveStatus('自動保存: 初期化でエラーが発生しました', 'error');
    }
  }

  function scheduleAutosaveSnapshot() {
    if (!AUTOSAVE_SUPPORTED) return;
    if (!autosaveHandle) return;
    if (autosaveRestoring) return;
    if (!autosaveDirty) return;
    if (autosaveWriteTimer !== null) {
      window.clearTimeout(autosaveWriteTimer);
    }
    autosaveWriteTimer = window.setTimeout(() => {
      autosaveWriteTimer = null;
      writeAutosaveSnapshot().catch(error => {
        console.warn('Autosave failed', error);
        updateAutosaveStatus('自動保存: 保存に失敗しました', 'error');
      });
    }, AUTOSAVE_WRITE_DELAY);
  }

  async function writeAutosaveSnapshot(force = false) {
    if (!AUTOSAVE_SUPPORTED) return;
    if (!autosaveHandle) return;
    if (!force && !autosaveDirty) return;
    const granted = await ensureHandlePermission(autosaveHandle, { request: false });
    if (!granted) {
      schedulePendingAutosavePermission(autosaveHandle);
      autosaveHandle = null;
      return;
    }
    try {
      updateAutosaveStatus('自動保存: 保存中…');
      const snapshot = makeHistorySnapshot();
      const payload = serializeDocumentSnapshot(snapshot);
      const json = JSON.stringify({ version: DOCUMENT_FILE_VERSION, document: payload, updatedAt: new Date().toISOString() });
      const writable = await autosaveHandle.createWritable();
      await writable.write(json);
      await writable.close();
      autosaveDirty = false;
      updateAutosaveStatus('自動保存: 保存済み', 'success');
      recordRecentProject(autosaveHandle, snapshot).catch(error => {
        console.warn('Failed to update recent projects snapshot', error);
      });
    } catch (error) {
      throw error;
    }
  }

  async function restoreAutosaveDocument(handle) {
    try {
      const file = await handle.getFile();
      if (!file) {
        return false;
      }
      const text = await file.text();
      if (!text) {
        updateAutosaveStatus('自動保存: 新しいファイルに保存します');
        return false;
      }
      const parsed = JSON.parse(text);
      const payload = parsed && typeof parsed === 'object' && parsed.document ? parsed.document : parsed;
      const snapshot = deserializeDocumentPayload(payload);
      autosaveRestoring = true;
      applyHistorySnapshot(snapshot);
      history.past = [];
      history.future = [];
      history.pending = null;
      autosaveRestoring = false;
      autosaveDirty = false;
      syncPixfindSnapshotAfterDocumentReset();
      updateMemoryStatus();
      return true;
    } catch (error) {
      autosaveRestoring = false;
      console.warn('Failed to restore autosave document', error);
      updateAutosaveStatus('自動保存: ファイルを読み込めませんでした', 'error');
      return false;
    }
  }

  async function requestAutosaveBinding(options = {}) {
    if (!AUTOSAVE_SUPPORTED) return;
    try {
      const suggestedNameOption = typeof options.suggestedName === 'string' ? options.suggestedName.trim() : '';
      const suggestedName = suggestedNameOption || createAutosaveFileName();
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'PiXiEEDraw ドキュメント',
            accept: {
              'application/json': ['.json', '.pxdraw', '.pixieedraw'],
              'application/x-pixieedraw': ['.pixieedraw'],
            },
          },
        ],
      });
      const granted = await ensureHandlePermission(handle, { request: true });
      if (!granted) {
        updateAutosaveStatus('自動保存: 権限が必要です', 'warn');
        return;
      }
      autosaveHandle = handle;
      pendingAutosaveHandle = null;
      clearPendingPermissionListener();
      await storeAutosaveHandle(handle);
      if (dom.controls.enableAutosave) {
        dom.controls.enableAutosave.textContent = '自動保存先を変更';
      }
      updateAutosaveStatus('自動保存: 保存中…');
      autosaveDirty = true;
      await writeAutosaveSnapshot(true);
    } catch (error) {
      if (error && error.name === 'AbortError') {
        updateAutosaveStatus('自動保存: キャンセルしました', 'warn');
        return;
      }
      console.warn('Autosave binding failed', error);
      updateAutosaveStatus('自動保存: ファイルを選択できませんでした', 'error');
    }
  }

  async function ensureAutosaveForLensImport(filename) {
    if (!AUTOSAVE_SUPPORTED) {
      return;
    }
    if (autosaveHandle) {
      autosaveDirty = true;
      scheduleAutosaveSnapshot();
      return;
    }
    const baseName = typeof filename === 'string' && filename.trim()
      ? sanitizeDocumentFileBase(filename.trim())
      : sanitizeDocumentFileBase(state.documentName);
    const suggestedName = `${baseName || 'pixiee-lens-import'}.pixieedraw`;
    updateAutosaveStatus('PiXiEELENS の画像を保存するため、保存先を選択してください。', 'info');
    try {
      await requestAutosaveBinding({ suggestedName });
    } catch (error) {
      console.warn('Autosave binding after lens import failed', error);
    }
  }

  async function ensureHandlePermission(handle, { request = false } = {}) {
    if (!handle) return false;
    const opts = { mode: 'readwrite' };
    const canQuery = typeof handle.queryPermission === 'function';
    const canRequest = typeof handle.requestPermission === 'function';

    if (!canQuery) {
      if (!request || !canRequest) {
        return false;
      }
      const outcome = await handle.requestPermission(opts);
      return outcome === 'granted';
    }

    let permission = await handle.queryPermission(opts);
    if (permission === 'granted') {
      return true;
    }
    if (!request || !canRequest) {
      return false;
    }
    permission = await handle.requestPermission(opts);
    return permission === 'granted';
  }

  function schedulePendingAutosavePermission(handle) {
    pendingAutosaveHandle = handle;
    autosaveHandle = null;
    clearPendingPermissionListener();
    updateAutosaveStatus('自動保存: 権限が必要です。キャンバスをクリックして再許可してください', 'warn');
    if (dom.controls.enableAutosave) {
      dom.controls.enableAutosave.textContent = '自動保存を再許可';
    }
    const listener = (event) => {
      const target = event?.target instanceof Element ? event.target : null;
      if (!target) {
        return;
      }
      const isEditable = Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'));
      if (isEditable) {
        return;
      }
      const isAutosaveButton = Boolean(
        dom.controls.enableAutosave
          && (target === dom.controls.enableAutosave || target.closest('#enableAutosave') === dom.controls.enableAutosave)
      );
      const isCanvasTap = Boolean(
        (dom.canvasViewport && dom.canvasViewport.contains(target))
          || isCanvasSurfaceTarget(target)
      );
      if (!isAutosaveButton && !isCanvasTap) {
        return;
      }
      clearPendingPermissionListener();
      attemptAutosaveReauthorization().catch(error => {
        console.warn('Autosave reauthorization failed', error);
        updateAutosaveStatus('自動保存: 権限を付与できませんでした', 'error');
      });
    };
    autosavePermissionListener = listener;
    window.addEventListener('pointerdown', listener, true);
  }

  function clearPendingPermissionListener() {
    if (!autosavePermissionListener) return;
    window.removeEventListener('pointerdown', autosavePermissionListener, true);
    autosavePermissionListener = null;
  }

  // -------------------------------------------------------------------------
  // iOS IndexedDB snapshot fallback
  // -------------------------------------------------------------------------

  function upgradeIosSnapshotDatabase(db) {
    if (!db) return;
    if (!db.objectStoreNames.contains(IOS_SNAPSHOT_STORE_NAME)) {
      db.createObjectStore(IOS_SNAPSHOT_STORE_NAME, { keyPath: 'id' });
    }
  }

  function ensureIosSnapshotDatabase() {
    if (!IOS_SNAPSHOT_SUPPORTED) {
      return Promise.resolve(null);
    }
    if (iosSnapshotDbPromise) {
      return iosSnapshotDbPromise;
    }
    iosSnapshotDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(IOS_SNAPSHOT_DB_NAME, IOS_SNAPSHOT_DB_VERSION);
      request.onupgradeneeded = event => {
        const database = event.target.result;
        upgradeIosSnapshotDatabase(database);
      };
      request.onsuccess = () => {
        const database = request.result;
        if (database) {
          database.onversionchange = () => {
            database.close();
          };
        }
        resolve(database);
      };
      request.onerror = () => {
        reject(request.error || new Error('Failed to open iOS snapshot database'));
      };
      request.onblocked = () => {
        console.warn('iOS snapshot database upgrade is blocked by another tab');
      };
    })
      .catch(error => {
        console.warn('Failed to initialise iOS snapshot database', error);
        iosSnapshotDbPromise = null;
        return null;
      });
    return iosSnapshotDbPromise;
  }

  function bindIosSnapshotUnloadListener() {
    if (!IOS_SNAPSHOT_SUPPORTED) return;
    if (iosSnapshotUnloadListenerBound) return;
    const flush = () => {
      persistIosSnapshot(true).catch(() => {
        // Ignore unload persistence failures
      });
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    iosSnapshotUnloadListenerBound = true;
  }

  function scheduleIosSnapshotPersist() {
    if (!IOS_SNAPSHOT_SUPPORTED) return;
    if (iosSnapshotRestoring) return;
    iosSnapshotDirty = true;
    if (iosSnapshotTimer !== null) {
      return;
    }
    iosSnapshotTimer = window.setTimeout(() => {
      iosSnapshotTimer = null;
      const shouldWrite = iosSnapshotDirty;
      iosSnapshotDirty = false;
      if (!shouldWrite) return;
      persistIosSnapshot().catch(error => {
        console.warn('Failed to persist iOS snapshot', error);
      });
    }, IOS_SNAPSHOT_WRITE_DELAY);
  }

  async function persistIosSnapshot(force = false) {
    if (!IOS_SNAPSHOT_SUPPORTED) return;
    if (iosSnapshotRestoring) return;
    if (!force && !iosSnapshotDirty) return;
    const database = await ensureIosSnapshotDatabase();
    if (!database) {
      return;
    }
    iosSnapshotDirty = false;
    let snapshotText = '';
    try {
      const snapshot = makeHistorySnapshot();
      const payload = serializeDocumentSnapshot(snapshot);
      snapshotText = JSON.stringify({
        version: DOCUMENT_FILE_VERSION,
        snapshot: payload,
      });
    } catch (error) {
      console.warn('Failed to create iOS snapshot payload', error);
      return;
    }
    let data = snapshotText;
    let compressed = false;
    if (snapshotText.length > IOS_SNAPSHOT_COMPRESSION_THRESHOLD) {
      try {
        data = textCompression.compressToUTF16(snapshotText);
        if (typeof data === 'string' && data.length) {
          compressed = true;
        } else {
          data = snapshotText;
        }
      } catch (error) {
        console.warn('Failed to compress iOS snapshot payload', error);
        data = snapshotText;
      }
    }
    await new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(IOS_SNAPSHOT_STORE_NAME, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('iOS snapshot transaction aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('iOS snapshot transaction error'));
        const store = transaction.objectStore(IOS_SNAPSHOT_STORE_NAME);
        store.put({
          id: IOS_SNAPSHOT_KEY,
          data,
          compressed,
          savedAt: Date.now(),
          size: snapshotText.length,
        });
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      iosSnapshotDirty = true;
      throw error;
    });
  }

  async function restoreIosSnapshotFallback() {
    if (!IOS_SNAPSHOT_SUPPORTED) return false;
    const database = await ensureIosSnapshotDatabase();
    if (!database) {
      return false;
    }
    const record = await new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(IOS_SNAPSHOT_STORE_NAME, 'readonly');
        transaction.oncomplete = () => {};
        transaction.onabort = () => reject(transaction.error || new Error('iOS snapshot read aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('iOS snapshot read error'));
        const store = transaction.objectStore(IOS_SNAPSHOT_STORE_NAME);
        const request = store.get(IOS_SNAPSHOT_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('iOS snapshot get failed'));
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      console.warn('Failed to read iOS snapshot', error);
      return null;
    });
    if (!record || !record.data) {
      return false;
    }
    let snapshotText = '';
    if (record.compressed) {
      try {
        snapshotText = textCompression.decompressFromUTF16(record.data) || '';
      } catch (error) {
        console.warn('Failed to decompress iOS snapshot payload', error);
        snapshotText = '';
      }
    } else if (typeof record.data === 'string') {
      snapshotText = record.data;
    }
    if (!snapshotText) {
      return false;
    }
    let payload;
    try {
      const parsed = JSON.parse(snapshotText);
      payload = parsed && typeof parsed === 'object' && parsed.snapshot ? parsed.snapshot : parsed;
    } catch (error) {
      console.warn('Failed to parse iOS snapshot payload', error);
      return false;
    }
    let snapshot;
    try {
      snapshot = deserializeDocumentPayload(payload);
    } catch (error) {
      console.warn('Failed to deserialize iOS snapshot', error);
      return false;
    }
    iosSnapshotRestoring = true;
    try {
      applyHistorySnapshot(snapshot);
      history.past = [];
      history.future = [];
      history.pending = null;
      updateMemoryStatus();
    } finally {
      iosSnapshotRestoring = false;
    }
    return true;
  }

  async function initializeIosSnapshotFallback() {
    if (!IOS_SNAPSHOT_SUPPORTED) return;
    if (iosSnapshotInitialized) return;
    iosSnapshotInitialized = true;
    try {
      const restored = await restoreIosSnapshotFallback();
      if (restored) {
        console.info('Restored canvas from iOS IndexedDB snapshot');
      }
    } catch (error) {
      console.warn('Failed to restore iOS snapshot', error);
    }
    bindIosSnapshotUnloadListener();
  }

  async function attemptAutosaveReauthorization() {
    if (!pendingAutosaveHandle) {
      return false;
    }
    const handle = pendingAutosaveHandle;
    clearPendingPermissionListener();
    const granted = await ensureHandlePermission(handle, { request: true });
    if (!granted) {
      updateAutosaveStatus('自動保存: 権限が必要です。右のボタンから再許可してください', 'warn');
      schedulePendingAutosavePermission(handle);
      return false;
    }
    pendingAutosaveHandle = null;
    autosaveHandle = handle;
    if (dom.controls.enableAutosave) {
      dom.controls.enableAutosave.textContent = '自動保存先を変更';
    }
    try {
      const restored = await restoreAutosaveDocument(handle);
      if (restored) {
        updateAutosaveStatus('自動保存: 有効', 'success');
      } else {
        updateAutosaveStatus('自動保存: 保存中…', 'info');
      }
    } catch (error) {
      console.warn('Autosave restore after reauthorization failed', error);
      updateAutosaveStatus('自動保存: 復元に失敗しました', 'error');
    }
    return true;
  }

  async function openDocumentDialog() {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          excludeAcceptAllOption: false,
          types: [
            {
              description: '対応ファイル (PiXiEEDraw / PNG / GIF)',
              accept: {
                'application/json': ['.json', '.pxdraw', '.pixieedraw'],
                'application/x-pixieedraw': ['.pixieedraw'],
                'image/png': ['.png'],
                'image/gif': ['.gif'],
              },
            },
          ],
        });
        if (!handle) {
          return false;
        }
        await loadDocumentFromHandle(handle);
        return true;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return false;
        }
        console.warn('Document open failed', error);
        const message = error?.source === 'image-import'
          ? '画像の読み込みに失敗しました'
          : 'ドキュメントを開けませんでした';
        updateAutosaveStatus(message, 'error');
        return false;
      }
    }
    return openDocumentViaInput();
  }

  function openDocumentViaInput() {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      const acceptTypes = [
        '.json',
        '.pxdraw',
        '.pixieedraw',
        '.png',
        '.gif',
        'application/json',
        'application/x-pixieedraw',
        'image/png',
        'image/gif',
      ];
      if (IS_IOS_DEVICE) {
        acceptTypes.push('.txt', 'text/plain');
      }
      input.accept = acceptTypes.join(',');
      input.style.display = 'none';
      let settled = false;
      const finish = success => {
        if (settled) return;
        settled = true;
        resolve(Boolean(success));
      };
      const cleanup = () => {
        input.value = '';
        input.remove();
      };
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        cleanup();
        if (!file) {
          finish(false);
          return;
        }
        try {
          if (isImportableImageFile(file)) {
            await loadDocumentFromImageFile(file);
          } else {
            const text = await file.text();
            await loadDocumentFromText(text, null);
          }
          finish(true);
        } catch (error) {
          console.warn('Document load failed', error);
          const message = isImportableImageFile(file) ? '画像の読み込みに失敗しました' : 'ドキュメントを開けませんでした';
          updateAutosaveStatus(message, 'error');
          finish(false);
        }
      });
      input.addEventListener('cancel', () => {
        cleanup();
        finish(false);
      });
      input.addEventListener('click', () => {
        input.value = '';
      });
      document.body.appendChild(input);
      input.click();
    });
  }

  function isGifFile(file) {
    if (!file) return false;
    const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
    if (type === 'image/gif') {
      return true;
    }
    const name = typeof file.name === 'string' ? file.name.toLowerCase() : '';
    return name.endsWith('.gif');
  }

  function isImportableImageFile(file) {
    if (!file) return false;
    const type = typeof file.type === 'string' ? file.type.toLowerCase() : '';
    if (type === 'image/png' || type === 'image/gif') {
      return true;
    }
    const name = typeof file.name === 'string' ? file.name.toLowerCase() : '';
    return name.endsWith('.png') || name.endsWith('.gif');
  }

  function createImageImportError(message, cause) {
    const error = new Error(message);
    error.source = 'image-import';
    if (cause) {
      error.cause = cause;
    }
    return error;
  }

  function normalizeImportFrameDuration(durationMs) {
    const numeric = Number(durationMs);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return DEFAULT_IMPORT_FRAME_DURATION;
    }
    return clamp(Math.round(numeric), IMPORT_FRAME_DURATION_MIN_MS, IMPORT_FRAME_DURATION_MAX_MS);
  }

  function resolveImageImportTargetSize(width, height) {
    const sourceWidth = Math.max(1, Math.floor(Number(width) || 0));
    const sourceHeight = Math.max(1, Math.floor(Number(height) || 0));
    if (!sourceWidth || !sourceHeight) {
      throw createImageImportError('画像サイズが不正です');
    }
    if (sourceWidth > MAX_IMAGE_IMPORT_SOURCE_SIZE || sourceHeight > MAX_IMAGE_IMPORT_SOURCE_SIZE) {
      throw createImageImportError(`読み込み元画像は最大 ${MAX_IMAGE_IMPORT_SOURCE_SIZE}px までです`);
    }
    if (sourceWidth <= MAX_CANVAS_SIZE && sourceHeight <= MAX_CANVAS_SIZE) {
      return {
        sourceWidth,
        sourceHeight,
        width: sourceWidth,
        height: sourceHeight,
        scaled: false,
      };
    }
    const ratio = Math.min(MAX_CANVAS_SIZE / sourceWidth, MAX_CANVAS_SIZE / sourceHeight);
    const widthScaled = clamp(Math.floor(sourceWidth * ratio), 1, MAX_CANVAS_SIZE);
    const heightScaled = clamp(Math.floor(sourceHeight * ratio), 1, MAX_CANVAS_SIZE);
    return {
      sourceWidth,
      sourceHeight,
      width: widthScaled,
      height: heightScaled,
      scaled: widthScaled !== sourceWidth || heightScaled !== sourceHeight,
    };
  }

  function createImageDataFromPixels(pixels, width, height) {
    if (typeof ImageData === 'function') {
      try {
        return new ImageData(pixels, width, height);
      } catch (error) {
        // Fall through to canvas-based creation.
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d || typeof ctx2d.createImageData !== 'function') {
      throw createImageImportError('画像を処理できませんでした');
    }
    const imageData = ctx2d.createImageData(width, height);
    imageData.data.set(pixels);
    return imageData;
  }

  function resizeImageDataNearest(imageData, targetWidth, targetHeight) {
    if (!imageData || !Number.isFinite(imageData.width) || !Number.isFinite(imageData.height)) {
      throw createImageImportError('画像を処理できませんでした');
    }
    const sourceWidth = Math.max(1, Math.floor(imageData.width));
    const sourceHeight = Math.max(1, Math.floor(imageData.height));
    const width = Math.max(1, Math.floor(targetWidth));
    const height = Math.max(1, Math.floor(targetHeight));
    if (sourceWidth === width && sourceHeight === height) {
      return imageData;
    }
    const source = imageData.data instanceof Uint8ClampedArray ? imageData.data : null;
    if (!source || source.length < sourceWidth * sourceHeight * 4) {
      throw createImageImportError('画像を処理できませんでした');
    }
    const output = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      const srcY = Math.min(sourceHeight - 1, Math.floor(y * sourceHeight / height));
      const srcRow = srcY * sourceWidth;
      const dstRow = y * width;
      for (let x = 0; x < width; x += 1) {
        const srcX = Math.min(sourceWidth - 1, Math.floor(x * sourceWidth / width));
        const srcBase = (srcRow + srcX) * 4;
        const dstBase = (dstRow + x) * 4;
        output[dstBase] = source[srcBase];
        output[dstBase + 1] = source[srcBase + 1];
        output[dstBase + 2] = source[srcBase + 2];
        output[dstBase + 3] = source[srcBase + 3];
      }
    }
    return createImageDataFromPixels(output, width, height);
  }

  function resizeImportFrames(frames, targetWidth, targetHeight) {
    if (!Array.isArray(frames) || !frames.length) {
      return [];
    }
    return frames.map((frameInfo) => {
      const imageData = frameInfo?.imageData;
      if (!imageData || !Number.isFinite(imageData.width) || !Number.isFinite(imageData.height)) {
        return {
          ...frameInfo,
          imageData: null,
        };
      }
      const resized = resizeImageDataNearest(imageData, targetWidth, targetHeight);
      return {
        ...frameInfo,
        imageData: resized,
      };
    });
  }

  function buildIndexedPaletteFromImageData(data, maxColors = MAX_IMPORTED_PALETTE_COLORS) {
    if (!(data instanceof Uint8ClampedArray)) {
      return { palette: [], indices: new Int16Array(0), overflow: false };
    }
    const pixelCount = Math.floor(data.length / 4);
    const colorMap = new Map();
    const palette = [];
    let overflow = false;

    for (let i = 0; i < pixelCount; i += 1) {
      const base = i * 4;
      const a = data[base + 3];
      if (a === 0) {
        continue;
      }
      const r = data[base];
      const g = data[base + 1];
      const b = data[base + 2];
      const key = `${r},${g},${b},${a}`;
      if (!colorMap.has(key)) {
        if (palette.length >= maxColors) {
          overflow = true;
          break;
        }
        colorMap.set(key, palette.length);
        palette.push({ r, g, b, a });
      }
    }

    if (overflow) {
      return { palette, indices: null, overflow: true };
    }

    const indices = new Int16Array(pixelCount).fill(-1);
    for (let i = 0; i < pixelCount; i += 1) {
      const base = i * 4;
      const a = data[base + 3];
      if (a === 0) {
        continue;
      }
      const r = data[base];
      const g = data[base + 1];
      const b = data[base + 2];
      const key = `${r},${g},${b},${a}`;
      const paletteIndex = colorMap.get(key);
      if (paletteIndex !== undefined) {
        indices[i] = paletteIndex;
      }
    }

    return { palette, indices, overflow: false };
  }

  function dataUrlToBlob(dataUrl) {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      return null;
    }
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
      return null;
    }
    const mimeType = match[1] || 'application/octet-stream';
    const base64Data = match[2] || '';
    try {
      const binary = atob(base64Data);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeType });
    } catch (error) {
      console.warn('Failed to convert data URL to blob', error);
      return null;
    }
  }

  async function loadDocumentFromImageFile(file) {
    let importResult;
    try {
      importResult = await decodeImageFileToFrames(file);
    } catch (error) {
      throw createImageImportError('画像を読み込めませんでした', error);
    }

    const framesData = Array.isArray(importResult?.frames) ? importResult.frames : [];
    if (!framesData.length) {
      throw createImageImportError('画像を読み込めませんでした');
    }

    const inferredWidth = Number(importResult?.width ?? framesData[0]?.imageData?.width ?? 0);
    const inferredHeight = Number(importResult?.height ?? framesData[0]?.imageData?.height ?? 0);
    if (!Number.isFinite(inferredWidth) || !Number.isFinite(inferredHeight) || inferredWidth <= 0 || inferredHeight <= 0) {
      throw createImageImportError('画像サイズが不正です');
    }

    const importSize = resolveImageImportTargetSize(inferredWidth, inferredHeight);
    const width = importSize.width;
    const height = importSize.height;
    const normalizedFramesData = importSize.scaled
      ? resizeImportFrames(framesData, width, height)
      : framesData;

    const paletteSource = state.palette && state.palette.length
      ? state.palette
      : createInitialState({ width, height }).palette;

    const frames = [];
    let palette = [];
    let activePaletteIndex = 0;
    let activeRgb = { r: 255, g: 255, b: 255, a: 255 };

    if (normalizedFramesData.length === 1) {
      const frameInfo = normalizedFramesData[0];
      const imageData = frameInfo?.imageData;
      if (!imageData || !Number.isFinite(imageData.width) || !Number.isFinite(imageData.height)) {
        throw createImageImportError('画像を読み込めませんでした');
      }
      const layer = createLayer('画像レイヤー', width, height);
      const extraction = buildIndexedPaletteFromImageData(imageData.data);
      if (!extraction.overflow && extraction.palette.length > 0) {
        layer.indices = extraction.indices;
        layer.direct = null;
        palette = extraction.palette.map(color => ({ ...color }));
        activePaletteIndex = 0;
        activeRgb = { ...palette[activePaletteIndex] };
      } else {
        const direct = ensureLayerDirect(layer, width, height);
        direct.set(imageData.data);
        palette = paletteSource.map(color => ({ ...color }));
        activePaletteIndex = palette.length
          ? clamp(state.activePaletteIndex ?? 0, 0, palette.length - 1)
          : 0;
        activeRgb = state.activeRgb
          ? { ...state.activeRgb }
          : (palette[activePaletteIndex] ? { ...palette[activePaletteIndex] } : { r: 255, g: 255, b: 255, a: 255 });
      }
      frames.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `frame-${Date.now().toString(36)}`,
        name: 'フレーム 1',
        duration: normalizeImportFrameDuration(frameInfo?.duration),
        layers: [layer],
      });
    } else {
      palette = paletteSource.map(color => ({ ...color }));
      activePaletteIndex = palette.length
        ? clamp(state.activePaletteIndex ?? 0, 0, palette.length - 1)
        : 0;
      activeRgb = state.activeRgb
        ? { ...state.activeRgb }
        : (palette[activePaletteIndex] ? { ...palette[activePaletteIndex] } : { r: 255, g: 255, b: 255, a: 255 });

      normalizedFramesData.forEach((frameInfo, index) => {
        const layer = createLayer('画像レイヤー', width, height);
        layer.indices.fill(-1);
        const direct = ensureLayerDirect(layer, width, height);
        if (frameInfo?.imageData?.data instanceof Uint8ClampedArray
          && frameInfo.imageData.width === width
          && frameInfo.imageData.height === height) {
          direct.set(frameInfo.imageData.data);
        } else {
          direct.fill(0);
        }
        frames.push({
          id: crypto.randomUUID ? crypto.randomUUID() : `frame-${Date.now().toString(36)}-${index}`,
          name: `フレーム ${index + 1}`,
          duration: normalizeImportFrameDuration(frameInfo?.duration),
          layers: [layer],
        });
      });
    }

    const activeLayerId = frames[0]?.layers[0]?.id;
    if (!activeLayerId) {
      throw createImageImportError('画像を読み込めませんでした');
    }

    const documentName = normalizeDocumentName(typeof file?.name === 'string' ? file.name : state.documentName);
    const activeToolGroup = TOOL_GROUPS[state.activeToolGroup] ? state.activeToolGroup : (TOOL_TO_GROUP[state.tool] || 'pen');

    const snapshot = {
      width,
      height,
      scale: normalizeZoomScale(state.scale, state.scale || MIN_ZOOM_SCALE),
      pan: { x: 0, y: 0 },
      tool: state.tool,
      brushSize: state.brushSize,
      palette,
      activePaletteIndex,
      activeRgb,
      frames,
      activeFrame: 0,
      activeLayer: activeLayerId,
      selectionMask: null,
      selectionBounds: null,
      showGrid: state.showGrid ?? true,
      showMajorGrid: state.showMajorGrid ?? true,
      gridScreenStep: state.gridScreenStep ?? 8,
      majorGridSpacing: state.majorGridSpacing ?? 16,
      backgroundMode: state.backgroundMode ?? 'dark',
      documentName,
      showPixelGuides: state.showPixelGuides ?? true,
      showVirtualCursor: state.showVirtualCursor ?? false,
      showChecker: state.showChecker ?? true,
      activeToolGroup,
      lastGroupTool: { ...DEFAULT_GROUP_TOOL, ...(state.lastGroupTool || {}) },
      activeLeftTab: state.activeLeftTab ?? 'tools',
      activeRightTab: state.activeRightTab ?? 'frames',
    };

    applyHistorySnapshot(snapshot);
    history.past = [];
    history.future = [];
    history.pending = null;
    updateHistoryButtons();
    resetExportScaleDefaults();
    syncPixfindSnapshotAfterDocumentReset();

    autosaveHandle = null;
    pendingAutosaveHandle = null;
    clearPendingPermissionListener();

    if (AUTOSAVE_SUPPORTED) {
      clearStoredAutosaveHandle().catch(error => {
        console.warn('Failed to clear previous autosave handle', error);
      });
      if (dom.controls.enableAutosave) {
        dom.controls.enableAutosave.textContent = '自動保存先を変更';
      }
      const suggestedName = createAutosaveFileName(documentName);
      updateAutosaveStatus('自動保存: 保存先を選択してください', 'info');
      requestAutosaveBinding({ suggestedName }).catch(error => {
        console.warn('Autosave binding after image import failed', error);
        updateAutosaveStatus('自動保存: 保存先を設定できませんでした', 'error');
      });
    } else {
      if (importSize.scaled) {
        updateAutosaveStatus(
          `画像を読み込みました (${importSize.sourceWidth}x${importSize.sourceHeight} → ${width}x${height})`,
          'success'
        );
      } else {
        updateAutosaveStatus('画像を読み込みました', 'success');
      }
    }
    scheduleSessionPersist();
  }

  async function fallbackRestoreAutosaveAfterLensFailure() {
    if (!lensImportRequested) {
      return;
    }
    if (!autosaveHandle) {
      return;
    }
    try {
      const restored = await restoreAutosaveDocument(autosaveHandle);
      if (restored) {
        updateAutosaveStatus('自動保存: 有効', 'info');
      }
    } catch (error) {
      console.warn('Failed to restore autosave after PiXiEELENS import failure', error);
    }
  }

  function clearLensImportRequestParam() {
    if (typeof window === 'undefined' || typeof window.location === 'undefined') {
      return;
    }
    try {
      const currentUrl = new URL(window.location.href);
      if (!currentUrl.searchParams.has('lens')) {
        return;
      }
      currentUrl.searchParams.delete('lens');
      window.history.replaceState({}, document.title, currentUrl.toString());
    } catch (error) {
      // Ignore URL manipulation errors.
    }
  }

  function setLensImportSessionFlag() {
    if (!canUseSessionStorage) {
      return;
    }
    try {
      window.sessionStorage.setItem(LENS_IMPORT_SESSION_FLAG, '1');
    } catch (error) {
      // ignore
    }
  }

  function clearLensImportSessionFlag() {
    if (canUseSessionStorage) {
      try {
        window.sessionStorage.removeItem(LENS_IMPORT_SESSION_FLAG);
      } catch (error) {
        // ignore
      }
    }
    lensImportRequested = false;
  }

  function removeLensImportPayload() {
    try {
      window.localStorage.removeItem(LENS_IMPORT_STORAGE_KEY);
    } catch (error) {
      // ignore
    }
  }

  function finalizeLensImportAttempt({ clearPayload = false } = {}) {
    if (clearPayload) {
      removeLensImportPayload();
    }
    clearLensImportSessionFlag();
  }

  async function maybeImportLensCapture() {
    let shouldImport = false;
    try {
      const params = new URLSearchParams(window.location.search);
      shouldImport = params.get('lens') === '1';
    } catch (error) {
      shouldImport = false;
    }
    if (!shouldImport && lensImportRequested) {
      shouldImport = true;
    }
    if (!shouldImport) {
      return false;
    }

    let rawPayload = null;
    try {
      rawPayload = window.localStorage.getItem(LENS_IMPORT_STORAGE_KEY);
    } catch (error) {
      console.warn('PiXiEELENS transfer storage is not available', error);
    }

    let payload = null;
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch (error) {
        console.warn('Failed to parse PiXiEELENS transfer payload', error);
      }
    }

    clearLensImportRequestParam();

    if (!payload || typeof payload !== 'object' || typeof payload.dataUrl !== 'string') {
      updateAutosaveStatus('PiXiEELENS からのデータが見つかりませんでした', 'warn');
      await fallbackRestoreAutosaveAfterLensFailure();
      finalizeLensImportAttempt({ clearPayload: true });
      return false;
    }

    if (payload.expiresAt && Number.isFinite(payload.expiresAt) && Date.now() > payload.expiresAt) {
      updateAutosaveStatus('PiXiEELENS からのデータが期限切れです。再度送信してください。', 'warn');
      await fallbackRestoreAutosaveAfterLensFailure();
      finalizeLensImportAttempt({ clearPayload: true });
      return false;
    }

    const blob = dataUrlToBlob(payload.dataUrl);
    if (!blob) {
      updateAutosaveStatus('PiXiEELENS の画像データを読み込めませんでした', 'error');
      await fallbackRestoreAutosaveAfterLensFailure();
      finalizeLensImportAttempt({ clearPayload: true });
      return false;
    }

    const inferredName = typeof payload.filename === 'string' && payload.filename
      ? payload.filename
      : 'pixiee-lens.png';
    let file;
    try {
      file = new File([blob], inferredName, { type: blob.type || 'image/png' });
    } catch (error) {
      file = blob;
      file.name = inferredName;
    }

    try {
      await loadDocumentFromImageFile(file);
      hideStartupScreen();
      updateAutosaveStatus('PiXiEELENS から画像を取り込みました', 'success');
      await ensureAutosaveForLensImport(inferredName);
      if (AUTOSAVE_SUPPORTED && autosaveHandle) {
        try {
          await writeAutosaveSnapshot(true);
        } catch (error) {
          console.warn('Immediate autosave after PiXiEELENS import failed', error);
        }
      }
      finalizeLensImportAttempt({ clearPayload: true });
      return true;
    } catch (error) {
      console.warn('Failed to import capture from PiXiEELENS', error);
      updateAutosaveStatus('PiXiEELENS の取り込みに失敗しました', 'error');
      await fallbackRestoreAutosaveAfterLensFailure();
      finalizeLensImportAttempt();
      return false;
    }
  }

  async function decodeImageFileToFrames(file) {
    if (isGifFile(file)) {
      return await decodeGifFileToFrames(file);
    }
    const imageData = await decodeImageFileToImageData(file);
    if (!imageData) {
      throw createImageImportError('画像を読み込めませんでした');
    }
    return {
      width: imageData.width,
      height: imageData.height,
      frames: [
        {
          imageData,
          duration: DEFAULT_IMPORT_FRAME_DURATION,
        },
      ],
    };
  }

  async function decodeGifFileToFrames(file) {
    if (!file) {
      throw createImageImportError('ファイルが選択されていません');
    }
    let buffer;
    try {
      buffer = await file.arrayBuffer();
    } catch (error) {
      throw createImageImportError('画像を読み込めませんでした', error);
    }
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength === 0) {
      throw createImageImportError('画像を読み込めませんでした');
    }

    const bytes = new Uint8Array(buffer);
    const mimeType = typeof file.type === 'string' && file.type ? file.type : 'image/gif';
    if (typeof window !== 'undefined' && typeof window.ImageDecoder === 'function') {
      try {
        const decoded = await decodeGifWithImageDecoder(bytes, mimeType);
        if (decoded && Array.isArray(decoded.frames) && decoded.frames.length >= 1) {
          return decoded;
        }
      } catch (error) {
        console.warn('ImageDecoder GIF decode failed, falling back to JavaScript decoder', error);
      }
    }
    const decodedByReader = decodeGifWithReader(bytes);
    // If a static GIF decodes oddly in the JS reader path, fall back to browser image decode.
    if (decodedByReader && Array.isArray(decodedByReader.frames) && decodedByReader.frames.length === 1) {
      try {
        const fallbackImageData = await decodeImageFileToImageData(file);
        if (fallbackImageData
          && fallbackImageData.width === decodedByReader.width
          && fallbackImageData.height === decodedByReader.height) {
          decodedByReader.frames[0] = {
            imageData: fallbackImageData,
            duration: decodedByReader.frames[0]?.duration ?? DEFAULT_IMPORT_FRAME_DURATION,
          };
        }
      } catch (error) {
        console.warn('Static GIF fallback decode failed', error);
      }
    }
    return decodedByReader;
  }

  async function decodeGifWithImageDecoder(buffer, mimeType) {
    let decoder;
    try {
      decoder = new ImageDecoder({ data: buffer, type: mimeType });
    } catch (error) {
      throw createImageImportError('画像を読み込めませんでした', error);
    }
    try {
      const track = decoder.tracks?.selectedTrack ?? decoder.tracks?.[0] ?? null;
      const frameCount = Number(track?.frameCount);
      const total = Number.isFinite(frameCount) && frameCount > 0 ? frameCount : 1;
      const frames = [];
      for (let i = 0; i < total; i += 1) {
        const result = await decoder.decode({ frameIndex: i, completeFramesOnly: true });
        const bitmap = result?.image;
        const imageData = imageBitmapToImageData(bitmap);
        if (bitmap && typeof bitmap.close === 'function') {
          bitmap.close();
        }
        const durationSeconds = Number(result?.duration);
        frames.push({
          imageData,
          duration: Number.isFinite(durationSeconds) && durationSeconds > 0
            ? durationSeconds * 1000
            : DEFAULT_IMPORT_FRAME_DURATION,
        });
      }
      const width = frames[0]?.imageData?.width ?? 0;
      const height = frames[0]?.imageData?.height ?? 0;
      if (!frames.length || !width || !height) {
        throw new Error('GIF decode returned no frames');
      }
      return {
        frames,
        width,
        height,
        loopCount: typeof track?.repetitionCount === 'number' ? track.repetitionCount : null,
      };
    } catch (error) {
      throw createImageImportError('画像を読み込めませんでした', error);
    } finally {
      if (decoder && typeof decoder.close === 'function') {
        decoder.close();
      }
    }
  }

  function decodeGifWithReader(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      bytes = new Uint8Array(bytes);
    }
    let reader;
    try {
      reader = new GifReader(bytes);
    } catch (error) {
      throw createImageImportError('画像を読み込めませんでした', error);
    }
    const width = Number(reader.width);
    const height = Number(reader.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw createImageImportError('画像サイズが不正です');
    }
    const frameCount = Number(reader.numFrames());
    if (!Number.isFinite(frameCount) || frameCount <= 0) {
      throw createImageImportError('GIFにフレームが含まれていません');
    }
    const pixels = new Uint8ClampedArray(width * height * 4);
    const restoreBuffer = new Uint8ClampedArray(pixels.length);
    const backgroundColor = typeof reader.getBackgroundColor === 'function' ? reader.getBackgroundColor() : null;
    const backgroundIndex = typeof reader.getBackgroundIndex === 'function' ? reader.getBackgroundIndex() : null;
    const frames = [];
    let previousFrameInfo = null;

    if (backgroundColor && backgroundColor.a > 0) {
      fillGifCanvas(pixels, backgroundColor);
    } else {
      pixels.fill(0);
    }

    for (let i = 0; i < frameCount; i += 1) {
      const info = reader.frameInfo(i);

      if (previousFrameInfo) {
        if (previousFrameInfo.disposal === 2) {
          const fillColor = resolveDisposalFillColor(previousFrameInfo, backgroundColor, backgroundIndex);
          clearGifFrameRect(pixels, width, height, previousFrameInfo, fillColor);
        } else if (previousFrameInfo.disposal === 3) {
          pixels.set(restoreBuffer);
        }
      }

      if (info.disposal === 3) {
        restoreBuffer.set(pixels);
      }

      reader.decodeAndBlitFrameRGBA(i, pixels);
      const framePixels = new Uint8ClampedArray(pixels);
      const delayHundredths = Number(info.delay);
      frames.push({
        imageData: new ImageData(framePixels, width, height),
        duration: Number.isFinite(delayHundredths) && delayHundredths > 0
          ? delayHundredths * 10
          : DEFAULT_IMPORT_FRAME_DURATION,
      });

      previousFrameInfo = info;
    }

    return {
      frames,
      width,
      height,
      loopCount: typeof reader.loopCount === 'function' ? reader.loopCount() : null,
    };
  }

  function fillGifCanvas(pixels, color) {
    if (!color) {
      pixels.fill(0);
      return;
    }
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = color.r;
      pixels[i + 1] = color.g;
      pixels[i + 2] = color.b;
      pixels[i + 3] = color.a;
    }
  }

  function resolveDisposalFillColor(frameInfo, backgroundColor, backgroundIndex) {
    if (!backgroundColor) {
      return null;
    }
    const transparentIndex = typeof frameInfo?.transparent_index === 'number' ? frameInfo.transparent_index : null;
    if (transparentIndex !== null && transparentIndex >= 0) {
      if (typeof backgroundIndex === 'number' && backgroundIndex === transparentIndex) {
        return null;
      }
    }
    return backgroundColor;
  }

  function clearGifFrameRect(pixels, width, height, frame, fillColor = null) {
    const rawX = Number(frame.x);
    const rawY = Number(frame.y);
    const rawW = Number(frame.width);
    const rawH = Number(frame.height);
    const x = clamp(Number.isFinite(rawX) ? rawX : 0, 0, width);
    const y = clamp(Number.isFinite(rawY) ? rawY : 0, 0, height);
    const availableW = width - x;
    const availableH = height - y;
    const w = clamp(Number.isFinite(rawW) ? rawW : availableW, 0, availableW);
    const h = clamp(Number.isFinite(rawH) ? rawH : availableH, 0, availableH);
    if (w === 0 || h === 0) {
      return;
    }
    for (let row = 0; row < h; row += 1) {
      const offset = ((y + row) * width + x) * 4;
      if (!fillColor) {
        pixels.fill(0, offset, offset + w * 4);
      } else {
        let cursor = offset;
        for (let col = 0; col < w; col += 1) {
          pixels[cursor] = fillColor.r;
          pixels[cursor + 1] = fillColor.g;
          pixels[cursor + 2] = fillColor.b;
          pixels[cursor + 3] = fillColor.a;
          cursor += 4;
        }
      }
    }
  }

  async function decodeImageFileToImageData(file) {
    if (!file) {
      throw createImageImportError('ファイルが選択されていません');
    }
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(file);
        try {
          return imageBitmapToImageData(bitmap);
        } finally {
          if (typeof bitmap.close === 'function') {
            bitmap.close();
          }
        }
      } catch (error) {
        console.warn('createImageBitmap failed, falling back to Image', error);
      }
    }
    return await imageElementToImageData(file);
  }

  function imageBitmapToImageData(bitmap) {
    if (!bitmap || !bitmap.width || !bitmap.height) {
      throw createImageImportError('画像サイズが不正です');
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw createImageImportError('画像を処理できませんでした');
    }
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  function imageElementToImageData(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        try {
          const width = image.naturalWidth || image.width;
          const height = image.naturalHeight || image.height;
          if (!width || !height) {
            throw createImageImportError('画像サイズが不正です');
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw createImageImportError('画像を処理できませんでした');
          }
          ctx.drawImage(image, 0, 0);
          const data = ctx.getImageData(0, 0, width, height);
          resolve(data);
        } catch (error) {
          reject(createImageImportError('画像を処理できませんでした', error));
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      image.onerror = event => {
        URL.revokeObjectURL(url);
        reject(createImageImportError('画像の読み込みに失敗しました'));
      };
      image.src = url;
    });
  }

  function openExportDialog() {
    const config = dom.exportDialog;
    if (!config) {
      exportProjectWithFallback();
      return;
    }
    const dialog = config.dialog;
    if (dialog && typeof dialog.showModal === 'function') {
      refreshExportScaleControls();
      updateExportOriginalToggleUI();
      dialog.showModal();
      window.requestAnimationFrame(() => {
        queueExportAdRender();
      });
    } else {
      exportProjectWithFallback();
    }
  }

  function queueExportAdRender() {
    const adSlot = dom.exportDialog?.adSlot;
    if (!(adSlot instanceof HTMLElement)) {
      return;
    }
    if (exportAdRequested) {
      return;
    }
    if (adSlot.dataset.loaded === '1' || adSlot.getAttribute('data-adsbygoogle-status') === 'done') {
      exportAdRequested = true;
      return;
    }
    exportAdRequested = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      adSlot.dataset.loaded = '1';
    } catch (error) {
      exportAdRequested = false;
    }
  }

  function closeExportDialog() {
    const dialog = dom.exportDialog?.dialog;
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function exportProjectWithFallback() {
    const choice = window.prompt('出力形式を入力してください (png / gif / contest / pixfind / project)', 'png');
    if (!choice) {
      return;
    }
    const normalized = choice.trim().toLowerCase();
    if (normalized === 'png') {
      const candidates = getExportScaleCandidates();
      applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const maxScale = exportMaxScale || 1;
      if (maxScale > 1 && exportSheetInfo) {
        const minW = exportSheetInfo.sheetWidth;
        const minH = exportSheetInfo.sheetHeight;
        const maxW = minW * maxScale;
        const maxH = minH * maxScale;
        const scaleInput = window.prompt(
          `書き出し倍率を入力してください (1〜${maxScale})\n幅 ${minW}〜${maxW}PX / 高さ ${minH}〜${maxH}PX`,
          String(exportScale),
        );
        if (scaleInput === null) {
          return;
        }
        exportScaleUserOverride = true;
        setExportScale(scaleInput);
      }
      exportProjectAsPng();
    } else if (normalized === 'gif') {
      exportProjectAsGif();
    } else if (normalized === 'contest') {
      exportProjectToContest();
    } else if (normalized === 'pixfind') {
      exportProjectToPixfind();
    } else if (normalized === 'project') {
      saveProjectAsPixieedraw();
    } else {
      window.alert('png / gif / contest / pixfind / project のいずれかを入力してください。');
    }
  }

  function normalizeFpsValue(value) {
    return clamp(Math.round(Number(value) || 0), 1, 60);
  }

  function getDurationFromFps(fps) {
    if (!Number.isFinite(fps) || fps <= 0) {
      return 1000 / 12;
    }
    return 1000 / fps;
  }

  function updateAnimationFpsDisplay(fps, durationMs) {
    if (dom.controls.animationFps) {
      dom.controls.animationFps.value = String(fps);
    }
    if (dom.controls.animationFpsMs) {
      const rounded = Math.max(1, Math.round(Number(durationMs) || 0));
      dom.controls.animationFpsMs.textContent = `${rounded}ms`;
    }
  }

  function syncAnimationFpsDisplayFromState() {
    const frame = getActiveFrame();
    const duration = frame && Number.isFinite(frame.duration) && frame.duration > 0
      ? frame.duration
      : 1000 / 12;
    const fps = normalizeFpsValue(Math.round(1000 / duration));
    updateAnimationFpsDisplay(fps, duration);
  }

  function applyFpsToAllFrames(fpsValue) {
    const frames = state.frames;
    if (!Array.isArray(frames) || !frames.length) {
      return;
    }
    const clampedFps = normalizeFpsValue(fpsValue);
    const nextDuration = getDurationFromFps(clampedFps);
    const hasChange = frames.some(frame => Math.abs(frame.duration - nextDuration) > 0.001);
    if (!hasChange) {
      updateAnimationFpsDisplay(clampedFps, nextDuration);
      return;
    }
    beginHistory('setAllFrameFps');
    frames.forEach(frame => {
      frame.duration = nextDuration;
    });
    markHistoryDirty();
    commitHistory();
    scheduleSessionPersist();
    renderTimelineMatrix();
    updateAnimationFpsDisplay(clampedFps, nextDuration);
  }

  function setActiveFrameIndex(nextIndex, { wrap = false, persist = true, render = true } = {}) {
    const frames = state.frames;
    if (!Array.isArray(frames) || !frames.length) {
      return null;
    }
    const length = frames.length;
    const normalizedIndex = wrap
      ? ((Math.round(nextIndex) % length) + length) % length
      : clamp(Math.round(nextIndex), 0, length - 1);
    const previousIndex = state.activeFrame;
    state.activeFrame = normalizedIndex;
    const frame = frames[normalizedIndex];
    if (frame && (!frame.layers.some(layer => layer.id === state.activeLayer) || !state.activeLayer)) {
      const lastLayer = frame.layers[frame.layers.length - 1];
      if (lastLayer) {
        state.activeLayer = lastLayer.id;
      }
    }
    if (persist) {
      scheduleSessionPersist();
    }
    if (render) {
      if (previousIndex !== normalizedIndex) {
        renderFrameList();
        renderLayerList();
        requestRender();
        requestOverlayRender();
      } else {
        syncAnimationFpsDisplayFromState();
      }
    }
    updatePixfindModeUI();
    return frame;
  }

  function stepActiveFrame(offset, options = {}) {
    const frames = state.frames;
    if (!Array.isArray(frames) || !frames.length) {
      return;
    }
    const wrap = options.wrap !== false;
    const persist = options.persist !== false;
    const render = options.render !== false;
    const nextIndex = state.activeFrame + Number(offset || 0);
    setActiveFrameIndex(nextIndex, { wrap, persist, render });
  }

  function openNewProjectDialog() {
    const config = dom.newProject;
    if (!config) {
      promptNewProjectFallback();
      return;
    }
    const dialog = config.dialog;
    if (dialog && typeof dialog.showModal === 'function') {
      if (config.nameInput) {
        const currentName = state.documentName || DEFAULT_DOCUMENT_NAME;
        config.nameInput.value = extractDocumentBaseName(currentName);
      }
      if (config.widthInput) {
        config.widthInput.value = String(state.width);
      }
      if (config.heightInput) {
        config.heightInput.value = String(state.height);
      }
      dialog.showModal();
      window.requestAnimationFrame(() => {
        config.nameInput?.focus();
        config.nameInput?.select?.();
      });
      return;
    }
    promptNewProjectFallback();
  }

  function setupExportDialog() {
    const config = dom.exportDialog;
    if (!config) {
      return;
    }
    const dialog = config.dialog;
    const supportsDialog = dialog && typeof dialog.showModal === 'function';
    const bind = (element, handler) => {
      if (element) {
        element.addEventListener('click', handler);
      }
    };
    bind(config.confirm, () => {
      const mode = normalizeExportFormat(config.format?.value || 'png');
      if (mode === 'gif') {
        exportProjectAsGif();
      } else if (mode === 'contest') {
        exportProjectToContest();
      } else if (mode === 'pixfind') {
        exportProjectToPixfind();
      } else if (mode === 'project') {
        saveProjectAsPixieedraw();
      } else {
        exportProjectAsPng();
      }
      closeExportDialog();
    });
    bind(config.cancel, () => {
      closeExportDialog();
    });
    if (supportsDialog && dialog) {
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeExportDialog();
      });
    } else if (dialog) {
      dialog.hidden = true;
    }
    if (!supportsDialog && config.adContainer) {
      config.adContainer.hidden = true;
    }
    if (config.format && config.format.dataset.bound !== 'true') {
      config.format.dataset.bound = 'true';
      config.format.addEventListener('change', () => {
        updateExportOriginalToggleUI();
      });
    }
    if (config.includeOriginalToggle instanceof HTMLInputElement && config.includeOriginalToggle.dataset.bound !== 'true') {
      config.includeOriginalToggle.dataset.bound = 'true';
      config.includeOriginalToggle.checked = exportIncludeOriginalSize;
      config.includeOriginalToggle.addEventListener('change', event => {
        exportIncludeOriginalSize = Boolean(event.target.checked);
        scheduleSessionPersist({ includeSnapshots: false });
        updateExportOriginalToggleUI();
      });
    }

    const slider = config.scaleSlider;
    if (slider && slider.dataset.bound !== 'true') {
      slider.dataset.bound = 'true';
      slider.addEventListener('input', event => {
        exportScaleUserOverride = true;
        setExportScale(event.target.value);
      });
    }

    const scaleInput = config.scaleInput;
    if (scaleInput && scaleInput.dataset.bound !== 'true') {
      scaleInput.dataset.bound = 'true';
      scaleInput.addEventListener('change', event => {
        exportScaleUserOverride = true;
        setExportScale(event.target.value);
      });
    }

    const widthInput = config.pixelWidthInput;
    if (widthInput && widthInput.dataset.bound !== 'true') {
      widthInput.dataset.bound = 'true';
      widthInput.addEventListener('change', event => {
        exportScaleUserOverride = true;
        if (!exportSheetInfo) {
          syncExportScaleInputs();
          return;
        }
        const desiredWidth = Math.round(Number(event.target.value));
        if (!Number.isFinite(desiredWidth) || desiredWidth <= 0) {
          syncExportScaleInputs();
          return;
        }
        const baseWidth = Math.max(1, exportSheetInfo.sheetWidth);
        const targetScale = clamp(Math.round(desiredWidth / baseWidth), 1, exportMaxScale || 1);
        setExportScale(targetScale);
      });
    }

    const heightInput = config.pixelHeightInput;
    if (heightInput && heightInput.dataset.bound !== 'true') {
      heightInput.dataset.bound = 'true';
      heightInput.addEventListener('change', event => {
        exportScaleUserOverride = true;
        if (!exportSheetInfo) {
          syncExportScaleInputs();
          return;
        }
        const desiredHeight = Math.round(Number(event.target.value));
        if (!Number.isFinite(desiredHeight) || desiredHeight <= 0) {
          syncExportScaleInputs();
          return;
        }
        const baseHeight = Math.max(1, exportSheetInfo.sheetHeight);
        const targetScale = clamp(Math.round(desiredHeight / baseHeight), 1, exportMaxScale || 1);
        setExportScale(targetScale);
      });
    }

    updateExportOriginalToggleUI();
  }

  function closeNewProjectDialog() {
    const dialog = dom.newProject?.dialog;
    if (dialog && dialog.open) {
      dialog.close();
    }
  }

  function handleNewProjectSubmit() {
    const config = dom.newProject;
    if (config?.form && typeof config.form.reportValidity === 'function') {
      if (!config.form.reportValidity()) {
        return;
      }
    }
    const rawName = config?.nameInput?.value ?? state.documentName;
    const name = normalizeDocumentName(rawName);
    const widthValue = config?.widthInput?.value;
    const heightValue = config?.heightInput?.value;
    const width = Number(widthValue);
    const height = Number(heightValue);
    const created = createNewProject({ name, width, height });
    if (created) {
      if (config?.nameInput) {
        config.nameInput.value = extractDocumentBaseName(name);
      }
      closeNewProjectDialog();
    } else {
      window.alert(`キャンバスサイズは${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE}の数値で入力してください。`);
    }
  }

  function promptNewProjectFallback() {
    const name = window.prompt('ファイル名を入力してください', state.documentName || DEFAULT_DOCUMENT_NAME);
    if (name === null) return;
    const widthRaw = window.prompt(`キャンバスの横幅 (${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE})`, String(state.width));
    if (widthRaw === null) return;
    const heightRaw = window.prompt(`キャンバスの縦幅 (${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE})`, String(state.height));
    if (heightRaw === null) return;
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    if (!createNewProject({ name, width, height })) {
      window.alert(`キャンバスサイズは${MIN_CANVAS_SIZE}〜${MAX_CANVAS_SIZE}の数値で入力してください。`);
    }
  }

  function createNewProject({ name, width, height }) {
    const widthNumber = lockedCanvasWidth !== null ? lockedCanvasWidth : Number(width);
    const heightNumber = lockedCanvasHeight !== null ? lockedCanvasHeight : Number(height);
    if (!Number.isFinite(widthNumber) || !Number.isFinite(heightNumber)) {
      return false;
    }
    const clampedWidth = clamp(Math.round(widthNumber), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const clampedHeight = clamp(Math.round(heightNumber), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE);
    const snapshot = createInitialState({
      width: clampedWidth,
      height: clampedHeight,
      name,
    });

    applyHistorySnapshot(snapshot);
    history.past = [];
    history.future = [];
    history.pending = null;
    updateHistoryButtons();
    resetExportScaleDefaults();
    syncPixfindSnapshotAfterDocumentReset();

    if (AUTOSAVE_SUPPORTED) {
      autosaveHandle = null;
      pendingAutosaveHandle = null;
      clearPendingPermissionListener();
      clearStoredAutosaveHandle().catch(error => {
        console.warn('Failed to forget previous autosave handle', error);
      });
      const suggestedName = createAutosaveFileName(name);
      if (dom.controls.enableAutosave) {
        dom.controls.enableAutosave.textContent = '自動保存先を変更';
      }
      updateAutosaveStatus('自動保存: 保存先を選択してください', 'info');
      requestAutosaveBinding({ suggestedName }).catch(error => {
        console.warn('Autosave binding after new project failed', error);
        updateAutosaveStatus('自動保存: 保存先を設定できませんでした', 'error');
      });
    } else {
      updateAutosaveStatus('新しいプロジェクトを作成しました', 'info');
    }
    scheduleSessionPersist();
    return true;
  }

  function hasDismissedStartupScreen() {
    if (!canUseSessionStorage) {
      return false;
    }
    try {
      return window.localStorage.getItem(STARTUP_SCREEN_DISMISSED_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function markStartupScreenDismissed() {
    if (!canUseSessionStorage) {
      return;
    }
    try {
      window.localStorage.setItem(STARTUP_SCREEN_DISMISSED_KEY, '1');
    } catch (error) {
      // Ignore storage errors (private mode or quota exceeded)
    }
  }

  function showStartupScreen() {
    const container = dom.startup?.screen;
    if (!container) {
      return;
    }
    if (AUTOSAVE_SUPPORTED) {
      refreshRecentProjectsUI().catch(error => {
        console.warn('Failed to refresh recent projects', error);
      });
    } else if (dom.startup?.recentSection) {
      dom.startup.recentSection.hidden = true;
    }
    if (startupVisible) {
      return;
    }
    startupVirtualCursorState = state.showVirtualCursor;
    if (state.showVirtualCursor) {
      setVirtualCursorEnabled(false, { persist: false });
    }
    startupVisible = true;
    container.hidden = false;
    container.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-startup-active');
    window.requestAnimationFrame(() => {
      container.focus?.({ preventScroll: true });
      const defaultTarget = dom.startup?.newButton || dom.startup?.openButton || dom.startup?.skipButton || container;
      defaultTarget?.focus?.({ preventScroll: true });
    });
  }

  function hideStartupScreen() {
    const container = dom.startup?.screen;
    if (!container || !startupVisible) {
      return;
    }
    markStartupScreenDismissed();
    startupVisible = false;
    container.hidden = true;
    container.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-startup-active');
    if (startupVirtualCursorState === true) {
      setVirtualCursorEnabled(true, { persist: false });
    }
    startupVirtualCursorState = null;
    if (lensImportRequested) {
      window.history.replaceState({}, document.title, window.location.href);
      lensImportRequested = false;
    }
  }

  function setupStartupScreen() {
    const container = dom.startup?.screen;
    if (!container) {
      return;
    }
    if (dom.startup?.hint) {
      dom.startup.hint.textContent = AUTOSAVE_SUPPORTED
        ? 'ファイルを開くと既存の自動保存先を引き継ぎます。'
        : 'このブラウザでは自動保存が利用できません。エクスポートをお忘れなく。';
    }
    container.addEventListener('keydown', event => {
      if (!startupVisible) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        hideStartupScreen();
        return;
      }
      if (event.key === 'Tab') {
        const focusableSelectors = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const focusableElements = Array.from(container.querySelectorAll(focusableSelectors))
          .filter(element => !element.hasAttribute('disabled') && element.offsetParent !== null);
        if (!focusableElements.length) {
          event.preventDefault();
          container.focus();
          return;
        }
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first || document.activeElement === container) {
            event.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });
    dom.startup?.newButton?.addEventListener('click', () => {
      hideStartupScreen();
      openNewProjectDialog();
    });
    dom.startup?.openButton?.addEventListener('click', async () => {
      const opened = await openDocumentDialog();
      if (opened) {
        hideStartupScreen();
      }
    });
    dom.startup?.skipButton?.addEventListener('click', () => {
      hideStartupScreen();
    });
    dom.startup?.recentList?.addEventListener('click', async event => {
      const target = event.target instanceof Element ? event.target.closest('.startup-recent-card') : null;
      if (!target) {
        return;
      }
      const projectId = target.dataset.projectId;
      const entry = projectId ? recentProjectsCache.get(projectId) : null;
      if (!entry) {
        if (AUTOSAVE_SUPPORTED) {
          refreshRecentProjectsUI().catch(error => {
            console.warn('Failed to refresh recent projects', error);
          });
        }
        return;
      }
      target.disabled = true;
      const success = await openRecentProject(entry);
      if (!success) {
        target.disabled = false;
      }
    });
    if (AUTOSAVE_SUPPORTED) {
      refreshRecentProjectsUI().catch(error => {
        console.warn('Failed to refresh recent projects', error);
      });
    } else if (dom.startup?.recentSection) {
      dom.startup.recentSection.hidden = true;
    }
  }

  async function loadDocumentFromHandle(handle) {
    try {
      const granted = await ensureHandlePermission(handle, { request: true });
      if (!granted) {
        updateAutosaveStatus('自動保存: 権限が必要です', 'warn');
        return;
      }
      const file = await handle.getFile();
      if (isImportableImageFile(file)) {
        await loadDocumentFromImageFile(file);
        return;
      }
      const text = await file.text();
      await loadDocumentFromText(text, handle);
    } catch (error) {
      console.warn('Document handle load failed', error);
      const message = error && error.name === 'AbortError'
        ? null
        : (error?.source === 'image-import' ? '画像の読み込みに失敗しました' : 'ドキュメントを開けませんでした');
      if (message) {
        updateAutosaveStatus(message, 'error');
      }
    }
  }

  async function loadDocumentFromText(text, handle) {
    let snapshot;
    try {
      snapshot = snapshotFromDocumentText(text);
    } catch (error) {
      console.warn('Failed to parse document', error);
      updateAutosaveStatus('ドキュメントの読み込みに失敗しました', 'error');
      return;
    }

    autosaveRestoring = true;
    applyHistorySnapshot(snapshot);
    history.past = [];
    history.future = [];
    history.pending = null;
    autosaveRestoring = false;
    resetExportScaleDefaults();
    syncPixfindSnapshotAfterDocumentReset();

    if (handle) {
      const granted = await ensureHandlePermission(handle, { request: true });
      if (granted) {
        autosaveHandle = handle;
        pendingAutosaveHandle = null;
        clearPendingPermissionListener();
        await storeAutosaveHandle(handle);
        if (dom.controls.enableAutosave) {
          dom.controls.enableAutosave.textContent = '自動保存先を変更';
        }
        updateAutosaveStatus('自動保存: 有効', 'success');
      } else {
        schedulePendingAutosavePermission(handle);
      }
    } else {
      autosaveHandle = null;
      pendingAutosaveHandle = null;
      clearPendingPermissionListener();
      if (AUTOSAVE_SUPPORTED) {
        updateAutosaveStatus('自動保存: 読み込み済み。保存先を設定してください', 'warn');
      }
    }

    scheduleSessionPersist();
    scheduleAutosaveSnapshot();
    if (handle) {
      recordRecentProject(handle, snapshot).catch(error => {
        console.warn('Failed to register recent project', error);
      });
    }
  }

  function snapshotFromDocumentText(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Document text is empty');
    }
    const parsed = JSON.parse(text);
    const payload = parsed && typeof parsed === 'object' && parsed.document ? parsed.document : parsed;
    return deserializeDocumentPayload(payload);
  }

  async function storeAutosaveHandle(handle) {
    if (!AUTOSAVE_SUPPORTED) return;
    try {
      const db = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([AUTOSAVE_STORE_NAME], 'readwrite');
        const store = tx.objectStore(AUTOSAVE_STORE_NAME);
        const request = store.put(handle, AUTOSAVE_HANDLE_KEY);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
    } catch (error) {
      console.warn('Failed to store autosave handle', error);
    }
  }

  async function loadStoredAutosaveHandle() {
    if (!AUTOSAVE_SUPPORTED) return null;
    try {
      const db = await openAutosaveDatabase();
      return await new Promise((resolve, reject) => {
        let value = null;
        const tx = db.transaction([AUTOSAVE_STORE_NAME], 'readonly');
        const store = tx.objectStore(AUTOSAVE_STORE_NAME);
        const request = store.get(AUTOSAVE_HANDLE_KEY);
        request.onsuccess = () => {
          value = request.result || null;
        };
        request.onerror = () => {
          reject(request.error);
        };
        tx.oncomplete = () => {
          db.close();
          resolve(value);
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
    } catch (error) {
      console.warn('Autosave handle load failed', error);
      return null;
    }
  }

  async function clearStoredAutosaveHandle() {
    if (!AUTOSAVE_SUPPORTED) return;
    try {
      const db = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([AUTOSAVE_STORE_NAME], 'readwrite');
        const store = tx.objectStore(AUTOSAVE_STORE_NAME);
        const request = store.delete(AUTOSAVE_HANDLE_KEY);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
    } catch (error) {
      console.warn('Failed to clear autosave handle', error);
    }
  }

  async function loadRecentProjectsMetadata() {
    if (!AUTOSAVE_SUPPORTED) return [];
    try {
      const db = await openAutosaveDatabase();
      return await new Promise((resolve, reject) => {
        let entries = [];
        const tx = db.transaction([RECENT_PROJECTS_STORE], 'readonly');
        const store = tx.objectStore(RECENT_PROJECTS_STORE);
        const request = store.getAll();
        request.onsuccess = () => {
          entries = Array.isArray(request.result) ? request.result.slice() : [];
        };
        request.onerror = () => {
          reject(request.error);
        };
        tx.oncomplete = () => {
          db.close();
          entries.sort((a, b) => {
            const aTime = typeof a?.updatedAt === 'string' ? a.updatedAt : '';
            const bTime = typeof b?.updatedAt === 'string' ? b.updatedAt : '';
            return bTime.localeCompare(aTime);
          });
          resolve(entries);
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
    } catch (error) {
      console.warn('Failed to load recent projects', error);
      return [];
    }
  }

  async function saveRecentProjectsList(existingEntries, nextEntries) {
    if (!AUTOSAVE_SUPPORTED) return;
    const existingIds = new Set((existingEntries || []).map(entry => entry?.id).filter(Boolean));
    const nextIds = new Set((nextEntries || []).map(entry => entry?.id).filter(Boolean));
    try {
      const db = await openAutosaveDatabase();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([RECENT_PROJECTS_STORE], 'readwrite');
        const store = tx.objectStore(RECENT_PROJECTS_STORE);
        (nextEntries || []).forEach(entry => {
          if (!entry || !entry.id) {
            return;
          }
          store.put(entry, entry.id);
        });
        existingIds.forEach(id => {
          if (!nextIds.has(id)) {
            store.delete(id);
          }
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          const error = tx.error;
          db.close();
          reject(error);
        };
      });
    } catch (error) {
      console.warn('Failed to update recent projects', error);
    }
  }

  function setRecentProjectsCache(entries) {
    recentProjectsCache.clear();
    if (Array.isArray(entries)) {
      entries.forEach(entry => {
        if (entry && entry.id) {
          recentProjectsCache.set(entry.id, entry);
        }
      });
    }
    renderRecentProjectsList(entries || []);
  }

  function renderRecentProjectsList(entries) {
    const section = dom.startup?.recentSection;
    const list = dom.startup?.recentList;
    if (!section || !list) {
      return;
    }
    list.innerHTML = '';
    if (!AUTOSAVE_SUPPORTED || !entries || entries.length === 0) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    entries.forEach(entry => {
      if (!entry || !entry.id) {
        return;
      }
      const displayLabel = entry.fileName || entry.name || DEFAULT_DOCUMENT_NAME;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'startup-recent-card';
      card.dataset.projectId = entry.id;
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `${displayLabel} を開く`);
      const thumb = document.createElement('div');
      thumb.className = 'startup-recent-card__thumb';
      if (entry.thumbnail) {
        const img = new Image();
        img.src = entry.thumbnail;
        img.alt = `${entry.fileName || entry.name || 'プロジェクト'} のプレビュー`;
        img.decoding = 'async';
        thumb.appendChild(img);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'startup-recent-card__thumb-placeholder';
        placeholder.textContent = 'プレビューなし';
        thumb.appendChild(placeholder);
      }
      const nameNode = document.createElement('span');
      nameNode.className = 'startup-recent-card__name';
      nameNode.textContent = displayLabel;
      nameNode.title = displayLabel;
      card.appendChild(thumb);
      card.appendChild(nameNode);
      list.appendChild(card);
    });
  }

  async function refreshRecentProjectsUI() {
    const section = dom.startup?.recentSection;
    const list = dom.startup?.recentList;
    if (!section || !list) {
      return;
    }
    if (!AUTOSAVE_SUPPORTED) {
      recentProjectsCache.clear();
      list.innerHTML = '';
      section.hidden = true;
      return;
    }
    const entries = await loadRecentProjectsMetadata();
    setRecentProjectsCache(entries);
  }

  async function generateSnapshotThumbnail(snapshot) {
    if (!snapshot || !snapshot.frames || !snapshot.frames.length) {
      return null;
    }
    const width = Math.max(1, Math.floor(Number(snapshot.width) || 0));
    const height = Math.max(1, Math.floor(Number(snapshot.height) || 0));
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    const frameIndex = clamp(Number(snapshot.activeFrame) || 0, 0, snapshot.frames.length - 1);
    const frame = snapshot.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      return null;
    }
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offscreenCtx = offscreen.getContext('2d', { willReadFrequently: true });
    if (!offscreenCtx) {
      return null;
    }
    const imageData = offscreenCtx.createImageData(width, height);
    const data = imageData.data;
    const palette = Array.isArray(snapshot.palette) ? snapshot.palette : [];
    frame.layers.forEach(layer => {
      if (!layer || !layer.visible || !(layer.opacity > 0)) {
        return;
      }
      const opacity = Number.isFinite(layer.opacity) ? layer.opacity : 1;
      if (opacity <= 0) {
        return;
      }
      const indices = layer.indices instanceof Int16Array ? layer.indices : null;
      const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      if (!indices && !direct) {
        return;
      }
      for (let y = 0; y < height; y += 1) {
        const rowOffset = y * width;
        for (let x = 0; x < width; x += 1) {
          const pixelIndex = rowOffset + x;
          let srcA = 0;
          let srcR = 0;
          let srcG = 0;
          let srcB = 0;
          if (indices) {
            const paletteIndex = indices[pixelIndex];
            if (paletteIndex >= 0) {
              const color = palette[paletteIndex];
              if (!color) {
                continue;
              }
              srcR = color.r;
              srcG = color.g;
              srcB = color.b;
              srcA = color.a;
            }
          }
          if (srcA === 0 && direct) {
            const base = pixelIndex * 4;
            srcA = direct[base + 3];
            if (srcA > 0) {
              srcR = direct[base];
              srcG = direct[base + 1];
              srcB = direct[base + 2];
            }
          }
          if (srcA <= 0) {
            continue;
          }
          const destBase = pixelIndex * 4;
          const destR = data[destBase];
          const destG = data[destBase + 1];
          const destB = data[destBase + 2];
          const destA = data[destBase + 3] / 255;
          const alpha = (srcA / 255) * opacity;
          if (alpha <= 0) {
            continue;
          }
          const outA = alpha + destA * (1 - alpha);
          if (outA <= 0) {
            data[destBase] = 0;
            data[destBase + 1] = 0;
            data[destBase + 2] = 0;
            data[destBase + 3] = 0;
            continue;
          }
          const srcFactor = alpha / outA;
          const destFactor = (destA * (1 - alpha)) / outA;
          data[destBase] = Math.round(srcR * srcFactor + destR * destFactor);
          data[destBase + 1] = Math.round(srcG * srcFactor + destG * destFactor);
          data[destBase + 2] = Math.round(srcB * srcFactor + destB * destFactor);
          data[destBase + 3] = Math.round(outA * 255);
        }
      }
    });
    offscreenCtx.putImageData(imageData, 0, 0);

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = THUMBNAIL_CANVAS_SIZE;
    previewCanvas.height = THUMBNAIL_CANVAS_SIZE;
    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) {
      return null;
    }
    previewCtx.fillStyle = 'rgba(12, 20, 32, 0.92)';
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    const padding = Math.round((THUMBNAIL_CANVAS_SIZE - THUMBNAIL_MAX_EDGE) / 2);
    const scale = Math.min(
      (THUMBNAIL_CANVAS_SIZE - padding * 2) / width,
      (THUMBNAIL_CANVAS_SIZE - padding * 2) / height,
    );
    const drawWidth = Math.max(1, Math.round(width * scale));
    const drawHeight = Math.max(1, Math.round(height * scale));
    const offsetX = Math.round((THUMBNAIL_CANVAS_SIZE - drawWidth) / 2);
    const offsetY = Math.round((THUMBNAIL_CANVAS_SIZE - drawHeight) / 2);
    previewCtx.imageSmoothingEnabled = false;
    previewCtx.drawImage(offscreen, 0, 0, width, height, offsetX, offsetY, drawWidth, drawHeight);
    return previewCanvas.toDataURL('image/png');
  }

  async function recordRecentProject(handle, snapshot) {
    if (!AUTOSAVE_SUPPORTED) {
      return;
    }
    if (!handle || typeof handle !== 'object') {
      return;
    }
    try {
      const existingEntries = await loadRecentProjectsMetadata();
      const workingEntries = existingEntries.slice();
      let matchedIndex = -1;
      for (let index = 0; index < workingEntries.length; index += 1) {
        const entry = workingEntries[index];
        if (!entry || !entry.handle || typeof entry.handle.isSameEntry !== 'function') {
          continue;
        }
        try {
          const same = await entry.handle.isSameEntry(handle);
          if (same) {
            matchedIndex = index;
            break;
          }
        } catch (error) {
          // Ignore errors from isSameEntry comparisons.
        }
      }
      if (matchedIndex >= 0) {
        workingEntries.splice(matchedIndex, 1);
      }
      const id = matchedIndex >= 0
        ? existingEntries[matchedIndex].id
        : (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `project-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`);
      const fileName = (handle && typeof handle.name === 'string' && handle.name) || snapshot?.documentName || DEFAULT_DOCUMENT_NAME;
      const displayName = extractDocumentBaseName(snapshot?.documentName || fileName);
      const thumbnail = await generateSnapshotThumbnail(snapshot);
      const updatedEntry = {
        id,
        name: displayName,
        fileName,
        updatedAt: new Date().toISOString(),
        thumbnail: thumbnail || null,
        handle,
      };
      workingEntries.unshift(updatedEntry);
      const limited = workingEntries.slice(0, RECENT_PROJECT_LIMIT);
      await saveRecentProjectsList(existingEntries, limited);
      setRecentProjectsCache(limited);
    } catch (error) {
      console.warn('Failed to record recent project', error);
    }
  }

  async function openRecentProject(entry) {
    if (!entry || !entry.handle) {
      return false;
    }
    try {
      const granted = await ensureHandlePermission(entry.handle, { request: true });
      if (!granted) {
        updateAutosaveStatus('自動保存: 権限が必要です', 'warn');
        return false;
      }
      await loadDocumentFromHandle(entry.handle);
      hideStartupScreen();
      return true;
    } catch (error) {
      console.warn('Failed to open recent project', error);
      updateAutosaveStatus('プロジェクトを開けませんでした', 'error');
      return false;
    }
  }

  function serializeDocumentSnapshot(snapshot) {
    const palette = snapshot.palette.map(color => normalizeColorValue(color));
    return {
      version: DOCUMENT_FILE_VERSION,
      width: snapshot.width,
      height: snapshot.height,
      scale: snapshot.scale,
      pan: { ...snapshot.pan },
      palette,
      activePaletteIndex: snapshot.activePaletteIndex,
      activeRgb: normalizeColorValue(snapshot.activeRgb),
      frames: snapshot.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
        layers: frame.layers.map(layer => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          opacity: layer.opacity,
          indices: encodeTypedArray(layer.indices),
          direct: encodeTypedArray(layer.direct),
        })),
      })),
      showGrid: snapshot.showGrid,
      showMajorGrid: snapshot.showMajorGrid,
      gridScreenStep: snapshot.gridScreenStep,
      majorGridSpacing: snapshot.majorGridSpacing,
      backgroundMode: snapshot.backgroundMode,
      documentName: normalizeDocumentName(snapshot.documentName),
      showPixelGuides: snapshot.showPixelGuides,
      showVirtualCursor: snapshot.showVirtualCursor,
      showChecker: snapshot.showChecker,
    };
  }

  function deserializeDocumentPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid document payload');
    }
    const width = clamp(
      Math.round(Number(payload.width) || state.width || DEFAULT_CANVAS_SIZE),
      1,
      4096
    );
    const height = clamp(
      Math.round(Number(payload.height) || state.height || DEFAULT_CANVAS_SIZE),
      1,
      4096
    );
    const pixelCount = width * height;
    const paletteSource = Array.isArray(payload.palette) ? payload.palette : [];
    const palette = paletteSource.length ? paletteSource.map(color => normalizeColorValue(color)) : state.palette.map(color => ({ ...color }));

    const framesSource = Array.isArray(payload.frames) ? payload.frames : [];
    if (!framesSource.length) {
      throw new Error('Document has no frames');
    }

    const frames = framesSource.map((frame, frameIndex) => {
      if (!frame || !Array.isArray(frame.layers) || !frame.layers.length) {
        throw new Error(`Frame ${frameIndex} has no layers`);
      }
      const layers = frame.layers.map((layer, layerIndex) => {
        if (!layer || typeof layer.indices !== 'string') {
          throw new Error(`Layer ${layerIndex} is missing index data`);
        }
        const indicesBytes = decodeBase64(layer.indices);
        if (indicesBytes.length !== pixelCount * 2) {
          throw new Error('Layer pixel data mismatch');
        }
        const indicesView = new Int16Array(indicesBytes.buffer, indicesBytes.byteOffset, indicesBytes.byteLength / 2);
        const indices = new Int16Array(indicesView.length);
        indices.set(indicesView);
        let direct = null;
        if (typeof layer.direct === 'string' && layer.direct.length > 0) {
          const directBytes = decodeBase64(layer.direct);
          if (directBytes.length !== pixelCount * 4) {
            throw new Error('Layer direct pixel data mismatch');
          }
          direct = new Uint8ClampedArray(directBytes.length);
          direct.set(directBytes);
        }
        return {
          id: typeof layer.id === 'string' ? layer.id : `layer-${frameIndex}-${layerIndex}`,
          name: typeof layer.name === 'string' ? layer.name : `レイヤー ${layerIndex + 1}`,
          visible: layer.visible !== false,
          opacity: clamp(Number(layer.opacity) ?? 1, 0, 1),
          indices,
          direct,
        };
      });
      return {
        id: typeof frame.id === 'string' ? frame.id : `frame-${frameIndex + 1}`,
        name: typeof frame.name === 'string' ? frame.name : `フレーム ${frameIndex + 1}`,
        duration: clamp(Number(frame.duration) || 1000 / 12, 16, 2000),
        layers,
      };
    });

    const activeFrameIndex = clamp(Math.round(Number(payload.activeFrame) || 0), 0, frames.length - 1);
    const activeFrame = frames[activeFrameIndex];
    let activeLayerId = typeof payload.activeLayer === 'string' ? payload.activeLayer : activeFrame.layers[activeFrame.layers.length - 1].id;
    if (!activeFrame.layers.some(layer => layer.id === activeLayerId)) {
      activeLayerId = activeFrame.layers[activeFrame.layers.length - 1].id;
    }

    let selectionMask = null;
    if (typeof payload.selectionMask === 'string') {
      const maskBytes = decodeBase64(payload.selectionMask);
      if (maskBytes.length === pixelCount) {
        selectionMask = new Uint8Array(maskBytes.length);
        selectionMask.set(maskBytes);
      }
    }

    const selectionBounds = validateBoundsObject(payload.selectionBounds);
    const activeTool = typeof payload.tool === 'string' ? payload.tool : state.tool;
    const activeRgb = normalizeColorValue(payload.activeRgb || state.activeRgb);
    const colorMode = 'index';
    const activePaletteIndex = clamp(Math.round(Number(payload.activePaletteIndex) || 0), 0, palette.length - 1);
    const backgroundMode = payload.backgroundMode === 'light' || payload.backgroundMode === 'pink' ? payload.backgroundMode : 'dark';
    const activeToolGroup = TOOL_GROUPS[payload.activeToolGroup] ? payload.activeToolGroup : (TOOL_TO_GROUP[activeTool] || state.activeToolGroup);
    const lastGroupTool = normalizeLastGroupTool(payload.lastGroupTool);
    const activeLeftTab = LEFT_TAB_KEYS.includes(payload.activeLeftTab) ? payload.activeLeftTab : state.activeLeftTab;
    const activeRightTab = RIGHT_TAB_KEYS.includes(payload.activeRightTab) ? payload.activeRightTab : state.activeRightTab;
    const documentName = normalizeDocumentName(
      typeof payload.documentName === 'string' ? payload.documentName : (typeof payload.name === 'string' ? payload.name : state.documentName),
    );

    return {
      width,
      height,
      scale: normalizeZoomScale(payload.scale, state.scale || MIN_ZOOM_SCALE),
      pan: {
        x: Math.round(Number(payload.pan?.x) || 0),
        y: Math.round(Number(payload.pan?.y) || 0),
      },
      tool: activeTool,
      brushSize: clamp(Math.round(Number(payload.brushSize) || state.brushSize || 1), 1, 64),
      colorMode,
      palette,
      activePaletteIndex,
      activeRgb,
      frames,
      activeFrame: activeFrameIndex,
      activeLayer: activeLayerId,
      selectionMask,
      selectionBounds,
      showGrid: Boolean(payload.showGrid ?? state.showGrid),
      showMajorGrid: Boolean(payload.showMajorGrid ?? state.showMajorGrid),
      gridScreenStep: clamp(Math.round(Number(payload.gridScreenStep) || state.gridScreenStep || 8), 1, 256),
      majorGridSpacing: clamp(Math.round(Number(payload.majorGridSpacing) || state.majorGridSpacing || 16), 2, 512),
      backgroundMode,
      activeToolGroup,
      lastGroupTool,
      activeLeftTab,
      activeRightTab,
      showPixelGuides: Boolean(payload.showPixelGuides ?? state.showPixelGuides),
      showVirtualCursor: Boolean(payload.showVirtualCursor ?? state.showVirtualCursor),
      showChecker: Boolean(payload.showChecker ?? state.showChecker),
      playback: typeof payload.playback === 'object' && payload.playback
        ? {
          isPlaying: Boolean(payload.playback.isPlaying),
          lastFrame: Number(payload.playback.lastFrame) || 0,
        }
        : { isPlaying: false, lastFrame: 0 },
      documentName,
    };
  }

  // -------------------------------------------------------------------------
  // Export helpers
  // -------------------------------------------------------------------------

  function getActiveFrameCompositePixels() {
    const frame = getActiveFrame();
    if (!frame) {
      return null;
    }
    const pixels = compositeFramePixels(frame, state.width, state.height, state.palette);
    return { frame, pixels };
  }

  function hasValidPixfindBaseSnapshotForActiveFrame() {
    const frame = getActiveFrame();
    if (!frame || !pixfindBaseSnapshot) {
      return false;
    }
    const expectedLength = Math.max(1, state.width * state.height * 4);
    return (
      pixfindBaseSnapshot.frameId === frame.id
      && pixfindBaseSnapshot.width === state.width
      && pixfindBaseSnapshot.height === state.height
      && pixfindBaseSnapshot.pixels instanceof Uint8ClampedArray
      && pixfindBaseSnapshot.pixels.length === expectedLength
    );
  }

  function updatePixfindModeUI() {
    const modeButton = dom.controls.togglePixfindMode;
    if (modeButton) {
      modeButton.classList.toggle('is-active', pixfindModeEnabled);
      modeButton.setAttribute('aria-pressed', String(pixfindModeEnabled));
      modeButton.textContent = pixfindModeEnabled ? 'PiXFiNDモード: ON' : 'PiXFiNDモード: OFF';
    }
    if (dom.controls.refreshPixfindBase) {
      dom.controls.refreshPixfindBase.disabled = !pixfindModeEnabled;
    }
    if (dom.controls.sendToPixfind) {
      dom.controls.sendToPixfind.disabled = !(pixfindModeEnabled && hasValidPixfindBaseSnapshotForActiveFrame());
    }
  }

  function clearPixfindBaseSnapshot() {
    pixfindBaseSnapshot = null;
    updatePixfindModeUI();
  }

  function capturePixfindBaseSnapshot({ quiet = false } = {}) {
    const composite = getActiveFrameCompositePixels();
    if (!composite) {
      if (!quiet) {
        updateAutosaveStatus('PiXFiND原本を作成できませんでした', 'warn');
      }
      return false;
    }
    pixfindBaseSnapshot = {
      frameId: composite.frame.id,
      width: state.width,
      height: state.height,
      pixels: new Uint8ClampedArray(composite.pixels),
      createdAt: new Date().toISOString(),
    };
    updatePixfindModeUI();
    if (!quiet) {
      updateAutosaveStatus('PiXFiND原本を更新しました', 'success');
    }
    return true;
  }

  function setPixfindModeEnabled(enabled, { confirmFirst = true, quiet = false } = {}) {
    const next = Boolean(enabled);
    if (next === pixfindModeEnabled) {
      updatePixfindModeUI();
      return true;
    }
    if (next && confirmFirst && !pixfindModeFirstEnableConfirmed) {
      const accepted = window.confirm('PiXFiNDモードを初めてONにします。現在のフレームを原本として保存します。続けますか？');
      if (!accepted) {
        return false;
      }
      pixfindModeFirstEnableConfirmed = true;
    }
    pixfindModeEnabled = next;
    if (next) {
      const captured = capturePixfindBaseSnapshot({ quiet: true });
      if (!captured) {
        pixfindModeEnabled = false;
        clearPixfindBaseSnapshot();
        if (!quiet) {
          updateAutosaveStatus('PiXFiNDモードを開始できませんでした', 'warn');
        }
        return false;
      }
      if (!quiet) {
        updateAutosaveStatus('PiXFiNDモードをONにしました', 'info');
      }
    } else {
      clearPixfindBaseSnapshot();
      if (!quiet) {
        updateAutosaveStatus('PiXFiNDモードをOFFにしました', 'info');
      }
    }
    updatePixfindModeUI();
    scheduleSessionPersist();
    return true;
  }

  function syncPixfindSnapshotAfterDocumentReset() {
    if (pixfindModeEnabled) {
      capturePixfindBaseSnapshot({ quiet: true });
    } else {
      clearPixfindBaseSnapshot();
    }
    updatePixfindModeUI();
  }

  function exportProjectToPixfind() {
    if (!pixfindModeEnabled) {
      updateAutosaveStatus('PiXFiNDモードをONにしてください', 'warn');
      return;
    }
    if (!hasValidPixfindBaseSnapshotForActiveFrame()) {
      updateAutosaveStatus('PiXFiND原本が未設定です。「原本を更新」を押してください', 'warn');
      return;
    }
    const composite = getActiveFrameCompositePixels();
    if (!composite) {
      updateAutosaveStatus('PiXFiND出力に必要なフレームがありません', 'warn');
      return;
    }
    try {
      const baseCanvas = createFrameCanvas(
        new Uint8ClampedArray(pixfindBaseSnapshot.pixels),
        pixfindBaseSnapshot.width,
        pixfindBaseSnapshot.height
      );
      const diffCanvas = createFrameCanvas(composite.pixels, state.width, state.height);
      const originalDataUrl = baseCanvas.toDataURL('image/png');
      const diffDataUrl = diffCanvas.toDataURL('image/png');
      if (!originalDataUrl || !diffDataUrl) {
        throw new Error('Missing PiXFiND data URL');
      }
      try {
        const payload = {
          originalDataUrl,
          diffDataUrl,
          canvasSize: state.width === state.height ? state.width : `${state.width}x${state.height}`,
          width: state.width,
          height: state.height,
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem(PIXFIND_UPLOAD_KEY, JSON.stringify(payload));
      } catch (error) {
        console.warn('pixfind upload store failed', error);
      }
      window.location.href = '../pixfind/index.html#creator';
    } catch (error) {
      console.error('PiXFiND export failed', error);
      updateAutosaveStatus('PiXFiND出力に失敗しました', 'error');
    }
  }

  function exportProjectToContest() {
    const frameCount = state.frames.length;
    if (!frameCount) {
      updateAutosaveStatus('投稿するフレームがありません', 'warn');
      return;
    }
    try {
      const { width, height } = state;
      const activeIndex = clamp(state.activeFrame, 0, frameCount - 1);
      const frame = state.frames[activeIndex];
      const pixels = compositeFramePixels(frame, width, height, state.palette);
      const baseCanvas = createFrameCanvas(pixels, width, height);
      const dataUrl = baseCanvas.toDataURL('image/png');
      if (!dataUrl) {
        throw new Error('Missing contest data URL');
      }
      try {
        const payload = {
          dataUrl,
          canvasSize: width === height ? width : `${width}x${height}`,
          width,
          height,
          createdAt: new Date().toISOString(),
        };
        localStorage.setItem('pixieed_contest_upload_v1', JSON.stringify(payload));
      } catch (error) {
        console.warn('contest upload store failed', error);
      }
      window.location.href = '../contest/index.html#post';
    } catch (error) {
      console.error('Contest export failed', error);
      updateAutosaveStatus('コンテスト投稿用の画像を作成できませんでした', 'error');
    }
  }

  async function exportProjectAsPng() {
    const frameCount = state.frames.length;
    if (!frameCount) {
      updateAutosaveStatus('PNGを書き出すフレームがありません', 'warn');
      return;
    }
    try {
      const { width, height } = state;
      const candidates = getExportScaleCandidates();
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const framePixels = compositeDocumentFrames(state.frames, width, height, state.palette);
      const includeOriginal = shouldExportOriginalCompanion('png', selectedScale);
      const tasks = [];
      for (let index = 0; index < frameCount; index += 1) {
        const frameNumber = String(index + 1).padStart(2, '0');
        const baseCanvas = createFrameCanvas(framePixels[index], width, height);
        const variants = [{ scale: selectedScale, isOriginal: false }];
        if (includeOriginal) {
          variants.push({ scale: 1, isOriginal: true });
        }
        for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
          const variant = variants[variantIndex];
          const outputCanvas = scaleCanvasNearestNeighbor(baseCanvas, variant.scale);
          const blob = await canvasToBlob(outputCanvas, 'image/png');
          if (!blob) {
            throw new Error('Failed to create PNG blob');
          }
          let suffix = `frame_${frameNumber}`;
          if (variant.scale > 1 || includeOriginal) {
            suffix += `_x${variant.scale}`;
          }
          tasks.push({
            blob,
            filename: createExportFileName('png', suffix),
            shareText: `フレーム${index + 1}のPNGを書き出しました${variant.scale > 1 ? ` (×${variant.scale})` : ''}`,
          });
        }
      }

      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/png',
        fileExtensions: ['.png'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: 'PNGを書き出しました',
      });
      const detailParts = [];
      if (frameCount > 1) {
        detailParts.push(`全${frameCount}フレーム`);
      }
      if (selectedScale > 1) {
        detailParts.push(`×${selectedScale}`);
      }
      if (includeOriginal) {
        detailParts.push('原寸も追加');
      }
      const detail = detailParts.length ? ` (${detailParts.join(' / ')})` : '';

      if (result.exportedCount === result.total) {
        updateAutosaveStatus(`PNGを書き出しました${detail}`, 'success');
      } else if (result.wasCancelled) {
        const remaining = result.total - result.exportedCount;
        updateAutosaveStatus(remaining === result.total
          ? 'PNGの書き出しをキャンセルしました'
          : `PNGを書き出しましたが ${remaining} 件はキャンセルされました`, 'warn');
      } else if (result.exportedCount > 0 && result.hadFailure) {
        updateAutosaveStatus(`PNGを書き出しましたが ${result.total - result.exportedCount} 件エクスポートできませんでした`, 'warn');
      } else {
        updateAutosaveStatus('PNGの書き出しに失敗しました', 'error');
      }
    } catch (error) {
      console.error('PNG export failed', error);
      updateAutosaveStatus('PNGの書き出しに失敗しました', 'error');
    }
  }

  async function exportProjectAsGif() {
    const frameCount = state.frames.length;
    if (!frameCount) {
      updateAutosaveStatus('GIFを書き出すフレームがありません', 'warn');
      return;
    }
    try {
      const { width, height } = state;
      const candidates = getExportScaleCandidates();
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const includeOriginal = shouldExportOriginalCompanion('gif', selectedScale);
      const framePixels = compositeDocumentFrames(state.frames, width, height, state.palette);
      const frameDurations = state.frames.map(frame => clamp(Math.round(Number(frame.duration) || 0), 16, 2000));
      const scaledSet = scaleFrameSetNearestNeighbor(framePixels, width, height, selectedScale);
      const tasks = [];
      const scaledGifBytes = buildGifFromPixels(
        scaledSet.framePixels,
        frameDurations,
        scaledSet.width,
        scaledSet.height
      );
      tasks.push({
        blob: new Blob([scaledGifBytes], { type: 'image/gif' }),
        filename: createExportFileName('gif', selectedScale > 1 ? `animation_x${selectedScale}` : 'animation'),
        shareText: `GIFを書き出しました${selectedScale > 1 ? ` (×${selectedScale})` : ''}`,
      });
      if (includeOriginal) {
        const originalGifBytes = buildGifFromPixels(framePixels, frameDurations, width, height);
        tasks.push({
          blob: new Blob([originalGifBytes], { type: 'image/gif' }),
          filename: createExportFileName('gif', 'animation_x1'),
          shareText: 'GIFを書き出しました (原寸)',
        });
      }

      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/gif',
        fileExtensions: ['.gif'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: 'GIFを書き出しました',
      });
      const detailParts = [];
      if (selectedScale > 1) {
        detailParts.push(`×${selectedScale}`);
      }
      if (includeOriginal) {
        detailParts.push('原寸も追加');
      }
      const detail = detailParts.length ? ` (${detailParts.join(' / ')})` : '';
      if (result.exportedCount === result.total) {
        updateAutosaveStatus(`GIFを書き出しました${detail}`, 'success');
      } else if (result.wasCancelled) {
        const remaining = result.total - result.exportedCount;
        updateAutosaveStatus(remaining === result.total
          ? 'GIFの書き出しをキャンセルしました'
          : `GIFを書き出しましたが ${remaining} 件はキャンセルされました`, 'warn');
      } else if (result.exportedCount > 0 && result.hadFailure) {
        updateAutosaveStatus(`GIFを書き出しましたが ${result.total - result.exportedCount} 件エクスポートできませんでした`, 'warn');
      } else {
        updateAutosaveStatus('GIFの書き出しに失敗しました', 'error');
      }
    } catch (error) {
      console.error('GIF export failed', error);
      updateAutosaveStatus('GIFの書き出しに失敗しました', 'error');
    }
  }

  function compositeDocumentFrames(frames, width, height, palette) {
    return frames.map(frame => compositeFramePixels(frame, width, height, palette));
  }

  function compositeFramePixels(frame, width, height, palette) {
    const pixelCount = width * height;
    const output = new Uint8ClampedArray(pixelCount * 4);
    if (!frame || !Array.isArray(frame.layers)) {
      return output;
    }
    frame.layers.forEach(layer => {
      if (!layer || !layer.visible || layer.opacity <= 0) {
        return;
      }
      const layerOpacity = clamp(Number(layer.opacity) || 0, 0, 1);
      if (layerOpacity <= 0) {
        return;
      }
      const indices = layer.indices instanceof Int16Array && layer.indices.length >= pixelCount ? layer.indices : null;
      const direct = layer.direct instanceof Uint8ClampedArray && layer.direct.length >= pixelCount * 4 ? layer.direct : null;
      for (let i = 0; i < pixelCount; i += 1) {
        const paletteIndex = indices ? indices[i] : -1;
        let srcR;
        let srcG;
        let srcB;
        let srcA;
        if (paletteIndex >= 0 && palette && palette[paletteIndex]) {
          const color = palette[paletteIndex];
          srcR = color.r;
          srcG = color.g;
          srcB = color.b;
          srcA = color.a;
        } else if (direct) {
          const base = i * 4;
          srcR = direct[base];
          srcG = direct[base + 1];
          srcB = direct[base + 2];
          srcA = direct[base + 3];
        } else {
          continue;
        }
        if (!Number.isFinite(srcA) || srcA <= 0) {
          continue;
        }
        const alpha = (srcA / 255) * layerOpacity;
        if (alpha <= 0) {
          continue;
        }
        const destIndex = i * 4;
        const dstA = output[destIndex + 3] / 255;
        const outA = alpha + dstA * (1 - alpha);
        if (outA <= 0) {
          continue;
        }
        const srcFactor = alpha / outA;
        const dstFactor = (dstA * (1 - alpha)) / outA;
        output[destIndex] = Math.round(srcR * srcFactor + output[destIndex] * dstFactor);
        output[destIndex + 1] = Math.round(srcG * srcFactor + output[destIndex + 1] * dstFactor);
        output[destIndex + 2] = Math.round(srcB * srcFactor + output[destIndex + 2] * dstFactor);
        output[destIndex + 3] = Math.round(outA * 255);
      }
    });
    return output;
  }

  function computeSpriteSheetLayout(frameCount) {
    const safeCount = Math.max(1, Math.floor(Number(frameCount) || 0));
    const columns = Math.max(1, Math.ceil(Math.sqrt(safeCount)));
    const rows = Math.max(1, Math.ceil(safeCount / columns));
    return { columns, rows };
  }

  function getExportScaleCandidates() {
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    const { columns, rows } = computeSpriteSheetLayout(frameCount);
    const frameWidth = Math.max(1, state.width);
    const frameHeight = Math.max(1, state.height);
    const maxScaleWidth = Math.floor(MAX_EXPORT_DIMENSION / frameWidth);
    const maxScaleHeight = Math.floor(MAX_EXPORT_DIMENSION / frameHeight);
    const maxScale = Math.max(1, Math.min(
      Math.max(1, maxScaleWidth || 0),
      Math.max(1, maxScaleHeight || 0),
    ));
    const limit = Math.max(1, Math.min(MAX_EXPORT_SCALE_OPTIONS, maxScale));
    const options = [];
    for (let scale = 1; scale <= limit; scale += 1) {
      options.push({
        scale,
        width: frameWidth * scale,
        height: frameHeight * scale,
      });
    }
    return {
      options,
      maxScale,
      sheetWidth: frameWidth,
      sheetHeight: frameHeight,
      columns,
      rows,
    };
  }

  function resetExportScaleDefaults() {
    exportScale = 1;
    exportScaleUserOverride = false;
  }

  function normalizeExportFormat(mode) {
    const normalized = String(mode || '').trim().toLowerCase();
    if (normalized === 'gif') return 'gif';
    if (normalized === 'png') return 'png';
    if (normalized === 'contest') return 'contest';
    if (normalized === 'pixfind') return 'pixfind';
    if (normalized === 'project') return 'project';
    return 'png';
  }

  function canOfferOriginalCompanionExport(mode, scale = exportScale) {
    const format = normalizeExportFormat(mode);
    const normalizedScale = Math.max(1, Math.floor(Number(scale) || 1));
    return normalizedScale > 1 && (format === 'png' || format === 'gif');
  }

  function shouldExportOriginalCompanion(mode, scale = exportScale) {
    return exportIncludeOriginalSize && canOfferOriginalCompanionExport(mode, scale);
  }

  function updateExportOriginalToggleUI() {
    const toggle = dom.exportDialog?.includeOriginalToggle;
    if (!(toggle instanceof HTMLInputElement)) {
      return;
    }
    const mode = normalizeExportFormat(dom.exportDialog?.format?.value || 'png');
    const canOffer = canOfferOriginalCompanionExport(mode, exportScale);
    toggle.checked = exportIncludeOriginalSize;
    toggle.disabled = !canOffer;
  }

  function applyExportScaleConstraints(candidates) {
    exportSheetInfo = {
      sheetWidth: candidates.sheetWidth,
      sheetHeight: candidates.sheetHeight,
      columns: candidates.columns,
      rows: candidates.rows,
    };
    const options = candidates.options;
    exportMaxScale = options.length ? options[options.length - 1].scale : 1;
    if (!options.length) {
      exportScale = 1;
      return exportScale;
    }
    const maxAllowed = exportMaxScale;
    if (!exportScaleUserOverride) {
      const baseDimension = Math.max(exportSheetInfo.sheetWidth, exportSheetInfo.sheetHeight);
      const recommendedScale = baseDimension > 0 ? Math.round(TARGET_EXPORT_OUTPUT_SIZE / baseDimension) : 1;
      const clampedRecommendation = Math.max(1, Math.min(maxAllowed, recommendedScale));
      exportScale = clampedRecommendation;
    }
    if (exportScale > maxAllowed) {
      exportScale = maxAllowed;
    }
    if (exportScale < 1) {
      exportScale = 1;
    }
    return exportScale;
  }

  function updateExportScaleHint() {
    const hintNode = dom.exportDialog?.scaleHint;
    if (!hintNode) return;
    if (!exportSheetInfo) {
      hintNode.textContent = '';
      return;
    }
    const width = exportSheetInfo.sheetWidth * exportScale;
    const height = exportSheetInfo.sheetHeight * exportScale;
    hintNode.textContent = `書き出しサイズ: ${width} × ${height}PX (倍率 ×${exportScale})`;
  }

  function syncExportScaleInputs() {
    const slider = dom.exportDialog?.scaleSlider;
    if (slider) {
      slider.disabled = exportMaxScale <= 1;
      slider.min = '1';
      slider.max = String(exportMaxScale);
      slider.step = '1';
      slider.value = String(exportScale);
    }

    const scaleInput = dom.exportDialog?.scaleInput;
    if (scaleInput) {
      scaleInput.disabled = exportMaxScale <= 1;
      scaleInput.min = '1';
      scaleInput.max = String(exportMaxScale);
      scaleInput.step = '1';
      scaleInput.value = String(exportScale);
    }

    const widthInput = dom.exportDialog?.pixelWidthInput;
    const heightInput = dom.exportDialog?.pixelHeightInput;
    if (!exportSheetInfo) {
      if (widthInput) {
        widthInput.disabled = true;
        widthInput.value = '';
      }
      if (heightInput) {
        heightInput.disabled = true;
        heightInput.value = '';
      }
    } else {
      const baseWidth = Math.max(1, exportSheetInfo.sheetWidth);
      const baseHeight = Math.max(1, exportSheetInfo.sheetHeight);
      const maxWidth = Math.max(baseWidth, baseWidth * exportMaxScale);
      const maxHeight = Math.max(baseHeight, baseHeight * exportMaxScale);
      if (widthInput) {
        widthInput.disabled = exportMaxScale <= 1;
        widthInput.min = String(baseWidth);
        widthInput.max = String(maxWidth);
        widthInput.step = String(baseWidth);
        widthInput.value = String(baseWidth * exportScale);
      }
      if (heightInput) {
        heightInput.disabled = exportMaxScale <= 1;
        heightInput.min = String(baseHeight);
        heightInput.max = String(maxHeight);
        heightInput.step = String(baseHeight);
        heightInput.value = String(baseHeight * exportScale);
      }
    }

    updateExportScaleHint();
    updateExportOriginalToggleUI();
  }

  function setExportScale(value) {
    const maxAllowed = exportMaxScale || 1;
    const normalized = clamp(Math.round(Number(value) || exportScale || 1), 1, maxAllowed);
    exportScale = normalized;
    syncExportScaleInputs();
  }

  function refreshExportScaleControls() {
    const candidates = getExportScaleCandidates();
    applyExportScaleConstraints(candidates);
    syncExportScaleInputs();
  }

  function createFrameCanvas(pixels, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('フレーム描画用キャンバスのコンテキストを取得できませんでした');
    }
    ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
    return canvas;
  }

  function scaleCanvasNearestNeighbor(sourceCanvas, scale) {
    const numericScale = Math.max(1, Math.floor(Number(scale) || 1));
    if (numericScale <= 1) {
      return sourceCanvas;
    }
    const output = document.createElement('canvas');
    output.width = Math.max(1, sourceCanvas.width * numericScale);
    output.height = Math.max(1, sourceCanvas.height * numericScale);
    const ctx = output.getContext('2d');
    if (!ctx) {
      throw new Error('拡大先キャンバスのコンテキストを取得できませんでした');
    }
    ctx.imageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.drawImage(sourceCanvas, 0, 0, output.width, output.height);
    return output;
  }

  function scaleFramePixelsNearestNeighbor(pixels, width, height, scale) {
    const numericScale = Math.max(1, Math.floor(Number(scale) || 1));
    if (numericScale <= 1) {
      return {
        width,
        height,
        pixels: pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels),
      };
    }
    const targetWidth = width * numericScale;
    const targetHeight = height * numericScale;
    const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    for (let y = 0; y < targetHeight; y += 1) {
      const sourceY = Math.floor(y / numericScale);
      const sourceRow = sourceY * width;
      const targetRow = y * targetWidth;
      for (let x = 0; x < targetWidth; x += 1) {
        const sourceX = Math.floor(x / numericScale);
        const sourceIndex = (sourceRow + sourceX) * 4;
        const targetIndex = (targetRow + x) * 4;
        output[targetIndex] = pixels[sourceIndex];
        output[targetIndex + 1] = pixels[sourceIndex + 1];
        output[targetIndex + 2] = pixels[sourceIndex + 2];
        output[targetIndex + 3] = pixels[sourceIndex + 3];
      }
    }
    return { width: targetWidth, height: targetHeight, pixels: output };
  }

  function scaleFrameSetNearestNeighbor(framePixels, width, height, scale) {
    const numericScale = Math.max(1, Math.floor(Number(scale) || 1));
    if (numericScale <= 1) {
      return { width, height, framePixels };
    }
    const targetWidth = width * numericScale;
    const targetHeight = height * numericScale;
    const scaledFrames = framePixels.map(pixels => scaleFramePixelsNearestNeighbor(pixels, width, height, numericScale).pixels);
    return { width: targetWidth, height: targetHeight, framePixels: scaledFrames };
  }

  async function deliverExportTasks(tasks, options = {}) {
    const total = Array.isArray(tasks) ? tasks.length : 0;
    if (!total) {
      return { exportedCount: 0, total: 0, wasCancelled: false, hadFailure: false };
    }
    let exportedCount = 0;
    let wasCancelled = false;
    let hadFailure = false;
    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      const deliveryResult = await triggerDownloadFromBlob(task.blob, task.filename, {
        mimeType: options.mimeType,
        fileExtensions: options.fileExtensions,
        shareTitle: options.shareTitle,
        shareText: task.shareText || options.shareText,
        allowFilePicker: index === 0,
      });
      switch (deliveryResult) {
        case 'picker':
        case 'download':
        case 'share':
        case 'window':
          exportedCount += 1;
          break;
        case 'picker-cancel':
        case 'share-cancel':
          wasCancelled = true;
          break;
        default:
          hadFailure = true;
          break;
      }
      if (wasCancelled || hadFailure) {
        break;
      }
    }
    return { exportedCount, total, wasCancelled, hadFailure };
  }

  function canvasToBlob(canvas, mimeType) {
    return new Promise((resolve, reject) => {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob(blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        }, mimeType);
        return;
      }
      try {
        const dataUrl = canvas.toDataURL(mimeType);
        const blob = dataUrlToBlob(dataUrl, mimeType);
        resolve(blob);
      } catch (error) {
        reject(error);
      }
    });
  }

  function dataUrlToBlob(dataUrl, mimeType) {
    const parts = dataUrl.split(',');
    if (parts.length < 2) {
      throw new Error('Invalid data URL');
    }
    const byteString = window.atob(parts[1]);
    const length = byteString.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = event => {
        const result = event?.target?.result;
        if (typeof result === 'string') {
          resolve(result);
        } else {
          reject(new Error('Failed to convert blob to data URL'));
        }
      };
      reader.onerror = () => {
        reject(reader.error || new Error('Failed to read blob as data URL'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function appendShareHashtag(text) {
    if (!text) return SHARE_HASHTAG;
    return text.includes(SHARE_HASHTAG) ? text : `${text}\n${SHARE_HASHTAG}`;
  }

  async function triggerDownloadFromBlob(blob, filename, options = {}) {
    if (!blob) {
      throw new Error('Cannot download an empty blob');
    }
    const mimeType = options.mimeType || blob.type || 'application/octet-stream';
    const shareTitle = options.shareTitle || filename;
    const shareText = appendShareHashtag(options.shareText || '');
    const fileExtensions = Array.isArray(options.fileExtensions) && options.fileExtensions.length
      ? options.fileExtensions
      : (() => {
          const match = filename.match(/(\.[^./]+)$/);
          return match ? [match[1].toLowerCase()] : [];
        })();

    if (typeof window.showSaveFilePicker === 'function' && options.allowFilePicker !== false) {
      try {
        const pickerTypes =
          mimeType && fileExtensions.length
            ? [
                {
                  description: `${mimeType} file`,
                  accept: { [mimeType]: fileExtensions },
                },
              ]
            : undefined;
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: pickerTypes,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return 'picker';
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return 'picker-cancel';
        }
        console.warn('showSaveFilePicker failed', error);
      }
    }

    if (SUPPORTS_ANCHOR_DOWNLOAD) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => {
        anchor.remove();
        URL.revokeObjectURL(url);
      }, 1500);
      return 'download';
    }

    if (CAN_USE_WEB_SHARE) {
      try {
        const shareFile = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [shareFile] })) {
          await navigator.share({
            files: [shareFile],
            title: shareTitle,
            text: shareText || undefined,
          });
          return 'share';
        }
      } catch (error) {
        if (error && error.name === 'AbortError') {
          return 'share-cancel';
        }
        console.warn('navigator.share failed', error);
      }
    }

    const dataUrl = await blobToDataUrl(blob);
    const opened = window.open(dataUrl, '_blank', 'noopener');
    if (!opened) {
      window.location.href = dataUrl;
    }
    return 'window';
  }

  async function saveProjectAsPixieedraw() {
    try {
      const snapshot = makeHistorySnapshot();
      const payload = serializeDocumentSnapshot(snapshot);
      const packaged = {
        version: DOCUMENT_FILE_VERSION,
        document: payload,
        updatedAt: new Date().toISOString(),
      };
      const json = JSON.stringify(packaged);
      const blob = new Blob([json], { type: 'application/json' });
      const filename = createAutosaveFileName();
      const result = await triggerDownloadFromBlob(blob, filename, {
        mimeType: 'application/json',
        fileExtensions: [PROJECT_FILE_EXTENSION, '.json'],
        shareTitle: state.documentName,
        shareText: `${state.documentName} (PiXiEEDraw)`,
      });
      if (result && !String(result).endsWith('cancel')) {
        updateAutosaveStatus('手動保存: ファイルを書き出しました', 'success');
      }
    } catch (error) {
      console.error('Manual project save failed', error);
      updateAutosaveStatus('手動保存: ファイルを書き出せませんでした', 'error');
    }
  }

  function buildGifFromPixels(framePixels, frameDurations, width, height) {
    const { palette, indexedFrames, transparentIndex } = buildIndexedFramesForGif(framePixels, width, height);
    const gifPalette = ensureGifPalette(palette);
    const writerBaseOptions = { loop: 0, palette: gifPalette };
    const estimatedSize = Math.max(width * height * indexedFrames.length * 4 + gifPalette.length * 6 + 2048, 4096);
    let bufferSize = estimatedSize;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const buffer = new Uint8Array(bufferSize);
      try {
        const writer = new GifWriter(buffer, width, height, writerBaseOptions);
        indexedFrames.forEach((indexedPixels, index) => {
          const durationMs = clamp(Math.round(Number(frameDurations[index]) || 0), 16, 2000);
          const delayHundredths = clamp(Math.round(durationMs / 10), 2, 65535);
          const hasTransparency = transparentIndex !== null;
          const frameOptions = {
            delay: delayHundredths,
            disposal: hasTransparency ? 2 : 0,
          };
          if (hasTransparency) {
            frameOptions.transparent = transparentIndex;
          }
          writer.addFrame(0, 0, width, height, indexedPixels, frameOptions);
        });
        const size = writer.end();
        return buffer.slice(0, size);
      } catch (error) {
        if (attempt === 3) {
          throw error;
        }
        bufferSize *= 2;
      }
    }
    throw new Error('Unable to encode GIF');
  }

  function buildIndexedFramesForGif(framePixels, width, height) {
    const pixelCount = width * height;
    const colorCounts = new Map();
    let hasTransparency = false;
    framePixels.forEach(pixels => {
      for (let i = 0; i < pixelCount; i += 1) {
        const base = i * 4;
        const alpha = pixels[base + 3];
        if (!alpha) {
          hasTransparency = true;
          continue;
        }
        const key = encodeColorKey(pixels[base], pixels[base + 1], pixels[base + 2]);
        colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
      }
    });
    const maxOpaqueColors = hasTransparency ? 255 : 256;
    const opaqueEntries = [];
    colorCounts.forEach((count, key) => {
      const decoded = decodeColorKey(key);
      opaqueEntries.push({ r: decoded.r, g: decoded.g, b: decoded.b, count });
    });
    const paletteColors = quantizeOpaqueColors(opaqueEntries, maxOpaqueColors);
    if (!paletteColors.length) {
      paletteColors.push({ r: 0, g: 0, b: 0 });
    }
    const palette = [];
    let transparentIndex = null;
    if (hasTransparency) {
      palette.push(0);
      transparentIndex = 0;
    }
    paletteColors.forEach(color => {
      const rgb = (color.r << 16) | (color.g << 8) | color.b;
      palette.push(rgb);
    });
    const paletteRgb = palette.map(rgb => ({
      r: (rgb >> 16) & 0xff,
      g: (rgb >> 8) & 0xff,
      b: rgb & 0xff,
    }));
    const colorIndexMap = new Map();
    const indexedFrames = framePixels.map(pixels => {
      const frameIndices = new Uint8Array(pixelCount);
      for (let i = 0; i < pixelCount; i += 1) {
        const base = i * 4;
        const alpha = pixels[base + 3];
        if (!alpha) {
          frameIndices[i] = transparentIndex ?? 0;
          continue;
        }
        const key = encodeColorKey(pixels[base], pixels[base + 1], pixels[base + 2]);
        let paletteIndex = colorIndexMap.get(key);
        if (paletteIndex === undefined) {
          paletteIndex = findNearestPaletteIndex(pixels[base], pixels[base + 1], pixels[base + 2], paletteRgb, transparentIndex);
          colorIndexMap.set(key, paletteIndex);
        }
        frameIndices[i] = paletteIndex;
      }
      return frameIndices;
    });
    return { palette, indexedFrames, transparentIndex };
  }

  function ensureGifPalette(palette) {
    const padded = palette.slice();
    if (padded.length < 2) {
      padded.push(padded[0] ?? 0);
    }
    let size = 1;
    while (size < padded.length && size < 256) {
      size <<= 1;
    }
    if (size > 256) {
      size = 256;
    }
    while (padded.length < size) {
      padded.push(padded[padded.length - 1]);
    }
    return padded;
  }

  function findNearestPaletteIndex(r, g, b, paletteRgb, transparentIndex) {
    let bestIndex = transparentIndex === 0 ? 1 : 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < paletteRgb.length; i += 1) {
      if (i === transparentIndex) {
        continue;
      }
      const color = paletteRgb[i];
      const dr = color.r - r;
      const dg = color.g - g;
      const db = color.b - b;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
        if (distance === 0) {
          break;
        }
      }
    }
    if (bestDistance === Number.POSITIVE_INFINITY) {
      return transparentIndex ?? 0;
    }
    return bestIndex;
  }

  function quantizeOpaqueColors(colors, maxColors) {
    if (!colors.length) {
      return [];
    }
    if (colors.length <= maxColors) {
      return colors.map(color => ({ r: color.r, g: color.g, b: color.b }));
    }
    const boxes = [createColorBox(colors)];
    while (boxes.length < maxColors) {
      boxes.sort((a, b) => {
        if (b.range === a.range) {
          return b.totalCount - a.totalCount;
        }
        return b.range - a.range;
      });
      const box = boxes.shift();
      if (!box || box.colors.length <= 1) {
        if (box) {
          boxes.push(box);
        }
        break;
      }
      const split = splitColorBox(box);
      if (!split) {
        boxes.push(box);
        break;
      }
      boxes.push(split[0], split[1]);
    }
    return boxes.map(box => averageColorFromBox(box.colors));
  }

  function createColorBox(colors) {
    let rMin = 255;
    let rMax = 0;
    let gMin = 255;
    let gMax = 0;
    let bMin = 255;
    let bMax = 0;
    let totalCount = 0;
    colors.forEach(color => {
      rMin = Math.min(rMin, color.r);
      rMax = Math.max(rMax, color.r);
      gMin = Math.min(gMin, color.g);
      gMax = Math.max(gMax, color.g);
      bMin = Math.min(bMin, color.b);
      bMax = Math.max(bMax, color.b);
      totalCount += color.count || 1;
    });
    const range = Math.max(rMax - rMin, gMax - gMin, bMax - bMin);
    return {
      colors: colors.slice(),
      rMin,
      rMax,
      gMin,
      gMax,
      bMin,
      bMax,
      range,
      totalCount,
    };
  }

  function splitColorBox(box) {
    const channel = selectSplitChannel(box);
    const sorted = box.colors.slice().sort((a, b) => a[channel] - b[channel]);
    if (!sorted.length) {
      return null;
    }
    const total = sorted.reduce((sum, color) => sum + (color.count || 1), 0);
    const target = total / 2;
    let run = 0;
    let pivot = 0;
    for (; pivot < sorted.length - 1; pivot += 1) {
      run += sorted[pivot].count || 1;
      if (run >= target) {
        break;
      }
    }
    const left = sorted.slice(0, pivot + 1);
    const right = sorted.slice(pivot + 1);
    if (!left.length || !right.length) {
      return null;
    }
    return [createColorBox(left), createColorBox(right)];
  }

  function selectSplitChannel(box) {
    const rRange = box.rMax - box.rMin;
    const gRange = box.gMax - box.gMin;
    const bRange = box.bMax - box.bMin;
    if (rRange >= gRange && rRange >= bRange) {
      return 'r';
    }
    if (gRange >= rRange && gRange >= bRange) {
      return 'g';
    }
    return 'b';
  }

  function averageColorFromBox(colors) {
    let total = 0;
    let rTotal = 0;
    let gTotal = 0;
    let bTotal = 0;
    colors.forEach(color => {
      const weight = color.count || 1;
      total += weight;
      rTotal += color.r * weight;
      gTotal += color.g * weight;
      bTotal += color.b * weight;
    });
    if (!total) {
      return { r: 0, g: 0, b: 0 };
    }
    return {
      r: Math.round(rTotal / total),
      g: Math.round(gTotal / total),
      b: Math.round(bTotal / total),
    };
  }

  function encodeColorKey(r, g, b) {
    return (r << 16) | (g << 8) | b;
  }

  function decodeColorKey(key) {
    return {
      r: (key >> 16) & 0xff,
      g: (key >> 8) & 0xff,
      b: key & 0xff,
    };
  }

  // GifWriter implementation adapted from https://github.com/deanm/omggif (MIT License).
  function GifWriter(buf, width, height, gopts) {
    let p = 0;

    gopts = gopts === undefined ? {} : gopts;
    const loop_count = gopts.loop === undefined ? null : gopts.loop;
    const global_palette = gopts.palette === undefined ? null : gopts.palette;

    if (width <= 0 || height <= 0 || width > 65535 || height > 65535) {
      throw new Error('Width/Height invalid.');
    }

    function check_palette_and_num_colors(palette) {
      let num_colors = palette.length;
      if (num_colors < 2 || num_colors > 256 || (num_colors & (num_colors - 1))) {
        throw new Error('Invalid code/color length, must be power of 2 and 2 .. 256.');
      }
      return num_colors;
    }

    buf[p++] = 0x47; buf[p++] = 0x49; buf[p++] = 0x46;
    buf[p++] = 0x38; buf[p++] = 0x39; buf[p++] = 0x61;

    let gp_num_colors_pow2 = 0;
    let background = 0;
    if (global_palette !== null) {
      let gp_num_colors = check_palette_and_num_colors(global_palette);
      while (gp_num_colors >>= 1) gp_num_colors_pow2 += 1;
      gp_num_colors = 1 << gp_num_colors_pow2;
      gp_num_colors_pow2 -= 1;
      if (gopts.background !== undefined) {
        background = gopts.background;
        if (background >= gp_num_colors) {
          throw new Error('Background index out of range.');
        }
        if (background === 0) {
          throw new Error('Background index explicitly passed as 0.');
        }
      }
    }

    buf[p++] = width & 0xff; buf[p++] = (width >> 8) & 0xff;
    buf[p++] = height & 0xff; buf[p++] = (height >> 8) & 0xff;
    buf[p++] = (global_palette !== null ? 0x80 : 0) | gp_num_colors_pow2;
    buf[p++] = background;
    buf[p++] = 0;

    if (global_palette !== null) {
      for (let i = 0, il = global_palette.length; i < il; ++i) {
        const rgb = global_palette[i];
        buf[p++] = (rgb >> 16) & 0xff;
        buf[p++] = (rgb >> 8) & 0xff;
        buf[p++] = rgb & 0xff;
      }
    }

    if (loop_count !== null) {
      if (loop_count < 0 || loop_count > 65535) {
        throw new Error('Loop count invalid.');
      }
      buf[p++] = 0x21; buf[p++] = 0xff; buf[p++] = 0x0b;
      buf[p++] = 0x4e; buf[p++] = 0x45; buf[p++] = 0x54; buf[p++] = 0x53;
      buf[p++] = 0x43; buf[p++] = 0x41; buf[p++] = 0x50; buf[p++] = 0x45;
      buf[p++] = 0x32; buf[p++] = 0x2e; buf[p++] = 0x30;
      buf[p++] = 0x03; buf[p++] = 0x01;
      buf[p++] = loop_count & 0xff; buf[p++] = (loop_count >> 8) & 0xff;
      buf[p++] = 0x00;
    }

    let ended = false;

    this.addFrame = function addFrame(x, y, w, h, indexed_pixels, opts) {
      if (ended === true) {
        p -= 1;
        ended = false;
      }

      opts = opts === undefined ? {} : opts;

      if (x < 0 || y < 0 || x > 65535 || y > 65535) {
        throw new Error('x/y invalid.');
      }
      if (w <= 0 || h <= 0 || w > 65535 || h > 65535) {
        throw new Error('Width/Height invalid.');
      }
      if (indexed_pixels.length < w * h) {
        throw new Error('Not enough pixels for the frame size.');
      }

      let using_local_palette = true;
      let palette = opts.palette;
      if (palette === undefined || palette === null) {
        using_local_palette = false;
        palette = global_palette;
      }
      if (palette === undefined || palette === null) {
        throw new Error('Must supply either a local or global palette.');
      }

      let num_colors = check_palette_and_num_colors(palette);
      let min_code_size = 0;
      while (num_colors >>= 1) min_code_size += 1;
      num_colors = 1 << min_code_size;

      const delay = opts.delay === undefined ? 0 : opts.delay;
      const disposal = opts.disposal === undefined ? 0 : opts.disposal;
      if (disposal < 0 || disposal > 3) {
        throw new Error('Disposal out of range.');
      }

      let use_transparency = false;
      let transparent_index = 0;
      if (opts.transparent !== undefined && opts.transparent !== null) {
        use_transparency = true;
        transparent_index = opts.transparent;
        if (transparent_index < 0 || transparent_index >= num_colors) {
          throw new Error('Transparent color index.');
        }
      }

      if (disposal !== 0 || use_transparency || delay !== 0) {
        buf[p++] = 0x21; buf[p++] = 0xf9;
        buf[p++] = 4;
        buf[p++] = (disposal << 2) | (use_transparency === true ? 1 : 0);
        buf[p++] = delay & 0xff; buf[p++] = (delay >> 8) & 0xff;
        buf[p++] = transparent_index;
        buf[p++] = 0;
      }

      buf[p++] = 0x2c;
      buf[p++] = x & 0xff; buf[p++] = (x >> 8) & 0xff;
      buf[p++] = y & 0xff; buf[p++] = (y >> 8) & 0xff;
      buf[p++] = w & 0xff; buf[p++] = (w >> 8) & 0xff;
      buf[p++] = h & 0xff; buf[p++] = (h >> 8) & 0xff;
      buf[p++] = using_local_palette === true ? (0x80 | (min_code_size - 1)) : 0;

      if (using_local_palette === true) {
        for (let i = 0, il = palette.length; i < il; ++i) {
          const rgb = palette[i];
          buf[p++] = (rgb >> 16) & 0xff;
          buf[p++] = (rgb >> 8) & 0xff;
          buf[p++] = rgb & 0xff;
        }
      }

      p = GifWriterOutputLZWCodeStream(buf, p, min_code_size < 2 ? 2 : min_code_size, indexed_pixels);
      return p;
    };

    this.end = function end() {
      if (ended === false) {
        buf[p++] = 0x3b;
        ended = true;
      }
      return p;
    };

    this.getOutputBuffer = function getOutputBuffer() { return buf; };
    this.setOutputBuffer = function setOutputBuffer(v) { buf = v; };
    this.getOutputBufferPosition = function getOutputBufferPosition() { return p; };
    this.setOutputBufferPosition = function setOutputBufferPosition(v) { p = v; };
  }

  function GifWriterOutputLZWCodeStream(buf, p, min_code_size, index_stream) {
    buf[p++] = min_code_size;
    let cur_subblock = p++;

    const clear_code = 1 << min_code_size;
    const code_mask = clear_code - 1;
    const eoi_code = clear_code + 1;
    let next_code = eoi_code + 1;

    let cur_code_size = min_code_size + 1;
    let cur_shift = 0;
    let cur = 0;

    function emit_bytes_to_buffer(bit_block_size) {
      while (cur_shift >= bit_block_size) {
        buf[p++] = cur & 0xff;
        cur >>= 8;
        cur_shift -= 8;
        if (p === cur_subblock + 256) {
          buf[cur_subblock] = 255;
          cur_subblock = p++;
        }
      }
    }

    function emit_code(c) {
      cur |= c << cur_shift;
      cur_shift += cur_code_size;
      emit_bytes_to_buffer(8);
    }

    let ib_code = index_stream[0] & code_mask;
    let code_table = {};

    emit_code(clear_code);

    for (let i = 1, il = index_stream.length; i < il; ++i) {
      const k = index_stream[i] & code_mask;
      const cur_key = (ib_code << 8) | k;
      const cur_code = code_table[cur_key];

      if (cur_code === undefined) {
        cur |= ib_code << cur_shift;
        cur_shift += cur_code_size;
        while (cur_shift >= 8) {
          buf[p++] = cur & 0xff;
          cur >>= 8;
          cur_shift -= 8;
          if (p === cur_subblock + 256) {
            buf[cur_subblock] = 255;
            cur_subblock = p++;
          }
        }

        if (next_code === 4096) {
          emit_code(clear_code);
          next_code = eoi_code + 1;
          cur_code_size = min_code_size + 1;
          code_table = {};
        } else {
          if (next_code >= (1 << cur_code_size)) {
            cur_code_size += 1;
          }
          code_table[cur_key] = next_code++;
        }

        ib_code = k;
      } else {
        ib_code = cur_code;
      }
    }

    emit_code(ib_code);
    emit_code(eoi_code);
    emit_bytes_to_buffer(1);

    if (cur_subblock + 1 === p) {
      buf[cur_subblock] = 0;
    } else {
      buf[cur_subblock] = p - cur_subblock - 1;
      buf[p++] = 0;
    }
    return p;
  }

  // GifReader implementation adapted from https://github.com/deanm/omggif (MIT License).
  function GifReader(buf) {
    let p = 0;

    if (buf[p++] !== 0x47 || buf[p++] !== 0x49 || buf[p++] !== 0x46 ||
        buf[p++] !== 0x38 || (buf[p++] + 1 & 0xfd) !== 0x38 || buf[p++] !== 0x61) {
      throw new Error('Invalid GIF 87a/89a header.');
    }

    const width = buf[p++] | buf[p++] << 8;
    const height = buf[p++] | buf[p++] << 8;
    const pf0 = buf[p++];
    const globalPaletteFlag = pf0 >> 7;
    const numGlobalColorsPow2 = pf0 & 0x7;
    const numGlobalColors = 1 << (numGlobalColorsPow2 + 1);
    const background = buf[p++];
    buf[p++];

    let globalPaletteOffset = null;
    let globalPaletteSize = null;

    if (globalPaletteFlag) {
      globalPaletteOffset = p;
      globalPaletteSize = numGlobalColors;
      p += numGlobalColors * 3;
    }

    let noEof = true;
    const frames = [];

    let delay = 0;
    let transparentIndex = null;
    let disposal = 0;
    let loopCount = null;

    this.width = width;
    this.height = height;

    while (noEof && p < buf.length) {
      switch (buf[p++]) {
        case 0x21: {
          const label = buf[p++];
          if (label === 0xff) {
            if (buf[p] === 0x0b &&
                buf[p + 1] === 0x4e && buf[p + 2] === 0x45 && buf[p + 3] === 0x54 &&
                buf[p + 4] === 0x53 && buf[p + 5] === 0x43 && buf[p + 6] === 0x41 &&
                buf[p + 7] === 0x50 && buf[p + 8] === 0x45 && buf[p + 9] === 0x32 &&
                buf[p + 10] === 0x2e && buf[p + 11] === 0x30 &&
                buf[p + 12] === 0x03 && buf[p + 13] === 0x01 && buf[p + 16] === 0) {
              p += 14;
              loopCount = buf[p++] | buf[p++] << 8;
              p++;
            } else {
              p += 12;
              while (true) {
                const blockSize = buf[p++];
                if (!(blockSize >= 0)) throw new Error('Invalid block size');
                if (blockSize === 0) break;
                p += blockSize;
              }
            }
          } else if (label === 0xf9) {
            if (buf[p++] !== 0x4 || buf[p + 4] !== 0) {
              throw new Error('Invalid graphics extension block.');
            }
            const pf1 = buf[p++];
            delay = buf[p++] | buf[p++] << 8;
            transparentIndex = buf[p++];
            if ((pf1 & 1) === 0) transparentIndex = null;
            disposal = pf1 >> 2 & 0x7;
            p++;
          } else if (label === 0x01 || label === 0xfe) {
            while (true) {
              const blockSize = buf[p++];
              if (!(blockSize >= 0)) throw new Error('Invalid block size');
              if (blockSize === 0) break;
              p += blockSize;
            }
          } else {
            throw new Error(`Unknown graphic control label: 0x${buf[p - 1].toString(16)}`);
          }
          break;
        }

        case 0x2c: {
          const x = buf[p++] | buf[p++] << 8;
          const y = buf[p++] | buf[p++] << 8;
          const w = buf[p++] | buf[p++] << 8;
          const h = buf[p++] | buf[p++] << 8;
          const pf2 = buf[p++];
          const localPaletteFlag = pf2 >> 7;
          const interlaceFlag = pf2 >> 6 & 1;
          const numLocalColorsPow2 = pf2 & 0x7;
          const numLocalColors = 1 << (numLocalColorsPow2 + 1);
          let paletteOffset = globalPaletteOffset;
          let paletteSize = globalPaletteSize;
          if (localPaletteFlag) {
            paletteOffset = p;
            paletteSize = numLocalColors;
            p += numLocalColors * 3;
          }

          const dataOffset = p;
          p++;
          while (true) {
            const blockSize = buf[p++];
            if (!(blockSize >= 0)) throw new Error('Invalid block size');
            if (blockSize === 0) break;
            p += blockSize;
          }

          frames.push({
            x,
            y,
            width: w,
            height: h,
            has_local_palette: Boolean(localPaletteFlag),
            palette_offset: paletteOffset,
            palette_size: paletteSize,
            data_offset: dataOffset,
            data_length: p - dataOffset,
            transparent_index: transparentIndex,
            interlaced: Boolean(interlaceFlag),
            delay,
            disposal,
          });
          // Graphic Control Extension applies only to the immediately following image block.
          delay = 0;
          transparentIndex = null;
          disposal = 0;
          break;
        }

        case 0x3b:
          noEof = false;
          break;

        default:
          throw new Error(`Unknown gif block: 0x${buf[p - 1].toString(16)}`);
      }
    }

    this.numFrames = function numFrames() {
      return frames.length;
    };

    this.loopCount = function loopCountFn() {
      return loopCount;
    };

    this.getBackgroundIndex = function getBackgroundIndexFn() {
      if (!globalPaletteFlag) {
        return null;
      }
      if (background < 0 || background >= numGlobalColors) {
        return null;
      }
      return background;
    };

    this.getBackgroundColor = function getBackgroundColorFn() {
      const bgIndex = this.getBackgroundIndex();
      if (bgIndex === null || globalPaletteOffset === null) {
        return null;
      }
      const colorOffset = globalPaletteOffset + bgIndex * 3;
      if (colorOffset + 2 >= buf.length) {
        return null;
      }
      return {
        r: buf[colorOffset],
        g: buf[colorOffset + 1],
        b: buf[colorOffset + 2],
        a: 255,
      };
    };

    this.frameInfo = function frameInfo(frameNum) {
      if (frameNum < 0 || frameNum >= frames.length) {
        throw new Error('Frame index out of range.');
      }
      return frames[frameNum];
    };

    this.decodeAndBlitFrameRGBA = function decodeAndBlitFrameRGBA(frameNum, pixels) {
      const frame = this.frameInfo(frameNum);
      const numPixels = frame.width * frame.height;
      const indexStream = new Uint8Array(numPixels);
      GifReaderLZWOutputIndexStream(buf, frame.data_offset, indexStream, numPixels);
      const paletteOffset = frame.palette_offset;

      let trans = frame.transparent_index;
      if (trans === null) trans = 256;

      const frameWidth = frame.width;
      const frameHeight = frame.height;
      let streamIndex = 0;
      const writeRow = localY => {
        let op = ((frame.y + localY) * width + frame.x) * 4;
        for (let localX = 0; localX < frameWidth; localX += 1) {
          if (streamIndex >= indexStream.length) {
            return false;
          }
          const index = indexStream[streamIndex++];
          if (index === trans) {
            op += 4;
            continue;
          }
          const r = buf[paletteOffset + index * 3];
          const g = buf[paletteOffset + index * 3 + 1];
          const b = buf[paletteOffset + index * 3 + 2];
          pixels[op++] = r;
          pixels[op++] = g;
          pixels[op++] = b;
          pixels[op++] = 255;
        }
        return true;
      };

      if (frame.interlaced === true) {
        const passes = [
          { start: 0, step: 8 },
          { start: 4, step: 8 },
          { start: 2, step: 4 },
          { start: 1, step: 2 },
        ];
        for (let passIndex = 0; passIndex < passes.length; passIndex += 1) {
          const pass = passes[passIndex];
          for (let localY = pass.start; localY < frameHeight; localY += pass.step) {
            if (!writeRow(localY)) {
              return;
            }
          }
        }
        return;
      }

      for (let localY = 0; localY < frameHeight; localY += 1) {
        if (!writeRow(localY)) {
          return;
        }
      }
    };
  }

  function GifReaderLZWOutputIndexStream(codeStream, p, output, outputLength) {
    const minCodeSize = codeStream[p++];

    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let codeMask = (1 << codeSize) - 1;
    let nextCode = eoiCode + 1;
    let bitBuffer = 0;
    let bitCount = 0;
    let subblockSize = codeStream[p++];

    const prefix = new Int16Array(4096);
    const suffix = new Uint8Array(4096);
    const stack = new Uint8Array(4096);

    let outPos = 0;
    let prevCode = -1;
    let firstByte = 0;

    const readCode = () => {
      while (bitCount < codeSize) {
        if (subblockSize === 0) {
          return null;
        }
        bitBuffer |= codeStream[p++] << bitCount;
        bitCount += 8;
        subblockSize -= 1;
        if (subblockSize === 0) {
          subblockSize = codeStream[p++];
        }
      }
      const code = bitBuffer & codeMask;
      bitBuffer >>= codeSize;
      bitCount -= codeSize;
      return code;
    };

    while (true) {
      const code = readCode();
      if (code === null) {
        break;
      }

      if (code === clearCode) {
        codeSize = minCodeSize + 1;
        codeMask = (1 << codeSize) - 1;
        nextCode = eoiCode + 1;
        prevCode = -1;
        continue;
      }
      if (code === eoiCode) {
        break;
      }

      let current = code;
      let stackTop = 0;

      if (current >= nextCode) {
        if (prevCode < 0) {
          continue;
        }
        stack[stackTop++] = firstByte;
        current = prevCode;
      }

      while (current > clearCode) {
        stack[stackTop++] = suffix[current];
        current = prefix[current];
      }

      firstByte = current & 0xff;
      stack[stackTop++] = firstByte;

      while (stackTop > 0) {
        if (outPos >= outputLength) {
          return;
        }
        output[outPos++] = stack[--stackTop];
      }

      if (prevCode >= 0 && nextCode < 4096) {
        prefix[nextCode] = prevCode;
        suffix[nextCode] = firstByte;
        nextCode += 1;
        if (nextCode === (1 << codeSize) && codeSize < 12) {
          codeSize += 1;
          codeMask = (1 << codeSize) - 1;
        }
      }
      prevCode = code;
    }
  }

  function createTextCompression() {
    const lz = createLzString();
    return {
      compressToUTF16(input) {
        if (typeof input !== 'string' || input.length === 0) {
          return '';
        }
        return lz.compressToUTF16(input);
      },
      decompressFromUTF16(input) {
        if (typeof input !== 'string' || input.length === 0) {
          return '';
        }
        return lz.decompressFromUTF16(input) || '';
      },
    };
  }

  function createLzString() {
    const f = String.fromCharCode;
    const LZ = {
      compressToUTF16(input) {
        if (input == null) return '';
        return LZ._compress(input, 15, value => f(value + 32)) + ' ';
      },
      decompressFromUTF16(compressed) {
        if (compressed == null) return '';
        if (compressed === '') return '';
        return LZ._decompress(compressed.length, 16384, index => compressed.charCodeAt(index) - 32);
      },
      _compress(uncompressed, bitsPerChar, getCharFromInt) {
        if (uncompressed == null) return '';
        let i;
        let value;
        const contextDictionary = Object.create(null);
        const contextDictionaryToCreate = Object.create(null);
        let contextC = '';
        let contextWC = '';
        let contextW = '';
        let contextEnlargeIn = 2;
        let contextDictSize = 3;
        let contextNumBits = 2;
        const contextData = [];
        let contextDataVal = 0;
        let contextDataPosition = 0;
        for (let ii = 0; ii < uncompressed.length; ii += 1) {
          contextC = uncompressed.charAt(ii);
          if (!Object.prototype.hasOwnProperty.call(contextDictionary, contextC)) {
            contextDictionary[contextC] = contextDictSize;
            contextDictSize += 1;
            contextDictionaryToCreate[contextC] = true;
          }
          contextWC = contextW + contextC;
          if (Object.prototype.hasOwnProperty.call(contextDictionary, contextWC)) {
            contextW = contextWC;
          } else {
            if (Object.prototype.hasOwnProperty.call(contextDictionaryToCreate, contextW)) {
              if (contextW.charCodeAt(0) < 256) {
                for (i = 0; i < contextNumBits; i += 1) {
                  contextDataVal <<= 1;
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                }
                value = contextW.charCodeAt(0);
                for (i = 0; i < 8; i += 1) {
                  contextDataVal = (contextDataVal << 1) | (value & 1);
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                  value >>= 1;
                }
              } else {
                value = 1;
                for (i = 0; i < contextNumBits; i += 1) {
                  contextDataVal = (contextDataVal << 1) | value;
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                  value = 0;
                }
                value = contextW.charCodeAt(0);
                for (i = 0; i < 16; i += 1) {
                  contextDataVal = (contextDataVal << 1) | (value & 1);
                  if (contextDataPosition === bitsPerChar - 1) {
                    contextDataPosition = 0;
                    contextData.push(getCharFromInt(contextDataVal));
                    contextDataVal = 0;
                  } else {
                    contextDataPosition += 1;
                  }
                  value >>= 1;
                }
              }
              contextEnlargeIn -= 1;
              if (contextEnlargeIn === 0) {
                contextEnlargeIn = 2 ** contextNumBits;
                contextNumBits += 1;
              }
              delete contextDictionaryToCreate[contextW];
            } else {
              value = contextDictionary[contextW];
              for (i = 0; i < contextNumBits; i += 1) {
                contextDataVal = (contextDataVal << 1) | (value & 1);
                if (contextDataPosition === bitsPerChar - 1) {
                  contextDataPosition = 0;
                  contextData.push(getCharFromInt(contextDataVal));
                  contextDataVal = 0;
                } else {
                  contextDataPosition += 1;
                }
                value >>= 1;
              }
            }
            contextEnlargeIn -= 1;
            if (contextEnlargeIn === 0) {
              contextEnlargeIn = 2 ** contextNumBits;
              contextNumBits += 1;
            }
            contextDictionary[contextWC] = contextDictSize;
            contextDictSize += 1;
            contextW = String(contextC);
          }
        }
        if (contextW !== '') {
          if (Object.prototype.hasOwnProperty.call(contextDictionaryToCreate, contextW)) {
            if (contextW.charCodeAt(0) < 256) {
              for (i = 0; i < contextNumBits; i += 1) {
                contextDataVal <<= 1;
                if (contextDataPosition === bitsPerChar - 1) {
                  contextDataPosition = 0;
                  contextData.push(getCharFromInt(contextDataVal));
                  contextDataVal = 0;
                } else {
                  contextDataPosition += 1;
                }
              }
              value = contextW.charCodeAt(0);
              for (i = 0; i < 8; i += 1) {
                contextDataVal = (contextDataVal << 1) | (value & 1);
                if (contextDataPosition === bitsPerChar - 1) {
                  contextDataPosition = 0;
                  contextData.push(getCharFromInt(contextDataVal));
                  contextDataVal = 0;
                } else {
                  contextDataPosition += 1;
                }
                value >>= 1;
              }
            } else {
              value = 1;
              for (i = 0; i < contextNumBits; i += 1) {
                contextDataVal = (contextDataVal << 1) | value;
                if (contextDataPosition === bitsPerChar - 1) {
                  contextDataPosition = 0;
                  contextData.push(getCharFromInt(contextDataVal));
                  contextDataVal = 0;
                } else {
                  contextDataPosition += 1;
                }
                value = 0;
              }
              value = contextW.charCodeAt(0);
              for (i = 0; i < 16; i += 1) {
                contextDataVal = (contextDataVal << 1) | (value & 1);
                if (contextDataPosition === bitsPerChar - 1) {
                  contextDataPosition = 0;
                  contextData.push(getCharFromInt(contextDataVal));
                  contextDataVal = 0;
                } else {
                  contextDataPosition += 1;
                }
                value >>= 1;
              }
            }
            contextEnlargeIn -= 1;
            if (contextEnlargeIn === 0) {
              contextEnlargeIn = 2 ** contextNumBits;
              contextNumBits += 1;
            }
            delete contextDictionaryToCreate[contextW];
          } else {
            value = contextDictionary[contextW];
            for (i = 0; i < contextNumBits; i += 1) {
              contextDataVal = (contextDataVal << 1) | (value & 1);
              if (contextDataPosition === bitsPerChar - 1) {
                contextDataPosition = 0;
                contextData.push(getCharFromInt(contextDataVal));
                contextDataVal = 0;
              } else {
                contextDataPosition += 1;
              }
              value >>= 1;
            }
          }
          contextEnlargeIn -= 1;
          if (contextEnlargeIn === 0) {
            contextEnlargeIn = 2 ** contextNumBits;
            contextNumBits += 1;
          }
        }
        value = 2;
        for (i = 0; i < contextNumBits; i += 1) {
          contextDataVal = (contextDataVal << 1) | (value & 1);
          if (contextDataPosition === bitsPerChar - 1) {
            contextDataPosition = 0;
            contextData.push(getCharFromInt(contextDataVal));
            contextDataVal = 0;
          } else {
            contextDataPosition += 1;
          }
          value >>= 1;
        }
        while (true) {
          contextDataVal <<= 1;
          if (contextDataPosition === bitsPerChar - 1) {
            contextData.push(getCharFromInt(contextDataVal));
            break;
          } else {
            contextDataPosition += 1;
          }
        }
        return contextData.join('');
      },
      _decompress(length, resetValue, getNextValue) {
        if (length === 0) return '';
        const dictionary = [];
        let next;
        let enlargeIn = 4;
        let dictSize = 4;
        let numBits = 3;
        let entry = '';
        const result = [];
        let w;
        let bits;
        let resb;
        let maxpower;
        let power;
        let c;
        const data = { val: getNextValue(0), position: resetValue, index: 1 };
        for (let i = 0; i < 3; i += 1) {
          dictionary[i] = i;
        }
        maxpower = 4;
        power = 1;
        bits = 0;
        while (power !== maxpower) {
          resb = data.val & data.position;
          data.position >>= 1;
          if (data.position === 0) {
            data.position = resetValue;
            data.val = getNextValue(data.index);
            data.index += 1;
          }
          bits |= (resb > 0 ? 1 : 0) * power;
          power <<= 1;
        }
        switch (next = bits) {
          case 0: {
            maxpower = 256;
            power = 1;
            bits = 0;
            while (power !== maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position === 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index);
                data.index += 1;
              }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            c = f(bits);
            break;
          }
          case 1: {
            maxpower = 65536;
            power = 1;
            bits = 0;
            while (power !== maxpower) {
              resb = data.val & data.position;
              data.position >>= 1;
              if (data.position === 0) {
                data.position = resetValue;
                data.val = getNextValue(data.index);
                data.index += 1;
              }
              bits |= (resb > 0 ? 1 : 0) * power;
              power <<= 1;
            }
            c = f(bits);
            break;
          }
          case 2:
            return '';
          default:
            c = '';
            break;
        }
        dictionary[3] = c;
        w = c;
        result.push(c);
        while (true) {
          if (data.index > length) {
            return '';
          }
          maxpower = 2 ** numBits;
          power = 1;
          bits = 0;
          while (power !== maxpower) {
            resb = data.val & data.position;
            data.position >>= 1;
            if (data.position === 0) {
              data.position = resetValue;
              data.val = getNextValue(data.index);
              data.index += 1;
            }
            bits |= (resb > 0 ? 1 : 0) * power;
            power <<= 1;
          }
          switch (c = bits) {
            case 0: {
              maxpower = 256;
              power = 1;
              bits = 0;
              while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index);
                  data.index += 1;
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              dictionary[dictSize] = f(bits);
              dictSize += 1;
              c = dictSize - 1;
              enlargeIn -= 1;
              break;
            }
            case 1: {
              maxpower = 65536;
              power = 1;
              bits = 0;
              while (power !== maxpower) {
                resb = data.val & data.position;
                data.position >>= 1;
                if (data.position === 0) {
                  data.position = resetValue;
                  data.val = getNextValue(data.index);
                  data.index += 1;
                }
                bits |= (resb > 0 ? 1 : 0) * power;
                power <<= 1;
              }
              dictionary[dictSize] = f(bits);
              dictSize += 1;
              c = dictSize - 1;
              enlargeIn -= 1;
              break;
            }
            case 2:
              return result.join('');
            default:
              break;
          }
          if (enlargeIn === 0) {
            enlargeIn = 2 ** numBits;
            numBits += 1;
          }
          if (dictionary[c]) {
            entry = dictionary[c];
          } else if (c === dictSize) {
            entry = w + w.charAt(0);
          } else {
            return '';
          }
          result.push(entry);
          dictionary[dictSize] = w + entry.charAt(0);
          dictSize += 1;
          enlargeIn -= 1;
          w = entry;
          if (enlargeIn === 0) {
            enlargeIn = 2 ** numBits;
            numBits += 1;
          }
        }
      },
    };
    return LZ;
  }

  function encodeTypedArray(view) {
    if (!view) return '';
    const bytes = view instanceof Uint8Array
      ? view
      : new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return window.btoa(binary);
  }

  function decodeBase64(value) {
    if (typeof value !== 'string' || value.length === 0) {
      return new Uint8Array(0);
    }
    try {
      const binary = window.atob(value);
      const length = binary.length;
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      return new Uint8Array(0);
    }
  }

  function normalizeColorValue(input) {
    if (!input || typeof input !== 'object') {
      return { r: 0, g: 0, b: 0, a: 255 };
    }
    return {
      r: clamp(Math.round(Number(input.r) ?? 0), 0, 255),
      g: clamp(Math.round(Number(input.g) ?? 0), 0, 255),
      b: clamp(Math.round(Number(input.b) ?? 0), 0, 255),
      a: clamp(Math.round(Number(input.a) ?? 255), 0, 255),
    };
  }

  function normalizeLastGroupTool(value) {
    const fallback = { ...DEFAULT_GROUP_TOOL };
    if (!value || typeof value !== 'object') {
      return fallback;
    }
    const result = { ...fallback };
    Object.keys(TOOL_GROUPS).forEach(group => {
      const candidate = value[group];
      if (typeof candidate === 'string' && TOOL_GROUPS[group].tools.includes(candidate)) {
        result[group] = candidate;
      }
    });
    return result;
  }

  function validateBoundsObject(bounds) {
    if (!bounds || typeof bounds !== 'object') {
      return null;
    }
    const x0 = Number(bounds.x0);
    const y0 = Number(bounds.y0);
    const x1 = Number(bounds.x1);
    const y1 = Number(bounds.y1);
    if ([x0, y0, x1, y1].some(value => !Number.isFinite(value))) {
      return null;
    }
    return {
      x0: Math.floor(x0),
      y0: Math.floor(y0),
      x1: Math.floor(x1),
      y1: Math.floor(y1),
    };
  }

  // Keep the entire canvas visible when the zoom level is at the minimum (100%).
  function clampPanToViewportAtMinZoom() {
    const viewport = dom.canvasViewport;
    const stack = dom.canvases.stack;
    const scale = Number(state.scale) || MIN_ZOOM_SCALE;
    if (!viewport || !stack) return;
    if (Math.abs(scale - MIN_ZOOM_SCALE) > ZOOM_EPSILON) return;
    const viewportRect = viewport.getBoundingClientRect();
    const stackRect = stack.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0 || stackRect.width <= 0 || stackRect.height <= 0) {
      return;
    }
    let panAdjusted = false;
    if (stackRect.width <= viewportRect.width) {
      const horizontalLimit = (viewportRect.width - stackRect.width) / 2;
      const clampedX = clamp(Number(state.pan.x) || 0, -horizontalLimit, horizontalLimit);
      if (clampedX !== state.pan.x) {
        state.pan.x = clampedX;
        panAdjusted = true;
      }
    }
    if (stackRect.height <= viewportRect.height) {
      const verticalLimit = (viewportRect.height - stackRect.height) / 2;
      const clampedY = clamp(Number(state.pan.y) || 0, -verticalLimit, verticalLimit);
      if (clampedY !== state.pan.y) {
        state.pan.y = clampedY;
        panAdjusted = true;
      }
    }
    if (panAdjusted) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function applyViewportTransform() {
    if (!dom.canvases.stack) return;
    clampPanToViewportAtMinZoom();
    const panX = Math.round(Number(state.pan.x) || 0);
    const panY = Math.round(Number(state.pan.y) || 0);
    if (panX !== state.pan.x) {
      state.pan.x = panX;
    }
    if (panY !== state.pan.y) {
      state.pan.y = panY;
    }
    dom.canvases.stack.style.transform = `translate(${panX}px, ${panY}px)`;
    updateGridDecorations();
  }


  const referenceState = {
    objectUrl: null,
    hasImage: false,
    baseWidth: 0,
    baseHeight: 0,
    scale: 1,
    minScale: 1,
    maxScale: 64,
    resize: null,
  };

  function hasReferenceElements() {
    return Boolean(
      referenceDom.overlay &&
      referenceDom.wrap &&
      referenceDom.image &&
      referenceDom.loadButton &&
      referenceDom.input
    );
  }

  function updateReferenceStatus(message, tone = 'info') {
    if (typeof updateAutosaveStatus === 'function') {
      updateAutosaveStatus(message, tone);
    }
  }

  function clearReferenceImage(updateMessage = true) {
    if (!hasReferenceElements()) {
      return;
    }
    if (referenceState.objectUrl) {
      URL.revokeObjectURL(referenceState.objectUrl);
      referenceState.objectUrl = null;
    }
    referenceState.hasImage = false;
    referenceState.baseWidth = 0;
    referenceState.baseHeight = 0;
    referenceState.scale = referenceState.minScale;
    referenceState.resize = null;
    referenceDom.image.onload = null;
    referenceDom.image.onerror = null;
    referenceDom.image.removeAttribute('src');
    referenceDom.image.style.width = '0px';
    referenceDom.image.style.height = '0px';
    referenceDom.wrap.style.width = '0px';
    referenceDom.wrap.style.height = '0px';
    referenceDom.wrap.classList.remove('is-active');
    referenceDom.overlay.hidden = true;
    if (referenceDom.clearButton) {
      referenceDom.clearButton.hidden = true;
    }
    if (updateMessage) {
      updateReferenceStatus('参考画像を閉じました', 'info');
    }
  }

  function getReferenceViewportScaleLimit(width = referenceState.baseWidth, height = referenceState.baseHeight) {
    if (!width || !height) {
      return referenceState.maxScale;
    }
    const limitW = Math.max(1, Math.floor((window.innerWidth * 0.9) / width));
    const limitH = Math.max(1, Math.floor((window.innerHeight * 0.85) / height));
    const viewportLimit = Math.max(1, Math.min(limitW, limitH));
    return Math.max(referenceState.minScale, Math.min(referenceState.maxScale, viewportLimit));
  }

  function applyReferenceScale() {
    if (!referenceState.hasImage || !referenceState.baseWidth || !referenceState.baseHeight) {
      return;
    }
    const viewportLimit = getReferenceViewportScaleLimit();
    if (referenceState.scale > viewportLimit) {
      referenceState.scale = viewportLimit;
    }
    const displayWidth = referenceState.baseWidth * referenceState.scale;
    const displayHeight = referenceState.baseHeight * referenceState.scale;
    referenceDom.image.style.width = `${displayWidth}px`;
    referenceDom.image.style.height = `${displayHeight}px`;
    referenceDom.wrap.style.width = `${displayWidth}px`;
    referenceDom.wrap.style.height = `${displayHeight}px`;
    referenceDom.overlay.hidden = false;
    if (referenceDom.clearButton) {
      referenceDom.clearButton.hidden = false;
    }
  }

  function setReferenceScale(scale) {
    if (!referenceState.hasImage) {
      return;
    }
    const limit = getReferenceViewportScaleLimit();
    const clamped = Math.max(referenceState.minScale, Math.min(limit, Math.round(scale)));
    if (clamped === referenceState.scale) {
      applyReferenceScale();
      updateReferenceStatus(`参考画像: ${referenceState.baseWidth}×${referenceState.baseHeight}px / x${referenceState.scale}`);
      return;
    }
    referenceState.scale = clamped;
    applyReferenceScale();
    updateReferenceStatus(`参考画像: ${referenceState.baseWidth}×${referenceState.baseHeight}px / x${referenceState.scale}`);
  }

  function getReferenceAnchorPoint(handle, rect) {
    switch (handle) {
      case 'nw':
        return { x: rect.right, y: rect.bottom };
      case 'ne':
        return { x: rect.left, y: rect.bottom };
      case 'sw':
        return { x: rect.right, y: rect.top };
      case 'se':
      default:
        return { x: rect.left, y: rect.top };
    }
  }

  function onReferenceHandlePointerDown(event) {
    if (!referenceState.hasImage || !referenceState.baseWidth || !referenceState.baseHeight) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const rect = referenceDom.wrap.getBoundingClientRect();
    referenceDom.wrap.classList.add('is-active');
    const anchor = getReferenceAnchorPoint(handle.dataset.handle, rect);
    referenceState.resize = {
      pointerId: event.pointerId,
      handle,
      anchorX: anchor.x,
      anchorY: anchor.y,
    };
    try {
      handle.setPointerCapture(event.pointerId);
    } catch (error) {
      console.debug('Reference handle pointer capture failed', error);
    }
  }

  function onReferenceHandlePointerMove(event) {
    const resize = referenceState.resize;
    if (!resize || event.pointerId !== resize.pointerId) {
      return;
    }
    if (!referenceState.baseWidth || !referenceState.baseHeight) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const distX = Math.abs(event.clientX - resize.anchorX);
    const distY = Math.abs(event.clientY - resize.anchorY);
    const desiredScale = Math.max(
      distX / referenceState.baseWidth,
      distY / referenceState.baseHeight,
      referenceState.minScale
    );
    setReferenceScale(desiredScale);
  }

  function onReferenceHandlePointerUp(event) {
    const resize = referenceState.resize;
    if (!resize || event.pointerId !== resize.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    try {
      resize.handle.releasePointerCapture(event.pointerId);
    } catch (error) {
      console.debug('Reference handle pointer release failed', error);
    }
    referenceState.resize = null;
    updateReferenceStatus(`参考画像: ${referenceState.baseWidth}×${referenceState.baseHeight}px / x${referenceState.scale}`);
  }

  function setReferenceActive(active) {
    if (!referenceState.hasImage) {
      return;
    }
    referenceDom.wrap.classList.toggle('is-active', Boolean(active));
  }

  function loadReferenceImage(file) {
    if (!file || !hasReferenceElements()) {
      return;
    }
    const previousUrl = referenceState.objectUrl;
    const objectUrl = URL.createObjectURL(file);
    const tempImage = new Image();
    tempImage.decoding = 'async';
    tempImage.onload = () => {
      tempImage.onload = null;
      tempImage.onerror = null;
      const width = tempImage.naturalWidth || tempImage.width;
      const height = tempImage.naturalHeight || tempImage.height;
      if (!width || !height) {
        URL.revokeObjectURL(objectUrl);
        updateReferenceStatus('参考画像の読み込みに失敗しました', 'error');
        return;
      }
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      referenceState.objectUrl = objectUrl;
      referenceState.hasImage = true;
      referenceState.baseWidth = width;
      referenceState.baseHeight = height;
      referenceState.resize = null;
      const viewportLimit = getReferenceViewportScaleLimit(width, height);
      const initialScaleCandidate = Math.min(
        viewportLimit,
        Math.max(1, Math.floor((window.innerWidth * 0.35) / width)),
        Math.max(1, Math.floor((window.innerHeight * 0.35) / height))
      ) || 1;
      referenceState.scale = Math.max(referenceState.minScale, Math.min(viewportLimit, initialScaleCandidate));
      referenceDom.image.onload = null;
      referenceDom.image.onerror = null;
      referenceDom.image.src = objectUrl;
      applyReferenceScale();
      setReferenceActive(true);
      updateReferenceStatus(`参考画像: ${width}×${height}px / x${referenceState.scale}`, 'success');
    };
    tempImage.onerror = () => {
      tempImage.onload = null;
      tempImage.onerror = null;
      URL.revokeObjectURL(objectUrl);
      updateReferenceStatus('参考画像の読み込みに失敗しました', 'error');
    };
    tempImage.src = objectUrl;
  }

  function setupReferenceOverlay() {
    if (!hasReferenceElements()) {
      return;
    }
    clearReferenceImage(false);
    referenceDom.loadButton?.addEventListener('click', event => {
      event.stopPropagation();
      if (referenceDom.input) {
        referenceDom.input.value = '';
        referenceDom.input.click();
      }
    });
    referenceDom.input?.addEventListener('change', event => {
      const file = event.target.files && event.target.files[0];
      if (file) {
        loadReferenceImage(file);
      }
      event.target.value = '';
    });
    referenceDom.clearButton?.addEventListener('click', event => {
      event.stopPropagation();
      clearReferenceImage();
    });
    referenceDom.handles.forEach(handle => {
      handle.addEventListener('pointerdown', onReferenceHandlePointerDown);
      handle.addEventListener('pointermove', onReferenceHandlePointerMove);
      handle.addEventListener('pointerup', onReferenceHandlePointerUp);
      handle.addEventListener('pointercancel', onReferenceHandlePointerUp);
      handle.addEventListener('click', event => event.stopPropagation());
    });
    referenceDom.wrap?.addEventListener('click', event => {
      if (!referenceState.hasImage) {
        return;
      }
      setReferenceActive(true);
      event.stopPropagation();
    });
    document.addEventListener('click', event => {
      if (!referenceState.hasImage) {
        return;
      }
      if (referenceDom.wrap && referenceDom.wrap.contains(event.target)) {
        return;
      }
      if (referenceState.resize) {
        return;
      }
      setReferenceActive(false);
    });
    window.addEventListener('resize', () => {
      if (!referenceState.hasImage) {
        return;
      }
      const limit = getReferenceViewportScaleLimit();
      if (referenceState.scale > limit) {
        setReferenceScale(limit);
      } else {
        applyReferenceScale();
        updateReferenceStatus(`参考画像: ${referenceState.baseWidth}×${referenceState.baseHeight}px / x${referenceState.scale}`);
      }
    });
  }

  async function init() {
    await initializeIosSnapshotFallback();
    await initializeAutosave();
    setupLeftTabs();
    setupRightTabs();
    setupLayout();
    setupGlobalFocusDismiss();
    setupControls();
    setupExportDialog();
    setupTools();
    setupToolGroups();
    setupPaletteEditor();
    setupFramesAndLayers();
    setupCanvas();
    setupReferenceOverlay();
    setupKeyboard();
    initMemoryMonitor();
    updateDocumentMetadata();
    setupStartupScreen();
    const skipStartup = EMBED_CONFIG.skipStartup === true;
    if (lensImportRequested || skipStartup) {
      hideStartupScreen();
    }
    const importedFromLens = await maybeImportLensCapture();
    renderEverything();
    if (!lensImportRequested && !importedFromLens && !skipStartup && !hasDismissedStartupScreen()) {
      showStartupScreen();
    }
  }

  function getActiveTool() {
    // When idle, always reflect the selected tool to avoid stale pointer tool previews.
    if (!pointerState.active) {
      return state.tool;
    }
    return pointerState.tool || state.tool;
  }

  function getRailNode(side) {
    return side === 'right' ? dom.rightRail : dom.leftRail;
  }

  function getRailCssVarName(side) {
    return side === 'right' ? '--right-width' : '--left-width';
  }

  function normalizeRailWidth(side, value) {
    const fallback = Number(railSizing[side]) || RAIL_DEFAULT_WIDTH[side];
    const numeric = Math.round(Number(value));
    const base = Number.isFinite(numeric) ? numeric : fallback;
    const viewportLimit = Math.max(RAIL_MIN_WIDTH, Math.floor((window.innerWidth || 0) * 0.45));
    const maxWidth = Math.max(RAIL_MIN_WIDTH, Math.min(RAIL_MAX_WIDTH, viewportLimit));
    return clamp(base, RAIL_MIN_WIDTH, maxWidth);
  }

  function updateRailCompactState(targetSide = null) {
    const isMobile = layoutMode === 'mobilePortrait';
    const apply = side => {
      const railNode = getRailNode(side);
      if (!railNode) return;
      const threshold = side === 'right' ? RAIL_COMPACT_THRESHOLD.right : RAIL_COMPACT_THRESHOLD.left;
      const compact = !isMobile && Number(railSizing[side]) <= threshold;
      railNode.dataset.compact = compact ? 'true' : 'false';
    };
    if (targetSide === 'left' || targetSide === 'right') {
      apply(targetSide);
      return;
    }
    apply('left');
    apply('right');
  }

  function setRailWidth(side, width, { persist = true } = {}) {
    if (side !== 'left' && side !== 'right') {
      return;
    }
    const normalized = normalizeRailWidth(side, width);
    railSizing[side] = normalized;
    const cssVar = getRailCssVarName(side);
    if (dom.layout) {
      dom.layout.style.setProperty(cssVar, `${normalized}px`);
    } else {
      document.documentElement.style.setProperty(cssVar, `${normalized}px`);
    }
    updateRailCompactState(side);
    if (side === 'left') {
      if (!isCompactToolRailMode()) {
        setCompactToolFlyoutOpen(false);
      }
      updateToolVisibility();
    } else {
      if (!isCompactRightRailMode() && isCompactRightFlyoutOpen()) {
        setCompactRightFlyoutOpen(false);
      }
      updateRightTabVisibility();
    }
    updateRailMetrics();
    if (persist) {
      scheduleSessionPersist();
    }
  }

  function beginRailResize(side, event) {
    if (layoutMode === 'mobilePortrait') {
      return;
    }
    const handle = side === 'right' ? dom.resizeHandles.right : dom.resizeHandles.left;
    if (!handle) {
      return;
    }
    event.preventDefault();
    if (side === 'left') {
      setCompactToolFlyoutOpen(false);
      updateToolVisibility();
    } else {
      setCompactRightFlyoutOpen(false);
      updateRightTabVisibility();
    }
    railSizing.activeSide = side;
    railSizing.pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
    railSizing.startClientX = Number(event.clientX) || 0;
    railSizing.startWidth = Number(railSizing[side]) || RAIL_DEFAULT_WIDTH[side];
    railSizing.captureTarget = handle;
    handle.classList.add('is-active');
    document.body.classList.add('is-rail-resizing');
    if (railSizing.pointerId !== null && typeof handle.setPointerCapture === 'function') {
      try {
        handle.setPointerCapture(railSizing.pointerId);
      } catch (error) {
        // Ignore pointer capture failures.
      }
    }
    window.addEventListener('pointermove', handleRailResizePointerMove);
    window.addEventListener('pointerup', handleRailResizePointerUp);
    window.addEventListener('pointercancel', handleRailResizePointerUp);
  }

  function handleRailResizePointerMove(event) {
    const side = railSizing.activeSide;
    if (!side) {
      return;
    }
    if (railSizing.pointerId !== null && event.pointerId !== railSizing.pointerId) {
      return;
    }
    const deltaX = (Number(event.clientX) || 0) - railSizing.startClientX;
    const width = side === 'left' ? railSizing.startWidth + deltaX : railSizing.startWidth - deltaX;
    setRailWidth(side, width, { persist: false });
  }

  function endRailResize({ persist = false } = {}) {
    const handle = railSizing.captureTarget;
    if (handle) {
      handle.classList.remove('is-active');
      if (railSizing.pointerId !== null && typeof handle.releasePointerCapture === 'function') {
        try {
          handle.releasePointerCapture(railSizing.pointerId);
        } catch (error) {
          // Ignore pointer release failures.
        }
      }
    }
    railSizing.activeSide = null;
    railSizing.pointerId = null;
    railSizing.captureTarget = null;
    railSizing.startClientX = 0;
    railSizing.startWidth = 0;
    document.body.classList.remove('is-rail-resizing');
    window.removeEventListener('pointermove', handleRailResizePointerMove);
    window.removeEventListener('pointerup', handleRailResizePointerUp);
    window.removeEventListener('pointercancel', handleRailResizePointerUp);
    if (persist) {
      scheduleSessionPersist();
    }
  }

  function handleRailResizePointerUp(event) {
    if (!railSizing.activeSide) {
      return;
    }
    if (railSizing.pointerId !== null && event.pointerId !== railSizing.pointerId) {
      return;
    }
    endRailResize({ persist: true });
  }

  function setupRailResizers() {
    const bind = (side, handle) => {
      if (!handle || handle.dataset.bound === 'true') {
        return;
      }
      handle.dataset.bound = 'true';
      handle.addEventListener('pointerdown', event => {
        const isPrimaryPointer =
          event.button === 0 || event.pointerType === 'touch' || event.pointerType === 'pen';
        if (!isPrimaryPointer) {
          return;
        }
        beginRailResize(side, event);
      });
    };
    bind('left', dom.resizeHandles.left);
    bind('right', dom.resizeHandles.right);
  }

  function normalizeMobileDrawerMode(mode) {
    return MOBILE_DRAWER_MODE_ORDER.includes(mode) ? mode : MOBILE_DRAWER_DEFAULT_MODE;
  }

  function getMobileDrawerModeRank(mode) {
    return MOBILE_DRAWER_MODE_ORDER.indexOf(normalizeMobileDrawerMode(mode));
  }

  function getViewportSize() {
    const viewport = IS_ANDROID_LINE_BROWSER ? null : window.visualViewport;
    const width = Math.max(0, Math.round(Number(viewport?.width) || Number(window.innerWidth) || 0));
    const height = Math.max(0, Math.round(Number(viewport?.height) || Number(window.innerHeight) || 0));
    return { width, height };
  }

  function getViewportBounds() {
    const viewport = IS_ANDROID_LINE_BROWSER ? null : window.visualViewport;
    const left = Math.round(Number(viewport?.offsetLeft) || 0);
    const top = Math.round(Number(viewport?.offsetTop) || 0);
    const width = Math.max(0, Math.round(Number(viewport?.width) || Number(window.innerWidth) || 0));
    const height = Math.max(0, Math.round(Number(viewport?.height) || Number(window.innerHeight) || 0));
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
    };
  }

  function getSafeAreaInsets() {
    const root = document.documentElement;
    if (!(root instanceof HTMLElement) || typeof window.getComputedStyle !== 'function') {
      return { top: 0, right: 0, bottom: 0, left: 0 };
    }
    const styles = window.getComputedStyle(root);
    const read = key => {
      const raw = styles.getPropertyValue(key);
      const parsed = Number.parseFloat(raw);
      return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
    };
    return {
      top: read('--safe-area-top'),
      right: read('--safe-area-right'),
      bottom: read('--safe-area-bottom'),
      left: read('--safe-area-left'),
    };
  }

  function updateMobileViewportHeightVar() {
    const root = document.documentElement;
    if (!(root instanceof HTMLElement)) {
      return;
    }
    const { width, height } = getViewportSize();
    if (width > 0) {
      root.style.setProperty('--mobile-viewport-width', `${width}px`);
    }
    if (height > 0) {
      root.style.setProperty('--mobile-viewport-height', `${height}px`);
      if (!isSoftKeyboardInputTarget(document.activeElement)) {
        softKeyboardBaselineViewportHeight = height;
      }
    }
  }

  function applyMobileDrawerHeight(height) {
    const root = document.documentElement;
    if (!(root instanceof HTMLElement)) {
      return;
    }
    const minHeight = Math.min(mobileDrawerState.heights.peek, mobileDrawerState.heights.full);
    const maxHeight = Math.max(mobileDrawerState.heights.peek, mobileDrawerState.heights.full);
    const clampedHeight = clamp(Math.round(Number(height) || 0), minHeight, maxHeight);
    mobileDrawerState.drag.currentHeight = clampedHeight;
    root.style.setProperty('--mobile-drawer-height', `${clampedHeight}px`);
  }

  function getClosestMobileDrawerMode(height) {
    let closest = MOBILE_DRAWER_DEFAULT_MODE;
    let minDistance = Number.POSITIVE_INFINITY;
    MOBILE_DRAWER_MODE_ORDER.forEach(mode => {
      const candidate = mobileDrawerState.heights[mode];
      if (!Number.isFinite(candidate)) {
        return;
      }
      const distance = Math.abs(candidate - height);
      if (distance < minDistance) {
        minDistance = distance;
        closest = mode;
      }
    });
    return closest;
  }

  function setMobileDrawerMode(mode, { persist = false } = {}) {
    const normalizedMode = normalizeMobileDrawerMode(mode);
    mobileDrawerState.mode = normalizedMode;
    if (dom.mobileDrawer) {
      dom.mobileDrawer.dataset.mode = normalizedMode;
    }
    applyMobileDrawerHeight(mobileDrawerState.heights[normalizedMode]);
    if (!isCompactToolRailMode() && isCompactToolFlyoutOpen()) {
      setCompactToolFlyoutOpen(false);
    }
    updateToolVisibility();
    if (persist) {
      scheduleSessionPersist();
    }
  }

  function activateMobileTab(target, { ensureDrawer = false } = {}) {
    if (!target || !dom.mobilePanels[target]) {
      return false;
    }
    let activated = false;
    dom.mobileTabs.forEach(btn => {
      const key = btn.dataset.mobileTab;
      const panel = key ? dom.mobilePanels[key] : null;
      if (!panel) {
        return;
      }
      const isActive = key === target;
      if (isActive) {
        activated = true;
      }
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        btn.removeAttribute('tabindex');
      } else {
        btn.setAttribute('tabindex', '-1');
      }
      panel.classList.toggle('is-active', isActive);
      panel.toggleAttribute('hidden', !isActive);
    });

    if (activated && ensureDrawer && layoutMode === 'mobilePortrait') {
      const requiredMode = MOBILE_TAB_DRAWER_MODE[target] || MOBILE_DRAWER_DEFAULT_MODE;
      if (getMobileDrawerModeRank(mobileDrawerState.mode) < getMobileDrawerModeRank(requiredMode)) {
        setMobileDrawerMode(requiredMode, { persist: false });
      }
    }
    if (activated && target !== 'tools' && isCompactToolFlyoutOpen()) {
      setCompactToolFlyoutOpen(false);
    }
    if (activated) {
      updateToolVisibility();
    }
    return activated;
  }

  function endMobileDrawerDrag({ persist = false, snap = true } = {}) {
    if (!mobileDrawerState.drag.active) {
      return;
    }
    const { pointerId } = mobileDrawerState.drag;
    mobileDrawerState.drag.active = false;
    window.removeEventListener('pointermove', handleMobileDrawerPointerMove);
    window.removeEventListener('pointerup', handleMobileDrawerPointerUp);
    window.removeEventListener('pointercancel', handleMobileDrawerPointerUp);
    if (dom.mobileDrawerHandle && pointerId !== null && typeof dom.mobileDrawerHandle.releasePointerCapture === 'function') {
      try {
        dom.mobileDrawerHandle.releasePointerCapture(pointerId);
      } catch (error) {
        // Ignore pointer release failures.
      }
    }
    dom.mobileDrawer?.classList.remove('is-dragging');
    const fallbackHeight = mobileDrawerState.heights[mobileDrawerState.mode] || mobileDrawerState.heights.half;
    const snapHeight = mobileDrawerState.drag.currentHeight || mobileDrawerState.drag.startHeight || fallbackHeight;
    const resolvedMode = getClosestMobileDrawerMode(snapHeight);
    mobileDrawerState.mode = resolvedMode;
    if (snap) {
      setMobileDrawerMode(resolvedMode, { persist });
    }
    mobileDrawerState.drag.pointerId = null;
    mobileDrawerState.drag.startY = 0;
    mobileDrawerState.drag.startHeight = 0;
    mobileDrawerState.drag.currentHeight = 0;
    mobileDrawerState.drag.moved = false;
  }

  function handleMobileDrawerPointerMove(event) {
    if (!mobileDrawerState.drag.active) {
      return;
    }
    if (mobileDrawerState.drag.pointerId !== null && event.pointerId !== mobileDrawerState.drag.pointerId) {
      return;
    }
    const deltaY = mobileDrawerState.drag.startY - (Number(event.clientY) || 0);
    const nextHeight = mobileDrawerState.drag.startHeight + deltaY;
    const minHeight = Math.min(mobileDrawerState.heights.peek, mobileDrawerState.heights.full);
    const maxHeight = Math.max(mobileDrawerState.heights.peek, mobileDrawerState.heights.full);
    const clampedHeight = clamp(Math.round(nextHeight), minHeight, maxHeight);
    mobileDrawerState.drag.currentHeight = clampedHeight;
    if (Math.abs(deltaY) >= 4) {
      mobileDrawerState.drag.moved = true;
    }
    applyMobileDrawerHeight(clampedHeight);
    event.preventDefault();
  }

  function handleMobileDrawerPointerUp(event) {
    if (!mobileDrawerState.drag.active) {
      return;
    }
    if (mobileDrawerState.drag.pointerId !== null && event.pointerId !== mobileDrawerState.drag.pointerId) {
      return;
    }
    endMobileDrawerDrag({ persist: true });
  }

  function beginMobileDrawerDrag(event) {
    if (layoutMode !== 'mobilePortrait' || !dom.mobileDrawer) {
      return;
    }
    const isPrimaryPointer =
      event.button === 0 || event.pointerType === 'touch' || event.pointerType === 'pen';
    if (!isPrimaryPointer) {
      return;
    }
    if (mobileDrawerState.drag.active) {
      endMobileDrawerDrag({ persist: false, snap: false });
    }
    const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
    mobileDrawerState.drag.active = true;
    mobileDrawerState.drag.pointerId = pointerId;
    mobileDrawerState.drag.startY = Number(event.clientY) || 0;
    mobileDrawerState.drag.startHeight =
      Math.round(dom.mobileDrawer.getBoundingClientRect().height) || mobileDrawerState.heights[mobileDrawerState.mode];
    mobileDrawerState.drag.currentHeight = mobileDrawerState.drag.startHeight;
    mobileDrawerState.drag.moved = false;
    dom.mobileDrawer.classList.add('is-dragging');
    if (dom.mobileDrawerHandle && pointerId !== null && typeof dom.mobileDrawerHandle.setPointerCapture === 'function') {
      try {
        dom.mobileDrawerHandle.setPointerCapture(pointerId);
      } catch (error) {
        // Ignore pointer capture failures.
      }
    }
    window.addEventListener('pointermove', handleMobileDrawerPointerMove, { passive: false });
    window.addEventListener('pointerup', handleMobileDrawerPointerUp);
    window.addEventListener('pointercancel', handleMobileDrawerPointerUp);
    event.preventDefault();
  }

  function setupMobileDrawerInteractions() {
    if (!dom.mobileDrawerHandle || dom.mobileDrawerHandle.dataset.bound === 'true') {
      return;
    }
    dom.mobileDrawerHandle.dataset.bound = 'true';
    dom.mobileDrawerHandle.addEventListener('pointerdown', beginMobileDrawerDrag);
    dom.mobileDrawerHandle.addEventListener('keydown', event => {
      if (layoutMode !== 'mobilePortrait') {
        return;
      }
      const currentIndex = getMobileDrawerModeRank(mobileDrawerState.mode);
      let nextMode = null;
      if (event.key === 'ArrowUp') {
        nextMode = MOBILE_DRAWER_MODE_ORDER[clamp(currentIndex + 1, 0, MOBILE_DRAWER_MODE_ORDER.length - 1)];
      } else if (event.key === 'ArrowDown') {
        nextMode = MOBILE_DRAWER_MODE_ORDER[clamp(currentIndex - 1, 0, MOBILE_DRAWER_MODE_ORDER.length - 1)];
      } else if (event.key === 'Home') {
        nextMode = 'peek';
      } else if (event.key === 'End') {
        nextMode = 'full';
      }
      if (!nextMode) {
        return;
      }
      event.preventDefault();
      setMobileDrawerMode(nextMode, { persist: true });
    });
  }

  function setupLayout() {
    if (!softKeyboardFocusGuardBound) {
      softKeyboardFocusGuardBound = true;
      document.addEventListener(
        'focusin',
        event => {
          if (!isCoarsePointerDevice()) {
            return;
          }
          if (isSoftKeyboardInputTarget(event.target)) {
            lastSoftKeyboardFocusAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
          }
        },
        true
      );
      document.addEventListener(
        'focusout',
        event => {
          if (!isCoarsePointerDevice()) {
            return;
          }
          if (!isSoftKeyboardInputTarget(event.target)) {
            return;
          }
          setTimeout(() => {
            if (!isSoftKeyboardInputTarget(document.activeElement)) {
              updateLayoutMode();
            }
          }, 160);
        },
        true
      );
    }

    const handleLayoutResize = debounce(() => {
      if (isVirtualKeyboardLikelyOpen()) {
        return;
      }
      updateLayoutMode();
    }, 120);
    window.addEventListener('resize', handleLayoutResize);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleLayoutResize);
      window.visualViewport.addEventListener('scroll', handleLayoutResize);
    }

    dom.mobileTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.mobileTab;
        if (!target) {
          return;
        }
        activateMobileTab(target, { ensureDrawer: false });
      });
    });
    setupRailResizers();
    setupMobileDrawerInteractions();
    updateLayoutMode();
    updateRailToggleVisibility();
  }

  function isVirtualKeyboardLikelyOpen() {
    const active = document.activeElement;
    if (!isCoarsePointerDevice() || !isInputControlElement(active) || !isSoftKeyboardInputTarget(active)) {
      return false;
    }
    const viewport = window.visualViewport;
    if (!viewport) {
      return false;
    }
    const viewportHeight = Math.max(0, Math.round(Number(viewport.height) || 0));
    const innerHeight = Math.max(0, Math.round(Number(window.innerHeight) || 0));
    if (viewportHeight <= 0 || innerHeight <= 0) {
      return false;
    }
    const baseline = Math.max(softKeyboardBaselineViewportHeight || 0, innerHeight);
    const baselineLoss = baseline - viewportHeight;
    const innerLoss = innerHeight - viewportHeight;
    if (baselineLoss > 96 && viewportHeight < baseline * 0.92) {
      return true;
    }
    if (innerLoss > 120 && viewportHeight < innerHeight * 0.88) {
      return true;
    }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsedSinceFocus = now - lastSoftKeyboardFocusAt;
    return elapsedSinceFocus >= 0 && elapsedSinceFocus < 700 && baselineLoss > 36;
  }

  function updateRailMetrics() {
    const layoutNode = dom.layout;
    if (!layoutNode) return;
    const isMobile = layoutMode === 'mobilePortrait';
    const leftWidth = isMobile ? 0 : (dom.leftRail ? dom.leftRail.offsetWidth : 0);
    const rightWidth = isMobile ? 0 : (dom.rightRail ? dom.rightRail.offsetWidth : 0);
    const toggleMargin = 12;
    layoutNode.style.setProperty('--left-toggle-offset', `${leftWidth ? leftWidth + toggleMargin : toggleMargin}px`);
    layoutNode.style.setProperty('--right-toggle-offset', `${rightWidth ? rightWidth + toggleMargin : toggleMargin}px`);
  }

  function isCoarsePointerDevice() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    try {
      return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
    } catch (error) {
      return false;
    }
  }

  function updateAdaptiveMobileLayoutVars() {
    const root = document.documentElement;
    if (!(root instanceof HTMLElement)) {
      return;
    }
    updateMobileViewportHeightVar();
    if (layoutMode !== 'mobilePortrait') {
      root.style.removeProperty('--mobile-drawer-height');
      root.style.removeProperty('--mobile-topbar-height');
      root.style.removeProperty('--mobile-drawer-peek-height');
      root.style.removeProperty('--mobile-drawer-half-height');
      root.style.removeProperty('--mobile-drawer-full-height');
      return;
    }
    const { width, height } = getViewportSize();
    const portrait = height >= width;
    const topbar = clamp(
      Math.round(height * (portrait ? 0.12 : 0.15)),
      portrait ? 84 : 72,
      portrait ? 124 : 102
    );
    const peek = clamp(
      Math.round(height * (portrait ? 0.19 : 0.22)) + MOBILE_DRAWER_PEEK_HEIGHT_OFFSET,
      104 + MOBILE_DRAWER_PEEK_HEIGHT_OFFSET,
      (portrait ? 176 : 180) + MOBILE_DRAWER_PEEK_HEIGHT_OFFSET
    );
    const fullMin = Math.max(peek + 84, portrait ? 238 : 220);
    const fullCapByViewport = Math.round(height - topbar - 52);
    const fullCap = Math.max(fullMin, Math.min(fullCapByViewport, portrait ? 560 : 360));
    const full = clamp(
      Math.round(height * (portrait ? 0.48 : 0.56)),
      fullMin,
      fullCap
    );
    const half = full;
    mobileDrawerState.heights.peek = peek;
    mobileDrawerState.heights.half = half;
    mobileDrawerState.heights.full = full;
    root.style.setProperty('--mobile-topbar-height', `${topbar}px`);
    root.style.setProperty('--mobile-drawer-peek-height', `${peek}px`);
    root.style.setProperty('--mobile-drawer-half-height', `${half}px`);
    root.style.setProperty('--mobile-drawer-full-height', `${full}px`);
    setMobileDrawerMode(mobileDrawerState.mode, { persist: false });
  }

  function updateLayoutMode() {
    const { width, height } = getViewportSize();
    const portrait = height >= width;
    const coarsePointer = isCoarsePointerDevice();
    const shortestEdge = Math.min(width, height);
    const longestEdge = Math.max(width, height);
    const shouldUseMobilePortrait =
      (coarsePointer && portrait && shortestEdge <= 980 && longestEdge <= 2200) ||
      (!coarsePointer && portrait && width <= 680 && height <= 1280);
    let nextMode = 'desktop';

    if (shouldUseMobilePortrait) {
      nextMode = 'mobilePortrait';
    } else if (width <= 1100 || (coarsePointer && width <= 1366 && height <= 900)) {
      nextMode = 'narrow';
    }

    if (layoutMode === nextMode) {
      updateAdaptiveMobileLayoutVars();
      if (nextMode !== 'mobilePortrait') {
        setRailWidth('left', railSizing.left, { persist: false });
        setRailWidth('right', railSizing.right, { persist: false });
      }
      updateRailToggleVisibility();
      return;
    }

    layoutMode = nextMode;
    applyLayoutMode();
  }

  function applyLayoutMode() {
    const isMobile = layoutMode === 'mobilePortrait';
    updateAdaptiveMobileLayoutVars();
    dom.mobileDrawer.hidden = !isMobile;
    if (dom.mobileTopBar) {
      dom.mobileTopBar.hidden = !isMobile;
    }
    if (dom.canvasControls) {
      if (isMobile && dom.mobileShortcutsMount) {
        dom.canvasControls.dataset.mobile = 'true';
        dom.mobileShortcutsMount.appendChild(dom.canvasControls);
      } else if (!isMobile && canvasControlsDefaultParent) {
        delete dom.canvasControls.dataset.mobile;
        if (canvasControlsDefaultNextSibling && canvasControlsDefaultNextSibling.parentNode === canvasControlsDefaultParent) {
          canvasControlsDefaultParent.insertBefore(dom.canvasControls, canvasControlsDefaultNextSibling);
        } else {
          canvasControlsDefaultParent.appendChild(dom.canvasControls);
        }
      }
    }
    if (isMobile) {
      endRailResize({ persist: false });
      dom.leftRail.dataset.collapsed = 'true';
      dom.rightRail.dataset.collapsed = 'true';
      setMobileDrawerMode(mobileDrawerState.mode, { persist: false });
    } else {
      endMobileDrawerDrag({ persist: false });
      dom.leftRail.dataset.collapsed = 'false';
      dom.rightRail.dataset.collapsed = 'false';
      setRailWidth('left', railSizing.left, { persist: false });
      setRailWidth('right', railSizing.right, { persist: false });
    }

    Object.entries(layoutMap).forEach(([key, placement]) => {
      const section = dom.sections[key];
      if (!section) return;
      const target = isMobile ? placement.mobile : placement.desktop;
      if (!target) return;
      target.appendChild(section);
      section.classList.add('panel-section');
      section.classList.toggle('panel-section--mobile', isMobile);
    });

    updateLeftTabUI();
    updateLeftTabVisibility();
    updateRightTabUI();
    updateRightTabVisibility();

    if (isMobile) {
      const preferredMobileTab =
        (dom.mobilePanels[state.activeLeftTab] && state.activeLeftTab) ||
        (dom.mobilePanels[state.activeRightTab] && state.activeRightTab) ||
        dom.mobileTabs.find(tab => tab.classList.contains('is-active'))?.dataset.mobileTab ||
        dom.mobileTabs[0]?.dataset.mobileTab;
      if (preferredMobileTab) {
        activateMobileTab(preferredMobileTab, { ensureDrawer: false });
      }
    }

    updateRailToggleVisibility();
    updateToolVisibility();
    applyViewportTransform();
    clampFloatingDrawButtonPosition();
    resizeVirtualCursorCanvas();
    requestOverlayRender();
  }

  function updateRailToggleVisibility() {
    const isMobile = layoutMode === 'mobilePortrait';
    updateRailCompactState();
    updateRailMetrics();
    if (dom.resizeHandles.left) {
      dom.resizeHandles.left.hidden = isMobile;
    }
    if (dom.resizeHandles.right) {
      dom.resizeHandles.right.hidden = isMobile;
    }
  }

  function setVirtualCursorEnabled(enabled, options = {}) {
    const { persist = true, updateControl = true } = options;
    const next = Boolean(enabled);
    const prev = state.showVirtualCursor;

    if (updateControl && dom.controls.toggleVirtualCursor instanceof HTMLInputElement) {
      dom.controls.toggleVirtualCursor.checked = next;
    }
    if (prev === next) {
      return;
    }

    state.showVirtualCursor = next;
    if (next && !virtualCursor) {
      virtualCursor = createInitialVirtualCursor();
    }
    if (!next) {
      releaseVirtualCursorPointer();
      if (!pointerState.active && hoverPixel) {
        hoverPixel = null;
      }
    }
    requestOverlayRender();
    if (persist) {
      scheduleSessionPersist();
    }
    updateFloatingDrawButtonEnabledState();
    refreshViewportCursorStyle();
    updateVirtualCursorActionToolButtons();
    updateCanvasControlButtons();
  }

  function setupControls() {
    if (dom.controls.toggleGrid instanceof HTMLInputElement) {
      dom.controls.toggleGrid.addEventListener('change', () => {
        state.showGrid = dom.controls.toggleGrid.checked;
        updateGridDecorations();
        requestOverlayRender();
        scheduleSessionPersist();
      });
    }

    if (dom.controls.toggleMajorGrid instanceof HTMLInputElement) {
      dom.controls.toggleMajorGrid.addEventListener('change', () => {
        state.showMajorGrid = dom.controls.toggleMajorGrid.checked;
        updateGridDecorations();
        requestOverlayRender();
        scheduleSessionPersist();
      });
    }

    dom.controls.toggleBackgroundMode?.addEventListener('click', () => {
      const modes = ['dark', 'light', 'pink'];
      const nextIndex = (modes.indexOf(state.backgroundMode) + 1) % modes.length;
      state.backgroundMode = modes[nextIndex];
      updateGridDecorations();
      syncControlsWithState();
      scheduleSessionPersist();
    });

    const zoomSlider = dom.controls.zoomSlider;
    if (zoomSlider) {
      zoomSlider.min = '0';
      zoomSlider.max = String(ZOOM_STEPS.length - 1);
      zoomSlider.step = '1';
      zoomSlider.value = String(getZoomStepIndex(state.scale));
      zoomSlider.addEventListener('input', event => {
        const index = Number(event.target.value);
        setZoom(getZoomScaleAtIndex(index));
      });
    }

    const handleCanvasControlClick = event => {
      const action = event.currentTarget?.dataset?.action;
      if (!action) return;
      if (action === 'zoomOut') {
        adjustZoomBySteps(-1);
      } else if (action === 'zoomIn') {
        adjustZoomBySteps(1);
      } else if (action === 'copy') {
        copySelection();
      } else if (action === 'paste') {
        pasteSelection();
      } else if (action === 'cancelSelectionMove') {
        cancelPendingSelectionMove();
      } else if (action === 'confirmSelectionMove') {
        confirmPendingSelectionMove();
      }
      updateCanvasControlButtons();
    };

    dom.controls.canvasControlPrimary?.addEventListener('click', handleCanvasControlClick);
    dom.controls.canvasControlSecondary?.addEventListener('click', handleCanvasControlClick);

    if (dom.controls.undoAction) {
      dom.controls.undoAction.replaceChildren(makeIcon('action-undo', '↺', { width: 20, height: 20 }));
    }
    if (dom.controls.redoAction) {
      dom.controls.redoAction.replaceChildren(makeIcon('action-redo', '↻', { width: 20, height: 20 }));
    }

    updateCanvasControlButtons();

    dom.controls.brushSize?.addEventListener('input', event => {
      state.brushSize = clamp(Math.round(Number(event.target.value)), 1, 32);
      if (dom.controls.brushSizeValue) {
        dom.controls.brushSizeValue.textContent = `${state.brushSize}px`;
      }
      scheduleSessionPersist();
    });

    dom.controls.toggleChecker?.addEventListener('change', event => {
      state.showChecker = Boolean(event.target.checked);
      dom.canvases.stack.classList.toggle('is-flat', !state.showChecker);
      scheduleSessionPersist();
    });

    dom.controls.togglePixelPreview?.addEventListener('change', event => {
      state.showPixelGuides = Boolean(event.target.checked);
      requestOverlayRender();
      scheduleSessionPersist();
    });

    dom.controls.toggleVirtualCursor?.addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }
      setVirtualCursorEnabled(Boolean(event.target.checked));
    });

    if (dom.controls.virtualCursorButtonScale instanceof HTMLInputElement) {
      const slider = dom.controls.virtualCursorButtonScale;
      slider.min = String(FLOATING_DRAW_BUTTON_SCALE_VALUES[0]);
      slider.max = String(FLOATING_DRAW_BUTTON_SCALE_VALUES[FLOATING_DRAW_BUTTON_SCALE_VALUES.length - 1]);
      slider.step = '0.5';
      slider.addEventListener('input', event => {
        setVirtualCursorButtonScale(event.target.value, { persist: false, updateControl: false });
        updateFloatingDrawButtonScaleControl();
      });
      slider.addEventListener('change', event => {
        setVirtualCursorButtonScale(event.target.value);
      });
    }

    dom.controls.openDocument?.addEventListener('click', () => {
      openDocumentDialog();
    });

    dom.controls.exportProject?.addEventListener('click', () => {
      openExportDialog();
    });

    dom.controls.togglePixfindMode?.addEventListener('click', () => {
      setPixfindModeEnabled(!pixfindModeEnabled);
    });

    dom.controls.refreshPixfindBase?.addEventListener('click', () => {
      if (!pixfindModeEnabled) {
        updateAutosaveStatus('先にPiXFiNDモードをONにしてください', 'warn');
        return;
      }
      capturePixfindBaseSnapshot();
    });

    dom.controls.sendToPixfind?.addEventListener('click', () => {
      exportProjectToPixfind();
    });


    if (dom.newProject?.button) {
      dom.newProject.button.addEventListener('click', () => {
        openNewProjectDialog();
      });
    }
    if (dom.newProject?.form) {
      dom.newProject.form.addEventListener('submit', event => {
        event.preventDefault();
        handleNewProjectSubmit();
      });
    }
    if (dom.newProject?.cancel) {
      dom.newProject.cancel.addEventListener('click', () => {
        closeNewProjectDialog();
      });
    }
    if (dom.newProject?.dialog) {
      dom.newProject.dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeNewProjectDialog();
      });
    }

    if (dom.controls.applySpriteScale) {
      dom.controls.applySpriteScale.addEventListener('click', () => {
        const value = dom.controls.spriteScaleInput?.value ?? 1;
        applySpriteScaleMultiplier(value);
      });
    }
    if (dom.controls.spriteScaleInput) {
      dom.controls.spriteScaleInput.addEventListener('input', () => {
        updateSpriteScaleControlLimits();
      });
      dom.controls.spriteScaleInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          applySpriteScaleMultiplier(dom.controls.spriteScaleInput.value);
        }
      });
    }

    dom.controls.canvasWidth?.addEventListener('change', handleCanvasResizeRequest);
    dom.controls.canvasHeight?.addEventListener('change', handleCanvasResizeRequest);

    dom.controls.clearCanvas?.addEventListener('click', () => {
      if (!confirm('すべてのフレームをクリアしますか？')) {
        return;
      }
      beginHistory('clearCanvas');
      state.frames.forEach(frame => {
        frame.layers.forEach(layer => {
          layer.indices.fill(-1);
          if (layer.direct instanceof Uint8ClampedArray) {
            layer.direct.fill(0);
            layer.direct = null;
          }
        });
      });
      markHistoryDirty();
      requestRender();
      requestOverlayRender();
      commitHistory();
      scheduleSessionPersist();
    });

    dom.controls.undoAction?.addEventListener('click', () => undo());
    dom.controls.redoAction?.addEventListener('click', () => redo());

    setupNumberSteppers();
    syncControlsWithState();
    updateSpriteScaleControlLimits();
    applyEmbedGuardrails();
  }

  function applyEmbedGuardrails() {
    const lockWidth = lockedCanvasWidth !== null;
    const lockHeight = lockedCanvasHeight !== null;
    if (lockWidth && dom.controls.canvasWidth) {
      dom.controls.canvasWidth.value = String(lockedCanvasWidth);
      dom.controls.canvasWidth.setAttribute('disabled', 'true');
      dom.controls.canvasWidth.setAttribute('aria-disabled', 'true');
    }
    if (lockHeight && dom.controls.canvasHeight) {
      dom.controls.canvasHeight.value = String(lockedCanvasHeight);
      dom.controls.canvasHeight.setAttribute('disabled', 'true');
      dom.controls.canvasHeight.setAttribute('aria-disabled', 'true');
    }
    if (lockWidth && dom.newProject?.widthInput) {
      dom.newProject.widthInput.value = String(lockedCanvasWidth);
      dom.newProject.widthInput.readOnly = true;
      dom.newProject.widthInput.setAttribute('aria-readonly', 'true');
      dom.newProject.widthInput.title = 'キャンバスは固定サイズで利用中';
    }
    if (lockHeight && dom.newProject?.heightInput) {
      dom.newProject.heightInput.value = String(lockedCanvasHeight);
      dom.newProject.heightInput.readOnly = true;
      dom.newProject.heightInput.setAttribute('aria-readonly', 'true');
      dom.newProject.heightInput.title = 'キャンバスは固定サイズで利用中';
    }
  }

  function handleCanvasResizeRequest() {
    if (lockedCanvasWidth !== null || lockedCanvasHeight !== null) {
      if (dom.controls.canvasWidth) {
        dom.controls.canvasWidth.value = String(state.width);
      }
      if (dom.controls.canvasHeight) {
        dom.controls.canvasHeight.value = String(state.height);
      }
      return;
    }
    const width = clamp(Number(dom.controls.canvasWidth.value), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE) || state.width;
    const height = clamp(Number(dom.controls.canvasHeight.value), MIN_CANVAS_SIZE, MAX_CANVAS_SIZE) || state.height;
    if (width === state.width && height === state.height) {
      dom.controls.canvasWidth.value = String(state.width);
      dom.controls.canvasHeight.value = String(state.height);
      return;
    }

    beginHistory('resizeCanvas');
    resizeAllLayers(width, height);
    state.width = width;
    state.height = height;
    dom.controls.canvasWidth.value = String(width);
    dom.controls.canvasHeight.value = String(height);
    markHistoryDirty();
    resizeCanvases();
    clearSelection();
    requestRender();
    requestOverlayRender();
    commitHistory();
    scheduleSessionPersist();
  }

  function setupNumberSteppers() {
    const inputs = document.querySelectorAll('input[type="number"][data-stepper]');
    inputs.forEach(input => {
      if (input.dataset.stepperAttached === 'true') return;
      const parent = input.parentElement;
      if (!parent) return;
      const wrapper = document.createElement('div');
      wrapper.className = 'number-stepper';

      const createButton = (label, delta) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'number-stepper__btn';
        btn.textContent = label;
        btn.addEventListener('click', () => {
          const step = Number(input.step) || 1;
          const min = input.min !== '' ? Number(input.min) : -Infinity;
          const max = input.max !== '' ? Number(input.max) : Infinity;
          const current = Number(input.value);
          const base = Number.isFinite(current) ? current : 0;
          let next = base + delta * step;
          if (Number.isFinite(min)) next = Math.max(min, next);
          if (Number.isFinite(max)) next = Math.min(max, next);
          input.value = String(next);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        return btn;
      };

      const minus = createButton('−', -1);
      const plus = createButton('＋', 1);

      parent.insertBefore(wrapper, input);
      wrapper.appendChild(minus);
      wrapper.appendChild(input);
      wrapper.appendChild(plus);

      input.dataset.stepperAttached = 'true';
    });
  }

  function resizeAllLayers(width, height) {
    state.frames.forEach(frame => {
      frame.layers = frame.layers.map(layer => {
        const resized = createLayer(layer.name, width, height);
        const minW = Math.min(width, state.width);
        const minH = Math.min(height, state.height);
        const sourceDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
        const targetDirect = sourceDirect ? ensureLayerDirect(resized, width, height) : null;
        for (let y = 0; y < minH; y += 1) {
          for (let x = 0; x < minW; x += 1) {
            const srcIdx = y * state.width + x;
            const dstIdx = y * width + x;
            resized.indices[dstIdx] = layer.indices[srcIdx];
            if (sourceDirect && targetDirect) {
              const baseSrc = srcIdx * 4;
              const baseDst = dstIdx * 4;
              targetDirect[baseDst] = sourceDirect[baseSrc];
              targetDirect[baseDst + 1] = sourceDirect[baseSrc + 1];
              targetDirect[baseDst + 2] = sourceDirect[baseSrc + 2];
              targetDirect[baseDst + 3] = sourceDirect[baseSrc + 3];
            }
          }
        }
        resized.visible = layer.visible;
        resized.opacity = layer.opacity;
        return resized;
      });
    });
  }

  function scaleDocumentByRatio(numerator, denominator) {
    const num = Math.floor(Number(numerator));
    const den = Math.floor(Number(denominator));
    if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) {
      return false;
    }
    const originalWidth = state.width;
    const originalHeight = state.height;
    const newWidthRaw = (originalWidth * num) / den;
    const newHeightRaw = (originalHeight * num) / den;
    if (!Number.isInteger(newWidthRaw) || !Number.isInteger(newHeightRaw)) {
      return false;
    }
    const newWidth = newWidthRaw | 0;
    const newHeight = newHeightRaw | 0;
    if (newWidth < 1 || newHeight < 1 || newWidth > MAX_CANVAS_SIZE || newHeight > MAX_CANVAS_SIZE) {
      return false;
    }

    state.frames.forEach(frame => {
      frame.layers = frame.layers.map(layer => {
        const scaled = createLayer(layer.name, newWidth, newHeight);
        scaled.id = layer.id;
        scaled.visible = layer.visible;
        scaled.opacity = layer.opacity;

        const sourceIndices = layer.indices;
        const destIndices = scaled.indices;
        const hasDirect = layer.direct instanceof Uint8ClampedArray;
        const sourceDirect = hasDirect ? layer.direct : null;
        const targetDirect = hasDirect ? ensureLayerDirect(scaled, newWidth, newHeight) : null;

        for (let y = 0; y < newHeight; y += 1) {
          const srcY = Math.min(originalHeight - 1, Math.floor((y * den) / num));
          const srcRowStart = srcY * originalWidth;
          const destRowStart = y * newWidth;
          for (let x = 0; x < newWidth; x += 1) {
            const srcX = Math.min(originalWidth - 1, Math.floor((x * den) / num));
            const srcIndex = srcRowStart + srcX;
            const destIndex = destRowStart + x;
            destIndices[destIndex] = sourceIndices[srcIndex];
            if (targetDirect && sourceDirect) {
              const baseSrc = srcIndex * 4;
              const baseDst = destIndex * 4;
              targetDirect[baseDst] = sourceDirect[baseSrc];
              targetDirect[baseDst + 1] = sourceDirect[baseSrc + 1];
              targetDirect[baseDst + 2] = sourceDirect[baseSrc + 2];
              targetDirect[baseDst + 3] = sourceDirect[baseSrc + 3];
            }
          }
        }

        return scaled;
      });
    });

    state.width = newWidth;
    state.height = newHeight;
    const ratio = num / den;
    state.pan.x = Math.round((state.pan.x || 0) * ratio);
    state.pan.y = Math.round((state.pan.y || 0) * ratio);
    state.selectionMask = null;
    state.selectionBounds = null;
    return true;
  }

  function applySpriteScaleMultiplier(rawValue) {
    const input = dom.controls.spriteScaleInput;
    let factor = Number(rawValue);
    if (!Number.isFinite(factor)) factor = 1;
    factor = Math.max(1, Math.floor(factor));
    if (input) {
      input.value = String(factor);
    }

    const maxMultiplier = getMaxSpriteMultiplier();
    if (factor === 1) {
      updateSpriteScaleControlLimits();
      return;
    }
    if (factor > maxMultiplier) {
      window.alert(`拡大後のサイズが上限 (${MAX_CANVAS_SIZE}px) を超えます。最大倍率は ×${maxMultiplier} です。`);
      updateSpriteScaleControlLimits();
      return;
    }

    beginHistory('scaleSprite');
    const success = scaleDocumentByRatio(factor, 1);
    if (!success) {
      rollbackPendingHistory({ reRender: false });
      updateAutosaveStatus('スプライト倍率を適用できませんでした', 'warn');
      updateSpriteScaleControlLimits();
      return;
    }

    markHistoryDirty();
    resizeCanvases();
    clearSelection();
    requestRender();
    requestOverlayRender();
    commitHistory();
    scheduleSessionPersist();
    updateMemoryStatus();
    if (input) {
      input.value = '1';
    }
    updateSpriteScaleControlLimits();
    updateAutosaveStatus(`スプライト倍率 ×${factor} を適用しました`, 'info');
  }

  function setupTools() {
    toolButtons = Array.from(document.querySelectorAll('.tool-button[data-tool]'));
    toolButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tool = button.dataset.tool;
        if (!tool) return;
        if (TOOL_ACTIONS.has(tool)) {
          runToolAction(tool);
          return;
        }
        setActiveTool(tool);
      });
    });
    setActiveTool(state.tool, toolButtons, { persist: false });
    updateVirtualCursorActionToolButtons();

    dom.canvases.drawing.addEventListener('pointerdown', handlePointerDown);
    dom.canvases.drawing.addEventListener('pointercancel', handlePointerCancel);
    window.addEventListener('pointercancel', handlePointerCancel);
    dom.canvases.drawing.addEventListener('pointermove', event => {
      if (pointerState.active) return;
      const controllingTouch = state.showVirtualCursor
        && event.pointerType === 'touch'
        && virtualCursorControl.pointerId === event.pointerId;
      if (controllingTouch) {
        event.preventDefault();
        updateVirtualCursorFromControlDelta(event);
        return;
      }
      updateVirtualCursorFromEvent(event);
      const awaitingLineEnd = curveBuilder && curveBuilder.stage === 'line' && curveBuilder.awaitingEndPoint && curveBuilder.start;
      const position = getPointerPosition(event);

      if (awaitingLineEnd) {
        let needsRender = false;
        const start = curveBuilder.start;
        if (start && position) {
          const prev = pointerState.preview;
          if (!prev || prev.end?.x !== position.x || prev.end?.y !== position.y) {
            pointerState.preview = { start, end: position };
            needsRender = true;
          }
          if (pointerState.tool !== 'curve') {
            pointerState.tool = 'curve';
            needsRender = true;
          }
          if (hoverPixel) {
            hoverPixel = null;
            needsRender = true;
          }
        } else {
          if (pointerState.preview) {
            pointerState.preview = null;
            needsRender = true;
          }
          if (pointerState.tool === 'curve') {
            pointerState.tool = null;
            needsRender = true;
          }
          if (hoverPixel) {
            hoverPixel = null;
            needsRender = true;
          }
        }
        if (needsRender) {
          requestOverlayRender();
        }
        return;
      }

      if (pointerState.preview && pointerState.tool === 'curve') {
        pointerState.preview = null;
        pointerState.tool = null;
        requestOverlayRender();
      }

      if (!position) {
        if (hoverPixel) {
          hoverPixel = null;
          requestOverlayRender();
        }
        return;
      }
      if (!hoverPixel || hoverPixel.x !== position.x || hoverPixel.y !== position.y) {
        hoverPixel = position;
        requestOverlayRender();
      }
    });
    dom.canvases.drawing.addEventListener('pointerleave', () => {
      let needsRender = false;
      if (hoverPixel) {
        hoverPixel = null;
        needsRender = true;
      }
      if (curveBuilder && curveBuilder.stage === 'line' && curveBuilder.awaitingEndPoint && pointerState.preview) {
        pointerState.preview = null;
        pointerState.tool = null;
        needsRender = true;
      }
      if (needsRender) {
        requestOverlayRender();
      }
    });
    dom.canvases.drawing.addEventListener('contextmenu', event => event.preventDefault());
  }

  function setActiveTool(tool, buttons = toolButtons, options = {}) {
    const { persist = true, skipGroupUpdate = false } = options;
    if (!tool) return;
    if (TOOL_ACTIONS.has(tool)) {
      runToolAction(tool);
      if (TOOL_ACTIONS.has(state.tool)) {
        const group = TOOL_GROUPS[state.activeToolGroup] ? state.activeToolGroup : 'pen';
        const groupTools = TOOL_GROUPS[group]?.tools || [];
        const candidate = state.lastGroupTool?.[group];
        let fallback = (typeof candidate === 'string' && groupTools.includes(candidate))
          ? candidate
          : (DEFAULT_GROUP_TOOL[group] || 'pen');
        if (TOOL_ACTIONS.has(fallback)) {
          const firstNonAction = groupTools.find(item => !TOOL_ACTIONS.has(item));
          const penFallback = state.lastGroupTool?.pen;
          fallback = firstNonAction
            || (typeof penFallback === 'string' && !TOOL_ACTIONS.has(penFallback) ? penFallback : 'pen');
        }
        state.tool = fallback;
      }
      updateToolGroupButtons();
      updateToolVisibility();
      return;
    }
    state.tool = tool;
    buttons.forEach(btn => {
      const isActive = btn.dataset.tool === tool;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
    if (!state.lastGroupTool) {
      state.lastGroupTool = { ...DEFAULT_GROUP_TOOL };
    }
    const group = TOOL_TO_GROUP[tool];
    if (group) {
      if (!state.lastGroupTool[group]) {
        state.lastGroupTool[group] = DEFAULT_GROUP_TOOL[group] || TOOL_GROUPS[group]?.tools?.[0] || tool;
      }
      state.lastGroupTool[group] = tool;
      if (!skipGroupUpdate) {
        state.activeToolGroup = group;
        updateToolGroupButtons();
        updateToolVisibility();
      }
    } else if (!skipGroupUpdate) {
      updateToolGroupButtons();
      updateToolVisibility();
    }
    if (tool !== 'curve') {
      resetCurveBuilder();
    }
    if (!pointerState.active) {
      const toolChanged = pointerState.tool !== tool;
      const hadPreview = Boolean(pointerState.preview || pointerState.selectionPreview || pointerState.selectionMove);
      pointerState.tool = tool;
      if (hadPreview) {
        pointerState.preview = null;
        pointerState.selectionPreview = null;
        pointerState.selectionMove = null;
      }
      if (toolChanged || hadPreview) {
        requestOverlayRender();
      }
    }
    updateToolTabIcon();
    const mobilePeekMode = isMobilePeekToolFlyoutMode();
    if ((isCompactToolRailMode() || mobilePeekMode) && isCompactToolFlyoutOpen()) {
      setCompactToolFlyoutOpen(false);
      updateToolVisibility();
    }
    if (persist) {
      scheduleSessionPersist();
    }
  }

  function setupPaletteEditor() {
    dom.controls.addPaletteColor?.addEventListener('click', () => {
      beginHistory('paletteAdd');
      const nextIndex = state.palette.length;
      const last = state.palette[state.palette.length - 1] || { r: 88, g: 196, b: 255, a: 255 };
      state.palette.push({ ...last });
      setActivePaletteIndex(nextIndex);
      applyPaletteChange();
      commitHistory();
    });

    dom.controls.removePaletteColor?.addEventListener('click', () => {
      if (state.palette.length <= 1) return;
      const index = clamp(state.activePaletteIndex, 0, state.palette.length - 1);
      removePaletteColor(index);
    });

    dom.controls.paletteIndex?.addEventListener('change', () => {
      const target = clamp(Number(dom.controls.paletteIndex.value), 0, state.palette.length - 1);
      if (Number.isNaN(target)) return;
      reorderPalette(state.activePaletteIndex, target);
    });

    dom.controls.paletteHue?.addEventListener('input', () => {
      handlePaletteSliderInput({ source: 'hue' });
    });

    if (dom.controls.paletteHue) {
      dom.controls.paletteHue.style.background = 'linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)';
    }

    dom.controls.paletteSaturation?.addEventListener('input', () => {
      handlePaletteSliderInput({ source: 'saturation' });
    });

    dom.controls.paletteValue?.addEventListener('input', () => {
      handlePaletteSliderInput({ source: 'value' });
    });

    dom.controls.paletteAlphaSlider?.addEventListener('input', () => {
      handlePaletteSliderInput({ source: 'alpha' });
    });

    const wheel = dom.controls.paletteWheel;
    if (wheel && typeof wheel.getContext === 'function') {
      paletteWheelCtx = wheel.getContext('2d', { willReadFrequently: true }) || null;
      wheel.addEventListener('pointerdown', handlePaletteWheelPointerDown);
      wheel.addEventListener('pointercancel', handlePaletteWheelPointerUp);
      window.addEventListener('resize', debounce(() => {
        drawPaletteWheel();
        updatePaletteWheelCursor();
      }, 160));
    }

    renderPalette();
    syncPaletteInputs();
    updateToolTabIcon();
  }

  function reorderPalette(currentIndex, targetIndex) {
    if (currentIndex === targetIndex) return;
    beginHistory('paletteReorder');
    const previousOrder = state.palette.slice();
    const color = state.palette.splice(currentIndex, 1)[0];
    state.palette.splice(targetIndex, 0, color);
    const mapping = previousOrder.map(entry => state.palette.indexOf(entry));
    remapPaletteIndices(mapping);
    const newIndex = state.palette.indexOf(color);
    setActivePaletteIndex(newIndex);
    applyPaletteChange();
    commitHistory();
  }

  function setActivePaletteIndex(index) {
    state.activePaletteIndex = clamp(index, 0, state.palette.length - 1);
    syncPaletteInputs();
    renderPalette();
    scheduleSessionPersist();
  }

  function syncPaletteInputs() {
    const color = state.palette[state.activePaletteIndex];
    if (!color) return;
    dom.controls.paletteIndex.value = String(state.activePaletteIndex);
    const hsv = rgbaToHsv(color);
    paletteEditorState.hsv = {
      h: hsv.h,
      s: hsv.s,
      v: hsv.v,
      a: color.a,
    };
    if (dom.controls.paletteHue) {
      dom.controls.paletteHue.value = String(Math.round(hsv.h));
    }
    if (dom.controls.paletteSaturation) {
      dom.controls.paletteSaturation.value = String(Math.round(hsv.s * 100));
    }
    if (dom.controls.paletteValue) {
      dom.controls.paletteValue.value = String(Math.round(hsv.v * 100));
    }
    if (dom.controls.paletteAlphaSlider) {
      dom.controls.paletteAlphaSlider.value = String(color.a);
    }
    updatePaletteAlphaOutput();
    updatePalettePreview();
    drawPaletteWheel();
    updatePaletteWheelCursor();
    updateColorTabSwatch();
  }

  function renderPalette() {
    const container = dom.controls.paletteList;
    if (!container) return;
    container.innerHTML = '';
    state.palette.forEach((color, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'palette-swatch pixel-frame';
      button.dataset.index = String(index);
      button.setAttribute('aria-label', `インデックス ${index}`);
      button.title = `${index}: ${rgbaToHex(color)}`;
      button.classList.toggle('is-active', index === state.activePaletteIndex);
      applyPixelFrameBackground(button, color);
      button.addEventListener('click', () => setActivePaletteIndex(index));
      button.addEventListener('contextmenu', event => {
        event.preventDefault();
        if (state.palette.length <= 1) return;
        removePaletteColor(index);
      });
      container.appendChild(button);
    });
    updateColorTabSwatch();
    if (dom.controls.removePaletteColor) {
      dom.controls.removePaletteColor.disabled = state.palette.length <= 1;
    }
  }

  function removePaletteColor(index) {
    beginHistory('paletteRemove');
    const previousOrder = state.palette.slice();
    state.palette.splice(index, 1);
    const mapping = previousOrder.map(entry => state.palette.indexOf(entry));
    remapPaletteIndices(mapping);
    if (state.activePaletteIndex >= state.palette.length) {
      state.activePaletteIndex = Math.max(0, state.palette.length - 1);
    }
    renderPalette();
    syncPaletteInputs();
    applyPaletteChange();
    commitHistory();
  }

  function remapPaletteIndices(mapping) {
    if (!mapping) return;
    state.frames.forEach(frame => {
      frame.layers.forEach(layer => {
        const length = layer.indices.length;
        for (let i = 0; i < length; i += 1) {
          const oldIndex = layer.indices[i];
          if (oldIndex < 0) continue;
          const next = mapping[oldIndex];
          layer.indices[i] = typeof next === 'number' && next >= 0 ? next : -1;
        }
      });
    });
  }

  function applyPaletteChange() {
    markHistoryDirty();
    requestRender();
    requestOverlayRender();
    scheduleSessionPersist();
    updateColorTabSwatch();
  }

  function handlePaletteSliderInput({ source = 'unknown' } = {}) {
    const active = state.palette[state.activePaletteIndex];
    if (!active) return;
    const hueValue = clamp(Number(dom.controls.paletteHue?.value ?? paletteEditorState.hsv.h), 0, 360);
    const saturationValue = clamp(Number(dom.controls.paletteSaturation?.value ?? paletteEditorState.hsv.s * 100), 0, 100) / 100;
    const valueValue = clamp(Number(dom.controls.paletteValue?.value ?? paletteEditorState.hsv.v * 100), 0, 100) / 100;
    const alphaValue = clamp(Number(dom.controls.paletteAlphaSlider?.value ?? paletteEditorState.hsv.a), 0, 255);
    paletteEditorState.hsv.h = hueValue;
    paletteEditorState.hsv.s = saturationValue;
    paletteEditorState.hsv.v = valueValue;
    paletteEditorState.hsv.a = alphaValue;
    if (source === 'value') {
      drawPaletteWheel();
    }
    updatePaletteWheelCursor();
    updatePalettePreview();
    updatePaletteAlphaOutput();
    writePaletteColorFromHsv();
  }

  function updatePaletteAlphaOutput() {
    if (dom.controls.paletteAlphaValue) {
      dom.controls.paletteAlphaValue.textContent = String(Math.round(paletteEditorState.hsv.a));
    }
    const alphaSlider = dom.controls.paletteAlphaSlider;
    if (alphaSlider) {
      const opaqueColor = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, paletteEditorState.hsv.v);
      alphaSlider.style.background = `linear-gradient(90deg, rgba(${opaqueColor.r}, ${opaqueColor.g}, ${opaqueColor.b}, 0) 0%, rgba(${opaqueColor.r}, ${opaqueColor.g}, ${opaqueColor.b}, 1) 100%)`;
    }
  }

  function updatePalettePreview() {
    const preview = dom.controls.palettePreview;
    if (!preview) return;
    const rgba = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, paletteEditorState.hsv.v);
    const alpha = clamp(paletteEditorState.hsv.a, 0, 255) / 255;
    preview.style.setProperty('--palette-preview-color', `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${alpha.toFixed(3)})`);
    preview.classList.toggle('is-filled', paletteEditorState.hsv.a > 0);
    const saturationSlider = dom.controls.paletteSaturation;
    if (saturationSlider) {
      const startColor = hsvToRgba(paletteEditorState.hsv.h, 0, paletteEditorState.hsv.v);
      const endColor = hsvToRgba(paletteEditorState.hsv.h, 1, paletteEditorState.hsv.v);
      saturationSlider.style.background = `linear-gradient(90deg, ${rgbaToCss(startColor)} 0%, ${rgbaToCss(endColor)} 100%)`;
    }
    const valueSlider = dom.controls.paletteValue;
    if (valueSlider) {
      const lowColor = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, 0);
      const highColor = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, 1);
      valueSlider.style.background = `linear-gradient(90deg, ${rgbaToCss(lowColor)} 0%, ${rgbaToCss(highColor)} 100%)`;
    }
    updateColorTabSwatch();
  }

  function configurePaletteWheelCanvas() {
    const canvas = dom.controls.paletteWheel;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const size = Math.round(Math.max(rect.width, rect.height) * dpr);
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
    }
  }

  function drawPaletteWheel() {
    const canvas = dom.controls.paletteWheel;
    if (!canvas || !paletteWheelCtx) return;
    configurePaletteWheelCanvas();
    const size = canvas.width;
    if (!size) return;
    const value = clamp(paletteEditorState.hsv.v, 0, 1);
    const imageData = paletteWheelCtx.createImageData(size, size);
    const data = imageData.data;
    const radius = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x + 0.5 - radius;
        const dy = y + 0.5 - radius;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const index = (y * size + x) * 4;
        if (distance > radius) {
          data[index + 3] = 0;
          continue;
        }
        const saturation = clamp(distance / radius, 0, 1);
        let hue = Math.atan2(dy, dx) * (180 / Math.PI);
        if (hue < 0) hue += 360;
        const rgba = hsvToRgba(hue, saturation, value);
        data[index] = rgba.r;
        data[index + 1] = rgba.g;
        data[index + 2] = rgba.b;
        data[index + 3] = 255;
      }
    }
    paletteWheelCtx.putImageData(imageData, 0, 0);
  }

  function updatePaletteWheelCursor() {
    const cursor = dom.controls.paletteWheelCursor;
    const canvas = dom.controls.paletteWheel;
    if (!cursor || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const radius = rect.width / 2;
    const angle = (paletteEditorState.hsv.h * Math.PI) / 180;
    const distance = clamp(paletteEditorState.hsv.s, 0, 1) * radius;
    const x = radius + Math.cos(angle) * distance;
    const y = radius + Math.sin(angle) * distance;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
  }

  function writePaletteColorFromHsv() {
    const active = state.palette[state.activePaletteIndex];
    if (!active) return;
    beginHistory('paletteColor');
    const rgba = hsvToRgba(paletteEditorState.hsv.h, paletteEditorState.hsv.s, paletteEditorState.hsv.v);
    rgba.a = Math.round(paletteEditorState.hsv.a);
    Object.assign(active, rgba);
    applyPaletteChange();
    commitHistory();
    renderPalette();
  }

  function handlePaletteWheelPointerDown(event) {
    const wheel = dom.controls.paletteWheel;
    if (!wheel) return;
    event.preventDefault();
    if (paletteEditorState.wheelPointer.upHandler) {
      window.removeEventListener('pointerup', paletteEditorState.wheelPointer.upHandler);
      paletteEditorState.wheelPointer.upHandler = null;
    }
    paletteEditorState.wheelPointer.active = true;
    paletteEditorState.wheelPointer.pointerId = event.pointerId;
    wheel.setPointerCapture?.(event.pointerId);
    updatePaletteFromWheelEvent(event);
    window.addEventListener('pointermove', handlePaletteWheelPointerMove);
    const pointerUpHandler = evt => handlePaletteWheelPointerUp(evt);
    paletteEditorState.wheelPointer.upHandler = pointerUpHandler;
    window.addEventListener('pointerup', pointerUpHandler);
  }

  function handlePaletteWheelPointerMove(event) {
    if (!paletteEditorState.wheelPointer.active || event.pointerId !== paletteEditorState.wheelPointer.pointerId) {
      return;
    }
    updatePaletteFromWheelEvent(event);
  }

  function handlePaletteWheelPointerUp(event) {
    const wheel = dom.controls.paletteWheel;
    if (!paletteEditorState.wheelPointer.active || (paletteEditorState.wheelPointer.pointerId !== null && event.pointerId !== paletteEditorState.wheelPointer.pointerId)) {
      return;
    }
    if (wheel && wheel.hasPointerCapture?.(event.pointerId)) {
      wheel.releasePointerCapture(event.pointerId);
    }
    paletteEditorState.wheelPointer.active = false;
    paletteEditorState.wheelPointer.pointerId = null;
    if (paletteEditorState.wheelPointer.upHandler) {
      window.removeEventListener('pointerup', paletteEditorState.wheelPointer.upHandler);
      paletteEditorState.wheelPointer.upHandler = null;
    }
    window.removeEventListener('pointermove', handlePaletteWheelPointerMove);
  }

  function updatePaletteFromWheelEvent(event) {
    const wheel = dom.controls.paletteWheel;
    if (!wheel) return;
    const rect = wheel.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = wheel.width / rect.width;
    const x = (event.clientX - rect.left) * scale;
    const y = (event.clientY - rect.top) * scale;
    const radius = wheel.width / 2;
    const dx = x - radius;
    const dy = y - radius;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const maxRadius = radius;
    const clampedDistance = Math.min(distance, maxRadius);
    let hue = Math.atan2(dy, dx) * (180 / Math.PI);
    if (hue < 0) hue += 360;
    const saturation = clamp(clampedDistance / maxRadius, 0, 1);
    paletteEditorState.hsv.h = hue;
    paletteEditorState.hsv.s = saturation;
    if (dom.controls.paletteHue) {
      dom.controls.paletteHue.value = String(Math.round(hue));
    }
    if (dom.controls.paletteSaturation) {
      dom.controls.paletteSaturation.value = String(Math.round(saturation * 100));
    }
    updatePaletteWheelCursor();
    updatePalettePreview();
    updatePaletteAlphaOutput();
    writePaletteColorFromHsv();
  }

  function moveActiveLayer(offset) {
    const activeFrame = getActiveFrame();
    if (!activeFrame) return;
    const currentIndex = getActiveLayerIndex();
    if (currentIndex < 0) return;
    const targetIndex = clamp(currentIndex + offset, 0, activeFrame.layers.length - 1);
    if (targetIndex === currentIndex) return;
    beginHistory(offset < 0 ? 'moveLayerUp' : 'moveLayerDown');
    state.frames.forEach(frame => {
      if (currentIndex < 0 || currentIndex >= frame.layers.length) return;
      const [layer] = frame.layers.splice(currentIndex, 1);
      frame.layers.splice(targetIndex, 0, layer);
    });
    const updatedFrame = getActiveFrame();
    if (updatedFrame && updatedFrame.layers[targetIndex]) {
      state.activeLayer = updatedFrame.layers[targetIndex].id;
    }
    markHistoryDirty();
    scheduleSessionPersist();
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    commitHistory();
  }

  function moveActiveFrame(offset) {
    if (!Number.isFinite(offset) || offset === 0) return;
    const currentIndex = state.activeFrame;
    const frameCount = state.frames.length;
    if (!Number.isFinite(currentIndex) || currentIndex < 0 || currentIndex >= frameCount || frameCount <= 1) {
      return;
    }
    const targetIndex = clamp(currentIndex + offset, 0, frameCount - 1);
    if (targetIndex === currentIndex) {
      return;
    }
    beginHistory(offset < 0 ? 'moveFrameLeft' : 'moveFrameRight');
    const [frame] = state.frames.splice(currentIndex, 1);
    const destinationIndex = clamp(targetIndex, 0, state.frames.length);
    state.frames.splice(destinationIndex, 0, frame);
    state.activeFrame = destinationIndex;
    markHistoryDirty();
    scheduleSessionPersist();
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    commitHistory();
  }

  function setupFramesAndLayers() {
    dom.controls.addLayer?.addEventListener('click', () => {
      const activeFrame = getActiveFrame();
      if (!activeFrame) return;
      beginHistory('addLayer');
      const insertIndex = clamp(getActiveLayerIndex() + 1, 0, Number.MAX_SAFE_INTEGER);
      state.frames.forEach((frame, frameIndex) => {
        const targetIndex = Math.min(insertIndex, frame.layers.length);
        const name = `レイヤー ${frame.layers.length + 1}`;
        const newLayer = createLayer(name, state.width, state.height);
        frame.layers.splice(targetIndex, 0, newLayer);
        if (frameIndex === state.activeFrame) {
          state.activeLayer = newLayer.id;
        }
      });
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
    });

    dom.controls.removeLayer?.addEventListener('click', () => {
      if (!state.frames.every(frame => frame.layers.length > 1)) {
        return;
      }
      beginHistory('removeLayer');
      const removeIndex = clamp(getActiveLayerIndex(), 0, Number.MAX_SAFE_INTEGER);
      state.frames.forEach(frame => {
        const targetIndex = Math.min(removeIndex, frame.layers.length - 1);
        frame.layers.splice(targetIndex, 1);
      });
      const activeFrame = getActiveFrame();
      const nextIndex = clamp(removeIndex - 1, 0, activeFrame.layers.length - 1);
      state.activeLayer = activeFrame.layers[nextIndex].id;
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
    });

    dom.controls.moveLayerUp?.addEventListener('click', () => {
      moveActiveLayer(-1);
    });

    dom.controls.moveLayerDown?.addEventListener('click', () => {
      moveActiveLayer(1);
    });

    dom.controls.addFrame?.addEventListener('click', () => {
      const baseFrame = getActiveFrame();
      if (!baseFrame) return;
      beginHistory('addFrame');
      const newFrame = createFrame(`フレーム ${state.frames.length + 1}`, baseFrame.layers, state.width, state.height);
      state.frames.splice(state.activeFrame + 1, 0, newFrame);
      state.activeFrame += 1;
      state.activeLayer = newFrame.layers[newFrame.layers.length - 1].id;
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
    });

    dom.controls.removeFrame?.addEventListener('click', () => {
      if (state.frames.length <= 1) return;
      beginHistory('removeFrame');
      state.frames.splice(state.activeFrame, 1);
      state.activeFrame = clamp(state.activeFrame, 0, state.frames.length - 1);
      const frame = getActiveFrame();
      state.activeLayer = frame.layers[frame.layers.length - 1].id;
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
    });

    dom.controls.moveFrameUp?.addEventListener('click', () => {
      moveActiveFrame(-1);
    });

    dom.controls.moveFrameDown?.addEventListener('click', () => {
      moveActiveFrame(1);
    });

    dom.controls.playAnimation?.addEventListener('click', () => {
      if (!state.playback.isPlaying) {
        startPlayback();
      }
    });
    dom.controls.stopAnimation?.addEventListener('click', () => {
      stopPlayback();
    });
    dom.controls.rewindAnimation?.addEventListener('click', () => {
      stopPlayback();
      setActiveFrameIndex(0, { wrap: false });
    });
    dom.controls.forwardAnimation?.addEventListener('click', () => {
      stopPlayback();
      stepActiveFrame(1, { wrap: true });
    });
    dom.controls.animationFps?.addEventListener('change', () => {
      const frame = getActiveFrame();
      const fps = normalizeFpsValue(dom.controls.animationFps.value);
      const nextDuration = getDurationFromFps(fps);
      if (frame) {
        frame.duration = nextDuration;
        markHistoryDirty();
      }
      updateAnimationFpsDisplay(fps, nextDuration);
    });

    dom.controls.applyFpsAll?.addEventListener('click', () => {
      const fpsInput = dom.controls.animationFps;
      const fpsValue = fpsInput ? Number(fpsInput.value) : 12;
      applyFpsToAllFrames(fpsValue);
    });

    syncAnimationFpsDisplayFromState();
    updatePlaybackButtons();

    renderFrameList();
    renderLayerList();
    applyTimelineToolbarFrames();
  }

  function startPlayback() {
    if (state.playback.isPlaying) return;
    if (!Array.isArray(state.frames) || !state.frames.length) {
      return;
    }
    state.playback.isPlaying = true;
    lastFrameTime = performance.now();
    updatePlaybackButtons();
    playbackHandle = requestAnimationFrame(stepPlayback);
  }

  function stopPlayback() {
    state.playback.isPlaying = false;
    if (playbackHandle != null) {
      cancelAnimationFrame(playbackHandle);
      playbackHandle = null;
    }
    updatePlaybackButtons();
  }

  function stepPlayback(timestamp) {
    if (!state.playback.isPlaying) return;
    const frame = getActiveFrame();
    const duration = frame && Number.isFinite(frame.duration) && frame.duration > 0 ? frame.duration : 1000 / 12;
    const elapsed = timestamp - lastFrameTime;
    if (elapsed >= duration) {
      stepActiveFrame(1, { wrap: true, persist: false });
      lastFrameTime = timestamp;
    }
    playbackHandle = requestAnimationFrame(stepPlayback);
  }

  function updatePlaybackButtons() {
    const isPlaying = state.playback.isPlaying;
    if (dom.controls.playAnimation) {
      dom.controls.playAnimation.classList.toggle('is-active', isPlaying);
      dom.controls.playAnimation.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
    }
    if (dom.controls.stopAnimation) {
      dom.controls.stopAnimation.disabled = !isPlaying;
    }
    applyTimelineToolbarFrames();
  }

  function applyTimelineToolbarFrames() {
    const configs = [
      { element: dom.controls.addLayer, variant: 'add' },
      { element: dom.controls.removeLayer, variant: 'remove' },
      { element: dom.controls.addFrame, variant: 'add' },
      { element: dom.controls.removeFrame, variant: 'remove' },
      { element: dom.controls.rewindAnimation, variant: 'playback' },
      { element: dom.controls.playAnimation, variant: state.playback.isPlaying ? 'playbackActive' : 'playback' },
      { element: dom.controls.stopAnimation, variant: state.playback.isPlaying ? 'stop' : 'stop' },
      { element: dom.controls.forwardAnimation, variant: 'playback' },
    ];
    configs.forEach(({ element, variant }) => {
      if (!element) return;
      const colors = TIMELINE_BUTTON_VARIANTS[variant] || TIMELINE_BUTTON_VARIANTS.playback;
      applyPixelFrameBackground(element, colors.fill, { borderColor: colors.border });
    });
  }

  function getTimelineBodyVariant({ isEmpty, isActiveLayerRow, isActiveFrameColumn, isActiveCell, isHidden }) {
    if (isEmpty) {
      return 'bodyEmpty';
    }
    if (isActiveCell) {
      return 'bodyActiveCell';
    }
    if (isHidden) {
      return 'bodyHidden';
    }
    if (isActiveLayerRow && isActiveFrameColumn) {
      return 'bodyActiveCell';
    }
    if (isActiveLayerRow) {
      return 'bodyActiveRow';
    }
    if (isActiveFrameColumn) {
      return 'bodyActiveColumn';
    }
    return 'body';
  }

  function applyTimelineCellFrame(element, variant) {
    if (!element) return;
    element.classList.add('pixel-frame');
    const colors = TIMELINE_CELL_VARIANTS[variant] || TIMELINE_CELL_VARIANTS.body;
    applyPixelFrameBackground(element, colors.fill, { borderColor: colors.border });
  }

  function applyTimelineSlotFrame(element, variant) {
    if (!element) return;
    element.classList.add('pixel-frame');
    const colors = TIMELINE_SLOT_VARIANTS[variant] || TIMELINE_SLOT_VARIANTS.default;
    applyPixelFrameBackground(element, colors.fill, { borderColor: colors.border });
  }

  function getLayerVisibilityForRow(rowIndex) {
    for (let frameIndex = 0; frameIndex < state.frames.length; frameIndex += 1) {
      const frame = state.frames[frameIndex];
      const layerIndex = frame.layers.length - 1 - rowIndex;
      if (layerIndex >= 0 && layerIndex < frame.layers.length) {
        return Boolean(frame.layers[layerIndex]?.visible);
      }
    }
    return true;
  }

  function setLayerVisibilityForRow(rowIndex, visible) {
    let needsChange = false;
    state.frames.forEach(frame => {
      const layerIndex = frame.layers.length - 1 - rowIndex;
      if (layerIndex >= 0 && layerIndex < frame.layers.length) {
        const targetLayer = frame.layers[layerIndex];
        if (targetLayer && targetLayer.visible !== visible) {
          needsChange = true;
        }
      }
    });
    if (!needsChange) {
      return;
    }
    beginHistory('layerVisibilityRow');
    state.frames.forEach(frame => {
      const layerIndex = frame.layers.length - 1 - rowIndex;
      if (layerIndex >= 0 && layerIndex < frame.layers.length) {
        const targetLayer = frame.layers[layerIndex];
        if (targetLayer && targetLayer.visible !== visible) {
          targetLayer.visible = visible;
        }
      }
    });
    markHistoryDirty();
    scheduleSessionPersist();
    renderTimelineMatrix();
    requestRender();
    requestOverlayRender();
    commitHistory();
  }

  function toggleLayerVisibilityForRow(rowIndex) {
    const current = getLayerVisibilityForRow(rowIndex);
    setLayerVisibilityForRow(rowIndex, !current);
  }

  function renderTimelineMatrix() {
    const container = dom.controls.timelineMatrix;
    if (!container) return;

    const frames = state.frames;
    const frameCount = frames.length;
    if (!frameCount) {
      container.innerHTML = '';
      return;
    }

    const activeFrameIndex = clamp(state.activeFrame, 0, frameCount - 1);
    state.activeFrame = activeFrameIndex;

    const reversedLayersByFrame = frames.map(frame => frame.layers.slice().reverse());
    const activeLayers = reversedLayersByFrame[activeFrameIndex];
    const layerNames = activeLayers.map((layer, idx) => {
      const parts = String(layer.name).match(/(\d+)/);
      if (parts && parts[1]) {
        return parts[1];
      }
      return String(activeLayers.length - idx);
    });
    const maxLayerCount = reversedLayersByFrame.reduce((max, layers) => Math.max(max, layers.length), 0);
    const layerCount = Math.max(maxLayerCount, 1);

    let activeLayerRow = activeLayers.findIndex(layer => layer.id === state.activeLayer);
    if (activeLayerRow === -1 && activeLayers.length) {
      state.activeLayer = activeLayers[0].id;
      activeLayerRow = 0;
    }

    container.innerHTML = '';
    const cellSizePx = `${TIMELINE_CELL_SIZE}px`;
    container.style.setProperty('--timeline-cell-size', cellSizePx);
    const columnCount = frameCount + 1;
    const rowCount = layerCount + 1;
    container.style.gridTemplateColumns = `repeat(${columnCount}, ${cellSizePx})`;
    container.style.gridTemplateRows = `repeat(${rowCount}, ${cellSizePx})`;

    const fragment = document.createDocumentFragment();

    const corner = document.createElement('div');
    corner.className = 'timeline-cell timeline-cell--corner';
    corner.classList.add('pixel-frame');
    corner.style.gridColumn = '1';
    corner.style.gridRow = '1';
    corner.setAttribute('role', 'columnheader');
    corner.setAttribute('aria-label', 'タイムライン');
    applyTimelineCellFrame(corner, 'corner');
    fragment.appendChild(corner);

    frames.forEach((frame, frameIndex) => {
      const col = frameIndex + 2;
      const header = document.createElement('div');
      header.className = 'timeline-cell timeline-cell--frame-header';
      header.classList.add('pixel-frame');
      header.style.gridColumn = String(col);
      header.style.gridRow = '1';
      header.setAttribute('role', 'columnheader');
      if (frameIndex === activeFrameIndex) {
        header.classList.add('is-active-frame');
      }
      const headerVariant = frameIndex === activeFrameIndex ? 'frameHeaderActive' : 'frameHeader';
      applyTimelineCellFrame(header, headerVariant);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'timeline-frame-button pixel-frame';
      const frameNumberMatch = String(frame.name).match(/(\d+)/);
      button.textContent = frameNumberMatch && frameNumberMatch[1] ? frameNumberMatch[1] : String(frameIndex + 1);
      button.addEventListener('click', () => {
        state.activeFrame = frameIndex;
        const candidateLayers = reversedLayersByFrame[frameIndex];
        const nextLayer = candidateLayers[activeLayerRow] || candidateLayers[candidateLayers.length - 1] || candidateLayers[0];
        if (nextLayer) {
          state.activeLayer = nextLayer.id;
        }
        scheduleSessionPersist();
        renderTimelineMatrix();
        requestRender();
        requestOverlayRender();
      });

      header.appendChild(button);
      applyTimelineSlotFrame(button, frameIndex === activeFrameIndex ? 'active' : 'default');
      fragment.appendChild(header);
    });

    for (let rowIndex = 0; rowIndex < layerCount; rowIndex += 1) {
      const row = rowIndex + 2;
      const layer = activeLayers[rowIndex];
      const labelName = layerNames[rowIndex] || String(layerCount - rowIndex);
      const rowHeader = document.createElement('div');
      rowHeader.className = 'timeline-cell timeline-cell--layer';
      rowHeader.classList.add('pixel-frame');
      rowHeader.style.gridColumn = '1';
      rowHeader.style.gridRow = String(row);
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.dataset.layerRowIndex = String(rowIndex);
      const rowVisibility = getLayerVisibilityForRow(rowIndex);

      if (rowIndex === activeLayerRow) {
        rowHeader.classList.add('is-active-layer');
      }

      if (layer) {
        rowHeader.dataset.layerId = layer.id;
        const visibilityToggle = document.createElement('button');
        visibilityToggle.type = 'button';
        visibilityToggle.className = 'timeline-visibility';
        visibilityToggle.dataset.layerRowIndex = String(rowIndex);
        visibilityToggle.setAttribute('aria-pressed', String(rowVisibility));
        visibilityToggle.setAttribute('aria-label', rowVisibility ? 'レイヤーを非表示' : 'レイヤーを表示');
        visibilityToggle.textContent = rowVisibility ? '●' : '○';
        visibilityToggle.addEventListener('click', event => {
          event.stopPropagation();
          toggleLayerVisibilityForRow(rowIndex);
        });

        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'timeline-layer-tag';
        tag.textContent = labelName;
        tag.addEventListener('click', () => {
          state.activeLayer = layer.id;
          scheduleSessionPersist();
          renderTimelineMatrix();
          requestOverlayRender();
        });
        rowHeader.appendChild(visibilityToggle);
        rowHeader.appendChild(tag);
      } else {
        rowHeader.classList.add('is-placeholder');
        rowHeader.textContent = labelName;
        rowHeader.setAttribute('aria-hidden', 'true');
      }

      const layerVariant = rowHeader.classList.contains('is-placeholder')
        ? 'layerPlaceholder'
        : rowIndex === activeLayerRow
          ? (rowVisibility ? 'layerActive' : 'layerActiveHidden')
          : (rowVisibility ? 'layer' : 'layerHidden');
      applyTimelineCellFrame(rowHeader, layerVariant);

      fragment.appendChild(rowHeader);

      frames.forEach((frame, frameIndex) => {
        const col = frameIndex + 2;
        const cell = document.createElement('div');
        cell.className = 'timeline-cell timeline-cell--body';
        cell.classList.add('pixel-frame');
        cell.style.gridColumn = String(col);
        cell.style.gridRow = String(row);
        cell.setAttribute('role', 'gridcell');

        if (rowIndex === activeLayerRow) {
          cell.classList.add('is-active-layer-row');
        }
        if (frameIndex === activeFrameIndex) {
          cell.classList.add('is-active-frame-column');
        }

        const frameLayers = reversedLayersByFrame[frameIndex];
        const targetLayer = frameLayers[rowIndex];
        const isActiveLayerRow = rowIndex === activeLayerRow;
        const isActiveFrameColumn = frameIndex === activeFrameIndex;
        let isActiveCell = false;
        let isEmptyCell = false;
        let isHiddenCell = false;

        if (!targetLayer) {
          isEmptyCell = true;
          cell.classList.add('is-empty');
          const placeholder = document.createElement('span');
          placeholder.className = 'timeline-slot is-disabled';
          placeholder.textContent = '—';
          placeholder.setAttribute('aria-hidden', 'true');
          applyTimelineSlotFrame(placeholder, 'disabled');
          cell.appendChild(placeholder);
        } else {
          const slot = document.createElement('button');
          slot.type = 'button';
          slot.className = 'timeline-slot';
          slot.setAttribute('aria-label', `${frame.name} / ${targetLayer.name}`);
          if (!targetLayer.visible) {
            slot.classList.add('is-hidden');
            isHiddenCell = true;
          }
          if (frameIndex === activeFrameIndex && targetLayer.id === state.activeLayer) {
            slot.classList.add('is-active');
            cell.classList.add('is-active-cell');
            isActiveCell = true;
          }
          slot.addEventListener('click', () => {
            state.activeFrame = frameIndex;
            state.activeLayer = targetLayer.id;
            scheduleSessionPersist();
            renderTimelineMatrix();
            requestRender();
            requestOverlayRender();
          });

          const marker = document.createElement('span');
          marker.className = 'timeline-slot__marker';
          marker.setAttribute('aria-hidden', 'true');
          slot.appendChild(marker);

          let slotVariant = 'default';
          if (!targetLayer.visible) {
            slotVariant = 'hidden';
          }
          if (slot.classList.contains('is-active')) {
            slotVariant = 'active';
          }
          applyTimelineSlotFrame(slot, slotVariant);
          cell.appendChild(slot);
        }

        const bodyVariant = getTimelineBodyVariant({
          isEmpty: isEmptyCell,
          isActiveLayerRow,
          isActiveFrameColumn,
          isActiveCell,
          isHidden: isHiddenCell,
        });
        applyTimelineCellFrame(cell, bodyVariant);
        fragment.appendChild(cell);
      });
    }

    container.appendChild(fragment);

    syncAnimationFpsDisplayFromState();
  }

  function renderFrameList() {
    renderTimelineMatrix();
  }

  function renderLayerList() {
    renderTimelineMatrix();
  }

  function setupCanvas() {
    resizeCanvases();
    ensureCanvasWheelListener();
    setupFloatingDrawButton();
    const gestureSurface = dom.stage || dom.canvasViewport;
    if (dom.canvasViewport) {
      dom.canvasViewport.addEventListener('pointerenter', handleViewportPointerEnter);
      dom.canvasViewport.addEventListener('pointerleave', handleViewportPointerLeave);
    }
    if (gestureSurface) {
      gestureSurface.addEventListener('pointerdown', handleViewportPointerDown, { passive: false });
      gestureSurface.addEventListener('pointermove', handleViewportPointerMove, { passive: false });
      gestureSurface.addEventListener('pointerup', handleViewportPointerUp, { passive: false });
      gestureSurface.addEventListener('pointercancel', handleViewportPointerCancel, { passive: false });
    }
    refreshViewportCursorStyle();
  }

  function ensureCanvasWheelListener() {
    if (canvasWheelListenerBound) {
      return;
    }
    const stack = dom.canvases.stack;
    if (!stack) {
      return;
    }
    stack.addEventListener('wheel', handleCanvasWheel, { passive: false });
    canvasWheelListenerBound = true;
  }

  function getVirtualCursorCellPosition(cursor = virtualCursor) {
    if (!cursor) {
      return null;
    }
    const width = Math.max(1, Number(state.width) || 0);
    const height = Math.max(1, Number(state.height) || 0);
    if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
      return null;
    }
    const x = clamp(Math.floor(cursor.x), 0, width - 1);
    const y = clamp(Math.floor(cursor.y), 0, height - 1);
    return { x, y };
  }

  function updateVirtualCursorPosition(nextX, nextY, { requestRender = true } = {}) {
    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return false;
    }
    if (virtualCursor && virtualCursor.x === nextX && virtualCursor.y === nextY) {
      return false;
    }
    virtualCursor = { x: nextX, y: nextY };
    if (state.showVirtualCursor && requestRender) {
      requestOverlayRender();
    }
    handleVirtualCursorPositionChanged(virtualCursor);
    return true;
  }

  function setVirtualCursor(position) {
    if (!position) {
      return;
    }
    const nextX = Number(position.x);
    const nextY = Number(position.y);
    updateVirtualCursorPosition(nextX, nextY);
  }

  function handleVirtualCursorPositionChanged(next) {
    if (!virtualCursorDrawState.active) {
      return;
    }
    if (!state.showVirtualCursor) {
      return;
    }
    if (!next) {
      return;
    }
    const currentCell = getVirtualCursorCellPosition(next);
    if (!currentCell) {
      if (!pointerState.active && hoverPixel) {
        hoverPixel = null;
        requestOverlayRender();
      }
      return;
    }

    if (!pointerState.active) {
      if (!hoverPixel || hoverPixel.x !== currentCell.x || hoverPixel.y !== currentCell.y) {
        hoverPixel = { ...currentCell };
        requestOverlayRender();
      }
    }
    if (
      floatingDrawButtonState.pointerId !== null
      && floatingDrawButtonState.drawSessionStarted
      && !floatingDrawButtonState.dragging
      && floatingDrawButtonState.startCursorCell
      && (
        floatingDrawButtonState.startCursorCell.x !== currentCell.x
        || floatingDrawButtonState.startCursorCell.y !== currentCell.y
      )
    ) {
      floatingDrawButtonState.drawMoved = true;
    }

    const tool = virtualCursorDrawState.tool;
    if (!virtualCursorDrawState.active || !tool) {
      return;
    }

    if (BRUSH_TOOLS.has(tool)) {
      const last = virtualCursorDrawState.lastPosition;
      if (!last) {
        applyBrushStroke(currentCell.x, currentCell.y, currentCell.x, currentCell.y);
        virtualCursorDrawState.lastPosition = { ...currentCell };
        return;
      }
      if (last.x === currentCell.x && last.y === currentCell.y) {
        return;
      }
      applyBrushStroke(last.x, last.y, currentCell.x, currentCell.y);
      virtualCursorDrawState.lastPosition = { ...currentCell };
      return;
    }

    if (VIRTUAL_CURSOR_SHAPE_TOOLS.has(tool)) {
      const previous = virtualCursorDrawState.currentPosition;
      if (previous && previous.x === currentCell.x && previous.y === currentCell.y) {
        return;
      }
      virtualCursorDrawState.currentPosition = { ...currentCell };
      pointerState.current = { ...currentCell };
      pointerState.last = { ...currentCell };
      const lastPoint = pointerState.path[pointerState.path.length - 1];
      if (!lastPoint || lastPoint.x !== currentCell.x || lastPoint.y !== currentCell.y) {
        pointerState.path.push({ ...currentCell });
      }
      pointerState.preview = {
        start: { ...(virtualCursorDrawState.startPosition || currentCell) },
        end: { ...pointerState.current },
        points: pointerState.path.slice(),
      };
      virtualCursorDrawState.path = pointerState.path.slice();
      requestOverlayRender();
      return;
    }

    if (VIRTUAL_CURSOR_SELECTION_TOOLS.has(tool)) {
      const previous = virtualCursorDrawState.currentPosition;
      if (previous && previous.x === currentCell.x && previous.y === currentCell.y) {
        return;
      }
      virtualCursorDrawState.currentPosition = { ...currentCell };
      pointerState.current = { ...currentCell };
      pointerState.last = { ...currentCell };
      const lastPathPoint = pointerState.path[pointerState.path.length - 1];
      if (!lastPathPoint || lastPathPoint.x !== currentCell.x || lastPathPoint.y !== currentCell.y) {
        pointerState.path.push({ ...currentCell });
      }
      if (!pointerState.selectionPreview) {
        pointerState.selectionPreview = {
          start: { ...(virtualCursorDrawState.startPosition || currentCell) },
          end: { ...currentCell },
          points: [{ ...(virtualCursorDrawState.startPosition || currentCell) }],
        };
      }
      if (tool === 'selectLasso') {
        const selectionPoints = pointerState.selectionPreview.points;
        const lastSelectionPoint = selectionPoints[selectionPoints.length - 1];
        if (!lastSelectionPoint || lastSelectionPoint.x !== currentCell.x || lastSelectionPoint.y !== currentCell.y) {
          selectionPoints.push({ ...currentCell });
        }
        pointerState.selectionPreview.end = { ...currentCell };
        virtualCursorDrawState.points = selectionPoints.map(point => ({ ...point }));
      } else {
        pointerState.selectionPreview.end = { ...currentCell };
        virtualCursorDrawState.points = [
          { ...(pointerState.selectionPreview.start || virtualCursorDrawState.startPosition || currentCell) },
          { ...currentCell },
        ];
      }
      virtualCursorDrawState.path = pointerState.path.slice();
      requestOverlayRender();
      return;
    }

    if (tool === 'curve') {
      virtualCursorDrawState.currentPosition = { ...currentCell };
      pointerState.current = { ...currentCell };
      pointerState.last = { ...currentCell };
      const stage = virtualCursorDrawState.curveStage || (curveBuilder ? curveBuilder.stage : null);
      if (!curveBuilder || !stage) {
        return;
      }
      if (stage === 'line') {
        const lastPoint = pointerState.path[pointerState.path.length - 1];
        if (!lastPoint || lastPoint.x !== currentCell.x || lastPoint.y !== currentCell.y) {
          pointerState.path.push({ ...currentCell });
        }
        curveBuilder.end = { ...currentCell };
        pointerState.preview = {
          start: { ...(curveBuilder.start || virtualCursorDrawState.startPosition || currentCell) },
          end: { ...currentCell },
        };
      } else if (stage === 'control1') {
        curveBuilder.control1 = { ...currentCell };
      } else if (stage === 'control2') {
        curveBuilder.control2 = { ...currentCell };
      }
      virtualCursorDrawState.curveStage = stage;
      requestOverlayRender();
    }
  }

  function startVirtualCursorDrawSession() {
    if (virtualCursorDrawState.active) {
      return false;
    }
    if (!state.showVirtualCursor || !virtualCursor) {
      return false;
    }
    const activeTool = state.tool;
    if (!VIRTUAL_CURSOR_SUPPORTED_TOOLS.has(activeTool)) {
      return false;
    }
    const cell = getVirtualCursorCellPosition();
    if (!cell) {
      return false;
    }
    const layer = getActiveLayer();
    const requiresLayer = HISTORY_DRAW_TOOLS.has(activeTool);
    if (requiresLayer && !layer) {
      return false;
    }

    resetPointerStateForVirtualCursor();
    hoverPixel = null;

    virtualCursorDrawState.active = true;
    virtualCursorDrawState.tool = activeTool;
    virtualCursorDrawState.historyStarted = false;
    virtualCursorDrawState.lastPosition = BRUSH_TOOLS.has(activeTool) ? { ...cell } : null;
    virtualCursorDrawState.startPosition = { ...cell };
    virtualCursorDrawState.currentPosition = { ...cell };
    virtualCursorDrawState.path = [{ ...cell }];
    virtualCursorDrawState.points = [{ ...cell }];
    virtualCursorDrawState.selectionClearedOnStart = false;
    virtualCursorDrawState.curveStage = null;

    pointerState.tool = activeTool;
    pointerState.start = { ...cell };
    pointerState.current = { ...cell };
    pointerState.last = { ...cell };
    pointerState.path = [{ ...cell }];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.curveHandle = null;

    if (HISTORY_DRAW_TOOLS.has(activeTool)) {
      beginHistory(activeTool);
      virtualCursorDrawState.historyStarted = true;
    }
    if (BRUSH_TOOLS.has(activeTool)) {
      applyBrushStroke(cell.x, cell.y, cell.x, cell.y);
      requestOverlayRender();
      return true;
    }

    if (VIRTUAL_CURSOR_SHAPE_TOOLS.has(activeTool)) {
      pointerState.preview = {
        start: { ...virtualCursorDrawState.startPosition },
        end: { ...virtualCursorDrawState.currentPosition },
        points: pointerState.path.slice(),
      };
      requestOverlayRender();
      return true;
    }

    if (VIRTUAL_CURSOR_SELECTION_TOOLS.has(activeTool)) {
      if (state.selectionMask) {
        clearSelection();
        virtualCursorDrawState.selectionClearedOnStart = true;
        pointerState.selectionClearedOnDown = true;
      }
      const preview = {
        start: { ...virtualCursorDrawState.startPosition },
        end: { ...virtualCursorDrawState.currentPosition },
        points: [{ ...virtualCursorDrawState.startPosition }],
      };
      pointerState.selectionPreview = preview;
      pointerState.tool = activeTool;
      virtualCursorDrawState.points = preview.points.map(point => ({ ...point }));
      requestOverlayRender();
      return true;
    }

    if (activeTool === 'curve') {
      if (!curveBuilder) {
        beginHistory('curve');
        curveBuilder = {
          stage: 'line',
          start: { ...cell },
          end: { ...cell },
          control1: null,
          control2: null,
          awaitingEndPoint: true,
        };
      }
      virtualCursorDrawState.curveStage = curveBuilder.stage;
      pointerState.tool = 'curve';
      if (curveBuilder.stage === 'line') {
        if (!curveBuilder.start) {
          curveBuilder.start = { ...cell };
        }
        curveBuilder.end = { ...cell };
        pointerState.start = { ...curveBuilder.start };
        pointerState.current = { ...curveBuilder.end };
        pointerState.last = { ...curveBuilder.end };
        pointerState.path = [{ ...curveBuilder.start }, { ...curveBuilder.end }];
        pointerState.preview = {
          start: { ...curveBuilder.start },
          end: { ...curveBuilder.end },
        };
      } else if (curveBuilder.stage === 'control1') {
        pointerState.curveHandle = 'control1';
        pointerState.start = { ...cell };
        pointerState.current = { ...cell };
        pointerState.last = { ...cell };
        pointerState.path = [{ ...cell }];
        curveBuilder.control1 = { ...cell };
        pointerState.preview = null;
      } else if (curveBuilder.stage === 'control2') {
        pointerState.curveHandle = 'control2';
        pointerState.start = { ...cell };
        pointerState.current = { ...cell };
        pointerState.last = { ...cell };
        pointerState.path = [{ ...cell }];
        curveBuilder.control2 = { ...cell };
        pointerState.preview = null;
      }
      requestOverlayRender();
      return true;
    }

    virtualCursorDrawState.active = false;
    virtualCursorDrawState.historyStarted = false;
    virtualCursorDrawState.lastPosition = null;
    virtualCursorDrawState.tool = null;
    virtualCursorDrawState.startPosition = null;
    virtualCursorDrawState.currentPosition = null;
    virtualCursorDrawState.path = [];
    virtualCursorDrawState.points = [];
    virtualCursorDrawState.selectionClearedOnStart = false;
    virtualCursorDrawState.curveStage = null;
    return false;
  }

  function finishVirtualCursorDrawSession({ commit = true } = {}) {
    if (!virtualCursorDrawState.active) {
      return;
    }
    const tool = virtualCursorDrawState.tool;
    let actionPerformed = false;
    let shouldCommitHistory = false;
    let shouldRollbackHistory = false;

    if (tool === 'curve') {
      if (!curveBuilder) {
        if (!commit && history.pending && history.pending.label === 'curve') {
          rollbackPendingHistory({ reRender: false });
        }
      } else if (!commit) {
        if (history.pending && history.pending.label === 'curve') {
          rollbackPendingHistory({ reRender: false });
        }
        resetCurveBuilder();
      } else {
        const stage = virtualCursorDrawState.curveStage || curveBuilder.stage;
        const currentPoint = virtualCursorDrawState.currentPosition || pointerState.current || curveBuilder.end;
        if (stage === 'line') {
          if (currentPoint) {
            curveBuilder.end = { ...currentPoint };
          }
          const start = curveBuilder.start;
          const moved = start && currentPoint && (start.x !== currentPoint.x || start.y !== currentPoint.y);
          pointerState.preview = null;
          pointerState.path = [];
          pointerState.curveHandle = null;
          pointerState.tool = null;
          if (!moved) {
            curveBuilder.awaitingEndPoint = true;
          } else {
            curveBuilder.awaitingEndPoint = false;
            if (!curveBuilder.control1) {
              curveBuilder.control1 = { ...curveBuilder.start };
            }
            if (!curveBuilder.control2) {
              curveBuilder.control2 = { ...curveBuilder.end };
            }
            curveBuilder.stage = 'control1';
          }
          requestOverlayRender();
        } else if (stage === 'control1') {
          if (currentPoint) {
            curveBuilder.control1 = { ...currentPoint };
          }
          curveBuilder.stage = 'control2';
          pointerState.curveHandle = null;
          pointerState.path = [];
          pointerState.tool = null;
          requestOverlayRender();
          scheduleSessionPersist();
        } else if (stage === 'control2') {
          if (currentPoint) {
            curveBuilder.control2 = { ...currentPoint };
          }
          pointerState.curveHandle = null;
          pointerState.path = [];
          pointerState.tool = null;
          finalizeCurve();
        }
      }
    } else if (BRUSH_TOOLS.has(tool)) {
      if (virtualCursorDrawState.historyStarted) {
        if (commit) {
          shouldCommitHistory = true;
        } else {
          shouldRollbackHistory = true;
        }
      }
    } else if (VIRTUAL_CURSOR_SHAPE_TOOLS.has(tool)) {
      const start = virtualCursorDrawState.startPosition;
      const end = virtualCursorDrawState.currentPosition;
      if (commit && start && end) {
        switch (tool) {
          case 'line':
            drawLine(start, end);
            actionPerformed = true;
            break;
          case 'rect':
            drawRectangle(start, end, false);
            actionPerformed = true;
            break;
          case 'rectFill':
            drawRectangle(start, end, true);
            actionPerformed = true;
            break;
          case 'ellipse':
            drawEllipse(start, end, false);
            actionPerformed = true;
            break;
          case 'ellipseFill':
            drawEllipse(start, end, true);
            actionPerformed = true;
            break;
          default:
            break;
        }
        if (virtualCursorDrawState.historyStarted) {
          if (actionPerformed) {
            shouldCommitHistory = true;
          } else {
            shouldRollbackHistory = true;
          }
        }
      } else if (virtualCursorDrawState.historyStarted) {
        shouldRollbackHistory = true;
      }
    } else if (VIRTUAL_CURSOR_SELECTION_TOOLS.has(tool)) {
      if (commit) {
        const pathLength = virtualCursorDrawState.path.length;
        if (tool === 'selectRect') {
          const start = virtualCursorDrawState.startPosition;
          const end = virtualCursorDrawState.currentPosition;
          if (start && end && !(virtualCursorDrawState.selectionClearedOnStart && pathLength <= 1)) {
            createSelectionRect(start, end);
            actionPerformed = true;
          }
        } else if (tool === 'selectLasso') {
          const points = pointerState.selectionPreview?.points || virtualCursorDrawState.points || [];
          const effectivePoints = points.map(point => ({ ...point })).filter(Boolean);
          if (effectivePoints.length > 1 && !(virtualCursorDrawState.selectionClearedOnStart && effectivePoints.length <= 1)) {
            createSelectionLasso(effectivePoints);
            actionPerformed = true;
          }
        }
        if (actionPerformed) {
          scheduleSessionPersist();
        }
      }
    } else if (virtualCursorDrawState.historyStarted) {
      if (commit) {
        shouldCommitHistory = true;
      } else {
        shouldRollbackHistory = true;
      }
    }

    if (shouldCommitHistory) {
      commitHistory();
    } else if (shouldRollbackHistory) {
      rollbackPendingHistory({ reRender: false });
    }

    if (commit && virtualCursorDrawState.currentPosition) {
      hoverPixel = { ...virtualCursorDrawState.currentPosition };
    }

    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.path = [];
    pointerState.selectionClearedOnDown = false;
    if (tool !== 'curve') {
      pointerState.tool = state.tool;
      pointerState.curveHandle = null;
    }

    virtualCursorDrawState.active = false;
    virtualCursorDrawState.historyStarted = false;
    virtualCursorDrawState.lastPosition = null;
    virtualCursorDrawState.tool = null;
    virtualCursorDrawState.startPosition = null;
    virtualCursorDrawState.currentPosition = null;
    virtualCursorDrawState.path = [];
    virtualCursorDrawState.points = [];
    virtualCursorDrawState.selectionClearedOnStart = false;
    virtualCursorDrawState.curveStage = null;
    requestOverlayRender();
  }

  function cancelVirtualCursorDrawSession() {
    finishVirtualCursorDrawSession({ commit: false });
  }

  function getClampedPointerPosition(event) {
    const drawing = dom.canvases.drawing;
    if (!drawing) {
      return null;
    }
    const rect = drawing.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    if (!Number.isFinite(relativeX) || !Number.isFinite(relativeY)) {
      return null;
    }
    const x = relativeX * state.width;
    const y = relativeY * state.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  function updateVirtualCursorFromEvent(event) {
    const position = getClampedPointerPosition(event);
    if (position) {
      setVirtualCursor(position);
    }
  }

  function normalizeFloatingDrawButtonScale(value) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) {
      return DEFAULT_FLOATING_DRAW_BUTTON_SCALE;
    }
    let closest = FLOATING_DRAW_BUTTON_SCALE_VALUES[0] || DEFAULT_FLOATING_DRAW_BUTTON_SCALE;
    let minDiff = Number.POSITIVE_INFINITY;
    for (const candidate of FLOATING_DRAW_BUTTON_SCALE_VALUES) {
      const diff = Math.abs(candidate - numeric);
      if (diff < minDiff) {
        minDiff = diff;
        closest = candidate;
      }
    }
    return closest;
  }

  function formatFloatingDrawButtonScale(value) {
    const normalized = normalizeFloatingDrawButtonScale(value);
    return Number.isInteger(normalized) ? String(normalized) : normalized.toFixed(1);
  }

  function updateFloatingDrawButtonScaleControl() {
    const slider = dom.controls.virtualCursorButtonScale;
    const output = dom.controls.virtualCursorButtonScaleValue;
    const scale = state.virtualCursorButtonScale || DEFAULT_FLOATING_DRAW_BUTTON_SCALE;
    if (slider) {
      slider.value = String(scale);
    }
    if (output) {
      output.textContent = `${formatFloatingDrawButtonScale(scale)}×`;
    }
  }

  function setVirtualCursorButtonScale(nextScale, options = {}) {
    const {
      persist = true,
      clampPosition = true,
      updateControl = true,
    } = options || {};
    const normalized = normalizeFloatingDrawButtonScale(nextScale);
    state.virtualCursorButtonScale = normalized;
    floatingDrawButtonState.scale = normalized;
    const button = dom.floatingDrawButton;
    if (button) {
      button.style.setProperty('--floating-draw-button-scale', String(normalized));
    }
    if (
      clampPosition &&
      button &&
      floatingDrawButtonState.initialized
    ) {
      setFloatingDrawButtonPosition(
        floatingDrawButtonState.position.x,
        floatingDrawButtonState.position.y,
      );
    }
    if (updateControl) {
      updateFloatingDrawButtonScaleControl();
    }
    if (persist) {
      scheduleSessionPersist();
    }
  }

  function refreshFloatingDrawButtonScale(button) {
    if (!button || typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
      floatingDrawButtonState.scale = state.virtualCursorButtonScale || DEFAULT_FLOATING_DRAW_BUTTON_SCALE;
      return floatingDrawButtonState.scale;
    }
    const computed = window.getComputedStyle(button);
    const raw = computed ? computed.getPropertyValue('--floating-draw-button-scale') : '';
    const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
    const scale = Number.isFinite(parsed) && parsed > 0
      ? normalizeFloatingDrawButtonScale(parsed)
      : (state.virtualCursorButtonScale || DEFAULT_FLOATING_DRAW_BUTTON_SCALE);
    if (!Number.isFinite(parsed) || parsed <= 0 || Math.abs(scale - parsed) > Number.EPSILON) {
      button.style.setProperty('--floating-draw-button-scale', String(scale));
    }
    floatingDrawButtonState.scale = scale;
    state.virtualCursorButtonScale = scale;
    updateFloatingDrawButtonScaleControl();
    return scale;
  }

  function setFloatingDrawButtonPosition(x, y) {
    const button = dom.floatingDrawButton;
    if (!button) {
      return;
    }
    const baseX = floatingDrawButtonState.position.x || 0;
    const baseY = floatingDrawButtonState.position.y || 0;
    const rawX = Number.isFinite(x) ? Math.round(x) : baseX;
    const rawY = Number.isFinite(y) ? Math.round(y) : baseY;
    let scale = floatingDrawButtonState.scale;
    if (!Number.isFinite(scale) || scale <= 0) {
      scale = refreshFloatingDrawButtonScale(button);
    }
    const margin = 8;
    const buttonWidth = button.offsetWidth || button.clientWidth || 0;
    const buttonHeight = button.offsetHeight || button.clientHeight || 0;
    const viewportBounds = getViewportBounds();
    const safeArea = getSafeAreaInsets();
    const scaledWidth = Math.max(0, buttonWidth * scale);
    const scaledHeight = Math.max(0, buttonHeight * scale);
    const minX = Math.round(viewportBounds.left + safeArea.left + margin);
    const minY = Math.round(viewportBounds.top + safeArea.top + margin);
    const maxX = Math.max(minX, Math.round(viewportBounds.right - safeArea.right - scaledWidth - margin));
    const maxY = Math.max(minY, Math.round(viewportBounds.bottom - safeArea.bottom - scaledHeight - margin));
    const clampedX = clamp(rawX, minX, maxX);
    const clampedY = clamp(rawY, minY, maxY);
    floatingDrawButtonState.position.x = clampedX;
    floatingDrawButtonState.position.y = clampedY;
    button.style.setProperty('--floating-draw-button-x', `${clampedX}px`);
    button.style.setProperty('--floating-draw-button-y', `${clampedY}px`);
    floatingDrawButtonState.initialized = true;
  }

  function clampFloatingDrawButtonPosition() {
    const button = dom.floatingDrawButton;
    if (!button || !floatingDrawButtonState.initialized) {
      return;
    }
    setFloatingDrawButtonPosition(
      floatingDrawButtonState.position.x,
      floatingDrawButtonState.position.y,
    );
  }

  function handleFloatingDrawButtonResize() {
    resizeVirtualCursorCanvas();
    clampFloatingDrawButtonPosition();
    requestOverlayRender();
  }

  function getToolIconEntry(tool) {
    if (!tool || !toolButtons.length) {
      return null;
    }
    const button = toolButtons.find(btn => btn.dataset.tool === tool);
    if (!button) {
      return null;
    }
    const img = button.querySelector('img');
    if (!(img instanceof HTMLImageElement)) {
      return null;
    }
    const src = img.currentSrc || img.src;
    if (!src) {
      return null;
    }
    let entry = toolIconCache.get(src);
    if (!entry) {
      const image = new Image();
      entry = {
        image,
        ready: false,
        error: false,
      };
      image.addEventListener('load', () => {
        entry.ready = true;
        requestOverlayRender();
      });
      image.addEventListener('error', () => {
        entry.error = true;
      });
      image.src = src;
      toolIconCache.set(src, entry);
    }
    if (entry.error) {
      return null;
    }
    if (!entry.ready) {
      return null;
    }
    return entry;
  }

  function performVirtualCursorAction() {
    if (!state.showVirtualCursor || !virtualCursor) {
      return;
    }
    const position = {
      x: clamp(Math.floor(virtualCursor.x), 0, state.width - 1),
      y: clamp(Math.floor(virtualCursor.y), 0, state.height - 1),
    };
    const activeTool = state.tool;
    const layer = getActiveLayer();
    let startedHistory = false;
    let actionPerformed = false;

    const beginHistoryIfNeeded = () => {
      if (!startedHistory && HISTORY_DRAW_TOOLS.has(activeTool)) {
        beginHistory(activeTool);
        startedHistory = true;
      }
    };

    if (activeTool === 'eyedropper') {
      sampleColor(position.x, position.y);
      actionPerformed = true;
      requestOverlayRender();
      scheduleSessionPersist();
      return;
    }

    if (activeTool === 'selectSame') {
      createSelectionByColor(position.x, position.y);
      actionPerformed = true;
      scheduleSessionPersist();
      return;
    }

    if (activeTool === 'selectRect') {
      createSelectionRect(position, position);
      actionPerformed = true;
      scheduleSessionPersist();
      return;
    }

    if (activeTool === 'selectLasso') {
      const points = [
        { x: position.x, y: position.y },
        { x: clamp(position.x + 1, 0, state.width - 1), y: position.y },
        {
          x: clamp(position.x + 1, 0, state.width - 1),
          y: clamp(position.y + 1, 0, state.height - 1),
        },
        { x: position.x, y: clamp(position.y + 1, 0, state.height - 1) },
      ];
      createSelectionLasso(points);
      actionPerformed = true;
      scheduleSessionPersist();
      return;
    }

    if (activeTool === 'move') {
      // Move tool requires drag; single tap falls back to selection highlight.
      if (state.selectionMask) {
        // keep selection active; nothing else to do
        actionPerformed = true;
      }
      scheduleSessionPersist();
      return;
    }

    if (!layer && HISTORY_DRAW_TOOLS.has(activeTool)) {
      return;
    }

    beginHistoryIfNeeded();

    switch (activeTool) {
      case 'pen':
      case 'eraser':
        applyBrushStroke(position.x, position.y, position.x, position.y);
        actionPerformed = true;
        break;
      case 'fill':
        floodFill(position.x, position.y);
        actionPerformed = true;
        break;
      case 'line':
        drawLine(position, position);
        actionPerformed = true;
        break;
      case 'rect':
        drawRectangle(position, position, false);
        actionPerformed = true;
        break;
      case 'rectFill':
        drawRectangle(position, position, true);
        actionPerformed = true;
        break;
      case 'ellipse':
        drawEllipse(position, position, false);
        actionPerformed = true;
        break;
      case 'ellipseFill':
        drawEllipse(position, position, true);
        actionPerformed = true;
        break;
      case 'curve':
        applyBrushStroke(position.x, position.y, position.x, position.y);
        actionPerformed = true;
        break;
      default:
        break;
    }

    if (startedHistory) {
      if (actionPerformed) {
        commitHistory();
      } else {
        rollbackPendingHistory({ reRender: false });
      }
    }

    if (actionPerformed) {
      requestOverlayRender();
      scheduleSessionPersist();
    }
  }

  function teardownFloatingDrawButtonPointerHandlers() {
    window.removeEventListener('pointermove', handleFloatingDrawButtonPointerMove);
    window.removeEventListener('pointerup', handleFloatingDrawButtonPointerUp);
    window.removeEventListener('pointercancel', handleFloatingDrawButtonPointerCancel);
  }

  function handleFloatingDrawButtonPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    event.preventDefault();
    const button = dom.floatingDrawButton;
    if (!button) {
      return;
    }
    floatingDrawButtonState.pointerId = event.pointerId ?? -1;
    floatingDrawButtonState.pointerType = typeof event.pointerType === 'string' ? event.pointerType : null;
    floatingDrawButtonState.dragging = false;
    floatingDrawButtonState.startPointer = { x: event.clientX, y: event.clientY };
    floatingDrawButtonState.startPosition = { ...floatingDrawButtonState.position };
    floatingDrawButtonState.startCursorCell = getVirtualCursorCellPosition();
    floatingDrawButtonState.drawMoved = false;
    floatingDrawButtonState.drawSessionStarted = startVirtualCursorDrawSession();
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch (error) {
      // ignore capture errors
    }
    window.addEventListener('pointermove', handleFloatingDrawButtonPointerMove);
    window.addEventListener('pointerup', handleFloatingDrawButtonPointerUp);
    window.addEventListener('pointercancel', handleFloatingDrawButtonPointerCancel);
  }

  function handleFloatingDrawButtonPointerMove(event) {
    if (floatingDrawButtonState.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - (floatingDrawButtonState.startPointer?.x || 0);
    const dy = event.clientY - (floatingDrawButtonState.startPointer?.y || 0);
    if (!floatingDrawButtonState.dragging) {
      const distance = Math.hypot(dx, dy);
      const pointerType = floatingDrawButtonState.pointerType;
      const dragThreshold = (pointerType === 'touch' || pointerType === 'pen')
        ? DRAW_BUTTON_DRAG_THRESHOLD_TOUCH
        : DRAW_BUTTON_DRAG_THRESHOLD;
      if (distance >= dragThreshold) {
        const isActiveDrawingHold = floatingDrawButtonState.drawSessionStarted && floatingDrawButtonState.drawMoved;
        if (isActiveDrawingHold) {
          return;
        }
        floatingDrawButtonState.dragging = true;
        if (virtualCursorDrawState.active) {
          cancelVirtualCursorDrawSession();
        }
        floatingDrawButtonState.drawSessionStarted = false;
        floatingDrawButtonState.drawMoved = false;
      }
    }
    if (floatingDrawButtonState.dragging) {
      const nextX = (floatingDrawButtonState.startPosition?.x || 0) + dx;
      const nextY = (floatingDrawButtonState.startPosition?.y || 0) + dy;
      setFloatingDrawButtonPosition(nextX, nextY);
    }
  }

  function handleFloatingDrawButtonPointerUp(event) {
    if (floatingDrawButtonState.pointerId !== event.pointerId) {
      return;
    }
    teardownFloatingDrawButtonPointerHandlers();
    const button = dom.floatingDrawButton;
    if (button) {
      try {
        button.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        // ignore release errors
      }
    }
    const wasDragging = floatingDrawButtonState.dragging;
    const wasDrawing = virtualCursorDrawState.active;
    floatingDrawButtonState.pointerId = null;
    floatingDrawButtonState.pointerType = null;
    floatingDrawButtonState.dragging = false;
    floatingDrawButtonState.startPointer = null;
    floatingDrawButtonState.startPosition = null;
    floatingDrawButtonState.startCursorCell = null;
    floatingDrawButtonState.drawMoved = false;
    floatingDrawButtonState.drawSessionStarted = false;
    if (wasDrawing) {
      if (wasDragging) {
        cancelVirtualCursorDrawSession();
      } else {
        finishVirtualCursorDrawSession({ commit: true });
      }
      return;
    }
    if (!wasDragging) {
      performVirtualCursorAction();
    }
  }

  function handleFloatingDrawButtonPointerCancel(event) {
    if (floatingDrawButtonState.pointerId !== event.pointerId) {
      return;
    }
    teardownFloatingDrawButtonPointerHandlers();
    const button = dom.floatingDrawButton;
    if (button) {
      try {
        button.releasePointerCapture?.(event.pointerId);
      } catch (error) {
        // ignore release errors
      }
    }
    cancelVirtualCursorDrawSession();
    floatingDrawButtonState.pointerId = null;
    floatingDrawButtonState.pointerType = null;
    floatingDrawButtonState.dragging = false;
    floatingDrawButtonState.startPointer = null;
    floatingDrawButtonState.startPosition = null;
    floatingDrawButtonState.startCursorCell = null;
    floatingDrawButtonState.drawMoved = false;
    floatingDrawButtonState.drawSessionStarted = false;
  }

  function updateFloatingDrawButtonEnabledState() {
    const button = dom.floatingDrawButton;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const hidden = !state.showVirtualCursor;
    if (hidden) {
      button.classList.add('is-disabled');
      button.classList.add('is-hidden');
      button.setAttribute('hidden', '');
      button.setAttribute('aria-hidden', 'true');
      button.setAttribute('aria-disabled', 'true');
      teardownFloatingDrawButtonPointerHandlers();
      try {
        if (floatingDrawButtonState.pointerId !== null) {
          button.releasePointerCapture?.(floatingDrawButtonState.pointerId);
        }
      } catch (error) {
        // ignore release errors
      }
      cancelVirtualCursorDrawSession();
      floatingDrawButtonState.pointerId = null;
      floatingDrawButtonState.pointerType = null;
      floatingDrawButtonState.dragging = false;
      floatingDrawButtonState.startPointer = null;
      floatingDrawButtonState.startPosition = null;
      floatingDrawButtonState.startCursorCell = null;
      floatingDrawButtonState.drawMoved = false;
      floatingDrawButtonState.drawSessionStarted = false;
    } else {
      button.classList.remove('is-hidden');
      button.classList.remove('is-disabled');
      button.removeAttribute('hidden');
      button.setAttribute('aria-hidden', 'false');
      button.setAttribute('aria-disabled', 'false');
      clampFloatingDrawButtonPosition();
    }
  }

  function setupFloatingDrawButton() {
    const button = dom.floatingDrawButton;
    const viewport = dom.canvasViewport;
    if (!button || !viewport) {
      return;
    }
    setVirtualCursorButtonScale(state.virtualCursorButtonScale, { persist: false, clampPosition: false });
    const scale = refreshFloatingDrawButtonScale(button);
    button.addEventListener('pointerdown', handleFloatingDrawButtonPointerDown);
    button.addEventListener('click', event => event.preventDefault());
    if (!drawButtonResizeListenerBound) {
      window.addEventListener('resize', handleFloatingDrawButtonResize);
      drawButtonResizeListenerBound = true;
    }
    if (!floatingDrawButtonState.initialized) {
      const initialX = 16;
      const baseHeight = button.offsetHeight || button.clientHeight || 48;
      const scaledHeight = Math.max(0, baseHeight * (Number.isFinite(scale) && scale > 0 ? scale : 1));
      const initialY = Math.max(16, (viewport.clientHeight || 0) - scaledHeight - 32);
      setFloatingDrawButtonPosition(initialX, initialY);
    } else {
      clampFloatingDrawButtonPosition();
    }
    updateFloatingDrawButtonEnabledState();
  }

  function resizeVirtualCursorCanvas() {
    const canvas = dom.canvases.virtualCursor;
    const viewport = dom.canvasViewport;
    if (!canvas || !viewport) {
      return;
    }
    if (!ctx.virtual && typeof canvas.getContext === 'function') {
      ctx.virtual = canvas.getContext('2d');
      if (ctx.virtual) {
        ctx.virtual.imageSmoothingEnabled = true;
      }
    }
    const rect = viewport.getBoundingClientRect();
    const cssWidth = rect.width || viewport.clientWidth || 0;
    const cssHeight = rect.height || viewport.clientHeight || 0;
    if (cssWidth <= 0 || cssHeight <= 0) {
      const needsReset = canvas.width !== 1 || canvas.height !== 1;
      if (needsReset) {
        canvas.width = 1;
        canvas.height = 1;
        if (ctx.virtual) {
          ctx.virtual.imageSmoothingEnabled = true;
        }
      }
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
    const targetHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      if (ctx.virtual) {
        ctx.virtual.imageSmoothingEnabled = true;
      }
    }
  }

  function resizeCanvases({
    forceRender = true,
    applyTransform = true,
    syncControls = true,
    updateScaleLimits = true,
  } = {}) {
    const { width, height, scale } = state;
    const drawingCanvas = dom.canvases.drawing;
    const overlayCanvas = dom.canvases.overlay;
    const selectionCanvas = dom.canvases.selection || null;

    let drawingReset = false;
    let overlayReset = false;

    if (drawingCanvas.width !== width) {
      drawingCanvas.width = width;
      drawingReset = true;
    }
    if (drawingCanvas.height !== height) {
      drawingCanvas.height = height;
      drawingReset = true;
    }
    if (overlayCanvas.width !== width) {
      overlayCanvas.width = width;
      overlayReset = true;
    }
    if (overlayCanvas.height !== height) {
      overlayCanvas.height = height;
      overlayReset = true;
    }
    if (ctx.drawing) {
      ctx.drawing.imageSmoothingEnabled = false;
    }
    if (ctx.overlay) {
      ctx.overlay.imageSmoothingEnabled = false;
    }
    if (ctx.selection) {
      ctx.selection.imageSmoothingEnabled = false;
    }

    const cssWidth = `${width * scale}px`;
    const cssHeight = `${height * scale}px`;
    if (drawingCanvas.style.width !== cssWidth) {
      drawingCanvas.style.width = cssWidth;
    }
    if (drawingCanvas.style.height !== cssHeight) {
      drawingCanvas.style.height = cssHeight;
    }
    if (overlayCanvas.style.width !== cssWidth) {
      overlayCanvas.style.width = cssWidth;
    }
    if (overlayCanvas.style.height !== cssHeight) {
      overlayCanvas.style.height = cssHeight;
    }
    if (selectionCanvas) {
      if (selectionCanvas.style.width !== cssWidth) {
        selectionCanvas.style.width = cssWidth;
      }
      if (selectionCanvas.style.height !== cssHeight) {
        selectionCanvas.style.height = cssHeight;
      }
    }
    resizeVirtualCursorCanvas();
    if (applyTransform) {
      applyViewportTransform();
    }
    clampFloatingDrawButtonPosition();
    if (updateScaleLimits) {
      updateSpriteScaleControlLimits();
    }
    if (syncControls) {
      syncControlsWithState();
    }
    if (forceRender || drawingReset || overlayReset) {
      markCanvasDirty();
      renderCanvas();
    }
    requestOverlayRender();
  }

  function showZoomIndicator(scale) {
    const indicator = dom.zoomIndicator;
    if (!indicator) {
      return;
    }
    indicator.textContent = formatZoomLabel(scale);
    indicator.classList.add('is-visible');
    indicator.setAttribute('aria-hidden', 'false');
    if (zoomIndicatorTimeoutId !== null) {
      window.clearTimeout(zoomIndicatorTimeoutId);
    }
    zoomIndicatorTimeoutId = window.setTimeout(() => {
      indicator.classList.remove('is-visible');
      indicator.setAttribute('aria-hidden', 'true');
      zoomIndicatorTimeoutId = null;
    }, ZOOM_INDICATOR_TIMEOUT);
  }

  function getVirtualCursorZoomFocus() {
    if (!state.showVirtualCursor || !virtualCursor) {
      return null;
    }
    const width = Math.max(1, Number(state.width) || 1);
    const height = Math.max(1, Number(state.height) || 1);
    const worldX = clamp(Number(virtualCursor.x), 0, width - 1);
    const worldY = clamp(Number(virtualCursor.y), 0, height - 1);
    const scale = Number(state.scale) || MIN_ZOOM_SCALE;
    const drawing = dom.canvases.drawing;
    if (!drawing) {
      return {
        worldX,
        worldY,
        cellX: Math.floor(worldX),
        cellY: Math.floor(worldY),
      };
    }
    const rect = drawing.getBoundingClientRect();
    return {
      clientX: rect.left + worldX * scale,
      clientY: rect.top + worldY * scale,
      worldX,
      worldY,
      cellX: Math.floor(worldX),
      cellY: Math.floor(worldY),
    };
  }

  function setZoom(nextScale, focus) {
    const prevScale = Number(state.scale) || MIN_ZOOM_SCALE;
    const targetScale = normalizeZoomScale(nextScale, prevScale);
    if (Math.abs(targetScale - prevScale) < ZOOM_EPSILON) {
      syncControlsWithState();
      return;
    }

    const previousPan = {
      x: Number(state.pan.x) || 0,
      y: Number(state.pan.y) || 0,
    };
    const stack = dom.canvases.stack;
    const stackRectBefore = stack ? stack.getBoundingClientRect() : null;
    let zoomFocus = focus && Number.isFinite(focus.worldX) && Number.isFinite(focus.worldY)
      ? focus
      : null;
    if (!zoomFocus && state.showVirtualCursor) {
      zoomFocus = getVirtualCursorZoomFocus();
    }

    state.scale = targetScale;
    resizeCanvases({
      forceRender: false,
      applyTransform: false,
      syncControls: false,
      updateScaleLimits: false,
    });

    if (zoomFocus && stack && stackRectBefore) {
      const stackRectAfter = stack.getBoundingClientRect();
      const layoutShiftX = stackRectAfter.left - stackRectBefore.left;
      const layoutShiftY = stackRectAfter.top - stackRectBefore.top;
      const scaleDelta = prevScale - targetScale;
      const nextPanX = previousPan.x + zoomFocus.worldX * scaleDelta - layoutShiftX;
      const nextPanY = previousPan.y + zoomFocus.worldY * scaleDelta - layoutShiftY;
      state.pan.x = Math.round(nextPanX);
      state.pan.y = Math.round(nextPanY);
    } else {
      const ratio = targetScale / prevScale;
      state.pan.x = Math.round(previousPan.x * ratio);
      state.pan.y = Math.round(previousPan.y * ratio);
    }

    applyViewportTransform();
    if (dom.controls.zoomSlider) {
      dom.controls.zoomSlider.value = String(getZoomStepIndex(targetScale));
    }
    if (dom.controls.zoomLevel) {
      dom.controls.zoomLevel.textContent = formatZoomLabel(targetScale);
    }
    showZoomIndicator(targetScale);
    scheduleSessionPersist({ includeSnapshots: false });
  }

  function adjustZoomBySteps(delta, focus) {
    const currentIndex = getZoomStepIndex(state.scale);
    const nextIndex = clamp(currentIndex + Math.round(delta || 0), 0, ZOOM_STEPS.length - 1);
    if (nextIndex === currentIndex) {
      syncControlsWithState();
      return;
    }
    setZoom(getZoomScaleAtIndex(nextIndex), focus);
  }

  function getCanvasFocusAt(clientX, clientY, { clampToCanvas = false } = {}) {
    const drawing = dom.canvases.drawing;
    if (!drawing) {
      return null;
    }
    const rect = drawing.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return null;
    }
    const outsideX = clientX < rect.left || clientX > rect.right;
    const outsideY = clientY < rect.top || clientY > rect.bottom;
    if ((outsideX || outsideY) && !clampToCanvas) {
      return null;
    }
    const clampedClientX = clampToCanvas ? clamp(clientX, rect.left, rect.right) : clientX;
    const clampedClientY = clampToCanvas ? clamp(clientY, rect.top, rect.bottom) : clientY;
    const scale = Number(state.scale) || MIN_ZOOM_SCALE;
    const worldX = (clampedClientX - rect.left) / scale;
    const worldY = (clampedClientY - rect.top) / scale;
    return {
      clientX: clampedClientX,
      clientY: clampedClientY,
      worldX,
      worldY,
      cellX: Math.floor(worldX),
      cellY: Math.floor(worldY),
    };
  }

  function handleCanvasWheel(event) {
    const pointerFocus = getCanvasFocusAt(event.clientX, event.clientY);
    const focus = state.showVirtualCursor
      ? (getVirtualCursorZoomFocus() || pointerFocus)
      : pointerFocus;
    if (!focus) {
      return;
    }
    const deltaY = event.deltaY;
    if (!Number.isFinite(deltaY) || deltaY === 0) {
      return;
    }
    event.preventDefault();
    const deltaModeScale = event.deltaMode === 1 ? 16 : (event.deltaMode === 2 ? 180 : 1);
    const normalizedDelta = clamp(deltaY * deltaModeScale, -600, 600);
    const wheelSteps = normalizedDelta / 100;
    if (!Number.isFinite(wheelSteps) || Math.abs(wheelSteps) < 0.001) {
      return;
    }
    const zoomFactor = Math.pow(ZOOM_WHEEL_STEP_BASE, -wheelSteps);
    if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
      return;
    }
    focus.cellX = clamp(focus.cellX, 0, state.width - 1);
    focus.cellY = clamp(focus.cellY, 0, state.height - 1);
    const currentScale = Number(state.scale) || MIN_ZOOM_SCALE;
    const targetScale = normalizeZoomScale(currentScale * zoomFactor, currentScale);
    if (Math.abs(targetScale - currentScale) < ZOOM_EPSILON) {
      return;
    }
    setZoom(targetScale, focus);
  }

  function setupKeyboard() {
    document.addEventListener('keydown', event => {
      const target = event.target;
      const editable = isEditableTarget(target);
      if (event.code === 'Space' && !editable && !event.metaKey && !event.ctrlKey && !event.altKey) {
        setSpacePanActive(true);
        event.preventDefault();
      }
      if (event.key === 'Escape') {
        if (hasPendingSelectionMove()) {
          cancelPendingSelectionMove();
        } else {
          clearSelection();
        }
        return;
      }
      const isModifier = event.metaKey || event.ctrlKey;
      if (!isModifier) {
        return;
      }
      if (editable) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault();
        redo();
      } else if (key === 'c') {
        const success = copySelection();
        if (success) {
          event.preventDefault();
        }
      } else if (key === 'x') {
        const success = cutSelection();
        if (success) {
          event.preventDefault();
        }
      } else if (key === 'v') {
        const success = pasteSelection();
        if (success) {
          event.preventDefault();
        }
      }
    });
    document.addEventListener('keyup', event => {
      if (event.code === 'Space') {
        setSpacePanActive(false);
      }
    });
    window.addEventListener('blur', () => {
      setSpacePanActive(false);
    });
  }

  function detachPointerListeners() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }

  function resetPointerState({ commitHistory: shouldCommit = false } = {}) {
    if (pointerState.pointerId !== null) {
      const captureTarget = pointerState.panCaptureElement || dom.canvases.drawing;
      if (captureTarget && typeof captureTarget.releasePointerCapture === 'function') {
        try {
          captureTarget.releasePointerCapture(pointerState.pointerId);
        } catch (error) {
          // Ignore release failures when capture is not set.
        }
      }
    }
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.tool = null;
    pointerState.start = null;
    pointerState.current = null;
    pointerState.last = null;
    pointerState.path = [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.startClient = null;
    pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
    pointerState.panMode = null;
    pointerState.touchPanStart = null;
    pointerState.touchPinchStartDistance = null;
    pointerState.touchPinchStartScale = null;
    pointerState.curveHandle = null;
    pointerState.panCaptureElement = null;
    document.body.classList.remove('is-pan-dragging');
    if (shouldCommit) {
      commitHistory();
    }
    requestOverlayRender();
  }

  function resetPointerStateForVirtualCursor() {
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.tool = null;
    pointerState.start = null;
    pointerState.current = null;
    pointerState.last = null;
    pointerState.path = [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.startClient = null;
    pointerState.panMode = null;
    pointerState.touchPanStart = null;
    pointerState.touchPinchStartDistance = null;
    pointerState.touchPinchStartScale = null;
    pointerState.curveHandle = null;
    pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
    pointerState.panCaptureElement = null;
    document.body.classList.remove('is-pan-dragging');
  }

  function abortActivePointerInteraction({ commitHistory: shouldCommit = true } = {}) {
    if (!pointerState.active) {
      return;
    }
    if (pointerState.tool === 'selectionMove' || pointerState.tool === 'layerMove') {
      finalizeSelectionMove();
    }
    detachPointerListeners();
    resetPointerState({ commitHistory: shouldCommit });
  }

  function updateTouchPointer(event) {
    if (event.pointerType !== 'touch') {
      return;
    }
    activeTouchPointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function hasActiveMultiTouch() {
    return activeTouchPointers.size >= TOUCH_PAN_MIN_POINTERS;
  }

  function removeTouchPointer(event) {
    if (event.pointerType !== 'touch') {
      return;
    }
    activeTouchPointers.delete(event.pointerId);
  }

  function getTouchCentroid() {
    if (!activeTouchPointers.size) {
      return null;
    }
    let sumX = 0;
    let sumY = 0;
    activeTouchPointers.forEach(point => {
      sumX += point.x;
      sumY += point.y;
    });
    const count = activeTouchPointers.size;
    return { x: sumX / count, y: sumY / count };
  }

  function getTouchPointerDistance() {
    if (activeTouchPointers.size < 2) {
      return null;
    }
    const points = Array.from(activeTouchPointers.values());
    const first = points[0];
    const second = points[1];
    if (!first || !second) {
      return null;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function refreshTouchPanBaseline() {
    pointerState.touchPanStart = getTouchCentroid();
    pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
    pointerState.touchPinchStartDistance = getTouchPointerDistance();
    pointerState.touchPinchStartScale = Number(state.scale) || MIN_ZOOM_SCALE;
  }

  function startPanInteraction(event, { multiTouch = false, captureElement = dom.canvases.drawing } = {}) {
    // Touch pan/zoom is handled only with two-finger gestures.
    if (event?.pointerType === 'touch' && !multiTouch) {
      return;
    }
    pointerState.active = true;
    pointerState.tool = 'pan';
    pointerState.panMode = multiTouch ? 'multiTouch' : 'single';
    pointerState.panOrigin = { x: state.pan.x, y: state.pan.y };
    pointerState.path = [];
    if (multiTouch) {
      pointerState.pointerId = null;
      pointerState.startClient = null;
      refreshTouchPanBaseline();
      if (!pointerState.touchPanStart) {
        pointerState.touchPanStart = { x: event.clientX, y: event.clientY };
        pointerState.touchPinchStartDistance = null;
        pointerState.touchPinchStartScale = Number(state.scale) || MIN_ZOOM_SCALE;
      }
      pointerState.panCaptureElement = null;
    } else {
      pointerState.pointerId = event.pointerId;
      pointerState.startClient = { x: event.clientX, y: event.clientY };
      pointerState.touchPanStart = null;
      pointerState.touchPinchStartDistance = null;
      pointerState.touchPinchStartScale = null;
      const captureTarget = captureElement && typeof captureElement.setPointerCapture === 'function'
        ? captureElement
        : dom.canvases.drawing;
      pointerState.panCaptureElement = captureTarget || null;
      if (pointerState.panCaptureElement && typeof pointerState.panCaptureElement.setPointerCapture === 'function') {
        try {
          pointerState.panCaptureElement.setPointerCapture(event.pointerId);
        } catch (error) {
          pointerState.panCaptureElement = null;
        }
      }
    }
    document.body.classList.add('is-pan-dragging');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function finishPanInteraction() {
    detachPointerListeners();
    if (pointerState.pointerId !== null) {
      const captureTarget = pointerState.panCaptureElement || dom.canvases.drawing;
      if (captureTarget && typeof captureTarget.releasePointerCapture === 'function') {
        try {
          captureTarget.releasePointerCapture(pointerState.pointerId);
        } catch (error) {
          // Ignore capture release issues.
        }
      }
    }
    pointerState.active = false;
    pointerState.pointerId = null;
    pointerState.tool = null;
    pointerState.panMode = null;
    pointerState.touchPanStart = null;
    pointerState.touchPinchStartDistance = null;
    pointerState.touchPinchStartScale = null;
    pointerState.startClient = null;
    pointerState.path = [];
    pointerState.panCaptureElement = null;
    document.body.classList.remove('is-pan-dragging');
    activeTouchPointers.clear();
    requestOverlayRender();
    scheduleSessionPersist({ includeSnapshots: false });
  }

  function handlePointerDown(event) {
    const isTouch = event.pointerType === 'touch';
    if (isTouch) {
      updateTouchPointer(event);
    }
    const isMiddleMousePan = event.pointerType !== 'touch' && event.button === 1;
    if (isMiddleMousePan) {
      event.preventDefault();
      if (pointerState.active) {
        abortActivePointerInteraction();
      }
      startPanInteraction(event);
      return;
    }
    const isPrimaryPointer = event.pointerType !== 'touch' && (event.button === 0 || event.button === undefined);
    if (keyboardState.spacePanActive && isPrimaryPointer) {
      event.preventDefault();
      if (pointerState.active) {
        abortActivePointerInteraction({ commitHistory: false });
      }
      startPanInteraction(event, { captureElement: dom.canvasViewport });
      return;
    }

    if (isTouch && hasActiveMultiTouch()) {
      event.preventDefault();
      releaseVirtualCursorPointer();
      if (pointerState.active && pointerState.tool !== 'pan') {
        abortActivePointerInteraction({ commitHistory: false });
        rollbackPendingHistory();
      }
      if (!pointerState.active || pointerState.tool !== 'pan' || pointerState.panMode !== 'multiTouch') {
        abortActivePointerInteraction();
        startPanInteraction(event, { multiTouch: true });
      } else {
        refreshTouchPanBaseline();
      }
      return;
    }

    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    event.preventDefault();
    const position = getPointerPosition(event);
    const activeTool = state.tool;
    const layer = getActiveLayer();

    if (HISTORY_DRAW_TOOLS.has(activeTool) && !layer) {
      return;
    }

    if (activeTool === 'pan') {
      if (isTouch) {
        // On mobile, one-finger pan is disabled; wait for two-finger gesture.
        return;
      }
      startPanInteraction(event, { multiTouch: false });
      return;
    }

    if (!position) {
      pointerState.active = false;
      return;
    }

    if (!(state.showVirtualCursor && event.pointerType === 'touch')) {
      setVirtualCursor(position);
    }

    if (state.showVirtualCursor) {
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        mouseInsideViewport = true;
        refreshViewportCursorStyle();
      }
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.tool = null;
      pointerState.start = null;
      pointerState.current = null;
      pointerState.last = null;
      pointerState.path = [];
      pointerState.preview = null;
      pointerState.selectionPreview = null;
      pointerState.selectionMove = null;
      pointerState.selectionClearedOnDown = false;
      if (isTouch) {
        hoverPixel = null;
        captureVirtualCursorPointer(event.pointerId, event.pointerType, dom.canvases.drawing, event);
        requestOverlayRender();
        return;
      }
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        hoverPixel = null;
        captureVirtualCursorPointer(event.pointerId, event.pointerType, dom.canvases.drawing, event);
        requestOverlayRender();
        return;
      }
    }

    pointerState.selectionClearedOnDown = false;
    pointerState.selectionMove = null;

    const selectionMask = state.selectionMask;
    const hasSelection = Boolean(selectionMask && selectionMaskHasPixels(selectionMask));
    const selectionHit = hasSelection && isPositionInCurrentSelection(position);
    const isSelectionTool = activeTool === 'selectRect' || activeTool === 'selectLasso' || activeTool === 'selectSame' || activeTool === 'move';
    const pendingMoveState = !pointerState.active ? getPendingSelectionMoveState() : null;
    const pendingSelectionHit = Boolean(pendingMoveState && isPositionInMoveState(position, pendingMoveState));

    if (pendingMoveState) {
      // Keep dragging when touching the moved selection preview; confirm only when touching outside.
      if (isSelectionTool && (selectionHit || pendingSelectionHit)) {
        const moved = beginSelectionMove(event, position, { reuseOffset: true });
        if (moved) {
          updateCanvasControlButtons();
          return;
        }
      }
      confirmPendingSelectionMove();
      pointerState.active = false;
      pointerState.pointerId = null;
      pointerState.tool = null;
      pointerState.start = null;
      pointerState.current = null;
      pointerState.last = null;
      pointerState.path = [];
      pointerState.preview = null;
      pointerState.selectionPreview = null;
      pointerState.selectionMove = null;
      pointerState.selectionClearedOnDown = false;
      return;
    }

    if (isSelectionTool && hasSelection && selectionHit) {
      const moved = beginSelectionMove(event, position, { reuseOffset: Boolean(state.pendingPasteMoveState) });
      if (moved) {
        updateCanvasControlButtons();
        return;
      }
    }

    if (activeTool === 'move') {
      if (hasSelection && !selectionHit) {
        clearSelection();
      }
      const hasSelectionAfterClear = Boolean(state.selectionMask && selectionMaskHasPixels(state.selectionMask));
      if (!hasSelectionAfterClear) {
        const movedWholeLayer = beginLayerMove(event, position, layer);
        if (movedWholeLayer) {
          return;
        }
      }
      pointerState.active = false;
      return;
    }

    if ((activeTool === 'selectRect' || activeTool === 'selectLasso') && hasSelection && !selectionHit) {
      clearSelection();
      pointerState.selectionClearedOnDown = true;
    }

    if (activeTool === 'curve') {
      if (HISTORY_DRAW_TOOLS.has(activeTool) && !layer) {
        return;
      }
      handleCurvePointerDown(event, position, layer);
      return;
    }

    if (!dom.canvases.drawing) {
      return;
    }
    dom.canvases.drawing.setPointerCapture(event.pointerId);
    hoverPixel = null;
    requestOverlayRender();
    pointerState.active = true;
    pointerState.pointerId = event.pointerId;
    pointerState.tool = activeTool;
    pointerState.start = position;
    pointerState.current = position;
    pointerState.last = position;
    pointerState.path = position ? [position] : [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;

    if (HISTORY_DRAW_TOOLS.has(activeTool)) {
      beginHistory(activeTool);
    }

    if (activeTool === 'eyedropper') {
      sampleColor(position.x, position.y);
      pointerState.active = false;
      if (dom.canvases.drawing) {
        dom.canvases.drawing.releasePointerCapture(event.pointerId);
      }
      setActiveTool('pen');
      return;
    }

    if (activeTool === 'fill') {
      floodFill(position.x, position.y);
      commitHistory();
      requestOverlayRender();
      pointerState.active = false;
      pointerState.tool = state.tool;
      pointerState.pointerId = null;
      if (dom.canvases.drawing) {
        try {
          dom.canvases.drawing.releasePointerCapture(event.pointerId);
        } catch (error) {
          // Ignore capture release issues.
        }
      }
      return;
    }

    if (activeTool === 'selectRect' || activeTool === 'selectLasso') {
      pointerState.selectionPreview = { start: position, points: [position] };
    } else if (activeTool === 'selectSame') {
      pointerState.selectionPreview = null;
    } else if (activeTool === 'line' || activeTool === 'rect' || activeTool === 'rectFill' || activeTool === 'ellipse' || activeTool === 'ellipseFill') {
      pointerState.preview = { start: position, end: position, points: [position] };
    } else {
      applyBrushStroke(position.x, position.y, position.x, position.y);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function handlePointerMove(event) {
    if (event.pointerType === 'touch' && activeTouchPointers.has(event.pointerId)) {
      updateTouchPointer(event);
    }
    if (!pointerState.active) return;
    if (pointerState.tool === 'pan') {
      if (pointerState.panMode === 'multiTouch') {
        if (activeTouchPointers.size < TOUCH_PAN_MIN_POINTERS) {
          return;
        }
        if (!activeTouchPointers.has(event.pointerId)) {
          return;
        }
        if (!pointerState.touchPanStart) {
          refreshTouchPanBaseline();
        }
        const centroid = getTouchCentroid();
        if (!centroid || !pointerState.touchPanStart) {
          return;
        }
        const baselineCentroid = pointerState.touchPanStart;
        const baselinePan = pointerState.panOrigin || { x: state.pan.x, y: state.pan.y };
        const dx = centroid.x - baselineCentroid.x;
        const dy = centroid.y - baselineCentroid.y;
        let panBaseX = baselinePan.x || 0;
        let panBaseY = baselinePan.y || 0;

        const baselineDistance = Number(pointerState.touchPinchStartDistance);
        const nextDistance = Number(getTouchPointerDistance());
        const baselineScale = Number(pointerState.touchPinchStartScale) || Number(state.scale) || MIN_ZOOM_SCALE;
        if (Number.isFinite(baselineDistance) && baselineDistance > 0 && Number.isFinite(nextDistance) && nextDistance > 0) {
          const rawRatio = nextDistance / baselineDistance;
          const cappedRatio = clamp(
            rawRatio,
            1 / TOUCH_PINCH_MAX_STEP_RATIO,
            TOUCH_PINCH_MAX_STEP_RATIO
          );
          const ratioDelta = Math.abs(cappedRatio - 1);
          const amplifiedRatio = 1 + ((cappedRatio - 1) * TOUCH_PINCH_SENSITIVITY);
          const targetScale = normalizeZoomScale(
            baselineScale * Math.max(TOUCH_PINCH_MIN_RATIO, amplifiedRatio),
            Number(state.scale) || baselineScale
          );
          if (ratioDelta >= TOUCH_PINCH_DEADZONE_RATIO && Math.abs(targetScale - (Number(state.scale) || MIN_ZOOM_SCALE)) >= ZOOM_EPSILON) {
            const pinchFocus = state.showVirtualCursor
              ? (getVirtualCursorZoomFocus() || getCanvasFocusAt(centroid.x, centroid.y, { clampToCanvas: true }))
              : getCanvasFocusAt(centroid.x, centroid.y, { clampToCanvas: true });
            setZoom(targetScale, pinchFocus || undefined);
            panBaseX = Number(state.pan.x) || panBaseX;
            panBaseY = Number(state.pan.y) || panBaseY;
          }
        }

        state.pan.x = Math.round(panBaseX + dx);
        state.pan.y = Math.round(panBaseY + dy);
        applyViewportTransform();
        updateVirtualCursorFromEvent(event);
        refreshTouchPanBaseline();
        return;
      }
      if (event.pointerId !== pointerState.pointerId) return;
      const dx = event.clientX - (pointerState.startClient?.x || 0);
      const dy = event.clientY - (pointerState.startClient?.y || 0);
      const originX = pointerState.panOrigin?.x || 0;
      const originY = pointerState.panOrigin?.y || 0;
      state.pan.x = Math.round(originX + dx);
      state.pan.y = Math.round(originY + dy);
      applyViewportTransform();
      updateVirtualCursorFromEvent(event);
      return;
    }
    if (event.pointerId !== pointerState.pointerId) return;
    updateVirtualCursorFromEvent(event);
    if (pointerState.tool === 'curve') {
      handleCurvePointerMove(event);
      return;
    }

    const position = getPointerPosition(event);
    if (!position) return;
    pointerState.current = position;
    pointerState.path.push(position);

    if (pointerState.tool === 'pen' || pointerState.tool === 'eraser') {
      applyBrushStroke(pointerState.last.x, pointerState.last.y, position.x, position.y);
      pointerState.last = position;
    } else if (pointerState.tool === 'line' || pointerState.tool === 'rect' || pointerState.tool === 'rectFill' || pointerState.tool === 'ellipse' || pointerState.tool === 'ellipseFill') {
      pointerState.preview = { start: pointerState.start, end: position, points: pointerState.path.slice() };
      requestOverlayRender();
    } else if (pointerState.tool === 'selectionMove' || pointerState.tool === 'layerMove') {
      handleSelectionMoveDrag(position);
    } else if (pointerState.tool === 'selectRect' || pointerState.tool === 'selectLasso') {
      pointerState.selectionPreview.points.push(position);
      pointerState.selectionPreview.end = position;
      requestOverlayRender();
    }
  }

  function handlePointerUp(event) {
    if (event.pointerType === 'touch') {
      removeTouchPointer(event);
    }
    if (state.showVirtualCursor && virtualCursorControl.pointerId === event.pointerId) {
      const pointerType = virtualCursorControl.pointerType;
      releaseVirtualCursorPointer();
      if (pointerType !== 'touch') {
        updateVirtualCursorFromEvent(event);
      }
      requestOverlayRender();
      if (pointerType === 'mouse' || pointerType === 'pen') {
        if (typeof document.elementFromPoint === 'function') {
          const target = document.elementFromPoint(event.clientX, event.clientY);
          if (!target || !dom.canvasViewport || !dom.canvasViewport.contains(target)) {
            mouseInsideViewport = false;
            refreshViewportCursorStyle();
          }
        }
        performVirtualCursorAction();
      }
      return;
    }
    if (!pointerState.active) return;
    const isPanTool = pointerState.tool === 'pan';
    const isMultiTouchPan = isPanTool && pointerState.panMode === 'multiTouch';
    if (isPanTool) {
      if (isMultiTouchPan) {
        if (hasActiveMultiTouch()) {
          refreshTouchPanBaseline();
          return;
        }
        finishPanInteraction();
        return;
      }
      if (pointerState.pointerId !== event.pointerId) {
        return;
      }
      finishPanInteraction();
      return;
    }

    if (event.pointerId !== pointerState.pointerId) {
      return;
    }

    updateVirtualCursorFromEvent(event);

    if (dom.canvases.drawing) {
      dom.canvases.drawing.releasePointerCapture(event.pointerId);
    }
    pointerState.active = false;
    detachPointerListeners();

    if (pointerState.tool === 'curve') {
      handleCurvePointerUp(event);
      return;
    }

    hoverPixel = getPointerPosition(event);
    let tool = pointerState.tool;
    const moveState = pointerState.selectionMove;
    const movePending = Boolean(moveState && moveState.hasCleared);

    if ((tool === 'selectionMove' || tool === 'layerMove') && moveState) {
      if (movePending) {
        pointerState.tool = state.tool;
        pointerState.pointerId = null;
        pointerState.preview = null;
        pointerState.selectionPreview = null;
        pointerState.selectionClearedOnDown = false;
        pointerState.current = hoverPixel || pointerState.current;
        pointerState.last = pointerState.current;
        pointerState.path = [];
        pointerState.active = false;
        state.pendingPasteMoveState = moveState;
        updateCanvasControlButtons();
        requestOverlayRender();
        return;
      }
      finalizeSelectionMove();
      tool = pointerState.tool || state.tool;
    }

    if (tool === 'line') {
      drawLine(pointerState.start, pointerState.current);
    } else if (tool === 'rect') {
      drawRectangle(pointerState.start, pointerState.current, false);
    } else if (tool === 'rectFill') {
      drawRectangle(pointerState.start, pointerState.current, true);
    } else if (tool === 'ellipse') {
      drawEllipse(pointerState.start, pointerState.current, false);
    } else if (tool === 'ellipseFill') {
      drawEllipse(pointerState.start, pointerState.current, true);
    } else if (tool === 'selectionMove' || tool === 'layerMove') {
      finalizeSelectionMove();
    } else if (tool === 'selectRect') {
      if (!(pointerState.selectionClearedOnDown && pointerState.path.length <= 1)) {
        createSelectionRect(pointerState.start, pointerState.current);
      }
    } else if (tool === 'selectLasso') {
      const pointCount = pointerState.selectionPreview?.points?.length || 0;
      if (!(pointerState.selectionClearedOnDown && pointCount <= 1)) {
        createSelectionLasso(pointerState.selectionPreview.points);
      }
    }

    if (HISTORY_DRAW_TOOLS.has(tool)) {
      commitHistory();
    } else if (tool === 'selectSame') {
      const target = pointerState.current || pointerState.start;
      if (target) {
        createSelectionByColor(target.x, target.y);
      }
      commitHistory();
    }

    pointerState.pointerId = null;
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.path = [];
    requestOverlayRender();
  }

  function handlePointerCancel(event) {
    if (event.pointerType === 'touch') {
      removeTouchPointer(event);
    }
    if (state.showVirtualCursor && virtualCursorControl.pointerId === event.pointerId) {
      releaseVirtualCursorPointer();
      if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
        mouseInsideViewport = false;
        refreshViewportCursorStyle();
      }
      requestOverlayRender();
      return;
    }
    if (!pointerState.active) {
      return;
    }
    if (pointerState.tool === 'pan') {
      finishPanInteraction();
      return;
    }
    if (pointerState.pointerId === event.pointerId) {
      abortActivePointerInteraction();
    }
  }

  function beginLayerMove(event, startPosition, layer) {
    if (!layer || !dom.canvases.drawing) {
      return false;
    }
    const moveState = createLayerMoveState(layer);
    if (!moveState) {
      return false;
    }

    dom.canvases.drawing.setPointerCapture(event.pointerId);
    hoverPixel = null;
    requestOverlayRender();
    pointerState.active = true;
    pointerState.pointerId = event.pointerId;
    pointerState.tool = 'layerMove';
    pointerState.start = startPosition;
    pointerState.current = startPosition;
    pointerState.last = startPosition;
    pointerState.path = startPosition ? [startPosition] : [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = moveState;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return true;
  }

  function beginSelectionMove(event, startPosition, options = {}) {
    const { reuseOffset = false } = options || {};
    const mask = state.selectionMask;
    const bounds = state.selectionBounds;
    const layer = getActiveLayer();
    if (!mask || !bounds || !layer) {
      return false;
    }
    let moveState = null;
    const pendingMove = state.pendingPasteMoveState;
    if (
      pendingMove
      && pendingMove.layerId
      && layer.id
      && pendingMove.layerId === layer.id
      && pendingMove.bounds
      && bounds
      && pendingMove.bounds.x0 === bounds.x0
      && pendingMove.bounds.y0 === bounds.y0
      && pendingMove.bounds.x1 === bounds.x1
      && pendingMove.bounds.y1 === bounds.y1
    ) {
      moveState = pendingMove;
      state.pendingPasteMoveState = null;
    } else {
      moveState = createSelectionMoveState(layer, bounds, mask);
    }
    if (!moveState) {
      return false;
    }
    moveState.layer = layer;
    moveState.layerId = layer?.id || moveState.layerId || null;
    moveState.offset = moveState.offset || { x: 0, y: 0 };
    if (!reuseOffset) {
      moveState.offset.x = 0;
      moveState.offset.y = 0;
    }

    dom.canvases.drawing.setPointerCapture(event.pointerId);
    hoverPixel = null;
    requestOverlayRender();
    pointerState.active = true;
    pointerState.pointerId = event.pointerId;
    pointerState.tool = 'selectionMove';
    if (reuseOffset && moveState.hasCleared) {
      pointerState.start = {
        x: startPosition.x - moveState.offset.x,
        y: startPosition.y - moveState.offset.y,
      };
    } else {
      pointerState.start = startPosition;
    }
    pointerState.current = startPosition;
    pointerState.last = startPosition;
    pointerState.path = startPosition ? [startPosition] : [];
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionMove = moveState;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    updateCanvasControlButtons();
    return true;
  }

  function isPositionInCurrentSelection(position) {
    if (!position) {
      return false;
    }
    const mask = state.selectionMask;
    const bounds = state.selectionBounds;
    if (!mask || !bounds) {
      return false;
    }
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    if (x < bounds.x0 || x > bounds.x1 || y < bounds.y0 || y > bounds.y1) {
      return false;
    }
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) {
      return false;
    }
    const idx = y * state.width + x;
    return mask[idx] === 1;
  }

  function isPositionInMoveState(position, moveState) {
    if (!position || !moveState || !moveState.bounds || !moveState.mask) {
      return false;
    }
    const x = Math.floor(position.x);
    const y = Math.floor(position.y);
    const width = Math.max(0, Number(moveState.width) || 0);
    const height = Math.max(0, Number(moveState.height) || 0);
    if (width <= 0 || height <= 0) {
      return false;
    }
    const offsetX = Number(moveState.offset?.x) || 0;
    const offsetY = Number(moveState.offset?.y) || 0;
    const originX = (Number(moveState.bounds.x0) || 0) + offsetX;
    const originY = (Number(moveState.bounds.y0) || 0) + offsetY;
    const localX = x - originX;
    const localY = y - originY;
    if (localX < 0 || localY < 0 || localX >= width || localY >= height) {
      return false;
    }
    const localIndex = localY * width + localX;
    return moveState.mask[localIndex] === 1;
  }

  function createSelectionMoveState(layer, bounds, mask) {
    if (!layer || !bounds || !mask) {
      return null;
    }
    const width = Math.max(0, (bounds.x1 ?? 0) - (bounds.x0 ?? 0) + 1);
    const height = Math.max(0, (bounds.y1 ?? 0) - (bounds.y0 ?? 0) + 1);
    if (width <= 0 || height <= 0) {
      return null;
    }

    const size = width * height;
    const localMask = new Uint8Array(size);
    const localIndices = new Int16Array(size);
    const localDirect = new Uint8ClampedArray(size * 4);
    let imageData = null;
    if (ctx.overlay && typeof ctx.overlay.createImageData === 'function') {
      imageData = ctx.overlay.createImageData(width, height);
    } else if (typeof ImageData === 'function') {
      imageData = new ImageData(width, height);
    }

    const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        if (canvasX < 0 || canvasY < 0 || canvasX >= state.width || canvasY >= state.height) {
          continue;
        }
        const canvasIndex = canvasY * state.width + canvasX;
        const localIndex = y * width + x;
        const selected = mask[canvasIndex] === 1 ? 1 : 0;
        localMask[localIndex] = selected;
        const canvasBase = canvasIndex * 4;
        const localBase = localIndex * 4;
        if (selected) {
          localIndices[localIndex] = layer.indices[canvasIndex];
          if (layerDirect) {
            localDirect[localBase] = layerDirect[canvasBase];
            localDirect[localBase + 1] = layerDirect[canvasBase + 1];
            localDirect[localBase + 2] = layerDirect[canvasBase + 2];
            localDirect[localBase + 3] = layerDirect[canvasBase + 3];
          } else {
            localDirect[localBase] = 0;
            localDirect[localBase + 1] = 0;
            localDirect[localBase + 2] = 0;
            localDirect[localBase + 3] = 0;
          }
          if (imageData) {
            const paletteIndex = layer.indices[canvasIndex];
            let color = null;
            if (paletteIndex >= 0 && state.palette[paletteIndex]) {
              color = state.palette[paletteIndex];
            } else {
              color = {
                r: layerDirect ? layerDirect[canvasBase] : 0,
                g: layerDirect ? layerDirect[canvasBase + 1] : 0,
                b: layerDirect ? layerDirect[canvasBase + 2] : 0,
                a: layerDirect ? layerDirect[canvasBase + 3] : 0,
              };
            }
            if (color) {
              imageData.data[localBase] = color.r;
              imageData.data[localBase + 1] = color.g;
              imageData.data[localBase + 2] = color.b;
              imageData.data[localBase + 3] = color.a;
            }
          }
        } else {
          localIndices[localIndex] = -1;
          if (imageData) {
            imageData.data[localBase] = 0;
            imageData.data[localBase + 1] = 0;
            imageData.data[localBase + 2] = 0;
            imageData.data[localBase + 3] = 0;
          }
        }
      }
    }

    return {
      layer,
      bounds: { ...bounds },
      width,
      height,
      mask: localMask,
      indices: localIndices,
      direct: localDirect,
      imageData,
      offset: { x: 0, y: 0 },
      hasCleared: false,
      applySelectionOnFinalize: true,
    };
  }

  function selectionMaskHasPixels(mask) {
    if (!mask) {
      return false;
    }
    for (let i = 0; i < mask.length; i += 1) {
      if (mask[i] === 1) {
        return true;
      }
    }
    return false;
  }

  function snapshotSelectionForClipboard() {
    if (pointerState.active) {
      return null;
    }
    const mask = state.selectionMask;
    const bounds = state.selectionBounds;
    if (!mask || !bounds) {
      return null;
    }
    const layer = getActiveLayer();
    if (!layer) {
      return null;
    }
    const moveState = createSelectionMoveState(layer, bounds, mask);
    if (!moveState) {
      return null;
    }
    if (!selectionMaskHasPixels(moveState.mask)) {
      return null;
    }
    return moveState;
  }

  function cloneImageData(imageData) {
    if (!imageData) {
      return null;
    }
    const width = Number(imageData.width) || 0;
    const height = Number(imageData.height) || 0;
    const source = imageData.data instanceof Uint8ClampedArray
      ? imageData.data
      : new Uint8ClampedArray(imageData.data || []);

    if (typeof ImageData === 'function') {
      try {
        const clone = new ImageData(width, height);
        clone.data.set(source);
        return clone;
      } catch (error) {
        try {
          return new ImageData(new Uint8ClampedArray(source), width, height);
        } catch (innerError) {
          // fall through
        }
      }
    }

    if (ctx.overlay && typeof ctx.overlay.createImageData === 'function') {
      const clone = ctx.overlay.createImageData(width, height);
      clone.data.set(source);
      return clone;
    }

    return null;
  }

  function createBlankImageData(width, height) {
    const w = Math.max(0, Math.floor(width) || 0);
    const h = Math.max(0, Math.floor(height) || 0);
    if (w === 0 || h === 0) {
      return null;
    }
    if (ctx.overlay && typeof ctx.overlay.createImageData === 'function') {
      return ctx.overlay.createImageData(w, h);
    }
    if (typeof ImageData === 'function') {
      try {
        return new ImageData(w, h);
      } catch (error) {
        try {
          return new ImageData(new Uint8ClampedArray(w * h * 4), w, h);
        } catch (innerError) {
          return null;
        }
      }
    }
    return null;
  }

  function populateImageDataFromPixels(imageData, indices, direct, mask) {
    if (!imageData) {
      return;
    }
    const data = imageData.data;
    if (!(data instanceof Uint8ClampedArray)) {
      return;
    }
    const palette = state.palette;
    const size = mask ? mask.length : 0;
    for (let i = 0; i < size; i += 1) {
      const base = i * 4;
      if (mask[i] === 1) {
        const paletteIndex = indices instanceof Int16Array ? indices[i] : -1;
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        if (paletteIndex >= 0 && palette[paletteIndex]) {
          const color = palette[paletteIndex];
          r = color.r;
          g = color.g;
          b = color.b;
          a = color.a;
        } else if (direct instanceof Uint8ClampedArray) {
          r = direct[base];
          g = direct[base + 1];
          b = direct[base + 2];
          a = direct[base + 3];
        }
        data[base] = r;
        data[base + 1] = g;
        data[base + 2] = b;
        data[base + 3] = a;
      } else {
        data[base] = 0;
        data[base + 1] = 0;
        data[base + 2] = 0;
        data[base + 3] = 0;
      }
    }
  }

  function storeSelectionInClipboard(moveState) {
    if (!moveState) {
      internalClipboard.selection = null;
      return;
    }
    internalClipboard.selection = {
      width: moveState.width,
      height: moveState.height,
      mask: new Uint8Array(moveState.mask),
      indices: new Int16Array(moveState.indices),
      direct: new Uint8ClampedArray(moveState.direct),
      bounds: { ...moveState.bounds },
      imageData: moveState.imageData ? cloneImageData(moveState.imageData) : null,
    };
  }

  function copySelection() {
    const moveState = snapshotSelectionForClipboard();
    if (!moveState) {
      updateCanvasControlButtons();
      return false;
    }
    storeSelectionInClipboard(moveState);
    state.pendingPasteMoveState = null;
    updateCanvasControlButtons();
    return true;
  }

  function createMoveStateFromClipboard(clip, bounds, layer) {
    if (!clip) {
      return null;
    }
    const width = Math.max(0, Math.floor(Number(clip.width) || 0));
    const height = Math.max(0, Math.floor(Number(clip.height) || 0));
    if (width === 0 || height === 0) {
      return null;
    }
    const size = width * height;
    const mask = clip.mask instanceof Uint8Array && clip.mask.length === size
      ? new Uint8Array(clip.mask)
      : new Uint8Array(size);
    const indices = clip.indices instanceof Int16Array && clip.indices.length === size
      ? new Int16Array(clip.indices)
      : new Int16Array(size);
    const direct = clip.direct instanceof Uint8ClampedArray && clip.direct.length === size * 4
      ? new Uint8ClampedArray(clip.direct)
      : new Uint8ClampedArray(size * 4);
    let imageData = null;
    if (clip.imageData) {
      imageData = cloneImageData(clip.imageData);
    } else {
      imageData = createBlankImageData(width, height);
      if (imageData) {
        populateImageDataFromPixels(imageData, indices, direct, mask);
      }
    }
    return {
      layer,
      layerId: layer?.id || null,
      bounds: { ...bounds },
      width,
      height,
      mask,
      indices,
      direct,
      imageData,
      offset: { x: 0, y: 0 },
      hasCleared: false,
      restoreIndices: null,
      restoreDirect: null,
      applySelectionOnFinalize: true,
    };
  }

  function createPasteRestoreSnapshot(layer, bounds, width, height) {
    const snappedWidth = Math.max(0, Math.floor(width) || 0);
    const snappedHeight = Math.max(0, Math.floor(height) || 0);
    if (snappedWidth === 0 || snappedHeight === 0) {
      return { indices: null, direct: null };
    }
    const size = snappedWidth * snappedHeight;
    const indices = new Int16Array(size);
    let direct = null;
    const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    if (layerDirect) {
      direct = new Uint8ClampedArray(size * 4);
    }
    for (let y = 0; y < snappedHeight; y += 1) {
      for (let x = 0; x < snappedWidth; x += 1) {
        const localIndex = y * snappedWidth + x;
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        if (canvasX < 0 || canvasY < 0 || canvasX >= state.width || canvasY >= state.height) {
          indices[localIndex] = -1;
          if (direct) {
            const localBase = localIndex * 4;
            direct[localBase] = 0;
            direct[localBase + 1] = 0;
            direct[localBase + 2] = 0;
            direct[localBase + 3] = 0;
          }
          continue;
        }
        const canvasIndex = canvasY * state.width + canvasX;
        indices[localIndex] = layer.indices[canvasIndex];
        if (direct) {
          const localBase = localIndex * 4;
          const canvasBase = canvasIndex * 4;
          direct[localBase] = layerDirect[canvasBase];
          direct[localBase + 1] = layerDirect[canvasBase + 1];
          direct[localBase + 2] = layerDirect[canvasBase + 2];
          direct[localBase + 3] = layerDirect[canvasBase + 3];
        }
      }
    }
    return { indices, direct };
  }

  function createLayerMoveState(layer) {
    if (!layer) {
      return null;
    }
    const width = state.width;
    const height = state.height;
    if (width <= 0 || height <= 0) {
      return null;
    }
    const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const bounds = { x0: width, y0: height, x1: -1, y1: -1 };
    const palette = state.palette;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const paletteIndex = layer.indices[idx];
        let alpha = 0;
        if (paletteIndex >= 0 && palette[paletteIndex]) {
          alpha = palette[paletteIndex].a;
        } else if (layerDirect) {
          const base = idx * 4;
          alpha = layerDirect[base + 3];
        }
        if (paletteIndex >= 0 || alpha > 0) {
          if (x < bounds.x0) bounds.x0 = x;
          if (y < bounds.y0) bounds.y0 = y;
          if (x > bounds.x1) bounds.x1 = x;
          if (y > bounds.y1) bounds.y1 = y;
        }
      }
    }

    if (bounds.x1 < bounds.x0 || bounds.y1 < bounds.y0) {
      return null;
    }

    const moveWidth = bounds.x1 - bounds.x0 + 1;
    const moveHeight = bounds.y1 - bounds.y0 + 1;
    const size = moveWidth * moveHeight;
    const mask = new Uint8Array(size);
    const indices = new Int16Array(size);
    const direct = new Uint8ClampedArray(size * 4);
    const imageData = createBlankImageData(moveWidth, moveHeight);

    for (let y = 0; y < moveHeight; y += 1) {
      for (let x = 0; x < moveWidth; x += 1) {
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        const canvasIndex = canvasY * width + canvasX;
        const localIndex = y * moveWidth + x;
        const paletteIndex = layer.indices[canvasIndex];
        const canvasBase = canvasIndex * 4;
        const localBase = localIndex * 4;
        let hasPixel = false;
        if (paletteIndex >= 0) {
          indices[localIndex] = paletteIndex;
          hasPixel = true;
          if (layerDirect) {
            direct[localBase] = layerDirect[canvasBase];
            direct[localBase + 1] = layerDirect[canvasBase + 1];
            direct[localBase + 2] = layerDirect[canvasBase + 2];
            direct[localBase + 3] = layerDirect[canvasBase + 3];
          }
          if (imageData && palette[paletteIndex]) {
            const color = palette[paletteIndex];
            imageData.data[localBase] = color.r;
            imageData.data[localBase + 1] = color.g;
            imageData.data[localBase + 2] = color.b;
            imageData.data[localBase + 3] = color.a;
          } else if (imageData) {
            imageData.data[localBase] = 0;
            imageData.data[localBase + 1] = 0;
            imageData.data[localBase + 2] = 0;
            imageData.data[localBase + 3] = 0;
          }
        } else if (layerDirect && layerDirect[canvasBase + 3] > 0) {
          indices[localIndex] = -1;
          direct[localBase] = layerDirect[canvasBase];
          direct[localBase + 1] = layerDirect[canvasBase + 1];
          direct[localBase + 2] = layerDirect[canvasBase + 2];
          direct[localBase + 3] = layerDirect[canvasBase + 3];
          hasPixel = true;
          if (imageData) {
            imageData.data[localBase] = direct[localBase];
            imageData.data[localBase + 1] = direct[localBase + 1];
            imageData.data[localBase + 2] = direct[localBase + 2];
            imageData.data[localBase + 3] = direct[localBase + 3];
          }
        } else {
          indices[localIndex] = -1;
          if (imageData) {
            imageData.data[localBase] = 0;
            imageData.data[localBase + 1] = 0;
            imageData.data[localBase + 2] = 0;
            imageData.data[localBase + 3] = 0;
          }
        }
        if (hasPixel) {
          mask[localIndex] = 1;
        }
      }
    }

    return {
      layer,
      layerId: layer.id,
      bounds,
      width: moveWidth,
      height: moveHeight,
      mask,
      indices,
      direct,
      imageData,
      offset: { x: 0, y: 0 },
      hasCleared: false,
      restoreIndices: null,
      restoreDirect: null,
      applySelectionOnFinalize: true,
    };
  }

  function cutSelection() {
    const moveState = snapshotSelectionForClipboard();
    if (!moveState) {
      updateCanvasControlButtons();
      return false;
    }
    storeSelectionInClipboard(moveState);
    state.pendingPasteMoveState = null;
    beginHistory('selectionCut');
    clearSelectionSourcePixels(moveState);
    commitHistory();
    requestOverlayRender();
    updateCanvasControlButtons();
    return true;
  }

  function pasteSelection() {
    if (pointerState.active) {
      updateCanvasControlButtons();
      return false;
    }
    const clip = internalClipboard.selection;
    if (!clip) {
      updateCanvasControlButtons();
      return false;
    }
    const layer = getActiveLayer();
    if (!layer) {
      updateCanvasControlButtons();
      return false;
    }
    const width = Math.max(0, Math.floor(clip.width) || 0);
    const height = Math.max(0, Math.floor(clip.height) || 0);
    if (width === 0 || height === 0) {
      updateCanvasControlButtons();
      return false;
    }
    const maxX0 = Math.max(0, state.width - width);
    const maxY0 = Math.max(0, state.height - height);
    let x0 = Number.isFinite(clip.bounds?.x0) ? Math.round(clip.bounds.x0) : 0;
    let y0 = Number.isFinite(clip.bounds?.y0) ? Math.round(clip.bounds.y0) : 0;
    x0 = clamp(x0, 0, maxX0);
    y0 = clamp(y0, 0, maxY0);
    const bounds = { x0, y0, x1: x0 + width - 1, y1: y0 + height - 1 };
    const moveState = createMoveStateFromClipboard(clip, bounds, layer);
    if (!moveState) {
      updateCanvasControlButtons();
      return false;
    }
    const restoreSnapshot = createPasteRestoreSnapshot(layer, bounds, width, height);
    moveState.restoreIndices = restoreSnapshot.indices;
    moveState.restoreDirect = restoreSnapshot.direct;
    moveState.layer = layer;
    moveState.layerId = layer?.id || null;
    moveState.offset.x = 0;
    moveState.offset.y = 0;
    moveState.hasCleared = false;
    state.pendingPasteMoveState = moveState;
    beginHistory('selectionPaste');
    const result = placeSelectionPixels(moveState, 0, 0);
    let success = false;
    if (result.placed && result.bounds) {
      markHistoryDirty();
      state.selectionMask = result.mask;
      state.selectionBounds = result.bounds;
      internalClipboard.selection.bounds = { ...result.bounds };
      markDirtyRect(result.bounds.x0, result.bounds.y0, result.bounds.x1, result.bounds.y1);
      requestRender();
      requestOverlayRender();
      success = true;
    }
    commitHistory();
    if (!success) {
      state.pendingPasteMoveState = null;
    }
    updateCanvasControlButtons();
    return success;
  }

  function handleSelectionMoveDrag(position) {
    const moveState = pointerState.selectionMove;
    if (!moveState) {
      return;
    }
    const start = pointerState.start || position;
    const offsetX = position.x - start.x;
    const offsetY = position.y - start.y;
    if (!moveState.hasCleared && (offsetX !== 0 || offsetY !== 0)) {
      beginHistory('selectionMove');
      clearSelectionSourcePixels(moveState);
    }
    if (moveState.offset.x === offsetX && moveState.offset.y === offsetY && moveState.hasCleared) {
      return;
    }
    moveState.offset.x = offsetX;
    moveState.offset.y = offsetY;
    if (moveState.hasCleared) {
      requestOverlayRender();
    }
  }

  function clearSelectionSourcePixels(moveState) {
    const { layer, bounds, mask, width, height } = moveState;
    if (!layer) {
      return;
    }
    const restoreIndices = moveState.restoreIndices instanceof Int16Array ? moveState.restoreIndices : null;
    const restoreDirect = moveState.restoreDirect instanceof Uint8ClampedArray ? moveState.restoreDirect : null;
    let layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    if (!layerDirect && restoreDirect) {
      layerDirect = ensureLayerDirect(layer);
    }
    let modified = false;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const localIndex = y * width + x;
        if (mask[localIndex] !== 1) continue;
        const canvasX = bounds.x0 + x;
        const canvasY = bounds.y0 + y;
        if (canvasX < 0 || canvasY < 0 || canvasX >= state.width || canvasY >= state.height) continue;
        const canvasIndex = canvasY * state.width + canvasX;
        const base = canvasIndex * 4;
        const previousIndex = layer.indices[canvasIndex];
        let previousAlpha = 0;
        if (layerDirect) {
          previousAlpha = layerDirect[base + 3];
        } else if (previousIndex >= 0 && state.palette[previousIndex]) {
          previousAlpha = state.palette[previousIndex].a;
        }
        let nextIndex = -1;
        let nextAlpha = 0;
        if (restoreIndices) {
          nextIndex = restoreIndices[localIndex] ?? -1;
          layer.indices[canvasIndex] = nextIndex;
        } else {
          layer.indices[canvasIndex] = -1;
        }
        if (layerDirect) {
          if (restoreDirect) {
            const localBase = localIndex * 4;
            layerDirect[base] = restoreDirect[localBase];
            layerDirect[base + 1] = restoreDirect[localBase + 1];
            layerDirect[base + 2] = restoreDirect[localBase + 2];
            layerDirect[base + 3] = restoreDirect[localBase + 3];
            nextAlpha = restoreDirect[localBase + 3];
          } else {
            layerDirect[base] = 0;
            layerDirect[base + 1] = 0;
            layerDirect[base + 2] = 0;
            layerDirect[base + 3] = 0;
            nextAlpha = 0;
          }
        } else {
          if (nextIndex >= 0 && state.palette[nextIndex]) {
            nextAlpha = state.palette[nextIndex].a;
          } else {
            nextAlpha = 0;
          }
        }
        if (layer.indices[canvasIndex] !== previousIndex || nextAlpha !== previousAlpha) {
          modified = true;
        }
      }
    }
    if (modified) {
      markHistoryDirty();
      markDirtyRect(bounds.x0, bounds.y0, bounds.x1, bounds.y1);
    }
    moveState.hasCleared = true;
    requestRender();
    updateCanvasControlButtons();
  }

  function finalizeSelectionMove() {
    const moveState = pointerState.selectionMove || state.pendingPasteMoveState;
    if (!moveState) {
      pointerState.tool = state.tool;
      return;
    }
    if (!moveState.hasCleared) {
      pointerState.tool = state.tool;
      pointerState.selectionMove = null;
      state.pendingPasteMoveState = null;
      return;
    }

    const { offset } = moveState;
    const applySelection = moveState.applySelectionOnFinalize !== false;
    const result = placeSelectionPixels(moveState, offset.x, offset.y);
    pointerState.selectionMove = null;
    pointerState.tool = state.tool;
    state.pendingPasteMoveState = null;

    if (result.placed) {
      if (result.bounds) {
        markDirtyRect(result.bounds.x0, result.bounds.y0, result.bounds.x1, result.bounds.y1);
      }
      if (applySelection) {
        state.selectionMask = result.mask;
        state.selectionBounds = result.bounds;
        if (internalClipboard.selection && result.bounds) {
          internalClipboard.selection.bounds = { ...result.bounds };
        }
      } else {
        state.selectionMask = null;
        state.selectionBounds = null;
      }
    } else {
      if (applySelection) {
        clearSelection();
      } else {
        state.selectionMask = null;
        state.selectionBounds = null;
      }
    }

    markHistoryDirty();
    requestRender();
    requestOverlayRender();
    commitHistory();
    updateCanvasControlButtons();
  }

  function hasPendingSelectionMove() {
    return Boolean(getPendingSelectionMoveState());
  }

  function getPendingSelectionMoveState() {
    if (pointerState.selectionMove && pointerState.selectionMove.hasCleared) {
      return pointerState.selectionMove;
    }
    if (state.pendingPasteMoveState && state.pendingPasteMoveState.hasCleared) {
      return state.pendingPasteMoveState;
    }
    return null;
  }

  function confirmPendingSelectionMove() {
    const moveState = getPendingSelectionMoveState();
    if (!moveState) {
      return;
    }
    pointerState.selectionMove = moveState;
    finalizeSelectionMove();
    clearSelection();
    updateCanvasControlButtons();
  }

  function cancelPendingSelectionMove() {
    const moveState = getPendingSelectionMoveState();
    if (!moveState) {
      return;
    }
    pointerState.selectionMove = moveState;
    pointerState.selectionMove = null;
    pointerState.tool = state.tool;
    state.pendingPasteMoveState = null;
    pointerState.pointerId = null;
    pointerState.active = false;
    pointerState.preview = null;
    pointerState.selectionPreview = null;
    pointerState.selectionClearedOnDown = false;
    pointerState.path = [];
    rollbackPendingHistory({ reRender: true });
    clearSelection();
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function placeSelectionPixels(moveState, offsetX, offsetY) {
    const { layer, bounds, mask, indices, direct, width, height } = moveState;
    const newMask = new Uint8Array(state.width * state.height);
    const newBounds = { x0: state.width, y0: state.height, x1: -1, y1: -1 };
    let placed = false;

    const targetDirect = direct ? ensureLayerDirect(layer) : null;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const localIndex = y * width + x;
        if (mask[localIndex] !== 1) continue;
        const targetX = bounds.x0 + x + offsetX;
        const targetY = bounds.y0 + y + offsetY;
        if (targetX < 0 || targetY < 0 || targetX >= state.width || targetY >= state.height) {
          continue;
        }
        const targetIndex = targetY * state.width + targetX;
        const targetBase = targetIndex * 4;
        const localBase = localIndex * 4;
        layer.indices[targetIndex] = indices[localIndex];
        if (targetDirect) {
          targetDirect[targetBase] = direct[localBase];
          targetDirect[targetBase + 1] = direct[localBase + 1];
          targetDirect[targetBase + 2] = direct[localBase + 2];
          targetDirect[targetBase + 3] = direct[localBase + 3];
        }
        newMask[targetIndex] = 1;
        if (!placed) placed = true;
        if (targetX < newBounds.x0) newBounds.x0 = targetX;
        if (targetY < newBounds.y0) newBounds.y0 = targetY;
        if (targetX > newBounds.x1) newBounds.x1 = targetX;
        if (targetY > newBounds.y1) newBounds.y1 = targetY;
      }
    }

    if (!placed) {
      return { placed: false, mask: null, bounds: null };
    }

    return { placed: true, mask: newMask, bounds: newBounds };
  }

  function drawSelectionMovePreview(moveState) {
    if (!moveState || !moveState.hasCleared) {
      return;
    }
    const originX = moveState.bounds.x0 + moveState.offset.x;
    const originY = moveState.bounds.y0 + moveState.offset.y;

    if (ctx.overlay && moveState.imageData) {
      ctx.overlay.putImageData(moveState.imageData, originX, originY);
    }

    if (!ctx.selection) {
      return;
    }

    strokeSelectionPath((pathCtx, scale) => {
      traceSelectionMoveOutline(pathCtx, moveState, originX, originY, scale);
    }, { translateHalf: true });
  }

  function traceSelectionMoveOutline(pathCtx, moveState, originX, originY, scale) {
    const { width, height, mask } = moveState;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const localIndex = y * width + x;
        if (mask[localIndex] !== 1) continue;
        const globalX = originX + x;
        const globalY = originY + y;
        if (globalX < 0 || globalY < 0 || globalX >= state.width || globalY >= state.height) {
          continue;
        }

        const topFilled = selectionMoveNeighborFilled(moveState, x, y - 1, originX, originY);
        const bottomFilled = selectionMoveNeighborFilled(moveState, x, y + 1, originX, originY);
        const leftFilled = selectionMoveNeighborFilled(moveState, x - 1, y, originX, originY);
        const rightFilled = selectionMoveNeighborFilled(moveState, x + 1, y, originX, originY);

        const sx = globalX * scale;
        const sy = globalY * scale;
        const ex = sx + scale;
        const ey = sy + scale;

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

  function selectionMoveNeighborFilled(moveState, localX, localY, originX, originY) {
    if (localX < 0 || localY < 0 || localX >= moveState.width || localY >= moveState.height) {
      return false;
    }
    const localIndex = localY * moveState.width + localX;
    if (moveState.mask[localIndex] !== 1) {
      return false;
    }
    const globalX = originX + localX;
    const globalY = originY + localY;
    if (globalX < 0 || globalY < 0 || globalX >= state.width || globalY >= state.height) {
      return false;
    }
    return true;
  }

  function getPointerPosition(event) {
    const rect = dom.canvases.drawing.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * state.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * state.height);
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
    return { x, y };
  }

  function applyBrushStroke(x0, y0, x1, y1) {
    const layer = getActiveLayer();
    if (!layer) return;
    const points = bresenhamLine(x0, y0, x1, y1);
    points.forEach(point => stampBrush(layer, point.x, point.y));
    requestRender();
  }

  function setPixel(layer, x, y) {
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return;
    if (state.selectionMask && state.selectionMask[y * state.width + x] !== 1) return;
    const index = y * state.width + x;
    const base = index * 4;
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;

    if (pointerState.tool === 'eraser') {
      if (layer.indices[index] === -1 && (!direct || direct[base + 3] === 0)) {
        return;
      }
      layer.indices[index] = -1;
      if (direct) {
        direct[base] = 0;
        direct[base + 1] = 0;
        direct[base + 2] = 0;
        direct[base + 3] = 0;
      }
      markHistoryDirty();
      markDirtyPixel(x, y);
      return;
    }

    const paletteIndex = clamp(state.activePaletteIndex, 0, state.palette.length - 1);
    if (layer.indices[index] === paletteIndex) {
      return;
    }
    layer.indices[index] = paletteIndex;
    if (direct) {
      direct[base] = 0;
      direct[base + 1] = 0;
      direct[base + 2] = 0;
      direct[base + 3] = 0;
    }
    markHistoryDirty();
    markDirtyPixel(x, y);
  }

  function getBrushOffsets(size) {
    const base = clamp(Math.round(size || 1), 1, 64);
    let offsets = brushOffsetCache.get(base);
    if (!offsets) {
      const halfDown = Math.floor(base / 2);
      const halfUp = Math.ceil(base / 2);
      offsets = [];
      for (let dy = -halfDown; dy < halfUp; dy += 1) {
        for (let dx = -halfDown; dx < halfUp; dx += 1) {
          offsets.push({ dx, dy });
        }
      }
      brushOffsetCache.set(base, offsets);
    }
    return offsets;
  }

  function forEachBrushOffset(callback, sizeOverride) {
    const baseSize = sizeOverride ?? state.brushSize;
    const offsets = getBrushOffsets(baseSize || 1);
    for (let i = 0; i < offsets.length; i += 1) {
      const { dx, dy } = offsets[i];
      callback(dx, dy);
    }
  }

  function stampBrush(layer, cx, cy) {
    forEachBrushOffset((dx, dy) => setPixel(layer, cx + dx, cy + dy));
  }

  function drawLine(start, end) {
    const layer = getActiveLayer();
    if (!layer) return;
    const points = bresenhamLine(start.x, start.y, end.x, end.y);
    points.forEach(point => stampBrush(layer, point.x, point.y));
    requestRender();
  }

  function drawRectangle(start, end, filled) {
    const layer = getActiveLayer();
    if (!layer) return;
    const x0 = Math.min(start.x, end.x);
    const x1 = Math.max(start.x, end.x);
    const y0 = Math.min(start.y, end.y);
    const y1 = Math.max(start.y, end.y);

    if (filled) {
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          stampBrush(layer, x, y);
        }
      }
    } else {
      for (let x = x0; x <= x1; x += 1) {
        stampBrush(layer, x, y0);
        stampBrush(layer, x, y1);
      }
      for (let y = y0; y <= y1; y += 1) {
        stampBrush(layer, x0, y);
        stampBrush(layer, x1, y);
      }
    }
    requestRender();
  }

  function drawEllipse(start, end, filled) {
    const layer = getActiveLayer();
    if (!layer) return;
    const cx = Math.round((start.x + end.x) / 2);
    const cy = Math.round((start.y + end.y) / 2);
    const rx = Math.round(Math.abs(end.x - start.x) / 2);
    const ry = Math.round(Math.abs(end.y - start.y) / 2);
    if (rx === 0 && ry === 0) {
      stampBrush(layer, cx, cy);
      requestRender();
      return;
    }
    drawEllipsePixels(cx, cy, rx, ry, filled, (x, y) => stampBrush(layer, x, y));
    requestRender();
  }

  function drawEllipsePixels(cx, cy, rx, ry, filled, plotPixel) {
    if (rx < 0 || ry < 0) return;
    if (rx === 0 && ry === 0) {
      plotPixel(cx, cy);
      return;
    }
    if (rx === 0) {
      for (let y = cy - ry; y <= cy + ry; y += 1) {
        plotPixel(cx, y);
      }
      return;
    }
    if (ry === 0) {
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        plotPixel(x, cy);
      }
      return;
    }

    const fillRanges = filled ? new Map() : null;
    const rxSq = rx * rx;
    const rySq = ry * ry;
    let x = 0;
    let y = ry;
    let px = 0;
    let py = 2 * rxSq * y;

    const recordFillRange = (yRow, xValue) => {
      if (!fillRanges) return;
      const entry = fillRanges.get(yRow);
      if (entry) {
        entry.min = Math.min(entry.min, xValue);
        entry.max = Math.max(entry.max, xValue);
      } else {
        fillRanges.set(yRow, { min: xValue, max: xValue });
      }
    };

    const plotSymmetric = (offsetX, offsetY) => {
      const coords = [
        { x: cx + offsetX, y: cy + offsetY },
        { x: cx - offsetX, y: cy + offsetY },
        { x: cx + offsetX, y: cy - offsetY },
        { x: cx - offsetX, y: cy - offsetY },
      ];
      coords.forEach(point => {
        plotPixel(point.x, point.y);
        recordFillRange(point.y, point.x);
      });
    };

    let p1 = rySq - (rxSq * ry) + (0.25 * rxSq);
    while (px < py) {
      plotSymmetric(x, y);
      x += 1;
      px += 2 * rySq;
      if (p1 < 0) {
        p1 += rySq + px;
      } else {
        y -= 1;
        py -= 2 * rxSq;
        p1 += rySq + px - py;
      }
    }

    let p2 = (rySq * (x + 0.5) ** 2) + (rxSq * (y - 1) ** 2) - (rxSq * rySq);
    while (y >= 0) {
      plotSymmetric(x, y);
      y -= 1;
      py -= 2 * rxSq;
      if (p2 > 0) {
        p2 += rxSq - py;
      } else {
        x += 1;
        px += 2 * rySq;
        p2 += rxSq - py + px;
      }
    }

    if (fillRanges) {
      fillRanges.forEach((range, row) => {
        for (let col = range.min; col <= range.max; col += 1) {
          plotPixel(col, row);
        }
      });
    }
  }

  function floodFill(x, y) {
    const layer = getActiveLayer();
    if (!layer) return;
    const targetColor = sampleLayerColor(layer, x, y);
    const replacement = { type: 'index', index: state.activePaletteIndex };

    if (colorsEqual(targetColor, replacement)) {
      return;
    }

    const visited = new Uint8Array(state.width * state.height);
    const stack = [[x, y]];

    while (stack.length > 0) {
      const [px, py] = stack.pop();
      if (px < 0 || py < 0 || px >= state.width || py >= state.height) continue;
      const idx = py * state.width + px;
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (state.selectionMask && state.selectionMask[idx] !== 1) continue;
      const current = sampleLayerColor(layer, px, py);
      if (!colorMatches(current, targetColor)) continue;
      setPixel(layer, px, py);
      stack.push([px + 1, py]);
      stack.push([px - 1, py]);
      stack.push([px, py + 1]);
      stack.push([px, py - 1]);
    }
    requestRender();
  }

  function sampleColor(x, y) {
    const { color, mode, index } = sampleCompositeColor(x, y);
    if (!color) return;
    if (mode === 'index' && typeof index === 'number' && index >= 0) {
      setActivePaletteIndex(index);
    } else {
      const normalized = normalizeColorValue(color);
      const activeIndex = clamp(state.activePaletteIndex, 0, state.palette.length - 1);
      if (state.palette[activeIndex]) {
        Object.assign(state.palette[activeIndex], normalized);
        applyPaletteChange();
        renderPalette();
      }
    }
    state.colorMode = 'index';
    updateColorTabSwatch();
  }

  function sampleCompositeColor(x, y) {
    const layers = getActiveFrame().layers;
    let color = null;
    let mode = 'rgb';
    let index = -1;
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const layer = layers[i];
      if (!layer.visible) continue;
      const idx = y * state.width + x;
      if (layer.indices[idx] >= 0) {
        color = state.palette[layer.indices[idx]];
        mode = 'index';
        index = layer.indices[idx];
        break;
      }
      const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      const base = idx * 4;
      const a = direct ? direct[base + 3] : 0;
      if (a > 0) {
        color = {
          r: direct ? direct[base] : 0,
          g: direct ? direct[base + 1] : 0,
          b: direct ? direct[base + 2] : 0,
          a,
        };
        mode = 'rgb';
        break;
      }
    }
    return { color, mode, index };
  }

  function sampleCompositeColorExcludingLayer(x, y, excludedLayerId) {
    const frame = getActiveFrame();
    if (!frame) {
      return null;
    }
    const idx = y * state.width + x;
    for (let i = frame.layers.length - 1; i >= 0; i -= 1) {
      const layer = frame.layers[i];
      if (!layer.visible || layer.id === excludedLayerId) {
        continue;
      }
      if (layer.indices[idx] >= 0) {
        const paletteColor = state.palette[layer.indices[idx]];
        if (paletteColor) {
          const normalized = normalizeColorValue(paletteColor);
          return normalized;
        }
      }
      const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      if (direct) {
        const base = idx * 4;
        const alpha = direct[base + 3];
        if (alpha > 0) {
          return {
            r: direct[base],
            g: direct[base + 1],
            b: direct[base + 2],
            a: alpha,
          };
        }
      }
    }
    return null;
  }

  function sampleLayerColor(layer, x, y) {
    const idx = y * state.width + x;
    if (layer.indices[idx] >= 0) {
      return { type: 'index', index: layer.indices[idx] };
    }
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const base = idx * 4;
    return {
      type: 'rgb',
      color: {
        r: direct ? direct[base] : 0,
        g: direct ? direct[base + 1] : 0,
        b: direct ? direct[base + 2] : 0,
        a: direct ? direct[base + 3] : 0,
      },
    };
  }

  function colorsEqual(target, replacement) {
    if (!target || !replacement) return false;
    if (target.type === 'index' && replacement.type === 'index') {
      return target.index === replacement.index;
    }
    if (target.type === 'rgb' && replacement.type === 'direct') {
      const c = replacement.color;
      return target.color.r === c.r && target.color.g === c.g && target.color.b === c.b && target.color.a === c.a;
    }
    return false;
  }

  function colorMatches(target, sample) {
    if (!sample || !target) return false;
    if (sample.type === 'index' && target.type === 'index') {
      return sample.index === target.index;
    }
    if (sample.type === 'rgb' && target.type === 'rgb') {
      return sample.color.r === target.color.r && sample.color.g === target.color.g && sample.color.b === target.color.b && sample.color.a === target.color.a;
    }
    return false;
  }

  function createSelectionRect(start, end) {
    const layer = getActiveLayer();
    if (!layer) {
      clearSelection();
      return;
    }
    const x0 = clamp(Math.min(start.x, end.x), 0, state.width - 1);
    const x1 = clamp(Math.max(start.x, end.x), 0, state.width - 1);
    const y0 = clamp(Math.min(start.y, end.y), 0, state.height - 1);
    const y1 = clamp(Math.max(start.y, end.y), 0, state.height - 1);
    const mask = new Uint8Array(state.width * state.height);
    const bounds = { x0: state.width, y0: state.height, x1: -1, y1: -1 };

    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (!layerHasDrawablePixel(layer, x, y)) continue;
        const idx = y * state.width + x;
        mask[idx] = 1;
        if (x < bounds.x0) bounds.x0 = x;
        if (y < bounds.y0) bounds.y0 = y;
        if (x > bounds.x1) bounds.x1 = x;
        if (y > bounds.y1) bounds.y1 = y;
      }
    }

    if (bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
      clearSelection();
      return;
    }

    state.selectionMask = mask;
    state.selectionBounds = bounds;
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function createSelectionLasso(points) {
    if (!points || points.length < 3) return;
    const layer = getActiveLayer();
    if (!layer) {
      clearSelection();
      return;
    }
    const mask = new Uint8Array(state.width * state.height);
    const searchBounds = {
      x0: state.width,
      y0: state.height,
      x1: 0,
      y1: 0,
    };
    for (const point of points) {
      searchBounds.x0 = Math.min(searchBounds.x0, point.x);
      searchBounds.y0 = Math.min(searchBounds.y0, point.y);
      searchBounds.x1 = Math.max(searchBounds.x1, point.x);
      searchBounds.y1 = Math.max(searchBounds.y1, point.y);
    }
    searchBounds.x0 = clamp(searchBounds.x0, 0, state.width - 1);
    searchBounds.y0 = clamp(searchBounds.y0, 0, state.height - 1);
    searchBounds.x1 = clamp(searchBounds.x1, 0, state.width - 1);
    searchBounds.y1 = clamp(searchBounds.y1, 0, state.height - 1);

    const selectedBounds = { x0: state.width, y0: state.height, x1: -1, y1: -1 };

    for (let y = searchBounds.y0; y <= searchBounds.y1; y += 1) {
      for (let x = searchBounds.x0; x <= searchBounds.x1; x += 1) {
        if (!pointInPolygon({ x, y }, points)) continue;
        if (!layerHasDrawablePixel(layer, x, y)) continue;
        const idx = y * state.width + x;
        mask[idx] = 1;
        if (x < selectedBounds.x0) selectedBounds.x0 = x;
        if (y < selectedBounds.y0) selectedBounds.y0 = y;
        if (x > selectedBounds.x1) selectedBounds.x1 = x;
        if (y > selectedBounds.y1) selectedBounds.y1 = y;
      }
    }

    if (selectedBounds.x0 > selectedBounds.x1 || selectedBounds.y0 > selectedBounds.y1) {
      clearSelection();
      return;
    }

    state.selectionMask = mask;
    state.selectionBounds = selectedBounds;
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function layerHasDrawablePixel(layer, x, y) {
    if (!layer) return false;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return false;
    const idx = y * state.width + x;
    if (layer.indices[idx] >= 0) {
      return true;
    }
    const base = idx * 4;
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    return direct ? direct[base + 3] > 0 : false;
  }

  function createSelectionByColor(x, y) {
    const layer = getActiveLayer();
    if (!layer) {
      clearSelection();
      return;
    }
    const mask = new Uint8Array(state.width * state.height);
    const bounds = { x0: state.width, y0: state.height, x1: 0, y1: 0 };
    const stack = [[x, y]];
    const visited = new Uint8Array(state.width * state.height);
    const targetSample = getLayerPixelColor(layer, x, y);
    if (!targetSample || targetSample.a === 0) {
      clearSelection();
      return;
    }

    while (stack.length > 0) {
      const [px, py] = stack.pop();
      if (px < 0 || py < 0 || px >= state.width || py >= state.height) continue;
      const idx = py * state.width + px;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const sample = getLayerPixelColor(layer, px, py);
      if (!sample || sample.a === 0) continue;
      if (!layerColorMatches(sample, targetSample)) continue;
      mask[idx] = 1;
      bounds.x0 = Math.min(bounds.x0, px);
      bounds.y0 = Math.min(bounds.y0, py);
      bounds.x1 = Math.max(bounds.x1, px);
      bounds.y1 = Math.max(bounds.y1, py);
      stack.push([px + 1, py]);
      stack.push([px - 1, py]);
      stack.push([px, py + 1]);
      stack.push([px, py - 1]);
    }

    if (bounds.x0 > bounds.x1 || bounds.y0 > bounds.y1) {
      clearSelection();
      return;
    }

    state.selectionMask = mask;
    state.selectionBounds = bounds;
    updateCanvasControlButtons();
    requestOverlayRender();
  }

  function compositeColorMatches(a, b) {
    if (!a.color || !b.color) return false;
    if (a.mode === 'index' && b.mode === 'index') {
      return a.index === b.index;
    }
    return a.color.r === b.color.r && a.color.g === b.color.g && a.color.b === b.color.b && a.color.a === b.color.a;
  }

  function getLayerPixelColor(layer, x, y) {
    if (!layer) return null;
    if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
    const idx = y * state.width + x;
    const paletteIndex = layer.indices[idx];
    if (paletteIndex >= 0) {
      const color = state.palette[paletteIndex];
      if (color) {
        return { r: color.r, g: color.g, b: color.b, a: color.a };
      }
    }
    const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    if (direct) {
      const base = idx * 4;
      const a = direct[base + 3];
      if (a > 0) {
        return {
          r: direct[base],
          g: direct[base + 1],
          b: direct[base + 2],
          a,
        };
      }
    }
    return null;
  }

  function layerColorMatches(sample, target) {
    if (!sample || !target) return false;
    return sample.r === target.r && sample.g === target.g && sample.b === target.b && sample.a === target.a;
  }

  function clearSelection() {
    const pendingMoveState = getPendingSelectionMoveState();
    if (pendingMoveState) {
      // Avoid data loss: commit pending moved pixels before clearing the selection state.
      pointerState.selectionMove = pendingMoveState;
      finalizeSelectionMove();
    }
    state.selectionMask = null;
    state.selectionBounds = null;
    state.pendingPasteMoveState = null;
    pointerState.selectionMove = null;
    updateCanvasControlButtons();
    requestOverlayRender();
  }

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
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      renderCanvas();
      requestOverlayRender();
    });
  }

  function renderCanvas() {
    if (!ctx.drawing) {
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
      if (!layer || !layer.visible || layer.opacity <= 0) continue;
      const opacity = layer.opacity;
      const layerIndices = layer.indices;
      const layerDirect = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      for (let py = y0; py <= y1; py += 1) {
        const rowOffset = (py - y0) * regionWidth * 4;
        const layerRow = py * width;
        for (let px = x0; px <= x1; px += 1) {
          const pixelIndex = layerRow + px;
          const paletteIndex = layerIndices[pixelIndex];
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
          const alpha = (srcA / 255) * opacity;
          if (alpha <= 0) continue;
          const destIndex = rowOffset + (px - x0) * 4;
          const dstA = data[destIndex + 3] / 255;
          const outA = alpha + dstA * (1 - alpha);
          if (outA <= 0) {
            data[destIndex] = 0;
            data[destIndex + 1] = 0;
            data[destIndex + 2] = 0;
            data[destIndex + 3] = 0;
            continue;
          }
          const srcFactor = alpha / outA;
          const dstFactor = (dstA * (1 - alpha)) / outA;
          data[destIndex] = Math.round(srcR * srcFactor + data[destIndex] * dstFactor);
          data[destIndex + 1] = Math.round(srcG * srcFactor + data[destIndex + 1] * dstFactor);
          data[destIndex + 2] = Math.round(srcB * srcFactor + data[destIndex + 2] * dstFactor);
          data[destIndex + 3] = Math.round(outA * 255);
        }
      }
    }

    ctx.drawing.putImageData(image, x0, y0);
  }

  function requestOverlayRender() {
    overlayNeedsRedraw = true;
    requestAnimationFrame(timestamp => {
      if (!overlayNeedsRedraw) return;
      overlayNeedsRedraw = false;
      renderOverlay(timestamp);
    });
  }

  function captureVirtualCursorPointer(pointerId, pointerType, element, event) {
    if (!Number.isFinite(pointerId)) {
      return;
    }
    if (virtualCursorControl.pointerId !== null && virtualCursorControl.pointerId !== pointerId) {
      releaseVirtualCursorPointer();
    }
    virtualCursorControl.pointerId = pointerId;
    virtualCursorControl.pointerType = pointerType || null;
    const captureTarget = element || dom.canvases.drawing || dom.canvasViewport || null;
    virtualCursorControl.captureElement = captureTarget;
    virtualCursorControl.startClient = event ? { x: event.clientX, y: event.clientY } : null;
    virtualCursorControl.baseCursor = virtualCursor ? { x: virtualCursor.x, y: virtualCursor.y } : { x: 0, y: 0 };
    if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
      try {
        captureTarget.setPointerCapture(pointerId);
      } catch (error) {
        // Ignore pointer capture errors; some browsers may not allow it.
      }
    }
    refreshViewportCursorStyle();
  }

  function releaseVirtualCursorPointer() {
    if (virtualCursorControl.pointerId === null) {
      return;
    }
    const captureTarget = virtualCursorControl.captureElement;
    if (captureTarget && typeof captureTarget.releasePointerCapture === 'function') {
      try {
        captureTarget.releasePointerCapture(virtualCursorControl.pointerId);
      } catch (error) {
        // Ignore capture release errors.
      }
    }
    virtualCursorControl.pointerId = null;
    virtualCursorControl.pointerType = null;
    virtualCursorControl.captureElement = null;
    virtualCursorControl.startClient = null;
    virtualCursorControl.baseCursor = null;
    refreshViewportCursorStyle();
  }

  function updateVirtualCursorFromControlDelta(event) {
    if (!dom.canvases.drawing || !virtualCursor) {
      return;
    }
    const start = virtualCursorControl.startClient;
    const base = virtualCursorControl.baseCursor;
    if (!start || !base) {
      return;
    }
    const rect = dom.canvases.drawing.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const unitX = rect.width / Math.max(1, state.width);
    const unitY = rect.height / Math.max(1, state.height);
    const deltaX = unitX ? dx / unitX : 0;
    const deltaY = unitY ? dy / unitY : 0;
    // Allow the virtual cursor to reach the right/bottom edge while keeping
    // actual drawing cell resolution unchanged via getVirtualCursorCellPosition().
    const nextX = clamp(base.x + deltaX, 0, state.width);
    const nextY = clamp(base.y + deltaY, 0, state.height);
    updateVirtualCursorPosition(nextX, nextY);
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
    const viewportScale = Math.max(Number(state.scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
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

  function refreshViewportCursorStyle() {
    if (!dom.canvasViewport) {
      return;
    }
    const shouldHideCursor = Boolean(state.showVirtualCursor && mouseInsideViewport);
    dom.canvasViewport.classList.toggle('is-virtual-cursor-active', shouldHideCursor);
  }

  function setSpacePanActive(active) {
    const next = Boolean(active);
    if (keyboardState.spacePanActive === next) {
      return;
    }
    keyboardState.spacePanActive = next;
    document.body.classList.toggle('is-space-pan-active', next);
    if (!next && pointerState.active && pointerState.tool === 'pan' && pointerState.panMode === 'single') {
      finishPanInteraction();
    }
  }

  function handleViewportPointerEnter(event) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
      return;
    }
    mouseInsideViewport = true;
    refreshViewportCursorStyle();
  }

  function handleViewportPointerLeave(event) {
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
      return;
    }
    mouseInsideViewport = false;
    refreshViewportCursorStyle();
  }

  function isCanvasSurfaceTarget(target) {
    return target === dom.canvases.drawing || target === dom.canvases.overlay || target === dom.canvases.selection;
  }

  function isViewportControlTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }
    return Boolean(target.closest('.canvas-controls') || target.closest('.floating-draw-button'));
  }

  function handleViewportPointerDown(event) {
    const targetElement = event.target instanceof Element ? event.target : null;
    const isCanvasTarget = targetElement && isCanvasSurfaceTarget(targetElement);
    const isControlTarget = targetElement && isViewportControlTarget(targetElement);
    const isTouch = event.pointerType === 'touch';

    if (!isCanvasTarget && !isControlTarget) {
      if (isTouch) {
        updateTouchPointer(event);
        if (hasActiveMultiTouch()) {
          event.preventDefault();
          releaseVirtualCursorPointer();
          if (pointerState.active && pointerState.tool !== 'pan') {
            abortActivePointerInteraction({ commitHistory: false });
            rollbackPendingHistory();
          }
          if (!pointerState.active || pointerState.tool !== 'pan' || pointerState.panMode !== 'multiTouch') {
            abortActivePointerInteraction();
            startPanInteraction(event, { multiTouch: true });
          } else {
            refreshTouchPanBaseline();
          }
          return;
        }
      }

      const isMiddleMousePan = !isTouch && event.button === 1;
      const isPrimaryButton = !isTouch && (event.button === 0 || event.button === undefined);
      const wantsPan = !isTouch && (isMiddleMousePan || ((state.tool === 'pan' || keyboardState.spacePanActive) && isPrimaryButton));
      if (wantsPan) {
        event.preventDefault();
        if (pointerState.active) {
          abortActivePointerInteraction({ commitHistory: false });
        }
        startPanInteraction(event, { captureElement: dom.canvasViewport });
        return;
      }
    }

    if (!state.showVirtualCursor) {
      return;
    }
    if (event.pointerType !== 'touch') {
      return;
    }
    if (virtualCursorControl.pointerId !== null) {
      return;
    }
    if (targetElement && (isCanvasTarget || isControlTarget)) {
      return;
    }
    updateTouchPointer(event);
    event.preventDefault();
    hoverPixel = null;
    resetPointerStateForVirtualCursor();
    captureVirtualCursorPointer(event.pointerId, event.pointerType, dom.canvasViewport, event);
  }

  function handleViewportPointerMove(event) {
    if (!state.showVirtualCursor) {
      return;
    }
    if (virtualCursorControl.pointerId !== event.pointerId) {
      return;
    }
    if (event.pointerType === 'touch') {
      updateTouchPointer(event);
    }
    event.preventDefault();
    updateVirtualCursorFromControlDelta(event);
  }

  function handleViewportPointerUp(event) {
    if (!state.showVirtualCursor) {
      return;
    }
    if (virtualCursorControl.pointerId !== event.pointerId) {
      return;
    }
    if (event.pointerType === 'touch') {
      removeTouchPointer(event);
    }
    releaseVirtualCursorPointer();
    requestOverlayRender();
  }

  function handleViewportPointerCancel(event) {
    if (!state.showVirtualCursor) {
      return;
    }
    if (virtualCursorControl.pointerId !== event.pointerId) {
      return;
    }
    if (event.pointerType === 'touch') {
      removeTouchPointer(event);
    }
    releaseVirtualCursorPointer();
    requestOverlayRender();
  }

  function renderOverlay(timestamp) {
    const { width, height } = state;
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    resizeVirtualCursorCanvas();
    clearVirtualCursorCanvas();
    if (ctx.overlay) {
      ctx.overlay.clearRect(0, 0, width, height);
    }
    if (ctx.selection) {
      ensureSelectionCanvasResolution(Math.max(Number(state.scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE));
      const selectionCanvas = dom.canvases.selection;
      const clearWidth = selectionCanvas ? selectionCanvas.width : width * state.scale;
      const clearHeight = selectionCanvas ? selectionCanvas.height : height * state.scale;
      ctx.selection.clearRect(0, 0, clearWidth, clearHeight);
    }

    const moveState = getPendingSelectionMoveState();
    const hasSelectionPreview = Boolean(pointerState.selectionPreview
      && (pointerState.tool === 'selectLasso' || pointerState.tool === 'selectRect'));
    const hasSelectionOutline = Boolean(state.selectionMask)
      || hasSelectionPreview
      || Boolean(moveState && moveState.hasCleared);
    if (hasSelectionOutline) {
      updateSelectionDashAnimation(now);
    } else {
      resetSelectionDashAnimation();
    }
    if (moveState && moveState.hasCleared) {
      drawSelectionMovePreview(moveState);
    } else if (state.selectionMask) {
      drawSelectionOverlay();
    }

    const virtualFocusPixel = state.showVirtualCursor ? getVirtualCursorCellPosition() : null;
    const focusPixel = pointerState.active ? pointerState.current : (virtualFocusPixel || hoverPixel);
    const activeTool = (virtualCursorDrawState.active && virtualCursorDrawState.tool)
      ? virtualCursorDrawState.tool
      : getActiveTool();
    const shouldShowGuidePreview = state.showPixelGuides || state.showVirtualCursor;
    if (shouldShowGuidePreview && focusPixel) {
      const overrideSize = activeTool === 'fill' ? 1 : undefined;
      drawBrushPreview(focusPixel, activeTool, overrideSize);
    }

    if (state.showPixelGuides && ctx.overlay && !pointerState.active && activeTool === 'fill' && focusPixel) {
      const previewPixels = getFillPreviewPixels(focusPixel.x, focusPixel.y);
      if (previewPixels && previewPixels.length) {
        ctx.overlay.save();
        ctx.overlay.fillStyle = rgbaToCss(getActiveDrawColor());
        previewPixels.forEach(idx => {
          const px = idx % state.width;
          const py = Math.floor(idx / state.width);
          ctx.overlay.fillRect(px, py, 1, 1);
        });
        ctx.overlay.restore();
      }
    }

    if (
      (state.showPixelGuides || virtualCursorDrawState.active)
      && pointerState.preview
      && ctx.overlay
      && (pointerState.tool === 'line'
        || pointerState.tool === 'rect'
        || pointerState.tool === 'rectFill'
        || pointerState.tool === 'ellipse'
        || pointerState.tool === 'ellipseFill'
        || pointerState.tool === 'curve')
    ) {
      drawPreviewShape(pointerState);
    }

    if ((state.showPixelGuides || state.showVirtualCursor) && ctx.overlay && state.tool === 'curve' && curveBuilder) {
      drawCurveGuides(curveBuilder);
    }

    if (pointerState.selectionPreview && pointerState.tool === 'selectLasso') {
      drawLassoPreview(pointerState.selectionPreview.points);
    }

    if (pointerState.selectionPreview && pointerState.tool === 'selectRect') {
      drawRectanglePreview(pointerState.selectionPreview.start, pointerState.selectionPreview.end);
    }

    if (state.showVirtualCursor && virtualCursor) {
      drawVirtualCursor(virtualCursor);
    }

    if (hasSelectionOutline) {
      requestOverlayRender();
    }
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
    const paletteColor = state.palette[state.activePaletteIndex];
    if (paletteColor) {
      return normalizeColorValue(paletteColor);
    }
    return { r: 255, g: 255, b: 255, a: 255 };
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
    const targets = [dom.toolTabIcon, dom.mobileToolTabIcon].filter(Boolean);
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
    const scale = Math.max(Number(state.scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
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

  function drawBrushPreview(center, tool = getActiveTool(), sizeOverride) {
    if (!center || !ctx.overlay) return;
    const { width, height } = state;
    if (width <= 0 || height <= 0) return;
    const selectionMask = state.selectionMask;
    const size = clamp(Math.round(sizeOverride || state.brushSize || 1), 1, 64);
    if (SELECTION_TOOLS.has(tool)) {
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
      const pixels = getFillPreviewPixels(center.x, center.y);
      if (pixels && pixels.length) {
        const fillColor = rgbaToCss(getActiveDrawColor());
        ctx.overlay.fillStyle = fillColor;
        pixels.forEach(idx => {
          const px = idx % width;
          const py = Math.floor(idx / width);
          ctx.overlay.fillRect(px, py, 1, 1);
        });
        ctx.overlay.restore();
        return;
      }
    }

    const color = getActiveDrawColor();
    ctx.overlay.fillStyle = rgbaToCss(color);
    drawFilledPreview(center, size, selectionMask, () => color);
    ctx.overlay.restore();
  }

  function drawFilledPreview(center, size, selectionMask, colorResolver) {
    const { width, height } = state;
    const halfDown = Math.floor(size / 2);
    const halfUp = Math.ceil(size / 2);
    const minX = clamp(center.x - halfDown, 0, width - 1);
    const maxX = clamp(center.x + halfUp - 1, 0, width - 1);
    const minY = clamp(center.y - halfDown, 0, height - 1);
    const maxY = clamp(center.y + halfUp - 1, 0, height - 1);
    let lastKey = null;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const idx = y * width + x;
        if (selectionMask && selectionMask[idx] !== 1) {
          continue;
        }
        const color = colorResolver ? colorResolver(x, y) : getActiveDrawColor();
        if (!color) continue;
        const key = `${color.r}-${color.g}-${color.b}-${color.a}`;
        if (key !== lastKey) {
          ctx.overlay.fillStyle = rgbaToCss(color);
          lastKey = key;
        }
        ctx.overlay.fillRect(x, y, 1, 1);
      }
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

  function computeFillPreview(x, y) {
    const layer = getActiveLayer();
    if (!layer) return null;
    const width = state.width;
    const height = state.height;
    const selectionMask = state.selectionMask;
    const startIdx = y * width + x;
    if (selectionMask && selectionMask[startIdx] !== 1) {
      return [];
    }
    const targetColor = sampleLayerColor(layer, x, y);
    const replacement = { type: 'index', index: state.activePaletteIndex };
    if (colorsEqual(targetColor, replacement)) {
      return [];
    }
    const visited = new Uint8Array(width * height);
    const stack = [[x, y]];
    const pixels = [];
    while (stack.length > 0) {
      const [px, py] = stack.pop();
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const idx = py * width + px;
      if (visited[idx]) continue;
      visited[idx] = 1;
      if (selectionMask && selectionMask[idx] !== 1) continue;
      const current = sampleLayerColor(layer, px, py);
      if (!colorMatches(current, targetColor)) continue;
      pixels.push(idx);
      stack.push([px + 1, py]);
      stack.push([px - 1, py]);
      stack.push([px, py + 1]);
      stack.push([px, py - 1]);
    }
    return pixels;
  }

  function getFillPreviewContextKey() {
    const frame = getActiveFrame();
    const layer = getActiveLayer();
    if (!frame || !layer) return null;
    const selectionMask = state.selectionMask;
    const selectionMaskId = getSelectionMaskCacheId(selectionMask);
    const selectionBounds = state.selectionBounds;
    const selectionKey = selectionMask
      ? `${selectionMaskId}:${selectionBounds?.x0 ?? ''},${selectionBounds?.y0 ?? ''},${selectionBounds?.x1 ?? ''},${selectionBounds?.y1 ?? ''}`
      : 'none';
    const colorKey = `index-${state.activePaletteIndex}-${JSON.stringify(state.palette[state.activePaletteIndex] || {})}`;
    return `${frame.id}|${layer.id}|${state.width}x${state.height}|${selectionKey}|${colorKey}`;
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

  function getFillPreviewPixels(x, y) {
    const contextKey = getFillPreviewContextKey();
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
    const pixels = computeFillPreview(x, y) || EMPTY_FILL_PREVIEW_PIXELS;
    if (!pixels.length) {
      lookup[cacheIndex] = EMPTY_FILL_PREVIEW_PIXELS;
      return EMPTY_FILL_PREVIEW_PIXELS;
    }
    pixels.forEach(idx => {
      if (idx >= 0 && idx < lookup.length) {
        lookup[idx] = pixels;
      }
    });
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
    strokeSelectionPath((pathCtx, scale) => {
      traceSelectionOutline(pathCtx, mask, width, height, scale);
    }, { translateHalf: true });
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

  function ensureSelectionCanvasResolution(scale) {
    const canvas = dom.canvases.selection;
    if (!canvas) return;
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

  function strokeSelectionPath(trace, options = {}) {
    if (typeof trace !== 'function') return;
    const targetCtx = ctx.selection;
    if (!targetCtx || typeof targetCtx.setLineDash !== 'function') {
      return;
    }
    const displayScale = Math.max(Number(state.scale) || MIN_ZOOM_SCALE, MIN_ZOOM_SCALE);
    ensureSelectionCanvasResolution(displayScale);
    const renderScale = selectionRenderScale;
    const scaleRatio = renderScale / selectionDisplayScale;
    const dashPatternScreen = options.dashPattern || [4, 4];
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
    for (let y = 0; y < height; y += 1) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x += 1) {
        const idx = rowOffset + x;
        if (mask[idx] !== 1) continue;
        const topFilled = y > 0 && mask[idx - width] === 1;
        const bottomFilled = y < height - 1 && mask[idx + width] === 1;
        const leftFilled = x > 0 && mask[idx - 1] === 1;
        const rightFilled = x < width - 1 && mask[idx + 1] === 1;

        const sx = x * scale;
        const sy = y * scale;
        const ex = sx + scale;
        const ey = sy + scale;

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

  function drawPreviewShape(previewState) {
    const tool = pointerState.tool || state.tool;
    const preview = previewState.preview;
    if (!preview) return;
    const { start, end, points } = preview;
    if (!start || !end) return;
    const width = state.width;
    const height = state.height;
    const selectionMask = state.selectionMask;
    const color = getActiveDrawColor();
    ctx.overlay.save();
    ctx.overlay.fillStyle = rgbaToCss(color);
    const stamp = (x, y) => {
      forEachBrushOffset((dx, dy) => {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) {
          return;
        }
        if (selectionMask && selectionMask[py * width + px] !== 1) {
          return;
        }
        ctx.overlay.fillRect(px, py, 1, 1);
      });
    };

    if (tool === 'line' || tool === 'curve') {
      const linePoints = bresenhamLine(start.x, start.y, end.x, end.y);
      linePoints.forEach(pt => stamp(pt.x, pt.y));
    } else if (tool === 'rect' || tool === 'rectFill') {
      const x0 = Math.min(start.x, end.x);
      const x1 = Math.max(start.x, end.x);
      const y0 = Math.min(start.y, end.y);
      const y1 = Math.max(start.y, end.y);
      if (tool === 'rectFill') {
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            stamp(x, y);
          }
        }
      } else {
        for (let x = x0; x <= x1; x += 1) {
          stamp(x, y0);
          stamp(x, y1);
        }
        for (let y = y0; y <= y1; y += 1) {
          stamp(x0, y);
          stamp(x1, y);
        }
      }
    } else if (tool === 'ellipse' || tool === 'ellipseFill') {
      const cx = Math.round((start.x + end.x) / 2);
      const cy = Math.round((start.y + end.y) / 2);
      const rx = Math.round(Math.abs(end.x - start.x) / 2);
      const ry = Math.round(Math.abs(end.y - start.y) / 2);
      const filled = tool === 'ellipseFill';
      drawEllipsePixels(cx, cy, rx, ry, filled, (x, y) => stamp(x, y));
    }

    ctx.overlay.restore();
  }

  function drawLassoPreview(points) {
    if (!points || points.length < 2) return;
    strokeSelectionPath((pathCtx, scale) => {
      pathCtx.moveTo(points[0].x * scale, points[0].y * scale);
      for (let i = 1; i < points.length; i += 1) {
        const point = points[i];
        pathCtx.lineTo(point.x * scale, point.y * scale);
      }
      pathCtx.closePath();
    }, { translateHalf: true });
  }

  function drawRectanglePreview(start, end) {
    if (!start || !end) return;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x) + 1;
    const h = Math.abs(end.y - start.y) + 1;
    strokeSelectionPath((pathCtx, scale) => {
      pathCtx.rect(x * scale, y * scale, w * scale, h * scale);
    }, { translateHalf: true });
  }

  function blendColors(target, source, opacity) {
    const srcA = (source.a / 255) * opacity;
    const dstA = target.a / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA === 0) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const blendChannel = (dst, src) => Math.round(((src * srcA) + dst * dstA * (1 - srcA)) / outA);
    return {
      r: blendChannel(target.r, source.r),
      g: blendChannel(target.g, source.g),
      b: blendChannel(target.b, source.b),
      a: Math.round(outA * 255),
    };
  }

  function getActiveFrame() {
    return state.frames[state.activeFrame];
  }

  function getActiveLayer() {
    const frame = getActiveFrame();
    return frame.layers.find(layer => layer.id === state.activeLayer) || frame.layers[frame.layers.length - 1];
  }

  function getActiveLayerIndex() {
    const frame = getActiveFrame();
    return frame.layers.findIndex(layer => layer.id === state.activeLayer);
  }

  function bresenhamLine(x0, y0, x1, y1) {
    const points = [];
    let dx = Math.abs(x1 - x0);
    let sx = x0 < x1 ? 1 : -1;
    let dy = -Math.abs(y1 - y0);
    let sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    while (true) {
      points.push({ x, y });
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    return points;
  }

  function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersect = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.00001) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function scheduleSessionPersist({ includeSnapshots = true } = {}) {
    if (includeSnapshots) {
      scheduleAutosaveSnapshot();
      scheduleIosSnapshotPersist();
    }
    if (!canUseSessionStorage) return;
    if (sessionPersistHandle !== null) return;
    sessionPersistHandle = window.setTimeout(() => {
      sessionPersistHandle = null;
      persistSessionState();
    }, 120);
  }

  function persistSessionState() {
    if (!canUseSessionStorage) return;
    try {
      const snapshot = {
        scale: normalizeZoomScale(state.scale, MIN_ZOOM_SCALE),
      pan: {
        x: Math.round(Number(state.pan?.x) || 0),
        y: Math.round(Number(state.pan?.y) || 0),
      },
      tool: state.tool,
      brushSize: clamp(Math.round(state.brushSize || 1), 1, 32),
      showGrid: Boolean(state.showGrid),
        gridScreenStep: clamp(Math.round(state.gridScreenStep || 16), 1, 256),
        showMajorGrid: Boolean(state.showMajorGrid),
        majorGridSpacing: clamp(Math.round(state.majorGridSpacing || 16), 2, 512),
        showPixelGuides: Boolean(state.showPixelGuides),
        showVirtualCursor: Boolean(state.showVirtualCursor),
        virtualCursorButtonScale: normalizeFloatingDrawButtonScale(state.virtualCursorButtonScale),
        showChecker: Boolean(state.showChecker),
        activeFrame: clamp(Number(state.activeFrame) || 0, 0, state.frames.length - 1),
        activeLayer: state.activeLayer,
        paletteIndex: clamp(Number(state.activePaletteIndex) || 0, 0, state.palette.length - 1),
        colorMode: state.colorMode,
        leftTab: state.activeLeftTab,
        rightTab: state.activeRightTab,
        backgroundMode: state.backgroundMode,
        toolGroup: state.activeToolGroup,
        lastGroupTool: { ...(state.lastGroupTool || DEFAULT_GROUP_TOOL) },
        leftRailWidth: Math.round(Number(railSizing.left) || RAIL_DEFAULT_WIDTH.left),
        rightRailWidth: Math.round(Number(railSizing.right) || RAIL_DEFAULT_WIDTH.right),
        mobileDrawerMode: normalizeMobileDrawerMode(mobileDrawerState.mode),
        documentName: state.documentName,
        pixfindMode: Boolean(pixfindModeEnabled),
        pixfindModeFirstEnableConfirmed: Boolean(pixfindModeFirstEnableConfirmed),
        exportIncludeOriginalSize: Boolean(exportIncludeOriginalSize),
      };
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
      // Ignore storage errors (private mode or quota exceeded)
    }
  }

  function restoreSessionState() {
    if (!canUseSessionStorage) return;
    let payload;
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      payload = JSON.parse(raw);
    } catch (error) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }

    if (Number.isFinite(payload.scale)) {
      state.scale = normalizeZoomScale(payload.scale, state.scale || MIN_ZOOM_SCALE);
    }
    if (payload.pan && Number.isFinite(payload.pan.x) && Number.isFinite(payload.pan.y)) {
      state.pan.x = Math.round(payload.pan.x);
      state.pan.y = Math.round(payload.pan.y);
    }
    if (typeof payload.tool === 'string') {
      state.tool = payload.tool;
    }
    if (Number.isFinite(payload.brushSize)) {
      state.brushSize = clamp(Math.round(payload.brushSize), 1, 32);
    }
    if (typeof payload.showGrid === 'boolean') {
      state.showGrid = payload.showGrid;
    }
    if (Number.isFinite(payload.gridScreenStep)) {
      state.gridScreenStep = clamp(Math.round(payload.gridScreenStep), 1, 256);
    }
    if (typeof payload.showMajorGrid === 'boolean') {
      state.showMajorGrid = payload.showMajorGrid;
    }
    if (Number.isFinite(payload.majorGridSpacing)) {
      state.majorGridSpacing = clamp(Math.round(payload.majorGridSpacing), 2, 512);
    }
    if (payload.backgroundMode === 'light' || payload.backgroundMode === 'dark' || payload.backgroundMode === 'pink') {
      state.backgroundMode = payload.backgroundMode;
    }
    if (payload.toolGroup && TOOL_GROUPS[payload.toolGroup]) {
      state.activeToolGroup = payload.toolGroup;
    }
    if (payload.lastGroupTool && typeof payload.lastGroupTool === 'object') {
      state.lastGroupTool = { ...DEFAULT_GROUP_TOOL, ...payload.lastGroupTool };
    }
    if (Number.isFinite(payload.leftRailWidth)) {
      railSizing.left = normalizeRailWidth('left', payload.leftRailWidth);
    }
    if (Number.isFinite(payload.rightRailWidth)) {
      railSizing.right = normalizeRailWidth('right', payload.rightRailWidth);
    }
    if (typeof payload.mobileDrawerMode === 'string') {
      mobileDrawerState.mode = normalizeMobileDrawerMode(payload.mobileDrawerMode);
    }
    if (payload.leftTab && LEFT_TAB_KEYS.includes(payload.leftTab)) {
      state.activeLeftTab = payload.leftTab;
    }
    if (payload.rightTab && RIGHT_TAB_KEYS.includes(payload.rightTab)) {
      state.activeRightTab = payload.rightTab;
    }
    if (typeof payload.showPixelGuides === 'boolean') {
      state.showPixelGuides = payload.showPixelGuides;
    }
    if (typeof payload.showVirtualCursor === 'boolean') {
      state.showVirtualCursor = payload.showVirtualCursor;
    }
    if (Number.isFinite(payload.virtualCursorButtonScale)) {
      state.virtualCursorButtonScale = normalizeFloatingDrawButtonScale(payload.virtualCursorButtonScale);
    }
    if (typeof payload.showChecker === 'boolean') {
      state.showChecker = payload.showChecker;
    }
    setVirtualCursorButtonScale(state.virtualCursorButtonScale, { persist: false, clampPosition: false });
    state.colorMode = 'index';
    if (Number.isFinite(payload.paletteIndex)) {
      state.activePaletteIndex = clamp(Math.round(payload.paletteIndex), 0, state.palette.length - 1);
    }
    if (Number.isFinite(payload.activeFrame)) {
      state.activeFrame = clamp(Math.round(payload.activeFrame), 0, state.frames.length - 1);
    }
    const frame = state.frames[state.activeFrame];
    if (frame && frame.layers && frame.layers.length) {
      const preferredLayer = typeof payload.activeLayer === 'string' ? payload.activeLayer : null;
      const fallbackLayer = frame.layers.find(layer => layer.id === preferredLayer);
      state.activeLayer = fallbackLayer ? fallbackLayer.id : frame.layers[frame.layers.length - 1].id;
    }
    if (!state.lastGroupTool) {
      state.lastGroupTool = { ...DEFAULT_GROUP_TOOL };
    }
    state.activeToolGroup = state.activeToolGroup || TOOL_TO_GROUP[state.tool] || 'pen';
    if (typeof payload.documentName === 'string') {
      state.documentName = normalizeDocumentName(payload.documentName);
    }
    if (typeof payload.pixfindMode === 'boolean') {
      pixfindModeEnabled = payload.pixfindMode;
    }
    if (typeof payload.pixfindModeFirstEnableConfirmed === 'boolean') {
      pixfindModeFirstEnableConfirmed = payload.pixfindModeFirstEnableConfirmed;
    } else if (pixfindModeEnabled) {
      pixfindModeFirstEnableConfirmed = true;
    }
    if (typeof payload.exportIncludeOriginalSize === 'boolean') {
      exportIncludeOriginalSize = payload.exportIncludeOriginalSize;
    }
    if (state.showVirtualCursor && !virtualCursor) {
      virtualCursor = createInitialVirtualCursor();
    }
    if (!state.showVirtualCursor) {
      releaseVirtualCursorPointer();
    }
    if (pixfindModeEnabled) {
      capturePixfindBaseSnapshot({ quiet: true });
    } else {
      clearPixfindBaseSnapshot();
    }
    updateFloatingDrawButtonEnabledState();
    refreshViewportCursorStyle();
  }

  function rgbaToHex({ r, g, b, a }) {
    const toHex = value => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function rgbaToCss({ r, g, b, a }) {
    return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
  }

  function toCssColor(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object') {
      const { r = 0, g = 0, b = 0, a = 255 } = value;
      return rgbaToCss({ r, g, b, a });
    }
    return 'rgba(0, 0, 0, 0)';
  }

  function createPixelFrameImage(color, { borderColor = '#C8C8C8' } = {}) {
    const colorCss = toCssColor(color);
    const borderCss = toCssColor(borderColor);
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='21' height='21' shape-rendering='crispEdges'>` +
      `<rect x='1' y='0' width='19' height='1' fill='${borderCss}' />` +
      `<rect x='0' y='1' width='2' height='1' fill='${borderCss}' />` +
      `<rect x='2' y='1' width='17' height='19' fill='${colorCss}' />` +
      `<rect x='19' y='1' width='2' height='1' fill='${borderCss}' />` +
      `<rect x='0' y='2' width='1' height='18' fill='${borderCss}' />` +
      `<rect x='1' y='2' width='1' height='17' fill='${colorCss}' />` +
      `<rect x='19' y='2' width='1' height='17' fill='${colorCss}' />` +
      `<rect x='20' y='2' width='1' height='18' fill='${borderCss}' />` +
      `<rect x='1' y='19' width='1' height='2' fill='${borderCss}' />` +
      `<rect x='19' y='19' width='1' height='2' fill='${borderCss}' />` +
      `<rect x='2' y='20' width='17' height='1' fill='${borderCss}' />` +
      `</svg>`;
    const encoded = encodeURIComponent(svg)
      .replace(/%0A/g, '')
      .replace(/%09/g, '');
    return `url("data:image/svg+xml,${encoded}")`;
  }

  function applyPixelFrameBackground(element, color, options = {}) {
    if (!element) return;
    element.classList.add('pixel-frame');
    element.style.setProperty('--pixel-frame-image', createPixelFrameImage(color, options));
  }

  window.pixelFrameUtils = Object.freeze({
    createImage: createPixelFrameImage,
    applyBackground: applyPixelFrameBackground,
    toCssColor,
  });

  function rgbaToHsv({ r, g, b }) {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    if (delta !== 0) {
      if (max === rn) {
        h = ((gn - bn) / delta) % 6;
      } else if (max === gn) {
        h = (bn - rn) / delta + 2;
      } else {
        h = (rn - gn) / delta + 4;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : delta / max;
    const v = max;
    return { h, s, v };
  }

  function hsvToRgba(h, s, v) {
    const hue = ((h % 360) + 360) % 360;
    const saturation = clamp(s, 0, 1);
    const value = clamp(v, 0, 1);
    const c = value * saturation;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = value - c;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (hue < 60) {
      rp = c;
      gp = x;
    } else if (hue < 120) {
      rp = x;
      gp = c;
    } else if (hue < 180) {
      gp = c;
      bp = x;
    } else if (hue < 240) {
      gp = x;
      bp = c;
    } else if (hue < 300) {
      rp = x;
      bp = c;
    } else {
      rp = c;
      bp = x;
    }
    const r = Math.round((rp + m) * 255);
    const g = Math.round((gp + m) * 255);
    const b = Math.round((bp + m) * 255);
    return { r, g, b, a: 255 };
  }

  function getActiveDrawColor(opacityOverride) {
    const previewTool = pointerState.tool || state.tool;
    let baseColor;
    if (previewTool === 'eraser') {
      baseColor = { r: 255, g: 255, b: 255, a: 255 };
    } else {
      baseColor = state.palette[state.activePaletteIndex];
    }
    if (!baseColor) {
      baseColor = { r: 255, g: 255, b: 255, a: 255 };
    }
    const color = {
      r: baseColor.r ?? 255,
      g: baseColor.g ?? 255,
      b: baseColor.b ?? 255,
      a: baseColor.a ?? 255,
    };
    if (color.a <= 0) {
      color.a = 255;
    }
    if (typeof opacityOverride === 'number') {
      const clamped = clamp(opacityOverride, 0, 1);
      color.a = Math.round(clamped * 255);
    }
    return color;
  }

  function hexToRgba(value) {
    if (!value || value[0] !== '#') return null;
    const hex = value.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return { r, g, b, a: 255 };
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return { r, g, b, a: 255 };
    }
    return null;
  }

  function getZoomStepIndex(scale) {
    if (!Number.isFinite(scale)) {
      return 0;
    }
    let bestIndex = 0;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < ZOOM_STEPS.length; i += 1) {
      const diff = Math.abs(ZOOM_STEPS[i] - scale);
      if (diff < bestDiff - ZOOM_EPSILON) {
        bestDiff = diff;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  function getZoomScaleAtIndex(index) {
    const numeric = Number(index);
    const clampedIndex = Math.min(Math.max(Number.isFinite(numeric) ? Math.round(numeric) : 0, 0), ZOOM_STEPS.length - 1);
    return ZOOM_STEPS[clampedIndex];
  }

  function normalizeZoomScale(value, fallback = MIN_ZOOM_SCALE) {
    const base = Number.isFinite(value) ? Number(value) : Number(fallback);
    const effective = Number.isFinite(base) ? base : MIN_ZOOM_SCALE;
    return clamp(effective, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
  }

  function formatZoomLabel(scale) {
    const percent = normalizeZoomScale(scale, MIN_ZOOM_SCALE) * 100;
    const roundedTenth = Math.round(percent * 10) / 10;
    const isWhole = Math.abs(roundedTenth - Math.round(roundedTenth)) < 0.05;
    const value = isWhole ? Math.round(roundedTenth) : Number(roundedTenth.toFixed(1));
    return `${value}%`;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function debounce(fn, wait) {
    let handle;
    return (...args) => {
      clearTimeout(handle);
      handle = setTimeout(() => fn(...args), wait);
    };
  }

  function isInputControlElement(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.matches('input, textarea, select')) return true;
    if (node instanceof Element && node.hasAttribute('contenteditable') && node.getAttribute('contenteditable') !== 'false') {
      return true;
    }
    return false;
  }

  function isLabelForElement(label, control) {
    if (!label || !control || label.nodeType !== Node.ELEMENT_NODE || control.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }
    if (label.tagName !== 'LABEL') {
      return false;
    }
    if (label.contains(control)) {
      return true;
    }
    const htmlFor = label.getAttribute('for');
    return Boolean(htmlFor && control.id && htmlFor === control.id);
  }

  function setupGlobalFocusDismiss() {
    document.addEventListener(
      'pointerdown',
      (event) => {
        const isMouseLikePointer = event.pointerType === 'mouse' && !isCoarsePointerDevice();
        const targetElement = event.target instanceof Element ? event.target : null;
        if (hasPendingSelectionMove()) {
          const keepCanvasFlow = Boolean(targetElement && isCanvasSurfaceTarget(targetElement));
          if (!keepCanvasFlow) {
            confirmPendingSelectionMove();
          }
        }
        if (!isMouseLikePointer) {
          return;
        }
        const active = document.activeElement;
        if (!isInputControlElement(active)) {
          return;
        }
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
        const shouldRetain = path.some((node) => {
          if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
          return isInputControlElement(node) || isLabelForElement(node, active);
        });
        if (shouldRetain) {
          return;
        }
        if (typeof active.blur === 'function') {
          active.blur();
        }
      },
      true
    );
  }

  init();
})();
