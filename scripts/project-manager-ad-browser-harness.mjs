import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || resolve(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const root=process.env.PIXIEED_BUILD_ROOT;
assert.ok(root && resolve(root) === root, 'Set PIXIEED_BUILD_ROOT to an absolute local production build path.');
const out=process.env.PIXIEED_MANAGER_AD_OUTPUT || '/tmp/pixieed-work-manager-ad-review';await mkdir(out,{recursive:true});
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const sdk=`window.__testSdkLoads=(window.__testSdkLoads||0)+1;window.adsbygoogle={push(){const ins=document.querySelector('ins.adsbygoogle:not([data-mock-initialized])');if(!ins)throw new Error('no new unit for push');ins.dataset.mockInitialized='1';window.__testAdPushes=(window.__testAdPushes||0)+1;(window.__testAdKeys||=[]).push(ins.dataset.galleryPlacement);ins.dataset.adStatus='filled';const el=document.createElement('div');el.textContent='テスト広告（表示位置の確認用）';el.dataset.testAd='';el.style.cssText='display:grid;place-items:center;width:100%;height:100%;box-sizing:border-box;border:2px dashed #8cb6d2;background:#264459;color:#eefaff;font:700 12px system-ui';ins.append(el);}};`;
const server=createServer(async(req,res)=>{try{if(!['GET','HEAD'].includes(req.method))return res.writeHead(405).end();const u=new URL(req.url,'http://localhost');if(u.pathname==='/__manager_mock_sdk.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(sdk);}let p=resolve(root,'.'+decodeURIComponent(u.pathname));if(!p.startsWith(root+'/'))return res.writeHead(403).end();if((await stat(p)).isDirectory())p+='/index.html';let b=await readFile(p);
// The only eligibility change under test is local origin/protocol. No production request is made.
if(['/js/ads/project-manager-ad.mjs','/js/ads/project-gallery-ad.mjs'].includes(u.pathname)) {
 const original=b.toString('utf8');
 const local=original.replaceAll('"https://pixieed.jp"',JSON.stringify(base)).replaceAll("'https://pixieed.jp'",JSON.stringify(base)).replaceAll('"https:"','"http:"').replaceAll("'https:'","'http:'");
 assert.notEqual(local,original,'built ad module must receive the test-only local origin guard'); b=Buffer.from(local);
}
if(u.pathname==='/js/display-ads.mjs'){b=Buffer.from(`export function getAdsenseLoader(doc,win,client){if(win.__mockLoader)return win.__mockLoader;window.__testLoaderCalls=(window.__testLoaderCalls||0)+1;const script=doc.createElement('script');script.src='/__manager_mock_sdk.js';doc.head.append(script);return win.__mockLoader={script,errors:new Set(),failed:false};}`);}
res.writeHead(200,{'Content-Type':types[extname(p)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);}catch(e){res.writeHead(404).end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.PIXIEED_CHROME_EXECUTABLE ? {executablePath:process.env.PIXIEED_CHROME_EXECUTABLE} : {})});const report={status:'PASS',cases:[],limitations:['Local production build with only the two ad origin/protocol guards patched to localhost and a local mock SDK.','No Google/production requests, real user storage, policy approval, fill or earnings are tested.','Same-document vendor SDK cannot be unloaded or isolated from same-origin work by retiring a slot.']};
const ready=p=>p.waitForFunction(()=>window.__PIXIEED_CREATION_HOST__?.runtime?.state.active&&!document.querySelector('#main').inert&&!document.body.hasAttribute('data-creation-transition'));
const counters=p=>p.evaluate(()=>({loaders:window.__testLoaderCalls||0,pushes:window.__testAdPushes||0}));
const open=p=>p.locator('#creation-file-open').click();
const storeState=p=>p.evaluate(async()=>{const {createToolProjectStore}=await import('/js/creation/tool-project-store.mjs');return (await createToolProjectStore('draw').listProjects()).projects.map(x=>({id:x.projectId,revision:x.revisionId})).sort((a,b)=>a.id.localeCompare(b.id));});
async function seed(p,n){await p.evaluate(async n=>{const {createPxdProject}=await import('/js/creation/pxd-codec.mjs');const {putPxdSharedImage}=await import('/js/creation/pxd-project.mjs');for(let i=0;i<n;i++){const W=16,H=16,rgba=new Uint8Array(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=(y*W+x)*4,star=Math.abs(x-8)+Math.abs(y-8)<6;rgba[k]=star?255:20+i*6;rgba[k+1]=star?220:36;rgba[k+2]=star?80+i*5:65+i*4;rgba[k+3]=255;}const pr=await putPxdSharedImage(createPxdProject({manifest:{title:'確認用の作品 '+(i+1)}}),{width:W,height:H,rgba});await window.__PIXIEED_CREATION_HOST__.runtime.draw.workspace.importProject(pr);}},n);await ready(p);}
async function purgeTestWorks(p){await p.evaluate(async()=>{const {createToolProjectStore}=await import('/js/creation/tool-project-store.mjs');const store=await createToolProjectStore('draw');const {projects}=await store.listProjects();if(projects.length)await store.purgeProjects(projects.map(x=>({projectId:x.projectId,expectedRevisionId:x.revisionId})));});}
async function start(p){await p.goto(base+'/tools/start/draw/?workspace=1');await p.locator('#project-start-new').click();await ready(p);}
async function newBlank(p){await open(p);await p.locator('#project-new').click();await ready(p);}
const details=p=>p.evaluate(()=>{const d=document.querySelector('dialog[open]'),h=d?.querySelector('[data-project-manager-ad],[data-project-gallery-ad]'),s=h?.querySelector('[data-project-manager-ad-slot]');return {url:location.href,history:history.state,host:{hidden:h?.hidden,state:h?.dataset.adState,reason:h?.dataset.retireReason,rect:h?.getBoundingClientRect().toJSON()},slot:s?.getBoundingClientRect().toJSON(),dialog:{rect:d?.getBoundingClientRect().toJSON(),scrollHeight:d?.scrollHeight,clientHeight:d?.clientHeight,scrollTop:d?.scrollTop},tiles:[...document.querySelectorAll('dialog[open] .project-gallery__tile canvas')].map(x=>x.getBoundingClientRect().toJSON()),controls:[...d.querySelectorAll('button,input,summary')].filter(x=>x.getClientRects().length).map(x=>({id:x.id,text:x.textContent.slice(0,12),rect:x.getBoundingClientRect().toJSON()}))};});
async function context(viewport){const c=await browser.newContext({viewport,hasTouch:true,isMobile:viewport.width<800,deviceScaleFactor:2,serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());return c;}
async function check(name,viewport,run){if(process.env.PIXIEED_AD_CASE && !name.includes(process.env.PIXIEED_AD_CASE))return;const c=await context(viewport),p=await c.newPage();p.setDefaultTimeout(10000);const errors=[];p.on('pageerror',e=>errors.push(e.message));try{await run(p,c);assert.deepEqual(errors,[]);report.cases.push({name,viewport,status:'PASS'});console.log('PASS',name);}catch(e){report.status='FAIL';report.cases.push({name,viewport,status:'FAIL',error:e.stack,details:await details(p).catch(()=>null),errors});await p.screenshot({path:out+'/'+name+'-failure.png'}).catch(()=>{});console.error('FAIL',name,e.message);await writeFile(out+'/report.json',JSON.stringify(report,null,2));}finally{await c.close();}}
const placement = (surface, after=1) => `[data-${surface==='chooser'?'project-gallery':'project-manager'}-ad][data-ad-after="${after}"]`;
async function reveal(p,surface,after=1) {
 const selector=placement(surface,after);await p.waitForFunction(s=>document.querySelector(s)?.dataset.adState,selector);
 if(after===1)await p.locator(selector).evaluate(e=>{const d=e.closest('dialog');(d.querySelector('.project-start-picker__scroller')||d).scrollTop=0;});
 await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await p.locator(selector).evaluate(e=>{const d=e.closest('dialog'),s=d.querySelector('.project-start-picker__scroller')||d,b=s.getBoundingClientRect(),headerBottom=d.querySelector('.project-sheet__header')?.getBoundingClientRect().bottom||b.top,targetTop=Math.max(b.top+120,headerBottom+49);let r=e.getBoundingClientRect();if(r.bottom>b.bottom-48){s.scrollTop+=r.bottom-b.bottom+48;r=e.getBoundingClientRect();}if(r.top<targetTop)s.scrollTop-=targetTop-r.top;});
 await p.waitForFunction(s=>document.querySelector(s)?.dataset.adState==='filled',selector);
 assert.equal(await p.locator(selector+' [data-test-ad]').isVisible(),true);
}
async function setup(p,surface,n) {await start(p);await seed(p,n);if(surface==='manager'){await newBlank(p);await open(p);}else await p.goto(base+'/tools/start/draw/?workspace=1');}
try {
 for(const surface of ['manager','chooser'])for(const viewport of [{width:390,height:844},{width:320,height:568},{width:1280,height:900}])await check(surface+'-one-'+viewport.width,viewport,async p=>{
  await setup(p,surface,1);const saved=await storeState(p);await reveal(p,surface);
  assert.deepEqual(await counters(p),{loaders:1,pushes:1});
  assert.deepEqual(await p.locator('[data-ad-after]').evaluateAll(es=>es.map(e=>Number(e.dataset.adAfter))),[1]);
  const first=p.locator('.project-gallery__tile').first();const firstBox=await first.boundingBox();
  const expectedSize=await p.locator('.project-gallery').evaluate(e=>{const columns=Number(getComputedStyle(e).getPropertyValue('--gallery-columns'));return (e.clientWidth-(columns-1)*3)/columns;});
  assert.ok(Math.abs(firstBox.width-firstBox.height)<1,'single artwork stays square');
  assert.ok(Math.abs(firstBox.width-expectedSize)<1,'single artwork uses the responsive grid size');
  const overflow=await p.locator('dialog[open]').evaluate(d=>d.scrollWidth<=d.clientWidth+1);assert.equal(overflow,true);
  if(viewport.width!==320)await p.screenshot({path:out+'/'+surface+'-inline-'+viewport.width+'.png'});
  if(surface==='manager'){const h=await p.locator(placement(surface)).evaluate(e=>e.getBoundingClientRect().height);await p.locator('#project-tab-current').click();assert.equal(await p.locator('.project-manager-ad__unit').count(),0);await p.locator('#project-tab-library').click();assert.equal(await p.locator(placement(surface)).evaluate(e=>e.getBoundingClientRect().height),h);await p.locator('#project-close').click();await open(p);await p.waitForTimeout(120);assert.deepEqual(await counters(p),{loaders:1,pushes:1});}
  else{await p.locator('#project-start-new').click();await ready(p);assert.equal(await p.locator('[data-project-gallery-ad] .adsbygoogle').count(),0);await open(p);await reveal(p,'manager');assert.deepEqual(await counters(p),{loaders:1,pushes:2},'distinct manager placement can request after chooser');}
  assert.deepEqual(await storeState(p),saved,'ad viewing leaves stored artwork and revisions unchanged');
 });
 for(const surface of ['manager','chooser'])for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1280,height:900}])await check('gallery-groups-'+surface+'-'+viewport.width,viewport,async p=>{
  for(const count of [2,3,6,7]){
    await start(p);await purgeTestWorks(p);await seed(p,count);
    if(surface==='manager'){await newBlank(p);await open(p);}else await p.goto(base+'/tools/start/draw/?workspace=1');
    const positions=count<6?[count]:Array.from({length:Math.floor(count/6)},(_,i)=>(i+1)*6);
    await p.waitForFunction(expected=>document.querySelectorAll('[data-ad-after]').length===expected.length,positions);
    assert.deepEqual(await p.locator('[data-ad-after]').evaluateAll(es=>es.map(e=>Number(e.dataset.adAfter))),positions);
    assert.deepEqual(await p.locator('.project-gallery__segment').evaluateAll(es=>es.map(e=>Number(e.dataset.galleryStart))),[0,...positions]);
    const groups=p.locator('.project-gallery__segment'),measured=[];
    for(let i=0;i<await groups.count();i++){
      const group=groups.nth(i);
      if(Number(await group.getAttribute('data-gallery-count'))===0)continue;
      await group.evaluate(e=>{const d=e.closest('dialog'),s=d.querySelector('.project-start-picker__scroller')||d,r=e.getBoundingClientRect(),b=s.getBoundingClientRect();s.scrollTop+=r.top-b.top+Math.max(0,r.height/2);});
      await p.waitForFunction(i=>{const e=document.querySelectorAll('.project-gallery__segment')[i];return e?.querySelectorAll('.project-gallery__tile').length>0;},i);
      measured.push(...await group.locator('.project-gallery__tile').evaluateAll(es=>es.map(t=>{const r=t.getBoundingClientRect();return {id:t.dataset.projectId,width:r.width,height:r.height};})));
    }
    assert.equal(new Set(measured.map(x=>x.id)).size,count,'measure every saved artwork at '+count+' works');
    const listWidth=await p.locator('.project-gallery').evaluate(e=>e.clientWidth);
    const columns=Number(await p.locator('.project-gallery').evaluate(e=>getComputedStyle(e).getPropertyValue('--gallery-columns')));
    assert.ok(measured.every(({width,height})=>Math.abs(width-height)<1),'all cards square at '+viewport.width+'px');
    assert.ok(measured.every(({width})=>Math.abs(width-measured[0].width)<1),'all groups use equal card sizes at '+viewport.width+'px');
    assert.ok(Math.abs(measured[0].width-(listWidth-(columns-1)*3)/columns)<1,'card size fits responsive columns at '+viewport.width+'px');
    assert.equal(await p.locator('dialog[open]').evaluate(d=>d.scrollWidth<=d.clientWidth+1),true,'no horizontal overflow at '+viewport.width+'px');
    if(surface==='chooser'&&count===2&&(viewport.width===390||viewport.width===1280))
      await p.screenshot({path:out+'/chooser-2-works-'+viewport.width+'.png'});
  }
 });
 for(const surface of ['manager','chooser'])await check(surface+'-repeat-groups',{width:390,height:844},async p=>{
  await setup(p,surface,13);await p.waitForFunction(()=>document.querySelectorAll('[data-ad-after]').length===2);
  assert.deepEqual(await p.locator('[data-ad-after]').evaluateAll(es=>es.map(e=>Number(e.dataset.adAfter))),[6,12]);
  for(const after of [6,12])await reveal(p,surface,after);
  const before=await counters(p);assert.deepEqual(before,{loaders:1,pushes:2});
  for(const after of [6,12,6])await reveal(p,surface,after);
  assert.deepEqual(await counters(p),before,'scrolling back does not recreate or request units');
  assert.deepEqual(await p.evaluate(()=>window.__testAdKeys),[surface+':6',surface+':12']);
  await p.screenshot({path:out+'/'+surface+'-repeat-390.png'});
  await p.locator(surface==='chooser'?'#project-start-search':'#project-search').fill('確認');
  assert.equal(await p.locator('.project-manager-ad__unit').count(),0);assert.deepEqual(await counters(p),before);
 });
 await check('gallery-resize-equal-geometry',{width:390,height:844},async p=>{
  await setup(p,'manager',13);
  await p.waitForFunction(()=>document.querySelector('.project-gallery__segment')?.dataset.galleryStart==='0');
  const starts=await p.locator('.project-gallery__segment').evaluateAll(es=>es.map(e=>Number(e.dataset.galleryStart)));
  assert.deepEqual(starts,[0,6,12]);
  assert.deepEqual(await p.locator('[data-ad-after]').evaluateAll(es=>es.map(e=>Number(e.dataset.adAfter))),[6,12]);
  const measureGroups=async()=>{
    const segments=p.locator('.project-gallery__segment'),measured=[];
    for(let i=0;i<await segments.count();i++){
      const segment=segments.nth(i);
      if(Number(await segment.getAttribute('data-gallery-count'))===0)continue;
      await segment.evaluate(e=>{const d=e.closest('dialog'),s=d.querySelector('.project-start-picker__scroller')||d,r=e.getBoundingClientRect(),b=s.getBoundingClientRect();s.scrollTop+=r.top-b.top+Math.max(0,r.height/2);});
      await p.waitForFunction(i=>{const e=document.querySelectorAll('.project-gallery__segment')[i];return e?.querySelectorAll('.project-gallery__tile').length>0;},i);
      measured.push(...await segment.locator('.project-gallery__tile').evaluateAll(es=>es.map(t=>{const r=t.getBoundingClientRect();return {id:t.dataset.projectId,width:r.width,height:r.height};})));
    }
    return measured;
  };
  let finalSizes=[];
  for(const [width,columns] of [[390,3],[1280,6],[320,3]]){
    await p.setViewportSize({width,height:width===1280?900:568});
    await p.waitForTimeout(100);
    assert.deepEqual(await p.locator('[data-ad-after]').evaluateAll(es=>es.map(e=>Number(e.dataset.adAfter))),[6,12]);
    const groups=await measureGroups();
    const sizes=groups,listWidth=await p.locator('.project-gallery').evaluate(e=>e.clientWidth);
    finalSizes=sizes;
    assert.equal(new Set(sizes.map(x=>x.id)).size,13,'all 13 card IDs measured at '+width+'px');
    assert.ok(sizes.every(({width:w,height:h})=>Math.abs(w-h)<1),'all cards square at '+width+'px');
    assert.ok(sizes.every(({width:w})=>Math.abs(w-sizes[0].width)<1),'all cards same size at '+width+'px');
    assert.ok(Math.abs(sizes[0].width-(listWidth-(columns-1)*3)/columns)<1,'cards fit the '+columns+'-column grid at '+width+'px');
    assert.equal(await p.locator('dialog[open]').evaluate(d=>d.scrollWidth<=d.clientWidth+1),true,'no dialog overflow at '+width+'px');
  }
  const firstGroup=p.locator('.project-gallery__segment').first();
  await firstGroup.evaluate(e=>{const d=e.closest('dialog'),s=d.querySelector('.project-start-picker__scroller')||d,r=e.getBoundingClientRect(),b=s.getBoundingClientRect();s.scrollTop+=r.top-b.top;});
  await p.waitForFunction(()=>document.querySelector('.project-gallery__segment[data-gallery-start="0"]')?.querySelectorAll('.project-gallery__tile').length>=6);
  const sixth=firstGroup.locator('.project-gallery__tile').nth(5),before=await sixth.getAttribute('data-project-id'),expectedNext=finalSizes[6]?.id;
  assert.equal(before,finalSizes[5]?.id,'focus test starts on the sixth ordered card');
  await sixth.focus();await sixth.press('ArrowRight');
  await p.waitForFunction(id=>document.activeElement?.dataset.projectId===id,expectedNext);
  await p.locator(':focus').press(' ');
  await p.waitForFunction(()=>document.activeElement?.getAttribute('aria-pressed')==='true');
 });
 await check('empty-and-private-url',{width:390,height:844},async p=>{
  await start(p);await open(p);await p.waitForTimeout(120);assert.deepEqual(await counters(p),{loaders:0,pushes:0});await p.locator('#project-close').click();
  await seed(p,1);const url=p.url();await open(p);await p.waitForTimeout(150);assert.deepEqual(await counters(p),{loaders:0,pushes:0});assert.equal(p.url(),url);assert.equal(await p.locator('[data-ad-after]').count(),0);
 });
 for(const control of ['#project-select','#project-tab-import'])await check('retire-'+control.replace(/[^a-z]/g,''),{width:390,height:844},async p=>{
  await setup(p,'manager',1);await reveal(p,'manager');await p.locator(control).click();assert.equal(await p.locator('.project-manager-ad__unit').count(),0);assert.deepEqual(await counters(p),{loaders:1,pushes:1});
 });
 await check('delayed-sdk-cancel',{width:390,height:844},async(p,c)=>{
  let release;const gate=new Promise(r=>release=r);await c.route('**/__manager_mock_sdk.js',async r=>{await gate;await r.continue();});
  await setup(p,'manager',1);await p.waitForFunction(()=>document.querySelector('[data-project-manager-ad]')?.dataset.adState==='loading-sdk');
  await p.locator('#project-tab-current').click();release();await p.waitForTimeout(200);assert.deepEqual(await counters(p),{loaders:1,pushes:0});
 });
 await check('unfilled-optimized-responsive',{width:390,height:844},async p=>{
  await setup(p,'manager',1);await reveal(p,'manager');await p.locator('.project-manager-ad__unit').evaluate(e=>e.dataset.adStatus='unfilled');await p.waitForFunction(()=>document.querySelector('[data-project-manager-ad]')?.dataset.adState==='unfilled');
  await p.locator('.project-manager-ad__unit').evaluate(e=>e.dataset.adStatus='unfill-optimized');await reveal(p,'manager');
  await p.setViewportSize({width:280,height:568});await p.waitForFunction(()=>document.querySelector('[data-project-manager-ad]')?.dataset.adState==='retired');assert.equal(await p.locator('.project-manager-ad__unit').count(),0);
 });
 for(const mode of ['attribute','insertion'])await check('private-'+mode,{width:390,height:844},async p=>{
  await setup(p,'manager',1);await reveal(p,'manager');await p.evaluate(mode=>{if(mode==='attribute')document.body.dataset.privateView='';else{const e=document.createElement('div');e.dataset.privateView='';document.body.append(e);}},mode);
  await p.waitForFunction(()=>document.querySelector('[data-project-manager-ad]')?.dataset.adState==='retired');assert.equal(await p.locator('.project-manager-ad__unit').count(),0);
 });

 await check('touch-scroll-keeps-series',{width:390,height:844},async p=>{
  await setup(p,'manager',13);await reveal(p,'manager',6);
  const box=await p.locator('.project-gallery__tile').nth(5).boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  const cdp=await p.context().newCDPSession(p);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=7;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*24}]});await p.waitForTimeout(30);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(200);
  assert.equal(await p.locator('[data-gallery-placement="manager:6"]').count(),1,'swiping an artwork does not dismiss advertising');
  await reveal(p,'manager',12);assert.equal((await p.evaluate(()=>window.__testAdKeys)).filter(k=>k==='manager:6').length,1);
 });
 await check('retired-unseen-slot-stays-retired',{width:390,height:844},async p=>{
  await setup(p,'manager',13);await reveal(p,'manager',6);const before=await counters(p);
  await p.evaluate(()=>document.body.dataset.privateView='');await p.waitForFunction(()=>document.querySelector('[data-ad-after="12"]')?.dataset.adState==='retired');
  await p.evaluate(()=>delete document.body.dataset.privateView);await p.locator('[data-ad-after="12"]').evaluate(e=>e.scrollIntoView({block:'center'}));await p.waitForTimeout(200);
  assert.deepEqual(await counters(p),before);assert.equal(await p.locator('.project-manager-ad__unit').count(),0);
 });
 await check('delayed-sdk-initializes-visible-slot-only',{width:390,height:844},async(p,c)=>{
  let release;const gate=new Promise(r=>release=r);await c.route('**/__manager_mock_sdk.js',async r=>{await gate;await r.continue();});
  await setup(p,'manager',13);await p.waitForFunction(()=>document.querySelector('[data-ad-after="6"]')?.dataset.adState==='loading-sdk');
  await p.locator('[data-ad-after="12"]').evaluate(e=>{const d=e.closest('dialog'),r=e.getBoundingClientRect(),b=d.getBoundingClientRect();d.scrollTop+=r.top-b.top-320;});
  await p.waitForFunction(()=>document.querySelector('[data-ad-after="12"]')?.dataset.adState==='loading-sdk');release();
  await p.waitForFunction(()=>window.__testAdKeys?.includes('manager:12'));
  const initial=await p.evaluate(()=>window.__testAdKeys);assert.ok(!initial.includes('manager:6'),'offscreen first placement is not initialized by another push');
  await reveal(p,'manager',6);const keys=await p.evaluate(()=>window.__testAdKeys);assert.equal(keys.filter(k=>k==='manager:6').length,1);assert.equal(new Set(keys).size,keys.length);
 });
 await check('sdk-error-preserves-work',{width:390,height:844},async(p,c)=>{
  await c.route('**/__manager_mock_sdk.js',r=>r.abort());await setup(p,'manager',1);const saved=await storeState(p);
  await p.waitForFunction(()=>document.querySelector('[data-project-manager-ad]')?.dataset.adState==='error');await p.locator('#project-tab-current').click();await p.locator('#project-continue').click();await ready(p);assert.deepEqual(await storeState(p),saved);assert.deepEqual(await counters(p),{loaders:1,pushes:0});
 });
} finally {await writeFile(out+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
if(report.status!=='PASS')process.exitCode=1;
