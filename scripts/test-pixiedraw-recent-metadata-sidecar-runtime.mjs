import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');

const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';
const databaseName = 'pixieedraw-autosave';
const recentProjectsStore = 'recentProjects';
const metadataStore = 'handles';
const metadataPrefix = 'recentProjectMetadata:v1:';
const legacyProjectCount = 8;
const legacyPayloadBytes = 1024 * 1024;
const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const legacyProjectIds = Array.from(
  { length: legacyProjectCount },
  (_value, index) => `sidecar-legacy-${testRunId}-${String(index).padStart(2, '0')}`,
);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];

page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
await page.addInitScript(({ prefix, recentStore, metadataStoreName }) => {
  const createProbe = () => ({
    recentProjects: { openCursor: 0, get: 0, getAll: 0, getAllKeys: 0, put: 0, delete: 0 },
    metadata: { get: 0, getAll: 0, getAllKeys: 0, getAllKeysRanged: 0, put: 0, delete: 0 },
  });
  const probe = createProbe();
  const objectStore = IDBObjectStore.prototype;
  const original = {
    openCursor: objectStore.openCursor,
    get: objectStore.get,
    getAll: objectStore.getAll,
    getAllKeys: objectStore.getAllKeys,
    put: objectStore.put,
    delete: objectStore.delete,
  };
  const bucket = store => store?.name === 'recentProjects'
    ? probe.recentProjects
    : store?.name === 'handles'
      ? probe.metadata
      : null;
  const isMetadataKey = key => typeof key === 'string' && key.startsWith(prefix);

  objectStore.openCursor = function (...args) {
    if (this.name === recentStore) probe.recentProjects.openCursor += 1;
    return original.openCursor.apply(this, args);
  };
  objectStore.get = function (...args) {
    const target = bucket(this);
    if (target && (this.name !== metadataStoreName || isMetadataKey(args[0]))) target.get += 1;
    return original.get.apply(this, args);
  };
  objectStore.getAll = function (...args) {
    const target = bucket(this);
    if (target) target.getAll += 1;
    return original.getAll.apply(this, args);
  };
  objectStore.getAllKeys = function (...args) {
    const target = bucket(this);
    if (target) {
      target.getAllKeys += 1;
      if (this.name === metadataStoreName && args[0] instanceof IDBKeyRange) {
        target.getAllKeysRanged += 1;
      }
    }
    return original.getAllKeys.apply(this, args);
  };
  objectStore.put = function (...args) {
    const target = bucket(this);
    if (target && (this.name !== metadataStoreName || isMetadataKey(args[1]))) target.put += 1;
    return original.put.apply(this, args);
  };
  objectStore.delete = function (...args) {
    const target = bucket(this);
    if (target && (this.name !== metadataStoreName || isMetadataKey(args[0]))) target.delete += 1;
    return original.delete.apply(this, args);
  };
  window.__pixieedRecentMetadataSidecarProbe = probe;
}, {
  prefix: metadataPrefix,
  recentStore: recentProjectsStore,
  metadataStoreName: metadataStore,
});
await page.route(
  /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
  route => route.abort(),
).catch(() => {});

async function waitForEditorReady() {
  await page.waitForFunction(
    () => window.__PIXIEEDRAW_EDITOR_READY__ === true,
    null,
    { timeout: 20_000 },
  );
}

async function closeOptionalPiXiSyncResumeNotice() {
  const notice = page.locator('#pixisyncResumeNoticeDialog[open]');
  if (await notice.count()) {
    await page.locator('#pixisyncResumeNoticeClose').click({ timeout: 5_000 }).catch(() => {});
    await page.waitForFunction(
      () => !document.getElementById('pixisyncResumeNoticeDialog')?.open,
      null,
      { timeout: 5_000 },
    ).catch(() => {});
  }
}

async function readProbe() {
  return page.evaluate(() => structuredClone(window.__pixieedRecentMetadataSidecarProbe));
}

async function waitForMetadataSidecars() {
  await page.waitForFunction(
    async ({ dbName, storeName, prefix, ids }) => await new Promise(resolve => {
      const request = indexedDB.open(dbName);
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const database = request.result;
        let transaction;
        try {
          transaction = database.transaction([storeName], 'readonly');
        } catch (_error) {
          database.close();
          resolve(false);
          return;
        }
        const keyRequest = transaction.objectStore(storeName).getAllKeys();
        keyRequest.onerror = () => {
          database.close();
          resolve(false);
        };
        keyRequest.onsuccess = () => {
          const keys = new Set(keyRequest.result || []);
          const complete = ids.every(id => keys.has(`${prefix}${id}`));
          if (complete) database.close();
          resolve(complete);
        };
        transaction.onabort = () => {
          try { database.close(); } catch (_error) {}
          resolve(false);
        };
      };
    }),
    {
      dbName: databaseName,
      storeName: metadataStore,
      prefix: metadataPrefix,
      ids: legacyProjectIds,
    },
    { timeout: 20_000 },
  );
}

async function seedLegacyProjects() {
  await page.evaluate(async ({ dbName, storeName, ids, payloadBytes }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const payload = 'L'.repeat(payloadBytes);
    await new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const now = Date.now();
      ids.forEach((id, index) => {
        store.put({
          id,
          accountUserId: '',
          name: `サイドカー移行テスト ${index}`,
          fileName: `${id}.pxd`,
          updatedAt: new Date(now - index * 1_000).toISOString(),
          storageKind: 'local',
          // This is the legacy V1 shape whose payload must be migrated out of
          // the startup/list path without being discarded.
          project: {
            width: 512,
            height: 512,
            layers: [{ id: 'layer-1', name: '背景', pixels: payload }],
          },
        }, id);
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, {
    dbName: databaseName,
    storeName: recentProjectsStore,
    ids: legacyProjectIds,
    payloadBytes: legacyPayloadBytes,
  });
}

async function readLegacyPayloadPresence() {
  return page.evaluate(async ({ dbName, storeName, ids }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const found = [];
        ids.forEach(id => {
          const request = store.get(id);
          request.onsuccess = () => {
            if (request.result?.project?.layers?.[0]?.pixels?.length) found.push(id);
          };
          request.onerror = () => reject(request.error);
        });
        transaction.oncomplete = () => resolve(found.length === ids.length);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, { dbName: databaseName, storeName: recentProjectsStore, ids: legacyProjectIds });
}

async function cleanupSeededProjects() {
  await page.evaluate(async ({ dbName, recentStore, metadataStoreName, prefix, deletionPrefix, ids }) => {
    const database = await new Promise(resolve => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (!database) return;
    try {
      await new Promise(resolve => {
        const transaction = database.transaction([recentStore, metadataStoreName], 'readwrite');
        const recent = transaction.objectStore(recentStore);
        const metadata = transaction.objectStore(metadataStoreName);
        ids.forEach(id => {
          recent.delete(id);
          metadata.delete(`${prefix}${id}`);
          metadata.delete(`${deletionPrefix}${id}`);
        });
        transaction.oncomplete = resolve;
        transaction.onerror = resolve;
        transaction.onabort = resolve;
      });
    } finally {
      database.close();
    }
  }, {
    dbName: databaseName,
    recentStore: recentProjectsStore,
    metadataStoreName: metadataStore,
    prefix: metadataPrefix,
    deletionPrefix: 'recentProjectDeletion:v1:',
    ids: legacyProjectIds,
  }).catch(() => {});
}

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await waitForEditorReady();
  await page.waitForTimeout(1_500);
  await closeOptionalPiXiSyncResumeNotice();
  await seedLegacyProjects();

  // First open: the old V1 records are read once for migration, while the
  // startup path remains cursor-free and metadata writes are small sidecars.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await waitForEditorReady();
  await page.waitForTimeout(1_500);
  await closeOptionalPiXiSyncResumeNotice();
  await waitForMetadataSidecars();
  const migrationProbe = await readProbe();

  // Second open: all cards should come from keys plus sidecars; the large V1
  // project payload must not be cloned by the project chooser.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await waitForEditorReady();
  await page.waitForTimeout(1_500);
  await closeOptionalPiXiSyncResumeNotice();
  const lightReopenProbe = await readProbe();

  if (await page.locator('#showLocalProjects').count()) {
    await page.locator('#showLocalProjects').click().catch(() => {});
  }
  await page.waitForFunction(
    id => Array.from(document.querySelectorAll('#startupWorkspaceProjectList .startup-workspace__project-name'))
      .some(node => (node.textContent || '').includes(id)),
    legacyProjectIds[0],
    { timeout: 20_000 },
  );
  const legacyPayloadStillStored = await readLegacyPayloadPresence();

  assert.equal(migrationProbe.recentProjects.openCursor, 0, 'legacy migration must not scan recentProjects with a cursor');
  assert.equal(migrationProbe.recentProjects.getAll, 0, 'legacy migration must not clone all recent project values');
  assert.ok(migrationProbe.recentProjects.getAllKeys >= 1, 'legacy migration must enumerate recent project keys');
  assert.ok(
    migrationProbe.recentProjects.get >= legacyProjectCount,
    'legacy migration must read each missing legacy payload by id exactly once or more',
  );
  assert.equal(migrationProbe.metadata.getAll, 0, 'metadata migration must not clone all handle values');
  assert.ok(migrationProbe.metadata.getAllKeys >= 1, 'metadata migration must enumerate sidecar keys');
  assert.ok(
    migrationProbe.metadata.getAllKeysRanged >= 1,
    'metadata migration must enumerate only the sidecar key range',
  );
  assert.ok(
    migrationProbe.metadata.put >= legacyProjectCount,
    'legacy migration must persist a sidecar for every project',
  );

  assert.equal(lightReopenProbe.recentProjects.openCursor, 0, 'light reopen must not scan recentProjects with a cursor');
  assert.equal(lightReopenProbe.recentProjects.get, 0, 'light reopen must not read legacy project payload rows');
  assert.equal(lightReopenProbe.recentProjects.getAll, 0, 'light reopen must not clone recent project values');
  assert.ok(lightReopenProbe.recentProjects.getAllKeys >= 1, 'light reopen must read only recent project keys');
  assert.equal(lightReopenProbe.metadata.getAll, 0, 'light reopen must not clone handle values');
  assert.ok(lightReopenProbe.metadata.getAllKeys >= 1, 'light reopen must enumerate sidecar keys');
  assert.ok(
    lightReopenProbe.metadata.getAllKeysRanged >= 1,
    'light reopen must enumerate only the sidecar key range',
  );
  assert.ok(
    lightReopenProbe.metadata.get >= legacyProjectCount,
    'light reopen must read metadata sidecars by key',
  );
  assert.equal(lightReopenProbe.metadata.put, 0, 'light reopen must not rewrite already migrated sidecars');
  assert.equal(legacyPayloadStillStored, true, 'metadata migration must preserve the legacy project payload');
  assert.deepEqual(pageErrors, [], 'metadata sidecar migration must not emit page errors');

  console.log(JSON.stringify({
    status: 'PASS',
    targetUrl,
    legacyProjectCount,
    legacyPayloadBytesPerProject: legacyPayloadBytes,
    migrationProbe,
    lightReopenProbe,
    legacyPayloadStillStored,
    pageErrors,
  }, null, 2));
  console.log('PiXiEEDraw recent-project metadata sidecar runtime checks passed');
} finally {
  await cleanupSeededProjects();
  await context.close();
  await browser.close();
}
