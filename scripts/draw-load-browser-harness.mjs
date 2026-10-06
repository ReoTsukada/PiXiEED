/** Isolated browser startup measurement. No user storage, external publishing or app configuration changes. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4188';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = process.env.PIXIEED_LOAD_OUTPUT || '/tmp/pixieed-draw-load-current';
const repeats = Number(process.env.PIXIEED_LOAD_REPEATS || 3);
const scenarios = (process.env.PIXIEED_LOAD_SCENARIOS || 'cold,warm,restore,reload').split(',');
const profiles = (process.env.PIXIEED_LOAD_PROFILES || 'normal,constrained').split(',');
const external = process.env.PIXIEED_LOAD_EXTERNAL === '1';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(output, { recursive: true });
const browser = await chromium.launch(), results = [];
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
try {
 for (const profile of profiles) for (const scenario of scenarios) for (let run=0;run<repeats;run++) {
  const context = await browser.newContext({ viewport: {width:844,height:390}, deviceScaleFactor:2 });
  const page = await context.newPage(), cdp = await context.newCDPSession(page), errors=[], failures=[], statuses=[], consoleErrors=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('requestfailed', r=>{if(new URL(r.url()).origin===new URL(base).origin) failures.push({url:r.url(),error:r.failure()});});
  page.on('response', r=>{if(new URL(r.url()).origin===new URL(base).origin && r.status()>=400) statuses.push({url:r.url(),status:r.status()});});
  page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  await page.addInitScript(()=>{
   window.__drawLoadErrors=[];window.__drawLoadLongTasks=[];
   addEventListener('unhandledrejection', e=>window.__drawLoadErrors.push(String(e.reason)));
   try{new PerformanceObserver(list=>window.__drawLoadLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});}catch{}
   const observe=()=>{
    const check=()=>{const main=document.querySelector('#main'),canvas=document.querySelector('#draw-canvas');
     if(!window.__drawLoadReady && main?.getAttribute('aria-busy')==='false' && !main.inert && canvas?.dataset.tool && document.querySelector('#draw-palette [data-color-index]') && document.querySelector('#draw-selection-controls')) {window.__drawLoadReady=performance.now();performance.mark('harness.draw.ready');}};
    new MutationObserver(check).observe(document.documentElement,{childList:true,subtree:true,attributes:true});check();
   };if(document.documentElement)observe();else document.addEventListener('DOMContentLoaded',observe,{once:true});
  });
  await cdp.send('Network.enable');await cdp.send('Performance.enable');
  // Playwright routing disables the HTTP cache; CDP blocks only external HTTPS here so warm-cache runs stay valid.
  if (!external) await cdp.send('Network.setBlockedURLs',{urls:['https://*']});
  const waitReady=()=>page.waitForFunction(()=>Boolean(window.__drawLoadReady),null,{timeout:60000});
  let target=base+'/draw/';
  if(scenario==='warm'||scenario==='reload'){await page.goto(target,{waitUntil:'domcontentloaded'});await waitReady();}
  if(scenario==='restore'){
   await page.goto(base+'/404.html',{waitUntil:'domcontentloaded'});
   const fixture = await page.evaluate(async()=>{
    const {createToolProjectStore}=await import('/js/creation/tool-project-store.mjs');
    const {createPxdProject}=await import('/js/creation/pxd-codec.mjs');
    const {createAnimation,writeAnimationCel,addAnimationFrame}=await import('/js/creation/animation-core.mjs');
    const {writePxdAnimation}=await import('/js/creation/pxd-animation.mjs');
    let a=createAnimation({width:128,height:128,palette:['#e75445','#4c82c3','#6d9b68']});
    a=writeAnimationCel(a,a.frames[0].id,a.layers[0].id,{width:128,height:128,pixels:Array.from({length:16384},(_,i)=>i%11===0?1:i%17===0?2:0)});
    a=addAnimationFrame(a,{copy:true});const saved=await createToolProjectStore('draw').save(await writePxdAnimation(createPxdProject(),a));
    localStorage.setItem('pixieed:pxd:last:draw',JSON.stringify({projectId:saved.projectId,revisionId:saved.revisionId}));return {projectId:saved.projectId,revisionId:saved.revisionId};
   });
   target+=`?pxd=${encodeURIComponent(fixture.projectId)}&pxdRevision=${encodeURIComponent(fixture.revisionId)}`;
   await cdp.send('Network.clearBrowserCache');
  }
  if(scenario==='cold'||scenario==='restore')await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  if(profile==='constrained'){
   await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:100,downloadThroughput:500*1024,uploadThroughput:500*1024});
  }
  // Chromium Performance metrics reset with each document navigation; do not subtract the previous document.
  if(scenario==='reload')await page.reload({waitUntil:'domcontentloaded'});else await page.goto(target,{waitUntil:'domcontentloaded'});
  await waitReady();
  const metricsAfter=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  await page.waitForTimeout(external?500:100);
  const data=await page.evaluate(()=>({readyMs:window.__drawLoadReady,entryReadyMs:performance.getEntriesByName('draw-ready')[0]?.startTime||null,
   fcpMs:performance.getEntriesByName('first-contentful-paint')[0]?.startTime||null,
   dclMs:performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd,
   resources:performance.getEntriesByType('resource').map(r=>({url:r.name,start:r.startTime,end:r.responseEnd,duration:r.duration,transfer:r.transferSize,body:r.decodedBodySize,type:r.initiatorType})),
   longTasks:window.__drawLoadLongTasks,unhandled:window.__drawLoadErrors,
   width:document.querySelector('#draw-canvas').width,height:document.querySelector('#draw-canvas').height,
   controls:[...document.querySelectorAll('#draw-selection-controls button,#draw-virtual-controls button')].map(n=>{const r=n.getBoundingClientRect();return {id:n.id,action:n.dataset.selectionAction,width:r.width,height:r.height};}),
   entryReady:document.documentElement.dataset.drawReady==='true',
   ready:!document.querySelector('#main').inert && document.querySelector('#draw-palette [data-color-index]')!==null,
   pixelSample:[...document.querySelector('#draw-canvas').getContext('2d').getImageData(0,0,128,128).data.slice(0,12)]}));
  data.localResources=data.resources.filter(r=>new URL(r.url).origin===new URL(base).origin);
  data.localTransferredBytes=data.localResources.reduce((s,r)=>s+r.transfer,0);
  data.localDecodedBytes=data.localResources.reduce((s,r)=>s+r.body,0);
  data.scriptCount=data.localResources.filter(r=>/\.(?:mjs|js)$/.test(new URL(r.url).pathname)).length;
  data.scriptMs=1000*metricsAfter.ScriptDuration;data.taskMs=1000*metricsAfter.TaskDuration;
  data.criticalResources=data.localResources.filter(r=>r.end<=data.readyMs);
  data.criticalDecodedBytes=data.criticalResources.reduce((s,r)=>s+r.body,0);
  const row={profile,scenario,run,external,...data,errors,failures,statuses,consoleErrors};results.push(row);
  if(scenario==='restore'){assert.equal(data.width,128);assert.equal(data.height,128);assert.deepEqual(data.pixelSample.slice(0,4),[231,84,69,255]);}
  assert.equal(errors.length+failures.length+statuses.length+data.unhandled.length,0);
  console.log(JSON.stringify({profile,scenario,run,readyMs:data.readyMs,scriptMs:data.scriptMs,taskMs:data.taskMs,requests:data.localResources.length,bytes:data.localDecodedBytes,errors:errors.length}));
  await writeFile(output+'/results.json',JSON.stringify(results,null,2));await context.close();
 }
 const groups=[];
 for(const profile of profiles)for(const scenario of scenarios){const rows=results.filter(r=>r.profile===profile&&r.scenario===scenario);groups.push({profile,scenario,runs:rows.length,readyMs:{median:median(rows.map(r=>r.readyMs)),min:Math.min(...rows.map(r=>r.readyMs)),max:Math.max(...rows.map(r=>r.readyMs))},scriptMs:median(rows.map(r=>r.scriptMs)),taskMs:median(rows.map(r=>r.taskMs)),requests:median(rows.map(r=>r.localResources.length)),decodedBytes:median(rows.map(r=>r.localDecodedBytes))});}
 await writeFile(output+'/summary.json',JSON.stringify({base,external,viewport:'844x390 DPR2',profiles,repeats,groups},null,2));console.log(JSON.stringify(groups,null,2));
}finally{await browser.close();}
