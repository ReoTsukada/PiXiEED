/** Browser regressions for selection modifiers and outside-pointer transactions. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createAnimation, writeAnimationCel } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'harness is restricted to the local app');
const output = process.env.PIXIEED_SELECTION_MODIFIERS_OUTPUT || '/tmp/pixieed-draw-selection-modifiers-20261009';
await mkdir(output, { recursive: true });
const W = 16, H = 16;
let animation = createAnimation({ width: W, height: H, palette: ['#f12b1c', '#2673dd'] });
const pixels = Array(W * H).fill(0);
for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4], [11, 10], [12, 10], [11, 11]]) pixels[y * W + x] = 1;
animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, { width: W, height: H, pixels });
await writeFile(`${output}/source.pxd`, await encodePxd(await writePxdAnimation(createPxdProject(), animation)));

const playwrightPath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/tmp/pixieed-camera-playwright/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(playwrightPath).href);
const browser = await chromium.launch();
const viewports = [{ width: 390, height: 844, dpr: 3 }, { width: 1280, height: 800, dpr: 1 }];
const results = [], failures = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.dpr, hasTouch: true });
    const page = await context.newPage(), checks = [], errors = [];
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const point = async (x, y) => { const r = await page.locator('#draw-canvas').boundingBox(); return { x: r.x + (x + .5) * r.width / W, y: r.y + (y + .5) * r.height / H }; };
    const drag = async (a, b) => { const p = await point(...a), q = await point(...b); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(70); };
    const tap = async (x, y) => { const p = await point(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(40); };
    const mask = async () => page.locator('.draw-selection-mask').evaluate(canvas => {
      if (canvas.hidden) {
        const frame = document.querySelector('.draw-selection'); if (frame.hidden) return null;
        const x = Number(frame.dataset.x), y = Number(frame.dataset.y), width = Number(frame.dataset.width), height = Number(frame.dataset.height), result = [];
        for (let cy = Math.max(0, Math.floor(y)); cy < Math.min(16, Math.ceil(y + height)); cy++) for (let cx = Math.max(0, Math.floor(x)); cx < Math.min(16, Math.ceil(x + width)); cx++) result.push(`${cx},${cy}`);
        return result;
      }
      const { width, height } = canvas, d = canvas.getContext('2d').getImageData(0, 0, width, height).data, result = [];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (d[((y * 4 + 1) * width + x * 4 + 1) * 4 + 3] > 0) result.push(`${x},${y}`);
      return result;
    });
    const rgba = async () => page.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
    const setMode = async mode => {
      const picker = page.locator('#draw-tool-picker'); if (!await picker.evaluate(n => n.open)) await page.locator('#draw-tool-summary').click();
      await page.locator(`.draw-select-tool-modes [data-selection-mode="${mode}"]`).click();
      await page.waitForFunction(value => document.querySelector(`.draw-select-tool-modes [data-selection-mode="${value}"]`)?.getAttribute('aria-pressed') === 'true', mode);
    };
    const loadFixture = async () => {
      await page.locator('#project-open').click(); await page.locator('#project-tab-library').click();
      const imports = page.locator('.project-imports'); if (!await imports.evaluate(n => n.open)) await imports.locator(':scope > summary').click();
      await page.locator('#pxd-file-input').setInputFiles(`${output}/source.pxd`);
      await page.waitForFunction(() => !document.querySelector('#main')?.inert && document.querySelectorAll('#draw-palette [data-color-index]').length === 3);
      if (await page.locator('#pxd-panel').evaluate(n => n.open)) await page.locator('#project-close').click();
    };
    const select = async () => { await page.locator('#draw-canvas').focus(); await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await setMode('rectangle'); await drag([2, 2], [5, 5]); };
    const pendingMove = async () => {
      const p = await point(3, 3), q = await point(8, 8);
      await page.keyboard.down('Alt'); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.mouse.up(); await page.keyboard.up('Alt');
      await page.waitForTimeout(50); assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true');
    };
    const group = async (name, fn) => {
      try { await loadFixture(); await fn(); checks.push(name); console.log('PASS', `${viewport.width}x${viewport.height}`, name); }
      catch (error) { failures.push({ viewport, name, error: error.stack }); console.error('FAIL', `${viewport.width}x${viewport.height}`, name, error.message); await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-${name.replace(/[^a-z0-9]+/gi, '-')}-failure.png` }).catch(() => {}); await page.keyboard.press('Escape').catch(() => {}); }
    };
    try {
      await page.goto(`${base}/draw/`); await page.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main')?.inert);

      await group('Shift adds and Control subtracts rectangular ranges; subtract-all removes the mask', async () => {
        await select(); const original = await mask(); assert.ok(original?.includes('3,3'));
        await page.keyboard.down('Shift'); await drag([8, 8], [9, 9]); await page.keyboard.up('Shift');
        const added = await mask(); assert.ok(added.includes('3,3') && added.includes('8,8') && added.includes('9,9'));
        await page.keyboard.down('Control'); await drag([8, 8], [9, 9]); await page.keyboard.up('Control');
        const subtracted = await mask(); assert.ok(subtracted.includes('3,3') && !subtracted.includes('8,8'));
        await page.keyboard.down('Shift'); await drag([8, 8], [9, 9]); await page.keyboard.up('Shift');
        await page.keyboard.down('Meta'); await drag([8, 8], [9, 9]); await page.keyboard.up('Meta');
        assert.ok(!(await mask()).includes('8,8'), 'Meta uses the same subtract operation as Control');
        await page.keyboard.down('Control'); await drag([2, 2], [5, 5]); await page.keyboard.up('Control');
        assert.equal(await mask(), null, 'subtracting the entire selected rectangle clears selection');
      });
      await group('all-transparent additions preserve disconnected color islands and their holes', async () => {
        await setMode('color'); await tap(3, 3); const islands = await mask();
        assert.ok(islands?.includes('3,3') && islands.includes('11,10')); assert.ok(!islands.includes('7,3'));
        await setMode('rectangle'); await page.keyboard.down('Shift'); await drag([14, 14], [15, 15]); await page.keyboard.up('Shift');
        const added = await mask(); assert.ok(added.includes('3,3') && added.includes('11,10') && added.includes('14,14') && added.includes('15,15'));
        assert.ok(!added.includes('7,3'), 'the transparent hole between color islands stays outside the mask');
        await page.keyboard.down('Control'); await drag([14, 14], [15, 15]); await page.keyboard.up('Control');
        const removed = await mask(); assert.ok(removed.includes('3,3') && removed.includes('11,10') && !removed.includes('14,14'));
      });
      await group('Alt body drag retains move behavior and select-tool outside tap commits then deselects', async () => {
        await select(); const original = await rgba(); await pendingMove();
        await tap(14, 14);
        assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'false');
        assert.equal(await page.locator('.draw-selection-mask').evaluate(c => c.hidden), true);
        const committed = await rgba(); assert.notDeepEqual(committed, original);
        await page.locator('#draw-canvas').focus(); await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`); await page.waitForTimeout(50);
        assert.deepEqual(await rgba(), original, 'one undo rolls back the outside-tap commit');
      });
      await group('outside drag replaces the selected range after resolving its pending move', async () => {
        await select(); await pendingMove(); await drag([12, 2], [14, 4]);
        const replaced = await mask(); assert.ok(replaced?.includes('12,2') && replaced.includes('14,4'));
        assert.ok(!replaced.includes('3,3') && !replaced.includes('8,8'));
        assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'false');
      });
      await group('another drawing tool keeps the selection when painting outside it', async () => {
        await select(); const selected = await mask(); await page.locator('#draw-canvas').focus(); await page.keyboard.press('b');
        await tap(14, 14); assert.deepEqual(await mask(), selected);
      });
      await group('modifier drag from inside a pending moved selection commits once; pointer cancel restores its base', async () => {
        await select(); const original = await rgba(); await pendingMove();
        const beforeMask = await mask(); assert.ok(beforeMask.includes('8,8'));
        const a = await point(8, 8), b = await point(9, 9);
        await page.keyboard.down('Control'); await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 3 });
        await page.mouse.up(); await page.keyboard.up('Control'); await page.waitForTimeout(60);
        assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'false');
        const after = await rgba(); assert.notDeepEqual(after, original);
        await page.locator('#draw-canvas').focus(); await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+z`); await page.waitForTimeout(50); assert.deepEqual(await rgba(), original, 'modifying release makes exactly one artwork history entry');
        await select(); await pendingMove(); const baseMask = await mask();
        const c = await point(8, 8), d = await point(10, 10);
        await page.evaluate(({ c, d }) => {
          const canvas = document.querySelector('#draw-canvas'), capture = canvas.setPointerCapture; canvas.setPointerCapture = () => {};
          const send = (type, p, buttons) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', pointerId: 9701, button: 0, buttons, clientX: p.x, clientY: p.y, ctrlKey: true }));
          try { send('pointerdown', c, 1); send('pointermove', d, 1); send('pointercancel', d, 0); } finally { canvas.setPointerCapture = capture; }
        }, { c, d });
        assert.deepEqual(await mask(), baseMask, 'pointer cancellation restores the mask captured before modifier movement');
        assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'true', 'cancellation preserves the prior pending transform for explicit cancel');
        await page.keyboard.press('Escape');
      });
      const cdp = await context.newCDPSession(page);
      await group('Chromium touch tap outside confirms and clears select-tool selection', async () => {
        await select(); await pendingMove();
        const p = await point(14, 14); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...p, radiusX: 1, radiusY: 1, force: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(80);
        assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'false');
        assert.equal(await page.locator('.draw-selection-mask').evaluate(c => c.hidden), true);
      });
      assert.deepEqual(errors, []); results.push({ viewport, checks, errors });
    } catch (error) {
      failures.push({ viewport, name: 'setup', error: error.stack }); await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-setup-failure.png` }).catch(() => {});
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
const report = { base, generatedAt: new Date().toISOString(), results, failures };
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ results: results.map(r => ({ viewport: `${r.viewport.width}x${r.viewport.height}`, checks: r.checks.length })), failures: failures.length, report: `${output}/report.json` }, null, 2));
if (failures.length) process.exitCode = 1;
