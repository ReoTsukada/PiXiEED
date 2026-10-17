import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4197';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out='/tmp/pixieed-tool-shell-evidence/site';await mkdir(out,{recursive:true});const b=await chromium.launch({headless:true});const report={cases:[],failures:[],externalRequestsSent:0};
try{for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:568}]){
 const c=await b.newContext({viewport,serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).origin===base&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 await c.addInitScript(()=>{window.__mediaCount=0;if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=async()=>{window.__mediaCount++;throw new DOMException('QA denies device','NotAllowedError')};});
 const p=await c.newPage();p.setDefaultTimeout(15000);
 for(const route of ['/','/about/','/tools/','/events/','/events/pixelween-2026/','/books/','/help/','/glossary/','/projects/pixfind/','/projects/pixiedraw/','/draw/about/','/draw/','/camera/']){
  const row={route,width:viewport.width,checks:[]};report.cases.push(row);
  try{await p.goto(base+route,{waitUntil:'load'});await p.waitForTimeout(100);
   if(route==='/draw/about/'){
    await p.waitForURL(u=>u.pathname==='/draw/'&&u.hash==='#draw-how-to');
    assert.ok(await p.locator('#draw-how-to').isVisible());row.checks.push('legacy Draw guide redirects to live how-to anchor');
   }
   assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'no horizontal overflow');assert.equal(await p.locator('h1').count(),1,'one initial H1');assert.ok(await p.locator('h1').innerText());row.checks.push('initial H1 and horizontal fit');
   if(route==='/'){for(const href of ['/draw/','/camera/','/audio/','/jigsaw/'])assert.ok(await p.locator(`a[href="${href}"]`).count());row.checks.push('four purpose entrances exist');}
   if(route==='/events/'){
    await p.locator('[data-event-query]').fill('pixelween');await p.waitForFunction(()=>document.querySelectorAll('[data-event-card]:not([hidden])').length>0);
    const names=await p.locator('[data-event-card]:not([hidden])').allTextContents();assert.ok(names.every(s=>/pixelween/i.test(s)));row.checks.push('history keyword search');
    await p.locator('[data-event-query]').fill('');await p.locator('[data-event-status-filter]').selectOption('ended');
    assert.ok((await p.locator('[data-event-card]:not([hidden])').first().getAttribute('data-status'))==='ended');assert.equal(await p.locator('[data-event-card]:not([hidden])').evaluateAll(ns=>ns.every(n=>n.dataset.status==='ended'&&!n.textContent.includes('締切が近い'))),true);row.checks.push('past events filter does not show deadline-soon status');
    await p.locator('[data-event-status-filter]').selectOption('all');
   }
   if(route==='/books/'){
    await p.locator('#catalog-query').fill('存在しないQA検索');assert.equal(await p.locator('[data-product-grid] [data-product-id]:visible').count(),0);await p.locator('[data-clear-search]').click();
    assert.ok(await p.locator('[data-product-grid] [data-product-id]:visible').count());
    const links=await p.locator('[data-product-grid] a[href^="http"]').evaluateAll(ns=>ns.map(n=>({href:n.href,target:n.target,rel:n.rel})));assert.ok(links.every(n=>/^https:/.test(n.href)));assert.ok(links.filter(n=>n.target==='_blank').every(n=>/noopener/.test(n.rel)));row.checks.push('compact search/reset and HTTPS external link safety attributes (no outbound click)');
   }
   if(['/draw/','/camera/'].includes(route)){
    const mode=route==='/camera/'?'camera':'draw';
    await p.waitForFunction(mode=>{const doc=document.querySelector('.tool-embed__frame')?.contentDocument;return doc?.documentElement.dataset.creationModesReady==='true'&&doc.body.dataset.creationMode===mode&&!doc.body.hasAttribute('data-creation-transition')&&document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持');},mode);
    const f=p.frames().find(f=>f.url().includes('/draw/editor.html'));const before=await f.evaluate(()=>window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());await f.evaluate(()=>window.__persistedEmbedProof='same');
    await p.locator('[data-embed-expand]').click();await p.getByRole('button',{name:'拡大表示を終了',exact:true}).click();assert.equal(await f.evaluate(()=>window.__persistedEmbedProof),'same');assert.deepEqual(await f.evaluate(()=>window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState()),before);row.checks.push(`automatic ${mode} embed ready and expand/end keeps state`);
   }
   const name=route==='/'?'home':route.replace(/^\//,'').replace(/\/$/,'').replaceAll('/','-');await p.screenshot({path:`${out}/${name}-${viewport.width}.png`,animations:'disabled'});
   row.timing=await p.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),durationMs:Math.round(n.duration),resources:performance.getEntriesByType('resource').length,iframes:document.querySelectorAll('iframe').length};});
  }catch(e){row.error=e.stack;report.failures.push({route,width:viewport.width,error:e.message});console.error('FAIL',route,viewport.width,e.message);await p.screenshot({path:`${out}/failure-${report.failures.length}.png`}).catch(()=>{});}
 }
 await c.close();await writeFile(out+'/results.json',JSON.stringify(report,null,2));
}}finally{await b.close();}
console.log(JSON.stringify({cases:report.cases.length,checks:report.cases.reduce((s,r)=>s+r.checks.length,0),failures:report.failures}));if(report.failures.length)process.exitCode=1;
