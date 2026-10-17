import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4197';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const phase=process.env.PHASE||'before', root='docs/home-map-20261017';
assert.ok(['before','after'].includes(phase));
const baseline=new Map();
if(phase==='before') for(const file of execFileSync('git',['diff','--name-only'],{encoding:'utf8'}).trim().split('\n').filter(Boolean)) baseline.set('/'+file,execFileSync('git',['show','HEAD:'+file]));
const browser=await chromium.launch({headless:true});
const results=[];
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1280,height:800}]){
 const ctx=await browser.newContext({viewport,serviceWorkers:'block'});
 await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===new URL(base).origin&&r.request().method()==='GET'){const path=u.pathname==='/'?'/index.html':u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname;if(baseline.has(path))return r.fulfill({body:baseline.get(path),contentType:path.endsWith('.css')?'text/css':path.endsWith('.mjs')?'text/javascript':'text/html'});return r.continue();}return r.abort();});
 const page=await ctx.newPage();
 for(const path of ['/','/globe/']){
  await page.goto(base+path);await page.waitForTimeout(1200);
  const name=path==='/'?'home':'map';
  const row={phase,name,viewport,outer:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,scrollHeight:document.scrollingElement.scrollHeight,header:document.querySelector('header')?.getBoundingClientRect().toJSON(),nav:[...document.querySelectorAll('nav')].filter(e=>e.checkVisibility()).map(e=>({label:e.ariaLabel,rect:e.getBoundingClientRect().toJSON(),text:e.textContent.trim()}))}))};
  await page.screenshot({path:`${root}/screens/${name}-${viewport.width}-${phase}.png`});
  if(name==='map'){
   const f=page.frames().find(f=>f!==page.mainFrame()); await f.waitForFunction(()=>globalThis.__PIXIEED_MAP_EVENTS__);
   row.frame=await f.evaluate(()=>({viewport:[innerWidth,innerHeight],stage:document.querySelector('#globeStage').getBoundingClientRect().toJSON(),controls:[...document.querySelectorAll('nav')].filter(e=>e.checkVisibility()).map(e=>({label:e.ariaLabel,rect:e.getBoundingClientRect().toJSON(),text:e.textContent.trim()}))}));
   await f.locator('[data-map-content="events"]').click();await page.waitForTimeout(300);
   await page.screenshot({path:`${root}/screens/map-events-${viewport.width}-${phase}.png`});
   await f.locator('.map-events-dock__all').click();await page.waitForTimeout(100);
   row.panel=await f.locator('.map-events-panel').evaluate(e=>({rect:e.getBoundingClientRect().toJSON(),body:e.querySelector('.map-events-panel__body').getBoundingClientRect().toJSON(),text:e.innerText.slice(0,400)}));
   await page.screenshot({path:`${root}/screens/map-list-${viewport.width}-${phase}.png`});
  }
  results.push(row);
 }
 await ctx.close();
}
await browser.close();await writeFile(`${root}/${phase}-layout.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
