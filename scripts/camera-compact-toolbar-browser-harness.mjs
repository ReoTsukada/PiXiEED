#!/usr/bin/env node
/** Synthetic-camera acceptance for the compact, always-visible camera toolbar. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only local camera server is allowed');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const labelPhase = process.env.PIXIEED_CAMERA_LABEL_PHASE || 'final';
const outRoot = '/tmp/pixieed-camera-label-stability';
const out = ['source-before','source-after'].includes(labelPhase) ? `${outRoot}/${labelPhase}` : outRoot;
const labelOut = out;
await mkdir(outRoot, { recursive: true });
await mkdir(labelOut, { recursive: true });
const errors = [];
let checks = 0;
const polishMeasurements = [];
const labelStability = [];
const loadedCssHashes = {};
const sourceHashes = {};
for(const file of ['pixel-camera.html','css/pixel-lens-camera.css','js/pixel-lens/app.mjs','js/pixel-lens/engine.mjs','js/pixel-lens/region-merge.mjs','js/pixel-lens/live-region-merge.mjs','scripts/camera-compact-toolbar-browser-harness.mjs'])sourceHashes[file]=createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex');
if(labelPhase==='source-before') {
  const baselineCSS=await readFile(`${outRoot}/pixel-lens-camera-head-18604317.css`);
  sourceHashes['css/pixel-lens-camera.css@HEAD-18604317']=createHash('sha256').update(baselineCSS).digest('hex');
}
const viewports = [{width:1280,height:800},{width:390,height:844},{width:320,height:568},{width:844,height:390}]
  .filter(({width}) => !process.env.PIXIEED_CAMERA_COMPACT_VIEWPORT || width === Number(process.env.PIXIEED_CAMERA_COMPACT_VIEWPORT));
const tools = ['look','dither','pixels','aspect','tone','zoom'];
const optionGroups = {
  look: '#looks [data-look]', dither: '#ditherKinds [data-value]', pixels: '#pixelsPanel [data-value]',
  aspect: '#aspectPanel [data-value]', tone: '#toneChips [data-value]', zoom: '#zoomStops [data-zoom]'
};
const optionRows = { look:'#looks', dither:'#ditherKinds', pixels:'#pixelsPanel', aspect:'#aspectPanel', tone:'#toneChips', zoom:'#zoomStops' };

async function previewLabelGeometry(page) {
  return page.evaluate(() => {
    const rect=selector=>{const node=document.querySelector(selector);if(!node)return null;const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
    const visible=selector=>{const node=document.querySelector(selector);return !!node&&!node.hidden&&node.getClientRects().length>0&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden';};
    const root=document.querySelector('#pixelStudio'),bottom=document.querySelector('.lc-bottom'),feedback=document.querySelector('.lc-feedback'),message=document.querySelector('#stageMsg'),frame=document.querySelector('#captureFrame'),canvas=document.querySelector('#view');
    const frameRect=rect('#captureFrame');
    const feedbackStyle=feedback?getComputedStyle(feedback):null,toastStyle=message?getComputedStyle(message):null;
    return {context:root?.dataset.settingsContext,mode:root?.dataset.mode,rootFontSize:getComputedStyle(document.documentElement).fontSize,canvas:{width:canvas?.width,height:canvas?.height},frame:frameRect,frameCenter:frameRect?{x:frameRect.x+frameRect.width/2,y:frameRect.y+frameRect.height/2}:null,frameStyle:frame?{width:frame.style.width,height:frame.style.height}:null,contextSpace:root?.style.getPropertyValue('--lc-context-space'),bottom:{rect:rect('.lc-bottom'),offsetHeight:bottom?.offsetHeight,scrollHeight:bottom?.scrollHeight},feedback:{rect:rect('.lc-feedback'),offsetHeight:feedback?.offsetHeight,transform:feedbackStyle?.transform,width:feedbackStyle?.width,minWidth:feedbackStyle?.minWidth,maxWidth:feedbackStyle?.maxWidth,position:feedbackStyle?.position},toast:{visible:visible('#stageMsg'),text:message?.textContent.trim()||'',hidden:message?.hidden,className:message?.className,rect:visible('#stageMsg')?rect('#stageMsg'):null,width:toastStyle?.width,minWidth:toastStyle?.minWidth,maxWidth:toastStyle?.maxWidth,scrollWidth:message?.scrollWidth,clientWidth:message?.clientWidth},toolbar:rect('#toolbar'),panel:rect('#cameraSettingsPanel'),lookRow:rect('#looks'),paletteStrip:{reserved:document.querySelector('#paletteStrip')?.dataset.reserved,visible:visible('#paletteStrip'),rect:visible('#paletteStrip')?rect('#paletteStrip'):null},paletteSlider:{visible:visible('.lc-color-slider'),rect:visible('.lc-color-slider')?rect('.lc-color-slider'):null},toneSlider:{visible:visible('#toneSlider'),rect:visible('#toneSlider')?rect('#toneSlider'):null},mergePanel:{visible:visible('#regionMergePanel'),rect:visible('#regionMergePanel')?rect('#regionMergePanel'):null},nav:rect('.app-tabs[data-nav="five"]')};
  });
}

async function measureNaturalLookToast(page, viewport) {
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.settingsContext==='look'&&document.querySelector('#stageMsg')?.hidden===true);
  await page.waitForTimeout(300);
  const before=await previewLabelGeometry(page);
  await writeFile(`${labelOut}/label-before-look-${viewport.width}.json`,JSON.stringify({phase:labelPhase,viewport,geometry:before},null,2));
  await page.screenshot({path:`${labelOut}/label-before-look-${viewport.width}.png`});
  const choice=page.locator('#looks [data-look="c16"]');
  await choice.scrollIntoViewIfNeeded(); await choice.click();
  await page.waitForFunction(()=>{const n=document.querySelector('#stageMsg');return n&&!n.hidden&&n.textContent.trim()==='16色';},null,{timeout:4000});
  await page.waitForTimeout(100);
  await page.screenshot({path:`${labelOut}/label-during-look-${viewport.width}.png`});
  const timeline=[]; const started=Date.now();
  while(Date.now()-started<3300){timeline.push({elapsedMs:Date.now()-started,...await previewLabelGeometry(page)});await page.waitForTimeout(100);}
  await page.waitForFunction(()=>document.querySelector('#stageMsg')?.hidden===true,null,{timeout:1500});
  await page.waitForTimeout(300);
  const after=await previewLabelGeometry(page);
  await page.screenshot({path:`${labelOut}/label-after-look-${viewport.width}.png`});
  const visible=timeline.filter(sample=>sample.toast.visible),movement=samples=>({maxWidthDelta:Math.max(...samples.map(x=>Math.abs(x.frame.width-before.frame.width)),0),maxHeightDelta:Math.max(...samples.map(x=>Math.abs(x.frame.height-before.frame.height)),0),maxCenterXDelta:Math.max(...samples.map(x=>Math.abs(x.frameCenter.x-before.frameCenter.x)),0),maxCenterYDelta:Math.max(...samples.map(x=>Math.abs(x.frameCenter.y-before.frameCenter.y)),0)});
  const report={viewport,sourceLook:'c16',toastText:'16色',toastDurationMs:visible.length?visible.at(-1).elapsedMs-visible[0].elapsedMs:0,sameSettingsContext:timeline.every(x=>x.context==='look')&&after.context==='look',sameCanvasDimensions:timeline.every(x=>x.canvas.width===before.canvas.width&&x.canvas.height===before.canvas.height)&&after.canvas.width===before.canvas.width&&after.canvas.height===before.canvas.height,before,visibleSamples:visible,allSamples:timeline,after,duringMovement:movement(visible),afterMovement:movement([after]),naturalToastDisappeared:!after.toast.visible};
  await writeFile(`${labelOut}/label-toast-look-result-${viewport.width}.json`,JSON.stringify(report,null,2));
  return report;
}

async function measureInjectedLabel(page, viewport, name, text) {
  const before=await previewLabelGeometry(page),contextBefore=before.context,modeBefore=before.mode;
  await page.evaluate(message=>{const node=document.querySelector('#stageMsg');node.textContent=message;node.hidden=false;node.classList.remove('pc-sr-only');node.classList.toggle('is-policy-notice',message.length>72);},text);
  await page.waitForTimeout(300);
  const during=await previewLabelGeometry(page);
  await page.screenshot({path:`${labelOut}/injected-${name}-${viewport.width}.png`});
  const overlap=await page.evaluate(()=>{
    const node=document.querySelector('#stageMsg'),r=node.getBoundingClientRect(),frame=document.querySelector('#captureFrame').getBoundingClientRect(),nav=document.querySelector('.app-tabs[data-nav="five"]').getBoundingClientRect();
    const overlaps=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
    const selectors=['#toolbar','#paletteStrip','.lc-color-slider','#toneSlider','#regionMergePanel','.app-tabs[data-nav="five"]'];
    const interactiveOverlaps=selectors.flatMap(selector=>{const target=document.querySelector(selector);if(!target||getComputedStyle(target).display==='none'||getComputedStyle(target).visibility==='hidden'||target.hidden)return[];const q=target.getBoundingClientRect();return overlaps(r,q)?[{selector,rect:{left:q.left,right:q.right,top:q.top,bottom:q.bottom}}]:[];});
    return {message:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:node.scrollWidth,scrollHeight:node.scrollHeight,clientWidth:node.clientWidth,clientHeight:node.clientHeight,text:node.textContent.trim(),pointerEvents:getComputedStyle(node).pointerEvents},frameOverlap:overlaps(r,frame),navOverlap:overlaps(r,nav),interactiveOverlaps,viewportOverflow:r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1,documentOverflow:document.documentElement.scrollWidth>innerWidth};
  });
  await page.evaluate(()=>{const node=document.querySelector('#stageMsg');node.textContent='';node.hidden=true;node.classList.add('pc-sr-only');node.classList.remove('is-policy-notice');});
  await page.waitForTimeout(180);
  const after=await previewLabelGeometry(page);
  const movement={width:Math.abs(during.frame.width-before.frame.width),height:Math.abs(during.frame.height-before.frame.height),centerX:Math.abs(during.frameCenter.x-before.frameCenter.x),centerY:Math.abs(during.frameCenter.y-before.frameCenter.y),afterCenterX:Math.abs(after.frameCenter.x-before.frameCenter.x),afterCenterY:Math.abs(after.frameCenter.y-before.frameCenter.y)};
  assert.equal(during.context,contextBefore,`${name} injected label leaves settings context unchanged`);
  assert.equal(after.context,contextBefore,`${name} hidden label leaves settings context unchanged`);
  assert.equal(during.mode,modeBefore,`${name} injected label leaves camera mode unchanged`);
  assert.ok(Object.values(movement).every(value=>value<=.5),`${name} label moves preview: ${JSON.stringify(movement)}`);
  assert.deepEqual(overlap.interactiveOverlaps,[],`${name} label overlaps toolbar/palette/slider/merge/navigation controls: ${JSON.stringify(overlap)}`);
  assert.equal(overlap.viewportOverflow,false,`${name} label exceeds viewport: ${JSON.stringify(overlap)}`);
  assert.equal(overlap.documentOverflow,false,`${name} label creates horizontal page overflow: ${JSON.stringify(overlap)}`);
  assert.equal(overlap.message.pointerEvents,'none',`${name} label blocks pointer interactions`);
  assert.ok(overlap.message.scrollWidth<=overlap.message.clientWidth+1,`${name} label text overflows its content box: ${JSON.stringify(overlap.message)}`);
  const report={kind:'harness-injected-only',name,textLength:text.length,viewport,context:contextBefore,mode:modeBefore,before,during,after,movement,overlap};
  await writeFile(`${labelOut}/injected-${name}-${viewport.width}.json`,JSON.stringify(report,null,2));
  return report;
}

async function measureActualToast(page, viewport, name, trigger, expected) {
  await page.waitForTimeout(240);
  const before=await previewLabelGeometry(page);
  await trigger();
  await page.waitForFunction(({text})=>{const node=document.querySelector('#stageMsg');return node&&!node.hidden&&node.textContent.trim().includes(text);},{text:expected},{timeout:5000});
  let previous=null,stable=0;const settleStart=Date.now();
  while(Date.now()-settleStart<900&&stable<3){const current=await page.locator('#captureFrame').boundingBox();if(previous&&Math.max(Math.abs(current.x-previous.x),Math.abs(current.y-previous.y),Math.abs(current.width-previous.width),Math.abs(current.height-previous.height))<.1)stable++;else stable=0;previous=current;await page.waitForTimeout(60);}
  assert.ok(stable>=3,`${name} preview did not settle after its triggering UI action`);
  const during=await previewLabelGeometry(page);
  await page.screenshot({path:`${labelOut}/actual-${name}-during-${viewport.width}.png`});
  await page.waitForFunction(()=>document.querySelector('#stageMsg')?.hidden===true,null,{timeout:4000});
  await page.waitForTimeout(180);
  const after=await previewLabelGeometry(page);
  const movement={duringCenterX:Math.abs(during.frameCenter.x-before.frameCenter.x),duringCenterY:Math.abs(during.frameCenter.y-before.frameCenter.y),duringWidth:Math.abs(during.frame.width-before.frame.width),duringHeight:Math.abs(during.frame.height-before.frame.height),afterCenterX:Math.abs(after.frameCenter.x-before.frameCenter.x),afterCenterY:Math.abs(after.frameCenter.y-before.frameCenter.y)};
  assert.equal(during.context,before.context,`${name} actual toast changes settings context`);
  assert.equal(after.context,before.context,`${name} after-toast settings context differs`);
  assert.equal(during.mode,before.mode,`${name} actual toast changes camera mode`);
  assert.ok(during.canvas.width===before.canvas.width&&during.canvas.height===before.canvas.height,`${name} actual toast changes canvas dimensions`);
  assert.ok(Object.values(movement).every(value=>value<=.5),`${name} actual toast moves preview: ${JSON.stringify(movement)}`);
  const report={kind:'real-ui-action-and-toast',name,expected,viewport,before,during,after,movement,naturalToastDisappeared:after.toast.visible===false};
  await writeFile(`${labelOut}/actual-${name}-${viewport.width}.json`,JSON.stringify(report,null,2));
  return report;
}

async function measureCurrentToastDisappearance(page, viewport, name, expected) {
  await page.waitForFunction(({text})=>{const node=document.querySelector('#stageMsg');return node&&!node.hidden&&node.textContent.trim().includes(text);},{text:expected},{timeout:5000});
  await page.waitForTimeout(160);
  const during=await previewLabelGeometry(page),started=Date.now(),samples=[];
  await page.screenshot({path:`${labelOut}/actual-${name}-during-${viewport.width}.png`});
  while(Date.now()-started<3300){samples.push(await previewLabelGeometry(page));await page.waitForTimeout(100);}
  await page.waitForFunction(()=>document.querySelector('#stageMsg')?.hidden===true,null,{timeout:1500});
  await page.waitForTimeout(180);
  const after=await previewLabelGeometry(page),movement={maxWidthDelta:Math.max(...samples.map(item=>Math.abs(item.frame.width-during.frame.width)),0),maxHeightDelta:Math.max(...samples.map(item=>Math.abs(item.frame.height-during.frame.height)),0),maxCenterXDelta:Math.max(...samples.map(item=>Math.abs(item.frameCenter.x-during.frameCenter.x)),0),maxCenterYDelta:Math.max(...samples.map(item=>Math.abs(item.frameCenter.y-during.frameCenter.y)),0),afterCenterX:Math.abs(after.frameCenter.x-during.frameCenter.x),afterCenterY:Math.abs(after.frameCenter.y-during.frameCenter.y)};
  assert.ok(samples.every(item=>item.context===during.context&&item.mode===during.mode),`${name} status changed mode or context`);
  assert.ok(Object.values(movement).every(value=>value<=.5),`${name} dismissal moves preview: ${JSON.stringify(movement)}`);
  const report={kind:'real-ui-capture-toast',name,expected,viewport,during,samples,after,movement,naturalToastDisappeared:after.toast.visible===false};
  await writeFile(`${labelOut}/actual-${name}-${viewport.width}.json`,JSON.stringify(report,null,2));
  return report;
}

async function openPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor:1, acceptDownloads:true, hasTouch:true });
  await context.addInitScript(() => {
    window.__cameraTracks = [];
    window.__lastSourceFrame = null;
    window.__lastRenderedFrame = null;
    window.__measureToolbarButton = button => {
      const r=button.getBoundingClientRect(),style=getComputedStyle(button),number=v=>Number.parseFloat(v)||0;
      const content={left:r.left+number(style.borderLeftWidth)+number(style.paddingLeft),right:r.right-number(style.borderRightWidth)-number(style.paddingRight),top:r.top+number(style.borderTopWidth)+number(style.paddingTop),bottom:r.bottom-number(style.borderBottomWidth)-number(style.paddingBottom)};
      const texts=[],walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){
        const node=walker.currentNode;if(!node.nodeValue.trim())continue;
        const parent=node.parentElement;if(!parent||getComputedStyle(parent).display==='none'||getComputedStyle(parent).visibility==='hidden')continue;
        const range=document.createRange();range.selectNodeContents(node);
        for(const rect of range.getClientRects())if(rect.width&&rect.height){const fontSize=Number.parseFloat(getComputedStyle(parent).fontSize)||0;texts.push({text:node.nodeValue.trim(),fontSize,rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},contained:rect.left>=content.left-1&&rect.right<=content.right+1&&rect.top>=content.top-1&&rect.bottom<=content.bottom+1});}
      }
      const swatches=[...button.querySelectorAll('.lc-sw,.lc-tool-sw,[data-swatch],[class*="swatch"]')].map(node=>{const q=node.getBoundingClientRect();return{className:node.className?.baseVal??node.className,rect:{left:q.left,right:q.right,top:q.top,bottom:q.bottom}};});
      const before=getComputedStyle(button,'::before'),px=value=>Number.parseFloat(value)||0;
      const beforeContent=before.content,beforeWidth=px(before.width),beforeHeight=px(before.height);
      const beforeLeft=before.left==='auto'?r.right-px(before.right)-beforeWidth:r.left+px(before.left),beforeTop=before.top==='auto'?r.bottom-px(before.bottom)-beforeHeight:r.top+px(before.top);
      const pseudoBefore={content:beforeContent,backgroundColor:before.backgroundColor,customSwatch:style.getPropertyValue('--region-merge-swatch').trim(),position:before.position,width:beforeWidth,height:beforeHeight,rect:beforeContent!=='none'&&beforeWidth&&beforeHeight?{left:beforeLeft,right:beforeLeft+beforeWidth,top:beforeTop,bottom:beforeTop+beforeHeight}:null};
      if(pseudoBefore.rect&&(pseudoBefore.customSwatch||before.backgroundColor!=='rgba(0, 0, 0, 0)'))swatches.push({kind:'::before',backgroundColor:pseudoBefore.backgroundColor,customSwatch:pseudoBefore.customSwatch,rect:pseudoBefore.rect});
      const overlap=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
      const swatchTextOverlap=swatches.some(s=>texts.some(t=>overlap(s.rect,t.rect)));
      const textContainers=[button,...button.querySelectorAll('span,b,small,output,label')].filter(node=>node.clientWidth>0);
      const textOverflow=textContainers.filter(node=>node.scrollWidth>node.clientWidth+1||node.scrollHeight>node.clientHeight+1).map(node=>({tag:node.tagName,text:node.textContent.trim(),client:[node.clientWidth,node.clientHeight],scroll:[node.scrollWidth,node.scrollHeight]}));
      const textLines=new Set(texts.map(t=>Math.round(t.rect.top*2)/2)).size;
      return{width:r.width,height:r.height,fontSizes:texts.map(t=>t.fontSize),texts,textLines,wrapped:textLines>1,swatches,pseudoBefore,swatchTextOverlap,allTextContained:texts.every(t=>t.contained),textOverflow,contentFit:!swatchTextOverlap&&texts.every(t=>t.contained)&&textOverflow.length===0};
    };
    const get = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      const image = get.apply(this,args), view = document.querySelector('#view');
      if (view?.width > 1 && !this.canvas.isConnected && this.canvas.width === view.width && this.canvas.height === view.height) {
        window.__lastSourceFrame = {width:image.width,height:image.height,data:Array.from(image.data)};
      }
      return image;
    };
    const put = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (image,...args) {
      if (this.canvas?.id === 'view') window.__lastRenderedFrame = {width:image.width,height:image.height,data:Array.from(image.data)};
      return put.call(this,image,...args);
    };
    function paint(ctx,w,h) {
      const sky=ctx.createLinearGradient(0,0,0,h); sky.addColorStop(0,'#20315a'); sky.addColorStop(.5,'#547b9a'); sky.addColorStop(1,'#d0a46f');
      ctx.fillStyle=sky; ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#e5c988'; ctx.fillRect(w*.08,h*.28,w*.2,h*.18);
      ctx.fillStyle='#273b78'; ctx.fillRect(w*.35,h*.22,w*.22,h*.28);
      ctx.fillStyle='#fff2c5'; for(const [x,y] of [[.15,.1],[.3,.18],[.62,.12],[.82,.25],[.72,.37]]) ctx.fillRect(w*x,h*y,3,3);
      ctx.fillStyle='#34405d'; ctx.fillRect(0,h*.58,w,h*.42);
      ctx.fillStyle='#f2bd72'; for(let y=0;y<4;y++) for(let x=0;x<5;x++) if((x+y)%3) ctx.fillRect(w*(.06+x*.18),h*(.64+y*.07),3,4);
      ctx.fillStyle='#91c8b4'; ctx.fillRect(w*.72,h*.72,w*.13,h*.2);
    }
    const camera=document.createElement('canvas'); camera.width=320; camera.height=240;
    const cameraContext=camera.getContext('2d'); const stream=camera.captureStream(15);
    window.__cameraTracks.push(...stream.getVideoTracks());
    const draw=()=>paint(cameraContext,camera.width,camera.height); draw(); setInterval(draw,100);
    navigator.mediaDevices.getSupportedConstraints=()=>({});
    navigator.mediaDevices.getUserMedia=async()=>stream;
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(labelPhase==='source-before'&&url.pathname==='/css/pixel-lens-camera.css') return route.fulfill({contentType:'text/css',body:await readFile(`${outRoot}/pixel-lens-camera-head-18604317.css`)});
    if(url.hostname==='pagead2.googlesyndication.com') return route.fulfill({contentType:'application/javascript',body:''});
    return url.origin===origin?route.continue():route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
  await page.goto(`${base}/pixel-camera.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#capture')?.dataset.action==='capture'&&!document.querySelector('#capture').disabled,null,{timeout:20000});
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.ready==='true',null,{timeout:20000});
  await page.waitForFunction(()=>document.querySelector('#gestureHint')?.hidden===true,null,{timeout:6000});
  const loadedCss=await page.evaluate(async()=>{const link=[...document.querySelectorAll('link[rel="stylesheet"]')].find(node=>new URL(node.href).pathname==='/css/pixel-lens-camera.css');if(!link)return null;const response=await fetch(link.href,{cache:'no-store'});return {url:response.url,status:response.status,body:await response.text()};});
  const loadedCssHash=loadedCss&&createHash('sha256').update(loadedCss.body).digest('hex');
  return {context,page,loadedCssHash,loadedCssUrl:loadedCss?.url,loadedCssStatus:loadedCss?.status};
}
async function imageState(page) {
  return page.locator('#view').evaluate(canvas=>{
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let hash=2166136261; for(const byte of data) hash=Math.imul(hash^byte,16777619);
    return {width:canvas.width,height:canvas.height,hash:hash>>>0};
  });
}
function waitForImageChange(page,before) {
  return page.waitForFunction(({width,height,hash})=>{
    const canvas=document.querySelector('#view'); if(!canvas||canvas.width!==width||canvas.height!==height) return true;
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let next=2166136261; for(const byte of data) next=Math.imul(next^byte,16777619);
    return (next>>>0)!==hash;
  },before,{timeout:12000});
}
async function selectContext(page,tool) {
  await page.locator(`#toolbar [data-tool="${tool}"]`).click();
  await page.waitForFunction(tool=>document.querySelector('#pixelStudio')?.dataset.settingsContext===tool,tool,{timeout:4000});
  await page.locator('#toolbarContextHead').waitFor({state:'visible'});
}
async function returnHome(page,how='back') {
  if(how==='back') await page.locator('#toolbarContextBack').click();
  if(how==='escape') await page.keyboard.press('Escape');
  if(how==='image') {const box=await page.locator('#view').boundingBox();await page.locator('#view').click({position:{x:box.width/2,y:box.height/2}});}
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.settingsContext==='',null,{timeout:4000});
}
async function assertLayout(page,viewport,contextTool='') {
  await page.waitForTimeout(260);
  const result=await page.evaluate(tool=>{
    const visible=n=>!!n&&!n.hidden&&n.getClientRects().length>0&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden';
    const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const contextControls=tool?['#toolbarContextHead','#toolbarContextBack','#toolbarContextMore'].map(s=>({selector:s,visible:visible(document.querySelector(s)),...rect(document.querySelector(s)||document.body)})):[];
    const home=[...document.querySelectorAll('#toolbar [data-tool]')].map(n=>{
      const value=n.querySelector('b'),category=n.querySelector('small'),buttonRect=n.getBoundingClientRect(),style=getComputedStyle(n),number=v=>Number.parseFloat(v)||0;
      const content={left:buttonRect.left+number(style.borderLeftWidth)+number(style.paddingLeft),right:buttonRect.right-number(style.borderRightWidth)-number(style.paddingRight),top:buttonRect.top+number(style.borderTopWidth)+number(style.paddingTop),bottom:buttonRect.bottom-number(style.borderBottomWidth)-number(style.paddingBottom)};
      const labels=Object.fromEntries(['b','small'].map(tag=>{const e=n.querySelector(tag);return[tag,e?rect(e):null];})),labelRects=[value,category].filter(Boolean).map(e=>e.getBoundingClientRect());
      const icons=[...n.querySelectorAll('.lc-tool-sw,.lc-tool-ic')].map(e=>e.getBoundingClientRect()),overlap=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
      return{tool:n.dataset.tool,visible:visible(n),...rect(n),hit:(()=>{const h=document.elementFromPoint(buttonRect.x+buttonRect.width/2,buttonRect.y+buttonRect.height/2);return h===n||n.contains(h);})(),categoryFont:Number.parseFloat(getComputedStyle(category||n).fontSize)||0,valueFont:Number.parseFloat(getComputedStyle(value||n).fontSize)||0,categoryMetrics:category?{client:[category.clientWidth,category.clientHeight],scroll:[category.scrollWidth,category.scrollHeight]}:null,valueMetrics:value?{text:value.textContent.trim(),client:[value.clientWidth,value.clientHeight],scroll:[value.scrollWidth,value.scrollHeight],accessibleLabel:n.getAttribute('aria-label'),title:n.getAttribute('title')}:null,labelBoxesContained:labelRects.every(r=>r.left>=content.left-1&&r.right<=content.right+1&&r.top>=content.top-1&&r.bottom<=content.bottom+1),iconTextOverlap:icons.some(icon=>labelRects.some(label=>overlap(icon,label))),polish:window.__measureToolbarButton(n),labels};
    });
    const controls=[...document.querySelectorAll('#pixelStudio button:not([hidden]),#pixelStudio input[type="range"]:not([hidden]),#pixelStudio select:not([hidden])')].filter(visible).map(n=>{
      const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
      const hit=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,x)),Math.max(0,Math.min(innerHeight-1,y)));
      let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let parent=n.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
        const style=getComputedStyle(parent),p=parent.getBoundingClientRect();
        if(['auto','scroll','hidden','clip'].includes(style.overflowX)){clip.left=Math.max(clip.left,p.left);clip.right=Math.min(clip.right,p.right);}
        if(['auto','scroll','hidden','clip'].includes(style.overflowY)){clip.top=Math.max(clip.top,p.top);clip.bottom=Math.min(clip.bottom,p.bottom);}
      }
      const visibleRect={x:Math.max(r.left,clip.left),y:Math.max(r.top,clip.top),right:Math.min(r.right,clip.right),bottom:Math.min(r.bottom,clip.bottom)};
      visibleRect.width=Math.max(0,visibleRect.right-visibleRect.x);visibleRect.height=Math.max(0,visibleRect.bottom-visibleRect.y);
      const partiallyClipped=visibleRect.x>r.left||visibleRect.y>r.top||visibleRect.right<r.right||visibleRect.bottom<r.bottom;
      return {label:n.getAttribute('aria-label')||n.textContent.trim(),hit:hit===n||n.contains(hit),clipped:partiallyClipped||visibleRect.width===0||visibleRect.height===0,visibleRect,...rect(n)};
    });
    const debugNodes=['#toolbar','#toolbarContextHead','#toolbarContextBack','#tray','[data-panel="look"]','#looks','#looks [data-look]','#toolbarContextMore'];
    const debug=Object.fromEntries(debugNodes.map(s=>{const n=document.querySelector(s);if(!n)return[s,null];const r=n.getBoundingClientRect(),c=getComputedStyle(n);return[s,{rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},display:c.display,position:c.position,flex:c.flex,flexBasis:c.flexBasis,flexGrow:c.flexGrow,flexShrink:c.flexShrink,minWidth:c.minWidth,maxWidth:c.maxWidth,width:c.width,gridTemplateColumns:c.gridTemplateColumns,margin:c.margin,transform:c.transform,overflowX:c.overflowX,scrollLeft:n.scrollLeft,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,parent:n.parentElement?{tag:n.parentElement.tagName,id:n.parentElement.id,className:n.parentElement.className}:null}];}));
    const rules=[]; for(const sheet of document.styleSheets){try{for(const rule of sheet.cssRules||[])if(rule.selectorText&&/toolbar|tray|looks|look|context/i.test(rule.selectorText))rules.push({href:sheet.href,selector:rule.selectorText});}catch{}}
    return {context:document.querySelector('#pixelStudio')?.dataset.settingsContext,contextLabel:document.querySelector('#toolbarContextLabel')?.textContent,contextControls,home,controls,debug,rules,overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth,nav:[...document.querySelector('.app-tabs[data-nav="five"]')?.children||[]].map(n=>({tag:n.tagName,id:n.id,nav:n.dataset.nav,label:n.getAttribute('aria-label')}))};
  },contextTool);
  assert.equal(result.overflow,false,`horizontal overflow at ${viewport.width}: ${JSON.stringify(result)}`);
  const railHeight=result.debug['#toolbar']?.rect.height??0;
  assert.ok(railHeight>=64,`toolbar rail below 64px at ${viewport.width}: ${JSON.stringify(result.debug['#toolbar'])}`);
  polishMeasurements.push({viewport,context:contextTool||'home',railHeight,home:result.home.map(({tool,categoryFont,valueFont,categoryMetrics,valueMetrics,labelBoxesContained,iconTextOverlap,polish})=>({tool,categoryFont,valueFont,categoryMetrics,valueMetrics,labelBoxesContained,iconTextOverlap,polish}))});
  assert.deepEqual(result.home.map(x=>x.tool),tools);
  if(contextTool==='look'&&viewport.width===320&&process.env.PIXIEED_CAMERA_COMPACT_DEBUG) console.log(`compact look layout ${JSON.stringify(result.debug)}`);
  if(!contextTool) {
    assert.ok(result.home.every(x=>x.visible&&x.width>=44&&x.height>=44&&x.hit),`home controls are not visible/reachable/44px: ${JSON.stringify(result.home)}`);
    for(const item of result.home){
      assert.ok(item.categoryFont>=11,`home category label below 11px: ${JSON.stringify(item)}`);
      assert.ok(item.valueFont>=12,`home value label below 12px: ${JSON.stringify(item)}`);
      assert.ok(item.labelBoxesContained&&!item.iconTextOverlap,`home label boxes escape their button or overlap an icon/swatch: ${JSON.stringify(item)}`);
      assert.ok(!item.categoryMetrics||item.categoryMetrics.scroll.every((size,index)=>size<=item.categoryMetrics.client[index]+1),`home category text is clipped: ${JSON.stringify(item)}`);
      if(item.valueMetrics?.scroll.some((size,index)=>size>item.valueMetrics.client[index]+1)){const fullLabel=`${item.valueMetrics.accessibleLabel||''} ${item.valueMetrics.title||''}`;assert.ok(item.valueMetrics.text&&fullLabel.includes(item.valueMetrics.text),`truncated home value lacks a full accessible label/title: ${JSON.stringify(item)}`);}
    }
    for(const item of result.home) {const b=item.labels.b,s=item.labels.small;if(b&&s)assert.ok(b.right<=s.x||s.right<=b.x||b.bottom<=s.y||s.bottom<=b.y,`home title/subtitle overlap for ${item.tool}: ${JSON.stringify(item)}`);}
    assert.equal(result.context,'');
  } else {
    assert.equal(result.context,contextTool);
    assert.ok(result.contextLabel,`context label is populated: ${JSON.stringify(result)}`);
    assert.ok(result.contextControls.every(c=>c.visible),`context rail missing a slot: ${JSON.stringify(result.contextControls)}`);
    assert.ok(result.home.every(x=>!x.visible),`home tool buttons remain visible in context: ${JSON.stringify(result.home)}`);
  }
  for(const c of result.controls) {
    assert.ok(c.width>=44&&c.height>=44,`control below 44px: ${JSON.stringify(c)}`);
    if(!c.clipped) assert.ok(c.hit,`visible control is occluded: ${JSON.stringify(c)}`);
  }
  for(let i=0;i<result.controls.length;i++) for(let j=i+1;j<result.controls.length;j++) {
    const a=result.controls[i],b=result.controls[j];
    if(a.visibleRect.width===0||a.visibleRect.height===0||b.visibleRect.width===0||b.visibleRect.height===0) continue;
    const x=a.visibleRect,y=b.visibleRect;
    assert.ok(x.right<=y.x||y.right<=x.x||x.bottom<=y.y||y.bottom<=x.y,`visible controls overlap: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
  }
  checks++;
  return result;
}
async function assertHomeFrameFits(page,viewport,label) {
  await page.waitForTimeout(260);
  const m=await page.evaluate(()=>{
    const rect=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();
    const visible=n=>!!n&&n.getClientRects().length>0&&!n.hidden&&getComputedStyle(n).display!=='none'&&getComputedStyle(n).visibility!=='hidden';
    const selectors=['#paletteStrip','.lc-color-slider','.lc-tone > .lc-slider','#regionMergePanel','#regionMergePalette'];
    const helpers=selectors.map(selector=>({selector,visible:visible(document.querySelector(selector)),rect:visible(document.querySelector(selector))?rect(selector):null})).filter(item=>item.visible);
    const visibleChoices=[...document.querySelectorAll('.lc-row button')].filter(visible).map(node=>({label:node.textContent.trim(),rect:node.getBoundingClientRect().toJSON(),selector:node.closest('.lc-looks')?'#looks':node.closest('#editChips')?'#editChips':'#context-row'}));
    const toast=document.querySelector('#stageMsg'),toastVisible=visible(toast)&&!toast.classList.contains('pc-sr-only');
    return {frame:rect('#captureFrame'),top:rect('.lc-top'),toolbar:rect('#toolbar'),nav:rect('.app-tabs[data-nav="five"]'),helpers,visibleChoices,toast:{visible:toastVisible,text:toastVisible?toast.textContent.trim():'',rect:toastVisible?toast.getBoundingClientRect().toJSON():null},viewport:{width:innerWidth,height:innerHeight}};
  });
  const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
  assert.ok(m.frame&&m.toolbar&&m.nav,`frame/home chrome exists at ${label}: ${JSON.stringify(m)}`);
  assert.ok(!overlap(m.frame,m.toolbar)&&!overlap(m.frame,m.nav),`home preview overlaps toolbar or five-item nav (${viewport.width}, ${label}): ${JSON.stringify(m)}`);
  if(m.toast.visible)for(const helper of m.helpers)if(overlap(helper.rect,m.toast.rect)){await page.screenshot({path:`${out}/camera-compact-toast-helper-overlap-${viewport.width}.png`});assert.fail(`visible toast “${m.toast.text}” overlaps helper ${helper.selector} (${viewport.width}, ${label}): ${JSON.stringify(m)}`);}
  for(const helper of m.helpers){assert.ok(!overlap(m.frame,helper.rect),`preview overlaps visible helper/control ${helper.selector} (${viewport.width}, ${label}): ${JSON.stringify(m)}`);for(const choice of m.visibleChoices)if(overlap(helper.rect,choice.rect)){await page.screenshot({path:`${out}/camera-compact-helper-choice-overlap-${viewport.width}.png`});assert.fail(`visible choice label/control ${choice.label} overlaps helper ${helper.selector} (${viewport.width}, ${label}): ${JSON.stringify({helper,choice,measurements:m})}`);}}
  polishMeasurements.push({viewport,context:label,frame:m.frame,helpers:m.helpers,visibleChoices:m.visibleChoices,toast:m.toast});
  if(m.top) assert.ok(m.frame.top>=m.top.bottom-1,`preview rises above header (${viewport.width}, ${label}): ${JSON.stringify(m)}`);
  checks++;
}
async function assertOptionReachability(page,tool) {
  const choices=page.locator(optionGroups[tool]);
  const n=await choices.count(); assert.ok(n>0,`${tool} context exposes choices`);
  const seen=new Set();
  for(let pageIndex=0;pageIndex<Math.max(2,n+1)&&seen.size<n;pageIndex++) {
    const visible=await choices.evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>({key:n.dataset.look??n.dataset.value??n.dataset.zoom})));
    for(const entry of visible) {
      const target=page.locator(`${optionGroups[tool]}[data-look="${entry.key}"],${optionGroups[tool]}[data-value="${entry.key}"],${optionGroups[tool]}[data-zoom="${entry.key}"]`).first();
      await target.evaluate(el=>el.scrollIntoView({block:'nearest',inline:'center'}));
      await target.evaluate(el=>new Promise(resolve=>{const sample=()=>{const r=el.getBoundingClientRect();let port=null;for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(['auto','scroll'].includes(s.overflowX)&&p.scrollWidth>p.clientWidth+1){port=p;break;}}return JSON.stringify({scrollLeft:port?.scrollLeft??0,x:r.x,y:r.y,width:r.width,height:r.height});};let previous='',stable=0;const start=performance.now();const tick=()=>{const current=sample();stable=current===previous?stable+1:0;previous=current;if((stable>=4&&performance.now()-start>=260)||performance.now()-start>1800)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
      const detail=await target.evaluate(el=>{const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,x)),Math.max(0,Math.min(innerHeight-1,y))),more=document.querySelector('#toolbarContextMore'),ancestors=[];for(let p=el.parentElement;p&&ancestors.length<6;p=p.parentElement){const s=getComputedStyle(p),q=p.getBoundingClientRect();ancestors.push({tag:p.tagName,id:p.id,className:typeof p.className==='string'?p.className:'',rect:{x:q.x,y:q.y,right:q.right,bottom:q.bottom,width:q.width,height:q.height},overflowX:s.overflowX,overflowY:s.overflowY,scrollLeft:p.scrollLeft,scrollWidth:p.scrollWidth,clientWidth:p.clientWidth});}const mr=more?.getBoundingClientRect();return {...window.__measureToolbarButton(el),visible:!!(r.width&&r.height),rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom},center:{x,y},hit:hit===el||el.contains(hit),hitElement:hit?{tag:hit.tagName,id:hit.id,className:typeof hit.className==='string'?hit.className:'',text:hit.textContent.trim().slice(0,80)}:null,more:mr?{x:mr.x,y:mr.y,right:mr.right,bottom:mr.bottom,width:mr.width,height:mr.height,display:getComputedStyle(more).display}:null,ancestors,viewport:{width:innerWidth,height:innerHeight}};});
      if(!detail.hit){await page.screenshot({path:`${out}/camera-compact-hit-failure-${detail.viewport.width}-${tool}-${entry.key}.png`});polishMeasurements.push({viewport:detail.viewport,context:tool,choice:String(entry.key),failure:detail});await writeFile(`${out}/camera-compact-hit-failure-${detail.viewport.width}-${tool}-${entry.key}.json`,JSON.stringify({viewport:detail.viewport,context:tool,choice:String(entry.key),failure:detail},null,2));}
      assert.ok(detail.visible&&detail.width>=44&&detail.height>=48&&detail.hit,`${tool} option ${entry.key} not 48px/highly reachable: ${JSON.stringify(detail)}`);
      assert.ok(detail.fontSizes.length>0&&detail.fontSizes.every(size=>size>=12),`${tool} option ${entry.key} label font below 12px: ${JSON.stringify(detail)}`);
      assert.ok(detail.contentFit,`${tool} option ${entry.key} label is clipped/outside content or overlaps its swatch: ${JSON.stringify(detail)}`);
      polishMeasurements.push({viewport:detail.viewport,context:tool,choice:String(entry.key),...detail});
      seen.add(String(entry.key));
    }
    if(seen.size===n) break;
    const more=page.locator('#toolbarContextMore');
    assert.ok(await more.isVisible(),`${tool} remaining choices have no More control (${seen.size}/${n})`);
    const beforePage=visible.map(item=>item.key).join('|');
    await more.click();
    await page.waitForFunction(({selector,previous})=>{
      const values=[...document.querySelectorAll(selector)].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden').map(n=>n.dataset.look??n.dataset.value??n.dataset.zoom).join('|');
      return values!==previous;
    },{selector:optionGroups[tool],previous:beforePage},{timeout:2500}).catch(async()=>{
      const after=await choices.evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>n.dataset.look??n.dataset.value??n.dataset.zoom).join('|'));
      assert.notEqual(after,beforePage,`${tool} More control must move to another options page`);
    });
  }
  assert.equal(seen.size,n,`${tool} More paging exposes every option (${seen.size}/${n})`);
  const row=page.locator(optionRows[tool]);
  const before=await row.evaluate(el=>({scrollLeft:el.scrollLeft,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,rect:el.getBoundingClientRect().toJSON()}));
  if(before.scrollWidth>before.clientWidth+1){
    await row.evaluate(el=>{el.scrollLeft=0;});
    const box=await row.boundingBox();await page.mouse.move(box.x+Math.min(box.width/2,80),box.y+box.height/2);await page.mouse.wheel(180,0);
    await page.waitForFunction(selector=>{const el=document.querySelector(selector);return el&&el.scrollLeft>1;},optionRows[tool],{timeout:2500});
    const after=await row.evaluate(el=>({scrollLeft:el.scrollLeft,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth}));
    assert.ok(after.scrollLeft>1,`${tool} row cannot be horizontally reached by a user wheel gesture: ${JSON.stringify({before,after})}`);
    polishMeasurements.push({context:tool,userHorizontalWheel:true,before:{scrollLeft:before.scrollLeft,scrollWidth:before.scrollWidth,clientWidth:before.clientWidth},after});
  }else polishMeasurements.push({context:tool,userHorizontalWheel:false,scrollWidth:before.scrollWidth,clientWidth:before.clientWidth});
  checks++;
  return n;
}
async function revealChoice(page,tool,selector) {
  const item=page.locator(selector);
  for(let pageIndex=0;pageIndex<30&&!await item.isVisible();pageIndex++) {
    const more=page.locator('#toolbarContextMore'); assert.ok(await more.isVisible(),`${tool} option ${selector} is hidden and no More control is available`);
    await more.click(); await page.waitForTimeout(80);
  }
  await item.scrollIntoViewIfNeeded(); assert.ok(await item.isVisible(),`${tool} option ${selector} became visible`);
}
async function choose(page,selector) {
  const item=page.locator(selector); await item.scrollIntoViewIfNeeded(); await item.click();
  await page.waitForTimeout(120);
}
async function setRange(page,selector,value) {
  const control=page.locator(selector); await control.scrollIntoViewIfNeeded();
  await control.evaluate((node,next)=>{node.value=String(next);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));},value);
}

try {
  for(const viewport of viewports) {
    const {context,page,loadedCssHash,loadedCssUrl,loadedCssStatus}=await openPage(viewport),root=page.locator('#pixelStudio');
    loadedCssHashes[`${viewport.width}x${viewport.height}`]={sha256:loadedCssHash,url:loadedCssUrl,status:loadedCssStatus};
    const navBefore=await page.locator('.app-tabs[data-nav="five"]').evaluate(node=>[...node.children].map(n=>({tag:n.tagName,id:n.id,nav:n.dataset.nav,label:n.getAttribute('aria-label')})));
    assert.equal(await page.locator('#cameraSettings').count(),0,'right-side gear is absent');
    assert.equal(await page.locator('#toolbar [data-tool]').count(),6,'six home tools are always rendered');
    let home=await assertLayout(page,viewport);
    await assertHomeFrameFits(page,viewport,'1:1 initial');
    await page.screenshot({path:`${out}/camera-compact-home-${viewport.width}.png`});
    if(labelPhase==='source-after') {
      await measureActualToast(page,viewport,'home-swipe',async()=>{
        const r=await page.locator('#view').boundingBox(),y=r.y+r.height*.5;
        await page.mouse.move(r.x+r.width*.82,y);await page.mouse.down();await page.mouse.move(r.x+r.width*.18,y,{steps:7});await page.mouse.up();
      },'色');
      await measureInjectedLabel(page,viewport,'home-long','共通キャンバスは最大256px・32色です。プロジェクトのキャンバス設定を確認してください。現在の画像は変更されていません。');
    }

    // Look: switch 8/16-color presets, edit one swatch, and use the saved My palette.
    let state=await imageState(page); await selectContext(page,'look');
    await page.waitForTimeout(250);
    if(['before','source-before','source-after'].includes(process.env.PIXIEED_CAMERA_LABEL_PHASE)&&viewport.width===390){
      const report=await measureNaturalLookToast(page,viewport);labelStability.push(report);
      if(process.env.PIXIEED_CAMERA_LABEL_ONLY==='1'){await context.close();continue;}
    }
    if(labelPhase==='source-after'&&viewport.width!==390){const report=await measureNaturalLookToast(page,viewport);labelStability.push(report);}
    if(labelPhase==='source-after')state=await imageState(page);
    if(labelPhase==='source-after')await measureInjectedLabel(page,viewport,'look-open-long','写真の保存範囲を確認できないため、保存を停止しました。撮影した画像は変更していません。設定を確認してからもう一度お試しください。');
    await page.screenshot({path:`${out}/camera-compact-look-open-${viewport.width}.png`});
    await assertLayout(page,viewport,'look'); await assertHomeFrameFits(page,viewport,'look choice rail'); const lookCount=await assertOptionReachability(page,'look');
    const lookFrame=Number(await root.getAttribute('data-preview-frames'))||0;
    await revealChoice(page,'look','#looks [data-look="c8"]'); await choose(page,'#looks [data-look="c8"]'); await page.waitForFunction(()=>Number(document.querySelector('#pixelStudio')?.dataset.paletteSize)>0&&Number(document.querySelector('#pixelStudio')?.dataset.paletteSize)<=8); await waitForImageChange(page,state); checks++;
    state=await imageState(page); await revealChoice(page,'look','#looks [data-look="c16"]'); await choose(page,'#looks [data-look="c16"]'); await waitForImageChange(page,state); checks++;
    await page.locator('#paletteDots [data-index="0"]').click(); await setRange(page,'#editSlider',210);
    const editingDone=page.locator('#toolbarContextMore'); await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.editing==='true');
    await page.waitForTimeout(250);
    await assertHomeFrameFits(page,viewport,'palette color editor helper');
    if(labelPhase==='source-after')await measureInjectedLabel(page,viewport,'look-editor-long','共通キャンバスの範囲を確認できないため、画像を戻しませんでした。撮影画像は変更せず、編集画面に戻ります。');
    if(viewport.width===320||viewport.width===1280) await page.screenshot({path:`${out}/camera-compact-edit-${viewport.width}.png`});
    assert.match(await editingDone.textContent(),/完了/,'palette edit exposes the contextual Done action');
    assert.ok(await editingDone.isVisible(),'palette edit Done action is reachable'); await editingDone.click();
    await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.editing==='false');
    const paletteSave=page.locator('#paletteSave'); await page.waitForFunction(()=>{const n=document.querySelector('#paletteSave');return n&&!n.disabled&&!n.hidden&&getComputedStyle(n).visibility!=='hidden';});
    if(labelPhase==='source-after')await measureActualToast(page,viewport,'look-save',()=>paletteSave.click(),'マイ'); else await paletteSave.click();
    await page.waitForFunction(()=>document.querySelectorAll('#looks [data-look^="my-"]').length>0);
    const my=page.locator('#looks [data-look^="my-"]').first(); await revealChoice(page,'look','#looks [data-look^="my-"]'); await my.click(); await page.waitForFunction(()=>document.querySelector('#toolbar [data-tool="look"] b')?.textContent.startsWith('マイ'));
    await page.screenshot({path:`${out}/camera-compact-look-${viewport.width}.png`}); checks++;
    await returnHome(page,'back');

    // Dither choice changes real pixels while leaving the selected toolbar context open.
    await selectContext(page,'dither'); await assertLayout(page,viewport,'dither'); const ditherCount=await assertOptionReachability(page,'dither'); state=await imageState(page);
    assert.ok(ditherCount>=10,'all dither patterns including OFF are available');
    await revealChoice(page,'dither','#ditherKinds [data-value="checker"]'); await choose(page,'#ditherKinds [data-value="checker"]'); await waitForImageChange(page,state);
    assert.ok(['checker','ordered',''].includes(await root.getAttribute('data-dither')||'')); checks++;
    await returnHome(page,'escape');

    // Pixel count and aspect ratio alter output canvas dimensions, not just labels.
    await selectContext(page,'pixels'); await assertLayout(page,viewport,'pixels'); await assertOptionReachability(page,'pixels');
    const sizes=await page.locator('#pixelsPanel [data-value]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.value)));
    assert.deepEqual(sizes,[16,32,64,96,128,160,256]);
    await revealChoice(page,'pixels','#pixelsPanel [data-value="64"]'); await choose(page,'#pixelsPanel [data-value="64"]');
    await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.outputSize==='64'&&document.querySelector('#view')?.height===64,null,{timeout:12000}); checks++;
    await returnHome(page,'back');
    await selectContext(page,'aspect'); await assertLayout(page,viewport,'aspect'); await assertOptionReachability(page,'aspect');
    const ratioBefore=await imageState(page); await revealChoice(page,'aspect','#aspectPanel [data-value="9:16"]'); await choose(page,'#aspectPanel [data-value="9:16"]');
    await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.framing==='9:16'&&document.querySelector('#view')?.width===36&&document.querySelector('#view')?.height===64,null,{timeout:12000});
    assert.ok((await imageState(page)).width!==ratioBefore.width); checks++;
    await page.screenshot({path:`${out}/camera-compact-aspect-${viewport.width}.png`}); await returnHome(page,'image');
    await assertHomeFrameFits(page,viewport,'9:16 returned home');

    // Tone and zoom controls each alter the image pixels.
    state=await imageState(page); await selectContext(page,'tone'); await assertLayout(page,viewport,'tone'); await assertHomeFrameFits(page,viewport,'tone slider helper'); await assertOptionReachability(page,'tone');
    await revealChoice(page,'tone','#toneChips [data-value="brightness"]'); await choose(page,'#toneChips [data-value="brightness"]'); await setRange(page,'#toneSlider',40); await waitForImageChange(page,state); checks++;
    if(labelPhase==='source-after'){
      await measureActualToast(page,viewport,'tone-reset',()=>page.locator('#toneReset').click(),'色調整を元に戻しました');
      await measureInjectedLabel(page,viewport,'tone-long','共通キャンバスは最大256px・32色です。撮影画像は保存データに反映しませんでした。設定を確認してください。');
    }
    await page.screenshot({path:`${out}/camera-compact-tone-${viewport.width}.png`}); await returnHome(page,'back');
    state=await imageState(page); await selectContext(page,'zoom'); await assertLayout(page,viewport,'zoom'); await assertOptionReachability(page,'zoom');
    const zoomValues=await page.locator('#zoomStops [data-zoom]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.zoom)));
    const zoomTarget=zoomValues.find(v=>v>=1.5)??zoomValues.at(-1); assert.ok(zoomTarget>1);
    await revealChoice(page,'zoom',`#zoomStops [data-zoom="${zoomTarget}"]`); await choose(page,`#zoomStops [data-zoom="${zoomTarget}"]`); await waitForImageChange(page,state); checks++;
    await page.screenshot({path:`${out}/camera-compact-zoom-${viewport.width}.png`}); await returnHome(page,'back');

    // All original editing controls remain available, then the five-item app navigation captures normally.
    assert.deepEqual(await page.locator('.app-tabs[data-nav="five"]').evaluate(node=>[...node.children].map(n=>({tag:n.tagName,id:n.id,nav:n.dataset.nav,label:n.getAttribute('aria-label')}))),navBefore,'the five-item bottom navigation is unchanged');
    const beforeCapture=await exactState(page); assert.ok(beforeCapture,'capture source pixels observed');
    await page.locator('#capture').click();
    await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='captured',null,{timeout:15000});
    if(labelPhase==='source-after'){
      await measureCurrentToastDisappearance(page,viewport,'captured','撮影しました。PNGを保存できます。');
      await measureInjectedLabel(page,viewport,'captured-long','共通キャンバスは最大256px・32色です。撮影画像は変更せず、編集画面に戻ります。保存前にサイズと色数を確認してください。');
    }
    const stored=await page.evaluate(async frame=>{
      const store=await import('/js/creation/pxd-store.mjs'),projectApi=await import('/js/creation/pxd-project.mjs'),shared=await import('/js/creation/shared-image.mjs');
      let pointer=null;
      for(let attempt=0;attempt<60;attempt++){
        pointer=JSON.parse(localStorage.getItem('pixieed:pxd:last:camera')||'null');
        if(pointer?.projectId&&pointer?.revisionId){
          try{const project=await store.createPxdStore().load(pointer.projectId,pointer.revisionId),image=await projectApi.readPxdSharedImage(project);if(image){const expected=shared.prepareSharedCanvasImage({width:frame.width,height:frame.height,rgba:Uint8Array.from(frame.data)},{passActive:true,width:image.width,height:image.height,maxColors:32}).image.rgba;return {pointer,width:image.width,height:image.height,rgba:Array.from(image.rgba),expected:Array.from(expected)};}}catch{}
        }
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      return {diagnostic:'camera PXD shared image did not become readable',pointer,storageKeys:Object.keys(localStorage)};
    },beforeCapture);
    assert.ok(stored?.rgba,`captured shared image can be read through the existing PXD path: ${JSON.stringify(stored)}`);
    assert.deepEqual(stored.rgba,stored.expected,'captured shared image contains the edited canvas pixels');
    assert.deepEqual(await page.locator('.app-tabs[data-nav="five"]').evaluate(node=>[...node.children].map(n=>({tag:n.tagName,id:n.id,nav:n.dataset.nav}))),navBefore.map(({tag,id,nav})=>({tag,id,nav})),'capture preserves the same five-item app navigation');
    assert.equal(await page.locator('#capture').getAttribute('aria-label'),'撮り直す','capture item updates to the expected captured-state action'); checks++;
    await page.screenshot({path:`${out}/camera-compact-captured-${viewport.width}.png`});
    await context.close();
    console.log(`compact camera toolbar ${viewport.width}x${viewport.height}: PASS; home tools=6; look choices=${lookCount}; settings context paths=6`);
  }
  assert.deepEqual(errors,[],'no browser page errors');
  await writeFile(`${out}/compact-results.json`,JSON.stringify({checks,viewports,sourceHashes,measurements:polishMeasurements,labelStability,errors},null,2));
  console.log(`Camera compact toolbar: ${checks}/${checks} PASS; synthetic canvas camera only; live camera, Safari, physical devices, and production UNTESTED; screenshots: ${out}`);
} finally { await browser.close(); }

async function exactState(page) {
  return page.evaluate(()=>{
    const canvas=document.querySelector('#view'), frame=window.__lastRenderedFrame;
    return frame&&frame.width===canvas.width&&frame.height===canvas.height?structuredClone(frame):null;
  });
}
