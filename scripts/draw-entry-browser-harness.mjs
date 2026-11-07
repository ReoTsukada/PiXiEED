#!/usr/bin/env node
/** First-use checks against a local build. All storage is isolated; external traffic is blocked. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4198';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
// Exercise canonical-origin URL guards while serving every byte from localhost.
const origin = 'https://pixieed.jp';
const out = process.env.PIXIEED_DRAW_ENTRY_OUTPUT || '/tmp/pixieed-draw-entry-browser';
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}) });
const report = { browser: browser.version(), cases: [], failures: [], limitations: [
  'Chromium mobile viewport and touch emulation; physical mobile/Safari/OS sharing and OS download cancellation untested.',
  'Storage failure is an injected local IndexedDB write error, not a real full disk. Download proves browser file delivery, not a user-chosen folder.',
  'Only local GET/HEAD requests are sent. Production ads, analytics, search rankings and publication are untested.'
] };
const ready = page => page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime && !document.querySelector('#main')?.inert);
const state = page => page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState());
async function context(options = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, ...options });
  await ctx.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) return route.abort();
    try {
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch (error) {
      // Closing a context can dispose a harmless in-flight home-page fetch.
      if (!/disposed|closed/i.test(error.message)) throw error;
    }
  });
  await ctx.addInitScript(() => {
    localStorage.setItem('pixieedraw-autosave', 'old-draw-sentinel');
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (window.__drawEntryFailSave && this.transaction.db.name === 'pixieed-pxd-v1') {
        throw new DOMException('Synthetic local storage failure', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  return ctx;
}
async function run(name, fn) {
  try { report.cases.push({ name, passed: true, ...await fn() }); console.log('PASS', name); }
  catch (error) { report.failures.push({ name, error: error.stack }); console.error('FAIL', name, error.message); }
}
async function filePanel(page) {
  await page.locator('#creation-file-open').click();
  await page.locator('#project-tab-current').click();
  await page.locator('#pxd-panel .project-more > summary').click();
}
try {
  for (const width of [320, 390, 1280]) await run(`first draw / save / return / retry ${width}`, async () => {
    const touch = width < 600;
    const ctx = await context({ viewport: { width, height: 844 }, hasTouch: touch, isMobile: touch });
    try {
      const page = await ctx.newPage(); page.setDefaultTimeout(15000);
      const errors = [], downloads = []; page.on('pageerror', e => errors.push(e.message)); page.on('download', d => downloads.push(d));
      await page.goto(origin + '/draw/');
      await page.locator('[data-embed-start]').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      const start = await page.locator('[data-embed-start]').boundingBox();
      assert.ok(start.y >= 0 && start.y + start.height <= 844, 'CTA visible without scrolling');
      assert.equal(await page.locator('.draw-hero-example img').evaluate(n => n.complete && n.naturalWidth > 0), true);
      await page.screenshot({ path: `${out}/landing-${width}.png` });
      if (touch) await page.locator('[data-embed-start]').tap(); else await page.locator('[data-embed-start]').click();
      await ready(page);
      assert.equal(new URL(page.url()).pathname, '/tools/start/draw/');
      const initial = await state(page);
      const paint = async (x, y) => {
        const box = await page.locator('#draw-canvas').boundingBox();
        const point = { x: box.x + box.width * x / 16, y: box.y + box.height * y / 16 };
        if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
      };
      await paint(3.5, 4.5);
      const edited = await state(page); assert.notEqual(edited.image.hash, initial.image.hash);
      await filePanel(page); await page.locator('#pxd-save').click();
      await page.waitForFunction(() => document.querySelector('#project-open')?.dataset.state === 'saved');
      await page.locator('#project-close').click();
      await page.locator('[data-shell-explanation]').click();
      assert.equal(await page.locator('[data-embed-start]').innerText(), '作業に戻る');
      await page.locator('[data-embed-start]').click(); await ready(page);
      assert.deepEqual(await state(page), edited);
      await page.reload(); await ready(page); assert.deepEqual((await state(page)).image, edited.image);
      await page.locator('#creation-output-open').click(); await page.waitForURL(url => url.pathname === '/output/work/');
      await page.locator('#output-nav-export').waitFor({ state: 'visible' });
      assert.equal(downloads.length, 0, 'preview arrival does not automatically download');
      // Leave the preview before saving, then repeat the operation.
      await page.locator('[data-sc-back]').click(); await ready(page);
      assert.deepEqual((await state(page)).image, edited.image);
      await page.locator('#creation-output-open').click(); await page.waitForURL(url => url.pathname === '/output/work/');
      const save = page.locator('#output-nav-export');
      await page.waitForFunction(() => !document.querySelector('#output-nav-export')?.disabled);
      assert.match(await save.innerText(), /PNGで保存/);
      const [download] = await Promise.all([page.waitForEvent('download'), touch ? save.tap() : save.click()]);
      const path = `${out}/first-drawing-${width}.png`; await download.saveAs(path);
      assert.equal((await readFile(path)).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      await page.screenshot({ path: `${out}/output-${width}.png` });
      await page.locator('[data-sc-back]').click(); await ready(page);
      assert.deepEqual((await state(page)).image, edited.image);
      await page.goBack(); await page.waitForURL(url => url.pathname === '/output/work/');
      await page.goForward(); await ready(page);
      assert.deepEqual((await state(page)).image, edited.image);
      // Inject only a local project-store failure and follow the documented retry UI.
      await page.evaluate(() => { window.__drawEntryFailSave = true; });
      await paint(7.5, 6.5); const unsaved = await state(page);
      await filePanel(page); await page.locator('#pxd-save').click();
      await page.waitForFunction(() => document.querySelector('#project-open')?.dataset.state === 'error');
      assert.match(await page.locator('#pxd-file-status').innerText(), /保存|Synthetic/);
      assert.deepEqual((await state(page)).image, unsaved.image);
      await page.screenshot({ path: `${out}/save-error-${width}.png` });
      await page.evaluate(() => { window.__drawEntryFailSave = false; });
      await page.locator('#pxd-save').click();
      await page.waitForFunction(() => document.querySelector('#project-open')?.dataset.state === 'saved');
      await page.locator('#project-close').click();
      await page.reload(); await ready(page); assert.deepEqual((await state(page)).image, unsaved.image);
      await page.locator('#creation-file-open').click();
      await page.locator('#pxd-panel .project-imports > summary').click();
      const pending = page.waitForEvent('filechooser'); await page.locator('#pxd-open').click();
      await (await pending).setFiles([]); await page.locator('#project-close').click();
      assert.deepEqual((await state(page)).image, unsaved.image);
      assert.equal(await page.evaluate(() => localStorage.getItem('pixieedraw-autosave')), 'old-draw-sentinel');
      assert.deepEqual(errors, []);
      return { touchEmulation: touch, savedFile: path, saveFailureRetainedPixels: true, errors };
    } finally { await ctx.close(); }
  });
  for (const source of ['/', '/tools/']) await run(`fresh draw entry from ${source}`, async () => {
    const ctx = await context({ viewport: { width: 390, height: 844 }, hasTouch: true });
    try {
      const page = await ctx.newPage();
      await page.goto(origin + source);
      const link = page.locator(source === '/' ? '.portal-draw' : '[data-static-tool="editor"]');
      assert.equal(await link.getAttribute('href'), '/tools/start/draw/');
      await link.tap(); await ready(page);
      assert.equal(new URL(page.url()).pathname, '/tools/start/draw/');
      return { startPath: '/tools/start/draw/', touchEmulation: true };
    } finally { await ctx.close(); }
  });
  await run('legacy routes / canonical / sitemap / protected state', async () => {
    const ctx = await context();
    try {
      const page = await ctx.newPage();
      for (const route of ['/draw/', '/tools/start/draw/', '/PiXiEEDraw/', '/pixiedraw/', '/pixiedraw2/']) {
        const response = await ctx.request.get(base + route), html = await response.text(); assert.equal(response.status(), 200);
        assert.match(html, /rel="canonical" href="https:\/\/pixieed\.jp\/draw\/"/);
        if (route !== '/draw/') assert.match(html, /name="robots" content="noindex,follow"/);
      }
      const sitemap = await (await ctx.request.get(base + '/sitemap.xml')).text();
      assert.equal((sitemap.match(/<loc>https:\/\/pixieed\.jp\/draw\/<\/loc>/g) || []).length, 1);
      assert.doesNotMatch(sitemap, /\/tools\/start\/draw\/|\/pixiedraw[2]?\/|\/PiXiEEDraw\//);
      for (const route of ['/PiXiEEDraw/', '/pixiedraw/', '/pixiedraw2/']) {
        await page.goto(origin + route + '?project=old&ref=a&ref=b#old');
        await page.locator('[data-legacy-entry-status]').filter({ hasText: '元のURLはそのまま' }).waitFor({ state: 'visible' });
        assert.equal(new URL(page.url()).pathname, route, 'unknown old project stays protected');
        assert.match(await page.locator('[data-legacy-entry-status]').innerText(), /元のURLはそのまま/);
        assert.equal(new URL(page.url()).search, '?project=old&ref=a&ref=b');
        assert.equal(await page.evaluate(() => localStorage.getItem('pixieedraw-autosave')), 'old-draw-sentinel');
        await page.goto(origin + route + '?ref=a&ref=b');
        await page.waitForURL(url => url.pathname === '/draw/');
        assert.deepEqual(new URL(page.url()).searchParams.getAll('ref'), ['a', 'b']);
      }
      await page.goto(origin + '/draw/about/?ref=a&ref=b#draw-formats-title');
      await page.waitForURL(url => url.pathname === '/draw/' && url.hash === '#draw-save');
      assert.deepEqual(new URL(page.url()).searchParams.getAll('ref'), ['a', 'b']);
      return { aliases: 3, currentCanonical: '/draw/', noNewIndexedRoutes: true };
    } finally { await ctx.close(); }
  });
} finally {
  await browser.close(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
}
if (report.failures.length) process.exitCode = 1;
