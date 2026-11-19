import {CORE_DEFS,RARITIES,ROLL_MIN,ROLL_MAX} from './catalog.mjs';
import {makeItem,rollKeys,rollItem,rarityWeights} from './core.mjs';
import {EQUIPMENT_DEFS,EQUIPMENT_BY_ID,MATERIAL_DEFS,makeEquipment} from './items.mjs';

function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
const enemyNames={slime:'草原スライム',goblin:'草原ゴブリン',wolf:'野生の狼',elder_treant:'草原の古老樹',scarab:'砂のスカラベ',sand_archer:'砂漠の射手',sand_worm:'潜砂ワーム',dune_scorpion:'砂丘の大蠍',ember_bat:'熾火コウモリ',fire_imp:'火のインプ',lava_golem:'溶岩ゴーレム',cinder_drake:'熾火の古竜',bog_slime:'毒沼スライム',spore_shaman:'胞子の呪術師',marsh_stalker:'湿原の追跡者',mire_hydra:'瘴気のヒュドラ',frost_wolf:'霜牙の狼',ice_archer:'氷の射手',ice_guardian:'氷壁の守護者',frost_giant:'白霜の巨人'};
const bossIds=new Set(['elder_treant','dune_scorpion','cinder_drake','mire_hydra','frost_giant']);
const genericEquipment=EQUIPMENT_DEFS.filter(d=>!d.sourceOnly).map(d=>d.id);
export const BOSS_RARITY_WEIGHTS=freeze({rare:.75,epic:.22,legendary:.03});
export const LOOT_RULES=freeze({
 version:'0.7.0',normalCoreChance:.12,normalEquipmentChance:.04,normalExclusiveEquipmentChance:.04,normalMaterialChance:.45,
 normalHealingChance:.06,normalWardChance:.025,
 bossSignature:'素材1〜2個を保証。固有枠はコア50%・装備50%のどちらか1個。',
 bossRarity:'固有枠はレア75%・エピック22%・レジェンダリー3%。個体値は取得時に95〜105%で確定。',
 floorGoldBonus:'通常は min(500, floor(sqrt(階層−1)×2)) G、階層ボスはその4倍を基礎額へ加算。'
});

/** Entries are the actual roll table used below, also exposed to the field guide. */
export const ENEMY_DROP_TABLES=freeze(Object.fromEntries(Object.entries(enemyNames).map(([enemyId,name])=>{
 const boss=bossIds.has(enemyId),material=MATERIAL_DEFS.find(d=>d.sourceEnemyId===enemyId),equipment=EQUIPMENT_DEFS.find(d=>d.sourceEnemyId===enemyId),core=CORE_DEFS.find(d=>d.exclusiveEnemyId===enemyId);
 const entries=[{kind:'gold',chance:1,amountMin:boss?20:2,amountMax:boss?35:5,floorScaling:boss?4:1},{kind:'material',itemId:material.id,chance:boss?1:.45,amountMin:1,amountMax:boss?2:1,exclusive:true}];
 if(boss){
  entries.push({kind:'core',definitionId:core.id,chance:.5,exclusive:true,exclusiveGroup:'boss_signature',rarityPolicy:'boss'},
   {kind:'equipment',definitionId:equipment.id,chance:.5,exclusive:true,exclusiveGroup:'boss_signature',rarityPolicy:'boss'},
   {kind:'consumable',itemId:'healing_draught',chance:.4,amountMin:1,amountMax:1});
 }else{
  entries.push({kind:'core',chance:.12,rarityPolicy:'depth'},
   {kind:'equipment',definitionIds:[...genericEquipment],chance:.04,rarityPolicy:'depth'},
   {kind:'consumable',itemId:'healing_draught',chance:.06,amountMin:1,amountMax:1},
   {kind:'consumable',itemId:'ward_scroll',chance:.025,amountMin:1,amountMax:1});
  if(equipment)entries.push({kind:'equipment',definitionId:equipment.id,chance:.04,exclusive:true,rarityPolicy:'depth'});
 }
 return [enemyId,{enemyId,name,boss,entries}];
})));
export const ENEMY_DROP_DEFS=freeze(Object.values(ENEMY_DROP_TABLES));
function drawRarity(draw,floor,policy){
 const choices=policy==='boss'?Object.entries(BOSS_RARITY_WEIGHTS):RARITIES.map((rarity,i)=>[rarity.id,rarityWeights(floor)[i]/100]);
 let value=draw();for(const [id,chance] of choices){value-=chance;if(value<0)return id;}return choices.at(-1)[0];
}
/** A seeded, pure drop roll. Payloads are unbanked until collected and returned. */
export function rollEnemyDrops(rng,{enemyId,floor,idPrefix}={}){
 if(typeof rng!=='function'||!Object.hasOwn(ENEMY_DROP_TABLES,enemyId)||!Number.isSafeInteger(floor)||floor<1||typeof idPrefix!=='string'||!idPrefix||idPrefix.length>100)throw Error('敵ドロップの条件が不正');
 const draw=()=>{const value=rng();if(!Number.isFinite(value)||value<0||value>=1)throw Error('乱数は0以上1未満が必要');return value;};
 const integer=(min,max)=>min+Math.floor(draw()*(max-min+1));
 const table=ENEMY_DROP_TABLES[enemyId],result=[],handledGroups=new Set();let serial=0;
 const makeDrop=entry=>{
  if(entry.kind==='gold'){const bonus=Math.min(500,Math.floor(Math.sqrt(floor-1)*2))*entry.floorScaling;return {kind:'gold',amount:integer(entry.amountMin,entry.amountMax)+bonus};}
  if(entry.kind==='material'||entry.kind==='consumable')return {kind:entry.kind,itemId:entry.itemId,amount:integer(entry.amountMin,entry.amountMax)};
  const id=`${idPrefix}-${entry.kind}-${serial++}`;
  if(entry.kind==='core'){
   if(!entry.definitionId)return {kind:'core',core:rollItem(draw,floor,id)};
   const type=entry.definitionId,rarity=drawRarity(draw,floor,entry.rarityPolicy),rolls=Object.fromEntries(rollKeys(type).map(key=>[key,integer(ROLL_MIN,ROLL_MAX)]));
   return {kind:'core',core:makeItem(id,integer(0,9),type,{rarity,rolls})};
  }
  const definitionId=entry.definitionId??entry.definitionIds[integer(0,entry.definitionIds.length-1)],rarity=drawRarity(draw,floor,entry.rarityPolicy),rolls=Object.fromEntries(Object.keys(EQUIPMENT_BY_ID[definitionId].mods).map(key=>[key,integer(ROLL_MIN,ROLL_MAX)]));
  return {kind:'equipment',item:makeEquipment(id,definitionId,{rarity,rolls})};
 };
 for(const entry of table.entries){
  if(entry.exclusiveGroup){
   if(handledGroups.has(entry.exclusiveGroup))continue;handledGroups.add(entry.exclusiveGroup);
   const group=table.entries.filter(other=>other.exclusiveGroup===entry.exclusiveGroup);let choice=draw(),selected=group.at(-1);
   for(const other of group){choice-=other.chance;if(choice<0){selected=other;break;}}
   result.push(makeDrop(selected));
  }else if(entry.chance===1||draw()<entry.chance)result.push(makeDrop(entry));
 }
 return result;
}
