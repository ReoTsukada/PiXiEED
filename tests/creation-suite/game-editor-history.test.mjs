import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameEditorHistory, retainDifferenceCandidates } from '../../js/creation/game-editor-history.mjs';
test('redrawing preserves authored groups and exclusions, adding only newly changed pixels', () => {
  const previous = [{id:'raw-a',pixels:[1,2,3,8]},{id:'raw-b',pixels:[20]}];
  const authored = [{id:'split-a',pixels:[1,3]},{id:'split-b',pixels:[2]}];
  const next = [{id:'raw-a',pixels:[1,2,3,8,9]},{id:'raw-b',pixels:[20,21]}];
  assert.deepEqual(retainDifferenceCandidates(authored,previous,next), [{id:'split-a',pixels:[1,3]},{id:'split-b',pixels:[2]},{id:'edit-1',pixels:[9]},{id:'edit-2',pixels:[21]}]);
  assert.deepEqual(retainDifferenceCandidates(authored,previous,previous), authored);
  assert.deepEqual(retainDifferenceCandidates(authored,previous,[{id:'new',pixels:[2]}]),[{id:'split-b',pixels:[2]}]);
});
test('puzzle history copies mask data and branches correctly after undo', () => {
  const history=createGameEditorHistory(2); const a={candidates:[{id:'a',pixels:[1]}]};history.record(a);a.candidates[0].pixels.push(2);
  assert.deepEqual(history.undo(a),{candidates:[{id:'a',pixels:[1]}]}); assert.deepEqual(history.redo({candidates:[]}),a);
  history.undo(a);history.record({candidates:[]});assert.equal(history.canRedo,false);
});
