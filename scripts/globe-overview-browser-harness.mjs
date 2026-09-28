#!/usr/bin/env node
/** Local Solar System zoom and globe handoff acceptance; external requests blocked. */
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
const scene = (page) => page.evaluate(() => __PIXIEED_ASTRO__.orrery.getSnapshot());
function projectBody(state, id) {
  const body = id === 'sun' ? { position: [0, 0, 0] } : state.bodies.find((body) => body.id === id);
  assert.ok(body, `body ${id} exists`);
  const d = body.position.map((value, index) => value - state.focusPos[index]);
  const ca = Math.cos(state.azimuth); const sa = Math.sin(state.azimuth); const se = Math.sin(state.elevation); const ce = Math.cos(state.elevation);
  return { x: state.view.width / 2 + (d[0] * ca - d[1] * sa) * state.scale,
    y: state.view.height / 2 - (d[0] * sa * se + d[1] * ca * se + d[2] * ce) * state.scale };
}
async function bodyPoint(page, id) {
  const point = projectBody(await scene(page), id); const box = await page.locator('.orrery-canvas').boundingBox();
  return { x: box.x + point.x, y: box.y + point.y };
}
async function approach(page, id) {
  // At the whole-system scale the inner planets can share one display pixel.
  // Enlarge that area before targeting a specific planet with a real pointer.
  for (let i = 0; i < 8; i += 1) {
    const state = await scene(page); const point = projectBody(state, id);
    const gap = Math.min(...['sun', ...state.bodies.map((body) => body.id)].filter((other) => other !== id).map((other) => {
      const p = projectBody(state, other); return Math.hypot(p.x - point.x, p.y - point.y);
    }));
    if (gap >= 6) break;
    const box = await page.locator('.orrery-canvas').boundingBox();
    await page.mouse.move(box.x + point.x, box.y + point.y); await page.mouse.wheel(0, -100); await frame(page);
  }
  const point = await bodyPoint(page, id); await page.mouse.click(point.x, point.y); await opened(page);
  assert.equal((await scene(page)).focusId, id, `tap approaches ${id}`);
}
async function observeReturns(page) {
  await page.evaluate(() => {
    globalThis.solarApproaches = [];
    const original = __PIXIEED_ASTRO__.orrery.close;
    __PIXIEED_ASTRO__.orrery.close = function (done, options = {}) {
      return original.call(this, done, { ...options, onApproach(...args) {
        solarApproaches.push({ scene: __PIXIEED_ASTRO__.orrery.getSnapshot(), target: options.earthRadiusPx });
        return options.onApproach?.(...args);
      } });
    };
  });
}
async function matchedReturn(page) {
  const result = await page.evaluate(() => ({ approach: solarApproaches.at(-1), radius: __PIXIEED_GLOBE__.getSnapshot().camera.scale }));
  assert.ok(result.approach, 'Earth approach is painted before the globe handoff');
  const earth = result.approach.scene.bodies.find(({ id }) => id === 'earth');
  const radius = result.approach.scene.scale * earth.radiusKm / 149597870.7;
  assert.ok(Math.abs(radius - result.radius) < 0.5, 'returning Earth matches the restored globe radius');
  assert.ok(Math.abs(radius - result.approach.target) < 0.5, 'flight uses the supplied return radius');
}
async function opened(page) { await page.waitForFunction(() => __PIXIEED_ASTRO__.orrery.isOpen() && !__PIXIEED_ASTRO__.orrery.getSnapshot().flying); await frame(page); }
async function open(page) {
  const entry = await page.evaluate(() => {
    const radius = __PIXIEED_GLOBE__.getSnapshot().camera.scale;
    const scopeOpen = __PIXIEED_ASTRO__.scope.isOpen();
    __PIXIEED_ASTRO__.openOrrery();
    const scene = __PIXIEED_ASTRO__.orrery.getSnapshot();
    return { radius, scopeOpen, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, scene };
  });
  if (!entry.scopeOpen && !entry.reduced) assertEarthEntry(entry);
  else assert.equal(entry.scene.flying, false, 'scope and reduced-motion entry remain immediate');
  await opened(page);
  const end = await page.evaluate(() => __PIXIEED_ASTRO__.orrery.getSnapshot());
  assert.equal(end.focusId, 'sun');
  assert.ok(Math.abs(end.scale - Math.min(end.view.width, end.view.height) / 70) < 0.001, 'entry finishes at the whole-system overview');
}
function assertEarthEntry({ radius, scene }) {
  const earth = scene.bodies.find(({ id }) => id === 'earth');
  assert.ok(earth && Math.abs(scene.scale * earth.radiusKm / 149597870.7 - radius) < 0.5, 'Solar System starts with the globe radius in CSS pixels, independent of DPR');
  assert.deepEqual(scene.focusPos, earth.position, 'entry starts centered on Earth');
  assert.equal(scene.flying, true, 'entry pulls back from Earth');
}
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
async function modeLayout(page) {
  const rows = await page.locator('[data-astro-view]').evaluateAll((buttons) => buttons.map((button) => {
    const r = button.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const blockers = [...document.querySelectorAll('.tc-bar,.scope-close,.orrery-close,.scope-fov')].filter((element) => element.getClientRects().length).map((element) => element.getBoundingClientRect());
    return { width: r.width, height: r.height, hit: at === button || button.contains(at), active: button.getAttribute('aria-pressed') === 'true', overlap: blockers.some((b) => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) };
  }));
  assert.equal(rows.length, 3);
  for (const row of rows) { assert.ok(row.width >= 44 && row.height >= 44); assert.equal(row.hit, true); assert.equal(row.overlap, false, 'view switch avoids time and observing controls'); }
  assert.equal(rows.filter((row) => row.active).length, 1, 'one observing view is selected');
}
async function integratedModes(page, expectedView) {
  await page.locator('[data-astro-view="sky"]').click();
  await page.waitForFunction(() => __PIXIEED_ASTRO__.scope.isOpen()); await frame(page); await modeLayout(page);
  const initial = await page.evaluate(() => __PIXIEED_ASTRO__.scope.getSnapshot());
  assert.deepEqual(initial.observer, { latitude: expectedView.view.centerLatitude, longitude: expectedView.view.centerLongitude }, 'sky uses the current gallery location');
  // A manually framed sky must keep its aim, magnification and filter after a
  // Solar System detour, as well as preserving tracked bodies in existing cases.
  await page.evaluate(() => { __PIXIEED_ASTRO__.scope.setAim({ azimuth: 125, altitude: 42 }); __PIXIEED_ASTRO__.scope.setFov(12); __PIXIEED_ASTRO__.scope.setFilter(false); });
  const aimed = await page.evaluate(() => __PIXIEED_ASTRO__.scope.getSnapshot());
  await page.locator('[data-astro-view="solar"]').click(); await opened(page); await modeLayout(page);
  await page.locator('[data-astro-view="sky"]').click(); await closed(page);
  await page.waitForFunction(() => __PIXIEED_ASTRO__.scope.isOpen()); await frame(page); await modeLayout(page);
  const restored = await page.evaluate(() => __PIXIEED_ASTRO__.scope.getSnapshot());
  assert.deepEqual(restored.observer, aimed.observer); assert.equal(restored.tracking, aimed.tracking); assert.equal(restored.filter, aimed.filter);
  assert.ok(Math.abs(restored.fov - aimed.fov) < 0.001 && Math.abs(restored.azimuth - aimed.azimuth) < 0.001 && Math.abs(restored.altitude - aimed.altitude) < 0.001, 'manual sky view survives the detour');
  await page.locator('[data-astro-view="globe"]').click(); await frame(page);
  assert.equal(await page.evaluate(() => __PIXIEED_ASTRO__.scope.isOpen()), false);
  assert.deepEqual(await snapshot(page), expectedView, 'sky returns to the original gallery center and zoom');
  await page.locator('[data-astro-view="solar"]').click(); await opened(page);
  await page.locator('[data-astro-view="globe"]').click(); await closed(page);
  assert.deepEqual(await snapshot(page), expectedView, 'Solar System can return directly to the gallery');
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
    await page.evaluate(() => __PIXIEED_ASTRO__.setPlaying(false)); await observeReturns(page);
    if (tool) await page.waitForFunction(() => __PIXIEED_ASTRO__.scope.isOpen());
    else { await page.evaluate(() => __PIXIEED_GLOBE__.setView({ centerLongitude: 137, centerLatitude: 35, zoom: 1.4 })); await frame(page); }
    const before = await snapshot(page); const scopeBefore = tool ? await page.evaluate(() => __PIXIEED_ASTRO__.scope.getSnapshot()) : null;
    await open(page); await layout(page);
    assert.match(await page.locator('.orrery-close').innerText(), tool ? /望遠鏡へ/ : /地球儀へ/);
    const box = await page.locator('.orrery-canvas').boundingBox(); const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 25, center.y + 10, { steps: 3 }); await page.mouse.up(); await frame(page);
    const idle = await page.evaluate(() => solarDraws); await page.waitForTimeout(150); assert.equal(await page.evaluate(() => solarDraws), idle, 'paused scene stops drawing');
    // Zoom on empty sky verifies the same world point stays under the cursor.
    const anchor = { x: box.width * 0.12, y: Math.max(96, box.height * 0.18) };
    const beforeZoom = await scene(page); const earthBefore = projectBody(beforeZoom, 'earth');
    await page.mouse.move(box.x + anchor.x, box.y + anchor.y); await page.mouse.wheel(0, -80); await frame(page);
    const afterZoom = await scene(page); const earthAfter = projectBody(afterZoom, 'earth'); const ratio = afterZoom.scale / beforeZoom.scale;
    assert.ok(ratio > 1.01 && afterZoom.open && !afterZoom.closing, 'wheel zooms within the Solar System');
    assert.ok(Math.abs(earthAfter.x - (anchor.x + (earthBefore.x - anchor.x) * ratio)) < 1, 'wheel preserves the horizontal cursor anchor');
    assert.ok(Math.abs(earthAfter.y - (anchor.y + (earthBefore.y - anchor.y) * ratio)) < 1, 'wheel preserves the vertical cursor anchor');
    await page.mouse.wheel(0, 40); await frame(page);
    assert.ok((await scene(page)).scale < afterZoom.scale, 'wheel zooms back out within the Solar System');
    await page.evaluate(() => __PIXIEED_ASTRO__.closeOrrery()); await closed(page);
    assert.deepEqual(await snapshot(page), before, 'back button restores the previous globe');
    if (!tool && reducedMotion !== 'reduce') await matchedReturn(page);
    if (tool) { const after = await page.evaluate(() => __PIXIEED_ASTRO__.scope.getSnapshot()); assert.equal(after.open, true); assert.deepEqual(after.observer, scopeBefore.observer); assert.deepEqual(after.tracking, scopeBefore.tracking); }
    await open(page); await approach(page, 'saturn');
    await page.screenshot({ path: `/tmp/pixieed-solar-zoom-${engine}-${viewport.width}-${tool || reducedMotion}.png` });
    const saturnScale = (await scene(page)).scale;
    await page.mouse.move(center.x, center.y); await page.mouse.wheel(0, -40); await frame(page);
    assert.ok((await scene(page)).scale > saturnScale && (await scene(page)).open, 'planet close-up zoom stays in the Solar System');
    const initial = [{ x: center.x - 35, y: center.y }, { x: center.x + 35, y: center.y }];
    const beforePinch = (await scene(page)).scale;
    await touch(page, 'pointerdown', 81, initial[0]); await touch(page, 'pointerdown', 82, initial[1]);
    await touch(page, 'pointermove', 81, { x: center.x - 50, y: center.y }); await touch(page, 'pointermove', 82, { x: center.x + 50, y: center.y });
    await touch(page, 'pointercancel', 81, initial[0]); await touch(page, 'pointercancel', 82, initial[1]);
    await frame(page);
    assert.ok((await scene(page)).scale > beforePinch && (await scene(page)).open, 'pinch zoom changes planet scale without returning');
    const saturnPoint = projectBody(await scene(page), 'saturn');
    assert.ok(Math.abs(saturnPoint.x - box.width / 2) < 1 && Math.abs(saturnPoint.y - box.height / 2) < 1, 'pinch keeps the planet under the moving midpoint');
    const beforeShrink = (await scene(page)).scale;
    await touch(page, 'pointerdown', 85, { x: center.x - 50, y: center.y }); await touch(page, 'pointerdown', 86, { x: center.x + 50, y: center.y });
    await touch(page, 'pointermove', 85, initial[0]); await touch(page, 'pointermove', 86, initial[1]);
    await touch(page, 'pointercancel', 85, initial[0]); await touch(page, 'pointercancel', 86, initial[1]); await frame(page);
    assert.ok((await scene(page)).scale < beforeShrink && (await scene(page)).open, 'pinch also zooms back out');
    const keyboardScale = (await scene(page)).scale;
    await page.locator('.orrery-canvas').press('-'); await frame(page);
    assert.ok((await scene(page)).scale < keyboardScale && (await scene(page)).open, 'keyboard zoom remains in the Solar System');
    await page.evaluate(() => {
      const canvas = document.querySelector('.orrery-canvas'); const r = canvas.getBoundingClientRect();
      for (let i = 0; i < 30; i += 1) canvas.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaY: 100, bubbles: true, cancelable: true }));
    }); await frame(page);
    const wideAgain = await scene(page);
    assert.ok(wideAgain.open && wideAgain.focusId === 'sun' && Math.abs(wideAgain.scale - Math.min(wideAgain.view.width, wideAgain.view.height) / 70) < 0.001, 'zooming out from a planet restores the whole-system overview');
    await page.evaluate(() => __PIXIEED_ASTRO__.closeOrrery()); await closed(page);
    assert.deepEqual(await snapshot(page), before);
    await page.evaluate(() => __PIXIEED_ASTRO__.zoomLimit({ direction: 'out', amount: 1 }));
    assert.equal(await page.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen()), false, 'scroll tail does not reopen overview');
    await open(page); await approach(page, 'earth');
    assert.equal((await scene(page)).closing, false, 'Earth tap is a close-up, not an immediate return');
    await page.mouse.move(center.x, center.y);
    for (let i = 0; i < 20 && (await scene(page)).open && !(await scene(page)).closing; i += 1) {
      if (viewport.width === 320) {
        await touch(page, 'pointerdown', 87, initial[0]); await touch(page, 'pointerdown', 88, initial[1]);
        await touch(page, 'pointermove', 87, { x: center.x - 70, y: center.y }); await touch(page, 'pointermove', 88, { x: center.x + 70, y: center.y });
        await touch(page, 'pointercancel', 87, initial[0]); await touch(page, 'pointercancel', 88, initial[1]);
      } else await page.mouse.wheel(0, -80);
      await frame(page);
    }
    await closed(page); assert.deepEqual(await snapshot(page), before, 'zooming sufficiently into Earth returns to the previous globe');
    if (!tool && reducedMotion !== 'reduce') await matchedReturn(page);
    if (!tool && viewport.width === 390 && reducedMotion !== 'reduce') {
      await open(page); await approach(page, 'earth');
      await page.setViewportSize({ width: 844, height: 390 }); await frame(page); await layout(page);
      const resizedBox = await page.locator('.orrery-canvas').boundingBox();
      await page.mouse.move(resizedBox.x + resizedBox.width / 2, resizedBox.y + resizedBox.height / 2);
      for (let i = 0; i < 20 && (await scene(page)).open && !(await scene(page)).closing; i += 1) { await page.mouse.wheel(0, -80); await frame(page); }
      await closed(page); await matchedReturn(page); assert.deepEqual(await snapshot(page), before, 'rotation preserves the saved globe view');
      await page.setViewportSize(viewport); await frame(page);
    }
    if (!tool && reducedMotion !== 'reduce') {
      const interrupted = await page.evaluate(() => {
        __PIXIEED_ASTRO__.openOrrery();
        const canvas = document.querySelector('.orrery-canvas'); const r = canvas.getBoundingClientRect();
        const before = __PIXIEED_ASTRO__.orrery.getSnapshot();
        canvas.dispatchEvent(new WheelEvent('wheel', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaY: 80, bubbles: true, cancelable: true }));
        return { before, after: __PIXIEED_ASTRO__.orrery.getSnapshot() };
      });
      assert.ok(interrupted.after.open && !interrupted.after.flying && interrupted.after.scale < interrupted.before.scale, 'input interrupts entry without snapping to the final overview');
      assert.ok(Math.abs(interrupted.after.scale / interrupted.before.scale - Math.exp(-80 * 0.007)) < 0.001, 'interrupted entry retains the requested zoom amount');
      await page.evaluate(() => __PIXIEED_ASTRO__.closeOrrery()); await closed(page);
    }
    await open(page);
    await page.evaluate(() => {
      __PIXIEED_ASTRO__.closeOrrery(); __PIXIEED_ASTRO__.closeOrrery();
      document.querySelector('.orrery-canvas').dispatchEvent(new WheelEvent('wheel', { deltaY: -80 }));
      Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange'));
      delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
    });
    await closed(page); assert.deepEqual(await snapshot(page), before, 'interrupted and backgrounded return completes');
    if (!tool) { await integratedModes(page, before); await page.screenshot({ path: `/tmp/pixieed-gallery-observe-${engine}-${viewport.width}.png` }); }
    else assert.equal(await page.locator('#astroViewSwitch').isVisible(), false, 'standalone telescope keeps its own navigation');
    assert.deepEqual(errors, []); checks += 1; console.log(`PASS ${engine} ${viewport.width}x${viewport.height} ${tool || reducedMotion}`); await context.close();
  }
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/globe/`, { waitUntil: 'domcontentloaded' });
    const globe = await (await page.locator('.map-hero__globe-frame').elementHandle()).contentFrame();
    await globe.waitForFunction(() => globalThis.__PIXIEED_ASTRO__?.orrery && globalThis.__PIXIEED_POSTS__);
    await page.waitForSelector('[data-header-pass]');
    const headerPaint = await page.locator('.px-site-header').evaluate((node) => ({
      y: Math.floor(node.getBoundingClientRect().y + node.getBoundingClientRect().height / 2),
      color: getComputedStyle(node).backgroundColor.match(/[\d.]+/g).slice(0, 3).map(Number)
    }));
    const screenshot = await page.screenshot();
    const paintedPixel = await page.evaluate(async ({ png, y }) => {
      const bytes = Uint8Array.from(atob(png), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      try {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d'); ctx.drawImage(bitmap, 2, y, 1, 1, 0, 0, 1, 1);
        return [...ctx.getImageData(0, 0, 1, 1).data];
      } finally { bitmap.close?.(); }
    }, { png: screenshot.toString('base64'), y: headerPaint.y });
    assert.ok(headerPaint.color.every((channel, index) => Math.abs(paintedPixel[index] - channel) <= 10),
      `Globe canvas paints over the shared header: ${JSON.stringify({ headerPaint, paintedPixel })}`);
    await observeReturns(globe);
    await globe.evaluate(() => { __PIXIEED_ASTRO__.setPlaying(false); __PIXIEED_GLOBE__.setView({ centerLongitude: 135, centerLatitude: 32, zoom: 1.2 }); }); await frame(globe);
    await globe.evaluate(() => __PIXIEED_GLOBE__.setView({ zoom: __PIXIEED_GLOBE__.getSnapshot().view.zoomRange.min })); await frame(globe);
    await globe.evaluate(() => {
      const orrery = __PIXIEED_ASTRO__.orrery; const original = orrery.open;
      orrery.open = function (...args) {
        const radius = __PIXIEED_GLOBE__.getSnapshot().camera.scale;
        const result = original.apply(this, args);
        globalThis.solarEntry = { radius, scene: orrery.getSnapshot() };
        return result;
      };
    });
    const box = await globe.locator('#globeCanvas').boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 24 && !await globe.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen()); i += 1) { await page.mouse.wheel(0, 80); await frame(globe); }
    assert.equal(await globe.evaluate(() => __PIXIEED_ASTRO__.orrery.isOpen()), true, 'actual wheel opens overview');
    assertEarthEntry(await globe.evaluate(() => solarEntry));
    await opened(globe); await layout(globe);
    const overviewScale = (await scene(globe)).scale;
    await page.mouse.wheel(0, -80); await frame(globe);
    assert.ok((await scene(globe)).open && (await scene(globe)).scale > overviewScale, 'public gallery allows Solar System zoom');
    // Enlarge the inner system, then aim at Earth and zoom continuously: no tap
    // or return button is required for the wheel-only path back to the gallery.
    for (let i = 0; i < 4; i += 1) { await page.mouse.wheel(0, -100); await frame(globe); }
    for (let i = 0; i < 32 && (await scene(globe)).open && !(await scene(globe)).closing; i += 1) {
      const earth = await bodyPoint(globe, 'earth'); await page.mouse.move(earth.x, earth.y); await page.mouse.wheel(0, -80); await frame(globe);
    }
    await closed(globe); await matchedReturn(globe);
    assert.ok((await snapshot(globe)).view.zoom >= 1, 'returns at a usable globe size');
    const galleryBeforePost = await snapshot(globe);
    await globe.evaluate(() => { globalThis.testCompositions = []; globalThis.__PIXIEED_POSTS__ = { openComposer() { testCompositions.push({ solarOpen: __PIXIEED_ASTRO__.orrery.isOpen(), scopeOpen: __PIXIEED_ASTRO__.scope.isOpen(), leaving: document.querySelector('#globeStage').classList.contains('is-orrery-leaving'), eventsOpen: document.querySelector('.scope-hud').classList.contains('has-events') }); document.querySelector('#globeStage').classList.add('has-sheet', 'is-composing'); } }; });
    await open(globe); await page.locator('[data-page-action="post"]').click(); await closed(globe);
    assert.deepEqual(await globe.evaluate(() => testCompositions), [{ solarOpen: false, scopeOpen: false, leaving: false, eventsOpen: false }], 'parent posting action first returns to gallery');
    assert.equal(await globe.locator('#astroViewSwitch').isVisible(), false, 'view switch does not cover a composition sheet');
    await globe.evaluate(() => document.querySelector('#globeStage').classList.remove('has-sheet', 'is-composing'));
    await globe.locator('[data-astro-view="sky"]').click(); await globe.waitForFunction(() => __PIXIEED_ASTRO__.scope.isOpen());
    await globe.evaluate(() => __PIXIEED_ASTRO__.setEventsOpen(true));
    await page.locator('[data-page-action="post"]').click(); await frame(globe);
    assert.deepEqual(await globe.evaluate(() => testCompositions), [{ solarOpen: false, scopeOpen: false, leaving: false, eventsOpen: false }, { solarOpen: false, scopeOpen: false, leaving: false, eventsOpen: false }], 'sky and its event sheet also close before posting');
    assert.deepEqual(await snapshot(globe), galleryBeforePost, 'posting from the sky preserves the gallery view');
    assert.deepEqual(errors, []); checks += 1; console.log(`PASS ${engine} public gallery integration`); await context.close();
  }
  console.log(`BROWSER: PASS (${engine}, ${checks} cases; cursor/pinch/keyboard zoom, planet close-ups, Earth handoff at matching size, interrupted entry/exit, globe/scope restore, responsive controls, idle drawing)`);
} finally { await browser.close(); }
