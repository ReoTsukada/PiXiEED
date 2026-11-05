import test from 'node:test';import assert from 'node:assert/strict';
import{createConversionRecoveryWorkspace}from'../../js/creation/conversion-recovery-workspace.mjs';
import{createUnifiedImportController}from'../../js/creation/conversion-unified-import.mjs';
import{createConversionRecoveryStore,createMemoryConversionRecoveryAdapter}from'../../js/creation/conversion-recovery-store.mjs';
import{validateTextRecoverySnapshot}from'../../js/creation/conversion-text-draft.mjs';
import{validateConversionRecovery}from'../../js/creation/conversion-media-recovery.mjs';
const options={width:1000,fontSize:28,padding:48,lineHeight:160,font:'sans',foreground:'#213e32',background:'#fffefb',wrap:true};
function workspace(){
 const live={text:'手書き',mode:'input',file:null,imports:0,media:null};const main={inert:false};
 const native={schemaVersion:1,source:null,original:null,activeId:null,undoTicket:null,assetSequence:0,settings:{format:'png',width:1,height:1,quality:90,background:'#ffffff',threshold:128,frame:1,bits:'16',ratio:true,loop:1,rate:1}};
 const text={snapshot:()=>({text:live.text,mode:live.mode,file:live.file}),selectFile:file=>{live.file=file;return true;},captureRecovery:()=>({schemaVersion:1,text:live.text,mode:live.mode,selectedFile:live.file?{blob:live.file.slice(0,live.file.size,live.file.type),name:live.file.name,type:live.file.type,lastModified:live.file.lastModified}:null,options,action:'text',style:'encode',encoding:'utf-8',art:{columns:64,invert:false,characters:'01',attach:false,nativeGrid:false},alternateDraft:null}),validateRecovery:validateTextRecoverySnapshot,restoreRecovery(saved){this.validateRecovery(saved);live.text=saved.text;live.mode=saved.mode;live.file=saved.selectedFile?new File([saved.selectedFile.blob],saved.selectedFile.name,{type:saved.selectedFile.type,lastModified:saved.selectedFile.lastModified}):null;return true;}};
 const media={captureRecovery:()=>native,validateRecovery:saved=>validateConversionRecovery(saved),restoreRecovery(saved){this.validateRecovery(saved);Object.assign(native,structuredClone(saved));return true;}};
 const imports=createUnifiedImportController({snapshot:text.snapshot,isBusy:()=>false,appendTextFiles:async files=>{live.text+='\n'+await files[0].text();return true;},importMedia:async()=>{live.imports++;return true;},selectFile:text.selectFile,activateMedia:()=>{live.mode='media';return true;},activateText:()=>{live.mode='input';return true;},activateCode:()=>{live.mode='output';return true;}});
 const result=createConversionRecoveryWorkspace({main,text,imports,location:{pathname:'/output/work/',search:'?mode=convert'},owner:()=>({kind:'simple',api:media})});return{...result,live,main,imports,native,text,media};
}
test('real Blob storage plus owner/controller restore keeps text, original bytes, order and selected File without re-import',async()=>{
 const first=workspace();await first.imports.request([new File(['png fixture'],'a.png',{type:'image/png'}),new File(['文章素材'],'memo.txt',{type:'text/plain'}),new File([new Uint8Array([0,255,7])],'unknown.bin')]);
 const frame={width:1,height:1,data:new Uint8ClampedArray([12,34,56,255]),assetId:'a',frameId:'a:0',delayMs:123};first.native.source={kind:'image',name:'a.png',totalPlays:1,assets:[{id:'a',name:'a.png',kind:'image',bytes:4,rawFrames:[frame]}],frames:[frame]};first.native.original=first.native.source;first.native.activeId='a';
 const store=createConversionRecoveryStore(createMemoryConversionRecoveryAdapter(),{idFactory:()=> 'r1',now:()=>1});await store.save('same-work',first.capture());
 const second=workspace();second.live.text='';const record=await store.load('same-work');await second.apply(record.snapshot);
 assert.equal(second.live.text,'手書き\n文章素材');assert.equal(second.live.mode,'output');assert.equal(second.live.imports,0,'restore never replays the native import/codec');
 assert.deepEqual(second.imports.snapshotEntries().map(entry=>entry.file.name),['a.png','memo.txt','unknown.bin']);assert.equal(second.live.file,second.imports.snapshotEntries()[2].file);
 assert.deepEqual(new Uint8Array(await second.live.file.arrayBuffer()),new Uint8Array([0,255,7]));assert.deepEqual([...second.native.source.frames[0].data],[12,34,56,255]);assert.equal(second.native.source.frames[0].delayMs,123);assert.equal(second.native.activeId,'a');assert.equal(second.main.inert,false);
});
test('in-flight entries are restored for inspection and never automatically replayed or duplicated',async()=>{
 const first=workspace();await first.imports.request([new File(['a'],'a.txt',{type:'text/plain'})]);const snapshot=first.capture();snapshot.imports.entries[0].status='reading';snapshot.imports.entries[0].applied=false;
 const second=workspace();await second.apply(snapshot);const entry=second.imports.snapshotEntries()[0];assert.equal(entry.status,'cancelled');assert.equal(entry.needsReview,true);assert.equal(second.live.imports,0);assert.equal(await second.imports.retryEntry(entry.id),false);
});
test('foreign context and corrupt later file are rejected before any owner is changed',async()=>{
 const first=workspace();await first.imports.request([new File(['a'],'a.txt',{type:'text/plain'})]);const snapshot=first.capture();const second=workspace();second.live.text='fresh original';
 snapshot.context.id='other-output';await assert.rejects(second.apply(snapshot),/別の出力画面/);assert.equal(second.live.text,'fresh original');
 snapshot.context.id='';snapshot.imports.entries[0].file.blob='broken';await assert.rejects(second.apply(snapshot));assert.equal(second.live.text,'fresh original');assert.equal(second.imports.snapshotEntries().length,0);
});
test('an apply failure rolls native and text owners back and preserves the saved payload',async()=>{
 const first=workspace(),snapshot=first.capture(),second=workspace();second.live.text='keep';const restore=second.text.restoreRecovery.bind(second.text);let failed=false;
 second.text.restoreRecovery=value=>{if(!failed){failed=true;return false;}return restore(value);};await assert.rejects(second.apply(snapshot),/復元前の画面内容を戻しました/);assert.equal(second.live.text,'keep');assert.equal(second.main.inert,false);assert.equal(snapshot.text.text,'手書き');
});


test('a failed final File selection rolls back before committing any restored receipt',async()=>{
  const first=workspace();await first.imports.request([new File(['a'],'data.bin')]);const snapshot=first.capture(),second=workspace();second.live.text='keep';second.text.selectFile=()=>false;
  await assert.rejects(second.apply(snapshot),/選択中の元ファイル/);assert.equal(second.imports.snapshotEntries().length,0);assert.equal(second.live.text,'keep');assert.equal(second.main.inert,false);
});


test('invalid transient dimensions cannot replace a recoverable committed snapshot',async()=>{
  const current=workspace(),store=createConversionRecoveryStore(createMemoryConversionRecoveryAdapter(),{idFactory:(()=>{let n=0;return()=>`v${++n}`;})(),now:()=>1});
  const old=await store.save('same-work',current.capture());current.live.text='new text remains on screen';current.native.settings.width=0;
  assert.throws(()=>current.capture(),/width/);assert.equal((await store.load('same-work')).revision,old.revision);assert.equal((await store.load('same-work')).snapshot.text.text,'手書き');assert.equal(current.live.text,'new text remains on screen');
  current.native.settings.width=1;const textCapture=current.text.captureRecovery;current.text.captureRecovery=()=>({...textCapture(),options:{...options,width:0}});assert.throws(()=>current.capture(),/見た目設定/);assert.equal((await store.load('same-work')).revision,old.revision);
});


test('pending size/FPS save stages are preserved so restored settings cannot save stale output bytes',async()=>{
  const first=workspace(),saved=first.capture();saved.saveState={sizeDirty:true,fpsDirty:true,mediaDirty:true};const second=workspace();let restored;
  const {createConversionRecoveryWorkspace}=await import('../../js/creation/conversion-recovery-workspace.mjs');
  const port=createConversionRecoveryWorkspace({main:second.main,text:second.text,imports:second.imports,location:{pathname:'/output/work/',search:'?mode=convert'},owner:()=>({kind:'simple',api:second.media}),restoreSaveState:value=>{restored=value;}});
  await port.apply(saved);assert.deepEqual(restored,{sizeDirty:true,fpsDirty:true,mediaDirty:true});
});
