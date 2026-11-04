import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversionSaveIntent } from '../../js/creation/conversion-save-controller.mjs';
import { downloadConversionResult } from '../../js/creation/conversion-save-bridge.mjs';
const tick = () => new Promise(resolve => setImmediate(resolve));
const state = () => ({ mode:'media',revision:1,loaded:true,working:false,ready:false,matchesFormat:true,href:'blob:old',link:{name:'old'} });

test('a synchronous engine exception unlocks saving and a subsequent request saves only the new output', async () => {
  const s=state(), saved=[], errors=[];let fail=true;
  const intent=createConversionSaveIntent({snapshot:()=>s,run(){if(fail)throw Error('engine failed');s.href='blob:new';s.link={name:'new'};s.ready=true;return Promise.resolve(true);},save:(link,snapshot)=>saved.push([link.name,snapshot.href]),choose(){},blocked:e=>errors.push(e.message)});
  intent.request();assert.equal(intent.pending,false);assert.deepEqual(errors,['engine failed']);assert.deepEqual(saved,[]);
  fail=false;intent.request();await tick();intent.observe();
  assert.equal(intent.pending,false);assert.deepEqual(saved,[['new','blob:new']]);
});

test('synchronous cancellation during a native action never attaches an awaiting flag to another intent', async () => {
  const s=state(),saved=[];let intent;
  intent=createConversionSaveIntent({snapshot:()=>s,run(){intent.cancel();return Promise.resolve(true);},save:link=>saved.push(link),choose(){}});
  intent.request();await tick();intent.observe();assert.equal(intent.pending,false);assert.deepEqual(saved,[]);
  s.ready=true;intent.request();assert.equal(saved.length,1);
});

test('a changed material/settings revision discards an already running save result', async () => {
  const s=state(),saved=[];let release;
  const intent=createConversionSaveIntent({snapshot:()=>s,run:()=>new Promise(resolve=>{release=resolve;}),save:link=>saved.push(link),choose(){}});
  intent.request();s.revision++;s.href='blob:new-material';s.ready=true;release(true);await tick();intent.observe();
  assert.equal(intent.pending,false);assert.deepEqual(saved,[]);
});

test('download boundary rejects old or unavailable links and retains the original native click handler', () => {
  let clicks=0;const link={download:'art.png',getAttribute:()=> 'blob:current',click(){clicks++;}};
  assert.equal(downloadConversionResult({link,expectedHref:'blob:old'}),false);
  assert.equal(downloadConversionResult({link,expectedHref:'blob:current',available:()=>false}),false);
  assert.equal(clicks,0);
  assert.equal(downloadConversionResult({link,expectedHref:'blob:current'}),true);assert.equal(clicks,1);
  for(const href of ['https://example.test/private','',null]) assert.equal(downloadConversionResult({link:{...link,getAttribute:()=>href}}),false);
  assert.equal(downloadConversionResult({link:{...link,download:''}}),false);assert.equal(clicks,1);
});

test('download exceptions and refused dispatch leave the controller retryable without reporting a save', () => {
  const s=state();s.ready=true;const errors=[];let fail=true,saved=0;
  const intent=createConversionSaveIntent({snapshot:()=>s,run(){assert.fail('ready output needs no conversion');},save(){if(fail)throw Error('download blocked');saved++;return true;},choose(){},blocked:e=>errors.push(e?.message||'refused')});
  intent.request();assert.equal(intent.pending,false);assert.deepEqual(errors,['download blocked']);assert.equal(saved,0);
  fail=false;intent.request();assert.equal(saved,1);
  const refused=createConversionSaveIntent({snapshot:()=>s,run(){},save:()=>false,choose(){},blocked:()=>errors.push('refused')});
  refused.request();assert.equal(refused.pending,false);assert.equal(errors.at(-1),'refused');
});


test('a synchronously cancelled action consumes its later rejection without reviving an old intent', async () => {
  const s=state(), errors=[];let intent;
  intent=createConversionSaveIntent({snapshot:()=>s,run(){intent.cancel();return Promise.reject(Error('cancelled job'));},save(){assert.fail('cancelled');},choose(){},blocked:e=>errors.push(e)});
  intent.request();await tick();intent.observe();assert.equal(intent.pending,false);assert.deepEqual(errors,[]);
});
