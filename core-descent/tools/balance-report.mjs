import {writeFile,mkdir} from 'node:fs/promises';
import {makeProfile,laboratory,makeItem,compileBoard} from '../src/core.mjs';
import {CORE_DEFS,RARITIES} from '../src/catalog.mjs';
import {BALANCE_VERSION,expectedDirect,floorStats} from '../src/combat-math.mjs';
import {GameEngine} from '../src/engine.mjs';
import {WEAPONS} from '../src/weapons.mjs';
import {BIOMES,MONSTERS} from '../src/world.mjs';
import {EQUIPMENT_DEFS} from '../src/items.mjs';
import {ENEMY_DROP_TABLES,LOOT_RULES} from '../src/loot.mjs';
export function profileAt(kind,rarity='common',roll=10000){
 const p=kind==='starter'?makeProfile():laboratory(kind);
 p.inventory=p.inventory.map(x=>makeItem(x.id,x.digit,x.type,{rarity,rolls:Object.fromEntries(Object.keys(x.rolls).map(k=>[k,roll]))}));return p;
}
/** Isolated damage arithmetic, deliberately independent of targeting/visibility.
 * Actual geometry/range/weapon sequencing is covered by weapon.test.mjs.
 */
export function fixedHitTrial(s,{seconds=120,all=false,stationary=false,distance=0,seed=123}={}){
 const e=new GameEngine(s,{seed});e.player.still=stationary?1:0;
 const foe={id:1,x:e.player.x+20,y:e.player.y,hp:1e12,maxHp:1e12,warm:0,color:'#fff'};e.enemies=[foe];
 const volleys=s.weapon?.stationarySeconds>0&&!stationary?0:Math.floor(seconds*s.rate);let primaryHits=0,credit=0,combo=0;
 for(let i=0;i<volleys;i++){
  credit+=s.multi;const extra=Math.floor(credit);credit%=1;
  const attacks=all?1+extra:1;
  for(let a=0;a<attacks;a++){
   combo++;const comboDamage=s.weapon?.combo&&combo%s.weapon.combo===0?s.weapon.comboDamage:1;
   for(let k=0;k<(s.innateHits||1);k++){
    e.impact({damage:s.damage*comboDamage,gen:1,noHeal:true,didSplit:true,distance,vx:1,vy:0,kind:'arithmetic-test'},foe);primaryHits++;
   }
  }
 }
 return {seconds,volleys,primaryHits,directDps:e.damageBySource.direct/seconds,seed,method:'固定命中の算術試験。武器の3連魔弾・短剣連撃平均と移動時の攻撃可否を含む。停止武器は構え完了後の定常値。移動経路/射程/視界/命中率/範囲巻込/往復刃/追加効果は別の実戦処理試験。'};
}
export async function report(){
 const rows=[];
 for(const kind of ['starter','storm','siege','sustain','amplify'])for(const rarity of(kind==='starter'?['common']:RARITIES.map(r=>r.id))){
  const p=profileAt(kind,rarity),s=compileBoard(p.board,p.inventory),one=expectedDirect(s),full=expectedDirect(s,{hitsPerVolley:(1+s.multi)*(s.innateHits||1)}),conditions=expectedDirect(s,{stationary:true,distance:500});
  const experiments=kind==='starter'||rarity==='legendary'?Array.from({length:20},(_,i)=>fixedHitTrial(s,{seed:4000+i})):[];
  rows.push({kind,rarity,weapon:s.weapon.id,range:s.range,vision:s.vision,innateHits:s.innateHits,comboMultiplier:s.comboMultiplier,hp:s.maxHp,damage:s.damage,rate:s.rate,shots:1+s.multi,crit:s.crit,raw:s.raw,oneHitDps:one.dps,allHitDps:full.dps,conditionalSingleDps:conditions.dps,leechRate:s.drain,leechCap:s.maxHp*.08,regen:s.regen,
    observed:experiments.length?{runs:20,secondsPerRun:120,mean:experiments.reduce((a,x)=>a+x.directDps,0)/20,min:Math.min(...experiments.map(x=>x.directDps)),max:Math.max(...experiments.map(x=>x.directDps)),method:experiments[0].method}:null});
 }
 const floors=[1,10,30,50,100,200,500].map(floor=>({floor,...floorStats(floor)}));
 const weapons=WEAPONS.map(w=>{const baselineDirectDps=w.baseDamage*w.baseRate*(w.burst||1)*(w.combo?1+(w.comboDamage-1)/w.combo:1)*1.05;return {digit:w.digit,name:w.name,kind:w.kind,baseDamage:w.baseDamage,baseRate:w.baseRate,range:w.range,stationarySeconds:w.stationarySeconds,innateHits:w.burst||1,comboMultiplier:w.combo?1+(w.comboDamage-1)/w.combo:1,baselineDirectDps,movingDirectDps:w.stationarySeconds?0:baselineDirectDps,standingDirectDps:baselineDirectDps,mechanic:w.mechanic};});
 const output={weapons,biomes:BIOMES,monsters:MONSTERS,equipment:EQUIPMENT_DEFS,dropTables:ENEMY_DROP_TABLES,lootRules:LOOT_RULES,version:BALANCE_VERSION,disclaimer:'数値検証用候補。PvPは採用していない。DPSは命中仮定つき、範囲巻込や往復刃は含まず、実戦値ではない。',conditions:{level:1,armor:0,roll:10000,stationary:false,distance:0,execute:false},rows,floors,coreDefs:CORE_DEFS,rarities:RARITIES};
 await mkdir('qa',{recursive:true});await writeFile('qa/balance-report.json',JSON.stringify(output,null,2));
 const md=['# v0.8 再現可能な数値レポート','','## レベル1・個体値100%・防御0・条件効果なし','全弾命中DPSをそのまま実戦DPSと呼ばない。複数弾は拡散し、地形と敵サイズで命中数が変わる。','', '|構成|レア度|通常1発|射撃/秒|弾/射撃|1発命中DPS|全弾命中DPS|静止+500px 1発命中DPS|HP|','|---|---|---:|---:|---:|---:|---:|---:|---:|',...rows.map(r=>`|${r.kind}|${r.rarity}|${r.damage.toFixed(2)}|${r.rate.toFixed(3)}|${r.shots.toFixed(3)}|${r.oneHitDps.toFixed(2)}|${r.allHitDps.toFixed(2)}|${r.conditionalSingleDps.toFixed(2)}|${r.hp.toFixed(1)}|`),'','## 命中イベント処理を使った測定','120秒×20シード。1射撃1発を対象へ命中させるイベント再生。レベル1、防御0、通常移動扱い、距離補正0、HP十分。移動AIや命中率の実戦試験ではない。','',...rows.filter(r=>r.observed).map(r=>`- ${r.kind} ${r.rarity}: 理論${r.oneHitDps.toFixed(2)} / 実装処理の平均${r.observed.mean.toFixed(2)}、範囲${r.observed.min.toFixed(2)}〜${r.observed.max.toFixed(2)} DPS。`),'','## 階層の基礎数値（敵固有の倍率を掛ける前）','',...floors.map(f=>`- ${f.floor}階: HP${f.hp.toFixed(2)}、接触${f.contact.toFixed(2)}ダメージ。`),'','再計算: `npm run balance`。'];
 md.push('','## 武器の素の性能（コア補正前・会心5%を含む）','','|数字|武器|基礎威力|動作/秒|間合いpx|移動時DPS|停止時DPS|特徴|','|---|---|---:|---:|---:|---:|---:|---|',...weapons.map(w=>`|${w.digit}|${w.name}|${w.baseDamage}|${w.baseRate}|${w.range}|${w.movingDirectDps.toFixed(3)}|${w.standingDirectDps.toFixed(3)}|${w.mechanic}|`),'','大剣・槌の停止時DPSは構え完了後の定常値で、初動と移動時間を除く。移動中の通常攻撃は蓄積しない。近接の巻込、杖の周囲爆発、刃輪の復路、属性効果はこのDPS表に含まない。基礎視界8タイル。射程/視界は独立してコアで延長。');
 md.push('','## フィールド別の敵（移動は基礎値、HPは階層基礎値への倍率）','','|フィールド|敵|基礎移動px/秒|HP倍率|AI|','|---|---|---:|---:|---|',...Object.values(MONSTERS).map(m=>`|${BIOMES.find(b=>b.id===m.biomeId).name}|${m.name}${m.boss?'（ボス）':''}|${m.speed}|${m.hpFactor}|${m.ai}|`),'','## 固有ドロップ','',LOOT_RULES.bossSignature,LOOT_RULES.bossRarity,'通常素材45%、通常コア12%、汎用装備4%、限定装備のある敵はさらに固有装備4%。個々の判定は独立。通貨は落ちた後に回収が必要。','装備はコア合成の後に全武器へ適用し、経路数で増幅しない。個体値100%・レア装備の工房製作を用意。');
 await writeFile('qa/BALANCE_REPORT.md',md.join('\n')+'\n');console.log(md.join('\n'));
}
if(process.argv[1]?.endsWith('balance-report.mjs'))await report();
