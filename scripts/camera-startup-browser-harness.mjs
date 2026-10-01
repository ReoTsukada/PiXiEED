#!/usr/bin/env node
/** Synthetic startup cameras only; no physical-camera permission or external requests. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const errors = [];
let checks = 0;
const paletteOnly = process.argv.includes('--palette-only');

async function newPage({ scenario = 'normal', viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ scenario }) => {
    let requestCount = 0;
    const mediaReady = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState');
    Object.defineProperty(HTMLVideoElement.prototype, 'readyState', {
      configurable: true,
      get() {
        const track = this.srcObject?.getVideoTracks?.()[0];
        if (track?.__holdFrame) return 0;
        return mediaReady.get.call(this);
      }
    });

    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLVideoElement.prototype.play = function () {
      const track = this.srcObject?.getVideoTracks?.()[0];
      if (scenario === 'late-play' && track?.__request === 1) {
        return new Promise((resolve) => { window.__resolveLatePlay = resolve; });
      }
      return nativePlay.call(this);
    };

    window.__cameraRequestCount = 0;
    window.__cameraTracks = [];
    window.__fakeHidden = false;
    window.__cameraScene = scenario === 'palette-recovery' ? 'black' : scenario === 'palette-gray' ? 'gray' : 'normal';
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__fakeHidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__fakeHidden ? 'hidden' : 'visible' });

    function makeStream(index) {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#d2a35c'; ctx.fillRect(0, 0, 320, 240);
      const stream = canvas.captureStream(15);
      const track = stream.getVideoTracks()[0];
      track.__request = index;
      track.__holdFrame = (scenario === 'ready-state-zero' && index === 1)
        || (scenario === 'background' && index === 1)
        || (scenario === 'delayed-frame' && index === 1);
      window.__cameraTracks.push(track);
      const paint = () => {
        if (scenario === 'palette-recovery' && window.__cameraScene === 'black') {
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 240);
        } else if (scenario === 'palette-gray' && window.__cameraScene === 'gray') {
          ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 320, 240);
        } else if (scenario === 'palette-gray' && window.__cameraScene === 'gray-near') {
          ctx.fillStyle = '#888888'; ctx.fillRect(0, 0, 320, 240);
        } else if (scenario === 'palette-recovery' || scenario === 'palette-gray') {
          const colors = window.__cameraScene === 'scene-b'
            ? ['#a72cdd', '#32d2c2', '#ef5b8b']
            : ['#e48230', '#38b354', '#3975d4'];
          ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, 320, 80);
          ctx.fillStyle = colors[1]; ctx.fillRect(0, 80, 320, 80);
          ctx.fillStyle = colors[2]; ctx.fillRect(0, 160, 320, 80);
        } else {
          ctx.fillStyle = '#d2a35c'; ctx.fillRect(0, 0, 320, 240);
          ctx.fillStyle = '#4d82a7'; ctx.fillRect(45, 35, 230, 170);
          ctx.fillStyle = '#e76550'; ctx.fillRect(115, 75, 90, 90);
        }
        track.__holdFrame = false;
      };
      track.__paint = paint;
      window.__setCameraScene = (scene) => { window.__cameraScene = scene; track.__paint?.(); };
      if (scenario === 'delayed-frame' && index === 1) setTimeout(paint, 500);
      else if (!(scenario === 'ready-state-zero' && index === 1) && !(scenario === 'background' && index === 1)) paint();
      const timer = setInterval(() => { if (track.readyState === 'live' && !track.__holdFrame) paint(); }, 150);
      track.addEventListener('ended', () => clearInterval(timer), { once: true });
      return stream;
    }

    navigator.mediaDevices.getSupportedConstraints = () => ({});
    navigator.mediaDevices.getUserMedia = (constraints) => {
      requestCount++;
      window.__cameraRequestCount = requestCount;
      if (scenario === 'reject') return Promise.reject(new DOMException('Synthetic camera denial', 'NotAllowedError'));
      if (scenario === 'permission-pending' && requestCount === 1) {
        return new Promise((resolve) => { window.__grantPermission = () => resolve(makeStream(requestCount)); });
      }
      return Promise.resolve(makeStream(requestCount));
    };

    if (scenario === 'background') {
      const nativeTimeout = window.setTimeout.bind(window);
      window.setTimeout = (callback, delay, ...args) => nativeTimeout(callback, delay === 12000 ? 120 : delay, ...args);
    }
  }, { scenario });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ contentType: 'application/javascript', body: '' });
    return url.origin === origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/pixel-camera.html`, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

async function waitForLive(page) {
  await page.waitForFunction(() => document.querySelector('#capture')?.dataset.action === 'capture' && !document.querySelector('#capture').disabled, null, { timeout: 10000 });
  assert.equal(await page.locator('#pixelStudio').getAttribute('data-ready'), 'true');
}

try {
  if (!paletteOnly) {
  // Normal synthetic starts across four sizes also check the source video never becomes a visible overlay.
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    const { context, page } = await newPage({ viewport });
    await waitForLive(page);
    const video = await page.locator('#video').evaluate(node => {
      const rect = node.getBoundingClientRect(); const style = getComputedStyle(node);
      return { hidden: node.hidden, display: style.display, visibility: style.visibility, opacity: Number(style.opacity), width: rect.width, height: rect.height, inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight };
    });
    assert.equal(video.hidden, false);
    assert.equal(video.display, 'block');
    assert.equal(video.visibility, 'visible');
    assert.ok(video.opacity > 0 && video.opacity <= 0.02 && video.width === 1 && video.height === 1 && video.inViewport, JSON.stringify(video));
    checks++;
    await context.close();
  }

  // A delayed first frame remains pending briefly, then publishes normally.
  {
    const { context, page } = await newPage({ scenario: 'delayed-frame' });
    await waitForLive(page);
    assert.equal(await page.locator('#stageMsg').textContent(), '');
    checks++;
    await context.close();
  }

  // Two real 12-second watchdog cases: readyState never advances, then the user retry succeeds.
  {
    const { context, page } = await newPage({ scenario: 'ready-state-zero' });
    await page.waitForFunction(() => window.__cameraRequestCount === 1);
    await page.waitForFunction(() => document.querySelector('#stageMsg')?.textContent.includes('カメラ映像を受信できませんでした'), null, { timeout: 15000 });
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'idle');
    assert.equal(await page.locator('#capture').getAttribute('data-action'), 'resume');
    assert.equal(await page.evaluate(() => window.__cameraTracks[0].readyState), 'ended');
    const timeoutNotice = await page.locator('#stageMsg').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { visible: !node.hidden && getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden', srOnly: node.classList.contains('pc-sr-only'), inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight };
    });
    assert.deepEqual(timeoutNotice, { visible: true, srOnly: false, inViewport: true });
    const captureReachable = await page.locator('#capture').evaluate(node => {
      const rect = node.getBoundingClientRect(); const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { visible: rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== 'hidden', reachable: hit === node || node.contains(hit) };
    });
    assert.ok(captureReachable.visible && captureReachable.reachable, JSON.stringify(captureReachable));
    await page.locator('#capture').click();
    await waitForLive(page);
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 2);
    checks++;
    await context.close();
  }

  // An unresolved play() is covered by the real deadline; resolving it after a retry cannot stop the new session.
  {
    const { context, page } = await newPage({ scenario: 'late-play' });
    await page.waitForFunction(() => window.__cameraRequestCount === 1);
    await page.waitForFunction(() => document.querySelector('#stageMsg')?.textContent.includes('カメラ映像を受信できませんでした'), null, { timeout: 15000 });
    await page.locator('#capture').click();
    await waitForLive(page);
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 2);
    await page.evaluate(() => window.__resolveLatePlay?.());
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'live');
    assert.equal(await page.locator('#capture').getAttribute('data-action'), 'capture');
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 2);
    checks++;
    await context.close();
  }

  // Permission prompts have no watchdog. Hiding and returning during the prompt still shares one pending request.
  {
    const { context, page } = await newPage({ scenario: 'permission-pending' });
    await page.waitForFunction(() => window.__cameraRequestCount === 1);
    await page.waitForTimeout(12200);
    assert.equal(await page.locator('#stageMsg').textContent(), 'カメラを準備しています…');
    await page.evaluate(() => { window.__fakeHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(50);
    await page.evaluate(() => { window.__fakeHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 1);
    await page.evaluate(() => window.__grantPermission?.());
    await waitForLive(page);
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 2);
    checks++;
    await context.close();
  }

  // A backgrounded stream cancels its accelerated watchdog; resume then starts a fresh camera session.
  {
    const { context, page } = await newPage({ scenario: 'background' });
    await page.waitForFunction(() => window.__cameraRequestCount === 1);
    await page.evaluate(() => { window.__fakeHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#stageMsg').textContent(), 'カメラを一時停止しています。');
    await page.evaluate(() => { window.__fakeHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    await waitForLive(page);
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 2);
    checks++;
    await context.close();
  }

  // Rejected permission requests preserve the existing browser-specific guidance.
  {
    const { context, page } = await newPage({ scenario: 'reject' });
    await page.waitForFunction(() => document.querySelector('#stageMsg')?.textContent.includes('カメラへのアクセスが許可されていません'), null, { timeout: 5000 });
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'idle');
    checks++;
    await context.close();
  }

  // The PXD workspace's 新規 action applies an empty camera project; that path must reopen the camera.
  {
    const { context, page } = await newPage();
    await waitForLive(page);
    await page.locator('#project-open').click();
    await page.locator('#project-new').click();
    await waitForLive(page);
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 2);
    checks++;
    await context.close();
  }
  }

  // The initial source-16 black palette recovers without a tap, then remains fixed until an explicit stage tap.
  {
    const { context, page } = await newPage({ scenario: 'palette-recovery' });
    await waitForLive(page);
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.paletteSize === '1');
    const initialPalette = await page.locator('#paletteDots').evaluate(node => [...node.children].map(dot => dot.style.background));
    assert.deepEqual(initialPalette, ['rgb(0, 0, 0)']);
    const epochBeforeRecovery = await page.locator('#pixelStudio').evaluate(node => node.dataset.paletteEpoch);

    await page.evaluate(() => window.__setCameraScene('scene-a'));
    await page.waitForFunction(() => Number(document.querySelector('#pixelStudio')?.dataset.paletteSize) > 1, null, { timeout: 5000 });
    const recoveredPalette = await page.locator('#paletteDots').evaluate(node => [...node.children].map(dot => dot.style.background));
    assert.ok(recoveredPalette.some(color => color !== 'rgb(0, 0, 0)'));
    assert.equal(await page.locator('#pixelStudio').evaluate(node => node.dataset.paletteEpoch), epochBeforeRecovery, 'automatic recovery does not simulate a user tap');

    await page.evaluate(() => window.__setCameraScene('scene-b'));
    await page.waitForTimeout(500);
    assert.deepEqual(await page.locator('#paletteDots').evaluate(node => [...node.children].map(dot => dot.style.background)), recoveredPalette, 'ordinary scene changes keep the recovered palette');

    const { epochBeforeTap, previewBeforeTap } = await page.locator('#pixelStudio').evaluate(node => ({ epochBeforeTap: Number(node.dataset.paletteEpoch), previewBeforeTap: Number(node.dataset.previewFrames) }));
    await page.waitForTimeout(700);
    await page.locator('#stage').click({ position: { x: 195, y: 422 } });
    await page.waitForFunction((epoch) => Number(document.querySelector('#pixelStudio')?.dataset.paletteEpoch) > epoch, epochBeforeTap, { timeout: 3000 });
    await page.waitForFunction(({ preview, palette }) => {
      const root = document.querySelector('#pixelStudio');
      const current = [...document.querySelector('#paletteDots').children].map(dot => dot.style.background);
      return Number(root?.dataset.previewFrames) > preview && Number(root?.dataset.paletteSize) > 1 && current.join(';') !== palette.join(';');
    }, { preview: previewBeforeTap, palette: recoveredPalette }, { timeout: 5000 });
    const tappedPalette = await page.locator('#paletteDots').evaluate(node => [...node.children].map(dot => dot.style.background));
    assert.notDeepEqual(tappedPalette, recoveredPalette, 'a deliberate tap repicks from the current scene');
    checks++;
    await context.close();
  }

  // A one-swatch gray source palette tolerates a nearby gray frame, then recovers on a distinct scene without a tap.
  {
    const { context, page } = await newPage({ scenario: 'palette-gray' });
    await waitForLive(page);
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.paletteSize === '1');
    assert.deepEqual(await page.locator('#paletteDots').evaluate(node => [...node.children].map(dot => dot.style.background)), ['rgb(128, 128, 128)']);
    await page.evaluate(() => window.__setCameraScene('gray-near'));
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-palette-size'), '1', 'nearby gray remains a one-swatch palette');
    await page.evaluate(() => window.__setCameraScene('scene-a'));
    await page.waitForFunction(() => Number(document.querySelector('#pixelStudio')?.dataset.paletteSize) > 1, null, { timeout: 5000 });
    assert.ok(await page.locator('#paletteDots').evaluate(node => [...node.children].some(dot => dot.style.background !== 'rgb(128, 128, 128)')));
    checks++;
    await context.close();
  }

  assert.deepEqual(errors, []);
  console.log(`${paletteOnly ? 'Camera palette startup' : 'Camera startup'}: ${checks}/${checks} PASS; ${paletteOnly ? 'black/gray automatic recovery, nearby-gray hold, stable later scene, tap-triggered repick' : 'startup watchdog and palette recovery cases; background watchdog accelerated to 120ms'}; local synthetic cameras only; physical devices, Safari and production UNTESTED`);
} finally {
  await browser.close();
}
