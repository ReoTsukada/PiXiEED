#!/usr/bin/env node
/** Isolated localhost browser; substitutes ad responses and never calls a real ad provider. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_UI_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright = await import(pathToFileURL(modulePath).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
const paths = [
  '/', '/tools/', '/draw/', '/audio/', '/jigsaw/', '/spot-difference/', '/hidden-object/',
  '/play/spot-difference/', '/play/hidden-object/', '/globe/', '/about/', '/guide/',
  '/stores/', '/stores/ecowashcafe-nakanoshima.html', '/stores/cafe-hoshi.html',
  '/stores/kaze-machi.html', '/stores/yoru-akari.html', '/pixel-camera.html',
  '/globe-prototype.html?embed=1&tool=telescope', '/pixiee-lens/', '/output/', '/output/work/?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
];
const manualPages = ['/', '/tools/', '/about/', '/guide/', '/stores/', '/stores/ecowashcafe-nakanoshima.html'];
const offerwallPage = '/output/work/?id=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sourcePrefix = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
let checks = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  let requests = [];
  let rewardedRequests = [];
  await context.addInitScript(() => { window.googlefc = { MessageTypeEnum: { OFFERWALL: 3 } }; });
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(sourcePrefix)) {
      requests.push(url);
      return route.fulfill({
        contentType: 'application/javascript',
        body: `window.__PIXIEED_AD_TEST_LOADS__=(window.__PIXIEED_AD_TEST_LOADS__||0)+1;
          const q=window.adsbygoogle||[]; const fill=()=>{const n=[...document.querySelectorAll('ins.adsbygoogle')].find(x=>!x.dataset.adStatus);if(n){n.dataset.adStatus='filled';n.innerHTML='<iframe title="stub ad"></iframe>'}};
          window.adsbygoogle={push:()=>{fill();return 1}}; q.forEach(()=>fill());`
      });
    }
    if (url.includes('securepubads.g.doubleclick.net')) rewardedRequests.push(url);
    return new URL(url).origin === origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  for (const path of paths) {
    requests = []; rewardedRequests = [];
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    const isOfferwallPage = path === offerwallPage;
    assert.equal(await page.locator('script[src*="adsense-auto.js"]').count(), isOfferwallPage ? 1 : 0, `${path}: only the output workspace loads the existing AdSense entrypoint`);
    if (!manualPages.includes(path) && !isOfferwallPage) {
      assert.equal(await page.locator('script[src*="adsbygoogle.js"]').count(), 0, `${path}: no loader without a result or manual placement`);
      assert.equal(requests.length, 0, `${path}: no provider request without a placement`);
    }
    if (isOfferwallPage) {
      assert.equal(requests.length, 1, 'the private output workspace uses the existing provider script once');
      assert.deepEqual(await page.evaluate(() => {
        let args;
        window.googlefc?.controlledMessagingFunction?.({ proceed: (...values) => { args = values; } });
        return args;
      }), [true], 'the exact output workspace pathname permits Offerwall policy');
    } else if (path !== '/output/' && await page.evaluate(() => typeof window.googlefc?.controlledMessagingFunction === 'function')) {
      assert.deepEqual(await page.evaluate(() => {
        let args;
        window.googlefc.controlledMessagingFunction({ proceed: (...values) => { args = values; } });
        return args;
      }), [false, [3]], `${path}: other pages suppress Offerwall only`);
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('pixieed:pass:v1')), null, `${path}: ordinary ads grant no pass`);
    assert.equal(rewardedRequests.length, 0, `${path}: no unsolicited rewarded ad`);
    if (manualPages.includes(path)) {
      const units = page.locator('[data-display-ad]');
      const count = await units.count();
      assert.ok(count >= 1, `${path}: static placement exists`);
      for (let i = 0; i < count; i++) {
        await units.nth(i).scrollIntoViewIfNeeded();
        await page.waitForFunction(() => window.__PIXIEED_AD_TEST_LOADS__ > 0);
      }
      await page.waitForFunction((expected) => document.querySelectorAll('ins.adsbygoogle[data-ad-status="filled"]').length === expected, count);
      const state = await page.evaluate(() => {
        const scripts = [...document.querySelectorAll('script[src*="adsbygoogle.js"]')];
        return { scripts: scripts.length, correct: scripts.every((node) => node.parentElement === document.head && node.async && node.crossOrigin === 'anonymous') };
      });
      assert.equal(requests.length, 1, `${path}: provider loader is deduplicated`);
      assert.equal(state.scripts, 1, path);
      assert.equal(state.correct, true, path);
    }
    checks++;
  }
  // Browser-history and reload checks use only a local fixture and IndexedDB-staged pixels.
  await page.goto(`${base}/tests/creation-suite/output-fixture.browser.html`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '透明背景つき PNG を開く' }).click();
  await page.waitForURL(/\/output\/work\/\?id=/);
  await page.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:'));
  const firstOutputUrl = page.url();
  await page.goBack();
  await page.waitForURL(/\/tests\/creation-suite\/output-fixture\.browser\.html$/);
  await page.goForward();
  await page.waitForURL(/\/output\/work\/\?id=/);
  await page.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:'));
  assert.equal(page.url(), firstOutputUrl, 'Forward restores the same opaque output id');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:'));
  assert.equal(page.url(), firstOutputUrl, 'reload keeps the IndexedDB output id and download available');
  const readyDownload = page.waitForEvent('download');
  await page.locator('#output-download').click();
  await readyDownload;
  checks += 4;

  // The loader may fail or return without an ad fill; the ordinary download remains usable.
  const blockedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const blockedRequests = [];
  await blockedContext.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(sourcePrefix)) { blockedRequests.push(url); return route.abort(); }
    if (new URL(url).origin === origin) return route.continue();
    return route.abort();
  });
  const blockedPage = await blockedContext.newPage();
  await blockedPage.goto(`${base}/tests/creation-suite/output-fixture.browser.html`, { waitUntil: 'domcontentloaded' });
  await blockedPage.getByRole('button', { name: '透明背景つき PNG を開く' }).click();
  await blockedPage.waitForURL(/\/output\/work\/\?id=/);
  await blockedPage.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:'));
  assert.equal(await blockedPage.locator('#output-download').isEnabled(), true, 'output is ready with the provider blocked');
  const blockedDownload = blockedPage.waitForEvent('download');
  await blockedPage.locator('#output-download').click();
  await blockedDownload;
  assert.match(await blockedPage.locator('#output-status').textContent(), /ダウンロードを開始しました/, 'a blocked provider does not replace or disable normal save');
  assert.equal(blockedRequests.length, 1, 'the existing provider request was intercepted locally');
  await blockedContext.close();
  checks += 2;
  for (const path of ['/privacy/', '/profile/', '/collection/', '/admin/', '/game/', '/404.html']) {
    requests = []; rewardedRequests = [];
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('script[src*="adsbygoogle.js"],script[src*="adsense-auto.js"]').count(), 0, path);
    assert.equal(requests.length, 0, path);
    checks++;
  }
  for (const path of ['/pixel-camera.html', '/globe-prototype.html?embed=1', '/pixiee-lens/?embed=1']) {
    requests = [];
    await page.goto(base + '/privacy/', { waitUntil: 'domcontentloaded' });
    await page.evaluate((path) => {
      const iframe = document.createElement('iframe'); iframe.id = 'ad-test-frame'; iframe.src = path; document.body.append(iframe);
    }, path);
    const child = page.frames().find((frame) => frame !== page.mainFrame());
    await child.waitForFunction(() => document.readyState !== 'loading');
    assert.equal(await child.locator('script[src*="adsbygoogle.js"],script[src*="adsense-auto.js"]').count(), 0, path);
    assert.equal(requests.length, 0, `${path}: iframe never requests ads`);
    checks++;
  }
  await context.close();

  for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
    const layout = await browser.newContext({ viewport });
    const view = await layout.newPage();
    for (const path of ['/', '/tools/', '/draw/', '/audio/', '/jigsaw/']) {
      await view.goto(base + path, { waitUntil: 'domcontentloaded' });
      await view.locator('.px-header-brand').waitFor();
      assert.equal(await view.locator('[data-header-pass]').count(), 0, 'free tools have no time gate');
      const bounds = await view.locator('.px-header-brand').boundingBox();
      assert.ok(bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width + 1, path);
      assert.equal(await view.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, path);
      checks++;
    }
    await layout.close();
  }
  console.log(`${engine}: ${checks}/${checks} PASS; local provider stub/block only, real ad delivery UNTESTED`);
} finally { await browser.close(); }
