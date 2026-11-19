import test from 'node:test';import assert from 'node:assert/strict';
import {makeProfile,laboratory,compileBoard} from '../src/core.mjs';
import {GameEngine} from '../src/engine.mjs';import {BossTrial} from '../src/boss.mjs';
import {CHALLENGE_SEED,BOSS_SECONDS,captureLoadout,makeRecord,addRecord,rankedRecords,restoreRecords} from '../src/rankings.mjs';
const near=(x,y,eps=1e-7)=>assert.ok(Math.abs(x-y)<eps,`${x} != ${y}`);
const p=makeProfile(),spec=compileBoard(p.board,p.inventory);
function coreEngine(){return new GameEngine(spec,{seed:CHALLENGE_SEED});}
function record(mode='depth',source='normal',id='one'){
 const e=coreEngine();e.status='dead';e.clearedFloor=3;e.clearTime=90;e.totalTime=100;e.totalDamage=1000;
 return makeRecord(e,{id,mode,source,depth:3,loadout:captureLoadout(p)});
}
function boss(){const e=new BossTrial(spec);e.spec.crit=0;e.spec.execute=0;e.spec.longshot=0;e.spec.steady=0;e.spec.poison=0;e.spec.split=0;e.spec.chain=0;e.spec.blast=0;return e;}
const bullet=()=>({damage:100,distance:0,gen:0,noHeal:false,didSplit:false,vx:440,vy:0});
test('階層へ入るだけでは攻略階層は更新しない',()=>{const e=coreEngine();e.nextFloor(2);assert.equal(e.floor,2);assert.equal(e.clearedFloor,0);});
test('開通条件達成で攻略階層と攻略時刻を記録',()=>{const e=coreEngine();e.floorTime=20;e.floorKills=e.goalKills;e.totalTime=22;e.tick(1/60);assert.equal(e.clearedFloor,1);near(e.clearTime,22+1/60);e.nextFloor();assert.equal(e.clearedFloor,1);});
test('死亡でも攻略階層が残り帰還を強制しない',()=>{const e=coreEngine();e.floorTime=21;e.floorKills=e.goalKills;e.tick(1/60);e.nextFloor();e.player.hp=0;e.tick(1/60);assert.equal(e.status,'dead');assert.equal(e.clearedFloor,1);});
test('階層は高い順、同階は攻略時間の短い順',()=>{const a=record(),b={...record('depth','normal','b'),clearSeconds:80},c={...record('depth','normal','c'),clearedFloor:4,clearSeconds:200};assert.deepEqual(rankedRecords([a,b,c]).map(x=>x.id),['c','b','one']);});
test('同階・同攻略時間は同順位',()=>{const rows=rankedRecords([record(),record('depth','normal','b')]);assert.deepEqual(rows.map(x=>x.rank),[1,1]);});
test('ボスは総ダメージのみ、短時間平均DPSで順位を逆転させない',()=>{const a={...record('boss'),damage:2000,seconds:180},b={...record('boss','normal','b'),damage:1500,seconds:10};assert.equal(rankedRecords([a,b],{mode:'boss'})[0].id,'one');});
test('同ダメージは同順位、生存時間で勝手に優劣をつけない',()=>{const rows=rankedRecords([record('boss'),{...record('boss','normal','b'),seconds:80}],{mode:'boss'});assert.deepEqual(rows.map(x=>x.rank),[1,1]);});
test('所持品と実験室を別集計',()=>{const rows=[record(),record('depth','lab','b')];assert.equal(rankedRecords(rows).length,1);assert.equal(rankedRecords(rows,{source:'lab'})[0].id,'b');});
test('重複登録しない',()=>{const a=record();assert.equal(addRecord(addRecord([],a),a).length,1);});
test('再読込は不正・重複・旧ルールを除外',()=>{const a=record();const previous={...a,id:'v07',rules:'0.7.0',challenge:'fantasy-worlds-01'};assert.equal(restoreRecords([a,a,{...a,id:'x',damage:Infinity},{...a,id:'y',rules:'0.3.0'},previous]).length,1);assert.equal(previous.damage,a.damage,'以前の記録自体は書き換えない');});
test('未完了の挑戦を確定しない',()=>{assert.throws(()=>makeRecord(coreEngine(),{id:'z',mode:'depth',source:'normal',depth:3}));});
test('記録にはコア個体値を固定保存し、後の編成変更に影響されない',()=>{const profile=makeProfile(),snap=captureLoadout(profile);const original=snap[0][0].digit;profile.inventory.find(i=>i.id===profile.board[0][0]).digit=(original+1)%10;assert.equal(snap[0][0].digit,original);});
test('180秒を越えたスコアと非有限値を拒否',()=>{for(const bad of [{seconds:181},{damage:NaN},{damage:Infinity},{seed:1}])assert.throws(()=>addRecord([],{...record('boss'),...bad}));});
test('ボスを本当の無限HPにせず有限状態で何度も加算',()=>{const e=boss();e.impact(bullet(),e.boss);e.impact(bullet(),e.boss);near(e.totalDamage,200);assert.equal(e.boss.hp,1);assert.equal(e.totalKills,0);});
test('ボスにはドロップ・経験値・通貨を生まない',()=>{const e=boss();for(let i=0;i<15;i++)e.impact(bullet(),e.boss);assert.equal(e.level,1);assert.equal(e.gold,0);assert.equal(e.loot.length+e.pickups.length,0);});
test('単体ボスに放電・爆発で架空の追加ダメージを足さない',()=>{const e=boss();e.spec.blast=10;e.spec.chain=10;e.impact(bullet(),e.boss);near(e.totalDamage,100);assert.equal(e.damageBySource.blast+e.damageBySource.chain,0);});
test('腐食の実ダメージを合算する',()=>{const e=boss();e.spec.poison=.5;e.spec.rate=1e-6;e.shotTimer=999;e.impact(bullet(),e.boss);e.tick(1/60);near(e.damageBySource.poison,50/60);near(e.totalDamage,100+50/60);});
test('120秒で瀕死判定をONにして追い撃ちを活かす',()=>{const e=boss();e.spec.execute=1;e.totalTime=119;e.tick(1/60);e.impact(bullet(),e.boss);near(e.totalDamage,100);e.totalTime=120;e.tick(1/60);e.impact(bullet(),e.boss);near(e.totalDamage,300);});
test('180秒で正確に終了し後続ダメージのシミュレーションをしない',()=>{const events=[],e=new BossTrial(spec,{onEvent:v=>events.push(v)});e.totalTime=179.99;e.nextWaveAt=181;e.tick(1/30);assert.equal(e.status,'complete');near(e.totalTime,180);const score=e.totalDamage;e.tick(1/60);near(e.totalDamage,score);assert.equal(events.filter(v=>v.type==='trial-complete').length,1);});
test('異常値のボスダメージはInfinityを記録せず無効終了',()=>{const e=boss();e.hurt(e.boss,Infinity,'direct');assert.equal(e.status,'invalid');assert.equal(e.totalDamage,0);});
test('死亡時の残り時間を架空ダメージで補完しない',()=>{const e=boss();e.totalTime=50;e.totalDamage=321;e.player.hp=0;e.tick(1/60);assert.equal(e.status,'dead');near(e.totalDamage,321);});
test('同シード・同入力のボス戦は同じ結果',()=>{function run(){const e=boss();for(let i=0;i<600;i++)e.tick(1/60,{x:Math.sin(i*.01),y:Math.cos(i*.01)});return[e.totalDamage,e.player.hp,e.bullets.length,e.totalTime];}assert.deepEqual(run(),run());});
test('衝撃波は切れ目なら安全、切れ目以外に命中',()=>{const e=boss();e.shotTimer=999;e.nextWaveAt=999;e.player.x=e.boss.x+100;e.player.y=e.boss.y;e.waves=[{x:e.boss.x,y:e.boss.y,start:-100/145,r:100,gap:0,halfGap:.7,damage:20,hit:false}];e.tick(1/60);near(e.player.hp,spec.maxHp);e.waves[0].gap=Math.PI;e.tick(1/60);near(e.player.hp,spec.maxHp-20);});
test('高レア構成でもボス戦のダメージ内訳合計が一致',()=>{const profile=laboratory('storm'),e=new BossTrial(compileBoard(profile.board,profile.inventory));for(let i=0;i<600;i++)e.tick(1/60);near(e.totalDamage,Object.values(e.damageBySource).reduce((x,y)=>x+y,0));assert.ok(e.totalDamage>0);});
