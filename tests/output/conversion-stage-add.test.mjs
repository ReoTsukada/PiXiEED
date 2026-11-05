import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeMaterialAdd, renderMaterialList, isMaterialAddDisabled } from '../../js/creation/conversion-stage.mjs';

class MinimalList {
  children = [];
  replaceChildren(...items) { this.children = items; }
}

test('material strip render appends the same add slot after every rebuilt card set', () => {
  const list = new MinimalList(), addButton = { id: 'single-native-add' }, addSlot = { role: 'listitem', id: 'stable-add-slot', button: addButton };
  renderMaterialList(list, [{ id: 'a' }, { id: 'b' }], addSlot);
  assert.deepEqual(list.children.map(node => node.id), ['a', 'b', 'stable-add-slot']);
  renderMaterialList(list, [{ id: 'c' }], addSlot);
  assert.deepEqual(list.children.map(node => node.id), ['c', 'stable-add-slot']);
  assert.equal(list.children.at(-1), addSlot);
  assert.equal(list.children.at(-1).button, addButton);
});

test('unified add delegates to shared chooser even when native multi-image add is unavailable', () => {
  const calls = [], main = { dataset: { unifiedInput: 'true' } };
  invokeMaterialAdd({ main, loaded: true, actions: { add: () => calls.push('shared') }, choose: () => calls.push('native') });
  assert.deepEqual(calls, ['shared']);
});

test('fallback add preserves loaded add and empty replace behavior', () => {
  const calls = [], main = { dataset: {} }, choose = intent => calls.push(intent);
  invokeMaterialAdd({ main, loaded: true, choose });
  invokeMaterialAdd({ main, loaded: false, choose });
  assert.deepEqual(calls, ['add', 'replace']);
});

test('native canAdd restrictions apply only to fallback mode; busy always disables the shared button', () => {
  assert.equal(isMaterialAddDisabled({ unified: false, canAdd: false }), true);
  assert.equal(isMaterialAddDisabled({ unified: true, canAdd: false }), false);
  assert.equal(isMaterialAddDisabled({ unified: true, canAdd: true, working: true }), true);
});
