/** Local acceptance of the historical five slots, including real mode actions. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4221',origin=new URL(base).origin;
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=process.env.PIXIEED_ORIGINAL_NAV_OUTPUT||'/tmp/pixieed-original-navigation';await mkdir(output,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true}),report={results:[],failures:[],realDevices:'UNTESTED',production:'UNTESTED',externalRequests:'blocked'};
const routes=['/','/draw/','/draw/?mode=camera','/draw/?mode=audio','/globe/','/jigsaw/','/game/','/spot-difference/','/hidden-object/','/play/hidden-object/','/play/spot-difference/','/profile/','/stores/','/tools/','/output/','/books/','/events/','/events/pixelween-2026/'];
try{
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
  const ctx=await browser.newContext({viewport});await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await ctx.addInitScript(()=>{window.__navQA={mediaRequests:0};if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{window.__navQA.mediaRequests++;throw new DOMException('Synthetic navigation test','NotAllowedError');}});});
  const page=await ctx.newPage();page.setDefaultTimeout(15000);let errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const path of routes){
   errors=[];const row={path,viewport};report.results.push(row);
   try{
    await page.goto(base+path,{waitUntil:'load'});await page.waitForFunction(()=>document.documentElement.classList.contains('px-header-ready'));
    const creation=path.startsWith('/draw/'),mode=new URL(base+path).searchParams.get('mode')||'draw';
    if(creation)await page.waitForFunction(m=>document.documentElement.dataset.creationModesReady==='true'&&document.body.dataset.creationMode===m&&!document.body.hasAttribute('data-creation-transition'),mode);
    await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
    row.rows=await page.locator('.app-tabs,.globe-app-tabs').evaluateAll(navs=>navs.filter(n=>n.checkVisibility()).map(nav=>{
     const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
     const controls=[...nav.children].flatMap(n=>n.matches('details')?[n.querySelector('summary')]:n.matches('a,button')?[n]:[]).filter(n=>n?.checkVisibility());
     return {rect:rect(nav),controls:controls.map(n=>{const r=rect(n),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {id:n.id||n.parentElement.id||null,key:n.dataset.nav||null,label:n.getAttribute('aria-label')||n.textContent.trim(),href:n.getAttribute('href'),radius:getComputedStyle(n).borderTopLeftRadius,disabled:n.disabled||false,hit:hit===n||n.contains(hit),rect:r};})};
    }));
    assert.ok(row.rows.length<=1,'one bottom row');
    for(const nav of row.rows){
     assert.equal(nav.controls.length,5,'historical five controls');assert.ok(nav.rect.bottom<=viewport.height+.5&&nav.rect.y>=0);
     assert.ok(nav.controls.every(n=>n.rect.width>=43.99&&n.rect.height>=43.99&&n.hit),'all controls have reachable >=44px targets');
     const middle=nav.controls[2];assert.ok(middle.rect.width>=58&&middle.rect.height>=58,'middle action is larger');
     assert.ok(Math.abs(middle.rect.x+middle.rect.width/2-(nav.rect.x+nav.rect.width/2))<=1,'primary action is physically centered');
     for(let i=1;i<5;i++)assert.ok(nav.controls[i-1].rect.right<=nav.controls[i].rect.x+.5,'no adjacent target overlap');
    }
    if(creation){
     const nav=row.rows[0];assert.deepEqual(nav.controls.map(n=>n.key||n.id),['map','creation-mode-menu',{draw:'draw-animation-play',camera:'capture',audio:'draw-music-play'}[mode],'tools','profile']);
     assert.equal(await page.locator('.app-tabs > button[data-creation-mode]').count(),0,'no rejected direct mode row');
     assert.equal(await page.locator('#creation-mode-menu [aria-pressed="true"]').count(),1);
     await page.locator('#creation-mode-menu > summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#creation-mode-menu').evaluate(n=>n.open),true);
     await page.keyboard.press('Escape');assert.equal(await page.locator('#creation-mode-menu').evaluate(n=>n.open),false);
     assert.equal(await page.evaluate(()=>document.activeElement===document.querySelector('#creation-mode-menu > summary')),true);
     row.canvasHeight=await page.locator('.draw-viewport').evaluate(n=>n.getBoundingClientRect().height);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal page overflow');
    assert.deepEqual(errors,[]);row.mediaRequests=await page.evaluate(()=>window.__navQA.mediaRequests);assert.equal(row.mediaRequests,0);
    row.image=(path==='/'?'home':path.replaceAll('/','_').replaceAll('?','_').replaceAll('=','_'))+'-'+viewport.width+'x'+viewport.height+'.png';
    await page.screenshot({path:output+'/'+row.image});row.passed=true;
   }catch(error){row.passed=false;row.error=error.message;report.failures.push({path,viewport,message:error.message});}
  }
  await ctx.close();console.log('complete',viewport.width,viewport.height);
 }
 assert.deepEqual(report.failures,[]);console.log('PASS: original five roles, centered existing play/capture/save, 44px targets, keyboard menu, all viewports');
}finally{await writeFile(output+'/report.json',JSON.stringify(report,null,2));await browser.close();}
