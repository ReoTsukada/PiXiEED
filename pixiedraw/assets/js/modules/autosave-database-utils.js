(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createAutosaveDatabaseUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) {
          return undefined;
        }
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          return target[key];
        }
        return globalThis[key];
      },
      set(target, key, value) {
        if (Object.prototype.hasOwnProperty.call(target, key)) {
          target[key] = value;
          return true;
        }
        globalThis[key] = value;
        return true;
      },
    });

    return ((scope) => {
      with (scope) {
  function upgradeAutosaveDatabase(db) {
    if (!db) return;
    if (!db.objectStoreNames.contains(AUTOSAVE_STORE_NAME)) {
      db.createObjectStore(AUTOSAVE_STORE_NAME);
    }
    if (!db.objectStoreNames.contains(RECENT_PROJECTS_STORE)) {
      db.createObjectStore(RECENT_PROJECTS_STORE);
    }
    if (!db.objectStoreNames.contains(SHARED_LOCAL_OP_JOURNAL_STORE)) {
      const store = db.createObjectStore(SHARED_LOCAL_OP_JOURNAL_STORE, { keyPath: 'id' });
      store.createIndex('projectKey', 'projectKey', { unique: false });
      store.createIndex('projectKeyStatus', ['projectKey', 'status'], { unique: false });
      store.createIndex('projectKeyCreatedAt', ['projectKey', 'createdAt'], { unique: false });
    }
  }

  function openAutosaveDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(AUTOSAVE_DB_NAME, AUTOSAVE_DB_VERSION);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        upgradeAutosaveDatabase(db);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  return Object.freeze({
    upgradeAutosaveDatabase,
    openAutosaveDatabase,
  });
      }
    })(scope);
  }

  root.autosaveDatabaseUtils = Object.freeze({
    createAutosaveDatabaseUtils,
  });
})();
