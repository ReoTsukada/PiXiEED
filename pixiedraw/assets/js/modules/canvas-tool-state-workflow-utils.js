(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createCanvasToolStateWorkflowUtils(rawScope = {}) {
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
  function makeIcon(name, fallback, opts = {}) {
    const img = new Image(opts.width || 24, opts.height || 24);
    const extension = typeof opts.extension === 'string' && opts.extension.trim()
      ? opts.extension.trim().replace(/^\.+/, '')
      : 'svg';
    img.src = `assets/icons/${name}.${extension}`;
    img.alt = fallback;
    img.width = opts.width || 24;
    img.height = opts.height || 24;
    return img;
  }

  function createInitialMirrorState(width, height) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || DEFAULT_CANVAS_SIZE));
    const safeHeight = Math.max(1, Math.floor(Number(height) || DEFAULT_CANVAS_SIZE));
    return {
      enabled: false,
      axisX: (safeWidth - 1) / 2,
      axisY: (safeHeight - 1) / 2,
      axes: {
        [MIRROR_AXIS_VERTICAL]: DEFAULT_MIRROR_AXES[MIRROR_AXIS_VERTICAL],
        [MIRROR_AXIS_HORIZONTAL]: DEFAULT_MIRROR_AXES[MIRROR_AXIS_HORIZONTAL],
        [MIRROR_AXIS_DIAGONAL_A]: DEFAULT_MIRROR_AXES[MIRROR_AXIS_DIAGONAL_A],
        [MIRROR_AXIS_DIAGONAL_B]: DEFAULT_MIRROR_AXES[MIRROR_AXIS_DIAGONAL_B],
      },
    };
  }

  function clampMirrorAxisX(value, width = state.width) {
    const safeWidth = Math.max(1, Math.floor(Number(width) || 1));
    const clamped = clamp(Number(value), -0.5, safeWidth - 0.5);
    return Math.round(clamped * 2) / 2;
  }

  function clampMirrorAxisY(value, height = state.height) {
    const safeHeight = Math.max(1, Math.floor(Number(height) || 1));
    const clamped = clamp(Number(value), -0.5, safeHeight - 0.5);
    return Math.round(clamped * 2) / 2;
  }

  function normalizeMirrorAxisState(mirrorState, width = state.width, height = state.height) {
    const fallback = createInitialMirrorState(width, height);
    const source = mirrorState && typeof mirrorState === 'object' ? mirrorState : fallback;
    const axesSource = source.axes && typeof source.axes === 'object' ? source.axes : {};
    const normalized = {
      enabled: Boolean(source.enabled),
      axisX: clampMirrorAxisX(Number.isFinite(source.axisX) ? source.axisX : fallback.axisX, width),
      axisY: clampMirrorAxisY(Number.isFinite(source.axisY) ? source.axisY : fallback.axisY, height),
      axes: {},
    };
    MIRROR_AXIS_KEYS.forEach(axis => {
      const value = Object.prototype.hasOwnProperty.call(axesSource, axis)
        ? axesSource[axis]
        : fallback.axes[axis];
      normalized.axes[axis] = Boolean(value);
    });
    if (!normalized.enabled) {
      MIRROR_AXIS_KEYS.forEach(axis => {
        normalized.axes[axis] = false;
      });
    }
    return normalized;
  }

  function hasActiveMirrorAxes(mirrorState = state.mirror) {
    if (!mirrorState || !mirrorState.axes) {
      return false;
    }
    return MIRROR_AXIS_KEYS.some(axis => Boolean(mirrorState.axes[axis]));
  }

  function getNormalizedMirrorState() {
    state.mirror = normalizeMirrorAxisState(state.mirror, state.width, state.height);
    return state.mirror;
  }

  function resetMirrorPivotToCanvasCenter(mirrorState) {
    const centered = createInitialMirrorState(state.width, state.height);
    mirrorState.axisX = centered.axisX;
    mirrorState.axisY = centered.axisY;
  }

  function normalizeVoxelExtensionState(source, fallback = VOXEL_EXTENSION_DEFAULT_STATE) {
    const settings = source && typeof source === 'object' ? source : {};
    const safeFallback = fallback && typeof fallback === 'object'
      ? fallback
      : VOXEL_EXTENSION_DEFAULT_STATE;
    const mode = settings.mode === EXTENSION_MODE_VOXEL
      ? EXTENSION_MODE_VOXEL
      : (safeFallback.mode === EXTENSION_MODE_VOXEL ? EXTENSION_MODE_VOXEL : EXTENSION_MODE_NONE);
    const normalizeCanvasId = (value, fallbackValue = '') => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof fallbackValue === 'string' && fallbackValue.trim()) {
        return fallbackValue.trim();
      }
      return '';
    };
    const normalizePreviewYaw = (value, fallbackValue = VOXEL_EXTENSION_DEFAULT_YAW_DEG) => {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        return Math.round(numericValue);
      }
      const numericFallback = Number(fallbackValue);
      if (Number.isFinite(numericFallback)) {
        return Math.round(numericFallback);
      }
      return VOXEL_EXTENSION_DEFAULT_YAW_DEG;
    };
    const normalizePreviewPitch = (value, fallbackValue = VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG) => {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        return clamp(
          Math.round(numericValue),
          VOXEL_EXTENSION_PREVIEW_PITCH_MIN_DEG,
          VOXEL_EXTENSION_PREVIEW_PITCH_MAX_DEG
        );
      }
      const numericFallback = Number(fallbackValue);
      if (Number.isFinite(numericFallback)) {
        return clamp(
          Math.round(numericFallback),
          VOXEL_EXTENSION_PREVIEW_PITCH_MIN_DEG,
          VOXEL_EXTENSION_PREVIEW_PITCH_MAX_DEG
        );
      }
      return VOXEL_EXTENSION_PREVIEW_ELEVATION_DEG;
    };
    const normalizeDisplayPx = (value, fallbackValue = 0) => {
      const numericValue = Number(value);
      if (Number.isFinite(numericValue)) {
        return clamp(Math.round(numericValue), VOXEL_EXTENSION_DISPLAY_PIXEL_MIN, VOXEL_EXTENSION_DISPLAY_PIXEL_MAX);
      }
      const numericFallback = Number(fallbackValue);
      if (Number.isFinite(numericFallback)) {
        return clamp(Math.round(numericFallback), VOXEL_EXTENSION_DISPLAY_PIXEL_MIN, VOXEL_EXTENSION_DISPLAY_PIXEL_MAX);
      }
      return 0;
    };
    return {
      mode,
      frontCanvasId: normalizeCanvasId(settings.frontCanvasId, safeFallback.frontCanvasId),
      backCanvasId: normalizeCanvasId(settings.backCanvasId, safeFallback.backCanvasId),
      leftCanvasId: normalizeCanvasId(settings.leftCanvasId, safeFallback.leftCanvasId),
      rightCanvasId: normalizeCanvasId(settings.rightCanvasId, safeFallback.rightCanvasId),
      topCanvasId: normalizeCanvasId(settings.topCanvasId, safeFallback.topCanvasId),
      bottomCanvasId: normalizeCanvasId(settings.bottomCanvasId, safeFallback.bottomCanvasId),
      previewCanvasId: normalizeCanvasId(settings.previewCanvasId, safeFallback.previewCanvasId),
      previewYawDeg: normalizePreviewYaw(settings.previewYawDeg, safeFallback.previewYawDeg),
      previewPitchDeg: normalizePreviewPitch(settings.previewPitchDeg, safeFallback.previewPitchDeg),
      displayPx: normalizeDisplayPx(settings.displayPx, safeFallback.displayPx),
    };
  }

  function collapseToSingleProjectCanvasSource(canvases, activeCanvasId = '') {
    const sourceCanvases = Array.isArray(canvases) && canvases.length
      ? canvases
      : [createProjectCanvasDocument({}, { clonePixelData: false, fallbackIndex: 1 })];
    if (MULTI_CANVAS_FEATURE_ENABLED) {
      return sourceCanvases;
    }
    const activeSource = sourceCanvases.find(canvas => canvas?.id === activeCanvasId) || sourceCanvases[0] || {};
    return [activeSource];
  }

  function shouldIncludeProjectCanvasPayload(snapshot = null) {
    if (!MULTI_CANVAS_FEATURE_ENABLED) {
      return false;
    }
    const canvases = Array.isArray(snapshot?.canvases)
      ? snapshot.canvases
      : getProjectCanvasDocuments();
    return Array.isArray(canvases) && canvases.length > 1;
  }

  function isGradientFillStyle(value = state.fillStyle) {
    const normalized = normalizeFillStyle(value, FILL_STYLE_SOLID);
    return normalized === FILL_STYLE_RGB_GRADIENT || normalized === FILL_STYLE_DITHER_GRADIENT;
  }

  function getFillStyleForTool(tool = state.tool) {
    if (tool === FILL_TOOL_DITHER) {
      return FILL_STYLE_DITHER_GRADIENT;
    }
    if (tool === FILL_TOOL_GRADIENT) {
      return FILL_STYLE_RGB_GRADIENT;
    }
    return FILL_STYLE_SOLID;
  }

  function hasFillDrag(start, end) {
    if (!start || !end) {
      return false;
    }
    return Math.round(Number(start.x) || 0) !== Math.round(Number(end.x) || 0)
      || Math.round(Number(start.y) || 0) !== Math.round(Number(end.y) || 0);
  }

  function getFillStyleForInteraction(tool = state.tool, start = null, end = null) {
    const baseStyle = getFillStyleForTool(tool);
    if (tool === FILL_TOOL_SOLID && hasFillDrag(start, end)) {
      return FILL_STYLE_RGB_GRADIENT;
    }
    return baseStyle;
  }

  function getActiveFillStyle(tool = state.tool) {
    return FILL_TOOLS.has(tool)
      ? getFillStyleForTool(tool)
      : normalizeFillStyle(state.fillStyle, FILL_STYLE_SOLID);
  }

  function getCustomBrushPixelCount(brush = state.customBrush) {
    if (!isCustomBrushData(brush)) {
      return 0;
    }
    return clamp(Math.round(Number(brush.pixelCount) || 0), 0, CUSTOM_BRUSH_MAX_PIXELS);
  }

  function hasCustomBrushData(brush = state.customBrush) {
    return getCustomBrushPixelCount(brush) > 0;
  }

  function getEffectiveBrushShape(shape = state.brushShape) {
    const normalized = normalizeBrushShape(shape, BRUSH_SHAPE_SQUARE);
    if (normalized === BRUSH_SHAPE_CUSTOM && !hasCustomBrushData()) {
      return BRUSH_SHAPE_SQUARE;
    }
    return normalized;
  }

  function setupTools() {
    toolButtons = Array.from(document.querySelectorAll('.tool-button[data-tool]'));
    toolButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tool = button.dataset.tool;
        if (!tool) return;
        // Prevent tool changes for spectators: only allow pan-related interactions
        if (isMultiSpectatorMode()) {
          // allow switching to pan (so viewers can pan/zoom)
          if (tool === 'pan') {
            setActiveTool(tool);
            return;
          }
          setMultiStatus(localizeText('視聴モードではツールを使用できません', 'Tools are disabled in viewer mode'), 'warn');
          return;
        }
        if (TOOL_ACTIONS.has(tool)) {
          focusUnifiedLeftContext('tools', { persist: false });
          if (isCompactToolRailMode() || isMobilePeekToolFlyoutMode()) {
            const actionAnchor = document.querySelector(`.tool-group-button[data-ui-action="${tool}"]`);
            compactToolFlyoutAnchorButton = actionAnchor instanceof HTMLElement ? actionAnchor : button;
            setCompactToolFlyoutOpen(true, { force: isMobilePeekToolFlyoutMode() });
            updateToolVisibility();
          }
          runToolAction(tool, { sourceButton: button });
          return;
        }
        setActiveTool(tool);
        if (isCompactToolRailMode() || isMobilePeekToolFlyoutMode()) {
          const group = TOOL_TO_GROUP[tool];
          const groupButton = group
            ? document.querySelector(`.tool-group-button[data-tool-group="${group}"]`)
            : null;
          compactToolFlyoutAnchorButton = groupButton instanceof HTMLElement ? groupButton : button;
          setCompactToolFlyoutOpen(true, { force: isMobilePeekToolFlyoutMode() });
          updateToolVisibility();
        }
      });
    });
    setActiveTool(state.tool, toolButtons, { persist: false });
    updateVirtualCursorActionToolButtons();

    getProjectCanvasSurfaceEntries().forEach(surface => {
      if (surface?.drawing instanceof HTMLCanvasElement) {
        bindCanvasSurfaceInteractionEvents(surface.drawing);
      }
    });
    window.addEventListener('pointercancel', handlePointerCancel);
  }

  function setActiveTool(tool, buttons = toolButtons, options = {}) {
    const { persist = true, skipGroupUpdate = false } = options;
    if (!tool) return;
    // Prevent active tool changes for spectators, except allowing 'pan'
    if (isMultiSpectatorMode() && tool !== 'pan') {
      setMultiStatus(localizeText('視聴モードではツールを切替できません', 'Cannot switch tools in viewer mode'), 'warn');
      return;
    }
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
    if (FILL_TOOLS.has(tool)) {
      state.fillStyle = getFillStyleForTool(tool);
    }
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
    if (!(tool === 'move' || tool === 'selectRect' || tool === 'selectLasso' || tool === 'selectSame')) {
      hideSelectionTransformMenu();
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
    syncBrushSizeFieldVisibility();
    syncSelectSameModeControls();
    syncFillStyleControls();
    syncSelectionShapeModeControls();
    updateCanvasControlButtons();
    updateToolTabIcon();
    focusUnifiedLeftContext('tools', { persist: false });
    const mobilePeekMode = isMobilePeekToolFlyoutMode();
    const desktopCompactMode = isCompactToolRailMode() && layoutMode !== 'mobilePortrait';
    if (mobilePeekMode && isCompactToolFlyoutOpen()) {
      setCompactToolFlyoutOpen(false);
      updateToolVisibility();
    } else if (desktopCompactMode && isCompactToolFlyoutOpen()) {
      updateToolVisibility();
      updateCompactToolFlyoutPosition();
    }
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
  }

  function normalizeColorMode(mode, fallback = COLOR_MODE_INDEX) {
    if (mode === COLOR_MODE_INDEX || mode === COLOR_MODE_RGB) {
      return mode;
    }
    return fallback === COLOR_MODE_RGB ? COLOR_MODE_RGB : COLOR_MODE_INDEX;
  }

  function isRgbColorMode(mode = state.colorMode) {
    return normalizeColorMode(mode, COLOR_MODE_INDEX) === COLOR_MODE_RGB;
  }

  function isIndexColorMode(mode = state.colorMode) {
    return !isRgbColorMode(mode);
  }

  function colorsMatchRgba(a, b) {
    if (!a || !b) {
      return false;
    }
    return Number(a.r) === Number(b.r)
      && Number(a.g) === Number(b.g)
      && Number(a.b) === Number(b.b)
      && Number(a.a) === Number(b.a);
  }

  function getPaletteEditorTargetColor() {
    if (isRgbColorMode()) {
      return normalizeColorValue(state.activeRgb);
    }
    const paletteColor = state.palette[state.activePaletteIndex];
    if (paletteColor) {
      return normalizeColorValue(paletteColor);
    }
    return normalizeColorValue(state.activeRgb);
  }

  function canCurrentClientEditPaletteColors() {
    return !isMultiSpectatorMode();
  }

  function isMultiPaletteIsolationEnabled() {
    return Boolean(multiState.connected);
  }

  function canCurrentClientReindexPalette() {
    if (isMultiPaletteIsolationEnabled()) {
      return !isMultiSpectatorMode();
    }
    return !isMultiGuestMode() && !isMultiSpectatorMode();
  }

  function announcePaletteReindexRestriction() {
    if (isMultiSpectatorMode()) {
      setMultiStatus(
        localizeText(
          '視聴モードではローカルパレットを変更できません',
          'View-only mode cannot edit the local palette.'
        ),
        'warn'
      );
      return;
    }
    setMultiStatus(
      localizeText(
        'パレットの並び替えはマスターのみ実行できます',
        'Only the master can reorder palette colors'
      ),
      'warn'
    );
  }

  function forEachProjectCanvasLayer(visitor) {
    if (typeof visitor !== 'function') {
      return;
    }
    getProjectCanvasDocuments().forEach((canvasDoc, canvasIndex) => {
      const frames = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames : [];
      frames.forEach((frame, frameIndex) => {
        const layers = Array.isArray(frame?.layers) ? frame.layers : [];
        layers.forEach((layer, layerIndex) => {
          visitor({
            canvasDoc,
            canvasIndex,
            frame,
            frameIndex,
            layer,
            layerIndex,
          });
        });
      });
    });
  }

  function getSnapshotCanvasLikeDocuments(snapshot) {
    if (Array.isArray(snapshot?.canvases) && snapshot.canvases.length) {
      return snapshot.canvases;
    }
    if (Array.isArray(snapshot?.frames) && snapshot.frames.length) {
      return [{
        id: typeof snapshot?.activeCanvasId === 'string' ? snapshot.activeCanvasId : '',
        width: snapshot?.width,
        height: snapshot?.height,
        frames: snapshot.frames,
      }];
    }
    return [];
  }

  function forEachSnapshotCanvasLayer(snapshot, visitor) {
    if (!snapshot || typeof snapshot !== 'object' || typeof visitor !== 'function') {
      return;
    }
    getSnapshotCanvasLikeDocuments(snapshot).forEach((canvasDoc, canvasIndex) => {
      const frames = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames : [];
      frames.forEach((frame, frameIndex) => {
        const layers = Array.isArray(frame?.layers) ? frame.layers : [];
        layers.forEach((layer, layerIndex) => {
          visitor({
            canvasDoc,
            canvasIndex,
            frame,
            frameIndex,
            layer,
            layerIndex,
          });
        });
      });
    });
  }

  function getTransparentPaletteIndex(palette = state.palette) {
    if (!Array.isArray(palette) || !palette.length) {
      return -1;
    }
    for (let index = 0; index < palette.length; index += 1) {
      const color = normalizeColorValue(palette[index]);
      if (color.a <= 0) {
        return index;
      }
    }
    return -1;
  }

  function normalizePaletteIndex(index, fallbackIndex = 0) {
    const length = Math.max(1, Number(state.palette?.length) || 0);
    const fallback = Number.isFinite(fallbackIndex) ? Math.round(fallbackIndex) : 0;
    const raw = Number.isFinite(index) ? Math.round(index) : fallback;
    return clamp(raw, 0, length - 1);
  }

        return Object.freeze({
          makeIcon,
          createInitialMirrorState,
          clampMirrorAxisX,
          clampMirrorAxisY,
          normalizeMirrorAxisState,
          hasActiveMirrorAxes,
          getNormalizedMirrorState,
          resetMirrorPivotToCanvasCenter,
          normalizeVoxelExtensionState,
          collapseToSingleProjectCanvasSource,
          shouldIncludeProjectCanvasPayload,
          isGradientFillStyle,
          getFillStyleForTool,
          hasFillDrag,
          getFillStyleForInteraction,
          getActiveFillStyle,
          getCustomBrushPixelCount,
          hasCustomBrushData,
          getEffectiveBrushShape,
          setupTools,
          setActiveTool,
          normalizeColorMode,
          isRgbColorMode,
          isIndexColorMode,
          colorsMatchRgba,
          getPaletteEditorTargetColor,
          canCurrentClientEditPaletteColors,
          isMultiPaletteIsolationEnabled,
          canCurrentClientReindexPalette,
          announcePaletteReindexRestriction,
          forEachProjectCanvasLayer,
          getSnapshotCanvasLikeDocuments,
          forEachSnapshotCanvasLayer,
          getTransparentPaletteIndex,
          normalizePaletteIndex,
        });
      }
    })(scope);
  }

  root.canvasToolStateWorkflowUtils = Object.freeze({
    createCanvasToolStateWorkflowUtils,
  });
})();
