#!/usr/bin/env node
/** Local-only original-color camera acceptance. Fresh storage, synthetic permission denial, no external writes. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = process.env.PIXIEED_ORIGINAL_COLOR_OUTPUT || '/tmp/pixieed-original-colors-browser';
const engine = process.env.PIXIEED_BROWSER_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const playwright = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(out, { recursive: true });
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
const source = process.env.PIXIEED_ORIGINAL_COLOR_IMAGE;
const inputBytes = source ? await readFile(source) : null;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { engine, version: browser.version(), input: source ? { bytes: inputBytes.length, sha256: hash(inputBytes) } : 'generated opaque synthetic gradient', externalRequestsSent: 0, cases: [], failures: [], limitations: ['Physical Safari/iOS, camera hardware, OS file reception, physical rotation/keyboard untested. PNG Blob verified; per-engine output-return coverage is recorded separately.'] };

async function ready(page, mode = 'camera') {
  await page.waitForFunction(expected => document.documentElement.dataset.toolDirect === 'work' && window.__PIXIEED_CREATION_HOST__?.runtime?.state.ready && window.__PIXIEED_CREATION_HOST__.runtime.state.mode === expected && document.querySelector('[data-embed-start]')?.getAttribute('aria-busy') === 'false', mode);
}
const readMedia = page => page.evaluate(() => ({ requests: __originalColorQA.requests, constraints: __originalColorQA.constraints, asyncErrors: __originalColorQA.asyncErrors }));
const pixels = page => page.locator('#view').evaluate(canvas => ({ width: canvas.width, height: canvas.height, data: Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) }));
const pixelStats = frame => {
  const data = Buffer.from(frame.data), colors = new Set();
  for (let i = 0; i < data.length; i += 4) colors.add(data.readUInt32BE(i));
  return { width: frame.width, height: frame.height, colors: colors.size, sha256: hash(data) };
};

try {
for (const width of (process.env.PIXIEED_ORIGINAL_COLOR_WIDTHS || '1440,390,320').split(',').map(Number)) {
  const viewport = { width, height: width === 1440 ? 810 : width === 390 ? 844 : 700 };
  const row = { viewport, checks: [], errors: [], blocked: [] }; report.cases.push(row);
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block', hasTouch: width < 600 });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === base && ['GET', 'HEAD'].includes(request.method())) return route.continue();
    row.blocked.push({ method: request.method(), url: request.url() }); return route.abort();
  });
  await context.addInitScript(() => {
    const qa = window.__originalColorQA = { requests: 0, constraints: [], asyncErrors: [], blobs: new Map() };
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = createObjectURL(blob); qa.blobs.set(url, blob); return url; };
    // Observe actual sampling without replacing its result. Separate Canvas backends can resample differently.
    const sampleContexts = new WeakSet(), getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) { const ctx = getContext.call(this, type, options); if (type === '2d' && options?.willReadFrequently) sampleContexts.add(ctx); return ctx; };
    const drawImage = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      const result = drawImage.apply(this, args);
      if (!qa.referenceSampling && sampleContexts.has(this) && args[0] instanceof ImageBitmap && this.canvas.width === 128 && this.canvas.height === 72 && this.filter === 'none') {
        qa.sample = { width: 128, height: 72, data: Array.from(this.getImageData(0, 0, 128, 72).data) };
      }
      return result;
    };
    const media = { getSupportedConstraints: () => ({ zoom: true }), getUserMedia: async constraints => { qa.requests++; qa.constraints.push(constraints); throw new DOMException('Synthetic permission denial; no device access', 'NotAllowedError'); } };
    const permissions = { query: async () => ({ state: 'denied' }) };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: media });
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: permissions });
    if (navigator.mediaDevices !== media || navigator.permissions !== permissions) throw new Error('Media isolation failed');
    addEventListener('unhandledrejection', e => qa.asyncErrors.push(String(e.reason?.stack || e.reason)));
    addEventListener('error', e => qa.asyncErrors.push(String(e.error?.stack || e.message)));
  });
  const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => row.errors.push(e.message));
  try {
    await page.goto(base + '/camera/?workspace=1'); await ready(page);
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'idle');
    await page.locator('#creation-settings-open').click();
    await page.locator('#creation-canvas-settings-open').click();
    await page.locator('#creation-project-aspect').selectOption('16:9');
    await page.locator('#creation-project-width').fill('128');
    await page.locator('#creation-project-settings-panel [data-project-action=preview]').click();
    await page.waitForFunction(() => !document.querySelector('#creation-project-settings-panel [data-project-action=apply]').disabled);
    await page.locator('#creation-project-settings-panel [data-project-action=apply]').click();
    await page.keyboard.press('Escape'); await page.locator('#creation-project-settings-panel').waitFor({ state: 'hidden' });
    let buffer = inputBytes;
    if (!buffer) {
      const data = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 144; const ctx = c.getContext('2d'), d = ctx.createImageData(c.width, c.height);
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; d.data.set([x, Math.round(y * 255 / 143), (x * 3 + y * 5) % 256, 255], i); }
        ctx.putImageData(d, 0, 0); return c.toDataURL('image/png').split(',')[1];
      }); buffer = Buffer.from(data, 'base64');
    }
    await page.locator('#cameraImageInput').setInputFiles({ name: 'generated-fixture.png', mimeType: 'image/png', buffer });
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.source === 'image' && Number(document.querySelector('#pixelStudio').dataset.previewFrames) > 1);
    await page.locator('#toolbar [data-tool=look]').click(); await page.locator('#toolbarContextMore').click();
    await page.locator('#looks [data-look=full]').click(); await page.locator('#toolbarContextBack').click();
    await page.waitForFunction(() => document.querySelector('#looks [data-look=full]')?.getAttribute('aria-checked') === 'true');
    // Independently decode and sample the selected original file with Canvas's defined high-quality sampling, no filter.
    const independentReference = await page.evaluate(async base64 => {
      __originalColorQA.referenceSampling = true;
      const image = await createImageBitmap(new Blob([Uint8Array.from(atob(base64), value => value.charCodeAt(0))], { type: 'image/png' }));
        const c = document.createElement('canvas'); c.width = 128; c.height = 72; const ctx = c.getContext('2d', { willReadFrequently: true });
        const aspect = 128 / 72, sourceAspect = image.width / image.height;
        const sw = sourceAspect > aspect ? image.height * aspect : image.width, sh = sourceAspect > aspect ? image.height : image.width / aspect;
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.filter = 'none';
        ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, 0, 0, 128, 72); image.close();
        const result = { width: 128, height: 72, data: Array.from(ctx.getImageData(0, 0, 128, 72).data) };
        __originalColorQA.referenceSampling = false; return result;
    }, buffer.toString('base64'));
    await page.waitForFunction(() => __originalColorQA.sample);
    const reference = await page.evaluate(() => __originalColorQA.sample);
    row.independentReference = pixelStats(independentReference);
    row.independentCanvasMatches = hash(Buffer.from(independentReference.data)) === hash(Buffer.from(reference.data));
    assert.equal(row.independentCanvasMatches, true, 'independent Canvas uses the same readback backend and sampling options');
    const expected = pixelStats(reference);
    row.reference = expected;
    await page.waitForFunction(data => { const c = document.querySelector('#view'); if (c?.width !== 128 || c.height !== 72) return false; return c.getContext('2d').getImageData(0, 0, 128, 72).data.every((v, i) => v === data[i]); }, reference.data);
    assert.deepEqual(await pixels(page), reference); assert.ok(expected.colors > 64);
    assert.equal(await page.locator('#toolbar [data-tool=dither]').getAttribute('data-state'), 'na');
    assert.equal(await page.locator('#toolbar [data-tool=tone]').isDisabled(), true);
    row.originalPixels = expected; row.checks.push('Real UI full look exactly matches actual post-sampling 128×72 RGBA; >64 colors; no palette reduction');
    await page.evaluate(() => document.activeElement?.blur()); await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out + `/camera-original-${width}.png`, fullPage: false });
    for (const count of [8, 16]) {
      await page.locator('#toolbar [data-tool=look]').click(); await page.locator('#toolbarContextMore').click();
      await page.locator(`#looks [data-look=c${count}]`).click(); await page.locator('#toolbarContextBack').click();
      await page.waitForFunction(expectedCount => document.querySelector('#pixelStudio')?.dataset.paletteSize === String(expectedCount), count);
      assert.equal(pixelStats(await pixels(page)).colors, count);
    }
    await page.locator('#toolbar [data-tool=look]').click(); await page.locator('#toolbarContextMore').click();
    await page.locator('#looks [data-look=full]').click(); await page.locator('#toolbarContextBack').click();
    await page.waitForFunction(data => document.querySelector('#view').getContext('2d').getImageData(0, 0, 128, 72).data.every((v, i) => v === data[i]), reference.data);
    row.checks.push('Existing 8/16-color UI conversions still produce their selected color counts; returning to full restores exact source colors');
    await page.locator('[data-shell-explanation]').click(); await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation');
    await page.goBack(); await ready(page); assert.deepEqual(await pixels(page), reference);
    await page.goForward(); await page.waitForFunction(() => document.documentElement.dataset.toolDirect === 'explanation');
    await page.locator('[data-embed-start]').click(); await ready(page); assert.deepEqual(await pixels(page), reference);
    row.checks.push('Explanation, browser back/forward, work resume retain original pixels');
    for (const mode of ['draw', 'audio', 'camera']) { await page.evaluate(value => window.__PIXIEED_CREATION_HOST__.runtime.modes.switchMode(value), mode); await ready(page, mode); }
    assert.deepEqual(await pixels(page), reference); row.checks.push('Draw/audio/camera mode switches retain full look and pixels');
    if (width < 600) {
      for (const size of [{ width: 844, height: 390 }, { width, height: 500 }]) {
        await page.setViewportSize(size);
        await page.waitForFunction(() => document.querySelector('.app-tabs').getBoundingClientRect().bottom <= innerHeight + 1);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const layout = await page.evaluate(() => { const nav = document.querySelector('.app-tabs').getBoundingClientRect(), rail = document.querySelector('#toolbar').getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth, navBottom: nav.bottom, railBottom: rail.bottom, height: innerHeight }; });
        assert.equal(layout.overflow, false); assert.ok(layout.navBottom <= layout.height + 1); assert.ok(layout.railBottom <= layout.height + 1);
      }
      await page.setViewportSize(viewport); row.checks.push('Rotated and keyboard-size viewport retains visible operation rails without horizontal overflow');
    }
    await page.evaluate(() => document.activeElement?.blur()); await page.evaluate(() => document.fonts.ready);
    const initialMedia = await readMedia(page);
    assert.equal(initialMedia.requests, 1); assert.ok(initialMedia.constraints.every(value => value.audio === false));
    row.initialMedia = initialMedia;
    await page.screenshot({ path: out + `/camera-after-retention-${width}.png`, fullPage: false });
    await page.locator('#capture').click(); await page.waitForFunction(() => document.querySelector('#pixelStudio').dataset.mode === 'captured' && document.body.dataset.toolResultOpen === 'camera-result');
    const projectBefore = await page.evaluate(() => JSON.stringify(window.__PIXIEED_CREATION_HOST__.runtime.draw.getTimeline()));
    await page.locator('#useCameraImage').click();
    await page.waitForFunction(() => document.querySelector('.creation-camera-recovery')?.hidden === false);
    assert.equal(await page.evaluate(() => JSON.stringify(window.__PIXIEED_CREATION_HOST__.runtime.draw.getTimeline())), projectBefore);
    assert.deepEqual(await pixels(page), reference); row.checks.push('Over-limit shared apply rejects without mutating artwork/history/capture and offers existing recovery actions');
    await page.waitForFunction(() => document.querySelector('#savePng').getAttribute('aria-disabled') !== 'true');
    await page.locator('#creation-output-open').click(); await page.locator('#cameraSaveDialog').waitFor({ state: 'visible' });
    const saved = await page.evaluate(async expectedData => {
      // Retain the actual encoded Blob; the test server intentionally disallows blob fetch in connect-src.
      const blob = __originalColorQA.blobs.get(document.querySelector('#cameraDownloadFile').href);
      const bitmap = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = 128; c.height = 72;
      const encodedDimensions = { width: bitmap.width, height: bitmap.height };
      const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(bitmap, 0, 0, 128, 72); bitmap.close();
      const data = ctx.getImageData(0, 0, 128, 72).data;
      return { ...encodedDimensions, bytes: blob.size, rgbaMatch: data.every((v, i) => v === expectedData[i]), bytesArray: Array.from(new Uint8Array(await blob.arrayBuffer())) };
    }, reference.data);
    assert.equal(saved.rgbaMatch, true); row.savedPng = { ...saved, bytesArray: undefined };
    const savedBytes = Buffer.from(saved.bytesArray);
    if (engine === 'chromium') {
      const pendingDownload = page.waitForEvent('download'); await page.locator('#cameraDownloadFile').click();
      const download = await pendingDownload; await download.saveAs(out + `/original-export-${width}.png`);
      assert.deepEqual(await readFile(out + `/original-export-${width}.png`), savedBytes);
    }
    await page.locator('#cameraSaveDialog form button').click();
    await page.evaluate(() => { __originalColorQA.sample = null; });
    await page.locator('#cameraImageInput').setInputFiles({ name: 'original-export.png', mimeType: 'image/png', buffer: savedBytes });
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'live');
    await page.waitForFunction(() => __originalColorQA.sample);
    const reimportReference = await page.evaluate(() => __originalColorQA.sample);
    await page.waitForFunction(data => { const c = document.querySelector('#view'); return c?.width === 128 && c.height === 72 && c.getContext('2d').getImageData(0, 0, 128, 72).data.every((v, i) => v === data[i]); }, reimportReference.data);
    assert.deepEqual(await pixels(page), reimportReference);
    row.reimport = { ...pixelStats(reimportReference), matchesOriginalGrid: hash(Buffer.from(reimportReference.data)) === expected.sha256 };
    if (engine === 'chromium') assert.equal(row.reimport.matchesOriginalGrid, true);
    row.checks.push('Native PNG retains exact saved pixels; file reimport full look preserves the new post-sampling pixels (browser resampling recorded separately)');
    row.media = await readMedia(page); assert.equal(row.media.requests, 1);
    assert.deepEqual(row.media.asyncErrors, []);
    if (width === 1440) {
      // Standalone output handoff is a separate existing path; the shared runtime intentionally saves natively.
      await page.goto(base + '/pixel-camera.html?standalone=1');
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'idle');
      await page.locator('#cameraImageInput').setInputFiles({ name: 'generated-fixture.png', mimeType: 'image/png', buffer });
      await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.source === 'image' && Number(document.querySelector('#pixelStudio').dataset.previewFrames) > 1);
      await page.locator('#toolbar [data-tool=aspect]').click(); await page.locator('#aspectPanel [data-value="16:9"]').click(); await page.locator('#toolbarContextBack').click();
      await page.locator('#toolbar [data-tool=look]').click(); await page.locator('#toolbarContextMore').click(); await page.locator('#looks [data-look=full]').click(); await page.locator('#toolbarContextBack').click();
      await page.waitForFunction(data => { const c = document.querySelector('#view'); return c?.width === 128 && c.height === 72 && c.getContext('2d').getImageData(0, 0, 128, 72).data.every((v, i) => v === data[i]); }, reference.data);
      await page.locator('#capture').click(); await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured');
      await page.locator('#useCameraImage').click();
      assert.deepEqual(await pixels(page), reference);
      await page.locator('#savePng').click();
      await page.waitForFunction(() => location.pathname.startsWith('/output/') || document.querySelector('#cameraSaveDialog')?.open);
      if (new URL(page.url()).pathname === '/pixel-camera.html') {
        assert.equal(engine, 'webkit', 'Chromium standalone should stage the output');
        const diagnostic = await page.evaluate(async expectedData => {
          const blob = __originalColorQA.blobs.get(document.querySelector('#cameraDownloadFile').href);
          const bitmap = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = 128; c.height = 72;
          const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(bitmap, 0, 0, 128, 72); bitmap.close();
          const rgbaMatch = ctx.getImageData(0, 0, 128, 72).data.every((v, i) => v === expectedData[i]);
          const { stageToolOutput } = await import('/js/creation/output-handoff.mjs');
          try { await stageToolOutput({ blob, filename: 'original.png', returnUrl: location.pathname + location.search }); return { rgbaMatch, stage: 'success', host: !!window.__PIXIEED_CREATION_HOST__ }; }
          catch (error) { return { rgbaMatch, stage: 'failed', name: error.name, message: error.message }; }
        }, reference.data);
        assert.equal(diagnostic.rgbaMatch, true);
        assert.equal(diagnostic.stage, 'failed', 'native fallback must be explained by actual local storage failure');
        row.outputFallback = diagnostic;
        report.limitations.push('Available WebKit could not stage standalone output in IndexedDB; native PNG fallback verified, standalone output-return/reload untested in this engine.');
        row.checks.push('Standalone native PNG fallback preserves original pixels when local output storage fails');
      } else {
      const output = await page.evaluate(async expectedData => {
        const { readToolOutput } = await import('/js/creation/output-handoff.mjs'); const id = new URL(location.href).searchParams.get('id');
        const entry = await readToolOutput(id); const bitmap = await createImageBitmap(entry.sourceBlob); const c = document.createElement('canvas'); c.width = 128; c.height = 72;
        const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(bitmap, 0, 0, 128, 72); bitmap.close();
        const data = ctx.getImageData(0, 0, 128, 72).data;
        return { id, metadata: entry.metadata, mime: entry.mime, bytes: entry.sourceBlob.size, rgbaMatch: data.every((v, i) => v === expectedData[i]) };
      }, reference.data);
      assert.equal(output.metadata.cameraColors, 'full'); assert.equal(output.metadata.width, 128); assert.equal(output.metadata.height, 72); assert.equal(output.rgbaMatch, true);
      row.output = output;
      await page.locator('#output-return').click(); await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured');
      assert.deepEqual(await pixels(page), reference); assert.equal(await page.locator('#looks [data-look=full]').getAttribute('aria-checked'), 'true');
      await page.reload(); await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured');
      assert.deepEqual(await pixels(page), reference); row.checks.push('Standalone PNG output, return and reload preserve full settings/pixels without changing shared project policy');
      row.restoredMedia = await readMedia(page); assert.equal(row.restoredMedia.requests, 0);
      assert.deepEqual(row.restoredMedia.asyncErrors, []);
      }
    }
    assert.deepEqual(row.errors, []); assert.deepEqual(row.blocked, []); assert.deepEqual(row.media.asyncErrors, []); row.pass = true;
  } catch (error) {
    row.actualAtFailure = await pixels(page).then(pixelStats).catch(() => null);
    report.failures.push({ width, checks: row.checks, actual: row.actualAtFailure, reference: row.reference, error: error.stack || String(error) });
    row.diagnostics = await page.evaluate(() => ({ url: location.href, mode: document.body.dataset.creationMode, camera: { ...document.querySelector('#pixelStudio')?.dataset }, text: document.querySelector('#creation-camera-target')?.textContent, outputStatus: document.querySelector('#output-status')?.textContent, media: window.__originalColorQA ? { requests: __originalColorQA.requests, constraints: __originalColorQA.constraints, asyncErrors: __originalColorQA.asyncErrors } : null })).catch(() => null);
    await writeFile(out + '/results.json', JSON.stringify(report, null, 2));
    await page.screenshot({ path: out + `/failure-${width}.png` }).catch(() => {});
  } finally { await context.close(); }
}
} finally { await browser.close(); }
await writeFile(out + '/results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ engine, cases: report.cases.length, checks: report.cases.reduce((n, row) => n + row.checks.length, 0), failures: report.failures, out }));
if (report.failures.length) process.exitCode = 1;
