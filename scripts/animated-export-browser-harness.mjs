#!/usr/bin/env node
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const engine = process.env.PIXIEED_PIXEL_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engine === 'webkit'
  ? '/tmp/pixieed-jigsaw-playwright-existing-1-56/package/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(modulePath).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => new URL(route.request().url()).origin === origin || ['blob:', 'data:'].includes(new URL(route.request().url()).protocol) ? route.continue() : route.abort());
  await page.route('**/__animated_export_harness__', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Animated export test</title>' }));
  await page.goto(`${origin}/__animated_export_harness__`);
  const result = await page.evaluate(async () => {
    const { encodeAnimatedGif } = await import('/js/animated-export.mjs?v=20260928-rewards-1');
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
    const frames = [{ width: 2, height: 2, data }, { width: 2, height: 2, data: new Uint8ClampedArray([0, 0, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255]) }];
    let started = 0; let terminated = 0;
    const workerFactory = () => {
      started++;
      const worker = new Worker('/js/gif-export-worker.mjs?v=20260928-rewards-1', { type: 'module' });
      const terminate = worker.terminate.bind(worker);
      worker.terminate = () => { terminated++; terminate(); };
      return worker;
    };
    const output = await encodeAnimatedGif(frames, { delayMs: 100, longEdge: 32, workerFactory });
    const url = URL.createObjectURL(new Blob([output.bytes], { type: 'image/gif' }));
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const colors = [...context.getImageData(0, 0, image.width, image.height).data];
    URL.revokeObjectURL(url);
    const controller = new AbortController();
    const pending = encodeAnimatedGif(frames, { signal: controller.signal, workerFactory });
    controller.abort(); let abort = '';
    try { await pending; } catch (error) { abort = error.name; }
    return {
      started, terminated, abort, width: image.width, height: image.height,
      header: String.fromCharCode(...output.bytes.subarray(0, 6)),
      frames: [...output.bytes].filter((b, i) => b === 0x21 && output.bytes[i + 1] === 0xf9 && output.bytes[i + 2] === 4).length,
      unchanged: data.length === 16 && data[0] === 255 && data[3] === 255 && data[7] === 255,
      crisp: Array.from({ length: image.width * image.height }, (_, p) => colors.slice(p * 4, p * 4 + 4).join(',')).every((color) => ['255,0,0,255', '0,0,255,255'].includes(color))
    };
  });
  assert.equal(result.header, 'GIF89a'); assert.equal(result.frames, 2); assert.equal(result.width, 32); assert.equal(result.height, 32);
  assert.equal(result.crisp, true); assert.equal(result.unchanged, true);
  assert.equal(result.started, 2); assert.equal(result.terminated, 2); assert.equal(result.abort, 'AbortError');
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: real worker GIF encode/decode, crisp enlargement, source retention, abort and worker cleanup. Physical devices: UNTESTED.`);
} finally { await browser.close(); }
