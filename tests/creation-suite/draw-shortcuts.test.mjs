import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAW_SHORTCUT_COMMANDS, DRAW_SHORTCUTS_KEY, detectDrawShortcutPlatform,
  isDrawShortcutCommandEligible, isDrawShortcutEditableTarget, matchDrawShortcut,
  normalizeDrawShortcut, readDrawShortcutSettings, shouldDispatchDrawShortcut,
  writeDrawShortcutSettings
} from '../../js/creation/draw-shortcuts.mjs';

function memoryStorage(value = null) {
  return {
    value,
    getItem(key) { assert.equal(key, DRAW_SHORTCUTS_KEY); return this.value; },
    setItem(key, next) { assert.equal(key, DRAW_SHORTCUTS_KEY); this.value = next; }
  };
}

test('catalog identifiers are unique and include the draw editor operations', () => {
  const ids = DRAW_SHORTCUT_COMMANDS.map(item => item.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['tool.left.pen', 'tool.right.pen', 'mirror.horizontal', 'toggle.grid', 'edit.undo', 'selection.cancel', 'cursor.left', 'pan.hold', 'animation.addFrame', 'export.png', 'project.save', 'shortcuts.open']) assert.ok(ids.includes(id), id);
});

test('clipboard chords are permitted only for their own canvas selection commands', () => {
  for (const [id, key] of [['selection.copy', 'KeyC'], ['selection.cut', 'KeyX'], ['selection.paste', 'KeyV']]) {
    const chord = `primary+${key}`;
    assert.throws(() => normalizeDrawShortcut(chord));
    assert.throws(() => normalizeDrawShortcut(chord, { commandId: 'toggle.grid' }));
    assert.equal(normalizeDrawShortcut(chord, { commandId: id }), chord);
    for (const platform of ['mac', 'windows']) {
      const event = { code: key, metaKey: platform === 'mac', ctrlKey: platform === 'windows', altKey: false, shiftKey: false, target: { matches: () => true } };
      assert.equal(matchDrawShortcut(event, chord, platform, id), true);
      assert.equal(matchDrawShortcut(event, chord, platform, 'edit.undo'), false);
    }
  }
});

test('platform detection and defaults use native primary modifier conventions', () => {
  assert.equal(detectDrawShortcutPlatform({ platform: 'MacIntel' }), 'mac');
  assert.equal(detectDrawShortcutPlatform({ userAgentData: { platform: 'Windows' } }), 'windows');
  const settings = readDrawShortcutSettings(null);
  assert.equal(settings.bindings.mac['edit.undo'], 'primary+KeyZ');
  assert.equal(settings.bindings.mac['edit.redo'], 'primary+shift+KeyZ');
  assert.equal(settings.bindings.windows['edit.redo'], 'primary+KeyY');
  assert.equal(settings.bindings.mac['selection.cancel'], 'Escape');
});

test('safe bare keys normalize while browser and operating system shortcuts are rejected', () => {
  assert.equal(normalizeDrawShortcut('KeyL'), 'KeyL');
  assert.equal(normalizeDrawShortcut('shift+KeyR'), 'shift+KeyR');
  assert.equal(normalizeDrawShortcut('primary+KeyZ'), 'primary+KeyZ');
  assert.equal(normalizeDrawShortcut('shift+Enter'), 'shift+Enter');
  for (const chord of ['primary+KeyL', 'primary+KeyT', 'primary+KeyW', 'primary+Equal', 'primary+Minus', 'meta+KeyQ', 'ctrl+alt+Delete', 'F4', 'Escape+shift', 'alt+KeyF', 'primary+alt+KeyZ', 'ctrl+meta+KeyZ']) {
    assert.throws(() => normalizeDrawShortcut(chord), undefined, chord);
  }
});

test('corrupt, reserved, and duplicate saved bindings recover safely', () => {
  const corrupt = readDrawShortcutSettings(memoryStorage('{not json'));
  assert.equal(corrupt.recovered, true);
  assert.equal(corrupt.bindings.windows['tool.left.pen'], 'KeyB');

  const storage = memoryStorage(JSON.stringify({ version: 1, bindings: {
    mac: { 'tool.left.pen': 'primary+KeyL', 'tool.left.line': 'KeyB', 'tool.left.fill': 'KeyG' },
    windows: { 'tool.left.eraser': 'primary+KeyW', 'tool.left.line': 'KeyL' }
  } }));
  const settings = readDrawShortcutSettings(storage);
  assert.equal(settings.bindings.mac['tool.left.pen'], 'KeyB');
  assert.equal(settings.bindings.mac['tool.left.line'], 'KeyL');
  assert.equal(settings.bindings.mac['tool.left.fill'], 'KeyG');
  assert.equal(settings.bindings.windows['tool.left.eraser'], 'KeyE');
  assert.equal(settings.bindings.windows['tool.left.line'], 'KeyL');
});

test('saving one OS profile preserves the other profile', () => {
  const storage = memoryStorage(); const settings = readDrawShortcutSettings(storage);
  settings.bindings.mac['tool.left.pen'] = 'KeyC';
  assert.equal(writeDrawShortcutSettings(settings, storage), true);
  const restored = readDrawShortcutSettings(storage);
  assert.equal(restored.bindings.mac['tool.left.pen'], 'KeyC');
  assert.equal(restored.bindings.windows['tool.left.pen'], 'KeyB');
});

test('primary modifier matching is platform-specific and ignores the wrong modifier', () => {
  const metaZ = { code: 'KeyZ', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
  const ctrlZ = { ...metaZ, metaKey: false, ctrlKey: true };
  assert.equal(matchDrawShortcut(metaZ, 'primary+KeyZ', 'mac'), true);
  assert.equal(matchDrawShortcut(ctrlZ, 'primary+KeyZ', 'windows'), true);
  assert.equal(matchDrawShortcut(ctrlZ, 'primary+KeyZ', 'mac'), false);
  assert.equal(matchDrawShortcut({ ...metaZ, shiftKey: true }, 'primary+KeyZ', 'mac'), false);
});

test('editable fields, IME composition, and open popups suppress global commands', () => {
  const textInput = { closest: selector => selector.includes('input') ? {} : null };
  const editor = { closest: () => null, isContentEditable: true };
  const plain = { closest: () => null, matches: () => false };
  const doc = { querySelector: () => null };
  const event = { target: plain, defaultPrevented: false, isComposing: false, keyCode: 0 };
  assert.equal(isDrawShortcutEditableTarget(textInput), true);
  assert.equal(isDrawShortcutEditableTarget(editor), true);
  assert.equal(shouldDispatchDrawShortcut({ ...event, isComposing: true }, doc), false);
  assert.equal(shouldDispatchDrawShortcut({ ...event, keyCode: 229 }, doc), false);
  assert.equal(shouldDispatchDrawShortcut(event, { querySelector: () => ({}) }), false);
  assert.equal(shouldDispatchDrawShortcut(event, doc), true);
});

test('held cursor commands require canvas focus; repeat is limited to movement commands', () => {
  const canvas = { matches: selector => selector.includes('#draw-canvas') };
  const button = { matches: () => false };
  const movement = DRAW_SHORTCUT_COMMANDS.find(item => item.id === 'cursor.moveLeft');
  const click = DRAW_SHORTCUT_COMMANDS.find(item => item.id === 'cursor.left');
  assert.equal(isDrawShortcutCommandEligible(movement, { target: canvas, repeat: true }), true);
  assert.equal(isDrawShortcutCommandEligible(click, { target: canvas, repeat: true }), false);
  assert.equal(isDrawShortcutCommandEligible(click, { target: button, repeat: false }), false);
});

 test('disabled shortcuts survive persistence and aliases cannot be reassigned', () => {
 const storage = memoryStorage(); const settings = readDrawShortcutSettings(storage);
 settings.bindings.mac['tool.left.pen'] = null;
 settings.bindings.windows['tool.left.line'] = 'KeyP';
 settings.bindings.mac['tool.left.line'] = 'meta+shift+KeyZ';
 writeDrawShortcutSettings(settings, storage); const restored = readDrawShortcutSettings(storage);
 assert.equal(restored.bindings.mac['tool.left.pen'], null);
 assert.equal(restored.bindings.windows['tool.left.line'], 'KeyL');
 assert.equal(restored.bindings.mac['tool.left.line'], 'KeyL');
 });
