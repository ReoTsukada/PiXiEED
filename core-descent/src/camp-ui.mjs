import { RARITY_BY_ID, CORE_BY_ID } from './catalog.mjs';
import { BIOMES, MONSTERS } from './world.mjs';
import { EQUIPMENT_SLOTS, EQUIPMENT_STAT_LABELS, EQUIPMENT_BY_ID, MATERIAL_DEFS, MATERIAL_BY_ID, CONSUMABLE_DEFS, CONSUMABLE_BY_ID, CRAFT_RECIPES, equipmentDefinition, equipmentValues, equipItem, unequipItem, buyConsumable, craftItem, ensureRpgProfile } from './items.mjs';
import { ENEMY_DROP_TABLES } from './loot.mjs';
import { getSpriteAtlas } from './sprites.mjs';

const campElement=id=>document.getElementById(id);
const campEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const campNumber=(n,d=1)=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:d});
const SLOT_NAMES={armor:'防具',charm:'護符',boots:'靴'};
const AI_NAMES={hop:'跳躍して接近',orbit:'横に回り込み接近',charge:'予告後に突進',ranged:'距離を取って射撃',caster:'距離を取って詠唱',heavy:'ゆっくり接近し範囲攻撃',boss:'複数の攻撃を切り替える'};
const ATTACK_NAMES={charge:'直線突進',shot:'飛び道具',area:'足元への範囲攻撃',slam:'周囲への叩きつけ',cone:'扇形の範囲攻撃'};

export function cargoCounts(cargo={}) {
 return {materials:Object.values(cargo.materials??{}).reduce((a,b)=>a+b,0),equipment:cargo.equipment?.length??0,consumables:Object.values(cargo.consumables??{}).reduce((a,b)=>a+b,0)};
}
export function equipmentText(item) {
 return Object.entries(equipmentValues(item)).map(([key,value])=>{
  const [label,scale,suffix]=EQUIPMENT_STAT_LABELS[key]??[key,1,''];
  return `${label} +${campNumber(value*scale,2)}${suffix}`;
 }).join(' / ');
}
export function pickupText(drop) {
 if(drop.kind==='gold')return `${campNumber(drop.amount,0)} G`;
 if(drop.kind==='equipment')return `${equipmentDefinition(drop.item).name} / ${RARITY_BY_ID[drop.item.rarity].name}`;
 if(drop.kind==='material')return `${MATERIAL_BY_ID[drop.itemId]?.name??drop.itemId} ×${drop.amount}`;
 if(drop.kind==='consumable')return `${CONSUMABLE_BY_ID[drop.itemId]?.name??drop.itemId} ×${drop.amount}`;
 return 'コア';
}
export function renderCamp(profile,{mode='normal',onChange=()=>{},onError=()=>{}}={}) {
 const p=ensureRpgProfile(profile),byId=new Map(p.equipment.map(item=>[item.id,item]));
 const act=fn=>{try{fn();onChange();}catch(error){onError(error.message);}};
 campElement('inventory-mode').textContent=mode==='normal'?'通常探索の所持品':'実験室の貸し出し品・通常資産とは別';
 campElement('inventory-wallet').textContent=`${campNumber(p.wallet,0)} G`;
 campElement('inventory-normal').classList.toggle('active',mode==='normal');
 campElement('inventory-lab').classList.toggle('active',mode==='lab');
 campElement('equipment-count').textContent=`${p.equipment.length}個`;
 campElement('equipment-slots').innerHTML=EQUIPMENT_SLOTS.map(slot=>{
  const item=byId.get(p.equipped[slot]),def=item&&equipmentDefinition(item);
  return `<article class="equipment-slot"><span class="label">${SLOT_NAMES[slot]}</span><span class="gear-icon" aria-hidden="true">${def?.glyph??'◇'}</span><h3>${campEscape(def?.name??'装備なし')}</h3><p class="note">${item?campEscape(equipmentText(item)):'拾った装備を持ち帰り、この枠に装着できます。'}</p>${item?`<button class="tiny quiet" data-unequip="${slot}">${SLOT_NAMES[slot]}を外す</button>`:''}</article>`;
 }).join('');
 campElement('equipment-slots').querySelectorAll('[data-unequip]').forEach(button=>button.onclick=()=>act(()=>unequipItem(p,button.dataset.unequip)));
 campElement('equipment-list').innerHTML=p.equipment.length?p.equipment.map(item=>{
  const def=equipmentDefinition(item),rarity=RARITY_BY_ID[item.rarity],active=p.equipped[def.slot]===item.id;
  return `<article class="gear-row" data-equipped="${active}"><span class="gear-icon" style="color:${def.color}" aria-hidden="true">${def.glyph}</span><div class="gear-info"><h3>${campEscape(def.name)}</h3><small style="color:${rarity.color}">${rarity.name} · ${SLOT_NAMES[def.slot]}${active?' · 装備中':''}</small><small>${campEscape(equipmentText(item))}</small><small>${campEscape(def.description)}</small><small>${def.sourceEnemyId?`${campEscape(MONSTERS[def.sourceEnemyId]?.name??def.sourceEnemyId)}の限定品`:'各地で入手できる装備'}</small></div><button class="tiny ${active?'quiet':'primary'}" data-equip="${campEscape(item.id)}" ${active?'disabled':''} aria-label="${campEscape(def.name)}を装備">${active?'装備中':'装備する'}</button></article>`;
 }).join(''):'<p class="gear-empty">まだ装備を持っていません。敵を倒して回収し、緑の帰還陣で持ち帰りましょう。図鑑で固有装備の入手先を確認できます。</p>';
 campElement('equipment-list').querySelectorAll('[data-equip]').forEach(button=>button.onclick=()=>act(()=>equipItem(p,button.dataset.equip)));
 const materials=MATERIAL_DEFS.filter(def=>(p.materials[def.id]??0)>0);
 campElement('material-list').innerHTML=materials.length?materials.map(def=>`<div class="material-chip"><span aria-hidden="true">${def.glyph}</span><div><b>${campEscape(def.name)}</b><small>${campEscape(MONSTERS[def.sourceEnemyId]?.name??'各地の敵')}</small></div><b class="quantity">${campNumber(p.materials[def.id],0)}</b></div>`).join(''):'<p class="note">持ち帰った素材がここに並びます。</p>';
 campElement('supply-shop').innerHTML=CONSUMABLE_DEFS.map(def=>`<article class="supply-card"><div class="row between"><h3>${def.glyph} ${campEscape(def.name)}</h3><span class="tag mint">所持 ${p.consumables[def.id]??0}</span></div><p class="note">${campEscape(def.description)}</p><div class="row between"><span>${campNumber(def.price,0)} G</span><button class="tiny" data-buy-supply="${def.id}" ${p.wallet<def.price?'disabled':''}>1個購入</button></div></article>`).join('');
 campElement('supply-shop').querySelectorAll('[data-buy-supply]').forEach(button=>button.onclick=()=>act(()=>buyConsumable(p,button.dataset.buySupply)));
 campElement('craft-list').innerHTML=CRAFT_RECIPES.map(recipe=>{
  const available=p.wallet>=recipe.gold&&Object.entries(recipe.materials).every(([id,count])=>(p.materials[id]??0)>=count);
  const needs=Object.entries(recipe.materials).map(([id,count])=>`<span class="${(p.materials[id]??0)<count?'missing':''}">${campEscape(MATERIAL_BY_ID[id]?.name??id)} ${p.materials[id]??0}/${count}</span>`).join(' · ');
  return `<article class="craft-card"><h3>${campEscape(recipe.name)}</h3><p class="note">${needs}</p><div class="row between"><span>${campNumber(recipe.gold,0)} G</span><button class="tiny" data-craft="${recipe.id}" ${available?'':'disabled'}>製作する</button></div></article>`;
 }).join('');
 campElement('craft-list').querySelectorAll('[data-craft]').forEach(button=>button.onclick=()=>act(()=>craftItem(p,button.dataset.craft)));
}

function guideDropName(entry) {
 if(entry.kind==='gold')return `${entry.amountMin}〜${entry.amountMax} G＋階層補正`;
 if(entry.kind==='material')return MATERIAL_BY_ID[entry.itemId]?.name??entry.itemId;
 if(entry.kind==='equipment')return EQUIPMENT_BY_ID[entry.definitionId]?.name??'装備（汎用3種から）';
 if(entry.kind==='consumable')return CONSUMABLE_BY_ID[entry.itemId]?.name??'消耗品';
 if(entry.kind==='core')return CORE_BY_ID[entry.coreType??entry.itemId??entry.definitionId]?.name??'通常コア';
 return entry.kind;
}
export function renderFieldGuide(onTest=()=>{}) {
 campElement('field-guide').innerHTML=BIOMES.map((biome,index)=>{
  const enemies=[...biome.monsters,biome.bossId];
  return `<article class="biome-card" style="--biome-color:${biome.palette.accent}"><header><span class="label">${index*5+1}〜${index*5+5}階 · 25階ごとに再登場</span><h2>${campEscape(biome.name)}</h2><p>${campEscape(biome.description)}</p><button class="tiny" data-field-test="${index*5+1}">このフィールドを体験</button></header>${enemies.map(id=>{
   const enemy=MONSTERS[id],drops=ENEMY_DROP_TABLES[id]?.entries??[],attacks=enemy.attacks??(enemy.attack?[enemy.attack]:[]);
   const pattern=attacks.map(a=>`${ATTACK_NAMES[a.type]??a.type}（予告${a.windup}秒）`).join(' / ');
   return `<details class="biome-monster"><summary>${enemy.boss?'BOSS · ':''}${campEscape(enemy.name)}<small>${AI_NAMES[enemy.ai]??enemy.ai} · 基礎移動 ${enemy.speed}px/秒</small></summary><div class="monster-detail"><canvas class="monster-portrait" width="160" height="160" data-monster="${id}" aria-label="${campEscape(enemy.name)}のスプライト"></canvas><p>${campEscape(pattern||'近づいて接触攻撃。位置を変え、囲まれる前に対処しよう。')}${enemy.boss?'。HP半減後は攻撃間隔が短くなる。':''}</p></div><table class="drop-table"><thead><tr><th>戦利品</th><th>確率</th></tr></thead><tbody>${drops.map(entry=>`<tr><td>${campEscape(guideDropName(entry))}${entry.kind==='material'&&entry.amountMax>1?` ×${entry.amountMin}〜${entry.amountMax}`:''}</td><td>${campNumber(entry.chance*100,1)}%</td></tr>`).join('')}</tbody></table>${enemy.boss?'<p class="note" style="margin-top:9px">固有コア・固有装備はどちらか1個。通常の敵からは落ちません。</p>':''}</details>`;
  }).join('')}</article>`;
 }).join('');
 campElement('field-guide').querySelectorAll('[data-field-test]').forEach(button=>button.onclick=()=>onTest(Number(button.dataset.fieldTest)));
 const atlas=getSpriteAtlas();
 campElement('field-guide').querySelectorAll('details').forEach(details=>details.ontoggle=()=>{
  if(!details.open)return;const canvas=details.querySelector('canvas');if(canvas.dataset.drawn)return;
  const sprite=atlas.get(canvas.dataset.monster,1,0),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
  const scale=Math.min(144/sprite.image.width,144/sprite.image.height,3);
  ctx.drawImage(sprite.image,(160-sprite.image.width*scale)/2,(160-sprite.image.height*scale)/2,sprite.image.width*scale,sprite.image.height*scale);
  canvas.dataset.drawn='true';
 });
}
