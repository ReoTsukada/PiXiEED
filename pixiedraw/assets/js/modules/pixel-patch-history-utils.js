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
        paletteIndex: isRasterIndexArray(layer?.indices) && safeIndex < layer.indices.length
          ? Math.round(Number(layer.indices[safeIndex]) || 0)
          : -1,
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
      if (!isPixelPatchHistoryEntry(pending) || !layer || isSimulationLayer(layer)) {
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
      if (!isPixelPatchHistoryEntry(pending) || !(pending.changesByIndex instanceof Map)) {
        return null;
      }
      if (pending.compressedSelectionMove && typeof pending.compressedSelectionMove === 'object') {
        return pending.compressedSelectionMove;
      }
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
      if (safeIndex >= layer.indices.length) {
        return false;
      }
      const base = safeIndex * 4;
      layer.indices[safeIndex] = Math.round(Number(value.paletteIndex) || 0);
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
      if (!isPixelPatchHistoryEntry(pending) || !(pending.changesByIndex instanceof Map)) {
        return false;
      }
      if (pending.compressedSelectionMove?.kind === 'selection-move-compressed') {
        return applyCompressedSelectionMoveHistoryEntry(pending.compressedSelectionMove, 'undo');
      }
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
      captureLayerPixelPatchValue,
      pixelPatchValuesEqual,
      getPendingPixelPatchChange,
      recordPendingPixelPatchBefore,
      recordPendingPixelPatchAfter,
      finalizePixelPatchHistoryEntry,
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
