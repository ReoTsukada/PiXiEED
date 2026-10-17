#!/usr/bin/env node
/**
 * Bounded first-use timing for the output page. This runs against an immutable
 * static site tree, uses fresh browser storage for every sample, and never
 * contacts external origins or sends non-GET/HEAD requests.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHASE = process.env.PHASE || '';
const SITE_ROOT = process.env.PIXIEED_PERF_ROOT ? path.resolve(process.env.PIXIEED_PERF_ROOT) : '';
const OUTPUT_DIR = process.env.PIXIEED_PERF_OUTPUT ? path.resolve(process.env.PIXIEED_PERF_OUTPUT) : path.join(REPO, 'docs', 'performance');
const RUNS = boundedInteger(process.env.PIXIEED_PERF_RUNS, 3, 1, 3);
const VIEWPORTS = parseViewports(process.env.PIXIEED_PERF_VIEWPORTS || '390x844,1280x800,320x568');
const PLAYWRIGHT_MODULE = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const MIME = new Map(Object.entries({
  '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.avif':'image/avif', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf', '.wasm':'application/wasm',
  '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.mp4':'video/mp4', '.webm':'video/webm',
  '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.bin':'application/octet-stream'
}));

function boundedInteger(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`Expected integer ${min}..${max}, got ${value}`);
  return result;
}
function parseViewports(value) {
  return value.split(',').map((raw) => {
    const match = raw.trim().match(/^(?:(?<name>[a-zA-Z0-9_-]+):)?(?<width>\d+)x(?<height>\d+)$/);
    if (!match) throw new Error(`Invalid viewport ${raw}; use [name:]WIDTHxHEIGHT`);
    const width = Number(match.groups.width), height = Number(match.groups.height);
    if (width < 240 || width > 4000 || height < 240 || height > 4000) throw new Error(`Viewport out of range: ${raw}`);
    return { name: match.groups.name || `${width}x${height}`, width, height };
  });
}
function validate() {
  if (!['before', 'after'].includes(PHASE)) throw new Error('Set PHASE=before or PHASE=after.');
  if (!SITE_ROOT || !fs.statSync(SITE_ROOT, { throwIfNoEntry: false })?.isDirectory()) throw new Error('Set PIXIEED_PERF_ROOT to an existing immutable static site directory.');
  const sample = path.join(SITE_ROOT, 'assets', 'samples', 'maou.png');
  if (!fs.statSync(sample, { throwIfNoEntry: false })?.isFile()) throw new Error(`Maou PNG is missing from the selected site: ${sample}`);
}
function safeFilePath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const segments = decoded.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.')) return null;
  const root = path.resolve(SITE_ROOT);
  let target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try { if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html'); } catch {}
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try { return fs.statSync(target).isFile() ? target : null; } catch { return null; }
}
function createServer() {
  return http.createServer((req, res) => {
    const method = req.method || '';
    if (method !== 'GET' && method !== 'HEAD') { res.writeHead(405, { Allow:'GET, HEAD', 'Cache-Control':'no-store' }); res.end(); return; }
    let url;
    try { url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`); }
    catch { res.writeHead(400); res.end(); return; }
    const file = safeFilePath(url.pathname);
    if (!file) { res.writeHead(404, { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end('Not Found'); return; }
    const info = fs.statSync(file);
    const headers = { 'Content-Type':MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream', 'Content-Length':info.size,
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Cross-Origin-Resource-Policy':'same-origin' };
    const rangeMatch = typeof req.headers.range === 'string' && req.headers.range.match(/^bytes=(\d*)-(\d*)$/);
    if (rangeMatch && info.size > 0) {
      const start = rangeMatch[1] ? Number(rangeMatch[1]) : Math.max(0, info.size - Number(rangeMatch[2] || 0));
      const end = Math.min(rangeMatch[2] ? Number(rangeMatch[2]) : info.size - 1, info.size - 1);
      if (start <= end && start < info.size) {
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`; headers['Content-Length'] = end - start + 1; headers['Accept-Ranges'] = 'bytes';
        res.writeHead(206, headers); if (method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).pipe(res); return;
      }
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return;
    }
    res.writeHead(200, headers); if (method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
}
function syntheticWav() {
  const sampleRate = 8000, seconds = 0.5, sampleCount = sampleRate * seconds;
  const bytes = new ArrayBuffer(44 + sampleCount * 4), view = new DataView(bytes);
  const word = (offset, value) => { for (const char of value) view.setUint8(offset++, char.charCodeAt(0)); };
  word(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); word(8, 'WAVE'); word(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, sampleCount * 4, true);
  for (let index = 0; index < sampleCount; index++) {
    const sample = Math.round(Math.sin(index * Math.PI * 2 * 440 / sampleRate) * 5000);
    view.setInt16(44 + index * 4, sample, true); view.setInt16(46 + index * 4, sample, true);
  }
  return Buffer.from(bytes);
}
function outputBytes(row = {}, startIndex, requests) {
  const delta = requests.slice(startIndex);
  row.additionalRequests = delta.length;
  row.bytes = delta.reduce((total, request) => total + (request.encodedDataLength || 0), 0);
  row.requests = delta.map(({ url, method, status, type, encodedDataLength, durationMs, blocked, failure }) => ({
    path: (() => { try { return new URL(url).pathname; } catch { return url; } })(), method, status, type, encodedDataLength, durationMs, blocked, failure
  }));
  return row;
}
async function downloadLocal(page, extension, tempDir) {
  const downloadWait = page.waitForEvent('download', { timeout: 10_000 });
  await page.locator('#output-download').click();
  const download = await downloadWait;
  assert.match(download.suggestedFilename(), new RegExp(`\\.${extension}$`, 'i'));
  const filePath = path.join(tempDir, `output-${Date.now()}.${extension}`);
  await download.saveAs(filePath);
  const data = fs.readFileSync(filePath);
  if (extension === 'wav') assert.equal(data.subarray(0, 4).toString(), 'RIFF');
  if (extension === 'png') assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  return { filename: download.suggestedFilename(), bytes: data.length, signature: extension === 'wav' ? data.subarray(0, 12).toString('ascii') : extension === 'png' ? data.subarray(0, 8).toString('hex') : null };
}
async function runSample({ browser, baseUrl, viewport, run, wavBuffer }) {
  const row = { phase:PHASE, viewport, run, status:'started', stages:{}, failures:[], notes:[] };
  const context = await browser.newContext({ viewport:{ width:viewport.width, height:viewport.height }, deviceScaleFactor:1,
    isMobile:viewport.width < 600, hasTouch:viewport.width < 600, serviceWorkers:'block', acceptDownloads:true });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const cdp = await context.newCDPSession(page);
  const requestMap = new Map(), requests = [];
  const origin = baseUrl;
  await context.route('**/*', async (route) => {
    let url; try { url = new URL(route.request().url()); } catch { await route.abort('blockedbyclient'); return; }
    if (url.origin === origin && ['GET', 'HEAD'].includes(route.request().method())) await route.continue();
    else await route.abort('blockedbyclient');
  });
  await context.addInitScript(() => {
    try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Blocked by local performance harness.', 'NotAllowedError'); }; } catch {}
  });
  cdp.on('Network.requestWillBeSent', (event) => {
    const url = event.request.url;
    requestMap.set(event.requestId, { url, method:event.request.method, type:event.type || null, startTimestamp:event.timestamp,
      blocked: (() => { try { return new URL(url).origin !== origin || !['GET', 'HEAD'].includes(event.request.method); } catch { return true; } })(), status:null, encodedDataLength:0, durationMs:null });
  });
  cdp.on('Network.responseReceived', (event) => { const item = requestMap.get(event.requestId); if (item) { item.status = event.response.status; item.responseEncodedDataLength = event.response.encodedDataLength || 0; } });
  cdp.on('Network.loadingFinished', (event) => { const item = requestMap.get(event.requestId); if (item) { item.encodedDataLength = event.encodedDataLength || item.responseEncodedDataLength || 0; item.durationMs = (event.timestamp - item.startTimestamp) * 1000; requests.push(item); requestMap.delete(event.requestId); } });
  cdp.on('Network.loadingFailed', (event) => { const item = requestMap.get(event.requestId); if (item) { item.blocked ||= event.canceled; item.failure = event.errorText; requests.push(item); requestMap.delete(event.requestId); } });
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled:true });
  await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:20, downloadThroughput:20 * 1024 * 1024 / 8, uploadThroughput:10 * 1024 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate:2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixieed-output-first-use-'));
  try {
    const navigationStart = performance.now();
    const response = await page.goto(`${baseUrl}/output/work/`, { waitUntil:'domcontentloaded', timeout:60_000 });
    assert.equal(response?.status(), 200);
    await page.locator('#output-start').waitFor({ state:'visible' });
    row.stages.outputStartReadyMs = performance.now() - navigationStart;

    const requestStart = requests.length;
    const png = fs.readFileSync(path.join(SITE_ROOT, 'assets', 'samples', 'maou.png'));
    const importStart = performance.now();
    await page.locator('#output-file-input').setInputFiles({ name:'maou.png', mimeType:'image/png', buffer:png });
    await page.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:') &&
      document.querySelector('#output-format-select')?.options.length > 0, null, { timeout:60_000 });
    row.stages.initialReadyMs = performance.now() - importStart;
    row.initialFormatOptions = await page.locator('#output-format-select option').evaluateAll((options) => options.map((option) => ({ value:option.value, label:option.textContent.trim() })));
    row.initialMediaCaps = await page.evaluate(() => ({
      mediaRecorder: typeof MediaRecorder === 'function',
      mp4: typeof MediaRecorder === 'function' && ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4'].some((type) => MediaRecorder.isTypeSupported?.(type)),
      webm: typeof MediaRecorder === 'function' && ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].some((type) => MediaRecorder.isTypeSupported?.(type))
    }));
    row.stages.initialImport = outputBytes(row.stages.initialImport, requestStart, requests);
    row.initialImport = { ...row.stages.initialImport, elapsedMs:row.stages.initialReadyMs };
    row.stages.initialReadyMs = Number(row.stages.initialReadyMs.toFixed(1));

    const pngDownload = await downloadLocal(page, 'png', tempDir);
    row.downloads = [pngDownload];
    row.wideViewportOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

    const wavStartRequests = requests.length;
    const wavAddStart = performance.now();
    await page.locator('#output-add-assets').click();
    await page.locator('#output-file-input').setInputFiles({ name:'short-tone.wav', mimeType:'audio/wav', buffer:wavBuffer });
    await page.waitForFunction(() => !document.querySelector('#output-assets')?.hidden &&
      [...(document.querySelector('#output-source')?.options || [])].some((option) => option.value === 'local-audio'), null, { timeout:30_000 });
    row.stages.wavAssetImportMs = Number((performance.now() - wavAddStart).toFixed(1));
    row.wavImportOnlyStatus = await page.locator('#output-status').textContent();
    row.wavImportOnlyFormat = await page.locator('#output-format-select').inputValue();
    row.wavImportOnlyDownloadable = row.wavImportOnlyFormat === 'wav' && await page.locator('#output-download').evaluate((anchor) => anchor.href.startsWith('blob:'));
    row.stages.wavAssetImport = outputBytes(row.stages.wavAssetImport, wavStartRequests, requests);
    row.wavFirstUseAction = 'select local-audio in #output-source; its change handler starts the first WAV generation';

    const wavRequestStart = requests.length;
    const wavGenerationStart = performance.now();
    await page.locator('#output-source').selectOption('local-audio');
    await page.waitForFunction(() => document.querySelector('#output-format-select')?.value === 'wav' &&
      document.querySelector('#output-download')?.href.startsWith('blob:') &&
      /WAV音声を端末内に準備しました/.test(document.querySelector('#output-status')?.textContent || ''), null, { timeout:60_000 });
    row.stages.firstWavGenerateActionMs = Number((performance.now() - wavGenerationStart).toFixed(1));
    row.stages.firstWavGenerateAction = outputBytes(row.stages.firstWavGenerateAction, wavRequestStart, requests);
    row.wavGenerationReadyStatus = await page.locator('#output-status').textContent();
    row.downloads.push(await downloadLocal(page, 'wav', tempDir));

    const supportedVideo = row.initialFormatOptions.map((option) => option.value).find((value) => ['mp4', 'webm'].includes(value));
    row.videoCapability = supportedVideo || 'unsupported: no MP4/WebM option in the actual UI';
    if (supportedVideo) {
      await page.locator('#output-source').selectOption('local-images');
      await page.waitForFunction(() => /PNG画像を端末内に準備しました/.test(document.querySelector('#output-status')?.textContent || '') &&
        document.querySelector('#output-download')?.href.startsWith('blob:'), null, { timeout:60_000 });
      if(!await page.locator('#output-format-select').isVisible()) await page.locator('#output-extension').click();
      await page.locator('#output-format-select').selectOption(supportedVideo);
      if(await page.locator('#output-format-select').inputValue()!==supportedVideo){
        row.videoStatus='skipped: existing UI requires a 60-minute pass; isolated test does not acquire or simulate an entitlement';
        row.notes.push(await page.locator('#output-status').textContent());
      }else{
      if(await page.locator('#output-audio-settings').isVisible() && !await page.locator('#output-audio-settings').evaluate(n=>n.open)) await page.locator('#output-audio-settings > summary').click();
      if(await page.locator('#output-music-source').isVisible()) await page.locator('#output-music-source').selectOption('local-audio');
      await page.locator('#output-create-video').waitFor({ state:'visible' });

      const cancelBefore = requests.length;
      const previousHref = await page.locator('#output-download').getAttribute('href');
      const cancelStart = performance.now();
      await page.locator('#output-create-video').click();
      await page.locator('#output-cancel-generation').waitFor({ state:'visible', timeout:15_000 });
      await page.locator('#output-cancel-generation').click();
      await page.waitForFunction(() => /中止しました/.test(document.querySelector('#output-status')?.textContent || ''), null, { timeout:30_000 });
      row.stages.videoCancelMs = Number((performance.now() - cancelStart).toFixed(1));
      row.cancelPreservedPreviousOutput = (await page.locator('#output-download').getAttribute('href')) === previousHref;
      row.cancelStatus = await page.locator('#output-status').textContent();
      row.stages.videoCancel = outputBytes(row.stages.videoCancel, cancelBefore, requests);
      assert.equal(row.cancelPreservedPreviousOutput, true, 'cancel retains the previous generated output');

      if(!await page.locator('#output-format-select').isVisible()) await page.locator('#output-extension').click();
      await page.locator('#output-format-select').selectOption(supportedVideo);
      await page.locator('#output-create-video').waitFor({ state:'visible' });

      const videoRequestStart = requests.length;
      const videoStart = performance.now();
      await page.locator('#output-create-video').click();
      await page.waitForFunction(() => /動画を端末内に準備しました/.test(document.querySelector('#output-status')?.textContent || '') &&
        document.querySelector('#output-download')?.href.startsWith('blob:'), null, { timeout:90_000 });
      row.stages.videoFirstUseGenerateActionMs = Number((performance.now() - videoStart).toFixed(1));
      row.stages.videoFirstUseGenerateAction = outputBytes(row.stages.videoFirstUseGenerateAction, videoRequestStart, requests);
      row.videoGenerationReadyStatus = await page.locator('#output-status').textContent();
      row.videoDurationSeconds = await page.evaluate(() => Number(document.querySelector('#output-metadata')?.textContent.match(/([\d.]+)秒/)?.[1] || 0));
      row.downloads.push(await downloadLocal(page, supportedVideo, tempDir));
      row.videoStatus = 'completed in the existing generate-video action';
      }
    } else {
      row.videoStatus = row.videoCapability;
      row.notes.push('No MP4 or WebM option was offered by MediaRecorder in this browser; video rendering and recording-duration measurements were skipped.');
    }
    row.network = { requestCount:requests.length, encodedResponseBytes:requests.reduce((sum, request) => sum + (request.encodedDataLength || 0), 0), blockedExternalOrNonGet:requests.filter((request) => request.blocked).length,
      requests:requests.map(({ url, method, status, type, encodedDataLength, durationMs, blocked, failure }) => ({ path: (() => { try { return new URL(url).pathname; } catch { return url; } })(), method, status, type, encodedDataLength, durationMs, blocked, failure })) };
    assert.deepEqual(errors, [], 'no uncaught page errors');
    row.pageErrors = errors;
    row.status = 'completed';
  } catch (error) {
    row.status = 'failed'; row.failure = error?.stack || String(error); row.pageErrors = errors;
    row.network = { requestCount:requests.length, requests };
  } finally {
    row.externalRequestsSent = 0;
    row.completedAt = new Date().toISOString();
    fs.rmSync(tempDir, { recursive:true, force:true });
    await cdp.detach().catch(() => {}); await context.close().catch(() => {});
  }
  return row;
}

async function runAudioOnlySample({ browser, baseUrl, viewport, run, wavBuffer }) {
  const row = { phase:PHASE, scenario:'audio-only-initial-import', viewport, run, status:'started', stages:{}, failures:[] };
  const context = await browser.newContext({ viewport:{ width:viewport.width, height:viewport.height }, deviceScaleFactor:1,
    isMobile:viewport.width < 600, hasTouch:viewport.width < 600, serviceWorkers:'block', acceptDownloads:true });
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  const cdp = await context.newCDPSession(page), requestMap = new Map(), requests = [];
  const origin = baseUrl;
  await context.route('**/*', async (route) => {
    let url; try { url = new URL(route.request().url()); } catch { await route.abort('blockedbyclient'); return; }
    if (url.origin === origin && ['GET', 'HEAD'].includes(route.request().method())) await route.continue();
    else await route.abort('blockedbyclient');
  });
  await context.addInitScript(() => {
    try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Blocked by local performance harness.', 'NotAllowedError'); }; } catch {}
  });
  cdp.on('Network.requestWillBeSent', (event) => {
    const url = event.request.url;
    requestMap.set(event.requestId, { url, method:event.request.method, type:event.type || null, startTimestamp:event.timestamp,
      blocked: (() => { try { return new URL(url).origin !== origin || !['GET', 'HEAD'].includes(event.request.method); } catch { return true; } })(), status:null, encodedDataLength:0, durationMs:null });
  });
  cdp.on('Network.responseReceived', (event) => { const item = requestMap.get(event.requestId); if (item) { item.status = event.response.status; item.responseEncodedDataLength = event.response.encodedDataLength || 0; } });
  cdp.on('Network.loadingFinished', (event) => { const item = requestMap.get(event.requestId); if (item) { item.encodedDataLength = event.encodedDataLength || item.responseEncodedDataLength || 0; item.durationMs = (event.timestamp - item.startTimestamp) * 1000; requests.push(item); requestMap.delete(event.requestId); } });
  cdp.on('Network.loadingFailed', (event) => { const item = requestMap.get(event.requestId); if (item) { item.blocked ||= event.canceled; item.failure = event.errorText; requests.push(item); requestMap.delete(event.requestId); } });
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled:true });
  await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:20, downloadThroughput:20 * 1024 * 1024 / 8, uploadThroughput:10 * 1024 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate:2 });
  const errors = [], tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixieed-audio-only-first-use-'));
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const navigationStart = performance.now();
    const response = await page.goto(`${baseUrl}/output/work/`, { waitUntil:'domcontentloaded', timeout:60_000 });
    assert.equal(response?.status(), 200);
    await page.locator('#output-start').waitFor({ state:'visible' });
    row.stages.outputStartReadyMs = Number((performance.now() - navigationStart).toFixed(1));

    const requestStart = requests.length, importStart = performance.now();
    await page.locator('#output-file-input').setInputFiles({ name:'short-tone.wav', mimeType:'audio/wav', buffer:wavBuffer });
    await page.waitForURL((url) => url.pathname === '/output/work/' && Boolean(url.searchParams.get('id')), { timeout:60_000 });
    await page.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:') &&
      document.querySelector('#output-format-select')?.value === 'wav' &&
      !document.querySelector('#output-audio')?.hidden, null, { timeout:60_000 });
    row.stages.audioOnlyInitialImportMs = Number((performance.now() - importStart).toFixed(1));
    row.formatOptions = await page.locator('#output-format-select option').evaluateAll((options) => options.map((option) => ({ value:option.value, label:option.textContent.trim() })));
    row.audioPreviewVisible = await page.locator('#output-audio').isVisible();
    row.readyStatus = await page.locator('#output-status').textContent();
    row.stages.audioOnlyImport = outputBytes(row.stages.audioOnlyImport, requestStart, requests);
    row.download = await downloadLocal(page, 'wav', tempDir);
    assert.equal(row.audioPreviewVisible, true, 'imported audio-only WAV remains playable in its preview');
    assert.ok(row.download.bytes > 44, 'generated WAV contains audio samples');
    assert.deepEqual(errors, [], 'no uncaught page errors');
    row.pageErrors = errors;
    row.network = { requestCount:requests.length, encodedResponseBytes:requests.reduce((sum, request) => sum + (request.encodedDataLength || 0), 0), blockedExternalOrNonGet:requests.filter((request) => request.blocked).length,
      requests:requests.map(({ url, method, status, type, encodedDataLength, durationMs, blocked, failure }) => ({ path: (() => { try { return new URL(url).pathname; } catch { return url; } })(), method, status, type, encodedDataLength, durationMs, blocked, failure })) };
    row.status = 'completed';
  } catch (error) {
    row.status = 'failed'; row.failure = error?.stack || String(error); row.pageErrors = errors;
    row.network = { requestCount:requests.length, requests };
  } finally {
    row.externalRequestsSent = 0; row.completedAt = new Date().toISOString();
    fs.rmSync(tempDir, { recursive:true, force:true });
    await cdp.detach().catch(() => {}); await context.close().catch(() => {});
  }
  return row;
}

async function main() {
  validate();
  const { chromium } = await import(pathToFileURL(PLAYWRIGHT_MODULE).href);
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true });
  const results = [], audioOnlyResults = [];
  try {
    console.log(`Output first-use ${PHASE}: ${VIEWPORTS.length} viewport(s) × ${RUNS} fresh-storage samples; external/non-GET blocked.`);
    for (const viewport of VIEWPORTS) for (let run = 1; run <= RUNS; run++) {
      const row = await runSample({ browser, baseUrl, viewport, run, wavBuffer:syntheticWav() });
      results.push(row);
      if(row.failure) console.error(row.failure);
      console.log(`[${PHASE}] ${viewport.name} ${run}/${RUNS}: ${row.status}, ready=${row.stages?.initialReadyMs ?? 'n/a'}ms, WAV=${row.stages?.firstWavGenerateActionMs ?? 'n/a'}ms, video=${row.videoStatus || 'not reached'}`);
      const audioOnly = await runAudioOnlySample({ browser, baseUrl, viewport, run, wavBuffer:syntheticWav() });
      audioOnlyResults.push(audioOnly);
      if(audioOnly.failure) console.error(audioOnly.failure);
      console.log(`[${PHASE}] audio-only ${viewport.name} ${run}/${RUNS}: ${audioOnly.status}, import=${audioOnly.stages?.audioOnlyInitialImportMs ?? 'n/a'}ms, WAV=${audioOnly.download?.bytes ?? 'n/a'}B`);
    }
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive:true });
  const outputPath = path.join(OUTPUT_DIR, `output-first-use-${PHASE}.json`);
  const report = { phase:PHASE, measuredAt:new Date().toISOString(), siteRoot: SITE_ROOT, route:'/output/work/', viewports:VIEWPORTS, runsPerViewport:RUNS,
    conditions:{ browser:'Chromium through Playwright', freshContextPerSample:true, freshStorage:true, cacheDisabled:true, cpuThrottle:2, network:{ downloadMbps:20, uploadMbps:10, latencyMs:20 },
      externalRequests:'aborted before send', sameOriginMethods:['GET','HEAD'], serviceWorkers:'blocked', sourcePng:'/assets/samples/maou.png', syntheticWavSeconds:0.5,
      downloads:'verified locally in a temporary directory; no publish or upload' }, results, audioOnlyResults };
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Wrote ${outputPath}`);
  if (results.some((result) => result.status !== 'completed') || audioOnlyResults.some((result) => result.status !== 'completed')) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
