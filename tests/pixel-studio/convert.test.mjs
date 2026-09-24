import test from 'node:test';
import assert from 'node:assert/strict';
import {convert} from '../../js/pixel-studio/convert.mjs';
const image=(w,h,fn)=>({width:w,height:h,data:Uint8ClampedArray.from({length:w*h*4},(_,i)=>fn(Math.floor(i/4)%w,Math.floor(i/4/w))[i%4])});
test('flat colors and hard boundaries never acquire averaged fringe colors',()=>{
 const src=image(192,96,x=>x<96?[240,30,40,255]:[15,200,220,255]);
 const out=convert(src,{size:96,colors:16});
 assert.equal(out.width,96);assert.equal(out.height,48);
 assert.deepEqual(new Set(out.palette.map(String)),new Set(['240,30,40','15,200,220']));
 for(let y=0;y<48;y++)for(let x=0;x<96;x++)assert.deepEqual([...out.data.slice((y*96+x)*4,(y*96+x)*4+3)],x<48?[240,30,40]:[15,200,220]);
});
test('color cap, determinism, dimensions and immutable input',()=>{
 const src=image(191,97,(x,y)=>[(x*13+y*11)%256,(x*7+y*17)%256,(x+y*3)%256,255]),copy=src.data.slice();
 const out=convert(src,{size:96,colors:16}),again=convert(src,{size:96,colors:16});
 assert.ok(out.palette.length<=16);assert.equal(out.width,96);assert.equal(out.height,49);
 assert.deepEqual(out.data,again.data);assert.deepEqual(src.data,copy);
 for(let i=0;i<out.indices.length;i++)assert.deepEqual([...out.data.slice(i*4,i*4+3)],out.palette[out.indices[i]]);
});
test('ordered dither changes coverage without making new colors',()=>{
 const src=image(320,64,(x)=>[x*255/319,x*255/319,x*255/319,255]);
 const out=convert(src,{size:320,style:'dither',palette:'grayscale',colors:4});
 assert.equal(out.width,320);assert.equal(out.palette.length,4);
 for(let i=0;i<out.data.length;i+=4){assert.equal(out.data[i],out.data[i+1]);assert.equal(out.data[i],out.data[i+2]);assert.ok([0,85,170,255].includes(out.data[i]));}
 assert.deepEqual(out.data,convert(src,{size:320,style:'dither',palette:'grayscale',colors:4}).data);
});
test('tiny and transparent images remain valid; malformed frames rejected',()=>{
 const out=convert(image(1,1,()=>[99,0,0,0]),{size:128,colors:2});
 assert.deepEqual([...out.data],[255,255,255,255]);
 assert.throws(()=>convert({width:2,height:2,data:new Uint8Array(1)}));
 const bad=convert(image(2,2,()=>[50,60,70,255]),{size:Infinity,colors:NaN,simplify:NaN});
 assert.equal(bad.width,2);assert.ok(bad.data.every(Number.isFinite));
});

test('fixed palettes honor the requested maximum and Bayer phase remains stable',()=>{
 const opts={size:64,style:'dither',palette:'grayscale',colors:4};
 const before=convert(image(64,16,()=>[126,126,126,255]),opts);
 const after=convert(image(64,16,()=>[129,129,129,255]),opts);
 let changes=0;for(let i=0;i<before.indices.length;i++)changes+=before.indices[i]!==after.indices[i];
 assert.ok(changes<before.indices.length/4,'small brightness changes must not invert the entire pattern');
 const result=convert(image(64,64,(x,y)=>[x*4,y*4,(x+y)*2,255]),{palette:'pico8',colors:8});
 assert.ok(result.palette.length<=8);
});
