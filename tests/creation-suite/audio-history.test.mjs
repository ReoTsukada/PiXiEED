import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAudioHistory } from '../../js/creation/audio-history.mjs';

test('audio history moves state in both directions and clears redo on a new edit', () => {
  const history = createAudioHistory();
  history.commit('before-a');
  assert.equal(history.undo('after-a'), 'before-a');
  assert.equal(history.canRedo, true);
  history.commit('branch-before');
  assert.equal(history.canRedo, false);
  assert.equal(history.redo('branch-after'), null);
  assert.equal(history.undo('branch-current'), 'branch-before');
  assert.equal(history.redo('branch-current'), 'branch-current');
});

test('audio history keeps only its configured newest undo states and reset empties both stacks', () => {
  const history = createAudioHistory(2);
  history.commit(1); history.commit(2); history.commit(3);
  assert.equal(history.undo(4), 3);
  assert.equal(history.undo(3), 2);
  assert.equal(history.undo(2), null);
  assert.equal(history.canRedo, true);
  history.reset();
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
});

test('audio history requires a positive integer limit', () => {
  assert.throws(() => createAudioHistory(0), RangeError);
  assert.throws(() => createAudioHistory(1.5), RangeError);
});

test('audio page history preserves animation identity and scopes snapshots to edit boundaries', () => {
  const page = readFileSync(new URL('../../js/creation/audio-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /animation:\s*audioAnimation/);
  assert.doesNotMatch(page, /structuredClone\(audioAnimation\)/);
  assert.match(page, /function copyHistoryImage\(image\)[\s\S]*new Uint8ClampedArray\(image\.rgba\)/);
  assert.match(page, /function beginAudioHistoryTransaction\(\)/);
  assert.match(page, /function finishAudioHistoryTransaction\(\{ discard = false \} = \{\}\)/);
  assert.match(page, /#audio-undo/);
  assert.match(page, /#audio-redo/);
  assert.match(page, /audioHistoryStateChanged\(activeHistorySnapshot\)[\s\S]*ensureAudioAnimationProjection/);
  assert.match(page, /return pxdImage\?\.rgba\?\.\[offset \+ 3\] > 0 && imageColorId\(pxdImage\.rgba, offset\) === colorId/);
  const gestureStart = page.slice(page.indexOf('onGestureStart: () => {'), page.indexOf('onChange: () =>', page.indexOf('onGestureStart: () => {')));
  assert.ok(gestureStart.indexOf('const revertedStroke = Boolean(activeHistorySnapshot && audioHistoryStateChanged(activeHistorySnapshot));') < gestureStart.indexOf('if (gestureOriginalSong) song = gestureOriginalSong;'));
  assert.match(gestureStart, /if \(revertedStroke\) pxdBridge\?\.markDirty\(\)/);
  assert.match(page, /if \(action\.type === 'select-frame'[\s\S]*showPlaybackFrame\(action\.frameId\); pxdBridge\?\.markDirty\(\)/);
});
