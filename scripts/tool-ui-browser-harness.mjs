#!/usr/bin/env node
/** Local-only UI acceptance; never connects to the signed-in browser or ad providers. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_UI_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright = await import(pathToFileURL(modulePath).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
const checks = [];
const pass = (description) => checks.push(description);
const frame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function fit(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, overflow: element.scrollWidth > element.clientWidth + 1 };
  });
}
async function fixture(page, color, width = 32, height = 48) {
  return page.evaluate(({ color, width, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffe5a1'; ctx.fillRect(3, 4, 8, 12);
    return canvas.toDataURL('image/png').split(',')[1];
  }, { color, width, height });
}
async function startPuzzle(page, png, filename = 'local-fixture.png') {
  await page.locator('#jigsaw-source-kind').selectOption('file');
  await page.locator('#jigsaw-file').setInputFiles({ name: filename, mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForFunction(() => !document.querySelector('#jigsaw-start').disabled);
  await page.locator('#jigsaw-start').click();
  await page.locator('#jigsaw-play').waitFor({ state: 'visible' }); await frame(page);
}
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/tools/`, { waitUntil: 'domcontentloaded' });
    await page.locator('canvas[data-tool-preview]').first().waitFor(); await frame(page);
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.hp-toy[data-tool-preview]')).opacity) === 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'tools page does not overflow');
    const canvases = await page.locator('canvas[data-tool-preview]').evaluateAll((nodes) => nodes.map((canvas) => {
      const rect = canvas.getBoundingClientRect(); const parent = canvas.parentElement.getBoundingClientRect();
      const chip = canvas.closest('.hp-toy').querySelector('.hp-chip').getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height, contained: rect.left >= parent.left - 1 && rect.right <= parent.right + 1, unobstructed: chip.top >= rect.bottom || chip.bottom <= rect.top || chip.left >= rect.right || chip.right <= rect.left };
    }));
    assert.ok(canvases.length >= 9);
    for (const canvas of canvases) { assert.equal(canvas.width, 24); assert.equal(canvas.height, 24); assert.equal(canvas.cssWidth % 24, 0); assert.equal(canvas.cssHeight, canvas.cssWidth); assert.equal(canvas.contained, true); assert.equal(canvas.unobstructed, true, 'the open chip never covers the pixel art'); }
    const comingGame = page.locator('.hp-toy[data-tool-preview="game"]');
    assert.equal(await comingGame.count(), 1);
    assert.equal(await comingGame.evaluate((card) => card.tagName === 'A' || card.querySelector('a') !== null), false, 'the coming game has no launch link');
    const button = await fit(page, '[data-header-pass]'); const brand = await fit(page, '.px-header-brand');
    assert.ok(button.width >= 44 && button.height >= 44 && button.right <= viewport.width);
    assert.ok(brand.right <= button.left + 1);
    await page.screenshot({ path: `/tmp/pixieed-tools-ui-${engine}-${viewport.width}.png` });
    pass(`tools ${viewport.width}: 24px previews, whole-pixel enlargement, no page/header overflow`);

    await page.locator('[data-header-pass]').click();
    await page.locator('.px-pass-go').click();
    await page.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.active === 'true');
    assert.equal(await page.locator('script[src*="securepubads"]').count(), 0, 'daily free hour never loads an ad');
    await page.waitForTimeout(550);
    assert.equal(await page.locator('[data-header-pass]').evaluate((button) => button.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length), 0);
    assert.equal((await fit(page, '[data-header-pass-label]')).overflow, false);
    await page.screenshot({ path: `/tmp/pixieed-pass-ui-${engine}-${viewport.width}.png` });
    pass(`pass ${viewport.width}: free hour, readable time, recharge finishes with no idle animation`);

    await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' }); await frame(page);
    for (const id of ['draw-undo', 'draw-redo']) {
      const rect = await fit(page, `#${id}`); assert.ok(rect.width >= 44 && rect.height >= 44, `${id} has a 44px touch target`);
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-label') !== null, true);
      assert.equal(await page.locator(`#${id} svg`).isVisible(), true, 'history icon remains visible through the page CSS');
    }
    const drawing = page.locator('#draw-canvas');
    const original = await drawing.evaluate((canvas) => canvas.toDataURL());
    await drawing.click({ position: { x: 8, y: 8 } }); await frame(page);
    await page.waitForFunction(() => !document.querySelector('#draw-undo').disabled);
    assert.notEqual(await drawing.evaluate((canvas) => canvas.toDataURL()), original);
    await page.locator('#draw-undo').click(); await frame(page);
    assert.equal(await drawing.evaluate((canvas) => canvas.toDataURL()), original, 'undo restores original pixels');
    await page.locator('#draw-redo').click(); await frame(page);
    assert.notEqual(await drawing.evaluate((canvas) => canvas.toDataURL()), original, 'redo restores the new stroke');
    await page.screenshot({ path: `/tmp/pixieed-draw-ui-${engine}-${viewport.width}.png` });
    pass(`draw ${viewport.width}: consistent undo/redo with accessible touch targets`);

    await page.goto(`${base}/jigsaw/`, { waitUntil: 'domcontentloaded' });
    const png = await fixture(page, '#427cac'); await startPuzzle(page, png);
    await page.locator('#jigsaw-preview-toggle').click();
    await page.locator('#jigsaw-preview').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#jigsaw-preview-toggle').getAttribute('aria-pressed'), 'true');
    const preview = await fit(page, '#jigsaw-preview'); const workspace = await fit(page, '#jigsaw-workspace');
    assert.ok(preview.left >= workspace.left && preview.right <= workspace.right + 1 && preview.top >= workspace.top && preview.bottom <= workspace.bottom + 1, 'preview fits within the table');
    const pixels = await page.locator('#jigsaw-preview-canvas').evaluate((canvas) => ({ width: canvas.width, height: canvas.height, color: [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data] }));
    assert.deepEqual(pixels, { width: 32, height: 48, color: [66, 124, 172, 255] });
    assert.equal(await page.locator('#jigsaw-preview a, #jigsaw-preview [download]').count(), 0);
    const close = await fit(page, '#jigsaw-preview-close'); assert.ok(close.width >= 44 && close.height >= 44);
    await page.screenshot({ path: `/tmp/pixieed-jigsaw-preview-${engine}-${viewport.width}.png` });
    await page.keyboard.press('Escape'); assert.equal(await page.locator('#jigsaw-preview').isVisible(), false);
    await page.locator('#jigsaw-preview-toggle').click(); await page.locator('#jigsaw-preview-close').click();
    assert.equal(await page.locator('#jigsaw-preview-toggle').getAttribute('aria-pressed'), 'false');
    await page.locator('#jigsaw-preview-toggle').click(); await page.locator('#jigsaw-new').click();
    assert.equal(await page.locator('#jigsaw-preview').isVisible(), false);
    const next = await fixture(page, '#a65273', 48, 32); await startPuzzle(page, next, 'second-fixture.png');
    await page.locator('#jigsaw-preview-toggle').click();
    assert.deepEqual(await page.locator('#jigsaw-preview-canvas').evaluate((canvas) => ({ width: canvas.width, height: canvas.height, color: [...canvas.getContext('2d').getImageData(0, 0, 1, 1).data] })), { width: 48, height: 32, color: [166, 82, 115, 255] });
    pass(`jigsaw ${viewport.width}: original pixels, close/Escape, new-source replacement, no export controls`);
    assert.deepEqual(errors, [], 'no browser JavaScript exceptions');
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(`${base}/tools/`, { waitUntil: 'domcontentloaded' }); await frame(page);
  const image = () => page.locator('canvas[data-tool-preview]').first().evaluate((canvas) => canvas.toDataURL());
  const still = await image(); await page.waitForTimeout(600); assert.equal(await image(), still, 'reduced-motion previews remain still');
  const toolArt = {};
  for (const key of ['editor', 'camera', 'sound']) toolArt[key] = await page.locator(`canvas[data-tool-preview="${key}"]`).first().evaluate((canvas) => canvas.toDataURL());
  pass('reduced motion: previews draw once and remain still');
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' }); await frame(page);
  const homeSizes = await page.locator('[data-toy] canvas').evaluateAll((nodes) => nodes.map((canvas) => [canvas.width, canvas.height]));
  assert.ok(homeSizes.length >= 9); assert.ok(homeSizes.every(([w, h]) => w === 24 && h === 24));
  await page.locator('#hpToys').scrollIntoViewIfNeeded(); await frame(page);
  await page.screenshot({ path: `/tmp/pixieed-home-toys-${engine}.png` });
  for (const key of ['editor', 'camera', 'sound']) assert.equal(await page.locator(`[data-toy="${key}"] canvas`).evaluate((canvas) => canvas.toDataURL()), toolArt[key], `${key} shares the same home/tools illustration`);
  pass('home: existing interactive toys retain a unified 24×24 canvas');
  const tapToyCell = async (key, x, y) => {
    const canvas = page.locator(`[data-toy="${key}"] canvas`);
    await canvas.scrollIntoViewIfNeeded();
    const rect = await canvas.boundingBox();
    // Exercise a real pointer (including capture), while suppressing only this
    // fixture click's anchor navigation so the toy can be inspected in place.
    await canvas.evaluate((element) => element.addEventListener('click', (event) => event.preventDefault(), { once: true }));
    await page.mouse.click(rect.x + (x + 0.5) * rect.width / 24, rect.y + (y + 0.5) * rect.height / 24);
    await frame(page);
    return canvas;
  };
  const editor = await tapToyCell('editor', 2, 2);
  assert.deepEqual(await editor.evaluate((canvas) => {
    const ctx = canvas.getContext('2d'); return [2, 21].map((x) => [...ctx.getImageData(x, 2, 1, 1).data]);
  }), [[242, 155, 82, 255], [242, 155, 82, 255]], 'editor preserves the mirrored drawing coordinates');
  const sound = await tapToyCell('sound', 0, 3);
  const litNote = await sound.evaluate((canvas) => [...canvas.getContext('2d').getImageData(0, 3, 1, 1).data]);
  assert.ok(JSON.stringify(litNote) === '[243,166,192,255]' || JSON.stringify(litNote) === '[255,255,255,255]', 'sound input creates the note at the offset grid cell, including when the playhead highlights it');
  await tapToyCell('sound', 0, 3);
  assert.deepEqual(await sound.evaluate((canvas) => [...canvas.getContext('2d').getImageData(0, 3, 1, 1).data]), [42, 33, 64, 255], 'a second tap removes the same note');
  const puzzleSlots = () => page.locator('[data-toy="jigsaw"] canvas').evaluate((canvas) => {
    const ctx = canvas.getContext('2d'); return [4, 8].map((x) => [...ctx.getImageData(x, 4, 4, 4).data]);
  });
  const originalSlots = await puzzleSlots();
  const jigsaw = await tapToyCell('jigsaw', 4, 4);
  assert.deepEqual(await jigsaw.evaluate((canvas) => [...canvas.getContext('2d').getImageData(4, 4, 1, 1).data]), [255, 255, 255, 255], 'jigsaw selects the actual 4×4 puzzle cell');
  await tapToyCell('jigsaw', 8, 4);
  assert.deepEqual(await puzzleSlots(), [originalSlots[1], originalSlots[0]], 'second selection swaps the exact two pieces and clears the outline');
  assert.equal(new URL(page.url()).pathname, '/');
  pass('home: mirrored drawing, note input and puzzle swapping preserve their cell coordinates');
  await page.setViewportSize({ width: 512, height: 400 });
  const moonPhases = await page.evaluate(async () => {
    const { createToolToys, createCircleMask } = await import('/js/tool-toys.mjs?rev=20260929-shared-toys-2');
    const card = document.createElement('span'); const canvas = document.createElement('canvas'); card.append(canvas);
    let draw;
    const toys = createToolToys({ note() {}, interactive: false, animate: (_element, paint) => { draw = paint; return () => {}; } });
    toys.telescope(card);
    const mask = createCircleMask(8, 24); const clearance = createCircleMask(10, 24);
    const sheet = document.createElement('canvas'); sheet.id = 'test-moon-phases'; sheet.width = 480; sheet.height = 352;
    const ctx = sheet.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0c1320'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    const phases = [0, 4000, 9000, 14000, 19000, 24000].map((time, index) => {
      draw(time);
      const pixels = canvas.getContext('2d').getImageData(0, 0, 24, 24).data;
      let lit = 0; let dark = 0; let area = 0; let touchingStars = 0;
      clearance.forEach((inside, pixel) => {
        if (!inside || mask[pixel]) return;
        const p = pixel * 4;
        if (pixels[p] !== 12 || pixels[p + 1] !== 19 || pixels[p + 2] !== 32) touchingStars++;
      });
      mask.forEach((inside, pixel) => {
        if (!inside) return; area++;
        const p = pixel * 4;
        if (pixels[p] === 37 && pixels[p + 1] === 47 && pixels[p + 2] === 64) dark++;
        else if (pixels[p] >= 160 && pixels[p + 1] >= 150 && pixels[p + 2] >= 120) lit++;
      });
      const x = index % 3 * 160 + 8; const y = Math.floor(index / 3) * 176 + 24;
      ctx.drawImage(canvas, x, y, 144, 144); ctx.fillStyle = '#ffffff'; ctx.font = '12px system-ui'; ctx.fillText(`${time / 1000}s`, x, y - 7);
      return { time, lit, dark, area, touchingStars };
    });
    sheet.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:480px;height:352px'; document.body.append(sheet);
    return phases;
  });
  const full = moonPhases.find((phase) => phase.time === 4000); const newMoon = moonPhases.find((phase) => phase.time === 14000);
  assert.equal(full.lit, full.area, 'full moon fills the entire Bresenham silhouette with no stray dark rim pixels');
  assert.equal(newMoon.dark, newMoon.area, 'new moon has no floating-point highlight specks on its outer edge');
  for (const phase of moonPhases) {
    assert.equal(phase.lit + phase.dark, phase.area, 'every phase preserves the same opaque moon silhouette');
    assert.equal(phase.touchingStars, 0, 'nearby stars never contaminate the moon outline');
  }
  await page.locator('#test-moon-phases').screenshot({ path: `/tmp/pixieed-moon-phases-${engine}.png` });
  pass('moon: whole-pixel circle across six phases, full-moon silhouette and speck-free new moon');
  await context.close();
  console.log(JSON.stringify({ engine, checks: checks.length, passed: checks, externalRequests: 'blocked', realAds: 'UNTESTED', physicalDevice: 'UNTESTED' }, null, 2));
} finally { await browser.close(); }
