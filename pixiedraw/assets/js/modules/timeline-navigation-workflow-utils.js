(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createTimelineNavigationWorkflowUtils(rawScope = {}) {
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
  function applyFpsToAllFrames(fpsValue) {
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(localizeText('参加/視聴モードではfps設定はマスターのみ変更できます', 'In participant/viewer mode, only the master can change FPS'), 'warn');
      }
      return;
    }
    const frames = state.frames;
    if (!Array.isArray(frames) || !frames.length) {
      return;
    }
    const clampedFps = normalizeFpsValue(fpsValue);
    const nextDuration = getDurationFromFps(clampedFps);
    const hasChange = frames.some(frame => Math.abs(frame.duration - nextDuration) > 0.001);
    if (!hasChange) {
      updateAnimationFpsDisplay(clampedFps, nextDuration);
      return;
    }
    beginHistory('setAllFrameFps');
    frames.forEach(frame => {
      frame.duration = nextDuration;
    });
    markHistoryDirty();
    commitHistory();
    scheduleSessionPersist();
    renderTimelineMatrix();
    updateAnimationFpsDisplay(clampedFps, nextDuration);
  }

  function setActiveFrameIndex(nextIndex, {
    wrap = false,
    persist = true,
    render = true,
    syncUi = true,
    broadcastPresence = true,
  } = {}) {
    const frames = state.frames;
    if (!Array.isArray(frames) || !frames.length) {
      return null;
    }
    const length = frames.length;
    const normalizedIndex = wrap
      ? ((Math.round(nextIndex) % length) + length) % length
      : clamp(Math.round(nextIndex), 0, length - 1);
    const previousIndex = state.activeFrame;
    const previousLayerId = state.activeLayer;
    // A selection is bound to one timeline cell. Commit/clear it before
    // changing frames so a later operation can never affect another frame.
    if (previousIndex !== normalizedIndex && state.selectionMask) {
      clearSelection();
    }
    state.activeFrame = normalizedIndex;
    if (previousIndex !== normalizedIndex) {
      if (pointerState.active) {
        abortActivePointerInteraction({ commitHistory: false });
      }
      pointerState.selectionMove = null;
      pointerState.lastSelectionMove = null;
      state.pendingPasteMoveState = null;
      hoverPixel = null;
      if (virtualCursorDrawState.active) {
        virtualCursorDrawState.lastPosition = null;
        virtualCursorDrawState.currentPosition = null;
      }
      invalidateActiveCanvasCompositeRenderState({ clearHover: false, preserveFrameCache: true });
      getProjectCanvasDocuments().forEach(canvasDoc => {
        if (!canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
          return;
        }
        const previousFrame = canvasDoc.frames[clamp(previousIndex, 0, canvasDoc.frames.length - 1)];
        const nextFrame = canvasDoc.frames[clamp(normalizedIndex, 0, canvasDoc.frames.length - 1)];
        // Playback must only advance the cursor and render. Compacting the
        // previous frame here scans its full pixel buffer on every tick and
        // can make large GIF/PXD animations appear completely stopped.
        if (!state.playback?.isPlaying && typeof compactInactiveRasterFrameIndices === 'function') {
          compactInactiveRasterFrameIndices(
            previousFrame,
            canvasDoc.width,
            canvasDoc.height,
            state.palette,
            nextFrame
          );
        }
      });
    }
    getProjectCanvasDocuments().forEach(canvasDoc => {
      if (!canvasDoc || !Array.isArray(canvasDoc.frames) || !canvasDoc.frames.length) {
        return;
      }
      canvasDoc.activeFrame = clamp(normalizedIndex, 0, canvasDoc.frames.length - 1);
      const targetFrame = canvasDoc.frames[canvasDoc.activeFrame];
      if (targetFrame && Array.isArray(targetFrame.layers) && !targetFrame.layers.some(layer => layer?.id === canvasDoc.activeLayer)) {
        canvasDoc.activeLayer = targetFrame.layers[targetFrame.layers.length - 1]?.id || targetFrame.layers[0]?.id || canvasDoc.activeLayer;
      }
    });
    const frame = frames[normalizedIndex];
    if (frame && (!frame.layers.some(layer => layer.id === state.activeLayer) || !state.activeLayer)) {
      const lastLayer = frame.layers[frame.layers.length - 1];
      if (lastLayer) {
        state.activeLayer = lastLayer.id;
      }
    }
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    if (activeCanvasDoc && frame && Array.isArray(frame.layers)) {
      const syncedLayer = frame.layers.find(layer => layer?.id === state.activeLayer)
        || frame.layers[frame.layers.length - 1]
        || frame.layers[0]
        || null;
      if (syncedLayer?.id) {
        activeCanvasDoc.activeLayer = syncedLayer.id;
        state.activeLayer = syncedLayer.id;
      }
    }
    if (isVoxelExtensionModeEnabled()) {
      const frameOrientation = getVoxelPreviewOrientationForFrameIndex(
        normalizedIndex,
        voxelExtensionState.previewYawDeg,
        voxelExtensionState.previewPitchDeg
      );
      voxelExtensionState = normalizeVoxelExtensionState({
        ...voxelExtensionState,
        previewYawDeg: frameOrientation.yawDeg,
        previewPitchDeg: frameOrientation.pitchDeg,
      }, VOXEL_EXTENSION_DEFAULT_STATE);
      syncVoxelExtensionPreviewFromSource({ updateViewport: false });
    }
    if (isMultiAssignedCellRestrictedEditorMode()) {
      enforceGuestAssignedLayerSelection({ announce: false });
    }
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
    if (render) {
      if (previousIndex !== normalizedIndex) {
        if (isVoxelExtensionModeEnabled()) {
          syncVoxelExtensionPreviewFromSource({ updateViewport: false });
        }
        renderFrameList();
        renderLayerList();
        requestRender();
        requestOverlayRender();
      } else {
        syncAnimationFpsDisplayFromState();
        syncActiveFrameSettingsUI();
      }
    }
    if (syncUi) {
      updatePixfindModeUI();
    }
    if (broadcastPresence && (previousIndex !== normalizedIndex || previousLayerId !== state.activeLayer)) {
      scheduleSharedProjectCellPresenceBroadcast('frame');
    }
    return frame;
  }

  function stepActiveFrame(offset, options = {}) {
    const frames = state.frames;
    if (!Array.isArray(frames) || !frames.length) {
      return;
    }
    const wrap = options.wrap !== false;
    const persist = options.persist !== false;
    const render = options.render !== false;
    const syncUi = options.syncUi !== false;
    const broadcastPresence = options.broadcastPresence !== false;
    const respectSharedCellOccupancy = options.respectSharedCellOccupancy !== false;
    const nextIndex = state.activeFrame + Number(offset || 0);
    const normalizedIndex = wrap
      ? ((Math.round(nextIndex) % frames.length) + frames.length) % frames.length
      : clamp(Math.round(nextIndex), 0, frames.length - 1);
    const currentFrame = getActiveFrame();
    const currentLayers = currentFrame ? currentFrame.layers.slice().reverse() : [];
    const activeLayerRow = currentLayers.findIndex(layer => layer.id === state.activeLayer);
    const candidateLayers = frames[normalizedIndex]?.layers?.slice().reverse() || [];
    const nextLayer = candidateLayers[activeLayerRow] || candidateLayers[candidateLayers.length - 1] || candidateLayers[0];
    if (respectSharedCellOccupancy && nextLayer && !canSelectSharedProjectTimelineCell(normalizedIndex, nextLayer.id)) {
      scheduleTimelineMatrixRenderSoon();
      return;
    }
    setActiveFrameIndex(nextIndex, { wrap, persist, render, syncUi, broadcastPresence });
  }

  function setActiveFrameOnLayerTrack(frameIndex, trackIndex, {
    persist = true,
    render = true,
    syncUi = true,
  } = {}) {
    const frames = state.frames;
    if (!Array.isArray(frames) || !frames.length) {
      return false;
    }
    const normalizedFrameIndex = clamp(Math.round(Number(frameIndex) || 0), 0, frames.length - 1);
    const targetFrame = frames[normalizedFrameIndex] || null;
    if (!targetFrame || !Array.isArray(targetFrame.layers) || !targetFrame.layers.length) {
      return false;
    }
    const normalizedTrackIndex = clamp(Math.round(Number(trackIndex) || 0), 0, targetFrame.layers.length - 1);
    const targetLayer = targetFrame.layers[normalizedTrackIndex] || targetFrame.layers[targetFrame.layers.length - 1] || targetFrame.layers[0];
    if (!targetLayer?.id) {
      return false;
    }
    const previousFrame = state.activeFrame;
    const previousLayer = state.activeLayer;
    setActiveFrameIndex(normalizedFrameIndex, {
      wrap: false,
      persist: false,
      render: false,
      syncUi: false,
      broadcastPresence: false,
    });
    if (previousLayer !== targetLayer.id && state.selectionMask) {
      clearSelection();
    }
    state.activeLayer = targetLayer.id;
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    if (activeCanvasDoc) {
      activeCanvasDoc.activeFrame = normalizedFrameIndex;
      activeCanvasDoc.activeLayer = targetLayer.id;
    }
    const changed = previousFrame !== normalizedFrameIndex || previousLayer !== targetLayer.id;
    if (changed) {
      invalidateActiveCanvasCompositeRenderState({ preserveFrameCache: true });
    }
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
    if (render && changed) {
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
    } else if (syncUi) {
      updatePixfindModeUI();
    }
    if (changed) {
      scheduleSharedProjectCellPresenceBroadcast('frame-track');
    }
    return true;
  }

  function jumpToTimelineEdgeOnActiveLayer(edge = 'start') {
    const frames = state.frames;
    if (!Array.isArray(frames) || !frames.length) {
      return false;
    }
    const currentTrackIndex = getActiveLayerTrackIndex();
    const fallbackTrackIndex = Math.max(0, Math.round(Number(currentTrackIndex) || 0));
    const firstTarget = edge === 'end' ? frames.length - 1 : 0;
    const direction = edge === 'end' ? -1 : 1;
    const candidateIndexes = [];
    for (let frameIndex = firstTarget; frameIndex >= 0 && frameIndex < frames.length; frameIndex += direction) {
      candidateIndexes.push(frameIndex);
    }
    for (const frameIndex of candidateIndexes) {
      const frame = frames[frameIndex] || null;
      const layers = Array.isArray(frame?.layers) ? frame.layers : [];
      if (!layers.length) {
        continue;
      }
      const trackIndex = clamp(fallbackTrackIndex, 0, layers.length - 1);
      const layer = layers[trackIndex] || null;
      if (!layer?.id) {
        continue;
      }
      if (!canSelectSharedProjectTimelineCell(frameIndex, layer.id, { announce: false })) {
        continue;
      }
      return setActiveFrameOnLayerTrack(frameIndex, trackIndex);
    }
    const edgeFrame = frames[firstTarget] || null;
    const edgeLayers = Array.isArray(edgeFrame?.layers) ? edgeFrame.layers : [];
    const edgeTrackIndex = clamp(fallbackTrackIndex, 0, Math.max(0, edgeLayers.length - 1));
    const occupiedLayer = edgeLayers[edgeTrackIndex] || null;
    if (occupiedLayer?.id) {
      canSelectSharedProjectTimelineCell(firstTarget, occupiedLayer.id, { announce: true });
    } else {
      setMultiStatus(localizeText('移動できるフレームがありません', 'No available frame to move to'), 'warn');
    }
    scheduleTimelineMatrixRenderSoon();
    return false;
  }

  function setActiveLayerTrackIndex(nextIndex, {
    persist = true,
    render = true,
    syncUi = true,
    respectSharedCellOccupancy = true,
  } = {}) {
    const frame = getActiveFrame();
    if (!frame || !Array.isArray(frame.layers) || !frame.layers.length) {
      return null;
    }
    if (isMultiAssignedCellRestrictedEditorMode()) {
      enforceGuestAssignedLayerSelection({ announce: false });
      return getActiveLayer();
    }
    const normalizedIndex = clamp(Math.round(Number(nextIndex) || 0), 0, frame.layers.length - 1);
    const nextLayer = frame.layers[normalizedIndex];
    if (!nextLayer) {
      return null;
    }
    if (respectSharedCellOccupancy && !canSelectSharedProjectTimelineCell(state.activeFrame, nextLayer.id)) {
      scheduleTimelineMatrixRenderSoon();
      return getActiveLayer();
    }
    const previousLayerId = state.activeLayer;
    // Likewise, a selection never carries over to another layer in the same
    // frame. This keeps all canvas tools scoped to the active layer-frame.
    if (previousLayerId !== nextLayer.id && state.selectionMask) {
      clearSelection();
    }
    state.activeLayer = nextLayer.id;
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    if (activeCanvasDoc) {
      activeCanvasDoc.activeLayer = nextLayer.id;
    }
    if (persist) {
      scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    }
    if (render) {
      if (previousLayerId !== nextLayer.id) {
        renderFrameList();
        renderLayerList();
        requestRender();
        requestOverlayRender();
      } else {
        syncActiveLayerSettingsUI();
      }
    }
    if (syncUi) {
      updatePixfindModeUI();
    }
    if (previousLayerId !== nextLayer.id) {
      scheduleSharedProjectCellPresenceBroadcast('layer');
    }
    return nextLayer;
  }

  function stepActiveLayerTrack(offset, options = {}) {
    const frame = getActiveFrame();
    if (!frame || !Array.isArray(frame.layers) || !frame.layers.length) {
      return null;
    }
    const currentIndex = getActiveLayerIndex();
    const baseIndex = currentIndex >= 0 ? currentIndex : frame.layers.length - 1;
    const nextIndex = baseIndex + Number(offset || 0);
    return setActiveLayerTrackIndex(nextIndex, options);
  }



  return Object.freeze({
    applyFpsToAllFrames,
    setActiveFrameIndex,
    stepActiveFrame,
    setActiveFrameOnLayerTrack,
    jumpToTimelineEdgeOnActiveLayer,
    setActiveLayerTrackIndex,
    stepActiveLayerTrack,
  });
      }
    })(scope);
  }

  root.timelineNavigationWorkflowUtils = Object.freeze({
    createTimelineNavigationWorkflowUtils,
  });
})();
