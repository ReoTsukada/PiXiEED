import { outputEntrySearch } from './output-entry-context.mjs?rev=20261111-output-offerwall-1';
export function conversionRecoveryContext(location) {
  const query=new URLSearchParams(outputEntrySearch(location));
  return { path:location.pathname, id:query.get('id')||'', file:query.get('file')||'', mode:query.get('mode')||'' };
}
export function createConversionRecoveryWorkspace({main,text,imports,location,owner,captureSaveState=()=>({sizeDirty:false,fpsDirty:false,mediaDirty:false}),restoreSaveState=()=>{}}) {
  function capture() {
    const native=owner(), entries=imports.snapshotEntries(), selected=text.snapshot().file;
    const captured = {schemaVersion:1,context:conversionRecoveryContext(location),text:text.captureRecovery(),imports:imports.captureRecovery(),
      selectedInputId:entries.find(entry=>entry.file===selected)?.id||null,
      native:{kind:native.kind,data:native.api?.captureRecovery()??null},saveState:captureSaveState()};
    // Every committed snapshot must also be acceptable to the restoring owners.
    text.validateRecovery(captured.text); imports.validateRecovery(captured.imports);
    native.api?.validateRecovery(captured.native.data);
    return captured;
  }
  async function apply(saved) {
    const current=conversionRecoveryContext(location), native=owner();
    if(saved?.schemaVersion!==1||!saved.context||!saved.native||!['none','simple','detailed'].includes(saved.native.kind)|| (saved.selectedInputId!==null&&typeof saved.selectedInputId!=='string'))throw new Error('この作業の復元形式を確認できません。');
    const stagedTransition=saved.native.kind==='detailed'&&native.kind==='detailed'&&!saved.context.id&&Boolean(current.id)&&saved.context.path===current.path&&saved.context.file===current.file;
    if(JSON.stringify(saved.context)!==JSON.stringify(current)&&!stagedTransition)throw new Error('別の出力画面の保存版です。現在の作業には上書きしません。');
    if(saved.native.kind!==native.kind)throw new Error('保存時と異なる変換画面です。元ファイルを保持した保存版は残っています。');
    if(!saved.saveState||['sizeDirty','fpsDirty','mediaDirty'].some(key=>typeof saved.saveState[key]!=='boolean'))throw new Error('未反映の出力設定を確認できません。');
    text.validateRecovery(saved.text);imports.validateRecovery(saved.imports);
    if(saved.selectedInputId&&!saved.imports.entries.some(entry=>entry.id===saved.selectedInputId))throw new Error('選択した元ファイルの保存情報が見つかりません。');
    if(native.api)native.api.validateRecovery(saved.native.data);
    if(imports.snapshotEntries().length)throw new Error('現在の素材一覧は残したまま、自動復元を止めました。');
    const before=capture(), oldInert=main.inert;main.inert=true;
    try{
      const restored=stagedTransition?{skipped:true,warning:'文章と素材一覧を復元しました。詳細素材は、読み込み完了済みの端末保存を優先しました。未確定の処理を確認してください。'}:await native.api?.restoreRecovery(saved.native.data,{replaceInitial:true});
      if(restored===false)throw new Error('変換素材を復元できませんでした。');
      if(!text.restoreRecovery(saved.text,{replaceInitial:true}))throw new Error('文章を復元できませんでした。');
      restoreSaveState(restored?.skipped?{sizeDirty:false,fpsDirty:false,mediaDirty:false}:saved.saveState);
      if(!imports.restoreRecovery(saved.imports,{beforeCommit(entries){
        if(saved.selectedInputId){const file=entries.find(entry=>entry.id===saved.selectedInputId)?.file;if(file&&!text.selectFile(file,{deferPreview:true}))throw new Error('選択中の元ファイルを復元できませんでした。');}
      }}))throw new Error('素材一覧を復元できませんでした。');
      const uncertain=imports.snapshotEntries().filter(entry=>entry.status==='cancelled').length;
      return {warning:restored?.warning||(uncertain?'端末内の文章と素材を復元しました。再読込前の未完了処理は一覧で確認してから再開してください。':'')};
    }catch(error){
      let rollbackFailed=false;
      try{await native.api?.restoreRecovery(before.native.data,{replaceInitial:true});}catch{rollbackFailed=true;}
      try{if(!text.restoreRecovery(before.text,{replaceInitial:true}))rollbackFailed=true;}catch{rollbackFailed=true;}
      restoreSaveState(before.saveState);
      throw new Error(`${error?.message||'復元に失敗しました。'} ${rollbackFailed?'表示の復旧も確認できません。保存版と元ファイルを消さず、追加操作を止めています。':'復元前の画面内容を戻しました。保存版は消していません。'}`);
    }finally{main.inert=oldInert;}
  }
  return {capture,apply};
}
