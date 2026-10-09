#!/usr/bin/env node
// Isolated local browser checks: no real accounts, cameras, analytics or ads.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4182';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const out = new URL('../docs/seo-20261009/screenshots/', import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const records = [];
try {
  for (const viewport of [{width:1280,height:800},{width:390,height:844},{width:320,height:568}]) {
    const context = await browser.newContext({ viewport });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort('blockedbyclient'));
    const page = await context.newPage();
    // Exercise GitHub Pages' custom 404 fallback, which Python's local server
    // does not serve. The 404 status is retained in these synthetic cases.
    const fallbackHtml = await readFile(new URL('../404.html', import.meta.url), 'utf8');
    await page.route(/\/(?:pIxIeEdRaW|PIXIEDRAW)\//, route => route.fulfill({status:404,contentType:'text/html',body:fallbackHtml}));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const path of ['/', '/draw/', '/tools/', '/pixel-camera.html', '/audio/', '/output/', '/jigsaw/', '/globe/', '/events/', '/events/pixel-art-park-9/', '/pixiedraw/', '/pixiedraw2/', '/studio/']) {
      const response = await page.goto(base + path, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, path);
      await page.waitForTimeout(250);
      const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, h1: document.querySelector('h1')?.textContent }));
      assert.equal(geometry.overflow, false, `${viewport.width} ${path} horizontal overflow`);
      assert.ok(geometry.h1, path);
      if (path === '/') {
        assert.equal(await page.locator('#hpPalette').isVisible(), false);
        await page.locator('#hpDrawMode').click();
        assert.equal(await page.locator('#hpDrawMode').getAttribute('aria-pressed'), 'true');
      }
      if (viewport.width !== 320 && ['/', '/draw/', '/events/pixel-art-park-9/'].includes(path)) {
        const name = path === '/' ? 'home' : path === '/draw/' ? 'draw' : 'event';
        await page.screenshot({ path: new URL(`${name}-${viewport.width}-after.png`, out).pathname, fullPage: path.startsWith('/events/') });
        if (path === '/') await page.locator('.hp-section').first().screenshot({path:new URL(`tools-${viewport.width}-after.png`,out).pathname});
      }
      if (path === '/globe/') {
        assert.ok(await page.locator('a[href="/events/"]').count());
        const frame = page.frames().find(frame => frame !== page.mainFrame());
        await frame.waitForFunction(() => globalThis.__PIXIEED_MAP_EVENTS__);
        await frame.evaluate(() => __PIXIEED_MAP_EVENTS__.ready);
        if (await frame.locator('[data-map-content="events"]').getAttribute('aria-pressed') !== 'true') await frame.locator('[data-map-content="events"]').click();
        await frame.evaluate(() => __PIXIEED_MAP_EVENTS__.openAll());
        await frame.locator('[data-event-id="pixel-art-park-9"] .map-event-card__detail').click();
        await page.locator('#mapEventDetail [data-event-page-link]').waitFor();
        assert.equal(await page.locator('#mapEventDetail [data-event-page-link]').getAttribute('href'), '/events/pixel-art-park-9/');
      }
      if (path.startsWith('/events/')) assert.ok(await page.locator('a[href="/globe/"]').count());
      records.push(`${viewport.width}: ${path} OK`);
    }
    await page.goto(base + '/index.html?utm_source=legacy#hpToysTitle');
    await page.waitForURL(base + '/?utm_source=legacy#hpToysTitle');
    for (const alias of ['/PiXiEEDraw', '/PiXiEEDraw/index.html', '/pIxIeEdRaW/']) {
      await page.goto(base + '/tools/');
      const suffix = '?utm_source=legacy&return=https%3A%2F%2Fexample.test#editor';
      await page.goto(base + alias + suffix);
      await page.waitForURL(base + '/draw/' + suffix);
      await page.goBack();
      assert.equal(page.url(), base + '/tools/', 'replace navigation avoids a Back loop');
    }
    await page.goto(base + '/PIXIEDRAW/?utm_source=legacy#old');
    await page.waitForURL(base + '/pixiedraw/?utm_source=legacy#old');
    assert.equal(new URL(page.url()).pathname, '/pixiedraw/', 'legacy aliases retain the manual data explanation');
    assert.equal(await page.locator('[data-current-editor]').getAttribute('href'), '/draw/?utm_source=legacy#old');
    const fixture = await page.evaluate(async () => {
      localStorage.setItem('pixiedraw2:active-project-id:v1', 'legacy-sentinel');
      const old = await new Promise((resolve, reject) => { const r=indexedDB.open('pixieedraw-autosave',3); r.onupgradeneeded=()=>r.result.createObjectStore('handles'); r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
      await new Promise((resolve,reject)=>{const tx=old.transaction('handles','readwrite');tx.objectStore('handles').put('keep','sentinel');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});old.close();
      const {createPxdProject}=await import('/js/creation/pxd-codec.mjs');
      const {putPxdImage,putPxdDrawDocument,imageToDrawDocument}=await import('/js/creation/pxd-project.mjs');
      const {createPxdStore}=await import('/js/creation/pxd-store.mjs');
      const rgba=new Uint8Array(16*16*4);rgba.set([226,55,65,255]);
      const image={width:16,height:16,rgba};
      let project=await putPxdImage(createPxdProject({projectId:'seo-alias-fixture',revisionId:'seo-alias-revision',manifest:{toolProject:{tool:'draw',schemaVersion:1}}}),image,'main');
      project=await putPxdDrawDocument(project,imageToDrawDocument(image));
      const saved = await createPxdStore().save(project);
      return {id:saved.projectId,revision:saved.revisionId};
    });
    const suffix = `?pxd=${fixture.id}&pxdRevision=${fixture.revision}&utm_source=legacy#editor`;
    await page.goto(base + '/PiXiEEDraw/' + suffix);
    await page.waitForURL(base + '/draw/' + suffix);
    await page.waitForFunction(() => {
      const canvas = document.querySelector('#draw-canvas');
      if (!canvas || document.querySelector('main').inert) return false;
      const pixel = canvas.getContext('2d').getImageData(0, 0, 1, 1).data;
      return pixel[0] === 226 && pixel[1] === 55 && pixel[2] === 65 && pixel[3] === 255;
    });
    assert.equal(await page.evaluate(() => localStorage.getItem('pixiedraw2:active-project-id:v1')), 'legacy-sentinel');
    assert.equal(await page.evaluate(async () => {const db=await new Promise(resolve=>{const r=indexedDB.open('pixieedraw-autosave',3);r.onsuccess=()=>resolve(r.result);});return await new Promise(resolve=>{const r=db.transaction('handles').objectStore('handles').get('sentinel');r.onsuccess=()=>{db.close();resolve(r.result);};});}), 'keep');
    assert.deepEqual(errors, [], `${viewport.width}: page errors`);
    records.push(`${viewport.width}: index/editor case+slash aliases, synthetic 404 fallback, query+fragment, safe destination, Back, PXD resume, legacy storage retained OK`);
    await context.close();
  }
  const before = process.env.PIXIEED_SEO_BEFORE_URL;
  if (before) {
    assert.ok(['127.0.0.1','localhost'].includes(new URL(before).hostname));
    for (const viewport of [{width:1280,height:800},{width:390,height:844}]) {
      const context=await browser.newContext({viewport});
      await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(before).origin?r.continue():r.abort());
      const page=await context.newPage();
      for(const [path,name] of [['/','home'],['/draw/','draw']]) {
        await page.goto(before+path,{waitUntil:'domcontentloaded'});await page.waitForTimeout(250);
        await page.screenshot({path:new URL(`${name}-${viewport.width}-before.png`,out).pathname});
        if(path==='/')await page.locator('.hp-section').first().screenshot({path:new URL(`tools-${viewport.width}-before.png`,out).pathname});
      }
      await context.close();
    }
  }
  await writeFile(new URL('../browser-results.json',out),JSON.stringify(records,null,2)+'\n');
  console.log(`SEO browser: ${records.length} checks PASS; screenshots: ${out.pathname}`);
} finally { await browser.close(); }
