(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncRealtimeClientUtils({ codec, documentCodec = null, orderKeeperFactory, journal } = {}) {
    if (!codec || typeof orderKeeperFactory !== 'function') throw new Error('PiXiSYNC realtime: missing codec or order keeper');
    const bytesToHex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');

    function createClient({
      supabase,
      roomId,
      clientId,
      applyConfirmed,
      prepareConfirmed = async () => {},
      initialRevision = 0,
      recoverOnSubscribe = true,
      operationTimeoutMs = 20000,
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
      const discardedOperationIds = new Set();
      const confirmedOperationIds = new Set();
      const withTimeout = async (operation, promise) => {
        const timeoutMs = Math.max(1000, Number(operationTimeoutMs) || 20000);
        const schedule = window.setTimeout?.bind(window) || globalThis.setTimeout;
        const cancel = window.clearTimeout?.bind(window) || globalThis.clearTimeout;
        let timer = null;
        try {
          return await Promise.race([
            Promise.resolve(promise),
            new Promise((_, reject) => {
              timer = schedule(() => reject(new Error(`PiXiSYNC realtime: ${operation}-timeout`)), timeoutMs);
            }),
          ]);
        } finally {
          if (timer !== null) cancel(timer);
        }
      };
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

      async function prepareBeforeReceive(operation) {
        const pending = pendingLocalOperations.get(String(operation?.operationId || '')) || null;
        await prepareConfirmed(operation, {
          local: Boolean(pending),
          pendingRecord: pending?.record || null,
        });
      }

      async function normalizeOperation(row) {
        const kind = row.kind;
        // Pixel patches are capped below 64 KiB, but document operations are
        // permitted to contain up to 256 KiB of UTF-8 JSON.  Decode the latter
        // with the document codec's matching Base64 ceiling; otherwise a valid
        // structure/checkpoint operation leaves the room in a recovery loop.
        const maxDocumentBytes = Math.max(2, Number(documentCodec?.MAX_DOCUMENT_OPERATION_BYTES) || 262144);
        const maxEncodedLength = kind === 'document_patch'
          ? Math.ceil(maxDocumentBytes / 3) * 4
          : 64 * 1024;
        const payload = codec.base64ToBytes(row.payload_b64 || row.payloadB64 || '', { maxEncodedLength });
        const hash = await codec.sha256Hex(payload);
        const expected = String(row.payload_sha256_hex || row.payloadSha256 || '').toLowerCase();
        if (hash !== expected) throw new Error('PiXiSYNC realtime: payload-hash-mismatch');
        const canvasWidth = Number(row.canvas_width || row.canvasWidth);
        const canvasHeight = Number(row.canvas_height || row.canvasHeight);
        const pixelCount = Number(row.pixel_count ?? row.pixelCount);
        if (kind === 'document_patch') {
          if (!documentCodec?.decode) throw new Error('PiXiSYNC realtime: document-codec-unavailable');
          if (Number(row.codec_version ?? row.codecVersion) !== 2 || pixelCount !== 0) {
            throw new Error('PiXiSYNC realtime: invalid-document-operation-shape');
          }
          const documentOperation = documentCodec.decode(payload);
          const structureEpoch = Number(row.structure_epoch ?? row.structureEpoch);
          if (!Number.isSafeInteger(structureEpoch) || structureEpoch < 1) {
            throw new Error('PiXiSYNC realtime: invalid-document-structure-epoch');
          }
          const rasterRegion = documentOperation?.type === 'raster_region_set';
          return {
            operationId: row.operation_id || row.operationId,
            revision: row.revision,
            payloadSha256: expected,
            payload,
            changes: [],
            kind,
            structureEpoch,
            documentOperation,
            canvasId: rasterRegion ? documentOperation.canvasId : '__document__',
            frameId: rasterRegion ? documentOperation.frameId : '__document__',
            layerId: rasterRegion ? documentOperation.layerId : '__document__',
            canvasWidth: rasterRegion ? documentOperation.canvasWidth : 1,
            canvasHeight: rasterRegion ? documentOperation.canvasHeight : 1,
            undoOfOperationId: null,
          };
        }
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
          const { data, error } = await withTimeout('get-ops-since', supabase.rpc('pixisync_get_ops_since', {
            p_room_id: roomId,
            p_after_revision: cursor.toString(),
            p_limit: 500,
          }));
          if (error) throw error;
          const rows = data || [];
          for (const row of rows) {
            const operation = await normalizeOperation(row);
            await prepareBeforeReceive(operation);
            keeper.receive(operation);
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
        const record = { roomId, clientId, operationId, kind, structureEpoch, changes: canonicalChanges, canvasId, frameId, layerId, canvasWidth, canvasHeight, undoOfOperationId, payloadB64: codec.bytesToBase64(payload), payloadSha256 };
        await journal?.put?.(record);
        pendingLocalOperations.set(operationId, { optimistic: !guarded, record });
        // Broadcast is only a low-latency hint. Send the operation identity
        // before the RPC so peers can begin their authoritative fetch while
        // Postgres is assigning the canonical revision. No pixel payload is
        // trusted from this message; the RPC response remains the source of
        // truth and the post-commit hint below closes delivery races.
        void withTimeout('operation-hint-precommit', channel?.send({
          type: 'broadcast',
          event: 'operation-hint',
          payload: { operationId },
        })).catch(() => {});
        const { data, error } = await withTimeout('commit-operation', supabase.rpc('pixisync_commit_operation', {
          p_room_id: roomId, p_operation_id: operationId, p_client_id: clientId, p_kind: kind, p_structure_epoch: structureEpoch,
          p_codec_version: 1, p_canvas_id: canvasId, p_frame_id: frameId, p_layer_id: layerId, p_canvas_width: canvasWidth, p_canvas_height: canvasHeight,
          p_payload: `\\x${bytesToHex(payload)}`, p_payload_sha256: `\\x${payloadSha256}`, p_pixel_count: canonicalChanges.length, p_undo_of_operation_id: undoOfOperationId,
        }));
        if (error) {
          if (discardedOperationIds.delete(operationId)) {
            pendingLocalOperations.delete(operationId);
            Promise.resolve(journal?.remove?.(roomId, operationId)).catch(() => {});
            return { commit_status: 'discarded', discarded: true };
          }
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
        await prepareBeforeReceive(confirmedOperation);
        const confirmation = keeper.receive(confirmedOperation);
        if (confirmation.status === 'duplicate' && pendingLocalOperations.has(operationId)) {
          pendingLocalOperations.delete(operationId);
          confirmedOperationIds.add(operationId);
          Promise.resolve(journal?.remove?.(roomId, operationId)).catch(() => {});
          onLocalConfirmed(confirmedOperation);
        }
        // The commit response is already authoritative and the contiguous
        // operation was applied above. Do not keep Undo/Redo waiting for a
        // redundant tail fetch or Broadcast acknowledgement. A real gap still
        // blocks here until recovery; routine catch-up continues in background.
        if (confirmation.status === 'gap' || confirmation.status === 'buffered' || confirmation.status === 'recovery') {
          await recover('rpc-commit-gap');
        } else {
          void recover('rpc-commit').catch(() => {});
        }
        void withTimeout('operation-hint', channel?.send({
          type: 'broadcast',
          event: 'operation-hint',
          payload: { revision: committed?.revision || null, operationId },
        })).catch(() => {});
        return committed;
      }
      async function commitDocument({ operationId, structureEpoch = 0, baseRevision = keeper.confirmedRevision, documentOperation }) {
        if (!documentCodec?.encode) throw new Error('PiXiSYNC realtime: document-codec-unavailable');
        const payload = documentCodec.encode(documentOperation);
        const payloadSha256 = await codec.sha256Hex(payload);
        const record = {
          roomId,
          clientId,
          operationId,
          kind: 'document_patch',
          structureEpoch,
          baseRevision: String(baseRevision),
          documentOperation,
          payloadB64: codec.bytesToBase64(payload),
          payloadSha256,
        };
        await journal?.put?.(record);
        pendingLocalOperations.set(operationId, { optimistic: true, record });
        void withTimeout('document-operation-hint-precommit', channel?.send({
          type: 'broadcast',
          event: 'operation-hint',
          payload: { operationId },
        })).catch(() => {});
        let response;
        try {
          response = await withTimeout('commit-document-operation', supabase.rpc('pixisync_commit_document_operation', {
            p_room_id: roomId,
            p_operation_id: operationId,
            p_client_id: clientId,
            p_base_revision: String(baseRevision),
            p_structure_epoch: structureEpoch,
            p_payload: `\\x${bytesToHex(payload)}`,
            p_payload_sha256: `\\x${payloadSha256}`,
          }));
          if (response?.error) throw response.error;
        } catch (error) {
          if (discardedOperationIds.delete(operationId)) {
            pendingLocalOperations.delete(operationId);
            Promise.resolve(journal?.remove?.(roomId, operationId)).catch(() => {});
            return { commit_status: 'discarded', discarded: true };
          }
          throw error;
        }
        const { data } = response;
        const committed = Array.isArray(data) ? data[0] : data;
        if (!committed?.revision || !committed?.payload_b64 || !committed?.payload_sha256_hex) {
          throw new Error('PiXiSYNC realtime: invalid-document-commit-response');
        }
        const confirmedOperation = await normalizeOperation({
          ...committed,
          operation_id: operationId,
          kind: 'document_patch',
          codec_version: 2,
        });
        await prepareBeforeReceive(confirmedOperation);
        const confirmation = keeper.receive(confirmedOperation);
        if (confirmation.status === 'duplicate' && pendingLocalOperations.has(operationId)) {
          pendingLocalOperations.delete(operationId);
          confirmedOperationIds.add(operationId);
          Promise.resolve(journal?.remove?.(roomId, operationId)).catch(() => {});
          onLocalConfirmed(confirmedOperation);
        }
        if (confirmation.status === 'gap' || confirmation.status === 'buffered' || confirmation.status === 'recovery') {
          await recover('rpc-document-commit-gap');
        } else {
          void recover('rpc-document-commit').catch(() => {});
        }
        void withTimeout('document-operation-hint', channel?.send({
          type: 'broadcast',
          event: 'operation-hint',
          payload: { revision: committed.revision, operationId },
        })).catch(() => {});
        return committed;
      }
      async function syncFrom(afterRevision = keeper.confirmedRevision) {
        const revision = BigInt(afterRevision);
        // A Realtime hint can finish recovery while the session bootstrap is
        // still waiting to fetch its initial tail.  Never move the order
        // keeper backward in that race: the controller may already have
        // applied the newer revision, and replaying it would corrupt the
        // controller/keeper agreement.
        if (keeper.confirmedRevision < revision) keeper.reset(revision);
        await fetchSince(keeper.confirmedRevision);
        return keeper.confirmedRevision;
      }
      async function replayPendingJournal() {
        const records = await journal?.list?.(roomId, clientId) || [];
        for (const record of records) {
          if (record?.kind === 'document_patch') await commitDocument(record);
          else await commit(record);
        }
        return records.length;
      }
      function discardPixelPendingBeforeEpoch(structureEpoch) {
        const nextEpoch = Math.max(0, Number(structureEpoch) || 0);
        const discarded = [];
        pendingLocalOperations.forEach((pending, operationId) => {
          const record = pending?.record;
          if (record?.kind === 'document_patch' || Number(record?.structureEpoch) >= nextEpoch) return;
          pendingLocalOperations.delete(operationId);
          discardedOperationIds.add(operationId);
          discarded.push(operationId);
          Promise.resolve(journal?.remove?.(roomId, operationId)).catch(() => {});
        });
        return discarded;
      }
      function discardPendingOperation(operationId) {
        const normalizedId = String(operationId || '');
        if (!normalizedId || !pendingLocalOperations.has(normalizedId)) return false;
        pendingLocalOperations.delete(normalizedId);
        discardedOperationIds.add(normalizedId);
        Promise.resolve(journal?.remove?.(roomId, normalizedId)).catch(() => {});
        return true;
      }
      async function sendBroadcast(event, payload = {}) {
        if (!channel) throw new Error('PiXiSYNC realtime: channel-not-started');
        return withTimeout(`broadcast-${event}`, channel.send({ type: 'broadcast', event, payload }));
      }
      async function trackPresence(payload = {}) {
        if (!channel?.track) return null;
        return withTimeout('presence-track', channel.track(payload));
      }
      async function untrackPresence() {
        if (!channel?.untrack) return null;
        return withTimeout('presence-untrack', channel.untrack());
      }
      async function stop() {
        started = false;
        if (channel) await withTimeout('remove-channel', supabase.removeChannel(channel));
        channel = null;
      }
      return {
        start,
        stop,
        commit,
        commitDocument,
        recover,
        syncFrom,
        replayPendingJournal,
        discardPixelPendingBeforeEpoch,
        discardPendingOperation,
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
