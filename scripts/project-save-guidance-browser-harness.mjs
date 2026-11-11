#!/usr/bin/env node
/** Local synthetic projects only. No real accounts, storage, or external network. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
const root = resolve(process.env.PIXIEED_BROWSER_ROOT || fileURLToPath(new URL('..', import.meta.url)));
const out = process.env.PIXIEED_BROWSER_ARTIFACTS || '/tmp/pixieed-save-guidance-qa';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
await mkdir(out, {recursive:true});
const mime = {'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.svg':'image/svg+xml'};
const shell = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><main id="main">合成バックアップ検証</main>';
const server = createServer(async (req,res) => {try {
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (pathname === '/draw/' || pathname === '/output/work/') {res.setHeader('Content-Type','text/html');return res.end(shell);}
  let file = resolve(root,'.'+pathname); if (!file.startsWith(root+'/')) return res.writeHead(403).end();
  if ((await stat(file)).isDirectory()) file += '/index.html';
  res.setHeader('Content-Type',mime[extname(file)] || 'application/octet-stream');res.end(await readFile(file));
} catch {res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PIXIEED_CHROME_EXECUTABLE ? {executablePath:process.env.PIXIEED_CHROME_EXECUTABLE}:{})});
const report={status:'PASS',cases:[],limitations:['Synthetic isolated Chromium contexts. Responsive emulation, not physical devices. Output handoff bytes verified; this harness does not assert OS download completion. All external requests blocked.']};
async function mount(page,empty=false){await page.evaluate(async empty=>{
 const {createPxdProject}=await import('/js/creation/pxd-codec.mjs');
 const {putPxdSharedImage}=await import('/js/creation/pxd-project.mjs');
 const {createPxdStore}=await import('/js/creation/pxd-store.mjs');
 const {mountProjectWorkspace}=await import('/js/creation/project-workspace.mjs');
 const store=createPxdStore(); let project=await store.load('journey-original');
 if(!project){project=createPxdProject({projectId:'journey-original',manifest:{title:'検証用の絵',lastMode:'draw',toolProject:{tool:'draw',schemaVersion:1}}});project=await putPxdSharedImage(project,{width:2,height:2,rgba:new Uint8Array([255,0,0,255,0,255,0,255,0,0,255,255,32,64,128,255])});if(!empty)project=await store.save(project,{expectedRevisionId:null});}
 const ws=mountProjectWorkspace({tool:'draw',initialProject:{project,persisted:!empty},getProject:p=>p,openProject:()=>{},getEditorState:()=>({}),routePointer:false});await ws.ready;
 window.__qa={ws,store};await ws.showProjects({pane:'library'});
},empty);}
try{for(const width of [320,390,1280]){
 const context=await browser.newContext({viewport:{width,height:width===320?568:900},hasTouch:width<600,serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 const p=await context.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(base+'/draw/');await mount(p);
 assert.match(await p.locator('.project-storage-note').textContent(),/この端末のこのブラウザー/);
 await p.locator('#project-tab-current').click();assert.equal(await p.locator('#pxd-export').isVisible(),true);
 assert.equal(await p.locator('.project-more').evaluate(e=>e.open),false);assert.match(await p.locator('.project-sheet__identity').textContent(),/このブラウザーに保存済み/);
 await p.locator('#pxd-export').scrollIntoViewIfNeeded();const box=await p.locator('#pxd-export').boundingBox();assert.ok(box.width>=44&&box.height>=44);assert.ok(box.x>=0&&box.x+box.width<=width+1);
 await p.screenshot({path:`${out}/backup-${width}.png`});await p.locator('#pxd-export').click();await p.waitForURL('**/output/work/?entry=1');
 const backup=await p.evaluate(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('pixieed-output-files-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error);});const record=await new Promise((r,j)=>{const q=db.transaction('files').objectStore('files').getAll();q.onsuccess=()=>r(q.result[0]);q.onerror=()=>j(q.error);});db.close();return {filename:record.filename,bytes:Array.from(new Uint8Array(await record.blob.arrayBuffer()))};});assert.match(backup.filename,/\.pxd$/);
 await p.goto(base+'/draw/');await mount(p);await p.locator('#project-tab-import').click();await p.locator('#pxd-file-input').setInputFiles({name:backup.filename,mimeType:'application/octet-stream',buffer:Buffer.from(backup.bytes)});await p.locator('#project-import-copy').waitFor({state:'visible'});
 assert.equal(await p.evaluate(async()=>(await __qa.store.listProjects()).projects.length),1,'preview alone does not save a copy');
 await p.locator('#project-import-copy').click();await p.waitForFunction(()=>!document.querySelector('#pxd-panel').open);
 const result=await p.evaluate(async()=>{const {readPxdImage}=await import('/js/creation/pxd-project.mjs');const original=await __qa.store.load('journey-original');const copy=__qa.ws.currentProject;const a=await readPxdImage(original);const b=await readPxdImage(copy);return {count:(await __qa.store.listProjects()).projects.length,ids:[original.projectId,copy.projectId],same:JSON.stringify(Array.from(a.rgba))===JSON.stringify(Array.from(b.rgba)),title:copy.manifest.title};});assert.equal(result.count,2);assert.notEqual(...result.ids);assert.ok(result.same,'restored PXD keeps exact pixels');assert.deepEqual(errors,[]);report.cases.push({width,backupAndRestore:'PASS',result});await context.close();
}
 const c=await browser.newContext({viewport:{width:320,height:568},serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const p=await c.newPage();await p.goto(base+'/draw/');await mount(p,true);await p.locator('#project-empty-new').waitFor({state:'visible'});await p.locator('#project-empty-new').click();await p.waitForFunction(()=>!document.querySelector('#pxd-panel').open);assert.equal(await p.evaluate(async()=>(await __qa.store.listProjects()).projects.length),0,'new blank is not persisted just by entering');report.cases.push({emptyManager:'PASS'});await c.close();
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
