import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument, strokePixels, floodFill } from '../../js/creation/draw-core.mjs';
import { symmetryTransforms, symmetryPoint, symmetryPoints } from '../../js/creation/drawing-symmetry.mjs';
import { drawShapePixels, sprayPixels, selectionBounds } from '../../js/creation/draw-tool-operations.mjs';
import { lassoDrawSelection } from '../../js/creation/draw-selection-input.mjs';
import { rasterizeTextMask } from '../../js/creation/draw-text.mjs';
test('1028 actual pen strokes accept all 16 symmetry flag combinations at partial tile edges',()=>{
 const names=['horizontal','vertical','diagonalDown','diagonalUp'];
 for(let bits=0;bits<16;bits++){
  const flags=Object.fromEntries(names.map((n,i)=>[n,Boolean(bits&(1<<i))]));const doc=createDrawDocument(1028);
  for(const n of [0,1023,1024,1027]){const from={x:n,y:1027},to={x:n,y:1026};for(const m of symmetryTransforms(flags))strokePixels(doc,symmetryPoint(from,1028,1028,m),symmetryPoint(to,1028,1028,m),0,{trusted:true,brushSize:1,brushTransform:m});for(const p of symmetryPoints(from,1028,1028,flags))assert.equal(doc.pixels[p.y*1028+p.x],0);}
 }
 assert.throws(()=>symmetryPoints({x:0,y:0},1029,1),RangeError);
});
test('1028 shape/spray/fill/selection boundaries retain the final four columns',()=>{
 for(const shape of ['rectangle','ellipse']){const doc=createDrawDocument(1028);drawShapePixels(doc,{x:1024,y:1024},{x:1027,y:1027},0,{shape});assert.ok(doc.pixels.slice(1024*1028).some(v=>v===0));}
 const doc=createDrawDocument(1028);sprayPixels(doc,{x:1027,y:1027},{x:1027,y:1027},0,{radius:1,random:()=>0.5});const mask=new Uint8Array(1028*1028);mask[1028*1028-1]=1;floodFill(doc,1027,1027,1,{mask});assert.equal(doc.pixels.at(-1),1);
 assert.deepEqual(selectionBounds({x:1024,y:1024},{x:1027,y:1027},1028,1028),{x:1024,y:1024,width:4,height:4});const lasso=lassoDrawSelection([{x:1024,y:1024},{x:1028,y:1024},{x:1028,y:1028},{x:1024,y:1028}],1028,1028);assert.equal(lasso.mask.at(-1),1);
});
test('1028 text canvas permits edge placement while retaining text length limit',()=>{
 const rgba=new Uint8ClampedArray(1028*1028*4);rgba[rgba.length-1]=255;const context={clearRect(){},fillText(){},getImageData(){return {data:rgba};}};const documentRef={createElement(){return {getContext(){return context;}};}};
 const mask=rasterizeTextMask({text:'T',width:1028,height:1028,x:1027,y:1027,documentRef});assert.equal(mask.at(-1),255);assert.throws(()=>rasterizeTextMask({text:'T'.repeat(257),width:1028,height:1028,documentRef}),RangeError);
});
