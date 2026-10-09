/** Browser regression harness for Draw's non-rectangular same-color selection. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createAnimation, writeAnimationCel, addAnimationFrame, addAnimationLayer } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'harness is restricted to the local app');
const output = process.env.PIXIEED_COLOR_SELECTION_OUTPUT || '/tmp/pixieed-draw-color-selection-20261007';
await mkdir(output, { recursive: true });
const W = 16, H = 16;
// Disconnected red islands use equivalent duplicate palette slots. Frame two also has an empty cel.
let animation = createAnimation({ width: W, height: H, palette: ['#ff1608', '#ff1608ff', '#39bd51', '#174be8'] });
let background = Array(W * H).fill(3);
animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, { width: W, height: H, pixels: background });
animation = addAnimationLayer(animation, { name: 'Active top' });
let top = Array(W * H).fill(0);
for (const [x, y, slot] of [[3, 4, 1], [4, 4, 1], [3, 5, 1], [11, 10, 2], [12, 10, 2], [11, 11, 2]]) top[y * W + x] = slot;
animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[1].id, { width: W, height: H, pixels: top });
animation = addAnimationFrame(animation, { copy: false });
background = Array(W * H).fill(4);
animation = writeAnimationCel(animation, animation.frames[1].id, animation.layers[0].id, { width: W, height: H, pixels: background });
await writeFile(`${output}/source.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), animation)));

const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/tmp/pixieed-camera-playwright/node_modules/playwright/index.mjs';
const { chromium, webkit } = await import(pathToFileURL(playwrightPath).href);
const viewports = [{ width: 320, height: 568, dpr: 2 }, { width: 390, height: 844, dpr: 3 }, { width: 844, height: 390, dpr: 2 }, { width: 1280, height: 800, dpr: 1 }];
const engines = process.env.PIXIEED_BROWSER_ENGINES?.split(',') || ['chromium', 'webkit'];
const engineMatch = process.env.PIXIEED_BROWSER_ENGINE_MATCH;
const viewportMatch = process.env.PIXIEED_BROWSER_VIEWPORT_MATCH;
const results = [], failures = [];

for (const engineName of engines) {
  if (engineMatch && !engineName.includes(engineMatch)) continue;
  let browser;
  try {
    const engine = ({ chromium, webkit })[engineName]; assert.ok(engine, `unknown engine ${engineName}`);
    const webkitPath = process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh';
    browser = await engine.launch(engineName === 'webkit' && existsSync(webkitPath) ? { executablePath: webkitPath } : {});
  } catch (error) { failures.push({ engine: engineName, scenario: 'launch', error: error.stack }); console.error('LAUNCH FAIL', engineName, error.message); continue; }
  try {
    for (const viewport of viewports) {
      if (viewportMatch && !`${viewport.width}x${viewport.height}`.includes(viewportMatch)) continue;
      const label = `${engineName}-${viewport.width}x${viewport.height}-dpr${viewport.dpr}`;
      const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.dpr, hasTouch: true, acceptDownloads: true });
      const page = await context.newPage(), checks = [], errors = [];
      page.setDefaultTimeout(9000); page.on('pageerror', error => errors.push(error.message));
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
      await page.addInitScript(() => {
        // Any accidental media request fails immediately; this harness never opens capture hardware.
        window.__forbiddenMediaGuard = { calls: 0 };
        const forbidden = { getUserMedia: () => { window.__forbiddenMediaGuard.calls++; return Promise.reject(new Error('Draw selection harness forbids media access')); } };
        try { Object.defineProperty(Navigator.prototype, 'mediaDevices', { configurable: true, get: () => forbidden }); }
        catch { Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: forbidden }); }
      });
      const celSnapshot = () => page.evaluate(async () => {
        const { createToolProjectStore } = await import('/js/creation/tool-project-store.mjs');
        const { readPxdAnimation } = await import('/js/creation/pxd-animation.mjs');
        const { getAnimationCelDocument } = await import('/js/creation/animation-core.mjs');
        const ref = JSON.parse(localStorage.getItem('pixieed:pxd:last:draw'));
        const project = await createToolProjectStore('draw').load(ref.projectId, ref.revisionId), animation = await readPxdAnimation(project);
        const editor = project.manifest?.editorState?.draw;
        return { palette: animation.palette, frames: animation.frames, layers: animation.layers,
          activeFrame: animation.frames.findIndex(frame => frame.id === editor?.frameId), activeLayer: animation.layers.findIndex(layer => layer.id === editor?.layerId),
          cels: animation.frames.map(frame => animation.layers.map(layer => [...getAnimationCelDocument(animation, frame.id, layer.id).pixels])) };
      });
      const rgba = () => page.locator('#draw-canvas').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]);
      const point = async (x, y) => { const rect = await page.locator('#draw-canvas').boundingBox(); return { x: rect.x + (x + .5) * rect.width / W, y: rect.y + (y + .5) * rect.height / H }; };
      const clickCell = async (x, y) => { const p = await point(x, y); await page.mouse.click(p.x, p.y); };
      const maskAlpha = (x, y) => page.locator('.draw-selection-mask').evaluate((canvas, p) => canvas.hidden ? 0 : canvas.getContext('2d').getImageData(p.x * 4 + 1, p.y * 4 + 1, 1, 1).data[3], { x, y });
      const dragCells = async (x1, y1, x2, y2) => { const a = await point(x1, y1), b = await point(x2, y2); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(60); };
      const setMode = async mode => {
        const picker = page.locator('#draw-tool-picker'); if (!await picker.evaluate(node => node.open)) await page.locator('#draw-tool-summary').click();
        const button = page.locator(`.draw-select-tool-modes [data-selection-mode="${mode}"]`); await button.waitFor({ state: 'visible' }); await button.click();
        await page.waitForFunction(value => document.querySelector(`.draw-select-tool-modes [data-selection-mode="${value}"]`)?.getAttribute('aria-pressed') === 'true', mode);
      };
      const setTool = async () => { await page.locator('#draw-canvas').focus(); await page.keyboard.press('Escape'); await setMode('rectangle'); };
      const selectDifferentPaletteColor = async () => {
        const colorIndex = await page.locator('#draw-palette .draw-color[data-color-index]').evaluateAll(nodes => {
          const opaque = nodes.filter(node => Number(node.dataset.colorIndex) >= 0);
          const selected = opaque.find(node => node.getAttribute('aria-pressed') === 'true')?.dataset.colorIndex;
          return Number(opaque.find(node => node.dataset.colorIndex !== selected)?.dataset.colorIndex);
        });
        await page.locator(`#draw-palette .draw-color[data-color-index="${colorIndex}"]`).click();
      };
      const saveCels = async () => { await page.locator('#pxd-save').evaluate(node => node.click()); await page.waitForFunction(() => !document.querySelector('#main')?.inert); return celSnapshot(); };
      const command = async id => {
        const settings = page.locator('#draw-settings-picker'); if (!await settings.evaluate(node => node.open)) await page.locator('#draw-settings-summary').click();
        await page.locator('#draw-shortcuts-open').click(); await page.locator(`[data-command-run="${id}"]`).click(); await page.waitForTimeout(50);
      };
      const loadFixture = async () => {
        await page.locator('#project-open').click(); await page.locator('#project-tab-library').click();
        const imports = page.locator('.project-imports'); if (!await imports.evaluate(node => node.open)) await imports.locator(':scope > summary').click();
        await page.locator('#pxd-file-input').setInputFiles(`${output}/source.pxd`);
        await page.waitForFunction(() => !document.querySelector('#main')?.inert && document.querySelectorAll('#draw-palette [data-color-index]').length === 5);
        if (await page.locator('#pxd-panel').evaluate(node => node.open)) await page.locator('#project-close').click();
      };
      const group = async (name, callback) => {
        if (process.env.PIXIEED_COLOR_SELECTION_GROUP_MATCH && !name.includes(process.env.PIXIEED_COLOR_SELECTION_GROUP_MATCH)) return;
        try { await callback(); checks.push(name); console.log('PASS', label, name); }
        catch (error) { failures.push({ engine: engineName, viewport, name, error: error.stack }); console.error('FAIL', label, name, error.message); await page.screenshot({ path: `${output}/${label}-${name.replace(/[^a-z0-9]+/gi, '-')}-failure.png` }).catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); }
      };
      try {
        await page.goto(`${base}/draw/`);
        await page.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main')?.inert);
        await loadFixture();
        await group('disconnected same-visible-color islands and duplicate palette slots', async () => {
          await setTool(); await setMode('color'); const before = await saveCels();
          await clickCell(3, 4);
          assert.ok(await maskAlpha(3, 4) > 0 && await maskAlpha(11, 10) > 0, 'both disconnected red islands are selected across duplicate palette slots');
          assert.equal(await maskAlpha(0, 0), 0, 'transparent active-cel cells stay outside an opaque color selection');
          const activeMask = [...(await page.locator('.draw-selection-mask').evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data]))];
          assert.ok(activeMask.length > 0); await page.screenshot({ path: `${output}/${label}-disconnected-mask.png` });
          assert.equal(before.activeFrame, 0); assert.equal(before.activeLayer, 1);
          await page.locator('#draw-tool-picker').evaluate(node => { node.open = true; });
          const modeLabels = await page.locator('.draw-select-tool-modes [data-tool-label]').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, rect: node.getBoundingClientRect().toJSON() })));
          assert.equal(modeLabels.length, 2); assert.notEqual(modeLabels[0].text, modeLabels[1].text);
          for (const item of modeLabels) assert.ok(item.rect.width > 1 && item.rect.height > 1 && item.rect.x >= 0 && item.rect.x + item.rect.width <= viewport.width);
          await page.locator('#draw-tool-picker').evaluate(node => { node.open = false; });
        });
        await group('selection mask remains fixed after palette changes and limits pen strokes', async () => {
          await loadFixture(); await setTool(); await setMode('color'); await clickCell(3, 4);
          const beforeMask = await maskAlpha(11, 10); assert.ok(beforeMask > 0);
          await page.locator('.draw-color[data-color-index="0"]').click(); await command('open.colorEditor');
          await page.locator('#dce-h').evaluate(node => { node.value = '150'; node.dispatchEvent(new Event('input', { bubbles: true })); }); await page.locator('#dce-done').click();
          const recolored = await saveCels(); assert.notDeepEqual(recolored.palette, animation.palette, 'the palette changed after the selection snapshot');
          assert.ok(await maskAlpha(11, 10) > 0, 'selection membership did not recompute after recoloring');
          await selectDifferentPaletteColor(); await page.locator('#draw-canvas').focus(); await page.keyboard.press('b');
          const before = await saveCels(), outside = before.cels[0][1][0], inside = before.cels[0][1][4 * 16 + 3];
          await clickCell(0, 0); await clickCell(3, 4); const after = await saveCels();
          assert.equal(after.cels[0][1][0], outside, 'pen input outside the original mask is ignored');
          assert.notEqual(after.cels[0][1][4 * 16 + 3], inside, 'pen input inside the original mask is accepted');
          assert.deepEqual(after.cels[0][0], before.cels[0][0]); assert.deepEqual(after.cels[1], before.cels[1]);
        });
        await group('mask rotation and copy paste preserve transparent holes', async () => {
          await loadFixture(); await setTool(); await setMode('color'); await clickCell(3, 4); const original = await saveCels();
          await command('selection.rotateRight'); assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true');
          const selectedCount = await page.locator('.draw-selection-mask').evaluate(canvas => { const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; let count = 0; for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (data[((y * 4 + 1) * canvas.width + x * 4 + 1) * 4 + 3] > 0) count++; return count; });
          assert.equal(selectedCount, 6, 'quarter turn retains exactly six selected cells before deselection');
          const pending = await rgba(); await clickCell(0, 0);
          assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'false', 'outside tap confirms the pending transform');
          assert.equal(await page.locator('.draw-selection-mask').evaluate(canvas => canvas.hidden), true, 'select-tool outside tap also deselects');
          const rotated = await saveCels();
          assert.notDeepEqual(rotated.cels[0][1], original.cels[0][1], 'the saved document contains the confirmed turn');
          assert.deepEqual(await rgba(), pending, 'outside tap retains all transformed preview pixels');
          await page.locator('#draw-undo').click(); assert.deepEqual((await saveCels()).cels[0][1], original.cels[0][1], 'one undo restores the artwork before the transform');
          await loadFixture(); await setTool(); await setMode('color'); await clickCell(3, 4); const before = await saveCels();
          await page.locator('[data-selection-action="copy"]').click(); await page.locator('[data-selection-action="paste"]').click();
          await page.locator('#draw-selection-x').evaluate(node => { node.value = '4'; node.dispatchEvent(new Event('change', { bubbles: true })); });
          await page.locator('[data-selection-action="confirm"]').click(); const pasted = await saveCels(), expected = [...before.cels[0][1]];
          for (let index = 0; index < 256; index++) if (before.cels[0][1][index] >= 0 && index % 16 + 1 < 16) expected[index + 1] = before.palette.findLastIndex(color => color.slice(0, 7).toLowerCase() === '#ff1608');
          assert.deepEqual(pasted.cels[0][1], expected, 'paste writes opaque source cells and leaves transparent destination holes intact');
          assert.deepEqual(pasted.cels[0][0], before.cels[0][0]); assert.deepEqual(pasted.cels[1], before.cels[1]); assert.deepEqual(pasted.palette, before.palette);
        });
        await group('pending transform blocks mode change; transparent copy and cut leave artwork unchanged', async () => {
          await loadFixture(); await setTool(); await setMode('rectangle'); await dragCells(3, 4, 7, 8);
          const rect = await page.locator('#draw-canvas').boundingBox(), start = { x: rect.x + rect.width * 4 / 16, y: rect.y + rect.height * 5 / 16 }, end = { x: rect.x + rect.width * 5 / 16, y: rect.y + rect.height * 5 / 16 };
          await page.keyboard.down('Alt'); await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 3 }); await page.mouse.up(); await page.keyboard.up('Alt');
          assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true');
          await page.locator('#draw-tool-picker').evaluate(node => { node.open = true; });
          await page.locator('.draw-select-tool-modes [data-selection-mode="color"]').click(); await page.waitForTimeout(50);
          assert.equal(await page.locator('[data-selection-mode="rectangle"]').getAttribute('aria-pressed'), 'true');
          assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true', 'refused mode change retains pending transform');
          await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
          await loadFixture(); await setTool(); await setMode('color'); await clickCell(0, 0); const before = await rgba();
          for (const action of ['copy', 'cut']) { const button = page.locator(`#draw-selection-controls [data-selection-action="${action}"]`); if (await button.count() && await button.isEnabled()) await button.click(); assert.deepEqual(await rgba(), before, `transparent ${action} leaves artwork unchanged`); }
        });
        await group('right-button and virtual cursor use the same color-selection path', async () => {
          await loadFixture(); await setTool(); await setMode('color'); await page.locator('#draw-tool-picker').evaluate(node => { node.open = true; });
          const mode = page.locator('.draw-select-tool-modes [data-selection-mode="color"]'); await mode.scrollIntoViewIfNeeded(); const rect = await mode.boundingBox();
          await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2, { button: 'right' }); await page.waitForTimeout(60);
          assert.equal(await page.locator('[data-virtual-right]').getAttribute('data-tool'), 'select', 'right binding receives selection tool');
          const p = await point(3, 4); await page.mouse.move(p.x, p.y); await page.mouse.down({ button: 'right' }); await page.mouse.move(p.x + 1, p.y + 1);
          assert.equal(await page.locator('.draw-selection-mask').evaluate(canvas => canvas.hidden), true, 'held mouse selection waits for release'); await page.mouse.up({ button: 'right' });
          assert.ok(await maskAlpha(3, 4) > 0 && await maskAlpha(11, 10) > 0, 'right-button tap selects disconnected islands');
          await page.keyboard.press('Escape'); await command('toggle.virtualCursor'); await page.locator('.draw-virtual-marker').waitFor({ state: 'visible' });
          await page.locator('#draw-canvas').focus(); for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft'); for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowUp');
          await page.keyboard.down('Enter'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowDown'); await page.keyboard.up('Enter');
          const anySelected = await page.locator('.draw-selection-mask').evaluate(canvas => !canvas.hidden && [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].some((value, i) => i % 4 === 3 && value > 100));
          assert.ok(anySelected, 'virtual cursor creates a selection mask');
        });
        await group('touch selection cancels into pinch; a completed tap selects the active cel transparency', async () => {
          await loadFixture(); if (await page.locator('.draw-virtual-marker').isVisible()) await command('toggle.virtualCursor');
          await setTool();
          for (const panel of ['#pxd-panel', '#draw-settings-picker', '#draw-tool-picker']) await page.locator(panel).evaluate(node => { if ('open' in node) node.open = false; });
          await selectDifferentPaletteColor(); await page.locator('#draw-canvas').focus(); await page.keyboard.press('b');
          await clickCell(0, 0); const before = await rgba(); assert.equal(await page.locator('#draw-undo').isEnabled(), true);
          await setMode('color'); const a = await point(1, 0), b = await point(9, 9);
          await page.evaluate(({ a, b }) => {
            const canvas = document.querySelector('#draw-canvas'), capture = canvas.setPointerCapture; canvas.setPointerCapture = () => {};
            const send = (type, pointerId, point) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: point.x, clientY: point.y }));
            try { send('pointerdown', 501, a); send('pointerdown', 502, b); send('pointerup', 501, a); send('pointerup', 502, b); } finally { canvas.setPointerCapture = capture; }
          }, { a, b });
          assert.deepEqual(await rgba(), before, 'second touch cancels a pending tap and does not undo artwork');
          assert.equal(await page.locator('.draw-selection-mask').evaluate(canvas => canvas.hidden), true, 'pinch does not make a color selection');
          await page.evaluate(p => { const canvas = document.querySelector('#draw-canvas'), capture = canvas.setPointerCapture; canvas.setPointerCapture = () => {}; try { for (const type of ['pointerdown', 'pointerup']) canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 503, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: p.x, clientY: p.y })); } finally { canvas.setPointerCapture = capture; } }, a);
          assert.ok(await maskAlpha(15, 15) > 0, 'completed touch selects matching transparent cells'); assert.equal(await maskAlpha(0, 0), 0, 'new opaque mark is excluded');
        });
        await group('empty active cel selects all transparency', async () => {
          await loadFixture(); const fixture = await celSnapshot(), launcher = page.locator('#draw-animation-controls [data-action="toggle-frames"]');
          if (await launcher.getAttribute('aria-expanded') !== 'true') await launcher.click();
          const emptyCell = page.locator(`[data-action="select-cel"][data-frame-id="${fixture.frames[1].id}"][data-layer-id="${fixture.layers[1].id}"]`); await emptyCell.waitFor({ state: 'visible' }); await emptyCell.click(); await page.waitForTimeout(60);
          await setTool(); await setMode('color'); const before = await saveCels(); assert.ok(before.cels[1][1].every(value => value === -1)); await clickCell(0, 0);
          assert.ok(await maskAlpha(15, 15) > 0, 'empty cel selects distant transparent cells across the entire canvas');
          assert.equal(before.activeFrame, 1); assert.equal(before.activeLayer, 1);
        });
        assert.equal(await page.evaluate(() => window.__forbiddenMediaGuard.calls), 0, 'no media APIs were used by the selection harness');
        if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);
      } finally { await context.close(); results.push({ engine: engineName, viewport, checks }); }
    }
  } finally { await browser.close(); }
}
const report = { base, generatedAt: new Date().toISOString(), forbiddenMediaCalls: 0, fixture: '16x16; two frames; two layers; disconnected duplicate-slot red islands; empty second-frame top cel', results, failures };
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
for (const engine of engines) await writeFile(`${output}/${engine}-report.json`, JSON.stringify({ ...report, results: results.filter(result => result.engine === engine), failures: failures.filter(failure => failure.engine === engine) }, null, 2));
console.log(JSON.stringify({ results: results.map(result => ({ engine: result.engine, viewport: `${result.viewport.width}x${result.viewport.height}`, checks: result.checks.length })), failures: failures.length, report: `${output}/report.json` }, null, 2));
if (failures.length) process.exitCode = 1;
