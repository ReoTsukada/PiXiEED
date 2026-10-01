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
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
const paths = [
  '/', '/tools/', '/draw/', '/audio/', '/jigsaw/', '/spot-difference/', '/hidden-object/',
  '/play/spot-difference/', '/play/hidden-object/', '/globe/', '/about/', '/guide/',
  '/stores/', '/stores/ecowashcafe-nakanoshima.html', '/stores/cafe-hoshi.html',
  '/stores/kaze-machi.html', '/stores/yoru-akari.html',
  '/pixel-camera.html', '/globe-prototype.html?embed=1&tool=telescope', '/pixiee-lens/'
];
const source = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9801602250480253';
let checks = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let requests = [];
  let rewardedRequests = [];
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url === source) {
      requests.push(url);
      return route.fulfill({ contentType: 'application/javascript', body: 'window.__PIXIEED_AD_TEST_LOADS__ = (window.__PIXIEED_AD_TEST_LOADS__ || 0) + 1;' });
    }
    if (url.includes('securepubads.g.doubleclick.net')) rewardedRequests.push(url);
    return new URL(url).origin === origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  for (const path of paths) {
    requests = []; rewardedRequests = [];
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__PIXIEED_AD_TEST_LOADS__ === 1);
    const state = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('script[src*="adsbygoogle.js"]')];
      return {
        scripts: nodes.length,
        correct: nodes.every((node) => node.parentElement === document.head && node.async && node.crossOrigin === 'anonymous'),
        pass: localStorage.getItem('pixieed:pass:v1')
      };
    });
    assert.equal(requests.length, 1, `${path}: only the top-level page requests AdSense`);
    assert.equal(state.scripts, 1, path);
    assert.equal(state.correct, true, path);
    assert.equal(state.pass, null, `${path}: ordinary ads grant no pass`);
    assert.equal(rewardedRequests.length, 0, `${path}: no unsolicited rewarded ad`);
    checks++;
  }
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
    await page.frameLocator('#ad-test-frame').locator('script[src*="adsense-auto.js"]').waitFor({ state: 'attached' });
    const child = page.frames().find((frame) => frame !== page.mainFrame());
    await child.waitForFunction(() => document.readyState !== 'loading');
    assert.equal(await child.locator('script[src*="adsbygoogle.js"]').count(), 0, path);
    assert.equal(requests.length, 0, `${path}: iframe never requests ads`);
    checks++;
  }
  await context.close();

  // Check existing touch controls and narrow/desktop layouts with an inert ad response.
  for (const viewport of [{ width: 320, height: 568 }, { width: 1280, height: 800 }]) {
    const layout = await browser.newContext({ viewport });
    await layout.route('**/*', (route) => {
      const url = route.request().url();
      if (url === source) return route.fulfill({ contentType: 'application/javascript', body: '' });
      return new URL(url).origin === origin ? route.continue() : route.abort();
    });
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
  console.log(`${engine}: ${checks}/${checks} PASS; local stub only, real ad delivery UNTESTED`);
} finally { await browser.close(); }
