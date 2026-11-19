import test from 'node:test';
import assert from 'node:assert/strict';
import { Y_SCALE, screenVectorToWorld, projectWorld, unprojectScreen, compareDepth, wallOccludesPlayer, makeCamera, makeBossCamera, DungeonRenderer, explorationLevel, resolveWeaponDigit, makeFogLightField, sampleFogLight, FOG_MEMORY_LIGHT } from '../src/renderer.mjs';

import {createExploration,updateExploration} from '../src/fog.mjs';
import {TestCanvas,withCanvas} from './render-test-canvas.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test('2.5D projection and inverse retain world position at multiple heights', () => {
  for (const view of [{x:240,y:320,zoom:1.65,centerX:195,centerY:340}, {x:612,y:440,zoom:2.1,centerX:600,centerY:390}]) {
    for (const point of [{x:0,y:0,z:0},{x:781,y:385,z:27},{x:400,y:77,z:69}]) {
      const screen = projectWorld(point.x, point.y, point.z, view);
      const world = unprojectScreen(screen.x, screen.y, point.z, view);
      close(world.x, point.x); close(world.y, point.y);
    }
  }
});
test('screen joystick diagonal retains its screen direction after inverse projection', () => {
  for (const [x,y] of [[1,1],[-.4,.6],[0,-1],[1,0]]) {
    const vector = screenVectorToWorld(x,y);
    close(vector.x,x); close(vector.y * Y_SCALE,y);
  }
  assert.deepEqual(screenVectorToWorld(NaN,Infinity),{x:0,y:0});
});
test('height lifts a sprite without moving its ground position', () => {
  const ground=projectWorld(100,200,0), head=projectWorld(100,200,27);
  close(ground.x,head.x); close(ground.y-head.y,27);
});
test('depth order uses feet with deterministic order for equal depths', () => {
  const items=[{depth:36,order:2},{depth:20,order:9},{depth:36,order:1}];
  assert.deepEqual(items.sort(compareDepth).map(x=>x.order),[9,1,2]);
});
test('only projected foreground occlusion fades a wall', () => {
  const player={x:100,y:100};
  assert.equal(wallOccludesPlayer({x:90,y:108,height:36},player),true);
  assert.equal(wallOccludesPlayer({x:90,y:20,height:36},player),false);
  assert.equal(wallOccludesPlayer({x:170,y:108,height:36},player),false);
  assert.equal(wallOccludesPlayer({x:90,y:200,height:36},player),false);
});
test('desktop and mobile camera remain finite at map edges', () => {
  const map={width:1116,height:828};
  for (const [width,height] of [[390,600],[1280,720],[320,210]]) {
    for (const player of [{x:0,y:0},{x:558,y:414},{x:1116,y:828}]) {
      const view=makeCamera(player,map,width,height);
      assert.ok(Object.values(view).every(Number.isFinite));
      assert.ok(view.zoom>=1.65&&view.zoom<=2.1);
      assert.equal(view.width,width);assert.equal(view.height,height);
    }
  }
});

test('boss and player fit a short landscape viewport including the boss crown', () => {
  const map={width:1116,height:828}, boss={x:558,y:414};
  for (const [width,height] of [[844,390],[844,230],[390,600],[1280,720]]) {
    for (const player of [{x:558,y:664},{x:150,y:730},{x:960,y:100}]) {
      const view=makeBossCamera(player,boss,map,width,height);
      assert.ok(view.zoom>0&&view.zoom<=2.1);
      const points=[
        projectWorld(boss.x-55,boss.y,98,view),
        projectWorld(boss.x+55,boss.y,-38,view),
        projectWorld(player.x-26,player.y,36,view),
        projectWorld(player.x+26,player.y,-14,view)
      ];
      for (const point of points) {
        assert.ok(point.x>=-1e-9&&point.x<=width+1e-9,`x=${point.x} width=${width}`);
        assert.ok(point.y>=-1e-9&&point.y<=height+1e-9,`y=${point.y} height=${height}`);
      }
      const playerScreen=projectWorld(player.x,player.y,0,view);
      const inverse=unprojectScreen(playerScreen.x,playerScreen.y,0,view);
      close(inverse.x,player.x);close(inverse.y,player.y);
    }
  }
});

function fogFixture(){
  const w=7,h=5,tile=32,cells=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>x===0||y===0||x===w-1||y===h-1||x===3?1:0));
  const map={w,h,tile,cells,width:w*tile,height:h*tile,seed:42,portal:{x:48,y:48},stairs:{x:176,y:80}};
  const player={x:48,y:80,hp:100,still:0,invuln:0,facing:0,attackTime:0};
  const exploration=createExploration(map);updateExploration(map,player,exploration,{radius:12});
  return {map,player,exploration};
}

test('renderer knowledge distinguishes current view, explored memory and unseen cells',()=>{
  const {map,player,exploration}=fogFixture();
  assert.equal(explorationLevel(map,exploration,80,80),2);
  assert.equal(explorationLevel(map,exploration,144,80),0);
  assert.equal(explorationLevel(map,null,80,80),0);
  updateExploration(map,{x:176,y:80},exploration,{radius:12});
  assert.equal(explorationLevel(map,exploration,player.x,player.y),1);
  assert.equal(explorationLevel(map,exploration,144,80),2);
});

test('drawing omits enemies, loot, unknown geometry and exit markers behind fog without changing engine state',()=>withCanvas(()=>{
  const {map,player,exploration}=fogFixture();
  const engine={map,player,exploration,spec:{weapon:{digit:8,id:'staff'}},status:'playing',totalTime:1,gates:true,
    enemies:[{id:1,x:80,y:80,hp:8,maxHp:8,r:10,warm:0},{id:2,x:144,y:80,hp:8,maxHp:8,r:10,warm:0}],
    pickups:[{x:80,y:48,core:{digit:3,rarity:'rare'}},{x:144,y:48,core:{digit:7,rarity:'epic'}}],bullets:[],fx:[]};
  const before=JSON.stringify(engine),canvas=new TestCanvas(),renderer=new DungeonRenderer(canvas),actors=[],loot=[],walls=[];
  renderer.drawActor=(actor,kind)=>actors.push({actor,kind});
  renderer.drawPickup=drop=>loot.push(drop);renderer.drawWall=wall=>walls.push(wall);
  renderer.render(engine,{width:800,height:600,dpr:1,quality:'low'});
  assert.deepEqual(actors.filter(a=>a.kind!=='player').map(a=>a.actor.id),[1]);
  assert.equal(loot.length,1);assert.equal(loot[0].core.digit,3);
  assert.ok(walls.every(w=>isKnownWall(w,map,exploration)));
  const labels=canvas.context.calls.filter(c=>c.method==='fillText').map(c=>c.args[0]);
  assert.ok(labels.includes('帰還'));assert.ok(!labels.includes('次の階層'));
  assert.ok(!canvas.context.calls.some(c=>c.method==='fillRect'&&c.fillStyle==='#d2b988'),'unknown stairs marker must not appear');
  assert.equal(renderer.scene.levels[2*map.w+4],0);
  const floorCalls=renderer.scene.observed.context.calls;
  assert.equal(floorCalls.find(c=>c.method==='fillRect').alpha,1,'unexplored backing must be opaque');
  const crops=floorCalls.filter(c=>c.method==='drawImage'&&c.args[0]===renderer.scene.floor);
  assert.ok(crops.every(c=>explorationLevel(map,exploration,c.args[1]+16,(c.args[2]/Y_SCALE)+16)>0));
  assert.equal(JSON.stringify(engine),before);
  assert.equal(renderer.weaponDigit,8);
}));
function isKnownWall(w,map,state){return explorationLevel(map,state,w.x+map.tile/2,w.y+map.tile/2)>0;}

test('root weapon digits retain all ten visual variants without classes',()=>{
  const names=['sword','dagger','greatsword','spear','axe','hammer','bow','chakram','staff','spellbook'];
  names.forEach((id,digit)=>{assert.equal(resolveWeaponDigit({id,digit}),digit);assert.equal(resolveWeaponDigit(id),digit);});
  assert.equal(resolveWeaponDigit(undefined),0);
});

test('world hostile bullets and telegraphs remain hidden behind exploration fog',()=>withCanvas(()=>{
  const {map,player,exploration}=fogFixture();
  map.biomeId='volcano';map.hazards=[{x:80,y:80,kind:'lava',radius:12},{x:144,y:80,kind:'lava',radius:12}];
  const engine={map,player,exploration,spec:{weapon:{digit:2}},status:'playing',totalTime:1,gates:false,
    enemies:[],pickups:[],bullets:[],fx:[],
    hostileBullets:[{id:1,x:80,y:80,vx:40,vy:0,life:1,radius:3,kind:'arrow'},{id:2,x:144,y:80,vx:40,vy:0,life:1,radius:3,kind:'arrow'}],
    telegraphs:[{type:'circle',x:80,y:80,radius:12,remaining:.3,total:1,color:'#123abc'},{type:'circle',x:144,y:80,radius:12,remaining:.3,total:1,color:'#abc123'}]};
  const before=JSON.stringify(engine),canvas=new TestCanvas(),renderer=new DungeonRenderer(canvas),seen=[];
  renderer.drawHostileBullet=b=>seen.push(b.id);renderer.drawActor=()=>{};
  renderer.render(engine,{width:800,height:600,quality:'low'});
  assert.deepEqual(seen,[1]);
  assert.ok(canvas.context.calls.some(c=>c.fillStyle==='#123abc'));
  assert.ok(!canvas.context.calls.some(c=>c.fillStyle==='#abc123'));
  assert.equal(JSON.stringify(engine),before);
}));

test('five visible finite bosses retain their identities and get a world HP/name display',()=>withCanvas(()=>{
  for(const monsterId of ['elder_treant','dune_scorpion','cinder_drake','mire_hydra','frost_giant']){
    const {map,player,exploration}=fogFixture();
    const boss={id:99,name:`Boss ${monsterId}`,monsterId,sprite:monsterId,isFloorBoss:true,phase:2,x:80,y:80,hp:50,maxHp:100,r:25,warm:0};
    const engine={map,player,exploration,spec:{weapon:{digit:0}},status:'playing',totalTime:1,gates:false,enemies:[boss],floorBoss:boss,pickups:[],bullets:[],fx:[]};
    const canvas=new TestCanvas(),renderer=new DungeonRenderer(canvas);
    renderer.render(engine,{width:844,height:230,quality:'low'});
    assert.ok(canvas.context.calls.some(c=>c.method==='fillText'&&c.args[0]===boss.name));
    assert.ok(canvas.context.calls.some(c=>c.method==='fillText'&&c.args[0]==='激昂'));
    const label=renderer.worldToScreen(boss.x,boss.y,129);assert.ok(label.y>=0&&label.y<230);
  }
}));


test('fog light feathers continuously through current view, memory and unknown without lighting unknown samples',()=>{
  const w=17,h=13,levels=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<15;x++)levels[y*w+x]=x<9?2:1;
  const field=makeFogLightField(levels,w,h),row=6.5;
  close(sampleFogLight(field,5,row),1);
  assert.ok(Math.abs(sampleFogLight(field,11,row)-FOG_MEMORY_LIGHT)<1e-6);
  close(sampleFogLight(field,16,row),0);
  let previous=1;
  for(let x=7;x<=16;x+=.125){
    const light=sampleFogLight(field,x,row);
    assert.ok(light<=previous+1e-6,`falloff must not brighten: ${x}`);
    assert.ok(previous-light<.12,`no hard edge: ${x}`);previous=light;
  }
  for(let y=0;y<h*field.samples;y++)for(let x=15*field.samples;x<field.width;x++)assert.equal(field.values[y*field.width+x],0);
});

test('a two-tile corridor keeps useful light and reveal-all trials keep full lighting',()=>{
  const w=11,h=11,levels=new Uint8Array(w*h);
  for(let y=1;y<h-1;y++)for(let x=4;x<=5;x++)levels[y*w+x]=2;
  const field=makeFogLightField(levels,w,h);
  assert.ok(sampleFogLight(field,5,5.5)>.65,'narrow paths should remain readable');
  const open=makeFogLightField(levels,w,h,{revealAll:true});
  assert.ok(open.values.every(v=>v===1));
});

test('continuous player motion moves radial light without rebuilding cached discovery, including low quality',()=>withCanvas(()=>{
  const {map,player,exploration}=fogFixture();
  const engine={map,player,exploration,spec:{weapon:{digit:0}},status:'playing',totalTime:1,gates:false,enemies:[],pickups:[],bullets:[],fx:[]};
  const canvas=new TestCanvas(),renderer=new DungeonRenderer(canvas);
  renderer.render(engine,{width:390,height:844,quality:'low'});
  const observed=renderer.scene.observed,calls=observed.context.calls.length,field=renderer.scene.lightField;
  const before=JSON.stringify(exploration),oldX=player.x;
  player.x+=5;engine.totalTime+=1/60;
  renderer.render(engine,{width:390,height:844,quality:'low'});
  const radial=canvas.context.calls.filter(c=>c.method==='createRadialGradient'&&c.args[5]===exploration.radius*map.tile);
  assert.equal(radial.length,2);assert.equal(radial[0].args[0],oldX);assert.equal(radial[1].args[0],player.x);
  assert.ok(radial.every(c=>c.stops.length>=5));
  assert.equal(renderer.scene.lightField,field);assert.equal(observed.context.calls.length,calls);
  assert.equal(canvas.context.imageSmoothingEnabled,false);
  assert.equal(JSON.stringify(exploration),before,'visual light must not change sight masks');
}));
