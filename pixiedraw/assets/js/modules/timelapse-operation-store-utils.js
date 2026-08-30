(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  const DATABASE_NAME = 'pixieedraw-timelapse-operations-v1';
  const DATABASE_VERSION = 3;
  const EVENTS_STORE = 'timelapseEvents';
  const STATES_STORE = 'timelapseOperationStates';
  const META_STORE = 'timelapseProjectMeta';
  const CHECKPOINTS_STORE = 'timelapseCheckpoints';
  const DEFAULT_MAX_EVENT_COUNT = 240;
  const DEFAULT_MAX_EVENT_BYTES = 16 * 1024 * 1024;
  const DEFAULT_MAX_CHECKPOINT_COUNT = 16;
  const DEFAULT_MAX_CHECKPOINT_BYTES = 32 * 1024 * 1024;
  const USAGE_SCHEMA_VERSION = 1;
  const sharedRuntimesByIndexedDb = new WeakMap();

  function getSharedRuntime(indexedDBRef) {
    if (!indexedDBRef || (typeof indexedDBRef !== 'object' && typeof indexedDBRef !== 'function')) {
      return {
        databasePromise: null,
        localOperationSequence: 0,
        projectWriteTails: new Map(),
        projectRemovalPromises: new Map(),
        projectLifecycles: new Map(),
        statusListeners: new Set(),
        statusNoticeKeys: new Set(),
      };
    }
    let runtime = sharedRuntimesByIndexedDb.get(indexedDBRef);
    if (!runtime) {
      runtime = {
        databasePromise: null,
        localOperationSequence: 0,
        projectWriteTails: new Map(),
        projectRemovalPromises: new Map(),
        projectLifecycles: new Map(),
        statusListeners: new Set(),
        statusNoticeKeys: new Set(),
      };
      sharedRuntimesByIndexedDb.set(indexedDBRef, runtime);
    }
    return runtime;
  }

  function createTimelapseOperationStore({
    indexedDBRef = window.indexedDB,
    maxEventCount = DEFAULT_MAX_EVENT_COUNT,
    maxEventBytes = DEFAULT_MAX_EVENT_BYTES,
    maxCheckpointCount = DEFAULT_MAX_CHECKPOINT_COUNT,
    maxCheckpointBytes = DEFAULT_MAX_CHECKPOINT_BYTES,
    onStatus = null,
  } = {}) {
    const sharedRuntime = getSharedRuntime(indexedDBRef);
    const projectWriteTails = sharedRuntime.projectWriteTails;
    const maxEventCountLimit = Math.max(1, Math.round(Number(maxEventCount) || DEFAULT_MAX_EVENT_COUNT));
    const maxEventBytesLimit = Math.max(1024, Math.round(Number(maxEventBytes) || DEFAULT_MAX_EVENT_BYTES));
    const maxCheckpointCountLimit = Math.max(1, Math.round(Number(maxCheckpointCount) || DEFAULT_MAX_CHECKPOINT_COUNT));
    const maxCheckpointBytesLimit = Math.max(1024, Math.round(Number(maxCheckpointBytes) || DEFAULT_MAX_CHECKPOINT_BYTES));
    if (typeof onStatus === 'function') sharedRuntime.statusListeners.add(onStatus);

    const normalizeProjectId = value => String(value || '').trim();
    const createOperationId = () => {
      sharedRuntime.localOperationSequence += 1;
      const random = globalThis.crypto?.randomUUID?.();
      return random || `op-${Date.now().toString(36)}-${sharedRuntime.localOperationSequence.toString(36)}`;
    };

    function getProjectLifecycle(projectId) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId) return null;
      let lifecycle = sharedRuntime.projectLifecycles.get(safeProjectId);
      if (!lifecycle) {
        lifecycle = { epoch: 0, deleting: false, deleted: false };
        sharedRuntime.projectLifecycles.set(safeProjectId, lifecycle);
      }
      return lifecycle;
    }

    function canWriteProject(projectId) {
      const lifecycle = getProjectLifecycle(projectId);
      return Boolean(lifecycle && !lifecycle.deleting && !lifecycle.deleted);
    }

    function estimateValueBytes(value, seen = new Set()) {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'string') return value.length * 2;
      if (typeof value === 'number' || typeof value === 'boolean') return 8;
      if (typeof value !== 'object') return 0;
      if (typeof Blob !== 'undefined' && value instanceof Blob) return Math.max(0, Number(value.size) || 0);
      if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return value.byteLength;
      if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView?.(value)) return value.byteLength;
      if (seen.has(value)) return 0;
      seen.add(value);
      let total = 32;
      if (Array.isArray(value)) {
        value.forEach(item => { total += estimateValueBytes(item, seen); });
      } else {
        Object.keys(value).forEach(key => {
          total += key.length * 2;
          total += estimateValueBytes(value[key], seen);
        });
      }
      seen.delete(value);
      return total;
    }

    function notifyStatus(projectId, reason, details = {}) {
      const safeProjectId = normalizeProjectId(projectId);
      const noticeKey = `${safeProjectId}:${reason}`;
      if (sharedRuntime.statusNoticeKeys.has(noticeKey)) return;
      sharedRuntime.statusNoticeKeys.add(noticeKey);
      const message = reason === 'capacity'
        ? 'タイムラプスの記録を一時停止しました。編集内容の自動保存は続行しています。'
        : reason === 'write-failed'
          ? 'タイムラプスの記録に失敗しました。編集内容の自動保存は続行しています。'
          : 'タイムラプスの処理を一時停止しました。';
      sharedRuntime.statusListeners.forEach(listener => {
        try {
          listener(message, 'warn', { projectId: safeProjectId, reason, ...details });
        } catch (_error) {
          // A status surface must never break persistence.
        }
      });
    }

    function openDatabase() {
      if (sharedRuntime.databasePromise) return sharedRuntime.databasePromise;
      if (!indexedDBRef?.open) return Promise.reject(new Error('indexeddb-unavailable'));
      const pending = new Promise((resolve, reject) => {
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
      const guarded = pending.catch(error => {
        if (sharedRuntime.databasePromise === guarded) sharedRuntime.databasePromise = null;
        throw error;
      });
      sharedRuntime.databasePromise = guarded;
      return guarded;
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

    async function readProjectUsage(events, checkpoints, safeProjectId, previousMeta = null) {
      const hasStoredUsage = previousMeta
        && Number(previousMeta.usageSchemaVersion) === USAGE_SCHEMA_VERSION
        && Number.isSafeInteger(previousMeta.eventCount)
        && Number.isSafeInteger(previousMeta.checkpointCount)
        && Number.isSafeInteger(previousMeta.eventBytes)
        && Number.isSafeInteger(previousMeta.checkpointBytes);
      if (hasStoredUsage) {
        return {
          eventCount: Math.max(0, previousMeta.eventCount),
          eventBytes: Math.max(0, previousMeta.eventBytes),
          checkpointCount: Math.max(0, previousMeta.checkpointCount),
          checkpointBytes: Math.max(0, previousMeta.checkpointBytes),
        };
      }
      const eventRange = IDBKeyRange.bound([safeProjectId, 0], [safeProjectId, Number.MAX_SAFE_INTEGER]);
      const [eventValues, checkpointValues] = await Promise.all([
        requestAsPromise(events.index('projectSequence').getAll(eventRange)),
        requestAsPromise(checkpoints.index('projectId').getAll(safeProjectId)),
      ]);
      const safeEvents = Array.isArray(eventValues) ? eventValues : [];
      const safeCheckpoints = Array.isArray(checkpointValues) ? checkpointValues : [];
      return {
        eventCount: safeEvents.length,
        eventBytes: safeEvents.reduce((total, value) => total + estimateValueBytes(value), 0),
        checkpointCount: safeCheckpoints.length,
        checkpointBytes: safeCheckpoints.reduce((total, value) => total + estimateValueBytes(value), 0),
      };
    }

    function buildMetaRecord(previousMeta, safeProjectId, {
      sequence,
      now,
      usage,
      baselineKey = previousMeta?.baselineKey || '',
      recordingState = previousMeta?.recordingState || 'active',
      recordingPauseReason = previousMeta?.recordingPauseReason || '',
    } = {}) {
      return {
        projectId: safeProjectId,
        nextSequence: Math.max(1, Math.round(Number(sequence) || Number(previousMeta?.nextSequence) || 1)),
        schemaVersion: DATABASE_VERSION,
        usageSchemaVersion: USAGE_SCHEMA_VERSION,
        eventCount: Math.max(0, Math.round(Number(usage?.eventCount) || 0)),
        eventBytes: Math.max(0, Math.round(Number(usage?.eventBytes) || 0)),
        checkpointCount: Math.max(0, Math.round(Number(usage?.checkpointCount) || 0)),
        checkpointBytes: Math.max(0, Math.round(Number(usage?.checkpointBytes) || 0)),
        recordingState: recordingState === 'paused' ? 'paused' : 'active',
        recordingPauseReason: String(recordingPauseReason || ''),
        baselineKey: String(baselineKey || ''),
        createdAt: previousMeta?.createdAt || now,
        updatedAt: now,
      };
    }

    async function recordOperation({ projectId, operationId, entry, label, checkpointSnapshot = null } = {}) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId || !operationId || !canWriteProject(safeProjectId)) return null;
      const db = await openDatabase();
      if (!canWriteProject(safeProjectId)) return null;
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
      if (previousMeta?.recordingState === 'paused') {
        await transactionDone(transaction);
        return null;
      }
      const usage = await readProjectUsage(events, checkpoints, safeProjectId, previousMeta);
      const sequence = Math.max(1, Math.round(Number(previousMeta?.nextSequence) || 1));
      const now = new Date().toISOString();
      const checkpointKey = checkpointSnapshot && typeof checkpointSnapshot === 'object'
        ? `${safeProjectId}\u0000operation\u0000${operationId}`
        : '';
      const eventRecord = {
        key,
        projectId: safeProjectId,
        sequence,
        operationId,
        chunkIndex: 0,
        forwardDiff: buildForwardDiff(entry),
        metadata: buildMetadata(entry, label),
        checkpointKey,
        createdAt: now,
      };
      const checkpointRecord = checkpointKey
        ? {
          key: checkpointKey,
          projectId: safeProjectId,
          kind: 'operation-checkpoint',
          operationId,
          sequence,
          snapshot: globalThis.structuredClone ? globalThis.structuredClone(checkpointSnapshot) : checkpointSnapshot,
          createdAt: now,
        }
        : null;
      const nextUsage = {
        eventCount: usage.eventCount + 1,
        eventBytes: usage.eventBytes + estimateValueBytes(eventRecord),
        checkpointCount: usage.checkpointCount + (checkpointRecord ? 1 : 0),
        checkpointBytes: usage.checkpointBytes + (checkpointRecord ? estimateValueBytes(checkpointRecord) : 0),
      };
      const overLimit = nextUsage.eventCount > maxEventCountLimit
        || nextUsage.eventBytes > maxEventBytesLimit
        || nextUsage.checkpointCount > maxCheckpointCountLimit
        || nextUsage.checkpointBytes > maxCheckpointBytesLimit;
      if (overLimit) {
        meta.put(buildMetaRecord(previousMeta, safeProjectId, {
          sequence: Number(previousMeta?.nextSequence) || sequence,
          now,
          usage,
          recordingState: 'paused',
          recordingPauseReason: 'capacity',
        }));
        await transactionDone(transaction);
        notifyStatus(safeProjectId, 'capacity', {
          eventCount: usage.eventCount,
          eventBytes: usage.eventBytes,
          checkpointCount: usage.checkpointCount,
          checkpointBytes: usage.checkpointBytes,
        });
        return null;
      }
      events.put(eventRecord);
      if (checkpointRecord) checkpoints.put(checkpointRecord);
      states.put({
        projectId: safeProjectId,
        operationId,
        state: 'active',
        updatedSequence: sequence,
        updatedAt: now,
      });
      meta.put(buildMetaRecord(previousMeta, safeProjectId, {
        sequence: sequence + 1,
        now,
        usage: nextUsage,
      }));
      await transactionDone(transaction);
      return sequence;
    }

    async function recordBaselineIfMissing({ projectId, snapshot } = {}) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId || !snapshot || typeof snapshot !== 'object' || !canWriteProject(safeProjectId)) return false;
      const db = await openDatabase();
      if (!canWriteProject(safeProjectId)) return false;
      const transaction = db.transaction([EVENTS_STORE, CHECKPOINTS_STORE, META_STORE], 'readwrite');
      const events = transaction.objectStore(EVENTS_STORE);
      const checkpoints = transaction.objectStore(CHECKPOINTS_STORE);
      const meta = transaction.objectStore(META_STORE);
      const key = `${safeProjectId}\u0000baseline`;
      const existing = await requestAsPromise(checkpoints.get(key));
      if (existing) {
        await transactionDone(transaction);
        return false;
      }
      const previousMeta = await requestAsPromise(meta.get(safeProjectId));
      if (previousMeta?.recordingState === 'paused') {
        await transactionDone(transaction);
        return false;
      }
      const usage = await readProjectUsage(events, checkpoints, safeProjectId, previousMeta);
      const now = new Date().toISOString();
      const baselineRecord = {
        key,
        projectId: safeProjectId,
        kind: 'baseline',
        snapshot: globalThis.structuredClone ? globalThis.structuredClone(snapshot) : snapshot,
        createdAt: now,
      };
      const nextUsage = {
        ...usage,
        checkpointCount: usage.checkpointCount + 1,
        checkpointBytes: usage.checkpointBytes + estimateValueBytes(baselineRecord),
      };
      if (nextUsage.checkpointCount > maxCheckpointCountLimit
        || nextUsage.checkpointBytes > maxCheckpointBytesLimit) {
        meta.put(buildMetaRecord(previousMeta, safeProjectId, {
          sequence: Number(previousMeta?.nextSequence) || 1,
          now,
          usage,
          recordingState: 'paused',
          recordingPauseReason: 'capacity',
        }));
        await transactionDone(transaction);
        notifyStatus(safeProjectId, 'capacity', {
          eventCount: usage.eventCount,
          eventBytes: usage.eventBytes,
          checkpointCount: usage.checkpointCount,
          checkpointBytes: usage.checkpointBytes,
        });
        return false;
      }
      checkpoints.put(baselineRecord);
      meta.put(buildMetaRecord(previousMeta, safeProjectId, {
        sequence: Number(previousMeta?.nextSequence) || 1,
        now,
        usage: nextUsage,
        baselineKey: key,
      }));
      await transactionDone(transaction);
      return true;
    }

    async function readBaseline(projectId) {
      const safeProjectId = normalizeProjectId(projectId);
      const lifecycle = getProjectLifecycle(safeProjectId);
      if (!safeProjectId || lifecycle?.deleting || lifecycle?.deleted) return null;
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
      const lifecycle = getProjectLifecycle(safeProjectId);
      if (!safeProjectId || !safeKey || lifecycle?.deleting || lifecycle?.deleted) return null;
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
      if (!safeProjectId || !operationId || !safeState || !canWriteProject(safeProjectId)) return false;
      const db = await openDatabase();
      if (!canWriteProject(safeProjectId)) return false;
      const transaction = db.transaction([EVENTS_STORE, STATES_STORE, META_STORE, CHECKPOINTS_STORE], 'readwrite');
      const events = transaction.objectStore(EVENTS_STORE);
      const states = transaction.objectStore(STATES_STORE);
      const meta = transaction.objectStore(META_STORE);
      const checkpoints = transaction.objectStore(CHECKPOINTS_STORE);
      const previousMeta = await requestAsPromise(meta.get(safeProjectId));
      const previousState = await requestAsPromise(states.get([safeProjectId, operationId]));
      const eventKey = `${safeProjectId}\u0000${operationId}\u00000`;
      const previousEvent = await requestAsPromise(events.get(eventKey));
      if (!previousState) {
        await transactionDone(transaction);
        return false;
      }
      const usage = await readProjectUsage(events, checkpoints, safeProjectId, previousMeta);
      const nextMetadata = metadata && typeof metadata === 'object' ? metadata : null;
      const metadataChanged = Boolean(nextMetadata && previousEvent
        && JSON.stringify(previousEvent.metadata || {}) !== JSON.stringify(nextMetadata));
      const nextEvent = metadataChanged ? { ...previousEvent, metadata: nextMetadata } : previousEvent;
      if (metadataChanged) events.put(nextEvent);
      const nextUsage = metadataChanged
        ? {
          ...usage,
          eventBytes: Math.max(
            0,
            usage.eventBytes - estimateValueBytes(previousEvent) + estimateValueBytes(nextEvent)
          ),
        }
        : usage;
      const now = new Date().toISOString();
      if (previousState.state === safeState) {
        if (metadataChanged) {
          meta.put(buildMetaRecord(previousMeta, safeProjectId, {
            sequence: Number(previousMeta?.nextSequence) || 1,
            now,
            usage: nextUsage,
          }));
        }
        await transactionDone(transaction);
        return true;
      }
      const sequence = Math.max(1, Math.round(Number(previousMeta?.nextSequence) || 1));
      states.put({ ...previousState, state: safeState, updatedSequence: sequence, updatedAt: now });
      meta.put(buildMetaRecord(previousMeta, safeProjectId, {
        sequence: sequence + 1,
        now,
        usage: nextUsage,
      }));
      await transactionDone(transaction);
      return true;
    }

    async function listActiveEvents(projectId) {
      const safeProjectId = normalizeProjectId(projectId);
      const lifecycle = getProjectLifecycle(safeProjectId);
      if (!safeProjectId || lifecycle?.deleting || lifecycle?.deleted) return [];
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

    async function readProjectMeta(projectId) {
      const safeProjectId = normalizeProjectId(projectId);
      const lifecycle = getProjectLifecycle(safeProjectId);
      if (!safeProjectId || lifecycle?.deleting || lifecycle?.deleted) return null;
      const db = await openDatabase();
      const transaction = db.transaction([META_STORE], 'readonly');
      const value = await requestAsPromise(transaction.objectStore(META_STORE).get(safeProjectId));
      await transactionDone(transaction);
      return value && typeof value === 'object'
        ? (globalThis.structuredClone ? globalThis.structuredClone(value) : { ...value })
        : null;
    }

    async function readProjectRecordCounts(safeProjectId) {
      const db = await openDatabase();
      const transaction = db.transaction([EVENTS_STORE, STATES_STORE, META_STORE, CHECKPOINTS_STORE], 'readonly');
      const events = transaction.objectStore(EVENTS_STORE);
      const states = transaction.objectStore(STATES_STORE);
      const meta = transaction.objectStore(META_STORE);
      const checkpoints = transaction.objectStore(CHECKPOINTS_STORE);
      const eventRange = IDBKeyRange.bound([safeProjectId, 0], [safeProjectId, Number.MAX_SAFE_INTEGER]);
      const stateRange = IDBKeyRange.bound([safeProjectId, 0], [safeProjectId, Number.MAX_SAFE_INTEGER]);
      const [eventKeys, stateKeys, metaValue, checkpointKeys] = await Promise.all([
        requestAsPromise(events.index('projectSequence').getAllKeys(eventRange)),
        requestAsPromise(states.index('projectUpdatedSequence').getAllKeys(stateRange)),
        requestAsPromise(meta.get(safeProjectId)),
        requestAsPromise(checkpoints.index('projectId').getAllKeys(safeProjectId)),
      ]);
      await transactionDone(transaction);
      return {
        events: eventKeys.length,
        states: stateKeys.length,
        meta: metaValue ? 1 : 0,
        checkpoints: checkpointKeys.length,
      };
    }

    async function removeProject(projectId) {
      const safeProjectId = normalizeProjectId(projectId);
      if (!safeProjectId) return false;
      const existingRemoval = sharedRuntime.projectRemovalPromises.get(safeProjectId);
      if (existingRemoval) return existingRemoval;
      const lifecycle = getProjectLifecycle(safeProjectId);
      if (lifecycle.deleted) return false;
      lifecycle.deleting = true;
      lifecycle.epoch += 1;
      const removalPromise = (async () => {
        // Finish already queued writes before opening the delete transaction.
        // New writes are rejected while `deleting` is true.
        await flush(safeProjectId);
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
        const checkpointKeys = await requestAsPromise(checkpoints.index('projectId').getAllKeys(safeProjectId));
        eventKeys.forEach(key => events.delete(key));
        stateKeys.forEach(key => states.delete(key));
        meta.delete(safeProjectId);
        checkpointKeys.forEach(key => checkpoints.delete(key));
        await transactionDone(transaction);
        const remaining = await readProjectRecordCounts(safeProjectId);
        if (Object.values(remaining).some(count => count > 0)) {
          throw new Error('timelapse-project-delete-incomplete');
        }
        lifecycle.deleted = true;
        return Boolean(eventKeys.length || stateKeys.length || checkpointKeys.length);
      })().catch(error => {
        lifecycle.deleting = false;
        throw error;
      });
      sharedRuntime.projectRemovalPromises.set(safeProjectId, removalPromise);
      try {
        return await removalPromise;
      } finally {
        if (sharedRuntime.projectRemovalPromises.get(safeProjectId) === removalPromise) {
          sharedRuntime.projectRemovalPromises.delete(safeProjectId);
        }
      }
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
      if (!safeProjectId || typeof task !== 'function' || !canWriteProject(safeProjectId)) {
        return Promise.resolve(false);
      }
      const previous = projectWriteTails.get(safeProjectId) || Promise.resolve();
      // Serialize writes per project: every operation still schedules its
      // IndexedDB transaction at the commit boundary, but cannot duplicate a
      // sequence when a quick Undo/Redo follows in the same event turn.
      const next = previous.catch(() => undefined).then(task);
      projectWriteTails.set(safeProjectId, next);
      void next.catch(error => {
        notifyStatus(safeProjectId, 'write-failed', { error: String(error?.message || error || '') });
        console.warn('[pixiedraw:timelapse] operation persistence failed', error);
      }).finally(() => {
        if (projectWriteTails.get(safeProjectId) === next) projectWriteTails.delete(safeProjectId);
      });
      return next;
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
      readProjectMeta,
      removeProject,
    };
  }

  root.timelapseOperationStore = { createTimelapseOperationStore };
})();
