import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {estimateSharedMusicRetainedBytes} from '../../js/creation/draw-music-model.mjs';
import {createAnimation,writeAnimationCel} from '../../js/creation/animation-core.mjs';
test('known empty shared music is measured, shared animation tiles are not double charged',()=>{
 const art=createAnimation({width:1028,height:1028}),song={tracks:[],tempo:120};
 const a=estimateSharedMusicRetainedBytes({states:[{song,musicAnimation:art}],artTimelines:[art]});
 assert.ok(a>0&&a<65536);assert.equal(estimateSharedMusicRetainedBytes({states:[{song,musicAnimation:art},{song,musicAnimation:art}],artTimelines:[art]})-a,1024);
});
test('detached music pages, old song clones, project bytes and signature are included',()=>{
 const art=createAnimation({width:16,height:16}),pixels=new Uint8Array(256).fill(1),music=writeAnimationCel(art,art.frames[0].id,art.layers[0].id,{width:16,height:16,pixels});
 const base=estimateSharedMusicRetainedBytes({artTimelines:[art]});
 const measured=estimateSharedMusicRetainedBytes({states:[{song:{notes:[{pitch:60}]},originalSong:{notes:[{pitch:60}]},musicAnimation:music}],artTimelines:[art],project:{entries:[{path:'audio/state.json',bytes:new Uint8Array(4096)}]},signature:'12345'});
 assert.ok(measured>base+4096+512+10);assert.equal(estimateSharedMusicRetainedBytes({artTimelines:[art],signature:'12345'})-base,10);
});
test('unknown estimate keeps fallback but invalid/failed estimate blocks the camera budget',()=>{
 const source=fs.readFileSync(new URL('../../js/creation/draw-page.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('function retainedMusicBytes() {'),source.indexOf('\nconst animationRenderCache'));
 const run=callback=>new Function('musicMemoryEstimator',`${body};return retainedMusicBytes();`)(callback);
 assert.equal(run(null),16*1024*1024);assert.equal(run(()=>null),16*1024*1024);assert.equal(run(()=>20000),20000);
 for(const callback of [()=>Infinity,()=>NaN,()=>-1,()=>{throw Error('failed')}])assert.ok(run(callback)>64*1024*1024);
});

test('legacy audio animation backups remain charged',()=>{
 for(const path of ['animations/legacy/alpha-upgrade-audio-v1/state.json','animations/audio-legacy-editor/state.json','images/audio-legacy-editor/source.png']){
  const base=estimateSharedMusicRetainedBytes();assert.equal(estimateSharedMusicRetainedBytes({project:{entries:[{path,bytes:new Uint8Array(8192)}]}})-base,8192+512);
 }
});
