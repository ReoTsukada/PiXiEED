#!/usr/bin/env node
/** Actual page smoke checks for sound-on video creation and its cleanup path. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Harness only accepts a localhost server');
const engine = process.env.PIXIEED_PIXEL_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine), 'PIXIEED_PIXEL_ENGINE must be chromium or webkit');
const defaultModule = engine === 'webkit'
  ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwrightModule = process.env.PIXIEED_PLAYWRIGHT_MODULE || defaultModule;
const playwright = await import(playwrightModule.startsWith('/') ? pathToFileURL(playwrightModule).href : playwrightModule);
const webkitExecutable = process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh';
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: webkitExecutable } : {}) });
const failures = [];
let checks = 0;
function pass(name) { checks += 1; console.log(`PASS ${engine} ${name}`); }
function fail(name, detail) { failures.push(`${name}: ${detail}`); }

try {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, acceptDownloads: true });
  await context.route('**/*', (route) => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin === origin || ['blob:', 'data:'].includes(url.protocol)) return route.continue();
    if (!['GET', 'HEAD'].includes(request.method())) fail('external-write', `${request.method()} ${url.origin}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => fail('page-error', error.message));
  await page.addInitScript(() => {
    const NativeRecorder = globalThis.MediaRecorder;
    if (!NativeRecorder) { globalThis.__videoRecorderSnapshots = []; return; }
    const snapshots = []; globalThis.__videoRecorderSnapshots = snapshots;
    class ObservedMediaRecorder extends NativeRecorder {
      constructor(stream, options) {
        super(stream, options);
        const snapshot = { mimeType: options?.mimeType || '', tracks: stream.getTracks().map((track) => ({ kind: track.kind, track })), chunks: [], events: [] };
        snapshots.push(snapshot);
        this.addEventListener('dataavailable', (event) => { snapshot.events.push({ type: 'dataavailable', size: event.data?.size || 0 }); if (event.data?.size) snapshot.chunks.push(event.data); });
        this.addEventListener('error', (event) => snapshot.events.push({ type: 'error', error: event.error?.message || null }));
        this.addEventListener('stop', () => snapshot.events.push({ type: 'stop' }));
      }
      static isTypeSupported(type) { return NativeRecorder.isTypeSupported(type); }
    }
    globalThis.MediaRecorder = ObservedMediaRecorder;
  });
  await page.goto(`${origin}/audio/`, { waitUntil: 'domcontentloaded' });
  await page.locator('#audio-pixel-canvas').waitFor();
  await page.waitForFunction(() => document.querySelector('#audio-pixel-canvas').width === 16);

  const capabilities = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    return { recorder: typeof MediaRecorder === 'function' && typeof canvas.captureStream === 'function' && Boolean(AudioContext || webkitAudioContext) && ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].some((type) => MediaRecorder.isTypeSupported?.(type)) };
  });
  const canvasBox = await page.locator('#audio-pixel-canvas').boundingBox();
  assert.ok(canvasBox && canvasBox.width > 16 && canvasBox.height > 16, 'editor canvas is visible at the mobile viewport');
  await page.mouse.click(canvasBox.x + canvasBox.width / 32, canvasBox.y + canvasBox.height / 32);
  const sourceBefore = await page.locator('#audio-pixel-canvas').evaluate((canvas) => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]);
  await page.locator('#audio-more > summary').click();
  await page.locator('#audio-export-video').click();
  if (!capabilities.recorder) {
    await page.waitForFunction(() => document.querySelector('#audio-status').textContent.includes('PNGとWAV'));
    pass('unsupported-recorder-keeps-png-wav-guidance');
  } else {
    const downloadWait = page.waitForEvent('download', { timeout: 20000 });
    const unsupportedWait = page.waitForFunction(() => {
      const message = document.querySelector('#audio-status').textContent;
      return message.includes('PNGとWAV') || message.includes('動画を記録できません');
    }, { timeout: 20000 }).then(() => ({ unsupported: true }), () => ({ timeout: true }));
    const outcome = await Promise.race([downloadWait.then((download) => ({ download })), unsupportedWait]);
    if (outcome?.unsupported) {
      const unsupported = await page.evaluate(() => ({ message: document.querySelector('#audio-status').textContent, records: globalThis.__videoRecorderSnapshots?.map(({ mimeType, tracks, events }) => ({ mimeType, tracks: tracks.map(({ kind, track }) => ({ kind, readyState: track.readyState })), events })) }));
      console.log(`INFO ${engine} video unavailable: ${JSON.stringify(unsupported)}`);
      assert.match(unsupported.message, /PNGとWAV/);
      pass('unsupported-recorder-keeps-png-wav-guidance');
    } else if (outcome?.timeout) {
      const state = await page.evaluate(() => ({ message: document.querySelector('#audio-status').textContent, records: globalThis.__videoRecorderSnapshots?.map(({ mimeType, tracks }) => ({ mimeType, tracks: tracks.map(({ kind, track }) => ({ kind, readyState: track.readyState })) })) }));
      throw new Error(`video timeout: ${JSON.stringify(state)}`);
    } else {
    const download = outcome.download;
    const savedPath = await download.path();
    const fileName = download.suggestedFilename();
    const savedBytes = new Uint8Array(await readFile(savedPath));
    const recording = await page.evaluate(async () => {
      const snapshot = globalThis.__videoRecorderSnapshots.at(-1);
      if (!snapshot) return null;
      const blob = new Blob(snapshot.chunks, { type: snapshot.mimeType });
      const video = document.createElement('video'); video.muted = true; video.src = URL.createObjectURL(blob);
      const metadata = await Promise.race([
        new Promise((resolve) => video.addEventListener('loadedmetadata', () => resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration }), { once: true })),
        new Promise((resolve) => video.addEventListener('error', () => resolve({ error: video.error?.message || 'decode error' }), { once: true })),
        new Promise((resolve) => setTimeout(() => resolve({ error: 'decode timeout' }), 5000))
      ]);
      return { mimeType: snapshot.mimeType, tracks: snapshot.tracks.map(({ kind, track }) => ({ kind, readyState: track.readyState })), bytes: blob.size, metadata };
    });
    assert.ok(savedPath && fileName.endsWith(recording.mimeType.includes('mp4') ? '.mp4' : '.webm'), `saved ${fileName}`);
    assert.ok(savedBytes.length > 0 && (recording.mimeType.includes('mp4') ? String.fromCharCode(...savedBytes.slice(4, 8)) === 'ftyp' : savedBytes[0] === 0x1a && savedBytes[1] === 0x45 && savedBytes[2] === 0xdf && savedBytes[3] === 0xa3), 'download has a matching MP4/WebM container');
    assert.ok(recording.bytes > 0, 'MediaRecorder produced data');
    assert.deepEqual(recording.tracks.map(({ kind }) => kind).sort(), ['audio', 'video']);
    assert.ok(recording.tracks.every(({ readyState }) => readyState === 'ended'), 'recording tracks stop after export');
    assert.ok(recording.metadata.width > 0 && recording.metadata.height > 0 && Number.isFinite(recording.metadata.duration), `recording is decodable: ${JSON.stringify(recording.metadata)}`);
    const sourceAfter = await page.locator('#audio-pixel-canvas').evaluate((canvas) => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]);
    assert.deepEqual(sourceAfter, sourceBefore, 'export leaves the source image unchanged');
    pass('actual-video-download-has-audio-and-video-and-decodes');
    pass('editor-source-is-still-visible-after-export');

    await page.locator('#audio-more > summary').click();
    const previousRecordings = await page.evaluate(() => globalThis.__videoRecorderSnapshots.length);
    await page.locator('#audio-export-video').click();
    await page.waitForFunction((count) => globalThis.__videoRecorderSnapshots.length > count && !document.querySelector('#audio-cancel-video').hidden, previousRecordings);
    await page.locator('#audio-cancel-video').click();
    await page.waitForFunction(() => document.querySelector('#audio-status').textContent.includes('中止'));
    const cancelState = await page.evaluate((previous) => globalThis.__videoRecorderSnapshots.slice(previous).at(-1)?.tracks.map(({ track }) => track.readyState), previousRecordings);
    assert.ok(cancelState?.length >= 2 && cancelState.every((state) => state === 'ended'));
    pass('cancel-stops-recording-tracks');

    await page.evaluate(() => {
      const key = 'pixieed:pass:v1'; localStorage.setItem(key, JSON.stringify({ until: Date.now() + 60000 }));
      window.dispatchEvent(new StorageEvent('storage', { key }));
    });
    await page.locator('#audio-composition-settings > summary').click();
    await page.locator('#audio-canvas-size').selectOption('32');
    await page.waitForFunction(() => document.querySelector('#audio-pixel-canvas').width === 32);
    const wideCanvasBox = await page.locator('#audio-pixel-canvas').boundingBox();
    await page.mouse.click(wideCanvasBox.x + wideCanvasBox.width * 5 / 64, wideCanvasBox.y + wideCanvasBox.height / 32);
    await page.locator('#audio-more > summary').click();
    const beforeExpiryRecorderCount = await page.evaluate(() => globalThis.__videoRecorderSnapshots.length);
    const expiryDownloadPromise = page.waitForEvent('download', { timeout: 12000 });
    await page.locator('#audio-export-video').click();
    await page.waitForFunction((count) => globalThis.__videoRecorderSnapshots.length > count, beforeExpiryRecorderCount);
    await page.evaluate(() => {
      const key = 'pixieed:pass:v1'; localStorage.setItem(key, JSON.stringify({ until: Date.now() - 1000 }));
      window.dispatchEvent(new StorageEvent('storage', { key }));
    });
    await page.waitForFunction(() => !document.querySelector('#audio-pass-required').hidden);
    const expiryDownload = await expiryDownloadPromise;
    const expiryDownloadPath = await expiryDownload.path();
    const expiryMime = await page.evaluate((previous) => globalThis.__videoRecorderSnapshots.slice(previous).at(-1).mimeType, beforeExpiryRecorderCount);
    assert.ok(expiryDownloadPath && expiryDownload.suggestedFilename().endsWith(expiryMime.includes('mp4') ? '.mp4' : '.webm'));
    assert.ok((await readFile(expiryDownloadPath)).length > 0);
    await page.waitForFunction(() => document.querySelector('#audio-status').textContent.includes('保存しました'));
    const expiredState = await page.evaluate((previous) => ({
      locked: document.querySelector('#audio-pixel-canvas').getAttribute('aria-disabled'),
      notice: document.querySelector('#audio-pass-required').textContent,
      trackStates: globalThis.__videoRecorderSnapshots.slice(previous).at(-1).tracks.map(({ track }) => track.readyState),
      width: document.querySelector('#audio-pixel-canvas').width,
      exportDisabled: document.querySelector('#audio-export-video').disabled,
      playDisabled: document.querySelector('#audio-play-toggle').disabled
    }), beforeExpiryRecorderCount);
    assert.equal(expiredState.locked, 'true'); assert.equal(expiredState.width, 32);
    assert.match(expiredState.notice, /時間を追加/); assert.equal(expiredState.exportDisabled, true); assert.equal(expiredState.playDisabled, true);
    assert.ok(expiredState.trackStates.every((state) => state === 'ended'));
    pass('pass-expiry-keeps-current-video-and-locks-next-action');
    }
  }

  const responsive = await page.evaluate(() => {
    const controls = ['#audio-play-toggle', '#audio-take-photo', '#audio-export-image', '#audio-more summary', '#audio-export-video'];
    return controls.map((selector) => { const rect = document.querySelector(selector).getBoundingClientRect(); return { selector, height: rect.height, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, hidden: rect.width === 0 || rect.height === 0 }; });
  });
  assert.ok(responsive.every(({ hidden, height }) => !hidden && height >= 44), JSON.stringify(responsive));
  await page.setViewportSize({ width: 568, height: 320 });
  const landscapeOverflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, controls: ['#audio-play-toggle', '#audio-take-photo', '#audio-export-image', '#audio-more summary'].map((selector) => { const rect = document.querySelector(selector).getBoundingClientRect(); return { selector, height: rect.height, left: rect.left, right: rect.right }; }) }));
  assert.equal(landscapeOverflow.scrollWidth, landscapeOverflow.clientWidth);
  assert.ok(landscapeOverflow.controls.every(({ height }) => height >= 44), JSON.stringify(landscapeOverflow));
  pass('portrait-and-landscape-controls-remain-44px-without-overflow');

  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`PASS ${engine} audio-video browser checks: ${checks}`);
  await context.close();
} finally { await browser.close(); }
