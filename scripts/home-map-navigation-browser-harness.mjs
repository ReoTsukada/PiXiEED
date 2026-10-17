#!/usr/bin/env node
/** Local isolated discovery acceptance. No existing profile, external requests, permissions or writes to services. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4197';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const {chromium,webkit}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const output='docs/home-map-20261017'; await mkdir(`${output}/screens`,{recursive:true});
const fixtureFallback=(await readFile('data/site-data.js','utf8')).replace(/export const events = \[[\s\S]*?\n\];/, 'export const events = [];');
const fixture=Array.from({length:35},(_,i)=>({checkedAt:'2026-10-17',id:`qa-${i}`,kind:'pixel-art',name:`検証用の公開イベント ${String(i).padStart(2,'0')}`,prefecture:'東京都',venue:'合成データの会場',startDate:i<30?'2099-11-01':'2020-01-01',endDate:i<30?'2099-11-02':'2020-01-02',sourceUrl:'https://example.org/event',description:'ローカル画面の検証専用データです。'.repeat(20)}));
const report={checkedAt:new Date().toISOString(),scope:'local isolated profiles; synthetic events; all external traffic and non-GET/HEAD blocked; no camera/microphone permissions',checks:[],unavailable:[]};
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]) {
 let browser;try{browser=await engine.launch({headless:true});}catch(e){if(!e.message.includes("Executable doesn't exist"))throw e;report.unavailable.push(engineName+': executable unavailable');continue;}
 try {for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]) {
  const ctx=await browser.newContext({viewport,hasTouch:true,serviceWorkers:'block'}),errors=[],blocked=[];
  await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==new URL(base).origin||!['GET','HEAD'].includes(r.request().method())){blocked.push(u.origin);return r.abort();}if(u.pathname==='/data/site-data.js')return r.fulfill({contentType:'text/javascript',body:fixtureFallback});if(u.pathname==='/data/pixel-art-events.json')return r.fulfill({contentType:'application/json',body:JSON.stringify({version:1,updatedAt:"2026-10-17",events:fixture})});if(u.pathname==='/js/display-ads.mjs')return r.fulfill({contentType:'text/javascript',body:'export const mountDisplayAds=()=>null;'});return r.continue();});
  await ctx.addInitScript(()=>{if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw Error('media disabled for local QA');}});});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('.px-site-header'));
  const home=await page.locator('.home-primary-tools nav > a').evaluateAll(nodes=>nodes.map(n=>({href:n.getAttribute('href'),rect:n.getBoundingClientRect().toJSON(),icon:n.querySelector('img')?.getAttribute('src')})));
  assert.deepEqual(home.map(n=>n.href),['/draw/','/camera/','/audio/','/output/']);
  if(viewport.height>500)assert.ok(await page.locator('.home-primary-tools .hp-tool-title').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().top>=72&&n.getBoundingClientRect().bottom<innerHeight-64)),'all real tool function titles fit initial viewport');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`${output}/screens/home-${viewport.width}-${engineName}-after.png`});
  await page.locator('#hpCanvas').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('#hpColors button').length===7);
  await page.locator('#hpPlayback').click();assert.equal(await page.locator('#hpPlayback').getAttribute('aria-pressed'),'false');
  await page.locator('#hpCanvas').focus();await page.keyboard.press('Space');
  await page.locator('#hpPlayback').click();assert.equal(await page.locator('#hpPlayback').getAttribute('aria-pressed'),'true');
  const miniBefore=await page.locator('#hpCanvas').evaluate(n=>n.toDataURL());await page.waitForTimeout(180);
  assert.notEqual(await page.locator('#hpCanvas').evaluate(n=>n.toDataURL()),miniBefore,'mini experience animates after scrolling into view');
  await page.evaluate(()=>scrollTo(0,0));
  // Click each real entry and verify the retained editor selects the requested mode.
  if(engineName==='chromium'&&viewport.width===390)for(const mode of ['draw','camera','audio']){
   const href=mode==='draw'?'/draw/':`/${mode}/`;
   await page.locator(`.home-primary-tools a[href="${href}"]`).click();
   await page.waitForURL(u=>u.pathname===href);
   await page.waitForFunction(mode=>{const doc=document.querySelector('.tool-embed__frame')?.contentDocument;return doc?.documentElement.dataset.creationModesReady==='true'&&doc.body.dataset.creationMode===mode&&!doc.body.hasAttribute('data-creation-transition');},mode,{timeout:30000});
   const editor=page.frames().find(f=>new URL(f.url()).pathname==='/draw/editor.html');
   assert.ok(editor);await editor.waitForFunction(mode=>document.body.dataset.creationMode===mode,mode);
   await page.goto(base+'/');await page.waitForFunction(()=>document.querySelector('.home-primary-tools'));
  }
  await page.goto(base+'/globe/');let frame=page.frames().find(f=>f!==page.mainFrame()),panel,body;
  async function ready(){frame=page.frames().find(f=>f!==page.mainFrame());await frame.waitForFunction(()=>globalThis.__PIXIEED_MAP_EVENTS__&&globalThis.__PIXIEED_GLOBE__);await frame.evaluate(()=>__PIXIEED_MAP_EVENTS__.ready);await frame.waitForFunction(()=>__PIXIEED_GLOBE__.isMapLocationReady(),null,{timeout:15000});panel=frame.locator('.map-events-panel');body=frame.locator('.map-events-panel__body');}
  await ready();
  const outer=await page.locator('#globeFrame').boundingBox();
  assert.ok(outer.y>=72&&outer.y+outer.height<=viewport.height+1,'map stays inside viewport below actual header');
  await page.screenshot({path:`${output}/screens/map-${viewport.width}-${engineName}-after.png`});
  await frame.locator('[data-map-content="events"]').click();
  await frame.locator('.map-events-dock__all').click();
  panel=frame.locator('.map-events-panel');body=frame.locator('.map-events-panel__body');
  const layout=await frame.evaluate(()=>{const p=document.querySelector('.map-events-panel'),m=document.querySelector('.map-layers'),b=p.querySelector('.map-events-panel__body');return{panel:p.getBoundingClientRect().toJSON(),switch:m.getBoundingClientRect().toJSON(),body:b.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth>innerWidth+1};});
  assert.equal(layout.overflow,false);assert.ok(layout.switch.bottom<=layout.panel.top+1||layout.switch.right<=layout.panel.left,'map content choices remain outside list');assert.ok(layout.body.height>=40,'list has an actual scrolling area even in short landscape');
  assert.ok(await frame.locator('[data-map-content="posts"]').isVisible());
  const period=panel.locator('.map-events-period');await frame.evaluate(()=>__PIXIEED_MAP_EVENTS__.selectRegion({prefectureId:'13',prefectureLabel:'東京都',mapRegionId:'prefecture:13',mapRegionKind:'prefecture',mapRegionLabel:'東京都',countryId:'JPN'}));await period.locator('[data-period-option="future"]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  assert.equal(await frame.locator('.map-event-card').count(),5);
  await period.locator('[data-period-option="all"]').click();
  await frame.evaluate(()=>__PIXIEED_MAP_EVENTS__.selectRegion({prefectureId:'13',prefectureLabel:'東京都',mapRegionId:'prefecture:13',mapRegionKind:'prefecture',mapRegionLabel:'東京都',countryId:'JPN'}));
  await frame.locator('.map-events-panel__more').click();assert.equal(await frame.locator('.map-event-card').count(),35);
  // Real wheel scrolling inside the panel must not zoom the map or scroll the outer page.
  const cameraBefore=await frame.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom),scrollBefore=await page.evaluate(()=>scrollY),box=await body.boundingBox();
  if(engineName==='chromium'&&viewport.width<500){
   const cdp=await ctx.newCDPSession(page),x=box.x+box.width/2,y=box.y+box.height-12;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
   for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*10,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await page.waitForTimeout(120);
   assert.ok(await body.evaluate(n=>n.scrollTop)>0,'touch scroll moves the list');
   assert.equal(await frame.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom),cameraBefore);
   assert.equal(await page.evaluate(()=>scrollY),scrollBefore);
  }
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,500);await page.waitForTimeout(150);
  assert.ok(await body.evaluate(n=>n.scrollTop)>0);assert.equal(await page.evaluate(()=>scrollY),scrollBefore);assert.equal(await frame.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom),cameraBefore);
  const button=frame.locator('[data-event-id="qa-10"] button');await button.scrollIntoViewIfNeeded();await button.focus();const listScroll=await body.evaluate(n=>n.scrollTop);
  await button.press('Enter');await page.locator('#mapEventDetail[data-event-id="qa-10"]').waitFor();assert.equal(await page.locator('#globeFrame').evaluate(n=>n.inert),viewport.width<=900);
  await page.locator('.map-event-detail__close').click();await page.locator('#mapEventDetailHost').waitFor({state:'hidden'});
  await frame.waitForFunction(()=>document.activeElement?.closest('[data-event-id]')?.dataset.eventId==='qa-10');
  assert.ok(Math.abs(await body.evaluate(n=>n.scrollTop)-listScroll)<3);
  await frame.evaluate(()=>__PIXIEED_GLOBE__.setView({centerLongitude:145,centerLatitude:37,zoom:2}));
  await page.screenshot({path:`${output}/screens/map-list-${viewport.width}-${engineName}-after.png`});
  const saved=await frame.evaluate(()=>({events:__PIXIEED_MAP_EVENTS__.getNavigationState(),view:__PIXIEED_GLOBE__.getSnapshot().view}));
  await page.reload();await ready();await frame.waitForFunction(()=>document.querySelectorAll('.map-event-card').length===35);
  assert.equal(await frame.evaluate(()=>__PIXIEED_MAP_EVENTS__.getPeriodFilter()),'all');assert.match(await frame.locator('.map-events-panel__heading').textContent(),/東京都/);
  assert.ok(Math.abs(await body.evaluate(n=>n.scrollTop)-saved.events.scroll)<3,'reload preserves list position');
  const restoredView=await frame.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view);assert.equal(restoredView.centerLongitude,saved.view.centerLongitude);assert.equal(restoredView.zoom,saved.view.zoom);
  await page.goto(base+'/tools/');await page.goBack();await ready();await frame.waitForFunction(()=>document.querySelectorAll('.map-event-card').length===35);assert.equal(await frame.evaluate(()=>__PIXIEED_MAP_EVENTS__.getPeriodFilter()),'all');assert.ok(Math.abs(await body.evaluate(n=>n.scrollTop)-saved.events.scroll)<3,'back preserves list position');
  await frame.locator('.map-events-panel__close').click();assert.equal(await panel.isVisible(),false);
  await frame.locator('#globeCanvas').focus();const before=await frame.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.centerLongitude);await page.keyboard.press('ArrowRight');assert.notEqual(await frame.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.centerLongitude),before);
  const canvas=await frame.locator('#globeCanvas').boundingBox();await page.mouse.move(canvas.x+canvas.width*.2,canvas.y+canvas.height*.4);const zoom=await frame.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom);await page.mouse.wheel(0,-100);await page.waitForTimeout(200);assert.notEqual(await frame.evaluate(()=>__PIXIEED_GLOBE__.getSnapshot().view.zoom),zoom);assert.equal(await page.evaluate(()=>scrollY),0);
  // The explicit page link scrolls the document, clear of its fixed navigation.
  await page.locator('.map-page-directory-link a').click();await page.waitForTimeout(200);assert.ok(await page.evaluate(()=>scrollY)>0);await page.locator('.map-event-directory a').scrollIntoViewIfNeeded();const directory=await page.locator('.map-event-directory a').boundingBox();assert.ok(directory.y+directory.height<viewport.height-64);
  await page.screenshot({path:`${output}/screens/map-directory-${viewport.width}-${engineName}-after.png`});
  assert.deepEqual(errors,[]);
  report.checks.push({engine:engineName,viewport,homeLinks:home,layout,miniExperienceAfterScroll:true,scopeFilterScrollCameraReloadBack:true,listWheelDoesNotZoom:true,touchListScroll:engineName==='chromium'&&viewport.width<500,mapWheelAndKeyboard:true,pageDirectoryScroll:true,detailReturnFocus:true,errors,blockedExternalOrigins:[...new Set(blocked)]});await ctx.close();
 }}finally{await browser.close();}
}
await writeFile(`${output}/navigation-browser.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks.length,unavailable:report.unavailable}));
