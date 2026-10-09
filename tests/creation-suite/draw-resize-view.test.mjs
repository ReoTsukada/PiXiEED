import test from 'node:test';
import assert from 'node:assert/strict';
import { resizeDrawView } from '../../js/creation/draw-resize-view.mjs';

const initial = () => ({ mirrorOrigin: { x: .25, y: .75 }, zoom: 2, panX: 10, panY: 20, cursor: { x: 1.5, y: 2.5 },
  selection: { x: 1, y: 1, width: 2, height: 2, pivot: { x: 2, y: 2 }, mask: Uint8Array.from([0,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,0]) } });
test('sprite scaling follows nearest pixel membership including sparse holes and transparent selection', () => {
  const before = initial(), after = resizeDrawView(before, 4, 4, 8, 8, { resample: 'nearest' });
  assert.deepEqual([after.selection.x,after.selection.y,after.selection.width,after.selection.height], [2,2,4,4]);
  for (let y=0;y<8;y++) for(let x=0;x<8;x++) assert.equal(after.selection.mask[y*8+x],before.selection.mask[Math.floor(y/2)*4+Math.floor(x/2)]);
  assert.deepEqual(after.selection.pivot,{x:4,y:4}); assert.deepEqual(after.cursor,{x:3,y:5});
  assert.deepEqual(after.mirrorOrigin,before.mirrorOrigin); assert.deepEqual([after.zoom,after.panX,after.panY],[1,0,0]);
  assert.equal(before.selection.mask.length,16); assert.equal(before.zoom,2);
});
test('padding and crop translate membership and pivot without scaling pixels or filling holes',()=>{
  const before=initial(), padded=resizeDrawView(before,4,4,6,6);
  assert.deepEqual(padded.selection.pivot,{x:3,y:3});assert.deepEqual(padded.cursor,{x:2.5,y:3.5});
  assert.equal(padded.selection.mask.filter(Boolean).length,2);assert.equal(padded.selection.mask[2*6+3],0);
  const restored=resizeDrawView(padded,6,6,4,4); assert.deepEqual(restored.selection,before.selection);
  const cropped=resizeDrawView(before,4,4,1,1);assert.deepEqual([...cropped.selection.mask],[1]);
  assert.deepEqual(cropped.selection.pivot,{x:0,y:0});
});
test('shrinking uses destination pixel centers and removes a selection if no sample survives',()=>{
  const before=initial(), after=resizeDrawView(before,4,4,2,2,{resample:'nearest'});
  assert.deepEqual([...after.selection.mask],[1,0,0,0]); assert.deepEqual(after.selection.pivot,{x:1,y:1});
  before.selection.mask.fill(0);before.selection.mask[0]=1;
  assert.equal(resizeDrawView(before,4,4,2,2,{resample:'nearest'}).selection,null);
});
test('rectangular selection becomes a correctly sized full-canvas mask; empty state stays empty',()=>{
  const before=initial();before.selection={x:1,y:1,width:2,height:2};
  const after=resizeDrawView(before,4,4,40,40,{resample:'nearest'});assert.equal(after.selection.mask.filter(Boolean).length,400);
  assert.deepEqual([after.selection.x,after.selection.y,after.selection.width,after.selection.height],[10,10,20,20]);
  before.selection=null;before.cursor=null;const empty=resizeDrawView(before,4,4,8,8,{resample:'nearest'});assert.equal(empty.selection,null);assert.equal(empty.cursor,null);
});
