/** Local fixtures only. No public-site visits, advertisements, screenshots or uploads. */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, stat, mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),temp=await mkdtemp(path.join(tmpdir(),'pixieed-text-fit-'));
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{try{let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep))throw Error();if((await stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const chrome=spawn(process.env.PIXIEED_CHROME_EXECUTABLE,['--headless=new','--remote-debugging-port=0',`--user-data-dir=${temp}/profile`,'--no-first-run','--no-default-browser-check','--disable-background-networking','about:blank'],{stdio:['ignore','ignore','pipe']});
let socket,session,counter=0;const jobs=new Map(),errors=[],downloads=[],checks=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={},sid=session){const id=++counter;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{jobs.delete(id);reject(Error('CDP timeout '+method));},15000);jobs.set(id,{resolve,reject,timeout});socket.send(JSON.stringify({id,method,params,...(sid?{sessionId:sid}:{})}));});}
try {
 const endpoint=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Chrome unavailable')),15000);chrome.once('error',reject);chrome.stderr.on('data',data=>{text+=data;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
 socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 socket.addEventListener('message',event=>{const m=JSON.parse(String(event.data));if(m.id&&jobs.has(m.id)){const j=jobs.get(m.id);jobs.delete(m.id);clearTimeout(j.timeout);m.error?j.reject(Error(m.error.message)):j.resolve(m.result);return;}const p=m.params||{};
  if(m.method==='Fetch.requestPaused'){const ok=p.request.url.startsWith(base+'/')||/^(blob|data):/.test(p.request.url);void send(ok?'Fetch.continueRequest':'Fetch.failRequest',{requestId:p.requestId,...(ok?{}:{errorReason:'BlockedByClient'})},m.sessionId).catch(()=>{});}
  if(m.method==='Runtime.exceptionThrown')errors.push(p.exceptionDetails?.exception?.description||p.exceptionDetails?.text);
  if(m.method==='Browser.downloadProgress'&&p.state==='completed')downloads.push(p.guid);
 });
 const t=await send('Target.createTarget',{url:'about:blank'},null);({sessionId:session}=await send('Target.attachToTarget',{targetId:t.targetId,flatten:true},null));
 await mkdir(temp+'/downloads');await send('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:temp+'/downloads',eventsEnabled:true},null);
 for(const method of ['Page.enable','Runtime.enable','Network.enable'])await send(method);
 await send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
 const evaluate=async(fn,...args)=>{const r=await send('Runtime.evaluate',{expression:`(${fn.toString()})(...${JSON.stringify(args)})`,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async(fn,label)=>{for(let i=0;i<60;i++){if(await evaluate(fn))return;await delay(100);}throw Error('Timeout '+label+': '+await evaluate(()=>document.querySelector('[data-tx-status]')?.textContent));};
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
 const change=async(selector,value)=>evaluate((selector,value)=>{const e=document.querySelector(selector);if(typeof value==='boolean')e.checked=value;else e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));},selector,value);
 const ready=async()=>{await wait(()=>document.querySelector('[data-text-tools]')?.dataset.txLiveState==='ready','live preview');await delay(120);};
 const text=()=>evaluate(async()=>await(await fetch(document.querySelector('[data-tx-txt]').href)).text());
 const click=selector=>evaluate(selector=>document.querySelector(selector).click(),selector);
 const geometry=()=>evaluate(()=>{const v=document.querySelector('[data-tx-art-viewport]'),p=document.querySelector('[data-tx-art-content]'),h=document.querySelector('[data-tx-art-viewer]');const a=v.getBoundingClientRect(),b=p.getBoundingClientRect();return {mode:h.dataset.viewMode,scale:Number(h.dataset.viewScale),sw:v.scrollWidth,vw:v.clientWidth,within:b.left>=a.left-.1&&b.top>=a.top-.1&&b.right<=a.right+.1&&b.bottom<=a.bottom+.1,overflow:document.documentElement.scrollWidth>innerWidth+1};});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/output/work/?text=output'});
 await wait(()=>Boolean(document.querySelector('[data-sc-format]')),'shared UI');
 await change('[data-sc-format]','ascii');
 const originalHash=await evaluate(async()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const ctx=c.getContext('2d');const im=ctx.createImageData(320,240);for(let y=0;y<240;y++)for(let x=0;x<320;x++){const a=Math.floor(x/10),b=Math.floor(y/10);im.data.set([(a*17+b*11)%256,(a*33+b*29)%256,(a*7+b*53)%256,255],(y*320+x)*4);}ctx.putImageData(im,0,0);const blob=await new Promise(r=>c.toBlob(r,'image/png'));const bytes=await blob.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].join(',');const d=new DataTransfer();d.items.add(new File([blob],'fixture-10x.png',{type:'image/png'}));const i=document.querySelector('[data-tx-file]');i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}));return hash;});
 await ready();
 check('10x PNG read as 32x24',await evaluate(()=>document.querySelector('[data-tx-native-hint]').textContent.includes('読み込み 32 × 24px')));
 check('complete art equals output text',await text()===await evaluate(()=>document.querySelector('[data-tx-art-content]').textContent));
 for(const [width,height]of [[320,568],[390,844],[844,390],[1366,900]]){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(160);const g=await geometry();check(`fit at ${width}x${height}`,g.within&&!g.overflow);}
 await click('[data-tx-view="actual"]');await delay(80);const before=await text();await click('[data-tx-view="in"]');await delay(80);const zoom=(await geometry()).scale;check('zoom does not edit output',before===await text());
 await change('[data-tx-invert]',true);await ready();check('live update preserves manual zoom',(await geometry()).scale===zoom);check('live update changes art',before!==await text());
 await change('[data-tx-attach]',true);await ready();const full=await text();check('code is outside fitted art',full.startsWith(await evaluate(()=>document.querySelector('[data-tx-art-content]').textContent)+'\n\n'));
 const restoredHash=await evaluate(async text=>{const {decodeRestore}=await import('/js/creation/text-codec.mjs?rev=20261028-text-1');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',(await decodeRestore(text)).bytes))].join(',');},full);
 check('restoration preserves original file bytes',restoredHash===originalHash);
 await click('[data-tx-select]');check('select all opens raw pane',await evaluate(()=>document.querySelector('[data-tx-raw-text]').open));check('select all uses entire text',full===await evaluate(()=>document.querySelector('[data-tx-text-result]').value));
 await change('[data-tx-native-grid]',false);await ready();check('opt-out reads original dimensions',await evaluate(()=>document.querySelector('[data-tx-native-hint]').textContent.includes('ファイル寸法 320 × 240px')));
 await change('[data-tx-native-grid]',true);await ready();await change('[data-sc-format]','pixels');await ready();check('pixel text uses native grid',await evaluate(()=>document.querySelector('[data-tx-result-note]').textContent.startsWith('32 × 24px')));
 for(const style of ['ascii','block','braille','emoji','custom']){await change('[data-sc-format]',style);await ready();await click('[data-tx-view="fit"]');await delay(80);check(style+' full fit',(await geometry()).within);}
 check('preview updates never auto-download',downloads.length===0);
 const saved=await text();await click('#output-nav-export');for(let i=0;i<60&&!downloads.length;i++)await delay(100);check('explicit export downloads once',downloads.length===1);check('download contains latest full text',(await readFile(temp+'/downloads/'+downloads[0],'utf8'))===saved);
 check('no browser exceptions',errors.length===0);
 console.log('TEXT_ART_FIT_CHECK '+JSON.stringify({passed:checks.length,checks,errors,localOnly:true}));
} finally {
 for(const j of jobs.values())clearTimeout(j.timeout);jobs.clear();socket?.close();chrome.kill('SIGTERM');server.close();await delay(400);await rm(temp,{recursive:true,force:true});
}
