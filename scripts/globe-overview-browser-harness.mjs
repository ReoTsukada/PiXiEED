#!/usr/bin/env node
/** Local passive Solar System navigation acceptance; external requests blocked. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_GLOBE_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engine === 'webkit'
  ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(runtime).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
let checks = 0;
const frame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const snapshot = (page) => page.evaluate(() => { const s = __PIXIEED_GLOBE__.getSnapshot(); return { view: { ...s.view }, selectedId: s.selected?.cellId || null }; });
async function opened(page) { await page.waitForFunction(() => __PIXIEED_ASTRO__.orrery.isOpen() && !__PIXIEED_ASTRO__.orrery.getSnapshot().flying); await frame(page); }
async function open(page) { await page.evaluate(() => __PIXIEED_ASTRO__.openOrrery()); await opened(page); }
async function closed(page) { await page.waitForFunction(() => !__PIXIEED_ASTRO__.orrery.isOpen() && !document.querySelector('#globeStage').classList.contains('is-orrery-leaving')); await frame(page); }
async function touch(page, type, id, point) { await page.locator('.orrery-canvas').dispatchEvent(type, { pointerId: id, pointerType: 'touch', clientX: point.x, clientY: point.y, bubbles: true, cancelable: true }); }
async function layout(page) {
  const result = await page.locator('.orrery-close').evaluate((button) => {
    const r = button.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { overflow: document.documentElement.scrollWidth > innerWidth, hit: at === button || button.contains(at), width: r.width, height: r.height };
  });
  assert.equal(result.overflow, false); assert.equal(result.hit, true); assert.ok(result.width >= 43.9 && result.height >= 43.9);
  assert.equal(await page.locator('.orrery-card,.orrery-bodies').count(), 0, 'no planet selection or detailed panels');
}
try {
  for (const [viewport, reducedMotion, tool] of [
    [{ width: 320, height: 568 }, 'no-preference', ''],
    [{ width: 390, height: 844 }, 'no-preference', ''],
    [{ width: 568, height: 320 }, 'no-preference', ''],
    [{ width: 1024, height: 768 }, 'reduce', ''],
    [{ width: 390, height: 844 }, 'no-preference', 'telescope']
  ].filter(() => !process.argv.includes('--public-only'))) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      globalThis.solarDraws = 0;
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) { if (this.canvas.classList.contains('orrery-canvas')) solarDraws += 1; return draw.apply(this, args); };
      // Synthetic touch pointers lack native capture; real mouse capture is retained.
      const capture = Element.prototype.setPointerCapture;
      Element.prototype.setPointerCapture = function (id) { if (id < 80) capture.call(this, id); };
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(tool ? `${base}/telescope/` : `${base}/globe-prototype.html?embed=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__PIXIEED_ASTRO__?.orrery && globalThis.__PIXIEED_GLOBE__);
    await page.evaluate(() => __PIXIEED_ASTRO__.setPlaying(false));
    if (tool) await page.waitForFunction(() => __PIXIEED_ASTRO__.scope.isOpen());
    else { await page.evaluate(() => __PIXIEED_GLOBE__.setView({ centerLongitude: 137, centerLatitude: 35, zoom: 1.4 })); await frame(page); }
    const before = await snapshot(page); const scopeBefore = tool ? await page.evaluate(() => __PIXIEED_ASTRO__.scope.getSnapshot()) : null;
    await open(page); await layout(page);
    assert.match(await page.locator('.orrery-close').innerText(), tool ? /望遠鏡へ/ : /地球儀へ/);
    const box = await page.locator('.orrery-canvas').boundingBox(); const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const focusBeforeTap = await page.evaluate(() => __PIXIEED_ASTRO__.orrery.getSnapshot().focusId);
    await page.mouse.click(center.x, center.y); await frame(page);
    assert.equal(await page.evaluate(() => __PIXIEED_ASTRO__.orrery.getSnapshot().focusId), focusBeforeTap, 'tap never selects a planet');
    await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 25, center.y + 10, { steps: 3 }); await page.mouse.up(); await frame(page);
    const idle = await page.evaluate(() => solarDraws); await page.waitForTimeout(150); assert.equal(await page.evaluate(() => solarDraws), idle, 'paused scene stops drawing');
    await page.screenshot({ path: `/tmp/pixieed-solar-passive-${engine}-${viewport.width}-${tool || reducedMotion}.png` });
    await page.mouse.move(center.x, center.y); await page.mouse.wheel(0, 80); await frame(page);
    assert.equal(await page.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen()), true, 'zooming out keeps the overview');
    const initial = [{ x: center.x - 35, y: center.y }, { x: center.x + 35, y: center.y }];
    await touch(page, 'pointerdown', 81, initial[0]); await touch(page, 'pointerdown', 82, initial[1]);
    await touch(page, 'pointermove', 81, { x: center.x - 25, y: center.y }); await touch(page, 'pointermove', 82, { x: center.x + 25, y: center.y });
    await touch(page, 'pointercancel', 81, initial[0]); await touch(page, 'pointercancel', 82, initial[1]);
    assert.equal(await page.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen()), true, 'cancelled zoom-out pinch stays in overview');
    await page.mouse.wheel(0, -80); await closed(page);
    assert.deepEqual(await snapshot(page), before, 'one wheel zoom-in restores the previous globe');
    if (tool) { const after = await page.evaluate(() => __PIXIEED_ASTRO__.scope.getSnapshot()); assert.equal(after.open, true); assert.deepEqual(after.observer, scopeBefore.observer); assert.deepEqual(after.tracking, scopeBefore.tracking); }
    await page.evaluate(() => __PIXIEED_ASTRO__.zoomLimit({ direction: 'out', amount: 1 }));
    assert.equal(await page.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen()), false, 'scroll tail does not reopen overview');
    await open(page);
    await touch(page, 'pointerdown', 83, initial[0]); await touch(page, 'pointerdown', 84, initial[1]);
    await touch(page, 'pointermove', 83, { x: initial[0].x - 15, y: initial[0].y });
    await touch(page, 'pointercancel', 83, initial[0]); await touch(page, 'pointercancel', 84, initial[1]);
    await closed(page); assert.deepEqual(await snapshot(page), before, 'one pinch zoom-in returns without picking Earth');
    await page.evaluate(() => { __PIXIEED_ASTRO__.openOrrery(); document.querySelector('.orrery-canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -80, bubbles: true, cancelable: true })); });
    await closed(page); assert.deepEqual(await snapshot(page), before, 'zoom-in during entry also returns');
    await open(page); await page.locator('.orrery-canvas').press('+'); await closed(page);
    await open(page);
    for (let i = 0; i < 24 && await page.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen() && !__PIXIEED_ASTRO__.orrery.getSnapshot().closing); i += 1) {
      await page.locator('.orrery-canvas').dispatchEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true });
    }
    await closed(page); assert.deepEqual(await snapshot(page), before, 'small trackpad increments also return');
    await open(page);
    await page.evaluate(() => {
      __PIXIEED_ASTRO__.closeOrrery(); __PIXIEED_ASTRO__.closeOrrery();
      document.querySelector('.orrery-canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -80 }));
      Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
    });
    await closed(page); assert.deepEqual(await snapshot(page), before, 'interrupted and backgrounded return completes');
    assert.deepEqual(errors, []); checks += 1; console.log(`PASS ${engine} ${viewport.width}x${viewport.height} ${tool || reducedMotion}`); await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/globe/`, { waitUntil: 'domcontentloaded' });
    const globe = await (await page.locator('.map-hero__globe-frame').elementHandle()).contentFrame();
    await globe.waitForFunction(() => globalThis.__PIXIEED_ASTRO__?.orrery && globalThis.__PIXIEED_POSTS__);
    await globe.evaluate(() => { __PIXIEED_ASTRO__.setPlaying(false); __PIXIEED_GLOBE__.setView({ centerLongitude: 135, centerLatitude: 32, zoom: 1.2 }); }); await frame(globe);
    await globe.evaluate(() => __PIXIEED_GLOBE__.setView({ zoom: __PIXIEED_GLOBE__.getSnapshot().view.zoomRange.min })); await frame(globe);
    const box = await globe.locator('#globeCanvas').boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 24 && !await globe.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen()); i += 1) { await page.mouse.wheel(0, 80); await frame(globe); }
    assert.equal(await globe.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen()), true, 'actual wheel opens overview');
    await opened(globe); await layout(globe); await page.mouse.wheel(0, -80); await closed(globe);
    assert.ok((await snapshot(globe)).view.zoom >= 1, 'returns at a usable globe size');
    await globe.evaluate(() => { globalThis.testCompositions = []; globalThis.__PIXIEED_POSTS__ = { openComposer() { testCompositions.push({ solarOpen: __PIXIEED_ASTRO__.orrery.isOpen(), leaving: document.querySelector('#globeStage').classList.contains('is-orrery-leaving') }); } }; });
    await open(globe); await page.locator('[data-page-action="post"]').click(); await closed(globe);
    assert.deepEqual(await globe.evaluate(() => testCompositions), [{ solarOpen: false, leaving: false }], 'parent posting action first returns to gallery');
    assert.deepEqual(errors, []); checks += 1; console.log(`PASS ${engine} public gallery integration`); await context.close();
  }
  console.log(`BROWSER: PASS (${engine}, ${checks} cases; passive overview, wheel/pinch/keyboard return, interrupted entry/exit, globe/scope restore, responsive controls, idle drawing)`);
} finally { await browser.close(); }
