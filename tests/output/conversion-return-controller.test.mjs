import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversionReturnController } from '../../js/creation/conversion-return-controller.mjs';
import { createNativeReturnBridge } from '../../js/creation/conversion-return-bridge.mjs';
function event(overrides={}) { return {button:0,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},...overrides}; }
function fixture() {
 const calls=[];let origin={textContent:'編集画面へ戻る',href:'/draw/editor.html',getAttribute(){return this.href;},click(){calls.push('native');}};
 const controller=createConversionReturnController(createNativeReturnBridge(()=>origin));
 return {calls,controller,setOrigin:value=>{origin=value;},get origin(){return origin;}};
}

test('return snapshots follow the current engine URL and forward through its existing handler once', () => {
 const f=fixture();assert.deepEqual(f.controller.snapshot(),{available:true,href:'/draw/editor.html',label:'← 編集へ'});
 f.origin.href='/audio/editor.html?outputId=local';const e=event({preventDefault(){this.defaultPrevented=true;f.calls.push('prevent');}});
 assert.equal(f.controller.request(e),true);assert.deepEqual(f.calls,['prevent','native']);assert.equal(f.controller.snapshot().href,f.origin.href);
});

test('modified, secondary and already prevented clicks retain ordinary browser link behavior', () => {
 const f=fixture();for(const overrides of [{button:1},{button:2},{metaKey:true},{ctrlKey:true},{shiftKey:true},{altKey:true},{defaultPrevented:true}]) {
  const e=event(overrides);assert.equal(f.controller.request(e),false);
  assert.equal(e.defaultPrevented,Boolean(overrides.defaultPrevented));
 }assert.deepEqual(f.calls,[]);
});

test('missing native return falls back without taking ownership of navigation', () => {
 const f=fixture();f.setOrigin(null);const e=event();assert.equal(f.controller.request(e),false);assert.equal(e.defaultPrevented,false);
 assert.deepEqual(f.controller.snapshot(),{available:false,href:'/output/',label:'← ガイド'});
});

test('pending-write completion remains owned by the native handler; no duplicate navigation is added', async () => {
 const f=fixture();let release,navigated=0;const flush=new Promise(resolve=>{release=resolve;});let task;
 f.origin.click=()=>{task=flush.then(()=>{navigated++;});};const e=event();
 f.controller.request(e);assert.equal(e.defaultPrevented,true);assert.equal(navigated,0);
 release();await task;assert.equal(navigated,1);
});

test('native return errors do not create a controller lock or trigger an alternate URL', () => {
 const f=fixture();let fail=true;f.origin.click=()=>{if(fail)throw Error('pending write failed');f.calls.push('retry');};
 const e=event();assert.throws(()=>f.controller.request(e),/pending write failed/);assert.equal(e.defaultPrevented,true);
 assert.equal(f.controller.snapshot().href,'/draw/editor.html');assert.deepEqual(f.calls,[]);
 fail=false;assert.equal(f.controller.request(event()),true);assert.deepEqual(f.calls,['retry']);
});

const { createConversionReturnGate } = await import('../../js/creation/conversion-return-controller.mjs');
test('the write gate waits for every pending write and navigates exactly once for repeated clicks', async () => {
 let releaseA,releaseB;const writes=[new Promise(resolve=>{releaseA=resolve;}),new Promise(resolve=>{releaseB=resolve;})],navigated=[];
 const gate=createConversionReturnGate({pending:()=>writes,navigate:href=>navigated.push(href)});
 const first=gate.request('/draw/');assert.equal(gate.request('/audio/'),first);assert.equal(gate.pending,true);
 releaseA();await Promise.resolve();assert.deepEqual(navigated,[]);releaseB();assert.equal(await first,true);assert.deepEqual(navigated,['/draw/']);
});

test('a failed pending write keeps the current screen and reports a retryable failure', async () => {
 const navigated=[],errors=[];let writes=[Promise.reject(Error('local write rejected'))];
 const gate=createConversionReturnGate({pending:()=>writes,navigate:href=>navigated.push(href),reportFailure:()=>errors.push('write failed')});
 assert.equal(await gate.request('/draw/'),false);assert.deepEqual(navigated,[]);assert.deepEqual(errors,['write failed']);assert.equal(gate.pending,false);
 writes=[Promise.resolve()];assert.equal(await gate.request('/draw/'),true);assert.deepEqual(navigated,['/draw/']);
});

test('a late successful write cannot redirect after the output page is no longer current', async () => {
 let release,current=true;const navigated=[],write=new Promise(resolve=>{release=resolve;});
 const gate=createConversionReturnGate({pending:()=>[write],navigate:href=>navigated.push(href),isCurrent:()=>current});
 const result=gate.request('/draw/');current=false;release();assert.equal(await result,false);assert.deepEqual(navigated,[]);
});

test('a synchronous native navigation failure clears the gate for an explicit retry', async () => {
 let fail=true;const navigated=[];
 const gate=createConversionReturnGate({pending:()=>[],navigate:href=>{if(fail)throw Error('navigation unavailable');navigated.push(href);}});
 await assert.rejects(gate.request('/draw/'),/navigation unavailable/);assert.equal(gate.pending,false);
 fail=false;assert.equal(await gate.request('/draw/'),true);assert.deepEqual(navigated,['/draw/']);
});

test('new writes added during return are drained before navigation', async () => {
 let releaseFirst,releaseLater;const first=new Promise(resolve=>{releaseFirst=resolve;}),later=new Promise(resolve=>{releaseLater=resolve;});
 const writes=[first],navigated=[];const gate=createConversionReturnGate({pending:()=>writes,navigate:href=>navigated.push(href)});
 const result=gate.request('/draw/');writes.push(later);releaseFirst();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(navigated,[]);releaseLater();assert.equal(await result,true);assert.deepEqual(navigated,['/draw/']);
});

test('a newly failed write is retained even if it leaves the native pending set before the first batch ends', async () => {
 let release;const slow=new Promise(resolve=>{release=resolve;}),pending=new Set([slow]),navigated=[],errors=[];
 const gate=createConversionReturnGate({pending:()=>pending,navigate:href=>navigated.push(href),reportFailure:()=>errors.push('failed')});
 const result=gate.request('/draw/');
 const fast=Promise.reject(Error('fast later write'));gate.observeWrite(fast);
 await new Promise(resolve=>setImmediate(resolve));
 release();assert.equal(await result,false);assert.deepEqual(navigated,[]);assert.deepEqual(errors,['failed']);assert.equal(gate.pending,false);
});

const { readFileSync } = await import('node:fs');
const vm = await import('node:vm');
test('the real engine write tracker reports even quickly settled failures to the return gate', async () => {
 const source=readFileSync(new URL('../../js/creation/output-page.mjs',import.meta.url),'utf8');
 const from=source.indexOf('function trackPending(promise)'),to=source.indexOf('\nfunction setError(',from);
 assert.ok(from>=0&&to>from,'engine tracker extraction markers');
 const context={pendingWrites:new Set(),returnGate:null,Promise};const navigated=[],errors=[];
 context.returnGate=createConversionReturnGate({pending:()=>context.pendingWrites,navigate:href=>navigated.push(href),reportFailure:()=>errors.push('failed')});
 vm.createContext(context);vm.runInContext(source.slice(from,to),context);
 let release;context.trackPending(new Promise(resolve=>{release=resolve;}));const result=context.returnGate.request('/draw/');
 const fast=context.trackPending(Promise.reject(Error('engine write failure')));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(context.pendingWrites.has(fast),false,'native tracker already removed the failed write');
 release();assert.equal(await result,false);assert.deepEqual(navigated,[]);assert.deepEqual(errors,['failed']);
});
