import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMap } from '../src/map.mjs';
import { buildScenery, sceneryTileVariant, paintSceneryFloor, sceneryPropSprite, sceneryMotePosition, SCENERY_MOTIFS } from '../src/scenery.mjs';
import { DungeonRenderer, Y_SCALE } from '../src/renderer.mjs';
import { createExploration,updateExploration } from '../src/fog.mjs';
import { TestCanvas, withCanvas } from './render-test-canvas.mjs';

test('scenic rooms are deterministic and leave navigation, hazards and map RNG state untouched',()=>{
  for(const floor of [1,6,11,16,21])for(const seed of [10,712,9999]){
    const map=makeMap(seed,floor),before=JSON.stringify(map),a=buildScenery(map),b=buildScenery(map);
    assert.deepEqual(a,b);assert.equal(JSON.stringify(map),before);
    assert.equal(a.patches.length,map.rooms.length*3);
    assert.ok(a.landmarks.length>0);assert.ok(a.props.length>0);
    assert.ok(a.props.length<=map.rooms.length*4);assert.ok(a.motes.length<=map.rooms.length*6);
    assert.ok(a.landmarks.every(l=>SCENERY_MOTIFS[a.biome].includes(l.name)));
    for(const prop of a.props){
      assert.equal(map.cells[Math.floor(prop.y/map.tile)]?.[Math.floor(prop.x/map.tile)],0);
      assert.ok([map.portal,map.stairs].every(g=>Math.hypot(prop.x-g.x,prop.y-g.y)>40));
      assert.ok(map.hazards.every(h=>Math.hypot(prop.x-h.x,prop.y-h.y)>h.radius+18));
      assert.ok(map.rooms.some(room=>prop.x>(room.x+1)*map.tile&&prop.x<(room.x+room.w-1)*map.tile&&prop.y>(room.y+1)*map.tile&&prop.y<(room.y+room.h-1)*map.tile));
    }
  }
});

test('terrain tone stays coherent over adjacent tiles without eliminating texture variation',()=>{
  const map=makeMap(456,1),variants=[];
  for(let y=8;y<12;y++)for(let x=8;x<12;x++)variants.push(sceneryTileVariant(map,x,y));
  assert.equal(new Set(variants.map(v=>v%4)).size,1);
  assert.ok(new Set(variants).size>1);assert.ok(variants.every(v=>Number.isInteger(v)&&v>=0&&v<16));
});

test('all scenic biomes have distinct floor compositions and cached 32px accents',()=>withCanvas(()=>{
  const signatures=[];
  for(const floor of [1,6,11,16,21]){
    const map=makeMap(321,floor),scenery=buildScenery(map),canvas=new TestCanvas(map.width,map.height);
    paintSceneryFloor(canvas.context,map,scenery,Y_SCALE);
    const calls=canvas.context.calls;
    assert.ok(calls.some(c=>c.method==='clip'),'dressing must be clipped to walkable floor geometry');
    const rects=calls.filter(c=>c.method==='rect');
    assert.equal(rects.length,map.open.length);
    signatures.push(JSON.stringify(calls.filter(c=>c.method==='fillRect').map(c=>[...c.args,c.fillStyle])));
    for(let variant=0;variant<4;variant++){
      const prop=sceneryPropSprite(scenery.biome,variant);
      assert.equal(prop.baseSize,32);assert.equal(prop.image.width,32);assert.equal(prop.image.height,32);
      assert.equal(sceneryPropSprite(scenery.biome,variant),prop);
    }
  }
  assert.equal(new Set(signatures).size,5);
}));

test('ambient motion stays bounded and never samples simulation randomness',()=>{
  const mote={x:100,y:200,phase:2.7,speed:.6};
  for(const biome of Object.keys(SCENERY_MOTIFS))for(let time=0;time<400;time+=.73){
    const p=sceneryMotePosition(mote,time,biome);
    assert.ok(Math.abs(p.x-mote.x)<=8);assert.ok(Math.abs(p.y-mote.y)<=5);
    assert.ok(p.z>=4&&p.z<=25);assert.ok(p.alpha>=.22&&p.alpha<=.52);
    assert.deepEqual(sceneryMotePosition(mote,time,biome),p);
  }
});

test('scenic accents and ambience remain hidden across an unexplored wall',()=>withCanvas(()=>{
  const w=9,h=7,tile=32,cells=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>+(x===0||y===0||x===w-1||y===h-1||x===4)));
  const map={w,h,tile,cells,width:w*tile,height:h*tile,seed:42,biomeId:'swamp',rooms:[],hazards:[]};
  const player={x:64,y:96,hp:100,still:1,facing:0,attackTime:0};
  const exploration=createExploration(map);updateExploration(map,player,exploration,{radius:12});
  const engine={map,player,exploration,spec:{weapon:{digit:0}},status:'playing',totalTime:0,gates:false,enemies:[],pickups:[],bullets:[],fx:[]};
  const canvas=new TestCanvas(),renderer=new DungeonRenderer(canvas),seen=[];
  const scene=renderer.getScene(map);
  scene.scenery.props=[{x:80,y:96,variant:0},{x:192,y:96,variant:0}];
  scene.scenery.motes=[{x:80,y:96,phase:0,speed:.3,size:1},{x:192,y:96,phase:0,speed:.3,size:1}];
  renderer.drawSceneryProp=p=>seen.push(p.x);
  const before=JSON.stringify(engine);renderer.render(engine,{width:800,height:600,quality:'high'});
  assert.deepEqual(seen,[80]);assert.equal(JSON.stringify(engine),before);
  canvas.context.calls=[];renderer.drawSceneryMotes(0,false);
  const motes=canvas.context.calls.filter(c=>c.method==='fillRect'&&c.fillStyle==='#b5dfb8');
  assert.equal(motes.length,1);assert.equal(motes[0].args[0],80);
  renderer.reduced=true;canvas.context.calls=[];renderer.drawSceneryMotes(1,false);
  assert.equal(canvas.context.calls.length,0);
}));
