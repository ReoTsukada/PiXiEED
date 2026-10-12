import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGptAdapter, GPT_SCRIPT_URL, LIVE_DELIVERY_ENABLED, REWARDED_AD_UNIT
} from '../../admanager-rewarded-test/gpt-adapter.mjs';

function fakeClock() {
  let nextId = 0;
  const timers = new Map();
  return {
    schedule(fn, delay) { const id = ++nextId; timers.set(id, { fn, delay }); return id; },
    cancel(id) { timers.delete(id); },
    run(id) { const timer = timers.get(id); if (!timer) return false; timers.delete(id); timer.fn(); return true; },
    get size() { return timers.size; },
    firstId() { return timers.keys().next().value; }
  };
}

function environment({ foreignGlobal = false, foreignScript = false } = {}) {
  const clock = fakeClock();
  const scripts = [];
  const win = foreignGlobal ? { googletag: { foreign: true } } : {};
  const doc = {
    head: { append(script) { scripts.push(script); } },
    createElement(tag) {
      assert.equal(tag, 'script');
      return { dataset: {}, async: false, crossOrigin: '', src: '', onload: null, onerror: null };
    },
    querySelector(selector) {
      assert.match(selector, /securepubads\.g\.doubleclick\.net/);
      return foreignScript ? {} : null;
    }
  };
  return { win, doc, scripts, clock };
}

function installFakeSdk(env, { slotAvailable = true, enumAvailable = true } = {}) {
  const calls = [];
  const listeners = new Map();
  const slots = [];
  const pubads = {
    addEventListener(name, listener) {
      calls.push(['listen', name]);
      const group = listeners.get(name) || new Set(); group.add(listener); listeners.set(name, group);
    },
    removeEventListener(name, listener) {
      calls.push(['unlisten', name]);
      listeners.get(name)?.delete(listener);
    },
    dispatch(name, event = {}) {
      for (const listener of [...(listeners.get(name) || [])]) listener(event);
    },
    count(name) { return listeners.get(name)?.size || 0; },
    totalListeners() { return [...listeners.values()].reduce((sum, group) => sum + group.size, 0); }
  };
  const tag = {
    apiReady: true,
    cmd: { push(fn) { calls.push(['command']); fn(); return 1; } },
    enums: enumAvailable ? { OutOfPageFormat: { REWARDED: 'REWARDED' } } : { OutOfPageFormat: {} },
    pubads() { return pubads; },
    defineOutOfPageSlot(path, format) {
      calls.push(['define', path, format]);
      const slot = slotAvailable ? { addService(service) { calls.push(['addService', service]); return this; } } : null;
      slots.push(slot);
      return slot;
    },
    enableServices() { calls.push(['enableServices']); },
    display(value) { calls.push(['display', value]); },
    destroySlots(slots) { calls.push(['destroySlots', slots]); return true; }
  };
  env.win.googletag = tag;
  env.tag = tag; env.pubads = pubads; env.getSlot = () => slots.at(-1); env.calls = calls;
  return env;
}

async function boot(adapter, env, options) {
  const pending = adapter.prepare();
  await Promise.resolve();
  assert.equal(env.scripts.length, 1, 'GPT loader is inserted once');
  const script = env.scripts[0];
  assert.equal(script.src, GPT_SCRIPT_URL);
  assert.equal(script.async, true);
  assert.equal(script.crossOrigin, 'anonymous');
  const sdk = installFakeSdk(env, options);
  script.onload();
  await pending;
  return sdk;
}

function adapterFor(env, emit = event => env.events.push(event), overrides = {}) {
  env.events ||= [];
  return createGptAdapter({
    emit, enabled: true, optIn: true,
    windowRef: env.win, documentRef: env.doc,
    timeoutMs: 50, schedule: env.clock.schedule, cancelSchedule: env.clock.cancel,
    ...overrides
  });
}

test('live delivery remains hard-disabled by default and disabled/without opt-in has no SDK side effects', async () => {
  assert.equal(LIVE_DELIVERY_ENABLED, false);
  assert.equal(REWARDED_AD_UNIT, '/23379831154/pixieed_rewarded');
  assert.match(GPT_SCRIPT_URL, /^https:\/\/securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js$/);
  for (const options of [{}, { enabled: true, optIn: false }]) {
    const env = environment();
    const adapter = createGptAdapter({ ...options, windowRef: env.win, documentRef: env.doc });
    await assert.rejects(adapter.prepare());
    assert.equal(env.win.googletag, undefined);
    assert.equal(env.scripts.length, 0);
  }
});

test('existing GPT globals and loader tags are rejected without making GPT calls', async () => {
  for (const env of [environment({ foreignGlobal: true }), environment({ foreignScript: true })]) {
    const original = env.win.googletag;
    const adapter = adapterFor(env);
    await assert.rejects(adapter.prepare(), /GPT/);
    assert.equal(env.win.googletag, original);
    assert.equal(env.scripts.length, 0);
  }
});

test('script error, invalid API load, and loader timeout fail closed', async () => {
  {
    const env = environment(); const adapter = adapterFor(env);
    const pending = adapter.prepare(); await Promise.resolve();
    env.scripts[0].onerror();
    await assert.rejects(pending, /読み込めませんでした/);
    assert.equal(env.clock.size, 0);
  }
  {
    const env = environment(); const adapter = adapterFor(env);
    const pending = adapter.prepare(); await Promise.resolve();
    env.win.googletag.apiReady = false;
    env.scripts[0].onload();
    await assert.rejects(pending, /APIを利用できません/);
  }
  {
    const env = environment(); const adapter = adapterFor(env);
    const pending = adapter.prepare(); await Promise.resolve();
    env.clock.run(env.clock.firstId());
    await assert.rejects(pending, /タイムアウト/);
    assert.equal(env.scripts[0].onload, null, 'late onload is detached after timeout');
  }
});

test('manual retry after a loader failure requires reload and never inserts a competing SDK', async () => {
  for (const outcome of ['error', 'invalid-api', 'timeout']) {
    const env = environment(); const first = adapterFor(env);
    const pending = first.prepare(); await Promise.resolve();
    if (outcome === 'error') env.scripts[0].onerror();
    else if (outcome === 'invalid-api') env.scripts[0].onload();
    else env.clock.run(env.clock.firstId());
    await assert.rejects(pending, /再読み込み/);
    first.destroy();
    const retry = adapterFor(env);
    await assert.rejects(retry.prepare(), /再読み込み/);
    assert.equal(env.scripts.length, 1);
    assert.equal(env.events.length, 0);
    assert.equal(env.clock.size, 0);
    retry.destroy();
  }
});

test('one GPT loader is shared across attempts and enableServices runs only once', async () => {
  const env = environment(); const firstEvents = []; const secondEvents = [];
  const first = adapterFor(env, event => firstEvents.push(event));
  const firstPending = first.prepare(); await Promise.resolve();
  const second = adapterFor(env, event => secondEvents.push(event));
  const secondPending = second.prepare(); await Promise.resolve();
  assert.equal(env.scripts.length, 1);
  const sdk = installFakeSdk(env);
  env.scripts[0].onload();
  await Promise.all([firstPending, secondPending]);
  assert.equal(sdk.calls.filter(([name]) => name === 'enableServices').length, 1);
  assert.equal(sdk.calls.filter(([name]) => name === 'display').length, 2);
  first.destroy(); second.destroy();

  const retry = adapterFor(env);
  await retry.prepare();
  assert.equal(env.scripts.length, 1, 'manual retry reuses the same page-local SDK');
  assert.equal(sdk.calls.filter(([name]) => name === 'enableServices').length, 1);
  assert.equal(sdk.calls.filter(([name]) => name === 'display').length, 3);
  retry.destroy();
});

test('unsupported format and null slot are distinguished from a no-fill response', async () => {
  for (const sdkOptions of [{ enumAvailable: false }, { slotAvailable: false }]) {
    const env = environment(); const adapter = adapterFor(env);
    await boot(adapter, env, sdkOptions);
    assert.deepEqual(env.events.map(event => event.type), ['unsupported']);
    assert.equal(env.calls.some(([name]) => name === 'display'), false);
    adapter.destroy();
  }
});

test('listeners are installed before enable/display; readiness is not an implicit user opt-in', async () => {
  const env = environment(); const adapter = adapterFor(env);
  const sdk = await boot(adapter, env);
  const lastListener = Math.max(...sdk.calls.map((entry, index) => entry[0] === 'listen' ? index : -1));
  const enabledAt = sdk.calls.findIndex(([name]) => name === 'enableServices');
  const displayedAt = sdk.calls.findIndex(([name]) => name === 'display');
  assert.ok(lastListener >= 0 && lastListener < enabledAt && enabledAt < displayedAt);
  let visibleCalls = 0;
  sdk.pubads.dispatch('rewardedSlotReady', { slot: env.getSlot(), makeRewardedVisible() { visibleCalls++; return true; } });
  assert.deepEqual(env.events.map(event => event.type), ['ready']);
  assert.equal(visibleCalls, 0, 'ready does not show an ad without the explicit user action');
  assert.equal(adapter.show(), true);
  assert.equal(visibleCalls, 1);
  adapter.destroy();
});

test('show forwards a false visibility result and does not consume or grant anything', async () => {
  const env = environment(); const adapter = adapterFor(env);
  const sdk = await boot(adapter, env);
  sdk.pubads.dispatch('rewardedSlotReady', { slot: env.getSlot(), makeRewardedVisible() { return false; } });
  assert.equal(adapter.show(), false);
  assert.deepEqual(env.events.map(event => event.type), ['ready']);
  assert.equal(sdk.calls.some(([name]) => name === 'destroySlots'), false);
  adapter.destroy();
});

test('matching no-fill only, ignores other slots and nonempty render events', async () => {
  const env = environment(); const adapter = adapterFor(env);
  const sdk = await boot(adapter, env);
  sdk.pubads.dispatch('slotRenderEnded', { slot: {}, isEmpty: true });
  sdk.pubads.dispatch('slotRenderEnded', { slot: env.getSlot(), isEmpty: false });
  assert.deepEqual(env.events, []);
  sdk.pubads.dispatch('slotRenderEnded', { slot: env.getSlot(), isEmpty: true });
  assert.deepEqual(env.events.map(event => event.type), ['noFill']);
  adapter.destroy();
});

test('matching close destroys the slot once but keeps the receipt listener for a post-close grant', async () => {
  const env = environment(); const adapter = adapterFor(env);
  const sdk = await boot(adapter, env);
  sdk.pubads.dispatch('rewardedSlotReady', { slot: env.getSlot(), makeRewardedVisible() { return true; } });
  assert.equal(adapter.show(), true);
  sdk.pubads.dispatch('rewardedSlotClosed', { slot: {} });
  assert.equal(sdk.calls.filter(([name]) => name === 'destroySlots').length, 0, 'foreign slot is ignored');
  sdk.pubads.dispatch('rewardedSlotClosed', { slot: env.getSlot() });
  sdk.pubads.dispatch('rewardedSlotClosed', { slot: env.getSlot() });
  assert.equal(sdk.calls.filter(([name]) => name === 'destroySlots').length, 1);
  assert.equal(sdk.pubads.count('rewardedSlotGranted'), 1, 'close retains current receipt listener');
  sdk.pubads.dispatch('rewardedSlotGranted', { slot: env.getSlot(), payload: { amount: 1, type: 'demo' } });
  assert.deepEqual(env.events.map(event => event.type), ['ready', 'closed', 'closed', 'granted']);
  assert.deepEqual(env.events.at(-1).payload, { amount: 1, type: 'demo' });
  adapter.destroy();
});

test('video completion is diagnostic, not a grant; foreign slots do not affect the current attempt', async () => {
  const env = environment(); const adapter = adapterFor(env);
  const sdk = await boot(adapter, env);
  sdk.pubads.dispatch('rewardedSlotReady', { slot: env.getSlot(), makeRewardedVisible() { return true; } });
  adapter.show();
  sdk.pubads.dispatch('rewardedSlotVideoCompleted', { slot: {} });
  sdk.pubads.dispatch('rewardedSlotVideoCompleted', { slot: env.getSlot() });
  assert.deepEqual(env.events.map(event => event.type), ['ready', 'videoCompleted']);
  adapter.destroy();
});

test('destroy removes all listeners and ignores later callbacks; a later attempt cannot use stale receipts', async () => {
  const env = environment(); const firstEvents = [];
  const first = adapterFor(env, event => firstEvents.push(event));
  const sdk = await boot(first, env);
  sdk.pubads.dispatch('rewardedSlotReady', { slot: env.getSlot(), makeRewardedVisible() { return true; } });
  first.show();
  const oldSlot = env.getSlot();
  first.destroy();
  assert.equal(sdk.pubads.totalListeners(), 0);
  sdk.pubads.dispatch('rewardedSlotGranted', { slot: oldSlot, payload: { amount: 1 } });
  assert.deepEqual(firstEvents.map(event => event.type), ['ready']);

  const retryEvents = []; const retry = adapterFor(env, event => retryEvents.push(event));
  await retry.prepare();
  assert.equal(env.scripts.length, 1, 'retry does not add another SDK script');
  assert.equal(sdk.calls.filter(([name]) => name === 'enableServices').length, 1);
  const newSlot = env.getSlot();
  sdk.pubads.dispatch('rewardedSlotGranted', { slot: oldSlot, payload: { amount: 1 } });
  assert.equal(retryEvents.some(event => event.type === 'granted'), false);
  sdk.pubads.dispatch('rewardedSlotReady', { slot: newSlot, makeRewardedVisible() { return true; } });
  assert.deepEqual(retryEvents.map(event => event.type), ['ready']);
  retry.destroy();
});

test('disposing while GPT is still loading prevents queued slot work after the SDK resolves', async () => {
  const env = environment(); const adapter = adapterFor(env);
  const pending = adapter.prepare(); await Promise.resolve();
  adapter.destroy();
  const sdk = installFakeSdk(env);
  env.scripts[0].onload();
  await pending;
  assert.equal(sdk.calls.some(([name]) => name === 'define'), false);
  assert.equal(sdk.calls.some(([name]) => name === 'enableServices'), false);
  assert.equal(sdk.calls.some(([name]) => name === 'display'), false);
});
