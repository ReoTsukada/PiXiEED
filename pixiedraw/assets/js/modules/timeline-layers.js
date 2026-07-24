(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createTimelineLayersModule(rawScope = {}) {
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
  function createTimelineSlotKey(frameIndex, layerIndex) {
    return `${frameIndex}:${layerIndex}`;
  }

  function getDeterministicColorIndex(text, paletteSize) {
    const size = Math.max(1, Math.floor(Number(paletteSize) || 0));
    const source = typeof text === 'string' ? text : '';
    let hash = 2166136261;
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % size;
  }

  function getMultiAssignmentColorForClient(clientId) {
    const index = getDeterministicColorIndex(clientId, MULTI_ASSIGNMENT_BORDER_COLORS.length);
    return MULTI_ASSIGNMENT_BORDER_COLORS[index] || '#ffd47a';
  }

  function buildMultiAssignmentTimelineCellMap() {
    const map = new Map();
    if (!(multiState.assignments instanceof Map) || !multiState.assignments.size) {
      return map;
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    if (!canvasDoc) {
      return map;
    }
    multiState.assignments.forEach((assignment, clientId) => {
      const assignedCell = getAssignedCellForClientOnCanvas(clientId, canvasDoc);
      if (!assignedCell) {
        return;
      }
      const frameIndex = assignedCell.frameIndex;
      const layerIndex = assignedCell.trackIndex;
      if (!hasTimelineLayerIndex(frameIndex, layerIndex)) {
        return;
      }
      const key = createTimelineSlotKey(frameIndex, layerIndex);
      map.set(key, {
        clientId,
        role: assignment?.role === 'master' ? 'master' : 'guest',
        name: typeof assignment?.name === 'string' ? assignment.name.trim().slice(0, 32) : '',
        color: getMultiAssignmentColorForClient(clientId),
        locked: Boolean(assignment?.locked),
      });
    });
    return map;
  }

  function parseTimelineSlotKey(key) {
    if (typeof key !== 'string') {
      return null;
    }
    const [framePart, layerPart] = key.split(':');
    const frameIndex = Number.parseInt(framePart, 10);
    const layerIndex = Number.parseInt(layerPart, 10);
    if (!Number.isInteger(frameIndex) || !Number.isInteger(layerIndex)) {
      return null;
    }
    return { frameIndex, layerIndex };
  }

  function hasTimelineLayerIndex(frameIndex, layerIndex) {
    if (!Number.isInteger(frameIndex) || !Number.isInteger(layerIndex)) {
      return false;
    }
    if (frameIndex < 0 || frameIndex >= state.frames.length || layerIndex < 0) {
      return false;
    }
    const frame = state.frames[frameIndex];
    return Boolean(frame && Array.isArray(frame.layers) && layerIndex < frame.layers.length);
  }

  function normalizeTimelineSelectionState() {
    let changed = false;
    if (timelineSelection.mode === TIMELINE_SELECTION_MODE_FRAME) {
      const validIndexes = new Set();
      timelineSelection.frameIndexes.forEach(index => {
        if (Number.isInteger(index) && index >= 0 && index < state.frames.length) {
          validIndexes.add(index);
        }
      });
      if (validIndexes.size !== timelineSelection.frameIndexes.size) {
        timelineSelection.frameIndexes = validIndexes;
        changed = true;
      }
      if (!timelineSelection.frameIndexes.size) {
        timelineSelection.mode = TIMELINE_SELECTION_MODE_NONE;
        changed = true;
      }
      if (timelineSelection.slotKeys.size) {
        timelineSelection.slotKeys.clear();
        changed = true;
      }
      if (timelineSelection.layerIndexes.size) {
        timelineSelection.layerIndexes.clear();
        changed = true;
      }
      return changed;
    }
    if (timelineSelection.mode === TIMELINE_SELECTION_MODE_LAYER) {
      const activeFrame = getActiveFrame();
      const layerCount = activeFrame && Array.isArray(activeFrame.layers) ? activeFrame.layers.length : 0;
      const validIndexes = new Set();
      timelineSelection.layerIndexes.forEach(index => {
        if (Number.isInteger(index) && index >= 0 && index < layerCount) {
          validIndexes.add(index);
        }
      });
      if (validIndexes.size !== timelineSelection.layerIndexes.size) {
        timelineSelection.layerIndexes = validIndexes;
        changed = true;
      }
      if (!timelineSelection.layerIndexes.size) {
        timelineSelection.mode = TIMELINE_SELECTION_MODE_NONE;
        changed = true;
      }
      if (timelineSelection.frameIndexes.size) {
        timelineSelection.frameIndexes.clear();
        changed = true;
      }
      if (timelineSelection.slotKeys.size) {
        timelineSelection.slotKeys.clear();
        changed = true;
      }
      return changed;
    }
    if (timelineSelection.mode === TIMELINE_SELECTION_MODE_SLOT) {
      const validKeys = new Set();
      timelineSelection.slotKeys.forEach(key => {
        const parsed = parseTimelineSlotKey(key);
        if (parsed && hasTimelineLayerIndex(parsed.frameIndex, parsed.layerIndex)) {
          validKeys.add(createTimelineSlotKey(parsed.frameIndex, parsed.layerIndex));
        }
      });
      if (validKeys.size !== timelineSelection.slotKeys.size) {
        timelineSelection.slotKeys = validKeys;
        changed = true;
      }
      if (!timelineSelection.slotKeys.size) {
        timelineSelection.mode = TIMELINE_SELECTION_MODE_NONE;
        changed = true;
      }
      if (timelineSelection.frameIndexes.size) {
        timelineSelection.frameIndexes.clear();
        changed = true;
      }
      if (timelineSelection.layerIndexes.size) {
        timelineSelection.layerIndexes.clear();
        changed = true;
      }
      return changed;
    }
    if (timelineSelection.frameIndexes.size || timelineSelection.layerIndexes.size || timelineSelection.slotKeys.size) {
      timelineSelection.frameIndexes.clear();
      timelineSelection.layerIndexes.clear();
      timelineSelection.slotKeys.clear();
      changed = true;
    }
    return changed;
  }

  function clearTimelineSelection() {
    const hadSelection = timelineSelection.mode !== TIMELINE_SELECTION_MODE_NONE
      || timelineSelection.frameIndexes.size > 0
      || timelineSelection.layerIndexes.size > 0
      || timelineSelection.slotKeys.size > 0;
    timelineSelection.mode = TIMELINE_SELECTION_MODE_NONE;
    timelineSelection.frameIndexes.clear();
    timelineSelection.layerIndexes.clear();
    timelineSelection.slotKeys.clear();
    return hadSelection;
  }

  function clearTimelineSelectionForCanvasInteraction() {
    if (!clearTimelineSelection()) {
      return false;
    }
    renderTimelineMatrix();
    return true;
  }

  function setTimelineFrameSelection(frameIndex, { append = false } = {}) {
    if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= state.frames.length) {
      return false;
    }
    let changed = false;
    if (timelineSelection.mode !== TIMELINE_SELECTION_MODE_FRAME) {
      timelineSelection.mode = TIMELINE_SELECTION_MODE_FRAME;
      timelineSelection.slotKeys.clear();
      timelineSelection.layerIndexes.clear();
      timelineSelection.frameIndexes.clear();
      changed = true;
    }
    if (!append) {
      if (timelineSelection.frameIndexes.size !== 1 || !timelineSelection.frameIndexes.has(frameIndex)) {
        timelineSelection.frameIndexes.clear();
        timelineSelection.frameIndexes.add(frameIndex);
        changed = true;
      }
      return changed;
    }
    if (!timelineSelection.frameIndexes.has(frameIndex)) {
      timelineSelection.frameIndexes.add(frameIndex);
      changed = true;
    }
    if (!timelineSelection.frameIndexes.size) {
      timelineSelection.frameIndexes.add(frameIndex);
      changed = true;
    }
    return changed;
  }

  function setTimelineSlotSelection(frameIndex, layerIndex, { append = false } = {}) {
    if (!hasTimelineLayerIndex(frameIndex, layerIndex)) {
      return false;
    }
    const key = createTimelineSlotKey(frameIndex, layerIndex);
    let changed = false;
    if (timelineSelection.mode !== TIMELINE_SELECTION_MODE_SLOT) {
      timelineSelection.mode = TIMELINE_SELECTION_MODE_SLOT;
      timelineSelection.frameIndexes.clear();
      timelineSelection.layerIndexes.clear();
      timelineSelection.slotKeys.clear();
      changed = true;
    }
    if (!append) {
      if (timelineSelection.slotKeys.size !== 1 || !timelineSelection.slotKeys.has(key)) {
        timelineSelection.slotKeys.clear();
        timelineSelection.slotKeys.add(key);
        changed = true;
      }
      return changed;
    }
    if (!timelineSelection.slotKeys.has(key)) {
      timelineSelection.slotKeys.add(key);
      changed = true;
    }
    if (!timelineSelection.slotKeys.size) {
      timelineSelection.slotKeys.add(key);
      changed = true;
    }
    return changed;
  }

  function setTimelineLayerSelection(layerIndex, { append = false } = {}) {
    const activeFrame = getActiveFrame();
    const layerCount = activeFrame && Array.isArray(activeFrame.layers) ? activeFrame.layers.length : 0;
    if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= layerCount) {
      return false;
    }
    let changed = false;
    if (timelineSelection.mode !== TIMELINE_SELECTION_MODE_LAYER) {
      timelineSelection.mode = TIMELINE_SELECTION_MODE_LAYER;
      timelineSelection.frameIndexes.clear();
      timelineSelection.slotKeys.clear();
      timelineSelection.layerIndexes.clear();
      changed = true;
    }
    if (!append) {
      if (timelineSelection.layerIndexes.size !== 1 || !timelineSelection.layerIndexes.has(layerIndex)) {
        timelineSelection.layerIndexes.clear();
        timelineSelection.layerIndexes.add(layerIndex);
        changed = true;
      }
      return changed;
    }
    if (!timelineSelection.layerIndexes.has(layerIndex)) {
      timelineSelection.layerIndexes.add(layerIndex);
      changed = true;
    }
    if (!timelineSelection.layerIndexes.size) {
      timelineSelection.layerIndexes.add(layerIndex);
      changed = true;
    }
    return changed;
  }

  function getTimelineSelectedFrameIndexes() {
    normalizeTimelineSelectionState();
    if (timelineSelection.mode !== TIMELINE_SELECTION_MODE_FRAME || !timelineSelection.frameIndexes.size) {
      return [];
    }
    return Array.from(timelineSelection.frameIndexes).sort((a, b) => a - b);
  }

  function getTimelineSelectedSlotEntries() {
    normalizeTimelineSelectionState();
    if (timelineSelection.mode !== TIMELINE_SELECTION_MODE_SLOT || !timelineSelection.slotKeys.size) {
      return [];
    }
    const entries = [];
    timelineSelection.slotKeys.forEach(key => {
      const parsed = parseTimelineSlotKey(key);
      if (parsed && hasTimelineLayerIndex(parsed.frameIndex, parsed.layerIndex)) {
        entries.push(parsed);
      }
    });
    return entries;
  }

  function getTimelineSelectedLayerIndexes() {
    normalizeTimelineSelectionState();
    if (timelineSelection.mode !== TIMELINE_SELECTION_MODE_LAYER || !timelineSelection.layerIndexes.size) {
      return [];
    }
    return Array.from(timelineSelection.layerIndexes).sort((a, b) => a - b);
  }

  function hasTimelineStructureSelection() {
    return getTimelineSelectedFrameIndexes().length > 0 || getTimelineSelectedLayerIndexes().length > 0;
  }

  function copyTimelineSelection() {
    const selectedFrameIndexes = getTimelineSelectedFrameIndexes();
    if (selectedFrameIndexes.length) {
      const frames = selectedFrameIndexes
        .map(index => snapshotFrameForClipboard(state.frames[index], state.width, state.height))
        .filter(Boolean);
      if (!frames.length) {
        return false;
      }
      internalClipboard.timeline = {
        kind: 'frame',
        width: state.width,
        height: state.height,
        frames,
      };
      updateAutosaveStatus(
        localizeText(
          `フレームをコピーしました (${frames.length})`,
          `Copied ${frames.length} frame${frames.length === 1 ? '' : 's'}`
        ),
        'info'
      );
      return true;
    }

    const selectedLayerIndexes = getTimelineSelectedLayerIndexes();
    if (selectedLayerIndexes.length) {
      const tracks = selectedLayerIndexes.map(layerIndex => ({
        layers: state.frames.map(frame => snapshotLayerForClipboard(frame?.layers?.[layerIndex], state.width, state.height)),
      }));
      if (!tracks.length) {
        return false;
      }
      internalClipboard.timeline = {
        kind: 'layer',
        width: state.width,
        height: state.height,
        tracks,
      };
      updateAutosaveStatus(
        localizeText(
          `レイヤーをコピーしました (${tracks.length})`,
          `Copied ${tracks.length} layer${tracks.length === 1 ? '' : 's'}`
        ),
        'info'
      );
      return true;
    }

    return false;
  }

  function validateTimelineClipboardDimensions(clip) {
    const clipWidth = Math.max(0, Math.floor(Number(clip?.width) || 0));
    const clipHeight = Math.max(0, Math.floor(Number(clip?.height) || 0));
    if (clipWidth === state.width && clipHeight === state.height) {
      return true;
    }
    updateAutosaveStatus(
      localizeText(
        'タイムラインのコピー元と現在のキャンバスサイズが違うため貼り付けできません',
        'Cannot paste timeline data because the clipboard size does not match the current canvas'
      ),
      'warn'
    );
    return false;
  }

  function pasteTimelineClipboard() {
    const clip = internalClipboard.timeline;
    if (!clip) {
      return false;
    }
    if (state.playback.isPlaying) {
      return false;
    }
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(
          localizeText(
            '参加/視聴モードではフレーム / レイヤー貼り付けはマスターのみ操作できます',
            'In participant/viewer mode, only the master can paste frames or layers'
          ),
          'warn'
        );
      }
      return false;
    }
    if (!validateTimelineClipboardDimensions(clip)) {
      return false;
    }

    if (clip.kind === 'frame') {
      const targetIndexes = getTimelineSelectedFrameIndexes();
      const sourceFrames = Array.isArray(clip.frames) ? clip.frames : [];
      if (!targetIndexes.length || !sourceFrames.length) {
        return false;
      }
      const insertIndex = targetIndexes[targetIndexes.length - 1] + 1;
      const preferredLayerIndex = getActiveLayerIndex();
      const pastedFrames = sourceFrames
        .map(frame => createFrameFromClipboardSnapshot(frame, state.width, state.height))
        .filter(Boolean);
      if (!pastedFrames.length) {
        return false;
      }
      beginHistory('pasteFrame');
      state.frames.splice(insertIndex, 0, ...pastedFrames);
      state.activeFrame = insertIndex;
      const activePastedFrame = state.frames[insertIndex];
      if (activePastedFrame?.layers?.length) {
        const nextLayerIndex = preferredLayerIndex >= 0
          ? clamp(preferredLayerIndex, 0, activePastedFrame.layers.length - 1)
          : (activePastedFrame.layers.length - 1);
        state.activeLayer = activePastedFrame.layers[nextLayerIndex].id;
      }
      timelineSelection.mode = TIMELINE_SELECTION_MODE_FRAME;
      timelineSelection.frameIndexes = new Set(pastedFrames.map((_, offset) => insertIndex + offset));
      timelineSelection.layerIndexes.clear();
      timelineSelection.slotKeys.clear();
      normalizeTimelineSelectionState();
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
      updateAutosaveStatus(
        localizeText(
          `フレームを貼り付けました (${pastedFrames.length})`,
          `Pasted ${pastedFrames.length} frame${pastedFrames.length === 1 ? '' : 's'}`
        ),
        'success'
      );
      return true;
    }

    if (clip.kind === 'layer') {
      const targetIndexes = getTimelineSelectedLayerIndexes();
      const tracks = Array.isArray(clip.tracks) ? clip.tracks : [];
      if (!targetIndexes.length || !tracks.length) {
        return false;
      }
      const insertIndex = targetIndexes[targetIndexes.length - 1] + 1;
      beginHistory('pasteLayer');
      tracks.forEach((track, offset) => {
        const layerSnapshots = Array.isArray(track?.layers) ? track.layers : [];
        const fallbackLayerSnapshot = layerSnapshots.find(Boolean) || null;
        state.frames.forEach((frame, frameIndex) => {
          if (!frame || !Array.isArray(frame.layers)) {
            return;
          }
          const sourceLayerSnapshot = layerSnapshots[frameIndex] || fallbackLayerSnapshot;
          const newLayer = createLayerFromClipboardSnapshot(sourceLayerSnapshot, state.width, state.height);
          frame.layers.splice(insertIndex + offset, 0, newLayer);
        });
      });
      const insertedIndexes = tracks.map((_, offset) => insertIndex + offset);
      const activeFrame = getActiveFrame();
      if (activeFrame?.layers?.length && insertedIndexes.length) {
        const nextLayer = activeFrame.layers[clamp(insertedIndexes[0], 0, activeFrame.layers.length - 1)];
        if (nextLayer) {
          state.activeLayer = nextLayer.id;
        }
      }
      timelineSelection.mode = TIMELINE_SELECTION_MODE_LAYER;
      timelineSelection.layerIndexes = new Set(insertedIndexes);
      timelineSelection.frameIndexes.clear();
      timelineSelection.slotKeys.clear();
      normalizeTimelineSelectionState();
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
      updateAutosaveStatus(
        localizeText(
          `レイヤーを貼り付けました (${tracks.length})`,
          `Pasted ${tracks.length} layer${tracks.length === 1 ? '' : 's'}`
        ),
        'success'
      );
      return true;
    }

    return false;
  }

  function settlePendingHistoryBeforeTimelineStructureChange() {
    if (pointerState.active) {
      setMultiStatus(
        localizeText(
          '現在の描画を確定してからフレーム/レイヤーを変更してください。',
          'Finish the current stroke before changing frames or layers.'
        ),
        'warn'
      );
      return false;
    }
    if (history.pending) {
      commitHistory();
    }
    return !history.pending;
  }

  function duplicateSelectedTimelineFrames() {
    const selectedFrameIndexes = getTimelineSelectedFrameIndexes();
    if (!selectedFrameIndexes.length) {
      return false;
    }
    if (state.playback.isPlaying) {
      return false;
    }
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(
          localizeText(
            '参加/視聴モードではフレーム複製はマスターのみ操作できます',
            'In participant/viewer mode, only the master can duplicate frames'
          ),
          'warn'
        );
      }
      return false;
    }
    const insertIndex = selectedFrameIndexes[selectedFrameIndexes.length - 1] + 1;
    const preferredLayerIndex = getActiveLayerIndex();
    const useCopyOnWriteRaster = Number(state.rasterModelVersion) >= 1
      && typeof cloneFrameWithSharedRaster === 'function';
    const duplicatedFrames = selectedFrameIndexes
      .map(index => {
        const sourceFrame = state.frames[index];
        if (useCopyOnWriteRaster) {
          return cloneFrameWithSharedRaster(sourceFrame, state.width, state.height);
        }
        const snapshot = snapshotFrameForClipboard(sourceFrame, state.width, state.height);
        return snapshot
          ? createFrameFromClipboardSnapshot(snapshot, state.width, state.height)
          : null;
      })
      .filter(Boolean)
      .map((frame, offset) => {
        frame.name = getDefaultFrameName(insertIndex + offset + 1);
        return frame;
      });
    if (!duplicatedFrames.length) {
      return false;
    }
    if (!settlePendingHistoryBeforeTimelineStructureChange()) {
      return false;
    }
    beginHistory('duplicateFrame');
    state.frames.splice(insertIndex, 0, ...duplicatedFrames);
    clearPendingMultiAssignmentMoveRequests();
    state.activeFrame = insertIndex;
    const activeDuplicatedFrame = state.frames[insertIndex];
    if (activeDuplicatedFrame?.layers?.length) {
      const nextLayerIndex = preferredLayerIndex >= 0
        ? clamp(preferredLayerIndex, 0, activeDuplicatedFrame.layers.length - 1)
        : (activeDuplicatedFrame.layers.length - 1);
      state.activeLayer = activeDuplicatedFrame.layers[nextLayerIndex].id;
    }
    timelineSelection.mode = TIMELINE_SELECTION_MODE_FRAME;
    timelineSelection.frameIndexes = new Set(duplicatedFrames.map((_, offset) => insertIndex + offset));
    timelineSelection.layerIndexes.clear();
    timelineSelection.slotKeys.clear();
    normalizeTimelineSelectionState();
    markHistoryDirty();
    scheduleSessionPersist();
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    commitHistory();
    updateAutosaveStatus(
      localizeText(
        `フレームを複製しました (${duplicatedFrames.length})`,
        `Duplicated ${duplicatedFrames.length} frame${duplicatedFrames.length === 1 ? '' : 's'}`
      ),
      'success'
    );
    return true;
  }

  function duplicateSelectedTimelineLayers() {
    const selectedLayerIndexes = getTimelineSelectedLayerIndexes();
    if (!selectedLayerIndexes.length) {
      return false;
    }
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(
          localizeText(
            '参加/視聴モードではレイヤー複製はマスターのみ操作できます',
            'In participant/viewer mode, only the master can duplicate layers'
          ),
          'warn'
        );
      }
      return false;
    }
    const insertIndex = selectedLayerIndexes[selectedLayerIndexes.length - 1] + 1;
    const trackSnapshots = selectedLayerIndexes.map(layerIndex => ({
      layers: state.frames.map(frame => snapshotLayerForClipboard(frame?.layers?.[layerIndex], state.width, state.height)),
    }));
    if (!trackSnapshots.length) {
      return false;
    }
    beginHistory('duplicateLayer');
    trackSnapshots.forEach((track, offset) => {
      const layerSnapshots = Array.isArray(track?.layers) ? track.layers : [];
      const fallbackLayerSnapshot = layerSnapshots.find(Boolean) || null;
      state.frames.forEach((frame, frameIndex) => {
        if (!frame || !Array.isArray(frame.layers)) {
          return;
        }
        const sourceLayerSnapshot = layerSnapshots[frameIndex] || fallbackLayerSnapshot;
        const newLayer = createLayerFromClipboardSnapshot(sourceLayerSnapshot, state.width, state.height);
        frame.layers.splice(insertIndex + offset, 0, newLayer);
      });
    });
    clearPendingMultiAssignmentMoveRequests();
    const insertedIndexes = trackSnapshots.map((_, offset) => insertIndex + offset);
    const activeFrame = getActiveFrame();
    if (activeFrame?.layers?.length && insertedIndexes.length) {
      const nextLayer = activeFrame.layers[clamp(insertedIndexes[0], 0, activeFrame.layers.length - 1)];
      if (nextLayer) {
        state.activeLayer = nextLayer.id;
      }
    }
    timelineSelection.mode = TIMELINE_SELECTION_MODE_LAYER;
    timelineSelection.layerIndexes = new Set(insertedIndexes);
    timelineSelection.frameIndexes.clear();
    timelineSelection.slotKeys.clear();
    normalizeTimelineSelectionState();
    markHistoryDirty();
    scheduleSessionPersist();
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    commitHistory();
    updateAutosaveStatus(
      localizeText(
        `レイヤーを複製しました (${trackSnapshots.length})`,
        `Duplicated ${trackSnapshots.length} layer${trackSnapshots.length === 1 ? '' : 's'}`
      ),
      'success'
    );
    return true;
  }

  function swapLayerPixelPayload(layerA, layerB) {
    if (!layerA || !layerB) {
      return;
    }
    const indices = layerA.indices;
    layerA.indices = layerB.indices;
    layerB.indices = indices;
    const direct = layerA.direct;
    layerA.direct = layerB.direct;
    layerB.direct = direct;
  }

  function moveFrameIndexesByOffset(selectedIndexes, offset) {
    const frameCount = state.frames.length;
    if (!Array.isArray(selectedIndexes) || !selectedIndexes.length || frameCount <= 1 || !Number.isInteger(offset) || offset === 0) {
      return { moved: false, selectedIndexes: [] };
    }
    const selectedFlags = new Array(frameCount).fill(false);
    selectedIndexes.forEach(index => {
      if (Number.isInteger(index) && index >= 0 && index < frameCount) {
        selectedFlags[index] = true;
      }
    });
    let moved = false;
    if (offset < 0) {
      for (let frameIndex = 1; frameIndex < frameCount; frameIndex += 1) {
        if (!selectedFlags[frameIndex] || selectedFlags[frameIndex - 1]) {
          continue;
        }
        const previousFrame = state.frames[frameIndex - 1];
        state.frames[frameIndex - 1] = state.frames[frameIndex];
        state.frames[frameIndex] = previousFrame;
        selectedFlags[frameIndex - 1] = true;
        selectedFlags[frameIndex] = false;
        moved = true;
      }
    } else {
      for (let frameIndex = frameCount - 2; frameIndex >= 0; frameIndex -= 1) {
        if (!selectedFlags[frameIndex] || selectedFlags[frameIndex + 1]) {
          continue;
        }
        const nextFrame = state.frames[frameIndex + 1];
        state.frames[frameIndex + 1] = state.frames[frameIndex];
        state.frames[frameIndex] = nextFrame;
        selectedFlags[frameIndex + 1] = true;
        selectedFlags[frameIndex] = false;
        moved = true;
      }
    }
    const nextSelection = [];
    selectedFlags.forEach((isSelected, index) => {
      if (isSelected) {
        nextSelection.push(index);
      }
    });
    return { moved, selectedIndexes: nextSelection };
  }

  function moveLayerIndexesByOffset(selectedIndexes, offset) {
    const activeFrame = getActiveFrame();
    const layerCount = activeFrame && Array.isArray(activeFrame.layers) ? activeFrame.layers.length : 0;
    if (!Array.isArray(selectedIndexes) || !selectedIndexes.length || layerCount <= 1 || !Number.isInteger(offset) || offset === 0) {
      return { moved: false, selectedIndexes: [] };
    }
    const selectedFlags = new Array(layerCount).fill(false);
    selectedIndexes.forEach(index => {
      if (Number.isInteger(index) && index >= 0 && index < layerCount) {
        selectedFlags[index] = true;
      }
    });
    let moved = false;
    if (offset < 0) {
      for (let layerIndex = 1; layerIndex < layerCount; layerIndex += 1) {
        if (!selectedFlags[layerIndex] || selectedFlags[layerIndex - 1]) {
          continue;
        }
        state.frames.forEach(frame => {
          if (!frame || !Array.isArray(frame.layers) || layerIndex >= frame.layers.length) {
            return;
          }
          const previousLayer = frame.layers[layerIndex - 1];
          frame.layers[layerIndex - 1] = frame.layers[layerIndex];
          frame.layers[layerIndex] = previousLayer;
        });
        selectedFlags[layerIndex - 1] = true;
        selectedFlags[layerIndex] = false;
        moved = true;
      }
    } else {
      for (let layerIndex = layerCount - 2; layerIndex >= 0; layerIndex -= 1) {
        if (!selectedFlags[layerIndex] || selectedFlags[layerIndex + 1]) {
          continue;
        }
        state.frames.forEach(frame => {
          if (!frame || !Array.isArray(frame.layers) || layerIndex + 1 >= frame.layers.length) {
            return;
          }
          const nextLayer = frame.layers[layerIndex + 1];
          frame.layers[layerIndex + 1] = frame.layers[layerIndex];
          frame.layers[layerIndex] = nextLayer;
        });
        selectedFlags[layerIndex + 1] = true;
        selectedFlags[layerIndex] = false;
        moved = true;
      }
    }
    const nextSelection = [];
    selectedFlags.forEach((isSelected, index) => {
      if (isSelected) {
        nextSelection.push(index);
      }
    });
    return { moved, selectedIndexes: nextSelection };
  }

  function moveSelectedSlotsHorizontally(offset) {
    if (!Number.isInteger(offset) || offset === 0) {
      return false;
    }
    const selectedEntries = getTimelineSelectedSlotEntries();
    if (!selectedEntries.length) {
      return false;
    }
    const frameCount = state.frames.length;
    if (frameCount <= 1) {
      return false;
    }
    const selectedKeys = new Set(timelineSelection.slotKeys);
    const activeLayerIndex = getActiveLayerIndex();
    let activePosition = activeLayerIndex >= 0
      ? { frameIndex: state.activeFrame, layerIndex: activeLayerIndex }
      : null;
    let moved = false;
    const maxLayerCount = state.frames.reduce((max, frame) => Math.max(max, frame?.layers?.length || 0), 0);
    const layerStart = offset < 0 ? 0 : maxLayerCount - 1;
    const layerEnd = offset < 0 ? maxLayerCount : -1;
    const layerStep = offset < 0 ? 1 : -1;
    for (let layerIndex = layerStart; layerIndex !== layerEnd; layerIndex += layerStep) {
      if (offset < 0) {
        for (let frameIndex = 1; frameIndex < frameCount; frameIndex += 1) {
          const sourceKey = createTimelineSlotKey(frameIndex, layerIndex);
          const targetKey = createTimelineSlotKey(frameIndex - 1, layerIndex);
          if (!selectedKeys.has(sourceKey) || selectedKeys.has(targetKey)) {
            continue;
          }
          if (!hasTimelineLayerIndex(frameIndex, layerIndex) || !hasTimelineLayerIndex(frameIndex - 1, layerIndex)) {
            continue;
          }
          const sourceLayer = state.frames[frameIndex].layers[layerIndex];
          const targetLayer = state.frames[frameIndex - 1].layers[layerIndex];
          swapLayerPixelPayload(sourceLayer, targetLayer);
          selectedKeys.delete(sourceKey);
          selectedKeys.add(targetKey);
          if (activePosition) {
            if (activePosition.frameIndex === frameIndex && activePosition.layerIndex === layerIndex) {
              activePosition = { frameIndex: frameIndex - 1, layerIndex };
            } else if (activePosition.frameIndex === frameIndex - 1 && activePosition.layerIndex === layerIndex) {
              activePosition = { frameIndex, layerIndex };
            }
          }
          moved = true;
        }
      } else {
        for (let frameIndex = frameCount - 2; frameIndex >= 0; frameIndex -= 1) {
          const sourceKey = createTimelineSlotKey(frameIndex, layerIndex);
          const targetKey = createTimelineSlotKey(frameIndex + 1, layerIndex);
          if (!selectedKeys.has(sourceKey) || selectedKeys.has(targetKey)) {
            continue;
          }
          if (!hasTimelineLayerIndex(frameIndex, layerIndex) || !hasTimelineLayerIndex(frameIndex + 1, layerIndex)) {
            continue;
          }
          const sourceLayer = state.frames[frameIndex].layers[layerIndex];
          const targetLayer = state.frames[frameIndex + 1].layers[layerIndex];
          swapLayerPixelPayload(sourceLayer, targetLayer);
          selectedKeys.delete(sourceKey);
          selectedKeys.add(targetKey);
          if (activePosition) {
            if (activePosition.frameIndex === frameIndex && activePosition.layerIndex === layerIndex) {
              activePosition = { frameIndex: frameIndex + 1, layerIndex };
            } else if (activePosition.frameIndex === frameIndex + 1 && activePosition.layerIndex === layerIndex) {
              activePosition = { frameIndex, layerIndex };
            }
          }
          moved = true;
        }
      }
    }
    if (!moved) {
      return false;
    }
    timelineSelection.mode = TIMELINE_SELECTION_MODE_SLOT;
    timelineSelection.slotKeys = selectedKeys;
    timelineSelection.frameIndexes.clear();
    timelineSelection.layerIndexes.clear();
    if (activePosition && hasTimelineLayerIndex(activePosition.frameIndex, activePosition.layerIndex)) {
      state.activeFrame = activePosition.frameIndex;
      const activeLayer = state.frames[activePosition.frameIndex]?.layers?.[activePosition.layerIndex];
      if (activeLayer) {
        state.activeLayer = activeLayer.id;
      }
    }
    normalizeTimelineSelectionState();
    return true;
  }

  function moveSelectedSlotsVertically(offset) {
    if (!Number.isInteger(offset) || offset === 0) {
      return false;
    }
    const selectedEntries = getTimelineSelectedSlotEntries();
    if (!selectedEntries.length) {
      return false;
    }
    const selectedKeys = new Set(timelineSelection.slotKeys);
    const activeLayerIndex = getActiveLayerIndex();
    let activePosition = activeLayerIndex >= 0
      ? { frameIndex: state.activeFrame, layerIndex: activeLayerIndex }
      : null;
    let moved = false;
    state.frames.forEach((frame, frameIndex) => {
      if (!frame || !Array.isArray(frame.layers) || frame.layers.length <= 1) {
        return;
      }
      if (offset < 0) {
        for (let layerIndex = 1; layerIndex < frame.layers.length; layerIndex += 1) {
          const sourceKey = createTimelineSlotKey(frameIndex, layerIndex);
          const targetKey = createTimelineSlotKey(frameIndex, layerIndex - 1);
          if (!selectedKeys.has(sourceKey) || selectedKeys.has(targetKey)) {
            continue;
          }
          const sourceLayer = frame.layers[layerIndex];
          const targetLayer = frame.layers[layerIndex - 1];
          swapLayerPixelPayload(sourceLayer, targetLayer);
          selectedKeys.delete(sourceKey);
          selectedKeys.add(targetKey);
          if (activePosition) {
            if (activePosition.frameIndex === frameIndex && activePosition.layerIndex === layerIndex) {
              activePosition = { frameIndex, layerIndex: layerIndex - 1 };
            } else if (activePosition.frameIndex === frameIndex && activePosition.layerIndex === layerIndex - 1) {
              activePosition = { frameIndex, layerIndex };
            }
          }
          moved = true;
        }
      } else {
        for (let layerIndex = frame.layers.length - 2; layerIndex >= 0; layerIndex -= 1) {
          const sourceKey = createTimelineSlotKey(frameIndex, layerIndex);
          const targetKey = createTimelineSlotKey(frameIndex, layerIndex + 1);
          if (!selectedKeys.has(sourceKey) || selectedKeys.has(targetKey)) {
            continue;
          }
          const sourceLayer = frame.layers[layerIndex];
          const targetLayer = frame.layers[layerIndex + 1];
          swapLayerPixelPayload(sourceLayer, targetLayer);
          selectedKeys.delete(sourceKey);
          selectedKeys.add(targetKey);
          if (activePosition) {
            if (activePosition.frameIndex === frameIndex && activePosition.layerIndex === layerIndex) {
              activePosition = { frameIndex, layerIndex: layerIndex + 1 };
            } else if (activePosition.frameIndex === frameIndex && activePosition.layerIndex === layerIndex + 1) {
              activePosition = { frameIndex, layerIndex };
            }
          }
          moved = true;
        }
      }
    });
    if (!moved) {
      return false;
    }
    timelineSelection.mode = TIMELINE_SELECTION_MODE_SLOT;
    timelineSelection.slotKeys = selectedKeys;
    timelineSelection.frameIndexes.clear();
    timelineSelection.layerIndexes.clear();
    if (activePosition && hasTimelineLayerIndex(activePosition.frameIndex, activePosition.layerIndex)) {
      state.activeFrame = activePosition.frameIndex;
      const activeLayer = state.frames[activePosition.frameIndex]?.layers?.[activePosition.layerIndex];
      if (activeLayer) {
        state.activeLayer = activeLayer.id;
      }
    }
    normalizeTimelineSelectionState();
    return true;
  }

  function moveActiveLayer(offset) {
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(localizeText('参加/視聴モードではレイヤー移動はマスターのみ操作できます', 'In participant/viewer mode, only the master can move layers'), 'warn');
      }
      return;
    }
    if (!Number.isInteger(offset) || offset === 0) return;
    if (timelineSelection.mode === TIMELINE_SELECTION_MODE_SLOT && timelineSelection.slotKeys.size > 0) {
      beginHistory(offset < 0 ? 'moveLayerCellsUp' : 'moveLayerCellsDown');
      const movedSelectedSlots = moveSelectedSlotsVertically(offset);
      if (!movedSelectedSlots) {
        history.pending = null;
        return;
      }
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
      return;
    }
    if (timelineSelection.mode === TIMELINE_SELECTION_MODE_LAYER && timelineSelection.layerIndexes.size > 0) {
      const selectedLayers = getTimelineSelectedLayerIndexes();
      const activeFrameForLayerMove = getActiveFrame();
      const activeLayerIndex = getActiveLayerIndex();
      const activeLayerRef = activeFrameForLayerMove && activeLayerIndex >= 0
        ? activeFrameForLayerMove.layers[activeLayerIndex]
        : null;
      beginHistory(offset < 0 ? 'moveLayerGroupUp' : 'moveLayerGroupDown');
      const moveResult = moveLayerIndexesByOffset(selectedLayers, offset);
      if (!moveResult.moved) {
        history.pending = null;
        return;
      }
      clearPendingMultiAssignmentMoveRequests();
      if (activeLayerRef) {
        const updatedFrame = getActiveFrame();
        if (updatedFrame && Array.isArray(updatedFrame.layers)) {
          const nextActiveLayerIndex = updatedFrame.layers.indexOf(activeLayerRef);
          if (nextActiveLayerIndex >= 0 && updatedFrame.layers[nextActiveLayerIndex]) {
            state.activeLayer = updatedFrame.layers[nextActiveLayerIndex].id;
          }
        }
      }
      timelineSelection.mode = TIMELINE_SELECTION_MODE_LAYER;
      timelineSelection.layerIndexes = new Set(moveResult.selectedIndexes);
      timelineSelection.frameIndexes.clear();
      timelineSelection.slotKeys.clear();
      normalizeTimelineSelectionState();
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
      return;
    }
    const activeFrame = getActiveFrame();
    if (!activeFrame) return;
    const currentIndex = getActiveLayerIndex();
    if (currentIndex < 0) return;
    const targetIndex = clamp(currentIndex + offset, 0, activeFrame.layers.length - 1);
    if (targetIndex === currentIndex) return;
    beginHistory(offset < 0 ? 'moveLayerUp' : 'moveLayerDown');
    state.frames.forEach(frame => {
      if (currentIndex < 0 || currentIndex >= frame.layers.length) return;
      const [layer] = frame.layers.splice(currentIndex, 1);
      frame.layers.splice(targetIndex, 0, layer);
    });
    clearPendingMultiAssignmentMoveRequests();
    const updatedFrame = getActiveFrame();
    if (updatedFrame && updatedFrame.layers[targetIndex]) {
      state.activeLayer = updatedFrame.layers[targetIndex].id;
    }
    markHistoryDirty();
    scheduleSessionPersist();
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    commitHistory();
  }

  function moveActiveFrame(offset) {
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      if (!isSharedProjectCollaborativeMode()) {
        setMultiStatus(localizeText('参加/視聴モードではフレーム移動はマスターのみ操作できます', 'In participant/viewer mode, only the master can move frames'), 'warn');
      }
      return;
    }
    if (!Number.isInteger(offset) || offset === 0) return;
    if (timelineSelection.mode === TIMELINE_SELECTION_MODE_SLOT && timelineSelection.slotKeys.size > 0) {
      beginHistory(offset < 0 ? 'moveSlotFrameLeft' : 'moveSlotFrameRight');
      const movedSelectedSlots = moveSelectedSlotsHorizontally(offset);
      if (!movedSelectedSlots) {
        history.pending = null;
        return;
      }
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
      return;
    }
    const currentIndex = state.activeFrame;
    const frameCount = state.frames.length;
    if (!Number.isFinite(currentIndex) || currentIndex < 0 || currentIndex >= frameCount || frameCount <= 1) {
      return;
    }
    const selectedFrames = getTimelineSelectedFrameIndexes();
    const frameIndexesToMove = selectedFrames.length ? selectedFrames : [currentIndex];
    const activeFrameRef = state.frames[currentIndex];
    beginHistory(offset < 0 ? 'moveFrameLeft' : 'moveFrameRight');
    const moveResult = moveFrameIndexesByOffset(frameIndexesToMove, offset);
    if (!moveResult.moved) {
      history.pending = null;
      return;
    }
    clearPendingMultiAssignmentMoveRequests();
    const nextActiveIndex = state.frames.indexOf(activeFrameRef);
    if (nextActiveIndex >= 0) {
      state.activeFrame = nextActiveIndex;
    } else {
      state.activeFrame = clamp(state.activeFrame, 0, state.frames.length - 1);
    }
    if (timelineSelection.mode === TIMELINE_SELECTION_MODE_FRAME) {
      timelineSelection.frameIndexes = new Set(moveResult.selectedIndexes);
      timelineSelection.layerIndexes.clear();
      timelineSelection.slotKeys.clear();
      normalizeTimelineSelectionState();
    }
    markHistoryDirty();
    scheduleSessionPersist();
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    commitHistory();
  }

  function setupFramesAndLayers() {
    dom.controls.addLayer?.addEventListener('click', () => {
      if (getTimelineSelectedLayerIndexes().length) {
        duplicateSelectedTimelineLayers();
        return;
      }
      if (!canCurrentClientEditProjectStructure({ announce: true })) {
        if (!isSharedProjectCollaborativeMode()) {
          setMultiStatus(localizeText('参加/視聴モードではレイヤー追加はマスターのみ操作できます', 'In participant/viewer mode, only the master can add layers'), 'warn');
        }
        return;
      }
      const activeFrame = getActiveFrame();
      if (!activeFrame) return;
      if (!settlePendingHistoryBeforeTimelineStructureChange()) {
        return;
      }
      clearTimelineSelection();
      beginHistory('addLayer');
      const insertIndex = clamp(getActiveLayerIndex() + 1, 0, Number.MAX_SAFE_INTEGER);
      state.frames.forEach((frame, frameIndex) => {
        const targetIndex = Math.min(insertIndex, frame.layers.length);
        const name = getDefaultLayerName(frame.layers.length + 1);
        const newLayer = createLayer(name, state.width, state.height, null, {
          deferPixelAllocation: Number(state.rasterModelVersion) >= 1
            || frameIndex !== state.activeFrame,
        });
        frame.layers.splice(targetIndex, 0, newLayer);
        recordPendingLayerAddHistoryLayer(frame, newLayer, targetIndex);
        if (frameIndex === state.activeFrame) {
          state.activeLayer = newLayer.id;
          if (history.pending?.__historyEntryType === 'layerAdd') {
            history.pending.activeLayerAfter = newLayer.id;
          }
        }
      });
      clearPendingMultiAssignmentMoveRequests();
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
    });

    dom.controls.addSimulationLayer?.addEventListener('click', () => {
      if (!canCurrentClientEditProjectStructure({ announce: true })) {
        if (!isSharedProjectCollaborativeMode()) {
          setMultiStatus(localizeText('参加/視聴モードではレイヤー追加はマスターのみ操作できます', 'In participant/viewer mode, only the master can add layers'), 'warn');
        }
        return;
      }
      const activeFrame = getActiveFrame();
      if (!activeFrame) return;
      if (!settlePendingHistoryBeforeTimelineStructureChange()) {
        return;
      }
      clearTimelineSelection();
      beginHistory('addSimulationLayer');
      const insertIndex = clamp(getActiveLayerIndex() + 1, 0, Number.MAX_SAFE_INTEGER);
      state.frames.forEach((frame, frameIndex) => {
        const targetIndex = Math.min(insertIndex, frame.layers.length);
        const name = `${getDefaultLayerName(frame.layers.length + 1)} Sim`;
        const newLayer = createSimulationLayer(name, state.width, state.height);
        frame.layers.splice(targetIndex, 0, newLayer);
        if (frameIndex === state.activeFrame) {
          state.activeLayer = newLayer.id;
        }
      });
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
    });

    dom.controls.removeLayer?.addEventListener('click', () => {
      if (!canCurrentClientEditProjectStructure({ announce: true })) {
        if (!isSharedProjectCollaborativeMode()) {
          setMultiStatus(localizeText('参加/視聴モードではレイヤー削除はマスターのみ操作できます', 'In participant/viewer mode, only the master can delete layers'), 'warn');
        }
        return;
      }
      if (!state.frames.every(frame => frame.layers.length > 1)) {
        return;
      }
      const removeIndex = clamp(getActiveLayerIndex(), 0, Number.MAX_SAFE_INTEGER);
      if (isSharedProjectCollaborativeMode()) {
        const simulatedCanvases = cloneProjectCanvasDocumentsForStructureChange();
        if (!Array.isArray(simulatedCanvases)) {
          return;
        }
        const simulatedCanvas = simulatedCanvases[getActiveProjectCanvasIndex()] || null;
        simulatedCanvas?.frames?.forEach(frame => {
          const targetIndex = clamp(removeIndex, 0, Math.max(0, (frame.layers?.length || 1) - 1));
          if (Array.isArray(frame.layers) && frame.layers.length > 1) {
            frame.layers.splice(targetIndex, 1);
          }
        });
        if (!canNormalizeMultiAssignmentsForCanvasDocuments(simulatedCanvases, { announce: true })) {
          return;
        }
      }
      if (!settlePendingHistoryBeforeTimelineStructureChange()) {
        return;
      }
      clearPendingMultiAssignmentMoveRequests();
      clearTimelineSelection();
      beginHistory('removeLayer');
      state.frames.forEach(frame => {
        const targetIndex = Math.min(removeIndex, frame.layers.length - 1);
        frame.layers.splice(targetIndex, 1);
      });
      const activeFrame = getActiveFrame();
      const nextIndex = clamp(removeIndex - 1, 0, activeFrame.layers.length - 1);
      state.activeLayer = activeFrame.layers[nextIndex].id;
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
    });

    const bindSimulationNumber = (control, apply, output = null, suffix = '') => {
      if (!(control instanceof HTMLInputElement)) return;
      control.addEventListener('input', () => {
        const layer = getSimulationActiveLayer();
        if (!layer) return;
        const value = Number(control.value);
        apply(layer, value);
        if (output) output.textContent = `${Math.round(value)}${suffix}`;
        markHistoryDirty();
        requestRender();
      });
    };
    if (dom.controls.simulationPaintMode instanceof HTMLSelectElement) {
      dom.controls.simulationPaintMode.addEventListener('change', () => {
        simulationEditorState.paintMode = dom.controls.simulationPaintMode.value;
      });
    }
    if (dom.controls.simulationElement instanceof HTMLSelectElement) {
      dom.controls.simulationElement.addEventListener('change', () => {
        simulationEditorState.element = clamp(Math.round(Number(dom.controls.simulationElement.value) || 0), 0, SIM_ELEMENT_LIGHT);
        updateSimulationElementPaletteUi();
      });
    }
    buildSimulationElementPaletteButtons(dom.controls.leftSimulationElementPalette);
    if (dom.controls.simulationShowLeftPalette instanceof HTMLInputElement) {
      dom.controls.simulationShowLeftPalette.addEventListener('change', () => {
        simulationEditorState.showLeftPalette = dom.controls.simulationShowLeftPalette.checked;
        updateSimulationElementPaletteUi();
      });
    }
    bindSimulationNumber(dom.controls.simulationDepthValue, (_layer, value) => {
      simulationEditorState.depthValue = clamp(Math.round(value), 0, 255);
    }, dom.controls.simulationDepthValueOut);
    bindSimulationNumber(dom.controls.simulationAirValue, (_layer, value) => {
      simulationEditorState.airValue = clamp(Math.round(value), 0, 255);
    }, dom.controls.simulationAirValueOut);
    bindSimulationNumber(dom.controls.simulationAtmosphereStrength, (layer, value) => {
      layer.settings.atmosphereStrength = clamp(Number(value) / 100, 0, 1);
      if (dom.controls.simulationAtmosphereStrengthValue) {
        dom.controls.simulationAtmosphereStrengthValue.textContent = `${Math.round(value)}%`;
      }
    });
    bindSimulationNumber(dom.controls.simulationWaterMixStrength, (layer, value) => {
      layer.elementStyle[SIM_ELEMENT_WATER] = normalizeSimulationStyle(SIM_ELEMENT_WATER, {
        ...layer.elementStyle[SIM_ELEMENT_WATER],
        mixStrength: clamp(Number(value) / 100, 0, 1),
      });
      if (dom.controls.simulationWaterMixStrengthValue) {
        dom.controls.simulationWaterMixStrengthValue.textContent = `${Math.round(value)}%`;
      }
    });
    if (dom.controls.simulationAtmosphereEnabled instanceof HTMLInputElement) {
      dom.controls.simulationAtmosphereEnabled.addEventListener('change', () => {
        const layer = getSimulationActiveLayer();
        if (!layer) return;
        layer.settings.atmosphereEnabled = dom.controls.simulationAtmosphereEnabled.checked;
        syncActiveLayerSettingsUI();
        markHistoryDirty();
        requestRender();
      });
    }
    const bindSimulationSelectStyle = (control, element) => {
      if (!(control instanceof HTMLSelectElement)) return;
      control.addEventListener('change', () => {
        const layer = getSimulationActiveLayer();
        if (!layer) return;
        layer.elementStyle[element] = normalizeSimulationStyle(element, {
          ...layer.elementStyle[element],
          displayMode: control.value,
        });
        markHistoryDirty();
        requestRender();
      });
    };
    bindSimulationSelectStyle(dom.controls.simulationWaterDisplayMode, SIM_ELEMENT_WATER);
    bindSimulationSelectStyle(dom.controls.simulationFireDisplayMode, SIM_ELEMENT_FIRE);
    bindSimulationSelectStyle(dom.controls.simulationMetalDisplayMode, SIM_ELEMENT_METAL);
    const bindSimulationColor = (control, key) => {
      if (!(control instanceof HTMLInputElement)) return;
      control.addEventListener('input', () => {
        const layer = getSimulationActiveLayer();
        if (!layer) return;
        const hex = String(control.value || '').replace('#', '');
        if (hex.length !== 6) return;
        layer.elementStyle[SIM_ELEMENT_WATER] = normalizeSimulationStyle(SIM_ELEMENT_WATER, {
          ...layer.elementStyle[SIM_ELEMENT_WATER],
          palette: {
            ...(layer.elementStyle[SIM_ELEMENT_WATER]?.palette || {}),
            [key]: {
              r: parseInt(hex.slice(0, 2), 16),
              g: parseInt(hex.slice(2, 4), 16),
              b: parseInt(hex.slice(4, 6), 16),
              a: 255,
            },
          },
        });
        markHistoryDirty();
        requestRender();
      });
    };
    bindSimulationColor(dom.controls.simulationWaterShallow, 'shallow');
    bindSimulationColor(dom.controls.simulationWaterMid, 'mid');
    bindSimulationColor(dom.controls.simulationWaterDeep, 'deep');
    bindSimulationColor(dom.controls.simulationWaterFoam, 'foam');
    bindSimulationColor(dom.controls.simulationWaterHighlight, 'highlight');
    if (dom.controls.leftSimulationElementPaletteWrap instanceof HTMLElement) {
      dom.controls.leftSimulationElementPaletteWrap.hidden = true;
    }
    updateSimulationElementPaletteUi();

    dom.controls.moveLayerUp?.addEventListener('click', () => {
      moveActiveLayer(-1);
    });

    dom.controls.moveLayerDown?.addEventListener('click', () => {
      moveActiveLayer(1);
    });

    dom.controls.addFrame?.addEventListener('click', () => {
      if (getTimelineSelectedFrameIndexes().length) {
        duplicateSelectedTimelineFrames();
        return;
      }
      addOrDuplicateFrameAfterActive({ duplicate: false });
    });

    dom.controls.removeFrame?.addEventListener('click', () => {
      if (!canCurrentClientEditProjectStructure({ announce: true })) {
        if (!isSharedProjectCollaborativeMode()) {
          setMultiStatus(localizeText('参加/視聴モードではフレーム削除はマスターのみ操作できます', 'In participant/viewer mode, only the master can delete frames'), 'warn');
        }
        return;
      }
      if (state.frames.length <= 1) return;
      if (isSharedProjectCollaborativeMode()) {
        const simulatedCanvases = cloneProjectCanvasDocumentsForStructureChange();
        if (!Array.isArray(simulatedCanvases)) {
          return;
        }
        const simulatedCanvas = simulatedCanvases[getActiveProjectCanvasIndex()] || null;
        if (Array.isArray(simulatedCanvas?.frames) && simulatedCanvas.frames.length > 1) {
          simulatedCanvas.frames.splice(clamp(state.activeFrame, 0, simulatedCanvas.frames.length - 1), 1);
        }
        if (!canNormalizeMultiAssignmentsForCanvasDocuments(simulatedCanvases, { announce: true })) {
          return;
        }
      }
      clearPendingMultiAssignmentMoveRequests();
      clearTimelineSelection();
      beginHistory('removeFrame');
      if (isVoxelExtensionModeEnabled()) {
        getProjectCanvasDocuments().forEach(canvasDoc => {
          if (!canvasDoc || !Array.isArray(canvasDoc.frames) || canvasDoc.frames.length <= 1) {
            return;
          }
          canvasDoc.frames.splice(clamp(state.activeFrame, 0, canvasDoc.frames.length - 1), 1);
          canvasDoc.activeFrame = clamp(state.activeFrame, 0, canvasDoc.frames.length - 1);
          const frame = canvasDoc.frames[canvasDoc.activeFrame];
          canvasDoc.activeLayer = frame?.layers?.[frame.layers.length - 1]?.id || canvasDoc.activeLayer;
        });
        state.activeFrame = clamp(state.activeFrame, 0, state.frames.length - 1);
      } else {
        state.frames.splice(state.activeFrame, 1);
        state.activeFrame = clamp(state.activeFrame, 0, state.frames.length - 1);
      }
      const frame = getActiveFrame();
      state.activeLayer = frame.layers[frame.layers.length - 1].id;
      markHistoryDirty();
      scheduleSessionPersist();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      commitHistory();
    });

    dom.controls.moveFrameUp?.addEventListener('click', () => {
      moveActiveFrame(-1);
    });

    dom.controls.moveFrameDown?.addEventListener('click', () => {
      moveActiveFrame(1);
    });

    if (dom.controls.layerOpacity instanceof HTMLInputElement) {
      const opacityControl = dom.controls.layerOpacity;
      const readOpacityPercent = () => {
        const percent = clamp(Math.round(Number(opacityControl.value) || 0), 0, 100);
        opacityControl.value = String(percent);
        updateLayerOpacityOutput(percent);
        return percent;
      };

      opacityControl.addEventListener('input', () => {
        const opacityPercent = readOpacityPercent();
        if (getActiveLayerTrackIndex() < 0) {
          syncActiveLayerSettingsUI();
          return;
        }
        const changed = setActiveLayerTrackOpacity(opacityPercent / 100);
        if (!changed) {
          return;
        }
        clearPlaybackFrameCache();
        requestRender();
        requestOverlayRender();
        renderLayerList();
        renderTimelineMatrix();
        scheduleSessionPersist({ includeSnapshots: false });
      });
    }

    if (dom.controls.layerBlendMode instanceof HTMLSelectElement) {
      const blendControl = dom.controls.layerBlendMode;
      blendControl.addEventListener('change', () => {
        const normalizedBlendMode = normalizeLayerBlendMode(blendControl.value);
        blendControl.value = normalizedBlendMode;
        beginHistory('setLayerBlendMode');
        const changed = setActiveLayerTrackBlendMode(normalizedBlendMode);
        if (changed) {
          markHistoryDirty();
          requestRender();
          requestOverlayRender();
        }
        commitHistory();
        renderLayerList();
      });
    }

    let onionSkinInteractionActive = false;
    const finalizeOnionSkinInteraction = () => {
      if (!onionSkinInteractionActive) {
        return;
      }
      onionSkinInteractionActive = false;
      commitHistory();
      renderLayerList();
    };

    const applyOnionSkinEnabledChange = enabled => {
      finalizeOnionSkinInteraction();
      beginHistory('toggleOnionSkin');
      const changed = setOnionSkinSettings({ enabled: Boolean(enabled) });
      if (changed) {
        markHistoryDirty();
        requestOverlayRender();
      }
      commitHistory();
      syncActiveFrameSettingsUI();
    };

    if (dom.controls.onionSkinEnabled instanceof HTMLInputElement) {
      const toggle = dom.controls.onionSkinEnabled;
      toggle.addEventListener('change', () => {
        applyOnionSkinEnabledChange(toggle.checked);
      });
    }

    if (dom.controls.toggleOnionSkin instanceof HTMLInputElement) {
      const toggle = dom.controls.toggleOnionSkin;
      toggle.addEventListener('change', () => {
        applyOnionSkinEnabledChange(toggle.checked);
      });
    }

    if (dom.controls.onionPrevFrames instanceof HTMLInputElement) {
      const control = dom.controls.onionPrevFrames;
      const readValue = () => {
        const value = normalizeOnionFrameCount(control.value, DEFAULT_ONION_SKIN.prevFrames);
        control.value = String(value);
        updateOnionSkinCountOutput(dom.controls.onionPrevFramesValue, value);
        return value;
      };
      control.addEventListener('input', () => {
        const value = readValue();
        if (!onionSkinInteractionActive) {
          beginHistory('setOnionSkin');
          onionSkinInteractionActive = true;
        }
        const changed = setOnionSkinSettings({ prevFrames: value });
        if (!changed) {
          return;
        }
        markHistoryDirty();
        requestOverlayRender();
        syncActiveFrameSettingsUI();
      });
      control.addEventListener('change', finalizeOnionSkinInteraction);
      control.addEventListener('blur', finalizeOnionSkinInteraction);
      control.addEventListener('pointercancel', finalizeOnionSkinInteraction);
    }

    if (dom.controls.onionNextFrames instanceof HTMLInputElement) {
      const control = dom.controls.onionNextFrames;
      const readValue = () => {
        const value = normalizeOnionFrameCount(control.value, DEFAULT_ONION_SKIN.nextFrames);
        control.value = String(value);
        updateOnionSkinCountOutput(dom.controls.onionNextFramesValue, value);
        return value;
      };
      control.addEventListener('input', () => {
        const value = readValue();
        if (!onionSkinInteractionActive) {
          beginHistory('setOnionSkin');
          onionSkinInteractionActive = true;
        }
        const changed = setOnionSkinSettings({ nextFrames: value });
        if (!changed) {
          return;
        }
        markHistoryDirty();
        requestOverlayRender();
        syncActiveFrameSettingsUI();
      });
      control.addEventListener('change', finalizeOnionSkinInteraction);
      control.addEventListener('blur', finalizeOnionSkinInteraction);
      control.addEventListener('pointercancel', finalizeOnionSkinInteraction);
    }

    if (dom.controls.onionOpacity instanceof HTMLInputElement) {
      const control = dom.controls.onionOpacity;
      const readValue = () => {
        const percent = clamp(Math.round(Number(control.value) || 0), 0, 100);
        control.value = String(percent);
        updateOnionSkinOpacityOutput(percent);
        return percent / 100;
      };
      control.addEventListener('input', () => {
        const opacity = readValue();
        if (!onionSkinInteractionActive) {
          beginHistory('setOnionSkin');
          onionSkinInteractionActive = true;
        }
        const changed = setOnionSkinSettings({ opacity });
        if (!changed) {
          return;
        }
        markHistoryDirty();
        requestOverlayRender();
        syncActiveFrameSettingsUI();
      });
      control.addEventListener('change', finalizeOnionSkinInteraction);
      control.addEventListener('blur', finalizeOnionSkinInteraction);
      control.addEventListener('pointercancel', finalizeOnionSkinInteraction);
    }

    dom.controls.playAnimation?.addEventListener('click', () => {
      if (!state.playback.isPlaying) {
        startPlayback();
      }
    });
    dom.controls.stopAnimation?.addEventListener('click', () => {
      stopPlayback();
    });
    dom.controls.rewindAnimation?.addEventListener('click', () => {
      stopPlayback();
      jumpToTimelineEdgeOnActiveLayer('start');
    });
    dom.controls.forwardAnimation?.addEventListener('click', () => {
      stopPlayback();
      jumpToTimelineEdgeOnActiveLayer('end');
    });
    dom.controls.loopAnimation?.addEventListener('click', () => {
      state.playback.loop = state.playback.loop === false;
      updatePlaybackButtons();
      applyTimelineToolbarFrames();
      scheduleSessionPersist();
    });
    dom.controls.animationFps?.addEventListener('change', () => {
      const frame = getActiveFrame();
      const fps = normalizeFpsValue(dom.controls.animationFps.value);
      const nextDuration = getDurationFromFps(fps);
      if (frame) {
        frame.duration = nextDuration;
        markHistoryDirty();
      }
      updateAnimationFpsDisplay(fps, nextDuration);
    });

    dom.controls.applyFpsAll?.addEventListener('click', () => {
      const fpsInput = dom.controls.animationFps;
      const fpsValue = fpsInput ? Number(fpsInput.value) : 12;
      applyFpsToAllFrames(fpsValue);
    });

    syncAnimationFpsDisplayFromState();
    updatePlaybackButtons();

    renderFrameList();
    renderLayerList();
    applyTimelineToolbarFrames();
  }

  function startPlayback() {
    if (state.playback.isPlaying && playbackHandle != null) return;
    // Repair projects restored from older files/autosaves that persisted only
    // isPlaying=true without a live requestAnimationFrame handle.
    if (state.playback.isPlaying) {
      state.playback.isPlaying = false;
      clearPlaybackFrameCache();
    }
    if (!Array.isArray(state.frames) || !state.frames.length) {
      return;
    }
    if (pointerState.active) {
      abortActivePointerInteraction({ commitHistory: false });
    }
    if (virtualCursorDrawState.active) {
      cancelVirtualCursorDrawSession();
    }
    releaseVirtualCursorPointer();
    playbackStartSelectionSnapshot = captureLocalTimelineSelectionSnapshot();
    state.playback.isPlaying = true;
    preparePlaybackFrameCache();
    lastFrameTime = performance.now();
    updatePlaybackButtons();
    syncPlaybackTimelineCursorIndicators();
    markCanvasDirty();
    requestRender();
    requestOverlayRender();
    playbackHandle = window.requestAnimationFrame(stepPlayback);
  }

  function schedulePlaybackUiRefresh() {
    if (playbackUiRefreshHandle !== null) {
      window.cancelAnimationFrame(playbackUiRefreshHandle);
    }
    playbackUiRefreshHandle = window.requestAnimationFrame(() => {
      playbackUiRefreshHandle = null;
      const refresh = () => {
        renderFrameList();
        renderLayerList();
      };
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(refresh, { timeout: 500 });
      } else {
        window.setTimeout(refresh, 0);
      }
    });
  }

  function stopPlayback() {
    const wasPlaying = Boolean(state.playback.isPlaying);
    state.playback.isPlaying = false;
    if (playbackHandle != null) {
      window.cancelAnimationFrame(playbackHandle);
      playbackHandle = null;
    }
    let restoredStartSelection = false;
    if (wasPlaying && playbackStartSelectionSnapshot) {
      restoredStartSelection = restoreLocalTimelineSelectionSnapshot(playbackStartSelectionSnapshot, { preserveCanvas: true });
      playbackStartSelectionSnapshot = null;
    }
    clearPlaybackFrameCache();
    clearPlaybackTimelineCursorIndicators();
    updatePlaybackButtons();
    schedulePlaybackUiRefresh();
    if (restoredStartSelection) {
      syncAnimationFpsDisplayFromState();
      syncActiveLayerSettingsUI();
      syncActiveFrameSettingsUI();
      scheduleSharedProjectCellPresenceBroadcast('playback-stop');
      markCanvasDirty();
    }
    requestRender();
    requestOverlayRender();
  }

  function stepPlayback(timestamp) {
    if (!state.playback.isPlaying) return;
    if (!Number.isFinite(lastFrameTime) || lastFrameTime <= 0) {
      lastFrameTime = timestamp;
    }
    let stepped = 0;
    while (stepped < PLAYBACK_MAX_CATCHUP_STEPS) {
      const frame = getActiveFrame();
      const duration = frame && Number.isFinite(frame.duration) && frame.duration > 0 ? frame.duration : 1000 / 12;
      const elapsed = timestamp - lastFrameTime;
      if (elapsed < duration) {
        break;
      }
      const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
      const activeFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, Math.max(0, frameCount - 1));
      if (frameCount > 0 && activeFrameIndex >= frameCount - 1 && state.playback.loop === false) {
        stopPlayback();
        return;
      }
      stepActiveFrame(1, {
        wrap: true,
        persist: false,
        render: false,
        syncUi: false,
        broadcastPresence: false,
        respectSharedCellOccupancy: false,
      });
      lastFrameTime += duration;
      stepped += 1;
    }
    if (stepped > 0) {
      syncPlaybackTimelineCursorIndicators();
      markCanvasDirty();
      requestRender();
    }
    if (stepped === PLAYBACK_MAX_CATCHUP_STEPS) {
      lastFrameTime = timestamp;
    }
    playbackHandle = window.requestAnimationFrame(stepPlayback);
  }

  function updatePlaybackButtons() {
    const isPlaying = state.playback.isPlaying;
    if (dom.controls.playAnimation) {
      dom.controls.playAnimation.classList.toggle('is-active', isPlaying);
      dom.controls.playAnimation.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
      dom.controls.playAnimation.classList.toggle('is-playback-hidden', isPlaying);
      dom.controls.playAnimation.setAttribute('aria-hidden', isPlaying ? 'true' : 'false');
      dom.controls.playAnimation.disabled = isPlaying;
    }
    if (dom.controls.stopAnimation) {
      dom.controls.stopAnimation.classList.toggle('is-playback-hidden', !isPlaying);
      dom.controls.stopAnimation.setAttribute('aria-hidden', isPlaying ? 'false' : 'true');
      dom.controls.stopAnimation.disabled = !isPlaying;
    }
    if (dom.controls.loopAnimation) {
      const loopEnabled = state.playback?.loop !== false;
      dom.controls.loopAnimation.classList.toggle('is-active', loopEnabled);
      dom.controls.loopAnimation.setAttribute('aria-pressed', loopEnabled ? 'true' : 'false');
      dom.controls.loopAnimation.title = loopEnabled
        ? localizeText('ループ再生: ON', 'Loop playback: On')
        : localizeText('ループ再生: OFF', 'Loop playback: Off');
    }
    const playbackLockedControls = [
      dom.controls.addLayer,
      dom.controls.addSimulationLayer,
      dom.controls.removeLayer,
      dom.controls.addFrame,
      dom.controls.removeFrame,
      dom.controls.layerOpacity,
      dom.controls.layerBlendMode,
      dom.controls.onionSkinEnabled,
      dom.controls.toggleOnionSkin,
      dom.controls.onionPrevFrames,
      dom.controls.onionNextFrames,
      dom.controls.onionOpacity,
      dom.controls.undoAction,
      dom.controls.redoAction,
      dom.controls.clearCanvas,
    ];
    playbackLockedControls.forEach(control => {
      if (control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
        control.disabled = isPlaying;
      }
    });
    updateFloatingPreviewPanelPlaybackButtons();
    applyTimelineToolbarFrames();
  }

  function applyTimelineToolbarFrames() {
    const configs = [
      { element: dom.controls.addLayer, variant: 'add' },
      { element: dom.controls.addSimulationLayer, variant: 'add' },
      { element: dom.controls.removeLayer, variant: 'remove' },
      { element: dom.controls.addFrame, variant: 'add' },
      { element: dom.controls.removeFrame, variant: 'remove' },
      { element: dom.controls.rewindAnimation, variant: 'playback' },
      { element: dom.controls.playAnimation, variant: state.playback.isPlaying ? 'playbackActive' : 'playback' },
      { element: dom.controls.stopAnimation, variant: state.playback.isPlaying ? 'stop' : 'stop' },
      { element: dom.controls.forwardAnimation, variant: 'playback' },
      { element: dom.controls.loopAnimation, variant: state.playback?.loop !== false ? 'playbackActive' : 'playback' },
    ];
    configs.forEach(({ element, variant }) => {
      if (!element) return;
      const colors = TIMELINE_BUTTON_VARIANTS[variant] || TIMELINE_BUTTON_VARIANTS.playback;
      applyPixelFrameBackground(element, colors.fill, { borderColor: colors.border });
    });
  }

  function getTimelineBodyVariant({ isEmpty, isActiveLayerRow, isActiveFrameColumn, isActiveCell, isHidden }) {
    if (isEmpty) {
      return 'bodyEmpty';
    }
    if (isActiveCell) {
      return 'bodyActiveCell';
    }
    if (isHidden) {
      return 'bodyHidden';
    }
    if (isActiveLayerRow && isActiveFrameColumn) {
      return 'bodyActiveCell';
    }
    if (isActiveLayerRow) {
      return 'bodyActiveRow';
    }
    if (isActiveFrameColumn) {
      return 'bodyActiveColumn';
    }
    return 'body';
  }

  function applyTimelineCellFrame(element, variant) {
    if (!element) return;
    element.classList.add('pixel-frame');
    const colors = TIMELINE_CELL_VARIANTS[variant] || TIMELINE_CELL_VARIANTS.body;
    applyPixelFrameBackground(element, colors.fill, { borderColor: colors.border });
  }

  function applyTimelineSlotFrame(element, variant) {
    if (!element) return;
    element.classList.add('pixel-frame');
    const colors = TIMELINE_SLOT_VARIANTS[variant] || TIMELINE_SLOT_VARIANTS.default;
    applyPixelFrameBackground(element, colors.fill, { borderColor: colors.border });
  }

  function getLayerVisibilityForRow(rowIndex) {
    for (let frameIndex = 0; frameIndex < state.frames.length; frameIndex += 1) {
      const frame = state.frames[frameIndex];
      const layerIndex = frame.layers.length - 1 - rowIndex;
      if (layerIndex >= 0 && layerIndex < frame.layers.length) {
        return getDisplayedLayerVisibility(frame.layers[layerIndex], true);
      }
    }
    return true;
  }

  function setLayerVisibilityForRow(rowIndex, visible) {
    const nextVisible = visible !== false;
    let needsChange = false;
    state.frames.forEach(frame => {
      const layerIndex = frame.layers.length - 1 - rowIndex;
      if (layerIndex >= 0 && layerIndex < frame.layers.length) {
        const targetLayer = frame.layers[layerIndex];
        if (targetLayer && getDisplayedLayerVisibility(targetLayer, true) !== nextVisible) {
          needsChange = true;
        }
      }
    });
    if (!needsChange) {
      return;
    }
    state.frames.forEach(frame => {
      const layerIndex = frame.layers.length - 1 - rowIndex;
      if (layerIndex >= 0 && layerIndex < frame.layers.length) {
        const targetLayer = frame.layers[layerIndex];
        if (targetLayer && getDisplayedLayerVisibility(targetLayer, true) !== nextVisible) {
          targetLayer.visible = nextVisible;
          rememberLocalLayerVisibility(targetLayer.id, nextVisible);
        }
      }
    });
    clearPlaybackFrameCache();
    scheduleSessionPersist({ includeSnapshots: false });
    renderLayerList();
    renderTimelineMatrix();
    requestRender();
    requestOverlayRender();
  }

  function toggleLayerVisibilityForRow(rowIndex) {
    const current = getLayerVisibilityForRow(rowIndex);
    setLayerVisibilityForRow(rowIndex, !current);
  }

  function getActiveLayerTrackIndex() {
    const frame = getActiveFrame();
    if (!frame || !Array.isArray(frame.layers)) {
      return -1;
    }
    return frame.layers.findIndex(layer => layer.id === state.activeLayer);
  }

  function forEachLayerInTrack(layerIndex, callback) {
    if (!Number.isInteger(layerIndex) || layerIndex < 0 || typeof callback !== 'function') {
      return;
    }
    state.frames.forEach((frame, frameIndex) => {
      if (!frame || !Array.isArray(frame.layers)) {
        return;
      }
      const layer = frame.layers[layerIndex];
      if (!layer) {
        return;
      }
      callback(layer, frameIndex, frame);
    });
  }

  function setActiveLayerTrackOpacity(opacity) {
    const layerIndex = getActiveLayerTrackIndex();
    if (layerIndex < 0) {
      return false;
    }
    const parsed = Number(opacity);
    if (!Number.isFinite(parsed)) {
      return false;
    }
    const normalizedOpacity = clamp(parsed, 0, 1);
    let changed = false;
    forEachLayerInTrack(layerIndex, layer => {
      const currentOpacity = getDisplayedLayerPreviewOpacity(layer, 1);
      if (Math.abs(currentOpacity - normalizedOpacity) > 0.0001) {
        layer.opacity = normalizedOpacity;
        rememberLocalLayerPreviewOpacity(layer.id, normalizedOpacity);
        changed = true;
      }
    });
    return changed;
  }

  function setActiveLayerTrackBlendMode(blendMode) {
    if (!canCurrentClientEditProjectStructure({ announce: true })) {
      return false;
    }
    const layerIndex = getActiveLayerTrackIndex();
    if (layerIndex < 0) {
      return false;
    }
    const normalizedBlendMode = normalizeLayerBlendMode(blendMode);
    let changed = false;
    forEachLayerInTrack(layerIndex, layer => {
      const currentMode = normalizeLayerBlendMode(layer.blendMode);
      if (currentMode !== normalizedBlendMode) {
        layer.blendMode = normalizedBlendMode;
        changed = true;
      }
    });
    return changed;
  }

  function updateLayerOpacityOutput(percent) {
    if (!dom.controls.layerOpacityValue) {
      return;
    }
    const safePercent = clamp(Math.round(Number(percent) || 0), 0, 100);
    dom.controls.layerOpacityValue.textContent = `${safePercent}%`;
  }

  function syncActiveLayerSettingsUI() {
    const frame = getActiveFrame();
    const layer = frame && Array.isArray(frame.layers)
      ? (frame.layers.find(item => item.id === state.activeLayer) || frame.layers[frame.layers.length - 1] || null)
      : null;
    const hasLayer = Boolean(layer);
    const isSimLayer = isSimulationLayer(layer);
    const opacityControl = dom.controls.layerOpacity;
    const blendControl = dom.controls.layerBlendMode;
    const targetLabel = dom.controls.layerSettingsTarget;
    const normalizedBlendMode = hasLayer ? normalizeLayerBlendMode(layer.blendMode) : DEFAULT_LAYER_BLEND_MODE;
    const normalizedOpacity = hasLayer ? getDisplayedLayerPreviewOpacity(layer, 1) : 1;
    const opacityPercent = clamp(Math.round(normalizedOpacity * 100), 0, 100);

    if (targetLabel) {
      targetLabel.textContent = hasLayer
        ? localizeText(`対象: ${layer.name}${isSimLayer ? ' [Sim]' : ''}`, `Target: ${layer.name}${isSimLayer ? ' [Sim]' : ''}`)
        : localizeText('対象: なし', 'Target: None');
    }
    if (opacityControl instanceof HTMLInputElement) {
      opacityControl.disabled = !hasLayer;
      opacityControl.value = String(opacityPercent);
    }
    updateLayerOpacityOutput(opacityPercent);
    if (blendControl instanceof HTMLSelectElement) {
      blendControl.disabled = !hasLayer;
      blendControl.value = normalizedBlendMode;
    }
    if (dom.controls.simulationLayerSettings instanceof HTMLElement) {
      dom.controls.simulationLayerSettings.hidden = true;
    }
    if (false && isSimLayer) {
      const waterStyle = normalizeSimulationStyle(SIM_ELEMENT_WATER, layer.elementStyle?.[SIM_ELEMENT_WATER]);
      if (dom.controls.simulationLayerTarget) dom.controls.simulationLayerTarget.textContent = `${layer.name} [simulation]`;
      if (dom.controls.simulationPaintMode) dom.controls.simulationPaintMode.value = simulationEditorState.paintMode;
      if (dom.controls.simulationElement) dom.controls.simulationElement.value = String(simulationEditorState.element);
      if (dom.controls.simulationDepthValue) dom.controls.simulationDepthValue.value = String(simulationEditorState.depthValue);
      if (dom.controls.simulationAirValue) dom.controls.simulationAirValue.value = String(simulationEditorState.airValue);
      if (dom.controls.simulationAtmosphereEnabled instanceof HTMLInputElement) {
        dom.controls.simulationAtmosphereEnabled.checked = layer.settings.atmosphereEnabled !== false;
      }
      if (dom.controls.simulationAtmosphereEnabledValue) {
        dom.controls.simulationAtmosphereEnabledValue.textContent = layer.settings.atmosphereEnabled !== false ? 'ON' : 'OFF';
      }
      if (dom.controls.simulationShowLeftPalette instanceof HTMLInputElement) {
        dom.controls.simulationShowLeftPalette.checked = simulationEditorState.showLeftPalette;
      }
      const atmospherePercent = clamp(Math.round((Number(layer.settings.atmosphereStrength) || 0) * 100), 0, 100);
      if (dom.controls.simulationAtmosphereStrength) dom.controls.simulationAtmosphereStrength.value = String(atmospherePercent);
      if (dom.controls.simulationAtmosphereStrengthValue) dom.controls.simulationAtmosphereStrengthValue.textContent = `${atmospherePercent}%`;
      if (dom.controls.simulationWaterDisplayMode) dom.controls.simulationWaterDisplayMode.value = waterStyle.displayMode;
      const waterMixPercent = clamp(Math.round(waterStyle.mixStrength * 100), 0, 100);
      if (dom.controls.simulationWaterMixStrength) dom.controls.simulationWaterMixStrength.value = String(waterMixPercent);
      if (dom.controls.simulationWaterMixStrengthValue) dom.controls.simulationWaterMixStrengthValue.textContent = `${waterMixPercent}%`;
      const toHex = color => `#${[color.r, color.g, color.b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
      if (dom.controls.simulationWaterShallow) dom.controls.simulationWaterShallow.value = toHex(waterStyle.palette.shallow);
      if (dom.controls.simulationWaterMid) dom.controls.simulationWaterMid.value = toHex(waterStyle.palette.mid);
      if (dom.controls.simulationWaterDeep) dom.controls.simulationWaterDeep.value = toHex(waterStyle.palette.deep);
      if (dom.controls.simulationWaterFoam) dom.controls.simulationWaterFoam.value = toHex(waterStyle.palette.foam);
      if (dom.controls.simulationWaterHighlight) dom.controls.simulationWaterHighlight.value = toHex(waterStyle.palette.highlight);
      if (dom.controls.simulationFireDisplayMode) dom.controls.simulationFireDisplayMode.value = normalizeSimulationDisplayMode(layer.elementStyle?.[SIM_ELEMENT_FIRE]?.displayMode, SIM_MIXED);
      if (dom.controls.simulationMetalDisplayMode) dom.controls.simulationMetalDisplayMode.value = normalizeSimulationDisplayMode(layer.elementStyle?.[SIM_ELEMENT_METAL]?.displayMode, SIM_MIXED);
      if (dom.controls.simulationDepthValueOut) dom.controls.simulationDepthValueOut.textContent = String(simulationEditorState.depthValue);
      if (dom.controls.simulationAirValueOut) dom.controls.simulationAirValueOut.textContent = String(simulationEditorState.airValue);
      updateSimulationElementPaletteUi();
    }
  }

  function updateOnionSkinEnabledOutput(enabled) {
    const label = dom.controls.onionSkinEnabledValue;
    if (!label) {
      return;
    }
    label.textContent = enabled ? 'ON' : 'OFF';
  }

  function updateOnionSkinCountOutput(element, value) {
    if (!element) {
      return;
    }
    element.textContent = String(normalizeOnionFrameCount(value));
  }

  function updateOnionSkinOpacityOutput(percent) {
    const output = dom.controls.onionOpacityValue;
    if (!output) {
      return;
    }
    const safePercent = clamp(Math.round(Number(percent) || 0), 0, 100);
    output.textContent = `${safePercent}%`;
  }

  function setOnionSkinSettings(patch = {}) {
    const current = normalizeOnionSkinState(state.onionSkin);
    const next = normalizeOnionSkinState({ ...current, ...(patch || {}) });
    const changed = current.enabled !== next.enabled
      || current.prevFrames !== next.prevFrames
      || current.nextFrames !== next.nextFrames
      || Math.abs(current.opacity - next.opacity) > 0.0001;
    if (!changed) {
      return false;
    }
    state.onionSkin = next;
    return true;
  }

  function getOnionSkinFrameIndexes() {
    const indexes = new Set();
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    if (frameCount <= 0) {
      return indexes;
    }
    const settings = normalizeOnionSkinState(state.onionSkin);
    state.onionSkin = settings;
    if (!settings.enabled) {
      return indexes;
    }
    const activeFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, frameCount - 1);
    indexes.add(activeFrameIndex);
    const prevFrames = normalizeOnionFrameCount(settings.prevFrames, DEFAULT_ONION_SKIN.prevFrames);
    const nextFrames = normalizeOnionFrameCount(settings.nextFrames, DEFAULT_ONION_SKIN.nextFrames);
    for (let offset = 1; offset <= prevFrames; offset += 1) {
      const frameIndex = activeFrameIndex - offset;
      if (frameIndex >= 0) {
        indexes.add(frameIndex);
      }
    }
    for (let offset = 1; offset <= nextFrames; offset += 1) {
      const frameIndex = activeFrameIndex + offset;
      if (frameIndex < frameCount) {
        indexes.add(frameIndex);
      }
    }
    return indexes;
  }

  function syncActiveFrameSettingsUI() {
    const frame = getActiveFrame();
    const hasFrame = Boolean(frame);
    const settings = normalizeOnionSkinState(state.onionSkin);
    state.onionSkin = settings;
    const frameNumber = clamp(Math.round(Number(state.activeFrame) || 0) + 1, 1, Number.MAX_SAFE_INTEGER);
    const frameLabel = hasFrame && typeof frame.name === 'string' && frame.name.trim()
      ? frame.name.trim()
      : getDefaultFrameName(frameNumber);

    if (dom.controls.frameSettingsTarget) {
      dom.controls.frameSettingsTarget.textContent = hasFrame
        ? localizeText(`${frameLabel} の設定`, `${frameLabel} Settings`)
        : localizeText('フレーム設定', 'Frame Settings');
    }
    if (dom.controls.onionSkinEnabled instanceof HTMLInputElement) {
      dom.controls.onionSkinEnabled.disabled = !hasFrame;
      dom.controls.onionSkinEnabled.checked = hasFrame && settings.enabled;
    }
    if (dom.controls.toggleOnionSkin instanceof HTMLInputElement) {
      dom.controls.toggleOnionSkin.disabled = !hasFrame;
      dom.controls.toggleOnionSkin.checked = hasFrame && settings.enabled;
    }
    updateOnionSkinEnabledOutput(hasFrame && settings.enabled);
    if (dom.controls.onionPrevFrames instanceof HTMLInputElement) {
      dom.controls.onionPrevFrames.disabled = !hasFrame;
      dom.controls.onionPrevFrames.value = String(settings.prevFrames);
    }
    updateOnionSkinCountOutput(dom.controls.onionPrevFramesValue, settings.prevFrames);
    if (dom.controls.onionNextFrames instanceof HTMLInputElement) {
      dom.controls.onionNextFrames.disabled = !hasFrame;
      dom.controls.onionNextFrames.value = String(settings.nextFrames);
    }
    updateOnionSkinCountOutput(dom.controls.onionNextFramesValue, settings.nextFrames);
    const opacityPercent = clamp(Math.round(settings.opacity * 100), 0, 100);
    if (dom.controls.onionOpacity instanceof HTMLInputElement) {
      dom.controls.onionOpacity.disabled = !hasFrame;
      dom.controls.onionOpacity.value = String(opacityPercent);
    }
    updateOnionSkinOpacityOutput(opacityPercent);
  }

  function getTimelineMatrixViewport() {
    const container = dom.controls.timelineMatrix;
    if (!(container instanceof HTMLElement)) {
      return null;
    }
    const viewport = container.closest('.timeline-matrix-wrapper');
    return viewport instanceof HTMLElement ? viewport : null;
  }

  function getTimelineMatrixViewportMaxScroll(viewport, axis = 'x') {
    if (!(viewport instanceof HTMLElement)) {
      return 0;
    }
    if (axis === 'y') {
      return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    }
    return Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  }

  function normalizeTimelineMatrixWheelDelta(event, axis = 'y') {
    if (!(event instanceof WheelEvent)) {
      return 0;
    }
    const raw = axis === 'x' ? event.deltaX : event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      return raw * 16;
    }
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      const viewport = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
      const size = axis === 'x'
        ? Math.max(1, viewport?.clientWidth || window.innerWidth || 1)
        : Math.max(1, viewport?.clientHeight || window.innerHeight || 1);
      return raw * size;
    }
    return raw;
  }

  function scrollTimelineMatrixViewport(viewport, axis, delta) {
    if (!(viewport instanceof HTMLElement) || !Number.isFinite(delta) || Math.abs(delta) < 0.5) {
      return false;
    }
    const normalizedAxis = axis === 'y' ? 'y' : 'x';
    const maxScroll = getTimelineMatrixViewportMaxScroll(viewport, normalizedAxis);
    if (maxScroll <= 0) {
      return false;
    }
    if (normalizedAxis === 'y') {
      const previous = viewport.scrollTop;
      const next = clamp(previous + delta, 0, maxScroll);
      if (Math.abs(next - previous) < 0.5) {
        return false;
      }
      viewport.scrollTop = next;
      return true;
    }
    const previous = viewport.scrollLeft;
    const next = clamp(previous + delta, 0, maxScroll);
    if (Math.abs(next - previous) < 0.5) {
      return false;
    }
    viewport.scrollLeft = next;
    return true;
  }

  function clearTimelineMatrixViewportPan({ suppressClick = false } = {}) {
    const viewport = timelineMatrixViewportPan.captureTarget;
    if (viewport instanceof HTMLElement) {
      viewport.classList.remove('is-viewport-panning');
      if (timelineMatrixViewportPan.pointerId !== null && typeof viewport.releasePointerCapture === 'function') {
        try {
          viewport.releasePointerCapture(timelineMatrixViewportPan.pointerId);
        } catch (error) {
          // Ignore pointer capture release failures.
        }
      }
    }
    if (suppressClick) {
      timelineMatrixViewportPan.suppressClickUntil = Date.now() + 250;
    }
    timelineMatrixViewportPan.active = false;
    timelineMatrixViewportPan.moved = false;
    timelineMatrixViewportPan.startedOnControl = false;
    timelineMatrixViewportPan.axis = '';
    timelineMatrixViewportPan.pointerId = null;
    timelineMatrixViewportPan.startX = 0;
    timelineMatrixViewportPan.startY = 0;
    timelineMatrixViewportPan.startScrollLeft = 0;
    timelineMatrixViewportPan.startScrollTop = 0;
    timelineMatrixViewportPan.captureTarget = null;
  }

  function handleTimelineMatrixViewportPointerDown(event) {
    const viewport = event.currentTarget instanceof HTMLElement ? event.currentTarget : getTimelineMatrixViewport();
    if (!(viewport instanceof HTMLElement) || event.isPrimary === false) {
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }
    if (
      getTimelineMatrixViewportMaxScroll(viewport, 'x') <= 0
      && getTimelineMatrixViewportMaxScroll(viewport, 'y') <= 0
    ) {
      return;
    }
    clearTimelineMatrixViewportPan();
    timelineMatrixViewportPan.active = true;
    timelineMatrixViewportPan.pointerId = Number.isFinite(event.pointerId) ? event.pointerId : null;
    timelineMatrixViewportPan.startX = Number(event.clientX) || 0;
    timelineMatrixViewportPan.startY = Number(event.clientY) || 0;
    timelineMatrixViewportPan.startScrollLeft = viewport.scrollLeft;
    timelineMatrixViewportPan.startScrollTop = viewport.scrollTop;
    timelineMatrixViewportPan.captureTarget = viewport;
    const startTarget = event.target instanceof Element ? event.target : null;
    timelineMatrixViewportPan.startedOnControl = Boolean(startTarget?.closest('button, input, select, textarea, label'));
  }

  function handleTimelineMatrixViewportPointerMove(event) {
    if (!timelineMatrixViewportPan.active) {
      return;
    }
    if (
      timelineMatrixViewportPan.pointerId !== null
      && Number.isFinite(event.pointerId)
      && event.pointerId !== timelineMatrixViewportPan.pointerId
    ) {
      return;
    }
    const viewport = timelineMatrixViewportPan.captureTarget;
    if (!(viewport instanceof HTMLElement)) {
      clearTimelineMatrixViewportPan();
      return;
    }
    const deltaX = (Number(event.clientX) || 0) - timelineMatrixViewportPan.startX;
    const deltaY = (Number(event.clientY) || 0) - timelineMatrixViewportPan.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (!timelineMatrixViewportPan.axis) {
      // A tap on a frame/layer cell often includes a few pixels of finger
      // drift. Keep it a tap until the motion is clearly intended as a
      // timeline scroll; otherwise the subsequent click is suppressed and
      // the active frame/layer never changes.
      const activationThreshold = timelineMatrixViewportPan.startedOnControl
        && event.pointerType !== 'mouse'
        ? 14
        : 6;
      if (Math.max(absX, absY) < activationThreshold) {
        return;
      }
      timelineMatrixViewportPan.axis = absX >= absY ? 'x' : 'y';
      timelineMatrixViewportPan.moved = true;
      viewport.classList.add('is-viewport-panning');
      if (timelineMatrixViewportPan.pointerId !== null && typeof viewport.setPointerCapture === 'function') {
        try {
          viewport.setPointerCapture(timelineMatrixViewportPan.pointerId);
        } catch (error) {
          // Ignore pointer capture failures.
        }
      }
    }
    const axis = timelineMatrixViewportPan.axis;
    if (axis === 'y') {
      const maxScrollTop = getTimelineMatrixViewportMaxScroll(viewport, 'y');
      viewport.scrollTop = clamp(timelineMatrixViewportPan.startScrollTop - deltaY, 0, maxScrollTop);
    } else {
      const maxScrollLeft = getTimelineMatrixViewportMaxScroll(viewport, 'x');
      viewport.scrollLeft = clamp(timelineMatrixViewportPan.startScrollLeft - deltaX, 0, maxScrollLeft);
    }
    event.preventDefault();
  }

  function handleTimelineMatrixViewportPointerUp(event) {
    if (!timelineMatrixViewportPan.active) {
      return;
    }
    if (
      timelineMatrixViewportPan.pointerId !== null
      && Number.isFinite(event.pointerId)
      && event.pointerId !== timelineMatrixViewportPan.pointerId
    ) {
      return;
    }
    const wasPan = timelineMatrixViewportPan.moved;
    const wasControlTap = timelineMatrixViewportPan.startedOnControl
      && event.pointerType !== 'mouse'
      && !wasPan;
    const tapTarget = wasControlTap && event.target instanceof Element
      ? event.target.closest('button')
      : null;
    clearTimelineMatrixViewportPan({ suppressClick: wasPan });
    if (tapTarget instanceof HTMLButtonElement && viewport.contains(tapTarget)) {
      // `touch-action: none` is necessary for literal horizontal/vertical
      // timeline scrolling, but some mobile browsers then omit the synthetic
      // click for a perfectly valid tap. Trigger the same delegated click
      // path on pointer-up and consume a possible duplicate native click.
      tapTarget.click();
      timelineMatrixViewportPan.suppressClickUntil = Date.now() + 250;
    }
  }

  function handleTimelineMatrixViewportWheel(event) {
    if (event.ctrlKey || event.metaKey) {
      return;
    }
    const viewport = event.currentTarget instanceof HTMLElement ? event.currentTarget : getTimelineMatrixViewport();
    if (!(viewport instanceof HTMLElement)) {
      return;
    }
    const deltaX = normalizeTimelineMatrixWheelDelta(event, 'x');
    const deltaY = normalizeTimelineMatrixWheelDelta(event, 'y');
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (Math.max(absX, absY) < 0.5) {
      return;
    }
    let axis = absX > absY ? 'x' : 'y';
    let delta = axis === 'x' ? deltaX : deltaY;
    if (event.shiftKey && absX < 0.5 && absY >= 0.5) {
      axis = 'x';
      delta = deltaY;
    }
    // Keep the matrix axes literal: vertical input scrolls layers and
    // horizontal input scrolls frames. Do not silently reinterpret a wheel
    // gesture as horizontal merely because the current vertical range is at
    // an edge (or temporarily has no overflow).
    if (!scrollTimelineMatrixViewport(viewport, axis, delta)) {
      return;
    }
    event.preventDefault();
  }

  function setActiveTimelineLayerId(layerId) {
    const normalizedLayerId = typeof layerId === 'string' ? layerId : '';
    if (!normalizedLayerId) {
      return false;
    }
    const frame = getActiveFrame();
    if (!frame || !Array.isArray(frame.layers) || !frame.layers.some(layer => layer?.id === normalizedLayerId)) {
      return false;
    }
    state.activeLayer = normalizedLayerId;
    const activeCanvasDoc = getActiveProjectCanvasDocument();
    if (activeCanvasDoc) {
      activeCanvasDoc.activeLayer = normalizedLayerId;
    }
    return true;
  }

  function canUseDirectTimelineSelection() {
    // A local document must always be navigable. A stale retired multi-user
    // role must not turn ordinary frame/layer buttons into move-request-only
    // controls.
    return !isSharedProjectCollaborativeMode();
  }

  function selectTimelineSlotDirectly(frameIndex, layerIndex, { append = false } = {}) {
    if (!canUseDirectTimelineSelection()) return false;
    setActiveFrameOnLayerTrack(frameIndex, layerIndex, { persist: false, render: true, syncUi: true });
    if (append) {
      setTimelineSlotSelection(frameIndex, layerIndex, { append: true });
    } else {
      clearTimelineSelection();
    }
    scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    scheduleTimelineMatrixRenderSoon();
    scheduleSharedProjectCellPresenceBroadcast('slot');
    return true;
  }

  function selectTimelineLayerDirectly(layerIndex, { append = false } = {}) {
    if (!canUseDirectTimelineSelection()) return false;
    setActiveLayerTrackIndex(layerIndex, {
      persist: false,
      render: true,
      syncUi: true,
      respectSharedCellOccupancy: false,
    });
    setTimelineLayerSelection(layerIndex, { append });
    scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    scheduleTimelineMatrixRenderSoon();
    scheduleSharedProjectCellPresenceBroadcast('layer');
    return true;
  }

  function selectTimelineFrameDirectly(frameIndex, { append = false } = {}) {
    if (!canUseDirectTimelineSelection()) return false;
    const currentFrame = getActiveFrame();
    const currentLayers = currentFrame ? currentFrame.layers.slice().reverse() : [];
    const activeLayerRow = currentLayers.findIndex(layer => layer.id === state.activeLayer);
    const candidateLayers = state.frames[frameIndex]?.layers?.slice().reverse() || [];
    const nextLayer = candidateLayers[activeLayerRow] || candidateLayers[candidateLayers.length - 1] || candidateLayers[0];
    setTimelineFrameSelection(frameIndex, { append });
    if (nextLayer) {
      const nextTrackIndex = state.frames[frameIndex]?.layers?.findIndex(layer => layer?.id === nextLayer.id) ?? -1;
      if (nextTrackIndex >= 0) {
        setActiveFrameOnLayerTrack(frameIndex, nextTrackIndex, { persist: false, render: true, syncUi: true });
      }
    } else {
      setActiveFrameIndex(frameIndex, { persist: false, render: true, syncUi: true, broadcastPresence: false });
    }
    scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
    scheduleTimelineMatrixRenderSoon();
    scheduleSharedProjectCellPresenceBroadcast('frame');
    return true;
  }

  function bindTimelineMatrixInteractions() {
    const container = dom.controls.timelineMatrix;
    if (!container || timelineMatrixInteractionBound) {
      return;
    }
    timelineMatrixInteractionBound = true;
    const viewport = getTimelineMatrixViewport();
    if (viewport instanceof HTMLElement) {
      viewport.addEventListener('wheel', handleTimelineMatrixViewportWheel, { passive: false });
      viewport.addEventListener('pointerdown', handleTimelineMatrixViewportPointerDown, { passive: true });
      viewport.addEventListener('pointermove', handleTimelineMatrixViewportPointerMove, { passive: false });
      viewport.addEventListener('pointerup', handleTimelineMatrixViewportPointerUp, { passive: true });
      viewport.addEventListener('pointercancel', handleTimelineMatrixViewportPointerUp, { passive: true });
    }
    container.addEventListener('click', event => {
      // Ignore the native click that can follow an actual drag. Do this in
      // the normal delegated handler rather than capture phase: capture
      // previously swallowed ordinary frame/layer taps before selection.
      if (Date.now() < timelineMatrixViewportPan.suppressClickUntil) {
        event.preventDefault();
        return;
      }
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!(target instanceof HTMLButtonElement) || !container.contains(target)) {
        return;
      }

      if (target.classList.contains('timeline-visibility')) {
        const rowIndex = Number.parseInt(target.dataset.layerRowIndex || '', 10);
        if (Number.isFinite(rowIndex)) {
          toggleLayerVisibilityForRow(rowIndex);
        }
        return;
      }

      if (target.classList.contains('timeline-layer-tag')) {
        const layerId = target.dataset.timelineLayerId;
        const layerIndex = Number.parseInt(target.dataset.timelineLayerIndex || '', 10);
        if (!layerId) {
          return;
        }
        if (isMultiAssignedCellRestrictedEditorMode()) {
          if (isMultiGuestMode() && Number.isFinite(layerIndex) && layerIndex >= 0) {
            clearTimelineSelection();
            if (!scheduleMultiGuestMovePreview(state.activeFrame, layerIndex, { source: 'timeline-layer-tag' })) {
              renderTimelineMatrix();
            }
            return;
          }
          enforceGuestAssignedLayerSelection({ announce: true });
          clearTimelineSelection();
          renderTimelineMatrix();
          requestOverlayRender();
          return;
        }
        if (isSharedProjectCollaborativeMode() && !canSelectSharedProjectTimelineCell(state.activeFrame, layerId)) {
          renderTimelineMatrix();
          return;
        }
        if (Number.isFinite(layerIndex)) {
          setActiveLayerTrackIndex(layerIndex, {
            persist: false,
            render: true,
            syncUi: true,
            respectSharedCellOccupancy: false,
          });
        } else {
          setActiveTimelineLayerId(layerId);
          requestOverlayRender();
        }
        if (Number.isFinite(layerIndex)) {
          setTimelineLayerSelection(layerIndex, { append: event.shiftKey });
        }
        scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
        scheduleTimelineMatrixRenderSoon();
        scheduleSharedProjectCellPresenceBroadcast('layer');
        return;
      }

      if (target.classList.contains('timeline-frame-button')) {
        const frameIndex = Number.parseInt(target.dataset.timelineFrameIndex || '', 10);
        if (!Number.isFinite(frameIndex) || frameIndex < 0 || frameIndex >= state.frames.length) {
          return;
        }
        const currentFrame = getActiveFrame();
        const currentLayers = currentFrame ? currentFrame.layers.slice().reverse() : [];
        const activeLayerRow = currentLayers.findIndex(layer => layer.id === state.activeLayer);
        if (isMultiAssignedCellRestrictedEditorMode()) {
          if (isMultiGuestMode()) {
            const candidateLayers = state.frames[frameIndex]?.layers?.slice().reverse() || [];
            const nextLayer = candidateLayers[activeLayerRow] || candidateLayers[candidateLayers.length - 1] || candidateLayers[0];
            const nextTrackIndex = nextLayer
              ? (state.frames[frameIndex]?.layers?.findIndex(layer => layer?.id === nextLayer.id) ?? -1)
              : -1;
            if (nextTrackIndex >= 0) {
              clearTimelineSelection();
              if (!scheduleMultiGuestMovePreview(frameIndex, nextTrackIndex, { source: 'timeline-frame-button' })) {
                renderTimelineMatrix();
              }
              return;
            }
          }
          setActiveFrameIndex(frameIndex, { persist: false, render: false, syncUi: false });
          enforceGuestAssignedLayerSelection({ announce: false });
        } else {
          const candidateLayers = state.frames[frameIndex]?.layers?.slice().reverse() || [];
          const nextLayer = candidateLayers[activeLayerRow] || candidateLayers[candidateLayers.length - 1] || candidateLayers[0];
          if (nextLayer && isSharedProjectCollaborativeMode() && !canSelectSharedProjectTimelineCell(frameIndex, nextLayer.id)) {
            renderTimelineMatrix();
            return;
          }
          setTimelineFrameSelection(frameIndex, { append: event.shiftKey });
          if (nextLayer) {
            const nextTrackIndex = state.frames[frameIndex]?.layers?.findIndex(layer => layer?.id === nextLayer.id) ?? -1;
            if (nextTrackIndex >= 0) {
              setActiveFrameOnLayerTrack(frameIndex, nextTrackIndex, { persist: false, render: true, syncUi: true });
            } else {
              setActiveFrameIndex(frameIndex, { persist: false, render: true, syncUi: true, broadcastPresence: false });
            }
          } else {
            setActiveFrameIndex(frameIndex, { persist: false, render: true, syncUi: true, broadcastPresence: false });
          }
          scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
          scheduleTimelineMatrixRenderSoon();
          scheduleSharedProjectCellPresenceBroadcast('frame');
          return;
        }
        scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
        scheduleTimelineMatrixRenderSoon();
        scheduleSharedProjectCellPresenceBroadcast('frame');
        requestRender();
        requestOverlayRender();
        return;
      }

      if (target.classList.contains('timeline-slot')) {
        const frameIndex = Number.parseInt(target.dataset.timelineFrameIndex || '', 10);
        const layerIndex = Number.parseInt(target.dataset.timelineLayerIndex || '', 10);
        const layerId = target.dataset.timelineLayerId;
        if (!Number.isFinite(frameIndex) || !Number.isFinite(layerIndex) || !layerId || frameIndex < 0 || frameIndex >= state.frames.length) {
          return;
        }
        if (isMultiAssignedCellRestrictedEditorMode()) {
          if (isMultiGuestMode()) {
            clearTimelineSelection();
            if (!scheduleMultiGuestMovePreview(frameIndex, layerIndex, { source: 'timeline-slot' })) {
              renderTimelineMatrix();
            }
            return;
          }
          setActiveFrameIndex(frameIndex, { persist: false, render: false, syncUi: false });
          enforceGuestAssignedLayerSelection({ announce: true });
          clearTimelineSelection();
          renderTimelineMatrix();
          requestRender();
          requestOverlayRender();
          return;
        }
        if (isSharedProjectCollaborativeMode() && !canSelectSharedProjectTimelineCell(frameIndex, layerId)) {
          renderTimelineMatrix();
          return;
        }
        setActiveFrameOnLayerTrack(frameIndex, layerIndex, { persist: false, render: true, syncUi: true });
        if (event.shiftKey) {
          setTimelineSlotSelection(frameIndex, layerIndex, { append: true });
        } else {
          clearTimelineSelection();
        }
        scheduleSessionPersist({ includeSnapshots: false, includeReloadSnapshot: false });
        scheduleTimelineMatrixRenderSoon();
        scheduleSharedProjectCellPresenceBroadcast('slot');
      }
    });
  }

  function clearPlaybackTimelineCursorIndicators() {
    const container = dom.controls.timelineMatrix;
    if (!container) {
      return;
    }
    container.querySelectorAll('.timeline-cell--frame-header.is-playback-active-frame').forEach(node => {
      node.classList.remove('is-playback-active-frame');
    });
    container.querySelectorAll('.timeline-frame-button.is-playback-active').forEach(node => {
      node.classList.remove('is-playback-active');
    });
    container.querySelectorAll('.timeline-cell--body.is-playback-active-cell').forEach(node => {
      node.classList.remove('is-playback-active-cell');
    });
    container.querySelectorAll('.timeline-slot.is-playback-active').forEach(node => {
      node.classList.remove('is-playback-active');
    });
    container.querySelectorAll('.timeline-slot__marker[data-playback-frame-marker="true"]').forEach(marker => {
      marker.textContent = '';
      marker.removeAttribute('data-playback-frame-marker');
    });
  }

  function syncPlaybackTimelineCursorIndicators() {
    const container = dom.controls.timelineMatrix;
    if (!container || !container.childElementCount) {
      return;
    }
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    if (!frameCount) {
      clearPlaybackTimelineCursorIndicators();
      return;
    }
    const activeFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, frameCount - 1);
    const frameNumberLabel = String(activeFrameIndex + 1);

    clearPlaybackTimelineCursorIndicators();

    const frameButtons = container.querySelectorAll('.timeline-frame-button[data-timeline-frame-index]');
    frameButtons.forEach(button => {
      const frameIndex = Number.parseInt(button.dataset.timelineFrameIndex || '', 10);
      if (frameIndex !== activeFrameIndex) {
        return;
      }
      button.classList.add('is-playback-active');
      const header = button.closest('.timeline-cell--frame-header');
      if (header) {
        header.classList.add('is-playback-active-frame');
      }
    });

    const slots = container.querySelectorAll('.timeline-slot[data-timeline-frame-index][data-timeline-layer-id]');
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i];
      const frameIndex = Number.parseInt(slot.dataset.timelineFrameIndex || '', 10);
      if (frameIndex !== activeFrameIndex) {
        continue;
      }
      slot.classList.add('is-playback-active');
      const cell = slot.closest('.timeline-cell--body');
      if (cell) {
        cell.classList.add('is-playback-active-cell');
      }
      const marker = slot.querySelector('.timeline-slot__marker');
      if (marker) {
        marker.textContent = frameNumberLabel;
        marker.setAttribute('data-playback-frame-marker', 'true');
      }
      break;
    }
  }

  function getTimelineRenderCellCount(frames = state.frames) {
    if (!Array.isArray(frames) || !frames.length) {
      return 0;
    }
    const frameCount = frames.length;
    const maxLayerCount = frames.reduce((max, frame) => (
      Math.max(max, Array.isArray(frame?.layers) ? frame.layers.length : 0)
    ), 0);
    return frameCount * Math.max(1, maxLayerCount);
  }

  function shouldDeferTimelineMatrixRender(frames = state.frames) {
    const frameCount = Array.isArray(frames) ? frames.length : 0;
    if (frameCount < 48) {
      return false;
    }
    const pixelCount = Math.max(1, Math.round(Number(state.width) || 1)) * Math.max(1, Math.round(Number(state.height) || 1));
    return pixelCount >= 256 * 256 || getTimelineRenderCellCount(frames) >= 384;
  }

  function isLargeDocumentPerformanceMode() {
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    const width = Math.max(1, Math.round(Number(state.width) || 1));
    const height = Math.max(1, Math.round(Number(state.height) || 1));
    const pixelCount = width * height;
    return pixelCount * Math.max(1, frameCount) >= 256 * 256 * 48
      || getTimelineRenderCellCount(state.frames) >= 384;
  }

  function scheduleSecondaryCanvasRefresh() {
    if (secondaryCanvasRefreshHandle !== null) {
      return;
    }
    const run = () => {
      secondaryCanvasRefreshHandle = null;
      if ((isLargeDocumentPerformanceMode() && isAutosaveInteractionBusy()) || hasRecentViewportInteraction()) {
        scheduleSecondaryCanvasRefresh();
        return;
      }
      renderFloatingPreviewPanel();
      if (getLocalViewportCanvasCount() > 0) {
        renderInactiveProjectCanvasSurfaces();
      }
    };
    const requestIdle = () => {
      if (typeof window.requestIdleCallback === 'function') {
        secondaryCanvasRefreshHandle = window.requestIdleCallback(run, { timeout: 600 });
      } else {
        secondaryCanvasRefreshHandle = window.setTimeout(run, 120);
      }
    };
    secondaryCanvasRefreshHandle = window.requestAnimationFrame(requestIdle);
  }

  function refreshSecondaryCanvasSurfaces() {
    if (isLargeDocumentPerformanceMode()) {
      scheduleSecondaryCanvasRefresh();
      return;
    }
    renderFloatingPreviewPanel();
    renderInactiveProjectCanvasSurfaces();
  }

  function refreshInactiveProjectCanvasSurfacesSoon() {
    if (isLargeDocumentPerformanceMode()) {
      scheduleSecondaryCanvasRefresh();
      return;
    }
    renderInactiveProjectCanvasSurfaces();
  }

  function isTimelineMatrixPanelVisible() {
    if (layoutMode === 'mobilePortrait') {
      return true;
    }
    if (isBottomTimelineDockEnabled()) {
      return true;
    }
    if (state.activeRightTab !== 'frames') {
      return false;
    }
    if (!isCompactRightRailMode()) {
      return true;
    }
    return isCompactRightFlyoutOpen();
  }

  function markTimelineMatrixRenderDirty() {
    timelineMatrixRenderDirty = true;
    timelineMatrixRenderKey = '';
  }

  function flushTimelineMatrixRenderIfVisible({ immediate = false } = {}) {
    if (!timelineMatrixRenderDirty || !isTimelineMatrixPanelVisible()) {
      return false;
    }
    timelineMatrixRenderDirty = false;
    renderFrameList({ immediate });
    return true;
  }

  function scheduleTimelineMatrixRenderSoon() {
    if (!isTimelineMatrixPanelVisible()) {
      markTimelineMatrixRenderDirty();
      return;
    }
    if (timelineMatrixRafRenderHandle !== null) {
      return;
    }
    timelineMatrixRafRenderHandle = window.requestAnimationFrame(() => {
      timelineMatrixRafRenderHandle = null;
      if (!isTimelineMatrixPanelVisible()) {
        markTimelineMatrixRenderDirty();
        return;
      }
      if (hasRecentViewportInteraction()) {
        scheduleDeferredTimelineMatrixRender();
        return;
      }
      renderTimelineMatrix();
    });
  }

  function scheduleDeferredTimelineMatrixRender() {
    if (!isTimelineMatrixPanelVisible()) {
      markTimelineMatrixRenderDirty();
      return;
    }
    if (timelineMatrixDeferredRenderHandle !== null) {
      return;
    }
    timelineMatrixDeferredRenderHandle = window.requestAnimationFrame(() => {
      const render = () => {
        timelineMatrixDeferredRenderHandle = null;
        if (!isTimelineMatrixPanelVisible()) {
          markTimelineMatrixRenderDirty();
          return;
        }
        if (hasRecentViewportInteraction()) {
          scheduleDeferredTimelineMatrixRender();
          return;
        }
        renderTimelineMatrix();
      };
      if (typeof window.requestIdleCallback === 'function') {
        timelineMatrixDeferredRenderHandle = window.requestIdleCallback(render, { timeout: 700 });
      } else {
        timelineMatrixDeferredRenderHandle = window.setTimeout(render, 0);
      }
    });
  }

  function patchTimelineMatrixActiveState(container, activeFrameIndex, activeLayerRow, layerCount) {
    if (!container?.childElementCount) {
      return false;
    }
    const frameHeaders = container.querySelectorAll('.timeline-cell--frame-header[data-timeline-frame-index]');
    const onionFrameIndexes = getOnionSkinFrameIndexes();
    const isFrameSelectionMode = timelineSelection.mode === TIMELINE_SELECTION_MODE_FRAME;
    const isLayerSelectionMode = timelineSelection.mode === TIMELINE_SELECTION_MODE_LAYER;
    const isSlotSelectionMode = timelineSelection.mode === TIMELINE_SELECTION_MODE_SLOT;
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    frameHeaders.forEach(header => {
      const frameIndex = Number.parseInt(header.dataset.timelineFrameIndex || '', 10);
      const isActiveFrame = frameIndex === activeFrameIndex;
      const isSelectedFrame = isFrameSelectionMode && timelineSelection.frameIndexes.has(frameIndex);
      const isOnionFrame = onionFrameIndexes.has(frameIndex);
      header.classList.toggle('is-active-frame', isActiveFrame);
      header.classList.toggle('is-multi-selected-frame', isSelectedFrame);
      header.classList.toggle('is-structure-selected', isSelectedFrame);
      header.classList.toggle('is-structure-selected-frame', isSelectedFrame);
      header.classList.toggle('is-structure-selection-top', isSelectedFrame);
      header.classList.toggle(
        'is-structure-selection-left',
        isSelectedFrame && !timelineSelection.frameIndexes.has(frameIndex - 1)
      );
      header.classList.toggle(
        'is-structure-selection-right',
        isSelectedFrame && !timelineSelection.frameIndexes.has(frameIndex + 1)
      );
      header.classList.toggle('is-onion-frame', isOnionFrame);
      header.classList.toggle('is-onion-frame-start', isOnionFrame && !onionFrameIndexes.has(frameIndex - 1));
      header.classList.toggle('is-onion-frame-end', isOnionFrame && !onionFrameIndexes.has(frameIndex + 1));
      applyTimelineCellFrame(header, isActiveFrame ? 'frameHeaderActive' : 'frameHeader');
      const button = header.querySelector('.timeline-frame-button');
      if (button) {
        applyTimelineSlotFrame(button, isActiveFrame ? 'active' : 'default');
      }
    });

    const rowVisibilityByIndex = new Map();
    container.querySelectorAll('.timeline-cell--layer-visibility[data-layer-row-index] .timeline-visibility')
      .forEach(control => {
        const rowIndex = Number.parseInt(control.dataset.layerRowIndex || '', 10);
        if (Number.isFinite(rowIndex)) {
          rowVisibilityByIndex.set(rowIndex, control.getAttribute('aria-pressed') !== 'false');
        }
      });
    const layerHeaders = container.querySelectorAll(
      '.timeline-cell--layer[data-layer-row-index]'
    );
    layerHeaders.forEach(header => {
      const rowIndex = Number.parseInt(header.dataset.layerRowIndex || '', 10);
      const layerTrackIndex = Number.parseInt(header.dataset.timelineLayerIndex || '', 10);
      const isActiveLayer = rowIndex === activeLayerRow && !header.classList.contains('is-placeholder');
      const isSelectedLayer = isLayerSelectionMode
        && Number.isFinite(layerTrackIndex)
        && timelineSelection.layerIndexes.has(layerTrackIndex);
      header.classList.toggle('is-active-layer', isActiveLayer);
      header.classList.toggle('is-multi-selected-layer', isSelectedLayer);
      header.classList.toggle('is-structure-selected', isSelectedLayer);
      header.classList.toggle('is-structure-selected-layer', isSelectedLayer);
      header.classList.toggle(
        'is-structure-selection-left',
        isSelectedLayer && header.classList.contains('timeline-cell--layer-visibility')
      );
      header.classList.toggle(
        'is-structure-selection-top',
        isSelectedLayer && !timelineSelection.layerIndexes.has(layerTrackIndex + 1)
      );
      header.classList.toggle(
        'is-structure-selection-bottom',
        isSelectedLayer && !timelineSelection.layerIndexes.has(layerTrackIndex - 1)
      );
      const rowVisible = rowVisibilityByIndex.get(rowIndex) !== false;
      const layerVariant = header.classList.contains('is-placeholder')
        ? 'layerPlaceholder'
        : isActiveLayer
          ? (rowVisible ? 'layerActive' : 'layerActiveHidden')
          : (rowVisible ? 'layer' : 'layerHidden');
      applyTimelineCellFrame(header, layerVariant);
    });

    const bodyCells = container.querySelectorAll(
      '.timeline-cell--body[data-timeline-frame-index][data-layer-row-index]'
    );
    bodyCells.forEach(cell => {
      const frameIndex = Number.parseInt(cell.dataset.timelineFrameIndex || '', 10);
      const rowIndex = Number.parseInt(cell.dataset.layerRowIndex || '', 10);
      const layerIndex = Number.parseInt(cell.dataset.timelineLayerIndex || '', 10);
      const isActiveFrameColumn = frameIndex === activeFrameIndex;
      const isActiveLayerRow = rowIndex === activeLayerRow;
      const isSelectedFrame = isFrameSelectionMode && timelineSelection.frameIndexes.has(frameIndex);
      const isSelectedLayer = isLayerSelectionMode
        && Number.isFinite(layerIndex)
        && timelineSelection.layerIndexes.has(layerIndex);
      const isOnionFrame = onionFrameIndexes.has(frameIndex);
      const slot = cell.querySelector('.timeline-slot');
      const isEmptyCell = !slot || slot.classList.contains('is-disabled');
      const isHiddenCell = Boolean(slot?.classList.contains('is-hidden'));
      const isActiveCell = Boolean(
        slot
        && isActiveFrameColumn
        && slot.dataset.timelineLayerId === state.activeLayer
      );
      cell.classList.toggle('is-active-frame-column', isActiveFrameColumn);
      cell.classList.toggle('is-active-layer-row', isActiveLayerRow);
      cell.classList.toggle('is-active-cell', isActiveCell);
      cell.classList.toggle('is-onion-frame', isOnionFrame);
      cell.classList.toggle('is-onion-frame-start', isOnionFrame && !onionFrameIndexes.has(frameIndex - 1));
      cell.classList.toggle('is-onion-frame-end', isOnionFrame && !onionFrameIndexes.has(frameIndex + 1));
      cell.classList.toggle('is-onion-frame-bottom', isOnionFrame && rowIndex === layerCount - 1);
      cell.classList.toggle('is-structure-selected', isSelectedFrame || isSelectedLayer);
      cell.classList.toggle('is-structure-selected-frame', isSelectedFrame);
      cell.classList.toggle('is-structure-selected-layer', isSelectedLayer);
      cell.classList.toggle(
        'is-structure-selection-left',
        isSelectedFrame && !timelineSelection.frameIndexes.has(frameIndex - 1)
      );
      cell.classList.toggle(
        'is-structure-selection-right',
        (isSelectedFrame && !timelineSelection.frameIndexes.has(frameIndex + 1))
          || (isSelectedLayer && frameIndex === frameCount - 1)
      );
      cell.classList.toggle(
        'is-structure-selection-top',
        isSelectedLayer && !timelineSelection.layerIndexes.has(layerIndex + 1)
      );
      cell.classList.toggle(
        'is-structure-selection-bottom',
        (isSelectedFrame && rowIndex === layerCount - 1)
          || (isSelectedLayer && !timelineSelection.layerIndexes.has(layerIndex - 1))
      );
      if (slot && !isEmptyCell) {
        const isSelectedSlot = isSlotSelectionMode
          && timelineSelection.slotKeys.has(createTimelineSlotKey(frameIndex, layerIndex));
        slot.classList.toggle('is-active', isActiveCell);
        slot.classList.toggle('is-selected', isSelectedSlot);
        cell.classList.toggle('is-selected-slot-cell', isSelectedSlot);
        applyTimelineSlotFrame(slot, isActiveCell ? 'active' : (isHiddenCell ? 'hidden' : 'default'));
      } else {
        cell.classList.remove('is-selected-slot-cell');
      }
      applyTimelineCellFrame(cell, getTimelineBodyVariant({
        isEmpty: isEmptyCell,
        isActiveLayerRow,
        isActiveFrameColumn,
        isActiveCell,
        isHidden: isHiddenCell,
      }));
    });
    return true;
  }

  function syncTimelineElementFromTemplate(target, template) {
    if (!(target instanceof Element) || !(template instanceof Element)) {
      return false;
    }
    Array.from(target.attributes).forEach(attribute => {
      if (!template.hasAttribute(attribute.name)) {
        target.removeAttribute(attribute.name);
      }
    });
    Array.from(template.attributes).forEach(attribute => {
      if (target.getAttribute(attribute.name) !== attribute.value) {
        target.setAttribute(attribute.name, attribute.value);
      }
    });

    const targetChildren = Array.from(target.childNodes);
    const templateChildren = Array.from(template.childNodes);
    const compatible = targetChildren.length === templateChildren.length
      && targetChildren.every((child, index) => (
        child.nodeType === templateChildren[index].nodeType
        && child.nodeName === templateChildren[index].nodeName
      ));
    if (!compatible) {
      target.replaceChildren(...templateChildren);
      return true;
    }
    targetChildren.forEach((child, index) => {
      const source = templateChildren[index];
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.nodeValue !== source.nodeValue) {
          child.nodeValue = source.nodeValue;
        }
      } else if (child instanceof Element && source instanceof Element) {
        syncTimelineElementFromTemplate(child, source);
      }
    });
    return true;
  }

  function reconcileTimelineMatrixChildren(container, fragment) {
    if (!(container instanceof Element) || !(fragment instanceof DocumentFragment)) {
      return false;
    }
    const previousScrollLeft = container.scrollLeft;
    const previousScrollTop = container.scrollTop;
    const existingByKey = new Map();
    const existingChildren = Array.from(container.children);
    existingChildren.forEach(child => {
      const key = String(child.dataset?.timelineNodeKey || '');
      if (key && !existingByKey.has(key)) {
        existingByKey.set(key, child);
      }
    });
    const retained = new Set();
    Array.from(fragment.children).forEach(template => {
      const key = String(template.dataset?.timelineNodeKey || '');
      const existing = key ? existingByKey.get(key) : null;
      if (existing) {
        syncTimelineElementFromTemplate(existing, template);
        container.appendChild(existing);
        retained.add(existing);
      } else {
        container.appendChild(template);
      }
    });
    existingChildren.forEach(child => {
      if (!retained.has(child)) {
        child.remove();
      }
    });
    container.scrollLeft = previousScrollLeft;
    container.scrollTop = previousScrollTop;
    return true;
  }

  function renderTimelineMatrix() {
    const container = dom.controls.timelineMatrix;
    if (!container) return;
    if (!isTimelineMatrixPanelVisible()) {
      markTimelineMatrixRenderDirty();
      return;
    }
    timelineMatrixRenderDirty = false;
    bindTimelineMatrixInteractions();

    const frames = state.frames;
    const frameCount = frames.length;
    if (!frameCount) {
      if (container.childElementCount > 0) {
        container.innerHTML = '';
      }
      timelineMatrixRenderKey = 'empty';
      syncActiveLayerSettingsUI();
      syncActiveFrameSettingsUI();
      return;
    }

    const activeFrameIndex = clamp(state.activeFrame, 0, frameCount - 1);
    state.activeFrame = activeFrameIndex;
    normalizeTimelineSelectionState();
    const onionFrameIndexes = getOnionSkinFrameIndexes();
    const isFrameSelectionMode = timelineSelection.mode === TIMELINE_SELECTION_MODE_FRAME;
    const isSlotSelectionMode = timelineSelection.mode === TIMELINE_SELECTION_MODE_SLOT;
    const multiAssignmentCellMap = buildMultiAssignmentTimelineCellMap();
    const activeCanvasId = getActiveProjectCanvasDocument()?.id || '';
    const pendingGuestMovePreview = getPendingMultiGuestMovePreview(activeCanvasId);
    const guestMoveMode = isMultiAssignedCellRestrictedEditorMode()
      ? (canCurrentGuestFreelyMoveAssignedCell() ? 'free' : 'request')
      : 'none';

    const reversedLayersByFrame = frames.map(frame => frame.layers.slice().reverse());
    const activeLayers = reversedLayersByFrame[activeFrameIndex];
    const layerNames = activeLayers.map((layer, idx) => {
      const parts = String(layer.name).match(/(\d+)/);
      if (parts && parts[1]) {
        return parts[1];
      }
      return String(activeLayers.length - idx);
    });
    const maxLayerCount = reversedLayersByFrame.reduce((max, layers) => Math.max(max, layers.length), 0);
    const layerCount = Math.max(maxLayerCount, 1);

    let activeLayerRow = activeLayers.findIndex(layer => layer.id === state.activeLayer);
    if (activeLayerRow === -1 && activeLayers.length) {
      state.activeLayer = activeLayers[0].id;
      activeLayerRow = 0;
    }

    // Active frame/layer selection does not change the matrix structure.
    // Keep it out of this key so normal navigation can reuse the existing DOM.
    const timelineKeyParts = [`f:${frameCount}`];
    timelineKeyParts.push(`gm:${guestMoveMode}`);
    if (pendingGuestMovePreview) {
      timelineKeyParts.push(`gp:${pendingGuestMovePreview.canvasId}:${pendingGuestMovePreview.frameIndex}:${pendingGuestMovePreview.trackIndex}:${pendingGuestMovePreview.version}`);
    } else {
      timelineKeyParts.push('gp:');
    }
    if (multiAssignmentCellMap.size) {
      const assignmentKey = Array.from(multiAssignmentCellMap.entries())
        .map(([cellKey, value]) => `${cellKey}:${value.clientId}:${value.locked ? 1 : 0}`)
        .sort()
        .join(',');
      timelineKeyParts.push(`as:${assignmentKey}`);
    } else {
      timelineKeyParts.push('as:');
    }
    pruneSharedProjectCellPresence();
    if (sharedProjectCellPresenceByClient.size) {
      const presenceKey = Array.from(sharedProjectCellPresenceByClient.values())
        .filter(entry => entry?.projectKey === activeSharedProjectKey && entry.clientId !== multiState.clientId)
        .map(entry => `${entry.key}:${entry.clientId}:${entry.name}:${entry.updatedAt}`)
        .sort()
        .join(',');
      timelineKeyParts.push(`sp:${presenceKey}`);
    } else {
      timelineKeyParts.push('sp:');
    }
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const frame = frames[frameIndex];
      timelineKeyParts.push(`fr:${frame.id}:${frame.name}:${frame.layers.length}`);
      const frameLayers = frame.layers;
      for (let layerIndex = 0; layerIndex < frameLayers.length; layerIndex += 1) {
        const layer = frameLayers[layerIndex];
        timelineKeyParts.push(`ly:${layer.id}:${layer.name}:${layer.visible ? 1 : 0}`);
      }
    }
    const nextTimelineRenderKey = timelineKeyParts.join('|');
    if (timelineMatrixRenderKey === nextTimelineRenderKey && container.childElementCount > 0) {
      patchTimelineMatrixActiveState(container, activeFrameIndex, activeLayerRow, layerCount);
      syncAnimationFpsDisplayFromState();
      syncActiveLayerSettingsUI();
      syncActiveFrameSettingsUI();
      return;
    }
    timelineMatrixRenderKey = nextTimelineRenderKey;

    const cellSizePx = `${TIMELINE_CELL_SIZE}px`;
    container.style.setProperty('--timeline-cell-size', cellSizePx);
    const layerHeaderColumnCount = 2;
    const frameColumnStart = layerHeaderColumnCount + 1;
    const columnCount = frameCount + layerHeaderColumnCount;
    const rowCount = layerCount + 1;
    container.style.gridTemplateColumns = `repeat(${columnCount}, ${cellSizePx})`;
    container.style.gridTemplateRows = `repeat(${rowCount}, ${cellSizePx})`;

    const fragment = document.createDocumentFragment();

    frames.forEach((frame, frameIndex) => {
      const col = frameIndex + frameColumnStart;
      const header = document.createElement('div');
      header.className = 'timeline-cell timeline-cell--frame-header';
      header.classList.add('pixel-frame');
      header.style.gridColumn = String(col);
      header.style.gridRow = '1';
      header.setAttribute('role', 'columnheader');
      header.dataset.timelineFrameIndex = String(frameIndex);
      header.dataset.timelineFrameId = String(frame.id || '');
      header.dataset.timelineNodeKey = `frame:${String(frame.id || frameIndex)}`;
      if (frameIndex === activeFrameIndex) {
        header.classList.add('is-active-frame');
      }
      const isMultiSelectedFrame = isFrameSelectionMode && timelineSelection.frameIndexes.has(frameIndex);
      if (isMultiSelectedFrame) {
        header.classList.add('is-multi-selected-frame');
        header.classList.add('is-structure-selected', 'is-structure-selected-frame', 'is-structure-selection-top');
        if (!timelineSelection.frameIndexes.has(frameIndex - 1)) {
          header.classList.add('is-structure-selection-left');
        }
        if (!timelineSelection.frameIndexes.has(frameIndex + 1)) {
          header.classList.add('is-structure-selection-right');
        }
      }
      const isOnionFrame = onionFrameIndexes.has(frameIndex);
      if (isOnionFrame) {
        header.classList.add('is-onion-frame');
        if (!onionFrameIndexes.has(frameIndex - 1)) {
          header.classList.add('is-onion-frame-start');
        }
        if (!onionFrameIndexes.has(frameIndex + 1)) {
          header.classList.add('is-onion-frame-end');
        }
      }
      const headerVariant = frameIndex === activeFrameIndex ? 'frameHeaderActive' : 'frameHeader';
      applyTimelineCellFrame(header, headerVariant);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'timeline-frame-button pixel-frame';
      button.dataset.timelineFrameIndex = String(frameIndex);
      const frameNumberMatch = String(frame.name).match(/(\d+)/);
      button.textContent = frameNumberMatch && frameNumberMatch[1] ? frameNumberMatch[1] : String(frameIndex + 1);
      if (guestMoveMode === 'free') {
        button.title = localizeText(
          `クリックで フレーム ${frameIndex + 1} へ移動`,
          `Click to move to Frame ${frameIndex + 1}`
        );
      } else if (guestMoveMode === 'request') {
        button.title = localizeText(
          `クリックで フレーム ${frameIndex + 1} への移動許可を申請`,
          `Click to request moving to Frame ${frameIndex + 1}`
        );
      }
      if (pendingGuestMovePreview && pendingGuestMovePreview.frameIndex === frameIndex) {
        button.classList.add('is-pending-target');
      }
      button.addEventListener('click', event => {
        if (!selectTimelineFrameDirectly(Number.parseInt(button.dataset.timelineFrameIndex || '', 10), { append: event.shiftKey })) {
          return;
        }
        event.stopPropagation();
      });

      header.appendChild(button);
      applyTimelineSlotFrame(button, frameIndex === activeFrameIndex ? 'active' : 'default');
      fragment.appendChild(header);
    });

    for (let rowIndex = 0; rowIndex < layerCount; rowIndex += 1) {
      const row = rowIndex + 2;
      const layer = activeLayers[rowIndex];
      const layerTrackIndex = activeLayers.length - 1 - rowIndex;
      const labelName = layerNames[rowIndex] || String(layerCount - rowIndex);
      const rowVisibilityCell = document.createElement('div');
      rowVisibilityCell.className = 'timeline-cell timeline-cell--layer timeline-cell--layer-visibility';
      rowVisibilityCell.classList.add('pixel-frame');
      rowVisibilityCell.style.gridColumn = '1';
      rowVisibilityCell.style.gridRow = String(row);
      rowVisibilityCell.setAttribute('role', 'gridcell');
      rowVisibilityCell.dataset.layerRowIndex = String(rowIndex);
      rowVisibilityCell.dataset.timelineLayerIndex = String(layerTrackIndex);
      const rowHeader = document.createElement('div');
      rowHeader.className = 'timeline-cell timeline-cell--layer timeline-cell--layer-main';
      rowHeader.classList.add('pixel-frame');
      rowHeader.style.gridColumn = '2';
      rowHeader.style.gridRow = String(row);
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.dataset.layerRowIndex = String(rowIndex);
      rowHeader.dataset.timelineLayerIndex = String(layerTrackIndex);
      const rowVisibility = getLayerVisibilityForRow(rowIndex);

      if (rowIndex === activeLayerRow) {
        rowVisibilityCell.classList.add('is-active-layer');
        rowHeader.classList.add('is-active-layer');
      }
      const isMultiSelectedLayer = timelineSelection.mode === TIMELINE_SELECTION_MODE_LAYER
        && Number.isInteger(layerTrackIndex)
        && layerTrackIndex >= 0
        && timelineSelection.layerIndexes.has(layerTrackIndex);
      const isLayerSelectionStart = isMultiSelectedLayer && !timelineSelection.layerIndexes.has(layerTrackIndex + 1);
      const isLayerSelectionEnd = isMultiSelectedLayer && !timelineSelection.layerIndexes.has(layerTrackIndex - 1);
      if (isMultiSelectedLayer) {
        rowVisibilityCell.classList.add('is-multi-selected-layer');
        rowHeader.classList.add('is-multi-selected-layer');
        rowVisibilityCell.classList.add('is-structure-selected', 'is-structure-selected-layer', 'is-structure-selection-left');
        rowHeader.classList.add('is-structure-selected', 'is-structure-selected-layer');
        if (isLayerSelectionStart) {
          rowVisibilityCell.classList.add('is-structure-selection-top');
          rowHeader.classList.add('is-structure-selection-top');
        }
        if (isLayerSelectionEnd) {
          rowVisibilityCell.classList.add('is-structure-selection-bottom');
          rowHeader.classList.add('is-structure-selection-bottom');
        }
      }

      if (layer) {
        rowVisibilityCell.dataset.layerId = layer.id;
        rowHeader.dataset.layerId = layer.id;
        rowVisibilityCell.dataset.timelineNodeKey = `layer-visibility:${layer.id}`;
        rowHeader.dataset.timelineNodeKey = `layer-main:${layer.id}`;
        const visibilityToggle = document.createElement('button');
        visibilityToggle.type = 'button';
        visibilityToggle.className = 'timeline-visibility';
        visibilityToggle.dataset.layerRowIndex = String(rowIndex);
        visibilityToggle.setAttribute('aria-pressed', String(rowVisibility));
        visibilityToggle.setAttribute(
          'aria-label',
          rowVisibility
            ? localizeText('レイヤーを非表示', 'Hide layer')
            : localizeText('レイヤーを表示', 'Show layer')
        );
        visibilityToggle.textContent = rowVisibility ? '●' : '○';
        rowVisibilityCell.appendChild(visibilityToggle);

        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'timeline-layer-tag';
        tag.dataset.timelineLayerId = layer.id;
        tag.dataset.timelineLayerIndex = String(layerTrackIndex);
        tag.disabled = isMultiReadOnlyMode();
        tag.textContent = labelName;
        if (guestMoveMode === 'free') {
          tag.title = localizeText(
            `クリックで レイヤー ${labelName} へ移動`,
            `Click to move to Layer ${labelName}`
          );
        } else if (guestMoveMode === 'request') {
          tag.title = localizeText(
            `クリックで レイヤー ${labelName} への移動許可を申請`,
            `Click to request moving to Layer ${labelName}`
          );
        }
        if (pendingGuestMovePreview && pendingGuestMovePreview.trackIndex === layerTrackIndex) {
          tag.classList.add('is-pending-target');
        }
        tag.addEventListener('click', event => {
          if (!selectTimelineLayerDirectly(Number.parseInt(tag.dataset.timelineLayerIndex || '', 10), { append: event.shiftKey })) {
            return;
          }
          event.stopPropagation();
        });
        rowHeader.appendChild(tag);
      } else {
        rowVisibilityCell.dataset.timelineNodeKey = `layer-visibility:placeholder:${rowIndex}`;
        rowHeader.dataset.timelineNodeKey = `layer-main:placeholder:${rowIndex}`;
        rowVisibilityCell.classList.add('is-placeholder');
        rowVisibilityCell.setAttribute('aria-hidden', 'true');
        rowHeader.classList.add('is-placeholder');
        rowHeader.textContent = labelName;
        rowHeader.setAttribute('aria-hidden', 'true');
      }

      const layerVariant = rowHeader.classList.contains('is-placeholder')
        ? 'layerPlaceholder'
        : rowIndex === activeLayerRow
          ? (rowVisibility ? 'layerActive' : 'layerActiveHidden')
          : (rowVisibility ? 'layer' : 'layerHidden');
      applyTimelineCellFrame(rowVisibilityCell, layerVariant);
      applyTimelineCellFrame(rowHeader, layerVariant);
      fragment.appendChild(rowVisibilityCell);
      fragment.appendChild(rowHeader);

      frames.forEach((frame, frameIndex) => {
        const col = frameIndex + frameColumnStart;
        const cell = document.createElement('div');
        cell.className = 'timeline-cell timeline-cell--body';
        cell.classList.add('pixel-frame');
        cell.style.gridColumn = String(col);
        cell.style.gridRow = String(row);
        cell.setAttribute('role', 'gridcell');
        cell.dataset.timelineFrameIndex = String(frameIndex);
        cell.dataset.timelineFrameId = String(frame.id || '');
        cell.dataset.layerRowIndex = String(rowIndex);

        if (rowIndex === activeLayerRow) {
          cell.classList.add('is-active-layer-row');
        }
        if (frameIndex === activeFrameIndex) {
          cell.classList.add('is-active-frame-column');
        }
        const isOnionFrame = onionFrameIndexes.has(frameIndex);
        if (isOnionFrame) {
          cell.classList.add('is-onion-frame');
          if (!onionFrameIndexes.has(frameIndex - 1)) {
            cell.classList.add('is-onion-frame-start');
          }
          if (!onionFrameIndexes.has(frameIndex + 1)) {
            cell.classList.add('is-onion-frame-end');
          }
          if (rowIndex === layerCount - 1) {
            cell.classList.add('is-onion-frame-bottom');
          }
        }

        const frameLayers = reversedLayersByFrame[frameIndex];
        const targetLayer = frameLayers[rowIndex];
        const layerIndex = frame.layers.length - 1 - rowIndex;
        cell.dataset.timelineLayerIndex = String(layerIndex);
        const isSelectedSlot = isSlotSelectionMode
          && hasTimelineLayerIndex(frameIndex, layerIndex)
          && timelineSelection.slotKeys.has(createTimelineSlotKey(frameIndex, layerIndex));
        const isActiveLayerRow = rowIndex === activeLayerRow;
        const isActiveFrameColumn = frameIndex === activeFrameIndex;
        const isMultiSelectedFrame = isFrameSelectionMode && timelineSelection.frameIndexes.has(frameIndex);
        const isColumnSelectionStart = isMultiSelectedFrame && !timelineSelection.frameIndexes.has(frameIndex - 1);
        const isColumnSelectionEnd = isMultiSelectedFrame && !timelineSelection.frameIndexes.has(frameIndex + 1);
        let isActiveCell = false;
        let isEmptyCell = false;
        let isHiddenCell = false;

        if (isMultiSelectedFrame) {
          cell.classList.add('is-structure-selected', 'is-structure-selected-frame');
          if (isColumnSelectionStart) {
            cell.classList.add('is-structure-selection-left');
          }
          if (isColumnSelectionEnd) {
            cell.classList.add('is-structure-selection-right');
          }
          if (rowIndex === layerCount - 1) {
            cell.classList.add('is-structure-selection-bottom');
          }
        }
        if (isMultiSelectedLayer) {
          cell.classList.add('is-structure-selected', 'is-structure-selected-layer');
          if (isLayerSelectionStart) {
            cell.classList.add('is-structure-selection-top');
          }
          if (isLayerSelectionEnd) {
            cell.classList.add('is-structure-selection-bottom');
          }
          if (frameIndex === frameCount - 1) {
            cell.classList.add('is-structure-selection-right');
          }
        }

        if (!targetLayer) {
          cell.dataset.timelineNodeKey = `body:${String(frame.id || frameIndex)}:placeholder:${rowIndex}`;
          isEmptyCell = true;
          cell.classList.add('is-empty');
          const placeholder = document.createElement('span');
          placeholder.className = 'timeline-slot is-disabled';
          placeholder.textContent = '—';
          placeholder.setAttribute('aria-hidden', 'true');
          applyTimelineSlotFrame(placeholder, 'disabled');
          cell.appendChild(placeholder);
        } else {
          cell.dataset.timelineLayerId = String(targetLayer.id || '');
          cell.dataset.timelineNodeKey = `body:${String(frame.id || frameIndex)}:${String(targetLayer.id || layerIndex)}`;
          const slot = document.createElement('button');
          slot.type = 'button';
          slot.className = 'timeline-slot';
          slot.dataset.timelineFrameIndex = String(frameIndex);
          slot.dataset.timelineLayerIndex = String(layerIndex);
          slot.dataset.timelineLayerId = targetLayer.id;
          const assignmentKey = createTimelineSlotKey(frameIndex, layerIndex);
          const assignedUser = multiAssignmentCellMap.get(assignmentKey) || null;
          const assignedUserName = assignedUser?.name || '';
          const assignedUserLockLabel = assignedUser?.locked
            ? localizeText(' / ロック中', ' / Locked')
            : '';
          const slotLabel = assignedUserName
            ? localizeText(
              `${frame.name} / ${targetLayer.name} / 担当: ${assignedUserName}${assignedUserLockLabel}`,
              `${frame.name} / ${targetLayer.name} / Assignee: ${assignedUserName}${assignedUserLockLabel}`
            )
            : `${frame.name} / ${targetLayer.name}`;
          slot.setAttribute('aria-label', slotLabel);
          if (!targetLayer.visible) {
            slot.classList.add('is-hidden');
            isHiddenCell = true;
          }
          if (assignedUser) {
            cell.classList.add('is-multi-assigned-cell');
            cell.style.setProperty('--multi-assignee-color', assignedUser.color);
            cell.dataset.multiAssigneeClientId = assignedUser.clientId;
            slot.classList.add('is-multi-assigned-cell');
            slot.style.setProperty('--multi-assignee-color', assignedUser.color);
            slot.dataset.multiAssigneeClientId = assignedUser.clientId;
            slot.title = assignedUserName
              ? localizeText(`担当: ${assignedUserName}${assignedUserLockLabel}`, `Assignee: ${assignedUserName}${assignedUserLockLabel}`)
              : (assignedUser?.locked ? localizeText('担当セル: ロック中', 'Assigned cell: Locked') : '');
          }
          const sharedCellUsers = getSharedProjectCellPresenceEntriesForCell({
            canvasId: activeCanvasId,
            frameIndex,
            layerId: targetLayer.id,
          });
          if (sharedCellUsers.length) {
            const userNames = sharedCellUsers.map(entry => entry.name).filter(Boolean);
            const userLabel = userNames.join(', ');
            cell.classList.add('is-shared-cell-occupied');
            cell.dataset.sharedCellUsers = sharedCellUsers.length > 9 ? '9+' : String(sharedCellUsers.length);
            slot.classList.add('is-shared-cell-occupied');
            slot.disabled = true;
            slot.setAttribute('aria-disabled', 'true');
            slot.title = userLabel
              ? localizeText(`選択中: ${userLabel}`, `Selected by: ${userLabel}`)
              : localizeText('他の参加者が選択中', 'Selected by another participant');
          }
          if (guestMoveMode === 'free') {
            slot.title = localizeText(
              `${slotLabel} / クリックで即移動`,
              `${slotLabel} / Click to move immediately`
            );
          } else if (guestMoveMode === 'request') {
            slot.title = localizeText(
              `${slotLabel} / クリックで移動許可を申請`,
              `${slotLabel} / Click to request move permission`
            );
          }
          if (frameIndex === activeFrameIndex && targetLayer.id === state.activeLayer) {
            slot.classList.add('is-active');
            cell.classList.add('is-active-cell');
            isActiveCell = true;
          }
          if (
            pendingGuestMovePreview
            && pendingGuestMovePreview.frameIndex === frameIndex
            && pendingGuestMovePreview.trackIndex === layerIndex
          ) {
            slot.classList.add('is-pending-target');
            cell.classList.add('is-pending-target-cell');
          }
          if (isSelectedSlot) {
            slot.classList.add('is-selected');
            cell.classList.add('is-selected-slot-cell');
          }
          slot.addEventListener('click', event => {
            if (!selectTimelineSlotDirectly(
              Number.parseInt(slot.dataset.timelineFrameIndex || '', 10),
              Number.parseInt(slot.dataset.timelineLayerIndex || '', 10),
              { append: event.shiftKey }
            )) {
              return;
            }
            event.stopPropagation();
          });
          const marker = document.createElement('span');
          marker.className = 'timeline-slot__marker';
          marker.setAttribute('aria-hidden', 'true');
          slot.appendChild(marker);

          let slotVariant = 'default';
          if (!targetLayer.visible) {
            slotVariant = 'hidden';
          }
          if (slot.classList.contains('is-active')) {
            slotVariant = 'active';
          }
          applyTimelineSlotFrame(slot, slotVariant);
          cell.appendChild(slot);
        }

        const bodyVariant = getTimelineBodyVariant({
          isEmpty: isEmptyCell,
          isActiveLayerRow,
          isActiveFrameColumn,
          isActiveCell,
          isHidden: isHiddenCell,
        });
        applyTimelineCellFrame(cell, bodyVariant);
        fragment.appendChild(cell);
      });
    }

    reconcileTimelineMatrixChildren(container, fragment);

    syncAnimationFpsDisplayFromState();
    syncActiveLayerSettingsUI();
    syncActiveFrameSettingsUI();
    if (state.playback.isPlaying) {
      syncPlaybackTimelineCursorIndicators();
    }
  }

  function renderFrameList({ immediate = false } = {}) {
    if (!isTimelineMatrixPanelVisible()) {
      markTimelineMatrixRenderDirty();
      return;
    }
    if (!immediate && shouldDeferTimelineMatrixRender(state.frames)) {
      scheduleDeferredTimelineMatrixRender();
      return;
    }
    renderTimelineMatrix();
  }

  function renderLayerList() {
    syncActiveLayerSettingsUI();
    syncActiveFrameSettingsUI();
    updatePixfindModeUI();
  }

        return Object.freeze({
          createTimelineSlotKey,
          getDeterministicColorIndex,
          getMultiAssignmentColorForClient,
          buildMultiAssignmentTimelineCellMap,
          parseTimelineSlotKey,
          hasTimelineLayerIndex,
          normalizeTimelineSelectionState,
          clearTimelineSelection,
          clearTimelineSelectionForCanvasInteraction,
          setTimelineFrameSelection,
          setTimelineSlotSelection,
          setTimelineLayerSelection,
          getTimelineSelectedFrameIndexes,
          getTimelineSelectedSlotEntries,
          getTimelineSelectedLayerIndexes,
          hasTimelineStructureSelection,
          copyTimelineSelection,
          validateTimelineClipboardDimensions,
          pasteTimelineClipboard,
          duplicateSelectedTimelineFrames,
          duplicateSelectedTimelineLayers,
          swapLayerPixelPayload,
          moveFrameIndexesByOffset,
          moveLayerIndexesByOffset,
          moveSelectedSlotsHorizontally,
          moveSelectedSlotsVertically,
          moveActiveLayer,
          moveActiveFrame,
          setupFramesAndLayers,
          startPlayback,
          schedulePlaybackUiRefresh,
          stopPlayback,
          stepPlayback,
          updatePlaybackButtons,
          applyTimelineToolbarFrames,
          getTimelineBodyVariant,
          applyTimelineCellFrame,
          applyTimelineSlotFrame,
          getLayerVisibilityForRow,
          setLayerVisibilityForRow,
          toggleLayerVisibilityForRow,
          getActiveLayerTrackIndex,
          forEachLayerInTrack,
          setActiveLayerTrackOpacity,
          setActiveLayerTrackBlendMode,
          updateLayerOpacityOutput,
          syncActiveLayerSettingsUI,
          updateOnionSkinEnabledOutput,
          updateOnionSkinCountOutput,
          updateOnionSkinOpacityOutput,
          setOnionSkinSettings,
          getOnionSkinFrameIndexes,
          syncActiveFrameSettingsUI,
          getTimelineMatrixViewport,
          getTimelineMatrixViewportMaxScroll,
          normalizeTimelineMatrixWheelDelta,
          scrollTimelineMatrixViewport,
          clearTimelineMatrixViewportPan,
          handleTimelineMatrixViewportPointerDown,
          handleTimelineMatrixViewportPointerMove,
          handleTimelineMatrixViewportPointerUp,
          handleTimelineMatrixViewportWheel,
          setActiveTimelineLayerId,
          bindTimelineMatrixInteractions,
          clearPlaybackTimelineCursorIndicators,
          syncPlaybackTimelineCursorIndicators,
          getTimelineRenderCellCount,
          shouldDeferTimelineMatrixRender,
          isLargeDocumentPerformanceMode,
          scheduleSecondaryCanvasRefresh,
          refreshSecondaryCanvasSurfaces,
          refreshInactiveProjectCanvasSurfacesSoon,
          isTimelineMatrixPanelVisible,
          markTimelineMatrixRenderDirty,
          flushTimelineMatrixRenderIfVisible,
          scheduleTimelineMatrixRenderSoon,
          scheduleDeferredTimelineMatrixRender,
          renderTimelineMatrix,
          renderFrameList,
          renderLayerList,
        });
      }
    })(scope);
  }

  root.timelineLayers = {
    createTimelineLayersModule,
  };
})();
