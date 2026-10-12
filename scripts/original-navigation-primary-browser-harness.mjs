/** Real central actions, using an isolated project and uploaded synthetic image. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createDrawDocument,encodePng} from '../js/creation/draw-core.mjs';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4221',origin=new URL(base).origin;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=process.env.PIXIEED_PRIMARY_NAV_OUTPUT||'/tmp/pixieed-original-nav-primary';await mkdir(output,{recursive:true});
const fixture=createDrawDocument(16);fixture.pixels.fill(0);for(let i=0;i<256;i++)if(i%16>=8)fixture.pixels[i]=1;
const image=Buffer.from(encodePng(fixture));
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true}),ctx=await browser.newContext({viewport:{width:390,height:844}});
const report={checks:[],errors:[],realDevices:'UNTESTED',permissions:'never granted'};
await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
await ctx.addInitScript(()=>{window.__primaryQA={mediaRequests:0};if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{window.__primaryQA.mediaRequests++;throw new DOMException('Synthetic image only','NotAllowedError');}});});
const page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
const ready=mode=>page.waitForFunction(m=>document.documentElement.dataset.creationModesReady==='true'&&document.body.dataset.creationMode===m&&!document.body.hasAttribute('data-creation-transition')&&!document.querySelector('#main').inert,mode);
const mode=async m=>{await page.locator('#creation-mode-menu > summary').click();await page.locator(`button[data-creation-mode="${m}"]`).click();await ready(m);};
try{
 await page.goto(base+'/draw/');await ready('draw');
 await page.locator('[data-action="toggle-frames"]').click();await page.locator('.animation-controls__frame-add').click();
 await page.waitForFunction(()=>document.querySelectorAll('#draw-animation-controls-panel [data-action="select-frame"]').length===2);
 await page.locator('[data-action="close-animation"]').click();
 await page.locator('#draw-animation-play').click();await page.waitForFunction(()=>document.querySelector('#draw-animation-play').getAttribute('aria-pressed')==='true');
 await page.locator('#draw-animation-play').click();await page.waitForFunction(()=>document.querySelector('#draw-animation-play').getAttribute('aria-pressed')==='false');
 report.checks.push('historical central animation action starts and stops two-frame playback');
 await mode('audio');await page.locator('#draw-music-settings > summary').click();await page.locator('#draw-music-instrument').selectOption('square');
 await page.locator('#draw-music-settings > summary').click();
 const box=await page.locator('#draw-canvas').boundingBox();await page.mouse.click(box.x+box.width*.35,box.y+box.height*.45);
 await page.locator('#draw-music-play').click();await page.waitForFunction(()=>document.querySelector('#draw-music-play').dataset.state==='playing');
 await page.locator('#draw-music-play').click();await page.waitForFunction(()=>document.querySelector('#draw-music-play').dataset.state==='idle');
 report.checks.push('historical central music action starts and stops an assigned note');
 await mode('camera');await page.locator('#cameraImageInput').setInputFiles({name:'navigation-camera-fixture.png',mimeType:'image/png',buffer:image});
 await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='live'&&!document.querySelector('#capture')?.disabled);
 await page.locator('#capture').click();await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.mode==='captured');
 assert.equal(await page.locator('.app-tabs > #capture').count(),1);
 report.checks.push('historical central capture action captures an uploaded synthetic image and retains its node');
 assert.deepEqual(report.errors,[]);report.mediaRequests=await page.evaluate(()=>window.__primaryQA.mediaRequests);assert.equal(report.mediaRequests,0);report.passed=true;
 await page.screenshot({path:output+'/camera-captured.png'});console.log('PASS:',report.checks.join('; '));
}catch(error){report.passed=false;report.failure=error.message;await page.screenshot({path:output+'/failure.png'});throw error;}
finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));await ctx.close();await browser.close();}
