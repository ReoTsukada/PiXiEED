#!/usr/bin/env node
/** Actual local camera UI + deterministic canvas stream; no real device or remote writes. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const out = process.env.PIXIEED_MINIATURE_ARTIFACTS || '/tmp/pixieed-camera-miniature';
await mkdir(out, { recursive: true });
const baseline = process.env.PIXIEED_MINIATURE_BASELINE_APP
  ? await readFile(process.env.PIXIEED_MINIATURE_BASELINE_APP, 'utf8')
  : execFileSync('git', ['show', `${process.env.PIXIEED_MINIATURE_BASELINE_REF || '92fcb07dd2a56276e3c6cc41882fbd905030595d'}:js/pixel-lens/app.mjs`], { cwd: root, encoding: 'utf8' });
assert.ok(!baseline.includes('createMiniatureProcessor'), 'Supply the pre-change app as the OFF reference');
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path); if (!file.startsWith(root + '/')) throw Error('path');
    res.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium, webkit } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const report = { baselineSha256: createHash('sha256').update(baseline).digest('hex'), camera: 'synthetic canvas stream', remoteTraffic: 'blocked', cases: [], performance: [], skipped: [] };
let checks = 0;
const pass = name => { checks++; console.log('PASS ' + name); };

async function open(browser, viewport, legacy = false) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, deviceScaleFactor: 1 });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (legacy && url.pathname === '/js/pixel-lens/app.mjs') return route.fulfill({ contentType: 'text/javascript', body: baseline });
    return route.continue();
  });
  await context.addInitScript(() => {
    localStorage.setItem('pixieed:camera-gestures:v1', '1');
    window.__cameraRequests = 0; window.__hardwareConstraints = [];
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d'); let scene = 0;
    function paint() {
      ctx.fillStyle = scene ? '#b09674' : '#77a8be'; ctx.fillRect(0, 0, 640, 480);
      // Detail at every height makes the sharp center and blurred outer bands measurable.
      for (let y = 0; y < 480; y += 24) for (let x = 0; x < 640; x += 24) {
        ctx.fillStyle = ((x / 24 + y / 24) & 1) ? '#28475b' : '#ead49e'; ctx.fillRect(x, y, 12, 18);
      }
      ctx.fillStyle = '#e76550'; ctx.fillRect(scene ? 190 : 270, 188, 100, 104);
      ctx.fillStyle = '#f9edc6'; ctx.fillRect(scene ? 204 : 284, 202, 24, 24);
      ctx.fillStyle = '#355943'; ctx.fillRect(0, 456, 640, 24);
    }
    paint(); setInterval(paint, 80);
    window.__changeScene = () => { scene = scene ? 0 : 1; paint(); };
    navigator.mediaDevices.getSupportedConstraints = () => ({});
    navigator.mediaDevices.getUserMedia = async () => {
      window.__cameraRequests++;
      const stream = canvas.captureStream(20), track = stream.getVideoTracks()[0];
      track.getCapabilities = () => ({});
      track.getSettings = () => ({ width: 640, height: 480, facingMode: 'environment' });
      track.applyConstraints = async c => { window.__hardwareConstraints.push(c); };
      return stream;
    };
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/pixel-camera.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Number(document.querySelector('#pixelStudio').dataset.previewFrames) >= 5);
  return { context, page, errors };
}
async function tick(page, miniature) {
  const before = await page.locator('#pixelStudio').getAttribute('data-preview-frames');
  await page.waitForFunction(({ before, miniature }) => {
    const d = document.querySelector('#pixelStudio').dataset;
    return Number(d.previewFrames) > Number(before) + 2 && (miniature === null || d.miniatureFrame === String(miniature));
  }, { before, miniature: miniature ?? null });
}
async function pixels(page) {
  return page.locator('#view').evaluate(n => {
    const bytes = n.getContext('2d').getImageData(0, 0, n.width, n.height).data;
    let hash = 2166136261; for (const b of bytes) hash = Math.imul(hash ^ b, 16777619) >>> 0;
    return { width: n.width, height: n.height, hash };
  });
}
async function tool(page, name) {
  const current = await page.locator('#pixelStudio').getAttribute('data-settings-context');
  if (current === name) return;
  if (current) await page.locator('#toolbarContextBack').click();
  await page.locator(`[data-tool="${name}"]`).click();
}
async function option(page, selector) {
  if (!await page.locator(selector).isVisible()) await page.locator('#toolbarContextMore').click();
  await page.locator(selector).scrollIntoViewIfNeeded(); await page.locator(selector).click();
}
async function configure(page, config) {
  if (config.look) { await tool(page, 'look'); await option(page, `[data-look="${config.look}"]`); }
  if (config.size) { await tool(page, 'pixels'); await option(page, `#pixelsPanel [data-value="${config.size}"]`); }
  if (config.ratio) { await tool(page, 'aspect'); await option(page, `#aspectPanel [data-value="${config.ratio}"]`); }
  if (config.saturation !== undefined) {
    await tool(page, 'tone'); await option(page, '#toneChips [data-value="saturation"]');
    await page.locator('#toneSlider').evaluate((n, v) => { n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); }, String(config.saturation));
  }
  if (config.dither) { await tool(page, 'dither'); await option(page, `#ditherKinds [data-value="${config.dither}"]`); }
  await tick(page);
}
async function miniature(page, on) {
  await tool(page, 'tone'); await option(page, '#toneChips [data-value="miniature"]');
  assert.equal(await page.locator('#miniatureToggle').getAttribute('aria-label'), 'ジオラマ効果');
  assert.ok((await page.locator('#miniaturePanel').textContent()).includes('上下をぼかして、模型のような風景に'));
  if (await page.locator('#miniatureToggle').getAttribute('aria-pressed') !== String(on)) await page.locator('#miniatureToggle').click();
  await tick(page, on);
}
async function pngMatchesPreview(page) {
  return page.evaluate(async () => {
    const c = document.querySelector('#view'), raw = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const url = document.querySelector('#savePng').href, image = new Image(); image.src = url; await image.decode();
    const saved = document.createElement('canvas'); saved.width = image.width; saved.height = image.height;
    const ctx = saved.getContext('2d'); ctx.drawImage(image, 0, 0); const bytes = ctx.getImageData(0, 0, saved.width, saved.height).data;
    const scale = image.width / c.width; let mismatches = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4, p = (Math.floor(y / scale) * c.width + Math.floor(x / scale)) * 4;
      for (let k = 0; k < 4; k++) if (bytes[i + k] !== raw[p + k]) { mismatches++; break; }
    }
    return { width: image.width, height: image.height, scale, mismatches };
  });
}

try {
 for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  if (engineName === 'webkit' && !existsSync(engine.executablePath())) { report.skipped.push({ engine: engineName, reason: 'Existing WebKit binary not installed; no installation performed' }); console.log('SKIP webkit: browser binary unavailable'); continue; }
  const browser = await engine.launch({ headless: true });
  try {
   const configs = [{ size: 128, ratio: '1:1', look: 'photo', saturation: 0 }, { size: 256, ratio: '9:16', look: 'photo', saturation: 38, dither: 'checker' }, { size: 32, ratio: '16:9', look: 'gray', saturation: -40 }, { size: 16, ratio: '1:1', look: 'gb', saturation: 0 }];
   for (const config of configs) {
    const viewport = { width: 390, height: 844 };
    const old = await open(browser, viewport, true); await configure(old.page, config); const reference = await pixels(old.page); assert.deepEqual(old.errors, []); await old.context.close();
    const current = await open(browser, viewport); const p = current.page; await configure(p, config); const off = await pixels(p); assert.deepEqual(off, reference, 'OFF must equal the actual pre-change application'); pass(`${engineName} ${JSON.stringify(config)}: legacy OFF bytes`);
    const filter = await p.evaluate(async () => (await import('/js/pixel-lens/engine.mjs?v=20261002-camera-palette-startup-2')).lensFrameFilter());
    for (let repeat = 0; repeat < 3; repeat++) {
      await miniature(p, true); const on = await pixels(p); assert.equal(on.width, off.width); assert.equal(on.height, off.height);
      const source = await p.locator('#pixelStudio').evaluate(n => ({ width: Number(n.dataset.miniatureSourceWidth), height: Number(n.dataset.miniatureSourceHeight) }));
      assert.ok(source.width > on.width && source.height > on.height && Math.max(source.width, source.height) <= 512, 'blur works on the original crop before dot sampling');
      if (config.size >= 128) assert.notEqual(on.hash, off.hash, 'ON must visibly affect this detailed scene');
      const afterFilter = await p.evaluate(async () => (await import('/js/pixel-lens/engine.mjs?v=20261002-camera-palette-startup-2')).lensFrameFilter()); assert.equal(afterFilter, filter, 'miniature must not add colour corrections');
      if (repeat === 0 && config.size === 128) { await p.screenshot({ path: `${out}/${engineName}-on.png` }); await p.locator('#view').screenshot({ path: `${out}/${engineName}-processed-on.png` }); }
      await miniature(p, false); assert.deepEqual(await pixels(p), off, 'OFF restores the exact previous output');
    }
    pass(`${engineName} ${config.size}: repeated switches, dimensions, tone filter unchanged`);
    if (config.size === 128) {
      await p.locator('#view').screenshot({ path: `${out}/${engineName}-processed-off.png` });
      await miniature(p, true); const beforeScene = await pixels(p); await p.evaluate(() => window.__changeScene()); await p.waitForFunction(expected => { const c = document.querySelector('#view'); const bytes = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let hash = 2166136261; for (const b of bytes) hash = Math.imul(hash ^ b, 16777619) >>> 0; return hash !== expected; }, beforeScene.hash); assert.notEqual((await pixels(p)).hash, beforeScene.hash); await miniature(p, false); const newOff = await pixels(p); await miniature(p, true); await miniature(p, false); assert.deepEqual(await pixels(p), newOff); pass(`${engineName}: scene replacement uses a fresh source`);
      await miniature(p, true); await option(p, '#toneChips [data-value="saturation"]');
      await p.locator('#toneSlider').evaluate(n => { n.value = '45'; n.dispatchEvent(new Event('input', { bubbles: true })); });
      await p.locator('#toneReset').click(); await tick(p, true); assert.equal(await p.locator('#toneSlider').inputValue(), '0'); assert.equal(await p.locator('#miniatureToggle').getAttribute('aria-pressed'), 'true'); pass(`${engineName}: tone reset stays independent of miniature`);
      await miniature(p, true); await p.locator('#toolbarContextBack').click(); await p.waitForTimeout(650);
      const epoch = Number(await p.locator('#pixelStudio').getAttribute('data-palette-epoch'));
      const box = await p.locator('#view').boundingBox(); await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await p.waitForFunction(before => Number(document.querySelector('#pixelStudio').dataset.paletteEpoch) > before, epoch);
      await tick(p, true); pass(`${engineName}: tap repicks colours with diorama enabled`);
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
      await p.waitForFunction(() => document.querySelector('#pixelStudio').dataset.regionMerge === 'true');
      assert.equal(await p.locator('#pixelStudio').getAttribute('data-miniature'), 'true');
      await p.locator('#regionMergeCancel').click(); await tick(p, true); pass(`${engineName}: long press retains live colour merge with diorama enabled`);
    }
    await miniature(p, true);
    const shown = await pixels(p); await p.locator('#capture').click(); await p.waitForFunction(() => document.querySelector('#savePng').href.startsWith('blob:'));
    assert.deepEqual(await pixels(p), shown, 'capture freezes the frame that was displayed');
    const saved = await pngMatchesPreview(p); assert.equal(saved.mismatches, 0); assert.ok(Number.isInteger(saved.scale)); pass(`${engineName} ${config.size}: every saved PNG pixel matches preview`);
    const localOnly = await p.evaluate(() => ({ requests: window.__cameraRequests, constraints: window.__hardwareConstraints })); assert.equal(localOnly.requests, 1); assert.deepEqual(localOnly.constraints, []); assert.deepEqual(current.errors, []);
    report.cases.push({ engine: engineName, config, legacyOff: reference, saved }); await current.context.close();
   }
   for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const current = await open(browser, viewport), p = current.page; await miniature(p, true);
    const layout = await p.locator('#miniatureToggle').evaluate(n => { const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { width: r.width, height: r.height, fits: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, reachable: hit === n || n.contains(hit), overflow: document.documentElement.scrollWidth > innerWidth }; });
    assert.ok(layout.width >= 44 && layout.height >= 44 && layout.fits && layout.reachable && !layout.overflow, JSON.stringify(layout));
    await p.screenshot({ path: `${out}/${engineName}-${viewport.width}x${viewport.height}-settings.png` });
    await configure(p, { size: 256, ratio: '9:16', saturation: 45 }); await tick(p, true);
    const benchmark = await p.evaluate(async () => {
      const { createMiniatureProcessor } = await import('/js/pixel-lens/miniature.mjs?v=20261005-miniature-1'); const apply = createMiniatureProcessor();
      const d = document.querySelector('#pixelStudio').dataset, c = document.createElement('canvas'); c.width = Number(d.miniatureSourceWidth); c.height = Number(d.miniatureSourceHeight);
      const ctx = c.getContext('2d'); ctx.drawImage(document.querySelector('#video'), 0, 0, c.width, c.height); const image = ctx.getImageData(0, 0, c.width, c.height), times = [];
      for (let i = 0; i < 30; i++) { const start = performance.now(); apply(image, true); if (i > 4) times.push(performance.now() - start); }
      times.sort((a, b) => a - b); return { width: c.width, height: c.height, medianMs: times[Math.floor(times.length / 2)], p95Ms: times[Math.floor(times.length * .95)] };
    });
    const before = await p.locator('#pixelStudio').getAttribute('data-preview-frames'); const start = Date.now(); await tick(p, true); const frames = Number(await p.locator('#pixelStudio').getAttribute('data-preview-frames')) - Number(before);
    report.performance.push({ engine: engineName, viewport, ...benchmark, measuredFrames: frames, elapsedMs: Date.now() - start });
    assert.deepEqual(current.errors, []); pass(`${engineName} ${viewport.width}x${viewport.height}: accessible toggle + 256px live processing`); await current.context.close();
   }
  } finally { await browser.close(); }
 }
 report.checks = checks; report.status = report.skipped.length ? 'passed-with-skips' : 'passed'; await writeFile(`${out}/verification.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ checks, out, performance: report.performance, skipped: report.skipped }));
} finally { await new Promise(r => server.close(r)); }
