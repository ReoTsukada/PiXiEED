/** Real HTTP-cache upgrade coverage for the Draw camera handoff and its restored animation history. */
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const output=process.env.PIXIEED_DRAW_CAMERA_CACHE_OUTPUT||'/tmp/pixieed-draw-camera-cache-20261007';
const baseline=process.env.PIXIEED_DRAW_CAMERA_CACHE_BASELINE||'a1fa219210e33a39a182e915bb46edc0ec2320f5';
await mkdir(output,{recursive:true});const oldRoot=`${output}/old-source`,marker=`${output}/root-marker.txt`,logFile=`${output}/server-requests.jsonl`;
await rm(oldRoot,{recursive:true,force:true});await mkdir(oldRoot,{recursive:true});
execFileSync('git',['archive','--format=tar','--output='+output+'/old-source.tar',baseline],{stdio:['ignore','ignore','pipe']});
execFileSync('tar',['-xf',output+'/old-source.tar','-C',oldRoot],{stdio:['ignore','ignore','pipe']});
await writeFile(marker,'old');await writeFile(logFile,'');
const python=`import http.server,sys,json,pathlib,time,urllib.parse
old,new,marker,log=sys.argv[1:]
lock=__import__('threading').Lock()
class Handler(http.server.SimpleHTTPRequestHandler):
 def do_GET(self):
  phase=pathlib.Path(marker).read_text().strip()
  self.directory=old if phase=='old' else new
  with lock:
   with open(log,'a') as stream: stream.write(json.dumps({'phase':phase,'url':self.path,'time':time.time()})+'\\n')
  super().do_GET()
 def end_headers(self):
  path=urllib.parse.urlparse(self.path).path
  self.send_header('Cache-Control','no-store' if path.endswith('/') or path.endswith('.html') else 'public, max-age=600')
  self.send_header('Content-Security-Policy',\"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:\")
  super().end_headers()
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
print('SERVER_PORT='+str(server.server_port),flush=True)
server.serve_forever()`;
const server=spawn('python3',['-u','-c',python,oldRoot,process.cwd(),marker,logFile],{stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{let buffer='';server.stdout.on('data',chunk=>{buffer+=chunk;const match=/SERVER_PORT=(\d+)/.exec(buffer);if(match)resolve(Number(match[1]));});server.once('error',reject);server.once('exit',code=>reject(Error(`cache test server exited ${code}`)));});
const base=`http://127.0.0.1:${port}`,playwrightPath=process.env.PIXIEED_PLAYWRIGHT_MODULE||'/tmp/pixieed-camera-playwright/node_modules/playwright/index.mjs';
const {chromium}=await import(pathToFileURL(playwrightPath).href);const browser=await chromium.launch(),checks=[],errors=[],cached=[],responses=[];
const context=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1,serviceWorkers:'block'});const page=await context.newPage();page.setDefaultTimeout(12000);
// No Playwright routes: routing disables the browser's ordinary HTTP cache.
const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});
cdp.on('Network.requestServedFromCache',event=>cached.push(event.requestId));cdp.on('Network.responseReceived',event=>responses.push({url:event.response.url,fromDiskCache:event.response.fromDiskCache,fromPrefetchCache:event.response.fromPrefetchCache}));
page.on('pageerror',event=>errors.push(event.message));
await context.addInitScript(()=>{
 const key='pixieed:qa:draw-camera-cache:v1';let log;try{log=JSON.parse(sessionStorage.getItem(key)||'null');}catch{}log??={requests:0,stops:0,constraints:[]};
 const qa=window.__drawCameraCacheQA={log,tracks:[]};const save=()=>sessionStorage.setItem(key,JSON.stringify(log));
 const getUserMedia=constraints=>{log.requests++;log.constraints.push(constraints);save();if(constraints?.audio!==false)return Promise.reject(new Error('cache QA only permits audio:false'));
  const source=document.createElement('canvas');source.width=320;source.height=240;const ctx=source.getContext('2d');let phase=0;const paint=()=>{phase^=1;ctx.fillStyle=phase?'#ed2518':'#ef2a18';ctx.fillRect(0,0,160,240);ctx.fillStyle=phase?'#204de8':'#1748e8';ctx.fillRect(160,0,160,240);};paint();const timer=setInterval(paint,80);const stream=source.captureStream(15);
  for(const track of stream.getTracks()){qa.tracks.push(track);const stop=track.stop.bind(track);track.stop=()=>{if(!track.__cacheStopped){track.__cacheStopped=true;log.stops++;save();clearInterval(timer);}return stop();};}return Promise.resolve(stream);};
  Object.defineProperty(Navigator.prototype,'mediaDevices',{configurable:true,get:()=>({getUserMedia})});
});
const pixels=async selector=>page.locator(selector).evaluate(canvas=>({width:canvas.width,height:canvas.height,rgba:[...canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data]}));
const save=async()=>{await page.locator('#pxd-save').evaluate(n=>n.click());await page.waitForFunction(()=>!document.querySelector('#main')?.inert&&document.querySelector('#project-open')?.dataset.state==='saved');};
const records=async()=>{const body=(await readFile(logFile,'utf8')).trim();return body?body.split('\n').map(JSON.parse):[];};
try{
 await page.goto(`${base}/draw/?cache-upgrade=old`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!document.querySelector('#draw-canvas')&&!document.querySelector('#main')?.inert);
 assert.equal(await page.locator('#draw-camera').count(),0,'baseline page has no handoff launcher');
 const canvas=page.locator('#draw-canvas'),rect=await canvas.boundingBox(),size=await canvas.evaluate(n=>n.width);
 const point=(x,y)=>({x:rect.x+x*rect.width/size,y:rect.y+y*rect.height/size});
 for(const [x,y] of [[3.5,4.5],[4.5,5.5],[5.5,6.5]]){const q=point(x,y);await page.mouse.click(q.x,q.y);}
 await save();const oldPixels=await pixels('#draw-canvas');await page.waitForTimeout(250);
 const oldRecords=await records();assert.ok(oldRecords.some(item=>item.phase==='old'&&item.url.includes('/js/creation/draw-page.mjs')),'old Draw modules warmed the real HTTP cache');
 await writeFile(marker,'new');const next=new URL(page.url());next.searchParams.set('cache-upgrade','new');await page.goto(next.href,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.documentElement.dataset.drawReady==='true'&&!!document.querySelector('#draw-camera')&&!document.querySelector('#main')?.inert);
 assert.equal(await page.locator('#draw-camera').count(),1);assert.deepEqual((await pixels('#draw-canvas')).rgba,oldPixels.rgba,'fresh HTML restores pixels saved by the cached baseline app');
 const newRecords=await records(),fresh=newRecords.filter(item=>item.phase==='new');
 for(const [name,revision] of [['draw-entry','20261007-camera-page-only-1'],['draw-page','20261007-camera-page-only-1'],['draw-animation-session','20261007-draw-handoff-1'],['draw-timelapse','20261007-draw-handoff-1']])assert.ok(fresh.some(item=>item.url===`/js/creation/${name}.mjs?rev=${revision}`),`${name} fetched at the new revision`);
 assert.ok(fresh.some(item=>item.url==='/js/creation/draw-animation-history.mjs'),'new Draw-only animation history module fetched');
 const stable='/js/creation/animation-core.mjs';assert.ok(oldRecords.some(item=>new URL(item.url,base).pathname===stable),'baseline loaded unchanged animation core');assert.ok(!fresh.some(item=>new URL(item.url,base).pathname===stable),'unchanged animation core was not requested again from server');
 const cacheTiming=await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/js/creation/animation-core.mjs')).map(entry=>({url:entry.name,transferSize:entry.transferSize,decodedBodySize:entry.decodedBodySize})));assert.ok(cacheTiming.some(entry=>entry.transferSize===0&&entry.decodedBodySize>0),'unchanged animation core was reused from the browser HTTP cache');
 checks.push('same-origin no-store HTML upgrade fetches revisioned handoff/session/timelapse/history modules and reuses unchanged animation-core from max-age cache');
 // A deliberately unsaved new stroke must survive the page navigation and become the camera undo baseline.
 const initial=await pixels('#draw-canvas');const palette=page.locator('#draw-palette [data-color-index="1"]');if(await palette.count())await palette.click();const box=await canvas.boundingBox(),p1={x:box.x+box.width*.44,y:box.y+box.height*.42},p2={x:box.x+box.width*.56,y:box.y+box.height*.58};
 await page.mouse.move(p1.x,p1.y);await page.mouse.down();await page.mouse.move(p2.x,p2.y,{steps:5});await page.mouse.up();await page.waitForTimeout(60);const unsaved=await pixels('#draw-canvas');assert.notDeepEqual(unsaved.rgba,initial.rgba,'new current-code stroke remains unsaved before camera handoff');
 const baselinePixels=unsaved.rgba;await page.locator('#draw-camera').click();await page.waitForURL(/\/pixel-camera\.html\?to=draw&drawRequest=/);await page.waitForFunction(()=>document.querySelector('#pixelStudio')?.dataset.drawCameraHandoff==='true'&&document.querySelector('#capture')?.disabled===false);
 const request=await page.evaluate(async()=>{const {readDrawCameraRequest}=await import('/js/creation/draw-camera-handoff.mjs?rev=20261007-draw-handoff-1');const record=readDrawCameraRequest({search:location.search});return record&&{frames:record.animation.frames.length,layers:record.animation.layers.length,palette:record.animation.palette,history:record.history};});assert.ok(request&&request.history,'new request includes serializable animation history');assert.ok((await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pixieed:qa:draw-camera-cache:v1')))).constraints.every(value=>value.audio===false));
 await page.waitForTimeout(180);const live=await pixels('#view');await page.locator('#capture').click();await page.waitForURL(url=>url.pathname==='/draw/');await page.waitForFunction(()=>document.documentElement.dataset.drawReady==='true'&&!document.querySelector('#main')?.inert);
 const captured=await pixels('#draw-canvas');assert.deepEqual(captured.rgba,live.rgba,'capture returns the camera composite to Draw');await page.locator('#draw-undo').click();await page.waitForTimeout(80);assert.deepEqual((await pixels('#draw-canvas')).rgba,baselinePixels,'single Undo returns to the unsaved current-code stroke');
 await page.locator('#draw-redo').click();await page.waitForTimeout(80);assert.deepEqual((await pixels('#draw-canvas')).rgba,captured.rgba,'single Redo restores the camera result');
 const state=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('pixieed:qa:draw-camera-cache:v1')));assert.equal(state.requests,1);assert.ok(state.stops>=1,'camera track stopped on return');assert.deepEqual(errors,[],'no runtime errors after warm-cache upgrade');checks.push('unsaved post-upgrade stroke is carried through real camera navigation; one Undo and Redo restore exact pixels');
 await save();await page.screenshot({path:`${output}/cache-upgrade-camera-return.png`});
 const timing=cacheTiming;const report={baseline,origin:base,cacheControl:'HTML no-store, assets public max-age=600',playwrightRouting:false,checks,errors,cachedRequestEvents:cached.length,timing,oldRecords,newRecords,requestSummary:request,sourceURL:'fresh same-origin Draw URL',browser:'chromium'};
 await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({checks:checks.length,errors:errors.length,cacheEvents:cached.length,report:`${output}/report.json`},null,2));
}catch(error){await page.screenshot({path:`${output}/failure.png`,fullPage:true}).catch(()=>{});const report={baseline,origin:base,checks,errors,cachedRequestEvents:cached.length,oldRecords:await records().catch(()=>[]),error:error.stack};await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));throw error;
}finally{await context.close();await browser.close();server.kill('SIGTERM');}
