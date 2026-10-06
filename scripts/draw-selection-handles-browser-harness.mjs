/** Direct selection controls through native mouse/touch and independent virtual button/pad contacts. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createAnimation, writeAnimationCel } from '../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd } from '../js/creation/pxd-codec.mjs';
import { writePxdAnimation } from '../js/creation/pxd-animation.mjs';
const base=process.env.PIXIEED_BROWSER_BASE_URL||'http://127.0.0.1:4188';assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=process.env.PIXIEED_SELECTION_HANDLES_OUTPUT||'/tmp/pixieed-draw-selection-handles-20261006';await mkdir(output,{recursive:true});
const indices=Array(256).fill(-1),pattern=[0,1,-1,2,-1,0,-1,-1,2,-1,1,0];
for(let y=0;y<3;y++)for(let x=0;x<4;x++){indices[(y+4)*16+x+3]=pattern[y*4+x];indices[(y+4)*16+x+9]=2;}
let fixture=createAnimation({width:16,height:16,palette:['#e75445','#4c82c3','#6d9b68']});fixture=writeAnimationCel(fixture,fixture.frames[0].id,fixture.layers[0].id,{width:16,height:16,pixels:indices.map(v=>v+1)});
await writeFile(output+'/source.pxd',await encodePxd(await writePxdAnimation(createPxdProject(),fixture)));
const {chromium}=await import(pathToFileURL(process.env.PIXIEED_PLAYWRIGHT_MODULE||'/Users/tsukadareine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs').href);
const browser=await chromium.launch(),results=[];
const near=(a,b,tolerance=.15)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
try {
 for(const variant of [{width:320,height:568,dpr:2},{width:390,height:844,dpr:3},{width:1280,height:800,dpr:1},{width:1280,height:800,dpr:2},{width:844,height:390,dpr:2}]){
  const context=await browser.newContext({viewport:variant,deviceScaleFactor:variant.dpr,hasTouch:true,acceptDownloads:true}),p=await context.newPage(),errors=[],checks=[];
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000);
  const label=`${variant.width}x${variant.height}-dpr${variant.dpr}`,rgba=()=>p.locator('#draw-canvas').evaluate(c=>[...c.getContext('2d').getImageData(0,0,c.width,c.height).data]);
  const frame=()=>p.locator('.draw-selection').evaluate(n=>Object.fromEntries(['x','y','width','height','angle'].map(k=>[k,Number(n.dataset[k])])));
  const at=async(x,y)=>{const c=await p.locator('#draw-canvas').boundingBox();return{x:c.x+x*c.width/16,y:c.y+y*c.height/16};};
  const control=async name=>{const b=await p.locator(`[data-selection-control="${name}"]`).boundingBox();assert.ok(b,name+' visible');return{x:b.x+b.width/2,y:b.y+b.height/2};};
  const drag=async(a,b,button='left')=>{await p.mouse.move(a.x,a.y);await p.mouse.down({button});await p.mouse.move(b.x,b.y,{steps:6});await p.mouse.up({button});await p.waitForTimeout(50);};
  const select=async()=>{await p.locator('#draw-canvas').focus();await p.keyboard.press('Escape');await p.keyboard.press('Escape');await p.keyboard.press('v');await drag(await at(3.5,4.5),await at(6.5,6.5));};
  const cancel=async()=>{await p.locator('#draw-canvas').focus();await p.keyboard.press('Escape');await p.waitForTimeout(40);};
  const panel=async()=>{if(!await p.locator('#draw-selection-panel').isVisible())await p.locator('#draw-selection-open').click();};
  const number=async(id,value)=>{await panel();await p.locator('#'+id).fill(String(value));await p.locator('#'+id).press('Tab');await p.waitForTimeout(40);};
  const action=async name=>{await panel();await p.locator(`[data-selection-action="${name}"]`).click();await p.waitForTimeout(40);};
  const command=async id=>{if(await p.locator('#draw-selection-panel').isVisible())await p.locator('#draw-selection-open').click();await p.locator('#draw-settings-summary').click();await p.locator('#draw-shortcuts-open').click();await p.locator(`[data-command-run="${id}"]`).click();await p.waitForTimeout(40);};
  const angleDrag=async(delta,modifier=null,button='left')=>{const h=await control('rotate'),pivot=await control('pivot'),a=delta*Math.PI/180,dx=h.x-pivot.x,dy=h.y-pivot.y;if(modifier)await p.keyboard.down(modifier);await drag(h,{x:pivot.x+Math.cos(a)*dx-Math.sin(a)*dy,y:pivot.y+Math.sin(a)*dx+Math.cos(a)*dy},button);if(modifier)await p.keyboard.up(modifier);};
  const pivotLogical=()=>p.locator('[data-selection-control="pivot"]').evaluate(n=>({x:Number(n.dataset.canvasX),y:Number(n.dataset.canvasY)}));
  const undo=async()=>{await p.locator('#draw-canvas').focus();await p.keyboard.press(process.platform==='darwin'?'Meta+z':'Control+z');await p.waitForTimeout(40);};
  const cdp=await context.newCDPSession(p),touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(q=>({...q,radiusX:1,radiusY:1,force:1}))});
  const touchDrag=async(a,b,id=41)=>{await touch('touchStart',[{id,...a}]);await touch('touchMove',[{id,...b}]);await touch('touchEnd',[]);await p.waitForTimeout(50);};
  const virtualPlace=async(target)=>{const m=await p.locator('.draw-virtual-marker').boundingBox(),b=await p.locator('.draw-board').boundingBox(),dx=target.x-m.x-m.width/2,dy=target.y-m.y-m.height/2;
   const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),start={x:clamp(b.x+b.width/2,b.x+5-Math.min(0,dx),b.x+b.width-5-Math.max(0,dx)),y:clamp(b.y+b.height/2,b.y+5-Math.min(0,dy),b.y+b.height-5-Math.max(0,dy))};
   await touchDrag(start,{x:start.x+dx,y:start.y+dy},71);const n=await p.locator('.draw-virtual-marker').boundingBox();near(n.x+n.width/2,target.x,.2);near(n.y+n.height/2,target.y,.2);
  };
  const virtualDrag=async(side,from,to,cancelled=false)=>{await virtualPlace(from);const b=await p.locator(`[data-virtual-${side}]`).boundingBox(),board=await p.locator('.draw-board').boundingBox(),hold={id:11,x:b.x+b.width/2,y:b.y+b.height/2},pad={id:22,x:board.x+board.width/2,y:board.y+board.height/2};
   await touch('touchStart',[hold]);await touch('touchStart',[hold,pad]);await touch('touchMove',[hold,{...pad,x:pad.x+to.x-from.x,y:pad.y+to.y-from.y}]);
   if(cancelled)await touch('touchCancel',[]);else{await touch('touchEnd',[hold]);await touch('touchEnd',[]);}await p.waitForTimeout(60);
   assert.equal(await p.locator(`[data-virtual-${side}]`).getAttribute('aria-pressed'),'false');
  };
  try {
   await p.goto(base+'/draw/');await p.waitForFunction(()=>!document.querySelector('#main').inert);
   await p.locator('#project-open').click();await p.locator('#project-tab-library').click();await p.locator('.project-imports > summary').click();await p.locator('#pxd-file-input').setInputFiles(output+'/source.pxd');
   await p.waitForFunction(()=>document.querySelectorAll('#draw-palette [data-color-index]').length===4&&!document.querySelector('#main').inert);if(await p.locator('#pxd-panel').evaluate(n=>n.open))await p.locator('#project-close').click();
   const initial=await rgba();await select();await command('tool.right.select');
   const rects=await p.locator('.draw-board,#draw-canvas,.draw-controls,#draw-virtual-controls').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return[r.x,r.y,r.width,r.height];}));
   for(const corner of ['nw','ne','sw','se']){
    await select();const f=await frame(),opposite={nw:'se',ne:'sw',sw:'ne',se:'nw'}[corner],anchor=await control(opposite),a=await control(corner),west=corner.includes('w'),north=corner.includes('n'),d=await at(west?-2.1:2.1,north?-1.6:1.6),zero=await at(0,0);
    await drag(a,{x:a.x+d.x-zero.x,y:a.y+d.y-zero.y});assert.equal((await frame()).width,6);assert.equal((await frame()).height,5);const after=await control(opposite);near(after.x,anchor.x);near(after.y,anchor.y);await cancel();assert.deepEqual(await rgba(),initial);
   }
   const styles=await p.locator('[data-selection-control]').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return{name:n.dataset.selectionControl,w:r.width,h:r.height,events:s.pointerEvents};}));
   for(const s of styles){assert.equal(s.w,s.name==='pivot'?20:s.name==='rotate'?22:12);assert.equal(s.h,s.w);assert.equal(s.events,'none');}
   checks.push('all four visible fixed-size corner handles drag resize with the opposite corner fixed; Cancel restores source');
   await select();await angleDrag(37);near((await frame()).angle,37,.25);assert.notDeepEqual(await rgba(),initial);
   const beforePivot=await rgba(),oldFrame=await frame(),nw=await control('nw'),pivot=await control('pivot'),move=await at(1.25,-.5),zero=await at(0,0);
   await drag(pivot,{x:pivot.x+move.x-zero.x,y:pivot.y+move.y-zero.y});assert.deepEqual(await rgba(),beforePivot);assert.deepEqual(await frame(),oldFrame);const newNW=await control('nw');near(nw.x,newNW.x);near(nw.y,newNW.y);
   await angleDrag(53);near((await frame()).angle,90,.01);await cancel();assert.deepEqual(await rgba(),initial);
   checks.push('free-angle rotation then movable double-ring pivot keeps pixels and corners still; relocated pivot drives next exact 90-degree snap');
   await select();await angleDrag(88.5,'Alt');near((await frame()).angle,88.5,.3);await cancel();await select();await angleDrag(56,'Shift');near((await frame()).angle,90,.01);await cancel();
   checks.push('narrow automatic snap; Alt preserves near-quarter arbitrary angles; Shift locks quarter turns');
   await select();await angleDrag(37,null,'right');near((await frame()).angle,37,.25);await cancel();await select();const rp=await control('pivot');await drag(rp,{x:rp.x+15,y:rp.y+8},'right');assert.deepEqual(await rgba(),initial);await cancel();checks.push('native right mouse rotates and relocates pivot through the same logical drag path');
   await select();await angleDrag(37);const angle=(await frame()).angle*Math.PI/180,anchor=await control('nw'),se=await control('se'),c=await p.locator('#draw-canvas').boundingBox();
   await drag(se,{x:se.x+(Math.cos(angle)*2.1-Math.sin(angle)*1.6)*c.width/16,y:se.y+(Math.sin(angle)*2.1+Math.cos(angle)*1.6)*c.height/16});assert.equal((await frame()).width,6);assert.equal((await frame()).height,5);const stable=await control('nw');near(anchor.x,stable.x);near(anchor.y,stable.y);
   await number('draw-selection-width',4);await number('draw-selection-angle',0);assert.deepEqual(await rgba(),initial);
   await action('flip-x');await action('flip-x');assert.deepEqual(await rgba(),initial);for(let i=0;i<4;i++)await action('rotate-right');assert.deepEqual(await rgba(),initial);
   await action('rotate-right');await action('confirm');assert.notDeepEqual(await rgba(),initial);await undo();assert.deepEqual(await rgba(),initial);
   checks.push('resize of rotated corners holds world anchor; numeric restore/flip twice/90 four times are lossless; confirm is one Undo');
   await select();const h=await control('rotate'),pv=await control('pivot');await p.mouse.move(h.x,h.y);await p.mouse.down();await p.mouse.move(pv.x+(h.y-pv.y)*-.65,pv.y+(h.x-pv.x)*.65,{steps:3});
   await p.locator('#draw-canvas').evaluate(n=>{for(let i=0;i<20;i++)if(n.hasPointerCapture(i))n.releasePointerCapture(i);});await p.mouse.move(h.x+1,h.y+1);await p.mouse.up();await p.waitForTimeout(60);assert.deepEqual(await rgba(),initial);near((await frame()).angle,0,.01);await cancel();
   checks.push('actual mouse capture loss restores the gesture checkpoint and ignores the late up');
   await select();const nwTouch=await control('nw'),ratio=await p.locator('#draw-canvas').boundingBox(),seFixed=await control('se');await touchDrag({x:nwTouch.x-16,y:nwTouch.y},{x:nwTouch.x-16-2.1*ratio.width/16,y:nwTouch.y-1.6*ratio.height/16});assert.equal((await frame()).width,6);assert.equal((await frame()).height,5);near((await control('se')).x,seFixed.x);await cancel();
   await select();const rotateTouch=await control('rotate'),pivotTouch=await control('pivot'),rad=37*Math.PI/180,tx=rotateTouch.x-pivotTouch.x,ty=rotateTouch.y-pivotTouch.y;
   await touchDrag(rotateTouch,{x:pivotTouch.x+Math.cos(rad)*tx-Math.sin(rad)*ty,y:pivotTouch.y+Math.sin(rad)*tx+Math.cos(rad)*ty});near((await frame()).angle,37,.4);
   const touchBefore=await rgba(),pt=await control('pivot');await touchDrag(pt,{x:pt.x+10,y:pt.y+8});assert.deepEqual(await rgba(),touchBefore);
   const beforeCancel=await frame(),beforeCancelPivot=await pivotLogical(),pc=await control('pivot');await touch('touchStart',[{id:51,...pc}]);await touch('touchMove',[{id:51,x:pc.x+20,y:pc.y}]);await touch('touchCancel',[]);await p.waitForTimeout(50);assert.deepEqual(await frame(),beforeCancel);assert.deepEqual(await pivotLogical(),beforeCancelPivot);assert.deepEqual(await rgba(),touchBefore);
   const b=await p.locator('.draw-board').boundingBox(),left={id:61,x:b.x+b.width*.25,y:b.y+b.height*.5},right={id:62,x:b.x+b.width*.7,y:b.y+b.height*.5};await touch('touchStart',[left,right]);await touch('touchMove',[{...left,x:left.x-8,y:left.y+5},{...right,x:right.x+8,y:right.y+5}]);await touch('touchEnd',[]);await p.waitForTimeout(80);assert.deepEqual(await rgba(),touchBefore);
   for(const name of ['nw','ne','sw','se','pivot']){const node=await p.locator(`[data-selection-control="${name}"]`).evaluate(n=>({x:Number(n.dataset.canvasX),y:Number(n.dataset.canvasY)})),expected=await at(node.x,node.y),actual=await control(name);near(expected.x,actual.x);near(expected.y,actual.y);}
   await p.screenshot({path:output+'/'+label+'-rotated-pivot-zoom.png'});await cancel();await p.locator('#draw-canvas').focus();await p.keyboard.press('0');
   checks.push('native touch resize/rotate/pivot/cancel; two-finger pan/pinch never changes pixels; all marks track logical coordinates after zoom/pan');
   await select();await p.locator('#draw-canvas').focus();await p.keyboard.press('+');await p.keyboard.press('+');const sizes=await p.locator('[data-selection-control]').evaluateAll(ns=>ns.map(n=>({name:n.dataset.selectionControl,width:n.getBoundingClientRect().width})));assert.deepEqual(sizes.map(s=>s.width),styles.map(s=>s.w));
   await p.keyboard.down('Space');await drag(await at(5,5),await at(5.5,5));await p.keyboard.up('Space');assert.deepEqual(await rgba(),initial);
   await p.keyboard.press('0');await angleDrag(37);const downloadReady=p.waitForEvent('download');await p.locator('#draw-export').evaluate(n=>n.click());const download=await downloadReady,png=output+'/'+label+'-export.png';await download.saveAs(png);
   const data=(await readFile(png)).toString('base64'),same=await p.evaluate(async({data,initial})=>{const blob=await(await fetch('data:image/png;base64,'+data)).blob(),image=await createImageBitmap(blob),c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').drawImage(image,0,0);const a=c.getContext('2d').getImageData(0,0,c.width,c.height).data,scale=c.width/16;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)for(let k=0;k<4;k++)if(a[(y*c.width+x)*4+k]!==initial[(Math.floor(y/scale)*16+Math.floor(x/scale))*4+k])return false;return true;},{data,initial});assert.equal(same,true);
   await p.keyboard.press('Escape');await p.keyboard.press('Escape');await cancel();checks.push('zoom never scales control glyphs; Space pans only; actual PNG export omits controls and uncommitted preview');
   await select();await command('tool.right.select');await command('toggle.virtualCursor');
   for(const side of ['left','right']){const from=await control('rotate'),pivot=await control('pivot'),a=37*Math.PI/180,dx=from.x-pivot.x,dy=from.y-pivot.y;await virtualDrag(side,from,{x:pivot.x+Math.cos(a)*dx-Math.sin(a)*dy,y:pivot.y+Math.sin(a)*dx+Math.cos(a)*dy});near((await frame()).angle,37,.5);await cancel();}
   const fp=await control('pivot'),beforeVirtual=await rgba();await virtualDrag('left',fp,{x:fp.x+12,y:fp.y+8},true);assert.deepEqual(await rgba(),beforeVirtual);const vCorner=await control('se'),vCanvas=await p.locator('#draw-canvas').boundingBox();await virtualDrag('right',vCorner,{x:vCorner.x+2.1*vCanvas.width/16,y:vCorner.y+1.6*vCanvas.height/16});assert.equal((await frame()).width,6);assert.equal((await frame()).height,5);await cancel();
   checks.push('native separate button/pad pointerIds rotate with both virtual sides; virtual pivot cancel and right corner resize release cleanly');
   if(variant.width>=1000){
    await command('toggle.virtualCursor');await p.locator('#draw-canvas').focus();await p.keyboard.press('Escape');await p.keyboard.press('Escape');await p.keyboard.press('v');await drag(await at(.5,.5),await at(15.5,15.5));await command('toggle.virtualCursor');
    const outside=await control('rotate'),cr=await p.locator('#draw-canvas').boundingBox();assert.ok(outside.x<cr.x||outside.x>cr.x+cr.width||outside.y<cr.y||outside.y>cr.y+cr.height);
    const pv=await control('pivot'),a=30*Math.PI/180,dx=outside.x-pv.x,dy=outside.y-pv.y;await virtualDrag('left',outside,{x:pv.x+Math.cos(a)*dx-Math.sin(a)*dy,y:pv.y+Math.sin(a)*dx+Math.cos(a)*dy});near((await frame()).angle,30,.5);await cancel();
    checks.push('virtual cursor reaches a real rotation handle outside the canvas while remaining inside the viewport');
   }
   await command('toggle.virtualCursor');await select();await angleDrag(37);await number('draw-selection-x',-1);await action('confirm');assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'),'false');assert.notDeepEqual(await rgba(),initial);await undo();assert.deepEqual(await rgba(),initial);
   await select();await angleDrag(37);await number('draw-selection-x',100);await action('confirm');assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'),'true');await action('cancel');assert.deepEqual(await rgba(),initial);
   await select();await angleDrag(37);await p.evaluate(()=>dispatchEvent(new Event('blur')));assert.deepEqual(await rgba(),initial);assert.equal(await p.locator('#draw-selection-open').getAttribute('data-pending'),'false');
   checks.push('partial clipping confirms/Undo restores; entirely outside confirms rejected; blur cancels free-angle preview');
   await select();await p.keyboard.press('Escape');await drag(await at(3.5,4.5),await at(3.5,4.5));const tiny=await rgba(),tinyPivot=await control('pivot');await touchDrag(tinyPivot,{x:tinyPivot.x+5,y:tinyPivot.y});assert.deepEqual(await rgba(),tiny);await number('draw-selection-pivot-x',3.25);await number('draw-selection-x',4);await action('cancel');assert.deepEqual(await rgba(),initial);
   await select();await angleDrag(37);await action('flip-y');await action('flip-y');await panel();await p.screenshot({path:output+'/'+label+'-direct-controls-panel.png'});
   assert.deepEqual(await p.locator('.draw-board,#draw-canvas,.draw-controls,#draw-virtual-controls').evaluateAll(ns=>ns.map(n=>{const r=n.getBoundingClientRect();return[r.x,r.y,r.width,r.height];})),rects);
   assert.deepEqual(errors,[]);checks.push('one-pixel pivot remains reachable with numeric alternatives; overlay/panel never move surrounding layout');
   results.push({variant,checks,errors});console.log('PASS',label,checks.length,'direct-control groups');
  }catch(e){await p.screenshot({path:output+'/'+label+'-failure.png'}).catch(()=>{});throw e;}finally{await context.close();}
 }
 await writeFile(output+'/results.json',JSON.stringify({results},null,2));
}finally{await browser.close();}
