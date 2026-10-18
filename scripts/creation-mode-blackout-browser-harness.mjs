#!/usr/bin/env node
/** Local-only visual/interaction acceptance for fullscreen creation transitions. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4221';
const origin=new URL(base).origin;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=process.env.PIXIEED_MODE_MOTION_OUTPUT||'/tmp/pixieed-mode-blackout-browser';
const modulePath=process.env.PIXIEED_PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(modulePath==='playwright'?modulePath:pathToFileURL(modulePath).href);
await mkdir(output,{recursive:true});const browser=await chromium.launch({headless:true});
const report={startedAt:new Date().toISOString(),browserVersion:browser.version(),physicalDevices:'UNTESTED',production:'UNTESTED',cameraPermission:'never granted',results:[],failures:[]};
function screenshotStats(png) {
 assert.equal(png.subarray(1,4).toString(),'PNG');let offset=8,width,height,bpp,parts=[];
 while(offset<png.length){const len=png.readUInt32BE(offset),name=png.subarray(offset+4,offset+8).toString(),data=png.subarray(offset+8,offset+8+len);if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[12],0);bpp=data[9]===2?3:data[9]===6?4:null;assert.ok(bpp);}if(name==='IDAT')parts.push(data);offset+=len+12;}
 const raw=inflateSync(Buffer.concat(parts)),stride=width*bpp;let cursor=0,previous=Buffer.alloc(stride),maxRGB=0,blackPixels=0;
 const paeth=(a,b,c)=>{const p=a+b-c,x=Math.abs(p-a),y=Math.abs(p-b),z=Math.abs(p-c);return x<=y&&x<=z?a:y<=z?b:c;};
 for(let y=0;y<height;y++){const filter=raw[cursor++],line=Buffer.alloc(stride);for(let x=0;x<stride;x++){const a=x>=bpp?line[x-bpp]:0,b=previous[x],c=x>=bpp?previous[x-bpp]:0;const add=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):null;assert.notEqual(add,null);line[x]=(raw[cursor++]+add)&255;}for(let x=0;x<stride;x+=bpp){const max=Math.max(line[x],line[x+1],line[x+2]);maxRGB=Math.max(maxRGB,max);if(max===0)blackPixels++;}previous=line;}
 return {width,height,maxRGB,blackPixels,pixels:width*height};
}
const ready=(page,mode)=>page.waitForFunction(m=>document.documentElement.dataset.creationModesReady==='true'&&document.body.dataset.creationMode===m&&!document.body.hasAttribute('data-creation-transition')&&!document.querySelector('#main').inert,mode,{timeout:30000});
const pixels=page=>page.locator('#draw-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));
async function requestMode(page,mode){
 const menu=page.locator('#creation-mode-menu');
 if(!await menu.evaluate(n=>n.open))await page.locator('#creation-mode-menu > summary').click();
 await page.locator(`button[data-creation-mode="${mode}"]`).click();
}
async function contextFor(viewport,reducedMotion='no-preference',animationMode='normal') {
 const ctx=await browser.newContext({viewport,reducedMotion,recordVideo:{dir:output+'/videos',size:viewport}});
 let gate=null;const errors=[];
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin!==origin&&!['blob:','data:'].includes(u.protocol))return route.abort();
  if(gate&&u.pathname===gate.path){const held=gate;gate=null;held.seenResolve();await held.wait;if(held.abort)return route.abort();}
  return route.continue();
 });
 await ctx.addInitScript(()=>{window.__motionQA={mediaRequests:0};if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{window.__motionQA.mediaRequests++;throw new DOMException('Synthetic motion QA denial','NotAllowedError');}});});
 const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/draw/',{waitUntil:'load'});await ready(page,'draw');
 const box=await page.locator('#draw-canvas').boundingBox();await page.mouse.click(box.x+box.width*.41,box.y+box.height*.43);const original=await pixels(page);
 if(animationMode!=='normal')await page.evaluate(kind=>{
  const native=Element.prototype.animate;
  if(kind==='missing')Element.prototype.animate=undefined;
  else Element.prototype.animate=function(...args){const animation=native.apply(this,args);Object.defineProperty(animation,'finished',{value:new Promise(()=>{})});return animation;};
 },animationMode);
 return {ctx,page,errors,original,hold(path,abort=false){let release,seenResolve;const wait=new Promise(r=>release=r),seen=new Promise(r=>seenResolve=r);gate={path,wait,seenResolve,abort};return {release,seen};}};
}
async function blackFrame(page,label,viewport) {
 await page.waitForFunction(()=>{const n=document.querySelector('#creation-mode-transition');return n&&!n.hidden&&n.dataset.phase==='black';});
 const geometry=await page.locator('#creation-mode-transition').evaluate(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {x:r.x,y:r.y,width:r.width,height:r.height,background:s.backgroundColor,opacity:s.opacity,pointerEvents:s.pointerEvents,ariaHidden:n.getAttribute('aria-hidden'),parent:n.parentElement.tagName};});
 assert.ok(geometry.x<=0&&geometry.y<=0&&geometry.width>=viewport.width&&geometry.height>=viewport.height);assert.equal(geometry.pointerEvents,'none');assert.equal(geometry.ariaHidden,'true');assert.equal(geometry.parent,'BODY');
 const png=await page.screenshot({path:output+'/'+label+'-black.png'});const stats=screenshotStats(png);assert.equal(stats.maxRGB,0,'every viewport pixel, including header and bottom bar, is black');return {geometry,stats};
}
try {
 for(const viewport of [{width:320,height:568},{width:844,height:390},{width:1280,height:800}]) {
  const {ctx,page,errors,original,hold}=await contextFor(viewport);const row={name:'normal-'+viewport.width,viewport,transitions:[]};report.results.push(row);
  try {
   for(const mode of ['audio','camera']) {
    const held=hold(mode==='audio'?'/js/creation/draw-music.mjs?rev=20261018-direct-runtime-1':'/js/creation/creation-camera.mjs?rev=20261018-direct-runtime-1');
    await requestMode(page,mode);await held.seen;
    try{const frame=await blackFrame(page,row.name+'-'+mode,viewport);row.transitions.push({target:mode,...frame});}finally{held.release();}
    await ready(page,mode);assert.equal(await page.locator('#creation-mode-transition').isHidden(),true);assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#creation-mode-menu > summary')),true);
   }
   await requestMode(page,'draw');await ready(page,'draw');assert.deepEqual(await pixels(page),original);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__motionQA.mediaRequests),0);
   await page.screenshot({path:output+'/'+row.name+'-final.png'});row.passed=true;
  }catch(e){row.passed=false;row.error=e.message;throw e;}finally{row.video=await page.video().path();await ctx.close();}
 }
 for(const variant of ['reduced','rapid-latest-wins','change-reduced-midway','hidden-midway','resize-black','pagehide-black','cancel-reveal','reduced-during-reveal','missing-animation-api','stalled-animation-finished','reduced-stalled-animation','reduced-during-stalled-reveal','failed-audio-retry']) {
  const viewport={width:390,height:844};const reduced=['reduced','reduced-stalled-animation'].includes(variant);
  const animationMode=variant==='missing-animation-api'?'missing':variant.includes('stalled')?'stalled':'normal';
  const {ctx,page,errors,original,hold}=await contextFor(viewport,reduced?'reduce':'no-preference',animationMode);const row={name:variant,viewport};report.results.push(row);
  try {
   const held=hold('/js/creation/draw-music.mjs?rev=20261018-direct-runtime-1',variant==='failed-audio-retry');await requestMode(page,'audio');await held.seen;
   try {
    if(reduced||variant==='missing-animation-api'||variant==='stalled-animation-finished'||variant==='failed-audio-retry')row.black=await blackFrame(page,variant,viewport);
    else if(variant==='rapid-latest-wins'){await page.waitForFunction(()=>document.body.hasAttribute('data-creation-transition'));await requestMode(page,'camera');await requestMode(page,'draw');}
    else if(variant==='change-reduced-midway')await page.emulateMedia({reducedMotion:'reduce'});
    else if(variant==='hidden-midway')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    else if(variant==='resize-black'){await blackFrame(page,variant+'-portrait',viewport);await page.setViewportSize({width:844,height:390});row.black=await blackFrame(page,variant+'-landscape',{width:844,height:390});}
    else if(variant==='pagehide-black'){row.black=await blackFrame(page,variant,viewport);await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));assert.equal(await page.locator('#creation-mode-transition').isHidden(),true);}
   }finally{held.release();}
   if(['cancel-reveal','reduced-during-reveal','reduced-during-stalled-reveal'].includes(variant)){
    await page.waitForFunction(()=>document.querySelector('#creation-mode-transition')?.dataset.phase==='in');
    if(variant==='cancel-reveal')await requestMode(page,'draw');
    else await page.emulateMedia({reducedMotion:'reduce'});
   }
   if(variant==='pagehide-black'){
    // Page exit disposes the entire editor; it must remove the decorative
    // layer and restore interaction rather than finish the abandoned switch.
    assert.equal(await page.locator('#creation-mode-transition').count(),0);
    assert.equal(await page.locator('#main').evaluate(n=>n.inert),false);
    await page.reload({waitUntil:'load'});
   }
   const endsInDraw=['rapid-latest-wins','cancel-reveal','pagehide-black','failed-audio-retry'].includes(variant);
   await ready(page,endsInDraw?'draw':'audio');assert.equal(await page.locator('#creation-mode-transition').isHidden(),true);
   if(variant==='hidden-midway')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
   if(variant==='failed-audio-retry'){
    assert.equal(await page.locator('.creation-mode-error').isVisible(),true);
    await requestMode(page,'audio');await ready(page,'audio');
    await requestMode(page,'draw');await ready(page,'draw');
   }
   if(!endsInDraw){await requestMode(page,'draw');await ready(page,'draw');}
   assert.deepEqual(await pixels(page),original);assert.deepEqual(errors,[]);row.passed=true;
  }catch(e){row.passed=false;row.error=e.message;throw e;}finally{row.video=await page.video().path();await ctx.close();}
 }
 console.log('PASS: fullscreen black pixels, mode motifs, reduced motion, rapid cancellation, visibility cleanup and pixel preservation');
}catch(e){report.failures.push({message:e.message,stack:e.stack});throw e;}
finally{report.finishedAt=new Date().toISOString();await writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser.close();}
