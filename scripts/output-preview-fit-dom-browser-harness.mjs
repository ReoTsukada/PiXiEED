#!/usr/bin/env node
/** Isolated real preview DOM/CSS/fitter checks; no IndexedDB or output-page integration claims. */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/tmp/pixieed-selection-webkit-runtime/node_modules/playwright/index.mjs';
const { webkit } = await import(pathToFileURL(runtime).href);
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4173';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const origin = new URL(base).origin;
const browser=await webkit.launch({headless:true,executablePath:process.env.PIXIEED_WEBKIT_EXECUTABLE || '/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'});
const results=[];
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin&&!['blob:','data:'].includes(url.protocol))return route.abort();
  if(url.pathname==='/js/creation/output-page.mjs')return route.fulfill({contentType:'text/javascript',body:'/* Isolate real fit/CSS from unavailable WebKit IndexedDB Blob storage. */'});
  return route.continue();
 });
 await page.goto(base+'/output/work/');
 await page.evaluate(async()=>{
  document.querySelector('#output-start').hidden=true;document.querySelector('#output-layout').hidden=false;
  const {createOutputPreviewFit}=await import('/js/creation/output-preview-fit.mjs');
  window.fit=createOutputPreviewFit(document.querySelector('#output-preview'),[document.querySelector('#output-image'),document.querySelector('#output-timeline-preview'),document.querySelector('#output-video')]);
 });
 for(const viewport of [{width:1280,height:800},{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const tag of ['IMG','CANVAS'])for(const [width,height]of [[1,1],[16,16],[16,64],[64,16],[160,160],[8,2048],[2048,8],[1,4096],[4096,1]]){
   await page.evaluate(async({tag,width,height})=>{
    const image=document.querySelector('#output-image'),canvas=document.querySelector('#output-timeline-preview');image.hidden=tag!=='IMG';canvas.hidden=tag!=='CANVAS';
    const media=tag==='IMG'?image:canvas;media.dataset.previewSourceWidth=String(width);media.dataset.previewSourceHeight=String(height);if(tag==='IMG'){image.src='data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ef7654"/></svg>`);await image.decode();}
    else{canvas.width=width;canvas.height=height;canvas.getContext('2d').fillRect(0,0,width,height);}
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   },{tag,width,height});
   const r=await page.evaluate(tag=>{const p=document.querySelector('#output-preview'),m=document.querySelector(tag==='IMG'?'#output-image':'#output-timeline-preview'),pr=p.getBoundingClientRect(),mr=m.getBoundingClientRect(),s=getComputedStyle(p);return{media:mr.toJSON(),box:{left:pr.left+parseFloat(s.borderLeftWidth),top:pr.top+parseFloat(s.borderTopWidth),width:pr.width-parseFloat(s.borderLeftWidth)-parseFloat(s.borderRightWidth),height:pr.height-parseFloat(s.borderTopWidth)-parseFloat(s.borderBottomWidth)},rendering:getComputedStyle(m).imageRendering,pixelated:m.dataset.previewPixelated,natural:[m.naturalWidth,m.naturalHeight],inline:m.style.cssText,supported:CSS.supports('image-rendering','pixelated')};},tag);
   const scale=Math.min(r.box.width/width,r.box.height/height);
   assert.ok(Math.abs(r.media.width-width*scale)<1&&Math.abs(r.media.height-height*scale)<1,JSON.stringify(r));
   assert.ok(r.media.left>=r.box.left-.5&&r.media.top>=r.box.top-.5&&r.media.right<=r.box.left+r.box.width+.5&&r.media.bottom<=r.box.top+r.box.height+.5,JSON.stringify(r));
   if(Math.max(width,height)<=160)assert.ok(['pixelated','crisp-edges'].includes(r.rendering),JSON.stringify({tag,width,height,r}));
   results.push({viewport,tag,width,height,...r});
  }
 }
 assert.deepEqual(errors,[]);
 await writeFile('/tmp/pixieed-output-preview-fit/after-webkit-fit-only.json',JSON.stringify({status:'PASS',cases:results.length,results,integration:'UNTESTED: WebKit IndexedDB Blob storage fails in this runtime',videoAndAnimatedBlobIntegration:'UNTESTED'},null,2));
 console.log(`PASS WebKit: ${results.length} real preview DOM/CSS + fit module cases; IndexedDB and animation/video integration UNTESTED`);
}finally{await browser.close();}
