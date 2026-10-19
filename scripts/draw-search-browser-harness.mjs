#!/usr/bin/env node
/** Static/JS Draw guidance and real PNG/GIF output, using only isolated local data. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createAnimation, addAnimationFrame, writeAnimationCel } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4198';
const origin = new URL(base).origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const out = process.env.PIXIEED_DRAW_SEARCH_OUTPUT || '/tmp/pixieed-draw-search';
await mkdir(out, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const sharp = createRequire(import.meta.url)(process.env.PIXIEED_SHARP_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const report = { browser: browser.version(), cases: [], failures: [], externalAttempts: [], mediaRequests: 0, limitations: ['Headless Chromium, synthetic projects, isolated storage. Physical Safari/iOS, OS sharing and search rankings are untested.'] };
const html = await readFile(new URL('../draw/index.html', import.meta.url), 'utf8');
const expectedTitle = html.match(/<title>([^<]+)<\/title>/)[1];
const expectedH1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/)[1];
async function context(options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true, ...options });
  await ctx.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    if (!['blob:', 'data:'].includes(url.protocol)) report.externalAttempts.push({ url: url.origin + url.pathname, method: request.method() });
    return route.abort();
  });
  await ctx.addInitScript(() => {
    window.__drawSearchMediaRequests = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { window.__drawSearchMediaRequests++; throw new DOMException('Synthetic denial', 'NotAllowedError'); }, enumerateDevices: async () => [], addEventListener() {}, removeEventListener() {} } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'denied', addEventListener() {}, removeEventListener() {} }) } });
  });
  return ctx;
}
async function run(name, fn) {
  try { report.cases.push({ name, passed: true, ...(await fn()) }); console.log(`PASS ${name}`); }
  catch (error) { report.failures.push({ name, message: error.message, stack: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
const ready = page => page.waitForFunction(() => !!window.__PIXIEED_CREATION_HOST__?.runtime && !document.querySelector('#main')?.inert);
const pixels = page => page.locator('#draw-canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]);
try {
  for (const js of [false, true]) for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await run(`initial HTML / JS ${js} ${viewport.width}`, async () => {
      const ctx = await context({ javaScriptEnabled: js, viewport });
      try {
        const page = await ctx.newPage(), errors = [], requests = [];
        page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(new URL(request.url()).pathname));
        await page.goto(base + '/draw/', { waitUntil: 'networkidle' });
        assert.equal(await page.title(), expectedTitle); assert.equal(await page.locator('h1').innerText(), expectedH1);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://pixieed.jp/draw/');
        assert.equal(await page.locator('[data-embed-start]').isVisible(), true);
        const startBox = await page.locator('[data-embed-start]').boundingBox();
        assert.ok(startBox.y >= 0 && startBox.y + startBox.height <= viewport.height, 'start remains in the first viewport');
        assert.equal(requests.some(path => /\/creation\/(?:draw-page|creation-runtime)|\/pixel-lens\/app/.test(path)), false, 'description does not load the heavy runtime');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        assert.equal(overflow, false);
        const anchors = await page.locator('a[href^="#"]').evaluateAll(nodes => nodes.map(n => ({ href: n.getAttribute('href'), found: !!document.getElementById(n.getAttribute('href').slice(1)) })));
        assert.ok(anchors.every(a => a.found), JSON.stringify(anchors));
        for (const path of ['/camera/', '/audio/', '/output/']) {
          assert.ok(await page.locator(`a[href="${path}"]`).count());
          assert.equal((await ctx.request.get(base + path)).status(), 200);
        }
        await page.screenshot({ path: `${out}/description-${viewport.width}-${js ? 'js' : 'html'}.png`, fullPage: true });
        if (js) {
          await page.addStyleTag({ content: 'body { font-size: 200% !important; }' });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, '200% base text stays in viewport');
          await page.screenshot({ path: `${out}/description-${viewport.width}-text200.png`, fullPage: true });
        }
        assert.deepEqual(errors, []);
        return { title: expectedTitle, heavyRuntimeLoaded: false, overflow: false, errors };
      } finally { await ctx.close(); }
    });
  }
  let animation = createAnimation({ width: 16, height: 16, palette: ['#e75445', '#4c82c3'] });
  for (let frame = 0; frame < 2; frame++) {
    if (frame) animation = addAnimationFrame(animation, { copy: false, durationMs: 160 });
    const cells = Array.from({ length: 256 }, (_, i) => { const x = i % 16, y = i >> 4; return x >= 2 + frame * 5 && x < 6 + frame * 5 && y >= 5 && y < 10 ? frame + 1 : 0; });
    animation = writeAnimationCel(animation, animation.frames[frame].id, animation.layers[0].id, { width: 16, height: 16, pixels: cells });
  }
  const fixture = `${out}/synthetic-motion.pxd`;
  await writeFile(fixture, await encodePxd(await writePxdAnimation(createPxdProject({ manifest: { title: 'Synthetic two-frame motion' } }), animation)));
  await run('real local save / reload / native PNG / native GIF', async () => {
    const ctx = await context();
    try {
      const page = await ctx.newPage(), errors = []; page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/draw/'); await page.locator('[data-embed-start]').click(); await ready(page);
      await page.locator('#pxd-file-input').setInputFiles(fixture);
      await page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.draw.getTimeline().width === 16 && window.__PIXIEED_CREATION_HOST__.runtime.draw.getTimeline().frames.length === 2 && !document.querySelector('#main').inert);
      if (await page.locator('#pxd-panel').evaluate(n => n.open)) await page.locator('#project-close').click();
      const before = await pixels(page), beforeState = await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState());
      await page.locator('[data-shell-explanation]').click(); await page.locator('[data-embed-start]').click(); await ready(page);
      assert.deepEqual(await pixels(page), before, 'description round trip preserves exact pixels');
      await page.locator('#pxd-save').evaluate(n => n.click());
      await page.waitForFunction(() => document.querySelector('.project-bar__open')?.dataset.state === 'saved');
      await page.reload(); await ready(page);
      assert.deepEqual(await pixels(page), before, 'reload restores saved pixels');
      assert.equal((await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState())).timeline.hash, beforeState.timeline.hash);
      const [pngFile] = await Promise.all([page.waitForEvent('download'), page.locator('#creation-output-open').click()]); const pngPath = `${out}/synthetic-drawing.png`; await pngFile.saveAs(pngPath);
      const pngBytes = await readFile(pngPath), pngMeta = await sharp(pngBytes).metadata();
      assert.equal(pngMeta.format, 'png'); assert.equal(pngMeta.width, pngMeta.height); assert.equal(pngMeta.width % 16, 0);
      const pngRgba = await sharp(pngBytes).resize(16, 16, { kernel: 'nearest' }).ensureAlpha().raw().toBuffer();
      assert.deepEqual([...pngRgba], before, 'native PNG preserves every source cell at its integer scale');
      await page.locator('.px-tool-result__return').click(); await ready(page); assert.deepEqual(await pixels(page), before);
      await page.locator('[data-desktop-cell-launcher]').click();
      await page.screenshot({ path: `${out}/gif-controls-pc.png` });
      const gifControl = await page.locator('[data-action="export-gif"]').evaluateAll(ns => ns.map(n => ({ hidden: n.hidden, disabled: n.disabled, box: n.getBoundingClientRect().toJSON(), parent: n.parentElement.className })));
      assert.equal(gifControl.length, 1); assert.ok(gifControl[0].box.width >= 44 && gifControl[0].box.height >= 44);
      const [gifFile] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-gif"]').click()]); const gifPath = `${out}/synthetic-animation.gif`; await gifFile.saveAs(gifPath);
      const gifBytes = await readFile(gifPath), gifMeta = await sharp(gifBytes, { animated: true }).metadata();
      assert.equal(gifMeta.format, 'gif'); assert.equal(gifMeta.pages, 2); assert.equal(gifBytes.subarray(0, 6).toString(), 'GIF89a');
      const frames = [];
      for (let i = 0; i < 2; i++) {
        const frame = await sharp(gifBytes, { page: i, pages: 1 }).resize(16, 16, { kernel: 'nearest' }).ensureAlpha().raw().toBuffer();
        const colors = new Set(); for (let p = 0; p < frame.length; p += 4) colors.add([...frame.subarray(p, p + 4)].join(','));
        frames.push({ colors: [...colors], delayMs: gifMeta.delay[i] });
      }
      assert.ok(frames[0].colors.includes('231,84,69,255')); assert.ok(frames[1].colors.includes('76,130,195,255'));
      assert.equal(new URL(page.url()).pathname, '/draw/', 'native export retains the workspace');
      assert.deepEqual(await pixels(page), before);
      const compactGif = [];
      for (const width of [320, 390]) {
        await page.locator('[data-action="close-animation"]').click();
        await page.setViewportSize({ width, height: 844 });
        await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
        const target = page.locator('[data-action="export-gif"]');
        const reachable = await target.evaluate(n => { const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.width >= 44 && r.height >= 44 && r.x >= 0 && r.right <= innerWidth && (hit === n || n.contains(hit)); });
        assert.equal(reachable, true, `GIF is reachable at ${width}px`);
        const [download] = await Promise.all([page.waitForEvent('download'), target.click()]);
        compactGif.push({ width, filename: download.suggestedFilename(), reachable });
        assert.deepEqual(await pixels(page), before);
        await page.screenshot({ path: `${out}/gif-controls-${width}.png` });
      }
      await page.locator('[data-action="close-animation"]').click(); await page.setViewportSize({ width: 1440, height: 900 });
      const png = { type: 'image/png', width: pngMeta.width, height: pngMeta.height, sourceCellsExact: true };
      const gif = { type: 'image/gif', width: gifMeta.width, height: gifMeta.pageHeight, bytes: gifBytes.length, frames };
      report.mediaRequests += await page.evaluate(() => window.__drawSearchMediaRequests); assert.deepEqual(errors, []);
      await page.screenshot({ path: `${out}/draw-motion-pc.png`, fullPage: false });
      return { png, gif, compactGif, saveReload: true, exportRetainsWorkspace: true, errors };
    } finally { await ctx.close(); }
  });
  assert.deepEqual(report.externalAttempts, []); assert.equal(report.mediaRequests, 0);
} finally {
  await browser.close(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
}
if (report.failures.length) process.exitCode = 1;
