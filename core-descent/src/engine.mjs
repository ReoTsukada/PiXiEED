import {floorStats} from './combat-math.mjs';
import {makeRng,rollItem} from './core.mjs';
import {makeMap,mapWall,distanceGrid} from './map.mjs';
/** Pure simulation. No DOM, no storage, no networking. 60Hz caller recommended. */
export class GameEngine {
 constructor(spec,{seed=Date.now()>>>0,onEvent=()=>{},startFloor=1}={}){
  this.spec=structuredClone(spec);this.seed=seed;this.rng=makeRng(seed);this.onEvent=onEvent;
  this.player={x:0,y:0,hp:spec.maxHp,invuln:0,still:0};this.loot=[];this.gold=0;this.totalKills=0;this.totalTime=0;this.totalDamage=0;this.damageBySource={direct:0,blast:0,chain:0,poison:0};this.damageEvents=0;this.pendingLeech=0;
  this.clearedFloor=0;this.clearTime=0;this.level=1;this.shotCredit=0;this.bonusCredit=0;this.shotTimer=0;this.id=0;this.status='playing';this.logs=[];this.nextFloor(startFloor);
 }
 nextFloor(n=this.floor+1){
  this.floor=n;this.map=makeMap(this.seed,n);Object.assign(this.player,{x:this.map.spawn.x,y:this.map.spawn.y});
  this.enemies=[];this.bullets=[];this.pickups=[];this.fx=[];this.floorTime=0;this.floorKills=0;this.spawnTimer=0.5;this.flowTimer=0;this.gates=false;
  this.goalKills=Math.min(30,6+2*n);this.goalTime=20;this.onEvent({type:'floor',floor:n});
 }
 heal(amount,allowBonus=true){const real=Math.max(0,Math.min(amount,this.spec.maxHp-this.player.hp));this.player.hp+=real;if(allowBonus)this.bonusCredit+=real/10*this.spec.recovery;return real;}
 leech(amount){if(this.player.hp>=this.spec.maxHp)return 0;const queued=Math.min(Math.max(0,amount),Math.max(0,this.spec.maxHp*.08-this.pendingLeech));this.pendingLeech+=queued;return queued;}
 settleLeech(dt){if(this.player.hp>=this.spec.maxHp){this.pendingLeech=0;return 0;}const amount=Math.min(this.pendingLeech,this.spec.maxHp*.08*dt);this.pendingLeech-=amount;return this.heal(amount);}
 sampleCount(value){return Math.floor(value)+(this.rng()<value%1?1:0);}
 effect(type,x,y,extra={}){this.fx.push({type,x,y,life:0.3,total:0.3,...extra});if(this.fx.length>220)this.fx.shift();} // Visual-only budget.
 target(x,y,exclude=new Set(),range=700){let chosen=null,dist=range;for(const e of this.enemies){if(e.hp<=0||e.warm>0||exclude.has(e.id))continue;const d=Math.hypot(e.x-x,e.y-y);if(d<dist){dist=d;chosen=e;}}return chosen;}
 bullet(x,y,angle,{damage=this.spec.damage,gen=0,noHeal=false}={}){
  const speed=440;this.bullets.push({id:this.id++,x,y,px:x,py:y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,speed,damage,gen,noHeal,didSplit:false,life:2.1,pierce:this.sampleCount(this.spec.pierce),bounce:this.sampleCount(this.spec.bounce),hit:new Set(),distance:0});
 }
 volley(bonus=false){
  const p=this.player,t=this.target(p.x,p.y);if(!t)return false;let count=1;
  if(!bonus){this.shotCredit+=this.spec.multi;count+=Math.floor(this.shotCredit);this.shotCredit%=1;}
  const a=Math.atan2(t.y-p.y,t.x-p.x);
  for(let i=0;i<count;i++)this.bullet(p.x,p.y,a+(i-(count-1)/2)*Math.min(0.13,1.7/Math.max(1,count)),{noHeal:bonus});
  return true;
 }
 hurt(e,amount,source){
  if(e.hp<=0)return 0;const dealt=Math.min(e.hp,Math.max(0,amount));e.hp-=dealt;this.totalDamage+=dealt;this.damageBySource[source]=(this.damageBySource[source]||0)+dealt;this.damageEvents++;e.flash=0.08;
  if(e.hp<=0){this.totalKills++;this.floorKills++;this.gold+=2+this.floor;this.effect('death',e.x,e.y,{color:e.color});
   if(this.totalKills%12===0&&this.level<21){this.level++;this.heal(7);this.onEvent({type:'level',level:this.level});}
   if(this.rng()<0.12||this.floorKills===3){const core=rollItem(this.rng,this.floor,`loot-${this.seed}-${this.id++}`);this.pickups.push({x:e.x,y:e.y,core});}
   this.logs.push({time:+this.totalTime.toFixed(2),source,damage:+dealt.toFixed(2)});if(this.logs.length>100)this.logs.shift();
  }return dealt;
 }
 impact(b,e){
  const s=this.spec;let damage=b.damage*(1+(this.level-1)*0.10);
  if((e.vitalRatio??(e.hp/e.maxHp))<.35)damage*=1+s.execute;
  damage*=1+s.longshot*Math.min(1,b.distance/500);
  if(this.player.still>=.7)damage*=1+s.steady;
  const payload=damage;if(this.rng()<s.crit)damage*=s.critMultiplier;
  const real=this.hurt(e,damage,'direct');if(!b.noHeal)this.leech(real*s.drain);
  this.effect('hit',e.x,e.y,{color:'#e6f5ff',radius:5});
  if(s.poison){e.poison=3;e.poisonDps=Math.max(e.poisonDps||0,payload*s.poison);}
  if(s.slow)e.slow=2;
  if(s.blast){const radius=18+Math.sqrt(s.blast)*33;this.effect('blast',e.x,e.y,{radius,color:'#ffb27e'});for(const other of this.enemies)if(other!==e&&Math.hypot(other.x-e.x,other.y-e.y)<radius)this.hurt(other,payload*s.blast*.75,'blast');}
  if(s.chain){let origin=e;const used=new Set([e.id]);const targets=1+Math.floor(Math.sqrt(s.chain));for(let i=0;i<targets;i++){const next=this.target(origin.x,origin.y,used,100+Math.sqrt(s.chain)*35);if(!next)break;this.effect('arc',origin.x,origin.y,{tx:next.x,ty:next.y,color:'#c5afff'});used.add(next.id);this.hurt(next,payload*s.chain*.4,'chain');origin=next;}}
  if(s.split&&b.gen===0&&!b.didSplit){b.didSplit=true;const count=this.sampleCount(s.split);const a=Math.atan2(b.vy,b.vx);for(let i=0;i<count;i++){this.bullet(e.x,e.y,a+(i-(count-1)/2)*.32+.35,{damage:b.damage*.45,gen:1,noHeal:b.noHeal});this.bullets.at(-1).hit.add(e.id);}}
 }
 spawn(){
  if(this.enemies.length>=90)return;const p=this.player;const options=this.map.open.filter(t=>{const d=Math.hypot(t.x-p.x,t.y-p.y);return d>175&&d<530;});if(!options.length)return;
  const at=options[Math.floor(this.rng()*options.length)],elite=this.floor>=3&&this.rng()<.12,fast=this.rng()<.25;
  const hp=floorStats(this.floor).hp*(elite?3:fast?.7:1);
  this.enemies.push({id:this.id++,x:at.x,y:at.y,hp,maxHp:hp,speed:(fast?76:49)*(1+Math.min(.7,this.floor*.015)),r:elite?13:fast?8:10,color:elite?'#b89cfb':fast?'#ffbe78':'#ec858d',warm:.7,slow:0,poison:0,poisonDps:0,flash:0,elite});
 }
 moveBody(obj,vx,vy,dt,r){const nx=obj.x+vx*dt,ny=obj.y+vy*dt;if(!mapWall(this.map,nx,obj.y,r))obj.x=nx;if(!mapWall(this.map,obj.x,ny,r))obj.y=ny;}
 tick(dt,input={x:0,y:0}){
  if(this.status!=='playing')return;dt=Math.max(0,Math.min(dt,1/30));const s=this.spec,p=this.player,m=this.map;
  this.totalTime+=dt;this.floorTime+=dt;p.invuln=Math.max(0,p.invuln-dt);const len=Math.hypot(input.x,input.y);p.still=len>.05?0:p.still+dt;
  if(len>.01)this.moveBody(p,input.x/Math.max(1,len)*s.move,input.y/Math.max(1,len)*s.move,dt,9);this.settleLeech(dt);this.heal(s.regen*dt);
  this.flowTimer-=dt;if(this.flowTimer<=0){this.flow=distanceGrid(m,Math.floor(p.x/m.tile),Math.floor(p.y/m.tile));this.flowTimer=.3;}
  this.spawnTimer-=dt;if(this.spawnTimer<=0){this.spawn();this.spawnTimer=Math.max(.15,.85-this.floor*.035);}
  this.shotTimer-=dt;while(this.shotTimer<=0){this.volley();this.shotTimer+=1/s.rate;}
  if(this.bonusCredit>=1&&this.volley(true))this.bonusCredit-=1;
  for(const e of this.enemies){
   if(e.hp<=0)continue;e.flash=Math.max(0,e.flash-dt);e.warm=Math.max(0,e.warm-dt);if(e.warm>0)continue;
   if(e.poison>0){e.poison-=dt;this.hurt(e,e.poisonDps*dt,'poison');}if(e.hp<=0)continue;
   e.slow=Math.max(0,e.slow-dt);let tx=p.x,ty=p.y;const gx=Math.floor(e.x/m.tile),gy=Math.floor(e.y/m.tile),pgx=Math.floor(p.x/m.tile),pgy=Math.floor(p.y/m.tile);
   if(gx!==pgx||gy!==pgy){let best=this.flow[gy]?.[gx]??Infinity;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const d=this.flow[gy+dy]?.[gx+dx];if(d>=0&&d<best){best=d;tx=(gx+dx+.5)*m.tile;ty=(gy+dy+.5)*m.tile;}}}
   const a=Math.atan2(ty-e.y,tx-e.x),speed=e.speed/(e.slow>0?1+s.slow:1);this.moveBody(e,Math.cos(a)*speed,Math.sin(a)*speed,dt,e.r);
   if(Math.hypot(e.x-p.x,e.y-p.y)<e.r+10&&p.invuln<=0){p.hp-=floorStats(this.floor).contact;p.invuln=.55;this.effect('hit',p.x,p.y,{color:'#fa6680',radius:20});}
  }
  // Snapshot: newly split bullets start simulation next tick, never recurse on the call stack.
  const existing=[...this.bullets];for(const b of existing){
   if(b.life<=0)continue;b.life-=dt;b.px=b.x;b.py=b.y;
   if(s.homing){const t=this.target(b.x,b.y,b.hit,220);if(t){const a=Math.atan2(b.vy,b.vx),target=Math.atan2(t.y-b.y,t.x-b.x);let delta=((target-a+Math.PI*3)%(Math.PI*2))-Math.PI;delta=Math.max(-s.homing*dt*2,Math.min(s.homing*dt*2,delta));b.vx=Math.cos(a+delta)*b.speed;b.vy=Math.sin(a+delta)*b.speed;}}
   const nx=b.x+b.vx*dt,ny=b.y+b.vy*dt;
   if(mapWall(m,nx,ny,1)){if(b.bounce>0){b.bounce--;if(mapWall(m,nx,b.y,1))b.vx*=-1;if(mapWall(m,b.x,ny,1))b.vy*=-1;}else{b.life=0;continue;}}else{b.x=nx;b.y=ny;b.distance+=b.speed*dt;}
   for(const e of this.enemies){if(e.hp<=0||e.warm>0||b.hit.has(e.id))continue;if(Math.hypot(e.x-b.x,e.y-b.y)<e.r+4){b.hit.add(e.id);this.impact(b,e);if(b.pierce>0)b.pierce--;else{b.life=0;break;}}}
  }
  this.bullets=this.bullets.filter(b=>b.life>0);this.enemies=this.enemies.filter(e=>e.hp>0);
  this.fx.forEach(f=>f.life-=dt);this.fx=this.fx.filter(f=>f.life>0);
  this.pickups=this.pickups.filter(drop=>{if(Math.hypot(drop.x-p.x,drop.y-p.y)<s.pickup){this.loot.push(drop.core);this.onEvent({type:'loot',core:drop.core});return false;}return true;});
  if(p.hp<=0){p.hp=0;this.status='dead';this.onEvent({type:'dead'});return;}
  if(!this.isBoss&&!this.gates&&this.floorTime>=this.goalTime&&this.floorKills>=this.goalKills){this.gates=true;this.clearedFloor=this.floor;this.clearTime=this.totalTime;this.onEvent({type:'gates'});}
  if(this.gates){if(Math.hypot(p.x-m.portal.x,p.y-m.portal.y)<23){this.status='returned';this.onEvent({type:'returned'});}else if(Math.hypot(p.x-m.stairs.x,p.y-m.stairs.y)<22){this.nextFloor();}}
 }
}
