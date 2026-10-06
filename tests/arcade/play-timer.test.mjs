import test from 'node:test';
import assert from 'node:assert/strict';
import { createTimer } from '../../js/arcade.mjs';

function environment(run) {
  const keys = ['localStorage', 'document', 'addEventListener', 'setTimeout', 'clearTimeout', 'setInterval', 'performance'];
  const original = new Map(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  const data = new Map([['play:same', '54000'], ['project', 'keep']]), listeners = new EventTarget();
  const state = { now: 0, reads: 0, writes: 0, persistenceListeners: 0, intervals: 0 };
  const document = new EventTarget(); document.hidden = false;
  const values = {
    localStorage: { getItem(k) { state.reads++; return data.get(k); }, setItem(k, v) { state.writes++; data.set(k, v); } },
    document, addEventListener(...args) { state.persistenceListeners++; listeners.addEventListener(...args); },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { state.intervals++; return 2; },
    performance: { now: () => state.now }
  };
  try {
    for (const [k, value] of Object.entries(values)) Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
    run({ state, data, listeners, document });
  } finally {
    for (const [k, descriptor] of original) if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  }
}

test('default timer preserves saved time for jigsaw and existing consumers', () => environment(({ state, data, listeners }) => {
  const timer = createTimer(() => {}, 'play:'); timer.use('same'); assert.equal(timer.elapsed(), 54000);
  timer.start(); state.now = 750; timer.stop(); assert.equal(timer.elapsed(), 54750);
  assert.equal(data.get('play:same'), '54750'); assert.equal(state.intervals, 1); assert.equal(state.persistenceListeners, 1);
  listeners.dispatchEvent(new Event('pagehide')); assert.ok(state.writes > 0);
  timer.use('other'); assert.equal(timer.elapsed(), 0); timer.use('same'); assert.equal(timer.elapsed(), 54750);
  assert.equal(data.get('project'), 'keep');
}));

test('fresh puzzle timer ignores old saved play and never changes stored projects or preferences', () => environment(({ state, data, listeners, document }) => {
  const ticks = [], timer = createTimer(ms => ticks.push(ms), 'play:', { persist: false });
  timer.use('same'); assert.equal(timer.elapsed(), 0); timer.start(); state.now = 1750; timer.stop(); assert.equal(timer.elapsed(), 1750);
  timer.use('new-run'); assert.equal(timer.elapsed(), 0); timer.start(); state.now = 2000; timer.stop(); assert.equal(timer.elapsed(), 250);
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); listeners.dispatchEvent(new Event('pagehide'));
  assert.equal(state.reads, 0); assert.equal(state.writes, 0); assert.equal(state.intervals, 0); assert.equal(state.persistenceListeners, 0);
  assert.deepEqual([...data], [['play:same', '54000'], ['project', 'keep']]);
  assert.ok(ticks.includes(0));
}));
