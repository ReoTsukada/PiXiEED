/** Acceptance for direct tools, repeat-swatch editing and navigation playback. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { saveCurrentProject } from './lib/project-panel-browser.mjs';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_DRAW_HEADER_INPUT_OUTPUT || '/tmp/pixieed-draw-header-input-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true }), results = [];
const testedSources = Object.fromEntries(await Promise.all(['draw/index.html', 'css/draw-viewport.css', 'js/creation/draw-page.mjs', 'js/creation/draw-assignment-input.mjs', 'js/site-header.mjs', 'js/tool-header-controls.mjs', 'js/creation/project-workspace.mjs'].map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])));
await mkdir(output, { recursive: true });
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]
    .filter(v => !process.env.PIXIEED_DRAW_HEADER_INPUT_VARIANT || process.env.PIXIEED_DRAW_HEADER_INPUT_VARIANT.includes(`${v.width}x${v.height}`))) {
    const context = await browser.newContext({ viewport, hasTouch: true }), page = await context.newPage(), checks = [], errors = [];
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
    const session = await context.newCDPSession(page);
    const ready = () => page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool && !document.querySelector('#main').inert);
    const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('pixieed:draw:input-settings:v1')));
    const color = value => page.locator(`.draw-color[data-color-index="${value}"]`);
    const tool = value => page.locator(`[data-draw-tool="${value}"]`);
    const openTools = async () => { if (!(await page.locator('#draw-tool-picker').evaluate(n => n.open))) await page.locator('#draw-tool-summary').click(); };
    const chooseTool = async (name, button = 'left') => { await openTools(); await tool(name).click({ button }); };
    const editorOpen = () => page.locator('#draw-color-editor').isVisible();
    const pixels = () => page.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]);
    const point = async (target, id = 20) => { const r = await (typeof target === 'string' ? page.locator(target) : target).boundingBox(); assert.ok(r); return { id, x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const touch = async (type, touchPoints) => { await session.send('Input.dispatchTouchEvent', { type, touchPoints }); await page.waitForTimeout(35); };
    const dismissEditor = async () => { if (await editorOpen()) await page.locator('#dce-done').click(); };
    const selectColor = async value => { await dismissEditor(); if ((await settings()).bindings.left.color !== value) await color(value).click(); };
    const pixelPoint = async (x, y) => { const r = await page.locator('#draw-canvas').boundingBox(); return { x: r.x + (x + .5) * r.width / 16, y: r.y + (y + .5) * r.height / 16 }; };
    const setVirtual = async on => { await page.locator('#draw-settings-summary').click(); if ((await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed') === 'true') !== on) await page.locator('#draw-virtual-toggle').click(); await page.keyboard.press('Escape'); };
    const geometry = () => page.evaluate(() => Object.fromEntries(['.draw-viewport', '.draw-board', '.draw-control-dock', '.draw-fixed-left', '#draw-selection-controls'].map(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return [selector, [r.x, r.y, r.width, r.height]]; })));
    try {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' }); await ready();
      const startGeometry = await geometry();
      assert.equal(await tool('pen').count(), 1); assert.equal(await tool('eraser').count(), 1);
      assert.equal(await page.locator('#draw-tool-picker [data-draw-tool="pen"],#draw-tool-picker [data-draw-tool="eraser"]').count(), 2);
      for (const name of ['pen', 'pen', 'eraser', 'eraser', 'pen']) { await chooseTool(name); assert.equal((await settings()).bindings.left.tool, name, 'direct tools do not toggle'); }
      await chooseTool('eraser', 'right'); assert.equal((await settings()).bindings.right.tool, 'eraser'); assert.equal((await settings()).bindings.left.tool, 'pen');
      await openTools(); await tool('pen').focus(); await page.keyboard.press('Shift+Enter'); assert.equal((await settings()).bindings.right.tool, 'pen');
      checks.push('one direct pen and one direct eraser; repeated selection and independent native/keyboard right assignment');

      await color(3).click(); assert.equal((await settings()).bindings.left.color, 3); assert.equal(await editorOpen(), false);
      const oldSwatchColor = await color(3).evaluate(n => n.style.getPropertyValue('--draw-color'));
      await color(3).click(); assert.equal(await editorOpen(), true, 'repeat selected opaque swatch edits');
      await page.locator('#dce-h').fill('120'); await page.locator('#dce-h').dispatchEvent('input');
      await page.locator('#dce-done').click(); assert.equal(await editorOpen(), false);
      const editedSwatchColor = await color(3).evaluate(n => n.style.getPropertyValue('--draw-color')); assert.notEqual(editedSwatchColor, oldSwatchColor, 'slider changed real palette color');
      await page.locator('#draw-undo').click(); assert.equal(await color(3).evaluate(n => n.style.getPropertyValue('--draw-color')), oldSwatchColor);
      await page.locator('#draw-redo').click(); assert.equal(await color(3).evaluate(n => n.style.getPropertyValue('--draw-color')), editedSwatchColor);
      await color(4).click(); assert.equal(await editorOpen(), false); await color(4).focus(); await page.keyboard.press('Enter'); assert.equal(await editorOpen(), true);
      await page.keyboard.press('Escape'); assert.equal(await editorOpen(), false);
      assert.deepEqual(await geometry(), startGeometry, 'color editor overlay does not shift workspace');
      checks.push('first left swatch chooses color; repeat click/Enter opens editing; commit/Escape keep fixed workspace');

      const beforeRight = await settings();
      await color(4).click({ button: 'right' }); assert.equal(await editorOpen(), false);
      assert.equal((await settings()).bindings.right.color, 4); assert.equal((await settings()).bindings.left.color, beforeRight.bindings.left.color);
      await color(4).evaluate(n => n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
      assert.equal(await editorOpen(), false, 'post-context synthesized click cannot open color editing');
      await color(4).click(); assert.equal(await editorOpen(), true, 'fresh real left click clears old right token'); await dismissEditor();
      await color(4).focus(); await page.keyboard.press('Shift+Enter'); assert.equal(await editorOpen(), false);
      checks.push('right context/current-left color and synthetic click never edit; next actual left click and Shift+Enter remain usable');

      const hold = await point(color(4)); await touch('touchStart', [hold]); await page.waitForTimeout(560); await touch('touchEnd', []);
      assert.equal((await settings()).bindings.right.color, 4); assert.equal(await editorOpen(), false, 'same-left-color long press is right assignment only');
      const tap = await point(color(4), 21); await touch('touchStart', [tap]); await touch('touchEnd', []); assert.equal(await editorOpen(), true); await dismissEditor();
      checks.push('same selected swatch long-press assigns right without editing; following fresh touch tap edits');

      for (const cancellation of ['drag', 'cancel', 'blur', 'second-finger']) {
        const before = await settings(), p = await point(color(4), 30);
        await touch('touchStart', [p]);
        if (cancellation === 'drag') await touch('touchMove', [{ ...p, x: p.x + 16 }]);
        if (cancellation === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        if (cancellation === 'second-finger') await touch('touchStart', [p, await point(color(5), 31)]);
        await page.waitForTimeout(560); await touch(cancellation === 'cancel' ? 'touchCancel' : 'touchEnd', []);
        assert.equal(await editorOpen(), false, `${cancellation} must not edit`); assert.deepEqual((await settings()).bindings, before.bindings);
      }
      await color(5).click(); assert.equal((await settings()).bindings.left.color, 5); assert.equal(await editorOpen(), false);
      checks.push('drag, pointercancel, blur and second finger suppress repeated-swatch editing without assignments; fresh click recovers');

      await color(-1).click(); await color(-1).click(); assert.equal(await editorOpen(), false);
      await color(-1).click({ button: 'right' }); assert.equal(await editorOpen(), false);
      const a = await pixelPoint(2, 2); await page.mouse.click(a.x, a.y); assert.ok((await pixels()).every((value, index) => index % 4 !== 3 || value === 0));
      assert.equal((await settings()).bindings.left.color, -1); assert.equal((await settings()).bindings.right.color, -1);
      checks.push('repeated transparent swatch never opens opaque editor; both sides remain transparent and drawing adds no opacity');

      await selectColor(2); await chooseTool('pen'); const a1 = await pixelPoint(2, 2), b1 = await pixelPoint(5, 2);
      await page.mouse.move(a1.x, a1.y); await page.mouse.down();
      await color(2).evaluate(n => n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })));
      assert.equal(await editorOpen(), false, 'held native stroke cannot open repeat-color editor');
      await page.mouse.move(b1.x, b1.y); await page.mouse.up();
      const strokePixels = await pixels(); assert.equal(strokePixels.filter((value, index) => index % 4 === 3 && value).length, 4, 'held stroke owns its complete path');
      await page.locator('#draw-undo').click(); assert.ok((await pixels()).every((value, index) => index % 4 !== 3 || value === 0));
      checks.push('held native button keeps stroke ownership and suppresses repeat-color editing; one Undo restores image');

      await setVirtual(true); const vbutton = await point('[data-virtual-left]', 41), vcolor = await point(color(2), 42);
      await touch('touchStart', [vbutton]); await touch('touchStart', [vbutton, vcolor]); await touch('touchEnd', [vbutton]);
      assert.equal(await editorOpen(), false, 'repeat-color tap while virtual left held cannot edit');
      await touch('touchCancel', []); assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false'); await setVirtual(false);
      checks.push('virtual held-button plus separate color finger does not edit; cancellation releases owner and mode OFF preserves geometry');

      assert.equal(await page.locator('.app-tabs #draw-animation-play').count(), 1); assert.equal(await page.locator('.draw-toolbar #draw-animation-play').count(), 0);
      assert.equal(await page.locator('.app-tabs #draw-save').count(), 0); assert.equal(await page.locator('#draw-output #draw-save').count(), 1, 'saving remains in file controls'); assert.equal(await page.locator('#draw-animation-play').isDisabled(), true);
      await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click();
      await page.locator('#draw-animation-controls-panel .animation-controls__frame-add').click();
      await page.locator('[data-action="close-animation"]').click();
      await page.locator('#draw-animation-play').click(); assert.equal(await page.locator('#draw-animation-play').getAttribute('aria-pressed'), 'true'); assert.equal(await page.locator('#draw-playback-position').isVisible(), true);
      await page.locator('#draw-animation-play').click(); assert.equal(await page.locator('#draw-animation-play').getAttribute('aria-pressed'), 'false');
      checks.push('single navigation playback replaces Save; one frame disabled, two frames play and stop without toolbar duplicate');

      await color(2).click(); assert.equal(await editorOpen(), true); await page.locator('#project-open').click(); assert.equal(await editorOpen(), false, 'header file opening closes color editor');
      await saveCurrentProject(page); await page.waitForFunction(() => document.querySelector('#project-open').dataset.state === 'saved');
      const savedUrl = page.url(), savedBindings = (await settings()).bindings; await page.keyboard.press('Escape'); await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
      assert.equal(page.url(), savedUrl); assert.deepEqual((await settings()).bindings, savedBindings);
      assert.equal(await page.locator('#draw-animation-play').isDisabled(), false);
      await color(2).click(); assert.equal(await editorOpen(), true); await dismissEditor();
      checks.push('header file menu retains save, closes editing, and direct saved URL reload restores bindings, timeline and repeat-swatch editing');

      for (const side of ['left', 'right']) {
        await page.locator('#draw-settings-summary').click();
        if (await page.locator('#draw-controls-side-toggle').getAttribute('data-side') !== side) await page.locator('#draw-controls-side-toggle').click();
        await page.keyboard.press('Escape');
        const before = await geometry(); await setVirtual(true); assert.deepEqual(await geometry(), before); assert.deepEqual(await geometry(), before);
        const left = await page.locator('[data-virtual-left]').boundingBox(), right = await page.locator('[data-virtual-right]').boundingBox(); assert.ok(Math.abs(left.width - right.width) <= 1 / 32);
        await setVirtual(false); await openTools();
        for (const selector of ['[data-draw-tool="pen"]', '[data-draw-tool="eraser"]']) {
          const p = await point(selector); assert.ok(p.x >= 0 && p.x < viewport.width && p.y >= 0 && p.y < viewport.height, `${side}: ${selector} is within viewport`);
          assert.ok(await page.evaluate(({ selector, p }) => document.querySelector(selector).contains(document.elementFromPoint(p.x, p.y)), { selector, p }), `${selector} reachable by pointer`);
        }
        await page.keyboard.press('Escape');
        for (const selector of ['#draw-animation-play', '#project-open']) { const q = await point(selector); assert.ok(await page.evaluate(({selector,q})=>document.querySelector(selector).contains(document.elementFromPoint(q.x,q.y)),{selector,q})); }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      checks.push('both control placements preserve equal click widths and virtual ON/OFF rectangles; direct tools, nav playback and file are reachable without horizontal overflow');
      assert.deepEqual(errors, []);
      results.push({ viewport, checks, errors, geometry: await geometry() });
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-header-input.png` });
      console.log(`PASS ${viewport.width}x${viewport.height}: ${checks.length} header/input groups`);
    } catch (error) {
      results.push({ viewport, checks, errors, failure: error.stack || String(error), settings: await settings().catch(() => null) });
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-failure.png` }).catch(() => {});
      await writeFile(`${output}/results.json`, JSON.stringify({ testedSources, results }, null, 2)); throw error;
    } finally { await context.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ testedSources, results }, null, 2));
} finally { await browser.close(); }
