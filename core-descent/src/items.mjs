import {RARITY_BY_ID,ROLL_MIN,ROLL_MAX} from './catalog.mjs';

/** Permanent RPG assets. This module has no dependency on the core or combat engine. */
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
function record(value,label){if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(`${label}が不正`);return value;}
function own(table,key){return typeof key==='string'&&Object.hasOwn(table,key);}
function count(value,label){if(!Number.isSafeInteger(value)||value<0)throw Error(`${label}は0以上の安全な整数が必要`);return value;}
function addCount(a,b,label){return count(a+b,label);}

export const EQUIPMENT_SLOTS=freeze(['armor','charm','boots']);
export const EQUIPMENT_SLOT_LABELS=freeze({armor:'防具',charm:'護符',boots:'靴'});
export const EQUIPMENT_STAT_LABELS=freeze({
 maxHp:['最大HP',1,''],regen:['自然回復',1,'HP/秒'],move:['移動速度',1,'px/秒'],pickup:['回収半径',1,'px'],vision:['視界',1,'マス'],
 damageBonus:['全武器の威力',100,'%'],rateBonus:['攻撃速度',100,'%'],rangeBonus:['射程・間合い',100,'%'],
 armorMitigation:['被ダメージ軽減',100,'%'],statusResistance:['状態異常耐性',100,'%']
});
export const MATERIAL_DEFS=freeze([
 {id:'slime_gel',name:'澄んだ粘液',sourceEnemyId:'slime'},
 {id:'goblin_scrap',name:'小鬼の金属片',sourceEnemyId:'goblin'},
 {id:'wolf_fang',name:'森狼の牙',sourceEnemyId:'wolf'},
 {id:'ancient_bark',name:'古樹の心樹皮',sourceEnemyId:'elder_treant'},
 {id:'scarab_shell',name:'黄金甲虫の殻',sourceEnemyId:'scarab'},
 {id:'sun_thread',name:'砂弓の陽糸',sourceEnemyId:'sand_archer'},
 {id:'sand_pearl',name:'砂虫の真珠',sourceEnemyId:'sand_worm'},
 {id:'dune_venom',name:'砂蠍王の毒腺',sourceEnemyId:'dune_scorpion'},
 {id:'ember_wing',name:'残り火の羽',sourceEnemyId:'ember_bat'},
 {id:'imp_ash',name:'火小鬼の灰',sourceEnemyId:'fire_imp'},
 {id:'molten_ore',name:'溶岩鉱石',sourceEnemyId:'lava_golem'},
 {id:'drake_scale',name:'灰竜の逆鱗',sourceEnemyId:'cinder_drake'},
 {id:'bog_resin',name:'沼の樹脂',sourceEnemyId:'bog_slime'},
 {id:'spore_cap',name:'胞子の笠',sourceEnemyId:'spore_shaman'},
 {id:'stalker_reed',name:'潜行者の葦',sourceEnemyId:'marsh_stalker'},
 {id:'hydra_ichor',name:'沼蛇竜の霊液',sourceEnemyId:'mire_hydra'},
 {id:'frost_fur',name:'霜狼の毛皮',sourceEnemyId:'frost_wolf'},
 {id:'ice_string',name:'氷弓の弦',sourceEnemyId:'ice_archer'},
 {id:'guardian_crystal',name:'氷守の結晶',sourceEnemyId:'ice_guardian'},
 {id:'giant_heart',name:'霜巨人の心晶',sourceEnemyId:'frost_giant'}
].map((d,i)=>({...d,glyph:'◆',color:['#a8c989','#d6bf83','#df956c','#aa91bd','#a4d4e8'][Math.floor(i/4)],description:'固有の敵から持ち帰る素材。拠点で消耗品や装備の製作に使う。'})));
export const MATERIAL_BY_ID=freeze(Object.fromEntries(MATERIAL_DEFS.map(d=>[d.id,d])));
export const CONSUMABLE_DEFS=freeze([
 {id:'healing_draught',name:'癒しの霊薬',glyph:'♥',price:40,description:'最大HPの35%を回復。満タン時は使わない。回復連撃のコアにも対応。',effect:{healFraction:.35}},
 {id:'ward_scroll',name:'守りの巻物',glyph:'◇',price:60,description:'8秒間、受けるダメージを30%軽減し、状態異常を50%軽減。防具とは乗算。',effect:{duration:8,damageReduction:.30,statusResistance:.50}}
]);
export const CONSUMABLE_BY_ID=freeze(Object.fromEntries(CONSUMABLE_DEFS.map(d=>[d.id,d])));

export const EQUIPMENT_DEFS=freeze([
 {id:'traveler_vest',name:'旅人の上着',slot:'armor',mods:{maxHp:10,armorMitigation:.015}},
 {id:'copper_talisman',name:'銅の護符',slot:'charm',mods:{damageBonus:.025,pickup:4}},
 {id:'trail_boots',name:'踏破の靴',slot:'boots',mods:{move:3,vision:.25}},
 {id:'gel_coat',name:'清流の粘膜衣',slot:'armor',sourceEnemyId:'slime',mods:{maxHp:8,regen:.10}},
 {id:'scavenger_charm',name:'小鬼の収集符',slot:'charm',sourceEnemyId:'goblin',mods:{pickup:8,damageBonus:.02}},
 {id:'shell_carapace',name:'黄金甲の胸当て',slot:'armor',sourceEnemyId:'scarab',mods:{armorMitigation:.025,maxHp:8}},
 {id:'sunstring_charm',name:'陽糸の護符',slot:'charm',sourceEnemyId:'sand_archer',mods:{rangeBonus:.03,vision:.5}},
 {id:'cinder_steps',name:'残り火の靴',slot:'boots',sourceEnemyId:'ember_bat',mods:{move:3,statusResistance:.03}},
 {id:'imp_ember_charm',name:'小鬼火の護符',slot:'charm',sourceEnemyId:'fire_imp',mods:{damageBonus:.025,regen:.04}},
 {id:'bogskin_armor',name:'沼渡りの外套',slot:'armor',sourceEnemyId:'bog_slime',mods:{statusResistance:.06,maxHp:8}},
 {id:'spore_memento',name:'胞子の記憶',slot:'charm',sourceEnemyId:'spore_shaman',mods:{regen:.12,pickup:5}},
 {id:'frost_runner',name:'霜狼の足袋',slot:'boots',sourceEnemyId:'frost_wolf',mods:{move:3,maxHp:6}},
 {id:'ice_focus',name:'氷弦の護符',slot:'charm',sourceEnemyId:'ice_archer',mods:{rateBonus:.025,rangeBonus:.02}},
 {id:'elderheart_armor',name:'古樹王の守衣',slot:'armor',sourceEnemyId:'elder_treant',mods:{maxHp:16,regen:.15,armorMitigation:.025}},
 {id:'dunewalker_boots',name:'砂蠍王の踏靴',slot:'boots',sourceEnemyId:'dune_scorpion',mods:{move:4,statusResistance:.05,pickup:6}},
 {id:'drakescale_armor',name:'灰竜の鱗鎧',slot:'armor',sourceEnemyId:'cinder_drake',mods:{maxHp:12,armorMitigation:.04,damageBonus:.015}},
 {id:'hydra_charm',name:'沼蛇竜の環',slot:'charm',sourceEnemyId:'mire_hydra',mods:{regen:.20,damageBonus:.02,statusResistance:.05}},
 {id:'giant_stride',name:'霜巨人の歩み',slot:'boots',sourceEnemyId:'frost_giant',mods:{maxHp:10,move:2.6,statusResistance:.04}}
].map(d=>({...d,sourceEnemyId:d.sourceEnemyId??null,sourceOnly:!!d.sourceEnemyId,glyph:({armor:'⬡',charm:'◇',boots:'›'})[d.slot],color:({armor:'#b8d1bd',charm:'#d6b67b',boots:'#9cbfd0'})[d.slot],description:'全10種の武器で装着可能。コア合成の後に補正し、伝達経路数では増幅しない。'})));
export const EQUIPMENT_BY_ID=freeze(Object.fromEntries(EQUIPMENT_DEFS.map(d=>[d.id,d])));
export const MAX_EQUIPMENT=2000;

export function equipmentDefinition(item){const id=typeof item==='string'?item:item?.definitionId;if(!own(EQUIPMENT_BY_ID,id))throw Error('装備種類が不正');return EQUIPMENT_BY_ID[id];}
export function makeEquipment(id,definitionId,{rarity='common',rolls}={}){
 if(typeof id!=='string'||!id||id.length>128)throw Error('装備IDが不正');
 const def=equipmentDefinition(definitionId);if(!own(RARITY_BY_ID,rarity))throw Error('装備のレア度が不正');
 const keys=Object.keys(def.mods);rolls??=Object.fromEntries(keys.map(key=>[key,10000]));record(rolls,'装備個体値');
 if(Object.keys(rolls).length!==keys.length||keys.some(key=>!Object.hasOwn(rolls,key)||!Number.isInteger(rolls[key])||rolls[key]<ROLL_MIN||rolls[key]>ROLL_MAX))throw Error('装備個体値は各能力9500〜10500の整数が必要');
 return {id,definitionId,rarity,rolls:{...rolls}};
}
export function validateEquipment(item){record(item,'装備');if(!own(RARITY_BY_ID,item.rarity)||!item.rolls)throw Error('装備のレア度または個体値がありません');return makeEquipment(item.id,item.definitionId,{rarity:item.rarity,rolls:item.rolls});}
export function equipmentValues(item){const valid=validateEquipment(item),def=equipmentDefinition(valid),factor=RARITY_BY_ID[valid.rarity].factor;return Object.fromEntries(Object.entries(def.mods).map(([key,value])=>[key,value*factor*valid.rolls[key]/10000]));}

function counts(raw,definitions,label){record(raw,label);const result={};for(const [id,value] of Object.entries(raw)){if(!own(definitions,id))throw Error(`${label}の種類が不正`);result[id]=count(value,label);}return result;}
function equipmentList(raw){if(!Array.isArray(raw)||raw.length>MAX_EQUIPMENT)throw Error('装備一覧が不正');const result=raw.map(validateEquipment);if(new Set(result.map(it=>it.id)).size!==result.length)throw Error('装備IDが重複');return result;}
/** Validate into fresh objects first. Missing old fields migrate once; empty fields never regrant supplies. */
export function rpgAssets(profile){
 record(profile,'所持品');
 const materials=counts(profile.materials===undefined?{}:profile.materials,MATERIAL_BY_ID,'素材');
 const equipment=equipmentList(profile.equipment===undefined?[]:profile.equipment);
 const consumables=counts(profile.consumables===undefined?{healing_draught:3,ward_scroll:0}:profile.consumables,CONSUMABLE_BY_ID,'消耗品');
 const rawEquipped=profile.equipped===undefined?{}:record(profile.equipped,'装着品');
 if(Object.keys(rawEquipped).some(slot=>!EQUIPMENT_SLOTS.includes(slot)))throw Error('装備枠が不正');
 const equipped=Object.fromEntries(EQUIPMENT_SLOTS.map(slot=>[slot,rawEquipped[slot]??null]));
 const byId=new Map(equipment.map(it=>[it.id,it]));
 for(const slot of EQUIPMENT_SLOTS){const id=equipped[slot];if(id!==null&&(typeof id!=='string'||!byId.has(id)||equipmentDefinition(byId.get(id)).slot!==slot))throw Error('未所持または枠の異なる装備');}
 if(Array.isArray(profile.inventory)){const coreIds=new Set(profile.inventory.map(it=>it.id));if(equipment.some(it=>coreIds.has(it.id)))throw Error('装備とコアのIDが重複');}
 return {materials,equipment,equipped,consumables};
}
export function ensureRpgProfile(profile){const assets=rpgAssets(profile);Object.assign(profile,assets);return profile;}
/** Cargo defaults to empty: it must not receive the old-save starter supply migration. */
export function normalizeCargo(cargo={}){
 record(cargo,'戦利品');if(Object.keys(cargo).some(key=>!['materials','equipment','consumables'].includes(key)))throw Error('戦利品の項目が不正');
 return {materials:counts(cargo.materials===undefined?{}:cargo.materials,MATERIAL_BY_ID,'素材'),equipment:equipmentList(cargo.equipment===undefined?[]:cargo.equipment),consumables:counts(cargo.consumables===undefined?{}:cargo.consumables,CONSUMABLE_BY_ID,'消耗品')};
}
function atHub(profile){if(profile.runActive)throw Error('探索中の装備変更・製作はできません');}
export function equipItem(profile,id){atHub(profile);const assets=rpgAssets(profile),item=assets.equipment.find(it=>it.id===id);if(!item)throw Error('未所持の装備');assets.equipped[equipmentDefinition(item).slot]=id;Object.assign(profile,assets);return item;}
export function unequipItem(profile,slot){atHub(profile);if(!EQUIPMENT_SLOTS.includes(slot))throw Error('装備枠が不正');const assets=rpgAssets(profile),old=assets.equipped[slot];assets.equipped[slot]=null;Object.assign(profile,assets);return old;}
/** Equipment applies after the core pyramid, equally to every weapon. Never mutate the compiled base. */
export function applyEquipment(spec,profile){
 const assets=rpgAssets(profile),byId=new Map(assets.equipment.map(it=>[it.id,it]));
 if(spec.equipmentBonuses)throw Error('装備補正はコア合成の直後に1回だけ適用してください');
 const bonuses=Object.fromEntries(Object.keys(EQUIPMENT_STAT_LABELS).map(key=>[key,0]));
 for(const id of Object.values(assets.equipped))if(id)for(const [key,value] of Object.entries(equipmentValues(byId.get(id))))bonuses[key]+=value;
 const result=structuredClone(spec);
 for(const key of ['maxHp','regen','move','pickup','vision'])result[key]=(result[key]??0)+bonuses[key];
 for(const [key,bonus] of [['damage','damageBonus'],['rate','rateBonus'],['range','rangeBonus']])result[key]*=1+bonuses[bonus];
 result.armorMitigation=Math.min(.35,Math.max(0,(spec.armorMitigation||0)+bonuses.armorMitigation));
 result.statusResistance=Math.min(.60,Math.max(0,(spec.statusResistance||0)+bonuses.statusResistance));
 for(const key of ['damage','rate','range','maxHp','regen','move','pickup','vision','armorMitigation','statusResistance'])if(!Number.isFinite(result[key])||result[key]<0)throw Error('装備適用後の能力が不正');
 result.equipmentBonuses=bonuses;return result;
}
/** Caller checks the combat engine can use the effect before consuming, in the same synchronous action. */
export function consumeItem(profile,itemId){
 if(!own(CONSUMABLE_BY_ID,itemId))throw Error('消耗品が不正');const assets=rpgAssets(profile);
 if(!(assets.consumables[itemId]>0))throw Error('消耗品を所持していません');assets.consumables[itemId]--;
 Object.assign(profile,assets);return {itemId,...CONSUMABLE_BY_ID[itemId].effect};
}
export function buyConsumable(profile,itemId,amount=1){
 atHub(profile);if(!own(CONSUMABLE_BY_ID,itemId)||!Number.isSafeInteger(amount)||amount<1)throw Error('購入内容が不正');
 const assets=rpgAssets(profile),cost=CONSUMABLE_BY_ID[itemId].price*amount;count(profile.wallet,'通貨');count(cost,'購入額');if(profile.wallet<cost)throw Error('通貨が不足しています');
 assets.consumables[itemId]=addCount(assets.consumables[itemId]||0,amount,'消耗品');
 Object.assign(profile,assets,{wallet:profile.wallet-cost});return {kind:'consumable',itemId,amount};
}

const bossRecipes=[
 ['elderheart_armor','ancient_bark'],['dunewalker_boots','dune_venom'],['drakescale_armor','drake_scale'],['hydra_charm','hydra_ichor'],['giant_stride','giant_heart']
];
const bossMaterialIds=new Set(bossRecipes.map(([,id])=>id));
export const CRAFT_RECIPES=freeze([
 ...MATERIAL_DEFS.filter(d=>!bossMaterialIds.has(d.id)).map((d,i)=>{const itemId=i%3===2?'ward_scroll':'healing_draught';return {id:`brew_${d.id}`,name:`${d.name}から${CONSUMABLE_BY_ID[itemId].name}`,materials:{[d.id]:2},gold:itemId==='ward_scroll'?20:12,output:{kind:'consumable',itemId,amount:1}};}),
 ...bossRecipes.map(([definitionId,materialId])=>({id:`forge_${definitionId}`,name:`${EQUIPMENT_BY_ID[definitionId].name}を製作`,materials:{[materialId]:3},gold:100,output:{kind:'equipment',definitionId,rarity:'rare'}}))
]);
export const RECIPE_BY_ID=freeze(Object.fromEntries(CRAFT_RECIPES.map(d=>[d.id,d])));
export function craftItem(profile,recipeId,{id}={}){
 atHub(profile);if(!own(RECIPE_BY_ID,recipeId))throw Error('製作レシピが不正');const recipe=RECIPE_BY_ID[recipeId],assets=rpgAssets(profile);
 count(profile.wallet,'通貨');if(profile.wallet<recipe.gold)throw Error('製作費が不足しています');
 for(const [materialId,needed] of Object.entries(recipe.materials))if((assets.materials[materialId]||0)<needed)throw Error('製作素材が不足しています');
 let result;
 if(recipe.output.kind==='equipment'){
  if(assets.equipment.length>=MAX_EQUIPMENT)throw Error('装備の所持上限です');
  const known=new Set([...assets.equipment.map(it=>it.id),...(profile.inventory||[]).map(it=>it.id)]);
  if(id===undefined){let next=1;do{id=`crafted-${recipe.output.definitionId}-${next++}`;}while(known.has(id));}
  if(known.has(id))throw Error('製作する装備IDが重複');
  const item=makeEquipment(id,recipe.output.definitionId,{rarity:recipe.output.rarity});assets.equipment.push(item);result={kind:'equipment',item};
 }else{const {itemId,amount}=recipe.output;assets.consumables[itemId]=addCount(assets.consumables[itemId]||0,amount,'消耗品');result={kind:'consumable',itemId,amount};}
 for(const [materialId,needed] of Object.entries(recipe.materials))assets.materials[materialId]-=needed;
 Object.assign(profile,assets,{wallet:profile.wallet-recipe.gold});return result;
}
