import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_BY_ID,RARITIES,PUZZLE_9,STAT_KEYS} from '../src/catalog.mjs';
import {makeItem,normalizeItem,itemValues,itemRanges,rollKeys,makeRng,rollItem,rarityWeights,makeProfile,checkProfile,validateBoard,compileBoard,paths,laboratory,bankRun} from '../src/core.mjs';
import {AuctionBook} from '../src/market.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function fixture(types,rarities={}){
 const nums=[[9],[3,6],[1,2,4]],inventory=[];
 const board=nums.map((row,r)=>row.map((d,c)=>{const key=`${r},${c}`,it=makeItem(key,d,types[r][c],{rarity:rarities[key]??(types[r][c]==='amplifier'?'rare':'common')});inventory.push(it);return it.id;}));
 return {inventory,board};
}
const trace=(spec,r,c)=>spec.traces.find(t=>t.row===r&&t.col===c);

test('レア度は指定の5段階・基準倍率は1/1.5/2/2.5/3',()=>{
 assert.deepEqual(RARITIES.map(r=>r.name),['コモン','アンコモン','レア','エピック','レジェンダリー']);assert.deepEqual(RARITIES.map(r=>r.factor),[1,1.5,2,2.5,3]);
});
test('高密度弾の全レア度の上下限を数式と照合',()=>{
 for(const r of RARITIES){const i=makeItem('x',4,'power',{rarity:r.id}),range=itemRanges(i).mods.damage;near(range[0],.04*r.factor*.95);near(range[1],.04*r.factor*1.05);}
});
test('同じレア度でもドロップ個体値により性能が異なる',()=>{
 const a=makeItem('a',3,'power',{rarity:'rare',rolls:{damage:9500}}),b=makeItem('b',3,'power',{rarity:'rare',rolls:{damage:10500}});
 near(itemValues(a).mods.damage,.076);near(itemValues(b).mods.damage,.084);assert.equal(a.digit,b.digit);
});
test('複数の数値を能力ごとに独立保存する',()=>{
 const it=makeItem('x',5,'overdrive',{rarity:'rare',rolls:{damage:10500,rate:9500}}),v=itemValues(it).mods;
 near(v.damage,.085*2*1.05);near(v.rate,-.006/2*.95);
});
test('高レア度ではプラスは増えマイナスの絶対量は減る',()=>{
 const c=itemValues(makeItem('c',5,'overdrive')).mods,l=itemValues(makeItem('l',5,'overdrive',{rarity:'legendary'})).mods;
 near(l.damage,c.damage*3);near(l.rate,c.rate/3);
});
test('コアの固定数字はレア度・個体値・増幅では変わらない',()=>{
 const it=makeItem('x',7,'power',{rarity:'legendary',rolls:{damage:10500}}),copy=structuredClone(it);itemValues(it);itemRanges(it);assert.deepEqual(it,copy);assert.equal(it.digit,7);
});
test('レア接続増幅は基準×1.20・個体差×1.19〜1.21',()=>{
 const it=makeItem('x',7,'amplifier',{rarity:'rare'});near(1+itemValues(it).ampGain,1.2);const r=itemRanges(it).amp;near(r[0],1.19);near(r[1],1.21);
});
test('不正なレア度・個体値・能力キーを拒否',()=>{
 assert.throws(()=>makeItem('x',7,'power',{rarity:'mythic'}));assert.throws(()=>makeItem('x',7,'power',{rarity:'constructor'}));assert.throws(()=>makeItem('x',7,'__proto__'));assert.throws(()=>normalizeItem({id:'x',digit:7,type:'power'}));
 for(const value of[9499,10501,NaN,Infinity,1.5,'10000'])assert.throws(()=>makeItem('x',7,'power',{rolls:{damage:value}}));
 assert.throws(()=>makeItem('x',7,'power',{rolls:{}}));assert.throws(()=>makeItem('x',7,'power',{rolls:{damage:10000,amp:10000}}));
});
test('個体値はセーブ・再読込・合成で再抽選されない',()=>{
 const p=makeProfile();p.inventory[1]=makeItem('start-1',1,'power',{rarity:'epic',rolls:{damage:10237}});
 const serialized=JSON.stringify(p),q=checkProfile(JSON.parse(serialized));compileBoard(q.board,q.inventory);compileBoard(q.board,q.inventory);assert.equal(JSON.stringify(q),serialized);
});
test('ドロップ全属性はシードで再現可能、全5レア度が出現',()=>{
 const a=makeRng(414),b=makeRng(414),rarities=new Set();
 for(let n=0;n<10000;n++){const x=rollItem(a,1,`x${n}`);assert.deepEqual(x,rollItem(b,1,`x${n}`));rarities.add(x.rarity);for(const v of Object.values(x.rolls))assert.ok(v>=9500&&v<=10500);}
 assert.equal(rarities.size,5);
});
test('深層ほど高レアが出やすいが確率の総和は100',()=>{
 const first=rarityWeights(1),deep=rarityWeights(1024);near(first.reduce((a,b)=>a+b),100);near(deep.reduce((a,b)=>a+b),100);assert.ok(deep[4]>first[4]);assert.ok(deep[0]<first[0]);assert.throws(()=>rarityWeights(0));
});
test('旧v1セーブの品質と実性能を損なわずv2へ移行',()=>{
 const p=makeProfile();p.version=1;p.inventory=p.inventory.map((it,i)=>({id:it.id,digit:it.digit,type:it.type,quality:.5+i/10}));
 const before=compileBoard(p.board,p.inventory),loaded=checkProfile(structuredClone(p)),after=compileBoard(loaded.board,loaded.inventory);
 assert.equal(loaded.version,2);assert.deepEqual(after.raw,before.raw);for(let n=0;n<10;n++)near(itemValues(loaded.inventory[n]).mods[rollKeys(loaded.inventory[n].type)[0]],itemValues(p.inventory[n]).mods[rollKeys(p.inventory[n].type)[0]]);
});
test('帰還はレア度と全個体値を保持して確保',()=>{
 const p=makeProfile(),it=makeItem('loot',4,'overdrive',{rarity:'legendary',rolls:{damage:10101,rate:9555}});bankRun(p,[it],5,3);assert.deepEqual(p.inventory.at(-1),it);
});
test('即決購入しても数字・レア度・個体値は変化しない',()=>{
 const b=new AuctionBook({clock:()=>100}),it=makeItem('trade',8,'amplifier',{rarity:'epic',rolls:{amp:10456}});b.account('seller',0);b.account('buyer',2000);b.put(it,'seller');const l=b.list('seller',it.id,{start:100,buyout:1000,duration:1000});b.buy(l.id,'buyer','v02');assert.deepEqual(normalizeItem(b.items.get(it.id)),it);
});
test('中央の増幅は直属の上2コアを各1回強化',()=>{
 const p=fixture([['emitter'],['power','power'],['magnet','amplifier','magnet']]),s=compileBoard(p.board,p.inventory);
 near(trace(s,1,0).own.damage,.048);near(trace(s,1,1).own.damage,.048);near(s.raw.damage,.116);assert.deepEqual(trace(s,2,1).targets,[[1,0],[1,1]]);
});
test('端の増幅の対象は存在する上側1コアだけ',()=>{
 const p=fixture([['emitter'],['power','power'],['amplifier','magnet','magnet']]),s=compileBoard(p.board,p.inventory);
 near(trace(s,1,0).own.damage,.048);near(trace(s,1,1).own.damage,.04);assert.deepEqual(trace(s,2,0).targets,[[1,0]]);
});
test('増幅の信号は孫から頂点までそのまま持ち越さない',()=>{
 const p=fixture([['emitter'],['power','power'],['magnet','amplifier','magnet']]),s=compileBoard(p.board,p.inventory);near(trace(s,0,0).multiplier,1);near(trace(s,0,0).own.damage,.02);
});
test('下から継承した値を丸ごと再乗算しない',()=>{
 const p=fixture([['emitter'],['power','power'],['power','amplifier','magnet']]),s=compileBoard(p.board,p.inventory);near(s.raw.damage,.156);near(trace(s,1,0).output.damage,.04+.048);
});
test('同一コアへの×1.20を2個接続すると×1.44',()=>{
 const p=fixture([['emitter'],['power','magnet'],['amplifier','amplifier','magnet']]),s=compileBoard(p.board,p.inventory);
 near(trace(s,1,0).multiplier,1.44);near(trace(s,1,0).own.damage,.0576);near(s.raw.damage,.0776);
});
test('増幅コアをさらに増幅する場合は増加分を強化（×1.24）',()=>{
 const p=fixture([['emitter'],['amplifier','magnet'],['amplifier','magnet','magnet']]),s=compileBoard(p.board,p.inventory);
 near(trace(s,1,0).ampFactor,1.24);near(trace(s,0,0).own.damage,.0248);
});
test('増幅は対象のデメリットも同率で強化する',()=>{
 const p=fixture([['emitter'],['overdrive','magnet'],['amplifier','magnet','magnet']],{'1,0':'rare'}),s=compileBoard(p.board,p.inventory);
 near(trace(s,1,0).own.damage,.204);near(trace(s,1,0).own.rate,-.0036);
});
test('9段中央の70経路を増幅倍率の70乗と誤解しない',()=>{
 const inventory=[],board=PUZZLE_9.map((row,r)=>row.map((d,c)=>{const type=r===0?'emitter':r===8&&c===4?'amplifier':r===7&&c===3?'power':'magnet';const it=makeItem(`${r},${c}`,d,type,{rarity:type==='amplifier'?'rare':'common'});inventory.push(it);return it.id;}));
 const s=compileBoard(board,inventory);near(trace(s,7,3).multiplier,1.2);near(s.raw.damage,.02+.04*1.2*35);
});
test('経路数が同じ場所でも増幅対象が違えば最終性能が変わる',()=>{
 const a=fixture([['emitter'],['power','magnet'],['amplifier','magnet','magnet']]),b=fixture([['emitter'],['power','magnet'],['magnet','magnet','amplifier']]);
 assert.ok(compileBoard(a.board,a.inventory).damage>compileBoard(b.board,b.inventory).damage);
});
test('増幅後の局所値×経路数の総和は合成結果と一致',()=>{
 const p=laboratory('amplify'),s=compileBoard(p.board,p.inventory);for(const k of STAT_KEYS)near(s.raw[k],s.traces.reduce((v,t)=>v+(t.own[k]||0)*t.paths,0));
});
test('最大45枠・レジェンダリー上限の増幅連結も有限に終了',()=>{
 const inventory=[],board=PUZZLE_9.map((row,r)=>row.map((digit,c)=>{const type=r===0?'emitter':'amplifier',rolls=Object.fromEntries(rollKeys(type).map(k=>[k,10500])),it=makeItem(`${r},${c}`,digit,type,{rarity:'legendary',rolls});inventory.push(it);return it.id;}));
 const s=compileBoard(board,inventory);assert.equal(s.traces.length,45);for(const x of Object.values(s.raw))assert.ok(Number.isFinite(x));for(const t of s.traces)assert.ok(Number.isFinite(t.ampFactor));
});
test('新実験用の9段増幅ビルドは合法で25種×10数字×5レア度を比較可能',()=>{
 const p=laboratory('amplify');assert.ok(validateBoard(p.board,p.inventory).valid);assert.equal(p.inventory.length,45+25*10*5);assert.equal(p.inventory.filter(it=>it.type==='amplifier').length,53);
});
test('改ざんされた個体値では出発できない',()=>{
 const p=makeProfile();p.inventory.find(it=>it.id==='start-1').rolls.damage=100000;assert.equal(validateBoard(p.board,p.inventory).valid,false);assert.throws(()=>compileBoard(p.board,p.inventory));
});
