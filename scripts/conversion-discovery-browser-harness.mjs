#!/usr/bin/env node
/** Real guide navigation, files, module Workers and IndexedDB. No UI/codec substitutes. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePcm } from '../js/creation/conversion-pcm.mjs';
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || fileURLToPath(new URL('../', import.meta.url)));
const output = (process.env.PIXIEED_BROWSER_ARTIFACTS || '/tmp/pixieed-output-browser') + '/discovery';
await mkdir(output, { recursive: true });
const mime = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + '/')) throw new Error('path');
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ executablePath: process.env.PIXIEED_CHROME_EXECUTABLE || undefined, args: ['--no-sandbox'] });
const report = { browser: browser.version(), cases: [], errors: [] };
const pass = name => { report.cases.push(name); console.log('PASS ' + name); };
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on('pageerror', error => report.errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
async function open(path) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded' });
  if (path.startsWith('/output/work/')) await page.locator('[data-text-tools]').waitFor({ state: 'attached' });
}
async function download(selector = '[data-download]') {
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]);
  assert.equal(await file.failure(), null); return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}
try {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await open('/output/formats/qoi/');
    assert.equal(await page.locator('h1').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    pass(`QOI guide at ${width}px: one heading and no horizontal overflow`);
    if ([390,1440].includes(width)) await page.screenshot({ path: `${output}/qoi-${width}.png`, fullPage: true });
  }
  await open('/output/formats/'); await page.locator('[data-format-filter]').waitFor({ state: 'visible' });
  await page.locator('[data-format-filter]').fill('.ＱＯＩ');
  assert.ok(await page.locator('[data-format-card]:visible').count() > 0);
  await page.locator('[data-format-filter]').fill('no-matching-format'); assert.ok(await page.locator('[data-format-empty]').isVisible());
  await page.locator('[data-format-filter]').fill(''); assert.equal(await page.locator('[data-format-card]:visible').count(), 8);
  pass('Local directory filter, full-width characters, empty-state recovery');
  await page.screenshot({ path: `${output}/directory.png`, fullPage: true });
  const png = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 8;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#1b563e'; ctx.fillRect(2, 1, 10, 7);
    return [...atob(canvas.toDataURL('image/png').split(',')[1])].map(ch => ch.charCodeAt(0));
  }));
  const samples = Float64Array.from({ length: 800 }, (_, i) => (i % 64 - 32) / 64);
  const aiff = Buffer.from(await encodePcm({ sampleRate: 8000, channels: [samples] }, 'aiff', { bitDepth: 16 }).arrayBuffer());
  const signature = { qoi: [0, 'qoif'], tiff: [0, 'II'], ico: null, tga: null, ppm: [0, 'P6'], bmp: [0, 'BM'], aiff: [8, 'AIFF'], au: [0, '.snd'] };
  for (const [slug, target] of Object.entries({ qoi:'qoi', tga:'tga', tiff:'tiff', ico:'ico', netpbm:'ppm', bmp:'bmp', aiff:'aiff', au:'au' })) {
    await open(`/output/formats/${slug}/`); await page.locator('.format-intro [data-output-start]').click();
    await page.locator('.convert-intent').waitFor({ state: 'visible' });
    const audio = ['aiff','au'].includes(target);
    await page.locator('[data-file]').setInputFiles({ name: audio ? 'sample.aiff' : 'sample.png', mimeType: audio ? 'audio/aiff' : 'image/png', buffer: audio ? aiff : png });
    await page.waitForFunction(target => document.querySelector('[data-format]')?.value === target, target);
    assert.equal(await page.locator('.convert-intent').getAttribute('data-state'), 'ready');
    if (target === 'qoi') await page.screenshot({ path: `${output}/intent-qoi.png`, fullPage: true });
    await page.locator('[data-convert]').click(); await page.locator('[data-download]').waitFor({ state: 'visible' });
    const result = await download(); assert.ok(result.name.endsWith('.' + target)); assert.ok(result.bytes.length > 16);
    if (signature[target]) { const [offset, text] = signature[target]; assert.equal(result.bytes.subarray(offset,offset+text.length).toString(),text); }
    if (target === 'ico') assert.equal(result.bytes.subarray(0,4).toString('hex'),'00000100');
    if (target === 'tga') { assert.equal(result.bytes[2],2); assert.equal(result.bytes[16],32); }
    pass(`${slug}: real guide → selected ${target} → actual downloaded file`);
  }
  await open('/output/work/?mode=convert&to=qoi');
  await page.locator('[data-file]').setInputFiles({ name: 'sample.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('[data-format]').value === 'qoi');
  await page.locator('[data-format]').selectOption('png'); assert.equal(await page.locator('.convert-intent').isVisible(), false);
  await page.locator('[data-file]').setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('[data-name]')?.textContent === 'second.png' && !document.querySelector('[data-convert]').disabled);
  assert.equal(await page.locator('[data-format]').inputValue(), 'png');
  pass('Manual changes override the suggested target, including subsequent file loads');
  await open('/output/work/?mode=convert&to=aiff');
  await page.locator('[data-file]').setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('.convert-intent').dataset.state === 'unavailable');
  assert.equal(await page.locator('[data-format]').inputValue(), 'png');
  pass('Incompatible audio target shows explanation and keeps a valid image output');
  await open('/output/work/?mode=convert&to=qoi&text=input');
  await page.locator('[data-tx-source]').waitFor({ state: 'visible' }); assert.equal(await page.locator('.convert-intent').count(),0);
  pass('Text input mode takes precedence over a conversion intent');
  const staged = await page.evaluate(async bytes => {
    const { storeOutputFile } = await import('/js/creation/output-router.mjs?rev=20261028-unified-output-1');
    return storeOutputFile(new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'original.png', '/draw/');
  }, [...png]);
  await open(staged.url + '&to=qoi'); await page.locator('[data-download]').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.convert-intent').count(),0); assert.deepEqual((await download()).bytes,png);
  pass('Real IndexedDB handoff ignores intent and preserves original file bytes');
  const staticContext = await browser.newContext({ javaScriptEnabled: false });
  const staticPage = await staticContext.newPage(); await staticPage.goto(base+'/output/formats/tga/');
  assert.equal(await staticPage.locator('.format-route-start').count(),4); assert.ok(await staticPage.locator('h1').isVisible()); await staticContext.close();
  pass('Guide content and four conversion links work without JavaScript');
  assert.deepEqual(report.errors, []); pass('No uncaught browser errors');
} catch (error) {
  report.failure = error.stack; console.error(error); process.exitCode = 1;
  await page.screenshot({ path: output+'/failure.png', fullPage:true }).catch(() => {});
} finally {
  await writeFile(output+'/report.json', JSON.stringify(report,null,2)); await browser.close(); server.close();
}
