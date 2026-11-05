import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createConversionRecoveryStore, createMemoryConversionRecoveryAdapter,
  createIndexedDbConversionRecoveryAdapter, ConversionRecoveryConflictError, ConversionRecoveryQuotaError,
} from '../../js/creation/conversion-recovery-store.mjs';

const adapter = () => createMemoryConversionRecoveryAdapter();
const makeStore = (storage = adapter()) => createConversionRecoveryStore(storage, { idFactory: (() => { let n=0; return () => `rev-${++n}`; })(), now: () => 1234 });

test('save/load preserves binary Blobs and typed arrays and returns detached snapshots', async () => {
  const store=makeStore(), blob=new Blob([new Uint8Array([0,255,7])],{type:'application/octet-stream'});
  const first=await store.save('workspace-1',{text:'草稿',blob,pixels:new Uint16Array([1,256,65535])});
  assert.equal(first.revision,'rev-1');assert.equal(first.updatedAt,1234);
  const loaded=await store.load('workspace-1');
  assert.deepEqual([...new Uint8Array(await loaded.snapshot.blob.arrayBuffer())],[0,255,7]);
  assert.deepEqual([...loaded.snapshot.pixels],[1,256,65535]);
  loaded.snapshot.text='mutated outside';
  assert.equal((await store.load('workspace-1')).snapshot.text,'草稿');
});

test('save captures a synchronous clone before the adapter can wait', async () => {
  let release; const gate=new Promise(resolve=>{release=resolve;}), memory=adapter();
  const delayed={load:id=>memory.load(id),async compareAndSwap(...args){await gate;return memory.compareAndSwap(...args);}};
  const store=makeStore(delayed), snapshot={nested:{text:'before'}};
  const saving=store.save('capture',snapshot);
  snapshot.nested.text='after'; release();
  assert.equal((await saving).snapshot.nested.text,'before');
  assert.equal((await store.load('capture')).snapshot.nested.text,'before');
});

test('CAS conflicts and cancellation preserve the prior record', async () => {
  const store=makeStore();
  const original=await store.save('cas',{text:'first'});
  await assert.rejects(store.save('cas',{text:'stale'},{expectedRevision:null}),ConversionRecoveryConflictError);
  assert.equal((await store.load('cas')).revision,original.revision);
  const abort=new AbortController();abort.abort();
  await assert.rejects(store.save('cas',{text:'cancelled'},{expectedRevision:original.revision,signal:abort.signal}),{name:'AbortError'});
  assert.equal((await store.load('cas')).snapshot.text,'first');
});

test('validation rejects cycles, unsupported instances, and oversized text before writes', async () => {
  const memory=adapter(),store=makeStore(memory);const cyc={};cyc.self=cyc;
  await assert.rejects(store.save('safe',cyc),/循環参照/);
  await assert.rejects(store.save('safe',{date:new Date()}),/プレーン/);
  await assert.rejects(store.save('safe',{text:'x'.repeat(32*1024*1024+1)}),/文章/);
  assert.equal(await store.load('safe'),null);
});

test('corrupt or unsupported stored schema is rejected without rewrite', async () => {
  let corrupt={schemaVersion:9,id:'broken',revision:'rev',updatedAt:1,snapshot:{text:'x'}};
  const custom={async load(){return structuredClone(corrupt);},async compareAndSwap(){throw Error('must not write');}};
  const store=makeStore(custom);
  await assert.rejects(store.load('broken'),/対応していないか、壊れています/);
  assert.equal(corrupt.schemaVersion,9);
});

class FakeIndexedDB {
  rows=new Map();hold=false;quota=false;pendingCommit=null;
  open(name,version){assert.equal(name,'pixieed-conversion-recovery-v1');assert.equal(version,1);const request={};queueMicrotask(()=>{request.result=new FakeDatabase(this);request.onupgradeneeded?.();request.onsuccess?.();});return request;}
}
class FakeDatabase {
  constructor(db){this.db=db;this.objectStoreNames={contains:name=>name==='workspaces'};}
  createObjectStore(name,options){assert.equal(name,'workspaces');assert.deepEqual(options,{keyPath:'id'});}
  close(){}
  transaction(_name,mode){return new FakeTransaction(this.db,mode);}
}
class FakeTransaction {
  constructor(db,mode){this.db=db;this.mode=mode;this.error=null;this.done=false;this.pending=mode==='readwrite'?new Map(db.rows):db.rows;}
  objectStore(){return {
    get:id=>{const request={};queueMicrotask(()=>{if(this.done)return;request.result=this.pending.get(id);request.onsuccess?.();if(this.mode==='readonly')queueMicrotask(()=>this.complete());});return request;},
    put:record=>{const request={};queueMicrotask(()=>{if(this.done)return;if(this.db.quota){this.db.quota=false;this.error=Object.assign(new Error('quota'),{name:'QuotaExceededError'});request.error=this.error;request.onerror?.();this.abort();return;}this.pending.set(record.id,record);request.onsuccess?.();if(this.db.hold)this.db.pendingCommit=()=>this.complete();else queueMicrotask(()=>this.complete());});return request;},
  };}
  abort(){if(this.done)return;this.done=true;this.error ||= new Error('aborted');queueMicrotask(()=>this.onabort?.());}
  complete(){if(this.done)return;this.done=true;if(this.mode==='readwrite')this.db.rows=this.pending;this.oncomplete?.();}
}

test('IndexedDB adapter resolves only on transaction commit, not put request success', async () => {
  const idb=new FakeIndexedDB(),store=createConversionRecoveryStore(createIndexedDbConversionRecoveryAdapter(idb),{idFactory:()=> 'rev-1',now:()=>3});
  idb.hold=true;let settled=false;
  const pending=store.save('indexed',{blob:new Blob(['data'])}).then(value=>{settled=true;return value;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(settled,false);assert.equal(idb.rows.has('indexed'),false);
  idb.pendingCommit();
  assert.equal((await pending).revision,'rev-1');
  assert.equal((await store.load('indexed')).snapshot.blob.size,4);
});

test('IndexedDB quota and transaction abort leave the old value intact', async () => {
  const idb=new FakeIndexedDB(),store=createConversionRecoveryStore(createIndexedDbConversionRecoveryAdapter(idb),{idFactory:(()=>{let n=0;return()=>`v${++n}`;})(),now:()=>4});
  const old=await store.save('indexed',{text:'old'});
  idb.quota=true;
  await assert.rejects(store.save('indexed',{text:'new'},{expectedRevision:old.revision}),ConversionRecoveryQuotaError);
  assert.equal((await store.load('indexed')).snapshot.text,'old');
});

test('IndexedDB CAS conflict aborts without replacing a committed row', async () => {
  const idb=new FakeIndexedDB(),store=createConversionRecoveryStore(createIndexedDbConversionRecoveryAdapter(idb),{idFactory:(()=>{let n=0;return()=>`r${++n}`;})(),now:()=>5});
  const first=await store.save('conflict',{text:'winner'});
  await assert.rejects(store.save('conflict',{text:'stale'},{expectedRevision:null}),ConversionRecoveryConflictError);
  assert.equal((await store.load('conflict')).revision,first.revision);
});

test('IndexedDB AbortSignal aborts an uncommitted write and preserves the previous row', async () => {
  const idb=new FakeIndexedDB(),store=createConversionRecoveryStore(createIndexedDbConversionRecoveryAdapter(idb),{idFactory:(()=>{let n=0;return()=>`r${++n}`;})(),now:()=>6});
  const first=await store.save('cancel',{text:'old'});
  idb.hold=true;const abort=new AbortController();
  const writing=store.save('cancel',{text:'new'},{expectedRevision:first.revision,signal:abort.signal});
  await new Promise(resolve=>setImmediate(resolve));abort.abort();
  await assert.rejects(writing,{name:'AbortError'});
  assert.equal((await store.load('cancel')).snapshot.text,'old');
});


test('optional undefined fields from native SVG/audio snapshots survive without JSON truncation', async () => {
  const store=makeStore(adapter());const record=await store.save('optional',{frame:{width:1,height:1,data:new Uint8Array([1,2,3,4]),xml:undefined}});
  assert.ok(Object.hasOwn(record.snapshot.frame,'xml'));assert.equal(record.snapshot.frame.xml,undefined);
  assert.deepEqual((await store.load('optional')).snapshot.frame.data,new Uint8Array([1,2,3,4]));
});
