import test from 'node:test';
import assert from 'node:assert/strict';
import {WEAPONS,weaponForDigit} from '../src/weapons.mjs';
import {compileBoard,makeItem} from '../src/core.mjs';
import {GameEngine,MOVEMENT_DEADZONE} from '../src/engine.mjs';
import {BossTrial} from '../src/boss.mjs';
import {createExploration} from '../src/fog.mjs';
import {expectedDirect} from '../src/combat-math.mjs';
import {fixedHitTrial} from '../tools/balance-report.mjs';

const near=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<epsilon,`${actual} != ${expected}`);
function spec(digit){
 const root=makeItem('stance-root',digit,'emitter');
 return {...compileBoard([[root.id]],[root]),damage:weaponForDigit(digit).baseDamage,crit:0,maxHp:10000,regen:0,drain:0,recovery:0};
}
function arena(digit){
 const e=new GameEngine(spec(digit),{seed:712}),w=35,h=25,tile=32;
 const cells=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>+(x===0||y===0||x===w-1||y===h-1)));
 e.map={w,h,tile,cells,width:w*tile,height:h*tile,spawn:{x:400,y:400},portal:{x:48,y:48},stairs:{x:1000,y:720},open:[],hazards:[]};
 Object.assign(e.player,e.map.spawn);e.spec.vision=24;e.exploration=createExploration(e.map);e.updateSight();e.enemies=[];e.spawn=()=>{};e.goalTime=Infinity;
 const foe={id:500,x:e.player.x+30,y:e.player.y,hp:1e9,maxHp:1e9,r:8,warm:0,speed:0,poison:0,poisonDps:0,slow:0,flash:0,color:'#fff'};
 e.enemies.push(foe);return e;
}
function advance(e,seconds,input={x:0,y:0}){
 for(let left=seconds;left>1e-10;){const dt=Math.min(1/60,left);e.tick(dt,input);left-=dt;}
}

test('eight weapons attack while moving; only greatsword and hammer require preparation',()=>{
 assert.deepEqual(WEAPONS.filter(w=>w.stationarySeconds>0).map(w=>[w.digit,w.stationarySeconds,w.baseDamage]),[[2,.18,90],[5,.28,88]]);
 for(const w of WEAPONS){
  const e=arena(w.digit),start={x:e.player.x,y:e.player.y};advance(e,.15,{x:0,y:-1});
  assert.ok(e.player.y<start.y);assert.equal(e.player.still,0);
  if(w.stationarySeconds){assert.equal(e.totalDamage,0);assert.equal(e.weaponAttackState().mode,'moving');}
  else {assert.ok(e.totalDamage>0,`${w.id} must attack during movement`);assert.equal(e.weaponAttackState().mode,'mobile');}
 }
});

test('heavy attacks become ready exactly after their preparation time and deal their new base damage',()=>{
 for(const digit of[2,5]){
  const e=arena(digit),seconds=e.spec.weapon.stationarySeconds;
  assert.equal(e.weaponAttackState().mode,'preparing');assert.equal(e.volley(),false);
  advance(e,seconds-.001);assert.equal(e.totalDamage,0);assert.equal(e.weaponAttackState().mode,'preparing');
  near(e.weaponAttackState().remaining,.001);advance(e,.001);
  near(e.totalDamage,e.spec.weapon.baseDamage);assert.equal(e.weaponAttackState().mode,'cooldown');
  near(e.weaponAttackState().remaining,1/e.spec.rate);
 }
});

test('moving immediately cancels preparation and attacks never lock subsequent movement',()=>{
 for(const digit of[2,5]){
  const e=arena(digit),seconds=e.spec.weapon.stationarySeconds;advance(e,seconds);
  const before={x:e.player.x,y:e.player.y,damage:e.totalDamage};e.tick(1/60,{x:0,y:-1});
  assert.ok(e.player.y<before.y);assert.equal(e.player.still,0);assert.equal(e.weaponAttackState().mode,'moving');
  e.shotTimer=0;assert.equal(e.volley(),false);assert.equal(e.volley(true),false);near(e.totalDamage,before.damage);
  advance(e,seconds/2);near(e.weaponAttackState().progress,.5);assert.equal(e.totalDamage,before.damage);
  e.tick(1/60,{x:0,y:-1});assert.equal(e.weaponAttackState().progress,0);
  advance(e,seconds-.001);assert.equal(e.totalDamage,before.damage);advance(e,.001);assert.ok(e.totalDamage>before.damage);
 }
});

test('movement deadzone governs both displacement and preparation, including wall input',()=>{
 const e=arena(2),start={x:e.player.x,y:e.player.y};
 advance(e,.2,{x:MOVEMENT_DEADZONE,y:0});near(e.player.x,start.x);near(e.player.y,start.y);assert.ok(e.totalDamage>0);assert.equal(e.player.moving,false);
 e.player.x=32+9;e.player.still=2;e.shotTimer=0;const before=e.totalDamage;
 e.tick(1/60,{x:-1,y:0});near(e.player.x,32+9);assert.equal(e.player.still,0);assert.equal(e.weaponAttackState().mode,'moving');assert.equal(e.totalDamage,before);
});

test('movement consumes cooldown time without banking normal attacks or delaying the ready strike',()=>{
 for(const digit of[2,5]){
  const e=arena(digit);advance(e,e.spec.weapon.stationarySeconds);const first=e.totalDamage;
  assert.ok(e.shotTimer>0);advance(e,4,{x:0,y:-1});near(e.shotTimer,0);near(e.totalDamage,first);
  Object.assign(e.enemies[0],{x:e.player.x+30,y:e.player.y});advance(e,e.spec.weapon.stationarySeconds);
  near(e.totalDamage,first+e.spec.damage);assert.ok(e.shotTimer>0);
  advance(e,.1);near(e.totalDamage,first+e.spec.damage);
 }
});

test('high attack speed keeps fractional cooldown but does not burst accumulated movement shots',()=>{
 const e=arena(2);e.spec.rate=60;advance(e,1,{x:0,y:-1});Object.assign(e.enemies[0],{x:e.player.x+30,y:e.player.y});
 advance(e,e.spec.weapon.stationarySeconds);near(e.totalDamage,e.spec.damage);
 advance(e,.5);near(e.totalDamage,e.spec.damage*31);
});

test('recovery bonus attacks and direct primary helpers obey the same heavy stance gate',()=>{
 for(const digit of[2,5]){
  const e=arena(digit);e.bonusCredit=1;e.shotTimer=10;
  e.tick(1/60,{x:0,y:-1});assert.equal(e.bonusCredit,1);assert.equal(e.totalDamage,0);
  assert.equal(e.volley(true),false);assert.equal(e.meleeAttack(0),false);assert.equal(e.projectileVolley(0,1,false),false);assert.equal(e.bullets.length,0);
  advance(e,e.spec.weapon.stationarySeconds-.001);assert.equal(e.bonusCredit,1);assert.equal(e.totalDamage,0);
  advance(e,.001);assert.equal(e.bonusCredit,0);near(e.totalDamage,e.spec.damage);assert.ok(e.shotTimer>0,'bonus keeps its independent ordinary cooldown');
 }
});

test('floor transitions reset preparation and previous attack pose',()=>{
 const e=arena(5);e.player.still=10;e.player.moving=true;e.player.attackTime=.2;e.nextFloor(2);
 assert.equal(e.player.still,0);assert.equal(e.player.moving,false);assert.equal(e.player.attackTime,0);assert.equal(e.weaponAttackState().mode,'preparing');
});

test('infinite boss uses the same movement and stop-to-attack rules',()=>{
 for(const digit of[2,5]){
  const e=new BossTrial(spec(digit),{seed:314});Object.assign(e.player,{x:e.boss.x,y:e.boss.y+50});
  advance(e,.1,{x:1,y:0});assert.equal(e.totalDamage,0);assert.equal(e.weaponAttackState().mode,'moving');
  advance(e,e.spec.weapon.stationarySeconds);assert.ok(e.totalDamage>0);assert.equal(e.weaponAttackState().mode,'cooldown');
 }
});

test('heavy theoretical and fixed-hit moving DPS is zero; standing sustained damage retains core scaling',()=>{
 for(const digit of[2,5]){
  const s=spec(digit);s.steady=.5;const moving=expectedDirect(s),standing=expectedDirect(s,{stationary:true});
  assert.equal(moving.canAttack,false);assert.equal(moving.dps,0);assert.equal(moving.stationarySeconds,s.weapon.stationarySeconds);
  assert.equal(standing.canAttack,true);near(standing.dps,s.damage*1.5*s.rate);assert.equal(fixedHitTrial(s).directDps,0);
  near(fixedHitTrial(s,{seconds:100,stationary:true}).directDps,standing.dps);
 }
});

test('attack HUD state reads do not mutate simulation or RNG',()=>{
 const e=arena(2);advance(e,.09);const before={player:structuredClone(e.player),timer:e.shotTimer,time:e.totalTime,damage:e.totalDamage};
 assert.deepEqual(e.weaponAttackState(),{mode:'preparing',progress:.5,remaining:.09});
 assert.deepEqual({player:e.player,timer:e.shotTimer,time:e.totalTime,damage:e.totalDamage},before);
 e.player.still=.18;e.shotTimer=0;assert.deepEqual(e.weaponAttackState(),{mode:'ready',progress:1,remaining:0});
});
