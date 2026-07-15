(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectOpUtils(rawScope = {}) {
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
  function classifySharedProjectOpType(historyLabel = '') {
    if (sharedProjectOpCodec) {
      return sharedProjectOpCodec.classifySharedProjectOpType(historyLabel);
    }
    const normalizedLabel = String(historyLabel || '').trim();
    if (!normalizedLabel) {
      return 'snapshot';
    }
    if (SHARED_PROJECT_STRUCTURE_HISTORY_LABELS.has(normalizedLabel)) {
      return 'structure';
    }
    if (MULTI_PALETTE_HISTORY_LABELS.has(normalizedLabel)) {
      return 'palette';
    }
    if (MULTI_LAYER_PATCH_HISTORY_LABELS.has(normalizedLabel)) {
      return 'draw';
    }
    return 'draw';
  }

  function isSharedProjectDrawKind(kind = '') {
    const normalizedKind = typeof kind === 'string' ? kind.trim() : '';
    return (
      normalizedKind === 'stroke-command'
      || normalizedKind === 'stroke'
      || normalizedKind === 'shape-command'
      || normalizedKind === 'fill-command'
      || normalizedKind === 'curve-command'
      || normalizedKind === 'region-command'
      || normalizedKind === 'layer-patch'
      || normalizedKind === 'fill'
      || normalizedKind === 'selection-transform'
      || normalizedKind === 'stroke-commit'
      || normalizedKind === 'draw'
    );
  }

  function isSharedProjectOpAlreadySettled(opRecord, afterSeq = sharedProjectLastAppliedSeq) {
    const seq = getSharedProjectOpSeq(opRecord);
    if (seq && seq <= Math.max(0, Math.round(Number(afterSeq) || 0))) {
      return true;
    }
    const opId = normalizeSharedProjectOpId(opRecord);
    if (!opId) {
      return false;
    }
    return sharedProjectSeenOpIds.has(opId);
  }

  function buildSharedProjectLayerSnapshotKey(canvasId, frameIndex, layerId) {
    const normalizedCanvasId = typeof canvasId === 'string' ? canvasId.trim() : '';
    const normalizedLayerId = typeof layerId === 'string' ? layerId.trim() : '';
    const normalizedFrameIndex = Math.max(0, Math.round(Number(frameIndex) || 0));
    if (!normalizedCanvasId || !normalizedLayerId) {
      return '';
    }
    return `${normalizedCanvasId}\u0000${normalizedFrameIndex}\u0000${normalizedLayerId}`;
  }

  function appendSharedProjectResultPatchToDrawPayload(payload) {
    if (!payload || typeof payload !== 'object' || payload.patch) {
      return payload;
    }
    const command = typeof payload.command === 'string' ? payload.command.trim() : '';
    if (command !== 'fill' && command !== 'region' && command !== 'selection-transform') {
      return payload;
    }
    const canvasId = typeof payload.canvasId === 'string' ? payload.canvasId.trim() : '';
    const layerId = typeof payload.layerId === 'string' ? payload.layerId.trim() : '';
    const frameIndex = Math.max(0, Math.round(Number(payload.frameIndex) || 0));
    if (!canvasId || !layerId) {
      return payload;
    }
    const canvasDoc = getProjectCanvasDocumentById(canvasId) || adoptSingleProjectCanvasId(canvasId);
    const frame = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames[frameIndex] : null;
    const layer = Array.isArray(frame?.layers) ? (frame.layers.find(item => item?.id === layerId) || null) : null;
    const pixelCount = Math.max(
      0,
      Math.floor(Number(canvasDoc?.width ?? state.width) || 0) * Math.floor(Number(canvasDoc?.height ?? state.height) || 0)
    );
    if (!layer || !pixelCount) {
      return payload;
    }
    const snapshotKey = buildSharedProjectLayerSnapshotKey(canvasId, frameIndex, layerId);
    const previousSnapshot = snapshotKey ? (sharedProjectLayerSnapshots.get(snapshotKey) || null) : null;
    const diffPayload = buildLayerDiffPayload(layer, previousSnapshot, pixelCount);
    if (!diffPayload) {
      return payload;
    }
    return {
      ...payload,
      pixelCount,
      patch: diffPayload,
    };
  }

  function refreshSharedProjectLayerSnapshotForPayload(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const canvasId = typeof payload.canvasId === 'string' ? payload.canvasId.trim() : '';
    const layerId = typeof payload.layerId === 'string' ? payload.layerId.trim() : '';
    const frameIndex = Math.max(0, Math.round(Number(payload.frameIndex) || 0));
    if (!canvasId || !layerId) {
      return false;
    }
    const canvasDoc = getProjectCanvasDocumentById(canvasId) || adoptSingleProjectCanvasId(canvasId);
    const frame = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames[frameIndex] : null;
    const layer = Array.isArray(frame?.layers) ? (frame.layers.find(item => item?.id === layerId) || null) : null;
    const pixelCount = Math.max(
      0,
      Math.floor(Number(canvasDoc?.width ?? state.width) || 0) * Math.floor(Number(canvasDoc?.height ?? state.height) || 0)
    );
    if (!layer || !pixelCount) {
      return false;
    }
    const snapshot = captureLayerPatchSnapshot(layer, pixelCount);
    if (!snapshot) {
      return false;
    }
    const snapshotKey = buildSharedProjectLayerSnapshotKey(canvasId, frameIndex, layerId);
    if (!snapshotKey) {
      return false;
    }
    sharedProjectLayerSnapshots.set(snapshotKey, snapshot);
    return true;
  }

  function logSharedProjectResolveEvent(event, {
    opId = '',
    revision = 0,
    kind = '',
    canvasId = '',
    resolvedCanvasId = '',
    frameId = '',
    resolvedFrameId = '',
    layerId = '',
    resolvedLayerId = '',
    structureRevision = 0,
    activeStructureRevision = activeSharedProjectStructureRevision,
    result = '',
    skipReason = '',
  } = {}) {
    console.info('[shared-sync]', {
      event,
      opId,
      revision,
      kind,
      canvasId,
      resolvedCanvasId,
      frameId,
      resolvedFrameId,
      layerId,
      resolvedLayerId,
      structureRevision,
      activeStructureRevision,
      result,
      skipReason,
    });
  }

  function clearSharedProjectInFlightStroke() {
    sharedProjectInFlightStroke = null;
  }

  function normalizeSharedProjectStrokePoints(points) {
    if (!Array.isArray(points) || !points.length) {
      return [];
    }
    const normalized = [];
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const x = Math.round(Number(point?.x));
      const y = Math.round(Number(point?.y));
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      const previous = normalized[normalized.length - 1];
      if (previous && previous.x === x && previous.y === y) {
        continue;
      }
      normalized.push({ x, y });
    }
    return normalized;
  }

  function buildSharedProjectBaseDrawCommand(tool, interactionSurface = null) {
    const normalizedTool = typeof tool === 'string' ? tool.trim() : '';
    const canvasDoc = getActiveProjectCanvasDocument();
    const canvasId = interactionSurface?.canvasDocId || canvasDoc?.id || '';
    const frameIndex = clamp(
      Math.round(Number(canvasDoc?.activeFrame ?? state.activeFrame) || 0),
      0,
      Math.max(0, (canvasDoc?.frames?.length || 1) - 1)
    );
    const frame = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames[frameIndex] : null;
    const layerId = canvasDoc?.activeLayer || state.activeLayer || '';
    const layerIndex = Array.isArray(frame?.layers)
      ? frame.layers.findIndex(entry => entry?.id === layerId)
      : -1;
    const layer = Array.isArray(frame?.layers)
      ? (frame.layers.find(entry => entry?.id === layerId) || null)
      : null;
    if (!canvasId || !layer?.id) {
      return null;
    }
    const colorMode = isRgbColorMode() ? 'rgb' : 'palette';
    const paletteIndex = resolveDrawPaletteIndex(pointerState.drawPaletteIndex);
    const rgba = normalizeColorValue(getActiveDrawColor(undefined, paletteIndex));
    return {
      tool: normalizedTool,
      canvasId,
      frameIndex,
      frameId: frame?.id || '',
      layerId: layer.id,
      layerIndex: layerIndex >= 0 ? layerIndex : 0,
      brushSize: clamp(Math.round(Number(state.brushSize) || 1), 1, 64),
      brushShape: getEffectiveBrushShape(),
      customBrushOffsets: hasCustomBrushData() ? getBrushOffsets(state.brushSize, BRUSH_SHAPE_CUSTOM) : null,
      colorMode,
      paletteIndex,
      rgba,
      palette: Array.isArray(state.palette)
        ? state.palette.map(color => normalizeColorValue(color))
        : null,
      mirror: normalizeMirrorAxisState(canvasDoc?.mirror || state.mirror, canvasDoc?.width || state.width, canvasDoc?.height || state.height),
      paletteIsolation: Boolean(isMultiPaletteIsolationEnabled()),
    };
  }

  function beginSharedProjectStrokeCapture(tool, position, interactionSurface = null) {
    const normalizedTool = typeof tool === 'string' ? tool.trim() : '';
    if ((normalizedTool !== 'pen' && normalizedTool !== 'eraser') || !position) {
      clearSharedProjectInFlightStroke();
      return;
    }
    const baseCommand = buildSharedProjectBaseDrawCommand(normalizedTool, interactionSurface);
    if (!baseCommand) {
      clearSharedProjectInFlightStroke();
      return;
    }
    sharedProjectInFlightStroke = {
      ...baseCommand,
      command: 'stroke',
      historyLabel: normalizedTool,
      points: normalizeSharedProjectStrokePoints([position]),
    };
  }

  function captureSharedProjectShapeCommand(tool, start, end, interactionSurface = null) {
    const normalizedTool = typeof tool === 'string' ? tool.trim() : '';
    if (!SHAPE_TOOLS.has(normalizedTool) || !start || !end) {
      clearSharedProjectInFlightStroke();
      return;
    }
    const baseCommand = buildSharedProjectBaseDrawCommand(normalizedTool, interactionSurface);
    if (!baseCommand) {
      clearSharedProjectInFlightStroke();
      return;
    }
    sharedProjectInFlightStroke = {
      ...baseCommand,
      command: 'shape',
      historyLabel: normalizedTool,
      start: {
        x: Math.round(Number(start.x) || 0),
        y: Math.round(Number(start.y) || 0),
      },
      end: {
        x: Math.round(Number(end.x) || 0),
        y: Math.round(Number(end.y) || 0),
      },
      filled: normalizedTool === 'rectFill' || normalizedTool === 'ellipseFill' || normalizedTool === 'ovalFill',
    };
  }

  function captureSharedProjectFillCommand(position, interactionSurface = null, options = {}) {
    if (!position) {
      clearSharedProjectInFlightStroke();
      return;
    }
    const baseCommand = buildSharedProjectBaseDrawCommand('fill', interactionSurface);
    if (!baseCommand) {
      clearSharedProjectInFlightStroke();
      return;
    }
    const gradientColors = getFillGradientColors(pointerState.drawPaletteIndex);
    sharedProjectInFlightStroke = {
      ...baseCommand,
      command: 'fill',
      historyLabel: 'fill',
      point: {
        x: Math.round(Number(position.x) || 0),
        y: Math.round(Number(position.y) || 0),
      },
      end: options?.end
        ? {
          x: Math.round(Number(options.end.x) || 0),
          y: Math.round(Number(options.end.y) || 0),
        }
        : {
          x: Math.round(Number(position.x) || 0),
          y: Math.round(Number(position.y) || 0),
      },
      fillMode: normalizeSelectSameMode(state.selectSameMode, SELECT_SAME_MODE_CONNECTED),
      fillStyle: normalizeFillStyle(options?.fillStyle, state.fillStyle),
      secondaryPaletteIndex: gradientColors.secondaryPaletteIndex,
      secondaryRgba: gradientColors.secondaryColor,
    };
  }

  function captureSharedProjectCurveCommand(start, control1, control2, end, interactionSurface = null) {
    if (!start || !end || !control1 || !control2) {
      clearSharedProjectInFlightStroke();
      return;
    }
    const baseCommand = buildSharedProjectBaseDrawCommand('curve', interactionSurface);
    if (!baseCommand) {
      clearSharedProjectInFlightStroke();
      return;
    }
    sharedProjectInFlightStroke = {
      ...baseCommand,
      command: 'curve',
      historyLabel: 'curve',
      start: {
        x: Math.round(Number(start.x) || 0),
        y: Math.round(Number(start.y) || 0),
      },
      control1: {
        x: Math.round(Number(control1.x) || 0),
        y: Math.round(Number(control1.y) || 0),
      },
      control2: {
        x: Math.round(Number(control2.x) || 0),
        y: Math.round(Number(control2.y) || 0),
      },
      end: {
        x: Math.round(Number(end.x) || 0),
        y: Math.round(Number(end.y) || 0),
      },
    };
  }

  function captureSharedProjectRegionCommand(bounds, interactionSurface = null, historyLabel = 'selectionTransform') {
    if (
      typeof isSharedProjectCollaborativeMode !== 'function'
      || !isSharedProjectCollaborativeMode()
    ) {
      clearSharedProjectInFlightStroke();
      return false;
    }
    const normalizedBounds = bounds && typeof bounds === 'object'
      ? {
        x0: Math.round(Number(bounds.x0) || 0),
        y0: Math.round(Number(bounds.y0) || 0),
        x1: Math.round(Number(bounds.x1) || 0),
        y1: Math.round(Number(bounds.y1) || 0),
      }
      : null;
    if (
      !normalizedBounds
      || normalizedBounds.x1 < normalizedBounds.x0
      || normalizedBounds.y1 < normalizedBounds.y0
    ) {
      clearSharedProjectInFlightStroke();
      return;
    }
    const baseCommand = buildSharedProjectBaseDrawCommand('region', interactionSurface);
    if (!baseCommand) {
      clearSharedProjectInFlightStroke();
      return;
    }
    const target = typeof resolveSharedProjectDrawCommandTarget === 'function'
      ? resolveSharedProjectDrawCommandTarget(baseCommand)
      : null;
    if (!target) {
      clearSharedProjectInFlightStroke();
      return;
    }
    const width = normalizedBounds.x1 - normalizedBounds.x0 + 1;
    const height = normalizedBounds.y1 - normalizedBounds.y0 + 1;
    const indices = [];
    const direct = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const canvasX = normalizedBounds.x0 + x;
        const canvasY = normalizedBounds.y0 + y;
        const canvasIndex = (canvasY * target.targetCanvas.width) + canvasX;
        const base = canvasIndex * 4;
        indices.push(Math.round(Number(target.layer.indices?.[canvasIndex]) || -1));
        if (target.layer.direct instanceof Uint8ClampedArray) {
          direct.push(
            target.layer.direct[base] || 0,
            target.layer.direct[base + 1] || 0,
            target.layer.direct[base + 2] || 0,
            target.layer.direct[base + 3] || 0
          );
        } else {
          direct.push(0, 0, 0, 0);
        }
      }
    }
    sharedProjectInFlightStroke = {
      ...baseCommand,
      command: 'region',
      historyLabel: String(historyLabel || 'selectionTransform'),
      bounds: normalizedBounds,
      width,
      height,
      indices,
      direct,
    };
  }

  function appendSharedProjectStrokePoint(position) {
    if (!sharedProjectInFlightStroke || !position) {
      return;
    }
    sharedProjectInFlightStroke.points = normalizeSharedProjectStrokePoints([
      ...(Array.isArray(sharedProjectInFlightStroke.points) ? sharedProjectInFlightStroke.points : []),
      position,
    ]);
  }

  function buildSharedProjectInFlightDrawCommandPayload(historyLabel = '') {
    const normalizedLabel = String(historyLabel || '').trim();
    if (!sharedProjectInFlightStroke || sharedProjectInFlightStroke.historyLabel !== normalizedLabel) {
      return null;
    }
    const drawCommand = sharedProjectInFlightStroke;
    if (!drawCommand.canvasId || !drawCommand.layerId) {
      return null;
    }
    const payload = {
      command: drawCommand.command,
      tool: drawCommand.tool,
      canvasId: isSharedProjectCollaborativeMode()
        ? (getSharedProjectCanonicalCanvasId() || drawCommand.canvasId)
        : drawCommand.canvasId,
      frameIndex: Math.max(0, Math.round(Number(drawCommand.frameIndex) || 0)),
      frameId: typeof drawCommand.frameId === 'string' ? drawCommand.frameId : '',
      layerId: drawCommand.layerId,
      layerIndex: Math.max(-1, Math.round(Number(drawCommand.layerIndex) || -1)),
      brushSize: clamp(Math.round(Number(drawCommand.brushSize) || 1), 1, 64),
      brushShape: normalizeBrushShape(drawCommand.brushShape, BRUSH_SHAPE_SQUARE),
      customBrushOffsets: Array.isArray(drawCommand.customBrushOffsets)
        ? drawCommand.customBrushOffsets.map(offset => ({
          dx: Math.round(Number(offset?.dx) || 0),
          dy: Math.round(Number(offset?.dy) || 0),
        }))
        : null,
      colorMode: drawCommand.colorMode === 'rgb' ? 'rgb' : 'palette',
      paletteIndex: normalizePaletteIndex(drawCommand.paletteIndex, state.activePaletteIndex),
      rgba: normalizeColorValue(drawCommand.rgba),
      palette: Array.isArray(drawCommand.palette)
        ? drawCommand.palette.slice(0, MAX_IMPORTED_PALETTE_COLORS).map(color => normalizeColorValue(color))
        : null,
      mirror: normalizeMirrorAxisState(drawCommand.mirror, state.width, state.height),
      paletteIsolation: Boolean(drawCommand.paletteIsolation),
    };
    if (drawCommand.command === 'stroke') {
      const points = normalizeSharedProjectStrokePoints(drawCommand.points);
      if (!points.length) {
        return null;
      }
      payload.points = points;
      return payload;
    }
    if (drawCommand.command === 'shape') {
      if (!drawCommand.start || !drawCommand.end) {
        return null;
      }
      payload.start = { x: Math.round(Number(drawCommand.start.x) || 0), y: Math.round(Number(drawCommand.start.y) || 0) };
      payload.end = { x: Math.round(Number(drawCommand.end.x) || 0), y: Math.round(Number(drawCommand.end.y) || 0) };
      payload.filled = Boolean(drawCommand.filled);
      return payload;
    }
    if (drawCommand.command === 'fill') {
      if (!drawCommand.point) {
        return null;
      }
      payload.point = { x: Math.round(Number(drawCommand.point.x) || 0), y: Math.round(Number(drawCommand.point.y) || 0) };
      payload.end = drawCommand.end
        ? { x: Math.round(Number(drawCommand.end.x) || 0), y: Math.round(Number(drawCommand.end.y) || 0) }
        : { ...payload.point };
      payload.fillMode = normalizeSelectSameMode(drawCommand.fillMode, SELECT_SAME_MODE_CONNECTED);
      payload.fillStyle = normalizeFillStyle(drawCommand.fillStyle, FILL_STYLE_SOLID);
      payload.secondaryPaletteIndex = normalizePaletteIndex(drawCommand.secondaryPaletteIndex, payload.paletteIndex);
      payload.secondaryRgba = normalizeColorValue(drawCommand.secondaryRgba || state.palette[payload.secondaryPaletteIndex] || payload.rgba);
      return appendSharedProjectResultPatchToDrawPayload(payload);
    }
    if (drawCommand.command === 'curve') {
      if (!drawCommand.start || !drawCommand.control1 || !drawCommand.control2 || !drawCommand.end) {
        return null;
      }
      payload.start = { x: Math.round(Number(drawCommand.start.x) || 0), y: Math.round(Number(drawCommand.start.y) || 0) };
      payload.control1 = { x: Math.round(Number(drawCommand.control1.x) || 0), y: Math.round(Number(drawCommand.control1.y) || 0) };
      payload.control2 = { x: Math.round(Number(drawCommand.control2.x) || 0), y: Math.round(Number(drawCommand.control2.y) || 0) };
      payload.end = { x: Math.round(Number(drawCommand.end.x) || 0), y: Math.round(Number(drawCommand.end.y) || 0) };
      return payload;
    }
    if (drawCommand.command === 'region') {
      if (!drawCommand.bounds || !drawCommand.width || !drawCommand.height) {
        return null;
      }
      payload.bounds = {
        x0: Math.round(Number(drawCommand.bounds.x0) || 0),
        y0: Math.round(Number(drawCommand.bounds.y0) || 0),
        x1: Math.round(Number(drawCommand.bounds.x1) || 0),
        y1: Math.round(Number(drawCommand.bounds.y1) || 0),
      };
      payload.width = Math.max(1, Math.round(Number(drawCommand.width) || 1));
      payload.height = Math.max(1, Math.round(Number(drawCommand.height) || 1));
      payload.indices = Array.isArray(drawCommand.indices) ? drawCommand.indices.map(value => Math.round(Number(value) || -1)) : [];
      payload.direct = Array.isArray(drawCommand.direct) ? drawCommand.direct.map(value => clamp(Math.round(Number(value) || 0), 0, 255)) : [];
      return appendSharedProjectResultPatchToDrawPayload(payload);
    }
    return null;
  }

  function buildSharedProjectDrawOpPayload(historyLabel = '') {
    if (classifySharedProjectOpType(historyLabel) !== 'draw') {
      return null;
    }
    const strokeCommandPayload = buildSharedProjectInFlightDrawCommandPayload(historyLabel);
    if (strokeCommandPayload) {
      return strokeCommandPayload;
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    const canvasId = isSharedProjectCollaborativeMode()
      ? (getSharedProjectCanonicalCanvasId() || canvasDoc?.id || '')
      : (canvasDoc?.id || '');
    const frameIndex = clamp(
      Math.round(Number(canvasDoc?.activeFrame ?? state.activeFrame) || 0),
      0,
      Math.max(0, (canvasDoc?.frames?.length || 1) - 1)
    );
    const frame = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames[frameIndex] : null;
    if (!canvasId || !frame || !Array.isArray(frame.layers)) {
      return null;
    }
    const layer = frame.layers.find(item => item?.id === canvasDoc?.activeLayer || item?.id === state.activeLayer) || null;
    if (!layer) {
      return null;
    }
    const layerIndex = frame.layers.findIndex(item => item === layer);
    const pixelCount = Math.max(
      0,
      Math.floor(Number(canvasDoc?.width ?? state.width) || 0) * Math.floor(Number(canvasDoc?.height ?? state.height) || 0)
    );
    if (!pixelCount) {
      return null;
    }
    const snapshotKey = buildSharedProjectLayerSnapshotKey(canvasId, frameIndex, layer.id);
    const previousSnapshot = snapshotKey ? (sharedProjectLayerSnapshots.get(snapshotKey) || null) : null;
    const diffPayload = buildLayerDiffPayload(layer, previousSnapshot, pixelCount);
    if (!diffPayload) {
      return null;
    }
    return {
      canvasId,
      frameIndex,
      frameId: frame?.id || '',
      layerId: layer.id,
      layerIndex,
      pixelCount,
      patch: diffPayload,
      palette: Array.isArray(state.palette)
        ? state.palette.slice(0, MAX_IMPORTED_PALETTE_COLORS).map(color => normalizeColorValue(color))
        : null,
    };
  }

  function buildSharedProjectStructureOpPayload(historyLabel = '') {
    if (classifySharedProjectOpType(historyLabel) !== 'structure') {
      return null;
    }
    const normalizedHistoryLabel = String(historyLabel || '');
    const canvases = getProjectCanvasDocuments();
    const activeCanvas = getActiveProjectCanvasDocument() || null;
    const activeCanvasId = activeCanvas?.id || '';
    let sheetSyncPayload = null;
    if (normalizedHistoryLabel === 'addSheet') {
      const snapshot = makeHistorySnapshot({ clonePixelData: false });
      const activePackagedProject = buildPackagedProjectPayload(snapshot, {
        session: buildAutosaveSessionPayload(),
        includeSheets: false,
      });
      sheetSyncPayload = buildProjectSheetsPayload(activePackagedProject);
    }
    return {
      kind: 'structure-sync',
      historyLabel: normalizedHistoryLabel,
      activeCanvasId,
      canvasCount: canvases.length,
      canvases: canvases.map((canvas, canvasIndex) => ({
        id: typeof canvas?.id === 'string' ? canvas.id : '',
        name: typeof canvas?.name === 'string' ? canvas.name : '',
        order: canvasIndex,
        width: Math.max(1, Math.round(Number(canvas?.width) || 0)),
        height: Math.max(1, Math.round(Number(canvas?.height) || 0)),
        activeFrame: clamp(
          Math.round(Number(canvas?.activeFrame) || 0),
          0,
          Math.max(0, (canvas?.frames?.length || 1) - 1)
        ),
        activeLayer: typeof canvas?.activeLayer === 'string' ? canvas.activeLayer : '',
        mirror: normalizeMirrorAxisState(canvas?.mirror, canvas?.width, canvas?.height),
        frames: Array.isArray(canvas?.frames)
          ? canvas.frames.map((frame, frameIndex) => ({
            id: typeof frame?.id === 'string' ? frame.id : `frame-${canvasIndex}-${frameIndex}`,
            name: typeof frame?.name === 'string' ? frame.name : getDefaultFrameName(frameIndex + 1),
            duration: Math.max(1, Math.round(Number(frame?.duration) || (1000 / 12))),
            voxelPreviewYawDeg: normalizeVoxelPreviewYawDegrees(frame?.voxelPreviewYawDeg),
            voxelPreviewPitchDeg: normalizeVoxelPreviewPitchDegrees(frame?.voxelPreviewPitchDeg),
            layers: Array.isArray(frame?.layers)
              ? frame.layers.map((layer, layerIndex) => ({
                id: typeof layer?.id === 'string' ? layer.id : `layer-${canvasIndex}-${frameIndex}-${layerIndex}`,
                type: isSimulationLayer(layer) ? SIM_LAYER_TYPE : 'raster',
                name: typeof layer?.name === 'string' ? layer.name : getDefaultLayerName(layerIndex + 1),
                visible: layer?.visible !== false,
                opacity: normalizeLayerOpacity(layer?.opacity),
                blendMode: normalizeLayerBlendMode(layer?.blendMode),
              }))
              : [],
          }))
          : [],
      })),
      ...(sheetSyncPayload?.sheets?.length ? {
        activeSheetId: sheetSyncPayload.activeSheetId || '',
        sheets: sheetSyncPayload.sheets,
      } : {}),
    };
  }


  function buildSharedProjectPaletteOpPayload(historyLabel = '') {
    if (classifySharedProjectOpType(historyLabel) !== 'palette') {
      return null;
    }
    const palette = Array.isArray(state.palette)
      ? state.palette.map(color => normalizeColorValue(color))
      : [];
    if (!palette.length) {
      return null;
    }
    return {
      palette,
      paletteSize: palette.length,
      historyLabel: String(historyLabel || ''),
    };
  }

  function generateSharedProjectOpId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `op-${crypto.randomUUID()}`;
    }
    return `op-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
  }

  function normalizeSharedProjectOpKind(historyLabel = '', opPayload = null) {
    if (sharedProjectOpCodec) {
      return sharedProjectOpCodec.normalizeSharedProjectOpKind(historyLabel, opPayload);
    }
    const normalizedLabel = String(historyLabel || '').trim();
    const normalizedType = classifySharedProjectOpType(normalizedLabel);
    if (normalizedType === 'draw') {
      if (opPayload?.command === 'stroke') {
        return 'stroke-command';
      }
      if (opPayload?.command === 'shape') {
        return 'shape-command';
      }
      if (opPayload?.command === 'fill') {
        return 'fill-command';
      }
      if (opPayload?.command === 'curve') {
        return 'curve-command';
      }
      if (opPayload?.command === 'region') {
        return 'region-command';
      }
      if (normalizedLabel === 'fill') {
        return 'fill';
      }
      if (
        normalizedLabel === 'selectionMove'
        || normalizedLabel === 'selectionPaste'
        || normalizedLabel === 'selectionCut'
        || normalizedLabel === 'selectionTransform'
      ) {
        return 'selection-transform';
      }
      return 'layer-patch';
    }
    if (normalizedType === 'structure') {
      if (normalizedLabel === 'addLayer' || normalizedLabel === 'addSimulationLayer' || normalizedLabel === 'duplicateLayer' || normalizedLabel === 'pasteLayer') {
        return 'add-layer';
      }
      if (normalizedLabel === 'removeLayer') {
        return 'remove-layer';
      }
      if (normalizedLabel === 'moveLayer' || normalizedLabel === 'reorderLayer') {
        return 'move-layer';
      }
      if (normalizedLabel === 'duplicateFrame' || normalizedLabel === 'pasteFrame' || normalizedLabel === 'addFrame') {
        return 'add-frame';
      }
      if (normalizedLabel === 'removeFrame') {
        return 'remove-frame';
      }
      if (normalizedLabel === 'moveFrame' || normalizedLabel === 'reorderFrame') {
        return 'move-frame';
      }
      if (normalizedLabel === 'resizeCanvas') {
        return 'resize-canvas';
      }
      if (normalizedLabel === 'addCanvas') {
        return 'canvas-create';
      }
      if (normalizedLabel === 'removeCanvas') {
        return 'canvas-delete';
      }
      if (normalizedLabel === 'reorderCanvas') {
        return 'canvas-reorder';
      }
      return 'structure';
    }
    if (normalizedType === 'palette') {
      return 'palette-update';
    }
    if (normalizedType === 'create') {
      return 'checkpoint';
    }
    return opPayload && typeof opPayload === 'object' ? 'snapshot' : 'session';
  }

  function getSharedProjectOpSeq(opRecord) {
    if (sharedProjectOpCodec) {
      return sharedProjectOpCodec.getSharedProjectOpSeq(opRecord);
    }
    return Math.max(
      0,
      Math.round(
        Number(opRecord?.seq)
        || Number(opRecord?.revision)
        || 0
      )
    );
  }

  function extractSharedProjectOpPayload(opRecord) {
    if (sharedProjectOpCodec) {
      return sharedProjectOpCodec.extractSharedProjectOpPayload(opRecord);
    }
    if (opRecord?.payload && typeof opRecord.payload === 'object') {
      if (opRecord.payload.op && typeof opRecord.payload.op === 'object') {
        return {
          ...opRecord.payload,
          ...opRecord.payload.op,
        };
      }
      return opRecord.payload;
    }
    if (opRecord?.payload?.op && typeof opRecord.payload.op === 'object') {
      return opRecord.payload.op;
    }
    if (opRecord?.op && typeof opRecord.op === 'object') {
      return opRecord.op;
    }
    if (opRecord && typeof opRecord === 'object') {
      return opRecord;
    }
    return null;
  }

  function getSharedProjectOpId(opRecord) {
    if (sharedProjectOpCodec) {
      return sharedProjectOpCodec.getSharedProjectOpId(opRecord);
    }
    const payload = extractSharedProjectOpPayload(opRecord);
    if (typeof payload?.opId === 'string' && payload.opId.trim()) {
      return payload.opId.trim();
    }
    if (typeof opRecord?.opId === 'string' && opRecord.opId.trim()) {
      return opRecord.opId.trim();
    }
    if (typeof opRecord?.op_id === 'string' && opRecord.op_id.trim()) {
      return opRecord.op_id.trim();
    }
    return '';
  }

  function normalizeSharedProjectOpId(opRecord) {
    if (sharedProjectOpCodec) {
      return sharedProjectOpCodec.normalizeSharedProjectOpId(opRecord);
    }
    const payload = extractSharedProjectOpPayload(opRecord);
    if (typeof payload?.opId === 'string' && payload.opId.trim()) {
      return payload.opId.trim();
    }
    if (typeof payload?.id === 'string' && payload.id.trim()) {
      return payload.id.trim();
    }
    if (typeof payload?.operationId === 'string' && payload.operationId.trim()) {
      return payload.operationId.trim();
    }
    if (typeof opRecord?.opId === 'string' && opRecord.opId.trim()) {
      return opRecord.opId.trim();
    }
    if (typeof opRecord?.op_id === 'string' && opRecord.op_id.trim()) {
      return opRecord.op_id.trim();
    }
    if (typeof opRecord?.id === 'string' && opRecord.id.trim()) {
      return opRecord.id.trim();
    }
    if (typeof opRecord?.operationId === 'string' && opRecord.operationId.trim()) {
      return opRecord.operationId.trim();
    }
    return '';
  }

  function getSharedProjectDrawChangedPixelCount(opRecord) {
    const payload = extractSharedProjectOpPayload(opRecord);
    if (!payload || typeof payload !== 'object') {
      return 0;
    }
    if (payload.command === 'region') {
      return Math.max(0, Math.round(Number(payload.width) || 0) * Math.round(Number(payload.height) || 0));
    }
    if (payload.command === 'stroke') {
      return Math.max(0, normalizeSharedProjectStrokePoints(payload.points).length);
    }
    if (payload.command === 'shape') {
      const start = payload.start || null;
      const end = payload.end || null;
      if (!start || !end) {
        return 0;
      }
      const width = Math.abs(Math.round(Number(end.x) || 0) - Math.round(Number(start.x) || 0)) + 1;
      const height = Math.abs(Math.round(Number(end.y) || 0) - Math.round(Number(start.y) || 0)) + 1;
      return Math.max(0, width * height);
    }
    if (payload.command === 'fill') {
      return 0;
    }
    return Math.max(0, Math.floor(Number(payload.pixelCount) || 0));
  }

  function logSharedProjectDrawLifecycle(event, opRecord, extra = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const diagnostics = extra.diagnostics && typeof extra.diagnostics === 'object' ? extra.diagnostics : {};
    console.info('[shared-draw-op]', {
      event,
      opId: normalizeSharedProjectOpId(opRecord),
      revision: getSharedProjectOpSeq(opRecord),
      kind: typeof opRecord?.kind === 'string' ? opRecord.kind : '',
      mode: typeof extra.mode === 'string' ? extra.mode : '',
      canvasId: typeof payload?.canvasId === 'string' ? payload.canvasId.trim() : '',
      resolvedCanvasId: diagnostics.resolvedCanvasId || '',
      frameId: typeof payload?.frameId === 'string' ? payload.frameId.trim() : '',
      resolvedFrameId: diagnostics.resolvedFrameId || '',
      frameIndex: Math.max(0, Math.round(Number(payload?.frameIndex) || 0)),
      layerId: typeof payload?.layerId === 'string' ? payload.layerId.trim() : '',
      resolvedLayerId: diagnostics.resolvedLayerId || '',
      layerIndex: Math.max(-1, Math.round(Number(payload?.layerIndex) || -1)),
      changedPixelCount: getSharedProjectDrawChangedPixelCount(opRecord),
      activeSharedProjectRevision,
      activeSharedProjectStructureRevision,
      reason: typeof extra.reason === 'string' ? extra.reason : '',
      skipReason: typeof extra.skipReason === 'string' ? extra.skipReason : '',
      error: extra.error ? String(extra.error?.message || extra.error || '') : '',
    });
  }

  function logSharedProjectLocalOpLifecycle(stage, opRecord, {
    source = '',
    error = null,
    status = '',
    opType = '',
  } = {}) {
    const opId = normalizeSharedProjectOpId(opRecord);
    const payload = extractSharedProjectOpPayload(opRecord);
    const resolvedOpType = opType || classifySharedProjectOpType(
      String(opRecord?.historyLabel || payload?.historyLabel || '')
    );
    console.info('[shared-local-op]', {
      stage,
      opId,
      projectId: activeSharedProjectId || '',
      projectKey: normalizeMultiProjectKey(opRecord?.projectKey || payload?.projectKey || activeSharedProjectKey || ''),
      activeSharedProjectRevision,
      sharedProjectSessionId: sharedProjectSessionId || '',
      opType: resolvedOpType,
      source,
      status,
      error: error ? String(error?.message || error || '') : '',
    });
  }


  return Object.freeze({
    classifySharedProjectOpType,
    isSharedProjectDrawKind,
    isSharedProjectOpAlreadySettled,
    buildSharedProjectLayerSnapshotKey,
    appendSharedProjectResultPatchToDrawPayload,
    refreshSharedProjectLayerSnapshotForPayload,
    logSharedProjectResolveEvent,
    clearSharedProjectInFlightStroke,
    normalizeSharedProjectStrokePoints,
    buildSharedProjectBaseDrawCommand,
    beginSharedProjectStrokeCapture,
    captureSharedProjectShapeCommand,
    captureSharedProjectFillCommand,
    captureSharedProjectCurveCommand,
    captureSharedProjectRegionCommand,
    appendSharedProjectStrokePoint,
    buildSharedProjectInFlightDrawCommandPayload,
    buildSharedProjectDrawOpPayload,
    buildSharedProjectStructureOpPayload,
    buildSharedProjectPaletteOpPayload,
    generateSharedProjectOpId,
    normalizeSharedProjectOpKind,
    getSharedProjectOpSeq,
    extractSharedProjectOpPayload,
    getSharedProjectOpId,
    normalizeSharedProjectOpId,
    getSharedProjectDrawChangedPixelCount,
    logSharedProjectDrawLifecycle,
    logSharedProjectLocalOpLifecycle,
  });
      }
    })(scope);
  }

  root.sharedProjectOpUtils = Object.freeze({
    createSharedProjectOpUtils,
  });
})();
