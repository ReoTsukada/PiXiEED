(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createHistoryCoreWorkflowUtils(rawScope = {}) {
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
  let timelapseOperationStore = null;
  const timelapseBaselineCapturedProjectIds = new Set();

  function getTimelapseOperationStore() {
    if (timelapseOperationStore) return timelapseOperationStore;
    timelapseOperationStore = window.PiXiEEDrawModules?.timelapseOperationStore
      ?.createTimelapseOperationStore?.() || null;
    return timelapseOperationStore;
  }

  function getTimelapseOperationProjectId() {
    const existingProjectId = normalizeAutosaveProjectId?.(autosaveProjectId || '') || '';
    if (existingProjectId) return existingProjectId;
    // A new local project may receive its autosave ID only after the first
    // edit. Timelapse durability starts at that edit, so allocate the same
    // project ID synchronously instead of dropping its first operation.
    const createdProjectId = normalizeAutosaveProjectId?.(createAutosaveProjectId?.() || '') || '';
    if (createdProjectId) autosaveProjectId = createdProjectId;
    return createdProjectId;
  }

  function captureTimelapseBaselineSnapshot() {
    const projectId = getTimelapseOperationProjectId();
    if (!projectId || timelapseBaselineCapturedProjectIds.has(projectId)) return null;
    // A baseline is the sole full snapshot needed for a replay segment. It is
    // captured before the first committed operation, never for every stroke.
    return typeof makeHistorySnapshot === 'function'
      ? makeHistorySnapshot({ includeUiState: false, includeSelection: false, clonePixelData: true })
      : null;
  }

  function recordTimelapseHistoryEntry(entry, label, baselineSnapshot = null) {
    const projectId = getTimelapseOperationProjectId();
    if (!projectId || !entry) return;
    const store = getTimelapseOperationStore();
    if (baselineSnapshot && !timelapseBaselineCapturedProjectIds.has(projectId)) {
      // Queue before the event so a normal reload cannot observe an operation
      // without the replay segment's initial state.
      store?.queueBaseline?.(projectId, baselineSnapshot);
      timelapseBaselineCapturedProjectIds.add(projectId);
    }
    const checkpointSnapshot = entry?.__historyEntryType !== 'pixel-patch'
      && typeof makeHistorySnapshot === 'function'
      ? makeHistorySnapshot({ includeUiState: false, includeSelection: false, clonePixelData: true })
      : null;
    store?.queueOperation?.(projectId, entry, label, checkpointSnapshot);
  }

  function setTimelapseHistoryEntryState(entry, stateName) {
    const projectId = getTimelapseOperationProjectId();
    if (!projectId || !entry?.timelapseOperationId) return;
    getTimelapseOperationStore()?.queueState?.(projectId, entry, stateName);
  }

  function synchronizeTimelapseHistoryStates() {
    (history.past || []).forEach(entry => setTimelapseHistoryEntryState(entry, 'active'));
    (history.future || []).forEach(entry => setTimelapseHistoryEntryState(entry, 'undone'));
  }

function markHistoryDirty() {
    if (isVoxelExtensionModeEnabled()) {
      setVoxelPreviewOrientationForFrameIndex(
        state.activeFrame,
        voxelExtensionState.previewYawDeg,
        voxelExtensionState.previewPitchDeg
      );
    }
    if (history.pending?.dirty) {
      return;
    }
    invalidateFillPreviewCache();
    invalidateOnionSkinCache();
    clearPlaybackFrameCache();
    markAutosaveDirty();
    markDocumentUnsavedChange();
    if (history.pending) {
      history.pending.dirty = true;
    }
  }

function beginPaletteStateHistory(label) {
    if (!PALETTE_STATE_HISTORY_LABELS.has(label)) {
      return false;
    }
    history.pending = {
      __historyEntryType: 'palette-state',
      dirty: false,
      label,
      before: capturePaletteHistoryState(),
    };
    return true;
  }

  const TIMELINE_VISUAL_HISTORY_LABELS = new Set([
    'setLayerVisibility',
    'setLayerOpacity',
    'setLayerBlendMode',
    'setFrameFps',
    'setAllFrameFps',
  ]);

  function isTimelineVisualHistoryEntry(entry) {
    return Boolean(entry && entry.__historyEntryType === 'timeline-visual-state');
  }

  function captureTimelineVisualHistoryState(label, context = null) {
    const frames = Array.isArray(state.frames) ? state.frames : [];
    if (label === 'setFrameFps' || label === 'setAllFrameFps') {
      return {
        kind: 'frame-duration',
        frames: frames.map(frame => ({
          frameId: typeof frame?.id === 'string' ? frame.id : '',
          duration: Math.max(1, Number(frame?.duration) || 1),
        })),
      };
    }
    const activeFrame = frames[Math.max(0, Math.round(Number(state.activeFrame) || 0))];
    const activeLayer = activeFrame?.layers?.find(layer => layer?.id === state.activeLayer) || null;
    const explicitTrackId = typeof context?.trackId === 'string' ? context.trackId : '';
    const trackId = explicitTrackId || (typeof activeLayer?.trackId === 'string' ? activeLayer.trackId : '');
    if (!trackId) {
      return null;
    }
    return {
      kind: 'layer-track',
      property: label === 'setLayerOpacity'
        ? 'opacity'
        : (label === 'setLayerBlendMode' ? 'blendMode' : 'visible'),
      trackId,
      layers: frames.flatMap(frame => {
        const layer = Array.isArray(frame?.layers)
          ? frame.layers.find(candidate => candidate?.trackId === trackId)
          : null;
        return layer ? [{
          frameId: typeof frame?.id === 'string' ? frame.id : '',
          layerId: typeof layer.id === 'string' ? layer.id : '',
          // Layer rows can be overridden by per-project display preferences.
          // Capture the displayed value, not only the underlying layer field,
          // otherwise Undo restores the same visible state after a toggle.
          visible: getDisplayedLayerVisibility(layer, true),
          opacity: getDisplayedLayerPreviewOpacity(layer, 1),
          blendMode: normalizeLayerBlendMode(layer.blendMode),
        }] : [];
      }),
    };
  }

  function beginTimelineVisualHistory(label, context = null) {
    if (!TIMELINE_VISUAL_HISTORY_LABELS.has(label)) {
      return false;
    }
    const before = captureTimelineVisualHistoryState(label, context);
    if (!before) {
      return false;
    }
    history.pending = {
      __historyEntryType: 'timeline-visual-state',
      dirty: false,
      label,
      context: context && typeof context === 'object' ? { ...context } : null,
      before,
    };
    return true;
  }

function isPaletteStateHistoryEntry(entry) {
    return Boolean(entry && entry.__historyEntryType === 'palette-state');
  }

  function finalizeTimelineVisualHistoryEntry(pending) {
    if (!isTimelineVisualHistoryEntry(pending) || !pending.dirty || !pending.before) {
      return null;
    }
    const after = captureTimelineVisualHistoryState(pending.label, pending.context);
    if (!after) {
      return null;
    }
    return {
      __historyEntryType: 'timeline-visual-state',
      version: 1,
      historyLabel: pending.label,
      before: pending.before,
      after,
    };
  }

  function applyTimelineVisualHistoryEntry(entry, direction = 'undo') {
    if (!isTimelineVisualHistoryEntry(entry)) {
      return false;
    }
    const source = direction === 'redo' ? entry.after : entry.before;
    if (!source || !Array.isArray(state.frames)) {
      return false;
    }
    let changed = false;
    if (source.kind === 'frame-duration' && Array.isArray(source.frames)) {
      const durationsByFrameId = new Map(source.frames.map(item => [item?.frameId, item]));
      state.frames.forEach(frame => {
        const item = durationsByFrameId.get(frame?.id);
        if (!item) return;
        const duration = Math.max(1, Number(item.duration) || 1);
        if (Math.abs((Number(frame.duration) || 1) - duration) > 0.001) {
          frame.duration = duration;
          changed = true;
        }
      });
    } else if (source.kind === 'layer-track' && Array.isArray(source.layers)) {
      const layersByFrameId = new Map(source.layers.map(item => [item?.frameId, item]));
      state.frames.forEach(frame => {
        const item = layersByFrameId.get(frame?.id);
        if (!item || !Array.isArray(frame?.layers)) return;
        const layer = frame.layers.find(candidate => candidate?.id === item.layerId)
          || frame.layers.find(candidate => candidate?.trackId === source.trackId);
        if (!layer) return;
        if (source.property === 'opacity') {
          const opacity = normalizeLayerOpacity(item.opacity);
          if (Math.abs(getDisplayedLayerPreviewOpacity(layer, 1) - opacity) > 0.0001) {
            layer.opacity = opacity;
            rememberLocalLayerPreviewOpacity(layer.id, opacity);
            changed = true;
          }
          return;
        }
        if (source.property === 'blendMode') {
          const blendMode = normalizeLayerBlendMode(item.blendMode);
          if (normalizeLayerBlendMode(layer.blendMode) !== blendMode) {
            layer.blendMode = blendMode;
            changed = true;
          }
          return;
        }
        const visible = item.visible !== false;
        if (getDisplayedLayerVisibility(layer, true) !== visible) {
          layer.visible = visible;
          rememberLocalLayerVisibility(layer.id, visible);
          changed = true;
        }
      });
    }
    if (!changed) {
      // A valid history entry can already match its target after a local UI
      // preference sync. It still belongs on the opposite stack.
      return true;
    }
    clearPlaybackFrameCache();
    syncAnimationFpsDisplayFromState();
    syncActiveLayerSettingsUI();
    renderLayerList();
    renderTimelineMatrix();
    renderAllProjectCanvasSurfaces();
    requestRender();
    requestOverlayRender();
    return true;
  }

  const PALETTE_STATE_HISTORY_LABELS = new Set([
    'paletteColor',
    'paletteAdd',
    'paletteRemove',
    'paletteReorder',
    'paletteApplyPreset',
    'paletteImport',
  ]);

  function capturePaletteHistoryState() {
    const palette = Array.isArray(state.palette)
      ? state.palette.map(color => normalizeColorValue(color))
      : [];
    const fallbackIndex = palette.length ? 0 : -1;
    const activePaletteIndex = normalizePaletteIndex(state.activePaletteIndex, fallbackIndex);
    return {
      palette,
      activePaletteIndex,
      secondaryPaletteIndex: normalizePaletteIndex(state.secondaryPaletteIndex, activePaletteIndex),
      activeRgb: normalizeColorValue(state.activeRgb || palette[activePaletteIndex] || { r: 0, g: 0, b: 0, a: 255 }),
    };
  }

  function finalizePaletteStateHistoryEntry(pending) {
    if (!isPaletteStateHistoryEntry(pending) || !pending.dirty || !pending.before) {
      return null;
    }
    return {
      __historyEntryType: 'palette-state',
      version: 1,
      historyLabel: pending.label,
      before: pending.before,
      after: capturePaletteHistoryState(),
    };
  }

  function applyPaletteStateHistoryEntry(entry, direction = 'undo') {
    if (!isPaletteStateHistoryEntry(entry)) {
      return false;
    }
    const source = direction === 'redo' ? entry.after : entry.before;
    if (!source || !Array.isArray(source.palette) || !source.palette.length) {
      return false;
    }
    state.palette = source.palette.map(color => normalizeColorValue(color));
    state.activePaletteIndex = normalizePaletteIndex(source.activePaletteIndex, 0);
    state.secondaryPaletteIndex = normalizePaletteIndex(
      source.secondaryPaletteIndex,
      state.activePaletteIndex
    );
    state.activeRgb = normalizeColorValue(
      source.activeRgb || state.palette[state.activePaletteIndex] || { r: 0, g: 0, b: 0, a: 255 }
    );
    syncCurrentPalettePresetFromPalette(state.palette, { syncControl: true });
    renderPalette();
    syncPaletteInputs();
    updateColorTabSwatch();
    renderAllProjectCanvasSurfaces();
    requestRender();
    requestOverlayRender();
    return true;
  }

function commitHistory() {
    if (!history.pending) return;
    const pendingLabel = history.pending.label;
    if (history.pending.dirty) {
      const historyEntry = isTimelineVisualHistoryEntry(history.pending)
        ? finalizeTimelineVisualHistoryEntry(history.pending)
        : (isPaletteStateHistoryEntry(history.pending)
        ? finalizePaletteStateHistoryEntry(history.pending)
        : (isPixelPatchHistoryEntry(history.pending)
        ? finalizePixelPatchHistoryEntry(history.pending)
        : (isLayerAddHistoryEntry(history.pending)
          ? finalizeLayerAddHistoryEntry(history.pending)
          : (isLayerRemoveHistoryEntry(history.pending)
            ? finalizeLayerRemoveHistoryEntry(history.pending)
            : (isCanvasResizeHistoryEntry(history.pending)
              ? finalizeCanvasResizeHistoryEntry(history.pending)
            : (isFrameAddHistoryEntry(history.pending)
              ? finalizeFrameAddHistoryEntry(history.pending)
              : setHistoryEntryLabel(history.pending.before, pendingLabel)))))));
      if (!historyEntry) {
        history.pending = null;
        updateHistoryButtons();
        updateMemoryStatus();
        return;
      }
      history.past.push(historyEntry);
      noteActiveLocalProjectHistoryEntry?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || '',
        historyEntry,
        pendingLabel
      );
      if (history.past.length > history.limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      history.future.forEach(entry => setTimelapseHistoryEntryState(entry, 'discarded'));
      if (history.future.length || hasColdHistoryEntries('future')) {
        clearColdHistoryDirection('future');
      }
      history.future.length = 0;
      // The operation is associated with this single committed Undo entry.
      // Persistence starts now and deliberately does not block pointer-up UI.
      // Redo branches are marked discarded first, preserving state order.
      recordTimelapseHistoryEntry(historyEntry, pendingLabel, history.pending.timelapseBaselineSnapshot);
      trimHistoryToByteBudget?.();
      // A committed history entry is the durability boundary. Persist its V2
      // journal immediately even for large documents; the autosave workflow
      // serializes overlapping writes and falls back to checkpoints only for
      // structural operations.
      // Raster runs/tiles are already appended to the local journal. Starting
      // IndexedDB serialization inside pointerup made the visible application
      // feel slow; let the current frame present first, then save shortly.
      const isDeferredRasterSave = historyEntry?.kind === 'raster-tile-patch'
        || historyEntry?.kind === 'solid-fill-runs';
      if (isDeferredRasterSave) {
        scheduleAutosaveSnapshot({ delayMs: 220, commitReady: true });
      } else {
        requestImmediateAutosaveSnapshot();
      }
    }
    history.pending = null;
    updateHistoryButtons();
    scheduleSessionPersist({ includeSnapshots: false });
    updateMemoryStatus();
    scheduleQrEditReadabilityCheck();
  }

function undo() {
    if (cancelPendingCurveInteraction()) {
      return;
    }
    if (hasPendingSelectionMove()) {
      cancelPendingSelectionMove();
      return;
    }
    commitHistory();
    if (!history.past.length) {
      if (hasColdHistoryEntries('past')) {
        requestColdHistoryRefill('past');
      }
      return;
    }
    // Resize entries validate and apply before either stack is moved. A
    // missing cell or unexpected canvas size must leave Undo/Redo untouched.
    const resizePrevious = history.past[history.past.length - 1];
    if (isCanvasResizeHistoryEntry(resizePrevious)) {
      if (!applyCanvasResizeHistoryEntry(resizePrevious, 'undo')) {
        return;
      }
      history.past.pop();
      history.future.push(resizePrevious);
      if (history.future.length > history.limit) {
        archiveEvictedHistoryEntry('future', history.future.shift());
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    const previous = history.past.pop();
    const historyLabel = getHistoryEntryLabel(previous);
    if (isFrameAddHistoryEntry(previous)) {
      history.future.push(previous);
      if (history.future.length > history.limit) {
        archiveEvictedHistoryEntry('future', history.future.shift());
      }
      if (!applyFrameAddHistoryEntry(previous, 'undo')) {
        history.future.pop();
        history.past.push(previous);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isLayerAddHistoryEntry(previous)) {
      history.future.push(previous);
      if (history.future.length > history.limit) {
        archiveEvictedHistoryEntry('future', history.future.shift());
      }
      if (!applyLayerAddHistoryEntry(previous, 'undo')) {
        history.future.pop();
        history.past.push(previous);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isLayerRemoveHistoryEntry(previous)) {
      history.future.push(previous);
      if (history.future.length > history.limit) {
        archiveEvictedHistoryEntry('future', history.future.shift());
      }
      if (!applyLayerRemoveHistoryEntry(previous, 'undo')) {
        history.future.pop();
        history.past.push(previous);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isPaletteStateHistoryEntry(previous)) {
      history.future.push(previous);
      if (history.future.length > history.limit) {
        archiveEvictedHistoryEntry('future', history.future.shift());
      }
      if (!applyPaletteStateHistoryEntry(previous, 'undo')) {
        history.future.pop();
        history.past.push(previous);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isTimelineVisualHistoryEntry(previous)) {
      history.future.push(previous);
      if (history.future.length > history.limit) {
        archiveEvictedHistoryEntry('future', history.future.shift());
      }
      if (!applyTimelineVisualHistoryEntry(previous, 'undo')) {
        history.future.pop();
        history.past.push(previous);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isPixelPatchHistoryEntry(previous)) {
      history.future.push(previous);
      if (history.future.length > history.limit) {
        archiveEvictedHistoryEntry('future', history.future.shift());
      }
      if (!applyPixelPatchHistoryEntry(previous, 'undo')) {
        history.future.pop();
        history.past.push(previous);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    const snapshot = setHistoryEntryLabel(
      compressHistorySnapshot(makeHistorySnapshot({ clonePixelData: false })),
      historyLabel
    );
    history.future.push(snapshot);
    if (history.future.length > history.limit) {
      archiveEvictedHistoryEntry('future', history.future.shift());
    }
    applyHistorySnapshot(decompressHistorySnapshot(previous), {
      preserveView: true,
      preserveSharedProjectDocumentIdentity: false,
    });
    updateHistoryButtons();
    markAutosaveDirty();
    markDocumentUnsavedChange();
    scheduleAutosaveSnapshot();
    scheduleQrEditReadabilityCheck();
  }

function redo() {
    if (cancelPendingCurveInteraction()) {
      return;
    }
    if (hasPendingSelectionMove()) {
      cancelPendingSelectionMove();
      return;
    }
    commitHistory();
    if (!history.future.length) {
      if (hasColdHistoryEntries('future')) {
        requestColdHistoryRefill('future');
      }
      return;
    }
    const resizeNext = history.future[history.future.length - 1];
    if (isCanvasResizeHistoryEntry(resizeNext)) {
      if (!applyCanvasResizeHistoryEntry(resizeNext, 'redo')) {
        return;
      }
      history.future.pop();
      history.past.push(resizeNext);
      if (history.past.length > history.limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    const next = history.future.pop();
    const historyLabel = getHistoryEntryLabel(next);
    if (isFrameAddHistoryEntry(next)) {
      history.past.push(next);
      if (history.past.length > history.limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      if (!applyFrameAddHistoryEntry(next, 'redo')) {
        history.past.pop();
        history.future.push(next);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isLayerAddHistoryEntry(next)) {
      history.past.push(next);
      if (history.past.length > history.limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      if (!applyLayerAddHistoryEntry(next, 'redo')) {
        history.past.pop();
        history.future.push(next);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isLayerRemoveHistoryEntry(next)) {
      history.past.push(next);
      if (history.past.length > history.limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      if (!applyLayerRemoveHistoryEntry(next, 'redo')) {
        history.past.pop();
        history.future.push(next);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isPixelPatchHistoryEntry(next)) {
      history.past.push(next);
      if (history.past.length > history.limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      if (!applyPixelPatchHistoryEntry(next, 'redo')) {
        history.past.pop();
        history.future.push(next);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isPaletteStateHistoryEntry(next)) {
      history.past.push(next);
      if (history.past.length > history.limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      if (!applyPaletteStateHistoryEntry(next, 'redo')) {
        history.past.pop();
        history.future.push(next);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    if (isTimelineVisualHistoryEntry(next)) {
      history.past.push(next);
      if (history.past.length > history.limit) {
        archiveEvictedHistoryEntry('past', history.past.shift());
      }
      if (!applyTimelineVisualHistoryEntry(next, 'redo')) {
        history.past.pop();
        history.future.push(next);
        return;
      }
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      scheduleAutosaveSnapshot();
      scheduleQrEditReadabilityCheck();
      return;
    }
    const snapshot = setHistoryEntryLabel(
      compressHistorySnapshot(makeHistorySnapshot({ clonePixelData: false })),
      historyLabel
    );
    history.past.push(snapshot);
    if (history.past.length > history.limit) {
      archiveEvictedHistoryEntry('past', history.past.shift());
    }
    applyHistorySnapshot(decompressHistorySnapshot(next), {
      preserveView: true,
      preserveSharedProjectDocumentIdentity: false,
    });
    updateHistoryButtons();
    markAutosaveDirty();
    markDocumentUnsavedChange();
    scheduleAutosaveSnapshot();
    scheduleQrEditReadabilityCheck();
  }

function rollbackPendingHistory({ reRender = true } = {}) {
    if (isLayerAddHistoryEntry(history.pending)) {
      const rolledBack = applyLayerAddHistoryEntry(history.pending, 'undo');
      history.pending = null;
      updateHistoryButtons();
      if (rolledBack) {
        markAutosaveDirty();
        markDocumentUnsavedChange();
      }
      return rolledBack;
    }
    if (isCanvasResizeHistoryEntry(history.pending)) {
      const rolledBack = applyCanvasResizeHistoryEntry(history.pending, 'undo');
      history.pending = null;
      updateHistoryButtons();
      return rolledBack;
    }
    if (isLayerRemoveHistoryEntry(history.pending)) {
      const rolledBack = applyLayerRemoveHistoryEntry(history.pending, 'undo');
      history.pending = null;
      updateHistoryButtons();
      if (rolledBack) {
        markAutosaveDirty();
        markDocumentUnsavedChange();
      }
      return rolledBack;
    }
    if (isPixelPatchHistoryEntry(history.pending)) {
      const rolledBack = rollbackPixelPatchHistoryPending(history.pending);
      history.pending = null;
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      if (reRender) {
        renderEverything();
        requestOverlayRender();
      } else {
        requestRender();
      }
      return rolledBack;
    }
    if (!history.pending || !history.pending.before) {
      history.pending = null;
      return false;
    }
    const snapshot = decompressHistorySnapshot(history.pending.before);
    history.pending = null;
    applyHistorySnapshot(snapshot, { preserveView: true });
    updateHistoryButtons();
    markAutosaveDirty();
    markDocumentUnsavedChange();
    if (reRender) {
      renderEverything();
      requestOverlayRender();
    } else {
      requestRender();
      requestOverlayRender();
    }
    scheduleSessionPersist();
    return true;
  }

  const HISTORY_DISPLAY_LABELS = Object.freeze({
    pen: 'ペン描画',
    eraser: '消去',
    line: '直線',
    curve: '曲線',
    rect: '四角形',
    rectFill: '塗りつぶし四角形',
    ellipse: '円',
    ellipseFill: '塗りつぶし円',
    fill: '塗りつぶし',
    selectionMove: '選択範囲を移動',
    selectionTransform: '選択範囲を変形',
    selectionCut: '選択範囲を切り取り',
    selectionPastePixels: '選択範囲を貼り付け',
    addLayer: 'レイヤーを追加',
    duplicateLayer: 'レイヤーを複製',
    pasteLayer: 'レイヤーを貼り付け',
    removeLayer: 'レイヤーを削除',
    moveLayer: 'レイヤーを移動',
    reorderLayer: 'レイヤーを並べ替え',
    addFrame: 'フレームを追加',
    duplicateFrame: 'フレームを複製',
    pasteFrame: 'フレームを貼り付け',
    removeFrame: 'フレームを削除',
    setFrameFps: 'FPSを変更',
    setAllFrameFps: '全フレームのFPSを変更',
    setLayerVisibility: 'レイヤー表示を変更',
    setLayerOpacity: 'レイヤー不透明度を変更',
    setLayerBlendMode: 'レイヤー合成モードを変更',
    setOnionSkin: 'オニオンスキンを変更',
    toggleOnionSkin: 'オニオンスキンを切替',
    paletteColor: 'パレット色を変更',
    paletteAdd: 'パレット色を追加',
    paletteRemove: 'パレット色を削除',
    paletteReorder: 'パレット色を並べ替え',
    paletteApplyPreset: 'パレットを適用',
    paletteImport: 'パレットを読み込み',
    clearCanvas: 'キャンバスをクリア',
    resizeCanvas: 'キャンバスサイズを変更',
    scaleSprite: 'キャンバスを拡大縮小',
    colorModeConvert: 'カラーモードを変換',
  });

  function getHistoryDisplayLabel(entry) {
    const label = String(entry?.historyLabel || entry?.label || entry?.kind || '').trim();
    return HISTORY_DISPLAY_LABELS[label] || (label ? `操作: ${label}` : '編集操作');
  }

  function appendHistoryListSection(container, title, entries, stateName) {
    const section = document.createElement('section');
    section.className = `settings-history__section settings-history__section--${stateName}`;
    const heading = document.createElement('p');
    heading.className = 'settings-history__heading';
    heading.textContent = `${title} (${entries.length})`;
    section.append(heading);
    if (!entries.length) {
      const empty = document.createElement('p');
      empty.className = 'settings-history__empty';
      empty.textContent = 'なし';
      section.append(empty);
    } else {
      const list = document.createElement('ol');
      list.className = 'settings-history__entries';
      entries.forEach(entry => {
        const item = document.createElement('li');
        item.textContent = getHistoryDisplayLabel(entry);
        list.append(item);
      });
      section.append(list);
    }
    container.append(section);
  }

  function renderHistoryList() {
    const container = dom.controls.historyList;
    const summary = dom.controls.historySummary;
    const past = Array.isArray(history.past) ? history.past : [];
    const future = Array.isArray(history.future) ? history.future : [];
    if (summary) {
      summary.textContent = `戻す ${past.length} / やり直す ${future.length}`;
    }
    if (!container) {
      return;
    }
    container.replaceChildren();
    appendHistoryListSection(container, '戻せる操作', past.slice().reverse(), 'past');
    appendHistoryListSection(container, 'やり直し', future.slice().reverse(), 'future');
  }

function updateHistoryButtons() {
    // Undo/Redo stack movement is the in-session authority. Persist only the
    // compact state transition; the timelapse later reads active operations.
    synchronizeTimelapseHistoryStates();
    try {
      if (dom.controls.undoAction) dom.controls.undoAction.disabled = history.past.length === 0 && !hasColdHistoryEntries('past');
      if (dom.controls.redoAction) dom.controls.redoAction.disabled = history.future.length === 0 && !hasColdHistoryEntries('future');
    } catch (e) {
      if (dom.controls.undoAction) dom.controls.undoAction.disabled = history.past.length === 0;
      if (dom.controls.redoAction) dom.controls.redoAction.disabled = history.future.length === 0;
    }
    renderHistoryList();
  }


  return Object.freeze({
    beginPaletteStateHistory,
    beginTimelineVisualHistory,
    markHistoryDirty,
    commitHistory,
    undo,
    redo,
    rollbackPendingHistory,
    captureTimelapseBaselineSnapshot,
    renderHistoryList,
    updateHistoryButtons,
  });
      }
    })(scope);
  }

  root.historyCoreWorkflowUtils = Object.freeze({
    createHistoryCoreWorkflowUtils,
  });
})();
