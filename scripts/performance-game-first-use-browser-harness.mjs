/** Local first-use regression, separate from performance sampling. Synthetic data only. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4197';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out='docs/performance-20261017/game-first-use';await mkdir(out,{recursive:true});
const browser=await chromium.launch(),report={checkedAt:new Date().toISOString(),cases:[],scope:'fresh isolated storage; local synthetic files; external/non-GET/HEAD blocked; no publish/permission'};
try{
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}])for(const mode of ['jigsaw','hidden-object']){
 const c=await browser.newContext({viewport,serviceWorkers:'block'});
 await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 await c.addInitScript(()=>{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Local QA','NotAllowedError');};});
 const p=await c.newPage(),row={mode,viewport,checks:[],errors:[]};report.cases.push(row);p.setDefaultTimeout(12000);p.on('pageerror',e=>row.errors.push(e.message));
 try{
  await p.goto(base+'/'+mode+'/');
  const png=await p.evaluate(size=>{const n=document.createElement('canvas');n.width=n.height=size;const g=n.getContext('2d');g.fillStyle='#5595bc';g.fillRect(0,0,size,size);g.fillStyle='#ef7964';g.fillRect(4,4,2,2);return n.toDataURL().split(',')[1];},mode==='jigsaw'?96:16);
  const file={name:'local-synthetic.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
  if(mode==='jigsaw'){
   await p.locator('#jigsaw-source-kind').evaluate(n=>{n.value='file';n.dispatchEvent(new Event('change',{bubbles:true}));});
   await p.locator('#jigsaw-file').setInputFiles(file);await p.waitForFunction(()=>!document.querySelector('.arc-card').disabled);
   await p.locator('.arc-card').first().click();await p.locator('#jigsaw-start').click();await p.locator('#jigsaw-play').waitFor({state:'visible'});
   await p.locator('#jigsaw-tray .jigsaw-piece').first().click();await p.locator('#jigsaw-workspace').focus();await p.keyboard.press('Enter');await p.keyboard.press('ArrowRight');
   await p.locator('#jigsaw-save').click();await p.waitForFunction(()=>document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));
   const documentState=()=>p.evaluate(async()=>{const {createIndexedDbDraftAdapter,createLocalDraftStore}=await import('/js/creation/local-drafts.mjs');return(await createLocalDraftStore(createIndexedDbDraftAdapter()).load(localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1'))).document;});
   const saved=await documentState();assert.ok(saved.groups.some(g=>!g.inTray));
   await p.reload();await p.waitForFunction(()=>document.querySelector('#main').getAttribute('aria-busy')==='false');
   if(await p.locator('#jigsaw-play').isVisible()){await p.locator('.jigsaw-more > summary').click();await p.locator('#jigsaw-new').click();}
   await p.locator('#jigsaw-resume').click();await p.locator('#jigsaw-play').waitFor({state:'visible'});assert.deepEqual(await documentState(),saved);
   row.checks.push('file -> difficulty -> start -> board visible -> keyboard piece move -> device save -> reload/resume exact document');
  }else{
   await p.locator('#hidden-image-file').setInputFiles(file);await p.waitForFunction(()=>document.querySelector('#hidden-image-slot img[data-slot-preview]')?.getAttribute('src'));
   await p.locator('#hidden-start').click();await p.waitForFunction(()=>!document.querySelector('#hidden-editor').hidden);
   await p.locator('#hidden-target-settings > summary').click();await p.locator('#hidden-name').fill('合成ターゲット');await p.locator('#hidden-add').click();
   const canvas=await p.locator('#hidden-canvas').boundingBox();await p.mouse.click(canvas.x+canvas.width*5.5/16,canvas.y+canvas.height*5.5/16);
   await p.locator('#hidden-target-settings > summary').click();await p.locator('#hidden-confirm').click();await p.waitForFunction(()=>!document.querySelector('#hidden-play-local').disabled);
   await p.locator('#hidden-new').click();await p.reload();await p.locator('#hidden-resume').waitFor({state:'visible'});await p.locator('#hidden-resume').click();await p.waitForFunction(()=>!document.querySelector('#hidden-editor').hidden);
   await p.locator('#hidden-play-local').click();await p.waitForURL(/\/play\/hidden-object\/\?localHidden=/);
   await p.waitForFunction(()=>document.querySelector('#pixfind-progress')?.textContent.includes('0 / 1'));
   const image=await p.locator('#pixfind-original').boundingBox();await p.mouse.click(image.x+image.width*5.5/16,image.y+image.height*5.5/16);
   await p.locator('[data-tool-result-view="find-result"]').waitFor({state:'visible'});
   row.checks.push('file -> start -> authored target -> confirm -> reload/resume -> local player -> correct tap -> result');
  }
  assert.deepEqual(row.errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);row.status='PASS';
 }catch(e){row.status='FAIL';row.failure=e.stack;console.error(mode,viewport.width,e.message);}
 finally{await c.close();await writeFile(out+'/results.json',JSON.stringify(report,null,2));}
 console.log(mode,viewport.width,row.status);
}
}finally{await browser.close();report.completedAt=new Date().toISOString();await writeFile(out+'/results.json',JSON.stringify(report,null,2));}
if(report.cases.some(r=>r.status!=='PASS'))process.exitCode=1;
