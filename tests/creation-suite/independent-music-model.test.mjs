import test from 'node:test';
import assert from 'node:assert/strict';
import { mountIndependentMusicModel } from '../../js/creation/independent-music-model.mjs';
import { createPxdProject } from '../../js/creation/pxd-codec.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { changeDrawMusicColor } from '../../js/creation/draw-music-core.mjs';
import { setAudioPixel } from '../../js/creation/audio-core.mjs';
import { createAnimation } from '../../js/creation/animation-core.mjs';
import { readIndependentMusicProject } from '../../js/creation/independent-music-session.mjs';
test('independent UI model edits and undoes Music without altering Art, saves independent role',async()=>{
 let active=false,session,callbacks,hook,dirty=0;const listeners=new Set();
 const draw={get independentMusicActive(){return active},getTimeline:()=>session.animation,getDocument:()=>session.document(),
  subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},
  async attachProjectHooks(h){hook=h;await h.onOpen(createPxdProject());return()=>{}},setMusicReadOnly(){},
  displayIndependentMusicDocument(doc,c,{activate=false}={}){callbacks=c;active||=activate;session=createDrawAnimationSession(doc,{musicLayer:false});return session.animation;},markIndependentMusicDirty(){dirty++}};
 const scope={add(){}};const model=await mountIndependentMusicModel({draw,scope});model.selectMusicLayer();
 assert.throws(()=>callbacks.previewView({palette:['#ffffff']}),/色パネル/);
 assert.throws(()=>callbacks.resizeView({sourcePalette:['#000000'],palette:['#000000']}),/色パネル/);
 model.change(state=>changeDrawMusicColor(state,{colorId:'rgba-000000ff',slotId:'square',instrument:'square'}));
 assert.equal(model.getState().link.colorToSlot['rgba-000000ff'],'square');
 const before=model.getState().song;const doc=session.document();doc.pixels[0]=0;session.commitDocument(doc);for(const f of listeners)f();
 assert.ok(dirty>0);assert.ok(model.getState());assert.ok(callbacks.canUndo());assert.equal(callbacks.undo(),true);assert.deepEqual(model.getState().song,before);assert.equal(callbacks.redo(),true);
 model.change(state=>{const song=setAudioPixel(state.song,{trackId:'track-square',pitch:84,startTick:1800,noteId:'outside-note',velocity:71});
  song.tracks[0].clips[0].notes.find(n=>n.noteId==='outside-note').sourceCell={kind:'audio-animation',frameId:state.musicPageId,localX:15,x:15,y:15};return {...state,song};});
 const noteBefore=structuredClone(model.getState().song.tracks[0].clips[0].notes.find(n=>n.noteId==='outside-note'));
 callbacks.resizeView({width:8,height:8});const small=session.document();small.pixels[1]=0;session.commitDocument(small);for(const f of listeners)f();
 assert.deepEqual(model.getState().song.tracks[0].clips[0].notes.find(n=>n.noteId==='outside-note'),noteBefore);
 assert.equal(model.getState().musicAnimation.width,16);assert.equal(model.getState().musicAnimation.height,16);
 const main=createAnimation({width:1028,height:1028});const project=await hook.onSave(await writePxdAnimation(createPxdProject(),main,{role:'main',independentMusic:true}));
 const restored=await readIndependentMusicProject(project);assert.equal(restored.musicAnimation.width,16);assert.deepEqual(restored.song,model.getState().song);
});
test('budget rejection restores canonical viewport and leaves save/Undo/Redo state intact',async()=>{
 let active=false,input,callbacks,hook;const listeners=new Set();
 const draw={get independentMusicActive(){return active},getTimeline:()=>input.animation,getDocument:()=>input.document(),subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)},
 async attachProjectHooks(h){hook=h;await h.onOpen(createPxdProject());return()=>{}},setMusicReadOnly(){},markIndependentMusicDirty(){},
 displayIndependentMusicDocument(doc,c,{activate=false}={}){callbacks=c;active||=activate;input=createDrawAnimationSession(doc,{musicLayer:false});return input.animation;}};
 const model=await mountIndependentMusicModel({draw,scope:{add(){}},musicMemoryBudget:12000});model.selectMusicLayer();
 const original=model.getState(),pixels=Array.from(input.document().pixels);let rejected=false;
 for(let i=0;i<100&&!rejected;i++){
   const before=model.getState(),undo=callbacks.canUndo(),redo=callbacks.canRedo(),priorPixels=Array.from(input.document().pixels);
   const doc=input.document();doc.pixels[i%256]=doc.pixels[i%256]<0?0:-1;input.commitDocument(doc);
   try { for(const f of listeners)f(); } catch(error){
     assert.match(error.message,/予算/);rejected=true;
     assert.equal(model.getState()._canonical,before._canonical);assert.deepEqual(Array.from(input.document().pixels),priorPixels);
     assert.equal(callbacks.canUndo(),undo);assert.equal(callbacks.canRedo(),redo);assert.match(model.error,/予算/);
     const saved=await hook.onSave(await writePxdAnimation(createPxdProject(),createAnimation({width:1028,height:1028}),{role:'main',independentMusic:true}));
     assert.deepEqual((await readIndependentMusicProject(saved)).song,before.song);
     assert.deepEqual(Array.from(input.document().pixels),priorPixels);
     if(undo){assert.equal(callbacks.undo(),true);assert.equal(callbacks.redo(),true);assert.deepEqual(model.getState().song,before.song);assert.deepEqual(Array.from(input.document().pixels),priorPixels);}
   }
 }
 assert.equal(rejected,true);assert.ok(original);assert.equal(pixels.length,256);
});
