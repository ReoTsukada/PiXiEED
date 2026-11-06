#!/usr/bin/env node
/** Local-only retained-canvas transition regression, including delayed imports. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4262';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const baseline = process.env.PIXIEED_MODE_BASELINE === '1';
const output = process.env.PIXIEED_MODE_MOTION_OUTPUT || '/tmp/pixieed-mode-continuity-after';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { baseline, startedAt: new Date().toISOString(), browser: browser.version(), production: 'not modified', physicalDevices: 'untested', cases: [], failures: [] };
const ready = (page, mode) => page.waitForFunction(mode => document.body.dataset.creationMode === mode && document.documentElement.dataset.creationModesReady === 'true' && !document.body.hasAttribute('data-creation-transition') && !document.querySelector('#main').inert, mode, { timeout: 30000 });
const pixels = page => page.locator('#draw-canvas').evaluate(c => Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data));
async function request(page, mode) {
  if (!await page.locator('#creation-mode-menu').evaluate(n => n.open)) await page.locator('#creation-mode-menu > summary').click();
  await page.locator(`#creation-mode-panel [data-creation-mode="${mode}"]`).click();
}
async function setup(viewport, variant = '') {
  const reduced = variant === 'reduced';
  const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? 'reduce' : 'no-preference', recordVideo: { dir: output + '/videos', size: viewport } });
  let gate = null;
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin && !['blob:', 'data:'].includes(url.protocol)) return route.abort();
    if (gate && url.pathname === gate.path) { const held = gate; gate = null; held.seenResolve(); await held.wait; if (held.fail) return route.abort(); }
    return route.continue();
  });
  await ctx.addInitScript(() => {
    window.__qa = { media: 0, animations: [] };
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { window.__qa.media++; throw new DOMException('Local QA does not use camera', 'NotAllowedError'); } });
    const animate = Element.prototype.animate;
    Element.prototype.animate = function(frames, options) { window.__qa.animations.push({ id: this.id, className: String(this.className), frames, options }); return animate.call(this, frames, options); };
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.setDefaultTimeout(10000);
  await page.goto(base + '/tools/start/draw/?workspace=1', { waitUntil: 'domcontentloaded' }); await ready(page, 'draw');
  const canvas = await page.locator('#draw-canvas').boundingBox();
  await page.mouse.click(canvas.x + canvas.width * .4, canvas.y + canvas.height * .4);
  const original = await pixels(page);
  assert.ok(original.some((n, i) => i % 4 === 3 && n > 0));
  await page.evaluate(() => {
    window.__qa.canvas = document.querySelector('#draw-canvas'); window.__qa.nav = document.querySelector('.app-tabs'); window.__qa.header = document.querySelector('.px-site-header');
    window.__qa.history = history.length; window.__qa.document = document; window.__qa.navigation = performance.getEntriesByType('navigation').length;
  });
  if (variant === 'zoom') { await page.locator('#draw-canvas').focus(); await page.keyboard.press('='); await page.keyboard.press('='); }
  if (variant === 'missing' || variant === 'stalled') await page.evaluate(kind => {
    if (kind === 'missing') Element.prototype.animate = undefined;
    else { const native = Element.prototype.animate; Element.prototype.animate = function(...args) { const a = native.apply(this, args); Object.defineProperty(a, 'finished', { value: new Promise(() => {}) }); return a; }; }
  }, variant);
  return { ctx, page, errors, original, hold(path, fail = false) { let release, seenResolve; const wait = new Promise(r => release = r), seen = new Promise(r => seenResolve = r); gate = { path, fail, wait, seenResolve }; return { release, seen: Promise.race([seen, new Promise((_, reject) => setTimeout(() => reject(new Error('lazy import was not requested: ' + path)), 10000))]) }; } };
}
async function continuity(page) {
  return page.evaluate(() => ({ canvas: window.__qa.canvas === document.querySelector('#draw-canvas'), nav: window.__qa.nav === document.querySelector('.app-tabs'), header: window.__qa.header === document.querySelector('.px-site-header'), document: window.__qa.document === document, history: history.length === window.__qa.history, navigation: performance.getEntriesByType('navigation').length === window.__qa.navigation, media: window.__qa.media }));
}
async function pendingFrame(page, name, viewport) {
  await page.waitForFunction(phase => document.querySelector('#creation-mode-transition')?.dataset.phase === phase, baseline ? 'black' : 'loading');
  const state = await page.evaluate(() => {
    const cue = document.querySelector('#creation-mode-transition'), c = document.querySelector('#draw-canvas'), r = cue.getBoundingClientRect(), s = getComputedStyle(cue);
    return { phase: cue.dataset.phase, background: s.backgroundColor, area: r.width * r.height, text: cue.textContent, pointerEvents: s.pointerEvents, canvasVisible: c.checkVisibility(), canvasOpacity: getComputedStyle(c).opacity, boardOpacity: getComputedStyle(c.closest('.draw-board')).opacity };
  });
  await page.screenshot({ path: output + '/' + name + '-pending.png' });
  if (baseline) { assert.equal(state.background, 'rgb(0, 0, 0)'); assert.ok(state.area >= viewport.width * viewport.height); }
  else { assert.ok(state.area < viewport.width * viewport.height * .06); assert.notEqual(state.background, 'rgb(0, 0, 0)'); assert.equal(state.canvasVisible, true); assert.equal(state.canvasOpacity, '1'); assert.equal(state.boardOpacity, '1'); assert.equal(state.pointerEvents, 'none'); }
  return state;
}
try {
  const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }];
  const cases = viewports.map(viewport => ({ viewport, variant: 'normal' }));
  if (!baseline) cases.push({ viewport: { width: 1280, height: 800 }, variant: 'zoom' });
  if (!baseline) for (const variant of ['reduced', 'missing', 'stalled', 'rapid', 'reduced-midway', 'hidden', 'resize', 'pagehide', 'failed-retry', 'cancel-reveal']) cases.push({ viewport: { width: 390, height: 844 }, variant });
  for (const { viewport, variant } of cases) {
    const { page, ctx, errors, original, hold } = await setup(viewport, variant);
    const row = { name: `${viewport.width}-${variant}`, viewport, variant }; report.cases.push(row);
    try {
      if (!baseline) await page.evaluate(() => {
        window.__qa.samples = []; window.__qa.watch = true;
        const sample = () => {
          if (!window.__qa.watch) return;
          const board = document.querySelector('.draw-board'), canvas = document.querySelector('#draw-canvas'), grid = document.querySelector('.draw-grid');
          if (board?.dataset.creationModeMotion === 'true') {
            const c = canvas.getBoundingClientRect(), g = grid.getBoundingClientRect();
            window.__qa.samples.push({ transform: getComputedStyle(board).transform, gridDelta: Math.max(Math.abs(c.left-g.left),Math.abs(c.top-g.top),Math.abs(c.width-g.width),Math.abs(c.height-g.height)), zoom: canvas.style.transform });
          }
          requestAnimationFrame(sample);
        }; requestAnimationFrame(sample);
      });
      const held = hold('/js/creation/draw-music.mjs', variant === 'failed-retry');
      await request(page, 'audio'); await held.seen;
      try {
        row.pending = await pendingFrame(page, row.name, viewport);
        assert.equal(await page.locator('body').getAttribute('data-creation-mode'), 'draw', 'previous mode remains visible during load');
        if (variant === 'rapid') { await request(page, 'camera'); await request(page, 'draw'); }
        if (variant === 'reduced-midway') await page.emulateMedia({ reducedMotion: 'reduce' });
        if (variant === 'hidden') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        if (variant === 'resize') await page.setViewportSize({ width: 844, height: 390 });
        if (variant === 'pagehide') await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
      } finally { held.release(); }
      if (variant === 'cancel-reveal') { await page.waitForFunction(() => document.querySelector('#creation-mode-transition')?.dataset.phase === 'in'); await request(page, 'draw'); }
      if (variant === 'pagehide') {
        assert.equal(await page.locator('#creation-mode-transition').count(), 0); assert.equal(await page.locator('#main').evaluate(n => n.inert), false);
        row.passed = true; continue;
      }
      const endsDraw = ['rapid', 'failed-retry', 'cancel-reveal'].includes(variant);
      await ready(page, endsDraw ? 'draw' : 'audio');
      if (variant === 'hidden') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
      if (variant === 'failed-retry') { assert.ok(await page.locator('.creation-mode-error').innerText()); await request(page, 'audio'); await ready(page, 'audio'); }
      row.identity = await continuity(page);
      assert.deepEqual(row.identity, { canvas: true, nav: true, header: true, document: true, history: true, navigation: true, media: 0 });
      if (!baseline && ['normal', 'zoom'].includes(variant)) {
        row.frames = await page.evaluate(() => { window.__qa.watch = false; return window.__qa.samples; });
        assert.ok(row.frames.length >= 2, 'visible animation spans several rendered frames');
        assert.ok(row.frames.every(frame => frame.gridDelta < 3), 'grid stays aligned with canvas during FLIP');
        if (variant === 'zoom') assert.ok(row.frames.every(frame => frame.zoom.includes('scale(2.25)')), 'zoom survives motion frames');
        row.animation = await page.evaluate(() => window.__qa.animations.filter(a => a.id === 'creation-mode-transition' || a.className.includes('draw-board')));
        assert.ok(row.animation.some(a => a.id === 'creation-mode-transition' && a.options.duration >= 160));
        assert.ok(row.animation.some(a => a.className.includes('draw-board') && a.options.duration === 280));
      }
      if (variant === 'normal') { await request(page, 'camera'); await ready(page, 'camera'); await page.screenshot({ path: output + '/' + row.name + '-camera.png' }); }
      await request(page, 'draw'); await ready(page, 'draw');
      assert.deepEqual(await pixels(page), original);
      if (variant === 'zoom') assert.ok((await page.locator('#draw-canvas').getAttribute('style')).includes('scale(2.25)'), 'zoom survives round trip');
      assert.equal(await page.locator('#creation-mode-transition').isHidden(), true);
      assert.equal(await page.locator('.draw-board').evaluate(n => getComputedStyle(n).transform), 'none');
      await page.locator('#draw-undo').click(); assert.notDeepEqual(await pixels(page), original); await page.locator('#draw-redo').click(); assert.deepEqual(await pixels(page), original);
      assert.equal(await page.evaluate(() => window.__qa.media), 0); assert.deepEqual(errors, []);
      await page.screenshot({ path: output + '/' + row.name + '-final.png' }); row.passed = true;
    } catch (error) { row.passed = false; row.error = error.stack; report.failures.push({ name: row.name, message: error.message }); await page.screenshot({ path: output + '/' + row.name + '-failure.png' }); }
    finally { row.video = await page.video().path(); await ctx.close(); await writeFile(output + '/report.json', JSON.stringify(report, null, 2)); }
  }
} finally { report.finishedAt = new Date().toISOString(); await writeFile(output + '/report.json', JSON.stringify(report, null, 2)); await browser.close(); }
console.log(JSON.stringify({ cases: report.cases.length, passed: report.cases.filter(c => c.passed).length, failures: report.failures, report: output + '/report.json' }, null, 2));
if (report.failures.length) process.exitCode = 1;
