/** Real Chromium pointer/keyboard acceptance; isolated synthetic projects, localhost only. */
import nativeAssert from 'node:assert/strict';
let assertions = 0;
const assert = new Proxy(nativeAssert, { get(target, key) { const value = Reflect.get(target, key); return typeof value === 'function' ? (...args) => { assertions++; return value(...args); } : value; } });
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createAnimation, addAnimationFrame, writeAnimationCel, setLayerProperties } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';
import { putPxdImage } from '../js/creation/pxd-project.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4198';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'localhost only');
const output = process.env.PIXIEED_DRAW_RAIL_OUTPUT || '/tmp/pixieed-draw-seo-rails-20261019/rails';
await mkdir(output, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const report = { status: 'RUNNING', base, checkedAt: new Date().toISOString(), browser: browser.version(), viewports: [], cases: [], errors: [], externalAttempts: [], mediaAttempts: [], limitations: ['Headless Chromium with real browser mouse/keyboard input and synthetic local files. Physical device, Safari, OS dialogs, production and assistive technology are untested.'] };
let activePage, activeLabel, caseName;
const palette = ['#204060', '#e75445', '#4c82c3'];
const pixel = (rgba, x, y, width = 16) => rgba.slice((y * width + x) * 4, (y * width + x) * 4 + 4);
const count = rgba => rgba.reduce((n, v, i) => n + Number(i % 4 === 3 && v > 0), 0);
const rgba = page => page.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
const canvasRgba = (page, selector) => page.locator(selector).evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const ready = page => page.waitForFunction(() => !!window.__PIXIEED_CREATION_HOST__?.runtime && window.__PIXIEED_CREATION_HOST__.active && !document.querySelector('#main')?.inert && !window.__PIXIEED_CREATION_HOST__.switching);
async function railWidth(page, width) { assert.equal(Number(await page.locator('[data-layout-separator="leftWidth"]').getAttribute('aria-valuenow')), width); }
async function click(page, selector) {
  const target = typeof selector === 'string' ? page.locator(selector) : selector;
  await target.scrollIntoViewIfNeeded();
  const hit = await target.evaluate(node => { const r = node.getBoundingClientRect(), at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { width: r.width, height: r.height, hit: at === node || node.contains(at) }; });
  assert.ok(hit.width > 0 && hit.height > 0 && hit.hit, `browser hit target ${typeof selector === 'string' ? selector : 'locator'}: ${JSON.stringify(hit)}`);
  await target.click(); await settle(page);
}
async function point(page, x, y) { const r = await page.locator('#draw-canvas').boundingBox(); return { x: r.x + (x + .5) * r.width / 16, y: r.y + (y + .5) * r.height / 16 }; }
async function stroke(page, coordinates) {
  const points = await Promise.all(coordinates.map(([x, y]) => point(page, x, y)));
  for (const p of points) assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.id === 'draw-canvas', p), true, 'canvas receives browser input');
  await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y, { steps: 5 });
  await page.mouse.up(); await settle(page);
}
const dot = (page, x, y) => stroke(page, [[x, y]]);
const toolSelector = (tool, mode = '') => `[data-desktop-tool="${tool}"]${mode ? `[data-desktop-selection-mode="${mode}"]` : ''}`;
async function tool(page, name, mode = '') {
  const selector = toolSelector(name, mode); await click(page, selector);
  await page.waitForFunction(({ name, mode, selector }) => document.querySelector('#draw-canvas')?.dataset.tool === name && document.querySelector(selector)?.getAttribute('aria-pressed') === 'true' && (!mode || document.querySelector(`.draw-tool-menu [data-draw-tool="select"][data-selection-mode="${mode}"]`)?.getAttribute('aria-pressed') === 'true'), { name, mode, selector });
}
async function input(page, selector, value) { await page.locator(selector).fill(String(value)); await page.locator(selector).press('Tab'); await settle(page); }
async function project(page, { cells = [], frames = null, locked = false } = {}) {
  let animation = createAnimation({ width: 16, height: 16, palette });
  for (const [index, frameCells] of (frames || [cells]).entries()) {
    if (index) animation = addAnimationFrame(animation, { copy: false, durationMs: 500 });
    const pixels = new Uint8Array(256); for (const [x, y, color = 1] of frameCells) pixels[y * 16 + x] = color;
    animation = writeAnimationCel(animation, animation.frames[index].id, animation.layers[0].id, { width: 16, height: 16, pixels });
  }
  if (locked) animation = setLayerProperties(animation, animation.layers[0].id, { locked: true });
  const bytes = await encodePxd(await writePxdAnimation(createPxdProject({ manifest: { title: 'Synthetic rail acceptance' } }), animation));
  await page.locator('#pxd-file-input').setInputFiles({ name: 'synthetic-rail.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
  await page.waitForFunction(id => window.__PIXIEED_CREATION_HOST__?.runtime?.draw.getTimeline().frames[0].id === id && !document.querySelector('#main')?.inert, animation.frames[0].id);
  if (await page.locator('#pxd-panel').evaluate(n => n.open)) await click(page, '#project-close');
  await ready(page); await settle(page); return animation;
}
async function test(name, fn) {
  caseName = name; await railWidth(activePage, activeLabel.startsWith('min') ? 62 : 224);
  const detail = await fn(); report.cases.push({ viewport: activeLabel, name, status: 'PASS', ...detail }); console.log(`PASS ${activeLabel}: ${name}`);
}
async function fresh(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false });
  await context.addInitScript(() => {
    window.__mediaAttempts = [];
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async constraints => { window.__mediaAttempts.push({ method: 'getUserMedia', constraints }); throw new DOMException('Synthetic denial', 'NotAllowedError'); }, enumerateDevices: async () => { window.__mediaAttempts.push({ method: 'enumerateDevices' }); return []; }, addEventListener() {}, removeEventListener() {} } });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async descriptor => { if (['camera', 'microphone'].includes(descriptor?.name)) window.__mediaAttempts.push({ method: 'permission', name: descriptor.name }); return { state: 'denied', addEventListener() {}, removeEventListener() {} }; } } });
  });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    report.externalAttempts.push({ method: request.method(), url: request.url() }); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.goto(`${base}/draw/?workspace=1`, { waitUntil: 'domcontentloaded' }); await ready(page);
  if (viewport.width >= 1100) await page.waitForFunction(() => document.body.classList.contains('draw-desktop-active'));
  if (viewport.width === 1100) { await page.locator('[data-layout-separator="leftWidth"]').focus(); await page.keyboard.press('Home'); await settle(page); }
  return { context, page };
}
const actionButton = action => `#draw-selection-controls [data-selection-action="${action}"]`;
async function selection(page) { return page.locator('.draw-selection').evaluate(n => ({ hidden: n.hidden, x: +n.dataset.x, y: +n.dataset.y, width: +n.dataset.width, height: +n.dataset.height })); }
async function selectRect(page) { await tool(page, 'select', 'rectangle'); await stroke(page, [[1, 1], [8, 8]]); assert.deepEqual(await selection(page), { hidden: false, x: 1, y: 1, width: 8, height: 8 }); }
async function deselect(page) { await click(page, '[data-selection-action="deselect"]'); assert.equal((await selection(page)).hidden, true); }
async function chooseFrame(page, index) { await click(page, '[data-desktop-cell-launcher]'); await click(page, page.locator('#draw-animation-controls-panel [data-action="select-frame"]').nth(index)); await click(page, '#draw-animation-controls-panel [data-action="close-animation"]'); }
async function topClose(page) { const bounds = await page.locator('.draw-color-adjustment').boundingBox(); const headerBottom = await page.locator('body > .site-header').evaluate(n => n.getBoundingClientRect().bottom); assert.ok(bounds.y >= headerBottom, `color panel below header: ${bounds.y} >= ${headerBottom}`); await click(page, '.draw-color-adjustment [data-close]'); assert.equal(await page.locator('.draw-color-adjustment').isVisible(), false); return { bounds, headerBottom }; }
async function openNumbers(page) { if (!await page.locator('#draw-selection-numbers').evaluate(n => n.open)) await click(page, '#draw-selection-numbers summary'); }
try {
  for (const viewport of [{ width: 1440, height: 900, label: 'default-1440x900' }, { width: 1100, height: 620, label: 'min-1100x620' }]) {
    const { context, page } = await fresh(viewport); activePage = page; activeLabel = viewport.label;
    try {
      await test('rail inventory and distinct selection icons', async () => {
        const inventory = await page.locator('#draw-desktop-tools button').evaluateAll(nodes => nodes.map(n => ({ tool: n.dataset.desktopTool, mode: n.dataset.desktopSelectionMode, command: n.dataset.desktopCommand, id: n.id, label: n.getAttribute('aria-label'), text: n.textContent.trim(), disabled: n.disabled })));
        assert.equal(inventory.filter(n => n.tool).length, 13); assert.equal(inventory.filter(n => /^(view\.|toggle\.)/.test(n.command)).length, 5);
        assert.equal(inventory.some(n => /camera|audio|カメラ|マイク|音楽/.test(`${n.label} ${n.command}`)), false);
        const icons = await page.locator('[data-desktop-tool="select"] .draw-desktop-button__icon').evaluateAll(ns => ns.map(n => n.textContent.trim() || n.innerHTML)); assert.equal(new Set(icons).size, 3);
        const history = await page.locator('#draw-undo, #draw-redo').evaluateAll(ns => ns.map(n => ({ id: n.id, ancestors: [...(function* () { for (let p = n.parentElement; p; p = p.parentElement) yield `${p.tagName.toLowerCase()}${p.id ? '#' + p.id : ''}${p.className ? '.' + String(p.className).trim().replaceAll(' ', '.') : ''}`; })()], inRail: !!n.closest('#draw-desktop-tools') })));
        assert.equal(history.length, 2); assert.equal(history.some(n => n.inRail), false);
        return { inventory, selectionIcons: icons, history };
      });
      await project(page);
      await test('single frame onion and playback disabled with explanations', async () => {
        assert.equal(await page.locator('[data-desktop-command="toggle.onion"]').isDisabled(), true); assert.match(await page.locator('[data-desktop-command="toggle.onion"]').getAttribute('title'), /2コマ/);
        assert.equal(await page.locator('#draw-animation-play').isDisabled(), true); assert.match(await page.locator('#draw-animation-play').getAttribute('aria-label'), /2コマ/); return { frames: 1, onionDisabled: true, playbackDisabled: true };
      });
      await test('pen and eraser change exactly one cell', async () => {
        await tool(page, 'pen'); await dot(page, 2, 2); assert.equal(count(await rgba(page)), 1); const pen = pixel(await rgba(page), 2, 2); assert.equal(pen[3], 255);
        await tool(page, 'eraser'); await dot(page, 2, 2); assert.equal(count(await rgba(page)), 0); return { pen, remainingOpaqueCells: 0 };
      });
      await test('picker samples a different color used by the next stroke', async () => {
        await project(page, { cells: [[4, 4, 2]] }); await tool(page, 'picker'); await dot(page, 4, 4); await tool(page, 'pen'); await dot(page, 6, 6);
        const source = pixel(await rgba(page), 4, 4), result = pixel(await rgba(page), 6, 6); assert.deepEqual(result, [231, 84, 69, 255]); assert.deepEqual(result, source); return { source, nextStroke: result };
      });
      await test('fill changes all connected transparent cells and history restores exact bytes', async () => {
        await project(page, { cells: [[2, 2]] }); const before = await rgba(page); await tool(page, 'fill'); await dot(page, 7, 7); const after = await rgba(page); assert.equal(count(after), 256); await click(page, '#draw-undo'); assert.deepEqual(await rgba(page), before); await click(page, '#draw-redo'); assert.deepEqual(await rgba(page), after); return { beforeOpaqueCells: 1, filledCells: 256, undoRedoExact: true };
      });
      for (const [name, minimum] of [['line', 7], ['rectangle', 20], ['rectangle-fill', 36], ['ellipse', 12], ['ellipse-fill', 20], ['spray', 1]]) await test(`${name} draws actual pixels`, async () => {
        await project(page); await tool(page, name); await stroke(page, name === 'line' ? [[2, 2], [8, 2]] : [[2, 2], [7, 7]]); const after = await rgba(page), painted = count(after); assert.ok(painted >= minimum, `${name} ${painted} >= ${minimum}`);
        if (name === 'rectangle') assert.equal(pixel(after, 4, 4)[3], 0); if (name === 'rectangle-fill' || name === 'ellipse-fill') assert.equal(pixel(after, 4, 4)[3], 255);
        await click(page, '#draw-undo'); assert.equal(count(await rgba(page)), 0); await click(page, '#draw-redo'); assert.deepEqual(await rgba(page), after); return { paintedCells: painted, undoRedoExact: true };
      });
      await test('contextual filled toggle changes shape pixels', async () => {
        await project(page); await tool(page, 'rectangle'); await click(page, actionButton('filled')); assert.equal(await page.locator('#draw-canvas').getAttribute('data-tool'), 'rectangle-fill'); await stroke(page, [[2, 2], [7, 7]]); assert.equal(pixel(await rgba(page), 4, 4)[3], 255); await click(page, '#draw-undo'); await click(page, actionButton('filled')); assert.equal(await page.locator('#draw-canvas').getAttribute('data-tool'), 'rectangle'); await stroke(page, [[2, 2], [7, 7]]); assert.equal(pixel(await rgba(page), 4, 4)[3], 0); return { filledCenterAlpha: 255, outlineCenterAlpha: 0 };
      });
      await test('contextual contiguous toggle changes disconnected fill behavior', async () => {
        await project(page, { cells: [[2, 2], [10, 10]] }); await tool(page, 'fill'); const currentColor = await page.evaluate(() => window.__PIXIEED_CREATION_HOST__.runtime.draw.getEditorState().inputSettings.bindings.left.color); if (currentColor !== 2) await click(page, '#draw-palette [data-color-index="2"]'); if (await page.locator(actionButton('contiguous')).getAttribute('aria-pressed') !== 'true') await click(page, actionButton('contiguous')); await dot(page, 2, 2); let after = await rgba(page); assert.deepEqual(pixel(after, 2, 2), [76, 130, 195, 255]); assert.deepEqual(pixel(after, 10, 10), [32, 64, 96, 255]); await click(page, '#draw-undo'); await click(page, actionButton('contiguous')); await dot(page, 2, 2); after = await rgba(page); assert.deepEqual(pixel(after, 10, 10), [76, 130, 195, 255]); await click(page, actionButton('contiguous')); return { adjacentChangedCells: 1, globalChangedCells: 2, restoredContiguous: true };
      });
      await test('brush native pointer click opens dialog and 3px expands stroke', async () => {
        await project(page); await tool(page, 'pen'); await stroke(page, [[2, 12], [7, 12]]); const thin = count(await rgba(page)); await click(page, '#draw-undo');
        await click(page, '.draw-desktop-features .draw-brush-size-open'); assert.equal(await page.locator('#draw-brush-settings-panel').evaluate(n => n.open), true);
        await input(page, '#draw-brush-size-value', 3); await page.waitForFunction(() => document.querySelector('[data-brush-status]')?.textContent.includes('3px')); await page.keyboard.press('Escape');
        await stroke(page, [[2, 12], [7, 12]]); const thick = count(await rgba(page)); assert.ok(thick > thin); await click(page, '.draw-desktop-features .draw-brush-size-open'); await input(page, '#draw-brush-size-value', 1); await click(page, '[data-brush-close]'); return { thinCells: thin, thickCells: thick, input: 'native pointer / keyboard' };
      });
      await test('text feature applies preview with exact Undo', async () => {
        await project(page); const before = await rgba(page); await click(page, '.draw-desktop-features .draw-text-opener'); await page.locator('.draw-text-panel textarea').fill('A');
        await page.waitForFunction(() => { const c = document.querySelector('.draw-text-panel__preview'); return c && [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].some((v, i) => i % 4 === 3 && v); });
        const preview = await rgba(page); await click(page, '.draw-text-panel form button[type="submit"]'); assert.equal(await page.locator('.draw-text-panel').isVisible(), false); assert.deepEqual(await rgba(page), preview); assert.ok(count(preview) > 0); await click(page, '#draw-undo'); assert.deepEqual(await rgba(page), before); return { glyph: 'A', appliedCells: count(preview), undoExact: true };
      });
      await test('color adjustment changes actual RGB while preserving alpha', async () => {
        await project(page, { cells: [[4, 4]] }); const before = await rgba(page); await click(page, '.draw-desktop-features .draw-color-adjustment-open'); const closeProof = await topClose(page); assert.deepEqual(await rgba(page), before); await click(page, '.draw-desktop-features .draw-color-adjustment-open'); const slider = page.locator('.draw-color-adjustment [data-setting="brightness"]'); await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight'); await page.waitForFunction(() => !document.querySelector('.draw-color-adjustment [data-apply]')?.disabled); await settle(page);
        await click(page, '.draw-color-adjustment [data-apply]'); const after = await rgba(page); assert.notDeepEqual(pixel(after, 4, 4), pixel(before, 4, 4)); assert.equal(count(after), 1); await click(page, '#draw-undo'); assert.deepEqual(await rgba(page), before); return { before: pixel(before, 4, 4), after: pixel(after, 4, 4), topClose: closeProof, undoExact: true };
      });
      await test('rectangle selection bounds and deselect preserve artwork', async () => {
        await project(page, { cells: [[4, 4], [11, 11, 2]] }); const before = await rgba(page); await selectRect(page); const bounds = await selection(page); await deselect(page); assert.deepEqual(await rgba(page), before); return { bounds, deselected: true, artworkUnchanged: true };
      });
      await test('copy paste cancel cut and paste confirm have actual effects', async () => {
        await project(page, { cells: [[4, 4], [11, 11, 2]] }); const before = await rgba(page); await selectRect(page); await click(page, actionButton('copy')); await click(page, actionButton('paste')); assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true'); await click(page, actionButton('cancel')); assert.deepEqual(await rgba(page), before);
        await click(page, actionButton('back')); await click(page, actionButton('cut')); const cut = await rgba(page); assert.equal(pixel(cut, 4, 4)[3], 0); assert.equal(pixel(cut, 11, 11)[3], 255); await click(page, '#draw-undo'); assert.deepEqual(await rgba(page), before);
        await click(page, actionButton('paste')); await openNumbers(page); await input(page, '#draw-selection-x', 3); assert.equal((await selection(page)).x, 3); await click(page, '#draw-selection-numbers summary'); await click(page, actionButton('confirm')); const after = await rgba(page); assert.equal(pixel(after, 6, 4)[3], 255); assert.equal(count(after), 3); await click(page, '#draw-undo'); assert.deepEqual(await rgba(page), before); return { cancelExact: true, cutRemovedCell: '4,4', pastedCell: '6,4', afterOpaqueCells: 3, undoExact: true };
      });
      await test('numeric selection width resizes preview and cancel restores exact pixels', async () => {
        await project(page, { cells: [[4, 4]] }); const before = await rgba(page); await selectRect(page); await openNumbers(page); await input(page, '#draw-selection-width', 5); const bounds = await selection(page); assert.equal(bounds.width, 5); assert.equal(bounds.height, 5); assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true'); await click(page, '#draw-selection-numbers summary'); await click(page, actionButton('cancel')); assert.deepEqual(await rgba(page), before); return { bounds, pending: true, cancelExact: true };
      });
      await test('lasso creates a real nonrectangular mask constraining fill', async () => {
        await project(page); await tool(page, 'select', 'lasso'); await stroke(page, [[1, 1], [10, 1], [1, 10], [1, 1]]); assert.equal(await page.locator('.draw-selection-mask').isVisible(), true); const maskPixels = count(await canvasRgba(page, '.draw-selection-mask')); assert.ok(maskPixels > 0 && maskPixels < 10 * 10 * 16); await tool(page, 'fill'); await dot(page, 3, 3); const after = await rgba(page); assert.equal(pixel(after, 3, 3)[3], 255); assert.equal(pixel(after, 9, 9)[3], 0); assert.ok(count(after) > 0 && count(after) < 100); return { overlayMaskPixels: maskPixels, selectedFilledCells: count(after), outsideTriangleAlpha: 0 };
      });
      await test('same-color mask selects disconnected matching pixels only', async () => {
        await project(page, { cells: [[2, 2], [10, 10], [6, 6, 2]] }); await tool(page, 'select', 'color'); await dot(page, 2, 2); const mask = count(await canvasRgba(page, '.draw-selection-mask')); assert.equal(mask, 2 * 16); await click(page, actionButton('cut')); const after = await rgba(page); assert.equal(pixel(after, 2, 2)[3], 0); assert.equal(pixel(after, 10, 10)[3], 0); assert.deepEqual(pixel(after, 6, 6), [231, 84, 69, 255]); return { overlayMaskPixels: mask, cutMatchingCells: 2, remainingNonmatchingCells: 1 };
      });
      await test('zoom in out and reset change actual canvas geometry', async () => {
        await project(page); const initial = await page.locator('#draw-canvas').boundingBox(); await click(page, '[data-desktop-command="view.zoomIn"]'); const zoomed = await page.locator('#draw-canvas').boundingBox(); assert.equal(await page.locator('#draw-zoom-label').textContent(), '150%'); assert.ok(Math.abs(zoomed.width / initial.width - 1.5) < .01); await click(page, '[data-desktop-command="view.zoomOut"]'); assert.equal(await page.locator('#draw-zoom-label').textContent(), '100%'); await click(page, '[data-desktop-command="view.zoomIn"]'); await click(page, '[data-desktop-command="view.reset"]'); const reset = await page.locator('#draw-canvas').boundingBox(); assert.ok(Math.abs(reset.width - initial.width) < .1); return { initial, zoomed, reset };
      });
      await test('grid toggles actual rendered overlay alpha off and on', async () => {
        const initial = count(await canvasRgba(page, '.draw-pixel-lines')); assert.ok(initial > 0); await click(page, '[data-desktop-command="toggle.grid"]'); assert.equal(count(await canvasRgba(page, '.draw-pixel-lines')), 0); assert.equal(await page.locator('#draw-grid-toggle').getAttribute('aria-pressed'), 'false'); await click(page, '[data-desktop-command="toggle.grid"]'); const restored = count(await canvasRgba(page, '.draw-pixel-lines')); assert.equal(restored, initial); assert.equal(await page.locator('[data-desktop-command="toggle.grid"]').getAttribute('aria-pressed'), 'true'); return { initialAlphaPixels: initial, offAlphaPixels: 0, restoredAlphaPixels: restored };
      });
      await test('cell launcher opens and closes the actual dialog', async () => {
        assert.equal(await page.locator('.animation-controls__workspace-panel').isVisible(), false); await click(page, '[data-desktop-cell-launcher]'); assert.equal(await page.locator('.animation-controls__workspace-panel[role="dialog"]').isVisible(), true); assert.equal(await page.locator('#draw-animation-controls [data-action="toggle-frames"]').getAttribute('aria-expanded'), 'true'); await click(page, '[data-action="close-animation"]'); assert.equal(await page.locator('.animation-controls__workspace-panel').isVisible(), false); return { dialogOpened: true, dialogClosed: true };
      });
      await test('onion shows previous AND next colors and playback hides/restores both', async () => {
        await project(page, { frames: [[[3, 3]], [[6, 6, 3]], [[9, 9, 2]]] }); const stripHits = []; for (const index of [0, 1, 2]) { const target = page.locator('#draw-desktop-frames [data-action="select-frame"]').nth(index); await click(page, target); assert.equal(await target.getAttribute('aria-selected'), 'true'); assert.equal(pixel(await rgba(page), ...[[3, 3], [6, 6], [9, 9]][index])[3], 255); stripHits.push({ frame: index + 1, box: await target.boundingBox(), centerHit: true }); } await chooseFrame(page, 1); const onion = '[data-desktop-command="toggle.onion"]'; assert.equal(await page.locator(onion).isEnabled(), true); await click(page, onion); assert.equal(await page.locator('.draw-onion').isVisible(), true);
        const before = await canvasRgba(page, '.draw-onion'); assert.deepEqual(pixel(before, 3, 3), [255, 99, 110, 95]); assert.deepEqual(pixel(before, 9, 9), [86, 185, 255, 95]);
        await click(page, '#draw-animation-play'); assert.equal(await page.locator('.draw-onion').isVisible(), false); assert.equal(await page.locator(onion).isDisabled(), true); assert.equal(await page.locator(onion).getAttribute('aria-pressed'), 'false'); assert.match(await page.locator(onion).getAttribute('title'), /再生/); await click(page, '#draw-animation-play'); await page.waitForFunction(() => !document.querySelector('.draw-onion').hidden); assert.deepEqual(await canvasRgba(page, '.draw-onion'), before); assert.equal(await page.locator(onion).isEnabled(), true); assert.equal(await page.locator(onion).getAttribute('aria-pressed'), 'true'); await chooseFrame(page, 0); const first = await canvasRgba(page, '.draw-onion'); assert.deepEqual(pixel(first, 6, 6), [86, 185, 255, 95]); assert.equal(count(first), 1); await chooseFrame(page, 2); const last = await canvasRgba(page, '.draw-onion'); assert.deepEqual(pixel(last, 6, 6), [255, 99, 110, 95]); assert.equal(count(last), 1); await click(page, onion); assert.equal(await page.locator('.draw-onion').isVisible(), false); return { frameCount: 3, desktopFrameStrip: stripHits, cellDialogFrameChoice: true, previous: pixel(before, 3, 3), next: pixel(before, 9, 9), firstFrameNext: pixel(first, 6, 6), lastFramePrevious: pixel(last, 6, 6), playbackHiddenAndDisabled: true, restoredExact: true };
      });
      await test('locked layer blocks editing and exposes truthful feature states', async () => {
        await project(page, { cells: [[4, 4]], locked: true }); const before = await rgba(page); await tool(page, 'pen'); await dot(page, 8, 8); assert.deepEqual(await rgba(page), before); assert.equal(await page.locator('.draw-brush-size-open').isDisabled(), true);
        await click(page, '.draw-text-opener'); assert.equal(await page.locator('.draw-text-panel').isVisible(), false); await click(page, '.draw-color-adjustment-open'); assert.equal(await page.locator('.draw-color-adjustment [data-apply]').isDisabled(), true); assert.match(await page.locator('.draw-color-adjustment__status').textContent(), /鍵/); const closeProof = await topClose(page); await selectRect(page); assert.equal(await page.locator(actionButton('copy')).isEnabled(), true); assert.equal(await page.locator(actionButton('cut')).isDisabled(), true); await openNumbers(page); assert.equal(await page.locator('#draw-selection-width').isDisabled(), true); await click(page, '#draw-selection-numbers summary'); await deselect(page); assert.deepEqual(await rgba(page), before); return { lockedSelectionCopyEnabled: true, cutAndNumericTransformDisabled: true, topClose: closeProof, layerLocked: true, penArtworkUnchanged: true, brushDisabled: true, textOpeningBlocked: true, colorApplyDisabledWithExplanation: true };
      });
      await test('shared camera/audio have no left rail and return retains artwork and width', async () => {
        await project(page, { cells: [[4, 4], [11, 11, 2]] }); const before = await rgba(page); const modes = [];
        for (const mode of ['camera', 'audio']) { await click(page, '#creation-mode-menu > summary'); await click(page, `button[data-creation-mode="${mode}"]`); await page.waitForFunction(mode => document.body.dataset.creationMode === mode, mode); await ready(page); assert.equal(await page.locator('#draw-desktop-tools').isVisible(), false); await click(page, '#creation-mode-menu > summary'); await click(page, 'button[data-creation-mode="draw"]'); await page.waitForFunction(() => document.body.dataset.creationMode === 'draw' && document.body.classList.contains('draw-desktop-active')); await ready(page); assert.deepEqual(await rgba(page), before); await railWidth(page, viewport.width === 1100 ? 62 : 224); modes.push({ mode, railHidden: true, returnPixelsExact: true }); } return { modes };
      });
      await test('read-only original blocks editing and onion with explanation', async () => {
        await project(page, { frames: [[[3, 3]], [[6, 6]], [[9, 9]]] }); await click(page, '[data-desktop-command="toggle.onion"]'); assert.equal(await page.locator('[data-desktop-command="toggle.onion"]').getAttribute('aria-pressed'), 'true');
        const image = { width: 513, height: 1, rgba: new Uint8Array(513 * 4) }; image.rgba.set([32, 64, 96, 255]); const bytes = await encodePxd(await putPxdImage(createPxdProject({ manifest: { title: 'Synthetic read-only original' } }), image)); await page.locator('#pxd-file-input').setInputFiles({ name: 'synthetic-read-only.pxd', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) }); await page.waitForFunction(() => document.querySelector('#draw-canvas')?.width === 513); if (await page.locator('#pxd-panel').evaluate(n => n.open)) await click(page, '#project-close'); const before = await rgba(page); await tool(page, 'pen'); await click(page, '#draw-canvas'); assert.deepEqual(await rgba(page), before); const availability = await page.locator('#draw-grid-toggle, #draw-onion-toggle, [data-desktop-command="toggle.grid"], [data-desktop-command="toggle.onion"]').evaluateAll(ns => ns.map(n => ({ id: n.id, command: n.dataset.desktopCommand, disabled: n.disabled, pressed: n.getAttribute('aria-pressed'), title: n.title }))); report.readOnlyAvailability = availability; for (const state of availability) { assert.equal(state.disabled, true); assert.equal(state.pressed, 'false'); assert.match(state.title, /原本/); } assert.equal(await page.locator('[data-desktop-command="toggle.onion"]').isDisabled(), true); assert.match(await page.locator('[data-desktop-command="toggle.onion"]').getAttribute('title'), /原本/); assert.equal(await page.locator('#draw-animation-play').isDisabled(), true); assert.equal(await page.locator('.draw-brush-size-open').isDisabled(), true); await click(page, '.draw-text-opener'); assert.equal(await page.locator('.draw-text-panel').isVisible(), false); await click(page, '.draw-color-adjustment-open'); assert.equal(await page.locator('.draw-color-adjustment [data-apply]').isDisabled(), true); assert.match(await page.locator('.draw-color-adjustment__status').textContent(), /原本/); const closeProof = await topClose(page); assert.deepEqual(await rgba(page), before); return { dimensions: [513, 1], onionDisabled: true, playbackDisabled: true, brushDisabled: true, textOpeningBlocked: true, colorApplyDisabledWithExplanation: true, originalUnchanged: true, topClose: closeProof, availability };
      });
      await project(page, { cells: [[3, 3], [4, 3], [8, 8, 2]] }); await tool(page, 'pen'); await page.locator('[data-desktop-tool="pen"]').scrollIntoViewIfNeeded(); await settle(page);
      await page.screenshot({ path: `${output}/${activeLabel}-whole-viewport.png` });
      report.viewports.push({ viewport: activeLabel, width: viewport.width, height: viewport.height, railWidth: viewport.width === 1100 ? 62 : 224, screenshot: `${activeLabel}-whole-viewport.png`, completedCases: report.cases.filter(c => c.viewport === activeLabel).length });
    } catch (error) { await page.screenshot({ path: `${output}/failure-${activeLabel}.png` }); throw error; } finally { report.mediaAttempts.push(...await page.evaluate(() => window.__mediaAttempts || [])); await context.close(); activePage = null; }
  }
  for (const viewport of [{ width: 320, height: 700 }, { width: 390, height: 844 }]) {
    const { context, page } = await fresh(viewport); activePage = page; activeLabel = `mobile-${viewport.width}`; caseName = 'color panel top-close normal and locked';
    try {
      await project(page, { cells: [[4, 4]] }); const before = await rgba(page); await click(page, '.draw-color-adjustment-open'); const normal = await topClose(page); assert.deepEqual(await rgba(page), before); await project(page, { cells: [[4, 4]], locked: true }); await click(page, '.draw-color-adjustment-open'); assert.equal(await page.locator('.draw-color-adjustment [data-apply]').isDisabled(), true); assert.match(await page.locator('.draw-color-adjustment__status').textContent(), /鍵/); const locked = await topClose(page); report.cases.push({ viewport: activeLabel, name: caseName, status: 'PASS', normal, locked }); console.log(`PASS ${activeLabel}: ${caseName}`);
    } catch (error) { await page.screenshot({ path: `${output}/failure-${activeLabel}.png` }); throw error; } finally { report.mediaAttempts.push(...await page.evaluate(() => window.__mediaAttempts || [])); await context.close(); activePage = null; }
  }
  assert.deepEqual(report.externalAttempts, []); assert.equal(report.mediaAttempts.length, 2, 'one synthetic camera denial per desktop mode round trip'); assert.ok(report.mediaAttempts.every(attempt => attempt.method === 'getUserMedia' && attempt.constraints.audio === false)); report.syntheticMediaDenials = report.mediaAttempts.length; report.realHardwareRequests = 0; assert.deepEqual(report.errors, []); report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = { viewport: activeLabel, case: caseName, stack: error.stack };
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  process.exitCode = 1; console.error(error.stack);
} finally { report.assertions = assertions; await writeFile(`${output}/results.json`, JSON.stringify(report, null, 2)); await browser.close(); }
console.log(`${report.status}: ${report.cases.length} completed cases; ${output}/results.json`);
