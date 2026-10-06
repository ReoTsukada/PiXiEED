#!/usr/bin/env node
/** Browser acceptance for live camera region-merge tracking. Synthetic camera only. */
import assert from 'node:assert/strict';
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only a local camera server is allowed');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const out = '/tmp/pixieed-camera-live-region-merge';
await mkdir(out, { recursive: true });
const errors = [];
let checks = 0;
const viewports = [{width:1280,height:800},{width:390,height:844},{width:320,height:568},{width:844,height:390}]
  .filter(({width}) => !process.env.PIXIEED_LIVE_REGION_VIEWPORT || width === Number(process.env.PIXIEED_LIVE_REGION_VIEWPORT));
const mediaCatalog = JSON.parse(await readFile(new URL('../assets/pixel-studio/test-media/catalog.json', import.meta.url), 'utf8'));
const mediaById = Object.fromEntries(mediaCatalog.map(item => [item.id, item]));
const sourceHashes = {};
for(const path of ['pixel-camera.html','css/pixel-lens-camera.css','js/pixel-lens/app.mjs','js/pixel-lens/engine.mjs','js/pixel-lens/region-merge.mjs','js/pixel-lens/live-region-merge.mjs','assets/pixel-studio/test-media/catalog.json','scripts/camera-region-merge-browser-harness.mjs','scripts/camera-live-region-merge-browser-harness.mjs'])sourceHashes[path]=createHash('sha256').update(await readFile(new URL(`../${path}`,import.meta.url))).digest('hex');

async function newPage(viewport, media = null) {
  const context = await browser.newContext({ viewport, deviceScaleFactor:1, acceptDownloads:true, hasTouch:true });
  await context.addInitScript(({ mediaSrc }) => {
    window.__cameraRequestCount = 0;
    window.__cameraTracks = [];
    window.__lastSourceFrame = null;
    window.__lastRenderedFrame = null;
    window.__framePair = null;
    window.__mediaFrameTrace = [];
    window.__cameraImageReference = null;
    window.__captureClickFrame = null;
    window.__mergeTrace = [];
    window.__fixture = { tick:0, offset:0, targetOffset:0, scene:'normal', occluded:false, mediaTime:0 };
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      const image = originalGetImageData.apply(this,args), view = document.querySelector('#view');
      if (view?.width > 1 && !this.canvas.isConnected && this.canvas.width === view.width && this.canvas.height === view.height) {
        window.__lastSourceFrame = { width:image.width, height:image.height, data:Array.from(image.data), tick:window.__fixture.tick };
        window.__cameraImageReference = image.data;
      }
      return image;
    };
    const originalPutImageData = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (image,...args) {
      if (this.canvas?.id === 'view') {
        window.__lastRenderedFrame = { width:image.width, height:image.height, data:Array.from(image.data), tick:window.__fixture.tick };
        if(window.__cameraImageReference) {
          const unmerged=Array.from(window.__cameraImageReference),displayed=Array.from(image.data),root=document.querySelector('#pixelStudio');
          let changedPixels=0,minX=image.width,minY=image.height,maxX=-1,maxY=-1;
          for(let p=0;p<image.width*image.height;p++){const i=p*4;if(unmerged[i]!==displayed[i]||unmerged[i+1]!==displayed[i+1]||unmerged[i+2]!==displayed[i+2]){changedPixels++;const x=p%image.width,y=Math.floor(p/image.width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}
          const regionActive=root?.dataset.regionMerge==='true',status=root?.dataset.regionMergeStatus;
          window.__framePair={width:image.width,height:image.height,tick:window.__fixture.tick,source:window.__lastSourceFrame?.data,unmerged,displayed,regionActive,status,changedPixels,bounds:changedPixels?{minX,minY,maxX,maxY}:null,processingMs:Number(root?.dataset.regionMergeProcessingMs)||0,videoTime:window.__fixture.video?.currentTime||0,previewFrame:Number(root?.dataset.previewFrames)||0,time:performance.now()};
          if(window.__fixture.video){window.__mediaFrameTrace.push({tick:window.__fixture.tick,videoTime:window.__fixture.video.currentTime,previewFrame:Number(root?.dataset.previewFrames)||0,regionActive,status,changedPixels,bounds:changedPixels?{minX,minY,maxX,maxY}:null,processingMs:Number(root?.dataset.regionMergeProcessingMs)||0,time:performance.now()});if(window.__mediaFrameTrace.length>600)window.__mediaFrameTrace.shift();}
        }
        window.__cameraImageReference=null;
      }
      return originalPutImageData.call(this,image,...args);
    };
    setInterval(()=>{const root=document.querySelector('#pixelStudio');if(root?.dataset.regionMerge==='true')window.__mergeTrace.push({tick:window.__fixture.tick,offset:window.__fixture.offset,frame:root.dataset.previewFrames,seedX:root.dataset.regionMergeSeedX,seedY:root.dataset.regionMergeSeedY,status:root.dataset.regionMergeStatus});},100);
    document.addEventListener('click',event=>{
      if(event.target?.closest?.('#capture')){
        const canvas=document.querySelector('#view');
        if(canvas?.width>1) window.__captureClickFrame={width:canvas.width,height:canvas.height,data:[...canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data],tick:window.__fixture.tick,offset:window.__fixture.offset};
      }
    },true);
    const camera=document.createElement('canvas'); camera.width=320; camera.height=320;
    const ctx=camera.getContext('2d',{alpha:false});
    const video=mediaSrc?document.createElement('video'):null;
    if(video){ video.muted=true; video.loop=true; video.playsInline=true; video.src=mediaSrc; video.dataset.testMedia='local-licensed-fixture'; window.__fixture.video=video; }
    function drawSynthetic(){
      const w=camera.width,h=camera.height, f=window.__fixture;
      if(f.cutNow){ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);f.tick++;return;}
      f.offset += Math.max(-0.75,Math.min(0.75,f.targetOffset-f.offset));
      const offset=f.offset;
      ctx.fillStyle='#24344d'; ctx.fillRect(0,0,w,h);
      const sky=ctx.createLinearGradient(0,0,w,h); sky.addColorStop(0,'#304d76');sky.addColorStop(.48,'#45678d');sky.addColorStop(1,'#527b92');
      ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
      ctx.save();ctx.translate(offset,0);
      // A textured orange connected surface that can be followed, with a separated
      // same-color patch whose interior texture differs and therefore must stay intact.
      ctx.fillStyle='#c96650';ctx.fillRect(76,96,94,128);
      ctx.fillStyle='#aa4f44';ctx.fillRect(76,96,94,5);ctx.fillRect(76,219,94,5);ctx.fillRect(76,96,5,128);ctx.fillRect(165,96,5,128);
      for(let y=105;y<214;y+=8)for(let x=84;x<163;x+=8){
        const n=(x*13+y*7)%11;ctx.fillStyle=`rgb(${197+n} ${99+Math.floor(n/2)} ${78+Math.floor(n/3)})`;ctx.fillRect(x,y,3,3);
      }
      ctx.fillStyle='#c96650';ctx.fillRect(220,108,60,70);
      for(let y=112;y<174;y+=7)for(let x=224;x<276;x+=7){const n=(x*3+y*17)%9;ctx.fillStyle=`rgb(${195+n} ${96+Math.floor(n/2)} ${77+Math.floor(n/3)})`;ctx.fillRect(x,y,3,3);}
      // Crisp independent boundaries and distinctive foreground protect false spills.
      ctx.fillStyle='#26384e';ctx.fillRect(0,238,w,82);ctx.fillStyle='#f1c877';
      for(let y=249;y<301;y+=13)for(let x=12;x<305;x+=19)if((x+y)%3)ctx.fillRect(x,y,5,6);
      ctx.fillStyle='#91cfb6';ctx.fillRect(184,205,18,33);ctx.fillStyle='#f0df9c';ctx.fillRect(189,210,8,8);
      ctx.fillStyle='#fff0c1';for(const [x,y] of [[22,26],[51,55],[198,36],[289,64],[29,184],[303,201]])ctx.fillRect(x,y,2,2);
      if(f.occluded){ctx.fillStyle='#172033';ctx.fillRect(72+offset,91,103,139);}
      ctx.restore();
    }
    function draw(){
      const f=window.__fixture;
      if(video?.readyState>=2){
        ctx.drawImage(video,0,0,camera.width,camera.height); f.mediaTime=video.currentTime;
      }else drawSynthetic();
      f.tick++;
    }
    draw(); setInterval(draw,33);
    if(video){video.addEventListener('loadedmetadata',()=>{video.play().catch(()=>{});});}
    navigator.mediaDevices.getSupportedConstraints=()=>({});
    navigator.mediaDevices.getUserMedia=async()=>{window.__cameraRequestCount++;const stream=camera.captureStream(30);window.__cameraTracks.push(...stream.getVideoTracks());return stream;};
  },{mediaSrc:media?`${base}/${media.src}`:null});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='pagead2.googlesyndication.com')return route.fulfill({contentType:'application/javascript',body:''});
    return url.origin===origin?route.continue():route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
  await page.goto(`${base}/pixel-camera.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#capture')?.dataset.action==='capture'&&!document.querySelector('#capture').disabled,null,{timeout:20000});
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.ready==='true',null,{timeout:20000});
  await page.waitForFunction(()=>document.querySelector('#gestureHint')?.hidden===true,null,{timeout:6500});
  if(media) await page.waitForFunction(()=>window.__fixture.video?.readyState>=2&&window.__fixture.video.currentTime>.5,null,{timeout:15000});
  return {context,page};
}
async function beginByHold(page, x=.39, y=.49){
  const point=await page.locator('#view').evaluate((node,p)=>{const r=node.getBoundingClientRect();return{x:r.x+r.width*p.x,y:r.y+r.height*p.y};},{x,y});
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(620);await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='true',null,{timeout:7000});
}
async function chooseTarget(page){
  const root=page.locator('#pixelStudio');
  const source=Number(await root.getAttribute('data-region-merge-source-index'));
  const target=await page.locator('#regionMergePalette [data-target-index]').evaluateAll((nodes,s)=>nodes.map(n=>Number(n.dataset.targetIndex)).find(i=>i!==s),source);
  assert.notEqual(target,undefined,'palette has a target different from the source');
  const more=page.locator('#toolbarContextMore');
  if(await more.isVisible()&&await root.getAttribute('data-settings-expanded')!=='true')await more.click();
  await page.locator(`#regionMergePalette [data-target-index="${target}"]`).click();
  await page.waitForFunction(i=>document.querySelector(`#regionMergePalette [data-target-index="${i}"]`)?.getAttribute('aria-pressed')==='true',target,{timeout:4000});
  try{await page.waitForFunction(()=>Number(document.querySelector('#pixelStudio')?.dataset.regionMergeChangedPixels)>0,null,{timeout:6000});}
  catch(error){const diagnostic=await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},root:{...document.querySelector('#pixelStudio').dataset},source:document.querySelector('#regionMergePalette [data-source="true"]')?.outerHTML,targets:[...document.querySelectorAll('#regionMergePalette [data-target-index]')].map(n=>({index:n.dataset.targetIndex,pressed:n.getAttribute('aria-pressed'),hidden:n.hidden,rect:(()=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()})),trace:window.__mergeTrace.slice(-30)}));await writeFile(`${out}/choose-target-failure-${diagnostic.viewport.width}.json`,JSON.stringify(diagnostic,null,2));await page.screenshot({path:`${out}/choose-target-failure-${diagnostic.viewport.width}.png`});throw error;}
  return target;
}
async function chooseTargetWithoutPixelRequirement(page){
  const root=page.locator('#pixelStudio'),source=Number(await root.getAttribute('data-region-merge-source-index'));
  const target=await page.locator('#regionMergePalette [data-target-index]').evaluateAll((nodes,s)=>nodes.map(n=>Number(n.dataset.targetIndex)).find(i=>i!==s),source);
  assert.notEqual(target,undefined,'media palette has a target different from the source');
  const more=page.locator('#toolbarContextMore');if(await more.isVisible()&&await root.getAttribute('data-settings-expanded')!=='true')await more.click();
  await page.locator(`#regionMergePalette [data-target-index="${target}"]`).click();
  await page.waitForFunction(i=>document.querySelector(`#regionMergePalette [data-target-index="${i}"]`)?.getAttribute('aria-pressed')==='true',target,{timeout:4000});
  return target;
}
async function frameCounter(page){return Number(await page.locator('#pixelStudio').getAttribute('data-preview-frames'));}
async function readFrames(page){return page.evaluate(()=>({raw:window.__lastSourceFrame,rendered:window.__lastRenderedFrame,pair:window.__framePair,fixture:{...window.__fixture,video:undefined},root:{...document.querySelector('#pixelStudio').dataset}}));}
function rectVisibleAndHit(node){const r=node.getBoundingClientRect();const x=Math.max(0,Math.min(innerWidth-1,r.left+r.width/2)),y=Math.max(0,Math.min(innerHeight-1,r.top+r.height/2)),hit=document.elementFromPoint(x,y);return{width:r.width,height:r.height,visible:!!(r.width&&r.height)&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden',hit:hit===node||node.contains(hit),rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom}};}
async function assertHomeLayout(page,viewport){
  const state=await page.evaluate(()=>{
    const visible=n=>!!n&&!n.hidden&&n.getClientRects().length>0&&getComputedStyle(n).display!=='none';
    const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r&&{x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
    return{tools:[...document.querySelectorAll('#toolbarHome [data-tool]')].map(n=>({tool:n.dataset.tool,visible:visible(n),rect:(()=>{const r=n.getBoundingClientRect();return{width:r.width,height:r.height};})()})),overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth,frame:rect('#captureFrame'),toolbar:rect('#toolbar'),nav:rect('.app-tabs[data-nav="five"]'),context:document.querySelector('#pixelStudio').dataset.settingsContext,region:document.querySelector('#pixelStudio').dataset.regionMerge};
  });
  assert.equal(state.context,'');assert.equal(state.region,'false');assert.equal(state.overflow,false,`home page overflow at ${viewport.width}: ${JSON.stringify(state)}`);
  assert.deepEqual(state.tools.map(x=>x.tool),['look','dither','pixels','aspect','tone','zoom']);
  for(const item of state.tools)assert.ok(item.visible&&item.rect.width>=44&&item.rect.height>=44,`home tool inaccessible: ${JSON.stringify(item)}`);
  const overlaps=(a,b)=>a&&b&&a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;
  assert.ok(!overlaps(state.frame,state.toolbar)&&!overlaps(state.frame,state.nav),`preview overlaps home controls: ${JSON.stringify(state)}`);checks++;
}
async function assertMergeLayout(page,viewport){
  const reachables=page.locator('#toolbarContextBack,#toolbarContextMore,#regionMergePanel button,#regionMergePanel input[type="range"],#regionMergePanel select,#regionMergePalette [data-target-index]');
  for(let i=0;i<await reachables.count();i++){const item=reachables.nth(i);if(await item.isVisible())await item.scrollIntoViewIfNeeded();}
  const data=await page.evaluate(()=>{
    const visible=n=>!!n&&!n.hidden&&n.getClientRects().length>0&&getComputedStyle(n).display!=='none';
    const selectors='#toolbarContextBack,#toolbarContextMore,#regionMergePanel button,#regionMergePanel input[type="range"],#regionMergePanel select,#regionMergePalette [data-target-index]';
    const controls=[...document.querySelectorAll(selectors)].filter(visible).map(n=>({label:n.getAttribute('aria-label')||n.textContent.trim()||n.id,...rectVisible(n)}));
    function rectVisible(n){const r=n.getBoundingClientRect();let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};for(let p=n.parentElement;p&&p!==document.body;p=p.parentElement){const c=getComputedStyle(p),b=p.getBoundingClientRect();if(['auto','scroll','hidden','clip'].includes(c.overflowX)){clip.left=Math.max(clip.left,b.left);clip.right=Math.min(clip.right,b.right)}if(['auto','scroll','hidden','clip'].includes(c.overflowY)){clip.top=Math.max(clip.top,b.top);clip.bottom=Math.min(clip.bottom)}}const left=Math.max(clip.left,r.left),right=Math.min(clip.right,r.right),top=Math.max(clip.top,r.top),bottom=Math.min(clip.bottom,r.bottom);return{width:r.width,height:r.height,visibleRect:{left,right,top,bottom,width:Math.max(0,right-left),height:Math.max(0,bottom-top)}}}
    const panel=document.querySelector('#regionMergePanel').getBoundingClientRect(),toolbar=document.querySelector('#toolbar').getBoundingClientRect();
    return{controls,overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth,panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom},toolbar:{left:toolbar.left,right:toolbar.right,top:toolbar.top,bottom:toolbar.bottom}};
  });
  assert.equal(data.overflow,false,`merge page overflow at ${viewport.width}: ${JSON.stringify(data)}`);
  for(const c of data.controls)assert.ok(c.width>=44&&c.height>=44,`merge control is under 44px: ${JSON.stringify(c)}`);
  for(let i=0;i<data.controls.length;i++)for(let j=i+1;j<data.controls.length;j++){const a=data.controls[i].visibleRect,b=data.controls[j].visibleRect;if(a.right<=a.left||a.bottom<=a.top||b.right<=b.left||b.bottom<=b.top)continue;assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,`visible controls overlap: ${JSON.stringify([data.controls[i],data.controls[j]])}`)}
  for(let i=0;i<await reachables.count();i++){const item=reachables.nth(i);if(!await item.isVisible())continue;await item.scrollIntoViewIfNeeded();const hit=await item.evaluate(node=>{const r=node.getBoundingClientRect();let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};for(let p=node.parentElement;p&&p!==document.body;p=p.parentElement){const c=getComputedStyle(p),b=p.getBoundingClientRect();if(['auto','scroll','hidden','clip'].includes(c.overflowX)){clip.left=Math.max(clip.left,b.left);clip.right=Math.min(clip.right,b.right)}if(['auto','scroll','hidden','clip'].includes(c.overflowY)){clip.top=Math.max(clip.top,b.top);clip.bottom=Math.min(clip.bottom,b.bottom)}}const left=Math.max(clip.left,r.left),right=Math.min(clip.right,r.right),top=Math.max(clip.top,r.top),bottom=Math.min(clip.bottom,r.bottom),x=Math.max(0,Math.min(innerWidth-1,(left+right)/2)),y=Math.max(0,Math.min(innerHeight-1,(top+bottom)/2)),hit=document.elementFromPoint(x,y);return{label:node.getAttribute('aria-label')||node.textContent.trim()||node.id,width:r.width,height:r.height,visibleRect:{left,right,top,bottom,width:Math.max(0,right-left),height:Math.max(0,bottom-top)},reachable:hit===node||node.contains(hit)}});/* Keep nominal controls at 44px; tolerate <1 CSS px of fractional clipping at a scrollport edge while requiring center hit. */if(!(hit.width>=44&&hit.height>=44&&hit.visibleRect.width>=43&&hit.visibleRect.height>=43&&hit.reachable)){await writeFile(`${out}/merge-control-reachability-failure-${viewport.width}.json`,JSON.stringify({viewport,hit,data},null,2));await page.screenshot({path:`${out}/merge-control-reachability-failure-${viewport.width}.png`});}assert.ok(hit.width>=44&&hit.height>=44&&hit.visibleRect.width>=43&&hit.visibleRect.height>=43&&hit.reachable,`merge control not reachable after scrolling: ${JSON.stringify(hit)}`)}
  assert.ok(data.panel.bottom<=data.toolbar.top+1||data.panel.top>=data.toolbar.bottom-1||data.panel.right<=data.toolbar.left+1||data.panel.left>=data.toolbar.right-1,`panel overlaps context rail: ${JSON.stringify(data)}`);checks++;
}
function colorAt(frame,x,y){const p=(y*frame.width+x)*4;return frame.data.slice(p,p+4);}
function rgbChannels(value){const parts=String(value).match(/\d+/g)||[];return parts.slice(0,3).map(Number);}
function cropRgba(frame,x,y,radius=4){const left=Math.max(0,x-radius),top=Math.max(0,y-radius),right=Math.min(frame.width-1,x+radius),bottom=Math.min(frame.height-1,y+radius),pixels=[];for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++)pixels.push({x:px,y:py,rgba:colorAt(frame,px,py)});return{left,top,right,bottom,pixels};}
function rgbDistance(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);}
function summarizeMediaTrace(trace,startTime){const samples=trace.filter(item=>item.time>=startTime),active=samples.filter(item=>item.regionActive),applied=active.filter(item=>item.changedPixels>0),first=active[0]||null,last=active.at(-1)||null,loss=first?samples.find(item=>item.time>last.time&&!item.regionActive)||null:null,duration=first&&last?last.time-first.time:0;return{publishedFrames:samples.length,activeFrames:active.length,appliedFrames:applied.length,firstActive:first&&{tick:first.tick,time:first.time,videoTime:first.videoTime,previewFrame:first.previewFrame},lastActive:last&&{tick:last.tick,time:last.time,videoTime:last.videoTime,previewFrame:last.previewFrame},autoLoss:loss&&{tick:loss.tick,time:loss.time,videoTime:loss.videoTime,previewFrame:loss.previewFrame},activeDurationMs:duration,activeFps:duration>0?Math.round((active.length-1)*1000/duration*100)/100:null,appliedFps:duration>0?Math.round(applied.length/duration*1000*100)/100:null,maxChangedPixels:Math.max(0,...samples.map(item=>item.changedPixels)),lastChangedBounds:applied.at(-1)?.bounds||null};}
async function assertCaptureMatches(page){
  const saved=await page.evaluate(async()=>{
    const click=window.__captureClickFrame,store=await import('/js/creation/pxd-store.mjs'),project=await import('/js/creation/pxd-project.mjs'),shared=await import('/js/creation/shared-image.mjs');
    const deadline=performance.now()+20000;let lastPointer=null,lastError='';
    while(performance.now()<deadline){
      try{
        const pointer=JSON.parse(localStorage.getItem('pixieed:pxd:last:camera')||'null');lastPointer=pointer;
        if(!pointer?.projectId||!pointer?.revisionId||!/^[A-Za-z0-9_-]{1,128}$/.test(pointer.projectId)){await new Promise(resolve=>setTimeout(resolve,100));continue;}
        const record=await store.createPxdStore().load(pointer.projectId,pointer.revisionId),image=await project.readPxdSharedImage(record);
        if(image){const expected=shared.prepareSharedCanvasImage({width:click.width,height:click.height,rgba:Uint8Array.from(click.data)},{passActive:true,width:image.width,height:image.height,maxColors:32}).image.rgba;return{width:image.width,height:image.height,rgba:[...image.rgba],expected:[...expected],click:{width:click.width,height:click.height,tick:click.tick},pointer};}
      }catch(error){lastError=String(error?.message||error);}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    return{error:'PXD save did not expose a readable shared image',lastPointer,lastError};
  });
  assert.ok(saved.rgba,`PXD shared image is readable: ${JSON.stringify(saved)}`);
  assert.deepEqual(saved.rgba,saved.expected,'saved PXD contains every pixel of the frame visible at capture click');
  assert.equal(saved.width,saved.click.width);assert.equal(saved.height,saved.click.height);checks++;
  await page.waitForFunction(()=>document.querySelector('#savePng')?.getAttribute('aria-disabled')!=='true'&&document.querySelector('#savePng')?.href.startsWith('blob:'),null,{timeout:15000});
  await page.locator('#savePng').click();const downloadEvent=page.waitForEvent('download');await page.locator('#cameraDownloadFile').click();const download=await downloadEvent;assert.match(download.suggestedFilename(),/\.png$/i,'existing PNG export route returns a PNG download');
  const pngPath=await download.path();assert.ok(pngPath,'PNG export was materialized');await copyFile(pngPath,`${out}/live-region-merge-captured.png`);assert.ok((await stat(`${out}/live-region-merge-captured.png`)).size>100,'captured PNG artifact is non-empty');
  const pngSample=await page.evaluate(async()=>{const click=window.__captureClickFrame,bitmap=await createImageBitmap(await(await fetch(document.querySelector('#savePng').href)).blob()),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);const x=Math.max(0,Math.min(click.width-1,Math.round((123+click.offset)*click.width/320))),y=Math.round(148*click.height/320),scale=bitmap.width/click.width;return{source:click.data.slice((y*click.width+x)*4,(y*click.width+x)*4+4),png:[...ctx.getImageData(x*scale,y*scale,1,1).data],scale,width:bitmap.width,height:bitmap.height};});
  assert.deepEqual(pngSample.png,pngSample.source,'PNG export preserves a pixel from the moving edited surface shown at capture');checks++;
}
async function testViewport(viewport){
  const {context,page}=await newPage(viewport);const root=page.locator('#pixelStudio');
  await assertHomeLayout(page,viewport);
  await page.screenshot({path:`${out}/live-home-${viewport.width}.png`});
  // Long hold on the textured connected surface, then prove the active preview is live.
  await beginByHold(page);
  const sourceIndex=Number(await root.getAttribute('data-region-merge-source-index'));
  const sourceSwatch=page.locator(`#regionMergePalette [data-target-index="${sourceIndex}"]`);
  assert.ok(await sourceSwatch.count(),'the selected source color remains represented in the live palette');
  assert.equal(await sourceSwatch.getAttribute('data-source'),'true','the current source remains identifiable during live tracking');
  await sourceSwatch.scrollIntoViewIfNeeded();assert.ok(await sourceSwatch.isVisible(),'the source swatch remains reachable if it is beyond the first palette window');
  await assertMergeLayout(page,viewport);
  const activeBefore=await frameCounter(page), tickBefore=(await page.evaluate(()=>window.__fixture.tick));
  await page.waitForFunction(old=>Number(document.querySelector('#pixelStudio').dataset.previewFrames)>=old+10,activeBefore,{timeout:12000});
  assert.equal(await root.getAttribute('data-region-merge'),'true','hold session remains active across at least ten new live frames');
  assert.ok((await page.evaluate(()=>window.__fixture.tick))>tickBefore);
  const target=await chooseTarget(page);
  const chosenTargetRgb=await page.locator(`#regionMergePalette [data-target-index="${target}"]`).evaluate(node=>getComputedStyle(node).backgroundColor);
  if(viewport.width===1280)await page.screenshot({path:`${out}/live-merge-before-motion.png`});
  const beforeMotion=await readFrames(page);
  const seedStart={x:Number(beforeMotion.root.regionMergeSeedX),y:Number(beforeMotion.root.regionMergeSeedY)};
  await page.evaluate(()=>{window.__fixture.targetOffset=70;});
  const frameAtMotion=await frameCounter(page);
  await page.waitForFunction(old=>window.__fixture.offset>=68&&Number(document.querySelector('#pixelStudio').dataset.previewFrames)>=old+30,frameAtMotion,{timeout:30000});
  const afterMotion=await readFrames(page);
  assert.equal(afterMotion.root.regionMerge,'true','moving camera scene remains in tracking session');
  assert.equal(afterMotion.root.regionMergeStatus,'tracking');
  assert.ok(Number(afterMotion.root.regionMergeChangedPixels)>0&&Number(afterMotion.root.regionMergeSelectedPixels)>0,'live tracker reports an applied, non-empty region');
  assert.ok(Number(afterMotion.root.regionMergeProcessingMs)>=0&&Number.isFinite(Number(afterMotion.root.regionMergeProcessingMs)),'tracker processing diagnostic is finite');
  const seedEnd={x:Number(afterMotion.root.regionMergeSeedX),y:Number(afterMotion.root.regionMergeSeedY)};
  const expectedSeedX=Math.round(seedStart.x+(afterMotion.fixture.offset-beforeMotion.fixture.offset)*afterMotion.raw.width/320);
  if(Math.abs(seedEnd.x-expectedSeedX)>8){await page.screenshot({path:`${out}/seed-follow-failure-${viewport.width}.png`});await writeFile(`${out}/seed-follow-failure-${viewport.width}.json`,JSON.stringify({viewport,frameMap:{cameraCanvas:[320,320],output:[afterMotion.raw.width,afterMotion.raw.height],offsetCameraPx:afterMotion.fixture.offset-beforeMotion.fixture.offset,offsetExpectedOutputPx:(afterMotion.fixture.offset-beforeMotion.fixture.offset)*afterMotion.raw.width/320},before:{fixture:beforeMotion.fixture,raw:beforeMotion.raw,rendered:beforeMotion.rendered},after:{fixture:afterMotion.fixture,raw:afterMotion.raw,rendered:afterMotion.rendered},seedStart,seedEnd,predictedSeedX:expectedSeedX,crops:{beforeSeed:cropRgba(beforeMotion.raw,seedStart.x,seedStart.y),afterOldSeed:cropRgba(afterMotion.raw,seedStart.x,seedStart.y),afterActualSeed:cropRgba(afterMotion.raw,seedEnd.x,seedEnd.y),afterPredictedSeed:cropRgba(afterMotion.raw,expectedSeedX,seedEnd.y)},trace:await page.evaluate(()=>window.__mergeTrace),root:afterMotion.root},null,2));}
  assert.ok(Math.abs(seedEnd.x-expectedSeedX)<=8,`tracked seed follows the camera motion after leaving its original surface location: ${JSON.stringify({seedStart,seedEnd,expectedSeedX,offset:afterMotion.fixture.offset})}`);
  assert.ok(afterMotion.fixture.offset>=68,'moving fixture carried the original seed outside its initial surface position');
  // Selected patch changes while the disconnected same-color patch remains outside the mask.
  const expectedSelectedX=Math.max(0,Math.min(afterMotion.rendered.width-1,Math.round((123+afterMotion.fixture.offset)*afterMotion.rendered.width/320)));
  const expectedRemoteX=Math.max(0,Math.min(afterMotion.rendered.width-1,Math.round((250+afterMotion.fixture.offset)*afterMotion.rendered.width/320)));
  const sampleY=Math.round(148*afterMotion.rendered.height/320);
  const targetIndex=Number(afterMotion.root.regionMergeCurrentTargetIndex||target);
  const targetColor=await page.locator(`#regionMergePalette [data-target-index="${targetIndex}"]`).evaluate(node=>getComputedStyle(node).backgroundColor).catch(()=>null);
  const editedPixel=colorAt(afterMotion.rendered,expectedSelectedX,sampleY);
  const remoteRaw=afterMotion.raw&&colorAt(afterMotion.raw,expectedRemoteX,sampleY);
  assert.ok(afterMotion.rendered&&afterMotion.raw,'raw and published frames are observed while tracking');
  const preX=Math.max(0,Math.min(beforeMotion.rendered.width-1,Math.round((250+beforeMotion.fixture.offset)*beforeMotion.rendered.width/320)));
  const preRemote=colorAt(beforeMotion.rendered,preX,sampleY);
  const movedRemote=colorAt(afterMotion.rendered,expectedRemoteX,sampleY);
  assert.ok(rgbDistance(movedRemote,preRemote)<70,`disconnected same-color surface is not recolored: ${JSON.stringify({preRemote,movedRemote,remoteRaw})}`);
  assert.ok(afterMotion.pair?.unmerged&&afterMotion.pair?.displayed,'same-frame unmerged and published pixels are captured');
  const sameFrameRemoteBefore=colorAt({width:afterMotion.pair.width,height:afterMotion.pair.height,data:afterMotion.pair.unmerged},expectedRemoteX,sampleY);
  const sameFrameRemoteAfter=colorAt({width:afterMotion.pair.width,height:afterMotion.pair.height,data:afterMotion.pair.displayed},expectedRemoteX,sampleY);
  assert.deepEqual(sameFrameRemoteAfter,sameFrameRemoteBefore,'the disconnected same-color patch is byte-identical to its unmerged pixels in the same frame');
  assert.ok(Number(afterMotion.root.regionMergeTargetIndex)===target,'chosen palette index remains the requested target');
  assert.equal(await page.locator(`#regionMergePalette [data-target-index="${target}"]`).getAttribute('aria-pressed'),'true','target selection survives live frame palette updates');
  assert.ok(Number.isInteger(Number(afterMotion.root.regionMergeCurrentTargetIndex)),'target RGB maps to a current live-palette index');
  await page.locator('#regionMergeMode').selectOption('color');
  await page.locator('#regionMergeStrength').evaluate(n=>{n.value='100';n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));});
  const settingsCounter=await frameCounter(page);await page.waitForFunction(old=>Number(document.querySelector('#pixelStudio').dataset.previewFrames)>old,settingsCounter,{timeout:5000});
  assert.equal(await root.getAttribute('data-region-merge'),'true','mode/strength changes do not end live tracking');checks++;
  if(viewport.width===320){const cameraRequests=await page.evaluate(()=>window.__cameraRequestCount);await page.setViewportSize({width:390,height:844});await page.waitForTimeout(180);assert.equal(await root.getAttribute('data-region-merge'),'true','CSS-only resize keeps the active session because the dot-grid dimensions are unchanged');assert.equal(await page.evaluate(()=>window.__cameraRequestCount),cameraRequests,'active reflow does not restart the camera');await assertMergeLayout(page,{width:390,height:844});await page.setViewportSize(viewport);await page.waitForTimeout(150);checks++;}
  await page.screenshot({path:`${out}/live-merge-after-motion-${viewport.width}.png`});
  await page.locator('#view').screenshot({path:`${out}/live-merge-view-after-motion-${viewport.width}.png`});
  await writeFile(`${out}/live-merge-motion-evidence-${viewport.width}.json`,JSON.stringify({viewport,sourceHashes,frameMap:{cameraCanvas:[320,320],output:[afterMotion.rendered.width,afterMotion.rendered.height],offsetCameraPx:afterMotion.fixture.offset-beforeMotion.fixture.offset,offsetOutputPx:(afterMotion.fixture.offset-beforeMotion.fixture.offset)*afterMotion.rendered.width/320},checks:{framesAdvanced:afterMotion.root.previewFrames,fixtureOffset:afterMotion.fixture.offset,seedStart,seedEnd,expectedSeedX,seedError:seedEnd.x-expectedSeedX,selectedPixels:afterMotion.root.regionMergeSelectedPixels,changedPixels:afterMotion.root.regionMergeChangedPixels,processingMs:afterMotion.root.regionMergeProcessingMs,targetIndex,targetColor:chosenTargetRgb,currentTargetIndex:afterMotion.root.regionMergeCurrentTargetIndex,selectedPixel:editedPixel,remoteBefore:preRemote,remoteAfter:movedRemote},...(viewport.width===1280?{rawFrame:afterMotion.raw,renderedFrame:afterMotion.rendered}:{})},null,2));
  // Undo restores the latest raw frame while keeping tracking alive; we detect this via
  // source/target counters and then separately assert that motion continues afterwards.
  await page.locator('#regionMergeUndo').click();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMergeCurrentTargetIndex===''&&document.querySelector('#regionMergeUndo')?.disabled===true,null,{timeout:4000});
  const undoFrame=await readFrames(page);
  assert.equal(undoFrame.root.regionMerge,'true','undo clears the edit without ending tracking');
  assert.equal(undoFrame.root.regionMergeTargetIndex,'','undo clears the target binding');
  assert.ok(undoFrame.raw&&undoFrame.rendered,'undo displays an available current raw/rendered frame');checks++;
  const undoSampleX=Math.max(0,Math.min(undoFrame.rendered.width-1,Math.round((123+undoFrame.fixture.offset)*undoFrame.rendered.width/320)));
  assert.ok(rgbDistance(colorAt(undoFrame.rendered,undoSampleX,sampleY),rgbChannels(chosenTargetRgb))>55,'undo restores the current raw surface at its moved location rather than preserving the edited target color');checks++;
  // A fresh target proves undo can be followed by another live edit, then cancel returns home.
  await chooseTarget(page);
  const beforeCancel=await frameCounter(page);
  await page.locator('#regionMergeCancel').click();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='false',null,{timeout:4000});
  await page.waitForFunction(old=>Number(document.querySelector('#pixelStudio').dataset.previewFrames)>old,beforeCancel,{timeout:6000});
  const cancelFrame=await readFrames(page);const cancelSampleX=Math.max(0,Math.min(cancelFrame.rendered.width-1,Math.round((123+cancelFrame.fixture.offset)*cancelFrame.rendered.width/320)));
  assert.ok(rgbDistance(colorAt(cancelFrame.rendered,cancelSampleX,sampleY),rgbChannels(chosenTargetRgb))>55,'cancel returns to the newest unmerged frame after the scene moved');checks++;
  await assertHomeLayout(page,viewport);
  if(viewport.width===320) {
    const calls=await page.evaluate(()=>window.__cameraRequestCount);
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(180);
    assert.equal(await page.evaluate(()=>window.__cameraRequestCount),calls,'ordinary responsive resize does not restart fake camera');
    await assertHomeLayout(page,{width:390,height:844});checks++;
  }
  // Scene cuts and occlusion loss clear an active selection and publish the newest raw.
  for(const scene of ['cut','occluded']) {
    await page.evaluate(()=>{window.__fixture.occluded=false;window.__fixture.cutNow=false;window.__fixture.targetOffset=0;});
    await page.waitForFunction(()=>window.__fixture.offset<1,null,{timeout:8000});
    const settleFrame=await frameCounter(page);await page.waitForFunction(old=>Number(document.querySelector('#pixelStudio').dataset.previewFrames)>old,settleFrame,{timeout:5000});
    await beginByHold(page);
    await chooseTarget(page);
    if(scene==='cut') {
      await page.evaluate(()=>{window.__fixture.cutNow=true;});
    } else await page.evaluate(()=>{window.__fixture.occluded=true;});
    await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='false',null,{timeout:10000});
    await page.waitForFunction(()=>/景色が変わった|追跡を続けられない/.test(document.querySelector('#stageMsg')?.textContent||''),null,{timeout:5000});
    assert.equal(await root.getAttribute('data-region-merge-current-target-index'),'');
    assert.ok(await frameCounter(page)>0);await assertHomeLayout(page,viewport);checks++;
  }
  // Restore ordinary synthetic camera source after terminal-loss checkpoints.
  await page.evaluate(()=>{window.__fixture.occluded=false;window.__fixture.scene='normal';window.__fixture.cutNow=false;window.__fixture.targetOffset=0;});
  await page.waitForFunction(()=>window.__fixture.offset<1,null,{timeout:8000});
  if(viewport.width===1280){
    await beginByHold(page);const requestsBeforeFlip=await page.evaluate(()=>window.__cameraRequestCount);await page.locator('#flipCamera').click();await page.waitForFunction(old=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='false'&&window.__cameraRequestCount>old,requestsBeforeFlip,{timeout:12000});await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.ready==='true'&&Number(document.querySelector('#pixelStudio')?.dataset.previewFrames)>2,null,{timeout:12000});assert.ok(await page.evaluate(()=>window.__cameraTracks.length>=2&&window.__cameraTracks[0].readyState==='ended'&&window.__cameraTracks.at(-1).readyState==='live'),'flip clears tracker, stops old fake track, and starts a fresh fake track');await assertHomeLayout(page,viewport);checks++;
  }
  if(viewport.width===1280){
    // Capture uses the existing PNG/PXD route and must persist exactly the click-frame pixels.
    await beginByHold(page);await chooseTarget(page);await page.waitForTimeout(180);
    await page.locator('#capture').click();
    await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='captured',null,{timeout:15000});
    await assertCaptureMatches(page);
    await page.screenshot({path:`${out}/live-capture-captured.png`});
  }
  console.log(`live region merge ${viewport.width}x${viewport.height}: PASS`);
  await context.close();
}
async function testLicensedTemporalMedia(media){
  const viewport={width:1280,height:800};const {context,page}=await newPage(viewport,media);
  const video=await page.evaluate(()=>window.__fixture.video.currentTime);
  const startTick=await page.evaluate(()=>window.__fixture.tick);
  await page.waitForTimeout(1200);
  const temporal=await page.evaluate(()=>({tick:window.__fixture.tick,time:window.__fixture.video?.currentTime,raw:window.__lastSourceFrame}));
  assert.ok(temporal.tick>=startTick+20,`${media.id}: local video is sampled by the synthetic camera stream`);
  assert.ok(temporal.time>video+.4,`${media.id}: licensed video time advances`);
  // The real local clip is supplemental temporal evidence only; semantic tracking quality
  // is only scored on the controlled moving fixture above.
  const holdStart=await page.evaluate(()=>performance.now());let entered=true,entryError='';
  try{await beginByHold(page,.5,.5);}catch(error){entered=false;entryError=String(error?.message||error);}
  if(!entered){
    const terminal=await page.evaluate(()=>({tick:window.__fixture.tick,time:window.__fixture.video.currentTime,frames:Number(document.querySelector('#pixelStudio').dataset.previewFrames),status:document.querySelector('#pixelStudio').dataset.regionMergeStatus,lastStatus:document.querySelector('#pixelStudio').dataset.regionMergeLastStatus,regionActive:document.querySelector('#pixelStudio').dataset.regionMerge==='true',trace:window.__mediaFrameTrace,pair:window.__framePair,root:{...document.querySelector('#pixelStudio').dataset}}));
    const telemetry=summarizeMediaTrace(terminal.trace,holdStart);
    await writeFile(`${out}/temporal-${media.id}.json`,JSON.stringify({media:{id:media.id,credit:media.credit,license:media.license,licenseUrl:media.licenseUrl,sourceUrl:media.sourceUrl},before:{tick:startTick,time:video},after:{tick:terminal.tick,time:terminal.time,frames:terminal.frames,status:terminal.status,lastStatus:terminal.lastStatus,regionActive:terminal.regionActive},tracking:{holdEntered:false,entryError,temporalMetrics:telemetry,lastPairedFrame:{tick:terminal.pair?.tick,regionActive:terminal.pair?.regionActive,status:terminal.pair?.status,changedPixels:terminal.pair?.changedPixels,bounds:terminal.pair?.bounds},terminalRoot:terminal.root,frameTrace:terminal.trace.filter(item=>item.time>=holdStart)},semanticTrackingQuality:'not scored: no annotated ground-truth mask for licensed clips'},null,2));
    await page.screenshot({path:`${out}/temporal-${media.id}-hold-not-entered.png`});
    await context.close();checks++;console.log(`licensed temporal fixture ${media.id}: live input advanced; hold session not observed; segmentation quality not scored`);return;
  }
  const target=await chooseTargetWithoutPixelRequirement(page);
  const before=await frameCounter(page),traceStartTime=await page.evaluate(()=>performance.now());
  await page.waitForFunction(({old,start})=>Number(document.querySelector('#pixelStudio').dataset.previewFrames)>=old+20&&performance.now()>=start+5000,{old:before,start:traceStartTime},{timeout:15000});
  const after=await page.evaluate(()=>({tick:window.__fixture.tick,time:window.__fixture.video.currentTime,frames:Number(document.querySelector('#pixelStudio').dataset.previewFrames),status:document.querySelector('#pixelStudio').dataset.regionMergeStatus,lastStatus:document.querySelector('#pixelStudio').dataset.regionMergeLastStatus,regionActive:document.querySelector('#pixelStudio').dataset.regionMerge==='true',pair:window.__framePair,trace:window.__mediaFrameTrace}));
  assert.ok(after.tick>temporal.tick&&after.time>temporal.time,'real-media pass advances temporal source while live merge UI is open');
  const pair=after.pair;
  const trace=after.trace.filter(item=>item.time>=traceStartTime),temporalMetrics=summarizeMediaTrace(trace,traceStartTime);
  await writeFile(`${out}/temporal-${media.id}.json`,JSON.stringify({media:{id:media.id,credit:media.credit,license:media.license,licenseUrl:media.licenseUrl,sourceUrl:media.sourceUrl},before:{tick:startTick,time:video},after:{tick:after.tick,time:after.time,frames:after.frames,status:after.status,lastStatus:after.lastStatus,regionActive:after.regionActive},tracking:{targetChoiceIndex:target,pairedFrame:{tick:pair?.tick,regionActive:pair?.regionActive,status:pair?.status,videoTime:pair?.videoTime},temporalMetrics,unmergedVsDisplayed:pair?{changedPixels:pair.changedPixels,bounds:pair.bounds}:null,sourceRGBA:pair?.source,unmergedRGBA:pair?.unmerged,displayedRGBA:pair?.displayed,frameTrace:trace},semanticTrackingQuality:'not scored: no annotated ground-truth mask for licensed clips'},null,2));
  await context.close();checks++;console.log(`licensed temporal fixture ${media.id}: live input advanced; segmentation quality not scored`);
}
async function testPageHideCleanup(){
  const viewport={width:390,height:844};const{context,page}=await newPage(viewport);await beginByHold(page);await chooseTarget(page);await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='false'&&document.querySelector('#pixelStudio')?.dataset.mode==='idle',null,{timeout:6000});const tracks=await page.evaluate(()=>window.__cameraTracks.map(track=>track.readyState));assert.ok(tracks.length&&tracks.every(state=>state==='ended'),`pagehide stops the active synthetic camera tracks: ${JSON.stringify(tracks)}`);checks++;await context.close();
}

try {
  const revision=sourceHashes;
  for(const viewport of viewports)await testViewport(viewport);
  await testPageHideCleanup();
  if(!process.env.PIXIEED_LIVE_REGION_SKIP_MEDIA){
    await testLicensedTemporalMedia(mediaById.street);
    await testLicensedTemporalMedia(mediaById.leaves);
  }
  assert.deepEqual(errors,[],'no browser page errors');
  await writeFile(`${out}/results.json`,JSON.stringify({checks,viewports,revision,media:process.env.PIXIEED_LIVE_REGION_SKIP_MEDIA?'skipped':mediaCatalog.map(({id,credit,license,licenseUrl,sourceUrl})=>({id,credit,license,licenseUrl,sourceUrl})),errors,scope:{syntheticCamera:true,userCameraInitialized:false,safariPhysicalDevicesProduction:'untested'}},null,2));
  console.log(`Live camera region merge: ${checks}/${checks} PASS; synthetic camera plus locally stored licensed temporal clips; user camera untouched; Safari, physical devices and production UNTESTED; screenshots: ${out}`);
} finally { await browser.close(); }
