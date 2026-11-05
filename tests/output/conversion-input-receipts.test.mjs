import test from 'node:test';
import assert from 'node:assert/strict';
import { conversionInputReceipt, activateRetainedConversionInput } from '../../js/creation/conversion-input-receipts.mjs';

test('receipts distinguish appended text, media groups and retained unknown original bytes', () => {
  assert.equal(conversionInputReceipt({kind:'text',status:'ready'}).action,'追記した文章を見る');
  assert.equal(conversionInputReceipt({kind:'media',status:'ready'}).action,'素材群を見る');
  const binary=conversionInputReceipt({kind:'binary',status:'ready',file:{name:'original.pxd'}});
  assert.equal(binary.name,'original.pxd'); assert.match(binary.note,/内容を変えず/); assert.match(binary.action,/コード/);
});
test('failed and cancelled entries stay actionable and never masquerade as imported', () => {
  for(const status of ['error','cancelled']) {const item=conversionInputReceipt({status,error:'codec failed'});assert.equal(item.retry,true);assert.equal(item.action,'');}
  assert.equal(conversionInputReceipt({status:'error',error:'codec failed'}).state,'codec failed');
  for(const status of ['queued','reading'])assert.equal(conversionInputReceipt({status}).retry,false);
});
test('opening a media receipt activates its existing group without importing again', () => {
  const calls=[];const api={snapshot:()=>({composing:false}),setMode:value=>{calls.push(value);return true;}};
  assert.equal(activateRetainedConversionInput({kind:'media',status:'ready'},{api}),true);
  assert.deepEqual(calls,['media']);
  assert.equal(activateRetainedConversionInput({kind:'text',status:'ready'},{api}),true);assert.deepEqual(calls,['media','input']);
});
test('opening unknown original bytes explicitly chooses file encoding and preserves File identity', () => {
  const file={name:'one.bin'},calls=[];
  const api={snapshot:()=>({composing:false}),selectFile:value=>{assert.equal(value,file);calls.push('file');return true;},setMode:value=>{calls.push(value);return true;}};
  const formatController={choose:value=>{calls.push(value);return true;}};
  assert.equal(activateRetainedConversionInput({kind:'binary',status:'ready',file},{api,formatController}),true);
  assert.deepEqual(calls,['file','output','encode']);
});
test('busy, composition and unsuccessful receipts cannot switch material or overwrite selection', () => {
  let calls=0;const api={snapshot:()=>({composing:true}),setMode:()=>{calls++;}};
  const ready={kind:'text',status:'ready'};
  assert.equal(activateRetainedConversionInput(ready,{api}),false);
  assert.equal(activateRetainedConversionInput(ready,{api,busy:true}),false);
  assert.equal(activateRetainedConversionInput({...ready,status:'error'},{api}),false);assert.equal(calls,0);
});


test('uncertain native writes offer inspection and original download rather than blind duplicate intake', () => {
  const entry={kind:'media',status:'error',needsReview:true,error:'check native assets'};
  const receipt=conversionInputReceipt(entry); assert.equal(receipt.retry,false);assert.match(receipt.action,/追加状態を確認/);
  let mode;assert.equal(activateRetainedConversionInput(entry,{api:{snapshot:()=>({}),setMode:value=>{mode=value;return true;}}}),true);assert.equal(mode,'media');
  assert.equal(conversionInputReceipt({kind:'binary',status:'error',retryable:false}).retry,false);
});
test('confirmed writes resume display without presenting an add-again action', () => {
  const receipt=conversionInputReceipt({kind:'text',status:'cancelled',applied:true,error:'already appended'});
  assert.equal(receipt.state,'already appended');assert.equal(receipt.retryLabel,'表示を再開');
  assert.equal(conversionInputReceipt({status:'queued',error:'先の文章を待機'}).state,'先の文章を待機');
});


test('skipping conversion is explicit and keeps its original File available rather than reporting success', () => {
  const failed=conversionInputReceipt({kind:'media',status:'error',needsReview:true});assert.equal(failed.hold,true);
  const held=conversionInputReceipt({kind:'media',status:'held'});assert.equal(held.retry,false);assert.equal(held.action,'');assert.match(held.state,/元ファイルを保持/);
  assert.equal(conversionInputReceipt({kind:'text',status:'error',applied:true}).hold,false);
  assert.equal(conversionInputReceipt({kind:'binary',status:'error'}).hold,false);
});
