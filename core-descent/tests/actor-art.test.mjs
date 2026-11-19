import test from 'node:test';
import assert from 'node:assert/strict';
import {paintActorLayers} from '../src/actor-art.mjs';
import {SPRITE_METADATA} from '../src/sprites.mjs';

function record(kind,frame=0){
 const layers=[];
 const found=paintActorLayers(kind,frame,(z,name,paint)=>{
  const pixels=[];
  const ctx={fillStyle:'#000',fillRect(x,y,w,h){pixels.push([x,y,w,h,this.fillStyle]);}};
  paint(ctx);layers.push({z,name,pixels});
 });
 return {found,layers};
}

test('every actor supplies finite integer pixels inside its 32px source slices',()=>{
 for(const [kind,meta] of Object.entries(SPRITE_METADATA)){
  if(kind==='weapon')continue;
  for(let frame=0;frame<meta.frames;frame++){
   const art=record(kind,frame);
   assert.equal(art.found,true,kind);assert.ok(art.layers.length>0,kind);
   assert.equal(new Set(art.layers.map(l=>l.name)).size,art.layers.length,`${kind}: duplicate slice cache key`);
   for(const layer of art.layers){
    assert.ok(Number.isInteger(layer.z)&&layer.z>=1&&layer.z<=34,`${kind}: projected height`);
    for(const [x,y,w,h,color] of layer.pixels){
     assert.ok([x,y,w,h].every(Number.isInteger),`${kind}: source pixel alignment`);
     assert.ok(w>0&&h>0&&x>=-16&&y>=-16&&x+w<=16&&y+h<=16,`${kind}: source bounds`);
     assert.match(color,/^#[0-9a-f]{6}$/i,`${kind}: explicit opaque palette`);
    }
   }
  }
 }
});

test('original actor recipes are repeatable and reject unknown species',()=>{
 const kinds=Object.keys(SPRITE_METADATA).filter(kind=>kind!=='weapon');
 const signatures=new Set();
 for(const kind of kinds){
  const art=record(kind,1);
  assert.deepEqual(art,record(kind,1));
  signatures.add(JSON.stringify(art.layers));
 }
 assert.equal(signatures.size,kinds.length,'different species must not silently share a fallback silhouette');
 assert.deepEqual(record('misspelled-monster'),{found:false,layers:[]});
});
