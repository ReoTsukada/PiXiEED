#!/usr/bin/env node
/** Isolated local acceptance for jigsaw selection, pickup, release and cancellation. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_JIGSAW_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engine === 'webkit'
  ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(runtime).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
let checks = 0;
const frame = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const counts = (page) => page.evaluate(() => ({ ...globalThis.feedbackCounts }));
async function save(page) {
  await page.locator('#jigsaw-save').click();
  await page.waitForFunction(() => !document.querySelector('#jigsaw-save').disabled && document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));
  return page.evaluate(async () => {
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    return (await createLocalDraftStore(createIndexedDbDraftAdapter()).load(localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1'))).document;
  });
}
async function pixelPoint(page, group) {
  return page.evaluate(async (group) => {
    const { createJigsawLayout } = await import('/js/creation/jigsaw-workspace.mjs');
    const { createIndexedDbDraftAdapter, createLocalDraftStore } = await import('/js/creation/local-drafts.mjs');
    const game = (await createLocalDraftStore(createIndexedDbDraftAdapter()).load(localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1'))).document;
    const layout = createJigsawLayout(game.layout); const piece = layout.pieces.find((piece) => piece.pieceId === group.pieceIds[0]);
    const pixels = [];
    for (let y = 0; y < piece.bounds.height; y += 1) for (let x = 0; x < piece.bounds.width; x += 1) if (piece.mask[y * piece.bounds.width + x]) pixels.push({ x: x + piece.bounds.x + 0.5, y: y + piece.bounds.y + 0.5 });
    pixels.sort((a, b) => Math.hypot(a.x - piece.x - piece.width / 2, a.y - piece.y - piece.height / 2) - Math.hypot(b.x - piece.x - piece.width / 2, b.y - piece.y - piece.height / 2));
    const p = pixels[0]; const rotation = [[p.x, p.y], [-p.y, p.x], [-p.x, -p.y], [p.y, -p.x]][group.rotation];
    const board = document.querySelector('#jigsaw-board'); const r = board.getBoundingClientRect();
    const screen = board.getContext('2d').getTransform().transformPoint(new DOMPoint(group.x + rotation[0], group.y + rotation[1]));
    return { x: Math.round(r.left + screen.x / Math.min(2, devicePixelRatio)), y: Math.round(r.top + screen.y / Math.min(2, devicePixelRatio)) };
  }, group);
}
async function touch(page, type, id, point) {
  await page.locator('#jigsaw-workspace').dispatchEvent(type, { pointerId: id, pointerType: 'touch', button: 0, clientX: point.x, clientY: point.y, bubbles: true, cancelable: true });
}
try {
  for (const [viewport, reducedMotion] of [[{ width: 320, height: 568 }, 'no-preference'], [{ width: 390, height: 844 }, 'no-preference'], [{ width: 568, height: 320 }, 'no-preference'], [{ width: 1280, height: 800 }, 'reduce']]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      globalThis.feedbackCounts = { paints: 0, rectangles: 0, contours: 0, paths: 0 };
      if (globalThis.Path2D) globalThis.Path2D = new Proxy(globalThis.Path2D, { construct(target, args, newTarget) { globalThis.feedbackCounts.paths += 1; return Reflect.construct(target, args, newTarget); } });
      document.addEventListener('pointerdown', (event) => { globalThis.feedbackPointerId = event.pointerId; }, true);
      for (const [method, key] of [['clearRect', 'paints'], ['strokeRect', 'rectangles'], ['stroke', 'contours']]) {
        const fn = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          if (this.canvas.id === 'jigsaw-board') {
            globalThis.feedbackCounts[key] += 1;
            if (method === 'stroke') { const matrix = this.getTransform(); globalThis.feedbackStrokeWidth = this.lineWidth * Math.hypot(matrix.a, matrix.b) / Math.min(2, devicePixelRatio); }
          }
          return fn.apply(this, args);
        };
      }
    });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/jigsaw/`, { waitUntil: 'domcontentloaded' });
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
      g.fillStyle = '#7ebcdb'; g.fillRect(0, 0, 32, 32);
      g.fillStyle = '#eeba61'; g.fillRect(4, 10, 10, 16); g.fillStyle = '#d75a58'; g.fillRect(18, 6, 10, 20);
      g.fillStyle = '#324859'; for (let y = 12; y < 24; y += 5) for (let x = 6; x < 13; x += 4) g.fillRect(x, y, 2, 3);
      g.fillStyle = '#4e8867'; g.fillRect(0, 26, 32, 6); return c.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#jigsaw-source-kind').evaluate((select) => { select.value = 'file'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.locator('#jigsaw-file').setInputFiles({ name: 'local-feedback-fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => /\d.*ピース/.test(document.querySelector('.arc-card-count')?.textContent || ''));
    // Keep the feedback fixture's exact partition through hidden engine state.
    await page.locator('#jigsaw-grid-size').evaluate(select=>{select.value='6';select.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('#jigsaw-start').click(); await page.locator('#jigsaw-play').waitFor({ state: 'visible' }); await frame(page);
    const source = (await save(page)).source;
    const tray = page.locator('#jigsaw-tray [data-group-id]').first(); const id = await tray.getAttribute('data-group-id');
    const t = await tray.boundingBox(); const board = await page.locator('#jigsaw-board').boundingBox(); const point = { x: Math.round(board.x + board.width * 0.6), y: Math.round(board.y + board.height * 0.5) };
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2); await page.mouse.down(); await page.mouse.move(point.x, point.y, { steps: 8 }); await frame(page);
    assert.equal(await page.locator('#jigsaw-workspace').getAttribute('data-jigsaw-dragging'), 'true');
    assert.equal(await page.locator('#jigsaw-workspace').evaluate((node) => getComputedStyle(node).cursor), 'grabbing');
    await page.waitForTimeout(300); const held = await counts(page); await page.waitForTimeout(120);
    assert.deepEqual(await counts(page), held, 'stationary held piece stops animation');
    assert.equal(held.rectangles, 0, 'selection does not use a rectangular stroke'); assert.ok(held.contours > 0, 'selection uses contour strokes');
    await page.screenshot({ path: `/tmp/pixieed-jigsaw-held-${engine}-${viewport.width}.png` });
    await page.mouse.up(); await page.waitForTimeout(300); const idle = await counts(page); await page.waitForTimeout(120);
    assert.deepEqual(await counts(page), idle, 'drop animation stops');
    assert.notEqual(await page.locator('#jigsaw-workspace').getAttribute('data-jigsaw-dragging'), 'true');
    let game = await save(page); let group = game.groups.find((group) => group.groupId === id); assert.equal(group.inTray, false); assert.deepEqual(game.source, source);
    const initial = { x: group.x, y: group.y, rotation: group.rotation, inTray: group.inTray };
    const hit = await pixelPoint(page, group);
    const cachedPaths = (await counts(page)).paths;
    await page.mouse.move(hit.x, hit.y); await page.mouse.down(); await page.mouse.move(hit.x + 20, hit.y + 12, { steps: 3 });
    await page.locator('#jigsaw-workspace').dispatchEvent('pointercancel', { pointerId: await page.evaluate(() => globalThis.feedbackPointerId), pointerType: 'mouse', bubbles: true }); await page.mouse.up(); await page.waitForTimeout(300);
    game = await save(page); group = game.groups.find((group) => group.groupId === id);
    assert.deepEqual({ x: group.x, y: group.y, rotation: group.rotation, inTray: group.inTray }, initial, 'cancel restores the canonical pose');
    assert.equal((await counts(page)).paths, cachedPaths, 'movement and cancellation reuse the selection contour');
    await touch(page, 'pointerdown', 91, hit); await touch(page, 'pointermove', 91, { x: hit.x + 18, y: hit.y + 10 });
    await touch(page, 'pointerdown', 92, { x: hit.x + 42, y: hit.y }); await frame(page);
    assert.notEqual(await page.locator('#jigsaw-workspace').getAttribute('data-jigsaw-dragging'), 'true', 'pinch removes drag presentation');
    await touch(page, 'pointerup', 92, { x: hit.x + 42, y: hit.y }); await touch(page, 'pointerup', 91, { x: hit.x + 18, y: hit.y + 10 }); await page.waitForTimeout(300);
    game = await save(page); group = game.groups.find((group) => group.groupId === id);
    assert.deepEqual({ x: group.x, y: group.y, rotation: group.rotation, inTray: group.inTray }, initial, 'pinch restores a dragged piece before zoom');
    const widthBefore = await page.evaluate(() => globalThis.feedbackStrokeWidth);
    await page.mouse.move(hit.x, hit.y); await page.mouse.wheel(0, -80); await frame(page);
    assert.ok(Math.abs((await page.evaluate(() => globalThis.feedbackStrokeWidth)) - widthBefore) < 0.001, 'selection thickness stays constant when zooming');
    assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), 'responsive viewport has no horizontal overflow');
    const controls = await page.locator('.jigsaw-workspace-tools button').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).map((node) => { const r = node.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { id: node.id, size: r.width >= 44 && r.height >= 44, clear: hit === node || node.contains(hit) }; }));
    assert.ok(controls.every((control) => control.size && control.clear), JSON.stringify(controls));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/pixieed-jigsaw-selected-${engine}-${viewport.width}.png` });
    checks += 1; console.log(`PASS ${engine}: ${viewport.width}×${viewport.height} ${reducedMotion}: contour, drag/drop, cancel/pinch rollback, idle, controls`);
    await context.close();
  }
} finally { await browser.close(); }
console.log(`PASS all ${checks} feedback scenarios`);
