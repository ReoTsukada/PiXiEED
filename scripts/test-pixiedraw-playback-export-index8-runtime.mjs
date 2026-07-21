import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const appSource = fs.readFileSync(new URL('pixiedraw/assets/js/app.js', root), 'utf8');
const navigationSource = fs.readFileSync(
  new URL('pixiedraw/assets/js/modules/timeline-navigation-workflow-utils.js', root),
  'utf8'
);
const timelineSource = fs.readFileSync(new URL('pixiedraw/assets/js/modules/timeline-layers.js', root), 'utf8');
const serializationSource = fs.readFileSync(
  new URL('pixiedraw/assets/js/modules/document-serialization-utils.js', root),
  'utf8'
);
assert.match(
  navigationSource,
  /!state\.playback\?\.isPlaying && typeof compactInactiveRasterFrameIndices === 'function'/,
  'playback frame changes must not synchronously compact the previous frame'
);
assert.match(
  appSource,
  /if \(!state\.playback\.isPlaying\) \{\s*clearPlaybackFrameCache\(\);\s*\}/,
  'playback frame changes must preserve the prepared playback cache'
);
assert.match(
  timelineSource,
  /state\.playback\.isPlaying && playbackHandle != null[\s\S]{0,400}state\.playback\.isPlaying = false;[\s\S]{0,200}clearPlaybackFrameCache\(\);/,
  'the play action must recover a stale restored isPlaying flag'
);
assert.doesNotMatch(
  serializationSource,
  /isPlaying: Boolean\((?:snapshot|payload)\.playback\.isPlaying\)/,
  'saved and restored documents must not persist transient playback activity'
);

const screenshotsRequire = createRequire(new URL('../tools/screenshots/package.json', import.meta.url));
const { chromium } = screenshotsRequire('playwright');
const targetUrl = process.env.PIXIEEDRAW_TEST_URL || 'http://127.0.0.1:8000/pixiedraw/';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    acceptDownloads: true,
  });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(String(error?.stack || error)));
  await page.route(
    /googlesyndication|doubleclick|google-analytics|googletagmanager|fonts\.googleapis|supabase\.co/,
    route => route.abort()
  ).catch(() => {});
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(1_500);

  await page.click('#startupActionNew');
  await page.waitForSelector('#newProjectDialog[open]');
  await page.fill('#newProjectName', 'index8-playback-export');
  await page.click('#confirmNewProject');
  await page.waitForFunction(() => !document.getElementById('newProjectDialog')?.open, null, { timeout: 15_000 });

  const canvas = page.locator('#drawingCanvas');
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0);
  await page.mouse.click(
    box.x + box.width * (0.5 + 0.25 / 32),
    box.y + box.height * (0.5 + 0.25 / 32)
  );
  await page.waitForTimeout(150);

  await page.evaluate(() => document.getElementById('addFrame')?.click());
  await page.waitForTimeout(200);
  await page.mouse.click(
    box.x + box.width * (0.5 + 2.25 / 32),
    box.y + box.height * (0.5 + 0.25 / 32)
  );
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const fps = document.getElementById('animationFps');
    if (fps instanceof HTMLInputElement) {
      fps.value = '4';
      fps.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('applyFpsAll')?.click();
    document.getElementById('rewindAnimation')?.click();
  });
  await page.waitForTimeout(100);

  const readCanvasVisiblePixels = async () => page.evaluate(() => {
    const target = document.getElementById('drawingCanvas');
    const context = target?.getContext('2d', { willReadFrequently: true });
    if (!(target instanceof HTMLCanvasElement) || !context) return -1;
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    let visiblePixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) visiblePixels += 1;
    }
    return visiblePixels;
  });

  const editorVisiblePixels = await readCanvasVisiblePixels();
  assert.ok(editorVisiblePixels > 0, 'the editor must contain a visible Uint8-indexed pixel');

  await page.click('#mobileTabFrames');
  await page.waitForSelector('#playAnimation:visible');
  await page.click('#playAnimation');
  const playbackSamples = await page.evaluate(async () => {
    const read = () => {
      const target = document.getElementById('drawingCanvas');
      const context = target?.getContext('2d', { willReadFrequently: true });
      if (!(target instanceof HTMLCanvasElement) || !context) return null;
      const pixels = context.getImageData(0, 0, target.width, target.height).data;
      let visiblePixels = 0;
      let visibleCoordinateHash = 0;
      for (let pixelIndex = 0, index = 3; index < pixels.length; pixelIndex += 1, index += 4) {
        if (pixels[index] > 0) {
          visiblePixels += 1;
          visibleCoordinateHash = ((visibleCoordinateHash * 33) + pixelIndex + 1) >>> 0;
        }
      }
      return {
        visiblePixels,
        visibleCoordinateHash,
        playing: document.getElementById('playAnimation')?.getAttribute('aria-pressed') === 'true',
      };
    };
    const samples = [read()];
    for (let index = 0; index < 8; index += 1) {
      await new Promise(resolve => setTimeout(resolve, 125));
      samples.push(read());
    }
    return samples;
  });
  assert.ok(playbackSamples[0]?.visiblePixels > 0, 'the first playback frame must render the Uint8-indexed drawing');
  assert.ok(playbackSamples.some(sample => sample?.playing), 'playback must enter the playing state');
  assert.ok(
    new Set(playbackSamples.map(sample => sample?.visibleCoordinateHash)).size >= 2,
    `playback must advance through distinct frames: ${JSON.stringify(playbackSamples)}`
  );
  await page.evaluate(() => document.getElementById('stopAnimation')?.click());
  await page.evaluate(() => document.getElementById('removeFrame')?.click());
  await page.waitForTimeout(150);

  await page.evaluate(() => document.getElementById('exportProject')?.click());
  await page.waitForSelector('#exportDialog[open]', { timeout: 10_000 });
  await page.selectOption('#exportFormat', 'png');
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.click('#confirmExport');
  const interstitial = page.locator('#exportInterstitialDialog');
  if (await interstitial.isVisible().catch(() => false)) {
    await page.click('#closeExportInterstitial');
  }
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.png$/i);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const pngBytes = Buffer.concat(chunks);
  assert.deepEqual(Array.from(pngBytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);

  const exported = await page.evaluate(async bytes => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
    const bitmap = await createImageBitmap(blob);
    const target = document.createElement('canvas');
    target.width = bitmap.width;
    target.height = bitmap.height;
    const context = target.getContext('2d', { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(0, 0, target.width, target.height).data;
    let visiblePixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 0) visiblePixels += 1;
    }
    return { width: target.width, height: target.height, visiblePixels };
  }, Array.from(pngBytes));
  assert.ok(exported.visiblePixels > 0, 'the downloaded PNG must contain the Uint8-indexed drawing');
  assert.deepEqual(runtimeErrors, []);

  console.log(JSON.stringify({
    editorVisiblePixels,
    playbackSamples,
    exported,
    exportedFileName: download.suggestedFilename(),
  }, null, 2));
} finally {
  await browser.close();
}
