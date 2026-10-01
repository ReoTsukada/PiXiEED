#!/usr/bin/env node
/** Local fake camera and blocked external traffic; never requests real ads or camera permission. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    await context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        const ctx = canvas.getContext('2d');
        const draw = () => { ctx.fillStyle = '#79aec4'; ctx.fillRect(0, 0, 320, 240); ctx.fillStyle = '#ed7356'; ctx.fillRect(60, 60, 120, 120); };
        draw(); window.setInterval(draw, 80); return canvas.captureStream(15);
      };
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ contentType: 'application/javascript', body: '' });
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/pixel-camera.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#capture')?.dataset.action === 'capture' && !document.querySelector('#capture').disabled);
    assert.equal(await page.locator('[data-tool="pixels"] b').textContent(), '128 px');
    await page.locator('[data-tool="pixels"]').click();
    const choices = await page.locator('#pixelsPanel [data-value]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.value)));
    assert.deepEqual(choices, [16, 32, 64, 96, 128, 160, 256]); checks++;
    const bounds = await page.locator('#pixelsPanel [data-value]').evaluateAll(nodes => nodes.map(n => {
      const r = n.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { width: r.width, height: r.height, fits: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, reachable: hit === n || n.contains(hit) };
    }));
    assert.ok(bounds.every(r => r.width >= 44 && r.height >= 44 && r.fits && r.reachable), JSON.stringify({ viewport, bounds })); checks++;
    assert.equal(await page.locator('#pixelsPanel [data-value="128"]').getAttribute('aria-checked'), 'true');
    await page.locator('#pixelsPanel [data-value="256"]').click();
    await page.waitForFunction(() => document.querySelector('#view')?.width === 256 && document.querySelector('#view')?.height === 256);
    assert.equal(await page.locator('#pixelsPanel [data-value="256"]').getAttribute('aria-checked'), 'true'); checks++;
    await page.locator('[data-tool="aspect"]').click();
    await page.locator('#aspectPanel [data-value="9:16"]').click();
    await page.waitForFunction(() => document.querySelector('#view')?.width === 144 && document.querySelector('#view')?.height === 256);
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.body.dataset.toolResultOpen === 'camera-result');
    await page.waitForFunction(() => document.querySelector('#savePng')?.href.startsWith('blob:'));
    const png = await page.evaluate(async () => {
      const bytes = await (await fetch(document.querySelector('#savePng').href)).arrayBuffer();
      const view = new DataView(bytes); return { width: view.getUint32(16), height: view.getUint32(20) };
    });
    assert.equal(png.height, 2048, 'saved PNG retains the crisp integer enlargement');
    assert.equal(png.width, 1152, 'saved PNG retains the selected aspect ratio'); checks++;
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2), false);
    assert.deepEqual(errors, []); checks++;
    await context.close();
  }
  console.log(`Camera sizes: ${checks}/${checks} PASS; Chromium fake camera only, physical devices and production UNTESTED`);
} finally { await browser.close(); }
