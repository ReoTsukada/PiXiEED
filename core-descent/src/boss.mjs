import {GameEngine} from './engine.mjs';
import {BOSS_SECONDS,CHALLENGE_SEED} from './rankings.mjs';
/** One immortal, stationary target. Actual hits, not theoretical DPS. */
export class BossTrial extends GameEngine {
 constructor(spec,{seed=CHALLENGE_SEED,onEvent=()=>{}}={}){
  super(spec,{seed,onEvent});this.isBoss=true;this.duration=BOSS_SECONDS;
  const w=31,h=23,tile=36,cells=Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>x===0||y===0||x===w-1||y===h-1?1:0));
  const open=[];for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)open.push({x:(x+.5)*tile,y:(y+.5)*tile,tx:x,ty:y});
  this.map={w,h,tile,cells,open,width:w*tile,height:h*tile,spawn:{x:558,y:664},portal:{x:-999,y:-999},stairs:{x:-999,y:-999}};
  Object.assign(this.player,this.map.spawn);this.goalTime=Infinity;this.goalKills=Infinity;
  this.boss={id:this.id++,x:558,y:414,hp:1,maxHp:1,immortal:true,vitalRatio:1,speed:0,r:36,color:'#f2b55f',warm:0,poison:0,poisonDps:0,slow:0,flash:0};
  this.enemies=[this.boss];this.waves=[];this.nextWaveAt=4;this.waveId=0;
 }
 spawn(){} // No random adds, drops, gold or temporary levels in the trial.
 hurt(target,amount,source){
  if(this.status!=='playing')return 0;
  if(target!==this.boss)return super.hurt(target,amount,source);
  if(!Number.isFinite(amount)||amount<0||this.totalDamage+amount>Number.MAX_SAFE_INTEGER/1000){this.status='invalid';this.onEvent({type:'invalid-score'});return 0;}
  this.totalDamage+=amount;this.damageBySource[source]=(this.damageBySource[source]||0)+amount;this.damageEvents++;target.flash=.08;return amount;
 }
 tick(dt,input={x:0,y:0}){
  if(this.status!=='playing')return;
  if(!Number.isFinite(dt)||dt<=0)return;
  const step=Math.min(dt,1/30,this.duration-this.totalTime);
  if(step<=0)return;
  // Last minute activates low-HP talents without a finite HP pool or overkill clipping.
  this.boss.vitalRatio=this.totalTime>=120?0.25:1;
  super.tick(step,input);if(this.status!=='playing')return;
  while(this.totalTime+1e-8>=this.nextWaveAt){
   const index=this.waveId++;this.waves.push({id:index,x:this.boss.x,y:this.boss.y,start:this.nextWaveAt,r:0,hit:false,gap:(index*2.3999632297)%(Math.PI*2),halfGap:.7,damage:12+6*Math.floor(this.nextWaveAt/60)});this.nextWaveAt+=4;
  }
  for(const wave of this.waves){
   wave.r=(this.totalTime-wave.start)*145;
   const dx=this.player.x-wave.x,dy=this.player.y-wave.y,d=Math.hypot(dx,dy),angle=Math.atan2(dy,dx);
   const gapDistance=Math.abs(Math.atan2(Math.sin(angle-wave.gap),Math.cos(angle-wave.gap)));
   if(!wave.hit&&Math.abs(d-wave.r)<16&&gapDistance>wave.halfGap&&this.player.invuln<=0){wave.hit=true;this.player.hp=Math.max(0,this.player.hp-wave.damage);this.player.invuln=.55;this.effect('hit',this.player.x,this.player.y,{color:'#fa6680',radius:22});}
  }
  this.waves=this.waves.filter(w=>w.r<1100);
  if(this.player.hp<=0){this.status='dead';this.onEvent({type:'dead'});return;}
  if(this.totalTime>=this.duration-1e-8){this.totalTime=this.duration;this.status='complete';this.onEvent({type:'trial-complete'});}
 }
}
