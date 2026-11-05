import test from'node:test';import assert from'node:assert/strict';
import{unifiedMaterialPlacement,unifiedOutputLocation,availableUnifiedOriginalFiles,unifiedFilePurposeAvailability}from'../../js/creation/conversion-unified-input.mjs';
import{settleTextGeneration,textRenderSaveLabel}from'../../js/creation/conversion-smart-ui.mjs';
test('loaded media uses its strip tail while text/code keeps the same add slot in the shared strip',()=>{
 assert.equal(unifiedMaterialPlacement({mode:'media',loaded:true,hasMaterial:true}),'native-strip');
 for(const mode of ['input','output'])assert.equal(unifiedMaterialPlacement({mode,loaded:true,hasMaterial:true}),'shared-strip');
 assert.equal(unifiedMaterialPlacement({mode:'media',loaded:false,hasMaterial:false}),'empty');
});
test('format controls share media preview space and follow an open modal without duplicated state',()=>{
 assert.equal(unifiedOutputLocation({mode:'media',loaded:true,modal:false}),'preview');assert.equal(unifiedOutputLocation({mode:'media',loaded:true,modal:true}),'panel');assert.equal(unifiedOutputLocation({mode:'input',loaded:true,modal:false}),'composer');
});
test('original file choices retain exact File references and input order without duplicate current File',()=>{
 const a={name:'same.png'},b={name:'same.png'},c={name:'received.png'};const rows=availableUnifiedOriginalFiles(b,[{id:'a',file:a},{id:'b',file:b}]);assert.deepEqual(rows.map(row=>row.value),['a','b']);assert.equal(rows[1].file,b);
 assert.deepEqual(availableUnifiedOriginalFiles(c,[{id:'a',file:a}]).map(row=>row.value),['current-original','a']);
});
test('native raster inputs remain eligible for first-frame text art, including QOI/TIFF/APNG/Netpbm',()=>{
 for(const name of ['x.qoi','x.tiff','x.apng','x.ppm','x.tga','x.ico'])assert.equal(unifiedFilePurposeAvailability({name,size:20}).art,true,name);
 assert.equal(unifiedFilePurposeAvailability({name:'tone.wav',type:'audio/wav',size:20}).art,false);
});
test('switching to an old SVG/project link cannot settle dirty text or skip required regeneration',()=>{
 const current={generationHref:'blob:old-png',previousGenerationHref:'blob:old-png',working:false,dirty:true,resultMode:'input',mode:'input'};
 assert.equal(settleTextGeneration(current).dirty,true);assert.equal(settleTextGeneration({...current,generationHref:'blob:new-png'}).dirty,false);assert.equal(settleTextGeneration({...current,generationHref:'blob:new-png',working:true}).dirty,true);
});
test('one-click action names match the selected rendered-file preference',()=>{
 assert.equal(textRenderSaveLabel({format:'svg',loaded:true}),'SVGで保存');assert.equal(textRenderSaveLabel({format:'pxtxt',loaded:true}),'文章と設定を保存');assert.equal(textRenderSaveLabel({format:'png',loaded:true,working:true}),'作成中…');
});


test('render-format adapter change has one owner and does not bubble as a text content edit',async()=>{
  const {readFileSync}=await import('node:fs'),vm=await import('node:vm');const source=readFileSync(new URL('../../js/creation/conversion-unified-input.mjs',import.meta.url),'utf8');
  const start=source.indexOf("  listen(expression, 'change', event => {"),end=source.indexOf("  listen(emptyAdd,",start);assert.ok(start>=0&&end>start);
  let handler,stopped=0;const calls=[];
  vm.runInNewContext(source.slice(start,end),{listen:(_node,_type,fn)=>{handler=fn;},expression:{value:'svg'},sourceKind:'text',purpose:{value:'text'},api:{snapshot:()=>({composing:false}),setRenderFormat:value=>calls.push(value)},isBusy:()=>false,localError:'',update:()=>{},schedule:()=>{}});
  handler({stopPropagation:()=>{stopped++;}});assert.deepEqual(calls,['svg']);assert.equal(stopped,1);
});

test('the actual selected-result resolver and save intent dispatch exactly the chosen existing native link',async()=>{
  const {readFileSync}=await import('node:fs'),vm=await import('node:vm');const {textRenderOutputSelector}=await import('../../js/creation/conversion-text-output-choice.mjs');const {createConversionSaveIntent}=await import('../../js/creation/conversion-save-controller.mjs');const {downloadConversionResult}=await import('../../js/creation/conversion-save-bridge.mjs');
  const source=readFileSync(new URL('../../js/creation/conversion-smart-ui.mjs',import.meta.url),'utf8'),start=source.indexOf('  const result = () => {'),end=source.indexOf('  const cancelAction',start);assert.ok(start>=0&&end>start);
  let selected='png';const clicks=[],links={};for(const [format,selector]of [['png','[data-tx-download]'],['svg','[data-tx-svg]'],['pxtxt','[data-tx-project]']])links[selector]={download:`text.${format}`,getAttribute:()=>`blob:${format}`,click:()=>clicks.push(format)};
  const context={mode:()=> 'input',liveText:()=>null,main:{textConversion:{snapshot:()=>({renderFormat:selected})}},$:selector=>selector==='[data-text-tools]'?{dataset:{txResultMode:'input'}}:selector==='[data-tx-action]'?{value:'text'}:links[selector],blobLink:value=>value||null,textRenderOutputSelector};
  vm.runInNewContext(source.slice(start,end).replace('const result =','globalThis.getResult ='),context);
  for(const format of ['png','svg','pxtxt']){selected=format;const intent=createConversionSaveIntent({snapshot:()=>{const link=context.getResult();return{mode:'input',revision:1,loaded:true,working:false,ready:true,matchesFormat:true,link,href:link.getAttribute('href')};},run:()=>{throw Error('fresh results must not regenerate');},save:(link,state)=>downloadConversionResult({link,expectedHref:state.href}),choose:()=>{throw Error('must not open chooser');}});intent.request();}
  assert.deepEqual(clicks,['png','svg','pxtxt']);
});
test('one save request waits for new text rendering and downloads SVG without an intermediate confirmation click',async()=>{
 const {createConversionSaveIntent}=await import('../../js/creation/conversion-save-controller.mjs');let release,runs=0,clicks=0;const state={mode:'input',revision:1,loaded:true,working:false,ready:false,matchesFormat:true,href:'blob:old-svg',link:{download:'old.svg',click:()=>{throw Error('stale result');}}};
 const intent=createConversionSaveIntent({snapshot:()=>state,run:()=>{runs++;state.working=true;return new Promise(resolve=>{release=()=>{state.working=false;state.ready=true;state.href='blob:new-svg';state.link={download:'new.svg',click:()=>{clicks++;}};resolve(true);};});},save:link=>{link.click();return true;},choose:()=>{throw Error('unexpected chooser');}});
 intent.request();assert.equal(runs,1);assert.equal(clicks,0);release();await new Promise(resolve=>setImmediate(resolve));intent.observe();assert.equal(clicks,1);assert.equal(intent.pending,false);
});
