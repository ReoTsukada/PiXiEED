(() => {
  if (typeof window === 'undefined') {
    return;
  }

  const root = window.PiXiEEDrawModules = window.PiXiEEDrawModules || {};

  function createAutosaveSchemaV2IndexedDbUtils(rawScope = {}) {
    const scope = new Proxy(rawScope, {
      has() {
        return true;
      },
      get(target, key) {
        if (key === Symbol.unscopables) return undefined;
        return Object.prototype.hasOwnProperty.call(target, key) ? target[key] : globalThis[key];
      },
    });

    return ((scope) => {
      with (scope) {
        function cloneJsonValue(value, fallback = null) {
          if (value === undefined) return fallback;
          try {
            return JSON.parse(JSON.stringify(value));
          } catch (_error) {
            return fallback;
          }
        }

        function requiredStoreNames() {
          return [
            LOCAL_PROJECT_MANIFESTS_STORE,
            LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE,
            LOCAL_PROJECT_JOURNALS_STORE,
            LOCAL_PROJECT_THUMBNAILS_STORE,
            LOCAL_PROJECT_CURRENT_MANIFESTS_STORE,
          ].filter(Boolean);
        }

        function assertSchemaDependencies() {
          if (!autosaveSchemaV2Utils || typeof autosaveSchemaV2Utils.createSchemaV2Revision !== 'function') {
            throw new Error('Autosave schema V2 utility is unavailable');
          }
          if (typeof indexedDB === 'undefined' || !AUTOSAVE_SCHEMA_V2_DB_NAME) {
            throw new Error('Autosave schema V2 IndexedDB is unavailable');
          }
          if (requiredStoreNames().length !== 5) {
            throw new Error('Autosave schema V2 store configuration is incomplete');
          }
        }

        function ensureStoresExist(db) {
          const missing = requiredStoreNames().filter(name => !db.objectStoreNames.contains(name));
          if (missing.length) {
            throw new Error(`Autosave schema V2 stores are unavailable: ${missing.join(', ')}`);
          }
        }

        function upgradeSchemaV2Database(db) {
          [
            LOCAL_PROJECT_MANIFESTS_STORE,
            LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE,
            LOCAL_PROJECT_JOURNALS_STORE,
            LOCAL_PROJECT_THUMBNAILS_STORE,
          ].forEach(storeName => {
            if (!db.objectStoreNames.contains(storeName)) {
              const store = db.createObjectStore(storeName, { keyPath: 'key' });
              store.createIndex('projectId', 'projectId', { unique: false });
            }
          });
          if (!db.objectStoreNames.contains(LOCAL_PROJECT_CURRENT_MANIFESTS_STORE)) {
            db.createObjectStore(LOCAL_PROJECT_CURRENT_MANIFESTS_STORE, { keyPath: 'projectId' });
          }
        }

        function openSchemaV2Database() {
          return new Promise((resolve, reject) => {
            const request = indexedDB.open(AUTOSAVE_SCHEMA_V2_DB_NAME, AUTOSAVE_SCHEMA_V2_DB_VERSION);
            request.onupgradeneeded = event => upgradeSchemaV2Database(event.target.result);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Autosave schema V2 database open failed'));
          });
        }

        function waitForTransaction(tx, db, { abortMessage = '' } = {}) {
          return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              const error = tx.error || new Error(abortMessage || 'Autosave schema V2 IndexedDB transaction failed');
              db.close();
              reject(error);
            };
            tx.onabort = () => {
              const error = tx.error || new Error(abortMessage || 'Autosave schema V2 IndexedDB transaction aborted');
              db.close();
              reject(error);
            };
          });
        }

        function requestValue(request) {
          return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Autosave schema V2 IndexedDB request failed'));
          });
        }

        function normalizeProjectId(value) {
          return typeof value === 'string' ? value.trim() : '';
        }

        async function readCurrentManifestReference(projectId) {
          assertSchemaDependencies();
          const id = normalizeProjectId(projectId);
          if (!id) return null;
          const db = await openSchemaV2Database();
          try {
            ensureStoresExist(db);
            const tx = db.transaction([LOCAL_PROJECT_CURRENT_MANIFESTS_STORE], 'readonly');
            const request = tx.objectStore(LOCAL_PROJECT_CURRENT_MANIFESTS_STORE).get(id);
            const [value] = await Promise.all([requestValue(request), waitForTransaction(tx, db)]);
            return value && typeof value === 'object' ? value : null;
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
        }

        async function commitSchemaV2Bundle(bundle, { simulateAbortAt = '', simulateCleanupFailure = false, skipCleanup = false, keepManifestRevisions = 2 } = {}) {
          assertSchemaDependencies();
          if (!bundle?.manifest?.projectId || !Array.isArray(bundle.checkpoints) || !Array.isArray(bundle.journals)) {
            throw new Error('Invalid autosave schema V2 commit bundle');
          }
          const db = await openSchemaV2Database();
          let abortMessage = '';
          try {
            ensureStoresExist(db);
            const tx = db.transaction(requiredStoreNames(), 'readwrite');
            const manifests = tx.objectStore(LOCAL_PROJECT_MANIFESTS_STORE);
            const checkpoints = tx.objectStore(LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE);
            const journals = tx.objectStore(LOCAL_PROJECT_JOURNALS_STORE);
            const thumbnails = tx.objectStore(LOCAL_PROJECT_THUMBNAILS_STORE);
            const current = tx.objectStore(LOCAL_PROJECT_CURRENT_MANIFESTS_STORE);
            let aborted = false;
            const abortAt = stage => {
              if (simulateAbortAt === stage) {
                abortMessage = `Simulated autosave schema V2 transaction abort: ${stage}`;
                aborted = true;
                tx.abort();
                return true;
              }
              return false;
            };

            for (const checkpoint of bundle.checkpoints) {
              checkpoints.put(cloneJsonValue(checkpoint, null));
              if (abortAt('checkpoint')) break;
            }
            if (!aborted) {
              for (const journal of bundle.journals) {
                journals.put(cloneJsonValue(journal, null));
                if (abortAt('journal')) break;
              }
            }
            if (!aborted && bundle.thumbnail) {
              thumbnails.put(cloneJsonValue(bundle.thumbnail, null));
              abortAt('thumbnail');
            }
            if (!aborted) {
              manifests.put(cloneJsonValue(bundle.manifest, null));
              abortAt('manifest');
            }
            if (!aborted) {
              current.put({
                projectId: bundle.manifest.projectId,
                manifestKey: bundle.manifest.key,
                revision: bundle.manifest.revision,
                updatedAt: bundle.manifest.updatedAt,
                autosaveSchemaVersion: bundle.manifest.autosaveSchemaVersion,
              });
              abortAt('current-ref');
            }
            await waitForTransaction(tx, db, { abortMessage });
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }

          let cleanupError = null;
          if (!skipCleanup) {
            try {
              if (simulateCleanupFailure) {
                throw new Error('Simulated autosave schema V2 cleanup failure');
              }
              await cleanupSchemaV2Revisions(bundle.manifest.projectId, { keepManifestRevisions });
            } catch (error) {
              cleanupError = error;
            }
          }
          return {
            committed: true,
            manifest: cloneJsonValue(bundle.manifest, null),
            cleanupError,
          };
        }

        async function writeSchemaV2Project(projectState, { revision = 0, parentRevision = 0, ...options } = {}) {
          const projectId = normalizeProjectId(projectState?.projectId);
          if (!projectId) {
            throw new Error('Autosave schema V2 projectId is required');
          }
          const current = await readCurrentManifestReference(projectId);
          const nextRevision = Math.max(
            1,
            Math.round(Number(revision) || 0) || (Math.round(Number(current?.revision) || 0) + 1)
          );
          const bundle = autosaveSchemaV2Utils.createSchemaV2Revision(projectState, {
            revision: nextRevision,
            parentRevision: Math.max(0, Math.round(Number(parentRevision) || 0) || Math.round(Number(current?.revision) || 0)),
          });
          const result = await commitSchemaV2Bundle(bundle, options);
          return { ...result, bundle };
        }

        async function loadAllProjectSchemaRecords(projectId) {
          assertSchemaDependencies();
          const id = normalizeProjectId(projectId);
          if (!id) throw new Error('Autosave schema V2 projectId is required');
          const db = await openSchemaV2Database();
          try {
            ensureStoresExist(db);
            const tx = db.transaction(requiredStoreNames(), 'readonly');
            const manifests = tx.objectStore(LOCAL_PROJECT_MANIFESTS_STORE).index('projectId').getAll(id);
            const checkpoints = tx.objectStore(LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE).index('projectId').getAll(id);
            const journals = tx.objectStore(LOCAL_PROJECT_JOURNALS_STORE).index('projectId').getAll(id);
            const thumbnails = tx.objectStore(LOCAL_PROJECT_THUMBNAILS_STORE).index('projectId').getAll(id);
            const current = tx.objectStore(LOCAL_PROJECT_CURRENT_MANIFESTS_STORE).get(id);
            const [manifestValues, checkpointValues, journalValues, thumbnailValues, currentValue] = await Promise.all([
              requestValue(manifests),
              requestValue(checkpoints),
              requestValue(journals),
              requestValue(thumbnails),
              requestValue(current),
              waitForTransaction(tx, db),
            ]);
            return {
              manifests: Array.isArray(manifestValues) ? manifestValues : [],
              checkpoints: Array.isArray(checkpointValues) ? checkpointValues : [],
              journals: Array.isArray(journalValues) ? journalValues : [],
              thumbnails: Array.isArray(thumbnailValues) ? thumbnailValues : [],
              current: currentValue && typeof currentValue === 'object' ? currentValue : null,
            };
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
        }

        async function readSchemaV2Project(projectId, { revision = 0 } = {}) {
          const records = await loadAllProjectSchemaRecords(projectId);
          const requestedRevision = Math.max(0, Math.round(Number(revision) || 0));
          const eligibleManifests = requestedRevision
            ? records.manifests.filter(record => Math.round(Number(record?.revision) || 0) <= requestedRevision)
            : records.manifests;
          const manifests = new Map(eligibleManifests.map(record => [record.key, record]));
          const checkpoints = new Map(records.checkpoints.map(record => [record.key, record]));
          const journals = new Map(records.journals.map(record => [record.key, record]));
          const recentEntry = {
            id: normalizeProjectId(projectId),
            autosaveSchemaVersion: autosaveSchemaV2Utils.AUTOSAVE_SCHEMA_VERSION,
            manifestKey: requestedRevision
              ? (eligibleManifests.find(record => Math.round(Number(record?.revision) || 0) === requestedRevision)?.key || '')
              : (records.current?.manifestKey || ''),
          };
          const store = { manifests, checkpoints, journals };
          const restored = autosaveSchemaV2Utils.restoreSchemaV2WithFallback(store, recentEntry);
          return {
            ...restored,
            current: records.current,
            thumbnail: records.thumbnails.find(entry => entry?.key === restored.manifest?.thumbnailRef?.key)?.value || null,
          };
        }

        async function cleanupSchemaV2Revisions(projectId, { keepManifestRevisions = 2 } = {}) {
          const id = normalizeProjectId(projectId);
          if (!id) return { removedRevisionCount: 0 };
          const records = await loadAllProjectSchemaRecords(id);
          const sorted = records.manifests
            .filter(manifest => manifest?.projectId === id)
            .sort((left, right) => Math.round(Number(right.revision) || 0) - Math.round(Number(left.revision) || 0));
          const retained = new Set(sorted.slice(0, Math.max(1, Math.round(Number(keepManifestRevisions) || 2))).map(manifest => manifest.revision));
          const removable = sorted.filter(manifest => !retained.has(manifest.revision));
          if (!removable.length) return { removedRevisionCount: 0 };
          const removeRevisions = new Set(removable.map(manifest => manifest.revision));
          const db = await openSchemaV2Database();
          try {
            ensureStoresExist(db);
            const tx = db.transaction([
              LOCAL_PROJECT_MANIFESTS_STORE,
              LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE,
              LOCAL_PROJECT_JOURNALS_STORE,
              LOCAL_PROJECT_THUMBNAILS_STORE,
            ], 'readwrite');
            const deletes = [
              [LOCAL_PROJECT_MANIFESTS_STORE, removable],
              [LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE, records.checkpoints.filter(record => removeRevisions.has(record?.rootRevision))],
              [LOCAL_PROJECT_JOURNALS_STORE, records.journals.filter(record => removeRevisions.has(record?.revision))],
              [LOCAL_PROJECT_THUMBNAILS_STORE, records.thumbnails.filter(record => removeRevisions.has(record?.rootRevision))],
            ];
            deletes.forEach(([storeName, values]) => {
              const objectStore = tx.objectStore(storeName);
              values.forEach(value => objectStore.delete(value.key));
            });
            await waitForTransaction(tx, db);
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
          return { removedRevisionCount: removable.length };
        }

        return Object.freeze({
          requiredStoreNames,
          readCurrentManifestReference,
          commitSchemaV2Bundle,
          writeSchemaV2Project,
          loadAllProjectSchemaRecords,
          readSchemaV2Project,
          cleanupSchemaV2Revisions,
        });
      }
    })(scope);
  }

  root.autosaveSchemaV2IndexedDbUtils = Object.freeze({
    createAutosaveSchemaV2IndexedDbUtils,
  });
})();
