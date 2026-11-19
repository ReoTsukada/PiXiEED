import test from 'node:test';
import assert from 'node:assert/strict';
import {SpriteAtlas,SPRITE_BASE_SIZE,SPRITE_TILE_SIZE,SPRITE_METADATA} from '../src/sprites.mjs';
import {withCanvas} from './render-test-canvas.mjs';

test('fantasy actor and equipment source layers are authored at 32 × 32',()=>withCanvas(()=>{
  assert.equal(SPRITE_BASE_SIZE,32);assert.equal(SPRITE_TILE_SIZE,32);
  const atlas=new SpriteAtlas();
  for(const kind of ['player','slime','bat','skeleton','warden','boss']){
    const meta=SPRITE_METADATA[kind];assert.equal(meta.baseWidth,32);assert.equal(meta.baseHeight,32);
    for(let frame=0;frame<meta.frames;frame++)for(let direction=0;direction<8;direction++){
      const pose=atlas.get(kind,direction,frame);assert.equal(pose.baseSize,32);assert.equal(pose.scale,meta.scale);
      assert.equal(atlas.get(kind,direction,frame),pose,'poses must be cached');
    }
  }
  for(let digit=0;digit<10;digit++)for(let direction=0;direction<8;direction++)for(let phase=0;phase<3;phase++){
    const weapon=atlas.weapon(digit,direction,phase);assert.equal(weapon.baseSize,32);
    assert.equal(atlas.weapon(digit,direction,phase),weapon);
  }
  assert.ok(atlas.layers.size>150);
  for(const layer of atlas.layers.values()){
    assert.equal(layer.w,32);assert.equal(layer.h,32);
    assert.ok(layer.x+32<=atlas.sheet.width);assert.ok(layer.y+32<=atlas.sheet.height);
  }
  for(let digit=0;digit<10;digit++)assert.ok(atlas.layers.has(`weapon:${digit}`));
}));

test('the giant guardian uses the 32px source with an explicit size exception',()=>withCanvas(()=>{
  const atlas=new SpriteAtlas(),normal=atlas.get('player',0,0),boss=atlas.get('boss',0,3);
  assert.equal(normal.scale,1);assert.equal(boss.scale,2.5);assert.equal(boss.baseSize,32);
  assert.equal(atlas.get('boss',0,0),boss,'guardian has one source frame');
  const scaleCalls=boss.image.context.calls.filter(c=>c.method==='scale');
  assert.ok(scaleCalls.length>0&&scaleCalls.every(c=>c.args[0]===2.5));
}));

test('all five biomes have distinct terrain geometry and cached 32px terrain slices',()=>withCanvas(()=>{
  const atlas=new SpriteAtlas(),biomes=['meadow','desert','volcano','swamp','tundra'],signatures=[];
  for(const biome of biomes){
    const tile=atlas.tile(32,3,biome);assert.equal(tile.width,32);assert.equal(tile.height,32);assert.equal(atlas.tile(32,3,biome),tile);
    signatures.push(JSON.stringify(tile.context.calls.filter(c=>c.method==='fillRect').map(c=>c.args)));
    for(let variant=0;variant<6;variant++)for(const pillar of [false,true]){
      const wall=atlas.wall(32,variant,pillar,biome);assert.equal(wall.baseSize,32);assert.equal(wall.biome,biome);assert.equal(atlas.wall(32,variant,pillar,biome),wall);
    }
  }
  assert.equal(new Set(signatures).size,5,'biomes need different shapes, not only palette swaps');
  assert.equal(atlas.wall(32,0,true,'meadow').shape,'tree');
  assert.equal(atlas.wall(32,0,true,'desert').shape,'cactus');
  assert.equal(atlas.wall(32,0,true,'swamp').shape,'reeds');
  assert.equal(atlas.wall(32,0,true,'tundra').shape,'tree');
  for(const layer of atlas.layers.values()){assert.equal(layer.w,32);assert.equal(layer.h,32);assert.ok(layer.image);}
}));

test('twenty world monster identities render without atlas exhaustion, with five distinct boss recipes',()=>withCanvas(()=>{
  const atlas=new SpriteAtlas();
  const ordinary=['slime','goblin','wolf','scarab','sand_archer','sand_worm','ember_bat','fire_imp','lava_golem','bog_slime','spore_shaman','marsh_stalker','frost_wolf','ice_archer','ice_guardian'];
  const bosses=['elder_treant','dune_scorpion','cinder_drake','mire_hydra','frost_giant'];
  const signatures=[];
  for(const kind of [...ordinary,...bosses]){
    const meta=SPRITE_METADATA[kind];assert.equal(meta.baseWidth,32);assert.equal(meta.baseHeight,32);
    for(let frame=0;frame<meta.frames;frame++)for(let direction=0;direction<8;direction++)assert.equal(atlas.get(kind,direction,frame).baseSize,32);
    if(bosses.includes(kind)){assert.equal(meta.scale,2.5);const stack=atlas.stack(kind,0);signatures.push(stack.layers.map(x=>x.z).join(','));}
  }
  assert.equal(new Set(signatures).size,5,'boss height and anatomy stacks must differ');
  assert.ok(atlas.pages.length>=2,'atlas should grow in bounded pages');
  for(const layer of atlas.layers.values()){
    assert.equal(layer.w,32);assert.equal(layer.h,32);assert.ok(atlas.pages.includes(layer.image));
    assert.ok(layer.x+32<=layer.image.width&&layer.y+32<=layer.image.height);
  }
}));

test('loot icons distinguish currency, materials, equipment slots and consumable types',()=>withCanvas(()=>{
  const atlas=new SpriteAtlas(),variants=[['gold',''],['material',''],['equipment','armor'],['equipment','boots'],['equipment','charm'],['consumable','healing_draught'],['consumable','ward_scroll']];
  const images=new Set();
  for(const [kind,variant] of variants){const icon=atlas.loot(kind,variant);assert.equal(icon.baseSize,32);assert.equal(icon.image.width,32);assert.equal(atlas.loot(kind,variant),icon);images.add(icon.image);}
  assert.equal(images.size,7);
}));
