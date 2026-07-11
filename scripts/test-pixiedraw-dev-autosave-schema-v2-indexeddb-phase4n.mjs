import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');

function startServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>PiXiEEDraw Phase 4-N</title>');
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function browserModulePath(relativePath) {
  return path.join(repoRoot, relativePath);
}

const server = await startServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });

  for (const relativePath of [
    'PiXiEEDrawDEV/assets/js/modules/project-storage-utils.js',
    'PiXiEEDrawDEV/assets/js/modules/autosave-database-utils.js',
    'PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-utils.js',
    'PiXiEEDrawDEV/assets/js/modules/autosave-schema-v2-indexeddb-utils.js',
  ]) {
    await page.addScriptTag({ path: browserModulePath(relativePath) });
  }

  const result = await page.evaluate(async () => {
    const config = window.PiXiEEDrawModules.projectStorageUtils.createProjectRuntimeStaticConfig();
    const legacyDbName = 'pixieedraw-autosave-phase4n-legacy';
    const schemaDbName = 'pixieedraw-autosave-phase4n-experimental';
    const deleteDatabase = databaseName => new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Test database delete was blocked'));
    });
    await deleteDatabase(legacyDbName);
    await deleteDatabase(schemaDbName);

    // Seed a V3-style database to prove the experimental V2 database leaves V1 data untouched.
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(legacyDbName, 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(config.AUTOSAVE_STORE_NAME);
        db.createObjectStore(config.RECENT_PROJECTS_STORE);
        db.createObjectStore(config.SHARED_LOCAL_OP_JOURNAL_STORE, { keyPath: 'id' });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction([config.RECENT_PROJECTS_STORE], 'readwrite');
        tx.objectStore(config.RECENT_PROJECTS_STORE).put({ id: 'legacy-v1', project: { version: 1 } }, 'legacy-v1');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });

    const databaseUtils = window.PiXiEEDrawModules.autosaveDatabaseUtils.createAutosaveDatabaseUtils({
      AUTOSAVE_DB_NAME: legacyDbName,
      AUTOSAVE_DB_VERSION: 3,
      AUTOSAVE_STORE_NAME: config.AUTOSAVE_STORE_NAME,
      RECENT_PROJECTS_STORE: config.RECENT_PROJECTS_STORE,
      SHARED_LOCAL_OP_JOURNAL_STORE: config.SHARED_LOCAL_OP_JOURNAL_STORE,
      LOCAL_PROJECT_MANIFESTS_STORE: config.LOCAL_PROJECT_MANIFESTS_STORE,
      LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE: config.LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE,
      LOCAL_PROJECT_JOURNALS_STORE: config.LOCAL_PROJECT_JOURNALS_STORE,
      LOCAL_PROJECT_THUMBNAILS_STORE: config.LOCAL_PROJECT_THUMBNAILS_STORE,
      LOCAL_PROJECT_CURRENT_MANIFESTS_STORE: config.LOCAL_PROJECT_CURRENT_MANIFESTS_STORE,
    });
    const schema = window.PiXiEEDrawModules.autosaveSchemaV2Utils.createAutosaveSchemaV2Utils();
    const indexed = window.PiXiEEDrawModules.autosaveSchemaV2IndexedDbUtils.createAutosaveSchemaV2IndexedDbUtils({
      autosaveSchemaV2Utils: schema,
      AUTOSAVE_SCHEMA_V2_DB_NAME: schemaDbName,
      AUTOSAVE_SCHEMA_V2_DB_VERSION: 1,
      LOCAL_PROJECT_MANIFESTS_STORE: config.LOCAL_PROJECT_MANIFESTS_STORE,
      LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE: config.LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE,
      LOCAL_PROJECT_JOURNALS_STORE: config.LOCAL_PROJECT_JOURNALS_STORE,
      LOCAL_PROJECT_THUMBNAILS_STORE: config.LOCAL_PROJECT_THUMBNAILS_STORE,
      LOCAL_PROJECT_CURRENT_MANIFESTS_STORE: config.LOCAL_PROJECT_CURRENT_MANIFESTS_STORE,
    });

    function createProject(revision, { includeThumbnail = true, includeDotStats = true } = {}) {
      const sheets = ['sheet-a', 'sheet-b', 'sheet-c'].map((id, index) => ({
        id,
        fileName: `${id}.pixieedraw`,
        label: `Sheet ${index + 1}`,
        sourceKind: 'file',
        sourceStorageAdapterId: 'pixieedraw-v2-zip-experimental',
        sourceProjectToken: `${id}-token`,
        projectSaveHandle: { name: 'must-not-persist.pixieedraw' },
        project: {
          type: 'pixieedraw-project',
          packageVersion: 2,
          document: {
            version: 1,
            documentName: `${id}.pixieedraw`,
            palette: [[0, 0, 0, 0], [255, 0, 0, 255]],
            activeCanvasId: `${id}-canvas-1`,
            canvases: [{
              id: `${id}-canvas-1`, width: 2, height: 2, activeFrame: 0,
              frames: [{ id: `${id}-frame-1`, layers: [{
                id: `${id}-layer-1`, indices: [0, 1, 0, 1],
                direct: [0, 0, 0, 0, 8, 9, 10, 255, 0, 0, 0, 0, 0, 0, 0, 0],
                importSourceDirect: [0, 0, 0, 0, 1, 2, 3, 255, 0, 0, 0, 0, 0, 0, 0, 0],
              }] }],
            }],
          },
          session: { historyPast: [{ label: `history-${revision}` }], historyFuture: [], timelapse: { enabled: true, fps: 12, byCanvas: {}, operationLogsByCanvas: {} } },
        },
      }));
      return {
        projectId: 'phase4n-project',
        name: 'Phase 4-N fixture',
        updatedAt: `2026-07-11T00:00:0${revision}Z`,
        activeSheetId: 'sheet-b',
        sheets,
        journalsBySheet: {
          'sheet-a': [{
            sequence: 1,
            kind: 'pixel-patch',
            canvasId: 'sheet-a-canvas-1', frameId: 'sheet-a-frame-1', layerId: 'sheet-a-layer-1',
            changes: [{ index: 1, after: { paletteIndex: -1, direct: [90, 91, 92, 255], importSourceDirect: [93, 94, 95, 255] } }],
          }],
        },
        thumbnail: includeThumbnail ? 'data:image/png;base64,phase4n' : null,
        dotStats: includeDotStats ? { totalDots: 9 } : null,
      };
    }

    const write1 = await indexed.writeSchemaV2Project(createProject(1));
    const read1 = await indexed.readSchemaV2Project('phase4n-project');
    const patched = read1.packaged.sheets[0].project.document.canvases[0].frames[0].layers[0];

    const abortResults = [];
    for (const stage of ['checkpoint', 'journal', 'manifest', 'current-ref']) {
      let errorMessage = '';
      try {
        await indexed.writeSchemaV2Project(createProject(2), { simulateAbortAt: stage });
      } catch (error) {
        errorMessage = error.message;
      }
      const restored = await indexed.readSchemaV2Project('phase4n-project');
      abortResults.push({ stage, errorMessage, revision: restored.manifest.revision });
    }

    const write2 = await indexed.writeSchemaV2Project(createProject(2), { simulateCleanupFailure: true });
    const recordsBeforeCorruption = await indexed.loadAllProjectSchemaRecords('phase4n-project');
    const revision2Checkpoint = recordsBeforeCorruption.checkpoints.find(record => record.rootRevision === 2 && record.sheetId === 'sheet-a');
    const revision2Journal = recordsBeforeCorruption.journals.find(record => record.revision === 2 && record.sheetId === 'sheet-a');

    async function mutateStore(storeName, key, mutate) {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(schemaDbName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], 'readwrite');
        const store = tx.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = () => {
          const next = request.result;
          mutate(next);
          store.put(next);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      });
    }

    await mutateStore(config.LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE, revision2Checkpoint.key, value => { value.checksum = 'corrupt'; });
    const checkpointFallback = await indexed.readSchemaV2Project('phase4n-project');

    // Restore a clean V2 revision, then verify journal corruption falls back only that sheet.
    const write3 = await indexed.writeSchemaV2Project(createProject(3, { includeThumbnail: false, includeDotStats: false }), { keepManifestRevisions: 3 });
    const records3 = await indexed.loadAllProjectSchemaRecords('phase4n-project');
    const revision3Journal = records3.journals.find(record => record.revision === 3 && record.sheetId === 'sheet-a');
    await mutateStore(config.LOCAL_PROJECT_JOURNALS_STORE, revision3Journal.key, value => { value.checksum = 'corrupt'; });
    const journalFallback = await indexed.readSchemaV2Project('phase4n-project');

    const db = await databaseUtils.openAutosaveDatabase();
    const legacyV1 = await new Promise((resolve, reject) => {
      const tx = db.transaction([config.RECENT_PROJECTS_STORE], 'readonly');
      const request = tx.objectStore(config.RECENT_PROJECTS_STORE).get('legacy-v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    });

    const allRecords = await indexed.loadAllProjectSchemaRecords('phase4n-project');
    const serializedRecords = JSON.stringify(allRecords);
    const storeNames = await new Promise((resolve, reject) => {
      const request = indexedDB.open(schemaDbName, 1);
      request.onsuccess = () => { const names = Array.from(request.result.objectStoreNames); request.result.close(); resolve(names); };
      request.onerror = () => reject(request.error);
    });
    await deleteDatabase(legacyDbName);
    await deleteDatabase(schemaDbName);
    return {
      write1Revision: write1.manifest.revision,
      read1Sheets: read1.packaged.sheets.length,
      patchedDirect: patched.direct.slice(4, 8),
      abortResults,
      cleanupError: write2.cleanupError?.message || '',
      currentRevisionAfterCleanup: recordsBeforeCorruption.current?.revision || 0,
      checkpointFallbackRevision: checkpointFallback.manifest.revision,
      checkpointFallbackUsed: checkpointFallback.fallbackUsed,
      journalFallbackRevision: journalFallback.manifest.revision,
      journalWarnings: journalFallback.packaged.recovery.journalWarnings,
      thumbnail: journalFallback.thumbnail,
      dotStats: journalFallback.packaged.dotStats,
      legacyV1,
      serializedRecords,
      storeNames,
      revision2JournalKey: revision2Journal.key,
      write3Revision: write3.manifest.revision,
    };
  });

  assert.equal(result.write1Revision, 1);
  assert.equal(result.read1Sheets, 3);
  assert.deepEqual(result.patchedDirect, [90, 91, 92, 255]);
  for (const abort of result.abortResults) {
    assert.match(abort.errorMessage, new RegExp(`transaction abort: ${abort.stage}`));
    assert.equal(abort.revision, 1, `${abort.stage} abort preserves the old current revision`);
  }
  assert.match(result.cleanupError, /cleanup failure/);
  assert.equal(result.currentRevisionAfterCleanup, 2);
  assert.equal(result.checkpointFallbackUsed, true);
  assert.equal(result.checkpointFallbackRevision, 1);
  assert.equal(result.journalFallbackRevision, 3);
  assert.ok(result.journalWarnings.includes('sheet-a'));
  assert.equal(result.thumbnail, null);
  assert.equal(result.dotStats, null);
  assert.deepEqual(result.legacyV1, { id: 'legacy-v1', project: { version: 1 } });
  assert.equal(result.serializedRecords.includes('projectSaveHandle'), false);
  assert.equal(result.serializedRecords.includes('must-not-persist'), false);
  for (const storeName of [
    'localProjectManifests',
    'localProjectSheetCheckpoints',
    'localProjectJournals',
    'localProjectThumbnails',
    'localProjectCurrentManifests',
  ]) {
    assert.ok(result.storeNames.includes(storeName), `store exists: ${storeName}`);
  }
  console.log('Phase 4-N real IndexedDB autosave schema checks passed.');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
