#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_PIXEL_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engine === 'webkit' ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs' : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(modulePath).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, acceptDownloads: true });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin || ['blob:', 'data:'].includes(new URL(route.request().url()).protocol) ? route.continue() : route.abort());
  await context.addInitScript(() => {
    const Native = Worker;
    globalThis.Worker = class extends Native {
      postMessage(...args) {
        if (globalThis.__expireNextTimelapse) {
          globalThis.__expireNextTimelapse = false;
          setTimeout(() => {
            localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() - 1 }));
            window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
          }, 0);
        }
        return super.postMessage(...args);
      }
    };
  });
  const page = await context.newPage(); const errors = []; let downloads = 0;
  page.on('pageerror', (error) => errors.push(error.message)); page.on('download', () => downloads++);
  await page.goto(`${origin}/draw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#draw-palette button').length > 0);
  const canvas = page.locator('#draw-canvas'); const box = await canvas.boundingBox();
  for (let n = 1; n < 5; n++) await page.mouse.click(box.x + box.width * n / 6, box.y + box.height / 2);
  const source = await canvas.evaluate((c) => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
  const downloadFrames = async (selector, count) => {
    const event = page.waitForEvent('download'); await page.locator(selector).click();
    const download = await event; const bytes = await readFile(await download.path());
    assert.equal(bytes.toString('ascii', 0, 6), 'GIF89a');
    const frames = [...bytes].filter((v, i) => v === 33 && bytes[i + 1] === 249 && bytes[i + 2] === 4).length;
    assert.equal(frames, count);
  };
  await downloadFrames('#draw-timelapse', 36);
  assert.equal(await page.locator('.px-pass').count(), 0, 'short timelapse is free');
  await page.locator('.draw-timelapse-more summary').click();
  await page.locator('#draw-timelapse-detail').click(); await page.waitForSelector('.px-pass-no');
  await page.locator('.px-pass-no').click(); await page.waitForFunction(() => !document.querySelector('#draw-timelapse-detail').disabled);
  assert.equal(downloads, 1, 'cancellation never exports');
  await page.evaluate(() => {
    localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 3600000 }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
  });
  await downloadFrames('#draw-timelapse-detail', 96);
  const beforeExpiry = downloads;
  await page.evaluate(() => { globalThis.__expireNextTimelapse = true; });
  await downloadFrames('#draw-timelapse-detail', 96);
  await page.waitForFunction(() => !document.querySelector('#draw-timelapse-detail').disabled);
  assert.equal(downloads, beforeExpiry + 1, 'a detail export started with a valid pass finishes after expiry');
  assert.deepEqual(await canvas.evaluate((c) => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]), source, 'expiry retains the artwork');
  await page.locator('#draw-timelapse-detail').click(); await page.waitForSelector('.px-pass-no');
  await page.locator('.px-pass-no').click(); await page.waitForFunction(() => !document.querySelector('#draw-timelapse-detail').disabled);
  assert.equal(downloads, beforeExpiry + 1, 'the next detailed export requires more time');
  await downloadFrames('#draw-timelapse', 36);
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    for (const selector of ['#draw-timelapse', '.draw-timelapse-more summary', '#draw-timelapse-detail']) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      const rect = await page.locator(selector).boundingBox(); assert.ok(rect && rect.width >= 44 && rect.height >= 44, `${selector} below touch size: ${JSON.stringify({ viewport, rect })}`);
      const nav = await page.locator('.app-tabs').boundingBox();
      assert.ok(rect.y >= 0 && rect.y + rect.height <= nav.y, `${selector} is obscured by navigation`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: free/detailed GIF, cancelled upgrade, in-progress export finishes after expiry, next export gated, source retained, 320px/landscape touch controls.`);
} finally { await browser.close(); }
