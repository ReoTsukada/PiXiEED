#!/usr/bin/env node
/**
 * Local-only, repeatable browser performance sampler for a static PiXiEED snapshot.
 * All non-local and non-GET/HEAD requests are aborted. Reported bytes are CDP encoded
 * response lengths; readiness and interaction timings are explicit proxies, not INP.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { chromium } from '/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PHASE = process.env.PHASE || '';
const ARTIFACT_ROOT = process.env.PIXIEED_PERF_ROOT ? path.resolve(process.env.PIXIEED_PERF_ROOT) : '';
const RUNS = parseInteger(process.env.PIXIEED_PERF_RUNS, 3, 1, 20);
const STANDARD_ROUTES = [
  '/', '/tools/', '/draw/', '/camera/', '/audio/', '/output/', '/output/work/', '/jigsaw/',
  '/spot-difference/', '/hidden-object/', '/play/spot-difference/', '/play/hidden-object/',
  '/game/', '/globe/', '/events/', '/events/pixelween-2026/', '/stores/', '/books/', '/guide/', '/help/'
];
const STANDARD_VIEWPORTS = [
  { name: 'mobile-320x568', width: 320, height: 568 },
  { name: 'mobile-390x844', width: 390, height: 844 },
  { name: 'desktop-1280x800', width: 1280, height: 800 }
];
const ROUTES = parseList(process.env.PIXIEED_PERF_ROUTES, STANDARD_ROUTES).map(normalizeRoute);
const VIEWPORTS = parseViewports(process.env.PIXIEED_PERF_VIEWPORTS, STANDARD_VIEWPORTS);
const READY_TIMEOUT_MS = parseInteger(process.env.PIXIEED_PERF_READY_TIMEOUT_MS, 30_000, 1_000, 120_000);
const MIN_OBSERVATION_MS = 3_000;
const ORIGIN_ONLY_HOST = '127.0.0.1';
const MIME = new Map(Object.entries({
  '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp', '.avif':'image/avif', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf', '.otf':'font/otf', '.wasm':'application/wasm',
  '.mp3':'audio/mpeg', '.wav':'audio/wav', '.ogg':'audio/ogg', '.mp4':'video/mp4', '.webm':'video/webm',
  '.xml':'application/xml; charset=utf-8', '.txt':'text/plain; charset=utf-8', '.bin':'application/octet-stream',
  '.pdf':'application/pdf', '.map':'application/json; charset=utf-8'
}));

function parseInteger(value, fallback, min, max) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Expected integer ${min}..${max}, got ${value}`);
  return n;
}
function parseList(value, fallback) { return value ? value.split(',').map(x => x.trim()).filter(Boolean) : [...fallback]; }
function normalizeRoute(value) {
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('..') || /[?#]/.test(value)) throw new Error(`Invalid route path: ${value}`);
  return value.endsWith('/') || path.posix.extname(value) ? value : `${value}/`;
}
function parseViewports(value, fallback) {
  if (!value) return fallback;
  return value.split(',').map(raw => {
    const m = raw.trim().match(/^(?:(?<name>[a-zA-Z0-9_-]+):)?(?<width>\d+)x(?<height>\d+)$/);
    if (!m) throw new Error(`Invalid viewport ${raw}; use [name:]WIDTHxHEIGHT`);
    const width = Number(m.groups.width), height = Number(m.groups.height);
    if (width < 240 || width > 4000 || height < 240 || height > 4000) throw new Error(`Viewport out of range: ${raw}`);
    return { name: m.groups.name || `${width}x${height}`, width, height };
  });
}
function validateInputs() {
  if (!['before','after'].includes(PHASE)) throw new Error('Set PHASE=before or PHASE=after.');
  if (!ARTIFACT_ROOT || !fs.statSync(ARTIFACT_ROOT, { throwIfNoEntry: false })?.isDirectory()) throw new Error('Set PIXIEED_PERF_ROOT to an existing static site directory.');
  for (const route of ROUTES) if (route.includes('\\')) throw new Error(`Backslash is not allowed in route: ${route}`);
}
function safeFilePath(urlPath) {
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const segments = decoded.split('/');
  if (segments.some(s => s === '..' || s === '.')) return null;
  const root = path.resolve(ARTIFACT_ROOT);
  let target = path.resolve(root, `.${decoded}`);
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try { if (fs.statSync(target).isDirectory()) target = path.join(target, 'index.html'); } catch {}
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  try { return fs.statSync(target).isFile() ? target : null; } catch { return null; }
}
function createServer() {
  const server = http.createServer((req, res) => {
    const method = req.method || '';
    if (method !== 'GET' && method !== 'HEAD') { res.writeHead(405, { Allow:'GET, HEAD', 'Cache-Control':'no-store' }); res.end(); return; }
    let url;
    try { url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`); }
    catch { res.writeHead(400); res.end(); return; }
    const file = safeFilePath(url.pathname);
    if (!file) { res.writeHead(404, { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end('Not Found'); return; }
    let info;
    try { info = fs.statSync(file); } catch { res.writeHead(404); res.end(); return; }
    const headers = {
      'Content-Type': MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin'
    };
    const range = req.headers.range;
    const rangeMatch = typeof range === 'string' && range.match(/^bytes=(\d*)-(\d*)$/);
    if (rangeMatch && info.size > 0) {
      let start = rangeMatch[1] ? Number(rangeMatch[1]) : Math.max(0, info.size - Number(rangeMatch[2] || 0));
      let end = rangeMatch[2] ? Number(rangeMatch[2]) : info.size - 1;
      if (!rangeMatch[1] && rangeMatch[2]) end = info.size - 1;
      if (start <= end && start < info.size) {
        end = Math.min(end, info.size - 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
        headers['Content-Length'] = end - start + 1;
        headers['Accept-Ranges'] = 'bytes';
        res.writeHead(206, headers);
        if (method === 'HEAD') res.end(); else fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
      res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return;
    }
    res.writeHead(200, headers);
    if (method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
  return server;
}
function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function stablePath(urlString) { try { const u = new URL(urlString); return { path:u.pathname, query:u.search }; } catch { return { path:urlString, query:'' }; } }

const OBSERVER_INIT = () => {
  const state = { longTasks:[], layoutShifts:[], lcp:[] };
  Object.defineProperty(window, '__PIXIEED_PERF_SAMPLE__', { value:state, configurable:false });
  const observe = (type, fn) => { try { const o = new PerformanceObserver(list => { for (const entry of list.getEntries()) fn(entry); }); o.observe({ type, buffered:true }); } catch {} };
  observe('longtask', e => state.longTasks.push({ startTime:e.startTime, duration:e.duration, attribution:(e.attribution||[]).map(a=>({name:a.name,containerType:a.containerType,containerName:a.containerName,containerId:a.containerId})) }));
  observe('layout-shift', e => state.layoutShifts.push({ startTime:e.startTime, value:e.value, hadRecentInput:e.hadRecentInput }));
  observe('largest-contentful-paint', e => state.lcp.push({ startTime:e.startTime, renderTime:e.renderTime, loadTime:e.loadTime, size:e.size, elementTag:e.element?.tagName||null, elementId:e.element?.id||null, elementClass:typeof e.element?.className==='string'?e.element.className:null, url:e.url||null }));
  try {
    const media = navigator.mediaDevices;
    if (media && typeof media.getUserMedia === 'function') {
      const original = media.getUserMedia.bind(media);
      Object.defineProperty(media, 'getUserMedia', { configurable:true, value:constraints => { state.getUserMediaAttempts=(state.getUserMediaAttempts||0)+1; return Promise.reject(new DOMException('Camera access is blocked by the performance harness.', 'NotAllowedError')); } });
      state.getUserMediaOriginalAvailable=Boolean(original);
    }
  } catch { state.getUserMediaPatchFailed=true; }
};

async function frameReadiness(page, route) {
  const frames = [];
  for (const frame of page.frames()) {
    try {
      const value = await frame.evaluate(() => {
        const html=document.documentElement, body=document.body;
        let mapEvents=false, mapLocationReady=false, globe=false;
        try { mapEvents=Boolean(globalThis.__PIXIEED_MAP_EVENTS__); } catch {}
        try { globe=Boolean(globalThis.__PIXIEED_GLOBE__); mapLocationReady=Boolean(globalThis.__PIXIEED_GLOBE__?.isMapLocationReady?.()); } catch {}
        return {
          href:location.href, readyState:document.readyState, title:document.title,
          frameInert:window.frameElement ? Boolean(window.frameElement.inert) : null,
          creationModesReady:html?.dataset.creationModesReady==='true', creationMode:body?.dataset.creationMode||null,
          audioReady:html?.dataset.audioReady==='true', cameraReady:html?.dataset.cameraReady==='true',
          mapEvents, mapLocationReady, globe,
          header:Boolean(document.querySelector('header,.site-header')),
          menuToggle:Boolean(document.querySelector('[data-menu-toggle]')),
          menu:Boolean(document.querySelector('[data-site-menu]')),
          main:Boolean(document.querySelector('main,#main')),
          selectors:{canvas:document.querySelectorAll('canvas').length,iframe:document.querySelectorAll('iframe').length,game:document.querySelectorAll('[data-game],.game-shell,.game-board,[data-jigsaw]').length, toolEmbed:document.querySelectorAll('[data-tool-embed]').length,toolFrame:document.querySelectorAll('.tool-embed__frame').length,routeContent:document.querySelectorAll('.tool-grid,[data-event-radar-list],.jigsaw-app,.spot-difference-app,.hidden-object-app').length,toolCards:document.querySelectorAll('.tool-grid .hp-toy').length,jigsawControl:document.querySelectorAll('#jigsaw-preview-toggle').length,eventDirectory:document.querySelectorAll('[data-event-radar-list]').length,outputControl:document.querySelectorAll('#output-extension').length}
        };
      });
      frames.push(value);
    } catch (error) { frames.push({ href:frame.url(), error:String(error) }); }
  }
  const main = frames[0] || {};
  const expected = route === '/camera/' ? 'camera' : route === '/audio/' ? 'audio' : route === '/draw/' ? 'draw' : null;
  const toolFrame = frames.slice(1).find(f => f.frameInert===false && (f.creationModesReady && (!expected || f.creationMode===expected) || (expected==='audio' && f.audioReady)));
  if (expected && (toolFrame || main.creationModesReady && main.creationMode===expected || expected==='audio' && main.audioReady)) {
    return { ready:true, kind:'tool-runtime', expectedMode:expected, frame:toolFrame || main, frames };
  }
  if (route === '/globe/' && frames.some(f=>f.mapEvents && f.globe && f.mapLocationReady)) return { ready:true, kind:'globe-map', frames };
  if (route === '/globe/') return { ready:false, kind:'globe-map', frames, caveat:'Waiting for the inner map event controller and isMapLocationReady signal.' };
  const genericReady = main.readyState === 'complete' && (main.header || main.main) && (!main.menuToggle || main.menu);
  if (genericReady) {
    const knownSelector = route==='/tools/' ? main.selectors?.toolCards>0 : route==='/jigsaw/' ? main.selectors?.jigsawControl>0 : route==='/events/' ? main.selectors?.eventDirectory>0 : route==='/output/' ? main.selectors?.outputControl>0 : false;
    return { ready:true, kind:knownSelector?'route-specific-dom-plus-navigation':'generic-dom-and-navigation', frames, caveat:knownSelector?'A route-specific visible/declared control or generated node exists; no full application completion is inferred.':route.startsWith('/play/') || route==='/game/' ? 'Generic DOM/navigation readiness only; game readiness is handled by a separate regression check and is not inferred here.' : 'Generic DOM/navigation readiness; no application-specific completion signal is asserted.' };
  }
  return { ready:false, frames };
}
async function waitForReady(page, route, navigationStartedAt) {
  let last;
  while (Date.now()-navigationStartedAt < READY_TIMEOUT_MS) {
    last = await frameReadiness(page, route);
    if (last.ready) return { ...last, elapsedMs:Date.now()-navigationStartedAt, timedOut:false };
    await wait(100);
  }
  last = last || await frameReadiness(page, route);
  return { ...last, ready:false, elapsedMs:Date.now()-navigationStartedAt, timedOut:true };
}
async function readVitals(page) {
  return page.evaluate(() => {
    const nav=performance.getEntriesByType('navigation')[0];
    const paints=performance.getEntriesByType('paint');
    const sample=window.__PIXIEED_PERF_SAMPLE__||{};
    const shifts=sample.layoutShifts||[];
    const lcp=sample.lcp||[];
    const mainLcp=lcp.at(-1)||null;
    const longTasks=sample.longTasks||[];
    return {
      navigation:{type:nav?.type||null,startTime:nav?.startTime??null,domContentLoadedEventEnd:nav?.domContentLoadedEventEnd??null,loadEventEnd:nav?.loadEventEnd??null,responseStart:nav?.responseStart??null,domInteractive:nav?.domInteractive??null},
      paint:{firstPaint:paints.find(e=>e.name==='first-paint')?.startTime??null,firstContentfulPaint:paints.find(e=>e.name==='first-contentful-paint')?.startTime??null},
      lcp:{finalValueMs:mainLcp?.startTime??null,renderTime:mainLcp?.renderTime??null,loadTime:mainLcp?.loadTime??null,size:mainLcp?.size??null,elementTag:mainLcp?.elementTag??null,elementId:mainLcp?.elementId??null,elementClass:mainLcp?.elementClass??null,url:mainLcp?.url??null,entryCount:lcp.length,frameScope:'main-frame only'},
      cls:{value:shifts.filter(e=>!e.hadRecentInput).reduce((sum,e)=>sum+e.value,0),entryCount:shifts.length,includedEntryCount:shifts.filter(e=>!e.hadRecentInput).length,rule:'sum layout-shift entries excluding hadRecentInput=true'},
      longTasks:{count:longTasks.length,sumMs:longTasks.reduce((s,e)=>s+e.duration,0),maxMs:longTasks.length?Math.max(...longTasks.map(e=>e.duration)):0,entries:longTasks,frameScope:'per-frame below'},
      getUserMediaAttempts:sample.getUserMediaAttempts||0,mediaPatchFailed:Boolean(sample.getUserMediaPatchFailed)
    };
  });
}
async function readFrameLongTasks(page) {
  const result=[];
  for (const frame of page.frames()) {
    try {
      const x=await frame.evaluate(()=>({href:location.href,tasks:window.__PIXIEED_PERF_SAMPLE__?.longTasks||[],lcp:window.__PIXIEED_PERF_SAMPLE__?.lcp||[]}));
      const ts=x.tasks||[];
      result.push({frameUrl:x.href,count:ts.length,sumMs:ts.reduce((s,e)=>s+e.duration,0),maxMs:ts.length?Math.max(...ts.map(e=>e.duration)):0,entries:ts,iframeLcpEntries:x.lcp});
    } catch(error) { result.push({frameUrl:frame.url(),error:String(error)}); }
  }
  return result;
}
async function performFirstAction(page, route) {
  const started=Date.now();
  const row={scope:'post-observation first user action; duration is harness wall-clock, not INP',kind:null,attempted:false,success:false,durationMs:null};
  try {
    if (['/draw/','/camera/','/audio/'].includes(route)) {
      row.kind='tool-embed-expand';
      const section=page.locator('[data-tool-embed]').first();
      if (await section.count()) {
        let frame=section.locator('iframe.tool-embed__frame').first();
        if (!await frame.count()) {
          const start=page.locator('[data-embed-start]').first();
          if (await start.count()) { row.attempted=true; await start.click({timeout:5000}); }
          await frame.waitFor({state:'attached',timeout:15_000});
        }
        const expand=section.locator('[data-embed-expand]').first();
        await expand.waitFor({state:'visible',timeout:10_000}); row.attempted=true;
        await expand.click({timeout:5000});
        row.ariaExpanded=await expand.getAttribute('aria-expanded');
        row.sectionExpanded=await section.evaluate(el=>el.classList.contains('tool-embed--expanded'));
        row.frameConnected=await frame.evaluate(el=>el.isConnected);
        row.frameInert=await frame.evaluate(el=>el.inert);
        row.success=row.ariaExpanded==='true'&&row.sectionExpanded&&row.frameConnected&&row.frameInert===false;
      } else row.note='No data-tool-embed host was found.';
    } else {
      row.kind='generic-site-menu-open';
      const toggle=page.locator('[data-menu-toggle]').first();
      if (await toggle.count() && await toggle.isVisible()) {
        row.attempted=true; await toggle.click({timeout:5000});
        const menu=page.locator('[data-site-menu]').first();
        await menu.waitFor({state:'visible',timeout:750});
        row.ariaExpanded=await toggle.getAttribute('aria-expanded');
        row.menuVisible=await menu.isVisible(); row.success=row.menuVisible&&row.ariaExpanded==='true';
        await page.keyboard.press('Escape').catch(()=>{});
      } else row.note='No visible site menu toggle was found.';
    }
  } catch(error) { row.error=String(error); }
  row.durationMs=Date.now()-started;
  return row;
}

async function runCase({ browser, baseUrl, route, viewport, run, outputFd }) {
  const caseStarted=Date.now();
  const context=await browser.newContext({ viewport:{width:viewport.width,height:viewport.height}, deviceScaleFactor:1, isMobile:viewport.width<600, hasTouch:viewport.width<600, serviceWorkers:'block', acceptDownloads:false });
  const page=await context.newPage();
  const cdp=await context.newCDPSession(page);
  const requestMap=new Map(), requestRows=[];
  const sameOrigin=`${baseUrl}`;
  const blockExternal=async route=>{
    const request=route.request();
    let url; try { url=new URL(request.url()); } catch { await route.abort('blockedbyclient'); return; }
    if (url.origin===sameOrigin && ['GET','HEAD'].includes(request.method())) await route.continue();
    else await route.abort('blockedbyclient');
  };
  await context.route('**/*',blockExternal);
  await context.addInitScript(OBSERVER_INIT);
  cdp.on('Network.requestWillBeSent',event=>{
    const row={requestId:event.requestId,url:event.request.url,method:event.request.method,type:event.type||null,frameId:event.frameId||null,initiatorType:event.initiator?.type||null,startTimestamp:event.timestamp,blocked:(new URL(event.request.url).origin!==sameOrigin || !['GET','HEAD'].includes(event.request.method)),status:null,mimeType:null,encodedDataLength:0,durationMs:null};
    if (event.redirectResponse) {
      row.status=event.redirectResponse.status; row.mimeType=event.redirectResponse.mimeType; row.encodedDataLength=event.redirectResponse.encodedDataLength||0;
      requestRows.push(row);
    }
    requestMap.set(event.requestId,row);
  });
  cdp.on('Network.responseReceived',event=>{ const row=requestMap.get(event.requestId); if(row){row.status=event.response.status;row.mimeType=event.response.mimeType;row.fromDiskCache=Boolean(event.response.fromDiskCache);row.responseEncodedDataLength=event.response.encodedDataLength||0;} });
  cdp.on('Network.loadingFinished',event=>{ const row=requestMap.get(event.requestId);if(row){row.encodedDataLength=event.encodedDataLength||row.responseEncodedDataLength||0;row.durationMs=event.timestamp!=null&&row.startTimestamp!=null?Math.max(0,(event.timestamp-row.startTimestamp)*1000):null;requestRows.push(row);requestMap.delete(event.requestId);} });
  cdp.on('Network.loadingFailed',event=>{ const row=requestMap.get(event.requestId);if(row){row.blocked=row.blocked||event.canceled;row.failure=event.errorText;requestRows.push(row);requestMap.delete(event.requestId);} });
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
  await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:20,downloadThroughput:20*1024*1024/8,uploadThroughput:10*1024*1024/8});
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:2});
  const result={phase:PHASE,route,viewport,run,measuredScope:{kind:'cold-navigation-static-local-only',browser:'Chromium through Playwright',cache:'CDP cache disabled; fresh context; no profile/storage reuse',network:{downMbps:20,upMbps:10,latencyMs:20},cpuThrottle:2,allOtherOriginsBlocked:true,allowedMethods:['GET','HEAD'],serviceWorkers:'blocked',realCamera:'getUserMedia calls are denied and counted',inPageFirstAction:'separate post-observation action timing; not INP'},navigation:{},readiness:{},metrics:{},requests:[],duplicateSamePathDifferentQuery:[],firstAction:null,errors:[]};
  page.on('pageerror',error=>result.errors.push('pageerror: '+error.message));
  try {
    const navAt=Date.now();
    let navResponse;
    try { navResponse=await page.goto(`${baseUrl}${route}`,{waitUntil:'domcontentloaded',timeout:60_000}); }
    catch(error) { result.errors.push(`goto: ${String(error)}`); }
    result.navigation={url:page.url(),status:navResponse?.status()??null,domContentLoadedAtMs:Date.now()-navAt};
    const loadP=page.waitForLoadState('load',{timeout:60_000}).then(()=>Date.now()-navAt).catch(()=>null);
    const ready=await waitForReady(page,route,navAt);
    result.readiness=ready;
    const obsEnd=Math.max(MIN_OBSERVATION_MS,(ready.elapsedMs||0)+1000);
    result.measuredScope.observationWindowMs=obsEnd;
    const elapsed=Date.now()-navAt;
    if (elapsed<obsEnd) await wait(obsEnd-elapsed);
    result.metrics=await readVitals(page).catch(error=>({error:String(error)}));
    result.metrics.loadEventAtMs=await loadP;
    result.metrics.frameLongTasks=await readFrameLongTasks(page).catch(error=>[{error:String(error)}]);
    result.navigationRequestSummary={count:requestRows.length,successfulResponses:requestRows.filter(r=>r.status>=200&&r.status<400).length,encodedDataLengthBytes:requestRows.reduce((s,r)=>s+(r.encodedDataLength||0),0)};
    result.firstAction=await performFirstAction(page,route);
    result.firstAction.additionalRequests=requestRows.length-result.navigationRequestSummary.count;
    result.requests=requestRows.map(x=>({url:x.url,method:x.method,type:x.type,frameId:x.frameId,initiatorType:x.initiatorType,status:x.status,mimeType:x.mimeType,encodedDataLength:x.encodedDataLength||0,durationMs:x.durationMs,fromDiskCache:x.fromDiskCache||false,blocked:x.blocked||false,failure:x.failure||null}));
    const groups=new Map();
    for(const r of result.requests){try{const u=new URL(r.url);if(u.origin!==sameOrigin)continue;const key=u.pathname;const s=groups.get(key)||new Set();s.add(u.search);groups.set(key,s);}catch{}}
    result.duplicateSamePathDifferentQuery=[...groups.entries()].filter(([,queries])=>queries.size>1).map(([pathname,queries])=>({pathname,queries:[...queries]}));
    result.requestSummary={count:result.requests.length,successfulResponses:result.requests.filter(r=>r.status>=200&&r.status<400).length,blockedExternalOrNonGet:result.requests.filter(r=>r.blocked).length,encodedDataLengthBytes:result.requests.reduce((s,r)=>s+(r.encodedDataLength||0),0),resourceURLs:result.requests.map(r=>({url:r.url,encodedDataLength:r.encodedDataLength||0,durationMs:r.durationMs,status:r.status,blocked:r.blocked||false})),duplicateSamePathDifferentQuery:result.duplicateSamePathDifferentQuery};
  } catch(error) { result.errors.push(`case: ${String(error)}`); }
  finally {
    result.durationMs=Date.now()-caseStarted;
    fs.writeSync(outputFd,JSON.stringify(result)+'\n');
    console.log(`[${PHASE}] ${route} ${viewport.name} run ${run}/${RUNS} — ${result.readiness?.ready?'ready':'ready-timeout'}, ${result.requestSummary?.count??requestRows.length} requests, ${result.durationMs}ms`);
    await cdp.detach().catch(()=>{});
    await context.close().catch(()=>{});
  }
  return result;
}

async function main() {
  validateInputs();
  const server=createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,ORIGIN_ONLY_HOST,resolve);});
  const address=server.address();
  const baseUrl=`http://${ORIGIN_ONLY_HOST}:${address.port}`;
  const outputDir=path.join(REPO,'docs','performance-20261017');
  fs.mkdirSync(outputDir,{recursive:true});
  const jsonPath=path.join(outputDir,`${PHASE}-browser.json`);
  const jsonlPath=path.join(outputDir,`${PHASE}-browser.jsonl`);
  const outputFd=fs.openSync(jsonlPath,'w');
  let browser;
  const cases=[];
  try {
    browser=await chromium.launch({headless:true});
    console.log(`Serving ${ARTIFACT_ROOT} at ${baseUrl}; phase=${PHASE}; ${ROUTES.length} routes x ${VIEWPORTS.length} viewports x ${RUNS} runs.`);
    for(const route of ROUTES) for(const viewport of VIEWPORTS) for(let run=1;run<=RUNS;run++) {
      const item=await runCase({browser,baseUrl,route,viewport,run,outputFd});
      cases.push(item);
    }
    const summary={phase:PHASE,generatedAt:new Date().toISOString(),artifactRoot:ARTIFACT_ROOT,baseUrl:'local random-port HTTP only',caseCount:cases.length,routes:ROUTES,viewports:VIEWPORTS,runsPerRouteViewport:RUNS,network:{downMbps:20,upMbps:10,latencyMs:20,cpuThrottle:2,cacheDisabled:true},security:{externalRequests:'aborted',sameOriginMethods:['GET','HEAD'],serviceWorkers:'blocked',camera:'getUserMedia denied; attempts counted'},cases};
    fs.writeFileSync(jsonPath,JSON.stringify(summary,null,2)+'\n');
    fs.writeSync(outputFd,JSON.stringify({recordType:'summary',phase:PHASE,generatedAt:summary.generatedAt,caseCount:cases.length,jsonPath:path.relative(REPO,jsonPath),jsonlPath:path.relative(REPO,jsonlPath)})+'\n');
    console.log(`Wrote ${path.relative(REPO,jsonPath)} and ${path.relative(REPO,jsonlPath)}`);
  } finally {
    if(browser) await browser.close().catch(()=>{});
    fs.closeSync(outputFd);
    await new Promise(resolve=>server.close(()=>resolve()));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
