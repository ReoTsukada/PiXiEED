#!/usr/bin/env node
/** Local-only placement QA. AdSense responses and unit IDs are replaced inside this browser. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_UI_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright = await import(pathToFileURL(modulePath).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
const configuration = await readFile(new URL('../data/site-config.js', import.meta.url), 'utf8');
const paths = ['/', '/tools/', '/about/', '/guide/', '/stores/', '/stores/ecowashcafe-nakanoshima.html'];
const captureNames = ['home', 'tools', 'about', 'guide', 'stores', 'store-detail'];
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function readAd(page) {
  // The existing site uses content-visibility above the slot; settle that layout before centering it.
  await page.locator('[data-display-ad]').evaluate((ad) => ad.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await frames(page);
  await page.locator('[data-display-ad]').evaluate((ad) => ad.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await frames(page);
}
const mock = `
window.__manualAdRequests = 0;
const queued = window.adsbygoogle || [];
const push = () => {
  window.__manualAdRequests++;
  const unit = document.querySelector('ins.px-display-ad__unit');
  if (!unit) throw Error('no prepared unit');
  unit.dataset.adsbygoogleStatus = 'done';
  if (window.__adMockMode === 'pending') return;
  unit.dataset.adStatus = 'filled';
  const frame = document.createElement('iframe');
  frame.title = '広告配置テスト'; frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
  frame.srcdoc = '<html lang="ja"><body style="margin:0;height:100vh;display:grid;place-items:center;background:#e6eaed;color:#56616c;font:14px sans-serif">テスト表示・実広告ではありません</body></html>';
  unit.append(frame);
};
window.adsbygoogle = { push }; queued.forEach(push);
`;
let checks = 0;
async function contextFor({ viewport, configured = false, mode = 'filled' }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript((mode) => { window.__adMockMode = mode; }, mode);
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ contentType: 'application/javascript', body: mock });
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/data/site-config.js') {
      return route.fulfill({ contentType: 'application/javascript', body: configuration + `\nfor (const key of Object.keys(displayAdConfig.slots)) displayAdConfig.slots[key] = ${configured ? '"1234567890"' : '""'};` });
    }
    return route.continue();
  });
  return context;
}
async function noOverlap(page, description) {
  const result = await page.locator('[data-display-ad]').evaluate((ad) => {
    const a = ad.getBoundingClientRect();
    const overlaps = [...document.querySelectorAll('button,a,input,select,summary')].filter((el) => {
      if (ad.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top;
    }).map((el) => el.id || el.textContent.trim().slice(0, 24));
    const unit = ad.querySelector('ins'); const u = unit.getBoundingClientRect();
    const content = ad.parentElement.classList.contains('container') ? ad.parentElement : document.querySelector('#main .container:not(.px-display-ad)');
    const c = content.getBoundingClientRect();
    return { overlaps, inScreen: a.left >= -1 && a.right <= innerWidth + 1,
      unitFits: u.left >= a.left && u.right <= a.right + 1,
      matchesContent: Math.abs(a.left - c.left) <= 1 && Math.abs(a.right - c.right) <= 1,
      centered: Math.abs((a.left + a.right) / 2 - document.documentElement.clientWidth / 2) <= 1,
      unitCentered: Math.abs((u.left + u.right - a.left - a.right) / 2) <= 1,
      labelCentered: getComputedStyle(ad.querySelector('.px-display-ad__label')).textAlign === 'center',
      height: u.height, marginTop: parseFloat(getComputedStyle(ad).marginTop),
      pass: localStorage.getItem('pixieed:pass:v1'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  assert.deepEqual(result.overlaps, [], description);
  assert.equal(result.inScreen, true); assert.equal(result.unitFits, true);
  assert.equal(result.matchesContent, true, `${description}: align with the content edges`);
  assert.equal(result.centered, true, `${description}: center the placement`);
  assert.equal(result.unitCentered, true); assert.equal(result.labelCentered, true);
  assert.ok([90, 100].includes(result.height)); assert.ok(result.marginTop >= 48);
  assert.equal(result.overflow, false); assert.equal(result.pass, null);
}
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }]) {
    const inactive = await contextFor({ viewport }); const page = await inactive.newPage();
    for (const path of paths) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded' }); await frames(page);
      await page.waitForFunction(() => typeof window.__manualAdRequests === 'number');
      const ad = page.locator('[data-display-ad]');
      assert.equal(await ad.count(), 1); assert.equal(await ad.isVisible(), false);
      assert.equal((await ad.boundingBox()), null, 'unconfigured ads occupy no space');
      assert.equal(await page.locator('ins.px-display-ad__unit').count(), 0);
      assert.equal(await page.evaluate(() => window.__manualAdRequests), 0);
      checks++;
    }
    await inactive.close();

    const configured = await contextFor({ viewport, configured: true }); const view = await configured.newPage();
    for (const path of paths) {
      await view.goto(base + path, { waitUntil: 'domcontentloaded' });
      await view.waitForFunction(() => document.querySelector('[data-display-ad]')?.hidden === false);
      const ad = view.locator('[data-display-ad]');
      await readAd(view);
      await view.waitForFunction(() => document.querySelector('[data-display-ad]')?.dataset.adState === 'filled');
      assert.equal(await view.evaluate(() => window.__manualAdRequests), 1);
      await view.screenshot({ path: `/tmp/pixieed-ad-current-${engine}.png` });
      await noOverlap(view, `${path} ${viewport.width}x${viewport.height}`);
      await readAd(view);
      assert.equal(await view.evaluate(() => window.__manualAdRequests), 1, 'scrolling never refreshes the unit');
      // Settle the iframe paint as well as the layout before saving the placement preview.
      await ad.screenshot({ path: `/tmp/pixieed-ad-unit-${engine}-${viewport.width}-${captureNames[paths.indexOf(path)]}.png` });
      await frames(view);
      await view.screenshot({ path: `/tmp/pixieed-ad-placement-${engine}-${viewport.width}-${captureNames[paths.indexOf(path)]}.png` });
      checks++;
    }
    await configured.close();
  }

  const pending = await contextFor({ viewport: { width: 390, height: 844 }, configured: true, mode: 'pending' });
  const page = await pending.newPage();
  await page.goto(base + '/tools/', { waitUntil: 'domcontentloaded' });
  const ad = page.locator('[data-display-ad]'); await readAd(page);
  await page.waitForFunction(() => window.__manualAdRequests === 1);
  const before = await ad.boundingBox();
  await page.locator('ins.px-display-ad__unit').evaluate((unit) => { unit.dataset.adStatus = 'unfilled'; });
  await page.waitForFunction(() => document.querySelector('[data-display-ad]').dataset.adState === 'unfilled');
  assert.equal(await ad.isVisible(), true, 'no reflow under the finger when an on-screen request is empty');
  assert.equal((await ad.boundingBox()).height, before.height);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('[data-display-ad]').hidden);
  checks++;
  await page.locator('ins.px-display-ad__unit').evaluate((unit) => { unit.dataset.adStatus = 'unfill-optimized'; });
  await page.waitForFunction(() => document.querySelector('[data-display-ad]').dataset.adState === 'filled');
  assert.equal(await ad.isVisible(), true, 'a late Google optimized creative is never hidden');
  checks++;
  const { mountDisplayAds } = await page.evaluate(async () => {
    const module = await import('/js/display-ads.mjs?rev=20260929-display-units-1');
    module.mountDisplayAds(); return { mountDisplayAds: true };
  });
  assert.equal(mountDisplayAds, true);
  assert.equal(await page.evaluate(() => window.__manualAdRequests), 1, 'repeat mount is idempotent');
  assert.equal(await page.locator('ins.px-display-ad__unit').count(), 1); checks++;
  await pending.close();

  const excluded = await contextFor({ viewport: { width: 390, height: 844 }, configured: true }); const view = await excluded.newPage();
  for (const path of ['/draw/', '/audio/', '/jigsaw/', '/privacy/', '/profile/']) {
    await view.goto(base + path, { waitUntil: 'domcontentloaded' });
    assert.equal(await view.locator('[data-display-ad],ins.px-display-ad__unit').count(), 0); checks++;
  }
  await excluded.close();
  console.log(`${engine}: ${checks}/${checks} PASS; stub creatives only, unit IDs are isolated in browser routes; no real ad traffic`);
} finally { await browser.close(); }
