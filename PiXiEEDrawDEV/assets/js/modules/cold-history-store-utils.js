(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createColdHistoryStoreUtils({
    indexedDBApi = window.indexedDB,
    databaseName = 'pixieedraw-cold-history-v1',
    databaseVersion = 1,
    chunkSize = 20,
    maxEntriesPerDirection = 1000,
  } = {}) {
    const META_STORE = 'projectMeta';
    const CHUNK_STORE = 'historyChunks';
    const safeChunkSize = Math.max(1, Math.round(Number(chunkSize) || 20));
    const safeMaxEntries = Math.max(safeChunkSize, Math.round(Number(maxEntriesPerDirection) || 1000));
    const fallbackProjects = new Map();
    let databasePromise = null;
    let operationQueue = Promise.resolve();

    function normalizeProjectId(projectId = '') {
      return String(projectId || '').trim();
    }

    function normalizeDirection(direction = '') {
      return direction === 'future' ? 'future' : 'past';
    }

    function createEmptyMeta(projectId) {
      return {
        projectId,
        version: 1,
        nextSequence: 1,
        pastKeys: [],
        futureKeys: [],
        pastCount: 0,
        futureCount: 0,
        updatedAt: '',
      };
    }

    function cloneEntry(entry) {
      if (typeof structuredClone === 'function') {
        return structuredClone(entry);
      }
      return entry;
    }

    function enqueue(task) {
      const next = operationQueue.then(task, task);
      operationQueue = next.catch(() => {});
      return next;
    }

    function requestResult(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
      });
    }

    function transactionDone(transaction) {
      return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve(true);
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
      });
    }

    async function openDatabase() {
      if (!indexedDBApi || typeof indexedDBApi.open !== 'function') {
        return null;
      }
      if (!databasePromise) {
        databasePromise = new Promise((resolve, reject) => {
          const request = indexedDBApi.open(databaseName, databaseVersion);
          request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(META_STORE)) {
              database.createObjectStore(META_STORE, { keyPath: 'projectId' });
            }
            if (!database.objectStoreNames.contains(CHUNK_STORE)) {
              const store = database.createObjectStore(CHUNK_STORE, { keyPath: 'key' });
              store.createIndex('projectId', 'projectId', { unique: false });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error('Cold history database could not be opened.'));
          request.onblocked = () => reject(new Error('Cold history database upgrade was blocked.'));
        }).catch(error => {
          databasePromise = null;
          throw error;
        });
      }
      return databasePromise;
    }

    function getFallbackProject(projectId, { create = false } = {}) {
      let value = fallbackProjects.get(projectId) || null;
      if (!value && create) {
        value = { meta: createEmptyMeta(projectId), chunks: new Map() };
        fallbackProjects.set(projectId, value);
      }
      return value;
    }

    function appendEntriesToRecords(meta, chunks, direction, entries) {
      const keysName = direction === 'future' ? 'futureKeys' : 'pastKeys';
      const countName = direction === 'future' ? 'futureCount' : 'pastCount';
      let remaining = entries.map(cloneEntry);
      const touched = new Map();
      const lastKey = meta[keysName][meta[keysName].length - 1] || '';
      const lastChunk = lastKey ? chunks.get(lastKey) : null;
      if (lastChunk && Array.isArray(lastChunk.entries) && lastChunk.entries.length < safeChunkSize) {
        const room = safeChunkSize - lastChunk.entries.length;
        lastChunk.entries.push(...remaining.splice(0, room));
        lastChunk.count = lastChunk.entries.length;
        touched.set(lastChunk.key, lastChunk);
      }
      while (remaining.length) {
        const sequence = meta.nextSequence++;
        const key = `${meta.projectId}\u0000${direction}\u0000${sequence}`;
        const chunkEntries = remaining.splice(0, safeChunkSize);
        const chunk = {
          key,
          projectId: meta.projectId,
          direction,
          sequence,
          count: chunkEntries.length,
          entries: chunkEntries,
          createdAt: new Date().toISOString(),
        };
        meta[keysName].push(key);
        chunks.set(key, chunk);
        touched.set(key, chunk);
      }
      meta[countName] += entries.length;
      const deletedKeys = [];
      while (meta[countName] > safeMaxEntries && meta[keysName].length > 1) {
        const oldestKey = meta[keysName].shift();
        const oldest = chunks.get(oldestKey);
        meta[countName] = Math.max(0, meta[countName] - Math.max(1, Number(oldest?.count) || oldest?.entries?.length || safeChunkSize));
        chunks.delete(oldestKey);
        touched.delete(oldestKey);
        deletedKeys.push(oldestKey);
      }
      meta.updatedAt = new Date().toISOString();
      return { touched: Array.from(touched.values()), deletedKeys };
    }

    async function push(projectId, direction, entries = []) {
      const normalizedProjectId = normalizeProjectId(projectId);
      const normalizedDirection = normalizeDirection(direction);
      const safeEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
      if (!normalizedProjectId || !safeEntries.length) {
        return getStatus(normalizedProjectId);
      }
      return enqueue(async () => {
        const database = await openDatabase();
        if (!database) {
          const project = getFallbackProject(normalizedProjectId, { create: true });
          appendEntriesToRecords(project.meta, project.chunks, normalizedDirection, safeEntries);
          return { ...project.meta };
        }
        const transaction = database.transaction([META_STORE, CHUNK_STORE], 'readwrite');
        const metaStore = transaction.objectStore(META_STORE);
        const chunkStore = transaction.objectStore(CHUNK_STORE);
        const meta = (await requestResult(metaStore.get(normalizedProjectId))) || createEmptyMeta(normalizedProjectId);
        const keysName = normalizedDirection === 'future' ? 'futureKeys' : 'pastKeys';
        const lastKey = meta[keysName][meta[keysName].length - 1] || '';
        const chunks = new Map();
        if (lastKey) {
          const lastChunk = await requestResult(chunkStore.get(lastKey));
          if (lastChunk) chunks.set(lastKey, lastChunk);
        }
        const result = appendEntriesToRecords(meta, chunks, normalizedDirection, safeEntries);
        result.touched.forEach(chunk => chunkStore.put(chunk));
        result.deletedKeys.forEach(key => chunkStore.delete(key));
        metaStore.put(meta);
        await transactionDone(transaction);
        return { ...meta };
      });
    }

    async function popLatest(projectId, direction) {
      const normalizedProjectId = normalizeProjectId(projectId);
      const normalizedDirection = normalizeDirection(direction);
      if (!normalizedProjectId) return [];
      return enqueue(async () => {
        const database = await openDatabase();
        if (!database) {
          const project = getFallbackProject(normalizedProjectId);
          if (!project) return [];
          const keysName = normalizedDirection === 'future' ? 'futureKeys' : 'pastKeys';
          const countName = normalizedDirection === 'future' ? 'futureCount' : 'pastCount';
          const key = project.meta[keysName].pop();
          if (!key) return [];
          const chunk = project.chunks.get(key);
          project.chunks.delete(key);
          project.meta[countName] = Math.max(0, project.meta[countName] - (chunk?.entries?.length || 0));
          return (chunk?.entries || []).map(cloneEntry);
        }
        const transaction = database.transaction([META_STORE, CHUNK_STORE], 'readwrite');
        const metaStore = transaction.objectStore(META_STORE);
        const chunkStore = transaction.objectStore(CHUNK_STORE);
        const meta = await requestResult(metaStore.get(normalizedProjectId));
        const keysName = normalizedDirection === 'future' ? 'futureKeys' : 'pastKeys';
        const countName = normalizedDirection === 'future' ? 'futureCount' : 'pastCount';
        const key = meta?.[keysName]?.pop?.() || '';
        if (!meta || !key) {
          transaction.abort();
          return [];
        }
        const chunk = await requestResult(chunkStore.get(key));
        chunkStore.delete(key);
        meta[countName] = Math.max(0, Number(meta[countName]) - (chunk?.entries?.length || 0));
        meta.updatedAt = new Date().toISOString();
        metaStore.put(meta);
        await transactionDone(transaction);
        return (chunk?.entries || []).map(cloneEntry);
      });
    }

    async function clearDirection(projectId, direction) {
      const normalizedProjectId = normalizeProjectId(projectId);
      const normalizedDirection = normalizeDirection(direction);
      if (!normalizedProjectId) return false;
      return enqueue(async () => {
        const database = await openDatabase();
        if (!database) {
          const project = getFallbackProject(normalizedProjectId);
          if (!project) return false;
          const keysName = normalizedDirection === 'future' ? 'futureKeys' : 'pastKeys';
          const countName = normalizedDirection === 'future' ? 'futureCount' : 'pastCount';
          project.meta[keysName].forEach(key => project.chunks.delete(key));
          project.meta[keysName] = [];
          project.meta[countName] = 0;
          return true;
        }
        const transaction = database.transaction([META_STORE, CHUNK_STORE], 'readwrite');
        const metaStore = transaction.objectStore(META_STORE);
        const chunkStore = transaction.objectStore(CHUNK_STORE);
        const meta = await requestResult(metaStore.get(normalizedProjectId));
        if (!meta) {
          transaction.abort();
          return false;
        }
        const keysName = normalizedDirection === 'future' ? 'futureKeys' : 'pastKeys';
        const countName = normalizedDirection === 'future' ? 'futureCount' : 'pastCount';
        meta[keysName].forEach(key => chunkStore.delete(key));
        meta[keysName] = [];
        meta[countName] = 0;
        meta.updatedAt = new Date().toISOString();
        metaStore.put(meta);
        await transactionDone(transaction);
        return true;
      });
    }

    async function removeProject(projectId) {
      const normalizedProjectId = normalizeProjectId(projectId);
      if (!normalizedProjectId) return false;
      return enqueue(async () => {
        const database = await openDatabase();
        if (!database) return fallbackProjects.delete(normalizedProjectId);
        const transaction = database.transaction([META_STORE, CHUNK_STORE], 'readwrite');
        const metaStore = transaction.objectStore(META_STORE);
        const chunkStore = transaction.objectStore(CHUNK_STORE);
        const meta = await requestResult(metaStore.get(normalizedProjectId));
        [...(meta?.pastKeys || []), ...(meta?.futureKeys || [])].forEach(key => chunkStore.delete(key));
        metaStore.delete(normalizedProjectId);
        await transactionDone(transaction);
        return Boolean(meta);
      });
    }

    async function getStatus(projectId) {
      const normalizedProjectId = normalizeProjectId(projectId);
      if (!normalizedProjectId) return { projectId: '', pastCount: 0, futureCount: 0 };
      await operationQueue;
      const database = await openDatabase();
      if (!database) {
        const meta = getFallbackProject(normalizedProjectId)?.meta || createEmptyMeta(normalizedProjectId);
        return { projectId: normalizedProjectId, pastCount: meta.pastCount, futureCount: meta.futureCount };
      }
      const transaction = database.transaction(META_STORE, 'readonly');
      const meta = await requestResult(transaction.objectStore(META_STORE).get(normalizedProjectId));
      return {
        projectId: normalizedProjectId,
        pastCount: Math.max(0, Number(meta?.pastCount) || 0),
        futureCount: Math.max(0, Number(meta?.futureCount) || 0),
      };
    }

    return Object.freeze({
      push,
      popLatest,
      clearDirection,
      removeProject,
      getStatus,
      flush: () => operationQueue,
    });
  }

  root.coldHistoryStoreUtils = Object.freeze({ createColdHistoryStoreUtils });
})();
