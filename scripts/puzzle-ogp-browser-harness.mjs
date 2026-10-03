import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createDrawDocument, documentRgba, encodePng } from '../js/creation/draw-core.mjs';
import { buildPuzzleShareArtifacts } from './lib/puzzle-ogp-artifacts.mjs';
import { createHiddenObjectOgpRenderer } from './lib/puzzle-ogp-browser.mjs';

const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href);
const browser = await chromium.launch({ headless: true }), renderer = createHiddenObjectOgpRenderer();
try {
  const picture = createDrawDocument(32);
  picture.palette = ['#14283e', '#86bdd9', '#5a9361', '#e75445', '#ffdd66'];
  picture.pixels = picture.pixels.map((_, index) => Math.floor(index / 32) > 24 ? 2 : 1);
  const rect = (x, y, width, height, color) => { for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) picture.pixels[row * 32 + col] = color; };
  rect(5, 14, 6, 6, 3); rect(6, 13, 2, 1, 3); rect(9, 13, 1, 1, 3); rect(8, 11, 1, 3, 0); rect(9, 11, 2, 1, 2);
  rect(19, 17, 3, 3, 4); picture.pixels[18 * 32 + 20] = 1; rect(22, 18, 5, 1, 4); rect(25, 19, 1, 2, 4);
  const id = '123e4567-e89b-42d3-a456-426614174000', project = 'https://project.supabase.co';
  const payload = { ok: true, puzzle: { postId: id, title: '試験用の絵', author: '試験', mode: 'hidden_object', originalImage: { width: 32, height: 32, url: `${project}/storage/v1/object/public/post-public/${id}/original.png` }, definition: { prompt: 'りんごと鍵を見つけよう', targets: [{ name: 'りんご', pixels: [453] }, { name: '鍵', pixels: [563] }] } } };
  const options = { postId: id, supabaseUrl: project }, originalBytes = encodePng(picture);
  const result = await buildPuzzleShareArtifacts(payload, options, { originalBytes, renderHidden: renderer.render });
  await writeFile('/tmp/pixieed-hidden-object-ogp.png', result.images[0].bytes);
  const page = await browser.newPage(); await page.route('**/*', route => route.abort());
  const measured = await page.evaluate(async ({ base64, source, bounds, scale }) => {
    const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); const data = ctx.getImageData(0, 0, image.width, image.height).data;
    let mismatch = 0;
    for (let y = 0; y < bounds.height; y++) for (let x = 0; x < bounds.width; x++) {
      const i = ((bounds.y + y) * image.width + bounds.x + x) * 4, j = (Math.floor(y / scale) * 32 + Math.floor(x / scale)) * 4;
      for (let channel = 0; channel < 4; channel++) if (data[i + channel] !== source[j + channel]) mismatch++;
    }
    return { width: image.width, height: image.height, mismatch };
  }, { base64: result.images[0].bytes.toString('base64'), source: [...documentRgba(picture)], bounds: result.layout.original, scale: result.layout.scale });
  assert.deepEqual(measured, { width: 1200, height: 630, mismatch: 0 });
  assert.doesNotMatch(result.html, /pixels|453|563/);
  payload.puzzle.definition.prompt = 'あ'.repeat(180);
  const long = await buildPuzzleShareArtifacts(payload, options, { originalBytes, renderHidden: renderer.render });
  assert.notEqual(result.images[0].name, long.images[0].name);
  payload.puzzle.definition.prompt = '';
  const fallback = await buildPuzzleShareArtifacts(payload, options, { originalBytes, renderHidden: renderer.render });
  assert.notEqual(result.images[0].name, fallback.images[0].name);
  for (const width of [1200, 600, 390]) {
    await page.setViewportSize({ width, height: 700 });
    await page.setContent('<style>body{margin:0}img{display:block;width:100%;height:auto}</style><img>');
    await page.locator('img').evaluate((image, base64) => { image.src = `data:image/png;base64,${base64}`; }, result.images[0].bytes.toString('base64'));
    await page.locator('img').evaluate(image => image.decode());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `/tmp/pixieed-hidden-ogp-review-${width}.png` });
  }
  console.log(JSON.stringify({ ...measured, prompt: 'custom/180-character/fallback PASS', responsiveWidths: [1200, 600, 390], output: '/tmp/pixieed-hidden-object-ogp.png' }));
} finally { await renderer.close(); await browser.close(); }
