/** Local-only acceptance of the approved five creation operations. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDrawDocument, encodePng } from '../js/creation/draw-core.mjs';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4252';
const origin = new URL(base).origin;
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_OPERATION_BAR_OUTPUT || '/tmp/pixieed-operation-bar-20261012';
await mkdir(output, { recursive:true });
const modulePath = process.env.PIXIEED_PLAYWRIGHT_MODULE || join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const { chromium } = await import(pathToFileURL(modulePath).href);
const fixture = createDrawDocument(16); fixture.pixels.fill(0);
const image = Buffer.from(encodePng(fixture));
const browser = await chromium.launch({ headless:true });
const viewports=process.env.PIXIEED_OPERATION_BAR_VIEWPORTS ? JSON.parse(process.env.PIXIEED_OPERATION_BAR_VIEWPORTS) : [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:568,height:320},{width:1280,height:800},{width:390,height:844,safeInset:34}];
const report = { cases:[], failures:[], externalRequests:'blocked', realDevices:'UNTESTED', cameraHardware:'UNTESTED', production:'UNTESTED' };
const ready = async (page, mode) => {
 await page.waitForFunction(m => document.documentElement.dataset.creationModesReady==='true' && document.body.dataset.creationMode===m && !document.body.hasAttribute('data-creation-transition') && !document.querySelector('#main').inert,mode);
 assert.doesNotMatch(await page.locator('#draw-status').textContent(),/モード切替を準備できませんでした|編集画面を開けませんでした/);
};
async function switchMode(page, mode) {
 if (!await page.locator('#creation-mode-menu').evaluate(n=>n.open)) await page.locator('#creation-mode-menu > summary').click();
 await page.locator(`[data-creation-mode="${mode}"]`).click(); await ready(page,mode);
}
async function geometry(page) {
 return page.locator('.app-tabs').evaluate(nav => {
  const rect = n => { const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}; };
  const controls = [...nav.children].flatMap(n=>n.matches('details')?[n.querySelector('summary')]:n.matches('button,a')?[n]:[]).filter(n=>n?.checkVisibility());
  return { nav:rect(nav), main:rect(document.querySelector('#main')), controls:controls.map(n=>{const r=rect(n),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:n.id||n.parentElement.id,label:n.getAttribute('aria-label'),disabled:n.disabled||false,hit:hit===n||n.contains(hit),rect:r};}),overflow:document.documentElement.scrollWidth>innerWidth+1 };
 });
}
try {
 for (const viewport of viewports) {
  const suffix=`${viewport.width}x${viewport.height}${viewport.safeInset?'-safe'+viewport.safeInset:''}`;
  const context=await browser.newContext({ viewport:{width:viewport.width,height:viewport.height} });
  await context.route('**/*',async r=>{
   const url=new URL(r.request().url());if(url.origin!==origin)return r.abort();
   if(viewport.safeInset&&url.pathname.endsWith('.css')) {const response=await r.fetch();return r.fulfill({response,body:(await response.text()).replace(/env\(safe-area-inset-bottom(?:,[^)]*)?\)/g,`${viewport.safeInset}px`)});}
   return r.continue();
  });
  await context.addInitScript(()=>{window.__barQA={mediaRequests:0};if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{window.__barQA.mediaRequests++;throw new DOMException('Uploaded fixture only','NotAllowedError');}});});
  const page=await context.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
   await page.goto(base+'/draw/');await ready(page,'draw');
   const box=await page.locator('#draw-canvas').boundingBox();await page.mouse.click(box.x+box.width*.3,box.y+box.height*.4);
   const original=await page.locator('#draw-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data));
   for (const mode of ['draw','audio','camera']) {
    if(mode!=='draw')await switchMode(page,mode);
    const row={viewport,mode};report.cases.push(row);row.geometry=await geometry(page);
    const g=row.geometry;assert.equal(g.controls.length,5);assert.deepEqual(g.controls.map(n=>n.id),['creation-file-open','creation-mode-menu',{draw:'draw-animation-play',audio:'draw-music-play',camera:'capture'}[mode],'creation-settings-open','creation-output-open']);
    assert.equal(g.overflow,false);assert.ok(g.nav.bottom<=viewport.height+1);
    assert.ok(g.controls.every(n=>n.rect.width>=44&&n.rect.height>=44&&n.hit));
    assert.ok(g.main.bottom<=Math.min(...g.controls.map(n=>n.rect.y))+1,'editor reservation clears all bottom targets');
    assert.ok(Math.abs(g.controls[2].rect.x+g.controls[2].rect.width/2-(g.nav.x+g.nav.width/2))<1);
    for(let i=1;i<5;i++)assert.ok(g.controls[i-1].rect.right<=g.controls[i].rect.x+1);
    const duplicates=['.project-bar','#creation-project-settings-open','#draw-settings-picker > summary','#draw-output > summary',...(mode==='audio'?['#draw-music-settings > summary']:[]),...(mode==='camera'?['#cameraChooseImage','#cameraFallbackChoose']:[])];
    for(const selector of duplicates)assert.equal(await page.locator(selector).evaluateAll(nodes=>nodes.some(n=>n.checkVisibility())),false,`duplicate launcher hidden: ${selector}`);
    const labels=await page.locator('.app-tabs .app-tab-label').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility()).map(n=>({text:n.textContent,font:getComputedStyle(n).fontSize,color:getComputedStyle(n).color,lineHeight:getComputedStyle(n).lineHeight,overflow:n.scrollWidth>n.clientWidth+1})));
    assert.deepEqual(labels.map(n=>n.text),['ファイル','モード','設定','出力']);assert.equal(new Set(labels.map(n=>`${n.font}/${n.color}/${n.lineHeight}`)).size,1);assert.ok(labels.every(n=>parseFloat(n.font)<=11&&!n.overflow));
    await page.locator('#creation-file-open').click();await page.locator('#pxd-panel').waitFor({state:'visible'});
    assert.equal(await page.locator('#pxd-panel #pxd-open').count(),1);
    assert.equal(await page.locator('#creation-file-image-open').isVisible(),true);
    await page.keyboard.press('Escape');await page.locator('#pxd-panel').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'creation-file-open');
    await page.locator('#creation-settings-open').click();
    await page.locator('#creation-settings-panel').waitFor({state:'visible'});
    await page.keyboard.press('Escape');await page.locator('#creation-settings-panel').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'creation-settings-open');
    await page.locator('#creation-settings-open').click();await page.locator('#creation-canvas-settings-open').click();
    await page.locator('#creation-project-settings-panel').waitFor({state:'visible'});assert.equal(await page.locator('#creation-project-width').inputValue(),'16');
    await page.locator('#creation-project-settings-panel button[aria-label="設定を閉じる"]').click();
    await page.locator('#creation-project-settings-panel').waitFor({state:'hidden'});
    await page.locator('#creation-settings-open').click();await page.locator('#creation-mode-settings-open').click();
    if(mode==='camera')await page.waitForFunction(()=>document.querySelector('#pixelStudio').dataset.tray==='tone');
    else await page.waitForFunction(id=>document.querySelector(id).open,mode==='draw'?'#draw-settings-picker':'#draw-music-settings');
    if(mode==='audio'&&viewport.width===390&&!viewport.safeInset)await page.locator('#draw-music-instrument').selectOption('square');
    await page.screenshot({path:join(output,`${mode}-settings-${suffix}.png`)});
    await page.keyboard.press('Escape');
    if(mode==='camera')await page.waitForFunction(()=>!document.querySelector('#pixelStudio').dataset.tray);
    else await page.waitForFunction(id=>!document.querySelector(id).open,mode==='draw'?'#draw-settings-picker':'#draw-music-settings');
    await page.waitForFunction(()=>document.activeElement.id==='creation-settings-open');
    if(mode==='audio'&&viewport.width===390&&!viewport.safeInset) {const box=await page.locator('#draw-canvas').boundingBox();await page.mouse.click(box.x+box.width*.35,box.y+box.height*.45);}
    if(mode==='camera') {
     assert.equal(await page.locator('#creation-output-open').isDisabled(),true);
     assert.match(await page.locator('#creation-output-open').getAttribute('aria-describedby'),/creation-output-status/);
    } else if(mode==='audio') {
     await page.locator('#creation-output-open').click();
     await page.locator('#creation-music-output-section').waitFor({state:'visible'});assert.equal(await page.locator('#draw-music-wav').isVisible(),true);assert.equal(await page.locator('#draw-music-video').isVisible(),true);
     assert.equal(await page.locator('#draw-music-instrument').isVisible(),false,'output panel contains output choices');
     await page.keyboard.press('Escape');
     await page.waitForFunction(()=>document.activeElement.id==='creation-output-open');
     if(viewport.width===390&&!viewport.safeInset) {
      await page.locator('#creation-output-open').click();
      await page.locator('#draw-music-wav').click();
      await page.waitForURL('**/output/**');await page.locator('#output-format-select').waitFor({state:'attached'});
      await page.goBack();await ready(page,mode);
     }
    } else {
     await page.locator('#creation-output-open').click();await page.waitForURL('**/output/**');await page.locator('#output-format-select').waitFor({state:'attached'});
     await page.goBack();await ready(page,'draw');
    }
    await page.screenshot({path:join(output,`${mode}-${suffix}.png`)});row.passed=true;
   }
   await page.locator('#creation-file-open').click();await page.locator('#pxd-panel').waitFor({state:'visible'});
   const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.locator('#creation-file-image-open').click()]);
   await chooser.setFiles({name:'bar-fixture.png',mimeType:'image/png',buffer:image});
   await page.waitForFunction(()=>document.querySelector('#pixelStudio').dataset.mode==='live'&&!document.querySelector('#capture').disabled);
   await page.locator('#capture').click();await page.waitForFunction(()=>document.querySelector('#pixelStudio').dataset.mode==='captured');
   await page.waitForFunction(()=>!document.querySelector('#creation-output-open').disabled);
   assert.equal(await page.locator('#creation-settings-open').isDisabled(),true);
   assert.equal(await page.locator('#savePng').isVisible(),false,'camera output is offered only in operation bar');
   assert.match(await page.locator('#creation-file-open').getAttribute('aria-label'),/ファイル/);
   assert.equal(await page.locator('#capture').getAttribute('data-tool-result-return'),'');
   await page.locator('#creation-file-open').click();await page.locator('#pxd-panel').waitFor({state:'visible'});
   await page.keyboard.press('Escape');await page.locator('#pxd-panel').waitFor({state:'hidden'});
   assert.equal(await page.locator('#pixelStudio').getAttribute('data-mode'),'captured');
   await page.locator('#capture').click();await page.waitForFunction(()=>document.querySelector('#pixelStudio').dataset.mode==='live');
   await page.waitForFunction(()=>document.querySelector('#creation-output-open').disabled&&!document.querySelector('#creation-settings-open').disabled);
   await page.locator('#capture').click();await page.waitForFunction(()=>document.querySelector('#pixelStudio').dataset.mode==='captured'&&!document.querySelector('#creation-output-open').disabled);
   await page.screenshot({path:join(output,`camera-captured-${suffix}.png`)});
   await page.locator('#creation-output-open').click();await page.waitForURL('**/output/**');await page.locator('#output-format-select').waitFor({state:'attached'});
   await page.goBack();await ready(page,'camera');
   await switchMode(page,'draw');
   assert.deepEqual(await page.locator('#draw-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data)),original,'art pixels survive switching and output/back');
   for(const href of ['/globe/','/tools/','/profile/'])assert.equal(await page.locator(`#site-menu a[href="${href}"]`).count(),1);
   assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.__barQA.mediaRequests),0);
  } catch(error) {report.failures.push({viewport,message:error.message,errors});console.log('FAIL',viewport,error.message);await page.screenshot({path:join(output,`failure-${viewport.width}x${viewport.height}.png`)});}
  finally {await context.close();}
  console.log('complete',viewport.width,viewport.height);
 }
 assert.deepEqual(report.failures,[]);report.passed=true;
} finally {await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
