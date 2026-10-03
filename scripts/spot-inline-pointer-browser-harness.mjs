import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const baseUrl = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }];
const sizes = [[32, 32], [32, 16], [16, 32]];
let passes = 0;

async function fixture(page, width, height) {
  const bytes = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const colors = ['#345f88', '#d84c42', '#65a35f', '#e4b63e', '#8c5da9', '#42a9a7', '#d98242', '#9a9c9f'];
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      x.fillStyle = colors[(px * 3 + py * 5 + px * py * 7) % colors.length];
      x.fillRect(px, py, 1, 1);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, [width, height]);
  return Buffer.from(bytes, 'base64');
}
async function begin(page, width, height) {
  await page.route('**/*', (route) => new URL(route.request().url()).origin === baseUrl ? route.continue() : route.abort());
  await page.goto(`${baseUrl}/spot-difference/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#spot-import-pair');
  await page.locator('#spot-after-file').setInputFiles({ name: `${width}x${height}.png`, mimeType: 'image/png', buffer: await fixture(page, width, height) });
  await page.waitForFunction(() => document.querySelector('#spot-after-slot')?.dataset.filled === 'true');
  await page.locator('#spot-import-pair').click();
  await page.waitForFunction(() => !document.querySelector('#spot-inline-draw').hidden);
  const actual = await page.locator('#spot-inline-canvas').evaluate((canvas) => [canvas.width, canvas.height]);
  assert.deepEqual(actual, [width, height], `uploaded fixture must retain exact dimensions: expected ${width}x${height}, got ${actual.join('x')}`);
  await page.locator('#spot-inline-add-color').fill('#e66b42');
  return bitmapState(page);
}
async function bitmapState(page) {
  return page.locator('#spot-inline-canvas').evaluate((canvas) => {
    const image = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: Array.from(image.data), rect: (() => { const r = canvas.getBoundingClientRect(), s = getComputedStyle(canvas), m = new DOMMatrixReadOnly(s.transform); return { left: r.left, top: r.top, width: r.width, height: r.height, transformScale: Math.hypot(m.a, m.b), borderLeft: parseFloat(s.borderLeftWidth), borderTop: parseFloat(s.borderTopWidth), borderRight: parseFloat(s.borderRightWidth), borderBottom: parseFloat(s.borderBottomWidth) }; })() };
  });
}
function diff(a, b) {
  const changed = [];
  for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) changed.push(i / 4);
  return changed;
}
function displayedPixel(state, px, py) {
  // Canvas content box, after CSS object-fit:contain and transforms encoded by its client rect.
  const r = state.rect, left = r.left + r.borderLeft * r.transformScale, top = r.top + r.borderTop * r.transformScale;
  const width = r.width - (r.borderLeft + r.borderRight) * r.transformScale, height = r.height - (r.borderTop + r.borderBottom) * r.transformScale;
  const scale = Math.min(width / state.width, height / state.height), drawWidth = scale * state.width, drawHeight = scale * state.height;
  return { x: left + (width - drawWidth) / 2 + (px + .5) * scale, y: top + (height - drawHeight) / 2 + (py + .5) * scale };
}
async function tapAndCheck(page, point, mode, label) {
  const before = await bitmapState(page);
  const target = displayedPixel(before, point.x, point.y);
  if (mode === 'mouse') await page.mouse.click(target.x, target.y);
  else await page.touchscreen.tap(target.x, target.y);
  const after = await bitmapState(page), changed = diff(before, after), index = point.y * before.width + point.x;
  assert.deepEqual(changed, [index], `${label} ${mode}: exactly target pixel should change; got ${changed.slice(0, 12)} (${changed.length} total)`);
  const rgba = after.data.slice(index * 4, index * 4 + 4);
  assert.deepEqual(rgba, [230, 107, 66, 255], `${label} ${mode}: target color mismatch`);
}
function pixelAt(state, clientX, clientY) {
  const r = state.rect, left = r.left + r.borderLeft * r.transformScale, top = r.top + r.borderTop * r.transformScale;
  const width = r.width - (r.borderLeft + r.borderRight) * r.transformScale, height = r.height - (r.borderTop + r.borderBottom) * r.transformScale;
  const scale = Math.min(width / state.width, height / state.height);
  const x = (clientX - left - (width - scale * state.width) / 2) / scale;
  const y = (clientY - top - (height - scale * state.height) / 2) / scale;
  return { x, y };
}

try {
  // First run is the requested fast, single-upload reproduction on the square fixture.
  {
    const context = await browser.newContext({ viewport: viewports[1], deviceScaleFactor: 1, hasTouch: true });
    const page = await context.newPage();
    await begin(page, 32, 32);
    for (const [x, y] of [[1, 1], [30, 1], [1, 30], [30, 30], [16, 8], [8, 16]]) await tapAndCheck(page, { x, y }, 'mouse', `regression ${x},${y}`);
    await context.close(); passes += 1;
  }
  for (const viewport of viewports) for (const [width, height] of sizes) for (const mode of ['mouse', 'touch']) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true, isMobile: mode === 'touch' });
    const page = await context.newPage(); const source = await begin(page, width, height);
    const points = [[1, 1], [width - 2, 1], [1, height - 2], [width - 2, height - 2], [Math.floor(width / 2), Math.floor(height / 4)], [Math.floor(width / 4), Math.floor(height / 2)]];
    for (const [x, y] of points) await tapAndCheck(page, { x, y }, mode, `${width}x${height} ${viewport.width}x${viewport.height} ${x},${y}`);
    const state = await bitmapState(page), r = state.rect;
    const boxLeft = r.left + r.borderLeft * r.transformScale, boxTop = r.top + r.borderTop * r.transformScale;
    const boxWidth = r.width - (r.borderLeft + r.borderRight) * r.transformScale, boxHeight = r.height - (r.borderTop + r.borderBottom) * r.transformScale;
    const displayScale = Math.min(boxWidth / state.width, boxHeight / state.height);
    const letterX = (boxWidth - state.width * displayScale) / 2, letterY = (boxHeight - state.height * displayScale) / 2;
    const outside = [{ x: r.left + .2, y: r.top + r.height / 2 }, { x: r.left + r.width - .2, y: r.top + r.height / 2 }];
    if (letterX > 2) outside.push({ x: boxLeft + letterX / 2, y: boxTop + boxHeight / 2 });
    if (letterY > 2) outside.push({ x: boxLeft + boxWidth / 2, y: boxTop + letterY / 2 });
    for (const p of outside) {
      const before = await bitmapState(page); if (mode === 'mouse') await page.mouse.click(p.x, p.y); else await page.touchscreen.tap(p.x, p.y);
      assert.deepEqual(diff(before, await bitmapState(page)), [], `${width}x${height} ${mode}: border/outside tap must not draw`);
    }
    if (viewport.width === 390 && width === 32 && height === 16 && mode === 'touch') {
      const baseline = await bitmapState(page), anchor = displayedPixel(baseline, 16, 8);
      const anchorPixel = pixelAt(baseline, anchor.x, anchor.y), session = await context.newCDPSession(page);
      const touch = (x, y, id) => ({ x, y, id, radiusX: 1, radiusY: 1, force: 1 });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(anchor.x - 8, anchor.y, 1), touch(anchor.x + 8, anchor.y, 2)] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(anchor.x - 28, anchor.y, 1), touch(anchor.x + 28, anchor.y, 2)] });
      const pinched = await bitmapState(page), pinchedPixel = pixelAt(pinched, anchor.x, anchor.y);
      assert.ok(pinched.rect.transformScale > 1.1, 'two-finger CDP touch must produce real pinch zoom');
      assert.ok(Math.abs(pinchedPixel.x - anchorPixel.x) < .2 && Math.abs(pinchedPixel.y - anchorPixel.y) < .2, `pinch moved the midpoint anchor: ${JSON.stringify({ anchorPixel, pinchedPixel })}`);
      assert.deepEqual(diff(baseline, pinched), [], 'two-finger gesture must cancel the provisional one-finger stroke');
      const movedAnchor = { x: anchor.x + 12, y: anchor.y + 8 }, beforeMovePixel = pixelAt(pinched, movedAnchor.x, movedAnchor.y);
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(movedAnchor.x - 28, movedAnchor.y, 1), touch(movedAnchor.x + 28, movedAnchor.y, 2)] });
      const shifted = await bitmapState(page), afterMovePixel = pixelAt(shifted, movedAnchor.x, movedAnchor.y);
      assert.ok(Math.abs(afterMovePixel.x - beforeMovePixel.x) < .2 && Math.abs(afterMovePixel.y - beforeMovePixel.y) < .2, `same-distance pinch translation moved its anchor: ${JSON.stringify({ beforeMovePixel, afterMovePixel })}`);
      assert.deepEqual(diff(baseline, shifted), [], 'moving a pinched gesture must not draw');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
    }
    if (viewport.width === 390 && width === 32 && height === 16 && mode === 'mouse') {
      const baseline = await bitmapState(page);
      const anchor = displayedPixel(baseline, 18, 7);
      const anchorPixel = pixelAt(baseline, anchor.x, anchor.y);
      await page.mouse.move(anchor.x, anchor.y); await page.mouse.wheel(0, -240);
      const zoomed = await bitmapState(page), kept = pixelAt(zoomed, anchor.x, anchor.y);
      assert.ok(Math.abs(kept.x - anchorPixel.x) < .15 && Math.abs(kept.y - anchorPixel.y) < .15, `wheel zoom moved anchor pixel: ${JSON.stringify({ anchorPixel, kept })}`);
      await tapAndCheck(page, { x: 18, y: 7 }, 'mouse', 'wheel zoomed tap');
      await page.locator('#spot-inline-undo').click();
      assert.equal(diff(baseline, await bitmapState(page)).length, 0, 'undo must restore exact pre-stroke RGBA');
      await page.locator('#spot-inline-redo').click();
      assert.deepEqual(diff(baseline, await bitmapState(page)), [7 * width + 18], 'redo must restore only the drawn pixel');
      const drawn = await bitmapState(page);
      await page.locator('#spot-inline-original').click();
      const original = await bitmapState(page);
      assert.deepEqual(diff(original, source), [], 'original comparison must show the untouched source exactly');
      await page.locator('#spot-inline-original').click();
      assert.deepEqual(diff(await bitmapState(page), drawn), [], 'returning from source comparison must restore the drawing exactly');
      await page.locator('#spot-inline-cancel').click();
      await page.locator('#spot-import-pair').click();
      await page.waitForFunction(() => !document.querySelector('#spot-inline-draw').hidden);
      const reopened = await page.locator('#spot-inline-canvas').evaluate((canvas) => getComputedStyle(canvas).transform);
      assert.equal(reopened, 'none', `reopening inline draw must reset zoom/pan, got ${reopened}`);
    }
    await context.close(); passes += 1;
  }
  console.log(`PASS spot inline pointer geometry (${passes} scenarios)`);
} finally { await browser.close(); }
