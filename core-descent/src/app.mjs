import {WEAPONS,weaponForDigit} from './weapons.mjs';
import {BIOMES,MONSTERS,biomeForFloor} from './world.mjs';
import {applyEquipment,consumeItem,CONSUMABLE_BY_ID,MAX_EQUIPMENT} from './items.mjs';
import {renderCamp,renderFieldGuide,cargoCounts,pickupText} from './camp-ui.mjs';
import {itemDefinition,weaponIcon,weaponLabel} from './weapon-ui.mjs';
import {DungeonRenderer} from './renderer.mjs';
import {SCORE_RULES,CHALLENGE_ID,CHALLENGE_SEED,BOSS_SECONDS,captureLoadout,captureEquipment,makeRecord,addRecord,rankedRecords,restoreRecords} from './rankings.mjs';
import {BossTrial} from './boss.mjs';
import {CORE_DEFS,CORE_BY_ID,STAT_KEYS,RARITIES,RARITY_BY_ID,STAT_LABELS} from './catalog.mjs';
import {paths,blankBoard,validateBoard,compileBoard,makeProfile,laboratory,bankRun,loseRun,checkProfile,makeItem,normalizeItem,itemValues,itemRanges,rollKeys,makeRng} from './core.mjs';
import {GameEngine} from './engine.mjs';
import {AuctionBook} from './market.mjs';
const $=id=>document.getElementById(id),storageKey='core-descent-v4';let saveWarning='';
let normal=makeProfile();try{const stored=localStorage.getItem(storageKey)||localStorage.getItem('core-descent-v3')||localStorage.getItem('core-descent-v2')||localStorage.getItem('core-descent-v1');if(stored)normal=checkProfile(JSON.parse(stored));if(normal.runActive){normal.runActive=false;saveWarning='前回の探索は未帰還で終了。出発前の所持品は保護されています。';}}catch{saveWarning='保存機能を利用できないか、データが不正です。セーブの書き出しをご利用ください。';}
let lab=laboratory('storm',9,0),labKind='storm',mode='normal',selection=[0,0],tab='home',engine=null,paused=false,lastFrame=0,accumulator=0,toastTimer;
let challengeContext=null,finishHandled=false,localRecords=[],labStartFloor=1;
try{localRecords=restoreRecords(JSON.parse(localStorage.getItem('core-descent-records-v9')||'[]'));}catch{}
const profile=()=>mode==='normal'?normal:lab;
const combatSpec=p=>applyEquipment(compileBoard(p.board,p.inventory),p);
function esc(text){return String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function num(x,d=1){return Number(x).toLocaleString('ja-JP',{maximumFractionDigits:d});}
function weaponCondition(weapon){if(weapon.id==='staff')return `移動を止めて${num(weapon.stationarySeconds,2)}秒詠唱。高威力の魔力球を放ったら、すぐ移動できます。`;if(weapon.id==='spellbook')return '移動しながら3連の追尾魔弾。足を止めずに、敵の予告を避けながら詠唱できます。';return weapon.stationarySeconds>0?`移動を止めて${num(weapon.stationarySeconds,2)}秒で構える。強い一撃の後はすぐ移動できます。`:'移動しながら自動攻撃。敵の予告を避けながら戦えます。';}
function updateHomeWeapon(){const weapon=weaponForDigit(Number($('home-weapon').value));$('home-weapon-condition').textContent=weaponCondition(weapon);$('home-weapon-condition').classList.toggle('is-heavy',weapon.stationarySeconds>0);}
function rarityOf(item){return RARITY_BY_ID[item.rarity??'common'];}
function valueText(key,value){const [label,scale,suffix]=STAT_LABELS[key]||[key,1,''];return `${label} ${value>=0?'+':''}${num(value*scale,4)}${suffix}`;}
function itemSummary(item){const v=itemValues(item);return v.ampGain?`接続先 ×${num(1+v.ampGain,4)}`:Object.entries(v.mods).map(([k,n])=>valueText(k,n)).join(' / ');}
function rarityTag(item){const r=rarityOf(item);return `<span class="tag rarity-tag" style="--rarity-color:${r.color}">${r.name}</span>`;}
function itemNumbers(item,trace=null){
 const v=itemValues(item),ranges=itemRanges(item);
 let rows=Object.entries(v.mods).map(([k,n])=>`<tr><th>${STAT_LABELS[k]?.[0]||k}</th><td>${valueText(k,n).split(' ').slice(1).join(' ')}<small>範囲 ${valueText(k,ranges.mods[k][0]).split(' ').slice(1).join(' ')} 〜 ${valueText(k,ranges.mods[k][1]).split(' ').slice(1).join(' ')}</small></td><td>${trace?valueText(k,trace.own[k]).split(' ').slice(1).join(' '):'—'}</td></tr>`).join('');
 if(v.ampGain)rows+=`<tr><th>接続倍率</th><td>×${num(1+v.ampGain,4)}<small>範囲 ×${num(ranges.amp[0],4)}〜${num(ranges.amp[1],4)}</small></td><td>${trace?'×'+num(trace.ampFactor,4):'—'}</td></tr>`;
 return `<table class="roll-table"><thead><tr><th>能力</th><th>この個体</th><th>増幅後</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function toast(text,error=false){$('toast').textContent=text;$('toast').className='toast'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4500);}
function persist(){try{localStorage.setItem(storageKey,JSON.stringify(normal));$('save-state').textContent='ブラウザーに保存済み';}catch{$('save-state').textContent='自動保存不可：書き出しをご利用ください';}}
function currentItem(r=selection[0],c=selection[1]){return profile().inventory.find(x=>x.id===profile().board[r]?.[c]);}
function changeTab(next){
 if(engine?.status==='playing'&&next!=='game'){toast('探索を終了してから拠点へ戻れます。一時停止中に「探索放棄」で終了できます。',true);return;}
 tab=next;
 for(const page of ['home','build','inventory','game','catalog','market','rankings']){
  $(`page-${page}`).classList.toggle('hidden',page!==next);
  const button=document.querySelector(`[data-tab="${page}"]`);
  if(button){button.classList.toggle('active',page===next);if(page===next)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
 }
 document.body.classList.toggle('is-playing',next==='game'&&!!engine);
 document.body.classList.toggle('is-paused',next==='game'&&paused);
 if(next==='game'&&!engine){launchGame();return;}
 if(next==='inventory')renderInventory();if(next==='build')renderBoard();if(next==='market')renderMarket();if(next==='rankings')renderRankings();
 accumulator=0;lastFrame=0;
 window.scrollTo({top:0,behavior:'instant'});
}
function renderBoard(){
 const p=profile(),validation=validateBoard(p.board,p.inventory);const selectedCore=currentItem();const targetCells=new Set(selectedCore?.type==='amplifier'?[`${selection[0]-1},${selection[1]-1}`,`${selection[0]-1},${selection[1]}`]:[]);const inv=new Map(p.inventory.map(x=>[x.id,x]));if(selection[0]>=p.depth)selection=[0,0];
 $('mode-normal').classList.toggle('active',mode==='normal');$('mode-lab').classList.toggle('active',mode==='lab');$('lab-toolbar').classList.toggle('hidden',mode!=='lab');$('depth').value=p.depth;
 $('slot-count').textContent=`${p.depth}段 / ${p.depth*(p.depth+1)/2}枠`;
 $('board').innerHTML='<svg class="connections" aria-hidden="true"></svg>'+p.board.map((row,r)=>'<div class="board-row">'+row.map((id,c)=>{const item=inv.get(id),def=itemDefinition(item);return `<button class="core-node ${targetCells.has(`${r},${c}`)?'amp-target':''} ${!item?'empty':''} ${selection[0]===r&&selection[1]===c?'selected':''} ${validation.bad.has(`${r},${c}`)?'invalid':''}" data-r="${r}" data-c="${c}" style="--core-color:${def?.color||'#49606f'}" aria-label="${r+1}段目 ${c+1}番 ${item?`数字${item.digit} ${def.name} ${rarityOf(item).name}`:'空き枠'}、頂点へ${paths(r,c)}経路"><span class="weight">×${paths(r,c)}</span>${item?`<span class="rarity-dot" style="color:${rarityOf(item).color}">${rarityOf(item).short}</span>`:''}<span class="digit">${item?.digit??'＋'}</span><span class="glyph">${def?.glyph||''}</span></button>`;}).join('')+'</div>').join('');
 $('board').querySelectorAll('button').forEach(b=>b.onclick=()=>{selection=[+b.dataset.r,+b.dataset.c];renderBoard();});
 $('board-status').textContent=validation.valid?'接続成立 — この武器で探索できます':validation.errors[0]+(validation.errors.length>1?` ほか${validation.errors.length-1}件`:'' );$('board-status').className='status-text'+(validation.valid?'':' invalid');$('launch').disabled=!validation.valid;
 let stats=null;if(validation.valid)stats=combatSpec(p);
 const dps=stats?stats.damage*stats.rate*(1+stats.multi)*(stats.innateHits??1)*(stats.comboMultiplier??1)*(1+stats.crit*(stats.critMultiplier-1)):0;
 $('stats').innerHTML=[['攻撃威力',stats?num(stats.damage):'—','1ヒットの基準'],['攻撃速度',stats?num(stats.rate):'—','動作 / 秒'],['射程',stats?num(stats.range/32,1):'—','マス（1マス32）'],[stats?.weapon.stationarySeconds>0?'停止時の参考DPS':stats?.weapon.id==='chakram'?'往路の参考DPS':'全段命中DPS',stats?num(dps,0):'—','会心・連撃平均／条件補正・復路・範囲・属性は別'],['追加攻撃なしDPS',stats?num(dps/(1+stats.multi),0):'—','武器固有の連撃は含む参考値'],['吸収回復上限',stats&&stats.drain>0?num(stats.maxHp*.08,1):'—','HP/秒・自然回復は別']].map(([a,b,c])=>`<div class="stat"><span>${a}</span><b>${b}</b><small> ${c}</small></div>`).join('');
 $('effects').innerHTML=stats?CORE_DEFS.filter(d=>d.id!=='emitter'&&(d.amplify||Object.keys(d.mods).some(k=>stats.raw[k]>0))&&p.board.flat().some(id=>inv.get(id)?.type===d.id)).map(d=>`<span class="tag" style="border-color:${d.color}55">${esc(d.name)}</span>`).join(''):'<span class="note">数字パズルを完成させると最終出力を確認できます。</span>';
 $('mode-note').textContent=mode==='normal'?`所持コア ${p.inventory.length}個 / ${num(p.wallet,0)} G。初期の数字コアに加え、0〜9の武器核を所持。戦利品は緑の帰還陣で持ち帰って確保。「持ち物」で装備と道具を準備できます。`:'実験室：9段完成例と交換用コアを貸し出しています。通常探索の所持品・進行には影響しません。ここでパズルと能力の合成を試せます。';
 $('presets').innerHTML=p.presets.length?p.presets.map((pr,i)=>`<button class="tiny quiet" data-load-preset="${i}">${esc(pr.name)}</button>`).join(''):'<small>数字だけでなく、装着したコアの個体IDも保存します。</small>';
 $('presets').querySelectorAll('button').forEach(b=>b.onclick=()=>{const pr=p.presets[+b.dataset.loadPreset];p.board=structuredClone(pr.board);p.depth=p.board.length;selection=[0,0];if(mode==='normal')persist();renderBoard();});
 renderWeaponPicker(stats);renderSelected();requestAnimationFrame(drawLinks);
}
function renderWeaponPicker(stats=null){
 const p=profile(),root=currentItem(0,0),active=root?.type==='emitter'?root.digit:null,used=new Set(p.board.flat());
 $('weapon-picker').innerHTML=WEAPONS.map(w=>{
  const available=mode==='lab'||p.inventory.some(it=>it.type==='emitter'&&it.digit===w.digit&&(!used.has(it.id)||it.id===p.board[0][0]));
  return `<button class="weapon-choice ${active===w.digit?'active':''}" data-weapon="${w.digit}" aria-pressed="${active===w.digit}" aria-label="数字${w.digit} ${w.name}の武器核" ${available?'':'disabled'} style="--weapon-color:${w.color}"><span class="weapon-digit">${w.digit}</span>${weaponIcon(w.digit)}<span>${weaponLabel(w.digit)}</span></button>`;
 }).join('');
 const w=active===null?null:weaponForDigit(active);
 $('weapon-description').innerHTML=w?`<div class="weapon-title">${weaponIcon(w.digit)}<div><h3>${w.name}<span class="tag">${w.kind==='melee'?'近接':'遠隔・魔法'}</span><span class="tag ${w.stationarySeconds>0?'gold':'mint'}">${w.stationarySeconds>0?'停止して攻撃':'移動攻撃'}</span></h3><p>${esc(w.mechanic)}</p><p class="weapon-condition">${esc(weaponCondition(w))}</p></div></div><div class="weapon-facts"><span>基礎威力 <b>${num(w.baseDamage)}</b></span><span>基礎速度 <b>${num(w.baseRate,2)}回/秒</b></span><span>基礎射程 <b>${num(w.range/32,1)}マス</b></span>${stats?`<span>追加攻撃 <b>＋${num(stats.multi,2)}</b></span>`:''}</div>`:'<p class="note">頂点に装着する武器核を選んでください。</p>';
 $('weapon-instruction').textContent=mode==='lab'?'武器を選ぶと、この実験室だけ成立済みの体験編成に切り替わります。':'数字0〜9の武器核を頂点に交換します。武器の数字に合うよう下の配置を組むと出発できます。';
 $('weapon-picker').querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>{
  const digit=Number(b.dataset.weapon);
  if(mode==='lab'){lab=laboratory(labKind,p.depth,digit);$('lab-rarity').value='';}
  else{const choices=p.inventory.filter(it=>it.type==='emitter'&&it.digit===digit&&(!used.has(it.id)||it.id===p.board[0][0]));choices.sort((a,b)=>(itemValues(b).mods.damage||0)-(itemValues(a).mods.damage||0));if(!choices.length){toast('この武器核は下段に装着中です。先に外してください。',true);return;}p.board[0][0]=choices[0].id;persist();}
  selection=[0,0];renderBoard();
 });
}
function drawLinks(){
 const el=$('board'),svg=el.querySelector('svg');if(!svg||tab!=='build')return;
 const base=el.getBoundingClientRect(),p=profile(),rect=(r,c)=>el.querySelector(`[data-r="${r}"][data-c="${c}"]`)?.getBoundingClientRect();
 const valid=validateBoard(p.board,p.inventory).valid,traces=valid?compileBoard(p.board,p.inventory).traces:[];let lines='';
 for(let r=0;r<p.depth-1;r++)for(let c=0;c<=r;c++){
  const a=rect(r,c);
  for(const col of[c,c+1]){
   const b=rect(r+1,col),child=currentItem(r+1,col),amp=child?.type==='amplifier',selected=amp&&selection[0]===r+1&&selection[1]===col;
   if(a&&b){const x1=a.x+a.width/2-base.x,y1=a.y+a.height-base.y,x2=b.x+b.width/2-base.x,y2=b.y-base.y;
    lines+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${amp?'#f6d47b':'#3c6566'}" stroke-width="${amp?2.6:1.3}"/>`;
    if(selected){const trace=traces.find(t=>t.row===r+1&&t.col===col),factor=trace?.ampFactor??(1+itemValues(child).ampGain);lines+=`<text x="${(x1+x2)/2}" y="${(y1+y2)/2+3}" fill="#ffe2a0" font-size="9" text-anchor="middle" paint-order="stroke" stroke="#101c24" stroke-width="3">×${num(factor,3)}</text>`;}
   }
  }
 }
 svg.innerHTML=lines;
}
function renderSelected(){
 const p=profile(),[r,c]=selection,item=currentItem(),def=itemDefinition(item);
 const valid=validateBoard(p.board,p.inventory).valid,trace=valid?compileBoard(p.board,p.inventory).traces.find(t=>t.row===r&&t.col===c):null;
 let explanation='';
 if(item){
  explanation=itemNumbers(item,trace);
  if(trace?.multiplier>1)explanation+=`<p class="amplification-note">直下からの増幅：×${num(trace.multiplier,4)}。このコア自身の数値だけに適用。</p>`;
  if(def.amplify){const targets=trace?.targets??(r>0?[[r-1,c-1],[r-1,c]].filter(([rr,cc])=>cc>=0&&cc<=rr):[]);explanation+=`<p class="amplification-note">強化対象：${targets.map(([rr,cc])=>{const t=currentItem(rr,cc);return `${rr+1}段目${cc+1}番${t?' '+itemDefinition(t).name:''}`;}).join(' / ')||'なし'}。黄色の接続先へ1回ずつ適用。</p><p class="note">継承済みの値・数字・発動条件は変更しません。増幅コアを強化する場合は「×1.20」の＋0.20部分を強化します。</p>`;}
 }
 $('selected').innerHTML=`<div class="ability-title" style="margin-top:12px"><div class="ability-icon" style="--core-color:${def?.color||'#91a8b9'}">${item?.digit??'＋'}</div><div><h2>${def?.name||'空きスロット'}</h2><small>${r+1}段目・${c+1}番</small></div></div><div class="detail-meta"><span class="tag mint">頂点に ×${paths(r,c)}経路</span>${item?rarityTag(item)+`<span class="tag">${def.family}</span>`:''}</div><p class="note">${def?.desc||'数字と能力の両方を考えてコアを選んでください。'}${item?' 基準値の説明です。実数値は下表。':''}</p>${explanation}${item?.legacyQuality?`<p class="note">旧セーブ補正 ×${num(item.legacyQuality,3)}（旧品質補正を引継ぎ・基準能力はv0.3）</p>`:''}`;
 $('remove-core').disabled=!item;renderCandidates();
}
function renderCandidates(){
 const p=profile(),[r,c]=selection,q=$('search').value.trim().toLowerCase(),fit=$('fit-only').checked,rarityFilter=$('rarity-filter').value,used=new Set(p.board.flat());let items=p.inventory.filter(it=>!used.has(it.id)||it.id===p.board[r][c]);
 const left=currentItem(r+1,c),right=currentItem(r+1,c+1);let required=left&&right?(left.digit+right.digit)%10:null;
 items=items.filter(it=>{const def=itemDefinition(it);if(rarityFilter&&(it.rarity??'common')!==rarityFilter)return false;if(q&&!(`${it.digit} ${def.name} ${def.family} ${rarityOf(it).name}`.toLowerCase().includes(q)))return false;if(!fit)return true;if(r===0&&it.type!=='emitter')return false;if(required!==null&&it.digit!==required)return false;return !p.board[r].some((id,col)=>col!==c&&p.inventory.find(x=>x.id===id)?.digit===it.digit);});
 $('candidates').innerHTML=items.slice(0,160).map(it=>{const def=itemDefinition(it);return `<button class="candidate" data-item="${esc(it.id)}" style="--core-color:${def.color}"><span class="number">${it.digit}</span><span class="copy"><b>${def.name}</b><small style="color:${rarityOf(it).color}">${rarityOf(it).name} ${p.board[r][c]===it.id?'· 装着中':''}</small><small>${itemSummary(it)}</small></span><span style="color:${def.color}">${def.glyph}</span></button>`;}).join('')||'<p class="note">該当する未装着コアがありません。絞り込みを解除するか、探索で新しいコアを集めましょう。</p>';
 $('candidates').querySelectorAll('button').forEach(b=>b.onclick=()=>{p.board[r][c]=b.dataset.item;if(mode==='normal')persist();renderBoard();});
}
function renderInventory(){
 const p=profile();$('pending-return').classList.toggle('hidden',!p.pendingReturn);
 renderCamp(profile(),{mode,onChange:()=>{if(mode==='normal')persist();renderInventory();renderBoard();},onError:message=>toast(message,true)});
}
function retryPendingReturn(){
 const p=profile(),pending=p.pendingReturn;if(!pending)return;
 try{bankRun(p,pending.loot,pending.gold,pending.floor,pending.cargo);delete p.pendingReturn;if(mode==='normal')persist();renderInventory();toast('一時保管していた帰還品を確保しました。');}catch(error){toast(`まだ確保できません：${error.message}。復旧用の書き出しには戦利品も含まれます。`,true);}
}
function exportRecovery(){
 const data=profile(),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='core-descent-recovery-v08.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function startLabField(floor){
 labStartFloor=floor;labKind='storm';lab=laboratory(labKind,9,Number($('home-weapon').value));mode='lab';selection=[0,0];$('lab-rarity').value='';renderBoard();launchGame();
}
function useSupply(id){
 if(!engine||engine.status!=='playing'||paused||engine.isBoss)return;
 const p=profile();if(!(p.consumables?.[id]>0)){toast('拠点の道具屋や工房で準備できます。',true);return;}
 if(!engine.canUseConsumable(id)){toast(id==='healing_draught'?'HPが十分か、道具の再使用待ちです。':'結界が有効か、道具の再使用待ちです。');return;}
 try{const effect=consumeItem(p,id);engine.useConsumable(effect);if(mode==='normal')persist();updateHud();toast(`${CONSUMABLE_BY_ID[id].name}を使いました。`);}catch(error){toast(error.message,true);}
}
function renderCatalog(){
 $('core-count-heading').textContent=`${CORE_DEFS.length}種類のコアを、全10種の武器へ。`;
 $('rarity-guide').innerHTML=RARITIES.map(r=>`<div><b style="color:${r.color}">${r.name}</b><span>基準 ×${r.factor}</span><small>能力ごとに95〜105%</small></div>`).join('');
 $('catalog-grid').innerHTML=CORE_DEFS.map(d=>`<div class="panel catalog-card"><div class="ability-title"><div class="ability-icon" style="--core-color:${d.color}">${d.glyph}</div><div><span class="label" style="color:${d.color};font-size:9px">${d.family}</span><h3>${d.name}</h3></div></div><p>${d.desc}</p><code>${d.amplify?'コモン基準：接続先 ×1.10':Object.entries(d.mods).map(([k,v])=>valueText(k,v)).join(' / ')}</code><small>個体値は能力ごとに独立。固定の条件時間・数字は変化なし。</small>${d.exclusiveEnemyId?`<span class="source-note">入手先：${esc(MONSTERS[d.exclusiveEnemyId]?.name)}の限定ドロップ</span>`:''}</div>`).join('');
}
function launchGame(challenge=null){
 const p=profile();if(p.pendingReturn){toast('一時保管中の帰還品があります。「持ち物」で保存を再試行するか、復旧用データを書き出してください。',true);changeTab('inventory');return;}let spec;try{spec=combatSpec(p);}catch(e){toast(e.message,true);changeTab('build');return;}
 if(engine?.status==='playing')return;
 challengeContext=challenge?{id:`local-${Date.now()}-${Math.random().toString(36).slice(2)}`,mode:challenge,source:mode,depth:p.depth,loadout:captureLoadout(p),equipment:captureEquipment(p),supplies:{...p.consumables}}:null;
 finishHandled=false;
 const options={onEvent:handleEvent,runId:`run-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,cargoCapacity:{cores:Math.max(0,20000-p.inventory.length),equipment:Math.max(0,MAX_EQUIPMENT-p.equipment.length)},startFloor:mode==='lab'&&!challenge?labStartFloor:1,...(challenge?{seed:CHALLENGE_SEED}:{})};
 engine=challenge==='boss'?new BossTrial(spec,options):new GameEngine(spec,options);
 paused=false;accumulator=0;keys.clear();stick={x:0,y:0,active:false};
 p.runActive=true;if(mode==='normal')persist();$('game-overlay').classList.add('hidden');$('pause').textContent='一時停止';
 $('game-mode').textContent=(mode==='normal'?'所持コア':'実験室')+' / '+(challenge==='boss'?'無限ボス180秒':challenge==='depth'?'固定シード階層チャレンジ':'ランダム探索');
 $('game-title').textContent=challenge==='boss'?'一発を磨く。記録を超える。':'生き残って、持ち帰る。';
 $('game-description').textContent=challenge==='boss'?'HP無限のボスへ180秒で与えた総ダメージ。移動で衝撃波の切れ目へ。残り60秒は瀕死判定。':'狙いと攻撃は自動。予告を避け、拾った戦利品は緑で帰還して確保。金の階段は次の階層へ。';
 $('game-footnote').textContent=challenge==='boss'?'レベル1固定・装備差を維持・消耗品使用不可・戦利品なし。死亡時はその時点までを記録。自己記録の試作であり、オンライン順位ではありません。':'20秒生存＋規定数撃破で攻略。5階ごとに固有ボスの討伐も必要。回復薬Q・結界E。戦利品は帰還時だけ確保。';
 $('abandon').textContent=challenge==='boss'?'挑戦を終了':'探索放棄';changeTab('game');updateHud();
}
function handleEvent(e){
 if(e.type==='loot')toast(`回収：${e.core.digit} ${itemDefinition(e.core).name} / ${rarityOf(e.core).name}（帰還で確定）`);
 if(e.type==='pickup'&&e.drop&&e.drop.kind!=='core'&&e.drop.kind!=='gold')toast(`回収：${pickupText(e.drop)}（帰還で確定）`);
 if(e.type==='cargo-full')toast(`${e.kind==='core'?'コア':'装備'}の所持上限です。この種類はこれ以上回収できません。`,true);
 if(e.type==='floor-boss-defeated')toast('フィールドボスを討伐。固有の戦利品を回収しましょう。');
 if(e.type==='gates')toast(`第${engine.floor}階攻略。緑の帰還陣か、金の階段へ。`);
 if(e.type==='floor'&&e.floor>1)toast(`第${e.floor}層へ進入。HPと未確保の戦利品を引き継ぎました。`);
 if(['returned','dead','trial-complete','invalid-score'].includes(e.type))finishRun(e.type==='returned');
}
function finishRun(returned,abandoned=false){
 if(finishHandled||!engine)return;finishHandled=true;
 const p=profile();let bankError='';if(returned){try{bankRun(p,engine.loot,engine.gold,engine.floor,engine.cargo);}catch(error){bankError=error.message;p.pendingReturn=structuredClone({loot:engine.loot,cargo:engine.cargo,gold:engine.gold,floor:engine.floor});loseRun(p);returned=false;}}else loseRun(p);if(mode==='normal')persist();
 let recordNote='通常探索はチャレンジ順位には含めません。';
 if(challengeContext){try{const record=makeRecord(engine,challengeContext);localRecords=addRecord(localRecords,record);recordNote='この端末の自己記録へ追加しました（オンライン未検証）。';try{localStorage.setItem('core-descent-records-v9',JSON.stringify(localRecords));}catch{recordNote='自己記録へ追加。自動保存不可のため、記録を書き出してください。';}}catch{recordNote='数値が有効範囲外のため、この挑戦は記録しません。';}}
 const boss=!!engine.isBoss,title=bankError?'帰還品を一時保管':boss?(engine.status==='complete'?'180秒の挑戦終了':engine.status==='invalid'?'スコア範囲エラー':'挑戦終了'):returned?'帰還成功':abandoned?'探索終了':'冒険者が倒れた';
 const msg=bankError?`保存を完了できませんでした：${bankError}。戦利品を一時保管しています。「持ち物」から再試行・復旧用の書き出しができます。`:boss?'コア・所持資産は失いません。戦利品のない記録用ステージです。':returned?(mode==='lab'?'実験終了。通常資産には加算されません。':'コア・お金・素材・装備・道具を拠点へ確保しました。'):'今回の未確保品を失います。出発前のコア・装備・素材と攻略記録は残ります。使用した道具は消費されています。';
 const cells=boss?[[num(engine.totalDamage,3),'総ダメージ'],[num(engine.totalDamage/BOSS_SECONDS,1),'180秒換算DPS'],[num(engine.totalTime,1),'生存秒数']]:[[engine.clearedFloor,'攻略済み階層'],[engine.floor,'到達階層'],[returned?engine.loot.length:0,'確保したコア']];
 const cargo=cargoCounts(engine.cargo);
 const cargoSummary=!boss?`<div class="result-cargo">${bankError?'一時保管している帰還品':returned?'持ち帰った品':'今回の未確保品'}：コア ${engine.loot.length} · 素材 ${cargo.materials} · 装備 ${cargo.equipment} · 道具 ${cargo.consumables}<br>${num(engine.gold,0)} G${bankError?'（一時保管中）':returned?'':'（確保できませんでした）'}</div>`:'';
 const sourceText=Object.entries(engine.damageBySource).map(([k,v])=>`${({direct:'直撃',blast:'爆発',chain:'放電',poison:'腐食'})[k]} ${num(v,0)}`).join(' / ');
 $('game-overlay').innerHTML=`<div class="result-card"><div class="label">PERSONAL RECORD / LOCAL</div><h2>${title}</h2><p>${msg}</p><div class="result-stats">${cells.map(([v,label])=>`<div><b>${v}</b><small>${label}</small></div>`).join('')}</div><p class="note">${boss?sourceText:`${engine.totalKills}体撃破 / ${num(engine.totalTime,1)}秒生存`}</p>${cargoSummary}<p class="note">${recordNote}</p><div class="row"><button class="primary" id="back-home">コア基盤へ戻る</button><button id="view-records">自己記録を見る</button>${returned||bankError?'<button id="view-loot">持ち物を確認</button>':''}</div></div>`;
 $('game-overlay').classList.remove('hidden');$('back-home').onclick=()=>{engine=null;changeTab('build');};$('view-records').onclick=()=>{engine=null;changeTab('rankings');};if($('view-loot'))$('view-loot').onclick=()=>{engine=null;changeTab('inventory');};
}
function updateHud(){
 if(!engine)return;const e=engine;
 $('hud-floor').textContent=e.isBoss?`BOSS / 残り ${Math.max(0,Math.ceil(BOSS_SECONDS-e.totalTime))}秒`:`FLOOR ${String(e.floor).padStart(2,'0')}`;
 $('hud-biome').textContent=e.isBoss?'記録の聖域':biomeForFloor(e.floor).name+(e.floor%5===0?' · ボス階':'');
 $('hud-weapon').textContent=`${weaponLabel(e.spec.weapon.digit)} · 射程${num(e.spec.range/32,1)}マス`;$('hud-weapon').title=e.spec.weapon.name;updateAttackHud();$('hud-level').textContent=e.isBoss?'Lv.1 固定':`Lv.${e.level}`;$('hp-bar').style.width=`${Math.max(0,e.player.hp/e.spec.maxHp*100)}%`;$('hud-hp').textContent=`HP ${num(e.player.hp,0)} / ${num(e.spec.maxHp,0)}`;
 $('hud-gates').textContent=e.isBoss?(e.totalTime>=120?'瀕死判定ON：追い撃ち有効':'通常判定：120秒から追い撃ち有効'):e.gates?`第${e.clearedFloor}階攻略 / 緑＝帰還、金＝次層`:`開通まで ${Math.max(0,Math.ceil(e.goalTime-e.floorTime))}秒・撃破 ${Math.min(e.floorKills,e.goalKills)}/${e.goalKills}${e.floorBoss&&!e.bossDefeated?' · ボス未討伐':''}`;
 const cargo=cargoCounts(e.cargo);$('hud-cargo').textContent=e.isBoss?'道具は使用不可':`素材 ${cargo.materials} · 装備 ${cargo.equipment} · 道具 ${cargo.consumables}`;
 for(const [id,button,count] of [['healing_draught','use-heal','heal-count'],['ward_scroll','use-ward','ward-count']]){$(count).textContent=profile().consumables?.[id]??0;$(button).disabled=e.isBoss||e.status!=='playing'||paused||!(profile().consumables?.[id]>0)||!e.canUseConsumable(id);}
 $('hud-loot').textContent=e.isBoss?`総ダメージ ${num(e.totalDamage,0)}`:`未確保コア ${e.loot.length}`;
 $('hud-gold').textContent=e.isBoss?`平均 ${num(e.totalDamage/Math.max(.001,e.totalTime),1)} DPS`:`未確保 ${num(e.gold,0)} G`;
 $('hud-kills').textContent=e.isBoss?'ボスHP ∞ / 装備の数値はそのまま':`累計 ${e.totalKills}体撃破`;
}
function updateAttackHud(){
 if(!engine)return;const state=engine.weaponAttackState(),weapon=engine.spec.weapon,heavy=weapon.stationarySeconds>0;
 const casting=weapon.id==='staff';
 const label=({mobile:weapon.id==='spellbook'?'移動しながら詠唱':'移動しながら攻撃',moving:casting?'止まると詠唱':'止まると攻撃',preparing:casting?'詠唱中':'構え中',cooldown:'次の攻撃まで',ready:casting?'詠唱準備OK':'攻撃準備OK'})[state.mode];
 if($('stance-text').textContent!==label)$('stance-text').textContent=label;
 if($('hud-stance').dataset.mode!==state.mode)$('hud-stance').dataset.mode=state.mode;
 $('hud-stance').title=weaponCondition(weapon);$('stance-meter').classList.toggle('hidden',!heavy);
 if(heavy)$('stance-fill').style.width=`${Math.max(0,Math.min(1,state.progress))*100}%`;
}
function recordWeaponName(record){const digit=record.loadout?.[0]?.[0]?.digit;return Number.isInteger(digit)&&digit>=0&&digit<=9?weaponForDigit(digit).name:'武器不明';}
function renderRankings(){
 const p=profile(),source=mode,valid=validateBoard(p.board,p.inventory).valid;
 $('ranking-loadout').textContent=`${source==='normal'?'通常の所持品':'ビルド実験室（別記録）'} / ${p.depth}段・${p.depth*(p.depth+1)/2}枠 / ${valid?'接続成立':'未成立：基盤を確認してください'}`;
 $('start-depth').disabled=!valid;$('start-boss').disabled=!valid;
 for(const kind of ['depth','boss']){
  const records=rankedRecords(localRecords,{mode:kind,source});const best=records[0];
  $('best-'+kind).textContent=best?(kind==='depth'?`${best.clearedFloor} 階`:num(best.damage,3)):'未挑戦';
  $('records-'+kind).innerHTML=records.length?records.slice(0,10).map(r=>`<tr><td>${r.rank}</td><td><b>${kind==='depth'?r.clearedFloor+' 階':num(r.damage,3)}</b><small>${kind==='depth'?'攻略まで '+num(r.clearSeconds,2)+'秒':'180秒換算 '+num(r.damage/BOSS_SECONDS,1)+' DPS'}</small></td><td>${r.depth}段 · ${esc(recordWeaponName(r))}<small>${({returned:'帰還',dead:'死亡',abandoned:'途中終了',complete:'完走'})[r.outcome]}</small></td><td>${esc(String(r.createdAt).slice(0,16).replace('T',' '))}<small>UTC / ローカル未検証</small></td></tr>`).join(''):'<tr><td colspan="4" class="empty-record">まだ記録はありません。上のボタンから挑戦してください。</td></tr>';
 }
}
const canvas=$('game-canvas');
const renderer=new DungeonRenderer(canvas),homeRenderer=new DungeonRenderer($('home-scene'));
let viewWidth=800,viewHeight=600;const keys=new Set();let stick={x:0,y:0,active:false},hudTimer=0;
let visualSettings={quality:'auto',reduced:matchMedia('(prefers-reduced-motion: reduce)').matches};
try{const v=JSON.parse(localStorage.getItem('core-descent-visual-v1')||'null');if(v&&['auto','high','low'].includes(v.quality)){visualSettings.quality=v.quality;if(typeof v.reduced==='boolean')visualSettings.reduced=v.reduced;}}catch{}
const displayProfile=laboratory('storm',9,8);
const displayEngine=new GameEngine(compileBoard(displayProfile.board,displayProfile.inventory),{seed:20261119});
for(let i=0;i<150;i++)displayEngine.tick(1/60,{x:0,y:0});
let homePaint=0,homeFixed=0;
function drawGame(){
 if(!engine)return;const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
 viewWidth=rect.width;viewHeight=rect.height;
 renderer.render(engine,{width:viewWidth,height:viewHeight,dpr:Math.min(devicePixelRatio||1,visualSettings.quality==='low'?1:2),paused,stick,quality:visualSettings.quality,reduced:visualSettings.reduced});
}
function drawHome(dt){
 const reduced=visualSettings.reduced;
 if(!reduced){
  homeFixed+=dt;
  while(homeFixed>=1/60){
   displayEngine.player.hp=displayEngine.spec.maxHp;
   displayEngine.tick(1/60,{x:Math.cos(displayEngine.totalTime*.7)*.15,y:Math.sin(displayEngine.totalTime*.7)*.15});
   homeFixed-=1/60;
  }
 }
 homePaint+=dt;if(homePaint<1/30)return;homePaint=0;
 const rect=$('home-scene').getBoundingClientRect();if(!rect.width||!rect.height)return;
 homeRenderer.render(displayEngine,{width:rect.width,height:rect.height,dpr:Math.min(devicePixelRatio||1,1.5),quality:visualSettings.quality,reduced,showcase:true});
}
function animate(ts){
 const dt=Math.min(.1,(ts-(lastFrame||ts))/1000);lastFrame=ts;
 if(!document.hidden){
  if(tab==='game'&&engine){
   if(!paused&&engine.status==='playing'){
    accumulator+=dt;
    const x=(keys.has('d')||keys.has('ArrowRight')?1:0)-(keys.has('a')||keys.has('ArrowLeft')?1:0)+stick.x;
    const y=(keys.has('s')||keys.has('ArrowDown')?1:0)-(keys.has('w')||keys.has('ArrowUp')?1:0)+stick.y;
    const input=renderer.screenInput(x,y);
    while(accumulator>=1/60){engine.tick(1/60,input);accumulator-=1/60;}
   }
   drawGame();updateAttackHud();hudTimer+=dt;if(hudTimer>.15){updateHud();hudTimer=0;}
  }else if(tab==='home'){drawHome(dt);}
 }
 requestAnimationFrame(animate);
}
function togglePause(){if(engine?.status!=='playing')return;paused=!paused;accumulator=0;cancelInput();document.body.classList.toggle('is-paused',paused);$('pause').textContent=paused?'再開':'一時停止';}
window.addEventListener('keydown',e=>{if(tab!=='game')return;const k=e.key.length===1?e.key.toLowerCase():e.key;if((k==='q'||k==='e')&&!e.repeat){e.preventDefault();useSupply(k==='q'?'healing_draught':'ward_scroll');return;}if(['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Escape'].includes(k)){e.preventDefault();if((k===' '||k==='Escape')&&!e.repeat)togglePause();else keys.add(k);}});window.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));
function cancelInput(){keys.clear();stick={x:0,y:0,active:false};}
window.addEventListener('blur',()=>{cancelInput();if(engine?.status==='playing'){paused=true;accumulator=0;document.body.classList.add('is-paused');$('pause').textContent='再開';}});document.addEventListener('visibilitychange',()=>{if(document.hidden&&engine?.status==='playing'){cancelInput();paused=true;accumulator=0;document.body.classList.add('is-paused');$('pause').textContent='再開';}});
canvas.addEventListener('pointerdown',e=>{if(engine?.status!=='playing'||paused)return;canvas.setPointerCapture(e.pointerId);const r=canvas.getBoundingClientRect();stick={x:0,y:0,active:true,ox:e.clientX-r.x,oy:e.clientY-r.y,id:e.pointerId};});canvas.addEventListener('pointermove',e=>{if(!stick.active||e.pointerId!==stick.id)return;const r=canvas.getBoundingClientRect();const dx=e.clientX-r.x-stick.ox,dy=e.clientY-r.y-stick.oy,l=Math.max(38,Math.hypot(dx,dy));stick.x=dx/l;stick.y=dy/l;});for(const evt of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(evt,cancelInput);
let auction;function resetMarket(){auction=new AuctionBook();auction.account('you',5000);auction.account('npc',0);auction.account('other',5000);[...CORE_DEFS.slice(1,9),CORE_BY_ID.amplifier].forEach((d,i)=>{const rng=makeRng(100+i),rolls=Object.fromEntries(rollKeys(d.id).map(k=>[k,9500+Math.floor(rng()*1001)]));const it=makeItem(`offer-${i}`,i,d.id,{rarity:RARITIES[i%5].id,rolls});auction.put(it,'npc');auction.list('npc',it.id,{start:80+i*25,buyout:180+i*65,duration:600000});});auction.put(makeItem('your-sample',4,'blast'),'you');renderMarket();}
function renderMarket(){if(!auction)return;$('market-wallet').textContent=`テスト残高 ${num(auction.wallets.get('you'),0)} G`;$('market-owned').textContent=`テスト所持品 ${[...auction.items.values()].filter(x=>x.owner==='you').length}個`;$('market-grid').innerHTML=[...auction.listings.values()].map(l=>{const item=auction.items.get(l.itemId),d=CORE_BY_ID[item.type],active=l.state==='active'&&Date.now()<l.end;return `<div class="panel market-card"><div class="ability-title"><div class="ability-icon" style="--core-color:${d.color}">${item.digit}</div><div><h3>${d.name}</h3><small>${l.seller==='you'?'あなたの出品':'NPCサンプル'} · ${active?'出品中':l.state==='sold'?'売約済み':'終了'}</small></div></div><div class="detail-meta">${rarityTag(item)}</div><p class="note">${itemSummary(item)}</p><div class="price">${num(l.buyout,0)} <small>G / 即決</small></div><p class="note">${l.bid?`最高入札 ${l.bid.amount} G（${l.bid.buyer==='you'?'あなた':'他者'}）`:`開始価格 ${l.start} G`} / 残り ${Math.max(0,Math.ceil((l.end-Date.now())/60000))}分</p><div class="row" style="margin-top:12px"><button class="tiny" data-bid="${l.id}" ${!active||l.seller==='you'?'disabled':''}>入札</button><button class="primary tiny" data-buy="${l.id}" ${!active||l.seller==='you'?'disabled':''}>即決購入</button></div></div>`;}).join('');
 $('market-grid').querySelectorAll('[data-buy]').forEach(b=>b.onclick=()=>{try{auction.buy(b.dataset.buy,'you',`ui-${b.dataset.buy}`);toast('テスト購入成立。所有権と通貨を移転しました。');renderMarket();}catch(e){toast(e.message,true);}});
 $('market-grid').querySelectorAll('[data-bid]').forEach(b=>b.onclick=()=>{const l=auction.listings.get(b.dataset.bid);const value=prompt('入札額（仮通貨G）',String(l.bid?l.bid.amount+10:l.start));if(value===null)return;try{auction.bid(l.id,'you',Number(value));toast('入札額を仮押さえしました。');renderMarket();}catch(e){toast(e.message,true);}});
}
$('use-heal').onclick=()=>useSupply('healing_draught');$('use-ward').onclick=()=>useSupply('ward_scroll');
$('retry-return').onclick=retryPendingReturn;$('export-recovery').onclick=exportRecovery;
$('inventory-normal').onclick=()=>{mode='normal';selection=[0,0];renderInventory();};$('inventory-lab').onclick=()=>{mode='lab';selection=[0,0];renderInventory();};$('inventory-build').onclick=()=>changeTab('build');$('inventory-guide').onclick=()=>changeTab('catalog');
$('start-depth').onclick=()=>launchGame('depth');$('start-boss').onclick=()=>launchGame('boss');
$('ranking-build').onclick=()=>changeTab('build');
$('export-records').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({localOnly:true,verified:false,rules:SCORE_RULES,challenge:CHALLENGE_ID,records:localRecords},null,2)],{type:'application/json'}));a.download='core-descent-local-records-v08.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>changeTab(b.dataset.tab));$('mode-normal').onclick=()=>{mode='normal';selection=[0,0];renderBoard();};$('mode-lab').onclick=()=>{mode='lab';selection=[0,0];renderBoard();};
$('lab-rarity').onchange=()=>{if(mode!=='lab')return;const rarity=$('lab-rarity').value;if(!rarity)return;const used=new Set(lab.board.flat());lab.inventory=lab.inventory.map(it=>used.has(it.id)?makeItem(it.id,it.digit,it.type,{rarity}):it);renderBoard();toast('実験室だけを変更しました。全装着コアを個体値100%で比較します。');};
 $('depth').onchange=()=>{const p=profile(),n=+$('depth').value;const board=blankBoard(n);for(let r=0;r<Math.min(n,p.depth);r++)board[r]=[...p.board[r]];p.depth=n;p.board=board;selection=[0,0];if(mode==='normal')persist();renderBoard();};
$('clear-board').onclick=()=>{if(!confirm('装着コアを全て外します。コア自体は失いません。続けますか？'))return;profile().board=blankBoard(profile().depth);if(mode==='normal')persist();renderBoard();};$('remove-core').onclick=()=>{profile().board[selection[0]][selection[1]]=null;if(mode==='normal')persist();renderBoard();};
$('search').oninput=renderCandidates;$('rarity-filter').onchange=renderCandidates;$('fit-only').onchange=renderCandidates;$('launch').onclick=()=>launchGame();
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{labKind=b.dataset.preset;lab=laboratory(labKind,labKind==='amplify'?9:lab.depth,currentItem(0,0)?.digit??0);$('lab-rarity').value='';mode='lab';selection=b.dataset.preset==='amplify'?[8,4]:[0,0];$('search').value='';$('rarity-filter').value='';renderBoard();});
$('save-preset').onclick=()=>{const p=profile();if(!validateBoard(p.board,p.inventory).valid){toast('成立している編成を保存してください。',true);return;}const name=prompt('編成名',`編成 ${p.presets.length+1}`);if(!name?.trim())return;p.presets.push({name:name.trim().slice(0,40),board:structuredClone(p.board)});if(mode==='normal')persist();renderBoard();};
$('pause').onclick=togglePause;$('abandon').onclick=()=>{if(engine?.status!=='playing')return;if(!confirm(engine.isBoss?'ここまでのダメージで挑戦を終了しますか？':'未確保の戦利品を失って探索を終了しますか？'))return;engine.status='abandoned';finishRun(false,true);};
$('export-save').onclick=()=>{const blob=new Blob([JSON.stringify(normal,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='core-descent-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};$('import-save').onclick=()=>$('import-file').click();$('import-file').onchange=async()=>{const file=$('import-file').files[0];if(!file)return;try{if(file.size>5e6)throw Error('セーブは5MB以下にしてください');const loaded=checkProfile(JSON.parse(await file.text()));if(!confirm('通常探索のセーブを読み込んだ内容で置き換えますか？'))return;loaded.runActive=false;normal=loaded;mode='normal';persist();renderBoard();toast('セーブを読み込みました。');}catch(e){toast(e.message,true);}finally{$('import-file').value='';}};
$('reset-market').onclick=resetMarket;$('market-list-test').onclick=()=>{try{auction.list('you','your-sample',{start:100,buyout:300,duration:600000});renderMarket();toast('サンプルコアを出品しました。出品中はアイテムをロックします。');}catch(e){toast(e.message,true);}};
setInterval(()=>{if(tab!=='market'||!auction)return;for(const l of auction.listings.values())if(l.state==='active'&&Date.now()>=l.end)auction.settle(l.id);renderMarket();},2000);
$('home-weapon').innerHTML=WEAPONS.map(w=>`<option value="${w.digit}">${w.digit} · ${w.name}</option>`).join('');$('home-weapon').value='0';$('home-weapon').onchange=updateHomeWeapon;updateHomeWeapon();
$('home-field').innerHTML=BIOMES.map((b,i)=>`<option value="${i*5+1}">${b.shortName} · ${i*5+1}〜${i*5+5}階</option>`).join('');
$('rarity-filter').innerHTML='<option value="">すべてのレア度</option>'+RARITIES.map(r=>`<option value="${r.id}">${r.name}</option>`).join('');window.addEventListener('resize',drawLinks);renderBoard();renderCatalog();renderFieldGuide(startLabField);resetMarket();if(saveWarning)toast(saveWarning,true);else $('save-state').textContent='ローカル保存 / 書き出しでバックアップ可能';requestAnimationFrame(animate);
// Explicit local QA hook. Not an authoritative API and not safe for an online economy.
if(new URLSearchParams(location.search).has('qa'))window.CoreDescentDebug={get records(){return localRecords;},get challenge(){return challengeContext;},get engine(){return engine;},get profile(){return profile();},get auction(){return auction;},get mode(){return mode;},compile:()=>combatSpec(profile())};

$('home-start').onclick=()=>{mode='normal';renderBoard();launchGame();};
$('home-lab').onclick=()=>startLabField(Number($('home-field').value)+($('home-field-boss').checked?4:0));
$('home-build').onclick=()=>changeTab('build');
$('home-records').onclick=()=>changeTab('rankings');
$('visual-quality').value=visualSettings.quality;
$('reduced-effects').checked=visualSettings.reduced;
function persistVisual(){visualSettings.quality=$('visual-quality').value;visualSettings.reduced=$('reduced-effects').checked;try{localStorage.setItem('core-descent-visual-v1',JSON.stringify(visualSettings));}catch{}}
$('visual-quality').onchange=persistVisual;$('reduced-effects').onchange=persistVisual;
window.addEventListener('beforeunload',e=>{if(engine?.status==='playing'&&mode==='normal'){e.preventDefault();e.returnValue='';}});
changeTab('home');
