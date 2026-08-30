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
          if (typeof globalThis.structuredClone === 'function') {
            try {
              return globalThis.structuredClone(value);
            } catch (_error) {
              // Keep the legacy JSON fallback for non-cloneable metadata.
            }
          }
          try {
            return JSON.parse(JSON.stringify(value));
          } catch (_error) {
            return fallback;
          }
        }

        function logAutosaveV2Performance(phase, startedAt, details = {}) {
          const elapsedMs = Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt);
          console.info('[pixiedraw:performance]', { phase, elapsedMs, ...details });
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

        function waitForTransaction(tx, db, { abortMessage = '', getAbortMessage = null } = {}) {
          const resolveAbortMessage = () => (
            typeof getAbortMessage === 'function'
              ? getAbortMessage()
              : abortMessage
          );
          return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => {
              const error = tx.error || new Error(resolveAbortMessage() || 'Autosave schema V2 IndexedDB transaction failed');
              db.close();
              reject(error);
            };
            tx.onabort = () => {
              const error = tx.error || new Error(resolveAbortMessage() || 'Autosave schema V2 IndexedDB transaction aborted');
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

        // A project can be touched by more than one autosave trigger (and by
        // more than one tab).  Keep writes for one project ordered inside this
        // module instance, then use the small current-manifest tombstone below
        // as the cross-tab guard.  The document bodies are still removed; the
        // tombstone only prevents a delayed writer from recreating them after
        // an explicit delete.
        const projectWriteTails = new Map();
        const projectLifecycles = new Map();
        const projectRemovalPromises = new Map();

        function getProjectLifecycle(projectId) {
          const id = normalizeProjectId(projectId);
          let lifecycle = projectLifecycles.get(id);
          if (!lifecycle) {
            lifecycle = { deleting: false, deleted: false, epoch: 0 };
            projectLifecycles.set(id, lifecycle);
          }
          return lifecycle;
        }

        function createDeletedProjectError(projectId) {
          const error = new Error('Autosave schema V2 project has been deleted');
          error.code = 'ERR_AUTOSAVE_PROJECT_DELETED';
          error.projectId = normalizeProjectId(projectId);
          return error;
        }

        function isDeletedProjectMarker(value) {
          return Boolean(value && typeof value === 'object' && value.deleted === true);
        }

        function queueProjectTask(projectId, task) {
          const id = normalizeProjectId(projectId);
          const lifecycle = getProjectLifecycle(id);
          if (!id || lifecycle.deleting || lifecycle.deleted) {
            return Promise.reject(createDeletedProjectError(id));
          }
          const previous = projectWriteTails.get(id) || Promise.resolve();
          const next = previous
            .catch(() => {})
            .then(async () => {
              if (lifecycle.deleting || lifecycle.deleted) {
                throw createDeletedProjectError(id);
              }
              return await task();
            });
          const tracked = next.finally(() => {
            if (projectWriteTails.get(id) === tracked) {
              projectWriteTails.delete(id);
            }
          });
          projectWriteTails.set(id, tracked);
          return tracked;
        }

        async function flushProjectTasks(projectId) {
          const id = normalizeProjectId(projectId);
          const tail = projectWriteTails.get(id);
          if (tail) {
            await tail.catch(() => {});
          }
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
            return value && typeof value === 'object' && !isDeletedProjectMarker(value) ? value : null;
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
        }

        // Startup migration only needs the manifest's layout metadata.  Keep
        // this separate from readSchemaV2Project(), which intentionally also
        // loads checkpoint and journal bodies to reconstruct the document.
        async function readCurrentSchemaV2Manifest(projectId) {
          const current = await readCurrentManifestReference(projectId);
          const manifestKey = typeof current?.manifestKey === 'string' ? current.manifestKey.trim() : '';
          if (!manifestKey) return null;
          const db = await openSchemaV2Database();
          try {
            ensureStoresExist(db);
            const tx = db.transaction([LOCAL_PROJECT_MANIFESTS_STORE], 'readonly');
            const request = tx.objectStore(LOCAL_PROJECT_MANIFESTS_STORE).get(manifestKey);
            const [value] = await Promise.all([requestValue(request), waitForTransaction(tx, db)]);
            return value && typeof value === 'object' ? cloneJsonValue(value, null) : null;
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
        }

        async function commitSchemaV2BundleNow(bundle, { simulateAbortAt = '', simulateCleanupFailure = false, skipCleanup = false, keepManifestRevisions = 2 } = {}) {
          assertSchemaDependencies();
          if (!bundle?.manifest?.projectId || !Array.isArray(bundle.checkpoints) || !Array.isArray(bundle.journals)) {
            throw new Error('Invalid autosave schema V2 commit bundle');
          }
          const projectId = normalizeProjectId(bundle.manifest.projectId);
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
            const transactionDone = waitForTransaction(tx, db, {
              getAbortMessage: () => abortMessage,
            });
            const currentValue = await requestValue(current.get(projectId));
            if (isDeletedProjectMarker(currentValue)) {
              tx.abort();
              try { await transactionDone; } catch (_error) {}
              throw createDeletedProjectError(projectId);
            }
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
            await transactionDone;
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
              await cleanupSchemaV2RevisionsNow(bundle.manifest.projectId, { keepManifestRevisions });
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

        async function commitSchemaV2Bundle(bundle, options = {}) {
          const projectId = normalizeProjectId(bundle?.manifest?.projectId);
          if (!projectId) {
            throw new Error('Invalid autosave schema V2 commit bundle');
          }
          return await queueProjectTask(projectId, () => commitSchemaV2BundleNow(bundle, options));
        }

        async function writeSchemaV2ProjectNow(projectState, { revision = 0, parentRevision = 0, ...options } = {}) {
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
          const result = await commitSchemaV2BundleNow(bundle, options);
          return { ...result, bundle };
        }

        async function writeSchemaV2Project(projectState, options = {}) {
          const projectId = normalizeProjectId(projectState?.projectId);
          if (!projectId) {
            throw new Error('Autosave schema V2 projectId is required');
          }
          return await queueProjectTask(projectId, () => writeSchemaV2ProjectNow(projectState, options));
        }

        async function writeSchemaV2JournalRevisionNow(projectId, journalsBySheet, options = {}) {
          const id = normalizeProjectId(projectId);
          if (!id) {
            throw new Error('Autosave schema V2 projectId is required');
          }
          const readStartedAt = globalThis.performance?.now?.() ?? Date.now();
          const baseManifest = await readCurrentSchemaV2Manifest(id);
          logAutosaveV2Performance('pixiedraw:autosave:journal-read:await', readStartedAt, {
            projectId: id,
            recordReadMode: 'manifest-only',
            manifestCount: baseManifest ? 1 : 0,
            checkpointCount: 0,
            journalCount: 0,
            thumbnailCount: 0,
          });
          if (!baseManifest || baseManifest.projectId !== id) {
            throw new Error('Autosave schema V2 current manifest is unavailable for journal save');
          }
          const nextRevision = Math.max(
            Math.round(Number(baseManifest.revision) || 0) + 1,
            Math.round(Number(options.revision) || 0)
          );
          const buildStartedAt = globalThis.performance?.now?.() ?? Date.now();
          const bundle = autosaveSchemaV2Utils.createSchemaV2JournalRevision(
            baseManifest,
            journalsBySheet,
            { ...options, revision: nextRevision }
          );
          logAutosaveV2Performance('pixiedraw:autosave:journal-bundle:sync', buildStartedAt, {
            projectId: id,
            journalWriteCount: bundle.journals.length,
          });
          const writeStartedAt = globalThis.performance?.now?.() ?? Date.now();
          const result = await commitSchemaV2BundleNow(bundle, options);
          logAutosaveV2Performance('pixiedraw:autosave:journal-write:await', writeStartedAt, {
            projectId: id,
            journalWriteCount: bundle.journals.length,
          });
          return { ...result, bundle };
        }

        async function writeSchemaV2JournalRevision(projectId, journalsBySheet, options = {}) {
          const id = normalizeProjectId(projectId);
          if (!id) {
            throw new Error('Autosave schema V2 projectId is required');
          }
          return await queueProjectTask(id, () => writeSchemaV2JournalRevisionNow(id, journalsBySheet, options));
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
              // A deleted marker is intentionally not exposed as a current
              // project.  It remains in the small reference store only as a
              // cross-tab write barrier.
              current: currentValue && typeof currentValue === 'object' && !isDeletedProjectMarker(currentValue)
                ? currentValue
                : null,
            };
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
        }

        async function readProjectSchemaRecordCounts(projectId) {
          assertSchemaDependencies();
          const id = normalizeProjectId(projectId);
          if (!id) {
            return {
              manifests: 0,
              checkpoints: 0,
              journals: 0,
              thumbnails: 0,
              current: 0,
              deletedMarker: false,
            };
          }
          const db = await openSchemaV2Database();
          try {
            ensureStoresExist(db);
            const tx = db.transaction(requiredStoreNames(), 'readonly');
            const manifestKeys = tx.objectStore(LOCAL_PROJECT_MANIFESTS_STORE).index('projectId').getAllKeys(id);
            const checkpointKeys = tx.objectStore(LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE).index('projectId').getAllKeys(id);
            const journalKeys = tx.objectStore(LOCAL_PROJECT_JOURNALS_STORE).index('projectId').getAllKeys(id);
            const thumbnailKeys = tx.objectStore(LOCAL_PROJECT_THUMBNAILS_STORE).index('projectId').getAllKeys(id);
            const current = tx.objectStore(LOCAL_PROJECT_CURRENT_MANIFESTS_STORE).get(id);
            const [manifestValues, checkpointValues, journalValues, thumbnailValues, currentValue] = await Promise.all([
              requestValue(manifestKeys),
              requestValue(checkpointKeys),
              requestValue(journalKeys),
              requestValue(thumbnailKeys),
              requestValue(current),
              waitForTransaction(tx, db),
            ]);
            return {
              manifests: Array.isArray(manifestValues) ? manifestValues.length : 0,
              checkpoints: Array.isArray(checkpointValues) ? checkpointValues.length : 0,
              journals: Array.isArray(journalValues) ? journalValues.length : 0,
              thumbnails: Array.isArray(thumbnailValues) ? thumbnailValues.length : 0,
              current: currentValue && typeof currentValue === 'object' && !isDeletedProjectMarker(currentValue) ? 1 : 0,
              deletedMarker: isDeletedProjectMarker(currentValue),
            };
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
        }

        function getManifestReferencedKeys(manifest = null) {
          if (!manifest || typeof manifest !== 'object') {
            return { checkpointKeys: [], journalKeys: [], thumbnailKey: '' };
          }
          if (manifest.projectLayout === 'single-project' && manifest.project) {
            return {
              checkpointKeys: [manifest.project?.checkpointRef?.key].filter(Boolean),
              journalKeys: [manifest.project?.journalRef?.key].filter(Boolean),
              thumbnailKey: manifest.thumbnailRef?.key || '',
            };
          }
          const sheets = Array.isArray(manifest.sheets) ? manifest.sheets : [];
          return {
            checkpointKeys: sheets.map(sheet => sheet?.checkpointRef?.key).filter(Boolean),
            journalKeys: sheets.map(sheet => sheet?.journalRef?.key).filter(Boolean),
            thumbnailKey: manifest.thumbnailRef?.key || '',
          };
        }

        // Delete by indexed primary keys instead of reading and cloning the
        // checkpoint/journal/thumbnail bodies.  The callbacks enqueue deletes
        // while the same transaction is active, so a large project is not
        // exposed to a read-then-delete race with another writer.
        function queueProjectKeyDeletes(tx, storeName, projectId, retainedKeys = null) {
          const objectStore = tx.objectStore(storeName);
          const projectIndex = objectStore.index('projectId');
          const deleteKey = key => {
            if (!retainedKeys || !retainedKeys.has(key)) {
              objectStore.delete(key);
            }
          };
          if (typeof projectIndex.getAllKeys === 'function') {
            const request = projectIndex.getAllKeys(projectId);
            request.onsuccess = () => {
              for (const key of request.result || []) {
                deleteKey(key);
              }
            };
            return request;
          }
          const request = projectIndex.openKeyCursor(projectId);
          request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) return;
            deleteKey(cursor.primaryKey);
            cursor.continue();
          };
          return request;
        }

        async function readSchemaRecordByKey(storeName, key) {
          if (!key) return null;
          const db = await openSchemaV2Database();
          try {
            ensureStoresExist(db);
            const tx = db.transaction([storeName], 'readonly');
            const request = tx.objectStore(storeName).get(key);
            const [value] = await Promise.all([
              requestValue(request),
              waitForTransaction(tx, db),
            ]);
            return value && typeof value === 'object' ? value : null;
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
        }

        async function loadCurrentProjectSchemaRecords(projectId) {
          assertSchemaDependencies();
          const id = normalizeProjectId(projectId);
          if (!id) throw new Error('Autosave schema V2 projectId is required');
          const current = await readCurrentManifestReference(id);
          if (!current?.manifestKey) {
            throw new Error('Autosave schema V2 current manifest reference is unavailable');
          }
          const manifest = await readSchemaRecordByKey(
            LOCAL_PROJECT_MANIFESTS_STORE,
            current.manifestKey
          );
          if (!manifest || manifest.projectId !== id) {
            throw new Error('Autosave schema V2 current manifest is unavailable');
          }
          const referenced = getManifestReferencedKeys(manifest);
          const db = await openSchemaV2Database();
          try {
            ensureStoresExist(db);
            const storeNames = [
              LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE,
              LOCAL_PROJECT_JOURNALS_STORE,
              LOCAL_PROJECT_THUMBNAILS_STORE,
            ];
            const tx = db.transaction(storeNames, 'readonly');
            const checkpointStore = tx.objectStore(LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE);
            const journalStore = tx.objectStore(LOCAL_PROJECT_JOURNALS_STORE);
            const thumbnailStore = tx.objectStore(LOCAL_PROJECT_THUMBNAILS_STORE);
            const checkpointRequests = referenced.checkpointKeys.map(key => requestValue(checkpointStore.get(key)));
            const journalRequests = referenced.journalKeys.map(key => requestValue(journalStore.get(key)));
            const thumbnailRequest = referenced.thumbnailKey
              ? requestValue(thumbnailStore.get(referenced.thumbnailKey))
              : Promise.resolve(null);
            const [checkpoints, journals, thumbnail] = await Promise.all([
              Promise.all(checkpointRequests),
              Promise.all(journalRequests),
              thumbnailRequest,
              waitForTransaction(tx, db),
            ]);
            return {
              current,
              manifest,
              checkpoints: checkpoints.filter(record => record && typeof record === 'object'),
              journals: journals.filter(record => record && typeof record === 'object'),
              thumbnail: thumbnail && typeof thumbnail === 'object' ? thumbnail : null,
            };
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
        }

        async function readSchemaV2Project(projectId, { revision = 0 } = {}) {
          const openPerformance = window.PiXiEEDrawOpenPerformance;
          const requestedRevision = Math.max(0, Math.round(Number(revision) || 0));
          if (!requestedRevision) {
            const indexedDbStage = openPerformance?.beginStage?.('indexeddb-current-records');
            let indexedDbStageEnded = false;
            let restoreStage = null;
            try {
              const currentRecords = await loadCurrentProjectSchemaRecords(projectId);
              openPerformance?.endStage?.(indexedDbStage, {
                checkpointCount: currentRecords.checkpoints.length,
                journalCount: currentRecords.journals.length,
              });
              indexedDbStageEnded = true;
              const checkpoints = new Map(currentRecords.checkpoints.map(record => [record.key, record]));
              const journals = new Map(currentRecords.journals.map(record => [record.key, record]));
              restoreStage = openPerformance?.beginStage?.('journal-restore');
              const packaged = autosaveSchemaV2Utils.restoreSchemaV2Manifest(
                currentRecords.manifest,
                checkpoints,
                journals,
                { trustDetachedCheckpointRecords: true }
              );
              const journalOperationCount = currentRecords.journals.reduce((sum, journal) => (
                sum + (Array.isArray(journal?.ops) ? journal.ops.length : 0)
              ), 0);
              openPerformance?.endStage?.(restoreStage, { journalOperationCount });
              openPerformance?.annotate?.({
                fastPathUsed: true,
                fallbackUsed: false,
                revision: Math.max(0, Math.round(Number(currentRecords.manifest?.revision) || 0)),
                journalOperationCount,
              });
              return {
                packaged,
                manifest: currentRecords.manifest,
                fallbackUsed: false,
                fastPathUsed: true,
                current: currentRecords.current,
                thumbnail: currentRecords.thumbnail?.value || null,
              };
            } catch (error) {
              if (!indexedDbStageEnded) {
                openPerformance?.endStage?.(indexedDbStage, {
                  failed: true,
                  errorCode: error?.code || '',
                });
              }
              openPerformance?.endStage?.(restoreStage, {
                failed: true,
                errorCode: error?.code || '',
              });
              openPerformance?.annotate?.({
                fastPathUsed: false,
                fallbackUsed: true,
              });
              console.warn('[pixiedraw:v2-read]', {
                phase: 'current-revision-fast-path-fallback',
                projectId: normalizeProjectId(projectId),
                error: error?.message || String(error),
              });
            }
          }
          // Recovery and explicitly requested revisions intentionally keep the
          // exhaustive path. It reads retained immutable revisions and verifies
          // their complete checksums before choosing a fallback.
          const fallbackReadStage = openPerformance?.beginStage?.('indexeddb-fallback-all-revisions');
          const records = await loadAllProjectSchemaRecords(projectId);
          openPerformance?.endStage?.(fallbackReadStage, {
            manifestCount: records.manifests.length,
            checkpointCount: records.checkpoints.length,
            journalCount: records.journals.length,
          });
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
          const fallbackRestoreStage = openPerformance?.beginStage?.('journal-fallback-restore');
          const restored = autosaveSchemaV2Utils.restoreSchemaV2WithFallback(store, recentEntry);
          const journalOperationCount = records.journals.reduce((sum, journal) => (
            sum + (Array.isArray(journal?.ops) ? journal.ops.length : 0)
          ), 0);
          openPerformance?.endStage?.(fallbackRestoreStage, { journalOperationCount });
          openPerformance?.annotate?.({
            fastPathUsed: false,
            fallbackUsed: true,
            revision: Math.max(0, Math.round(Number(restored?.manifest?.revision) || 0)),
            journalOperationCount,
          });
          return {
            ...restored,
            fastPathUsed: false,
            current: records.current,
            thumbnail: records.thumbnails.find(entry => entry?.key === restored.manifest?.thumbnailRef?.key)?.value || null,
          };
        }

        async function cleanupSchemaV2RevisionsNow(projectId, { keepManifestRevisions = 2 } = {}) {
          const id = normalizeProjectId(projectId);
          if (!id) return { removedRevisionCount: 0 };
          const db = await openSchemaV2Database();
          let removedRevisionCount = 0;
          try {
            ensureStoresExist(db);
            const tx = db.transaction([
              LOCAL_PROJECT_MANIFESTS_STORE,
              LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE,
              LOCAL_PROJECT_JOURNALS_STORE,
              LOCAL_PROJECT_THUMBNAILS_STORE,
            ], 'readwrite');
            const manifestRequest = tx
              .objectStore(LOCAL_PROJECT_MANIFESTS_STORE)
              .index('projectId')
              .getAll(id);
            manifestRequest.onsuccess = () => {
              const sorted = (manifestRequest.result || [])
                .filter(manifest => manifest?.projectId === id)
                .sort((left, right) => Math.round(Number(right.revision) || 0) - Math.round(Number(left.revision) || 0));
              const retainedManifests = sorted.slice(
                0,
                Math.max(1, Math.round(Number(keepManifestRevisions) || 2))
              );
              const retainedManifestKeys = new Set(retainedManifests.map(manifest => manifest.key));
              const retainedCheckpointKeys = new Set();
              const retainedJournalKeys = new Set();
              const retainedThumbnailKeys = new Set();
              for (const manifest of retainedManifests) {
                const referenced = getManifestReferencedKeys(manifest);
                referenced.checkpointKeys.forEach(key => retainedCheckpointKeys.add(key));
                referenced.journalKeys.forEach(key => retainedJournalKeys.add(key));
                if (referenced.thumbnailKey) retainedThumbnailKeys.add(referenced.thumbnailKey);
              }
              const removable = sorted.filter(manifest => !retainedManifestKeys.has(manifest.key));
              removedRevisionCount = removable.length;
              if (!removable.length) return;
              queueProjectKeyDeletes(tx, LOCAL_PROJECT_MANIFESTS_STORE, id, retainedManifestKeys);
              queueProjectKeyDeletes(tx, LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE, id, retainedCheckpointKeys);
              queueProjectKeyDeletes(tx, LOCAL_PROJECT_JOURNALS_STORE, id, retainedJournalKeys);
              queueProjectKeyDeletes(tx, LOCAL_PROJECT_THUMBNAILS_STORE, id, retainedThumbnailKeys);
            };
            await waitForTransaction(tx, db);
          } catch (error) {
            try { db.close(); } catch (_error) {}
            throw error;
          }
          return { removedRevisionCount };
        }

        async function cleanupSchemaV2Revisions(projectId, options = {}) {
          const id = normalizeProjectId(projectId);
          if (!id) return { removedRevisionCount: 0 };
          return await queueProjectTask(id, () => cleanupSchemaV2RevisionsNow(id, options));
        }

        async function deleteSchemaV2Project(projectId) {
          const id = normalizeProjectId(projectId);
          if (!id) return false;
          const existingRemoval = projectRemovalPromises.get(id);
          if (existingRemoval) return await existingRemoval;
          const lifecycle = getProjectLifecycle(id);
          if (lifecycle.deleted) return true;
          lifecycle.deleting = true;
          lifecycle.epoch += 1;
          const removalPromise = (async () => {
            // Complete writes already admitted to this module before the
            // tombstone transaction. New writes are rejected immediately by
            // queueProjectTask and, after this transaction, by other tabs.
            await flushProjectTasks(id);
            assertSchemaDependencies();
            const db = await openSchemaV2Database();
            try {
              ensureStoresExist(db);
              const tx = db.transaction(requiredStoreNames(), 'readwrite');
              const manifests = tx.objectStore(LOCAL_PROJECT_MANIFESTS_STORE);
              const checkpoints = tx.objectStore(LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE);
              const journals = tx.objectStore(LOCAL_PROJECT_JOURNALS_STORE);
              const thumbnails = tx.objectStore(LOCAL_PROJECT_THUMBNAILS_STORE);
              const current = tx.objectStore(LOCAL_PROJECT_CURRENT_MANIFESTS_STORE);
              const transactionDone = waitForTransaction(tx, db);
              await requestValue(current.get(id));
              queueProjectKeyDeletes(tx, LOCAL_PROJECT_MANIFESTS_STORE, id);
              queueProjectKeyDeletes(tx, LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE, id);
              queueProjectKeyDeletes(tx, LOCAL_PROJECT_JOURNALS_STORE, id);
              queueProjectKeyDeletes(tx, LOCAL_PROJECT_THUMBNAILS_STORE, id);
              // Keep only a tiny tombstone in the reference store. It is
              // hidden from project reads but prevents a second tab that has
              // not yet observed the delete from recreating project bodies.
              current.put({
                projectId: id,
                deleted: true,
                deletedAt: new Date().toISOString(),
              });
              await transactionDone;
            } catch (error) {
              try { db.close(); } catch (_error) {}
              throw error;
            }
            const remaining = await readProjectSchemaRecordCounts(id);
            if (
              remaining.manifests > 0
              || remaining.checkpoints > 0
              || remaining.journals > 0
              || remaining.thumbnails > 0
              || remaining.current > 0
              || remaining.deletedMarker !== true
            ) {
              throw new Error('autosave-schema-v2-project-delete-incomplete');
            }
            lifecycle.deleted = true;
            lifecycle.deleting = false;
            return true;
          })().catch(error => {
            lifecycle.deleting = false;
            throw error;
          });
          projectRemovalPromises.set(id, removalPromise);
          try {
            return await removalPromise;
          } finally {
            if (projectRemovalPromises.get(id) === removalPromise) {
              projectRemovalPromises.delete(id);
            }
          }
        }

        return Object.freeze({
          requiredStoreNames,
          readCurrentManifestReference,
          readCurrentSchemaV2Manifest,
          commitSchemaV2Bundle,
          writeSchemaV2Project,
          writeSchemaV2JournalRevision,
          loadCurrentProjectSchemaRecords,
          loadAllProjectSchemaRecords,
          readSchemaV2Project,
          cleanupSchemaV2Revisions,
          deleteSchemaV2Project,
        });
      }
    })(scope);
  }

  root.autosaveSchemaV2IndexedDbUtils = Object.freeze({
    createAutosaveSchemaV2IndexedDbUtils,
  });
})();
