// Uses responses and PNGs emitted by the real PostgreSQL/Function integration harness.
// All Supabase traffic is intercepted. No production read or write is performed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {supabaseConfig} from '../data/site-config.js';
const modulePath=process.env.PIXIEED_PLAYWRIGHT_MODULE;
const fixturePath=process.env.PIXIEED_TEST_PUBLIC_FIXTURES;
if(!modulePath||!fixturePath)throw new Error('Set PIXIEED_PLAYWRIGHT_MODULE and PIXIEED_TEST_PUBLIC_FIXTURES.');
const {chromium,webkit}=await import(pathToFileURL(modulePath).href);
const BASE=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4173';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(BASE).hostname))throw new Error('Only a local test server is allowed.');
const fixtures=JSON.parse(readFileSync(fixturePath,'utf8'));
assert.deepEqual(fixtures.map(f=>f.mode),['spot_difference','hidden_object']);
for(const [engine,type] of [['Chrome',chromium],['WebKit',webkit]]) {
 const browser=await type.launch({headless:true});
 try {
 for(const [width,height] of (process.argv.includes('--admin-only')?[]:[[320,568],[390,440],[568,320],[768,800],[1280,800]])) for(const fixture of fixtures) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin?route.continue():route.fulfill({status:200,json:[]}));
  const payload=JSON.parse(JSON.stringify(fixture.response).replaceAll('https://test.supabase.co',supabaseConfig.url));
  const puzzle=payload.puzzle,id=puzzle.postId;
  const key=new URL(puzzle.originalImage.url).pathname.split('/post-public/')[1];
  let hidden=false,imageRequests=0;
  await page.route('**/*.supabase.co/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/functions/v1/public-post-puzzle'))await route.fulfill({status:hidden?404:200,json:hidden?{ok:false,error:'puzzle_not_found'}:payload});
   else if(url.pathname.includes('/storage/v1/object/public/post-public/')){
    imageRequests++;const path=url.pathname.split('/post-public/')[1],data=fixture.images[path];
    assert.ok(data,'only the actual published PNG paths are requested');
    await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(data,'base64'),headers:{'access-control-allow-origin':'*'}});
   } else if(url.pathname.endsWith('/rest/v1/post_map_points'))await route.fulfill({status:200,json:hidden?[]:[{post_id:id,title:puzzle.title,caption:'',public_image_path:key,published_at:'2026-09-28T00:00:00Z',globe_cell_id:'globe:v11-meridian-parallel-quarter-degree:216:10',post_kind:'pixel_art',puzzle_mode:fixture.mode}]});
   else await route.fulfill({status:200,json:[]});
  });
  await page.goto(BASE+'/');const frame=await(await page.locator('iframe').elementHandle()).contentFrame();
  await frame.waitForFunction(()=>globalThis.__PIXIEED_POSTS__?.store);
  await frame.evaluate(async id=>{await __PIXIEED_POSTS__.store.ready;await __PIXIEED_POSTS__.openLinkedPost(id);},id);
  await frame.locator('[data-v-puzzle]').waitFor({state:'visible'});
  assert.equal(await frame.locator('[data-v-puzzle]').getAttribute('href'),'/pixfind/?postPuzzle='+id);
  await frame.locator('[data-v-puzzle]').click();await page.waitForURL(url=>url.pathname==='/pixfind/'&&url.searchParams.get('postPuzzle')===id);
  await page.waitForFunction(()=>document.querySelector('#pixfind-original')?.naturalWidth===16&&document.querySelector('#pixfind-progress')?.textContent.includes('0 / 1'));
  const rect=await page.locator('#pixfind-play-area').boundingBox();
  const scale=Math.min(rect.width/16,rect.height/16),xo=(rect.width-16*scale)/2,yo=(rect.height-16*scale)/2;
  const [x,y]=fixture.mode==='spot_difference'?[4.5,.5]:[7.5,7.5];
  await page.mouse.click(rect.x+xo+x*scale,rect.y+yo+y*scale);
  await page.waitForFunction(()=>document.querySelector('#pixfind-game-status')?.textContent.includes('全部見つかりました'));
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,image:document.querySelector('#pixfind-play-area').getBoundingClientRect().bottom,nav:document.querySelector('.app-tabs').getBoundingClientRect().top}));
  assert.equal(geometry.overflow,false);assert.ok(geometry.image<=geometry.nav);assert.deepEqual(errors,[]);
  hidden=true;imageRequests=0;await page.reload();
  await page.waitForFunction(()=>document.querySelector('#pixfind-progress')?.textContent==='プレイできません');
  assert.equal(imageRequests,0);
  console.log(JSON.stringify({engine,width,height,mode:fixture.mode,actualApiResponsePlay:'PASS',galleryLink:'PASS',withdrawnBeforeLoad:'PASS',errors:0}));
  await page.close();
 }
 // The actual admin panel module is mounted in the local admin shell with a fake session.
 // list data is a test view of the real public definitions; authentication/Storage signing remain untested.
 for(const [width,height] of [[320,568],[568,320],[1280,800]]) {
  const page=await browser.newPage({viewport:{width,height}}),errors=[],actions=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(BASE).origin?route.continue():route.fulfill({status:200,json:[]}));
  const posts=fixtures.map(f=>{
   const p=f.response.puzzle,publicKey=new URL(p.originalImage.url).pathname.split('/post-public/')[1];
   return {postId:p.postId,title:p.title,caption:'',postKind:'pixel_art',createdAt:'2026-09-28T00:00:00Z',imageUrl:supabaseConfig.url+'/storage/v1/object/sign/post-quarantine/'+publicKey+'?token=fixture',imageWidth:16,imageHeight:16,colorCount:2,imageBytes:1000,location:{globeCell:{id:'globe:v11-meridian-parallel-quarter-degree:216:10'}},puzzle:{mode:f.mode,definition:p.definition,...(p.changedImage?{changedImageUrl:supabaseConfig.url+'/storage/v1/object/sign/post-quarantine/'+new URL(p.changedImage.url).pathname.split('/post-public/')[1]+'?token=fixture'}:{})}};
  });
  await page.route('**/*.supabase.co/**',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.pathname.endsWith('/functions/v1/moderate-post')){
    const body=request.postDataJSON();
    if(body.action==='list')await route.fulfill({status:200,json:{ok:true,posts}});
    else {actions.push(body);await route.fulfill({status:200,json:{ok:true,postId:body.postId,status:'published'}});}
   } else if(url.pathname.includes('/storage/v1/object/sign/post-quarantine/')){
    const key=url.pathname.split('/post-quarantine/')[1],fixture=fixtures.find(f=>Object.hasOwn(f.images,key));
    assert.ok(fixture);await route.fulfill({status:200,contentType:'image/png',body:Buffer.from(fixture.images[key],'base64'),headers:{'access-control-allow-origin':'*'}});
   } else await route.fulfill({status:200,json:[]});
  });
  await page.goto(BASE+'/admin/');
  await page.evaluate(async()=>{
   sessionStorage.setItem('PiXiEED:admin-supabase-session:v1',JSON.stringify({access_token:'fixture-admin',user:{email:'test@example.test'}}));
   const root=document.querySelector('[data-admin-root]');root.replaceChildren();
   const {bindModerationPanel}=await import('/admin/moderation.js');bindModerationPanel(root);
  });
  await page.locator('.admin-moderation__puzzle').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('.admin-moderation__puzzle canvas').length===2&&[...document.querySelectorAll('.admin-moderation__puzzle canvas')].every(c=>c.width===16&&[...c.getContext('2d').getImageData(0,0,16,16).data].some((v,i)=>i%4===3&&v>0)));
  assert.equal((await page.locator('.admin-moderation__target-names').innerText()).trim(),'星');
  const refreshed=page.waitForResponse(r=>r.url().endsWith('/functions/v1/moderate-post')&&r.request().postDataJSON()?.action==='list');
  await page.locator('[data-moderation-action="approve"]').first().click();
  await refreshed;
  assert.equal(actions.length,1);assert.equal(actions[0].action,'approve');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({engine,width,height,adminOverlays:'PASS',explicitApproval:'PASS',errors:0}));
  await page.close();
 }
 } finally { await browser.close(); }
}
