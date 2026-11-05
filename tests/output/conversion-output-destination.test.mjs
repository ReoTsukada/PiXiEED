import test from 'node:test';
import assert from 'node:assert/strict';
import { fileOutputChoices, fileOutputSelection } from '../../js/creation/conversion-output-destination.mjs';

test('file output choices retain native order, metadata, disabled state, and input immutability', () => {
  const native = [
    { value: 'png', label: 'PNG', group: '画像' },
    { value: 'jpeg', label: 'JPEG', disabled: true, group: '画像' },
    { value: 'gif', label: 'GIF', disabled: false, group: '動画像' },
  ];
  const before = structuredClone(native);
  const choices = fileOutputChoices(native, { canArt: true });

  assert.deepEqual(choices.map(option => option.value), ['png', 'jpeg', 'gif', 'text-art']);
  assert.deepEqual(choices.slice(0, 3), native);
  assert.deepEqual(choices[3], { value: 'text-art', label: '文字アート（TXT）', disabled: false, group: '文字' });
  assert.deepEqual(native, before);
  assert.notEqual(choices[0], native[0]);
});

test('text art remains visible but disabled when the current file cannot produce it', () => {
  assert.deepEqual(fileOutputChoices([], { canArt: false }), [
    { value: 'text-art', label: '文字アート（TXT）', disabled: true, group: '文字' },
  ]);
});

test('active restore work is represented only by a disabled status marker', () => {
  const choices = fileOutputChoices([{ value: 'png', label: 'PNG' }], { canArt: true, codeActive: true });
  assert.deepEqual(choices[0], { value: 'code-active', label: '復元コード（別の用途）', disabled: true, group: '現在の用途' });
  assert.deepEqual(choices.slice(1).map(option => option.value), ['png', 'text-art']);
  assert.equal(choices.some(option => ['encode', 'base64', 'dataurl', 'pixels'].includes(option.value)), false);
  assert.equal(fileOutputChoices([{ value: 'png', label: 'PNG' }]).some(option => option.value === 'code-active'), false);
});

test('selection maps only art render formats to text art and keeps media selection distinct', () => {
  for (const nativeValue of ['ascii', 'block', 'braille', 'emoji', 'custom']) {
    assert.equal(fileOutputSelection({ mode: 'output', nativeValue }), 'text-art');
  }
  for (const nativeValue of ['encode', 'base64', 'dataurl', 'pixels', '', undefined]) {
    assert.equal(fileOutputSelection({ mode: 'output', nativeValue }), 'code-active');
  }
  assert.equal(fileOutputSelection({ mode: 'media', mediaValue: 'jpeg' }), 'jpeg');
  assert.equal(fileOutputSelection({ mode: 'media', mediaValue: '' }), '');
});


async function routingFixture() {
 const {readFileSync}=await import('node:fs'),vm=await import('node:vm');
 const helpers=await import('../../js/creation/conversion-unified-input.mjs');
 const source=readFileSync(new URL('../../js/creation/conversion-unified-input.mjs',import.meta.url),'utf8');
 const extract=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
 let mode='media',busy=false;const media={value:'png'},style={value:'encode'},file={name:'source.png',type:'image/png',size:200},text={value:'retained draft'};
 const mediaOptions=['png','jpeg','gif','wav'].map(value=>({value,label:value}));
 const styles=['encode','ascii','block','braille','emoji','custom','pixels','base64','dataurl'].map(value=>({value,label:value}));
 const calls=[];const context={...helpers,sourceKind:'file',isBusy:()=>busy,api:{snapshot:()=>({file,composing:false}),setMode:next=>{calls.push(['mode',next]);mode=next;return true;},selectFile:()=>{throw Error('must keep original file');}},getInputs:()=>[{id:'a',file}],materialState:()=>({loaded:true}),acceptFiles:()=>{throw Error('must not re-import retained material');},classifyConversionFile:()=> 'media',currentNative:()=>({value:mode==='media'?media.value:style.value,options:mode==='media'?mediaOptions:styles}),formatController:{choose:value=>{const options=mode==='media'?mediaOptions:styles;if(!options.some(option=>option.value===value))return false;(mode==='media'?media:style).value=value;calls.push(['format',mode,value]);return true;}},settings:{open:false},purpose:{value:'media'},update:()=>{},schedule:()=>{},optionsFrom:()=>mediaOptions,main:{querySelector:()=>media}};
 vm.createContext(context);
 vm.runInContext(extract('  async function setPurposeValue(value) {','  function materialState()'),context);
 vm.runInContext(extract('  async function chooseFileOutput(value) {','  const changeFileStyle='),context);
 return {context,media,style,file,text,calls,get mode(){return mode;},set busy(value){busy=value;}};
}

test('the actual file output handler changes image → art → image without losing raw file, draft or art settings',async()=>{
 const f=await routingFixture();assert.equal(await f.context.chooseFileOutput('text-art'),true);assert.equal(f.mode,'output');assert.equal(f.style.value,'ascii');assert.equal(f.context.settings.open,true);
 f.style.value='braille';assert.equal(await f.context.chooseFileOutput('jpeg'),true);assert.equal(f.mode,'media');assert.equal(f.media.value,'jpeg');assert.equal(f.style.value,'braille');
 assert.equal(await f.context.chooseFileOutput('text-art'),true);assert.equal(f.style.value,'braille');assert.equal(f.context.api.snapshot().file,f.file);assert.equal(f.text.value,'retained draft');
});

test('code remains a separate explicit route and returning to media preserves its own code style',async()=>{
 const f=await routingFixture();await f.context.setPurposeValue('restore');assert.equal(f.mode,'output');assert.equal(f.style.value,'encode');f.style.value='base64';
 await f.context.chooseFileOutput('png');assert.equal(f.mode,'media');await f.context.setPurposeValue('restore');assert.equal(f.style.value,'base64');
 assert.equal(await f.context.chooseFileOutput('encode'),false,'code is not a media-format choice');
});

test('busy or unknown output selection never alters the current material or format',async()=>{
 const f=await routingFixture();assert.equal(await f.context.chooseFileOutput('not-a-format'),false);assert.equal(f.calls.length,0);
 f.busy=true;assert.equal(await f.context.chooseFileOutput('text-art'),false);assert.equal(f.mode,'media');assert.equal(f.media.value,'png');assert.equal(f.calls.length,0);
});


test('accepted delayed import explicitly enters media mode before applying its output format',async()=>{
 const f=await routingFixture();await f.context.chooseFileOutput('text-art');f.context.materialState=()=>({loaded:false});
 let imports=0;f.context.acceptFiles=async files=>{imports++;assert.equal(files[0],f.file);await Promise.resolve();return true;};
 assert.equal(await f.context.chooseFileOutput('jpeg'),true);assert.equal(imports,1);assert.equal(f.mode,'media');assert.equal(f.media.value,'jpeg');assert.equal(f.context.purpose.value,'media');
});

test('failed media import keeps text art mode and does not apply a mismatched image format',async()=>{
 const f=await routingFixture();await f.context.chooseFileOutput('text-art');f.context.materialState=()=>({loaded:false});f.context.acceptFiles=async()=>false;
 assert.equal(await f.context.chooseFileOutput('jpeg'),false);assert.equal(f.mode,'output');assert.equal(f.media.value,'png');assert.equal(f.style.value,'ascii');
});
