#!/usr/bin/env node
/** Local camera save flow checks with a synthetic canvas camera; no real device or remote requests. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4198';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'the browser harness must use a local host');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const engine = process.env.PIXIEED_BROWSER_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine), 'PIXIEED_BROWSER_ENGINE must be chromium or webkit');
const playwright = await import(pathToFileURL(runtime).href);
let browser;
try {
  browser = await playwright[engine].launch({
    headless: true,
    ...(engine === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}),
  });
} catch (error) {
  if (engine !== 'webkit') throw error;
  console.log(`SKIP WebKit camera-save flow: browser launch failed (${error.message}); no browser/runtime installation attempted.`);
  process.exit(0);
}
const errors = [];
let checks = 0;

if (engine === 'webkit') {
  let supportsSyntheticCamera = false;
  try {
    const probe = await browser.newPage();
    supportsSyntheticCamera = await probe.evaluate(() => typeof HTMLCanvasElement.prototype.captureStream === 'function');
    await probe.close();
  } catch (error) {
    console.log(`SKIP WebKit camera-save flow: browser page setup failed (${error.message}); no browser/runtime installation attempted.`);
    await browser.close().catch(() => {});
    process.exit(0);
  }
  if (!supportsSyntheticCamera) {
    console.log('SKIP WebKit camera-save flow: canvas.captureStream is unavailable; no browser/runtime installation attempted.');
    await browser.close();
    process.exit(0);
  }
}

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
];

async function openPage({ viewport = { width: 390, height: 844 }, share = 'unsupported' } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, deviceScaleFactor: 1 });
  await context.addInitScript(({ share }) => {
    localStorage.setItem('pixieed:camera-gestures:v1', '1');
    window.__blobFetchCount = 0;
    window.__shareCalls = [];
    window.__downloadEvents = 0;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, ...args) => {
      const href = typeof input === 'string' ? input : input?.url;
      if (typeof href === 'string' && href.startsWith('blob:')) window.__blobFetchCount++;
      return nativeFetch(input, ...args);
    };
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getSupportedConstraints = () => ({});
      navigator.mediaDevices.getUserMedia = async () => {
        if (!HTMLCanvasElement.prototype.captureStream) throw new DOMException('Synthetic canvas camera unavailable', 'NotAllowedError');
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
        const context = canvas.getContext('2d');
        const paint = () => {
          context.fillStyle = '#d2a35c'; context.fillRect(0, 0, 320, 240);
          context.fillStyle = '#4d82a7'; context.fillRect(35, 25, 250, 190);
          context.fillStyle = '#e76550'; context.fillRect(110, 70, 100, 100);
          context.fillStyle = '#f4dfa3'; context.fillRect(132, 89, 28, 28);
        };
        paint(); setInterval(paint, 80);
        return canvas.captureStream(15);
      };
    }
    const makeError = (name) => new DOMException(name, name);
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => {
        if (share === 'canShare-throws') throw makeError('TypeError');
        return share !== 'unsupported';
      }
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data) => {
        window.__shareCalls.push({
          activation: Boolean(navigator.userActivation?.isActive),
          fileCount: data?.files?.length || 0,
          name: data?.files?.[0]?.name || '',
          type: data?.files?.[0]?.type || '',
          size: data?.files?.[0]?.size || 0,
        });
        if (share === 'abort') throw makeError('AbortError');
        if (share === 'not-allowed') throw makeError('NotAllowedError');
      }
    });
  }, { share });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('download', () => { void page.evaluate(() => { window.__downloadEvents++; }).catch(() => {}); });
  await page.goto(`${base}/pixel-camera.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#capture')?.dataset.action === 'capture'
    && !document.querySelector('#capture').disabled, null, { timeout: 15000 });
  assert.equal(await page.locator('#pixelStudio').getAttribute('data-ready'), 'true');
  return { context, page };
}

async function capturePng(page) {
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false'
    && document.querySelector('#savePng')?.download.endsWith('.png'), null, { timeout: 20000 });
}

async function openSaveDialog(page) {
  await page.locator('#savePng').click();
  await page.waitForFunction(() => document.querySelector('#cameraSaveDialog')?.open === true, null, { timeout: 8000 });
}

async function downloadFromDialog(page) {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.locator('#cameraDownloadFile').click(),
  ]);
  const path = await download.path();
  assert.ok(path, 'the browser produced a download file');
  return { download, bytes: await readFile(path) };
}

function pngDimensions(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'download is a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function decodePng(page, bytes) {
  return page.evaluate(async raw => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(raw)], { type: 'image/png' }));
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }, [...bytes]);
}

function overlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

try {
  // Save methods stay within the viewport and the native dialog keeps keyboard focus behavior.
  for (const viewport of viewports) {
    const { context, page } = await openPage({ viewport });
    await capturePng(page);
    await openSaveDialog(page);
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector('#cameraSaveDialog');
      const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const controls = [...dialog.querySelectorAll('button:not([hidden]):not(:disabled), a[href]')]
        .filter(node => node.getClientRects().length).map(node => ({ id: node.id, ...rect(node) }));
      const d = rect(dialog);
      return {
        viewportWidth: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        dialog: d, controls,
        focusId: document.activeElement?.id || '',
      };
    });
    assert.ok(layout.scrollWidth <= layout.viewportWidth + 1, `${viewport.width}x${viewport.height}: horizontal page overflow ${JSON.stringify(layout)}`);
    assert.ok(layout.dialog.left >= -1 && layout.dialog.right <= viewport.width + 1 && layout.dialog.top >= -1 && layout.dialog.bottom <= viewport.height + 1,
      `${viewport.width}x${viewport.height}: dialog escaped viewport ${JSON.stringify(layout.dialog)}`);
    if (viewport.width === 390 && process.env.PIXIEED_SAVE_SCREENSHOT) {
      await page.screenshot({ path: process.env.PIXIEED_SAVE_SCREENSHOT, fullPage: true });
      console.log(`SCREENSHOT ${process.env.PIXIEED_SAVE_SCREENSHOT}`);
    }
    for (const control of layout.controls) {
      assert.ok(control.width >= 48 && control.height >= 48, `${viewport.width}x${viewport.height}: undersized ${control.id} ${JSON.stringify(control)}`);
      assert.ok(control.left >= layout.dialog.left && control.right <= layout.dialog.right && control.top >= layout.dialog.top && control.bottom <= layout.dialog.bottom,
        `${viewport.width}x${viewport.height}: ${control.id} outside dialog`);
    }
    for (let i = 0; i < layout.controls.length; i++) for (let j = i + 1; j < layout.controls.length; j++) {
      assert.ok(!overlap(layout.controls[i], layout.controls[j]), `${viewport.width}x${viewport.height}: controls overlap ${layout.controls[i].id}/${layout.controls[j].id}`);
    }
    assert.ok(['cameraDownloadFile', 'cameraOpenFile'].includes(layout.focusId), `dialog focus should enter a usable save control, got ${layout.focusId}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#cameraSaveDialog')?.open);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'savePng', 'Escape returns focus to the save action');
    checks++;
    await context.close();
  }

  // The desktop download is a real browser download with a decodable, full-size PNG payload.
  {
    const { context, page } = await openPage();
    await capturePng(page); await openSaveDialog(page);
    const { download, bytes } = await downloadFromDialog(page);
    assert.match(download.suggestedFilename(), /^pixieed-pixel-camera-\d+x\d+\.png$/);
    const dimensions = pngDimensions(bytes);
    assert.equal(Math.max(dimensions.width, dimensions.height), 2048, `PNG long edge ${JSON.stringify(dimensions)}`);
    assert.deepEqual(await decodePng(page, bytes), dimensions, 'browser fully decodes the downloaded PNG at its IHDR dimensions');
    assert.ok(bytes.length > 1000, `PNG download has image data (${bytes.length} bytes)`);
    assert.equal(await page.evaluate(() => window.__blobFetchCount), 0, 'saving uses the retained Blob without fetching its blob URL');
    checks++;
    await context.close();
  }

  // Share is called directly from a trusted button click; the browser's user activation is still live.
  {
    const { context, page } = await openPage({ share: 'supported' });
    await capturePng(page); await openSaveDialog(page);
    assert.equal(await page.locator('#cameraShareFile').isVisible(), true);
    await page.locator('#cameraShareFile').click();
    await page.waitForFunction(() => document.querySelector('#cameraSaveStatus')?.textContent.includes('共有画面にファイルを渡しました。'));
    const result = await page.evaluate(() => ({ calls: window.__shareCalls, downloads: window.__downloadEvents, fetches: window.__blobFetchCount }));
    assert.equal(result.calls.length, 1);
    assert.equal(result.calls[0].activation, true, 'navigator.share was invoked inside transient user activation');
    assert.equal(result.calls[0].fileCount, 1);
    assert.match(result.calls[0].name, /^pixieed-pixel-camera-\d+x\d+\.png$/);
    assert.equal(result.calls[0].type, 'image/png');
    assert.ok(result.calls[0].size > 1000);
    assert.equal(result.downloads, 0, 'sharing never silently starts a download');
    assert.equal(result.fetches, 0, 'sharing uses the retained Blob without fetching its object URL');
    checks++;
    await context.close();
  }

  // Unsupported or throwing capability probes leave explicit download and open-file choices usable.
  for (const share of ['unsupported', 'canShare-throws']) {
    const { context, page } = await openPage({ share });
    await capturePng(page); await openSaveDialog(page);
    assert.equal(await page.locator('#cameraShareFile').isVisible(), false, `${share}: no unsupported share action`);
    const { download, bytes } = await downloadFromDialog(page);
    assert.match(download.suggestedFilename(), /\.png$/);
    assert.equal(pngDimensions(bytes).width > 0, true);
    assert.equal(await page.evaluate(() => window.__shareCalls.length), 0);
    checks++;
    await context.close();
  }

  // User cancellation leaves the captured file ready for an explicit alternate action.
  for (const share of ['abort', 'not-allowed']) {
    const { context, page } = await openPage({ share });
    await capturePng(page); await openSaveDialog(page);
    await page.locator('#cameraShareFile').click();
    await page.waitForFunction(() => {
      const button = document.querySelector('#cameraShareFile');
      return !button.disabled && document.querySelector('#cameraSaveStatus')?.textContent.length > 0;
    });
    const status = await page.locator('#cameraSaveStatus').textContent();
    if (share === 'abort') assert.match(status, /キャンセル/);
    else assert.match(status, /共有できませんでした/);
    assert.equal(await page.evaluate(() => window.__downloadEvents), 0, `${share}: no automatic download after share result`);
    assert.equal(await page.locator('#cameraDownloadFile').getAttribute('href') !== null, true, `${share}: alternate download remains ready`);
    const { download } = await downloadFromDialog(page);
    assert.match(download.suggestedFilename(), /\.png$/);
    checks++;
    await context.close();
  }

  // The image-open fallback preserves the original full-size PNG in a new tab.
  {
    const { context, page } = await openPage();
    await capturePng(page); await openSaveDialog(page);
    const originalUrl = await page.locator('#cameraOpenFile').getAttribute('href');
    const [picture] = await Promise.all([
      context.waitForEvent('page', { timeout: 10000 }),
      page.locator('#cameraOpenFile').click(),
    ]);
    await picture.waitForFunction(() => document.images[0]?.complete && document.images[0].naturalWidth > 0);
    assert.equal(picture.url(), originalUrl, 'image fallback opens the original captured file');
    const dimensions = await picture.evaluate(() => ({ width: document.images[0].naturalWidth, height: document.images[0].naturalHeight }));
    assert.equal(Math.max(dimensions.width, dimensions.height), 2048);
    assert.match(await page.locator('#cameraSaveStatus').textContent(), /長押し.*右クリック/);
    checks++;
    await context.close();
  }

  // GIF long-press exports actual GIF bytes; retake clears its old links and dialog state.
  {
    const { context, page } = await openPage();
    const shutter = page.locator('#capture');
    const box = await shutter.boundingBox(); assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false'
      && document.querySelector('#savePng')?.download.endsWith('.gif'), null, { timeout: 20000 });
    const oldUrl = await page.locator('#savePng').getAttribute('href');
    await openSaveDialog(page);
    const { download, bytes } = await downloadFromDialog(page);
    assert.match(download.suggestedFilename(), /^pixieed-pixel-camera-\d+x\d+\.gif$/);
    assert.ok(['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6)), 'download contains a valid GIF signature');
    assert.ok(bytes.length > 100);
    await page.locator('#cameraSaveDialog form button[type="submit"]').click();
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live'
      && document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'true', null, { timeout: 15000 });
    assert.equal(await page.locator('#savePng').getAttribute('href'), null, 'retake removes the old save URL');
    assert.equal(await page.locator('#savePng').getAttribute('download'), null, 'retake removes the old filename');
    assert.equal(await page.locator('#cameraDownloadFile').getAttribute('href'), null, 'retake clears the dialog download link');
    assert.equal(await page.locator('#cameraOpenFile').getAttribute('href'), null, 'retake clears the dialog open link');
    assert.equal(await page.locator('#cameraSaveDialog').evaluate(node => node.open), false);
    assert.ok(oldUrl?.startsWith('blob:'));
    checks++;
    await context.close();
  }

  assert.deepEqual(errors, [], `browser errors: ${errors.join(' | ')}`);
  console.log(`PASS camera save browser harness (${checks} checks; ${engine} + synthetic canvas camera; no device, Safari, or production proof)`);
} finally {
  await browser.close();
}
