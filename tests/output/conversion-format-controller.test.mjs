import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversionFormatController } from '../../js/creation/conversion-format-controller.mjs';

const formats = (...values) => values.map(value => ({ value, label: `label:${value}`, disabled: false }));

test('snapshot copies and freezes bridge state, options, labels and groups', () => {
  const source = {
    mode: 'image', value: 'png', disabled: false,
    options: [{ value: 'png', label: 'PNG exact', disabled: false, group: 'Raster' }],
  };
  const controller = createConversionFormatController({ read: () => source, write() {} });
  const snapshot = controller.snapshot();

  assert.deepEqual(snapshot, {
    available: true, mode: 'image', value: 'png', disabled: false,
    options: [{ value: 'png', label: 'PNG exact', disabled: false, group: 'Raster' }],
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.options));
  assert.ok(Object.isFrozen(snapshot.options[0]));
  source.options[0].label = 'changed';
  assert.equal(snapshot.options[0].label, 'PNG exact');
  assert.throws(() => { snapshot.options[0].label = 'mutated'; }, TypeError);
});

test('choose writes one valid changed choice and does not emit for same value', () => {
  const writes = [];
  let state = { mode: 'image', value: 'png', disabled: false, options: formats('png', 'qoi') };
  const controller = createConversionFormatController({ read: () => state, write: value => writes.push(value) });

  assert.equal(controller.choose('png'), false);
  assert.deepEqual(writes, []);
  assert.equal(controller.choose('qoi'), true);
  assert.deepEqual(writes, ['qoi']);
});

test('selection rereads mode and capabilities and respects current disabled state', () => {
  let reads = 0;
  const writes = [];
  let state = { mode: 'image', value: 'png', disabled: false, options: formats('png', 'qoi') };
  const controller = createConversionFormatController({ read: () => { reads++; return state; }, write: value => writes.push(value) });

  state = { mode: 'text', value: 'plain', disabled: false, options: formats('plain', 'markdown') };
  assert.equal(controller.choose('qoi'), false, 'an option removed by a mode change is rejected');
  assert.equal(controller.choose('markdown'), true, 'a new mode option is accepted');
  state = { mode: 'text', value: 'plain', disabled: true, options: formats('plain', 'markdown') };
  assert.equal(controller.choose('markdown'), false, 'current bridge disabled state is authoritative');
  assert.equal(reads, 3);
  assert.deepEqual(writes, ['markdown']);
});

test('selection rejects absent, busy, missing, disabled and stale options without writing', () => {
  const writes = [];
  let state = { mode: 'audio', value: 'wav', disabled: false, options: [
    { value: 'wav', label: 'WAV', disabled: false },
    { value: 'mp3', label: 'MP3', disabled: true },
  ] };
  const controller = createConversionFormatController({ read: () => state, write: value => writes.push(value) });

  assert.equal(controller.choose('mp3'), false);
  assert.equal(controller.choose('flac'), false);
  assert.equal(controller.choose('aiff', { busy: true }), false);
  state = null;
  assert.deepEqual(controller.snapshot(), { available: false, mode: undefined, value: undefined, disabled: true, options: [] });
  assert.equal(controller.choose('wav'), false);
  assert.deepEqual(writes, []);
});

test('same option signatures in different modes still follow the authoritative value', () => {
  const writes = [];
  let state = { mode: 'image', value: 'raw', disabled: false, options: formats('raw', 'png') };
  const controller = createConversionFormatController({ read: () => state, write: value => writes.push(value) });

  state = { mode: 'audio', value: 'wav', disabled: false, options: formats('wav', 'raw') };
  assert.equal(controller.choose('raw'), true);
  assert.deepEqual(writes, ['raw']);
  assert.equal(controller.snapshot().mode, 'audio');
});

test('missing write rejects a valid choice and a write failure propagates without changing snapshots', () => {
  const state = { mode: 'text', value: 'plain', disabled: false, options: formats('plain', 'markdown') };
  const noWriter = createConversionFormatController({ read: () => state });
  assert.equal(noWriter.choose('markdown'), false);

  const error = new Error('bridge write failed');
  let attempts = 0;
  const failing = createConversionFormatController({ read: () => state, write: () => { attempts++; throw error; } });
  assert.throws(() => failing.choose('markdown'), err => err === error);
  assert.equal(attempts, 1);
  assert.equal(failing.snapshot().value, 'plain');
});

test('busy snapshots remain copied and expose all bridge choices as disabled', () => {
  const controller = createConversionFormatController({
    read: () => ({ mode: 'audio', value: 'wav', disabled: false, options: [
      { value: 'wav', label: 'WAV', disabled: false },
      { value: 'aiff', label: 'AIFF', disabled: true },
    ] }),
  });
  const snapshot = controller.snapshot({ busy: true });
  assert.equal(snapshot.disabled, true);
  assert.deepEqual(snapshot.options.map(option => option.disabled), [false, true]);
  assert.equal(controller.choose('aiff', { busy: true }), false);
});
