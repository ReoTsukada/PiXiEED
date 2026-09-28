#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const BASE = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const baseUrl = new URL(BASE);
if (!['localhost', '127.0.0.1'].includes(baseUrl.hostname)) throw new Error('This harness only supports a local test server');
const entry = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!entry) throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright installation');
const { chromium, webkit } = await import(pathToFileURL(entry).href);

const routes = [
  '/', '/globe/', '/audio/', '/pixel-camera.html', '/draw/', '/jigsaw/',
  '/spot-difference/', '/hidden-object/', '/play/spot-difference/', '/play/hidden-object/', '/game/',
  '/globe-prototype.html?embed=1&tool=telescope'
];
const viewports = [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 1280, height: 800 }];
let checks = 0;
const pass = (label) => { checks += 1; console.log(`PASS ${label}`); };

async function localOnly(page) {
  await page.route('**/*', (route) => new URL(route.request().url()).origin === baseUrl.origin
    ? route.continue()
    : route.fulfill({ status: 200, contentType: 'text/plain', body: '' }));
}

async function assertHeader(page, route, viewport) {
  await page.goto(new URL(route, BASE).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-header-pass]', { timeout: 10000 });
  await page.waitForTimeout(80);
  const result = await page.evaluate(() => {
    const header = document.querySelector('.px-site-header');
    const button = document.querySelector('[data-header-pass]');
    if (!header || !button) return { missingHeader: true };
    const visible = (node) => {
      if (!node.getClientRects().length || getComputedStyle(node).visibility === 'hidden' || getComputedStyle(node).display === 'none') return false;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open) return false;
        if (parent.hidden || getComputedStyle(parent).visibility === 'hidden' || getComputedStyle(parent).display === 'none') return false;
      }
      return true;
    };
    const box = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const describe = (node) => ({ ...box(node), tag: node.tagName, id: node.id, className: typeof node.className === 'string' ? node.className : '', text: node.textContent.trim().slice(0, 48) });
    const h = box(header); const b = box(button);
    const controls = [...header.querySelectorAll('a,button,input,select,[role="button"]')].filter(visible).map(describe);
    const overlaps = [];
    for (let i = 0; i < controls.length; i += 1) for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i], c = controls[j];
      if (a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top) overlaps.push([a, c]);
    }
    const outside = [...document.querySelectorAll('body a,body button,body input,body select,[role="button"]')]
      .filter((node) => visible(node) && !header.contains(node)).map(describe)
      .filter((r) => b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top);
    const iframeHeaders = [...document.querySelectorAll('iframe')].reduce((sum, iframe) => {
      try { return sum + iframe.contentDocument.querySelectorAll('[data-header-pass]').length; } catch { return sum; }
    }, 0);
    const hit = document.elementFromPoint((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    return { header: h, button: b, passReceivesPointer: hit === button || button.contains(hit), overlaps, outside, iframeHeaders, width: innerWidth, height: innerHeight, label: button.querySelector('[data-header-pass-label]')?.textContent };
  });
  assert.ok(!result.missingHeader, `${route} missing header`);
  assert.equal(await page.locator('[data-header-pass]').count(), 1, `${route} must have one header pass control`);
  assert.ok(result.header.height >= 44 && result.header.top >= 0 && result.header.bottom <= viewport.height, `${route} header outside viewport: ${JSON.stringify(result)}`);
  assert.ok(result.button.width >= 44 && result.button.height >= 44, `${route} pass control below 44px: ${JSON.stringify(result)}`);
  assert.ok(result.passReceivesPointer, `${route} pass control is covered at its center: ${JSON.stringify(result)}`);
  assert.deepEqual(result.overlaps, [], `${route} header controls overlap: ${JSON.stringify(result.overlaps)}`);
  assert.deepEqual(result.outside, [], `${route} pass button overlaps page controls: ${JSON.stringify(result.outside)}`);
  assert.equal(result.iframeHeaders, 0, `${route} iframe must not mount a second header`);
  return result;
}

for (const [engineName, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await localOnly(page);
      for (const route of routes) {
        await assertHeader(page, route, viewport);
        assert.deepEqual(errors.filter((message) => /site-header|pixieed-pass/i.test(message)), [], `${route} header/pass runtime errors`);
      }
      pass(`${engineName} ${viewport.width}×${viewport.height}: one visible 44px+ header action, no overlap, no iframe header`);
      await context.close();
    }

    if (engineName === 'chromium') {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const first = await context.newPage(); const second = await context.newPage();
      const errors = [];
      first.on('pageerror', (error) => errors.push(error.message)); second.on('pageerror', (error) => errors.push(error.message));
      await localOnly(first); await localOnly(second);
      await first.goto(new URL('/', BASE).href, { waitUntil: 'domcontentloaded' });
      await first.waitForSelector('[data-header-pass]');
      await second.goto(new URL('/draw/', BASE).href, { waitUntil: 'domcontentloaded' });
      await second.waitForSelector('[data-header-pass]');
      await first.evaluate(() => localStorage.removeItem('pixieed:pass:v1'));
      await first.locator('[data-header-pass]').click();
      await first.waitForSelector('.px-pass-go');
      await first.locator('.px-pass-go').click();
      await first.waitForFunction(() => !document.querySelector('.px-pass-test') || document.querySelector('.px-pass-test').hidden, null, { timeout: 8000 });
      await first.waitForFunction(() => JSON.parse(localStorage.getItem('pixieed:pass:v1') || 'null')?.until > Date.now());
      assert.match(await first.locator('[data-header-pass-label]').textContent(), /\d+:\d{2}/);
      await second.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.active === 'true');
      const oneHour = await first.evaluate(() => JSON.parse(localStorage.getItem('pixieed:pass:v1')).until);

      await first.locator('[data-header-pass]').click(); await first.waitForSelector('.px-pass-go');
      assert.match(await first.locator('.px-pass p').first().textContent(), /1時間追加/);
      await first.locator('.px-pass-go').click();
      await first.waitForFunction((expected) => JSON.parse(localStorage.getItem('pixieed:pass:v1') || 'null')?.until >= expected + 3_600_000, oneHour);
      const twoHours = await first.evaluate(() => JSON.parse(localStorage.getItem('pixieed:pass:v1')).until);
      assert.ok(twoHours >= oneHour + 3_600_000);
      await first.locator('[data-header-pass]').click(); await first.waitForSelector('.px-pass-no');
      await first.locator('.px-pass-no').click();
      assert.equal(await first.evaluate(() => JSON.parse(localStorage.getItem('pixieed:pass:v1')).until), twoHours, 'cancel must not add time');
      await second.waitForFunction(() => document.querySelector('[data-header-pass-label]')?.textContent.includes(':'));

      await first.evaluate(() => {
        localStorage.setItem('pixieed:pass:v1', '{broken');
        window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
      });
      assert.equal(await first.locator('[data-header-pass]').getAttribute('data-active'), 'false');
      assert.deepEqual(errors, []);
      pass('chromium: 1h reward, 2nd reward extends to 2h, cancellation, cross-tab sync and corrupt storage');

      await first.evaluate(() => {
        localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 300 }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
      });
      await first.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.active === 'true');
      await first.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.active === 'false', null, { timeout: 3000 });
      pass('chromium: expiring storage updates the header to inactive');
      await context.close();

      const audioContext = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
      const audio = await audioContext.newPage(); const audioErrors = [];
      audio.on('pageerror', (error) => audioErrors.push(error.message)); await localOnly(audio);
      await audio.addInitScript(() => {
        if (localStorage.getItem('pixieed:pass:v1') === null) localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 3_600_000 }));
      });
      await audio.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
      await audio.waitForFunction(() => document.querySelectorAll('#audio-tracks button').length === 4);
      await audio.locator('#audio-composition-settings>summary').click();
      await audio.locator('#audio-canvas-size').selectOption('32');
      await audio.waitForFunction(() => document.querySelector('#audio-pixel-canvas')?.width === 32);
      await audio.locator('#audio-canvas-size').selectOption('64');
      await audio.waitForFunction(() => document.querySelector('#audio-pixel-canvas')?.width === 64);
      await audio.keyboard.press('Escape');
      await audio.locator('#audio-palette-settings>summary').click();
      const instruments = audio.locator('#audio-palette-rows select').first();
      const extras = await instruments.locator('optgroup').last().locator('option').evaluateAll((options) => options.map((option) => option.value));
      assert.ok(extras.length >= 8, 'eight extra instruments are present');
      await instruments.selectOption(extras[0]);
      await audio.locator('#audio-pixel-canvas').click({ position: { x: 60, y: 35 } });
      await audio.evaluate(() => {
        localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 250 }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
      });
      await audio.waitForFunction(() => document.querySelector('[data-header-pass]')?.dataset.active === 'false');
      assert.equal(await audio.locator('#audio-pixel-canvas').getAttribute('width'), '64');
      assert.equal(await instruments.inputValue(), extras[0], 'expiry keeps the existing extra instrument selected');
      await audio.locator('#audio-palette-settings>summary').click();
      await instruments.selectOption(extras[1]); await audio.waitForSelector('.px-pass-go');
      assert.equal(await instruments.inputValue(), extras[0], 'a new extra voice is not applied after expiry');
      await audio.locator('.px-pass-no').click();
      await audio.locator('#audio-play-toggle').click();
      await audio.waitForFunction(() => document.querySelector('#audio-play-toggle')?.getAttribute('aria-pressed') === 'true');
      await audio.locator('#audio-play-toggle').click();
      const downloadReady = audio.waitForEvent('download'); await audio.locator('#audio-export-image').click();
      const png = await downloadReady; assert.match(png.suggestedFilename(), /\.png$/i);
      const pngPath = `/tmp/pixieed-pass-audio-export-${Date.now()}.png`;
      await png.saveAs(pngPath);
      const pngBytes = await readFile(pngPath);
      assert.equal(pngBytes.toString('hex', 0, 8), '89504e470d0a1a0a');
      assert.equal(pngBytes.readUInt32BE(16), 1024, '64 columns export crisp integer-scaled PNG width');
      assert.equal(pngBytes.readUInt32BE(20), 256, '16 pitches export crisp integer-scaled PNG height');
      await audio.locator('#audio-more>summary').click(); await audio.locator('#audio-save').click();
      await audio.waitForFunction(() => document.querySelector('#audio-status')?.textContent.includes('保存しました'));
      await audio.reload(); await audio.locator('#audio-more>summary').click(); await audio.locator('#audio-resume').click();
      await audio.waitForFunction(() => document.querySelector('#audio-pixel-canvas')?.width === 64);
      await audio.locator('#audio-palette-settings>summary').click();
      assert.equal(await audio.locator('#audio-palette-rows select').first().inputValue(), extras[0]);
      await audio.goto(new URL('/audio/', BASE).href, { waitUntil: 'domcontentloaded' });
      await audio.waitForFunction(() => document.querySelector('#audio-pixel-canvas')?.width === 16);
      await audio.locator('#audio-composition-settings>summary').click();
      await audio.locator('#audio-canvas-size').selectOption('32'); await audio.waitForSelector('.px-pass-go');
      assert.equal(await audio.locator('#audio-pixel-canvas').getAttribute('width'), '16', 'an expired pass cannot expand a new composition');
      await audio.locator('.px-pass-no').click();
      assert.deepEqual(audioErrors, []);
      pass('chromium: expired 64-column/existing extra-voice composition edits, plays, exports, saves and resumes; new expansion/voice is gated');
      await audioContext.close();

      const gifContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const camera = await gifContext.newPage(); const cameraErrors = [];
      camera.on('pageerror', (error) => cameraErrors.push(error.message)); await localOnly(camera);
      await camera.addInitScript(() => {
        localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() + 3_600_000 }));
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 160;
          const context = canvas.getContext('2d'); let frame = 0;
          const stream = canvas.captureStream(30);
          setInterval(() => { frame += 1; context.fillStyle = `hsl(${frame % 360} 70% 50%)`; context.fillRect(0, 0, 320, 160); }, 40);
          return stream;
        };
      });
      await camera.goto(new URL('/pixel-camera.html', BASE).href, { waitUntil: 'domcontentloaded' });
      await camera.waitForFunction(() => document.querySelector('#capture')?.dataset.action === 'capture');
      await camera.locator('#capture').hover(); await camera.mouse.down();
      await camera.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.recording === 'true');
      await camera.waitForTimeout(500);
      await camera.evaluate(() => {
        localStorage.setItem('pixieed:pass:v1', JSON.stringify({ until: Date.now() - 1 }));
        window.dispatchEvent(new StorageEvent('storage', { key: 'pixieed:pass:v1' }));
      });
      assert.equal(await camera.locator('#pixelStudio').getAttribute('data-recording'), 'true', 'expiry must not stop a started premium GIF');
      await camera.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.recording === 'false', null, { timeout: 12000 });
      await camera.mouse.up();
      await camera.waitForFunction(() => Number(document.querySelector('#pixelStudio')?.dataset.gifFrames || 0) > 100, null, { timeout: 15000 });
      assert.match(await camera.locator('#savePng').getAttribute('download'), /\.gif$/i);
      assert.deepEqual(cameraErrors, []);
      pass('chromium synthetic camera: a premium GIF recording continues through expiry and produces a downloadable animation');
      await gifContext.close();
    }
  } finally { await browser.close(); }
}
console.log(`Browser checks: ${checks} PASS. Real ads, physical cameras and production: UNTESTED.`);
