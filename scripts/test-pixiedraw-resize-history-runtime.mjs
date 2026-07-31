import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.stack || error)));
  await page.route(/googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/, route => route.abort()).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_000);
  await page.click('#startupActionNew');
  await page.waitForSelector('#newProjectDialog[open]');
  await page.fill('#newProjectName', 'resize-history-runtime');
  await page.click('#confirmNewProject');
  await page.waitForFunction(() => !document.getElementById('newProjectDialog')?.open, null, { timeout: 15_000 });

  const before = await page.evaluate(() => {
    const canvas = document.getElementById('drawingCanvas');
    return { width: canvas?.width || 0, height: canvas?.height || 0 };
  });
  const pixelPoint = { x: before.width - 2, y: before.height - 2 };
  const canvasBox = await page.locator('#drawingCanvas').boundingBox();
  assert.ok(canvasBox, 'drawing canvas is available');
  await page.mouse.click(
    canvasBox.x + ((pixelPoint.x + 0.5) / before.width) * canvasBox.width,
    canvasBox.y + ((pixelPoint.y + 0.5) / before.height) * canvasBox.height
  );
  await page.waitForTimeout(120);
  const pixelBeforeShrink = await page.evaluate(point => {
    const context = document.getElementById('drawingCanvas')?.getContext('2d');
    return context ? Array.from(context.getImageData(point.x, point.y, 1, 1).data) : [];
  }, pixelPoint);
  assert.notDeepEqual(pixelBeforeShrink, [0, 0, 0, 0], 'a pixel outside the future cropped area is drawn');
  const after = { width: before.width + 7, height: before.height + 5 };
  await page.fill('#canvasExpandRight', String(after.width - before.width));
  await page.fill('#canvasExpandBottom', String(after.height - before.height));
  assert.equal(await page.isEnabled('#applySpriteScale'), true, 'resize apply is enabled after changing dimensions');
  await page.click('#applySpriteScale');
  const readCanvasSize = () => page.evaluate(() => {
    const canvas = document.getElementById('drawingCanvas');
    return { width: canvas?.width || 0, height: canvas?.height || 0 };
  });
  await page.waitForFunction(next => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === next.width && canvas?.height === next.height;
  }, after, { timeout: 15_000 });
  assert.equal(await page.isEnabled('#undoAction'), true, 'local resize records an undo entry');

  await page.click('#undoAction');
  await page.waitForFunction(previous => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === previous.width && canvas?.height === previous.height;
  }, before, { timeout: 15_000 });
  assert.deepEqual(await readCanvasSize(), before, 'undo restores the original canvas dimensions');
  assert.equal(await page.isEnabled('#redoAction'), true, 'undo exposes resize redo');

  await page.click('#redoAction');
  await page.waitForFunction(next => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === next.width && canvas?.height === next.height;
  }, after, { timeout: 15_000 });
  assert.deepEqual(await readCanvasSize(), after, 'redo reapplies the exact target dimensions');

  const widthOnly = { width: after.width + 3, height: after.height };
  await page.fill('#canvasExpandRight', String(widthOnly.width - after.width));
  await page.fill('#canvasExpandBottom', '0');
  await page.click('#applySpriteScale');
  await page.waitForFunction(next => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === next.width && canvas?.height === next.height;
  }, widthOnly, { timeout: 15_000 });
  await page.click('#undoAction');
  await page.waitForFunction(previous => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === previous.width && canvas?.height === previous.height;
  }, after, { timeout: 15_000 });
  await page.click('#redoAction');
  await page.waitForFunction(next => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === next.width && canvas?.height === next.height;
  }, widthOnly, { timeout: 15_000 });
  await page.click('#undoAction');
  await page.waitForFunction(previous => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === previous.width && canvas?.height === previous.height;
  }, after, { timeout: 15_000 });
  const resizedCanvasBox = await page.locator('#drawingCanvas').boundingBox();
  assert.ok(resizedCanvasBox, 'canvas remains drawable after resize undo');
  await page.mouse.click(
    resizedCanvasBox.x + ((2.5) / after.width) * resizedCanvasBox.width,
    resizedCanvasBox.y + ((2.5) / after.height) * resizedCanvasBox.height
  );
  await page.waitForTimeout(120);
  assert.equal(await page.isEnabled('#redoAction'), false, 'a new drawing after resize undo clears resize redo');

  const cropped = { width: before.width - 8, height: before.height - 8 };
  await page.fill('#canvasExpandRight', String(cropped.width - after.width));
  await page.fill('#canvasExpandBottom', String(cropped.height - after.height));
  await page.click('#applySpriteScale');
  await page.waitForFunction(next => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === next.width && canvas?.height === next.height;
  }, cropped, { timeout: 15_000 });
  await page.click('#undoAction');
  await page.waitForFunction(previous => {
    const canvas = document.getElementById('drawingCanvas');
    return canvas?.width === previous.width && canvas?.height === previous.height;
  }, after, { timeout: 15_000 });
  const restoredPixel = await page.evaluate(point => {
    const context = document.getElementById('drawingCanvas')?.getContext('2d');
    return context ? Array.from(context.getImageData(point.x, point.y, 1, 1).data) : [];
  }, pixelPoint);
  assert.deepEqual(restoredPixel, pixelBeforeShrink, 'undo restores pixels removed by shrinking');
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ before, after }, null, 2));
} finally {
  await browser.close();
}
