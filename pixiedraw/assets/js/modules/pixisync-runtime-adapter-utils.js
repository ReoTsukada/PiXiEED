(() => {
  'use strict';

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};
  const ROOM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
  const HASH_PATTERN = /^[0-9a-f]{64}$/;
  const CHECKPOINT_BUCKET = 'pixisync-checkpoints';
  const COMMENT_MAX_LENGTH = 140;

  function createPiXiSyncRuntimeAdapter({
    createSession,
    createRealtimeClient,
    runtimeBridge,
    getSupabase,
    captureCheckpoint,
    restoreCheckpoint,
    getProjectKey = () => '',
    getProjectTitle = () => '',
    readProjectBinding = async () => null,
    writeProjectBinding = async () => {},
    clearProjectBinding = async () => {},
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
    let operationQueue = Promise.resolve();
    let replayedJournalEpoch = -1;
    let disposed = false;
    let unsubscribeSession = null;
    let lifecycleSuspended = false;
    let lifecycleResumeQueued = false;
    let reconnectRetryTimer = 0;
    let reconnectRetryAttempt = 0;
    let projectLease = null;
    let localReadOnly = false;
    // Supabase may emit CLOSED asynchronously after removeChannel/stop().
    // Those intentional shutdowns must not be fed back into the session as a
    // transport failure while a lifecycle reconnect is already in progress.
    const intentionallyStoppedRealtimeClients = new WeakSet();
    const attestationWaiters = new Map();

    const commands = Object.freeze({
      start,
      join,
      resumeBoundProject,
      createInviteLink,
      sendComment,
      leave,
      archive,
      handleLifecycleResume,
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
    const sha256Hex = async blob => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes));
      return [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
    };
    const withTimeout = async (operation, promise) => {
      const timeoutMs = Math.max(1000, Number(operationTimeoutMs) || 20000);
      let timer = null;
      try {
        return await Promise.race([
          Promise.resolve(promise),
          new Promise((_, reject) => {
            timer = window.setTimeout(
              () => reject(new Error(`PiXiSYNC runtime: ${operation}-timeout`)),
              timeoutMs
            );
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
    const report = details => {
      onStatus(details);
      runtimeBridge.refreshUi?.();
    };
    const normalizeProjectBinding = value => {
      if (!ROOM_ID_PATTERN.test(String(value?.roomId || ''))) return null;
      const projectKey = String(value?.projectKey || '');
      if (!projectKey) return null;
      return Object.freeze({
        roomId: String(value.roomId),
        role: value.role === 'owner' ? 'owner' : 'participant',
        projectKey,
      });
    };
    const persistProjectBinding = async () => {
      const binding = normalizeProjectBinding({ roomId, role, projectKey: boundProjectKey });
      if (!binding) throw new Error('PiXiSYNC runtime: project-binding-unavailable');
      await writeProjectBinding(binding.projectKey, binding);
    };
    const removeProjectBinding = async () => {
      if (boundProjectKey) await clearProjectBinding(boundProjectKey);
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
      const response = await withTimeout(`rpc-${name}`, supabase.rpc(name, params));
      if (response?.error) throw response.error;
      return response?.data;
    };
    const uploadCheckpoint = async (path, blob) => {
      const response = await withTimeout('checkpoint-upload', supabase.storage.from(CHECKPOINT_BUCKET).upload(path, blob, {
        contentType: 'application/octet-stream',
        upsert: false,
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

    function configureBridge({ collaboration = Boolean(realtimeClient) } = {}) {
      runtimeBridge.configure({
        session,
        realtimeClient: collaboration ? realtimeClient : null,
        structureEpoch: Number(manifest?.structure_epoch || 0),
        commands,
        participants: [],
        localReadOnly,
        localReadOnlyMessage: localReadOnly ? 'このプロジェクトは別のタブで編集中です。この画面は閲覧専用です。' : '',
        uiEnabled,
        consumeInviteFromUrl: false,
      });
    }

    function installSession(nextRole, { resumeAvailable = false } = {}) {
      unsubscribeSession?.();
      role = nextRole === 'owner' ? 'owner' : 'participant';
      session = createSession({ role, resumeAvailable });
      unsubscribeSession = session.subscribe(snapshot => {
        // The collaboration controller is installed only after a channel is
        // available. Keep canvas input locked throughout every transition so
        // a start/resume cannot create an unsynchronised local stroke.
        runtimeBridge.setInputLocked?.(!['local', 'invited', 'left', 'archived', 'active'].includes(snapshot.phase));
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
      });
      configureBridge({ collaboration: false });
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
          onError(error);
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
      createdRealtime = createRealtimeClient({
        supabase,
        roomId,
        clientId,
        initialRevision: String(manifest?.checkpoint_revision || 0),
        recoverOnSubscribe: false,
        operationTimeoutMs,
        applyConfirmed: (operation, metadata) => runtimeBridge.applyConfirmed(operation, metadata),
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
                ? '自分'
                : (participantRole === 'owner' ? 'Owner' : 'Editor'),
              role: participantRole,
              connection: 'online',
            });
          }
          runtimeBridge.updateParticipants?.(participants);
        },
        onRecoveryRequired: details => {
          if (realtimeClient !== createdRealtime) return;
          onError(details?.error || new Error(details?.reason || 'recovery-required'));
          void enqueue({ type: 'GAP_DETECTED', epoch: currentEpoch() });
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
          await withTimeout('presence-track', realtimeClient.trackPresence({ clientId, role, onlineAt: new Date().toISOString() }));
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
            await dispatchNow({
              type: 'CHECKPOINT_LOADED',
              epoch: effectEpoch,
              generation: currentGeneration(),
              revision: String(manifest.checkpoint_revision),
            });
            break;
          }
          const blob = await downloadCheckpoint(String(manifest.storage_path || ''));
          if (blob.size !== Number(manifest.encoded_bytes) || await sha256Hex(blob) !== assertHash(manifest.state_sha256_hex)) {
            await dispatchNow({ type: 'HASH_MISMATCH', epoch: effectEpoch });
            return;
          }
          configureBridge();
          runtimeBridge.beginAuthoritativeResync?.(manifest.checkpoint_revision);
          await restoreCheckpoint(blob, { projectKey: boundProjectKey, role });
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
          await withTimeout('presence-retrack', realtimeClient.trackPresence({ clientId, role, onlineAt: new Date().toISOString() }));
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
      await acquireEditingLease(projectKey);
      configureBridge({ collaboration: false });
      runtimeBridge.setInputLocked?.(true);
      const opening = session.dispatch({ type: 'OPEN_REQUEST', projectKey });
      runtimeBridge.refreshUi?.();
      const epoch = opening.state.epoch;
      const checkpointStartedAt = performance.now();
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
        manifest = await openManifest(roomId);
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
        manifest = await openManifest(binding.roomId);
        roomId = binding.roomId;
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
        await dispatchNow({ type: 'FAIL', epoch, reason: error?.message || 'open-failed' });
        throw error;
      }
    }

    async function createInviteLink() {
      if (!session?.canDraw?.() || role !== 'owner') throw new Error('PiXiSYNC runtime: active-owner-required');
      const invite = firstRow(await rpc('pixisync_create_invite', {
        p_room_id: roomId,
        p_role: 'editor',
        p_expires_at: new Date(Date.now() + 86400000).toISOString(),
        p_max_uses: 1,
      }));
      const token = String(invite?.invite_token || '');
      if (!TOKEN_PATTERN.test(token)) throw new Error('PiXiSYNC runtime: invalid-invite-response');
      const url = new URL(locationRef.href);
      url.searchParams.set('pixisync_invite', token);
      return url.toString();
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
      await ensureSupabase();
      const binding = normalizeProjectBinding(await readProjectBinding(String(getProjectKey() || '')));
      boundProjectKey = binding?.projectKey || '';
      installSession(binding?.role || 'owner', { resumeAvailable: Boolean(binding) });
      configureBridge({ collaboration: false });
      await runtimeBridge.consumeInviteFromUrl?.();
      return snapshot();
    }

    async function dispose() {
      disposed = true;
      clearReconnectRetry();
      unsubscribeSession?.();
      unsubscribeSession = null;
      await realtimeClient?.stop?.().catch(() => {});
      realtimeClient = null;
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
      sendComment,
      snapshot,
      get session() { return session; },
      get realtimeClient() { return realtimeClient; },
    });
  }

  root.pixisyncRuntimeAdapterUtils = Object.freeze({ createPiXiSyncRuntimeAdapter });
})();
