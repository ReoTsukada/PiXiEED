import {floorStats} from './combat-math.mjs';
import {makeRng,rollItem} from './core.mjs';
import {makeMap,mapWall,distanceGrid} from './map.mjs';
import {createExploration,updateExploration,isVisible,lineOfSight} from './fog.mjs';
import {weaponForDigit} from './weapons.mjs';
import {biomeForFloor,biomeCycle,MONSTERS} from './world.mjs';
import {rollEnemyDrops} from './loot.mjs';
import {CONSUMABLE_BY_ID} from './items.mjs';
export function angleDistance(a,b){return Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));}
export function pointSegmentDistance(x,y,ax,ay,bx,by){const dx=bx-ax,dy=by-ay,l=dx*dx+dy*dy;const t=l?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l)):0;return Math.hypot(x-ax-t*dx,y-ay-t*dy);}
export const MOVEMENT_DEADZONE=.05;
/** Pure simulation. No DOM, no storage, no networking. 60Hz caller recommended. */
export class GameEngine {
 constructor(spec,{seed=Date.now()>>>0,onEvent=()=>{},startFloor=1,runId=`run-${seed}`,cargoCapacity={cores:Infinity,equipment:Infinity}}={}){
  if(typeof runId!=='string'||!runId||runId.length>70)throw Error('探索IDは1〜70文字が必要');
  if(!cargoCapacity||typeof cargoCapacity!=='object'||Array.isArray(cargoCapacity))throw Error('戦利品上限が不正');
  this.cargoCapacity={cores:cargoCapacity.cores??Infinity,equipment:cargoCapacity.equipment??Infinity};
  if(Object.values(this.cargoCapacity).some(value=>value!==Infinity&&(!Number.isSafeInteger(value)||value<0)))throw Error('戦利品上限は0以上の整数が必要');
  this.fullCargoNotified=new Set();
  this.spec=structuredClone(spec);this.spec.weapon??={...weaponForDigit(6)};this.spec.range??=this.spec.weapon.range;this.seed=seed;this.runId=runId;this.rng=makeRng(seed);this.onEvent=onEvent;
  this.player={x:0,y:0,hp:spec.maxHp,invuln:0,still:0,moving:false,facing:0,attackTime:0,weaponId:this.spec.weapon.id,ward:null,slowTime:0,slowStrength:0};this.itemCooldown=0;this.hazardCooldown=0;this.combo=0;this.lastAttackAt=-10;this.pendingBursts=[];this.loot=[];this.cargo={materials:{},equipment:[],consumables:{}};this.gold=0;this.totalKills=0;this.totalTime=0;this.totalDamage=0;this.damageBySource={direct:0,blast:0,chain:0,poison:0};this.damageEvents=0;this.pendingLeech=0;
  this.clearedFloor=0;this.clearTime=0;this.level=1;this.shotCredit=0;this.bonusCredit=0;this.shotTimer=0;this.id=0;this.status='playing';this.logs=[];this.nextFloor(startFloor);
 }
 nextFloor(n=this.floor+1){
  this.floor=n;this.map=makeMap(this.seed,n);Object.assign(this.player,{x:this.map.spawn.x,y:this.map.spawn.y,still:0,moving:false,attackTime:0});this.exploration=createExploration(this.map);this.updateSight();this.pendingBursts=[];this.combo=0;
  this.enemies=[];this.bullets=[];this.hostileBullets=[];this.telegraphs=[];this.pickups=[];this.fx=[];this.floorTime=0;this.floorKills=0;this.spawnTimer=0.5;this.flowTimer=0;this.gates=false;this.hazardCooldown=0;
  this.biome=biomeForFloor(n);this.floorBoss=null;this.bossDefeated=n%5!==0;
  if(!this.bossDefeated){
   const room=this.map.rooms.find(room=>room.id===this.map.stairs.roomId);
   this.floorBoss=this.createEnemy(this.biome.bossId,room?.center||this.map.stairs,{floorBoss:true});this.enemies.push(this.floorBoss);
  }
  this.goalKills=Math.min(30,6+2*n);this.goalTime=20;this.onEvent({type:'floor',floor:n,biomeId:this.biome.id,bossId:this.floorBoss?.monsterId||null});
 }
 heal(amount,allowBonus=true){const real=Math.max(0,Math.min(amount,this.spec.maxHp-this.player.hp));this.player.hp+=real;if(allowBonus)this.bonusCredit+=real/10*this.spec.recovery;return real;}
 leech(amount){if(this.player.hp>=this.spec.maxHp)return 0;const queued=Math.min(Math.max(0,amount),Math.max(0,this.spec.maxHp*.08-this.pendingLeech));this.pendingLeech+=queued;return queued;}
 settleLeech(dt){if(this.player.hp>=this.spec.maxHp){this.pendingLeech=0;return 0;}const amount=Math.min(this.pendingLeech,this.spec.maxHp*.08*dt);this.pendingLeech-=amount;return this.heal(amount);}
 sampleCount(value){return Math.floor(value)+(this.rng()<value%1?1:0);}
 effect(type,x,y,extra={}){this.fx.push({type,x,y,life:0.3,total:0.3,...extra});if(this.fx.length>220)this.fx.shift();} // Visual-only budget.
 canUseConsumable(itemId){
  if(this.status!=='playing'||this.isBoss||this.player.hp<=0||this.itemCooldown>0||!Object.hasOwn(CONSUMABLE_BY_ID,itemId))return false;
  return itemId==='healing_draught'?this.player.hp<this.spec.maxHp:!(this.player.ward?.remaining>0);
 }
 useConsumable(effect){
  const itemId=effect?.itemId||(effect?.healFraction!==undefined?'healing_draught':'ward_scroll');
  if(!this.canUseConsumable(itemId))return false;
  const definition=CONSUMABLE_BY_ID[itemId].effect;
  // Accept only the shared item definition, so callers cannot accidentally apply a different dose.
  if(!effect||Object.entries(definition).some(([key,value])=>effect[key]!==value))return false;
  if(itemId==='healing_draught')this.heal(this.spec.maxHp*definition.healFraction);
  else this.player.ward={remaining:definition.duration,damageReduction:definition.damageReduction,statusResistance:definition.statusResistance};
  this.itemCooldown=1;this.effect('heal',this.player.x,this.player.y,{color:itemId==='healing_draught'?'#a0dfab':'#b5ceff',radius:25});this.onEvent({type:'consumable',itemId});return true;
 }
 statusResistance(){return 1-(1-Math.min(1,Math.max(0,this.spec.statusResistance||0)))*(1-(this.player.ward?.statusResistance||0));}
 damagePlayer(amount,{slow=0,kind='contact',sourceId=null}={}){
  const p=this.player;if(p.hp<=0||p.invuln>0||!Number.isFinite(amount)||amount<=0)return 0;
  const reduction=Math.min(1,Math.max(0,this.spec.armorMitigation||0)),ward=p.ward?.damageReduction||0;
  const dealt=Math.min(p.hp,amount*(1-reduction)*(1-ward));p.hp-=dealt;p.invuln=.55;
  if(slow>0){const keep=1-this.statusResistance();p.slowTime=Math.max(p.slowTime,slow*keep);p.slowStrength=Math.max(p.slowStrength,.4*keep);}
  this.effect('hit',p.x,p.y,{color:'#fa6680',radius:20});this.onEvent({type:'damage',amount:dealt,kind,sourceId});return dealt;
 }
 updateSight(){
  if(this.exploration?.width!==this.map.w||this.exploration?.height!==this.map.h)this.exploration=createExploration(this.map,{revealAll:!!this.isBoss});
  updateExploration(this.map,this.player,this.exploration,{radius:this.spec.vision??8,revealAll:!!this.isBoss});
 }
 target(x,y,exclude=new Set(),range=this.spec.range){
  this.updateSight();let chosen=null,dist=range;
  for(const e of this.enemies){
   if(e.hp<=0||e.warm>0||exclude.has(e.id)||!isVisible(this.map,this.exploration,e.x,e.y)||!lineOfSight(this.map,x,y,e.x,e.y))continue;
   const d=Math.hypot(e.x-x,e.y-y);if(d<dist){dist=d;chosen=e;}
  }return chosen;
 }
 bullet(x,y,angle,{damage=this.spec.damage,gen=0,noHeal=false,kind,hitIds=[]}={}){
  const w=this.spec.weapon,fragment=gen>0,style=kind||(fragment?'shard':w.style);
  const speed=fragment?400:w.projectileSpeed||400,range=fragment?Math.max(120,this.spec.range):this.spec.range;
  const b={id:this.id++,x,y,px:x,py:y,originX:x,originY:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,speed,damage,gen,noHeal,didSplit:false,life:range/speed*(style==='chakram'?3:1)+.3,pierce:this.sampleCount(this.spec.pierce)+(fragment?0:w.innatePierce||0),bounce:this.sampleCount(this.spec.bounce),hit:new Set(hitIds),distance:0,phaseDistance:0,maxDistance:range,kind:style,weaponId:w.id,radius:fragment?3:w.projectileRadius||3,z:15,color:w.color,returning:false,angle,hasBurst:false};
  this.bullets.push(b);return b;
 }
 isWeaponPrepared(){
  const required=this.spec.weapon.stationarySeconds||0;
  return required<=0||(!this.player.moving&&this.player.still+1e-9>=required);
 }
 /** Read-only HUD state. Preparation is independent of the ordinary attack cooldown. */
 weaponAttackState(){
  const required=this.spec.weapon.stationarySeconds||0;
  if(required<=0)return {mode:'mobile',progress:1,remaining:0};
  if(this.player.moving)return {mode:'moving',progress:0,remaining:required};
  if(!this.isWeaponPrepared())return {mode:'preparing',progress:Math.max(0,Math.min(1,this.player.still/required)),remaining:Math.max(0,required-this.player.still)};
  if(this.shotTimer>1e-9)return {mode:'cooldown',progress:Math.max(0,Math.min(1,1-this.shotTimer*this.spec.rate)),remaining:this.shotTimer};
  return {mode:'ready',progress:1,remaining:0};
 }
 volley(bonus=false){
  if(!this.isWeaponPrepared())return false;
  const p=this.player,w=this.spec.weapon,t=this.target(p.x,p.y,new Set(),this.spec.range+(w.kind==='melee'?36:0));if(!t)return false;
  // A large target can be struck at its edge; do not swing at a small enemy beyond reach.
  if(w.kind==='melee'&&Math.hypot(t.x-p.x,t.y-p.y)-(t.r||10)>this.spec.range)return false;
  let count=1;if(!bonus){this.shotCredit+=this.spec.multi;count+=Math.floor(this.shotCredit);this.shotCredit%=1;}
  const angle=Math.atan2(t.y-p.y,t.x-p.x);p.facing=angle;p.attackTime=Math.min(.34,.7/this.spec.rate);
  if(w.kind==='melee'){
   for(let i=0;i<count;i++)this.meleeAttack(angle,bonus);
  }else{
   this.projectileVolley(angle,count,bonus);
   for(let step=1;step<(w.burst||1);step++)this.pendingBursts.push({at:this.totalTime+step*w.burstGap,count,noHeal:bonus});
  }
  return true;
 }
 projectileVolley(angle,count,noHeal){
  if(!this.isWeaponPrepared())return false;
  const p=this.player;
  for(let i=0;i<count;i++)this.bullet(p.x,p.y,angle+(i-(count-1)/2)*Math.min(.13,1.7/Math.max(1,count)),{noHeal});
 }
 meleeAttack(angle,noHeal=false){
  if(!this.isWeaponPrepared())return false;
  const p=this.player,s=this.spec,w=s.weapon;
  if(this.totalTime-this.lastAttackAt>2)this.combo=0;this.lastAttackAt=this.totalTime;this.combo++;
  const comboHit=w.combo&&this.combo%w.combo===0,damage=s.damage*(comboHit?w.comboDamage:1);
  const reach=s.range,arc=Math.min(Math.PI*2,w.arc+Math.max(0,s.homing)*.35),width=(w.width||12)+Math.max(0,s.homing)*7;
  this.effect(w.id==='spear'?'thrust':w.id==='hammer'?'slam':'slash',p.x,p.y,{angle,range:reach,arc,color:comboHit?'#fff5c5':w.color,life:.2,total:.2,weaponId:w.id,width});
  const candidates=this.enemies.filter(e=>{
   if(e.hp<=0||e.warm>0||!isVisible(this.map,this.exploration,e.x,e.y)||!lineOfSight(this.map,p.x,p.y,e.x,e.y))return false;
   const dx=e.x-p.x,dy=e.y-p.y,d=Math.hypot(dx,dy),r=e.r||10;
   if(d-r>reach)return false;
   if(w.id==='spear'){const along=dx*Math.cos(angle)+dy*Math.sin(angle),side=Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle));return along>=-r&&along<=reach+r&&side<=width+r;}
   return angleDistance(Math.atan2(dy,dx),angle)<=arc/2+Math.asin(Math.min(1,r/Math.max(r,d)));
  }).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y));
  const capacity=w.cleave+this.sampleCount(s.pierce),hit=candidates.slice(0,capacity);
  // All melee hits share one attack's fragmentation trigger; one swing never recursively splits.
  const attack={damage,gen:0,noHeal,didSplit:false,distance:0,vx:Math.cos(angle),vy:Math.sin(angle),weaponId:w.id,kind:'melee'};
  for(const e of hit){attack.distance=Math.hypot(e.x-p.x,e.y-p.y);this.impact(attack,e);if(w.knockback&&!e.immortal&&!e.isFloorBoss&&e.hp>0)this.moveBody(e,Math.cos(angle)*w.knockback,Math.sin(angle)*w.knockback,1,e.r||10);}
  // Reflection on a blade becomes a finite chain of weaker echo strikes, each to a new target.
  if(hit.length&&s.bounce>0){let from=hit[0];const used=new Set(hit.map(e=>e.id)),count=this.sampleCount(s.bounce);
   for(let i=0;i<count;i++){const next=this.target(from.x,from.y,used,90);if(!next)break;used.add(next.id);this.effect('arc',from.x,from.y,{tx:next.x,ty:next.y,color:w.color});this.impact({...attack,damage:damage*.45,gen:1,didSplit:true,distance:Math.hypot(next.x-p.x,next.y-p.y)},next);from=next;}
  }
 }
 hurt(e,amount,source){
  if(e.hp<=0)return 0;const dealt=Math.min(e.hp,Math.max(0,amount));e.hp-=dealt;this.totalDamage+=dealt;this.damageBySource[source]=(this.damageBySource[source]||0)+dealt;this.damageEvents++;e.flash=0.08;
  if(e.hp<=0){this.totalKills++;this.floorKills++;this.effect('death',e.x,e.y,{color:e.color});
   if(this.totalKills%12===0&&this.level<21){this.level++;this.heal(7);this.onEvent({type:'level',level:this.level});}
   const drops=rollEnemyDrops(this.rng,{enemyId:e.monsterId||this.biome.monsters[0],floor:this.floor,idPrefix:`${this.runId}-${this.id++}`});
   if(this.floorKills===3&&(!drops.some(drop=>drop.kind==='core')||e.isFloorBoss))drops.push({kind:'core',core:rollItem(this.rng,this.floor,`${this.runId}-guaranteed-${this.id++}`)});
   for(const drop of drops)this.pickups.push({id:this.id++,x:e.x,y:e.y,...drop});
   if(e.isFloorBoss){this.bossDefeated=true;this.onEvent({type:'floor-boss-defeated',monsterId:e.monsterId,floor:this.floor});}
   this.telegraphs=this.telegraphs.filter(t=>t.sourceId!==e.id);
   this.logs.push({time:+this.totalTime.toFixed(2),source,damage:+dealt.toFixed(2)});if(this.logs.length>100)this.logs.shift();
  }return dealt;
 }
 collectPickups(){
  const p=this.player;
  this.pickups=this.pickups.filter(drop=>{
   if(Math.hypot(drop.x-p.x,drop.y-p.y)>=this.spec.pickup||!lineOfSight(this.map,p.x,p.y,drop.x,drop.y))return true;
   const kind=drop.kind||(drop.core?'core':null);
   if((kind==='core'&&this.loot.length>=this.cargoCapacity.cores)||(kind==='equipment'&&this.cargo.equipment.length>=this.cargoCapacity.equipment)){
    if(!this.fullCargoNotified.has(kind)){this.fullCargoNotified.add(kind);this.onEvent({type:'cargo-full',kind});}return true;
   }
   if(kind==='core'){this.loot.push(drop.core);this.onEvent({type:'loot',core:drop.core});}
   else if(kind==='gold')this.gold+=drop.amount;
   else if(kind==='equipment')this.cargo.equipment.push(drop.item);
   else if(kind==='material')this.cargo.materials[drop.itemId]=(this.cargo.materials[drop.itemId]||0)+drop.amount;
   else if(kind==='consumable')this.cargo.consumables[drop.itemId]=(this.cargo.consumables[drop.itemId]||0)+drop.amount;
   else return true;
   this.onEvent({type:'pickup',drop,kind,...(drop.itemId?{itemId:drop.itemId}:{}),amount:drop.amount||1});return false;
  });
 }
 impact(b,e){
  const s=this.spec;let damage=b.damage*(1+(this.level-1)*0.10);
  if((e.vitalRatio??(e.hp/e.maxHp))<.35)damage*=1+s.execute;
  damage*=1+s.longshot*Math.min(1,b.distance/(this.spec.range||500));
  if(this.player.still>=.7)damage*=1+s.steady;
  const payload=damage;if(this.rng()<s.crit)damage*=s.critMultiplier;
  const real=this.hurt(e,damage,'direct');if(!b.noHeal)this.leech(real*s.drain);
  this.effect('hit',e.x,e.y,{color:'#e6f5ff',radius:5});
  if(s.poison){e.poison=3;e.poisonDps=Math.max(e.poisonDps||0,payload*s.poison);}
  if(s.slow)e.slow=2;
  if(s.blast){const radius=18+Math.sqrt(s.blast)*33;this.effect('blast',e.x,e.y,{radius,color:'#ffb27e'});for(const other of this.enemies)if(other!==e&&other.hp>0&&other.warm<=0&&Math.hypot(other.x-e.x,other.y-e.y)<radius&&lineOfSight(this.map,e.x,e.y,other.x,other.y))this.hurt(other,payload*s.blast*.75,'blast');}
  if(s.chain){let origin=e;const used=new Set([e.id]);const targets=1+Math.floor(Math.sqrt(s.chain));for(let i=0;i<targets;i++){const next=this.target(origin.x,origin.y,used,100+Math.sqrt(s.chain)*35);if(!next)break;this.effect('arc',origin.x,origin.y,{tx:next.x,ty:next.y,color:'#c5afff'});used.add(next.id);this.hurt(next,payload*s.chain*.4,'chain');origin=next;}}
  if(b.kind==='orb'&&b.gen===0&&!b.hasBurst){b.hasBurst=true;const w=s.weapon;this.effect('blast',e.x,e.y,{radius:w.burstRadius,color:w.color});for(const other of this.enemies)if(other!==e&&other.hp>0&&other.warm<=0&&Math.hypot(other.x-e.x,other.y-e.y)<w.burstRadius&&lineOfSight(this.map,e.x,e.y,other.x,other.y))this.hurt(other,payload*w.burstDamage,'blast');}
  if(b.kind==='chakram'&&b.gen===0&&s.pierce>0){const echoes=this.sampleCount(s.pierce);if(echoes)this.hurt(e,payload*.35*echoes,'direct');}
  if(s.split&&b.gen===0&&!b.didSplit){b.didSplit=true;const count=this.sampleCount(s.split);const a=Math.atan2(b.vy,b.vx);for(let i=0;i<count;i++){this.bullet(e.x,e.y,a+(i-(count-1)/2)*.32+.35,{damage:b.damage*.45,gen:1,noHeal:b.noHeal,hitIds:[e.id]});}}
 }
 stepBullet(b,dt){
  if(b.life<=0)return;b.life-=dt;const s=this.spec,p=this.player;b.px=b.x;b.py=b.y;
  if(b.kind==='chakram'&&b.phaseDistance>=b.maxDistance&&!b.returning)this.returnBlade(b);
  if(b.returning){const angle=Math.atan2(p.y-b.y,p.x-b.x);b.vx=Math.cos(angle)*b.speed;b.vy=Math.sin(angle)*b.speed;if(Math.hypot(p.x-b.x,p.y-b.y)<12){b.life=0;return;}}
  else {
   const turn=(s.homing||0)*2+(b.gen===0?(s.weapon.innateHoming||0):0);
   if(turn){const t=this.target(b.x,b.y,b.hit,Math.min(260,b.maxDistance));if(t){const a=Math.atan2(b.vy,b.vx),target=Math.atan2(t.y-b.y,t.x-b.x),d=Math.atan2(Math.sin(target-a),Math.cos(target-a));const delta=Math.max(-turn*dt,Math.min(turn*dt,d));b.vx=Math.cos(a+delta)*b.speed;b.vy=Math.sin(a+delta)*b.speed;}}
  }
  let remaining=b.speed*dt;if(!b.returning)remaining=Math.min(remaining,Math.max(0,b.maxDistance-b.phaseDistance));
  const steps=Math.max(1,Math.ceil(remaining/5)),step=remaining/steps;
  for(let i=0;i<steps&&b.life>0;i++){
   const ax=b.x,ay=b.y,nx=ax+b.vx/b.speed*step,ny=ay+b.vy/b.speed*step;
   if(mapWall(this.map,nx,ny,1)||!lineOfSight(this.map,ax,ay,nx,ny)){
    if(b.bounce>0){b.bounce--;const hitX=mapWall(this.map,nx,ay,1),hitY=mapWall(this.map,ax,ny,1);if(hitX||!hitY)b.vx*=-1;if(hitY)b.vy*=-1;}
    else if(b.kind==='chakram'&&!b.returning)this.returnBlade(b);else b.life=0;
    break;
   }
   b.x=nx;b.y=ny;b.distance+=step;b.phaseDistance+=step;
   const collisions=this.enemies.filter(e=>e.hp>0&&e.warm<=0&&!b.hit.has(e.id)&&pointSegmentDistance(e.x,e.y,ax,ay,nx,ny)<(e.r||10)+(b.radius||3)&&lineOfSight(this.map,b.x,b.y,e.x,e.y)).sort((a,c)=>Math.hypot(a.x-ax,a.y-ay)-Math.hypot(c.x-ax,c.y-ay));
   for(const e of collisions){b.hit.add(e.id);this.impact(b,e);if(b.kind==='chakram')continue;if(b.pierce>0)b.pierce--;else{b.life=0;break;}}
  }
  b.angle=Math.atan2(b.vy,b.vx);
  if(!b.returning&&b.phaseDistance>=b.maxDistance-1e-8){if(b.kind==='chakram')this.returnBlade(b);else b.life=0;}
 }
 returnBlade(b){b.returning=true;b.hit.clear();b.phaseDistance=0;const a=Math.atan2(this.player.y-b.y,this.player.x-b.x);b.vx=Math.cos(a)*b.speed;b.vy=Math.sin(a)*b.speed;}
 createEnemy(monsterId,at,{floorBoss=false}={}){
  const definition=MONSTERS[monsterId];if(!definition)throw Error('未知の魔物');
  const hp=floorStats(this.floor).hp*definition.hpFactor,cycle=biomeCycle(this.floor);
  return {id:this.id++,monsterId,sprite:monsterId,name:definition.name+(floorBoss&&cycle?`・第${cycle+1}巡`:''),x:at.x,y:at.y,hp,maxHp:hp,speed:definition.speed*(1+Math.min(.7,this.floor*.015)),r:definition.radius,color:definition.color,ai:definition.ai,contactFactor:definition.contactFactor,warm:.7,slow:0,poison:0,poisonDps:0,flash:0,facing:0,attackTime:0,attackCooldown:1,attackIndex:0,aiState:'approach',phase:1,isFloorBoss:floorBoss,anchor:{x:at.x,y:at.y}};
 }
 spawn(){
  if(this.enemies.length>=90)return;const p=this.player,monsterId=this.biome.monsters[Math.floor(this.rng()*this.biome.monsters.length)],definition=MONSTERS[monsterId];
  const options=this.map.open.filter(t=>{const d=Math.hypot(t.x-p.x,t.y-p.y);return d>175&&d<530&&!mapWall(this.map,t.x,t.y,definition.radius);});if(!options.length)return;
  const at=options[Math.floor(this.rng()*options.length)];this.enemies.push(this.createEnemy(monsterId,at));
 }
 moveBody(obj,vx,vy,dt,r){
  // Small substeps prevent a charge, knockback, or high-speed build crossing a wall.
  const dx=vx*dt,dy=vy*dt,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/6));
  for(let i=0;i<steps;i++){const nx=obj.x+dx/steps,ny=obj.y+dy/steps;if(!mapWall(this.map,nx,obj.y,r))obj.x=nx;if(!mapWall(this.map,obj.x,ny,r))obj.y=ny;}
 }
 pursuitAngle(e){
  const m=this.map,p=this.player;if(lineOfSight(m,e.x,e.y,p.x,p.y))return Math.atan2(p.y-e.y,p.x-e.x);
  let tx=p.x,ty=p.y;const gx=Math.floor(e.x/m.tile),gy=Math.floor(e.y/m.tile);let best=this.flow?.[gy]?.[gx]??Infinity;if(best<0)best=Infinity;
  for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const d=this.flow?.[gy+dy]?.[gx+dx];if(d>=0&&d<best){best=d;tx=(gx+dx+.5)*m.tile;ty=(gy+dy+.5)*m.tile;}}
  return Math.atan2(ty-e.y,tx-e.x);
 }
 beginEnemyAttack(e,attack){
  const p=this.player,angle=Math.atan2(p.y-e.y,p.x-e.x),range=attack.range,windup=attack.windup;
  const type=attack.type==='area'||attack.type==='slam'?'circle':attack.type==='cone'||(attack.count||1)>1?'cone':'line';
  const origin={x:e.x,y:e.y},x=attack.type==='area'?p.x:e.x,y=attack.type==='area'?p.y:e.y;
  const length=attack.type==='charge'?attack.speed*attack.duration:range;
  this.telegraphs.push({id:this.id++,type,x,y,tx:e.x+Math.cos(angle)*length,ty:e.y+Math.sin(angle)*length,angle,range:length,radius:attack.radius||length,width:attack.type==='charge'?e.r*2:9,arc:attack.arc||Math.max(.18,(attack.count-1)*(attack.spread||0)+.18),remaining:windup,total:windup,color:e.color,sourceId:e.id,attack:{...attack},origin});
  e.facing=angle;e.attackTime=windup;e.aiState='windup';e.attackCooldown=attack.cooldown*(e.phase===2?.75:1);e.attackIndex++;
 }
 releaseEnemyAttack(t,e){
  const attack=t.attack,damage=floorStats(this.floor).contact*attack.damageFactor,p=this.player;
  e.aiState='recover';e.attackTime=.25;
  if(attack.type==='shot'){
   const count=attack.count||1,speed=attack.projectileSpeed;
   for(let i=0;i<count;i++){const angle=t.angle+(i-(count-1)/2)*(attack.spread||0);this.hostileBullets.push({id:this.id++,x:t.origin.x,y:t.origin.y,px:t.origin.x,py:t.origin.y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,speed,life:attack.range/speed,radius:attack.projectileKind==='arrow'?3:5,color:e.color,kind:attack.projectileKind||'orb',sourceId:e.id,damage,slow:attack.slow||0,remainingRange:attack.range});}
  }else if(attack.type==='charge'){
   e.charge={angle:t.angle,remaining:attack.duration,speed:attack.speed,damage,slow:attack.slow||0};e.aiState='charge';
  }else{
   const inRadius=Math.hypot(p.x-t.x,p.y-t.y)<=t.radius+9;
   const inCone=attack.type!=='cone'||angleDistance(Math.atan2(p.y-t.y,p.x-t.x),t.angle)<=t.arc/2;
   if(inRadius&&inCone&&lineOfSight(this.map,t.x,t.y,p.x,p.y)&&lineOfSight(this.map,t.origin.x,t.origin.y,p.x,p.y))this.damagePlayer(damage,{slow:attack.slow||0,kind:attack.type,sourceId:e.id});
   this.effect('blast',t.x,t.y,{radius:t.radius,color:e.color,life:.4,total:.4});
  }
 }
 updateTelegraphs(dt){
  const pending=[];
  for(const t of this.telegraphs){const e=this.enemies.find(e=>e.id===t.sourceId&&e.hp>0);if(!e)continue;t.remaining-=dt;if(t.remaining<=0)this.releaseEnemyAttack(t,e);else pending.push(t);}
  this.telegraphs=pending;
 }
 stepHostileBullet(b,dt){
  if(b.life<=0)return;const elapsed=Math.min(dt,b.life);b.px=b.x;b.py=b.y;
  const travel=Math.min(b.speed*elapsed,b.remainingRange),steps=Math.max(1,Math.ceil(travel/5)),distance=travel/steps,p=this.player;
  for(let i=0;i<steps&&b.life>0;i++){
   const x=b.x+b.vx/b.speed*distance,y=b.y+b.vy/b.speed*distance;
   if(mapWall(this.map,x,y,b.radius)||!lineOfSight(this.map,b.x,b.y,x,y)){b.life=0;break;}
   if(pointSegmentDistance(p.x,p.y,b.x,b.y,x,y)<9+b.radius&&lineOfSight(this.map,x,y,p.x,p.y)){this.damagePlayer(b.damage,{slow:b.slow,kind:b.kind,sourceId:b.sourceId});b.life=0;}
   b.x=x;b.y=y;b.remainingRange-=distance;
  }
  b.life=Math.max(0,b.life-elapsed);if(b.remainingRange<=1e-8)b.life=0;
 }
 updateEnemy(e,dt){
  if(e.hp<=0)return;e.flash=Math.max(0,(e.flash||0)-dt);e.attackTime=Math.max(0,(e.attackTime||0)-dt);e.warm=Math.max(0,(e.warm||0)-dt);if(e.warm>0)return;
  if(e.poison>0){e.poison-=dt;this.hurt(e,e.poisonDps*dt,'poison');}if(e.hp<=0)return;e.slow=Math.max(0,(e.slow||0)-dt);
  const p=this.player,definition=MONSTERS[e.monsterId],distance=Math.hypot(p.x-e.x,p.y-e.y),los=lineOfSight(this.map,e.x,e.y,p.x,p.y);
  if(e.isFloorBoss&&e.phase===1&&e.hp<=e.maxHp*.5){e.phase=2;e.attackCooldown*=.75;this.onEvent({type:'boss-phase',phase:2,monsterId:e.monsterId});}
  if(e.aiState==='windup')return;
  e.attackCooldown=Math.max(0,(e.attackCooldown||0)-dt);
  if(e.charge){
   const charge=e.charge,slowFactor=e.slow>0?1/(1+this.spec.slow):1,oldX=e.x,oldY=e.y;
   this.moveBody(e,Math.cos(charge.angle)*charge.speed*slowFactor,Math.sin(charge.angle)*charge.speed*slowFactor,dt,e.r);charge.remaining-=dt;
   if((distance<e.r+10||pointSegmentDistance(p.x,p.y,oldX,oldY,e.x,e.y)<e.r+9)&&lineOfSight(this.map,e.x,e.y,p.x,p.y))this.damagePlayer(charge.damage,{slow:charge.slow,kind:'charge',sourceId:e.id});
   if(charge.remaining<=0||Math.hypot(e.x-oldX,e.y-oldY)<charge.speed*slowFactor*dt*.3){e.charge=null;e.aiState='recover';}
   return;
  }
  const attack=definition?.attacks?.[e.attackIndex%definition.attacks.length]||definition?.attack;
  if(attack&&e.attackCooldown<=0&&distance<=attack.range&&los&&isVisible(this.map,this.exploration,e.x,e.y)){this.beginEnemyAttack(e,attack);return;}
  let angle=this.pursuitAngle(e),speed=e.speed/(e.slow>0?1+this.spec.slow:1),ai=e.ai||'chase';
  if(e.isFloorBoss){
   // Guardians defend the final chamber instead of entering narrow corridors unseen.
   if(!los||distance>420){speed=0;e.aiState='guard';}
   else if(attack&&distance<attack.range*.72){speed=0;e.aiState='ready';}
  }else if(los&&(ai==='ranged'||ai==='caster')){
   if(distance<115){angle+=Math.PI;e.aiState='retreat';}
   else if(distance<(attack?.range||220)*.85){angle+=(e.id%2?1:-1)*Math.PI/2;speed*=.5;e.aiState='strafe';}
   else e.aiState='approach';
  }else if(los&&ai==='orbit'&&distance<145){angle+=(e.id%2?1:-1)*1.05;speed*=.9;e.aiState='orbit';}
  else e.aiState='approach';
  if(ai==='hop'){const pulse=(this.totalTime+(e.id%7)*.17)%1.1;speed*=pulse<.42?1.9:.2;e.aiState=pulse<.42?'hop':'rest';}
  if(speed>0){e.facing=angle;this.moveBody(e,Math.cos(angle)*speed,Math.sin(angle)*speed,dt,e.r||10);}
  if(Math.hypot(e.x-p.x,e.y-p.y)<(e.r||10)+10&&lineOfSight(this.map,e.x,e.y,p.x,p.y))this.damagePlayer(floorStats(this.floor).contact*(e.contactFactor??1),{kind:'contact',sourceId:e.id});
 }
 terrainSlow(){
  const p=this.player,keep=1-this.statusResistance();let speed=1;
  for(const h of this.map.hazards||[])if(Math.hypot(p.x-h.x,p.y-h.y)<h.radius+6)speed=Math.min(speed,1-(1-(h.slowFactor??1))*keep);
  return speed*(p.slowTime>0?1-p.slowStrength:1);
 }
 updateHazards(dt){
  this.hazardCooldown=Math.max(0,this.hazardCooldown-dt);if(this.hazardCooldown>0)return;
  const p=this.player,hazard=(this.map.hazards||[]).find(h=>h.damageFactor>0&&Math.hypot(p.x-h.x,p.y-h.y)<h.radius+6);
  if(hazard){this.damagePlayer(floorStats(this.floor).contact*hazard.damageFactor,{kind:hazard.kind});this.hazardCooldown=.6;}
 }
 tick(dt,input={x:0,y:0}){
  if(this.status!=='playing'||!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,1/30);const s=this.spec,p=this.player,m=this.map;
  if(p.hp<=0){p.hp=0;this.status='dead';this.onEvent({type:'dead'});return;}
  this.totalTime+=dt;this.floorTime+=dt;p.invuln=Math.max(0,p.invuln-dt);p.attackTime=Math.max(0,p.attackTime-dt);this.itemCooldown=Math.max(0,this.itemCooldown-dt);p.slowTime=Math.max(0,p.slowTime-dt);if(!p.slowTime)p.slowStrength=0;
  if(p.ward){p.ward.remaining-=dt;if(p.ward.remaining<=0)p.ward=null;}
  const wasPrepared=this.isWeaponPrepared(),len=Math.hypot(input.x,input.y);p.moving=len>MOVEMENT_DEADZONE;p.still=p.moving?0:p.still+dt;const move=s.move*this.terrainSlow();
  if(p.moving)this.moveBody(p,input.x/Math.max(1,len)*move,input.y/Math.max(1,len)*move,dt,9);this.updateSight();this.settleLeech(dt);this.heal(s.regen*dt);this.updateHazards(dt);
  this.flowTimer-=dt;if(this.flowTimer<=0){this.flow=distanceGrid(m,Math.floor(p.x/m.tile),Math.floor(p.y/m.tile));this.flowTimer=.3;}
  this.spawnTimer-=dt;if(this.spawnTimer<=0){this.spawn();this.spawnTimer=Math.max(.15,.85-this.floor*.035);}
  this.shotTimer-=dt;
  // Cooldown keeps running during movement, but missed attacks are never banked.
  // The first prepared tick can release one ready attack; later ticks retain fractional time for fast builds.
  if(!(s.weapon.stationarySeconds>0)){while(this.shotTimer<=0){this.volley();this.shotTimer+=1/s.rate;}}
  else if(!this.isWeaponPrepared())this.shotTimer=Math.max(0,this.shotTimer);
  else{
   if(!wasPrepared)this.shotTimer=Math.max(0,this.shotTimer);
   while(this.shotTimer<=0){if(!this.volley()){this.shotTimer=0;break;}this.shotTimer+=1/s.rate;}
  }
  if(this.bonusCredit>=1&&this.volley(true))this.bonusCredit-=1;
  const due=this.pendingBursts.filter(b=>b.at<=this.totalTime);this.pendingBursts=this.pendingBursts.filter(b=>b.at>this.totalTime);
  for(const burst of due){const target=this.target(p.x,p.y);if(target){p.facing=Math.atan2(target.y-p.y,target.x-p.x);p.attackTime=.12;this.projectileVolley(p.facing,burst.count,burst.noHeal);}}

  for(const e of this.enemies)this.updateEnemy(e,dt);
  // Newly created fragments start next tick. Swept segments stop both tunnelling and wall shots.
  const existing=[...this.bullets];for(const b of existing)this.stepBullet(b,dt);
  this.updateTelegraphs(dt);for(const b of this.hostileBullets)this.stepHostileBullet(b,dt);this.hostileBullets=this.hostileBullets.filter(b=>b.life>0);
  this.bullets=this.bullets.filter(b=>b.life>0);this.enemies=this.enemies.filter(e=>e.hp>0);
  this.fx.forEach(f=>f.life-=dt);this.fx=this.fx.filter(f=>f.life>0);
  this.collectPickups();
  if(p.hp<=0){p.hp=0;this.status='dead';this.onEvent({type:'dead'});return;}
  if(!this.isBoss&&!this.gates&&this.floorTime>=this.goalTime&&this.floorKills>=this.goalKills&&this.bossDefeated){this.gates=true;this.clearedFloor=this.floor;this.clearTime=this.totalTime;this.onEvent({type:'gates'});}
  if(this.gates){if(Math.hypot(p.x-m.portal.x,p.y-m.portal.y)<23){this.status='returned';this.onEvent({type:'returned'});}else if(Math.hypot(p.x-m.stairs.x,p.y-m.stairs.y)<22){this.nextFloor();}}
 }
}
