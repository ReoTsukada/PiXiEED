import test from 'node:test';
import assert from 'node:assert/strict';
import { ANIMATION_MAX_DIMENSION, createAnimation, addAnimationFrame, addAnimationLayer, writeAnimationCel, resizeAnimation, getAnimationCelDocument, serializeAnimationPool, estimateRetainedAnimationBytes } from '../../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd, decodePxd, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs';
import { fitCanvasAspect, validateCanvasSettingsFields } from '../../js/creation/shared-project-settings-core.mjs';
import { scaleSpriteAnimation } from '../../js/creation/draw-sprite-scale.mjs';
import { createDrawAnimationHistory } from '../../js/creation/draw-animation-history.mjs';
import { evaluateSharedCanvasPolicy } from '../../js/creation/shared-canvas-policy.mjs';
const doc = s => getAnimationCelDocument(s,s.frames[0].id,s.layers[0].id);
function paint(s,seed=51){for(const f of s.frames)for(const l of s.layers){const pixels=new Uint8Array(s.width*s.height);for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=1+(seed>>>31);}s=writeAnimationCel(s,f.id,l.id,{width:s.width,height:s.height,pixels});}return s;}
test('1028 exact boundary uses 4px edge tiles and survives PXD encode/reopen',async()=>{
 assert.equal(ANIMATION_MAX_DIMENSION,1028);let s=createAnimation({width:1028,height:1028,palette:['#12345680','#abcdef']});const pixels=new Uint8Array(1028*1028);for(const [x,y] of [[0,0],[1023,1023],[1024,1024],[1027,1027],[1027,0],[0,1027]])pixels[y*1028+x]=2;s=writeAnimationCel(s,s.frames[0].id,s.layers[0].id,{width:1028,height:1028,pixels});
 const edge=serializeAnimationPool(s).find(t=>t.x===1024&&t.y===1024);assert.equal(edge.width,4);assert.equal(edge.height,4);assert.equal(edge.bytes.length,16);
 const tiles=serializeAnimationPool(s);assert.ok(tiles.some(t=>t.x===1024&&t.y===0&&t.width===4&&t.height===32));assert.ok(tiles.some(t=>t.x===0&&t.y===1024&&t.width===32&&t.height===4));
 const p=await writePxdAnimation(createPxdProject(),s),restored=await readPxdAnimation(await decodePxd(await encodePxd(p)));assert.deepEqual(doc(restored),doc(s));assert.deepEqual(restored.palette,s.palette);
 assert.throws(()=>createAnimation({width:1029,height:1}),RangeError);assert.equal(validateCanvasSettingsFields({width:1028,height:1028,palette:['#000000']}).width,'');assert.equal(evaluateSharedCanvasPolicy({width:1028,height:1028,colorCount:32}).supported,true);
 const state=getPxdJson(p,'animations/main/state.json');await assert.rejects(()=>readPxdAnimation(setPxdJson(p,'animations/main/state.json',{...state,width:1029})),TypeError);
});
test('1028 admits three cel equivalents, rejects fourth and oversized PXD before tile construction',async()=>{
 let s=createAnimation({width:1028,height:1028});s=addAnimationFrame(s,{copy:false});s=addAnimationFrame(s,{copy:false});assert.equal(s.frames.length,3);assert.throws(()=>addAnimationFrame(s,{copy:false}),{code:'ANIMATION_LARGE_CANVAS_BUDGET'});assert.throws(()=>addAnimationLayer(s),{code:'ANIMATION_LARGE_CANVAS_BUDGET'});
 const p=await writePxdAnimation(createPxdProject(),s),state=getPxdJson(p,'animations/main/state.json');await assert.rejects(()=>readPxdAnimation(setPxdJson(p,'animations/main/state.json',{...state,frames:[...state.frames,{id:'fourth',durationMs:100}]})),{code:'ANIMATION_LARGE_CANVAS_BUDGET'});
 let small=createAnimation({width:256,height:256});for(let i=1;i<4;i++)small=addAnimationFrame(small,{copy:false});assert.throws(()=>resizeAnimation(small,1028,1028),{code:'ANIMATION_LARGE_CANVAS_BUDGET'});assert.equal(small.width,256);
});
test('1028 central padding preserves edge pixels and one-step Undo; ratio fits never crop',()=>{
 let s=createAnimation({width:32,height:32});const pixels=new Uint8Array(1024);pixels[0]=1;pixels[1023]=1;s=writeAnimationCel(s,s.frames[0].id,s.layers[0].id,{width:32,height:32,pixels});const next=planSharedProjectSettings(s,{width:1028,height:1028}).animation;assert.equal(doc(next).pixels[498*1028+498],0);assert.equal(doc(next).pixels[529*1028+529],0);assert.equal(doc(next).pixels[0],-1);const h=createDrawAnimationHistory(s);h.commit(next);assert.ok(h.undo());assert.equal(h.current,s);
 const fit=(w,h,a)=>fitCanvasAspect({width:w,height:h,originalWidth:w,originalHeight:h,aspect:a});assert.equal(fit(685,685,'3:2'),null);assert.deepEqual(fit(684,684,'3:2'),{width:1026,height:684});assert.deepEqual(fit(684,684,'2:3'),{width:684,height:1026});assert.deepEqual(fit(1028,1028,'1:1'),{width:1028,height:1028});assert.equal(fit(1028,1028,'3:2'),null);assert.deepEqual(fit(1028,1028,'free'),{width:1028,height:1028});
});
test('dense three-cel edits retain shared tiles but destructive transforms refuse loss of Undo',()=>{
 let s=createAnimation({width:1028,height:1028,palette:['#123456','#abcdef']});s=addAnimationFrame(s,{copy:false});s=addAnimationFrame(s,{copy:false});s=paint(s);assert.ok(estimateRetainedAnimationBytes([s])<4*1024*1024);
 const pixels=Uint8Array.from(doc(s).pixels,v=>v+1);pixels[pixels.length-1]=pixels[pixels.length-1]===1?2:1;const next=writeAnimationCel(s,s.frames[0].id,s.layers[0].id,{width:1028,height:1028,pixels});assert.ok(estimateRetainedAnimationBytes([s,next])<4*1024*1024);const history=createDrawAnimationHistory(s);history.commit(next);assert.ok(history.undo());assert.equal(history.current,s);
 assert.throws(()=>planSharedProjectSettings(s,{width:1027,height:1028}),{code:'SHARED_SETTINGS_HISTORY_LIMIT'});assert.throws(()=>scaleSpriteAnimation(s,99),{code:'SPRITE_SCALE_TARGET_HISTORY_LIMIT'});assert.equal(s.width,1028);
});
test('unpublished schema4 is rejected without downgrade, flattening, or original-byte mutation',async()=>{
 const art=createAnimation({width:16,height:16});let ordinary=await writePxdAnimation(createPxdProject(),art);ordinary=setPxdJson(ordinary,'future/unknown.json',{keep:'exact'});
 assert.equal(getPxdJson(ordinary,'animations/main/state.json').schemaVersion,1);
 const state=getPxdJson(ordinary,'animations/main/state.json');const prototype=setPxdJson(ordinary,'animations/main/state.json',{...state,schemaVersion:4,baseSchemaVersion:1,capabilities:['independent-music-v1']});
 const before=prototype.entries.map(e=>({path:e.path,bytes:new Uint8Array(e.bytes)}));
 await assert.rejects(()=>readPxdAnimation(prototype),{code:'PXD_ANIMATION_VERSION'});
 await assert.rejects(()=>writePxdAnimation(prototype,art),{code:'PXD_ANIMATION_VERSION'});
 await assert.rejects(()=>writePxdAnimation(ordinary,art,{independentMusic:true}),{code:'PXD_ANIMATION_VERSION'});
 assert.deepEqual(prototype.entries.map(e=>({path:e.path,bytes:e.bytes})),before);
 assert.equal(getPxdJson(prototype,'animations/main/state.json').schemaVersion,4);
 assert.deepEqual(getPxdJson(prototype,'future/unknown.json'),{keep:'exact'});
});
