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

function commitHistory() {
    if (!history.pending) return;
    const pendingLabel = history.pending.label;
    if (history.pending.dirty) {
      const historyEntry = isPixelPatchHistoryEntry(history.pending)
        ? finalizePixelPatchHistoryEntry(history.pending)
        : setHistoryEntryLabel(history.pending.before, pendingLabel);
      if (!historyEntry) {
        history.pending = null;
        updateHistoryButtons();
        updateMemoryStatus();
        return;
      }
      const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
      const shouldRecordScopedHistory = (
          (multiState.connected && isMultiClientScopedHistoryMode())
          || isSharedProjectCollaborativeMode()
        )
        && MULTI_SCOPED_HISTORY_LABELS.has(pendingLabel);
      if (shouldRecordScopedHistory) {
        try {
          const bucket = getMultiHistoryBucket(multiState.clientId || '', activeCanvasId, { create: true });
          if (bucket) {
            bucket.past.push(historyEntry);
            if (bucket.past.length > bucket.limit) bucket.past.shift();
            bucket.future.length = 0;
          } else if (!isMultiClientScopedHistoryMode()) {
            history.past.push(historyEntry);
          }
        } catch (error) {
          console.warn('Failed to record per-client/per-canvas history. Falling back to global history.', error);
          if (!isMultiClientScopedHistoryMode()) {
            history.past.push(historyEntry);
          }
        }
      } else {
        history.past.push(historyEntry);
      }
      if (!isSharedProjectCollaborativeMode()) {
        noteActiveLocalProjectHistoryEntry?.(
          normalizeAutosaveProjectId?.(autosaveProjectId || '') || '',
          historyEntry,
          pendingLabel
        );
      }
      const recordedTimelapseOperation = recordTimelapseOperationLogEntry(historyEntry, pendingLabel);
      const activeTimelapseTrack = getActiveTimelapseTrack();
      if (
        !recordedTimelapseOperation
        &&
        !isPixelPatchHistoryEntry(historyEntry)
        && timelapseState.enabled
        && (!activeTimelapseTrack || activeTimelapseTrack.snapshots.length === 0)
      ) {
        const startEntry = createTimelapseFrameEntryFromSnapshot(historyEntry);
        if (startEntry) {
          const track = getActiveTimelapseTrack({ create: true });
          track.snapshots.push(startEntry);
          thinTimelapseSnapshotsIfNeeded(track);
        }
      }
      if (!recordedTimelapseOperation) {
        scheduleTimelapseCaptureFromState();
      }
      if (activeSharedProjectKey) {
        const sharedOpType = classifySharedProjectOpType(pendingLabel);
        if (shouldPersistSharedProjectSnapshotForHistoryLabel(pendingLabel, sharedOpType)) {
          queueSharedProjectCurrentSnapshotCapture({
            delayMs: sharedOpType === 'structure'
              ? Math.min(120, SHARED_PROJECT_CHECKPOINT_DELAY)
              : SHARED_PROJECT_DEFERRED_PERSIST_DELAY,
            projectKey: activeSharedProjectKey,
            historyLabel: pendingLabel,
          });
        }
      }
      if (history.past.length > history.limit) {
        history.past.shift();
      }
      history.future.length = 0;
      if (isLargeDocumentPerformanceMode()) {
        scheduleAutosaveSnapshot();
      } else {
        requestImmediateAutosaveSnapshot();
      }
      handleMultiLocalCommit(pendingLabel);
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
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    const bucket = getMultiHistoryBucket(multiState.clientId || '', activeCanvasId);
    const sharedScopedHistory = isSharedProjectCollaborativeMode();
    const shouldUseScopedHistory = sharedScopedHistory
      || (multiState.connected && (
        isMultiClientScopedHistoryMode()
        || Boolean((bucket?.past?.length || 0) || (bucket?.future?.length || 0))
      ));
    if (shouldUseScopedHistory) {
      if (!bucket?.past?.length) {
        if (isMultiClientScopedHistoryMode() || sharedScopedHistory) {
          return;
        }
      } else {
        try {
          const prevCompressed = bucket.past.pop();
          const historyLabel = getHistoryEntryLabel(prevCompressed);
          const currentCompressed = setHistoryEntryLabel(
            compressHistorySnapshot(makeHistorySnapshot({ clonePixelData: false })),
            historyLabel
          );
          bucket.future.push(currentCompressed);
          if (bucket.future.length > bucket.limit) bucket.future.shift();
          const prev = decompressHistorySnapshot(prevCompressed);
          const applied = sharedScopedHistory
            ? applyHistorySnapshotForSharedLocalCell(prev, {
                canvasId: activeCanvasId,
                restoreSelection: true,
              })
            : applyHistorySnapshotForClient(prev, multiState.clientId || '', {
                preserveView: true,
                canvasId: activeCanvasId,
                restoreSelection: true,
              });
          if (applied) {
            updateHistoryButtons();
            markAutosaveDirty();
            markDocumentUnsavedChange();
            scheduleAutosaveSnapshot();
            scheduleQrEditReadabilityCheck();
            try {
              if (sharedScopedHistory) {
                handleMultiLocalCommit(historyLabel);
              } else if (isMultiMasterMode()) {
                scheduleMasterLayerPatchSend({ immediate: true });
                scheduleMultiPublicLobbyRoomSync({ immediate: false });
              } else {
                scheduleGuestLayerPatchSend({ immediate: true });
              }
            } catch (error) {
              console.warn('Failed to sync undo patch to peers', error);
            }
          }
          return;
        } catch (error) {
          console.warn('Undo failed in per-client/per-canvas history mode', error);
          if (isMultiClientScopedHistoryMode() || sharedScopedHistory) {
            return;
          }
        }
      }
    }

    if (!history.past.length) return;
    const previous = history.past.pop();
    const historyLabel = getHistoryEntryLabel(previous);
    if (isPixelPatchHistoryEntry(previous)) {
      history.future.push(previous);
      if (history.future.length > history.limit) {
        history.future.shift();
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
      if (isSharedProjectCollaborativeMode()) {
        handleMultiLocalCommit(historyLabel);
        const sharedOpType = classifySharedProjectOpType(historyLabel);
        if (shouldPersistSharedProjectSnapshotForHistoryLabel(historyLabel, sharedOpType)) {
          queueSharedProjectCurrentSnapshotCapture({
            delayMs: sharedOpType === 'structure'
              ? Math.min(120, SHARED_PROJECT_CHECKPOINT_DELAY)
              : SHARED_PROJECT_DEFERRED_PERSIST_DELAY,
            projectKey: activeSharedProjectKey,
            historyLabel,
          });
        }
        return;
      }
      if (multiState.connected && isMultiMasterMode()) {
        if (MULTI_LAYER_PATCH_HISTORY_LABELS.has(historyLabel)) {
          scheduleMasterLayerPatchSend({ immediate: true });
          scheduleMultiPublicLobbyRoomSync({ immediate: false });
        } else if (!isLocalOnlyMultiHistoryLabel(historyLabel)) {
          scheduleMultiSessionStateBroadcast({ immediate: true });
        }
      }
      return;
    }
    const snapshot = setHistoryEntryLabel(
      compressHistorySnapshot(makeHistorySnapshot({ clonePixelData: false })),
      historyLabel
    );
    history.future.push(snapshot);
    if (history.future.length > history.limit) {
      history.future.shift();
    }
    const sharedUndoOpType = classifySharedProjectOpType(historyLabel);
    applyHistorySnapshot(decompressHistorySnapshot(previous), {
      preserveView: true,
      preserveSharedProjectDocumentIdentity: isSharedProjectCollaborativeMode() && sharedUndoOpType !== 'structure',
    });
    updateHistoryButtons();
    markAutosaveDirty();
    markDocumentUnsavedChange();
    scheduleAutosaveSnapshot();
    scheduleQrEditReadabilityCheck();
    if (isSharedProjectCollaborativeMode()) {
      handleMultiLocalCommit(historyLabel);
      const sharedOpType = sharedUndoOpType;
      if (shouldPersistSharedProjectSnapshotForHistoryLabel(historyLabel, sharedOpType)) {
        queueSharedProjectCurrentSnapshotCapture({
          delayMs: sharedOpType === 'structure'
            ? Math.min(120, SHARED_PROJECT_CHECKPOINT_DELAY)
            : SHARED_PROJECT_DEFERRED_PERSIST_DELAY,
          projectKey: activeSharedProjectKey,
          historyLabel,
        });
      }
      return;
    }
    if (multiState.connected && isMultiMasterMode()) {
      if (MULTI_LAYER_PATCH_HISTORY_LABELS.has(historyLabel)) {
        scheduleMasterLayerPatchSend({ immediate: true });
        scheduleMultiPublicLobbyRoomSync({ immediate: false });
      } else if (!isLocalOnlyMultiHistoryLabel(historyLabel)) {
        scheduleMultiSessionStateBroadcast({ immediate: true });
      }
    }
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
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    const bucket = getMultiHistoryBucket(multiState.clientId || '', activeCanvasId);
    const sharedScopedHistory = isSharedProjectCollaborativeMode();
    const shouldUseScopedHistory = sharedScopedHistory
      || (multiState.connected && (
        isMultiClientScopedHistoryMode()
        || Boolean((bucket?.past?.length || 0) || (bucket?.future?.length || 0))
      ));
    if (shouldUseScopedHistory) {
      if (!bucket?.future?.length) {
        if (isMultiClientScopedHistoryMode() || sharedScopedHistory) {
          return;
        }
      } else {
        try {
          const nextCompressed = bucket.future.pop();
          const historyLabel = getHistoryEntryLabel(nextCompressed);
          const currentCompressed = setHistoryEntryLabel(
            compressHistorySnapshot(makeHistorySnapshot({ clonePixelData: false })),
            historyLabel
          );
          bucket.past.push(currentCompressed);
          if (bucket.past.length > bucket.limit) bucket.past.shift();
          const next = decompressHistorySnapshot(nextCompressed);
          const applied = sharedScopedHistory
            ? applyHistorySnapshotForSharedLocalCell(next, {
                canvasId: activeCanvasId,
                restoreSelection: true,
              })
            : applyHistorySnapshotForClient(next, multiState.clientId || '', {
                preserveView: true,
                canvasId: activeCanvasId,
                restoreSelection: true,
              });
    if (applied) {
      updateHistoryButtons();
      markAutosaveDirty();
      markDocumentUnsavedChange();
      markActiveLocalProjectJournalNeedsCheckpoint?.(
        normalizeAutosaveProjectId?.(autosaveProjectId || '') || ''
      );
      scheduleAutosaveSnapshot();
            scheduleQrEditReadabilityCheck();
            try {
              if (sharedScopedHistory) {
                handleMultiLocalCommit(historyLabel);
              } else if (isMultiMasterMode()) {
                scheduleMasterLayerPatchSend({ immediate: true });
                scheduleMultiPublicLobbyRoomSync({ immediate: false });
              } else {
                scheduleGuestLayerPatchSend({ immediate: true });
              }
            } catch (error) {
              console.warn('Failed to sync redo patch to peers', error);
            }
          }
          return;
        } catch (error) {
          console.warn('Redo failed in per-client/per-canvas history mode', error);
          if (isMultiClientScopedHistoryMode() || sharedScopedHistory) {
            return;
          }
        }
      }
    }

    if (!history.future.length) return;
    const next = history.future.pop();
    const historyLabel = getHistoryEntryLabel(next);
    if (isPixelPatchHistoryEntry(next)) {
      history.past.push(next);
      if (history.past.length > history.limit) {
        history.past.shift();
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
      if (isSharedProjectCollaborativeMode()) {
        handleMultiLocalCommit(historyLabel);
        const sharedOpType = classifySharedProjectOpType(historyLabel);
        if (shouldPersistSharedProjectSnapshotForHistoryLabel(historyLabel, sharedOpType)) {
          queueSharedProjectCurrentSnapshotCapture({
            delayMs: sharedOpType === 'structure'
              ? Math.min(120, SHARED_PROJECT_CHECKPOINT_DELAY)
              : SHARED_PROJECT_DEFERRED_PERSIST_DELAY,
            projectKey: activeSharedProjectKey,
            historyLabel,
          });
        }
        return;
      }
      if (multiState.connected && isMultiMasterMode()) {
        if (MULTI_LAYER_PATCH_HISTORY_LABELS.has(historyLabel)) {
          scheduleMasterLayerPatchSend({ immediate: true });
          scheduleMultiPublicLobbyRoomSync({ immediate: false });
        } else if (!isLocalOnlyMultiHistoryLabel(historyLabel)) {
          scheduleMultiSessionStateBroadcast({ immediate: true });
        }
      }
      return;
    }
    const snapshot = setHistoryEntryLabel(
      compressHistorySnapshot(makeHistorySnapshot({ clonePixelData: false })),
      historyLabel
    );
    history.past.push(snapshot);
    if (history.past.length > history.limit) {
      history.past.shift();
    }
    const sharedRedoOpType = classifySharedProjectOpType(historyLabel);
    applyHistorySnapshot(decompressHistorySnapshot(next), {
      preserveView: true,
      preserveSharedProjectDocumentIdentity: isSharedProjectCollaborativeMode() && sharedRedoOpType !== 'structure',
    });
    updateHistoryButtons();
    markAutosaveDirty();
    markDocumentUnsavedChange();
    scheduleAutosaveSnapshot();
    scheduleQrEditReadabilityCheck();
    if (isSharedProjectCollaborativeMode()) {
      handleMultiLocalCommit(historyLabel);
      const sharedOpType = sharedRedoOpType;
      if (shouldPersistSharedProjectSnapshotForHistoryLabel(historyLabel, sharedOpType)) {
        queueSharedProjectCurrentSnapshotCapture({
          delayMs: sharedOpType === 'structure'
            ? Math.min(120, SHARED_PROJECT_CHECKPOINT_DELAY)
            : SHARED_PROJECT_DEFERRED_PERSIST_DELAY,
          projectKey: activeSharedProjectKey,
          historyLabel,
        });
      }
      return;
    }
    if (multiState.connected && isMultiMasterMode()) {
      if (MULTI_LAYER_PATCH_HISTORY_LABELS.has(historyLabel)) {
        scheduleMasterLayerPatchSend({ immediate: true });
        scheduleMultiPublicLobbyRoomSync({ immediate: false });
      } else if (!isLocalOnlyMultiHistoryLabel(historyLabel)) {
        scheduleMultiSessionStateBroadcast({ immediate: true });
      }
    }
  }

function rollbackPendingHistory({ reRender = true } = {}) {
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

function updateHistoryButtons() {
    try {
      if (isSharedProjectCollaborativeMode()) {
        const bucket = getMultiHistoryBucket(multiState.clientId || '', getActiveProjectCanvasDocument()?.id || '');
        if (dom.controls.undoAction) dom.controls.undoAction.disabled = !bucket?.past?.length;
        if (dom.controls.redoAction) dom.controls.redoAction.disabled = !bucket?.future?.length;
        return;
      }
      if (!multiState.connected) {
        if (dom.controls.undoAction) dom.controls.undoAction.disabled = history.past.length === 0;
        if (dom.controls.redoAction) dom.controls.redoAction.disabled = history.future.length === 0;
        return;
      }
      const bucket = getMultiHistoryBucket(multiState.clientId || '', getActiveProjectCanvasDocument()?.id || '');
      const scopedUndoAvailable = Boolean(bucket?.past?.length);
      const scopedRedoAvailable = Boolean(bucket?.future?.length);
      if (isMultiClientScopedHistoryMode()) {
        if (dom.controls.undoAction) dom.controls.undoAction.disabled = !scopedUndoAvailable;
        if (dom.controls.redoAction) dom.controls.redoAction.disabled = !scopedRedoAvailable;
        return;
      }
      if (dom.controls.undoAction) dom.controls.undoAction.disabled = !scopedUndoAvailable && history.past.length === 0;
      if (dom.controls.redoAction) dom.controls.redoAction.disabled = !scopedRedoAvailable && history.future.length === 0;
    } catch (e) {
      if (dom.controls.undoAction) dom.controls.undoAction.disabled = history.past.length === 0;
      if (dom.controls.redoAction) dom.controls.redoAction.disabled = history.future.length === 0;
    }
  }


  return Object.freeze({
    markHistoryDirty,
    commitHistory,
    undo,
    redo,
    rollbackPendingHistory,
    updateHistoryButtons,
  });
      }
    })(scope);
  }

  root.historyCoreWorkflowUtils = Object.freeze({
    createHistoryCoreWorkflowUtils,
  });
})();
