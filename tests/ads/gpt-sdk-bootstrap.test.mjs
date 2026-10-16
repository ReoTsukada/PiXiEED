import test from 'node:test';
import assert from 'node:assert/strict';
import { createGptRewardedAdapter } from '../../js/ads/gpt-rewarded-adapter.mjs';

function environment() {
  const scripts = [], events = [], calls = [], timers = new Map(), listeners = new Map();
  let next = 0;
  const win = {};
  const doc = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, remove() { this.removed = true; } }),
    head: { append: script => scripts.push(script) }
  };
  const newAdapter = () => createGptRewardedAdapter({
    enabled: true, windowRef: win, documentRef: doc,
    emit: event => events.push(event),
    schedule: callback => { const id = ++next; timers.set(id, callback); return id; },
    cancelSchedule: id => timers.delete(id)
  });
  const slot = { addService() { return this; } };
  const service = {
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name)
  };
  function ready() {
    const queued = win.googletag.cmd;
    Object.assign(win.googletag, {
      apiReady: true,
      enums: { OutOfPageFormat: { REWARDED: 'rewarded' } },
      pubads: () => service,
      defineOutOfPageSlot: () => { calls.push('define'); return slot; },
      enableServices: () => calls.push('enable'),
      display: () => calls.push('display'),
      destroySlots: () => calls.push('destroy')
    });
    win.googletag.cmd = { push: callback => callback() };
    queued.forEach(callback => callback());
  }
  return { adapter: newAdapter(), newAdapter, win, scripts, events, calls, timers, ready, slot, listeners };
}

test('production GPT bootstrap waits for the API command queue after gpt.js has loaded', async () => {
  const h = environment();
  let settled = false;
  const pending = h.adapter.prepare().then(() => { settled = true; });
  assert.equal(h.scripts.length, 1);
  assert.equal(h.win.googletag.cmd.length, 1);
  h.scripts[0].onload?.();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(settled, false, 'script load alone does not fail or declare readiness');
  assert.deepEqual(h.calls, []);
  h.ready(); await pending;
  assert.deepEqual(h.calls, ['define', 'enable', 'display']);
  assert.equal(h.timers.size, 0);
  assert.equal(h.adapter.show(), false, 'SDK readiness is not an available rewarded slot');
  assert.deepEqual(h.events, []);
  h.adapter.destroy();
});

test('missing GPT command readiness times out, and a late queue cannot create a slot', async () => {
  const h = environment();
  const pending = h.adapter.prepare();
  const rejected = assert.rejects(pending, /タイムアウト/);
  h.scripts[0].onload?.();
  [...h.timers.values()][0]();
  await rejected;
  h.adapter.destroy();
  h.ready(); await Promise.resolve();
  assert.deepEqual(h.calls, []);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.events, []);
});

test('a script transport error still rejects without showing or granting', async () => {
  const h = environment();
  const pending = h.adapter.prepare();
  const rejected = assert.rejects(pending, /読み込めません/);
  h.scripts[0].onerror();
  await rejected;
  assert.equal(h.timers.size, 0);
  assert.equal(h.adapter.show(), false);
  assert.deepEqual(h.events, []);
  h.adapter.destroy();
});

test('an explicit retry after a transport failure loads a fresh SDK and can prepare a slot', async () => {
  const h = environment();
  const failed = h.adapter.prepare();
  const rejected = assert.rejects(failed, /読み込めません/);
  h.scripts[0].onerror();
  await rejected;
  assert.equal(h.scripts[0].removed, true);
  assert.equal(h.win.googletag, undefined);
  assert.equal(h.scripts.length, 1, 'failure does not retry automatically');
  h.adapter.destroy();
  const retry = h.newAdapter();
  const pending = retry.prepare();
  assert.equal(h.scripts.length, 2);
  h.ready(); await pending;
  assert.deepEqual(h.calls, ['define', 'enable', 'display']);
  assert.deepEqual(h.events, []);
  retry.destroy();
});

test('a timed-out SDK cannot create a competing loader on a manual retry', async () => {
  const h = environment();
  const failed = h.adapter.prepare();
  const rejected = assert.rejects(failed, /タイムアウト/);
  [...h.timers.values()][0](); await rejected;
  const ownedTag = h.win.googletag;
  h.adapter.destroy();
  const retry = h.newAdapter();
  await assert.rejects(retry.prepare(), /タイムアウト/);
  assert.equal(h.win.googletag, ownedTag);
  assert.equal(h.scripts.length, 1, 'a timed-out script might still execute late');
  assert.deepEqual(h.calls, []);
  retry.destroy();
});

test('transport failure never removes a foreign GPT global', async () => {
  const h = environment();
  const failed = h.adapter.prepare();
  const rejected = assert.rejects(failed, /読み込めません/);
  const foreignTag = { cmd: [] };
  h.win.googletag = foreignTag;
  h.scripts[0].onerror(); await rejected;
  assert.equal(h.win.googletag, foreignTag);
  assert.equal(h.scripts[0].removed, undefined);
  h.adapter.destroy();
});

test('after asynchronous SDK readiness, no-fill is matching-slot only and creates no receipt', async () => {
  const h = environment();
  const pending = h.adapter.prepare(); h.ready(); await pending;
  h.listeners.get('slotRenderEnded')({ slot: {}, isEmpty: true });
  assert.deepEqual(h.events, []);
  h.listeners.get('slotRenderEnded')({ slot: h.slot, isEmpty: true });
  assert.deepEqual(h.events, [{ type: 'noFill' }]);
  assert.equal(h.adapter.show(), false);
  h.adapter.destroy();
  assert.equal(h.listeners.size, 0);
});
