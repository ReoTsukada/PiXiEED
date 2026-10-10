/** Browser evidence for the Draw selection, color adjustment, and text feature slice. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { addAnimationFrame, addAnimationLayer, createAnimation, getAnimationCelDocument, writeAnimationCel } from '../js/creation/animation-core.mjs';
import { createPxdProject, decodePxd, encodePxd } from '../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../js/creation/pxd-animation.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'browser harness is restricted to the local app');
const output = process.env.PIXIEED_DRAW_FEATURES_OUTPUT || new URL('../docs/draw-features-20261010/evidence/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/tmp/pixieed-camera-playwright/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const W = 16, H = 16;
let animation = createAnimation({ width: W, height: H, palette: ['#f12b1c', '#2673dd'] });
const pixels = Array(W * H).fill(0);
for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4], [11, 10], [12, 10], [11, 11]]) pixels[y * W + x] = 1;
animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, { width: W, height: H, pixels });
animation = addAnimationLayer(animation, { name: 'Layer 2' });
animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[1].id, { width: W, height: H, pixels });
animation = addAnimationFrame(animation, { copy: false, durationMs: 140 });
const secondPixels = Array(W * H).fill(0); secondPixels[1 * W + 1] = 2;
animation = writeAnimationCel(animation, animation.frames[1].id, animation.layers[1].id, { width: W, height: H, pixels: secondPixels });
await writeFile(`${output}/source.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), animation)));
let emptyAnimation = createAnimation({ width: W, height: H, palette: ['#f12b1c', '#2673dd'] });
emptyAnimation = addAnimationLayer(emptyAnimation, { name: 'Layer 2' });
emptyAnimation = addAnimationFrame(emptyAnimation, { copy: false, durationMs: 140 });
await writeFile(`${output}/empty.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), emptyAnimation)));

const viewports = [{ width: 1280, height: 800, dpr: 1, name: 'desktop' }, { width: 390, height: 844, dpr: 3, name: 'mobile' }];
const browser = await chromium.launch({ headless: true });
const report = { base, viewports: [], status: 'PASS', limitations: ['Headless Chromium screenshots are local browser evidence, not physical device/browser validation. External origins are blocked by the harness.'], untested: [] };
let failures = 0;
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr, hasTouch: true, acceptDownloads: true });
    const page = await context.newPage(), checks = [], errors = [], consoleErrors = [], fontRequests = [];
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/assets/fonts/')) fontRequests.push(new URL(request.url()).pathname); });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main')?.inert); }
    catch (error) {
      await page.screenshot({ path: `${output}/${viewport.name}-draw-features-startup-failure.png`, fullPage: true }).catch(() => {});
      const state = await page.evaluate(() => ({ ready: document.documentElement.dataset.drawReady, mainInert: document.querySelector('#main')?.inert,
        mainHidden: document.querySelector('#main')?.hidden, canvas: Boolean(document.querySelector('#draw-canvas')),
        scripts: [...document.scripts].map(script => script.src), status: document.querySelector('#draw-status')?.textContent }));
      throw new Error(`${error.message}; browserErrors=${errors.join(' | ')}; title=${await page.title()}; state=${JSON.stringify(state)}`);
    }

    const box = async () => page.locator('#draw-canvas').boundingBox();
    const point = async (x, y) => { const r = await box(); return { x: r.x + (x + .5) * r.width / W, y: r.y + (y + .5) * r.height / H }; };
    const drag = async (a, b, { steps = 5, outside = false } = {}) => {
      const p = outside ? a : await point(...a), q = outside ? b : await point(...b);
      await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps }); await page.mouse.up(); await page.waitForTimeout(70);
    };
    const dragPath = async path => {
      const points = await Promise.all(path.map(([x, y]) => point(x, y)));
      await page.mouse.move(points[0].x, points[0].y); await page.mouse.down();
      for (const next of points.slice(1)) await page.mouse.move(next.x, next.y, { steps: 2 });
      await page.mouse.up(); await page.waitForTimeout(70);
    };
    const tap = async (x, y) => { const p = await point(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(50); };
    const rgba = async () => page.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
    const changedCells = (before, after) => {
      const changed = [];
      for (let i = 0; i < before.length; i += 4) if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2] || before[i + 3] !== after[i + 3]) changed.push(i / 4);
      return changed;
    };
    const savedPxdRoundTrip = async () => {
      await page.locator('#project-open').click(); await page.locator('#project-tab-current').click();
      await page.waitForFunction(() => document.querySelector('#project-current-pane')?.hidden === false);
      await page.locator('.project-more').evaluate(node => { node.open = true; });
      await page.locator('#pxd-save').evaluate(node => node.click());
      await page.waitForFunction(() => document.querySelector('#pxd-file-status')?.textContent.includes('保存'));
      if (await page.locator('#pxd-panel').evaluate(node => node.open)) await page.locator('#project-close').click();
      const serialized = await page.evaluate(async () => {
        const params = new URLSearchParams(location.search), projectId = params.get('pxd'), revisionId = params.get('pxdRevision');
        if (!projectId || !revisionId) throw new Error('PXD save did not publish a project revision pointer.');
        const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
        const { encodePxd } = await import('/js/creation/pxd-codec.mjs');
        return [...await encodePxd(await createToolProjectStore('draw').load(projectId, revisionId))];
      });
      const project = await decodePxd(Uint8Array.from(serialized));
      if (!(await page.locator('#pxd-export').count())) {
        const note = 'Downloadable PXD file export: current Draw project workspace has local PXD save/import but no downloadable PXD export control.';
        if (!report.untested.includes(note)) report.untested.push(note);
      }
      return { project, animation: await readPxdAnimation(project) };
    };
    const undoRedo = async (original, edited) => {
      await page.locator('#draw-canvas').focus(); const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+z`); await page.waitForTimeout(80); assert.deepEqual(await rgba(), original, 'one undo restores the exact pre-edit pixels');
      await page.keyboard.press(`${modifier}+Shift+z`); await page.waitForTimeout(80); assert.deepEqual(await rgba(), edited, 'one redo restores the exact edited pixels');
    };
    const mask = async () => page.locator('.draw-selection-mask').evaluate(canvas => {
      if (canvas.hidden) {
        const frame = document.querySelector('.draw-selection'); if (frame.hidden) return null;
        const x = Number(frame.dataset.x), y = Number(frame.dataset.y), width = Number(frame.dataset.width), height = Number(frame.dataset.height), result = [];
        for (let cy = Math.max(0, Math.floor(y)); cy < Math.min(16, Math.ceil(y + height)); cy++) for (let cx = Math.max(0, Math.floor(x)); cx < Math.min(16, Math.ceil(x + width)); cx++) result.push(`${cx},${cy}`);
        return result;
      }
      const { width, height } = canvas, d = canvas.getContext('2d').getImageData(0, 0, width, height).data, result = [];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (d[((y * 4 + 1) * width + x * 4 + 1) * 4 + 3] > 0) result.push(`${x},${y}`);
      return result;
    });
    const openTools = async () => { const details = page.locator('#draw-tool-picker'); if (!await details.evaluate(n => n.open)) await page.locator('#draw-tool-summary').click(); };
    const setMode = async mode => { await openTools(); await page.locator(`.draw-select-tool-modes [data-selection-mode="${mode}"]`).click(); await page.waitForFunction(v => document.querySelector(`.draw-select-tool-modes [data-selection-mode="${v}"]`)?.getAttribute('aria-pressed') === 'true', mode); };
    const setTool = async tool => { await openTools(); await page.locator(`.draw-tool-menu [data-draw-tool="${tool}"]:not([data-selection-mode])`).click(); await page.waitForFunction(v => document.querySelector('#draw-canvas')?.dataset.tool === v, tool); };
    const loadFixture = async () => {
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main')?.inert);
      await page.locator('#project-open').click(); await page.locator('#project-tab-library').click();
      await page.locator('#pxd-file-input').setInputFiles(`${output}/source.pxd`);
      await page.waitForFunction(() => !document.querySelector('#main')?.inert && document.querySelectorAll('#draw-palette [data-color-index]').length === 3);
      if (await page.locator('#pxd-panel').evaluate(n => n.open)) await page.locator('#project-close').click();
      await page.locator('.draw-feature-actions [data-selection-action="deselect"]').click();
    };
    const selectRectangle = async () => { await page.locator('#draw-canvas').focus(); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await setMode('rectangle'); await drag([2, 2], [5, 5]); };
    const group = async (name, fn) => {
      try { await loadFixture(); await fn(); checks.push(name); }
      catch (error) {
        const details = await page.evaluate(() => ({
          status: document.querySelector('#draw-status')?.textContent,
          selection: { mode: document.querySelector('#draw-selection-controls')?.dataset.mode, pending: document.querySelector('#draw-selection-controls')?.dataset.pending,
            frame: document.querySelector('.draw-selection')?.dataset },
          color: document.querySelector('.draw-color-adjustment__status')?.textContent,
          text: document.querySelector('.draw-text-panel__status')?.textContent,
          openPanels: [...document.querySelectorAll('[role="dialog"]:not([hidden])')].map(node => node.getAttribute('aria-label')),
        }));
        failures += 1; report.status = 'FAIL'; report.viewports.push({ name: viewport.name, failed: name, error: error.message, details });
        await page.screenshot({ path: `${output}/${viewport.name}-${name.replace(/[^a-z0-9]+/gi, '-')}-failure.png`, fullPage: true }).catch(() => {});
        await page.keyboard.press('Escape').catch(() => {}); await page.keyboard.press('Escape').catch(() => {});
      }
    };

    await group('fixed confirm action is reachable on empty and full-canvas masks', async () => {
      await setMode('rectangle');
      const controls = page.locator('#draw-selection-controls'), confirm = page.locator('.draw-feature-actions [data-selection-action="deselect"]');
      assert.ok(await confirm.isVisible());
      const controlBox = await controls.boundingBox(); assert.ok(controlBox && controlBox.x >= 0 && controlBox.y >= 0 && controlBox.x + controlBox.width <= viewport.width && controlBox.y + controlBox.height <= viewport.height);
      const actionButtons = page.locator('.draw-feature-actions button'); assert.equal(await actionButtons.count(), 3);
      const actionBoxes = await actionButtons.evaluateAll(nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; }));
      assert.ok(actionBoxes.every(r => r.width >= 44 && r.height >= 44 && r.x >= 0 && r.y >= 0 && r.right <= viewport.width && r.bottom <= viewport.height), JSON.stringify(actionBoxes));
      await confirm.click(); assert.equal(await mask(), null);
      await page.locator('#project-open').click(); await page.locator('#project-tab-library').click();
      await page.locator('#pxd-file-input').setInputFiles(`${output}/empty.pxd`);
      await page.waitForFunction(() => !document.querySelector('#main')?.inert && document.querySelectorAll('#draw-palette [data-color-index]').length === 3);
      if (await page.locator('#pxd-panel').evaluate(n => n.open)) await page.locator('#project-close').click();
      await setMode('rectangle');
      await drag([0, 0], [15, 15]); assert.equal((await mask()).length, 256);
      assert.ok(await confirm.isVisible());
      await confirm.click(); assert.equal(await mask(), null);
      await loadFixture(); await setMode('rectangle'); await drag([0, 0], [15, 15]);
      const moveHandle = page.locator('.draw-selection__move'); assert.ok(await moveHandle.isVisible());
      const handleBox = await moveHandle.boundingBox(), boardBox = await page.locator('.draw-board').boundingBox();
      assert.ok(handleBox && boardBox && handleBox.x >= boardBox.x && handleBox.y >= boardBox.y && handleBox.x + handleBox.width <= boardBox.x + boardBox.width && handleBox.y + handleBox.height <= boardBox.y + boardBox.height, JSON.stringify({ handleBox, boardBox }));
      await confirm.click(); assert.equal(await mask(), null);
    });
    await group('lasso unions disconnected masks and Shift/Control/Meta modifiers add and subtract', async () => {
      await setMode('lasso'); await dragPath([[2, 2], [7, 3], [5, 7], [2, 2]]);
      let selected = await mask(); assert.ok(selected.includes('3,3') && selected.includes('4,4'));
      assert.ok(!selected.includes('6,6'), 'the polygonal lasso leaves cells outside its irregular edge unselected');
      await page.keyboard.down('Shift'); await dragPath([[10, 9], [14, 10], [12, 13], [10, 9]]); await page.keyboard.up('Shift');
      selected = await mask(); assert.ok(selected.includes('3,3') && selected.includes('11,10'));
      await page.keyboard.down('Control'); await dragPath([[10, 9], [14, 10], [12, 13], [10, 9]]); await page.keyboard.up('Control');
      selected = await mask(); assert.ok(selected.includes('3,3') && !selected.includes('11,10'));
      await page.keyboard.down('Shift'); await dragPath([[10, 9], [14, 10], [12, 13], [10, 9]]); await page.keyboard.up('Shift');
      await page.keyboard.down('Meta'); await dragPath([[10, 9], [14, 10], [12, 13], [10, 9]]); await page.keyboard.up('Meta');
      selected = await mask(); assert.ok(selected.includes('3,3') && !selected.includes('11,10'));
    });
    await group('outside touch tap clears; outside drag adds without a modifier', async () => {
      await selectRectangle();
      const outsideStart = await point(12, 12), outsideEnd = await point(14, 14);
      const cdp = await context.newCDPSession(page), touchPoint = (id, p) => ({ id, ...p, radiusX: 1, radiusY: 1, force: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(21, outsideStart)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint(21, outsideEnd)] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(80);
      const union = await mask(); assert.ok(union.includes('3,3') && union.includes('12,12'));
      const q = await point(15, 0);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...q, radiusX: 1, radiusY: 1, force: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(80);
      assert.equal(await mask(), null);
    });
    await group('color-selection touch tap outside clears after its threshold is passed', async () => {
      await setMode('color'); await tap(3, 3); const colorMask = await mask();
      assert.ok(colorMask?.includes('3,3') && colorMask.includes('4,4'));
      const cdp = await context.newCDPSession(page), target = await point(15, 15), touchPoint = { ...target, id: 29, radiusX: 1, radiusY: 1, force: 1 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(80);
      assert.equal(await mask(), null);
    });
    await group('confirming a moved selection commits the pixels and clears its mask as one undoable action', async () => {
      await selectRectangle(); const original = await rgba();
      const p = await point(3, 3), q = await point(8, 8);
      await page.keyboard.down('Alt'); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Alt');
      const controls = page.locator('#draw-selection-controls'); assert.equal(await controls.getAttribute('data-pending'), 'true');
      await page.locator('.draw-feature-actions [data-selection-action="deselect"]').click();
      assert.equal(await mask(), null); const moved = await rgba(); assert.notDeepEqual(moved, original);
      await page.locator('#draw-canvas').focus(); await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`); await page.waitForTimeout(80); assert.deepEqual(await rgba(), original);
      await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+Shift+z`); await page.waitForTimeout(80); assert.deepEqual(await rgba(), moved);
    });
    await group('touch and Shift lasso add to a pending moved polygon, with one pixel undo', async () => {
      await setMode('lasso'); await dragPath([[2, 2], [7, 3], [5, 7], [2, 2]]);
      const original = await rgba(), priorMask = await mask(); assert.ok(priorMask.length > 0);
      const from = await point(3, 3), to = await point(5, 5);
      await page.keyboard.down('Alt'); await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Alt');
      assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true');
      const cdp = await context.newCDPSession(page), dispatch = async points => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] }); await page.waitForTimeout(25);
        for (const p of points.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] }); await page.waitForTimeout(25); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(80);
      };
      const lassoPoints = async path => Promise.all(path.map(([x, y]) => point(x, y).then(p => ({ id: 70, ...p, radiusX: 1, radiusY: 1, force: 1 }))));
      await dispatch(await lassoPoints([[12, 1], [15, 2], [14, 6], [12, 1]]));
      const touchMask = await mask(); assert.ok(touchMask.length > priorMask.length && touchMask.includes('5,5') && touchMask.includes('14,3'), 'touch lasso commits the transform, preserves a moved cell, and adds its triangle');
      assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'false');
      await setMode('lasso'); await page.keyboard.down('Shift'); await dragPath([[1, 12], [4, 13], [2, 15], [1, 12]]); await page.keyboard.up('Shift');
      const shiftedMask = await mask(); assert.ok(shiftedMask.includes('5,5') && shiftedMask.includes('2,13'), 'Shift lasso preserves the moved selection and adds a distant triangle');
      await page.locator('.draw-feature-actions [data-selection-action="deselect"]').click();
      const edited = await rgba(); assert.notDeepEqual(edited, original, 'the pending selection transform commits with the additive lasso');
      await page.locator('#draw-canvas').focus(); const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.press(`${modifier}+z`); await page.waitForTimeout(80);
      assert.deepEqual(await rgba(), original, 'selection transforms enter pixel history once; additive lasso drags add no extra undo');
    });
    await group('virtual cursor selects lasso cells and canceled pointer restores the previous mask', async () => {
      await setMode('lasso'); await dragPath([[2, 2], [6, 3], [5, 7], [2, 2]]); const before = await mask();
      const pointA = await point(10, 9), pointB = await point(13, 12);
      await page.evaluate(({ a, b }) => {
        const canvas = document.querySelector('#draw-canvas'), capture = canvas.setPointerCapture; canvas.setPointerCapture = () => {};
        const send = (type, p, buttons) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', pointerId: 9701, button: 0, buttons, clientX: p.x, clientY: p.y, shiftKey: true }));
        try { send('pointerdown', a, 1); send('pointermove', b, 1); send('pointercancel', b, 0); } finally { canvas.setPointerCapture = capture; }
      }, { a: pointA, b: pointB });
      assert.deepEqual(await mask(), before);
      await page.locator('#draw-settings-summary').click();
      await page.locator('#draw-virtual-toggle').click();
      await page.keyboard.press('Escape');
      assert.ok(await page.locator('.draw-virtual-marker').isVisible());
      await page.locator('.draw-feature-actions [data-selection-action="deselect"]').click();
      const cdp = await context.newCDPSession(page), active = new Map();
      const dispatch = async (type, points = []) => {
        let current = points;
        if (type === 'touchStart' || type === 'touchMove') for (const p of points) active.set(p.id, p);
        else if (type === 'touchEnd') { current = points.length ? points : [...active.values()]; for (const p of current) active.delete(p.id); }
        await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: current }); await page.waitForTimeout(35);
      };
      const board = await page.locator('.draw-board').boundingBox(), button = await page.locator('[data-virtual-left]').boundingBox();
      const padStart = { id: 41, x: board.x + board.width / 2, y: board.y + board.height / 2, radiusX: 1, radiusY: 1, force: 1 };
      const press = { id: 42, x: button.x + button.width / 2, y: button.y + button.height / 2, radiusX: 1, radiusY: 1, force: 1 };
      await dispatch('touchStart', [padStart]); await dispatch('touchStart', [padStart, press]);
      await dispatch('touchMove', [{ ...padStart, x: padStart.x + 48, y: padStart.y + 48 }, press]);
      await dispatch('touchEnd', [press]); await dispatch('touchEnd', []);
      assert.ok((await mask())?.length > 0, 'virtual cursor button plus floating pad draws an additive lasso selection');
    });
    await group('offscreen raw pointer delta keeps the move pending and pinch zoom leaves artwork unchanged', async () => {
      await selectRectangle(); const original = await rgba();
      const handle = await page.locator('.draw-selection__move').boundingBox(), r = await box(); assert.ok(handle);
      const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }, outside = { x: r.x + r.width + 36, y: from.y };
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(outside.x, outside.y, { steps: 8 }); await page.mouse.up();
      assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true');
      assert.notDeepEqual(await mask(), null); await page.keyboard.press('Escape'); assert.deepEqual(await rgba(), original);
      const beforePinch = await rgba(), cdp = await context.newCDPSession(page), a = await point(6, 6), b = await point(10, 10);
      const touch = async (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: touchPoints.map(p => ({ ...p, radiusX: 2, radiusY: 2, force: 1 })) });
      await touch('touchStart', [a]); await touch('touchStart', [a, b]);
      await touch('touchMove', [{ x: a.x - 24, y: a.y - 24 }, { x: b.x + 24, y: b.y + 24 }]);
      await touch('touchEnd', [{ x: a.x - 24, y: a.y - 24 }]); await touch('touchEnd', []); await page.waitForTimeout(100);
      assert.deepEqual(await rgba(), beforePinch, 'pinch viewport gesture must not alter indexed pixels');
    });
    await group('color adjustment selection preview cancels exactly, applies once, undoes/redoes, and round-trips saved PXD', async () => {
      await page.locator('#draw-canvas').focus(); await setMode('rectangle'); await drag([1, 1], [7, 7]); const original = await rgba(), originalMask = await mask();
      await page.locator('.draw-color-adjustment-open').click(); const panel = page.locator('.draw-color-adjustment');
      assert.ok(await panel.isVisible());
      const brightness = panel.locator('[data-setting="brightness"]');
      assert.ok(await panel.locator('[data-color-preview]').isVisible(), 'color adjustment shows a current-cel preview thumbnail');
      await brightness.evaluate(node => { node.value = '60'; node.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => document.querySelector('.draw-color-adjustment [data-apply]')?.disabled === false);
      const preview = await rgba(), changed = changedCells(original, preview); assert.ok(changed.length > 0);
      const selectedSet = new Set(originalMask.map(cell => { const [x, y] = cell.split(',').map(Number); return y * 16 + x; }));
      assert.ok(changed.every(index => selectedSet.has(index)), 'selected-cel preview leaves pixels outside the mask byte-for-byte unchanged');
      await panel.locator('[data-cancel]').click(); assert.deepEqual(await rgba(), original, 'cancel removes the detached preview exactly');
      await page.locator('.draw-color-adjustment-open').click();
      await panel.locator('[data-setting="brightness"]').evaluate(node => { node.value = '60'; node.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => document.querySelector('.draw-color-adjustment [data-apply]')?.disabled === false);
      await panel.locator('[data-apply]').click(); await page.waitForTimeout(80);
      const applied = await rgba(); assert.notDeepEqual(applied, original); await undoRedo(original, applied);
      const exported = await savedPxdRoundTrip();
      if (exported) { assert.equal(exported.animation.width, 16); assert.equal(exported.animation.height, 16); assert.notDeepEqual(exported.animation.palette, animation.palette, 'PXD export stores adjusted palette colors'); }
      checks.push('exact palette change survives one-undo/redo and saved-PXD round-trip');
    });
    await group('color adjustment can apply across every existing frame and layer', async () => {
      const original = await rgba(); await page.locator('.draw-color-adjustment-open').click(); const panel = page.locator('.draw-color-adjustment');
      await panel.locator('input[name="draw-color-scope"][value="whole"]').check();
      await panel.locator('[data-setting="brightness"]').evaluate(node => { node.value = '35'; node.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => document.querySelector('.draw-color-adjustment [data-apply]')?.disabled === false);
      const preview = await rgba(); assert.notDeepEqual(preview, original);
      await panel.locator('[data-cancel]').click(); assert.deepEqual(await rgba(), original, 'whole-animation cancel restores the current cel exactly');
      await page.locator('.draw-color-adjustment-open').click();
      await panel.locator('input[name="draw-color-scope"][value="whole"]').check();
      await panel.locator('[data-setting="brightness"]').evaluate(node => { node.value = '35'; node.dispatchEvent(new Event('input', { bubbles: true })); });
      await page.waitForFunction(() => document.querySelector('.draw-color-adjustment [data-apply]')?.disabled === false);
      await panel.locator('[data-apply]').click(); await page.waitForTimeout(80); const applied = await rgba();
      assert.notDeepEqual(applied, original); await undoRedo(original, applied);
      const exported = await savedPxdRoundTrip();
      if (exported) {
        const saved = exported.animation; assert.equal(saved.frames.length, 2); assert.equal(saved.layers.length, 2);
        assert.notDeepEqual(saved.palette, animation.palette);
        const baselineCel = getAnimationCelDocument(animation, animation.frames[0].id, animation.layers[0].id);
        const outputCel = getAnimationCelDocument(saved, saved.frames[0].id, saved.layers[0].id);
        const laterCel = getAnimationCelDocument(saved, saved.frames[1].id, saved.layers[1].id);
        assert.deepEqual(outputCel.pixels, baselineCel.pixels, 'whole-animation adjustment rewrites the shared palette, not indexed pixels');
        assert.ok(laterCel.pixels.some(Boolean), 'the later frame/layer cel survives PXD export');
      }
      await page.locator('#draw-canvas').focus();
      if (!await page.locator('#draw-output').evaluate(node => node.open)) await page.locator('#draw-output summary').click();
      await page.locator('#draw-save').click(); await page.waitForFunction(() => document.querySelector('#draw-status')?.textContent.includes('保存'));
    });
    await group('Japanese text system fallback, lazy font, clipping, binary edge coverage, cancel/apply, undo/redo, and saved-PXD round-trip', async () => {
      await setMode('rectangle'); await drag([0, 0], [5, 12]); const original = await rgba(), selectedMask = await mask();
      await page.locator('.draw-text-opener').click(); const panel = page.locator('.draw-text-panel');
      const text = panel.locator('textarea[aria-label="描画する文字"]'); await text.fill('日本');
      await panel.locator('select[aria-label="書体"]').selectOption('sans');
      assert.equal(fontRequests.length, 0, 'the bundled decorative fonts are not fetched for the system fallback');
      await panel.locator('input[aria-label="文字の大きさ"]').fill('12');
      await panel.locator('input[aria-label="文字のX位置"]').fill('0'); await panel.locator('input[aria-label="文字のY位置"]').fill('0');
      await panel.locator('select[aria-label="文字の色"]').selectOption('0');
      await page.waitForFunction(() => document.querySelector('.draw-text-panel__preview')?.width === 16);
      await page.waitForFunction(() => document.querySelector('.draw-text-panel__status')?.textContent.includes('プレビュー'));
      let previewAlpha = await panel.locator('.draw-text-panel__preview').evaluate(canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        return [...new Set(Array.from({ length: data.length / 4 }, (_, i) => data[i * 4 + 3]))].sort((a, b) => a - b);
      });
      assert.ok(previewAlpha.includes(0) && previewAlpha.some(value => value > 0), 'Japanese system-font preview draws within the canvas');
      assert.ok(previewAlpha.every(value => value === 0 || value === 255), 'single indexed text color has binary alpha coverage');
      await page.getByRole('button', { name: 'キャンセル' }).click(); assert.deepEqual(await rgba(), original, 'cancel restores exact source pixels');
      await page.locator('.draw-text-opener').click(); const activePanel = page.locator('.draw-text-panel');
      await activePanel.locator('textarea[aria-label="描画する文字"]').fill('日本');
      await activePanel.locator('select[aria-label="書体"]').selectOption('dotgothic');
      await activePanel.locator('input[aria-label="文字の大きさ"]').fill('12');
      await activePanel.locator('input[aria-label="文字のX位置"]').fill('0'); await activePanel.locator('input[aria-label="文字のY位置"]').fill('0');
      await activePanel.locator('select[aria-label="文字の色"]').selectOption('0');
      await page.waitForFunction(() => document.fonts.check('12px "PiXiEED DotGothic16"'), null, { timeout: 10000 });
      assert.ok(fontRequests.some(path => path.includes('/DotGothic16/')), `selecting the local font lazily fetches its licensed asset: ${fontRequests.join(', ')}`);
      await page.waitForTimeout(100); const preview = await rgba(), touched = changedCells(original, preview);
      const allowed = new Set(selectedMask.map(cell => { const [x, y] = cell.split(',').map(Number); return y * 16 + x; }));
      assert.ok(touched.length > 0); assert.ok(touched.every(index => allowed.has(index)), 'text preview clips to the existing selection');
      await activePanel.getByRole('button', { name: '適用' }).click(); await page.waitForTimeout(80); const applied = await rgba();
      assert.notDeepEqual(applied, original); await undoRedo(original, applied);
      const exported = await savedPxdRoundTrip();
      if (exported) {
        const activeFrame = exported.animation.frames[0], activeLayer = exported.animation.layers[1];
        const exportedCel = getAnimationCelDocument(exported.animation, activeFrame.id, activeLayer.id);
        const baselineCel = getAnimationCelDocument(animation, animation.frames[0].id, animation.layers[1].id);
        assert.equal(exportedCel.width, 16); assert.ok(exportedCel.pixels.some(Boolean), 'text pixels are stored in exported PXD');
        assert.notDeepEqual(exportedCel.pixels, baselineCel.pixels, 'exported active layer includes the newly rasterized Japanese text');
      }
    });

    await page.screenshot({ path: `${output}/${viewport.name}-draw-features.png`, fullPage: true });
    report.viewports.push({ name: viewport.name, viewport: { width: viewport.width, height: viewport.height, dpr: viewport.dpr }, checks, pageErrors: errors, consoleErrors });
    if (errors.length) { failures += errors.length; report.status = 'FAIL'; }
    await context.close();
  }
} finally { await browser.close(); }
if (report.viewports.some(item => item.name && item.pageErrors?.length)) report.status = 'FAIL';
if (failures) report.status = 'FAIL';
if (report.untested.length && report.status === 'PASS') report.status = 'PARTIAL';
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.status === 'FAIL') process.exitCode = 1;
