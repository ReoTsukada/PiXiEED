#!/usr/bin/env node
/** Browser checks for captured draw gestures that continue beyond the canvas and board. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
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
await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const failures = [], results = [];
const viewports = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width < 500 ? 3 : 1, hasTouch: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    const activeTouches = new Map();
    const touchPoint = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 1, radiusY: 1, force: 1 });
    const touch = async (type, points = []) => {
      if (type === 'touchStart' || type === 'touchMove') for (const p of points) activeTouches.set(p.id, p);
      if (type === 'touchEnd') for (const p of (points.length ? points : [...activeTouches.values()])) activeTouches.delete(p.id);
      if (type === 'touchCancel') { points = []; activeTouches.clear(); }
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
      await page.waitForTimeout(45);
    };
    const pixels = () => page.locator('#draw-canvas').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const result = [];
      for (let i = 3; i < data.length; i += 4) if (data[i]) result.push(Math.floor(i / 4));
      return result;
    });
    const geometry = async () => page.evaluate(() => {
      const c = document.querySelector('#draw-canvas').getBoundingClientRect();
      const b = document.querySelector('.draw-board').getBoundingClientRect();
      return { canvas: { x: c.x, y: c.y, width: c.width, height: c.height }, board: { x: b.x, y: b.y, width: b.width, height: b.height } };
    });
    const openToolPicker = async () => {
      if (!(await page.locator('#draw-tool-picker').evaluate(node => node.open))) await page.locator('#draw-tool-summary').click();
    };
    const chooseTool = async (tool) => {
      await openToolPicker();
      await page.locator(`[data-draw-tool="${tool}"]`).first().click();
      await page.waitForFunction(expected => document.querySelector('#draw-canvas')?.dataset.tool === expected, tool);
    };
    const reload = async () => {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => Boolean(document.querySelector('#draw-canvas')?.dataset.tool) && !document.querySelector('#main').inert);
      await page.locator('#draw-canvas').focus();
      await page.waitForTimeout(80);
      if (await page.locator('#draw-canvas').getAttribute('data-tool') !== 'pen') await chooseTool('pen');
    };
    const dragPoints = async () => {
      const { canvas, board } = await geometry();
      return {
        start: { x: canvas.x + canvas.width * 0.12, y: canvas.y + canvas.height * 0.52 },
        end: { x: board.x + board.width + 12, y: canvas.y + canvas.height * 0.52 },
        canvas, board,
      };
    };
    const assertHeldUndo = async () => assert.equal(await page.locator('#draw-undo').isDisabled(), true, 'a live gesture remains one uncommitted history transaction');
    const assertPixelsChanged = async (before, label) => assert.notDeepEqual(await pixels(), before, `${label} paints through the canvas/board edge`);
    const mouseDrag = async (points, { unrelated = false } = {}) => {
      await page.mouse.move(points.start.x, points.start.y);
      await page.mouse.down();
      await page.mouse.move((points.start.x + points.end.x) / 2, points.start.y, { steps: 3 });
      if (unrelated) await page.locator('#draw-canvas').evaluate(node => document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9917, pointerType: 'mouse', buttons: 0 })));
      await assertHeldUndo();
      await page.mouse.move(points.end.x, points.end.y, { steps: 5 });
      await assertHeldUndo();
      await page.mouse.up();
      await page.waitForTimeout(60);
    };
    const touchDrag = async (points, id = 51) => {
      await touch('touchStart', [touchPoint(id, points.start)]);
      await touch('touchMove', [touchPoint(id, { x: (points.start.x + points.end.x) / 2, y: points.start.y })]);
      await assertHeldUndo();
      await touch('touchMove', [touchPoint(id, points.end)]);
      await assertHeldUndo();
      await touch('touchEnd', []);
    };
    const run = async (name, callback) => {
      try { await callback(); const result = `${viewport.width}x${viewport.height}: ${name}`; results.push(result); console.log(`PASS ${result}`); }
      catch (error) { const failure = `${viewport.width}x${viewport.height}: ${name}: ${error.stack || error.message}`; failures.push(failure); console.error(`FAIL ${failure}`); }
    };

    try {
      await reload();
      const initialGeometry = await geometry();
      assert.ok(initialGeometry.canvas.x >= initialGeometry.board.x && initialGeometry.canvas.y >= initialGeometry.board.y);

      for (const [input, doDrag] of [['mouse', mouseDrag], ['CDP touch', touchDrag]]) {
        for (const tool of ['pen', 'eraser', 'line', 'rectangle-fill', 'spray']) {
          await run(`${input} ${tool} continuation commits one undo transaction`, async () => {
            await reload();
            if (tool === 'eraser') {
              const p = await dragPoints();
              await mouseDrag({ start: p.start, end: { x: p.canvas.x + p.canvas.width * 0.85, y: p.start.y } });
              assert.ok((await pixels()).length > 0, 'eraser fixture is painted');
            }
            await chooseTool(tool);
            const p = await dragPoints();
            assert.ok(p.end.x > p.board.x + p.board.width, 'gesture endpoint is outside the board');
            const before = await pixels();
            await doDrag(p);
            await assertPixelsChanged(before, `${input} ${tool}`);
            assert.equal(await page.locator('#draw-undo').isDisabled(), false, 'release commits an undo step');
            await page.locator('#draw-undo').click();
            if (tool === 'eraser') {
              assert.ok((await pixels()).length > 0, 'one undo restores the pre-erase drawing');
              assert.equal(await page.locator('#draw-undo').isDisabled(), false, 'the seed drawing is a separate prior step');
              await page.locator('#draw-undo').click();
            }
            assert.deepEqual(await pixels(), [], 'one undo restores the gesture baseline');
            assert.equal(await page.locator('#draw-undo').isDisabled(), true, 'one gesture did not create multiple history steps');
          });
        }
      }

      await run('UI-started mouse and touch gestures cannot paint the canvas', async () => {
        await reload();
        const before = await pixels(), { canvas } = await geometry();
        const ui = await page.locator('#draw-tool-summary').boundingBox();
        await page.mouse.move(ui.x + ui.width / 2, ui.y + ui.height / 2); await page.mouse.down();
        await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 4 }); await page.mouse.up();
        assert.deepEqual(await pixels(), before, 'mouse started on tool UI does not become a drawing stroke');
        await touch('touchStart', [touchPoint(61, { x: ui.x + ui.width / 2, y: ui.y + ui.height / 2 })]);
        await touch('touchMove', [touchPoint(61, { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 })]);
        await touch('touchCancel', []);
        assert.deepEqual(await pixels(), before, 'touch started on tool UI does not become a drawing stroke');
      });

      await run('selection creation released outside the board keeps its clipped range', async () => {
        await reload(); await chooseTool('select');
        const p = await dragPoints();
        await page.mouse.move(p.start.x, p.start.y); await page.mouse.down();
        await page.mouse.move(p.end.x, p.end.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(50);
        const frame = page.locator('.draw-selection');
        assert.equal(await frame.isVisible(), true, 'selection survives release outside the board');
        const bounds = await frame.evaluate(node => ({ x: Number(node.dataset.x), y: Number(node.dataset.y), width: Number(node.dataset.width), height: Number(node.dataset.height) }));
        assert.ok(bounds.width > 1 && bounds.width <= 16 && bounds.height >= 1 && bounds.height <= 16, `selection intersects canvas bounds: ${JSON.stringify(bounds)}`);
      });

      await run('selection movement released outside the board preserves its pending transform', async () => {
        await reload();
        const g = await geometry();
        await mouseDrag({ start: { x: g.canvas.x + g.canvas.width * .25, y: g.canvas.y + g.canvas.height * .25 }, end: { x: g.canvas.x + g.canvas.width * .7, y: g.canvas.y + g.canvas.height * .7 } });
        await chooseTool('select');
        await page.mouse.move(g.canvas.x + g.canvas.width * .25, g.canvas.y + g.canvas.height * .25);
        await page.mouse.down();
        await page.mouse.move(g.canvas.x + g.canvas.width * .7, g.canvas.y + g.canvas.height * .7, { steps: 4 });
        await page.mouse.up(); await page.waitForTimeout(40);
        const frame = page.locator('.draw-selection');
        const initial = await frame.evaluate(node => ({ x: Number(node.dataset.x), y: Number(node.dataset.y), width: Number(node.dataset.width), height: Number(node.dataset.height) }));
        const p = await dragPoints();
        const start = { x: g.canvas.x + g.canvas.width * .47, y: g.canvas.y + g.canvas.height * .47 };
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        await page.mouse.move(p.end.x, p.end.y, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(50);
        assert.equal(await frame.isVisible(), true, 'selection remains available after outside release');
        const next = await frame.evaluate(node => ({ x: Number(node.dataset.x), y: Number(node.dataset.y), width: Number(node.dataset.width), height: Number(node.dataset.height) }));
        assert.ok(next.x !== initial.x || next.y !== initial.y, `pending move is retained: ${JSON.stringify({ initial, next })}`);
      });

      await run('native mouse capture loss preserves accepted samples; late lostcapture cannot undo a committed pen', async () => {
        await reload();
        const p = await dragPoints(), canvas = page.locator('#draw-canvas');
        await page.mouse.move(p.start.x, p.start.y); await page.mouse.down();
        await page.mouse.move(p.start.x + p.canvas.width * .2, p.start.y, { steps: 2 });
        const pointerId = await canvas.evaluate(node => {
          const ids = [...Array(32)].map((_, index) => index + 1).filter(id => node.hasPointerCapture(id));
          return ids.at(-1) ?? null;
        });
        assert.notEqual(pointerId, null, 'canvas owns the native mouse capture');
        await canvas.evaluate((node, id) => node.releasePointerCapture(id), pointerId); await page.waitForTimeout(60);
        const accepted = await pixels();
        assert.ok(accepted.length > 0, 'unexpected native mouse capture loss preserves accepted stroke samples');
        assert.equal(await page.locator('#draw-undo').isDisabled(), false, 'capture loss closes the mouse transaction');
        await page.locator('#draw-undo').click();
        assert.deepEqual(await pixels(), [], 'one undo restores the canvas before the captured mouse stroke');
        await page.mouse.up();

        await reload();
        const q = await dragPoints(); await page.mouse.move(q.start.x, q.start.y); await page.mouse.down();
        await page.mouse.move(q.start.x + q.canvas.width * .2, q.start.y, { steps: 2 }); await page.mouse.up(); await page.waitForTimeout(40);
        const committed = await pixels(); assert.ok(committed.length > 0, 'pointerup commits the stroke');
        await canvas.evaluate(node => node.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1, pointerType: 'mouse' })));
        assert.deepEqual(await pixels(), committed, 'late lostpointercapture does not roll back a committed stroke');
        assert.equal(await page.locator('#draw-undo').isDisabled(), false);
      });

      await run('touchcancel rolls back a live pen stroke', async () => {
        await reload();
        const p = await dragPoints();
        await touch('touchStart', [touchPoint(71, p.start)]);
        await touch('touchMove', [touchPoint(71, { x: p.start.x + p.canvas.width * .25, y: p.start.y })]);
        assert.ok((await pixels()).length > 0, 'touch stroke has live pixels before cancellation');
        await touch('touchCancel', []);
        assert.deepEqual(await pixels(), [], 'true touchcancel restores pixels from before the stroke');
        assert.equal(await page.locator('#draw-undo').isDisabled(), true);
      });

      await run('middle-button and space pan continue outside the board and stop on release', async () => {
        for (const mode of ['middle', 'space']) {
          await reload();
          let p = await dragPoints();
          await page.mouse.move(p.start.x, p.start.y); await page.mouse.wheel(0, -500); await page.waitForTimeout(80);
          p = await dragPoints();
          const transform = () => page.locator('#draw-canvas').evaluate(node => node.style.transform);
          const before = await transform();
          await page.mouse.move(p.start.x, p.start.y);
          if (mode === 'space') await page.keyboard.down('Space');
          await page.mouse.down({ button: mode === 'middle' ? 'middle' : 'left' });
          await page.mouse.move(p.end.x, p.end.y, { steps: 5 });
          const moved = await transform(); assert.notEqual(moved, before, `${mode} pan follows its pointer outside the board`);
          await page.mouse.up({ button: mode === 'middle' ? 'middle' : 'left' });
          if (mode === 'space') await page.keyboard.up('Space');
          await page.mouse.move(p.end.x + 15, p.end.y + 10);
          assert.equal(await transform(), moved, `${mode} pan stops when its owning pointer releases`);
          assert.deepEqual(await pixels(), [], 'panning does not paint');
        }
      });

      await run('unrelated pointer release does not end the owning stroke', async () => {
        await reload();
        const before = await pixels(), p = await dragPoints();
        await mouseDrag(p, { unrelated: true });
        assert.ok((await pixels()).length > 0, 'owning pointer continues and commits after unrelated release');
        await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), before);
      });

      if (errors.length) failures.push(`${viewport.width}x${viewport.height}: page errors: ${errors.join(' | ')}`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}

console.log(`BROWSER: ${failures.length ? 'FAIL' : 'PASS'} (${results.length} checks passed, ${failures.length} failed)`);
if (failures.length) process.exitCode = 1;
