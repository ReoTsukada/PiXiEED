import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, addAnimationFrame, addAnimationLayer, writeAnimationCel, resizeAnimation, getAnimationCelDocument, composeAnimationFrameRgba, serializeAnimationPool, estimateRetainedAnimationBytes, createAnimationFromSerialized, validateLargeAnimationBudget } from '../../js/creation/animation-core.mjs';
import { createAnimation as oldCreateAnimation } from '../../js/creation/animation-core-v20261012.mjs';
import { createPxdProject, encodePxd, decodePxd, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { createDrawAnimationHistory } from '../../js/creation/draw-animation-history.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs';
import { planSpriteScale, scaleSpriteAnimation } from '../../js/creation/draw-sprite-scale.mjs';
const paint = (state, seed=42) => { const pixels=new Uint8Array(state.width*state.height);for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed>>>30?1:0;}return writeAnimationCel(state,state.frames[0].id,state.layers[0].id,{width:state.width,height:state.height,pixels}); };
const rgba = s => composeAnimationFrameRgba(s,s.frames[0].id).rgba;
for(const size of [16,64,128,256,512])test(`production ${size}px PXD round trip preserves all pixels and palette`,async()=>{
 const source=paint(createAnimation({width:size,height:size,palette:['#12345680','#abcdef']}));const project=await writePxdAnimation(createPxdProject(),source);const decoded=await readPxdAnimation(await decodePxd(await encodePxd(project)));
 assert.equal(decoded.width,size);assert.deepEqual(decoded.palette,source.palette);assert.deepEqual(rgba(decoded),rgba(source));assert.equal(decoded.schemaVersion,source.schemaVersion);
 const history=createDrawAnimationHistory(source);const changed=paint(source,92);history.commit(changed);assert.equal(history.undo(),true);assert.equal(history.current,source);assert.deepEqual(rgba(history.current),rgba(source));
});
test('512 preserves extended palette schema and old readers fail closed',async()=>{
 const palette=Array.from({length:40},(_,i)=>`#${(i+1).toString(16).padStart(6,'0')}`);const state=paint(createAnimation({width:512,height:300,palette}));const restored=await readPxdAnimation(await writePxdAnimation(createPxdProject(),state));assert.equal(restored.schemaVersion,3);assert.deepEqual(restored.palette,palette);assert.deepEqual(rgba(restored),rgba(state));assert.throws(()=>oldCreateAnimation({width:512,height:512}),RangeError);assert.throws(()=>createAnimation({width:1029,height:1029}),RangeError);
});
test('256 to 512 centered expansion preserves pixel size and Undo',()=>{
 const source=paint(createAnimation({width:256,height:256,palette:['#336699']}));const before=getAnimationCelDocument(source,source.frames[0].id,source.layers[0].id).pixels;
 const next=planSharedProjectSettings(source,{width:512,height:512}).animation;const after=getAnimationCelDocument(next,next.frames[0].id,next.layers[0].id).pixels;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++)assert.equal(after[y*512+x],x>=128&&x<384&&y>=128&&y<384?before[(y-128)*256+x-128]:-1);
 const h=createDrawAnimationHistory(source);h.commit(next);h.undo();assert.equal(h.current,source);
 const scaled=scaleSpriteAnimation(source,200);assert.equal(scaled.width,512);assert.equal(planSpriteScale(source,500).allowed,false);
});
test('large timeline and malformed PXD are rejected before tile construction',async()=>{
 let small=createAnimation({width:256,height:256});for(let i=1;i<17;i++)small=addAnimationFrame(small,{copy:false});const original=serializeAnimationPool(small);
 assert.throws(()=>resizeAnimation(small,512,512),{code:'ANIMATION_LARGE_CANVAS_BUDGET'});assert.equal(planSpriteScale(small,200).reasonCode,'SPRITE_SCALE_PIXEL_BUDGET');assert.deepEqual(serializeAnimationPool(small),original);
 let large=createAnimation({width:512,height:512});for(let i=1;i<16;i++)large=addAnimationFrame(large,{copy:false});assert.throws(()=>addAnimationFrame(large,{copy:false}),{code:'ANIMATION_LARGE_CANVAS_BUDGET'});
 assert.throws(()=>validateLargeAnimationBudget({width:512,height:512,frames:Array(128),layers:Array(8)}),{code:'ANIMATION_LARGE_CANVAS_BUDGET'});
 const project=await writePxdAnimation(createPxdProject(),createAnimation({width:512,height:512}));const state=getPxdJson(project,'animations/main/state.json');const oversized={...state,frames:Array.from({length:17},(_,i)=>({id:`frame-${i}`,durationMs:100}))};const corrupted=await setPxdJson(project,'animations/main/state.json',oversized);await assert.rejects(()=>readPxdAnimation(corrupted),{code:'ANIMATION_LARGE_CANVAS_BUDGET'});
});
test('512 single-pixel revision shares unchanged tiles and serialized state remains immutable',()=>{
 const source=paint(createAnimation({width:512,height:512}));const doc=getAnimationCelDocument(source,source.frames[0].id,source.layers[0].id);const pixels=Uint8Array.from(doc.pixels,v=>v+1);pixels[0]=pixels[0]?0:1;const changed=writeAnimationCel(source,source.frames[0].id,source.layers[0].id,{width:512,height:512,pixels});
 assert.ok(estimateRetainedAnimationBytes([source,changed])<estimateRetainedAnimationBytes([source])*1.1);assert.notDeepEqual(rgba(changed),rgba(source));
 const rehydrated=createAnimationFromSerialized(source,serializeAnimationPool(source));assert.deepEqual(rgba(rehydrated),rgba(source));
});
test('dense maximum large timeline refuses destructive whole-project changes when Undo cannot retain source',()=>{
 let state=createAnimation({width:512,height:512,palette:['#123456','#abcdef']});for(let i=1;i<8;i++)state=addAnimationLayer(state);state=addAnimationFrame(state,{copy:false});let seed=217;
 for(const frame of state.frames)for(const layer of state.layers){const pixels=new Uint8Array(512*512);for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=1+(seed>>>31);}state=writeAnimationCel(state,frame.id,layer.id,{width:512,height:512,pixels});}
 assert.ok(estimateRetainedAnimationBytes([state])>4*1024*1024);const original=state;assert.throws(()=>planSharedProjectSettings(state,{width:511,height:512}),{code:'SHARED_SETTINGS_HISTORY_LIMIT'});assert.equal(state,original);assert.equal(state.width,512);
});
