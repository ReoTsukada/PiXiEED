#!/usr/bin/env node
/** Local-only browser checks for the ChatGPT-to-Draw pixel-art receive flow. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pixelArtWorker from './worker.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4198';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Browser harness must use the local preview server.');
const origin = 'https://pixieed.jp';
const out = process.env.PIXIEED_MCP_BROWSER_OUTPUT || '/tmp/pixieed-mcp-browser';
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
await mkdir(out, { recursive: true });

const browser = await chromium.launch({ headless: true });
const report = {
  browser: browser.version(), cases: [], failures: [],
  limitations: ['Chromium viewport/touch emulation only; physical devices and Safari are not covered.', 'All page and worker module requests target the local preview server; production is not contacted.']
};
const validArt = {
  title: 'MCP preview 🌱', width: 4, height: 3,
  palette: ['#123456', '#A0B1C2', '#FF0080'],
  rows: ['0.1.', '.22.', '...0']
};
const awaitDraw = page => page.waitForFunction(() => {
  const host = window.__PIXIEED_CREATION_HOST__;
  return host?.runtime?.draw && !document.querySelector('#main')?.inert;
});
const runtimeImage = page => page.evaluate(() => {
  const image = window.__PIXIEED_CREATION_HOST__.runtime.draw.getImage();
  return { width: image.width, height: image.height, rgba: Array.from(image.rgba) };
});
const expectedRgba = art => {
  const hex = color => [1, 3, 5].map(start => Number.parseInt(color.slice(start, start + 2), 16)).concat(255);
  const data = [];
  for (const row of art.rows) for (const symbol of row) {
    if (symbol === '.') data.push(0, 0, 0, 0);
    else data.push(...hex(art.palette['0123456789ABCDEFGHIJKLMNOPQRSTUV'.indexOf(symbol)]));
  }
  return { width: art.width, height: art.height, rgba: data };
};

async function makeContext(options = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, ...options });
  const pxdWrites = [];
  ctx.__mcpPxdWrites = pxdWrites;
  await ctx.exposeBinding('__recordMcpPxdWrite', (_source, projectId) => { pxdWrites.push(projectId); });
  await ctx.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) return route.abort();
    try {
      const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
      await route.fulfill({ response });
    } catch (error) {
      if (!/disposed|closed/i.test(error.message)) throw error;
    }
  });
  await ctx.addInitScript(() => {
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.transaction?.db?.name === 'pixieed-pxd-v1') {
        void window.__recordMcpPxdWrite(args[0]?.projectId ?? null);
        if (window.__mcpPxdFailWrite) throw new DOMException('Synthetic PXD storage failure', 'QuotaExceededError');
      }
      return originalPut.apply(this, args);
    };
  });
  return ctx;
}

async function workerPreview(page, art) {
  const response = await pixelArtWorker.fetch(new Request('https://pixieed.jp/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'prepare_pixel_art', arguments: art } })
  }));
  const rpc = await response.json();
  assert.equal(response.status, 200);
  assert.equal(rpc.error, undefined);
  return rpc.result.structuredContent;
}

async function openWorkerPreview(page, art) {
  const prepared = await workerPreview(page, art);
  assert.equal(prepared.status, 'preview_only');
  assert.equal(prepared.width, art.width);
  assert.equal(prepared.height, art.height);
  await page.goto(prepared.previewUrl);
  await page.locator('#receive-status[data-state="ready"]').waitFor();
  return prepared;
}

async function checkNoOverlap(page) {
  return page.evaluate(() => {
    const selectors = ['.ai-receive__brand', 'main h1', '.ai-receive__lead', '#art-preview', '#art-title', '#art-dimensions', '#receive-status', '#open-draw', '#download-png', '#cancel-import', '#mcp-connection-status', '#mcp-connection ol', '#mcp-endpoint', '#copy-mcp-endpoint', '#art-json', '#load-json', '#art-file', '.ai-receive__privacy'];
    const boxes = selectors.map(selector => {
      const element = document.querySelector(selector);
      const box = element?.getBoundingClientRect();
      return { selector, visible: Boolean(element && !element.hidden && getComputedStyle(element).display !== 'none' && box?.width && box?.height), box: box && { x: box.x, y: box.y, right: box.right, bottom: box.bottom } };
    }).filter(item => item.visible);
    const overlaps = [];
    for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i], b = boxes[j];
      if (a.box.x < b.box.right - 1 && a.box.right > b.box.x + 1 && a.box.y < b.box.bottom - 1 && a.box.bottom > b.box.y + 1) overlaps.push([a.selector, b.selector]);
    }
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overlaps };
  });
}

async function run(name, fn) {
  try {
    report.cases.push({ name, passed: true, ...await fn() });
    console.log('PASS', name);
  } catch (error) {
    report.failures.push({ name, error: error.stack });
    console.error('FAIL', name, error.message);
  }
}

async function saveProjectInWorkspace(page) {
  await page.locator('#creation-file-open').click();
  await page.locator('#project-tab-current').click();
  await page.locator('#pxd-panel .project-more > summary').click();
  await page.locator('#pxd-save').click();
  await page.waitForFunction(() => document.querySelector('#project-open')?.dataset.state === 'saved');
  await page.locator('#project-close').click();
}

try {
  for (const viewport of [{ width: 390, height: 844, isMobile: true, hasTouch: true }, { width: 1280, height: 900 }]) {
    await run(`worker preview, exact RGBA, and responsive layout ${viewport.width}`, async () => {
      const { width, height, isMobile = false, hasTouch = false } = viewport;
      const ctx = await makeContext({ viewport: { width, height }, isMobile, hasTouch });
      try {
        const page = await ctx.newPage();
        const prepared = await openWorkerPreview(page, validArt);
        assert.match(prepared.previewUrl, /^https:\/\/pixieed\.jp\/ai\/#art=[A-Za-z0-9_-]+$/);
        assert.equal(new URL(page.url()).hash, '');
        assert.deepEqual(await page.evaluate(() => {
          const canvas = document.querySelector('#art-preview');
          return { width: canvas.width, height: canvas.height, rgba: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) };
        }), expectedRgba(validArt));
        assert.equal(await page.locator('#mcp-connection-status').count(), 1);
        assert.equal(ctx.__mcpPxdWrites.length, 0, 'preview must not save to PXD');
        const layout = await checkNoOverlap(page);
        assert.ok(layout.scrollWidth <= layout.width + 1, `horizontal overflow: ${JSON.stringify(layout)}`);
        assert.deepEqual(layout.overlaps, [], `overlapping controls: ${JSON.stringify(layout.overlaps)}`);
        const primary = await page.locator('#open-draw').boundingBox();
        assert.ok(primary.height >= 44 && primary.height <= 80, 'primary action must remain a practical touch target');
        await page.screenshot({ path: `${out}/preview-${viewport.width}.png` });
        return { layout, previewOnlyWrites: 0, rgbaPixels: validArt.width * validArt.height };
      } finally { await ctx.close(); }
    });

    await run(`empty receive page responsive layout ${viewport.width}`, async () => {
      const { width, height, isMobile = false, hasTouch = false } = viewport;
      const ctx = await makeContext({ viewport: { width, height }, isMobile, hasTouch });
      try {
        const page = await ctx.newPage();
        await page.goto(`${origin}/ai/`);
        await page.locator('#manual-import').waitFor({ state: 'visible' });
        const layout = await checkNoOverlap(page);
        assert.ok(layout.scrollWidth <= layout.width + 1, `horizontal overflow: ${JSON.stringify(layout)}`);
        assert.deepEqual(layout.overlaps, [], `overlapping controls: ${JSON.stringify(layout.overlaps)}`);
        return { layout, manualImportVisible: true };
      } finally { await ctx.close(); }
    });
  }

  await run('worker data applies once, opens Draw, supports undo/redo, and survives reload', async () => {
    const ctx = await makeContext();
    try {
      const page = await ctx.newPage();
      await openWorkerPreview(page, validArt);
      const box = await page.locator('#open-draw').boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0);
      await page.evaluate(() => { const button = document.querySelector('#open-draw'); button.click(); button.click(); });
      await page.waitForURL(url => url.pathname === '/draw/');
      await awaitDraw(page);
      const savedUrl = page.url();
      const initial = await runtimeImage(page);
      assert.deepEqual(initial, expectedRgba(validArt));
      const projectId = new URL(savedUrl).searchParams.get('pxd');
      for (let attempt = 0; attempt < 100 && !ctx.__mcpPxdWrites.includes(projectId); attempt += 1) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(ctx.__mcpPxdWrites.filter(id => id === projectId).length, 1, 'apply should write exactly one new PXD');

      await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.draw.importImage({ width: 1, height: 1, rgba: new Uint8ClampedArray([9, 8, 7, 255]) }));
      const changed = await runtimeImage(page);
      assert.notDeepEqual(changed, initial);
      await page.locator('#draw-undo').click();
      assert.deepEqual(await runtimeImage(page), initial);
      await page.locator('#draw-redo').click();
      assert.deepEqual(await runtimeImage(page), changed);
      await page.locator('#draw-undo').click();
      assert.deepEqual(await runtimeImage(page), initial);

      await saveProjectInWorkspace(page);
      await page.reload();
      await awaitDraw(page);
      assert.deepEqual(await runtimeImage(page), initial);
      assert.equal(new URL(page.url()).searchParams.get('pxd'), new URL(savedUrl).searchParams.get('pxd'));
      await page.screenshot({ path: `${out}/draw-loaded.png` });
      return { dimensions: [initial.width, initial.height], oneProjectWrite: true, undoRedo: true, reloadMatches: true };
    } finally { await ctx.close(); }
  });

  await run('malformed and oversized fragments are rejected without saving', async () => {
    const ctx = await makeContext();
    try {
      const page = await ctx.newPage();
      for (const token of ['*invalid*', 'A'.repeat(10001)]) {
        await page.goto('about:blank');
        await page.goto(`${origin}/ai/#art=${token}`);
        await page.locator('#receive-status[data-state="error"]').waitFor();
        assert.equal(await page.locator('#open-draw').isDisabled(), true);
      }
      assert.equal(ctx.__mcpPxdWrites.length, 0);
      await page.locator('#art-json').fill(JSON.stringify(validArt));
      await page.locator('#load-json').click();
      await page.locator('#receive-status[data-state="ready"]').waitFor();
      assert.equal(await page.locator('#open-draw').isDisabled(), false);
      return { malformedRejected: true, oversizedRejected: true };
    } finally { await ctx.close(); }
  });

  await run('failed local PXD write keeps the preview and prevents navigation', async () => {
    const ctx = await makeContext();
    try {
      const page = await ctx.newPage();
      await openWorkerPreview(page, validArt);
      await page.evaluate(() => { window.__mcpPxdFailWrite = true; });
      await page.locator('#open-draw').click();
      await page.waitForFunction(() => document.querySelector('#receive-status')?.textContent.includes('保存できませんでした'));
      assert.equal(new URL(page.url()).pathname, '/ai/');
      assert.equal(await page.locator('#open-draw').isDisabled(), false);
      for (let attempt = 0; attempt < 100 && ctx.__mcpPxdWrites.length < 1; attempt += 1) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(ctx.__mcpPxdWrites.length, 1, 'failed apply should attempt one local save');
      assert.deepEqual(await page.evaluate(() => {
        const canvas = document.querySelector('#art-preview');
        return { width: canvas.width, height: canvas.height, rgba: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) };
      }), expectedRgba(validArt));
      return { stayedOnPreview: true, retainedPreview: true, saveAttempts: ctx.__mcpPxdWrites.length };
    } finally { await ctx.close(); }
  });

  await run('title is rendered as text, including HTML-looking input', async () => {
    const ctx = await makeContext();
    try {
      const page = await ctx.newPage();
      await page.goto(`${origin}/ai/`);
      const title = '<img src=x onerror=alert(1)> & sprite';
      await page.locator('#art-json').fill(JSON.stringify({ ...validArt, title }));
      await page.locator('#load-json').click();
      await page.locator('#receive-status[data-state="ready"]').waitFor();
      assert.equal(await page.locator('#art-title').textContent(), title);
      assert.equal(await page.locator('#art-title img').count(), 0);
      return { titleDisplayedLiterally: true, injectedElements: 0 };
    } finally { await ctx.close(); }
  });

  await run('PNG download preserves dimensions and staged preview expires after ten minutes', async () => {
    const ctx = await makeContext({ acceptDownloads: true });
    try {
      const page = await ctx.newPage();
      await openWorkerPreview(page, validArt);
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#download-png').click()]);
      const filePath = `${out}/${download.suggestedFilename()}`;
      await download.saveAs(filePath);
      const png = await readFile(filePath);
      assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(png.readUInt32BE(16), validArt.width);
      assert.equal(png.readUInt32BE(20), validArt.height);

      await page.reload();
      await page.locator('#preview-card').waitFor({ state: 'visible' });
      assert.deepEqual(await page.evaluate(() => {
        const canvas = document.querySelector('#art-preview');
        return { width: canvas.width, height: canvas.height, rgba: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) };
      }), expectedRgba(validArt));
      await page.evaluate(() => {
        const key = 'PiXiEED:ai-draw-stage:v1';
        const value = JSON.parse(sessionStorage.getItem(key));
        value.createdAt = Date.now() - 10 * 60 * 1000 - 1;
        sessionStorage.setItem(key, JSON.stringify(value));
      });
      await page.reload();
      await page.locator('#preview-card').waitFor({ state: 'hidden' });
      assert.match(await page.locator('#receive-status').innerText(), /受取リンクを開く/);
      return { png: filePath, dimensions: [validArt.width, validArt.height], stagedPreviewExpired: true };
    } finally { await ctx.close(); }
  });
} finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
}
if (report.failures.length) process.exitCode = 1;
