#!/usr/bin/env node
/** Local-only synthetic-provider regression. Source editor pages are fixtures, not editor UI coverage.
 * Usage: node scripts/output-offerwall-browser-harness.mjs BUILD PLAYWRIGHT_MODULE CHROME [REPORT]
 * No production navigation, live advertising, media files, screenshots, or network fallthrough.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [buildArg, playwrightArg, chrome, reportPath] = process.argv.slice(2);
if (!buildArg || !playwrightArg || !chrome) throw new Error('Supply BUILD PLAYWRIGHT_MODULE CHROME [REPORT]');
const build = path.resolve(buildArg), origin = 'https://pixieed-offerwall.test';
const { chromium } = await import(pathToFileURL(path.resolve(playwrightArg)).href);
const report = { scope: 'Synthetic source fixtures exercising actual output modules and built output UI; synthetic provider only, not live ad or full editor verification.', cases: [], failures: [], externalRequestsAborted: 0 };
const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--disable-background-networking', '--disable-component-update'] });
const mime = { '.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.json':'application/json', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.wasm':'application/wasm' };
async function environment(mode='non-fill', options={}) {
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true });
  const requests=[], sdk=[];
  await context.route('**/*', async route => {
    const req=route.request(), url=new URL(req.url());
    if (url.origin !== origin) {
      if (url.hostname === 'pagead2.googlesyndication.com' && url.pathname === '/pagead/js/adsbygoogle.js') {
        sdk.push({ referrer: req.headers().referer || '', url: url.origin+url.pathname });
        return mode==='failure' ? route.abort('failed') : route.fulfill({contentType:'text/javascript', body:'window.__syntheticProviderLoads=(window.__syntheticProviderLoads||0)+1; window.adsbygoogle=window.adsbygoogle||[];'});
      }
      report.externalRequestsAborted++; return route.abort('blockedbyclient');
    }
    if (options.noText && url.pathname === '/js/creation/text-tools.mjs') return route.abort('failed');
    if (req.isNavigationRequest()) requests.push({path:url.pathname+url.search, referrer:req.headers().referer||''});
    if (/^\/(draw|camera|audio)\/$/.test(url.pathname)) return route.fulfill({contentType:'text/html', body:'<!doctype html><meta charset="utf-8"><title>Synthetic source fixture</title><button id="send">Send fixture output</button><p>Not a real editor</p>'});
    const filename=path.resolve(build,'.'+url.pathname+(url.pathname.endsWith('/')?'index.html':''));
    if (!filename.startsWith(build+path.sep)) return route.abort();
    try {
      let body=await readFile(filename);
      if (['/js/adsense-offerwall-policy.js','/js/tool-offerwall-entry.mjs'].includes(url.pathname)) body=Buffer.from(body.toString().replaceAll("https://pixieed.jp",origin));
      return route.fulfill({contentType:mime[path.extname(filename)]||'application/octet-stream',body});
    } catch { return route.fulfill({status:404, body:'Local fixture missing'}); }
  });
  const page=await context.newPage(); page.setDefaultTimeout(15000);
  return {context,page,requests,sdk};
}
async function seed(page, role, kind='image', age=0) {
  await page.goto(origin+'/'+role+'/');
  return page.evaluate(async ({role,kind,age}) => {
    localStorage.setItem('synthetic-editor-sentinel','preserve-me');
    await new Promise((resolve,reject)=>{const r=indexedDB.open('synthetic-editor-draft',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('drafts','readwrite');t.objectStore('drafts').put({layers:[1,2,3]},'draft');t.oncomplete=()=>{db.close();resolve();};};});
    let blob;
    if(kind==='image') { const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').fillRect(0,0,2,2);blob=await new Promise(r=>c.toBlob(r,'image/png')); }
    else if(kind==='audio') {
      const a=new ArrayBuffer(204),v=new DataView(a);const str=(i,s)=>[...s].forEach((c,n)=>v.setUint8(i+n,c.charCodeAt(0)));
      str(0,'RIFF');v.setUint32(4,196,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,160,true);blob=new Blob([a],{type:'audio/wav'});
    } else blob=new Blob(['{"fixture":"synthetic PXD fallback"}'],{type:'application/octet-stream'});
    const ext=kind==='image'?'png':kind==='audio'?'wav':'pxd';
    const expected={bytes:Array.from(new Uint8Array(await blob.arrayBuffer())),filename:'synthetic-'+role+'.'+ext,metadata:{description:'synthetic metadata',width:2,height:2},returnUrl:'/'+role+'/'};
    const handoff=await import('/js/creation/output-handoff.mjs');const router=await import('/js/creation/output-router.mjs');
    document.addEventListener('click',event=>{const a=event.target.closest('a');if(a?.href.includes('?entry=1')){sessionStorage.setItem('test-anchor',JSON.stringify({rel:a.rel,policy:a.referrerPolicy}));if(age){const p=JSON.parse(sessionStorage.getItem('pixieed-output-entry-v1'));p.createdAt-=age;sessionStorage.setItem('pixieed-output-entry-v1',JSON.stringify(p));}}},true);
    document.querySelector('#send').onclick=()=>{
      const promise=kind==='pxd'?router.routeEditorFile(blob,expected.filename):handoff.sendToolOutput({blob,filename:expected.filename,metadata:expected.metadata,returnUrl:expected.returnUrl,source:role});
      promise.then(result=>{window.fixtureResult=result;});
    };
    return expected;
  },{role,kind,age});
}
async function stored(page,key,id) {
  return page.evaluate(async({key,id})=>{
    const module=await import(key==='file'?'/js/creation/output-router.mjs':'/js/creation/output-handoff.mjs');
    const r=await (key==='file'?module.readOutputFile(id):module.readToolOutput(id));
    return {bytes:Array.from(new Uint8Array(await r.blob.arrayBuffer())),filename:r.filename,metadata:r.metadata,returnUrl:r.returnUrl};
  },{key,id});
}
async function ready(page) { await page.waitForFunction(()=>document.querySelector('#main a[download]') || document.querySelector('#main [data-convert]')); }
async function test(name, run) { try { await run();report.cases.push({name,status:'passed'}); } catch(error) { report.failures.push({name,error:error.stack});report.cases.push({name,status:'failed'}); } }
try {
  for(const [role,kind,mode,age=0] of [['draw','image','non-fill'],['camera','image','failure'],['audio','audio','non-fill'],['draw','pxd','failure'],['draw','image','non-fill',2*60*60*1000]]) {
    await test(`${role}/${kind}/${mode}${age?'/two-hour-delay':''}`,async()=>{
      const e=await environment(mode);const {page,sdk,requests}=e;
      try {
        const expected=await seed(page,role,kind,age);await page.click('#send');
        await page.waitForURL(origin+'/output/work/'); await ready(page);await page.waitForFunction(()=>window.__PIXIEED_OFFERWALL_ENTRY__?.isEligible());
        await page.waitForTimeout(300);assert.equal(sdk.length,1);
        const state=await page.evaluate(()=>({pointer:history.state.pixieedOutputRequest,pending:sessionStorage.getItem('pixieed-output-entry-v1'),anchor:JSON.parse(sessionStorage.getItem('test-anchor')),referrer:document.referrer,sentinel:localStorage.getItem('synthetic-editor-sentinel')}));
        assert.equal(state.pending,null);assert.deepEqual(state.anchor,{rel:'noreferrer',policy:'no-referrer'});assert.equal(state.referrer,'');assert.equal(state.sentinel,'preserve-me');assert.equal(state.pointer.key,kind==='pxd'?'file':'id');
        assert(requests.some(r=>r.path==='/output/work/?entry=1'&&r.referrer===''));assert.equal(sdk[0].referrer,'');
        const original=await stored(page,state.pointer.key,state.pointer.id);
        assert.deepEqual(original.bytes,expected.bytes);assert.equal(original.filename,expected.filename);assert.equal(original.returnUrl,expected.returnUrl);if(kind!=='pxd')assert.deepEqual(original.metadata,expected.metadata);
        if(await page.locator('[data-width]').count()) await page.locator('[data-width]').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
        await Promise.all([page.waitForEvent('download'),page.locator('#main a[download]').last().evaluate(el=>el.click())]);await page.waitForTimeout(200);assert.equal(sdk.length,1,'Settings/save must not reload provider');
        await page.reload();await ready(page);assert.equal(page.url(),origin+'/output/work/');assert.deepEqual((await stored(page,state.pointer.key,state.pointer.id)).bytes,expected.bytes);
        await page.goBack();assert(new URL(page.url()).pathname==='/'+role+'/');assert.equal(await page.evaluate(()=>localStorage.getItem('synthetic-editor-sentinel')),'preserve-me');
        await page.goForward();await ready(page);assert.equal(page.url(),origin+'/output/work/');assert.equal(await page.evaluate(()=>history.state.pixieedOutputRequest.id),state.pointer.id);
        const before=sdk.length;await page.goto(`${origin}/output/work/?${state.pointer.key}=${state.pointer.id}`);await ready(page);await page.waitForTimeout(300);assert.equal(sdk.length,before,'Legacy pointer must deny provider');assert.equal(await page.evaluate(()=>window.__PIXIEED_OFFERWALL_ENTRY__.isEligible()),false);assert.deepEqual((await stored(page,state.pointer.key,state.pointer.id)).bytes,expected.bytes);
      } finally {await e.context.close();}
    });
  }
  // Actual recovery controller/storage with synthetic corrupt data or a delayed IDB open.
  for(const scenario of ['failure','cancel','optional-text-unavailable']) await test(`recovery-${scenario}`,async()=>{
    const e=await environment('non-fill',{noText:scenario==='optional-text-unavailable'});
    try {
      await seed(e.page,'draw');
      await e.page.evaluate(()=>new Promise((resolve,reject)=>{
        const r=indexedDB.open('pixieed-conversion-recovery-v1',1);
        r.onupgradeneeded=()=>r.result.createObjectStore('workspaces',{keyPath:'id'});
        r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('workspaces','readwrite');t.objectStore('workspaces').put({id:'synthetic-recovery',schemaVersion:999,snapshot:{synthetic:'retained'}});t.oncomplete=()=>{db.close();resolve();};};
      }));
      await e.context.addInitScript(({scenario})=>{
        if(location.pathname!=='/output/work/')return;
        history.replaceState({...history.state,pixieedConversionRecovery:'synthetic-recovery'},'',location.href);
        if(scenario==='cancel') {
          const open=indexedDB.open.bind(indexedDB);
          indexedDB.open=(name,...args)=>{
            const r=open(name,...args);if(name!=='pixieed-conversion-recovery-v1')return r;
            const wrapper={get result(){return r.result;},get error(){return r.error;}};
            for(const type of ['error','blocked','upgradeneeded'])r.addEventListener(type,event=>wrapper['on'+type]?.(event));
            r.addEventListener('success',event=>{const timer=setInterval(()=>{if(window.__releaseRecoveryRead){clearInterval(timer);wrapper.onsuccess?.(event);}},20);});
            return wrapper;
          };
        }
      },{scenario});
      await e.page.goto(origin+'/output/work/?mode=convert');
      if(scenario==='optional-text-unavailable'){await ready(e.page);await e.page.waitForFunction(()=>document.body.dataset.conversionStartup==='ready' && document.querySelector('#output-nav-export'));assert.equal(await e.page.locator('[data-text-tools]').count(),0,'Text module truly unavailable');}
      else {
        await e.page.locator('.sc-local-recovery').waitFor();
        if(scenario==='cancel') {
          await e.page.waitForFunction(()=>document.querySelector('.sc-local-recovery')?.dataset.phase==='loading');
          assert.equal(e.sdk.length,0,'Provider must wait for recovery');
          await e.page.locator('[data-recovery-cancel]').evaluate(el=>el.click());
          await e.page.evaluate(()=>{window.__releaseRecoveryRead=true;});
          await e.page.waitForFunction(()=>document.querySelector('.sc-local-recovery')?.dataset.phase==='paused');
        } else await e.page.waitForFunction(()=>document.querySelector('.sc-local-recovery')?.dataset.phase==='restore-error');
      }
      await e.page.waitForTimeout(500);assert.equal(e.sdk.length,0);assert.equal(await e.page.evaluate(()=>window.__PIXIEED_OFFERWALL_ENTRY__.isEligible()),false);
      assert.equal(await e.page.locator('[data-convert]').count(),1,'Converter remains available');
      const retained=await e.page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('pixieed-conversion-recovery-v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('workspaces').objectStore('workspaces').get('synthetic-recovery');q.onsuccess=()=>{resolve(q.result.snapshot);db.close();};};}));
      assert.deepEqual(retained,{synthetic:'retained'});
    } finally {await e.context.close();}
  });
  for(const invalid of ['missing','expired','malformed']) await test(`invalid-${invalid}`,async()=>{
    const e=await environment();try {
      await seed(e.page,'draw');
      await e.page.evaluate(invalid=>{if(invalid==='expired')sessionStorage.setItem('pixieed-output-entry-v1',JSON.stringify({version:1,path:'/output/work/',key:'id',id:crypto.randomUUID(),advanced:false,createdAt:Date.now()-8*24*60*60*1000}));if(invalid==='malformed')sessionStorage.setItem('pixieed-output-entry-v1','{broken');},invalid);
      await e.page.goto(origin+'/output/work/?entry=1');await e.page.waitForTimeout(700);assert.equal(e.sdk.length,0);assert.equal(await e.page.evaluate(()=>localStorage.getItem('synthetic-editor-sentinel')),'preserve-me');assert.equal(await e.page.evaluate(()=>window.__PIXIEED_OFFERWALL_ENTRY__.isEligible()),false);
      const draft=await e.page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('synthetic-editor-draft',1);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,q=db.transaction('drafts').objectStore('drafts').get('draft');q.onsuccess=()=>{resolve(q.result);db.close();};};}));assert.deepEqual(draft,{layers:[1,2,3]});
    }finally{await e.context.close();}
  });
} finally {await browser.close();}
report.passed=report.failures.length===0;
if(reportPath) await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed) process.exitCode=1;
