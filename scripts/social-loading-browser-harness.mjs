#!/usr/bin/env node
/** Local-only performance + regression test. All remote requests use synthetic fixtures or are aborted. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const roots={before:process.env.PIXIEED_SNS_BEFORE,after:process.env.PIXIEED_SNS_AFTER};
assert(roots.after,'Set PIXIEED_SNS_AFTER to a built site');
const out=process.env.PIXIEED_SNS_REPORT || '/tmp/pixieed-sns-perf-20261108/browser';
await mkdir(out,{recursive:true});
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const mapRow=n=>({post_id:id(n),title:`公開作品 ${n}`,caption:'合成テスト用。公開されません。',published_at:`2026-11-01T00:${String(n).padStart(2,'0')}:00Z`,map_space:'globe',globe_cell_id:'globe:v11-meridian-parallel-quarter-degree:1:1',public_image_path:`fixture/${n}.png`,post_kind:n%2?'pixel_art':'pixel_camera'});
const mapRows=Array.from({length:8},(_,i)=>mapRow(i+1));
const showcaseRows=[{id:id(20),title:'ショーケース',caption:'合成作品',published_at:'2026-11-02T00:00:00Z',status:'published',post_kind:'image',distribution_mode:'showcase',media_object_path:'fixture/20.png'}];
const snsRows=[{id:id(30),title:'ことば',body:'合成投稿',createdAt:'2026-11-03T00:00:00Z',kind:'text',visibility:'public'}];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const types={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};
let activeRoot=roots.after;
const server=createServer(async(req,res)=>{try {
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
 const url=new URL(req.url,'http://localhost');let file=path.resolve(activeRoot,'.'+decodeURIComponent(url.pathname));
 if(!file.startsWith(path.resolve(activeRoot)+path.sep)){res.writeHead(403).end();return;}
 if((await stat(file)).isDirectory())file=path.join(file,'index.html');
 const raw=await readFile(file); const body=/\.(?:m?js|html|css|json|svg)$/.test(file)?gzipSync(raw):raw;
 await sleep(80);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store',...(body!==raw?{'Content-Encoding':'gzip'}:{})});res.end(body);
}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PIXIEED_CHROME_EXECUTABLE ? {executablePath:process.env.PIXIEED_CHROME_EXECUTABLE} : {})});const results=[],checks=[];
async function setup(viewport,{placementDelay=250,failAll=false,empty=false,regression=false}={}) {
 const context=await browser.newContext({viewport,serviceWorkers:'block'});const page=await context.newPage();const errors=[],api=[],writes=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.origin===origin){
   if(regression&&u.pathname==='/js/globe/post-supabase.mjs')return route.fulfill({contentType:'text/javascript',body:`export function createSupabasePostActions(){return {hasLiked:async()=>{window.__likeReads=(window.__likeReads||0)+1;if(window.__failLikeRead){window.__failLikeRead=false;throw new Error('Synthetic read failure')}return false},setLike:async()=>{window.__likeWrites=(window.__likeWrites||0)+1;await new Promise(r=>window.__releaseLike=r)}}}`});
   return route.continue();
  }
  if(u.hostname!=='kyyiuakrqomzlikfaire.supabase.co')return route.abort();
  const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:JSON.stringify(data)});
  if(u.pathname.startsWith('/storage/v1/object/public/')&&request.method()==='GET')return route.fulfill({contentType:'image/png',body:png});
  const action=request.method()==='POST'?JSON.parse(request.postData()||'{}').action:null;
  if(!['GET','HEAD'].includes(request.method())&&!(u.pathname==='/functions/v1/social-feed'&&['list','get'].includes(action))){writes.push({path:u.pathname,method:request.method(),action});return route.abort();}
  const item={path:u.pathname,action,start:Date.now()};api.push(item);
  if(u.pathname==='/rest/v1/post_map_points'){await sleep(250);item.end=Date.now();return respond(failAll?{error:'unavailable'}:empty?[]:mapRows,failAll?503:200);}
  if(u.pathname==='/rest/v1/social_posts'){await sleep(250);item.end=Date.now();return respond(failAll?{error:'unavailable'}:empty?[]:showcaseRows,failAll?503:200);}
  if(u.pathname==='/rest/v1/social_post_map_points'){await sleep(placementDelay);item.end=Date.now();return respond({error:'missing'},404);}
  if(u.pathname==='/functions/v1/social-feed'&&action==='list'){await sleep(regression?900:350);item.end=Date.now();return respond(failAll?{ok:false,error:'unavailable'}:{ok:true,posts:empty?[]:snsRows},failAll?503:200);}
  if(u.pathname==='/functions/v1/social-feed'&&action==='get')return respond({ok:true,post:snsRows[0]});
  return route.abort();
 });
 await page.addInitScript(()=>{
  const marks={};window.__snsMarks=marks;const tick=()=>{
   if(!marks.ready&&document.querySelector('#socialApp[data-ready="true"]'))marks.ready=performance.now();
   if(!marks.firstPost&&document.querySelector('#feed [data-post-id]'))marks.firstPost=performance.now();
   if(!marks.complete&&marks.firstPost&&document.querySelector('#feed[aria-busy="false"]'))marks.complete=performance.now();
  };new MutationObserver(tick).observe(document,{subtree:true,childList:true,attributes:true});
 });
 return {page,context,errors,api,writes};
}
try {
 if(process.env.PIXIEED_SNS_SKIP_BENCH!=='1')for(const phase of ['before','after']){
  if(!roots[phase])continue;activeRoot=roots[phase];
  for(const viewport of [{width:390,height:844},{width:1280,height:800}])for(const route of ['/feed/','/explore/'])for(let run=1;run<=3;run++){
   const s=await setup(viewport),start=Date.now();await s.page.goto(origin+route,{waitUntil:'domcontentloaded'});
   await s.page.waitForFunction(()=>document.querySelectorAll('#feed [data-post-id]').length===10&&document.querySelector('#feed[aria-busy="false"]'));
   const metrics=await s.page.evaluate(()=>({marks:window.__snsMarks,overflow:document.documentElement.scrollWidth>innerWidth,status:document.querySelector('#feedStatus').textContent,js:performance.getEntriesByType('resource').filter(r=>/\.(?:mjs|js)(?:\?|$)/.test(r.name)).map(r=>({path:new URL(r.name).pathname,start:r.startTime,end:r.responseEnd,encoded:r.encodedBodySize})),posts:document.querySelectorAll('#feed [data-post-id]').length}));
   const result={phase,viewport,route,run,metrics,api:s.api.map(x=>({...x,start:x.start-start,end:x.end-start})),errors:s.errors,writes:s.writes};results.push(result);
   assert.equal(metrics.overflow,false);assert.equal(s.errors.length,0);assert.equal(s.writes.length,0);console.log(JSON.stringify({phase,viewport:viewport.width,route,run,marks:metrics.marks}));await s.context.close();
  }
 }
 activeRoot=roots.after;
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}]){
  const s=await setup(viewport,{placementDelay:2600,regression:true}),p=s.page;await p.goto(origin+'/explore/',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('#feed [data-post-id]');assert.equal(await p.locator('#feed').getAttribute('aria-busy'),'true');assert.equal(await p.locator('.feed-empty-state').count(),0);
  const mapCard=p.locator(`[data-post-id="map:${id(8)}"]`),like=mapCard.locator('[data-action="like"]');await like.click();
  await p.waitForFunction(()=>window.__likeWrites===1);
  // Text source arrives and triggers a progressive render while setLike is held.
  await p.waitForSelector(`[data-post-id="sns:${id(30)}"]`);assert.equal(await like.isDisabled(),true);
  await p.evaluate(()=>document.querySelector('[data-action="like"]').dispatchEvent(new MouseEvent('click',{bubbles:true})));assert.equal(await p.evaluate(()=>window.__likeWrites),1);
  await p.evaluate(()=>window.__releaseLike());await p.waitForFunction(()=>document.querySelector('[data-post-id] [data-action="like"][aria-pressed="true"]'));
  // Retain visible image nodes when optional placement fails.
  await p.evaluate(()=>window.__firstShowcaseImage=document.querySelector('[data-post-id^="showcase:"] img'));
  await mapCard.locator('[data-action="bookmark"]').click();await p.waitForFunction(id=>document.querySelector(`[data-post-id="map:${id}"] [data-action="bookmark"]`)?.getAttribute('aria-pressed')==='true',id(8));
  await p.evaluate(()=>{const card=document.querySelector('[data-post-id^="map:"]');card.scrollIntoView({behavior:'instant'});window.__anchor={id:card.dataset.postId,top:card.getBoundingClientRect().top};});
  await p.waitForSelector('#feed[aria-busy="false"]');
  assert.equal(await p.evaluate(()=>window.__firstShowcaseImage===document.querySelector('[data-post-id^="showcase:"] img')),true);
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const anchorCheck=await p.evaluate(()=>({before:window.__anchor.top,after:document.querySelector(`[data-post-id="${window.__anchor.id}"]`).getBoundingClientRect().top,scroll:scrollY}));
  assert.ok(Math.abs(anchorCheck.before-anchorCheck.after)<2,JSON.stringify(anchorCheck));
  assert.equal(await p.locator('#feedWarningDetails').isVisible(),true);
  // Failed read without any source rerender must leave Like available for retry.
  const retryLike=p.locator(`[data-post-id="map:${id(1)}"] [data-action="like"]`);
  await p.evaluate(()=>window.__failLikeRead=true);await retryLike.click();
  await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Synthetic read failure'));
  assert.equal(await retryLike.isDisabled(),false);await retryLike.click();
  await p.waitForFunction(()=>window.__likeWrites===2);await p.evaluate(()=>window.__releaseLike());
  await p.waitForFunction(()=>[...document.querySelectorAll('[data-action="like"][aria-pressed="true"]')].length===2);
  await mapCard.locator('[data-action="detail"]').first().click();await p.waitForSelector('#detailDialog[open]');
  await p.keyboard.press('Escape');await p.waitForSelector('#detailDialog:not([open])',{state:'attached'});
  await p.locator('[data-action="view"][data-view="saved"]').click();await p.waitForFunction(()=>document.querySelectorAll('#feed [data-post-id]').length===1);
  await p.locator('[data-action="view"][data-view="local"]').click();assert.equal(await p.locator('#draftsPanel').isVisible(),true);
  await p.goBack();await p.waitForFunction(()=>document.querySelector('#feedViews [data-view="saved"]').getAttribute('aria-pressed')==='true');
  await p.locator('[data-action="view"][data-view="feed"]').click();await p.waitForFunction(()=>document.querySelectorAll('#feed [data-post-id]').length===10);
  await p.locator('.prompt-open').click();await p.waitForSelector('#composerDialog[open]');await p.keyboard.press('Escape');await p.waitForSelector('#composerDialog:not([open])',{state:'attached'});
  await p.evaluate(()=>scrollTo(0,0));await p.screenshot({path:path.join(out,`after-${viewport.width}.png`),fullPage:false});
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(s.errors,[]);assert.deepEqual(s.writes,[]);
  checks.push({viewport,case:'progressive-like-bookmark-detail-history-composer-scroll-image',passed:true});await s.context.close();
 }
 for(const scenario of ['failure','empty']){
  const s=await setup({width:390,height:844},{failAll:scenario==='failure',empty:scenario==='empty'});await s.page.goto(origin+'/feed/');
  if(scenario==='failure'){await s.page.waitForSelector('#feedRetry:visible');assert.match(await s.page.locator('#feedStatus').textContent(),/読み込めませんでした/);}
  else {await s.page.waitForSelector('.feed-empty-state');assert.equal(await s.page.locator('#feed').getAttribute('aria-busy'),'false');}
  assert.deepEqual(s.errors,[]);assert.deepEqual(s.writes,[]);checks.push({case:scenario,passed:true});await s.context.close();
 }
 console.log('REGRESSION PASS',JSON.stringify(checks));
} finally {await writeFile(path.join(out,'results.json'),JSON.stringify({conditions:{staticResponseDelayMs:80,mapMs:250,showcaseMs:250,placementMs:250,snsMs:350,cache:'new isolated browser context, HTTP no-store, gzip static text',external:'all synthetic or blocked'},results,checks},null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
