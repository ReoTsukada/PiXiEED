#!/usr/bin/env node
/** Browser geometry and hit-target checks for camera panel dismiss controls. No camera APIs are called. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
];
const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const lensCss = await source('css/pixel-lens-camera.css');
const lensHtml = await source('pixel-camera.html');
const legacyHtml = await source('pixiee-lens/index.html');
assert.match(legacyHtml, /legacy-lens-entry\.mjs/, 'retired route points to its compatibility bridge');
assert.doesNotMatch(legacyHtml, /<canvas\b|navigator\.mediaDevices|getUserMedia|capture-preview|qr-readout/, 'retired route no longer contains the camera app UI');

let region = lensHtml.match(/<section id="regionMergePanel"[\s\S]*?<\/section>/)?.[0];
assert.ok(region, "found region merge section markup");
region = region.replace(' hidden>', '>').replace('</section>', '<div class="panel-close-test-spacer" aria-hidden="true"></div></section>');

const fixture = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${lensCss}</style><style>
  :root { --viewport-width: 100vw; --viewport-height: 100dvh; --safe-top: 0px; --safe-right: 0px; --safe-bottom: 0px; --safe-left: 0px; --vv-offset-top: 0px; --vv-offset-right: 0px; --vv-offset-bottom: 0px; --vv-offset-left: 0px; --hud-padding: 18px; --ad-header-offset: 0px; --ad-side-offset: 0px; }
  html,body { margin:0; width:100%; height:100%; overflow:hidden; }
  .pc-nav { position:fixed; z-index:10; inset:auto 0 0; height:56px; background:#111; }
  .camera-fixture-panel { position:fixed; z-index:30; inset:0; overflow:hidden; }
  .camera-fixture-region { position:absolute; inset:auto 0 56px; display:grid; justify-items:center; padding:8px; }
  .panel-close-test-spacer { height:320px; }
</style></head><body>
  <main class="camera-fixture-panel"><div class="camera-fixture-region">${region}</div><nav class="pc-nav"></nav></main>
</body></html>`;

const reports = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: true });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(fixture, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('script').count(), 0, 'fixture does not load camera code or call camera APIs');
    const counts = await page.evaluate(() => ({
      regionScroll: document.querySelector('#regionMergePanel').scrollHeight - document.querySelector('#regionMergePanel').clientHeight,
    }));
    assert.ok(counts.regionScroll > 0, `${viewport.width}x${viewport.height}: region merge fixture scrolls`);
    for (const item of [
      { name: 'region merge', scroller: '#regionMergePanel', button: '#regionMergeCancel' },
    ]) {
      await page.evaluate((name) => {
        document.querySelector('.camera-fixture-panel').style.display = name === 'region merge' ? '' : 'none';
      }, item.name);
      for (const place of ['top', 'middle', 'bottom']) {
        const measured = await page.evaluate(({ scrollerSelector, buttonSelector, place }) => {
          const scroller = document.querySelector(scrollerSelector);
          const button = document.querySelector(buttonSelector);
          const range = scroller.scrollHeight - scroller.clientHeight;
          scroller.scrollTop = place === 'top' ? 0 : place === 'middle' ? range / 2 : range;
          return new Promise((resolve) => requestAnimationFrame(() => {
            const rect = button.getBoundingClientRect();
            const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            const hit = document.elementFromPoint(x, y);
            resolve({
              scrollTop: scroller.scrollTop,
              scrollRange: range,
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right, bottom: rect.bottom },
              viewport: { width: innerWidth, height: innerHeight },
              hit: hit?.id || hit?.className?.baseVal || hit?.className || hit?.tagName || null,
              hitButton: hit === button || button.contains(hit),
            });
          }));
        }, { scrollerSelector: item.scroller, buttonSelector: item.button, place });
        const label = `${viewport.width}x${viewport.height} ${item.name} ${place}`;
        assert.ok(measured.rect.width >= 43.95 && measured.rect.height >= 43.95, `${label}: hit target is at least 44px (subpixel rounding tolerance) (${measured.rect.width}x${measured.rect.height})`);
        assert.ok(measured.rect.x >= 0 && measured.rect.y >= 0 && measured.rect.right <= viewport.width && measured.rect.bottom <= viewport.height, `${label}: button is within the viewport (${JSON.stringify(measured.rect)})`);
        assert.ok(measured.hitButton, `${label}: elementFromPoint resolves to the close button (${measured.hit})`);
        await page.evaluate(({ selector }) => {
          const button = document.querySelector(selector);
          window.__closeClicks ||= 0;
          button.onclick = () => { window.__closeClicks++; };
        }, { selector: item.button });
        await page.mouse.click(measured.rect.x + measured.rect.width / 2, measured.rect.y + measured.rect.height / 2);
        const clickCount = await page.evaluate(() => window.__closeClicks);
        assert.ok(clickCount > 0, `${label}: pointer click reaches the button`);
        reports.push({ viewport, panel: item.name, place, rect: measured.rect, scrollTop: measured.scrollTop, scrollRange: measured.scrollRange, hit: measured.hit });
      }
    }
    await context.close();
  }
  console.log(JSON.stringify({ result: 'PASS', checks: reports.length, reports }, null, 2));
} finally {
  await browser.close();
}
