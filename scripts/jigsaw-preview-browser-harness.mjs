import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const engine=process.env.PIXIEED_JIGSAW_ENGINE || 'chromium';
const runtime=process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const playwright=await import(pathToFileURL(runtime).href);
const base=process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out=`/tmp/pixieed-jigsaw-preview-${engine}-20261006`; await mkdir(out,{recursive:true});
const browser=await playwright[engine].launch({headless:true,...(engine==='webkit'?{executablePath:'/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'}:{})});
const results=[];
const frame=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const rect=async(page,selector)=>page.locator(selector).evaluate(node=>node.getBoundingClientRect().toJSON());
async function stored(page){return page.evaluate(async()=>{const {createIndexedDbDraftAdapter,createLocalDraftStore}=await import('/js/creation/local-drafts.mjs');return (await createLocalDraftStore(createIndexedDbDraftAdapter()).load(localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1'))).document;});}
async function geometry(page){const r=await page.evaluate(()=>{
 const r=id=>document.querySelector(id).getBoundingClientRect().toJSON(); const c=document.querySelector('#jigsaw-preview-canvas');
 return {panel:r('#jigsaw-preview'),canvas:r('#jigsaw-preview-canvas'),header:r('.site-header'),nav:r('.app-tabs'),close:r('#jigsaw-preview-close'),resize:r('#jigsaw-preview-resize'),ratio:c.width/c.height,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};
});assert.equal(r.overflow,false);assert.ok(Math.abs(r.canvas.width/r.canvas.height-r.ratio)<0.015,JSON.stringify(r));assert.ok(r.panel.top>=r.header.bottom+7 && r.panel.bottom<=r.nav.top-7,JSON.stringify(r));assert.ok(r.panel.left>=7 && r.panel.right<=r.width-7);for(const c of [r.close,r.resize])assert.ok(c.width>=44 && c.height>=44 && c.bottom<=r.nav.top && c.right<=r.width,JSON.stringify(r));return r;}
try {
 for(const [width,height] of [[320,568],[390,844],[844,390],[1280,800]]) for(const [shape,w,h] of [['square',96,96],['wide',128,32],['tall',32,128],...(width===844?[['extreme-tall',3,3000]]:[])]) {
  const context=await browser.newContext({viewport:{width,height},hasTouch:true}); await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  await context.addInitScript(()=>{
   localStorage.setItem('pixieed:jigsaw:preview-position:v1',JSON.stringify({left:16,top:100}));
   document.addEventListener('jigsaw:state',e=>window.qaState=e.detail);
   document.addEventListener('gotpointercapture',e=>{if(e.target.id==='jigsaw-preview-resize'){window.qaCapture={id:e.pointerId,trusted:e.isTrusted};}},true);
   document.addEventListener('pointerdown',e=>{if(e.target.closest('#jigsaw-preview-resize'))window.qaResizePointer=e.pointerId;},true);
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message)); await page.goto(`${base}/jigsaw/`);
  const png=await page.evaluate(({w,h})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');const d=g.createImageData(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const n=(y*w+x)*4;d.data.set([y%256,Math.floor(y/256),x*95,255],n);}g.putImageData(d,0,0);return c.toDataURL().split(',')[1];},{w,h});
  await page.locator('#jigsaw-source-kind').evaluate(s=>{s.value='file';s.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('#jigsaw-file').setInputFiles({name:`owned-${shape}.png`,mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.waitForFunction(()=>!document.querySelector('.arc-card').disabled); assert.equal(await page.locator('#jigsaw-grid-size').isVisible(),false);
  assert.equal(await page.getByRole('radiogroup',{name:'むずかしさ'}).getByRole('radio').count(),4);
  const hard=width===1280&&shape==='square';await page.locator('.arc-card').nth(hard?3:0).click();assert.equal(await page.locator('.arc-card[aria-checked="true"]').count(),1);assert.equal(await page.locator('.arc-card').nth(hard?3:0).getAttribute('aria-checked'),'true');
  if(shape==='square')await page.screenshot({animations:'disabled',path:`${out}/jigsaw-${width}-difficulty.png`});
  await page.locator('#jigsaw-start').click();await page.locator('#jigsaw-play').waitFor({state:'visible'});await frame(page);
  await page.locator('#jigsaw-tray .jigsaw-piece').first().click();await page.locator('#jigsaw-workspace').focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');
  await page.locator('#jigsaw-save').click();await page.waitForFunction(()=>document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));
  const original=await stored(page);const expected=structuredClone(original);const placed=expected.groups.find(group=>!group.inTray);placed.x+=Math.max(1,Math.round(expected.layout.pieceSize/3));
  await page.locator('#jigsaw-workspace').focus();await page.keyboard.press('ArrowRight');const state=await page.evaluate(()=>window.qaState);
  const toggle=page.locator('#jigsaw-preview-toggle');const tb=await toggle.boundingBox();assert.ok(tb.width>=44&&tb.height>=44);
  await toggle.click();await frame(page); assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  const imageBefore=await page.locator('#jigsaw-preview-canvas').evaluate(c=>c.toDataURL());
  let g=await geometry(page); assert.ok(Math.abs(g.panel.left-16)<1,'old position preference restored');
  assert.notEqual(await toggle.evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(255, 255, 255)');
  const resize=page.locator('#jigsaw-preview-resize');await resize.focus();await page.keyboard.press('Home');g=await geometry(page);
  const startWidth=g.canvas.width;const rb=await resize.boundingBox();await page.mouse.move(rb.x+22,rb.y+22);await page.mouse.down();await page.mouse.move(rb.x+52,rb.y+52,{steps:4});await frame(page);
  assert.equal(await page.locator('#jigsaw-preview').getAttribute('data-preview-gesture'),'resize');assert.equal(await page.evaluate(()=>window.qaCapture?.trusted),true);
  await page.mouse.up();await frame(page); assert.equal(await page.locator('#jigsaw-preview').getAttribute('data-preview-gesture'),null);g=await geometry(page);assert.ok(g.canvas.width>startWidth+(shape==='extreme-tall'?0.001:1),'native mouse actually changes image size');
  // Cancel and blur roll back a live resize and clear its pointer ownership.
  for(const cancel of ['pointercancel','blur','lostpointercapture','close']) {
   const before=await rect(page,'#jigsaw-preview');const handle=await resize.boundingBox();await page.mouse.move(handle.x+22,handle.y+22);await page.mouse.down();await page.mouse.move(handle.x+42,handle.y+42,{steps:2});
   if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   else if(cancel==='lostpointercapture'){await resize.evaluate(n=>n.releasePointerCapture(window.qaResizePointer));await page.mouse.move(handle.x+43,handle.y+43);}
   else if(cancel==='close')await page.locator('#jigsaw-preview-close').evaluate(n=>n.click());
   else await resize.dispatchEvent('pointercancel',{pointerId:await page.evaluate(()=>window.qaResizePointer),pointerType:'mouse',bubbles:true});
   await page.mouse.up();if(cancel==='close'){assert.equal(await page.locator('#jigsaw-preview').isVisible(),false);await toggle.click();}assert.equal(await page.locator('#jigsaw-preview').getAttribute('data-preview-gesture'),null);const after=await rect(page,'#jigsaw-preview');assert.ok(Math.abs(before.width-after.width)<1);
  }
  await resize.focus();await page.keyboard.press('End');await geometry(page);await page.keyboard.press('Home');await page.keyboard.press('Shift+ArrowRight');await geometry(page);
  await page.locator('.jigsaw-preview__head').focus();await page.keyboard.press('ArrowDown');await geometry(page);
  if(engine==='chromium'&&width===390&&shape==='square') {
   await resize.focus();await page.keyboard.press('Home');const b=await resize.boundingBox();const cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+22,y:b.y+22,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+60,y:b.y+60,id:1}]});await frame(page);
   assert.equal(await page.locator('#jigsaw-preview').getAttribute('data-preview-gesture'),'resize');assert.equal(await page.evaluate(()=>window.qaCapture.trusted),true);
   const captured=await page.evaluate(()=>window.qaCapture.id);assert.equal(await resize.evaluate((n,id)=>n.hasPointerCapture(id),captured),true);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+60,y:b.y+60,id:1},{x:b.x+10,y:b.y+10,id:2}]});
   assert.equal(await page.evaluate(()=>window.qaCapture.id),captured,'second finger does not take resize ownership');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(page);assert.equal(await page.locator('#jigsaw-preview').getAttribute('data-preview-gesture'),null);
   const before=await rect(page,'#jigsaw-preview');const n=await resize.boundingBox();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:n.x+22,y:n.y+22,id:3}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:n.x+35,y:n.y+35,id:3}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await frame(page);assert.ok(Math.abs((await rect(page,'#jigsaw-preview')).width-before.width)<1);await cdp.detach();
  }
  assert.deepEqual(await page.evaluate(()=>window.qaState),state,'reference gestures leave pieces and progress intact');assert.deepEqual(await stored(page),original,'reference UI does not rewrite saved game');
  assert.equal(await page.locator('#jigsaw-preview-canvas').evaluate(c=>c.toDataURL()),imageBefore,'reference image bytes unchanged by resize');
  await page.locator('#jigsaw-save').click();await page.waitForFunction(()=>document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));assert.deepEqual(await stored(page),expected,'actual save after gestures retains the previously unsaved placement and source/layout');
  if(shape==='square'||width===844)await page.screenshot({animations:'disabled',path:`${out}/jigsaw-${width}-${shape}-preview.png`});
  const preference=await page.evaluate(()=>localStorage.getItem('pixieed:jigsaw:preview-window:v1'));
  await page.setViewportSize(width===844?{width:390,height:844}:{width:844,height:390});await frame(page);await geometry(page);assert.equal(await page.evaluate(()=>localStorage.getItem('pixieed:jigsaw:preview-window:v1')),preference,'rotation does not overwrite preferred size');
  await page.setViewportSize({width,height});await frame(page);await geometry(page);
  await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#jigsaw-preview').isVisible(),false);
  await toggle.focus();await page.keyboard.press('Enter');await page.locator('#jigsaw-preview-close').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'jigsaw-preview-toggle');
  const board=await page.locator('#jigsaw-workspace').boundingBox();await page.mouse.move(board.x+board.width*.4,board.y+board.height*.4);await page.mouse.wheel(0,-250);await frame(page);
  await page.locator('.jigsaw-more > summary').click();assert.notEqual(await page.locator('#jigsaw-view-scale').textContent(),'100%','native wheel updates visible scale');await page.locator('#jigsaw-tray-page').waitFor({state:'visible'});assert.match(await page.locator('#jigsaw-tray-page').textContent(),/^1 \/ /);assert.equal(await page.locator('#jigsaw-tray-prev').isDisabled(),true);
  if(hard){assert.equal(await page.locator('#jigsaw-tray-next').isEnabled(),true);await page.locator('#jigsaw-tray-next').click();assert.match(await page.locator('#jigsaw-tray-page').textContent(),/^2 \/ /);await page.locator('#jigsaw-tray-prev').click();}
  else assert.equal(await page.locator('#jigsaw-tray-next').isDisabled(),true);
  if(shape==='square')await page.screenshot({animations:'disabled',path:`${out}/jigsaw-${width}-menu.png`});
  await page.locator('#jigsaw-fit').click();await frame(page);assert.equal(await page.locator('#jigsaw-view-scale').textContent(),'100%');
  await page.locator('.jigsaw-more > summary').click();await page.reload();await page.waitForFunction(()=>document.querySelector('#main').getAttribute('aria-busy')==='false');if(await page.locator('#jigsaw-play').isVisible()){await page.locator('.jigsaw-more > summary').click();await page.locator('#jigsaw-new').click();}await page.locator('#jigsaw-resume').click();await page.locator('#jigsaw-play').waitFor({state:'visible'});
  assert.deepEqual(await stored(page),expected,'resume retains exact source/layout/placement document');const resumed=await page.evaluate(()=>window.qaState);assert.equal(resumed.gameId,state.gameId);assert.equal(resumed.pieces,state.pieces);assert.equal(resumed.inTray,state.inTray);
  await toggle.click();await geometry(page);assert.deepEqual(errors,[]);
  results.push({engine,width,height,shape,pieces:state.pieces,checks:'difficulty-only/ratio/bounds44px/native mouse capture/keyboard/cancel/blur/lostcapture/close/rotation/menu/source+unsaved+save+resume PASS',nativeTouch:engine==='chromium'&&width===390&&shape==='square'});console.log(JSON.stringify(results.at(-1)));await context.close();
 }
} finally {await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
