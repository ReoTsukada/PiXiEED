(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  const DATABASE_NAME = 'pixieedraw-timelapse-operations-v1';
  const DATABASE_VERSION = 3;
  const EVENTS_STORE = 'timelapseEvents';
  const STATES_STORE = 'timelapseOperationStates';
  const META_STORE = 'timelapseProjectMeta';
  const CHECKPOINTS_STORE = 'timelapseCheckpoints';

  function createTimelapseOperationStore({ indexedDBRef = window.indexedDB } = {}) {
    let databasePromise = null;
    let localOperationSequence = 0;
    const projectWriteTails = new Map();

    const normalizeProjectId = value => String(value || '').trim();
    const createOperationId = () => {
      localOperationSequence += 1;
      const random = globalThis.crypto?.randomUUID?.();
      return random || `op-${Date.now().toString(36)}-${localOperationSequence.toString(36)}`;
    };

    function openDatabase() {
      if (databasePromise) return databasePromise;
      if (!indexedDBRef?.open) return Promise.reject(new Error('indexeddb-unavailable'));
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDBRef.open(DATABASE_NAME, DATABASE_VERSION);
        request.onerror = () => reject(request.error || new Error('timelapse-db-open-failed'));
        request.onupgradeneeded = () => {
          const db = request.result;
          const events = db.objectStoreNames.contains(EVENTS_STORE)
            ? request.transaction.objectStore(EVENTS_STORE)
            : db.createObjectStore(EVENTS_STORE, { keyPath: 'key' });
          if (!events.indexNames.contains('projectSequence')) {
            events.createIndex('projectSequence', ['projectId', 'sequence'], { unique: true });
          }
          const states = db.objectStoreNames.contains(STATES_STORE)
            ? request.transaction.objectStore(STATES_STORE)
            : db.createObjectStore(STATES_STORE, { keyPath: ['projectId', 'operationId'] });
          if (!states.indexNames.contains('projectUpdatedSequence')) {
            states.createIndex('projectUpdatedSequence', ['projectId', 'updatedSequence'], { unique: false });
          }
          if (!db.objectStoreNames.contains(META_STORE)) {
            db.createObjectStore(META_STORE, { keyPath: 'projectId' });
          }
          const checkpoints = db.objectStoreNames.contains(CHECKPOINTS_STORE)
            ? request.transaction.objectStore(CHECKPOINTS_STORE)
            : db.createObjectStore(CHECKPOINTS_STORE, { keyPath: 'key' });
          if (!checkpoints.indexNames.contains('projectId')) {
            checkpoints.createIndex('projectId', 'projectId', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
      });
      return databasePromise;
    }

    function requestAsPromise(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('timelapse-db-request-failed'));
      });
    }

    function transactionDone(transaction) {
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('timelapse-db-transaction-aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('timelapse-db-transaction-failed'));
      });
    }

    function buildForwardDiff(entry) {
      // Phase 1 intentionally records only pixel-patch forward data. Structure,
      // palette and full-snapshot operations become checkpoint boundaries.
      if (entry?.__historyEntryType !== 'pixel-patch') return null;
      try {
        return globalThis.structuredClone ? globalThis.structuredClone(entry) : entry;
      } catch (_error) {
        return null;
      }
    }

    function buildMetadata(entry, label) {
      return {
        historyLabel: String(label || entry?.historyLabel || entry?.label || ''),
        entryType: String(entry?.__historyEntryType || ''),
        kind: String(entry?.kind || ''),
        canvasId: String(entry?.canvasId || ''),
        frameId: String(entry?.frameId || ''),
        layerId: String(entry?.layerId || ''),
        resizeOffsetX: Math.round(Number(entry?.kind === 'resize-canvas' ? entry?.offsetX : 0) || 0),
        resizeOffsetY: Math.round(Number(entry?.kind === 'resize-canvas' ? entry?.offsetY : 0) || 0),
        requiresCheckpoint: entry?.__historyEntryType !== 'pixel-patch',
      };
    }

    async function recordOperation({ projectId, operationId, entry, label, checkpointSnapshot = null } = {}) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId || !operationId) return null;
      const db = await openDatabase();
      const transaction = db.transaction([EVENTS_STORE, STATES_STORE, META_STORE, CHECKPOINTS_STORE], 'readwrite');
      const events = transaction.objectStore(EVENTS_STORE);
      const states = transaction.objectStore(STATES_STORE);
      const meta = transaction.objectStore(META_STORE);
      const checkpoints = transaction.objectStore(CHECKPOINTS_STORE);
      const key = `${safeProjectId}\u0000${operationId}\u00000`;
      const existing = await requestAsPromise(events.get(key));
      if (existing) {
        await transactionDone(transaction);
        return existing.sequence;
      }
      const previousMeta = await requestAsPromise(meta.get(safeProjectId));
      const sequence = Math.max(1, Math.round(Number(previousMeta?.nextSequence) || 1));
      const now = new Date().toISOString();
      const checkpointKey = checkpointSnapshot && typeof checkpointSnapshot === 'object'
        ? `${safeProjectId}\u0000operation\u0000${operationId}`
        : '';
      events.put({
        key,
        projectId: safeProjectId,
        sequence,
        operationId,
        chunkIndex: 0,
        forwardDiff: buildForwardDiff(entry),
        metadata: buildMetadata(entry, label),
        checkpointKey,
        createdAt: now,
      });
      if (checkpointKey) {
        checkpoints.put({
          key: checkpointKey,
          projectId: safeProjectId,
          kind: 'operation-checkpoint',
          operationId,
          sequence,
          snapshot: globalThis.structuredClone ? globalThis.structuredClone(checkpointSnapshot) : checkpointSnapshot,
          createdAt: now,
        });
      }
      states.put({
        projectId: safeProjectId,
        operationId,
        state: 'active',
        updatedSequence: sequence,
        updatedAt: now,
      });
      meta.put({
        projectId: safeProjectId,
        nextSequence: sequence + 1,
        schemaVersion: DATABASE_VERSION,
        baselineKey: previousMeta?.baselineKey || '',
        createdAt: previousMeta?.createdAt || now,
        updatedAt: now,
      });
      await transactionDone(transaction);
      return sequence;
    }

    async function recordBaselineIfMissing({ projectId, snapshot } = {}) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId || !snapshot || typeof snapshot !== 'object') return false;
      const db = await openDatabase();
      const transaction = db.transaction([CHECKPOINTS_STORE, META_STORE], 'readwrite');
      const checkpoints = transaction.objectStore(CHECKPOINTS_STORE);
      const meta = transaction.objectStore(META_STORE);
      const key = `${safeProjectId}\u0000baseline`;
      const existing = await requestAsPromise(checkpoints.get(key));
      if (existing) {
        await transactionDone(transaction);
        return false;
      }
      const previousMeta = await requestAsPromise(meta.get(safeProjectId));
      const now = new Date().toISOString();
      checkpoints.put({
        key,
        projectId: safeProjectId,
        kind: 'baseline',
        snapshot: globalThis.structuredClone ? globalThis.structuredClone(snapshot) : snapshot,
        createdAt: now,
      });
      meta.put({
        projectId: safeProjectId,
        nextSequence: Math.max(1, Math.round(Number(previousMeta?.nextSequence) || 1)),
        schemaVersion: DATABASE_VERSION,
        baselineKey: key,
        createdAt: previousMeta?.createdAt || now,
        updatedAt: now,
      });
      await transactionDone(transaction);
      return true;
    }

    async function readBaseline(projectId) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId) return null;
      const db = await openDatabase();
      const transaction = db.transaction([CHECKPOINTS_STORE], 'readonly');
      const checkpoint = await requestAsPromise(
        transaction.objectStore(CHECKPOINTS_STORE).get(`${safeProjectId}\u0000baseline`)
      );
      await transactionDone(transaction);
      return checkpoint?.snapshot && typeof checkpoint.snapshot === 'object'
        ? (globalThis.structuredClone ? globalThis.structuredClone(checkpoint.snapshot) : checkpoint.snapshot)
        : null;
    }

    async function readOperationCheckpoint(projectId, checkpointKey) {
      const safeProjectId = normalizeProjectId(projectId);
      const safeKey = String(checkpointKey || '').trim();
      if (!safeProjectId || !safeKey) return null;
      const db = await openDatabase();
      const transaction = db.transaction([CHECKPOINTS_STORE], 'readonly');
      const checkpoint = await requestAsPromise(transaction.objectStore(CHECKPOINTS_STORE).get(safeKey));
      await transactionDone(transaction);
      if (checkpoint?.projectId !== safeProjectId || !checkpoint?.snapshot) return null;
      return globalThis.structuredClone ? globalThis.structuredClone(checkpoint.snapshot) : checkpoint.snapshot;
    }

    async function setOperationState({ projectId, operationId, state, metadata = null } = {}) {
      const safeProjectId = normalizeProjectId(projectId);
      const safeState = ['active', 'undone', 'discarded'].includes(state) ? state : '';
      if (!safeProjectId || !operationId || !safeState) return false;
      const db = await openDatabase();
      const transaction = db.transaction([EVENTS_STORE, STATES_STORE, META_STORE], 'readwrite');
      const events = transaction.objectStore(EVENTS_STORE);
      const states = transaction.objectStore(STATES_STORE);
      const meta = transaction.objectStore(META_STORE);
      const previousMeta = await requestAsPromise(meta.get(safeProjectId));
      const previousState = await requestAsPromise(states.get([safeProjectId, operationId]));
      const eventKey = `${safeProjectId}\u0000${operationId}\u00000`;
      const previousEvent = await requestAsPromise(events.get(eventKey));
      if (!previousState) {
        transaction.abort();
        return false;
      }
      const nextMetadata = metadata && typeof metadata === 'object' ? metadata : null;
      const metadataChanged = Boolean(nextMetadata && previousEvent
        && JSON.stringify(previousEvent.metadata || {}) !== JSON.stringify(nextMetadata));
      if (metadataChanged) events.put({ ...previousEvent, metadata: nextMetadata });
      if (previousState.state === safeState) {
        await transactionDone(transaction);
        return true;
      }
      const sequence = Math.max(1, Math.round(Number(previousMeta?.nextSequence) || 1));
      const now = new Date().toISOString();
      states.put({ ...previousState, state: safeState, updatedSequence: sequence, updatedAt: now });
      meta.put({
        projectId: safeProjectId,
        nextSequence: sequence + 1,
        schemaVersion: DATABASE_VERSION,
        baselineKey: previousMeta?.baselineKey || '',
        createdAt: previousMeta?.createdAt || now,
        updatedAt: now,
      });
      await transactionDone(transaction);
      return true;
    }

    async function listActiveEvents(projectId) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId) return [];
      const db = await openDatabase();
      const transaction = db.transaction([EVENTS_STORE, STATES_STORE], 'readonly');
      const events = transaction.objectStore(EVENTS_STORE);
      const states = transaction.objectStore(STATES_STORE);
      const range = IDBKeyRange.bound([safeProjectId, 0], [safeProjectId, Number.MAX_SAFE_INTEGER]);
      const candidates = await requestAsPromise(events.index('projectSequence').getAll(range));
      const resolved = await Promise.all(candidates.map(async event => {
        const state = await requestAsPromise(states.get([safeProjectId, event.operationId]));
        return state?.state === 'active' ? event : null;
      }));
      await transactionDone(transaction);
      return resolved.filter(Boolean).sort((left, right) => left.sequence - right.sequence);
    }

    async function removeProject(projectId) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId) return false;
      const db = await openDatabase();
      const transaction = db.transaction([EVENTS_STORE, STATES_STORE, META_STORE, CHECKPOINTS_STORE], 'readwrite');
      const events = transaction.objectStore(EVENTS_STORE);
      const states = transaction.objectStore(STATES_STORE);
      const meta = transaction.objectStore(META_STORE);
      const checkpoints = transaction.objectStore(CHECKPOINTS_STORE);
      const eventRange = IDBKeyRange.bound([safeProjectId, 0], [safeProjectId, Number.MAX_SAFE_INTEGER]);
      const eventKeys = await requestAsPromise(events.index('projectSequence').getAllKeys(eventRange));
      const stateRange = IDBKeyRange.bound([safeProjectId, 0], [safeProjectId, Number.MAX_SAFE_INTEGER]);
      const stateKeys = await requestAsPromise(states.index('projectUpdatedSequence').getAllKeys(stateRange));
      eventKeys.forEach(key => events.delete(key));
      stateKeys.forEach(key => states.delete(key));
      meta.delete(safeProjectId);
      const checkpointKeys = await requestAsPromise(checkpoints.index('projectId').getAllKeys(safeProjectId));
      checkpointKeys.forEach(key => checkpoints.delete(key));
      await transactionDone(transaction);
      return Boolean(eventKeys.length || stateKeys.length || checkpointKeys.length);
    }

    function queueOperation(projectId, entry, label, checkpointSnapshot = null) {
      const operationId = String(entry?.timelapseOperationId || createOperationId());
      if (entry && typeof entry === 'object') entry.timelapseOperationId = operationId;
      queueProjectWrite(projectId, () => recordOperation({ projectId, operationId, entry, label, checkpointSnapshot }));
      return operationId;
    }

    function queueBaseline(projectId, snapshot) {
      queueProjectWrite(projectId, () => recordBaselineIfMissing({ projectId, snapshot }));
    }

    function queueState(projectId, entry, state) {
      const operationId = String(entry?.timelapseOperationId || '');
      if (!operationId) return;
      queueProjectWrite(projectId, () => setOperationState({
        projectId,
        operationId,
        state,
        metadata: buildMetadata(entry, entry?.historyLabel || entry?.label),
      }));
    }

    function queueProjectWrite(projectId, task) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId || typeof task !== 'function') return;
      const previous = projectWriteTails.get(safeProjectId) || Promise.resolve();
      // Serialize writes per project: every operation still schedules its
      // IndexedDB transaction at the commit boundary, but cannot duplicate a
      // sequence when a quick Undo/Redo follows in the same event turn.
      const next = previous.catch(() => undefined).then(task);
      projectWriteTails.set(safeProjectId, next);
      void next.catch(error => {
        console.warn('[pixiedraw:timelapse] operation persistence failed', error);
      }).finally(() => {
        if (projectWriteTails.get(safeProjectId) === next) projectWriteTails.delete(safeProjectId);
      });
    }

    async function flush(projectId = '') {
      const safeProjectId = normalizeProjectId(projectId);
      if (safeProjectId) {
        const tail = projectWriteTails.get(safeProjectId);
        if (tail) await tail;
        return;
      }
      await Promise.all(Array.from(projectWriteTails.values()));
    }

    return {
      queueOperation,
      queueBaseline,
      queueState,
      flush,
      recordOperation,
      recordBaselineIfMissing,
      readBaseline,
      readOperationCheckpoint,
      setOperationState,
      listActiveEvents,
      removeProject,
    };
  }

  root.timelapseOperationStore = { createTimelapseOperationStore };
})();
