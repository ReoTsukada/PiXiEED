import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href);
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local server required.');
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]]) {
    const context = await browser.newContext({ viewport: { width, height } }); const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.fulfill({ status: 200, json: [] }));
    await page.goto(`${base}/hidden-object/`);
    const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 16; const ctx = c.getContext('2d'); ctx.fillStyle = '#5595bc'; ctx.fillRect(0, 0, 16, 16); ctx.fillStyle = '#ef7964'; ctx.fillRect(4, 4, 2, 2); return c.toDataURL('image/png').split(',')[1]; });
    await page.locator('#hidden-image-file').setInputFiles({ name: 'own-picture.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
    await page.waitForFunction(() => !document.querySelector('#hidden-editor').hidden);
    await page.locator('#hidden-name').fill('赤い花'); await page.locator('#hidden-add').click();
    await page.locator('#hidden-canvas').click({ position: { x: 5 / 16 * (await page.locator('#hidden-canvas').boundingBox()).width, y: 5 / 16 * (await page.locator('#hidden-canvas').boundingBox()).height } });
    await page.locator('#hidden-confirm').click();
    await page.waitForFunction(() => !document.querySelector('#hidden-play-local').disabled);
    const measured = await page.evaluate(() => {
      const canvas = document.querySelector('#hidden-canvas').getBoundingClientRect(), svg = document.querySelector('#hidden-hit-preview'), rect = svg.getBoundingClientRect();
      return { overflowX: document.documentElement.scrollWidth > innerWidth + 1, overflowY: document.documentElement.scrollHeight > innerHeight + 1, overlay: !svg.hasAttribute('hidden') && getComputedStyle(svg).display !== 'none', labels: [...svg.querySelectorAll('text')].map(n => n.textContent), aligned: Math.abs(canvas.x - rect.x) < 1 && Math.abs(canvas.y - rect.y) < 1 && Math.abs(canvas.width - rect.width) < 1 && Math.abs(canvas.height - rect.height) < 1 };
    });
    assert.equal(measured.overflowX, false); assert.equal(measured.overflowY, false); assert.equal(measured.overlay, true); assert.equal(measured.aligned, true); assert.deepEqual(measured.labels, ['1']); assert.equal(await page.locator('#hidden-publish').isEnabled(), false); assert.deepEqual(errors, []);
    const controls = await page.evaluate(() => {
      const nav = document.querySelector('.app-tabs').getBoundingClientRect();
      return [...document.querySelectorAll('.hidden-publish-actions button:not([hidden])')].map(button => { const r = button.getBoundingClientRect(); return { id: button.id, width: r.width, height: r.height, visible: r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= nav.top + 1 }; });
    });
    assert.ok(controls.every(c => c.width >= 60 && c.height <= 80 && c.visible), `confirmation controls clipped: ${JSON.stringify(controls)}`);
    await page.waitForTimeout(1100); // Let the one-shot confirmation burst settle for visual review.
    await page.screenshot({ path: `/tmp/pixieed-hidden-maker-review-${width}.png` });
    await page.locator('#hidden-play-local').click(); await page.waitForURL(/\/play\/hidden-object\/\?localHidden=/);
    await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('0 / 1'));
    console.log(JSON.stringify({ width, height, ...measured, localPlay: 'PASS', errors })); await context.close();
  }
} finally { await browser.close(); }
