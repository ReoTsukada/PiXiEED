#!/usr/bin/env node
/** Real touch input on a local production build, with disposable synthetic work only. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4289';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_TOUCH_OUTPUT || '/tmp/pixieed-draw-touch';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ headless: true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}) });
const report = { browser: browser.version(), cases: [], failures: [], limitations: ['Mobile emulation with trusted Chromium touch input, not a physical iPhone/Android; no production access or user storage.'] };
const ready = page => page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.state.active && !document.querySelector('#main').inert && !document.body.hasAttribute('data-creation-transition') && !document.documentElement.hasAttribute('data-direct-loading'));
const snapshot = page => page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState());
async function context(viewport) {
  const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 3, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
  return context;
}
async function touch(page, x = .35, y = .4) {
  const r = await page.locator('#draw-canvas').boundingBox();
  await page.touchscreen.tap(r.x + r.width * x, r.y + r.height * y);
}
async function pinch(page, context, shrink = false) {
  const box = await page.locator('#draw-canvas').boundingBox(), board = await page.locator('.draw-board').boundingBox();
  const x = Math.max(board.x + 80, Math.min(board.x + board.width - 80, box.x + box.width / 2));
  const y = Math.max(board.y + 20, Math.min(board.y + board.height - 20, box.y + box.height / 2));
  const session = await context.newCDPSession(page);
  const points = distance => [{ x: x - distance, y, id: 1, radiusX: 3, radiusY: 3 }, { x: x + distance, y, id: 2, radiusX: 3, radiusY: 3 }];
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(shrink ? 65 : 25) });
    for (const distance of (shrink ? [60, 55, 50, 45, 40, 35, 30, 25] : [30, 35, 40, 45, 50, 55, 60, 65])) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(distance) });
      await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await session.detach(); }
}
async function check(name, viewport, run) {
  const ctx = await context(viewport), page = await ctx.newPage(), row = { name, viewport, errors: [] };
  report.cases.push(row); page.setDefaultTimeout(15000); page.on('pageerror', e => row.errors.push(e.message));
  try { await run(page, ctx, row); assert.deepEqual(row.errors, []); row.result = 'PASS'; console.log('PASS', name, viewport.width); }
  catch (error) { row.result = 'FAIL'; row.error = error.stack; report.failures.push({ name, viewport, error: error.message }); console.error('FAIL', name, viewport.width, error.message); }
  finally { await ctx.close(); }
}
await mkdir(output, { recursive: true });
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) for (const mode of ['draw', 'audio']) {
    await check(`${mode}-touch`, viewport, async (page, ctx, row) => {
      await page.goto(`${base}/tools/start/${mode}/?workspace=1&runtime=direct`); await ready(page);
      await page.evaluate(() => {
        window.__touchEvidence = [];
        document.addEventListener('pointerdown', e => window.__touchEvidence.push({ pointerType: e.pointerType, trusted: e.isTrusted, target: e.target.id }), true);
      });
      const initial = await snapshot(page);
      await touch(page); const drawn = await snapshot(page);
      assert.notEqual(drawn.image.hash, initial.image.hash, 'a trusted finger tap draws a pixel');
      await page.locator('#draw-undo').tap(); assert.equal((await snapshot(page)).image.hash, initial.image.hash);
      await page.locator('#draw-redo').tap(); assert.equal((await snapshot(page)).image.hash, drawn.image.hash);
      await page.locator('#creation-settings-open').tap(); await page.locator('#creation-settings-panel').waitFor({ state: 'visible' });
      await page.locator('#creation-settings-open').tap(); await page.locator('#creation-settings-panel').waitFor({ state: 'hidden' });
      await pinch(page, ctx);
      const view = await page.evaluate(() => ({ scale: visualViewport.scale, transform: getComputedStyle(document.querySelector('#draw-canvas')).transform,
        touchAction: getComputedStyle(document.querySelector('#draw-canvas')).touchAction, evidence: window.__touchEvidence }));
      assert.equal(view.scale, 1, 'pinch changes the canvas, not the page');
      assert.equal(view.touchAction, 'none');
      assert.ok(Number(view.transform.match(/^matrix\(([^,]+)/)?.[1]) > 2, 'canvas zoom exceeds 2x');
      assert.equal((await snapshot(page)).image.hash, drawn.image.hash, 'pinch adds no accidental pixel');
      assert.ok(view.evidence.filter(e => e.target === 'draw-canvas').length >= 3);
      assert.ok(view.evidence.every(e => e.trusted && e.pointerType === 'touch'), 'no mouse or synthetic DOM event stands in for touch');
      await pinch(page, ctx, true);
      await touch(page, .6, .6); const afterPinch = await snapshot(page);
      assert.notEqual(afterPinch.image.hash, drawn.image.hash, 'single-finger drawing resumes after pinch');
      await page.locator('[data-shell-explanation]').tap(); await page.locator('[data-embed-start]').tap(); await ready(page);
      assert.equal((await snapshot(page)).image.hash, afterPinch.image.hash, 'explanation and return preserve the work');
      await touch(page, .2, .2); assert.notEqual((await snapshot(page)).image.hash, afterPinch.image.hash);
      row.checks = ['trusted tap', 'touch undo/redo', 'touch settings', 'two-finger canvas zoom without page zoom or stray pixels', 'draw after pinch', 'retained work and input after explanation'];
    });
  }
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    await check('restore-protection-recovery', viewport, async (page, ctx, row) => {
      await page.goto(`${base}/tools/start/draw/?workspace=1&runtime=direct`); await ready(page); await touch(page);
      const original = await page.evaluate(async () => {
        const ws = window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace; await ws.save();
        return { id: ws.currentProject.projectId, revision: ws.persistedProject.revisionId, hash: (await window.__PIXIEED_CREATION_HOST__.getState()).image.hash };
      });
      // A broken pointer, not damaged artwork: the saved bytes stay untouched.
      await page.evaluate(() => localStorage.setItem('pixieed:pxd:last:direct-workspace:v1', '{}'));
      await page.goto(`${base}/tools/start/draw/?workspace=1&runtime=direct`);
      await page.waitForFunction(() => window.__PIXIEED_CREATION_HOST__?.runtime?.draw.workspace.restoreError && !document.documentElement.hasAttribute('data-direct-loading'));
      assert.equal(await page.locator('#main').evaluate(n => n.inert), true, 'never unlock a blank replacement over unread work');
      const status = await page.locator('.tool-direct__status').evaluate(n => ({ text: n.textContent, client: n.clientWidth, scroll: n.scrollWidth, height: n.clientHeight, scrollHeight: n.scrollHeight, style: getComputedStyle(n).whiteSpace }));
      assert.match(status.text, /作品一覧から選び直して/);
      assert.equal(status.style, 'normal', 'the recovery explanation must wrap on phones');
      assert.ok(status.client >= 250 && status.scroll <= status.client + 1 && status.scrollHeight <= status.height + 1, 'the complete recovery instruction is readable');
      await page.getByRole('button', { name: '作品を選ぶ', exact: true }).tap();
      await page.locator('.project-gallery__tile').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.project-gallery__tile').count(), 1, 'no automatic duplicate');
      await page.locator(`.project-gallery__tile[data-project-id="${original.id}"]`).tap(); await ready(page);
      const restored = await page.evaluate(async () => {
        const ws = window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace;
        return { id: ws.currentProject.projectId, revision: ws.persistedProject.revisionId, hash: (await window.__PIXIEED_CREATION_HOST__.getState()).image.hash };
      });
      assert.deepEqual(restored, original, 'recovery preserves the saved identity, revision and pixels');
      await pinch(page, ctx); assert.equal(await page.evaluate(() => visualViewport.scale), 1);
      await pinch(page, ctx, true); await touch(page, .65, .65);
      assert.notEqual((await snapshot(page)).image.hash, original.hash, 'touch drawing works after explicit recovery');
      row.checks = ['guard remains until explicit selection', 'full explanation on phone', 'gallery opens by touch', 'same saved work, no duplicate', 'canvas pinch and touch draw recover'];
    });
  }
} finally { await browser.close(); await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2)); }
if (report.failures.length) process.exitCode = 1;
