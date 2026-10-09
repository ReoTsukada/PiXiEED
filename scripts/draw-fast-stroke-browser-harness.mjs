import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const phase = process.env.PIXIEED_FAST_STROKE_PHASE || 'baseline';
const outDir = `/tmp/pixieed-draw-fast-stroke-20261004/${phase}`;
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch({ headless: true });
const viewports = phase === 'tap-check' ? [
  { name: '390x844', width: 390, height: 844 },
] : [
  { name: '320x568', width: 320, height: 568 },
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x900', width: 1280, height: 900 },
  { name: '844x390', width: 844, height: 390 },
];
const result = { phase, baseUrl, viewports: [], pageErrors: [], sourceHashes: {} };
let activePage = null;
let checks = 0;

function check(condition, message) { checks += 1; assert.ok(condition, message); }
function equal(actual, expected, message) { checks += 1; assert.deepEqual(actual, expected, message); }

async function openPage(viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, hasTouch: true, isMobile: viewport.width < 600 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__pointerTrace = [];
    document.addEventListener('pointerdown', trace, true);
    document.addEventListener('pointermove', trace, true);
    document.addEventListener('pointerup', trace, true);
    document.addEventListener('pointercancel', trace, true);
    document.addEventListener('lostpointercapture', trace, true);
    function trace(event) {
      if (event.target?.closest?.('#draw-canvas') || event.target?.id === 'draw-canvas') {
        window.__pointerTrace.push({ type: event.type, id: event.pointerId, x: event.clientX, y: event.clientY, pointerType: event.pointerType });
      }
    }
  });
  page.on('pageerror', (error) => result.pageErrors.push({ viewport: viewport.name, message: error.message }));
  await page.route('**/*', (route) => {
    try { return new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort(); }
    catch { return route.abort(); }
  });
  await page.goto(`${baseUrl}/draw/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#draw-canvas');
    return canvas && canvas.width === 16 && canvas.height === 16 && canvas.dataset.tool === 'pen';
  }, null, { timeout: 10000 });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  activePage = page;
  return { context, page };
}

async function imageState(page) {
  return page.locator('#draw-canvas').evaluate((canvas) => {
    const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const r = canvas.getBoundingClientRect();
    return { width: canvas.width, height: canvas.height, rgba: Array.from(data), rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
  });
}

function clientPoint(state, x, y) {
  return { x: state.rect.x + (x + 0.5) * state.rect.width / state.width, y: state.rect.y + (y + 0.5) * state.rect.height / state.height };
}

function pixel(state, x, y) {
  const start = (y * state.width + x) * 4;
  return state.rgba.slice(start, start + 4);
}

function changedPixelIndices(before, after) {
  const indices = [];
  for (let i = 0; i < before.rgba.length; i += 4) {
    if (before.rgba[i] !== after.rgba[i] || before.rgba[i + 1] !== after.rgba[i + 1] || before.rgba[i + 2] !== after.rgba[i + 2] || before.rgba[i + 3] !== after.rgba[i + 3]) indices.push(i / 4);
  }
  return indices;
}

async function reloadBlank(page) {
  // Each fixture begins with the default pen; tool choices now persist across reloads.
  await page.evaluate(() => localStorage.removeItem('pixieed:draw:input-settings:v1'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool === 'pen');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return imageState(page);
}

async function cdpmouse(page, state, start, intermediate, end) {
  const session = await page.context().newCDPSession(page);
  const p0 = clientPoint(state, start.x, start.y);
  const p1 = intermediate ? clientPoint(state, intermediate.x, intermediate.y) : null;
  const p2 = clientPoint(state, end.x, end.y);
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p0.x, y: p0.y, buttons: 0 });
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p0.x, y: p0.y, button: 'left', buttons: 1, clickCount: 1 });
  if (p1) await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p1.x, y: p1.y, button: 'left', buttons: 1 });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p2.x, y: p2.y, button: 'left', buttons: 0, clickCount: 1 });
  await session.detach();
  return { p0, p1, p2 };
}

async function fastTouch(page, state, start, end, intermediate = null, id = 17) {
  const session = await page.context().newCDPSession(page);
  const p0 = clientPoint(state, start.x, start.y), p1 = intermediate ? clientPoint(state, intermediate.x, intermediate.y) : null, p2 = clientPoint(state, end.x, end.y);
  const touch = (point) => ({ x: point.x, y: point.y, id, radiusX: 1, radiusY: 1, force: 1 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(p0)] });
  if (p1) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(p1)] });
  if (p2 && (p2.x !== p1?.x || p2.y !== p1?.y) && p1) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(p2)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  return { p0, p1, p2 };
}

async function chooseTool(page, tool) {
  if (tool === 'pen') {
    if (await page.locator('#draw-canvas').getAttribute('data-tool') !== 'pen') await page.locator('.draw-tools > button[data-draw-tool="pen"]').click();
  } else {
    await page.locator('#draw-tool-summary').click();
    await page.waitForFunction(() => document.querySelector('#draw-tool-picker')?.open);
    await page.locator(`.draw-tool-menu button[data-draw-tool="${tool}"]`).first().click();
  }
  await page.waitForFunction((name) => document.querySelector('#draw-canvas')?.dataset.tool === name, tool);
}

async function captureMouseGesture(page, start, middle, end) {
  const before = await imageState(page);
  const points = await cdpmouse(page, before, start, middle, end);
  await page.waitForTimeout(30);
  return { before, after: await imageState(page), points, trace: await page.evaluate(() => [...window.__pointerTrace]) };
}

async function runViewport(viewport) {
  const { context, page } = await openPage(viewport);
  const cases = {};
  let blank = await imageState(page);
  check(blank.rgba.every((value, index) => index % 4 !== 3 || value === 0), `${viewport.name}: isolated canvas should start blank`);

  // A fast stroke has a down at (2,2) and an up at (8,2), with no pointermove.
  cases.mouseDownUp = await captureMouseGesture(page, { x: 2, y: 2 }, null, { x: 8, y: 2 });
  cases.mouseDownUp.endPixel = pixel(cases.mouseDownUp.after, 8, 2);
  cases.mouseDownUp.expectedEndpoint = cases.mouseDownUp.after.width === 16 ? true : false;
  cases.mouseDownUp.endpointDrawn = cases.mouseDownUp.endPixel[3] > 0;
  await page.screenshot({ path: `${outDir}/${viewport.name}-baseline-down-up.png`, fullPage: true });
  blank = await reloadBlank(page);

  // One intermediate move followed by a pointerup farther away tests whether pointerup is applied as the last sample.
  cases.mouseMoveUp = await captureMouseGesture(page, { x: 2, y: 4 }, { x: 4, y: 4 }, { x: 9, y: 4 });
  cases.mouseMoveUp.endPixel = pixel(cases.mouseMoveUp.after, 9, 4);
  cases.mouseMoveUp.endpointDrawn = cases.mouseMoveUp.endPixel[3] > 0;
  cases.mouseMoveUp.changedPixels = changedPixelIndices(cases.mouseMoveUp.before, cases.mouseMoveUp.after);
  await page.screenshot({ path: `${outDir}/${viewport.name}-baseline-move-up.png`, fullPage: true });
  await reloadBlank(page);

  cases.fastTouch = null;
  if (viewport.width < 600) {
    const before = await imageState(page);
    const points = await fastTouch(page, before, { x: 2, y: 6 }, { x: 9, y: 6 }, { x: 9, y: 6 });
    const after = await imageState(page);
    cases.fastTouch = { points, endPixel: pixel(after, 9, 6), endpointDrawn: pixel(after, 9, 6)[3] > 0,
      changedPixels: changedPixelIndices(before, after), trace: await page.evaluate(() => [...window.__pointerTrace]) };
    await reloadBlank(page);
  }

  // A filled rectangle preview must finish at the pointerup coordinate even when the last move stopped short.
  await chooseTool(page, 'rectangle-fill');
  const rectBefore = await imageState(page);
  const rectPoints = await cdpmouse(page, rectBefore, { x: 2, y: 8 }, { x: 4, y: 10 }, { x: 9, y: 13 });
  const rectAfter = await imageState(page);
  cases.rectangleFill = { points: rectPoints, endpointPixel: pixel(rectAfter, 9, 13), endpointDrawn: pixel(rectAfter, 9, 13)[3] > 0,
    farCornerPixel: pixel(rectAfter, 8, 12), changedPixels: changedPixelIndices(rectBefore, rectAfter) };
  await reloadBlank(page);

  // Selecting a marquee then ending beyond its final move should include the true release point.
  await chooseTool(page, 'select');
  const selBefore = await imageState(page);
  await cdpmouse(page, selBefore, { x: 1, y: 1 }, { x: 3, y: 3 }, { x: 8, y: 7 });
  const selection = await page.locator('.draw-selection').evaluate((node) => {
    const r = node.getBoundingClientRect(); return { hidden: node.hidden, x: r.x, y: r.y, width: r.width, height: r.height, className: node.className };
  }).catch(() => null);
  cases.selectionEnd = selection;
  await reloadBlank(page);

  // Undo and redo remain one history entry after a rapid single-stroke input.
  await chooseTool(page, 'pen');
  const historyBefore = await imageState(page);
  await cdpmouse(page, historyBefore, { x: 1, y: 14 }, null, { x: 6, y: 14 });
  const historyAfterStroke = await imageState(page);
  await page.locator('#draw-undo').click();
  await page.waitForFunction(() => document.querySelector('#draw-undo')?.disabled === true);
  const historyUndo = await imageState(page);
  await page.locator('#draw-redo').click();
  await page.waitForFunction(() => document.querySelector('#draw-redo')?.disabled === true);
  const historyRedo = await imageState(page);
  cases.history = { strokeChanged: changedPixelIndices(historyBefore, historyAfterStroke), undoExact: JSON.stringify(historyUndo.rgba) === JSON.stringify(historyBefore.rgba),
    redoExact: JSON.stringify(historyRedo.rgba) === JSON.stringify(historyAfterStroke.rgba), endpointDrawn: pixel(historyAfterStroke, 6, 14)[3] > 0 };

  if (phase === 'final') {
    check(cases.mouseDownUp.endpointDrawn, `${viewport.name}: pointerup-only stroke did not draw its release endpoint`);
    check(cases.mouseMoveUp.endpointDrawn, `${viewport.name}: pointerup endpoint after a sparse move was omitted`);
    check(cases.rectangleFill.endpointDrawn && cases.rectangleFill.farCornerPixel[3] > 0, `${viewport.name}: filled shape did not include pointerup endpoint`);
    const selectedCellsWide = (cases.selectionEnd?.width || 0) / (selBefore.rect.width / selBefore.width);
    const selectedCellsHigh = (cases.selectionEnd?.height || 0) / (selBefore.rect.height / selBefore.height);
    check(selectedCellsWide >= 7 && selectedCellsHigh >= 6, `${viewport.name}: marquee did not include its pointerup endpoint: ${JSON.stringify({ selectedCellsWide, selectedCellsHigh, selection })}`);
    check(cases.history.endpointDrawn && cases.history.undoExact && cases.history.redoExact, `${viewport.name}: fast stroke undo/redo was not a single exact history entry`);
    if (cases.fastTouch) check(cases.fastTouch.endpointDrawn, `${viewport.name}: fast touch movement did not draw the final cell`);
  }

  if (viewport.name === '390x844') {
    // Cancel must restore the exact baseline and release the native pointer cleanly.
    const cancelBase = await reloadBlank(page);
    const cancelSession = await page.context().newCDPSession(page);
    const cancelStart = clientPoint(cancelBase, 2, 2), cancelMove = clientPoint(cancelBase, 5, 5);
    await cancelSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cancelStart.x, y: cancelStart.y, buttons: 0 });
    await cancelSession.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cancelStart.x, y: cancelStart.y, button: 'left', buttons: 1, clickCount: 1 });
    await cancelSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cancelMove.x, y: cancelMove.y, button: 'left', buttons: 1 });
    const cancelPointerId = await page.evaluate(() => [...window.__pointerTrace].reverse().find((event) => event.type === 'pointerdown')?.id);
    await page.locator('#draw-canvas').evaluate((canvas, pointerId) => canvas.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId, pointerType: 'mouse', isPrimary: true, clientX: 0, clientY: 0 })), cancelPointerId);
    await cancelSession.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cancelMove.x, y: cancelMove.y, button: 'left', buttons: 0, clickCount: 1 });
    const cancelAfter = await imageState(page);
    cases.pointerCancel = { exactRestore: JSON.stringify(cancelAfter.rgba) === JSON.stringify(cancelBase.rgba), trace: await page.evaluate(() => [...window.__pointerTrace]) };
    await cancelSession.detach();

    const escapeBase = await reloadBlank(page), escapeSession = await page.context().newCDPSession(page);
    const escapeStart = clientPoint(escapeBase, 2, 3), escapeMove = clientPoint(escapeBase, 6, 3);
    await escapeSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: escapeStart.x, y: escapeStart.y, buttons: 0 });
    await escapeSession.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: escapeStart.x, y: escapeStart.y, button: 'left', buttons: 1, clickCount: 1 });
    await escapeSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: escapeMove.x, y: escapeMove.y, button: 'left', buttons: 1 });
    await page.keyboard.press('Escape');
    await escapeSession.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: escapeMove.x, y: escapeMove.y, button: 'left', buttons: 0, clickCount: 1 });
    const escapeAfter = await imageState(page);
    cases.escapeCancel = { exactRestore: JSON.stringify(escapeAfter.rgba) === JSON.stringify(escapeBase.rgba) };
    await escapeSession.detach();

    // A secondary pointer's terminal event must not commit or stop the drawing pointer.
    const unrelatedChecks = {};
    for (const terminalType of ['pointerup', 'lostpointercapture']) {
      const before = await reloadBlank(page);
      const session = await page.context().newCDPSession(page);
      const p0 = clientPoint(before, 1, 11), mid = clientPoint(before, 3, 11), end = clientPoint(before, 8, 11);
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p0.x, y: p0.y, buttons: 0 });
      await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p0.x, y: p0.y, button: 'left', buttons: 1, clickCount: 1 });
      const ownerId = await page.evaluate(() => [...window.__pointerTrace].reverse().find((event) => event.type === 'pointerdown')?.id);
      const unrelatedId = ownerId + 100;
      await page.locator('#draw-canvas').evaluate((canvas, { type, pointerId, clientX, clientY }) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: 'mouse', isPrimary: false, clientX, clientY })),
        { type: terminalType, pointerId: unrelatedId, clientX: mid.x, clientY: mid.y });
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: end.x, y: end.y, button: 'left', buttons: 1 });
      await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: end.x, y: end.y, button: 'left', buttons: 0, clickCount: 1 });
      const after = await imageState(page);
      unrelatedChecks[terminalType] = { ownerId, unrelatedId, endpointDrawn: pixel(after, 8, 11)[3] > 0, changedPixels: changedPixelIndices(before, after) };
      await session.detach();
    }
    cases.unrelatedTerminals = unrelatedChecks;

    // A second finger cancels an in-progress stroke and becomes a navigation gesture, not drawing.
    const pinchBase = await reloadBlank(page);
    const pinchSession = await page.context().newCDPSession(page);
    const pA = clientPoint(pinchBase, 2, 2), pB = clientPoint(pinchBase, 12, 12), pB2 = clientPoint(pinchBase, 13, 12);
    const touch = (point, id) => ({ x: point.x, y: point.y, id, radiusX: 1, radiusY: 1, force: 1 });
    await pinchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(pA, 31)] });
    await pinchSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(pA, 31), touch(pB, 32)] });
    await pinchSession.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(pA, 31), touch(pB2, 32)] });
    await pinchSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const pinchAfter = await imageState(page);
    cases.pinch = { exactRestore: JSON.stringify(pinchAfter.rgba) === JSON.stringify(pinchBase.rgba), trace: await page.evaluate(() => [...window.__pointerTrace]) };
    await pinchSession.detach();

    // Repeat endpoint targeting at a non-default zoom using the current displayed canvas bounds.
    await reloadBlank(page);
    await page.locator('#draw-canvas').focus(); await page.keyboard.press('+');
    await page.waitForFunction(() => document.querySelector('#draw-zoom-label')?.textContent.trim() !== '100%');
    const zoomBefore = await imageState(page);
    const zoomPoint = await cdpmouse(page, zoomBefore, { x: 4, y: 8 }, null, { x: 11, y: 8 });
    const zoomAfter = await imageState(page);
    cases.zoom = { label: await page.locator('#draw-zoom-label').textContent(), endpointDrawn: pixel(zoomAfter, 11, 8)[3] > 0,
      startDrawn: pixel(zoomAfter, 4, 8)[3] > 0, rect: zoomBefore.rect, points: zoomPoint };

    // Inject a native PointerEvent with a deliberately bent coalesced path. The event's own
    // coordinate is the final corner; the two hidden samples must still appear in canvas pixels.
    await reloadBlank(page);
    const coalescedBefore = await imageState(page), coalescedSession = await page.context().newCDPSession(page);
    const c0 = clientPoint(coalescedBefore, 2, 2), c1 = clientPoint(coalescedBefore, 5, 2), c2 = clientPoint(coalescedBefore, 5, 8), c3 = clientPoint(coalescedBefore, 8, 8);
    await coalescedSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c0.x, y: c0.y, buttons: 0 });
    await coalescedSession.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c0.x, y: c0.y, button: 'left', buttons: 1, clickCount: 1 });
    const coalescedPointerId = await page.evaluate(() => [...window.__pointerTrace].reverse().find((event) => event.type === 'pointerdown')?.id);
    cases.coalesced = await page.locator('#draw-canvas').evaluate((canvas, { pointerId, points, finalPoint }) => {
      const samples = points.map(({ x, y }) => new PointerEvent('pointermove', { bubbles: false, pointerId, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: y, buttons: 1 }));
      const event = new PointerEvent('pointermove', { bubbles: true, pointerId, pointerType: 'mouse', isPrimary: true, clientX: finalPoint.x, clientY: finalPoint.y, buttons: 1 });
      Object.defineProperty(event, 'getCoalescedEvents', { value: () => samples });
      canvas.dispatchEvent(event);
      return { eventTrusted: event.isTrusted, reportedSamples: event.getCoalescedEvents().map(({ clientX, clientY }) => ({ x: clientX, y: clientY })) };
    }, { pointerId: coalescedPointerId, points: [c1, c2], finalPoint: c3 });
    await coalescedSession.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c3.x, y: c3.y, button: 'left', buttons: 0, clickCount: 1 });
    const coalescedAfter = await imageState(page);
    cases.coalesced.sample1 = pixel(coalescedAfter, 5, 2);
    cases.coalesced.sample2 = pixel(coalescedAfter, 5, 8);
    cases.coalesced.eventCorner = pixel(coalescedAfter, 8, 8);
    cases.coalesced.changedPixels = changedPixelIndices(coalescedBefore, coalescedAfter);
    await coalescedSession.detach();
    if (phase === 'final') {
      check(cases.pointerCancel.exactRestore, '390x844: pointercancel did not restore the baseline');
      check(cases.escapeCancel.exactRestore, '390x844: Escape did not cancel and restore the active stroke');
      check(unrelatedChecks.pointerup.endpointDrawn && unrelatedChecks.lostpointercapture.endpointDrawn, `390x844: unrelated terminal event interrupted the active stroke: ${JSON.stringify(unrelatedChecks)}`);
      check(cases.pinch.exactRestore, '390x844: pinch gesture left drawing pixels behind');
      check(cases.zoom.endpointDrawn && cases.zoom.startDrawn, `390x844: zoomed fast stroke missed an endpoint: ${JSON.stringify(cases.zoom)}`);
      check(cases.coalesced.reportedSamples.length === 2 && cases.coalesced.sample1[3] > 0 && cases.coalesced.sample2[3] > 0 && cases.coalesced.eventCorner[3] > 0,
        `390x844: coalesced stroke samples were not rasterized as the bent path: ${JSON.stringify(cases.coalesced)}`);
      if (cases.fastTouch) check(cases.fastTouch.endpointDrawn, '390x844: fast touch endpoint should be drawn');
    }
  }

  result.viewports.push({ name: viewport.name, dimensions: viewport, cases });
  await context.close(); activePage = null;
}

async function runTapOwnerChecks() {
  const viewport = viewports[0], { context, page } = await openPage(viewport);
  const chooseColor0 = async () => {
    const color = page.locator('#draw-palette .draw-color[data-color-index="0"]');
    if (await color.getAttribute('aria-pressed') !== 'true') await color.click();
    await page.waitForFunction(() => document.querySelector('#draw-palette .draw-color[data-color-index="0"]')?.getAttribute('aria-pressed') === 'true');
  };
  const tapPixel = async (x, y) => {
    const state = await imageState(page), point = clientPoint(state, x, y), session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, buttons: 0 });
    await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
    await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
    await session.detach(); await page.waitForTimeout(30);
    return imageState(page);
  };
  await chooseColor0();
  await chooseTool(page, 'fill');
  const blank = await imageState(page), afterFill = await tapPixel(6, 6);
  const fillChanged = changedPixelIndices(blank, afterFill);
  const fill = { changedPixels: fillChanged.length, targetPixel: pixel(afterFill, 6, 6), toolAfterTap: await page.locator('#draw-canvas').getAttribute('data-tool') };
  check(fill.changedPixels === 256 && fill.targetPixel[3] === 255, `fill tap failed to flood the blank canvas: ${JSON.stringify(fill)}`);

  await reloadBlank(page); await chooseColor0(); await chooseTool(page, 'pen');
  const seedState = await imageState(page), seedPoint = clientPoint(seedState, 3, 3), seedSession = await page.context().newCDPSession(page);
  await seedSession.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: seedPoint.x, y: seedPoint.y, buttons: 0 });
  await seedSession.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: seedPoint.x, y: seedPoint.y, button: 'left', buttons: 1, clickCount: 1 });
  await seedSession.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: seedPoint.x, y: seedPoint.y, button: 'left', buttons: 0, clickCount: 1 });
  await seedSession.detach();
  await chooseTool(page, 'picker');
  await tapPixel(3, 3);
  const picker = { toolAfterTap: await page.locator('#draw-canvas').getAttribute('data-tool'), selectedColor0: await page.locator('#draw-palette .draw-color[data-color-index="0"]').getAttribute('aria-pressed') };
  check(picker.toolAfterTap === 'pen' && picker.selectedColor0 === 'true', `picker tap did not select the pixel and return to pen: ${JSON.stringify(picker)}`);
  result.tapChecks = { viewport: viewport.name, fill, picker, pageErrors: [...result.pageErrors] };
  await context.close(); activePage = null;
}

async function collectHashes() {
  const files = ['draw/index.html', 'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/creation/draw-tool-operations.mjs', 'css/draw-tool-picker.css', 'scripts/draw-fast-stroke-browser-harness.mjs'];
  for (const file of files) {
    try { result.sourceHashes[file] = createHash('sha256').update(await readFile(new URL(`../${file}`, import.meta.url))).digest('hex'); }
    catch (error) { result.sourceHashes[file] = `unavailable: ${error.message}`; }
  }
}

await mkdir(outDir, { recursive: true });
await collectHashes();
try {
  if (phase === 'tap-check') await runTapOwnerChecks();
  else for (const viewport of viewports) await runViewport(viewport);
  check(result.pageErrors.length === 0, `browser page errors: ${JSON.stringify(result.pageErrors)}`);
  result.status = phase === 'baseline' ? 'BASELINE_CAPTURED' : 'PASS';
  result.assertions = checks;
  result.reproduced = result.viewports.some((viewport) => !viewport.cases.mouseDownUp.endpointDrawn || !viewport.cases.mouseMoveUp.endpointDrawn);
  result.pageErrors.length ? result.status = 'PAGE_ERROR' : null;
  await writeFile(`${outDir}/result.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.status}: ${result.viewports.length} viewports, ${checks} baseline assertions, endpoint miss reproduced=${result.reproduced}`);
  console.log(`${outDir}/result.json`);
} catch (error) {
  result.status = 'HARNESS_ERROR';
  result.assertions = checks;
  result.failure = { message: error.message, stack: error.stack, url: activePage?.url() || null };
  if (activePage) { try { await activePage.screenshot({ path: `${outDir}/failure.png`, fullPage: true }); } catch { /* keep original error */ } }
  await writeFile(`${outDir}/failure.json`, `${JSON.stringify(result, null, 2)}\n`);
  throw error;
} finally { await browser.close(); }
