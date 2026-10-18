/** Local-only acceptance: isolated storage, synthetic art, all nonlocal/mutating requests blocked. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base = process.env.PIXIEED_BROWSER_BASE_URL || 'http://127.0.0.1:4197';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const out = process.env.PIXIEED_ENTRY_OUTPUT || '/tmp/pixieed-entry-evidence';
const { chromium } = await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE || '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
await mkdir(out, { recursive: true });
const b = await chromium.launch({ headless: true });
const report = { engine: b.version(), base, externalRequestsSent: 0, cases: [], failures: [], limitations: ['Chromium synthetic mobile widths; Safari, physical rotation/keyboard and hardware camera untested', 'Network requests other than same-origin GET/HEAD are blocked; no real analytics/ad/publication traffic'] };
const ready = async p => {
  await p.waitForFunction(() => document.querySelector('[data-embed-status]')?.textContent.includes('編集を保持'));
  const f = p.frames().find(f => f.url().includes('/draw/editor.html'));
  assert.ok(f); await f.waitForFunction(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__ && !document.querySelector('#main').inert);
  await p.waitForFunction(() => document.querySelector('.tool-embed--expanded'));
  return f;
};
const state = f => f.evaluate(() => window.__PIXIEED_TOOL_EMBED_BRIDGE__.getState());
const paint = async(p, f, x=3,y=4) => {
  const r=await f.locator('#draw-canvas').boundingBox(); const [w,h]=await f.locator('#draw-canvas').evaluate(n=>[n.width,n.height]);
  await p.mouse.click(r.x+(x+.5)*r.width/w,r.y+(y+.5)*r.height/h);
};
async function context(viewport, row, extra={}) {
 const c=await b.newContext({viewport,hasTouch:viewport.width<600,serviceWorkers:'block',acceptDownloads:true});
 await c.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.origin!==base || !['GET','HEAD'].includes(r.request().method())) { row.blocked.push(u.hostname); return r.abort(); }
   if(extra.injectDraw && u.pathname==='/js/creation/draw-page.mjs') {const response=await r.fetch();const s=await response.text();const marker='return {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,';assert.ok(s.includes(marker));return r.fulfill({response,body:s.replace(marker,'return window.__qaDraw = {\n  get workspace() { return pxdBridge; }, dispose: disposeDrawMode,')});}
   if(extra.fail && u.pathname==='/draw/editor.html') return r.abort();
   return r.continue();
 });
 await c.addInitScript(()=>{
  // Select the retained iframe fallback explicitly; dedicated routes now default to direct.
  if (/^\/(?:draw|camera|audio)\/(?:index\.html)?$/.test(location.pathname)) { const url=new URL(location.href);url.searchParams.set('runtime','iframe');history.replaceState(history.state,'',url.href); }

  window.__qaMedia={requests:0,stops:0,audioContexts:0};
  const Audio=window.AudioContext||window.webkitAudioContext;if(Audio)window.AudioContext=class extends Audio{constructor(...args){super(...args);window.__qaMedia.audioContexts++;}};
  if(navigator.mediaDevices) navigator.mediaDevices.getUserMedia=async()=>{window.__qaMedia.requests++;if(!window.__qaAllowFake)throw new DOMException('QA denial','NotAllowedError');const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d');ctx.fillStyle='#e75445';ctx.fillRect(0,0,32,32);const s=c.captureStream(12);for(const t of s.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{window.__qaMedia.stops++;stop();};}return s;};
 });
 return c;
}
async function run(label,viewport,fn,extra) {
 const row={label,checks:[],blocked:[],errors:[]};report.cases.push(row);const c=await context(viewport,row,extra);const p=await c.newPage();p.setDefaultTimeout(20000);p.on('pageerror',e=>row.errors.push(e.message));
 try{await fn(p,row,c);assert.deepEqual(row.errors,[]);console.log('PASS',label,row.checks.length);}catch(e){row.failure=e.stack;report.failures.push(label);console.error('FAIL',label,e.message);await p.screenshot({path:`${out}/${label}-failure.png`}).catch(()=>{});}finally{await c.close();await writeFile(`${out}/browser-results.json`,JSON.stringify(report,null,2));}
}
try {
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:568}])for(const mode of ['draw','camera','audio']) {
 await run(`${mode}-${viewport.width}`,viewport,async(p,row)=>{
  await p.goto(`${base}/${mode}/?keep=one&keep=two#qa-fragment`);
  await p.locator('[data-embed-start]').waitFor({state:'visible'});await p.waitForTimeout(250);
  assert.equal(await p.locator('iframe').count(),0);
  assert.equal(await p.evaluate(()=>performance.getEntriesByType('resource').some(r=>/draw-entry|draw-page|creation-camera|draw-music\.mjs/.test(r.name))),false);
  const start=await p.locator('[data-embed-start]').boundingBox();assert.ok(start.y>=0&&start.y+start.height<=viewport.height);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await p.screenshot({path:`${out}/${mode}-${viewport.width}-intro.png`});
  row.checks.push('description first view has reachable start and no editor code/iframe preload');
  await p.locator('[data-embed-start]').click();let f=await ready(p);
  assert.equal((await state(f)).mode,mode);assert.deepEqual(new URL(f.url()).searchParams.getAll('keep'),['one','two']);assert.equal(new URL(f.url()).hash,'#qa-fragment');
  assert.equal(new URL(p.url()).searchParams.get('workspace'),'1');assert.equal(await f.evaluate(()=>window.__qaMedia.requests),0);assert.equal(await f.evaluate(()=>window.__qaMedia.audioContexts),0);
  assert.equal(await p.locator('iframe').count(),1);assert.equal(await p.locator('.site-header').evaluate(n=>n.inert || getComputedStyle(n).display==='none'),true);
  await f.evaluate(()=>window.__qaToken=crypto.randomUUID());const token=await f.evaluate(()=>window.__qaToken);
  for(const sel of ['#creation-mode-menu > summary','#creation-file-open','#creation-settings-open','#creation-output-open',mode==='draw'?'#draw-animation-play':mode==='camera'?'#capture':'#draw-music-play']){
    assert.ok(await f.locator(sel).isVisible(),sel); const r=await f.locator(sel).boundingBox(); assert.ok(r.y>=0 && r.y+r.height<=viewport.height+1,`${sel} in viewport`);
  }
  const exit=await p.locator('[data-shell-explanation]').boundingBox();assert.ok(exit.x>=0&&exit.y>=0&&exit.x+exit.width<=viewport.width+1&&exit.height>=44);
  const frameBounds=await p.locator('iframe').boundingBox();assert.ok(frameBounds.width>=viewport.width-2);
  row.checks.push('one click opens selected mode at viewport size, five bottom controls retained, no camera autoplay');
  let before=await state(f);
  if(mode==='draw'){
   await paint(p,f);const painted=await state(f);assert.notEqual(painted.image.hash,before.image.hash);await f.locator('#draw-undo').click();before=await state(f);assert.equal(before.image.hash,(await state(f)).image.hash);assert.equal(before.controls.redoDisabled,false);
  }
  if(mode==='audio'){
   await f.locator('#draw-music-settings').evaluate(n=>n.open=true);await f.locator('#draw-music-instrument').selectOption('triangle');await f.locator('#draw-music-settings').evaluate(n=>n.open=false);await paint(p,f);await f.locator('#draw-music-play').click();await f.waitForFunction(()=>document.querySelector('#draw-music-play').getAttribute('aria-pressed')==='true');before=await state(f);
  }
  await p.locator('[data-shell-explanation]').click();await p.locator('[data-embed-start]').waitFor({state:'visible'});await p.waitForFunction(()=>!document.querySelector('.tool-embed--active'));
  assert.equal(await p.locator('[data-embed-start]').innerText(),'作業に戻る');assert.equal(await p.locator('iframe').count(),1);assert.equal(new URL(p.url()).searchParams.has('workspace'),false);assert.equal(await p.locator('iframe').isVisible(),false);
  if(mode==='audio')assert.notEqual(await f.locator('#draw-music-play').getAttribute('aria-pressed'),'true');
  await p.locator('[data-embed-start]').click();f=await ready(p);assert.equal(await f.evaluate(()=>window.__qaToken),token);assert.deepEqual(await state(f),before);
  if(mode==='audio')assert.notEqual(await f.locator('#draw-music-play').getAttribute('aria-pressed'),'true');
  if(mode==='draw'){
   await f.locator('#draw-redo').click();await f.locator('#draw-canvas').focus();await p.keyboard.press('v');const r=await f.locator('#draw-canvas').boundingBox();await p.mouse.move(r.x+r.width*.1,r.y+r.height*.1);await p.mouse.down();await p.mouse.move(r.x+r.width*.35,r.y+r.height*.35,{steps:4});await p.mouse.up();assert.equal(await f.locator('.draw-selection').isVisible(),true);
   const selected=await state(f);await p.locator('[data-shell-explanation]').click();await p.locator('[data-embed-start]').waitFor({state:'visible'});await p.locator('[data-embed-start]').click();await ready(p);assert.equal(await f.locator('.draw-selection').isVisible(),true);assert.deepEqual(await state(f),selected);
  }
  row.checks.push('explanation and resume preserve context, pixels, layer/frame timeline, Undo and selection; audio remains stopped');
  await p.goBack();await p.waitForFunction(()=>!document.querySelector('.tool-embed--active'));await p.goForward();await ready(p);assert.equal(await f.evaluate(()=>window.__qaToken),token);
  assert.deepEqual(new URL(p.url()).searchParams.getAll('keep'),['one','two']);assert.equal(new URL(p.url()).hash,'#qa-fragment');
  row.checks.push('browser Back/Forward toggles view without reloading frame and retains repeated query/hash');
  await p.setViewportSize({width:viewport.height,height:viewport.width});await p.waitForTimeout(120);let r=await p.locator('[data-shell-explanation]').boundingBox();assert.ok(r.y>=0&&r.y+r.height<=viewport.width);
  await p.setViewportSize({width:viewport.width,height:Math.min(420,viewport.height)});await p.waitForTimeout(120);r=await f.locator('#creation-output-open').boundingBox();assert.ok(r.y>=0&&r.y+r.height<=420);assert.equal(await f.evaluate(()=>window.__qaToken),token);
  await p.setViewportSize(viewport);await p.waitForTimeout(150);await p.screenshot({path:`${out}/${mode}-${viewport.width}-work.png`});
  row.checks.push('synthetic rotation and reduced keyboard viewport keep controls and frame');
  // Direct links/reload and normal URL reload have intentionally distinct boot behavior.
  await p.reload();await ready(p);assert.equal(await p.locator('iframe').count(),1);await p.locator('[data-shell-explanation]').click();await p.locator('[data-embed-start]').waitFor({state:'visible'});await p.reload();await p.locator('[data-embed-start]').waitFor({state:'visible'});assert.equal(await p.locator('iframe').count(),0);
  row.checks.push('workspace reload boots once; explanation reload keeps editor unloaded');
 });
 }
 // Verify actual home launch destinations and repeat navigation using the same isolated storage.
 await run('home-launches',{width:390,height:844},async(p,row)=>{
  for(const mode of ['draw','camera','audio']){await p.goto(base+'/');const link=p.locator(`[data-static-tool="${mode==='draw'?'editor':mode==='audio'?'sound':'camera'}"]`);assert.equal(await link.getAttribute('href'),`/${mode}/?workspace=1`);await link.click();const f=await ready(p);assert.equal((await state(f)).mode,mode);}
  row.checks.push('home launches all three modes straight into work');
 });
 // Delay readiness and immediately return to explanation: late ready must not steal the view.
 await run('startup-race',{width:390,height:844},async(p,row,c)=>{
  await c.route('**/draw/editor.html?*',async r=>{await new Promise(res=>setTimeout(res,350));return r.continue();});
  await p.goto(base+'/draw/?workspace=1');await p.locator('[data-shell-explanation]').click();await p.waitForTimeout(1100);assert.equal(await p.locator('.tool-embed--expanded').count(),0);await p.locator('[data-embed-start]').click();await ready(p);assert.equal(await p.locator('iframe').count(),1);row.checks.push('late startup cannot reopen dismissed work; restart retains instance');
 });
 // Recover a failed iframe only after explicit retry, without touching a ready editor.
 const failure={fail:true};await run('startup-retry',{width:390,height:844},async(p,row)=>{
  await p.goto(base+'/draw/?workspace=1');await p.locator('[data-embed-retry]').waitFor({state:'visible',timeout:25000});failure.fail=false;await p.locator('[data-embed-retry]').click();await ready(p);assert.equal(await p.locator('iframe').count(),1);row.checks.push('failed initialization exposes explicit retry then full work view');
 },failure);
} finally {await b.close();}
console.log(JSON.stringify({cases:report.cases.length,checks:report.cases.reduce((n,r)=>n+r.checks.length,0),failures:report.failures}));
if(report.failures.length)process.exitCode=1;
