import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';
const seededProjectCount = 500;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const probe = {
      openCursor: 0,
      get: 0,
      put: 0,
      delete: 0,
      metadataGet: 0,
      metadataPut: 0,
      metadataDelete: 0,
    };
    const objectStore = IDBObjectStore.prototype;
    const originalOpenCursor = objectStore.openCursor;
    const originalGet = objectStore.get;
    const originalPut = objectStore.put;
    const originalDelete = objectStore.delete;
    objectStore.openCursor = function (...args) {
      if (this.name === 'recentProjects') probe.openCursor += 1;
      return originalOpenCursor.apply(this, args);
    };
    objectStore.get = function (...args) {
      if (this.name === 'recentProjects') probe.get += 1;
      if (this.name === 'handles' && String(args[0] || '').startsWith('recentProjectMetadata:v1:')) {
        probe.metadataGet += 1;
      }
      return originalGet.apply(this, args);
    };
    objectStore.put = function (...args) {
      if (this.name === 'recentProjects') probe.put += 1;
      if (this.name === 'handles' && String(args[1] || '').startsWith('recentProjectMetadata:v1:')) {
        probe.metadataPut += 1;
      }
      return originalPut.apply(this, args);
    };
    objectStore.delete = function (...args) {
      if (this.name === 'recentProjects') probe.delete += 1;
      if (this.name === 'handles' && String(args[0] || '').startsWith('recentProjectMetadata:v1:')) {
        probe.metadataDelete += 1;
      }
      return originalDelete.apply(this, args);
    };
    window.__pixieedRecentAutosaveProbe = probe;
  });
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort(),
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(2_500);
  const notice = page.locator('#pixisyncResumeNoticeDialog[open]');
  if (await notice.count()) {
    await page.locator('#pixisyncResumeNoticeClose').click({ timeout: 5_000 });
  }

  await page.evaluate(async (count) => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieedraw-autosave');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(['recentProjects'], 'readwrite');
      const store = transaction.objectStore('recentProjects');
      for (let index = 0; index < count; index += 1) {
        const id = `probe-existing-${String(index).padStart(4, '0')}`;
        store.put({
          id,
          accountUserId: '',
          name: id,
          fileName: `${id}.pxd`,
          updatedAt: new Date(Date.now() - index).toISOString(),
          autosaveSchemaVersion: 2,
          manifestKey: `manifest-${id}`,
        }, id);
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, seededProjectCount);
  await page.evaluate(() => {
    Object.assign(window.__pixieedRecentAutosaveProbe, {
      openCursor: 0,
      get: 0,
      put: 0,
      delete: 0,
      metadataGet: 0,
      metadataPut: 0,
      metadataDelete: 0,
    });
  });

  await page.locator('#startupActionNew').click({ timeout: 5_000 });
  await page.waitForSelector('#newProjectDialog[open]', { timeout: 5_000 });
  await page.fill('#newProjectName', 'probe-direct-recent-save');
  await page.locator('#confirmNewProject').click({ timeout: 5_000 });
  await page.waitForFunction(
    () => !document.getElementById('newProjectDialog')?.open,
    null,
    { timeout: 15_000 },
  );
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 },
  );
  await page.evaluate(() => {
    Object.assign(window.__pixieedRecentAutosaveProbe, {
      openCursor: 0,
      get: 0,
      put: 0,
      delete: 0,
      metadataGet: 0,
      metadataPut: 0,
      metadataDelete: 0,
    });
  });

  const canvas = await page.locator('#drawingCanvas').boundingBox();
  assert.ok(canvas && canvas.width > 0 && canvas.height > 0, 'drawing canvas must be visible');
  await page.mouse.click(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.5);
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(1_500);

  const result = await page.evaluate(() => ({
    ...window.__pixieedRecentAutosaveProbe,
    session: window.__pixieedrawGetActiveProjectSession?.() || null,
  }));
  assert.equal(result.openCursor, 0, 'autosave must not scan all recent-project rows');
  assert.equal(result.get, 0, 'autosave must not read the target recent payload row');
  assert.ok(result.put >= 1, 'autosave must update the target recent-project row');
  assert.ok(result.metadataGet >= 1, 'autosave must read target metadata by sidecar key');
  assert.ok(result.metadataPut >= 1, 'autosave must update target metadata by sidecar key');
  assert.equal(result.session?.dirty, false, 'target Project must finish autosaved');
  assert.deepEqual(pageErrors, [], 'target Project autosave must not emit page errors');

  console.log(JSON.stringify({
    status: 'PASS',
    targetUrl,
    seededProjectCount,
    recentProjectReads: {
      openCursor: result.openCursor,
      get: result.get,
      put: result.put,
      delete: result.delete,
    },
    recentProjectMetadataReads: {
      get: result.metadataGet,
      put: result.metadataPut,
      delete: result.metadataDelete,
    },
    projectId: result.session?.projectId || '',
    dirty: result.session?.dirty ?? null,
    pageErrors,
  }, null, 2));
} finally {
  await browser.close();
}
