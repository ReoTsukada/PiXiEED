(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createTimelapseChunkStoreUtils({
    indexedDBApi = window.indexedDB,
    databaseName = 'pixieedraw-timelapse-v1',
    databaseVersion = 2,
    maxSnapshotsPerCanvas = 120,
  } = {}) {
    // V1 kept every timelapse payload in one project record. A large base
    // snapshot made IndexedDB clone the whole record on every write. Keep V1
    // read-only for migration and write chunks/bases to separate V2 stores.
    const LEGACY_STORE_NAME = 'projects';
    const CHUNK_STORE_NAME = 'projectChunks';
    const BASE_STORE_NAME = 'baseSnapshots';
    const fallbackChunks = new Map();
    const fallbackBases = new Map();
    let databasePromise = null;
    let queue = Promise.resolve();

    const normalizeId = value => String(value || '').trim();
    const makeBaseKey = (projectId, canvasId) => `${normalizeId(projectId)}:${normalizeId(canvasId)}`;
    const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : value;
    const enqueue = task => {
      const next = queue.then(task, task);
      queue = next.catch(() => {});
      return next;
    };
    const requestResult = request => new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
    const transactionDone = transaction => new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(true);
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
    });

    function normalizeRecord(record = null, projectId = '') {
      const source = record && typeof record === 'object' ? record : {};
      return {
        ...source,
        projectId: normalizeId(source.projectId || projectId),
        byCanvas: source.byCanvas && typeof source.byCanvas === 'object' && !Array.isArray(source.byCanvas)
          ? source.byCanvas
          : {},
        baseSnapshotsByCanvas: source.baseSnapshotsByCanvas
          && typeof source.baseSnapshotsByCanvas === 'object'
          && !Array.isArray(source.baseSnapshotsByCanvas)
          ? source.baseSnapshotsByCanvas
          : {},
      };
    }

    async function openDatabase() {
      if (!indexedDBApi || typeof indexedDBApi.open !== 'function') return null;
      if (!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
          const request = indexedDBApi.open(databaseName, databaseVersion);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(LEGACY_STORE_NAME)) {
              request.result.createObjectStore(LEGACY_STORE_NAME, { keyPath: 'projectId' });
            }
            if (!request.result.objectStoreNames.contains(CHUNK_STORE_NAME)) {
              request.result.createObjectStore(CHUNK_STORE_NAME, { keyPath: 'projectId' });
            }
            if (!request.result.objectStoreNames.contains(BASE_STORE_NAME)) {
              const baseStore = request.result.createObjectStore(BASE_STORE_NAME, { keyPath: 'key' });
              baseStore.createIndex('projectId', 'projectId', { unique: false });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('Timelapse database could not be opened.'));
          request.onblocked = () => reject(new Error('Timelapse database upgrade was blocked.'));
        }).catch(error => {
          databasePromise = null;
          throw error;
        });
      }
      return databasePromise;
    }

    function appendAndThin(record, canvasId, snapshots) {
      record = normalizeRecord(record, record?.projectId || '');
      const list = Array.isArray(record.byCanvas[canvasId]) ? record.byCanvas[canvasId] : [];
      snapshots.forEach(snapshot => {
        if (snapshot) list.push(clone(snapshot));
      });
      const max = Math.max(2, Math.round(Number(maxSnapshotsPerCanvas) || 120));
      while (list.length > max) {
        for (let index = list.length - 2; index >= 1 && list.length > max; index -= 2) {
          list.splice(index, 1);
        }
      }
      record.byCanvas[canvasId] = list;
      record.updatedAt = new Date().toISOString();
      return record;
    }

    async function appendSnapshots(projectId, canvasId, snapshots = []) {
      const projectKey = normalizeId(projectId);
      const canvasKey = normalizeId(canvasId);
      const values = Array.isArray(snapshots) ? snapshots.filter(Boolean) : [];
      if (!projectKey || !canvasKey || !values.length) return false;
      return enqueue(async () => {
        const database = await openDatabase();
        if (!database) {
          const record = normalizeRecord(fallbackChunks.get(projectKey), projectKey);
          fallbackChunks.set(projectKey, appendAndThin(record, canvasKey, values));
          return true;
        }
        const transaction = database.transaction(CHUNK_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(CHUNK_STORE_NAME);
        const record = normalizeRecord(await requestResult(store.get(projectKey)), projectKey);
        store.put(appendAndThin(record, canvasKey, values));
        await transactionDone(transaction);
        return true;
      });
    }

    async function writeBaseSnapshot(projectId, canvasId, baseSnapshot = null) {
      const projectKey = normalizeId(projectId);
      const canvasKey = normalizeId(canvasId);
      if (!projectKey || !canvasKey || !baseSnapshot || typeof baseSnapshot !== 'object') return false;
      return enqueue(async () => {
        const database = await openDatabase();
        if (!database) {
          fallbackBases.set(makeBaseKey(projectKey, canvasKey), {
            key: makeBaseKey(projectKey, canvasKey),
            projectId: projectKey,
            canvasId: canvasKey,
            snapshot: clone(baseSnapshot),
            updatedAt: new Date().toISOString(),
          });
          return true;
        }
        const transaction = database.transaction(BASE_STORE_NAME, 'readwrite');
        // IndexedDB now clones only this one base snapshot, never the project
        // chunk record or an unrelated historical base.
        transaction.objectStore(BASE_STORE_NAME).put({
          key: makeBaseKey(projectKey, canvasKey),
          projectId: projectKey,
          canvasId: canvasKey,
          snapshot: baseSnapshot,
          updatedAt: new Date().toISOString(),
        });
        await transactionDone(transaction);
        return true;
      });
    }

    async function readProject(projectId) {
      const projectKey = normalizeId(projectId);
      if (!projectKey) return normalizeRecord(null, '');
      await queue;
      const database = await openDatabase();
      if (!database) {
        const chunks = normalizeRecord(fallbackChunks.get(projectKey), projectKey);
        const bases = {};
        fallbackBases.forEach(record => {
          if (record?.projectId === projectKey && record.canvasId) {
            bases[record.canvasId] = clone(record.snapshot);
          }
        });
        return { ...chunks, baseSnapshotsByCanvas: bases };
      }
      const transaction = database.transaction([CHUNK_STORE_NAME, BASE_STORE_NAME], 'readonly');
      const chunksRequest = transaction.objectStore(CHUNK_STORE_NAME).get(projectKey);
      const baseIndex = transaction.objectStore(BASE_STORE_NAME).index('projectId');
      const basesRequest = baseIndex.getAll(projectKey);
      const [chunkValue, baseValues] = await Promise.all([
        requestResult(chunksRequest),
        requestResult(basesRequest),
      ]);
      const bases = {};
      (Array.isArray(baseValues) ? baseValues : []).forEach(record => {
        if (record?.canvasId && record.snapshot && typeof record.snapshot === 'object') {
          bases[String(record.canvasId)] = record.snapshot;
        }
      });
      // Prefer the V2 stores as soon as either one contains data. V1 remains
      // readable for projects that have never been written in V2.
      if (chunkValue || Object.keys(bases).length) {
        return { ...normalizeRecord(chunkValue, projectKey), baseSnapshotsByCanvas: bases };
      }
      const legacyTransaction = database.transaction(LEGACY_STORE_NAME, 'readonly');
      const legacyValue = await requestResult(legacyTransaction.objectStore(LEGACY_STORE_NAME).get(projectKey));
      return normalizeRecord(legacyValue, projectKey);
    }

    async function removeProject(projectId) {
      const projectKey = normalizeId(projectId);
      if (!projectKey) return false;
      return enqueue(async () => {
        const database = await openDatabase();
        if (!database) {
          const removedChunks = fallbackChunks.delete(projectKey);
          let removedBases = false;
          fallbackBases.forEach((record, key) => {
            if (record?.projectId === projectKey) {
              fallbackBases.delete(key);
              removedBases = true;
            }
          });
          return removedChunks || removedBases;
        }
        const lookupTransaction = database.transaction(BASE_STORE_NAME, 'readonly');
        const baseKeys = await requestResult(lookupTransaction.objectStore(BASE_STORE_NAME).index('projectId').getAllKeys(projectKey));
        const transaction = database.transaction([LEGACY_STORE_NAME, CHUNK_STORE_NAME, BASE_STORE_NAME], 'readwrite');
        transaction.objectStore(LEGACY_STORE_NAME).delete(projectKey);
        transaction.objectStore(CHUNK_STORE_NAME).delete(projectKey);
        baseKeys.forEach(key => transaction.objectStore(BASE_STORE_NAME).delete(key));
        await transactionDone(transaction);
        return true;
      });
    }

    return Object.freeze({
      appendSnapshots,
      writeBaseSnapshot,
      readProject,
      removeProject,
      flush: () => queue,
    });
  }

  root.timelapseChunkStoreUtils = Object.freeze({ createTimelapseChunkStoreUtils });
})();
