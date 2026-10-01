import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local test origin required');
const { chromium, webkit } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href);
const output = '/tmp/pixieed-animation-checks'; await mkdir(output, { recursive: true });
let checks = 0;
for (const [name, engine] of (process.env.PIXIEED_BROWSER_ENGINES === 'chromium' ? [['chromium', chromium]] : [['chromium', chromium], ['webkit', webkit]])) {
  const browser = await engine.launch({ headless: true, ...(name === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      const context = await browser.newContext({ viewport, acceptDownloads: true }), page = await context.newPage(), errors = [];
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
      await page.goto(base + '/draw/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#draw-animation-controls .animation-controls');
      await page.waitForTimeout(150);
      const panel = () => page.locator('#draw-animation-controls-panel');
      const openPanel = async () => { if (!(await panel().isVisible())) await page.locator('[data-action="toggle-frames"]').click(); };
      const frame = () => page.locator('#draw-animation-controls-panel [data-action="select-frame"]');
      const pixels = () => page.locator('#draw-canvas').evaluate((c) => Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data));
      const tap = async (x, y) => { if (await panel().isVisible()) await page.locator('[data-action="close-animation"]').click(); const r = await page.locator('#draw-canvas').boundingBox(); await page.mouse.click(r.x + (x + .5) * r.width / 16, r.y + (y + .5) * r.height / 16); };
      await tap(4, 4); const initial = await pixels(); assert.equal(initial[(4 * 16 + 4) * 4 + 3], 255);
      await openPanel(); await page.locator('[data-action="add-frame"]').click(); assert.equal(await frame().count(), 2);
      await tap(5, 4); assert.equal((await pixels())[(4 * 16 + 5) * 4 + 3], 255);
      await openPanel(); await frame().nth(0).click(); assert.deepEqual(await pixels(), initial);
      await frame().nth(1).click(); await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), initial);
      await page.locator('#draw-redo').click(); assert.equal((await pixels())[(4 * 16 + 5) * 4 + 3], 255);
      await openPanel(); await page.locator('[data-action="toggle-layers"]').click(); await page.locator('[data-action="add-layer"]').click();
      await page.locator('[data-action="close-layers"]').click();
      await tap(6, 4); assert.equal((await pixels())[(4 * 16 + 4) * 4 + 3], 255); assert.equal((await pixels())[(4 * 16 + 6) * 4 + 3], 255);
      await openPanel(); await page.locator('[data-action="toggle-layers"]').click();
      const lock = page.locator('[data-action="lock"]').first(); await lock.click();
      await page.locator('[data-action="close-layers"]').click(); const beforeLock = await pixels(); await tap(7, 4); assert.deepEqual(await pixels(), beforeLock);
      await openPanel(); await page.locator('[data-action="toggle-layers"]').click(); await page.locator('[data-action="lock"]').first().click(); await page.locator('[data-action="close-layers"]').click();
      await page.locator('[data-action="play"]').click(); await page.waitForTimeout(250); await page.locator('[data-action="play"]').click();
      const layout = await page.evaluate(() => { const r = document.querySelector('#draw-canvas').getBoundingClientRect(), nav = document.querySelector('.app-tabs').getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1, canvas: { width: r.width, height: r.height, top: r.top, bottom: r.bottom }, navTop: nav.top }; });
      assert.equal(layout.overflow, false, JSON.stringify(layout)); assert.ok(layout.canvas.height > 70 && layout.canvas.bottom < layout.navTop, JSON.stringify(layout));
      await page.screenshot({ path: `${output}/${name}-${viewport.width}x${viewport.height}.png` });
      await page.locator('#draw-save').click(); await page.waitForFunction(() => new URLSearchParams(location.search).has('pxd'));
      const savedUrl = page.url();
      // A normal entry intentionally starts blank. An explicit saved-revision URL restores a project.
      await page.evaluate(() => history.replaceState({}, '', location.href));
      await page.reload({ waitUntil: 'domcontentloaded' });
      try { await page.waitForFunction(() => document.querySelectorAll('#draw-animation-controls-panel [data-action="select-frame"]').length === 2); }
      catch (error) { console.log('Reload diagnostics', await page.locator('#draw-status').textContent(), errors, await frame().count()); throw error; }
      assert.equal(await panel().isVisible(), false, 'saved projects also open with details collapsed');
      assert.equal(await page.locator('[data-action="toggle-layers"]').count(), 1); await openPanel(); await page.locator('[data-action="toggle-layers"]').click(); assert.equal(await page.locator('.animation-controls__layer-list [data-action="select-layer"]').count(), 2); await page.locator('[data-action="close-layers"]').click();
      assert.equal(page.url(), savedUrl); assert.deepEqual(errors, []);
      console.log(`PASS ${name} ${viewport.width}x${viewport.height}: strokes, independent frames, undo/redo, layers/lock, playback, reload, viewport`); checks++; await context.close();
    }
  } finally { await browser.close(); }
}
console.log(`BROWSER PASS ${checks} scenarios; artifacts ${output}`);
