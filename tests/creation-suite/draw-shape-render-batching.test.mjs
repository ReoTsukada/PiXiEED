import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createDrawDocument,createDrawHistory,beginDrawStroke,cancelDrawStroke,commitDrawStroke,strokePixels} from '../../js/creation/draw-core.mjs';
import {drawShapePixels} from '../../js/creation/draw-tool-operations.mjs';
import {createStrokePaintScheduler} from '../../js/creation/draw-render-optimization.mjs';

const source=readFileSync(new URL('../../js/creation/draw-page.mjs',import.meta.url),'utf8');
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function fixture(tool,{brushSize=1,start={x:1,y:1},size=16}={}){
 const documentData=createDrawDocument(size),history=createDrawHistory(documentData),jobs=new Map(),paints=[];let id=0;
 const painter=createStrokePaintScheduler({requestFrame(fn){jobs.set(++id,fn);return id;},cancelFrame(key){jobs.delete(key);},paint(changed){paints.push({changed,pixels:[...documentData.pixels]});}});
 const ctx=vm.createContext({documentData,history,jobs,paints,drawing:true,drawingPointerId:1,previousPoint:start,lineStart:start,strokeTracker:beginDrawStroke(documentData,{trusted:true}),strokeWasSaved:false,strokeStartPixels:null,saved:false,strokeBinding:{brushSize},inputSettings:{bindings:{left:{brushSize}}},lastInputSide:'left',selectionDrag:null,selectionTransform:null,drawOperationLease:null,effectiveTool:()=>tool,selectedPixelValue:()=>2,drawingSymmetry:()=>({}),selectionMask:()=>null,SHAPE_TOOLS:new Set(['line','rectangle','rectangle-fill','ellipse','ellipse-fill']),strokePaintScheduler:painter,drawShapePixels,cancelDrawStroke,beginDrawStroke,commitDrawStroke,paint(changed){paints.push({changed,pixels:[...documentData.pixels]});},markSegment(from,to,value){return strokePixels(documentData,from,to,value,{trusted:true,tracker:ctx.strokeTracker});},trackDrawStart(){},placeSelection(){},syncDrawingSettings(){},updateControls(){},setDrawRewardNotice(){},toast(){}});
 vm.runInContext(extract('function markShape(','function markSpray(')+extract('function applyDrawPoint(','function applyPointerMoveSamples(')+extract('function endStroke(','function sameSelectionFrame('),ctx);
 vm.runInContext('markShape(lineStart,previousPoint)',ctx);
 return {ctx,documentData,history,jobs,paints,move(point){ctx.point=point;vm.runInContext('applyDrawPoint(point,{type:"pointermove"})',ctx);},end(cancel){ctx.cancel=cancel;vm.runInContext('endStroke(cancel)',ctx);},flush(){painter.flush();}};
}

for(const tool of ['line','rectangle','rectangle-fill','ellipse','ellipse-fill'])test(`${tool}: all preview pixels remain synchronous, one paint per frame, final endpoint and Undo are exact`,()=>{
 const f=fixture(tool);
 const points=[{x:4,y:5},{x:13,y:10},{x:2,y:12},{x:11,y:7},{x:15,y:15}];
 for(const point of points){
  f.move(point);
  const expected=createDrawDocument();
  if(tool==='line')strokePixels(expected,{x:1,y:1},point,2);
  else drawShapePixels(expected,{x:1,y:1},point,2,{shape:tool.startsWith('rectangle')?'rectangle':'ellipse',filled:tool.endsWith('-fill')});
  assert.deepEqual(f.documentData.pixels,expected.pixels,'state contains every latest shape before the frame is painted');
 }
 assert.equal(f.paints.length,0);assert.equal(f.jobs.size,1);
 f.flush();assert.equal(f.paints.length,1);assert.deepEqual(f.paints[0].pixels,f.documentData.pixels);
 f.move({x:8,y:3});const final=[...f.documentData.pixels];
 f.end(false);
 assert.equal(f.jobs.size,0,'release discards the queued preview before the final synchronous paint');
 assert.deepEqual(f.paints.at(-1).pixels,final);
 assert.equal(f.history.undo(),true);assert.ok(f.documentData.pixels.every(v=>v===-1));assert.equal(f.history.canUndo,false,'one stroke is one step');
 assert.equal(f.history.redo(),true);assert.deepEqual(f.documentData.pixels,final);
 f.flush();assert.equal(f.paints.length,2,'no stale render survives release');
});

for(const tool of ['line','rectangle','rectangle-fill','ellipse','ellipse-fill'])test(`${tool}: cancellation restores the original and cancels the pending render`,()=>{
 const f=fixture(tool);f.move({x:12,y:9});assert.equal(f.jobs.size,1);f.end(true);
 assert.equal(f.jobs.size,0);assert.ok(f.documentData.pixels.every(v=>v===-1));assert.equal(f.history.canUndo,false);assert.equal(f.paints.length,1);f.flush();assert.equal(f.paints.length,1);
});

for(const tool of ['ellipse','ellipse-fill'])for(const brushSize of [1,3])test(`${tool} ${brushSize}px: odd/even reversed previews, commit, undo/redo and cancel use the same round raster`,()=>{
 const start={x:29,y:29}; const f=fixture(tool,{brushSize,start,size:32});
 const points=[{x:6,y:6},{x:7,y:7},{x:8,y:16},{x:16,y:8},{x:6,y:6}];
 for(const point of points){
  f.move(point); f.flush();
  const expected=createDrawDocument(32);
  drawShapePixels(expected,start,point,2,{shape:'ellipse',filled:tool.endsWith('-fill'),brushSize});
  assert.deepEqual(f.documentData.pixels,expected.pixels);
  assert.deepEqual(f.paints.at(-1).pixels,expected.pixels);
 }
 const final=[...f.documentData.pixels];f.end(false);
 assert.deepEqual(f.paints.at(-1).pixels,final);assert.equal(f.jobs.size,0);
 assert.equal(f.history.undo(),true);assert.ok(f.documentData.pixels.every(v=>v===-1));
 assert.equal(f.history.redo(),true);assert.deepEqual(f.documentData.pixels,final);
 const cancelled=fixture(tool,{brushSize,start,size:32});
 cancelled.move({x:6,y:6});cancelled.flush();cancelled.move({x:8,y:16});cancelled.end(true);cancelled.flush();
 assert.ok(cancelled.documentData.pixels.every(v=>v===-1));assert.equal(cancelled.history.canUndo,false);assert.equal(cancelled.jobs.size,0);
});
