#!/usr/bin/env node
/**
 * Fault-injection verification for the output page's first WAV module load.
 * This does not measure performance: it holds the first audio-export module
 * response so the progress and cancellation UI can be inspected deterministically.
 *
 * Required: PIXIEED_PERF_ROOT=<immutable static-site snapshot>
 * Optional: PIXIEED_PERF_VIEWPORTS=390x844,1280x800
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_ROOT = process.env.PIXIEED_PERF_ROOT ? path.resolve(process.env.PIXIEED_PERF_ROOT) : '';
const OUTPUT_DIR = path.join(REPO, 'docs', 'performance-20261017', 'followup', 'wav-progress');
const VIEWPORTS = parseViewports(process.env.PIXIEED_PERF_VIEWPORTS || '390x844,1280x800');
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

function parseViewports(value) {
  return value.split(',').map((raw) => {
    const match = raw.trim().match(/^(?:(?<name>[a-zA-Z0-9_-]+):)?(?<width>\d+)x(?<height>\d+)$/);
    if (!match) throw new Error(`Invalid viewport ${raw}; use [name:]WIDTHxHEIGHT`);
    const width = Number(match.groups.width), height = Number(match.groups.height);
    if (width < 240 || width > 4000 || height < 240 || height > 4000) throw new Error(`Viewport out of range: ${raw}`);
    return { name:match.groups.name || `${width}x${height}`, width, height };
  });
}
function validate() {
  if (!SITE_ROOT || !fs.statSync(SITE_ROOT, { throwIfNoEntry:false })?.isDirectory()) throw new Error('Set PIXIEED_PERF_ROOT to an existing immutable static site directory.');
  for (const relative of ['output/work/index.html', 'assets/samples/maou.png']) {
    if (!fs.statSync(path.join(SITE_ROOT, relative), { throwIfNoEntry:false })?.isFile()) throw new Error(`Required file is missing from the selected site: ${relative}`);
  }
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
    const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
    if (range && info.size > 0) {
      const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2] || 0));
      const end = Math.min(range[2] ? Number(range[2]) : info.size - 1, info.size - 1);
      if (start <= end && start < info.size) {
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`; headers['Content-Length'] = end - start + 1; headers['Accept-Ranges'] = 'bytes';
        res.writeHead(206, headers); if (method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).pipe(res); return;
      }
      res.writeHead(416, { 'Content-Range':`bytes */${info.size}` }); res.end(); return;
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
async function downloadWav(page, tempDir) {
  const pending = page.waitForEvent('download', { timeout:15_000 });
  await page.locator('#output-download').click();
  const download = await pending;
  const filePath = path.join(tempDir, `wav-${Date.now()}.wav`);
  await download.saveAs(filePath);
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(0, 4).toString('ascii'), 'RIFF', 'download is a WAV file');
  assert.equal(data.subarray(8, 12).toString('ascii'), 'WAVE', 'WAV container signature is valid');
  assert.ok(data.length > 44, 'WAV contains sample data');
  return { filename:download.suggestedFilename(), bytes:data.length, signature:data.subarray(0, 12).toString('ascii') };
}
async function downloadPng(page, tempDir) {
  const pending = page.waitForEvent('download', { timeout:15_000 });
  await page.locator('#output-download').click();
  const download = await pending;
  const filePath = path.join(tempDir, `png-${Date.now()}.png`);
  await download.saveAs(filePath);
  const data = fs.readFileSync(filePath);
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'current preserved output is a PNG');
  return { filename:download.suggestedFilename(), bytes:data.length, signature:data.subarray(0, 8).toString('hex') };
}
async function setupPage(browser, baseUrl, viewport, wavBuffer) {
  const context = await browser.newContext({ viewport:{ width:viewport.width, height:viewport.height }, deviceScaleFactor:1,
    isMobile:viewport.width < 600, hasTouch:viewport.width < 600, serviceWorkers:'block', acceptDownloads:true });
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  await context.route('**/*', async (route) => {
    let url; try { url = new URL(route.request().url()); } catch { await route.abort('blockedbyclient'); return; }
    if (url.origin === baseUrl && ['GET', 'HEAD'].includes(route.request().method())) await route.continue();
    else await route.abort('blockedbyclient');
  });
  await context.addInitScript(() => {
    try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Blocked by local verification harness.', 'NotAllowedError'); }; } catch {}
  });
  await page.goto(`${baseUrl}/output/work/`, { waitUntil:'domcontentloaded', timeout:60_000 });
  await page.locator('#output-start').waitFor({ state:'visible' });
  const png = fs.readFileSync(path.join(SITE_ROOT, 'assets', 'samples', 'maou.png'));
  await page.locator('#output-file-input').setInputFiles({ name:'maou.png', mimeType:'image/png', buffer:png });
  await page.waitForURL((url) => url.pathname === '/output/work/' && Boolean(url.searchParams.get('id')), { timeout:60_000 });
  await page.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:') &&
    document.querySelector('#output-format-select')?.value === 'png', null, { timeout:60_000 });
  await page.locator('#output-add-assets').waitFor({ state:'visible' });
  return { context, page, wavBuffer, initialHref:await page.locator('#output-download').getAttribute('href') };
}
function createHold(page) {
  let releaseResolve, seenResolve;
  const releasePromise = new Promise((resolve) => { releaseResolve = resolve; });
  const seen = new Promise((resolve) => { seenResolve = resolve; });
  let heldUrl = null, didHold = false;
  const routeHandler = async (route) => {
    if (!didHold && new URL(route.request().url()).pathname.endsWith('/js/creation/audio-export.mjs')) {
      didHold = true; heldUrl = route.request().url(); seenResolve(heldUrl);
      await releasePromise;
      await route.continue().catch(() => {});
      return;
    }
    await route.continue();
  };
  return { routeHandler, seen, release:() => releaseResolve(), get heldUrl() { return heldUrl; }, get didHold() { return didHold; } };
}
async function uploadWav(page, wavBuffer) {
  await page.locator('#output-add-assets').click();
  await page.locator('#output-file-input').setInputFiles({ name:'short-tone.wav', mimeType:'audio/wav', buffer:wavBuffer });
}
async function waitForWavAdded(page) {
  await page.waitForFunction(() => !document.querySelector('#output-assets')?.hidden &&
    [...(document.querySelector('#output-source')?.options || [])].some((option) => option.value === 'local-audio') &&
    /個のファイルを追加しました/.test(document.querySelector('#output-status')?.textContent || ''), null, { timeout:60_000 });
}
async function generateLocalAudioWav(page, tempDir) {
  await page.locator('#output-source').selectOption('local-audio');
  await page.waitForFunction(() => document.querySelector('#output-format-select')?.value === 'wav' &&
    document.querySelector('#output-download')?.href.startsWith('blob:') &&
    /WAV音声を端末内に準備しました/.test(document.querySelector('#output-status')?.textContent || ''), null, { timeout:60_000 });
  return downloadWav(page, tempDir);
}
async function runCase({ browser, baseUrl, viewport, scenario, wavBuffer, tempDir }) {
  const row = { scenario, viewport, type:'fault-injection-verification', status:'started', metrics:'not measured', failures:[], externalRequestsSent:0 };
  const { context, page, initialHref } = await setupPage(browser, baseUrl, viewport, wavBuffer);
  const hold = createHold(page);
  try {
    row.initialOutput = { format:await page.locator('#output-format-select').inputValue(), href:initialHref };
    assert.equal(row.initialOutput.format, 'png', 'test starts with the existing PNG output');
    row.initialPngDownload = await downloadPng(page, tempDir);
    await uploadWav(page, wavBuffer);
    await waitForWavAdded(page);
    row.pngPreservedAfterWavAttach = (await page.locator('#output-download').getAttribute('href')) === initialHref;
    assert.equal(row.pngPreservedAfterWavAttach, true, 'attaching a WAV source keeps the previous PNG output');
    await page.route('**/js/creation/audio-export.mjs*', hold.routeHandler);
    const selectAudio = page.locator('#output-source').selectOption('local-audio');
    row.heldModuleUrl = await Promise.race([hold.seen, new Promise((_, reject) => setTimeout(() => reject(new Error('First audio-export module request was not reached within 30s.')), 30_000))]);
    await page.locator('#output-generation-progress').waitFor({ state:'visible', timeout:15_000 });
    await page.locator('#output-cancel-generation').waitFor({ state:'visible', timeout:15_000 });
    row.progressVisibleWhileModuleHeld = await page.locator('#output-generation-progress').isVisible();
    row.cancelVisibleWhileModuleHeld = await page.locator('#output-cancel-generation').isVisible();
    row.pngHeldBeforeDecision = (await page.locator('#output-download').getAttribute('href')) === initialHref;
    assert.equal(row.progressVisibleWhileModuleHeld, true, 'output generation progress is exposed while the lazy module is held');
    assert.equal(row.cancelVisibleWhileModuleHeld, true, 'output generation cancellation is exposed while the lazy module is held');
    assert.equal(row.pngHeldBeforeDecision, true, 'the previous PNG blob remains the download while the module is held');

    if (scenario === 'cancel-and-retry') {
      await page.locator('#output-cancel-generation').click();
      row.cancelClickedWhileModuleHeld = true;
      row.pngHeldImmediatelyAfterCancel = (await page.locator('#output-download').getAttribute('href')) === initialHref;
      assert.equal(row.pngHeldImmediatelyAfterCancel, true, 'cancel leaves the previous PNG blob available while generation is held');
    }
    hold.release();
    await selectAudio;
    if (scenario === 'complete') {
      await page.waitForFunction(() => document.querySelector('#output-format-select')?.value === 'wav' &&
        document.querySelector('#output-download')?.href.startsWith('blob:') &&
        /WAV音声を端末内に準備しました/.test(document.querySelector('#output-status')?.textContent || ''), null, { timeout:60_000 });
      row.releaseOutcomeStatus = await page.locator('#output-status').textContent();
      row.wavDownload = await downloadWav(page, tempDir);
      row.realWavVerified = true;
    } else {
      await page.waitForFunction(() => /作成を中止しました/.test(document.querySelector('#output-status')?.textContent || ''), null, { timeout:30_000 });
      row.cancelStatus = await page.locator('#output-status').textContent();
      row.previousPngPreservedAfterCancel = (await page.locator('#output-download').getAttribute('href')) === initialHref;
      assert.equal(row.previousPngPreservedAfterCancel, true, 'cancel keeps the previous PNG blob as the current output');
      row.pngAfterCancelDownload = await downloadPng(page, tempDir);
      await page.reload({ waitUntil:'domcontentloaded', timeout:60_000 });
      await page.waitForFunction(() => document.querySelector('#output-download')?.href.startsWith('blob:') &&
        [...(document.querySelector('#output-source')?.options || [])].some((option) => option.value === 'local-audio'), null, { timeout:60_000 });
      row.pngAfterReloadDownload = await downloadPng(page, tempDir);
      row.retrySucceeded = true;
      row.wavDownload = await generateLocalAudioWav(page, tempDir);
      row.realWavVerified = true;
    }
    row.status = 'completed';
  } catch (error) {
    row.status = 'failed'; row.failure = error?.stack || String(error);
  } finally {
    hold.release();
    await context.close().catch(() => {});
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
  const wavBuffer = syntheticWav(), tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixieed-wav-progress-'));
  const rows = [];
  try {
    console.log(`WAV first-use fault injection: ${VIEWPORTS.length} viewport(s); fresh context per case; external requests blocked.`);
    for (const viewport of VIEWPORTS) for (const scenario of ['complete', 'cancel-and-retry']) {
      const row = await runCase({ browser, baseUrl, viewport, scenario, wavBuffer, tempDir });
      rows.push(row);
      console.log(`[fault-injection] ${viewport.name} ${scenario}: ${row.status}, progress=${row.progressVisibleWhileModuleHeld ?? 'n/a'}, cancel=${row.cancelVisibleWhileModuleHeld ?? 'n/a'}, WAV=${row.wavDownload?.bytes ?? 'n/a'}B`);
      if (row.failure) console.error(row.failure);
    }
  } finally {
    await browser.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive:true, force:true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive:true });
  const report = { type:'fault-injection-verification', purpose:'Verify output-page progress/cancel state while the first lazy audio-export module request is deliberately held; this report is not a performance measurement.', route:'/output/work/', viewports:VIEWPORTS,
    conditions:{ browser:'Chromium through Playwright', freshContextPerCase:true, storage:'new browser context for every scenario', cacheDisabled:'not relevant; module request is intercepted before response', externalRequests:'aborted before send', sameOriginMethods:['GET','HEAD'], serviceWorkers:'blocked', mediaCapture:'getUserMedia denied', moduleRequest:'held once until test explicitly releases it', testWav:'synthetic 0.5-second stereo WAV uploaded from memory', download:'saved and signature-checked in a temporary directory', timing:'not measured' }, results:rows };
  const jsonPath = path.join(OUTPUT_DIR, 'wav-progress-browser.json');
  const jsonlPath = path.join(OUTPUT_DIR, 'wav-progress-browser.jsonl');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(jsonlPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
  console.log(`Wrote ${jsonPath} and ${jsonlPath}`);
  if (rows.some((row) => row.status !== 'completed')) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
