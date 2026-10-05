#!/usr/bin/env node
// Synthetic viewer image-fit checks at narrow, mobile, and desktop sizes; no public writes.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4176';
const origin = new URL(base).origin;
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const runtime = process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(runtime).href);
const browser = await chromium.launch({ headless: true });
const checks = [];
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/globe-prototype.css"></head><body style="margin:0"><main class="globe-stage" style="width:100vw;height:100dvh;border:0"></main><script type="module">
import { initPostUi } from '/js/globe/post-ui.mjs';
const stage=document.querySelector('main');
const dimensions={landscape:[256,64],portrait:[64,256],square:[128,128]};
const posts=Object.entries(dimensions).map(([id,[width,height]])=>({id,title:id,pin:{latitude:35.6,longitude:139.7},author:{name:'Fixture'},caption:'fit-check',createdAt:1,image:{width,height,dataUrl:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><rect width="100%" height="100%" fill="#f4d45d"/><path d="M0 0h'+Math.floor(width/2)+'v'+Math.floor(height/2)+'H0z" fill="#f36"/></svg>')}}));
let snapshot={camera:{projection:'mercator',viewport:{width:innerWidth,height:innerHeight},centerLongitude:0,centerLatitude:0,zoom:2},view:{zoom:2}};
const renderer={getSnapshot:()=>snapshot,setView(){}};
const store={ready:Promise.resolve(),list:()=>posts,subscribe:()=>()=>{}};
window.ui=initPostUi({renderer,stage,store,auth:{getUser:()=>null,subscribe:()=>()=>{}},showMapPins:false});
window.openFixture=id=>window.ui.openViewer(id,{fly:false});
</script></body></html>`;

async function openPage(viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: viewport.width <= 390 ? 2 : 1 });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/viewer-fit-fixture') return route.fulfill({ contentType: 'text/html', body: fixture });
    if (url.pathname === '/js/globe/post-supabase.mjs') return route.fulfill({ contentType: 'text/javascript', body: 'export function createSupabaseGlobeStore(){}; export function createSupabaseGlobeAuth(){};' });
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(`${base}/viewer-fit-fixture`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ui && document.querySelector('.viewer'));
  return { context, page };
}

async function assertFit(page, id, viewport) {
  await page.evaluate(id => window.openFixture(id), id);
  const image = page.locator('[data-v-image]');
  await image.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const image=document.querySelector('[data-v-image]');
    return image?.complete && image.naturalWidth > 0 && image.style.width !== '';
  });
  const result = await page.evaluate(() => {
    const image=document.querySelector('[data-v-image]'), art=image.parentElement, sheet=image.closest('.sheet');
    const style=getComputedStyle(art), innerWidth=art.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight), innerHeight=art.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom);
    const imageRect=image.getBoundingClientRect(), actions=sheet.querySelector('.viewer__actions');
    return {image:{width:imageRect.width,height:imageRect.height,naturalWidth:image.naturalWidth,naturalHeight:image.naturalHeight},innerWidth,innerHeight,art:{width:art.clientWidth,height:art.clientHeight},sheet:{clientWidth:sheet.clientWidth,scrollWidth:sheet.scrollWidth},actions:{width:actions.clientWidth,scrollWidth:actions.scrollWidth},documentOverflow:document.documentElement.scrollWidth>window.innerWidth+1};
  });
  assert.ok(result.image.width <= result.innerWidth + 1 && result.image.height <= result.innerHeight + 1, `${id} image exceeds art frame: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.image.width / result.image.height - result.image.naturalWidth / result.image.naturalHeight) < 0.02, `${id} aspect ratio changed: ${JSON.stringify(result)}`);
  assert.ok(Math.abs(result.image.width - result.innerWidth) < 1 || Math.abs(result.image.height - result.innerHeight) < 1, `${id} image does not use the largest fitting size: ${JSON.stringify(result)}`);
  assert.equal(result.documentOverflow, false, `page horizontal overflow at ${viewport.width}: ${JSON.stringify(result)}`);
  assert.ok(result.sheet.scrollWidth <= result.sheet.clientWidth + 1, `viewer sheet horizontal overflow: ${JSON.stringify(result)}`);
  assert.ok(result.actions.scrollWidth <= result.actions.width + 1, `viewer controls horizontal overflow: ${JSON.stringify(result)}`);
  await page.locator('.viewer__actions').scrollIntoViewIfNeeded();
  const actionsVisible = await page.locator('[data-v-focus]').isVisible();
  assert.equal(actionsVisible, true, 'viewer controls remain reachable after scrolling');
  return result;
}

try {
  for (const viewport of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}]) {
    const {context,page}=await openPage(viewport);
    try {
      for (const id of ['landscape','portrait','square']) {
        const result=await assertFit(page,id,viewport);
        checks.push(`${viewport.width}x${viewport.height} ${id}: ${result.image.width.toFixed(1)}x${result.image.height.toFixed(1)} inside ${result.innerWidth.toFixed(1)}x${result.innerHeight.toFixed(1)}`);
      }
      const nextViewport=viewport.width===320?{width:390,height:844}:{width:320,height:568};
      await page.evaluate(()=>window.openFixture('portrait'));
      await page.setViewportSize(nextViewport);
      await page.waitForTimeout(80);
      const resized=await page.evaluate(()=>{const image=document.querySelector('[data-v-image]'),art=image.parentElement,s=getComputedStyle(art),w=art.clientWidth-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),h=art.clientHeight-parseFloat(s.paddingTop)-parseFloat(s.paddingBottom),r=image.getBoundingClientRect();return {w,h,iw:r.width,ih:r.height,ratio:r.width/r.height,natural:image.naturalWidth/image.naturalHeight};});
      assert.ok(resized.iw<=resized.w+1&&resized.ih<=resized.h+1,JSON.stringify(resized));
      assert.ok(Math.abs(resized.ratio-resized.natural)<.02,JSON.stringify(resized));
      assert.ok(Math.abs(resized.iw-resized.w)<1||Math.abs(resized.ih-resized.h)<1,JSON.stringify(resized));
      checks.push(`${viewport.width}x${viewport.height} → ${nextViewport.width}x${nextViewport.height} resize re-fits open portrait image`);
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({status:'PASS',checks,usesSyntheticImages:true,signedCalderaPost:'UNTOUCHED',production:'UNTESTED'}));
} finally { await browser.close(); }
