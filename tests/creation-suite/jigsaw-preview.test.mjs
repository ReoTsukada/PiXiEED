import test from 'node:test';
import assert from 'node:assert/strict';
import { fitJigsawPreview } from '../../js/creation/jigsaw-preview.mjs';
for (const [name, bounds] of [['phone',{left:8,right:312,top:64,bottom:478}],['landscape',{left:8,right:836,top:64,bottom:308}],['desktop',{left:8,right:1272,top:64,bottom:718}]]) {
  for (const aspect of [0.25,1,4]) test(`${name}, aspect ${aspect}: resize preserves ratio and keeps controls in bounds`,()=>{
    for (const width of [-1,128,196,520,10000]) {
      const r=fitJigsawPreview({width,aspect,left:99999,top:-900,bounds});
      assert.ok(r.left>=bounds.left && r.left+r.width<=bounds.right+0.001);
      assert.ok(r.top>=bounds.top && r.top+r.height<=bounds.bottom+0.001);
      assert.ok(Math.abs(r.contentWidth/r.contentHeight-aspect)<0.001);
      assert.ok(r.width>=128 && r.width<=520); assert.ok(r.height>=110);
    }
  });
}
test('invalid numeric preferences use finite defaults',()=>{
 const r=fitJigsawPreview({width:NaN,aspect:NaN,left:NaN,top:NaN,bounds:{left:8,right:382,top:64,bottom:750}});
 assert.equal(r.width,196); assert.equal(r.contentWidth/r.contentHeight,1); assert.equal(r.top,64);
});

test('extremely tall image fits with sub-pixel width and can shrink inside control shell',()=>{
 const bounds={left:8,right:836,top:64,bottom:308};
 const large=fitJigsawPreview({width:520,aspect:0.001,bounds});
 const small=fitJigsawPreview({width:large.minWidth,aspect:0.001,bounds});
 assert.equal(large.width,128);assert.equal(small.width,128);
 assert.ok(large.contentWidth<1 && small.contentWidth<large.contentWidth);
 assert.ok(large.top+large.height<=bounds.bottom+0.001);
 assert.ok(Math.abs(large.contentWidth/large.contentHeight-0.001)<0.000001);
});
