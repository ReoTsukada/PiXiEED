(() => {
  "use strict";

  const DATABASE_NAME = "pixieed-visual-blobs-v1";
  const STORE_NAME = "blobs";
  const DATABASE_VERSION = 1;

  const canUseIndexedDb = () =>
    typeof window !== "undefined" && typeof window.indexedDB !== "undefined";

  const openDatabase = () => new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
  });

  const assetKey = (projectId, assetId) => `${String(projectId)}:${String(assetId)}`;

  const requestResult = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });

  const closeAfter = (database, promise) => promise.finally(() => database.close());

  const put = async (projectId, assetId, blob, metadata = {}) => {
    if (!(blob instanceof Blob)) return false;
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const record = {
        key: assetKey(projectId, assetId),
        projectId: String(projectId),
        assetId: String(assetId),
        blob,
        mime: String(metadata.mime || blob.type || "application/octet-stream"),
        name: String(metadata.name || "asset"),
        size: Number.isFinite(Number(metadata.size)) ? Number(metadata.size) : blob.size,
        updatedAt: new Date().toISOString(),
      };
      return await closeAfter(database, requestResult(transaction.objectStore(STORE_NAME).put(record)).then(() => true));
    } catch (_error) {
      return false;
    }
  };

  const get = async (projectId, assetId) => {
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const record = await closeAfter(
        database,
        requestResult(transaction.objectStore(STORE_NAME).get(assetKey(projectId, assetId))),
      );
      return record && record.blob instanceof Blob ? record : null;
    } catch (_error) {
      return null;
    }
  };

  const remove = async (projectId, assetId) => {
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      return await closeAfter(database, requestResult(transaction.objectStore(STORE_NAME).delete(assetKey(projectId, assetId))).then(() => true));
    } catch (_error) {
      return false;
    }
  };

  const clearProject = async (projectId) => {
    try {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const records = await requestResult(store.getAll());
      const removals = (records || [])
        .filter((record) => String(record.projectId) === String(projectId))
        .map((record) => requestResult(store.delete(record.key)));
      await Promise.all(removals);
      database.close();
      return true;
    } catch (_error) {
      return false;
    }
  };

  window.PiXiEEDVisualBlobStore = Object.freeze({
    put,
    get,
    remove,
    clearProject,
  });
})();
