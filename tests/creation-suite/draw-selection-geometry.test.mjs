import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDrawSelection, projectDrawSelection, rasterDrawSelection } from '../../js/creation/draw-selection-operations.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';
import { selectionAxes, selectionWorldPoint, selectionLocalPoint, selectionFrameCorners, selectionContains, selectionDefaultPivot, resizeRotatedDrawSelection, snapSelectionAngle, hitSelectionControls } from '../../js/creation/draw-selection-geometry.mjs';
const source = () => {
 const d={schemaVersion:1,width:16,height:16,palette:['#ff0000','#00ff00','#0000ff'],pixels:Array(256).fill(-1)};
 const pattern=[0,1,-1,2,-1,0,-1,-1,2,-1,1,0];
 for(let y=0;y<3;y++)for(let x=0;x<4;x++)d.pixels[(4+y)*16+4+x]=pattern[y*4+x];
 return d;
};
const bounds={x:4,y:4,width:4,height:3}, near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const nearPoint=(a,b)=>{near(a.x,b.x);near(a.y,b.y);};

test('pivot relocation at a nonzero angle leaves every frame corner and every preview pixel unchanged',()=>{
 const d=source(),s=createDrawSelectionTransform(d,bounds);s.setAngle(37);
 const before=s.project().document,state=s.state,corners=selectionFrameCorners(state);
 s.setPivot({x:2.375,y:11.125});
 assert.equal(s.state.x,state.x);assert.equal(s.state.y,state.y);assert.equal(s.state.angle,37);
 assert.deepEqual(selectionFrameCorners(s.state),corners);assert.deepEqual(s.project().document,before);
 const read=s.state;read.pivot.x=500;assert.equal(s.state.pivot.x,2.375);
});
test('free-angle excursions and resizing repeatedly return to immutable original pixels without resampling loss',()=>{
 const d=source(),snapshot=structuredClone(d),s=createDrawSelectionTransform(d,bounds);
 d.pixels.fill(2);d.palette[0]='#ffffff';
 for(const a of [37,93.75,217.125,359.9,0]){s.setAngle(a);s.project();}
 assert.deepEqual(s.rect,bounds);assert.deepEqual(s.project().document,snapshot);
 s.resize({width:1,height:1});s.setAngle(71);s.flip('x');s.project();s.flip('x');s.setAngle(0);s.resize({width:4,height:3});
 assert.deepEqual(s.project().document,snapshot);
});
test('four exact quarter turns and angle out/back are lossless around a relocated fractional pivot',()=>{
 for(const angle of [0,37,113.25]){
  const s=createDrawSelectionTransform(source(),bounds);s.setAngle(angle);s.setPivot({x:3.125,y:10.75});
  const before=s.project().document,state=s.state;
  for(let i=0;i<4;i++){s.rotate(1);s.project({enforceLimits:false});}
  assert.equal(s.state.angle,angle);nearPoint(s.state,state);assert.deepEqual(s.project().document,before);
  s.setAngle(angle+71);s.project({enforceLimits:false});s.setAngle(angle);assert.deepEqual(s.project().document,before);
 }
});
test('a clockwise quarter turn still produces an exact source index permutation with mixed dimension parity',()=>{
 const d={schemaVersion:1,width:12,height:12,palette:['#110000','#220000','#330000','#440000','#550000','#660000'],pixels:Array(144).fill(-1)};
 for(let y=0;y<2;y++)for(let x=0;x<3;x++)d.pixels[(4+y)*12+4+x]=y*3+x;
 const s=createDrawSelectionTransform(d,{x:4,y:4,width:3,height:2});s.rotate(1);
 const raster=rasterDrawSelection(captureDrawSelection(d,{x:4,y:4,width:3,height:2}),s.state);
 const rows=[];for(let y=0;y<raster.height;y++){const row=[...raster.indices.slice(y*raster.width,(y+1)*raster.width)].filter(v=>v);if(row.length)rows.push(row);}
 assert.deepEqual(rows,[[4,1],[5,2],[6,3]]);
});
test('all rotated resize corners retain the opposite world anchor and normalized pivot, including a pivot outside the frame',()=>{
 for(const angle of [0,37,90,271.125])for(const handle of ['nw','ne','sw','se']){
  const s=createDrawSelectionTransform(source(),bounds);s.setAngle(angle);s.setPivot({x:1.5,y:12.25});
  const f=s.state,{c,s:sin}=selectionAxes(angle),west=handle.includes('w'),north=handle.includes('n');
  const other={nw:'se',ne:'sw',sw:'ne',se:'nw'}[handle],anchor=selectionFrameCorners(f)[other],oldPivot=selectionLocalPoint(f,f.pivot);
  const ux=west?-4:4,uy=north?-3:3,next=resizeRotatedDrawSelection(f,handle,c*ux-sin*uy,sin*ux+c*uy,true,4/3);
  assert.equal(next.width,8);assert.equal(next.height,6);nearPoint(selectionFrameCorners(next)[other],anchor);
  const newPivot=selectionLocalPoint(next,next.pivot);near(newPivot.x/next.width,oldPivot.x/f.width);near(newPivot.y/next.height,oldPivot.y/f.height);
 }
});
test('fixed ratio chooses the continuous drag axis before integer rounding at half-pixel sizes',()=>{
 const f={...bounds,angle:0,pivot:selectionDefaultPivot(bounds)};
 const next=resizeRotatedDrawSelection(f,'se',2,1.5,true,4/3);
 assert.equal(next.width,6);assert.equal(next.height,5);
 const a=37*Math.PI/180,r={...f,angle:37};
 const rotated=resizeRotatedDrawSelection(r,'se',Math.cos(a)*2-Math.sin(a)*1.5,Math.sin(a)*2+Math.cos(a)*1.5,true,4/3);
 assert.equal(rotated.width,6);assert.equal(rotated.height,5);
});
test('flip leaves frame and world pivot fixed and mixed transforms remain a single original-image mapping',()=>{
 const s=createDrawSelectionTransform(source(),bounds);s.setAngle(31);s.resize({width:7,height:5});s.setPivot({x:8.75,y:2.5});
 const before=s.project().document,state=s.state,corners=selectionFrameCorners(state);
 for(const axis of ['x','y']){s.flip(axis);assert.deepEqual(s.state.pivot,state.pivot);assert.deepEqual(selectionFrameCorners(s.state),corners);s.project();s.flip(axis);assert.deepEqual(s.project().document,before);}
 s.update({x:state.x+2,y:state.y+3});nearPoint(s.state.pivot,{x:state.pivot.x+2,y:state.pivot.y+3});
});
test('screen-sized hit tests prefer the nearest control; exact corner/pivot overlap prefers corner; small frames retain numeric alternatives',()=>{
 const controls={nw:{x:0,y:0},ne:{x:1,y:0},sw:{x:0,y:1},se:{x:1,y:1},pivot:{x:.5,y:.5},rotate:{x:.5,y:-2}};
 assert.equal(hitSelectionControls({x:.5,y:.5},controls,2,2),'pivot');
 assert.equal(hitSelectionControls({x:0,y:0},controls,2,2),'nw');
 assert.equal(hitSelectionControls({x:0,y:0},{...controls,pivot:{x:0,y:0}},2,2),'nw');
 assert.equal(hitSelectionControls({x:.5,y:-2},controls,2,2),'rotate');
 const frame={x:4,y:4,width:2,height:3,angle:37};assert.equal(selectionContains(frame,selectionWorldPoint(frame,1,1)),true);assert.equal(selectionContains(frame,selectionWorldPoint(frame,-.2,1)),false);
});
test('automatic three-degree quarter snap, explicit Shift quarter snap and Alt bypass preserve arbitrary angles',()=>{
 assert.equal(snapSelectionAngle(87.5),90);assert.equal(snapSelectionAngle(-2),0);assert.equal(snapSelectionAngle(85.5),85.5);
 assert.equal(snapSelectionAngle(38,{shiftKey:true}),0);assert.equal(snapSelectionAngle(88,{altKey:true}),88);assert.equal(snapSelectionAngle(38,{altKey:true,shiftKey:true}),38);
});
test('arbitrary rotation skips transparent destination holes and clipping cannot mutate originals on rejection',()=>{
 const d=source(),clip=captureDrawSelection(d,bounds),base={...d,pixels:Array(256).fill(1)};
 const s=createDrawSelectionTransform(base,bounds,{clipboard:clip});s.setAngle(37);s.resize({width:9,height:7});
 const next=s.project().document,raster=rasterDrawSelection(clip,s.state);
 let holes=0;for(let y=0;y<raster.height;y++)for(let x=0;x<raster.width;x++){const wx=raster.x+x,wy=raster.y+y;if(wx<0||wy<0||wx>=16||wy>=16)continue;if(!raster.indices[y*raster.width+x]){holes++;assert.equal(next.pixels[wy*16+wx],1);}}
 assert.ok(holes>0);assert.deepEqual(base.pixels,Array(256).fill(1));
 const before=structuredClone(d),original=createDrawSelectionTransform(d,bounds);original.setAngle(37);original.update({x:100,y:100});
 assert.throws(()=>original.project(),/キャンバス内/);assert.deepEqual(original.project({enforceLimits:false}).document,d);assert.deepEqual(d,before);
 const partial={...s.state,x:-3,y:2,pivot:selectionDefaultPivot({...s.state,x:-3,y:2})};
 assert.ok(projectDrawSelection(base,clip,partial).visiblePixels>0);
 const full={...base,palette:Array.from({length:32},(_,i)=>`#${(i+1).toString(16).padStart(6,'0')}`)},fullBefore=structuredClone(full);
 assert.throws(()=>projectDrawSelection(full,clip,s.state),/パレット/);assert.deepEqual(full,fullBefore);
});
