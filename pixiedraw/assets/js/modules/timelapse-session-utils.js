(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createTimelapseSessionUtils(rawScope = {}) {
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
  const timelapseCheckpointPendingTracks = new WeakSet();
  const timelapseQueuedFrameIdsByCanvasId = new Map();
  let timelapseCaptureIdleHandle = null;

  function shouldRecordLocalTimelapseOperationLog() {
    return Boolean(timelapseState.enabled && !activeSharedProjectKey);
  }

  function shouldCaptureTimelapseSnapshotsFromState() {
    return Boolean(
      timelapseState.enabled
      && !activeSharedProjectKey
    );
  }

  function normalizeTimelapseCanvasId(value, fallback = '') {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback.trim();
    }
    return getActiveProjectCanvasDocument()?.id || '';
  }

  function getTimelapseTrack(canvasId = '', { create = false } = {}) {
    const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId);
    if (!resolvedCanvasId) {
      return null;
    }
    const existing = timelapseState.tracksByCanvasId[resolvedCanvasId];
    if (existing) {
      return existing;
    }
    if (!create) {
      return null;
    }
    const track = createEmptyTimelapseTrack();
    timelapseState.tracksByCanvasId[resolvedCanvasId] = track;
    return track;
  }

  function getActiveTimelapseTrack(options = {}) {
    return getTimelapseTrack(getActiveProjectCanvasDocument()?.id || '', options);
  }

  function getAllTimelapseTracks() {
    return timelapseState.tracksByCanvasId;
  }

  function getActiveTimelapseStepCount() {
    return getTimelapseTrackStepCount(getActiveTimelapseTrack());
  }

  function getAllTimelapseStepCount() {
    return Object.values(getAllTimelapseTracks()).reduce((sum, track) => {
      const snapshotCount = (Array.isArray(track?.snapshots) ? track.snapshots.length : 0)
        + (Array.isArray(track?.serializedSnapshots) ? track.serializedSnapshots.length : 0);
      const operationCount = Array.isArray(track?.operationLog?.entries)
        ? track.operationLog.entries.length + (
          track.operationLog.baseSnapshot || track.operationLog.baseSnapshotStored ? 1 : 0
        )
        : 0;
      return sum + (snapshotCount && operationCount
        ? snapshotCount + operationCount
        : Math.max(snapshotCount, operationCount));
    }, 0);
  }

  function getTimelapseTrackStepCount(track = null) {
    const snapshotCount = (Array.isArray(track?.snapshots) ? track.snapshots.length : 0)
      + (Array.isArray(track?.serializedSnapshots) ? track.serializedSnapshots.length : 0);
    const operationCount = Array.isArray(track?.operationLog?.entries)
      ? track.operationLog.entries.length + (
        track.operationLog.baseSnapshot || track.operationLog.baseSnapshotStored ? 1 : 0
      )
      : 0;
    return snapshotCount && operationCount
      ? snapshotCount + operationCount
      : Math.max(snapshotCount, operationCount);
  }

  function createTimelapseBaseSnapshotPayload() {
    try {
      return serializeDocumentSnapshot(makeHistorySnapshot({
        includeUiState: false,
        includeSelection: true,
        clonePixelData: true,
      }));
    } catch (error) {
      console.warn('Failed to create timelapse base snapshot', error);
      return null;
    }
  }

  function ensureTimelapseOperationLogBase(canvasId = getActiveProjectCanvasDocument()?.id || '') {
    if (!shouldRecordLocalTimelapseOperationLog()) {
      return null;
    }
    const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId);
    if (!resolvedCanvasId) {
      return null;
    }
    const track = getTimelapseTrack(resolvedCanvasId, { create: true });
    if (!track) {
      return null;
    }
    if (!track.operationLog || typeof track.operationLog !== 'object') {
      track.operationLog = createEmptyTimelapseOperationLog();
    }
    if (!track.operationLog.baseSnapshot && !track.operationLog.baseSnapshotStored) {
      track.operationLog.baseSnapshot = createTimelapseBaseSnapshotPayload();
    }
    return track.operationLog.baseSnapshot || track.operationLog.baseSnapshotStored
      ? track.operationLog
      : null;
  }

  function scheduleTimelapseOperationLogBase(canvasId = getActiveProjectCanvasDocument()?.id || '') {
    if (!shouldRecordLocalTimelapseOperationLog()) {
      return false;
    }
    const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId);
    const track = getTimelapseTrack(resolvedCanvasId, { create: true });
    if (!track) {
      return false;
    }
    if (track.operationLog?.version === 2) {
      return true;
    }
    // Legacy operation logs still need their stored document base. Do not
    // replace them while they are readable.
    if (track.operationLog?.baseSnapshot || track.operationLog?.baseSnapshotStored) {
      return false;
    }
    const canvasDoc = getProjectCanvasDocumentById(resolvedCanvasId) || getActiveProjectCanvasDocument();
    const frame = Array.isArray(canvasDoc?.frames)
      ? canvasDoc.frames[canvasDoc.activeFrame] || canvasDoc.frames[0]
      : null;
    // A visual delta can only be reconstructed accurately for the simple
    // single-layer frame. Other edits continue through the snapshot recorder.
    if (!frame || !Array.isArray(frame.layers) || frame.layers.length !== 1) {
      return false;
    }
    const base = createTimelapseFrameEntryFromCanvas(canvasDoc);
    if (!base) {
      return false;
    }
    if (!Array.isArray(track.snapshots)) {
      track.snapshots = [];
    }
    const visualBaseSnapshotIndex = (Array.isArray(track.serializedSnapshots) ? track.serializedSnapshots.length : 0)
      + track.snapshots.length;
    track.snapshots.push(base);
    track.operationLog = {
      version: 2,
      visualBaseSnapshotIndex,
      visualBaseFrameId: frame.id || '',
      entries: [],
    };
    return true;
  }

  async function hydrateTimelapseOperationLogBase(canvasId = getActiveProjectCanvasDocument()?.id || '') {
    const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId);
    const track = getTimelapseTrack(resolvedCanvasId);
    const log = track?.operationLog && typeof track.operationLog === 'object'
      ? track.operationLog
      : null;
    if (!track || !log) {
      return null;
    }
    if (log.baseSnapshot) {
      return { track, log, baseSnapshot: log.baseSnapshot, hydrated: false };
    }
    if (!log.baseSnapshotStored || typeof loadPersistedTimelapseBaseSnapshot !== 'function') {
      return null;
    }
    const baseSnapshot = await loadPersistedTimelapseBaseSnapshot(
      log.baseSnapshotStorageCanvasId || resolvedCanvasId,
      log.baseSnapshotStorageProjectId || undefined
    );
    if (
      !baseSnapshot
      || getTimelapseTrack(resolvedCanvasId) !== track
      || track.operationLog !== log
      || log.baseSnapshot
    ) {
      return log.baseSnapshot
        ? { track, log, baseSnapshot: log.baseSnapshot, hydrated: false }
        : null;
    }
    log.baseSnapshot = baseSnapshot;
    return { track, log, baseSnapshot, hydrated: true };
  }

  function releaseHydratedTimelapseOperationLogBase(hydration = null) {
    if (
      hydration?.hydrated !== true
      || !hydration.log?.baseSnapshotStored
      || hydration.log.baseSnapshot !== hydration.baseSnapshot
    ) {
      return false;
    }
    hydration.log.baseSnapshot = null;
    return true;
  }

  function cloneTimelapsePixelPatchValue(value = null) {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const cloneRgba = source => Array.isArray(source) && source.length === 4
      ? [
          clamp(Math.round(Number(source[0]) || 0), 0, 255),
          clamp(Math.round(Number(source[1]) || 0), 0, 255),
          clamp(Math.round(Number(source[2]) || 0), 0, 255),
          clamp(Math.round(Number(source[3]) || 0), 0, 255),
        ]
      : null;
    return {
      paletteIndex: Math.round(Number(value.paletteIndex) || 0),
      direct: cloneRgba(value.direct),
      importSourceDirect: cloneRgba(value.importSourceDirect),
    };
  }

  function createTimelapseOperationEntryFromPixelPatch(entry, historyLabel = '') {
    if (!isPixelPatchHistoryEntry(entry) || !Array.isArray(entry.changes) || !entry.changes.length) {
      return null;
    }
    const changes = entry.changes
      .map(change => ({
        index: Math.max(0, Math.round(Number(change?.index) || 0)),
        after: cloneTimelapsePixelPatchValue(change?.after),
      }))
      .filter(change => change.after);
    if (!changes.length) {
      return null;
    }
    return {
      type: 'pixelPatch',
      at: Date.now(),
      historyLabel: String(historyLabel || entry.historyLabel || ''),
      canvasId: typeof entry.canvasId === 'string' ? entry.canvasId : '',
      frameId: typeof entry.frameId === 'string' ? entry.frameId : '',
      layerId: typeof entry.layerId === 'string' ? entry.layerId : '',
      width: Math.max(1, Math.round(Number(entry.width) || 1)),
      height: Math.max(1, Math.round(Number(entry.height) || 1)),
      changes,
    };
  }

  function createTimelapseOperationKeyframeEntry(historyLabel = '') {
    const snapshot = createTimelapseBaseSnapshotPayload();
    if (!snapshot) {
      return null;
    }
    return {
      type: 'keyframe',
      at: Date.now(),
      historyLabel: String(historyLabel || ''),
      snapshot,
    };
  }

  function compactTimelapsePixelPatchEntries(entries = []) {
    const groups = new Map();
    const visitEntry = entry => {
      if (entry?.type === 'pixelPatchBatch' && Array.isArray(entry.entries)) {
        entry.entries.forEach(visitEntry);
        return;
      }
      if (entry?.type !== 'pixelPatch' || !Array.isArray(entry.changes)) {
        return;
      }
      const key = [entry.canvasId, entry.frameId, entry.layerId, entry.width, entry.height].join('\u0000');
      let group = groups.get(key);
      if (!group) {
        group = {
          type: 'pixelPatch',
          at: Math.max(0, Math.round(Number(entry.at) || 0)),
          historyLabel: 'timelapseCompacted',
          canvasId: entry.canvasId || '',
          frameId: entry.frameId || '',
          layerId: entry.layerId || '',
          width: Math.max(1, Math.round(Number(entry.width) || 1)),
          height: Math.max(1, Math.round(Number(entry.height) || 1)),
          changesByIndex: new Map(),
        };
        groups.set(key, group);
      }
      group.at = Math.max(group.at, Math.max(0, Math.round(Number(entry.at) || 0)));
      entry.changes.forEach(change => {
        if (!change?.after) return;
        const index = Math.max(0, Math.round(Number(change.index) || 0));
        group.changesByIndex.set(index, { index, after: cloneTimelapsePixelPatchValue(change.after) });
      });
    };
    entries.forEach(visitEntry);
    return Array.from(groups.values()).map(group => ({
      type: group.type,
      at: group.at,
      historyLabel: group.historyLabel,
      canvasId: group.canvasId,
      frameId: group.frameId,
      layerId: group.layerId,
      width: group.width,
      height: group.height,
      changes: Array.from(group.changesByIndex.values()),
    })).filter(entry => entry.changes.length);
  }

  function countTimelapseOperationChanges(entries = []) {
    let total = 0;
    const visitEntry = entry => {
      if (entry?.type === 'pixelPatchBatch' && Array.isArray(entry.entries)) {
        entry.entries.forEach(visitEntry);
        return;
      }
      if (entry?.type === 'pixelPatch' && Array.isArray(entry.changes)) {
        total += entry.changes.length;
      }
    };
    entries.forEach(visitEntry);
    return total;
  }

  function checkpointTimelapseOperationLog(track, canvasId = '') {
    const log = track?.operationLog;
    if (!log?.baseSnapshot || !Array.isArray(log.entries) || !log.entries.length) {
      return false;
    }
    const initialSnapshot = deserializeTimelapseBaseSnapshot(log.baseSnapshot);
    const initialFrame = initialSnapshot
      ? createTimelapseFrameEntryFromSnapshotCanvas(initialSnapshot, canvasId)
      : null;
    const currentFrame = createTimelapseFrameEntryFromCanvas(
      getProjectCanvasDocumentById(canvasId) || getActiveProjectCanvasDocument()
    );
    if (!Array.isArray(track.snapshots)) {
      track.snapshots = [];
    }
    const archiveFrames = [];
    [initialFrame, currentFrame].forEach(frame => {
      const last = archiveFrames[archiveFrames.length - 1] || null;
      if (frame && (!last || !areTimelapseFrameEntriesEqual(last, frame))) {
        archiveFrames.push(frame);
      }
    });
    if (archiveFrames.length) {
      track.snapshots = archiveFrames.slice();
      archiveTimelapseSnapshots(canvasId, archiveFrames).then(saved => {
        if (saved && getTimelapseTrack(canvasId) === track) {
          track.snapshots = currentFrame ? [currentFrame] : [];
          updateMemoryStatus();
        }
      });
    }
    const nextBaseSnapshot = createTimelapseBaseSnapshotPayload();
    if (!nextBaseSnapshot) {
      return false;
    }
    log.baseSnapshot = nextBaseSnapshot;
    log.baseSnapshotStored = false;
    log.baseSnapshotStorageCanvasId = '';
    log.baseSnapshotStorageProjectId = '';
    log.entries = [];
    track.sampleStep = Math.max(1, Math.round(Number(track.sampleStep) || 1) * 2);
    track.warningShown = true;
    return true;
  }

  async function checkpointTimelapseOperationLogWithStoredBase(track, canvasId = '') {
    const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId);
    const hydration = await hydrateTimelapseOperationLogBase(resolvedCanvasId);
    if (!hydration || getTimelapseTrack(resolvedCanvasId) !== track) {
      return false;
    }
    const checkpointed = checkpointTimelapseOperationLog(track, resolvedCanvasId);
    if (!checkpointed) {
      releaseHydratedTimelapseOperationLogBase(hydration);
      return false;
    }
    if (typeof archiveTimelapseOperationLogBase === 'function') {
      await archiveTimelapseOperationLogBase(resolvedCanvasId, track.operationLog);
    }
    return true;
  }

  function scheduleTimelapseOperationLogCheckpoint(track, canvasId = '') {
    if (!track || timelapseCheckpointPendingTracks.has(track)) return false;
    timelapseCheckpointPendingTracks.add(track);
    const run = async () => {
      try {
        if (getTimelapseTrack(canvasId) !== track) return;
        if (!await checkpointTimelapseOperationLogWithStoredBase(track, canvasId)) {
          return;
        }
        syncTimelapseControls();
        updateMemoryStatus();
      } catch (error) {
        console.warn('Failed to checkpoint disk-backed timelapse operation log', error);
      } finally {
        timelapseCheckpointPendingTracks.delete(track);
      }
    };
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 1500 });
    } else {
      window.setTimeout(run, 0);
    }
    return true;
  }

  function compactTimelapseOperationLogIfNeeded(track = getActiveTimelapseTrack()) {
    const log = track?.operationLog;
    const entries = Array.isArray(log?.entries) ? log.entries : null;
    const maxEntries = Math.max(20, Math.round(Number(TIMELAPSE_OPERATION_LOG_MAX_ENTRIES) || 240));
    if (!entries) {
      return false;
    }
    const maxChanges = Math.max(1024, Math.round(Number(TIMELAPSE_OPERATION_LOG_MAX_CHANGES) || 32768));
    const initialChangeCount = countTimelapseOperationChanges(entries);
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    if (initialChangeCount > maxChanges * 2) {
      return scheduleTimelapseOperationLogCheckpoint(track, activeCanvasId);
    }
    if (initialChangeCount > maxChanges) {
      scheduleTimelapseOperationLogCheckpoint(track, activeCanvasId);
    }
    if (entries.length <= maxEntries) {
      return false;
    }
    const recentCount = Math.max(10, Math.min(
      maxEntries - 2,
      Math.round(Number(TIMELAPSE_OPERATION_LOG_RECENT_ENTRIES) || Math.floor(maxEntries / 2))
    ));
    const splitIndex = Math.max(1, entries.length - recentCount);
    const olderEntries = entries.slice(0, splitIndex);
    const recentEntries = entries.slice(splitIndex);
    let lastKeyframeIndex = -1;
    olderEntries.forEach((entry, index) => {
      if (entry?.type === 'keyframe' && entry.snapshot) {
        lastKeyframeIndex = index;
      }
    });
    const compacted = [];
    if (lastKeyframeIndex >= 0) {
      compacted.push(olderEntries[lastKeyframeIndex]);
    }
    const patchStartIndex = lastKeyframeIndex >= 0 ? lastKeyframeIndex + 1 : 0;
    const mergedPatches = compactTimelapsePixelPatchEntries(olderEntries.slice(patchStartIndex));
    if (mergedPatches.length) {
      compacted.push({
        type: 'pixelPatchBatch',
        at: mergedPatches.reduce((latest, entry) => Math.max(latest, entry.at), 0),
        historyLabel: 'timelapseCompacted',
        entries: mergedPatches,
      });
    }
    log.entries = [...compacted, ...recentEntries];
    track.sampleStep = Math.max(1, Math.round(Number(track.sampleStep) || 1) * 2);
    track.warningShown = true;
    const changeCount = countTimelapseOperationChanges(log.entries);
    if (changeCount > maxChanges * 2) {
      scheduleTimelapseOperationLogCheckpoint(track, getActiveProjectCanvasDocument()?.id || '');
    } else if (changeCount > maxChanges) {
      scheduleTimelapseOperationLogCheckpoint(track, getActiveProjectCanvasDocument()?.id || '');
    }
    return true;
  }

  function recordTimelapseOperationLogEntry(historyEntry, historyLabel = '') {
    if (!shouldRecordLocalTimelapseOperationLog()) {
      return false;
    }
    const canvasId = isPixelPatchHistoryEntry(historyEntry)
      ? historyEntry.canvasId
      : getActiveProjectCanvasDocument()?.id || '';
    const track = getTimelapseTrack(canvasId, { create: true });
    const log = track?.operationLog;
    if (!log || !Array.isArray(log.entries)) {
      scheduleTimelapseOperationLogBase(canvasId);
      return false;
    }
    if (log.version !== 2) {
      return false;
    }
    // Only small, ordinary strokes are stored as pixel deltas. Flood fills,
    // selection moves, transforms and structure changes use the debounced
    // visible-frame recorder instead of growing a massive patch log.
    if (!isPixelPatchHistoryEntry(historyEntry) || historyEntry.frameId !== log.visualBaseFrameId) {
      return false;
    }
    const entry = createTimelapseOperationEntryFromPixelPatch(historyEntry, historyLabel);
    if (!entry) {
      return false;
    }
    const maxDeltaPixels = 8192;
    if (entry.changes.length > maxDeltaPixels) {
      return false;
    }
    log.entries.push(entry);
    compactTimelapseOperationLogIfNeeded(track);
    syncTimelapseControls();
    updateMemoryStatus();
    return true;
  }

  function reconcileTimelapseTracksForSingleCanvas() {
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    if (!activeCanvasId || getProjectCanvasCount() !== 1) {
      return false;
    }
    const entries = Object.entries(timelapseState.tracksByCanvasId);
    if (!entries.length) {
      return false;
    }
    const currentTrack = timelapseState.tracksByCanvasId[activeCanvasId] || null;
    let bestTrack = null;
    let bestCanvasId = '';
    let bestCount = -1;
    entries.forEach(([canvasId, track]) => {
      const count = getTimelapseTrackStepCount(track);
      if (count > bestCount || (count === bestCount && canvasId === activeCanvasId)) {
        bestCount = count;
        bestTrack = track;
        bestCanvasId = canvasId;
      }
    });
    if (!bestTrack || bestCount <= 0) {
      return false;
    }
    if (bestCanvasId === activeCanvasId && entries.length === 1 && currentTrack === bestTrack) {
      return false;
    }
    timelapseState.tracksByCanvasId = {
      [activeCanvasId]: {
        snapshots: Array.isArray(bestTrack.snapshots) ? bestTrack.snapshots.slice() : [],
        serializedSnapshots: Array.isArray(bestTrack.serializedSnapshots)
          ? bestTrack.serializedSnapshots.slice()
          : [],
        operationLog: bestTrack.operationLog && typeof bestTrack.operationLog === 'object'
          ? (bestTrack.operationLog.version === 2
            ? {
                version: 2,
                visualBaseSnapshotIndex: Math.max(
                  0,
                  Math.round(Number(bestTrack.operationLog.visualBaseSnapshotIndex) || 0)
                ),
                visualBaseFrameId: typeof bestTrack.operationLog.visualBaseFrameId === 'string'
                  ? bestTrack.operationLog.visualBaseFrameId
                  : '',
                entries: Array.isArray(bestTrack.operationLog.entries)
                  ? bestTrack.operationLog.entries
                    .map(entry => normalizeSerializedTimelapseOperationEntry(entry))
                    .filter(Boolean)
                  : [],
              }
            : {
                version: 1,
                baseSnapshot: bestTrack.operationLog.baseSnapshot || null,
                baseSnapshotStored: Boolean(bestTrack.operationLog.baseSnapshotStored),
                baseSnapshotStorageCanvasId: typeof bestTrack.operationLog.baseSnapshotStorageCanvasId === 'string'
                  ? bestTrack.operationLog.baseSnapshotStorageCanvasId
                  : '',
                baseSnapshotStorageProjectId: typeof bestTrack.operationLog.baseSnapshotStorageProjectId === 'string'
                  ? bestTrack.operationLog.baseSnapshotStorageProjectId
                  : '',
                entries: Array.isArray(bestTrack.operationLog.entries)
                  ? bestTrack.operationLog.entries
                    .map(entry => normalizeSerializedTimelapseOperationEntry(entry))
                    .filter(Boolean)
                  : [],
              })
          : null,
        warningShown: Boolean(bestTrack.warningShown),
        sampleStep: Math.max(1, Math.round(Number(bestTrack.sampleStep) || 1)),
        lastCaptureToken: Number.isFinite(Number(bestTrack.lastCaptureToken))
          ? Math.round(Number(bestTrack.lastCaptureToken))
          : -1,
      },
    };
    return true;
  }

  function pruneTimelapseTracksToExistingCanvases() {
    const validCanvasIds = new Set(
      getProjectCanvasDocuments()
        .map(canvas => (typeof canvas?.id === 'string' ? canvas.id : ''))
        .filter(Boolean)
    );
    Object.keys(timelapseState.tracksByCanvasId).forEach(canvasId => {
      if (!validCanvasIds.has(canvasId)) {
        delete timelapseState.tracksByCanvasId[canvasId];
      }
    });
    Array.from(timelapseQueuedCanvasIds).forEach(canvasId => {
      if (!validCanvasIds.has(canvasId)) {
        timelapseQueuedCanvasIds.delete(canvasId);
      }
    });
    Array.from(timelapseQueuedFrameIdsByCanvasId.keys()).forEach(canvasId => {
      if (!validCanvasIds.has(canvasId)) {
        timelapseQueuedFrameIdsByCanvasId.delete(canvasId);
      }
    });
  }

  function createTimelapseFrameEntryFromCanvas(canvasDoc = getActiveProjectCanvasDocument(), frameId = '') {
    const sourceWidth = Math.max(1, Number(canvasDoc?.width) || 1);
    const sourceHeight = Math.max(1, Number(canvasDoc?.height) || 1);
    const frames = Array.isArray(canvasDoc?.frames) ? canvasDoc.frames : [];
    if (!frames.length) {
      return null;
    }
    const requestedFrameIndex = typeof frameId === 'string' && frameId
      ? frames.findIndex(candidate => candidate?.id === frameId)
      : -1;
    const frameIndex = requestedFrameIndex >= 0
      ? requestedFrameIndex
      : clamp(Math.round(Number(canvasDoc?.activeFrame) || 0), 0, frames.length - 1);
    const frame = frames[frameIndex];
    if (!frame) {
      return null;
    }
    // The drawing surface has already been composited for the user. Reuse it
    // instead of re-compositing every layer again on the debounce timer.
    // This path is intentionally limited to the active canvas, so switching
    // documents cannot capture pixels from the wrong surface.
    let sourcePixels = null;
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    if (
      canvasDoc?.id === activeCanvasId
      && frameIndex === Math.round(Number(canvasDoc?.activeFrame) || 0)
      && ctx?.drawing
      && ctx.drawing.canvas?.width === sourceWidth
      && ctx.drawing.canvas?.height === sourceHeight
    ) {
      try {
        sourcePixels = new Uint8ClampedArray(
          ctx.drawing.getImageData(0, 0, sourceWidth, sourceHeight).data
        );
      } catch (error) {
        // Canvas readback can be unavailable on a platform surface. The
        // data-model composite below remains a correct compatibility fallback.
      }
    }
    if (!sourcePixels) {
      sourcePixels = compositeFramePixels(frame, sourceWidth, sourceHeight, state.palette);
    }
    const maxEdge = 512;
    const shrinkFactor = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * shrinkFactor));
    const height = Math.max(1, Math.round(sourceHeight * shrinkFactor));
    let pixels = sourcePixels;
    if (width !== sourceWidth || height !== sourceHeight) {
      pixels = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / height));
        for (let x = 0; x < width; x += 1) {
          const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / width));
          const sourceBase = ((sourceY * sourceWidth) + sourceX) * 4;
          const targetBase = ((y * width) + x) * 4;
          pixels[targetBase] = sourcePixels[sourceBase];
          pixels[targetBase + 1] = sourcePixels[sourceBase + 1];
          pixels[targetBase + 2] = sourcePixels[sourceBase + 2];
          pixels[targetBase + 3] = sourcePixels[sourceBase + 3];
        }
      }
    }
    return {
      width,
      height,
      frameId: typeof frame?.id === 'string' ? frame.id : '',
      // RLE compression is deferred to project serialization. Doing it inside
      // a post-stroke timer blocked drawing for hundreds of milliseconds.
      pixels: pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels),
    };
  }

  function createTimelapseFrameEntryFromState() {
    return createTimelapseFrameEntryFromCanvas(getActiveProjectCanvasDocument());
  }

  function createTimelapseFrameEntryFromSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    let resolved = snapshot;
    const sampleIndices = snapshot?.frames?.[0]?.layers?.[0]?.indices;
    if (!(sampleIndices instanceof Int16Array || sampleIndices instanceof Uint8Array)) {
      try {
        resolved = decompressHistorySnapshot(snapshot);
      } catch (error) {
        return null;
      }
    }
    const width = Math.max(1, Number(resolved.width) || 1);
    const height = Math.max(1, Number(resolved.height) || 1);
    const frames = Array.isArray(resolved.frames) ? resolved.frames : [];
    if (!frames.length) {
      return null;
    }
    const frameIndex = clamp(Math.round(Number(resolved.activeFrame) || 0), 0, frames.length - 1);
    const frame = frames[frameIndex] || frames[0];
    if (!frame) {
      return null;
    }
    const palette = Array.isArray(resolved.palette) ? resolved.palette : state.palette;
    const pixels = compositeFramePixels(frame, width, height, palette);
    return {
      width,
      height,
      pixels: compressUint8Array(pixels, { clamped: true }),
    };
  }

  function thinTimelapseSnapshotsIfNeeded(track = getActiveTimelapseTrack()) {
    const snapshots = Array.isArray(track?.snapshots) ? track.snapshots : null;
    if (!Array.isArray(snapshots) || snapshots.length <= TIMELAPSE_MAX_STEPS) {
      return false;
    }
    for (let index = snapshots.length - 2; index >= 1; index -= 2) {
      snapshots.splice(index, 1);
    }
    track.sampleStep = Math.max(1, Math.round(Number(track.sampleStep) || 1) * 2);
    return true;
  }

  function areTimelapseFrameEntriesEqual(a, b) {
    const resolvedA = resolveTimelapseFrameEntry(a);
    const resolvedB = resolveTimelapseFrameEntry(b);
    if (!resolvedA || !resolvedB) {
      return false;
    }
    if (resolvedA.width !== resolvedB.width || resolvedA.height !== resolvedB.height) {
      return false;
    }
    if (resolvedA.pixels.length !== resolvedB.pixels.length) {
      return false;
    }
    for (let index = 0; index < resolvedA.pixels.length; index += 1) {
      if (resolvedA.pixels[index] !== resolvedB.pixels[index]) {
        return false;
      }
    }
    return true;
  }

  function captureTimelapseFrameFromState(canvasId = getActiveProjectCanvasDocument()?.id || '', frameId = '') {
    if (!shouldCaptureTimelapseSnapshotsFromState()) {
      return false;
    }
    const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId);
    const canvasDoc = getProjectCanvasDocumentById(resolvedCanvasId) || getActiveProjectCanvasDocument();
    const entry = createTimelapseFrameEntryFromCanvas(canvasDoc, frameId);
    if (!entry) {
      return false;
    }
    const track = getTimelapseTrack(resolvedCanvasId, { create: true });
    const lastEntry = Array.isArray(track.snapshots)
      ? [...track.snapshots].reverse().find(candidate => (candidate?.frameId || '') === (entry.frameId || '')) || null
      : null;
    if (lastEntry && areTimelapseFrameEntriesEqual(lastEntry, entry)) {
      track.lastCaptureToken = unsavedChangeToken;
      if (getActiveProjectCanvasDocument()?.id === resolvedCanvasId) {
        syncTimelapseControls();
      }
      return false;
    }
    track.snapshots.push(entry);
    track.lastCaptureToken = unsavedChangeToken;
    const thinned = thinTimelapseSnapshotsIfNeeded(track);
    if (thinned && !track.warningShown) {
      track.warningShown = true;
      updateAutosaveStatus('タイムラプス記録が増えたため自動で間引きしました', 'warn');
    }
    if (getActiveProjectCanvasDocument()?.id === resolvedCanvasId) {
      syncTimelapseControls();
    }
    updateMemoryStatus();
    return true;
  }

  function ensureTimelapseStartCapture(canvasId = getActiveProjectCanvasDocument()?.id || '') {
    if (!timelapseState.enabled) {
      return false;
    }
    if (shouldRecordLocalTimelapseOperationLog()) {
      const track = getTimelapseTrack(canvasId, { create: true });
      if (Array.isArray(track?.snapshots) && track.snapshots.length > 1) {
        const archived = track.snapshots.slice(0, -1);
        archiveTimelapseSnapshots(canvasId, archived).then(saved => {
          if (saved && getTimelapseTrack(canvasId) === track) {
            track.snapshots = track.snapshots.slice(-1);
            updateMemoryStatus();
          }
        });
      }
      const scheduled = scheduleTimelapseOperationLogBase(canvasId);
      syncTimelapseControls();
      return scheduled;
    }
    if (!shouldCaptureTimelapseSnapshotsFromState()) {
      return false;
    }
    const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId);
    if (!resolvedCanvasId) {
      return false;
    }
    const track = getTimelapseTrack(resolvedCanvasId);
    if (track && Array.isArray(track.snapshots) && track.snapshots.length > 0) {
      return false;
    }
    if (track && Array.isArray(track.serializedSnapshots) && track.serializedSnapshots.length > 0) {
      return false;
    }
    return captureTimelapseFrameFromState(resolvedCanvasId);
  }

  function flushPendingTimelapseCapture({ force = false } = {}) {
    if (timelapseCaptureIdleHandle !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(timelapseCaptureIdleHandle);
      timelapseCaptureIdleHandle = null;
    }
    const queuedCanvasIds = Array.from(timelapseQueuedCanvasIds);
    if (timelapseCaptureTimer !== null) {
      window.clearTimeout(timelapseCaptureTimer);
      timelapseCaptureTimer = null;
    }
    if (!queuedCanvasIds.length && !force) {
      return false;
    }
    timelapseQueuedCanvasIds.clear();
    if (!shouldCaptureTimelapseSnapshotsFromState()) {
      return false;
    }
    let captured = false;
    queuedCanvasIds.forEach(canvasId => {
      const frameIds = Array.from(timelapseQueuedFrameIdsByCanvasId.get(canvasId) || []);
      if (!frameIds.length) frameIds.push('');
      frameIds.forEach(frameId => {
        captured = captureTimelapseFrameFromState(canvasId, frameId) || captured;
      });
    });
    timelapseQueuedFrameIdsByCanvasId.clear();
    return captured;
  }

  function scheduleTimelapseCaptureFromState({ immediate = false, canvasId = getActiveProjectCanvasDocument()?.id || '', frameIds = null } = {}) {
    if (!shouldCaptureTimelapseSnapshotsFromState()) {
      return;
    }
    const resolvedCanvasId = normalizeTimelapseCanvasId(canvasId);
    if (!resolvedCanvasId) {
      return;
    }
    timelapseQueuedCanvasIds.add(resolvedCanvasId);
    const queuedFrameIds = timelapseQueuedFrameIdsByCanvasId.get(resolvedCanvasId) || new Set();
    const activeCanvas = getActiveProjectCanvasDocument();
    const requestedFrameIds = Array.isArray(frameIds)
      ? frameIds
      : [activeCanvas?.frames?.[activeCanvas?.activeFrame]?.id || ''];
    requestedFrameIds.forEach(frameId => {
      if (typeof frameId === 'string') queuedFrameIds.add(frameId);
    });
    timelapseQueuedFrameIdsByCanvasId.set(resolvedCanvasId, queuedFrameIds);
    if (immediate) {
      flushPendingTimelapseCapture();
      return;
    }
    if (timelapseCaptureTimer !== null) {
      return;
    }
    timelapseCaptureTimer = window.setTimeout(() => {
      timelapseCaptureTimer = null;
      const run = () => {
        timelapseCaptureIdleHandle = null;
        flushPendingTimelapseCapture();
      };
      if (typeof window.requestIdleCallback === 'function') {
        timelapseCaptureIdleHandle = window.requestIdleCallback(run, { timeout: 2000 });
      } else {
        window.setTimeout(run, 0);
      }
    }, TIMELAPSE_CAPTURE_DEBOUNCE_MS);
  }

  function syncTimelapseControls() {
    const track = getActiveTimelapseTrack();
    const stepCount = getTimelapseTrackStepCount(track);
    const fps = normalizeTimelapseFps(timelapseState.fps);
    const sampleStep = Math.max(1, Math.round(Number(track?.sampleStep) || 1));
    const sampleInfo = sampleStep > 1
      ? localizeText(` / 間引きx${sampleStep}`, ` / thinning x${sampleStep}`)
      : '';
    timelapseState.fps = fps;

    if (dom.controls.toggleTimelapse instanceof HTMLInputElement) {
      dom.controls.toggleTimelapse.checked = Boolean(timelapseState.enabled);
      dom.controls.toggleTimelapse.disabled = true;
    }
    if (dom.controls.timelapseClear instanceof HTMLButtonElement) {
      dom.controls.timelapseClear.disabled = stepCount <= 0;
    }
    if (dom.controls.timelapseFps instanceof HTMLInputElement) {
      dom.controls.timelapseFps.value = String(fps);
    }
    if (dom.controls.timelapseStatus) {
      const status = timelapseState.enabled ? 'ON' : 'OFF';
      dom.controls.timelapseStatus.textContent = localizeText(
        `タイムラプス: ${status} (${stepCount}ステップ / ${fps}fps${sampleInfo})`,
        `Timelapse: ${status} (${stepCount} steps / ${fps}fps${sampleInfo})`
      );
    }
  }

  function clearTimelapseRecording({ silent = false, scope = 'active' } = {}) {
    if (timelapseCaptureIdleHandle !== null && typeof window.cancelIdleCallback === 'function') {
      window.cancelIdleCallback(timelapseCaptureIdleHandle);
      timelapseCaptureIdleHandle = null;
    }
    if (timelapseCaptureTimer !== null) {
      window.clearTimeout(timelapseCaptureTimer);
      timelapseCaptureTimer = null;
    }
    if (scope === 'all') {
      timelapseQueuedCanvasIds.clear();
      timelapseQueuedFrameIdsByCanvasId.clear();
      timelapseState.tracksByCanvasId = Object.create(null);
    } else {
      const activeCanvasId = normalizeTimelapseCanvasId(getActiveProjectCanvasDocument()?.id || '');
      timelapseQueuedCanvasIds.delete(activeCanvasId);
      timelapseQueuedFrameIdsByCanvasId.delete(activeCanvasId);
      const track = getTimelapseTrack(activeCanvasId);
      if (track) {
        track.snapshots.length = 0;
        if (Array.isArray(track.serializedSnapshots)) {
          track.serializedSnapshots.length = 0;
        }
        track.operationLog = null;
        track.warningShown = false;
        track.sampleStep = 1;
        track.lastCaptureToken = -1;
      }
    }
    clearPersistedTimelapseSnapshots();
    syncTimelapseControls();
    if (!silent) {
      updateAutosaveStatus(
        scope === 'all'
          ? 'タイムラプス記録をすべてクリアしました'
          : 'このキャンバスのタイムラプス記録をクリアしました',
        'info'
      );
    }
    updateMemoryStatus();
    if (timelapseState.enabled) {
      ensureTimelapseStartCapture();
    }
  }

  function setTimelapseEnabled(enabled, { persist = true } = {}) {
    const next = true;
    if (timelapseState.enabled === next) {
      syncTimelapseControls();
      return;
    }
    timelapseState.enabled = next;
    if (next) {
      ensureTimelapseStartCapture();
    }
    syncTimelapseControls();
    updateAutosaveStatus(
      'タイムラプス記録は常時ONです',
      'info'
    );
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false });
    }
  }

  function resolveTimelapseFrameEntry(entry) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const width = Math.max(1, Number(entry.width) || 1);
    const height = Math.max(1, Number(entry.height) || 1);
    let pixels;
    try {
      pixels = decodeUint8Data(entry.pixels, { clamped: true });
    } catch (error) {
      return null;
    }
    const expectedLength = width * height * 4;
    if (!pixels || pixels.length !== expectedLength) {
      return null;
    }
    return {
      width,
      height,
      pixels: pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels),
    };
  }

  function getSnapshotCanvasForTimelapse(snapshot = null, canvasId = '') {
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    const normalizedCanvasId = typeof canvasId === 'string' ? canvasId.trim() : '';
    if (Array.isArray(snapshot.canvases) && snapshot.canvases.length) {
      return snapshot.canvases.find(canvas => (
        normalizedCanvasId && typeof canvas?.id === 'string' && canvas.id === normalizedCanvasId
      )) || snapshot.canvases.find(canvas => canvas?.id === snapshot.activeCanvasId) || snapshot.canvases[0] || null;
    }
    return {
      id: typeof snapshot.activeCanvasId === 'string' ? snapshot.activeCanvasId : normalizedCanvasId,
      width: snapshot.width,
      height: snapshot.height,
      frames: snapshot.frames,
      activeFrame: snapshot.activeFrame,
      activeLayer: snapshot.activeLayer,
    };
  }

  function createTimelapseFrameEntryFromSnapshotCanvas(snapshot = null, canvasId = '') {
    const canvas = getSnapshotCanvasForTimelapse(snapshot, canvasId);
    if (!canvas || !Array.isArray(canvas.frames) || !canvas.frames.length) {
      return null;
    }
    const width = Math.max(1, Math.round(Number(canvas.width) || Number(snapshot?.width) || 1));
    const height = Math.max(1, Math.round(Number(canvas.height) || Number(snapshot?.height) || 1));
    const frameIndex = clamp(Math.round(Number(canvas.activeFrame ?? snapshot?.activeFrame) || 0), 0, canvas.frames.length - 1);
    const frame = canvas.frames[frameIndex] || canvas.frames[0];
    if (!frame || !Array.isArray(frame.layers)) {
      return null;
    }
    const palette = Array.isArray(snapshot?.palette) ? snapshot.palette : state.palette;
    const pixels = compositeFramePixels(frame, width, height, palette);
    return {
      width,
      height,
      pixels: compressUint8Array(pixels, { clamped: true }),
    };
  }

  function resolveTimelapsePixelPatchTarget(snapshot = null, entry = null, fallbackCanvasId = '') {
    const canvasId = typeof entry?.canvasId === 'string' && entry.canvasId.trim()
      ? entry.canvasId.trim()
      : fallbackCanvasId;
    const canvas = getSnapshotCanvasForTimelapse(snapshot, canvasId);
    if (!canvas || !Array.isArray(canvas.frames) || !canvas.frames.length) {
      return null;
    }
    const frame = canvas.frames.find(item => (
      typeof entry?.frameId === 'string'
      && entry.frameId
      && item?.id === entry.frameId
    )) || canvas.frames[clamp(Math.round(Number(canvas.activeFrame) || 0), 0, canvas.frames.length - 1)] || canvas.frames[0];
    const layer = Array.isArray(frame?.layers)
      ? frame.layers.find(item => typeof entry?.layerId === 'string' && item?.id === entry.layerId) || null
      : null;
    if (!layer || !(layer.indices instanceof Int16Array || layer.indices instanceof Uint8Array)) {
      return null;
    }
    const width = Math.max(1, Math.round(Number(canvas.width) || Number(entry?.width) || 1));
    const height = Math.max(1, Math.round(Number(canvas.height) || Number(entry?.height) || 1));
    return { canvas, frame, layer, width, height };
  }

  function applyTimelapsePixelPatchEntry(snapshot = null, entry = null, fallbackCanvasId = '') {
    const target = resolveTimelapsePixelPatchTarget(snapshot, entry, fallbackCanvasId);
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    if (!target || !changes.length) {
      return false;
    }
    let applied = false;
    changes.forEach(change => {
      if (!change?.after) {
        return;
      }
      applied = writeLayerPixelPatchValue(
        target.layer,
        change.index,
        change.after,
        target.width,
        target.height
      ) || applied;
    });
    return applied;
  }

  function deserializeTimelapseBaseSnapshot(payload = null) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    try {
      return deserializeDocumentPayload(payload);
    } catch (error) {
      return null;
    }
  }

  function buildTimelapseExportEntriesFromOperationLog(canvasId = getActiveProjectCanvasDocument()?.id || '') {
    const track = getTimelapseTrack(canvasId);
    const log = track?.operationLog && typeof track.operationLog === 'object' ? track.operationLog : null;
    if (log?.version === 2 && Array.isArray(log.entries)) {
      const baseIndex = Math.max(0, Math.round(Number(log.visualBaseSnapshotIndex) || 0));
      const visualFrames = [
        ...(Array.isArray(track?.serializedSnapshots) ? track.serializedSnapshots : []),
        ...(Array.isArray(track?.snapshots) ? track.snapshots : []),
      ];
      const base = resolveTimelapseFrameEntry(visualFrames[baseIndex]);
      if (!base) return [];
      const workingPixels = new Uint8ClampedArray(base.pixels);
      const snapshots = [{ width: base.width, height: base.height, pixels: new Uint8ClampedArray(workingPixels) }];
      const palette = Array.isArray(state.palette) ? state.palette : [];
      log.entries.forEach(entry => {
        if (entry?.type !== 'pixelPatch' || !Array.isArray(entry.changes)) return;
        let changed = false;
        entry.changes.forEach(change => {
          const pixelIndex = Math.max(0, Math.round(Number(change?.index) || 0));
          const baseOffset = pixelIndex * 4;
          if (baseOffset + 3 >= workingPixels.length || !change?.after) return;
          const direct = Array.isArray(change.after.direct) ? change.after.direct : null;
          const color = direct || palette[Math.round(Number(change.after.paletteIndex) || 0)] || null;
          if (!color) return;
          workingPixels[baseOffset] = color[0] ?? color.r ?? 0;
          workingPixels[baseOffset + 1] = color[1] ?? color.g ?? 0;
          workingPixels[baseOffset + 2] = color[2] ?? color.b ?? 0;
          workingPixels[baseOffset + 3] = color[3] ?? color.a ?? 0;
          changed = true;
        });
        if (changed) snapshots.push({ width: base.width, height: base.height, pixels: new Uint8ClampedArray(workingPixels) });
      });
      return snapshots;
    }
    if (!log?.baseSnapshot || !Array.isArray(log.entries)) {
      return [];
    }
    let workingSnapshot = deserializeTimelapseBaseSnapshot(log.baseSnapshot);
    if (!workingSnapshot) {
      return [];
    }
    const snapshots = [];
    const pushCurrent = () => {
      const entry = createTimelapseFrameEntryFromSnapshotCanvas(workingSnapshot, canvasId);
      const last = snapshots[snapshots.length - 1] || null;
      if (entry && (!last || !areTimelapseFrameEntriesEqual(last, entry))) {
        snapshots.push(entry);
      }
    };
    pushCurrent();
    log.entries.forEach(entry => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      if (entry.type === 'keyframe') {
        const nextSnapshot = deserializeTimelapseBaseSnapshot(entry.snapshot);
        if (nextSnapshot) {
          workingSnapshot = nextSnapshot;
          pushCurrent();
        }
        return;
      }
      if (entry.type === 'pixelPatchBatch' && Array.isArray(entry.entries)) {
        let applied = false;
        entry.entries.forEach(patchEntry => {
          applied = applyTimelapsePixelPatchEntry(workingSnapshot, patchEntry, canvasId) || applied;
        });
        if (applied) {
          pushCurrent();
        }
        return;
      }
      if (entry.type === 'pixelPatch' && applyTimelapsePixelPatchEntry(workingSnapshot, entry, canvasId)) {
        pushCurrent();
      }
    });
    return snapshots;
  }

  function deserializeSharedTimelapseBaseSnapshotPayload(payload = null) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    try {
      const parsed = snapshotFromParsedDocumentValue(payload);
      if (parsed?.snapshot) {
        return parsed.snapshot;
      }
    } catch (error) {
      // Fall through to plain document payload parsing.
    }
    return deserializeTimelapseBaseSnapshot(payload);
  }

  async function fetchSharedProjectOpsForTimelapse(projectKey = activeSharedProjectKey) {
    const normalizedProjectKey = normalizeMultiProjectKey(projectKey || '');
    if (!normalizedProjectKey) {
      return [];
    }
    const allOps = [];
    let afterRevision = 0;
    const batchSize = 1000;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const ops = await fetchSharedProjectOpsSince(normalizedProjectKey, afterRevision, batchSize);
      if (!Array.isArray(ops) || !ops.length) {
        break;
      }
      ops.sort((left, right) => getSharedProjectOpSeq(left) - getSharedProjectOpSeq(right));
      ops.forEach(op => {
        const seq = getSharedProjectOpSeq(op);
        if (seq > afterRevision) {
          allOps.push(op);
          afterRevision = seq;
        }
      });
      if (ops.length < batchSize) {
        break;
      }
    }
    return allOps;
  }

  function resolveSharedTimelapsePatchTarget(snapshot = null, payload = null, fallbackCanvasId = '') {
    const canvasId = typeof payload?.canvasId === 'string' && payload.canvasId.trim()
      ? payload.canvasId.trim()
      : fallbackCanvasId;
    const canvas = getSnapshotCanvasForTimelapse(snapshot, canvasId);
    if (!canvas || !Array.isArray(canvas.frames) || !canvas.frames.length) {
      return null;
    }
    const frameIndex = clamp(
      Math.round(Number(payload?.frameIndex ?? canvas.activeFrame) || 0),
      0,
      canvas.frames.length - 1
    );
    const frame = canvas.frames[frameIndex] || canvas.frames[0];
    const layerId = typeof payload?.layerId === 'string' ? payload.layerId.trim() : '';
    const layer = Array.isArray(frame?.layers)
      ? frame.layers.find(item => item?.id === layerId) || null
      : null;
    if (!layer) {
      return null;
    }
    canvas.activeFrame = frameIndex;
    const width = Math.max(1, Math.round(Number(canvas.width) || Number(snapshot?.width) || 1));
    const height = Math.max(1, Math.round(Number(canvas.height) || Number(snapshot?.height) || 1));
    return { canvas, frame, layer, width, height };
  }

  function applySharedTimelapseOpToSnapshot(snapshot = null, opRecord = null, fallbackCanvasId = '') {
    const payload = extractSharedProjectOpPayload(opRecord);
    if (!snapshot || !payload || typeof payload !== 'object') {
      return false;
    }
    if (Array.isArray(payload.palette) && payload.palette.length) {
      snapshot.palette = payload.palette
        .slice(0, MAX_IMPORTED_PALETTE_COLORS)
        .map(color => normalizeColorValue(color));
    }
    if (!payload.patch || typeof payload.patch !== 'object') {
      return false;
    }
    const target = resolveSharedTimelapsePatchTarget(snapshot, payload, fallbackCanvasId);
    const pixelCount = Math.max(0, Math.round(Number(payload.pixelCount) || 0));
    if (!target || !pixelCount) {
      return false;
    }
    return Boolean(applyLayerPatchPayloadToLayer(target.layer, payload.patch, pixelCount, {
      width: target.width,
      height: target.height,
    }));
  }

  async function buildSharedProjectTimelapseExportEntries(canvasId = getActiveProjectCanvasDocument()?.id || '') {
    const projectKey = normalizeMultiProjectKey(activeSharedProjectKey || '');
    if (!projectKey) {
      return [];
    }
    const ops = await fetchSharedProjectOpsForTimelapse(projectKey);
    if (!ops.length) {
      return [];
    }
    let basePayload = null;
    for (let index = 0; index < ops.length; index += 1) {
      const payload = extractSharedProjectOpPayload(ops[index]);
      if (payload?.timelapseBaseSnapshot && typeof payload.timelapseBaseSnapshot === 'object') {
        basePayload = payload.timelapseBaseSnapshot;
        break;
      }
    }
    if (!basePayload) {
      return [];
    }
    let workingSnapshot = deserializeSharedTimelapseBaseSnapshotPayload(basePayload);
    if (!workingSnapshot) {
      return [];
    }
    const snapshots = [];
    const pushCurrent = () => {
      const entry = createTimelapseFrameEntryFromSnapshotCanvas(workingSnapshot, canvasId);
      const last = snapshots[snapshots.length - 1] || null;
      if (entry && (!last || !areTimelapseFrameEntriesEqual(last, entry))) {
        snapshots.push(entry);
      }
    };
    pushCurrent();
    ops.forEach(op => {
      const payload = extractSharedProjectOpPayload(op);
      if (payload?.timelapseBaseSnapshot) {
        return;
      }
      if (applySharedTimelapseOpToSnapshot(workingSnapshot, op, canvasId)) {
        pushCurrent();
      }
    });
    return snapshots;
  }

  function appendCurrentTimelapseStateEntry(entries = []) {
    if (!Array.isArray(entries) || !timelapseState.enabled) {
      return false;
    }
    const current = createTimelapseFrameEntryFromState();
    const last = entries[entries.length - 1] || null;
    if (!current || (last && areTimelapseFrameEntriesEqual(last, current))) {
      return false;
    }
    entries.push(current);
    return true;
  }

  function getTimelapseGifBackground() {
    if (state?.backgroundMode === 'light') {
      return { r: 246, g: 248, b: 252 };
    }
    if (state?.backgroundMode === 'pink') {
      return { r: 255, g: 235, b: 244 };
    }
    return { r: 19, g: 24, b: 34 };
  }

  function flattenTimelapseGifFramesForPlayback(framePixels = []) {
    const background = getTimelapseGifBackground();
    return Array.isArray(framePixels)
      ? framePixels.map(source => {
          const pixels = new Uint8ClampedArray(source || 0);
          for (let index = 0; index < pixels.length; index += 4) {
            const alpha = pixels[index + 3] / 255;
            if (alpha >= 1) {
              continue;
            }
            const inverseAlpha = 1 - alpha;
            pixels[index] = Math.round((pixels[index] * alpha) + (background.r * inverseAlpha));
            pixels[index + 1] = Math.round((pixels[index + 1] * alpha) + (background.g * inverseAlpha));
            pixels[index + 2] = Math.round((pixels[index + 2] * alpha) + (background.b * inverseAlpha));
            pixels[index + 3] = 255;
          }
          return pixels;
        })
      : [];
  }

  async function buildTimelapseExportEntries() {
    if (activeSharedProjectKey) {
      const sharedSnapshots = await buildSharedProjectTimelapseExportEntries(
        getActiveProjectCanvasDocument()?.id || ''
      );
      if (sharedSnapshots.length) {
        appendCurrentTimelapseStateEntry(sharedSnapshots);
        return sharedSnapshots;
      }
    }
    flushPendingTimelapseCapture();
    const activeCanvasId = normalizeTimelapseCanvasId(getActiveProjectCanvasDocument()?.id || '');
    const track = getTimelapseTrack(activeCanvasId);
    const persistedByCanvas = await loadPersistedTimelapseSnapshots();
    const archivedSnapshots = Array.isArray(persistedByCanvas?.[activeCanvasId])
      ? persistedByCanvas[activeCanvasId].slice()
      : [];
    if (Array.isArray(track?.serializedSnapshots)) {
      track.serializedSnapshots.forEach(entry => {
        const last = archivedSnapshots[archivedSnapshots.length - 1] || null;
        if (!last || !areTimelapseFrameEntriesEqual(last, entry)) {
          archivedSnapshots.push(entry);
        }
      });
    }
    if (Array.isArray(track?.snapshots)) {
      track.snapshots.forEach(entry => {
        const last = archivedSnapshots[archivedSnapshots.length - 1] || null;
        if (!last || !areTimelapseFrameEntriesEqual(last, entry)) {
          archivedSnapshots.push(entry);
        }
      });
    }
    const operationLogHydration = await hydrateTimelapseOperationLogBase(activeCanvasId);
    let operationLogSnapshots = [];
    try {
      operationLogSnapshots = buildTimelapseExportEntriesFromOperationLog(activeCanvasId);
    } finally {
      releaseHydratedTimelapseOperationLogBase(operationLogHydration);
    }
    if (operationLogSnapshots.length) {
      operationLogSnapshots.forEach(entry => {
        const last = archivedSnapshots[archivedSnapshots.length - 1] || null;
        if (!last || !areTimelapseFrameEntriesEqual(last, entry)) {
          archivedSnapshots.push(entry);
        }
      });
      // An operation log can be compacted or have its most recent commit still
      // pending when export is requested. Always close the GIF with the live
      // canvas state instead of returning the last reconstructed log entry.
      appendCurrentTimelapseStateEntry(archivedSnapshots);
      return archivedSnapshots;
    }
    const snapshots = archivedSnapshots;
    appendCurrentTimelapseStateEntry(snapshots);
    return snapshots;
  }

  async function exportTimelapseGif() {
    if (!ensureCurrentClientCanExportProject({ announce: true, format: 'timelapse' })) {
      return;
    }
    const snapshots = await buildTimelapseExportEntries();
    if (!snapshots.length) {
      updateAutosaveStatus('タイムラプス記録がありません。設定でONにして描画してください。', 'warn');
      return;
    }

    try {
      updateAutosaveStatus('タイムラプスGIFを書き出し中…', 'info');
      const candidates = getExportScaleCandidates(undefined, { allowFullScan: true });
      const selectedScale = applyExportScaleConstraints(candidates);
      syncExportScaleInputs();
      const targetWidth = Math.max(1, Number(state.width) || 1);
      const targetHeight = Math.max(1, Number(state.height) || 1);
      const framePixels = [];
      let skippedSizeMismatch = 0;
      let skippedInvalid = 0;

      for (let i = 0; i < snapshots.length; i += 1) {
        const resolved = resolveTimelapseFrameEntry(snapshots[i]);
        if (!resolved) {
          skippedInvalid += 1;
          continue;
        }
        const width = resolved.width;
        const height = resolved.height;
        if (width !== targetWidth || height !== targetHeight) {
          skippedSizeMismatch += 1;
          continue;
        }
        framePixels.push(resolved.pixels);
      }

      if (!framePixels.length) {
        updateAutosaveStatus('タイムラプスGIFを書き出せませんでした', 'error');
        return;
      }

      const fps = normalizeTimelapseFps(timelapseState.fps);
      timelapseState.fps = fps;
      const frameDuration = clamp(Math.round(1000 / fps), 16, 2000);
      const frameDurations = new Array(framePixels.length).fill(frameDuration);
      const timelapseFrameSet = appendColorSpriteAreaToFrameSet({
        framePixels,
        frameDurations,
        width: targetWidth,
        height: targetHeight,
        frameCount: framePixels.length,
        isVoxelComposite: false,
      }, 'timelapse');
      const scaledSet = scaleFrameSetNearestNeighbor(
        timelapseFrameSet.framePixels,
        timelapseFrameSet.width,
        timelapseFrameSet.height,
        selectedScale
      );
      // GIF transparency does not reliably clear pixels from a previous frame
      // in browser players. Timelapse frames are therefore flattened against
      // the current editor background, so erasing is replayed correctly.
      const gifFramePixels = flattenTimelapseGifFramesForPlayback(scaledSet.framePixels);
      const gifBytes = buildGifFromPixels(
        gifFramePixels,
        frameDurations,
        scaledSet.width,
        scaledSet.height
      );
      const tasks = [{
        blob: new Blob([gifBytes], { type: 'image/gif' }),
        filename: createExportFileName('gif', selectedScale > 1 ? `timelapse_x${selectedScale}` : 'timelapse'),
        shareText: `タイムラプスGIFを書き出しました (${framePixels.length}ステップ${selectedScale > 1 ? ` / ×${selectedScale}` : ''})`,
      }];
      const result = await deliverExportTasks(tasks, {
        mimeType: 'image/gif',
        fileExtensions: ['.gif'],
        shareTitle: state.documentName || 'PiXiEEDraw',
        shareText: 'タイムラプスGIFを書き出しました',
        mode: 'timelapse',
        includeProjectCompanion: shouldSaveProjectCompanion('timelapse'),
        archiveSuffix: 'timelapse',
        archiveShareText: shouldSaveProjectCompanion('timelapse')
          ? 'タイムラプスGIFと .pxd を ZIP で書き出しました'
          : 'タイムラプスGIF一式をZIPで書き出しました',
      });

      const detailParts = [`${framePixels.length}ステップ`];
      if (selectedScale > 1) {
        detailParts.push(`×${selectedScale}`);
      }
      if (timelapseFrameSet.colorSpriteCount > 0) {
        detailParts.push(`カラースプライト ${timelapseFrameSet.usedColorCount}色`);
      }
      const skipped = skippedSizeMismatch + skippedInvalid;
      if (skipped > 0) {
        detailParts.push(`除外 ${skipped}`);
      }
      const detail = detailParts.join(' / ');
      if (result.exportedCount === result.total) {
        updateAutosaveStatus(`タイムラプスGIFを書き出しました (${detail})`, 'success');
      } else if (result.wasCancelled) {
        updateAutosaveStatus('タイムラプスGIFの書き出しをキャンセルしました', 'warn');
      } else if (result.exportedCount > 0 && result.hadFailure) {
        updateAutosaveStatus('タイムラプスGIFを書き出しましたが一部失敗しました', 'warn');
      } else {
        updateAutosaveStatus('タイムラプスGIFの書き出しに失敗しました', 'error');
      }
      if (result.exportedCount > 0) {
        markDocumentDurablySaved();
        if (result.exportedCount === result.total && !result.wasCancelled && !result.hadFailure) {
          const companionResult = shouldSaveProjectCompanion('timelapse')
            ? 'saved'
            : await maybeSaveProjectCompanionAfterExport('timelapse', {
              exportedCount: result.exportedCount,
              wasCancelled: result.wasCancelled,
            });
          announceProjectCompanionSaveResult('timelapse', companionResult);
        }
        showLoginPromptAfterExport();
      }
      syncTimelapseControls();
    } catch (error) {
      console.error('Timelapse export failed', error);
      updateAutosaveStatus('タイムラプスGIFの書き出しに失敗しました', 'error');
    }
  }

  function updateAnimationFpsDisplay(fps, durationMs) {
    if (dom.controls.animationFps) {
      dom.controls.animationFps.value = String(fps);
    }
    if (dom.controls.animationFpsMs) {
      const rounded = Math.max(1, Math.round(Number(durationMs) || 0));
      dom.controls.animationFpsMs.textContent = `${rounded}ms`;
    }
  }

  function syncAnimationFpsDisplayFromState() {
    const frame = getActiveFrame();
    const duration = frame && Number.isFinite(frame.duration) && frame.duration > 0
      ? frame.duration
      : 1000 / 12;
    const fps = normalizeFpsValue(Math.round(1000 / duration));
    updateAnimationFpsDisplay(fps, duration);
  }


  return Object.freeze({
    shouldRecordLocalTimelapseOperationLog,
    shouldCaptureTimelapseSnapshotsFromState,
    normalizeTimelapseCanvasId,
    getTimelapseTrack,
    getActiveTimelapseTrack,
    getAllTimelapseTracks,
    getActiveTimelapseStepCount,
    getAllTimelapseStepCount,
    getTimelapseTrackStepCount,
    createTimelapseBaseSnapshotPayload,
    ensureTimelapseOperationLogBase,
    hydrateTimelapseOperationLogBase,
    releaseHydratedTimelapseOperationLogBase,
    cloneTimelapsePixelPatchValue,
    createTimelapseOperationEntryFromPixelPatch,
    createTimelapseOperationKeyframeEntry,
    recordTimelapseOperationLogEntry,
    scheduleTimelapseOperationLogBase,
    reconcileTimelapseTracksForSingleCanvas,
    pruneTimelapseTracksToExistingCanvases,
    createTimelapseFrameEntryFromCanvas,
    createTimelapseFrameEntryFromState,
    createTimelapseFrameEntryFromSnapshot,
    thinTimelapseSnapshotsIfNeeded,
    areTimelapseFrameEntriesEqual,
    captureTimelapseFrameFromState,
    ensureTimelapseStartCapture,
    flushPendingTimelapseCapture,
    scheduleTimelapseCaptureFromState,
    syncTimelapseControls,
    clearTimelapseRecording,
    setTimelapseEnabled,
    resolveTimelapseFrameEntry,
    getSnapshotCanvasForTimelapse,
    createTimelapseFrameEntryFromSnapshotCanvas,
    resolveTimelapsePixelPatchTarget,
    applyTimelapsePixelPatchEntry,
    deserializeTimelapseBaseSnapshot,
    buildTimelapseExportEntriesFromOperationLog,
    deserializeSharedTimelapseBaseSnapshotPayload,
    fetchSharedProjectOpsForTimelapse,
    resolveSharedTimelapsePatchTarget,
    applySharedTimelapseOpToSnapshot,
    buildSharedProjectTimelapseExportEntries,
    appendCurrentTimelapseStateEntry,
    flattenTimelapseGifFramesForPlayback,
    buildTimelapseExportEntries,
    exportTimelapseGif,
    updateAnimationFpsDisplay,
    syncAnimationFpsDisplayFromState,
  });
      }
    })(scope);
  }

  root.timelapseSessionUtils = Object.freeze({
    createTimelapseSessionUtils,
  });
})();
