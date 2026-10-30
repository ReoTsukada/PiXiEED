import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewQueue } from '../js/creation/text-live-preview.mjs';
function clock() {
  let time = 0, id = 0; const jobs = new Map();
  return { setTimeout(fn, ms) { jobs.set(++id,{fn, at:time+ms}); return id; }, clearTimeout(id) { jobs.delete(id); }, advance(ms=1000) { time+=ms; for (const [id,job] of [...jobs]) if(job.at<=time){jobs.delete(id);job.fn();} }, get size(){return jobs.size;} };
}
const settle = async () => { for(let i=0;i<8;i++) await Promise.resolve(); };
function setup(render=async()=>{}) {
  const timers=clock(), states=[]; let active=true, source=true;
  const q=createPreviewQueue({active:()=>active,hasSource:()=>source,render,onState:(state,error)=>states.push({state,error}),timers});
  return {q,timers,states,setActive:v=>active=v,setSource:v=>source=v};
}
test('rapid changes debounce to one latest render',async()=>{let calls=0;const x=setup(async()=>calls++);for(let i=0;i<20;i++)x.q.request();assert.equal(x.timers.size,1);x.timers.advance();await settle();assert.equal(calls,1);assert.equal(x.q.state,'ready');});
test('new revision aborts in-flight work and prevents stale ready state',async()=>{const tasks=[];const x=setup(signal=>new Promise(resolve=>tasks.push({signal,resolve})));x.q.request();x.timers.advance();assert.equal(x.q.state,'rendering');x.q.request();assert.equal(tasks[0].signal.aborted,true);tasks[0].resolve();await settle();assert.equal(x.q.state,'queued');x.timers.advance();tasks[1].resolve();await settle();assert.equal(x.q.state,'ready');});
test('cancellation stays paused and never schedules a save',async()=>{let signal,resolve;const x=setup(s=>{signal=s;return new Promise(r=>resolve=r);});x.q.request();x.timers.advance();x.q.pause();assert.equal(signal.aborted,true);resolve();await settle();assert.equal(x.q.state,'paused');assert.equal(x.timers.size,0);});
test('automatic off requires an explicit refresh',async()=>{let calls=0;const x=setup(async()=>calls++);x.q.setAutomatic(false);x.q.request();x.timers.advance();assert.equal(calls,0);x.q.request({force:true,immediate:true});x.timers.advance(0);await settle();assert.equal(calls,1);assert.equal(x.q.state,'ready');});
test('no file produces empty state without invoking the engine',async()=>{let calls=0;const x=setup(async()=>calls++);x.setSource(false);x.q.request();x.timers.advance();await settle();assert.equal(x.q.state,'empty');assert.equal(calls,0);});
test('leaving text mode aborts work and cannot overwrite the next mode',async()=>{let finish,signal;const x=setup(s=>{signal=s;return new Promise(r=>finish=r);});x.q.request();x.timers.advance();x.setActive(false);x.q.request();finish();await settle();assert.equal(signal.aborted,true);assert.equal(x.q.state,'inactive');});
test('IME composition waits for confirmed characters',async()=>{let calls=0;const x=setup(async()=>calls++);x.q.setComposing(true);for(let i=0;i<10;i++)x.q.request();x.timers.advance();assert.equal(calls,0);x.q.setComposing(false);x.timers.advance();await settle();assert.equal(calls,1);});
test('errors are visible and explicit retry recovers',async()=>{let fail=true;const x=setup(async()=>{if(fail)throw new Error('bad file');});x.q.request();x.timers.advance();await settle();assert.equal(x.q.state,'error');assert.equal(x.states.at(-1).error.message,'bad file');fail=false;x.q.request({force:true});x.timers.advance();await settle();assert.equal(x.q.state,'ready');});
test('destroy clears timers and blocks late completion',async()=>{let finish,signal;const x=setup(s=>{signal=s;return new Promise(r=>finish=r);});x.q.request();x.timers.advance();x.q.destroy();assert.equal(signal.aborted,true);finish();await settle();assert.notEqual(x.q.state,'ready');x.q.request();assert.equal(x.timers.size,0);});
test('superseded errors cannot replace a newer preview',async()=>{let rejectOld,calls=0;const x=setup(()=>++calls===1?new Promise((r,j)=>rejectOld=j):Promise.resolve());x.q.request();x.timers.advance();x.q.request();x.timers.advance();await settle();assert.equal(x.q.state,'ready');rejectOld(new Error('obsolete'));await settle();assert.equal(x.q.state,'ready');});
