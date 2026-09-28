import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
const siteConfigFixture=(await readFile(new URL('../data/site-config.js',import.meta.url),'utf8')).replace('puzzlePublicationEnabled: false','puzzlePublicationEnabled: true');
assert.ok(siteConfigFixture.includes('puzzlePublicationEnabled: true'),'Explicit publication-ready test fixture required.');
const modulePath=process.env.PIXIEED_PLAYWRIGHT_MODULE;
if(!modulePath)throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE to an existing Playwright index.mjs; no installation is performed.');
const {chromium,webkit}=await import(pathToFileURL(modulePath).href);
const BASE=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4173';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(BASE).hostname))throw new Error('Only a local test server is allowed.');
import {admitPuzzleUpload} from '../supabase/functions/_shared/puzzle-admission.mjs';
const POST='33333333-3333-4333-8333-333333333333';
for(const [engine,type] of [['Chrome',chromium],['WebKit',webkit]]) {
 const browser=await type.launch({headless:true});
 try {
 for(const [width,height] of [[320,568],[390,844],[568,320]]) for(const mode of ['spot_difference','hidden_object']) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[],submissions=[];let failFirst=true;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin?route.continue():route.fulfill({status:200,json:[]}));
  await page.route('**/data/site-config.js*',route=>route.fulfill({status:200,contentType:'text/javascript',body:siteConfigFixture}));
  await page.route('**/*.supabase.co/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.endsWith('/functions/v1/create-post')) {
    const body=request.postDataJSON();submissions.push(body);
    await admitPuzzleUpload(body.puzzle,Buffer.from(body.image.base64,'base64'),body.image);
    if(failFirst){failFirst=false;await route.fulfill({status:503,json:{ok:false,error:'post_save_outcome_unknown'}});}
    else await route.fulfill({status:201,json:{ok:true,postId:POST,status:'pending',puzzleMode:body.puzzle.mode}});
   } else await route.fulfill({status:200,json:[]});
  });
  await page.goto(BASE+'/tools/',{waitUntil:'domcontentloaded'});
  await page.evaluate(async mode=>{
   const {createIndexedDbDraftAdapter,createLocalDraftStore}=await import('/js/creation/local-drafts.mjs');
   const {createDrawDocument}=await import('/js/creation/draw-core.mjs');
   const {confirmDifferenceCandidates}=await import('/js/creation/spot-difference-core.mjs');
   const {createHiddenObjectDraft,confirmHiddenObjectTargets}=await import('/js/creation/hidden-object-core.mjs');
   const store=createLocalDraftStore(createIndexedDbDraftAdapter());const original=createDrawDocument(16);original.pixels.fill(0);original.pixels[0]=1;
   const before=await store.save({draftId:'qa-source',kind:'pixel_art',document:original});
   const changed=structuredClone(original);changed.pixels[4]=2;const after=await store.save({draftId:'qa-source',kind:'pixel_art',document:changed});
   const ref=r=>({draftId:'qa-source',assetId:r.asset.assetId,revisionId:r.revisionId,contentHash:r.documentHash,hashScheme:r.hashScheme});
   const pixels=Array.from({length:25},(_,i)=>(5+Math.floor(i/5))*16+5+i%5);
   const document=mode==='spot_difference'?confirmDifferenceCandidates({schemaVersion:1,gameId:'qa-game',width:16,height:16,before:ref(before),after:ref(after),candidates:[{id:'change',pixels:[4]}],confirmed:false,publication:'draft',published:false}):confirmHiddenObjectTargets(createHiddenObjectDraft({gameId:'qa-game',source:ref(before),width:16,height:16,targets:[{id:'star',name:'星',pixels}],confirmed:false}));
   await store.save({draftId:'qa-game',kind:mode,document,source:{type:'local_draft_copy',assetId:before.asset.assetId,revisionId:before.revisionId}});
   localStorage.setItem(mode==='spot_difference'?'pixieed:creation:spot-difference:last-draft:v1':'pixieed:creation:hidden-object:last-draft:v1','qa-game');
   localStorage.setItem('PiXiEED:supabase-session:v1',JSON.stringify({access_token:'local-test-only',user:{id:'11111111-1111-4111-8111-111111111101'},expires_at:Math.floor(Date.now()/1000)+3600}));
  },mode);
  const prefix=mode==='spot_difference'?'spot':'hidden';const path=mode==='spot_difference'?'spot-difference':'hidden-object';
  await page.goto(BASE+'/'+path+'/');await page.locator('#'+prefix+'-resume').click();
  await page.locator('#'+prefix+'-publish').waitFor({state:'visible'});await page.locator('#'+prefix+'-publish').click();
  await page.waitForURL(url=>url.pathname==='/'&&url.searchParams.has('from'));
  let frame=await(await page.locator('iframe').elementHandle()).contentFrame();
  await frame.waitForFunction(()=>globalThis.__PIXIEED_POSTS__?.getState().sheet==='composer');
  await frame.locator('[data-puzzle-panel]').waitFor({state:'visible'});
  await frame.locator('[data-title]').fill('投稿テスト');
  await frame.locator('[data-art-made]').check();
  await frame.locator('[data-puzzle-rights]').check();
  await frame.evaluate(()=>{__PIXIEED_GLOBE__.setView({centerLongitude:139.69,centerLatitude:35.68,zoom:6});});
  await frame.locator('[data-pick-globe]').click();await frame.locator('#globeCanvas').focus();await frame.locator('#globeCanvas').press('Enter');
  if(await frame.locator('[data-peek-done]').isVisible())await frame.locator('[data-peek-done]').click();
  await frame.waitForFunction(()=>Boolean(globalThis.__PIXIEED_POSTS__?.getState().pin));
  const failure=page.waitForResponse(r=>r.url().endsWith('/functions/v1/create-post')&&r.status()===503);
  await frame.locator('[data-submit]').click();
  await failure;
  await frame.locator('[data-submit]:not([disabled])').waitFor();
  assert.equal(submissions.length,1);
  await page.reload();frame=await(await page.locator('iframe').elementHandle()).contentFrame();
  await frame.waitForFunction(()=>globalThis.__PIXIEED_POSTS__?.getState().sheet==='composer');
  await frame.locator('[data-puzzle-panel]').waitFor({state:'visible'});
  assert.equal(await frame.locator('[data-title]').inputValue(),'投稿テスト');
  if(!await frame.locator('[data-art-made]').isChecked())await frame.locator('[data-art-made]').check();
  if(!await frame.locator('[data-puzzle-rights]').isChecked())await frame.locator('[data-puzzle-rights]').check();
  await frame.locator('[data-submit]').click();
  await frame.locator('[data-done]').waitFor({state:'visible'});
  assert.equal(submissions.length,2);assert.equal(submissions[0].requestKey,submissions[1].requestKey);
  assert.deepEqual(submissions[0].puzzle,submissions[1].puzzle);assert.equal(submissions[1].puzzle.mode,mode);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('PiXiEED:puzzle-handoff:v1')),null);
  const overflowing=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflowing,false);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({engine,width,height,mode,createSaveResumeHandoff:'PASS',failedPostReloadRetryKey:'PASS',pending:'PASS',errors:0,overflow:false}));
  await page.close();
 }
 } finally { await browser.close(); }
}
