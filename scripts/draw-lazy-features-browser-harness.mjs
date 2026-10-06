/** On-demand image import/GIF modules and PXD round trip in isolated browser storage. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_DRAW_LAZY_OUTPUT || '/tmp/pixieed-draw-lazy-features-20261006';
await mkdir(output, { recursive: true });
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch(), results = [];
function gifImages(bytes) {
 assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
 let offset = 13 + (bytes[10] & 128 ? 3 * 2 ** ((bytes[10] & 7) + 1) : 0), frames = 0;
 const skipBlocks = () => { while (offset < bytes.length) { const size = bytes[offset++]; if (!size) return; offset += size; } throw Error('GIF sub-block truncated'); };
 while (offset < bytes.length) {
  const type = bytes[offset++]; if (type === 0x3b) return frames;
  if (type === 0x21) { offset++; skipBlocks(); }
  else if (type === 0x2c) { frames++; const packed = bytes[offset + 8]; offset += 9; if (packed & 128) offset += 3 * 2 ** ((packed & 7) + 1); offset++; skipBlocks(); }
  else throw Error(`Unexpected GIF block ${type.toString(16)} at ${offset - 1}`);
 }
 throw Error('GIF trailer missing');
}
try {
 for (const variant of [{ width: 390, height: 844, dpr: 3 }, { width: 1280, height: 800, dpr: 1 }]) {
  const context = await browser.newContext({ viewport: variant, deviceScaleFactor: variant.dpr, acceptDownloads: true }), p = await context.newPage(), errors = [], requests = [], checks = [], label = `${variant.width}x${variant.height}`;
  await context.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
  p.on('pageerror', e => errors.push(e.message)); p.on('request', r => { if (new URL(r.url()).origin === new URL(base).origin) requests.push(new URL(r.url()).pathname); }); p.setDefaultTimeout(10000);
  const ready = () => p.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main').inert);
  const rgba = () => p.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
  const tap = async (x, y) => { const b = await p.locator('#draw-canvas').boundingBox(); await p.mouse.click(b.x + (x + .5) * b.width / 16, b.y + (y + .5) * b.height / 16); };
  const command = async id => { if (!await p.locator('#draw-settings-picker').evaluate(n => n.open)) await p.locator('#draw-settings-summary').click(); await p.locator('#draw-shortcuts-open').click(); await p.locator(`[data-command-run="${id}"]`).click(); await p.waitForTimeout(50); };
  const save = async () => { await p.locator('#pxd-save').evaluate(n => n.click()); await p.waitForFunction(() => !document.querySelector('#main').inert && !document.querySelector('#pxd-save').disabled); return p.evaluate(async () => { const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs'); const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs'); const ref = JSON.parse(localStorage.getItem('pixieed:pxd:last:draw')); const a = await readPxdAnimation(await createToolProjectStore('draw').load(ref.projectId, ref.revisionId)); return { palette: a.palette, frames: a.frames.length }; }); };
  const gif = async (id, filename) => { const event = p.waitForEvent('download', { timeout: 30000 }); await p.locator('#' + id).evaluate(n => n.click()); const downloaded = await event, path = `${output}/${label}-${filename}.gif`; await downloaded.saveAs(path); const bytes = await readFile(path); return { path, size: bytes.length, width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8), frames: gifImages(bytes) }; };
  try {
   await p.goto(base + '/draw/', { waitUntil: 'domcontentloaded' }); await ready(); await p.waitForTimeout(200);
   const initialRequests = [...new Set(requests)].sort(), deferred = ['audio-core.mjs', 'pxd-puzzles.mjs', 'puzzle-share-client.mjs', 'animated-export.mjs', 'draw-import.mjs'];
   for (const file of deferred) assert.ok(!initialRequests.some(path => path.endsWith('/' + file)), `${file} deferred until use`);
   checks.push('fresh Draw startup does not fetch audio engine, puzzle engines, image decoder or GIF encoder');
   const fixture = await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d'), image = x.createImageData(16, 16), colors = [[231,84,69,255],[76,130,195,255],[109,155,104,255]]; for (let y = 3; y < 7; y++) for (let col = 2; col < 8; col++) if ((col + y) % 3) image.data.set(colors[(col + y) % 3], (y * 16 + col) * 4); image.data.set(colors[0], (2 * 16 + 2) * 4); x.putImageData(image, 0, 0); return { png: c.toDataURL('image/png').split(',')[1], rgba: [...image.data] }; });
   const path = `${output}/${label}-source.png`; await writeFile(path, Buffer.from(fixture.png, 'base64')); await p.locator('#draw-import-file').setInputFiles(path); await p.waitForFunction(() => !document.querySelector('#draw-import-local').disabled && document.querySelector('#draw-canvas').width === 16 && document.querySelector('#draw-canvas').getContext('2d').getImageData(2, 2, 1, 1).data[0] === 231); assert.deepEqual(await rgba(), fixture.rgba); assert.ok(requests.some(path => path.endsWith('/draw-import.mjs')));
   const imported = await save(); assert.deepEqual(imported.palette.map(hex => hex.replace(/ff$/i, '').toLowerCase()).sort(), ['#e75445','#4c82c3','#6d9b68'].sort()); checks.push('real PNG setInputFiles loads deferred decoder and preserves exact pixels and palette');
   await p.locator('.draw-color[data-color-index="0"]').click(); await p.locator('#draw-canvas').focus(); await p.keyboard.press('b'); await tap(10, 10); await tap(11, 11); const timeline = await gif('draw-timelapse', 'timelapse'); assert.ok(timeline.frames >= 2); assert.ok(timeline.size > 32); if (await p.locator('.px-tool-result__return').isVisible()) await p.locator('.px-tool-result__return').click(); assert.ok(requests.some(path => path.endsWith('/animated-export.mjs'))); checks.push('drawing history downloads a real GIF89a timelapse with multiple frames under current free-tool rules');
   await command('animation.addBlankFrame'); await tap(12, 12); const animation = await gif('draw-animation-export', 'two-frames'); assert.equal(animation.frames, 2); assert.equal(animation.width, 1024); assert.equal(animation.height, 1024); checks.push('two distinct animation frames download a real two-image GIF89a');
   const before = await rgba(), saved = await save(); assert.equal(saved.frames, 2); await p.screenshot({ path: `${output}/${label}-lazy-features.png` }); await p.reload({ waitUntil: 'domcontentloaded' }); await ready(); assert.deepEqual(await rgba(), before); assert.equal((await save()).frames, 2); checks.push('PXD saved to isolated project store restores exact current pixels and both frames on same-URL reload');
   assert.deepEqual(errors, []); results.push({ variant, checks, errors, initialRequests, allRequests: [...new Set(requests)].sort(), timeline, animation }); console.log('PASS', label, checks.length, 'lazy feature groups');
  } catch (e) { await p.screenshot({ path: `${output}/${label}-failure.png` }).catch(() => {}); throw e; } finally { await context.close(); }
 }
 const files = ['draw/index.html','js/creation/draw-entry.mjs','js/creation/draw-page.mjs','js/creation/project-components.mjs','js/creation/tool-project-import.mjs','scripts/draw-lazy-features-browser-harness.mjs'];
 const sourceHashes = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
 await writeFile(`${output}/results.json`, JSON.stringify({ results, sourceHashes }, null, 2));
} finally { await browser.close(); }
