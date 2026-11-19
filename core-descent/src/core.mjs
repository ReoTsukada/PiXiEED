import {CORE_DEFS, CORE_BY_ID, STAT_KEYS, PUZZLE_9, RARITIES, RARITY_BY_ID, ROLL_MIN, ROLL_MAX} from './catalog.mjs';
export function makeRng(seed=1) { let a=seed>>>0; return ()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;}; }
export function paths(row,col) { let p=1;for(let k=1;k<=col;k++)p=p*(row-k+1)/k;return Math.round(p); }
export function blankBoard(depth) { if(!Number.isInteger(depth)||depth<1||depth>9)throw Error('段数は1〜9');return Array.from({length:depth},(_,r)=>Array(r+1).fill(null)); }
/** A roll is an integer basis-point value, generated once per numeric modifier. */
export function rollKeys(type) {
 if(!Object.hasOwn(CORE_BY_ID,type))throw Error('コア種類が不正');const def=CORE_BY_ID[type];
 return [...Object.keys(def.mods),...(def.amplify?['amp']:[])];
}
export function makeItem(id,digit,type,options=1) {
 if(typeof id!=='string'||!id||id.length>128||!Number.isInteger(digit)||digit<0||digit>9||!Object.hasOwn(CORE_BY_ID,type))throw Error('コア定義が不正');
 // Numeric fourth arguments retain v0.1 call compatibility and exact old strength.
 if(typeof options==='number'){
  if(!Number.isFinite(options)||options<0.5||options>1.5)throw Error('旧品質が不正');
  options=options===1?{}:{legacyQuality:options};
 }
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('コア個体値が不正');
 const rarity=options.rarity??'common', keys=rollKeys(type);
 if(!Object.hasOwn(RARITY_BY_ID,rarity))throw Error('レア度が不正');
 const rolls=options.rolls??Object.fromEntries(keys.map(k=>[k,10000]));
 if(!rolls||typeof rolls!=='object'||Array.isArray(rolls)||Object.keys(rolls).length!==keys.length||keys.some(k=>!Object.hasOwn(rolls,k)||!Number.isInteger(rolls[k])||rolls[k]<ROLL_MIN||rolls[k]>ROLL_MAX))throw Error('個体値は能力ごとに9500〜10500の整数が必要');
 const out={id,digit,type,rarity,rolls:{...rolls}};
 if(options.legacyQuality!==undefined){if(rarity!=='common'||!Number.isFinite(options.legacyQuality)||options.legacyQuality<0.5||options.legacyQuality>1.5)throw Error('旧品質補正が不正');out.legacyQuality=options.legacyQuality;}
 return out;
}
export function normalizeItem(item) {
 if(!item||typeof item!=='object')throw Error('コア個体が不正');
 if(item.rarity===undefined){if(!Number.isFinite(item.quality))throw Error('旧品質がありません');return makeItem(item.id,item.digit,item.type,item.quality);}
 if(!item.rolls)throw Error('個体値がありません');
 return makeItem(item.id,item.digit,item.type,{rarity:item.rarity,rolls:item.rolls,legacyQuality:item.legacyQuality});
}
export function itemValues(item) {
 const it=normalizeItem(item),def=CORE_BY_ID[it.type],f=RARITY_BY_ID[it.rarity].factor,legacy=it.legacyQuality??1;
 const mods=Object.fromEntries(Object.entries(def.mods).map(([k,v])=>[k,v*(v>=0?f:1/f)*(it.rolls[k]/10000)*legacy]));
 return {mods,ampGain:def.amplify?def.amplify.gain*f*it.rolls.amp/10000*legacy:0};
}
export function itemRanges(item) {
 const it=normalizeItem(item),keys=rollKeys(it.type),withRoll=n=>itemValues({...it,rolls:Object.fromEntries(keys.map(k=>[k,n]))});
 const lo=withRoll(ROLL_MIN),hi=withRoll(ROLL_MAX);
 return {mods:Object.fromEntries(Object.keys(lo.mods).map(k=>[k,[Math.min(lo.mods[k],hi.mods[k]),Math.max(lo.mods[k],hi.mods[k])]])),amp:[1+lo.ampGain,1+hi.ampGain]};
}
export function validateBoard(board,inventory,{partial=false}={}) {
 const errors=[];const bad=new Set();const used=new Set();const inv=new Map(inventory.map(c=>[c.id,c]));
 const err=(r,c,text)=>{errors.push(text);bad.add(`${r},${c}`);};
 if(!Array.isArray(board)||board.length<1||board.length>9)return {valid:false,errors:['段数が不正'],bad};
 board.forEach((row,r)=>{
  if(!Array.isArray(row)||row.length!==r+1){err(r,0,'行の形が不正');return;}
  const digits=new Map();
  row.forEach((id,c)=>{
   if(!id){if(!partial)err(r,c,`${r+1}段目に空き枠`);return;}
   const item=inv.get(id);if(!item){err(r,c,'未所持のコア');return;}
   try{normalizeItem(item);}catch{err(r,c,'コアデータが不正');return;}
   if(used.has(id))err(r,c,'同じ現物を二重に装着');used.add(id);
   if(digits.has(item.digit)){err(r,c,`${r+1}段目の数字${item.digit}が重複`);bad.add(`${r},${digits.get(item.digit)}`);}digits.set(item.digit,c);
   if(r===0&&item.type!=='emitter')err(r,c,'頂点には弾丸生成コアが必要');
   if(r+1<board.length){const a=inv.get(board[r+1]?.[c]),b=inv.get(board[r+1]?.[c+1]);if(a&&b&&item.digit!==(a.digit+b.digit)%10)err(r,c,`${r+1}段目: ${a.digit}+${b.digit} の1の位は ${(a.digit+b.digit)%10}`);}
  });
 });return {valid:!errors.length,errors:[...new Set(errors)],bad};
}
/** Bottom-up DAG evaluation. The amplifier signal is LOCAL, not an additive stat. */
export function compileBoard(board,inventory) {
 const check=validateBoard(board,inventory);if(!check.valid)throw Error(check.errors.join(' / '));
 const inv=new Map(inventory.map(c=>[c.id,c])),zero=()=>Object.fromEntries(STAT_KEYS.map(k=>[k,0]));
 const sums=board.map(row=>row.map(zero)),amps=board.map(row=>row.map(()=>0)),traces=[];
 for(let r=board.length-1;r>=0;r--)for(let c=0;c<=r;c++){
  const item=inv.get(board[r][c]),rolled=itemValues(item),sum=sums[r][c];
  const incoming=[amps[r+1]?.[c]||0,amps[r+1]?.[c+1]||0];
  const multiplier=(1+incoming[0])*(1+incoming[1]);
  const own=Object.fromEntries(Object.entries(rolled.mods).map(([k,v])=>[k,v*multiplier]));
  amps[r][c]=rolled.ampGain*multiplier;
  for(const k of STAT_KEYS)sum[k]=(own[k]||0)+(sums[r+1]?.[c]?.[k]||0)+(sums[r+1]?.[c+1]?.[k]||0);
  const targets=[];if(rolled.ampGain&&r>0){if(c>0)targets.push([r-1,c-1]);if(c<r)targets.push([r-1,c]);}
  traces.push({id:item.id,row:r,col:c,paths:paths(r,c),type:item.type,rarity:item.rarity??'common',baseOwn:rolled.mods,own,multiplier,incoming,baseAmp:1+rolled.ampGain,ampFactor:1+amps[r][c],targets,output:{...sum}});
 }
 const v=sums[0][0];
 // Interpret the final additive vector once. Rare penalties improve; amplifier penalties grow.
 return {raw:v,traces,damage:12*Math.max(0.05,1+v.damage),rate:3*Math.max(0.05,1+v.rate),multi:Math.max(0,v.multi),pierce:Math.max(0,v.pierce),bounce:Math.max(0,v.bounce),split:Math.max(0,v.split),blast:Math.max(0,v.blast),chain:Math.max(0,v.chain),poison:Math.max(0,v.poison),slow:Math.max(0,v.slow),homing:Math.max(0,v.homing),crit:Math.min(1,Math.max(0,0.05+v.crit)),critMultiplier:2+Math.max(0,0.05+v.crit-1),drain:Math.max(0,v.drain),maxHp:100+v.hp,regen:v.regen,move:165+v.move,pickup:28+v.pickup,execute:v.execute,longshot:v.longshot,steady:v.steady,recovery:v.recovery};
}
export function makeProfile() {
 const types=['regen','power','haste','pierce','blast','drain','multi','chain','hull','emitter'];
 const inventory=types.map((t,d)=>makeItem(`start-${d}`,d,t));
 return {version:2,wallet:0,best:1,depth:3,inventory,board:[['start-9'],['start-3','start-6'],['start-1','start-2','start-4']],presets:[],runActive:false};
}
export function laboratory(kind='storm',depth=9) {
 const nums=depth===3?[[9],[3,6],[1,2,4]]:PUZZLE_9.slice(0,depth);
 const patterns={storm:['haste','multi','chain','pierce','homing','blast','power'],siege:['overdrive','power','crit','pierce','longshot','steady'],sustain:['drain','haste','recovery','regen','hull','multi','power'],amplify:['power','haste','power','pierce','multi','crit','power']};
 const pattern=patterns[kind]||patterns.storm;let index=0;const inventory=[];
 const board=nums.map((row,r)=>row.map((digit,c)=>{const type=r===0?'emitter':kind==='amplify'&&r===8&&c>=3&&c<=5?'amplifier':pattern[(r*3+c)%pattern.length];const item=makeItem(`lab-${index++}`,digit,type,kind==='amplify'?{rarity:'rare'}:1);inventory.push(item);return item.id;}));
 CORE_DEFS.forEach(def=>{for(let d=0;d<10;d++)for(const rarity of RARITIES)inventory.push(makeItem(`spare-${def.id}-${d}-${rarity.id}`,d,def.id,{rarity:rarity.id}));});
 return {version:2,wallet:0,best:1,depth,inventory,board,presets:[],runActive:false};
}
export function rarityWeights(floor) {
 if(!Number.isSafeInteger(floor)||floor<1)throw Error('階層が不正');
 const t=Math.min(1,Math.log2(floor)/10);
 const shallow=[70,22,6,1.8,0.2],deep=[30,30,25,12,3];
 return shallow.map((n,i)=>n+(deep[i]-n)*t);
}
export function rollItem(rng,floor,id) {
 const weights=rarityWeights(floor);
 const type=rng()<0.10?'emitter':CORE_DEFS[1+Math.floor(rng()*(CORE_DEFS.length-1))].id;
 let draw=rng()*100,ri=0;for(;ri<weights.length-1&&draw>=weights[ri];ri++)draw-=weights[ri];
 const rolls=Object.fromEntries(rollKeys(type).map(k=>[k,ROLL_MIN+Math.floor(rng()*(ROLL_MAX-ROLL_MIN+1))]));
 return makeItem(id,Math.floor(rng()*10),type,{rarity:RARITIES[ri].id,rolls});
}
export function bankRun(profile,loot,gold,floor) {
 if(!Array.isArray(loot)||!Number.isSafeInteger(floor)||floor<1)throw Error('探索結果が不正');loot=loot.map(normalizeItem);
 const known=new Set(profile.inventory.map(x=>x.id));if(loot.some(x=>known.has(x.id))||new Set(loot.map(x=>x.id)).size!==loot.length)throw Error('戦利品IDの重複');
 if(!Number.isSafeInteger(gold)||gold<0||!Number.isSafeInteger(profile.wallet+gold))throw Error('通貨が不正');
 profile.inventory.push(...loot);profile.wallet+=gold;profile.best=Math.max(profile.best,floor);profile.runActive=false;
}
export function loseRun(profile) {profile.runActive=false;}
export function checkProfile(p) {
 if(!p||![1,2].includes(p.version)||!Array.isArray(p.inventory)||p.inventory.length>20000||!Number.isSafeInteger(p.wallet)||p.wallet<0||!Array.isArray(p.presets)||!Number.isInteger(p.depth)||p.depth<3||p.depth>9)throw Error('セーブ形式が不正');
 if(!Number.isSafeInteger(p.best)||p.best<1||p.presets.length>100||typeof p.runActive!=='boolean')throw Error('セーブの進行データが不正');
 const normalized=p.inventory.map(normalizeItem);const ids=new Set();for(const it of normalized){if(ids.has(it.id)||typeof it.id!=='string')throw Error('コアIDが不正');ids.add(it.id);}
 if(!Array.isArray(p.board)||p.board.length!==p.depth||p.board.some((row,r)=>!Array.isArray(row)||row.length!==r+1||row.some(id=>id!==null&&!ids.has(id))))throw Error('基盤データが不正');
 for(const pr of p.presets){if(typeof pr.name!=='string'||pr.name.length>40||!Array.isArray(pr.board)||pr.board.length<3||pr.board.length>9||pr.board.some((row,r)=>!Array.isArray(row)||row.length!==r+1||row.some(id=>id!==null&&!ids.has(id))))throw Error('プリセットデータが不正');}
 p.inventory=normalized;p.version=2;return p;
}
