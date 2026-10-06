/** Local acceptance: fractional pixel boundaries, playback, moved mirrors and virtual input. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_DRAW_VIEWPORT_OUTPUT || '/tmp/pixieed-draw-viewport-dual-20261006';
const { chromium, webkit } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const engine = process.env.PIXIEED_DRAW_VIEWPORT_ENGINE === 'webkit' ? webkit : chromium;
const browser = await engine.launch({ headless: true, ...(engine === webkit && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) }), results = [];
await mkdir(output, { recursive: true });
const variants = [
  { width: 1280, height: 800, dpr: 1 }, { width: 1280, height: 800, dpr: 2 },
  { width: 390, height: 844, dpr: 3 }, { width: 320, height: 568, dpr: 2 }, { width: 844, height: 390, dpr: 2 }
];
try {
  for (const variant of variants.filter(v => !process.env.PIXIEED_DRAW_VIEWPORT_VARIANTS || process.env.PIXIEED_DRAW_VIEWPORT_VARIANTS.includes(`${v.width}x${v.height}`))) {
    const context = await browser.newContext({ viewport: variant, deviceScaleFactor: variant.dpr, hasTouch: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage(), errors = [], checks = [], label = `${variant.width}x${variant.height}-dpr${variant.dpr}`;
    page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.querySelector('#draw-canvas')?.dataset.tool === 'pen' && !document.querySelector('#main').inert);
    const pixels = () => page.locator('#draw-canvas').evaluate(c => {
      const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, points = [];
      for (let i = 0; i < data.length; i += 4) if (data[i + 3]) points.push(`${i / 4 % c.width},${Math.floor(i / 4 / c.width)}`);
      return points.sort();
    });
    const tap = async (x, y) => { const r = await page.locator('#draw-canvas').boundingBox(), size = await page.locator('#draw-canvas').evaluate(c => [c.width, c.height]); await page.mouse.click(r.x + (x + .5) * r.width / size[0], r.y + (y + .5) * r.height / size[1]); };
    const settings = async keys => {
      await page.locator('#draw-settings-summary').click();
      for (const key of ['horizontal', 'vertical', 'diagonalDown', 'diagonalUp']) {
        const b = page.locator(`[data-symmetry="${key}"]`);
        if ((await b.getAttribute('aria-pressed') === 'true') !== keys.includes(key)) await b.click();
      }
      await page.keyboard.press('Escape');
    };
    const setVirtual = async enabled => {
      await page.locator('#draw-settings-summary').click();
      if ((await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed') === 'true') !== enabled) await page.locator('#draw-virtual-toggle').click();
      await page.keyboard.press('Escape');
    };
    const rects = () => page.evaluate(() => Object.fromEntries(['.draw-viewport', '.draw-board', '#draw-canvas', '#draw-mirror-rail', '.draw-control-dock', '.draw-controls', '#draw-virtual-controls', '.draw-toolbar', '.draw-actions'].map(selector => [selector, document.querySelector(selector).getBoundingClientRect().toJSON()])));
    const hotspot = () => page.locator('.draw-virtual-marker').evaluate(n => { const r = n.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const resize = async size => { await page.locator('#draw-import-summary').click(); await page.locator(`[data-draw-size="${size}"]`).click(); await page.keyboard.press('Escape'); };
    try {
      await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' }); await ready();
      await page.evaluate(() => document.addEventListener('pointerdown', e => { if (e.target.closest('.draw-board')) window.__padPointer = e.pointerId; }, { capture: true }));
      for (const size of [32, 128, 256]) {
        await resize(size);
        for (const wheel of [-137, -513]) {
          const b = await page.locator('.draw-board').boundingBox();
          await page.mouse.move(b.x + b.width * .51, b.y + b.height * .48); await page.mouse.wheel(0, wheel);
          await page.waitForTimeout(100);
          await page.locator('#draw-canvas').focus(); await page.keyboard.down('Space'); await page.mouse.down(); await page.mouse.move(b.x + b.width * .51 + 17.3, b.y + b.height * .48 - 11.7); await page.mouse.up(); await page.keyboard.up('Space');
          const grid = await page.evaluate(() => {
            const source = document.querySelector('#draw-canvas'), grid = document.querySelector('.draw-pixel-lines'), board = document.querySelector('.draw-board');
            const r = source.getBoundingClientRect(), b = board.getBoundingClientRect(), dpr = devicePixelRatio;
            const left = r.left - b.left - board.clientLeft, top = r.top - b.top - board.clientTop;
            const cw = r.width / source.width, ch = r.height / source.height;
            const row = Math.max(0, Math.min(source.height - 1, Math.floor((board.clientHeight / 2 - top) / ch)));
            const y = Math.round((top + (row + .5) * ch) * dpr);
            const data = grid.getContext('2d').getImageData(0, y, grid.width, 1).data;
            const xs = []; let maxError = 0, missing = 0;
            for (let i = 1; i < source.width; i++) {
              const expected = (left + i * cw) * dpr, x = Math.round(expected);
              if (x < 1 || x >= grid.width - 1) continue;
              xs.push(x); if (!data[x * 4 + 3]) missing++;
              maxError = Math.max(maxError, Math.abs(expected - x));
            }
            return { size: source.width, lines: xs.length, missing, maxError, transform: source.style.transform, width: grid.width, viewportWidth: board.clientWidth * dpr };
          });
          assert.ok(grid.lines > 0); assert.equal(grid.missing, 0); assert.ok(grid.maxError <= .50001);
          assert.ok(Math.abs(grid.width - grid.viewportWidth) <= 1, 'overlay memory is bounded to viewport');
          const r = await page.locator('#draw-canvas').boundingBox();
          const point = { x: Math.floor((b.x + b.width / 2 - r.x) / r.width * size), y: Math.floor((b.y + b.height / 2 - r.y) / r.height * size) };
          await tap(point.x, point.y); assert.deepEqual(await pixels(), [`${point.x},${point.y}`]);
          await page.locator('#draw-undo').click(); checks.push({ name: 'grid + input under zoom/pan', ...grid });
        }
        await page.locator('#draw-canvas').focus(); await page.keyboard.press('0');
      }
      await resize(16);
      // Settle the short phone's existing controls scroll position by opening the settings
      // once before measuring. Compare toggles at the same user-visible scroll position.
      await settings([]); await setVirtual(false);
      const fixedRects = await rects();
      const axes = ['horizontal', 'vertical', 'diagonalDown', 'diagonalUp'];
      for (let mask = 0; mask < 16; mask++) {
        await settings(axes.filter((_, i) => mask & (1 << i)));
        for (const enabled of [false, true]) {
          await setVirtual(enabled);
          assert.deepEqual(await rects(), fixedRects, `fixed bounding rects: axes=${mask}, virtual=${enabled}`);
          assert.equal(await page.locator('[data-virtual-left]').isDisabled(), !enabled);
        }
      }
      assert.equal(await page.locator('#draw-settings-picker #draw-virtual-toggle').count(), 1);
      assert.equal(await page.locator('[data-virtual-drag], [data-virtual-pad]').count(), 0);
      await setVirtual(false);
      await page.screenshot({ path: `${output}/${label}-off.png` });
      checks.push({ name: 'all 32 mirror / virtual combinations preserve canvas and surrounding bounding rects', rects: fixedRects });
      const initialBoard = await page.locator('.draw-board').boundingBox();
      await settings(['horizontal', 'vertical', 'diagonalDown', 'diagonalUp']);
      for (const [axis, value] of [['x', 5], ['y', 6]]) {
        const input = page.locator(`#draw-mirror-${axis}`); await input.focus(); await input.press('Home');
        for (let i = 0; i < value * 2; i++) await input.press('ArrowRight');
      }
      await page.waitForTimeout(100);
      const rail = await page.locator('#draw-mirror-rail').boundingBox(), mirrorBoard = await page.locator('.draw-board').boundingBox();
      assert.ok(rail.y + rail.height <= mirrorBoard.y); assert.equal(rail.height, 36);
      assert.deepEqual(mirrorBoard, initialBoard);
      await tap(2, 4);
      assert.deepEqual(await pixels(), ['2,4','7,4','2,7','7,7','3,3','6,3','3,8','6,8'].sort());
      await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), []);
      checks.push({ name: 'outside mirror rail, combined moved axes and single Undo', rail, board: mirrorBoard });
      await settings([]);
      await setVirtual(true);
      await page.locator('[data-virtual-left]').click(); assert.equal((await pixels()).length, 1);
      await page.locator('#draw-undo').click();
      const session = engine === chromium ? await context.newCDPSession(page) : null;
      assert.ok(session, 'native multi-touch acceptance currently requires Chromium');
      const point = async (selector, id) => { const r = await page.locator(selector).boundingBox(); return { id, x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
      const activeTouches = new Map();
      const touch = async (type, points) => {
        // CDP touchEnd lists contacts to lift. An empty helper list explicitly
        // means lift all current contacts, rather than sending a no-op to CDP.
        const touchPoints = type === 'touchEnd' && !points.length ? [...activeTouches.values()] : points;
        await session.send('Input.dispatchTouchEvent', { type, touchPoints });
        if (type === 'touchStart' || type === 'touchMove') for (const point of points) activeTouches.set(point.id, point);
        else if (type === 'touchEnd') for (const point of touchPoints) activeTouches.delete(point.id);
        else if (type === 'touchCancel') activeTouches.clear();
        await page.waitForTimeout(25);
      };
      const leftTouch = await point('[data-virtual-left]', 11), padTouch = await point('.draw-board', 22);
      const dragDx = (await page.locator('#draw-canvas').boundingBox()).width / 16 * 2;
      const startDrag = async () => {
        await touch('touchStart', [leftTouch]);
        assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'true');
        await touch('touchStart', [leftTouch, padTouch]);
        await touch('touchMove', [leftTouch, { ...padTouch, x: padTouch.x + dragDx }]);
      };
      // A pad touch establishes a relative anchor, without clicking or jumping.
      const beforeAnchor = await hotspot();
      await touch('touchStart', [padTouch]); assert.deepEqual(await hotspot(), beforeAnchor);
      await touch('touchMove', [{ ...padTouch, x: padTouch.x + 10 }]);
      assert.ok(Math.abs((await hotspot()).x - beforeAnchor.x - 10) < 1);
      await touch('touchEnd', []); assert.deepEqual(await pixels(), []);
      for (const lift of ['left', 'pad']) {
        await startDrag();
        assert.ok((await pixels()).length >= 2, 'two independent fingers draw a stroke');
        await touch('touchEnd', [lift === 'left' ? leftTouch : { ...padTouch, x: padTouch.x + dragDx }]);
        assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', `${lift} lift releases`);
        const committed = await pixels();
        if (lift === 'left') await touch('touchMove', [{ ...padTouch, x: padTouch.x + dragDx + 10 }]);
        assert.deepEqual(await pixels(), committed, 'remaining pad finger cannot keep drawing');
        await touch('touchEnd', []); await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), []);
      }
      // An additional pad finger cannot steal the current owner's movement or release.
      await startDrag();
      const thirdTouch = { id: 44, x: padTouch.x - 30, y: padTouch.y };
      await touch('touchStart', [leftTouch, { ...padTouch, x: padTouch.x + dragDx }, thirdTouch]);
      const ownedPosition = await hotspot(), ownedPixels = await pixels();
      await touch('touchMove', [leftTouch, { ...padTouch, x: padTouch.x + dragDx }, { ...thirdTouch, x: thirdTouch.x + 10 }]);
      assert.deepEqual(await hotspot(), ownedPosition); assert.deepEqual(await pixels(), ownedPixels);
      await touch('touchEnd', [{ ...thirdTouch, x: thirdTouch.x + 10 }]);
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'true', 'non-owner finger lift preserves left hold');
      await touch('touchEnd', []); await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), []);
      for (const cancel of ['escape', 'blur', 'touchCancel', 'pointercancel', 'lostcapture']) {
        await startDrag();
        if (cancel === 'escape') await page.keyboard.press('Escape');
        else if (cancel === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        else if (cancel === 'touchCancel') await touch('touchCancel', []);
        else await page.locator('.draw-board').evaluate((n, kind) => {
          // Pointer ids are captured from real browser input, not guessed.
          const id = window.__padPointer;
          if (kind === 'lostcapture') n.releasePointerCapture(id);
          else n.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, pointerType: 'touch', bubbles: true }));
        }, cancel);
        if (cancel === 'lostcapture') await touch('touchMove', [leftTouch, { ...padTouch, x: padTouch.x + dragDx + 1 }]);
        await page.waitForTimeout(30);
        assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false', `${cancel} releases`);
        if (cancel === 'lostcapture' && (await pixels()).length) await page.locator('#draw-undo').click();
        assert.deepEqual(await pixels(), [], `${cancel} leaves no pending stroke`);
        if (cancel !== 'touchCancel') await touch('touchEnd', []);
      }
      // Mode off ends an accepted stroke; late pointer events cannot resume it after re-on.
      for (let i = 0; i < 3; i++) {
        await startDrag();
        await page.locator('#draw-virtual-toggle').evaluate(n => n.click());
        assert.equal(await page.locator('#draw-canvas').getAttribute('data-virtual-pressed'), 'false');
        await touch('touchEnd', []); await page.locator('#draw-undo').click();
        await setVirtual(true); assert.deepEqual(await pixels(), []);
      }
      // Captured movement outside the viewport does not move or draw. Re-entry anchors anew.
      await page.locator('.draw-board').focus(); await page.keyboard.press('Shift+ArrowLeft');
      const boardRect = await page.locator('.draw-board').boundingBox();
      await touch('touchStart', [padTouch]); const insidePosition = await hotspot();
      await touch('touchMove', [{ ...padTouch, y: boardRect.y + boardRect.height + 10 }]);
      assert.deepEqual(await hotspot(), insidePosition);
      await touch('touchMove', [{ ...padTouch, y: padTouch.y + 10 }]); assert.deepEqual(await hotspot(), insidePosition);
      await touch('touchMove', [{ ...padTouch, x: padTouch.x + 6, y: padTouch.y + 10 }]);
      const reenteredPosition = await hotspot();
      assert.ok(Math.abs(reenteredPosition.x - insidePosition.x - 6) < 1, JSON.stringify({ insidePosition, reenteredPosition, boardRect, padTouch })); await touch('touchEnd', []);
      await page.locator('.draw-board').focus();
      for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
      const bounded = await page.evaluate(() => {
        const marker = document.querySelector('.draw-virtual-marker').getBoundingClientRect(), canvas = document.querySelector('#draw-canvas').getBoundingClientRect(), board = document.querySelector('.draw-board').getBoundingClientRect();
        const x = marker.left + marker.width / 2, y = marker.top + marker.height / 2;
        return x >= Math.max(canvas.left, board.left) && x < Math.min(canvas.right, board.right) && y >= Math.max(canvas.top, board.top) && y < Math.min(canvas.bottom, board.bottom);
      });
      assert.equal(bounded, true);
      // Return toward center before the next repeated drag checks.
      for (let i = 0; i < 2; i++) await page.keyboard.press('Shift+ArrowLeft');
      const rightTouch = await point('[data-virtual-right]', 33);
      await touch('touchStart', [rightTouch]); assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'), 'true');
      await touch('touchEnd', []); assert.equal(await page.locator('#draw-tool-picker').evaluate(n => n.open), false); assert.equal((await pixels()).length, 1); await page.locator('#draw-undo').click();
      await touch('touchStart', [rightTouch]); await touch('touchCancel', []);
      assert.equal(await page.locator('#draw-tool-picker').evaluate(n => n.open), false);
      assert.equal(await page.locator('[data-virtual-right]').getAttribute('aria-pressed'), 'false');
      await setVirtual(false);
      await page.locator('#draw-canvas').click({ button: 'right' }); assert.equal(await page.locator('#draw-tool-picker').evaluate(n => n.open), false); assert.equal((await pixels()).length, 1); await page.locator('#draw-undo').click();
      // Native mouse painting still works when the mode is disabled.
      const realRect = await page.locator('#draw-canvas').boundingBox();
      await page.mouse.move(realRect.x + realRect.width / 2, realRect.y + realRect.height / 2); await page.mouse.down();
      await page.mouse.move(realRect.x + realRect.width / 2 + realRect.width * 3 / 16, realRect.y + realRect.height / 2); await page.mouse.up();
      assert.ok((await pixels()).length >= 3); await page.locator('#draw-undo').click(); assert.deepEqual(await pixels(), []);
      checks.push({ name: 'native two-finger relative drag, either finger lift, cancellations, re-on, viewport bounds, left/right drawing and pressed styling, native mouse regression', passed: true });
      await tap(3, 3);
      await page.locator('[data-action="toggle-frames"]').click(); await page.locator('.animation-controls__frame-add').click(); await page.locator('[data-action="close-animation"]').click();
      await tap(9, 9);
      await page.locator('#draw-animation-play').click();
      const samples = await page.evaluate(async () => {
        const c = document.querySelector('#draw-canvas'), values = [];
        for (let i = 0; i < 14; i++) { await new Promise(r => setTimeout(r, 37)); values.push(c.getContext('2d').getImageData(9, 9, 1, 1).data[3]); }
        return values;
      });
      assert.deepEqual(new Set(samples), new Set([0, 255]));
      await page.locator('#draw-animation-play').click(); assert.deepEqual(await pixels(), ['3,3','9,9']);
      await page.waitForTimeout(250); assert.deepEqual(await pixels(), ['3,3','9,9']);
      await page.locator('[data-action="toggle-frames"]').click(); await page.locator('[data-action="play"]').click();
      await page.waitForTimeout(60); assert.ok(await page.locator('.animation-controls__workspace-panel .is-playing').count() > 0);
      await page.locator('[data-action="play"]').click(); await page.locator('[data-action="close-animation"]').click();
      checks.push({ name: 'playback pixels change, both play controls, current frame indicator, stable stopped cel', samples });
      for (const size of [128, 256]) {
        await resize(size);
        await page.locator('[data-action="toggle-frames"]').click();
        await page.locator('[data-action="select-frame"]').first().click();
        await page.locator('[data-action="close-animation"]').click();
        await tap(2, 2); await page.locator('#draw-animation-play').click();
        await page.locator('[data-action="toggle-frames"]').click();
        const largeSamples = await page.evaluate(async size => {
          const c = document.querySelector('#draw-canvas'), values = [], p = 9 + Math.floor(size / 2) - 8;
          for (let i = 0; i < 14; i++) { await new Promise(r => setTimeout(r, 37)); values.push(c.getContext('2d').getImageData(p, p, 1, 1).data[3]); }
          return values;
        }, size);
        assert.deepEqual(new Set(largeSamples), new Set([0, 255]));
        await page.locator('[data-action="close-animation"]').click();
        assert.equal(await page.locator('#draw-animation-play').getAttribute('aria-pressed'), 'true');
        await page.locator('#draw-animation-play').click();
        checks.push({ name: 'large canvas playback immediately after frame selection/edit, panel open/close', size, samples: largeSamples });
      }
      await resize(16);
      await settings(['horizontal', 'vertical', 'diagonalDown', 'diagonalUp']);
      await setVirtual(true);
      const layout = await page.evaluate(() => {
        const board = document.querySelector('.draw-board').getBoundingClientRect(), controls = document.querySelector('.draw-controls').getBoundingClientRect();
        return { board: board.toJSON(), controls: controls.toJSON(), overflow: document.documentElement.scrollWidth > innerWidth,
          virtual: document.querySelector('#draw-virtual-controls').getBoundingClientRect().toJSON() };
      });
      assert.equal(layout.overflow, false); assert.ok(layout.board.height >= (variant.height < 400 ? 140 : 150)); assert.ok(layout.board.width >= 240);
      assert.ok(layout.virtual.right <= variant.width, 'all virtual controls fit the screen');
      // Short controls have their own scroll area; verify controls remain reachable
      // without changing the drawing viewport, rather than requiring all rows at once.
      const reachableBoard = await page.locator('.draw-board').boundingBox();
      const oldScroll = await page.locator('.draw-controls').evaluate(n => n.scrollTop);
      for (const selector of ['#draw-palette .draw-color[data-color-index="2"]', '[data-draw-tool="pen"]', '#draw-settings-summary', '#draw-undo']) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        assert.equal(await page.locator(selector).evaluate(n => { const r = n.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit === n || n.contains(hit); }), true, `${selector} remains reachable`);
        assert.deepEqual(await page.locator('.draw-board').boundingBox(), reachableBoard);
      }
      await page.locator('.draw-controls').evaluate((n, value) => { n.scrollTop = value; }, oldScroll);
      checks.push({ name: 'color, pen, settings and Undo reachable through control scrolling without moving the viewport', passed: true });
      await page.screenshot({ path: `${output}/${label}.png` });
      // Save a held cursor. The saved project must restore axes/cels without a held mouse.
      await touch('touchStart', [leftTouch]);
      await page.screenshot({ path: `${output}/${label}-left-held.png` });
      await page.locator('#draw-save').click(); await touch('touchEnd', []);
      await page.waitForFunction(() => document.querySelector('#project-open').dataset.state === 'saved');
      const savedUrl = page.url(); await page.goto(savedUrl, { waitUntil: 'domcontentloaded' }); await ready();
      await page.waitForFunction(() => document.querySelector('[data-symmetry="horizontal"]')?.getAttribute('aria-pressed') === 'true');
      assert.equal(await page.locator('#draw-mirror-x').inputValue(), '5'); assert.equal(await page.locator('#draw-mirror-y').inputValue(), '6');
      assert.equal(await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('[data-virtual-left]').getAttribute('aria-pressed'), 'false');
      await page.locator('#draw-animation-play').click(); await page.waitForTimeout(120); await page.locator('#draw-animation-play').click();
      assert.deepEqual(errors, []);
      checks.push({ name: 'narrow layout, save/reload preserves moved axes and playable timeline; cursor is released', ...layout });
      results.push({ label, checks, errors }); console.log(`PASS ${label}: ${checks.length} acceptance cases`);
    } catch (error) {
      console.log('Failure layout', await page.evaluate(() => [...document.querySelector('.draw-controls').children].map(n => ({ class: n.className, hidden: n.hidden, rect: n.getBoundingClientRect().toJSON(), height: getComputedStyle(n).height, maxHeight: getComputedStyle(n).maxHeight, shrink: getComputedStyle(n).flexShrink }))));
      await page.screenshot({ path: `${output}/${label}-failure.png` }).catch(() => {}); throw error;
    } finally { await context.close(); }
  }
  await writeFile(`${output}/results.json`, JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
