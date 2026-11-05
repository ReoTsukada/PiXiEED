import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {planConversionImport} from '../../js/creation/conversion-input-router.mjs';
const source=readFileSync(new URL('../../js/creation/conversion-smart-ui.mjs',import.meta.url),'utf8');
const a=source.indexOf("  main.addEventListener('drop', event => {"),b=source.indexOf('  function textSourceChanged(',a);assert.ok(a>=0&&b>a);
function fixture(){
 const events={},calls=[],overlay={hidden:false};
 const context={unified:true,main:{addEventListener:(type,fn)=>{events[type]=fn;},querySelectorAll:selector=>selector==='.sc-material-drop-overlay'?[overlay]:[]},acceptFiles:files=>calls.push(Array.from(files)),win:{File:class {constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type;}}}};
 vm.runInNewContext(source.slice(a,b),context);
 function event({files=[],text='',editable=false}={}){return {target:{closest:()=>editable?{}:null},dataTransfer:{files,getData:()=>text},clipboardData:{files,getData:()=>text},prevented:0,stopped:0,preventDefault(){this.prevented++;},stopImmediatePropagation(){this.stopped++;}};}
 return {events,calls,overlay,event};
}
test('file drops over the text editor are accepted once as media and clear the obsolete overlay',()=>{
 const h=fixture(),file={name:'image.png',type:'image/png'},e=h.event({files:[file],editable:true});h.events.drop(e);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],file);assert.equal(planConversionImport(h.calls[0]).kind,'media');assert.equal(e.stopped,1);assert.equal(h.overlay.hidden,true);
});
test('plain text paste and drop inside the textarea retain native insertion ownership',()=>{
 for(const action of ['paste','drop']){const h=fixture(),e=h.event({text:'keep native text paste',editable:true});h.events[action](e);assert.equal(h.calls.length,0);assert.equal(e.prevented,0);assert.equal(e.stopped,0);}
});
test('an image-only clipboard uses one file import while mixed editable text keeps its text',()=>{
 const file={name:'clipboard.png',type:'image/png'};
 const h=fixture(),e=h.event({files:[file],editable:true});h.events.paste(e);assert.equal(h.calls.length,1);assert.equal(e.stopped,1);
 const m=fixture(),mixed=m.event({files:[file],text:'selected text',editable:true});m.events.paste(mixed);assert.equal(m.calls.length,0);assert.equal(mixed.prevented,0);
});
test('text pasted outside an editor becomes an append request rather than a draft replacement',()=>{
 const h=fixture(),e=h.event({text:'pasted memo'});h.events.paste(e);assert.equal(h.calls.length,1);assert.deepEqual(Array.from(h.calls[0][0].parts),['pasted memo']);assert.equal(planConversionImport(h.calls[0]).kind,'text');
});


test('the legacy root handler leaves unified textarea drops to native insertion', () => {
  const textTools = readFileSync(new URL('../../js/creation/text-tools.mjs',import.meta.url),'utf8');
  const start=textTools.indexOf("root.addEventListener('drop',event=>{"),end=textTools.indexOf('\n  const capture=',start);
  assert.ok(start>=0&&end>start);
  let callback, prevented=0, selected=0;
  const root={dataset:{unifiedInput:'true'},addEventListener:(type,fn)=>{callback=fn;}};
  vm.runInNewContext(textTools.slice(start,end),{root,busy:false,mode:'input',status:()=>{},readTextFile:()=>{selected++;},chooseFile:()=>{selected++;}});
  callback({preventDefault:()=>{prevented++;},dataTransfer:{files:[],getData:()=> 'native text'}});
  assert.equal(prevented,0); assert.equal(selected,0);
  root.dataset.unifiedInput='false';callback({preventDefault:()=>{prevented++;},dataTransfer:{files:[{name:'legacy.txt'}]}});
  assert.equal(prevented,1); assert.equal(selected,1);
});


test('draft edit provenance distinguishes user input from a transactional file append notification', () => {
  const sourceText=readFileSync(new URL('../../js/creation/text-tools.mjs',import.meta.url),'utf8');
  const start=sourceText.indexOf("  root.addEventListener('input',event=>"),end=sourceText.indexOf('\n',start);
  assert.ok(start>=0&&end>start);
  let input,notifications=0;const editor={matches:()=>false};
  const context={root:{addEventListener:(_,fn)=>{input=fn;}},source:editor,refresh:()=>{},mode:'input',$:()=>({hidden:true}),notifyTextSource:()=>{notifications++;},textEditRevision:0};
  vm.runInNewContext(sourceText.slice(start,end),context);
  input({target:editor});assert.equal(context.textEditRevision,1);
  input({target:editor,pixieedTextFileAppend:true});assert.equal(context.textEditRevision,1);
  input({target:editor,isComposing:true});assert.equal(context.textEditRevision,2);assert.equal(notifications,3);
  assert.match(sourceText,/editRevision: textEditRevision/);assert.match(sourceText,/input.pixieedTextFileAppend = true/);
});


test('generated files are claimed once by the shared importer only when it can accept them', () => {
  const start=source.indexOf('  function useGeneratedFile(event) {'),end=source.indexOf("  main.addEventListener('pixieed:use-generated-file'",start);assert.ok(start>=0&&end>start);
  let locked=false;const calls=[],context={unified:true,busy:()=>locked,acceptFiles:files=>calls.push(files)};
  vm.runInNewContext(source.slice(start,end)+';globalThis.handler=useGeneratedFile;',context);
  const files=[{name:'generated.png'}];let claimed=0;const event={detail:{files},preventDefault:()=>{claimed++;}};
  context.handler(event);assert.equal(calls[0],files);assert.equal(claimed,1);
  locked=true;context.handler(event);assert.equal(calls.length,1);assert.equal(claimed,1);
});
