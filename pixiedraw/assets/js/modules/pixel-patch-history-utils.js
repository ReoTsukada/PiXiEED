(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPixelPatchHistoryUtils({
    state,
    history,
    HISTORY_ENTRY_TYPE_PIXEL_PATCH,
    PIXEL_PATCH_HISTORY_LABELS,
    multiState,
    getActiveSharedProjectKey,
    isSharedProjectCollaborativeMode,
    isVoxelExtensionModeEnabled,
    getActiveLayer,
    getActiveProjectCanvasDocument,
    getActiveFrame,
    isSimulationLayer,
    getProjectCanvasDocumentById,
    ensureLayerDirect,
    getRasterLayerRuntimeStoredIndex,
    setRasterLayerRuntimeStoredIndex,
    clamp,
    refreshLayerDirectOnlyFlag,
    invalidateFillPreviewCache,
    invalidateOnionSkinCache,
    clearPlaybackFrameCache,
    markDirtyRect,
    requestRender,
    requestOverlayRender,
    renderAllProjectCanvasSurfaces,
  } = {}) {
    const isRasterIndexArray = value => value instanceof Int16Array || value instanceof Uint8Array;

    function isPixelPatchHistoryEntry(entry) {
      return Boolean(entry && typeof entry === 'object' && entry.__historyEntryType === HISTORY_ENTRY_TYPE_PIXEL_PATCH);
    }

    function canUsePixelPatchHistory(label) {
      if (!PIXEL_PATCH_HISTORY_LABELS.has(String(label || ''))) {
        return false;
      }
      if (multiState.connected || getActiveSharedProjectKey?.() || isSharedProjectCollaborativeMode()) {
        return false;
      }
      if (isVoxelExtensionModeEnabled()) {
        return false;
      }
      const layer = getActiveLayer();
      return Boolean(layer && !isSimulationLayer(layer) && isRasterIndexArray(layer.indices));
    }

    function createPixelPatchHistoryPending(label) {
      const canvasDoc = getActiveProjectCanvasDocument();
      const frame = getActiveFrame();
      const layer = getActiveLayer();
      const width = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1));
      const height = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(state.height) || 1));
      if (!canvasDoc?.id || !frame?.id || !layer?.id || !isRasterIndexArray(layer.indices)) {
        return null;
      }
      return {
        __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
        dirty: false,
        label,
        canvasId: canvasDoc.id,
        frameId: frame.id,
        layerId: layer.id,
        width,
        height,
        changesByIndex: new Map(),
      };
    }

    // A wide brush changes a dense, overlapping area. Its operation is much
    // cheaper as one target-layer/frame snapshot than as hundreds of
    // thousands of per-pixel JS objects. It never snapshots other frames,
    // layers, palettes, or document structure.
    function createLayerRasterSnapshotPending(label) {
      const canvasDoc = getActiveProjectCanvasDocument();
      const frame = getActiveFrame();
      const layer = getActiveLayer();
      const width = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1));
      const height = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(state.height) || 1));
      if (!canvasDoc?.id || !frame?.id || !layer?.id || !isRasterIndexArray(layer.indices)) return null;
      return {
        __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
        kind: 'layer-raster-snapshot-pending',
        dirty: false,
        label,
        canvasId: canvasDoc.id,
        frameId: frame.id,
        layerId: layer.id,
        width,
        height,
        beforeIndices: layer.indices.slice(),
        beforeDirect: layer.direct instanceof Uint8ClampedArray ? layer.direct.slice() : null,
        beforeImportSourceDirect: layer.importSourceDirect instanceof Uint8ClampedArray ? layer.importSourceDirect.slice() : null,
      };
    }

    const RASTER_HISTORY_TILE_SIZE = 64;

    function createRasterTilePatchPending(label) {
      const canvasDoc = getActiveProjectCanvasDocument();
      const frame = getActiveFrame();
      const layer = getActiveLayer();
      const width = Math.max(1, Math.round(Number(canvasDoc?.width) || Number(state.width) || 1));
      const height = Math.max(1, Math.round(Number(canvasDoc?.height) || Number(state.height) || 1));
      if (!canvasDoc?.id || !frame?.id || !layer?.id || !isRasterIndexArray(layer.indices)) return null;
      return {
        __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
        kind: 'raster-tile-patch-pending',
        dirty: false,
        label,
        canvasId: canvasDoc.id,
        frameId: frame.id,
        layerId: layer.id,
        width,
        height,
        tileSize: RASTER_HISTORY_TILE_SIZE,
        tilesByKey: new Map(),
      };
    }

    // Paste and gradient fills only know their affected rectangle after the
    // transaction starts. Promote before their first write to avoid a Map
    // entry (and object allocation) for every changed pixel.
    function promotePendingPixelPatchToRasterTiles() {
      const pending = history.pending;
      if (!pending || pending.kind || !(pending.changesByIndex instanceof Map) || pending.changesByIndex.size) {
        return false;
      }
      const tilePending = createRasterTilePatchPending(pending.label);
      if (!tilePending) return false;
      history.pending = tilePending;
      return true;
    }

    function copyRasterTile(layer, x, y, width, height, canvasWidth) {
      const length = width * height;
      const indices = layer.indices instanceof Int16Array ? new Int16Array(length) : new Uint8Array(length);
      const direct = layer.direct instanceof Uint8ClampedArray ? new Uint8ClampedArray(length * 4) : null;
      for (let row = 0; row < height; row += 1) {
        const sourceStart = ((y + row) * canvasWidth) + x;
        const targetStart = row * width;
        // Tile-patch transactions are only created for materialized typed
        // raster arrays. A row copy stays in native typed-array code instead
        // of calling the runtime-index accessor once per pixel.
        indices.set(layer.indices.subarray(sourceStart, sourceStart + width), targetStart);
        if (direct) direct.set(layer.direct.subarray(sourceStart * 4, (sourceStart + width) * 4), targetStart * 4);
      }
      return { indices, direct };
    }

    function capturePendingRasterTilesForRect(layer, x0, y0, x1, y1) {
      const pending = history.pending;
      if (pending?.kind !== 'raster-tile-patch-pending' || !layer || !(pending.tilesByKey instanceof Map)) return false;
      const target = resolvePixelPatchHistoryTarget(pending);
      if (!target || target.layer !== layer) return false;
      const left = Math.max(0, Math.min(target.width - 1, Math.floor(Math.min(x0, x1))));
      const right = Math.max(0, Math.min(target.width - 1, Math.floor(Math.max(x0, x1))));
      const top = Math.max(0, Math.min(target.height - 1, Math.floor(Math.min(y0, y1))));
      const bottom = Math.max(0, Math.min(target.height - 1, Math.floor(Math.max(y0, y1))));
      const tileSize = pending.tileSize || RASTER_HISTORY_TILE_SIZE;
      for (let tileY = Math.floor(top / tileSize); tileY <= Math.floor(bottom / tileSize); tileY += 1) {
        for (let tileX = Math.floor(left / tileSize); tileX <= Math.floor(right / tileSize); tileX += 1) {
          const key = `${tileX}:${tileY}`;
          if (pending.tilesByKey.has(key)) continue;
          const x = tileX * tileSize;
          const y = tileY * tileSize;
          const width = Math.min(tileSize, target.width - x);
          const height = Math.min(tileSize, target.height - y);
          const before = copyRasterTile(layer, x, y, width, height, target.width);
          pending.tilesByKey.set(key, { x, y, width, height, beforeIndices: before.indices, beforeDirect: before.direct });
        }
      }
      return true;
    }

    function captureLayerPixelPatchValue(layer, index) {
      const safeIndex = Math.max(0, Math.round(Number(index) || 0));
      const base = safeIndex * 4;
      const direct = layer?.direct instanceof Uint8ClampedArray && base + 3 < layer.direct.length
        ? [
            layer.direct[base],
            layer.direct[base + 1],
            layer.direct[base + 2],
            layer.direct[base + 3],
          ]
        : null;
      const importSourceDirect = layer?.importSourceDirect instanceof Uint8ClampedArray && base + 3 < layer.importSourceDirect.length
        ? [
            layer.importSourceDirect[base],
            layer.importSourceDirect[base + 1],
            layer.importSourceDirect[base + 2],
            layer.importSourceDirect[base + 3],
          ]
        : null;
      return {
        paletteIndex: typeof getRasterLayerRuntimeStoredIndex === 'function'
          ? Math.round(Number(getRasterLayerRuntimeStoredIndex(layer, safeIndex)) || 0)
          : (isRasterIndexArray(layer?.indices) && safeIndex < layer.indices.length
            ? Math.round(Number(layer.indices[safeIndex]) || 0)
            : -1),
        direct,
        importSourceDirect,
      };
    }

    function pixelPatchValuesEqual(a, b) {
      if (!a || !b) {
        return false;
      }
      if (a.paletteIndex !== b.paletteIndex) {
        return false;
      }
      const compareRgba = (left, right) => {
        if (!left && !right) return true;
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== 4 || right.length !== 4) {
          return false;
        }
        return left[0] === right[0]
          && left[1] === right[1]
          && left[2] === right[2]
          && left[3] === right[3];
      };
      return compareRgba(a.direct, b.direct)
        && compareRgba(a.importSourceDirect, b.importSourceDirect);
    }

    function getPendingPixelPatchChange(layer, index, { create = false } = {}) {
      const pending = history.pending;
      if (
        !isPixelPatchHistoryEntry(pending)
        || pending?.kind === 'layer-raster-snapshot-pending'
        || pending?.kind === 'raster-tile-patch-pending'
        || !(pending?.changesByIndex instanceof Map)
        || !layer
        || isSimulationLayer(layer)
      ) {
        return null;
      }
      const canvasDoc = getActiveProjectCanvasDocument();
      const frame = getActiveFrame();
      if (
        pending.canvasId !== (canvasDoc?.id || '')
        || pending.frameId !== (frame?.id || '')
        || pending.layerId !== (layer.id || '')
      ) {
        return null;
      }
      const safeIndex = Math.max(0, Math.round(Number(index) || 0));
      if (!pending.changesByIndex.has(safeIndex) && create) {
        pending.changesByIndex.set(safeIndex, {
          index: safeIndex,
          before: captureLayerPixelPatchValue(layer, safeIndex),
          after: null,
        });
      }
      return pending.changesByIndex.get(safeIndex) || null;
    }

    function recordPendingPixelPatchBefore(layer, index) {
      getPendingPixelPatchChange(layer, index, { create: true });
    }

    function recordPendingPixelPatchAfter(layer, index) {
      const change = getPendingPixelPatchChange(layer, index, { create: true });
      if (!change) {
        return;
      }
      change.after = captureLayerPixelPatchValue(layer, change.index);
    }

    function finalizePixelPatchHistoryEntry(pending) {
      if (!isPixelPatchHistoryEntry(pending)) {
        return null;
      }
      if (pending.compressedSelectionMove && typeof pending.compressedSelectionMove === 'object') {
        return pending.compressedSelectionMove;
      }
      if (pending.compressedSolidFill && typeof pending.compressedSolidFill === 'object') {
        return pending.compressedSolidFill;
      }
      if (pending.kind === 'raster-tile-patch-pending') {
        const target = resolvePixelPatchHistoryTarget(pending);
        if (!target || !pending.dirty || !(pending.tilesByKey instanceof Map) || !pending.tilesByKey.size) return null;
        const tiles = [];
        pending.tilesByKey.forEach(tile => {
          const after = copyRasterTile(target.layer, tile.x, tile.y, tile.width, tile.height, target.width);
          tiles.push({ ...tile, afterIndices: after.indices, afterDirect: after.direct });
        });
        return {
          __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
          kind: 'raster-tile-patch', version: 1, historyLabel: pending.label,
          canvasId: pending.canvasId, frameId: pending.frameId, layerId: pending.layerId,
          width: pending.width, height: pending.height, tiles,
        };
      }
      if (pending.kind === 'layer-raster-snapshot-pending') {
        const target = resolvePixelPatchHistoryTarget(pending);
        if (!target || !isRasterIndexArray(pending.beforeIndices) || !pending.dirty) return null;
        return {
          __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
          kind: 'layer-raster-snapshot',
          version: 1,
          historyLabel: pending.label,
          canvasId: pending.canvasId,
          frameId: pending.frameId,
          layerId: pending.layerId,
          width: pending.width,
          height: pending.height,
          beforeIndices: pending.beforeIndices,
          beforeDirect: pending.beforeDirect,
          beforeImportSourceDirect: pending.beforeImportSourceDirect,
          afterIndices: target.layer.indices.slice(),
          afterDirect: target.layer.direct instanceof Uint8ClampedArray ? target.layer.direct.slice() : null,
          afterImportSourceDirect: target.layer.importSourceDirect instanceof Uint8ClampedArray ? target.layer.importSourceDirect.slice() : null,
        };
      }
      if (!(pending.changesByIndex instanceof Map)) return null;
      const changes = [];
      pending.changesByIndex.forEach(change => {
        if (!change || !change.before || !change.after || pixelPatchValuesEqual(change.before, change.after)) {
          return;
        }
        changes.push({
          index: change.index,
          before: change.before,
          after: change.after,
        });
      });
      if (!changes.length) {
        return null;
      }
      changes.sort((left, right) => left.index - right.index);
      return {
        __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
        version: 1,
        historyLabel: pending.label,
        canvasId: pending.canvasId,
        frameId: pending.frameId,
        layerId: pending.layerId,
        width: pending.width,
        height: pending.height,
        changes,
      };
    }

    // Bucket fills are frequently large, but their result is normally one
    // palette value written to contiguous scanline runs.  Do not retain a
    // Map of JS objects per cell (the old path could take tens of seconds).
    // This remains a strictly layer/frame scoped undo entry: runs describe
    // only affected cells and beforeIndices/direct are typed buffers.
    function preparePendingSolidFillPatch(layer, pixels, paletteIndex) {
      const pending = history.pending;
      if (
        !isPixelPatchHistoryEntry(pending)
        || !layer
        || !(layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array)
        || !Array.isArray(pixels)
        || !pixels.length
        || pending.compressedSolidFill
      ) {
        return null;
      }
      const canvasDoc = getActiveProjectCanvasDocument();
      const frame = getActiveFrame();
      if (
        pending.canvasId !== (canvasDoc?.id || '')
        || pending.frameId !== (frame?.id || '')
        || pending.layerId !== (layer.id || '')
      ) {
        return null;
      }
      const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      let alreadyOrdered = true;
      for (let i = 1; i < pixels.length; i += 1) {
        if (pixels[i] < pixels[i - 1]) { alreadyOrdered = false; break; }
      }
      const ordered = alreadyOrdered ? pixels : pixels.slice().sort((left, right) => left - right);
      const changed = [];
      for (let i = 0; i < ordered.length; i += 1) {
        const index = ordered[i];
        if (!Number.isInteger(index) || index < 0 || index >= layer.indices.length) continue;
        const base = index * 4;
        if (getRasterLayerRuntimeStoredIndex(layer, index) === paletteIndex && (!direct || direct[base + 3] === 0)) continue;
        changed.push(index);
      }
      if (!changed.length) return null;
      const runValues = [];
      let offset = 0;
      while (offset < changed.length) {
        const start = changed[offset];
        let length = 1;
        while (offset + length < changed.length && changed[offset + length] === start + length) length += 1;
        runValues.push(start, length);
        offset += length;
      }
      const beforeIndices = layer.indices instanceof Int16Array
        ? new Int16Array(changed.length)
        : new Uint8Array(changed.length);
      const beforeDirect = direct ? new Uint8ClampedArray(changed.length * 4) : null;
      for (let i = 0; i < changed.length; i += 1) {
        const index = changed[i];
        beforeIndices[i] = getRasterLayerRuntimeStoredIndex(layer, index);
        if (beforeDirect) beforeDirect.set(direct.subarray(index * 4, (index * 4) + 4), i * 4);
      }
      const entry = {
        __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
        kind: 'solid-fill-runs',
        version: 1,
        historyLabel: pending.label,
        canvasId: pending.canvasId,
        frameId: pending.frameId,
        layerId: pending.layerId,
        width: pending.width,
        height: pending.height,
        runs: new Int32Array(runValues),
        beforeIndices,
        beforeDirect,
        afterPaletteIndex: Math.round(Number(paletteIndex) || 0),
      };
      pending.compressedSolidFill = entry;
      return entry;
    }

    function preparePendingSolidFillRuns(layer, runs, paletteIndex) {
      const pending = history.pending;
      if (
        !isPixelPatchHistoryEntry(pending)
        || !layer
        || !(layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array)
        || !(runs instanceof Int32Array || Array.isArray(runs))
        || !runs.length
        || pending.compressedSolidFill
      ) return null;
      const canvasDoc = getActiveProjectCanvasDocument();
      const frame = getActiveFrame();
      if (pending.canvasId !== (canvasDoc?.id || '') || pending.frameId !== (frame?.id || '') || pending.layerId !== (layer.id || '')) return null;
      const direct = layer.direct instanceof Uint8ClampedArray ? layer.direct : null;
      let changedCount = 0;
      for (let offset = 0; offset + 1 < runs.length; offset += 2) changedCount += Math.max(0, Math.floor(Number(runs[offset + 1]) || 0));
      if (!changedCount) return null;
      const beforeIndices = layer.indices instanceof Int16Array ? new Int16Array(changedCount) : new Uint8Array(changedCount);
      const beforeDirect = direct ? new Uint8ClampedArray(changedCount * 4) : null;
      let writeOffset = 0;
      for (let offset = 0; offset + 1 < runs.length; offset += 2) {
        const start = Math.max(0, Math.floor(Number(runs[offset]) || 0));
        const length = Math.max(0, Math.floor(Number(runs[offset + 1]) || 0));
        for (let index = start, end = Math.min(layer.indices.length, start + length); index < end; index += 1) {
          beforeIndices[writeOffset] = getRasterLayerRuntimeStoredIndex(layer, index);
          if (beforeDirect) beforeDirect.set(direct.subarray(index * 4, (index * 4) + 4), writeOffset * 4);
          writeOffset += 1;
        }
      }
      if (!writeOffset) return null;
      const entry = {
        __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
        kind: 'solid-fill-runs', version: 1, historyLabel: pending.label,
        canvasId: pending.canvasId, frameId: pending.frameId, layerId: pending.layerId,
        width: pending.width, height: pending.height,
        runs: runs instanceof Int32Array ? runs : new Int32Array(runs),
        beforeIndices: writeOffset === beforeIndices.length ? beforeIndices : beforeIndices.slice(0, writeOffset),
        beforeDirect: beforeDirect ? (writeOffset * 4 === beforeDirect.length ? beforeDirect : beforeDirect.slice(0, writeOffset * 4)) : null,
        afterPaletteIndex: Math.round(Number(paletteIndex) || 0),
      };
      pending.compressedSolidFill = entry;
      return entry;
    }

    function resolvePixelPatchHistoryTarget(entry) {
      if (!isPixelPatchHistoryEntry(entry)) {
        return null;
      }
      const canvasDoc = getProjectCanvasDocumentById(entry.canvasId) || getActiveProjectCanvasDocument();
      const frames = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames : [];
      const frame = frames.find(item => item?.id === entry.frameId) || null;
      const layer = Array.isArray(frame?.layers)
        ? (frame.layers.find(item => item?.id === entry.layerId) || null)
        : null;
      if (!canvasDoc || !frame || !layer || isSimulationLayer(layer) || !isRasterIndexArray(layer.indices)) {
        return null;
      }
      const width = Math.max(1, Math.round(Number(canvasDoc.width) || Number(entry.width) || 1));
      const height = Math.max(1, Math.round(Number(canvasDoc.height) || Number(entry.height) || 1));
      if (width !== Math.max(1, Math.round(Number(entry.width) || 1)) || height !== Math.max(1, Math.round(Number(entry.height) || 1))) {
        return null;
      }
      return { canvasDoc, frame, layer, width, height };
    }

    function writeLayerPixelPatchValue(layer, index, value, width, height) {
      if (!layer || !isRasterIndexArray(layer.indices) || !value) {
        return false;
      }
      const safeIndex = Math.max(0, Math.round(Number(index) || 0));
      if (safeIndex >= Math.max(1, width * height)) {
        return false;
      }
      const base = safeIndex * 4;
      if (typeof setRasterLayerRuntimeStoredIndex === 'function') {
        setRasterLayerRuntimeStoredIndex(layer, safeIndex, Math.round(Number(value.paletteIndex) || 0));
      } else {
        layer.indices[safeIndex] = Math.round(Number(value.paletteIndex) || 0);
      }
      if (Array.isArray(value.direct) && value.direct.length === 4) {
        const direct = ensureLayerDirect(layer, width, height);
        direct[base] = clamp(Math.round(Number(value.direct[0]) || 0), 0, 255);
        direct[base + 1] = clamp(Math.round(Number(value.direct[1]) || 0), 0, 255);
        direct[base + 2] = clamp(Math.round(Number(value.direct[2]) || 0), 0, 255);
        direct[base + 3] = clamp(Math.round(Number(value.direct[3]) || 0), 0, 255);
      } else if (layer.direct instanceof Uint8ClampedArray && base + 3 < layer.direct.length) {
        layer.direct[base] = 0;
        layer.direct[base + 1] = 0;
        layer.direct[base + 2] = 0;
        layer.direct[base + 3] = 0;
      }
      if (
        Array.isArray(value.importSourceDirect)
        && value.importSourceDirect.length === 4
        && layer.importSourceDirect instanceof Uint8ClampedArray
        && layer.importSourceDirect.length === Math.max(1, width * height) * 4
      ) {
        layer.importSourceDirect[base] = clamp(Math.round(Number(value.importSourceDirect[0]) || 0), 0, 255);
        layer.importSourceDirect[base + 1] = clamp(Math.round(Number(value.importSourceDirect[1]) || 0), 0, 255);
        layer.importSourceDirect[base + 2] = clamp(Math.round(Number(value.importSourceDirect[2]) || 0), 0, 255);
        layer.importSourceDirect[base + 3] = clamp(Math.round(Number(value.importSourceDirect[3]) || 0), 0, 255);
      } else if (layer.importSourceDirect instanceof Uint8ClampedArray && base + 3 < layer.importSourceDirect.length) {
        layer.importSourceDirect[base] = 0;
        layer.importSourceDirect[base + 1] = 0;
        layer.importSourceDirect[base + 2] = 0;
        layer.importSourceDirect[base + 3] = 0;
      }
      refreshLayerDirectOnlyFlag(layer);
      return true;
    }

    function applyPixelPatchHistoryEntry(entry, direction = 'undo') {
      if (entry?.kind === 'selection-move-compressed') {
        return applyCompressedSelectionMoveHistoryEntry(entry, direction);
      }
      if (entry?.kind === 'solid-fill-runs') {
        return applySolidFillRunHistoryEntry(entry, direction);
      }
      if (entry?.kind === 'layer-raster-snapshot') {
        return applyLayerRasterSnapshotHistoryEntry(entry, direction);
      }
      if (entry?.kind === 'raster-tile-patch') {
        return applyRasterTilePatchHistoryEntry(entry, direction);
      }
      const target = resolvePixelPatchHistoryTarget(entry);
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      if (!target || !changes.length) {
        return false;
      }
      const useAfter = direction === 'redo';
      let applied = false;
      let dirtyX0 = target.width;
      let dirtyY0 = target.height;
      let dirtyX1 = -1;
      let dirtyY1 = -1;
      for (let index = 0; index < changes.length; index += 1) {
        const change = changes[index];
        const value = useAfter ? change?.after : change?.before;
        if (!value) {
          continue;
        }
        const changeApplied = writeLayerPixelPatchValue(target.layer, change.index, value, target.width, target.height);
        if (!changeApplied) {
          continue;
        }
        applied = true;
        const safeIndex = Math.max(0, Math.round(Number(change.index) || 0));
        const x = safeIndex % target.width;
        const y = Math.floor(safeIndex / target.width);
        if (x < dirtyX0) dirtyX0 = x;
        if (y < dirtyY0) dirtyY0 = y;
        if (x > dirtyX1) dirtyX1 = x;
        if (y > dirtyY1) dirtyY1 = y;
      }
      if (!applied) {
        return false;
      }
      invalidateFillPreviewCache();
      invalidateOnionSkinCache();
      clearPlaybackFrameCache();
      const activeCanvasId = String(getActiveProjectCanvasDocument()?.id || '');
      const targetCanvasId = String(target.canvasDoc?.id || '');
      const targetsActiveCanvas = Boolean(activeCanvasId && targetCanvasId === activeCanvasId);
      if (targetsActiveCanvas) {
        if (dirtyX1 >= dirtyX0 && dirtyY1 >= dirtyY0) {
          markDirtyRect?.(dirtyX0, dirtyY0, dirtyX1, dirtyY1);
        }
        requestRender();
      }
      requestOverlayRender();
      const requiresAllSurfaceRefresh = !targetsActiveCanvas
        || multiState.connected
        || Boolean(getActiveSharedProjectKey?.())
        || isSharedProjectCollaborativeMode();
      if (requiresAllSurfaceRefresh) {
        renderAllProjectCanvasSurfaces();
      }
      return true;
    }

    function applyRasterTilePatchHistoryEntry(entry, direction = 'undo') {
      const target = resolvePixelPatchHistoryTarget(entry);
      const tiles = Array.isArray(entry?.tiles) ? entry.tiles : [];
      if (!target || !tiles.length) return false;
      const useAfter = direction === 'redo';
      let x0 = target.width; let y0 = target.height; let x1 = -1; let y1 = -1;
      tiles.forEach(tile => {
        const indices = useAfter ? tile?.afterIndices : tile?.beforeIndices;
        const direct = useAfter ? tile?.afterDirect : tile?.beforeDirect;
        if (!tile || !isRasterIndexArray(indices) || indices.length !== tile.width * tile.height) return;
        for (let row = 0; row < tile.height; row += 1) {
          const destinationStart = ((tile.y + row) * target.width) + tile.x;
          const sourceStart = row * tile.width;
          for (let column = 0; column < tile.width; column += 1) {
            const index = destinationStart + column;
            const value = indices[sourceStart + column];
            if (typeof setRasterLayerRuntimeStoredIndex === 'function') setRasterLayerRuntimeStoredIndex(target.layer, index, value);
            else target.layer.indices[index] = value;
          }
          if (target.layer.direct instanceof Uint8ClampedArray && direct instanceof Uint8ClampedArray) {
            target.layer.direct.set(direct.subarray(sourceStart * 4, (sourceStart + tile.width) * 4), destinationStart * 4);
          }
        }
        x0 = Math.min(x0, tile.x); y0 = Math.min(y0, tile.y);
        x1 = Math.max(x1, tile.x + tile.width - 1); y1 = Math.max(y1, tile.y + tile.height - 1);
      });
      if (x1 < x0 || y1 < y0) return false;
      refreshLayerDirectOnlyFlag(target.layer);
      invalidateFillPreviewCache(); invalidateOnionSkinCache(); clearPlaybackFrameCache();
      if (String(getActiveProjectCanvasDocument()?.id || '') === String(target.canvasDoc?.id || '')) {
        markDirtyRect?.(x0, y0, x1, y1); requestRender();
      }
      requestOverlayRender();
      return true;
    }

    function applyLayerRasterSnapshotHistoryEntry(entry, direction = 'undo') {
      const target = resolvePixelPatchHistoryTarget(entry);
      const useAfter = direction === 'redo';
      const indices = useAfter ? entry?.afterIndices : entry?.beforeIndices;
      const direct = useAfter ? entry?.afterDirect : entry?.beforeDirect;
      const importSourceDirect = useAfter ? entry?.afterImportSourceDirect : entry?.beforeImportSourceDirect;
      if (!target || !isRasterIndexArray(indices) || indices.length !== target.layer.indices.length) return false;
      target.layer.indices.set(indices);
      if (direct instanceof Uint8ClampedArray) {
        target.layer.direct = direct.slice();
      } else {
        target.layer.direct = null;
      }
      if (importSourceDirect instanceof Uint8ClampedArray) {
        target.layer.importSourceDirect = importSourceDirect.slice();
      } else {
        target.layer.importSourceDirect = null;
      }
      refreshLayerDirectOnlyFlag(target.layer);
      invalidateFillPreviewCache();
      invalidateOnionSkinCache();
      clearPlaybackFrameCache();
      if (String(getActiveProjectCanvasDocument()?.id || '') === String(target.canvasDoc?.id || '')) {
        markDirtyRect?.(0, 0, target.width - 1, target.height - 1);
        requestRender();
      }
      requestOverlayRender();
      return true;
    }

    function applySolidFillRunHistoryEntry(entry, direction = 'undo') {
      const target = resolvePixelPatchHistoryTarget(entry);
      if (
        !target
        || !(entry.runs instanceof Int32Array)
        || !(entry.beforeIndices instanceof Int16Array || entry.beforeIndices instanceof Uint8Array)
      ) return false;
      const direct = target.layer.direct instanceof Uint8ClampedArray ? target.layer.direct : null;
      const useAfter = direction === 'redo';
      let valueOffset = 0;
      let dirtyX0 = target.width;
      let dirtyY0 = target.height;
      let dirtyX1 = -1;
      let dirtyY1 = -1;
      for (let runOffset = 0; runOffset + 1 < entry.runs.length; runOffset += 2) {
        const start = entry.runs[runOffset];
        const length = entry.runs[runOffset + 1];
        for (let local = 0; local < length; local += 1, valueOffset += 1) {
          const index = start + local;
          if (index < 0 || index >= target.layer.indices.length || valueOffset >= entry.beforeIndices.length) continue;
          if (typeof setRasterLayerRuntimeStoredIndex === 'function') {
            setRasterLayerRuntimeStoredIndex(target.layer, index, useAfter ? entry.afterPaletteIndex : entry.beforeIndices[valueOffset]);
          } else {
            target.layer.indices[index] = useAfter ? entry.afterPaletteIndex : entry.beforeIndices[valueOffset];
          }
          if (direct) {
            const base = index * 4;
            if (useAfter || !(entry.beforeDirect instanceof Uint8ClampedArray)) {
              direct[base] = 0; direct[base + 1] = 0; direct[base + 2] = 0; direct[base + 3] = 0;
            } else {
              const source = valueOffset * 4;
              direct[base] = entry.beforeDirect[source]; direct[base + 1] = entry.beforeDirect[source + 1];
              direct[base + 2] = entry.beforeDirect[source + 2]; direct[base + 3] = entry.beforeDirect[source + 3];
            }
          }
          const x = index % target.width;
          const y = Math.floor(index / target.width);
          if (x < dirtyX0) dirtyX0 = x;
          if (y < dirtyY0) dirtyY0 = y;
          if (x > dirtyX1) dirtyX1 = x;
          if (y > dirtyY1) dirtyY1 = y;
        }
      }
      if (dirtyX1 < dirtyX0 || dirtyY1 < dirtyY0) return false;
      refreshLayerDirectOnlyFlag(target.layer);
      invalidateFillPreviewCache();
      invalidateOnionSkinCache();
      clearPlaybackFrameCache();
      if (String(getActiveProjectCanvasDocument()?.id || '') === String(target.canvasDoc?.id || '')) {
        markDirtyRect?.(dirtyX0, dirtyY0, dirtyX1, dirtyY1);
        requestRender();
      }
      requestOverlayRender();
      return true;
    }

    // Large selection moves used to retain one { before, after } object per
    // pixel. Keep the same undo/redo semantics, but express the move as typed
    // source and destination buffers instead. This is intentionally a
    // pixel-patch history entry so existing history plumbing can handle it.
    function applyCompressedSelectionMoveHistoryEntry(entry, direction = 'undo') {
      const target = resolvePixelPatchHistoryTarget(entry);
      const sourceMask = entry?.sourceMask;
      const sourceIndices = entry?.sourceIndices;
      const sourceDirect = entry?.sourceDirect;
      const targetPositions = entry?.targetPositions;
      const targetBeforeIndices = entry?.targetBeforeIndices;
      const targetAfterIndices = entry?.targetAfterIndices;
      const targetBeforeDirect = entry?.targetBeforeDirect;
      const targetAfterDirect = entry?.targetAfterDirect;
      const moveWidth = Math.max(0, Math.round(Number(entry?.moveWidth) || 0));
      const moveHeight = Math.max(0, Math.round(Number(entry?.moveHeight) || 0));
      const sourceX = Math.round(Number(entry?.sourceX) || 0);
      const sourceY = Math.round(Number(entry?.sourceY) || 0);
      if (
        !target
        || !(sourceMask instanceof Uint8Array)
        || !isRasterIndexArray(sourceIndices)
        || moveWidth <= 0
        || moveHeight <= 0
        || sourceMask.length !== moveWidth * moveHeight
        || sourceIndices.length !== sourceMask.length
        || !(targetPositions instanceof Int32Array)
        || !isRasterIndexArray(targetBeforeIndices)
        || !isRasterIndexArray(targetAfterIndices)
        || targetBeforeIndices.length !== targetPositions.length
        || targetAfterIndices.length !== targetPositions.length
      ) {
        return false;
      }
      const layerDirect = target.layer.direct instanceof Uint8ClampedArray ? target.layer.direct : null;
      const useAfter = direction === 'redo';
      let dirtyX0 = target.width;
      let dirtyY0 = target.height;
      let dirtyX1 = -1;
      let dirtyY1 = -1;
      const noteDirtyIndex = index => {
        const x = index % target.width;
        const y = Math.floor(index / target.width);
        if (x < dirtyX0) dirtyX0 = x;
        if (y < dirtyY0) dirtyY0 = y;
        if (x > dirtyX1) dirtyX1 = x;
        if (y > dirtyY1) dirtyY1 = y;
      };
      const writeDirect = (index, pixels, valueOffset) => {
        if (!(pixels instanceof Uint8ClampedArray) || pixels.length < (valueOffset + 1) * 4) {
          return;
        }
        const direct = layerDirect || ensureLayerDirect(target.layer, target.width, target.height);
        const base = index * 4;
        const valueBase = valueOffset * 4;
        direct[base] = pixels[valueBase];
        direct[base + 1] = pixels[valueBase + 1];
        direct[base + 2] = pixels[valueBase + 2];
        direct[base + 3] = pixels[valueBase + 3];
      };
      const clearSource = () => {
        const transparent = target.layer.indices instanceof Uint8Array ? 0 : -1;
        for (let localIndex = 0; localIndex < sourceMask.length; localIndex += 1) {
          if (sourceMask[localIndex] !== 1) continue;
          const x = sourceX + (localIndex % moveWidth);
          const y = sourceY + Math.floor(localIndex / moveWidth);
          if (x < 0 || y < 0 || x >= target.width || y >= target.height) continue;
          const index = y * target.width + x;
          target.layer.indices[index] = transparent;
          if (layerDirect && index * 4 + 3 < layerDirect.length) {
            const base = index * 4;
            layerDirect[base] = 0;
            layerDirect[base + 1] = 0;
            layerDirect[base + 2] = 0;
            layerDirect[base + 3] = 0;
          }
          noteDirtyIndex(index);
        }
      };
      const restoreSource = () => {
        for (let localIndex = 0; localIndex < sourceMask.length; localIndex += 1) {
          if (sourceMask[localIndex] !== 1) continue;
          const x = sourceX + (localIndex % moveWidth);
          const y = sourceY + Math.floor(localIndex / moveWidth);
          if (x < 0 || y < 0 || x >= target.width || y >= target.height) continue;
          const index = y * target.width + x;
          target.layer.indices[index] = sourceIndices[localIndex];
          if (sourceDirect instanceof Uint8ClampedArray && sourceDirect.length >= (localIndex + 1) * 4) {
            const direct = layerDirect || ensureLayerDirect(target.layer, target.width, target.height);
            const sourceBase = localIndex * 4;
            const base = index * 4;
            direct[base] = sourceDirect[sourceBase];
            direct[base + 1] = sourceDirect[sourceBase + 1];
            direct[base + 2] = sourceDirect[sourceBase + 2];
            direct[base + 3] = sourceDirect[sourceBase + 3];
          }
          noteDirtyIndex(index);
        }
      };
      if (useAfter) {
        clearSource();
        for (let i = 0; i < targetPositions.length; i += 1) {
          const index = targetPositions[i];
          if (index < 0 || index >= target.layer.indices.length) continue;
          target.layer.indices[index] = targetAfterIndices[i];
          if (targetAfterDirect instanceof Uint8ClampedArray) {
            writeDirect(index, targetAfterDirect, i);
          }
          noteDirtyIndex(index);
        }
      } else {
        for (let i = 0; i < targetPositions.length; i += 1) {
          const index = targetPositions[i];
          if (index < 0 || index >= target.layer.indices.length) continue;
          target.layer.indices[index] = targetBeforeIndices[i];
          if (targetBeforeDirect instanceof Uint8ClampedArray) {
            writeDirect(index, targetBeforeDirect, i);
          }
          noteDirtyIndex(index);
        }
        restoreSource();
      }
      if (dirtyX1 < dirtyX0 || dirtyY1 < dirtyY0) {
        return false;
      }
      refreshLayerDirectOnlyFlag(target.layer);
      invalidateFillPreviewCache();
      invalidateOnionSkinCache();
      clearPlaybackFrameCache();
      const activeCanvasId = String(getActiveProjectCanvasDocument()?.id || '');
      if (activeCanvasId && activeCanvasId === String(target.canvasDoc?.id || '')) {
        markDirtyRect?.(dirtyX0, dirtyY0, dirtyX1, dirtyY1);
        requestRender();
      }
      requestOverlayRender();
      if (multiState.connected || Boolean(getActiveSharedProjectKey?.()) || isSharedProjectCollaborativeMode()) {
        renderAllProjectCanvasSurfaces();
      }
      return true;
    }

    function rollbackPixelPatchHistoryPending(pending) {
      if (!isPixelPatchHistoryEntry(pending)) {
        return false;
      }
      if (pending.compressedSelectionMove?.kind === 'selection-move-compressed') {
        return applyCompressedSelectionMoveHistoryEntry(pending.compressedSelectionMove, 'undo');
      }
      if (pending.compressedSolidFill?.kind === 'solid-fill-runs') {
        return applySolidFillRunHistoryEntry(pending.compressedSolidFill, 'undo');
      }
      if (pending.kind === 'layer-raster-snapshot-pending') {
        return applyLayerRasterSnapshotHistoryEntry({
          ...pending,
          kind: 'layer-raster-snapshot',
          afterIndices: pending.beforeIndices,
          afterDirect: pending.beforeDirect,
          afterImportSourceDirect: pending.beforeImportSourceDirect,
        }, 'undo');
      }
      if (pending.kind === 'raster-tile-patch-pending') {
        const entry = finalizePixelPatchHistoryEntry(pending);
        return entry ? applyRasterTilePatchHistoryEntry(entry, 'undo') : false;
      }
      if (!(pending.changesByIndex instanceof Map)) return false;
      const changes = [];
      pending.changesByIndex.forEach(change => {
        if (!change?.before) {
          return;
        }
        changes.push({
          index: change.index,
          before: change.before,
          after: change.after || change.before,
        });
      });
      if (!changes.length) {
        return false;
      }
      return applyPixelPatchHistoryEntry({
        __historyEntryType: HISTORY_ENTRY_TYPE_PIXEL_PATCH,
        version: 1,
        historyLabel: pending.label,
        canvasId: pending.canvasId,
        frameId: pending.frameId,
        layerId: pending.layerId,
        width: pending.width,
        height: pending.height,
        changes,
      }, 'undo');
    }

    return {
      isPixelPatchHistoryEntry,
      canUsePixelPatchHistory,
      createPixelPatchHistoryPending,
      createLayerRasterSnapshotPending,
      createRasterTilePatchPending,
      promotePendingPixelPatchToRasterTiles,
      capturePendingRasterTilesForRect,
      captureLayerPixelPatchValue,
      pixelPatchValuesEqual,
      getPendingPixelPatchChange,
      recordPendingPixelPatchBefore,
      recordPendingPixelPatchAfter,
      finalizePixelPatchHistoryEntry,
      preparePendingSolidFillPatch,
      preparePendingSolidFillRuns,
      resolvePixelPatchHistoryTarget,
      writeLayerPixelPatchValue,
      applyPixelPatchHistoryEntry,
      rollbackPixelPatchHistoryPending,
    };
  }

  root.pixelPatchHistoryUtils = {
    createPixelPatchHistoryUtils,
  };
})();
