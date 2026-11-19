/** Local record model. NOT an authenticated online leaderboard. */
export const SCORE_RULES='0.7.0';
export const CHALLENGE_ID='fantasy-worlds-01';
export const CHALLENGE_SEED=20261119;
export const BOSS_SECONDS=180;
export const SCORE_SOURCES=['normal','lab'];
export const SCORE_MODES=['depth','boss'];
export function captureLoadout(profile){
 const byId=new Map(profile.inventory.map(i=>[i.id,i]));
 return profile.board.map(row=>row.map(id=>structuredClone(byId.get(id))));
}
export function captureEquipment(profile){
 const items=new Map((profile.equipment??[]).map(item=>[item.id,item]));
 return Object.fromEntries(Object.entries(profile.equipped??{}).map(([slot,id])=>[slot,id?structuredClone(items.get(id)):null]));
}
export function validateRecord(record){
 if(!record||typeof record!=='object'||typeof record.id!=='string'||record.id.length>100)throw new Error('記録IDが不正です');
 if(record.rules!==SCORE_RULES||record.challenge!==CHALLENGE_ID)throw new Error('別ルールの記録です');
 if(!SCORE_SOURCES.includes(record.source)||!SCORE_MODES.includes(record.mode))throw new Error('種目が不正です');
 if(record.seed!==CHALLENGE_SEED||record.verified!==false)throw new Error('ローカル記録の条件が不正です');
 if(!Number.isInteger(record.depth)||record.depth<3||record.depth>9)throw new Error('段数が不正です');
 for(const k of ['seconds','damage','clearSeconds'])if(!Number.isFinite(record[k])||record[k]<0||record[k]>Number.MAX_SAFE_INTEGER/1000)throw new Error('有限の正しいスコアが必要です');
 if(!Number.isInteger(record.clearedFloor)||record.clearedFloor<0)throw new Error('攻略階層が不正です');
 if(record.mode==='boss'&&record.seconds>BOSS_SECONDS+1e-6)throw new Error('制限時間外の記録です');
 if(!['returned','dead','abandoned','complete'].includes(record.outcome))throw new Error('終了状態が不正です');
 return record;
}
export function makeRecord(engine,context){
 if(engine.status==='playing')throw new Error('終了前の記録は確定できません');
 const record={id:context.id,rules:SCORE_RULES,challenge:CHALLENGE_ID,seed:engine.seed,verified:false,
  mode:context.mode,source:context.source,depth:context.depth,loadout:structuredClone(context.loadout),equipment:structuredClone(context.equipment??{}),supplies:structuredClone(context.supplies??{}),
  clearedFloor:engine.clearedFloor||0,clearSeconds:engine.clearTime||0,seconds:engine.totalTime,
  damage:Math.round(engine.totalDamage*1000)/1000,damageBySource:structuredClone(engine.damageBySource),
  outcome:engine.status,createdAt:context.createdAt||new Date().toISOString()};
 return validateRecord(record);
}
export function compareRecords(a,b){
 if(a.mode!==b.mode)throw new Error('異なる種目は比較しません');
 return a.mode==='depth'?(b.clearedFloor-a.clearedFloor||a.clearSeconds-b.clearSeconds):b.damage-a.damage;
}
export function addRecord(records,record){
 validateRecord(record);
 if(records.some(r=>r.id===record.id))return records; // Idempotent local submission.
 return [...records,structuredClone(record)];
}
export function rankedRecords(records,{mode='depth',source='normal'}={}){
 const rows=records.filter(r=>r.rules===SCORE_RULES&&r.challenge===CHALLENGE_ID&&r.mode===mode&&r.source===source&&(mode==='depth'?r.clearedFloor>0:r.damage>0)).sort(compareRecords);
 let rank=0;return rows.map((r,i)=>{if(!i||compareRecords(rows[i-1],r)!==0)rank=i+1;return{...r,rank};});
}
export function restoreRecords(raw){
 if(!Array.isArray(raw))return [];
 const seen=new Set();return raw.filter(r=>{try{validateRecord(r);if(seen.has(r.id))return false;seen.add(r.id);return true;}catch{return false;}});
}
