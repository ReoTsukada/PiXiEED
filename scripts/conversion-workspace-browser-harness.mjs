#!/usr/bin/env node
/** Real-Chromium regression for the compact conversion workspace; local bind restrictions remain respected. */
import assert from 'node:assert/strict';
import { checkConversionMaterialStage } from './conversion-stage-browser-cases.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repository=resolve(fileURLToPath(new URL('../',import.meta.url)));
const root=resolve(process.env.PIXIEED_BROWSER_ROOT||repository);
const output=resolve(process.env.PIXIEED_BROWSER_ARTIFACTS||resolve(repository,'../verification/conversion-workspace'));
await mkdir(output,{recursive:true});
const report={status:'UNRUN',source:root,cases:[],plannedUnrun:['mobile viewport overflow at 320x640, 390x844, 1365x900 and after import','settings open/close, Escape focus return, browser Back, persistent values, mobile panel save without dismissal','one-click JPEG save, decoded dimensions, optional encoded-byte preview and live source preview','GIF demo and playback speed regression','WAV synthetic audio import and one-click save','detailed /output/work/ multiple-output route smoke','error/cancel behavior if deterministic controls are available','external request blocking and uncaught page errors'],errors:[],blockedRequests:[]};
const persist=()=>writeFile(output+'/report.json',JSON.stringify(report,null,2));
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.wasm':'application/wasm','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const f=resolve(root,'.'+p);if(!f.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',mime[extname(f)]||'application/octet-stream');res.end(await readFile(f));}catch{res.statusCode=404;res.end();}});
try { await new Promise((ok,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',ok);}); }
catch(error){report.status='BLOCKED';report.blocker={action:'bind local source server',target:'127.0.0.1 ephemeral port',reason:error.message};report.plannedUnrun=report.plannedUnrun.map(s=>'UNRUN: '+s);await persist();console.error('BLOCKED '+error.message);process.exitCode=2;}
if(server.listening){
 const base=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(process.env.PIXIEED_PLAYWRIGHT_MODULE?pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href:'playwright');
 let browser;
 try {
  browser=await chromium.launch({executablePath:process.env.PIXIEED_CHROME_EXECUTABLE||undefined,args:['--no-sandbox']});
  report.browser=browser.version();report.status='RUNNING';
  const context=await browser.newContext({viewport:{width:1365,height:900},acceptDownloads:true});
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin===base)return route.continue();report.blockedRequests.push(route.request().url());return route.abort();});
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
  const pass=s=>{report.cases.push(s);console.log('PASS '+s);};
  const noOverflow=async label=>{const v=await page.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight,iw:innerWidth,ih:innerHeight}));assert.ok(v.w<=v.iw+1,`${label} horizontal overflow ${JSON.stringify(v)}`);assert.ok(v.h<=v.ih+1,`${label} vertical overflow ${JSON.stringify(v)}`);};
  const syntheticPng=async()=>Buffer.from(await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=320;c.height=640;const x=c.getContext('2d');x.fillStyle='#e63';x.fillRect(0,0,320,640);x.fillStyle='#18a';x.fillRect(20,30,180,250);const b=await new Promise(r=>c.toBlob(r,'image/png'));return [...new Uint8Array(await b.arrayBuffer())];}));
  let downloads=0; page.on('download',()=>downloads++); page.on('dialog', d=>d.accept());
  const closed=()=>page.waitForFunction(()=>!document.querySelector('#sc-settings-panel')?.open);
  const stable=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const resizeViewport=async(width,height)=>{
    await page.setViewportSize({width,height});
    await page.waitForFunction(wide=>{const panel=document.querySelector('#sc-settings-panel');return Boolean(panel&&(wide?panel.open&&!panel.matches(':modal'):!panel.open));},width>=960);
    await stable();
  };
  const checkEmptyArea = async label => {
    const area=await page.evaluate(()=>{
      const empty=document.querySelector('.sc-empty-state'),button=empty?.querySelector('.sc-empty-chooser');
      const visible=node=>node&&getComputedStyle(node).display!=='none'&&!node.hidden;
      const demo=empty?.querySelector('[data-demo]'),status=empty?.querySelector('#output-import-status');
      return {empty:empty?.getBoundingClientRect().toJSON(),button:button?.getBoundingClientRect().toJSON(),
        demoHeight:visible(demo)?demo.getBoundingClientRect().height:0,statusHeight:visible(status)?status.getBoundingClientRect().height:0};
    });
    assert.ok(area.empty&&area.button,`${label}: native empty chooser exists`);
    assert.ok(area.button.width>=area.empty.width-28,`${label}: add target fills empty width ${JSON.stringify(area)}`);
    assert.ok(area.button.height>=Math.max(180,area.empty.height-area.demoHeight-area.statusHeight-56),`${label}: add target fills available preview height ${JSON.stringify(area)}`);
  };
  const checkCommonNav = async label => {
    const shape=await page.evaluate(()=>{
      const nav=document.querySelector('.public-destination-nav'),dock=document.querySelector('.sc-save-bar');
      const rect=nav.getBoundingClientRect(),style=getComputedStyle(nav);
      return {height:rect.height,radius:style.borderRadius,gap:dock?rect.top-dock.getBoundingClientRect().bottom:null,
        links:[...nav.querySelectorAll('[data-public-nav]')].map(link=>({height:link.getBoundingClientRect().height,radius:getComputedStyle(link).borderRadius,direction:getComputedStyle(link).flexDirection,icon:link.querySelector('img').getBoundingClientRect().width})),
        current:nav.querySelectorAll('[aria-current="page"]').length};
    });
    assert.equal(shape.height,56,label);assert.equal(shape.radius,'18px',label);assert.equal(shape.links.length,5,label);assert.equal(shape.current,0,label);
    for(const link of shape.links){assert.equal(link.height,44,label);assert.equal(link.radius,'10px',label);assert.equal(link.direction,'column',label);assert.equal(link.icon,24,label);}
    if(shape.gap!==null) assert.ok(shape.gap>=7,`${label}: save/nav overlap ${JSON.stringify(shape)}`);
  };
  await page.goto(base+'/output/',{waitUntil:'domcontentloaded'});await page.locator('.public-destination-nav').waitFor({state:'visible'});await checkCommonNav('guide common navigation');
  await page.locator('[data-public-nav="home"]').focus();await page.keyboard.press('Tab');
  assert.equal(await page.locator('[data-public-nav="explore"]').evaluate(node=>node===document.activeElement),true);
  assert.equal(await page.locator('[data-public-nav="explore"]').evaluate(node=>getComputedStyle(node).outlineWidth),'3px');
  pass('guide uses the shared 56/44px navigation, icon placement and keyboard focus');
  await page.goto(base+'/output/work/?mode=convert&to=jpeg',{waitUntil:'domcontentloaded'});
  const dialog=page.locator('#sc-settings-panel'),launcher=page.locator('[data-sc-settings-open]');await dialog.waitFor({state:'attached'});
  for(const [w,h,name] of [[320,640,'mobile-320'],[390,844,'mobile-390'],[1365,900,'desktop']]){await resizeViewport(w,h);await stable();await noOverflow(name);await checkCommonNav(name);await checkEmptyArea(name);await page.screenshot({path:`${output}/${name}.png`,fullPage:true});}
  await resizeViewport(390,844);await launcher.click();assert.equal(await dialog.evaluate(e=>e.open),true);await page.locator('[data-sc-settings-close]').click();await closed();assert.equal(await dialog.evaluate(e=>e.open),false);assert.equal(await launcher.evaluate(e=>e===document.activeElement),true);pass('mobile settings closes and restores focus');
  await launcher.click();await page.keyboard.press('Escape');await closed();assert.equal(await dialog.evaluate(e=>e.open),false);assert.equal(await launcher.evaluate(e=>e===document.activeElement),true);pass('Escape closes settings and restores focus');
  await launcher.click();await page.goBack();await page.waitForFunction(()=>!document.querySelector('#sc-settings-panel')?.open);pass('browser Back closes settings');
  await resizeViewport(1365,900);assert.equal(await dialog.evaluate(e=>e.open),true,'desktop settings panel expected visible');await noOverflow('desktop settings');
  const png=await syntheticPng();const emptyChooser=page.waitForEvent('filechooser');await page.locator('.sc-empty-chooser').click({position:{x:8,y:8}});await(await emptyChooser).setFiles({name:'synthetic-320x640.png',mimeType:'image/png',buffer:png});
  await page.locator('[data-sc-format]').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.convert-intent')?.dataset.state==='ready'&&document.querySelector('[data-format]')?.value==='jpeg'&&document.querySelector('[data-sc-format]')?.value==='jpeg'&&document.querySelector('.sc-material-surface')?.dataset.loaded==='true');await stable();
  assert.equal(await page.locator('.convert-intent').isVisible(),true,'JPEG intent remains visible after PNG import');
  const bounds=await page.evaluate(()=>{const rect=s=>document.querySelector(s)?.getBoundingClientRect();const preview=rect('.convert-preview'),surface=rect('.sc-material-surface'),main=rect('#main');return {previewBottom:preview?.bottom,surfaceBottom:surface?.bottom,mainBottom:main?.bottom};});
  assert.ok(bounds.previewBottom<=bounds.surfaceBottom+1&&bounds.surfaceBottom<=bounds.mainBottom+1,`loaded preview is clipped: ${JSON.stringify(bounds)}`);
  await page.locator('.convert-options > summary').click(); await page.locator('[data-width]').fill('20');
  const [jpegDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);
  assert.equal(await jpegDownload.failure(),null);const jpeg=await readFile(await jpegDownload.path());assert.equal(jpeg.subarray(0,2).toString('hex'),'ffd8');
  await page.locator('[data-sc-result-view]').click();await page.locator('[data-sc-result-preview] img').waitFor({state:'visible'});
  const resultVisible=await page.locator('[data-sc-result-view]').getAttribute('aria-pressed');assert.equal(resultVisible,'true');
  await page.locator('[data-sc-source-view]').click();assert.equal(await page.locator('[data-sc-source-view]').getAttribute('aria-pressed'),'true');
  const dims=await page.evaluate(async bytes=>{const blob=new Blob([new Uint8Array(bytes)],{type:'image/jpeg'});const img=new Image();img.src=URL.createObjectURL(blob);await img.decode();return [img.naturalWidth,img.naturalHeight];},[...jpeg]);assert.deepEqual(dims,[20,40]);pass('one-click JPEG save yields valid 20x40 output; optional result view and live source view toggle');
  assert.equal(await page.locator('.sc-save-actions #output-nav-export').count(), 1, 'primary save has a dedicated action bar');
  assert.equal(await page.locator('.public-destination-nav [data-public-nav="create"]').count(), 1, 'global Create navigation retained');
  await checkConversionMaterialStage({page,png,pass});
  // Route choices retain the original media/text engines; no format-list redesign.
  const retainedMaterials=await page.evaluate(()=>document.querySelector('#main').conversionMaterials.getState().assets.map(asset=>asset.id));
  await page.locator('.sc-route-options > summary').click();
  const sourceText=page.locator('[data-sc-route-name="sc-source-choice"] input[data-sc-route-value="text"]');
  const targetText=page.locator('[data-sc-route-name="sc-target-choice"] input[data-sc-route-value="text"]');
  await sourceText.check();await page.waitForFunction(()=>document.querySelector('[data-sc-source]').value==='text'&&document.querySelector('#main').dataset.workspaceMedia==='false');
  await page.locator('[data-tx-source]').fill('Synthetic route retention');
  await launcher.click();assert.equal(await sourceText.isChecked(),true);assert.equal(await targetText.isDisabled(),true);assert.equal(await page.locator('.sc-route-native').isVisible(),false,'native fallback is hidden after successful enhancement in text mode');
  await sourceText.focus();await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>document.querySelector('#main').dataset.workspaceMedia==='true');
  assert.equal(await page.locator('[data-width]').inputValue(),'20');assert.equal(await page.locator('[data-sc-format]').inputValue(),'jpeg');
  assert.deepEqual(await page.evaluate(()=>document.querySelector('#main').conversionMaterials.getState().assets.map(asset=>asset.id)),retainedMaterials);
  assert.equal(await page.locator('[data-tx-source]').inputValue(),'Synthetic route retention');
  await targetText.check();await page.waitForFunction(()=>document.querySelector('[data-sc-target]').value==='text');
  await launcher.click();assert.equal(await targetText.isChecked(),true);await targetText.focus();await page.keyboard.press('ArrowLeft');await page.waitForFunction(()=>document.querySelector('#main').dataset.workspaceMedia==='true');
  assert.equal(await page.locator('[data-sc-source]').inputValue(),'file');assert.equal(await page.locator('[data-sc-target]').inputValue(),'file');
  assert.equal(await page.locator('[data-sc-route-choice] input:checked').count(),2);
  await page.locator('.sc-route-options > summary').click();
  pass('source/output radio choices retain three legal routes, media inputs, pending dimensions and text; keyboard arrows restore file conversion');

  for(const [w,h] of [[320,640],[390,844],[1365,900]]) { await resizeViewport(w,h);await stable();await noOverflow(`loaded ${w}x${h}`);await checkCommonNav(`loaded ${w}x${h}`);await page.screenshot({path:`${output}/preview-${w}x${h}.png`,fullPage:false}); }
  await resizeViewport(390,844);await launcher.click();await page.locator('#sc-settings-panel [data-sc-format]').waitFor({state:'visible'});assert.equal(await page.locator('#sc-settings-panel [data-sc-format]').isVisible(),true,'format remains reachable inside modal');assert.equal(await page.locator('[data-width]').inputValue(),'20');await page.keyboard.press('Escape');await closed();
  await launcher.click();
  const [panelSave]=await Promise.all([page.waitForEvent('download'),page.locator('[data-sc-panel-save]').click()]);assert.equal(await panelSave.failure(),null);assert.equal(await dialog.evaluate(e=>e.open),true,'mobile save keeps settings panel open');pass('mobile settings panel saves while remaining open');await page.keyboard.press('Escape');await closed();
  await resizeViewport(844,390);await stable();await launcher.click();assert.equal(await dialog.evaluate(e=>e.matches(':modal')),true);await page.keyboard.press('Escape');await closed();
  await resizeViewport(1365,900);await stable();
  await noOverflow('loaded preview');await page.screenshot({path:output+'/preview.png',fullPage:true});
  await page.goto(base+'/output/work/?mode=convert',{waitUntil:'domcontentloaded'});await page.locator('[data-demo]').click();await page.locator('[data-rate="2"]').click();
  const [gifDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);const gif=await readFile(await gifDownload.path());assert.match(gif.subarray(0,6).toString(),/^GIF8[79]a$/);pass('GIF demo speed control one-click saves actual GIF bytes');
  await page.locator('[data-sc-format]').selectOption('jpeg');
  const convertOptions=page.locator('.convert-options');if(!(await convertOptions.evaluate(node=>node.open)))await page.locator('.convert-options > summary').click();
  await page.locator('[data-frame]').fill('2');
  const gifAdd=page.waitForEvent('filechooser');await page.locator('.sc-material-heading [data-sc-material-add]').click();await(await gifAdd).setFiles({name:'after-gif.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(()=>document.querySelector('#main').conversionMaterials.getState().assets.length===2&&document.querySelector('#main').getAttribute('aria-busy')!=='true');
  const unchangedFrame=await page.locator('[data-frame]').inputValue();await page.locator('.sc-material-card').last().hover();await page.locator('.sc-material-card [data-remove-material]').last().click();
  await page.waitForFunction(()=>document.querySelector('#main').conversionMaterials.getState().assets.length===1);assert.equal(await page.locator('[data-frame]').inputValue(),unchangedFrame);
  await page.locator('[data-sc-material-undo]').click();await page.waitForFunction(()=>document.querySelector('#main').conversionMaterials.getState().assets.length===2);assert.equal(await page.locator('[data-frame]').inputValue(),unchangedFrame);
  pass('hover delete and Undo preserve a non-first static frame within an animated input');
  // Synthetic 0.1-second PCM tone, no device or private media access.
  const wav=Buffer.alloc(44+1600);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);for(let i=0;i<800;i++)wav.writeInt16LE(Math.round(Math.sin(i/8000*440*Math.PI*2)*4000),44+i*2);
  await page.goto(base+'/output/work/?mode=convert',{waitUntil:'domcontentloaded'});await page.locator('[data-file]').setInputFiles({name:'tone.wav',mimeType:'audio/wav',buffer:wav});await page.locator('[data-sc-format]').waitFor({state:'visible'});await page.locator('[data-sc-format]').selectOption('wav');const [audioDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);const audioBytes=await readFile(await audioDownload.path());assert.equal(audioBytes.subarray(0,4).toString(),'RIFF');assert.equal(audioBytes.subarray(8,12).toString(),'WAVE');pass('synthetic audio imports and one-click saves WAV bytes');
  await page.goto(base+'/output/work/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#output-layout')?.conversionActions&&document.querySelector('#main')?.dataset.smartConversion==='true');
  await page.locator('.sc-empty-chooser').waitFor({state:'visible'});await checkEmptyArea('detailed empty');
  await page.locator('#output-file-input').setInputFiles({name:'two.png',mimeType:'image/png',buffer:png});
  await page.waitForURL(url=>url.searchParams.has('id'));
  // A single staged image opens the shared converter. Use its real advanced link.
  await page.locator('.sc-original-tools > summary').click();await page.locator('[data-advanced]').click();
  await page.locator('#output-layout').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#main')?.dataset.smartConversion==='true'&&document.querySelector('#output-layout')?.conversionActions);
  const materialBefore=await page.evaluate(()=>document.querySelector('#output-layout').conversionActions.getMaterialState());
  await page.locator('[data-sc-size-edit]').click();await page.locator('#output-width').fill('160');
  const detailChooser=page.waitForEvent('filechooser');await page.locator('[data-sc-material-replace]').click();await(await detailChooser).setFiles({name:'detail-replacement.png',mimeType:'image/png',buffer:png});
  await page.waitForFunction(before=>{const state=document.querySelector('#output-layout').conversionActions.getMaterialState();return !state.busy&&state.activeId===before.activeId&&state.frameCount===before.frameCount&&state.assets.length===before.assets.length&&state.outputCount===before.outputCount;},materialBefore);
  assert.equal(await page.locator('#output-width').inputValue(),'160');
  const materialAfter=await page.evaluate(()=>document.querySelector('#output-layout').conversionActions.getMaterialState());
  assert.equal(materialAfter.assets.length,1);assert.equal(materialAfter.frameCount,1);assert.equal(materialAfter.outputCount,1);assert.equal(materialAfter.activeId,materialBefore.activeId);
  pass('detailed replacement retains exactly one frame/source, pending dimensions and output references');
  await page.locator('.sc-multiple > summary').click();await page.locator('#output-add-item').click();await page.waitForFunction(()=>document.querySelectorAll('#output-items [role="listitem"]').length>1);assert.equal(await page.locator('#output-batch-save').isVisible(),true);pass('detailed workspace imports through advanced link and adds multiple outputs with batch save reachable');
  const included=page.locator('#output-items input[type="checkbox"]');await included.nth(0).check();await included.nth(1).check();
  await page.locator('[data-sc-batch]').waitFor({state:'visible'});assert.equal(await page.locator('[data-sc-batch]').innerText(),'PNG 2件を保存');
  const batchDownloads=new Promise((resolve,reject)=>{const files=[];const timer=setTimeout(()=>{page.off('download',onDownload);reject(new Error(`expected two batch downloads, got ${files.length}`));},20000);const onDownload=file=>{files.push(file);if(files.length===2){clearTimeout(timer);page.off('download',onDownload);resolve(files);}};page.on('download',onDownload);});
  await page.locator('[data-sc-batch]').click();const savedBatch=await batchDownloads;
  for(const file of savedBatch){assert.equal(await file.failure(),null);assert.equal((await readFile(await file.path())).subarray(0,8).toString('hex'),'89504e470d0a1a0a');}
  pass('changing output selection refreshes the fixed batch action; one click downloads two actual PNG outputs');
  // New clarity cases are prepared for approved CI; never run to bypass local bind denial.
  const detailApi = () => page.evaluate(() => document.querySelector('#output-layout').conversionActions.getMaterialState());
  const detailCount = count => page.waitForFunction(count => { const state = document.querySelector('#output-layout').conversionActions.getMaterialState(); return !state.busy && state.assets.length === count && document.querySelector('.sc-material-surface')?.dataset.loaded === String(count > 0); }, count);
  const outputBytes = () => page.evaluate(async () => Promise.all([...document.querySelectorAll('.output-item__download')].map(async link => ({ name:link.download, bytes:[...new Uint8Array(await (await fetch(link.href)).arrayBuffer())] }))));
  const keptOutputs = await outputBytes();
  await page.locator('[data-sc-size-edit]').click();await page.locator('#output-width').fill('120');
  await page.locator('[data-select-material]').first().click();
  await page.locator('#output-timeline-preview').waitFor({state:'visible'});
  assert.equal(await page.locator('#output-width').inputValue(),'120','single-source selection preserves pending size');
  const addAudio = page.waitForEvent('filechooser'); await page.locator('.sc-material-heading [data-sc-material-add]').click(); await(await addAudio).setFiles({name:'history.wav',mimeType:'audio/wav',buffer:wav}); await detailCount(2);
  const originalSource = (await detailApi()).assets.find(asset=>asset.kind==='rgba-frames').id;
  await page.evaluate(id=>document.querySelector('#output-layout').conversionActions.selectAsset(id),originalSource);
  await page.locator('[data-sc-size-edit]').click(); await page.locator('#output-width').fill('120');
  await page.evaluate(id=>document.querySelector('#output-layout').conversionActions.removeAsset(id),originalSource); await detailCount(1);
  assert.equal((await detailApi()).activeId,(await detailApi()).assets[0].id,'removal selects a real surviving input');
  await page.locator('[data-sc-material-undo]').click(); await detailCount(2);
  await page.locator('#output-timeline-preview').waitFor({state:'visible'});
  assert.equal(await page.locator('#output-width').inputValue(),'120','Undo preserves edited dimensions without asynchronous reset');
  assert.deepEqual(await outputBytes(),keptOutputs,'material delete/undo retain generated output bytes');
  for (const asset of (await detailApi()).assets) { await page.evaluate(id=>document.querySelector('#output-layout').conversionActions.removeAsset(id),asset.id); }
  await detailCount(0); assert.equal(await page.locator('#output-start').isVisible(),true);
  await page.locator('[data-sc-material-undo]').click(); await detailCount(1);
  const lastAsset=(await detailApi()).assets[0].id;await page.evaluate(id=>document.querySelector('#output-layout').conversionActions.removeAsset(id),lastAsset);await detailCount(0);
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#output-layout')?.conversionActions?.getMaterialState()?.outputCount===2&&document.querySelectorAll('.output-item__download').length===2);await detailCount(0);
  assert.deepEqual(await outputBytes(),keptOutputs,'reload keeps outputs and does not resurrect deleted input');
  const sameRecord=page.url();await page.locator('#output-file-input').setInputFiles({name:'after-empty.png',mimeType:'image/png',buffer:png});await detailCount(1);assert.equal(page.url(),sameRecord);
  assert.deepEqual(await outputBytes(),keptOutputs,'adding after empty retains separate output items');
  const [afterEmptySave]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);assert.equal(await afterEmptySave.failure(),null);assert.equal((await readFile(await afterEmptySave.path())).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  pass('detailed direct source preview, survivor selection, exact output preservation, pending-size Undo, empty reload and add');
  assert.deepEqual(report.errors,[],'uncaught page errors');report.status='PARTIAL';report.plannedUnrun=['UNRUN: real software keyboard, 200% browser zoom, OS save dialog, assistive technology and physical devices','UNRUN: cancellation/error during heavy conversion and mixed video+music output'];
 }catch(error){report.status='FAIL';report.failure=error.stack;console.error(error);
  if(browser){try{const pages=browser.contexts().flatMap(c=>c.pages());const last=pages.at(-1);if(last){report.failureDom=await last.evaluate(()=>({url:location.href,panelOpen:document.querySelector('#sc-settings-panel')?.open,importStatus:document.querySelector('#output-import-status')?.textContent,status:document.querySelector('#output-status,[data-status]')?.textContent,materials:document.querySelector('#main')?.conversionMaterials?.getState()?.assets?.length,loaded:document.querySelector('.sc-material-surface')?.dataset.loaded,stripHidden:document.querySelector('.sc-material-strip')?.hidden,rows:document.querySelector('.sc-material-strip')?.childElementCount}));await last.screenshot({path:output+'/failure.png',fullPage:true});}}catch{}}
 }
 finally{if(browser)await browser.close();await persist();server.close();if(report.status==='FAIL')process.exitCode=1;}
}
