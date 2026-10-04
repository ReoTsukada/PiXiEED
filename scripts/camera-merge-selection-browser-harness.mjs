#!/usr/bin/env node
/** Isolated synthetic-camera acceptance for source-aware merge selection and overlay UI. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4176';
const origin=new URL(base).origin;
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname),'only the local preview server is allowed');
const runtime=process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(runtime).href);
const out='/tmp/pixieed-camera-merge-selection-20261004';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const report={checks:[],errors:[],blockedRequests:[],blockedConsoleMessages:[],viewports:[],layoutDiagnostics:[],sourceHashes:{},scope:{camera:'isolated synthetic canvas stream; no physical camera',focus:'mock track only',Safari:'UNTESTED',AndroidDevice:'UNTESTED'}};
const sourceFiles=['pixel-camera.html','css/pixel-lens-camera.css','js/pixel-lens/app.mjs','js/pixel-lens/engine.mjs','js/pixel-lens/region-merge.mjs','js/pixel-lens/live-region-merge.mjs','js/pixel-lens/merge-selection.mjs','js/pixel-lens/focus.mjs','js/pixel-lens/zoom.mjs'];
for(const file of sourceFiles)try{report.sourceHashes[file]=createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex');}catch{report.sourceHashes[file]='pending';}
const checks=report.checks;
const pass=(name,evidence={})=>checks.push({name,pass:true,...evidence});
const allViewports=[{width:320,height:740,name:'320x740'},{width:390,height:844,name:'390x844'},{width:844,height:390,name:'844x390'},{width:1280,height:800,name:'1280x800'}];
const viewports=process.env.CAMERA_MERGE_VIEWPORTS?allViewports.filter(v=>process.env.CAMERA_MERGE_VIEWPORTS.split(',').includes(v.name)):allViewports;

async function openPage(viewport){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1,hasTouch:true,acceptDownloads:true});
  await context.addInitScript(()=>{
    window.__cameraRequestCount=0;window.__cameraTracks=[];window.__focusConstraintCalls=[];window.__lastRawFrame=null;window.__lastRenderedFrame=null;window.__cameraImageRef=null;window.__cameraTick=0;
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=320;const ctx=canvas.getContext('2d',{alpha:false});
    const image=ctx.createImageData(canvas.width,canvas.height);
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
      let rgb;
      if(y<178){const t=x/319;rgb=[Math.round(42+90*t),Math.round(67+57*t),Math.round(111+32*t)];}
      else if(x<108){const n=(x*7+y*11)%9;rgb=[94+n,78+Math.floor(n/2),67+Math.floor(n/3)];}
      else if(x<215){const n=(x*5+y*3)%13;rgb=[123+n,84+Math.floor(n/2),61+Math.floor(n/3)];}
      else{const n=(x*11+y*2)%7;rgb=[65+n,79+Math.floor(n/2),91+Math.floor(n/3)];}
      const i=(y*canvas.width+x)*4;image.data[i]=rgb[0];image.data[i+1]=rgb[1];image.data[i+2]=rgb[2];image.data[i+3]=255;
    }
    ctx.putImageData(image,0,0);
    const fixturePixels=new Uint8ClampedArray(image.data);
    window.__cameraSourceCanvas=canvas;
    window.__cameraFixtureOriginal=fixturePixels;
    window.__restoreCameraFixture=()=>{const frame=ctx.createImageData(canvas.width,canvas.height);frame.data.set(fixturePixels);ctx.putImageData(frame,0,0);};
    window.__occludeCameraSeed=(seed,viewWidth,viewHeight,fraction=.3)=>{
      const frame=ctx.createImageData(canvas.width,canvas.height);frame.data.set(fixturePixels);
      const w=Math.max(1,Math.round(canvas.width*fraction)),h=Math.max(1,Math.round(canvas.height*fraction));
      const cx=Math.max(0,Math.min(canvas.width-1,Math.floor((seed.x+.5)*canvas.width/viewWidth)));
      const cy=Math.max(0,Math.min(canvas.height-1,Math.floor((seed.y+.5)*canvas.height/viewHeight)));
      const x=Math.max(0,Math.min(canvas.width-w,cx-Math.floor(w/2))),y=Math.max(0,Math.min(canvas.height-h,cy-Math.floor(h/2)));
      for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++){const i=(py*canvas.width+px)*4;frame.data[i]=250;frame.data[i+1]=15;frame.data[i+2]=220;frame.data[i+3]=255;}
      ctx.putImageData(frame,0,0);return{x,y,width:w,height:h,changedFraction:w*h/(canvas.width*canvas.height)};
    };
    window.__shiftCameraFixture=(dx,dy)=>{
      const frame=ctx.createImageData(canvas.width,canvas.height);
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
        const sx=Math.max(0,Math.min(canvas.width-1,x-dx)),sy=Math.max(0,Math.min(canvas.height-1,y-dy));
        const from=(sy*canvas.width+sx)*4,to=(y*canvas.width+x)*4;
        frame.data[to]=fixturePixels[from];frame.data[to+1]=fixturePixels[from+1];frame.data[to+2]=fixturePixels[from+2];frame.data[to+3]=255;
      }
      ctx.putImageData(frame,0,0);
    };
    window.__shiftCameraFixtureForView=(dx,dy,viewWidth,viewHeight)=>window.__shiftCameraFixture(
      Math.round(dx*canvas.width/viewWidth),Math.round(dy*canvas.height/viewHeight)
    );
    const originalGet=CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData=function(...args){
      const result=originalGet.apply(this,args),view=document.querySelector('#view');
      if(view&&view.width>1&&!this.canvas.isConnected&&this.canvas.width===view.width&&this.canvas.height===view.height){
        window.__lastRawFrame={width:result.width,height:result.height,data:Array.from(result.data),tick:window.__cameraTick};
        window.__cameraImageRef=result.data;
      }
      return result;
    };
    const originalPut=CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData=function(frame,...args){
      if(this.canvas?.id==='view'){
        const rendered=Array.from(frame.data),unmerged=window.__cameraImageRef?Array.from(window.__cameraImageRef):null;
        window.__lastRenderedFrame={width:frame.width,height:frame.height,data:rendered,tick:window.__cameraTick};
        window.__framePair={width:frame.width,height:frame.height,raw:window.__lastRawFrame?.data??null,unmerged,rendered,tick:window.__cameraTick};window.__cameraImageRef=null;
      }
      return originalPut.call(this,frame,...args);
    };
    const stream=canvas.captureStream(30),track=stream.getVideoTracks()[0];window.__cameraTracks.push(track);
    navigator.mediaDevices.getSupportedConstraints=()=>({focusMode:true,pointsOfInterest:true});
    navigator.mediaDevices.getUserMedia=async()=>{window.__cameraRequestCount++;return stream;};
    navigator.mediaDevices.getSupportedConstraints=()=>({focusMode:true,pointsOfInterest:true});
    const rawApply=track.applyConstraints.bind(track);track.applyConstraints=async value=>{window.__focusConstraintCalls.push(structuredClone(value));return rawApply(value);};
    window.setInterval(()=>window.__cameraTick++,33);
  });
  await context.route('**/*',route=>{try{const requestUrl=new URL(route.request().url());if(requestUrl.origin===origin)return route.continue();report.blockedRequests.push({viewport:viewport.name,url:requestUrl.href});return route.abort();}catch{return route.abort();}});
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(`${viewport.name}: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error'){
    const location=m.location(),text=m.text();let locationOrigin='';try{locationOrigin=new URL(location.url).origin;}catch{}
    if(text==='Failed to load resource: net::ERR_FAILED'&&locationOrigin&&locationOrigin!==origin){report.blockedConsoleMessages.push({viewport:viewport.name,message:text,url:location.url});return;}
    report.errors.push({viewport:viewport.name,message:text,location});
  }});
  page.on('requestfailed',r=>{if(new URL(r.url()).origin===origin)report.errors.push(`${viewport.name}: request ${r.url()}: ${r.failure()?.errorText}`);});
  await page.goto(`${base}/pixel-camera.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#capture')?.dataset.action==='capture'&&!document.querySelector('#capture').disabled&&document.querySelector('#pixelStudio')?.dataset.ready==='true'&&document.querySelector('#view')?.width>1,null,{timeout:20000});
  await page.evaluate(()=>{const hint=document.querySelector('#gestureHint');if(hint)hint.hidden=true;});
  await waitFramePair(page);
  return{context,page};
}

async function waitFramePair(page){await page.waitForFunction(()=>{const p=window.__framePair;return p?.raw?.length&&p?.rendered?.length&&p.width===document.querySelector('#view')?.width&&p.height===document.querySelector('#view')?.height;},null,{timeout:8000});}
async function enableOrderedDither(page){
  await page.locator('#toolbar [data-tool="dither"]').click();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.settingsContext==='dither');
  const swatch=page.locator('#ditherKinds [data-value="net8"]');
  if(await swatch.count())await swatch.click();
  await page.locator('#toolbarContextBack').click();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.settingsContext==='');
  await page.waitForTimeout(650);
  await waitFramePair(page);
}
async function actualPalette(page){return page.evaluate(async()=>{
  const engine=await import('/js/pixel-lens/engine.mjs?v=20261002-camera-palette-startup-2');
  return engine.lensPalette().map(c=>[c[0],c[1],c[2]]);
});}
async function rawAwareSeeds(page){return page.evaluate(async()=>{
  const d=window.__framePair;if(!d?.raw||!d?.rendered)return null;
  const engine=await import('/js/pixel-lens/engine.mjs?v=20261002-camera-palette-startup-2');
  const selection=await import('/js/pixel-lens/merge-selection.mjs?qa=raw-aware');
  const palette=engine.lensPalette().map(c=>[c[0],c[1],c[2]]);
  const source={width:d.width,height:d.height,data:new Uint8Array(d.raw)},rendered={width:d.width,height:d.height,data:new Uint8Array(d.rendered)};
  const exactIndex=(data,i)=>palette.findIndex(rgb=>rgb[0]===data[i]&&rgb[1]===data[i+1]&&rgb[2]===data[i+2]);
  const found=[];
  for(let y=3;y<d.height-3;y+=1)for(let x=3;x<d.width-3;x+=1){
    const seed={x,y},picked=selection.pickMergeSource({source,rendered,palette,seed});if(!picked)continue;
    const i=(y*d.width+x)*4,phase=exactIndex(rendered.data,i);
    if(phase>=0&&phase!==picked.sourceIndex)found.push({seed,sourceIndex:picked.sourceIndex,renderedIndex:phase,raw:[...source.data.slice(i,i+4)],rendered:[...rendered.data.slice(i,i+4)]});
    if(found.length>=80)break;
  }
  const distinct=[];for(const candidate of found)if(!distinct.some(item=>item.sourceIndex===candidate.sourceIndex))distinct.push(candidate);
  return{width:d.width,height:d.height,palette,divergent:found.slice(0,80),seeds:distinct.slice(0,6),tick:d.tick};
});}
async function pointForSeed(page,seed){return page.locator('#view').evaluate((view,s)=>{const r=view.getBoundingClientRect();return{x:r.left+(s.x+.5)*r.width/view.width,y:r.top+(s.y+.5)*r.height/view.height,rect:{x:r.x,y:r.y,width:r.width,height:r.height}};},seed);}
async function longPress(page,point){await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(640);await page.mouse.up();}
async function waitMerge(page){await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='true'&&document.querySelector('#regionMergePanel')?.getClientRects().length>0,null,{timeout:6000});}
async function snapshot(page){return page.evaluate(()=>{
  const rect=n=>{if(!n)return null;const r=n.getBoundingClientRect();return{x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
  const root=document.querySelector('#pixelStudio'),view=document.querySelector('#view'),frame=document.querySelector('#captureFrame'),overlay=document.querySelector('#mergeSelectionOverlay');
  const ovctx=overlay?.getContext('2d'),overlayData=overlay&&overlay.width&&overlay.height?ovctx.getImageData(0,0,overlay.width,overlay.height).data:null;
  let maskPixels=0,minX=overlay?.width??0,minY=overlay?.height??0,maxX=-1,maxY=-1;
  if(overlayData)for(let i=3;i<overlayData.length;i+=4)if(overlayData[i]){const p=(i-3)/4,x=p%overlay.width,y=Math.floor(p/overlay.width);maskPixels++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  const buttons=[...document.querySelectorAll('#regionMergePanel button,#regionMergePalette [data-target-index],#toolbarContextMore,#toolbarContextBack')].filter(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return r.width>0&&r.height>0&&!n.hidden&&s.display!=='none'&&s.visibility!=='hidden';}).map(n=>{const r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,h=document.elementFromPoint(x,y);return{id:n.id||n.dataset.targetIndex||n.tagName,rank:n.dataset.rank??null,index:n.dataset.targetIndex??null,recommended:n.dataset.recommended==='true',width:r.width,height:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom,inside:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,centerHit:h===n||n.contains(h)};});
  const canvasPixels=()=>({width:view.width,height:view.height,data:[...view.getContext('2d').getImageData(0,0,view.width,view.height).data]});
  return{viewport:{width:innerWidth,height:innerHeight},root:{...root.dataset},frame:rect(frame),view:rect(view),viewPixels:canvasPixels(),toolbar:rect(document.querySelector('#toolbar')),panel:rect(document.querySelector('#regionMergePanel')),overlay:overlay?{hidden:overlay.hidden,rect:rect(overlay),width:overlay.width,height:overlay.height,pointerEvents:getComputedStyle(overlay).pointerEvents,maskPixels,maskBounds:maxX>=0?{minX,minY,maxX,maxY}:null,rgba:overlayData?[...overlayData]:null}:null,
    sourceChip:rect(document.querySelector('#regionMergeSourceChip'))?{index:document.querySelector('#regionMergeSourceChip').dataset.index,rgb:document.querySelector('#regionMergeSourceChip').dataset.rgb,label:document.querySelector('#regionMergeSourceLabel')?.textContent,visible:!document.querySelector('#regionMergeSourceChip').hidden,rect:rect(document.querySelector('#regionMergeSourceChip')),labelRect:rect(document.querySelector('#regionMergeSourceLabel'))}:null,
    targetChip:rect(document.querySelector('#regionMergeTargetChip'))?{index:document.querySelector('#regionMergeTargetChip').dataset.index,rgb:document.querySelector('#regionMergeTargetChip').dataset.rgb,label:document.querySelector('#regionMergeTargetLabel')?.textContent,visible:!document.querySelector('#regionMergeTargetChip').hidden,rect:rect(document.querySelector('#regionMergeTargetChip')),labelRect:rect(document.querySelector('#regionMergeTargetLabel'))}:null,
    buttons,swatches:[...document.querySelectorAll('#regionMergePalette [data-target-index]')].map(n=>({index:Number(n.dataset.targetIndex),rank:Number(n.dataset.rank),recommended:n.dataset.recommended==='true',pressed:n.getAttribute('aria-pressed'),title:n.title,hidden:n.hidden,rect:rect(n)})),more:{hidden:document.querySelector('#toolbarContextMore')?.hidden,text:document.querySelector('#toolbarContextMore')?.textContent,expanded:document.querySelector('#toolbarContextMore')?.getAttribute('aria-expanded')},paletteEpoch:Number(root.dataset.paletteEpoch||0),previewFrames:Number(root.dataset.previewFrames||0),cameraCalls:window.__cameraRequestCount,focusCalls:window.__focusConstraintCalls?.length||0};
});}
async function layoutDiagnostic(page,label){return page.evaluate(label=>{
  const names=['#stage','#captureFrame','#view','#toolbar','#toolbarContextHead','#regionMergePanel','#regionMergeSourceChip','#regionMergeSourceLabel','#regionMergeTargetChip','#regionMergeTargetLabel'];
  const nodes=Object.fromEntries(names.map(selector=>{const el=document.querySelector(selector);if(!el)return[selector,null];const r=el.getBoundingClientRect(),s=getComputedStyle(el);return[selector,{rect:{x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom},style:{display:s.display,position:s.position,width:s.width,height:s.height,boxSizing:s.boxSizing,transform:s.transform,translate:s.translate,overflowX:s.overflowX,overflowY:s.overflowY,gridTemplateColumns:s.gridTemplateColumns,paddingLeft:s.paddingLeft,paddingRight:s.paddingRight,marginLeft:s.marginLeft,marginRight:s.marginRight}}];}));
  const stage=document.querySelector('#stage'),root=document.querySelector('#pixelStudio'),frame=document.querySelector('#captureFrame');return{label,viewport:{width:innerWidth,height:innerHeight},scroll:{windowX:scrollX,windowY:scrollY,stageLeft:stage?.scrollLeft,stageTop:stage?.scrollTop},stageClient:{width:stage?.clientWidth,height:stage?.clientHeight,scrollWidth:stage?.scrollWidth,scrollHeight:stage?.scrollHeight},bottomUiHeight:document.querySelector('#toolbar')?.getBoundingClientRect().height,frameInline:{width:frame?.style.width,height:frame?.style.height,transform:frame?.style.transform,translate:frame?.style.translate},rootDataset:{regionMerge:root?.dataset.regionMerge,regionMergeStatus:root?.dataset.regionMergeStatus,settingsContext:root?.dataset.settingsContext},nodes};
},label);}
function assertControls(state,label){
  assert.ok(state.panel&&state.panel.x>=-1&&state.panel.y>=-1&&state.panel.right<=state.viewport.width+1&&state.panel.bottom<=state.viewport.height+1,`${label}: panel is visible in viewport`);
  const onScreen=state.buttons.filter(button=>button.inside);
  for(const button of onScreen){assert.ok(button.width>=43&&button.height>=43,`${label}: ${button.id} has a usable touch target ${button.width}×${button.height}`);assert.ok(button.centerHit,`${label}: ${button.id} center hits itself`);}
  for(let i=0;i<onScreen.length;i++)for(let j=i+1;j<onScreen.length;j++){
    const a=onScreen[i],b=onScreen[j],overlapX=Math.min(a.right,b.right)-Math.max(a.x,b.x),overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
    assert.ok(overlapX<=.5||overlapY<=.5,`${label}: visible controls ${a.id}/${b.id} overlap`);
  }
}
function assertSameBox(a,b,label){for(const key of ['x','y','width','height'])assert.ok(Math.abs(a[key]-b[key])<=.5,`${label}: ${key} shifted ${a[key]}→${b[key]}`);}
async function expectedRanking(page,state){return page.evaluate(async({width,height,sourceIndex,seed,mode,strength})=>{
  const engine=await import('/js/pixel-lens/engine.mjs?v=20261002-camera-palette-startup-2');
  const ranking=await import('/js/pixel-lens/merge-selection.mjs?qa=rank-actual');
  const trackerModule=await import('/js/pixel-lens/live-region-merge.mjs?rev=20261003-live-merge-1');
  const pair=window.__framePair;if(!pair?.raw||!pair?.rendered)throw new Error('missing source/rendered browser frame pair');
  const palette=engine.lensPalette().map(c=>[c[0],c[1],c[2]]);
  const source={width,height,data:new Uint8Array(pair.raw)},rendered={width,height,data:new Uint8Array(pair.rendered)};
  const tracker=trackerModule.createLiveRegionMergeTracker({source,rendered,palette,seed,sourceIndex,mode,strength});
  const initial=tracker.update({source,rendered,palette,targetColor:null,mode,strength,enabled:false});
  if(initial.status!=='tracking'||!initial.mask)throw new Error(`fixture tracker did not select source region: ${initial.status}`);
  const mask=initial.mask;
  const result=ranking.rankMergeTargets({rendered,palette,mask,sourceIndex});
  const overlay=document.querySelector('#mergeSelectionOverlay'),image=overlay.getContext('2d').getImageData(0,0,width,height);
  let overlayPixels=0;for(let i=3;i<image.data.length;i+=4)if(image.data[i])overlayPixels++;
  return{palette,result,maskPixels:mask.reduce((a,b)=>a+b,0),overlayPixels,trackerStatus:initial.status};
},{width:state.viewPixels.width,height:state.viewPixels.height,sourceIndex:Number(state.root.regionMergeSourceIndex),seed:{x:Number(state.root.regionMergeSeedX),y:Number(state.root.regionMergeSeedY)},mode:await page.locator('#regionMergeMode').inputValue(),strength:Number(await page.locator('#regionMergeStrength').inputValue())});}
async function motionEvidence(page,rawBefore){return page.evaluate(async(before)=>{
  const pair=window.__framePair,root=document.querySelector('#pixelStudio'),view=document.querySelector('#view');
  if(!pair?.raw||!pair?.unmerged||!pair?.rendered||pair.width!==view.width||pair.height!==view.height)throw new Error('incomplete same-frame motion buffers');
  const width=pair.width,height=pair.height,current=pair.raw;let best={dx:0,dy:0,mae:Infinity},rawChangedPixels=0;
  for(let p=0;p<width*height;p++){const off=p*4;if(before[off]!==current[off]||before[off+1]!==current[off+1]||before[off+2]!==current[off+2])rawChangedPixels++;}
  // The fixture applies a known horizontal-only source translation; constrain dy=0 to avoid false vertical matches in its low-texture sky.
  for(let dx=-8;dx<=8;dx++){
    let error=0,count=0;
    for(let y=8;y<height-8;y+=2)for(let x=8;x<width-8;x+=2){const ax=(y*width+x)*4,bx=(y*width+x+dx)*4;error+=Math.abs(before[ax]-current[bx])+Math.abs(before[ax+1]-current[bx+1])+Math.abs(before[ax+2]-current[bx+2]);count+=3;}
    const mae=error/Math.max(1,count);if(mae<best.mae)best={dx,dy:0,mae};
  }
  const engine=await import('/js/pixel-lens/engine.mjs?v=20261002-camera-palette-startup-2'),merge=await import('/js/pixel-lens/region-merge.mjs?qa=protected-motion');
  const palette=engine.lensPalette().map(c=>[c[0],c[1],c[2]]),sourceIndex=Number(root.dataset.regionMergeCurrentSourceIndex),targetIndex=Number(root.dataset.regionMergeCurrentTargetIndex),seed={x:Number(root.dataset.regionMergeSeedX),y:Number(root.dataset.regionMergeSeedY)};
  const source={width,height,data:new Uint8Array(pair.raw)},rendered={width,height,data:new Uint8Array(pair.unmerged)};
  const predicted=merge.mergeRegionColors({source,rendered,palette,seed,sourceIndex,targetIndex,mode:document.querySelector('#regionMergeMode').value,strength:Number(document.querySelector('#regionMergeStrength').value)});
  const actual=view.getContext('2d').getImageData(0,0,width,height).data,base=pair.unmerged;let outside=0,mismatches=0,remote=null;
  for(let p=0;p<width*height;p++){
    if(predicted.mask[p])continue;outside++;
    const off=p*4;if(actual[off]!==base[off]||actual[off+1]!==base[off+1]||actual[off+2]!==base[off+2]||actual[off+3]!==base[off+3])mismatches++;
    if(!remote&&Math.hypot(p%width-seed.x,Math.floor(p/width)-seed.y)>Math.min(width,height)*.3){const pix=[source.data[off],source.data[off+1],source.data[off+2]];if(pix.some((v,i)=>Math.abs(v-palette[sourceIndex][i])>12))remote={x:p%width,y:Math.floor(p/width),source:[...source.data.slice(off,off+4)],display:[...actual.slice(off,off+4)],unmerged:[...base.slice(off,off+4)]};}
  }
  return{sourceTranslation:{...best,rawChangedPixels},trackerSeed:{x:seed.x,y:seed.y},targetIndex,sourceIndex,protectedOutside:{pixels:outside,mismatches,remoteSample:remote}};
},rawBefore);}

try{
  for(const viewport of viewports){
    const {context,page}=await openPage(viewport);
    try{
      if(viewport.width===390)await enableOrderedDither(page);
      let seedCandidates=await rawAwareSeeds(page);
      assert.ok(seedCandidates?.seeds?.length,`${viewport.name}: controlled source contains a raw-aware selection candidate`);
      const first=seedCandidates.seeds[0],second=seedCandidates.seeds.find(s=>s.sourceIndex!==first.sourceIndex);
      assert.ok(second,`${viewport.name}: fixture exposes two distinct source regions`);
      const before=await page.evaluate(()=>({frame:document.querySelector('#captureFrame').getBoundingClientRect().toJSON(),view:document.querySelector('#view').getBoundingClientRect().toJSON(),cameraCalls:window.__cameraRequestCount,epoch:Number(document.querySelector('#pixelStudio').dataset.paletteEpoch||0),frames:Number(document.querySelector('#pixelStudio').dataset.previewFrames||0)}));
      const point=await pointForSeed(page,first.seed);await longPress(page,point);await waitMerge(page);
      await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mergeMaskVisible==='true',null,{timeout:5000});
      const opened=await snapshot(page);
      assert.equal(Number(opened.root.regionMergeSourceIndex),first.sourceIndex,`${viewport.name}: long-hold picks raw-aware source index for a dither-phase pixel`);
      assert.equal(Number(opened.sourceChip.index),first.sourceIndex,`${viewport.name}: current source chip uses the original palette ID`);
      assert.ok(opened.sourceChip.visible&&opened.sourceChip.label.trim(),`${viewport.name}: source color chip and label are visible`);
      assert.equal(opened.sourceChip.rgb,seedCandidates.palette[first.sourceIndex].join(','),`${viewport.name}: source chip RGB maps to its original palette entry`);
      assert.ok(opened.overlay&&!opened.overlay.hidden&&opened.overlay.maskPixels>0,`${viewport.name}: source mask overlay contains selected pixels`);
      assert.equal(opened.overlay.pointerEvents,'none',`${viewport.name}: overlay does not intercept view gestures`);
      assert.deepEqual([opened.overlay.width,opened.overlay.height],[opened.viewPixels.width,opened.viewPixels.height],`${viewport.name}: overlay has exact image-cell dimensions`);
      assertControls(opened,viewport.name);
      const rank=await expectedRanking(page,opened);
      assert.equal(rank.maskPixels,Number(opened.root.regionMergeSelectedPixels),`${viewport.name}: tracker selected-pixel count matches the browser session`);
      assert.ok(rank.overlayPixels>0&&rank.overlayPixels===opened.overlay.maskPixels,`${viewport.name}: visible overlay has real boundary pixels for selected region`);
      const visible=opened.swatches.filter(s=>!s.hidden).sort((a,b)=>a.rank-b.rank);
      assert.ok(visible.length>0,`${viewport.name}: at least one ranked target is visible`);
      assert.deepEqual(visible.map(s=>s.index),rank.result.slice(0,visible.length).map(s=>s.index),`${viewport.name}: visible suggestions follow real deterministic mask ranking`);
      for(const rec of rank.result){const dom=opened.swatches.find(s=>s.index===rec.index);if(dom){assert.equal(dom.rank,rank.result.indexOf(rec),`${viewport.name}: swatch keeps its rank while preserving original index`);assert.equal(dom.recommended,rec.recommended,`${viewport.name}: recommendation badge matches ranking`);}}
      const recommended=rank.result.find(item=>item.recommended);assert.ok(recommended,`${viewport.name}: a non-source ranked target is recommended`);
      const actualButton=page.locator(`#regionMergePalette [data-target-index="${recommended.index}"]`);
      assert.match(await actualButton.getAttribute('title')||'候補',/候補/,'recommended target has a visible/accessible recommendation label');
      assert.equal(await actualButton.count(),1,`${viewport.name}: recommended original-index target exists`);
      const showMore=page.locator('#toolbarContextMore');
      if(await showMore.isVisible()){
        await showMore.click();
        await page.waitForFunction(n=>[...document.querySelectorAll('#regionMergePalette [data-target-index]')].filter(b=>!b.hidden).length===n,rank.palette.length,{timeout:4000});
      }
      const expanded=await snapshot(page);
      assert.deepEqual(expanded.swatches.filter(s=>!s.hidden).map(s=>s.index).sort((a,b)=>a-b),rank.palette.map((_,i)=>i),`${viewport.name}: expanded targets contain every original palette ID exactly once`);
      const layoutBeforeTarget=await layoutDiagnostic(page,'before-target');
      await page.screenshot({path:`${out}/diagnostic-before-target-${viewport.name}.png`,fullPage:true});
      const frameBeforeTarget=opened.frame;
      await page.locator(`#regionMergePalette [data-target-index="${recommended.index}"]`).click();
      await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mergeMaskVisible==='false'&&document.querySelector('#regionMergeTargetChip')?.hidden===false,null,{timeout:5000});
      const targeted=await snapshot(page);
      const layoutAfterTarget=await layoutDiagnostic(page,'after-target');
      report.layoutDiagnostics.push({viewport:viewport.name,before:layoutBeforeTarget,after:layoutAfterTarget});
      await page.screenshot({path:`${out}/diagnostic-after-target-${viewport.name}.png`,fullPage:true});
      assert.equal(targeted.targetChip.index,String(recommended.index),`${viewport.name}: target chip reflects chosen original palette ID`);
      assert.equal(targeted.overlay.maskPixels,0,`${viewport.name}: applying target hides selection mask`);
      assert.equal(targeted.overlay.hidden,true,`${viewport.name}: target application hides the separate overlay canvas`);
      assertSameBox(frameBeforeTarget,targeted.frame,`${viewport.name}: target chips/mask cause no preview layout shift`);
      assertSameBox(opened.view,targeted.view,`${viewport.name}: target chips/mask do not move the preview`);
      assertSameBox(opened.panel,targeted.panel,`${viewport.name}: source/target label changes do not move the controls`);
      await page.locator('#regionMergeUndo').click();
      await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mergeMaskVisible==='true'&&document.querySelector('#regionMergeUndo')?.disabled===true,null,{timeout:5000});
      const undone=await snapshot(page);
      assert.ok(undone.overlay.maskPixels>0,`${viewport.name}: undo restores source mask overlay`);
      assertSameBox(frameBeforeTarget,undone.frame,`${viewport.name}: undo/labels cause no preview layout shift`);
      assertSameBox(opened.view,undone.view,`${viewport.name}: undo does not move the preview`);
      assertSameBox(opened.panel,undone.panel,`${viewport.name}: undo does not move the controls`);
      assert.equal(undone.cameraCalls,before.cameraCalls,`${viewport.name}: merge selection does not restart the camera`);
      assert.ok(undone.previewFrames>before.frames,`${viewport.name}: camera preview remains live`);
      pass(`${viewport.name} overlay, original-index suggestions, recommendation, target/undo, and geometry`,{rawAware:{seed:first.seed,raw:first.raw,rendered:first.rendered,renderedPhase:first.renderedIndex,sourceIndex:first.sourceIndex},recommendation:recommended,sourceChip:opened.sourceChip,targetChip:targeted.targetChip,overlay:{boundaryPixels:opened.overlay.maskPixels,selectedPixels:rank.maskPixels,bounds:opened.overlay.maskBounds,pointerEvents:opened.overlay.pointerEvents},cameraCalls:undone.cameraCalls,previewFrames:[before.frames,undone.previewFrames]});
      await page.screenshot({path:`${out}/merge-overlay-${viewport.name}.png`,fullPage:true});

      if(viewport.width===390){
        await page.locator(`#regionMergePalette [data-target-index="${recommended.index}"]`).click();
        await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMergeTargetIndex!=='');
        const reselectEpoch=Number((await snapshot(page)).paletteEpoch),callsBefore=await page.evaluate(()=>window.__cameraRequestCount);
        const nextPoint=await pointForSeed(page,second.seed);await longPress(page,nextPoint);await waitMerge(page);
        await page.waitForFunction(i=>Number(document.querySelector('#pixelStudio')?.dataset.regionMergeSourceIndex)===i&&document.querySelector('#pixelStudio')?.dataset.regionMergeTargetIndex==='',second.sourceIndex,{timeout:6000});
        const reselected=await snapshot(page);
        assert.equal(reselected.root.regionMerge,'true','reselect keeps the same live merge session');
        assert.equal(reselected.cameraCalls,callsBefore,'reselect does not restart camera');
        assert.equal(reselected.paletteEpoch,reselectEpoch,'long-hold reselect does not fall through to tap palette refresh');
        assert.equal(reselected.focusCalls,0,'long-hold reselect does not request autofocus');
        assert.ok(reselected.previewFrames>undone.previewFrames,'preview continues while reselecting');
        assert.ok(reselected.overlay.maskPixels>0,'reselect updates/restores the overlay for new source region');
        await page.screenshot({path:`${out}/merge-reselect-390.png`,fullPage:true});
        pass('390x844 active long-hold reselect changes source, clears target, and keeps camera/preview live',{from:first.sourceIndex,to:second.sourceIndex,cameraCalls:reselected.cameraCalls,paletteEpoch:reselected.paletteEpoch,previewFrames:reselected.previewFrames});

        const currentRank=await expectedRanking(page,reselected),currentSuggestion=currentRank.result.find(x=>x.recommended);
        assert.ok(currentSuggestion, 'reselected region has a recommended target');
        await page.locator(`#regionMergePalette [data-target-index="${currentSuggestion.index}"]`).click();
        await page.waitForFunction(i=>document.querySelector('#pixelStudio')?.dataset.regionMergeTargetIndex===String(i),currentSuggestion.index,{timeout:5000});
        const beforeOcclusion=await snapshot(page),trackedSeed={x:Number(beforeOcclusion.root.regionMergeSeedX),y:Number(beforeOcclusion.root.regionMergeSeedY)};
        const occlusion=await page.evaluate(({seed,w,h})=>window.__occludeCameraSeed(seed,w,h,.3),{seed:trackedSeed,w:beforeOcclusion.viewPixels.width,h:beforeOcclusion.viewPixels.height});
        assert.ok(occlusion.changedFraction<.15,'transient occlusion leaves at least 85% of the synthetic camera frame unchanged');
        await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMergeStatus==='paused',null,{timeout:5000});
        const paused=await page.evaluate(()=>{
          const root=document.querySelector('#pixelStudio'),view=document.querySelector('#view'),actual=view.getContext('2d').getImageData(0,0,view.width,view.height).data,expected=window.__framePair?.unmerged;
          const result={status:root.dataset.regionMergeStatus,active:root.dataset.regionMerge,targetIndex:root.dataset.regionMergeTargetIndex,maskVisible:root.dataset.mergeMaskVisible,changed:Number(root.dataset.regionMergeChangedPixels),selected:Number(root.dataset.regionMergeSelectedPixels),previewFrames:Number(root.dataset.previewFrames),rawPauseVisible:Boolean(expected&&actual.length===expected.length&&actual.every((value,index)=>value===expected[index])),targetChip:{index:document.querySelector('#regionMergeTargetChip')?.dataset.index,rgb:document.querySelector('#regionMergeTargetChip')?.dataset.rgb,label:document.querySelector('#regionMergeTargetLabel')?.textContent}};
          const strength=document.querySelector('#regionMergeStrength'),original=strength.value,nearby=String(Math.min(Number(strength.max),Number(original)+1));
          strength.value=nearby;strength.dispatchEvent(new Event('input',{bubbles:true}));strength.dispatchEvent(new Event('change',{bubbles:true}));
          strength.value=original;strength.dispatchEvent(new Event('input',{bubbles:true}));strength.dispatchEvent(new Event('change',{bubbles:true}));
          result.statusAfterSameFrameControls=root.dataset.regionMergeStatus;result.targetAfterSameFrameControls=root.dataset.regionMergeTargetIndex;
          window.__restoreCameraFixture();
          return result;
        });
        assert.equal(paused.active,'true','temporary tracking loss keeps the merge session open');
        assert.equal(paused.status,'paused','first transient tracking failure enters the bounded pause');
        assert.equal(paused.targetIndex,String(currentSuggestion.index),'pause retains the chosen target');
        assert.equal(paused.changed,0,'paused display has no stale merged pixels');
        assert.equal(paused.selected,0,'paused session reports an empty current mask');
        assert.equal(paused.maskVisible,'false','pause hides the selection overlay');
        assert.ok(paused.rawPauseVisible,'paused canvas equals the independent unmerged engine output');
        assert.equal(paused.statusAfterSameFrameControls,'paused','controls cannot consume retries on a duplicate paused frame');
        assert.equal(paused.targetAfterSameFrameControls,String(currentSuggestion.index),'same-frame controls preserve target');
        assert.equal(paused.targetChip.index,String(currentSuggestion.index),'paused target chip retains its original selected index');
        assert.ok(paused.targetChip.rgb&&paused.targetChip.label,'paused target chip retains selected color feedback');
        await page.waitForFunction((previous)=>{
          const root=document.querySelector('#pixelStudio');
          return root?.dataset.regionMerge==='true'&&root.dataset.regionMergeStatus==='tracking'&&Number(root.dataset.previewFrames)>previous;
        },paused.previewFrames,{timeout:5000});
        const recovered=await snapshot(page);
        assert.equal(recovered.root.regionMergeTargetIndex,String(currentSuggestion.index),'recovery retains the selected target');
        assert.ok(Number(recovered.root.regionMergeChangedPixels)>0,'recovery reapplies the selected merge to fresh frames');
        assert.equal(recovered.overlay.maskPixels,0,'targeted recovery keeps the overlay hidden');
        pass('390x844 brief local occlusion pauses on raw pixels and resumes with target retained',{occlusion,seed:trackedSeed,paused,recovered:{status:recovered.root.regionMergeStatus,frame:recovered.previewFrames,target:recovered.root.regionMergeTargetIndex,changed:Number(recovered.root.regionMergeChangedPixels)}});

        const beforeJitter=await snapshot(page),seedXBefore=Number(beforeJitter.root.regionMergeSeedX),sourceBefore=await page.evaluate(()=>({raw:Array.from(window.__framePair.raw),tick:window.__framePair.tick,frames:Number(document.querySelector('#pixelStudio').dataset.previewFrames)}));
        await page.evaluate(({dx,dy,w,h})=>window.__shiftCameraFixtureForView(dx,dy,w,h),{dx:6,dy:0,w:beforeJitter.viewPixels.width,h:beforeJitter.viewPixels.height});
        await page.waitForFunction(({tick,frames})=>{
          const root=document.querySelector('#pixelStudio');
          return root?.dataset.regionMerge==='true'&&root.dataset.regionMergeStatus==='tracking'&&Number(root.dataset.previewFrames)>frames&&window.__framePair?.tick>tick;
        },sourceBefore,{timeout:4000});
        const jittered=await snapshot(page),seedDelta=Number(jittered.root.regionMergeSeedX)-seedXBefore;
        const jitterEvidence=await motionEvidence(page,sourceBefore.raw);
        assert.ok(jitterEvidence.sourceTranslation.rawChangedPixels>0&&jitterEvidence.sourceTranslation.dx>0&&jitterEvidence.sourceTranslation.dx<=8,`native raw source frame shows a bounded rightward translation with changed pixels: ${JSON.stringify(jitterEvidence.sourceTranslation)}`);
        assert.ok(seedDelta>0&&seedDelta<=8,`tracker seed follows the rightward camera movement within search bound; observed delta ${seedDelta}`);
        assert.equal(jitterEvidence.protectedOutside.mismatches,0,'pixels outside the selected mask remain identical to the same-frame unmerged camera image');
        assert.equal(jittered.root.regionMergeTargetIndex,String(currentSuggestion.index),'small camera jitter retains the chosen target');
        assert.equal(jittered.root.regionMerge,'true','small camera jitter does not end merge mode');
        await page.evaluate(()=>window.__restoreCameraFixture());
        await page.waitForFunction((x)=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='true'&&Math.abs(Number(document.querySelector('#pixelStudio').dataset.regionMergeSeedX)-x)<=1,seedXBefore,{timeout:4000});
        pass('390x844 small camera translation tracks seed and returns without losing merge',{seedBefore:seedXBefore,seedAfter:jittered.root.regionMergeSeedX,seedDelta,sourceTranslation:jitterEvidence.sourceTranslation,target:jittered.root.regionMergeTargetIndex,protectedOutside:jitterEvidence.protectedOutside});

        const ditherSeeds=seedCandidates.divergent.length>0?seedCandidates:null;
        assert.ok(ditherSeeds,`390x844 fixture exposes actual dither phase mismatch`);
        // Close and reopen on the first dither-phase seed so capture exercises the real overlay path.
        await page.locator('#regionMergeCancel').click();await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='false');
        const capPoint=await pointForSeed(page,first.seed);await longPress(page,capPoint);await waitMerge(page);
        await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mergeMaskVisible==='true');
        const capRank=await expectedRanking(page,await snapshot(page)),capTarget=capRank.result.find(x=>x.recommended);
        await page.locator(`#regionMergePalette [data-target-index="${capTarget.index}"]`).click();
        await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mergeMaskVisible==='false');
        const beforeCapture=await page.locator('#view').evaluate(c=>({width:c.width,height:c.height,data:[...c.getContext('2d').getImageData(0,0,c.width,c.height).data]}));
        await page.locator('#capture').click();
        await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='captured'&&document.querySelector('#savePng')?.href.startsWith('blob:'),null,{timeout:15000});
        const png=await page.evaluate(async()=>{
          const link=document.querySelector('#savePng'),bitmap=await createImageBitmap(await (await fetch(link.href)).blob()),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);const img=ctx.getImageData(0,0,c.width,c.height);const view=document.querySelector('#view');return{width:c.width,height:c.height,scale:c.width/view.width,rgba:Array.from(img.data),viewWidth:view.width,viewHeight:view.height,overlayHidden:document.querySelector('#mergeSelectionOverlay').hidden,regionMerge:document.querySelector('#pixelStudio').dataset.regionMerge};
        });
        assert.equal(png.overlayHidden,true,'captured view closes/hides the separate selection overlay');
        assert.equal(png.regionMerge,'false','capture ends live merge session');
        assert.equal(png.width,beforeCapture.width*png.scale,'captured PNG uses integer scale');
        for(let y=0;y<beforeCapture.height;y++)for(let x=0;x<beforeCapture.width;x++){
          const src=(y*beforeCapture.width+x)*4,dst=(y*png.scale*png.width+x*png.scale)*4;
          assert.deepEqual(png.rgba.slice(dst,dst+4),beforeCapture.data.slice(src,src+4),`PNG excludes DOM overlay at source cell ${x},${y}`);
        }
        await page.screenshot({path:`${out}/capture-no-overlay-390.png`,fullPage:true});
        pass('390x844 downloaded PNG preserves the merged pixel frame without the DOM-only selection overlay',{png:{width:png.width,height:png.height,scale:png.scale},sourceCells:beforeCapture.width*beforeCapture.height});
      }
    }catch(error){
      await page.screenshot({path:`${out}/failure-${viewport.name}.png`,fullPage:true}).catch(()=>{});
      await writeFile(`${out}/failure-${viewport.name}.json`,JSON.stringify({error:String(error),stack:error?.stack,report,state:await snapshot(page).catch(()=>null),rawAware:await rawAwareSeeds(page).catch(()=>null)},null,2));
      throw error;
    }finally{await context.close();}
  }
  assert.deepEqual(report.errors,[],'no browser, console, or local request errors');
  await writeFile(`${out}/result.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks:checks.length,viewports:report.viewports.map(v=>v.name),sourceHashes:report.sourceHashes,errors:report.errors,artifacts:out},null,2));
}catch(error){report.error=error.stack||String(error);await writeFile(`${out}/failure.json`,JSON.stringify(report,null,2));throw error;}finally{await browser.close();}
