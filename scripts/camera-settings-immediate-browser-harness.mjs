#!/usr/bin/env node
/** Isolated localhost-only settings QA. Synthetic PNG only; no real camera,
 * ads, screenshot export, upload endpoint, project publication or user storage. */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4198';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const origin = new URL(base).origin;
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(modulePath).href);
const browser = await chromium.launch({ headless:true });
const results = [];
try {
  for (const viewport of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}]) {
    const context = await browser.newContext({viewport,serviceWorkers:'block'});
    await context.route('**/*', route => {
      const request = route.request();
      return new URL(request.url()).origin === origin && ['GET','HEAD'].includes(request.method()) ? route.continue() : route.abort();
    });
    await context.addInitScript(() => {
      window.__cameraSettingsQA = { requests:0 };
      document.addEventListener('change', event => {
        if (event.target.id === 'cameraImageInput' && event.target.files?.[0]) window.__cameraSettingsQA.sourceFile = event.target.files[0];
      }, { capture:true });
      Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
        window.__cameraSettingsQA.requests++;
        throw new DOMException('Synthetic QA: hardware is disabled','NotAllowedError');
      }});
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(15000); page.on('pageerror',error=>errors.push(error.message));
    // The mode label updates before its reveal finishes. Controls deliberately
    // reject input until the transition releases the shared workspace.
    const ready = mode => page.waitForFunction(mode => document.documentElement.dataset.creationModesReady==='true' && document.body.dataset.creationMode===mode && !document.body.hasAttribute('data-creation-transition') && document.querySelector('#creation-mode-menu')?.getAttribute('aria-busy')!=='true',mode);
    const open = async()=>{await page.locator('#creation-settings-open').click();await page.getByRole('button',{name:'PX数・比率',exact:true}).click();await page.locator('#camera-canvas-settings-panel').waitFor({state:'visible'});};
    const waitDimensions = (width,height)=>page.waitForFunction(({width,height})=>{
      const c=document.querySelector('#view');return c.width===width&&c.height===height;
    },{width,height});
    try {
      await page.goto(base+'/camera/?workspace=1&runtime=direct',{waitUntil:'domcontentloaded'});await ready('camera');
      await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='idle');
      const deniedRequests = await page.evaluate(()=>window.__cameraSettingsQA.requests);
      assert.equal(await page.locator('.draw-feature-actions').isVisible(),false);
      assert.equal(await page.locator('#main > .draw-size').isVisible(),false);
      await open();
      assert.equal(await page.locator('#camera-canvas-settings-panel').getByRole('button',{name:'試す',exact:true}).count(),0);
      assert.equal(await page.locator('#camera-canvas-settings-panel').getByRole('button',{name:'適用',exact:true}).count(),0);
      await page.locator('[data-px="32"]').click();
      await page.waitForFunction(()=>document.querySelector('.camera-canvas-settings__current').textContent.includes('32×32'));
      assert.equal(await page.evaluate(()=>window.__cameraSettingsQA.requests),deniedRequests,'off-state sizing must not restart camera');
      await page.getByRole('button',{name:'この画面の変更をリセット',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('.camera-canvas-settings__current').textContent.includes('16×16'));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#creation-settings-open').evaluate(n=>n===document.activeElement),true);
      const png = await page.evaluate(()=>{
        const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const c=canvas.getContext('2d');
        c.fillStyle='#197fb7';c.fillRect(0,0,96,64);c.fillStyle='#efac38';c.fillRect(20,12,40,32);return canvas.toDataURL('image/png').split(',')[1];
      });
      await page.locator('#cameraImageInput').setInputFiles({name:'synthetic-settings.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
      await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live');await waitDimensions(16,16);
      const sourceHash = await page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await window.__cameraSettingsQA.sourceFile.arrayBuffer()))).join(','));
      await open();await page.locator('[data-px="64"]').click();await waitDimensions(64,64);
      await page.locator('#camera-canvas-settings-panel [data-ratio="9:16"]').click();await waitDimensions(36,64);
      const slider = page.getByRole('slider',{name:'キャンバスの長辺（px）'});
      await slider.scrollIntoViewIfNeeded();const box = await slider.boundingBox();
      await page.mouse.move(box.x+box.width*.25,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width*.65,box.y+box.height/2,{steps:10});await page.mouse.up();
      await page.waitForFunction(()=>document.querySelector('.camera-canvas-settings__status').textContent.startsWith('適用済み'));
      const dragSize = Number(await slider.inputValue());assert.ok(dragSize>64&&dragSize<256);
      await waitDimensions(Math.max(1,Math.round(dragSize*9/16)),dragSize);
      await slider.press('End');await waitDimensions(144,256);
      assert.equal(await page.locator('#camera-canvas-settings-panel [data-ratio="9:16"]').getAttribute('aria-pressed'),'true');
      await page.getByRole('button',{name:'戻す',exact:true}).filter({visible:true}).click();
      await page.getByRole('button',{name:'この画面の変更をリセット',exact:true}).click();await waitDimensions(16,16);
      const width = page.locator('#camera-canvas-settings-width');
      await width.fill('65');await width.fill('80');await width.fill('96');await waitDimensions(96,16);
      await width.fill('128');await width.fill('');await page.waitForTimeout(250);await waitDimensions(96,16);
      assert.equal(await width.getAttribute('aria-invalid'),'true');await width.fill('96');
      await width.press('Tab');assert.equal(await page.locator('#camera-canvas-settings-height').evaluate(n=>document.activeElement===n),true);
      assert.equal(await page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await window.__cameraSettingsQA.sourceFile.arrayBuffer()))).join(',')),sourceHash);
      assert.equal(await page.evaluate(()=>document.querySelector('#video').srcObject),null);
      assert.equal(await page.evaluate(()=>window.__cameraSettingsQA.requests),deniedRequests);
      const bounds = await page.locator('#camera-canvas-settings-panel').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y>=0&&bounds.y+bounds.height<=viewport.height+1);
      await page.keyboard.press('Escape');
      const switchMode = async mode=>{await page.locator('#creation-mode-menu summary').click();await page.locator(`#creation-mode-panel button[data-creation-mode="${mode}"]`).click();await ready(mode);};
      for(const mode of ['draw','audio']) {
        await switchMode(mode);await page.locator('#creation-settings-open').click();await page.getByRole('button',{name:'キャンバス・パレット',exact:true}).click();
        assert.equal(await page.locator('#creation-project-settings-panel').isVisible(),true);
        assert.equal(await page.locator('#camera-canvas-settings-panel').isVisible(),false);
        await page.keyboard.press('Escape');
      }
      assert.deepEqual(errors,[]);results.push({viewport,passed:true,dragSize,checks:'off-state; no text tools; presets; ratio; drag; keyboard; undo/reset; burst final value; invalid debounce; original PNG; Draw/Audio routing'});
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({results,physicalDevices:'UNTESTED',production:'UNTESTED'},null,2));
} finally { await browser.close(); }
