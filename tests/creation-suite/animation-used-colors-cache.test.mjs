import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnimation,addAnimationFrame,writeAnimationCel,getAnimationUsedColorIndices,ensureAnimationMusicLayer,setAnimationDrawRewardBonusColors} from '../../js/creation/animation-core.mjs';

test('used colors stay detached across repeated reads and immutable pixel revisions',()=>{
 let a=createAnimation({width:2,height:1,palette:['#123456','#abcdef']});
 const frame=a.frames[0].id,layer=a.layers[0].id;
 a=writeAnimationCel(a,frame,layer,{width:2,height:1,pixels:[1,0]});
 const first=getAnimationUsedColorIndices(a),expected=[...first];
 first.clear();first.add(77);
 assert.deepEqual([...getAnimationUsedColorIndices(a)],expected);
 const edited=writeAnimationCel(a,frame,layer,{width:2,height:1,pixels:[2,2]});
 assert.deepEqual([...getAnimationUsedColorIndices(edited)],[1]);
 assert.deepEqual([...getAnimationUsedColorIndices(a)],expected,'undo can reuse the older snapshot safely');
 setAnimationDrawRewardBonusColors(a,['#123456ff']);
 assert.deepEqual([...getAnimationUsedColorIndices(a)],expected,'ownership metadata does not change used pixel indices');
});

test('whole timeline and changing exclusions never contaminate each other or hide invalid targets',()=>{
 let a=createAnimation({width:2,height:1,palette:['#123456','#abcdef']});
 const first=a.frames[0].id,layer=a.layers[0].id;
 a=writeAnimationCel(a,first,layer,{width:2,height:1,pixels:[1,1]});
 a=addAnimationFrame(a,{copy:false});const second=a.frames[1].id;
 a=writeAnimationCel(a,second,layer,{width:2,height:1,pixels:[2,2]});
 const all=[...getAnimationUsedColorIndices(a)];
 for(let i=0;i<5;i++){
  const left=getAnimationUsedColorIndices(a,{excludeFrameId:first,excludeLayerId:layer});
  assert.deepEqual([...left],[1]);left.add(99);
  assert.deepEqual([...getAnimationUsedColorIndices(a,{excludeFrameId:second,excludeLayerId:layer})],[0]);
  assert.deepEqual([...getAnimationUsedColorIndices(a)],all);
 }
 assert.throws(()=>getAnimationUsedColorIndices(a,{excludeFrameId:first}),/両方/);
 assert.throws(()=>getAnimationUsedColorIndices(a,{excludeFrameId:'missing',excludeLayerId:layer}),/フレーム/);
});

test('music exclusion still excludes its shared cel on every frame after repeated reads',()=>{
 let a=ensureAnimationMusicLayer(createAnimation({width:2,height:1,palette:['#123456','#abcdef']}));
 const music=a.layers.find(l=>l.role==='music').id,art=a.layers.find(l=>l.role!=='music').id;
 a=writeAnimationCel(a,a.frames[0].id,music,{width:2,height:1,pixels:[2,2]});
 a=writeAnimationCel(a,a.frames[0].id,art,{width:2,height:1,pixels:[1,1]});
 a=addAnimationFrame(a,{copy:true});
 for(let i=0;i<4;i++){
  assert.deepEqual([...getAnimationUsedColorIndices(a,{excludeFrameId:a.frames[i%2].id,excludeLayerId:music})],[0]);
  assert.deepEqual([...getAnimationUsedColorIndices(a)].sort(),[0,1]);
 }
});
