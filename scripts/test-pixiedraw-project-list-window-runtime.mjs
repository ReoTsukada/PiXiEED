import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');

const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';
const databaseName = 'pixieedraw-autosave';
const storeName = 'recentProjects';
const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const bulkCount = 125;
const bulkIds = Array.from({ length: bulkCount }, (_value, index) => `list-window-${testRunId}-${index}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(String(error?.message || error)));
await page.route(
  /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
  route => route.abort()
).catch(() => {});

async function openLocalProjects() {
  await page.evaluate(() => document.getElementById('showLocalProjects')?.click());
  await page.waitForFunction(
    () => document.body.classList.contains('is-startup-active')
      && document.querySelector('#startupWorkspaceProjectList .startup-workspace__project-name')?.textContent
        ?.includes('list-window-0'),
    null,
    { timeout: 20_000 }
  );
}

async function readCardCount() {
  return page.locator('#startupWorkspaceProjectList .startup-workspace__project').count();
}

try {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForFunction(() => window.__PIXIEEDRAW_EDITOR_READY__ === true, null, { timeout: 20_000 });
  await page.evaluate(async ({ databaseName: dbName, storeName: recentStore, ids, runId }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const now = Date.now();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction([recentStore], 'readwrite');
      const store = transaction.objectStore(recentStore);
      ids.forEach((id, index) => {
        store.put({
          id,
          accountUserId: '',
          name: `大量一覧テスト ${index}`,
          fileName: `list-window-${index}.pxd`,
          updatedAt: new Date(now + 200_000 - index * 1_000).toISOString(),
          autosaveSchemaVersion: 2,
          manifestKey: `bulk-metadata-only-${runId}-${index}`,
          storageKind: 'local',
          project: null,
        }, id);
      });
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, { databaseName, storeName, ids: bulkIds, runId: testRunId });

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForFunction(() => window.__PIXIEEDRAW_EDITOR_READY__ === true, null, { timeout: 20_000 });
  await page.evaluate(() => {
    window.__PIXIEEDRAW_SHOULD_SHOW_ADS__ = () => false;
    window.__PIXIEED_ADS_DISABLED__ = true;
  });
  await openLocalProjects();
  await page.waitForFunction(
    () => document.querySelectorAll('#startupWorkspaceProjectList .startup-workspace__project').length >= 60
      || document.querySelector('#startupWorkspaceProjectList button[data-workspace-project-more]'),
    null,
    { timeout: 20_000 }
  );

  const initialCardCount = await readCardCount();
  assert.equal(initialCardCount, 60, 'the chooser must render only the initial bounded card window');
  assert.equal(
    await page.locator('#startupWorkspaceProjectList button[data-workspace-project-more]').count(),
    1,
    'the chooser must expose an explicit control for older project cards'
  );

  await page.locator('#startupWorkspaceProjectList button[data-workspace-project-more]').click();
  const secondCardCount = await readCardCount();
  assert.equal(secondCardCount, 120, 'load-more must add one bounded card batch');

  await page.locator('#startupWorkspaceProjectList button[data-workspace-project-more]').click();
  const finalCardCount = await readCardCount();
  assert.equal(finalCardCount, bulkCount, 'all seeded projects must remain reachable without loading them at startup');
  assert.equal(
    await page.locator('#startupWorkspaceProjectList button[data-workspace-project-more]').count(),
    0,
    'the load-more control must disappear after all seeded cards are rendered'
  );
  assert.deepEqual(pageErrors, [], 'bounded project-list rendering must not emit page errors');
  console.log(JSON.stringify({
    status: 'PASS',
    targetUrl,
    seededProjectCount: bulkCount,
    initialCardCount,
    secondCardCount,
    finalCardCount,
    pageErrors,
  }, null, 2));
  console.log('PiXiEEDraw project-list window runtime checks passed');
} finally {
  await page.evaluate(async ({ databaseName: dbName, storeName: recentStore, ids }) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);
    if (!database) return;
    await new Promise(resolve => {
      const transaction = database.transaction([recentStore], 'readwrite');
      const store = transaction.objectStore(recentStore);
      ids.forEach(id => store.delete(id));
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
      transaction.onabort = resolve;
    });
    database.close();
  }, { databaseName, storeName, ids: bulkIds }).catch(() => {});
  await context.close();
  await browser.close();
}
