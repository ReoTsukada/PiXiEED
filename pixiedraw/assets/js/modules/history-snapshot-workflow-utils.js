(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createHistorySnapshotWorkflowUtils(rawScope = {}) {
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
  function makeHistorySnapshot({ includeUiState = true, includeSelection = true, clonePixelData = true } = {}) {
    // Pending selection move/transform keeps source pixels cleared until confirm.
    // For persistence/reload snapshots we must materialize that preview placement,
    // so force pixel cloning when a pending move exists.
    const effectiveClonePixelData = clonePixelData || Boolean(getPendingSelectionMoveState());
    if (isVoxelExtensionModeEnabled()) {
      syncVoxelExtensionPreviewFromSource({ updateViewport: false });
    }
    const snapshot = {
      width: state.width,
      height: state.height,
      scale: state.scale,
      pan: { x: state.pan.x, y: state.pan.y },
      palette: state.palette.map(color => normalizeColorValue(color)),
      activePaletteIndex: state.activePaletteIndex,
      secondaryPaletteIndex: state.secondaryPaletteIndex,
      activeRgb: normalizeColorValue(state.activeRgb),
      colorMode: normalizeColorMode(state.colorMode, COLOR_MODE_INDEX),
      frames: state.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
        voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
        voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
          layers: frame.layers.map(layer => cloneLayerForSnapshot(layer, { clonePixelData: effectiveClonePixelData })),
        })),
      showGrid: state.showGrid,
      showMajorGrid: state.showMajorGrid,
      gridScreenStep: state.gridScreenStep,
      majorGridSpacing: state.majorGridSpacing,
      backgroundMode: state.backgroundMode,
      uiTheme: normalizeUiTheme(state.uiTheme, DEFAULT_UI_THEME),
      showPixelGuides: state.showPixelGuides,
      mirror: normalizeMirrorAxisState(state.mirror, state.width, state.height),
      showVirtualCursor: state.showVirtualCursor,
      showCanvasResizeHandles: Boolean(state.showCanvasResizeHandles ?? true),
      showChecker: state.showChecker,
      onionSkin: normalizeOnionSkinState(state.onionSkin),
      dualLeftRail: false,
      documentName: state.documentName,
      voxelExtension: normalizeVoxelExtensionState(voxelExtensionState, VOXEL_EXTENSION_DEFAULT_STATE),
    };

    if (includeSelection) {
      snapshot.activeFrame = state.activeFrame;
      snapshot.activeLayer = state.activeLayer;
      if (state.selectionMask) {
        snapshot.selectionMask = new Uint8Array(state.selectionMask);
      }
      if (state.selectionContentMask) {
        snapshot.selectionContentMask = new Uint8Array(state.selectionContentMask);
      }
      if (state.selectionBounds) {
        snapshot.selectionBounds = { ...state.selectionBounds };
      }
    }

    if (includeUiState) {
      snapshot.tool = state.tool;
      snapshot.brushSize = state.brushSize;
      snapshot.outlineSize = state.outlineSize;
      snapshot.selectSameMode = normalizeSelectSameMode(state.selectSameMode, SELECT_SAME_MODE_CONNECTED);
      snapshot.fillStyle = normalizeFillStyle(state.fillStyle, FILL_STYLE_SOLID);
      snapshot.selectionShapeMode = normalizeSelectionShapeMode(state.selectionShapeMode, SELECTION_SHAPE_MODE_CONTENT);
      snapshot.activeToolGroup = state.activeToolGroup;
      snapshot.lastGroupTool = { ...(state.lastGroupTool || DEFAULT_GROUP_TOOL) };
      snapshot.activeLeftTab = state.activeLeftTab;
      snapshot.activeRightTab = state.activeRightTab;
      snapshot.playback = { ...state.playback };
    }

    snapshot.activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    if (shouldIncludeProjectCanvasPayload()) {
      snapshot.canvases = getProjectCanvasDocuments().map(canvasDoc => snapshotProjectCanvasDocument(canvasDoc, {
        clonePixelData: effectiveClonePixelData,
      }));
    }

    applyPendingSelectionMoveToSnapshot(snapshot, { includeSelection, clonePixelData: effectiveClonePixelData });
    if (shouldIncludeProjectCanvasPayload(snapshot)) {
      syncSnapshotActiveCanvasPayload(snapshot, { direction: 'toCanvas' });
      syncSnapshotActiveCanvasPayload(snapshot);
    }
    return snapshot;
  }

  function capturePersonalPreferenceSnapshot(source = state) {
    syncLocalLayerVisibilityMapFromState();
    syncLocalLayerPreviewOpacityMapFromState();
    const width = Math.max(1, Math.round(Number(source?.width) || Number(state.width) || DEFAULT_CANVAS_SIZE));
    const height = Math.max(1, Math.round(Number(source?.height) || Number(state.height) || DEFAULT_CANVAS_SIZE));
    const frameCount = Math.max(
      0,
      Array.isArray(source?.frames) ? source.frames.length : (Array.isArray(state.frames) ? state.frames.length : 0)
    );
    const activePaletteIndex = normalizePaletteIndex(source?.activePaletteIndex, state.activePaletteIndex);
    return {
      scale: normalizeZoomScale(source?.scale, state.scale || MIN_ZOOM_SCALE),
      pan: {
        x: Math.round(Number(source?.pan?.x) || 0),
        y: Math.round(Number(source?.pan?.y) || 0),
      },
      activeCanvasId: typeof source?.activeCanvasId === 'string'
        ? source.activeCanvasId
        : (getActiveProjectCanvasDocument()?.id || ''),
      tool: normalizeToolId(source?.tool, state.tool || 'pen'),
      brushSize: clamp(Math.round(Number(source?.brushSize) || state.brushSize || 1), 1, 64),
      outlineSize: clamp(Math.round(Number(source?.outlineSize) || state.outlineSize || 1), 1, 64),
      brushShape: normalizeBrushShape(source?.brushShape, state.brushShape || BRUSH_SHAPE_SQUARE),
      selectSameMode: normalizeSelectSameMode(source?.selectSameMode, state.selectSameMode || SELECT_SAME_MODE_CONNECTED),
      fillStyle: normalizeFillStyle(source?.fillStyle, state.fillStyle || FILL_STYLE_SOLID),
      selectionShapeMode: normalizeSelectionShapeMode(source?.selectionShapeMode, state.selectionShapeMode || SELECTION_SHAPE_MODE_CONTENT),
      customBrush: normalizeCustomBrushData(source?.customBrush),
      activeToolGroup: TOOL_GROUPS[source?.activeToolGroup]
        ? source.activeToolGroup
        : (TOOL_TO_GROUP[normalizeToolId(source?.tool, state.tool || 'pen')] || 'pen'),
      lastGroupTool: { ...DEFAULT_GROUP_TOOL, ...(source?.lastGroupTool || {}) },
      colorMode: normalizeColorMode(source?.colorMode, state.colorMode || COLOR_MODE_INDEX),
      activePaletteIndex,
      secondaryPaletteIndex: normalizePaletteIndex(source?.secondaryPaletteIndex, activePaletteIndex),
      activeRgb: normalizeColorValue(source?.activeRgb || state.activeRgb),
      activeFrame: clamp(Math.round(Number(source?.activeFrame) || 0), 0, Math.max(0, frameCount - 1)),
      activeLayer: typeof source?.activeLayer === 'string' ? source.activeLayer : '',
      selectionMask: source?.selectionMask instanceof Uint8Array ? new Uint8Array(source.selectionMask) : null,
      selectionBounds: source?.selectionBounds && typeof source.selectionBounds === 'object'
        ? { ...source.selectionBounds }
        : null,
      showGrid: Boolean(source?.showGrid ?? true),
      showMajorGrid: Boolean(source?.showMajorGrid ?? true),
      gridScreenStep: clamp(Math.round(Number(source?.gridScreenStep) || 16), 1, 256),
      majorGridSpacing: clamp(Math.round(Number(source?.majorGridSpacing) || 16), 2, 512),
      backgroundMode: source?.backgroundMode === 'light' || source?.backgroundMode === 'pink' ? source.backgroundMode : 'dark',
      uiTheme: normalizeUiTheme(source?.uiTheme, DEFAULT_UI_THEME),
      showPixelGuides: Boolean(source?.showPixelGuides ?? true),
      showVirtualCursor: Boolean(source?.showVirtualCursor),
      showCanvasResizeHandles: Boolean(source?.showCanvasResizeHandles ?? true),
      virtualCursorButtonScale: normalizeFloatingDrawButtonScale(source?.virtualCursorButtonScale),
      floatingPreview: normalizeFloatingPreviewState(source?.floatingPreview, FLOATING_PREVIEW_DEFAULT_STATE),
      showChecker: Boolean(source?.showChecker ?? true),
      onionSkin: normalizeOnionSkinState(source?.onionSkin),
      activeLeftTab: LEFT_TAB_KEYS.includes(source?.activeLeftTab) ? source.activeLeftTab : 'tools',
      activeRightTab: RIGHT_TAB_KEYS.includes(source?.activeRightTab) ? source.activeRightTab : 'frames',
      danmakuEnabled: source?.danmakuEnabled !== false,
      layerVisibilityById: serializeLocalLayerVisibilityMap(localLayerVisibilityById),
      layerPreviewOpacityById: serializeLocalLayerPreviewOpacityMap(localLayerPreviewOpacityById),
    };
  }

  function applyPersonalPreferenceSnapshot(preferences) {
    if (!preferences || typeof preferences !== 'object') {
      return;
    }
    if (typeof preferences.activeCanvasId === 'string' && preferences.activeCanvasId) {
      state.activeCanvasId = preferences.activeCanvasId;
      const activeCanvasIndex = getActiveProjectCanvasIndex();
      localViewportCanvasState = normalizeLocalViewportCanvasState(
        {
          ...localViewportCanvasState,
          count: Math.max(0, getProjectCanvasCount() - 1),
          selectedKind: activeCanvasIndex === 0 ? 'main' : 'local',
          selectedIndex: activeCanvasIndex > 0 ? activeCanvasIndex - 1 : -1,
        },
        localViewportCanvasState
      );
    }
    state.scale = normalizeZoomScale(preferences.scale, state.scale || MIN_ZOOM_SCALE);
    rememberViewportZoomRatioFromScale(state.scale);
    state.pan = {
      x: Math.round(Number(preferences.pan?.x) || 0),
      y: Math.round(Number(preferences.pan?.y) || 0),
    };
    state.tool = normalizeToolId(preferences.tool, state.tool);
    state.brushSize = clamp(Math.round(Number(preferences.brushSize) || state.brushSize || 1), 1, 64);
    state.outlineSize = clamp(Math.round(Number(preferences.outlineSize) || state.outlineSize || 1), 1, 64);
    state.selectSameMode = normalizeSelectSameMode(preferences.selectSameMode, state.selectSameMode);
    state.fillStyle = normalizeFillStyle(preferences.fillStyle, state.fillStyle);
    state.selectionShapeMode = normalizeSelectionShapeMode(preferences.selectionShapeMode, state.selectionShapeMode);
    state.customBrush = normalizeCustomBrushData(preferences.customBrush);
    state.brushShape = normalizeBrushShape(preferences.brushShape, state.brushShape);
    if (state.brushShape === BRUSH_SHAPE_CUSTOM && !hasCustomBrushData()) {
      state.brushShape = BRUSH_SHAPE_SQUARE;
    }
    state.activeToolGroup = TOOL_GROUPS[preferences.activeToolGroup]
      ? preferences.activeToolGroup
      : (TOOL_TO_GROUP[state.tool] || 'pen');
    state.lastGroupTool = { ...DEFAULT_GROUP_TOOL, ...(preferences.lastGroupTool || {}) };
    if (!TOOL_GROUPS[state.activeToolGroup]?.tools?.includes(state.tool)) {
      state.activeToolGroup = TOOL_TO_GROUP[state.tool] || 'pen';
    }
    const paletteLength = Math.max(1, Array.isArray(state.palette) ? state.palette.length : 0);
    state.activePaletteIndex = clamp(
      normalizePaletteIndex(preferences.activePaletteIndex, state.activePaletteIndex),
      0,
      paletteLength - 1
    );
    state.secondaryPaletteIndex = clamp(
      normalizePaletteIndex(preferences.secondaryPaletteIndex, state.activePaletteIndex),
      0,
      paletteLength - 1
    );
    state.activeRgb = normalizeColorValue(preferences.activeRgb || state.activeRgb);
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    if (frameCount > 0) {
      state.activeFrame = clamp(Math.round(Number(preferences.activeFrame) || 0), 0, frameCount - 1);
      const activeFrame = state.frames[state.activeFrame];
      const preferredLayerId = typeof preferences.activeLayer === 'string' ? preferences.activeLayer : '';
      const preferredLayer = Array.isArray(activeFrame?.layers)
        ? activeFrame.layers.find(layer => layer?.id === preferredLayerId)
        : null;
      state.activeLayer = preferredLayer?.id
        || activeFrame?.layers?.[activeFrame.layers.length - 1]?.id
        || activeFrame?.layers?.[0]?.id
        || null;
    } else {
      state.activeFrame = 0;
      state.activeLayer = null;
    }
    const pixelCount = Math.max(0, Math.floor(Number(state.width) || 0) * Math.floor(Number(state.height) || 0));
    const canRestoreSelection = typeof preferences.activeLayer === 'string'
      && preferences.activeLayer.length > 0
      && preferences.activeLayer === state.activeLayer;
    if (canRestoreSelection && preferences.selectionMask instanceof Uint8Array && preferences.selectionMask.length === pixelCount) {
      state.selectionMask = new Uint8Array(preferences.selectionMask);
      state.selectionBounds = preferences.selectionBounds && typeof preferences.selectionBounds === 'object'
        ? { ...preferences.selectionBounds }
        : computeSelectionBoundsFromMask(state.selectionMask);
    } else {
      state.selectionMask = null;
      state.selectionBounds = null;
    }
    state.showGrid = Boolean(preferences.showGrid ?? true);
    state.showMajorGrid = Boolean(preferences.showMajorGrid ?? true);
    state.gridScreenStep = clamp(
      Math.round(Number(preferences.gridScreenStep) || state.gridScreenStep || 16),
      1,
      256
    );
    state.majorGridSpacing = clamp(
      Math.round(Number(preferences.majorGridSpacing) || state.majorGridSpacing || 16),
      2,
      512
    );
    state.backgroundMode = preferences.backgroundMode === 'light' || preferences.backgroundMode === 'pink'
      ? preferences.backgroundMode
      : 'dark';
    state.uiTheme = normalizeUiTheme(preferences.uiTheme, DEFAULT_UI_THEME);
    state.showPixelGuides = Boolean(preferences.showPixelGuides ?? true);
    state.showVirtualCursor = Boolean(preferences.showVirtualCursor);
    state.showCanvasResizeHandles = Boolean(preferences.showCanvasResizeHandles ?? true);
    state.virtualCursorButtonScale = normalizeFloatingDrawButtonScale(preferences.virtualCursorButtonScale);
    state.floatingPreview = normalizeFloatingPreviewState(preferences.floatingPreview, FLOATING_PREVIEW_DEFAULT_STATE);
    state.showChecker = Boolean(preferences.showChecker ?? true);
    state.onionSkin = normalizeOnionSkinState(preferences.onionSkin);
    state.activeLeftTab = LEFT_TAB_KEYS.includes(preferences.activeLeftTab) ? preferences.activeLeftTab : 'tools';
    state.activeRightTab = RIGHT_TAB_KEYS.includes(preferences.activeRightTab) ? preferences.activeRightTab : 'frames';
    state.danmakuEnabled = false;
    localLayerVisibilityById = deserializeLocalLayerVisibilityMap(
      preferences.layerVisibilityById,
      localLayerVisibilityById
    );
    applyLocalLayerVisibilityToState();
    localLayerPreviewOpacityById = deserializeLocalLayerPreviewOpacityMap(
      preferences.layerPreviewOpacityById,
      localLayerPreviewOpacityById
    );
    applyLocalLayerPreviewOpacityToState();
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

    const sourceIndices = moveState.indices instanceof Int16Array || moveState.indices instanceof Uint8Array
      ? moveState.indices
      : null;
    const sourceDirect = moveState.direct instanceof Uint8ClampedArray ? moveState.direct : null;
    const moveWidth = Math.max(0, Number(moveState.width) || 0);
    const moveHeight = Math.max(0, Number(moveState.height) || 0);
    const sourceMask = moveState.mask instanceof Uint8Array ? moveState.mask : null;
    const sourceContentMask = getSelectionMoveContentMask(moveState);
    if (!sourceMask || !sourceIndices || moveWidth <= 0 || moveHeight <= 0) {
      return;
    }
    const sourceSize = moveWidth * moveHeight;
    if (sourceMask.length !== sourceSize || sourceIndices.length !== sourceSize) {
      return;
    }

    const useRuntimeUint8 = typeof isRuntimeUint8LayerIndices === 'function'
      && isRuntimeUint8LayerIndices(targetLayer);
    let targetIndices = targetLayer.indices instanceof Int16Array || targetLayer.indices instanceof Uint8Array
      ? targetLayer.indices
      : null;
    if (!targetIndices || targetIndices.length !== pixelCount) {
      targetIndices = useRuntimeUint8 ? new Uint8Array(pixelCount) : new Int16Array(pixelCount).fill(-1);
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
    const transformedSelection = buildSelectionMoveTransformedEntries(moveState);
    const transformedContent = buildSelectionMoveTransformedEntries(moveState, {
      sourceMask: sourceContentMask,
      cacheProperty: 'transformedContentEntryCache',
      cacheScope: 'content',
    });
    const selectionEntries = Array.isArray(transformedSelection.entries) ? transformedSelection.entries : [];
    const contentEntries = Array.isArray(transformedContent.entries) ? transformedContent.entries : [];
    const newMask = new Uint8Array(pixelCount);
    const newContentMask = new Uint8Array(pixelCount);
    const newBounds = { x0: width, y0: height, x1: -1, y1: -1 };
    let placed = false;

    for (let i = 0; i < selectionEntries.length; i += 1) {
      const entry = selectionEntries[i];
      const targetX = originX + (Number(entry.x) || 0) + offsetX;
      const targetY = originY + (Number(entry.y) || 0) + offsetY;
      if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) {
        continue;
      }
      const targetIndex = (targetY * width) + targetX;
      newMask[targetIndex] = 1;
      placed = true;
      if (targetX < newBounds.x0) newBounds.x0 = targetX;
      if (targetY < newBounds.y0) newBounds.y0 = targetY;
      if (targetX > newBounds.x1) newBounds.x1 = targetX;
      if (targetY > newBounds.y1) newBounds.y1 = targetY;
    }

    for (let i = 0; i < contentEntries.length; i += 1) {
      const entry = contentEntries[i];
      const sourceIndex = Number(entry?.sourceIndex);
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= sourceSize) {
        continue;
      }
      const targetX = originX + (Number(entry.x) || 0) + offsetX;
      const targetY = originY + (Number(entry.y) || 0) + offsetY;
      if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) {
        continue;
      }
      const targetIndex = (targetY * width) + targetX;
      newContentMask[targetIndex] = 1;
      targetIndices[targetIndex] = sourceIndices[sourceIndex];
      if (targetDirect) {
        const targetBase = targetIndex * 4;
        if (sourceDirect && sourceDirect.length >= (sourceIndex * 4) + 4) {
          const sourceBase = sourceIndex * 4;
          targetDirect[targetBase] = sourceDirect[sourceBase];
          targetDirect[targetBase + 1] = sourceDirect[sourceBase + 1];
          targetDirect[targetBase + 2] = sourceDirect[sourceBase + 2];
          targetDirect[targetBase + 3] = sourceDirect[sourceBase + 3];
        } else {
          targetDirect[targetBase] = 0;
          targetDirect[targetBase + 1] = 0;
          targetDirect[targetBase + 2] = 0;
          targetDirect[targetBase + 3] = 0;
        }
      }
    }

    if (!includeSelection) {
      return;
    }

    if (placed && moveState.applySelectionOnFinalize !== false) {
      snapshot.selectionMask = newMask;
      snapshot.selectionContentMask = newContentMask;
      snapshot.selectionBounds = newBounds;
      snapshot.activeFrame = targetFrameIndex;
      snapshot.activeLayer = targetLayer.id || snapshot.activeLayer;
    } else {
      snapshot.selectionMask = null;
      snapshot.selectionContentMask = null;
      snapshot.selectionBounds = null;
    }
  }

  function compressHistorySnapshot(snapshot) {
    if (!snapshot) return snapshot;
    const compressCanvasList = canvases => Array.isArray(canvases)
      ? canvases.map(canvas => ({
        id: canvas.id,
        name: canvas.name,
        width: canvas.width,
        height: canvas.height,
        viewScale: normalizeProjectCanvasViewScale(canvas.viewScale, 8),
        activeFrame: canvas.activeFrame,
        activeLayer: canvas.activeLayer,
        mirror: normalizeMirrorAxisState(canvas.mirror, canvas.width, canvas.height),
        selectionMask: canvas.selectionMask ? compressUint8Array(canvas.selectionMask, { clamped: false }) : null,
        selectionContentMask: canvas.selectionContentMask ? compressUint8Array(canvas.selectionContentMask, { clamped: false }) : null,
        selectionBounds: canvas.selectionBounds ? { ...canvas.selectionBounds } : null,
        frames: canvas.frames.map(frame => ({
          id: frame.id,
          name: frame.name,
          duration: frame.duration,
          voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
          voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
          layers: frame.layers.map(layer => isSimulationLayer(layer)
            ? {
              id: layer.id,
              type: SIM_LAYER_TYPE,
              name: layer.name,
              visible: layer.visible,
              opacity: normalizeLayerOpacity(layer.opacity),
              blendMode: normalizeLayerBlendMode(layer.blendMode),
              elementMap: compressUint8Array(layer.elementMap, { clamped: false }),
              sourceColorMap: compressUint8Array(layer.sourceColorMap, { clamped: true }),
              velXMap: compressUint8Array(new Uint8Array(layer.velXMap.buffer, layer.velXMap.byteOffset, layer.velXMap.byteLength), { clamped: false }),
              velYMap: compressUint8Array(new Uint8Array(layer.velYMap.buffer, layer.velYMap.byteOffset, layer.velYMap.byteLength), { clamped: false }),
              lifeMap: compressUint8Array(layer.lifeMap, { clamped: false }),
              tempMap: compressUint8Array(new Uint8Array(layer.tempMap.buffer, layer.tempMap.byteOffset, layer.tempMap.byteLength), { clamped: false }),
              lightMap: compressUint8Array(layer.lightMap, { clamped: false }),
              depthMap: compressUint8Array(layer.depthMap, { clamped: false }),
              airMap: compressUint8Array(layer.airMap, { clamped: false }),
              auxMap: compressUint8Array(layer.auxMap, { clamped: false }),
              activeMap: compressUint8Array(layer.activeMap, { clamped: false }),
              settings: JSON.stringify(normalizeSimulationSettings(layer.settings)),
              elementStyle: JSON.stringify(layer.elementStyle || {}),
            }
            : {
              id: layer.id,
              name: layer.name,
              visible: layer.visible,
              opacity: normalizeLayerOpacity(layer.opacity),
	              blendMode: normalizeLayerBlendMode(layer.blendMode),
	              indices: compressInt16Array(layer.indices),
	              direct: layer.direct ? compressUint8Array(layer.direct, { clamped: true }) : null,
	              importSourceDirect: layer.importSourceDirect ? compressUint8Array(layer.importSourceDirect, { clamped: true }) : null,
	              directOnly: inferDirectOnlyLayer(layer, layer.indices, layer.direct),
	            }),
        })),
      }))
      : null;
    const compressed = {
      width: snapshot.width,
      height: snapshot.height,
      scale: MIN_ZOOM_RATIO,
      pan: { x: 0, y: 0 },
      palette: snapshot.palette.map(color => ({ ...color })),
      activePaletteIndex: snapshot.activePaletteIndex,
      secondaryPaletteIndex: snapshot.secondaryPaletteIndex,
      activeRgb: { ...snapshot.activeRgb },
      frames: snapshot.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
        voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
        voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
        layers: frame.layers.map(layer => isSimulationLayer(layer)
          ? {
            id: layer.id,
            type: SIM_LAYER_TYPE,
            name: layer.name,
            visible: layer.visible,
            opacity: normalizeLayerOpacity(layer.opacity),
            blendMode: normalizeLayerBlendMode(layer.blendMode),
            elementMap: compressUint8Array(layer.elementMap, { clamped: false }),
            sourceColorMap: compressUint8Array(layer.sourceColorMap, { clamped: true }),
            velXMap: compressUint8Array(new Uint8Array(layer.velXMap.buffer, layer.velXMap.byteOffset, layer.velXMap.byteLength), { clamped: false }),
            velYMap: compressUint8Array(new Uint8Array(layer.velYMap.buffer, layer.velYMap.byteOffset, layer.velYMap.byteLength), { clamped: false }),
            lifeMap: compressUint8Array(layer.lifeMap, { clamped: false }),
            tempMap: compressUint8Array(new Uint8Array(layer.tempMap.buffer, layer.tempMap.byteOffset, layer.tempMap.byteLength), { clamped: false }),
            lightMap: compressUint8Array(layer.lightMap, { clamped: false }),
            depthMap: compressUint8Array(layer.depthMap, { clamped: false }),
            airMap: compressUint8Array(layer.airMap, { clamped: false }),
            auxMap: compressUint8Array(layer.auxMap, { clamped: false }),
            activeMap: compressUint8Array(layer.activeMap, { clamped: false }),
            settings: JSON.stringify(normalizeSimulationSettings(layer.settings)),
            elementStyle: JSON.stringify(layer.elementStyle || {}),
          }
          : {
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            opacity: normalizeLayerOpacity(layer.opacity),
	            blendMode: normalizeLayerBlendMode(layer.blendMode),
	            indices: compressInt16Array(layer.indices),
	            direct: layer.direct ? compressUint8Array(layer.direct, { clamped: true }) : null,
	            importSourceDirect: layer.importSourceDirect ? compressUint8Array(layer.importSourceDirect, { clamped: true }) : null,
	            directOnly: inferDirectOnlyLayer(layer, layer.indices, layer.direct),
	          }),
      })),
      showGrid: snapshot.showGrid,
      showMajorGrid: snapshot.showMajorGrid,
      gridScreenStep: snapshot.gridScreenStep,
      majorGridSpacing: snapshot.majorGridSpacing,
      backgroundMode: snapshot.backgroundMode,
      uiTheme: normalizeUiTheme(snapshot.uiTheme, DEFAULT_UI_THEME),
      showPixelGuides: snapshot.showPixelGuides,
      mirror: normalizeMirrorAxisState(snapshot.mirror, snapshot.width, snapshot.height),
      showVirtualCursor: snapshot.showVirtualCursor,
      showCanvasResizeHandles: Boolean(snapshot.showCanvasResizeHandles ?? true),
      showChecker: snapshot.showChecker,
      onionSkin: normalizeOnionSkinState(snapshot.onionSkin),
      dualLeftRail: false,
      documentName: snapshot.documentName,
      voxelExtension: normalizeVoxelExtensionState(snapshot.voxelExtension, VOXEL_EXTENSION_DEFAULT_STATE),
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
    if (snapshot.selectionContentMask) {
      compressed.selectionContentMask = compressUint8Array(snapshot.selectionContentMask, { clamped: false });
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
    if (Object.prototype.hasOwnProperty.call(snapshot, 'outlineSize')) {
      compressed.outlineSize = snapshot.outlineSize;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'fillStyle')) {
      compressed.fillStyle = normalizeFillStyle(snapshot.fillStyle, FILL_STYLE_SOLID);
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
    if (Array.isArray(snapshot.canvases) && snapshot.canvases.length) {
      compressed.activeCanvasId = typeof snapshot.activeCanvasId === 'string' ? snapshot.activeCanvasId : '';
      compressed.canvases = compressCanvasList(snapshot.canvases);
    }
    return compressed;
  }

  function decompressHistorySnapshot(snapshot) {
    if (!snapshot) return snapshot;
    const decompressCanvasList = canvases => Array.isArray(canvases)
      ? canvases.map(canvas => ({
        id: canvas.id,
        name: canvas.name,
        width: canvas.width,
        height: canvas.height,
        viewScale: normalizeProjectCanvasViewScale(canvas.viewScale, 8),
        activeFrame: canvas.activeFrame,
        activeLayer: canvas.activeLayer,
        mirror: normalizeMirrorAxisState(canvas.mirror, canvas.width, canvas.height),
        selectionMask: canvas.selectionMask ? decodeUint8Data(canvas.selectionMask, { clamped: false }) : null,
        selectionContentMask: canvas.selectionContentMask ? decodeUint8Data(canvas.selectionContentMask, { clamped: false }) : null,
        selectionBounds: canvas.selectionBounds ? { ...canvas.selectionBounds } : null,
        frames: canvas.frames.map(frame => ({
          id: frame.id,
          name: frame.name,
          duration: frame.duration,
          voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
          voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
          layers: frame.layers.map(layer => {
            if (layer?.type === SIM_LAYER_TYPE) {
              const simLayer = createSimulationLayer(layer.name || getDefaultLayerName(1), canvas.width, canvas.height);
              simLayer.id = layer.id;
              simLayer.visible = layer.visible !== false;
              simLayer.opacity = normalizeLayerOpacity(layer.opacity);
              simLayer.blendMode = normalizeLayerBlendMode(layer.blendMode);
              simLayer.elementMap = decodeUint8Data(layer.elementMap, { clamped: false }) || simLayer.elementMap;
              simLayer.sourceColorMap = decodeUint8Data(layer.sourceColorMap, { clamped: true }) || simLayer.sourceColorMap;
              simLayer.velXMap = new Int8Array((decodeUint8Data(layer.velXMap, { clamped: false }) || new Uint8Array(simLayer.velXMap.byteLength)).buffer.slice(0));
              simLayer.velYMap = new Int8Array((decodeUint8Data(layer.velYMap, { clamped: false }) || new Uint8Array(simLayer.velYMap.byteLength)).buffer.slice(0));
              simLayer.lifeMap = decodeUint8Data(layer.lifeMap, { clamped: false }) || simLayer.lifeMap;
              simLayer.tempMap = new Uint16Array((decodeUint8Data(layer.tempMap, { clamped: false }) || new Uint8Array(simLayer.tempMap.byteLength)).buffer.slice(0));
              simLayer.lightMap = decodeUint8Data(layer.lightMap, { clamped: false }) || simLayer.lightMap;
              simLayer.depthMap = decodeUint8Data(layer.depthMap, { clamped: false }) || simLayer.depthMap;
              simLayer.airMap = decodeUint8Data(layer.airMap, { clamped: false }) || simLayer.airMap;
              simLayer.auxMap = decodeUint8Data(layer.auxMap, { clamped: false }) || simLayer.auxMap;
              simLayer.activeMap = decodeUint8Data(layer.activeMap, { clamped: false }) || simLayer.activeMap;
              simLayer.settings = normalizeSimulationSettings(typeof layer.settings === 'string' ? JSON.parse(layer.settings) : layer.settings);
              simLayer.elementStyle = typeof layer.elementStyle === 'string' ? JSON.parse(layer.elementStyle) : (layer.elementStyle || simLayer.elementStyle);
              return simLayer;
            }
            return {
              id: layer.id,
              name: layer.name,
              visible: layer.visible,
              opacity: normalizeLayerOpacity(layer.opacity),
	              blendMode: normalizeLayerBlendMode(layer.blendMode),
	              indices: decodeInt16Data(layer.indices),
	              direct: layer.direct ? decodeUint8Data(layer.direct, { clamped: true }) : null,
	              importSourceDirect: layer.importSourceDirect ? decodeUint8Data(layer.importSourceDirect, { clamped: true }) : null,
	              directOnly: inferDirectOnlyLayer(layer, decodeInt16Data(layer.indices), layer.direct ? decodeUint8Data(layer.direct, { clamped: true }) : null),
	            };
          }),
        })),
      }))
      : null;
    const decompressed = {
      width: snapshot.width,
      height: snapshot.height,
      scale: MIN_ZOOM_RATIO,
      pan: {
        x: Math.round(Number(snapshot.pan?.x) || 0),
        y: Math.round(Number(snapshot.pan?.y) || 0),
      },
      palette: snapshot.palette.map(color => ({ ...color })),
      activePaletteIndex: snapshot.activePaletteIndex,
      secondaryPaletteIndex: snapshot.secondaryPaletteIndex,
      activeRgb: { ...snapshot.activeRgb },
      frames: snapshot.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
        voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
        voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
        layers: frame.layers.map(layer => {
          if (layer?.type === SIM_LAYER_TYPE) {
            const simLayer = createSimulationLayer(layer.name || getDefaultLayerName(1), snapshot.width, snapshot.height);
            simLayer.id = layer.id;
            simLayer.visible = layer.visible !== false;
            simLayer.opacity = normalizeLayerOpacity(layer.opacity);
            simLayer.blendMode = normalizeLayerBlendMode(layer.blendMode);
            simLayer.elementMap = decodeUint8Data(layer.elementMap, { clamped: false }) || simLayer.elementMap;
            simLayer.sourceColorMap = decodeUint8Data(layer.sourceColorMap, { clamped: true }) || simLayer.sourceColorMap;
            simLayer.velXMap = new Int8Array((decodeUint8Data(layer.velXMap, { clamped: false }) || new Uint8Array(simLayer.velXMap.byteLength)).buffer.slice(0));
            simLayer.velYMap = new Int8Array((decodeUint8Data(layer.velYMap, { clamped: false }) || new Uint8Array(simLayer.velYMap.byteLength)).buffer.slice(0));
            simLayer.lifeMap = decodeUint8Data(layer.lifeMap, { clamped: false }) || simLayer.lifeMap;
            simLayer.tempMap = new Uint16Array((decodeUint8Data(layer.tempMap, { clamped: false }) || new Uint8Array(simLayer.tempMap.byteLength)).buffer.slice(0));
            simLayer.lightMap = decodeUint8Data(layer.lightMap, { clamped: false }) || simLayer.lightMap;
            simLayer.depthMap = decodeUint8Data(layer.depthMap, { clamped: false }) || simLayer.depthMap;
            simLayer.airMap = decodeUint8Data(layer.airMap, { clamped: false }) || simLayer.airMap;
            simLayer.auxMap = decodeUint8Data(layer.auxMap, { clamped: false }) || simLayer.auxMap;
            simLayer.activeMap = decodeUint8Data(layer.activeMap, { clamped: false }) || simLayer.activeMap;
            simLayer.settings = normalizeSimulationSettings(typeof layer.settings === 'string' ? JSON.parse(layer.settings) : layer.settings);
            simLayer.elementStyle = typeof layer.elementStyle === 'string' ? JSON.parse(layer.elementStyle) : (layer.elementStyle || simLayer.elementStyle);
            return simLayer;
          }
          return {
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            opacity: normalizeLayerOpacity(layer.opacity),
	            blendMode: normalizeLayerBlendMode(layer.blendMode),
	            indices: decodeInt16Data(layer.indices),
	            direct: layer.direct ? decodeUint8Data(layer.direct, { clamped: true }) : null,
	            importSourceDirect: layer.importSourceDirect ? decodeUint8Data(layer.importSourceDirect, { clamped: true }) : null,
	            directOnly: inferDirectOnlyLayer(layer, decodeInt16Data(layer.indices), layer.direct ? decodeUint8Data(layer.direct, { clamped: true }) : null),
	          };
        }),
      })),
      showGrid: snapshot.showGrid,
      showMajorGrid: snapshot.showMajorGrid,
      gridScreenStep: snapshot.gridScreenStep,
      majorGridSpacing: snapshot.majorGridSpacing,
      backgroundMode: snapshot.backgroundMode,
      uiTheme: normalizeUiTheme(snapshot.uiTheme, DEFAULT_UI_THEME),
      showPixelGuides: snapshot.showPixelGuides,
      mirror: normalizeMirrorAxisState(snapshot.mirror, snapshot.width, snapshot.height),
      showVirtualCursor: snapshot.showVirtualCursor,
      showCanvasResizeHandles: Boolean(snapshot.showCanvasResizeHandles ?? true),
      showChecker: snapshot.showChecker,
      onionSkin: normalizeOnionSkinState(snapshot.onionSkin),
      dualLeftRail: false,
      documentName: snapshot.documentName,
      voxelExtension: normalizeVoxelExtensionState(snapshot.voxelExtension, VOXEL_EXTENSION_DEFAULT_STATE),
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
    if (snapshot.selectionContentMask) {
      decompressed.selectionContentMask = decodeUint8Data(snapshot.selectionContentMask, { clamped: false });
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
    if (Object.prototype.hasOwnProperty.call(snapshot, 'outlineSize')) {
      decompressed.outlineSize = snapshot.outlineSize;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'fillStyle')) {
      decompressed.fillStyle = normalizeFillStyle(snapshot.fillStyle, FILL_STYLE_SOLID);
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
    if (Array.isArray(snapshot.canvases) && snapshot.canvases.length) {
      decompressed.activeCanvasId = typeof snapshot.activeCanvasId === 'string' ? snapshot.activeCanvasId : '';
      decompressed.canvases = decompressCanvasList(snapshot.canvases);
      syncSnapshotActiveCanvasPayload(decompressed);
    }
    return decompressed;
  }



  return Object.freeze({
    makeHistorySnapshot,
    capturePersonalPreferenceSnapshot,
    applyPersonalPreferenceSnapshot,
    applyPendingSelectionMoveToSnapshot,
    compressHistorySnapshot,
    decompressHistorySnapshot,
  });
      }
    })(scope);
  }

  root.historySnapshotWorkflowUtils = Object.freeze({
    createHistorySnapshotWorkflowUtils,
  });
})();
