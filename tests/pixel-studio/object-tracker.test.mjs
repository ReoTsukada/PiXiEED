import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectTracker } from '../../js/pixel-studio/object-tracker.mjs';
const width=48,height=48;
function frame(color=80) { return {width,height,data:Uint8ClampedArray.from({length:width*height*4},(_,i)=>i%4===3?255:color)}; }
function instance(id=1, x=10, y=10, size=16) {
  const mask=new Uint8Array(width*height);
  for(let yy=y;yy<y+size;yy++)for(let xx=x;xx<x+size;xx++) mask[yy*width+xx]=1;
  return {id,score:.95,mask};
}
const segmentation=(instances)=>({width,height,instances});
test('small motion preserves ID regardless of proposal ID',()=>{
 const tracker=createObjectTracker();
 const first=tracker.track(segmentation([instance(1)]),frame(),{timestamp:10});
 const second=tracker.track(segmentation([instance(99,12)]),frame(82),{timestamp:510});
 assert.equal(second.instances[0].id,first.instances[0].id);
 assert.equal(second.matchedCount,1);
});
test('scene cut, reset, disappearance and long gap do not reuse stale identities',()=>{
 const tracker=createObjectTracker();
 const first=tracker.track(segmentation([instance()]),frame(),{timestamp:10});
 const cut=tracker.track(segmentation([instance()]),frame(220),{timestamp:510});
 assert.notEqual(cut.instances[0].id,first.instances[0].id); assert.equal(cut.resetReason,'scene-cut');
 tracker.track(segmentation([]),frame(220),{timestamp:1010});
 const returned=tracker.track(segmentation([instance()]),frame(220),{timestamp:1510});
 assert.notEqual(returned.instances[0].id,cut.instances[0].id);
 const stale=tracker.track(segmentation([instance()]),frame(220),{timestamp:33010});
 assert.notEqual(stale.instances[0].id,returned.instances[0].id); assert.equal(stale.resetReason,'time-gap');
 tracker.reset();
 const reset=tracker.track(segmentation([instance()]),frame(220),{timestamp:33510});
 assert.notEqual(reset.instances[0].id,stale.instances[0].id);
});
test('ambiguous proposals get new identities without mutating input',()=>{
 const tracker=createObjectTracker(), input=instance();
 const first=tracker.track(segmentation([input]),frame(),{timestamp:10});
 const second=tracker.track(segmentation([instance(12),instance(13)]),frame(),{timestamp:510});
 assert.equal(second.matchedCount,0); assert.notEqual(second.instances[0].id,first.instances[0].id);
 assert.notEqual(second.instances[0].id,second.instances[1].id); assert.equal(input.id,1);
 assert.throws(()=>tracker.track(segmentation([instance(1),instance(1)]),frame()));
});
