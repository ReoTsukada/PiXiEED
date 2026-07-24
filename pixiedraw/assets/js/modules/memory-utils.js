(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createMemoryUtils({
    state,
    history,
    DEFAULT_HISTORY_LIMIT,
    HISTORY_MEMORY_BUDGET_BYTES,
    estimateEncodedByteLength,
    isPixelPatchHistoryEntry,
    finalizePixelPatchHistoryEntry,
    getAllTimelapseTracks,
    updateHistoryButtons,
    archiveEvictedHistoryEntry = () => false,
    normalizeProjectHistoryLimit,
    getCanvasCompositeCacheBytes = () => 0,
  } = {}) {
    const snapshotByteEstimateCache = new WeakMap();

    function bytesForLayer(layer, seenIndexBuffers = null) {
      if (!layer) return 0;
      const indices = layer.indices;
      const direct = layer.direct;
      let indicesBytes = estimateEncodedByteLength(indices, 2);
      if (Array.isArray(layer.indicesTiles) || layer.indicesTiles instanceof Map) {
        const tiles = layer.indicesTiles instanceof Map
          ? layer.indicesTiles.values()
          : layer.indicesTiles;
        indicesBytes = 0;
        for (const tile of tiles) {
          if (!(tile instanceof Uint8Array)) continue;
          const buffer = tile.buffer;
          if (seenIndexBuffers && seenIndexBuffers.has(buffer)) continue;
          seenIndexBuffers?.add(buffer);
          indicesBytes += tile.byteLength;
        }
      }
      const directBytes = estimateEncodedByteLength(direct, 1);
      return indicesBytes + directBytes;
    }

    function estimateStateBytes() {
      let total = 0;
      const seenIndexBuffers = new Set();
      state.frames.forEach(frame => {
        frame.layers.forEach(layer => {
          total += bytesForLayer(layer, seenIndexBuffers);
        });
      });
      if (state.selectionMask) {
        total += state.selectionMask.length;
      }
      if (state.selectionContentMask) {
        total += state.selectionContentMask.length;
      }
      total += state.palette.length * 16;
      return total;
    }

    function estimateSnapshotBytes(snapshot) {
      if (!snapshot || typeof snapshot !== 'object') return 0;
      if (snapshotByteEstimateCache.has(snapshot)) {
        return snapshotByteEstimateCache.get(snapshot) || 0;
      }
      if (isPixelPatchHistoryEntry(snapshot)) {
        const changes = Array.isArray(snapshot.changes) ? snapshot.changes : [];
        const total = changes.reduce((sum, change) => {
          const valueBytes = value => {
            if (!value || typeof value !== 'object') return 0;
            return 8
              + (Array.isArray(value.direct) ? value.direct.length : 0)
              + (Array.isArray(value.importSourceDirect) ? value.importSourceDirect.length : 0);
          };
          return sum + 40 + valueBytes(change?.before) + valueBytes(change?.after);
        }, 96);
        snapshotByteEstimateCache.set(snapshot, total);
        return total;
      }
      let total = 0;
      const seenIndexBuffers = new Set();
      if (Array.isArray(snapshot.frames)) {
        snapshot.frames.forEach(frame => {
          if (!frame || !Array.isArray(frame.layers)) return;
          frame.layers.forEach(layer => {
            total += bytesForLayer(layer, seenIndexBuffers);
          });
        });
      }
      if (snapshot.selectionMask) {
        total += estimateEncodedByteLength(snapshot.selectionMask, 1);
      }
      if (snapshot.selectionContentMask) {
        total += estimateEncodedByteLength(snapshot.selectionContentMask, 1);
      }
      if (Array.isArray(snapshot.palette)) {
        total += snapshot.palette.length * 16;
      }
      snapshotByteEstimateCache.set(snapshot, total);
      return total;
    }

    function estimateHistoryBytes(list) {
      if (!Array.isArray(list)) return 0;
      return list.reduce((sum, snapshot) => sum + estimateSnapshotBytes(snapshot), 0);
    }

    function estimateTimelapseBytes() {
      let total = 0;
      Object.values(getAllTimelapseTracks()).forEach(track => {
        const snapshots = Array.isArray(track?.snapshots) ? track.snapshots : [];
        snapshots.forEach(entry => {
          if (!entry || typeof entry !== 'object') {
            return;
          }
          total += estimateEncodedByteLength(entry.pixels, 1);
          total += 16;
        });
        const log = track?.operationLog && typeof track.operationLog === 'object' ? track.operationLog : null;
        if (log?.baseSnapshot) {
          try {
            total += JSON.stringify(log.baseSnapshot).length * 2;
          } catch (error) {
            total += 0;
          }
        }
        if (Array.isArray(log?.entries)) {
          log.entries.forEach(entry => {
            try {
              total += JSON.stringify(entry).length * 2;
            } catch (error) {
              total += 0;
            }
          });
        }
      });
      return total;
    }

    function getMemoryUsageBreakdown() {
      const current = estimateStateBytes();
      const past = estimateHistoryBytes(history.past);
      const future = estimateHistoryBytes(history.future);
      const pending = isPixelPatchHistoryEntry(history.pending)
        ? estimateSnapshotBytes(finalizePixelPatchHistoryEntry(history.pending))
        : (history.pending && history.pending.before ? estimateSnapshotBytes(history.pending.before) : 0);
      const timelapse = estimateTimelapseBytes();
      const compositeCache = Math.max(0, Number(getCanvasCompositeCacheBytes()) || 0);
      return {
        current,
        past,
        future,
        pending,
        timelapse,
        compositeCache,
        total: current + past + future + pending + timelapse + compositeCache,
      };
    }

    function trimHistoryToByteBudget() {
      const budget = Math.max(1024 * 1024, Math.round(Number(HISTORY_MEMORY_BUDGET_BYTES) || 0));
      let pastBytes = estimateHistoryBytes(history.past);
      let futureBytes = estimateHistoryBytes(history.future);
      let total = pastBytes + futureBytes;
      let trimmed = false;
      // Keep the nearest undo or redo entry even when one structural snapshot
      // alone exceeds the budget. Older entries are released from the front.
      while (total > budget && history.past.length + history.future.length > 1) {
        const removeFuture = history.future.length > 0
          && (history.past.length === 0 || futureBytes >= pastBytes);
        const target = removeFuture ? history.future : history.past;
        const removed = target.shift();
        archiveEvictedHistoryEntry(removeFuture ? 'future' : 'past', removed);
        const removedBytes = estimateSnapshotBytes(removed);
        if (removeFuture) {
          futureBytes = Math.max(0, futureBytes - removedBytes);
        } else {
          pastBytes = Math.max(0, pastBytes - removedBytes);
        }
        total = pastBytes + futureBytes;
        trimmed = true;
      }
      if (trimmed) {
        updateHistoryButtons();
      }
      return { past: pastBytes, future: futureBytes, total, budget, trimmed };
    }

    function updateMemoryStatus() {
      // Kept as a lightweight compatibility hook for workflows that used to
      // refresh the removed memory meter after an edit.
    }

    function trimHistoryStacksToLimit() {
      const limit = normalizeProjectHistoryLimit(history.limit, DEFAULT_HISTORY_LIMIT);
      history.limit = limit;
      while (history.past.length > limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      while (history.future.length > limit) {
        archiveEvictedHistoryEntry('future', history.future.shift());
      }
      trimHistoryToByteBudget();
    }

    return {
      bytesForLayer,
      estimateStateBytes,
      estimateSnapshotBytes,
      estimateHistoryBytes,
      estimateTimelapseBytes,
      getMemoryUsageBreakdown,
      trimHistoryToByteBudget,
      updateMemoryStatus,
      trimHistoryStacksToLimit,
    };
  }

  root.memoryUtils = {
    createMemoryUtils,
  };
})();
