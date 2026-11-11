#!/usr/bin/env node
/** Synthetic-only picker interaction regression. No user profile or external requests. */
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const out = process.env.PIXIEED_BROWSER_ARTIFACTS || '/tmp/pixieed-journey-picker-qa';
await mkdir(out, {recursive:true});
const results = [];
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/__qa') { res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><meta name="viewport" content="width=device-width"><button id="outside">Outside</button>'); }
  if (pathname === '/js/creation/tool-project-store.mjs') { res.setHeader('Content-Type', 'text/javascript'); return res.end('export function createToolProjectStore(){ return {listProjects: async () => { if(window.failRead) throw Error("synthetic"); return window.rows; }}; }'); }
  try {
    const file = resolve(root, '.' + pathname);
    if (!file.startsWith(root + '/')) throw Error('outside');
    res.setHeader('Content-Type', ({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css'})[extname(file)] || 'text/plain');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.env.PIXIEED_CHROME_EXECUTABLE ? {executablePath:process.env.PIXIEED_CHROME_EXECUTABLE} : {}) });
try {
  for (const width of [1280, 390, 320]) {
    const mobile = width < 500;
    const context = await browser.newContext({viewport:{width,height:mobile ? 844 : 800}, isMobile:mobile, hasTouch:mobile});
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(base + '/__qa');
    await page.evaluate(async () => {
      window.rows = {projects:[],errors:[]}; window.chosen=[]; window.cancelled=0;
      const {mountProjectStartPicker} = await import('/js/creation/project-start-picker.mjs');
      window.picker=mountProjectStartPicker({onChoose:async value=>{chosen.push(value); if(window.pending) await new Promise(r=>window.release=r); if(window.failChoose) throw Error('合成エラー');},onCancel:()=>cancelled++});
      await picker.show();
    });
    const empty = page.locator('#project-start-empty-create');
    await empty.waitFor({state:'visible'});
    await page.screenshot({path:resolve(out,`picker-empty-${width}.png`)});
    const geometry = await empty.evaluate(el => { const r=el.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}; });
    assert.ok(geometry.left>=0 && geometry.right<=geometry.width && geometry.top>=0 && geometry.bottom<=geometry.height, 'First-create CTA fully within viewport');
    assert.equal(await page.locator('dialog').evaluate(el=>el.open), true);
    assert.equal(await page.evaluate(()=>chosen.length),0,'No automatic bypass of mandatory gallery');
    assert.equal(await page.locator('#project-start-new').evaluate(el=>document.activeElement===el),true,'Do not autofocus mobile search');
    await page.evaluate(()=>{window.pending=true;window.failChoose=true;});
    if (mobile) await empty.tap(); else { await empty.focus(); await page.keyboard.press('Enter'); }
    assert.equal(await empty.isDisabled(),true);
    assert.equal(await page.locator('#project-start-new').isDisabled(),true);
    await page.evaluate(()=>document.querySelector('#project-start-empty-create').click());
    assert.equal(await page.evaluate(()=>chosen.length),1,'Double click is guarded');
    await page.evaluate(()=>release());
    await page.getByRole('status').filter({hasText:'合成エラー'}).waitFor();
    assert.equal(await empty.isEnabled(),true);
    await page.evaluate(()=>{window.pending=false;window.failChoose=false;});
    await empty.click();
    await page.waitForFunction(()=>!document.querySelector('dialog').open);
    assert.deepEqual(await page.evaluate(()=>chosen),[null,null]);
    await page.evaluate(()=>picker.show());
    await empty.waitFor({state:'visible'});
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>cancelled),1);
    await page.evaluate(()=>{window.failRead=true; return picker.show();});
    await page.locator('#project-start-retry').waitFor({state:'visible'});
    assert.equal(await empty.isVisible(),false,'Read failure is not an empty library');
    await page.screenshot({path:resolve(out,`picker-error-${width}.png`)});
    await page.evaluate(()=>{window.failRead=false;window.rows={projects:[],errors:[{code:'synthetic'}]};});
    await page.locator('#project-start-retry').click();
    await page.getByRole('status').filter({hasText:'一部の作品'}).waitFor();
    assert.equal(await empty.isVisible(),false,'Partial errors are not an empty library');
    await page.evaluate(()=>{window.rows={projects:Array.from({length:150},(_,i)=>({projectId:`qa-${i}`,revisionId:`r-${i}`,summary:{name:`合成作品${i}`,width:2,height:2}})),errors:[]};});
    await page.locator('#project-start-retry').click();
    await page.locator('.project-gallery__tile').first().waitFor();
    assert.equal(await empty.isVisible(),false);
    assert.ok(await page.locator('.project-gallery__tile').count()<150,'Only visible gallery cards mount');
    await page.locator('#project-start-search').fill('not-found');
    await page.waitForFunction(()=>document.querySelectorAll('.project-gallery__tile').length===0);
    assert.equal(await empty.isVisible(),false,'Search miss must not become first-create state');
    await page.locator('#project-start-search').fill('合成作品0');
    const tile=page.locator('.project-gallery__tile').first(); await tile.waitFor();
    await tile.dispatchEvent('contextmenu');
    assert.equal(await page.evaluate(()=>chosen.length),2,'Read-only context gesture does not open or mutate');
    await tile.focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('dialog').open);
    assert.deepEqual(await page.evaluate(()=>chosen.at(-1)),{projectId:'qa-0',revisionId:'r-0'});
    await page.evaluate(()=>{window.rows={projects:[],errors:[]}; return picker.show();});
    await empty.waitFor({state:'visible'});
    await page.getByRole('button',{name:'説明へ戻る'}).click();
    assert.equal(await page.evaluate(()=>cancelled),2);
    await page.evaluate(()=>picker.dispose());
    assert.equal(await page.locator('#project-start-picker').count(),0);
    results.push({width,passed:true,geometry,emptyScreenshot:`picker-empty-${width}.png`,errorScreenshot:`picker-error-${width}.png`});
    console.log(`PASS ${mobile?'mobile':'desktop'} ${width}px: empty create, keyboard/touch, busy/double-click, choose failure/retry, reopen, Escape/back, read errors, search, visible-only cards, read-only context, saved selection, dispose`);
    await context.close();
  }
  await writeFile(resolve(out,'results.json'), JSON.stringify({root,results},null,2));
} finally { await browser.close(); await new Promise(r=>server.close(r)); }
