import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';
import { createGlobalPalette } from '../../js/pixel-studio/global-palette.mjs';
import { grayLight } from '../../js/pixel-studio/global-tones.mjs';

function frame(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([...colorAt(x,y),255], (y*width+x)*4);
  return {width,height,data};
}
function renderer(size, session, surfaces = true) {
  return createObjectRenderer({size,colors:24,shading:'three-tone',paletteSession:session,
    dither:'ordered',simplifySurfaces:true,surfaceSmoothing:surfaces,surfaceTones:surfaces});
}
function noise(x,y) {
  let n = Math.imul(x+177,y+345)^Math.imul(x+9,1013904223)^Math.imul(y+13,1664525);
  n = Math.imul(n^(n>>>16),2246822507);
  return (n>>>0)%41-20;
}
function roughness(result) {
  let squared = 0, count = 0;
  const light = cell => grayLight(...result.data.subarray(cell*4,cell*4+3));
  for (let y=5;y<result.height-5;y++) for(let x=Math.floor(result.width*.2);x<result.width-5;x++) {
    const cell=y*result.width+x;let mean=0;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)mean+=light(cell+dy*result.width+dx)/25;
    squared+=(light(cell)-mean)**2;count++;
  }
  return Math.sqrt(squared/count);
}
function assertOutput(result) {
  assert.ok(result.palette.length <= 48);
  for(let cell=0;cell<result.indices.length;cell++) {
    assert.deepEqual([...result.data.subarray(cell*4,cell*4+3)],result.palette[result.indices[cell]]);
    assert.equal(result.data[cell*4+3],255);
  }
}

test('grainy planes improve at 64px and 128px without changing the captured base colors', () => {
  const input=frame(256,192,(x,y)=>{
    if(x<30)return[178,185,171];if(x<34)return[220,220,210];
    if(x===120&&y>50&&y<160)return[24,24,24];
    const l=Math.round(90+y*.27+noise(x>>1,y>>1));return[l,l+2,l+1];
  });
  for(const size of [64,128]) {
    const session=createGlobalPalette({toneLevels:8,saturation:1.25});
    const before=renderer(size,session,false).render(input);
    const draw=renderer(size,session), after=draw.render(input);
    assert.ok(roughness(after)<roughness(before)*.8,`roughness ${roughness(before)} -> ${roughness(after)}`);
    assert.deepEqual(after.palette.slice(0,before.palette.length),before.palette);
    assert.ok(after.stats.simplifiedTextureCells>0);
    assert.ok(after.stats.maxSurfaceColors<=5);
    assert.deepEqual(draw.render(input).data,after.data,'stationary output is identical');
    assertOutput(after);
  }
});

test('hard object boundaries retain their own hues and protected one-pixel features retain their colors', () => {
  const width=64,height=48;
  const input=frame(width,height,(x,y)=>x===12&&y>8&&y<32?[20,20,20]:x<32?[155+y/2,118+y/2,95+y/2]:[80+y/2,140+y/2,164+y/2]);
  const mask={width,height,labels:Uint32Array.from({length:width*height},(_,i)=>i%width<32?1:2)};
  const protectedCells=new Uint8Array(width*height);
  for(let y=9;y<32;y++)protectedCells[y*width+12]=1;
  const session=createGlobalPalette({toneLevels:8});
  const before=renderer(width,session,false).render(input,mask,{protectedCells});
  const after=renderer(width,session).render(input,mask,{protectedCells});
  assert.deepEqual(after.labels,mask.labels);
  for(let cell=0;cell<protectedCells.length;cell++)if(protectedCells[cell]) {
    assert.deepEqual(after.data.subarray(cell*4,cell*4+3),before.data.subarray(cell*4,cell*4+3));
  }
  for(let y=2;y<height-2;y++)for(const x of [30,31,32,33]) {
    const color=after.palette[after.indices[y*width+x]];
    assert.ok(x<32?color[0]>color[2]:color[2]>color[0], 'the boundary pixel keeps its own material hue');
  }
  assertOutput(after);
});

test('a moved compact light and a replaced surface leave no old-pixel residue', () => {
  const night = cx => frame(64,48,(x,y)=>{
    const d=Math.max(Math.abs(x-cx)-1,Math.abs(y-24)-1);
    return d<=0?[255,232,184]:d===1?[230,178,108]:d===2?[166,128,78]:d===3?[101,77,48]:[50,39,25];
  });
  const session=createGlobalPalette({toneLevels:8});
  const draw=renderer(64,session);
  const first=draw.render(night(18));
  const moved=draw.render(night(45));
  const fresh=renderer(64,session).render(night(45));
  assert.deepEqual(moved.data,fresh.data);
  assert.ok(grayLight(...moved.data.subarray((24*64+45)*4,(24*64+45)*4+3))>=210);
  assert.ok(first.stats.suppressedHaloCells>0);
  const replacement=frame(64,48,()=>[130,142,152]);
  assert.deepEqual(draw.render(replacement).data,renderer(64,session).render(replacement).data);
});

test('reset, dimensions, and palette recapture discard the surface history', () => {
  const session=createGlobalPalette({toneLevels:8});
  const draw=renderer(64,session);
  const first=frame(64,48,(x,y)=>[100+noise(x,y),104+noise(x,y),102+noise(x,y)]);
  draw.render(first);
  draw.reset();
  assert.deepEqual(draw.render(first).data,renderer(64,session).render(first).data);
  const resized=frame(96,64,()=>[170,122,90]);
  assert.deepEqual(draw.render(resized).data,renderer(64,session).render(resized).data);
  session.clear();
  const refreshed=draw.render(resized);
  const newSnapshot=session.get();
  assert.deepEqual(refreshed.palette.slice(0,newSnapshot.palette.length),newSnapshot.palette);
  assert.equal(refreshed.stats.paletteRevision,newSnapshot.revision);
  assertOutput(refreshed);
});


test('small sensor jitter holds planar tones but cumulative exposure still advances', () => {
  const size=64;
  const input=shift=>frame(size,48,(x,y)=>{
    const l=95+y*1.2+shift;return [l+9,l+4,l];
  });
  const session=createGlobalPalette({toneLevels:8});
  const draw=renderer(size,session);
  const initial=draw.render(input(0));
  for(const shift of [1,-1,2,-2,0]) {
    const next=draw.render(input(shift));
    // Image margins have no full 5x5 neighborhood; interior planes remain stable.
    for(let y=4;y<44;y++)for(let x=4;x<60;x++) {
      const p=(y*size+x)*4;
      assert.deepEqual(next.data.subarray(p,p+3),initial.data.subarray(p,p+3));
    }
  }
  let later;
  for(let shift=1;shift<=30;shift++)later=draw.render(input(shift));
  assert.notDeepEqual(later.data,initial.data,'gradual exposure changes cannot freeze the old tone');
  const changed=input(70);
  draw.render(changed);
  assert.deepEqual(draw.render(changed).data,renderer(size,session).render(changed).data);
});


test('late AI object masks do not punch a different tone into an unchanged planar surface', () => {
  const width=64,height=48,input=frame(width,height,()=>[105,112,118]);
  const session=createGlobalPalette({toneLevels:8});
  const draw=renderer(width,session),initial=draw.render(input);
  const labels=new Uint32Array(width*height);
  for(let y=10;y<38;y++)for(let x=20;x<44;x++)labels[y*width+x]=5;
  const next=draw.render(input,{width,height,labels});
  assert.deepEqual(next.labels,labels);
  assert.deepEqual(next.data,initial.data);
});

test('a moving low-contrast edge is refreshed rather than leaving a held outline', () => {
  const scene = left => frame(64,48,(x,y)=>x<left?[112,112,112]:[128,128,128]);
  const session=createGlobalPalette({toneLevels:8});
  const draw=renderer(64,session);
  const initial=draw.render(scene(20));
  const moved=draw.render(scene(38));
  const fresh=renderer(64,session).render(scene(38));
  assert.notDeepEqual(moved.data,initial.data,'the edge exercises two visibly distinct tones');
  assert.deepEqual(moved.data,fresh.data,'moving edge matches the current frame without retained pixels');
});
