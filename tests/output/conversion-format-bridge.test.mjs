import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeFormatBridge } from '../../js/creation/conversion-format-bridge.mjs';
import { createConversionFormatController } from '../../js/creation/conversion-format-controller.mjs';

function fixture() {
  const events = [], group = { tagName: 'OPTGROUP', label: '画像', disabled: false };
  const native = { value: 'png', disabled: false, options: [
    { value: 'png', textContent: 'PNG', disabled: false, parentElement: group },
    { value: 'gif', textContent: 'GIF · アニメーション', disabled: false, parentElement: group },
  ], dispatchEvent(event) { events.push([event.type, event.bubbles, this.value]); } };
  let active = native, mode = 'media';
  const bridge = createNativeFormatBridge({ getSelect: () => active, getMode: () => mode });
  return { native, events, group, bridge, controller: createConversionFormatController(bridge),
    use(value, nextMode) { active = value; mode = nextMode; } };
}

test('plain format snapshots preserve native capability order, group and labels', () => {
  const f = fixture(), state = f.controller.snapshot();
  assert.deepEqual(state.options.map(o => [o.value, o.label, o.group]), [['png','PNG','画像'],['gif','GIF · アニメーション','画像']]);
  assert.equal(state.mode, 'media');
  assert.equal(f.controller.choose('gif'), true);
  assert.equal(f.native.value, 'gif');
  assert.deepEqual(f.events, [['change',true,'gif']]);
  assert.equal(f.controller.choose('gif'), false, 'same choice must not regenerate output');
  assert.equal(f.events.length, 1);
});

test('disabled groups, stale capabilities and busy state cannot forward a change', () => {
  const f = fixture(); f.group.disabled = true;
  assert.equal(f.controller.snapshot().options[1].disabled, true);
  assert.equal(f.controller.choose('gif'), false);
  f.group.disabled = false;
  assert.equal(f.controller.choose('gif', { busy: true }), false);
  f.native.options.pop();
  assert.equal(f.controller.choose('gif'), false);
  f.native.disabled = true;
  assert.throws(() => f.bridge.write('png'), /選べません/);
  assert.deepEqual(f.events, []);
});

test('the bridge follows the current source/mode rather than keeping an old select reference', () => {
  const f = fixture(); f.controller.snapshot();
  const textEvents = [], text = { value: 'ascii', disabled: false, options: [
    { value: 'ascii', textContent: 'ASCII', disabled: false }, { value: 'braille', textContent: '点字', disabled: false },
  ], dispatchEvent(event) { textEvents.push(event.type); } };
  f.use(text, 'output');
  assert.equal(f.controller.snapshot().mode, 'output');
  assert.equal(f.controller.choose('gif'), false);
  assert.equal(f.controller.choose('braille'), true);
  assert.equal(text.value, 'braille'); assert.equal(f.native.value, 'png');
  assert.deepEqual(textEvents, ['change']); assert.deepEqual(f.events, []);
  f.use(null, 'media'); assert.equal(f.controller.snapshot().available, false);
  assert.equal(f.controller.choose('png'), false);
});
