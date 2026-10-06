/** Browser acceptance for left-click, right-click, touch hold, and keyboard assignments. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'browser base must be local');
const output = process.env.PIXIEED_DRAW_ASSIGNMENT_OUTPUT || '/tmp/pixieed-draw-assignment-input-20261006';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const results = [];
await mkdir(output, { recursive: true });

try {
  for (const variant of [{ width: 390, height: 844, mode: 'touch' }, { width: 1280, height: 800, mode: 'mouse' }]
    .filter(value => !process.env.PIXIEED_ASSIGNMENT_VARIANT || process.env.PIXIEED_ASSIGNMENT_VARIANT === value.mode)) {
    const context = await browser.newContext({ viewport: variant, hasTouch: true });
    const page = await context.newPage(), checks = [], errors = [];
    page.setDefaultTimeout(10000);
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    page.on('pageerror', error => errors.push(error.message));
    const session = await context.newCDPSession(page);
    let nextTouchId = 20;
    const touch = async (type, touchPoints) => { await session.send('Input.dispatchTouchEvent', { type, touchPoints }); await page.waitForTimeout(30); };
    const point = async (selector, id = nextTouchId++) => {
      const target = page.locator(selector); await target.scrollIntoViewIfNeeded();
      const r = await target.boundingBox(); assert.ok(r, `visible target ${selector}`);
      if (variant.mode === 'touch') await page.evaluate(({ selector, rect }) => { window.__lastTouchPoint = { selector, rect,
        innerWidth, innerHeight, scrollX, scrollY, hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML?.slice(0, 220) }; }, { selector, rect: r });
      return { id, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const settings = () => page.evaluate(() => JSON.parse(localStorage.getItem('pixieed:draw:input-settings:v1')));
    const pixels = () => page.locator('#draw-canvas').evaluate(canvas => {
      const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, result = [];
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) result.push({ index: i / 4, rgba: [...rgba.slice(i, i + 4)] });
      return result;
    });
    const viewState = () => page.evaluate(() => {
      const canvas = document.querySelector('#draw-canvas'), board = document.querySelector('.draw-board');
      const c = canvas.getBoundingClientRect(), b = board.getBoundingClientRect();
      return { transform: canvas.style.transform, canvas: [c.x, c.y, c.width, c.height], board: [b.x, b.y, b.width, b.height] };
    });
    const snapshot = async () => ({ settings: await settings(), pixels: await pixels(), view: await viewState() });
    const assertUnchanged = async (before, label) => {
      const after = await snapshot();
      assert.deepEqual(after.settings.bindings, before.settings.bindings, `${label}: neither side assigned`);
      assert.deepEqual(after.pixels, before.pixels, `${label}: no painting`);
      assert.deepEqual(after.view, before.view, `${label}: canvas pan/zoom unchanged`);
    };
    const keyTool = { pen: 'b', eraser: 'e', fill: 'g', line: 'l', rectangle: 'r', 'rectangle-fill': 'Shift+r', ellipse: 'o', 'ellipse-fill': 'Shift+o', spray: 'a', select: 'v', picker: 'i' };
    const color = index => page.locator(`.draw-color[data-color-index="${index}"]`);
    const tool = name => page.locator(`[data-draw-tool="${name}"]`);
    const openTools = async () => { if (!(await page.locator('#draw-tool-picker').evaluate(node => node.open))) await page.locator('#draw-tool-summary').click(); };
    const closeTools = async () => { if (await page.locator('#draw-tool-picker').evaluate(node => node.open)) await page.keyboard.press('Escape'); };
    const setLeftTool = async name => { await page.locator('#draw-canvas').focus(); await page.keyboard.press(keyTool[name]); };
    const contextAssignment = async locator => locator.evaluate(node => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, buttons: 2 });
      node.dispatchEvent(event); return event.defaultPrevented;
    });
    const beginMouse = async (selector, button = 'left') => {
      const p = await point(selector); await page.mouse.move(p.x, p.y); await page.mouse.down({ button }); return p;
    };
    const pointerIds = async () => page.evaluate(() => ({ ...window.__assignmentPointerIds }));
    const tapTouch = async selector => {
      const p = await point(selector); await touch('touchStart', [p]); await touch('touchEnd', [p]); await page.waitForTimeout(60); return p;
    };

    try {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool && !document.querySelector('#main').inert);
      await page.evaluate(() => {
        window.__assignmentPointerIds = {};
        window.__assignmentInputEvents = [];
        document.addEventListener('pointerdown', event => {
          window.__assignmentInputEvents.push({ type: event.type, pointerType: event.pointerType, pointerId: event.pointerId,
            button: event.button, buttons: event.buttons, x: event.clientX, y: event.clientY,
            target: event.target?.closest?.('.draw-color,[data-draw-tool],#draw-tool-summary')?.outerHTML?.slice(0, 160) || event.target?.tagName });
          if (!event.target.closest('.draw-color,[data-draw-tool],#draw-tool-summary')) return;
          window.__assignmentPointerIds[event.pointerType] = event.pointerId;
        }, true);
        for (const type of ['pointerup', 'pointercancel', 'click', 'contextmenu']) document.addEventListener(type, event => {
          window.__assignmentInputEvents.push({ type, pointerType: event.pointerType, pointerId: event.pointerId, button: event.button,
            buttons: event.buttons, target: event.target?.closest?.('.draw-color,[data-draw-tool],#draw-tool-summary')?.outerHTML?.slice(0, 160) || event.target?.tagName });
        }, true);
      });
      const initial = await settings();
      assert.equal(initial.editedSide, 'left');
      assert.equal(initial.bindings.left.tool, 'pen'); assert.equal(initial.bindings.right.tool, 'pen');
      const canvasRect = await page.locator('#draw-canvas').boundingBox();
      await page.mouse.click(canvasRect.x + canvasRect.width / 32, canvasRect.y + canvasRect.height / 32);
      assert.ok((await pixels()).length, 'seed pixel exists before assignment-only gestures');
      const seedPixels = await pixels(), seedView = await viewState();

      if (variant.mode === 'mouse') {
        // A mouse down on a color only arms the gesture. Click assigns left on release.
        const beforeLeft = await snapshot(), p = await beginMouse('.draw-color[data-color-index="3"]');
        assert.deepEqual((await settings()).bindings, beforeLeft.settings.bindings, 'palette pointerdown does not assign left');
        await page.mouse.up();
        assert.equal((await settings()).bindings.left.color, 3); assert.equal((await settings()).bindings.right.color, initial.bindings.right.color);
        assert.deepEqual(await pixels(), beforeLeft.pixels); assert.deepEqual(await viewState(), beforeLeft.view);
        checks.push('mouse palette tap assigns left only on completed click');

        // Right mouse context assignment waits for contextmenu and does not alter left.
        const leftColor = (await settings()).bindings.left.color;
        const rightP = await beginMouse('.draw-color[data-color-index="5"]', 'right');
        assert.equal((await settings()).bindings.right.color, 5, 'native right-button contextmenu assigns right');
        assert.equal((await settings()).bindings.left.color, leftColor);
        await page.mouse.up({ button: 'right' }); await page.waitForTimeout(40);
        assert.equal((await settings()).bindings.right.color, 5); assert.equal((await settings()).bindings.left.color, leftColor);
        checks.push('mouse contextmenu on palette assigns right only');

        await openTools();
        const lineBefore = (await settings()).bindings;
        const linePoint = await point('[data-draw-tool="line"]'); await page.mouse.move(linePoint.x, linePoint.y); await page.mouse.down();
        assert.deepEqual((await settings()).bindings, lineBefore, 'tool pointerdown does not assign');
        await page.mouse.up(); await page.waitForTimeout(40);
        assert.equal((await settings()).bindings.left.tool, 'line'); assert.equal((await settings()).bindings.right.tool, lineBefore.right.tool);
        await openTools();
        const rectPoint = await point('[data-draw-tool="rectangle"]'); await page.mouse.move(rectPoint.x, rectPoint.y); await page.mouse.down({ button: 'right' });
        assert.equal((await settings()).bindings.right.tool, 'rectangle', 'native right-button contextmenu assigns right');
        assert.equal((await settings()).bindings.left.tool, 'line');
        await page.mouse.up({ button: 'right' }); await page.waitForTimeout(40);
        assert.equal((await settings()).bindings.right.tool, 'rectangle'); assert.equal((await settings()).bindings.left.tool, 'line');
        await closeTools();
        checks.push('mouse left/right tool menu selection assigns only the selected side');

        // Focused keyboard actions use Enter for left and Shift+Enter for right.
        await color(6).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(40);
        assert.equal((await settings()).bindings.left.color, 6);
        await color(7).focus(); await page.keyboard.press('Shift+Enter'); await page.waitForTimeout(40);
        assert.equal((await settings()).bindings.right.color, 7); assert.equal((await settings()).bindings.left.color, 6);
        await openTools(); await tool('line').focus(); await page.keyboard.press('Enter');
        await openTools(); await tool('ellipse').focus(); await page.keyboard.press('Shift+Enter');
        assert.equal((await settings()).bindings.left.tool, 'line'); assert.equal((await settings()).bindings.right.tool, 'ellipse');
        await closeTools(); checks.push('focused Enter and Shift+Enter assign left and right palette/tool values');
      } else {
        // A touch tap is not an assignment on pointerdown; release synthesizes its left click.
        const p = await point('.draw-color[data-color-index="3"]'), beforeLeft = await snapshot();
        await touch('touchStart', [p]); await page.waitForTimeout(120);
        assert.deepEqual((await settings()).bindings, beforeLeft.settings.bindings, 'touch pointerdown does not assign');
        await touch('touchEnd', [p]); await page.waitForTimeout(60);
        assert.equal((await settings()).bindings.left.color, 3); assert.equal((await settings()).bindings.right.color, initial.bindings.right.color);
        assert.deepEqual(await pixels(), beforeLeft.pixels); assert.deepEqual(await viewState(), beforeLeft.view);
        checks.push('touch tap assigns left after release, with no early assignment or canvas movement');

        // Hold past 500 ms assigns right; the generated click after lift is consumed.
        const hold = await point('.draw-color[data-color-index="5"]'), beforeHold = await snapshot();
        await touch('touchStart', [hold]); await page.waitForTimeout(350);
        assert.deepEqual((await settings()).bindings, beforeHold.settings.bindings, 'short hold remains unassigned');
        await page.waitForTimeout(220);
        assert.equal((await settings()).bindings.left.color, beforeHold.settings.bindings.left.color);
        assert.equal((await settings()).bindings.right.color, 5, 'long hold assigns right');
        await touch('touchEnd', [hold]); await page.waitForTimeout(80);
        assert.equal((await settings()).bindings.left.color, beforeHold.settings.bindings.left.color, 'post-hold click does not assign left');
        assert.equal((await settings()).bindings.right.color, 5);
        checks.push('500ms palette hold assigns right only and consumes the post-hold click');

        // Long-pressing an individual tool-menu item assigns its tool to right and closes the menu.
        await openTools(); const menuTool = await point('[data-draw-tool="line"]'), beforeToolHold = await settings();
        await touch('touchStart', [menuTool]); await page.waitForTimeout(570);
        assert.equal((await settings()).bindings.right.tool, 'line');
        assert.equal((await settings()).bindings.left.tool, beforeToolHold.bindings.left.tool);
        await touch('touchEnd', [menuTool]); await page.waitForTimeout(60);
        assert.equal(await page.locator('#draw-tool-picker').evaluate(node => node.open), false, 'tool menu closes after assignment');
        assert.equal((await settings()).bindings.left.tool, beforeToolHold.bindings.left.tool, 'post-hold generated click is consumed');
        checks.push('tool-menu hold assigns right and closes the menu without assigning left');

        // Parent summary is only a menu control, never a right-side assignment target.
        const beforeSummary = await settings(), summary = await point('#draw-tool-summary');
        await touch('touchStart', [summary]); await page.waitForTimeout(580); await touch('touchEnd', [summary]);
        assert.deepEqual((await settings()).bindings, beforeSummary.bindings, 'parent tool-summary hold is not an assignment');
        await closeTools(); checks.push('parent tool summary hold does not assign right');

        // Cancellation before the threshold must not assign either side.
        const cancelled = [];
        for (const kind of ['move', 'second-finger', 'pointercancel', 'pointerleave', 'scroll', 'menu-close']) {
          const target = kind === 'menu-close' ? (await openTools(), '[data-draw-tool="rectangle"]') : '.draw-color[data-color-index="8"]';
          const p0 = await point(target), before = await snapshot();
          await touch('touchStart', [p0]);
          if (kind === 'move') { await touch('touchMove', [{ ...p0, x: p0.x + 16 }]); await touch('touchEnd', [{ ...p0, x: p0.x + 16 }]); }
          else if (kind === 'second-finger') {
            const second = { ...await point('.draw-color[data-color-index="9"]'), id: nextTouchId++ };
            await touch('touchStart', [p0, second]); await page.waitForTimeout(570); await touch('touchEnd', [p0, second]);
          } else if (kind === 'pointercancel') await touch('touchCancel', []);
          else if (kind === 'pointerleave') {
            const id = (await pointerIds()).touch;
            await page.locator(target).dispatchEvent('pointerleave', { pointerId: id, pointerType: 'touch', bubbles: true });
            await touch('touchEnd', [p0]);
          } else if (kind === 'scroll') {
            await page.evaluate(() => window.dispatchEvent(new Event('scroll'))); await touch('touchEnd', [p0]);
          } else { await page.keyboard.press('Escape'); await page.waitForTimeout(570); await touch('touchEnd', [p0]); }
          if (kind !== 'pointercancel') await page.waitForTimeout(560);
          assert.deepEqual((await settings()).bindings, before.settings.bindings, `${kind} cancels hold without assignment`);
          assert.deepEqual(await pixels(), before.pixels, `${kind} cancellation does not paint`);
          if (kind === 'menu-close') assert.equal(await page.locator('#draw-tool-picker').evaluate(node => node.open), false);
          if (kind !== 'menu-close') await closeTools();
          cancelled.push(kind);
        }
        checks.push(`hold cancellation leaves both profiles unchanged: ${cancelled.join(', ')}`);

        // A new tap works after every interrupted hold.
        const fresh = await tapTouch('.draw-color[data-color-index="10"]');
        assert.equal((await settings()).bindings.left.color, 10); assert.equal((await settings()).bindings.right.color, 5);
        checks.push('fresh tap after canceled holds assigns left normally');
      }

      // Only assignment controls own context menus; the rest of the page stays available.
      const controlContext = await contextAssignment(color(11));
      const outsideContext = await page.evaluate(() => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
        document.querySelector('.site-header').dispatchEvent(event); return event.defaultPrevented;
      });
      assert.equal(controlContext, true); assert.equal(outsideContext, false);
      assert.equal((await settings()).editedSide, 'left', 'assignment interactions keep the normalized edit side left');
      assert.deepEqual(await pixels(), seedPixels, 'assignment gestures preserve seeded canvas pixels');
      assert.deepEqual(await viewState(), seedView, 'assignment gestures preserve canvas pan/zoom');
      checks.push('assignment gestures preserve existing pixels and viewport state');
      checks.push('contextmenu suppression is limited to tool/color controls and editedSide remains left');
      assert.deepEqual(errors, []);
      results.push({ viewport: variant, checks, errors, finalSettings: await settings() });
      console.log(`PASS ${variant.width}x${variant.height} (${variant.mode}): ${checks.length} assignment-input groups`);
    } catch (error) {
      await page.screenshot({ path: `${output}/${variant.width}x${variant.height}-failure.png` }).catch(() => {});
      results.push({ viewport: variant, checks, failure: error.stack || String(error), errors, settings: await settings().catch(() => null), pointerIds: await pointerIds().catch(() => null), lastTouchPoint: await page.evaluate(() => window.__lastTouchPoint).catch(() => null), inputEvents: await page.evaluate(() => window.__assignmentInputEvents).catch(() => []) });
      await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
      throw error;
    } finally { await context.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
