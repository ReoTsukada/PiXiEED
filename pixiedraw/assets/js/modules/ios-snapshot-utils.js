(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createIosSnapshotUtils(rawScope = {}) {
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
  function upgradeIosSnapshotDatabase(db) {
    if (!db) return;
    if (!db.objectStoreNames.contains(IOS_SNAPSHOT_STORE_NAME)) {
      db.createObjectStore(IOS_SNAPSHOT_STORE_NAME, { keyPath: 'id' });
    }
  }

  function ensureIosSnapshotDatabase() {
    if (!IOS_SNAPSHOT_SUPPORTED) {
      return Promise.resolve(null);
    }
    if (iosSnapshotDbPromise) {
      return iosSnapshotDbPromise;
    }
    iosSnapshotDbPromise = new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(value);
      };
      const rejectOnce = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        reject(error);
      };
      const request = window.indexedDB.open(IOS_SNAPSHOT_DB_NAME, IOS_SNAPSHOT_DB_VERSION);
      request.onupgradeneeded = event => {
        const database = event.target.result;
        upgradeIosSnapshotDatabase(database);
      };
      request.onsuccess = () => {
        const database = request.result;
        if (database) {
          database.onversionchange = () => {
            database.close();
          };
        }
        resolveOnce(database);
      };
      request.onerror = () => {
        rejectOnce(request.error || new Error('Failed to open iOS snapshot database'));
      };
      request.onblocked = () => {
        rejectOnce(new Error('iOS snapshot database is blocked by another tab'));
      };
    })
      .catch(error => {
        console.warn('Failed to initialise iOS snapshot database', error);
        if (
          error
          && /blocked/i.test(String(error?.message || ''))
          && (Date.now() - iosSnapshotBlockedNoticeAt) > 3000
        ) {
          iosSnapshotBlockedNoticeAt = Date.now();
          updateAutosaveStatus(
            localizeText(
              'iOS復元: 別タブで同時に開かれているため一時保存を保留しています',
              'iOS restore: snapshot save is paused because another tab is open'
            ),
            'warn'
          );
        }
        iosSnapshotDbPromise = null;
        return null;
      });
    return iosSnapshotDbPromise;
  }

  function bindIosSnapshotUnloadListener() {
    if (!IOS_SNAPSHOT_SUPPORTED) return;
    if (iosSnapshotUnloadListenerBound) return;
    const flush = () => {
      persistIosSnapshot(true).catch(() => {
        // Ignore unload persistence failures
      });
    };
    window.addEventListener('pagehide', flush);
    iosSnapshotUnloadListenerBound = true;
  }

  function scheduleIosSnapshotPersist() {
    if (!IOS_SNAPSHOT_SUPPORTED) return;
    if (iosSnapshotRestoring) return;
    iosSnapshotDirty = true;
    if (iosSnapshotTimer !== null) {
      return;
    }
    iosSnapshotTimer = window.setTimeout(() => {
      iosSnapshotTimer = null;
      const shouldWrite = iosSnapshotDirty;
      iosSnapshotDirty = false;
      if (!shouldWrite) return;
      persistIosSnapshot().catch(error => {
        console.warn('Failed to persist iOS snapshot', error);
      });
    }, IOS_SNAPSHOT_WRITE_DELAY);
  }

  async function persistIosSnapshot(force = false) {
    if (!IOS_SNAPSHOT_SUPPORTED) return;
    if (iosSnapshotRestoring) return;
    if (!force && !iosSnapshotDirty) return;
    const database = await ensureIosSnapshotDatabase();
    if (!database) {
      return;
    }
    iosSnapshotDirty = false;
    let snapshotText = '';
    try {
      const snapshot = makeHistorySnapshot();
      const payload = serializeDocumentSnapshot(snapshot);
      snapshotText = JSON.stringify({
        version: DOCUMENT_FILE_VERSION,
        snapshot: payload,
      });
    } catch (error) {
      console.warn('Failed to create iOS snapshot payload', error);
      return;
    }
    let data = snapshotText;
    let compressed = false;
    if (snapshotText.length > IOS_SNAPSHOT_COMPRESSION_THRESHOLD) {
      try {
        data = textCompression.compressToUTF16(snapshotText);
        if (typeof data === 'string' && data.length) {
          compressed = true;
        } else {
          data = snapshotText;
        }
      } catch (error) {
        console.warn('Failed to compress iOS snapshot payload', error);
        data = snapshotText;
      }
    }
    await new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(IOS_SNAPSHOT_STORE_NAME, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('iOS snapshot transaction aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('iOS snapshot transaction error'));
        const store = transaction.objectStore(IOS_SNAPSHOT_STORE_NAME);
        store.put({
          id: IOS_SNAPSHOT_KEY,
          data,
          compressed,
          savedAt: Date.now(),
          size: snapshotText.length,
        });
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      iosSnapshotDirty = true;
      throw error;
    });
  }

  async function restoreIosSnapshotFallback() {
    if (!IOS_SNAPSHOT_SUPPORTED) return false;
    const database = await ensureIosSnapshotDatabase();
    if (!database) {
      return false;
    }
    const record = await new Promise((resolve, reject) => {
      try {
        const transaction = database.transaction(IOS_SNAPSHOT_STORE_NAME, 'readonly');
        transaction.oncomplete = () => {};
        transaction.onabort = () => reject(transaction.error || new Error('iOS snapshot read aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('iOS snapshot read error'));
        const store = transaction.objectStore(IOS_SNAPSHOT_STORE_NAME);
        const request = store.get(IOS_SNAPSHOT_KEY);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error || new Error('iOS snapshot get failed'));
      } catch (error) {
        reject(error);
      }
    }).catch(error => {
      console.warn('Failed to read iOS snapshot', error);
      return null;
    });
    if (!record || !record.data) {
      return false;
    }
    let snapshotText = '';
    if (record.compressed) {
      try {
        snapshotText = textCompression.decompressFromUTF16(record.data) || '';
      } catch (error) {
        console.warn('Failed to decompress iOS snapshot payload', error);
        snapshotText = '';
      }
    } else if (typeof record.data === 'string') {
      snapshotText = record.data;
    }
    if (!snapshotText) {
      return false;
    }
    let payload;
    try {
      const parsed = JSON.parse(snapshotText);
      payload = parsed && typeof parsed === 'object' && parsed.snapshot ? parsed.snapshot : parsed;
    } catch (error) {
      console.warn('Failed to parse iOS snapshot payload', error);
      return false;
    }
    let snapshot;
    try {
      snapshot = deserializeDocumentPayload(payload);
    } catch (error) {
      console.warn('Failed to deserialize iOS snapshot', error);
      return false;
    }
    if (isTinyStartupSnapshot(snapshot)) {
      return false;
    }
    synchronizeImportedSnapshotPalette(snapshot);
    iosSnapshotRestoring = true;
    try {
      const prevFrameCount = Array.isArray(state.frames) ? state.frames.length : 0;
      applyHistorySnapshot(snapshot, { forcePalettePresetSync: true });
      history.past = [];
      history.future = [];
      history.pending = null;
      clearTimelapseRecording({ silent: true, scope: 'all' });
      resetDocumentUnsavedChanges();
      updateMemoryStatus();
      setTrackedProjectDotBaseline(snapshot, null);
    } finally {
      iosSnapshotRestoring = false;
    }
    return true;
  }

  async function initializeIosSnapshotFallback() {
    if (!IOS_SNAPSHOT_SUPPORTED) return;
    if (iosSnapshotInitialized) return;
    iosSnapshotInitialized = true;
    const skipRestoreForSharedInvite = Boolean(readMultiInviteFromUrl());
    try {
      if (!skipRestoreForSharedInvite) {
        const restored = await restoreIosSnapshotFallback();
        if (restored) {
          console.info('Restored canvas from iOS IndexedDB snapshot');
        }
      } else {
        console.info('[startup] skipped iOS snapshot restore for shared invite');
      }
    } catch (error) {
      console.warn('Failed to restore iOS snapshot', error);
    }
    bindIosSnapshotUnloadListener();
  }

        return Object.freeze({
          upgradeIosSnapshotDatabase,
          ensureIosSnapshotDatabase,
          bindIosSnapshotUnloadListener,
          scheduleIosSnapshotPersist,
          persistIosSnapshot,
          restoreIosSnapshotFallback,
          initializeIosSnapshotFallback,
        });
      }
    })(scope);
  }

  root.iosSnapshotUtils = Object.freeze({
    createIosSnapshotUtils,
  });
})();
