import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../js/social/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('  async function submitServerPost(mode)');
const next=source.slice(start+5).search(/\n  (?:async )?function /);
const handler=source.slice(start,start+5+next);
test('actual text/music private submission only saves locally before validation, Auth, Blob or API work',async()=>{
 for(const mode of ['text','music'])for(const value of ['private','',undefined]){
  let saved=0;const state={busy:false,submitted:false,attachment:{original:'synthetic'}};
  const env={state,visibilityInput:{value},saveDraft:async()=>{saved++;},lockComposer:()=>{throw Error('server path entered');}};
  const run=new Function('env',`with(env){return (${handler});}`)(env);
  await run(mode);assert.equal(saved,1);assert.equal(state.attachment.original,'synthetic');
 }
});

test('actual image/photo private submit leaves originals on device before consent or API access',async()=>{
 const begin=source.indexOf('  async function submitPost(event)');
 const end=source.indexOf('  async function ',begin+10);
 const fn=source.slice(begin,end);
 for(const mode of ['art','photo','text','music']){
  let saved=0;const state={mode,busy:false,submitted:false,attachment:{original:'synthetic'}};
  const env={state,visibilityInput:{value:'private'},saveDraft:async()=>{saved++;},consentUi:{read(){throw Error('consent should be unnecessary');}}};
  const run=new Function('env',`with(env){return (${fn});}`)(env);
  await run({preventDefault(){}});assert.equal(saved,1);assert.equal(state.attachment.original,'synthetic');
 }
});
