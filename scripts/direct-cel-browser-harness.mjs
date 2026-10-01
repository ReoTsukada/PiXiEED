import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: touch ? { width: 390, height: 844 } : { width: 1280, height: 720 }, hasTouch: touch });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.fulfill({ json: [] }));
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/draw/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#draw-animation-controls .animation-controls');
    const panel = page.locator('#draw-animation-controls-panel');
    const open = async () => { if (!await panel.isVisible()) await page.locator('[data-action="toggle-frames"]').click(); };
    const frames = () => panel.locator('.animation-controls__frame');
    const layers = () => panel.locator('.animation-controls__layer-number');
    const ids = locator => locator.evaluateAll(nodes => nodes.map(n => n.dataset.frameId || n.dataset.layerId));
    const center = async locator => { const r = await locator.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const cdp = touch ? await context.newCDPSession(page) : null;
    const down = async p => touch ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, id: 1 }] }) : (await page.mouse.move(p.x, p.y), page.mouse.down());
    const move = async p => touch ? cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 1 }] }) : page.mouse.move(p.x, p.y, { steps: 5 });
    const up = async cancel => touch ? cdp.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }) : page.mouse.up();
    const hold = async (from, to, cancel = false) => {
      await down(await center(from)); await page.waitForTimeout(400);
      assert.equal(await panel.locator('.is-lifted').count(), 1, 'long press visibly lifts the numbered cell');
      if (to) await move(await center(to));
      await up(cancel); await page.waitForTimeout(450);
    };
    await open(); await panel.locator('.animation-controls__frame-add').click(); await panel.locator('.animation-controls__frame-add').click();
    await panel.locator('.animation-controls__layer-add').click();
    const originalFrames = await ids(frames()), originalLayers = await ids(layers());
    const grid = await panel.locator('[data-action="select-cel"]').evaluateAll(nodes => nodes.map(n => {
      const root = n.closest('.animation-controls__frames');
      const f = root.querySelector(`.animation-controls__frame[data-frame-id="${n.dataset.frameId}"]`);
      const l = root.querySelector(`.animation-controls__layer-number[data-layer-id="${n.dataset.layerId}"]`);
      const r = n.getBoundingClientRect(), fr = f.getBoundingClientRect(), lr = l.getBoundingClientRect();
      return { frame: n.dataset.frameId, layer: n.dataset.layerId, dx: r.x - fr.x, dy: r.y - lr.y, width: r.width, height: r.height };
    }));
    assert.ok(grid.every(r => Math.abs(r.dx) < .1 && Math.abs(r.dy) < .1 && r.width === 44 && r.height === 44), JSON.stringify(grid));
    await hold(frames().nth(0), frames().nth(2));
    assert.deepEqual(await ids(frames()), [originalFrames[1], originalFrames[2], originalFrames[0]], 'frame order follows the dropped number');
    await page.locator('#draw-undo').click(); await open(); assert.deepEqual(await ids(frames()), originalFrames);
    await page.locator('#draw-redo').click(); await open(); assert.deepEqual(await ids(frames()), [originalFrames[1], originalFrames[2], originalFrames[0]]);
    await hold(layers().nth(0), layers().nth(1)); assert.deepEqual(await ids(layers()), [...originalLayers].reverse());
    await page.locator('#draw-undo').click(); await open(); assert.deepEqual(await ids(layers()), originalLayers);
    if (touch) {
      const before = await ids(frames()); await hold(frames().nth(0), frames().nth(2), true);
      assert.deepEqual(await ids(frames()), before, 'canceled touch never commits a move');
      assert.equal(await panel.locator('.is-lifted,.is-drop-target').count(), 0);
    }
    await hold(frames().first());
    const menu = page.locator('.animation-controls__frame-menu');
    assert.equal(await menu.isVisible(), true, 'stationary hold opens operations');
    const bounds = await menu.boundingBox(), viewport = page.viewportSize();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, JSON.stringify(bounds));
    const durationFrame = await frames().first().getAttribute('data-frame-id');
    await page.locator('[data-frame-menu-action="duration"]').click();
    await page.locator('[data-duration-input]').fill('250'); await page.locator('[data-duration-input]').press('Tab');
    assert.match(await panel.locator(`.animation-controls__frame[data-frame-id="${durationFrame}"]`).getAttribute('title'), /250ms/, 'duration input updates the held frame');
    await page.locator('[data-action="close-duration"]').click();
    await hold(layers().first()); assert.equal(await menu.isVisible(), true);
    await page.locator('[data-context-rename]').fill('手前'); await page.locator('[data-frame-menu-action="rename"]').click();
    assert.match(await layers().first().getAttribute('title'), /手前/);
    const beforeSaveFrames = await ids(frames()), beforeSaveLayers = await ids(layers());
    await page.locator('[data-action="close-animation"]').click(); await page.locator('#draw-save').click();
    await page.waitForFunction(() => new URLSearchParams(location.search).has('pxd') && !document.querySelector('#draw-save').disabled && document.querySelector('#project-open').dataset.state === 'saved');
    const saved = await page.evaluate(async () => {
      const { createPxdStore } = await import('/js/creation/pxd-store.mjs'); const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs');
      return readPxdAnimation(await createPxdStore().load(new URLSearchParams(location.search).get('pxd')), 'main');
    });
    assert.equal(saved.frames.find(f => f.id === durationFrame).durationMs, 250);
    assert.deepEqual(saved.frames.map(f => f.id), beforeSaveFrames);
    assert.deepEqual(saved.layers.map(l => l.id).reverse(), beforeSaveLayers);
    // A direct saved-project URL restores; an ordinary fresh entry intentionally starts blank.
    await page.evaluate(() => history.replaceState({}, '', location.href));
    await page.reload({ waitUntil: 'domcontentloaded' });
    try { await page.waitForFunction(() => document.querySelectorAll('#draw-animation-controls-panel .animation-controls__frame').length === 3); }
    catch (error) { console.log('Reload diagnostics', page.url(), await page.locator('#draw-status').textContent(), errors, await ids(frames())); throw error; }
    assert.equal(await panel.isVisible(), false); await open();
    assert.deepEqual(await ids(frames()), beforeSaveFrames); assert.deepEqual(await ids(layers()), beforeSaveLayers);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/pixieed-direct-cels-${touch ? 'touch' : 'mouse'}.png` });
    console.log(`PASS ${touch ? 'touch' : 'mouse'}: aligned numbered axes, direct adds, hold/reorder, undo/redo, menu/duration/name, cancellation, save/reload`);
    await context.close();
  }
} finally { await browser.close(); }
