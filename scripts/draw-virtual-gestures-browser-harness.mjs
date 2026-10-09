#!/usr/bin/env node
/** Local browser checks for relative virtual-pad input, two-finger viewport gestures, and native regressions. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = process.env.PIXIEED_DRAW_VIRTUAL_GESTURES_OUTPUT || '/tmp/pixieed-draw-virtual-gestures-20261006';
const mime = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, `.${path}`);
    if (!file.startsWith(`${root}/`)) throw new Error('path');
    response.setHeader('Content-Type', `${mime[extname(file)] || 'application/octet-stream'}; charset=utf-8`);
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end(); }
});
await mkdir(output, { recursive: true });
await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true }), results = [];
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 3 : 1, hasTouch: true, acceptDownloads: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [], checks = [];
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    const session = await context.newCDPSession(page);
    const activeTouches = new Map();
    const dispatch = async (type, touchPoints = []) => {
      let points = touchPoints;
      if (type === 'touchStart' || type === 'touchMove') {
        for (const touch of touchPoints) activeTouches.set(touch.id, touch);
      } else if (type === 'touchEnd') {
        points = touchPoints.length ? touchPoints : [...activeTouches.values()];
        for (const touch of points) activeTouches.delete(touch.id);
      } else if (type === 'touchCancel') {
        // CDP requires touchCancel to carry an empty contact list; unlike an
        // empty touchEnd, this is an explicit cancel-all transition.
        points = [];
        activeTouches.clear();
      }
      await session.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await page.waitForTimeout(35);
    };
    const rect = async selector => page.locator(selector).boundingBox();
    const boardPoint = async (dx = 0, dy = 0) => {
      const r = await rect('.draw-board'); return { x: r.x + r.width / 2 + dx, y: r.y + r.height / 2 + dy };
    };
    const marker = () => page.locator('.draw-virtual-marker').evaluate(node => { const r = node.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const markerStyle = () => page.locator('.draw-virtual-marker').evaluate(node => {
      const r = node.getBoundingClientRect(), v = getComputedStyle(node, '::before'), h = getComputedStyle(node, '::after');
      return { rect: { width: r.width, height: r.height, x: r.x, y: r.y }, arms: { vertical: [v.width, v.height], horizontal: [h.width, h.height] }, fill: v.backgroundColor, edge: v.borderTopColor };
    });
    const zoom = () => page.locator('#draw-zoom-label').innerText();
    const transform = () => page.locator('#draw-canvas').evaluate(node => node.style.transform);
    const pixels = () => page.locator('#draw-canvas').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, result = [];
      for (let index = 3; index < data.length; index += 4) if (data[index]) result.push(Math.floor(index / 4));
      return result;
    });
    const setVirtual = async enabled => {
      await page.locator('#draw-settings-summary').click();
      if ((await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed') === 'true') !== enabled) await page.locator('#draw-virtual-toggle').click();
      await page.keyboard.press('Escape');
    };
    const pointer = (id, point) => ({ id, x: point.x, y: point.y, radiusX: 1, radiusY: 1, force: 1 });
    const pointerAudit = () => page.evaluate(() => structuredClone(window.__virtualPointerAudit));
    const synthMove = async (id, point) => page.locator('.draw-board').evaluate((node, input) => node.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: input.id, pointerType: 'touch', clientX: input.x, clientY: input.y, buttons: 1,
    })), { id, ...point });
    try {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool === 'pen' && !document.querySelector('#main').inert);
      await page.locator('#draw-canvas').focus();
      await page.evaluate(() => {
        window.__virtualPointerAudit = { down: [], up: [], lost: [] };
        const record = (type, event) => {
          if (event.pointerType !== 'touch' || !event.target.closest('.draw-board,[data-virtual-left],[data-virtual-right]')) return;
          window.__virtualPointerAudit[type].push({ id: event.pointerId, x: event.clientX, y: event.clientY, target: event.target.closest('.draw-board') ? 'pad' : 'button' });
        };
        document.addEventListener('pointerdown', event => record('down', event), true);
        document.addEventListener('pointerup', event => record('up', event), true);
        document.addEventListener('lostpointercapture', event => window.__virtualPointerAudit.lost.push({ id: event.pointerId, target: event.target.closest?.('.draw-board') ? 'pad' : 'button' }), true);
      });

      // The original direct two-touch gesture still zooms/pans with virtual input disabled.
      await setVirtual(false);
      let center = await boardPoint(), a = { x: center.x - 24, y: center.y }, b = { x: center.x + 24, y: center.y };
      await dispatch('touchStart', [pointer(1, a), pointer(2, b)]);
      await dispatch('touchMove', [pointer(1, a), pointer(2, { ...b, x: b.x + 34 })]);
      assert.notEqual(await zoom(), '100%', 'native two-touch pinch remains active');
      await dispatch('touchEnd', []); await page.keyboard.press('0');
      checks.push('native direct two-touch zoom remains active while virtual cursor is off');

      await setVirtual(true);
      const pad = await boardPoint(), before = await marker();
      const crosshair = await markerStyle();
      assert.equal(crosshair.rect.width, 20); assert.equal(crosshair.rect.height, 20, 'crosshair box stays screen-sized');
      assert.deepEqual(crosshair.arms, { vertical: ['3px', '19px'], horizontal: ['19px', '3px'] }, 'crosshair arms are 19px and centered in the 20px hit marker');
      assert.equal(crosshair.fill, 'rgb(255, 255, 255)'); assert.equal(crosshair.edge, 'rgb(16, 24, 32)', 'crosshair has a bright face and dark edge');
      const markerBounds = await page.locator('.draw-virtual-marker').boundingBox();
      assert.ok(Math.abs(markerBounds.x + markerBounds.width / 2 - before.x) < .5 && Math.abs(markerBounds.y + markerBounds.height / 2 - before.y) < .5, 'visual cross is centered on its cursor hotspot');
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-crosshair.png` });
      await dispatch('touchStart', [pointer(3, pad)]);
      assert.deepEqual(await marker(), before, 'single pad touch only establishes a relative anchor');
      await dispatch('touchMove', [pointer(3, { ...pad, x: pad.x + 12 })]);
      const afterRelative = await marker();
      assert.ok(Math.abs(afterRelative.x - before.x - 12) < 1.5, 'single-finger pad movement follows relative delta');
      assert.deepEqual(await pixels(), [], 'unpressed pad movement does not draw');
      await dispatch('touchEnd', []);
      checks.push('one-finger pad anchors without jumping and moves only by relative deltas');

      // Centroid movement can pan at 100%, but the page must keep visible
      // canvas area inside the board instead of letting it drift away.
      await page.keyboard.press('0'); center = await boardPoint();
      a = { x: center.x - 45, y: center.y }; b = { x: center.x + 45, y: center.y };
      await dispatch('touchStart', [pointer(30, a)]); await dispatch('touchStart', [pointer(30, a), pointer(31, b)]);
      await dispatch('touchMove', [pointer(30, { ...a, x: a.x + 90, y: a.y + 28 }), pointer(31, { ...b, x: b.x + 90, y: b.y + 28 })]);
      assert.equal(await zoom(), '100%', 'pure centroid pan does not change zoom');
      const visibleAtOne = await page.locator('.draw-board').evaluate(boardNode => {
        const boardRect = boardNode.getBoundingClientRect(), canvasRect = document.querySelector('#draw-canvas').getBoundingClientRect();
        return { width: Math.max(0, Math.min(boardRect.right, canvasRect.right) - Math.max(boardRect.left, canvasRect.left)), height: Math.max(0, Math.min(boardRect.bottom, canvasRect.bottom) - Math.max(boardRect.top, canvasRect.top)) };
      });
      assert.ok(visibleAtOne.width >= 48 && visibleAtOne.height >= 48, `100% centroid pan keeps at least 48px visible (${JSON.stringify(visibleAtOne)})`);
      await dispatch('touchEnd', []); await page.keyboard.press('0');
      checks.push('100% centroid pan keeps the canvas visibly clamped inside the viewport');

      // Two free pad contacts control the canvas; lifting to one re-anchors the cursor.
      await page.keyboard.press('0'); center = await boardPoint();
      a = { x: center.x - 32, y: center.y }; b = { x: center.x + 32, y: center.y };
      const cursorBeforePinch = await marker();
      const auditBeforePinch = await pointerAudit();
      await dispatch('touchStart', [pointer(4, a)]); await dispatch('touchStart', [pointer(4, a), pointer(5, b)]);
      const transformStart = await transform();
      await dispatch('touchMove', [pointer(4, a), pointer(5, { ...b, x: b.x + 44 })]);
      assert.notEqual(await zoom(), '100%', 'two free viewport fingers pinch zoom');
      await dispatch('touchMove', [pointer(4, { ...a, x: a.x - 10 }), pointer(5, { ...b, x: b.x + 34 })]);
      assert.notEqual(await transform(), transformStart, 'two-finger centroid motion pans/zooms the view');
      const remaining = { ...a, x: a.x - 10 };
      await dispatch('touchEnd', [pointer(5, { ...b, x: b.x + 34 })]);
      const auditAfterLift = await page.evaluate(() => structuredClone(window.__virtualPointerAudit));
      const padDowns = auditAfterLift.down.filter(item => item.target === 'pad').slice(auditBeforePinch.down.filter(item => item.target === 'pad').length);
      const padUps = auditAfterLift.up.filter(item => item.target === 'pad').slice(auditBeforePinch.up.filter(item => item.target === 'pad').length);
      assert.equal(padDowns.length, 2, 'two real pad pointer ids were created');
      assert.equal(padUps.length, 1); assert.equal(padUps[0].id, padDowns[1].id, 'CDP touchEnd lifts only the second finger pointer id');
      assert.notEqual(padUps[0].id, padDowns[0].id, 'the remaining finger retains its original pointer id');
      const cursorAfterLift = await marker();
      assert.ok(Math.hypot(cursorAfterLift.x - cursorBeforePinch.x, cursorAfterLift.y - cursorBeforePinch.y) < 1.5,
        'the cursor stays anchored when two fingers become one');
      await dispatch('touchMove', [pointer(4, { ...remaining, x: remaining.x + 10 })]);
      const cursorAfterResume = await marker();
      assert.ok(Math.abs(cursorAfterResume.x - cursorAfterLift.x - 10) < 1.5,
        `single-finger movement resumes from the lifted gesture position (${JSON.stringify({ cursorBeforePinch, cursorAfterLift, cursorAfterResume, remaining, transform: await transform() })})`);
      const crosshairAfterZoom = await markerStyle();
      assert.deepEqual(crosshairAfterZoom.arms, crosshair.arms, 'crosshair keeps its 19px screen size after zoom');
      assert.ok(Math.abs(crosshairAfterZoom.rect.width - crosshair.rect.width) < .1 && Math.abs(crosshairAfterZoom.rect.height - crosshair.rect.height) < .1, 'crosshair box is zoom invariant');
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-crosshair-zoom.png` });
      await dispatch('touchEnd', []); await page.keyboard.press('0');
      checks.push('two-finger pan/pinch; actual pointer-id audit confirms 2→1 lift reanchors the surviving contact; 19px crosshair remains screen-sized');

      // Captured movement keeps consuming finger deltas outside the board.
      // Reversing direction beyond the edge must move the cursor immediately.
      const board = await rect('.draw-board');
      center = { x: board.x + board.width - 24, y: board.y + board.height / 2 };
      const outsideStart = await marker();
      await dispatch('touchStart', [pointer(6, center)]);
      const outsideX = board.x + board.width + 12;
      await dispatch('touchMove', [pointer(6, { x: outsideX, y: center.y })]);
      assert.ok(Math.abs((await marker()).x - outsideStart.x - 36) < 1.5, 'captured outside movement updates the virtual cursor');
      await dispatch('touchMove', [pointer(6, { x: outsideX - 8, y: center.y })]);
      assert.ok(Math.abs((await marker()).x - outsideStart.x - 28) < 1.5, 'direction reversal beyond the edge moves immediately');
      const reentry = { x: board.x + board.width - 12, y: center.y + 8 };
      await dispatch('touchMove', [pointer(6, reentry)]);
      assert.ok(Math.abs((await marker()).x - outsideStart.x - 12) < 1.5, 're-entry consumes its actual delta');
      await dispatch('touchMove', [pointer(6, { ...reentry, x: reentry.x + 9 })]);
      assert.ok(Math.abs((await marker()).x - outsideStart.x - 21) < 1.5, 'movement continues by the latest delta after re-entry');
      await dispatch('touchEnd', []);
      checks.push('out-of-board captured motion tracks every sample, including immediate direction reversal and re-entry');

      // Drive the virtual cursor past its right clamp, then reverse by only
      // one small sample while the captured finger remains outside the board.
      center = await boardPoint();
      await dispatch('touchStart', [pointer(27, center)]);
      const farOutsideX = board.x + board.width * 3;
      await dispatch('touchMove', [pointer(27, { x: farOutsideX, y: center.y })]);
      const clampedRight = await page.locator('.draw-board').evaluate(node => {
        const boardRect = node.getBoundingClientRect(), canvasRect = document.querySelector('#draw-canvas').getBoundingClientRect();
        return Math.min(boardRect.left + node.clientLeft + node.clientWidth, canvasRect.right) - .01;
      });
      assert.ok(Math.abs((await marker()).x - clampedRight) < 1.5, 'large outside delta clamps the virtual cursor at the right edge');
      await dispatch('touchMove', [pointer(27, { x: farOutsideX - 8, y: center.y })]);
      assert.ok(Math.abs((await marker()).x - clampedRight + 8) < 1.5, 'small reversal outside the board moves immediately away from the clamp');
      await dispatch('touchEnd', []);
      checks.push('virtual cursor clamps at the canvas edge and responds immediately to a small outside reversal');

      // A real pointercancel of one pad pointer aborts both contacts. Neither
      // surviving touch id may move the crosshair until it lifts and re-enters.
      await page.keyboard.press('0'); center = await boardPoint(); a = { x: center.x - 25, y: center.y }; b = { x: center.x + 25, y: center.y };
      let auditBeforeCancel = await pointerAudit();
      await dispatch('touchStart', [pointer(10, a)]); await dispatch('touchStart', [pointer(10, a), pointer(11, b)]);
      let auditAfterStart = await pointerAudit();
      let cancelDowns = auditAfterStart.down.filter(item => item.target === 'pad').slice(auditBeforeCancel.down.filter(item => item.target === 'pad').length);
      assert.equal(cancelDowns.length, 2, 'cancel case registered both captured pad contacts');
      const cancelMarker = await marker(), cancelTransform = await transform();
      await page.locator('.draw-board').evaluate((node, id) => node.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: id, pointerType: 'touch' })), cancelDowns[0].id);
      await synthMove(cancelDowns[1].id, { x: b.x + 30, y: b.y });
      assert.deepEqual(await marker(), cancelMarker, 'surviving pointer is quarantined after peer pointercancel');
      assert.equal(await transform(), cancelTransform, 'cancelled gesture cannot later pan or zoom');
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false');
      await dispatch('touchCancel', []);
      // The actual CDP touchCancel path also produces browser pointercancel
      // events and must release the pair together.
      center = await boardPoint(); a = { x: center.x - 25, y: center.y }; b = { x: center.x + 25, y: center.y };
      auditBeforeCancel = await pointerAudit();
      await dispatch('touchStart', [pointer(25, a)]); await dispatch('touchStart', [pointer(25, a), pointer(26, b)]);
      auditAfterStart = await pointerAudit();
      cancelDowns = auditAfterStart.down.filter(item => item.target === 'pad').slice(auditBeforeCancel.down.filter(item => item.target === 'pad').length);
      assert.equal(cancelDowns.length, 2);
      const actualCancelCaptures = await page.locator('.draw-board').evaluate((node, ids) => ids.map(id => node.hasPointerCapture(id)), cancelDowns.map(item => item.id));
      assert.deepEqual(actualCancelCaptures, [true, true]);
      const actualCancelMarker = await marker(), actualCancelTransform = await transform();
      await dispatch('touchCancel', []);
      const actualCancelReleased = await page.locator('.draw-board').evaluate((node, ids) => ids.map(id => node.hasPointerCapture(id)), cancelDowns.map(item => item.id));
      assert.deepEqual(actualCancelReleased, [false, false], 'native touchcancel releases both captures');
      await synthMove(cancelDowns[0].id, { x: a.x - 20, y: a.y });
      assert.deepEqual(await marker(), actualCancelMarker); assert.equal(await transform(), actualCancelTransform, 'native touchcancel quarantines stale pointer moves');
      // Captured pad lostpointercapture has the same all-input cancellation
      // contract, including release of its sibling contact capture.
      await page.keyboard.press('0'); center = await boardPoint(); a = { x: center.x - 25, y: center.y }; b = { x: center.x + 25, y: center.y };
      auditBeforeCancel = await pointerAudit();
      await dispatch('touchStart', [pointer(12, a)]); await dispatch('touchStart', [pointer(12, a), pointer(13, b)]);
      auditAfterStart = await pointerAudit();
      cancelDowns = auditAfterStart.down.filter(item => item.target === 'pad').slice(auditBeforeCancel.down.filter(item => item.target === 'pad').length);
      assert.equal(cancelDowns.length, 2);
      const captureIds = await page.locator('.draw-board').evaluate((node, ids) => ids.map(id => ({ id, captured: node.hasPointerCapture(id) })), cancelDowns.map(item => item.id));
      assert.ok(captureIds.every(item => item.captured), 'both viewport contacts begin captured');
      await page.locator('.draw-board').evaluate((node, id) => node.releasePointerCapture(id), cancelDowns[1].id);
      // Chromium's CDP touch injector does not consistently deliver the
      // queued lostpointercapture after an explicit release. Deliver the same
      // DOM event after verifying the native capture flag was actually lost.
      await page.locator('.draw-board').evaluate((node, id) => node.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: id, pointerType: 'touch' })), cancelDowns[1].id);
      await page.waitForTimeout(35);
      const capturesAfterLoss = await page.locator('.draw-board').evaluate((node, ids) => ids.map(id => node.hasPointerCapture(id)), cancelDowns.map(item => item.id));
      assert.deepEqual(capturesAfterLoss, [false, false], 'lost capture of one pad contact releases every contact');
      const lostMarker = await marker(), lostTransform = await transform();
      await synthMove(cancelDowns[0].id, { x: a.x + 25, y: a.y });
      assert.deepEqual(await marker(), lostMarker); assert.equal(await transform(), lostTransform, 'stale surviving contact is inert after capture loss');
      await dispatch('touchCancel', []);
      checks.push('pointercancel and lost capture abort all pad contacts, release sibling captures, and quarantine stale movement');

      // Losing the held button capture aborts the button and independent pad
      // contact. A later pad move cannot keep drawing or restart the gesture.
      const leftButtonCapture = await rect('[data-virtual-left]');
      const buttonPoint = { x: leftButtonCapture.x + leftButtonCapture.width / 2, y: leftButtonCapture.y + leftButtonCapture.height / 2 };
      const buttonStrokeBaseline = await pixels();
      center = await boardPoint(); auditBeforeCancel = await pointerAudit();
      await dispatch('touchStart', [pointer(14, buttonPoint)]); await dispatch('touchStart', [pointer(14, buttonPoint), pointer(15, center)]);
      auditAfterStart = await pointerAudit();
      const buttonDown = auditAfterStart.down.filter(item => item.target === 'button').slice(auditBeforeCancel.down.filter(item => item.target === 'button').length);
      const padDown = auditAfterStart.down.filter(item => item.target === 'pad').slice(auditBeforeCancel.down.filter(item => item.target === 'pad').length);
      assert.equal(buttonDown.length, 1); assert.equal(padDown.length, 1);
      await page.locator('[data-virtual-left]').evaluate((node, id) => node.releasePointerCapture(id), buttonDown[0].id);
      await page.locator('[data-virtual-left]').evaluate((node, id) => node.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: id, pointerType: 'touch' })), buttonDown[0].id);
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', 'button capture loss releases drawing');
      const buttonCancelPixels = await pixels(), buttonCancelMarker = await marker();
      assert.deepEqual(buttonCancelPixels, buttonStrokeBaseline, 'lost button capture rolls back the active stroke to its pre-gesture pixels');
      await synthMove(padDown[0].id, { x: center.x + 14, y: center.y });
      assert.deepEqual(await marker(), buttonCancelMarker); assert.deepEqual(await pixels(), buttonCancelPixels, 'pad cannot resume drawing after button capture loss');
      await dispatch('touchCancel', []);
      if (await page.locator('#draw-undo').isEnabled()) await page.locator('#draw-undo').click();
      checks.push('button capture loss releases the virtual press and aborts the independent pad pointer');

      // Blur and turning the mode off quarantine contacts; re-enable does not
      // revive their stale movement, while fresh contacts still work normally.
      center = await boardPoint(); auditBeforeCancel = await pointerAudit();
      await dispatch('touchStart', [pointer(16, center)]); await dispatch('touchStart', [pointer(16, center), pointer(17, { ...center, x: center.x + 30 })]);
      auditAfterStart = await pointerAudit();
      let blurDowns = auditAfterStart.down.filter(item => item.target === 'pad').slice(auditBeforeCancel.down.filter(item => item.target === 'pad').length);
      const blurTransform = await transform(), blurMarker = await marker();
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await synthMove(blurDowns[0].id, { x: center.x - 20, y: center.y });
      assert.equal(await transform(), blurTransform); assert.deepEqual(await marker(), blurMarker, 'blur leaves old pointer ids inert');
      await dispatch('touchCancel', []);
      const offLeft = await rect('[data-virtual-left]'), offButton = { x: offLeft.x + offLeft.width / 2, y: offLeft.y + offLeft.height / 2 };
      const offBaseline = await pixels();
      center = await boardPoint(); auditBeforeCancel = await pointerAudit();
      await dispatch('touchStart', [pointer(18, offButton)]);
      await dispatch('touchStart', [pointer(18, offButton), pointer(19, center)]);
      auditAfterStart = await pointerAudit();
      blurDowns = auditAfterStart.down.filter(item => item.target === 'pad').slice(auditBeforeCancel.down.filter(item => item.target === 'pad').length);
      const offMarker = await marker(), offTransform = await transform();
      await page.locator('#draw-virtual-toggle').evaluate(node => node.click());
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', 'mode off releases the held left button');
      const offCommittedPixels = await pixels();
      assert.notDeepEqual(offCommittedPixels, offBaseline, 'mode off commits the in-flight accepted button stroke');
      await page.locator('#draw-virtual-toggle').evaluate(node => node.click());
      assert.equal(await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed'), 'true');
      await synthMove(blurDowns[0].id, { x: center.x + 20, y: center.y });
      assert.deepEqual(await marker(), offMarker); assert.equal(await transform(), offTransform, 'off/on does not revive the old touch id');
      assert.deepEqual(await pixels(), offCommittedPixels, 'old pad contact cannot extend the committed OFF stroke');
      await dispatch('touchCancel', []);
      center = await boardPoint(); const freshBefore = await marker();
      await dispatch('touchStart', [pointer(20, center)]); await dispatch('touchMove', [pointer(20, { ...center, x: center.x + 8 })]);
      assert.ok(Math.abs((await marker()).x - freshBefore.x - 8) < 1.5, 'fresh pointer works after cancel/blur/off-on');
      await dispatch('touchEnd', []);
      await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), offBaseline, 'undo restores the baseline after normal mode-off commit');
      checks.push('blur/off-on cancel stale contacts; fresh contact starts cleanly afterward');

      // A held button takes precedence over a two-pad gesture and still paints with its own pointer id.
      await page.keyboard.press('0'); await setVirtual(true);
      const leftButton = await rect('[data-virtual-left]');
      const clickFinger = { x: leftButton.x + leftButton.width / 2, y: leftButton.y + leftButton.height / 2 };
      center = await boardPoint(); a = { x: center.x - 28, y: center.y }; b = { x: center.x + 28, y: center.y };
      const zoomBeforeHold = await zoom();
      await dispatch('touchStart', [pointer(7, clickFinger)]);
      await dispatch('touchStart', [pointer(7, clickFinger), pointer(8, a)]);
      await dispatch('touchStart', [pointer(7, clickFinger), pointer(8, a), pointer(9, b)]);
      await dispatch('touchMove', [pointer(7, clickFinger), pointer(8, { ...a, x: a.x - 8 }), pointer(9, { ...b, x: b.x + 30 })]);
      assert.equal(await zoom(), zoomBeforeHold, 'held click prevents two-pad gesture takeover');
      assert.ok((await pixels()).length > 0, 'relative pad movement continues drawing while click is held');
      await dispatch('touchEnd', [pointer(7, clickFinger)]);
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', 'button lift releases the virtual press');
      await dispatch('touchCancel', []); await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), []);
      checks.push('held click wins over two-pad gestures; separate pad pointer draws and button lift releases');

      // The right virtual click is equally independent and retains right-side
      // tool behavior while suppressing a competing free-finger gesture.
      await page.keyboard.press('0'); await setVirtual(true);
      const rightButton = await rect('[data-virtual-right]');
      const rightFinger = { x: rightButton.x + rightButton.width / 2, y: rightButton.y + rightButton.height / 2 };
      center = await boardPoint(); a = { x: center.x - 28, y: center.y }; b = { x: center.x + 28, y: center.y };
      const zoomBeforeRight = await zoom();
      await dispatch('touchStart', [pointer(20, rightFinger)]);
      await dispatch('touchStart', [pointer(20, rightFinger), pointer(21, a)]);
      await dispatch('touchStart', [pointer(20, rightFinger), pointer(21, a), pointer(22, b)]);
      await dispatch('touchMove', [pointer(20, rightFinger), pointer(21, { ...a, x: a.x - 8 }), pointer(22, { ...b, x: b.x + 30 })]);
      assert.equal(await zoom(), zoomBeforeRight, 'right held click also takes priority over free-pad gesture');
      assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'), 'true');
      await dispatch('touchEnd', [pointer(20, rightFinger)]);
      assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'), 'false');
      await dispatch('touchCancel', []); await page.keyboard.press('0');
      if (await page.locator('#draw-undo').isEnabled()) await page.locator('#draw-undo').click();
      checks.push('right virtual button remains a distinct held input with gesture priority and clean lift');

      // Native right mouse input keeps its existing right binding and paints; it is not swallowed by virtual-pad listeners.
      await setVirtual(false); center = await boardPoint();
      await page.mouse.move(center.x, center.y); await page.mouse.down({ button: 'right' });
      await page.mouse.move(center.x + 18, center.y + 12); await page.mouse.up({ button: 'right' });
      assert.ok((await pixels()).length > 0, 'native right mouse still paints');
      await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), []);
      checks.push('native right mouse paints with its right binding after gesture changes');

      // A real exported PNG is compared byte-for-byte to the source canvas at
      // nearest-neighbor enlargement while the CSS-only crosshair is visible.
      await setVirtual(true);
      const pngLeft = await rect('[data-virtual-left]'), pngButton = { x: pngLeft.x + pngLeft.width / 2, y: pngLeft.y + pngLeft.height / 2 };
      center = await boardPoint();
      await dispatch('touchStart', [pointer(23, pngButton)]); await dispatch('touchStart', [pointer(23, pngButton), pointer(24, center)]);
      await dispatch('touchMove', [pointer(23, pngButton), pointer(24, { ...center, x: center.x + 15, y: center.y + 8 })]);
      await dispatch('touchEnd', [pointer(23, pngButton)]); await dispatch('touchEnd', [pointer(24, { ...center, x: center.x + 15, y: center.y + 8 })]);
      const sourcePixels = await page.locator('#draw-canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]);
      assert.ok(sourcePixels.some((channel, index) => index % 4 === 3 && channel > 0), 'virtual drawing creates a source pixel for export');
      const outputPage = page.waitForURL(url => url.pathname === '/output/work/' && url.searchParams.has('id'));
      await page.locator('#draw-export').evaluate(node => node.click());
      await outputPage;
      const outputDownload = page.locator('#output-download');
      await outputDownload.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:'));
      const pendingDownload = page.waitForEvent('download');
      await outputDownload.click();
      const download = await pendingDownload, pngPath = `${output}/${viewport.width}x${viewport.height}-virtual-export.png`;
      await download.saveAs(pngPath);
      const pngData = (await readFile(pngPath)).toString('base64');
      const exported = await page.evaluate(async ({ data, before }) => {
        const blob = await (await fetch(`data:image/png;base64,${data}`)).blob(), bitmap = await createImageBitmap(blob), outputCanvas = document.createElement('canvas');
        outputCanvas.width = bitmap.width; outputCanvas.height = bitmap.height; outputCanvas.getContext('2d').drawImage(bitmap, 0, 0);
        const pixels = outputCanvas.getContext('2d').getImageData(0, 0, outputCanvas.width, outputCanvas.height).data;
        const scaleX = outputCanvas.width / 16, scaleY = outputCanvas.height / 16; let equal = Number.isInteger(scaleX) && scaleX === scaleY;
        for (let y = 0; equal && y < outputCanvas.height; y++) for (let x = 0; equal && x < outputCanvas.width; x++) {
          const outIndex = (y * outputCanvas.width + x) * 4, srcIndex = (Math.floor(y / scaleY) * 16 + Math.floor(x / scaleX)) * 4;
          for (let channel = 0; channel < 4; channel++) if (pixels[outIndex + channel] !== before[srcIndex + channel]) { equal = false; break; }
        }
        bitmap.close(); return { equal, width: outputCanvas.width, height: outputCanvas.height };
      }, { data: pngData, before: sourcePixels });
      assert.equal(exported.equal, true, 'exported PNG preserves source pixels and excludes the virtual crosshair overlay');
      checks.push(`CSS-only cursor is excluded from exact artwork PNG export (${exported.width}×${exported.height})`);

      assert.deepEqual(errors, []); results.push({ viewport, checks, errors });
      console.log(`PASS ${viewport.width}x${viewport.height}: ${checks.length} virtual gesture cases`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-failure.png` }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(accept => server.close(accept));
}
