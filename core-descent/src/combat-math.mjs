import {compileBoard,makeItem} from './core.mjs';
/** These helpers describe the v0.8 weapon model; the named PvP helpers remain archival. They do NOT implement networked PvP. */
export const BALANCE_VERSION='0.8.0-candidate';
export function floorStats(floor){
 if(!Number.isSafeInteger(floor)||floor<1)throw Error('階層は1以上の整数');
 const hp=20*Math.pow(1+.16*(floor-1),1.65),contact=7+2.5*Math.pow(floor-1,.65);
 if(!Number.isFinite(hp)||!Number.isFinite(contact))throw Error('表現できない階層');
 return {hp,contact};
}
export function expectedDirect(spec,{hitsPerVolley=spec.innateHits||1,stationary=false,distance=0,execute=false,level=1,pvp=false}={}){
 if(!Number.isFinite(hitsPerVolley)||hitsPerVolley<0||!Number.isFinite(distance)||distance<0||!Number.isInteger(level)||level<1||level>21)throw Error('試算条件が不正');
 const condition=(stationary?1+spec.steady:1)*(1+spec.longshot*Math.min(1,distance/(pvp?350:(spec.range||500))))*(execute?1+spec.execute:1);
 const noncritHit=spec.damage*(pvp?1:1+.1*(level-1))*condition;
 const critFactor=1+spec.crit*(spec.critMultiplier-1),comboFactor=pvp?1:(spec.comboMultiplier||1);
 const stationarySeconds=pvp?0:spec.weapon?.stationarySeconds||0,canAttack=stationarySeconds===0||stationary;
 return {noncritHit,critHit:noncritHit*spec.critMultiplier,averageHit:noncritHit*critFactor*comboFactor,comboFactor,innateHits:pvp?1:(spec.innateHits||1),stationarySeconds,canAttack,dps:canAttack?noncritHit*critFactor*comboFactor*spec.rate*hitsPerVolley:0};
}
/** Loan copies: same digits/types/layout; no ownership, rarity, rolls, legacy quality advantage. */
export function compileStandardPvp(board,inventory){
 if(board.length!==9)throw Error('標準PvP案は9段固定');
 const loan=inventory.map(it=>makeItem(it.id,it.digit,it.type,{rarity:'rare'}));
 const s=compileBoard(board,loan),v=s.raw;
 return {...s,mode:'pvp-standard-draft',networkImplemented:false,
  damage:6*Math.max(.05,1+.30*v.damage),
  rate:Math.min(6,3*Math.max(.2,1+.25*v.rate)),
  multi:Math.min(2,Math.max(0,.16*v.multi)),
  crit:Math.min(.5,Math.max(0,.05+.32*v.crit)),critMultiplier:1.5,
  maxHp:1000+Math.min(500,Math.max(0,v.hp)),
  steady:Math.max(0,.4*v.steady),longshot:Math.max(0,.4*v.longshot),execute:Math.max(0,.4*v.execute),
  split:Math.min(3,.16*s.split),blast:.35*s.blast,chain:.35*s.chain,poison:.35*s.poison,
  homing:Math.min(.4,s.homing),slow:Math.min(1/3,s.slow),
  move:165+Math.min(16.5,Math.max(0,.25*v.move)),
  drain:Math.min(.05,s.drain),
  regen:Math.min(2*s.regen,.005*(1000+Math.min(500,Math.max(0,v.hp)))),
  rules:{extraSameVolleyHitFactor:.35,leechPerSecond:.01,slowDuration:1,bulletSpeed:320,bulletLifetime:1.5,range:480,rateCap:6,additionalBulletsCap:2}
 };
}
export function pvpSummary(s,{stationary=false,distance=0,hitRate=1}={}){
 if(s.mode!=='pvp-standard-draft'||!Number.isFinite(hitRate)||hitRate<0||hitRate>1)throw Error('PvP試算条件が不正');
 const one=expectedDirect(s,{stationary,distance,pvp:true});
 const full=expectedDirect(s,{stationary,distance,pvp:true,hitsPerVolley:1+s.multi*.35});
 return {hp:s.maxHp,damage:one.noncritHit,critDamage:one.critHit,rate:s.rate,shots:1+s.multi,oneHitDps:one.dps*hitRate,allHitDps:full.dps*hitRate,idealTtkVs1000:(one.dps*hitRate>0?1000/(one.dps*hitRate):Infinity)};
}
