/** Fixed lower Undo/Redo, automatic context actions and safe history during virtual input. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4188';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const output=process.env.PIXIEED_UNDO_REDO_OUTPUT||'/tmp/pixieed-draw-undo-redo-20261006'; await mkdir(output,{recursive:true});
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch({headless:true}),results=[];
const variants=[{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1280,height:800}];
try {for(const viewport of variants) for(const platform of ['mac','windows']) {
 const context=await browser.newContext({viewport,hasTouch:true}), errors=[], checks=[], label=`${viewport.width}x${viewport.height}-${platform}`;
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await context.addInitScript(platform=>{Object.defineProperty(navigator,'platform',{get:()=>platform==='mac'?'MacIntel':'Win32'});Object.defineProperty(navigator,'userAgentData',{get:()=>({platform:platform==='mac'?'macOS':'Windows'})});window.__reject=[];window.addEventListener('unhandledrejection',e=>window.__reject.push(String(e.reason)));},platform);
 const p=await context.newPage();p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));const cdp=await context.newCDPSession(p);
 const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});await p.waitForTimeout(25);};
 const rgba=()=>p.locator('#draw-canvas').evaluate(c=>[...c.getContext('2d').getImageData(0,0,c.width,c.height).data]);
 const storedRgba=()=>p.evaluate(async()=>{const [{createToolProjectStore},{readPxdDrawDocument},{documentRgba}]=await Promise.all([import('/js/creation/tool-project-store.mjs'),import('/js/creation/pxd-project.mjs'),import('/js/creation/draw-core.mjs')]);const project=await createToolProjectStore('draw').load(new URL(location.href).searchParams.get('pxd'));return [...documentRgba(await readPxdDrawDocument(project))];});
 const count=async()=> (await rgba()).filter((v,i)=>i%4===3&&v).length;
 const rect=selector=>p.locator(selector).boundingBox();
 const at=async(x,y)=>{const r=await rect('#draw-canvas');return{x:r.x+(x+.5)*r.width/16,y:r.y+(y+.5)*r.height/16};};
 const center=async(selector,id)=>{const r=await rect(selector);return{id,x:r.x+r.width/2,y:r.y+r.height/2};};
 const flags=async()=>[await p.locator('#draw-undo').isDisabled(),await p.locator('#draw-redo').isDisabled()];
 const fixed=()=>p.locator('.draw-board,#draw-canvas,#draw-palette,#draw-undo,#draw-redo').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return[r.x,r.y,r.width,r.height];}));
 const key=async(value)=>{await p.locator('#draw-canvas').focus();await p.keyboard.press(value);await p.waitForTimeout(25);};
 const primary=platform==='mac'?'Meta':'Control';const undoKey=()=>key(primary+'+z'),redoKey=()=>key(platform==='mac'?'Meta+Shift+z':'Control+y');
 const paint=async(x,y)=>{const q=await at(x,y);await p.mouse.click(q.x,q.y);};
 const action=async name=>{await p.locator(`[data-selection-action="${name}"]`).click();await p.waitForTimeout(30);};
 const slots=()=>p.locator('#draw-selection-controls [data-selection-action]').evaluateAll(ns=>ns.map(n=>n.dataset.selectionAction));
 const drag=async(a,b,alt=false)=>{if(alt)await p.keyboard.down('Alt');await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:5});await p.mouse.up();if(alt)await p.keyboard.up('Alt');await p.waitForTimeout(35);};
 const select=async()=>{await key('Escape');await key('Escape');await key('v');await drag(await at(3,4),await at(5,6));assert.equal(await p.locator('.draw-selection').isVisible(),true);};
 const move=async()=>{await drag(await at(4,5),await at(6,6),true);assert.equal(await p.locator('#draw-selection-controls').getAttribute('data-pending'),'true');};
 const virtual=async enabled=>{await p.locator('#draw-settings-summary').click();if((await p.locator('#draw-virtual-toggle').getAttribute('aria-pressed')==='true')!==enabled)await p.locator('#draw-virtual-toggle').click();await p.keyboard.press('Escape');};
 const group=async(name,run)=>{await run();checks.push(name);console.log('PASS',label,name);};
 try {
  await p.goto(base+'/draw/');await p.waitForFunction(()=>document.documentElement.dataset.drawReady==='true'&&!document.querySelector('#main').inert);
  await group('unique mirrored lower history slots stay fixed and disabled without history',async()=>{
   assert.equal(await p.locator('#draw-selection-mode,#draw-selection-paste').count(),0);assert.equal(await p.locator('#draw-undo').count(),1);assert.equal(await p.locator('#draw-redo').count(),1);assert.equal(await p.locator('.px-tool-header-controls #draw-undo,.px-tool-header-controls #draw-redo').count(),0);
   const l=await rect('#draw-undo'),r=await rect('#draw-redo'),tool=await rect('#draw-tool-summary');assert.equal(l.y,r.y);assert.equal(l.x,tool.x);assert.equal(l.width,44);assert.equal(r.width,44);assert.equal(l.height,44);assert.equal(r.height,44);assert.deepEqual(await flags(),[true,true]);
   const before=await fixed();await virtual(true);assert.deepEqual(await fixed(),before);await virtual(false);assert.deepEqual(await fixed(),before);assert.deepEqual(await slots(),['copy','cut']);
  });
  await group('buttons and platform keyboard Undo/Redo restore exact committed pixels',async()=>{
   await paint(1,1);await paint(2,1);const two=await rgba();assert.equal(await count(),2);await p.locator('#draw-undo').click();assert.equal(await count(),1);await p.locator('#draw-redo').click();assert.deepEqual(await rgba(),two);await undoKey();assert.equal(await count(),1);await redoKey();assert.deepEqual(await rgba(),two);
   if(platform==='windows'){await undoKey();await key('Control+Shift+z');assert.deepEqual(await rgba(),two);}
   await undoKey();await undoKey();assert.equal(await count(),0);
  });
  for(let y=4;y<=6;y++)for(let x=3;x<=5;x++)await paint(x,y);
  await group('Undo cancels a pending transform before history; Redo remains inert',async()=>{
   const source=await rgba();await select();const before=await fixed();await move();assert.deepEqual(await flags(),[false,true]);const preview=await rgba();assert.notDeepEqual(preview,source);await redoKey();assert.deepEqual(await rgba(),preview);await p.locator('#draw-undo').click();assert.deepEqual(await rgba(),source);assert.equal(await p.locator('#draw-selection-controls').getAttribute('data-pending'),'false');assert.deepEqual(await fixed(),before);
   await select();await move();await undoKey();assert.deepEqual(await rgba(),source);await undoKey();assert.equal(await count(),8);await redoKey();assert.deepEqual(await rgba(),source);await key('Escape');
  });
  await group('Copy/Cut switch to Paste; cancellation keeps Cut; cleared selection preserves touch Paste access',async()=>{
   const source=await rgba();await select();await action('copy');assert.deepEqual(await slots(),['paste','back']);await action('back');assert.deepEqual(await slots(),['copy','cut']);await action('cut');const cut=await rgba();assert.equal(await count(),0);await action('paste');await action('cancel');assert.deepEqual(await rgba(),cut);await p.locator('#draw-undo').click();assert.deepEqual(await rgba(),source);await p.locator('#draw-redo').click();assert.deepEqual(await rgba(),cut);await undoKey();assert.deepEqual(await rgba(),source);
   await select();await action('copy');await action('back');await key('Escape');assert.deepEqual(await slots(),['paste','back'],'clipboard usable after clearing selection');await action('paste');assert.equal(await p.locator('#draw-selection-controls').getAttribute('data-pending'),'true');await action('cancel');assert.deepEqual(await rgba(),source);await key(primary+'+v');assert.equal(await p.locator('#draw-selection-controls').getAttribute('data-pending'),'true');await undoKey();assert.deepEqual(await rgba(),source);await key('Escape');
  });
  await group('extra fingers on disabled history never undo a held virtual stroke or start repeat timers',async()=>{
   await key('b');await virtual(true);const b=await center('[data-virtual-left]',11), baseline=await rgba();await touch('touchStart',[b]);assert.deepEqual(await flags(),[true,true]);
   for(const selector of ['#draw-undo','#draw-redo']){const finger=await center(selector,22);await touch('touchStart',[b,finger]);await p.waitForTimeout(460);await touch('touchEnd',[finger]);assert.equal(await p.locator('[data-virtual-left]').getAttribute('aria-pressed'),'true');}
   await p.waitForTimeout(1100);assert.equal(await p.locator('[data-virtual-left]').getAttribute('aria-pressed'),'true','autosave must retain the held stroke');await p.waitForFunction(()=>document.querySelector('#project-open').dataset.state==='saved');assert.deepEqual(await storedRgba(),baseline,'autosave excludes the tentative held stroke');await key(primary+'+z');assert.deepEqual(await flags(),[true,true]);await touch('touchEnd',[]);const committed=await rgba();assert.notDeepEqual(committed,baseline);await p.waitForTimeout(480);assert.deepEqual(await rgba(),committed,'disabled-start contacts have no delayed history repeat');await p.waitForFunction(()=>document.querySelector('#project-open').dataset.state==='saved');assert.deepEqual(await storedRgba(),committed,'release schedules persistence of the completed stroke');await p.locator('#draw-undo').click();assert.deepEqual(await rgba(),baseline);assert.equal(await p.locator('[data-virtual-left]').getAttribute('aria-pressed'),'false');await virtual(false);
  });
  await group('history is inert during floating relocation and restored after release',async()=>{
   await virtual(true);const before=await rgba(),b=await center('[data-virtual-left]',11);await touch('touchStart',[b]);await touch('touchMove',[{...b,x:b.x-25,y:b.y-15}]);assert.equal(await p.locator('#draw-virtual-controls').getAttribute('data-floating-state'),'moving');assert.deepEqual(await flags(),[true,true]);await key(primary+'+z');assert.deepEqual(await rgba(),before);await touch('touchEnd',[]);assert.equal(await p.locator('#draw-undo').isDisabled(),false);await virtual(false);await p.screenshot({path:`${output}/${label}.png`});
  });
  assert.deepEqual(errors,[]);assert.deepEqual(await p.evaluate(()=>window.__reject),[]);results.push({label,checks,errors,geometry:await fixed()});
 }catch(e){results.push({label,checks,error:e.stack,errors});await p.screenshot({path:`${output}/${label}-failure.png`}).catch(()=>{});throw e;}finally{await context.close();await writeFile(output+'/results.json',JSON.stringify({results},null,2));}
}}finally{await browser.close();}
console.log('PASS',results.length,'screen/platform cases',results.reduce((n,r)=>n+r.checks.length,0),'Undo/Redo groups');
