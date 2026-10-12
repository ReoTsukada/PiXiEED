#!/usr/bin/env node
/** Real local pages only. External services are blocked; no production writes. */
import assert from 'node:assert/strict';
import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const startedAt=new Date().toISOString();
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const phase = process.env.PIXIEED_NAV_PHASE || 'after';
const base = process.env.PIXIEED_BROWSER_BASE_URL || (phase === 'before' ? 'http://127.0.0.1:4191' : 'http://127.0.0.1:4188');
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
assert.ok(['before','after'].includes(phase));
const output = resolve(process.env.PIXIEED_NAV_OUTPUT || '/tmp/pixieed-nav-review');
const { chromium } = await import(process.env.PIXIEED_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] });
const variants = [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}];
const samples = ['/','/draw/','/audio/','/pixel-camera.html','/globe-prototype.html','/events/pixelween-2026/','/books/','/about/'];
async function htmlFiles(dir = '.', prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    if (entry.name.startsWith('.') || ['docs','tests','node_modules','supabase','scripts','assets'].includes(entry.name)) continue;
    const name = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await htmlFiles(`${dir}/${entry.name}`, `${name}/`));
    else if (entry.name.endsWith('.html')) files.push(`/${name.replace(/index\.html$/, '')}`);
  }
  return files.sort();
}
const paths = process.env.PIXIEED_NAV_PATHS?.split(',') || (phase === 'before' ? samples : await htmlFiles());
const transfers=new Map();
for(const path of paths.filter(p=>p.includes('/puzzles/'))) {
  const source=await readFile(resolve(`.${path}index.html`),'utf8');
  const call=source.match(/window\.location\.replace\(("[^\n]+?")\)/);
  assert.ok(call,`${path}: generated transfer must declare its destination`);
  const destination=new URL(JSON.parse(call[1]));
  const [,game,,id]=path.split('/').filter(Boolean);
  assert.equal(destination.hostname,'pixieed.jp');
  assert.equal(destination.pathname,`/play/${game}/`);
  assert.equal(destination.searchParams.get('puzzle'),id);
  transfers.set(path,{destination:destination.pathname+destination.search,verificationTarget:destination.pathname,
    reason:'Static puzzle-share wrapper; verify its declared destination through the corresponding local player route. No external document is loaded.'});
}
const selector = '.px-header-brand,.menu-toggle,.site-menu__close,.site-settings__close,.px-tool-header-panel-close,.px-tool-header-control:is(button,a),.px-tool-header-control>summary,#creation-mode-menu>summary,.creation-mode-menu__panel button,.project-bar>button,.pixfind-back,.puzzle-list-back,.lens-back,.site-menu__profile,.site-menu__group a,.site-menu__group button,.site-menu__utilities button,.site-settings__actions button,.app-tabs>a,.app-tabs>button,.globe-app-tabs>a,.globe-app-tabs>button,.mobile-nav>a,.site-nav a,.footer-links a,.site-footer .brand,.breadcrumbs a,.event-site-header a,.event-page+footer a,.event-globe-link a,.event-source,.admin-header .brand,.catalog-brand,.output-brand,.catalog-footer a,[data-detail-close],.room-back,.cmt-back,#passBack,#shops-back,.page-hero .button,[data-current-editor]';
const results = [], failures = [];
await mkdir(output,{recursive:true});
const before = phase === 'after' ? JSON.parse(await readFile(`${output}/before.json`,'utf8').catch(()=>'[]')) : [];
async function geometry(page) {
  return page.evaluate(selector => [...document.querySelectorAll(selector)].filter(el => el.checkVisibility()).map(el => {
    const r=el.getBoundingClientRect(), s=getComputedStyle(el);
    return { id:el.id, cls:el.className, label:el.getAttribute('aria-label')||el.textContent.trim(),width:r.width,height:r.height,radius:s.borderTopLeftRadius,rect:r.toJSON(),disabled:el.matches(':disabled'),current:el.getAttribute('aria-current'),pressed:el.getAttribute('aria-pressed'),icons:[...el.querySelectorAll('img,svg')].filter(i=>i.checkVisibility()).map(i=>{const q=i.getBoundingClientRect();return {width:q.width,height:q.height};}) };
  }),selector);
}
try {
  for (const viewport of variants) {
    const context = await browser.newContext({viewport,hasTouch:true});
    await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.fulfill({status:200,body:''}));
    await context.addInitScript(() => { if(navigator.mediaDevices)Object.defineProperty(navigator.mediaDevices,'getUserMedia',{value:async()=>{throw new DOMException('Synthetic navigation QA camera','NotFoundError');}}); });
    const page=await context.newPage();page.setDefaultTimeout(10000);
    for (const path of paths) {
      const label=`${path} ${viewport.width}x${viewport.height}`, row={path,viewport,checks:[],status:'PENDING'};
      try {
        if(transfers.has(path)) {row.transfer=transfers.get(path);row.status='REDIRECT_PENDING';row.controls=[];results.push(row);continue;}
        await page.goto(base+path,{waitUntil:'load'});
        await page.waitForTimeout(250);
        if (await page.locator('.draw-viewport').count()) await page.waitForFunction(() => document.documentElement.dataset.creationModesReady === 'true' && !document.body.hasAttribute('data-creation-transition') && document.querySelector('#main').inert === false && (!['audio','camera'].includes(new URLSearchParams(location.search).get('mode')) || document.body.dataset.creationMode === new URLSearchParams(location.search).get('mode')));
        await page.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
        row.actualPath=new URL(page.url()).pathname;
        row.controls=await geometry(page);
        row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
        row.workspace=await page.locator('.draw-viewport').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
        if (phase==='after') {
          if(path==='/admanager-rewarded-test/') {
            assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
            assert.equal(await page.locator('.px-site-header,[data-site-menu],.app-tabs').count(),0);
            assert.equal(await page.locator('#delivery-mode').inputValue(),'mock');
            assert.equal(await page.evaluate(()=>Boolean(window.googletag)),false);
            assert.equal(row.overflow,false,`${label}: isolated test layout overflow`);
            row.status='NAV_EXCLUDED';row.reason='Noindexed, independently tested mock page deliberately has no site navigation or GPT loader.';
            results.push(row);continue;
          }
          if(path==='/books/pixel-guide.html') {
            assert.equal(await page.locator('a,button,summary,nav').count(),0,'embedded reading sample has no navigation');
            row.status='NAV_EXCLUDED';row.reason='Embedded original reading sample: no anchors, buttons, summaries or navigation in its actual document.';
            assert.equal(row.overflow,false,`${label}: reading layout overflow`);
            results.push(row);continue;
          }
          assert.ok(row.controls.length>0,`${label}: no navigation matched; a selector or explicit exclusion is required`);
          for(const c of row.controls) {
            assert.ok(c.width>=43.99&&c.height>=43.99,`${label}: target ${JSON.stringify(c)}`);
            assert.equal(c.radius,'10px',`${label}: radius ${c.label}`);
            if(!/brand|profile/.test(c.cls)) for(const i of c.icons) assert.ok(Math.abs(i.width-24)<.1&&Math.abs(i.height-24)<.1,`${label}: icon ${JSON.stringify(c)}`);
          }
          const old=before.find(r=>r.path===path&&r.viewport.width===viewport.width);
          if(old?.workspace.length&&row.workspace.length) assert.ok(row.workspace[0].height>=old.workspace[0].height-.1,`${label}: canvas viewport must not shrink`);
          assert.equal(row.overflow,false,`${label}: horizontal overflow`);
          row.checks.push('all visible navigation targets >=44px, radius10px, icons24px');
          const headerScroller=page.locator('.px-tool-header-controls');
          if(await headerScroller.count()) {
            const launchers=headerScroller.locator('.px-tool-header-control:is(button,a),.px-tool-header-control>summary');
            for(let i=0;i<await launchers.count();i++) {
              const control=launchers.nth(i);if(!await control.isVisible())continue;
              await control.scrollIntoViewIfNeeded();
              const target=await control.evaluate(n=>{const r=n.getBoundingClientRect(),s=n.closest('.px-tool-header-controls').getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {width:Math.min(r.right,s.right)-Math.max(r.left,s.left),reachable:n===hit||n.contains(hit)};});
              assert.ok(target.width>=43.99&&target.reachable,`${label}: scrolled header target remains reachable`);
            }
            await headerScroller.evaluate(n=>n.scrollLeft=0);
            row.checks.push('each header launcher exposes a full >=44px target by horizontal scrolling, with its own centre hit');
          }
          const bottom=page.locator('.app-tabs:visible,.globe-app-tabs:visible,.mobile-nav:visible').first();
          if(await bottom.count()) {
            const targets=await bottom.locator(':scope > a,:scope > button').evaluateAll(nodes=>nodes.filter(n=>n.checkVisibility()).map(n=>{const r=n.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {rect:r.toJSON(),reachable:n===hit||n.contains(hit)};}));
            for(const t of targets) {assert.ok(t.rect.left>=0&&t.rect.right<=viewport.width+.1&&t.rect.bottom<=viewport.height+.1,`${label}: bottom fits`);assert.ok(t.reachable,`${label}: bottom reachable`);}
            const text=bottom.locator('.app-tab-label').first();
            if(await text.count()) {
              const original=await text.textContent();await text.evaluate(n=>n.textContent='長いナビゲーションの表示名'.repeat(5));
              assert.ok(await text.evaluate(n=>{const r=n.getBoundingClientRect();return r.right<=innerWidth&&getComputedStyle(n).textOverflow==='ellipsis';}),`${label}: long bottom label fits`);
              await text.evaluate((n,t)=>n.textContent=t,original);
              row.checks.push('long bottom label uses ellipsis within the same target');
            }
            row.checks.push('bottom nav fits; each centre hit reaches its own control');
          }
        }
        const stem=`${phase}-${path==='/'?'home':path.replaceAll('/','_').replaceAll('.','_')}-${viewport.width}x${viewport.height}`;
        if(samples.includes(path)) await page.screenshot({path:`${output}/${stem}.png`});
        if(samples.includes(path)&&await page.locator('[data-menu-toggle]').count()) {
          const toggle=page.locator('[data-menu-toggle]');await toggle.click();
          await page.locator('[data-site-menu]').waitFor({state:'visible'});
          await page.waitForTimeout(260);
          row.menu=await geometry(page);
          if(phase==='after') {
            for(const c of row.menu) {assert.ok(c.width>=43.99&&c.height>=43.99,`${label}: menu target`);assert.equal(c.radius,'10px',`${label}: menu radius ${c.label}`);}
            const close=page.locator('[data-menu-close]');assert.ok(await close.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),`${label}: menu close reachable`);
            const links=page.locator('.site-menu__group a,.site-menu__group button');
            const first=links.first();const original=await first.innerHTML();await first.evaluate(n=>n.textContent='とても長いメニュー項目の表示と折り返し確認'.repeat(4));
            const long=await first.evaluate(n=>{const r=n.getBoundingClientRect();return r.right<=innerWidth&&n.scrollWidth<=n.clientWidth+1&&r.height>=44});assert.ok(long,`${label}: long menu text wraps`);
            await first.evaluate((n,t)=>n.innerHTML=t,original);
            const focusables=page.locator('[data-site-menu] a[href],[data-site-menu] button:not(:disabled)');await focusables.last().focus();await page.keyboard.press('Tab');assert.ok(await close.evaluate(n=>n===document.activeElement),`${label}: focus trapped`);
            assert.equal(await close.evaluate(n=>getComputedStyle(n).outlineStyle),'solid',`${label}: keyboard focus visible`);
            await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.ok(await toggle.evaluate(n=>document.activeElement===n),`${label}: Escape returns focus`);
            await toggle.click();await page.locator('[data-menu-setting="all"]').click();await page.locator('[data-site-settings][open]').waitFor();
            await page.locator('[data-settings-close]').last().click();await page.waitForFunction(()=>document.activeElement?.matches('[data-menu-toggle]'));assert.ok(await toggle.evaluate(n=>document.activeElement===n),`${label}: settings returns focus`);
            await toggle.click();await page.waitForTimeout(260);
            row.checks.push('long text wraps; menu focus trap, visible focus, Escape, settings close and focus return');
          }
          await page.locator('.site-menu__body').evaluate(n=>n.scrollTop=0);await page.screenshot({path:`${output}/${stem}-menu.png`});await page.locator('[data-menu-close]').click();
        }
        if(phase==='after'&&path==='/draw/') {
          const control=page.locator('#draw-animation-play');const rect=await control.boundingBox();
          const state=await control.evaluate(n=>({disabled:n.disabled,pressed:n.getAttribute('aria-pressed')}));
          await control.evaluate(n=>{n.disabled=true;n.setAttribute('aria-pressed','true')});
          assert.deepEqual(await control.boundingBox(),rect,`${label}: disabled/pressed geometry stable`);
          assert.equal(await control.evaluate(n=>getComputedStyle(n).opacity),'0.46',`${label}: disabled visible`);
          await control.evaluate((n,s)=>{n.disabled=s.disabled;if(s.pressed===null)n.removeAttribute('aria-pressed');else n.setAttribute('aria-pressed',s.pressed)},state);
          row.checks.push('disabled and pressed state geometry stable');
        }
        row.status=phase==='after'?'NAV_PASS':'BEFORE_CAPTURE';results.push(row);
      } catch(error) {row.status='FAIL';row.failure=error.message;results.push(row);failures.push({label,error:error.message});console.error(`FAIL ${label}: ${error.message.slice(0,350)}`);}
    }
    await context.close();console.log(`${phase} ${viewport.width}x${viewport.height}: ${paths.length} routes checked`);
  }
  for(const row of results.filter(r=>r.status==='REDIRECT_PENDING')) {
    const target=results.find(r=>r.path===row.transfer.verificationTarget&&r.viewport.width===row.viewport.width);
    if(target?.status==='NAV_PASS'&&target.controls.length) {row.status='REDIRECT_VERIFIED';row.actualPath=target.actualPath;row.checks.push(`Destination ${target.path} has independently verified navigation at this viewport`);}
    else {row.status='FAIL';row.failure='Redirect destination has no independently passing navigation result';failures.push({label:row.path,error:row.failure});}
  }
} finally {
  await browser.close();await writeFile(`${output}/${phase}.json`,JSON.stringify(results,null,2));await writeFile(`${output}/${phase}-failures.json`,JSON.stringify(failures,null,2));
  await writeFile(`${output}/metadata.json`,JSON.stringify({head,sourceFingerprint:process.env.PIXIEED_SOURCE_FINGERPRINT||null,base,startedAt,finishedAt:new Date().toISOString(),counts:results.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a},{}),physicalDevices:'UNTESTED',externalRequests:'blocked',cameraPermission:'never granted'},null,2));
}
console.log(`${phase}: ${JSON.stringify(results.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a},{}))}; physical devices and production UNTESTED; output ${output}`);
if(failures.length)process.exitCode=1;
