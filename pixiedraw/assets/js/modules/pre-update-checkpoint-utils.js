(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  const DB_NAME = 'pixieedraw-pre-update-checkpoints-dev';
  const DB_VERSION = 1;
  const SESSIONS_STORE = 'sessions';
  const RECORDS_STORE = 'records';
  const READY_SESSION_RETENTION = 3;

  function createPreUpdateCheckpointUtils({
    getOpenProjectTabs = () => [],
    getActiveOpenProjectTabId = () => '',
    getActiveProjectPayload = () => null,
    resolveInactiveProjectPayload = () => null,
    getBuildInfo = () => ({}),
    storeAdapter = null,
    indexedDb = typeof indexedDB === 'undefined' ? null : indexedDB,
    cryptoApi = typeof crypto === 'undefined' ? null : crypto,
    now = () => new Date().toISOString(),
    random = () => Math.random().toString(36).slice(2, 10),
    log = () => {},
  } = {}) {
    let inFlight = null;
    let lastStatus = Object.freeze({ status: 'idle', checkpointSessionId: '', ok: false });

    function clonePayload(value) {
      if (typeof structuredClone === 'function') return structuredClone(value);
      throw new Error('structuredClone is unavailable');
    }

    function normalizeBuildInfo(value = null) {
      const source = value && typeof value === 'object' ? value : {};
      return {
        edition: typeof source.edition === 'string' ? source.edition : 'dev',
        version: typeof source.version === 'string' ? source.version : 'unknown',
        buildId: typeof source.buildId === 'string' ? source.buildId : 'unknown',
      };
    }

    function canonicalize(value, seen = new WeakSet()) {
      if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
      if (typeof value === 'number') return Number.isFinite(value) ? value : { $number: String(value) };
      if (typeof value === 'bigint') return { $bigint: String(value) };
      if (typeof value === 'undefined') return { $undefined: true };
      if (value instanceof Date) return { $date: value.toISOString() };
      if (ArrayBuffer.isView(value)) {
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        return { $typed: value.constructor?.name || 'TypedArray', $bytes: Array.from(bytes) };
      }
      if (value instanceof ArrayBuffer) return { $arrayBuffer: Array.from(new Uint8Array(value)) };
      if (Array.isArray(value)) return value.map(entry => canonicalize(entry, seen));
      if (typeof value !== 'object') throw new Error(`Unsupported digest value: ${typeof value}`);
      if (seen.has(value)) throw new Error('Circular payload cannot be digested');
      seen.add(value);
      const result = {};
      Object.keys(value).sort().forEach(key => { result[key] = canonicalize(value[key], seen); });
      seen.delete(value);
      return result;
    }

    function canonicalStringify(value) {
      return JSON.stringify(canonicalize(value));
    }

    async function digestCanonical(value) {
      if (!cryptoApi?.subtle?.digest || typeof TextEncoder === 'undefined') {
        throw new Error('Web Crypto SHA-256 is unavailable');
      }
      const bytes = new TextEncoder().encode(canonicalStringify(value));
      const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
      return `sha256-${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }

    async function digestProjectRevision(payload) {
      const stablePayload = clonePayload(payload);
      // Packaged project creation refreshes this timestamp even when no edit occurred.
      delete stablePayload.updatedAt;
      return await digestCanonical(stablePayload);
    }

    function getDocumentSummary(payload = null) {
      const documentValue = payload?.document && typeof payload.document === 'object' ? payload.document : null;
      if (!documentValue) throw new Error('Project payload document is missing');
      const canvases = Array.isArray(documentValue.canvases) && documentValue.canvases.length
        ? documentValue.canvases
        : [documentValue];
      const frameCount = canvases.reduce((total, canvas) => total + (Array.isArray(canvas?.frames) ? canvas.frames.length : 0), 0);
      const layerCount = canvases.reduce((total, canvas) => total + (Array.isArray(canvas?.frames)
        ? canvas.frames.reduce((sum, frame) => sum + (Array.isArray(frame?.layers) ? frame.layers.length : 0), 0)
        : 0), 0);
      return {
        documentName: typeof documentValue.documentName === 'string' ? documentValue.documentName : '',
        canvasCount: canvases.length,
        canvasSizes: canvases.map(canvas => ({ width: Number(canvas?.width) || 0, height: Number(canvas?.height) || 0 })),
        activeCanvasId: typeof documentValue.activeCanvasId === 'string' ? documentValue.activeCanvasId : '',
        activeLayerId: typeof documentValue.activeLayerId === 'string' ? documentValue.activeLayerId : '',
        activeFrameId: typeof documentValue.activeFrameId === 'string' ? documentValue.activeFrameId : '',
        frameCount,
        layerCount,
      };
    }

    function createSessionId() {
      return `pre-update-${now().replace(/[^0-9]/g, '').slice(0, 17)}-${random()}`;
    }

    function createError(code, phase, message, failedSheetId = '') {
      const error = new Error(message || code);
      error.code = code;
      error.phase = phase;
      error.failedSheetId = failedSheetId;
      return error;
    }

    function emit(phase, details = {}) {
      log({ phase, ...details });
    }

    function openDatabase() {
      if (!indexedDb) return Promise.reject(new Error('IndexedDB is unavailable'));
      return new Promise((resolve, reject) => {
        const request = indexedDb.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SESSIONS_STORE)) db.createObjectStore(SESSIONS_STORE, { keyPath: 'checkpointSessionId' });
          if (!db.objectStoreNames.contains(RECORDS_STORE)) {
            const store = db.createObjectStore(RECORDS_STORE, { keyPath: 'key' });
            store.createIndex('checkpointSessionId', 'checkpointSessionId', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Pre-update checkpoint DB open failed'));
      });
    }

    function requestValue(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Pre-update checkpoint request failed'));
      });
    }

    function waitForTransaction(transaction, db) {
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { const error = transaction.error || new Error('Pre-update checkpoint transaction failed'); db.close(); reject(error); };
        transaction.onabort = () => { const error = transaction.error || new Error('Pre-update checkpoint transaction aborted'); db.close(); reject(error); };
      });
    }

    async function writeSession(session, records) {
      if (storeAdapter?.writeSession) return await storeAdapter.writeSession(session, records);
      const db = await openDatabase();
      try {
        const transaction = db.transaction([SESSIONS_STORE, RECORDS_STORE], 'readwrite');
        transaction.objectStore(SESSIONS_STORE).put(session);
        records.forEach(record => transaction.objectStore(RECORDS_STORE).put(record));
        await waitForTransaction(transaction, db);
      } catch (error) {
        try { db.close(); } catch (_) {}
        throw error;
      }
    }

    async function readSession(checkpointSessionId) {
      if (storeAdapter?.readSession) return await storeAdapter.readSession(checkpointSessionId);
      const db = await openDatabase();
      try {
        const transaction = db.transaction([SESSIONS_STORE, RECORDS_STORE], 'readonly');
        const sessionRequest = transaction.objectStore(SESSIONS_STORE).get(checkpointSessionId);
        const recordsRequest = transaction.objectStore(RECORDS_STORE).index('checkpointSessionId').getAll(checkpointSessionId);
        const [session, records] = await Promise.all([requestValue(sessionRequest), requestValue(recordsRequest), waitForTransaction(transaction, db)]);
        return { session: session || null, records: Array.isArray(records) ? records : [] };
      } catch (error) {
        try { db.close(); } catch (_) {}
        throw error;
      }
    }

    async function updateSession(session) {
      if (storeAdapter?.updateSession) return await storeAdapter.updateSession(session);
      const db = await openDatabase();
      try {
        const transaction = db.transaction([SESSIONS_STORE], 'readwrite');
        transaction.objectStore(SESSIONS_STORE).put(session);
        await waitForTransaction(transaction, db);
      } catch (error) {
        try { db.close(); } catch (_) {}
        throw error;
      }
    }

    async function invalidateSession(checkpointSessionId, reason = '') {
      if (storeAdapter?.invalidateSession) return await storeAdapter.invalidateSession(checkpointSessionId, reason);
      try {
        const { session, records } = await readSession(checkpointSessionId);
        if (!session) return;
        await updateSession({ ...session, status: 'failed', failureReason: reason, failedAt: now() });
        const db = await openDatabase();
        const transaction = db.transaction([RECORDS_STORE], 'readwrite');
        records.forEach(record => transaction.objectStore(RECORDS_STORE).delete(record.key));
        await waitForTransaction(transaction, db);
      } catch (_) {
        // A failed cleanup must not conceal the original structured failure.
      }
    }

    async function cleanupReadySessions() {
      if (storeAdapter?.cleanupReadySessions) return await storeAdapter.cleanupReadySessions(READY_SESSION_RETENTION);
      const db = await openDatabase();
      try {
        const transaction = db.transaction([SESSIONS_STORE], 'readonly');
        const sessionsRequest = transaction.objectStore(SESSIONS_STORE).getAll();
        const [sessions] = await Promise.all([requestValue(sessionsRequest), waitForTransaction(transaction, db)]);
        const ready = sessions.filter(session => session?.status === 'ready')
          .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
        const obsolete = ready.slice(READY_SESSION_RETENTION);
        if (!obsolete.length) return;
        const recordsDb = await openDatabase();
        const recordsTransaction = recordsDb.transaction([RECORDS_STORE], 'readonly');
        const recordsRequest = recordsTransaction.objectStore(RECORDS_STORE).getAll();
        const [records] = await Promise.all([requestValue(recordsRequest), waitForTransaction(recordsTransaction, recordsDb)]);
        const writeDb = await openDatabase();
        const writeTransaction = writeDb.transaction([SESSIONS_STORE, RECORDS_STORE], 'readwrite');
        obsolete.forEach(session => writeTransaction.objectStore(SESSIONS_STORE).delete(session.checkpointSessionId));
        records.filter(record => obsolete.some(session => session.checkpointSessionId === record.checkpointSessionId))
          .forEach(record => writeTransaction.objectStore(RECORDS_STORE).delete(record.key));
        await waitForTransaction(writeTransaction, writeDb);
      } catch (_) {
        try { db.close(); } catch (_) {}
      }
    }

    async function snapshotOpenTabs() {
      const tabs = Array.isArray(getOpenProjectTabs()) ? getOpenProjectTabs().slice() : [];
      const activeSheetId = String(getActiveOpenProjectTabId() || tabs[0]?.id || '');
      if (!tabs.length || !activeSheetId) throw createError('ERR_PRE_UPDATE_SNAPSHOT_FAILED', 'prepare', 'No open project sheets are available');
      const records = [];
      for (let orderIndex = 0; orderIndex < tabs.length; orderIndex += 1) {
        const tab = tabs[orderIndex];
        const projectTabId = String(tab?.id || '');
        if (!projectTabId) throw createError('ERR_PRE_UPDATE_PAYLOAD_INVALID', 'prepare', 'Sheet tab ID is missing');
        const active = projectTabId === activeSheetId;
        const rawPayload = active ? getActiveProjectPayload(tab) : resolveInactiveProjectPayload(tab);
        if (!rawPayload || typeof rawPayload !== 'object') {
          throw createError('ERR_PRE_UPDATE_SNAPSHOT_FAILED', 'prepare', 'Sheet payload is unavailable', projectTabId);
        }
        let payload;
        try { payload = clonePayload(rawPayload); } catch (error) {
          throw createError('ERR_PRE_UPDATE_PAYLOAD_INVALID', 'prepare', error?.message || 'Sheet payload cannot be cloned', projectTabId);
        }
        let summary;
        try { summary = getDocumentSummary(payload); } catch (error) {
          throw createError('ERR_PRE_UPDATE_PAYLOAD_INVALID', 'prepare', error?.message || 'Sheet payload document is invalid', projectTabId);
        }
        let payloadDigest;
        try { payloadDigest = await digestCanonical(payload); } catch (error) {
          throw createError('ERR_PRE_UPDATE_DIGEST_FAILED', 'prepare', error?.message || 'Payload digest failed', projectTabId);
        }
        let revisionDigest;
        try { revisionDigest = await digestProjectRevision(payload); } catch (error) {
          throw createError('ERR_PRE_UPDATE_DIGEST_FAILED', 'prepare', error?.message || 'Revision digest failed', projectTabId);
        }
        const metadata = {
          projectTabId,
          projectId: typeof tab?.projectId === 'string' ? tab.projectId : '',
          sheetId: typeof tab?.sheetRuntimeId === 'string' ? tab.sheetRuntimeId : projectTabId,
          sourceKind: typeof tab?.sourceKind === 'string' ? tab.sourceKind : 'unknown',
          active,
          orderIndex,
          ...summary,
        };
        let metadataDigest;
        try { metadataDigest = await digestCanonical(metadata); } catch (error) {
          throw createError('ERR_PRE_UPDATE_DIGEST_FAILED', 'prepare', error?.message || 'Metadata digest failed', projectTabId);
        }
        records.push({ metadata, payload, payloadDigest, metadataDigest, revisionDigest });
      }
      return { activeSheetId, sheetOrder: records.map(record => record.metadata.projectTabId), records };
    }

    async function verifyReadback(session, readback) {
      if (!readback.session || readback.session.checkpointSessionId !== session.checkpointSessionId) {
        throw createError('ERR_PRE_UPDATE_READBACK_FAILED', 'readback', 'Checkpoint session was not found');
      }
      if (readback.records.length !== session.sheetCount) {
        throw createError('ERR_PRE_UPDATE_VERIFY_FAILED', 'verify', 'Checkpoint record count differs');
      }
      const byTabId = new Map(readback.records.map(record => [record.projectTabId, record]));
      for (const expected of session.records) {
        const actual = byTabId.get(expected.projectTabId);
        if (!actual) throw createError('ERR_PRE_UPDATE_READBACK_FAILED', 'readback', 'Checkpoint record is missing', expected.projectTabId);
        const expectedFields = ['projectId', 'sheetId', 'sourceKind', 'orderIndex', 'payloadDigest', 'metadataDigest'];
        if (expectedFields.some(field => actual[field] !== expected[field])) {
          throw createError('ERR_PRE_UPDATE_VERIFY_FAILED', 'verify', 'Checkpoint record metadata differs', expected.projectTabId);
        }
        const [payloadDigest, metadataDigest] = await Promise.all([digestCanonical(actual.payload), digestCanonical(actual.metadata)]);
        if (payloadDigest !== expected.payloadDigest || metadataDigest !== expected.metadataDigest) {
          throw createError('ERR_PRE_UPDATE_VERIFY_FAILED', 'verify', 'Checkpoint digest differs', expected.projectTabId);
        }
      }
      if (readback.session.activeSheetId !== session.activeSheetId
        || canonicalStringify(readback.session.sheetOrder) !== canonicalStringify(session.sheetOrder)
        || readback.session.sheetCount !== session.sheetCount
        || canonicalStringify(readback.session.buildInfo) !== canonicalStringify(session.buildInfo)) {
        throw createError('ERR_PRE_UPDATE_VERIFY_FAILED', 'verify', 'Checkpoint session metadata differs');
      }
    }

    async function preparePreUpdateCheckpoint({ targetBuildInfo = null } = {}) {
      if (inFlight) return { ok: false, status: 'failed', code: 'ERR_PRE_UPDATE_CHECKPOINT_IN_FLIGHT', phase: 'prepare', recoverable: true };
      const checkpointSessionId = createSessionId();
      const buildInfo = normalizeBuildInfo(targetBuildInfo || getBuildInfo());
      inFlight = (async () => {
        let phase = 'prepare';
        let session = null;
        try {
          emit('prepare-start', { checkpointSessionId, sheetCount: 0, targetVersion: buildInfo.version, targetBuildId: buildInfo.buildId });
          const snapshot = await snapshotOpenTabs();
          emit('snapshot-complete', { checkpointSessionId, sheetCount: snapshot.records.length, activeSheetId: snapshot.activeSheetId });
          session = {
            schemaVersion: 1,
            checkpointKind: 'pre-update',
            checkpointSessionId,
            createdAt: now(),
            status: 'writing',
            buildInfo,
            activeSheetId: snapshot.activeSheetId,
            sheetOrder: snapshot.sheetOrder,
            sheetCount: snapshot.records.length,
            records: snapshot.records.map(record => ({ ...record.metadata, payloadDigest: record.payloadDigest, metadataDigest: record.metadataDigest })),
          };
          const records = snapshot.records.map(record => ({
            key: `${checkpointSessionId}:${record.metadata.projectTabId}`,
            checkpointSessionId,
            ...record.metadata,
            metadata: record.metadata,
            payload: record.payload,
            payloadDigest: record.payloadDigest,
            metadataDigest: record.metadataDigest,
          }));
          phase = 'write';
          emit('write-start', { checkpointSessionId, sheetCount: records.length, activeSheetId: snapshot.activeSheetId });
          await writeSession(session, records);
          emit('write-complete', { checkpointSessionId, sheetCount: records.length });
          phase = 'readback';
          emit('readback-start', { checkpointSessionId, sheetCount: records.length });
          const readback = await readSession(checkpointSessionId);
          phase = 'verify';
          await verifyReadback(session, readback);
          const current = await snapshotOpenTabs();
          const revisionChanged = current.activeSheetId !== snapshot.activeSheetId
            || canonicalStringify(current.sheetOrder) !== canonicalStringify(snapshot.sheetOrder)
            || current.records.length !== snapshot.records.length
            || current.records.some((record, index) => record.revisionDigest !== snapshot.records[index]?.revisionDigest);
          if (revisionChanged) {
            throw createError('ERR_PRE_UPDATE_REVISION_CHANGED', 'verify', 'Project changed while checkpoint was being verified');
          }
          phase = 'commit';
          const readySession = { ...session, status: 'ready', verifiedAt: now(), verifiedRecordCount: records.length };
          await updateSession(readySession);
          cleanupReadySessions();
          const result = { ok: true, checkpointSessionId, status: 'ready', sheetCount: records.length, verifiedRecordCount: records.length, createdAt: readySession.createdAt };
          lastStatus = Object.freeze(result);
          emit('verify-complete', { checkpointSessionId, sheetCount: records.length, verifiedRecordCount: records.length });
          emit('ready', { checkpointSessionId, sheetCount: records.length, verifiedRecordCount: records.length });
          return result;
        } catch (error) {
          const code = error?.code || (phase === 'write' ? 'ERR_PRE_UPDATE_WRITE_FAILED' : (phase === 'readback' ? 'ERR_PRE_UPDATE_READBACK_FAILED' : (phase === 'commit' ? 'ERR_PRE_UPDATE_SESSION_COMMIT_FAILED' : 'ERR_PRE_UPDATE_VERIFY_FAILED')));
          await invalidateSession(checkpointSessionId, code);
          const result = { ok: false, checkpointSessionId, status: 'failed', code, phase: error?.phase || phase, failedSheetId: error?.failedSheetId || '', recoverable: true };
          lastStatus = Object.freeze(result);
          emit('failed', { checkpointSessionId, code, failedSheetId: result.failedSheetId, reason: error?.message || code });
          return result;
        } finally {
          emit('cleanup', { checkpointSessionId, status: lastStatus.status });
          inFlight = null;
        }
      })();
      return await inFlight;
    }

    return Object.freeze({
      DB_NAME,
      DB_VERSION,
      SESSIONS_STORE,
      RECORDS_STORE,
      canonicalStringify,
      digestCanonical,
      getStatus: () => lastStatus,
      readSession,
      preparePreUpdateCheckpoint,
    });
  }

  root.preUpdateCheckpointUtils = Object.freeze({ createPreUpdateCheckpointUtils });
})();
