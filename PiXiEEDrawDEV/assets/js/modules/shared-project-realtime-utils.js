(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createSharedProjectRealtimeUtils(rawScope = {}) {
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
  function clearMultiLayerPatchSnapshots() {
    if (multiState.layerPatchSnapshots instanceof Map) {
      multiState.layerPatchSnapshots.clear();
    }
    if (multiState.layerPatchSendSequences instanceof Map) {
      multiState.layerPatchSendSequences.clear();
    }
    if (multiState.layerPatchReceiveSequences instanceof Map) {
      multiState.layerPatchReceiveSequences.clear();
    }
    if (multiState.layerPatchResyncRequestAt instanceof Map) {
      multiState.layerPatchResyncRequestAt.clear();
    }
    if (multiState.layerPatchResyncRequests instanceof Map) {
      multiState.layerPatchResyncRequests.clear();
    }
  }

  function clearMultiLayerPatchSendTimers() {
    if (multiState.masterLayerPatchTimer !== null) {
      window.clearTimeout(multiState.masterLayerPatchTimer);
      multiState.masterLayerPatchTimer = null;
    }
    if (multiState.guestLayerPatchTimer !== null) {
      window.clearTimeout(multiState.guestLayerPatchTimer);
      multiState.guestLayerPatchTimer = null;
    }
    multiState.masterLayerPatchQueued = false;
    multiState.masterLayerPatchInFlight = false;
    multiState.guestLayerPatchQueued = false;
    multiState.guestLayerPatchInFlight = false;
  }

  function markRemoteMultiStateDirty({
    clearLayerPatchSnapshots = false,
    autosaveDelayMs = AUTOSAVE_REMOTE_MULTI_WRITE_DELAY,
  } = {}) {
    invalidateFillPreviewCache();
    invalidateOnionSkinCache();
    clearPlaybackFrameCache();
    if (clearLayerPatchSnapshots) {
      clearMultiLayerPatchSnapshots();
    }
    if (isMultiMasterMode()) {
      multiState.publicLobbyThumbnailDirty = true;
    }
    markAutosaveDirty();
    markDocumentUnsavedChange();
    scheduleAutosaveSnapshot({ delayMs: autosaveDelayMs });
    scheduleSessionPersist({ includeSnapshots: false });
    queueSharedProjectCurrentSnapshotCapture({ delayMs: autosaveDelayMs });
  }

  function createMultiChannelName(projectKey) {
    const normalized = normalizeMultiProjectKey(projectKey);
    return `${MULTI_CHANNEL_PREFIX}${normalized || 'default'}`;
  }

  function bindMultiChannelRealtimeHandlers(channel) {
    if (prefersSharedProjectFlow()) {
      console.debug('[multi] legacy realtime handlers skipped in shared project flow');
      return;
    }
    channel.on('presence', { event: 'sync' }, () => {
      refreshMultiParticipantsFromPresence();
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.HELLO }, message => {
      handleMultiHelloMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.SYNC_REQUEST }, message => {
      handleMultiSyncRequestMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.SESSION_STATE }, message => {
      handleMultiSessionStateMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.MASTER_STATE_REQUEST }, message => {
      handleMultiMasterStateRequestMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.GUEST_SESSION_STATE }, message => {
      handleMultiGuestSessionStateMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.GUEST_LAYER_PATCH }, message => {
      handleMultiGuestLayerPatchMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.GUEST_PALETTE_UPDATE }, message => {
      handleMultiGuestPaletteUpdateMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.MASTER_LAYER_PATCH }, message => {
      handleMultiMasterLayerPatchMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.KICK_CLIENT }, message => {
      handleMultiKickClientMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.COMMENT }, message => {
      handleMultiCommentMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.JOIN_REQUEST }, message => {
      handleMultiJoinRequestMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.JOIN_REQUEST_RESULT }, message => {
      handleMultiJoinRequestResultMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.ROLE_CHANGE }, message => {
      handleMultiRoleChangeMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.ASSIGNMENT_MOVE_REQUEST }, message => {
      handleMultiAssignmentMoveRequestMessage(message?.payload || {});
    });
    channel.on('broadcast', { event: MULTI_BROADCAST_EVENT.ASSIGNMENT_MOVE_RESULT }, message => {
      handleMultiAssignmentMoveResultMessage(message?.payload || {});
    });
  }

  async function ensureMultiSupabaseClient() {
    if (multiState.supabase) {
      return multiState.supabase;
    }
    if (multiSupabaseClientPromise) {
      return multiSupabaseClientPromise;
    }
    multiSupabaseClientPromise = (async () => {
      const module = await import(MULTI_SUPABASE_MODULE_URL);
      if (!module || typeof module.createClient !== 'function') {
        throw new Error('Supabase client unavailable');
      }
      const supabase = module.createClient(MULTI_SUPABASE_URL, MULTI_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, storageKey: 'pixieed-multi-auth' },
        realtime: {
          params: { eventsPerSecond: 24 },
        },
      });
      multiState.supabase = supabase;
      return supabase;
    })();
    try {
      return await multiSupabaseClientPromise;
    } catch (error) {
      multiSupabaseClientPromise = null;
      throw error;
    }
  }

  function waitForMultiSubscription(channel) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error('Shared session subscribe timed out'));
      }, 15000);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED' && !settled) {
          settled = true;
          window.clearTimeout(timeout);
          resolve();
          return;
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !settled) {
          settled = true;
          window.clearTimeout(timeout);
          reject(new Error(`Shared session failed: ${status}`));
          return;
        }
        if (status === 'CLOSED' && multiState.channel === channel) {
          disconnectMultiSession({ silent: true });
          setMultiStatus(localizeText('共有モード: 接続が終了しました', 'Collab mode: connection closed'), 'warn');
        }
      });
    });
  }

  async function sendMultiBroadcast(event, payload) {
    if (prefersSharedProjectFlow()) {
      console.debug('[multi] legacy broadcast blocked in shared project flow', event);
      return false;
    }
    if (!multiState.channel) {
      return false;
    }
    try {
      await multiState.channel.send({
        type: 'broadcast',
        event,
        payload,
      });
      return true;
    } catch (error) {
      console.warn('Multi broadcast failed', event, error);
      return false;
    }
  }

  function moveLayerTrackForAllFrames(sourceIndex, targetIndex) {
    if (!Array.isArray(state.frames) || !state.frames.length) {
      return false;
    }
    const frame0 = state.frames[0];
    if (!frame0 || !Array.isArray(frame0.layers) || !frame0.layers.length) {
      return false;
    }
    const from = clamp(Math.round(Number(sourceIndex) || 0), 0, frame0.layers.length - 1);
    const to = clamp(Math.round(Number(targetIndex) || 0), 0, frame0.layers.length - 1);
    if (from === to) {
      return false;
    }
    state.frames.forEach(frame => {
      if (!frame || !Array.isArray(frame.layers) || from >= frame.layers.length) {
        return;
      }
      const [layer] = frame.layers.splice(from, 1);
      if (!layer) {
        return;
      }
      const insertAt = clamp(to, 0, frame.layers.length);
      frame.layers.splice(insertAt, 0, layer);
    });
    return true;
  }

  function insertLayerTrackForAllFrames(insertIndex, name) {
    if (!Array.isArray(state.frames) || !state.frames.length) {
      return '';
    }
    let anchorLayerId = '';
    state.frames.forEach((frame, frameIndex) => {
      if (!frame || !Array.isArray(frame.layers)) {
        return;
      }
      const safeIndex = clamp(Math.round(Number(insertIndex) || 0), 0, frame.layers.length);
      const layerName = typeof name === 'string' && name.trim() ? name.trim() : `共同レイヤー ${safeIndex + 1}`;
      const layer = createLayer(layerName, state.width, state.height);
      frame.layers.splice(safeIndex, 0, layer);
      if (frameIndex === 0) {
        anchorLayerId = layer.id;
      }
    });
    return anchorLayerId;
  }

  function ensureMasterLayerAssignment() {
    if (!isMultiMasterMode()) {
      return null;
    }
    const activeCanvas = getActiveProjectCanvasDocument();
    const activeCanvasId = activeCanvas?.id || '';
    const frame0 = state.frames[0];
    if (!frame0 || !Array.isArray(frame0.layers) || !frame0.layers.length) {
      return null;
    }
    const existing = getMultiAssignment(multiState.clientId);
    if (existing) {
      const existingCanvasId = normalizeMultiAssignmentCanvasId(existing.canvasId, activeCanvasId);
      const existingTrack = existingCanvasId === activeCanvasId
        ? getMultiLayerTrackIndexByAnchorLayerId(existing.anchorLayerId)
        : -1;
      if (existingTrack >= 0) {
        const frameCount = Math.max(1, Array.isArray(state.frames) ? state.frames.length : 1);
        const fallbackFrameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, frameCount - 1);
        const existingFrame = getAssignedFrameIndexForClient(multiState.clientId, activeCanvas);
        const resolvedFrameIndex = existingFrame >= 0 ? existingFrame : fallbackFrameIndex;
        existing.canvasId = activeCanvasId;
        existing.trackHint = existingTrack;
        existing.frameId = state.frames[resolvedFrameIndex]?.id || '';
        existing.frameHint = resolvedFrameIndex;
        multiState.assignments.set(multiState.clientId, existing);
        multiState.masterClientId = multiState.clientId;
        return existing;
      }
      multiState.assignments.delete(multiState.clientId);
    }
    const sourceTrack = (() => {
      const activeTrack = getActiveLayerTrackIndex();
      if (activeTrack >= 0 && activeTrack < frame0.layers.length) {
        return activeTrack;
      }
      return frame0.layers.length - 1;
    })();
    const targetTrack = frame0.layers.length - 1;
    const moved = moveLayerTrackForAllFrames(sourceTrack, targetTrack);
    const anchorLayer = state.frames[0]?.layers?.[state.frames[0].layers.length - 1] || null;
    if (!anchorLayer) {
      return null;
    }
    const assignment = {
      clientId: multiState.clientId,
      role: 'master',
      name: getLocalMultiParticipantName(),
      canvasId: activeCanvasId,
      anchorLayerId: anchorLayer.id,
      trackHint: state.frames[0].layers.length - 1,
      frameId: state.frames[clamp(Math.round(Number(state.activeFrame) || 0), 0, Math.max(0, state.frames.length - 1))]?.id || '',
      frameHint: clamp(Math.round(Number(state.activeFrame) || 0), 0, Math.max(0, state.frames.length - 1)),
      joinedAt: Date.now(),
    };
    multiState.assignments.set(multiState.clientId, assignment);
    multiState.masterClientId = multiState.clientId;
    if (moved) {
      markRemoteMultiStateDirty({ clearLayerPatchSnapshots: true });
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
    }
    return assignment;
  }

  function findAvailableFrameIndexForTrack(trackIndex, ignoreClientId = '') {
    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    if (!frameCount) {
      return -1;
    }
    const normalizedTrack = Math.max(0, Math.round(Number(trackIndex) || 0));
    const used = getUsedMultiAssignmentCellKeys(ignoreClientId);
    const preferredFrame = clamp(Math.round(Number(state.activeFrame) || 0), 0, frameCount - 1);
    for (let offset = 0; offset < frameCount; offset += 1) {
      const frameIndex = (preferredFrame + offset) % frameCount;
      const key = getMultiAssignmentCellKey(frameIndex, normalizedTrack);
      if (!used.has(key)) {
        return frameIndex;
      }
    }
    return -1;
  }

  function appendFrameForMultiAssignment() {
    if (!Array.isArray(state.frames) || !state.frames.length) {
      return null;
    }
    const safeActiveFrame = clamp(Math.round(Number(state.activeFrame) || 0), 0, state.frames.length - 1);
    const baseFrame = state.frames[safeActiveFrame] || state.frames[state.frames.length - 1];
    if (!baseFrame || !Array.isArray(baseFrame.layers) || !baseFrame.layers.length) {
      return null;
    }
    const newFrame = createFrame(getDefaultFrameName(state.frames.length + 1), baseFrame.layers, state.width, state.height);
    state.frames.push(newFrame);
    return newFrame;
  }

  function ensureAvailableFrameForTrack(trackIndex, ignoreClientId = '') {
    let frameIndex = findAvailableFrameIndexForTrack(trackIndex, ignoreClientId);
    let guard = 0;
    while (frameIndex < 0 && guard < 32) {
      const appended = appendFrameForMultiAssignment();
      if (!appended) {
        break;
      }
      guard += 1;
      frameIndex = findAvailableFrameIndexForTrack(trackIndex, ignoreClientId);
    }
    return frameIndex;
  }

  function assignLayerToGuestClient(clientId, participantName = '') {
    if (!isMultiMasterMode()) {
      return null;
    }
    if (!clientId || clientId === multiState.clientId) {
      return null;
    }
    if (isMultiClientBlocked(clientId)) {
      return null;
    }
    const existing = getMultiAssignment(clientId);
    if (existing) {
      return existing;
    }
    if (isMultiGuestLimitReached()) {
      return null;
    }
    const masterAssignment = ensureMasterLayerAssignment();
    if (!masterAssignment) {
      return null;
    }
    const masterTrack = getMultiLayerTrackIndexByAnchorLayerId(masterAssignment.anchorLayerId);
    if (masterTrack < 0) {
      return null;
    }
    const guestCount = getAssignedGuestCount();
    const insertIndex = clamp(masterTrack - guestCount, 0, masterTrack);
    const safeName = typeof participantName === 'string' && participantName.trim()
      ? participantName.trim().slice(0, 24)
      : DEFAULT_MULTI_PARTICIPANT_NAME;
    const layerName = `共同 ${safeName}`;
    const anchorLayerId = insertLayerTrackForAllFrames(insertIndex, layerName);
    if (!anchorLayerId) {
      return null;
    }
    const assignment = {
      clientId,
      role: 'guest',
      name: safeName,
      canvasId: getActiveProjectCanvasDocument()?.id || '',
      anchorLayerId,
      trackHint: insertIndex,
      frameId: '',
      frameHint: 0,
      joinedAt: Date.now(),
    };
    const assignedFrameIndex = ensureAvailableFrameForTrack(insertIndex, clientId);
    if (assignedFrameIndex >= 0) {
      assignment.frameId = state.frames[assignedFrameIndex]?.id || '';
      assignment.frameHint = assignedFrameIndex;
    } else {
      return null;
    }
    multiState.assignments.set(clientId, assignment);
    normalizeMultiAssignmentsForCurrentDocument();
    markRemoteMultiStateDirty({ clearLayerPatchSnapshots: true });
    renderFrameList();
    renderLayerList();
    requestRender();
    requestOverlayRender();
    return assignment;
  }

  function clearMultiBroadcastTimer() {
    if (multiState.broadcastTimer !== null) {
      window.clearTimeout(multiState.broadcastTimer);
      multiState.broadcastTimer = null;
    }
    multiState.pendingBroadcastTargetClientId = '';
  }

  function clearMultiGuestMovePreview({ render = false } = {}) {
    if (multiState.guestMovePreviewTimer !== null) {
      window.clearTimeout(multiState.guestMovePreviewTimer);
      multiState.guestMovePreviewTimer = null;
    }
    multiState.guestMovePreview = null;
    if (render) {
      renderTimelineMatrix();
      requestOverlayRender();
    }
  }

  function getPendingMultiGuestMovePreview(canvasId = getActiveProjectCanvasDocument()?.id || '') {
    const preview = multiState.guestMovePreview;
    if (!preview || typeof preview !== 'object') {
      return null;
    }
    if (!isMultiGuestMode() || !canCurrentGuestFreelyMoveAssignedCell()) {
      return null;
    }
    const previewCanvasId = normalizeMultiAssignmentCanvasId(preview.canvasId, canvasId || '');
    const normalizedCanvasId = normalizeMultiAssignmentCanvasId(canvasId, previewCanvasId || '');
    if (normalizedCanvasId && previewCanvasId && normalizedCanvasId !== previewCanvasId) {
      return null;
    }
    const frameIndex = Math.round(Number(preview.frameIndex));
    const trackIndex = Math.round(Number(preview.trackIndex));
    const version = Math.round(Number(preview.version));
    if (!Number.isFinite(frameIndex) || frameIndex < 0 || !Number.isFinite(trackIndex) || trackIndex < 0 || !Number.isFinite(version) || version < 0) {
      return null;
    }
    return {
      canvasId: previewCanvasId || normalizedCanvasId || '',
      frameIndex,
      trackIndex,
      version,
      source: typeof preview.source === 'string' ? preview.source : 'timeline',
    };
  }

  function setMultiGuestMovePreview(frameIndex, trackIndex, {
    canvasId = getActiveProjectCanvasDocument()?.id || '',
    source = 'timeline',
  } = {}) {
    const normalizedCanvasId = normalizeMultiAssignmentCanvasId(canvasId, getActiveProjectCanvasDocument()?.id || '');
    const nextPreview = {
      canvasId: normalizedCanvasId,
      frameIndex: Math.max(0, Math.round(Number(frameIndex) || 0)),
      trackIndex: Math.max(0, Math.round(Number(trackIndex) || 0)),
      version: Math.max(0, Math.round(Number(multiState.guestMovePreviewVersion) || 0)) + 1,
      source: typeof source === 'string' && source.trim() ? source.trim() : 'timeline',
    };
    multiState.guestMovePreviewVersion = nextPreview.version;
    multiState.guestMovePreview = nextPreview;
    return nextPreview;
  }

  function scheduleMultiGuestMovePreview(frameIndexRaw, trackIndexRaw, {
    canvasId = getActiveProjectCanvasDocument()?.id || '',
    source = 'timeline',
    immediate = false,
  } = {}) {
    if (!isMultiGuestMode()) {
      return false;
    }
    if (!canCurrentGuestFreelyMoveAssignedCell()) {
      requestMultiGuestMoveToCell(frameIndexRaw, trackIndexRaw, {
        source,
        announceStatus: true,
      }).catch(() => {});
      return true;
    }
    const targetCanvas = getProjectCanvasDocumentById(
      normalizeMultiAssignmentCanvasId(canvasId, getActiveProjectCanvasDocument()?.id || '')
    ) || getActiveProjectCanvasDocument();
    const frameCount = Array.isArray(targetCanvas?.frames) ? targetCanvas.frames.length : 0;
    if (!frameCount) {
      return false;
    }
    const assignment = getMultiAssignment(multiState.clientId);
    if (!assignment) {
      maybeRequestGuestAssignmentSync();
      setMultiStatus(localizeText('割り当てセルを待機中です。マスターの同期を待ってください。', 'Waiting for assigned cell. Please wait for master sync.'), 'warn');
      return false;
    }
    if (assignment.locked) {
      setMultiStatus(localizeText('この参加者セルはマスターによってロックされています', 'This participant cell is locked by the master'), 'warn');
      return false;
    }
    const frameIndex = clamp(Math.round(Number(frameIndexRaw) || 0), 0, frameCount - 1);
    const layerCount = Array.isArray(targetCanvas.frames[frameIndex]?.layers) ? targetCanvas.frames[frameIndex].layers.length : 0;
    if (!layerCount) {
      setMultiStatus(localizeText('指定セルへ移動できませんでした', 'Failed to move to the specified cell'), 'warn');
      return false;
    }
    const trackIndex = clamp(Math.round(Number(trackIndexRaw) || 0), 0, layerCount - 1);
    const assignedCell = getAssignedCellForClient(multiState.clientId);
    if (
      assignedCell
      && assignedCell.canvasId === (targetCanvas?.id || '')
      && assignedCell.frameIndex === frameIndex
      && assignedCell.trackIndex === trackIndex
    ) {
      clearMultiGuestMovePreview();
      state.activeFrame = frameIndex;
      state.activeLayer = assignedCell.layer.id;
      syncControlsWithState();
      renderFrameList();
      renderLayerList();
      renderTimelineMatrix();
      scheduleSessionPersist();
      requestRender();
      requestOverlayRender();
      return true;
    }
    if (isMultiAssignmentCellOccupied(frameIndex, trackIndex, multiState.clientId, targetCanvas)) {
      setMultiStatus(localizeText('そのセルは他の参加者が使用中です', 'That cell is already used by another participant'), 'warn');
      return false;
    }
    const currentPreview = getPendingMultiGuestMovePreview(targetCanvas?.id || '');
    const nextPreview = currentPreview
      && currentPreview.frameIndex === frameIndex
      && currentPreview.trackIndex === trackIndex
      ? currentPreview
      : setMultiGuestMovePreview(frameIndex, trackIndex, {
        canvasId: targetCanvas?.id || '',
        source,
      });
    renderTimelineMatrix();
    if (multiState.guestMovePreviewTimer !== null) {
      window.clearTimeout(multiState.guestMovePreviewTimer);
      multiState.guestMovePreviewTimer = null;
    }
    const dispatchMove = () => {
      const preview = getPendingMultiGuestMovePreview(targetCanvas?.id || '');
      if (!preview || preview.version !== nextPreview.version) {
        return;
      }
      requestMultiGuestMoveToCell(preview.frameIndex, preview.trackIndex, {
        requestVersion: preview.version,
        source,
        announceStatus: false,
      }).catch(() => {
        if ((multiState.guestMovePreview?.version || -1) === preview.version) {
          clearMultiGuestMovePreview({ render: true });
        }
      });
    };
    if (immediate) {
      dispatchMove();
      return true;
    }
    multiState.guestMovePreviewTimer = window.setTimeout(() => {
      multiState.guestMovePreviewTimer = null;
      dispatchMove();
    }, MULTI_GUEST_MOVE_PREVIEW_DEBOUNCE_MS);
    return true;
  }

  function clearMultiGuestStateRecovery() {
    if (multiState.guestStateRecoveryTimer !== null) {
      window.clearTimeout(multiState.guestStateRecoveryTimer);
      multiState.guestStateRecoveryTimer = null;
    }
    multiState.awaitingGuestStateRecovery = false;
  }

  async function sendGuestRecoveryStateToMaster(targetClientId, {
    reason = MULTI_MASTER_RECOVERY_REASON,
    canvasId = '',
    force = false,
  } = {}) {
    if (!isMultiReplicaRole(multiState.role) || !multiState.connected || !multiState.channel) {
      return false;
    }
    const normalizedTargetClientId = typeof targetClientId === 'string' ? targetClientId.trim() : '';
    if (!normalizedTargetClientId || normalizedTargetClientId === multiState.clientId) {
      return false;
    }
    const now = Date.now();
    if (
      !force
      && multiState.guestRecoveryTargetClientId === normalizedTargetClientId
      && (now - Number(multiState.guestRecoveryPushAt || 0)) < MULTI_GUEST_RECOVERY_PUSH_THROTTLE_MS
    ) {
      return false;
    }
    const payload = buildGuestSessionStatePayload({
      targetClientId: normalizedTargetClientId,
      reason,
      canvasId,
    });
    const sent = await sendMultiBroadcast('guest-session-state', payload);
    if (sent) {
      multiState.guestRecoveryPushAt = now;
      multiState.guestRecoveryTargetClientId = normalizedTargetClientId;
    }
    return sent;
  }

  function maybeRequestGuestAssignmentSync() {
    if (!isMultiGuestMode() || !multiState.connected || !multiState.channel) {
      return;
    }
    if (!isMultiMasterCurrentlyOnline()) {
      return;
    }
    const now = Date.now();
    if ((now - Number(multiState.assignmentSyncRequestAt || 0)) < 1200) {
      return;
    }
    multiState.assignmentSyncRequestAt = now;
    sendMultiBroadcast('sync-request', {
      clientId: multiState.clientId,
      role: multiState.role,
      name: getLocalMultiParticipantName(),
      projectKey: multiState.projectKey,
      buildVersion: APP_BUILD_VERSION,
    }).catch(() => {});
  }

  function normalizeMultiBuildVersion(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim();
  }

  function isPiXiEEDrawDevCompatibleBuildVersion(remoteVersion) {
    const localVersion = normalizeMultiBuildVersion(APP_BUILD_VERSION);
    const normalizedRemoteVersion = normalizeMultiBuildVersion(remoteVersion);
    if (!localVersion || !normalizedRemoteVersion || localVersion === normalizedRemoteVersion) {
      return true;
    }
    const localIsDev = localVersion.includes('split') || /pixieedrawdev/i.test(localVersion);
    const remoteIsDev = normalizedRemoteVersion.includes('split') || /pixieedrawdev/i.test(normalizedRemoteVersion);
    const localIsProd = localVersion.includes('true-presplit') || (!localIsDev && !/dev/i.test(localVersion));
    const remoteIsProd = normalizedRemoteVersion.includes('true-presplit') || (!remoteIsDev && !/dev/i.test(normalizedRemoteVersion));
    return (localIsDev && remoteIsProd) || (localIsProd && remoteIsDev);
  }

  function handleMultiBuildVersionMismatch(remoteVersion, { source = '', clientId = '' } = {}) {
    const normalized = normalizeMultiBuildVersion(remoteVersion);
    if (!normalized || normalized === APP_BUILD_VERSION || isPiXiEEDrawDevCompatibleBuildVersion(normalized)) {
      return false;
    }
    const now = Date.now();
    if (
      normalized === multiState.lastVersionMismatch
      && (now - Number(multiState.versionMismatchAt || 0)) < 4000
    ) {
      return true;
    }
    multiState.lastVersionMismatch = normalized;
    multiState.versionMismatchAt = now;
    setMultiStatus(
      localizeText(
        `共有モード: バージョン不一致（相手 ${normalized} / この端末 ${APP_BUILD_VERSION}）。再読み込みしてください。`,
        `Collab mode: version mismatch (peer ${normalized} / this device ${APP_BUILD_VERSION}). Please reload.`
      ),
      'warn'
    );
    console.warn('Multi build version mismatch', {
      local: APP_BUILD_VERSION,
      remote: normalized,
      source,
      clientId,
    });
    if (isStandaloneAppDisplayMode()) {
      scheduleAppReload('multi-version-mismatch');
    }
    return true;
  }

  function recordMultiPeerBuildVersion(clientId, buildVersion, { source = '' } = {}) {
    const normalizedClientId = typeof clientId === 'string' ? clientId.trim() : '';
    const normalizedVersion = normalizeMultiBuildVersion(buildVersion);
    if (!normalizedClientId || !normalizedVersion) {
      return;
    }
    if (!(multiState.peerBuildVersions instanceof Map)) {
      multiState.peerBuildVersions = new Map();
    }
    multiState.peerBuildVersions.set(normalizedClientId, normalizedVersion);
    if (normalizedVersion !== APP_BUILD_VERSION && !isPiXiEEDrawDevCompatibleBuildVersion(normalizedVersion)) {
      handleMultiBuildVersionMismatch(normalizedVersion, { source, clientId: normalizedClientId });
    }
  }

  function requestMultiResync(reason = '') {
    if (!multiState.connected || multiState.connecting || !multiState.channel) {
      return false;
    }
    const now = Date.now();
    if ((now - Number(multiState.lastResyncAt || 0)) < MULTI_RESYNC_THROTTLE_MS) {
      return false;
    }
    multiState.lastResyncAt = now;
    clearPendingMultiSessionStateApply();
    if (isMultiMasterMode()) {
      scheduleMultiSessionStateBroadcast({ immediate: true });
      scheduleMultiPublicLobbyRoomSync({ immediate: true });
      return true;
    }
    sendMultiBroadcast('sync-request', {
      clientId: multiState.clientId,
      role: multiState.role,
      name: getLocalMultiParticipantName(),
      projectKey: multiState.projectKey,
      buildVersion: APP_BUILD_VERSION,
      reason: typeof reason === 'string' ? reason : '',
      sentAt: now,
    }).catch(() => {});
    return true;
  }

  function normalizeMultiSessionRevision(value, fallback = 0) {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized) || normalized < 0) {
      return fallback;
    }
    return normalized;
  }

  function getMultiSharedRoomConfigSnapshot() {
    return {
      maxGuests: normalizeMultiMaxGuests(multiState.maxGuests, MULTI_DEFAULT_GUEST_LIMIT),
      roomVisibility: normalizeMultiRoomVisibility(
        multiState.roomVisibility,
        MULTI_DEFAULT_ROOM_VISIBILITY
      ),
      joinPolicy: normalizeMultiJoinPolicy(
        multiState.joinPolicy,
        MULTI_DEFAULT_JOIN_POLICY
      ),
      participantFreeCellMove: normalizeMultiParticipantFreeCellMove(
        multiState.participantFreeCellMove,
        MULTI_DEFAULT_PARTICIPANT_FREE_CELL_MOVE
      ),
      exportPermission: normalizeMultiExportPermission(
        multiState.exportPermission,
        MULTI_DEFAULT_EXPORT_PERMISSION
      ),
    };
  }

  function applyMultiSharedRoomConfigFromPayload(payload = {}) {
    const next = {
      maxGuests: normalizeMultiMaxGuests(payload.maxGuests, multiState.maxGuests),
      roomVisibility: normalizeMultiRoomVisibility(
        payload.roomVisibility,
        multiState.roomVisibility
      ),
      joinPolicy: normalizeMultiJoinPolicy(
        payload.joinPolicy,
        multiState.joinPolicy
      ),
      participantFreeCellMove: normalizeMultiParticipantFreeCellMove(
        payload.participantFreeCellMove,
        multiState.participantFreeCellMove
      ),
      exportPermission: normalizeMultiExportPermission(
        payload.exportPermission,
        multiState.exportPermission
      ),
    };
    multiState.maxGuests = next.maxGuests;
    multiState.roomVisibility = next.roomVisibility;
    multiState.joinPolicy = next.joinPolicy;
    multiState.participantFreeCellMove = next.participantFreeCellMove;
    multiState.exportPermission = next.exportPermission;
    return next;
  }

  function shouldAcceptIncomingMultiSessionRevision(payload) {
    const receivedRevision = normalizeMultiSessionRevision(payload?.revision, 0);
    if (!receivedRevision) {
      return true;
    }
    const pendingRevision = normalizeMultiSessionRevision(multiState.pendingSessionStatePayload?.revision, 0);
    return receivedRevision > Math.max(multiState.revision, pendingRevision);
  }

  function buildMultiSessionStatePayload({ targetClientId = '' } = {}) {
    const snapshot = makeHistorySnapshot({
      includeUiState: false,
      includeSelection: false,
      clonePixelData: false,
    });
    const sharedConfig = getMultiSharedRoomConfigSnapshot();
    return {
      projectKey: multiState.projectKey,
      masterClientId: multiState.clientId,
      buildVersion: APP_BUILD_VERSION,
      ...sharedConfig,
      assignments: serializeMultiAssignments(),
      blockedClientIds: serializeMultiBlockedClientIds(),
      revision: (multiState.revision += 1),
      targetClientId: targetClientId || '',
      sentAt: Date.now(),
  document: serializeDocumentSnapshot(snapshot),
    };
  }

  function buildGuestSessionStatePayload({
    targetClientId = '',
    reason = '',
    canvasId = '',
    requestKey = '',
    requestToken = '',
    expectedCanvasId = '',
    expectedFrameId = '',
    expectedAnchorLayerId = '',
  } = {}) {
    const snapshot = makeHistorySnapshot({
      includeUiState: false,
      includeSelection: false,
      clonePixelData: false,
    });
    const sharedConfig = getMultiSharedRoomConfigSnapshot();
    return {
      projectKey: multiState.projectKey,
      clientId: multiState.clientId,
      buildVersion: APP_BUILD_VERSION,
      targetClientId: targetClientId || '',
      reason: typeof reason === 'string' ? reason : '',
      canvasId: normalizeMultiHistoryCanvasId(canvasId),
      requestKey: normalizeMultiLayerResyncRequestKey(requestKey),
      requestToken: typeof requestToken === 'string' ? requestToken.trim() : '',
      expectedCanvasId: normalizeMultiHistoryCanvasId(expectedCanvasId),
      expectedFrameId: typeof expectedFrameId === 'string' ? expectedFrameId.trim() : '',
      expectedAnchorLayerId: typeof expectedAnchorLayerId === 'string' ? expectedAnchorLayerId.trim() : '',
      sentAt: Date.now(),
      ...sharedConfig,
      assignments: serializeMultiAssignments(),
      blockedClientIds: serializeMultiBlockedClientIds(),
      document: serializeDocumentSnapshot(snapshot),
    };
  }

  async function broadcastMultiSessionState({ targetClientId = '' } = {}) {
    if (!getMultiRoleCapabilities().canBroadcastAuthoritativeState) {
      return false;
    }
    const payload = buildMultiSessionStatePayload({ targetClientId });
    return sendMultiBroadcast('session-state', payload);
  }

  function scheduleMultiSessionStateBroadcast({ targetClientId = '', immediate = false } = {}) {
    if (!getMultiRoleCapabilities().canBroadcastAuthoritativeState) {
      return;
    }
    if (isSharedProjectRealtimePrimaryActive(multiState.projectKey) && !targetClientId) {
      scheduleMultiPublicLobbyRoomSync({ immediate });
      return;
    }
    scheduleMultiPublicLobbyRoomSync({ immediate });
    if (targetClientId) {
      multiState.pendingBroadcastTargetClientId = targetClientId;
    }
    const flush = () => {
      multiState.broadcastTimer = null;
      const target = multiState.pendingBroadcastTargetClientId;
      multiState.pendingBroadcastTargetClientId = '';
      broadcastMultiSessionState({ targetClientId: target || '' });
    };
    if (immediate) {
      clearMultiBroadcastTimer();
      flush();
      return;
    }
    if (multiState.broadcastTimer !== null) {
      return;
    }
    multiState.broadcastTimer = window.setTimeout(flush, MULTI_SYNC_THROTTLE_MS);
  }

  function startMultiMasterRecoveryFlow(projectKey = multiState.projectKey) {
    if (!isMultiMasterMode()) {
      return;
    }
    clearMultiGuestStateRecovery();
    multiState.awaitingGuestStateRecovery = true;
    setMultiStatus(localizeText('共有モード: 参加者データを確認中…', 'Collab mode: checking participant state...'), 'info');
    sendMultiBroadcast('master-state-request', {
      clientId: multiState.clientId,
      projectKey: multiState.projectKey,
      targetClientId: '',
      reason: MULTI_MASTER_RECOVERY_REASON,
      sentAt: Date.now(),
    });
    multiState.guestStateRecoveryTimer = window.setTimeout(() => {
      if (!isMultiMasterMode() || !multiState.awaitingGuestStateRecovery) {
        return;
      }
      clearMultiGuestStateRecovery();
      scheduleMultiSessionStateBroadcast({ immediate: true });
      setMultiStatus(`共有モード: マスター (${projectKey})`, 'success');
    }, 1400);
  }

  function decodeLayerIndicesPayload(base64Value, expectedPixelCount) {
    if (typeof base64Value !== 'string' || !base64Value.length) {
      return null;
    }
    try {
      const bytes = decodeBase64(base64Value);
      if (bytes.length !== expectedPixelCount * 2) {
        return null;
      }
      const source = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const output = new Int16Array(source.length);
      output.set(source);
      return output;
    } catch (error) {
      return null;
    }
  }

  function decodeLayerDirectPayload(base64Value, expectedPixelCount) {
    if (typeof base64Value !== 'string' || !base64Value.length) {
      return null;
    }
    try {
      const bytes = decodeBase64(base64Value);
      if (bytes.length !== expectedPixelCount * 4) {
        return null;
      }
      const output = new Uint8ClampedArray(bytes.length);
      output.set(bytes);
      return output;
    } catch (error) {
      return null;
    }
  }

  function getMultiLayerPatchStreamKey(kind, clientId, canvasId, frameIndex, layerKey) {
    const safeKind = typeof kind === 'string' ? kind : 'unknown';
    const safeClientId = typeof clientId === 'string' ? clientId : '';
    const safeCanvasId = typeof canvasId === 'string' ? canvasId : '';
    const safeFrameIndex = Number.isFinite(frameIndex) ? Math.max(0, Math.round(frameIndex)) : 0;
    const safeLayerKey = typeof layerKey === 'string' ? layerKey : '';
    return `${safeKind}:${safeClientId}:${safeCanvasId}:${safeFrameIndex}:${safeLayerKey}`;
  }

  function normalizeMultiPatchSequence(value, fallback = 0) {
    const normalized = Math.round(Number(value));
    if (!Number.isFinite(normalized) || normalized <= 0) {
      return fallback;
    }
    return normalized;
  }

  function normalizeMultiLayerResyncRequestKey(value, fallback = '') {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (normalized) {
      return normalized;
    }
    return typeof fallback === 'string' ? fallback.trim() : '';
  }

  function createMultiLayerResyncRequestToken() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `resync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getNextMultiLayerPatchSequence(streamKey) {
    const current = multiState.layerPatchSendSequences instanceof Map
      ? normalizeMultiPatchSequence(multiState.layerPatchSendSequences.get(streamKey), 0)
      : 0;
    return current + 1;
  }

  function commitMultiLayerPatchSequence(streamKey, sequence) {
    const normalizedSequence = normalizeMultiPatchSequence(sequence, 0);
    if (!normalizedSequence || !(multiState.layerPatchSendSequences instanceof Map)) {
      return;
    }
    multiState.layerPatchSendSequences.set(streamKey, normalizedSequence);
  }

  function inspectIncomingMultiLayerPatchSequence(streamKey, payload) {
    const sequence = normalizeMultiPatchSequence(payload?.sequence, 0);
    if (!sequence) {
      return { action: 'apply', sequence: 0 };
    }
    const lastSequence = multiState.layerPatchReceiveSequences instanceof Map
      ? normalizeMultiPatchSequence(multiState.layerPatchReceiveSequences.get(streamKey), 0)
      : 0;
    const mode = payload?.mode === 'diff' ? 'diff' : 'full';
    if (sequence <= lastSequence) {
      return { action: 'stale', sequence, lastSequence };
    }
    if (mode === 'full') {
      return { action: 'apply', sequence, lastSequence };
    }
    if (!lastSequence) {
      return sequence === 1
        ? { action: 'apply', sequence, lastSequence }
        : { action: 'resync', sequence, lastSequence };
    }
    if (sequence === (lastSequence + 1)) {
      return { action: 'apply', sequence, lastSequence };
    }
    return { action: 'resync', sequence, lastSequence };
  }

  function markIncomingMultiLayerPatchSequenceApplied(streamKey, sequence) {
    const normalizedSequence = normalizeMultiPatchSequence(sequence, 0);
    if (!normalizedSequence || !(multiState.layerPatchReceiveSequences instanceof Map)) {
      return;
    }
    multiState.layerPatchReceiveSequences.set(streamKey, normalizedSequence);
    if (multiState.layerPatchResyncRequestAt instanceof Map) {
      multiState.layerPatchResyncRequestAt.delete(streamKey);
    }
  }

  function consumePendingMultiLayerResyncRequest(payload, senderClientId) {
    const requestKey = normalizeMultiLayerResyncRequestKey(payload?.requestKey, senderClientId);
    const pendingResync = multiState.layerPatchResyncRequests instanceof Map
      ? (multiState.layerPatchResyncRequests.get(requestKey) || null)
      : null;
    const requestToken = typeof payload?.requestToken === 'string' ? payload.requestToken.trim() : '';
    if (!pendingResync || pendingResync.clientId !== senderClientId || !requestToken || requestToken !== pendingResync.requestToken) {
      return null;
    }
    multiState.layerPatchResyncRequests.delete(requestKey);
    return pendingResync;
  }

  async function requestTargetedGuestSessionState(senderClientId, streamKey = '', canvasId = '') {
    if (!isMultiMasterMode()) {
      return false;
    }
    const normalizedClientId = typeof senderClientId === 'string' ? senderClientId.trim() : '';
    if (!normalizedClientId || normalizedClientId === multiState.clientId) {
      return false;
    }
    const requestKey = normalizeMultiLayerResyncRequestKey(streamKey, normalizedClientId);
    const now = Date.now();
    if (multiState.layerPatchResyncRequestAt instanceof Map) {
      const previousAt = Number(multiState.layerPatchResyncRequestAt.get(requestKey) || 0);
      if ((now - previousAt) < 600) {
        return false;
      }
      multiState.layerPatchResyncRequestAt.set(requestKey, now);
    }
    const assignment = getMultiAssignment(normalizedClientId);
    const fallbackCanvas = getAssignmentCanvasDocument(assignment, getActiveProjectCanvasDocument());
    const targetCanvas = getProjectCanvasDocumentById(
      normalizeMultiHistoryCanvasId(canvasId)
    ) || fallbackCanvas || null;
    const expectedFrameIndex = assignment && targetCanvas
      ? resolveAssignedFrameIndexForCanvas(assignment, targetCanvas)
      : -1;
    const requestToken = createMultiLayerResyncRequestToken();
    if (multiState.layerPatchResyncRequests instanceof Map) {
      multiState.layerPatchResyncRequests.set(requestKey, {
        requestKey,
        requestToken,
        clientId: normalizedClientId,
        streamKey: typeof streamKey === 'string' ? streamKey : '',
        canvasId: targetCanvas?.id || normalizeMultiHistoryCanvasId(canvasId),
        frameId: expectedFrameIndex >= 0 ? (targetCanvas?.frames?.[expectedFrameIndex]?.id || '') : (assignment?.frameId || ''),
        anchorLayerId: typeof assignment?.anchorLayerId === 'string' ? assignment.anchorLayerId : '',
        sentAt: now,
      });
    }
    return sendMultiBroadcast('master-state-request', {
      clientId: multiState.clientId,
      projectKey: multiState.projectKey,
      targetClientId: normalizedClientId,
      canvasId: targetCanvas?.id || normalizeMultiHistoryCanvasId(canvasId),
      requestKey,
      requestToken,
      expectedCanvasId: targetCanvas?.id || '',
      expectedFrameId: expectedFrameIndex >= 0 ? (targetCanvas?.frames?.[expectedFrameIndex]?.id || '') : '',
      expectedAnchorLayerId: typeof assignment?.anchorLayerId === 'string' ? assignment.anchorLayerId : '',
      sentAt: now,
      reason: 'layer-resync',
    });
  }

  function captureLayerPatchSnapshot(layer, pixelCount) {
    if (isSimulationLayer(layer)) {
      return {
        type: SIM_LAYER_TYPE,
        elementMap: new Uint8Array(layer.elementMap),
        sourceColorMap: new Uint8ClampedArray(layer.sourceColorMap),
        velXMap: new Int8Array(layer.velXMap),
        velYMap: new Int8Array(layer.velYMap),
        lifeMap: new Uint8Array(layer.lifeMap),
        tempMap: new Uint16Array(layer.tempMap),
        lightMap: new Uint8Array(layer.lightMap),
        depthMap: new Uint8Array(layer.depthMap),
        airMap: new Uint8Array(layer.airMap),
        auxMap: new Uint8Array(layer.auxMap),
        activeMap: new Uint8Array(layer.activeMap),
      };
    }
    if (!layer || !(layer.indices instanceof Int16Array)) {
      return null;
    }
    const size = Math.max(0, Math.floor(Number(pixelCount) || 0));
    if (!size || layer.indices.length !== size) {
      return null;
    }
    const hasDirect = layer.direct instanceof Uint8ClampedArray
      && layer.direct.length === size * 4;
    const snapshot = {
      indices: new Int16Array(size),
      direct: null,
      hasDirect,
    };
    snapshot.indices.set(layer.indices);
    if (hasDirect) {
      snapshot.direct = new Uint8ClampedArray(size * 4);
      snapshot.direct.set(layer.direct);
    }
    return snapshot;
  }

  function buildLayerDiffPayload(layer, snapshot, pixelCount) {
    if (isSimulationLayer(layer)) {
      return {
        mode: 'full',
        type: SIM_LAYER_TYPE,
        elementMap: encodeTypedArray(layer.elementMap),
        sourceColorMap: encodeTypedArray(layer.sourceColorMap),
        velXMap: encodeTypedArray(new Uint8Array(layer.velXMap.buffer, layer.velXMap.byteOffset, layer.velXMap.byteLength)),
        velYMap: encodeTypedArray(new Uint8Array(layer.velYMap.buffer, layer.velYMap.byteOffset, layer.velYMap.byteLength)),
        lifeMap: encodeTypedArray(layer.lifeMap),
        tempMap: encodeTypedArray(new Uint8Array(layer.tempMap.buffer, layer.tempMap.byteOffset, layer.tempMap.byteLength)),
        lightMap: encodeTypedArray(layer.lightMap),
        depthMap: encodeTypedArray(layer.depthMap),
        airMap: encodeTypedArray(layer.airMap),
        auxMap: encodeTypedArray(layer.auxMap),
        activeMap: encodeTypedArray(layer.activeMap),
        settings: JSON.stringify(normalizeSimulationSettings(layer.settings)),
        elementStyle: JSON.stringify(layer.elementStyle || {}),
      };
    }
    const size = Math.max(0, Math.floor(Number(pixelCount) || 0));
    if (!size || !(layer?.indices instanceof Int16Array) || layer.indices.length !== size) {
      return null;
    }
    const hasDirect = layer.direct instanceof Uint8ClampedArray && layer.direct.length === size * 4;
    if (!snapshot || !(snapshot.indices instanceof Int16Array) || snapshot.indices.length !== size) {
      return {
        mode: 'full',
        hasDirect,
        indices: encodeTypedArray(layer.indices),
        direct: hasDirect ? encodeTypedArray(layer.direct) : '',
      };
    }
    if (Boolean(snapshot.hasDirect) !== hasDirect) {
      return {
        mode: 'full',
        hasDirect,
        indices: encodeTypedArray(layer.indices),
        direct: hasDirect ? encodeTypedArray(layer.direct) : '',
      };
    }

    const changedPositions = [];
    const changedIndices = [];
    const changedDirect = hasDirect ? [] : null;
    const currentDirect = hasDirect ? layer.direct : null;
    const previousDirect = hasDirect ? snapshot.direct : null;

    for (let i = 0; i < size; i += 1) {
      let changed = layer.indices[i] !== snapshot.indices[i];
      if (!changed && hasDirect && previousDirect) {
        const base = i * 4;
        if (
          currentDirect[base] !== previousDirect[base]
          || currentDirect[base + 1] !== previousDirect[base + 1]
          || currentDirect[base + 2] !== previousDirect[base + 2]
          || currentDirect[base + 3] !== previousDirect[base + 3]
        ) {
          changed = true;
        }
      }
      if (!changed) {
        continue;
      }
      changedPositions.push(i);
      changedIndices.push(layer.indices[i]);
      if (hasDirect && changedDirect) {
        const base = i * 4;
        changedDirect.push(
          currentDirect[base],
          currentDirect[base + 1],
          currentDirect[base + 2],
          currentDirect[base + 3]
        );
      }
    }

    if (!changedPositions.length) {
      return null;
    }

    const changedRatio = changedPositions.length / size;
    if (changedRatio >= MULTI_LAYER_PATCH_FULL_RATIO) {
      return {
        mode: 'full',
        hasDirect,
        indices: encodeTypedArray(layer.indices),
        direct: hasDirect ? encodeTypedArray(layer.direct) : '',
      };
    }

    const positionArray = new Uint32Array(changedPositions.length);
    const indexArray = new Int16Array(changedIndices.length);
    for (let i = 0; i < changedPositions.length; i += 1) {
      positionArray[i] = changedPositions[i];
      indexArray[i] = changedIndices[i];
    }
    const payload = {
      mode: 'diff',
      hasDirect,
      changed: encodeTypedArray(positionArray),
      indices: encodeTypedArray(indexArray),
      direct: '',
    };
    if (hasDirect && changedDirect) {
      const directArray = new Uint8Array(changedDirect.length);
      for (let i = 0; i < changedDirect.length; i += 1) {
        directArray[i] = changedDirect[i];
      }
      payload.direct = encodeTypedArray(directArray);
    }
    return payload;
  }

  function decodeLayerDiffPositionsPayload(base64Value) {
    if (typeof base64Value !== 'string' || !base64Value.length) {
      return null;
    }
    try {
      const bytes = decodeBase64(base64Value);
      if (!bytes.length || bytes.length % 4 !== 0) {
        return null;
      }
      const source = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      const output = new Uint32Array(source.length);
      output.set(source);
      return output;
    } catch (error) {
      return null;
    }
  }

  function decodeLayerDiffIndicesPayload(base64Value, expectedLength) {
    if (typeof base64Value !== 'string' || !base64Value.length) {
      return null;
    }
    try {
      const bytes = decodeBase64(base64Value);
      if (bytes.length !== expectedLength * 2) {
        return null;
      }
      const source = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
      const output = new Int16Array(source.length);
      output.set(source);
      return output;
    } catch (error) {
      return null;
    }
  }

  function decodeLayerDiffDirectPayload(base64Value, expectedLength) {
    if (typeof base64Value !== 'string' || !base64Value.length) {
      return null;
    }
    try {
      const bytes = decodeBase64(base64Value);
      if (bytes.length !== expectedLength * 4) {
        return null;
      }
      const output = new Uint8Array(bytes.length);
      output.set(bytes);
      return output;
    } catch (error) {
      return null;
    }
  }

  function applyLayerPatchPayloadToLayer(layer, payload, pixelCount, { width = state.width, height = state.height } = {}) {
    if (!layer || typeof payload !== 'object' || !payload) {
      return null;
    }
    if (payload.type === SIM_LAYER_TYPE && isSimulationLayer(layer)) {
      layer.elementMap = decodeUint8Data(payload.elementMap, { clamped: false }) || layer.elementMap;
      layer.sourceColorMap = decodeUint8Data(payload.sourceColorMap, { clamped: true }) || layer.sourceColorMap;
      layer.velXMap = new Int8Array((decodeUint8Data(payload.velXMap, { clamped: false }) || new Uint8Array(layer.velXMap.byteLength)).buffer.slice(0));
      layer.velYMap = new Int8Array((decodeUint8Data(payload.velYMap, { clamped: false }) || new Uint8Array(layer.velYMap.byteLength)).buffer.slice(0));
      layer.lifeMap = decodeUint8Data(payload.lifeMap, { clamped: false }) || layer.lifeMap;
      layer.tempMap = new Uint16Array((decodeUint8Data(payload.tempMap, { clamped: false }) || new Uint8Array(layer.tempMap.byteLength)).buffer.slice(0));
      layer.lightMap = decodeUint8Data(payload.lightMap, { clamped: false }) || layer.lightMap;
      layer.depthMap = decodeUint8Data(payload.depthMap, { clamped: false }) || layer.depthMap;
      layer.airMap = decodeUint8Data(payload.airMap, { clamped: false }) || layer.airMap;
      layer.auxMap = decodeUint8Data(payload.auxMap, { clamped: false }) || layer.auxMap;
      layer.activeMap = decodeUint8Data(payload.activeMap, { clamped: false }) || layer.activeMap;
      layer.settings = normalizeSimulationSettings(typeof payload.settings === 'string' ? JSON.parse(payload.settings) : payload.settings);
      layer.elementStyle = typeof payload.elementStyle === 'string' ? JSON.parse(payload.elementStyle) : (payload.elementStyle || layer.elementStyle);
      return { full: true, dirtyRect: null };
    }
    const size = Math.max(0, Math.floor(Number(pixelCount) || 0));
    if (!size) {
      return null;
    }
    const mode = payload.mode === 'diff' ? 'diff' : 'full';
    const hasDirect = typeof payload.hasDirect === 'boolean'
      ? payload.hasDirect
      : (typeof payload.direct === 'string' && payload.direct.length > 0);

    if (mode === 'full') {
      const decodedIndices = decodeLayerIndicesPayload(payload.indices, size);
      if (!(decodedIndices instanceof Int16Array) || decodedIndices.length !== size) {
        return null;
      }
      layer.indices = decodedIndices;
      if (hasDirect) {
        const decodedDirect = decodeLayerDirectPayload(payload.direct, size);
        if (!(decodedDirect instanceof Uint8ClampedArray) || decodedDirect.length !== size * 4) {
          return null;
        }
        layer.direct = decodedDirect;
      } else {
        layer.direct = null;
      }
      return { full: true, dirtyRect: null };
    }

    const changed = decodeLayerDiffPositionsPayload(payload.changed);
    if (!(changed instanceof Uint32Array) || !changed.length) {
      return null;
    }
    const nextIndices = decodeLayerDiffIndicesPayload(payload.indices, changed.length);
    if (!(nextIndices instanceof Int16Array) || nextIndices.length !== changed.length) {
      return null;
    }
    if (!(layer.indices instanceof Int16Array) || layer.indices.length !== size) {
      layer.indices = new Int16Array(size).fill(-1);
    }
    let targetDirect = null;
    let nextDirect = null;
    if (hasDirect) {
      nextDirect = decodeLayerDiffDirectPayload(payload.direct, changed.length);
      if (!(nextDirect instanceof Uint8Array) || nextDirect.length !== changed.length * 4) {
        return null;
      }
      targetDirect = ensureLayerDirect(layer, width, height);
    } else {
      layer.direct = null;
    }

    const canvasWidth = Math.max(1, Math.floor(Number(width) || 0));
    let minX = canvasWidth;
    let minY = Math.max(1, Math.floor(Number(height) || 0));
    let maxX = -1;
    let maxY = -1;
    for (let i = 0; i < changed.length; i += 1) {
      const index = changed[i];
      if (!Number.isFinite(index) || index < 0 || index >= size) {
        return null;
      }
      const pixelIndex = Math.floor(index);
      layer.indices[pixelIndex] = nextIndices[i];
      if (targetDirect && nextDirect) {
        const toBase = pixelIndex * 4;
        const fromBase = i * 4;
        targetDirect[toBase] = nextDirect[fromBase];
        targetDirect[toBase + 1] = nextDirect[fromBase + 1];
        targetDirect[toBase + 2] = nextDirect[fromBase + 2];
        targetDirect[toBase + 3] = nextDirect[fromBase + 3];
      }
      const px = pixelIndex % canvasWidth;
      const py = Math.floor(pixelIndex / canvasWidth);
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
    }
    return {
      full: false,
      dirtyRect: maxX >= minX && maxY >= minY
        ? { x0: minX, y0: minY, x1: maxX, y1: maxY }
        : null,
    };
  }

  function clearPendingMultiSessionStateApply() {
    if (multiState.pendingSessionStateTimer !== null) {
      window.clearTimeout(multiState.pendingSessionStateTimer);
      multiState.pendingSessionStateTimer = null;
    }
    multiState.pendingSessionStatePayload = null;
  }

  function shouldDeferMultiSessionStateApply() {
    if (pointerState.active) {
      return true;
    }
    if (history.pending) {
      return true;
    }
    if (
      isMultiGuestMode()
      && (
        multiState.guestLayerPatchQueued
        || multiState.guestLayerPatchInFlight
      )
    ) {
      return true;
    }
    return false;
  }

  function schedulePendingMultiSessionStateApply() {
    if (multiState.pendingSessionStateTimer !== null) {
      return;
    }
    multiState.pendingSessionStateTimer = window.setTimeout(() => {
      multiState.pendingSessionStateTimer = null;
      if (multiState.role !== 'guest' && multiState.role !== 'spectator') {
        clearPendingMultiSessionStateApply();
        return;
      }
      const payload = multiState.pendingSessionStatePayload;
      if (!payload) {
        return;
      }
      if (shouldDeferMultiSessionStateApply()) {
        schedulePendingMultiSessionStateApply();
        return;
      }
      multiState.pendingSessionStatePayload = null;
      applyMultiSessionStatePayload(payload);
    }, 80);
  }

  function captureLocalTimelineSelectionSnapshot() {
    const activeCanvas = getActiveProjectCanvasDocument();
    const frames = Array.isArray(activeCanvas?.frames) ? activeCanvas.frames : (Array.isArray(state.frames) ? state.frames : []);
    const frameIndex = clamp(
      Math.round(Number(state.activeFrame ?? activeCanvas?.activeFrame) || 0),
      0,
      Math.max(0, frames.length - 1)
    );
    return {
      canvasId: activeCanvas?.id || '',
      canvasIndex: getActiveProjectCanvasIndex(),
      frameIndex,
      frameId: typeof frames[frameIndex]?.id === 'string' ? frames[frameIndex].id : '',
      layerId: typeof state.activeLayer === 'string'
        ? state.activeLayer
        : (typeof activeCanvas?.activeLayer === 'string' ? activeCanvas.activeLayer : ''),
    };
  }

  function restoreLocalTimelineSelectionSnapshot(selectionSnapshot, { preserveCanvas = true } = {}) {
    if (!selectionSnapshot || typeof selectionSnapshot !== 'object') {
      return false;
    }
    const canvases = getProjectCanvasDocuments();
    if (!canvases.length) {
      return false;
    }
    let targetCanvas = null;
    if (preserveCanvas && selectionSnapshot.canvasId) {
      targetCanvas = getProjectCanvasDocumentById(selectionSnapshot.canvasId);
    }
    if (!targetCanvas && preserveCanvas) {
      targetCanvas = canvases[
        clamp(Math.round(Number(selectionSnapshot.canvasIndex) || 0), 0, Math.max(0, canvases.length - 1))
      ] || null;
    }
    targetCanvas = targetCanvas || getActiveProjectCanvasDocument() || canvases[0] || null;
    if (!targetCanvas || !Array.isArray(targetCanvas.frames) || !targetCanvas.frames.length) {
      return false;
    }
    if (preserveCanvas && targetCanvas.id) {
      projectCanvasStore.activeCanvasId = targetCanvas.id;
      const activeCanvasIndex = getActiveProjectCanvasIndex();
      localViewportCanvasState = normalizeLocalViewportCanvasState(
        {
          ...localViewportCanvasState,
          count: Math.max(0, canvases.length - 1),
          selectedKind: activeCanvasIndex === 0 ? 'main' : 'local',
          selectedIndex: activeCanvasIndex > 0 ? activeCanvasIndex - 1 : -1,
        },
        localViewportCanvasState
      );
    }
    const frames = targetCanvas.frames;
    const frameIndexById = selectionSnapshot.frameId
      ? frames.findIndex(frame => frame?.id === selectionSnapshot.frameId)
      : -1;
    const frameIndex = frameIndexById >= 0
      ? frameIndexById
      : clamp(Math.round(Number(selectionSnapshot.frameIndex) || 0), 0, Math.max(0, frames.length - 1));
    const targetFrame = frames[frameIndex] || frames[0] || null;
    if (!targetFrame || !Array.isArray(targetFrame.layers) || !targetFrame.layers.length) {
      return false;
    }
    const preferredLayerId = typeof selectionSnapshot.layerId === 'string' ? selectionSnapshot.layerId : '';
    const layerId = targetFrame.layers.some(layer => layer?.id === preferredLayerId)
      ? preferredLayerId
      : (targetFrame.layers[targetFrame.layers.length - 1]?.id || targetFrame.layers[0]?.id || null);
    targetCanvas.activeFrame = frameIndex;
    targetCanvas.activeLayer = layerId;
    state.activeFrame = frameIndex;
    state.activeLayer = layerId;
    return true;
  }

  function applyMultiAuthoritativeDocument(documentPayload) {
    if (!documentPayload || typeof documentPayload !== 'object') {
      return false;
    }
    let snapshot;
    try {
      snapshot = deserializeDocumentPayload(documentPayload);
    } catch (error) {
      console.warn('Failed to deserialize shared document payload', error);
      return false;
    }
    const preserved = {
      scale: state.scale,
      pan: { x: state.pan.x, y: state.pan.y },
      tool: state.tool,
      activeToolGroup: state.activeToolGroup,
      lastGroupTool: { ...(state.lastGroupTool || DEFAULT_GROUP_TOOL) },
      activeLeftTab: state.activeLeftTab,
      activeRightTab: state.activeRightTab,
      activeFrame: state.activeFrame,
      timelineSelection: captureLocalTimelineSelectionSnapshot(),
      colorMode: normalizeColorMode(state.colorMode, COLOR_MODE_INDEX),
      activeRgb: normalizeColorValue(state.activeRgb),
    };
    const preserveLocalPalette = isMultiPaletteIsolationEnabled() && multiState.paletteSeededFromShared;
    const localPaletteSnapshot = preserveLocalPalette && Array.isArray(state.palette)
      ? state.palette.map(color => normalizeColorValue(color))
      : null;
    const localPaletteIndex = state.activePaletteIndex;
    const localSecondaryPaletteIndex = state.secondaryPaletteIndex;
    // Keep viewport local in multi mode. Zoom/pan should never be synced from remote payload.
    snapshot.scale = normalizeZoomScale(preserved.scale, snapshot.scale);
    snapshot.pan = { x: preserved.pan.x, y: preserved.pan.y };
    const prevFrameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    multiState.applyRemoteInProgress = true;
    try {
      applyHistorySnapshot(snapshot);
      if (preserveLocalPalette) {
        remapDocumentIndexedPixelsToDirect();
      }
      if (Array.isArray(localPaletteSnapshot) && localPaletteSnapshot.length) {
        state.palette = localPaletteSnapshot.map(color => normalizeColorValue(color));
        state.activePaletteIndex = normalizePaletteIndex(localPaletteIndex, state.activePaletteIndex);
        state.secondaryPaletteIndex = normalizePaletteIndex(localSecondaryPaletteIndex, state.activePaletteIndex);
        syncCurrentPalettePresetFromPalette(state.palette, { syncControl: true });
      } else if (isMultiPaletteIsolationEnabled()) {
        multiState.paletteSeededFromShared = true;
      }
      history.past = [];
      history.future = [];
      history.pending = null;
      clearMultiHistory();
      updateHistoryButtons();
      if (isMultiGuestMode() || isMultiSpectatorMode()) {
        state.scale = normalizeZoomScale(preserved.scale, state.scale);
        rememberViewportZoomRatioFromScale(state.scale);
        state.pan = { x: preserved.pan.x, y: preserved.pan.y };
        state.tool = normalizeToolId(preserved.tool, state.tool);
        state.activeToolGroup = preserved.activeToolGroup || (TOOL_TO_GROUP[state.tool] || state.activeToolGroup);
        state.lastGroupTool = { ...DEFAULT_GROUP_TOOL, ...(preserved.lastGroupTool || {}) };
        state.activeLeftTab = LEFT_TAB_KEYS.includes(preserved.activeLeftTab) ? preserved.activeLeftTab : state.activeLeftTab;
        state.activeRightTab = RIGHT_TAB_KEYS.includes(preserved.activeRightTab) ? preserved.activeRightTab : state.activeRightTab;
        state.colorMode = normalizeColorMode(preserved.colorMode, state.colorMode);
        state.activeRgb = normalizeColorValue(preserved.activeRgb);
        restoreLocalTimelineSelectionSnapshot(preserved.timelineSelection, { preserveCanvas: true });
        // If master added frames, allow guests to freely navigate frames for their assigned layer.
        if (isMultiGuestMode()) {
          const hadFramesAdded = Array.isArray(state.frames) && state.frames.length > prevFrameCount;
          enforceGuestAssignedLayerSelection({ announce: false, enforceFrame: !hadFramesAdded, enforceLayer: true });
        }
        syncControlsWithState();
        renderFrameList();
        renderLayerList();
        applyViewportTransform();
        requestRender();
        requestOverlayRender();
      }
      if (Array.isArray(localPaletteSnapshot) && localPaletteSnapshot.length) {
        renderPalette();
        syncPaletteInputs();
      }
      markRemoteMultiStateDirty({ clearLayerPatchSnapshots: true });
    } finally {
      multiState.applyRemoteInProgress = false;
    }
    return true;
  }

  // Apply a history snapshot only to the cells that clientId can currently edit.
  function applyHistorySnapshotForClient(snapshot, clientId, { preserveView = false, canvasId = '', restoreSelection = false } = {}) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    if (!clientId) return false;
    const resolvedCanvasId = normalizeMultiHistoryCanvasId(
      canvasId
      || (typeof snapshot.activeCanvasId === 'string' ? snapshot.activeCanvasId : '')
      || getActiveProjectCanvasDocument()?.id
      || ''
    );
    const targetCanvas = getProjectCanvasDocumentById(resolvedCanvasId) || (!resolvedCanvasId ? getActiveProjectCanvasDocument() : null);
    if (!targetCanvas) return false;
    const assigned = getAssignedCellForClientOnCanvas(clientId, targetCanvas);
    if (!assigned) return false;
    const frameIndex = clamp(Math.round(Number(assigned.frameIndex) || 0), 0, Math.max(0, targetCanvas.frames.length - 1));
    const trackIndex = clamp(Math.round(Number(assigned.trackIndex) || 0), 0, Math.max(0, (targetCanvas.frames[frameIndex]?.layers?.length || 0) - 1));
    const snapshotCanvas = Array.isArray(snapshot.canvases) && snapshot.canvases.length
      ? (snapshot.canvases.find(canvas => canvas?.id === resolvedCanvasId) || null)
      : snapshot;
    if (!snapshotCanvas || !Array.isArray(snapshotCanvas.frames)) return false;
    const srcFrame = snapshotCanvas.frames[frameIndex] || null;
    if (!srcFrame || !Array.isArray(srcFrame.layers)) return false;
    const srcLayer = srcFrame.layers[trackIndex];
    if (!srcLayer) return false;
    const targetFrame = targetCanvas.frames[frameIndex];
    if (!targetFrame || !Array.isArray(targetFrame.layers)) return false;
    const targetLayer = targetFrame.layers[trackIndex];
    if (!targetLayer) return false;
    try {
      if (srcLayer.indices instanceof Int16Array || Array.isArray(srcLayer.indices)) {
        targetLayer.indices = new Int16Array(srcLayer.indices);
      }
      if (srcLayer.direct instanceof Uint8ClampedArray || Array.isArray(srcLayer.direct)) {
        targetLayer.direct = new Uint8ClampedArray(srcLayer.direct);
      } else {
        targetLayer.direct = null;
      }
      if (restoreSelection && targetCanvas.id === (getActiveProjectCanvasDocument()?.id || '')) {
        if (typeof snapshotCanvas.activeFrame === 'number') {
          targetCanvas.activeFrame = clamp(Number(snapshotCanvas.activeFrame) || 0, 0, Math.max(0, targetCanvas.frames.length - 1));
        }
        if (typeof snapshotCanvas.activeLayer === 'string') {
          targetCanvas.activeLayer = snapshotCanvas.activeLayer;
        }
        state.selectionMask = snapshotCanvas.selectionMask ? new Uint8Array(snapshotCanvas.selectionMask) : null;
        state.selectionContentMask = snapshotCanvas.selectionContentMask ? new Uint8Array(snapshotCanvas.selectionContentMask) : null;
        state.selectionBounds = snapshotCanvas.selectionBounds ? { ...snapshotCanvas.selectionBounds } : null;
        state.pendingPasteMoveState = null;
        pointerState.selectionMove = null;
        selectionTransformUi.interaction = null;
        hideSelectionTransformMenu();
        updateCanvasControlButtons();
        syncControlsWithState();
        renderFrameList();
        renderLayerList();
      }
      markRemoteMultiStateDirty();
      requestRender();
      requestOverlayRender();
      if (!preserveView && targetCanvas.id === (getActiveProjectCanvasDocument()?.id || '')) {
        if (typeof snapshotCanvas.activeFrame === 'number') {
          targetCanvas.activeFrame = clamp(Number(snapshotCanvas.activeFrame) || 0, 0, Math.max(0, targetCanvas.frames.length - 1));
        }
        if (typeof snapshotCanvas.activeLayer === 'string') {
          targetCanvas.activeLayer = snapshotCanvas.activeLayer;
        }
        syncControlsWithState();
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyHistorySnapshotForSharedLocalCell(snapshot, { canvasId = '', restoreSelection = false } = {}) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const resolvedCanvasId = normalizeMultiHistoryCanvasId(
      canvasId
      || (typeof snapshot.activeCanvasId === 'string' ? snapshot.activeCanvasId : '')
      || getActiveProjectCanvasDocument()?.id
      || ''
    );
    const targetCanvas = getProjectCanvasDocumentById(resolvedCanvasId) || getActiveProjectCanvasDocument();
    if (!targetCanvas || !Array.isArray(targetCanvas.frames) || !targetCanvas.frames.length) return false;
    const snapshotCanvas = Array.isArray(snapshot.canvases) && snapshot.canvases.length
      ? (snapshot.canvases.find(canvas => canvas?.id === resolvedCanvasId) || null)
      : snapshot;
    if (!snapshotCanvas || !Array.isArray(snapshotCanvas.frames) || !snapshotCanvas.frames.length) return false;
    const frameIndex = clamp(
      Math.round(Number(snapshotCanvas.activeFrame ?? snapshot.activeFrame ?? state.activeFrame) || 0),
      0,
      Math.max(0, targetCanvas.frames.length - 1)
    );
    const srcFrame = snapshotCanvas.frames[frameIndex] || null;
    const targetFrame = targetCanvas.frames[frameIndex] || null;
    if (!srcFrame || !targetFrame || !Array.isArray(srcFrame.layers) || !Array.isArray(targetFrame.layers)) return false;
    const requestedLayerId = typeof snapshotCanvas.activeLayer === 'string'
      ? snapshotCanvas.activeLayer
      : (typeof snapshot.activeLayer === 'string' ? snapshot.activeLayer : state.activeLayer);
    const srcLayerIndex = srcFrame.layers.findIndex(layer => layer?.id === requestedLayerId);
    const targetLayerIndexById = targetFrame.layers.findIndex(layer => layer?.id === requestedLayerId);
    const layerIndex = targetLayerIndexById >= 0
      ? targetLayerIndexById
      : clamp(srcLayerIndex, 0, Math.max(0, targetFrame.layers.length - 1));
    const srcLayer = srcFrame.layers[srcLayerIndex >= 0 ? srcLayerIndex : layerIndex] || null;
    const targetLayer = targetFrame.layers[layerIndex] || null;
    if (!srcLayer || !targetLayer) return false;
    try {
      if (srcLayer.indices instanceof Int16Array || Array.isArray(srcLayer.indices)) {
        targetLayer.indices = new Int16Array(srcLayer.indices);
      }
      if (srcLayer.direct instanceof Uint8ClampedArray || Array.isArray(srcLayer.direct)) {
        targetLayer.direct = new Uint8ClampedArray(srcLayer.direct);
      } else {
        targetLayer.direct = null;
      }
      targetCanvas.activeFrame = frameIndex;
      targetCanvas.activeLayer = targetLayer.id;
      if (targetCanvas.id === (getActiveProjectCanvasDocument()?.id || '')) {
        state.activeFrame = frameIndex;
        state.activeLayer = targetLayer.id;
        if (restoreSelection) {
          state.selectionMask = snapshotCanvas.selectionMask ? new Uint8Array(snapshotCanvas.selectionMask) : null;
          state.selectionContentMask = snapshotCanvas.selectionContentMask ? new Uint8Array(snapshotCanvas.selectionContentMask) : null;
          state.selectionBounds = snapshotCanvas.selectionBounds ? { ...snapshotCanvas.selectionBounds } : null;
          state.pendingPasteMoveState = null;
          pointerState.selectionMove = null;
          selectionTransformUi.interaction = null;
          hideSelectionTransformMenu();
        }
      }
      markRemoteMultiStateDirty();
      markCanvasDirty();
      syncControlsWithState();
      renderFrameList();
      renderLayerList();
      requestRender();
      requestOverlayRender();
      return true;
    } catch (error) {
      return false;
    }
  }

  function applyMultiSessionStatePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }
    const receivedRevision = normalizeMultiSessionRevision(payload.revision, 0);
    if (receivedRevision && receivedRevision <= multiState.revision) {
      return false;
    }
    applyMultiSharedRoomConfigFromPayload(payload);
    if (!isMultiGuestMode() || !canCurrentGuestFreelyMoveAssignedCell()) {
      clearMultiGuestMovePreview();
    }
    if (isMultiGuestMode() || isMultiSpectatorMode()) {
      const blockedClientIds = normalizeMultiBlockedClientIds(payload.blockedClientIds);
      if (blockedClientIds.has(multiState.clientId)) {
        disconnectMultiSession({ silent: true }).catch(() => {});
        setMultiStatus(localizeText('共有モード: マスターにより接続が停止されました', 'Collab mode: connection stopped by master'), 'warn');
        return;
      }
    }
    if (payload.document && typeof payload.document === 'object') {
      applyMultiAuthoritativeDocument(payload.document);
    }
    applyMultiAssignmentsFromPayload(payload.assignments, payload.masterClientId, payload.blockedClientIds);
    if (receivedRevision > multiState.revision) {
      multiState.revision = receivedRevision;
    }
    const keyText = multiState.projectKey ? ` (${multiState.projectKey})` : '';
    if (isMultiSpectatorMode()) {
      setMultiStatus(`共有モード: 視聴中${keyText}`, 'success');
    } else {
      setMultiStatus(`共有モード: 参加中${keyText}`, 'success');
    }
    syncMultiControls();
    renderTimelineMatrix();
    // Danmaku is client-local. Sync local controls to current local state.
    try {
      syncDanmakuControls();
    } catch (e) {
      /* ignore */
    }
    return true;
  }

  async function flushMasterLayerPatchSendQueue() {
    if (!multiState.masterLayerPatchQueued || multiState.masterLayerPatchInFlight) {
      return false;
    }
    if (!multiState.connected || !isMultiMasterMode() || multiState.applyRemoteInProgress) {
      multiState.masterLayerPatchQueued = false;
      return false;
    }
    multiState.masterLayerPatchQueued = false;
    multiState.masterLayerPatchInFlight = true;
    try {
      return await sendMasterLayerPatch();
    } finally {
      multiState.masterLayerPatchInFlight = false;
      if (multiState.masterLayerPatchQueued && multiState.masterLayerPatchTimer === null) {
        multiState.masterLayerPatchTimer = window.setTimeout(() => {
          multiState.masterLayerPatchTimer = null;
          flushMasterLayerPatchSendQueue().catch(() => {});
        }, MULTI_LAYER_PATCH_DEBOUNCE_MS);
      }
    }
  }

  function scheduleMasterLayerPatchSend({ immediate = false } = {}) {
    if (!multiState.connected || !isMultiMasterMode() || multiState.applyRemoteInProgress) {
      return;
    }
    multiState.masterLayerPatchQueued = true;
    if (immediate) {
      if (multiState.masterLayerPatchTimer !== null) {
        window.clearTimeout(multiState.masterLayerPatchTimer);
        multiState.masterLayerPatchTimer = null;
      }
      flushMasterLayerPatchSendQueue().catch(() => {});
      return;
    }
    if (multiState.masterLayerPatchTimer !== null) {
      return;
    }
    multiState.masterLayerPatchTimer = window.setTimeout(() => {
      multiState.masterLayerPatchTimer = null;
      flushMasterLayerPatchSendQueue().catch(() => {});
    }, MULTI_LAYER_PATCH_DEBOUNCE_MS);
  }

  async function flushGuestLayerPatchSendQueue() {
    if (!multiState.guestLayerPatchQueued || multiState.guestLayerPatchInFlight) {
      return false;
    }
    if (!multiState.connected || !isMultiGuestMode() || multiState.applyRemoteInProgress) {
      multiState.guestLayerPatchQueued = false;
      return false;
    }
    multiState.guestLayerPatchQueued = false;
    multiState.guestLayerPatchInFlight = true;
    try {
      return await sendGuestLayerPatch();
    } finally {
      multiState.guestLayerPatchInFlight = false;
      if (multiState.guestLayerPatchQueued && multiState.guestLayerPatchTimer === null) {
        multiState.guestLayerPatchTimer = window.setTimeout(() => {
          multiState.guestLayerPatchTimer = null;
          flushGuestLayerPatchSendQueue().catch(() => {});
        }, MULTI_LAYER_PATCH_DEBOUNCE_MS);
      }
    }
  }

  function scheduleGuestLayerPatchSend({ immediate = false } = {}) {
    if (!multiState.connected || !isMultiGuestMode() || multiState.applyRemoteInProgress) {
      return;
    }
    multiState.guestLayerPatchQueued = true;
    if (immediate) {
      if (multiState.guestLayerPatchTimer !== null) {
        window.clearTimeout(multiState.guestLayerPatchTimer);
        multiState.guestLayerPatchTimer = null;
      }
      flushGuestLayerPatchSendQueue().catch(() => {});
      return;
    }
    if (multiState.guestLayerPatchTimer !== null) {
      return;
    }
    multiState.guestLayerPatchTimer = window.setTimeout(() => {
      multiState.guestLayerPatchTimer = null;
      flushGuestLayerPatchSendQueue().catch(() => {});
    }, MULTI_LAYER_PATCH_DEBOUNCE_MS);
  }

  function buildGuestLayerPatchPayload() {
    if (!isMultiGuestMode()) {
      return null;
    }
    if (!enforceGuestAssignedLayerSelection({ announce: true })) {
      return null;
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    const canvasId = canvasDoc?.id || '';
    const frameIndex = getAssignedFrameIndexForClient(multiState.clientId, canvasDoc);
    if (frameIndex < 0) {
      return null;
    }
    const assignment = getMultiAssignment(multiState.clientId);
    const layer = getAssignedLayerForFrame(multiState.clientId, frameIndex, canvasDoc);
    if (!assignment || !layer) {
      return null;
    }
    const pixelCount = Math.max(0, Math.floor(Number(state.width) || 0) * Math.floor(Number(state.height) || 0));
    if (!pixelCount || !canvasId) {
      return null;
    }
    const streamKey = getMultiLayerPatchStreamKey(
      'guest-send',
      multiState.clientId,
      canvasId,
      frameIndex,
      assignment.anchorLayerId
    );
    const sequence = getNextMultiLayerPatchSequence(streamKey);
    const previousSnapshot = multiState.layerPatchSnapshots.get(streamKey) || null;
    const diffPayload = buildLayerDiffPayload(layer, previousSnapshot, pixelCount);
    if (!diffPayload) {
      return null;
    }
    return {
      streamKey,
      pixelCount,
      layer,
      payload: {
        clientId: multiState.clientId,
        projectKey: multiState.projectKey,
        canvasId,
        frameIndex,
        anchorLayerId: assignment.anchorLayerId,
        sequence,
        ...diffPayload,
      },
      sequence,
    };
  }

  async function sendGuestLayerPatch() {
    const patch = buildGuestLayerPatchPayload();
    if (!patch) {
      return false;
    }
    const sent = await sendMultiBroadcast('guest-layer-patch', patch.payload);
    if (sent) {
      const snapshot = captureLayerPatchSnapshot(patch.layer, patch.pixelCount);
      if (snapshot) {
        multiState.layerPatchSnapshots.set(patch.streamKey, snapshot);
      }
      commitMultiLayerPatchSequence(patch.streamKey, patch.sequence);
    }
    return sent;
  }

  function buildGuestPaletteUpdatePayload() {
    if (!isMultiGuestMode()) {
      return null;
    }
    const paletteSource = Array.isArray(state.palette) && state.palette.length
      ? state.palette
      : [{ r: 0, g: 0, b: 0, a: 0 }];
    const palette = paletteSource.map(color => normalizeColorValue(color));
    const activePaletteIndex = clamp(
      normalizePaletteIndex(state.activePaletteIndex, 0),
      0,
      Math.max(0, palette.length - 1)
    );
    const secondaryPaletteIndex = clamp(
      normalizePaletteIndex(state.secondaryPaletteIndex, activePaletteIndex),
      0,
      Math.max(0, palette.length - 1)
    );
    return {
      clientId: multiState.clientId,
      projectKey: multiState.projectKey,
      palette,
      activePaletteIndex,
      secondaryPaletteIndex,
      sentAt: Date.now(),
    };
  }

  async function sendGuestPaletteUpdate() {
    const payload = buildGuestPaletteUpdatePayload();
    if (!payload) {
      return false;
    }
    return sendMultiBroadcast('guest-palette-update', payload);
  }

  function buildMasterLayerPatchPayload() {
    if (!isMultiMasterMode()) {
      return null;
    }
    const canvasDoc = getActiveProjectCanvasDocument();
    const canvasId = canvasDoc?.id || '';
    const frameIndex = clamp(Math.round(Number(state.activeFrame) || 0), 0, Math.max(0, state.frames.length - 1));
    const frame = state.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      return null;
    }
    const layer = frame.layers.find(item => item?.id === state.activeLayer) || null;
    if (!layer) {
      return null;
    }
    const pixelCount = Math.max(0, Math.floor(Number(state.width) || 0) * Math.floor(Number(state.height) || 0));
    if (!pixelCount || !canvasId) {
      return null;
    }
    const streamKey = getMultiLayerPatchStreamKey('master-send', multiState.clientId, canvasId, frameIndex, layer.id);
    const sequence = getNextMultiLayerPatchSequence(streamKey);
    const previousSnapshot = multiState.layerPatchSnapshots.get(streamKey) || null;
    const diffPayload = buildLayerDiffPayload(layer, previousSnapshot, pixelCount);
    if (!diffPayload) {
      return null;
    }
    return {
      streamKey,
      pixelCount,
      layer,
      payload: {
        clientId: multiState.clientId,
        projectKey: multiState.projectKey,
        canvasId,
        frameIndex,
        layerId: layer.id,
        sequence,
        ...diffPayload,
      },
      sequence,
    };
  }

  async function sendMasterLayerPatch() {
    const patch = buildMasterLayerPatchPayload();
    if (!patch) {
      return false;
    }
    const sent = await sendMultiBroadcast('master-layer-patch', patch.payload);
    if (sent) {
      const snapshot = captureLayerPatchSnapshot(patch.layer, patch.pixelCount);
      if (snapshot) {
        multiState.layerPatchSnapshots.set(patch.streamKey, snapshot);
      }
      commitMultiLayerPatchSequence(patch.streamKey, patch.sequence);
    }
    return sent;
  }

  function refreshMultiParticipantsFromPresence() {
    if (prefersSharedProjectFlow()) {
      renderMultiParticipantsList();
      return;
    }
    if (!multiState.channel || typeof multiState.channel.presenceState !== 'function') {
      renderMultiParticipantsList();
      return;
    }
    const previousMasterClientId = multiState.masterClientId;
    const nextParticipants = new Map();
    const presenceState = multiState.channel.presenceState() || {};
    Object.keys(presenceState).forEach(key => {
      const entries = Array.isArray(presenceState[key]) ? presenceState[key] : [];
      entries.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
          return;
        }
        const clientId = typeof entry.clientId === 'string' && entry.clientId.trim()
          ? entry.clientId.trim()
          : (typeof key === 'string' ? key : '');
        if (!clientId) {
          return;
        }
        if (isMultiClientBlocked(clientId)) {
          return;
        }
        nextParticipants.set(clientId, {
          clientId,
          role: normalizeMultiRole(entry.role, 'guest'),
          name: normalizeMultiParticipantName(entry.name, DEFAULT_MULTI_PARTICIPANT_NAME),
          joinedAt: Number(entry.joinedAt) || Date.now(),
        });
      });
    });
    const sharedCollaborative = isSharedProjectCollaborativeMode();
    const onlineMaster = Array.from(nextParticipants.values()).find(entry => entry.role === 'master') || null;
    if (sharedCollaborative) {
      multiState.masterClientId = null;
    } else if (isMultiMasterMode()) {
      multiState.masterClientId = multiState.clientId;
    } else {
      multiState.masterClientId = onlineMaster ? onlineMaster.clientId : null;
    }
    // detect newly joined participants (present in nextParticipants but not in previous)
    const prevIds = multiState.participants instanceof Map ? new Set(Array.from(multiState.participants.keys())) : new Set();
    const addedIds = Array.from(nextParticipants.keys()).filter(id => !prevIds.has(id));
    // post a comment for each newly joined participant (except self)
    try {
      addedIds.forEach(id => {
        if (!id || id === multiState.clientId) return;
        const p = nextParticipants.get(id);
        if (!p) return;
        const displayName = normalizeMultiParticipantName(p.name, DEFAULT_MULTI_PARTICIPANT_NAME);
        const joinText = `${displayName} が入室しました`;
        const commentPayload = {
          projectKey: multiState.projectKey,
          clientId: id,
          role: p.role,
          name: p.name,
          avatarId: p.avatarId || '',
          text: joinText,
          sentAt: Date.now(),
        };
        appendMultiCommentEntry(commentPayload);
      });
      // render comments if any were added
      if (addedIds.length) renderMultiComments();
    } catch (e) {
      // ignore comment posting errors
    }

    multiState.participants = nextParticipants;
    if (sharedCollaborative) {
      setMultiStatus(
        localizeText(`共有プロジェクト接続中 (${multiState.projectKey})`, `Shared project connected (${multiState.projectKey})`),
        'success'
      );
    } else if (!isMultiMasterMode()) {
      if (onlineMaster && previousMasterClientId !== onlineMaster.clientId) {
        setMultiStatus(`共有モード: マスター接続中 (${multiState.projectKey})`, 'info');
        if (isMultiGuestMode()) {
          sendGuestRecoveryStateToMaster(onlineMaster.clientId).catch(() => {});
        }
      } else if (!onlineMaster && previousMasterClientId) {
        setMultiStatus(localizeText('共有モード: マスター不在。更新の受信待ちです', 'Collab mode: master is offline. Waiting for updates.'), 'warn');
      }
    }
    renderMultiParticipantsList();
    syncMultiJoinRequestControls();
    if (isMultiMasterMode()) {
      scheduleMultiPublicLobbyRoomSync({ immediate: false });
    }
  }

  function handleMultiCommentMessage(payload) {
    if (prefersSharedProjectFlow()) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const clientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!clientId || clientId === multiState.clientId) {
      return;
    }
    const payloadProjectKey = normalizeMultiProjectKey(payload.projectKey);
    if (payloadProjectKey && payloadProjectKey !== multiState.projectKey) {
      return;
    }
    const added = appendMultiCommentEntry(payload);
    if (!added) {
      return;
    }
    renderMultiComments();
  }

  async function handleMultiJoinRequestMessage(payload) {
    if (isSharedProjectCollaborativeMode()) {
      return;
    }
    if (!isMultiMasterMode()) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!senderClientId || senderClientId === multiState.clientId) {
      return;
    }
    const payloadProjectKey = normalizeMultiProjectKey(payload.projectKey);
    if (payloadProjectKey && payloadProjectKey !== multiState.projectKey) {
      return;
    }
    if (isMultiClientBlocked(senderClientId)) {
      await sendMultiJoinRequestResult(senderClientId, 'blocked');
      return;
    }
    const requestName = normalizeMultiParticipantName(payload.name, DEFAULT_MULTI_PARTICIPANT_NAME);
    const existingAssignment = getMultiAssignment(senderClientId);
    if (existingAssignment?.role === 'guest') {
      await sendMultiRoleChangeNotice(senderClientId, 'guest', 'master-restore');
      removeMultiJoinRequest(senderClientId);
      syncMultiJoinRequestControls();
      await sendMultiJoinRequestResult(senderClientId, 'approved');
      return;
    }
    const joinPolicy = normalizeMultiJoinPolicy(
      multiState.joinPolicy,
      MULTI_DEFAULT_JOIN_POLICY
    );
    if (joinPolicy === MULTI_JOIN_POLICY_OPEN) {
      if (isMultiGuestLimitReached(senderClientId)) {
        setMultiStatus(`共有モード: 参加上限 ${multiState.maxGuests} 人のため自動参加できません (${requestName})`, 'warn');
        await sendMultiJoinRequestResult(senderClientId, 'rejected');
        return;
      }
      const assignment = assignLayerToGuestClient(senderClientId, requestName);
      if (!assignment) {
        await sendMultiJoinRequestResult(senderClientId, 'rejected');
        return;
      }
      removeMultiJoinRequest(senderClientId);
      syncMultiJoinRequestControls();
      scheduleMultiSessionStateBroadcast({ immediate: true });
      await sendMultiRoleChangeNotice(senderClientId, 'guest', 'master-open-join');
      await sendMultiJoinRequestResult(senderClientId, 'approved');
      setMultiStatus(`共有モード: 自動参加を許可しました (${requestName})`, 'success');
      return;
    }
    upsertMultiJoinRequest(senderClientId, requestName, payload.sentAt);
    syncMultiJoinRequestControls();
    setMultiStatus(`共有モード: 参加リクエストを受信 (${requestName})`, 'info');
    await sendMultiJoinRequestResult(senderClientId, 'queued');
  }

  function handleMultiJoinRequestResultMessage(payload) {
    if (isSharedProjectCollaborativeMode()) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (isMultiMasterMode()) {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (multiState.masterClientId && senderClientId && senderClientId !== multiState.masterClientId) {
      return;
    }
    const payloadProjectKey = normalizeMultiProjectKey(payload.projectKey);
    if (payloadProjectKey && payloadProjectKey !== multiState.projectKey) {
      return;
    }
    const targetClientId = typeof payload.targetClientId === 'string' ? payload.targetClientId.trim() : '';
    if (!targetClientId || targetClientId !== multiState.clientId) {
      return;
    }
    const decision = typeof payload.decision === 'string' ? payload.decision.trim() : '';
    if (decision === 'queued') {
      multiState.joinRequestPending = true;
      setMultiStatus(localizeText('共有モード: 参加リクエストは承認待ちです', 'Collab mode: join request is pending approval'), 'info');
    } else if (decision === 'approved') {
      multiState.joinRequestPending = false;
      setMultiStatus(localizeText('共有モード: 参加リクエストが承認されました', 'Collab mode: join request approved'), 'success');
    } else if (decision === 'rejected') {
      multiState.joinRequestPending = false;
      setMultiStatus(localizeText('共有モード: 参加リクエストは却下されました', 'Collab mode: join request rejected'), 'warn');
    } else if (decision === 'blocked') {
      multiState.joinRequestPending = false;
      setMultiStatus(localizeText('共有モード: リクエストできません（BAN中）', 'Collab mode: request unavailable (banned)'), 'warn');
    }
    syncMultiJoinRequestControls();
  }

  async function handleMultiRoleChangeMessage(payload) {
    if (isSharedProjectCollaborativeMode()) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (isMultiMasterMode()) {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (multiState.masterClientId && senderClientId && senderClientId !== multiState.masterClientId) {
      return;
    }
    const targetClientId = typeof payload.targetClientId === 'string' ? payload.targetClientId.trim() : '';
    if (!targetClientId || targetClientId !== multiState.clientId) {
      return;
    }
    const payloadProjectKey = normalizeMultiProjectKey(payload.projectKey);
    if (payloadProjectKey && payloadProjectKey !== multiState.projectKey) {
      return;
    }
    const nextRole = normalizeMultiRoleControlTargetRole(payload.nextRole);
    if (nextRole === 'none') {
      return;
    }
    const currentRole = normalizeMultiRoleControlTargetRole(multiState.role);
    applyMultiSharedRoomConfigFromPayload(payload);
    if (currentRole === nextRole) {
      if (nextRole === 'guest') {
        multiState.joinRequestPending = false;
      }
      syncMultiControls();
      return;
    }
    setMultiStatus(
      nextRole === 'guest'
        ? '共有モード: マスターにより参加者へ切替中…'
        : '共有モード: マスターにより視聴者へ切替中…',
      'info'
    );
    clearMultiGuestMovePreview();
    multiState.joinRequestPending = false;
    await connectMultiSessionAs(nextRole, { allowGuestJoin: nextRole === 'guest' });
  }

  async function handleMultiUnassignedGuestJoinIntent(clientId, participantName = '') {
    if (!isMultiMasterMode()) {
      return false;
    }
    const normalizedClientId = typeof clientId === 'string' ? clientId.trim() : '';
    if (!normalizedClientId || normalizedClientId === multiState.clientId) {
      return false;
    }
    const joinPolicy = normalizeMultiJoinPolicy(
      multiState.joinPolicy,
      MULTI_DEFAULT_JOIN_POLICY
    );
    if (joinPolicy !== MULTI_JOIN_POLICY_OPEN) {
      await sendMultiRoleChangeNotice(normalizedClientId, 'spectator', 'master-default-spectator');
      return true;
    }
    if (isMultiGuestLimitReached(normalizedClientId)) {
      await sendMultiKickClientNotice(normalizedClientId, 'room-full');
      return true;
    }
    const assignment = assignLayerToGuestClient(normalizedClientId, participantName);
    if (!assignment) {
      await sendMultiRoleChangeNotice(normalizedClientId, 'spectator', 'master-auto-assign-failed');
      return true;
    }
    removeMultiJoinRequest(normalizedClientId);
    return true;
  }

  async function handleMultiHelloMessage(payload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!senderClientId || senderClientId === multiState.clientId) {
      return;
    }
    recordMultiPeerBuildVersion(senderClientId, payload.buildVersion, { source: 'hello' });
    if (isMultiMasterMode()) {
      if (isMultiClientBlocked(senderClientId)) {
        await sendMultiKickClientNotice(senderClientId, 'blocked');
        return;
      }
      const senderRole = normalizeMultiRole(payload.role, 'guest');
      if (senderRole === 'master') {
        setMultiStatus(localizeText('共有モード: 同一キーに別マスターがいます', 'Collab mode: another master is already using this key'), 'warn');
        return;
      }
      const hasAssignment = Boolean(getMultiAssignment(senderClientId));
      if (hasAssignment && senderRole !== 'guest') {
        await sendMultiRoleChangeNotice(senderClientId, 'guest', 'master-restore');
      } else if (!hasAssignment && senderRole === 'guest') {
        const senderName = normalizeMultiParticipantName(payload.name, DEFAULT_MULTI_PARTICIPANT_NAME);
        await handleMultiUnassignedGuestJoinIntent(senderClientId, senderName);
      }
      refreshMultiParticipantsFromPresence();
      renderMultiParticipantsList();
      syncMultiJoinRequestControls();
      scheduleMultiSessionStateBroadcast({ targetClientId: senderClientId, immediate: true });
      return;
    }
    if (!isMultiMasterMode() && payload.role === 'master') {
      const shouldPushRecoveryState = isMultiReplicaRole(multiState.role)
        && multiState.masterClientId !== senderClientId;
      multiState.masterClientId = senderClientId;
      renderMultiParticipantsList();
      if (shouldPushRecoveryState) {
        sendGuestRecoveryStateToMaster(senderClientId).catch(() => {});
      }
    }
  }

  async function handleMultiSyncRequestMessage(payload) {
    if (!isMultiMasterMode()) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const requesterClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!requesterClientId || requesterClientId === multiState.clientId) {
      return;
    }
    recordMultiPeerBuildVersion(requesterClientId, payload.buildVersion, { source: 'sync-request' });
    if (isMultiClientBlocked(requesterClientId)) {
      await sendMultiKickClientNotice(requesterClientId, 'blocked');
      return;
    }
    const requesterRole = normalizeMultiRole(payload.role, 'guest');
    const hasAssignment = Boolean(getMultiAssignment(requesterClientId));
    if (hasAssignment && requesterRole !== 'guest') {
      await sendMultiRoleChangeNotice(requesterClientId, 'guest', 'master-restore');
    } else if (!hasAssignment && requesterRole === 'guest') {
      const requesterName = normalizeMultiParticipantName(payload.name, DEFAULT_MULTI_PARTICIPANT_NAME);
      await handleMultiUnassignedGuestJoinIntent(requesterClientId, requesterName);
    }
    syncMultiJoinRequestControls();
    scheduleMultiSessionStateBroadcast({ targetClientId: requesterClientId, immediate: true });
  }

  async function handleMultiSessionStateMessage(payload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (!isMultiPayloadTargetedToCurrentClient(payload)) {
      return;
    }
    if (!getMultiRoleCapabilities().canReceiveAuthoritativeState) {
      return;
    }
    if (!isMultiPayloadForCurrentProject(payload)) {
      return;
    }
    const payloadMasterClientId = typeof payload.masterClientId === 'string' ? payload.masterClientId.trim() : '';
    if (payloadMasterClientId) {
      recordMultiPeerBuildVersion(payloadMasterClientId, payload.buildVersion, { source: 'session-state' });
    }
    if (!shouldAcceptIncomingMultiSessionRevision(payload)) {
      return;
    }
    if (isSharedProjectRealtimePrimaryActive(multiState.projectKey)) {
      return;
    }
    if (shouldDeferMultiSessionStateApply()) {
      multiState.pendingSessionStatePayload = payload;
      schedulePendingMultiSessionStateApply();
      return;
    }
    applyMultiSessionStatePayload(payload);
  }

  async function handleMultiMasterStateRequestMessage(payload) {
    if (isSharedProjectCollaborativeMode()) {
      return;
    }
    if (!getMultiRoleCapabilities().canRespondToMasterStateRequest) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (!isMultiPayloadTargetedToCurrentClient(payload)) {
      return;
    }
    if (!isMultiPayloadForCurrentProject(payload)) {
      return;
    }
    const requesterClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!requesterClientId || requesterClientId === multiState.clientId) {
      return;
    }
    if (isMultiClientBlocked(requesterClientId)) {
      return;
    }
    const responseReason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    const responsePayload = buildGuestSessionStatePayload({
      targetClientId: requesterClientId,
      reason: responseReason,
      canvasId: typeof payload.canvasId === 'string' ? payload.canvasId : '',
      requestKey: typeof payload.requestKey === 'string' ? payload.requestKey : '',
      requestToken: typeof payload.requestToken === 'string' ? payload.requestToken : '',
      expectedCanvasId: typeof payload.expectedCanvasId === 'string' ? payload.expectedCanvasId : '',
      expectedFrameId: typeof payload.expectedFrameId === 'string' ? payload.expectedFrameId : '',
      expectedAnchorLayerId: typeof payload.expectedAnchorLayerId === 'string' ? payload.expectedAnchorLayerId : '',
    });
    await sendMultiBroadcast('guest-session-state', responsePayload);
  }

  async function handleMultiGuestSessionStateMessage(payload) {
    if (isSharedProjectCollaborativeMode()) {
      return;
    }
    if (!getMultiRoleCapabilities().canBroadcastAuthoritativeState) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (!isMultiPayloadTargetedToCurrentClient(payload)) {
      return;
    }
    if (!isMultiPayloadForCurrentProject(payload)) {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!senderClientId || senderClientId === multiState.clientId) {
      return;
    }
    recordMultiPeerBuildVersion(senderClientId, payload.buildVersion, { source: 'guest-session-state' });
    if (isMultiClientBlocked(senderClientId)) {
      return;
    }
    const hasDocument = payload.document && typeof payload.document === 'object';
    if (!hasDocument) {
      return;
    }
    const responseReason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    const usePartialApply = responseReason === 'layer-resync';
    if (usePartialApply) {
      const pendingResync = consumePendingMultiLayerResyncRequest(payload, senderClientId);
      if (!pendingResync) {
        return;
      }
      const expectedCanvasId = normalizeMultiHistoryCanvasId(payload.expectedCanvasId || pendingResync.canvasId || '');
      const expectedFrameId = typeof payload.expectedFrameId === 'string' && payload.expectedFrameId.trim()
        ? payload.expectedFrameId.trim()
        : pendingResync.frameId;
      const expectedAnchorLayerId = typeof payload.expectedAnchorLayerId === 'string' && payload.expectedAnchorLayerId.trim()
        ? payload.expectedAnchorLayerId.trim()
        : pendingResync.anchorLayerId;
      if (
        (pendingResync.canvasId && expectedCanvasId && expectedCanvasId !== pendingResync.canvasId)
        || (pendingResync.frameId && expectedFrameId && expectedFrameId !== pendingResync.frameId)
        || (pendingResync.anchorLayerId && expectedAnchorLayerId && expectedAnchorLayerId !== pendingResync.anchorLayerId)
      ) {
        return;
      }
      const currentAssignment = getMultiAssignment(senderClientId);
      const currentCanvas = getAssignmentCanvasDocument(
        currentAssignment,
        getProjectCanvasDocumentById(pendingResync.canvasId) || getActiveProjectCanvasDocument()
      );
      const currentFrameIndex = currentAssignment && currentCanvas
        ? resolveAssignedFrameIndexForCanvas(currentAssignment, currentCanvas)
        : -1;
      const currentFrameId = currentFrameIndex >= 0
        ? (currentCanvas?.frames?.[currentFrameIndex]?.id || '')
        : (currentAssignment?.frameId || '');
      const currentAnchorLayerId = typeof currentAssignment?.anchorLayerId === 'string'
        ? currentAssignment.anchorLayerId
        : '';
      if (
        (pendingResync.canvasId && (currentCanvas?.id || '') !== pendingResync.canvasId)
        || (pendingResync.frameId && currentFrameId !== pendingResync.frameId)
        || (pendingResync.anchorLayerId && currentAnchorLayerId !== pendingResync.anchorLayerId)
      ) {
        return;
      }
      let snapshot = null;
      try {
        snapshot = deserializeDocumentPayload(payload.document);
      } catch (error) {
        console.warn('Failed to deserialize targeted guest sync payload', error);
        return;
      }
      const appliedPartial = applyHistorySnapshotForClient(snapshot, senderClientId, {
        preserveView: true,
        canvasId: pendingResync.canvasId || (typeof payload.canvasId === 'string' ? payload.canvasId : ''),
      });
      if (!appliedPartial) {
        return;
      }
      scheduleMultiSessionStateBroadcast({ immediate: true });
      return;
    }
    if (responseReason === MULTI_MASTER_RECOVERY_REASON && !multiState.awaitingGuestStateRecovery) {
      return;
    }
    if (!multiState.awaitingGuestStateRecovery) {
      return;
    }
    let recoverySnapshot = null;
    try {
      recoverySnapshot = deserializeDocumentPayload(payload.document);
    } catch (error) {
      console.warn('Failed to deserialize guest recovery payload', error);
      return;
    }
    const applied = applyHistorySnapshotForClient(recoverySnapshot, senderClientId, {
      preserveView: true,
      canvasId: typeof payload.canvasId === 'string' ? payload.canvasId : '',
    });
    if (!applied) {
      return;
    }
    refreshMultiParticipantsFromPresence();
    renderMultiParticipantsList();
    syncMultiAssignmentControls();
    syncMultiControls();
    clearMultiGuestStateRecovery();
    scheduleMultiSessionStateBroadcast({ immediate: true });
    setMultiStatus(`共有モード: マスター (${multiState.projectKey})`, 'success');
  }

  async function handleMultiGuestPaletteUpdateMessage(payload) {
    // Palette is client-local in multiplayer mode.
    // Keep this event for backward compatibility but intentionally ignore it.
    void payload;
  }

  async function handleMultiGuestLayerPatchMessage(payload) {
    if (isSharedProjectRealtimePrimaryActive(multiState.projectKey)) {
      return;
    }
    const capabilities = getMultiRoleCapabilities();
    const inMasterMode = capabilities.isMaster;
    const inReplicaMode = capabilities.isReplica;
    if (!inMasterMode && !inReplicaMode) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!senderClientId || senderClientId === multiState.clientId) {
      return;
    }
    if (isMultiClientBlocked(senderClientId)) {
      await sendMultiKickClientNotice(senderClientId, 'blocked');
      return;
    }
    normalizeMultiAssignmentsForCurrentDocument();
    const assignment = getMultiAssignment(senderClientId);
    if (!assignment) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId);
      }
      return;
    }
    if (assignment.locked) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId);
      }
      return;
    }
    if (payload.anchorLayerId !== assignment.anchorLayerId) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId);
      }
      return;
    }
    const payloadCanvasId = typeof payload.canvasId === 'string' ? payload.canvasId.trim() : '';
    const targetCanvas = getProjectCanvasDocumentById(payloadCanvasId) || (!payloadCanvasId ? getActiveProjectCanvasDocument() : null);
    if (!targetCanvas) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId, '', payloadCanvasId);
      }
      return;
    }
    if (normalizeMultiAssignmentCanvasId(assignment.canvasId, targetCanvas.id || '') !== targetCanvas.id) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId, '', targetCanvas.id);
      }
      return;
    }
    const trackIndex = resolveAssignedLayerTrackIndexForCanvas(assignment, targetCanvas);
    if (trackIndex < 0) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId, '', targetCanvas.id);
      }
      return;
    }
    const frameIndex = clamp(Math.round(Number(payload.frameIndex) || 0), 0, Math.max(0, targetCanvas.frames.length - 1));
    const assignedFrameIndex = resolveAssignedFrameIndexForCanvas(assignment, targetCanvas);
    if (assignedFrameIndex < 0 || frameIndex !== assignedFrameIndex) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId, '', targetCanvas.id);
      }
      return;
    }
    const frame = targetCanvas.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers) || trackIndex >= frame.layers.length) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId, '', targetCanvas.id);
      }
      return;
    }
    const targetLayer = frame.layers[trackIndex];
    const pixelCount = Math.max(0, Math.floor(Number(targetCanvas.width) || 0) * Math.floor(Number(targetCanvas.height) || 0));
    if (!pixelCount) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId, '', targetCanvas.id);
      }
      return;
    }
    const streamKey = getMultiLayerPatchStreamKey(
      'guest-recv',
      senderClientId,
      targetCanvas.id,
      frameIndex,
      assignment.anchorLayerId
    );
    const sequenceState = inspectIncomingMultiLayerPatchSequence(streamKey, payload);
    if (sequenceState.action === 'stale') {
      return;
    }
    if (sequenceState.action === 'resync') {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId, streamKey, targetCanvas.id);
      } else if (isMultiMasterCurrentlyOnline()) {
        maybeRequestGuestAssignmentSync();
      }
      return;
    }
    const applyResult = applyLayerPatchPayloadToLayer(targetLayer, payload, pixelCount, {
      width: targetCanvas.width,
      height: targetCanvas.height,
    });
    if (!applyResult) {
      if (inMasterMode) {
        await requestTargetedGuestSessionState(senderClientId, streamKey, targetCanvas.id);
      } else if (isMultiMasterCurrentlyOnline()) {
        maybeRequestGuestAssignmentSync();
      }
      return;
    }
    markIncomingMultiLayerPatchSequenceApplied(streamKey, sequenceState.sequence);
    markRemoteMultiStateDirty();
    if (targetCanvas.id !== (getActiveProjectCanvasDocument()?.id || '')) {
      markCanvasDirty();
    } else if (applyResult.full || !applyResult.dirtyRect) {
      markCanvasDirty();
    } else {
      markDirtyRect(
        applyResult.dirtyRect.x0,
        applyResult.dirtyRect.y0,
        applyResult.dirtyRect.x1,
        applyResult.dirtyRect.y1
      );
    }
    requestRender();
    requestOverlayRender();
    if (!inMasterMode) {
      if (isMultiMasterCurrentlyOnline()) {
        return;
      }
      return;
    }
    const relayMode = payload.mode === 'diff' ? 'diff' : 'full';
    const relayHasDirect = typeof payload.hasDirect === 'boolean'
      ? payload.hasDirect
      : (typeof payload.direct === 'string' && payload.direct.length > 0);
    await sendMultiBroadcast('master-layer-patch', {
      clientId: senderClientId,
      projectKey: multiState.projectKey,
      canvasId: targetCanvas.id,
      frameIndex,
      layerId: targetLayer.id,
      mode: relayMode,
      hasDirect: relayHasDirect,
      sequence: sequenceState.sequence,
      changed: typeof payload.changed === 'string' ? payload.changed : '',
      indices: typeof payload.indices === 'string' ? payload.indices : '',
      direct: typeof payload.direct === 'string' ? payload.direct : '',
    });
  }

  async function handleMultiMasterLayerPatchMessage(payload) {
    if (isSharedProjectRealtimePrimaryActive(multiState.projectKey)) {
      return;
    }
    if (!getMultiRoleCapabilities().canReceiveMasterPatch) {
      return;
    }
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (!senderClientId) {
      return;
    }
    if (multiState.masterClientId && senderClientId !== multiState.masterClientId && senderClientId !== multiState.clientId) {
      return;
    }
    const payloadCanvasId = typeof payload.canvasId === 'string' ? payload.canvasId.trim() : '';
    const targetCanvas = getProjectCanvasDocumentById(payloadCanvasId) || (!payloadCanvasId ? getActiveProjectCanvasDocument() : null);
    if (!targetCanvas) {
      return;
    }
    const frameIndex = clamp(Math.round(Number(payload.frameIndex) || 0), 0, Math.max(0, targetCanvas.frames.length - 1));
    const frame = targetCanvas.frames[frameIndex];
    if (!frame || !Array.isArray(frame.layers)) {
      return;
    }
    const layerId = typeof payload.layerId === 'string' ? payload.layerId.trim() : '';
    if (!layerId) {
      return;
    }
    const targetLayer = frame.layers.find(layer => layer?.id === layerId);
    if (!targetLayer) {
      return;
    }
    const pixelCount = Math.max(0, Math.floor(Number(targetCanvas.width) || 0) * Math.floor(Number(targetCanvas.height) || 0));
    if (!pixelCount) {
      return;
    }
    const streamKey = getMultiLayerPatchStreamKey('master-recv', senderClientId, targetCanvas.id, frameIndex, layerId);
    const sequenceState = inspectIncomingMultiLayerPatchSequence(streamKey, payload);
    if (sequenceState.action === 'stale') {
      return;
    }
    if (sequenceState.action === 'resync') {
      maybeRequestGuestAssignmentSync();
      return;
    }
    const applyResult = applyLayerPatchPayloadToLayer(targetLayer, payload, pixelCount, {
      width: targetCanvas.width,
      height: targetCanvas.height,
    });
    if (!applyResult) {
      maybeRequestGuestAssignmentSync();
      return;
    }
    markIncomingMultiLayerPatchSequenceApplied(streamKey, sequenceState.sequence);
    markRemoteMultiStateDirty();
    if (targetCanvas.id !== (getActiveProjectCanvasDocument()?.id || '')) {
      markCanvasDirty();
    } else if (applyResult.full || !applyResult.dirtyRect) {
      markCanvasDirty();
    } else {
      markDirtyRect(
        applyResult.dirtyRect.x0,
        applyResult.dirtyRect.y0,
        applyResult.dirtyRect.x1,
        applyResult.dirtyRect.y1
      );
    }
    requestRender();
    requestOverlayRender();
  }

  async function handleMultiKickClientMessage(payload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    if (isMultiMasterMode()) {
      return;
    }
    const senderClientId = typeof payload.clientId === 'string' ? payload.clientId.trim() : '';
    if (multiState.masterClientId && senderClientId && senderClientId !== multiState.masterClientId) {
      return;
    }
    const targetClientId = typeof payload.targetClientId === 'string' ? payload.targetClientId.trim() : '';
    if (!targetClientId || targetClientId !== multiState.clientId) {
      return;
    }
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    const roomMaxGuests = normalizeMultiMaxGuests(payload.maxGuests, multiState.maxGuests);
    multiState.maxGuests = roomMaxGuests;
    const shouldAutoReconnectAsSpectator = reason === 'room-full';
    await disconnectMultiSession({
      silent: true,
      restoreLocalDocument: !shouldAutoReconnectAsSpectator,
    });
    if (reason === 'room-full') {
      setMultiStatus(
        localizeText(
          `共有モード: 参加枠が満員です（上限 ${roomMaxGuests} 人）。視聴者として接続します…`,
          `Collab mode: participant slots are full (limit ${roomMaxGuests}). Reconnecting as viewer...`
        ),
        'warn'
      );
      setMultiDesiredRole('spectator');
      setMultiUiView('spectator');
      syncMultiControls();
      window.setTimeout(() => {
        if (!multiState.connected && !multiState.connecting) {
          connectMultiSessionAs('spectator');
        }
      }, 120);
    } else if (reason === 'master-ban' || reason === 'blocked') {
      setMultiStatus(localizeText('共有モード: マスターによりBANされました', 'Collab mode: banned by master'), 'warn');
    } else if (reason === 'master-kick' || reason === 'kicked') {
      setMultiStatus(localizeText('共有モード: マスターによりキックされました（再参加可）', 'Collab mode: kicked by master (can rejoin)'), 'warn');
    } else {
      setMultiStatus(localizeText('共有モード: マスターにより切断されました', 'Collab mode: disconnected by master'), 'warn');
    }
  }

  async function disconnectMultiSession({ silent = false, restoreLocalDocument = true } = {}) {
    const sharedCollaborative = isSharedProjectCollaborativeMode();
    const disconnectedRole = multiState.role === 'master'
      || multiState.role === 'guest'
      || multiState.role === 'spectator'
      ? multiState.role
      : 'none';
    const shouldRestoreReplicaSnapshot = Boolean(
      restoreLocalDocument
      && isMultiReplicaRole(disconnectedRole)
      && !sharedCollaborative
    );
    clearMultiBroadcastTimer();
    clearPendingMultiSessionStateApply();
    clearMultiLayerPatchSnapshots();
    clearMultiLayerPatchSendTimers();
    clearMultiGuestStateRecovery();
    clearMultiGuestMovePreview();
    clearMultiHistory();
    const channel = multiState.channel;
    multiState.channel = null;
    multiState.connected = false;
    multiState.connecting = false;
    multiState.role = 'none';
    multiState.activeTab = 'collab';
    multiState.masterClientId = null;
    multiState.assignments.clear();
    multiState.participants.clear();
    multiState.blockedClientIds.clear();
    if (multiState.peerBuildVersions instanceof Map) {
      multiState.peerBuildVersions.clear();
    }
    multiState.pendingAssignmentMoveRequests.clear();
    multiState.selectedAssignClientId = '';
    multiState.selectedRoleControlClientId = '';
    multiState.comments = [];
    multiState.commentIds = new Set();
    clearMultiJoinRequests();
    multiState.joinRequestPending = false;
    multiState.joinRequestCooldownUntil = 0;
    multiState.assignmentSyncRequestAt = 0;
    multiState.guestRecoveryPushAt = 0;
    multiState.guestRecoveryTargetClientId = '';
    multiState.lastResyncAt = 0;
    multiState.lastVersionMismatch = '';
    multiState.versionMismatchAt = 0;
    multiState.applyRemoteInProgress = false;
    multiState.uiView = 'entry';
    multiEntryJoinPanelOpen = false;
    multiState.resumeAssignments = null;
    multiState.resumeBlockedClientIds = null;
    multiState.resumeMaxGuests = null;
    multiState.resumeRoomVisibility = null;
    multiState.resumeJoinPolicy = null;
    multiState.resumeParticipantFreeCellMove = null;
    multiState.resumeExportPermission = null;
    setMultiTabNotification(false);
    setMultiCommentTabNotification(false);
    multiState.roomVisibility = MULTI_DEFAULT_ROOM_VISIBILITY;
    multiState.joinPolicy = MULTI_DEFAULT_JOIN_POLICY;
    multiState.participantFreeCellMove = MULTI_DEFAULT_PARTICIPANT_FREE_CELL_MOVE;
    multiState.exportPermission = MULTI_DEFAULT_EXPORT_PERMISSION;
    multiState.paletteSeededFromShared = false;
    clearStoredMultiResumeSession();
    await disconnectMultiPublicLobbyChannel();
    if (channel) {
      try {
        if (typeof channel.untrack === 'function') {
          await channel.untrack();
        }
      } catch (error) {
        // Ignore untrack errors.
      }
      try {
        if (typeof channel.unsubscribe === 'function') {
          await channel.unsubscribe();
        }
      } catch (error) {
        // Ignore unsubscribe errors.
      }
    }
    if (shouldRestoreReplicaSnapshot) {
      const restored = restoreMultiLocalSnapshotBeforeReplica();
      if (!restored) {
        const fallback = createInitialState({ width: state.width, height: state.height });
        applyHistorySnapshot(fallback);
        history.past = [];
        history.future = [];
        history.pending = null;
        clearTimelapseRecording({ silent: true, scope: 'all' });
        resetDocumentUnsavedChanges();
        updateHistoryButtons();
        markAutosaveDirty();
        scheduleAutosaveSnapshot();
      }
      // Ensure replica-received pixels are overwritten immediately with the pre-join local document.
      markAutosaveDirty();
      try {
        await writeAutosaveSnapshot(true);
      } catch (error) {
        console.warn('Failed to flush autosave after replica disconnect', error);
        scheduleAutosaveSnapshot();
      }
    } else if (!isMultiReplicaRole(disconnectedRole)) {
      clearMultiLocalSnapshotBeforeReplica();
    }
    if (!silent) {
      setMultiStatus(localizeText('共有モード: OFF', 'Collab mode: OFF'), 'info');
    }
    applyMultiRoleUiLocks();
    syncMultiControls();
    renderMultiParticipantsList();
    renderMultiComments();
    syncControlsWithState();
  }

  async function connectMultiSessionAs(role, { allowGuestJoin = false } = {}) {
    setMultiStatus(
      localizeText(
        '旧共有モードは無効です。共有プロジェクトを開いてください。',
        'Legacy collab mode is disabled. Open a shared project instead.'
      ),
      'warn'
    );
    return false;
  }

  function handleMultiLocalCommit(_label = '') {
    const sharedCollaborative = isSharedProjectCollaborativeMode();
    if ((!multiState.connected && !sharedCollaborative) || multiState.applyRemoteInProgress) {
      return;
    }
    const sharedLocalDrawOptions = { allowLocalOpBacklog: true };
    if (sharedCollaborative && !canAcceptSharedProjectLocalDrawOps('', sharedLocalDrawOptions)) {
      const sharedDrawBlockReason = getSharedProjectLocalDrawBlockReason('', sharedLocalDrawOptions);
      const sharedDrawBlockStatus = getSharedProjectDrawBlockStatus(sharedDrawBlockReason);
      logSharedProjectDrawBlock(
        sharedDrawBlockReason || (activeSharedProjectSyncState === 'catching-up'
          ? 'shared-reconnect-required-before-local-commit'
          : 'shared-document-not-ready-before-local-commit'),
        { historyLabel: _label }
      );
      setMultiStatus(sharedDrawBlockStatus.message, sharedDrawBlockStatus.level);
      updateAutosaveStatus(sharedDrawBlockStatus.message, sharedDrawBlockStatus.level);
      requestSharedProjectDrawReadinessRecovery(sharedDrawBlockReason || 'local-commit-blocked').catch(() => {});
      return;
    }
    const useSharedProjectRealtimePrimary = isSharedProjectRealtimePrimaryActive(multiState.projectKey);
    const sharedOpType = classifySharedProjectOpType(_label);
    if (useSharedProjectRealtimePrimary && sharedOpType === 'draw') {
      const drawOpPayload = buildSharedProjectDrawOpPayload(_label);
      if (drawOpPayload) {
        enqueueSharedProjectOperationCommit(resolveSharedProjectKeyForCurrentState(multiState.projectKey), {
          historyLabel: _label,
          opPayload: drawOpPayload,
        });
        if (typeof drawOpPayload.command === 'string' && drawOpPayload.command) {
          clearSharedProjectInFlightStroke();
        }
        if (shouldCreateSharedProjectCheckpoint('draw')) {
          scheduleSharedProjectCheckpoint({ historyLabel: isSharedProjectCheckpointHistoryLabel(_label) ? _label : 'checkpoint' });
        }
        return;
      }
      console.warn('[shared-sync]', {
        event: 'local-draw-op-payload-missing',
        historyLabel: _label,
        projectKey: activeSharedProjectKey || '',
        hasInFlightStroke: Boolean(sharedProjectInFlightStroke),
        inFlightHistoryLabel: String(sharedProjectInFlightStroke?.historyLabel || ''),
        activeCanvasId: getActiveProjectCanvasDocument()?.id || '',
        activeFrame: Math.max(0, Math.round(Number(getActiveProjectCanvasDocument()?.activeFrame ?? state.activeFrame) || 0)),
        activeLayer: getActiveProjectCanvasDocument()?.activeLayer || state.activeLayer || '',
        pendingLocalOps: sharedProjectPendingLocalOps.length,
        inFlightLocalOps: sharedProjectLocalInFlightOps.size,
      });
      scheduleSharedProjectCheckpoint({
        historyLabel: 'local-draw-op-payload-missing',
        force: true,
      });
    }
    if (useSharedProjectRealtimePrimary && sharedOpType === 'palette') {
      const paletteOpPayload = buildSharedProjectPaletteOpPayload(_label);
      if (paletteOpPayload) {
        enqueueSharedProjectOperationCommit(resolveSharedProjectKeyForCurrentState(multiState.projectKey), {
          historyLabel: _label,
          opPayload: paletteOpPayload,
        });
        if (shouldCreateSharedProjectCheckpoint('palette')) {
          scheduleSharedProjectCheckpoint({ historyLabel: 'checkpoint' });
        }
        return;
      }
    }
    if (useSharedProjectRealtimePrimary && sharedOpType === 'structure') {
      const structureOpPayload = buildSharedProjectStructureOpPayload(_label);
      if (structureOpPayload) {
        enqueueSharedProjectOperationCommit(resolveSharedProjectKeyForCurrentState(multiState.projectKey), {
          historyLabel: _label,
          opPayload: structureOpPayload,
        });
        scheduleSharedProjectCheckpoint({
          immediate: false,
          historyLabel: _label === 'addSheet' ? 'structure-checkpoint' : _label,
        });
        return;
      }
    }
    if (isMultiMasterMode()) {
      if (MULTI_LAYER_PATCH_HISTORY_LABELS.has(_label)) {
        markMultiPublicLobbyThumbnailDirty();
        if (!useSharedProjectRealtimePrimary) {
          scheduleMasterLayerPatchSend();
        }
        scheduleMultiPublicLobbyRoomSync({ immediate: false });
        if (!useSharedProjectRealtimePrimary || shouldPersistSharedProjectSnapshotForHistoryLabel(_label, sharedOpType)) {
          queueSharedProjectCurrentSnapshotCapture({
            delayMs: useSharedProjectRealtimePrimary ? SHARED_PROJECT_DEFERRED_PERSIST_DELAY : AUTOSAVE_REMOTE_MULTI_WRITE_DELAY / 2,
            historyLabel: _label,
          });
        }
        return;
      }
      if (MULTI_PALETTE_HISTORY_LABELS.has(_label)) {
        return;
      }
      markMultiPublicLobbyThumbnailDirty();
      if (!useSharedProjectRealtimePrimary) {
        scheduleMultiSessionStateBroadcast({ immediate: false });
      }
      scheduleMultiPublicLobbyRoomSync({ immediate: false });
      if (!useSharedProjectRealtimePrimary || shouldPersistSharedProjectSnapshotForHistoryLabel(_label, sharedOpType)) {
        queueSharedProjectCurrentSnapshotCapture({
          delayMs: useSharedProjectRealtimePrimary ? SHARED_PROJECT_DEFERRED_PERSIST_DELAY : AUTOSAVE_REMOTE_MULTI_WRITE_DELAY / 2,
          historyLabel: _label,
        });
      }
      return;
    }
    if (isMultiGuestMode()) {
      if (MULTI_PALETTE_HISTORY_LABELS.has(_label)) {
        return;
      }
      if (!useSharedProjectRealtimePrimary) {
        scheduleGuestLayerPatchSend();
      }
      if (!useSharedProjectRealtimePrimary || shouldPersistSharedProjectSnapshotForHistoryLabel(_label, sharedOpType)) {
        queueSharedProjectCurrentSnapshotCapture({
          delayMs: useSharedProjectRealtimePrimary ? SHARED_PROJECT_DEFERRED_PERSIST_DELAY : AUTOSAVE_REMOTE_MULTI_WRITE_DELAY / 2,
          historyLabel: _label,
        });
      }
    }
  }



  return Object.freeze({
    clearMultiLayerPatchSnapshots,
    clearMultiLayerPatchSendTimers,
    markRemoteMultiStateDirty,
    createMultiChannelName,
    bindMultiChannelRealtimeHandlers,
    ensureMultiSupabaseClient,
    waitForMultiSubscription,
    sendMultiBroadcast,
    moveLayerTrackForAllFrames,
    insertLayerTrackForAllFrames,
    ensureMasterLayerAssignment,
    findAvailableFrameIndexForTrack,
    appendFrameForMultiAssignment,
    ensureAvailableFrameForTrack,
    assignLayerToGuestClient,
    clearMultiBroadcastTimer,
    clearMultiGuestMovePreview,
    getPendingMultiGuestMovePreview,
    setMultiGuestMovePreview,
    scheduleMultiGuestMovePreview,
    clearMultiGuestStateRecovery,
    sendGuestRecoveryStateToMaster,
    maybeRequestGuestAssignmentSync,
    normalizeMultiBuildVersion,
    handleMultiBuildVersionMismatch,
    recordMultiPeerBuildVersion,
    requestMultiResync,
    normalizeMultiSessionRevision,
    getMultiSharedRoomConfigSnapshot,
    applyMultiSharedRoomConfigFromPayload,
    shouldAcceptIncomingMultiSessionRevision,
    buildMultiSessionStatePayload,
    buildGuestSessionStatePayload,
    broadcastMultiSessionState,
    scheduleMultiSessionStateBroadcast,
    startMultiMasterRecoveryFlow,
    decodeLayerIndicesPayload,
    decodeLayerDirectPayload,
    getMultiLayerPatchStreamKey,
    normalizeMultiPatchSequence,
    normalizeMultiLayerResyncRequestKey,
    createMultiLayerResyncRequestToken,
    getNextMultiLayerPatchSequence,
    commitMultiLayerPatchSequence,
    inspectIncomingMultiLayerPatchSequence,
    markIncomingMultiLayerPatchSequenceApplied,
    consumePendingMultiLayerResyncRequest,
    requestTargetedGuestSessionState,
    captureLayerPatchSnapshot,
    buildLayerDiffPayload,
    decodeLayerDiffPositionsPayload,
    decodeLayerDiffIndicesPayload,
    decodeLayerDiffDirectPayload,
    applyLayerPatchPayloadToLayer,
    clearPendingMultiSessionStateApply,
    shouldDeferMultiSessionStateApply,
    schedulePendingMultiSessionStateApply,
    captureLocalTimelineSelectionSnapshot,
    restoreLocalTimelineSelectionSnapshot,
    applyMultiAuthoritativeDocument,
    applyHistorySnapshotForClient,
    applyHistorySnapshotForSharedLocalCell,
    applyMultiSessionStatePayload,
    flushMasterLayerPatchSendQueue,
    scheduleMasterLayerPatchSend,
    flushGuestLayerPatchSendQueue,
    scheduleGuestLayerPatchSend,
    buildGuestLayerPatchPayload,
    sendGuestLayerPatch,
    buildGuestPaletteUpdatePayload,
    sendGuestPaletteUpdate,
    buildMasterLayerPatchPayload,
    sendMasterLayerPatch,
    refreshMultiParticipantsFromPresence,
    handleMultiCommentMessage,
    handleMultiJoinRequestMessage,
    handleMultiJoinRequestResultMessage,
    handleMultiRoleChangeMessage,
    handleMultiUnassignedGuestJoinIntent,
    handleMultiHelloMessage,
    handleMultiSyncRequestMessage,
    handleMultiSessionStateMessage,
    handleMultiMasterStateRequestMessage,
    handleMultiGuestSessionStateMessage,
    handleMultiGuestPaletteUpdateMessage,
    handleMultiGuestLayerPatchMessage,
    handleMultiMasterLayerPatchMessage,
    handleMultiKickClientMessage,
    disconnectMultiSession,
    connectMultiSessionAs,
    handleMultiLocalCommit,
  });
      }
    })(scope);
  }

  root.sharedProjectRealtimeUtils = Object.freeze({
    createSharedProjectRealtimeUtils,
  });
})();
