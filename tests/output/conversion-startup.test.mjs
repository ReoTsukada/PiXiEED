import test from 'node:test';
import assert from 'node:assert/strict';
import { runConversionStartup } from '../../js/creation/conversion-startup.mjs';

function harness(overrides = {}) {
  const calls = [];
  const state = { mainHidden: true, mainInert: true, startupVisible: false, mutations: [] };
  const view = {
    begin() { calls.push('begin'); state.mainHidden = true; state.mainInert = true; state.startupVisible = true; },
    ready(adapter, options) { calls.push('ready'); state.mainHidden = false; state.mainInert = false; state.startupVisible = false; state.adapter = adapter; state.options = options; },
    fail(error, { stage }) { calls.push(`fail:${stage}`); state.mainHidden = true; state.mainInert = true; state.startupVisible = true; state.error = error; },
  };
  const loaders = {
    loadEngine: async () => { calls.push('engine'); },
    loadText: async () => { calls.push('text-import'); return { installTextTools: async () => calls.push('text-install') }; },
    loadIntent: async () => { calls.push('intent-import'); return { installConversionIntent: async () => calls.push('intent-install') }; },
    loadUI: async () => { calls.push('ui-import'); return { mountSmartConversion: async () => { calls.push('ui-mount'); return { controls: true }; } }; },
    onWarning: (error, { stage }) => calls.push(`warning:${stage}`),
    ...overrides,
  };
  return { calls, state, view, loaders };
}

test('startup waits for the required engine before exposing the ready view', async () => {
  let release;
  const h = harness({ loadEngine: () => { h.calls.push('engine'); return new Promise(resolve => { release = resolve; }); } });
  const pending = runConversionStartup({ view: h.view, ...h.loaders });
  await Promise.resolve();
  assert.deepEqual(h.calls, ['begin', 'engine']);
  assert.equal(h.state.mainHidden, true);
  assert.equal(h.state.mainInert, true);
  release();
  assert.deepEqual(await pending, { status: 'ready', stage: 'ready' });
  assert.equal(h.calls.filter(call => call === 'ready').length, 1);
});

test('engine failure leaves startup visible and never begins optional work', async () => {
  const error = new Error('engine unavailable');
  const h = harness({ loadEngine: async () => { h.calls.push('engine'); throw error; } });
  const result = await runConversionStartup({ view: h.view, ...h.loaders });
  assert.equal(result.status, 'error'); assert.equal(result.stage, 'engine'); assert.equal(result.error, error);
  assert.deepEqual(h.calls, ['begin', 'engine', 'fail:engine']);
  assert.equal(h.state.mainHidden, true); assert.equal(h.state.mainInert, true);
});

test('optional module import failures warn and preserve media startup', async () => {
  const h = harness({
    loadText: async () => { h.calls.push('text-import'); throw Error('missing text chunk'); },
    loadIntent: async () => { h.calls.push('intent-import'); throw Error('missing intent chunk'); },
  });
  const result = await runConversionStartup({ view: h.view, ...h.loaders });
  assert.equal(result.status, 'ready');
  assert.deepEqual(h.calls.filter(call => call.startsWith('warning:')), ['warning:text-import', 'warning:intent-import']);
  assert.ok(h.calls.includes('ui-mount'));
  assert.equal(h.state.mainHidden, false);
});

test('text installer failure after engine mutation stays fatal without rollback or readiness', async () => {
  const h = harness({
    loadEngine: async () => { h.calls.push('engine'); h.state.mutations.push('engine nodes appended'); },
    loadText: async () => ({ installTextTools: async () => { h.calls.push('text-install'); h.state.mutations.push('text node inserted'); throw Error('installer failed'); } }),
  });
  const result = await runConversionStartup({ view: h.view, ...h.loaders });
  assert.equal(result.status, 'error'); assert.equal(result.stage, 'text-install');
  assert.deepEqual(h.state.mutations, ['engine nodes appended', 'text node inserted']);
  assert.equal(h.state.mainHidden, true); assert.equal(h.state.mainInert, true);
  assert.ok(!h.calls.includes('ready'));
});

test('intent installer failure is fatal even after the engine and text installer complete', async () => {
  const h = harness({ intentModule: undefined,
    loadIntent: async () => ({ installConversionIntent: async () => { h.calls.push('intent-install'); throw Error('intent setup failed'); } }),
  });
  const result = await runConversionStartup({ view: h.view, ...h.loaders });
  assert.equal(result.status, 'error'); assert.equal(result.stage, 'intent-install');
  assert.ok(h.calls.includes('text-install')); assert.ok(!h.calls.includes('ui-import'));
  assert.equal(h.state.mainHidden, true); assert.equal(h.state.mainInert, true);
});

test('a UI mount failure retains moved nodes and dataset changes while the failure view stays exposed', async () => {
  const h = harness({ loadUI: async () => ({ mountSmartConversion: async () => {
    h.calls.push('ui-mount'); h.state.mutations.push('existing controls moved into workspace'); h.state.mutations.push('workspace dataset marked mounted');
    throw Error('mount failed after mutation');
  } }) });
  const result = await runConversionStartup({ view: h.view, ...h.loaders });
  assert.equal(result.status, 'error'); assert.equal(result.stage, 'ui-mount');
  assert.deepEqual(h.state.mutations, ['existing controls moved into workspace', 'workspace dataset marked mounted']);
  assert.equal(h.state.mainHidden, true); assert.equal(h.state.mainInert, true); assert.equal(h.state.startupVisible, true);
  assert.ok(!h.calls.includes('ready'));
});

test('UI import failure and falsy mount result leave controls hidden', async t => {
  for (const [label, overrides, expectedStage] of [
    ['import', { loadUI: async () => { throw Error('UI chunk failed'); } }, 'ui-import'],
    ['mount', { loadUI: async () => ({ mountSmartConversion: async () => { throw Error('mount failed'); } }) }, 'ui-mount'],
    ['empty mount', { loadUI: async () => ({ mountSmartConversion: async () => null }) }, 'ui-mount'],
  ]) {
    await t.test(label, async () => {
      const h = harness(overrides);
      const result = await runConversionStartup({ view: h.view, ...h.loaders });
      assert.equal(result.status, 'error'); assert.equal(result.stage, expectedStage);
      assert.ok(h.calls.includes(`fail:${expectedStage}`)); assert.ok(!h.calls.includes('ready'));
      assert.equal(h.state.mainHidden, true); assert.equal(h.state.mainInert, true); assert.equal(h.state.startupVisible, true);
    });
  }
});

test('success mounts the adapter and calls ready exactly once after all installers', async () => {
  const h = harness();
  const result = await runConversionStartup({ view: h.view, ...h.loaders });
  assert.equal(result.status, 'ready');
  assert.deepEqual(h.calls.slice(0, 9), ['begin', 'engine', 'text-import', 'text-install', 'intent-import', 'intent-install', 'ui-import', 'ui-mount', 'ready']);
  assert.equal(h.calls.filter(call => call === 'ready').length, 1);
  assert.deepEqual(h.state.adapter, { controls: true });
  assert.equal(h.state.mainHidden, false); assert.equal(h.state.mainInert, false);
});

test('native startup skips the UI loader and still reaches ready', async () => {
  const h = harness({ loadUI: async () => { h.calls.push('unexpected-ui'); throw Error('must be skipped'); } });
  const result = await runConversionStartup({ view: h.view, ...h.loaders, native: true });
  assert.equal(result.status, 'ready'); assert.equal(result.stage, 'ready');
  assert.ok(!h.calls.includes('unexpected-ui'));
  assert.deepEqual(h.state.options, { native: true });
  assert.equal(h.state.adapter, undefined);
});

test('workspace visibility does not wait for recovery, while advertising receives its result', async () => {
  let finish; const recovery = new Promise(resolve => { finish = resolve; }); let shown = false;
  const result = await runConversionStartup({ view: { begin() {}, ready() { shown = true; }, fail() { assert.fail('unexpected startup failure'); } }, loadEngine: async () => {}, loadText: async () => null, loadIntent: async () => null, loadUI: async () => ({ mountSmartConversion: () => ({ entryRecoveryReady: recovery }) }) });
  assert.equal(shown, true); assert.equal(result.entryRecoveryReady, recovery);
  finish(false); assert.equal(await result.entryRecoveryReady, false);
});
