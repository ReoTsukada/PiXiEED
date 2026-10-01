import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
const rect = (page, selector) => page.locator(selector).evaluate((node) => {
  const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
});
const paint = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${base}/jigsaw/`, { waitUntil: 'domcontentloaded' });
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#7ebcdb'; ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = '#de6760'; ctx.fillRect(8, 8, 16, 16);
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#jigsaw-source-kind').evaluate((node) => { node.value = 'file'; node.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.locator('#jigsaw-file').setInputFiles({ name: 'preview-fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => /\d.*ピース/.test(document.querySelector('.arc-card-count')?.textContent || ''));
    await page.locator('#jigsaw-start').click();
    await page.locator('#jigsaw-play').waitFor({ state: 'visible' }); await paint(page);
    const workspace = await rect(page, '#jigsaw-workspace');
    const matrix = await page.locator('#jigsaw-board').evaluate((node) => Array.from(node.getContext('2d').getTransform().toFloat64Array()));
    await page.locator('#jigsaw-preview-toggle').click(); await paint(page);
    await page.screenshot({ path: `/tmp/pixieed-jigsaw-floating-${viewport.width}.png` });
    assert.deepEqual(await rect(page, '#jigsaw-workspace'), workspace, 'opening preview does not resize the table');
    assert.equal(await page.locator('#jigsaw-preview').evaluate((node) => node.parentElement === document.body && getComputedStyle(node).position === 'fixed'), true);
    const handle = page.locator('.jigsaw-preview__head');
    const before = await rect(page, '#jigsaw-preview'); const h = await handle.boundingBox();
    await page.mouse.move(h.x + 24, h.y + h.height / 2); await page.mouse.down();
    await page.mouse.move(h.x + 24 - 60, h.y + h.height / 2 + 70, { steps: 8 }); await page.mouse.up(); await paint(page);
    const moved = await rect(page, '#jigsaw-preview');
    assert.ok(moved.x < before.x - 40 && moved.y > before.y + 40, 'mouse drag moves the reference');
    assert.deepEqual(await rect(page, '#jigsaw-workspace'), workspace);
    assert.deepEqual(await page.locator('#jigsaw-board').evaluate((node) => Array.from(node.getContext('2d').getTransform().toFloat64Array())), matrix, 'dragging preview does not pan the puzzle');
    await page.locator('#jigsaw-preview-close').click();
    await page.locator('#jigsaw-preview').waitFor({ state: 'hidden' });
    await page.locator('#jigsaw-preview-toggle').click(); await paint(page);
    assert.deepEqual(await rect(page, '#jigsaw-preview'), moved, 'reopening keeps its position');
    const header = await handle.boundingBox();
    await handle.dispatchEvent('pointerdown', { pointerId: 51, pointerType: 'touch', button: 0, clientX: header.x + 20, clientY: header.y + 20, bubbles: true });
    await handle.dispatchEvent('pointermove', { pointerId: 51, pointerType: 'touch', clientX: header.x + 40, clientY: header.y + 50, bubbles: true });
    await handle.dispatchEvent('pointerup', { pointerId: 51, pointerType: 'touch', bubbles: true }); await paint(page);
    const touched = await rect(page, '#jigsaw-preview');
    assert.ok(touched.y > moved.y + 20, 'touch pointer moves the reference');
    const hh = await handle.boundingBox();
    await page.mouse.move(hh.x + 20, hh.y + 20); await page.mouse.down();
    await page.mouse.move(-200, -200); await page.mouse.up(); await paint(page);
    const corner = await rect(page, '#jigsaw-preview'); assert.ok(corner.x >= 0 && corner.y >= 0);
    assert.equal(await page.locator('.jigsaw-preview__head').evaluate((node) => {
      const r = node.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + 20, r.y + 20); return node === hit || node.contains(hit);
    }), true, 'preview stays above the site header');
    await page.setViewportSize({ width: 320, height: 320 }); await paint(page);
    const resized = await rect(page, '#jigsaw-preview');
    assert.ok(resized.x >= 0 && resized.y >= 0 && resized.x + resized.width <= 320 && resized.y + resized.height <= 320, 'resize keeps the entire window reachable');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
    await page.keyboard.press('Escape'); await page.locator('#jigsaw-preview').waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: floating layer, mouse/touch drag, table unchanged, position retained, resize, close`);
    await context.close();
  }
} finally { await browser.close(); }
