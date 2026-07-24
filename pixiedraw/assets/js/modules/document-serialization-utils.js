(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createDocumentSerializationUtils(rawScope = {}) {
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
  function serializeRasterForDocument(value, { preserveTypedArrays = false } = {}) {
    if (!value) {
      return preserveTypedArrays ? null : '';
    }
    if (preserveTypedArrays && ArrayBuffer.isView(value)) {
      return value;
    }
    return encodeTypedArray(value);
  }

  function serializeDocumentSnapshot(snapshot, options = {}) {
    const preserveTypedArrays = options?.preserveTypedArrays === true;
    const compactIndicesForStorage = preserveTypedArrays && options?.compactIndicesForStorage === true;
    const palette = snapshot.palette.map(color => normalizeColorValue(color));
    const maxPaletteIndex = Math.max(0, palette.length - 1);
    const activePaletteIndex = clamp(
      Number.isFinite(Number(snapshot.activePaletteIndex)) ? Math.round(Number(snapshot.activePaletteIndex)) : 0,
      0,
      maxPaletteIndex
    );
    const secondaryPaletteIndex = clamp(
      Number.isFinite(Number(snapshot.secondaryPaletteIndex)) ? Math.round(Number(snapshot.secondaryPaletteIndex)) : activePaletteIndex,
      0,
      maxPaletteIndex
    );
    const serializedCanvases = Array.isArray(snapshot.canvases) && snapshot.canvases.length > 1
      ? snapshot.canvases.map(canvas => ({
        id: canvas.id,
        name: typeof canvas.name === 'string' ? canvas.name : '',
        width: canvas.width,
        height: canvas.height,
        viewScale: normalizeProjectCanvasViewScale(canvas.viewScale, 8),
        activeFrame: canvas.activeFrame,
        activeLayer: canvas.activeLayer,
        mirror: normalizeMirrorAxisState(canvas.mirror, canvas.width, canvas.height),
        selectionMask: canvas.selectionMask
          ? serializeRasterForDocument(canvas.selectionMask, { preserveTypedArrays })
          : null,
        selectionContentMask: canvas.selectionContentMask
          ? serializeRasterForDocument(canvas.selectionContentMask, { preserveTypedArrays })
          : null,
        selectionBounds: canvas.selectionBounds ? { ...canvas.selectionBounds } : null,
        frames: canvas.frames.map(frame => ({
          id: frame.id,
          name: frame.name,
          duration: frame.duration,
          voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
          voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
          layers: frame.layers.map(layer => serializeLayerForDocument(layer, {
            preserveTypedArrays,
            compactIndicesForStorage,
            width: canvas.width,
            height: canvas.height,
            palette,
          })),
        })),
      }))
      : null;
    // Personal view/tool/color preferences stay in local session storage instead of shared project payloads.
    const serialized = {
      version: DOCUMENT_FILE_VERSION,
      width: snapshot.width,
      height: snapshot.height,
      palette,
      frames: snapshot.frames.map(frame => ({
        id: frame.id,
        name: frame.name,
        duration: frame.duration,
        voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
        voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
        layers: frame.layers.map(layer => serializeLayerForDocument(layer, {
          preserveTypedArrays,
          compactIndicesForStorage,
          width: snapshot.width,
          height: snapshot.height,
          palette,
        })),
      })),
      activeFrame: snapshot.activeFrame,
      activeLayer: snapshot.activeLayer,
      colorMode: normalizeColorMode(snapshot.colorMode, COLOR_MODE_INDEX),
      activePaletteIndex,
      secondaryPaletteIndex,
      activeRgb: normalizeColorValue(snapshot.activeRgb || palette[activePaletteIndex] || palette[0] || { r: 0, g: 0, b: 0, a: 0 }),
      mirror: normalizeMirrorAxisState(snapshot.mirror, snapshot.width, snapshot.height),
      selectionMask: snapshot.selectionMask
        ? serializeRasterForDocument(snapshot.selectionMask, { preserveTypedArrays })
        : null,
      selectionContentMask: snapshot.selectionContentMask
        ? serializeRasterForDocument(snapshot.selectionContentMask, { preserveTypedArrays })
        : null,
      selectionBounds: snapshot.selectionBounds ? { ...snapshot.selectionBounds } : null,
      documentName: normalizeDocumentName(snapshot.documentName),
      rasterModelVersion: Math.max(0, Math.round(Number(snapshot.rasterModelVersion) || 0)),
      dualLeftRail: false,
      voxelExtension: normalizeVoxelExtensionState(snapshot.voxelExtension, VOXEL_EXTENSION_DEFAULT_STATE),
    };
    const serializedActiveCanvasId = typeof snapshot.activeCanvasId === 'string'
      ? snapshot.activeCanvasId
      : (serializedCanvases?.[0]?.id || '');
    if (serializedCanvases) {
      serialized.canvases = serializedCanvases;
    }
    if (serializedActiveCanvasId) {
      // Preserve the stable canvas ID even for single-canvas documents so remote layer patches
      // can target the same canvas after a snapshot refresh.
      serialized.activeCanvasId = serializedActiveCanvasId;
    }
    if (snapshot.playback && typeof snapshot.playback === 'object') {
      serialized.playback = {
        // Playback is transient UI state. Persisting true creates a restored
        // project with no requestAnimationFrame loop behind the flag.
        isPlaying: false,
        lastFrame: Number(snapshot.playback.lastFrame) || 0,
        loop: snapshot.playback.loop !== false,
      };
    }
    return serialized;
  }

  function deserializeSelectionMask(value, pixelCount, { reuseTypedArrays = false } = {}) {
    if (value instanceof Uint8Array && value.length === pixelCount) {
      return reuseTypedArrays ? value : new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value) && value.length === pixelCount) {
      return new Uint8Array(value);
    }
    if (Array.isArray(value) && value.length === pixelCount) {
      return new Uint8Array(value);
    }
    if (typeof value === 'string' && value.length > 0) {
      const bytes = decodeBase64(value);
      if (bytes.length === pixelCount) {
        return new Uint8Array(bytes);
      }
    }
    return null;
  }

  function deserializeDocumentPayload(payload, options = {}) {
    const reuseTypedArrays = options?.reuseTypedArrays === true;
    const trustStoredLayerFlags = options?.trustStoredLayerFlags === true;
    const recoverTruncatedRasterLayers = options?.recoverTruncatedRasterLayers === true;
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
      const layers = frame.layers.map((layer, layerIndex) => deserializeLayerFromDocument(
        layer,
        pixelCount,
        `layer-${frameIndex}-${layerIndex}`,
        getDefaultLayerName(layerIndex + 1),
        width,
        height,
        { reuseTypedArrays, trustStoredLayerFlags, recoverTruncatedRasterLayers }
      ));
      return {
        id: typeof frame.id === 'string' ? frame.id : `frame-${frameIndex + 1}`,
        name: typeof frame.name === 'string' ? frame.name : getDefaultFrameName(frameIndex + 1),
        duration: clamp(Number(frame.duration) || 1000 / 12, 16, 2000),
        voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
        voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
        layers,
      };
    });

    const activeFrameIndex = clamp(Math.round(Number(payload.activeFrame) || 0), 0, frames.length - 1);
    const activeFrame = frames[activeFrameIndex];
    let activeLayerId = typeof payload.activeLayer === 'string' ? payload.activeLayer : activeFrame.layers[activeFrame.layers.length - 1].id;
    if (!activeFrame.layers.some(layer => layer.id === activeLayerId)) {
      activeLayerId = activeFrame.layers[activeFrame.layers.length - 1].id;
    }

    const selectionMask = deserializeSelectionMask(payload.selectionMask, pixelCount, { reuseTypedArrays });
    const selectionContentMask = deserializeSelectionMask(
      payload.selectionContentMask,
      pixelCount,
      { reuseTypedArrays }
    );

    const selectionBounds = validateBoundsObject(payload.selectionBounds);
    const activeTool = normalizeToolId(payload.tool, state.tool);
    const selectSameMode = normalizeSelectSameMode(payload.selectSameMode, state.selectSameMode);
    const fillStyle = normalizeFillStyle(payload.fillStyle, state.fillStyle);
    const selectionShapeMode = normalizeSelectionShapeMode(payload.selectionShapeMode, state.selectionShapeMode);
    const customBrush = deserializeCustomBrushPayload(payload.customBrush);
    const requestedBrushShape = normalizeBrushShape(payload.brushShape, BRUSH_SHAPE_SQUARE);
    const brushShape = requestedBrushShape === BRUSH_SHAPE_CUSTOM && !customBrush
      ? BRUSH_SHAPE_SQUARE
      : requestedBrushShape;
    // RGB is a legacy import format. Direct pixels are converted to the
    // indexed palette when the snapshot is applied.
    const colorMode = COLOR_MODE_INDEX;
    const fallbackActivePaletteIndex = clamp(
      Number.isFinite(state.activePaletteIndex) ? Math.round(state.activePaletteIndex) : 0,
      0,
      palette.length - 1
    );
    const parsedActivePaletteIndex = Number(payload.activePaletteIndex);
    const activePaletteIndex = clamp(
      Number.isFinite(parsedActivePaletteIndex) ? Math.round(parsedActivePaletteIndex) : fallbackActivePaletteIndex,
      0,
      palette.length - 1
    );
    const parsedSecondaryPaletteIndex = Number(payload.secondaryPaletteIndex);
    const secondaryPaletteIndex = clamp(
      Number.isFinite(parsedSecondaryPaletteIndex) ? Math.round(parsedSecondaryPaletteIndex) : activePaletteIndex,
      0,
      palette.length - 1
    );
    const fallbackActiveRgb = palette[activePaletteIndex]
      ? normalizeColorValue(palette[activePaletteIndex])
      : normalizeColorValue(state.activeRgb);
    const activeRgb = normalizeColorValue(payload.activeRgb || fallbackActiveRgb);
    const backgroundMode = payload.backgroundMode === 'light' || payload.backgroundMode === 'pink' ? payload.backgroundMode : 'dark';
    const uiTheme = normalizeUiTheme(payload.uiTheme, state.uiTheme);
    let activeToolGroup = TOOL_GROUPS[payload.activeToolGroup] ? payload.activeToolGroup : (TOOL_TO_GROUP[activeTool] || state.activeToolGroup);
    if (!TOOL_GROUPS[activeToolGroup]?.tools?.includes(activeTool)) {
      activeToolGroup = TOOL_TO_GROUP[activeTool] || 'pen';
    }
    const lastGroupTool = normalizeLastGroupTool(payload.lastGroupTool);
    const activeLeftTab = LEFT_TAB_KEYS.includes(payload.activeLeftTab) ? payload.activeLeftTab : state.activeLeftTab;
    const activeRightTab = RIGHT_TAB_KEYS.includes(payload.activeRightTab) ? payload.activeRightTab : state.activeRightTab;
    const documentName = normalizeDocumentName(
      typeof payload.documentName === 'string' ? payload.documentName : (typeof payload.name === 'string' ? payload.name : state.documentName),
    );

    const activeCanvasSnapshot = {
      width,
      height,
      scale: MIN_ZOOM_RATIO,
      pan: {
        x: Math.round(Number(payload.pan?.x) || 0),
        y: Math.round(Number(payload.pan?.y) || 0),
      },
      tool: activeTool,
      brushSize: clamp(Math.round(Number(payload.brushSize) || state.brushSize || 1), 1, 64),
      brushShape,
      selectSameMode,
      fillStyle,
      selectionShapeMode,
      customBrush,
      colorMode,
      palette,
      activePaletteIndex,
      secondaryPaletteIndex,
      activeRgb,
      frames,
      activeFrame: activeFrameIndex,
      activeLayer: activeLayerId,
      selectionMask,
      selectionContentMask,
      selectionBounds,
      showGrid: Boolean(payload.showGrid ?? state.showGrid),
      showMajorGrid: Boolean(payload.showMajorGrid ?? state.showMajorGrid),
      gridScreenStep: clamp(Math.round(Number(payload.gridScreenStep) || state.gridScreenStep || 8), 1, 256),
      majorGridSpacing: clamp(Math.round(Number(payload.majorGridSpacing) || state.majorGridSpacing || 16), 2, 512),
      backgroundMode,
      uiTheme,
      activeToolGroup,
      lastGroupTool,
      activeLeftTab,
      activeRightTab,
      showPixelGuides: Boolean(payload.showPixelGuides ?? state.showPixelGuides),
      mirror: normalizeMirrorAxisState(payload.mirror, width, height),
      showVirtualCursor: Boolean(payload.showVirtualCursor ?? state.showVirtualCursor),
      showCanvasResizeHandles: Boolean(payload.showCanvasResizeHandles ?? state.showCanvasResizeHandles ?? true),
      showChecker: Boolean(payload.showChecker ?? state.showChecker),
      onionSkin: normalizeOnionSkinState(payload.onionSkin ?? state.onionSkin),
      dualLeftRail: false,
      playback: typeof payload.playback === 'object' && payload.playback
        ? {
          isPlaying: false,
          lastFrame: Number(payload.playback.lastFrame) || 0,
          loop: payload.playback.loop !== false,
        }
        : { isPlaying: false, lastFrame: 0, loop: true },
      documentName,
      rasterModelVersion: Math.max(0, Math.round(Number(payload.rasterModelVersion) || 0)),
      voxelExtension: normalizeVoxelExtensionState(payload.voxelExtension, VOXEL_EXTENSION_DEFAULT_STATE),
    };
    if (Array.isArray(payload.canvases) && payload.canvases.length) {
      const resolvedActiveCanvasId = typeof payload.activeCanvasId === 'string' && payload.activeCanvasId
        ? payload.activeCanvasId
        : (payload.canvases[0]?.id || '');
      const selectedCanvasIndex = Math.max(
        0,
        payload.canvases.findIndex(canvas => canvas?.id === resolvedActiveCanvasId)
      );
      const selectedCanvas = payload.canvases[selectedCanvasIndex] || payload.canvases[0];
      if (selectedCanvas) {
        const canvasWidth = clamp(Math.round(Number(selectedCanvas.width) || width), 1, 4096);
        const canvasHeight = clamp(Math.round(Number(selectedCanvas.height) || height), 1, 4096);
        const canvasPixelCount = canvasWidth * canvasHeight;
        const frameList = Array.isArray(selectedCanvas.frames) && selectedCanvas.frames.length
          ? selectedCanvas.frames
          : framesSource;
        const deserializedFrames = frameList.map((frame, frameIndex) => {
          if (!frame || !Array.isArray(frame.layers) || !frame.layers.length) {
            throw new Error(`Canvas ${selectedCanvasIndex} frame ${frameIndex} has no layers`);
          }
          return {
            id: typeof frame.id === 'string' ? frame.id : `frame-${selectedCanvasIndex}-${frameIndex + 1}`,
            name: typeof frame.name === 'string' ? frame.name : getDefaultFrameName(frameIndex + 1),
            duration: clamp(Number(frame.duration) || 1000 / 12, 16, 2000),
            voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
            voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
            layers: frame.layers.map((layer, layerIndex) => deserializeLayerFromDocument(
              layer,
              canvasPixelCount,
              `layer-${selectedCanvasIndex}-${frameIndex}-${layerIndex}`,
              getDefaultLayerName(layerIndex + 1),
              canvasWidth,
              canvasHeight,
              { reuseTypedArrays, trustStoredLayerFlags, recoverTruncatedRasterLayers }
            )),
          };
        });
        const selectedActiveFrame = clamp(
          Math.round(Number(selectedCanvas.activeFrame) || 0),
          0,
          deserializedFrames.length - 1
        );
        const activeCanvasFrame = deserializedFrames[selectedActiveFrame];
        const requestedLayerId = typeof selectedCanvas.activeLayer === 'string'
          ? selectedCanvas.activeLayer
          : '';
        const selectedActiveLayer = activeCanvasFrame.layers.some(layer => layer.id === requestedLayerId)
          ? requestedLayerId
          : activeCanvasFrame.layers[activeCanvasFrame.layers.length - 1].id;
        activeCanvasSnapshot.width = canvasWidth;
        activeCanvasSnapshot.height = canvasHeight;
        activeCanvasSnapshot.scale = normalizeProjectCanvasViewScale(
          selectedCanvas.viewScale,
          activeCanvasSnapshot.scale || MIN_ZOOM_SCALE
        );
        activeCanvasSnapshot.frames = deserializedFrames;
        activeCanvasSnapshot.activeFrame = selectedActiveFrame;
        activeCanvasSnapshot.activeLayer = selectedActiveLayer;
        activeCanvasSnapshot.mirror = normalizeMirrorAxisState(selectedCanvas.mirror, canvasWidth, canvasHeight);
        activeCanvasSnapshot.selectionMask = deserializeSelectionMask(
          selectedCanvas.selectionMask,
          canvasPixelCount,
          { reuseTypedArrays }
        );
        activeCanvasSnapshot.selectionContentMask = deserializeSelectionMask(
          selectedCanvas.selectionContentMask,
          canvasPixelCount,
          { reuseTypedArrays }
        );
        activeCanvasSnapshot.selectionBounds = validateBoundsObject(selectedCanvas.selectionBounds);
      }
    }
    return activeCanvasSnapshot;
  }


        return Object.freeze({
        serializeDocumentSnapshot,
        deserializeDocumentPayload,
        });
      }
    })(scope);
  }

  root.documentSerializationUtils = Object.freeze({
    createDocumentSerializationUtils,
  });
})();
