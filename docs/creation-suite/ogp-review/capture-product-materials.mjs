import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const out=resolve(root,'docs/creation-suite/ogp-review/product-materials');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.webp':'image/webp','.bin':'application/octet-stream'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(p.endsWith('/'))p+='index.html';const target=resolve(root,'.'+p);if(!target.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',mime[extname(target)]||'application/octet-stream');res.end(await readFile(target));}catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true});const report={source:'current local checkout',externalRequests:'blocked',userWorks:'none',camera:'synthetic stream only; no hardware permission',captures:{}};
async function context(viewport={width:700,height:820}){const c=await browser.newContext({viewport,deviceScaleFactor:1});await c.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());return c;}
async function snap(page,name,selectors){await page.screenshot({path:out+'/'+name+'-full.png'});const rect=await page.evaluate(ss=>{const rs=ss.map(s=>document.querySelector(s)?.getBoundingClientRect()).filter(Boolean);const x=Math.max(0,Math.min(...rs.map(r=>r.x))),y=Math.max(0,Math.min(...rs.map(r=>r.y)));return{x,y,width:Math.min(innerWidth,Math.max(...rs.map(r=>r.right)))-x,height:Math.min(innerHeight,Math.max(...rs.map(r=>r.bottom)))-y};},selectors);await page.screenshot({path:out+'/'+name+'-ui.png',clip:rect});report.captures[name]={title:await page.title(),clip:rect};}
try{
 const c=await context(),p=await c.newPage();await p.goto(base+'/draw/');await p.waitForSelector('.draw-color');
 const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');
  const rect=(color,x,y,w,h)=>{g.fillStyle=color;g.fillRect(x,y,w,h)};
  rect('#9ed2d2',0,0,32,32);rect('#e6eddb',0,13,32,6);rect('#eab464',23,4,5,5);rect('#fff9e9',3,5,7,2);rect('#fff9e9',5,4,4,1);rect('#fff9e9',16,9,7,2);
  for(let x=0;x<32;x++){const y=18-Math.floor(5*Math.sin(x*.16));rect('#62988e',x,y,1,32-y);const y2=25-Math.floor(3*Math.sin(x*.2+1));rect('#315767',x,y2,1,32-y2)}
  rect('#e75445',9,20,9,6);rect('#fff9e9',10,21,7,6);for(let y=0;y<4;y++)rect('#17232d',13-y,17+y,1+2*y,1);rect('#315767',13,23,2,4);rect('#eab464',10,22,2,2);rect('#eab464',16,22,1,2);
  rect('#fff9e9',4,28,3,1);rect('#eab464',24,27,1,1);rect('#eab464',27,29,1,1);return c.toDataURL().split(',')[1];});
 await writeFile(out+'/self-authored-landscape.png',Buffer.from(png,'base64'));
 await p.locator('#draw-import-file').setInputFiles({name:'PiXiEED-demo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await p.waitForFunction(()=>document.querySelector('#draw-canvas').width===32);await p.waitForTimeout(300);await snap(p,'draw',['.draw-board','.draw-controls']);
 const d=p.locator('#draw-canvas');await writeFile(out+'/draw-canvas.png',Buffer.from(await d.evaluate(n=>n.toDataURL().split(',')[1]),'base64'));
 await c.close();
 const ac=await context({width:760,height:700}),a=await ac.newPage();await a.goto(base+'/audio/');await a.waitForFunction(()=>document.querySelectorAll('#audio-tracks button').length>=4);
 const box=await a.locator('#audio-pixel-canvas').boundingBox();
 for(let track=0;track<4;track++){await a.locator('#audio-tracks button').nth(track).click();for(let x=track%2;x<16;x+=2){let y=[5,8,11,14][track]+([0,1,-1,0][x%4]);await a.mouse.click(box.x+(x+.5)*box.width/16,box.y+(y+.5)*box.height/16);}}
 await a.waitForTimeout(200);await snap(a,'audio',['#audio-grid-wrap','.audio-controls']);await writeFile(out+'/audio-canvas.png',Buffer.from(await a.locator('#audio-pixel-canvas').evaluate(n=>n.toDataURL().split(',')[1]),'base64'));report.audioColors=await a.locator('#audio-tracks button').evaluateAll(ns=>ns.map(n=>({name:n.getAttribute('aria-label'),color:getComputedStyle(n).getPropertyValue('--track-color')})));await ac.close();
 const jc=await context({width:760,height:760}),j=await jc.newPage();await j.goto(base+'/jigsaw/');await j.locator('#jigsaw-source-kind').evaluate(n=>{n.value='file';n.dispatchEvent(new Event('change',{bubbles:true}));});await j.locator('#jigsaw-file').setInputFiles({name:'PiXiEED-demo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await j.waitForFunction(()=>/\d.*ピース/.test(document.querySelector('.arc-card-count')?.textContent||''));await j.locator('#jigsaw-start').click();await j.locator('#jigsaw-play').waitFor({state:'visible'});await j.waitForTimeout(250);await snap(j,'jigsaw',['#jigsaw-workspace','#jigsaw-tray']);report.jigsawCanvases=await j.locator('canvas').evaluateAll(ns=>ns.map(n=>({id:n.id,class:n.className,width:n.width,height:n.height})));await jc.close();
 const cc=await context({width:390,height:700});await cc.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const g=c.getContext('2d');function paint(){g.fillStyle='#9ed2d2';g.fillRect(0,0,320,240);g.fillStyle='#eab464';g.beginPath();g.arc(242,55,27,0,Math.PI*2);g.fill();g.fillStyle='#62988e';g.beginPath();g.moveTo(0,200);g.lineTo(145,92);g.lineTo(320,215);g.fill();g.fillStyle='#315767';g.fillRect(0,205,320,35);g.fillStyle='#fff9e9';g.fillRect(115,165,65,55);g.fillStyle='#e75445';g.beginPath();g.moveTo(108,165);g.lineTo(148,132);g.lineTo(187,165);g.fill();}paint();setInterval(paint,100);return c.captureStream(10);};});
 const cam=await cc.newPage();await cam.goto(base+'/pixel-camera.html');await cam.waitForFunction(()=>document.querySelector('#pixelStudio').dataset.mode==='live');await cam.waitForTimeout(600);await snap(cam,'camera',['#pixelStudio']);await cc.close();
 const gc=await context({width:700,height:700}),gl=await gc.newPage();await gl.goto(base+'/globe-prototype.html?embed=1');await gl.waitForTimeout(1800);await snap(gl,'globe',['body']);report.globeCanvases=await gl.locator('canvas').evaluateAll(ns=>ns.map(n=>({id:n.id,width:n.width,height:n.height})));await gc.close();
 const hc=await context({width:1200,height:800}),h=await hc.newPage();await h.goto(base+'/');await h.waitForTimeout(500);await snap(h,'home',['.hp-stage']);await hc.close();
 await writeFile(out+'/material-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();await new Promise(r=>server.close(r));}
