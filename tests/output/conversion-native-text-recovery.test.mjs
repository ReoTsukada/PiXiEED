import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFileSync}from'node:fs';import{createPreviewQueue}from'../../js/creation/text-live-preview.mjs';
const code=readFileSync(new URL('../../js/creation/text-tools.mjs',import.meta.url),'utf8');
const extract=(start,end)=>{const a=code.indexOf(start),b=code.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,start);return code.slice(a,b);};
test('actual native restore, chooseFile and mode change keep the real live queue paused until explicit save/refresh',async()=>{
 const nodes=new Map();const $=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',hidden:true,textContent:'',checked:false});return nodes.get(selector);};
 const editor={value:''},layout={hidden:false},timers=new Map();let timer=0,renders=0;
 const context={busy:false,composing:false,draftController:{importing:false},main:{getAttribute:()=> 'false',classList:{toggle(){}},dispatchEvent(){}},root:{dataset:{unifiedInput:'true'},querySelector:()=>layout},legacy:{hidden:false},nav:{querySelectorAll:()=>[]},source:editor,selected:null,frameCache:null,frameFile:null,originCache:null,mode:'media',restoringRecovery:false,textEditRevision:0,$,refresh(){},applyOptions(){},draftSwap:{restore:()=>true},notifyTextSource(){},win:{File,CustomEvent:class{}}};
 const queue=createPreviewQueue({active:()=>context.mode==='output',hasSource:()=>Boolean(context.selected),render:async()=>{renders++;},timers:{setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)}});
 context.root.textLivePreview={invalidate:()=>queue.request(),cancel:()=>queue.pause()};
 vm.runInNewContext(extract('  function chooseFile(file)', '  function kind()')+extract('  function showMode(next)', '  function setBusy(value)'),context);
 const saved={schemaVersion:1,text:'draft',mode:'output',selectedFile:{blob:new Blob(['bytes']),name:'image.png',type:'image/png',lastModified:10},options:{},action:'text',style:'ascii',encoding:'utf-8',art:{columns:64,invert:false,characters:'01',attach:false,nativeGrid:false},alternateDraft:null};
 context.conversionApi={validateRecovery:()=>saved};
 const restore=extract('    restoreRecovery(value, { replaceInitial', '    enableUnified()').trim().replace(/,$/,'');
 const select=extract('    selectFile(file, { deferPreview', '    swapDraft()').trim().replace(/,$/,'');
 vm.runInNewContext(`Object.assign(conversionApi,{${restore},${select}});`,context);
 assert.equal(context.conversionApi.restoreRecovery(saved,{replaceInitial:true}),true);assert.equal(queue.state,'paused');assert.equal(timers.size,0);assert.equal(renders,0);
 assert.equal(context.conversionApi.selectFile(new File(['same'],'image.png'),{deferPreview:true}),true);assert.equal(timers.size,0);assert.equal(renders,0);
 queue.request({immediate:true,force:true});assert.equal(timers.size,1);for(const fn of [...timers.values()])fn();await new Promise(resolve=>setImmediate(resolve));assert.equal(renders,1);queue.destroy();
});
