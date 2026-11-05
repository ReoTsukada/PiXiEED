import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnifiedImportController } from '../../js/creation/conversion-unified-import.mjs';
import { createConversionTextDraftController } from '../../js/creation/conversion-text-draft.mjs';
import { conversionInputReceipt } from '../../js/creation/conversion-input-receipts.mjs';

function workspace({ rejectText, rejectMedia } = {}) {
  const state={text:'手書きの下書き',mode:'input',selected:null,media:[],events:[],reports:[]};
  const draft=createConversionTextDraftController({readText:()=>state.text,writeText:value=>{state.text=value;},readFile:async file=>{if(rejectText?.(file))throw new Error('synthetic read failure');return file.arrayBuffer();},decode:bytes=>new TextDecoder().decode(bytes),maxLength:24*1024*1024});
  const controller=createUnifiedImportController({
    snapshot:()=>({text:state.text,mode:state.mode,composing:false}),isBusy:()=>false,
    appendTextFiles:async files=>{state.events.push('text:'+files.map(file=>file.name).join(','));const ok=await draft.append(files);if(ok)state.mode='input';return ok;},
    importMedia:async files=>{state.events.push('media:'+files.map(file=>file.name).join(','));if(rejectMedia?.(files))return false;state.media.push(...files);return true;},
    selectFile:async file=>{state.selected=file;return true;},
    activateMedia:async()=>{state.mode='media';return true;},activateText:async()=>{state.mode='input';return true;},activateCode:async file=>{state.events.push('code:'+file.name);state.mode='output';return true;},report:message=>state.reports.push(message),
  });
  return {state,controller};
}

test('real File references and transactional text append survive ordered mixed intake together', async () => {
  const files=[new File(['image-a'],'a.png',{type:'image/png'}),new File(['文章A'],'a.txt',{type:'text/plain'}),new File([new Uint8Array([0,255,3])],'original.bin'),new File(['文章B'],'b.txt',{type:'text/plain'}),new File(['image-b'],'b.gif',{type:'image/gif'})];
  const {state,controller}=workspace();assert.equal(await controller.request(files),true);
  assert.equal(state.text,'手書きの下書き\n文章A\n文章B');assert.deepEqual(state.media,[files[0],files[4]]);
  assert.deepEqual(state.events,['media:a.png','text:a.txt','code:original.bin','text:b.txt','media:b.gif']);
  const entries=controller.snapshotEntries();assert.deepEqual(entries.map(entry=>entry.file),files);assert.ok(entries.every(entry=>entry.status==='ready'));
  assert.deepEqual(new Uint8Array(await entries[2].file.arrayBuffer()),new Uint8Array([0,255,3]));
  assert.match(conversionInputReceipt(entries[2]).note,/判定できない/);
});

test('retrying an earlier failed text read keeps later text after it and does not repeat accepted media', async () => {
  let reject=true;const {state,controller}=workspace({rejectText:file=>reject&&file.name==='first.txt'});
  const files=[new File(['first'],'first.txt',{type:'text/plain'}),new File(['second'],'second.txt',{type:'text/plain'}),new File(['image'],'one.png',{type:'image/png'})];
  assert.equal(await controller.request(files),true);
  assert.equal(state.text,'手書きの下書き');assert.deepEqual(state.media,[files[2]]);
  const before=controller.snapshotEntries();assert.equal(before[0].status,'error');assert.equal(before[1].status,'queued');
  assert.equal(await controller.retryEntry(before[1].id),false,'later text cannot jump ahead of an unresolved earlier text');
  reject=false;assert.equal(await controller.retryEntry(before[0].id),true);
  assert.equal(state.text,'手書きの下書き\nfirst\nsecond');assert.deepEqual(state.media,[files[2]],'native media was imported once');
  assert.deepEqual(controller.snapshotEntries().map(entry=>entry.file),files);assert.ok(controller.snapshotEntries().every(entry=>entry.status==='ready'));
});


test('an uncertain media result waits for explicit retention before later media proceeds, with originals intact', async () => {
  const bad=new File(['not a decoded image'],'broken.png',{type:'image/png'}),good=new File(['synthetic image'],'later.png',{type:'image/png'}),text=new File(['memo'],'memo.txt',{type:'text/plain'});
  const {state,controller}=workspace({rejectMedia:files=>files.includes(bad)});
  assert.equal(await controller.request([bad,text,good]),true);assert.equal(state.text,'手書きの下書き\nmemo');assert.deepEqual(state.media,[]);
  const before=controller.snapshotEntries();assert.equal(before[0].needsReview,true);assert.equal(before[2].status,'queued');
  assert.equal(await controller.retryEntry(before[0].id),false,'unknown native outcomes are never blindly retried');
  assert.equal(await controller.holdEntry(before[0].id),true);assert.deepEqual(state.media,[good]);
  const after=controller.snapshotEntries();assert.equal(after[0].status,'held');assert.equal(after[0].file,bad);assert.equal(after[2].status,'ready');assert.equal(await after[0].file.text(),'not a decoded image');
  assert.equal(state.events.filter(event=>event==='media:broken.png').length,1);assert.equal(state.events.filter(event=>event==='media:later.png').length,1);
});
