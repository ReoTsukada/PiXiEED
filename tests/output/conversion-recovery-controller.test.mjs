import test from 'node:test';import assert from 'node:assert/strict';
import {createConversionRecoveryController,conversionRecoveryIdentity} from '../../js/creation/conversion-recovery-controller.mjs';
import{createConversionRecoveryStore,createMemoryConversionRecoveryAdapter}from'../../js/creation/conversion-recovery-store.mjs';
function fixture(extra={}){
 let revision=0,ids=0;const adapter=createMemoryConversionRecoveryAdapter(),store=createConversionRecoveryStore(adapter,{idFactory:()=>`rev-${++revision}`,now:()=>1});
 const live={text:'',states:[],applied:[],adopted:[],canSave:true},timers=new Map();let timer=0;
 const controller=createConversionRecoveryController({store,id:'workspace',capture:()=>({text:live.text}),apply:snapshot=>live.applied.push(snapshot),canSave:()=>live.canSave,onState:state=>live.states.push(state),idFactory:()=>`fork-${++ids}`,adoptId:id=>live.adopted.push(id),setTimer:fn=>{timers.set(++timer,fn);return timer;},clearTimer:id=>timers.delete(id),...extra});return{adapter,store,live,controller,timers};
}
test('reload applies committed text/Blob state, with no new save before edits',async()=>{
 const h=fixture();await h.controller.start();h.live.text='保存文章';h.controller.changed();assert.equal(await h.controller.flush(),true);assert.equal(h.controller.dirty,false);
 const applied=[];const restored=createConversionRecoveryController({store:h.store,id:'workspace',capture:()=>{throw Error('must not save empty initial state');},apply:value=>applied.push(value)});
 assert.equal(await restored.start(),true);assert.deepEqual(applied,[{text:'保存文章'}]);assert.equal(restored.snapshot().phase,'saved');restored.dispose();
});
test('typing while the read waits prevents overwrite; explicit fork preserves both versions',async()=>{
 let release;const old={revision:'saved-head',snapshot:{text:'previous'}};const rows=new Map([['workspace',old]]),adopted=[];let text='';
 const store={load:()=>new Promise(resolve=>{release=()=>resolve(old);}),save:async(id,snapshot)=>{const record={revision:'new-head',snapshot:structuredClone(snapshot)};rows.set(id,record);return record;}};
 const controller=createConversionRecoveryController({store,id:'workspace',capture:()=>({text}),apply:()=>{throw Error('must not apply');},idFactory:()=> 'separate',adoptId:id=>adopted.push(id),setTimer:()=>1,clearTimer:()=>{}});
 const loading=controller.start();text='new typing';controller.changed();release();assert.equal(await loading,false);assert.equal(controller.snapshot().blocked,true);
 assert.equal(await controller.fork(),true);assert.equal(rows.get('workspace').snapshot.text,'previous');assert.equal(rows.get('separate').snapshot.text,'new typing');assert.deepEqual(adopted,['separate']);controller.dispose();
});
test('edits made during a write stay dirty and are saved by a later CAS, never falsely labelled complete',async()=>{
 let release,started;const gate=new Promise(resolve=>{release=resolve;}),begun=new Promise(resolve=>{started=resolve;});const backing=createMemoryConversionRecoveryAdapter();let first=true;
 const store=createConversionRecoveryStore({load:backing.load,async compareAndSwap(...args){if(first){first=false;started();await gate;}return backing.compareAndSwap(...args);}},{idFactory:(()=>{let n=0;return()=>`r${++n}`;})(),now:()=>1});
 const h=fixture({store});await h.controller.start();h.live.text='first';h.controller.changed();const saving=h.controller.flush();await begun;h.live.text='second';h.controller.changed();release();await saving;
 assert.equal((await store.load('workspace')).snapshot.text,'first');assert.equal(h.controller.dirty,true);assert.equal(h.controller.snapshot().phase,'pending');await h.controller.flush();assert.equal((await store.load('workspace')).snapshot.text,'second');h.controller.dispose();
});
test('quota failure keeps edits and the previous committed row; no automatic destructive retry',async()=>{
 const h=fixture();await h.controller.start();h.live.text='old';h.controller.changed();await h.controller.flush();
 const failing={load:h.store.load,save:()=>Promise.reject(Object.assign(new Error('容量不足'),{name:'QuotaExceededError'}))};
 const other=fixture({store:failing});await other.controller.start();other.live.text='new';other.controller.changed();assert.equal(await other.controller.flush(),false);
 assert.equal(other.controller.snapshot().blocked,true);assert.equal(other.controller.dirty,true);assert.equal((await h.store.load('workspace')).snapshot.text,'old');other.controller.dispose();h.controller.dispose();
});
test('another tab winning CAS cannot be overwritten by a stale autosave',async()=>{
 const h=fixture();await h.controller.start();h.live.text='base';h.controller.changed();await h.controller.flush();const other=fixture({store:h.store});await other.controller.start();
 h.live.text='winner';h.controller.changed();await h.controller.flush();other.live.text='stale';other.controller.changed();assert.equal(await other.controller.flush(),false);assert.equal(other.controller.snapshot().phase,'conflict');assert.equal((await h.store.load('workspace')).snapshot.text,'winner');h.controller.dispose();other.controller.dispose();
});
test('cancelled transaction is reported unsaved and autosave stays paused',async()=>{
 let started;const begun=new Promise(resolve=>{started=resolve;});const h=fixture({store:{load:async()=>null,save:async(_id,_snapshot,{signal})=>{started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('cancelled'),{name:'AbortError'})),{once:true}));}}});
 await h.controller.start();h.live.text='unsaved';h.controller.changed();const saving=h.controller.flush();await begun;h.controller.cancel();assert.equal(await saving,false);assert.equal(h.controller.snapshot().paused,true);assert.equal(h.controller.dirty,true);h.controller.dispose();
});
test('a transaction already committed when cancel arrives is not falsely reported rolled back',async()=>{
 let release;const h=fixture({store:{load:async()=>null,save:()=>new Promise(resolve=>{release=()=>resolve({revision:'committed'});})}});await h.controller.start();h.live.text='landed';h.controller.changed();const saving=h.controller.flush();h.controller.cancel();release();assert.equal(await saving,true);assert.equal(h.controller.dirty,false);assert.match(h.controller.snapshot().message,/既に完了/);h.controller.dispose();
});
test('cancelling restore blocks a late read and leaves the saved row untouched',async()=>{
 let release,applies=0;const h=fixture({store:{load:()=>new Promise(resolve=>{release=resolve;})},apply:()=>{applies++;}});const pending=h.controller.start();h.controller.cancel();release({revision:'old',snapshot:{text:'old'}});assert.equal(await pending,false);assert.equal(applies,0);assert.equal(h.controller.snapshot().blocked,true);h.controller.dispose();
});
test('composition defers snapshot capture until the next committed input',async()=>{
 const h=fixture();await h.controller.start();h.live.canSave=false;h.live.text='未確定';h.controller.changed();assert.equal(await h.controller.flush(),false);assert.equal(await h.store.load('workspace'),null);h.live.canSave=true;h.live.text='確定';h.controller.changed();await h.controller.flush();assert.equal((await h.store.load('workspace')).snapshot.text,'確定');h.controller.dispose();
});
test('corrupt restore reports failure and never autosaves an empty replacement',async()=>{
 let writes=0;const h=fixture({store:{load:async()=>({revision:'old',snapshot:{}}),save:async()=>{writes++;}},apply:()=>{throw Error('invalid');}});assert.equal(await h.controller.start(),false);h.controller.changed();assert.equal(await h.controller.flush(),false);assert.equal(writes,0);assert.match(h.controller.snapshot().message,/保存版は消していません/);h.controller.dispose();
});
test('history identity keeps unrelated state and never includes file names in the URL',()=>{
 const calls=[],win={crypto:{randomUUID:()=> 'unique-local'},history:{state:{other:true},replaceState(state,_title,url){this.state=state;calls.push({state,url});}},location:{href:'https://example.test/output/work/?mode=convert'}};
 const identity=conversionRecoveryIdentity(win);assert.equal(identity.id,'unique-local');assert.equal(win.history.state.other,true);assert.equal(calls[0].url,win.location.href);assert.equal(conversionRecoveryIdentity(win).id,'unique-local');
});


test('a failed fork ID never throws out of the save UI or replaces the existing saved row',async()=>{
  const h=fixture({idFactory:()=>{throw Error('ID unavailable');}});await h.controller.start();h.live.text='draft';h.controller.changed();assert.equal(await h.controller.fork(),false);assert.equal(h.controller.snapshot().phase,'error');assert.match(h.controller.snapshot().message,/ID unavailable/);assert.equal(await h.store.load('workspace'),null);h.controller.dispose();
});
test('manual retry after a transient save failure uses the known head instead of silently forking',async()=>{
  const backing=createMemoryConversionRecoveryAdapter();let fail=true;const store=createConversionRecoveryStore({load:backing.load,compareAndSwap(...args){if(fail)throw Error('temporary');return backing.compareAndSwap(...args);}},{idFactory:()=> 'saved',now:()=>1});
  const h=fixture({store});await h.controller.start();h.live.text='retry me';h.controller.changed();assert.equal(await h.controller.flush(),false);fail=false;assert.equal(await h.controller.resume(),true);assert.equal(h.controller.snapshot().id,'workspace');assert.equal((await store.load('workspace')).snapshot.text,'retry me');h.controller.dispose();
});


test('a failed protected fork retries only a new key and never overwrites the un-restored original',async()=>{
  let release,fail=true;const writes=[],rows=new Map([['workspace',{revision:'protected',snapshot:{text:'original saved work'}}]]);let counter=0;
  const store={load:()=>new Promise(resolve=>{release=()=>resolve(rows.get('workspace'));}),async save(id,snapshot,options){writes.push({id,head:options.expectedRevision});if(fail)throw Error('quota');const record={revision:'new',snapshot};rows.set(id,record);return record;}};
  const h=fixture({store,idFactory:()=>`new-${++counter}`});const loading=h.controller.start();h.live.text='new unsaved work';h.controller.changed();release();await loading;
  assert.equal(await h.controller.fork(),false);assert.equal(h.controller.snapshot().phase,'error');assert.equal(h.controller.snapshot().mustFork,true);
  fail=false;assert.equal(await h.controller.resume(),true);assert.equal(rows.get('workspace').snapshot.text,'original saved work');assert.deepEqual(writes.map(write=>write.head),[null,null]);assert.ok(writes.every(write=>write.id!=='workspace'));h.controller.dispose();
});


test('fork identity keeps earlier local-only IDs reachable without changing the request URL',()=>{
  const win={crypto:{randomUUID:()=> 'first'},history:{state:{},replaceState(state,_title,url){assert.equal(url,'https://example.test/output/work/');this.state=state;}},location:{href:'https://example.test/output/work/'}};
  const identity=conversionRecoveryIdentity(win);identity.adopt('second');assert.deepEqual(identity.previous(),['first']);identity.adopt('first');assert.deepEqual(identity.previous(),['second']);assert.equal(win.history.state.pixieedConversionRecovery,'first');
});
test('a persisted autosave pause still restores the prior snapshot but does not silently resume writes',async()=>{
  const h=fixture({initiallyPaused:true});await h.controller.start();h.live.text='paused change';h.controller.changed();assert.equal(await h.controller.flush(),false);assert.equal(await h.store.load('workspace'),null);assert.equal(h.controller.snapshot().paused,true);h.controller.dispose();
});
