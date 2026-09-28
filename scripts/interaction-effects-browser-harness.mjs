#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(BASE).origin;
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error('Localhost test server required');
const pwPath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!pwPath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright installation');
const { chromium, webkit } = await import(pathToFileURL(pwPath).href);
const viewports = [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 844 }];
const effects = ['.px-fx-note', '.px-fx-color', '.px-fx-export', '.px-fx-settle'];
const hour = 60 * 60 * 1000;
let checks = 0;
function pass(label) { checks += 1; console.log(`PASS ${label}`); }

async function localOnly(page) {
  await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
}
async function installCounters(page) {
  await page.addInitScript(() => {
    globalThis.__audioContexts = 0;
    globalThis.__rafActive = new Set(); globalThis.__rafPeak = 0;
    const Native = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (Native) {
      const Wrapped = class extends Native { constructor(...args) { super(...args); globalThis.__audioContexts += 1; } };
      if (globalThis.AudioContext) globalThis.AudioContext = Wrapped; else globalThis.webkitAudioContext = Wrapped;
    }
    const request = window.requestAnimationFrame.bind(window); const cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      let id; id = request((time) => { globalThis.__rafActive.delete(id); callback(time); });
      globalThis.__rafActive.add(id); globalThis.__rafPeak = Math.max(globalThis.__rafPeak, globalThis.__rafActive.size); return id;
    };
    window.cancelAnimationFrame = (id) => { globalThis.__rafActive.delete(id); return cancel(id); };
  });
}
async function inspectLayout(page, viewport, { require44 = true } = {}) {
  const info = await page.evaluate(() => {
    const visible = (el) => {
      if (el.matches('input[type="file"]')) return false;
      if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      if (!el.getClientRects().length || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') return false;
      for (let p = el.parentElement; p; p = p.parentElement) if (p.hidden || (p.tagName === 'DETAILS' && !p.open)) return false;
      const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx >= innerWidth || cy >= innerHeight) return false;
      const hit = document.elementFromPoint(cx, cy);
      if (hit !== el && !el.contains(hit)) return false;
      return true;
    };
    const controls = [...document.querySelectorAll('button,summary,input,select,[role="button"]')].filter(visible).map((el) => {
      const r = el.getBoundingClientRect(); return { el, id: el.id || el.getAttribute('aria-label') || el.className, x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    });
    const overlap = [];
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i], b = controls[j];
      if (a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y) overlap.push({
        first: { id: a.id, x: a.x, y: a.y, right: a.right, bottom: a.bottom },
        second: { id: b.id, x: b.x, y: b.y, right: b.right, bottom: b.bottom }
      });
    }
    return { horizontalOverflow: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0) > innerWidth, controls: controls.map(({ el, ...box }) => box), overlap };
  });
  assert.equal(info.horizontalOverflow, false, `horizontal overflow at ${viewport.width}×${viewport.height}`);
  assert.deepEqual(info.overlap, [], `interactive controls overlap: ${JSON.stringify(info.overlap)}`);
  if (require44) {
    const small = info.controls.filter((control) => control.width < 43.9 || control.height < 43.9);
    assert.deepEqual(small, [], `visible controls below 44px: ${JSON.stringify(small)}`);
  }
  return info;
}
async function effectCounts(page) {
  return page.evaluate((selectors) => Object.fromEntries(selectors.map((selector) => [selector, document.querySelectorAll(selector).length])), effects);
}
async function activeEffects(page) {
  return page.evaluate((selectors) => selectors.flatMap((selector) => [...document.querySelectorAll(`${selector}[data-active="true"]`)].map((el) => `${selector}:${el.dataset.active}`)), effects);
}
async function assertEffectBudget(page) {
  const counts = await effectCounts(page);
  for (const [selector, count] of Object.entries(counts)) assert.ok(count <= (selector === '.px-fx-note' ? 4 : 1), `${selector} pool exceeds its fixed budget: ${count}`);
  assert.equal(await page.locator('.px-fx-layer').evaluateAll((layers) => layers.every((layer) => getComputedStyle(layer).pointerEvents === 'none')), true, 'decorative effect overlays never intercept input');
}
async function assertIdleAnimations(page) {
  const running = await page.evaluate(() => [...document.querySelectorAll('.px-fx-layer *')].flatMap((node) => node.getAnimations().filter((animation) => animation.playState === 'running')).length);
  assert.equal(running, 0, `effect animation remains active while idle: ${running}`);
}
async function waitFx(page, selector) {
  try { await page.waitForFunction((s) => Boolean(document.querySelector(`${s}[data-active="true"]`)), selector, { timeout: 1200 }); }
  catch (error) {
    const state = await page.evaluate((s) => {
      const matches = [...document.querySelectorAll(s)].map((node) => ({ active: node.dataset.active, hidden: node.hidden, phase: node.dataset.phase }));
      const layers = [...document.querySelectorAll('.px-fx-layer')].map((layer) => ({
        host: layer.parentElement?.className,
        children: [...layer.children].map((node) => `${node.className}:${node.dataset.active}`)
      }));
      const drawButton = document.querySelector('#draw-export');
      const rect = drawButton?.getBoundingClientRect();
      return { matches, layers, scroll: { x: scrollX, y: scrollY }, drawButton: rect && { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } };
    }, selector);
    throw new Error(`Effect ${selector} did not activate: ${JSON.stringify(state)}; ${error.message}`);
  }
}
async function canvasPixels(page, selector) {
  return page.locator(selector).evaluate((canvas) => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]);
}
async function verifyDownloadPng(download, expectedWidth, expectedHeight) {
  assert.match(download.suggestedFilename(), /\.png$/i);
  const path = `/tmp/pixieed-effects-${Date.now()}-${Math.random().toString(16).slice(2)}.png`;
  await download.saveAs(path); const bytes = await readFile(path);
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a', 'download is a PNG');
  assert.equal(bytes.readUInt32BE(16), expectedWidth); assert.equal(bytes.readUInt32BE(20), expectedHeight);
  return bytes;
}

async function runEffectBoundaries(browser, engineName) {
  const context = await browser.newContext({ viewport: viewports[0] }); const page = await context.newPage();
  await localOnly(page); await page.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
  const canvas = page.locator('#audio-pixel-canvas'); await canvas.waitFor();
  let noteCell = 0;
  const clickNote = async () => { const box = await canvas.boundingBox(); await page.mouse.click(box.x + box.width * (noteCell++ + .5) / 16, box.y + box.height * 3.5 / 16); };
  await clickNote(); await waitFx(page, '.px-fx-note');
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  assert.deepEqual(await activeEffects(page), [], 'resize immediately clears active effects');
  await clickNote(); await waitFx(page, '.px-fx-note');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.deepEqual(await activeEffects(page), [], 'hidden document immediately clears active effects');
  await page.evaluate(() => { delete document.hidden; document.documentElement.dataset.pixieedMotion = 'reduced'; });
  await clickNote(); await page.waitForTimeout(30);
  assert.deepEqual(await activeEffects(page), [], 'site reduced-motion preference suppresses effects');
  await context.close();

  const reducedContext = await browser.newContext({ viewport: viewports[0], reducedMotion: 'reduce' }); const reducedPage = await reducedContext.newPage();
  await localOnly(reducedPage); await reducedPage.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
  const reducedCanvas = reducedPage.locator('#audio-pixel-canvas'); await reducedCanvas.waitFor(); const reducedBox = await reducedCanvas.boundingBox();
  await reducedPage.mouse.click(reducedBox.x + reducedBox.width * .5 / 16, reducedBox.y + reducedBox.height * 3.5 / 16);
  await reducedPage.waitForTimeout(30);
  assert.deepEqual(await activeEffects(reducedPage), [], 'OS reduced-motion preference suppresses effects');
  await reducedContext.close();
  pass(`${engineName}: resize, hidden document, site and OS reduced-motion clear or suppress effects`);
}

async function runSharedMotionEffects(browser, engineName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  await localOnly(page); await page.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-header-pass] .px-pass-gauge-row');
  await page.evaluate((ms) => {
    localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + ms }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
  }, hour);
  await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.recharged === 'true');
  if (engineName === 'chromium') await page.screenshot({ path: '/tmp/pixieed-effects/audio-gauge-charge.png' });
  const chargedRows = await page.locator('[data-header-pass] .px-pass-gauge-row[data-charged="true"]').count();
  assert.equal(chargedRows, 1, 'first extension charges only the newly filled row');
  const chargeMotion = await page.locator('[data-header-pass] .px-pass-gauge-row[data-charged="true"]').evaluate((row) => getComputedStyle(row, '::after').animationName);
  const depositMotion = await page.locator('[data-header-pass]').evaluate((button) => getComputedStyle(button.querySelector('.px-pass-add'), '::after').animationName);
  assert.equal(chargeMotion, 'px-pass-row-charge'); assert.equal(depositMotion, 'px-pass-deposit');
  const button = page.locator('[data-header-pass]'); const box = await button.boundingBox();
  await page.evaluate(() => document.addEventListener('click', (event) => {
    if (event.target.closest('[data-header-pass]')) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  const pressed = await page.locator('[data-header-pass] .px-pass-add').evaluate((node) => getComputedStyle(node).transform);
  assert.notEqual(pressed, 'none', 'gauge responds to a press while pointer is held');
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.recharged !== 'true', null, { timeout: 1500 });
  assert.equal(await page.locator('[data-header-pass] .px-pass-gauge-row[data-charged="true"]').count(), 0, 'charged row marker clears after the bounded feedback');

  const details = page.locator('#audio-palette-settings'); const summary = details.locator('summary');
  await summary.click();
  await page.waitForFunction(() => Boolean(document.querySelector('#audio-palette-settings .audio-popover-body')?.dataset.pxPanelMotion?.startsWith('reveal-')));
  assert.equal(await details.evaluate((node) => node.open), true, 'native details opens normally with its body revealed');
  const revealAnimation = await details.locator('.audio-popover-body').evaluate((node) => getComputedStyle(node).animationName);
  assert.match(revealAnimation, /^px-panel-reveal-/);
  await summary.click();
  await page.waitForFunction(() => Boolean(document.querySelector('#audio-palette-settings summary')?.dataset.pxPanelMotion?.startsWith('return-')));
  assert.equal(await details.evaluate((node) => node.open), false, 'native details closes and returns focus to its summary');
  const returnAnimation = await summary.evaluate((node) => getComputedStyle(node).animationName);
  assert.match(returnAnimation, /^px-panel-return-/);
  await page.waitForTimeout(240);
  assert.equal(await page.locator('[data-px-panel-motion]').count(), 0, 'panel motion markers clear after their short transition');
  await context.close();

  const reducedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); const reduced = await reducedContext.newPage();
  await localOnly(reduced); await reduced.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
  await reduced.waitForSelector('[data-header-pass] .px-pass-gauge-row');
  await reduced.evaluate((ms) => { localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + ms })); window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' })); }, hour);
  await reduced.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.recharged === 'true');
  await reduced.waitForTimeout(80);
  const reducedAnimationNames = await reduced.locator('[data-header-pass]').evaluate((node) => ({
    row: getComputedStyle(node.querySelector('.px-pass-gauge-row'), '::after').animationName,
    deposit: getComputedStyle(node.querySelector('.px-pass-add'), '::after').animationName,
    running: [node, ...node.querySelectorAll('*')].flatMap((element) => element.getAnimations()).filter((animation) => animation.playState === 'running').map((animation) => ({
      name: animation.animationName, target: animation.effect?.target?.className || animation.effect?.target?.tagName,
      pseudo: animation.effect?.pseudoElement || null, transition: animation.transitionProperty || null
    }))
  }));
  assert.deepEqual(reducedAnimationNames, { row: 'none', deposit: 'none', running: [] }, 'reduced motion disables both new recharge animations');
  const reducedSummary = reduced.locator('#audio-palette-settings summary'); await reducedSummary.click();
  await reduced.waitForTimeout(40);
  assert.equal(await reduced.locator('[data-px-panel-motion]').count(), 0, 'OS reduced motion suppresses panel reveal feedback');
  await reducedContext.close();

  const siteReducedContext = await browser.newContext({ viewport: { width: 390, height: 844 } }); const siteReduced = await siteReducedContext.newPage();
  await localOnly(siteReduced); await siteReduced.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
  await siteReduced.waitForSelector('[data-header-pass] .px-pass-gauge-row');
  await siteReduced.evaluate(() => { document.documentElement.dataset.pixieedMotion = 'reduced'; });
  await siteReduced.evaluate((ms) => { localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + ms })); window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' })); }, hour);
  await siteReduced.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.bank === '1');
  assert.deepEqual(await siteReduced.locator('[data-header-pass]').evaluate((node) => ({
    row: getComputedStyle(node.querySelector('.px-pass-gauge-row'), '::after').animationName,
    deposit: getComputedStyle(node.querySelector('.px-pass-add'), '::after').animationName
  })), { row: 'none', deposit: 'none' });
  await siteReduced.locator('#audio-palette-settings summary').click(); await siteReduced.waitForTimeout(40);
  assert.equal(await siteReduced.locator('[data-px-panel-motion]').count(), 0, 'site reduced motion suppresses panel reveal feedback');
  await siteReducedContext.close();
  pass(`${engineName}: row charge, deposit, press response, details reveal/return and reduced-motion behavior`);
}

async function runHomeGauge(browser, engineName) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  await localOnly(page); await page.goto(new URL('/', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-header-pass] .px-pass-gauge-row'); await inspectLayout(page, { width: 390, height: 844 }, { require44: false });
  const setBank = async (hours) => page.evaluate((duration) => {
    localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + duration }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
  }, hours * hour);
  await setBank(1); await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.bank === '1');
  const one = await page.locator('[data-header-pass]').evaluate((button) => ({
    cells: [...button.querySelectorAll('.px-pass-cell')].filter((cell) => cell.dataset.filled === 'true').length,
    hit: (() => { const r = button.getBoundingClientRect(); const node = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return node === button || button.contains(node); })(),
    overlaps: ['.px-header-brand', '.menu-toggle', '.audio-header-actions', '.lc-top-right'].flatMap((selector) => [...document.querySelectorAll(selector)].filter((other) => {
      if (!other.getClientRects().length) return false;
      const a = button.getBoundingClientRect(), b = other.getBoundingClientRect(); return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }).map((other) => other.className || selector))
  }));
  assert.equal(one.cells, 12); assert.equal(one.hit, true); assert.deepEqual(one.overlaps, [], 'home gauge does not overlap brand/menu');
  await setBank(2); await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.bank === '2');
  const two = await page.locator('[data-header-pass]').evaluate((button) => ({
    label: button.querySelector('[data-header-pass-label]')?.textContent,
    cells: [...button.querySelectorAll('.px-pass-cell')].filter((cell) => cell.dataset.filled === 'true').length,
    hit: (() => { const r = button.getBoundingClientRect(); const node = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return node === button || button.contains(node); })()
  }));
  assert.equal(two.cells, 24); assert.equal(two.hit, true);
  if (engineName === 'chromium') await page.screenshot({ path: '/tmp/pixieed-effects/home-gauge-2h.png' });
  pass(`${engineName} Home 390×844: 1h→2h gauge accumulation, usable center hit target and brand/menu clearance`);
  await context.close();
}

async function runDraw(browser, engine, viewport, engineName) {
  const context = await browser.newContext({ viewport, acceptDownloads: true }); const page = await context.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message)); await localOnly(page); await installCounters(page);
  await page.goto(new URL('/draw/', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#draw-canvas'); await inspectLayout(page, viewport, { require44: false });
  const canvas = '#draw-canvas'; const baseline = await canvasPixels(page, canvas);
  const colors = page.locator('.draw-color:not(.draw-color--transparent)');
  await colors.nth(1).click(); await waitFx(page, '.px-fx-color'); await assertEffectBudget(page);
  assert.deepEqual(await canvasPixels(page, canvas), baseline, 'color selection effects must not edit Draw pixels');
  await page.waitForTimeout(260); assert.deepEqual(await activeEffects(page), []);
  const box = await page.locator(canvas).boundingBox();
  await page.mouse.click(box.x + box.width * 2.5 / 16, box.y + box.height * 3.5 / 16);
  const afterPaint = await canvasPixels(page, canvas);
  await page.waitForTimeout(260); assert.deepEqual(await activeEffects(page), []);
  assert.deepEqual(await canvasPixels(page, canvas), afterPaint, 'decorative effects must not mutate Draw pixels');
  assert.equal(await page.locator('.px-fx-note').count(), 0, 'Draw paint does not use the audio note-audition effect');

  if (viewport.width === 320) {
    const colorCount = await colors.count();
    for (let i = 0; i < 100; i += 1) await colors.nth(i % Math.min(4, colorCount)).click();
    for (let i = 0; i < 100; i += 1) {
      const x = i % 16, y = Math.floor(i / 16) % 16;
      await page.mouse.click(box.x + box.width * (x + .5) / 16, box.y + box.height * (y + .5) / 16);
    }
  } else {
    await colors.nth(0).click();
    await page.mouse.click(box.x + box.width * .5 / 16, box.y + box.height * .5 / 16);
  }
  await assertEffectBudget(page);
  await page.waitForTimeout(260); assert.deepEqual(await activeEffects(page), [], 'rapid interactions settle their effect pool');

  const beforeExport = await canvasPixels(page, canvas);
  const beforeGeometry = await page.evaluate(() => {
    const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; };
    return { scrollX, scrollY, canvas: box(document.querySelector('#draw-canvas')), button: box(document.querySelector('#draw-export')) };
  });
  await page.evaluate(() => {
    window.__effectTrace = { scrolls: [], transitions: [] };
    document.addEventListener('scroll', () => window.__effectTrace.scrolls.push({ at: performance.now(), x: scrollX, y: scrollY }), true);
    new MutationObserver((records) => records.forEach((record) => {
      if (record.attributeName === 'data-active') window.__effectTrace.transitions.push({ at: performance.now(), value: record.target.dataset.active, className: record.target.className });
    })).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['data-active'] });
  });
  const ready = page.waitForEvent('download'); const exportFx = waitFx(page, '.px-fx-export').then(() => true, () => false);
  await page.locator('#draw-export').click();
  const [download, sawFx] = await Promise.all([ready, exportFx]);
  const png = await verifyDownloadPng(download, 2048, 2048); // saved enlarged: each dot is a 128×128 block await assertEffectBudget(page);
  assert.deepEqual(await canvasPixels(page, canvas), beforeExport, 'PNG feedback must not mutate the source canvas');
  const pngUrl = `data:image/png;base64,${png.toString('base64')}`;
  const exportPixels = await page.evaluate(async (url) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const step = img.width / 16; const out = []; for (let row = 0; row < 16; row += 1) for (let col = 0; col < 16; col += 1) out.push(...x.getImageData(col * step + step / 2, row * step + step / 2, 1, 1).data); return out; }, pngUrl);
  assert.deepEqual(exportPixels, beforeExport, 'downloaded PNG retains exact source pixels');
  await page.waitForTimeout(260); assert.deepEqual(await activeEffects(page), []);
  await assertIdleAnimations(page);
  const trace = await page.evaluate(() => ({
    ...window.__effectTrace,
    scrollX, scrollY,
    button: (() => { const r = document.querySelector('#draw-export').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })(),
    canvas: (() => { const r = document.querySelector('#draw-canvas').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()
  }));
  if (!sawFx) {
    const started = trace.transitions.find((item) => item.value === 'true');
    const ended = started && trace.transitions.find((item) => item.value === 'false' && item.at >= started.at);
    const stillVisible = (rect) => rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height;
    if (started && ended && ended.at - started.at <= 300 && trace.scrolls.length === 0) {
      pass(`${engineName} Draw ${viewport.width}×${viewport.height}: export pulse completed within its brief interval before sampling`);
    } else if (!stillVisible(trace.canvas) || !stillVisible(trace.button) || trace.scrolls.length > 0) {
      assert.equal(await page.locator('.px-fx-export[data-active="true"]').count(), 0);
      pass(`${engineName} Draw ${viewport.width}×${viewport.height}: export safely suppressed; PNG remains exact; ${JSON.stringify({ beforeGeometry, trace })}`);
    } else {
      assert.fail(`visible, stationary Draw export did not start its effect: ${JSON.stringify({ beforeGeometry, trace })}`);
    }
  }
  assert.deepEqual(errors, []);
  pass(`${engineName} Draw ${viewport.width}×${viewport.height}: color/export feedback, pixel preservation, 100 rapid interactions, bounded pool`);
  await context.close();
}

async function runAudio(browser, viewport, engineName) {
  const context = await browser.newContext({ viewport, acceptDownloads: true }); const page = await context.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message)); await localOnly(page); await installCounters(page);
  await page.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#audio-tracks button').length === 4);
  await inspectLayout(page, viewport);
  assert.equal(await page.locator('[data-header-pass-label]').evaluate((label) => label.scrollWidth > label.clientWidth), false, 'empty pass action label remains fully visible');
  const canvas = '#audio-pixel-canvas'; const before = await canvasPixels(page, canvas);
  const box = await page.locator(canvas).boundingBox();
  const clickCell = async (x, y) => page.mouse.click(box.x + box.width * (x + .5) / 16, box.y + box.height * (y + .5) / 16);
  for (const [x, y] of [[1, 1], [4, 2], [7, 4], [10, 6]]) await clickCell(x, y);
  await waitFx(page, '.px-fx-note'); await assertEffectBudget(page);
  const fourNotes = await page.locator('.px-fx-note[data-active="true"]').evaluateAll((nodes) => nodes.map((node, index) => {
    node.__harnessId ||= `note-${index}`;
    return { id: node.__harnessId, left: node.style.left, top: node.style.top, phase: node.dataset.phase };
  }));
  assert.equal(fourNotes.length, 4, 'four rapid auditions fill the bounded note pool');
  assert.equal(new Set(fourNotes.map((node) => `${node.left}/${node.top}`)).size, 4, 'note pool flashes four distinct cells');
  if (engineName === 'chromium' && viewport.width === 390) await page.screenshot({ path: '/tmp/pixieed-effects/audio-note-motion.png' });
  const reusedId = fourNotes[0].id; const previousPhase = fourNotes[0].phase;
  await clickCell(13, 8);
  const reusedNotes = await page.locator('.px-fx-note[data-active="true"]').evaluateAll((nodes) => nodes.map((node, index) => {
    node.__harnessId ||= `note-${index}`; return { id: node.__harnessId, phase: node.dataset.phase };
  }));
  assert.ok(reusedNotes.some((node) => node.id === reusedId && node.phase !== previousPhase), 'fifth audition reuses a pool node and alternates its phase');
  const afterPlacement = await canvasPixels(page, canvas);
  const overlappingDownload = page.waitForEvent('download'); const overlappingFx = waitFx(page, '.px-fx-export');
  await page.locator('#audio-export-image').click(); await Promise.all([overlappingDownload, overlappingFx]);
  assert.ok(await page.locator('.px-fx-note[data-active="true"]').count() > 0, 'export thumbnail does not hide active note feedback');
  await page.locator('#audio-tracks button').nth(1).click(); await waitFx(page, '.px-fx-color');
  assert.deepEqual(await canvasPixels(page, canvas), afterPlacement, 'color feedback does not alter audio source pixels');
  assert.ok(await page.locator('.px-fx-note[data-active="true"]').count() > 0, 'color feedback coexists with active note pulses');
  assert.ok(await page.locator('.px-fx-export[data-active="true"]').count() > 0, 'color feedback does not hide the export thumbnail');
  if (engineName === 'chromium' && viewport.width === 390) await page.screenshot({ path: '/tmp/pixieed-effects/audio-color-motion.png' });
  assert.equal(await page.evaluate(() => __audioContexts), 1, 'color audition does not create another AudioContext');
  await page.waitForTimeout(260); assert.deepEqual(await activeEffects(page), []);
  assert.deepEqual(await canvasPixels(page, canvas), afterPlacement, 'note feedback remains a non-destructive overlay');
  assert.equal(await page.evaluate(() => __audioContexts), 1, 'effects reuse the editor AudioContext');

  await page.locator('#audio-play-toggle').click();
  await page.waitForFunction(() => document.querySelector('#audio-play-toggle')?.getAttribute('aria-pressed') === 'true');
  await page.waitForFunction(() => document.querySelector('.px-fx-note[data-active="true"]'), null, { timeout: 1600 });
  const rafDuringPlay = await page.evaluate(() => ({ peak: __rafPeak, active: __rafActive.size }));
  assert.ok(rafDuringPlay.peak <= 2, `effects added RAF loops to the audio playhead: ${JSON.stringify(rafDuringPlay)}`);
  await page.locator('#audio-play-toggle').click();
  await page.waitForFunction(() => document.querySelector('#audio-play-toggle')?.getAttribute('aria-pressed') === 'false');
  await page.waitForTimeout(260); assert.deepEqual(await activeEffects(page), []);
  assert.equal(await page.evaluate(() => __rafActive.size), 0, 'stopping transport leaves no scheduled animation frame');

  if (engineName === 'chromium' && viewport.width === 320) {
    await page.evaluate(() => { HTMLCanvasElement.prototype.__harnessToBlob = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (callback) { callback(null); }; });
    await page.locator('#audio-export-image').click();
    await page.waitForFunction(() => document.querySelector('#audio-export-image')?.disabled === false);
    assert.equal(await page.locator('.px-fx-export[data-active="true"]').count(), 0, 'failed PNG encoding does not show a success thumbnail');
    await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = HTMLCanvasElement.prototype.__harnessToBlob; delete HTMLCanvasElement.prototype.__harnessToBlob; });
    pass('chromium Audio 320×568: null PNG callback does not trigger export success feedback');
  }

  const beforeExport = await canvasPixels(page, canvas);
  const ready = page.waitForEvent('download'); const exportFx = waitFx(page, '.px-fx-export'); await page.locator('#audio-export-image').click();
  const [download] = await Promise.all([ready, exportFx]);
  const png = await verifyDownloadPng(download, 2048, 2048); await assertEffectBudget(page);
  assert.deepEqual(await canvasPixels(page, canvas), beforeExport, 'export feedback does not change audio pixels');
  const sampled = await page.evaluate(async (url) => {
    const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const result = [];
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) result.push(...ctx.getImageData(x * 128 + 64, y * 128 + 64, 1, 1).data);
    return result;
  }, `data:image/png;base64,${png.toString('base64')}`);
  assert.deepEqual(sampled, beforeExport, 'exported audio artwork matches the unchanged 16×16 source pixels');
  await page.waitForTimeout(260); assert.deepEqual(await activeEffects(page), []);
  assert.deepEqual(errors, []);
  pass(`${engineName} Audio ${viewport.width}×${viewport.height}: note/color/playback/export feedback, one context, bounded RAF/effects, exact PNG`);
  await context.close();
}

async function runJigsaw(browser, viewport, engineName) {
  const context = await browser.newContext({ viewport }); const page = await context.newPage(); const errors = []; const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push({ url: route.request().url(), method: route.request().method() }); return route.abort();
  });
  await installCounters(page);
  await page.goto(new URL('/jigsaw/', BASE).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#jigsaw-source-kind'); await inspectLayout(page, viewport);
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 16; const ctx = c.getContext('2d');
    const colors = ['#ed4b37', '#32a6db', '#84c441', '#8448bd'];
    for (let cell = 0; cell < 4; cell += 1) { ctx.fillStyle = colors[cell]; ctx.fillRect((cell % 2) * 8, Math.floor(cell / 2) * 8, 8, 8); }
    return c.toDataURL('image/png');
  });
  await page.locator('#jigsaw-source-kind').selectOption('file');
  await page.locator('#jigsaw-grid-size').selectOption('3');
  await page.locator('#jigsaw-file').setInputFiles({ name: 'effects-fixture.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  if (viewport.width > viewport.height && viewport.height <= 520) {
    for (const selector of ['#jigsaw-grid-size', '#jigsaw-start']) {
      const control = page.locator(selector); await control.scrollIntoViewIfNeeded();
      const geometry = await control.evaluate((node) => {
        const rect = node.getBoundingClientRect(); const panel = document.querySelector('.jigsaw-setup').getBoundingClientRect();
        const navigation = document.querySelector('.app-tabs').getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return { control: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }, panel: { top: panel.top, bottom: panel.bottom }, navigationTop: navigation.top, hitTarget: hit === node || node.contains(hit), scrollTop: document.querySelector('.jigsaw-setup').scrollTop };
      });
      assert.ok(geometry.control.top >= geometry.panel.top && geometry.control.bottom <= geometry.panel.bottom, `${selector} is fully inside the scrollable setup panel: ${JSON.stringify(geometry)}`);
      assert.ok(geometry.control.bottom <= geometry.navigationTop, `${selector} is above fixed navigation: ${JSON.stringify(geometry)}`);
      assert.equal(geometry.hitTarget, true, `${selector} receives input at its center after scrolling: ${JSON.stringify(geometry)}`);
    }
  }
  await page.locator('#jigsaw-start').click(); await page.waitForFunction(() => !document.querySelector('#jigsaw-play')?.hidden);
  await inspectLayout(page, viewport);
  const first = page.locator('#jigsaw-tray button[data-piece-id]').first();
  const pieceId = await first.getAttribute('data-piece-id');
  const groupId = await first.getAttribute('data-group-id');
  const sourcePixels = await first.locator('canvas').evaluate((canvas) => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]);
  assert.equal(await page.locator('#jigsaw-tray button[data-piece-id]').count(), 25, '16px artwork is partitioned by a 3px piece size');
  await first.click();
  await page.locator('#jigsaw-board').click({ position: { x: 48, y: 28 } });
  await page.waitForFunction((id) => !document.querySelector(`#jigsaw-tray button[data-group-id="${id}"]`), groupId);
  assert.equal(await page.locator('.px-fx-settle[data-active="true"]').count(), 0, 'free placement does not play successful-join feedback');
  assert.equal(await page.locator('#jigsaw-board button[data-cell], [data-correct], .jigsaw-cell__result').count(), 0, 'workspace has no answer cells or correctness marks');
  for (let turn = 0; turn < 4; turn += 1) await page.locator('#jigsaw-rotate').click();
  await page.locator('#jigsaw-return').click();
  const returned = page.locator(`#jigsaw-tray button[data-piece-id="${pieceId}"]`);
  await returned.waitFor();
  const returnedPixels = await returned.locator('canvas').evaluate((canvas) => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]);
  assert.deepEqual(returnedPixels, sourcePixels, 'move, full rotation, and return preserve the original piece pixels');
  await assertEffectBudget(page);
  await page.waitForTimeout(260); assert.deepEqual(await activeEffects(page), []);
  assert.deepEqual(errors, []);
  assert.equal(external.some(({ method }) => !['GET', 'HEAD'].includes(method)), false, `fixture did not issue external mutations: ${JSON.stringify(external)}`);
  pass(`${engineName} Jigsaw ${viewport.width}×${viewport.height}: free placement has no success markers/effect, full rotation and return preserve pixels; joins covered by the Jigsaw workspace harness`);
  await context.close();
}

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const only = process.env.PIXIEED_EFFECTS_ONLY || '';
  const requestedEngine = process.env.PIXIEED_EFFECTS_ENGINE || '';
  if (requestedEngine && requestedEngine !== engineName) continue;
  if (only && !only.startsWith(engineName)) continue;
  await mkdir('/tmp/pixieed-effects', { recursive: true });
  const browser = await engine.launch({ headless: true, ...(engineName === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
  try {
    if (!only) {
      await runEffectBoundaries(browser, engineName);
      await runHomeGauge(browser, engineName);
    }
    if (!only || only === `${engineName}-gauge`) await runSharedMotionEffects(browser, engineName);
    for (const viewport of viewports) {
      if (only && !['audio', 'draw', 'jigsaw'].some((suite) => only === `${engineName}-${suite}-${viewport.width}`)) continue;
      if (!only || only === `${engineName}-audio-${viewport.width}`) await runAudio(browser, viewport, engineName);
      if (!only || only === `${engineName}-draw-${viewport.width}`) await runDraw(browser, engine, viewport, engineName);
      if (!only || only === `${engineName}-jigsaw-${viewport.width}`) await runJigsaw(browser, viewport, engineName);
    }
  } finally { await browser.close(); }
}
console.log(`Interaction effects checks: ${checks} PASS. Synthetic local fixture only; physical performance and user devices are UNTESTED.`);
