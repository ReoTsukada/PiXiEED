import test from 'node:test';
import assert from 'node:assert/strict';
import { changedSettingChips, createSettingBaselineTracker, createConversionSettingsController } from '../../js/creation/conversion-settings-controller.mjs';
import { createConversionSettingsBridge } from '../../js/creation/conversion-settings-bridge.mjs';

function field(value, { disabled = false, hidden = false } = {}) {
  const events = [];
  return { value, disabled, events, closest: selector => selector === '[hidden]' && hidden ? {} : null,
    dispatchEvent(event) { events.push(event.type); this.onEvent?.(event); return true; } };
}

test('controller snapshots values and visibility as plain state', () => {
  const state = { width: { value: '64', disabled: false, visible: true }, quality: { value: '80', disabled: true, visible: false } };
  const controller = createConversionSettingsController({ read: () => state, write() { return true; } });
  assert.deepEqual(controller.snapshot(), { width: state.width });
  assert.deepEqual(controller.snapshot({ visibleOnly: false }), state);
  assert.notEqual(controller.snapshot().width, state.width);
});

test('controller rejects busy, missing, disabled, empty and missing-baseline resets before writes', () => {
  let writes = 0, busy = true;
  const state = { width: { value: '64', disabled: false, visible: true }, height: { value: '32', disabled: false, visible: true }, locked: { value: '1', disabled: true, visible: true } };
  const controller = createConversionSettingsController({ read: () => state, write: () => { writes++; return true; }, isBusy: () => busy });
  assert.equal(controller.reset(['width'], { width: '16' }), false);
  busy = false;
  for (const [keys, baseline] of [[[], { width: '16' }], [['width', 'missing'], { width: '16', missing: 'x' }], [['width', 'locked'], { width: '16', locked: '0' }], [['width', 'height'], { width: '16' }], [['width'], null]])
    assert.equal(controller.reset(keys, baseline), false);
  assert.equal(writes, 0);
  assert.equal(state.width.value, '64'); assert.equal(state.height.value, '32');
});

test('bridge assigns a coherent multi-field batch before dispatching events', () => {
  const width = field('64'), height = field('32');
  const main = { querySelector: selector => ({ '#width': width, '#height': height })[selector] || null };
  width.onEvent = () => assert.deepEqual([width.value, height.value], ['16', '8']);
  height.onEvent = width.onEvent;
  const bridge = createConversionSettingsBridge({ main, fields: { width: '#width', height: '#height' }, EventImpl: class { constructor(type, options) { this.type = type; this.bubbles = options.bubbles; } } });
  assert.equal(bridge.write({ width: '16', height: '8' }), true);
  assert.deepEqual([width.value, height.value], ['16', '8']);
  assert.deepEqual(width.events, ['input', 'change']); assert.deepEqual(height.events, ['input', 'change']);
});

test('bridge preflight prevents all writes and events for disabled or missing controls', () => {
  for (const fields of [
    { width: field('64'), height: field('32', { disabled: true }) },
    { width: field('64') },
  ]) {
    const bridge = createConversionSettingsBridge({ main: { querySelector: selector => fields[selector.slice(1)] || null }, fields: { width: '#width', height: '#height' }, EventImpl: Event });
    assert.equal(bridge.write({ width: '16', height: '8' }), false);
    assert.equal(fields.width.value, '64'); assert.deepEqual(fields.width.events, []);
  }
});

test('bridge snapshot respects hidden ancestors and controller reset uses one batch', () => {
  const width = field('64'), height = field('32', { hidden: true });
  const bridge = createConversionSettingsBridge({ main: { querySelector: selector => ({ '#width': width, '#height': height })[selector] }, fields: { width: '#width', height: '#height' }, EventImpl: Event });
  assert.deepEqual(bridge.read(), {
    width: { value: '64', disabled: false, visible: true }, height: { value: '32', disabled: false, visible: false },
  });
  const batches = [];
  const controller = createConversionSettingsController({ read: bridge.read, write: batch => { batches.push(batch); return bridge.write(batch); } });
  assert.equal(controller.reset(['width', 'height'], { width: '16', height: '8' }), true);
  assert.equal(batches.length, 1); assert.deepEqual(batches[0], { width: '16', height: '8' });
});

test('baseline values are returned without mutation and replacement establishes a fresh baseline', () => {
  const tracker = createSettingBaselineTracker();
  const initial = { width: '16', height: '8' };
  const first = tracker.read({ ids: ['a'], values: initial });
  const snapshot = { ...first };
  assert.equal(tracker.read({ ids: ['a', 'b'], values: { width: '64', height: '32' } }), first);
  assert.deepEqual(first, snapshot);
  const replacement = tracker.read({ ids: ['b'], values: { width: '64', height: '32' }, replaced: true });
  assert.deepEqual(replacement, { width: '64', height: '32' });
  assert.deepEqual(first, snapshot);
});

test('legacy chip helper retains size grouping and independent loop labels', () => {
  const chips = changedSettingChips({ width: '32', height: '20', loop: '0' }, { width: '16', height: '8', loop: '1' });
  assert.deepEqual(chips.map(chip => chip.id), ['size', 'loop']);
  assert.deepEqual(chips[0].keys, ['width', 'height']);
  assert.equal(chips[1].label, 'ずっと再生');
});
