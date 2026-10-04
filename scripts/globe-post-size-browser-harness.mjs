#!/usr/bin/env node
// Local product UI -> intercepted submission -> actual PNG verifier. No public writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { verifyPixelPngClaim } from '../supabase/functions/_shared/pixel-png.mjs';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4178';
const origin=new URL(base).origin;
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const runtime=process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(runtime).href);
const browser=await chromium.launch({headless:true});
let checks=0;
try {
 for(const viewport of [{width:390,height:844},{width:1280,height:800}]) for(const dimensions of [{width:256,height:64},{width:64,height:256}]) {
  const context=await browser.newContext({viewport,permissions:['geolocation'],geolocation:{latitude:35.6895,longitude:139.6917}});
  const submissions=[];
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.origin===origin)return route.continue();
   if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'*','access-control-allow-methods':'POST,GET,OPTIONS'}});
   if(url.pathname.endsWith('/functions/v1/create-post')&&request.method()==='POST') {
    const payload=request.postDataJSON();
    const actual=await verifyPixelPngClaim(new Uint8Array(Buffer.from(payload.image.base64,'base64')),payload.image);
    submissions.push({payload,actual});
    return route.fulfill({status:201,contentType:'application/json',headers:{'access-control-allow-origin':origin},body:JSON.stringify({ok:true,postId:'11111111-1111-4111-8111-111111111111',status:'pending'})});
   }
   return route.abort();
  });
  await context.addInitScript(({width,height})=>{
   if(window.parent!==window)return;
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d');
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){ctx.fillStyle=(x+y)%2?'#dc8420':'#234567';ctx.fillRect(x,y,1,1);}
   localStorage.setItem('PiXiEED:camera-handoff:v1',JSON.stringify({createdAt:Date.now(),dataUrl:canvas.toDataURL('image/png')}));
   localStorage.setItem('PiXiEED:supabase-session:v1',JSON.stringify({access_token:'fixture-token',expires_at:Math.floor(Date.now()/1000)+3600}));
  },dimensions);
  const page=await context.newPage();await page.goto(base+'/globe/?from=pixel-camera');
  const frame=page.frameLocator('iframe');await frame.locator('.composer:not([hidden])').waitFor();
  const globe=page.frames().find(frame=>frame.url().includes('globe-prototype.html'));
  await globe.waitForFunction(()=>globalThis.__PIXIEED_POSTS__?.getState().image&&globalThis.__PIXIEED_POSTS__.getState().pin?.source==='geolocation');
  await frame.locator('[data-title]').fill('横長・縦長の作品');
  await frame.locator('[data-submit]').click();
  await frame.locator('[data-done]:not([hidden])').waitFor();
  assert.equal(submissions.length,1);
  assert.equal(submissions[0].actual.width,dimensions.width);assert.equal(submissions[0].actual.height,dimensions.height);
  assert.equal(submissions[0].actual.colorCount,2);assert.ok(submissions[0].payload.location.globeCell);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await globe.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log(JSON.stringify({viewport,dimensions,result:'PASS: explicit submit accepts actual rectangular PNG'}));checks++;
  await context.close();
 }
 console.log(JSON.stringify({status:'PASS',checks,physicalDevice:'UNTESTED',productionPost:'UNTESTED'}));
}finally{await browser.close()}
