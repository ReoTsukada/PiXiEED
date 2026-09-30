import test from 'node:test';
import assert from 'node:assert/strict';

const events = new Map();
const scripts = [];
const listeners = new Map();
const script = {
  addEventListener(name, callback) { listeners.set(name, callback); }
};
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.window = {
  setTimeout, clearTimeout, addEventListener() {}
};
globalThis.document = {
  readyState: 'loading', head: { appendChild(node) { scripts.push(node); } },
  querySelector() { return null; }, getElementById() { return null; },
  createElement() { return script; }, querySelectorAll() { return []; },
  addEventListener() {}
};
const pass = await import('../../js/pixieed-pass.mjs?rewarded-loader-test');

test('GPT is loaded only when requested, ready shows the slot, and grant cleans up', async () => {
  delete globalThis.googletag;
  assert.equal(scripts.length, 0);
  const resultPromise = pass.showRewardedAd({ timeoutMs: 500 });
  assert.equal(scripts.length, 1);
  assert.equal(script.src, 'https://securepubads.g.doubleclick.net/tag/js/gpt.js');
  assert.equal(script.async, true);

  const slot = { addService() {} };
  const pubads = {
    addEventListener(name, callback) { events.set(name, callback); },
    removeEventListener(name, callback) { if (events.get(name) === callback) events.delete(name); }
  };
  let shown = 0; let destroyed = 0;
  globalThis.googletag = {
    apiReady: true,
    enums: { OutOfPageFormat: { REWARDED: 'REWARDED' } },
    pubads: () => pubads, defineOutOfPageSlot(path, format) {
      assert.equal(path, '/23379831154/pixieed_rewarded'); assert.equal(format, 'REWARDED'); return slot;
    },
    enableServices() {}, display(target) { assert.equal(target, slot); },
    destroySlots(targets) { assert.deepEqual(targets, [slot]); destroyed++; }
  };
  listeners.get('load')();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(events.get('rewardedSlotReady')({ slot, makeRewardedVisible() { shown++; } }), undefined);
  assert.equal(shown, 1);
  assert.equal(events.get('rewardedSlotGranted')({ slot }), undefined);
  let settled = false;
  resultPromise.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'the granted slot remains alive until its close event');
  assert.equal(events.get('rewardedSlotClosed')({ slot }), undefined);
  assert.equal(await resultPromise, 'granted');
  assert.equal(events.size, 0);
  assert.equal(destroyed, 1);
});
