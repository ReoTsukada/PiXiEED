import test from 'node:test';
import assert from 'node:assert/strict';
import {BIOMES,MONSTERS,biomeForFloor,getBiome,biomeCycle} from '../src/world.mjs';
import {makeMap,mapWall,distanceGrid} from '../src/map.mjs';
import {GameEngine} from '../src/engine.mjs';
import {BossTrial} from '../src/boss.mjs';
import {makeProfile,compileBoard,bankRun,makeItem} from '../src/core.mjs';
import {createExploration} from '../src/fog.mjs';
import {CORE_BY_ID} from '../src/catalog.mjs';
import {CONSUMABLE_BY_ID,makeEquipment} from '../src/items.mjs';
import {floorStats} from '../src/combat-math.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const baseSpec=()=>{const p=makeProfile();return compileBoard(p.board,p.inventory);};
function arena({floor=1,seed=100,runId}={}){
 const e=new GameEngine(baseSpec(),{seed,startFloor:floor,...(runId?{runId}:{})}),w=35,h=25,tile=32;
 const cells=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>+(x===0||y===0||x===w-1||y===h-1)));
 e.map={w,h,tile,cells,width:w*tile,height:h*tile,biomeId:biomeForFloor(floor).id,hazards:[],spawn:{x:400,y:400},portal:{x:48,y:48},stairs:{x:1040,y:720},open:[]};
 Object.assign(e.player,{x:400,y:400,hp:1000});e.spec.maxHp=1000;e.spec.vision=30;e.spec.regen=0;e.spec.recovery=0;
 e.exploration=createExploration(e.map);e.updateSight();e.enemies=[];e.floorBoss=null;e.bossDefeated=true;e.spawn=()=>{};e.goalTime=Infinity;e.shotTimer=Infinity;
 return e;
}
function enemy(e,id,x=600,y=400){const value=e.createEnemy(id,{x,y},{floorBoss:!!MONSTERS[id].boss});value.warm=0;value.attackCooldown=0;e.enemies.push(value);return value;}
function run(e,seconds,input={x:0,y:0}){for(let i=0;i<Math.ceil(seconds*60);i++)e.tick(1/60,input);}
function wall(e,tx=16){for(let y=1;y<e.map.h-1;y++)e.map.cells[y][tx]=1;e.exploration=createExploration(e.map);e.updateSight();}

test('5フィールドは5階ずつ巡り、25階後も絶対階層で強くなる',()=>{
 assert.deepEqual(BIOMES.map(b=>b.id),['meadow','desert','volcano','swamp','tundra']);
 for(let f=1;f<=150;f++){assert.equal(biomeForFloor(f),BIOMES[Math.floor((f-1)/5)%5]);assert.equal(biomeCycle(f),Math.floor((f-1)/25));}
 assert.equal(getBiome('tundra').name,'白霜の雪原');assert.equal(getBiome('unknown'),BIOMES[0]);
 for(const f of[0,-1,1.5,Infinity])assert.throws(()=>biomeForFloor(f));
 assert.ok(floorStats(26).hp>floorStats(1).hp);
});

test('全フィールドに3種の通常魔物と専用の有限ボスが定義される',()=>{
 const ids=new Set();for(const biome of BIOMES){assert.equal(biome.monsters.length,3);for(const id of[...biome.monsters,biome.bossId]){assert.ok(!ids.has(id));ids.add(id);assert.equal(MONSTERS[id].biomeId,biome.id);assert.ok(MONSTERS[id].speed>0);assert.ok(MONSTERS[id].hpFactor>0);}assert.equal(MONSTERS[biome.bossId].boss,true);}
 assert.equal(ids.size,20);assert.deepEqual(new Set(Object.keys(MONSTERS)),ids);
});

test('各地の地形効果は接続を壊さず、入口・帰還陣・階段・ボス位置を避ける',()=>{
 for(const floor of[1,6,11,16,21])for(let seed=0;seed<20;seed++){
  const map=makeMap(seed,floor),biome=biomeForFloor(floor),d=distanceGrid(map,Math.floor(map.spawn.x/32),Math.floor(map.spawn.y/32));
  assert.equal(map.biomeId,biome.id);assert.equal(map.hazards.length>0,!!biome.hazard);
  assert.ok(map.open.every(t=>d[t.ty][t.tx]>=0));
  for(const hazard of map.hazards){assert.equal(hazard.kind,biome.hazard);assert.equal(mapWall(map,hazard.x,hazard.y),false);for(const point of[map.spawn,map.portal,map.stairs,...map.rooms.map(r=>r.center)])assert.ok(Math.hypot(point.x-hazard.x,point.y-hazard.y)>hazard.radius+35);}
 }
});

test('5階ごとのボスは最奥の別室に配置され、通常階には現れない',()=>{
 for(let floor=1;floor<=30;floor++){
  const e=new GameEngine(baseSpec(),{seed:17,startFloor:floor});
  if(floor%5){assert.equal(e.floorBoss,null);assert.equal(e.bossDefeated,true);continue;}
  const boss=e.floorBoss,room=e.map.rooms.find(r=>r.id===e.map.stairs.roomId);
  assert.equal(boss.monsterId,biomeForFloor(floor).bossId);assert.equal(boss.isFloorBoss,true);assert.equal(boss.immortal,undefined);assert.equal(e.bossDefeated,false);
  assert.equal(boss.x,room.center.x);assert.equal(boss.y,room.center.y);assert.notEqual(room.id,e.map.entryRoomId);assert.equal(mapWall(e.map,boss.x,boss.y,boss.r),false);
  assert.ok(Number.isFinite(boss.hp)&&boss.hp>0);if(floor===30)assert.match(boss.name,/第2巡/);
 }
});

test('通常のクリア条件だけではボス階は開かず、討伐後に開通する',()=>{
 const events=[],e=new GameEngine(baseSpec(),{seed:45,startFloor:5,onEvent:event=>events.push(event)});e.spawn=()=>{};e.shotTimer=Infinity;
 e.floorTime=25;e.floorKills=e.goalKills;e.tick(1/60);assert.equal(e.gates,false);assert.equal(e.clearedFloor,0);
 e.hurt(e.floorBoss,e.floorBoss.hp,'direct');assert.equal(e.bossDefeated,true);assert.equal(e.gold,0);assert.ok(events.some(event=>event.type==='floor-boss-defeated'));
 e.tick(1/60);assert.equal(e.gates,true);assert.equal(e.clearedFloor,5);
 const other=new GameEngine(baseSpec(),{seed:45,startFloor:5});other.hurt(other.floorBoss,other.floorBoss.hp,'direct');other.tick(1/60);assert.equal(other.gates,false,'boss kill cannot skip the ordinary survival/kill requirements');
});

test('ボスはHP半減で第2形態となり、次の攻撃待ちが25%短くなる',()=>{
 const e=arena({floor:5}),boss=enemy(e,'elder_treant',600,400);boss.hp=boss.maxHp*.5;boss.attackCooldown=0;
 e.updateEnemy(boss,1/60);assert.equal(boss.phase,2);assert.equal(e.telegraphs.length,1);
 close(boss.attackCooldown,MONSTERS.elder_treant.attacks[0].cooldown*.75);assert.equal(boss.aiState,'windup');
});

test('槌は通常敵を押し戻すが有限の階層ボスにはダメージだけを与える',()=>{
 const e=arena({floor:5}),core=makeItem('test-hammer',5,'emitter');Object.assign(e.spec,compileBoard([[core.id]],[core]),{damage:1,crit:0});
 const boss=enemy(e,'elder_treant',440,400),slime=enemy(e,'slime',445,400),bossHp=boss.hp,slimeHp=slime.hp;
 assert.equal(e.volley(),true);assert.ok(boss.hp<bossHp);assert.ok(slime.hp<slimeHp);
 close(boss.x,440);close(boss.y,400);close(slime.x,469);close(slime.y,400);
});

test('通常出現はそのフィールドの3種だけで、すべての種類が実際に出現する',()=>{
 for(const floor of[1,6,11,16,21]){
  const e=new GameEngine(baseSpec(),{seed:311,startFloor:floor}),seen=new Set();
  for(let n=0;n<90;n++){e.enemies=[];e.spawn();for(const monster of e.enemies){seen.add(monster.monsterId);assert.equal(monster.sprite,monster.monsterId);assert.ok(biomeForFloor(floor).monsters.includes(monster.monsterId));}}
  assert.deepEqual(seen,new Set(biomeForFloor(floor).monsters));
 }
});

test('近づく狼・周回する甲虫・距離を取る射手は異なる軌道を動く',()=>{
 const moves={};for(const id of['wolf','scarab','sand_archer']){const e=arena(),m=enemy(e,id,500,400);m.attackCooldown=99;e.updateEnemy(m,.1);moves[id]={dx:m.x-500,dy:m.y-400};}
 assert.ok(moves.wolf.dx<0);assert.ok(Math.abs(moves.wolf.dy)<1e-8);assert.ok(Math.abs(moves.scarab.dy)>1);assert.ok(moves.sand_archer.dx>0);
 const e=arena(),slime=enemy(e,'slime',600,400);slime.id=7;e.totalTime=0;e.updateEnemy(slime,.1);const first=600-slime.x;
 slime.x=600;e.totalTime=.6;e.updateEnemy(slime,.1);assert.ok(first>(600-slime.x)*5);
});

test('射手は予告中に発射せず、予告を終えると回避可能な敵弾を放つ',()=>{
 const e=arena({floor:6}),archer=enemy(e,'sand_archer');e.updateEnemy(archer,1/60);
 assert.equal(e.telegraphs.length,1);assert.equal(e.telegraphs[0].type,'line');assert.equal(e.hostileBullets.length,0);const hp=e.player.hp;
 e.updateTelegraphs(.69);assert.equal(e.hostileBullets.length,0);assert.equal(e.player.hp,hp);
 e.updateTelegraphs(.02);assert.equal(e.hostileBullets.length,1);assert.equal(e.hostileBullets[0].kind,'arrow');assert.equal(e.telegraphs.length,0);
 for(let i=0;i<90;i++)e.stepHostileBullet(e.hostileBullets[0],1/60);
 assert.ok(e.player.hp<hp);
});

test('壁・未発見領域の向こうの敵は攻撃を予告しない',()=>{
 const e=arena({floor:6}),archer=enemy(e,'sand_archer');wall(e);e.updateEnemy(archer,.1);assert.equal(e.telegraphs.length,0);
 const unseen=arena({floor:6}),other=enemy(unseen,'sand_archer');unseen.spec.vision=2;unseen.updateSight();unseen.updateEnemy(other,.1);assert.equal(unseen.telegraphs.length,0);
});

test('敵弾は高速でも壁を越えず、射程を使い切ると消える',()=>{
 const e=arena({floor:6}),archer=enemy(e,'sand_archer'),attack={...MONSTERS.sand_archer.attack,projectileSpeed:4000};
 e.beginEnemyAttack(archer,attack);e.updateTelegraphs(1);const b=e.hostileBullets[0];wall(e);const hp=e.player.hp;
 e.stepHostileBullet(b,1/30);assert.equal(b.life,0);assert.equal(e.player.hp,hp);assert.ok(b.x>512);
 const open=arena(),source=enemy(open,'sand_archer',650,400);open.beginEnemyAttack(source,{...attack,range:100});open.updateTelegraphs(1);const short=open.hostileBullets[0];
 for(let n=0;n<60;n++)open.stepHostileBullet(short,1/60);assert.equal(short.life,0);assert.equal(open.player.hp,open.spec.maxHp);close(short.x,550);
});

test('地面攻撃は予告地点から離れると回避でき、壁越しにも命中しない',()=>{
 const e=arena({floor:6}),worm=enemy(e,'sand_worm');e.beginEnemyAttack(worm,MONSTERS.sand_worm.attack);const hp=e.player.hp;
 assert.equal(e.telegraphs[0].x,e.player.x);e.player.y+=120;e.updateTelegraphs(1.1);assert.equal(e.player.hp,hp);
 const blocked=arena({floor:6}),source=enemy(blocked,'sand_worm');blocked.beginEnemyAttack(source,MONSTERS.sand_worm.attack);wall(blocked);blocked.updateTelegraphs(1.1);assert.equal(blocked.player.hp,blocked.spec.maxHp);
 const hit=arena({floor:6}),same=enemy(hit,'sand_worm');hit.beginEnemyAttack(same,MONSTERS.sand_worm.attack);hit.updateTelegraphs(1.1);assert.ok(hit.player.hp<hit.spec.maxHp);
});

test('予告元を倒すと未発動の攻撃は消える',()=>{
 const e=arena({floor:6}),archer=enemy(e,'sand_archer');e.beginEnemyAttack(archer,MONSTERS.sand_archer.attack);e.hurt(archer,archer.hp,'direct');e.updateTelegraphs(1);
 assert.equal(e.telegraphs.length,0);assert.equal(e.hostileBullets.length,0);
});

test('突進は予告方向に固定され、壁で止まり壁の裏へ命中しない',()=>{
 const e=arena(),wolf=enemy(e,'wolf',600,400);e.beginEnemyAttack(wolf,MONSTERS.wolf.attack);assert.equal(e.telegraphs[0].type,'line');
 e.player.y+=150;e.updateTelegraphs(1);for(let n=0;n<35;n++)e.updateEnemy(wolf,1/60);assert.ok(wolf.x<550);assert.equal(e.player.hp,e.spec.maxHp);
 const blocked=arena(),other=enemy(blocked,'wolf',600,400);blocked.beginEnemyAttack(other,MONSTERS.wolf.attack);wall(blocked);blocked.updateTelegraphs(1);
 for(let n=0;n<45;n++)blocked.updateEnemy(other,1/60);assert.ok(other.x>=544+other.r);assert.equal(blocked.player.hp,blocked.spec.maxHp);
});

test('大きなボスの足元に収まる細い柱も衝突判定から抜け落ちない',()=>{
 const e=arena();e.map.cells[12][18]=1;
 assert.equal(mapWall(e.map,586,400,27),true);
 const body={x:520,y:400};e.moveBody(body,4000,0,.1,27);assert.ok(body.x<=576-27);
});

test('金・素材・装備・道具・コアは回収前に資産へ加算されない',()=>{
 const profile=makeProfile(),wallet=profile.wallet,e=arena(),slime=enemy(e,'slime',600,400);e.floorKills=2;e.hurt(slime,slime.hp,'direct');
 assert.equal(e.gold,0);assert.equal(e.loot.length,0);assert.deepEqual(e.cargo,{materials:{},equipment:[],consumables:{}});assert.equal(profile.wallet,wallet);
 const guaranteed=e.pickups.find(p=>p.kind==='core');assert.ok(guaranteed);assert.ok(!CORE_BY_ID[guaranteed.core.type].exclusiveEnemyId);
 e.pickups.push({x:600,y:400,kind:'material',itemId:'slime_gel',amount:2},{x:600,y:400,kind:'equipment',item:makeEquipment('drop-armor','traveler_vest')},{x:600,y:400,kind:'consumable',itemId:'ward_scroll',amount:1});
 const equipmentCount=e.pickups.filter(drop=>drop.kind==='equipment').length,wardCount=e.pickups.filter(drop=>drop.kind==='consumable'&&drop.itemId==='ward_scroll').reduce((total,drop)=>total+drop.amount,0);
 e.collectPickups();assert.equal(e.gold,0);Object.assign(e.player,{x:600,y:400});e.collectPickups();
 assert.ok(e.gold>0);assert.equal(e.loot.length,1);assert.ok(e.cargo.materials.slime_gel>=2);assert.equal(e.cargo.equipment.length,equipmentCount);assert.equal(e.cargo.consumables.ward_scroll,wardCount);assert.equal(e.pickups.length,0);assert.equal(profile.equipment.length,0);
 bankRun(profile,e.loot,e.gold,e.floor,e.cargo);assert.equal(profile.wallet,wallet+e.gold);assert.equal(profile.equipment.length,equipmentCount);assert.equal(profile.consumables.ward_scroll,wardCount);
});

test('壁越しの回収を行わず、取得済み戦利品だけを次の階へ引き継ぐ',()=>{
 const e=arena();e.spec.pickup=200;wall(e);e.pickups.push({x:600,y:400,kind:'gold',amount:100});e.collectPickups();assert.equal(e.gold,0);assert.equal(e.pickups.length,1);
 e.cargo.materials.slime_gel=2;e.cargo.equipment.push(makeEquipment('carried','gel_coat'));e.cargo.consumables.healing_draught=1;e.loot.push(makeItem('carried-core',4,'emitter'));e.gold=12;const cargo=structuredClone(e.cargo);
 e.nextFloor();assert.deepEqual(e.cargo,cargo);assert.equal(e.loot.length,1);assert.equal(e.gold,12);assert.equal(e.pickups.length,0);assert.equal(e.hostileBullets.length,0);assert.equal(e.telegraphs.length,0);
});

test('残り所持枠を超えたコア・装備は地面に残り、通知は各種1回だけ',()=>{
 const notices=[],e=new GameEngine(baseSpec(),{seed:12,cargoCapacity:{cores:1,equipment:0},onEvent:event=>notices.push(event)}),at={x:e.player.x,y:e.player.y};
 e.pickups=[{...at,kind:'core',core:makeItem('one-core',1,'power')},{...at,kind:'core',core:makeItem('two-core',2,'power')},{...at,kind:'equipment',item:makeEquipment('no-room','traveler_vest')},{...at,kind:'gold',amount:25},{...at,kind:'material',itemId:'slime_gel',amount:2},{...at,kind:'consumable',itemId:'healing_draught',amount:1}];
 for(let n=0;n<3;n++)e.collectPickups();
 assert.deepEqual(e.loot.map(core=>core.id),['one-core']);assert.equal(e.cargo.equipment.length,0);assert.equal(e.gold,25);assert.equal(e.cargo.materials.slime_gel,2);assert.equal(e.cargo.consumables.healing_draught,1);
 assert.deepEqual(e.pickups.map(drop=>drop.kind),['core','equipment']);assert.deepEqual(notices.filter(event=>event.type==='cargo-full').map(event=>event.kind),['core','equipment']);
 for(const invalid of[-1,1.5,NaN])assert.throws(()=>new GameEngine(baseSpec(),{cargoCapacity:{cores:invalid,equipment:0}}));
});

test('同じ固定シードの別探索はロールを維持して個体IDだけを分ける',()=>{
 const a=arena({floor:5,runId:'attempt-a'}),b=arena({floor:5,runId:'attempt-b'});
 for(const e of[a,b]){const boss=enemy(e,'elder_treant');e.hurt(boss,boss.hp,'direct');}
 const identity=e=>e.pickups.filter(drop=>drop.core||drop.item).map(drop=>(drop.core||drop.item).id);
 assert.ok(identity(a).length>0);assert.ok(identity(a).every(id=>!identity(b).includes(id)));
 const withoutIds=e=>e.pickups.map(({id,...drop})=>({...drop,...(drop.core?{core:{...drop.core,id:null}}:{}),...(drop.item?{item:{...drop.item,id:null}}:{})}));
 assert.deepEqual(withoutIds(a),withoutIds(b));
});

test('防具と結界は乗算し、冷気の時間と強さにも状態異常耐性が効く',()=>{
 const e=arena();e.spec.armorMitigation=.2;e.spec.statusResistance=.4;
 assert.equal(e.useConsumable(CONSUMABLE_BY_ID.ward_scroll.effect),true);assert.equal(e.canUseConsumable('ward_scroll'),false);
 close(e.damagePlayer(100,{slow:2}),56);close(e.player.hp,944);close(e.player.slowTime,.6);close(e.player.slowStrength,.12);close(e.statusResistance(),.7);
 assert.equal(e.damagePlayer(100),0,'brief invulnerability prevents the same attack hitting every frame');
 run(e,8.1);assert.equal(e.player.ward,null);close(e.statusResistance(),.4);
});

test('回復薬は欠損HPだけを回復し、満タン・待機時間・無限ボスでは使えない',()=>{
 const e=arena();assert.equal(e.canUseConsumable('healing_draught'),false);e.player.hp=800;e.spec.recovery=1;
 assert.equal(e.canUseConsumable('healing_draught'),true);assert.equal(e.useConsumable(CONSUMABLE_BY_ID.healing_draught.effect),true);close(e.player.hp,1000);close(e.bonusCredit,20);assert.equal(e.canUseConsumable('ward_scroll'),false);
 run(e,1.1);assert.equal(e.canUseConsumable('ward_scroll'),true);assert.equal(e.useConsumable({duration:100,damageReduction:.99,statusResistance:.99}),false);
 const trial=new BossTrial(baseSpec());trial.player.hp-=40;assert.equal(trial.canUseConsumable('healing_draught'),false);assert.equal(trial.useConsumable(CONSUMABLE_BY_ID.ward_scroll.effect),false);assert.deepEqual(trial.cargo,{materials:{},equipment:[],consumables:{}});assert.equal(trial.floorBoss,null);
});

test('溶岩は継続ダメージ、流砂と氷は速度低下で、耐性は足止めを緩和する',()=>{
 const e=arena({floor:11});e.map.hazards=[{x:400,y:400,kind:'lava',radius:25,damageFactor:.38,slowFactor:1}];e.updateHazards(.1);assert.ok(e.player.hp<e.spec.maxHp);
 const hp=e.player.hp;e.updateHazards(.1);assert.equal(e.player.hp,hp);e.player.invuln=0;e.updateHazards(.6);assert.ok(e.player.hp<hp);
 e.map.hazards=[{x:400,y:400,kind:'sand',radius:25,damageFactor:0,slowFactor:.62}];close(e.terrainSlow(),.62);e.spec.statusResistance=.5;close(e.terrainSlow(),.81);
 e.map.hazards[0]={...e.map.hazards[0],kind:'ice',slowFactor:.72};close(e.terrainSlow(),.86);e.player.x+=100;close(e.terrainSlow(),1);
});

test('全5フィールドの実際の戦闘と固有ボスAIを連続更新して有限値を保つ',()=>{
 for(const floor of[5,10,15,20,25]){
  const e=arena({floor});e.player.hp=e.spec.maxHp=1e6;const boss=enemy(e,biomeForFloor(floor).bossId,610,400);
  for(const id of biomeForFloor(floor).monsters)enemy(e,id,550,450);run(e,12,{x:0,y:.1});
  assert.ok(Number.isFinite(e.player.hp));assert.ok(Number.isFinite(e.totalTime));assert.ok(boss.attackIndex>0);assert.ok(e.hostileBullets.length<100);assert.ok(e.telegraphs.length<10);assert.ok(e.enemies.every(m=>Number.isFinite(m.x)&&Number.isFinite(m.y)));
 }
});
