import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.fulfill({ json: [] }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      globalThis.__smartAudioStarts = 0;
      const Native = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Native) return;
      const original = Native.prototype.createOscillator;
      Native.prototype.createOscillator = function (...args) { globalThis.__smartAudioStarts++; return original.apply(this, args); };
    });
    await page.goto(`${base}/draw/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#draw-animation-controls .animation-controls');
    const pen = page.locator('[data-draw-tool="pen"]');
    assert.equal(await page.locator('[data-draw-tool="eraser"]').count(), 0);
    const tap = async (selector, x, y) => {
      const canvas = page.locator(selector), r = await canvas.boundingBox();
      const size = await canvas.evaluate(c => ({ width: c.width, height: c.height }));
      await page.mouse.click(r.x + (x + .5) * r.width / size.width, r.y + (y + .5) * r.height / size.height);
    };
    const alpha = (selector, x, y) => page.locator(selector).evaluate((c, { x, y }) => c.getContext('2d').getImageData(x, y, 1, 1).data[3], { x, y });
    await tap('#draw-canvas', 4, 4); assert.equal(await alpha('#draw-canvas', 4, 4), 255);
    await pen.click(); assert.equal(await pen.getAttribute('aria-pressed'), 'true'); assert.equal(await pen.evaluate(n => n.classList.contains('is-eraser')), true);
    await tap('#draw-canvas', 4, 4); assert.equal(await alpha('#draw-canvas', 4, 4), 0);
    await pen.click(); assert.equal(await pen.evaluate(n => n.classList.contains('is-eraser')), false);
    await tap('#draw-canvas', 4, 4); assert.equal(await alpha('#draw-canvas', 4, 4), 255);
    await pen.click(); await page.locator('.draw-color[data-color-index="2"]').click();
    assert.equal(await pen.evaluate(n => n.classList.contains('is-eraser')), false, 'a color selection resumes drawing');
    await page.locator('#draw-output > summary').click(); assert.equal(await page.locator('#draw-animation-export').isVisible(), true);
    await page.locator('#draw-output > summary').click();
    await page.screenshot({ path: `/tmp/pixieed-smart-draw-${viewport.width}.png` });
    const layout = () => page.evaluate(() => ({ wide: document.documentElement.scrollWidth > innerWidth, tall: document.documentElement.scrollHeight > innerHeight + 1 }));
    assert.deepEqual(await layout(), { wide: false, tall: false });
    await page.goto(`${base}/audio/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#audio-pixel-canvas'); await page.waitForFunction(() => !document.querySelector('#main').inert);
    assert.equal(await page.locator('#audio-tool-eraser').count(), 0);
    const musicPen = page.locator('#audio-tool-pen');
    const musicPixel = () => page.locator('#audio-pixel-canvas').evaluate(c => Array.from(c.getContext('2d').getImageData(4, 4, 1, 1).data));
    const blank = await musicPixel(); await tap('#audio-pixel-canvas', 4, 4); assert.notDeepEqual(await musicPixel(), blank);
    await page.waitForFunction(() => __smartAudioStarts > 0); const starts = await page.evaluate(() => __smartAudioStarts);
    await musicPen.click(); assert.equal(await musicPen.evaluate(n => n.classList.contains('is-eraser')), true);
    await tap('#audio-pixel-canvas', 4, 4); assert.deepEqual(await musicPixel(), blank);
    assert.equal(await page.evaluate(() => __smartAudioStarts), starts, 'erasing never previews a sound');
    await musicPen.click(); assert.equal(await musicPen.evaluate(n => n.classList.contains('is-eraser')), false);
    await tap('#audio-pixel-canvas', 4, 4); assert.notDeepEqual(await musicPixel(), blank);
    await page.waitForFunction(before => __smartAudioStarts > before, starts);
    assert.deepEqual(await layout(), { wide: false, tall: false });
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}x${viewport.height}: one pen/eraser control, drawing and erasing, color reset, GIF menu, Draw/Audio viewport`);
    await context.close();
  }
} finally { await browser.close(); }
