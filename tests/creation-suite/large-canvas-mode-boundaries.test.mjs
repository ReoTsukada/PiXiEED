import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeAnimation, createAnimation, ensureAnimationMusicLayer, getAnimationCelDocument, setAnimationDrawRewardBonusColors, setLayerProperties, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { AUDIO_PIXEL_TICKS, createAudioSong, resizeAudioCanvas, setAudioPixel } from '../../js/creation/audio-core.mjs';
import { encodePxd, decodePxd, createPxdProject, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { changeDrawMusicColor, projectDrawMusic } from '../../js/creation/draw-music-core.mjs';
import { mountDrawMusicModel } from '../../js/creation/draw-music-model.mjs';
import { planSharedProjectSettings } from '../../js/creation/shared-project-core.mjs?rev=20261015-alpha-opacity-1';

function harness(timeline, project = createPxdProject()) {
  let currentTimeline = timeline;
  const listeners = new Set();
  const cleanups = [];
  const history = [];
  const modelEvents = [];
  let hooks;
  let musicSettingsPlanner = null;
  let musicTimelineValidator = null;
  let rewardActive = false;
  const emit = () => { for (const listener of [...listeners]) listener(); };
  const draw = {
    getTimeline: () => currentTimeline,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async attachProjectHooks(value) { hooks = value; await value.onOpen(project, currentTimeline); return () => { hooks = null; }; },
    async applyMusicPage(document, options) {
      const layer = currentTimeline.layers.find(({ role }) => role === 'music');
      const storedDocument = { ...document, pixels: document.pixels.map((value) => value < 0 ? 0 : value + 1) };
      const next = writeAnimationCel(currentTimeline, currentTimeline.frames[0].id, layer.id, storedDocument);
      options.prepareTimeline?.(next);
      if (musicTimelineValidator?.({ before: currentTimeline, after: next, operation: 'music-page', rewardActive }) === false) return currentTimeline;
      currentTimeline = next; if (options.record !== false) history.push(next); emit();
      return next;
    },
    commitMetadata(prepare) {
      const activeLayer = currentTimeline.layers.find(({ role }) => role !== 'music') || currentTimeline.layers[0];
      const next = setLayerProperties(currentTimeline, activeLayer.id, {});
      prepare(next);
      if (musicTimelineValidator?.({ before: currentTimeline, after: next, operation: 'metadata', rewardActive }) === false) return false;
      currentTimeline = next; history.push(next); emit();
    },
    selectMusicLayer() { return true; },
    setMusicReadOnly(reason) { this.readOnlyReason = reason; },
    setMusicRewardStatus(reason) { this.rewardStatus = reason; },
    setMusicSettingsPlanner(planner) { musicSettingsPlanner = planner; },
    setMusicTimelineValidator(validator) { musicTimelineValidator = validator; return () => { if (musicTimelineValidator === validator) musicTimelineValidator = null; }; },
    snapshotTimeline() { return { animation: currentTimeline }; },
    restoreTimelineSnapshot(snapshot) { currentTimeline = snapshot.animation; emit(); return currentTimeline; },
    tryTimelineMutation(next, { afterValidate } = {}) {
      if (musicTimelineValidator?.({ before: currentTimeline, after: next, operation: 'direct-edit', rewardActive }) === false) return false;
      afterValidate?.();
      currentTimeline = next; history.push(next); emit(); return true;
    }
  };
  const scope = { add(cleanup) { cleanups.push(cleanup); } };
  return { draw, scope, history, modelEvents, get timeline() { return currentTimeline; }, get hooks() { return hooks; }, get musicSettingsPlanner() { return musicSettingsPlanner; }, emit,
    setRewardActive(value) { rewardActive = Boolean(value); },
    subscribe(model) { model.subscribe((event) => modelEvents.push(event)); }, cleanup() { cleanups.forEach((cleanup) => cleanup()); } };
}


import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { assertCreationModeCompatible } from '../../js/creation/creation-modes.mjs';
import { evaluateSharedCanvasPolicy } from '../../js/creation/shared-canvas-policy.mjs';

test('1028 shared canvas permits Camera and independent Music while legacy audio stays guarded',()=>{
 const animation=ensureAnimationMusicLayer(createAnimation({width:512,height:512}));
 assert.equal(evaluateSharedCanvasPolicy({width:512,height:512,colorCount:32}).supported,true);
 assert.equal(evaluateSharedCanvasPolicy({width:1029,height:512,colorCount:32}).supported,false);
 assert.equal(assertCreationModeCompatible('draw',animation),true);
 assert.throws(()=>assertCreationModeCompatible('audio',animation),error=>error.code==='audio-large-canvas-unsupported');
 assert.equal(assertCreationModeCompatible('camera',animation),true);
 assert.equal(assertCreationModeCompatible('audio',animation,{independentMusic:true}),true);
 assert.throws(()=>assertCreationModeCompatible('camera',{width:1029,height:16}),/1028/);
});

test('256 to 512 freezes pending music, saves it without reprojection, and manual 256 return restores use',async()=>{
 const app=harness(ensureAnimationMusicLayer(createAnimation({width:256,height:256,palette:['#000000']})));
 const model=await mountDrawMusicModel({draw:app.draw,scope:app.scope});
 model.change(current=>changeDrawMusicColor(current,{colorId:'rgba-000000ff',slotId:'square',instrument:'square'}));
 let before=app.timeline;const music=before.layers.find(layer=>layer.role==='music');const pixels=new Uint8Array(256*256);pixels[31*256+31]=1;
 app.draw.tryTimelineMutation(writeAnimationCel(before,before.frames[0].id,music.id,{width:256,height:256,pixels}));model.changeTempo(132);
 const song=structuredClone(model.getState().song),musicBefore=model.getState().musicAnimation;
 const large=resizeAnimation(app.timeline,512,512,{anchor:'center'});assert.equal(app.draw.tryTimelineMutation(large),true);
 assert.equal(model.readOnly,true);assert.deepEqual(model.getState().song,song);assert.equal(model.getState().musicAnimation,musicBefore);
 assert.throws(()=>model.changeTempo(140),/256px/);
 const withMain=await writePxdAnimation(createPxdProject(),large,{role:'main'});
 const saved=await app.hooks.onSave(withMain,large,{imageRole:'main'});assert.deepEqual(getPxdJson(saved,'audio/state.json'),song);
 const decoded=await decodePxd(await encodePxd(saved));const restoredMain=await readPxdAnimation(decoded,'main');assert.equal(restoredMain.width,512);
 const app2=harness(restoredMain,decoded),model2=await mountDrawMusicModel({draw:app2.draw,scope:app2.scope});assert.equal(model2.getState(),null);
 app2.draw.tryTimelineMutation(resizeAnimation(app2.timeline,256,256,{anchor:'center'}));await new Promise(resolve=>setTimeout(resolve,20));
 assert.deepEqual(model2.getState().song,song);assert.equal(model2.getState().musicAnimation.frames.length,musicBefore.frames.length);
 const oldMusicDoc=getAnimationCelDocument(musicBefore,musicBefore.frames[0].id,musicBefore.layers[0].id),nextMusic=model2.getState().musicAnimation;
 assert.deepEqual(getAnimationCelDocument(nextMusic,nextMusic.frames[0].id,nextMusic.layers[0].id).pixels,oldMusicDoc.pixels);app2.cleanup();
 const small=resizeAnimation(large,256,256,{anchor:'center'});app.draw.tryTimelineMutation(small);
 assert.equal(model.readOnly,false);assert.deepEqual(model.getState().song,song);
 app.cleanup();
});

test('opening 512 preserves saved music bytes and can reload music after return to 256',async()=>{
 const song=createAudioSong({songId:'retained-large',tempo:117});
 const project=setPxdJson(createPxdProject(),'audio/state.json',song);
 const original=ensureAnimationMusicLayer(createAnimation({width:512,height:512}));const app=harness(original,project);
 const model=await mountDrawMusicModel({draw:app.draw,scope:app.scope});assert.equal(model.readOnly,true);assert.equal(model.getState(),null);
 assert.equal(await app.hooks.onSave(project,original),project);
 app.draw.tryTimelineMutation(resizeAnimation(original,256,256,{anchor:'center'}));
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.ok(model.getState());assert.equal(model.getState().song.tempo,117);assert.equal(model.readOnly,false);app.cleanup();
});


test('resuming music never applies a stale 256 page after returning to 512',async()=>{
 const original=ensureAnimationMusicLayer(createAnimation({width:512,height:512}));const app=harness(original);
 const model=await mountDrawMusicModel({draw:app.draw,scope:app.scope});
 app.draw.tryTimelineMutation(resizeAnimation(original,256,256,{anchor:'center'}));
 app.draw.tryTimelineMutation(original);await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(app.timeline,original);assert.equal(model.getState(),null);assert.equal(model.readOnly,true);
 app.draw.tryTimelineMutation(resizeAnimation(original,256,256,{anchor:'center'}));await new Promise(resolve=>setTimeout(resolve,20));assert.ok(model.getState());assert.equal(model.readOnly,false);app.cleanup();
});
