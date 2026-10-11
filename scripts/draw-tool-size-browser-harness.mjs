/** Local pixel-level checks for input sizes and contextual options. Real devices and external requests are blocked. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
const base=process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out=process.env.PIXIEED_TOOL_SIZE_OUTPUT || '/tmp/pixieed-tool-size-browser';await mkdir(out,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({headless:true});
const report={engine:browser.version(),checks:[],errors:[],realCamera:'UNTESTED',physicalTouch:'UNTESTED',externalRequests:'blocked'};
const record=(viewport,name)=>report.checks.push({viewport,name});
try{
 for(const viewport of [{width:1280,height:800},{width:390,height:844},{width:320,height:568},{width:667,height:375}]){
  const context=await browser.newContext({viewport,hasTouch:viewport.width<600});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==new URL(base).origin)return route.abort();
   if(url.pathname==='/js/creation/draw-page.mjs'){
    const response=await route.fetch(),source=await response.text(),marker='return {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,';
    assert.ok(source.includes(marker));return route.fulfill({response,body:source.replace(marker,'return window.__sizeDraw = {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,')});
   }return route.continue();
  });
  await context.addInitScript(()=>{window.__mediaRequests=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__mediaRequests++;throw new DOMException('QA denies device access','NotAllowedError');};});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(`${viewport.width}: ${e.message}`));
  const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.creationModesReady==='true'&&!document.querySelector('#main').inert);
  const image=()=>page.evaluate(()=>Array.from(__sizeDraw.getImage().rgba));
  const art=()=>page.evaluate(async()=>{const {getAnimationCelDocument}=await import('/js/creation/animation-core.mjs');const t=__sizeDraw.getTimeline();return{width:t.width,height:t.height,palette:t.palette,layers:t.layers.filter(l=>l.role!=='music').map(l=>({id:l.id,frames:t.frames.map(f=>({id:f.id,durationMs:f.durationMs,pixels:Array.from(getAnimationCelDocument(t,f.id,l.id).pixels)}))}))};});
  const indices=async()=>{const rgba=await image();return rgba.flatMap((v,i)=>i%4===3&&v?[i/4-.75]:[]);};
  const point=async(x,y)=>{const r=await page.locator('#draw-canvas').boundingBox();return{x:r.x+(x+.5)*r.width/16,y:r.y+(y+.5)*r.height/16};};
  const tap=async(x,y,button='left')=>{const p=await point(x,y);await page.mouse.click(p.x,p.y,{button});};
  const drag=async(x,y,toX,toY)=>{const a=await point(x,y),b=await point(toX,toY);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});await page.mouse.up();};
  const choose=async(tool,button='left')=>{if(!await page.locator('#draw-tool-picker').evaluate(n=>n.open))await page.locator('#draw-tool-summary').click();await page.locator(`[data-draw-tool="${tool}"]`).first().click({button});await page.keyboard.press('Escape');};
  const size=async(side,value)=>{await page.locator('#draw-brush-size-open').click();await page.locator(`[data-brush-side="${side}"]`).click();await page.locator('#draw-brush-size-value').fill(String(value));await page.locator('#draw-brush-size-value').dispatchEvent('change');assert.equal(await page.locator('#draw-brush-size-value').inputValue(),String(value));await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'draw-brush-size-open');};
  const seed=async(cells=[])=>page.evaluate(async cells=>{const snapshot=await __sizeDraw.cameraTarget(),rgba=new Uint8ClampedArray(1024);for(const i of cells)rgba.set([231,84,69,255],i*4);await __sizeDraw.applyCameraRgba(snapshot,rgba,{paletteFixed:false});},cells);
  const undo=()=>page.locator('#draw-undo').click();const redo=()=>page.locator('#draw-redo').click();
  const slot=page.locator('[data-selection-slot="0"]');
  await page.goto(`${base}/draw/`);await ready();
  assert.equal(await page.locator('.draw-feature-actions > button').count(),4);
  for(const r of await page.locator('.draw-feature-actions > button').evaluateAll(ns=>ns.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))))assert.ok(r.width>=44&&r.height>=44);
  const before=await image();await size('left',3);assert.deepEqual(await image(),before);await tap(4,4);assert.equal((await indices()).length,9);await undo();assert.equal((await indices()).length,0);await redo();assert.equal((await indices()).length,9);
  assert.equal(await page.evaluate(()=>__sizeDraw.getEditorState().inputSettings.bindings.left.brushSize),3);record(viewport,'left-size-and-undo-redo');
  await choose('eraser','right');await size('right',2);await tap(4,4,'right');assert.equal((await indices()).length,5);await undo();assert.equal((await indices()).length,9);await redo();assert.equal((await indices()).length,5);record(viewport,'right-size-and-eraser');
  await seed();await choose('pen');await size('left',2);await page.locator('#draw-settings-summary').click();await page.locator('#draw-mirror').click();await page.keyboard.press('Escape');await tap(3,3);
  assert.deepEqual(await indices(),[51,52,59,60,67,68,75,76]);record(viewport,'even-size-reflected-footprint');
  await page.locator('#draw-settings-summary').click();await page.locator('#draw-mirror').click();await page.keyboard.press('Escape');
  await seed();await choose('pen');await size('left',3);await drag(2,4,9,4);assert.equal((await indices()).length,30);record(viewport,'interpolated-thick-stroke');
  await seed();await choose('pen');await size('left',3);
  await page.locator('#draw-settings-summary').click();await page.locator('#draw-virtual-toggle').click();await page.keyboard.press('Escape');
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const virtualTap=async(side,id)=>{const r=await page.locator(`[data-virtual-${side}]`).boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id,x:r.x+r.width/2,y:r.y+r.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
  await virtualTap('left',1);assert.equal((await indices()).length,9);await virtualTap('right',2);assert.equal((await indices()).length,5);await undo();assert.equal((await indices()).length,9);await redo();assert.equal((await indices()).length,5);record(viewport,'virtual-left-right-sizes-and-history');
  await page.locator('#draw-settings-summary').click();await page.locator('#draw-virtual-toggle').click();await page.keyboard.press('Escape');await cdp.detach();
  await seed();await choose('rectangle');assert.equal(await slot.getAttribute('aria-pressed'),'false');await size('left',2);await drag(2,2,9,9);assert.equal((await indices()).length,48);await undo();assert.equal((await indices()).length,0);
  await slot.click();assert.equal(await slot.getAttribute('aria-pressed'),'true');await drag(2,2,9,9);assert.equal((await indices()).length,64);assert.equal(await page.locator('[data-selection-slot="1"]').isDisabled(),true);record(viewport,'outline-size-and-filled-toggle');
  await seed([17,204]);await choose('fill');assert.equal(await slot.getAttribute('aria-pressed'),'true');await page.locator('.draw-color[data-color-index="4"]').click();await tap(1,1);
  let rgba=await image();assert.notDeepEqual(rgba.slice(17*4,17*4+4),rgba.slice(204*4,204*4+4));await undo();await slot.click();assert.equal(await slot.getAttribute('aria-pressed'),'false');await tap(1,1);rgba=await image();assert.deepEqual(rgba.slice(17*4,17*4+4),rgba.slice(204*4,204*4+4));await undo();record(viewport,'contiguous-and-disconnected-fill');
  await choose('select');await drag(0,0,4,4);assert.equal(await slot.getAttribute('data-selection-action'),'copy');await slot.click();assert.equal(await slot.getAttribute('data-selection-action'),'paste');await slot.click();assert.equal(await slot.getAttribute('data-selection-action'),'confirm');assert.equal(await slot.getAttribute('aria-pressed'),null);await page.locator('[data-selection-slot="1"]').click();record(viewport,'selection-paste-priority');
  await page.locator('.draw-feature-actions .draw-selection-controls__deselect').click();await choose('pen');assert.equal(await slot.getAttribute('data-slot-kind'),'empty');
  await page.locator('#draw-output summary').click();await page.locator('#draw-save').click();await page.waitForFunction(()=>new URLSearchParams(location.search).has('pxdRevision'));
  const saved=await page.evaluate(()=>__sizeDraw.getEditorState().inputSettings.bindings),savedImage=await image();await page.reload();await ready();assert.deepEqual(await page.evaluate(()=>__sizeDraw.getEditorState().inputSettings.bindings),saved);assert.deepEqual(await image(),savedImage);record(viewport,'pxd-reload-retains-input-settings-and-art');
  assert.equal(await page.evaluate(()=>__mediaRequests),0);
  const savedArt=await art();
  for(const [entry,mode] of [['/audio/','audio'],['/pixel-camera.html','camera'],['/draw/','draw']]){
   await page.goto(`${base}${entry}`);await ready();await page.waitForFunction(mode=>document.body.dataset.creationMode===mode&&!document.body.hasAttribute('data-creation-transition'),mode);assert.equal(new URL(page.url()).pathname,'/draw/');assert.equal(await page.locator('#draw-canvas').count(),1);assert.deepEqual(await art(),savedArt);if(mode!=='audio')assert.deepEqual(await image(),savedImage);
   record(viewport,`${entry}-same-editor-${mode}`);
  }
  await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}-draw.png`});await page.locator('#draw-brush-size-open').click();await page.screenshot({path:`${out}/${viewport.width}x${viewport.height}-size.png`});await page.keyboard.press('Escape');await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({status:report.status,checks:report.checks.length,out}));
