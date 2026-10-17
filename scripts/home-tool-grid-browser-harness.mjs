#!/usr/bin/env node
// Local, isolated visual acceptance for home tool cards. No external requests or existing profile.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4197';assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const root='docs/home-grid-20261017';await mkdir(root+'/screens',{recursive:true});const b=await chromium.launch(),report={startedAt:new Date().toISOString(),checks:[],limitations:['local Chromium; no physical device/Safari/production evidence','200% text simulated through 200% root font size; each card font measured at double size']};
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}]){
 const ctx=await b.newContext({viewport,serviceWorkers:'block'}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin&&r.request().method()==='GET'?r.continue():r.abort());
 await ctx.addInitScript(()=>{if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw Error('media disabled for local home QA');}});});
 await p.goto(base+'/');await p.waitForFunction(()=>document.querySelector('.px-site-header'));await p.locator('.home-primary-tools img').evaluateAll(ns=>Promise.all(ns.map(n=>n.decode())));
 let normal;
 for(const textScale of [100,200]){
  await p.evaluate(scale=>document.documentElement.style.fontSize=scale+'%',textScale);await p.waitForTimeout(150);
  const row=await p.locator('.home-primary-tools').evaluate(n=>{
   const rect=e=>e.getBoundingClientRect().toJSON(),css=e=>getComputedStyle(e);const grid=n.querySelector('nav');
   const textMetrics=e=>{const r=document.createRange();r.selectNodeContents(e);const boxes=[...r.getClientRects()].filter(r=>r.width>0&&r.height>0);return{size:parseFloat(css(e).fontSize),lineHeight:parseFloat(css(e).lineHeight),rect:rect(e),scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,whiteSpace:css(e).whiteSpace,text:e.innerText,lines:new Set(boxes.map(r=>Math.round(r.top))).size};};
   return{grid:rect(grid),columns:css(grid).gridTemplateColumns,documentOverflow:document.documentElement.scrollWidth>innerWidth+1,overflowElements:[...document.querySelectorAll('body *')].filter(e=>e.checkVisibility()&&e.getBoundingClientRect().right>innerWidth+1).slice(0,20).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,80),parent:e.parentElement.className})),cards:[...grid.children].map(c=>({href:c.getAttribute('href'),rect:rect(c),background:css(c).backgroundColor,nestedControls:c.querySelectorAll('a,button').length,heading:textMetrics(c.querySelector('.hp-tool-title')),feature:textMetrics(c.querySelector('.hp-toy-line')),brand:textMetrics(c.querySelector('.hp-tool-brand')),hint:textMetrics(c.querySelector('.hp-card-link')),shot:{src:c.querySelector('.hp-tool-screen img').getAttribute('src'),natural:[c.querySelector('.hp-tool-screen img').naturalWidth,c.querySelector('.hp-tool-screen img').naturalHeight],rect:rect(c.querySelector('.hp-tool-screen')),position:css(c.querySelector('.hp-tool-screen img')).objectPosition},icon:c.querySelector('.hp-tool-brandline img').getAttribute('src')}))};
  });
  assert.deepEqual(row.cards.map(c=>c.href),['/draw/','/camera/','/audio/','/output/']);assert.equal(row.documentOverflow,false);
  assert.ok(row.cards.every(c=>c.rect.width>=44&&c.rect.height>=44&&c.nestedControls===0&&c.shot.natural.every(Boolean)));
  for(const c of row.cards)for(const key of ['heading','feature','brand','hint'])assert.ok(c[key].scrollWidth<=c[key].clientWidth+1,`${viewport.width} ${textScale} ${key} text clips`);
  if(textScale===100){normal=row;assert.equal(row.columns.split(' ').length,viewport.width<900?2:4);assert.ok(row.cards.every(c=>c.feature.lines===1),'short features occupy one line at normal text');assert.ok(row.cards.every(c=>c.heading.rect.bottom<viewport.height-65),'all four function titles visible initially');const heights=row.cards.map(c=>c.rect.height);assert.ok(Math.max(...heights)-Math.min(...heights)<1,'cards share a height');}
  else {assert.ok(row.cards.every((c,i)=>c.heading.size>=normal.cards[i].heading.size*1.99&&c.brand.size>=normal.cards[i].brand.size*1.99),'actual text doubles');if(viewport.width<900)assert.equal(row.columns.split(' ').length,1,'enlarged phone text naturally reflows to one column');}
  await p.screenshot({path:`${root}/screens/home-grid-${viewport.width}-text${textScale}.png`});
  await p.locator('.home-primary-tools').screenshot({path:`${root}/screens/home-grid-cards-${viewport.width}-text${textScale}.png`});
  // Focus every whole-card link and check the text remains reachable after scrolling.
  for(const a of await p.locator('.home-primary-tools nav > a').all()){await a.focus();await a.scrollIntoViewIfNeeded();assert.ok(await a.evaluate(n=>n===document.activeElement));}
  await p.evaluate(()=>scrollTo(0,0));report.checks.push({viewport,textScale,...row});
 }
 if(viewport.width===390){
  await p.evaluate(()=>{document.documentElement.style.fontSize='100%';scrollTo(0,0);});
  for(const mode of ['draw','camera','audio']){
   const href=mode==='draw'?'/draw/':`/${mode}/`;await p.locator(`.home-primary-tools nav > a[href="${href}"]`).click();
   await p.waitForURL(u=>u.pathname===href);
   await p.waitForFunction(mode=>{const d=document.querySelector('.tool-embed__frame')?.contentDocument;return d?.documentElement.dataset.creationModesReady==='true'&&d.body.dataset.creationMode===mode&&!d.body.hasAttribute('data-creation-transition');},mode);
   const expand=p.locator('[data-embed-expand]');await expand.click();assert.equal(await expand.getAttribute('aria-expanded'),'true');await expand.click();assert.equal(await expand.getAttribute('aria-expanded'),'false');
   await p.goto(base+'/');await p.waitForFunction(()=>document.querySelector('.px-site-header'));
  }
  await p.locator('.home-primary-tools nav > a[href="/output/"]').click();await p.waitForURL(u=>u.pathname==='/output/');assert.ok(await p.locator('.hero-actions a[href="/output/work/"]').isVisible());
  report.destinations={drawCameraAudio:'retained editor mode verified',fullscreen:'expand and restore all three modes',output:'introduction page with workspace entry'};
 }
 assert.deepEqual(errors,[]);await ctx.close();
}
await b.close();report.completedAt=new Date().toISOString();await writeFile(root+'/browser.json',JSON.stringify(report,null,2));console.log(JSON.stringify({result:'PASS',cases:report.checks.length,completedAt:report.completedAt}));
