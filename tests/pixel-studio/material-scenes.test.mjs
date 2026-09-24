import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';

function source(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) data.set([...color(x,y),255],(y*width+x)*4);
  return {width,height,data};
}
const rgbAt=(frame,x,y)=>Array.from(frame.data.slice((y*frame.width+x)*4,(y*frame.width+x)*4+3)).join(',');

test('disconnected similar-hue surfaces keep their own local shade colors without AI',()=>{
  const skin=[[150,112,90],[180,138,112],[210,172,145]];
  const wood=[[72,55,43],[93,72,58],[115,91,74]];
  const frame=source(15,9,(x,y)=>x<6?skin[Math.floor(y/3)]:x>8?wood[Math.floor(y/3)]:[12,12,12]);
  const renderer=createObjectRenderer({size:15,colors:48,shading:'three-tone'});
  const result=renderer.render(frame);
  const skinSet=new Set(skin.map(c=>c.join(','))),woodSet=new Set(wood.map(c=>c.join(',')));
  for(let y=0;y<9;y++) for(let x=0;x<15;x++) {
    if(x<6) assert.ok(skinSet.has(rgbAt(result,x,y)), 'skin must not borrow a brown surface color across the gap');
    if(x>8) assert.ok(woodSet.has(rgbAt(result,x,y)), 'the other surface must not borrow a skin tone');
  }
  const stable=renderer.render(frame);
  assert.deepEqual(stable.data,result.data,'an identical scene has no tone changes');
});

test('pale warm skin and saturated orange clothing do not use each other’s colors',()=>{
  const skin=[[170,138,115],[195,163,142],[220,191,170]];
  const cloth=[[120,47,15],[174,75,30],[220,106,48]];
  const frame=source(12,9,(x,y)=>x<6?skin[Math.floor(y/3)]:cloth[Math.floor(y/3)]);
  const result=createObjectRenderer({size:12,colors:48,shading:'three-tone'}).render(frame);
  for(let y=0;y<9;y++) {
    assert.ok(new Set(skin.map(c=>c.join(','))).has(rgbAt(result,5,y)));
    assert.ok(new Set(cloth.map(c=>c.join(','))).has(rgbAt(result,6,y)));
  }
});

test('small contrast between adjacent object masks is not averaged away',()=>{
  const frame=source(8,4,x=>x<4?[100,100,100]:[108,108,108]);
  const labels=new Uint32Array(32).map((_,i)=>i%8<4?4294967294:4294967295);
  const result=createObjectRenderer({size:8,colors:48,shading:'three-tone'}).render(frame,{width:8,height:4,labels});
  assert.equal(rgbAt(result,3,1),'100,100,100');
  assert.equal(rgbAt(result,4,1),'108,108,108');
  assert.deepEqual(result.labels,labels,'large object IDs stay distinct and unchanged');
});
