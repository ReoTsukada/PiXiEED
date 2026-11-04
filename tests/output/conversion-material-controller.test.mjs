import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMaterialFiles, createConversionMaterialController } from '../../js/creation/conversion-material-controller.mjs';

const stateWith = (assets = [{ id: 'a' }, { id: 'b' }], extra = {}) => ({ assets, activeId: assets[0]?.id, canUndo: false, canAdd: true, loaded: assets.length > 0, ...extra });

test('commands validate fresh assets and forward exact native actions', () => {
  let state = stateWith(undefined, { canUndo: true });
  const calls = [];
  const controller = createConversionMaterialController({ read: () => state, actions: {
    selectAsset: id => calls.push(['select', id]), removeAsset: id => calls.push(['remove', id]),
    moveAsset: (id, direction) => calls.push(['move', id, direction]), undoRemove: () => calls.push(['undo']),
  } });
  assert.equal(controller.select('b'), 1);
  assert.equal(controller.remove('b'), 2);
  assert.equal(controller.move('a', 1), 3);
  assert.equal(controller.undo(), 4);
  assert.deepEqual(calls, [['select','b'],['remove','b'],['move','a',1],['undo']]);
  state = stateWith([{ id: 'b' }]);
  assert.equal(controller.select('a'), false);
  assert.equal(controller.remove('a'), false);
});

test('busy state, non-removable assets, movement bounds and unavailable actions reject safely', () => {
  const blocked = createConversionMaterialController({ read: () => stateWith([{ id: 'a', canRemove: false }, { id: 'b' }], { canUndo: false, busy: true }), actions: {
    selectAsset() { throw Error('must not run'); }, removeAsset() { throw Error('must not run'); }, moveAsset() { throw Error('must not run'); }, undoRemove() { throw Error('must not run'); },
  } });
  assert.equal(blocked.select('a'), false);
  assert.equal(blocked.remove('a'), false);
  assert.equal(blocked.move('a', 1), false);
  assert.equal(blocked.undo(), false);

  const controller = createConversionMaterialController({ read: () => stateWith(), actions: { moveAsset() { return true; } } });
  assert.equal(controller.move('a', -1), false);
  assert.equal(controller.move('b', 1), false);
  assert.equal(controller.move('a', 2), false);
  assert.equal(controller.select('a'), false);
  assert.equal(controller.remove('a'), false);
  assert.equal(controller.undo(), false);
});

test('busy callback blocks fresh actions and native false results remain failures', () => {
  let busy = false, calls = 0;
  const controller = createConversionMaterialController({ read: stateWith, isBusy: () => busy, actions: { selectAsset() { calls++; return false; } } });
  assert.equal(controller.select('a'), false);
  busy = true;
  assert.equal(controller.select('a'), false);
  assert.equal(calls, 1);
});

test('synchronous native selection dispatches are not serialized and latest selection can supersede', async () => {
  const pending = new Map(), dispatched = [];
  const controller = createConversionMaterialController({ read: stateWith, actions: {
    selectAsset(id) { dispatched.push(id); return new Promise(resolve => pending.set(id, resolve)); },
  } });
  const first = controller.select('a'), second = controller.select('b');
  assert.deepEqual(dispatched, ['a', 'b']);
  pending.get('b')(true); pending.get('a')(false);
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
});

test('action errors propagate so callers can report and retry', () => {
  let attempts = 0;
  const controller = createConversionMaterialController({ read: stateWith, actions: { removeAsset() { if (++attempts === 1) throw Error('temporary'); return true; } } });
  assert.throws(() => controller.remove('a'), /temporary/);
  assert.equal(controller.remove('a'), true);
});

test('file chooser helper preserves initial/add/replace routing and empty cancellation', async () => {
  const files = [{ name: 'one.png' }], calls = [];
  const api = { getMaterialState() {}, addFiles: value => { calls.push(['add', value]); return true; }, replaceFiles: (id, value) => { calls.push(['replace', id, value]); return true; } };
  assert.equal(await applyMaterialFiles({ api, files: [], intent: 'replace', loaded: true }), false);
  assert.equal(await applyMaterialFiles({ api, files, intent: 'replace', loaded: false, fallback: value => { calls.push(['initial', value]); return true; } }), true);
  assert.equal(await applyMaterialFiles({ api, files, intent: 'add', loaded: true }), true);
  assert.equal(await applyMaterialFiles({ api, files, intent: 'replace', loaded: true, activeId: 'active' }), true);
  assert.deepEqual(calls.map(call => call[0]), ['initial','add','replace']);
});

test('source replacement remains tied to its captured source even if that source disappeared', async () => {
  const calls = [], files = [{ name: 'replacement.png' }];
  const api = { getMaterialState: () => ({ assets: [] }), replaceFiles: (id, value) => { calls.push([id, value]); return false; } };
  let fallbackCalls = 0;
  assert.equal(await applyMaterialFiles({ api, files, intent: 'replace', loaded: false, targetId: 'removed-source', fallback() { fallbackCalls++; return true; } }), false);
  assert.deepEqual(calls, [['removed-source', files]]);
  assert.equal(fallbackCalls, 0);
});
