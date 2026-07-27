import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort()
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_000);
  await page.click('#startupActionNew');
  await page.waitForSelector('#newProjectDialog[open]');
  await page.fill('#newProjectName', 'layer-track-runtime');
  await page.click('#confirmNewProject');
  await page.waitForFunction(() => !document.getElementById('newProjectDialog')?.open, null, { timeout: 15_000 });

  await page.evaluate(async () => {
    document.getElementById('addFrame')?.click();
    await new Promise(resolve => setTimeout(resolve, 75));
    document.getElementById('addFrame')?.click();
    await new Promise(resolve => setTimeout(resolve, 75));
    document.getElementById('addLayer')?.click();
  });
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 }
  );

  const persisted = await page.evaluate(async () => {
    const projectId = window.__pixieedrawGetActiveProjectSession?.()?.projectId || '';
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieedraw-autosave-v2-experimental');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (storeName, key) => new Promise((resolve, reject) => {
      const request = database.transaction([storeName], 'readonly').objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    try {
      const current = await read('localProjectCurrentManifests', projectId);
      const manifest = await read('localProjectManifests', current?.manifestKey || '');
      const journal = await read('localProjectJournals', manifest?.project?.journalRef?.key || '');
      const layerAdd = (journal?.ops || []).find(op => op?.kind === 'layer-add');
      return {
        frameCount: document.querySelectorAll('.timeline-cell--frame-header').length,
        layerCount: document.querySelectorAll('.timeline-cell--layer-main').length,
        layerTracks: (layerAdd?.layers || []).map(entry => entry?.layer?.trackId || ''),
      };
    } finally {
      database.close();
    }
  });

  assert.equal(persisted.frameCount, 3, 'the added frames remain visible');
  assert.equal(persisted.layerCount, 2, 'the added layer remains visible');
  assert.equal(persisted.layerTracks.length, 3, 'the layer-add journal records one cell for every frame');
  assert.ok(persisted.layerTracks.every(Boolean), 'every recorded layer cell has a trackId');
  assert.equal(new Set(persisted.layerTracks).size, 1, 'one layer-add operation uses one shared trackId across frames');

  await page.evaluate(async () => {
    document.getElementById('removeLayer')?.click();
    await new Promise(resolve => setTimeout(resolve, 250));
  });
  const afterRemove = await page.evaluate(() => ({
    layers: document.querySelectorAll('.timeline-cell--layer-main').length,
    slots: document.querySelectorAll('.timeline-slot:not(.is-placeholder)').length,
  }));
  assert.equal(afterRemove.layers, 1, 'track deletion removes the selected track once');
  assert.equal(afterRemove.slots, 3, 'track deletion removes its cell from every frame');

  await page.click('#undoAction');
  await page.waitForFunction(
    () => document.querySelectorAll('.timeline-cell--layer-main').length === 2,
    null,
    { timeout: 10_000 }
  );
  const afterUndo = await page.evaluate(() => ({
    layers: document.querySelectorAll('.timeline-cell--layer-main').length,
    slots: document.querySelectorAll('.timeline-slot:not(.is-placeholder)').length,
  }));
  assert.equal(afterUndo.layers, 2, 'undo restores the removed track');
  assert.equal(afterUndo.slots, 6, 'undo restores one original cell in every frame');

  await page.click('#redoAction');
  await page.waitForFunction(
    () => document.querySelectorAll('.timeline-cell--layer-main').length === 1,
    null,
    { timeout: 10_000 }
  );
  await page.click('#undoAction');
  await page.waitForFunction(
    () => document.querySelectorAll('.timeline-cell--layer-main').length === 2,
    null,
    { timeout: 10_000 }
  );
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ persisted, afterRemove, afterUndo }, null, 2));
} finally {
  await browser.close();
}
