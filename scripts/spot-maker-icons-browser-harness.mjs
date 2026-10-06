import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href);
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Local server required.');
const output = '/tmp/pixieed-game-maker-layout';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const [width, height] of [[320,568],[390,844],[844,390],[1280,800]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/spot-difference/`);
    const png = async changed => Buffer.from(await page.evaluate(changed => {
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const x = c.getContext('2d'); x.fillStyle = '#5595bc'; x.fillRect(0,0,16,16);
      if (changed) { x.fillStyle = '#ef7964'; x.fillRect(4,4,3,3); x.fillRect(10,10,2,2); }
      return c.toDataURL('image/png').split(',')[1];
    }, changed), 'base64');
    await page.locator('#spot-before-file').setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: await png(false) });
    await page.locator('#spot-after-file').setInputFiles({ name: 'after.png', mimeType: 'image/png', buffer: await png(true) });
    await page.waitForFunction(() => !document.querySelector('#spot-import-pair').disabled);
    await page.locator('#spot-import-pair').click();
    await page.waitForFunction(() => !document.querySelector('#spot-editor').hidden);
    assert.equal(await page.locator('#spot-candidates li').count(), 2);
    const panel = page.locator('.spot-settings');
    await panel.locator('summary').click();
    await page.keyboard.press('Escape');
    assert.equal(await panel.getAttribute('open'), null);
    assert.equal(await panel.locator('summary').evaluate(node => node === document.activeElement), true);
    await panel.locator('summary').click();
    await page.locator('#spot-candidates input').nth(0).check();
    await page.locator('#spot-candidates input').nth(1).check();
    await panel.locator('.px-tool-header-panel-close').click();
    await page.locator('#spot-merge').click();
    assert.equal(await page.locator('#spot-candidates li').count(), 1);
    const q = await page.locator('#spot-canvas').boundingBox();
    await page.mouse.click(q.x + q.width*4.5/16, q.y + q.height*4.5/16);
    await page.locator('#spot-split-mode').click();
    assert.equal(await page.locator('#spot-split-mode').getAttribute('aria-pressed'), 'true');
    await page.mouse.click(q.x + q.width*4.5/16, q.y + q.height*4.5/16);
    await page.locator('#spot-split').click();
    assert.equal(await page.locator('#spot-candidates li').count(), 2);
    await page.mouse.click(q.x + q.width*4.5/16, q.y + q.height*4.5/16);
    await page.locator('#spot-exclude').click();
    assert.equal(await page.locator('#spot-candidates li').count(), 1);
    await page.locator('#spot-confirm').focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('#spot-play-local').disabled);
    const layout = await page.evaluate(() => {
      const c = document.querySelector('#spot-canvas').getBoundingClientRect();
      const header = document.querySelector('.site-header').getBoundingClientRect();
      const nav = document.querySelector('.app-tabs').getBoundingClientRect();
      const button = document.querySelector('#spot-play-local').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth+1,
        canvasVisible: c.top >= header.bottom-1 && c.bottom <= nav.top+1,
        canvasHeight: c.height, button: { width: button.width, height: button.height } };
    });
    assert.equal(layout.overflow, false); assert.equal(layout.canvasVisible,true);
    assert.ok(layout.canvasHeight >= (height < 500 ? 200 : 290));
    assert.equal(layout.button.width,44); assert.equal(layout.button.height,44);
    await page.screenshot({ path: `${output}/spot-confirmed-${width}.png` });
    const draftKey = await page.evaluate(() => localStorage.getItem('pixieed:creation:spot-difference:last-draft:v1'));
    await page.locator('#spot-play-local').click();
    const localUrl = page.url();
    await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('0 / 1'));
    await page.locator('#pixfind-hint').click();
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted:true })));
    await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted:true })));
    await page.waitForFunction(() => document.querySelector('#pixfind-progress')?.textContent.includes('0 / 1') && document.querySelector('#pixfind-hint')?.dataset.used==='false');
    const img = await page.locator('#pixfind-original').boundingBox();
    await page.mouse.click(img.x+img.width*10.5/16,img.y+img.height*10.5/16);
    const result = page.locator('[data-tool-result-view="spot-result"]'); await result.waitFor({state:'visible'});
    assert.equal(await result.getByRole('button',{name:'共有する',exact:true}).count(),0);
    const listLink=result.getByRole('link',{name:'問題一覧に戻る',exact:true});
    assert.equal(await listLink.getAttribute('href'),'/play/spot-difference/');
    await listLink.click(); await page.waitForURL(`${base}/play/spot-difference/`);
    assert.equal(await page.evaluate(() => localStorage.getItem('pixieed:creation:spot-difference:last-draft:v1')),draftKey);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ tool:'spot-difference', width, height, candidateEdit:'PASS', keyboardAndClose:'PASS', ...layout, errors }));
    await context.close();
  }
} finally { await browser.close(); }
