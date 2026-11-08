#!/usr/bin/env node
/** Prove an existing max-age module cache upgrades the standalone Draw editor. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createDrawDocument } from '../js/creation/draw-core.mjs';
import { drawShapePixels } from '../js/creation/draw-tool-operations.mjs';
const root=resolve('.'), output=resolve(process.env.PIXIEED_ELLIPSE_CACHE_OUTPUT || '/tmp/pixieed-ellipse-cache');
const baseline='64b773ab09859a6c48bec051cb605459a1cd918d', revision='20261109-ellipse-geometry-1';
const names=['draw/editor.html','js/creation/draw-entry.mjs','js/creation/draw-page.mjs','js/creation/creation-runtime.mjs','js/creation/draw-tool-operations.mjs'];
const old=new Map(names.map(name=>[name,execFileSync('git',['show',`${baseline}:${name}`])]));
let phase='old';const requests=[];
const server=createServer(async(request,response)=>{
 try{
  const url=new URL(request.url,'http://localhost'),name=decodeURIComponent(url.pathname.slice(1));let path=resolve(root,name);
  if(!path.startsWith(root+'/'))throw new Error('outside root');if(url.pathname.endsWith('/'))path=join(path,'index.html');
  requests.push({phase,url:request.url});
  const body=phase==='old'&&old.has(name)?old.get(name):await readFile(path);
  response.writeHead(200,{'Content-Type':{'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[extname(path)]||'application/octet-stream','Cache-Control':url.pathname.endsWith('.html')||url.pathname.endsWith('/')?'no-store':'public, max-age=600','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; frame-src 'self';"});response.end(body);
 }catch{response.writeHead(404);response.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const base=`http://127.0.0.1:${server.address().port}`;
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||join(homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const browser=await chromium.launch({headless:true,executablePath:process.env.PIXIEED_CHROME_EXECUTABLE||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const report={baseline,revision,requests,checks:[],pageErrors:[]};await mkdir(output,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 // Do not use Playwright routing here: it disables HTTP caching. CSP keeps all requests local.
 await context.addInitScript(()=>localStorage.setItem('pixieed:draw:input-settings:v1',JSON.stringify({version:1,bindings:{left:{tool:'ellipse',brushSize:1,color:2}}})));
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.pageErrors.push(e.message));
 const cdp=await context.newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:false});
 const ready=()=>page.waitForFunction(()=>document.documentElement.dataset.drawReady==='true'&&!document.querySelector('#main').inert&&document.querySelector('#draw-canvas')?.dataset.tool==='ellipse');
 const frame=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const image=()=>page.locator('#draw-canvas').evaluate(c=>Array.from(c.getContext('2d').getImageData(0,0,c.width,c.height).data).filter((_,i)=>i%4===3).map(v=>v>0));
 const draw=async()=>{const box=await page.locator('#draw-canvas').boundingBox();await page.mouse.move(box.x+2.5*box.width/16,box.y+2.5*box.height/16);await page.mouse.down();await page.mouse.move(box.x+13.5*box.width/16,box.y+13.5*box.height/16);await page.mouse.up();await frame();return image();};
 await page.goto(`${base}/draw/editor.html?ellipse-cache=old`);await ready();const before=await draw();
 assert.equal(before.slice(2*16,3*16).filter(Boolean).length,2,'baseline reproduces two-pixel pole');
 await page.locator('#draw-undo').click();await frame();report.checks.push('Old main renders the reported narrow pole and populates max-age=600 module cache');
 phase='new';await page.goto(`${base}/draw/editor.html?ellipse-cache=new`);await ready();const after=await draw();
 const expected=createDrawDocument(16);drawShapePixels(expected,{x:2,y:2},{x:13,y:13},2,{shape:'ellipse'});assert.deepEqual(after,expected.pixels.map(v=>v>=0));assert.ok(after.slice(2*16,3*16).filter(Boolean).length>2);
 for(const name of names.filter(name=>name.endsWith('.mjs')))assert.ok(requests.some(r=>r.phase==='new'&&new URL(r.url,base).pathname===`/${name}`&&new URL(r.url,base).searchParams.get('rev')===revision),`${name} fetched the new revision`);
 const scope='/js/creation/mode-scope.mjs?rev=20261001-independent-editors-1';assert.ok(requests.some(r=>r.phase==='old'&&r.url===scope));assert.ok(!requests.some(r=>r.phase==='new'&&r.url===scope),'unchanged module reused warm HTTP cache');
 report.timing=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>r.name.includes('mode-scope.mjs')).map(r=>({url:r.name,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize})));assert.ok(report.timing.some(r=>r.transferSize===0&&r.decodedBodySize>0));
 assert.deepEqual(report.pageErrors,[]);report.checks.push('Fresh same-origin HTML fetches the new geometry dependency chain while unchanged mode-scope stays cached');report.checks.push('Standalone editor circle matches fixed pixel geometry after real HTTP-cache upgrade');
 await page.screenshot({path:join(output,'warm-cache-upgraded.png')});await context.close();console.log('PASS',report.checks.length,'real HTTP-cache upgrade checks');
}catch(error){report.error=error.stack;throw error;}finally{await browser.close();await new Promise(done=>server.close(done));await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));}
