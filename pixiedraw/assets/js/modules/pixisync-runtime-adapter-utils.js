(() => {
  'use strict';

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const ROOM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
  const HASH_PATTERN = /^[0-9a-f]{64}$/;
  const CHECKPOINT_BUCKET = 'pixisync-checkpoints';
  const MAX_CHECKPOINT_BYTES = 52428800;
  const COMMENT_MAX_LENGTH = 140;

  function resolvePiXiSyncRecentProjectTarget(entries = [], roomId = '', fallbackProjectKey = '') {
    const normalizedRoomId = String(roomId || '').trim().toLowerCase();
    const fallback = String(fallbackProjectKey || '').trim();
    if (!ROOM_ID_PATTERN.test(normalizedRoomId)) return fallback;
    const match = (Array.isArray(entries) ? entries : []).find(entry => (
      entry
      && typeof entry.id === 'string'
      && entry.id.trim()
      && String(entry.pixisync?.roomId || '').trim().toLowerCase() === normalizedRoomId
    ));
    return String(match?.id || '').trim() || fallback;
  }

  function collectPiXiSyncRecentProjectCleanupEntries(entries = [], nextEntries = [], activeProjectKey = '') {
    const active = String(activeProjectKey || '').trim();
    const retained = new Set((Array.isArray(nextEntries) ? nextEntries : [])
      .map(entry => String(entry?.id || '').trim())
      .filter(Boolean));
    return (Array.isArray(entries) ? entries : []).filter(entry => {
      const projectId = String(entry?.id || '').trim();
      return projectId
        && projectId !== active
        && !retained.has(projectId)
        && Number(entry?.autosaveSchemaVersion) === 2;
    });
  }

  function createPiXiSyncRuntimeAdapter({
    createSession,
    createRealtimeClient,
    runtimeBridge,
    getSupabase,
    refreshSupabaseClient = null,
    captureCheckpoint,
    restoreCheckpoint,
    getProjectKey = () => '',
    getProjectTitle = () => '',
    getParticipantIdentity = () => ({}),
    readProjectBinding = async () => null,
    writeProjectBinding = async () => {},
    clearProjectBinding = async () => {},
    resolveProjectBindingTarget = async ({ projectKey } = {}) => projectKey,
    acquireProjectLease = async () => ({ acquired: true, release: async () => {} }),
    getClientId,
    ensureAuthenticatedStart = async () => true,
    locationRef = window.location,
    operationTimeoutMs = 20000,
    uiEnabled = true,
    onStatus = () => {},
    onError = () => {},
  } = {}) {
    if (
      typeof createSession !== 'function'
      || typeof createRealtimeClient !== 'function'
      || !runtimeBridge?.configure
      || typeof getSupabase !== 'function'
      || typeof captureCheckpoint !== 'function'
      || typeof restoreCheckpoint !== 'function'
      || typeof getClientId !== 'function'
    ) {
      throw new Error('PiXiSYNC runtime: missing dependencies');
    }

    let supabase = null;
    let session = null;
    let realtimeClient = null;
    let manifest = null;
    let roomId = '';
    let role = 'owner';
    let clientId = '';
    let boundProjectKey = '';
    let preserveInitialOwnerDocument = false;
    let initialOwnerBootstrapRevision = null;
    let operationQueue = Promise.resolve();
    let replayedJournalEpoch = -1;
    let disposed = false;
    let unsubscribeSession = null;
    let lifecycleSuspended = false;
    let lifecycleResumeQueued = false;
    let reconnectRetryTimer = 0;
    let reconnectRetryAttempt = 0;
    let consecutiveOpenSessionTimeouts = 0;
    let lastReportedErrorMessage = '';
    let lastReportedErrorAt = 0;
    let suppressedErrorCount = 0;
    let projectLease = null;
    let localReadOnly = false;
    // Once a card has been bound to a room, it must never silently fall back
    // to an editable local document. Keep it draw-locked until the
    // authoritative shared session is active again.
    let projectBindingPersisted = false;
    let reusableInviteToken = '';
    let reusableInviteExpiresAt = '';
    let reusableInvitePersistent = false;
    let replacedProjectKey = '';
    // An owner card can contain the only intact local copy of a legacy room
    // before an obsolete checkpoint replaces it. Capture it before restore so
    // a failed historical tail can be repaired without changing the room URL.
    let ownerRecoveryBlob = null;
    let ownerRecoveryAttempted = false;
    // Supabase may emit CLOSED asynchronously after removeChannel/stop().
    // Those intentional shutdowns must not be fed back into the session as a
    // transport failure while a lifecycle reconnect is already in progress.
    const intentionallyStoppedRealtimeClients = new WeakSet();
    const attestationWaiters = new Map();
    const preparedDocumentCheckpoints = new Map();

    const commands = Object.freeze({
      start,
      join,
      resumeBoundProject,
      createInviteLink,
      createInviteCode,
      sendComment,
      leave,
      archive,
      handleLifecycleResume,
      prepareCheckpointOperation,
    });

    const firstRow = data => Array.isArray(data) ? data[0] : data;
    const toHexBytes = hex => `\\x${String(hex || '').toLowerCase()}`;
    const currentSnapshot = () => session?.getSnapshot?.() || null;
    const currentEpoch = () => Number(currentSnapshot()?.epoch || 0);
    const currentGeneration = () => String(currentSnapshot()?.sessionGeneration || '0');
    const assertRoomId = value => {
      const normalized = String(value || '');
      if (!ROOM_ID_PATTERN.test(normalized)) throw new Error('PiXiSYNC runtime: invalid-room-id');
      return normalized;
    };
    const assertHash = value => {
      const normalized = String(value || '').toLowerCase();
      if (!HASH_PATTERN.test(normalized)) throw new Error('PiXiSYNC runtime: invalid-checkpoint-hash');
      return normalized;
    };
    const assertClientId = value => {
      const normalized = String(value || '');
      if (!ROOM_ID_PATTERN.test(normalized)) throw new Error('PiXiSYNC runtime: invalid-client-id');
      return normalized;
    };
    const normalizeParticipantIdentity = value => {
      const name = String(value?.name || '').trim().slice(0, 32) || '参加者';
      const rawAvatarId = String(value?.avatarId || '').trim().toLowerCase();
      const avatarId = (
        rawAvatarId === 'mao'
        || rawAvatarId === 'baburin'
        || /^jerin[1-8]$/.test(rawAvatarId)
        || /^jellnall(?:[1-9]|1[0-9])$/.test(rawAvatarId)
      ) ? rawAvatarId : 'mao';
      return Object.freeze({ name, avatarId });
    };
    const currentParticipantIdentity = () => normalizeParticipantIdentity(getParticipantIdentity?.());
    const presencePayload = () => ({
      clientId,
      role,
      ...currentParticipantIdentity(),
      onlineAt: new Date().toISOString(),
    });
    const sha256Hex = async blob => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes));
      return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    };
    const withTimeout = async (operation, promise, { onTimeout = null } = {}) => {
      const timeoutMs = Math.max(1000, Number(operationTimeoutMs) || 20000);
      let timer = null;
      try {
        return await Promise.race([
          Promise.resolve(promise),
          new Promise((_, reject) => {
            timer = window.setTimeout(() => {
              reject(new Error(`PiXiSYNC runtime: ${operation}-timeout`));
              try { onTimeout?.(); } catch (_) {}
            }, timeoutMs);
          }),
        ]);
      } finally {
        if (timer !== null) window.clearTimeout(timer);
      }
    };
    const isReconnectablePhase = () => ['active', 'reconnecting'].includes(currentSnapshot()?.phase);
    const clearReconnectRetry = () => {
      if (reconnectRetryTimer) window.clearTimeout(reconnectRetryTimer);
      reconnectRetryTimer = 0;
      reconnectRetryAttempt = 0;
    };
    const scheduleReconnectRetry = reason => {
      if (disposed || lifecycleSuspended || !isReconnectablePhase() || reconnectRetryTimer) return;
      const attempt = reconnectRetryAttempt++;
      const baseDelay = Math.min(30000, 750 * (2 ** Math.min(attempt, 5)));
      const jitter = Math.floor(Math.random() * 250);
      reconnectRetryTimer = window.setTimeout(() => {
        reconnectRetryTimer = 0;
        void handleLifecycleResume(`retry-${reason || 'reconnect'}`);
      }, baseDelay + jitter);
      report({ phase: 'reconnecting', retryInMs: baseDelay + jitter, reason });
    };
    const scheduleBoundProjectResumeRetry = reason => {
      if (disposed || lifecycleSuspended || !projectBindingPersisted || reconnectRetryTimer) return;
      const attempt = reconnectRetryAttempt++;
      const baseDelay = Math.min(30000, 750 * (2 ** Math.min(attempt, 5)));
      const jitter = Math.floor(Math.random() * 250);
      reconnectRetryTimer = window.setTimeout(() => {
        reconnectRetryTimer = 0;
        void resumeBoundProject().catch(() => {});
      }, baseDelay + jitter);
      report({ phase: 'reconnecting', retryInMs: baseDelay + jitter, reason });
    };
    const report = details => {
      if (disposed) return;
      onStatus(details);
      runtimeBridge.refreshUi?.();
    };
    const reportRuntimeError = error => {
      const message = String(error?.message || error || 'unknown');
      const now = Date.now();
      if (message === lastReportedErrorMessage && now - lastReportedErrorAt < 60000) {
        suppressedErrorCount += 1;
        return;
      }
      const repeatedCount = suppressedErrorCount;
      lastReportedErrorMessage = message;
      lastReportedErrorAt = now;
      suppressedErrorCount = 0;
      onError(error, { repeatedCount });
    };
    const normalizeProjectBinding = value => {
      if (!ROOM_ID_PATTERN.test(String(value?.roomId || ''))) return null;
      const projectKey = String(value?.projectKey || '');
      if (!projectKey) return null;
      return Object.freeze({
        roomId: String(value.roomId),
        role: value.role === 'owner' ? 'owner' : 'participant',
        projectKey,
        inviteToken: TOKEN_PATTERN.test(String(value.inviteToken || ''))
          ? String(value.inviteToken).toLowerCase()
          : '',
        inviteExpiresAt: typeof value.inviteExpiresAt === 'string'
          ? value.inviteExpiresAt
          : '',
        invitePersistent: value.invitePersistent === true,
        replacedProjectKey: String(value.replacedProjectKey || '').trim(),
      });
    };
    const persistProjectBinding = async () => {
      const binding = normalizeProjectBinding({
        roomId,
        role,
        projectKey: boundProjectKey,
        inviteToken: role === 'owner' ? reusableInviteToken : '',
        inviteExpiresAt: role === 'owner' ? reusableInviteExpiresAt : '',
        invitePersistent: role === 'owner' && reusableInvitePersistent,
        replacedProjectKey,
      });
      if (!binding) throw new Error('PiXiSYNC runtime: project-binding-unavailable');
      const persisted = await writeProjectBinding(binding.projectKey, binding);
      const persistedProjectKey = String(persisted?.projectKey || persisted || '').trim();
      if (persistedProjectKey) boundProjectKey = persistedProjectKey;
      replacedProjectKey = '';
      projectBindingPersisted = true;
    };
    const resolveBindingTargetForRoom = async () => {
      if (!ROOM_ID_PATTERN.test(roomId) || !boundProjectKey) return boundProjectKey;
      const resolved = await resolveProjectBindingTarget({
        roomId,
        role,
        projectKey: boundProjectKey,
      });
      const nextProjectKey = String(resolved?.projectKey || resolved || '').trim();
      if (!nextProjectKey || nextProjectKey === boundProjectKey) return boundProjectKey;
      replacedProjectKey = boundProjectKey;
      boundProjectKey = nextProjectKey;
      await acquireEditingLease(boundProjectKey);
      configureBridge({ collaboration: false });
      return boundProjectKey;
    };
    const removeProjectBinding = async () => {
      if (boundProjectKey) await clearProjectBinding(boundProjectKey);
      projectBindingPersisted = false;
    };
    const releaseProjectLease = async () => {
      const lease = projectLease;
      projectLease = null;
      localReadOnly = false;
      try { await lease?.release?.(); } catch (_) {}
    };
    const acquireEditingLease = async projectKey => {
      if (projectLease?.projectKey === projectKey) return !localReadOnly;
      await releaseProjectLease();
      const lease = await acquireProjectLease(projectKey);
      localReadOnly = lease?.acquired !== true;
      projectLease = localReadOnly ? null : { projectKey, release: lease.release };
      return !localReadOnly;
    };
    const rpc = async (name, params) => {
      const abortController = typeof window.AbortController === 'function'
        ? new window.AbortController()
        : (typeof AbortController === 'function' ? new AbortController() : null);
      let request = supabase.rpc(name, params);
      if (abortController && typeof request?.abortSignal === 'function') {
        request = request.abortSignal(abortController.signal);
      }
      try {
        const response = await withTimeout(`rpc-${name}`, request, {
          onTimeout: () => abortController?.abort(),
        });
        if (response?.error) throw response.error;
        if (name === 'pixisync_open_session') {
          consecutiveOpenSessionTimeouts = 0;
          lastReportedErrorMessage = '';
          lastReportedErrorAt = 0;
          suppressedErrorCount = 0;
        }
        return response?.data;
      } catch (error) {
        if (
          name === 'pixisync_open_session'
          && /rpc-pixisync_open_session-timeout/.test(String(error?.message || ''))
        ) {
          consecutiveOpenSessionTimeouts += 1;
          if (
            consecutiveOpenSessionTimeouts >= 2
            && typeof refreshSupabaseClient === 'function'
          ) {
            const previousClient = supabase;
            const refreshedClient = await withTimeout(
              'supabase-client-refresh',
              refreshSupabaseClient({
                previousClient,
                roomId,
                reason: error.message,
                consecutiveTimeouts: consecutiveOpenSessionTimeouts,
              })
            );
            if (!refreshedClient?.rpc || !refreshedClient?.storage || !refreshedClient?.channel) {
              throw new Error('PiXiSYNC runtime: invalid-refreshed-supabase-client');
            }
            supabase = refreshedClient;
            consecutiveOpenSessionTimeouts = 0;
            report({
              phase: 'transport-client-refreshed',
              reason: error.message,
              roomId,
            });
          }
        }
        throw error;
      }
    };
    const uploadCheckpoint = async (path, blob, metadata = undefined) => {
      const response = await withTimeout('checkpoint-upload', supabase.storage.from(CHECKPOINT_BUCKET).upload(path, blob, {
        contentType: 'application/octet-stream',
        upsert: false,
        ...(metadata && typeof metadata === 'object' ? { metadata } : {}),
      }));
      if (response?.error) throw response.error;
    };
    const downloadCheckpoint = async path => {
      const response = await withTimeout('checkpoint-download', supabase.storage.from(CHECKPOINT_BUCKET).download(path));
      if (response?.error || !(response?.data instanceof Blob)) {
        throw response?.error || new Error('PiXiSYNC runtime: checkpoint-download-failed');
      }
      return response.data;
    };
    const removeCheckpointObject = async path => {
      const normalizedPath = String(path || '');
      if (!normalizedPath) return;
      const response = await withTimeout(
        'checkpoint-remove',
        supabase.storage.from(CHECKPOINT_BUCKET).remove([normalizedPath])
      );
      if (response?.error) throw response.error;
    };

    function attachPreparedDocumentMarker(operation, key, value) {
      const prepared = { ...(operation?.documentOperation || {}) };
      Object.defineProperty(prepared, key, {
        value: Object.freeze(value), enumerable: false, configurable: false,
      });
      operation.documentOperation = prepared;
      return prepared;
    }

    async function prepareConfirmedDocumentOperation(operation, metadata = {}) {
      const documentOperation = operation?.documentOperation;
      if (documentOperation?.type === 'raster_region_set') {
        const reference = documentOperation.asset;
        const objectPath = String(reference?.objectPath || '');
        const expectedHash = assertHash(reference?.sha256Hex);
        const expectedBytes = Number(reference?.byteLength);
        if (
          !objectPath.startsWith(`rooms/${roomId}/raster-assets/`)
          || reference?.codecVersion !== 1
          || reference?.pixelFormat !== 'indexed-mask-v1'
          || !Number.isSafeInteger(expectedBytes)
          || expectedBytes < 1
          || expectedBytes > MAX_CHECKPOINT_BYTES
        ) throw new Error('PiXiSYNC runtime: invalid-raster-region-reference');
        const blob = await downloadCheckpoint(objectPath);
        if (blob.size !== expectedBytes || await sha256Hex(blob) !== expectedHash) {
          throw new Error('PiXiSYNC runtime: raster-region-hash-mismatch');
        }
        const decoded = window.PiXiEEDrawModules?.pixisyncRasterRegionAssetUtils
          ?.decode?.(new Uint8Array(await blob.arrayBuffer()));
        if (!decoded
          || decoded.rect?.x !== documentOperation.x || decoded.rect?.y !== documentOperation.y
          || decoded.rect?.width !== documentOperation.width || decoded.rect?.height !== documentOperation.height) {
          throw new Error('PiXiSYNC runtime: raster-region-shape-mismatch');
        }
        attachPreparedDocumentMarker(operation, 'preparedRasterRegion', { ...decoded, verified: true });
        return;
      }
      if (documentOperation?.type === 'structure_delta'
        && ['raster_restore', 'canvas_resize_restore'].includes(documentOperation?.action)) {
        const reference = documentOperation?.data?.inverseAsset;
        const objectPath = String(reference?.objectPath || '');
        const expectedHash = assertHash(reference?.sha256Hex);
        const expectedBytes = Number(reference?.byteLength);
        if (
          !objectPath.startsWith(`rooms/${roomId}/document-checkpoints/`)
          || !Number.isSafeInteger(expectedBytes)
          || expectedBytes < 1
          || expectedBytes > MAX_CHECKPOINT_BYTES
        ) throw new Error('PiXiSYNC runtime: invalid-document-raster-asset-reference');
        const blob = await downloadCheckpoint(objectPath);
        if (blob.size !== expectedBytes || await sha256Hex(blob) !== expectedHash) {
          throw new Error('PiXiSYNC runtime: document-raster-asset-hash-mismatch');
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const asset = window.PiXiEEDrawModules?.pixisyncRasterAssetUtils?.decode?.(bytes);
        if (!asset) throw new Error('PiXiSYNC runtime: invalid-document-raster-asset');
        attachPreparedDocumentMarker(operation, 'preparedRasterAsset', asset);
        return;
      }
      if (documentOperation?.type !== 'checkpoint_restore') return;
      const operationId = String(operation?.operationId || '');
      const objectPath = String(documentOperation.objectPath || '');
      const expectedHash = assertHash(documentOperation.sha256Hex);
      const expectedBytes = Number(documentOperation.byteLength);
      if (
        !ROOM_ID_PATTERN.test(operationId)
        || !objectPath.startsWith(`rooms/${roomId}/document-checkpoints/`)
        || !Number.isSafeInteger(expectedBytes)
        || expectedBytes < 1
        || expectedBytes > MAX_CHECKPOINT_BYTES
      ) throw new Error('PiXiSYNC runtime: invalid-document-checkpoint-reference');
      const cached = preparedDocumentCheckpoints.get(operationId);
      const blob = cached?.blob instanceof Blob ? cached.blob : await downloadCheckpoint(objectPath);
      if (blob.size !== expectedBytes || await sha256Hex(blob) !== expectedHash) {
        preparedDocumentCheckpoints.delete(operationId);
        throw new Error('PiXiSYNC runtime: document-checkpoint-hash-mismatch');
      }
      if (metadata.local === true && cached?.direction === 'forward') {
        preparedDocumentCheckpoints.delete(operationId);
        attachPreparedDocumentMarker(operation, 'preparedCheckpoint', {
            verified: true,
            applied: true,
            alreadyLocal: true,
            objectPath,
        });
        return;
      }
      runtimeBridge.setInputLocked?.(true);
      try {
        await restoreCheckpoint(blob, {
          projectKey: boundProjectKey,
          role,
          preserveProjectIdentity: true,
          operationId,
          documentCheckpoint: true,
        });
        attachPreparedDocumentMarker(operation, 'preparedCheckpoint', { verified: true, applied: true, objectPath });
      } finally {
        preparedDocumentCheckpoints.delete(operationId);
        runtimeBridge.setInputLocked?.(currentSnapshot()?.phase !== 'active' || localReadOnly);
      }
    }

    async function cleanupStaleDocumentCheckpointUploads() {
      const stale = await rpc('pixisync_list_stale_document_checkpoint_uploads', {
        p_room_id: roomId,
        p_limit: 16,
      }).catch(() => []);
      for (const row of Array.isArray(stale) ? stale : []) {
        const uploadId = String(row?.upload_id || '');
        const path = String(row?.storage_path || '');
        if (!ROOM_ID_PATTERN.test(uploadId) || !path) continue;
        await cleanupDocumentCheckpointUpload(uploadId, path).catch(() => {});
      }
    }

    async function cleanupDocumentCheckpointUpload(uploadId, expectedPath = '') {
      const claimed = firstRow(await rpc('pixisync_abort_document_checkpoint_upload', {
        p_room_id: roomId,
        p_upload_id: uploadId,
      }));
      const claimedPath = String(claimed?.storage_path || '');
      if (!claimedPath) return false;
      if (expectedPath && claimedPath !== expectedPath) {
        throw new Error('PiXiSYNC runtime: document-checkpoint-cleanup-path-mismatch');
      }
      await removeCheckpointObject(claimedPath);
      await rpc('pixisync_finalize_document_checkpoint_upload_cleanup', {
        p_room_id: roomId,
        p_upload_id: uploadId,
      });
      return true;
    }

    async function prepareCheckpointOperation({
      operationId,
      structureEpoch,
      captureContext = null,
      direction = 'forward',
    } = {}) {
      if (!session?.canDraw?.() || !realtimeClient || localReadOnly) {
        throw new Error('PiXiSYNC runtime: active-editor-required');
      }
      const normalizedOperationId = String(operationId || '');
      const normalizedEpoch = Number(structureEpoch);
      if (!ROOM_ID_PATTERN.test(normalizedOperationId) || !Number.isSafeInteger(normalizedEpoch) || normalizedEpoch < 0) {
        throw new Error('PiXiSYNC runtime: invalid-document-checkpoint-request');
      }
      if (realtimeClient.pendingOperationCount) {
        throw new Error('PiXiSYNC runtime: pending-operations-remain');
      }
      void cleanupStaleDocumentCheckpointUploads();
      const baseRevision = realtimeClient.confirmedRevision;
      const blob = await captureCheckpoint(captureContext);
      if (!(blob instanceof Blob) || blob.size < 1 || blob.size > MAX_CHECKPOINT_BYTES) {
        throw new Error('PiXiSYNC runtime: document-checkpoint-size-out-of-range');
      }
      const stateHash = await sha256Hex(blob);
      const prepared = firstRow(await rpc('pixisync_prepare_document_checkpoint_upload', {
        p_room_id: roomId,
        p_upload_id: normalizedOperationId,
        p_client_id: clientId,
        p_base_revision: baseRevision.toString(),
        p_structure_epoch: normalizedEpoch,
        p_state_sha256: toHexBytes(stateHash),
        p_encoded_bytes: blob.size,
        p_codec_version: 1,
      }));
      const objectPath = String(prepared?.storage_path || '');
      if (!objectPath.startsWith(`rooms/${roomId}/document-checkpoints/`)) {
        await cleanupDocumentCheckpointUpload(normalizedOperationId).catch(() => {});
        throw new Error('PiXiSYNC runtime: invalid-document-checkpoint-path');
      }
      preparedDocumentCheckpoints.set(normalizedOperationId, {
        blob,
        direction: direction === 'undo' || direction === 'redo' ? direction : 'forward',
      });
      try {
        await uploadCheckpoint(objectPath, blob);
        const documentOperation = Object.freeze({
          version: 1,
          type: 'checkpoint_restore',
          objectPath,
          sha256Hex: stateHash,
          byteLength: blob.size,
        });
        return {
          documentOperation,
          cleanup: async () => {
            preparedDocumentCheckpoints.delete(normalizedOperationId);
            await cleanupDocumentCheckpointUpload(normalizedOperationId, objectPath).catch(() => {});
          },
        };
      } catch (error) {
        preparedDocumentCheckpoints.delete(normalizedOperationId);
        await cleanupDocumentCheckpointUpload(normalizedOperationId, objectPath).catch(() => {});
        throw error;
      }
    }

    // A semantic delta may need to preserve only the raster that would
    // otherwise be discarded (for example a cropped edge band). It uses the
    // same authenticated, exact-revision staging lifecycle as a checkpoint,
    // but the object itself is a small immutable raster asset rather than a
    // full document. The operation trigger binds it to operationId exactly
    // once before it becomes visible to peers.
    async function prepareDocumentRasterAsset({ operationId, structureEpoch, blob } = {}) {
      if (!session?.canDraw?.() || !realtimeClient || localReadOnly) {
        throw new Error('PiXiSYNC runtime: active-editor-required');
      }
      const normalizedOperationId = String(operationId || '');
      const normalizedEpoch = Number(structureEpoch);
      if (!ROOM_ID_PATTERN.test(normalizedOperationId) || !Number.isSafeInteger(normalizedEpoch) || normalizedEpoch < 0) {
        throw new Error('PiXiSYNC runtime: invalid-document-raster-asset-request');
      }
      if (!(blob instanceof Blob) || blob.size < 1 || blob.size > MAX_CHECKPOINT_BYTES) {
        throw new Error('PiXiSYNC runtime: document-raster-asset-size-out-of-range');
      }
      if (realtimeClient.pendingOperationCount) throw new Error('PiXiSYNC runtime: pending-operations-remain');
      const baseRevision = realtimeClient.confirmedRevision;
      const sha256HexValue = await sha256Hex(blob);
      const prepared = firstRow(await rpc('pixisync_prepare_document_checkpoint_upload', {
        p_room_id: roomId,
        p_upload_id: normalizedOperationId,
        p_client_id: clientId,
        p_base_revision: baseRevision.toString(),
        p_structure_epoch: normalizedEpoch,
        p_state_sha256: toHexBytes(sha256HexValue),
        p_encoded_bytes: blob.size,
        p_codec_version: 1,
      }));
      const objectPath = String(prepared?.storage_path || '');
      if (!objectPath.startsWith(`rooms/${roomId}/document-checkpoints/`)) {
        await cleanupDocumentCheckpointUpload(normalizedOperationId).catch(() => {});
        throw new Error('PiXiSYNC runtime: invalid-document-raster-asset-path');
      }
      try {
        await uploadCheckpoint(objectPath, blob);
        return {
          rasterAsset: Object.freeze({ objectPath, sha256Hex: sha256HexValue, byteLength: blob.size, codecVersion: 1 }),
          cleanup: async () => cleanupDocumentCheckpointUpload(normalizedOperationId, objectPath).catch(() => {}),
        };
      } catch (error) {
        await cleanupDocumentCheckpointUpload(normalizedOperationId, objectPath).catch(() => {});
        throw error;
      }
    }

    async function cleanupRasterRegionUpload(uploadId, objectPath = '') {
      const claimed = firstRow(await rpc('pixisync_abort_raster_region_upload', {
        p_room_id: roomId,
        p_upload_id: uploadId,
      }).catch(() => null));
      const claimedPath = String(claimed?.storage_path || '');
      // The abort RPC returns no row once an asset is committed. Never fall
      // back to the caller path: doing so can delete an immutable object that
      // an already-confirmed revision references.
      if (!claimedPath) return false;
      if (objectPath && claimedPath !== objectPath) {
        throw new Error('PiXiSYNC runtime: raster-region-cleanup-path-mismatch');
      }
      await removeCheckpointObject(claimedPath);
      await rpc('pixisync_finalize_raster_region_upload_cleanup', {
        p_room_id: roomId,
        p_upload_id: uploadId,
      });
      return true;
    }

    async function prepareRasterRegionAsset({ operationId, structureEpoch, region } = {}) {
      if (!session?.canDraw?.() || !realtimeClient || localReadOnly) {
        throw new Error('PiXiSYNC runtime: active-editor-required');
      }
      const normalizedOperationId = String(operationId || '');
      const normalizedEpoch = Number(structureEpoch);
      const bytes = region?.bytes;
      const rect = region?.rect;
      if (!ROOM_ID_PATTERN.test(normalizedOperationId)
        || !Number.isSafeInteger(normalizedEpoch) || normalizedEpoch < 0
        || !(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX_CHECKPOINT_BYTES
        || region?.pixelFormat !== 'indexed-mask-v1' || !rect) {
        throw new Error('PiXiSYNC runtime: invalid-raster-region-request');
      }
      if (realtimeClient.pendingOperationCount) throw new Error('PiXiSYNC runtime: pending-operations-remain');
      const blob = new Blob([bytes], { type: 'application/octet-stream' });
      const assetHash = await sha256Hex(blob);
      const baseRevision = realtimeClient.confirmedRevision;
      const prepared = firstRow(await rpc('pixisync_prepare_raster_region_upload', {
        p_room_id: roomId,
        p_upload_id: normalizedOperationId,
        p_client_id: clientId,
        p_base_revision: baseRevision.toString(),
        p_structure_epoch: normalizedEpoch,
        p_canvas_id: String(region.canvasId || ''),
        p_frame_id: String(region.frameId || ''),
        p_layer_id: String(region.layerId || ''),
        p_canvas_width: Number(region.canvasWidth),
        p_canvas_height: Number(region.canvasHeight),
        p_x: Number(rect.x), p_y: Number(rect.y),
        p_width: Number(rect.width), p_height: Number(rect.height),
        p_asset_sha256: toHexBytes(assetHash),
        p_encoded_bytes: blob.size,
        p_codec_version: 1,
        p_pixel_format: 'indexed-mask-v1',
      }));
      const objectPath = String(prepared?.storage_path || '');
      if (!objectPath.startsWith(`rooms/${roomId}/raster-assets/`) || !objectPath.endsWith('.pxra')) {
        await cleanupRasterRegionUpload(normalizedOperationId, objectPath).catch(() => {});
        throw new Error('PiXiSYNC runtime: invalid-raster-region-path');
      }
      try {
        await uploadCheckpoint(objectPath, blob, { sha256Hex: assetHash });
        return {
          documentOperation: Object.freeze({
            version: 1,
            type: 'raster_region_set',
            canvasId: String(region.canvasId), frameId: String(region.frameId), layerId: String(region.layerId),
            canvasWidth: Number(region.canvasWidth), canvasHeight: Number(region.canvasHeight),
            x: Number(rect.x), y: Number(rect.y), width: Number(rect.width), height: Number(rect.height),
            asset: Object.freeze({
              objectPath, sha256Hex: assetHash, byteLength: blob.size,
              codecVersion: 1, pixelFormat: 'indexed-mask-v1',
            }),
          }),
          cleanup: async () => cleanupRasterRegionUpload(normalizedOperationId, objectPath),
        };
      } catch (error) {
        await cleanupRasterRegionUpload(normalizedOperationId, objectPath).catch(() => {});
        throw error;
      }
    }

    async function requestAuthoritativeRecovery(reason = 'document-operation-recovery') {
      if (!session || disposed || !isReconnectablePhase()) return false;
      runtimeBridge.setInputLocked?.(true);
      await enqueue({
        type: 'FORCE_FULL_RESYNC',
        epoch: currentEpoch(),
        reason: String(reason || 'document-operation-recovery'),
      });
      return true;
    }

    function configureBridge({ collaboration = Boolean(realtimeClient) } = {}) {
      if (disposed) return false;
      runtimeBridge.configure({
        session,
        realtimeClient: collaboration ? realtimeClient : null,
        structureEpoch: Number(manifest?.structure_epoch || 0),
        commands,
        prepareCheckpointOperation,
        prepareDocumentRasterAsset,
        prepareRasterRegionAsset,
        requestAuthoritativeRecovery,
        participants: [],
        localReadOnly,
        localReadOnlyMessage: localReadOnly ? 'このプロジェクトは別のタブで編集中です。この画面は閲覧専用です。' : '',
        uiEnabled,
        consumeInviteFromUrl: false,
      });
      return true;
    }

    function installSession(nextRole, { resumeAvailable = false } = {}) {
      if (disposed) throw new Error('PiXiSYNC runtime: disposed');
      unsubscribeSession?.();
      role = nextRole === 'owner' ? 'owner' : 'participant';
      session = createSession({ role, resumeAvailable });
      const applySessionSnapshot = snapshot => {
        // The collaboration controller is installed only after a channel is
        // available. Keep canvas input locked throughout every transition so
        // a start/resume cannot create an unsynchronised local stroke.
        const phaseAllowsLocalInput = ['local', 'invited', 'left', 'archived', 'active'].includes(snapshot.phase);
        const boundSharedCardIsInactive = projectBindingPersisted && snapshot.phase !== 'active';
        runtimeBridge.setInputLocked?.(!phaseAllowsLocalInput || boundSharedCardIsInactive);
        if (snapshot.phase === 'active') clearReconnectRetry();
        report({
          phase: snapshot.phase,
          roomId: snapshot.roomId,
          revision: snapshot.appliedRevision,
          authoritativeRevision: snapshot.authoritativeRevision,
          drawingAllowed: session.canDraw?.() === true,
          localReadOnly,
          lifecycleSuspended,
          realtimeConnected: Boolean(realtimeClient),
        });
      };
      unsubscribeSession = session.subscribe(applySessionSnapshot);
      configureBridge({ collaboration: false });
      // subscribe() reports transitions only. Apply the initial invited/local
      // state now so a persisted shared card cannot be edited between open and
      // the first network transition.
      applySessionSnapshot(currentSnapshot());
      return session;
    }

    async function ensureSupabase() {
      if (!supabase) supabase = await getSupabase();
      if (!supabase?.rpc || !supabase?.storage || !supabase?.channel) {
        throw new Error('PiXiSYNC runtime: invalid-supabase-client');
      }
      clientId = assertClientId(await getClientId());
      return supabase;
    }

    async function openManifest(targetRoomId) {
      const row = firstRow(await rpc('pixisync_open_session', { p_room_id: assertRoomId(targetRoomId) }));
      if (!row) throw new Error('PiXiSYNC runtime: session-manifest-missing');
      if (
        String(row.status) !== 'active'
        || !ROOM_ID_PATTERN.test(String(row.room_id || ''))
        || !HASH_PATTERN.test(String(row.state_sha256_hex || ''))
      ) {
        throw new Error('PiXiSYNC runtime: invalid-session-manifest');
      }
      manifest = row;
      roomId = String(row.room_id);
      return row;
    }

    async function dispatchNow(event) {
      if (!session || disposed) return null;
      const result = session.dispatch(event);
      runtimeBridge.refreshUi?.();
      for (const effect of result.effects || []) {
        await runEffect(effect);
      }
      return result;
    }

    function enqueue(event) {
      operationQueue = operationQueue
        .then(() => dispatchNow(event))
        .catch(async error => {
          reportRuntimeError(error);
          report({ phase: 'error', error: error?.message || 'unknown' });
          if (
            session
            && role !== 'owner'
            && /active_session_not_available|membership_revoked|permission|row-level security/i
              .test(String(error?.message || ''))
          ) {
            await dispatchNow({ type: 'ROOM_ACCESS_REVOKED', epoch: currentEpoch() });
          }
          if (isReconnectablePhase()) scheduleReconnectRetry(error?.message || 'runtime-error');
        });
      return operationQueue;
    }

    async function createRealtime() {
      const previousRealtime = realtimeClient;
      if (previousRealtime) {
        intentionallyStoppedRealtimeClients.add(previousRealtime);
        realtimeClient = null;
        await previousRealtime.stop().catch(() => {});
      }
      let createdRealtime = null;
      const repairLegacyTailFromOwnerSnapshot = async details => {
        if (
          ownerRecoveryAttempted
          || role !== 'owner'
          || !(ownerRecoveryBlob instanceof Blob)
          || ownerRecoveryBlob.size < 1
          || !manifest?.head_revision
        ) return false;
        ownerRecoveryAttempted = true;
        const checkpointId = window.crypto?.randomUUID?.();
        if (!ROOM_ID_PATTERN.test(String(checkpointId || ''))) return false;
        try {
          const stateHash = await sha256Hex(ownerRecoveryBlob);
          const prepared = firstRow(await rpc('pixisync_prepare_checkpoint', {
            p_room_id: roomId,
            p_checkpoint_id: checkpointId,
            p_state_sha256: toHexBytes(stateHash),
            p_encoded_bytes: ownerRecoveryBlob.size,
            p_codec_version: 1,
          }));
          // The head is locked by prepare_checkpoint. If another editor won a
          // revision while uploading, registration rejects this snapshot
          // instead of installing a stale owner document.
          await uploadCheckpoint(String(prepared?.storage_path || ''), ownerRecoveryBlob);
          await rpc('pixisync_register_checkpoint', {
            p_room_id: roomId,
            p_checkpoint_id: checkpointId,
          });
          let attested = firstRow(await rpc('pixisync_attest_checkpoint', {
            p_checkpoint_id: checkpointId,
            p_client_id: clientId,
            p_state_sha256: toHexBytes(stateHash),
          }));
          if (attested?.status !== 'verified') {
            const waitForPeer = waitForAttestation(checkpointId);
            await realtimeClient?.sendBroadcast?.('checkpoint-attestation-request', {
              checkpointId,
              storagePath: prepared.storage_path,
              stateSha256: stateHash,
              encodedBytes: ownerRecoveryBlob.size,
              revision: String(prepared.revision),
            });
            await waitForPeer;
            attested = firstRow(await rpc('pixisync_attest_checkpoint', {
              p_checkpoint_id: checkpointId,
              p_client_id: clientId,
              p_state_sha256: toHexBytes(stateHash),
            }));
          }
          if (attested?.status !== 'verified') throw new Error('PiXiSYNC runtime: recovery-checkpoint-attestation-incomplete');
          const activated = firstRow(await rpc('pixisync_activate_verified_checkpoint', {
            p_room_id: roomId,
            p_checkpoint_id: checkpointId,
          }));
          manifest = {
            ...(manifest || {}),
            checkpoint_revision: String(activated?.checkpoint_revision || prepared.revision),
            head_revision: String(activated?.head_revision || prepared.revision),
            structure_epoch: String(activated?.structure_epoch || manifest?.structure_epoch || 0),
          };
          ownerRecoveryBlob = null;
          report({
            phase: 'legacy-tail-recovered',
            roomId,
            checkpointRevision: String(manifest.checkpoint_revision),
            reason: String(details?.reason || 'recovery-required'),
          });
          return true;
        } catch (error) {
          reportRuntimeError(error);
          report({ phase: 'legacy-tail-recovery-failed', roomId, error: error?.message || 'unknown' });
          return false;
        }
      };
      const promoteConfirmedDocumentCheckpoint = async operation => {
        if (
          operation?.kind !== 'document_patch'
          || operation?.documentOperation?.type !== 'checkpoint_restore'
          || !ROOM_ID_PATTERN.test(String(operation?.operationId || ''))
        ) return false;
        try {
          const promoted = firstRow(await rpc('pixisync_promote_document_checkpoint', {
            p_room_id: roomId,
            p_upload_id: String(operation.operationId),
          }));
          if (promoted?.checkpoint_revision !== undefined) {
            manifest = {
              ...(manifest || {}),
              checkpoint_revision: String(promoted.checkpoint_revision),
              head_revision: String(promoted.head_revision),
              structure_epoch: String(promoted.structure_epoch),
            };
          }
          report({
            phase: 'document-checkpoint-promoted',
            roomId,
            checkpointRevision: String(promoted?.checkpoint_revision || operation.revision || ''),
          });
          return true;
        } catch (error) {
          // The operation is already ordered and durable. Promotion only
          // compacts future opens, so a transient failure must never reject a
          // confirmed edit or roll the local document back.
          reportRuntimeError(error);
          return false;
        }
      };
      createdRealtime = createRealtimeClient({
        supabase,
        roomId,
        clientId,
        initialRevision: String(manifest?.checkpoint_revision || 0),
        recoverOnSubscribe: false,
        operationTimeoutMs,
        applyConfirmed: (operation, metadata) => runtimeBridge.applyConfirmed(operation, metadata),
        onLocalConfirmed: operation => { void promoteConfirmedDocumentCheckpoint(operation); },
        prepareConfirmed: (operation, metadata) => prepareConfirmedDocumentOperation(operation, metadata),
        onChannelStatus: status => {
          if (
            realtimeClient !== createdRealtime
            || intentionallyStoppedRealtimeClients.has(createdRealtime)
          ) return;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            void enqueue({ type: 'CHANNEL_CLOSED', epoch: currentEpoch() });
          }
        },
        onBroadcast: (event, payload) => {
          if (realtimeClient !== createdRealtime) return;
          if (event === 'session-archived') {
            void enqueue({ type: 'ROOM_ARCHIVED', epoch: currentEpoch() });
          } else if (event === 'pixisync-comment') {
            const comment = normalizeComment(payload);
            if (comment && comment.senderClientId !== clientId) {
              runtimeBridge.receiveComment?.(comment);
            }
          } else if (event === 'checkpoint-attestation-request') {
            void attestRemoteCheckpoint(payload).catch(onError);
          } else if (event === 'checkpoint-attested') {
            attestationWaiters.get(String(payload?.checkpointId || ''))?.();
          }
        },
        onPresenceChange: entries => {
          if (realtimeClient !== createdRealtime) return;
          const seen = new Set();
          const participants = [];
          for (const entry of Array.isArray(entries) ? entries : []) {
            const participantClientId = String(entry?.clientId || '');
            if (!ROOM_ID_PATTERN.test(participantClientId) || seen.has(participantClientId)) continue;
            seen.add(participantClientId);
            const participantRole = entry?.role === 'owner' ? 'owner' : 'editor';
            participants.push({
              id: participantClientId,
              name: participantClientId === clientId
                ? `${String(entry?.name || currentParticipantIdentity().name)}（自分）`
                : String(entry?.name || (participantRole === 'owner' ? 'Owner' : 'Editor')),
              avatarId: String(entry?.avatarId || 'mao'),
              role: participantRole,
              connection: 'online',
            });
          }
          runtimeBridge.updateParticipants?.(participants);
        },
        onRecoveryRequired: details => {
          if (realtimeClient !== createdRealtime) return;
          reportRuntimeError(details?.error || new Error(details?.reason || 'recovery-required'));
          void repairLegacyTailFromOwnerSnapshot(details).then(repaired => {
            void enqueue({
              type: repaired ? 'FORCE_FULL_RESYNC' : 'GAP_DETECTED',
              epoch: currentEpoch(),
            });
          });
        },
      });
      realtimeClient = createdRealtime;
      return realtimeClient;
    }

    async function handleLifecycleSuspend(reason = 'hidden') {
      lifecycleSuspended = true;
      clearReconnectRetry();
      if (!isReconnectablePhase()) return false;
      // Do not await reconnect work while the page is being frozen.  Move the
      // state machine to its draw-locked state now; pageshow/visibility will
      // start the authoritative reconnect path.
      session.dispatch({ type: 'SOCKET_OFFLINE', epoch: currentEpoch(), reason });
      runtimeBridge.refreshUi?.();
      void realtimeClient?.untrackPresence?.().catch(() => {});
      const stoppingRealtime = realtimeClient;
      if (stoppingRealtime) {
        intentionallyStoppedRealtimeClients.add(stoppingRealtime);
        void stoppingRealtime.stop?.().catch(() => {});
      }
      return true;
    }

    async function handleLifecycleResume(reason = 'visible') {
      const wasSuspended = lifecycleSuspended;
      lifecycleSuspended = false;
      const phase = currentSnapshot()?.phase;
      // focus/pageshow/online may all fire for the same healthy foreground
      // page. They are visibility hints, not proof that the socket was lost.
      // Reconnect only after an actual suspend/offline transition, or while a
      // previous reconnect is still incomplete.
      if (
        !isReconnectablePhase()
        || lifecycleResumeQueued
        || (phase === 'active' && !wasSuspended)
      ) return false;
      lifecycleResumeQueued = true;
      try {
        await enqueue({ type: 'SOCKET_OFFLINE', epoch: currentEpoch(), reason });
        return true;
      } finally {
        lifecycleResumeQueued = false;
      }
    }

    async function runEffect(effect) {
      if (!effect || disposed) return;
      const effectEpoch = Number(effect.epoch ?? currentEpoch());
      switch (effect.type) {
        case 'OPEN_PRIVATE_CHANNEL':
          await createRealtime();
          await withTimeout('realtime-subscribe', realtimeClient.start());
          await withTimeout('presence-track', realtimeClient.trackPresence(presencePayload()));
          await dispatchNow({
            type: 'CHANNEL_SUBSCRIBED',
            epoch: effectEpoch,
            generation: currentGeneration(),
            topic: effect.topic,
            private: effect.private === true,
          });
          break;
        case 'LOAD_CHECKPOINT': {
          manifest = await openManifest(roomId);
          if (preserveInitialOwnerDocument) {
            // The owner has just serialized this exact document as revision 0.
            // Reloading it creates a new local working-copy ID and can replace
            // the visible frame/layer with an empty import. Keep the original
            // card and only begin the authoritative tail from revision 0.
            preserveInitialOwnerDocument = false;
            configureBridge();
            // The owner is already showing the exact document serialized into
            // the initial checkpoint. Do not reset the canvas/controller here;
            // doing so can roll the visible drawing back before tail sync.
            realtimeClient.resetConfirmedRevision(manifest.checkpoint_revision);
            initialOwnerBootstrapRevision = String(manifest.checkpoint_revision);
            await dispatchNow({
              type: 'CHECKPOINT_LOADED',
              epoch: effectEpoch,
              generation: currentGeneration(),
              revision: String(manifest.checkpoint_revision),
            });
            break;
          }
          if (role === 'owner' && !ownerRecoveryBlob) {
            const localSnapshot = await captureCheckpoint();
            if (localSnapshot instanceof Blob && localSnapshot.size > 0 && localSnapshot.size <= MAX_CHECKPOINT_BYTES) {
              ownerRecoveryBlob = localSnapshot;
            }
          }
          const blob = await downloadCheckpoint(String(manifest.storage_path || ''));
          if (blob.size !== Number(manifest.encoded_bytes) || await sha256Hex(blob) !== assertHash(manifest.state_sha256_hex)) {
            await dispatchNow({ type: 'HASH_MISMATCH', epoch: effectEpoch });
            return;
          }
          configureBridge();
          runtimeBridge.beginAuthoritativeResync?.(manifest.checkpoint_revision);
          await restoreCheckpoint(blob, {
            projectKey: boundProjectKey,
            role,
            preserveProjectIdentity: true,
          });
          realtimeClient.resetConfirmedRevision(manifest.checkpoint_revision);
          await dispatchNow({
            type: 'CHECKPOINT_LOADED',
            epoch: effectEpoch,
            generation: currentGeneration(),
            revision: String(manifest.checkpoint_revision),
          });
          break;
        }
        case 'FETCH_INITIAL_TAIL': {
          if (
            initialOwnerBootstrapRevision !== null
            && String(effect.afterRevision) === initialOwnerBootstrapRevision
          ) {
            await dispatchNow({
              type: 'INITIAL_TAIL_APPLIED',
              epoch: effectEpoch,
              generation: currentGeneration(),
              revision: initialOwnerBootstrapRevision,
            });
            break;
          }
          initialOwnerBootstrapRevision = null;
          const revision = await realtimeClient.syncFrom(effect.afterRevision);
          runtimeBridge.reapplyPendingAfterResync?.();
          await dispatchNow({
            type: 'INITIAL_TAIL_APPLIED',
            epoch: effectEpoch,
            generation: currentGeneration(),
            revision: revision.toString(),
          });
          break;
        }
        case 'READ_AUTHORITATIVE_HEAD': {
          if (initialOwnerBootstrapRevision !== null) {
            await dispatchNow({
              type: 'AUTHORITATIVE_HEAD',
              epoch: effectEpoch,
              generation: currentGeneration(),
              revision: initialOwnerBootstrapRevision,
            });
            break;
          }
          if (replayedJournalEpoch !== effectEpoch) {
            replayedJournalEpoch = effectEpoch;
            await realtimeClient.replayPendingJournal();
          }
          manifest = await openManifest(roomId);
          await dispatchNow({
            type: 'AUTHORITATIVE_HEAD',
            epoch: effectEpoch,
            generation: currentGeneration(),
            revision: String(manifest.head_revision),
          });
          break;
        }
        case 'FETCH_RETAIL': {
          if (
            initialOwnerBootstrapRevision !== null
            && String(effect.afterRevision) === initialOwnerBootstrapRevision
          ) {
            const revision = initialOwnerBootstrapRevision;
            initialOwnerBootstrapRevision = null;
            report({
              phase: 'initial-owner-bootstrap-complete',
              roomId,
              revision,
            });
            await dispatchNow({
              type: 'RETAIL_APPLIED',
              epoch: effectEpoch,
              generation: currentGeneration(),
              revision,
            });
            break;
          }
          initialOwnerBootstrapRevision = null;
          const revision = await realtimeClient.syncFrom(effect.afterRevision);
          await dispatchNow({
            type: 'RETAIL_APPLIED',
            epoch: effectEpoch,
            generation: currentGeneration(),
            revision: revision.toString(),
          });
          break;
        }
        case 'SYNC_ACTIVE':
          await persistProjectBinding();
          configureBridge();
          clearReconnectRetry();
          break;
        case 'RECONNECT_CHANNEL':
          manifest = await openManifest(roomId);
          await createRealtime();
          await withTimeout('realtime-reconnect', realtimeClient.start());
          await withTimeout('presence-retrack', realtimeClient.trackPresence(presencePayload()));
          await dispatchNow({
            type: 'CHANNEL_SUBSCRIBED',
            epoch: effectEpoch,
            generation: currentGeneration(),
            topic: `pixisync:room:${roomId}`,
            private: true,
          });
          break;
        case 'FLUSH_PENDING':
          if (realtimeClient?.pendingOperationCount) throw new Error('PiXiSYNC runtime: pending-operations-remain');
          break;
        case 'STOP_PRESENCE':
          await realtimeClient?.untrackPresence?.().catch(() => {});
          break;
        case 'REMOVE_CHANNEL':
          await realtimeClient?.stop?.().catch(() => {});
          realtimeClient = null;
          configureBridge({ collaboration: false });
          break;
        case 'QUARANTINE_PENDING':
          break;
        case 'ENSURE_ROOM':
        case 'VERIFY_MEMBERSHIP':
        case 'VERIFY_EXISTING_SESSION':
        case 'FULL_RESYNC':
          break;
        default:
          throw new Error(`PiXiSYNC runtime: unsupported-effect-${effect.type}`);
      }
    }

    async function start() {
      if (await ensureAuthenticatedStart({ requireLogin: true }) !== true) {
        throw new Error('PiXiSYNC runtime: authentication-required');
      }
      await ensureSupabase();
      if (!session || currentSnapshot()?.phase !== 'local' || currentSnapshot()?.role !== 'owner') {
        installSession('owner');
      }
      const projectKey = String(getProjectKey() || '');
      if (!projectKey) throw new Error('PiXiSYNC runtime: local-project-required');
      boundProjectKey = projectKey;
      replacedProjectKey = '';
      reusableInviteToken = '';
      reusableInviteExpiresAt = '';
      reusableInvitePersistent = false;
      await acquireEditingLease(projectKey);
      configureBridge({ collaboration: false });
      runtimeBridge.setInputLocked?.(true);
      const opening = session.dispatch({ type: 'OPEN_REQUEST', projectKey });
      runtimeBridge.refreshUi?.();
      const epoch = opening.state.epoch;
      const checkpointStartedAt = performance.now();
      initialOwnerBootstrapRevision = null;
      try {
        const blob = await captureCheckpoint();
        if (!(blob instanceof Blob) || blob.size < 1) throw new Error('PiXiSYNC runtime: empty-checkpoint');
        const stateHash = await sha256Hex(blob);
        const begun = firstRow(await rpc('pixisync_begin_session', {
          p_title: String(getProjectTitle() || '').slice(0, 120),
          p_state_sha256: toHexBytes(stateHash),
          p_encoded_bytes: blob.size,
          p_codec_version: 1,
        }));
        roomId = assertRoomId(begun?.room_id);
        report({
          phase: 'begin-session-complete',
          roomId,
          checkpointId: String(begun?.checkpoint_id || ''),
          blobSize: blob.size,
          elapsedMs: Math.round(performance.now() - checkpointStartedAt),
        });
        report({
          phase: 'storage-upload-start',
          roomId,
          checkpointId: String(begun?.checkpoint_id || ''),
          blobSize: blob.size,
          timeoutMs: Math.max(1000, Number(operationTimeoutMs) || 20000),
          online: typeof navigator === 'undefined' ? null : navigator.onLine !== false,
          elapsedMs: Math.round(performance.now() - checkpointStartedAt),
        });
        try {
          await uploadCheckpoint(String(begun?.storage_path || ''), blob);
        } catch (error) {
          report({
            phase: 'storage-upload-failed',
            roomId,
            checkpointId: String(begun?.checkpoint_id || ''),
            blobSize: blob.size,
            errorName: String(error?.name || ''),
            errorMessage: String(error?.message || 'unknown'),
            statusCode: Number(error?.statusCode || error?.status || 0) || null,
            supabaseErrorCode: String(error?.code || ''),
            timeoutMs: Math.max(1000, Number(operationTimeoutMs) || 20000),
            online: typeof navigator === 'undefined' ? null : navigator.onLine !== false,
            elapsedMs: Math.round(performance.now() - checkpointStartedAt),
          });
          throw error;
        }
        report({
          phase: 'storage-upload-complete',
          roomId,
          checkpointId: String(begun?.checkpoint_id || ''),
          blobSize: blob.size,
          elapsedMs: Math.round(performance.now() - checkpointStartedAt),
        });
        const activated = firstRow(await rpc('pixisync_activate_initial_checkpoint', { p_room_id: roomId }));
        report({
          phase: 'activate-checkpoint-complete',
          roomId,
          checkpointId: String(begun?.checkpoint_id || ''),
          blobSize: blob.size,
          elapsedMs: Math.round(performance.now() - checkpointStartedAt),
        });
        manifest = await openManifest(roomId);
        preserveInitialOwnerDocument = true;
        await dispatchNow({
          type: 'ROOM_READY',
          epoch,
          roomId,
          status: activated?.status,
          generation: String(activated?.session_generation || manifest.session_generation),
        });
        return roomId;
      } catch (error) {
        initialOwnerBootstrapRevision = null;
        await dispatchNow({ type: 'FAIL', epoch, reason: error?.message || 'start-failed' });
        throw error;
      }
    }

    async function join(inviteToken) {
      if (await ensureAuthenticatedStart({ requireLogin: true }) !== true) {
        throw new Error('PiXiSYNC runtime: authentication-required');
      }
      await ensureSupabase();
      const token = String(inviteToken || '').toLowerCase();
      if (!TOKEN_PATTERN.test(token)) throw new Error('PiXiSYNC runtime: invalid-invite-token');
      installSession('participant');
      boundProjectKey = String(getProjectKey() || '');
      replacedProjectKey = '';
      if (!boundProjectKey) throw new Error('PiXiSYNC runtime: local-project-required');
      await acquireEditingLease(boundProjectKey);
      configureBridge({ collaboration: false });
      runtimeBridge.setInputLocked?.(true);
      const joining = session.dispatch({ type: 'JOIN_REQUEST', projectKey: boundProjectKey });
      runtimeBridge.refreshUi?.();
      const epoch = joining.state.epoch;
      try {
        const joined = firstRow(await rpc('pixisync_join_session', { p_invite_token: token }));
        roomId = assertRoomId(joined?.room_id);
        await resolveBindingTargetForRoom();
        manifest = await openManifest(roomId);
        // A successful membership is sufficient to make this local card a
        // durable shared card.  Do this before the initial checkpoint/tail
        // finishes so reopening survives an interrupted first synchronization.
        await persistProjectBinding();
        await dispatchNow({
          type: 'MEMBERSHIP_OK',
          epoch,
          roomId,
          status: joined?.status,
          generation: String(joined?.session_generation),
          canEdit: joined?.can_edit === true,
        });
        return roomId;
      } catch (error) {
        await dispatchNow({ type: 'DENIED', epoch, reason: error?.message || 'join-failed' });
        throw error;
      }
    }

    async function resumeBoundProject() {
      await ensureSupabase();
      const projectKey = String(getProjectKey() || '');
      const binding = normalizeProjectBinding(await readProjectBinding(projectKey));
      if (!binding || binding.projectKey !== projectKey) {
        throw new Error('PiXiSYNC runtime: project-binding-unavailable');
      }
      boundProjectKey = binding.projectKey;
      reusableInviteToken = binding.role === 'owner' ? binding.inviteToken : '';
      reusableInviteExpiresAt = binding.role === 'owner' ? binding.inviteExpiresAt : '';
      reusableInvitePersistent = binding.role === 'owner' && binding.invitePersistent === true;
      // Retain the durable target before the first network attempt so a
      // temporary open failure can retry the same room without consuming the
      // original invite again.
      roomId = binding.roomId;
      await acquireEditingLease(binding.projectKey);
      configureBridge({ collaboration: false });
      runtimeBridge.setInputLocked?.(true);
      installSession(binding.role, { resumeAvailable: true });
      const opening = session.dispatch({
        type: 'RESUME_REQUEST',
        roomId: binding.roomId,
        projectKey: binding.projectKey,
      });
      runtimeBridge.refreshUi?.();
      const epoch = opening.state.epoch;
      try {
        manifest = await openManifest(roomId);
        const event = binding.role === 'owner'
          ? {
              type: 'ROOM_READY',
              epoch,
              roomId,
              status: manifest.status,
              generation: String(manifest.session_generation),
            }
          : {
              type: 'MEMBERSHIP_OK',
              epoch,
              roomId,
              status: manifest.status,
              generation: String(manifest.session_generation),
              canEdit: manifest.can_edit === true,
            };
        await dispatchNow(event);
        return roomId;
      } catch (error) {
        // A persisted card is still a shared project when the first reopen
        // attempt fails. Reset the incomplete open transaction, keep the
        // persisted card draw-locked, and retry the complete bound-card open.
        await dispatchNow({ type: 'FAIL', epoch, reason: error?.message || 'open-failed' });
        scheduleBoundProjectResumeRetry(error?.message || 'open-failed');
        throw error;
      }
    }

    async function createInviteLink() {
      if (!session?.canDraw?.() || role !== 'owner') throw new Error('PiXiSYNC runtime: active-owner-required');
      if (
        TOKEN_PATTERN.test(reusableInviteToken)
        && (
          reusableInvitePersistent
          || (
            Number.isFinite(Date.parse(reusableInviteExpiresAt))
            && Date.parse(reusableInviteExpiresAt) > Date.now() + 60000
          )
        )
      ) {
        const reusableUrl = new URL(locationRef.href);
        reusableUrl.searchParams.set('pixisync_invite', reusableInviteToken);
        return reusableUrl.toString();
      }
      const invite = firstRow(await rpc('pixisync_create_invite', {
        p_room_id: roomId,
        p_role: 'editor',
        p_expires_at: null,
        p_max_uses: null,
      }));
      const token = String(invite?.invite_token || '');
      if (!TOKEN_PATTERN.test(token)) throw new Error('PiXiSYNC runtime: invalid-invite-response');
      reusableInviteToken = token.toLowerCase();
      reusableInviteExpiresAt = String(invite?.expires_at || '');
      reusableInvitePersistent = true;
      await persistProjectBinding();
      const url = new URL(locationRef.href);
      url.searchParams.set('pixisync_invite', reusableInviteToken);
      return url.toString();
    }

    async function createInviteCode() {
      const link = await createInviteLink();
      const token = new URL(link, locationRef.href).searchParams.get('pixisync_invite') || '';
      if (!TOKEN_PATTERN.test(token)) throw new Error('PiXiSYNC runtime: invalid-invite-code');
      // This is the same durable credential as the URL, formatted only for
      // human entry. The join parser removes separators before validation.
      return token.toUpperCase().match(/.{1,4}/g).join('-');
    }

    function normalizeComment(payload) {
      const id = String(payload?.id || '');
      const senderClientId = String(payload?.senderClientId || '');
      const senderRole = payload?.senderRole === 'owner' ? 'owner' : 'editor';
      const text = String(payload?.text || '').trim();
      const sentAt = String(payload?.sentAt || '');
      if (
        !ROOM_ID_PATTERN.test(id)
        || !ROOM_ID_PATTERN.test(senderClientId)
        || !text
        || text.length > COMMENT_MAX_LENGTH
        || !Number.isFinite(Date.parse(sentAt))
      ) {
        return null;
      }
      return Object.freeze({ id, senderClientId, senderRole, text, sentAt });
    }

    async function sendComment(value) {
      if (!session?.canDraw?.() || !realtimeClient) {
        throw new Error('PiXiSYNC runtime: active-session-required');
      }
      const text = String(value || '').trim().slice(0, COMMENT_MAX_LENGTH);
      if (!text) throw new Error('PiXiSYNC runtime: empty-comment');
      const comment = normalizeComment({
        id: window.crypto.randomUUID(),
        senderClientId: clientId,
        senderRole: role,
        text,
        sentAt: new Date().toISOString(),
      });
      if (!comment) throw new Error('PiXiSYNC runtime: invalid-comment');
      await realtimeClient.sendBroadcast('pixisync-comment', comment);
      return comment;
    }

    async function leave() {
      if (role === 'owner') throw new Error('PiXiSYNC runtime: owner-must-archive');
      const result = session.dispatch({ type: 'LEAVE_REQUEST' });
      runtimeBridge.refreshUi?.();
      await rpc('pixisync_leave_session', { p_room_id: roomId });
      for (const effect of result.effects) await runEffect(effect);
      await removeProjectBinding();
      await releaseProjectLease();
      await dispatchNow({ type: 'LEFT', epoch: result.state.epoch });
    }

    async function waitForAttestation(checkpointId, timeoutMs = 10000) {
      let timeoutId;
      await new Promise(resolve => {
        timeoutId = window.setTimeout(resolve, timeoutMs);
        attestationWaiters.set(checkpointId, resolve);
      });
      window.clearTimeout(timeoutId);
      attestationWaiters.delete(checkpointId);
    }

    async function attestRemoteCheckpoint(payload) {
      if (!session?.canDraw?.() || role === 'owner') return false;
      const checkpointId = String(payload?.checkpointId || '');
      const path = String(payload?.storagePath || '');
      const expectedHash = assertHash(payload?.stateSha256);
      const blob = await downloadCheckpoint(path);
      if (blob.size !== Number(payload?.encodedBytes) || await sha256Hex(blob) !== expectedHash) {
        await enqueue({ type: 'HASH_MISMATCH', epoch: currentEpoch() });
        return false;
      }
      await rpc('pixisync_attest_checkpoint', {
        p_checkpoint_id: checkpointId,
        p_client_id: clientId,
        p_state_sha256: toHexBytes(expectedHash),
      });
      await realtimeClient?.sendBroadcast?.('checkpoint-attested', { checkpointId });
      return true;
    }

    async function archive() {
      if (!session?.canDraw?.() || role !== 'owner') throw new Error('PiXiSYNC runtime: active-owner-required');
      if (realtimeClient?.pendingOperationCount) throw new Error('PiXiSYNC runtime: pending-operations-remain');
      const blob = await captureCheckpoint();
      const stateHash = await sha256Hex(blob);
      const checkpointId = window.crypto.randomUUID();
      const prepared = firstRow(await rpc('pixisync_prepare_checkpoint', {
        p_room_id: roomId,
        p_checkpoint_id: checkpointId,
        p_state_sha256: toHexBytes(stateHash),
        p_encoded_bytes: blob.size,
        p_codec_version: 1,
      }));
      await uploadCheckpoint(String(prepared?.storage_path || ''), blob);
      await rpc('pixisync_register_checkpoint', {
        p_room_id: roomId,
        p_checkpoint_id: checkpointId,
      });
      let attested = firstRow(await rpc('pixisync_attest_checkpoint', {
        p_checkpoint_id: checkpointId,
        p_client_id: clientId,
        p_state_sha256: toHexBytes(stateHash),
      }));
      if (attested?.status !== 'verified') {
        const waitForPeer = waitForAttestation(checkpointId);
        await realtimeClient.sendBroadcast('checkpoint-attestation-request', {
          checkpointId,
          storagePath: prepared.storage_path,
          stateSha256: stateHash,
          encodedBytes: blob.size,
          revision: String(prepared.revision),
        });
        await waitForPeer;
        attested = firstRow(await rpc('pixisync_attest_checkpoint', {
          p_checkpoint_id: checkpointId,
          p_client_id: clientId,
          p_state_sha256: toHexBytes(stateHash),
        }));
      }
      if (attested?.status !== 'verified') throw new Error('PiXiSYNC runtime: checkpoint-attestation-incomplete');
      await rpc('pixisync_archive_session', {
        p_room_id: roomId,
        p_final_checkpoint_id: checkpointId,
      });
      await realtimeClient.sendBroadcast('session-archived', { roomId, checkpointId }).catch(() => {});
      const closing = session.dispatch({ type: 'CLOSE_REQUEST' });
      runtimeBridge.refreshUi?.();
      for (const effect of closing.effects) await runEffect(effect);
      await removeProjectBinding();
      await releaseProjectLease();
      await dispatchNow({ type: 'CLOSED', epoch: closing.state.epoch });
    }

    async function initialize() {
      if (disposed) return snapshot();
      await ensureSupabase();
      if (disposed) return snapshot();
      const binding = normalizeProjectBinding(await readProjectBinding(String(getProjectKey() || '')));
      if (disposed) return snapshot();
      projectBindingPersisted = Boolean(binding);
      boundProjectKey = binding?.projectKey || '';
      reusableInviteToken = binding?.role === 'owner' ? binding.inviteToken : '';
      reusableInviteExpiresAt = binding?.role === 'owner' ? binding.inviteExpiresAt : '';
      reusableInvitePersistent = binding?.role === 'owner' && binding.invitePersistent === true;
      installSession(binding?.role || 'owner', { resumeAvailable: Boolean(binding) });
      configureBridge({ collaboration: false });
      await runtimeBridge.consumeInviteFromUrl?.();
      if (disposed) runtimeBridge.clear?.();
      return snapshot();
    }

    async function dispose() {
      if (disposed) {
        runtimeBridge.clear?.();
        return;
      }
      disposed = true;
      // Revoke the document bridge before any awaited transport cleanup. All
      // later configure attempts are rejected by configureBridge().
      runtimeBridge.clear?.();
      clearReconnectRetry();
      unsubscribeSession?.();
      unsubscribeSession = null;
      const pendingOperations = operationQueue;
      await realtimeClient?.stop?.().catch(() => {});
      realtimeClient = null;
      await pendingOperations.catch(() => {});
      await releaseProjectLease();
      runtimeBridge.clear?.();
    }

    function snapshot() {
      return {
        enabled: !disposed,
        roomId,
        role,
        clientId,
        manifest: manifest ? {
          status: manifest.status,
          headRevision: String(manifest.head_revision),
          checkpointRevision: String(manifest.checkpoint_revision),
          sessionGeneration: String(manifest.session_generation),
        } : null,
        session: currentSnapshot(),
        realtime: realtimeClient ? {
          confirmedRevision: realtimeClient.confirmedRevision.toString(),
          pendingOperationCount: realtimeClient.pendingOperationCount,
          confirmedOperationIds: realtimeClient.confirmedOperationIds,
        } : null,
        collaboration: runtimeBridge.snapshot?.() || null,
      };
    }

    return Object.freeze({
      initialize,
      dispose,
      commands,
      start,
      join,
      resumeBoundProject,
      handleLifecycleSuspend,
      handleLifecycleResume,
      leave,
      archive,
      createInviteLink,
      createInviteCode,
      sendComment,
      prepareCheckpointOperation,
      snapshot,
      get session() { return session; },
      get realtimeClient() { return realtimeClient; },
    });
  }

  root.pixisyncRuntimeAdapterUtils = Object.freeze({
    createPiXiSyncRuntimeAdapter,
    resolvePiXiSyncRecentProjectTarget,
    collectPiXiSyncRecentProjectCleanupEntries,
  });
})();
