#!/usr/bin/env node
/** Private localhost-only ellipse regressions. Isolated browser storage, no external requests. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createDrawDocument } from '../js/creation/draw-core.mjs';
import { drawShapePixels } from '../js/creation/draw-tool-operations.mjs';

const root = resolve(process.env.PIXIEED_BROWSER_ROOT || '.');
const out = resolve(process.env.PIXIEED_ELLIPSE_OUTPUT || '/tmp/pixieed-ellipse-browser');
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (!path.startsWith(`${root}/`)) throw new Error('outside root');
    if (url.pathname.endsWith('/')) path = join(path, 'index.html');
    const type = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[extname(path)] || 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type }); response.end(await readFile(path));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.PIXIEED_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const report = { cases: [], failures: [], limitations: ['Synthetic mobile touch in Chromium; physical Android/iOS devices and public deployment were not accessed.'] };
await mkdir(out, { recursive: true });
const frame = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
const pixels = page => page.locator('#draw-canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data).filter((_, i) => i % 4 === 3).map(alpha => alpha > 0));
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) for (const [tool, brushSize] of [['ellipse', 1], ['ellipse', 3], ['ellipse-fill', 1]]) {
    const mobile = viewport.width < 600;
    const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === base && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    await context.addInitScript(({ tool, brushSize }) => localStorage.setItem('pixieed:draw:input-settings:v1', JSON.stringify({ version: 1, bindings: { left: { tool, brushSize, color: 2 } } })), { tool, brushSize });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const result = { viewport, tool, brushSize, checks: [], errors: [] }; report.cases.push(result);
    page.on('pageerror', error => result.errors.push(error.message));
    try {
      await page.goto(`${base}/tools/start/draw/?workspace=1&runtime=direct`);
      await page.locator('#project-start-new').click();
      await page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.draw && document.body.dataset.creationMode === 'draw' && !document.querySelector('#main').inert);
      await page.evaluate(doc => window.__PIXIEED_CREATION_HOST__.runtime.draw.initializeDrawDocument(doc), createDrawDocument(64));
      await page.waitForFunction(tool => document.querySelector('#draw-canvas')?.dataset.tool === tool, tool); await frame(page);
      const session = mobile ? await context.newCDPSession(page) : null;
      for (const [index, [from, to]] of [
        [{ x: 4, y: 4 }, { x: 27, y: 27 }],
        [{ x: 27, y: 27 }, { x: 5, y: 5 }],
        [{ x: 4, y: 8 }, { x: 35, y: 23 }],
        [{ x: 8, y: 4 }, { x: 23, y: 35 }]
      ].entries()) {
        const box = await page.locator('#draw-canvas').boundingBox();
        const at = p => ({ x: box.x + (p.x + .5) * box.width / 64, y: box.y + (p.y + .5) * box.height / 64 });
        const a = at(from), b = at(to);
        if (session) {
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }] });
          await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...b, id: 1 }] });
        } else { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y); }
        await frame(page);
        const expected = createDrawDocument(64); drawShapePixels(expected, from, to, 2, { shape: 'ellipse', filled: tool === 'ellipse-fill', brushSize });
        const expectedPixels = expected.pixels.map(value => value >= 0);
        assert.deepEqual(await pixels(page), expectedPixels, 'live preview matches the geometry');
        if (session) await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); else await page.mouse.up();
        await frame(page);
        assert.deepEqual(await pixels(page), expectedPixels, 'release keeps exactly the preview');
        if (index === 0) await page.screenshot({ path: join(out, `${viewport.width}-${tool}-${brushSize}.png`) });
        await page.locator('#draw-undo').click(); await frame(page); assert.ok((await pixels(page)).every(value => !value), 'one Undo clears the complete shape');
        await page.locator('#draw-redo').click(); await frame(page); assert.deepEqual(await pixels(page), expectedPixels);
        await page.locator('#draw-undo').click(); await frame(page);
        result.checks.push(`case ${index + 1}: preview, release, Undo/Redo match`);
      }
      await session?.detach(); assert.deepEqual(result.errors, []); result.result = 'PASS'; console.log('PASS', viewport.width, tool, brushSize);
    } catch (error) { result.result = 'FAIL'; result.error = error.stack; report.failures.push({ viewport, tool, brushSize, error: error.message }); console.error('FAIL', viewport.width, tool, brushSize, error.message); }
    finally { await context.close(); }
  }
} finally {
  await browser.close(); await new Promise(done => server.close(done));
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
}
if (report.failures.length) process.exitCode = 1;
