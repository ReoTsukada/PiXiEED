#!/usr/bin/env node
/** Synthetic local image-upload camera checks; no real camera or external requests. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4198';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'the browser harness must use a local host');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const errors = [];
let checks = 0;

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
];

async function newPage({ camera = 'unavailable', viewport = { width: 390, height: 844 }, search = '' } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, deviceScaleFactor: 1 });
  await context.addInitScript(({ camera }) => {
    window.__cameraRequestCount = 0;
    window.__cameraTracks = [];
    window.__createdBlobUrls = 0;
    const createUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { window.__createdBlobUrls++; return createUrl(blob); };
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} });
    navigator.mediaDevices.getSupportedConstraints = () => ({});
    navigator.mediaDevices.getUserMedia = async () => {
      window.__cameraRequestCount++;
      if (camera === 'absent') throw new DOMException('Synthetic camera is unavailable', 'NotFoundError');
      if (camera === 'not-readable') throw new DOMException('Synthetic camera is busy', 'NotReadableError');
      if (camera === 'denied') throw new DOMException('Synthetic camera permission denied', 'NotAllowedError');
      if (camera === 'late') {
        return new Promise((resolve) => { window.__resolveCamera = () => {
          const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
          const stream = canvas.captureStream(1); const track = stream.getVideoTracks()[0];
          window.__cameraTracks.push(track); resolve(stream);
        }; });
      }
      throw new DOMException('Synthetic camera is unavailable', 'NotFoundError');
    };
  }, { camera });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/pixel-camera.html${search}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#cameraImageInput').waitFor({ state: 'attached', timeout: 10000 });
  if (camera === 'late') await page.waitForFunction(() => window.__cameraRequestCount === 1, null, { timeout: 10000 });
  else await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'idle'
    && document.querySelector('#welcome')?.hidden === false, null, { timeout: 10000 });
  return { context, page };
}

async function makeImage(page, { width = 640, height = 360, format = 'image/png', colors = ['#ed453a', '#2466d3'] } = {}) {
  const bytes = await page.evaluate(async ({ width, height, format, colors }) => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = colors[0]; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = colors[1]; ctx.fillRect(width * 0.6, 0, width * 0.4, height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, format, 0.92));
    if (!blob) throw new Error(`Could not create synthetic ${format} fixture`);
    return [...new Uint8Array(await blob.arrayBuffer())];
  }, { width, height, format, colors });
  const ext = format === 'image/jpeg' ? 'jpg' : format === 'image/webp' ? 'webp' : 'png';
  return { name: `upload-fixture.${ext}`, mimeType: format, buffer: Buffer.from(bytes) };
}

async function waitForImageAfterEpoch(page, previousPaletteEpoch) {
  await page.waitForFunction((epoch) => {
    const root = document.querySelector('#pixelStudio');
    const view = document.querySelector('#view');
    return root?.dataset.mode === 'live'
      && root?.dataset.source === 'image'
      && Number(root?.dataset.paletteEpoch) > epoch
      && root?.dataset.ready === 'true'
      && view?.width > 1 && view?.height > 1
      && document.querySelector('#capture')?.dataset.action === 'capture'
      && !document.querySelector('#capture').disabled;
  }, previousPaletteEpoch, { timeout: 15000 });
}

async function upload(page, file) {
  const previousPaletteEpoch = Number(await page.locator('#pixelStudio').getAttribute('data-palette-epoch') || 0);
  await page.locator('#cameraImageInput').setInputFiles(file);
  await waitForImageAfterEpoch(page, previousPaletteEpoch);
}

async function chooseViaButton(page, buttonSelector, file) {
  const previousPaletteEpoch = Number(await page.locator('#pixelStudio').getAttribute('data-palette-epoch') || 0);
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
  await page.locator(buttonSelector).click();
  const chooser = await chooserPromise;
  assert.equal(await chooser.element().evaluate(element => element.id), 'cameraImageInput', `${buttonSelector} opens the shared image input`);
  await chooser.setFiles(file);
  await waitForImageAfterEpoch(page, previousPaletteEpoch);
}

async function waitForImportedPreview(page) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#pixelStudio');
    const view = document.querySelector('#view');
    return root?.dataset.mode === 'live'
      && root?.dataset.source === 'image'
      && root?.dataset.ready === 'true'
      && view?.width > 1 && view?.height > 1;
  }, null, { timeout: 10000 });
}

async function readView(page) {
  return page.locator('#view').evaluate(canvas => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width, height } = canvas;
    const samples = [[0.2, 0.5], [0.8, 0.5]].map(([x, y]) => {
      const pixel = ctx.getImageData(Math.floor(width * x), Math.floor(height * y), 1, 1).data;
      return [...pixel.slice(0, 3)];
    });
    return { width, height, samples };
  });
}

async function capture(page) {
  await page.locator('#capture').click();
  await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured'
    && document.querySelector('#savePng')?.getAttribute('aria-disabled') === 'false', null, { timeout: 20000 });
}

async function downloadPng(page) {
  await page.locator('#savePng').click();
  await page.waitForFunction(() => document.querySelector('#cameraSaveDialog')?.open === true, null, { timeout: 8000 });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.locator('#cameraDownloadFile').click(),
  ]);
  const filePath = await download.path();
  assert.ok(filePath, 'browser produced the converted PNG file');
  return readFile(filePath);
}

function overlap(a, b) { return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top; }

try {
  // Camera access failures explain the unavailable state and leave both image-choice entry points usable.
  for (const camera of ['absent', 'denied', 'not-readable']) {
    const { context, page } = await newPage({ camera });
    const reason = await page.locator('#cameraUnavailableReason').evaluate(node => ({
      text: node.textContent.trim(), hidden: node.hidden,
      visible: getComputedStyle(node).display !== 'none' && getComputedStyle(node).visibility !== 'hidden',
    }));
    assert.equal(reason.hidden, false, `${camera}: unavailable explanation is not hidden`);
    assert.ok(reason.visible && reason.text.length > 0, `${camera}: explanation should be visible and specific`);
    assert.equal(await page.locator('#cameraChooseImage').isVisible(), true);
    assert.equal(await page.locator('#cameraFallbackChoose').isVisible(), true);
    const accept = await page.locator('#cameraImageInput').getAttribute('accept');
    assert.match(accept, /image\/png/i);
    assert.match(accept, /image\/jpeg/i);
    assert.match(accept, /image\/webp/i);
    assert.ok(await page.evaluate(() => window.__cameraRequestCount >= 1));
    checks++;
    await context.close();
  }

  // Both visible chooser buttons open the real browser file chooser and feed its selected file into the preview.
  {
    const { context, page } = await newPage({ camera: 'denied' });
    const fallbackImage = await makeImage(page, { colors: ['#ec3838', '#2458cc'] });
    await chooseViaButton(page, '#cameraFallbackChoose', fallbackImage);
    const fallbackPreview = await readView(page);
    assert.ok(fallbackPreview.width > 1 && fallbackPreview.height > 1);
    const topImage = await makeImage(page, { colors: ['#187e44', '#eead22'] });
    await chooseViaButton(page, '#cameraChooseImage', topImage);
    assert.notDeepEqual((await readView(page)).samples, fallbackPreview.samples, 'top chooser replaces the fallback-selected image');
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 1, 'file choosers do not retry camera permission');
    checks++;
    await context.close();
  }

  // Imported images become the live source, retain the existing six settings, and do not mirror like a front camera.
  {
    const { context, page } = await newPage();
    const png = await makeImage(page, { width: 800, height: 400 });
    await page.locator('#cameraChooseImage').click();
    await upload(page, png);
    const imageState = await page.evaluate(() => ({
      mode: document.querySelector('#pixelStudio').dataset.mode,
      settings: [...document.querySelector('#toolbarHome').querySelectorAll('button')].length,
      cameraOpenDisabled: document.querySelector('#flipCamera').disabled,
      cameraOpenLabel: document.querySelector('#flipCamera').getAttribute('aria-label'),
      cameraOpenTitle: document.querySelector('#flipCamera').title,
      capture: document.querySelector('#capture').dataset.action,
      tracks: window.__cameraTracks.map(track => track.readyState),
      videoStream: Boolean(document.querySelector('#video').srcObject),
    }));
    assert.equal(imageState.mode, 'live');
    assert.equal(imageState.settings, 6, 'all six camera settings remain available');
    assert.equal(imageState.cameraOpenDisabled, false, 'camera button stays available for an imported image source');
    assert.match(imageState.cameraOpenLabel, /カメラを開く/);
    assert.match(imageState.cameraOpenTitle, /カメラを開く/);
    assert.equal(imageState.capture, 'capture');
    assert.equal(imageState.videoStream, false, 'image source stops and detaches camera video');
    const preview = await readView(page);
    assert.ok(preview.width > 0 && preview.height > 0);
    assert.notDeepEqual(preview.samples[0], preview.samples[1], 'left/right colors prove the source is not mirrored or blank');
    await page.locator('#capture').dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch', button: 0, bubbles: true });
    await page.waitForTimeout(650);
    assert.equal(await page.locator('#gifRec').isHidden(), true, 'still images disable the long-press GIF flow');
    await page.locator('#capture').dispatchEvent('pointerup', { pointerId: 1, pointerType: 'touch', button: 0, bubbles: true });
    await capture(page);
    assert.equal(await page.locator('#flipCamera').isDisabled(), true, 'camera button is disabled while showing captured results');
    await page.locator('.px-tool-result__return').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live'
      && document.querySelector('#capture')?.dataset.action === 'capture', null, { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 1, 'retaking an imported source does not request the denied camera again');
    await waitForImportedPreview(page);
    assert.deepEqual(await readView(page), preview, 'retake restores the same imported source and settings');
    await capture(page);
    await page.locator('#savePng').click();
    await page.waitForFunction(() => document.querySelector('#cameraSaveDialog')?.open === true);
    await page.locator('#cameraDownloadFile').waitFor({ state: 'visible' });
    assert.ok(await page.locator('#cameraDownloadFile').getAttribute('href'));
    await page.keyboard.press('Escape');
    checks++;
    await context.close();
  }

  // The camera icon reuses its existing position to switch from an imported image back to camera startup.
  {
    const { context, page } = await newPage();
    await upload(page, await makeImage(page));
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 1);
    await page.locator('#flipCamera').click();
    await page.waitForFunction(() => window.__cameraRequestCount === 2
      && document.querySelector('#pixelStudio')?.dataset.mode === 'idle', null, { timeout: 10000 });
    assert.equal(await page.locator('#flipCamera').isDisabled(), true, 'camera-opening action returns to the idle camera state');
    checks++;
    await context.close();
  }

  // Visibility changes never turn an imported still image back into a camera request.
  {
    const { context, page } = await newPage();
    const fixture = await makeImage(page);
    await upload(page, fixture);
    const preview = await readView(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    assert.deepEqual(await readView(page), preview, 'visibility resume preserves imported pixels');
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 1, 'visibility resume does not ask for a camera');
    checks++;
    await context.close();
  }

  // PNG, JPEG, and WebP all produce a usable local image source. Same-file selection is accepted twice.
  for (const format of ['image/png', 'image/jpeg', 'image/webp']) {
    const { context, page } = await newPage();
    const fixture = await makeImage(page, { format });
    await upload(page, fixture);
    const first = await readView(page);
    assert.ok(first.width > 0 && first.height > 0 && first.samples.some(pixel => pixel[0] > pixel[2]));
    await upload(page, fixture);
    assert.deepEqual(await readView(page), first, `${format}: choosing the same file twice reloads it`);
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured');
    await page.locator('.px-tool-result__return').click();
    await waitForImportedPreview(page);
    const afterRetake = await readView(page);
    assert.deepEqual(afterRetake.samples, first.samples, `${format}: retake restores the imported source`);
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 1, `${format}: retake does not request camera again`);
    checks++;
    await context.close();
  }

  // A selected 64-dot output and 16:9 crop survive capture as integer-sized PNG pixel blocks.
  {
    const { context, page } = await newPage();
    await upload(page, await makeImage(page, { width: 800, height: 400 }));
    await page.locator('#toolbar [data-tool="pixels"]').click();
    await page.locator('#pixelsPanel [data-value="64"]').click();
    await page.locator('#toolbarContextBack').click();
    await page.locator('#toolbar [data-tool="aspect"]').click();
    await page.locator('#aspectPanel [data-value="16:9"]').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.outputSize === '64'
      && document.querySelector('#pixelStudio')?.dataset.framing === '16:9'
      && document.querySelector('#frameDimensions')?.textContent === '64 × 36', null, { timeout: 10000 });
    const preview = await readView(page);
    assert.deepEqual([preview.width, preview.height], [64, 36], 'chosen long edge and aspect ratio define source crop');
    await capture(page);
    const bytes = await downloadPng(page);
    assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'download is PNG');
    assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [2048, 1152], 'PNG output scales 64×36 cells to a 2048px long edge');
    const blockCheck = await page.evaluate(async raw => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(raw)], { type: 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const sample = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
      const block = 32;
      for (const [cellX, cellY] of [[3, 3], [20, 18], [59, 30]]) {
        const a = sample(cellX * block + 2, cellY * block + 2);
        const b = sample(cellX * block + block - 3, cellY * block + block - 3);
        if (a.some((channel, index) => channel !== b[index])) return { ok: false, cellX, cellY, a, b };
      }
      return { ok: true, width: canvas.width, height: canvas.height };
    }, [...bytes]);
    assert.deepEqual(blockCheck, { ok: true, width: 2048, height: 1152 }, 'PNG uses crisp 32×32 blocks per 64-dot source cell');
    checks++;
    await context.close();
  }

  // A replacement changes the preview; invalid/corrupt files and a cancelled picker keep the good source or result.
  {
    const { context, page } = await newPage();
    const firstFile = await makeImage(page, { colors: ['#f02b35', '#2456d9'] });
    await upload(page, firstFile);
    const first = await readView(page);
    await page.locator('#cameraChooseImage').click();
    await page.locator('#cameraImageInput').setInputFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.waitForTimeout(200);
    assert.deepEqual(await readView(page), first, 'corrupt image leaves last good preview intact');
    assert.equal(await page.locator('#cameraImageStatus').isVisible(), true, 'corrupt image has a visible error explanation');
    await capture(page);
    const resultCanvasBefore = await page.locator('#view').evaluate(canvas => canvas.toDataURL());
    await page.locator('#cameraChooseImage').click();
    await page.locator('#cameraImageInput').setInputFiles({ name: 'not-image.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'captured', 'invalid MIME does not discard the captured result');
    assert.equal(await page.locator('#view').evaluate(canvas => canvas.toDataURL()), resultCanvasBefore);
    assert.equal(await page.locator('#cameraImageStatus').isVisible(), true, 'invalid replacement has a visible error explanation');
    await page.locator('#cameraChooseImage').click();
    const secondFile = await makeImage(page, { colors: ['#187e44', '#eead22'] });
    await upload(page, secondFile);
    assert.notDeepEqual((await readView(page)).samples, first.samples, 'valid replacement updates the imported source');
    checks++;
    await context.close();
  }

  // An invalid audio handoff keeps its recovery explanation visible and blocks camera/image actions.
  {
    const invalidRequestId = '00000000-0000-4000-8000-000000000000';
    const { context, page } = await newPage({ search: `?to=audio&audioRequest=${invalidRequestId}` });
    assert.equal(new URL(page.url()).search, `?to=audio&audioRequest=${invalidRequestId}`, 'browser retained the invalid handoff query');
    assert.match(await page.locator('#cameraUnavailableReason').textContent(), /音楽への受け渡しを確認できません/);
    assert.equal(await page.locator('#cameraUnavailableReason').isVisible(), true);
    assert.equal(await page.locator('#capture').isDisabled(), true);
    assert.equal(await page.locator('#cameraChooseImage').isDisabled(), true);
    assert.equal(await page.locator('#cameraFallbackChoose').isDisabled(), true);
    assert.equal(await page.locator('#cameraImageInput').isDisabled(), true);
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 0, 'invalid handoff does not request the camera');
    checks++;
    await context.close();
  }

  // A pending camera permission resolution after image selection cannot replace it or leak its stream.
  {
    const { context, page } = await newPage({ camera: 'late' });
    await page.waitForFunction(() => window.__cameraRequestCount === 1);
    const fixture = await makeImage(page);
    await upload(page, fixture);
    const image = await readView(page);
    await page.evaluate(() => window.__resolveCamera?.());
    await page.waitForFunction(() => window.__cameraTracks.length === 1);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'), 'live');
    assert.deepEqual(await readView(page), image, 'late camera resolution cannot replace the imported image');
    assert.equal(await page.evaluate(() => window.__cameraTracks[0].readyState), 'ended', 'stale late camera track is stopped');
    assert.equal(await page.evaluate(() => window.__cameraRequestCount), 1);
    checks++;
    await context.close();
  }

  // Explanation, chooser actions, and the preview remain visible and non-overlapping at narrow and landscape sizes.
  for (const viewport of viewports) {
    const { context, page } = await newPage({ viewport });
    const fixture = await makeImage(page, { width: 640, height: 480 });
    await upload(page, fixture);
    const layout = await page.evaluate(() => {
      const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const controls = ['cameraChooseImage', 'cameraFallbackChoose', 'capture'].map(id => {
        const node = document.getElementById(id); return { id, hidden: node.hidden, rect: rect(node), visible: node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' };
      });
      const r = rect(document.querySelector('#view'));
      return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, controls, view: r };
    });
    assert.ok(layout.scrollWidth <= viewport.width + 1, `${viewport.width}x${viewport.height}: horizontal overflow ${JSON.stringify(layout)}`);
    assert.ok(layout.view.width > 0 && layout.view.height > 0, `${viewport.width}x${viewport.height}: uploaded preview visible`);
    for (const control of layout.controls) {
      if (!control.visible) continue;
      assert.ok(control.visible, `${viewport.width}x${viewport.height}: ${control.id} is reachable`);
      assert.ok(control.rect.width >= 40 && control.rect.height >= 40, `${viewport.width}x${viewport.height}: ${control.id} is too small`);
    }
    const shown = layout.controls.filter(control => !control.hidden && control.visible);
    for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
      assert.ok(!overlap(shown[i].rect, shown[j].rect), `${viewport.width}x${viewport.height}: controls overlap ${shown[i].id}/${shown[j].id}`);
    }
    if (viewport.width === 390 && process.env.PIXIEED_UPLOAD_SCREENSHOT) {
      await page.screenshot({ path: process.env.PIXIEED_UPLOAD_SCREENSHOT, fullPage: true });
      console.log(`SCREENSHOT ${process.env.PIXIEED_UPLOAD_SCREENSHOT}`);
    }
    checks++;
    await context.close();
  }

  assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
  console.log(`Camera image upload: ${checks}/${checks} PASS; local synthetic PNG/JPEG/WebP, camera unavailable states, stale permission, replacement, retake and responsive layout; physical devices, real photos and production UNTESTED`);
} finally {
  await browser.close();
}
