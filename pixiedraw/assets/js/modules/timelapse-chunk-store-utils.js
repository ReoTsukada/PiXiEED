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
          const record = fallback.get(projectKey) || { projectId: projectKey, byCanvas: {}, updatedAt: '' };
          fallback.set(projectKey, appendAndThin(record, canvasKey, values));
          return true;
        }
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const record = (await requestResult(store.get(projectKey))) || { projectId: projectKey, byCanvas: {}, updatedAt: '' };
        store.put(appendAndThin(record, canvasKey, values));
        await transactionDone(transaction);
        return true;
      });
    }

    async function readProject(projectId) {
      const projectKey = normalizeId(projectId);
      if (!projectKey) return { projectId: '', byCanvas: {} };
      await queue;
      const database = await openDatabase();
      if (!database) return clone(fallback.get(projectKey) || { projectId: projectKey, byCanvas: {} });
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const value = await requestResult(transaction.objectStore(STORE_NAME).get(projectKey));
      return clone(value || { projectId: projectKey, byCanvas: {} });
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

    return Object.freeze({ appendSnapshots, readProject, removeProject, flush: () => queue });
  }

  root.timelapseChunkStoreUtils = Object.freeze({ createTimelapseChunkStoreUtils });
})();
