#!/usr/bin/env node
/** Real HTTP cache: old animation core + 708196bb failure, then fixed graph.
 * Local-only, isolated browser storage, CSP blocks external services; no routing
 * (routing would disable HTTP caching). Never clears user or test storage.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=process.env.PIXIEED_ANIMATION_CACHE_OUTPUT||await mkdtemp(join(tmpdir(),'pixieed-animation-cache-'));
const modulePath=process.env.PIXIEED_PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(modulePath==='playwright'?modulePath:pathToFileURL(modulePath).href);
const brokenRef='708196bb',legacyRef='dd17f5e3^',revision='20261012-animation-core-contract-1';
const oldCore=execFileSync('git',['show',legacyRef+':js/creation/animation-core.mjs'],{cwd:root});
await mkdir(output,{recursive:true});
let phase='seed';const requests=[],rows=[];
const contentType=p=>/\.m?js$/.test(p)?'text/javascript; charset=utf-8':p.endsWith('.css')?'text/css; charset=utf-8':p.endsWith('.html')?'text/html; charset=utf-8':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.png')?'image/png':'application/octet-stream';
const server=createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost'),path=u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname;
 requests.push({phase,url:u.pathname+u.search});
 res.setHeader('Cache-Control',path.endsWith('.html')?'no-store':'public, max-age=600');
 res.setHeader('Content-Type',contentType(path));
 res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' data: blob:; worker-src 'self' blob:; img-src 'self' data: blob:");
 try {
  const name=path.slice(1);
  const bytes=phase==='seed'&&name==='js/creation/animation-core.mjs'?oldCore
   :phase==='fixed'?await readFile(resolve(root,'.'+path)):execFileSync('git',['show',brokenRef+':'+name],{cwd:root,stdio:['ignore','pipe','pipe']});
  res.end(bytes);
 }catch {res.statusCode=404;res.end('Not found');}
});
await new Promise(accept=>server.listen(0,'127.0.0.1',accept));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const startedAt=new Date().toISOString();
try {
 for (const scenario of ['broken','fixed']) {
  phase='seed';const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await ctx.addInitScript(()=>{
   window.__cacheMediaRequests=0;
   if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{window.__cacheMediaRequests++;throw new DOMException('Synthetic diagnostic denial','NotAllowedError');}});
  });
  const page=await ctx.newPage();page.setDefaultTimeout(15000);
  const cdp=await ctx.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});await cdp.send('Network.setBlockedURLs',{urls:['https://*']});
  const errors=[],cached=[],ids=new Map();page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));
  cdp.on('Network.requestWillBeSent',e=>ids.set(e.requestId,e.request.url));cdp.on('Network.requestServedFromCache',e=>cached.push(ids.get(e.requestId)));
  const row={scenario,checks:[],errors,cached};rows.push(row);
  try {
   await page.goto(base+'/404.html',{waitUntil:'load'});
   row.seed=await page.evaluate(async()=>{
    const core=await import('/js/creation/animation-core.mjs');
    const {createPxdProject}=await import('/js/creation/pxd-codec.mjs');
    const {writePxdAnimation}=await import('/js/creation/pxd-animation.mjs');
    const {createToolProjectStore}=await import('/js/creation/tool-project-store.mjs');
    let a=core.createAnimation({width:16,height:16,palette:['#e75445','#4c82c3']});
    a=core.writeAnimationCel(a,a.frames[0].id,a.layers[0].id,{width:16,height:16,pixels:Array.from({length:256},(_,i)=>i===0?1:i===17?2:0)});
    a=core.addAnimationFrame(a,{copy:true});a=core.addAnimationLayer(a,{name:'Legacy second art layer'});
    const saved=await createToolProjectStore('draw').save(await writePxdAnimation(createPxdProject({manifest:{title:'Isolated cache regression fixture'}}),a));
    const pointer={projectId:saved.projectId,revisionId:saved.revisionId};localStorage.setItem('pixieed:pxd:last:draw',JSON.stringify(pointer));localStorage.setItem('pixieed:pxd:last:creation',JSON.stringify(pointer));
    return {hasEnsure:typeof core.ensureAnimationMusicLayer==='function',pointer,frames:a.frames.length,layers:a.layers.length};
   });
   assert.equal(row.seed.hasEnsure,false);phase=scenario;
   await page.goto(base+'/draw/',{waitUntil:'load'});
   if(scenario==='broken') {
    await page.waitForFunction(()=>document.querySelector('#draw-palette')?.children.length===0);
    await page.waitForTimeout(300);
    assert.ok(errors.some(e=>e.message.includes('ensureAnimationMusicLayer')&&/export|binding|not found/i.test(e.message)),'reproduce the reported missing-export error');
    row.state=await page.evaluate(()=>({ready:document.documentElement.dataset.drawReady,palette:document.querySelectorAll('#draw-palette [data-color-index]').length,oldNav:document.querySelectorAll('.app-tabs [data-nav]').length}));
    assert.notEqual(row.state.ready,'true');assert.equal(row.state.palette,0);
    assert.ok(cached.some(url=>url?.endsWith('/js/creation/animation-core.mjs')),'legacy provider really came from HTTP cache');
    row.checks.push('old cached provider reproduces named-import failure and static UI');
   } else {
    const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.drawReady==='true'&&document.documentElement.dataset.creationModesReady==='true'&&!document.querySelector('#main').inert&&!document.body.hasAttribute('data-creation-transition'),null,{timeout:30000});
    await ready();
    const restored=await page.locator('#draw-canvas').evaluate(c=>({width:c.width,height:c.height,rgba:Array.from(c.getContext('2d').getImageData(0,0,1,1).data)}));
    assert.deepEqual(restored,{width:16,height:16,rgba:[231,84,69,255]});
    assert.equal(await page.locator('[data-action="select-frame"]').count(),2);
    row.checks.push('old cached PXD restores dimensions, exact pixels and two frames');
    const rgba=()=>page.locator('#draw-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));
    const original=await rgba(),box=await page.locator('#draw-canvas').boundingBox();await page.mouse.click(box.x+box.width*.64,box.y+box.height*.61);const edited=await rgba();assert.notDeepEqual(edited,original);
    for(const mode of ['audio','camera','draw']) {await page.locator(`button[data-creation-mode="${mode}"]`).click();await page.waitForFunction(m=>document.body.dataset.creationMode===m&&!document.body.hasAttribute('data-creation-transition'),mode);}
    assert.deepEqual(await rgba(),edited);row.checks.push('draw and shared-mode round trip preserve pixels across the contract');
    await page.locator('#draw-undo').click();assert.deepEqual(await rgba(),original);await page.locator('#draw-redo').click();assert.deepEqual(await rgba(),edited);row.checks.push('Undo/Redo survive mode round trip');
    await page.locator('#pxd-save').evaluate(n=>n.click());await page.waitForFunction(()=>document.querySelector('.project-bar__open')?.dataset.state==='saved');
    row.persistence=await page.evaluate(async(pointer)=>{
     const {createToolProjectStore}=await import('/js/creation/tool-project-store.mjs');
     const original=await createToolProjectStore('draw').load(pointer.projectId,pointer.revisionId);
     return {oldRevisionPreserved:Boolean(original),currentPointer:JSON.parse(localStorage.getItem('pixieed:pxd:last:creation')),oldCoreStillCached:typeof(await import('/js/creation/animation-core.mjs')).ensureAnimationMusicLayer!=='function',mediaRequests:window.__cacheMediaRequests};
    },row.seed.pointer);
    assert.equal(row.persistence.oldRevisionPreserved,true);assert.equal(row.persistence.currentPointer.projectId,row.seed.pointer.projectId);assert.equal(row.persistence.oldCoreStillCached,true);assert.equal(row.persistence.mediaRequests,0);
    row.checks.push('old core remains cached and original saved revision survives; no storage clearing');
    await page.reload({waitUntil:'load'});await ready();assert.deepEqual(await rgba(),edited);assert.deepEqual(errors,[]);row.checks.push('same-context reload restores edited pixels without exceptions');
    const live=requests.filter(r=>r.phase==='fixed');assert.ok(live.some(r=>r.url==='/js/creation/animation-core.mjs?rev='+revision));assert.ok(live.some(r=>r.url==='/js/creation/animation-core-v20261012.mjs'));row.checks.push('new facade and one canonical implementation fetched under the new contract');
   }
   await page.screenshot({path:join(output,scenario+'.png'),fullPage:true});row.passed=true;
  }catch(e){row.passed=false;row.failure={message:e.message,stack:e.stack};throw e;}
  finally{await ctx.close();}
 }
 console.log('PASS: reported failure reproduced; fixed startup/restore/modes/Undo/Redo/reload preserve old cached storage');
}finally{await writeFile(join(output,'report.json'),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),legacyRef,brokenRef,revision,routing:false,cacheControl:'public, max-age=600',userStorageUsed:false,hardwarePermission:false,rows,requests},null,2));await browser.close();await new Promise(accept=>server.close(accept));}
