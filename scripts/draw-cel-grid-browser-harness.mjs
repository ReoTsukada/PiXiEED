import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
    const page = await context.newPage(); const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#draw-animation-controls .animation-controls');
    const panel = () => page.locator('#draw-animation-controls-panel');
    const openPanel = async () => { if (!(await panel().isVisible())) await page.locator('#draw-animation-controls [data-action="toggle-frames"]').click(); };
    assert.equal(await panel().isVisible(), false, 'animation details are hidden on entry');
    await page.screenshot({ path: `/tmp/pixieed-draw-compact-${viewport.width}.png` });
    const tableBefore = await page.locator('#draw-canvas').boundingBox();
    await openPanel();
    assert.deepEqual(await page.locator('#draw-canvas').boundingBox(), tableBefore, 'opening panel does not shrink the canvas');
    const cel = () => page.locator('#draw-animation-controls-panel [data-action="select-cel"]');
    assert.equal(await cel().count(), 1);
    assert.equal(await cel().first().getAttribute('data-has-content'), 'false');
    const tap = async () => {
      if (await panel().isVisible()) await page.locator('[data-action="close-animation"]').click();
      const r = await page.locator('#draw-canvas').boundingBox(); await page.mouse.click(r.x + r.width * 0.28, r.y + r.height * 0.28);
    };
    await tap(); assert.equal(await cel().first().getAttribute('data-has-content'), 'true');
    await page.locator('#draw-undo').click(); assert.equal(await cel().first().getAttribute('data-has-content'), 'false');
    await page.locator('#draw-redo').click(); assert.equal(await cel().first().getAttribute('data-has-content'), 'true');
    await openPanel(); await page.locator('.animation-controls__frame-add').click();
    assert.equal(await cel().count(), 2); assert.equal(await cel().nth(1).getAttribute('data-has-content'), 'true');
    await page.locator('.animation-controls__layer-add').click();
    assert.equal(await cel().count(), 4);
    const topLayerId = await cel().first().getAttribute('data-layer-id');
    const firstFrameId = await cel().first().getAttribute('data-frame-id');
    assert.equal(await cel().first().getAttribute('data-has-content'), 'false');
    const target = () => page.locator(`[data-action="select-cel"][data-layer-id="${topLayerId}"][data-frame-id="${firstFrameId}"]`);
    await target().click();
    assert.equal(await target().getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('[data-action="select-cel"][aria-selected="true"]').count(), 1);
    await tap(); assert.equal(await target().getAttribute('data-has-content'), 'true');
    await page.locator('#draw-undo').click(); assert.equal(await target().getAttribute('data-has-content'), 'false');
    await page.locator('#draw-redo').click(); assert.equal(await target().getAttribute('data-has-content'), 'true');
    const selectedStyle = await target().evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, radius: getComputedStyle(node).borderRadius, color: getComputedStyle(node).color }));
    assert.equal(selectedStyle.background, 'rgb(255, 211, 90)', JSON.stringify(selectedStyle));
    assert.equal(selectedStyle.radius, '0px');
    await openPanel();
    const dimensions = await panel().evaluate((root) => [...root.querySelectorAll('.animation-controls__frame, .animation-controls__layer-number, .animation-controls__cel')].map((node) => {
      const r = node.getBoundingClientRect(); return { width: r.width, height: r.height };
    }));
    assert.ok(dimensions.every(({ width, height }) => width === 44 && height === 44), JSON.stringify(dimensions));
    const layout = await page.evaluate(() => {
      const r = document.querySelector('#draw-canvas').getBoundingClientRect(), nav = document.querySelector('.app-tabs').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight + 1, canvasHeight: r.height, canvasBottom: r.bottom, navTop: nav.top };
    });
    assert.equal(layout.overflow, false, JSON.stringify(layout)); assert.ok(layout.canvasHeight > 70 && layout.canvasBottom < layout.navTop, JSON.stringify(layout));
    const permanentControls = await page.locator('.draw-current, [data-draw-tool="pen"]').evaluateAll((nodes) => nodes.map((node) => {
      const r = node.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return { label: node.getAttribute('aria-label'), reachable: r.top >= 0 && r.bottom <= innerHeight && (hit === node || node.contains(hit)) };
    }));
    assert.ok(permanentControls.every(({ reachable }) => reachable), JSON.stringify(permanentControls));
    const selectedReachable = await target().evaluate((node) => {
      const r = node.getBoundingClientRect(), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return hit === node || node.contains(hit);
    });
    assert.equal(selectedReachable, true, 'selected cel remains reachable below the sticky frame header');
    await page.screenshot({ path: `/tmp/pixieed-draw-cel-grid-${viewport.width}.png` });
    await page.locator('[data-action="close-animation"]').click(); assert.equal(await panel().isVisible(), false);
    await openPanel(); await page.keyboard.press('Escape'); assert.equal(await panel().isVisible(), false);
    await openPanel(); await page.locator('[data-draw-tool="pen"]').click(); assert.equal(await panel().isVisible(), false, 'drawing tool tap dismisses the panel');
    assert.deepEqual(errors, []);
    // Isolate number typography: layer limits remain unchanged; this view fixture checks two digits on both axes.
    await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (base) => {
      const { mountAnimationControls } = await import(`${base}/js/creation/animation-controls.mjs`);
      const { createModeScope } = await import(`${base}/js/creation/mode-scope.mjs`);
      const host = document.createElement('div'); host.id = 'number-fixture'; host.style.cssText = 'position:fixed;inset:70px 12px auto;z-index:80;background:#202a33'; document.body.append(host);
      const state = { frames: Array.from({ length: 12 }, (_, i) => ({ id: `f${i + 1}`, durationMs: 100 })), layers: Array.from({ length: 12 }, (_, i) => ({ id: `l${i + 1}`, name: `Layer ${i + 1}`, visible: true, locked: false })), frameId: 'f10', layerId: 'l10' };
      globalThis.numberActions = [];
      globalThis.numberControls = mountAnimationControls({ host, scope: createModeScope(), getState: () => state, getCelHasContent: () => false, onAction: (action) => globalThis.numberActions.push(action) });
    }, base);
    await page.locator('#number-fixture [data-action="toggle-frames"]').click();
    const twoDigits = await page.locator('#number-fixture-panel .animation-controls__frame, #number-fixture-panel .animation-controls__layer-number').evaluateAll((nodes) => nodes.filter((node) => node.textContent.trim() === '10').map((node) => {
      const r = node.getBoundingClientRect(); return { width: r.width, height: r.height, fits: node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight };
    }));
    assert.equal(twoDigits.length, 2); assert.ok(twoDigits.every((r) => r.width === 44 && r.height === 44 && r.fits), JSON.stringify(twoDigits));
    await page.locator('#number-fixture-panel [data-action="select-frame"][data-frame-id="f10"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.deepEqual(await page.evaluate(() => numberActions), [{ type: 'select-frame', frameId: 'f11' }], 'frame keyboard action is dispatched once through portal bubbling');
    console.log(`PASS ${viewport.width}x${viewport.height}: content marks, atomic cel selection, undo/redo, equal 44px cells, two-digit headers, viewport`);
    await context.close();
  }
} finally { await browser.close(); }
