#!/usr/bin/env node
/** Local-only QA: every external request is blocked or replaced; no real ads are viewed. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless: true });
const paths = ['/', '/tools/', '/draw/', '/audio/', '/jigsaw/', '/spot-difference/', '/hidden-object/', '/play/spot-difference/', '/play/hidden-object/', '/globe/', '/pixel-camera.html'];
const expired = JSON.stringify({ until: 1 });
let checks = 0;
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript((expired) => localStorage.setItem('pixieed:pass:v1', expired), expired);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ contentType: 'application/javascript', body: `
        window.googlefc = window.googlefc || {}; googlefc.MessageTypeEnum = { OFFERWALL: 3 };
        window.__policyArgs = null; googlefc.controlledMessagingFunction?.({proceed: (...args) => window.__policyArgs = args});
        window.__adRequests = 0;
        const mark = () => { window.__adRequests++; document.querySelectorAll('ins.px-display-ad__unit').forEach(node => { node.dataset.adsbygoogleStatus = 'done'; node.dataset.adStatus = 'filled'; }); };
        const queue = window.adsbygoogle || []; window.adsbygoogle = { push: mark }; queue.forEach(mark);
      ` });
      return url.origin === origin ? route.continue() : route.abort();
    });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const path of paths) {
      errors.length = 0;
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.locator('.px-header-brand').waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.locator('[data-header-pass],.px-pass').count(), 0, path);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${path}: horizontal fit`);
      assert.equal(await page.evaluate(() => localStorage.getItem('pixieed:pass:v1')), expired, 'old storage retained');
      const policyArgs = await page.evaluate(() => {
        const policy = window.googlefc?.controlledMessagingFunction;
        if (!policy) return null;
        window.googlefc.MessageTypeEnum = { OFFERWALL: 3 };
        let result; policy({ proceed: (...args) => { result = args; } }); return result;
      });
      assert.deepEqual(policyArgs, [false, [3]], `${path}: policy still suppresses only Offerwall when invoked`);
      assert.deepEqual(errors, [], `${path}: no application exceptions`);
      checks++;
    }
    // Use real controls, with no pass in storage, to edit the previously gated canvas and instruments.
    await page.goto(base + '/draw/', { waitUntil: 'domcontentloaded' });
    await page.locator('[data-draw-size="256"]').waitFor({ state: 'attached' });
    await page.locator('details.draw-import > summary').click();
    await page.locator('[data-draw-size="256"]').click();
    await page.waitForFunction(() => document.querySelector('#draw-canvas')?.width === 256);
    assert.equal(await page.locator('.px-pass').count(), 0); checks++;
    await page.locator('#draw-canvas').click({ position: { x: 20, y: 20 } });
    await page.locator('#draw-save').click();
    await page.waitForFunction(() => document.querySelector('#draw-status')?.textContent.includes('保存しました'));
    await page.goto(base + '/audio/', { waitUntil: 'domcontentloaded' });
    await page.locator('#project-open').click();
    await page.locator('.project-imports > summary').click();
    await page.locator('#project-import-list .project-card').first().click();
    await page.waitForFunction(() => document.querySelector('#audio-pixel-canvas')?.width === 256);
    await page.locator('#audio-current').click();
    await page.locator('#audio-color-editor-panel [data-dce-view="sound"]').click();
    const instruments = page.locator('#audio-palette-rows select');
    await instruments.first().selectOption('piano');
    assert.equal(await instruments.first().inputValue(), 'piano');
    assert.equal(await page.locator('#audio-pixel-canvas').getAttribute('width'), '256', 'instrument changes preserve the imported image');
    assert.equal(await page.locator('.px-pass').count(), 0); checks++;
    // A completed export shows the standard result view; the editable stage stays suspended only until Back.
    for (const [path, key] of [['/draw/', 'draw-result'], ['/audio/', 'audio-result'], ['/jigsaw/', 'jigsaw-result'], ['/play/spot-difference/', 'spot-result'], ['/play/hidden-object/', 'find-result'], ['/pixel-camera.html', 'camera-result']]) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      await page.locator('.px-header-brand').waitFor();
      await page.evaluate(async (key) => {
        const { createToolResultView } = await import('/js/tool-result-view.mjs');
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        window.__result = createToolResultView({ key, main: document.querySelector('main') });
        window.__result.show({ title: '確認用の完成作品', preview: canvas });
      }, key);
      await page.locator('[data-tool-result-view]').waitFor();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const layout = await page.evaluate(() => {
        const ads = [...document.querySelectorAll('[data-tool-result-view] ins')];
        const controls = [...document.querySelectorAll('[data-tool-result-view] button,.app-tabs')].map(n => n.getBoundingClientRect());
        return { overflowX: document.documentElement.scrollWidth > innerWidth + 1,
          overflowY: document.documentElement.scrollHeight > innerHeight + 2,
          overlaps: ads.some(a => { const r = a.getBoundingClientRect(); return controls.some(c => c.width && c.height && c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top); }),
          units: ads.length };
      });
      assert.equal(layout.overflowX, false, `${key}: horizontal fit`);
      assert.equal(layout.overflowY, false, `${key}: no forced scroll`);
      assert.equal(layout.overlaps, false, `${key}: ads clear of actions`);
      await page.locator('.px-tool-result__return').click();
      assert.equal(await page.locator('[data-tool-result-view]').isVisible(), false);
      assert.equal(await page.locator('[data-tool-result-suspended]').count(), 0);
      checks++;
    }
    await context.close();
  }
  console.log(`Chromium: ${checks}/${checks} PASS; external ads mocked, production and physical devices UNTESTED`);
} finally { await browser.close(); }
