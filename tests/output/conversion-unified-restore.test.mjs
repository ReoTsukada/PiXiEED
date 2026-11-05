import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { detectText } from '../../js/creation/text-codec.mjs';
const source = readFileSync(new URL('../../js/creation/text-tools.mjs', import.meta.url), 'utf8');
const from=source.indexOf('  async function createInput(signal)'), to=source.indexOf('\n  nav.addEventListener',from);
assert.ok(from>=0&&to>from,'actual input executor extraction');
function fixture(text, action, unified=true) {
 const calls=[];
 const context={root:{dataset:{unifiedInput:String(unified)}},source:{value:text},$:()=>({value:action}),kind:()=>action==='auto'?detectText(text):action,status:()=>{},options:()=>({font:'mono'}),
  showTextImage:async(value)=>calls.push(['render',value]),worker:async(operation,value)=>{calls.push([operation,value]);return {name:'restored.bin'};},showFile:value=>calls.push(['file',value.name])};
 vm.createContext(context);vm.runInContext(source.slice(from,to),context);return {context,calls};
}
test('ambiguous words and Base64-looking text are never auto-restored or silently rendered under restore intent',async()=>{
 for(const text of ['Hello','SGVsbG8=']) {const h=fixture(text,'auto');await assert.rejects(h.context.createInput({}),/復元形式を判別/);assert.deepEqual(h.calls,[]);assert.equal(h.context.source.value,text);}
});
test('explicit text rendering keeps the original draft including code-looking content',async()=>{
 const text='data:text/plain;base64,SGVsbG8=';const h=fixture(text,'text');await h.context.createInput({});assert.deepEqual(h.calls,[['render',text]]);assert.equal(h.context.source.value,text);
});
test('Base64 decoding requires the explicit existing Base64 action',async()=>{
 const h=fixture('SGVsbG8=','base64');await h.context.createInput({});assert.deepEqual(h.calls,[['decode-base64','SGVsbG8='],['file','restored.bin']]);assert.equal(h.context.source.value,'SGVsbG8=');
});
test('recognized restore data remains reachable after explicit automatic restore selection',async()=>{
 const text='-----BEGIN PIXIEED RESTORE\nfixture\n-----END PIXIEED RESTORE-----';const h=fixture(text,'auto');await h.context.createInput({});assert.equal(h.calls[0][0],'restore');
});
test('non-unified fallback retains its existing plain-text automatic rendering',async()=>{
 const h=fixture('memo','auto',false);await h.context.createInput({});assert.deepEqual(h.calls,[['render','memo']]);
});
