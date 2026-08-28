import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import http from 'node:http';
import path from 'node:path';

const repoRoot = '/Users/tsukadareine/Documents/GitHub/PiXiEED';
const require = createRequire(path.join(repoRoot, 'tools/screenshots/package.json'));
const { chromium } = require('playwright');

function startServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>PiXiEEDraw V2 key-only maintenance</title>');
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const server = await startServer();
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/`;
let browser = null;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  for (const relativePath of [
    'pixiedraw/assets/js/modules/autosave-schema-v2-utils.js',
    'pixiedraw/assets/js/modules/autosave-schema-v2-indexeddb-utils.js',
  ]) {
    await page.addScriptTag({ path: path.join(repoRoot, relativePath) });
  }

  const result = await page.evaluate(async () => {
    const dbName = `pixiedraw-v2-key-only-${crypto.randomUUID()}`;
    const stores = {
      manifests: 'manifests',
      checkpoints: 'checkpoints',
      journals: 'journals',
      thumbnails: 'thumbnails',
      current: 'current',
    };
    const schema = window.PiXiEEDrawModules.autosaveSchemaV2Utils.createAutosaveSchemaV2Utils();
    const createIndexed = () => window.PiXiEEDrawModules.autosaveSchemaV2IndexedDbUtils.createAutosaveSchemaV2IndexedDbUtils({
      autosaveSchemaV2Utils: schema,
      AUTOSAVE_SCHEMA_V2_DB_NAME: dbName,
      AUTOSAVE_SCHEMA_V2_DB_VERSION: 1,
      LOCAL_PROJECT_MANIFESTS_STORE: stores.manifests,
      LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE: stores.checkpoints,
      LOCAL_PROJECT_JOURNALS_STORE: stores.journals,
      LOCAL_PROJECT_THUMBNAILS_STORE: stores.thumbnails,
      LOCAL_PROJECT_CURRENT_MANIFESTS_STORE: stores.current,
    });
    const indexed = createIndexed();
    // A second factory models a different tab. Its in-memory queue is
    // intentionally independent; the persistent tombstone must still block
    // a write that arrives after the delete transaction.
    const secondTabIndexed = createIndexed();
    const projectId = 'key-only-large-project';
    const width = 512;
    const height = 512;
    const pixelCount = width * height;
    const createProject = revision => ({
      projectId,
      name: `key-only-${revision}`,
      fileName: `key-only-${revision}.pxd`,
      updatedAt: `2026-08-28T00:00:0${revision}Z`,
      sourceKind: 'recent',
      project: {
        type: 'pixieedraw-project',
        packageVersion: 2,
        version: 2,
        projectLayout: 'single-project',
        document: {
          id: 'canvas-1',
          activeCanvasId: 'canvas-1',
          width,
          height,
          activeFrame: 0,
          activeLayer: 'layer-1',
          palette: [{ r: 0, g: 0, b: 0, a: 0 }, { r: 255, g: 255, b: 255, a: 255 }],
          frames: [{
            id: 'frame-1',
            layers: [{
              id: 'layer-1',
              indices: new Int16Array(pixelCount).fill(-1),
              direct: new Uint8ClampedArray(pixelCount * 4),
              importSourceDirect: null,
              directOnly: false,
            }],
          }],
          colorMode: 'index',
        },
        session: { historyLimit: 30 },
      },
      journalOps: [],
      thumbnail: `thumb-${revision}`,
    });

    await indexed.writeSchemaV2Project(createProject(1));
    const [serializedWriteA, serializedWriteB] = await Promise.all([
      indexed.writeSchemaV2Project(createProject(2)),
      indexed.writeSchemaV2Project(createProject(3)),
    ]);
    const serializedRevisions = [serializedWriteA.manifest.revision, serializedWriteB.manifest.revision];
    const calls = [];
    const originalGetAll = IDBIndex.prototype.getAll;
    const originalGetAllKeys = IDBIndex.prototype.getAllKeys;
    const originalOpenKeyCursor = IDBIndex.prototype.openKeyCursor;
    IDBIndex.prototype.getAll = function (...args) {
      calls.push({ method: 'getAll', store: this.objectStore?.name || '' });
      return originalGetAll.apply(this, args);
    };
    IDBIndex.prototype.getAllKeys = function (...args) {
      calls.push({ method: 'getAllKeys', store: this.objectStore?.name || '' });
      return originalGetAllKeys.apply(this, args);
    };
    IDBIndex.prototype.openKeyCursor = function (...args) {
      calls.push({ method: 'openKeyCursor', store: this.objectStore?.name || '' });
      return originalOpenKeyCursor.apply(this, args);
    };

    const journalStartedAt = performance.now();
    const journalWrite = await indexed.writeSchemaV2JournalRevision(projectId, [{
      sequence: 1,
      kind: 'pixel-patch',
      canvasId: 'canvas-1',
      frameId: 'frame-1',
      layerId: 'layer-1',
      changes: [{ index: 0, after: { paletteIndex: 1 } }],
    }], { thumbnail: 'journal-thumb' });
    const journalElapsedMs = Math.round(performance.now() - journalStartedAt);
    const maintenanceCalls = calls.splice(0, calls.length);

    const deleteStartedAt = performance.now();
    const raceWrite = secondTabIndexed.writeSchemaV2Project(createProject(4), { skipCleanup: true })
      .then(value => ({ status: 'committed', revision: value.manifest?.revision || 0 }))
      .catch(error => ({ status: 'rejected', code: error?.code || '', message: error?.message || String(error) }));
    const deleted = await indexed.deleteSchemaV2Project(projectId);
    const deleteElapsedMs = Math.round(performance.now() - deleteStartedAt);
    const deleteCalls = calls.splice(0, calls.length);
    IDBIndex.prototype.getAll = originalGetAll;
    IDBIndex.prototype.getAllKeys = originalGetAllKeys;
    IDBIndex.prototype.openKeyCursor = originalOpenKeyCursor;

    const raceWriteResult = await raceWrite;
    let lateWriteCode = '';
    try {
      await secondTabIndexed.writeSchemaV2Project(createProject(5), { skipCleanup: true });
    } catch (error) {
      lateWriteCode = error?.code || '';
    }

    const remaining = await indexed.loadAllProjectSchemaRecords(projectId);
    const rawCurrent = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction([stores.current], 'readonly');
        const currentRequest = transaction.objectStore(stores.current).get(projectId);
        currentRequest.onsuccess = () => resolve(currentRequest.result || null);
        currentRequest.onerror = () => reject(currentRequest.error);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error);
      };
    });
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });

    return {
      journalCommitted: journalWrite.committed,
      bodyBytes: pixelCount * Int16Array.BYTES_PER_ELEMENT
        + pixelCount * 4 * Uint8ClampedArray.BYTES_PER_ELEMENT,
      journalElapsedMs,
      deleteElapsedMs,
      serializedRevisions,
      raceWriteResult,
      lateWriteCode,
      maintenanceCalls,
      deleteCalls,
      deleted,
      rawCurrent,
      remaining: {
        manifests: remaining.manifests.length,
        checkpoints: remaining.checkpoints.length,
        journals: remaining.journals.length,
        thumbnails: remaining.thumbnails.length,
        current: Boolean(remaining.current),
      },
    };
  });

  const bodyStores = new Set(['checkpoints', 'journals', 'thumbnails']);
  const maintenanceBodyReads = result.maintenanceCalls.filter(call => (
    call.method === 'getAll' && bodyStores.has(call.store)
  ));
  const deleteBodyReads = result.deleteCalls.filter(call => (
    call.method === 'getAll' && bodyStores.has(call.store)
  ));
  assert.equal(result.journalCommitted, true);
  assert.deepEqual(result.serializedRevisions, [2, 3], 'same-project writes must be serialized before revision allocation');
  assert.ok(
    result.raceWriteResult.status === 'committed' || result.raceWriteResult.status === 'rejected',
    'cross-tab race must settle without an uncaught write failure'
  );
  if (result.raceWriteResult.status === 'rejected') {
    assert.equal(result.raceWriteResult.code, 'ERR_AUTOSAVE_PROJECT_DELETED');
  }
  assert.equal(result.lateWriteCode, 'ERR_AUTOSAVE_PROJECT_DELETED', 'late cross-tab writes must be rejected by the tombstone');
  assert.deepEqual(maintenanceBodyReads, [], 'journal save/cleanup must not clone large body records');
  assert.deepEqual(deleteBodyReads, [], 'project deletion must not clone large body records');
  assert.ok(
    result.maintenanceCalls.some(call => call.method === 'getAll' && call.store === 'manifests'),
    'cleanup may read only the small manifest records'
  );
  for (const store of ['manifests', 'checkpoints', 'journals', 'thumbnails']) {
    assert.ok(
      result.deleteCalls.some(call => (
        (call.method === 'getAllKeys' || call.method === 'openKeyCursor') && call.store === store
      )),
      `delete must enumerate keys without loading values: ${store}`
    );
  }
  assert.equal(result.deleted, true);
  assert.equal(result.rawCurrent?.deleted, true, 'delete must leave only a small persistent tombstone');
  assert.deepEqual(result.remaining, {
    manifests: 0,
    checkpoints: 0,
    journals: 0,
    thumbnails: 0,
    current: false,
  });
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
