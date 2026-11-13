import test from 'node:test';import assert from 'node:assert/strict';import{readFile}from'node:fs/promises';
import {createCameraPlacementMapping as mapping,sampleCameraFrameToPlacement as sample,createCameraPlacementRenderer as renderer,cameraPlacementOverlaySize,planCameraPlacementMemory} from '../../js/creation/camera-placement-preview.mjs';
import {prepareCameraTarget,planCameraReplacement} from '../../js/creation/draw-camera-core.mjs';
import {createDrawAnimationSession}from'../../js/creation/draw-animation-session.mjs';
import {sharedOutputSizes,normalizeOutputSize}from'../../js/pixel-studio/framing.mjs';
const palette=['#000000','#ff0000','#00ff00','#0000ff'];
for(const size of [16,256,512,1028])test(`camera ${size}: exact final row/column placement, bounded overlay and one undo`,()=>{
 const pixels=Array(size*size).fill(-1),doc={schemaVersion:1,width:size,height:size,palette:[...palette],pixels};
 const positions=[0,size-1,(size-1)*size,size*size-1,...(size===1028?[1023,1024,1027]:[])];
 const mask=new Uint8Array(size*size);for(const i of positions)mask[i]=1;
 const target=prepareCameraTarget(doc,mask),map=mapping({sourceWidth:size,sourceHeight:size,width:size,height:size,bounds:target.bounds,cells:target.cells,mask});
 const data=new Uint8ClampedArray(size*size*4);for(const i of positions)data.set([255,0,0,255],i*4);
 const selected=sample({width:size,height:size,data},map);for(let i=0;i<target.cells.length;i++)assert.deepEqual([...selected.slice(i*4,i*4+4)],[255,0,0,255]);
 const active=new Int16Array(size*size).fill(-1),view=renderer({width:size,height:size,singleLayer:true,palette,below:active,active,above:active,allowedIndices:[0,1,2,3]},map);
 const preview=view.render({width:size,height:size,data},{paletteFixed:true}),plan=planCameraReplacement(target,selected,{paletteFixed:true});
 for(const i of positions){assert.equal(plan.document.pixels[i],1);assert.deepEqual([...preview.slice(i*4,i*4+4)],[255,0,0,255]);}
 assert.equal(plan.document.pixels[1],-1);assert.ok(doc.pixels.every(i=>i===-1));
 const session=createDrawAnimationSession(doc),original=session.animation;session.commitDocument(plan.document);session.undo();assert.equal(session.animation,original);
 const overlay=cameraPlacementOverlaySize(size,size);assert.ok(overlay.width<=1028);assert.equal(overlay.width,size<=256?size*4:512);
 assert.equal(planCameraPlacementMemory({width:size,height:size}).allowed,true);
 assert.equal(view.render({width:size,height:size,data}),preview,'renderer reuses its output allocation');
});
test('camera rejects excessive dimensions/budget before mapping allocations',()=>{assert.throws(()=>mapping({sourceWidth:1029,sourceHeight:1,width:1,height:1,bounds:{x:0,y:0,width:1,height:1},cells:[0]}),RangeError);assert.equal(planCameraPlacementMemory({width:1028,height:1028,maxBytes:1024}).allowed,false);assert.deepEqual(sharedOutputSizes(),[16,32,64,96,128,160,256,512,1028]);assert.equal(normalizeOutputSize(1028),1028);});
test('final apply mapping skips boundary allocation without changing sampled pixels',()=>{const args={sourceWidth:2,sourceHeight:1,width:2,height:1,bounds:{x:0,y:0,width:2,height:1},cells:[0,1]},frame={width:2,height:1,data:Uint8ClampedArray.from([1,2,3,255,4,5,6,255])};const a=mapping(args),b=mapping({...args,includeBoundary:false});assert.equal(b.edges.length,0);assert.deepEqual(sample(frame,a),sample(frame,b));});
test('apply entry retains target lease/owner/frame/layer/mask safety (source contract)',async()=>{const source=await readFile(new URL('../../js/creation/draw-page.mjs',import.meta.url),'utf8');const apply=source.slice(source.indexOf('async applyCameraRgba('));assert.match(apply,/animationSession\.animation !== snapshot\.owner/);assert.match(apply,/animationSession\.frameId !== snapshot\.frameId/);assert.match(apply,/animationSession\.layerId !== snapshot\.layerId/);assert.match(apply,/snapshot\.target\.mask/);});
test('RGBA1028 preview preserves opacity and outside cells with bounded palette cache',()=>{
 const size=1028,base=new Uint8ClampedArray(size*4),lower=new Uint8ClampedArray(size*4),active=new Uint8ClampedArray(size*4);for(let i=0;i<size;i++)lower.set([0,0,255,255],i*4);base.set(lower);
 const map=mapping({sourceWidth:size,sourceHeight:1,width:size,height:1,bounds:{x:0,y:0,width:size,height:1},cells:[0,1023,1024,1027]});
 const view=renderer({width:size,height:1,palette:['#ff0000'],allowedIndices:[0],rgbaLayers:[{id:'below',rgba:lower,visible:true,opacity:1},{id:'active',rgba:active,visible:true,opacity:0.5}],activeLayerId:'active',baseRgba:base},map);
 const frame={width:size,height:1,data:new Uint8ClampedArray(size*4)};for(let i=0;i<size;i++)frame.data.set([255,0,0,255],i*4);
 const result=view.render(frame,{paletteFixed:true});for(const i of [0,1023,1024,1027])assert.deepEqual([...result.slice(i*4,i*4+4)],[128,0,128,255]);assert.deepEqual([...result.slice(4,8)],[0,0,255,255]);assert.deepEqual(base,lower);
});
test('full identity mapping aliases a read-only camera frame without duplicate samples',()=>{
 const size=1028,map=mapping({sourceWidth:size,sourceHeight:size,width:size,height:size,bounds:{x:0,y:0,width:size,height:size},cells:Uint32Array.from({length:size*size},(_,i)=>i)});
 assert.equal(map.identity,true);assert.equal(map.sourceOffsets,null);assert.equal(map.sampled,null);
 const frame={width:size,height:size,data:new Uint8ClampedArray(size*size*4)};assert.equal(sample(frame,map),frame.data);
 assert.equal(planCameraPlacementMemory({width:size,height:size,layerCount:1}).allowed,true);
 assert.equal(planCameraPlacementMemory({width:size,height:size,layerCount:8}).allowed,false);
 assert.equal(planCameraPlacementMemory({width:size,height:size,layerCount:1,irregular:true}).allowed,false);
});
test('placement metadata skips document copying and full irregular overbudget fails non-destructively',()=>{
 const doc={schemaVersion:1,width:1028,height:1028,palette:['#000000'],pixels:Array(1028*1028).fill(-1)};
 const metadata=prepareCameraTarget(doc,null,undefined,{copyDocument:false});assert.equal(metadata.document,null);
 assert.throws(()=>prepareCameraTarget(doc,new Uint8Array(1028*1028).fill(1)),error=>error.code==='camera-memory-budget');assert.equal(doc.pixels[0],-1);
});
test('actual Art/Music residents and engine scratch participate in camera budget',()=>{
 const base={width:1028,height:1028,layerCount:1,retainedArtBytes:2*1024*1024,retainedMusicBytes:128*1024,engineScratchBytes:1028*1028*4};
 assert.equal(planCameraPlacementMemory(base).allowed,true);
 assert.equal(planCameraPlacementMemory({...base,retainedMusicBytes:16*1024*1024}).allowed,false);
 assert.equal(planCameraPlacementMemory({...base,layerCount:3}).allowed,false);
 assert.equal(planCameraPlacementMemory({...base,engineScratchBytes:1028*1028*12,miniatureBytes:8*1024*1024}).allowed,false);
 const doc={schemaVersion:1,width:1028,height:1028,palette:['#000000'],pixels:Array(1028*1028).fill(-1)};
 assert.throws(()=>prepareCameraTarget(doc,null,undefined,{memoryContext:{retainedMusicBytes:32*1024*1024}}),error=>error.code==='camera-memory-budget');
 const target=prepareCameraTarget(doc,null,undefined,{memoryContext:{retainedArtBytes:1024}});
 assert.throws(()=>planCameraReplacement(target,new Uint8ClampedArray(1028*1028*4),{memoryContext:{retainedMusicBytes:32*1024*1024}}),error=>error.code==='camera-memory-budget');
});
test('engine releases incompatible scratch on pattern changes and shrinks on smaller frames',async()=>{
 const {setLensSettings,processLensFrame,lensMemoryPlan,DITHER_PATTERNS}=await import('../../js/pixel-lens/engine.mjs');
 const frame=size=>({width:size,height:size,data:new Uint8ClampedArray(size*size*4).fill(255)});
 const diffusion=DITHER_PATTERNS.find(p=>p.kind==='diffusion');
 setLensSettings({colorDepth:'4',paletteMode:'gameboy',gradientMode:'dither',ditherPattern:diffusion.id});processLensFrame(frame(64));assert.ok(lensMemoryPlan(64,64).retainedBytes<=64*64*12);
 setLensSettings({ditherPattern:'net8'});assert.equal(lensMemoryPlan(64,64).retainedBytes,0);processLensFrame(frame(64));assert.equal(lensMemoryPlan(64,64).retainedBytes,64*64*4);
 processLensFrame(frame(16));assert.equal(lensMemoryPlan(16,16).retainedBytes,16*16*4);
 setLensSettings({colorDepth:'full'});assert.equal(lensMemoryPlan(16,16).retainedBytes,0);
});
test('placement ignores hidden/zero-opacity buffers, not saved layers or visible music (actual method)',async()=>{
 const source=await readFile(new URL('../../js/creation/draw-page.mjs',import.meta.url),'utf8');
 const start=source.indexOf('  cameraPlacementTarget(memoryExtras={}'),end=source.indexOf('  previewCamera(',start);
 const method=source.slice(start,end).trim().replace(/,$/,'');
 const layersFor=(extra,active={})=>[{id:'music',name:'Music',role:'music',visible:false,opacity:1,...extra},{id:'art',name:'Art',visible:true,opacity:1,locked:false,...active}];
 const run=(layers,dimensions=2)=>{
  const animation={width:dimensions,height:dimensions,layers,frames:[{id:'f'}],palette:['#ff0000','#0000ff']};
  const documentData={schemaVersion:1,width:dimensions,height:dimensions,palette:animation.palette,pixels:Array(dimensions*dimensions).fill(0)};
  const cel=(a,f,id)=>({...documentData,pixels:new Int16Array(dimensions*dimensions).fill(id==='art'?0:1)});
  const rgba=doc=>Uint8Array.from(Array.from(doc.pixels).flatMap(p=>p===0?[255,0,0,255]:[0,0,255,255]));
  const deps={independentMusicActive:()=>false,assertEditableMusicReference:()=>assert.notEqual(layers.find(l=>l.id==='art')?.role,'music'),captureDrawOperation:()=>({}),readOnlyImage:null,animationSession:{animation,frameId:'f',layerId:'art'},ANIMATION_MAX_DIMENSION:1028,selectionTransform:null,selectionMask:()=>null,featureSession:null,colorEdit:null,playing:false,drawingInputBusy:()=>false,prepareCameraTarget,documentData,getAnimationCelDocument:cel,musicLayer:true,animationNeedsRgba:()=>true,indexedDocumentRgba:rgba,composeAnimationFrameRgba:()=>({rgba:rgba(documentData)}),composeAnimationFrame:()=>documentData,musicReadOnlyReason:''};
  const target=Function(...Object.keys(deps),`return ({${method}})`)(...Object.values(deps));
  target.getCameraMemoryContext=()=>({layerCount:Math.max(1,layers.filter(l=>l.id==='art'||l.visible&&(l.opacity??1)>0).length),retainedArtBytes:0,retainedMusicBytes:0});
  return {snapshot:target.cameraPlacementTarget({engineScratchBytes:0}),animation};
 };
 for(const extra of [{visible:false},{visible:true,opacity:0}]){
  const {snapshot,animation}=run(layersFor(extra),1028);
  assert.equal(snapshot.fullSingleLayer,true);assert.equal(snapshot.memoryContext.layerCount,1);
  assert.equal(animation.layers.length,2,'hidden canonical layer is untouched');
  const map=mapping({sourceWidth:1028,sourceHeight:1028,width:1028,height:1028,bounds:snapshot.bounds,cells:snapshot.cells,memoryContext:snapshot.memoryContext});
  const frame={width:1028,height:1028,data:new Uint8ClampedArray(1028*1028*4)};frame.data.set([13,27,39,255],frame.data.length-4);
  assert.equal(renderer(snapshot,map).render(frame),frame.data);
 }
 const visible=run(layersFor({visible:true})).snapshot;
 assert.equal(visible.fullSingleLayer,undefined);assert.equal(visible.rgbaLayers.length,2);assert.equal(visible.rgbaLayers[0].id,'music','visible legacy music remains composited');
 const hidden=run(layersFor({visible:true},{visible:false})).snapshot;
 assert.equal(hidden.fullSingleLayer,undefined);assert.equal(hidden.activeVisible,false);assert.equal(hidden.rgbaLayers.length,2);
 const zero=run(layersFor({visible:false},{opacity:0})).snapshot;
 assert.equal(zero.fullSingleLayer,undefined);assert.equal(zero.rgbaLayers.length,1);assert.equal(zero.rgbaLayers[0].opacity,0);
 for(const snapshot of [visible,hidden,zero]){
  const map=mapping({sourceWidth:2,sourceHeight:2,width:2,height:2,bounds:snapshot.bounds,cells:snapshot.cells,memoryContext:snapshot.memoryContext});
  const frame={width:2,height:2,data:Uint8ClampedArray.from(Array(4).fill([0,255,0,255]).flat())};
  const baseline={...snapshot,rgbaLayers:[{id:'unused',visible:false,opacity:1,rgba:new Uint8Array(16).fill(255)},...snapshot.rgbaLayers]};
  assert.deepEqual(renderer(snapshot,map).render(frame),renderer(baseline,map).render(frame));
 }
});
test('live camera memory getter counts compositor participants while retaining all art history',async()=>{
 const source=await readFile(new URL('../../js/creation/draw-page.mjs',import.meta.url),'utf8');
 const a=source.indexOf('  getCameraMemoryContext() {'),b=source.indexOf('  getTimeline()',a);
 const method=source.slice(a,b).trim().replace(/,$/,'');
 const animation={layers:[{id:'music',visible:false,opacity:1},{id:'art',visible:true,opacity:1}]};
 const timeline={past:[{id:'old'}],current:animation,future:[{id:'redo'}]};
 let retainedInput;
 const make=(musicBytes=128)=>Function('animationSession','estimateRetainedAnimationBytes','retainedMusicBytes',`return ({${method}})`)({animation,layerId:'art',snapshot:()=>({timeline})},items=>{retainedInput=items;return 2048},()=>musicBytes);
 const api=make();
 assert.equal(api.getCameraMemoryContext().layerCount,1);assert.deepEqual(retainedInput,[...timeline.past,animation,...timeline.future]);
 assert.equal(api.getCameraMemoryContext().retainedArtBytes,2048);assert.equal(api.getCameraMemoryContext().retainedMusicBytes,128);
 animation.layers[0].visible=true;assert.equal(api.getCameraMemoryContext().layerCount,2);
 animation.layers[0].opacity=0;assert.equal(api.getCameraMemoryContext().layerCount,1);
 animation.layers[1].visible=false;assert.equal(api.getCameraMemoryContext().layerCount,1,'hidden active still needs a buffer');
 assert.equal(make(16*1024*1024).getCameraMemoryContext().retainedMusicBytes,16*1024*1024,'unknown music retains conservative fallback supplied by its estimator');
});
