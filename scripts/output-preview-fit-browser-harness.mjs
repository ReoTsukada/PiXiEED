#!/usr/bin/env node
/** Real /output/work/ elements, local synthetic media, blocked external traffic. */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { boundedPreviewDimensions } from '../js/creation/output-import.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const baseline = process.env.PIXIEED_PREVIEW_BASELINE === '1';
const engine = process.env.PIXIEED_UI_ENGINE || 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || (engine === 'webkit'
  ? '/tmp/pixieed-selection-webkit-runtime/node_modules/playwright/index.mjs'
  : '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const playwright = await import(pathToFileURL(runtime).href);
const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' ? { executablePath: '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh' } : {}) });
const evidenceDir = process.env.PIXIEED_PREVIEW_EVIDENCE_DIR || '/tmp/pixieed-output-preview-fit';
await mkdir(evidenceDir, { recursive: true });
const results = [], errors = [];
const nextPaint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function measure(page) {
  return page.evaluate(() => {
    const box = document.querySelector('#output-preview');
    const media = [...box.querySelectorAll(':scope > img,:scope > canvas,:scope > video')].find(node => !node.hidden);
    const rect = media.getBoundingClientRect(), outer = box.getBoundingClientRect(), style = getComputedStyle(box);
    const left = outer.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const top = outer.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop);
    const width = outer.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = outer.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    return { tag: media.tagName, intrinsicWidth: Number(media.dataset.previewSourceWidth) || media.naturalWidth || media.videoWidth || media.width, intrinsicHeight: Number(media.dataset.previewSourceHeight) || media.naturalHeight || media.videoHeight || media.height,
      decodedWidth: media.naturalWidth || media.videoWidth || media.width, decodedHeight: media.naturalHeight || media.videoHeight || media.height,
      width: rect.width, height: rect.height, x: rect.left, y: rect.top, box: { left, top, width, height }, rendering: getComputedStyle(media).imageRendering,
      objectFit: getComputedStyle(media).objectFit, hiddenChildren: [...box.children].filter(n => n.hidden).map(n => ({ tag: n.tagName, display: getComputedStyle(n).display, width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })),
      overflow: document.documentElement.scrollWidth > innerWidth + 1, metadata: document.querySelector('#output-metadata').textContent };
  });
}

async function verify(page, label, { maximal = true, pixelated = false } = {}) {
  await nextPaint(page);
  const result = await measure(page);
  if (!baseline) {
    const b = result.box, epsilon = 0.05; // CSS layout quantizes fractional dimensions to subpixels.
    assert.ok(result.width > 0 && result.height > 0, `${label}: visible ${JSON.stringify(result)}`);
    assert.ok(result.x >= b.left - epsilon && result.y >= b.top - epsilon && result.x + result.width <= b.left + b.width + epsilon && result.y + result.height <= b.top + b.height + epsilon, `${label}: all four edges contained ${JSON.stringify(result)}`);
    const factor = Math.min(b.width / result.intrinsicWidth, b.height / result.intrinsicHeight);
    const fraction = maximal ? 1 : 0.8;
    assert.ok(Math.abs(result.width - result.intrinsicWidth * factor * fraction) <= epsilon && Math.abs(result.height - result.intrinsicHeight * factor * fraction) <= epsilon, `${label}: maximal proportional CSS size ${JSON.stringify(result)}`);
    assert.equal(result.overflow, false, `${label}: document overflow`);
    assert.ok(result.hiddenChildren.every(n => n.display === 'none' && n.width === 0 && n.height === 0), `${label}: hidden elements cannot affect layout`);
    if (result.tag !== 'VIDEO' && result.intrinsicWidth * result.decodedHeight !== result.intrinsicHeight * result.decodedWidth) assert.equal(result.objectFit, 'fill', `${label}: bounded bitmap is displayed at the original ratio`);
    if (pixelated) assert.ok(['pixelated', 'crisp-edges'].includes(result.rendering), `${label}: crisp tiny pixels ${result.rendering}`);
  }
  results.push({ label, ...result });
  return result;
}

async function storedSnapshot(page, id) {
  return page.evaluate(async id => {
    const { readToolOutput } = await import('/js/creation/output-handoff.mjs');
    const r = await readToolOutput(id);
    const hash = async blob => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
    return { source: await hash(r.sourceBlob), outputs: await Promise.all(r.outputs.map(async i => ({ id: i.id, hash: await hash(i.blob), metadata: i.metadata }))), metadata: r.metadata, settings: r.mediaSettings,
      frames: await Promise.all(r.mediaSources.map(async s => ({ id: s.id, kind: s.kind,
        dimensions: s.mediaSource?.frames.map(f => [f.width, f.height, f.data.length, f.delayMs]),
        hashes: await Promise.all((s.mediaSource?.frames || []).map(async f => [...new Uint8Array(await crypto.subtle.digest('SHA-256', f.data))].map(n => n.toString(16).padStart(2, '0')).join(''))) }))) };
  }, id);
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const beforeCss = baseline ? await readFile('/tmp/pixieed-preview-before.css', 'utf8') : null;
  const beforeJs = baseline ? await readFile('/tmp/pixieed-preview-before.mjs', 'utf8') : null;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin && !['blob:', 'data:'].includes(url.protocol)) return route.abort();
    if (baseline && url.pathname === '/css/tool-output.css') return route.fulfill({ contentType: 'text/css', body: beforeCss });
    if (baseline && url.pathname === '/js/creation/output-page.mjs') return route.fulfill({ contentType: 'text/javascript', body: beforeJs });
    return route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.PIXIEED_PREVIEW_TRACE) page.on('console', m => console.log(m.text()));
  await page.goto(`${base}/output/work/`, { waitUntil: 'domcontentloaded' });
  const fixtures = await Promise.race([page.evaluate(async () => {
    const { stageToolOutput, saveToolOutputItems } = await import('/js/creation/output-handoff.mjs');
    const { encodeOutput } = await import('/js/creation/output-encoders.mjs');
    const { encodeAnimatedGif } = await import('/js/animated-export.mjs');
    const encodeRaster = async (frame, mime, quality) => {
      const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height), 0, 0);
      try { return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Fixture encode failed')), mime, quality)); }
      finally { canvas.width = canvas.height = 1; }
    };
    const makeFrame = (w, h, seed = 1) => {
      const data = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; data.set([(x * 17 + y * 31 + x * y * 7 + seed * 13) % 251, (x * 37 + y * 19 + seed * 29) % 253, (x + y * 7 + seed) % 255, 255], i); }
      return { width: w, height: h, data, delayMs: 120 };
    };
    const entries = [];
    const stage = async (label, format, w, h, { timeline = false, huge = false } = {}) => {
      console.info(`fixture ${label}`);
      let frames = [makeFrame(w, h)];
      if (timeline || ['gif', 'apng'].includes(format)) frames.push(makeFrame(w, h, 2));
      const blob = format === 'gif'
        ? new Blob([(await encodeAnimatedGif(frames, { longEdge: Math.max(w, h), delayMs: 120 })).bytes], { type: 'image/gif' })
        : await encodeOutput({ format, frames, totalPlays: 0 }, { encodeRaster });
      const sourceId = timeline ? 'local-images-fixture' : 'fixture';
      const source = { id: sourceId, label: label, kind: 'rgba-frames', mediaSource: { kind: 'rgba-frames', frames, totalPlays: 0 } };
      const staged = await stageToolOutput({ blob, filename: `${label}.${format}`, title: label, returnUrl: '/draw/', metadata: { width: w, height: h, ...(huge ? { previewOnly: true } : {}) }, mediaSources: huge ? [] : [source], mediaSettings: { playbackRate: 1.25, totalPlays: 0, musicTotalPlays: 2 } });
      entries.push({ label, format, w, h, ...staged, pixelated: Math.max(w, h) <= 160 && format !== 'jpeg', huge });
      return { ...staged, blob, sourceId };
    };
    for (const [w, h] of [[1, 1], [1, 16], [16, 1], [16, 16], [16, 64], [64, 16], [160, 160], [160, 640], [640, 160], [1024, 1024], [8, 2048], [2048, 8], [1, 4096], [4096, 1]]) await stage(`png-${w}x${h}`, 'png', w, h);
    for (const format of ['gif', 'apng']) for (const [w, h] of [[1, 1], [16, 16], [16, 64], [64, 16], [160, 160]]) await stage(`${format}-${w}x${h}`, format, w, h);
    for (const format of ['jpeg', 'svg']) await stage(`${format}-160x40`, format, 160, 40);
    for (const [w,h] of [[1,1],[1,16],[16,1]]) await stage(`svg-${w}x${h}`, 'svg', w, h);
    await stage('timeline-16x64', 'png', 16, 64, { timeline: true });
    await stage('huge-4000x3000', 'png', 4000, 3000, { huge: true });
    if (typeof MediaRecorder !== 'undefined') {
      const mime = ['video/webm;codecs=vp8', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
      if (mime) for (const [w, h] of [[16, 16], [16, 64], [64, 16], [160, 160]]) {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); const chunks = []; const stream = c.captureStream(15); const recorder = new MediaRecorder(stream, { mimeType: mime });
        const blob = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Video fixture recorder timed out')), 5000);
          recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
          recorder.onerror = e => { clearTimeout(timeout); reject(e); }; recorder.onstop = () => { clearTimeout(timeout); resolve(new Blob(chunks, { type: mime.split(';')[0] })); };
          recorder.start(); ctx.fillStyle = '#ef785d'; ctx.fillRect(0, 0, w, h);
          setTimeout(() => { ctx.fillStyle = '#74ad88'; ctx.fillRect(0, 0, w / 2, h); }, 80);
          setTimeout(() => recorder.stop(), 220);
        });
        stream.getTracks().forEach(t => t.stop());
        const label = `video-${w}x${h}`, format = blob.type === 'video/mp4' ? 'mp4' : 'webm';
        const staged = await stageToolOutput({ blob, filename: `${label}.${format}`, title: label, returnUrl: '/draw/', metadata: { width: w, height: h }, mediaSources: [{ id: 'video-fixture', label, kind: 'video-source', blob, width: w, height: h, durationSeconds: 0.3 }] });
        entries.push({ label, format, w, h, ...staged });
      }
    }
    const first = entries.find(e => e.label === 'png-16x16');
    const second = entries.find(e => e.label === 'png-16x64');
    const { readToolOutput } = await import('/js/creation/output-handoff.mjs');
    const r1 = await readToolOutput(first.id), r2 = await readToolOutput(second.id);
    await saveToolOutputItems(first.id, [r1.outputs[0], { ...r2.outputs[0], id: 'portrait', sourceId: 'fixture', metadata: { width: 16, height: 64 } }]);
    return entries;
  }), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Fixture staging timed out after 45s')), 45_000); timer.unref(); })]);
  const viewports = baseline ? [{ width: 1280, height: 800 }, { width: 390, height: 844 }] : [{ width: 1280, height: 800 }, { width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const fixture of fixtures.filter(f => !baseline || ['png-1x1', 'png-16x16', 'png-160x160', 'png-16x64', 'png-8x2048', 'huge-4000x3000'].includes(f.label))) {
      await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => {
        const box = document.querySelector('#output-preview');
        return [...box.querySelectorAll(':scope > img,:scope > canvas,:scope > video')].some(n => !n.hidden && (n.tagName === 'CANVAS' || (n.tagName === 'IMG' ? n.complete && n.naturalWidth : n.videoWidth)));
      });
      await page.waitForFunction(() => document.querySelector('#output-download')?.href?.startsWith('blob:'));
      await page.waitForFunction(() => !document.querySelector('#output-apply-settings').disabled || document.querySelector('#output-scale-settings').hidden);
      const result = await verify(page, `${viewport.width}x${viewport.height} ${fixture.label}`, { pixelated: fixture.pixelated });
      if (fixture.label.startsWith('timeline')) {
        assert.equal(await page.locator('#output-image').isVisible(), false, 'timeline shows only the canvas');
        await page.locator('#output-timeline-play').click(); await page.waitForTimeout(140);
        await verify(page, `${viewport.width}x${viewport.height} timeline playing`, { pixelated: true });
        await page.locator('#output-timeline-play').click();
      }
      if (fixture.huge) {
        assert.ok(result.decodedWidth <= 1536 && result.decodedHeight <= 1536 && result.decodedWidth * result.decodedHeight <= 2_000_000, 'huge preview memory cap');
        assert.match(result.metadata, /4000.*3000/);
      } else {
        const expected = ['png', 'jpeg'].includes(fixture.format) ? boundedPreviewDimensions(fixture.w, fixture.h) : { width: fixture.w, height: fixture.h };
        assert.equal(result.decodedWidth, expected.width, `${fixture.label}: bounded preview intrinsic pixels`);
        assert.equal(result.decodedHeight, expected.height, `${fixture.label}: bounded preview intrinsic pixels`);
      }
      if (!baseline) {
        assert.equal(result.intrinsicWidth, fixture.w, `${fixture.label}: original output width is the display ratio authority`);
        assert.equal(result.intrinsicHeight, fixture.h, `${fixture.label}: original output height is the display ratio authority`);
      }
      assert.ok(await page.locator('meta[name="robots"]').getAttribute('content').then(v => v.includes('noindex')), 'private workspace noindex');
      if ([390, 1280].includes(viewport.width) && ['png-16x16', 'png-16x64'].includes(fixture.label)) {
        await page.evaluate(() => scrollTo(0, 0)); await nextPaint(page);
        await page.screenshot({ path: `${evidenceDir}/${baseline ? 'before' : 'after'}-${engine}-${viewport.width}-${fixture.label}.png`, fullPage: true });
      }
    }
    console.log(`${baseline ? 'BEFORE' : 'PASS'} ${engine} ${viewport.width}x${viewport.height} media bounds`);
  }
  if (!baseline) {
    const fixture = fixtures.find(f => f.label === 'png-16x16');
    await page.setViewportSize({ width: 1280, height: 800 }); await page.goto(fixture.url);
    await page.locator('#output-image').waitFor({ state: 'visible' }); await page.waitForFunction(() => document.querySelector('#output-image').complete && !document.querySelector('#output-apply-settings').disabled);
    const snapshot = await storedSnapshot(page, fixture.id);
    for (const id of ['output-file-settings', 'output-scale-settings']) {
      await page.locator(`#${id} > summary`).click(); await verify(page, `toggle ${id}`);
      await page.locator(`#${id} > summary`).click(); await verify(page, `restore ${id}`);
    }
    // Simulate a side panel taking width without a window resize: ResizeObserver must refit.
    await page.locator('#output-layout').evaluate(n => n.style.gridTemplateColumns = 'minmax(0,.6fr) minmax(310px,1fr)');
    await verify(page, 'desktop side panel widens');
    await page.locator('#output-layout').evaluate(n => n.style.gridTemplateColumns = ''); await verify(page, 'desktop side panel restores');
    await page.locator('#output-preview').evaluate(n => { n.style.padding = '13.5px'; n.style.borderWidth = '2.25px'; });
    await verify(page, 'fractional padded content box');
    await page.locator('#output-preview').evaluate(n => { n.style.padding = ''; n.style.borderWidth = ''; });
    await verify(page, 'restore content box');
    await page.locator('#output-view-zoom-out').click(); await verify(page, 'relative zoom out', { maximal: false });
    await page.locator('#output-view-zoom-in').click(); await verify(page, 'zoom in returns to whole fit');
    assert.equal(await page.locator('#output-view-zoom-in').isDisabled(), true, 'zoom cannot crop');
    await page.locator('#output-items button').nth(1).click(); await page.waitForFunction(() => document.querySelector('#output-image').naturalHeight === 64); await verify(page, 'switch output item portrait');
    await page.locator('#output-items button').first().click(); await page.waitForFunction(() => document.querySelector('#output-image').naturalHeight === 16); await verify(page, 'switch output item square');
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 320, height: 568 }]) {
      await page.setViewportSize(viewport); await verify(page, `open image rotate/resize ${viewport.width}x${viewport.height}`);
    }
    assert.deepEqual(await storedSnapshot(page, fixture.id), snapshot, 'display fit/zoom/panel/item/rotation preserve original Blob, outputs, source frame pixels and settings');
    const download = await page.locator('#output-download').getAttribute('href');
    const hash = await page.evaluate(async url => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(url)).arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join(''), download);
    assert.equal(hash, snapshot.outputs[0].hash, 'download Blob unchanged');
    assert.ok(fixtures.some(f => ['mp4', 'webm'].includes(f.format)), 'real encoded video tested');
    const gif = fixtures.find(f => f.label === 'gif-16x64');
    await page.goto(gif.url); await page.locator('#output-animation-toggle').waitFor({ state: 'visible' });
    const gifSnapshot = await storedSnapshot(page, gif.id);
    await page.locator('#output-animation-toggle').click(); await page.waitForFunction(() => document.querySelector('#output-image').complete);
    await verify(page, 'stopped GIF poster fits', { pixelated: true });
    await page.locator('#output-animation-toggle').click(); await page.waitForFunction(() => document.querySelector('#output-image').complete);
    await verify(page, 'restarted GIF fits', { pixelated: true });
    assert.deepEqual(await storedSnapshot(page, gif.id), gifSnapshot, 'GIF poster/playback retain original media');
  }
  assert.deepEqual(errors, [], 'no browser exceptions');
  const report = { status: baseline ? 'BASELINE' : 'PASS', engine, cases: results.length, results, externalTraffic: 'BLOCKED', physicalDevices: 'UNTESTED', production: 'UNTESTED' };
  await writeFile(`${evidenceDir}/${baseline ? 'before' : 'after'}-${engine}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: undefined }));
  await context.close();
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: `${evidenceDir}/failure-${engine}.png`, fullPage: true }).catch(() => {});
    console.error(await page.evaluate(() => ({ title: document.title, status: document.querySelector('#output-status')?.textContent, error: document.querySelector('#output-copy')?.textContent })).catch(() => ({})));
  }
  throw error;
} finally { await browser.close(); }
