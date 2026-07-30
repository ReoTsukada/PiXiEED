(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncRealtimeClientUtils({ codec, orderKeeperFactory, journal } = {}) {
    if (!codec || typeof orderKeeperFactory !== 'function') throw new Error('PiXiSYNC realtime: missing codec or order keeper');
    const bytesToHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

    function createClient({
      supabase,
      roomId,
      clientId,
      applyConfirmed,
      initialRevision = 0,
      recoverOnSubscribe = true,
      onLocalConfirmed = () => {},
      onStatus = () => {},
      onChannelStatus = () => {},
      onBroadcast = () => {},
      onPresenceChange = () => {},
      onRecoveryRequired = () => {},
    } = {}) {
      if (!supabase?.rpc || !supabase?.channel || !roomId || !clientId || typeof applyConfirmed !== 'function') throw new Error('PiXiSYNC realtime: invalid client configuration');
      let channel = null;
      let started = false;
      let recovering = false;
      const pendingLocalOperations = new Map();
      const confirmedOperationIds = new Set();
      const keeper = orderKeeperFactory({
        confirmedRevision: initialRevision,
        applyConfirmed: operation => {
          const pending = pendingLocalOperations.get(operation.operationId);
          if (pending) {
            pendingLocalOperations.delete(operation.operationId);
            applyConfirmed(operation, { local: true, optimistic: pending.optimistic, pendingRecord: pending.record });
            confirmedOperationIds.add(operation.operationId);
            Promise.resolve(journal?.remove?.(roomId, operation.operationId)).catch(() => {});
            onLocalConfirmed(operation);
            return;
          }
          applyConfirmed(operation, { local: false, optimistic: false });
          confirmedOperationIds.add(operation.operationId);
        },
        onGap: () => recover('revision-gap'),
        onRecoveryRequired: details => recover(details.reason),
      });

      async function normalizeOperation(row) {
        const payload = codec.base64ToBytes(row.payload_b64 || row.payloadB64 || '');
        const hash = await codec.sha256Hex(payload);
        const expected = String(row.payload_sha256_hex || row.payloadSha256 || '').toLowerCase();
        if (hash !== expected) throw new Error('PiXiSYNC realtime: payload-hash-mismatch');
        const canvasWidth = Number(row.canvas_width || row.canvasWidth);
        const canvasHeight = Number(row.canvas_height || row.canvasHeight);
        const kind = row.kind;
        const pixelCount = Number(row.pixel_count ?? row.pixelCount);
        const guarded = kind === 'undo_pixel_patch' || kind === 'redo_pixel_patch';
        if (kind !== 'pixel_patch' && !guarded) throw new Error('PiXiSYNC realtime: unsupported-operation-kind');
        if (payload[5] !== codec.FLAGS.NONE) {
          // The server broadcasts canonical applied payloads. Guard metadata
          // is audit-only; confirmed payloads are always unconditional.
          throw new Error('PiXiSYNC realtime: noncanonical-confirmed-flags');
        }
        const allowEmpty = pixelCount === 0 && guarded;
        const changes = codec.decodePixelPatch(payload, { cellCount: canvasWidth * canvasHeight, allowEmpty });
        if (!Number.isSafeInteger(pixelCount) || pixelCount !== changes.length) {
          throw new Error('PiXiSYNC realtime: pixel-count-mismatch');
        }
        return { operationId: row.operation_id || row.operationId, revision: row.revision, payloadSha256: expected, payload, changes, kind: row.kind, canvasId: row.canvas_id || row.canvasId, frameId: row.frame_id || row.frameId, layerId: row.layer_id || row.layerId, canvasWidth, canvasHeight, undoOfOperationId: row.undo_of_operation_id || row.undoOfOperationId || null };
      }
      async function fetchSince(afterRevision) {
        let cursor = BigInt(afterRevision);
        while (true) {
          const pageStartRevision = cursor;
          const { data, error } = await supabase.rpc('pixisync_get_ops_since', {
            p_room_id: roomId,
            p_after_revision: cursor.toString(),
            p_limit: 500,
          });
          if (error) throw error;
          const rows = data || [];
          for (const row of rows) {
            keeper.receive(await normalizeOperation(row));
            cursor = keeper.confirmedRevision;
          }
          if (rows.length < 500) break;
          if (cursor === pageStartRevision) throw new Error('PiXiSYNC realtime: recovery-cursor-stalled');
        }
      }
      async function recover(reason) {
        if (recovering || !started) return;
        recovering = true;
        onStatus({ phase: 'recovering', reason });
        try { await fetchSince(keeper.confirmedRevision); }
        catch (error) { onRecoveryRequired({ reason, error }); }
        finally { recovering = false; onStatus({ phase: 'ready', revision: keeper.confirmedRevision }); }
      }
      async function start() {
        if (started && channel) return channel;
        started = true;
        channel = supabase.channel(`pixisync:room:${roomId}`, { config: { private: true, broadcast: { ack: true, self: false }, presence: { key: clientId } } })
          .on('broadcast', { event: 'operation-hint' }, () => recover('broadcast-hint'))
          .on('broadcast', { event: 'checkpoint-attestation-request' }, message => onBroadcast('checkpoint-attestation-request', message?.payload))
          .on('broadcast', { event: 'checkpoint-attested' }, message => onBroadcast('checkpoint-attested', message?.payload))
          .on('broadcast', { event: 'pixisync-comment' }, message => onBroadcast('pixisync-comment', message?.payload))
          .on('broadcast', { event: 'session-archived' }, message => onBroadcast('session-archived', message?.payload))
          .on('presence', { event: 'sync' }, () => {
            const state = channel?.presenceState?.() || {};
            const values = Object.values(state)
              .flatMap(entry => Array.isArray(entry) ? entry : [])
              .filter(entry => entry && typeof entry === 'object');
            onPresenceChange(values);
          });
        await new Promise((resolve, reject) => {
          channel.subscribe(status => {
            onChannelStatus(status);
            if (status === 'SUBSCRIBED') {
              if (recoverOnSubscribe) void recover('initial-bootstrap');
              resolve();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              reject(new Error(`PiXiSYNC realtime: channel-${String(status).toLowerCase()}`));
            }
          });
        });
        return channel;
      }
      async function commit({ operationId, kind = 'pixel_patch', structureEpoch = 0, changes, canvasId, frameId, layerId, canvasWidth, canvasHeight, undoOfOperationId = null }) {
        const cellCount = Number(canvasWidth) * Number(canvasHeight);
        const guarded = kind === 'undo_pixel_patch' || kind === 'redo_pixel_patch';
        const payload = codec.encodePixelPatch(changes, { cellCount, guarded });
        const canonicalChanges = codec.decodePixelPatch(payload, { cellCount });
        const payloadSha256 = await codec.sha256Hex(payload);
        const record = { roomId, operationId, kind, structureEpoch, changes: canonicalChanges, canvasId, frameId, layerId, canvasWidth, canvasHeight, undoOfOperationId, payloadB64: codec.bytesToBase64(payload), payloadSha256 };
        await journal?.put?.(record);
        pendingLocalOperations.set(operationId, { optimistic: !guarded, record });
        const { data, error } = await supabase.rpc('pixisync_commit_operation', {
          p_room_id: roomId, p_operation_id: operationId, p_client_id: clientId, p_kind: kind, p_structure_epoch: structureEpoch,
          p_codec_version: 1, p_canvas_id: canvasId, p_frame_id: frameId, p_layer_id: layerId, p_canvas_width: canvasWidth, p_canvas_height: canvasHeight,
          p_payload: `\\x${bytesToHex(payload)}`, p_payload_sha256: `\\x${payloadSha256}`, p_pixel_count: canonicalChanges.length, p_undo_of_operation_id: undoOfOperationId,
        });
        if (error) {
          throw error;
        }
        const committed = Array.isArray(data) ? data[0] : data;
        if (!committed?.revision || !committed?.payload_b64 || !committed?.payload_sha256_hex) {
          throw new Error('PiXiSYNC realtime: invalid-commit-response');
        }
        const confirmedOperation = await normalizeOperation({
          revision: committed.revision,
          operation_id: operationId,
          kind,
          canvas_id: canvasId,
          frame_id: frameId,
          layer_id: layerId,
          canvas_width: canvasWidth,
          canvas_height: canvasHeight,
          pixel_count: committed.pixel_count,
          payload_b64: committed.payload_b64,
          payload_sha256_hex: committed.payload_sha256_hex,
          undo_of_operation_id: undoOfOperationId,
        });
        const confirmation = keeper.receive(confirmedOperation);
        if (confirmation.status === 'duplicate' && pendingLocalOperations.has(operationId)) {
          pendingLocalOperations.delete(operationId);
          confirmedOperationIds.add(operationId);
          Promise.resolve(journal?.remove?.(roomId, operationId)).catch(() => {});
          onLocalConfirmed(confirmedOperation);
        }
        await recover('rpc-commit');
        await channel?.send({ type: 'broadcast', event: 'operation-hint', payload: { revision: committed?.revision || null, operationId } });
        return committed;
      }
      async function syncFrom(afterRevision = keeper.confirmedRevision) {
        const revision = BigInt(afterRevision);
        if (keeper.confirmedRevision !== revision) keeper.reset(revision);
        await fetchSince(revision);
        return keeper.confirmedRevision;
      }
      async function replayPendingJournal() {
        const records = await journal?.list?.(roomId) || [];
        for (const record of records) {
          await commit(record);
        }
        return records.length;
      }
      async function sendBroadcast(event, payload = {}) {
        if (!channel) throw new Error('PiXiSYNC realtime: channel-not-started');
        return channel.send({ type: 'broadcast', event, payload });
      }
      async function trackPresence(payload = {}) {
        if (!channel?.track) return null;
        return channel.track(payload);
      }
      async function untrackPresence() {
        if (!channel?.untrack) return null;
        return channel.untrack();
      }
      async function stop() { started = false; if (channel) await supabase.removeChannel(channel); channel = null; }
      return {
        start,
        stop,
        commit,
        recover,
        syncFrom,
        replayPendingJournal,
        sendBroadcast,
        trackPresence,
        untrackPresence,
        resetConfirmedRevision: revision => keeper.reset(revision),
        get confirmedRevision() { return keeper.confirmedRevision; },
        get pendingOperationCount() { return pendingLocalOperations.size; },
        get confirmedOperationIds() { return [...confirmedOperationIds]; },
      };
    }
    return { createClient };
  }
  root.pixisyncRealtimeClientUtils = { createPiXiSyncRealtimeClientUtils };
})();
