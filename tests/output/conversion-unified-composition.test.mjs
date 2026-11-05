import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../../js/creation/',import.meta.url);
function extract(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a);return source.slice(a,b);}
test('native text execution refuses composing input before disabling the textarea or rendering',async()=>{
 const src=readFileSync(new URL('text-tools.mjs',root),'utf8'),locks=[];let rendered=0;
 const context={busy:false,composing:true,AbortController,aborter:null,setBusy:value=>locks.push(value),status(){},win:{requestAnimationFrame:fn=>fn()}};
 vm.createContext(context);vm.runInContext(extract(src,'  async function run(job)','\n  async function createOutput('),context);
 assert.equal(await context.run(async()=>{rendered++;}),false);assert.deepEqual(locks,[]);assert.equal(rendered,0);
 context.composing=false;await context.run(async()=>{rendered++;});assert.deepEqual(locks,[true,false]);assert.equal(rendered,1);
});
test('the fixed save entry ignores composing input even when called programmatically',()=>{
 const src=readFileSync(new URL('conversion-smart-ui.mjs',root),'utf8');let requests=0,frames=0,composing=true;
 const context={busy:()=>false,main:{textConversion:{snapshot:()=>({composing})}},saveError:'',saveFocusTicket:null,saveFocusGuard:{begin:()=>({})},button:{},mode:()=> 'input',revision:1,saveIntent:{pending:false,request(){requests++;}},pendingDimensions:null,fpsDirty:false,sizeDirty:false,schedule(){frames++;}};
 vm.createContext(context);vm.runInContext(extract(src,'  function beginExport()','\n  workspace.bindActions'),context);
 assert.equal(context.beginExport(),false);assert.equal(requests,0);assert.equal(frames,0);
 composing=false;context.beginExport();assert.equal(requests,1);assert.equal(frames,1);
});


test('using a generated file cannot import or change mode before IME commits', () => {
  const source=readFileSync(new URL('../../js/creation/text-tools.mjs',import.meta.url),'utf8');
  const start=source.indexOf("$('[data-tx-use]').addEventListener('click',()=>{"),end=source.indexOf('\n',start);
  assert.ok(start>=0&&end>start);
  let click, notice='';
  vm.runInNewContext(source.slice(start,end),{ $:()=>({addEventListener:(event,fn)=>{click=fn;}}),composing:true,busy:false,status:value=>{notice=value;} });
  click(); assert.match(notice,/完了後/);
});
