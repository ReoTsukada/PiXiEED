import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_DEFS,CORE_BY_ID,RARITY_BY_ID} from '../src/catalog.mjs';
import {WEAPONS} from '../src/weapons.mjs';
import {MONSTERS} from '../src/world.mjs';
import {makeProfile,checkProfile,makeItem,makeRng,rollItem,laboratory,compileBoard,bankRun,loseRun} from '../src/core.mjs';
import {EQUIPMENT_DEFS,EQUIPMENT_BY_ID,EQUIPMENT_SLOTS,MATERIAL_DEFS,MATERIAL_BY_ID,CONSUMABLE_BY_ID,CRAFT_RECIPES,
 makeEquipment,validateEquipment,equipmentValues,equipmentDefinition,ensureRpgProfile,normalizeCargo,equipItem,unequipItem,applyEquipment,consumeItem,craftItem,buyConsumable} from '../src/items.mjs';
import {ENEMY_DROP_TABLES,ENEMY_DROP_DEFS,rollEnemyDrops} from '../src/loot.mjs';

const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const unchanged=(profile,action)=>{const before=structuredClone(profile);assert.throws(action);assert.deepEqual(profile,before);};

test('旧セーブへ資産欄と初期回復3を一度だけ追加し、枯渇した在庫を再配布しない',()=>{
 const p=makeProfile();for(const key of ['materials','equipment','equipped','consumables'])delete p[key];
 const oldCore=structuredClone(p.inventory),oldBoard=structuredClone(p.board);checkProfile(p);
 assert.deepEqual(p.inventory,oldCore);assert.deepEqual(p.board,oldBoard);assert.deepEqual(p.materials,{});assert.deepEqual(p.equipment,[]);
 assert.deepEqual(p.equipped,{armor:null,charm:null,boots:null});assert.deepEqual(p.consumables,{healing_draught:3,ward_scroll:0});
 for(let i=0;i<3;i++)consumeItem(p,'healing_draught');const reloaded=checkProfile(JSON.parse(JSON.stringify(p)));
 assert.equal(reloaded.consumables.healing_draught,0);ensureRpgProfile(reloaded);assert.equal(reloaded.consumables.healing_draught,0);
 reloaded.consumables={};checkProfile(reloaded);assert.deepEqual(reloaded.consumables,{});
});

test('装備の各能力はレア倍率と固定95〜105%個体値に一致し、操作で再抽選しない',()=>{
 const item=makeEquipment('gear','drakescale_armor',{rarity:'epic',rolls:{maxHp:9500,armorMitigation:10500,damageBonus:10001}});
 const v=equipmentValues(item);near(v.maxHp,12*2.5*.95);near(v.armorMitigation,.04*2.5*1.05);near(v.damageBonus,.015*2.5*1.0001);
 const p=makeProfile();p.equipment.push(item);const original=structuredClone(item);equipItem(p,item.id);unequipItem(p,'armor');equipItem(p,item.id);checkProfile(p);bankRun(p,[],0,1);
 assert.deepEqual(p.equipment[0],original);assert.equal(p.equipped.armor,item.id);
 for(const bad of [{...item,rarity:undefined},{...item,rarity:'mythic'},{...item,rolls:{maxHp:10000}},{...item,rolls:{...item.rolls,maxHp:9499}},{...item,rolls:{...item.rolls,maxHp:10501}},{...item,rolls:{...item.rolls,maxHp:10000.5}}])assert.throws(()=>validateEquipment(bad));
});

test('装備交換は3枠に限定し、前の現物は失わず、探索中は交換しない',()=>{
 const p=makeProfile(),a=makeEquipment('a','traveler_vest'),b=makeEquipment('b','gel_coat');p.equipment.push(a,b);
 equipItem(p,'a');equipItem(p,'b');assert.equal(p.equipped.armor,'b');assert.equal(p.equipment.length,2);assert.deepEqual(p.equipment,[a,b]);
 unchanged(p,()=>equipItem(p,'missing'));unchanged(p,()=>unequipItem(p,'weapon'));
 p.runActive=true;unchanged(p,()=>equipItem(p,'a'));unchanged(p,()=>unequipItem(p,'armor'));
 p.runActive=false;assert.equal(unequipItem(p,'armor'),'b');assert.equal(p.equipped.armor,null);
});

test('18装備すべてを10武器へ適用でき、基盤・武器・個体を変更しない',()=>{
 for(const weapon of WEAPONS){
  const p=laboratory('storm',3,weapon.digit),base=compileBoard(p.board,p.inventory),original=structuredClone(base);
  for(const def of EQUIPMENT_DEFS){
   p.equipped={armor:null,charm:null,boots:null};equipItem(p,`lab-equipment-${def.id}`);
   const result=applyEquipment(base,p);assert.equal(result.weapon.id,weapon.id);assert.deepEqual(result.raw,base.raw);assert.deepEqual(base,original);
   assert.ok(result.damage>=base.damage&&result.range>=base.range&&result.rate>=base.rate&&result.maxHp>=base.maxHp);
   for(const key of Object.keys(equipmentValues(p.equipment.find(it=>it.definitionId===def.id))))assert.ok(result.equipmentBonuses[key]>0,`${weapon.id}/${def.id}/${key}`);
   assert.ok(result.armorMitigation>=0&&result.armorMitigation<=.35);assert.ok(result.statusResistance>=0&&result.statusResistance<=.6);
   assert.throws(()=>applyEquipment(result,p));
  }
 }
});

test('装備の威力・速度・間合いは合成後の全体へ作用し、コア経路で増幅しない',()=>{
 const p=makeProfile();p.equipment=[makeEquipment('armor','drakescale_armor',{rarity:'rare'}),makeEquipment('charm','ice_focus',{rarity:'rare'}),makeEquipment('boots','trail_boots',{rarity:'rare'})];
 for(const item of p.equipment)equipItem(p,item.id);
 const base=compileBoard(p.board,p.inventory),result=applyEquipment(base,p);
 near(result.damage,base.damage*1.03);near(result.rate,base.rate*1.05);near(result.range,base.range*1.04);near(result.maxHp,base.maxHp+24);
 near(result.move,base.move+6);near(result.vision,base.vision+.5);near(result.armorMitigation,.08);
});

test('壊れた資産や装備参照のセーブは全体を変更せず拒否する',()=>{
 const corruptions=[p=>p.materials=null,p=>p.materials={unknown:1},p=>p.materials={slime_gel:-1},p=>p.materials={slime_gel:1.5},p=>p.materials={slime_gel:Infinity},p=>p.consumables={unknown:1},p=>p.equipment=[makeEquipment('start-0','trail_boots')],p=>p.equipped={armor:'missing'},p=>p.equipped={weapon:null},p=>{p.equipment=[makeEquipment('x','trail_boots')];p.equipped={armor:'x'};},p=>{const x=makeEquipment('x','trail_boots');p.equipment=[x,x];}];
 for(const corrupt of corruptions){const p=makeProfile();corrupt(p);unchanged(p,()=>checkProfile(p));}
});

test('混合戦利品の帰還はコア・金・素材・装備・消耗品を一括確定する',()=>{
 const p=makeProfile(),core=makeItem('new-core',2,'power'),gear=makeEquipment('new-gear','ice_focus',{rarity:'rare'});
 p.runActive=true;bankRun(p,[core],87,8,{materials:{ice_string:2},equipment:[gear],consumables:{healing_draught:2,ward_scroll:1}});
 assert.equal(p.wallet,87);assert.equal(p.best,8);assert.equal(p.runActive,false);assert.deepEqual(p.inventory.at(-1),core);assert.deepEqual(p.equipment,[gear]);
 assert.equal(p.materials.ice_string,2);assert.equal(p.consumables.healing_draught,5);assert.equal(p.consumables.ward_scroll,1);assert.deepEqual(p.equipped,{armor:null,charm:null,boots:null});
 core.rolls.damage=9500;gear.rolls.rateBonus=9500;assert.equal(p.inventory.at(-1).rolls.damage,10000);assert.equal(p.equipment[0].rolls.rateBonus,10000);
});

test('4引数の旧帰還APIは維持し、空のcargoへ初期薬を再配布しない',()=>{
 const p=makeProfile();consumeItem(p,'healing_draught');bankRun(p,[],12,2);assert.equal(p.consumables.healing_draught,2);
 assert.deepEqual(normalizeCargo(),{materials:{},equipment:[],consumables:{}});
});

test('帰還の不正な末尾装備・数量・ID重複で、先行する金やコアを確保しない',()=>{
 const p=makeProfile();p.runActive=true;const core=makeItem('new',2,'power'),good=makeEquipment('gear','trail_boots');
 const failures=[
  {materials:{slime_gel:2},equipment:[good,{...good,id:'broken',rolls:{move:1,vision:10000}}]},
  {materials:{slime_gel:-1}},{consumables:{ward_scroll:1.5}},
  {equipment:[good,good]},{equipment:[makeEquipment('new','trail_boots')]},{equipment:[makeEquipment('start-0','trail_boots')]}
 ];
 for(const cargo of failures)unchanged(p,()=>bankRun(p,[core],100,5,cargo));
 p.materials.slime_gel=Number.MAX_SAFE_INTEGER;unchanged(p,()=>bankRun(p,[core],100,5,{materials:{slime_gel:1}}));
 p.wallet=Number.MAX_SAFE_INTEGER;unchanged(p,()=>bankRun(p,[core],1,5,{}));
});

test('帰還失敗は旧セーブの移行すら部分適用しない',()=>{
 const p=makeProfile();for(const key of ['materials','equipment','equipped','consumables'])delete p[key];
 unchanged(p,()=>bankRun(p,[],10,2,{materials:{bog_resin:-1}}));
});

test('死亡は持帰り済み資産を保持し、使用した薬だけは消費したまま',()=>{
 const p=makeProfile();p.equipment.push(makeEquipment('gear','traveler_vest'));p.materials.slime_gel=4;equipItem(p,'gear');p.runActive=true;
 const effect=consumeItem(p,'healing_draught');assert.deepEqual(effect,{itemId:'healing_draught',healFraction:.35});const assets=structuredClone(p);loseRun(p);
 assert.deepEqual({...p,runActive:true},assets);assert.equal(p.consumables.healing_draught,2);
});

test('空在庫の消耗品は消費できず、効果の返却値は定義を書き換えない',()=>{
 const p=makeProfile();p.consumables.healing_draught=0;unchanged(p,()=>consumeItem(p,'healing_draught'));unchanged(p,()=>consumeItem(p,'other'));
 p.consumables.ward_scroll=1;const effect=consumeItem(p,'ward_scroll');assert.equal(effect.duration,8);assert.equal(effect.damageReduction,.3);assert.equal(p.consumables.ward_scroll,0);
 effect.duration=100;assert.equal(CONSUMABLE_BY_ID.ward_scroll.effect.duration,8);
});

test('各素材に用途があり、製作は素材・通貨を消費して正確に在庫を増やす',()=>{
 for(const material of MATERIAL_DEFS)assert.ok(CRAFT_RECIPES.some(r=>Object.hasOwn(r.materials,material.id)),material.id);
 const p=makeProfile();p.wallet=50;p.materials.slime_gel=4;
 const made=craftItem(p,'brew_slime_gel');assert.deepEqual(made,{kind:'consumable',itemId:'healing_draught',amount:1});assert.equal(p.wallet,38);assert.equal(p.materials.slime_gel,2);assert.equal(p.consumables.healing_draught,4);
});

test('ボス素材の装備製作はレア・個体値100%を保証し、自動装着や再抽選をしない',()=>{
 const p=makeProfile();p.wallet=250;p.materials.ancient_bark=6;
 const first=craftItem(p,'forge_elderheart_armor'),second=craftItem(p,'forge_elderheart_armor');
 assert.equal(first.item.rarity,'rare');assert.ok(Object.values(first.item.rolls).every(v=>v===10000));assert.notEqual(first.item.id,second.item.id);assert.equal(p.equipped.armor,null);
 assert.equal(p.wallet,50);assert.equal(p.materials.ancient_bark,0);assert.equal(p.equipment.length,2);
});

test('製作と購入の不成立は素材・金・在庫を一切変えない',()=>{
 const p=makeProfile();p.wallet=100;p.materials.ancient_bark=2;
 unchanged(p,()=>craftItem(p,'forge_elderheart_armor'));p.materials.ancient_bark=3;p.wallet=99;unchanged(p,()=>craftItem(p,'forge_elderheart_armor'));
 p.wallet=100;unchanged(p,()=>craftItem(p,'forge_elderheart_armor',{id:'start-0'}));unchanged(p,()=>buyConsumable(p,'ward_scroll',2));unchanged(p,()=>buyConsumable(p,'ward_scroll',.5));
 p.consumables.ward_scroll=Number.MAX_SAFE_INTEGER;unchanged(p,()=>buyConsumable(p,'ward_scroll'));
 p.runActive=true;unchanged(p,()=>craftItem(p,'forge_elderheart_armor'));unchanged(p,()=>buyConsumable(p,'healing_draught'));
});

test('購入は明示価格を支払い、通常・ラボの在庫を混ぜない',()=>{
 const p=makeProfile(),lab=laboratory();p.wallet=100;const before=structuredClone(p);buyConsumable(lab,'ward_scroll',2);assert.deepEqual(p,before);
 buyConsumable(p,'healing_draught',2);assert.equal(p.wallet,20);assert.equal(p.consumables.healing_draught,5);assert.equal(lab.consumables.ward_scroll,12);
});

test('図鑑の20敵名・素材源・限定ドロップは世界定義と一致する',()=>{
 assert.equal(ENEMY_DROP_DEFS.length,20);assert.equal(ENEMY_DROP_DEFS.filter(d=>d.boss).length,5);
 assert.equal(EQUIPMENT_DEFS.filter(d=>d.sourceOnly&&!MONSTERS[d.sourceEnemyId].boss).length,10);
 assert.equal(EQUIPMENT_DEFS.filter(d=>d.sourceOnly&&MONSTERS[d.sourceEnemyId].boss).length,5);
 for(const table of ENEMY_DROP_DEFS){
  assert.equal(table.name,MONSTERS[table.enemyId].name);assert.equal(table.boss,!!MONSTERS[table.enemyId].boss);
  const mat=table.entries.find(d=>d.kind==='material');assert.equal(MATERIAL_BY_ID[mat.itemId].sourceEnemyId,table.enemyId);
  for(const entry of table.entries.filter(d=>d.exclusive&&d.kind==='equipment'))assert.equal(EQUIPMENT_BY_ID[entry.definitionId].sourceEnemyId,table.enemyId);
  for(const entry of table.entries.filter(d=>d.exclusive&&d.kind==='core'))assert.equal(CORE_BY_ID[entry.definitionId].exclusiveEnemyId,table.enemyId);
 }
});

test('全敵のドロップはシードから再現され、限定素材・コア・装備を他敵から出さない',()=>{
 const seen=new Set();
 for(const [index,table] of ENEMY_DROP_DEFS.entries()){
  const a=makeRng(700+index),b=makeRng(700+index);
  for(let i=0;i<200;i++){
   const options={enemyId:table.enemyId,floor:index+1,idPrefix:`${table.enemyId}-${i}`},drops=rollEnemyDrops(a,options);assert.deepEqual(drops,rollEnemyDrops(b,options));
   for(const drop of drops){
    seen.add(drop.kind);
    if(drop.kind==='material')assert.equal(MATERIAL_BY_ID[drop.itemId].sourceEnemyId,table.enemyId);
    if(drop.kind==='core'&&CORE_BY_ID[drop.core.type].exclusiveEnemyId)assert.equal(CORE_BY_ID[drop.core.type].exclusiveEnemyId,table.enemyId);
    if(drop.kind==='equipment'){validateEquipment(drop.item);const def=equipmentDefinition(drop.item);if(def.sourceOnly)assert.equal(def.sourceEnemyId,table.enemyId);}
   }
  }
 }
 assert.deepEqual([...seen].sort(),['consumable','core','equipment','gold','material']);
});

test('階層ボスは素材と固有枠1個を保証し、rare以上の固定抽選を使う',()=>{
 for(const table of ENEMY_DROP_DEFS.filter(t=>t.boss)){
  const rng=makeRng(991),seenKinds=new Set(),seenRarities=new Set(),digits=new Set();
  for(let i=0;i<600;i++){
   const drops=rollEnemyDrops(rng,{enemyId:table.enemyId,floor:5,idPrefix:`boss-${i}`}),materials=drops.filter(d=>d.kind==='material'),signature=drops.filter(d=>d.kind==='core'||d.kind==='equipment');
   assert.equal(materials.length,1);assert.ok(materials[0].amount>=1&&materials[0].amount<=2);assert.equal(signature.length,1);
   const drop=signature[0],item=drop.core||drop.item;seenKinds.add(drop.kind);seenRarities.add(item.rarity);assert.ok(['rare','epic','legendary'].includes(item.rarity));
   if(drop.core)digits.add(drop.core.digit);
  }
  assert.equal(seenKinds.size,2);assert.equal(seenRarities.size,3);assert.equal(digits.size,10);
  const low=rollEnemyDrops(makeRng(42),{enemyId:table.enemyId,floor:1,idPrefix:'fixed'}).filter(d=>d.kind!=='gold');
  const high=rollEnemyDrops(makeRng(42),{enemyId:table.enemyId,floor:1001,idPrefix:'fixed'}).filter(d=>d.kind!=='gold');assert.deepEqual(low,high);
 }
});

test('通常敵の抽選は公開確率の範囲に入り、ボス専用コアを混入させない',()=>{
 const rng=makeRng(1729),totals={material:0,core:0,exclusive:0};
 for(let i=0;i<6000;i++)for(const drop of rollEnemyDrops(rng,{enemyId:'slime',floor:1,idPrefix:`rate-${i}`})){
  if(drop.kind==='material')totals.material++;
  if(drop.kind==='core'){totals.core++;assert.ok(!CORE_BY_ID[drop.core.type].exclusiveEnemyId);}
  if(drop.kind==='equipment'&&drop.item.definitionId==='gel_coat')totals.exclusive++;
 }
 assert.ok(totals.material/6000>.42&&totals.material/6000<.48);assert.ok(totals.core/6000>.10&&totals.core/6000<.14);assert.ok(totals.exclusive/6000>.025&&totals.exclusive/6000<.055);
});

test('固有5コアを全10武器へ装着・合成でき、2能力が両方作用する',()=>{
 const exclusives=CORE_DEFS.filter(d=>d.exclusiveEnemyId);assert.equal(exclusives.length,5);
 for(const weapon of WEAPONS)for(const def of exclusives){
  const p=laboratory('storm',3,weapon.digit),id=p.board[2][1],old=p.inventory.find(i=>i.id===id);p.inventory[p.inventory.indexOf(old)]=makeItem(id,old.digit,def.id,{rarity:'rare'});
  const result=compileBoard(p.board,p.inventory);assert.equal(result.weapon.id,weapon.id);for(const key of Object.keys(def.mods))assert.ok(result.raw[key]>0,`${weapon.id}/${def.id}/${key}`);
 }
});

test('一般報酬コアは全階層で固有コアを除外し、実験室だけは全種類を貸し出す',()=>{
 const rng=makeRng(98);for(let i=0;i<1000;i++)assert.ok(!CORE_BY_ID[rollItem(rng,1+i,`generic-${i}`).type].exclusiveEnemyId);
 const lab=laboratory();for(const def of CORE_DEFS)assert.ok(lab.inventory.some(it=>it.type===def.id));assert.equal(lab.equipment.length,18);assert.deepEqual(lab.consumables,{healing_draught:10,ward_scroll:10});
});

test('不明な敵・不正階層・範囲外乱数のドロップを拒否する',()=>{
 for(const options of [{enemyId:'unknown',floor:1,idPrefix:'a'},{enemyId:'slime',floor:0,idPrefix:'a'},{enemyId:'slime',floor:1.5,idPrefix:'a'},{enemyId:'slime',floor:1,idPrefix:''}])assert.throws(()=>rollEnemyDrops(makeRng(1),options));
 for(const value of [-.1,1,NaN,Infinity])assert.throws(()=>rollEnemyDrops(()=>value,{enemyId:'slime',floor:1,idPrefix:'bad'}));
});
