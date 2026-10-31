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
  await page.goto(base+'/output/work/?mode=convert',{waitUntil:'domcontentloaded'});
  const dialog=page.locator('#sc-settings-panel'),launcher=page.locator('[data-sc-settings-open]');await dialog.waitFor({state:'attached'});
  for(const [w,h,name] of [[320,640,'mobile-320'],[390,844,'mobile-390'],[1365,900,'desktop']]){await resizeViewport(w,h);await stable();await noOverflow(name);await page.screenshot({path:`${output}/${name}.png`,fullPage:true});}
  await resizeViewport(390,844);await launcher.click();assert.equal(await dialog.evaluate(e=>e.open),true);await page.locator('[data-sc-settings-close]').click();await closed();assert.equal(await dialog.evaluate(e=>e.open),false);assert.equal(await launcher.evaluate(e=>e===document.activeElement),true);pass('mobile settings closes and restores focus');
  await launcher.click();await page.keyboard.press('Escape');await closed();assert.equal(await dialog.evaluate(e=>e.open),false);assert.equal(await launcher.evaluate(e=>e===document.activeElement),true);pass('Escape closes settings and restores focus');
  await launcher.click();await page.goBack();await page.waitForFunction(()=>!document.querySelector('#sc-settings-panel')?.open);pass('browser Back closes settings');
  await resizeViewport(1365,900);assert.equal(await dialog.evaluate(e=>e.open),true,'desktop settings panel expected visible');await noOverflow('desktop settings');
  const png=await syntheticPng();await page.locator('[data-file]').setInputFiles({name:'synthetic-320x640.png',mimeType:'image/png',buffer:png});
  await page.locator('[data-sc-format]').waitFor({state:'visible'});await page.locator('[data-sc-format]').selectOption('jpeg');
  await page.locator('.convert-options > summary').click(); await page.locator('[data-width]').fill('20');
  const [jpegDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);
  assert.equal(await jpegDownload.failure(),null);const jpeg=await readFile(await jpegDownload.path());assert.equal(jpeg.subarray(0,2).toString('hex'),'ffd8');
  await page.locator('[data-sc-result-view]').click();await page.locator('[data-sc-result-preview] img').waitFor({state:'visible'});
  const resultVisible=await page.locator('[data-sc-result-view]').getAttribute('aria-pressed');assert.equal(resultVisible,'true');
  await page.locator('[data-sc-source-view]').click();assert.equal(await page.locator('[data-sc-source-view]').getAttribute('aria-pressed'),'true');
  const dims=await page.evaluate(async bytes=>{const blob=new Blob([new Uint8Array(bytes)],{type:'image/jpeg'});const img=new Image();img.src=URL.createObjectURL(blob);await img.decode();return [img.naturalWidth,img.naturalHeight];},[...jpeg]);assert.deepEqual(dims,[20,40]);pass('one-click JPEG save yields valid 20x40 output; optional result view and live source view toggle');
  await checkConversionMaterialStage({page,png,pass});
  for(const [w,h] of [[320,640],[390,844],[1365,900]]) { await resizeViewport(w,h);await stable();await noOverflow(`loaded ${w}x${h}`);await page.screenshot({path:`${output}/preview-${w}x${h}.png`,fullPage:false}); }
  await resizeViewport(390,844);await launcher.click();assert.equal(await page.locator('[data-width]').inputValue(),'20');await page.keyboard.press('Escape');await closed();
  await launcher.click();
  const [panelSave]=await Promise.all([page.waitForEvent('download'),page.locator('[data-sc-panel-save]').click()]);assert.equal(await panelSave.failure(),null);assert.equal(await dialog.evaluate(e=>e.open),true,'mobile save keeps settings panel open');pass('mobile settings panel saves while remaining open');await page.keyboard.press('Escape');await closed();
  await resizeViewport(844,390);await stable();await launcher.click();assert.equal(await dialog.evaluate(e=>e.matches(':modal')),true);await page.keyboard.press('Escape');await closed();
  await resizeViewport(1365,900);await stable();
  await noOverflow('loaded preview');await page.screenshot({path:output+'/preview.png',fullPage:true});
  await page.goto(base+'/output/work/?mode=convert',{waitUntil:'domcontentloaded'});await page.locator('[data-demo]').click();await page.locator('[data-rate="2"]').click();
  const [gifDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);const gif=await readFile(await gifDownload.path());assert.match(gif.subarray(0,6).toString(),/^GIF8[79]a$/);pass('GIF demo speed control one-click saves actual GIF bytes');
  // Synthetic 0.1-second PCM tone, no device or private media access.
  const wav=Buffer.alloc(44+1600);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);for(let i=0;i<800;i++)wav.writeInt16LE(Math.round(Math.sin(i/8000*440*Math.PI*2)*4000),44+i*2);
  await page.goto(base+'/output/work/?mode=convert',{waitUntil:'domcontentloaded'});await page.locator('[data-file]').setInputFiles({name:'tone.wav',mimeType:'audio/wav',buffer:wav});await page.locator('[data-sc-format]').waitFor({state:'visible'});await page.locator('[data-sc-format]').selectOption('wav');const [audioDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#output-nav-export').click()]);const audioBytes=await readFile(await audioDownload.path());assert.equal(audioBytes.subarray(0,4).toString(),'RIFF');assert.equal(audioBytes.subarray(8,12).toString(),'WAVE');pass('synthetic audio imports and one-click saves WAV bytes');
  await page.goto(base+'/output/work/',{waitUntil:'domcontentloaded'});await page.locator('#output-file-input').setInputFiles({name:'two.png',mimeType:'image/png',buffer:png});await page.locator('#output-layout').waitFor({state:'visible'});await page.locator('.sc-multiple > summary').click();await page.locator('#output-add-item').click();await page.waitForFunction(()=>document.querySelectorAll('#output-items [role="listitem"]').length>1);assert.equal(await page.locator('#output-batch-save').isVisible(),true);pass('detailed workspace imports and adds multiple outputs with batch save reachable');
  assert.deepEqual(report.errors,[],'uncaught page errors');report.status='PARTIAL';report.plannedUnrun=['UNRUN: real software keyboard, 200% browser zoom, OS save dialog, assistive technology and physical devices','UNRUN: cancellation/error during heavy conversion and mixed video+music output'];
 }catch(error){report.status='FAIL';report.failure=error.stack;console.error(error);
  if(browser){try{const pages=browser.contexts().flatMap(c=>c.pages());const last=pages.at(-1);if(last){report.failureDom=await last.evaluate(()=>({materials:document.querySelector('#main')?.conversionMaterials?.getState()?.assets?.length,loaded:document.querySelector('.sc-material-surface')?.dataset.loaded,stripHidden:document.querySelector('.sc-material-strip')?.hidden,rows:document.querySelector('.sc-material-strip')?.childElementCount}));await last.screenshot({path:output+'/failure.png',fullPage:true});}}catch{}}
 }
 finally{if(browser)await browser.close();await persist();server.close();if(report.status==='FAIL')process.exitCode=1;}
}
