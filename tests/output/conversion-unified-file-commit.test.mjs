import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const text=readFileSync(new URL('../../js/creation/text-tools.mjs',import.meta.url),'utf8');
const page=readFileSync(new URL('../../js/creation/conversion-page.mjs',import.meta.url),'utf8');
test('canceling the raw-file picker preserves the prior text conversion file',()=>{
 let listener;const calls=[];const context={$:()=>({addEventListener:(_event,fn)=>{listener=fn;}}),chooseFile:file=>calls.push(file)};
 const line=text.split('\n').find(line=>line.includes("$('[data-tx-file]').addEventListener('change'"));assert.ok(line);
 vm.runInNewContext(line,context);listener({target:{files:[],value:'old'}});assert.equal(calls.length,0);
 const file={name:'valid.png'};listener({target:{files:[file],value:'old'}});assert.equal(calls[0],file);
});
test('a media import only publishes raw input files after successful decode and native busy settlement',async()=>{
 const start=page.indexOf('  async function load(files)'),end=page.indexOf('\n  function publishInputFiles',start);assert.ok(start>=0&&end>start);
 for(const failure of [false,true]){
  const calls=[],file={name:'fixture.png'};let locked=false;
  const ctx={busy:false,AbortController,controller:null,input:{value:'pending'},source:null,format:{focus(){}},materialSequence:0,
   disable:value=>{locked=value;},text(){},loadTimelineFiles:async()=>{if(failure)throw Error('bad file');return{};},acceptSource(){},emitMaterials(){},publishInputFiles:files=>{assert.equal(locked,false);calls.push(files);}};
  vm.createContext(ctx);vm.runInContext(page.slice(start,end),ctx);
  assert.equal(await ctx.load([file]),!failure);assert.equal(calls.length,failure?0:1);if(!failure)assert.equal(calls[0][0],file);
 }
});


test('the unified adapter reaches the native first detailed import before a record exists',async()=>{
 const { importUnifiedMediaFiles, createUnifiedImportController } = await import('../../js/creation/conversion-unified-import.mjs');
 const source=readFileSync(new URL('../../js/creation/output-page.mjs',import.meta.url),'utf8');
 const a=source.indexOf('async function addMaterialFiles('),b=source.indexOf('\nasync function replaceMaterialFiles(',a);assert.ok(a>=0&&b>a);
 const calls=[];const ctx={record:null,main:{dataset:{unifiedInput:'true'},dispatchEvent(){}},status:{textContent:''},importController:null,CustomEvent:class{},materialNotice:()=>{throw Error('wrong legacy-only guard');},handleImport:async files=>{calls.push(files);return true;}};
 vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);
 const file={name:'first.png',type:'image/png',size:10};
 const controller=createUnifiedImportController({snapshot:()=>({text:'kept draft',composing:false}),isBusy:()=>false,importMedia:files=>importUnifiedMediaFiles({addFiles:ctx.addMaterialFiles},files),selectFile:()=>true,activateMedia:()=>true});
 assert.equal(await controller.request([file]),true);assert.equal(calls.length,1);assert.equal(calls[0][0],file);
});


test('using a generated text image joins unified additive intake instead of replacing native materials', () => {
  const source=readFileSync(new URL('../../js/creation/text-tools.mjs',import.meta.url),'utf8');
  const start=source.indexOf("$('[data-tx-use]').addEventListener('click',()=>{"),end=source.indexOf('\n',start);assert.ok(start>=0&&end>start);
  let click,request;const restoredFile={name:'text.png',type:'image/png'};
  const context={$:()=>({addEventListener:(_,fn)=>{click=fn;}}),composing:false,busy:false,status:()=>{},root:{dataset:{unifiedInput:'true'}},restoredFile,main:{dispatchEvent:event=>{request=event;return false;}},win:{CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}}},legacy:{querySelector:()=>{throw new Error('must not use replacing native picker');}}};
  vm.runInNewContext(source.slice(start,end),context);click();assert.equal(request.type,'pixieed:use-generated-file');assert.equal(request.cancelable,true);assert.equal(request.detail.files[0],restoredFile);
});
