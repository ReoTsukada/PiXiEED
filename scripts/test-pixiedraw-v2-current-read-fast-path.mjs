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
    response.end('<!doctype html><title>PiXiEEDraw V2 current read</title>');
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
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  for (const relativePath of [
    'pixiedraw/assets/js/modules/autosave-schema-v2-utils.js',
    'pixiedraw/assets/js/modules/autosave-schema-v2-indexeddb-utils.js',
  ]) {
    await page.addScriptTag({ path: path.join(repoRoot, relativePath) });
  }

  const result = await page.evaluate(async () => {
    const dbName = `pixiedraw-v2-current-read-${crypto.randomUUID()}`;
    const stores = {
      manifests: 'manifests',
      checkpoints: 'checkpoints',
      journals: 'journals',
      thumbnails: 'thumbnails',
      current: 'current',
    };
    const schema = window.PiXiEEDrawModules.autosaveSchemaV2Utils.createAutosaveSchemaV2Utils();
    const indexed = window.PiXiEEDrawModules.autosaveSchemaV2IndexedDbUtils.createAutosaveSchemaV2IndexedDbUtils({
      autosaveSchemaV2Utils: schema,
      AUTOSAVE_SCHEMA_V2_DB_NAME: dbName,
      AUTOSAVE_SCHEMA_V2_DB_VERSION: 1,
      LOCAL_PROJECT_MANIFESTS_STORE: stores.manifests,
      LOCAL_PROJECT_SHEET_CHECKPOINTS_STORE: stores.checkpoints,
      LOCAL_PROJECT_JOURNALS_STORE: stores.journals,
      LOCAL_PROJECT_THUMBNAILS_STORE: stores.thumbnails,
      LOCAL_PROJECT_CURRENT_MANIFESTS_STORE: stores.current,
    });
    const createProject = (revision, documentName) => ({
      projectId: 'large-project',
      name: documentName,
      fileName: `${documentName}.pixieedraw`,
      updatedAt: `2026-07-19T00:00:0${revision}Z`,
      sourceKind: 'recent',
      project: {
        type: 'pixieedraw-project',
        packageVersion: 2,
        version: 2,
        projectLayout: 'single-project',
        document: {
          version: 2,
          width: 2,
          height: 2,
          documentName,
          palette: [{ r: 0, g: 0, b: 0, a: 0 }],
          frames: [{
            id: 'frame-1',
            layers: [{
              id: 'layer-1',
              indices: new Int16Array([-1, -1, -1, -1]),
              direct: new Uint8ClampedArray([
                revision, 0, 0, 255,
                0, revision, 0, 255,
                0, 0, revision, 255,
                revision, revision, revision, 255,
              ]),
              importSourceDirect: null,
              directOnly: true,
            }],
          }],
          activeFrame: 0,
          activeLayer: 'layer-1',
          colorMode: 'index',
        },
        session: {
          historyLimit: 30,
          timelapse: { enabled: false, fps: 12, byCanvas: {}, operationLogsByCanvas: {} },
        },
      },
      journalOps: [],
      thumbnail: `thumb-${revision}`,
    });

    const write1 = await indexed.writeSchemaV2Project(createProject(1, 'old'));
    const write2 = await indexed.writeSchemaV2Project(createProject(2, 'current'), {
      keepManifestRevisions: 2,
    });
    const currentRecords = await indexed.loadCurrentProjectSchemaRecords('large-project');
    const allRecords = await indexed.loadAllProjectSchemaRecords('large-project');
    const checksumDebug = {
      write1: schema.hasValidChecksum(write1.bundle.checkpoints[0]),
      write2: schema.hasValidChecksum(write2.bundle.checkpoints[0]),
      stored: allRecords.checkpoints.map(record => ({
        key: record.key,
        valid: schema.hasValidChecksum(record),
        indicesType: record.project.document.frames[0].layers[0].indices.constructor.name,
        directType: record.project.document.frames[0].layers[0].direct.constructor.name,
      })),
    };
    if (!checksumDebug.write1 || !checksumDebug.write2 || checksumDebug.stored.some(record => !record.valid)) {
      throw new Error(`Typed checkpoint checksum mismatch: ${JSON.stringify(checksumDebug)}`);
    }
    const fastRead = await indexed.readSchemaV2Project('large-project');
    const explicitOldRead = await indexed.readSchemaV2Project('large-project', { revision: 1 });

    const currentCheckpointKey = write2.manifest.project.checkpointRef.key;
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction([stores.checkpoints], 'readwrite');
      const store = tx.objectStore(stores.checkpoints);
      const request = store.get(currentCheckpointKey);
      request.onsuccess = () => {
        const checkpoint = request.result;
        checkpoint.checksum = 'corrupt';
        store.put(checkpoint);
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    const fallbackRead = await indexed.readSchemaV2Project('large-project');
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });

    return {
      revisions: [write1.manifest.revision, write2.manifest.revision],
      currentRecordCounts: {
        checkpoints: currentRecords.checkpoints.length,
        journals: currentRecords.journals.length,
      },
      allRecordCounts: {
        checkpoints: allRecords.checkpoints.length,
        journals: allRecords.journals.length,
      },
      fastPathUsed: fastRead.fastPathUsed,
      fastDocumentName: fastRead.packaged.document.documentName,
      fastIndicesType: fastRead.packaged.document.frames[0].layers[0].indices.constructor.name,
      fastDirectType: fastRead.packaged.document.frames[0].layers[0].direct.constructor.name,
      fastDirectFirstByte: fastRead.packaged.document.frames[0].layers[0].direct[0],
      fastThumbnail: fastRead.thumbnail,
      explicitOldFastPathUsed: explicitOldRead.fastPathUsed,
      explicitOldDocumentName: explicitOldRead.packaged.document.documentName,
      fallbackFastPathUsed: fallbackRead.fastPathUsed,
      fallbackUsed: fallbackRead.fallbackUsed,
      fallbackDocumentName: fallbackRead.packaged.document.documentName,
    };
  });

  assert.deepEqual(result.revisions, [1, 2]);
  assert.deepEqual(result.currentRecordCounts, { checkpoints: 1, journals: 1 });
  assert.deepEqual(result.allRecordCounts, { checkpoints: 2, journals: 2 });
  assert.equal(result.fastPathUsed, true);
  assert.equal(result.fastDocumentName, 'current');
  assert.equal(result.fastIndicesType, 'Int16Array');
  assert.equal(result.fastDirectType, 'Uint8ClampedArray');
  assert.equal(result.fastDirectFirstByte, 2);
  assert.equal(result.fastThumbnail, 'thumb-2');
  assert.equal(result.explicitOldFastPathUsed, false);
  assert.equal(result.explicitOldDocumentName, 'old');
  assert.equal(result.fallbackFastPathUsed, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackDocumentName, 'old');
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
