/** Selection transactions through real UI, mouse/keyboard and native virtual touch input. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createAnimation, writeAnimationCel } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_SELECTION_OUTPUT || '/tmp/pixieed-draw-selection-transform-20261006';
await mkdir(output, { recursive: true });
let fixture = createAnimation({ width: 16, height: 16, palette: ['#e75445', '#4c82c3', '#6d9b68'] });
const source = [0, 1, -1, 2, -1, 0, -1, -1, 2, -1, 1, 0], indices = Array(256).fill(-1);
for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) { indices[(y + 4) * 16 + x + 3] = source[y * 4 + x]; indices[(y + 4) * 16 + x + 9] = 2; }
fixture = writeAnimationCel(fixture, fixture.frames[0].id, fixture.layers[0].id, { width: 16, height: 16, pixels: indices.map(v => v + 1) });
await writeFile(`${output}/source.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), fixture)));
let alternate = createAnimation({ width: 16, height: 16, palette: ['#ffffff', '#000000'] });
alternate = writeAnimationCel(alternate, alternate.frames[0].id, alternate.layers[0].id, { width: 16, height: 16, pixels: Array(256).fill(1) });
await writeFile(`${output}/alternate.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), alternate)));
for (const count of [31, 32]) {
 let limited = createAnimation({ width: 16, height: 16, palette: Array.from({ length: count }, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`) });
 const { addAnimationFrame } = await import('../js/creation/animation-core.mjs'); limited = addAnimationFrame(limited, { copy: false });
 limited = writeAnimationCel(limited, limited.frames[1].id, limited.layers[0].id, { width: 16, height: 16, pixels: Array.from({ length: 256 }, (_, i) => i < 31 ? i + 1 : 0) });
 await writeFile(`${output}/limit-${count}.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), limited)));
}
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch(), results = [];
try {
 for (const variant of [{ width: 320, height: 568, os: 'mac' }, { width: 390, height: 844, os: 'windows' }, { width: 1280, height: 800, os: 'mac' }, { width: 844, height: 390, os: 'windows' }]) {
  const context = await browser.newContext({ viewport: variant, hasTouch: true }), p = await context.newPage(), errors = [], checks = [];
  if (variant.os === 'windows') await context.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'platform', { configurable: true, get: () => 'Win32' });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => ({ platform: 'Windows' }) });
  });
  await context.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
  p.on('pageerror', e => errors.push(e.message)); p.setDefaultTimeout(10000);
  const mod = variant.os === 'mac' ? 'Meta' : 'Control';
  const rgba = () => p.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
  const pixel = (data, x, y) => data.slice((y * 16 + x) * 4, (y * 16 + x) * 4 + 4);
  const point = async (x, y) => { const r = await p.locator('#draw-canvas').boundingBox(); return { x: r.x + x * r.width / 16, y: r.y + y * r.height / 16 }; };
  const drag = async (from, to) => { const a = await point(...from), b = await point(...to); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(50); };
  const select = async () => { await p.locator('#draw-canvas').focus(); await p.keyboard.press('Escape'); await p.keyboard.press('v'); await drag([3.5, 4.5], [6.5, 6.5]); };
  const openPanel = async () => { if (!await p.locator('#draw-selection-panel').isVisible()) await p.locator('#draw-selection-open').click(); };
  const action = async name => { await openPanel(); await p.locator(`[data-selection-action="${name}"]`).click(); await p.waitForTimeout(50); };
  const stored = async () => p.evaluate(async () => {
    const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs?rev=20261001-free-tools-1');
    const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs'); const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs');
    const ref = JSON.parse(localStorage.getItem('pixieed:pxd:last:draw')); const a = await readPxdAnimation(await createToolProjectStore('draw').load(ref.projectId, ref.revisionId));
    return getAnimationCelDocument(a, a.frames[0].id, a.layers[0].id);
  });
  const saveWithoutPointer = async () => { await p.locator('#pxd-save').evaluate(n => n.click()); await p.waitForFunction(() => !document.querySelector('#main').inert && !document.querySelector('#pxd-save').disabled); return stored(); };
  const undo = async () => { await p.locator('#draw-canvas').focus(); await p.keyboard.press(`${mod}+z`); await p.waitForTimeout(40); };
  const command = async id => {
    if (await p.locator('#draw-selection-panel').isVisible()) { const r = await p.locator('.draw-board').boundingBox(); await p.mouse.click(r.x + 2, r.y + 5); }
    await p.locator('#draw-settings-summary').click(); await p.locator('#draw-shortcuts-open').click(); await p.locator(`[data-command-run="${id}"]`).click(); await p.waitForTimeout(40);
  };
  const load = async (name, count) => {
   await p.locator('#project-open').click(); await p.locator('#project-tab-library').click(); await p.locator('.project-imports > summary').click(); await p.locator('#pxd-file-input').setInputFiles(`${output}/${name}.pxd`);
   await p.waitForFunction(n => document.querySelectorAll('#draw-palette [data-color-index]').length === n && !document.querySelector('#main').inert, count + 1);
   if (await p.locator('#pxd-panel').evaluate(n => n.open)) await p.locator('#project-close').click();
  };
  try {
   await p.goto(`${base}/draw/`); await p.waitForFunction(() => !document.querySelector('#main').inert);
   await p.locator('#project-open').click(); await p.locator('#project-tab-library').click(); await p.locator('.project-imports > summary').click(); await p.locator('#pxd-file-input').setInputFiles(`${output}/source.pxd`);
   await p.waitForFunction(() => document.querySelectorAll('#draw-palette [data-color-index]').length === 4 && !document.querySelector('#main').inert);
   if (await p.locator('#pxd-panel').evaluate(n => n.open)) await p.locator('#project-close').click();
   const initial = await rgba(), rects = await p.locator('.draw-board, #draw-canvas, .draw-controls, #draw-virtual-controls').evaluateAll(ns => ns.map(n => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
   await select(); assert.deepEqual(await rgba(), initial);
   await openPanel(); const panel = await p.locator('#draw-selection-panel').boundingBox(); assert.ok(panel.x >= 0 && panel.x + panel.width <= variant.width + 1); assert.ok(panel.y >= 0 && panel.y + panel.height <= variant.height + 1);
   if (variant.width < variant.height) { const boardBox = await p.locator('.draw-board').boundingBox(); assert.ok(panel.y >= boardBox.y + boardBox.height / 2, 'portrait sheet leaves the upper half of the drawing viewport visible'); }
   assert.deepEqual(await p.locator('.draw-board, #draw-canvas, .draw-controls, #draw-virtual-controls').evaluateAll(ns => ns.map(n => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })), rects);
   await p.screenshot({ path: `${output}/${variant.width}x${variant.height}-selection-panel.png` }); await action('close'); checks.push('selection sheet fits screen and leaves viewport/control rectangles unchanged');
   await p.locator('#draw-canvas').focus(); await p.keyboard.press(`${mod}+c`);
   await p.keyboard.down('Alt'); await drag([4.5, 6.3], [10.5, 6.3]); await p.keyboard.up('Alt'); const moved = await rgba();
   await p.screenshot({ path: `${output}/${variant.width}x${variant.height}-move-preview.png` });
   assert.equal(pixel(moved, 3, 4)[3], 0); assert.deepEqual(pixel(moved, 11, 4), pixel(initial, 11, 4)); assert.deepEqual(pixel(moved, 9, 4), pixel(initial, 3, 4));
   assert.deepEqual((await saveWithoutPointer()).pixels, indices, 'saving while floating persists only the committed document');
   assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'), 'true');
   await p.locator('#draw-canvas').focus(); await p.keyboard.press('Enter'); assert.deepEqual(await rgba(), moved); await undo(); assert.deepEqual(await rgba(), initial);
   checks.push('real mouse move protects holes; preview excluded from PXD save; confirm is one Undo');
   await select(); await drag([7.02, 7.02], [9.12, 8.07]); await openPanel();
   assert.equal(await p.locator('#draw-selection-width').inputValue(), '6'); assert.equal(await p.locator('#draw-selection-height').inputValue(), '5');
   await p.locator('#draw-selection-width').fill('2'); await p.locator('#draw-selection-width').press('Tab');
   await p.locator('#draw-selection-width').fill('4'); await p.locator('#draw-selection-width').press('Tab'); await p.waitForTimeout(50); assert.deepEqual(await rgba(), initial);
   await action('cancel'); checks.push('corner resize preserves source ratio and nearest down/up previews recover original pixels');
   for (let turn = 0; turn < 4; turn++) await action('rotate-right'); assert.deepEqual(await rgba(), initial);
   for (const flip of ['flip-x', 'flip-y']) { await action(flip); await action(flip); assert.deepEqual(await rgba(), initial); }
   await action('rotate-left'); await action('confirm'); assert.notDeepEqual(await rgba(), initial); await undo(); assert.deepEqual(await rgba(), initial);
   checks.push('four 90-degree turns and double flips are exact; rotation confirm/Undo is atomic');
   await select(); await action('cut'); const cut = await rgba(); assert.equal(pixel(cut, 3, 4)[3], 0);
   await action('paste'); await action('close'); assert.deepEqual(await rgba(), cut); await undo(); assert.deepEqual(await rgba(), initial);
   checks.push('Cut immediately deletes opaque source; Paste cancel leaves Cut; Undo restores Cut');
   await select(); await p.locator('#draw-canvas').focus(); await p.keyboard.press(`${mod}+v`); await p.keyboard.press('Shift+ArrowRight'); await undo(); assert.deepEqual(await rgba(), initial); assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'), 'false');
   checks.push('platform clipboard shortcuts and pending Undo cancel without changing document');
   await select(); for (let i = 0; i < 4; i++) { await p.locator('#draw-canvas').focus(); await p.keyboard.press('Shift+ArrowRight'); }
   await p.keyboard.press('Enter'); assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'), 'true'); await action('cancel'); assert.deepEqual(await rgba(), initial);
   checks.push('wholly outside confirm refused; cancel keeps original artwork');
   await select(); await action('rotate-right'); await p.evaluate(() => dispatchEvent(new Event('blur'))); assert.deepEqual(await rgba(), initial); assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'), 'false');
   await select(); await action('rotate-right'); await command('animation.addBlankFrame'); assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'), 'false'); await undo(); assert.deepEqual(await rgba(), initial);
   checks.push('blur and frame change discard floating transforms rather than applying to another cel');
   await command('animation.toggleLayerLock'); await select(); await openPanel(); assert.equal(await p.locator('[data-selection-action="copy"]').isEnabled(), true); for (const a of ['cut', 'paste', 'rotate-right', 'flip-x']) assert.equal(await p.locator(`[data-selection-action="${a}"]`).isEnabled(), false); await action('copy'); await action('close'); await command('animation.toggleLayerLock');
   checks.push('locked layer can be selected/copied; all modifying selection actions disabled');
   await select(); await openPanel(); const keyGuard = await p.locator('#draw-selection-width').evaluate((n, os) => { const e = new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: os === 'windows', metaKey: os === 'mac', bubbles: true, cancelable: true }); n.dispatchEvent(e); return e.defaultPrevented; }, variant.os); assert.equal(keyGuard, false); await action('close');
   checks.push('selection number fields retain native clipboard key behavior');
   await select(); await p.locator('#draw-canvas').focus(); await p.keyboard.press(`${mod}+c`);
   await p.locator('.draw-color[data-color-index="0"]').click(); await command('open.colorEditor');
   await p.locator('#dce-h').evaluate(n => { n.value = '150'; n.dispatchEvent(new Event('input', { bubbles: true })); }); await p.locator('#dce-done').click();
   const recolored = await rgba(); assert.notDeepEqual(pixel(recolored, 3, 4), pixel(initial, 3, 4));
   await p.locator('#draw-canvas').focus(); await p.keyboard.press(`${mod}+v`); await p.waitForTimeout(50); assert.deepEqual(pixel(await rgba(), 6, 6), pixel(initial, 3, 4));
   await p.keyboard.press('Enter'); const palettePaste = await saveWithoutPointer(); assert.equal(palettePaste.palette.length, 4); assert.equal(palettePaste.palette.at(-1), '#e75445');
   await undo(); assert.deepEqual(await rgba(), recolored); await undo(); assert.deepEqual(await rgba(), initial);
   checks.push('copy retains original RGB after source palette editing; paste adds exact color; pixels + palette share one Undo');
   await saveWithoutPointer(); await load('alternate', 2); const alternateBefore = await rgba();
   await p.locator('#draw-canvas').focus(); await p.keyboard.press(`${mod}+v`); await p.waitForTimeout(50);
   assert.deepEqual(pixel(await rgba(), 6, 6), pixel(initial, 3, 4)); assert.deepEqual(pixel(await rgba(), 8, 6), [255, 255, 255, 255]);
   await p.keyboard.press('Enter'); const cross = await saveWithoutPointer(); assert.equal(cross.palette.length, 5); await undo(); assert.deepEqual(await rgba(), alternateBefore);
   checks.push('clipboard survives project switch; exact cross-palette colors append without replacing destination holes; atomic Undo');
   await saveWithoutPointer();
   await load('source', 3); await p.locator('#draw-canvas').focus(); await p.keyboard.press('v'); await drag([3.5, 4.5], [3.5, 4.5]); await p.keyboard.press(`${mod}+c`);
   for (const count of [31, 32]) {
    await load(`limit-${count}`, count); const limitBefore = await rgba(); await p.locator('#draw-canvas').focus(); await p.keyboard.press(`${mod}+v`); await p.waitForTimeout(50); await p.keyboard.press('Enter');
    assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'), 'true'); await openPanel(); assert.match(await p.locator('[data-selection-status]').textContent(), count === 31 ? /使用色/ : /パレット/);
    const unchanged = await saveWithoutPointer(); assert.equal(unchanged.palette.length, count); assert.ok(unchanged.pixels.every(v => v === -1)); await action('close'); assert.deepEqual(await rgba(), limitBefore);
   }
   checks.push('both global usage cap including transparency/other frame and palette capacity reject before any saved mutation');
   await load('source', 3); await select(); await p.locator('#draw-canvas').focus(); await p.keyboard.press(`${mod}+c`);
   // All-transparent Copy must retain the previous nonempty clipboard.
   await p.keyboard.press('Escape'); await drag([0.5, .5], [1.5, 1.5]); await p.keyboard.press(`${mod}+c`); await p.keyboard.press('Escape'); await p.keyboard.press(`${mod}+v`); await p.waitForTimeout(50); assert.deepEqual(pixel(await rgba(), 6, 6), pixel(initial, 3, 4)); await p.keyboard.press('Escape');
   checks.push('all-transparent Copy is a no-op and preserves the prior clipboard');
   await saveWithoutPointer(); const savedOriginal = await stored(); await p.reload(); await p.waitForFunction(() => !document.querySelector('#main').inert); assert.deepEqual(await rgba(), initial); assert.deepEqual((await stored()).pixels, savedOriginal.pixels);
   checks.push('PXD-backed save/reload preserves committed artwork; clipboard intentionally clears on reload');
   await select(); await command('toggle.virtualCursor');
   const cdp = await context.newCDPSession(p), touch = async (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(q => ({ ...q, radiusX: 1, radiusY: 1, force: 1 })) });
   await command('tool.left.select'); await command('tool.right.select'); await p.locator('#draw-canvas').focus(); await p.keyboard.press('Escape');
   // Virtual arrows move the hotspot; Enter creates a rectangle using the same logical input path.
   const logical = () => p.evaluate(() => { const m = document.querySelector('.draw-virtual-marker'), c = document.querySelector('#draw-canvas'); const a = m.getBoundingClientRect(), r = c.getBoundingClientRect(); return { x: Math.floor((a.x + a.width / 2 - r.x) * 16 / r.width), y: Math.floor((a.y + a.height / 2 - r.y) * 16 / r.height) }; });
   const nudgeTo = async (x, y) => { await p.locator('#draw-canvas').focus(); const v = await logical(); for (let i = 0; i < Math.abs(x - v.x); i++) await p.keyboard.press(x < v.x ? 'ArrowLeft' : 'ArrowRight'); for (let i = 0; i < Math.abs(y - v.y); i++) await p.keyboard.press(y < v.y ? 'ArrowUp' : 'ArrowDown'); };
   await nudgeTo(3, 4); await p.keyboard.down('Enter'); await nudgeTo(6, 6); await p.keyboard.up('Enter');
   const virtualInitial = await rgba(); await nudgeTo(4, 6);
   for (const side of ['left', 'right']) {
     const r = await p.locator(`[data-virtual-${side}]`).boundingBox(), pad = await point(8.5, 8.5), press = { id: 11, x: r.x + r.width / 2, y: r.y + r.height / 2 }, second = { id: 22, ...pad };
     await p.keyboard.down('Alt'); await touch('touchStart', [press]); await touch('touchStart', [press, second]); await touch('touchMove', [press, { ...second, x: second.x + 20 }]); await touch('touchEnd', [press]); await touch('touchEnd', []); await p.keyboard.up('Alt'); await p.waitForTimeout(50);
     assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'), 'true'); assert.equal(await p.locator(`[data-virtual-${side}]`).getAttribute('aria-pressed'), 'false');
     await p.locator('#draw-canvas').focus(); await p.keyboard.press('Escape'); assert.deepEqual(await rgba(), virtualInitial); await nudgeTo(4, 6);
   }
   checks.push('native two-pointer pad movement with independent virtual left/right selection bindings; release and Escape restore pixels');
   await nudgeTo(4, 6);
   const leftBox = await p.locator('[data-virtual-left]').boundingBox(), padPoint = await point(8.5, 8.5);
   const held = { id: 31, x: leftBox.x + leftBox.width / 2, y: leftBox.y + leftBox.height / 2 }, padTouch = { id: 42, ...padPoint };
   await p.keyboard.down('Alt'); await touch('touchStart', [held]); await touch('touchStart', [held, padTouch]); await touch('touchMove', [held, { ...padTouch, x: padTouch.x + 25 }]); await touch('touchCancel', []); await p.keyboard.up('Alt'); await p.waitForTimeout(50);
   assert.equal(await p.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false'); assert.deepEqual(await rgba(), virtualInitial);
   await p.locator('#draw-canvas').focus(); await p.keyboard.press('Escape');
   checks.push('native pointercancel releases held click and discards the current transform gesture without document/history mutation');
   assert.deepEqual(errors, []); results.push({ variant, checks, errors }); console.log(`PASS ${variant.width}x${variant.height}/${variant.os}: ${checks.length} selection groups`);
  } catch (error) { await p.screenshot({ path: `${output}/${variant.width}x${variant.height}-failure.png` }).catch(() => {}); throw error; }
  finally { await context.close(); }
 }
 await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
