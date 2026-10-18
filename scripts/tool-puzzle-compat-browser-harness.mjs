import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'only a local CSP server is allowed');
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
const out = '/tmp/pixieed-stage4/puzzle';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = { branches: [], blockedRequests: [], errors: [] };

async function snapshotSurface(page) {
  const surface = page.locator('#spot-inline-canvas');
  if (await surface.evaluate(element => element.tagName) === 'IFRAME') {
    const frame = page.frames().find(item => item.url().includes('gameEditor=spot'));
    assert.ok(frame, 'the real game Draw iframe exists');
    return frame.evaluate(() => {
      const documentData = window.__PIXIEED_GAME_DRAW__?.getDocument();
      return { width: documentData.width, height: documentData.height, pixels: [...documentData.pixels], palette: [...documentData.palette] };
    });
  }
  return surface.evaluate(element => {
    const image = element.getContext('2d').getImageData(0, 0, element.width, element.height);
    return { width: element.width, height: element.height, data: Array.from(image.data) };
  });
}

async function png(page, width, height) {
  const base64 = await page.evaluate(([w, h]) => {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d'); const colors = ['#345f88', '#d84c42', '#65a35f', '#e4b63e', '#8c5da9', '#42a9a7', '#d98242', '#9a9c9f'];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { context.fillStyle = colors[(x * 3 + y * 5 + x * y * 7) % colors.length]; context.fillRect(x, y, 1, 1); }
    return canvas.toDataURL('image/png').split(',')[1];
  }, [width, height]);
  return Buffer.from(base64, 'base64');
}

async function openEditor(width, height) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin === base && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    report.blockedRequests.push({ url: request.url(), method: request.method() });
    return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(`${base}/spot-difference/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#spot-after-file').setInputFiles({ name: `${width}x${height}.png`, mimeType: 'image/png', buffer: await png(page, width, height) });
  await page.waitForFunction(() => document.querySelector('#spot-after-slot')?.dataset.filled === 'true');
  await page.locator('#spot-import-pair').click();
  await page.waitForFunction(() => !document.querySelector('#spot-inline-draw').hidden);
  const frameElement = page.locator('#spot-inline-canvas');
  const tag = await frameElement.evaluate(element => element.tagName);
  const frame = tag === 'IFRAME' ? page.frames().find(item => item.url().includes('gameEditor=spot')) : null;
  if (frame) await frame.waitForFunction(() => Boolean(window.__PIXIEED_GAME_DRAW__?.getDocument()));
  const backend = tag === 'IFRAME' ? 'draw-iframe' : await frameElement.getAttribute('data-game-draw-backend') || 'legacy-shared-core';
  assert.equal(backend, width > 256 || height > 256 ? 'legacy-shared-core' : 'draw-iframe', `${width}x${height} selects expected production backend`);
  const canvas = frame ? frame.locator('#draw-canvas') : frameElement;
  const snapshot = () => snapshotSurface(page);
  return { context, page, frame, canvas, snapshot, backend, width, height };
}

async function exerciseBranch(width, height) {
  const editor = await openEditor(width, height); const { page, frame, canvas, snapshot, backend, context } = editor;
  try {
    const initial = await snapshot(); assert.deepEqual([initial.width, initial.height], [width, height]);
    const original = page.locator('#spot-inline-original');
    await original.click(); assert.equal(await original.getAttribute('aria-pressed'), 'true', 'original compare toggles on');
    await original.click(); assert.equal(await original.getAttribute('aria-pressed'), 'false', 'original compare toggles off');
    await page.locator('#spot-inline-add-color').fill('#e66b42');
    const box = await canvas.boundingBox(); assert.ok(box && box.width > 0 && box.height > 0);
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await page.waitForFunction(async () => {
      const frame = document.querySelector('#spot-inline-canvas');
      if (frame?.tagName === 'IFRAME') {
        const child = frame.contentWindow?.__PIXIEED_GAME_DRAW__;
        return Boolean(child?.canUndo);
      }
      return !document.querySelector('#spot-inline-undo')?.disabled;
    });
    const edited = await snapshot(); assert.notDeepEqual(edited.pixels || edited.data, initial.pixels || initial.data, `${backend}: pointer edit changes pixels`);
    await page.locator('#spot-inline-undo').click();
    await page.waitForFunction(async () => {
      const frame = document.querySelector('#spot-inline-canvas');
      if (frame?.tagName === 'IFRAME') return !frame.contentWindow?.__PIXIEED_GAME_DRAW__?.canUndo;
      return document.querySelector('#spot-inline-undo')?.disabled;
    });
    const undone = await snapshot();
    assert.deepEqual(undone.pixels || undone.data, initial.pixels || initial.data, `${backend}: Undo restores exact starting pixels`);
    await page.locator('#spot-inline-redo').click();
    await page.waitForFunction(async () => {
      const frame = document.querySelector('#spot-inline-canvas');
      if (frame?.tagName === 'IFRAME') return frame.contentWindow?.__PIXIEED_GAME_DRAW__?.canUndo;
      return !document.querySelector('#spot-inline-undo')?.disabled;
    });
    const redone = await snapshot();
    assert.deepEqual(redone.pixels || redone.data, edited.pixels || edited.data, `${backend}: Redo restores exact edited pixels`);
    await page.locator('#spot-inline-finish').click();
    await page.waitForFunction(() => !document.querySelector('#spot-editor').hidden);
    const candidates = await page.locator('#spot-candidates li').allTextContents();
    assert.ok(candidates.length > 0, `${backend}: Finish returns detected candidates`);
    assert.deepEqual([await page.locator('#spot-inline-canvas').evaluate(element => element.tagName)], [backend === 'draw-iframe' ? 'IFRAME' : 'CANVAS'], 'editor surface remains mounted after Finish for redraw');
    report.branches.push({ width, height, backend, checks: ['real pointer edit', 'undo exact pixels', 'redo exact pixels', 'original toggle', 'finish candidate payload'] });
  } finally { await context.close(); }
}

async function exerciseCancel(width, height) {
  const editor = await openEditor(width, height); const { page, canvas, snapshot, backend, context } = editor;
  try {
    const initial = await snapshot();
    await page.locator('#spot-inline-add-color').fill('#e66b42');
    const box = await canvas.boundingBox(); await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    const beforeCancel = await snapshot();
    assert.notDeepEqual(beforeCancel.pixels || beforeCancel.data, initial.pixels || initial.data, `${backend}: cancel fixture changed before return`);
    let dialog = false;
    page.once('dialog', async item => { dialog = true; await item.accept(); });
    await page.locator('#spot-inline-cancel').evaluate(element => element.click());
    await page.waitForFunction(() => document.querySelector('#spot-inline-draw').hidden && !document.querySelector('#spot-setup').hidden);
    await page.waitForFunction(() => document.querySelector('#spot-inline-canvas')?.tagName === 'CANVAS');
    assert.equal(await page.locator('#spot-inline-canvas').getAttribute('data-game-draw-backend'), null, 'dispose removes backend marker');
    assert.equal(await page.locator('iframe.game-draw-host__frame').count(), 0, 'cancel disposes the editor iframe');
    assert.equal(await page.locator('#spot-after-slot').getAttribute('data-filled'), 'true', 'cancel preserves the selected source image');
    await page.locator('#spot-import-pair').click();
    await page.waitForFunction(() => !document.querySelector('#spot-inline-draw').hidden);
    const restored = await snapshotSurface(page);
    assert.deepEqual(restored, initial, `${backend}: cancel and reopen restore the unchanged source`);
    report.branches.find(item => item.width === width && item.height === height).checks.push('cancel disposes iframe and reopens unchanged source', ...(dialog ? ['dirty cancel confirmation accepted'] : []));
  } finally { await context.close(); }
}

async function exerciseLegacyHost() {
  const context = await browser.newContext({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.route('**/*', route => {
    const request = route.request();
    if (new URL(request.url()).origin === base && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    report.blockedRequests.push({ url: request.url(), method: request.method() });
    return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(error.message));
  try {
    await page.goto(`${base}/spot-difference/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async () => {
      const { mountGameDraw } = await import('/js/creation/game-draw-host.mjs?rev=20261017-game-compat-1');
      const width = 512, height = 32;
      const original = { schemaVersion: 1, width, height, palette: ['#345f88ff'], pixels: Array(width * height).fill(0) };
      const working = structuredClone(original); const root = document.createElement('section'); root.id = 'game-draw-host-fixture';
      const paletteRow = document.createElement('div'); const palette = document.createElement('div'); paletteRow.append(palette);
      const canvas = document.createElement('canvas'); canvas.id = 'game-draw-host-fixture-canvas'; canvas.setAttribute('aria-label', 'synthetic puzzle canvas');
      const pen = document.createElement('button'); const eraser = document.createElement('button'); const undo = document.createElement('button'); const redo = document.createElement('button');
      const originalButton = document.createElement('button'); const addColor = document.createElement('input'); addColor.type = 'color'; addColor.value = '#e66b42';
      const finish = document.createElement('button'); const status = document.createElement('p');
      root.append(paletteRow, canvas, pen, eraser, undo, redo, originalButton, addColor, finish, status); document.body.append(root);
      const qa = { original: structuredClone(original), finishPayload: null, host: null };
      qa.host = mountGameDraw({ canvas, paletteHost: palette, penButton: pen, eraserButton: eraser, undoButton: undo, redoButton: redo,
        originalButton, addColorInput: addColor, finishButton: finish, status, original, working,
        onFinish: async payload => { qa.finishPayload = structuredClone(payload); } });
      qa.controls = { undo, redo, originalButton, addColor, finish, canvas, root }; window.__puzzleLegacyHostQA = qa; await qa.host.ready;
    });
    const host = page.locator('#game-draw-host-fixture'); const canvas = page.locator('#game-draw-host-fixture-canvas');
    assert.equal(await canvas.getAttribute('data-game-draw-backend'), 'legacy-shared-core');
    assert.equal(await page.locator('iframe.game-draw-host__frame').count(), 0, '512px compatibility branch is inline');
    const initial = await page.evaluate(() => window.__puzzleLegacyHostQA.host.getDocument());
    assert.deepEqual([initial.width, initial.height], [512, 32]);
    await host.locator('input[type=color]').fill('#e66b42');
    const box = await canvas.boundingBox(); await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await page.waitForFunction(() => !window.__puzzleLegacyHostQA.controls.undo.disabled);
    const edited = await page.evaluate(() => window.__puzzleLegacyHostQA.host.getDocument());
    assert.notDeepEqual(edited.pixels, initial.pixels, 'legacy backend pointer edit changes the document');
    await page.evaluate(() => window.__puzzleLegacyHostQA.controls.undo.click());
    await page.waitForFunction(() => window.__puzzleLegacyHostQA.controls.undo.disabled);
    assert.deepEqual((await page.evaluate(() => window.__puzzleLegacyHostQA.host.getDocument())).pixels, initial.pixels, 'legacy backend Undo restores exact pixels');
    await page.evaluate(() => window.__puzzleLegacyHostQA.controls.redo.click());
    await page.waitForFunction(() => !window.__puzzleLegacyHostQA.controls.undo.disabled);
    assert.deepEqual((await page.evaluate(() => window.__puzzleLegacyHostQA.host.getDocument())).pixels, edited.pixels, 'legacy backend Redo restores exact pixels');
    await page.evaluate(() => window.__puzzleLegacyHostQA.controls.originalButton.click());
    assert.equal(await page.evaluate(() => window.__puzzleLegacyHostQA.controls.originalButton.getAttribute('aria-pressed')), 'true', 'legacy original view toggles on');
    await page.evaluate(() => window.__puzzleLegacyHostQA.controls.originalButton.click());
    assert.equal(await page.evaluate(() => window.__puzzleLegacyHostQA.controls.originalButton.getAttribute('aria-pressed')), 'false', 'legacy original view toggles off');
    await page.evaluate(() => window.__puzzleLegacyHostQA.controls.finish.click());
    await page.waitForFunction(() => window.__puzzleLegacyHostQA.finishPayload?.width === 512);
    assert.deepEqual(await page.evaluate(() => window.__puzzleLegacyHostQA.finishPayload), edited, 'Finish callback carries the exact edited document');
    assert.deepEqual(await page.evaluate(() => window.__puzzleLegacyHostQA.original), initial, 'original source document remains unchanged');
    await page.evaluate(() => window.__puzzleLegacyHostQA.host.dispose());
    assert.equal(await page.locator('iframe.game-draw-host__frame').count(), 0, 'dispose leaves no editor iframe');
    assert.equal(await page.locator('#game-draw-host-fixture-canvas').evaluate(element => element.tagName), 'CANVAS');
    assert.equal(await page.locator('#game-draw-host-fixture-canvas').getAttribute('data-game-draw-backend'), null);
    assert.equal(await host.locator('.game-draw-legacy-tools').count(), 0, 'dispose restores tool controls');
    report.branches.push({ width: 512, height: 32, backend: 'legacy-shared-core', checks: ['real production host on synthetic spot DOM', 'pointer edit', 'undo exact document', 'redo exact document', 'original toggle', 'finish payload/source preservation', 'dispose cleanup'] });
  } finally { await context.close(); }
}

try {
  await exerciseBranch(32, 32);
  await exerciseCancel(32, 32);
  await exerciseLegacyHost();
} finally {
  await browser.close();
  await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ branches: report.branches, blockedRequests: report.blockedRequests.length, errors: report.errors }));
if (report.errors.length || report.blockedRequests.length) process.exitCode = 1;
