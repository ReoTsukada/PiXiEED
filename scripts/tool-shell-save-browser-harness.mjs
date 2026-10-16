import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { chromium } from '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4197';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out='/tmp/pixieed-tool-shell-evidence';await mkdir(out,{recursive:true});
const b=await chromium.launch({headless:true});const c=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block',acceptDownloads:true});
const checks=[],errors=[];
await c.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin!==base||!['GET','HEAD'].includes(r.request().method()))return r.abort();
 if(u.pathname==='/js/creation/pxd-store.mjs') {const response=await r.fetch();let s=await response.text();const marker='async compareAndSwap(projectId, expectedRevisionId, record) {\n      const database = await db();';assert.ok(s.includes(marker));s=s.replace(marker,`async compareAndSwap(projectId, expectedRevisionId, record) {
 if(globalThis.__qaFailSave) throw new PxdStoreError('PXD_IDB_WRITE_FAILED','QA simulated transaction failure');
 if(globalThis.__qaHoldSave) { globalThis.__qaSaveWaiting=true; await new Promise(resolve=>globalThis.__qaReleaseSave=resolve); globalThis.__qaSaveWaiting=false; }
 const database = await db();`);return r.fulfill({response,body:s});}
 if(u.pathname==='/js/creation/draw-page.mjs'){const response=await r.fetch();let s=await response.text();const marker='return {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,';assert.ok(s.includes(marker));s=s.replace(marker,'return window.__qaDraw = {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,');return r.fulfill({response,body:s});}
 return r.continue();});
const p=await c.newPage();p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
const open=async()=>{await p.goto(base+'/draw/?mode=draw&keep=safe#save-proof');await p.waitForFunction(()=>document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'));return p.frames().find(f=>f.url().includes('/draw/editor.html'));};
const paint=async(f,x,y)=>{const r=await f.locator('#draw-canvas').boundingBox();await p.mouse.click(r.x+(x+.5)*r.width/16,r.y+(y+.5)*r.height/16);};
const state=f=>f.evaluate(()=>window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
let f;
try{
 f=await open();await p.locator('[data-embed-expand]').click();await paint(f,2,2);
 await f.evaluate(()=>window.__qaDraw.workspace.save());
 const saved=await state(f);assert.equal(await f.evaluate(()=>window.__qaDraw.workspace.dirty),false);
 assert.equal(new URL(p.url()).hash,'#save-proof');assert.equal(new URL(p.url()).pathname,'/draw/');assert.equal(new URL(p.url()).searchParams.has('embed'),false);checks.push('real edit/device save + outer pointer and fragment retained');
 await p.reload();await p.waitForFunction(()=>document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'));f=p.frames().find(f=>f.url().includes('/draw/editor.html'));assert.equal((await state(f)).image.hash,saved.image.hash);await p.locator('[data-embed-expand]').click();await paint(f,3,3);assert.notEqual((await state(f)).image.hash,saved.image.hash);checks.push('save -> refresh -> same pixels -> re-edit');
 await f.evaluate(()=>window.__qaDraw.workspace.save());
 await f.evaluate(()=>{window.__qaFailSave=true;});await paint(f,4,4);const failedArt=await state(f);
 const failure=await f.evaluate(()=>window.__qaDraw.workspace.save().then(()=>null,e=>e.code));assert.equal(failure,'PXD_IDB_WRITE_FAILED');assert.equal((await state(f)).image.hash,failedArt.image.hash);assert.equal(await f.evaluate(()=>window.__qaDraw.workspace.dirty),true);assert.equal(await f.locator('#project-open').getAttribute('data-state'),'error');checks.push('simulated save transaction failure preserves artwork and dirty/error state');
 await f.evaluate(()=>{window.__qaFailSave=false;});await f.evaluate(()=>window.__qaDraw.workspace.save());
 await f.evaluate(()=>{window.__qaHoldSave=true;});await paint(f,5,5);await f.evaluate(()=>{window.__qaPendingSave=window.__qaDraw.workspace.save();});await f.waitForFunction(()=>window.__qaSaveWaiting);
 await paint(f,6,6);const latest=await state(f);await f.evaluate(()=>{window.__qaHoldSave=false;window.__qaReleaseSave();});await f.evaluate(()=>window.__qaPendingSave);assert.equal((await state(f)).image.hash,latest.image.hash);assert.equal(await f.evaluate(()=>window.__qaDraw.workspace.dirty),true);assert.equal(await f.locator('#project-open').getAttribute('data-state'),'editing');checks.push('new edits during pending save stay dirty and remain on canvas');
 await f.evaluate(()=>window.__qaDraw.workspace.save());await p.reload();await p.waitForFunction(()=>document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'));f=p.frames().find(f=>f.url().includes('/draw/editor.html'));assert.equal((await state(f)).image.hash,latest.image.hash);checks.push('subsequent save persists concurrent edits and reloads');
 await p.locator('[data-embed-expand]').click();
 await f.locator('#creation-file-open').click();await f.locator('#project-tab-current').click();await f.locator('#pxd-panel .project-more > summary').click();
 const downloadEvent=p.waitForEvent('download');await f.locator('#pxd-export').click();const download=await downloadEvent;await download.saveAs(out+'/safe-project-backup.pxd');
 const {decodePxd}=await import('../js/creation/pxd-codec.mjs');const decoded=await decodePxd(new Uint8Array(await readFile(out+'/safe-project-backup.pxd')));assert.ok(decoded.entries.some(e=>e.path==='animations/main/state.json'));assert.ok(decoded.entries.some(e=>e.path==='audio/state.json'));checks.push('editing PXD backup downloads and decodes with complete animation component');
 await f.waitForFunction(()=>!document.querySelector('#main').inert);await f.locator('#pxd-file-input').setInputFiles(out+'/safe-project-backup.pxd');await f.waitForFunction(()=>!document.querySelector('#pxd-panel').open&&!document.querySelector('#main').inert);assert.equal((await state(f)).image.hash,latest.image.hash);await paint(f,7,7);assert.notEqual((await state(f)).image.hash,latest.image.hash);checks.push('downloaded PXD imports as a copy and remains editable');
 await p.locator('[data-tool-embed]').evaluate(n=>n.requestFullscreen());await p.waitForFunction(()=>!!document.fullscreenElement);await p.evaluate(()=>document.exitFullscreen());await p.waitForFunction(()=>!document.querySelector('[data-tool-embed]').classList.contains('tool-embed--expanded'));assert.ok(await p.locator('iframe').isVisible());checks.push('native Fullscreen API exit synchronizes to inline state');
 await p.locator('[data-embed-expand]').click();await f.locator('#creation-mode-menu > summary').click();await f.locator('[data-creation-mode="audio"]').click();await f.waitForFunction(()=>document.body.dataset.creationMode==='audio');await p.waitForFunction(()=>new URL(location.href).searchParams.get('mode')==='audio');const modeState=await state(f);await p.locator('[data-embed-expand]').click();assert.equal((await state(f)).mode,'audio');assert.equal((await state(f)).timeline.hash,modeState.timeline.hash);checks.push('mode switch updates public URL; collapse preserves mode/project');
 assert.deepEqual(errors,[]);await p.screenshot({path:out+'/save-reload-proof.png',fullPage:true});
 console.log('PASS',checks.length,checks);
}catch(e){console.error(e);await p.screenshot({path:out+'/save-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;errors.push(e.stack);}finally{await writeFile(out+'/save-results.json',JSON.stringify({checks,errors,testInjection:'IndexedDB transaction failure/delay only, with real capture and isolated local store',externalRequestsSent:0},null,2));await b.close();}
