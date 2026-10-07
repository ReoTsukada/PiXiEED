/** Real local camera capture/transfer UI with a synthetic stream, never physical camera access. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const engine=process.env.PIXIEED_JIGSAW_ENGINE||'chromium';
const baseline=process.env.PIXIEED_JIGSAW_BASELINE==='1';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4188';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const modulePath=process.env.PIXIEED_PLAYWRIGHT_MODULE||(engine==='webkit'?'/tmp/pixieed-selection-webkit-runtime/node_modules/playwright/index.mjs':'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const pw=await import(pathToFileURL(modulePath).href);
const out=`/tmp/pixieed-jigsaw-camera-handoff-${engine}-${baseline?'before':'final'}-20261006`;await mkdir(out,{recursive:true});
const originals=baseline?Object.fromEntries(['page','arcade'].map(n=>[n,execFileSync('git',['show',`5410e54033de3e04264cd252ac25f2ef6c040c85:js/creation/jigsaw-${n}.mjs`],{encoding:'utf8'})])):{};
const browser=await pw[engine].launch({headless:true,...(engine==='webkit'?{executablePath:'/Users/tsukadareine/Library/Caches/ms-playwright/webkit-2272/pw_run.sh'}:{})});
const results=[];
async function pending(page){return page.evaluate(()=>{const p=globalThis.__pixieedJigsawPendingSourcePreview;return p&&{width:p.width,height:p.height,rgba:[...p.rgba]};});}
async function canvas(page,id){return page.locator(id).evaluate(c=>({width:c.width,height:c.height,rgba:[...c.getContext('2d').getImageData(0,0,c.width,c.height).data]}));}
async function saved(page){return page.evaluate(async()=>{const {createIndexedDbDraftAdapter,createLocalDraftStore}=await import('/js/creation/local-drafts.mjs');return (await createLocalDraftStore(createIndexedDbDraftAdapter()).load(localStorage.getItem('pixieed:creation:jigsaw:last-draft:v1'))).document;});}
async function settle(page){await page.waitForFunction(()=>document.querySelector('#main')?.getAttribute('aria-busy')==='false');}
try{
 for(const [width,height,ratio] of (baseline?[[390,844,'4:3']]:[[320,568,'1:1'],[390,844,'3:4'],[844,390,'16:9'],[1280,800,'4:3']])){
  const context=await browser.newContext({viewport:{width,height},hasTouch:true});
  await context.route('**/*',r=>{const url=new URL(r.request().url());if(url.origin!==new URL(base).origin)return r.abort();const match=url.pathname.match(/\/js\/creation\/jigsaw-(page|arcade)\.mjs$/);if(baseline&&match)return r.fulfill({body:originals[match[1]],contentType:'text/javascript'});return r.continue();});
  await context.addInitScript(()=>{
   const src=document.createElement('canvas');src.width=160;src.height=120;const g=src.getContext('2d');
   function paint(){for(let y=0;y<120;y++)for(let x=0;x<160;x++){g.fillStyle=['#d63c53','#27ab78','#365dd0','#e8c740'][Math.floor(x/40)];g.fillRect(x,y,1,1);}g.fillStyle='#fff';g.fillRect(23,35,37,19);g.fillStyle='#302943';g.fillRect(87,72,31,21);requestAnimationFrame(paint);}paint();
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{window.qaSyntheticCameraCalls=(window.qaSyntheticCameraCalls||0)+1;return src.captureStream(12);}});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(`${base}/pixel-camera.html`,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.ready==='true');
   await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live'&&!document.querySelector('#capture').disabled);
   await page.locator('[data-tool="aspect"]').click();await page.locator(`#aspectPanel [data-value="${ratio}"]`).click();
   await page.keyboard.press('Escape');await page.locator('#capture').click();
   await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='captured'&&!document.querySelector('#useCameraImage').disabled);
   const image=await canvas(page,'#view');assert.ok(image.width>1&&image.height>1);
   assert.equal(await page.evaluate(()=>window.qaSyntheticCameraCalls),1);
   await page.locator('#useCameraImage').click();await page.locator('#project-send-jigsaw').click();
   await page.waitForURL(/\/jigsaw\//);await settle(page);
   if(baseline){await page.locator('#jigsaw-play').waitFor({state:'visible'});assert.equal(await page.locator('#jigsaw-setup').isVisible(),false);await page.screenshot({animations:'disabled',path:`${out}/camera-auto-start-before.png`});results.push({engine,width,height,ratio,reproduced:'Actual camera capture→transfer auto-started without difficulty'});}
   else{
    await page.waitForFunction(()=>Boolean(window.__pixieedJigsawPendingSourcePreview)&&document.querySelectorAll('.arc-card').length===4);
    assert.deepEqual(await pending(page),image);assert.equal(await page.locator('#jigsaw-play').isVisible(),false);assert.equal(await page.locator('#jigsaw-start').isDisabled(),true);assert.equal(await page.locator('.arc-card[aria-checked="true"]').count(),0);assert.equal(await page.locator('#jigsaw-grid-size').isVisible(),false);
    assert.equal(await page.locator('.arc-tile[data-kind="file"]').getAttribute('aria-checked'),'true');
    assert.deepEqual(await canvas(page,'.arc-picks canvas'),image);
    await page.locator('.arc-tile[data-kind="file"]').click();assert.deepEqual(await pending(page),image);assert.equal(await page.locator('#jigsaw-start').isDisabled(),true);
    const chooserUrl=page.url();
    await page.locator('#project-open').click();await page.locator('#project-close').click();assert.deepEqual(await pending(page),image);
    await page.goBack({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='captured');
    await page.goForward({waitUntil:'domcontentloaded'});await settle(page);await page.waitForFunction(()=>document.querySelectorAll('.arc-card').length===4&&Boolean(window.__pixieedJigsawPendingSourcePreview));assert.deepEqual(await pending(page),image);assert.equal(await page.locator('#jigsaw-start').isDisabled(),true);
    await page.reload({waitUntil:'domcontentloaded'});await settle(page);await page.waitForFunction(()=>document.querySelectorAll('.arc-card').length===4&&Boolean(window.__pixieedJigsawPendingSourcePreview));assert.deepEqual(await pending(page),image);assert.equal(await page.locator('#jigsaw-start').isDisabled(),true);
    assert.equal(await page.locator('.arc-tile[data-kind="file"]').getAttribute('aria-checked'),'true');assert.deepEqual(await canvas(page,'.arc-picks canvas'),image);
    await page.screenshot({animations:'disabled',path:`${out}/jigsaw-camera-${width}-difficulty.png`,fullPage:true});
    const card=page.locator('.arc-card:not(:disabled)').nth(width===1280?2:0);
    if(engine==='chromium'&&width===390)await card.tap();else await card.click();assert.equal(await page.locator('#jigsaw-start').isEnabled(),true);
    const px=Number(await page.locator('#jigsaw-grid-size').inputValue());await page.locator('#jigsaw-start').click();await page.locator('#jigsaw-play').waitFor({state:'visible'});assert.deepEqual(await canvas(page,'#jigsaw-preview-canvas'),image);
    await page.locator('#jigsaw-tray .jigsaw-piece').first().click();await page.locator('#jigsaw-workspace').focus();await page.keyboard.press('Enter');await page.keyboard.press('ArrowRight');await page.keyboard.press('r');
    await page.locator('#jigsaw-save').click();await page.waitForFunction(()=>document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));const documentBefore=await saved(page);assert.equal(documentBefore.layout.pieceSize,px);assert.ok(documentBefore.groups.some(g=>!g.inTray));
    const savedUrl=page.url();await page.goto(savedUrl,{waitUntil:'domcontentloaded'});await settle(page);await page.locator('#jigsaw-play').waitFor({state:'visible'});assert.deepEqual(await saved(page),documentBefore);assert.deepEqual(await canvas(page,'#jigsaw-preview-canvas'),image);assert.equal(await page.locator('#jigsaw-setup').isVisible(),false);
    await page.locator('#jigsaw-save').click();await page.waitForFunction(()=>document.querySelector('#jigsaw-status').textContent.includes('端末に保存しました'));const again=await saved(page);for(const field of ['layout','groups','tray'])assert.deepEqual(again[field],documentBefore[field]);
    // PXD remaps owner-local Draw references, while preserving their image hash.
    if(documentBefore.source.contentHash)assert.equal(again.source.contentHash,documentBefore.source.contentHash);else assert.deepEqual(again.source,documentBefore.source);
    // PXD imports assign a fresh run ID by existing design. Local draft resume keeps its ID too.
    await page.goto(`${base}/jigsaw/`,{waitUntil:'domcontentloaded'});await settle(page);await page.locator('#jigsaw-resume').click();await page.locator('#jigsaw-play').waitFor({state:'visible'});assert.deepEqual(await saved(page),again);assert.deepEqual(await canvas(page,'#jigsaw-preview-canvas'),image);
    await page.locator('#jigsaw-preview-toggle').click();await page.screenshot({animations:'disabled',path:`${out}/jigsaw-camera-${width}-play.png`});
    const originalCapture=await page.evaluate(async()=>{const pointer=JSON.parse(localStorage.getItem('pixieed:pxd:last:camera'));const {createToolProjectStore}=await import('/js/creation/tool-project-store.mjs');const {readPxdSharedImage}=await import('/js/creation/pxd-project.mjs');const p=await readPxdSharedImage(await createToolProjectStore('camera').load(pointer.projectId,pointer.revisionId));return {width:p.width,height:p.height,rgba:[...p.rgba]};});assert.deepEqual(originalCapture,image);
    // Deliberately selecting another file must replace the pending source used by Start.
    await page.goto(chooserUrl,{waitUntil:'domcontentloaded'});await settle(page);await page.waitForFunction(()=>document.querySelectorAll('.arc-card').length===4&&Boolean(window.__pixieedJigsawPendingSourcePreview));
    const replacement=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=48;c.height=32;const g=c.getContext('2d');const d=g.createImageData(48,32);for(let n=0;n<48*32;n++)d.data.set([n%251,Math.floor(n/48)*7,31,255],n*4);g.putImageData(d,0,0);return {png:c.toDataURL().split(',')[1],pixels:{width:48,height:32,rgba:[...d.data]}};});
    await page.locator('#jigsaw-file').setInputFiles({name:'deliberate-replacement.png',mimeType:'image/png',buffer:Buffer.from(replacement.png,'base64')});await page.waitForFunction(()=>!window.__pixieedJigsawPendingSourcePreview&&document.querySelector('.arc-card-count')?.textContent.includes('ピース'));assert.equal(await pending(page),undefined);await page.locator('.arc-card:not(:disabled)').first().click();await page.locator('#jigsaw-start').click();await page.locator('#jigsaw-play').waitFor({state:'visible'});assert.deepEqual(await canvas(page,'#jigsaw-preview-canvas'),replacement.pixels);
    results.push({engine,width,height,ratio,capture:`${image.width}x${image.height}`,pieceSize:px,chooserUrl,savedUrl,checks:'actual synthetic capture→transfer; explicit choice; close/back/forward/reload exact RGBA; selected partition; saved game placement/rotation resume PASS',nativeTouch:engine==='chromium'&&width===390});
   }
   assert.deepEqual(errors,[]);console.log(JSON.stringify(results.at(-1)));
  }catch(e){await page.screenshot({path:`${out}/failure-${width}.png`,fullPage:true}).catch(()=>{});throw e;}finally{await context.close();}
 }
}finally{await writeFile(`${out}/results.json`,JSON.stringify(results,null,2));await browser.close();}
