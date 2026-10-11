import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, addAnimationFrame, addAnimationLayer, getAnimationCelDocument, writeAnimationCel, composeAnimationFrame, serializeAnimationPool } from '../../js/creation/animation-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs';
const red = '#ff0000', blue = '#0000ff';
function fixture() {
 let a = createAnimation({width:4,height:4,palette:[red,blue]});
 a = addAnimationFrame(a); a = addAnimationLayer(a,{visible:false,locked:true});
 for(const f of a.frames) for(const l of a.layers) { const d=getAnimationCelDocument(a,f.id,l.id); d.pixels=new Uint8Array(16);d.pixels[0]=1;d.pixels[5]=2;a=writeAnimationCel(a,f.id,l.id,d); }
 return a;
}
test('common setting applies every hidden/locked cel, preserves identities and returns one undoable snapshot',()=>{
 const a=fixture(), before=serializeAnimationPool(a);const plan=planSharedProjectSettings(a,{width:2,height:2,palette:[blue]});
 assert.equal(plan.summary.croppedPixels,4);assert.equal(plan.summary.remappedColors,1);
 assert.deepEqual(plan.animation.frames,a.frames);assert.deepEqual(plan.animation.layers,a.layers);
 for(const f of a.frames) for(const l of a.layers) {const d=getAnimationCelDocument(plan.animation,f.id,l.id);assert.equal(d.pixels[0],0);assert.equal(d.pixels.filter(p=>p>=0).length,1);}
 assert.deepEqual(serializeAnimationPool(a),before);
 const doc=composeAnimationFrame(a,a.frames[0].id), session=createDrawAnimationSession({...doc,pixels:Array.from(doc.pixels)});session.load(a);session.apply(plan.animation);
 session.undo();assert.equal(session.animation,a);session.redo();assert.equal(session.animation,plan.animation);
});
test('palette reorder remaps indices and retains exact picture for every frame/layer',()=>{
 const a=fixture(),next=planSharedProjectSettings(a,{palette:[blue,red]}).animation;
 for(const f of a.frames) for(const l of a.layers) {const old=getAnimationCelDocument(a,f.id,l.id),d=getAnimationCelDocument(next,f.id,l.id);old.pixels.forEach((v,i)=>assert.equal(v<0?null:a.palette[v],d.pixels[i]<0?null:next.palette[d.pixels[i]]));}
});
test('center pad/crop roundtrip preserves logical cells and validates before mutation',()=>{
 const a=fixture(),pad=planSharedProjectSettings(a,{width:7,height:9}).animation,back=planSharedProjectSettings(pad,{width:4,height:4}).animation;
 for(const f of a.frames) for(const l of a.layers)assert.deepEqual(getAnimationCelDocument(back,f.id,l.id),getAnimationCelDocument(a,f.id,l.id));
 for(const settings of [{width:0},{height:257},{palette:[]},{palette:[red,red]},{palette:['#ffffff80']}])assert.throws(()=>planSharedProjectSettings(a,settings));
 assert.equal(planSharedProjectSettings(a,{}).animation,a);
});
