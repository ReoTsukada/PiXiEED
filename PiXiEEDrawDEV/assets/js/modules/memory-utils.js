(() => {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createMemoryUtils({
    dom,
    state,
    history,
    DEFAULT_HISTORY_LIMIT,
    MEMORY_MONITOR_INTERVAL,
    MEMORY_WARNING_DEFAULT,
    MIN_HISTORY_LIMIT,
    HISTORY_MEMORY_BUDGET_BYTES,
    estimateEncodedByteLength,
    isPixelPatchHistoryEntry,
    finalizePixelPatchHistoryEntry,
    getAllTimelapseTracks,
    getAllTimelapseStepCount,
    getActiveTimelapseTrack,
    clearTimelapseRecording,
    fillPreviewCache,
    updateHistoryButtons,
    archiveEvictedHistoryEntry = () => false,
    markAutosaveDirty,
    scheduleAutosaveSnapshot,
    localizeText,
    formatBytes,
    normalizeProjectHistoryLimit,
  } = {}) {
    let historyTrimmedRecently = false;
    let historyTrimmedAt = 0;
    let memoryMonitorHandle = null;
    let memoryMonitorIdleHandle = null;
    let memoryMonitorIdleUsesRequestIdleCallback = false;
    const snapshotByteEstimateCache = new WeakMap();

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
      return { current, past, future, pending, timelapse, total: current + past + future + pending + timelapse };
    }

    function trimHistoryForMemoryIfNeeded(breakdown) {
      const budgetTrim = trimHistoryToByteBudget();
      if (!memoryThresholds || !Number.isFinite(memoryThresholds.warningBytes)) {
        return budgetTrim.trimmed ? getMemoryUsageBreakdown() : (breakdown || getMemoryUsageBreakdown());
      }
      let usage = budgetTrim.trimmed ? getMemoryUsageBreakdown() : (breakdown || getMemoryUsageBreakdown());
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
          archiveEvictedHistoryEntry('future', removed);
        } else {
          removed = history.past.shift();
          archiveEvictedHistoryEntry('past', removed);
        }
        total -= estimateSnapshotBytes(removed);
        trimmed = true;
      }
      if (trimmed) {
        updateHistoryButtons();
        markAutosaveDirty();
        scheduleAutosaveSnapshot();
        usage = getMemoryUsageBreakdown();
        history.limit = Math.max(MIN_HISTORY_LIMIT, Math.min(history.limit, Math.ceil(history.limit * 0.75)));
        while (history.past.length > history.limit) {
          archiveEvictedHistoryEntry('past', history.past.shift());
        }
        while (history.future.length > history.limit) {
          archiveEvictedHistoryEntry('future', history.future.shift());
        }
        historyTrimmedRecently = true;
        historyTrimmedAt = performance && typeof performance.now === 'function' ? performance.now() : Date.now();
      }
      return usage;
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
        historyTrimmedRecently = true;
        historyTrimmedAt = performance && typeof performance.now === 'function' ? performance.now() : Date.now();
      }
      return { past: pastBytes, future: futureBytes, total, budget, trimmed };
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

    function updateMemoryStatus() {
      const usageNode = dom.controls.memoryUsage || document.getElementById('memoryUsage');
      if (!usageNode) return;
      let usage = getMemoryUsageBreakdown();
      usage = trimHistoryForMemoryIfNeeded(usage);
      let text = localizeText(`メモリ: ${formatBytes(usage.total)}`, `Memory: ${formatBytes(usage.total)}`);
      if (memoryThresholds.maxBytes) {
        text += localizeText(
          ` | 上限目安 ${formatBytes(memoryThresholds.maxBytes)}`,
          ` | Limit ${formatBytes(memoryThresholds.maxBytes)}`
        );
      }
      text += localizeText(
        ` | ヒストリー ${history.past.length}/${history.limit}`,
        ` | History ${history.past.length}/${history.limit}`
      );
      text += localizeText(
        ` (${formatBytes(usage.past + usage.future)}/${formatBytes(HISTORY_MEMORY_BUDGET_BYTES)})`,
        ` (${formatBytes(usage.past + usage.future)}/${formatBytes(HISTORY_MEMORY_BUDGET_BYTES)})`
      );
      text += localizeText(
        ` | タイムラプス ${getAllTimelapseStepCount()}`,
        ` | Timelapse ${getAllTimelapseStepCount()}`
      );
      const activeTrack = getActiveTimelapseTrack();
      if ((Number(activeTrack?.sampleStep) || 1) > 1) {
        text += localizeText(
          ` (選択中を間引きx${activeTrack.sampleStep})`,
          ` (active thinning x${activeTrack.sampleStep})`
        );
      }
      const now = performance && typeof performance.now === 'function' ? performance.now() : Date.now();
      if (historyTrimmedRecently) {
        if (now - historyTrimmedAt <= 6000) {
          text += localizeText(' | ヒストリー自動整理', ' | History auto-trimmed');
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
      history.limit = DEFAULT_HISTORY_LIMIT;
      clearTimelapseRecording({ silent: true, scope: 'all' });
      fillPreviewCache.contextKey = null;
      fillPreviewCache.byPixel = null;
      updateHistoryButtons();
      markAutosaveDirty();
      updateMemoryStatus();
      scheduleAutosaveSnapshot();
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
      if (memoryMonitorIdleHandle !== null) {
        if (memoryMonitorIdleUsesRequestIdleCallback && typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(memoryMonitorIdleHandle);
        } else {
          window.clearTimeout(memoryMonitorIdleHandle);
        }
        memoryMonitorIdleHandle = null;
      }
      const scheduleMemoryStatusUpdate = () => {
        if (memoryMonitorIdleHandle !== null) return;
        const run = () => {
          memoryMonitorIdleHandle = null;
          updateMemoryStatus();
        };
        if (typeof window.requestIdleCallback === 'function') {
          memoryMonitorIdleUsesRequestIdleCallback = true;
          memoryMonitorIdleHandle = window.requestIdleCallback(run, { timeout: 1500 });
        } else {
          memoryMonitorIdleUsesRequestIdleCallback = false;
          memoryMonitorIdleHandle = window.setTimeout(run, 0);
        }
      };
      // Estimating every frame/layer/history/timelapse entry can take tens of
      // milliseconds for a large document. Keep the monitor out of input work.
      memoryMonitorHandle = window.setInterval(scheduleMemoryStatusUpdate, MEMORY_MONITOR_INTERVAL);
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

    return {
      bytesForLayer,
      estimateStateBytes,
      estimateSnapshotBytes,
      estimateHistoryBytes,
      estimateTimelapseBytes,
      getMemoryUsageBreakdown,
      trimHistoryForMemoryIfNeeded,
      trimHistoryToByteBudget,
      computeMemoryThresholds,
      updateMemoryStatus,
      clearMemoryUsage,
      trimHistoryStacksToLimit,
      initMemoryMonitor,
    };
  }

  root.memoryUtils = {
    createMemoryUtils,
  };
})();
