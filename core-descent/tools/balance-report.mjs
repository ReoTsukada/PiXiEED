import {writeFile,mkdir} from 'node:fs/promises';
import {makeProfile,laboratory,makeItem,compileBoard} from '../src/core.mjs';
import {CORE_DEFS,RARITIES} from '../src/catalog.mjs';
import {BALANCE_VERSION,expectedDirect,compileStandardPvp,pvpSummary,floorStats} from '../src/combat-math.mjs';
import {GameEngine} from '../src/engine.mjs';
export function profileAt(kind,rarity='common',roll=10000){
 const p=kind==='starter'?makeProfile():laboratory(kind);
 p.inventory=p.inventory.map(x=>makeItem(x.id,x.digit,x.type,{rarity,rolls:Object.fromEntries(Object.keys(x.rolls).map(k=>[k,roll]))}));return p;
}
export function fixedHitTrial(s,{seconds=120,all=false,stationary=false,distance=0,seed=123}={}){
 const e=new GameEngine(s,{seed});e.player.x=0;e.player.y=0;e.player.still=stationary?1:0;
 const foe={id:1,x:300,y:0,hp:1e12,maxHp:1e12,warm:0,color:'#fff'};e.enemies=[foe];
 const volleys=Math.floor(seconds*s.rate);let primaryHits=0;
 for(let i=0;i<volleys;i++){
  e.bullets=[];e.volley();const shots=[...e.bullets];e.bullets=[];
  for(const b of (all?shots:shots.slice(0,1))){b.distance=distance;e.impact(b,foe);primaryHits++;}
 }
 return {seconds,volleys,primaryHits,directDps:e.damageBySource.direct/seconds,seed,method:'固定命中イベント再生。移動・壁・衝突・回避を測定せず、毒/追加弾を除外。'};
}
export async function report(){
 const rows=[];
 for(const kind of ['starter','storm','siege','sustain','amplify'])for(const rarity of(kind==='starter'?['common']:RARITIES.map(r=>r.id))){
  const p=profileAt(kind,rarity),s=compileBoard(p.board,p.inventory),one=expectedDirect(s),full=expectedDirect(s,{hitsPerVolley:1+s.multi}),conditions=expectedDirect(s,{stationary:true,distance:500});
  const experiments=kind==='starter'||rarity==='legendary'?Array.from({length:20},(_,i)=>fixedHitTrial(s,{seed:4000+i})):[];
  rows.push({kind,rarity,hp:s.maxHp,damage:s.damage,rate:s.rate,shots:1+s.multi,crit:s.crit,raw:s.raw,oneHitDps:one.dps,allHitDps:full.dps,conditionalSingleDps:conditions.dps,leechRate:s.drain,leechCap:s.maxHp*.08,regen:s.regen,
    observed:experiments.length?{runs:20,secondsPerRun:120,mean:experiments.reduce((a,x)=>a+x.directDps,0)/20,min:Math.min(...experiments.map(x=>x.directDps)),max:Math.max(...experiments.map(x=>x.directDps)),method:experiments[0].method}:null,
    pvp:kind==='starter'?null:{moving:pvpSummary(compileStandardPvp(p.board,p.inventory)),stationaryLong:pvpSummary(compileStandardPvp(p.board,p.inventory),{stationary:true,distance:350})}});
 }
 const floors=[1,10,30,50,100,200,500].map(floor=>({floor,...floorStats(floor)}));
 const output={version:BALANCE_VERSION,disclaimer:'数値検証用候補。PvPは計算モデルのみで対戦未実装。DPSは命中仮定つき、勝率ではない。',conditions:{level:1,armor:0,roll:10000,stationary:false,distance:0,execute:false},rows,floors,coreDefs:CORE_DEFS,rarities:RARITIES};
 await mkdir('qa',{recursive:true});await writeFile('qa/balance-report.json',JSON.stringify(output,null,2));
 const md=['# v0.3 再現可能な数値レポート','','## レベル1・個体値100%・防御0・条件効果なし','全弾命中DPSをそのまま実戦DPSと呼ばない。複数弾は拡散し、地形と敵サイズで命中数が変わる。','', '|構成|レア度|通常1発|射撃/秒|弾/射撃|1発命中DPS|全弾命中DPS|静止+500px 1発命中DPS|HP|','|---|---|---:|---:|---:|---:|---:|---:|---:|',...rows.map(r=>`|${r.kind}|${r.rarity}|${r.damage.toFixed(2)}|${r.rate.toFixed(3)}|${r.shots.toFixed(3)}|${r.oneHitDps.toFixed(2)}|${r.allHitDps.toFixed(2)}|${r.conditionalSingleDps.toFixed(2)}|${r.hp.toFixed(1)}|`),'','## 命中イベント処理を使った測定','120秒×20シード。1射撃1発を対象へ命中させるイベント再生。レベル1、防御0、通常移動扱い、距離補正0、HP十分。移動AIや命中率の実戦試験ではない。','',...rows.filter(r=>r.observed).map(r=>`- ${r.kind} ${r.rarity}: 理論${r.oneHitDps.toFixed(2)} / 実装処理の平均${r.observed.mean.toFixed(2)}、範囲${r.observed.min.toFixed(2)}〜${r.observed.max.toFixed(2)} DPS。`),'','## PvP標準化モデル（未対戦）','全コアRare・個体値100%に再計算。元の所持品は変更しない。1射撃の追加弾が同一プレイヤーに当たる場合は35%威力。HP/DPSは勝率を意味しない。','',...rows.filter(r=>r.rarity==='rare').map(r=>`- ${r.kind}: HP${r.pvp.moving.hp.toFixed(0)}、1発命中${r.pvp.moving.oneHitDps.toFixed(2)}DPS、全弾命中${r.pvp.moving.allHitDps.toFixed(2)}DPS、静止350px${r.pvp.stationaryLong.oneHitDps.toFixed(2)}DPS。`),'','## 階層の数値（通常敵）','',...floors.map(f=>`- ${f.floor}階: HP${f.hp.toFixed(2)}、接触${f.contact.toFixed(2)}ダメージ。`),'','再計算: `npm run balance`。'];
 await writeFile('qa/BALANCE_REPORT.md',md.join('\n')+'\n');console.log(md.join('\n'));
}
if(process.argv[1]?.endsWith('balance-report.mjs'))await report();
