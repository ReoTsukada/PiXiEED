// Review assets only: no site metadata, production image, or deployment changes.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Specify an existing Playwright entry module with PIXIEED_PLAYWRIGHT_MODULE.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const directory = dirname(fileURLToPath(import.meta.url));
const originalLogo = await readFile(resolve(directory, '../../../assets/brand/pixieed-logo-48.png'));
const html = (await readFile(resolve(directory, 'ogp-brand.html'), 'utf8')).replace('../../../assets/brand/pixieed-logo-48.png', `data:image/png;base64,${originalLogo.toString('base64')}`);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, serviceWorkers: 'block' });
  await context.route('**/*', route => route.abort());
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.logo img').evaluate(image => image.decode());
  const measurements = await page.evaluate(() => {
    const logo = document.querySelector('.logo img');
    const rect = logo.getBoundingClientRect();
    const bounds = [...document.querySelectorAll('.card > *')].map(element => {
      const r = element.getBoundingClientRect();
      return { name: element.className || element.tagName, x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    });
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
    canvas.getContext('2d').drawImage(logo, 0, 0, 48, 48);
    return { bounds, logo: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, naturalWidth: logo.naturalWidth, naturalHeight: logo.naturalHeight, rendering: getComputedStyle(logo).imageRendering, rgba: Array.from(canvas.getContext('2d').getImageData(0, 0, 48, 48).data) }, font: getComputedStyle(document.querySelector('h1')).fontFamily };
  });
  for (const rect of measurements.bounds) assert.ok(rect.x >= 0 && rect.y >= 0 && rect.right <= 1200 && rect.bottom <= 630, `${rect.name} inside canvas`);
  assert.deepEqual([measurements.logo.x, measurements.logo.y, measurements.logo.width, measurements.logo.height], [80, 56, 144, 144]);
  assert.deepEqual([measurements.logo.naturalWidth, measurements.logo.naturalHeight, measurements.logo.rendering], [48, 48, 'pixelated']);
  const output = resolve(directory, 'ogp-brand-1200x630.png');
  await page.screenshot({ path: output, type: 'png' });
  const png = await readFile(output);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630]);
  const pixels = await page.evaluate(async data => {
    const image = new Image(); image.src = data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 144;
    const c = canvas.getContext('2d'); c.drawImage(image, 80, 56, 144, 144, 0, 0, 144, 144);
    return Array.from(c.getImageData(0, 0, 144, 144).data);
  }, `data:image/png;base64,${png.toString('base64')}`);
  let pixelChecks = 0;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const offset = (y * 48 + x) * 4; const color = measurements.logo.rgba.slice(offset, offset + 4); const alpha = color[3] / 255;
    const expected = color.slice(0, 3).map((c, channel) => Math.round(c * alpha + [23, 35, 45][channel] * (1 - alpha)));
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const target = ((y * 3 + dy) * 144 + x * 3 + dx) * 4;
      assert.deepEqual(pixels.slice(target, target + 4), [...expected, 255], `logo pixel ${x},${y} preserved`);
      pixelChecks++;
    }
  }
  await page.setViewportSize({ width: 600, height: 315 });
  await page.setContent(`<!doctype html><style>html,body{margin:0;width:600px;height:315px;overflow:hidden}img{display:block;width:600px;height:315px}</style><img alt="PiXiEED OGPの50%プレビュー" src="data:image/png;base64,${png.toString('base64')}">`);
  await page.locator('img').evaluate(image => image.decode());
  await page.screenshot({ path: resolve(directory, 'ogp-brand-preview-600x315.png') });
  const verification = { width: 1200, height: 630, generatedAt: new Date().toISOString(), logoSource: 'assets/brand/pixieed-logo-48.png', logoScale: 3, logoPixelChecks: pixelChecks, bounds: measurements.bounds, font: measurements.font, network: 'blocked', preview: 'ogp-brand-preview-600x315.png' };
  await writeFile(resolve(directory, 'ogp-brand-verification.json'), JSON.stringify(verification, null, 2) + '\n');
  console.log(JSON.stringify({ output, width: 1200, height: 630, logoPixelChecks: pixelChecks, bounds: 'PASS', preview: '600x315' }));
} finally { await browser.close(); }
