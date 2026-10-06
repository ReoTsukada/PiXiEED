import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, addAnimationFrame, addAnimationLayer, writeAnimationCel, getAnimationCelDocument, setLayerProperties, setAnimationFrameDuration, resizeAnimation, canvasResizeOffset } from '../../js/creation/animation-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { createPxdProject, encodePxd, decodePxd } from '../../js/creation/pxd-codec.mjs';
import { writePxdAnimation, readPxdAnimation } from '../../js/creation/pxd-animation.mjs';
function fixture() {
  let animation=createAnimation({width:17,height:15,palette:['#112233','#abcdef']});
  animation=addAnimationLayer(animation,{name:'top'});animation=addAnimationFrame(animation,{copy:false});
  animation=setLayerProperties(animation,animation.layers[1].id,{visible:false,locked:true});
  animation=setAnimationFrameDuration(animation,animation.frames[1].id,240);
  for(let f=0;f<2;f++)for(let l=0;l<2;l++){
    const pixels=new Uint8Array(17*15);pixels[(l+2)*17+f+1]=f+l?2:1;pixels[7*17+8]=l+1;pixels[14*17+16]=f+1;
    animation=writeAnimationCel(animation,animation.frames[f].id,animation.layers[l].id,{width:17,height:15,pixels});
  }
  return animation;
}
const cel=(a,f,l)=>getAnimationCelDocument(a,a.frames[f].id,a.layers[l].id).pixels;
function checkTranslation(before,after,dx,dy){
  for(let f=0;f<2;f++)for(let l=0;l<2;l++){
    const expected=Array(after.width*after.height).fill(-1),source=cel(before,f,l);
    for(let y=0;y<before.height;y++)for(let x=0;x<before.width;x++)if(x+dx>=0&&x+dx<after.width&&y+dy>=0&&y+dy<after.height)expected[(y+dy)*after.width+x+dx]=source[y*before.width+x];
    assert.deepEqual(cel(after,f,l),expected,`frame ${f}, layer ${l} keeps exact pixel indices and transparent padding`);
  }
  assert.deepEqual(after.palette,before.palette);assert.deepEqual(after.frames,before.frames);assert.deepEqual(after.layers,before.layers);
}
test('center padding copies every frame and hidden/locked layer at 1:1 with transparent new cells',()=>{
  const before=fixture(),after=resizeAnimation(before,32,34,{anchor:'center'});checkTranslation(before,after,8,10);
  for(let f=0;f<2;f++)for(let l=0;l<2;l++)assert.equal(cel(after,f,l).filter(v=>v>=0).length,cel(before,f,l).filter(v=>v>=0).length);
  assert.equal(before.width,17);
});
test('center crop removes only pixels outside the new rectangle',()=>{
  const before=fixture(),after=resizeAnimation(before,11,9,{anchor:'center'});checkTranslation(before,after,-3,-3);
  assert.equal(cel(after,0,1)[4*11+5],1);assert.equal(cel(after,0,1).filter(v=>v>=0).length,1);
});
test('odd/even padding chains and repeated round trips never drift',()=>{
  const before=fixture();let after=before;
  for(let cycle=0;cycle<10;cycle++)for(const [w,h] of [[18,16],[19,17],[32,30],[17,15]])after=resizeAnimation(after,w,h,{anchor:'center'});
  checkTranslation(before,after,0,0);
  assert.deepEqual(canvasResizeOffset(16,16,17,17,'center'),{x:0,y:0});
  assert.deepEqual(canvasResizeOffset(17,17,16,16,'center'),{x:0,y:0});
  assert.throws(()=>resizeAnimation(before,32,32,{anchor:'random'}),/基準位置/);
});
test('one Undo/Redo restores the full canvas and every cel after crop or padding; selected cel survives',()=>{
  const before=fixture(),session=createDrawAnimationSession(getAnimationCelDocument(before,before.frames[0].id,before.layers[0].id));
  session.load(before,{frameId:before.frames[1].id,layerId:before.layers[1].id});
  const padded=resizeAnimation(session.animation,32,34,{anchor:'center'});session.apply(padded);
  const cropped=resizeAnimation(session.animation,11,9,{anchor:'center'});session.apply(cropped);
  assert.ok(session.undo());assert.equal(session.animation,padded);checkTranslation(before,session.animation,8,10);
  assert.ok(session.undo());assert.equal(session.animation,before);checkTranslation(before,session.animation,0,0);
  assert.ok(session.redo());assert.equal(session.animation,padded);assert.ok(session.redo());assert.equal(session.animation,cropped);
  assert.equal(session.frameId,before.frames[1].id);assert.equal(session.layerId,before.layers[1].id);
});
test('PXD save/reload restores all centered cels and frame/layer metadata',async()=>{
  const before=fixture(),after=resizeAnimation(before,32,34,{anchor:'center'});
  const project=await writePxdAnimation(createPxdProject(),after),restored=await readPxdAnimation(await decodePxd(await encodePxd(project)));
  checkTranslation(before,restored,8,10);
});
