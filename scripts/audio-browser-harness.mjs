#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
if (!['localhost', '127.0.0.1'].includes(new URL(BASE).hostname)) throw new Error('Local test server required');
const entry = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!entry) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing installation');
const { chromium, webkit } = await import(pathToFileURL(entry).href);
const out = process.env.PIXIEED_AUDIO_ARTIFACTS || '/tmp/pixieed-dot-music';
await mkdir(out, { recursive: true });
let checks = 0;
function pass(label) { checks++; console.log('PASS ' + label); }

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1280, height: 800 }]) {
      const context = await browser.newContext({ viewport, acceptDownloads: true });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
      await page.addInitScript(() => {
        globalThis.__audioStarts = 0; globalThis.__audioContexts = 0;
        const Native = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Native) return;
        const osc = Native.prototype.createOscillator;
        Native.prototype.createOscillator = function (...args) { globalThis.__audioStarts++; return osc.apply(this, args); };
        const Wrapped = class extends Native { constructor(...args) { super(...args); globalThis.__audioContexts++; } };
        globalThis.AudioContext = Wrapped;
      });
      await page.goto(BASE + '/audio/', { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelectorAll('#audio-tracks button').length === 4);
      if (viewport.width === 568) {
        await page.evaluate(() => { localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 3600000 })); window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' })); });
      }
      await page.waitForTimeout(80);
      assert.equal(await page.title(), 'ドットで音楽｜絵を描いて作曲｜PiXiEED');
      const layout = await page.evaluate(() => {
        const visible = (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
        const small = [...document.querySelectorAll('.audio-page button,.audio-page summary,.app-tabs a,.app-tabs button')].filter(visible).filter((el) => {
          const r = el.getBoundingClientRect(); return r.width < 43.9 || r.height < 43.9;
        }).map((el) => el.id || el.getAttribute('aria-label'));
        const r = document.querySelector('#audio-pixel-canvas').getBoundingClientRect();
        const nav = document.querySelector('.app-tabs').getBoundingClientRect();
        const header = document.querySelector('.audio-heading').getBoundingClientRect();
        const covered = [...document.querySelectorAll('.audio-controls button,.audio-controls summary,.audio-controls [data-pass-slot]')].filter(visible).filter((el) => {
          const b = el.getBoundingClientRect(); return b.top < header.bottom || b.bottom > nav.top;
        }).map((el) => el.id || el.tagName);
        return { small, covered, overflow: document.documentElement.scrollWidth > innerWidth, canvas: { width: r.width, height: r.height, bottom: r.bottom }, navTop: nav.top };
      });
      assert.deepEqual(layout.small, [], JSON.stringify(layout)); assert.equal(layout.overflow, false);
      assert.deepEqual(layout.covered, [], JSON.stringify(layout));
      assert.equal(layout.canvas.width, layout.canvas.height); assert.ok(layout.canvas.width > 80);
      assert.ok(layout.canvas.bottom < layout.navTop);
      for (const id of ['audio-palette-settings', 'audio-composition-settings', 'audio-more']) {
        await page.locator('#' + id + '>summary').click();
        await page.waitForTimeout(40);
        const bounds = await page.locator('#' + id + ' .audio-popover-body').boundingBox();
        assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y >= 0 && bounds.y + bounds.height <= viewport.height, JSON.stringify(bounds));
        assert.equal(await page.locator('.audio-popover[open]').count(), 1);
        await page.keyboard.press('Escape');
      }
      pass(`${name} ${viewport.width}×${viewport.height}: 44px controls, contained panels, square gapless canvas`);
      const canvas = page.locator('#audio-pixel-canvas'); const rect = await canvas.boundingBox();
      const tap = (x, y) => page.mouse.click(rect.x + (x + .5) * rect.width / 16, rect.y + (y + .5) * rect.height / 16);
      await tap(2, 3); await page.waitForFunction(() => __audioStarts > 0);
      const initial = await page.evaluate(() => ({ starts: __audioStarts, contexts: __audioContexts }));
      assert.equal(initial.contexts, 1);
      await tap(3, 3); await page.waitForFunction((before) => __audioStarts > before, initial.starts);
      assert.equal(await page.evaluate(() => __audioContexts), 1);
      await page.locator('#audio-tool-eraser').click();
      const beforeErase = await page.evaluate(() => __audioStarts); await tap(3, 3); await page.waitForTimeout(40);
      assert.equal(await page.evaluate(() => __audioStarts), beforeErase);
      await page.locator('#audio-tool-pen').click();
      await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').getAttribute('aria-pressed') === 'true');
      await page.locator('#audio-play-toggle').click(); assert.equal(await page.locator('#audio-play-toggle').getAttribute('aria-pressed'), 'false');
      pass(`${name} ${viewport.width}: placement previews reuse context, eraser silent, transport plays/stops`);
      if (viewport.width === 390) {
        const downloading = page.waitForEvent('download'); await page.locator('#audio-export-image').click();
        const download = await downloading; const path = `${out}/${name}.png`; await download.saveAs(path);
        const data = await readFile(path);
        assert.equal(data.readUInt32BE(16), 1024); assert.equal(data.readUInt32BE(20), 1024);
        const pixels = await page.evaluate(async (url) => {
          const image = new Image(); image.src = url; await image.decode();
          const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
          const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
          return { occupied: [...ctx.getImageData(2 * 64, 3 * 64, 1, 1).data], corner: [...ctx.getImageData(2 * 64 + 63, 3 * 64 + 63, 1, 1).data], blank: [...ctx.getImageData(3 * 64, 3 * 64, 1, 1).data] };
        }, 'data:image/png;base64,' + data.toString('base64'));
        assert.deepEqual(pixels.occupied, [73, 100, 60, 255]); assert.deepEqual(pixels.corner, pixels.occupied); assert.deepEqual(pixels.blank, [255, 255, 255, 255]);
        pass(`${name}: PNG 1024×1024, exact colored dot blocks, no playhead overlay`);
        await page.screenshot({ path: `${out}/${name}-phone.png` });
      }
      assert.deepEqual(errors, []);
      const beforeZoom = await canvas.evaluate((c) => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].join(','));
      const fitBox = await canvas.boundingBox();
      await page.mouse.move(fitBox.x + fitBox.width / 2, fitBox.y + fitBox.height / 2); await page.mouse.wheel(0, -180);
      await page.waitForFunction((w) => document.querySelector('#audio-pixel-canvas').getBoundingClientRect().width > w, fitBox.width);
      assert.equal(await canvas.evaluate((c) => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].join(',')), beforeZoom);
      if (name === 'chromium' && viewport.width === 390) {
        const session = await context.newCDPSession(page);
        const host = await page.locator('#audio-grid-wrap').boundingBox(); const cx = host.x + host.width / 2, cy = host.y + host.height / 2;
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: cx - 30, y: cy }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: cx - 30, y: cy }, { id: 2, x: cx + 30, y: cy }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: cx - 80, y: cy }, { id: 2, x: cx + 80, y: cy }] });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await session.detach();
        assert.equal(await canvas.evaluate((c) => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data].join(',')), beforeZoom, 'pinching must not add or remove notes');
        pass(`${name}: injected two-finger pinch zoom restores the first accidental stroke`);
      }
      pass(`${name} ${viewport.width}: viewing zoom leaves all logical pixel notes intact`);
      await context.close();
    }

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
    await page.goto(BASE + '/audio/'); await page.waitForFunction(() => document.querySelectorAll('#audio-tracks button').length === 4);
    await page.locator('#audio-composition-settings>summary').click();
    await page.locator('#audio-canvas-size').selectOption('32');
    await page.waitForSelector('.px-pass-go');
    assert.equal(await page.locator('#audio-pixel-canvas').getAttribute('width'), '16');
    await page.locator('.px-pass-no').click();
    assert.equal(await page.locator('#audio-canvas-size').inputValue(), '16');
    await page.locator('#audio-composition-settings>summary').click();
    await page.locator('#audio-canvas-size').selectOption('32'); await page.locator('.px-pass-go').click();
    await page.waitForFunction(() => document.querySelector('#audio-pixel-canvas').width === 32);
    await page.locator('#audio-palette-settings>summary').click();
    const options = page.locator('#audio-palette-rows select').first();
    const extra = await options.locator('optgroup').last().locator('option').first().getAttribute('value');
    await options.selectOption(extra);
    assert.equal(await page.locator('.px-pass-backdrop').count(), 0);
    await page.keyboard.press('Escape');
    const rect = await page.locator('#audio-pixel-canvas').boundingBox();
    await page.mouse.click(rect.x + rect.width * 30.5 / 32, rect.y + rect.height * 8.5 / 16);
    await page.evaluate(() => { const now = Date.now(); Date.now = () => now + 4 * 3600000; window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' })); });
    assert.equal(await page.locator('#audio-pixel-canvas').getAttribute('width'), '32');
    await page.locator('#audio-play-toggle').click(); await page.waitForFunction(() => document.querySelector('#audio-play-toggle').getAttribute('aria-pressed') === 'true');
    await page.locator('#audio-play-toggle').click();
    await page.locator('#audio-composition-settings>summary').click(); await page.locator('#audio-canvas-size').selectOption('16');
    assert.equal(await page.locator('#audio-pixel-canvas').getAttribute('width'), '32');
    assert.match(await page.locator('#audio-status').textContent(), /失われ/);
    await page.keyboard.press('Escape');
    await page.locator('#audio-more>summary').click(); await page.locator('#audio-save').click();
    await page.waitForFunction(() => document.querySelector('#audio-status').textContent.includes('保存しました'));
    await page.reload(); await page.locator('#audio-more>summary').click(); await page.locator('#audio-resume').click();
    await page.waitForFunction(() => document.querySelector('#audio-pixel-canvas').width === 32);
    await page.locator('#audio-palette-settings>summary').click();
    assert.equal(await page.locator('#audio-palette-rows select').first().inputValue(), extra);
    assert.deepEqual(errors, []);
    pass(`${name}: ad opt-in/cancel/grant, both perks, expiry keeps authored content, non-destructive shrink, save/resume`);
    await context.close();

    if (name === 'chromium') {
      const cameraContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const camera = await cameraContext.newPage(); const cameraErrors = []; camera.on('pageerror', (e) => cameraErrors.push(e.message));
      await camera.route('**/*', (route) => new URL(route.request().url()).origin === new URL(BASE).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
      await camera.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const c = document.createElement('canvas'); c.width = 320; c.height = 160;
          const ctx = c.getContext('2d'); const stream = c.captureStream(15);
          const draw = () => { ctx.fillStyle = '#548899'; ctx.fillRect(0, 0, 320, 160); ctx.fillStyle = '#e35b47'; ctx.fillRect(60, 30, 100, 100); };
          draw(); setInterval(draw, 80); return stream;
        };
      });
      for (const width of [16, 32, 64]) {
        await camera.goto(BASE + '/audio/'); await camera.waitForFunction(() => document.querySelectorAll('#audio-tracks button').length === 4);
        if (width > 16) {
          await camera.evaluate(() => localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 3600000 })));
          await camera.locator('#audio-composition-settings>summary').click(); await camera.locator('#audio-canvas-size').selectOption(String(width));
          await camera.waitForFunction((w) => document.querySelector('#audio-pixel-canvas').width === w, width); await camera.keyboard.press('Escape');
        }
        await camera.locator('#audio-take-photo').click(); await camera.waitForURL('**/pixel-camera.html?*');
        await camera.waitForFunction(() => document.querySelector('#capture').dataset.action === 'capture');
        assert.equal(await camera.locator('[data-tool="pixels"]').isDisabled(), true);
        await camera.locator('#capture').click(); await camera.waitForURL('**/audio/**');
        await camera.waitForFunction((w) => document.querySelector('#audio-pixel-canvas')?.width === w && document.querySelectorAll('#audio-tracks button').length === 4, width);
        assert.equal(await camera.locator('#audio-pixel-canvas').getAttribute('height'), '16');
        const colors = await camera.locator('#audio-pixel-canvas').evaluate((c) => new Set(Array.from(c.getContext('2d').getImageData(0, 0, c.width, c.height).data).filter((_, i) => i % 4 !== 3)).size);
        assert.ok(colors > 3); assert.equal(await camera.locator('.px-pass-backdrop').count(), 0);
        pass(`${name}: fake camera ${width}×16 capture automatically returns and draws photo cells`);
      }
      await camera.locator('#audio-take-photo').click(); await camera.waitForURL('**/pixel-camera.html?*');
      const back = camera.locator('a[href*="cancelled=1"]'); await back.click(); await camera.waitForURL('**/audio/**');
      await camera.waitForFunction(() => document.querySelector('#audio-pixel-canvas')?.width === 64);
      pass(`${name}: camera cancellation restores original wide composition`);
      await camera.goto(BASE + '/pixel-camera.html');
      await camera.waitForFunction(() => document.querySelector('#capture').dataset.action === 'capture');
      assert.equal(await camera.locator('[data-tool="pixels"]').isDisabled(), false);
      assert.equal(await camera.locator('#view').evaluate((c) => Math.max(c.width, c.height)), 256);
      await camera.locator('#capture').click();
      await camera.waitForFunction(() => document.querySelector('#pixelStudio').dataset.mode === 'captured');
      assert.match(camera.url(), /\/pixel-camera\.html$/);
      pass(`${name}: ordinary camera preserves size controls and captured-photo screen`);
      assert.deepEqual(cameraErrors, []); await cameraContext.close();
    }
  } finally { await browser.close(); }
}
console.log(`Browser checks: ${checks} PASS. Physical devices, actual camera and production ads: UNTESTED.`);
