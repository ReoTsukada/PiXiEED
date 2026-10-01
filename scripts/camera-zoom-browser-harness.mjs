#!/usr/bin/env node
/** Local synthetic cameras only: no physical-camera permission or real ad requests. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
let checks = 0;
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    for (const scenario of ['camera', 'early', 'digital', 'ignored', 'rejected']) {
      const context = await browser.newContext({ viewport });
      await context.addInitScript(({ scenario }) => {
        window.__cameraRequests = [];
        window.__zoomApplications = [];
        window.__cameraCrop = null;
        window.__cameraCrops = [];
        window.__actualNativeZoom = 1;
        const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
        CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
          if (source instanceof HTMLVideoElement && args.length === 8) {
            window.__cameraCrop = { sx: args[0], sy: args[1], sw: args[2], sh: args[3], width: args[6], height: args[7], nativeZoom: window.__actualNativeZoom };
            window.__cameraCrops.push(window.__cameraCrop);
          }
          return originalDraw.call(this, source, ...args);
        };
        navigator.mediaDevices.getSupportedConstraints = () => ({ zoom: true, facingMode: true });
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          window.__cameraRequests.push(constraints);
          const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
          const ctx = canvas.getContext('2d');
          let cameraZoom = 1;
          const paint = () => {
            window.__actualNativeZoom = cameraZoom;
            ctx.fillStyle = '#79aec4'; ctx.fillRect(0, 0, 320, 240);
            ctx.save(); ctx.translate(160, 120); ctx.scale(cameraZoom, cameraZoom);
            ctx.fillStyle = '#ed7356'; ctx.fillRect(-20, -20, 40, 40);
            ctx.fillStyle = '#314458'; ctx.fillRect(-1, -20, 2, 40); ctx.restore();
          };
          paint(); const stream = canvas.captureStream(15); const track = stream.getVideoTracks()[0];
          const nativeSettings = track.getSettings.bind(track);
          track.getCapabilities = () => scenario === 'digital' ? {} : { zoom: { min: 1, max: 5, step: 0.25 } };
          track.getSettings = () => ({ ...nativeSettings(), ...(scenario === 'digital' ? {} : { zoom: cameraZoom }) });
          track.applyConstraints = async (value) => {
            const requested = value.advanced?.find(v => v.zoom !== undefined)?.zoom ?? value.zoom;
            window.__zoomApplications.push(requested);
            if (scenario === 'early') { cameraZoom = requested; paint(); }
            await new Promise(resolve => setTimeout(resolve, 60));
            if (scenario === 'rejected') throw new DOMException('Synthetic zoom rejection', 'OverconstrainedError');
            if (scenario === 'camera') cameraZoom = requested;
            paint();
          };
          const timer = setInterval(paint, 60); track.addEventListener('ended', () => clearInterval(timer));
          return stream;
        };
      }, { scenario });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ contentType: 'application/javascript', body: '' });
        return url.origin === origin ? route.continue() : route.abort();
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base + '/pixel-camera.html', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#capture')?.dataset.action === 'capture' && !document.querySelector('#capture').disabled);
      assert.equal(await page.locator('#zoomStops').isVisible(), false, 'zoom values are not permanent camera overlays');
      await page.locator('#cameraSettings').click();
      await page.locator('[data-tool="zoom"]').click();
      const forty = page.locator('#zoomStops [data-zoom="40"]'); await forty.click();
      await page.waitForFunction(({ native }) => {
        const crop = window.__cameraCrop;
        return document.querySelector('#zoomHudValue')?.textContent === '40×' && crop && Math.abs(crop.sw - 240 / (40 / native)) < 0.001;
      }, { native: ['camera', 'early'].includes(scenario) ? 5 : 1 }); checks++;
      const requested = await page.evaluate(() => window.__zoomApplications);
      if (['camera', 'early'].includes(scenario)) assert.ok(requested.includes(5));
      if (scenario === 'digital') assert.equal(requested.length, 0);
      await page.waitForFunction(expected => document.querySelector('#zoomHudHint')?.textContent === expected, ['camera', 'early'].includes(scenario) ? 'カメラ＋拡大' : '拡大ズーム');
      assert.ok(await page.evaluate(() => window.__cameraCrops.every(crop => crop.nativeZoom * 240 / crop.sw <= 40.001)), 'camera changes before constraint completion cannot compound above 40x'); checks++;
      assert.equal(await page.locator('#view').getAttribute('width'), '128');
      const bounds = await page.locator('.lc-top').evaluate(node => {
        const boxes = ['.lc-top .lc-back', '#cameraSettings', '#flipCamera'].map(selector => document.querySelector(selector)?.getBoundingClientRect()).filter(Boolean);
        const strip = document.querySelector('#zoomStops').getBoundingClientRect();
        const button = document.querySelector('#zoomStops [data-zoom="40"]').getBoundingClientRect();
        return { fits: boxes.every(r => r.left >= 0 && r.right <= innerWidth + 1), selectedVisible: button.left >= strip.left - 1 && button.right <= strip.right + 1, size: { width: button.width, height: button.height }, overlap: boxes.some((a, i) => boxes.some((b, j) => j > i && Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1)) };
      });
      assert.ok(bounds.fits && bounds.selectedVisible && !bounds.overlap, JSON.stringify({ viewport, scenario, bounds }));
      assert.ok(bounds.size.width >= 44 && bounds.size.height >= 44); checks++;
      await page.locator('#cameraSettings').click();
      assert.equal(await page.locator('#cameraSettingsPanel').isVisible(), false);
      // Additional wheel input remains capped; drawing and tap gestures stay in the camera stage.
      await page.locator('#stage').dispatchEvent('wheel', { deltaY: -3000, ctrlKey: true });
      assert.equal(await page.locator('#zoomHudValue').textContent(), '40×');
      await page.waitForTimeout(1100);
      assert.equal(await page.locator('#zoomHud').evaluate(n => n.classList.contains('is-on')), false, 'zoom feedback disappears after the gesture');
      await page.locator('#cameraSettings').click();
      await page.locator('[data-tool="zoom"]').click();
      await page.locator('#zoomStops [data-zoom="1"]').click();
      await page.waitForFunction(() => document.querySelector('#zoomHudValue')?.textContent === '1×' && Math.abs((window.__cameraCrop?.sw ?? 0) - 240) < 0.001); checks++;
      await page.waitForTimeout(180);
      assert.ok((await page.evaluate(() => window.__zoomApplications.length)) < 8, 'ignored/rejected constraints do not retry forever');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 2), false);
      assert.deepEqual(errors, []); checks++;
      await context.close();
    }
  }
  console.log(`Camera combined zoom: ${checks}/${checks} PASS; Chromium simulated cameras only; physical devices, Safari and production UNTESTED`);
} finally { await browser.close(); }
