(() => {
  if (typeof window === 'undefined') return;

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createTimelapseChunkStoreUtils({
    indexedDBApi = window.indexedDB,
    databaseName = 'pixieedraw-timelapse-v1',
    databaseVersion = 1,
    maxSnapshotsPerCanvas = 120,
  } = {}) {
    const STORE_NAME = 'projects';
    const fallback = new Map();
    let databasePromise = null;
    let queue = Promise.resolve();

    const normalizeId = value => String(value || '').trim();
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
            if (!request.result.objectStoreNames.contains(STORE_NAME)) {
              request.result.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
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
          const record = normalizeRecord(fallback.get(projectKey), projectKey);
          fallback.set(projectKey, appendAndThin(record, canvasKey, values));
          return true;
        }
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
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
          const record = normalizeRecord(fallback.get(projectKey), projectKey);
          record.baseSnapshotsByCanvas[canvasKey] = clone(baseSnapshot);
          record.updatedAt = new Date().toISOString();
          fallback.set(projectKey, record);
          return true;
        }
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const record = normalizeRecord(await requestResult(store.get(projectKey)), projectKey);
        // IndexedDB performs its own structured clone. Avoid building another
        // full JavaScript copy of a large all-frame baseline before put().
        record.baseSnapshotsByCanvas[canvasKey] = baseSnapshot;
        record.updatedAt = new Date().toISOString();
        store.put(record);
        await transactionDone(transaction);
        return true;
      });
    }

    async function readProject(projectId) {
      const projectKey = normalizeId(projectId);
      if (!projectKey) return normalizeRecord(null, '');
      await queue;
      const database = await openDatabase();
      if (!database) return clone(normalizeRecord(fallback.get(projectKey), projectKey));
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const value = await requestResult(transaction.objectStore(STORE_NAME).get(projectKey));
      // Values returned by IndexedDB are already detached structured clones.
      return normalizeRecord(value, projectKey);
    }

    async function removeProject(projectId) {
      const projectKey = normalizeId(projectId);
      if (!projectKey) return false;
      return enqueue(async () => {
        const database = await openDatabase();
        if (!database) return fallback.delete(projectKey);
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).delete(projectKey);
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
