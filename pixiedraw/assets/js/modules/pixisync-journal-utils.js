(() => {
  if (typeof window === 'undefined') return;
  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createPiXiSyncJournalUtils() {
    const DB_NAME = 'pixieed-pixisync-v1';
    const STORE = 'pendingOperations';

    function openDatabase() {
      return new Promise((resolve, reject) => {
        const request = window.indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error || new Error('PiXiSYNC journal open failed'));
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: ['roomId', 'operationId'] });
        request.onsuccess = () => resolve(request.result);
      });
    }
    async function transact(mode, action) {
      const database = await openDatabase();
      try {
        return await new Promise((resolve, reject) => {
          const transaction = database.transaction(STORE, mode);
          const store = transaction.objectStore(STORE);
          const result = action(store);
          transaction.oncomplete = () => resolve(result?.result);
          transaction.onerror = () => reject(transaction.error || new Error('PiXiSYNC journal transaction failed'));
          transaction.onabort = () => reject(transaction.error || new Error('PiXiSYNC journal transaction aborted'));
        });
      } finally { database.close(); }
    }
    function put(record) {
      if (!record?.roomId || !record?.operationId) throw new Error('PiXiSYNC journal: invalid record');
      return transact('readwrite', store => store.put({ ...record, savedAt: Date.now() }));
    }
    function remove(roomId, operationId) { return transact('readwrite', store => store.delete([roomId, operationId])); }
    function list(roomId) {
      return transact('readonly', store => store.getAll())
        .then(items => (items || []).filter(item => item.roomId === roomId).sort((a, b) => a.savedAt - b.savedAt));
    }
    return { put, remove, list };
  }
  root.pixisyncJournalUtils = { createPiXiSyncJournalUtils };
})();
