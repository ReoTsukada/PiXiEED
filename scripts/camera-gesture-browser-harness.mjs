#!/usr/bin/env node
/** Focused synthetic-camera acceptance for tap repick/focus and long-press region merge. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'only the local camera server is allowed');
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const out = '/tmp/pixieed-camera-gestures-20261004';
await mkdir(out, { recursive: true });
const errors = [];
const checks = [];
const sourceHashes = {};
for (const file of ['pixel-camera.html','css/pixel-lens-camera.css','js/pixel-lens/app.mjs','js/pixel-lens/zoom.mjs','js/pixel-lens/focus.mjs','scripts/camera-gesture-browser-harness.mjs']) {
  try { sourceHashes[file] = createHash('sha256').update(await readFile(new URL(`../${file}`, import.meta.url))).digest('hex'); } catch { sourceHashes[file] = 'pending'; }
}

const viewports = [{ width:390, height:844 }, { width:844, height:390 }];

async function openPage(viewport, focusSupported, focusRejected = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor:1, hasTouch:true });
  await context.addInitScript(({ focusSupported, focusRejected }) => {
    window.__cameraRequestCount = 0;
    window.__cameraTrackMocks = [];
    window.__focusConstraintCalls = [];
    window.__focusApplyRejected = focusRejected;
    window.__singleTapMessages = [];
    const camera = document.createElement('canvas'); camera.width=320; camera.height=480;
    const cameraContext = camera.getContext('2d'); let frame=0;
    function paint() {
      const gradient=cameraContext.createLinearGradient(0,0,0,camera.height);
      gradient.addColorStop(0,'#20315a'); gradient.addColorStop(.52,'#547b9a'); gradient.addColorStop(1,'#d0a46f');
      cameraContext.fillStyle=gradient; cameraContext.fillRect(0,0,camera.width,camera.height);
      cameraContext.fillStyle='#273b78'; cameraContext.fillRect(72+(frame%12),140,86,92);
      cameraContext.fillStyle='#fff2c5'; cameraContext.fillRect(230,68,5,5);
      cameraContext.fillStyle='#34405d'; cameraContext.fillRect(0,320,camera.width,160); frame++;
    }
    paint(); setInterval(paint,100);
    navigator.mediaDevices.getSupportedConstraints=()=>({ zoom:false, focusMode:true, pointsOfInterest:true });
    navigator.mediaDevices.getUserMedia=async constraints=>{
      window.__cameraRequestCount++;
      const stream=camera.captureStream(15),track=stream.getVideoTracks()[0];
      const facing=constraints?.video?.facingMode?.ideal||'environment';
      const capabilities=focusSupported?{focusMode:['single-shot','continuous'],pointsOfInterest:true}:{};
      const settings={width:camera.width,height:camera.height,facingMode:facing};
      const record={facing,capabilities,settings}; window.__cameraTrackMocks.push(record);
      Object.defineProperty(track,'getCapabilities',{configurable:true,value:()=>structuredClone(capabilities)});
      Object.defineProperty(track,'getSettings',{configurable:true,value:()=>structuredClone(settings)});
      Object.defineProperty(track,'getConstraints',{configurable:true,value:()=>({})});
      Object.defineProperty(track,'applyConstraints',{configurable:true,value:async value=>{window.__focusConstraintCalls.push({facing,constraints:structuredClone(value)});if(window.__focusApplyRejected)throw new Error('mock focus rejected');if(value.focusMode)settings.focusMode=value.focusMode;if(value.pointsOfInterest)settings.pointsOfInterest=structuredClone(value.pointsOfInterest);}});
      return stream;
    };
  }, { focusSupported, focusRejected });
  await context.route('**/*', route => {
    const url=new URL(route.request().url());
    if(url.hostname==='pagead2.googlesyndication.com') return route.fulfill({ contentType:'application/javascript', body:'' });
    return url.origin===origin ? route.continue() : route.abort();
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(`${viewport.width}x${viewport.height}: ${error.message}`));
  await page.goto(`${base}/pixel-camera.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#capture')?.dataset.action==='capture'&&!document.querySelector('#capture').disabled,null,{timeout:20000});
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.ready==='true',null,{timeout:20000});
  await page.waitForFunction(()=>document.querySelector('#gestureHint')?.hidden===true,null,{timeout:6000});
  await page.evaluate(()=>{
    window.__gestureMessages=[];
    window.__mergeSeedLog=[];
    const node=document.querySelector('#stageMsg');
    if(node){const record=()=>{const text=node.textContent.trim();if(text)window.__gestureMessages.push(text);};new MutationObserver(record).observe(node,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});}
    const root=document.querySelector('#pixelStudio');
    if(root)new MutationObserver(()=>{if(root.dataset.regionMerge==='true')window.__mergeSeedLog.push({x:root.dataset.regionMergeSeedX,y:root.dataset.regionMergeSeedY,time:performance.now()});}).observe(root,{attributes:true,attributeFilter:['data-region-merge','data-region-merge-seed-x','data-region-merge-seed-y']});
  });
  return { context, page };
}

async function livePoint(page, x=.73, y=.37) {
  return page.locator('#view').evaluate((view,{x,y})=>{const r=view.getBoundingClientRect();return{x:r.left+r.width*x,y:r.top+r.height*y,rect:{left:r.left,top:r.top,width:r.width,height:r.height},canvas:{width:view.width,height:view.height}};},{x,y});
}

async function longPress(page, point) {
  await page.mouse.move(point.x,point.y);
  await page.mouse.down();
  await page.waitForTimeout(640);
  await page.mouse.up();
}

async function cameraState(page) {
  return page.evaluate(()=>{
    const root=document.querySelector('#pixelStudio'),view=document.querySelector('#view'),video=document.querySelector('#video'),frame=document.querySelector('#captureFrame');
    const rect=frame.getBoundingClientRect();
    const toolbar=document.querySelector('#toolbar')?.getBoundingClientRect();
    return {mode:root.dataset.mode,settingsContext:root.dataset.settingsContext,regionMerge:root.dataset.regionMerge,facing:root.dataset.facing,focusStatus:root.dataset.focusStatus,focus:{x:root.dataset.focusX,y:root.dataset.focusY},paletteEpoch:Number(root.dataset.paletteEpoch||0),zoomStops:[...document.querySelectorAll('#zoomStops [data-zoom]')].map(node=>({zoom:node.dataset.zoom,pressed:node.getAttribute('aria-pressed'),hidden:node.hidden})),seed:{x:root.dataset.regionMergeSeedX,y:root.dataset.regionMergeSeedY},seedLog:structuredClone(window.__mergeSeedLog||[]),canvas:{width:view.width,height:view.height},video:{width:video.videoWidth,height:video.videoHeight},frame:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},toolbar:toolbar?{x:toolbar.x,y:toolbar.y,width:toolbar.width,height:toolbar.height}:null,focusCalls:structuredClone(window.__focusConstraintCalls),tracks:structuredClone(window.__cameraTrackMocks),messages:structuredClone(window.__gestureMessages||[]),toast:{text:document.querySelector('#stageMsg').textContent.trim(),visible:!document.querySelector('#stageMsg').hidden},marker:(()=>{const node=document.querySelector('#focusMarker');return node?{state:node.dataset.focusState,hidden:node.hidden,rect:node.getBoundingClientRect().toJSON()}:null})()};
  });
}

async function assertNoHoldAction(page, beforeCalls, label) {
  await page.waitForTimeout(380);
  const state=await cameraState(page);
  assert.notEqual(state.regionMerge,'true',`${label}: gesture unexpectedly opened region merge`);
  assert.equal(state.focusCalls.length,beforeCalls,`${label}: gesture unexpectedly requested focus`);
  assert.notEqual(state.toast.text,'今の景色から色を選び直しました',`${label}: gesture leaked into the single-tap action`);
  assert.equal(await page.locator('#captureFrame').evaluate(node=>node.classList.contains('lc-repick')),false,`${label}: single-tap repick animation fired`);
  checks.push({name:`${label} suppresses hold/single-tap actions`,pass:true});
}

async function chooseZoom(page, value) {
  await page.locator('#toolbar [data-tool="zoom"]').click();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.settingsContext==='zoom');
  const stop=page.locator(`#zoomStops [data-zoom="${value}"]`);
  if(await stop.getAttribute('hidden')!==null){await page.locator('#toolbarContextMore').click();await page.waitForFunction(()=>!document.querySelector('#zoomStops [data-zoom="2"]')?.hidden);}
  await stop.click();
  await page.locator('#toolbarContextBack').click();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.settingsContext==='');
  await page.waitForFunction(value=>document.querySelector('#zoomStops [aria-pressed="true"]')?.dataset.zoom===String(value),value);
}

function expectedFocus({ clientX,clientY,rect,videoWidth,videoHeight,frameWidth,frameHeight,digitalZoom,facing }) {
  const frameAspect=frameWidth/frameHeight,videoAspect=videoWidth/videoHeight;
  const full=videoAspect>frameAspect
    ? {sx:(videoWidth-videoHeight*frameAspect)/2,sy:0,sw:videoHeight*frameAspect,sh:videoHeight}
    : {sx:0,sy:(videoHeight-videoWidth/frameAspect)/2,sw:videoWidth,sh:videoWidth/frameAspect};
  const sw=full.sw/digitalZoom,sh=full.sh/digitalZoom;
  const crop={sx:full.sx+(full.sw-sw)/2,sy:full.sy+(full.sh-sh)/2,sw,sh};
  const previewX=(clientX-rect.left)/rect.width,previewY=(clientY-rect.top)/rect.height;
  const cameraX=facing==='user'?1-previewX:previewX;
  return {x:(crop.sx+cameraX*crop.sw)/videoWidth,y:(crop.sy+previewY*crop.sh)/videoHeight};
}

async function assertFocusRequest(page, point, facing, name) {
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.focusStatus==='requested'&&window.__focusConstraintCalls?.length>0,null,{timeout:3000});
  const state=await cameraState(page);
  assert.notEqual(state.regionMerge,'true',`${name}: long-press opened region merge`);
  // Tap focus is deliberately quiet; the accepted track constraint is the observable contract.
  const call=state.focusCalls.at(-1);
  assert.ok(call,`${name}: mocked track did not receive applyConstraints`);
  assert.equal(call.facing,facing,`${name}: focus applied to the wrong camera track`);
  assert.equal(call.constraints.focusMode,'single-shot',`${name}: focus mode is not supported single-shot`);
  assert.equal(call.constraints.pointsOfInterest?.length,1,`${name}: point-of-interest constraint missing`);
  const input=await page.evaluate(({x,y})=>{const view=document.querySelector('#view'),video=document.querySelector('#video'),r=view.getBoundingClientRect(),root=document.querySelector('#pixelStudio');return{clientX:x,clientY:y,rect:{left:r.left,top:r.top,width:r.width,height:r.height},videoWidth:video.videoWidth,videoHeight:video.videoHeight,frameWidth:view.width,frameHeight:view.height,facing:root.dataset.facing};},{x:point.x,y:point.y});
  const expected=expectedFocus({...input,digitalZoom:2});
  const actual=call.constraints.pointsOfInterest[0];
  assert.ok(Math.abs(actual.x-expected.x)<.002&&Math.abs(actual.y-expected.y)<.002,`${name}: POI does not map preview crop/mirror coordinates: ${JSON.stringify({input,expected,actual})}`);
  checks.push({name,pass:true,expected,actual,request:call});
  return {state,input,expected,actual,request:call};
}

async function setPointAndHold(page,x,y) {
  const point=await livePoint(page,x,y);
  await longPress(page,point);
  return point;
}

async function cancelMerge(page) {
  await page.locator('#regionMergeCancel').click();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='false');
}

async function assertNoActionAfterGesture(page, context, label) {
  await page.waitForTimeout(650);
  const state=await cameraState(page);
  assert.notEqual(state.regionMerge,'true',`${label}: merge unexpectedly opened`);
  assert.equal(state.focusCalls.length,context.focusCalls,`${label}: focus unexpectedly requested`);
  assert.notEqual(state.toast.text,'今の景色から色を選び直しました',`${label}: a single tap leaked from the gesture`);
  assert.equal(await page.locator('#captureFrame').evaluate(node=>node.classList.contains('lc-repick')),false,`${label}: repick animation fired`);
  checks.push({name:`${label} suppresses focus, merge, and single-tap`,pass:true});
}

async function waitForClearToast(page) {
  await page.waitForFunction(()=>document.querySelector('#stageMsg')?.hidden===true,null,{timeout:5000}).catch(()=>{});
  await page.evaluate(()=>{window.__gestureMessages=[];});
}

async function assertNoSingleTap(page,label) {
  await page.waitForTimeout(380);
  const state=await cameraState(page);
  assert.equal(state.messages.some(text=>text.includes('景色から色を選び直しました')),false,`${label}: single-tap refresh fired`);
  assert.equal(await page.locator('#captureFrame').evaluate(node=>node.classList.contains('lc-repick')),false,`${label}: repick animation fired`);
  checks.push({name:`${label} suppresses single-tap refresh`,pass:true,messages:state.messages});
}

async function assertSeedMatches(page, point, viewport) {
  const state=await cameraState(page);
  const expected={x:Math.floor((point.x-point.rect.left)*state.canvas.width/point.rect.width),y:Math.floor((point.y-point.rect.top)*state.canvas.height/point.rect.height)};
  assert.equal(state.regionMerge,'true','long press opens live region merge');
  const initial=state.seedLog[0]||state.seed;
  assert.deepEqual({x:Number(initial.x),y:Number(initial.y)},expected,'initial long-press merge seed maps from the picked preview point');
  assert.ok(Number(initial.x)>=0&&Number(initial.x)<state.canvas.width&&Number(initial.y)>=0&&Number(initial.y)<state.canvas.height,'initial merge seed stays in the source frame');
  checks.push({name:`${viewport.width}x${viewport.height} long-press region seed`,pass:true,expected,initial,latest:state.seed,canvas:state.canvas});
  await page.screenshot({path:`${out}/longpress-region-merge-${viewport.width}.png`});
  return state;
}

async function openZoomContext(page) {
  await page.locator('#toolbar [data-tool="zoom"]').click();
  await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.settingsContext==='zoom');
}

async function assertZoomStill(page,value,label) {
  const selected=page.locator(`#zoomStops [aria-pressed="true"]`);
  await selected.waitFor({state:'attached'});
  assert.equal(await selected.getAttribute('data-zoom'),String(value),`${label}: zoom preset changed`);
  checks.push({name:`${label} preserves ${value}x zoom`,pass:true});
}

function assertFrameStable(before,after,label) {
  const delta=Object.fromEntries(['x','y','width','height'].map(key=>[key,Math.abs(before.frame[key]-after.frame[key])]));
  for(const [key,value] of Object.entries(delta))assert.ok(value<=.5,`${label}: preview ${key} changed by ${value}px`);
  checks.push({name:`${label} leaves preview geometry stable`,pass:true,delta,before:before.frame,after:after.frame});
}

async function dispatchPointers(page,points,type='pointerdown') {
  await page.evaluate(({points,type})=>{
    const target=document.querySelector('#stage');
    for(const [i,p] of points.entries())target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:p.id??(81+i),pointerType:'touch',isPrimary:i===0,button:0,clientX:p.x,clientY:p.y}));
  },{points,type});
}

async function dispatchTouch(page, point, phase='tap', duration=80) {
  const session=await page.context().newCDPSession(page);
  const send=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  await send('touchStart',[{x:point.x,y:point.y,id:7,radiusX:2,radiusY:2,force:1}]);
  if(duration) await page.waitForTimeout(duration);
  if(phase==='hold') await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='true',null,{timeout:3000});
  await send('touchEnd',[]);
  await session.detach();
}

async function waitPaletteEpoch(page, previous, count=1) {
  const target=previous+count;
  try { await page.waitForFunction(target=>Number(document.querySelector('#pixelStudio')?.dataset.paletteEpoch||0)>=target,target,{timeout:1800}); }
  catch { const actual=await page.locator('#pixelStudio').getAttribute('data-palette-epoch'); throw new Error(`palette epoch did not reach ${target}; actual=${actual}`); }
}

function assertPreviewControlsDoNotOverlap(state,label) {
  const a=state.frame,b=state.toolbar;
  assert.ok(a&&b,`${label}: preview and toolbar geometry are available`);
  const overlap=a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
  assert.equal(overlap,false,`${label}: live preview overlaps the settings toolbar`);
  checks.push({name:`${label} preview and toolbar do not overlap`,pass:true,preview:a,toolbar:b});
}

try {
  for (const viewport of viewports) {
    const {context,page}=await openPage(viewport,true);
    try {
      await chooseZoom(page,2);
      await waitForClearToast(page);
      // The normal camera UI suppresses a preview tap briefly after a tray has been closed.
      await page.waitForTimeout(650);
      const tapPoint=await livePoint(page,.73,.37);
      const beforeTap=await cameraState(page), tapStarted=Date.now();
      if(viewport.width===390) await page.mouse.click(tapPoint.x,tapPoint.y);
      else await dispatchTouch(page,tapPoint,'tap',35);
      await waitPaletteEpoch(page,beforeTap.paletteEpoch);
      const tapLatencyMs=Date.now()-tapStarted;
      assert.ok(tapLatencyMs<500,`${viewport.width} tap waited for double-tap recognition (${tapLatencyMs}ms)`);
      const tapFocus=await assertFocusRequest(page,tapPoint,'environment',`${viewport.width} tap focus`);
      const afterTap=await cameraState(page);
      assert.equal(afterTap.paletteEpoch,beforeTap.paletteEpoch+1,'a tap refreshes the current palette exactly once');
      assert.notEqual(afterTap.regionMerge,'true','single tap does not open region merge');
      assert.equal(afterTap.focusStatus,'requested','tap issues a supported focus request');
      assert.equal(Number(afterTap.focus.x),tapFocus.actual.x,'root focus diagnostic x equals the hardware request');
      assert.equal(Number(afterTap.focus.y),tapFocus.actual.y,'root focus diagnostic y equals the hardware request');
      assertPreviewControlsDoNotOverlap(afterTap,`${viewport.width} tap`);
      checks.push({name:`${viewport.width} immediate tap refreshes palette and requests focus`,pass:true,tapLatencyMs,epochBefore:beforeTap.paletteEpoch,epochAfter:afterTap.paletteEpoch,expected:tapFocus.expected,actual:tapFocus.actual});
      await page.screenshot({path:`${out}/tap-repick-focus-${viewport.width}.png`});

      // Two quick taps remain two ordinary refreshes; they never invoke a separate double-tap command.
      await waitForClearToast(page);
      const beforeRapid=await cameraState(page), rapidPoint=await livePoint(page,.68,.41);
      await page.mouse.click(rapidPoint.x,rapidPoint.y); await waitPaletteEpoch(page,beforeRapid.paletteEpoch,1);
      await page.mouse.click(rapidPoint.x,rapidPoint.y); await waitPaletteEpoch(page,beforeRapid.paletteEpoch,2);
      const afterRapid=await cameraState(page);
      assert.equal(afterRapid.paletteEpoch,beforeRapid.paletteEpoch+2,'rapid taps each repick the palette');
      assert.notEqual(afterRapid.regionMerge,'true','rapid taps do not open region merge');
      await assertZoomStill(page,2,`${viewport.width} rapid taps`);
      checks.push({name:`${viewport.width} rapid taps do not create double-tap or reset zoom`,pass:true,epochBefore:beforeRapid.paletteEpoch,epochAfter:afterRapid.paletteEpoch});

      // A hold enters region merge, and releasing that pointer cannot leak a tap or focus request.
      await waitForClearToast(page);
      const mergePoint=await livePoint(page,.52,.49), beforeHold=await cameraState(page);
      if(viewport.width===390) await longPress(page,mergePoint);
      else await dispatchTouch(page,mergePoint,'hold',620);
      const mergeState=await assertSeedMatches(page,mergePoint,viewport);
      assert.equal(mergeState.paletteEpoch,beforeHold.paletteEpoch,'hold does not repick the palette');
      assert.equal(mergeState.focusCalls.length,beforeHold.focusCalls.length,'hold does not request hardware focus');
      await page.screenshot({path:`${out}/longpress-region-merge-${viewport.width}.png`});
      await page.locator('#regionMergeCancel').click();
      await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.regionMerge==='false');
      const afterRelease=await cameraState(page);
      assert.equal(afterRelease.paletteEpoch,beforeHold.paletteEpoch,'release after hold does not trigger tap repick');
      assert.equal(afterRelease.focusCalls.length,beforeHold.focusCalls.length,'release after hold does not trigger focus');
      await assertZoomStill(page,2,`${viewport.width} long press`);
      checks.push({name:`${viewport.width} long-press merge consumes release`,pass:true});

      await waitForClearToast(page);
      const beforeDrag=await cameraState(page), dragPoint=await livePoint(page,.50,.50);
      await page.mouse.move(dragPoint.x,dragPoint.y); await page.mouse.down(); await page.mouse.move(dragPoint.x+18,dragPoint.y+2,{steps:2}); await page.mouse.up();
      await assertNoActionAfterGesture(page,{focusCalls:beforeDrag.focusCalls.length},`${viewport.width} drag cancel`);
      assert.equal((await cameraState(page)).paletteEpoch,beforeDrag.paletteEpoch,'drag does not repick colors');

      await waitForClearToast(page);
      const beforePinch=await cameraState(page), pinchPoint=await livePoint(page,.5,.5);
      const pinchPoints=[{x:pinchPoint.x-18,y:pinchPoint.y,id:81},{x:pinchPoint.x+18,y:pinchPoint.y,id:82}];
      await dispatchPointers(page,[pinchPoints[0]],'pointerdown');
      await dispatchPointers(page,[pinchPoints[1]],'pointerdown');
      await page.waitForTimeout(620);
      await dispatchPointers(page,[pinchPoints[0],pinchPoints[1]],'pointerup');
      await assertNoActionAfterGesture(page,{focusCalls:beforePinch.focusCalls.length},`${viewport.width} pinch cancel`);
      assert.equal((await cameraState(page)).paletteEpoch,beforePinch.paletteEpoch,'pinch does not repick colors');

      await waitForClearToast(page);
      const beforeCancel=await cameraState(page), cancelPoint=await livePoint(page,.48,.46);
      await dispatchPointers(page,[cancelPoint],'pointerdown'); await page.waitForTimeout(100); await dispatchPointers(page,[cancelPoint],'pointercancel'); await page.waitForTimeout(620);
      await assertNoActionAfterGesture(page,{focusCalls:beforeCancel.focusCalls.length},`${viewport.width} pointercancel`);
      assert.equal((await cameraState(page)).paletteEpoch,beforeCancel.paletteEpoch,'pointer cancellation does not repick colors');
      await writeFile(`${out}/gesture-state-${viewport.width}.json`,JSON.stringify({viewport,tapFocus,tapLatencyMs,mergeState,finalState:await cameraState(page)},null,2));
    } catch(error) {
      await page.screenshot({path:`${out}/failure-${viewport.width}.png`}).catch(()=>{});
      await writeFile(`${out}/failure-${viewport.width}.json`,JSON.stringify({viewport,error:String(error),stack:error?.stack,checks,errors,sourceHashes,state:await cameraState(page).catch(()=>null)},null,2));
      throw error;
    } finally { await context.close(); }
  }

  // Unsupported focus hardware still performs the normal tap palette refresh without merging.
  {
    const viewport={width:390,height:844}, {context,page}=await openPage(viewport,false);
    try {
      await waitForClearToast(page);
      const point=await livePoint(page,.68,.39);
      const before=await cameraState(page);
      await page.mouse.click(point.x,point.y);
      await waitPaletteEpoch(page,before.paletteEpoch);
      const state=await cameraState(page);
      assertFrameStable(before,state,'unsupported-focus tap');
      assert.equal(state.focusStatus,'unsupported','unsupported hardware is reported as unsupported');
      assert.equal(state.marker?.hidden,true,'unsupported request never shows a requested marker');
      assert.equal(state.focusCalls.length,0,'unsupported track receives no focus constraint');
      assert.equal(state.paletteEpoch,before.paletteEpoch+1,'unsupported focus does not prevent tap palette refresh');
      assert.notEqual(state.regionMerge,'true','unsupported focus tap does not open merge');
      await page.screenshot({path:`${out}/tap-focus-unsupported-390.png`});
      checks.push({name:'unsupported focus tap still repicks palette without merge or constraints',pass:true,capabilities:state.tracks.at(-1)?.capabilities});
    } catch(error) {
      await page.screenshot({path:`${out}/failure-unsupported-390.png`}).catch(()=>{});
      await writeFile(`${out}/failure-unsupported-390.json`,JSON.stringify({error:String(error),stack:error?.stack,checks,errors,sourceHashes,state:await cameraState(page).catch(()=>null)},null,2));
      throw error;
    } finally { await context.close(); }
  }
  // A device may advertise point focus but reject the request; palette repick remains independent.
  {
    const viewport={width:390,height:844}, {context,page}=await openPage(viewport,true,true);
    try {
      await waitForClearToast(page);
      const point=await livePoint(page,.66,.40), before=await cameraState(page);
      await page.mouse.click(point.x,point.y); await waitPaletteEpoch(page,before.paletteEpoch);
      await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.focusStatus==='failed',null,{timeout:2500});
      const state=await cameraState(page);
      assert.equal(state.paletteEpoch,before.paletteEpoch+1,'rejected focus leaves palette repick intact');
      assert.notEqual(state.regionMerge,'true','rejected focus tap does not enter merge');
      assert.equal(state.focusCalls.length,1,'mock rejected exactly one focus constraint request');
      await page.screenshot({path:`${out}/tap-focus-rejected-390.png`});
      checks.push({name:'rejected focus tap still repicks palette and does not merge',pass:true,request:state.focusCalls[0]});
    } catch(error) {
      await page.screenshot({path:`${out}/failure-rejected-390.png`}).catch(()=>{});
      await writeFile(`${out}/failure-rejected-390.json`,JSON.stringify({error:String(error),stack:error?.stack,checks,errors,sourceHashes,state:await cameraState(page).catch(()=>null)},null,2));
      throw error;
    } finally { await context.close(); }
  }
  assert.deepEqual(errors,[],'no browser page errors');
  await writeFile(`${out}/gesture-results.json`,JSON.stringify({checks:checks.length,checks,viewports,sourceHashes,errors,scope:{camera:'isolated synthetic canvas stream with mocked MediaStreamTrack capabilities and CDP touch input',physicalFocus:'UNTESTED; only mocked applyConstraints requests were checked',realDeviceGestures:'UNTESTED',Safari:'UNTESTED'}},null,2));
  console.log(`Camera gesture browser checks: ${checks.length} PASS; synthetic mock camera only; physical focus and camera behavior UNTESTED; artifacts: ${out}`);
} finally { await browser.close(); }
