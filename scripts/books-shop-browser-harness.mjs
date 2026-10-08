import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4193';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output = '/tmp/pixieed-shop-evidence';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [];
async function check(name, action) { await action(); checks.push(name); }
async function ready(page) {
  await page.goto(`${base}/books/room-preview.html`);
  await page.waitForFunction(() => document.querySelector('#room-canvas').dataset.ready === 'true');
}
const state = page => page.locator('#room-canvas').evaluate(el => ({ x: +el.dataset.playerX, y: +el.dataset.playerY }));
async function choose(page, id = 'product-dot-classroom') {
  await page.locator('#room-product-select').selectOption(id);
  await page.locator('#room-product-open').click();
}
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 900 });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin !== new URL(base).origin) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await ready(page);
    await check(`${viewport.width}: tilemap and catalog ready`, async () => {
      assert.equal(await page.locator('#room-canvas').getAttribute('data-map-mode'), 'tilemap');
      assert.ok(await page.locator('#room-product-select option').count() >= 8);
    });
    await check(`${viewport.width}: keyboard walk and collision`, async () => {
      await page.locator('#room-canvas').focus();
      const before = await state(page);
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(220); await page.keyboard.up('ArrowRight');
      assert.ok((await state(page)).x > before.x + 15);
      await page.keyboard.down('w'); await page.waitForTimeout(800); await page.keyboard.up('w');
      const hit = await state(page);
      await page.keyboard.down('w'); await page.waitForTimeout(180); await page.keyboard.up('w');
      assert.equal((await state(page)).y, hit.y);
    });
    await check(`${viewport.width}: inline detail, pause and return`, async () => {
      await choose(page);
      assert.notEqual(await page.locator('#room-product-panel').evaluate(el => el.tagName), 'DIALOG');
      assert.ok(await page.locator('#room-product-title').textContent());
      assert.equal(await page.locator('#room-product-amazon').isVisible(), false, 'unconfirmed association blocks outbound CTA');
      const before = await state(page);
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(180); await page.keyboard.up('ArrowRight');
      assert.deepEqual(await state(page), before);
      await page.locator('#room-product-close').click();
      assert.equal(await page.locator('#room-canvas').evaluate(el => document.activeElement === el), true);
      await page.keyboard.down('d'); await page.waitForTimeout(200); await page.keyboard.up('d');
      assert.ok((await state(page)).x > before.x);
    });
    await check(`${viewport.width}: no horizontal overflow or automatic external request`, async () => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      assert.deepEqual(external, []);
      assert.deepEqual(errors, []);
    });
    if (viewport.width < 900) await check(`${viewport.width}: touch swipe, pointer cancel, rotation`, async () => {
      await page.locator('#room-canvas').scrollIntoViewIfNeeded();
      const before = await state(page);
      const bounds = await page.locator('#room-canvas').boundingBox();
      const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
      await page.locator('#room-canvas').dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', clientX: x, clientY: y, button: 0 });
      await page.locator('#room-canvas').dispatchEvent('pointermove', { pointerId: 9, pointerType: 'touch', clientX: x + 40, clientY: y });
      await page.waitForTimeout(180);
      assert.ok((await state(page)).x > before.x);
      await page.locator('#room-canvas').dispatchEvent('pointercancel', { pointerId: 9 });
      const stopped = await state(page); await page.waitForTimeout(160); assert.deepEqual(await state(page), stopped);
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await page.waitForTimeout(150); assert.deepEqual(await state(page), stopped);
      await page.setViewportSize(viewport);
    });
    await choose(page);
    await page.screenshot({ path: `${output}/shop-${viewport.width}x${viewport.height}.png`, fullPage: true });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await ready(page);
  await check('reduced motion setting', async () => assert.equal(await page.locator('#room-motion-toggle').isDisabled(), true));
  await check('confirmed affiliate explicit CTA with safe attributes', async () => {
    await page.route('**/assets/books/room-commerce.json', route => route.fulfill({ json: { associateName: '検証用名称', enrollmentConfirmed: true } }));
    await ready(page); await choose(page);
    assert.equal(await page.locator('#room-product-amazon').isVisible(), true);
    assert.equal(await page.locator('#room-product-amazon').getAttribute('target'), '_blank');
    assert.match(await page.locator('#room-product-amazon').getAttribute('rel'), /sponsored/);
    assert.match(await page.locator('#room-product-amazon').getAttribute('href'), /tag=pixieed-22/);
    assert.equal(await page.locator('iframe[src*="amazon"]').count(), 0);
    await context.route('https://www.amazon.co.jp/**', route => route.fulfill({ body: 'Explicit navigation test fixture', contentType: 'text/plain' }));
    const popupPromise = page.waitForEvent('popup');
    await page.locator('#room-product-amazon').click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.match(popup.url(), /^https:\/\/www.amazon.co.jp\/dp\/B07H7DK5KH/);
    await popup.close();
    await page.locator('#room-product-close').click();
  });
  await check('sample without fabricated ASIN stays selectable', async () => {
    const sample = JSON.parse(await readFile(new URL('../assets/books/room-products.json', import.meta.url), 'utf8')).find(p => p.sample);
    assert.ok(sample); await choose(page, sample.id);
    assert.equal(await page.locator('#room-product-amazon').isVisible(), false);
    assert.match(await page.locator('#room-product-panel').textContent(), /見本|未設定/);
    await page.keyboard.press('Escape');
  });
  await check('image errors use originals fallback', async () => {
    const scene = JSON.parse(await readFile(new URL('../assets/books/room-scene.json', import.meta.url), 'utf8'));
    scene.assets.character.src = '/assets/books/missing-character.png';
    await page.route('**/assets/books/room-scene.json', route => route.fulfill({ json: scene }));
    await ready(page); assert.match(await page.locator('#room-status').textContent(), /読み込めない|仮/);
  });
  await check('blocked map retains catalog', async () => {
    const map = JSON.parse(await readFile(new URL('../assets/books/room-tilemap.json', import.meta.url), 'utf8'));
    map.collision = Array.from({ length: map.height }, () => Array(map.width).fill(1));
    await page.route('**/assets/books/room-tilemap.json', route => route.fulfill({ json: map }));
    await ready(page); await choose(page);
    assert.match(await page.locator('#room-product-title').textContent(), /ドット絵/);
  });
  await context.close();
  const safety = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const safePage = await safety.newPage();
  await check('shelf tap selects inline details without external navigation', async () => {
    await ready(safePage);
    const canvas = safePage.locator('#room-canvas');
    const rect = await canvas.boundingBox();
    const camera = await canvas.evaluate(el => ({ x: +el.dataset.cameraX, y: +el.dataset.cameraY, scale: +el.dataset.viewScale }));
    await safePage.mouse.click(rect.x + (138 - camera.x) * camera.scale, rect.y + (208 - camera.y) * camera.scale);
    assert.equal(await safePage.locator('#room-product-panel').getAttribute('data-active'), 'true');
    assert.equal(safety.pages().length, 1);
    await safePage.locator('#room-product-close').click();
  });
  await check('normal catalog retains entry and blocks unconfirmed commerce', async () => {
    await safePage.goto(`${base}/books/`);
    await safePage.locator('a[href="/books/room-preview.html"]').waitFor();
    const links = safePage.locator('[data-books-commerce-link]');
    assert.ok(await links.count() >= 7);
    for (let i = 0; i < await links.count(); i++) assert.equal(await links.nth(i).isVisible(), false);
  });
  await check('description is literal text and invalid URL has no CTA', async () => {
    await safePage.route('**/assets/books/room-products.json', route => route.fulfill({ json: [{ id: 'literal', title: '<img src=x onerror=alert(1)>', description: '<script>alert(1)</script>', asin: 'B07H7DK5KH', amazonUrl: 'javascript:alert(1)' }] }));
    await ready(safePage); await choose(safePage, 'literal');
    assert.equal(await safePage.locator('#room-product-title img').count(), 0);
    assert.equal(await safePage.locator('#room-product-description').textContent(), '<script>alert(1)</script>');
    assert.equal(await safePage.locator('#room-product-amazon').isVisible(), false);
  });
  await check('canvas unavailable retains normal catalog selection', async () => {
    await safePage.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
    await ready(safePage); await choose(safePage, 'literal');
    assert.match(await safePage.locator('#room-product-title').textContent(), /img/);
  });
  await safety.close();
  console.log(JSON.stringify({ passed: checks.length, checks, screenshots: output, browser: 'local Chromium; mobile viewports and synthetic touch, not physical devices', production: 'UNTESTED' }, null, 2));
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: checks.length, checks }, null, 2));
} finally { await browser.close(); }
