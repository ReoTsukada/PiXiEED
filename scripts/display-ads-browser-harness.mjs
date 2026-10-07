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
const placementCounts = { '/': 2, '/tools/': 2, '/about/': 1, '/guide/': 1, '/stores/': 1, '/stores/ecowashcafe-nakanoshima.html': 1 };
const captureNames = ['home', 'tools', 'about', 'guide', 'stores', 'store-detail'];
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const mock = `
const queued = window.adsbygoogle || [];
const push = () => {
  const unit = [...document.querySelectorAll('ins.px-display-ad__unit')].find(node => !node.dataset.adsbygoogleStatus);
  if (!unit) throw Error('no unrequested unit');
  window.__manualAdRequests++;
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
  await context.addInitScript((mode) => { window.__manualAdRequests = 0; window.__adMockMode = mode; }, mode);
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
async function noOverlap(page, description, index = 0) {
  const result = await page.locator('[data-display-ad]').nth(index).evaluate((ad) => {
    const a = ad.getBoundingClientRect();
    const overlaps = [...document.querySelectorAll('button,a,input,select,summary')].filter((el) => {
      if (ad.contains(el)) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top;
    }).map((el) => el.id || el.textContent.trim().slice(0, 24));
    const unit = ad.querySelector('ins'); const u = unit.getBoundingClientRect();
    const content = ad.classList.contains('container') ? ad : ad.parentElement;
    const c = content.getBoundingClientRect();
    const canvases = [...document.querySelectorAll('canvas')].map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    const canvasClearance = canvases.length ? Math.min(...canvases.map((r) => Math.hypot(Math.max(r.left - a.right, a.left - r.right, 0), Math.max(r.top - a.bottom, a.top - r.bottom, 0)))) : Infinity;
    return { overlaps, inScreen: a.left >= -1 && a.right <= innerWidth + 1,
      unitFits: u.left >= a.left && u.right <= a.right + 1,
      matchesContent: Math.abs(a.left - c.left) <= 1 && Math.abs(a.right - c.right) <= 1,
      centered: Math.abs((a.left + a.right) / 2 - document.documentElement.clientWidth / 2) <= 1,
      unitCentered: Math.abs((u.left + u.right - a.left - a.right) / 2) <= 1,
      labelCentered: getComputedStyle(ad.querySelector('.px-display-ad__label')).textAlign === 'center',
      height: u.height, marginTop: parseFloat(getComputedStyle(ad).marginTop),
      pass: localStorage.getItem('pixieed:pass:v1'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1, canvasClearance };
  });
  assert.deepEqual(result.overlaps, [], description);
  assert.equal(result.inScreen, true); assert.equal(result.unitFits, true);
  assert.equal(result.matchesContent, true, `${description}: align with content edges`);
  assert.equal(result.centered, true, `${description}: center placement`);
  assert.equal(result.unitCentered, true); assert.equal(result.labelCentered, true);
  assert.ok([90, 100].includes(result.height)); assert.ok(result.marginTop >= 48);
  assert.equal(result.overflow, false); assert.equal(result.pass, null);
  if (new URL(page.url()).pathname === '/') assert.ok(result.canvasClearance >= 149, `${description}: 150px clearance from interactive canvases`);
}
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }, { width: 1920, height: 1080 }]) {
    const inactive = await contextFor({ viewport }); const page = await inactive.newPage();
    for (const path of paths) {
      await page.goto(base + path, { waitUntil: 'domcontentloaded' }); await frames(page);
      const ads = page.locator('[data-display-ad]');
      assert.equal(await ads.count(), placementCounts[path]);
      for (const ad of await ads.all()) {
        assert.equal(await ad.isVisible(), false, 'blank config collapses its initial reservation');
        assert.equal(await ad.boundingBox(), null, 'blank configuration occupies no space after resolving');
      }
      assert.equal(await page.locator('ins.px-display-ad__unit').count(), 0);
      assert.equal(await page.evaluate(() => window.__manualAdRequests), 0);
      assert.equal(await page.locator('script[src*="adsbygoogle.js"]').count(), 0, `${path}: no provider before valid unit proximity`);
      checks++;
    }
    await inactive.close();

    const configured = await contextFor({ viewport, configured: true }); const view = await configured.newPage();
    for (const path of paths) {
      await view.goto(base + path, { waitUntil: 'domcontentloaded' });
      const ads = view.locator('[data-display-ad]'); const count = placementCounts[path];
      assert.equal(await ads.count(), count);
      const initiallyEligible = await ads.evaluateAll((nodes) => nodes.filter((node) => {
        const bounds = node.getBoundingClientRect();
        return bounds.top < innerHeight + 240 && bounds.bottom > -240;
      }).length);
      const initiallyRequested = await view.evaluate(() => window.__manualAdRequests);
      assert.ok(initiallyRequested <= initiallyEligible, `${path}: only near-viewport units can start a request`);
      if (initiallyEligible === 0) assert.equal(await view.locator('script[src*="adsbygoogle.js"]').count(), 0, `${path}: distant slots do not load the provider`);
      for (let index = 0; index < count; index++) {
        await ads.nth(index).evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await frames(view);
        await view.waitForFunction((index) => document.querySelectorAll('[data-display-ad]')[index]?.dataset.adState === 'filled', index);
      }
      await view.waitForFunction((count) => window.__manualAdRequests === count, count);
      await view.screenshot({ path: `/tmp/pixieed-ad-current-${engine}.png` });
      for (let index = 0; index < count; index++) {
        await noOverlap(view, `${path} ${viewport.width}x${viewport.height}`, index);
        await ads.nth(index).evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await frames(view);
        await ads.nth(index).screenshot({ path: `/tmp/pixieed-ad-unit-${engine}-${viewport.width}-${captureNames[paths.indexOf(path)]}-${index}.png` });
      }
      await view.screenshot({ path: `/tmp/pixieed-ad-placement-${engine}-${viewport.width}-${captureNames[paths.indexOf(path)]}.png` });
      assert.equal(await view.evaluate(() => window.__manualAdRequests), count, 'scrolling never refreshes any unit');
      checks++;
    }
    await configured.close();
  }

  const pending = await contextFor({ viewport: { width: 390, height: 844 }, configured: true, mode: 'pending' });
  const page = await pending.newPage();
  await page.goto(base + '/tools/', { waitUntil: 'domcontentloaded' });
  const ad = page.locator('[data-display-ad]').first();
  await ad.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' })); await frames(page);
  await page.waitForFunction(() => window.__manualAdRequests >= 1);
  const secondAd = page.locator('[data-display-ad]').nth(1);
  await secondAd.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' })); await frames(page);
  await page.waitForFunction(() => window.__manualAdRequests === 2);
  const before = await ad.boundingBox();
  await ad.evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'instant' })); await frames(page);
  await ad.locator('ins.px-display-ad__unit').evaluate((unit) => { unit.dataset.adStatus = 'unfilled'; });
  await page.waitForFunction(() => document.querySelector('[data-display-ad]').dataset.adState === 'unfilled');
  assert.equal(await ad.isVisible(), true, 'no reflow beneath an on-screen request');
  assert.equal((await ad.boundingBox()).height, before.height);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await frames(page);
  assert.equal(await ad.isVisible(), true, 'normal slots retain their reserved blank area after no-fill');
  await page.waitForFunction(() => document.querySelector('[data-display-ad]').dataset.adState === 'empty');
  assert.equal((await ad.boundingBox()).height, before.height);
  checks++;
  await ad.locator('ins.px-display-ad__unit').evaluate((unit) => { unit.dataset.adStatus = 'unfill-optimized'; });
  await page.waitForFunction(() => document.querySelector('[data-display-ad]').dataset.adState === 'filled');
  assert.equal(await ad.isVisible(), true, 'a late optimized creative remains visible'); checks++;
  await page.evaluate(async () => { const module = await import('/js/display-ads.mjs?rev=20261007-lazy-ads-1'); module.mountDisplayAds(); });
  assert.equal(await page.evaluate(() => window.__manualAdRequests), 2, 'repeat mount is idempotent across both tools placements');
  assert.equal(await page.locator('ins.px-display-ad__unit').count(), 2); checks++;
  await pending.close();

  const excluded = await contextFor({ viewport: { width: 390, height: 844 }, configured: true }); const view = await excluded.newPage();
  for (const path of ['/draw/', '/audio/', '/jigsaw/', '/privacy/', '/profile/']) {
    await view.goto(base + path, { waitUntil: 'domcontentloaded' });
    assert.equal(await view.locator('[data-display-ad],ins.px-display-ad__unit').count(), 0);
    assert.equal(await view.locator('script[src*="adsbygoogle.js"]').count(), 0, `${path}: no loader before a result`); checks++;
  }
  await excluded.close();
  console.log(`${engine}: ${checks}/${checks} PASS; stub creatives only, unit IDs are isolated in browser routes; no real ad traffic`);
} finally { await browser.close(); }
