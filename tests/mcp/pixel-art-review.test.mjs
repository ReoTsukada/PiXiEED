import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewPixelArt} from '../../js/mcp/pixel-art-review.mjs';
const art={width:2,height:2,palette:['#CC2233','#123456'],rows:['01','..']};
test('review separates structural facts from unobserved visual quality',()=>{
 const r=reviewPixelArt({art});assert.equal(r.visual.status,'not_assessed');assert.equal(r.technical.usedColors,2);assert.equal(r.technical.opaquePixels,2);assert.deepEqual(r.correctionPlan,[]);assert.equal(r.technical.comparison,null);
});
test('RGBA comparison ignores reordered palettes but reports actual one-pixel edits',()=>{
 const reordered={...art,palette:['#123456','#CC2233'],rows:['10','..']};
 assert.equal(reviewPixelArt({art:reordered,before:art}).technical.comparison.changedPixels,0);
 const changed={...art,rows:['01','.0']};
 assert.deepEqual(reviewPixelArt({art:changed,before:art}).technical.comparison,{sameDimensions:true,changedPixels:1,changedPercent:25});
 const resized={width:1,height:1,palette:['#CC2233'],rows:['0']};
 assert.deepEqual(reviewPixelArt({art:resized,before:art}).technical.comparison,{sameDimensions:false,changedPixels:null,changedPercent:null});
});
test('observed problems route to corrective stages without claiming server inspection',()=>{
 const observations=[{category:'material',location:'器の縁',problem:'ガラスが不透明に見える'},{category:'shape',location:'右足',problem:'支持が読み取りにくい'}];
 const r=reviewPixelArt({art,observations,observationStatus:'observed',decision:'revise'});
 assert.equal(r.visual.status,'host_observed');assert.equal(r.correctionPlan.length,2);assert.equal(r.correctionPlan[0].returnTo,'材質と反射・透過');
 observations[0].problem='changed';assert.equal(r.visual.observations[0].problem,'ガラスが不透明に見える');
 assert.match(r.nextActions.join(' '),/MCP自身/);
});
test('malformed observations, invented assessment and mismatched conditions fail closed',()=>{
 for(const extra of [
  {decision:'passed'},{decision:'keep_current'},{decision:'keep_before',observationStatus:'observed'},
  {observations:[{category:'shape',location:'a',problem:'b'}]},
  {observationStatus:'observed',observations:[{category:'random',location:'a',problem:'b'}]},
  {observationStatus:'observed',observations:Array(9).fill({category:'shape',location:'a',problem:'b'})},
  {request:{subject:'other',width:16,height:16}},
  {unexpected:true}
 ])assert.throws(()=>reviewPixelArt({art,...extra}),TypeError);
});
