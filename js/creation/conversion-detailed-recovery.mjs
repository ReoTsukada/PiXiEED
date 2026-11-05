export function validateDetailedRecovery(snapshot, selectors) {
  if(snapshot?.schemaVersion!==1 || typeof snapshot.recordId!=='string' || !snapshot.settings || !Array.isArray(snapshot.selectedOutputIds) || snapshot.selectedOutputIds.length>1024 || snapshot.selectedOutputIds.some(id=>typeof id!=='string') || typeof snapshot.itemId!=='string' || typeof snapshot.sourceId!=='string' || !['material','output'].includes(snapshot.previewKind)|| !Array.isArray(snapshot.settings.values) || snapshot.settings.values.length>100) throw new Error('詳細出力の復元情報を確認できません。');
  const seen=new Set();
  for(const pair of snapshot.settings.values){
    if(!Array.isArray(pair)||pair.length!==2)throw new Error('詳細出力の設定保存が壊れています。');
    const [selector,value]=pair;
    if(!selectors.includes(selector)||seen.has(selector)|| (value!==null && (typeof value.value!=='string'||value.value.length>20_000||(value.checked!==undefined&&typeof value.checked!=='boolean'))))throw new Error('詳細出力の設定保存が壊れています。');
    seen.add(selector);
  }
  return snapshot;
}
