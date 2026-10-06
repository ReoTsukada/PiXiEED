/** Native selection actions and committed pixel bounds; use fresh, isolated local tabs. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_SELECTION_ACTION_OUTPUT || '/tmp/pixieed-selection-actions-fix-20261006';
await mkdir(output, { recursive: true });
const runtime = '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const engines = (process.env.PIXIEED_SELECTION_ACTION_ENGINES || 'chromium').split(',');
const results = [];
const variants = [{ width: 320, height: 568, dpr: 2 }, { width: 390, height: 844, dpr: 3 }, { width: 844, height: 390, dpr: 2 }, { width: 1280, height: 800, dpr: 1 }].filter(v => !process.env.PIXIEED_SELECTION_ACTION_WIDTH || v.width === Number(process.env.PIXIEED_SELECTION_ACTION_WIDTH));
for (const engine of engines) {
  const modulePath = engine === 'webkit' ? process.env.PIXIEED_WEBKIT_PLAYWRIGHT_MODULE || runtime : runtime;
  const playwright = await import(pathToFileURL(modulePath).href);
  const browser = await playwright[engine].launch({ headless: true, ...(engine === 'webkit' && process.env.PIXIEED_WEBKIT_EXECUTABLE ? { executablePath: process.env.PIXIEED_WEBKIT_EXECUTABLE } : {}) });
  try { for (const viewport of variants) for (const virtual of [false, true]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr, hasTouch: true }), page = await context.newPage();
    const label = `${engine}-${viewport.width}x${viewport.height}-virtual-${virtual}`, errors = [], checks = [], trace = [];
    page.setDefaultTimeout(5000); page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    await context.addInitScript(() => {
      window.__selectionClicks = [];
      document.addEventListener('click', event => {
        const button = event.target.closest?.('#draw-selection-controls button');
        if (button) window.__selectionClicks.push({ action: button.dataset.selectionAction, trusted: event.isTrusted, pointerType: event.pointerType });
      }, true);
    });
    const rgba = async () => { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); return page.locator('#draw-canvas').evaluate(c => [...c.getContext('2d').getImageData(0, 0, c.width, c.height).data]); };
    const frame = () => page.locator('.draw-selection').evaluate(n => Object.fromEntries(['x', 'y', 'width', 'height', 'angle'].map(k => [k, Number(n.dataset[k])])));
    const at = async (x, y) => { const r = await page.locator('#draw-canvas').boundingBox(); return { x: r.x + x * r.width / 16, y: r.y + y * r.height / 16 }; };
    const center = async selector => { const r = await page.locator(selector).boundingBox(); assert.ok(r, selector); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    const nativeTap = async (selector, touch = false) => {
      const point = await center(selector); assert.equal(await page.locator(selector).isEnabled(), true, selector + ' enabled before input');
      assert.equal(await page.locator(selector).evaluate((n, p) => n.contains(document.elementFromPoint(p.x, p.y)), point), true, selector + ' actual hit target');
      if (touch) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
      await page.waitForTimeout(30);
    };
    const action = async (name, touch = false) => {
      const selector = `[data-selection-action="${name}"]`, clicks = await page.evaluate(() => window.__selectionClicks.length);
      await nativeTap(selector, touch);
      const events = await page.evaluate(() => window.__selectionClicks.slice(-1));
      assert.equal(await page.evaluate(() => window.__selectionClicks.length), clicks + 1, name + ' emits exactly one native click');
      assert.equal(events[0].trusted, true); assert.equal(events[0].action, name);
    };
    const setVirtual = async value => {
      if ((await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed') === 'true') === value) return;
      await nativeTap('#draw-settings-summary'); await nativeTap('#draw-virtual-toggle'); await page.keyboard.press('Escape');
    };
    const drag = async (from, to, alt = false) => {
      if (alt) await page.keyboard.down('Alt');
      let start = from, end = to;
      if (await page.locator('#draw-virtual-toggle').getAttribute('aria-pressed') === 'true') {
        const board = await page.locator('.draw-board').boundingBox();
        start = { x: board.x + board.width / 2, y: board.y + board.height / 2 };
        const anchor = async () => { await page.mouse.move(board.x - 2, board.y + board.height / 2); await page.mouse.move(start.x, start.y); };
        for (let i = 0; i < 12; i++) {
          await anchor(); const marker = await page.locator('.draw-virtual-marker').boundingBox();
          const dx = from.x - marker.x - marker.width / 2, dy = from.y - marker.y - marker.height / 2;
          if (Math.hypot(dx, dy) < (engine === 'webkit' ? .9 : .1)) break;
          const ratio = Math.min(1, (board.width / 2 - 8) / Math.max(Math.abs(dx), .01), (board.height / 2 - 8) / Math.max(Math.abs(dy), .01));
          await page.mouse.move(start.x + dx * ratio, start.y + dy * ratio, { steps: 4 });
        }
        await anchor(); const marker = await page.locator('.draw-virtual-marker').boundingBox();
        assert.ok(Math.hypot(from.x - marker.x - marker.width / 2, from.y - marker.y - marker.height / 2) < (engine === 'webkit' ? 1 : .2), 'relative mouse pad reaches requested selection handle: ' + JSON.stringify({ from, marker, start }));
        end = { x: start.x + to.x - from.x, y: start.y + to.y - from.y };
      } else await page.mouse.move(start.x, start.y);
      await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up();
      if (alt) await page.keyboard.up('Alt'); await page.waitForTimeout(40);
    };
    const move = async (dx, dy) => { const f = await frame(), x = f.x + f.width / 2, y = f.y + f.height / 2; await drag(await at(x, y), await at(x + dx, y + dy), true); };
    const chooseTool = async tool => { await nativeTap('#draw-tool-summary'); const selector = `[data-draw-tool="${tool}"]`; await page.locator(selector).scrollIntoViewIfNeeded(); await nativeTap(selector); };
    let fixture;
    const fresh = async () => {
      await setVirtual(false); await page.locator('#draw-canvas').focus(); await page.keyboard.press('Digit0'); await page.locator('#draw-import-file').setInputFiles({ name: 'selection-native-fixture.png', mimeType: 'image/png', buffer: fixture });
      await page.waitForFunction(() => !document.querySelector('#main').inert && document.querySelector('#draw-canvas').getContext('2d').getImageData(3, 4, 1, 1).data[0] === 255);
      await chooseTool('select'); await drag(await at(3.5, 4.5), await at(6.5, 6.5));
      assert.deepEqual(await frame(), { x: 3, y: 4, width: 4, height: 3, angle: 0 });
      await setVirtual(virtual);
    };
    const group = async (name, run) => { if (process.env.PIXIEED_SELECTION_ACTION_GROUP && !name.includes(process.env.PIXIEED_SELECTION_ACTION_GROUP)) return; await run(); checks.push(name); console.log('PASS', label, name); };
    try {
      await page.goto(base + '/draw/'); await page.waitForFunction(() => document.documentElement.dataset.drawReady === 'true' && !document.querySelector('#main').inert);
      fixture = Buffer.from(await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'), colors = ['#ff0000', '#00ff00', '#0000ff'], pattern = [0, 1, -1, 2, -1, 0, -1, -1, 2, -1, 1, 0];
        for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) if (pattern[y * 4 + x] >= 0) { g.fillStyle = colors[pattern[y * 4 + x]]; g.fillRect(x + 3, y + 4, 1, 1); }
        g.fillStyle = '#0000ff'; g.fillRect(10, 4, 2, 3); return c.toDataURL('image/png').split(',')[1];
      }), 'base64');
      await group('selection alone and native held Copy keep stable text nodes and emit a trusted click', async () => {
        await fresh(); const before = await frame(), pixels = await rgba(), selector = '[data-selection-action="copy"]', q = await center(selector);
        await page.locator(selector).evaluate(n => { window.__pressedLabel = n.firstChild; });
        await page.mouse.move(q.x, q.y); await page.mouse.down();
        assert.equal(await page.locator(selector).evaluate(n => n.firstChild === window.__pressedLabel), true);
        await page.mouse.up(); assert.deepEqual(await frame(), before); assert.deepEqual(await rgba(), pixels);
        assert.equal(await page.locator('[data-selection-action="paste"]').isEnabled(), true); await action('back');
      });
      await group('three subpixel moves create no transaction and preserve dimensions and pixels', async () => {
        await fresh(); const original = await rgba();
        for (let i = 0; i < 3; i++) { await move(.25, .25); assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'false', 'subpixel move makes no transaction'); const before = await frame(), preview = await rgba(); const after = await frame(); trace.push({ operation: 'fractional move', before, after }); assert.equal(after.width, 4); assert.equal(after.height, 3); assert.deepEqual(await rgba(), preview); assert.deepEqual(preview, original); }
      });
      await group('Copy/Paste fractional placement and repeated untransformed confirmations do not grow', async () => {
        await fresh(); await action('copy'); await action('paste'); await move(1.25, .25); const preview = await rgba(); await action('confirm'); const first = await frame(); assert.equal(first.width, 4); assert.equal(first.height, 3); assert.deepEqual(await rgba(), preview);
        for (let i = 0; i < 3; i++) { await action('paste'); await action('confirm'); assert.deepEqual(await frame(), first); assert.deepEqual(await rgba(), preview); }
      });
      await group('Cut/Paste cancellation keeps Cut and native Undo restores the source', async () => {
        await fresh(); const before = await rgba(); await action('cut'); const cut = await rgba(); assert.notDeepEqual(cut, before); await action('paste'); await move(1.25, .25); await action('cancel'); assert.deepEqual(await rgba(), cut); await nativeTap('#draw-undo'); assert.deepEqual(await rgba(), before);
      });
      const cornerTransform = async (scale, angle) => {
        const a = await center('[data-selection-control="se"]'), pivot = await center('[data-selection-control="pivot"]'), dx = a.x - pivot.x, dy = a.y - pivot.y, t = angle * Math.PI / 180;
        await drag(a, { x: pivot.x + scale * (dx * Math.cos(t) - dy * Math.sin(t)), y: pivot.y + scale * (dx * Math.sin(t) + dy * Math.cos(t)) });
      };
      await group('native scale confirmation retains its intended dimensions and preview image', async () => {
        await fresh(); await cornerTransform(1.5, 0); const before = await frame(), preview = await rgba(); await action('confirm'); const after = await frame(); assert.equal(after.width, before.width); assert.equal(after.height, before.height); assert.deepEqual(await rgba(), preview); trace.push({ operation: 'scale', before, after });
      });
      await group('rotation changes raster bounds once; repeated no-transform Paste confirms stay stable', async () => {
        await fresh(); await cornerTransform(1, 37); const before = await frame(), preview = await rgba(); assert.ok(Math.abs(before.angle - 37) < (engine === 'webkit' && virtual ? 3 : 1), 'native free rotation angle ' + before.angle); await action('confirm'); const first = await frame(); trace.push({ operation: 'rotation', before, after: first }); assert.deepEqual(await rgba(), preview); if (!await page.locator('[data-selection-action=copy]').count()) await action('back'); await action('copy');
        for (let i = 0; i < 3; i++) { await action('paste'); await action('confirm'); assert.deepEqual(await frame(), first); assert.deepEqual(await rgba(), preview); }
      });
      await group('native horizontal and vertical flip confirmation never changes dimensions', async () => {
        for (const axis of ['x', 'y']) { await fresh(); const q = await center(`[data-selection-control="flip-${axis}"]`); await drag(q, q); const preview = await rgba(); await action('confirm'); assert.equal((await frame()).width, 4); assert.equal((await frame()).height, 3); assert.deepEqual(await rgba(), preview); }
      });
      await group('native touchscreen Copy/Paste/Confirm/Cancel retain their hit targets and emit one click each', async () => {
        await fresh(); const before = await rgba(); await action('copy', true); await action('paste', true); await action('confirm', true); assert.deepEqual(await rgba(), before); await action('paste', true); await action('cancel', true); assert.deepEqual(await rgba(), before);
      });
      await group('zoomed and panned movement preserves grab offset and uses total original-pixel grid displacement', async () => {
        await fresh(); await setVirtual(false); await page.locator('#draw-canvas').focus(); await page.keyboard.press('Equal');
        assert.equal(await page.locator('#draw-zoom-label').textContent(), '150%');
        const zoomPoint = await at(8, 8); await page.mouse.move(zoomPoint.x, zoomPoint.y); await page.mouse.wheel(0, -17); await page.waitForTimeout(120);
        const panStart = await at(8, 8); await page.keyboard.down('Space'); await drag(panStart, { x: panStart.x + 32, y: panStart.y + 12 }); await page.keyboard.up('Space');
        await setVirtual(virtual); const initial = await frame();
        const canvasBox = await page.locator('#draw-canvas').boundingBox();
        assert.ok(Math.abs(canvasBox.width / 16 - Math.round(canvasBox.width / 16)) > 1e-4, 'noninteger screen pixels per original pixel: ' + JSON.stringify({ canvasBox, transform: await page.locator('#draw-canvas').evaluate(n => n.style.transform), zoom: await page.locator('#draw-zoom-label').textContent() }));
        await drag(await at(4.3, 5.1), await at(4.55, 5.35), true);
        assert.deepEqual(await frame(), initial); assert.equal(await page.locator('#draw-selection-controls').getAttribute('data-pending'), 'false');
        await drag(await at(4.3, 5.1), await at(6.55, 3.85), true);
        const moved = await frame(); assert.deepEqual(moved, { ...initial, x: initial.x + 2, y: initial.y - 1 });
        const preview = await rgba(); await action('confirm'); assert.deepEqual(await frame(), moved); assert.deepEqual(await rgba(), preview);
        trace.push({ operation: 'grid at zoom/pan', initial, moved, canvasBox, dpr: viewport.dpr });
      });
      assert.deepEqual(errors, []); await page.screenshot({ path: `${output}/${label}.png` }); results.push({ label, checks, trace, errors, clicks: await page.evaluate(() => window.__selectionClicks) });
    } catch (error) { results.push({ label, checks, trace, errors, failure: error.stack }); await page.screenshot({ path: `${output}/${label}-failure.png` }).catch(() => {}); throw error; }
    finally { await context.close(); await writeFile(output + '/results.json', JSON.stringify({ results }, null, 2)); }
  } } finally { await browser.close(); }
}
const files = ['draw/index.html', 'js/creation/draw-entry.mjs', 'js/creation/draw-page.mjs', 'js/creation/draw-selection-panel.mjs', 'js/creation/draw-selection-session.mjs', 'js/creation/draw-selection-operations.mjs'];
const sourceHashes = Object.fromEntries(await Promise.all(files.map(async p => [p, createHash('sha256').update(await readFile(p)).digest('hex')])));
await writeFile(output + '/results.json', JSON.stringify({ results, sourceHashes }, null, 2));
console.log('PASS', results.length, 'browser/viewport/virtual cases', results.reduce((n, r) => n + r.checks.length, 0), 'native selection groups');
