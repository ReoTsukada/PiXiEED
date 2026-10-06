import test from 'node:test';
import assert from 'node:assert/strict';
import { transformSelectionFromCorner, unwrapSelectionBearing, selectionLocalPoint, selectionWorldPoint, selectionFrameCorners } from '../../js/creation/draw-selection-geometry.mjs';
import { captureDrawSelection, drawSelectionMask, rasterDrawSelection, rasterSelectionMask } from '../../js/creation/draw-selection-operations.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';
import { strokePixels, floodFill } from '../../js/creation/draw-core.mjs';
import { drawShapePixels, sprayPixels } from '../../js/creation/draw-tool-operations.mjs';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);
const doc = () => ({schemaVersion:1,width:16,height:16,pixels:Array(256).fill(-1),palette:['#e75445','#4c82c3','#6d9b68']});
const frame = {x:3,y:4,width:4,height:2,angle:37,pivot:{x:2.75,y:8.5},flipX:true};
test('one corner scales and rotates around an unchanged external pivot, from its checkpoint', () => {
 const start=selectionWorldPoint(frame,frame.width,frame.height),a={x:start.x-frame.pivot.x,y:start.y-frame.pivot.y},t=43*Math.PI/180;
 const end={x:frame.pivot.x+2*(a.x*Math.cos(t)-a.y*Math.sin(t)),y:frame.pivot.y+2*(a.x*Math.sin(t)+a.y*Math.cos(t))};
 const next=transformSelectionFromCorner(frame,start,end,{altKey:true});
 assert.deepEqual(next.pivot,frame.pivot);assert.equal(next.width,8);assert.equal(next.height,4);assert.equal(next.angle,80);assert.equal(next.flipX,true);
 const before=selectionLocalPoint(frame,frame.pivot),after=selectionLocalPoint(next,next.pivot);near(after.x,before.x*2);near(after.y,before.y*2);
 const back=transformSelectionFromCorner(frame,start,start,{altKey:true});near(back.x,frame.x);near(back.y,frame.y);assert.equal(back.angle,frame.angle);
});
test('corner transforms cap maximum dimensions, preserve positive minimum and reject zero baselines', () => {
 const f={x:0,y:0,width:4,height:2,angle:0,pivot:{x:2,y:1}},start={x:4,y:2};
 assert.equal(transformSelectionFromCorner(f,start,{x:2.001,y:1.001}).height,1);
 const big=transformSelectionFromCorner(f,start,{x:40000,y:20000});assert.equal(big.width,256);assert.equal(big.height,128);
 assert.equal(transformSelectionFromCorner(f,f.pivot,start),null);
 assert.equal(transformSelectionFromCorner(f,start,{x:2.01,y:1},{minRadius:.1}),null);
 assert.equal(transformSelectionFromCorner(f,start,{x:Infinity,y:1}),null);
});
test('bearing unwrap crosses both branch directions and supports complete revolutions', () => {
 const d=n=>n*Math.PI/180;near(unwrapSelectionBearing(d(179),d(-179)),d(2));near(unwrapSelectionBearing(d(-179),d(179)),d(-2));
 let total=0,previous=0;for(let i=1;i<=16;i++){const next=d((i*45+180)%360-180);total+=unwrapSelectionBearing(previous,next);previous=next;}near(total,d(720));
});
test('numeric independent width and height keep the moved pivot fixed', () => {
 const d=doc();d.pixels[4*16+3]=0;const t=createDrawSelectionTransform(d,{x:3,y:4,width:4,height:2});t.setPivot({x:2,y:9});t.setAngle(37);const before=t.state;
 t.resize({width:9,height:3});assert.deepEqual(t.state.pivot,before.pivot);const a=selectionLocalPoint(before,before.pivot),b=selectionLocalPoint(t.state,t.state.pivot);near(b.x,a.x*9/4);near(b.y,a.y*3/2);
});
test('selection membership includes transparent holes and skips pixels outside an irregular mask', () => {
 const d=doc(),bounds={x:3,y:4,width:4,height:2},mask=drawSelectionMask(bounds,16,16);d.pixels[4*16+3]=0;d.pixels[4*16+4]=1;mask[4*16+4]=0;
 const clip=captureDrawSelection(d,bounds,{mask});assert.equal(clip.indices[1],0);assert.equal(clip.mask[1],0);assert.equal(clip.mask[2],1);assert.equal(clip.indices[2],0);
 mask.fill(0);assert.equal(clip.mask[0],1,'capture owns its membership');
});
test('rotated masks preserve selected transparency and exclude AABB corners', () => {
 const d=doc();d.pixels[4*16+3]=0;const clip=captureDrawSelection(d,{x:3,y:4,width:4,height:2}),r=rasterDrawSelection(clip,{x:4,y:3,width:4,height:2,angle:45});
 assert.ok(r.mask.some((v,i)=>v && r.indices[i]===0));assert.ok(r.mask.some(v=>v===0));
 const mask=rasterSelectionMask(r,16,16);assert.equal(mask.reduce((a,b)=>a+b,0),r.mask.reduce((a,b)=>a+b,0));
});
test('pen and eraser cannot leak through a mask even when segments cross both boundaries', () => {
 const d=doc(),mask=drawSelectionMask({x:3,y:4,width:4,height:2},16,16);strokePixels(d,{x:0,y:4},{x:15,y:4},0,{mask});
 assert.deepEqual(d.pixels.flatMap((v,i)=>v>=0?[i]:[]),[67,68,69,70]);
 strokePixels(d,{x:0,y:4},{x:15,y:4},-1,{mask});assert.ok(d.pixels.every(v=>v===-1));
});
test('fill traversal is bounded by mask rather than merely filtering final writes', () => {
 const d=doc(),mask=drawSelectionMask({x:3,y:4,width:4,height:2},16,16);mask[4*16+5]=0;mask[5*16+5]=0;
 floodFill(d,3,4,0,{mask});assert.equal(d.pixels.filter(v=>v===0).length,4);assert.equal(d.pixels[4*16+6],-1,'disconnected region is not reached outside the mask');
 assert.equal(floodFill(d,0,0,1,{mask}).length,0);
});
test('all shapes and spray apply symmetry before final mask clipping', () => {
 const mask=drawSelectionMask({x:3,y:4,width:4,height:2},16,16),symmetry={horizontal:true,vertical:true,diagonalDown:true,diagonalUp:true};
 for(const shape of ['rectangle','ellipse'])for(const filled of [true,false]){const d=doc();drawShapePixels(d,{x:2,y:4},{x:8,y:8},0,{shape,filled,symmetry,mask});assert.ok(d.pixels.some(v=>v===0),`${shape}/${filled} must exercise masked writes`);assert.ok(d.pixels.every((v,i)=>v<0||mask[i]));}
 const d=doc();sprayPixels(d,{x:0,y:4},{x:15,y:4},0,{radius:0,random:()=>.7,symmetry,mask});assert.ok(d.pixels.some(v=>v===0));assert.ok(d.pixels.every((v,i)=>v<0||mask[i]));
});
test('floating mask getters are detached and source mask remains separate from opacity', () => {
 const d=doc();d.pixels[4*16+3]=0;const t=createDrawSelectionTransform(d,{x:3,y:4,width:4,height:2});const a=t.mask(16,16);assert.equal(a[4*16+4],1);a.fill(0);assert.equal(t.mask(16,16)[4*16+4],1);
});
test('every corner combines scale and rotation about center, external and fractional pivots after both flips', () => {
 for(const pivot of [{x:5,y:5},{x:-3.25,y:11.5},{x:3.001,y:4.002}])for(const flipX of [false,true])for(const flipY of [false,true]){
  const f={...frame,angle:0,pivot,flipX,flipY};
  for(const start of Object.values(selectionFrameCorners(f)))for(const factor of [.5,2]){
   const a={x:start.x-pivot.x,y:start.y-pivot.y},r=-137*Math.PI/180,end={x:pivot.x+factor*(a.x*Math.cos(r)-a.y*Math.sin(r)),y:pivot.y+factor*(a.x*Math.sin(r)+a.y*Math.cos(r))};
   const next=transformSelectionFromCorner(f,start,end,{altKey:true});
   assert.deepEqual(next.pivot,pivot);assert.equal(next.angle,223);assert.equal(next.width,f.width*factor);assert.equal(next.height,f.height*factor);assert.equal(next.flipX,flipX);assert.equal(next.flipY,flipY);
   const before=selectionLocalPoint(f,pivot),after=selectionLocalPoint(next,pivot);near(after.x,before.x*factor);near(after.y,before.y*factor);
  }
 }
});
test('quarter snapping changes angle only while scaling, and Alt preserves the simultaneous free angle', () => {
 const f={x:3,y:4,width:4,height:2,angle:0,pivot:{x:5,y:5}},start={x:7,y:6},r=88*Math.PI/180,a={x:2,y:1};
 const end={x:5+2*(a.x*Math.cos(r)-a.y*Math.sin(r)),y:5+2*(a.x*Math.sin(r)+a.y*Math.cos(r))};
 for(const [modifiers,angle] of [[{},90],[{altKey:true},88],[{shiftKey:true},90]]){
  const next=transformSelectionFromCorner(f,start,end,modifiers);assert.equal(next.angle,angle);assert.equal(next.width,8);assert.equal(next.height,4);assert.deepEqual(next.pivot,f.pivot);
 }
 assert.equal(transformSelectionFromCorner(f,start,start,{angleDelta:720,altKey:true}).angle,0);
});
test('an all-transparent selection still supplies a draw mask while copy capture remains unavailable', () => {
 const d=doc(),bounds={x:3,y:4,width:4,height:2},mask=drawSelectionMask(bounds,16,16);
 assert.equal(captureDrawSelection(d,bounds,{mask}),null);assert.equal(createDrawSelectionTransform(d,bounds,{mask}),null);
 assert.equal(mask.reduce((sum,v)=>sum+v,0),8);floodFill(d,3,4,0,{mask});assert.equal(d.pixels.filter(v=>v===0).length,8);assert.ok(d.pixels.every((v,i)=>v<0||mask[i]));
});
test('rotated irregular mask excludes originally unselected opaque cells but retains selected transparent cells', () => {
 const d=doc(),bounds={x:3,y:4,width:4,height:2},mask=drawSelectionMask(bounds,16,16);d.pixels[67]=0;d.pixels[68]=1;mask[68]=0;
 const clip=captureDrawSelection(d,bounds,{mask}),r=rasterDrawSelection(clip,{x:9,y:3,width:4,height:2,angle:90});
 assert.deepEqual([...r.mask],[1,1,1,0,1,1,1,1]);assert.ok(r.mask.some((v,i)=>v===1&&r.indices[i]===0));
 const full=rasterSelectionMask(r,16,16);strokePixels(d,{x:0,y:4},{x:15,y:4},2,{mask:full});assert.equal(d.pixels[4*16+8],-1,'the unselected hole is protected');assert.equal(d.pixels[4*16+7],2,'selected transparent space accepts paint');
});
test('simultaneous transform preview samples the owned original and restores pixels after excursions', () => {
 const d=doc(),bounds={x:3,y:4,width:4,height:2};for(let y=4;y<6;y++)for(let x=3;x<7;x++)d.pixels[y*16+x]=(x+y)%4-1;
 const original=structuredClone(d),t=createDrawSelectionTransform(d,bounds),checkpoint=t.state,start=selectionWorldPoint(checkpoint,4,2);
 d.pixels.fill(2);d.palette[0]='#ffffff';
 for(let i=0;i<20;i++){
  const radians=(i*41-220)*Math.PI/180,a={x:start.x-checkpoint.pivot.x,y:start.y-checkpoint.pivot.y};
  const point={x:checkpoint.pivot.x+1.5*(a.x*Math.cos(radians)-a.y*Math.sin(radians)),y:checkpoint.pivot.y+1.5*(a.x*Math.sin(radians)+a.y*Math.cos(radians))};
  t.update(transformSelectionFromCorner(checkpoint,start,point,{altKey:true}));t.project({enforceLimits:false});
 }
 t.update(transformSelectionFromCorner(checkpoint,start,start,{altKey:true}));assert.deepEqual(t.project().document,original);
});
