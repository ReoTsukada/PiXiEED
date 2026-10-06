/** Isolated component checks: explicit navigation must differ from internal dismissal. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_RESULT_NAV_OUTPUT || '/tmp/pixieed-result-navigation-20261006';
await mkdir(output, { recursive: true });
const results = [];
for (const engine of ['chromium', 'webkit']) {
  const modulePath = engine === 'webkit'
    ? process.env.PIXIEED_WEBKIT_PLAYWRIGHT_MODULE || '/tmp/pixieed-selection-webkit-runtime/node_modules/playwright/index.mjs'
    : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const runtime = await import(pathToFileURL(modulePath).href);
  const browser = await runtime[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
  try { for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== new URL(base).origin) return route.abort();
      if (url.pathname === '/__result-navigation-fixture__') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/tool-result-view.css"><body><main><section id="source"><button id="original">元の操作</button></section></main><nav class="app-tabs" style="position:fixed;bottom:0;left:0;right:0;height:64px"><button id="nav" aria-label="元の中央操作">中央操作</button></nav><script type="module">
        import {createToolResultView} from '/js/tool-result-view.mjs?rev=20261006-result-list-1';
        window.returns=0;window.navCalls=0;window.shareCalls=0;
        document.querySelector('#nav').addEventListener('click',()=>window.navCalls++);
        const main=document.querySelector('main'),canvas=document.createElement('canvas');canvas.width=canvas.height=16;
        canvas.getContext('2d').fillRect(2,2,3,3);
        window.setup=(navigation=true)=>{ window.view?.dispose();window.returns=0;window.navCalls=0;window.shareCalls=0;
          window.view=createToolResultView({key:'spot-result',main, ...(navigation?{returnLabel:'問題一覧に戻る',returnHref:'/play/spot-difference/',onReturn:()=>window.returns++}:{returnLabel:'編集に戻る'})});
          window.openResult=()=>view.show({title:'完成しました',preview:canvas,actions:[{label:'共有する',onClick:async()=>{try{window.shareCalls++;throw new DOMException('cancelled','AbortError');}catch{}}}]});
        };setup();window.ready=true;
      </script></body></html>` });
      return route.continue();
    });
    const page = await context.newPage(), errors = [], checks = [], label = `${engine}-${viewport.width}x${viewport.height}`;
    page.setDefaultTimeout(5000); page.on('pageerror', e => errors.push(e.message));
    const show = async () => { await page.evaluate(() => openResult()); await page.locator('.px-tool-result__return').waitFor({ state: 'visible' }); };
    const count = () => page.evaluate(() => returns);
    try {
      await page.goto(base + '/__result-navigation-fixture__'); await page.waitForFunction(() => window.ready);
      await show(); assert.equal(await page.locator('.px-tool-result__return').getAttribute('href'), '/play/spot-difference/');
      await page.evaluate(() => view.close()); assert.equal(await count(), 0); assert.equal(await page.locator('#source').evaluate(n => n.inert), false);
      checks.push('internal close restores source without navigating');
      await show(); await page.locator('.px-tool-result__return').click(); assert.equal(await count(), 1); assert.equal(await page.locator('.px-tool-result').isVisible(), false);
      checks.push('real list link activates onReturn once');
      await show(); await page.locator('#nav').click(); assert.equal(await count(), 2); assert.equal(await page.evaluate(() => navCalls), 0);
      assert.equal(await page.locator('#nav').getAttribute('aria-label'), '元の中央操作');
      checks.push('central navigation calls onReturn once and restores its original state');
      await show(); await page.keyboard.press('Escape'); assert.equal(await count(), 3);
      checks.push('result Escape uses explicit list navigation');
      await show(); const url = page.url(); await page.getByRole('button', { name: '共有する', exact: true }).click();
      assert.equal(await page.evaluate(() => shareCalls), 1); assert.equal(await count(), 3); assert.equal(page.url(), url); assert.equal(await page.locator('.px-tool-result').isVisible(), true);
      checks.push('cancelled sharing leaves navigation and result unchanged');
      await page.evaluate(() => view.dispose()); assert.equal(await count(), 3); assert.equal(await page.locator('#source').evaluate(n => n.inert), false);
      checks.push('dispose never invokes list navigation');
      await page.evaluate(() => setup(false)); await show(); assert.equal(await page.locator('.px-tool-result__return').evaluate(n => n.tagName), 'BUTTON');
      await page.locator('.px-tool-result__return').click(); assert.equal(await count(), 0); assert.equal(await page.locator('.px-tool-result').isVisible(), false);
      checks.push('unconfigured editors retain ordinary return buttons and close behavior');
      assert.deepEqual(errors, []); results.push({ label, checks, errors });
      console.log('PASS', label, checks.length);
    } finally { await context.close(); await writeFile(output + '/results.json', JSON.stringify({ results }, null, 2)); }
  } } finally { await browser.close(); }
}
console.log('PASS', results.length, 'conditions', results.reduce((n, r) => n + r.checks.length, 0), 'navigation checks');
