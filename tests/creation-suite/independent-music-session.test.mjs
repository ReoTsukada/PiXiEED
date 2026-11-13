import test from 'node:test';import assert from 'node:assert/strict';
import {createAnimation,writeAnimationCel,resizeAnimation,setAnimationPalette} from '../../js/creation/animation-core.mjs';
import {createAudioSong,setAudioPixel,AUDIO_PIXEL_TICKS} from '../../js/creation/audio-core.mjs';
import {createPxdProject,getPxdJson,setPxdJson,encodePxd,decodePxd} from '../../js/creation/pxd-codec.mjs';
import {writePxdAnimation,readPxdAnimation} from '../../js/creation/pxd-animation.mjs';
import {createIndependentMusicState,createIndependentMusicSession,independentMusicViewport,resizeIndependentMusicView,loadIndependentMusicState,writeIndependentMusicProject,readIndependentMusicProject} from '../../js/creation/independent-music-session.mjs';
function state(){let a=createAnimation({width:16,height:16,palette:['#000000']});const pixels=new Uint8Array(256);pixels[255]=1;a=writeAnimationCel(a,a.frames[0].id,a.layers[0].id,{width:16,height:16,pixels});const song=setAudioPixel(createAudioSong(),{trackId:'track-square',pitch:84,startTick:15*AUDIO_PIXEL_TICKS,noteId:'keep-note'});return createIndependentMusicState({musicAnimation:a,song});}
test('independent Music views preserve canonical notes, timing, hidden pixels and separate Undo',()=>{const original=state(),session=createIndependentMusicSession(original);assert.throws(()=>session.resizeView({width:8,height:8},{mode:'draw'}),/音楽モード/);session.resizeView({width:8,height:8},{mode:'audio'});assert.deepEqual(session.current.song,original.song);assert.equal(session.current.musicAnimation,original.musicAnimation);assert.equal(independentMusicViewport(session.current).pixels.length,64);session.resizeView({width:16,height:16},{mode:'audio'});assert.equal(independentMusicViewport(session.current).pixels[255],0);assert.ok(session.undo({mode:'audio'}));assert.equal(session.current.view.width,8);assert.ok(session.redo({mode:'audio'}));assert.deepEqual(session.current.song,original.song);assert.throws(()=>session.resizeView({height:17},{mode:'audio'}),/音程/);});
test('Draw resize/palette operations cannot mutate the independent Music state',()=>{const music=state(),before=JSON.stringify(music.song);let art=createAnimation({width:256,height:256});art=resizeAnimation(art,1028,1028);art=setAnimationPalette(art,['#ff0000']);assert.equal(art.width,1028);assert.equal(music.musicAnimation.width,16);assert.equal(JSON.stringify(music.song),before);});
test('Music budgets reject edits without changing current state',()=>{assert.throws(()=>createIndependentMusicSession(state(),{maxBytes:1}),/予算/);});
test('old unsupported music is not regenerated or silently discarded',async()=>{const project=setPxdJson(createPxdProject(),'audio/state.json',state().song);await assert.rejects(loadIndependentMusicState(project),/自動移行せず/);});
test('independent save fails closed without an old-reader boundary',async()=>{const art=createAnimation({width:16,height:16});const project=await writePxdAnimation(createPxdProject(),art,{role:'main'});await assert.rejects(writeIndependentMusicProject(project,state()),/旧版/);assert.equal(project.entries.some(e=>e.path==='audio/independent-grid.json'),false);});
test('1028 Draw and independent 16 Music save/reopen without shared dimension or palette mutation',async()=>{
 const music=state(),art=createAnimation({width:1028,height:1028,palette:['#ff0000']});
 let project=await writePxdAnimation(createPxdProject(),art,{role:'main',independentMusic:true});
 const mainBefore=JSON.stringify(getPxdJson(project,'animations/main/state.json'));
 project=await writeIndependentMusicProject(project,music);
 assert.equal(JSON.stringify(getPxdJson(project,'animations/main/state.json')),mainBefore);
 const decoded=await decodePxd(await encodePxd(project)),restored=await readIndependentMusicProject(decoded),restoredArt=await readPxdAnimation(decoded,'main');
 assert.equal(restoredArt.width,1028);assert.deepEqual(restoredArt.palette,art.palette);
 assert.equal(restored.musicAnimation.width,16);assert.deepEqual(restored.song,music.song);assert.deepEqual(restored.view,music.view);
 assert.deepEqual(independentMusicViewport(restored).pixels,independentMusicViewport(music).pixels);
 const reloaded=await loadIndependentMusicState(decoded);assert.deepEqual(reloaded.song,music.song);
});
test('exact legacy audio pages migrate without changing notes or pixel data',async()=>{
 const music=state();let project=await writePxdAnimation(createPxdProject(),music.musicAnimation,{role:'audio'});project=setPxdJson(project,'audio/state.json',music.song);
 const migrated=await loadIndependentMusicState(project);assert.deepEqual(migrated.song,music.song);assert.deepEqual(independentMusicViewport(migrated).pixels,independentMusicViewport(music).pixels);
});
