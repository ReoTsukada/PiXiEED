import test from 'node:test';
import assert from 'node:assert/strict';
import { createRewardedController } from '../../admanager-rewarded-test/controller.mjs';
import { createMockAdapter } from '../../admanager-rewarded-test/mock-adapter.mjs';

function fakeClock() {
  let now = 0, id = 0;
  const tasks = new Map();
  return {
    schedule(fn, delay = 0) { const key = ++id; tasks.set(key, { at: now + delay, fn }); return key; },
    cancel(key) { tasks.delete(key); },
    advance(ms) {
      const end = now + ms;
      while (true) {
        const due = [...tasks].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at; tasks.delete(due[0]); due[1].fn();
      }
      now = end;
    },
    get pending() { return tasks.size; }
  };
}

function harness({ scenario = 'normal', timeoutMs = 100, displayTimeoutMs = 0, delayMs = 5, adapterFactory } = {}) {
  const clock = fakeClock(), adapters = [], changes = [];
  const createAdapter = adapterFactory || (options => {
    const adapter = createMockAdapter({ ...options, scenario, delayMs, schedule: clock.schedule, cancelSchedule: clock.cancel });
    adapters.push(adapter);
    return adapter;
  });
  const controller = createRewardedController({ createAdapter, timeoutMs, displayTimeoutMs, schedule: clock.schedule, cancelSchedule: clock.cancel, onChange: state => changes.push(state) });
  return { clock, adapters, changes, controller };
}

test('readiness, explicit opt-in and a current post-close grant control rewards', async () => {
  const h = harness();
  assert.equal(await h.controller.prepare(), true);
  assert.equal(h.controller.state.phase, 'loading');
  assert.equal(await h.controller.prepare(), false, 'concurrent prepare is ignored');
  assert.equal(h.controller.show({ optIn: true }), false, 'show is blocked before ready');
  h.clock.advance(5);
  assert.equal(h.controller.state.phase, 'ready');
  assert.equal(h.controller.show(), false, 'show requires opt-in');
  assert.equal(h.controller.show({ optIn: true }), true);
  assert.equal(h.controller.state.phase, 'showing');
  assert.equal(h.controller.show({ optIn: true }), false, 'a second show cannot start');

  const adapter = h.adapters[0];
  assert.equal(adapter.fire('videoCompleted'), true);
  assert.equal(h.controller.state.rewarded, false, 'video completion is diagnostic only');
  assert.equal(adapter.fire('closed'), true);
  assert.equal(h.controller.state.phase, 'closed');
  assert.equal(adapter.fire('granted'), true, 'a grant after close remains valid for this attempt');
  assert.equal(adapter.fire('granted'), true, 'duplicate event reaches the controller but cannot duplicate the reward');
  assert.equal(h.controller.state.rewarded, true);
  assert.equal(h.controller.state.totalRewards, 1);

  assert.equal(await h.controller.prepare(), true, 'manual retry starts a fresh attempt');
  assert.equal(adapter.fire('granted'), false, 'destroyed mock adapters cannot emit old callbacks');
  h.clock.advance(5);
  assert.equal(h.controller.show({ optIn: true }), true);
  h.adapters[1].fire('granted');
  assert.equal(h.controller.state.phase, 'granted');
  h.adapters[1].fire('closed');
  assert.equal(h.controller.state.phase, 'closed');
  assert.equal(h.controller.state.totalRewards, 2);
});

test('synchronous grant is queued until show acceptance and rejected if show returns false', async () => {
  let emit, destroyed = 0;
  const h = harness({ adapterFactory: options => {
    emit = options.emit;
    return { prepare() { emit({ type: 'ready' }); }, show() { emit({ type: 'granted' }); return false; }, close() {}, destroy() { destroyed++; } };
  } });
  await h.controller.prepare();
  assert.equal(h.controller.state.phase, 'ready');
  assert.equal(h.controller.show({ optIn: true }), false);
  assert.equal(h.controller.state.phase, 'error');
  assert.equal(h.controller.state.rewarded, false);
  assert.equal(h.controller.state.totalRewards, 0);
  assert.equal(destroyed, 1);
  emit({ type: 'granted' });
  assert.equal(h.controller.state.totalRewards, 0);
});

test('no-fill, unsupported and SDK errors are terminal until a manual retry', async () => {
  for (const [scenario, phase] of [['no-fill', 'no-fill'], ['unsupported', 'unsupported'], ['sdk-error', 'error']]) {
    const h = harness({ scenario });
    await h.controller.prepare();
    h.clock.advance(5);
    assert.equal(h.controller.state.phase, phase);
    assert.equal(h.adapters[0].destroyed, true);
    assert.equal(h.controller.show({ optIn: true }), false);
    assert.equal(await h.controller.prepare(), true);
    assert.equal(h.controller.state.id, 2);
  }
});

test('loading timeout destroys the adapter and ignores late readiness; retry uses a new attempt', async () => {
  const clock = fakeClock(), adapters = [];
  const controller = createRewardedController({
    timeoutMs: 20, schedule: clock.schedule, cancelSchedule: clock.cancel,
    createAdapter: options => {
      const adapter = createMockAdapter({ ...options, scenario: adapters.length ? 'normal' : 'timeout', delayMs: 5, schedule: clock.schedule, cancelSchedule: clock.cancel });
      adapters.push(adapter); return adapter;
    }
  });
  await controller.prepare();
  const old = adapters[0];
  clock.advance(20);
  assert.equal(controller.state.phase, 'error');
  assert.equal(old.destroyed, true);
  assert.equal(old.fire('ready'), false);
  assert.equal(await controller.prepare(), true);
  clock.advance(5);
  assert.equal(controller.state.phase, 'ready');
});

test('optional display timeout grants no reward and invalidates later callbacks', async () => {
  const h = harness({ displayTimeoutMs: 20 });
  await h.controller.prepare(); h.clock.advance(5);
  assert.equal(h.controller.show({ optIn: true }), true);
  const current = h.adapters[0];
  h.clock.advance(20);
  assert.equal(h.controller.state.phase, 'error');
  assert.equal(current.destroyed, true);
  assert.equal(current.fire('granted'), false);
  assert.equal(h.controller.state.totalRewards, 0);
});

test('display has no default deadline, and synchronous accepted grant and close are processed in order', async () => {
  let emit;
  const h = harness({ adapterFactory: options => {
    emit = options.emit;
    return {
      prepare() { emit({ type: 'ready' }); },
      show() { emit({ type: 'granted' }); emit({ type: 'closed' }); return true; },
      close() {}, destroy() {}
    };
  } });
  await h.controller.prepare();
  assert.equal(h.controller.show({ optIn: true }), true);
  assert.equal(h.clock.pending, 0, 'showing is not given an arbitrary default deadline');
  assert.equal(h.controller.state.phase, 'closed');
  assert.equal(h.controller.state.rewarded, true);
  assert.equal(h.controller.state.totalRewards, 1);
});

test('a captured callback from a closed attempt cannot grant after a manual retry', async () => {
  const emitters = [], adapters = [];
  const h = harness({ adapterFactory: options => {
    emitters.push(options.emit);
    const adapter = { prepare() { options.emit({ type: 'ready' }); }, show() { return true; }, close() {}, destroy() {} };
    adapters.push(adapter); return adapter;
  } });
  await h.controller.prepare();
  h.controller.show({ optIn: true });
  emitters[0]({ type: 'closed' });
  assert.equal(h.controller.state.phase, 'closed');
  await h.controller.prepare();
  emitters[0]({ type: 'granted' });
  assert.equal(h.controller.state.totalRewards, 0);
  emitters[1]({ type: 'ready' });
  h.controller.show({ optIn: true });
  emitters[1]({ type: 'granted' });
  assert.equal(h.controller.state.totalRewards, 1);
});

test('showing SDK errors and user cancellation clean up without creating rewards', async () => {
  for (const finish of ['error', 'cancel']) {
    let emit, destroyed = 0;
    const h = harness({ adapterFactory: options => {
      emit = options.emit;
      return { prepare() { emit({ type: 'ready' }); }, show() { return true; }, close() {}, destroy() { destroyed++; } };
    } });
    await h.controller.prepare();
    h.controller.show({ optIn: true });
    if (finish === 'error') {
      emit({ type: 'error', message: 'playback failed' });
      assert.equal(h.controller.state.phase, 'error');
    } else {
      h.controller.cancel();
      assert.equal(h.controller.state.phase, 'cancelled');
    }
    assert.equal(destroyed, 1);
    emit({ type: 'granted' });
    assert.equal(h.controller.state.totalRewards, 0);
  }
});

test('cancel during unresolved preparation invalidates events and permits a clean retry', async () => {
  const emitters = [], adapters = [];
  const h = harness({ adapterFactory: options => {
    emitters.push(options.emit);
    const adapter = { prepare() { return new Promise(() => {}); }, show() { return true; }, destroy() { adapter.destroyed = true; }, close() {} };
    adapters.push(adapter); return adapter;
  } });
  await h.controller.prepare();
  assert.equal(h.controller.cancel(), true);
  assert.equal(adapters[0].destroyed, true);
  emitters[0]({ type: 'ready' });
  assert.equal(h.controller.state.phase, 'cancelled');
  await h.controller.prepare();
  emitters[1]({ type: 'ready' });
  assert.equal(h.controller.state.phase, 'ready');
});

test('dispose is permanent and callback logs are capped without storing event payloads', async () => {
  const h = harness();
  await h.controller.prepare(); h.clock.advance(5);
  h.controller.show({ optIn: true });
  const adapter = h.adapters[0];
  for (let index = 0; index < 180; index++) adapter.fire('videoCompleted', { privateData: 'not retained' });
  assert.equal(h.controller.state.log.length, 150);
  assert.equal(JSON.stringify(h.controller.state.log).includes('privateData'), false);
  h.controller.dispose();
  assert.equal(h.controller.state.phase, 'disposed');
  assert.equal(adapter.destroyed, true);
  assert.equal(await h.controller.prepare(), false);
  assert.equal(h.controller.show({ optIn: true }), false);
});

test('missing or invalid adapters fail closed without granting', async () => {
  for (const createAdapter of [() => null, () => ({ prepare() {}, show() { return true; }, close() {} }), () => { throw new Error('factory failed'); }]) {
    const clock = fakeClock();
    const controller = createRewardedController({ createAdapter, schedule: clock.schedule, cancelSchedule: clock.cancel });
    assert.equal(await controller.prepare(), false);
    assert.ok(['unsupported', 'error'].includes(controller.state.phase));
    assert.equal(controller.state.totalRewards, 0);
  }
});
