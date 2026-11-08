#!/usr/bin/env node
/** Local production-build smoke checks. Isolated storage; no hardware or external traffic. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4288';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = process.env.PIXIEED_CONTROLS_OUTPUT || '/tmp/pixieed-creation-controls';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser = await chromium.launch({ headless: true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? { executablePath: process.env.PIXIEED_CHROME_EXECUTABLE } : {}) });
const report = { browser: browser.version(), cases: [], failures: [], limitations: ['Synthetic camera denial; real camera/microphone, physical devices and production user storage are untested.'] };
await mkdir(out, { recursive: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) for (const mode of ['draw', 'audio', 'camera']) {
    const row = { viewport, mode, checks: [], pageErrors: [] }; report.cases.push(row);
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
    await context.addInitScript(() => { window.__cameraRequests = 0; navigator.mediaDevices.getUserMedia = async () => { window.__cameraRequests++; throw new DOMException('Synthetic camera denial', 'NotAllowedError'); }; });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => row.pageErrors.push(error.message));
    const ready = () => page.waitForFunction(mode => window.__PIXIEED_CREATION_HOST__?.runtime?.state.active && document.body.dataset.creationMode === mode && !document.querySelector('#main').inert && !document.body.hasAttribute('data-creation-transition'), mode);
    const active = () => page.evaluate(() => window.__PIXIEED_CREATION_HOST__?.active && document.documentElement.dataset.toolDirect === 'work');
    const snapshot = () => page.evaluate(() => window.__PIXIEED_CREATION_HOST__.getState());
    try {
      await page.goto(`${base}/tools/start/${mode}/?workspace=1&runtime=direct`);
      await page.locator('#project-start-picker').waitFor({ state: 'visible' });
      await page.locator('#project-start-new').click(); await ready();
      row.checks.push('exact direct workspace route starts');
      for (let repeat = 0; repeat < 2; repeat++) {
        await page.locator('#creation-settings-open').click();
        await page.locator('#creation-settings-panel').waitFor({ state: 'visible' });
        await page.keyboard.press('Escape');
        await page.locator('#creation-settings-panel').waitFor({ state: 'hidden' });
        assert.equal(await active(), true, 'Escape dismisses settings, not the editor');
      }
      row.checks.push('repeated Settings/Escape keeps editor active');
      await page.locator('#creation-file-open').click();
      await page.locator('#pxd-panel').waitFor({ state: 'visible' });
      await page.locator('#project-close').click();
      assert.equal(await active(), true);
      row.checks.push('file panel opens and closes');
      if (mode === 'camera') {
        await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.startupPhase === 'error');
        const requests = await page.evaluate(() => window.__cameraRequests);
        await page.locator('#capture').click();
        await page.waitForFunction(previous => window.__cameraRequests > previous, requests);
        assert.equal(await active(), true);
        row.checks.push('denied camera retains retry and the tested file panel');
      } else {
        if (mode === 'audio') {
          await page.locator('#draw-music-play').click();
          await page.locator('#draw-music-feedback').waitFor({ state: 'visible' });
          const icons = await page.locator('#draw-music-feedback .draw-music-action-icon').evaluateAll(nodes => nodes.filter(n => n.checkVisibility()).map(n => { const r = n.getBoundingClientRect(); return { width: r.width, height: r.height }; }));
          assert.ok(icons.length > 0); assert.ok(icons.every(r => r.width <= 18.1 && r.height <= 18.1), 'feedback icons remain bounded');
          await page.locator('#draw-music-feedback-dismiss').click();
          await page.locator('#creation-settings-open').click();
          await page.locator('#creation-mode-settings-open').click();
          await page.locator('#draw-music-tempo').waitFor({ state: 'visible' });
          const colors = await page.locator('#draw-music-tempo').evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
          assert.deepEqual(colors, { color: 'rgb(244, 240, 228)', background: 'rgb(41, 55, 66)' });
          await page.locator('#draw-music-instrument').selectOption('triangle');
          await page.keyboard.press('Escape');
          assert.equal(await active(), true);
          row.checks.push('music feedback icon, dark value fields and instrument assignment');
        }
        const before = await snapshot(); const box = await page.locator('#draw-canvas').boundingBox();
        await page.mouse.click(box.x + box.width * .35, box.y + box.height * .45);
        const edited = await snapshot(); assert.notEqual(edited.image.hash, before.image.hash, 'canvas receives input after menus');
        await page.locator('#draw-undo').click(); assert.equal((await snapshot()).image.hash, before.image.hash);
        await page.locator('#draw-redo').click(); assert.equal((await snapshot()).image.hash, edited.image.hash);
        if (mode === 'audio') {
          await page.locator('#draw-music-play').click();
          await page.waitForFunction(() => document.querySelector('#draw-music-play').getAttribute('aria-pressed') === 'true');
          await page.locator('#draw-music-play').click();
          await page.waitForFunction(() => document.querySelector('#draw-music-play').getAttribute('aria-pressed') === 'false');
          row.checks.push('music play/stop responds');
        }
        await page.locator('[data-shell-explanation]').click();
        await page.locator('[data-embed-start]').click(); await ready();
        assert.equal((await snapshot()).image.hash, edited.image.hash);
        row.checks.push('draw/undo/redo and explanation/resume preserve pixels');
      }
      assert.deepEqual(row.pageErrors, []); console.log('PASS', viewport.width, mode, row.checks.length);
    } catch (error) { row.error = error.stack; report.failures.push({ viewport, mode, error: error.message }); console.error('FAIL', viewport.width, mode, error.message); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); }
if (report.failures.length) process.exitCode = 1;
