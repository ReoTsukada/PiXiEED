#!/usr/bin/env node
// Actual shared controllers and local project fixtures. All non-local requests blocked.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4176',origin=new URL(base).origin;
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const { chromium }=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true});let checks=0;
const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/site.css"><link rel="stylesheet" href="/css/pixieed-design-system.css"><link rel="stylesheet" href="/css/site-header.css"></head><body><header class="site-header"><div class="header-inner"></div></header><main></main><div class="map-surface map-surface--field" style="height:calc(100dvh - 90px);width:100%;position:relative"><section class="map-popover" hidden><div class="map-popover__top"><b>作品</b><button class="map-popover__close" aria-label="閉じる">×</button></div><p class="fixture-long"></p></section></div><dialog class="dialog"><button class="dialog__close">閉じる</button><p class="fixture-long"></p></dialog><script type="module">import {mountSiteHeader} from '/js/site-header.mjs';import {bindUserPostComposer} from '/js/post-composer.js';mountSiteHeader();window.composer=bindUserPostComposer(document.body);for(const el of document.querySelectorAll('.fixture-long'))el.textContent='長い内容の確認。'.repeat(800);document.querySelector('.map-popover__close').onclick=()=>document.querySelector('.map-popover').hidden=true;document.querySelector('.dialog__close').onclick=()=>document.querySelector('.dialog').close();window.ready=true;</script></body></html>`;
async function reachable(page,button,host,panel,label){
  await page.waitForTimeout(300);
  for(const fraction of [0,.5,1]){
    const result=await page.evaluate(({button,host,panel,fraction})=>{
      const scroller=document.querySelector(host);scroller.scrollTop=(scroller.scrollHeight-scroller.clientHeight)*fraction;
      return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const el=document.querySelector(button),r=el.getBoundingClientRect(),p=document.querySelector(panel).getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);resolve({x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,px:p.x,py:p.y,pr:p.right,pb:p.bottom,hit:!!hit&&(hit===el||el.contains(hit)),vw:innerWidth,vh:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,scroll:scroller.scrollTop,max:scroller.scrollHeight-scroller.clientHeight});})));
    },{button,host,panel,fraction});
    assert.ok(result.w>=43.9&&result.h>=43.9&&result.x>=-.5&&result.y>=-.5&&result.right<=result.vw+.5&&result.bottom<=result.vh+.5&&result.x>=result.px-.5&&result.y>=result.py-.5&&result.right<=result.pr+.5&&result.bottom<=result.pb+.5&&result.hit&&!result.overflow,`${label}/${fraction}: ${JSON.stringify(result)}`);assert.ok(result.max>50,`${label}: fixture must scroll`);checks++;
  }
}
try{
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
  const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();if(url.pathname==='/panel-close-fixture')return route.fulfill({contentType:'text/html',body:fixture});return route.continue();});
  for(const standalone of [false,true]){
   await page.goto(`${base}/panel-close-fixture`);await page.waitForFunction(()=>window.ready);
   if(standalone)await page.evaluate(()=>document.body.classList.add('px-standalone-globe'));
   await page.locator('[data-menu-toggle]').click();await page.waitForTimeout(260);
   await reachable(page,'[data-menu-close]','.site-menu__body','.site-menu',`menu ${viewport.width} ${standalone}`);
   if(viewport.width===390&&!standalone)await page.screenshot({path:'/tmp/pixieed-panel-menu-390.png'});
   await page.locator('[data-menu-close]').click();assert.equal(await page.locator('.site-menu').isVisible(),false);checks++;
   await page.locator('[data-menu-toggle]').click();await page.locator('[data-menu-setting="privacy"]').click();
   await page.evaluate(()=>{const p=document.createElement('p');p.textContent='設定の長い内容。'.repeat(800);document.querySelector('.site-settings__body').append(p);});
   await reachable(page,'.site-settings__head [data-settings-close]','.site-settings__body','.site-settings',`settings ${viewport.width} ${standalone}`);
   await page.locator('.site-settings__head [data-settings-close]').click();assert.equal(await page.locator('.site-settings').isVisible(),false);checks++;
  }
  await page.evaluate(()=>{window.composer.open();const p=document.createElement("p");p.textContent="投稿の長い内容。".repeat(800);document.querySelector(".map-post-drawer__body").append(p);});
  await reachable(page,'[data-post-close]','.map-post-drawer__body','.map-post-drawer__panel',`post ${viewport.width}`);
  await page.locator('[data-post-close]').click();assert.equal(await page.evaluate(()=>window.composer.isOpen()),false);checks++;
  await page.evaluate(()=>document.querySelector('.map-popover').hidden=false);
  await reachable(page,'.map-popover__close','.map-popover','.map-popover',`popover ${viewport.width}`);
  await page.locator('.map-popover__close').click();assert.equal(await page.locator('.map-popover').isVisible(),false);checks++;
  await page.evaluate(()=>document.querySelector('.dialog').showModal());
  await reachable(page,'.dialog__close','.dialog','.dialog',`image ${viewport.width}`);
  await page.locator('.dialog__close').click();assert.equal(await page.locator('.dialog').isVisible(),false);checks++;
  await page.goto(`${base}/draw/`);await page.waitForFunction(()=>!document.querySelector('main').inert);
  await page.locator('[data-menu-toggle]').click();await page.locator('[data-tool-help-open]').click();
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='使い方の長い確認。'.repeat(800);document.querySelector('.px-tool-help__content').append(p);});
  await reachable(page,'.px-tool-help__close','.px-tool-help__content','.px-tool-help',`help ${viewport.width}`);
  await page.locator('.px-tool-help__close').click();assert.equal(await page.locator('.px-tool-help').isVisible(),false);checks++;
  const id=await page.evaluate(async()=>{const {createPxdProject}=await import('/js/creation/pxd-codec.mjs');const {putPxdSharedImage}=await import('/js/creation/pxd-project.mjs');const {importToolProject}=await import('/js/creation/tool-project-import.mjs');const {createToolProjectStore}=await import('/js/creation/tool-project-store.mjs');const rgba=new Uint8ClampedArray(32*16*4).fill(255);const p=await putPxdSharedImage(createPxdProject({manifest:{title:'閉じる確認 '+ '長い作品名'.repeat(20)}}),{width:32,height:16,rgba});return (await createToolProjectStore('draw').save(await importToolProject(p,'draw'),{expectedRevisionId:null})).projectId;});
  await page.locator('#project-open').click();await page.locator('#project-tab-library').click();const card=page.locator(`.project-card[data-project-id="${id}"]`);await card.waitFor();
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='一覧確認。'.repeat(800);document.querySelector('#pxd-panel').append(p);});
  await reachable(page,'#project-close','#pxd-panel','#pxd-panel',`project list ${viewport.width}`);
  await card.click({button:'right'});await page.locator('#project-card-actions-dismiss').waitFor();
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='操作確認。'.repeat(800);document.querySelector('.project-card-actions').append(p);});
  await reachable(page,'#project-card-actions-dismiss','.project-card-actions','.project-card-actions',`project actions ${viewport.width}`);
  if(viewport.width===390)await page.screenshot({path:'/tmp/pixieed-panel-project-390.png'});
  await page.locator('#project-card-actions-dismiss').click();assert.equal(await page.locator('.project-card-actions').count(),0);checks++;
  await card.click({button:'right'});await page.locator('#project-card-actions-delete').click();await page.locator('#project-delete-dismiss').waitFor();
  await page.evaluate(()=>{const p=document.createElement('p');p.textContent='削除確認。'.repeat(800);document.querySelector('.project-delete-dialog').append(p);});
  await reachable(page,'#project-delete-dismiss','.project-delete-dialog','.project-delete-dialog',`project cancel ${viewport.width}`);
  await page.locator('#project-delete-dismiss').click();assert.equal(await page.locator('.project-delete-dialog').count(),0);checks++;
  assert.equal(await page.evaluate(async id=>!!await(await import('/js/creation/tool-project-store.mjs')).createToolProjectStore('draw').load(id),id),true,'dismiss must preserve local project');checks++;
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({pass:true,checks,viewports:4,source:'actual shared controllers and local project UI, external network blocked'}));
}finally{await browser.close();}
