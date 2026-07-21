import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const pageErrors = [];
  page.on('pageerror', error => {
    const message = String(error?.stack || error);
    pageErrors.push(message);
    console.error(message);
  });
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort()
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await page.click('#startupActionNew');
  await page.waitForSelector('#newProjectDialog[open]');
  await page.fill('#newProjectName', 'transparent-layer-runtime');
  await page.click('#confirmNewProject');
  await page.waitForFunction(() => !document.getElementById('newProjectDialog')?.open, null, { timeout: 15_000 });
  await page.waitForFunction(
    () => window.__pixieedrawGetActiveProjectSession?.()?.dirty === false,
    null,
    { timeout: 15_000 }
  );

  const newProjectCheckpoint = await page.evaluate(async () => {
    const projectId = window.__pixieedrawGetActiveProjectSession?.()?.projectId || '';
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieedraw-autosave-v2-experimental');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (storeName, key) => new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    try {
      const current = await read('localProjectCurrentManifests', projectId);
      const manifest = await read('localProjectManifests', current?.manifestKey || '');
      const checkpoint = await read('localProjectSheetCheckpoints', manifest?.project?.checkpointRef?.key || '');
      const layer = checkpoint?.project?.document?.frames?.[0]?.layers?.[0] || null;
      return {
        type: layer?.indices?.constructor?.name || '',
        encoding: layer?.indicesEncoding || '',
        transparentOnly: layer?.indices instanceof Uint8Array
          ? layer.indices.every(value => value === 0)
          : false,
      };
    } finally {
      database.close();
    }
  });
  assert.equal(newProjectCheckpoint.type, 'Uint8Array');
  assert.equal(newProjectCheckpoint.encoding, 'uint8-palette-zero-transparent-v2');
  assert.equal(newProjectCheckpoint.transparentOnly, true);

  const canvas = page.locator('#drawingCanvas');
  let box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  await page.mouse.click(box.x + box.width * (0.5 + 0.25 / 32), box.y + box.height * (0.5 + 0.25 / 32));
  await page.waitForTimeout(150);

  const readCanvasSignature = async () => await page.evaluate(() => {
    const canvas = document.getElementById('drawingCanvas');
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context) return null;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0x811c9dc5;
    let visiblePixels = 0;
    for (let index = 0; index < pixels.length; index += 1) {
      hash ^= pixels[index];
      hash = Math.imul(hash, 0x01000193);
      if ((index & 3) === 3 && pixels[index] > 0) visiblePixels += 1;
    }
    return { hash: hash >>> 0, visiblePixels };
  });

  const before = await readCanvasSignature();
  assert.ok(before && before.visiblePixels > 0, 'the lower layer must contain a visible drawing');
  await page.keyboard.press('e');
  box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  await page.mouse.click(box.x + box.width * (0.5 + 0.25 / 32), box.y + box.height * (0.5 + 0.25 / 32));
  await page.waitForTimeout(100);
  const afterErase = await readCanvasSignature();
  assert.equal(afterErase?.visiblePixels, 0, 'eraser must write Uint8 transparent value 0');
  await page.keyboard.press('b');
  box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  await page.mouse.click(box.x + box.width * (0.5 + 0.25 / 32), box.y + box.height * (0.5 + 0.25 / 32));
  await page.waitForTimeout(100);
  const afterRedraw = await readCanvasSignature();
  assert.deepEqual(afterRedraw, before, 'redrawing after Uint8 erase must restore the same pixel');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(150);
  const afterUndoRedraw = await readCanvasSignature();
  assert.equal(afterUndoRedraw?.visiblePixels, 0, 'Uint8 pixel patch undo must restore transparent value 0');
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(150);
  const afterRedoRedraw = await readCanvasSignature();
  assert.deepEqual(afterRedoRedraw, before, 'Uint8 pixel patch redo must restore the drawn palette index');
  await page.keyboard.press('v');
  box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  const moveStartX = box.x + box.width * (0.5 + 0.25 / 32);
  const moveStartY = box.y + box.height * (0.5 + 0.25 / 32);
  await page.mouse.move(moveStartX, moveStartY);
  await page.mouse.down();
  await page.mouse.move(moveStartX + Math.max(2, box.width / 32), moveStartY, { steps: 4 });
  await page.mouse.up();
  await page.mouse.click(box.x + box.width * (0.25 / 32), box.y + box.height * (0.25 / 32));
  await page.keyboard.press('b');
  await page.waitForTimeout(200);
  const afterLayerMove = await readCanvasSignature();
  await page.waitForTimeout(4_000);
  const movedProjectCheckpoint = await page.evaluate(async () => {
    const projectId = window.__pixieedrawGetActiveProjectSession?.()?.projectId || '';
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pixieedraw-autosave-v2-experimental');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = (storeName, key) => new Promise((resolve, reject) => {
      const transaction = database.transaction([storeName], 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    try {
      const current = await read('localProjectCurrentManifests', projectId);
      const manifest = await read('localProjectManifests', current?.manifestKey || '');
      const checkpoint = await read('localProjectSheetCheckpoints', manifest?.project?.checkpointRef?.key || '');
      const layer = checkpoint?.project?.document?.frames?.[0]?.layers?.[0] || null;
      return {
        type: layer?.indices?.constructor?.name || '',
        encoding: layer?.indicesEncoding || '',
        nonZero: layer?.indices instanceof Uint8Array
          ? Array.from(layer.indices.entries()).filter(([, value]) => value !== 0).slice(0, 8)
          : [],
        activeTool: document.querySelector('[data-tool][aria-pressed="true"]')?.dataset?.tool || '',
        session: window.__pixieedrawGetActiveProjectSession?.() || null,
      };
    } finally {
      database.close();
    }
  });
  assert.equal(movedProjectCheckpoint.type, 'Uint8Array');
  assert.equal(movedProjectCheckpoint.encoding, 'uint8-palette-zero-transparent-v2');
  assert.equal(afterLayerMove?.visiblePixels, 1, `moving a Uint8 layer must preserve its visible pixel: ${JSON.stringify(movedProjectCheckpoint)}`);
  await page.evaluate(() => document.getElementById('addLayer')?.click());
  await page.waitForTimeout(250);
  const after = await readCanvasSignature();
  assert.deepEqual(after, afterLayerMove, 'adding a transparent layer must not change the composed canvas');
  assert.deepEqual(pageErrors, []);

  console.log(JSON.stringify({
    newProjectCheckpoint,
    movedProjectCheckpoint,
    before,
    afterErase,
    afterRedraw,
    afterUndoRedraw,
    afterRedoRedraw,
    afterLayerMove,
    after,
    unchanged: true,
  }, null, 2));
} finally {
  await browser.close();
}
