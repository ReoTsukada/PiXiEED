(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createLayoutStaticConfig({
    UI_THEME_PRESETS = Object.freeze({}),
  } = {}) {
    const RAIL_DEFAULT_WIDTH = Object.freeze({ left: 320, right: 128 });
    const RAIL_MIN_WIDTH = 68;
    const RAIL_MAX_WIDTH = 440;
    const LEFT_PALETTE_COMPACT_WIDTH = 104;
    const LEFT_RAIL_MAX_WIDTH = RAIL_DEFAULT_WIDTH.left;
    const RAIL_COMPACT_THRESHOLD = Object.freeze({ left: 150, right: 96 });
    const RAIL_CLICK_OPEN_WIDTH = Object.freeze({ left: 236, right: 320 });
    const RAIL_INITIAL_WIDTH = Object.freeze({ left: LEFT_PALETTE_COMPACT_WIDTH, right: RAIL_DEFAULT_WIDTH.right });
    const RAIL_RESIZE_DRAG_THRESHOLD = 6;
    const RIGHT_TRANSIENT_PANEL_WIDTH = RAIL_MAX_WIDTH;
    const BOTTOM_TIMELINE_DEFAULT_HEIGHT = 188;
    const BOTTOM_TIMELINE_MIN_HEIGHT = 64;
    const BOTTOM_TIMELINE_COMPACT_HEIGHT = 96;
    const BOTTOM_TIMELINE_INITIAL_HEIGHT = BOTTOM_TIMELINE_MIN_HEIGHT;
    const BOTTOM_TIMELINE_MAX_HEIGHT = 320;
    const LEFT_DUAL_GAP = 8;
    const LEFT_DUAL_MIN_COLUMN_WIDTH = Math.max(132, RAIL_DEFAULT_WIDTH.left, RAIL_MIN_WIDTH);
    const LEFT_UNIFIED_TOOLS_RATIO_DEFAULT = 0.5;
    const LEFT_UNIFIED_TOOLS_RATIO_MIN = 0.2;
    const LEFT_UNIFIED_TOOLS_RATIO_MAX = 0.8;
    const LEFT_UNIFIED_TOOLS_MIN_HEIGHT_FALLBACK = 122;
    const LEFT_UNIFIED_COLOR_MIN_HEIGHT_FALLBACK = 168;
    const DEFAULT_UI_THEME = 'emerald';
    const UI_THEME_KEYS = Object.freeze(Object.keys(UI_THEME_PRESETS));
    const UI_THEME_SET = new Set(UI_THEME_KEYS);
    const TRANSPARENT_TILE_SIZE = 8;
    const MIRROR_AXIS_VERTICAL = 'vertical';
    const MIRROR_AXIS_HORIZONTAL = 'horizontal';
    const MIRROR_AXIS_DIAGONAL_A = 'diagonalA';
    const MIRROR_AXIS_DIAGONAL_B = 'diagonalB';
    const MIRROR_AXIS_KEYS = Object.freeze([
      MIRROR_AXIS_VERTICAL,
      MIRROR_AXIS_HORIZONTAL,
      MIRROR_AXIS_DIAGONAL_A,
      MIRROR_AXIS_DIAGONAL_B,
    ]);
    const MIRROR_HANDLE_OUTSIDE_OFFSET = 72;
    const CANVAS_RESIZE_HANDLE_GAP = 4;
    const CANVAS_RESIZE_HANDLE_SIZE = 18;
    const MULTI_CANVAS_SURFACE_GAP = 48;
    const MIRROR_HANDLE_DRAG_THRESHOLD = 4;
    return Object.freeze({
      RAIL_DEFAULT_WIDTH,
      RAIL_MIN_WIDTH,
      RAIL_MAX_WIDTH,
      LEFT_PALETTE_COMPACT_WIDTH,
      LEFT_RAIL_MAX_WIDTH,
      RAIL_COMPACT_THRESHOLD,
      RAIL_CLICK_OPEN_WIDTH,
      RAIL_INITIAL_WIDTH,
      RAIL_RESIZE_DRAG_THRESHOLD,
      RIGHT_TRANSIENT_PANEL_WIDTH,
      BOTTOM_TIMELINE_DEFAULT_HEIGHT,
      BOTTOM_TIMELINE_MIN_HEIGHT,
      BOTTOM_TIMELINE_COMPACT_HEIGHT,
      BOTTOM_TIMELINE_INITIAL_HEIGHT,
      BOTTOM_TIMELINE_MAX_HEIGHT,
      LEFT_DUAL_GAP,
      LEFT_DUAL_MIN_COLUMN_WIDTH,
      LEFT_UNIFIED_TOOLS_RATIO_DEFAULT,
      LEFT_UNIFIED_TOOLS_RATIO_MIN,
      LEFT_UNIFIED_TOOLS_RATIO_MAX,
      LEFT_UNIFIED_TOOLS_MIN_HEIGHT_FALLBACK,
      LEFT_UNIFIED_COLOR_MIN_HEIGHT_FALLBACK,
      DEFAULT_UI_THEME,
      UI_THEME_KEYS,
      UI_THEME_SET,
      TRANSPARENT_TILE_SIZE,
      MIRROR_AXIS_VERTICAL,
      MIRROR_AXIS_HORIZONTAL,
      MIRROR_AXIS_DIAGONAL_A,
      MIRROR_AXIS_DIAGONAL_B,
      MIRROR_AXIS_KEYS,
      MIRROR_HANDLE_OUTSIDE_OFFSET,
      CANVAS_RESIZE_HANDLE_GAP,
      CANVAS_RESIZE_HANDLE_SIZE,
      MULTI_CANVAS_SURFACE_GAP,
      MIRROR_HANDLE_DRAG_THRESHOLD,
    });
  }

  function createLayoutViewportModule(rawScope = {}) {
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

  function getMainCanvasViewportElement() {
    if (dom.canvasViewport instanceof HTMLElement) {
      return dom.canvasViewport;
    }
    if (dom.mainCanvasArea instanceof HTMLElement) {
      return dom.mainCanvasArea;
    }
    return activeCanvasSurface?.body instanceof HTMLElement ? activeCanvasSurface.body : null;
  }

  function getViewportVisibilityTargetSurface() {
    if (activeCanvasSurface?.panel instanceof HTMLElement) {
      return activeCanvasSurface;
    }
    return mainViewportCanvasSurface;
  }

  function getViewportPanelBoundsRect() {
    const panels = getProjectCanvasSurfaceEntries()
      .map(surface => (surface?.panel instanceof HTMLElement ? surface.panel : null))
      .filter(panel => panel instanceof HTMLElement);
    if (!panels.length) {
      return null;
    }
    let left = Number.POSITIVE_INFINITY;
    let top = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    panels.forEach(panel => {
      const rect = panel.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    });
    if (![left, top, right, bottom].every(Number.isFinite) || right <= left || bottom <= top) {
      return null;
    }
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function getPrimaryViewportCanvasRect() {
    const targetSurface = getViewportVisibilityTargetSurface();
    const targetElement = targetSurface?.stack instanceof HTMLElement
      ? targetSurface.stack
      : (targetSurface?.drawing instanceof HTMLElement
        ? targetSurface.drawing
        : (targetSurface?.panel instanceof HTMLElement ? targetSurface.panel : null));
    if (!(targetElement instanceof HTMLElement)) {
      return null;
    }
    const rect = targetElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return rect;
  }

  function clampPanToKeepRectIntersectingViewport(targetRect, viewportRect) {
    if (!targetRect || !viewportRect) {
      return { clampedX: false, clampedY: false };
    }
    let nextPanX = Math.round(Number(state.pan.x) || 0);
    let nextPanY = Math.round(Number(state.pan.y) || 0);
    if (targetRect.right <= viewportRect.left) {
      nextPanX += Math.round(viewportRect.left - targetRect.right + 1);
    } else if (targetRect.left >= viewportRect.right) {
      nextPanX -= Math.round(targetRect.left - viewportRect.right + 1);
    }
    if (targetRect.bottom <= viewportRect.top) {
      nextPanY += Math.round(viewportRect.top - targetRect.bottom + 1);
    } else if (targetRect.top >= viewportRect.bottom) {
      nextPanY -= Math.round(targetRect.top - viewportRect.bottom + 1);
    }
    const clampedX = nextPanX !== Math.round(Number(state.pan.x) || 0);
    const clampedY = nextPanY !== Math.round(Number(state.pan.y) || 0);
    if (nextPanX !== state.pan.x) {
      state.pan.x = nextPanX;
    }
    if (nextPanY !== state.pan.y) {
      state.pan.y = nextPanY;
    }
    return { clampedX, clampedY };
  }

  function clampPanToKeepAnyCanvasVisible() {
    const viewport = dom.canvasViewport;
    if (!(viewport instanceof HTMLElement)) {
      return { clampedX: false, clampedY: false };
    }
    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) {
      return { clampedX: false, clampedY: false };
    }
    if (isMultiCanvasWorldLayoutActive()) {
      return { clampedX: false, clampedY: false };
    }
    return clampPanToKeepRectIntersectingViewport(getPrimaryViewportCanvasRect(), viewportRect);
  }

  function centerProjectCanvasInViewport({ persist = false } = {}) {
    if (isMultiCanvasWorldLayoutActive()) {
      applyViewportTransform();
      if (persist) {
        scheduleSessionPersist({ includeSnapshots: false });
      }
      return;
    }
    state.pan.x = 0;
    state.pan.y = 0;
    requestLocalViewportCanvasLayoutReset({ clearStored: true });
    syncLocalViewportCanvasDockLayout();
    const viewport = dom.canvasViewport;
    const targetSurface = getViewportVisibilityTargetSurface();
    const panel = targetSurface?.panel instanceof HTMLElement ? targetSurface.panel : null;
    const canvasDoc = targetSurface?.canvasDoc
      || getProjectCanvasDocumentById(targetSurface?.canvasDocId)
      || (targetSurface?.kind === 'local' ? getProjectCanvasDocumentForEntry(targetSurface) : getProjectCanvasDocumentAt(0));
    if (!isMainCanvasPanelCssCentered() && viewport instanceof HTMLElement && panel instanceof HTMLElement && canvasDoc) {
      const viewportWidth = Math.max(1, Math.round(viewport.clientWidth || viewport.getBoundingClientRect().width || 1));
      const viewportHeight = Math.max(1, Math.round(viewport.clientHeight || viewport.getBoundingClientRect().height || 1));
      const drawWidth = Math.max(1, Math.round(Number(canvasDoc?.width) || 1)) * getProjectCanvasDisplayScale(canvasDoc);
      const drawHeight = Math.max(1, Math.round(Number(canvasDoc?.height) || 1)) * getProjectCanvasDisplayScale(canvasDoc);
      const panelLeft = parseLocalViewportCanvasAxis(panel.style.left, panel.offsetLeft) || 0;
      const panelTop = parseLocalViewportCanvasAxis(panel.style.top, panel.offsetTop) || 0;
      state.pan.x = Math.round((viewportWidth / 2) - panelLeft - (drawWidth / 2));
      state.pan.y = Math.round((viewportHeight / 2) - panelTop - (drawHeight / 2));
    }
    applyViewportTransform();
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function isMainCanvasPanelCssCentered() {
    return (
      layoutMode === 'mobilePortrait'
      && getProjectCanvasCount() <= 1
      && document.body.classList.contains('is-mobile-layout')
    );
  }

  function resetOpenedDocumentViewport({ defer = false, preserveLocalCanvasLayout = false } = {}) {
    if (openedDocumentViewportResetRaf !== null) {
      window.cancelAnimationFrame(openedDocumentViewportResetRaf);
      openedDocumentViewportResetRaf = null;
    }
    const run = () => {
      openedDocumentViewportResetRaf = null;
      const multiCanvasWorldLayoutActive = isMultiCanvasWorldLayoutActive();
      if (!multiCanvasWorldLayoutActive) {
        resetViewportZoomRatio(1);
        state.pan.x = 0;
        state.pan.y = 0;
        if (!preserveLocalCanvasLayout) {
          requestLocalViewportCanvasLayoutReset({ clearStored: true });
        }
      } else if (!preserveLocalCanvasLayout) {
        requestLocalViewportCanvasLayoutReset({ clearStored: true });
      }
      resizeCanvases({
        forceRender: false,
        applyTransform: false,
        syncControls: true,
        updateScaleLimits: false,
      });
      if (multiCanvasWorldLayoutActive) {
        syncLocalViewportCanvasDockVisibility({ persist: false, render: true });
        applyViewportTransform();
      } else {
        centerProjectCanvasInViewport({ persist: false });
      }
      requestOverlayRender();
    };
    if (!defer) {
      run();
      return;
    }
    openedDocumentViewportResetRaf = window.requestAnimationFrame(() => {
      openedDocumentViewportResetRaf = window.requestAnimationFrame(run);
    });
  }

  function applyViewportTransform({ updateDecorations = true, clampVisibility = true } = {}) {
    if (!(dom.viewportWorkspace instanceof HTMLElement)) return;
    const panX = Number(state.pan.x) || 0;
    const panY = Number(state.pan.y) || 0;
    if (panX !== state.pan.x) {
      state.pan.x = panX;
    }
    if (panY !== state.pan.y) {
      state.pan.y = panY;
    }
    dom.viewportWorkspace.style.transform = `translate(${panX}px, ${panY}px)`;
    const clampResult = clampVisibility ? clampPanToKeepAnyCanvasVisible() : { clampedX: false, clampedY: false };
    if (clampVisibility && (clampResult?.clampedX || clampResult?.clampedY)) {
      dom.viewportWorkspace.style.transform = `translate(${Number(state.pan.x) || 0}px, ${Number(state.pan.y) || 0}px)`;
    }
    if (updateDecorations) {
      updateGridDecorations();
      syncSelectionOutlineToViewportTransform();
      updateMirrorGuideHandles();
      updateCanvasResizeHandlePosition();
      syncCanvasResizeHandleVisibility();
    }
    return clampResult;
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

  function runDeferredUiSetup() {
    if (deferredUiSetupDone) {
      return;
    }
    deferredUiSetupDone = true;
    setupReferenceOverlay();
    initMemoryMonitor();
  }

  function scheduleDeferredUiSetup() {
    if (deferredUiSetupDone || deferredUiSetupScheduled) {
      return;
    }
    deferredUiSetupScheduled = true;
    const run = () => {
      deferredUiSetupScheduled = false;
      runDeferredUiSetup();
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 600 });
      return;
    }
    window.setTimeout(run, 120);
  }

  function getActiveTool() {
    // When idle, always reflect the selected tool to avoid stale pointer tool previews.
    if (!pointerState.active) {
      return state.tool;
    }
    return pointerState.tool || state.tool;
  }

  function getLeftDualMinTotalWidth() {
    return (LEFT_DUAL_MIN_COLUMN_WIDTH * 2) + LEFT_DUAL_GAP;
  }

  function normalizeLeftDualToolsWidth(value, totalWidth = railSizing.left) {
    const safeTotal = Math.max(getLeftDualMinTotalWidth(), Math.round(Number(totalWidth) || getLeftDualMinTotalWidth()));
    const maxTools = Math.max(LEFT_DUAL_MIN_COLUMN_WIDTH, safeTotal - LEFT_DUAL_MIN_COLUMN_WIDTH - LEFT_DUAL_GAP);
    const fallback = clamp(Math.round(Number(leftDualSizing.tools) || LEFT_DUAL_MIN_COLUMN_WIDTH), LEFT_DUAL_MIN_COLUMN_WIDTH, maxTools);
    const numeric = Math.round(Number(value));
    const base = Number.isFinite(numeric) ? numeric : fallback;
    return clamp(base, LEFT_DUAL_MIN_COLUMN_WIDTH, maxTools);
  }

  function normalizeLeftUnifiedToolsRatio(value, fallback = LEFT_UNIFIED_TOOLS_RATIO_DEFAULT) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return clamp(numeric, LEFT_UNIFIED_TOOLS_RATIO_MIN, LEFT_UNIFIED_TOOLS_RATIO_MAX);
    }
    const fallbackNumeric = Number(fallback);
    if (Number.isFinite(fallbackNumeric)) {
      return clamp(fallbackNumeric, LEFT_UNIFIED_TOOLS_RATIO_MIN, LEFT_UNIFIED_TOOLS_RATIO_MAX);
    }
    return LEFT_UNIFIED_TOOLS_RATIO_DEFAULT;
  }

  function measureLeftUnifiedSectionMinimumHeight(section, fallbackHeight) {
    if (!(section instanceof HTMLElement)) {
      return Math.max(1, Math.round(Number(fallbackHeight) || 0));
    }
    const styles = window.getComputedStyle(section);
    const sectionGap = Math.max(0, parseFloat(styles.gap) || 0);
    const paddingTop = Math.max(0, parseFloat(styles.paddingTop) || 0);
    const paddingBottom = Math.max(0, parseFloat(styles.paddingBottom) || 0);
    const body = section.querySelector('.panel-section__body');
    const bodyStyles = body instanceof HTMLElement ? window.getComputedStyle(body) : null;
    const bodyGap = Math.max(0, parseFloat(bodyStyles?.gap || '0') || 0);
    let measuredContentHeight = 0;
    if (section.id === 'panelTools') {
      const toolGroups = section.querySelector('.tool-group-tabs');
      const toolGrid = section.querySelector('.tool-grid[data-active-group]') || section.querySelector('.tool-grid');
      const groupButton = toolGroups instanceof HTMLElement ? toolGroups.querySelector('.tool-group-button') : null;
      const toolButton = toolGrid instanceof HTMLElement ? toolGrid.querySelector('.tool-button') : null;
      const toolGroupsStyles = toolGroups instanceof HTMLElement ? window.getComputedStyle(toolGroups) : null;
      const toolGridStyles = toolGrid instanceof HTMLElement ? window.getComputedStyle(toolGrid) : null;
      const toolGroupsPaddingTop = Math.max(0, parseFloat(toolGroupsStyles?.paddingTop || '0') || 0);
      const toolGroupsPaddingBottom = Math.max(0, parseFloat(toolGroupsStyles?.paddingBottom || '0') || 0);
      const toolGroupsMarginBottom = Math.max(0, parseFloat(toolGroupsStyles?.marginBottom || '0') || 0);
      const activeToolGroupRows = toolGroups instanceof HTMLElement
        ? Math.max(1, Math.ceil((toolGroups.querySelectorAll('.tool-group-button').length || 1) / Math.max(1, Math.floor((toolGroups.clientWidth || toolGroups.scrollWidth || 1) / Math.max(1, groupButton instanceof HTMLElement ? Math.round(groupButton.getBoundingClientRect().width || groupButton.offsetWidth || 0) : 1)))))
        : 1;
      const firstGroupHeight = groupButton instanceof HTMLElement
        ? Math.max(1, Math.round(groupButton.getBoundingClientRect().height || groupButton.offsetHeight || 0))
        : 44;
      const toolGroupsGap = Math.max(0, parseFloat(toolGroupsStyles?.gap || '0') || 0);
      const toolGroupsHeight = toolGroups instanceof HTMLElement
        ? Math.max(
          firstGroupHeight + toolGroupsPaddingTop + toolGroupsPaddingBottom,
          (firstGroupHeight * Math.min(activeToolGroupRows, 2)) + (toolGroupsGap * Math.max(0, Math.min(activeToolGroupRows, 2) - 1)) + toolGroupsPaddingTop + toolGroupsPaddingBottom
        ) + toolGroupsMarginBottom
        : 0;
      const firstToolHeight = toolButton instanceof HTMLElement
        ? Math.max(1, Math.round(toolButton.getBoundingClientRect().height || toolButton.offsetHeight || 0))
        : 44;
      const toolGridGap = Math.max(0, parseFloat(toolGridStyles?.gap || '0') || 0);
      const toolGridPaddingTop = Math.max(0, parseFloat(toolGridStyles?.paddingTop || '0') || 0);
      const toolGridPaddingBottom = Math.max(0, parseFloat(toolGridStyles?.paddingBottom || '0') || 0);
      const toolGridHeight = firstToolHeight + toolGridPaddingTop + toolGridPaddingBottom + toolGridGap;
      measuredContentHeight = toolGroupsHeight + toolGridHeight + bodyGap;
    } else {
      const paletteGrid = section.querySelector('.palette-grid');
      const paletteEditor = section.querySelector('.palette-editor');
      const paletteHeader = section.querySelector('.palette-header');
      const paletteSwatch = paletteGrid instanceof HTMLElement ? paletteGrid.querySelector('.palette-swatch') : null;
      const swatchHeight = paletteSwatch instanceof HTMLElement
        ? Math.max(1, Math.round(paletteSwatch.getBoundingClientRect().height || paletteSwatch.offsetHeight || 0))
        : 44;
      const paletteHeaderHeight = paletteHeader instanceof HTMLElement
        ? Math.max(0, Math.round(paletteHeader.getBoundingClientRect().height || paletteHeader.offsetHeight || 0))
        : 0;
      const paletteEditorHeight = paletteEditor instanceof HTMLElement
        ? Math.max(0, Math.round(Math.min(paletteEditor.scrollHeight || 0, 220)))
        : 0;
      measuredContentHeight = paletteHeaderHeight + swatchHeight + paletteEditorHeight + bodyGap;
    }
    return Math.max(
      Math.round(Number(fallbackHeight) || 0),
      Math.round(measuredContentHeight + paddingTop + paddingBottom + sectionGap + 8)
    );
  }

  function getLeftUnifiedSplitMinimumHeights() {
    const toolsSection = dom.sections.tools;
    const colorSection = dom.sections.color;
    return {
      tools: measureLeftUnifiedSectionMinimumHeight(toolsSection, LEFT_UNIFIED_TOOLS_MIN_HEIGHT_FALLBACK),
      color: measureLeftUnifiedSectionMinimumHeight(colorSection, LEFT_UNIFIED_COLOR_MIN_HEIGHT_FALLBACK),
    };
  }

  function getLeftUnifiedSplitRatioBounds(totalHeight) {
    const safeTotalHeight = Math.max(1, Math.round(Number(totalHeight) || 0));
    const minimums = getLeftUnifiedSplitMinimumHeights();
    const minRatio = clamp(
      minimums.tools / safeTotalHeight,
      LEFT_UNIFIED_TOOLS_RATIO_MIN,
      LEFT_UNIFIED_TOOLS_RATIO_MAX
    );
    const maxRatio = clamp(
      1 - (minimums.color / safeTotalHeight),
      minRatio,
      LEFT_UNIFIED_TOOLS_RATIO_MAX
    );
    return {
      min: minRatio,
      max: Math.max(minRatio, maxRatio),
      minimums,
    };
  }

  function ensureLeftUnifiedSplitHandle() {
    if (dom.resizeHandles.leftUnified instanceof HTMLElement) {
      return dom.resizeHandles.leftUnified;
    }
    if (!(dom.leftTabPanes instanceof HTMLElement)) {
      return null;
    }
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.id = 'resizeLeftUnifiedSplit';
    handle.className = 'rail-resizer rail-resizer--left-unified-split';
    handle.hidden = true;
    handle.setAttribute('aria-hidden', 'true');
    handle.setAttribute(
      'aria-label',
      localizeText('ツールとカラーの縦割合を変更', 'Resize tools and color split')
    );
    dom.leftTabPanes.appendChild(handle);
    dom.resizeHandles.leftUnified = handle;
    return handle;
  }

  function isLeftUnifiedSplitModeEnabled() {
    if (layoutMode === 'mobilePortrait' || !isUnifiedLeftToolsColorMode()) {
      return false;
    }
    if (!(dom.leftRail instanceof HTMLElement) || dom.leftRail.dataset.collapsed === 'true') {
      return false;
    }
    if (!(dom.leftTabPanes instanceof HTMLElement)) {
      return false;
    }
    const toolsSection = dom.sections.tools;
    const colorSection = dom.sections.color;
    if (!(toolsSection instanceof HTMLElement) || !(colorSection instanceof HTMLElement)) {
      return false;
    }
    return toolsSection.parentNode === dom.leftTabPanes && colorSection.parentNode === dom.leftTabPanes;
  }

  function syncLeftUnifiedSplitLayout() {
    const panes = dom.leftTabPanes;
    if (!(panes instanceof HTMLElement)) {
      return;
    }
    const handle = ensureLeftUnifiedSplitHandle();
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    const enabled = isLeftUnifiedSplitModeEnabled();
    if (!enabled) {
      handle.hidden = true;
      handle.setAttribute('aria-hidden', 'true');
      panes.style.removeProperty('--left-unified-tools-grow');
      panes.style.removeProperty('--left-unified-color-grow');
      return;
    }
    const toolsSection = dom.sections.tools;
    const colorSection = dom.sections.color;
    if (!(toolsSection instanceof HTMLElement) || !(colorSection instanceof HTMLElement)) {
      return;
    }
    if (colorSection.parentNode === panes) {
      panes.insertBefore(handle, colorSection);
    } else if (handle.parentNode !== panes) {
      panes.appendChild(handle);
    }
    const panesRect = panes.getBoundingClientRect();
    const bounds = getLeftUnifiedSplitRatioBounds(panesRect.height || panes.clientHeight || 0);
    const ratio = clamp(
      normalizeLeftUnifiedToolsRatio(leftUnifiedSplitSizing.ratio, LEFT_UNIFIED_TOOLS_RATIO_DEFAULT),
      bounds.min,
      bounds.max
    );
    leftUnifiedSplitSizing.ratio = ratio;
    panes.style.setProperty('--left-unified-tools-grow', ratio.toFixed(4));
    panes.style.setProperty('--left-unified-color-grow', (1 - ratio).toFixed(4));
    panes.style.setProperty('--left-unified-tools-min-height', `${bounds.minimums.tools}px`);
    panes.style.setProperty('--left-unified-color-min-height', `${bounds.minimums.color}px`);
    handle.hidden = false;
    handle.setAttribute('aria-hidden', 'false');
  }

  function clearLeftDualRailLayout() {
    const rail = dom.leftRail;
    if (!(rail instanceof HTMLElement)) {
      return;
    }
    rail.style.removeProperty('--left-dual-tools-width');
    rail.style.removeProperty('--left-dual-color-width');
    rail.style.removeProperty('--left-dual-gap');
  }

  function syncLeftDualRailLayout() {
    const rail = dom.leftRail;
    if (!(rail instanceof HTMLElement)) {
      return;
    }
    const totalWidth = Math.round(Number(railSizing.left) || 0);
    if (!isDualLeftRailEnabled() || totalWidth < getLeftDualMinTotalWidth()) {
      clearLeftDualRailLayout();
      return;
    }
    const normalizedTotalWidth = Math.max(getLeftDualMinTotalWidth(), totalWidth);
    const toolsWidth = normalizeLeftDualToolsWidth(leftDualSizing.tools, normalizedTotalWidth);
    const colorWidth = Math.max(LEFT_DUAL_MIN_COLUMN_WIDTH, normalizedTotalWidth - toolsWidth - LEFT_DUAL_GAP);
    leftDualSizing.tools = toolsWidth;
    rail.style.setProperty('--left-dual-tools-width', `${toolsWidth}px`);
    rail.style.setProperty('--left-dual-color-width', `${colorWidth}px`);
    rail.style.setProperty('--left-dual-gap', `${LEFT_DUAL_GAP}px`);
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
    const minWidth = side === 'left' && isDesktopRightToolRailMode()
      ? LEFT_PALETTE_COMPACT_WIDTH
      : RAIL_MIN_WIDTH;
    const viewportLimit = Math.max(RAIL_MIN_WIDTH, Math.floor((window.innerWidth || 0) * 0.45));
    const sideMaxWidth = side === 'left' ? LEFT_RAIL_MAX_WIDTH : RAIL_MAX_WIDTH;
    const maxWidth = Math.max(minWidth, Math.min(sideMaxWidth, viewportLimit));
    return clamp(base, minWidth, maxWidth);
  }

  function updateRailCompactState(targetSide = null) {
    const isMobile = layoutMode === 'mobilePortrait';
    const apply = side => {
      const railNode = getRailNode(side);
      if (!railNode) return;
      let threshold = side === 'right' ? RAIL_COMPACT_THRESHOLD.right : RAIL_COMPACT_THRESHOLD.left;
      if (side === 'left' && isDualLeftRailEnabled()) {
        threshold = Math.max(RAIL_MIN_WIDTH, getLeftDualMinTotalWidth() - 1);
      }
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

  function isRailCompactMode(side) {
    const railNode = getRailNode(side);
    return railNode instanceof HTMLElement && railNode.dataset.compact === 'true';
  }

  function getRailExpandedToggleWidth(side) {
    if (side !== 'left' && side !== 'right') {
      return RAIL_CLICK_OPEN_WIDTH.left;
    }
    if (side === 'left') {
      return normalizeRailWidth('left', LEFT_RAIL_MAX_WIDTH);
    }
    const remembered = Math.round(Number(railSizing.expandedWidth?.[side]) || 0);
    const minimum = side === 'left' && isDualLeftRailEnabled()
      ? getLeftDualMinTotalWidth()
      : RAIL_CLICK_OPEN_WIDTH[side];
    return Math.max(minimum, remembered || minimum);
  }

  function openLeftRailMaxWidth() {
    setRailWidth('left', normalizeRailWidth('left', RAIL_MAX_WIDTH), { persist: true });
    setCompactToolFlyoutOpen(false);
    updateToolVisibility();
  }

  function scheduleRailLayoutRefresh() {
    if (railLayoutRefreshHandle !== null) {
      window.cancelAnimationFrame(railLayoutRefreshHandle);
    }
    railLayoutRefreshHandle = window.requestAnimationFrame(() => {
      railLayoutRefreshHandle = null;
      updateRailMetrics();
      resizeCanvases({
        forceRender: false,
        syncControls: false,
        updateScaleLimits: false,
        renderLocalViewports: false,
      });
      applyViewportTransform();
      clampFloatingDrawButtonPosition();
      if (isBottomTimelineDockEnabled()) {
        renderLayerList();
      }
    });
  }

  function setRailWidth(side, width, { persist = true } = {}) {
    if (side !== 'left' && side !== 'right') {
      return;
    }
    const wasCompactLeftRail = side === 'left' ? isCompactToolRailMode() : false;
    const wasCompactRightRail = side === 'right' ? isCompactRightRailMode() : false;
    const normalized = normalizeRailWidth(side, width);
    railSizing[side] = normalized;
    const cssVar = getRailCssVarName(side);
    if (dom.layout) {
      dom.layout.style.setProperty(cssVar, `${normalized}px`);
      if (side === 'left') {
        dom.layout.style.setProperty('--pixiedraw-tool-rail-width', `${normalized}px`);
      }
    } else {
      document.documentElement.style.setProperty(cssVar, `${normalized}px`);
      if (side === 'left') {
        document.documentElement.style.setProperty('--pixiedraw-tool-rail-width', `${normalized}px`);
      }
    }
    updateRailCompactState(side);
    if (side === 'left') {
      const isCompactLeftRail = isCompactToolRailMode();
      if (isCompactLeftRail && !wasCompactLeftRail) {
        setCompactToolFlyoutOpen(false);
      }
      syncLeftDualRailLayout();
      if (!isCompactToolRailMode()) {
        setCompactToolFlyoutOpen(false);
      }
      if (isCompactLeftRail !== wasCompactLeftRail) {
        updateToolVisibility();
      }
    } else {
      const isCompactRightRail = isCompactRightRailMode();
      if (isCompactRightRail && !wasCompactRightRail) {
        setCompactRightFlyoutOpen(false);
      }
      if (!isCompactRightRail && isCompactRightFlyoutOpen()) {
        setCompactRightFlyoutOpen(false);
      }
      if (isCompactRightRail !== wasCompactRightRail) {
        updateRightTabVisibility();
      }
    }
    if (!isRailCompactMode(side) && railSizing.expandedWidth && typeof railSizing.expandedWidth === 'object') {
      railSizing.expandedWidth[side] = normalized;
    }
    updateRailMetrics();
    scheduleRailLayoutRefresh();
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
  }

  function isBottomTimelineDockEnabled() {
    return layoutMode !== 'mobilePortrait'
      && dom.bottomTimelineDock instanceof HTMLElement
      && dom.bottomTimelinePanes instanceof HTMLElement;
  }

  function normalizeBottomTimelineHeight(value) {
    const fallback = Math.round(Number(bottomTimelineSizing.height) || BOTTOM_TIMELINE_DEFAULT_HEIGHT);
    const numeric = Math.round(Number(value));
    const base = Number.isFinite(numeric) ? numeric : fallback;
    const viewportHeight = Math.max(1, Math.round(Number(window.innerHeight) || 0));
    const viewportLimit = Math.max(BOTTOM_TIMELINE_MIN_HEIGHT, Math.floor(viewportHeight * 0.44));
    const maxHeight = Math.max(
      BOTTOM_TIMELINE_MIN_HEIGHT,
      Math.min(BOTTOM_TIMELINE_MAX_HEIGHT, viewportLimit)
    );
    return clamp(base, BOTTOM_TIMELINE_MIN_HEIGHT, maxHeight);
  }

  function setBottomTimelineHeight(height, { persist = true } = {}) {
    const normalized = normalizeBottomTimelineHeight(height);
    bottomTimelineSizing.height = normalized;
    const isCompact = normalized <= BOTTOM_TIMELINE_COMPACT_HEIGHT;
    document.body.classList.toggle('is-bottom-timeline-compact', isCompact && isBottomTimelineDockEnabled());
    if (dom.bottomTimelineDock instanceof HTMLElement) {
      dom.bottomTimelineDock.dataset.compact = String(isCompact);
    }
    if (dom.layout instanceof HTMLElement) {
      dom.layout.style.setProperty('--bottom-rail-height', `${normalized}px`);
    } else {
      document.documentElement.style.setProperty('--bottom-rail-height', `${normalized}px`);
    }
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function syncBottomTimelineDockState() {
    const dock = dom.bottomTimelineDock;
    if (!(dock instanceof HTMLElement)) {
      return;
    }
    const enabled = isBottomTimelineDockEnabled();
    document.body.classList.toggle('is-bottom-timeline-docked', enabled);
    dock.hidden = !enabled;
    dock.setAttribute('aria-hidden', String(!enabled));
    if (!enabled) {
      endBottomTimelineResize({ persist: false });
      document.body.classList.remove('is-bottom-timeline-compact');
      delete dock.dataset.compact;
      return;
    }
    setBottomTimelineHeight(bottomTimelineSizing.height, { persist: false });
  }

  function beginBottomTimelineResize(event) {
    if (!isBottomTimelineDockEnabled()) {
      return;
    }
    const handle = dom.resizeHandles.bottomTimeline;
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    bottomTimelineSizing.active = true;
    bottomTimelineSizing.pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
    bottomTimelineSizing.startClientY = Number(event.clientY) || 0;
    bottomTimelineSizing.startHeight = normalizeBottomTimelineHeight(bottomTimelineSizing.height);
    bottomTimelineSizing.moved = false;
    bottomTimelineSizing.captureTarget = handle;
    handle.classList.add('is-active');
    document.body.classList.add('is-rail-resizing');
    if (bottomTimelineSizing.pointerId !== null && typeof handle.setPointerCapture === 'function') {
      try {
        handle.setPointerCapture(bottomTimelineSizing.pointerId);
      } catch (error) {
        // Ignore pointer capture failures.
      }
    }
    window.addEventListener('pointermove', handleBottomTimelinePointerMove);
    window.addEventListener('pointerup', handleBottomTimelinePointerUp);
    window.addEventListener('pointercancel', handleBottomTimelinePointerUp);
  }

  function handleBottomTimelinePointerMove(event) {
    if (!bottomTimelineSizing.active) {
      return;
    }
    if (bottomTimelineSizing.pointerId !== null && event.pointerId !== bottomTimelineSizing.pointerId) {
      return;
    }
    const deltaY = bottomTimelineSizing.startClientY - (Number(event.clientY) || 0);
    if (!bottomTimelineSizing.moved) {
      if (Math.abs(deltaY) < RAIL_RESIZE_DRAG_THRESHOLD) {
        return;
      }
      bottomTimelineSizing.moved = true;
    }
    setBottomTimelineHeight(bottomTimelineSizing.startHeight + deltaY, { persist: false });
  }

  function endBottomTimelineResize({ persist = false } = {}) {
    const wasActive = bottomTimelineSizing.active;
    const handle = bottomTimelineSizing.captureTarget;
    if (handle instanceof HTMLElement) {
      handle.classList.remove('is-active');
      if (bottomTimelineSizing.pointerId !== null && typeof handle.releasePointerCapture === 'function') {
        try {
          handle.releasePointerCapture(bottomTimelineSizing.pointerId);
        } catch (error) {
          // Ignore pointer release failures.
        }
      }
    }
    bottomTimelineSizing.active = false;
    bottomTimelineSizing.pointerId = null;
    bottomTimelineSizing.captureTarget = null;
    bottomTimelineSizing.startClientY = 0;
    bottomTimelineSizing.startHeight = bottomTimelineSizing.height;
    bottomTimelineSizing.moved = false;
    if (wasActive) {
      document.body.classList.remove('is-rail-resizing');
    }
    window.removeEventListener('pointermove', handleBottomTimelinePointerMove);
    window.removeEventListener('pointerup', handleBottomTimelinePointerUp);
    window.removeEventListener('pointercancel', handleBottomTimelinePointerUp);
    if (persist && wasActive) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function handleBottomTimelinePointerUp(event) {
    if (!bottomTimelineSizing.active) {
      return;
    }
    if (bottomTimelineSizing.pointerId !== null && event.pointerId !== bottomTimelineSizing.pointerId) {
      return;
    }
    const moved = Boolean(bottomTimelineSizing.moved);
    if (event.type === 'pointercancel') {
      endBottomTimelineResize({ persist: moved });
      return;
    }
    endBottomTimelineResize({ persist: moved });
    if (!moved && isBottomTimelineDockEnabled()) {
      const currentHeight = normalizeBottomTimelineHeight(bottomTimelineSizing.height);
      const fullHeight = normalizeBottomTimelineHeight(BOTTOM_TIMELINE_MAX_HEIGHT);
      const targetHeight = currentHeight >= fullHeight - 1
        ? BOTTOM_TIMELINE_MIN_HEIGHT
        : fullHeight;
      setBottomTimelineHeight(targetHeight, { persist: true });
    }
  }

  function toggleRailFromHandle(side) {
    if (layoutMode === 'mobilePortrait') {
      return;
    }
    if (side !== 'left' && side !== 'right') {
      return;
    }
    const compactMode = isRailCompactMode(side);
    if (side === 'left') {
      const currentWidth = normalizeRailWidth('left', railSizing.left);
      const fullWidth = normalizeRailWidth('left', LEFT_RAIL_MAX_WIDTH);
      if (!compactMode && currentWidth >= fullWidth - 1) {
        setCompactToolFlyoutOpen(false);
        updateToolVisibility();
        const compactTargetWidth = isDesktopRightToolRailMode()
          ? LEFT_PALETTE_COMPACT_WIDTH
          : RAIL_MIN_WIDTH;
        setRailWidth('left', compactTargetWidth, { persist: true });
        return;
      }
      setCompactToolFlyoutOpen(false);
      updateToolVisibility();
      setRailWidth('left', fullWidth, { persist: true });
      return;
    }
    if (!compactMode) {
      setCompactRightFlyoutOpen(false);
      updateRightTabVisibility();
      const compactTargetWidth = RAIL_MIN_WIDTH;
      setRailWidth(side, compactTargetWidth, { persist: true });
      return;
    }
    setRailWidth(side, getRightTransientPanelOpenWidth(), { persist: true });
    if (!isRailCompactMode(side)) {
      setCompactRightFlyoutOpen(false);
      updateRightTabVisibility();
      return;
    }
    setCompactRightFlyoutOpen(false);
    updateRightTabVisibility();
  }

  function beginLeftUnifiedSplitResize(event) {
    if (!isLeftUnifiedSplitModeEnabled()) {
      return;
    }
    const handle = dom.resizeHandles.leftUnified;
    const toolsSection = dom.sections.tools;
    const colorSection = dom.sections.color;
    if (
      !(handle instanceof HTMLElement)
      || !(toolsSection instanceof HTMLElement)
      || !(colorSection instanceof HTMLElement)
    ) {
      return;
    }
    const toolsRect = toolsSection.getBoundingClientRect();
    const colorRect = colorSection.getBoundingClientRect();
    const totalHeight = Math.round((toolsRect.height || 0) + (colorRect.height || 0));
    if (totalHeight <= 0) {
      return;
    }
    event.preventDefault();
    leftUnifiedSplitSizing.active = true;
    leftUnifiedSplitSizing.pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
    leftUnifiedSplitSizing.startClientY = Number(event.clientY) || 0;
    leftUnifiedSplitSizing.startToolsHeight = Math.max(1, Math.round(toolsRect.height || 0));
    leftUnifiedSplitSizing.startColorHeight = Math.max(1, Math.round(colorRect.height || 0));
    leftUnifiedSplitSizing.moved = false;
    leftUnifiedSplitSizing.captureTarget = handle;
    handle.classList.add('is-active');
    document.body.classList.add('is-rail-resizing');
    if (leftUnifiedSplitSizing.pointerId !== null && typeof handle.setPointerCapture === 'function') {
      try {
        handle.setPointerCapture(leftUnifiedSplitSizing.pointerId);
      } catch (error) {
        // Ignore pointer capture failures.
      }
    }
    window.addEventListener('pointermove', handleLeftUnifiedSplitPointerMove);
    window.addEventListener('pointerup', handleLeftUnifiedSplitPointerUp);
    window.addEventListener('pointercancel', handleLeftUnifiedSplitPointerUp);
  }

  function handleLeftUnifiedSplitPointerMove(event) {
    if (!leftUnifiedSplitSizing.active || !isLeftUnifiedSplitModeEnabled()) {
      return;
    }
    if (leftUnifiedSplitSizing.pointerId !== null && event.pointerId !== leftUnifiedSplitSizing.pointerId) {
      return;
    }
    const deltaY = (Number(event.clientY) || 0) - leftUnifiedSplitSizing.startClientY;
    if (!leftUnifiedSplitSizing.moved) {
      if (Math.abs(deltaY) < RAIL_RESIZE_DRAG_THRESHOLD) {
        return;
      }
      leftUnifiedSplitSizing.moved = true;
    }
    const startTotal = Math.max(2, leftUnifiedSplitSizing.startToolsHeight + leftUnifiedSplitSizing.startColorHeight);
    const nextToolsHeight = leftUnifiedSplitSizing.startToolsHeight + deltaY;
    const bounds = getLeftUnifiedSplitRatioBounds(startTotal);
    const nextRatio = clamp(
      normalizeLeftUnifiedToolsRatio(nextToolsHeight / startTotal, leftUnifiedSplitSizing.ratio),
      bounds.min,
      bounds.max
    );
    if (Math.abs(nextRatio - leftUnifiedSplitSizing.ratio) < 0.0005) {
      return;
    }
    leftUnifiedSplitSizing.ratio = nextRatio;
    syncLeftUnifiedSplitLayout();
  }

  function endLeftUnifiedSplitResize({ persist = false } = {}) {
    const wasActive = leftUnifiedSplitSizing.active;
    const handle = leftUnifiedSplitSizing.captureTarget;
    if (handle instanceof HTMLElement) {
      handle.classList.remove('is-active');
      if (leftUnifiedSplitSizing.pointerId !== null && typeof handle.releasePointerCapture === 'function') {
        try {
          handle.releasePointerCapture(leftUnifiedSplitSizing.pointerId);
        } catch (error) {
          // Ignore pointer release failures.
        }
      }
    }
    leftUnifiedSplitSizing.active = false;
    leftUnifiedSplitSizing.pointerId = null;
    leftUnifiedSplitSizing.captureTarget = null;
    leftUnifiedSplitSizing.startClientY = 0;
    leftUnifiedSplitSizing.startToolsHeight = 0;
    leftUnifiedSplitSizing.startColorHeight = 0;
    leftUnifiedSplitSizing.moved = false;
    if (wasActive) {
      document.body.classList.remove('is-rail-resizing');
    }
    window.removeEventListener('pointermove', handleLeftUnifiedSplitPointerMove);
    window.removeEventListener('pointerup', handleLeftUnifiedSplitPointerUp);
    window.removeEventListener('pointercancel', handleLeftUnifiedSplitPointerUp);
    if (persist && wasActive) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function handleLeftUnifiedSplitPointerUp(event) {
    if (!leftUnifiedSplitSizing.active) {
      return;
    }
    if (leftUnifiedSplitSizing.pointerId !== null && event.pointerId !== leftUnifiedSplitSizing.pointerId) {
      return;
    }
    endLeftUnifiedSplitResize({ persist: Boolean(leftUnifiedSplitSizing.moved) });
  }

  function beginLeftDualSplitResize(event) {
    if (layoutMode === 'mobilePortrait' || !isDualLeftRailEnabled()) {
      return;
    }
    const handle = dom.resizeHandles.leftInner;
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    leftDualSizing.active = true;
    leftDualSizing.pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
    leftDualSizing.startClientX = Number(event.clientX) || 0;
    const startTotalWidth = Math.max(getLeftDualMinTotalWidth(), Math.round(Number(railSizing.left) || getLeftDualMinTotalWidth()));
    const startToolsWidth = normalizeLeftDualToolsWidth(leftDualSizing.tools, startTotalWidth);
    leftDualSizing.startTotalWidth = startTotalWidth;
    leftDualSizing.startToolsWidth = startToolsWidth;
    leftDualSizing.moved = false;
    leftDualSizing.captureTarget = handle;
    handle.classList.add('is-active');
    document.body.classList.add('is-rail-resizing');
    if (leftDualSizing.pointerId !== null && typeof handle.setPointerCapture === 'function') {
      try {
        handle.setPointerCapture(leftDualSizing.pointerId);
      } catch (error) {
        // Ignore pointer capture failures.
      }
    }
    window.addEventListener('pointermove', handleLeftDualSplitPointerMove);
    window.addEventListener('pointerup', handleLeftDualSplitPointerUp);
    window.addEventListener('pointercancel', handleLeftDualSplitPointerUp);
  }

  function handleLeftDualSplitPointerMove(event) {
    if (!leftDualSizing.active || !isDualLeftRailEnabled()) {
      return;
    }
    if (leftDualSizing.pointerId !== null && event.pointerId !== leftDualSizing.pointerId) {
      return;
    }
    const deltaX = (Number(event.clientX) || 0) - leftDualSizing.startClientX;
    if (!leftDualSizing.moved) {
      if (Math.abs(deltaX) < RAIL_RESIZE_DRAG_THRESHOLD) {
        return;
      }
      leftDualSizing.moved = true;
    }
    const proposedToolsWidth = leftDualSizing.startToolsWidth + deltaX;
    const proposedTotalWidth = leftDualSizing.startTotalWidth + deltaX;
    const nextTotalWidth = normalizeRailWidth('left', proposedTotalWidth);
    const nextToolsWidth = normalizeLeftDualToolsWidth(proposedToolsWidth, nextTotalWidth);
    if (nextToolsWidth === leftDualSizing.tools && nextTotalWidth === railSizing.left) {
      return;
    }
    leftDualSizing.tools = nextToolsWidth;
    setRailWidth('left', nextTotalWidth, { persist: false });
  }

  function endLeftDualSplitResize({ persist = false } = {}) {
    const handle = leftDualSizing.captureTarget;
    if (handle instanceof HTMLElement) {
      handle.classList.remove('is-active');
      if (leftDualSizing.pointerId !== null && typeof handle.releasePointerCapture === 'function') {
        try {
          handle.releasePointerCapture(leftDualSizing.pointerId);
        } catch (error) {
          // Ignore pointer release failures.
        }
      }
    }
    leftDualSizing.active = false;
    leftDualSizing.pointerId = null;
    leftDualSizing.captureTarget = null;
    leftDualSizing.startClientX = 0;
    leftDualSizing.startToolsWidth = leftDualSizing.tools;
    leftDualSizing.startTotalWidth = Math.max(getLeftDualMinTotalWidth(), Math.round(Number(railSizing.left) || getLeftDualMinTotalWidth()));
    leftDualSizing.moved = false;
    document.body.classList.remove('is-rail-resizing');
    window.removeEventListener('pointermove', handleLeftDualSplitPointerMove);
    window.removeEventListener('pointerup', handleLeftDualSplitPointerUp);
    window.removeEventListener('pointercancel', handleLeftDualSplitPointerUp);
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function handleLeftDualSplitPointerUp(event) {
    if (!leftDualSizing.active) {
      return;
    }
    if (leftDualSizing.pointerId !== null && event.pointerId !== leftDualSizing.pointerId) {
      return;
    }
    endLeftDualSplitResize({ persist: Boolean(leftDualSizing.moved) });
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
    railSizing.moved = false;
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
    if (!railSizing.moved) {
      if (Math.abs(deltaX) < RAIL_RESIZE_DRAG_THRESHOLD) {
        return;
      }
      railSizing.moved = true;
    }
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
    railSizing.moved = false;
    document.body.classList.remove('is-rail-resizing');
    window.removeEventListener('pointermove', handleRailResizePointerMove);
    window.removeEventListener('pointerup', handleRailResizePointerUp);
    window.removeEventListener('pointercancel', handleRailResizePointerUp);
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
  }

  function handleRailResizePointerUp(event) {
    const side = railSizing.activeSide;
    if (!side) {
      return;
    }
    if (railSizing.pointerId !== null && event.pointerId !== railSizing.pointerId) {
      return;
    }
    const moved = Boolean(railSizing.moved);
    if (event.type === 'pointercancel') {
      endRailResize({ persist: moved });
      return;
    }
    endRailResize({ persist: moved });
    if (!moved) {
      toggleRailFromHandle(side);
    }
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
    const bindLeftInner = handle => {
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
        beginLeftDualSplitResize(event);
      });
    };
    const bindLeftUnified = handle => {
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
        beginLeftUnifiedSplitResize(event);
      });
    };
    bind('left', dom.resizeHandles.left);
    bind('right', dom.resizeHandles.right);
    if (dom.resizeHandles.bottomTimeline instanceof HTMLElement && dom.resizeHandles.bottomTimeline.dataset.bound !== 'true') {
      dom.resizeHandles.bottomTimeline.dataset.bound = 'true';
      dom.resizeHandles.bottomTimeline.addEventListener('pointerdown', event => {
        const isPrimaryPointer =
          event.button === 0 || event.pointerType === 'touch' || event.pointerType === 'pen';
        if (!isPrimaryPointer) {
          return;
        }
        beginBottomTimelineResize(event);
      });
    }
    bindLeftInner(dom.resizeHandles.leftInner);
    bindLeftUnified(ensureLeftUnifiedSplitHandle());
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

  function getLayoutViewportBounds() {
    const width = Math.max(0, Math.round(Number(window.innerWidth) || 0));
    const height = Math.max(0, Math.round(Number(window.innerHeight) || 0));
    return {
      left: 0,
      top: 0,
      width,
      height,
      right: width,
      bottom: height,
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

  function getVisibleElementRect(element) {
    if (!(element instanceof HTMLElement) || !element.isConnected) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return rect;
  }

  function getFloatingRailReserveLimit() {
    const viewportWidth = Math.max(0, Math.round(Number(window.innerWidth) || 0));
    return Math.max(0, Math.floor(viewportWidth * 0.5));
  }

  function getLeftFloatingRailReserveWidth(leftWidth) {
    if (layoutMode === 'mobilePortrait' || !isCompactToolFlyoutOpen()) {
      return 0;
    }
    return 0;
  }

  function getActiveCompactRightFlyoutElement() {
    if (compactRightFlyoutPortal.section instanceof HTMLElement) {
      return compactRightFlyoutPortal.section;
    }
    const section = dom.sections[state.activeRightTab];
    return section instanceof HTMLElement && section.classList.contains('is-compact-flyout') ? section : null;
  }

  function getRightFloatingRailReserveWidth(rightWidth) {
    if (layoutMode === 'mobilePortrait' || !isCompactRightFlyoutOpen()) {
      return 0;
    }
    if (isDesktopRightToolRailMode()) {
      return 0;
    }
    const railRect = getVisibleElementRect(dom.rightRail);
    const viewportWidth = Math.max(0, Math.round(Number(window.innerWidth) || 0));
    const railLeft = railRect
      ? Math.round(railRect.left)
      : Math.max(0, viewportWidth - Math.max(0, Math.round(Number(rightWidth) || 0)));
    const flyoutRect = getVisibleElementRect(getActiveCompactRightFlyoutElement());
    if (!flyoutRect || flyoutRect.left >= railLeft) {
      return 0;
    }
    return clamp(Math.ceil(railLeft - flyoutRect.left), 0, getFloatingRailReserveLimit());
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

  function scheduleMirrorGuideRefresh() {
    updateMirrorGuideHandles();
    if (mirrorGuideSyncRaf !== null) {
      window.cancelAnimationFrame(mirrorGuideSyncRaf);
    }
    mirrorGuideSyncRaf = window.requestAnimationFrame(() => {
      mirrorGuideSyncRaf = null;
      updateMirrorGuideHandles();
    });
  }

  function scheduleCanvasResizeHandleLayoutRefresh() {
    if (canvasResizeHandleLayoutRaf !== null) {
      window.cancelAnimationFrame(canvasResizeHandleLayoutRaf);
    }
    canvasResizeHandleLayoutRaf = window.requestAnimationFrame(() => {
      canvasResizeHandleLayoutRaf = window.requestAnimationFrame(() => {
        canvasResizeHandleLayoutRaf = null;
        updateCanvasResizeHandlePosition();
        syncCanvasResizeHandleVisibility();
        updateMirrorGuideHandles();
      });
    });
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
    scheduleMirrorGuideRefresh();
    scheduleCanvasResizeHandleLayoutRefresh();
    if (isMirrorToolPopoverOpen()) {
      positionMirrorToolPopover();
    }
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

  function getNextMobileDrawerMode(mode) {
    const normalizedMode = normalizeMobileDrawerMode(mode);
    const currentIndex = MOBILE_DRAWER_MODE_ORDER.indexOf(normalizedMode);
    if (currentIndex === -1) {
      return MOBILE_DRAWER_DEFAULT_MODE;
    }
    return MOBILE_DRAWER_MODE_ORDER[(currentIndex + 1) % MOBILE_DRAWER_MODE_ORDER.length];
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
    updateCanvasControlButtons();
    if (persist) {
      scheduleSessionPersist();
    }
  }

  function syncMobileQuickPanelButtons(activeTarget = '') {
    if (!Array.isArray(dom.mobileQuickPanelButtons)) {
      return;
    }
    dom.mobileQuickPanelButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      const target = button.dataset.mobileQuickOpenPanel || '';
      const isToolsTarget = target === 'tools' && (activeTarget === 'tools' || activeTarget === 'color');
      const isActive = Boolean(target) && (target === activeTarget || isToolsTarget);
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function getActiveMobilePanelKey() {
    const activePanelEntry = Object.entries(dom.mobilePanels || {}).find(([, panel]) => (
      panel instanceof HTMLElement && panel.classList.contains('is-active') && !panel.hidden
    ));
    if (activePanelEntry) {
      return activePanelEntry[0] || '';
    }
    if (!Array.isArray(dom.mobileTabs)) {
      return '';
    }
    const activeTab = dom.mobileTabs.find(tab => tab instanceof HTMLElement && tab.classList.contains('is-active'));
    return activeTab?.dataset?.mobileTab || '';
  }

  function getMobilePanelScrollBody(panel) {
    if (!(panel instanceof HTMLElement)) {
      return null;
    }
    const body = panel.querySelector('.panel-section__body');
    return body instanceof HTMLElement ? body : null;
  }

  function captureMobilePanelScrollState(panelKey = getActiveMobilePanelKey()) {
    if (layoutMode !== 'mobilePortrait') {
      return null;
    }
    const normalizedKey = isUnifiedLeftToolsColorMode() && panelKey === 'color' ? 'tools' : panelKey;
    const panel = normalizedKey ? dom.mobilePanels[normalizedKey] : null;
    if (!(panel instanceof HTMLElement)) {
      return null;
    }
    const body = getMobilePanelScrollBody(panel);
    return {
      key: normalizedKey,
      containerTop: dom.mobilePanelsContainer instanceof HTMLElement ? dom.mobilePanelsContainer.scrollTop : 0,
      panelTop: panel.scrollTop,
      bodyTop: body instanceof HTMLElement ? body.scrollTop : 0,
    };
  }

  function restoreMobilePanelScrollState(scrollState, { defer = true } = {}) {
    if (!scrollState || layoutMode !== 'mobilePortrait') {
      return;
    }
    const restore = () => {
      if (!scrollState || getActiveMobilePanelKey() !== scrollState.key) {
        return;
      }
      const panel = dom.mobilePanels[scrollState.key];
      if (dom.mobilePanelsContainer instanceof HTMLElement) {
        dom.mobilePanelsContainer.scrollTop = scrollState.containerTop || 0;
      }
      if (panel instanceof HTMLElement) {
        panel.scrollTop = scrollState.panelTop || 0;
        const body = getMobilePanelScrollBody(panel);
        if (body instanceof HTMLElement) {
          body.scrollTop = scrollState.bodyTop || 0;
        }
      }
    };
    restore();
    if (defer && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(restore);
    }
  }

  function activateMobileTab(target, { ensureDrawer = false } = {}) {
    const normalizedTarget = isUnifiedLeftToolsColorMode() && target === 'color'
      ? 'tools'
      : target;
    if (normalizedTarget === 'extensions') {
      notifyExtensionsUnavailable();
      return false;
    }
    if (isMobileSpectatorTabLockActive() && target !== 'multi') {
      return false;
    }
    if (!normalizedTarget || !dom.mobilePanels[normalizedTarget]) {
      return false;
    }
    let activated = false;
    const prevActiveKey = getActiveMobilePanelKey();
    if (prevActiveKey === normalizedTarget && !ensureDrawer) {
      return true;
    }
    const hasVisibleTab = Array.isArray(dom.mobileTabs)
      && dom.mobileTabs.some(btn => btn?.dataset?.mobileTab === normalizedTarget);
    dom.mobileTabs.forEach(btn => {
      const key = btn.dataset.mobileTab;
      const isActive = hasVisibleTab && key === normalizedTarget;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        btn.removeAttribute('tabindex');
      } else {
        btn.setAttribute('tabindex', '-1');
      }
    });
    Object.entries(dom.mobilePanels).forEach(([key, panel]) => {
      if (!(panel instanceof HTMLElement)) {
        return;
      }
      const isActive = key === normalizedTarget;
      if (isActive) {
        activated = true;
      }
      panel.classList.toggle('is-active', isActive);
      panel.toggleAttribute('hidden', !isActive);
    });

    if (activated && ensureDrawer && layoutMode === 'mobilePortrait') {
      const requiredMode = MOBILE_TAB_DRAWER_MODE[normalizedTarget] || MOBILE_DRAWER_DEFAULT_MODE;
      if (getMobileDrawerModeRank(mobileDrawerState.mode) < getMobileDrawerModeRank(requiredMode)) {
        setMobileDrawerMode(requiredMode, { persist: false });
      }
    }
    if (activated && normalizedTarget !== 'tools' && isCompactToolFlyoutOpen()) {
      setCompactToolFlyoutOpen(false);
    }
    if (activated) {
      if (layoutMode === 'mobilePortrait') {
        // Only reset scroll when switching from a different panel.
        // Avoid forcing scrollTop = 0 if the panel was already active
        // (for example, when interacting with controls inside the same panel
        // such as color swatches) which caused an unwanted jump.
        if (prevActiveKey !== normalizedTarget) {
          if (dom.mobilePanelsContainer instanceof HTMLElement) {
            dom.mobilePanelsContainer.scrollTop = 0;
          }
          const activePanel = dom.mobilePanels[normalizedTarget];
          if (activePanel instanceof HTMLElement) {
            activePanel.scrollTop = 0;
            const activeBody = activePanel.querySelector('.panel-section__body');
            if (activeBody instanceof HTMLElement) {
              activeBody.scrollTop = 0;
            }
          }
        }
      }
      updateToolVisibility();
      syncMobileQuickPanelButtons(normalizedTarget);
      if (normalizedTarget === 'multi') {
        scheduleMultiEntryScreenMetricsUpdate();
      }
    }
    return activated;
  }

  function isMobileSpectatorTabLockActive() {
    return layoutMode === 'mobilePortrait' && isMultiSpectatorMode();
  }

  function getExtensionsUnavailableMessage() {
    return localizeText(
      '今は使用不可です。\n立体作成モードは設定のトグルへ移動しました。',
      'Extensions are currently unavailable.\nVoxel creation mode has moved to the Settings toggle.'
    );
  }

  function notifyExtensionsUnavailable() {
    const message = getExtensionsUnavailableMessage();
    updateAutosaveStatus(message.replace(/\n/g, ' '), 'info');
    window.alert(message);
  }

  function enforceMobileSpectatorTabLock({ forceActivate = true } = {}) {
    const locked = isMobileSpectatorTabLockActive();
    if (Array.isArray(dom.mobileTabs)) {
      dom.mobileTabs.forEach(tab => {
        if (!(tab instanceof HTMLButtonElement)) {
          return;
        }
        const key = tab.dataset.mobileTab || '';
        const isMultiTab = key === 'multi';
        if (locked) {
          tab.disabled = !isMultiTab;
          tab.setAttribute('aria-disabled', String(!isMultiTab));
        } else {
          tab.disabled = false;
          tab.removeAttribute('aria-disabled');
        }
      });
    }
    if (locked && forceActivate) {
      const activeKey = Array.isArray(dom.mobileTabs)
        ? (dom.mobileTabs.find(tab => tab.classList.contains('is-active'))?.dataset.mobileTab || '')
        : '';
      if (activeKey !== 'multi') {
        activateMobileTab('multi', { ensureDrawer: false });
      }
    }
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
    if (snap) {
      const fallbackHeight = mobileDrawerState.heights[mobileDrawerState.mode] || mobileDrawerState.heights.half;
      const snapHeight = mobileDrawerState.drag.currentHeight || mobileDrawerState.drag.startHeight || fallbackHeight;
      const resolvedMode = getClosestMobileDrawerMode(snapHeight);
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
    const moved = Boolean(mobileDrawerState.drag.moved);
    if (event.type === 'pointercancel') {
      endMobileDrawerDrag({ persist: moved });
      return;
    }
    if (!moved) {
      // A tap is a discrete half/full toggle. Do not infer the source mode
      // from a transitioning DOM height: that could turn an intended open
      // into a close when the previous height animation has not settled.
      const currentMode = mobileDrawerState.mode;
      endMobileDrawerDrag({ persist: false, snap: false });
      setMobileDrawerMode(getNextMobileDrawerMode(currentMode), { persist: true });
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
      let nextMode = null;
      if (event.key === 'Home') {
        nextMode = 'half';
      } else if (event.key === 'End') {
        nextMode = 'full';
      } else if (event.key === 'ArrowUp') {
        nextMode = 'full';
      } else if (event.key === 'ArrowDown') {
        nextMode = 'half';
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
            scheduleSoftKeyboardInputAlignment({ delay: 140, force: true });
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
        alignFocusedInputForSoftKeyboard();
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
      bindTabKeyboardNavigation(tab, () => dom.mobileTabs);
      tab.addEventListener('click', () => {
        const target = tab.dataset.mobileTab;
        if (!target) {
          return;
        }
        if (isMobileSpectatorTabLockActive() && target !== 'multi') {
          activateMobileTab('multi', { ensureDrawer: false });
          return;
        }
        activateMobileTab(target, { ensureDrawer: false });
      });
    });
    dom.mobileQuickPanelButtons = Array.from(document.querySelectorAll('[data-mobile-quick-open-panel]'));
    dom.mobileQuickPanelButtons.forEach(button => {
      if (!(button instanceof HTMLButtonElement) || button.dataset.mobileQuickPanelBound === 'true') {
        return;
      }
      button.dataset.mobileQuickPanelBound = 'true';
      button.addEventListener('click', () => {
        const target = button.dataset.mobileQuickOpenPanel || '';
        if (!target) {
          return;
        }
        activateMobileTab(target, { ensureDrawer: true });
      });
    });
    if (dom.mobilePanelsContainer instanceof HTMLElement && dom.mobilePanelsContainer.dataset.scrollPreserveBound !== 'true') {
      dom.mobilePanelsContainer.dataset.scrollPreserveBound = 'true';
      let pendingMobilePanelScrollState = null;
      dom.mobilePanelsContainer.addEventListener('pointerdown', event => {
        if (layoutMode !== 'mobilePortrait') {
          pendingMobilePanelScrollState = null;
          return;
        }
        const target = event.target instanceof Element ? event.target : null;
        pendingMobilePanelScrollState = target?.closest('button, [role="button"]')
          ? captureMobilePanelScrollState()
          : null;
      }, { passive: true });
      dom.mobilePanelsContainer.addEventListener('click', () => {
        if (!pendingMobilePanelScrollState) {
          return;
        }
        const scrollState = pendingMobilePanelScrollState;
        pendingMobilePanelScrollState = null;
        restoreMobilePanelScrollState(scrollState);
      }, true);
    }
    setupRailResizers();
    setupMobileDrawerInteractions();
    updateLayoutMode();
    updateRailToggleVisibility();
  }

        return Object.freeze({
          validateBoundsObject,
          getMainCanvasViewportElement,
          getViewportVisibilityTargetSurface,
          getViewportPanelBoundsRect,
          getPrimaryViewportCanvasRect,
          clampPanToKeepRectIntersectingViewport,
          clampPanToKeepAnyCanvasVisible,
          centerProjectCanvasInViewport,
          isMainCanvasPanelCssCentered,
          resetOpenedDocumentViewport,
          applyViewportTransform,
          hasReferenceElements,
          updateReferenceStatus,
          clearReferenceImage,
          getReferenceViewportScaleLimit,
          applyReferenceScale,
          setReferenceScale,
          getReferenceAnchorPoint,
          onReferenceHandlePointerDown,
          onReferenceHandlePointerMove,
          onReferenceHandlePointerUp,
          setReferenceActive,
          loadReferenceImage,
          setupReferenceOverlay,
          runDeferredUiSetup,
          scheduleDeferredUiSetup,
          getActiveTool,
          getLeftDualMinTotalWidth,
          normalizeLeftDualToolsWidth,
          normalizeLeftUnifiedToolsRatio,
          measureLeftUnifiedSectionMinimumHeight,
          getLeftUnifiedSplitMinimumHeights,
          getLeftUnifiedSplitRatioBounds,
          ensureLeftUnifiedSplitHandle,
          isLeftUnifiedSplitModeEnabled,
          syncLeftUnifiedSplitLayout,
          clearLeftDualRailLayout,
          syncLeftDualRailLayout,
          getRailNode,
          getRailCssVarName,
          normalizeRailWidth,
          updateRailCompactState,
          isRailCompactMode,
          getRailExpandedToggleWidth,
          openLeftRailMaxWidth,
          scheduleRailLayoutRefresh,
          setRailWidth,
          isBottomTimelineDockEnabled,
          normalizeBottomTimelineHeight,
          setBottomTimelineHeight,
          syncBottomTimelineDockState,
          beginBottomTimelineResize,
          handleBottomTimelinePointerMove,
          endBottomTimelineResize,
          handleBottomTimelinePointerUp,
          toggleRailFromHandle,
          beginLeftUnifiedSplitResize,
          handleLeftUnifiedSplitPointerMove,
          endLeftUnifiedSplitResize,
          handleLeftUnifiedSplitPointerUp,
          beginLeftDualSplitResize,
          handleLeftDualSplitPointerMove,
          endLeftDualSplitResize,
          handleLeftDualSplitPointerUp,
          beginRailResize,
          handleRailResizePointerMove,
          endRailResize,
          handleRailResizePointerUp,
          setupRailResizers,
          normalizeMobileDrawerMode,
          getMobileDrawerModeRank,
          getViewportSize,
          getViewportBounds,
          getLayoutViewportBounds,
          getSafeAreaInsets,
          getVisibleElementRect,
          getFloatingRailReserveLimit,
          getLeftFloatingRailReserveWidth,
          getActiveCompactRightFlyoutElement,
          getRightFloatingRailReserveWidth,
          updateMobileViewportHeightVar,
          scheduleMirrorGuideRefresh,
          scheduleCanvasResizeHandleLayoutRefresh,
          applyMobileDrawerHeight,
          getClosestMobileDrawerMode,
          getNextMobileDrawerMode,
          setMobileDrawerMode,
          syncMobileQuickPanelButtons,
          getActiveMobilePanelKey,
          getMobilePanelScrollBody,
          captureMobilePanelScrollState,
          restoreMobilePanelScrollState,
          activateMobileTab,
          isMobileSpectatorTabLockActive,
          getExtensionsUnavailableMessage,
          notifyExtensionsUnavailable,
          enforceMobileSpectatorTabLock,
          endMobileDrawerDrag,
          handleMobileDrawerPointerMove,
          handleMobileDrawerPointerUp,
          beginMobileDrawerDrag,
          setupMobileDrawerInteractions,
          setupLayout,
        });
      }
    })(scope);
  }

  root.layoutViewport = {
    createLayoutStaticConfig,
    createLayoutViewportModule,
  };
})();
