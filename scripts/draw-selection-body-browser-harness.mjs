#!/usr/bin/env node
/** Regression checks for dragging a selection body without requiring Alt. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  addAnimationFrame, addAnimationLayer, createAnimation, writeAnimationCel,
} from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'selection QA is restricted to localhost');
const output = process.env.PIXIEED_SELECTION_BODY_OUTPUT || '/tmp/pixieed-draw-selection-body';
await mkdir(output, { recursive: true });
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(runtime).href);

const width = 16, height = 16;
let animation = createAnimation({ width, height, palette: ['#263238', '#e75445', '#4c82c3'] });
const artId = animation.layers[0].id;
const pixelsA = Array(width * height).fill(0);
for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3], [4, 3], [5, 3], [3, 4], [10, 10], [11, 10], [10, 11]]) pixelsA[y * width + x] = 1;
for (const [x, y] of [[12, 4], [13, 4], [12, 5]]) pixelsA[y * width + x] = 2;
animation = writeAnimationCel(animation, animation.frames[0].id, artId, { width, height, pixels: pixelsA });
const top = addAnimationLayer(animation, { name: 'QA top' });
const topId = top.layers.at(-1).id;
const pixelsTop = Array(width * height).fill(0);
for (const [x, y] of [[7, 12], [8, 12], [7, 13]]) pixelsTop[y * width + x] = 2;
animation = writeAnimationCel(top, top.frames[0].id, topId, { width, height, pixels: pixelsTop });
const second = addAnimationFrame(animation, { sourceFrameId: animation.frames[0].id, durationMs: 240 });
const pixelsB = Array(width * height).fill(0);
for (const [x, y] of [[1, 12], [2, 12], [1, 13], [2, 13], [12, 10]]) pixelsB[y * width + x] = 2;
animation = writeAnimationCel(second, second.frames[1].id, artId, { width, height, pixels: pixelsB });
const pxdPath = join(output, 'selection-body-fixture.pxd');
await writeFile(pxdPath, await encodePxd(await writePxdAnimation(createPxdProject(), animation)));
const sourcePxdHash = createHash('sha256').update(await readFile(pxdPath)).digest('hex');

const browser = await chromium.launch({ headless: true });
const report = { base, engine: browser.version(), externalRequests: 'blocked', realDeviceTouch: 'UNTESTED (CDP synthetic touch only)', cameraPermissions: 'denied by harness; never granted', viewports: [], failures: [] };
const pixelHash = values => {
  let hash = 2166136261;
  for (const value of values) hash = Math.imul(hash ^ value, 16777619) >>> 0;
  return hash.toString(16).padStart(8, '0');
};

try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 600 ? 3 : 1, hasTouch: true });
    const checks = [], errors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname === '/js/creation/draw-page.mjs') {
        const response = await route.fetch();
        const source = await response.text();
        const marker = 'return {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,';
        assert.ok(source.includes(marker), 'draw-page return API marker is present');
        let injected = source.replace(marker, `window.__bodySelectionTrace = [];\nconst bodyTrace = event => window.__bodySelectionTrace.push({ type: event.type, pointerId: event.pointerId, pointerType: event.pointerType, virtual: Boolean(event.virtual), dragMode: selectionDrag?.mode || null, handle: selectionDrag?.handle || null });\nfor (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) canvas.addEventListener(type, bodyTrace);\nreturn window.__bodyDraw = {\n  getSelectionQA() { return {\n    selection: selection ? { x: selection.x, y: selection.y, width: selection.width, height: selection.height, mask: selection.mask ? Array.from(selection.mask) : null } : null,\n    pending: Boolean(selectionTransform), dragMode: selectionDrag?.mode || null, pendingTapMode,\n    frameId: animationSession.frameId, layerId: animationSession.layerId, tool: inputSettings.bindings[lastInputSide]?.tool, mode: selectedMode(lastInputSide),\n    locked: animationSession.locked, canEdit: canEdit(), selectionHasPixels: selectionHasPixels(),\n  }; },\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,`);
        injected = injected.replace('onDown: handleCanvasPointerDown, onMove: handleCanvasPointerMove, onRelease: releasePointer, onStateChange: updateControls,',
          `onDown: event => { bodyTrace({ ...event, type: 'virtual-pointerdown' }); handleCanvasPointerDown(event); }, onMove: event => { bodyTrace({ ...event, type: 'virtual-pointermove' }); handleCanvasPointerMove(event); }, onRelease: event => { bodyTrace({ ...event, type: 'virtual-pointerup' }); releasePointer(event); }, onStateChange: updateControls,`);
        return route.fulfill({ response, body: injected });
      }
      return route.continue();
    });
    await context.addInitScript(() => {
      window.__selectionBodyMediaRequests = 0;
      if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => { window.__selectionBodyMediaRequests++; throw new DOMException('QA denies device access', 'NotAllowedError'); } });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const record = name => checks.push(name);
    const ready = () => page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true' && !document.querySelector('#main')?.inert);
    const state = () => page.evaluate(() => window.__bodyDraw.getSelectionQA());
    const art = () => page.evaluate(async () => {
      const draw = window.__bodyDraw, t = draw.getTimeline();
      const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs');
      return { frameId: draw.getEditorState().frameId, layerId: draw.getEditorState().layerId,
        frames: t.frames.map(frame => ({ id: frame.id, durationMs: frame.durationMs })),
        layers: t.layers.map(layer => ({ id: layer.id, name: layer.name, role: layer.role, visible: layer.visible, locked: layer.locked })),
        cels: t.frames.flatMap(frame => t.layers.map(layer => ({ frameId: frame.id, layerId: layer.id, pixels: [...getAnimationCelDocument(t, frame.id, layer.id).pixels] }))) };
    });
    const image = () => page.evaluate(() => [...window.__bodyDraw.getImage().rgba]);
    const mask = () => state().then(s => {
      if (!s.selection) return null;
      if (s.selection.mask) return s.selection.mask;
      const result = new Array(width * height).fill(0);
      for (let y = Math.max(0, Math.floor(s.selection.y)); y < Math.min(height, Math.ceil(s.selection.y + s.selection.height)); y++)
        for (let x = Math.max(0, Math.floor(s.selection.x)); x < Math.min(width, Math.ceil(s.selection.x + s.selection.width)); x++) result[y * width + x] = 1;
      return result;
    });
    let fixtureArt = null;
    const canvasPoint = async (x, y) => {
      const r = await page.locator('#draw-canvas').boundingBox();
      return { x: r.x + (x + .5) * r.width / width, y: r.y + (y + .5) * r.height / height };
    };
    const mouseDrag = async (from, to, { modifiers = [] } = {}) => {
      const a = await canvasPoint(...from), b = await canvasPoint(...to);
      if (modifiers.length) await page.keyboard.down(modifiers[0]);
      await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
      if (modifiers.length) await page.keyboard.up(modifiers[0]);
      await page.waitForTimeout(80);
    };
    const touchDrag = async (from, to, id = 1) => {
      const cdp = await context.newCDPSession(page), a = await canvasPoint(...from), b = await canvasPoint(...to);
      const touch = p => ({ id, x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(a)] });
      for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch({ x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 })] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); await page.waitForTimeout(100);
    };
    const chooseTool = async (tool, mode = null) => {
      const picker = page.locator('#draw-tool-picker');
      if (!await picker.evaluate(node => node.open)) await page.locator('#draw-tool-summary').click();
      const selector = mode ? `.draw-select-tool-modes [data-selection-mode="${mode}"]` : `[data-draw-tool="${tool}"]`;
      await page.locator(selector).first().click(); await page.keyboard.press('Escape');
      await page.waitForFunction(({ tool, mode }) => {
        const s = window.__bodyDraw.getSelectionQA(); return s.tool === tool && (!mode || s.mode === mode);
      }, { tool, mode });
    };
    const clearSelectionUI = async () => {
      if ((await state()).pending) { await page.keyboard.press('Escape'); await page.waitForTimeout(60); }
      if ((await state()).selection) {
        const button = page.locator('.draw-selection-controls__deselect').first();
        await button.click(); await page.waitForFunction(() => window.__bodyDraw.getSelectionQA().selection === null);
      }
    };
    const loadFixture = async () => {
      await page.locator('#project-open').click(); await page.locator('#project-tab-library').click();
      const imports = page.locator('.project-imports'); if (!await imports.evaluate(node => node.open)) await imports.locator(':scope > summary').click();
      await page.locator('#pxd-file-input').setInputFiles(pxdPath);
      await page.waitForFunction(() => {
        const t = window.__bodyDraw.getTimeline();
        return t.frames.length === 2 && t.layers.filter(layer => layer.role !== 'music').length === 2;
      });
      if (await page.locator('#pxd-panel').evaluate(node => node.open)) await page.locator('#project-close').click();
      await page.waitForFunction(() => !document.querySelector('#main')?.inert);
      // Explicitly select the fixture's art cel; music layers or remembered role cannot become the target.
      await page.evaluate(async () => {
        const draw = window.__bodyDraw, t = draw.getTimeline();
        const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs');
        const frameId = draw.getEditorState().frameId;
        const layer = t.layers.find(item => item.role !== 'music' && getAnimationCelDocument(t, frameId, item.id).pixels.some(value => value > 0));
        if (!layer) throw new Error('fixture has no populated art cel');
        draw.selectArtLayer(layer.id);
      });
      await page.waitForTimeout(50);
    };
    const selectRectangle = async () => { await clearSelectionUI(); await chooseTool('select', 'rectangle'); await mouseDrag([1, 1], [6, 6]); assert.ok((await state()).selection); };
    const outsideTap = async () => { const p = await canvasPoint(15, 14); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); };
    const undoRedoOriginal = async before => {
      assert.equal(await page.locator('#draw-undo').isEnabled(), true, `transform commit should enable Undo: ${JSON.stringify({ state: await state(), after: pixelHash(await image()), before: pixelHash(before) })}`);
      await page.locator('#draw-undo').click(); await page.waitForTimeout(80);
      assert.equal(pixelHash(await image()), pixelHash(before), 'Undo restores the exact source artwork image');
      const undoAllCels = await art(); assert.deepEqual(undoAllCels.cels, fixtureArt.cels, 'Undo preserves all frame/layer source cels');
      await page.locator('#draw-redo').click(); await page.waitForTimeout(80);
      assert.notEqual(pixelHash(await image()), pixelHash(before), 'Redo reapplies the committed selection transform');
      const redoAllCels = await art();
      assert.deepEqual(redoAllCels.cels.filter(cel => cel.frameId !== fixtureArt.frameId || cel.layerId !== fixtureArt.layerId),
        fixtureArt.cels.filter(cel => cel.frameId !== fixtureArt.frameId || cel.layerId !== fixtureArt.layerId),
        'Redo changes only the active frame/layer; nonactive frame/layer source cels stay exact');
      await page.locator('#draw-undo').click(); await page.waitForTimeout(80);
      assert.equal(pixelHash(await image()), pixelHash(before));
    };

    try {
      await page.goto(`${base}/draw/`); await ready(); await loadFixture();
      fixtureArt = await art();
      assert.equal(fixtureArt.frames.length, 2); assert.equal(fixtureArt.layers.filter(layer => layer.role !== 'music').length, 2);
      const fixtureFrameId = fixtureArt.frameId, fixtureLayerId = fixtureArt.layerId;
      record('loaded-two-frame-two-art-layer-pxd-fixture');

      // Rectangle: the source bounds interior is an unambiguous body point, away from handles/pivot.
      await selectRectangle(); const beforeRect = await image();
      const rectangleBeforeBody = (await state()).selection;
      const start = await canvasPoint(3, 3), end = await canvasPoint(8, 7);
      await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 8 });
      const mouseBodyPending = await state();
      assert.equal(mouseBodyPending.pending, true, `body drag should show a pending transform before release: ${JSON.stringify(mouseBodyPending)}`);
      assert.deepEqual([mouseBodyPending.selection.width, mouseBodyPending.selection.height], [rectangleBeforeBody.width, rectangleBeforeBody.height], 'body drag translates the selection instead of scaling it');
      assert.notDeepEqual([mouseBodyPending.selection.x, mouseBodyPending.selection.y], [rectangleBeforeBody.x, rectangleBeforeBody.y], 'mouse body drag changes position');
      assert.equal(pixelHash(await image()), pixelHash(beforeRect), 'preview does not commit source pixels');
      await page.mouse.up(); await page.waitForTimeout(80);
      assert.equal((await state()).pending, true, 'releasing body drag leaves a pending transform');
      await outsideTap(); assert.equal((await state()).selection, null, 'outside tap confirms and deselects');
      await undoRedoOriginal(beforeRect); assert.equal((await state()).frameId, fixtureFrameId); assert.equal((await state()).layerId, fixtureLayerId);
      record('mouse-rectangle-body-drag-pending-confirm-undo-redo-cel-preservation');

      // A second body drag must continue the pending transform, even without Alt.
      await selectRectangle(); await mouseDrag([3, 3], [5, 5]);
      assert.equal((await state()).pending, true);
      await mouseDrag([4, 4], [7, 6]);
      assert.equal((await state()).pending, true, 'a second drag inside the moved body keeps the same pending transaction');
      const beforeRedragCancel = await image();
      await page.keyboard.press('Escape'); await page.waitForTimeout(80);
      assert.equal((await state()).pending, false);
      assert.equal(pixelHash(await image()), pixelHash(beforeRedragCancel), 'cancelling a pending body move leaves artwork untouched');
      record('pending-selection-body-redrag-and-cancel-control');

      // Lasso gives a non-rectangular selection; use a point deep inside the painted island.
      await clearSelectionUI(); await chooseTool('select', 'lasso');
      const polygon = [[1, 1], [7, 1], [7, 6], [1, 6], [1, 1]];
      const lassoA = await canvasPoint(...polygon[0]); await page.mouse.move(lassoA.x, lassoA.y); await page.mouse.down();
      for (const cell of polygon.slice(1)) { const p = await canvasPoint(...cell); await page.mouse.move(p.x, p.y, { steps: 2 }); }
      await page.mouse.up(); await page.waitForTimeout(80);
      assert.ok((await mask())?.some(Boolean), 'lasso creates a pixel mask');
      const beforeLasso = await image(), lassoBeforeBody = (await state()).selection; await mouseDrag([3, 3], [5, 7]);
      const lassoBodyPending = await state(); assert.equal(lassoBodyPending.pending, true, 'lasso selection body drag works without Alt');
      assert.deepEqual([lassoBodyPending.selection.width, lassoBodyPending.selection.height], [lassoBeforeBody.width, lassoBeforeBody.height], 'lasso body move preserves dimensions');
      assert.notDeepEqual([lassoBodyPending.selection.x, lassoBodyPending.selection.y], [lassoBeforeBody.x, lassoBeforeBody.y], 'lasso body drag changes position');
      await outsideTap(); await undoRedoOriginal(beforeLasso); record('lasso-body-drag-pending-confirm-undo-redo');

      // Color select creates disconnected islands with a transparent hole between them.
      await chooseTool('select', 'color');
      const red = await canvasPoint(2, 2); await page.mouse.click(red.x, red.y); await page.waitForTimeout(80);
      const colorMask = await mask(); assert.ok(colorMask?.[2 * width + 2] && colorMask[10 * width + 10], 'color select includes both disconnected red islands');
      assert.equal(colorMask[7 * width + 7], 0, 'transparent hole stays outside the color mask');
      const beforeColor = await image(), colorBeforeBody = (await state()).selection; await mouseDrag([2, 2], [4, 5]);
      const colorBodyPending = await state(); assert.equal(colorBodyPending.pending, true, 'color selection body drag enters pending transform');
      assert.deepEqual([colorBodyPending.selection.width, colorBodyPending.selection.height], [colorBeforeBody.width, colorBeforeBody.height], 'disconnected mask body move preserves bounds');
      assert.notDeepEqual([colorBodyPending.selection.x, colorBodyPending.selection.y], [colorBeforeBody.x, colorBeforeBody.y], 'color mask body drag changes position');
      await outsideTap(); await undoRedoOriginal(beforeColor); record('disconnected-color-mask-body-drag-and-hole-retained');

      // A transparent hole inside the disconnected mask's AABB is still outside the actual mask.
      await clearSelectionUI(); await chooseTool('select', 'color');
      const holeSeed = await canvasPoint(3, 3); await page.mouse.click(holeSeed.x, holeSeed.y); await page.waitForTimeout(70);
      const holeMask = await mask(); assert.ok(holeMask && holeMask[2 * width + 2] && !holeMask[7 * width + 7]);
      const beforeHoleDrag = await image(); await page.evaluate(() => { window.__bodySelectionTrace = []; });
      await mouseDrag([7, 7], [8, 8]);
      const holeTrace = await page.evaluate(() => window.__bodySelectionTrace);
      assert.notEqual(holeTrace.find(event => event.type === 'pointerdown')?.dragMode, 'move', 'starting in a hole must not be classified as body movement');
      assert.equal((await state()).pending, false, 'a drag from a mask hole does not create a transform');
      assert.equal(pixelHash(await image()), pixelHash(beforeHoleDrag), 'dragging in the transparent hole leaves artwork untouched');
      record('mask-hole-drag-is-outside-not-body-move');

      // Shift/Control range modifiers, selection holes, and outside-add gesture behavior.
      await selectRectangle();
      assert.equal((await state()).pending, false, 'virtual cursor test begins with a confirmed selection');
      await mouseDrag([8, 8], [9, 9], { modifiers: ['Shift'] });
      const added = await mask(); assert.ok(added[3 * width + 3] && added[8 * width + 8]);
      await mouseDrag([8, 8], [9, 9], { modifiers: ['Control'] });
      const subtracted = await mask(); assert.ok(subtracted[3 * width + 3] && !subtracted[8 * width + 8]);
      await mouseDrag([14, 14], [15, 15], { modifiers: ['Shift'] });
      assert.ok((await mask())[14 * width + 14], 'add-range outside the prior mask can start outside');
      record('shift-add-control-subtract-and-mask-outside-add');

      // On a tiny selection the dedicated move hit-area overlaps the pixels;
      // explicit modifiers must still change the mask rather than move it.
      await clearSelectionUI(); await chooseTool('select', 'rectangle'); await mouseDrag([3, 3], [4, 4]);
      const tinyMask = await mask(); assert.ok(tinyMask[3 * width + 3] && tinyMask[4 * width + 4]);
      await mouseDrag([3, 3], [4, 3], { modifiers: ['Control'] });
      const tinySubtracted = await mask();
      assert.equal((await state()).pending, false, 'Ctrl-drag overlapping a small move handle does not create a transform');
      assert.ok(!tinySubtracted[3 * width + 3] && tinySubtracted[4 * width + 4], 'Ctrl-drag subtracts mask cells even at the overlapping hit target');
      record('small-selection-control-subtract-overlapping-movehandle');

      // Native synthetic touch starts within the current selected mask; no Alt key is available.
      await selectRectangle(); const beforeTouch = await image(), touchRectBefore = (await state()).selection;
      await touchDrag([2, 4], [6, 8]);
      const nativeTouchState = await state();
      assert.equal(nativeTouchState.pending, true, `native touch body drag enters pending transform without a modifier key: ${JSON.stringify(nativeTouchState)}`);
      const touchTrace = await page.evaluate(() => window.__bodySelectionTrace);
      assert.equal(touchTrace.find(event => event.type === 'pointerdown' && event.pointerType === 'touch')?.dragMode, 'move', `native touch should hit the move body, not a corner or pivot: ${JSON.stringify(touchTrace)}`);
      assert.deepEqual([nativeTouchState.selection.width, nativeTouchState.selection.height], [touchRectBefore.width, touchRectBefore.height], 'touch move handle preserves selection dimensions');
      assert.notDeepEqual([nativeTouchState.selection.x, nativeTouchState.selection.y], [touchRectBefore.x, touchRectBefore.y], `touch body drag translates from the original selection position: ${JSON.stringify({ before: touchRectBefore, after: nativeTouchState.selection, dragMode: nativeTouchState.dragMode, pending: nativeTouchState.pending })}`);
      await outsideTap(); await undoRedoOriginal(beforeTouch); record('synthetic-native-touch-body-drag-and-history');

      // Color-mode touch move must be treated as a drag, not a stationary color tap.
      await chooseTool('select', 'color');
      await clearSelectionUI();
      const redTap = await canvasPoint(2, 2); await page.mouse.click(redTap.x, redTap.y); await page.waitForTimeout(80);
      assert.ok((await state()).selection, 'color tap first creates a selection for the following body drag');
      const colorPoint = await canvasPoint(3, 4), colorDest = await canvasPoint(6, 8), cdp = await context.newCDPSession(page);
      const touch = p => ({ id: 77, x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(colorPoint)] });
      for (let i = 1; i <= 7; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch({ x: colorPoint.x + (colorDest.x - colorPoint.x) * i / 7, y: colorPoint.y + (colorDest.y - colorPoint.y) * i / 7 })] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); await page.waitForTimeout(100);
      const touchColorState = await state();
      assert.equal(touchColorState.pending, true, `touch movement in color mode is routed to transform rather than color tap: ${JSON.stringify(touchColorState)}`);
      assert.equal(touchColorState.pendingTapMode, null, 'color movement does not leave a pending tap');
      record('color-mode-touch-movement-prefers-drag-to-color-tap');

      // Cancel and unrelated pointer IDs must not commit or corrupt the owned transform.
      await page.keyboard.press('Escape'); await page.waitForTimeout(50);
      const cancelBase = await image(); await selectRectangle(); await mouseDrag([3, 3], [6, 7]);
      const pending = await state(); assert.equal(pending.pending, true);
      await page.evaluate(() => {
        const canvas = document.querySelector('#draw-canvas');
        canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', pointerId: 98765, button: 0, buttons: 1, clientX: 400, clientY: 400 }));
        canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse', pointerId: 98765, button: 0, buttons: 0, clientX: 400, clientY: 400 }));
      });
      assert.equal((await state()).pending, true, 'non-owning pointer events do not end the pending operation');
      await page.keyboard.press('Escape'); await page.waitForTimeout(80);
      assert.equal(pixelHash(await image()), pixelHash(cancelBase), 'cancel restores original pixels');
      assert.equal((await state()).pending, false);
      record('escape-cancel-and-non-owning-pointer-preserve-source');

      // Virtual cursor: press its drawing button, then move the cursor over the canvas.
      await chooseTool('select', 'rectangle'); await mouseDrag([1, 1], [6, 6]);
      await page.locator('#draw-settings-summary').click();
      if (await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed') !== 'true') await page.locator('#draw-virtual-toggle').click();
      await page.keyboard.press('Escape');
      const marker = page.locator('.draw-virtual-marker'); await marker.waitFor({ state: 'visible' });
      const m = await marker.boundingBox(), panelButton = page.locator('[data-virtual-left]'), b = await panelButton.boundingBox();
      const virtualCdp = await context.newCDPSession(page), activeTouches = new Map();
      const send = async (type, p, id) => {
        if (type === 'touchStart' || type === 'touchMove') activeTouches.set(id, { id, x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 });
        else activeTouches.delete(id);
        return virtualCdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...activeTouches.values()] });
      };
      const press = { x: b.x + b.width / 2, y: b.y + b.height / 2 }, board = await page.locator('.draw-board').boundingBox();
      const from = await canvasPoint(2, 2), to = await canvasPoint(6, 7);
      const markerCenter = { x: m.x + m.width / 2, y: m.y + m.height / 2 };
      const safeAnchor = { x: board.x + board.width * .5, y: board.y + board.height * .5 };
      const initialPadEnd = { x: safeAnchor.x + from.x - markerCenter.x, y: safeAnchor.y + from.y - markerCenter.y };
      await send('touchStart', safeAnchor, 80);
      await send('touchMove', initialPadEnd, 80);
      await send('touchEnd', initialPadEnd, 80); await page.waitForTimeout(50);
      await page.evaluate(() => { window.__bodySelectionTrace = []; });
      await send('touchStart', press, 81); await page.waitForTimeout(40);
      await send('touchStart', from, 82);
      for (let i = 1; i <= 8; i++) await send('touchMove', { x: from.x + (to.x - from.x) * i / 8, y: from.y + (to.y - from.y) * i / 8 }, 82);
      await send('touchEnd', to, 82); await send('touchEnd', press, 81); await virtualCdp.detach(); await page.waitForTimeout(100);
      const virtualPending = await state();
      assert.equal(virtualPending.pending, true, `virtual cursor body press/move/release should move the selection (marker initial ${JSON.stringify(m)})`);
      const virtualTrace = await page.evaluate(() => window.__bodySelectionTrace);
      assert.equal(virtualTrace.find(event => event.type === 'virtual-pointermove' && event.virtual)?.dragMode, 'move', `virtual cursor movement should activate and retain the move body: ${JSON.stringify(virtualTrace)}`);
      assert.deepEqual([virtualPending.selection.width, virtualPending.selection.height], [6, 6], 'virtual cursor move preserves the selection dimensions');
      assert.notDeepEqual([virtualPending.selection.x, virtualPending.selection.y], [1, 1], 'virtual cursor move changes selection position');
      record('virtual-cursor-body-drag-with-touch-pad');

      assert.deepEqual(errors, [], 'browser console has no uncaught page errors');
      assert.equal(await page.evaluate(() => window.__selectionBodyMediaRequests), 0, 'camera permissions were never requested');
      await page.screenshot({ path: join(output, `${viewport.width}x${viewport.height}-selection-body.png`) });
      report.viewports.push({ viewport, checks, errors, mediaRequests: await page.evaluate(() => window.__selectionBodyMediaRequests) });
    } catch (error) {
      report.failures.push({ viewport, checks, error: error.stack });
      await page.screenshot({ path: join(output, `${viewport.width}x${viewport.height}-failure.png`) }).catch(() => {});
    } finally { await context.close(); }
  }
  const finalPxdHash = createHash('sha256').update(await readFile(pxdPath)).digest('hex');
  assert.equal(finalPxdHash, sourcePxdHash, 'the original PXD fixture bytes were not overwritten during browser QA');
  report.fixture = { path: pxdPath, sha256: sourcePxdHash, bytesPreserved: finalPxdHash === sourcePxdHash };
} finally {
  report.status = report.failures.length ? 'FAIL' : 'PASS';
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ status: report.status, checks: report.viewports.map(item => ({ viewport: item.viewport, count: item.checks.length, names: item.checks })), failures: report.failures.map(item => ({ viewport: item.viewport, error: item.error?.split('\n')[0] })), report: join(output, 'report.json') }, null, 2));
if (report.failures.length) process.exitCode = 1;
