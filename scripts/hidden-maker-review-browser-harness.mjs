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
    const imageFile = { name: 'own-picture.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
    if (width === 320) {
      await page.locator('#hidden-image-slot').evaluate((host, encoded) => {
        const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
        const transfer = new DataTransfer(); transfer.items.add(new File([bytes], 'own-picture.png', { type: 'image/png' }));
        host.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: transfer }));
        host.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
      }, data);
    } else {
      await page.locator('#hidden-image-file').setInputFiles(imageFile);
    }
    await page.waitForFunction(() => document.querySelector('#hidden-image-slot img[data-slot-preview]')?.getAttribute('src'));
    assert.equal(await page.locator('#hidden-editor').isHidden(), true, 'preview selection must not start the editor');
    await page.locator('#hidden-start').click();
    await page.waitForFunction(() => !document.querySelector('#hidden-editor').hidden);
    await page.locator('#hidden-name').fill('赤い花'); await page.locator('#hidden-add').click();
    await page.locator('#hidden-canvas').click({ position: { x: 5 / 16 * (await page.locator('#hidden-canvas').boundingBox()).width, y: 5 / 16 * (await page.locator('#hidden-canvas').boundingBox()).height } });
    const sharedPrompt = 'りんごがあるよ、鍵が6こ';
    await page.locator('.hidden-share-prompt summary').click();
    await page.locator('#hidden-share-prompt-text').fill(sharedPrompt);
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
    await page.locator('#hidden-new').click();
    assert.equal(await page.locator('#hidden-image-slot').getAttribute('data-filled'), null, 'new maker must clear the staged image');
    assert.equal(await page.locator('#hidden-share-prompt-text').inputValue(), '', 'new maker must clear the previous prompt');
    await page.reload();
    await page.locator('#hidden-resume').waitFor({ state: 'visible' });
    await page.locator('#hidden-resume').click();
    await page.waitForFunction(() => !document.querySelector('#hidden-editor').hidden);
    assert.equal(await page.locator('#hidden-share-prompt-text').inputValue(), sharedPrompt, 'saved prompt must be restored with the draft');
    await page.locator('#hidden-play-local').click(); await page.waitForURL(/\/play\/hidden-object\/\?localHidden=/);
    await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('0 / 1'));
    let importRace = 'SKIP';
    if (width === 320) {
      const racePage = await context.newPage();
      racePage.on('pageerror', error => errors.push(error.message));
      await racePage.addInitScript(() => {
        const original = window.createImageBitmap.bind(window); const releases = [];
        window.__bitmapCalls = 0;
        window.__releaseBitmap = (index) => releases[index]?.();
        window.createImageBitmap = (...args) => {
          const index = ++window.__bitmapCalls;
          if (index !== 2 && index !== 3) return original(...args);
          return original(...args).then(bitmap => new Promise(resolve => {
            releases[index] = () => resolve(bitmap);
            window.dispatchEvent(new Event(`bitmap-ready-${index}`));
          }));
        };
      });
      await racePage.goto(`${base}/hidden-object/`);
      const otherData = await racePage.evaluate(() => { const c = document.createElement('canvas'); c.width = 24; c.height = 16; const ctx = c.getContext('2d'); ctx.fillStyle = '#365f91'; ctx.fillRect(0, 0, 24, 16); ctx.fillStyle = '#f4b84b'; ctx.fillRect(12, 3, 4, 5); return c.toDataURL('image/png').split(',')[1]; });
      const initialFile = { name: 'initial-picture.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
      const firstFile = { name: 'slow-picture.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
      const secondFile = { name: 'new-picture.png', mimeType: 'image/png', buffer: Buffer.from(otherData, 'base64') };
      await racePage.locator('#hidden-image-file').setInputFiles(initialFile);
      await racePage.waitForFunction(() => document.querySelector('#hidden-image-slot').dataset.filled === 'true');
      await racePage.locator('#hidden-start').click();
      await racePage.waitForFunction(() => !document.querySelector('#hidden-editor').hidden);
      await racePage.locator('#hidden-name').fill('元の対象'); await racePage.locator('#hidden-add').click();
      await racePage.locator('.hidden-share-prompt summary').click();
      await racePage.locator('#hidden-share-prompt-text').fill('前の作品の文言');
      racePage.once('dialog', dialog => dialog.accept());
      const firstChooser = racePage.waitForEvent('filechooser');
      await racePage.locator('#hidden-image-replace').click();
      await (await firstChooser).setFiles(firstFile);
      await racePage.waitForFunction(() => document.querySelector('#hidden-image-slot').dataset.filled === 'true');
      await racePage.locator('#hidden-start').click();
      await racePage.waitForFunction(() => window.__bitmapCalls === 2);
      await racePage.locator('#project-open').click();
      await racePage.locator('#project-new').click();
      await racePage.waitForFunction(() => document.querySelector('#hidden-status').textContent.includes('新しい作品を作りました。'));
      await racePage.waitForFunction(() => document.querySelector('#hidden-editor').hidden && !document.querySelector('#hidden-setup').hidden);
      assert.equal(await racePage.locator('#hidden-share-prompt-text').inputValue(), '', 'switching to another PXD project must clear its prompt');
      assert.equal(await racePage.locator('#hidden-image-slot').getAttribute('data-filled'), null, 'switching to another PXD project must clear the staged image');
      await racePage.locator('#hidden-image-file').setInputFiles(secondFile);
      await racePage.waitForFunction(() => document.querySelector('#hidden-image-slot').dataset.filled === 'true');
      await racePage.locator('#hidden-start').click();
      await racePage.waitForFunction(() => window.__bitmapCalls === 3);
      await racePage.evaluate(() => window.__releaseBitmap(2));
      await racePage.waitForTimeout(250);
      assert.equal(await racePage.locator('#hidden-editor').getAttribute('aria-busy'), 'true', 'stale import must not clear the active import busy state');
      assert.equal(await racePage.locator('#hidden-image-slot').getAttribute('aria-disabled'), 'true', 'stale import must not unlock the active image slot');
      await racePage.evaluate(() => window.__releaseBitmap(3));
      await racePage.waitForFunction(() => !document.querySelector('#hidden-editor').hidden);
      assert.match(await racePage.locator('#hidden-source-label').textContent(), /24×16px/, 'second import must own the editor after the stale decode completes');
      importRace = 'PASS'; await racePage.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, height, ...measured, localPlay: 'PASS', importRace, errors })); await context.close();
  }
} finally { await browser.close(); }
