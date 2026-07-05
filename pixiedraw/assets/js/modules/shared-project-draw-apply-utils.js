(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectDrawApplyUtils(rawScope = {}) {
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
  function resolveSharedProjectLayerForPayload(frame, payload = {}, requestedLayerId = '') {
    const layers = Array.isArray(frame?.layers) ? frame.layers : [];
    const layerId = typeof requestedLayerId === 'string' && requestedLayerId.trim()
      ? requestedLayerId.trim()
      : (typeof payload?.layerId === 'string' ? payload.layerId.trim() : '');
    if (!layers.length) {
      return { layer: null, layerId, resolution: 'missing' };
    }
    if (layerId) {
      const exact = layers.find(entry => entry?.id === layerId) || null;
      if (exact) {
        return { layer: exact, layerId: exact.id || layerId, resolution: 'id' };
      }
      if (isSharedProjectCollaborativeMode()) {
        return { layer: null, layerId, resolution: 'missing-id' };
      }
    } else if (isSharedProjectCollaborativeMode()) {
      return { layer: null, layerId, resolution: 'missing-id' };
    }
    const layerIndex = Math.round(Number(payload?.layerIndex));
    if (Number.isFinite(layerIndex) && layerIndex >= 0 && layerIndex < layers.length) {
      const byIndex = layers[layerIndex] || null;
      if (byIndex?.id) {
        return { layer: byIndex, layerId: byIndex.id, resolution: 'layer-index' };
      }
    }
    if (layers.length === 1 && layers[0]?.id) {
      return { layer: layers[0], layerId: layers[0].id, resolution: 'single-layer' };
    }
    return { layer: null, layerId, resolution: 'missing' };
  }

  function inspectIncomingSharedProjectDrawOp(opRecord) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const opId = normalizeSharedProjectOpId(opRecord);
    const revision = getSharedProjectOpSeq(opRecord);
    const kind = typeof opRecord?.kind === 'string'
      ? opRecord.kind.trim()
      : (typeof payload?.kind === 'string' ? payload.kind.trim() : '');
    const canvasId = typeof payload?.canvasId === 'string' ? payload.canvasId.trim() : '';
    const layerId = typeof payload?.layerId === 'string' ? payload.layerId.trim() : '';
    const frameIndex = Math.max(0, Math.round(Number(payload?.frameIndex) || 0));
    const drawCommandType = typeof payload?.command === 'string'
      ? payload.command.trim()
      : (
        opRecord?.kind === 'stroke-command'
          ? 'stroke'
          : (opRecord?.kind === 'shape-command'
            ? 'shape'
            : (opRecord?.kind === 'fill-command'
              ? 'fill'
              : (opRecord?.kind === 'curve-command'
                ? 'curve'
                : (opRecord?.kind === 'region-command' ? 'region' : ''))))
      );
    const pixelCount = Math.max(0, Math.floor(Number(payload?.pixelCount) || 0));
    const patch = payload?.patch && typeof payload.patch === 'object' ? payload.patch : null;
    const structureRevision = Math.max(
      0,
      Math.round(Number(opRecord?.structure_revision ?? payload?.structureRevision ?? payload?.structure_revision) || 0)
    );
    if (drawCommandType === 'stroke') {
      const points = normalizeSharedProjectStrokePoints(payload?.points);
      if (!canvasId || !layerId || !points.length) {
        logSharedProjectResolveEvent('canvas-resolve-failed', {
          opId, revision, kind, canvasId, layerId, structureRevision, result: 'skip', skipReason: 'missing-stroke-fields',
        });
        return { ok: false, reason: 'missing-stroke-fields', canvasId, layerId, frameIndex, pixelCount: 0 };
      }
    } else if (drawCommandType === 'shape') {
      if (!canvasId || !layerId || !payload?.start || !payload?.end) {
        logSharedProjectResolveEvent('canvas-resolve-failed', {
          opId, revision, kind, canvasId, layerId, structureRevision, result: 'skip', skipReason: 'missing-shape-fields',
        });
        return { ok: false, reason: 'missing-shape-fields', canvasId, layerId, frameIndex, pixelCount: 0 };
      }
    } else if (drawCommandType === 'fill') {
      if (!canvasId || !layerId || (!payload?.point && (!patch || !pixelCount))) {
        logSharedProjectResolveEvent('canvas-resolve-failed', {
          opId, revision, kind, canvasId, layerId, structureRevision, result: 'skip', skipReason: 'missing-fill-fields',
        });
        return { ok: false, reason: 'missing-fill-fields', canvasId, layerId, frameIndex, pixelCount: 0 };
      }
    } else if (drawCommandType === 'curve') {
      if (!canvasId || !layerId || !payload?.start || !payload?.control1 || !payload?.control2 || !payload?.end) {
        logSharedProjectResolveEvent('canvas-resolve-failed', {
          opId, revision, kind, canvasId, layerId, structureRevision, result: 'skip', skipReason: 'missing-curve-fields',
        });
        return { ok: false, reason: 'missing-curve-fields', canvasId, layerId, frameIndex, pixelCount: 0 };
      }
    } else if (drawCommandType === 'region') {
      if (
        !canvasId
        || !layerId
        || (
          (!patch || !pixelCount)
          && (
            !payload?.bounds
            || !Number.isFinite(Number(payload?.width))
            || !Number.isFinite(Number(payload?.height))
          )
        )
      ) {
        logSharedProjectResolveEvent('canvas-resolve-failed', {
          opId, revision, kind, canvasId, layerId, structureRevision, result: 'skip', skipReason: 'missing-region-fields',
        });
        return { ok: false, reason: 'missing-region-fields', canvasId, layerId, frameIndex, pixelCount: 0 };
      }
    } else if (!canvasId || !layerId || !pixelCount || !patch) {
      logSharedProjectResolveEvent('canvas-resolve-failed', {
        opId, revision, kind, canvasId, layerId, structureRevision, result: 'skip', skipReason: 'missing-patch-fields',
      });
      return { ok: false, reason: 'missing-patch-fields', canvasId, layerId, frameIndex, pixelCount };
    }
    const structureRevisionMismatch = (
      structureRevision > 0
      && activeSharedProjectStructureRevision > 0
      && structureRevision !== activeSharedProjectStructureRevision
    );
    if (structureRevisionMismatch) {
      logSharedProjectResolveEvent('structure-revision-mismatch', {
        opId,
        revision,
        kind,
        canvasId,
        layerId,
        structureRevision,
        activeStructureRevision: activeSharedProjectStructureRevision,
        result: 'warn',
        skipReason: 'structure-revision-mismatch',
      });
    }
    const localCanvasIds = getProjectCanvasDocuments()
      .map(canvas => (typeof canvas?.id === 'string' ? canvas.id.trim() : ''))
      .filter(Boolean);
    const targetCanvas = getProjectCanvasDocumentById(canvasId) || adoptSingleProjectCanvasId(canvasId);
    const resolvedCanvasId = normalizeSharedProjectCanvasId(targetCanvas?.id || resolveSharedProjectCanvasAlias(canvasId));
    if (canvasId && localCanvasIds.includes(canvasId)) {
      console.info('[shared-sync]', {
        event: 'op-canvas-identity-ok',
        opId,
        revision,
        payloadCanvasId: canvasId,
        localCanvasIds,
        activeCanvasId: getActiveProjectCanvasDocument()?.id || '',
        projectKey: activeSharedProjectKey || '',
      });
    } else if (targetCanvas && resolvedCanvasId) {
      console.info('[shared-sync]', {
        event: 'op-canvas-identity-alias',
        opId,
        revision,
        payloadCanvasId: canvasId,
        resolvedCanvasId,
        localCanvasIds,
        activeCanvasId: getActiveProjectCanvasDocument()?.id || '',
        projectKey: activeSharedProjectKey || '',
        aliasCount: sharedProjectCanvasAliases.size,
      });
    } else {
      console.warn('[shared-sync]', {
        event: 'op-canvas-identity-mismatch',
        opId,
        revision,
        payloadCanvasId: canvasId,
        localCanvasIds,
        activeCanvasId: getActiveProjectCanvasDocument()?.id || '',
        projectKey: activeSharedProjectKey || '',
      });
    }
    if (!targetCanvas || !Array.isArray(targetCanvas.frames) || frameIndex >= targetCanvas.frames.length) {
      logSharedProjectResolveEvent('canvas-resolve-failed', {
        opId, revision, kind, canvasId, resolvedCanvasId: targetCanvas?.id || '', layerId, structureRevision, result: 'skip', skipReason: 'missing-canvas-or-frame',
      });
      return {
        ok: false,
        reason: structureRevisionMismatch ? 'structure-revision-mismatch' : 'missing-canvas-or-frame',
        canvasId,
        layerId,
        frameIndex,
        pixelCount,
        structureRevision,
        activeStructureRevision: activeSharedProjectStructureRevision,
      };
    }
    const frame = targetCanvas.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      logSharedProjectResolveEvent('frame-resolve-failed', {
        opId, revision, kind, canvasId, resolvedCanvasId: targetCanvas?.id || '', layerId, structureRevision, result: 'skip', skipReason: 'missing-frame-layers',
      });
      return {
        ok: false,
        reason: structureRevisionMismatch ? 'structure-revision-mismatch' : 'missing-frame-layers',
        canvasId,
        layerId,
        frameIndex,
        pixelCount,
        structureRevision,
        activeStructureRevision: activeSharedProjectStructureRevision,
      };
    }
    const resolvedLayer = resolveSharedProjectLayerForPayload(frame, payload, layerId);
    if (!resolvedLayer.layer) {
      logSharedProjectResolveEvent('layer-resolve-failed', {
        opId, revision, kind, canvasId, resolvedCanvasId: targetCanvas?.id || '', resolvedFrameId: frame?.id || '', layerId, structureRevision, result: 'skip', skipReason: 'missing-target-layer',
      });
      return {
        ok: false,
        reason: structureRevisionMismatch ? 'structure-revision-mismatch' : 'missing-target-layer',
        canvasId,
        layerId,
        frameIndex,
        pixelCount,
        structureRevision,
        activeStructureRevision: activeSharedProjectStructureRevision,
      };
    }
    if (resolvedLayer.resolution !== 'id') {
      console.info('[shared-sync]', {
        event: 'layer-resolve-fallback',
        opId,
        revision,
        kind,
        canvasId,
        frameIndex,
        payloadLayerId: layerId,
        resolvedLayerId: resolvedLayer.layerId,
        resolution: resolvedLayer.resolution,
      });
    }
    logSharedProjectResolveEvent('canvas-resolve-ok', {
      opId,
      revision,
      kind,
      canvasId,
      resolvedCanvasId: targetCanvas?.id || '',
      resolvedFrameId: frame?.id || '',
      layerId,
      resolvedLayerId: resolvedLayer.layerId,
      structureRevision,
      result: 'ok',
    });
    return {
      ok: true,
      reason: 'ok',
      canvasId,
      resolvedCanvasId: targetCanvas?.id || '',
      resolvedFrameId: frame?.id || '',
      layerId,
      resolvedLayerId: resolvedLayer.layerId,
      frameIndex,
      pixelCount: drawCommandType ? 0 : pixelCount,
      command: drawCommandType || 'patch',
      structureRevision,
      activeStructureRevision: activeSharedProjectStructureRevision,
    };
  }

  function canApplyIncomingSharedProjectDrawOp(opRecord) {
    return inspectIncomingSharedProjectDrawOp(opRecord).ok;
  }

  function shouldRefreshForSharedProjectApplySkip(reason = '') {
    const normalizedReason = String(reason || '').trim();
    return (
      normalizedReason === 'structure-revision-mismatch'
      || normalizedReason === 'missing-canvas-or-frame'
      || normalizedReason === 'missing-frame-layers'
      || normalizedReason === 'missing-target-layer'
      || normalizedReason === 'missing-patch-fields'
      || normalizedReason === 'missing-stroke-fields'
      || normalizedReason === 'missing-shape-fields'
      || normalizedReason === 'missing-fill-fields'
      || normalizedReason === 'missing-curve-fields'
      || normalizedReason === 'missing-region-fields'
    );
  }


  function normalizeSharedProjectPalettePayload(palette) {
    if (!Array.isArray(palette) || !palette.length) {
      return null;
    }
    return palette
      .slice(0, MAX_IMPORTED_PALETTE_COLORS)
      .map(color => normalizeColorValue(color));
  }

  function syncSharedProjectPaletteFromPayload(palette, { source = 'draw-op' } = {}) {
    const normalizedPalette = normalizeSharedProjectPalettePayload(palette);
    if (!normalizedPalette || !normalizedPalette.length) {
      return false;
    }
    const currentPalette = Array.isArray(state.palette)
      ? state.palette.map(color => normalizeColorValue(color))
      : [];
    if (palettesMatch(currentPalette, normalizedPalette)) {
      return false;
    }
    const syncMode = getSharedProjectPalettePayloadSyncMode(currentPalette, normalizedPalette);
    if (syncMode === 'structural') {
      console.debug('[shared-realtime] palette-sync-deferred-structural-change', {
        source,
        currentPaletteSize: currentPalette.length,
        incomingPaletteSize: normalizedPalette.length,
      });
      return false;
    }
    state.palette = normalizedPalette.map(color => normalizeColorValue(color));
    state.activePaletteIndex = clamp(
      normalizePaletteIndex(state.activePaletteIndex, 0),
      0,
      Math.max(0, state.palette.length - 1)
    );
    state.secondaryPaletteIndex = clamp(
      normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex),
      0,
      Math.max(0, state.palette.length - 1)
    );
    if (isIndexColorMode()) {
      const activeColor = state.palette[state.activePaletteIndex] || state.palette[0] || state.activeRgb;
      state.activeRgb = normalizeColorValue(activeColor || { r: 255, g: 255, b: 255, a: 255 });
    }
    syncCurrentPalettePresetFromPalette(state.palette, { syncControl: true });
    renderPalette();
    syncPaletteInputs();
    scheduleSessionPersist({ includeSnapshots: false });
    console.debug('[shared-realtime] palette-synced-from-draw', {
      source,
      paletteSize: state.palette.length,
    });
    return true;
  }

  function palettesHaveSameColorMultiset(leftPalette, rightPalette) {
    if (!Array.isArray(leftPalette) || !Array.isArray(rightPalette) || leftPalette.length !== rightPalette.length) {
      return false;
    }
    const counts = new Map();
    leftPalette.forEach(color => {
      const key = getPaletteColorKey(color);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    for (let index = 0; index < rightPalette.length; index += 1) {
      const key = getPaletteColorKey(rightPalette[index]);
      const count = counts.get(key) || 0;
      if (count <= 0) {
        return false;
      }
      if (count === 1) {
        counts.delete(key);
      } else {
        counts.set(key, count - 1);
      }
    }
    return counts.size === 0;
  }

  function paletteStartsWithPalette(targetPalette, prefixPalette) {
    if (!Array.isArray(targetPalette) || !Array.isArray(prefixPalette) || targetPalette.length < prefixPalette.length) {
      return false;
    }
    for (let index = 0; index < prefixPalette.length; index += 1) {
      if (!colorsMatchRgba(targetPalette[index], prefixPalette[index])) {
        return false;
      }
    }
    return true;
  }

  function getSharedProjectPalettePayloadSyncMode(currentPalette, incomingPalette) {
    if (!Array.isArray(currentPalette) || !currentPalette.length) {
      return 'replace';
    }
    if (!Array.isArray(incomingPalette) || !incomingPalette.length || palettesMatch(currentPalette, incomingPalette)) {
      return 'same';
    }
    if (incomingPalette.length < currentPalette.length) {
      return 'structural';
    }
    if (incomingPalette.length > currentPalette.length) {
      return paletteStartsWithPalette(incomingPalette, currentPalette) ? 'replace' : 'structural';
    }
    return palettesHaveSameColorMultiset(currentPalette, incomingPalette) ? 'structural' : 'replace';
  }

  function buildSharedProjectExactPaletteIndexMapping(previousPalette, nextPalette) {
    const nextColorIndexes = new Map();
    const normalizedNext = Array.isArray(nextPalette)
      ? nextPalette.map(color => normalizeColorValue(color))
      : [];
    normalizedNext.forEach((color, index) => {
      const key = getPaletteColorKey(color);
      const indexes = nextColorIndexes.get(key) || [];
      indexes.push(index);
      nextColorIndexes.set(key, indexes);
    });
    const normalizedPrevious = Array.isArray(previousPalette)
      ? previousPalette.map(color => normalizeColorValue(color))
      : [];
    return normalizedPrevious.map(color => {
      const key = getPaletteColorKey(color);
      const indexes = nextColorIndexes.get(key);
      return indexes && indexes.length ? indexes.shift() : -1;
    });
  }

  function getSharedProjectPaletteOpHistoryLabel(opRecord, payload) {
    return String(
      payload?.historyLabel
      || opRecord?.historyLabel
      || opRecord?.history_label
      || ''
    ).trim();
  }

  function prepareSharedProjectDrawCommandPalette(command, { source = 'draw-op' } = {}) {
    if (!command || command.paletteIsolation) {
      return command;
    }
    const commandPalette = normalizeSharedProjectPalettePayload(command.palette);
    const currentPaletteBeforeSync = Array.isArray(state.palette)
      ? state.palette.map(color => normalizeColorValue(color))
      : [];
    const paletteSyncMode = commandPalette
      ? getSharedProjectPalettePayloadSyncMode(currentPaletteBeforeSync, commandPalette)
      : 'same';
    syncSharedProjectPaletteFromPayload(command.palette, { source });
    if (command.tool === 'eraser' || command.colorMode !== 'palette') {
      return command;
    }
    const requestedIndex = Math.round(Number(command.paletteIndex));
    const paletteIndex = Number.isFinite(requestedIndex) && requestedIndex >= 0
      ? requestedIndex
      : normalizePaletteIndex(command.paletteIndex, state.activePaletteIndex);
    const rgba = normalizeColorValue(command.rgba);
    if (paletteIndex >= MAX_IMPORTED_PALETTE_COLORS) {
      return {
        ...command,
        colorMode: 'rgb',
        paletteIsolation: true,
        rgba,
      };
    }
    if (!Array.isArray(state.palette)) {
      state.palette = [];
    }
    let changed = false;
    while (state.palette.length <= paletteIndex) {
      state.palette.push({ r: 0, g: 0, b: 0, a: 0 });
      changed = true;
    }
    if (!colorsMatchRgba(state.palette[paletteIndex], rgba)) {
      if (paletteSyncMode === 'structural') {
        return {
          ...command,
          colorMode: 'rgb',
          paletteIsolation: true,
          rgba,
        };
      }
      state.palette[paletteIndex] = rgba;
      changed = true;
    }
    if (changed) {
      syncCurrentPalettePresetFromPalette(state.palette, { syncControl: true });
      renderPalette();
      syncPaletteInputs();
      scheduleSessionPersist({ includeSnapshots: false });
      console.debug('[shared-realtime] palette-index-color-synced', {
        source,
        paletteIndex,
        rgba,
      });
    }
    return {
      ...command,
      paletteIndex,
      rgba,
    };
  }

  function applySharedProjectStrokePixel(layer, canvasDoc, command, x, y) {
    if (!layer || !canvasDoc) {
      return false;
    }
    const width = Math.max(1, Math.round(Number(canvasDoc.width) || 1));
    const height = Math.max(1, Math.round(Number(canvasDoc.height) || 1));
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return false;
    }
    if (isSimulationLayer(layer)) {
      return false;
    }
    const index = y * width + x;
    const base = index * 4;
    let direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
    const tool = typeof command?.tool === 'string' ? command.tool : 'pen';
    const transparentStorageIndex = resolveTransparentStoragePaletteIndex();
    if (tool === 'eraser') {
      if (layer.indices[index] === transparentStorageIndex && (!direct || direct[base + 3] === 0)) {
        return false;
      }
      layer.indices[index] = transparentStorageIndex;
      if (direct) {
        direct[base] = 0;
        direct[base + 1] = 0;
        direct[base + 2] = 0;
        direct[base + 3] = 0;
      }
      return true;
    }
    const rgba = normalizeColorValue(command?.rgba);
    const paletteIsolation = Boolean(command?.paletteIsolation);
    if (command?.colorMode === 'rgb' || paletteIsolation) {
      if (rgba.a <= 0 && transparentStorageIndex >= 0) {
        if (layer.indices[index] === transparentStorageIndex && (!direct || direct[base + 3] === 0)) {
          return false;
        }
        layer.indices[index] = transparentStorageIndex;
        if (direct) {
          direct[base] = 0;
          direct[base + 1] = 0;
          direct[base + 2] = 0;
          direct[base + 3] = 0;
        }
        return true;
      }
      if (!direct) {
        direct = ensureLayerDirect(layer);
      }
      const sameColor = layer.indices[index] === -1
        && direct[base] === rgba.r
        && direct[base + 1] === rgba.g
        && direct[base + 2] === rgba.b
        && direct[base + 3] === rgba.a;
      if (sameColor) {
        return false;
      }
      layer.indices[index] = -1;
      direct[base] = rgba.r;
      direct[base + 1] = rgba.g;
      direct[base + 2] = rgba.b;
      direct[base + 3] = rgba.a;
      return true;
    }
    const paletteIndex = normalizePaletteIndex(command?.paletteIndex, state.activePaletteIndex);
    if (layer.indices[index] === paletteIndex) {
      return false;
    }
    layer.indices[index] = paletteIndex;
    if (direct) {
      direct[base] = 0;
      direct[base + 1] = 0;
      direct[base + 2] = 0;
      direct[base + 3] = 0;
    }
    return true;
  }

  function applySharedProjectBrushPoint(layer, canvasDoc, command, x, y, brushOffsets = null) {
    if (!layer || !canvasDoc) {
      return false;
    }
    const offsets = Array.isArray(brushOffsets) && brushOffsets.length
      ? brushOffsets
      : getBrushOffsets(command?.brushSize || 1, command?.brushShape || BRUSH_SHAPE_SQUARE);
    let changed = false;
    for (let offsetIndex = 0; offsetIndex < offsets.length; offsetIndex += 1) {
      const offset = offsets[offsetIndex];
      const ox = Math.round(Number(x) || 0) + Math.round(Number(offset?.dx) || 0);
      const oy = Math.round(Number(y) || 0) + Math.round(Number(offset?.dy) || 0);
      const mirroredPoints = getMirroredPointSetForState(ox, oy, {
        tool: command?.tool || 'pen',
        includeOriginal: true,
        mirrorState: command?.mirror,
        width: canvasDoc.width,
        height: canvasDoc.height,
      });
      for (let mirrorIndex = 0; mirrorIndex < mirroredPoints.length; mirrorIndex += 1) {
        const mirroredPoint = mirroredPoints[mirrorIndex];
        if (applySharedProjectStrokePixel(layer, canvasDoc, command, mirroredPoint.x, mirroredPoint.y)) {
          changed = true;
        }
      }
    }
    return changed;
  }

  function applySharedProjectStrokeCommand(opRecord, { fromRemote = true } = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const canvasId = typeof payload?.canvasId === 'string' ? payload.canvasId.trim() : '';
    const layerId = typeof payload?.layerId === 'string' ? payload.layerId.trim() : '';
    const frameIndex = Math.max(0, Math.round(Number(payload?.frameIndex) || 0));
    const targetCanvas = getProjectCanvasDocumentById(canvasId) || adoptSingleProjectCanvasId(canvasId);
    if (!targetCanvas || !Array.isArray(targetCanvas.frames) || frameIndex >= targetCanvas.frames.length) {
      return false;
    }
    const frame = targetCanvas.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      return false;
    }
    const resolvedLayer = resolveSharedProjectLayerForPayload(frame, payload, layerId);
    const layer = resolvedLayer.layer;
    if (!layer) {
      return false;
    }
    const points = normalizeSharedProjectStrokePoints(payload?.points);
    if (!points.length) {
      return false;
    }
    let command = {
      ...payload,
      brushShape: normalizeBrushShape(payload?.brushShape, BRUSH_SHAPE_SQUARE),
      brushSize: clamp(Math.round(Number(payload?.brushSize) || 1), 1, 64),
      mirror: normalizeMirrorAxisState(payload?.mirror, targetCanvas.width, targetCanvas.height),
    };
    command = prepareSharedProjectDrawCommandPalette(command, { source: 'stroke-command' });
    const brushOffsets = Array.isArray(payload?.customBrushOffsets) && payload.customBrushOffsets.length
      ? payload.customBrushOffsets.map(offset => ({
        dx: Math.round(Number(offset?.dx) || 0),
        dy: Math.round(Number(offset?.dy) || 0),
      }))
      : getBrushOffsets(command.brushSize, command.brushShape);
    const dirtyRect = {
      x0: Number.POSITIVE_INFINITY,
      y0: Number.POSITIVE_INFINITY,
      x1: Number.NEGATIVE_INFINITY,
      y1: Number.NEGATIVE_INFINITY,
    };
    let changed = false;
    const applyDirtyPoint = (x, y) => {
      if (applySharedProjectStrokePixel(layer, targetCanvas, command, x, y)) {
        changed = true;
        dirtyRect.x0 = Math.min(dirtyRect.x0, x);
        dirtyRect.y0 = Math.min(dirtyRect.y0, y);
        dirtyRect.x1 = Math.max(dirtyRect.x1, x);
        dirtyRect.y1 = Math.max(dirtyRect.y1, y);
      }
    };
    for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
      const current = points[pointIndex];
      const previous = points[Math.max(0, pointIndex - 1)];
      const linePoints = pointIndex === 0
        ? [current]
        : bresenhamLine(previous.x, previous.y, current.x, current.y);
      for (let lineIndex = 0; lineIndex < linePoints.length; lineIndex += 1) {
        const linePoint = linePoints[lineIndex];
        for (let offsetIndex = 0; offsetIndex < brushOffsets.length; offsetIndex += 1) {
          const offset = brushOffsets[offsetIndex];
          const ox = linePoint.x + offset.dx;
          const oy = linePoint.y + offset.dy;
          const mirroredPoints = getMirroredPointSetForState(ox, oy, {
            tool: command.tool,
            includeOriginal: true,
            mirrorState: command.mirror,
            width: targetCanvas.width,
            height: targetCanvas.height,
          });
          for (let mirrorIndex = 0; mirrorIndex < mirroredPoints.length; mirrorIndex += 1) {
            const mirroredPoint = mirroredPoints[mirrorIndex];
            applyDirtyPoint(mirroredPoint.x, mirroredPoint.y);
          }
        }
      }
    }
    if (!changed) {
      return false;
    }
    const pixelCount = Math.max(
      0,
      Math.floor(Number(targetCanvas.width) || 0) * Math.floor(Number(targetCanvas.height) || 0)
    );
    const resolvedCanvasId = targetCanvas?.id || canvasId;
    const snapshotKey = buildSharedProjectLayerSnapshotKey(resolvedCanvasId, frameIndex, resolvedLayer.layerId || layerId);
    const nextSnapshot = captureLayerPatchSnapshot(layer, pixelCount);
    if (snapshotKey && nextSnapshot) {
      sharedProjectLayerSnapshots.set(snapshotKey, nextSnapshot);
    }
    applyIncomingSharedProjectVisualResult(targetCanvas, {
      full: false,
      dirtyRect: changed ? dirtyRect : null,
    });
    markDocumentUnsavedChange();
    noteSharedProjectOperationApplied({ opType: 'draw', fromRemote });
    return true;
  }

  function resolveSharedProjectDrawCommandTarget(payload) {
    const canvasId = typeof payload?.canvasId === 'string' ? payload.canvasId.trim() : '';
    const layerId = typeof payload?.layerId === 'string' ? payload.layerId.trim() : '';
    const frameIndex = Math.max(0, Math.round(Number(payload?.frameIndex) || 0));
    const targetCanvas = getProjectCanvasDocumentById(canvasId) || adoptSingleProjectCanvasId(canvasId);
    if (!targetCanvas || !Array.isArray(targetCanvas.frames) || frameIndex >= targetCanvas.frames.length) {
      logSharedProjectResolveEvent('canvas-resolve-failed', {
        canvasId,
        resolvedCanvasId: targetCanvas?.id || '',
        layerId,
        result: 'skip',
        skipReason: 'resolve-target-missing-canvas-or-frame',
      });
      return null;
    }
    const frame = targetCanvas.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      logSharedProjectResolveEvent('frame-resolve-failed', {
        canvasId,
        resolvedCanvasId: targetCanvas?.id || '',
        layerId,
        result: 'skip',
        skipReason: 'resolve-target-missing-frame-layers',
      });
      return null;
    }
    const resolvedLayer = resolveSharedProjectLayerForPayload(frame, payload, layerId);
    const layer = resolvedLayer.layer;
    if (!layer) {
      logSharedProjectResolveEvent('layer-resolve-failed', {
        canvasId,
        resolvedCanvasId: targetCanvas?.id || '',
        resolvedFrameId: frame?.id || '',
        layerId,
        result: 'skip',
        skipReason: 'resolve-target-missing-layer',
      });
      return null;
    }
    return {
      targetCanvas,
      frame,
      layer,
      canvasId,
      resolvedCanvasId: targetCanvas?.id || canvasId,
      layerId: resolvedLayer.layerId || layerId,
      frameIndex,
    };
  }

  function applySharedProjectShapeCommand(opRecord, { fromRemote = true } = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const target = resolveSharedProjectDrawCommandTarget(payload);
    if (!target) {
      return false;
    }
    let command = {
      ...payload,
      brushShape: normalizeBrushShape(payload?.brushShape, BRUSH_SHAPE_SQUARE),
      brushSize: clamp(Math.round(Number(payload?.brushSize) || 1), 1, 64),
      mirror: normalizeMirrorAxisState(payload?.mirror, target.targetCanvas.width, target.targetCanvas.height),
    };
    command = prepareSharedProjectDrawCommandPalette(command, { source: 'shape-command' });
    const brushOffsets = Array.isArray(payload?.customBrushOffsets) && payload.customBrushOffsets.length
      ? payload.customBrushOffsets.map(offset => ({
        dx: Math.round(Number(offset?.dx) || 0),
        dy: Math.round(Number(offset?.dy) || 0),
      }))
      : getBrushOffsets(command.brushSize, command.brushShape);
    const start = payload?.start;
    const end = payload?.end;
    if (!start || !end) {
      return false;
    }
    const dirtyRect = {
      x0: Number.POSITIVE_INFINITY,
      y0: Number.POSITIVE_INFINITY,
      x1: Number.NEGATIVE_INFINITY,
      y1: Number.NEGATIVE_INFINITY,
    };
    let changed = false;
    const plotPoint = (x, y) => {
      if (applySharedProjectBrushPoint(target.layer, target.targetCanvas, command, x, y, brushOffsets)) {
        changed = true;
        const brushRadius = Math.max(1, Math.ceil(command.brushSize || 1));
        dirtyRect.x0 = Math.min(dirtyRect.x0, x - brushRadius);
        dirtyRect.y0 = Math.min(dirtyRect.y0, y - brushRadius);
        dirtyRect.x1 = Math.max(dirtyRect.x1, x + brushRadius);
        dirtyRect.y1 = Math.max(dirtyRect.y1, y + brushRadius);
      }
    };
    const normalizedTool = typeof command.tool === 'string' ? command.tool : '';
    if (normalizedTool === 'line') {
      const points = bresenhamLine(start.x, start.y, end.x, end.y);
      points.forEach(point => plotPoint(point.x, point.y));
    } else if (normalizedTool === 'rect' || normalizedTool === 'rectFill') {
      const x0 = Math.min(start.x, end.x);
      const x1 = Math.max(start.x, end.x);
      const y0 = Math.min(start.y, end.y);
      const y1 = Math.max(start.y, end.y);
      if (command.filled) {
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            plotPoint(x, y);
          }
        }
      } else {
        for (let x = x0; x <= x1; x += 1) {
          plotPoint(x, y0);
          plotPoint(x, y1);
        }
        for (let y = y0; y <= y1; y += 1) {
          plotPoint(x0, y);
          plotPoint(x1, y);
        }
      }
    } else if (normalizedTool === 'ellipse' || normalizedTool === 'ellipseFill') {
      drawEllipsePixels(start.x, start.y, end.x, end.y, Boolean(command.filled), plotPoint);
    } else {
      return false;
    }
    if (!changed) {
      return false;
    }
    const pixelCount = Math.max(
      0,
      Math.floor(Number(target.targetCanvas.width) || 0) * Math.floor(Number(target.targetCanvas.height) || 0)
    );
    const snapshotKey = buildSharedProjectLayerSnapshotKey(target.resolvedCanvasId, target.frameIndex, target.layerId);
    const nextSnapshot = captureLayerPatchSnapshot(target.layer, pixelCount);
    if (snapshotKey && nextSnapshot) {
      sharedProjectLayerSnapshots.set(snapshotKey, nextSnapshot);
    }
    applyIncomingSharedProjectVisualResult(target.targetCanvas, {
      full: false,
      dirtyRect: changed ? dirtyRect : null,
    });
    markDocumentUnsavedChange();
    noteSharedProjectOperationApplied({ opType: 'draw', fromRemote });
    return true;
  }

  function applySharedProjectFillCommand(opRecord, { fromRemote = true } = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    if (payload?.patch && typeof payload.patch === 'object' && Math.max(0, Math.floor(Number(payload?.pixelCount) || 0)) > 0) {
      return applyLayerPatch(opRecord, { fromRemote });
    }
    const target = resolveSharedProjectDrawCommandTarget(payload);
    if (!target || !payload?.point) {
      return false;
    }
    let command = {
      ...payload,
      mirror: normalizeMirrorAxisState(payload?.mirror, target.targetCanvas.width, target.targetCanvas.height),
      fillMode: normalizeSelectSameMode(payload?.fillMode, SELECT_SAME_MODE_CONNECTED),
      fillStyle: normalizeFillStyle(payload?.fillStyle, FILL_STYLE_SOLID),
    };
    command = prepareSharedProjectDrawCommandPalette(command, { source: 'fill-command' });
    const width = Math.max(1, Number(target.targetCanvas.width) || 1);
    const height = Math.max(1, Number(target.targetCanvas.height) || 1);
    const x = clamp(Math.round(Number(payload.point.x) || 0), 0, width - 1);
    const y = clamp(Math.round(Number(payload.point.y) || 0), 0, height - 1);
    const end = payload?.end
      ? {
        x: clamp(Math.round(Number(payload.end.x) || x), 0, width - 1),
        y: clamp(Math.round(Number(payload.end.y) || y), 0, height - 1),
      }
      : { x, y };
    const gradientFill = isGradientFillStyle(command.fillStyle);
    const indices = target.layer.indices instanceof Int16Array ? target.layer.indices : null;
    const direct = target.layer.direct instanceof Uint8ClampedArray ? target.layer.direct : null;
    const paletteIndex = command.colorMode === 'palette'
      ? normalizePaletteIndex(command.paletteIndex, state.activePaletteIndex)
      : -1;
    const drawRgbColor = command.colorMode === 'rgb' || command.paletteIsolation
      ? normalizeColorValue(command.rgba)
      : null;
    const startIdx = y * width + x;
    const targetIndex = indices ? indices[startIdx] : -1;
    const startBase = startIdx * 4;
    const targetR = targetIndex < 0 ? (direct ? direct[startBase] : 0) : 0;
    const targetG = targetIndex < 0 ? (direct ? direct[startBase + 1] : 0) : 0;
    const targetB = targetIndex < 0 ? (direct ? direct[startBase + 2] : 0) : 0;
    const targetA = targetIndex < 0 ? (direct ? direct[startBase + 3] : 0) : 0;
    if (!gradientFill && command.colorMode === 'palette' && targetIndex >= 0 && targetIndex === paletteIndex) {
      return false;
    }
    if (!gradientFill && drawRgbColor) {
      const sourceColor = targetIndex >= 0
        ? normalizeColorValue(state.palette[targetIndex] || { r: 0, g: 0, b: 0, a: 0 })
        : { r: targetR, g: targetG, b: targetB, a: targetA };
      if (colorsMatchRgba(sourceColor, drawRgbColor)) {
        return false;
      }
    }
    const matchesTarget = (idx) => {
      const currentIndex = indices ? indices[idx] : -1;
      if (targetIndex >= 0) {
        return currentIndex === targetIndex;
      }
      if (currentIndex >= 0) {
        return false;
      }
      const base = idx * 4;
      const r = direct ? direct[base] : 0;
      const g = direct ? direct[base + 1] : 0;
      const b = direct ? direct[base + 2] : 0;
      const a = direct ? direct[base + 3] : 0;
      return r === targetR && g === targetG && b === targetB && a === targetA;
    };
    const dirtyRect = {
      x0: Number.POSITIVE_INFINITY,
      y0: Number.POSITIVE_INFINITY,
      x1: Number.NEGATIVE_INFINITY,
      y1: Number.NEGATIVE_INFINITY,
    };
    let changed = false;
    const gradientContext = gradientFill
      ? {
        fillStyle: command.fillStyle,
        start: { x, y },
        end,
        colors: {
          primaryPaletteIndex: paletteIndex >= 0 ? paletteIndex : normalizePaletteIndex(command.paletteIndex, state.activePaletteIndex),
          secondaryPaletteIndex: normalizePaletteIndex(command.secondaryPaletteIndex, command.paletteIndex),
          primaryColor: normalizeColorValue(command.rgba),
          secondaryColor: normalizeColorValue(
            command.secondaryRgba
            || state.palette[normalizePaletteIndex(command.secondaryPaletteIndex, command.paletteIndex)]
            || command.rgba
          ),
        },
        paletteGradient: command.colorMode === 'palette' && !command.paletteIsolation,
      }
      : null;
    const applyPoint = (px, py) => {
      let pointCommand = command;
      if (gradientContext) {
        const pixel = resolveFillGradientPixel(px, py, gradientContext);
        const canUsePaletteIndex = command.colorMode === 'palette'
          && !command.paletteIsolation
          && Number.isFinite(pixel.paletteIndex)
          && pixel.paletteIndex >= 0
          && pixel.paletteIndex < MAX_IMPORTED_PALETTE_COLORS;
        pointCommand = {
          ...command,
          colorMode: canUsePaletteIndex ? 'palette' : 'rgb',
          paletteIsolation: canUsePaletteIndex ? Boolean(command.paletteIsolation) : true,
          paletteIndex: canUsePaletteIndex ? pixel.paletteIndex : command.paletteIndex,
          rgba: normalizeColorValue(pixel.color),
        };
      }
      if (applySharedProjectBrushPoint(target.layer, target.targetCanvas, pointCommand, px, py, [{ dx: 0, dy: 0 }])) {
        changed = true;
        dirtyRect.x0 = Math.min(dirtyRect.x0, px);
        dirtyRect.y0 = Math.min(dirtyRect.y0, py);
        dirtyRect.x1 = Math.max(dirtyRect.x1, px);
        dirtyRect.y1 = Math.max(dirtyRect.y1, py);
      }
    };
    if (command.fillMode === SELECT_SAME_MODE_GLOBAL) {
      for (let py = 0; py < height; py += 1) {
        const rowOffset = py * width;
        for (let px = 0; px < width; px += 1) {
          const idx = rowOffset + px;
          if (!matchesTarget(idx)) continue;
          applyPoint(px, py);
        }
      }
    } else {
      const visited = new Uint8Array(width * height);
      const stack = [x, y];
      while (stack.length > 1) {
        const py = stack.pop();
        const px = stack.pop();
        if (px < 0 || py < 0 || px >= width || py >= height) continue;
        const idx = py * width + px;
        if (visited[idx]) continue;
        visited[idx] = 1;
        if (!matchesTarget(idx)) continue;
        applyPoint(px, py);
        stack.push(px + 1, py, px - 1, py, px, py + 1, px, py - 1);
      }
    }
    if (!changed) {
      return false;
    }
    const pixelCount = Math.max(0, Math.floor(Number(target.targetCanvas.width) || 0) * Math.floor(Number(target.targetCanvas.height) || 0));
    const snapshotKey = buildSharedProjectLayerSnapshotKey(target.resolvedCanvasId, target.frameIndex, target.layerId);
    const nextSnapshot = captureLayerPatchSnapshot(target.layer, pixelCount);
    if (snapshotKey && nextSnapshot) {
      sharedProjectLayerSnapshots.set(snapshotKey, nextSnapshot);
    }
    applyIncomingSharedProjectVisualResult(target.targetCanvas, {
      full: false,
      dirtyRect: changed ? dirtyRect : null,
    });
    markDocumentUnsavedChange();
    noteSharedProjectOperationApplied({ opType: 'draw', fromRemote });
    return true;
  }

  function applySharedProjectCurveCommand(opRecord, { fromRemote = true } = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const target = resolveSharedProjectDrawCommandTarget(payload);
    if (!target || !payload?.start || !payload?.control1 || !payload?.control2 || !payload?.end) {
      return false;
    }
    let command = {
      ...payload,
      brushShape: normalizeBrushShape(payload?.brushShape, BRUSH_SHAPE_SQUARE),
      brushSize: clamp(Math.round(Number(payload?.brushSize) || 1), 1, 64),
      mirror: normalizeMirrorAxisState(payload?.mirror, target.targetCanvas.width, target.targetCanvas.height),
    };
    command = prepareSharedProjectDrawCommandPalette(command, { source: 'curve-command' });
    const brushOffsets = Array.isArray(payload?.customBrushOffsets) && payload.customBrushOffsets.length
      ? payload.customBrushOffsets.map(offset => ({
        dx: Math.round(Number(offset?.dx) || 0),
        dy: Math.round(Number(offset?.dy) || 0),
      }))
      : getBrushOffsets(command.brushSize, command.brushShape);
    const start = { x: Math.round(Number(payload.start.x) || 0), y: Math.round(Number(payload.start.y) || 0) };
    const control1 = { x: Math.round(Number(payload.control1.x) || 0), y: Math.round(Number(payload.control1.y) || 0) };
    const control2 = { x: Math.round(Number(payload.control2.x) || 0), y: Math.round(Number(payload.control2.y) || 0) };
    const end = { x: Math.round(Number(payload.end.x) || 0), y: Math.round(Number(payload.end.y) || 0) };
    const dirtyRect = {
      x0: Number.POSITIVE_INFINITY,
      y0: Number.POSITIVE_INFINITY,
      x1: Number.NEGATIVE_INFINITY,
      y1: Number.NEGATIVE_INFINITY,
    };
    let changed = false;
    const points = sampleCubicBezierPoints(start, control1, control2, end);
    forEachCurveStrokePixel(points, (x, y) => {
      if (applySharedProjectBrushPoint(target.layer, target.targetCanvas, command, x, y, brushOffsets)) {
        changed = true;
        const brushRadius = Math.max(1, Math.ceil(command.brushSize || 1));
        dirtyRect.x0 = Math.min(dirtyRect.x0, x - brushRadius);
        dirtyRect.y0 = Math.min(dirtyRect.y0, y - brushRadius);
        dirtyRect.x1 = Math.max(dirtyRect.x1, x + brushRadius);
        dirtyRect.y1 = Math.max(dirtyRect.y1, y + brushRadius);
      }
    });
    if (!changed) {
      return false;
    }
    const pixelCount = Math.max(
      0,
      Math.floor(Number(target.targetCanvas.width) || 0) * Math.floor(Number(target.targetCanvas.height) || 0)
    );
    const snapshotKey = buildSharedProjectLayerSnapshotKey(target.resolvedCanvasId, target.frameIndex, target.layerId);
    const nextSnapshot = captureLayerPatchSnapshot(target.layer, pixelCount);
    if (snapshotKey && nextSnapshot) {
      sharedProjectLayerSnapshots.set(snapshotKey, nextSnapshot);
    }
    applyIncomingSharedProjectVisualResult(target.targetCanvas, {
      full: false,
      dirtyRect,
    });
    markDocumentUnsavedChange();
    noteSharedProjectOperationApplied({ opType: 'draw', fromRemote });
    return true;
  }

  function applySharedProjectRegionCommand(opRecord, { fromRemote = true } = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    if (payload?.patch && typeof payload.patch === 'object' && Math.max(0, Math.floor(Number(payload?.pixelCount) || 0)) > 0) {
      return applyLayerPatch(opRecord, { fromRemote });
    }
    const target = resolveSharedProjectDrawCommandTarget(payload);
    const bounds = payload?.bounds && typeof payload.bounds === 'object' ? payload.bounds : null;
    const width = Math.max(1, Math.round(Number(payload?.width) || 0));
    const height = Math.max(1, Math.round(Number(payload?.height) || 0));
    const indices = Array.isArray(payload?.indices) ? payload.indices : null;
    const direct = Array.isArray(payload?.direct) ? payload.direct : null;
    if (!target || !bounds || !indices || !direct || indices.length < (width * height) || direct.length < (width * height * 4)) {
      return false;
    }
    syncSharedProjectPaletteFromPayload(payload?.palette, { source: 'region-command' });
    const x0 = Math.round(Number(bounds.x0) || 0);
    const y0 = Math.round(Number(bounds.y0) || 0);
    let targetDirect = target.layer.direct instanceof Uint8ClampedArray ? target.layer.direct : null;
    let changed = false;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const canvasX = x0 + x;
        const canvasY = y0 + y;
        if (
          canvasX < 0
          || canvasY < 0
          || canvasX >= target.targetCanvas.width
          || canvasY >= target.targetCanvas.height
        ) {
          continue;
        }
        const sourceIndex = (y * width) + x;
        const sourceBase = sourceIndex * 4;
        const canvasIndex = (canvasY * target.targetCanvas.width) + canvasX;
        const canvasBase = canvasIndex * 4;
        const nextPaletteIndex = Math.round(Number(indices[sourceIndex]) || -1);
        const nextR = clamp(Math.round(Number(direct[sourceBase]) || 0), 0, 255);
        const nextG = clamp(Math.round(Number(direct[sourceBase + 1]) || 0), 0, 255);
        const nextB = clamp(Math.round(Number(direct[sourceBase + 2]) || 0), 0, 255);
        const nextA = clamp(Math.round(Number(direct[sourceBase + 3]) || 0), 0, 255);
        const previousPaletteIndex = Math.round(Number(target.layer.indices[canvasIndex]) || -1);
        const previousDirect = target.layer.direct instanceof Uint8ClampedArray ? target.layer.direct : null;
        const prevR = previousDirect ? previousDirect[canvasBase] : 0;
        const prevG = previousDirect ? previousDirect[canvasBase + 1] : 0;
        const prevB = previousDirect ? previousDirect[canvasBase + 2] : 0;
        const prevA = previousDirect ? previousDirect[canvasBase + 3] : 0;
        if (
          previousPaletteIndex === nextPaletteIndex
          && prevR === nextR
          && prevG === nextG
          && prevB === nextB
          && prevA === nextA
        ) {
          continue;
        }
        target.layer.indices[canvasIndex] = nextPaletteIndex;
        if (!targetDirect) {
          targetDirect = ensureLayerDirect(target.layer);
        }
        targetDirect[canvasBase] = nextR;
        targetDirect[canvasBase + 1] = nextG;
        targetDirect[canvasBase + 2] = nextB;
        targetDirect[canvasBase + 3] = nextA;
        changed = true;
      }
    }
    if (!changed) {
      return false;
    }
    const pixelCount = Math.max(
      0,
      Math.floor(Number(target.targetCanvas.width) || 0) * Math.floor(Number(target.targetCanvas.height) || 0)
    );
    const snapshotKey = buildSharedProjectLayerSnapshotKey(target.resolvedCanvasId, target.frameIndex, target.layerId);
    const nextSnapshot = captureLayerPatchSnapshot(target.layer, pixelCount);
    if (snapshotKey && nextSnapshot) {
      sharedProjectLayerSnapshots.set(snapshotKey, nextSnapshot);
    }
    applyIncomingSharedProjectVisualResult(target.targetCanvas, {
      full: false,
      dirtyRect: {
        x0,
        y0,
        x1: x0 + width - 1,
        y1: y0 + height - 1,
      },
    });
    markDocumentUnsavedChange();
    noteSharedProjectOperationApplied({ opType: 'draw', fromRemote });
    return true;
  }

  function isSharedProjectRemoteOpFromCurrentSession(opRecord) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const sessionId = typeof (opRecord?.session_id ?? payload?.sessionId ?? payload?.session_id) === 'string'
      ? String(opRecord?.session_id ?? payload?.sessionId ?? payload?.session_id).trim()
      : '';
    return Boolean(sessionId) && sessionId === sharedProjectSessionId;
  }

  function applyLayerPatch(opRecord, { fromRemote = false } = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const canvasId = typeof payload?.canvasId === 'string' ? payload.canvasId.trim() : '';
    const layerId = typeof payload?.layerId === 'string' ? payload.layerId.trim() : '';
    const frameIndex = Math.max(0, Math.round(Number(payload?.frameIndex) || 0));
    const pixelCount = Math.max(0, Math.floor(Number(payload?.pixelCount) || 0));
    const patch = payload?.patch && typeof payload.patch === 'object' ? payload.patch : null;
    if (!canvasId || !layerId || !pixelCount || !patch) {
      return false;
    }
    syncSharedProjectPaletteFromPayload(payload?.palette, { source: 'layer-patch' });
    const targetCanvas = getProjectCanvasDocumentById(canvasId) || adoptSingleProjectCanvasId(canvasId);
    if (!targetCanvas || !Array.isArray(targetCanvas.frames) || frameIndex >= targetCanvas.frames.length) {
      return false;
    }
    const frame = targetCanvas.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      return false;
    }
    const resolvedLayer = resolveSharedProjectLayerForPayload(frame, payload, layerId);
    const layer = resolvedLayer.layer;
    if (!layer) {
      return false;
    }
    const applyResult = applyLayerPatchPayloadToLayer(layer, patch, pixelCount, {
      width: targetCanvas.width,
      height: targetCanvas.height,
    });
    if (!applyResult) {
      return false;
    }
    if (fromRemote) {
      resetLocalHistoryForSharedCollaborativeRemoteChange();
    }
    const resolvedCanvasId = targetCanvas?.id || canvasId;
    const snapshotKey = buildSharedProjectLayerSnapshotKey(resolvedCanvasId, frameIndex, resolvedLayer.layerId || layerId);
    const nextSnapshot = captureLayerPatchSnapshot(layer, pixelCount);
    if (snapshotKey && nextSnapshot) {
      sharedProjectLayerSnapshots.set(snapshotKey, nextSnapshot);
    }
    applyIncomingSharedProjectVisualResult(targetCanvas, applyResult);
    noteSharedProjectOperationApplied({ opType: 'draw', fromRemote });
    return true;
  }

  function applySharedProjectPaletteOp(opRecord, { fromRemote = true, provisional = false } = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const palette = Array.isArray(payload?.palette)
      ? payload.palette.map(color => normalizeColorValue(color))
      : null;
    if (!palette || !palette.length) {
      return false;
    }
    const historyLabel = getSharedProjectPaletteOpHistoryLabel(opRecord, payload);
    const previousPalette = Array.isArray(state.palette)
      ? state.palette.map(color => normalizeColorValue(color))
      : [];
    const shouldRemapExact = historyLabel === 'paletteRemove' || historyLabel === 'paletteReorder';
    const shouldRemapApprox = historyLabel === 'paletteApplyPreset';
    const exactMapping = shouldRemapExact
      ? buildSharedProjectExactPaletteIndexMapping(previousPalette, palette)
      : null;
    state.palette = palette;
    let remapResult = null;
    if (exactMapping) {
      remapPaletteIndices(exactMapping);
      remapResult = {
        mode: 'exact',
        mappedCount: exactMapping.filter(index => index >= 0).length,
        removedCount: exactMapping.filter(index => index < 0).length,
      };
    } else if (shouldRemapApprox && previousPalette.length) {
      remapResult = {
        mode: 'approx',
        ...remapDocumentColorsToPaletteApprox(state.palette, previousPalette, state.colorMode),
      };
    }
    state.activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, 0);
    state.secondaryPaletteIndex = normalizePaletteIndex(state.secondaryPaletteIndex, state.activePaletteIndex);
    const fallbackActiveColor = state.palette[state.activePaletteIndex] || state.palette[0] || state.activeRgb;
    state.activeRgb = normalizeColorValue(fallbackActiveColor || { r: 255, g: 255, b: 255, a: 255 });
    syncCurrentPalettePresetFromPalette(state.palette, { syncControl: true });
    renderPalette();
    syncPaletteInputs();
    renderAllProjectCanvasSurfaces();
    requestOverlayRender();
    scheduleSessionPersist({ includeSnapshots: false });
    if (fromRemote) {
      resetLocalHistoryForSharedCollaborativeRemoteChange();
    }
    noteSharedProjectOperationApplied({ opType: 'palette', fromRemote });
    console.debug('[shared-realtime] palette-op-synced', {
      historyLabel,
      paletteSize: state.palette.length,
      remapResult,
      fromRemote,
      provisional,
    });
    return true;
  }


  function applyIncomingSharedProjectVisualResult(targetCanvas, applyResult) {
    if (sharedProjectReplayRenderBatchDepth > 0) {
      if (targetCanvas?.id !== (getActiveProjectCanvasDocument()?.id || '') || !applyResult?.dirtyRect || applyResult.full) {
        sharedProjectReplayRenderNeedsFull = true;
      } else if (!sharedProjectReplayRenderNeedsFull && applyResult?.dirtyRect) {
        if (!sharedProjectReplayRenderDirtyRect) {
          sharedProjectReplayRenderDirtyRect = { ...applyResult.dirtyRect };
        } else {
          sharedProjectReplayRenderDirtyRect.x0 = Math.min(sharedProjectReplayRenderDirtyRect.x0, applyResult.dirtyRect.x0);
          sharedProjectReplayRenderDirtyRect.y0 = Math.min(sharedProjectReplayRenderDirtyRect.y0, applyResult.dirtyRect.y0);
          sharedProjectReplayRenderDirtyRect.x1 = Math.max(sharedProjectReplayRenderDirtyRect.x1, applyResult.dirtyRect.x1);
          sharedProjectReplayRenderDirtyRect.y1 = Math.max(sharedProjectReplayRenderDirtyRect.y1, applyResult.dirtyRect.y1);
        }
      }
      return;
    }
    if (targetCanvas?.id !== (getActiveProjectCanvasDocument()?.id || '')) {
      markCanvasDirty();
    } else if (!applyResult?.dirtyRect || applyResult.full) {
      markCanvasDirty();
    } else {
      markDirtyRect(
        applyResult.dirtyRect.x0,
        applyResult.dirtyRect.y0,
        applyResult.dirtyRect.x1,
        applyResult.dirtyRect.y1
      );
    }
    invalidateFillPreviewCache();
    invalidateOnionSkinCache();
    clearPlaybackFrameCache();
    requestRender();
    requestOverlayRender();
  }

  function rememberSharedProjectRemoteApplyFailureKey(failureKey = '') {
    const normalizedKey = typeof failureKey === 'string' ? failureKey.trim() : '';
    if (!normalizedKey || sharedProjectRemoteApplyFailureKeys.has(normalizedKey)) {
      return false;
    }
    sharedProjectRemoteApplyFailureKeys.add(normalizedKey);
    if (sharedProjectRemoteApplyFailureKeys.size > SHARED_PROJECT_REMOTE_APPLY_FAILURE_KEY_LIMIT) {
      const overflow = sharedProjectRemoteApplyFailureKeys.size - SHARED_PROJECT_REMOTE_APPLY_FAILURE_KEY_LIMIT;
      let removed = 0;
      for (const staleKey of sharedProjectRemoteApplyFailureKeys) {
        if (removed >= overflow) {
          break;
        }
        sharedProjectRemoteApplyFailureKeys.delete(staleKey);
        removed += 1;
      }
    }
    return true;
  }

  function logRemoteSharedDrawVisibility(opRecord, diagnostics = {}) {
    const payload = extractSharedProjectOpPayload(opRecord);
    const resolvedCanvasId = diagnostics.resolvedCanvasId || diagnostics.canvasId || (typeof payload?.canvasId === 'string' ? payload.canvasId.trim() : '');
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    const frameIndex = Math.max(0, Math.round(Number(payload?.frameIndex) || 0));
    const activeFrameIndex = Math.max(0, Math.round(Number(state.activeFrame) || 0));
    const targetCanvas = resolvedCanvasId ? getProjectCanvasDocumentById(resolvedCanvasId) : null;
    const frame = Array.isArray(targetCanvas?.frames) ? targetCanvas.frames[frameIndex] : null;
    const layerId = typeof payload?.layerId === 'string' ? payload.layerId.trim() : '';
    const layer = Array.isArray(frame?.layers) ? frame.layers.find(entry => entry?.id === layerId) || null : null;
    const targetIsActiveCanvas = Boolean(resolvedCanvasId) && resolvedCanvasId === activeCanvasId;
    const targetIsActiveFrame = targetIsActiveCanvas && frameIndex === activeFrameIndex;
    const layerVisible = layer?.visible !== false;
    const layerOpacity = normalizeLayerOpacity(layer?.opacity);
    const shouldBeVisible = targetIsActiveCanvas && targetIsActiveFrame && Boolean(layer) && layerVisible && layerOpacity > 0;
    console.info('[shared-sync]', {
      event: 'remote-draw-visibility-check',
      opId: normalizeSharedProjectOpId(opRecord),
      resolvedCanvasId,
      activeCanvasId,
      targetIsActiveCanvas,
      frameIndex,
      activeFrameIndex,
      targetIsActiveFrame,
      layerId,
      layerExists: Boolean(layer),
      layerVisible,
      layerOpacity,
      shouldBeVisible,
    });
    console.info('[shared-sync]', {
      event: shouldBeVisible ? 'remote-draw-target-visible' : 'remote-draw-target-not-visible',
      opId: normalizeSharedProjectOpId(opRecord),
      revision: getSharedProjectOpSeq(opRecord),
      resolvedCanvasId,
      frameIndex,
      activeFrameIndex,
      layerId,
      layerVisible,
      targetIsActiveCanvas,
      targetIsVisibleFrame: targetIsActiveFrame,
      renderScheduled: true,
    });
  }


  function applyIncomingSharedProjectDrawOp(opRecord, { fromRemote = true, provisional = false } = {}) {
    // Draw remote apply is latency-first. Refresh is handled by gap recovery callers.
    const diagnostics = inspectIncomingSharedProjectDrawOp(opRecord);
    if (!diagnostics.ok) {
      const opId = getSharedProjectOpId(opRecord);
      const seq = getSharedProjectOpSeq(opRecord);
      const failureKey = provisional
        ? `provisional:${diagnostics.canvasId || ''}:${diagnostics.frameIndex}:${diagnostics.layerId || ''}:${diagnostics.reason}`
        : `${opId || 'no-op-id'}:${seq}:${diagnostics.reason}`;
      console.warn(`[shared-realtime] draw-apply-skipped:${diagnostics.reason}`, {
        provisional,
        fromRemote,
        opId,
        seq,
        kind: typeof opRecord?.kind === 'string' ? opRecord.kind : '',
        reason: diagnostics.reason,
        canvasId: diagnostics.canvasId || '',
        layerId: diagnostics.layerId || '',
        frameIndex: diagnostics.frameIndex,
        structureRevision: diagnostics.structureRevision,
        activeStructureRevision: diagnostics.activeStructureRevision,
      });
      logSharedProjectDrawLifecycle('remote-confirmed-op-skipped', opRecord, {
        mode: provisional ? 'local-provisional' : (isSharedProjectRemoteOpFromCurrentSession(opRecord) ? 'self-confirmed-ack' : 'remote-confirmed'),
        diagnostics,
        skipReason: diagnostics.reason || 'invalid-payload',
      });
      if (
        fromRemote
        && !provisional
        && seq > sharedProjectLastAppliedSeq
        && shouldRefreshForSharedProjectApplySkip(diagnostics.reason)
      ) {
        rememberPendingSharedProjectRemoteOp(seq, opRecord, `held-${diagnostics.reason}`);
        console.warn('[shared-sync]', {
          event: 'draw-op-held-for-structure-sync',
          reason: diagnostics.reason,
          opId,
          revision: seq,
          canvasId: diagnostics.canvasId || '',
          frameIndex: diagnostics.frameIndex,
          layerId: diagnostics.layerId || '',
          structureRevision: diagnostics.structureRevision,
          activeStructureRevision: diagnostics.activeStructureRevision,
        });
        createSharedProjectExactHashForOp(opRecord, { reason: `apply-skip-${diagnostics.reason}` });
      }
      if (
        fromRemote
        && provisional
        && shouldRefreshForSharedProjectApplySkip(diagnostics.reason)
      ) {
        if (opId) {
          sharedProjectPendingProvisionalOps.set(opId, {
            opRecord,
            queuedAt: Date.now(),
          });
        }
        if (rememberSharedProjectRemoteApplyFailureKey(failureKey)) {
          if (diagnostics.reason === 'structure-revision-mismatch') {
            scheduleSharedProjectStructureMismatchRecovery();
            triggerImmediateSharedProjectRecovery('structure-revision-mismatch').then(recovered => {
              if (!recovered) {
                queueSharedProjectRefresh({
                  immediate: true,
                  reason: 'structure-revision-mismatch',
                  force: true,
                });
              }
            }).catch(() => {
              queueSharedProjectRefresh({
                immediate: true,
                reason: 'structure-revision-mismatch',
                force: true,
              });
            });
          } else {
            const recoveryReason = `provisional-apply-skip-${diagnostics.reason}`;
            triggerImmediateSharedProjectRecovery(recoveryReason).then(recovered => {
              if (!recovered) {
                queueSharedProjectRefresh({
                  immediate: true,
                  reason: recoveryReason,
                  force: true,
                });
              }
            }).catch(() => {
              queueSharedProjectRefresh({
                immediate: true,
                reason: recoveryReason,
                force: true,
              });
            });
          }
        }
      }
      if (
        fromRemote
        && !provisional
        && shouldRefreshForSharedProjectApplySkip(diagnostics.reason)
        && rememberSharedProjectRemoteApplyFailureKey(failureKey)
      ) {
        const recoveryReason = `apply-skip-${diagnostics.reason}`;
        runSharedProjectConvergenceResync(recoveryReason).catch(() => {
          queueSharedProjectRefresh({ immediate: true, reason: recoveryReason, force: true });
        });
      }
      return false;
    }
    const payload = extractSharedProjectOpPayload(opRecord);
    const applied = payload?.command === 'stroke' || opRecord?.kind === 'stroke-command'
      ? applySharedProjectStrokeCommand(opRecord, { fromRemote })
      : (payload?.command === 'shape' || opRecord?.kind === 'shape-command'
        ? applySharedProjectShapeCommand(opRecord, { fromRemote })
        : (payload?.command === 'fill' || opRecord?.kind === 'fill-command'
          ? applySharedProjectFillCommand(opRecord, { fromRemote })
          : (payload?.command === 'curve' || opRecord?.kind === 'curve-command'
            ? applySharedProjectCurveCommand(opRecord, { fromRemote })
            : (payload?.command === 'region' || opRecord?.kind === 'region-command'
            ? applySharedProjectRegionCommand(opRecord, { fromRemote })
            : applyLayerPatch(opRecord, { fromRemote })))));
    if (!applied) {
      const opId = getSharedProjectOpId(opRecord);
      const committedAfterProvisional = (
        fromRemote
        && !provisional
        && opId
        && sharedProjectAppliedProvisionalOpIds.has(opId)
      );
      if (committedAfterProvisional) {
        sharedProjectAppliedProvisionalOpIds.delete(opId);
        console.debug('[shared-realtime] draw-commit-converged-from-provisional', {
          opId,
          seq: getSharedProjectOpSeq(opRecord),
          kind: typeof opRecord?.kind === 'string' ? opRecord.kind : '',
          canvasId: diagnostics.canvasId || '',
          layerId: diagnostics.layerId || '',
          frameIndex: diagnostics.frameIndex,
          structureRevision: diagnostics.structureRevision,
          activeStructureRevision: diagnostics.activeStructureRevision,
        });
        return true;
      }
      if (fromRemote && !provisional && diagnostics.ok) {
        console.info('[shared-sync]', {
          event: 'remote-confirmed-op-noop',
          opId,
          revision: getSharedProjectOpSeq(opRecord),
          kind: typeof opRecord?.kind === 'string' ? opRecord.kind : '',
          canvasId: diagnostics.canvasId || '',
          resolvedCanvasId: diagnostics.resolvedCanvasId || '',
          layerId: diagnostics.layerId || '',
          frameIndex: diagnostics.frameIndex,
          reason: 'already-applied-or-no-pixel-change',
        });
        logSharedProjectDrawLifecycle('remote-confirmed-op-noop', opRecord, {
          mode: isSharedProjectRemoteOpFromCurrentSession(opRecord) ? 'self-confirmed-ack' : 'remote-confirmed',
          diagnostics,
          skipReason: 'already-applied-or-no-pixel-change',
        });
        return true;
      }
      console.debug('[shared-realtime] draw-apply-failed', {
        provisional,
        fromRemote,
        opId,
        seq: getSharedProjectOpSeq(opRecord),
        kind: typeof opRecord?.kind === 'string' ? opRecord.kind : '',
        canvasId: diagnostics.canvasId || '',
        layerId: diagnostics.layerId || '',
        frameIndex: diagnostics.frameIndex,
        reason: diagnostics.reason || '',
        structureRevision: diagnostics.structureRevision,
        activeStructureRevision: diagnostics.activeStructureRevision,
      });
      logSharedProjectDrawLifecycle('remote-confirmed-op-skipped', opRecord, {
        mode: provisional ? 'local-provisional' : (isSharedProjectRemoteOpFromCurrentSession(opRecord) ? 'self-confirmed-ack' : 'remote-confirmed'),
        diagnostics,
        skipReason: diagnostics.reason || 'apply-returned-false',
      });
      return false;
    }
    console.debug('[shared-realtime] draw-applied', {
      provisional,
      fromRemote,
      opId: getSharedProjectOpId(opRecord),
      seq: getSharedProjectOpSeq(opRecord),
      kind: typeof opRecord?.kind === 'string' ? opRecord.kind : '',
      canvasId: diagnostics.canvasId || '',
      layerId: diagnostics.layerId || '',
      frameIndex: diagnostics.frameIndex,
    });
    if (!fromRemote && provisional) {
      logSharedProjectDrawLifecycle('local-provisional-apply-done', opRecord, {
        mode: 'local-provisional',
        diagnostics,
      });
    }
    if (fromRemote && !provisional) {
      console.info('[shared-sync]', {
        event: 'remote-draw-render-invalidated',
        opId: getSharedProjectOpId(opRecord),
        revision: getSharedProjectOpSeq(opRecord),
        resolvedCanvasId: diagnostics.resolvedCanvasId || diagnostics.canvasId || '',
        frameIndex: diagnostics.frameIndex,
        layerId: diagnostics.resolvedLayerId || diagnostics.layerId || '',
      });
      console.info('[shared-sync]', {
        event: 'remote-draw-render-scheduled',
        opId: getSharedProjectOpId(opRecord),
        revision: getSharedProjectOpSeq(opRecord),
        resolvedCanvasId: diagnostics.resolvedCanvasId || diagnostics.canvasId || '',
        frameIndex: diagnostics.frameIndex,
        activeFrameIndex: Math.max(0, Math.round(Number(state.activeFrame) || 0)),
        layerId: diagnostics.resolvedLayerId || diagnostics.layerId || '',
        renderScheduled: true,
      });
      logRemoteSharedDrawVisibility(opRecord, diagnostics);
    }
    if (fromRemote && provisional) {
      const provisionalOpId = getSharedProjectOpId(opRecord);
      if (provisionalOpId) {
        sharedProjectAppliedProvisionalOpIds.add(provisionalOpId);
      }
      sharedProjectLastProvisionalRemoteAt = Date.now();
    }
    return applied;
  }


  return Object.freeze({
    resolveSharedProjectLayerForPayload,
    inspectIncomingSharedProjectDrawOp,
    canApplyIncomingSharedProjectDrawOp,
    shouldRefreshForSharedProjectApplySkip,
    normalizeSharedProjectPalettePayload,
    syncSharedProjectPaletteFromPayload,
    palettesHaveSameColorMultiset,
    paletteStartsWithPalette,
    getSharedProjectPalettePayloadSyncMode,
    buildSharedProjectExactPaletteIndexMapping,
    getSharedProjectPaletteOpHistoryLabel,
    prepareSharedProjectDrawCommandPalette,
    applySharedProjectStrokePixel,
    applySharedProjectBrushPoint,
    applySharedProjectStrokeCommand,
    resolveSharedProjectDrawCommandTarget,
    applySharedProjectShapeCommand,
    applySharedProjectFillCommand,
    applySharedProjectCurveCommand,
    applySharedProjectRegionCommand,
    isSharedProjectRemoteOpFromCurrentSession,
    applyLayerPatch,
    applySharedProjectPaletteOp,
    applyIncomingSharedProjectVisualResult,
    rememberSharedProjectRemoteApplyFailureKey,
    logRemoteSharedDrawVisibility,
    applyIncomingSharedProjectDrawOp,
  });
      }
    })(scope);
  }

  root.sharedProjectDrawApplyUtils = Object.freeze({
    createSharedProjectDrawApplyUtils,
  });
})();
