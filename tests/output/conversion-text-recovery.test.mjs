import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTextRecoverySnapshot } from '../../js/creation/conversion-text-draft.mjs';
import { createTextDraftSwap } from '../../js/creation/conversion-text-draft.mjs';

const valid = overrides => ({
  schemaVersion: 1,
  text: 'memo with explicit restore data',
  mode: 'input',
  selectedFile: null,
  options: { width: 1000, fontSize: 28, padding: 48, lineHeight: 160, font: 'sans', foreground: '#213e32', background: '#fffefb', wrap: true },
  action: 'restore',
  style: 'encode',
  encoding: 'utf-8',
  art: { columns: 64, invert: false, characters: 'PiXiEED', attach: false, nativeGrid: true },
  alternateDraft: null,
  renderFormat: 'png',
  ...overrides,
});
const domains = { actions: ['auto','text','restore','pixels','document','dataurl','base64'], styles: ['encode','ascii','block','braille','emoji','custom','pixels','base64','dataurl'], encodings: ['utf-8','shift_jis','utf-16le','utf-16be'] };

test('recovery schema captures explicit action and returns detached plain settings', () => {
  const source = valid({ alternateDraft: { text: 'previous', options: { width: 900, fontSize: 24, padding: 10, lineHeight: 140, font: 'mono', foreground: '#000000', background: '#ffffff', wrap: false }, action: 'text' } });
  const snapshot = validateTextRecoverySnapshot(source, domains);
  assert.equal(snapshot.action, 'restore');
  assert.equal(snapshot.alternateDraft.text, 'previous');
  assert.notEqual(snapshot.options, source.options);
  source.options.width = 1234;
  assert.equal(snapshot.options.width, 1000);
});

test('render output preference persists, defaults old snapshots to PNG and rejects unknown choices', () => {
  assert.equal(validateTextRecoverySnapshot(valid({ renderFormat: 'svg' }), domains).renderFormat, 'svg');
  const oldSnapshot = valid(); delete oldSnapshot.renderFormat;
  assert.equal(validateTextRecoverySnapshot(oldSnapshot, domains).renderFormat, 'png');
  assert.throws(() => validateTextRecoverySnapshot(valid({ renderFormat: 'base64' }), domains), /出力形式/);
});

test('invalid schema, oversized draft, unknown controls and malformed alternate fail before writes', () => {
  for (const candidate of [
    valid({ schemaVersion: 2 }),
    valid({ text: 'x'.repeat(101) }),
    valid({ action: 'not-an-action' }),
    valid({ style: 'not-a-style' }),
    valid({ encoding: 'not-an-encoding' }),
    valid({ options: { width: 2 } }),
    valid({ alternateDraft: { text: 'oops', options: {}, action: 'text' } }),
  ]) assert.throws(() => validateTextRecoverySnapshot(candidate, { ...domains, maxLength: 100 }));
});

test('selected File payload stays a File/Blob field with explicit name, MIME and modification time', () => {
  const blob = { size: 3, arrayBuffer: async () => new ArrayBuffer(3) };
  const snapshot = validateTextRecoverySnapshot(valid({ selectedFile: { blob, name: 'sample.png', type: 'image/png', lastModified: 123 } }), domains);
  assert.deepEqual(snapshot.selectedFile, { blob, name: 'sample.png', type: 'image/png', lastModified: 123 });
});

test('draft swap recovery round-trips alternate content with its own options and explicit action', () => {
  let draft = { text: 'current', action: 'text', options: { width: 1000 } };
  const first = createTextDraftSwap({ read: () => draft, write: next => { draft = next; } });
  first.replace({ text: 'replacement', action: 'restore', options: { width: 1400 } });
  const savedAlternate = first.capture();

  let restored = { text: 'replacement', action: 'restore', options: { width: 1400 } };
  const second = createTextDraftSwap({ read: () => restored, write: next => { restored = next; } });
  assert.equal(second.restore(savedAlternate), true);
  assert.equal(second.alternateLength, 'current'.length);
  assert.equal(second.swap(), true);
  assert.deepEqual(restored, { text: 'current', action: 'text', options: { width: 1000 } });
  assert.equal(second.restore({ text: 'invalid' }), false);
  assert.equal(second.alternateLength, 'replacement'.length);
});

test('invalid draft-swap recovery leaves its alternate untouched', () => {
  let draft = { text: 'first', action: 'text', options: { width: 1000 } };
  const swap = createTextDraftSwap({ read: () => draft, write: next => { draft = next; } });
  swap.replace({ text: 'second', action: 'text', options: { width: 1100 } });
  const before = swap.capture();
  assert.equal(swap.restore({ text: 'bad', options: null }), false);
  assert.deepEqual(swap.capture(), before);
});
