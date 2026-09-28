#!/usr/bin/env node
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright module.');
const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4184';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(BASE).hostname)) throw new Error('Only a local test server is allowed.');
const { chromium, webkit } = await import(pathToFileURL(modulePath).href);
const allScenarios = [
  { name: 'normal', width: 390, height: 844 },
  { name: 'reduced', width: 390, height: 844, reduced: true },
  { name: 'landscape', width: 568, height: 320 },
  { name: 'small-reduced', width: 320, height: 568, reduced: true },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'no-intersection-observer', width: 390, height: 844, noObserver: true },
  { name: 'stalled-animation-frame', width: 390, height: 844, stalled: true },
];
const selectedScenario = process.env.PIXIEED_HOME_BROWSER_SCENARIO;
const scenarios = selectedScenario ? allScenarios.filter(({ name }) => name === selectedScenario) : allScenarios;
if (!scenarios.length) throw new Error('Unknown home browser scenario.');

for (const [engine, type] of [['Chrome', chromium], ['WebKit', webkit]]) {
  const browser = await type.launch({ headless: true });
  try {
    for (const scenario of scenarios) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height }, reducedMotion: scenario.reduced ? 'reduce' : 'no-preference' });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(({ noObserver, stalled }) => {
        globalThis.__homePaintCounts = { hero: 0, cards: 0 };
        const put = CanvasRenderingContext2D.prototype.putImageData;
        CanvasRenderingContext2D.prototype.putImageData = function (...args) {
          if (this.canvas.id === 'hpCanvas') __homePaintCounts.hero++;
          return put.apply(this, args);
        };
        const fill = CanvasRenderingContext2D.prototype.fillRect;
        CanvasRenderingContext2D.prototype.fillRect = function (...args) {
          if (this.canvas.closest('[data-toy]')) __homePaintCounts.cards++;
          return fill.apply(this, args);
        };
        if (noObserver) { globalThis.IntersectionObserver = undefined; globalThis.ResizeObserver = undefined; }
        if (stalled) {
          let id = 0;
          globalThis.requestAnimationFrame = () => ++id;
          globalThis.cancelAnimationFrame = () => {};
        }
      }, scenario);
      await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('#hpColors button').length === 7 && document.querySelectorAll('.hp-view').length >= 9);
      const count = () => page.evaluate(() => ({ ...__homePaintCounts }));
      const changedWhileVisible = async () => {
        const before = await count(); await page.waitForTimeout(500); const after = await count();
        assert.ok(after.hero > before.hero, `${engine}/${scenario.name}: visible hero must repaint without touching`);
        return after.hero - before.hero;
      };
      await page.waitForTimeout(350);
      const automaticFrames = await changedWhileVisible();

      if (scenario.reduced) {
        await page.locator('#hpColors button').nth(4).click();
        const box = await page.locator('#hpCanvas').boundingBox();
        const x = box.x + box.width * 0.12, y = box.y + box.height * 0.45;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + box.width * 0.15, y, { steps: 6 }); await page.mouse.up();
        const blueCenter = () => page.evaluate(() => {
          const canvas = document.querySelector('#hpCanvas'); const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let sum = 0, count = 0;
          for (let i = 0; i < data.length; i += 4) if (data[i] === 49 && data[i + 1] === 95 && data[i + 2] === 208) { sum += Math.floor(i / 4 / canvas.width); count++; }
          return count ? sum / count : null;
        });
        await page.waitForTimeout(150); const before = await blueCenter();
        await page.waitForTimeout(650); const after = await blueCenter();
        assert.ok(before !== null && after !== null && after > before, `${engine}/${scenario.name}: released drawing must keep falling without another drag`);
      }

      await page.evaluate(() => window.scrollTo({ top: document.querySelector('#hpToysTitle').getBoundingClientRect().top + scrollY, behavior: 'instant' }));
      await page.waitForTimeout(350);
      const offscreenBefore = await count(); await page.waitForTimeout(500); const offscreenAfter = await count();
      assert.equal(offscreenAfter.hero, offscreenBefore.hero, `${engine}/${scenario.name}: offscreen hero must stop`);
      assert.ok(offscreenAfter.cards > offscreenBefore.cards, `${engine}/${scenario.name}: visible cards must animate`);
      assert.equal(await page.locator('.hp-toy.is-in').count() > 0, true, 'cards stay discoverable without an observer');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(250); await changedWhileVisible();

      // Browser lifecycle events are controlled fixtures, not physical-device proof.
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hiddenBefore = await count(); await page.waitForTimeout(400);
      assert.deepEqual(await count(), hiddenBefore, 'a hidden document must stop all canvas drawing');
      await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
      await changedWhileVisible();
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      const cachedBefore = await count(); await page.waitForTimeout(400);
      assert.deepEqual(await count(), cachedBefore, 'pagehide must suspend the pump');
      await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
      await changedWhileVisible();
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(JSON.stringify({ engine, scenario: scenario.name, width: scenario.width, height: scenario.height, automaticFrames, visibleOnly: 'PASS', lifecycleFixtures: 'PASS', exceptions: 0, overflow: false }));
      await page.close();
    }
  } finally { await browser.close(); }
}
