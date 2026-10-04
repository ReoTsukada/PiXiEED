#!/usr/bin/env node
/** Synthetic camera coverage for the local pixel-camera region merge interaction. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only a local camera server is allowed');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const errors = [];
const out = '/tmp/pixieed-camera-gestures-20261003/region-regression';
await mkdir(out, { recursive: true });
let checks = 0;
const visualMeasurements = [];
const sourceHashes = {};
for(const file of ['pixel-camera.html','css/pixel-lens-camera.css','js/pixel-lens/app.mjs','js/pixel-lens/engine.mjs','js/pixel-lens/region-merge.mjs','js/pixel-lens/live-region-merge.mjs','scripts/camera-region-merge-browser-harness.mjs'])sourceHashes[file]=createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex');

const viewports = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
  { width: 844, height: 390 }
].filter((viewport) => !process.env.PIXIEED_REGION_MERGE_VIEWPORT || viewport.width === Number(process.env.PIXIEED_REGION_MERGE_VIEWPORT));

async function newPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, acceptDownloads: true, hasTouch: true });
  await context.addInitScript(() => {
    window.__cameraRequestCount = 0;
    window.__cameraTracks = [];
    window.__lastSourceFrame = null;
    window.__lastRenderedFrame = null;
    window.__measureToolbarButton = button => {
      const r=button.getBoundingClientRect(),style=getComputedStyle(button),number=v=>Number.parseFloat(v)||0;
      const content={left:r.left+number(style.borderLeftWidth)+number(style.paddingLeft),right:r.right-number(style.borderRightWidth)-number(style.paddingRight),top:r.top+number(style.borderTopWidth)+number(style.paddingTop),bottom:r.bottom-number(style.borderBottomWidth)-number(style.paddingBottom)};
      const texts=[],walker=document.createTreeWalker(button,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()){const node=walker.currentNode;if(!node.nodeValue.trim())continue;const parent=node.parentElement;if(!parent||getComputedStyle(parent).display==='none'||getComputedStyle(parent).visibility==='hidden')continue;const range=document.createRange();range.selectNodeContents(node);for(const rect of range.getClientRects())if(rect.width&&rect.height){const fontSize=Number.parseFloat(getComputedStyle(parent).fontSize)||0;texts.push({text:node.nodeValue.trim(),fontSize,rect:{left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom},contained:rect.left>=content.left-1&&rect.right<=content.right+1&&rect.top>=content.top-1&&rect.bottom<=content.bottom+1});}}
      const swatches=[...button.querySelectorAll('.lc-sw,.lc-tool-sw,[data-swatch],[class*="swatch"]')].map(node=>{const q=node.getBoundingClientRect();return{className:node.className?.baseVal??node.className,rect:{left:q.left,right:q.right,top:q.top,bottom:q.bottom}};});
      const before=getComputedStyle(button,'::before'),px=value=>Number.parseFloat(value)||0;
      const beforeContent=before.content,beforeWidth=px(before.width),beforeHeight=px(before.height);
      const beforeLeft=before.left==='auto'?r.right-px(before.right)-beforeWidth:r.left+px(before.left),beforeTop=before.top==='auto'?r.bottom-px(before.bottom)-beforeHeight:r.top+px(before.top);
      const pseudoBefore={content:beforeContent,backgroundColor:before.backgroundColor,customSwatch:style.getPropertyValue('--region-merge-swatch').trim(),position:before.position,width:beforeWidth,height:beforeHeight,rect:beforeContent!=='none'&&beforeWidth&&beforeHeight?{left:beforeLeft,right:beforeLeft+beforeWidth,top:beforeTop,bottom:beforeTop+beforeHeight}:null};
      if(pseudoBefore.rect&&(pseudoBefore.customSwatch||before.backgroundColor!=='rgba(0, 0, 0, 0)'))swatches.push({kind:'::before',backgroundColor:pseudoBefore.backgroundColor,customSwatch:pseudoBefore.customSwatch,rect:pseudoBefore.rect});
      const overlap=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
      const swatchTextOverlap=swatches.some(s=>texts.some(t=>overlap(s.rect,t.rect))),textContainers=[button,...button.querySelectorAll('span,b,small,output,label')].filter(node=>node.clientWidth>0);
      const textOverflow=textContainers.filter(node=>node.scrollWidth>node.clientWidth+1||node.scrollHeight>node.clientHeight+1).map(node=>({tag:node.tagName,text:node.textContent.trim(),client:[node.clientWidth,node.clientHeight],scroll:[node.scrollWidth,node.scrollHeight]}));
      const textLines=new Set(texts.map(t=>Math.round(t.rect.top*2)/2)).size;
      return{width:r.width,height:r.height,fontSizes:texts.map(t=>t.fontSize),texts,textLines,wrapped:textLines>1,swatches,pseudoBefore,swatchTextOverlap,allTextContained:texts.every(t=>t.contained),textOverflow,contentFit:!swatchTextOverlap&&texts.every(t=>t.contained)&&textOverflow.length===0};
    };
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      const image = originalGetImageData.apply(this, args);
      const view = document.querySelector('#view');
      if (view && view.width > 1 && view.height > 1 && !this.canvas.isConnected && this.canvas.width === view.width && this.canvas.height === view.height) {
        window.__lastSourceFrame = { width:image.width, height:image.height, data:Array.from(image.data) };
      }
      return image;
    };
    const originalPutImageData = CanvasRenderingContext2D.prototype.putImageData;
    CanvasRenderingContext2D.prototype.putImageData = function (image, ...args) {
      if (this.canvas?.id === 'view') window.__lastRenderedFrame = { width:image.width, height:image.height, data:Array.from(image.data) };
      return originalPutImageData.call(this, image, ...args);
    };
    function paint(ctx, width, height) {
      // Portrait cityscape: multi-stop sky, separated repeated color patches,
      // tiny stars, a hard skyline, buildings, windows and a dark foreground.
      const sky = ctx.createLinearGradient(0, 0, 0, height * 0.62);
      sky.addColorStop(0, '#20315a'); sky.addColorStop(0.48, '#344e79'); sky.addColorStop(1, '#4b668a');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, width, height * 0.64);
      ctx.fillStyle = '#e5c988'; ctx.fillRect(width * 0.09, height * 0.39, width * 0.19, height * 0.075);
      ctx.fillStyle = '#273b78'; ctx.fillRect(width * 0.31, height * 0.37, width * 0.1, height * 0.12);
      ctx.fillStyle = '#e5c988'; ctx.fillRect(width * 0.44, height * 0.39, width * 0.17, height * 0.075);
      ctx.fillStyle = '#fff2c5';
      for (const [x, y, size] of [[.14,.11,3],[.31,.19,2],[.48,.08,3],[.68,.17,2],[.84,.1,3],[.91,.27,2],[.23,.28,2],[.62,.31,2]]) ctx.fillRect(width*x, height*y, size, size);
      // distant roofs and a continuous foreground ridge form recognizable boundaries.
      ctx.fillStyle = '#3c426d'; ctx.beginPath(); ctx.moveTo(0,height*.58); ctx.lineTo(width*.12,height*.52); ctx.lineTo(width*.24,height*.58); ctx.lineTo(width*.41,height*.49); ctx.lineTo(width*.57,height*.59); ctx.lineTo(width*.73,height*.51); ctx.lineTo(width*.9,height*.57); ctx.lineTo(width,height*.53); ctx.lineTo(width,height*.69); ctx.lineTo(0,height*.69); ctx.fill();
      const buildings = [
        [.02,.62,.21,.27,'#27344f'], [.25,.57,.2,.32,'#34405d'], [.48,.61,.18,.28,'#202c48'], [.69,.55,.29,.34,'#303958']
      ];
      for (const [x,y,w,h,color] of buildings) {
        ctx.fillStyle = color; ctx.fillRect(width*x,height*y,width*w,height*h);
        ctx.fillStyle = '#f2bd72';
        for (let row=0;row<4;row++) for (let col=0;col<3;col++) if ((row*7+col*3+Math.round(x*100))%4!==0) ctx.fillRect(width*(x+.035+col*.052),height*(y+.045+row*.052),Math.max(2,width*.012),Math.max(2,height*.014));
      }
      ctx.fillStyle = '#172033'; ctx.fillRect(0,height*.88,width,height*.12);
      ctx.fillStyle = '#91c8b4'; ctx.fillRect(width*.38,height*.72,width*.11,height*.16);
      ctx.fillStyle = '#f0d890'; ctx.fillRect(width*.405,height*.745,width*.03,height*.045);
    }
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 480;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(15); const track = stream.getVideoTracks()[0];
    window.__cameraTracks.push(track);
    const draw = () => paint(context, canvas.width, canvas.height);
    draw(); setInterval(draw, 100);
    navigator.mediaDevices.getSupportedConstraints = () => ({});
    navigator.mediaDevices.getUserMedia = async () => { window.__cameraRequestCount++; return stream; };
  });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'pagead2.googlesyndication.com') return route.fulfill({ contentType: 'application/javascript', body: '' });
    return url.origin === origin ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
  await page.goto(`${base}/pixel-camera.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#capture')?.dataset.action === 'capture' && !document.querySelector('#capture').disabled, null, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.ready === 'true', null, { timeout: 20000 });
  return { context, page };
}

async function waitForMerge(page) {
  await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.regionMerge === 'true' && document.querySelector('#regionMergePanel')?.getClientRects().length, null, { timeout: 5000 });
  await page.locator('#regionMergePanel').waitFor({ state: 'visible' });
}
async function beginByDoubleTap(page) {
  const point = await page.locator('#captureFrame').evaluate(node => {
    const r = node.getBoundingClientRect(); return { x: r.x + r.width * .53, y: r.y + r.height * .2 };
  });
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(90);
  await page.mouse.click(point.x, point.y);
  await waitForMerge(page);
}
async function pixels(page) {
  return page.locator('#view').evaluate(canvas => {
    const ctx = canvas.getContext('2d');
    return { width: canvas.width, height: canvas.height, data: [...ctx.getImageData(0, 0, canvas.width, canvas.height).data] };
  });
}
async function exactPixels(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#view'), frame = window.__lastRenderedFrame;
    return frame && frame.width === canvas.width && frame.height === canvas.height ? structuredClone(frame) : null;
  });
}
async function assertToolbarHome(page, viewport, route) {
  await page.waitForTimeout(260);
  const state = await page.evaluate(() => {
    const rect = (node) => { const r=node.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
    const home=[...document.querySelectorAll('#toolbarHome [data-tool]')].map(node=>{
      const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),value=node.querySelector('b'),category=node.querySelector('small'),style=getComputedStyle(node),number=v=>Number.parseFloat(v)||0;
      const content={left:r.left+number(style.borderLeftWidth)+number(style.paddingLeft),right:r.right-number(style.borderRightWidth)-number(style.paddingRight),top:r.top+number(style.borderTopWidth)+number(style.paddingTop),bottom:r.bottom-number(style.borderBottomWidth)-number(style.paddingBottom)};
      const labelRects=[value,category].filter(Boolean).map(e=>e.getBoundingClientRect()),icons=[...node.querySelectorAll('.lc-tool-sw,.lc-tool-ic')].map(e=>e.getBoundingClientRect()),overlaps=(a,b)=>a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5;
      return {tool:node.dataset.tool,visible:!!(r.width&&r.height)&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden',reachable:hit===node||node.contains(hit),valueFont:Number.parseFloat(getComputedStyle(value||node).fontSize)||0,categoryFont:Number.parseFloat(getComputedStyle(category||node).fontSize)||0,valueMetrics:value?{text:value.textContent.trim(),client:[value.clientWidth,value.clientHeight],scroll:[value.scrollWidth,value.scrollHeight],accessibleLabel:node.getAttribute('aria-label'),title:node.getAttribute('title')}:null,categoryMetrics:category?{text:category.textContent.trim(),client:[category.clientWidth,category.clientHeight],scroll:[category.scrollWidth,category.scrollHeight]}:null,labelBoxesContained:labelRects.every(q=>q.left>=content.left-1&&q.right<=content.right+1&&q.top>=content.top-1&&q.bottom<=content.bottom+1),iconTextOverlap:icons.some(icon=>labelRects.some(label=>overlaps(icon,label))),visual:window.__measureToolbarButton(node),...rect(node)};
    });
    return {
      context:document.querySelector('#pixelStudio')?.dataset.settingsContext,
      regionMerge:document.querySelector('#pixelStudio')?.dataset.regionMerge,
      toolbar:rect(document.querySelector('#toolbar')),
      frame:rect(document.querySelector('#captureFrame')),
      nav:rect(document.querySelector('.app-tabs[data-nav="five"]')),
      overflow:document.documentElement.scrollWidth>innerWidth||document.body.scrollWidth>innerWidth,
      home,
      hidden:{head:document.querySelector('#toolbarContextHead')?.hidden,more:document.querySelector('#toolbarContextMore')?.hidden,palette:getComputedStyle(document.querySelector('#regionMergePalette')).display==='none'||!document.querySelector('#regionMergePalette').getClientRects().length}
    };
  });
  assert.equal(state.regionMerge,'false',`${route}: merge state closes at ${viewport.width}`);
  assert.equal(state.context,'',`${route}: home context is restored at ${viewport.width}`);
  assert.equal(state.home.length,6,`${route}: all six home tools remain rendered`);
  for(const control of state.home) assert.ok(control.visible&&control.reachable&&control.width>=44&&control.height>=44,`${route}: home control is hidden or unreachable: ${JSON.stringify(control)}`);
  for(const control of state.home){
    assert.ok(control.categoryFont>=11&&control.valueFont>=12,`${route}: home value/category type is too small: ${JSON.stringify(control)}`);
    assert.ok(control.labelBoxesContained&&!control.iconTextOverlap,`${route}: home label boxes escape button or overlap icon/swatch: ${JSON.stringify(control)}`);
    assert.ok(!control.categoryMetrics||control.categoryMetrics.scroll.every((size,index)=>size<=control.categoryMetrics.client[index]+1),`${route}: category label is clipped: ${JSON.stringify(control)}`);
    if(control.valueMetrics?.scroll.some((size,index)=>size>control.valueMetrics.client[index]+1)){const fullLabel=`${control.valueMetrics.accessibleLabel||''} ${control.valueMetrics.title||''}`;assert.ok(control.valueMetrics.text&&fullLabel.includes(control.valueMetrics.text),`${route}: ellipsized value has no full accessible label/title: ${JSON.stringify(control)}`);}
  }
  assert.deepEqual(state.hidden,{head:true,more:true,palette:true},`${route}: context controls and merge targets are hidden on home`);
  assert.equal(state.overflow,false,`${route}: home has no horizontal overflow`);
  assert.ok(state.toolbar.height>=64,`${route}: toolbar rail is below 64px: ${JSON.stringify(state.toolbar)}`);
  const overlap=(a,b)=>a.x<b.right-1&&a.right>b.x+1&&a.y<b.bottom-1&&a.bottom>b.y+1;
  assert.ok(!overlap(state.frame,state.toolbar)&&!overlap(state.frame,state.nav),`${route}: home toolbar geometry overlaps the frame/nav: ${JSON.stringify(state)}`);
  visualMeasurements.push({viewport,route,toolbarHeight:state.toolbar.height,home:state.home});
  checks++;
}
async function cancelAndReadRestoredFrame(page) {
  return page.evaluate(() => {
    document.querySelector('#regionMergeCancel').click();
    const canvas = document.querySelector('#view');
    const data = window.__lastRenderedFrame?.data ?? Array.from(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
    return { width:canvas.width, height:canvas.height, data:Array.from(data) };
  });
}
function sameImage(a, b) { return a.width === b.width && a.height === b.height && a.data.length === b.data.length && a.data.every((value, i) => value === b.data[i]); }
function pixelAt(image, x, y) { const i = (Math.floor(y * image.height) * image.width + Math.floor(x * image.width)) * 4; return image.data.slice(i, i + 4); }
function changedSummary(before, after) {
  let count=0,minX=before.width,minY=before.height,maxX=-1,maxY=-1;
  for(let y=0;y<before.height;y++) for(let x=0;x<before.width;x++) {
    const i=(y*before.width+x)*4;
    if(before.data[i]!==after.data[i]||before.data[i+1]!==after.data[i+1]||before.data[i+2]!==after.data[i+2]) { count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y); }
  }
  return {count,bounds:count?{minX,minY,maxX,maxY}:null};
}
async function chooseTarget(page, mode, activation = 'pointer', strengthValue = '100') {
  const modeControl = page.locator('#regionMergeMode');
  if (await modeControl.count()) {
    const tag = await modeControl.evaluate(node => node.tagName.toLowerCase());
    if (tag === 'select') await modeControl.selectOption(mode);
    else await page.locator(`input[name="regionMergeMode"][value="${mode}"]`).check({ force: true });
  } else {
    await page.locator(`input[name="regionMergeMode"][value="${mode}"]`).check({ force: true });
  }
  const strength = page.locator('#regionMergeStrength');
  if (await strength.count()) await strength.evaluate((node, value) => { node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }, strengthValue);
  const swatches = page.locator('#regionMergePalette [data-target-index]');
  await swatches.first().waitFor({ state: 'visible' });
  const sourceIndex = Number(await page.locator('#pixelStudio').getAttribute('data-region-merge-source-index'));
  const targetIndex = await swatches.evaluateAll((nodes, source) => nodes.map(node => Number(node.dataset.targetIndex)).find(index => index !== source), sourceIndex);
  assert.notEqual(targetIndex, undefined, 'fixture must expose a distinct merge target color');
  const more = page.locator('#toolbarContextMore');
  if (await more.isVisible() && await page.locator('#pixelStudio').getAttribute('data-settings-expanded') !== 'true') {
    await more.click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.settingsExpanded === 'true');
  }
  const chosen = page.locator(`#regionMergePalette [data-target-index="${targetIndex}"]`);
  if (activation === 'keyboard') { await chosen.focus(); await page.keyboard.press('Enter'); }
  else await chosen.click();
  await page.waitForFunction((index) => document.querySelector(`#regionMergePalette [data-target-index="${index}"]`)?.getAttribute('aria-pressed') === 'true', targetIndex, { timeout: 3000 });
}
async function assertControlsReachable(page, viewport) {
  const more = page.locator('#toolbarContextMore');
  if (await more.isVisible() && await page.locator('#pixelStudio').getAttribute('data-settings-expanded') !== 'true') {
    await more.click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.settingsExpanded === 'true');
  }
  const contextState = await page.locator('#pixelStudio').evaluate(node => ({ settingsContext:node.getAttribute('data-settings-context'),dataset:{...node.dataset},more:{hidden:document.querySelector('#toolbarContextMore')?.hidden,text:document.querySelector('#toolbarContextMore')?.textContent,expanded:document.querySelector('#toolbarContextMore')?.getAttribute('aria-expanded')},source:document.querySelector('#regionMergePalette [aria-pressed="true"]')?.dataset.targetIndex }));
  assert.equal(contextState.settingsContext, 'merge', `region merge uses the compact context rail: ${JSON.stringify(contextState)}`);
  const selectors = '#toolbarContextBack, #toolbarContextMore, #regionMergePanel button, #regionMergePanel input[type="range"], #regionMergePanel select, #regionMergePalette [data-target-index]';
  const controls = page.locator(selectors);
  const controlCount = await controls.count();
  const reachability = [];
  for (let index=0; index<controlCount; index++) {
    const control = controls.nth(index);
    const isPaletteChoice=await control.evaluate(node=>node.matches('#regionMergePalette [data-target-index]'));
    if(isPaletteChoice)await control.evaluate(node=>node.scrollIntoView({block:'nearest',inline:'center'}));else await control.scrollIntoViewIfNeeded();
    await control.evaluate(node=>new Promise(resolve=>{const sample=()=>{const r=node.getBoundingClientRect();let port=null;for(let p=node.parentElement;p&&p!==document.body;p=p.parentElement){const s=getComputedStyle(p);if(['auto','scroll'].includes(s.overflowX)&&p.scrollWidth>p.clientWidth+1){port=p;break;}}return JSON.stringify({scrollLeft:port?.scrollLeft??0,x:r.x,y:r.y,width:r.width,height:r.height});};let previous='',stable=0;const start=performance.now();const tick=()=>{const current=sample();stable=current===previous?stable+1:0;previous=current;if((stable>=4&&performance.now()-start>=260)||performance.now()-start>1800)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
    reachability.push(await control.evaluate(node => {
      const r=node.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=x>=0&&x<innerWidth&&y>=0&&y<innerHeight?document.elementFromPoint(x,y):null;let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};const ancestors=[];
      for(let parent=node.parentElement;parent&&parent!==document.body;parent=parent.parentElement){const style=getComputedStyle(parent),p=parent.getBoundingClientRect();ancestors.push({id:parent.id,className:typeof parent.className==='string'?parent.className:'',rect:{x:p.x,y:p.y,right:p.right,bottom:p.bottom},overflowX:style.overflowX,overflowY:style.overflowY,scrollLeft:parent.scrollLeft,scrollWidth:parent.scrollWidth,clientWidth:parent.clientWidth});if(['auto','scroll','hidden','clip'].includes(style.overflowX)){clip.left=Math.max(clip.left,p.left);clip.right=Math.min(clip.right,p.right);}if(['auto','scroll','hidden','clip'].includes(style.overflowY)){clip.top=Math.max(clip.top,p.top);clip.bottom=Math.min(clip.bottom,p.bottom);}}
      return { id:node.id || node.name || node.tagName, isChoice:node.matches('#regionMergePalette button,.lc-row button'),isPanelAction:node.tagName==='BUTTON'&&Boolean(node.closest('#regionMergePanel')), width:r.width, height:r.height, inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight, center:{x,y},visibleRect:{left:Math.max(r.left,clip.left),top:Math.max(r.top,clip.top),right:Math.min(r.right,clip.right),bottom:Math.min(r.bottom,clip.bottom)},hit:hit?{tag:hit.tagName,id:hit.id,className:typeof hit.className==='string'?hit.className:'',text:hit.textContent.trim().slice(0,80)}:null,reachable:hit===node||node.contains(hit),ancestors,visual:window.__measureToolbarButton(node) };
    }));
  }
  const layout = await page.evaluate((selectors) => ({
    overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
    controls: [...document.querySelectorAll(selectors)].map(node => {
      const r=node.getBoundingClientRect(); let clip={left:0,top:0,right:innerWidth,bottom:innerHeight};
      for(let parent=node.parentElement;parent&&parent!==document.body;parent=parent.parentElement){const style=getComputedStyle(parent),p=parent.getBoundingClientRect();if(['auto','scroll','hidden','clip'].includes(style.overflowX)){clip.left=Math.max(clip.left,p.left);clip.right=Math.min(clip.right,p.right);}if(['auto','scroll','hidden','clip'].includes(style.overflowY)){clip.top=Math.max(clip.top,p.top);clip.bottom=Math.min(clip.bottom,p.bottom);}}
      const visibleRect={x:Math.max(r.left,clip.left),y:Math.max(r.top,clip.top),right:Math.min(r.right,clip.right),bottom:Math.min(r.bottom,clip.bottom)};
      visibleRect.width=Math.max(0,visibleRect.right-visibleRect.x);visibleRect.height=Math.max(0,visibleRect.bottom-visibleRect.y);
      return { id:node.id || node.name || node.tagName, x:r.x, y:r.y, right:r.right, bottom:r.bottom, width:r.width, height:r.height, visibleRect };
    }),
    panel: document.querySelector('#regionMergePanel')?.getBoundingClientRect().toJSON(),
    header: (()=>{const nodes=['#regionMergePanel','.lc-region-merge-head','.lc-region-merge-head > div','.lc-region-merge-head h2','.lc-region-merge-head p','#regionMergeCancel','.lc-region-merge-field','#regionMergeMode'];const result={};for(const s of nodes){const n=document.querySelector(s);if(!n){result[s]=null;continue;}const r=n.getBoundingClientRect(),c=getComputedStyle(n);result[s]={rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},display:c.display,position:c.position,gridTemplateColumns:c.gridTemplateColumns,gridColumn:c.gridColumn,flex:c.flex,minWidth:c.minWidth,maxWidth:c.maxWidth,width:c.width,scrollWidth:n.scrollWidth,clientWidth:n.clientWidth,overflowX:c.overflowX,parent:n.parentElement?{tag:n.parentElement.tagName,id:n.parentElement.id,className:n.parentElement.className}:null};}return result;})(),
    headerText:(()=>{const header=document.querySelector('.lc-region-merge-head'),cancel=document.querySelector('#regionMergeCancel'),nodes=['.lc-region-merge-head h2','.lc-region-merge-head p'].map(s=>document.querySelector(s)).filter(Boolean),rects=nodes.flatMap(node=>{const range=document.createRange();range.selectNodeContents(node);return [...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom,text:node.textContent.trim(),fontSize:Number.parseFloat(getComputedStyle(node).fontSize)||0}));}),cr=cancel?.getBoundingClientRect(),overlaps=rects.some(r=>cr&&r.x<cr.right-.5&&r.right>cr.left+.5&&r.y<cr.bottom-.5&&r.bottom>cr.top+.5);return{header:header?.getBoundingClientRect().toJSON()??null,textRects:rects,cancel:cr?.toJSON()??null,overlapsCancel:overlaps};})(),
    regionRules:[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].filter(rule=>rule.selectorText&&/region-merge-(head|field|cancel)/i.test(rule.selectorText)).map(rule=>({selector:rule.selectorText,css:rule.style.cssText}));}catch{return [];}}),
    toolbar: document.querySelector('#toolbar')?.getBoundingClientRect().toJSON(),
    frame:document.querySelector('#captureFrame')?.getBoundingClientRect().toJSON(),
    nav:document.querySelector('.app-tabs[data-nav="five"]')?.getBoundingClientRect().toJSON(),
    visibleHelpers:['#regionMergePanel','#regionMergePalette','.lc-palette-strip','.lc-color-slider'].map(selector=>{const node=document.querySelector(selector),style=node&&getComputedStyle(node),r=node?.getBoundingClientRect();return{selector,visible:!!node&&!!r?.width&&!!r?.height&&!node.hidden&&style.display!=='none'&&style.visibility!=='hidden',rect:r?.toJSON()??null};}).filter(item=>item.visible)
  }), selectors);
  assert.equal(layout.overflow, false, `horizontal page overflow ${viewport.width}: ${JSON.stringify(layout)}`);
  for (const control of reachability) {
    assert.ok(control.width >= 44 && control.height >= 44, `control under 44px: ${JSON.stringify(control)}`);
    assert.ok(control.inside && control.reachable, `control not reachable: ${JSON.stringify(control)}`);
    if(control.isChoice){assert.ok(control.width>=44&&control.height>=48,`choice under 48px: ${JSON.stringify(control)}`);assert.ok(control.visual.fontSizes.every(size=>size>=12),`choice label below 12px: ${JSON.stringify(control)}`);assert.ok(control.visual.contentFit,`choice label is clipped or overlaps its swatch: ${JSON.stringify(control)}`);}
    if(control.isPanelAction){assert.ok(control.visual.contentFit,`region action label escapes button padding or overlaps its swatch: ${JSON.stringify(control)}`);if(control.visual.wrapped){await writeFile(`${out}/camera-region-merge-action-wrap-${viewport.width}.json`,JSON.stringify({viewport,control,layout},null,2));await page.screenshot({path:`${out}/camera-region-merge-action-wrap-${viewport.width}.png`});}assert.ok(!control.visual.wrapped,`region action label wraps onto multiple lines: ${JSON.stringify(control)}`);}
  }
  assert.ok(!layout.headerText.overlapsCancel,`region merge header text overlaps its cancel action: ${JSON.stringify(layout.headerText)}`);
  if (layout.toolbar && layout.panel) {
    const overlap = layout.panel.left < layout.toolbar.right - 1 && layout.panel.right > layout.toolbar.left + 1 && layout.panel.top < layout.toolbar.bottom - 1 && layout.panel.bottom > layout.toolbar.top + 1;
    assert.equal(overlap, false, `merge controls overlap compact toolbar: ${JSON.stringify(layout)}`);
  }
  for (let i=0;i<layout.controls.length;i++) for (let j=i+1;j<layout.controls.length;j++) {
    const a=layout.controls[i], b=layout.controls[j];
    if(a.visibleRect.width===0||a.visibleRect.height===0||b.visibleRect.width===0||b.visibleRect.height===0) continue;
    const x=a.visibleRect,y=b.visibleRect;
    const separated=x.right <= y.x || y.right <= x.x || x.bottom <= y.y || y.bottom <= x.y;
    if(!separated){
      await writeFile(`${out}/camera-region-merge-layout-failure-${viewport.width}.json`,JSON.stringify({viewport,layout,controls:[a,b]},null,2));
      await page.screenshot({path:`${out}/camera-region-merge-layout-failure-${viewport.width}.png`});
    }
    assert.ok(separated, `visible controls overlap: ${a.id} ${JSON.stringify(x)}, ${b.id} ${JSON.stringify(y)}`);
  }
  assert.ok(layout.toolbar.height>=64,`merge toolbar rail below 64px: ${JSON.stringify(layout.toolbar)}`);
  const frameOverlap=(a,b)=>a&&b&&a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
  for(const helper of layout.visibleHelpers)assert.ok(!frameOverlap(layout.frame,helper.rect),`preview overlaps visible merge/helper control ${helper.selector}: ${JSON.stringify({frame:layout.frame,helper})}`);
  visualMeasurements.push({viewport,context:'merge',toolbarHeight:layout.toolbar.height,panel:layout.panel,headerText:layout.headerText,frame:layout.frame,visibleHelpers:layout.visibleHelpers,controls:reachability});
  if (viewport.width <= 390) {
    const scrollState = await page.locator('#regionMergePanel').evaluate(node => ({ top:node.scrollTop, max:node.scrollHeight-node.clientHeight, rect:node.getBoundingClientRect().toJSON() }));
    if (scrollState.max > 0) {
      await page.mouse.move(scrollState.rect.x + scrollState.rect.width / 2, scrollState.rect.y + scrollState.rect.height / 2);
      await page.mouse.wheel(0, 240);
      await page.waitForFunction(() => document.querySelector('#regionMergePanel').scrollTop > 0, null, { timeout: 1500 });
      await page.locator('#regionMergePanel').evaluate(node => { node.scrollTop = 0; });
      checks++;
    }
  }
  return layout;
}

try {
  for (const viewport of viewports) {
    const { context, page } = await newPage(viewport);
    const root = page.locator('#pixelStudio');
    const stage = page.locator('#stage');
    const view = page.locator('#view');
    const frameCounter = () => root.getAttribute('data-preview-frames');
    await page.waitForFunction(()=>document.querySelector('#gestureHint')?.hidden===true,null,{timeout:6500});
    await assertToolbarHome(page, viewport, 'initial home');
    await page.screenshot({path:`${out}/region-home-${viewport.width}.png`});

    // A normal stage tap and a small short drag remain ordinary gestures.
    await view.click({ position: { x: 0.5 * (await view.boundingBox()).width, y: 0.5 * (await view.boundingBox()).height } });
    assert.notEqual(await root.getAttribute('data-region-merge'), 'true'); checks++;
    const beforeDrag = Number(await frameCounter());
    const viewBox = await view.boundingBox();
    await page.mouse.move(viewBox.x + viewBox.width * .45, viewBox.y + viewBox.height * .5); await page.mouse.down();
    await page.mouse.move(viewBox.x + viewBox.width * .45 + 15, viewBox.y + viewBox.height * .5 + 2, { steps: 3 }); await page.mouse.up();
    await page.waitForTimeout(300);
    assert.notEqual(await root.getAttribute('data-region-merge'), 'true');
    assert.ok(Number(await frameCounter()) > beforeDrag, 'short drag returns to the running preview'); checks++;

    // Two real touch points compete before the hold threshold and cancel it.
    const touchPoint = await view.evaluate(node => { const r=node.getBoundingClientRect(); return {x:r.x+r.width*.53,y:r.y+r.height*.2}; });
    const cdp = await context.newCDPSession(page);
    const a = { id:1, x:touchPoint.x-24, y:touchPoint.y, radiusX:4, radiusY:4, force:1 };
    const b = { id:2, x:touchPoint.x+24, y:touchPoint.y, radiusX:4, radiusY:4, force:1 };
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[a] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[a,b] });
    await cdp.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{...a,x:a.x-8},{...b,x:b.x+8}] });
    await page.waitForTimeout(650);
    assert.notEqual(await root.getAttribute('data-region-merge'), 'true', 'competing touch pointers cancel the hold');
    await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
    await cdp.detach(); checks++;

    // The primary entrance is a real double-tap. Its selected source is marked in the palette.
    await beginByDoubleTap(page);
    const sourceIndex = Number(await root.getAttribute('data-region-merge-source-index'));
    const sourceSwatch = page.locator(`#regionMergePalette [data-target-index="${sourceIndex}"]`);
    assert.equal(await sourceSwatch.getAttribute('data-source'), 'true', 'the live source color is visibly identified on open');
    assert.equal(await sourceSwatch.getAttribute('aria-pressed'), 'false', 'source identification does not imply a target selection');
    const layout = await assertControlsReachable(page, viewport);
    if (viewport.width === 320) {
      const requestsBeforeResize = await page.evaluate(() => window.__cameraRequestCount);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(120);
      assert.equal(await root.getAttribute('data-region-merge'), 'true', 'merge stays open across a narrow viewport resize');
      assert.equal(await root.getAttribute('data-settings-context'), 'merge', 'merge context stays selected across resize');
      assert.equal(await page.evaluate(() => window.__cameraRequestCount), requestsBeforeResize, 'resize does not restart the camera');
      await assertControlsReachable(page, { width: 390, height: 844 });
      await page.setViewportSize(viewport);
      await page.waitForTimeout(120);
      assert.equal(await root.getAttribute('data-region-merge'), 'true', 'merge remains active after restoring the compact viewport');
      checks++;
    }
    await page.locator('#regionMergePanel').evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: `${out}/camera-region-merge-before-${viewport.width}.png` });
    if (viewport.width === 1280) await view.screenshot({ path: `${out}/camera-region-merge-view-before.png` });
    const source = await pixels(page);
    const liveAt = Number(await frameCounter());
    await page.waitForFunction((old) => Number(document.querySelector('#pixelStudio')?.dataset.previewFrames) >= old + 10, liveAt, { timeout: 10000 });
    assert.equal(await root.getAttribute('data-region-merge'), 'true', 'live tracker remains active while new frames are published'); checks++;
    await chooseTarget(page, 'surface', 'pointer', '55');
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.regionMerge === 'true', null, { timeout: 5000 });
    await page.waitForTimeout(100);
    const surface55 = await pixels(page);
    const rawSource = await page.evaluate(() => window.__lastSourceFrame);
    const surface55Diagnostics = {
      viewport, rendered:{width:source.width,height:source.height}, rawSource:rawSource&&{width:rawSource.width,height:rawSource.height},
      strength:'55', sourceIndex:await root.getAttribute('data-region-merge-source-index'), targetIndex:await page.locator('#regionMergePalette [aria-pressed="true"]').getAttribute('data-target-index'),
      changed:changedSummary(source,surface55), regionStatus:await page.locator('#regionMergeStatus').textContent(),
      samples:[.2,.45,.52,.58,.62,.68,.72,.77,.82,.88,.93,.97].map(y=>({x:.43,y,source:rawSource?pixelAt(rawSource,.43,y):null,before:pixelAt(source,.43,y),after:pixelAt(surface55,.43,y)})),
      seedSample:{x:.53,y:.2,source:rawSource?pixelAt(rawSource,.53,.2):null,before:pixelAt(source,.53,.2),after:pixelAt(surface55,.53,.2)}
    };
    await page.screenshot({ path: `${out}/camera-region-merge-after-strength55-${viewport.width}.png` });
    if (viewport.width === 1280) await view.screenshot({ path: `${out}/camera-region-merge-view-after-strength55.png` });
    console.log(`region-merge strength55 diagnostic ${JSON.stringify(surface55Diagnostics)}`);
    assert.ok(!sameImage(source, surface55), `surface target must change canvas pixels at strength 55 (${viewport.width})`);
    if (!process.env.PIXIEED_REGION_MERGE_DIAGNOSTIC) {
      assert.notDeepEqual(pixelAt(surface55, .43, .50), pixelAt(source, .43, .50), 'selected sky changes at strength 55');
      assert.deepEqual(pixelAt(surface55, .43, .58), pixelAt(source, .43, .58), 'ridge pixels remain unchanged at strength 55');
      assert.deepEqual(pixelAt(surface55, .43, .77), pixelAt(source, .43, .77), 'building pixels remain unchanged at strength 55');
    } checks++;
    await page.locator('#regionMergeUndo').click();
    assert.ok(sameImage(await pixels(page), source), 'undo restores the exact pre-merge baseline'); checks++;

    await chooseTarget(page, 'surface', 'pointer', '100');
    await page.waitForTimeout(100);
    const surface = await pixels(page);
    const surface100Diagnostics = { viewport, strength:'100', changed:changedSummary(source,surface), regionStatus:await page.locator('#regionMergeStatus').textContent(), buildingRaw:rawSource?pixelAt(rawSource,.43,.77):null, buildingBefore:pixelAt(source,.43,.77), buildingAfter:pixelAt(surface,.43,.77) };
    await page.screenshot({ path: `${out}/camera-region-merge-after-strength100-${viewport.width}.png` });
    if (viewport.width === 1280) await view.screenshot({ path: `${out}/camera-region-merge-view-after-strength100.png` });
    console.log(`region-merge strength100 diagnostic ${JSON.stringify(surface100Diagnostics)}`);
    assert.ok(!sameImage(source, surface), `surface target must change canvas pixels at strength 100 (${viewport.width})`);
    if (!process.env.PIXIEED_REGION_MERGE_DIAGNOSTIC) {
      assert.notDeepEqual(pixelAt(surface, .43, .50), pixelAt(source, .43, .50), 'selected sky changes at strength 100');
      assert.deepEqual(pixelAt(surface, .43, .58), pixelAt(source, .43, .58), 'ridge pixels remain unchanged at strength 100');
      assert.deepEqual(pixelAt(surface, .43, .77), pixelAt(source, .43, .77), 'building pixels remain unchanged at strength 100');
    } checks++;
    if (viewport.width === 1280) {
      const crop = (image, cx, cy) => {
        const x = Math.floor(cx * image.width), y = Math.floor(cy * image.height), points = [];
        for (let yy=Math.max(0,y-2); yy<=Math.min(image.height-1,y+2); yy++) for (let xx=Math.max(0,x-2); xx<=Math.min(image.width-1,x+2); xx++) points.push({x:xx,y:yy,rgba:pixelAt(image,(xx+.5)/image.width,(yy+.5)/image.height)});
        return {center:{x,y},points};
      };
      await writeFile(`${out}/camera-region-merge-raw-fixture-1280.json`, JSON.stringify({ viewport, dimensions:{width:source.width,height:source.height}, sourceIndex:surface55Diagnostics.sourceIndex, targetIndex:surface55Diagnostics.targetIndex, rawSource, baseline:source, surface55, surface100:surface, crops:{sky:crop(rawSource || source,.43,.50),ridge:crop(rawSource || source,.43,.58),building:crop(rawSource || source,.43,.77)} }, null, 2));
    }
    await page.locator('#regionMergeUndo').click();
    assert.ok(sameImage(await pixels(page), source), 'undo restores the exact pre-merge baseline'); checks++;

    // Cancel restores the baseline and resumes camera frames; the M shortcut is a second entrance.
    await chooseTarget(page, 'color');
    await page.waitForTimeout(100);
    assert.ok(!sameImage(await pixels(page), source), 'color mode changes the selected sky region'); checks++;
    const restored = await cancelAndReadRestoredFrame(page);
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.regionMerge === 'false');
    assert.ok(sameImage(restored, source), 'cancel restores the latest raw frame for this static synthetic scene');
    await assertToolbarHome(page, viewport, 'cancel button');
    const afterCancel = Number(await frameCounter());
    await page.waitForFunction((old) => Number(document.querySelector('#pixelStudio')?.dataset.previewFrames) > old, afterCancel, { timeout: 5000 }); checks++;
    await stage.focus(); await page.keyboard.press('m'); await waitForMerge(page); checks++;
    const keyboardBaseline = await pixels(page);
    await chooseTarget(page, 'surface', 'keyboard');
    assert.ok(!sameImage(await pixels(page), keyboardBaseline), 'keyboard activation applies the focused target color'); checks++;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.regionMerge === 'false');
    assert.ok(sameImage(await pixels(page), keyboardBaseline), 'Escape cancels and restores the latest raw frame for this static synthetic scene'); checks++;
    await assertToolbarHome(page, viewport, 'Escape');
    await page.waitForFunction((old) => Number(document.querySelector('#pixelStudio')?.dataset.previewFrames) > old, Number(await frameCounter()), { timeout: 5000 });
    await beginByDoubleTap(page);
    const backBaseline = await pixels(page);
    await chooseTarget(page, 'surface');
    assert.ok(!sameImage(await pixels(page), backBaseline), 'back-route checkpoint has a real merge edit');
    await page.locator('#toolbarContextBack').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.regionMerge === 'false' && document.querySelector('#pixelStudio')?.dataset.settingsContext === '');
    assert.ok(sameImage(await pixels(page), backBaseline), 'context back restores the latest raw frame for this static synthetic scene');
    await assertToolbarHome(page, viewport, 'context back');
    await page.waitForFunction((old) => Number(document.querySelector('#pixelStudio')?.dataset.previewFrames) > old, Number(await frameCounter()), { timeout: 5000 });
    // Double-tap is the primary entrance. Keep a color edit active for capture/PXD verification.
    await beginByDoubleTap(page);
    const captureBaseline = await pixels(page);
    await chooseTarget(page, 'color');
    await page.waitForTimeout(100);
    const edited = await pixels(page);
    const editedState = await exactPixels(page);
    assert.ok(editedState, 'capture source ImageData is observed');
    assert.ok(!sameImage(edited, captureBaseline), 'double-tap target edit changes the current still'); checks++;
    if (viewport.width === 390) await page.screenshot({ path: `${out}/camera-region-merge-after.png` });

    // Capture through the existing camera button; PXD local storage must contain those edited pixels.
    await page.locator('#capture').click();
    await page.waitForFunction(() => document.querySelector('#pixelStudio')?.dataset.mode === 'captured', null, { timeout: 15000 });
    const saved = await page.evaluate(async ({ before, after }) => {
      const storeModule = await import('/js/creation/pxd-store.mjs');
      const imageModule = await import('/js/creation/pxd-project.mjs');
      const sharedModule = await import('/js/creation/shared-image.mjs');
      let pointer=null;
      for(let attempt=0;attempt<60;attempt++){
        pointer=JSON.parse(localStorage.getItem('pixieed:pxd:last:camera')||'null');
        if(pointer?.projectId&&pointer?.revisionId){
          try{
            const project=await storeModule.createPxdStore().load(pointer.projectId,pointer.revisionId),image=await imageModule.readPxdSharedImage(project);
            if(image){const prepare=rgba=>sharedModule.prepareSharedCanvasImage({width:after.width,height:after.height,rgba:Uint8Array.from(rgba)},{passActive:true,width:image.width,height:image.height,maxColors:32}).image.rgba;const expectedBefore=prepare(before.data),expectedAfter=prepare(after.data);let changedIndex=-1;for(let i=0;i<expectedAfter.length;i+=4)if(expectedBefore[i]!==expectedAfter[i]||expectedBefore[i+1]!==expectedAfter[i+1]||expectedBefore[i+2]!==expectedAfter[i+2]){changedIndex=i;break;}return {pointer,width:image.width,height:image.height,rgba:Array.from(image.rgba),expected:Array.from(expectedAfter),changedIndex};}
          }catch{}
        }
        await new Promise(resolve=>setTimeout(resolve,250));
      }
      return {diagnostic:'camera PXD shared image did not become readable',pointer,storageKeys:Object.keys(localStorage)};
    }, { before:captureBaseline, after:editedState });
    assert.ok(saved?.width && saved?.height, 'captured PXD has a shared image');
    assert.equal(saved.width, edited.width, 'saved PXD image retains the edited width');
    assert.equal(saved.height, edited.height, 'saved PXD image retains the edited height');
    assert.ok(saved.changedIndex >= 0, 'fixture edit must survive shared-image preparation');
    assert.deepEqual(saved.rgba, saved.expected, 'PXD shared image matches every pixel of the prepared edited still'); checks++;
    if (saved.expected.length === edited.data.length && saved.expected.every((value, index) => value === edited.data[index])) assert.deepEqual(saved.rgba, edited.data, 'PXD stores the complete edited still');

    const panelLayout = layout.panel;
    console.log(`camera region merge ${viewport.width}x${viewport.height}: PASS; responsive controls ${layout.controls.length}; panel=${panelLayout.width.toFixed(0)}x${panelLayout.height.toFixed(0)}`);
    await context.close();
  }
  assert.deepEqual(errors, [], 'no browser page errors');
  await writeFile(`${out}/region-results.json`,JSON.stringify({checks,viewports,sourceHashes,measurements:visualMeasurements,errors},null,2));
  console.log(`Camera region merge: ${checks}/${checks} PASS; synthetic canvas camera only; live camera, Safari, physical devices, tracking and production UNTESTED; screenshots: ${out}`);
} finally {
  await browser.close();
}
