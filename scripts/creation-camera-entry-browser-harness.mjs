#!/usr/bin/env node
/** Camera entry and lifecycle QA. Canvas streams only; no hardware permissions. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const startedAt=new Date().toISOString(),head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4188';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const output=process.env.PIXIEED_CAMERA_ENTRY_OUTPUT||'/tmp/pixieed-camera-entry-review';await mkdir(output,{recursive:true});
const {chromium}=await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser=await chromium.launch({headless:true});const results=[];
const variants=[{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}].filter(v=>!process.env.PIXIEED_TEST_WIDTH||v.width===Number(process.env.PIXIEED_TEST_WIDTH));
const ready=(page,mode)=>page.waitForFunction(mode=>document.documentElement.dataset.creationModesReady==='true'&&document.body.dataset.creationMode===mode&&!document.body.hasAttribute('data-creation-transition')&&!document.querySelector('#main').inert,mode);
const change=async(page,mode)=>{await page.locator(`button[data-creation-mode="${mode}"]`).click();await ready(page,mode);};
async function instruments(context,scenario) {
 await context.addInitScript(({scenario})=>{
  window.__entryQA={requests:0,pending:0,maxPending:0,tracks:[],paintedDraw:[],readyTooEarly:0};
  const q=window.__entryQA;
  function stream(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#e75445';g.fillRect(0,0,32,64);g.fillStyle='#185d78';g.fillRect(32,0,32,64);const s=c.captureStream(12);q.tracks.push(...s.getTracks());return s;}
  Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
   q.requests++;q.pending++;q.maxPending=Math.max(q.maxPending,q.pending);
   try {
    if(scenario==='denied')throw new DOMException('Synthetic denied','NotAllowedError');
    if(scenario==='missing')throw new DOMException('Synthetic no camera','NotFoundError');
    if(scenario==='pending')return await new Promise((resolve,reject)=>{window.__releaseCamera=()=>resolve(stream());window.__rejectCamera=()=>reject(new DOMException('Synthetic denied','NotAllowedError'));});
    return stream();
   } finally {q.pending--;}
  }});
  const requested=new URLSearchParams(location.search).get('mode')==='camera';
  function inspect(){if(!requested||window.__probeDone)return;const root=document.documentElement,canvas=document.querySelector('#draw-canvas');
   if(canvas&&canvas.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&canvas.getBoundingClientRect().width>0)q.paintedDraw.push({mode:document.body.dataset.creationMode||'unset',ready:root.dataset.creationModesReady||false});
   if(root.dataset.creationModesReady==='true'){if(document.body.dataset.creationMode!=='camera')q.readyTooEarly++;else window.__probeDone=true;}
   if(!window.__probeDone)requestAnimationFrame(inspect);
  }requestAnimationFrame(inspect);
 },{scenario});
}
async function seed(page) {
 return page.evaluate(async()=>{
  const a=await import('/js/creation/animation-core.mjs'),codec=await import('/js/creation/pxd-codec.mjs'),pxd=await import('/js/creation/pxd-animation.mjs'),stores=await import('/js/creation/tool-project-store.mjs');
  let timeline=a.createAnimation({width:12,height:8,palette:['#112233','#e75445','#abcdef']});
  timeline=a.addAnimationFrame(timeline);timeline=a.addAnimationLayer(timeline,{name:'追加レイヤー'});
  timeline=a.setLayerProperties(timeline,timeline.layers[0].id,{name:'元のレイヤー',locked:true,visible:true});
  for(let f=0;f<timeline.frames.length;f++)for(let l=0;l<timeline.layers.length;l++)timeline=a.writeAnimationCel(timeline,timeline.frames[f].id,timeline.layers[l].id,{schemaVersion:1,width:12,height:8,palette:timeline.palette,pixels:Array.from({length:96},(_,i)=>i===(f*13+l*7)?(f+l)%3+1:0)});
  let project=codec.createPxdProject({manifest:{title:'camera-entry-retention',creationProject:{schemaVersion:1},toolProject:{schemaVersion:1,tool:'draw'},futureFlag:{keep:true}}});
  project=codec.setPxdBytes(project,'future/retain.bin',new Uint8Array([0,255,13,7]));project=await pxd.writePxdAnimation(project,timeline);
  const saved=await stores.createToolProjectStore('draw').save(project,{expectedRevisionId:null});
  const pointer={projectId:saved.projectId,revisionId:saved.revisionId};localStorage.setItem('pixieed:pxd:last:creation',JSON.stringify(pointer));localStorage.setItem('pixieed:pxd:last:draw',JSON.stringify(pointer));
  return {pointer,frames:timeline.frames.map(f=>f.id),layers:timeline.layers.map(l=>l.id),layerDetails:timeline.layers,
    cels:timeline.frames.flatMap(f=>timeline.layers.map(l=>({frame:f.id,layer:l.id,pixels:Array.from(a.getAnimationCelDocument(timeline,f.id,l.id).pixels)}))),
    palette:timeline.palette,signature:codec.canonicalPxdJson({projectId:saved.projectId,revisionId:saved.revisionId,manifest:saved.manifest,entries:saved.entries.map(e=>({path:e.path,bytes:Array.from(e.bytes)})).sort((a,b)=>a.path.localeCompare(b.path)),opaque:saved.opaquePayloads.map(e=>Array.from(e.bytes))})};
 });
}
try {
 for(const viewport of variants)for(const scenario of (process.env.PIXIEED_CAMERA_SCENARIOS?.split(',')||['blank','existing','pending','denied','missing','failed-camera'])) {
  const context=await browser.newContext({viewport,hasTouch:true});await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());await instruments(context,scenario);
  const page=await context.newPage();page.setDefaultTimeout(15000);const errors=[],documents=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.resourceType()==='document')documents.push(new URL(r.url()).pathname)});
  const label=`${scenario}-${viewport.width}x${viewport.height}`;let fixture=null;
  try {
   if(scenario==='failed-camera') {
    await context.route('**/css/pixel-lens-camera.css*',r=>r.fulfill({status:404,body:''}));
    await page.goto(base+'/draw/?mode=camera');
    await ready(page,'draw');
    assert.equal(await page.locator('#creation-startup').isVisible(),false);
    assert.ok((await page.locator('.creation-mode-error').textContent()).includes('撮影'));
    assert.equal(await page.locator('#draw-canvas').isVisible(),true);
    checks.push('failed camera UI load releases loading screen and reports actionable mode error; restored drawing remains available');
    results.push({label,passed:true,checks,documents});
    await context.close();console.log(`${label}: PASS`);continue;
   }
   await page.goto(base+'/');await page.locator('[data-menu-toggle]').waitFor();await page.locator('[data-menu-toggle]').click();await page.locator('[data-menu-link][href="/draw/?mode=camera"]').waitFor();
   if(scenario==='existing')fixture=await seed(page);
   assert.equal(await page.locator('[data-menu-link][href="/draw/?mode=camera"]').getAttribute('href'),'/draw/?mode=camera');
   documents.length=0;
   await page.locator('[data-menu-link][href="/draw/?mode=camera"]').click();await ready(page,'camera');
   assert.deepEqual(documents,['/draw/'],'camera nav loads one integrated document');
   assert.equal(await page.locator('#pixelStudio').count(),1);assert.equal(await page.locator('iframe').count(),0);
   const initial=await page.evaluate(()=>({painted:window.__entryQA.paintedDraw,early:window.__entryQA.readyTooEarly,requests:window.__entryQA.requests}));
   assert.deepEqual(initial.painted,[],'no drawing UI painted during camera startup');assert.equal(initial.early,0,'ready signal never precedes camera mode');assert.equal(initial.requests,0,'entry does not grant/request hardware permission');
   assert.equal(await page.locator('#cameraChooseImage').isEnabled(),true);checks.push('one document; camera UI first; coherent readiness; no implicit camera permission; image fallback enabled');
   if(fixture) {
    const saved=await page.evaluate(async pointer=>{const stores=await import('/js/creation/tool-project-store.mjs'),codec=await import('/js/creation/pxd-codec.mjs'),pxd=await import('/js/creation/pxd-animation.mjs');const p=await stores.createToolProjectStore('draw').load(pointer.projectId,pointer.revisionId),t=await pxd.readPxdAnimation(p);return {signature:codec.canonicalPxdJson({projectId:p.projectId,revisionId:p.revisionId,manifest:p.manifest,entries:p.entries.map(e=>({path:e.path,bytes:Array.from(e.bytes)})).sort((a,b)=>a.path.localeCompare(b.path)),opaque:p.opaquePayloads.map(e=>Array.from(e.bytes))}),frames:t.frames.map(f=>f.id),layers:t.layers.map(l=>l.id),palette:t.palette};},fixture.pointer);
    assert.ok(saved.signature===fixture.signature,'stored manifest and payload bytes remain unchanged');assert.deepEqual(saved.frames,fixture.frames);assert.deepEqual(saved.layers,fixture.layers);assert.deepEqual(saved.palette,fixture.palette);
    const settings=page.locator('#creation-project-settings-open');await settings.click();assert.equal(await page.locator('#creation-project-width').inputValue(),'12');assert.equal(await page.locator('#creation-project-height').inputValue(),'8');await page.locator('#creation-project-settings-panel button[aria-label="設定を閉じる"]').click();
    await change(page,'draw');assert.deepEqual(await page.locator('#draw-canvas').evaluate(c=>[c.width,c.height]),[12,8]);await change(page,'camera');checks.push('existing project, palette, two frames/layers, locked layer and opaque payload retained; shared dimensions restored');
    const retained=await page.evaluate(async originalLayers=>{
      const stores=await import('/js/creation/tool-project-store.mjs'),pxd=await import('/js/creation/pxd-animation.mjs'),a=await import('/js/creation/animation-core.mjs');
      const pointer=JSON.parse(localStorage.getItem('pixieed:pxd:last:creation'));
      const p=await stores.createToolProjectStore('draw').load(pointer.projectId,pointer.revisionId),t=await pxd.readPxdAnimation(p);
      return {frames:t.frames.map(f=>f.id),layers:t.layers.filter(l=>originalLayers.includes(l.id)),palette:t.palette,
        bytes:Array.from(p.entries.find(e=>e.path==='future/retain.bin').bytes),
        cels:t.frames.flatMap(f=>originalLayers.map(l=>({frame:f.id,layer:l,pixels:Array.from(a.getAnimationCelDocument(t,f.id,l).pixels)})))};
    },fixture.layers);
    assert.deepEqual(retained.frames,fixture.frames);assert.deepEqual(retained.layers,fixture.layerDetails);assert.deepEqual(retained.palette,fixture.palette);assert.deepEqual(retained.cels,fixture.cels);assert.deepEqual(retained.bytes,[0,255,13,7]);
    checks.push('restored live project saves every original frame/cel, layer name/lock, palette and unknown bytes after camera/draw reentry');
   }
   if(['pending','denied','missing'].includes(scenario)) {
    await page.locator('#capture').click();await page.waitForFunction(()=>window.__entryQA.requests===1);
    if(scenario==='pending') {
     assert.equal(await page.locator('#main').evaluate(n=>n.inert),false);assert.equal(await page.locator('#cameraChooseImage').isEnabled(),true);
     await change(page,'draw');await page.evaluate(()=>window.__releaseCamera());await page.waitForFunction(()=>window.__entryQA.tracks.every(t=>t.readyState==='ended'));
     await change(page,'camera');assert.equal(await page.evaluate(()=>window.__entryQA.requests),1,'reentry does not stack permission requests');checks.push('pending permission never locks mode menu; leaving stops delayed stream; reentry remains gesture driven');
    } else {await page.waitForFunction(()=>document.querySelector('#pixelStudio').dataset.mode==='idle');assert.equal(await page.locator('#cameraFallbackChoose').isEnabled(),true);checks.push(`${scenario}: actionable camera error and image fallback`);}
    assert.equal(await page.evaluate(()=>window.__entryQA.maxPending),1);
   }
   await page.screenshot({path:`${output}/${label}.png`});
   await page.goto(base+'/draw/?mode=camera');await ready(page,'camera');assert.deepEqual(await page.evaluate(()=>window.__entryQA.paintedDraw),[]);checks.push('direct URL has no drawing flash');
   await page.goto(base+'/');await page.goBack();await ready(page,'camera');await page.goForward();await page.waitForURL(base+'/');await page.goBack();await ready(page,'camera');checks.push('browser Back and Forward traverse the previous page and return to camera mode');
   await page.locator('.app-tabs').evaluate(n=>{for(const mode of ['draw','camera','audio','draw','camera'])n.querySelector(`[data-creation-mode="${mode}"]`).click();});await ready(page,'camera');assert.equal(await page.locator('#pixelStudio').count(),1);checks.push('rapid mode requests settle in one camera UI');
   assert.deepEqual(errors,[]);results.push({label,passed:true,checks,documents});
  }catch(error){await page.screenshot({path:`${output}/${label}-failure.png`}).catch(()=>{});results.push({label,passed:false,checks,error:error.stack,errors});console.error(`${label}: ${error.message}`);}
  await context.close();console.log(`${label}: ${results.at(-1).passed?'PASS':'FAIL'}`);
 }
} finally {await browser.close();await writeFile(`${output}/results.json`,JSON.stringify({head,sourceFingerprint:process.env.PIXIEED_SOURCE_FINGERPRINT||null,startedAt,finishedAt:new Date().toISOString(),physicalCamera:'UNTESTED',permissions:'never granted',results},null,2));}
if(results.some(r=>!r.passed))process.exitCode=1;
