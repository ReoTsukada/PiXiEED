import test from 'node:test';
import assert from 'node:assert/strict';
import { saveActionLabel, changedSettingChips, createSettingBaselineTracker, applyMaterialFiles, materialChangeInvalidatesSave } from '../../js/creation/conversion-stage.mjs';

test('save names the current output format and never treats inputs as output count', () => {
  assert.equal(saveActionLabel({ loaded: true, format: 'png', inputCount: 3 }), 'PNGで保存');
  assert.equal(saveActionLabel({ loaded: true, format: 'apng' }), 'APNGで保存');
  assert.equal(saveActionLabel({ loaded: true, mode: 'output' }), 'TXTで保存');
  assert.equal(saveActionLabel({ loaded: true, mode: 'input', filename: 'drawing.svg' }), 'SVGで保存');
  assert.equal(saveActionLabel({ loaded: true, mode: 'input', filename: '' }), '変換して保存');
  assert.equal(saveActionLabel({ loaded: false }), '素材を選ぶ');
  assert.equal(saveActionLabel({ loaded: false, mode: 'input' }), '文字を入力');
  assert.equal(saveActionLabel({ loaded: true, working: true, format: 'png' }), '作成中…');
});
test('only changed settings become chips and size reset contains exactly its two fields', () => {
  const initial = { width: '32', height: '20', quality: '90', loop: '1', bits: '16' };
  assert.deepEqual(changedSettingChips(initial, initial), []);
  assert.deepEqual(changedSettingChips(initial, null), []);
  const chips = changedSettingChips({ ...initial, width: '64', height: '40', quality: '80', loop: '0' }, initial);
  assert.deepEqual(chips.map(c => c.id), ['size', 'quality', 'loop']);
  assert.deepEqual(chips[0].keys, ['width','height']);
  assert.match(chips[0].resetLabel, /32 × 20px/);
  assert.deepEqual(chips[1].keys, ['quality']);
  assert.equal(chips[2].label, 'ずっと再生');
  assert.deepEqual(changedSettingChips({ fps: '24' }, { fps: '12' })[0].keys, ['fps']);
  assert.deepEqual(changedSettingChips({ quality: undefined, bits: '16' }, initial), []);
});
test('adding and removing inputs preserve baseline; replacement and empty state establish a fresh one', () => {
  const tracker = createSettingBaselineTracker();
  const read = (ids, width, replaced = false) => tracker.read({ ids, values: { width }, replaced });
  assert.equal(read(['a'], '32').width, '32');
  assert.equal(read(['a','b'], '64').width, '32');
  assert.equal(read(['b'], '64').width, '32');
  assert.equal(read(['new'], '80').width, '80');
  assert.equal(read(['new'], '100', true).width, '100');
  assert.equal(read([], '0'), null);
  assert.equal(read(['new'], '120').width, '120');
});
test('output-row contexts retain independent reset baselines when switching back', () => {
  const tracker = createSettingBaselineTracker();
  const read = (context, width) => tracker.read({ ids: ['shared'], context, values: { width } });
  assert.equal(read('output:a:shared', '32').width, '32');
  assert.equal(read('output:b:shared', '64').width, '64');
  assert.equal(read('output:a:shared', '128').width, '32');
});
test('cancelled chooser is a no-op, initial files use native import, and additions never replace', async () => {
  const calls = [], files = [{ name: 'first.png' }];
  const api = { addFiles: files => { calls.push(['add', files]); return true; }, replaceFiles: files => { calls.push(['replace', files]); return true; } };
  const fallback = files => calls.push(['initial', files]);
  assert.equal(await applyMaterialFiles({ api, files: [], loaded: true, intent: 'replace', fallback }), false);
  assert.equal(calls.length, 0);
  await applyMaterialFiles({ api, files, loaded: false, intent: 'replace', fallback });
  await applyMaterialFiles({ api, files, loaded: true, intent: 'add', fallback });
  await applyMaterialFiles({ api, files, loaded: true, intent: 'replace', fallback });
  assert.deepEqual(calls.map(x => x[0]), ['initial','add','replace']);
  assert.equal(await applyMaterialFiles({ api: {}, files, loaded: true, intent: 'add', fallback }), false);
  assert.equal(calls.length, 3);
});
test('detailed replacement requires a selected source and passes that ID without touching output IDs', async () => {
  const calls = [], files = [{ name: 'next.wav' }];
  const api = { getMaterialState() {}, replaceFiles: (id, values) => { calls.push([id, values]); return true; } };
  assert.equal(await applyMaterialFiles({ api, files, loaded: true, intent: 'replace', activeId: '' }), false);
  assert.equal(calls.length, 0);
  assert.equal(await applyMaterialFiles({ api, files, loaded: true, intent: 'replace', activeId: 'source-audio' }), true);
  assert.deepEqual(calls, [['source-audio', files]]);
});
test('failed material operation stays failed; retry uses the same files and selected source', async () => {
  let attempts = 0; const files = [{ name: 'safe.png' }];
  const api = { getMaterialState() {}, async replaceFiles(id, selected) { assert.equal(id, 'source'); assert.deepEqual(selected, files); if (++attempts === 1) throw Error('unsupported'); return true; } };
  const request = { api, files, loaded: true, intent: 'replace', activeId: 'source' };
  await assert.rejects(applyMaterialFiles(request), /unsupported/);
  assert.equal(await applyMaterialFiles(request), true);
});

import { createConversionSaveIntent } from '../../js/creation/conversion-workspace.mjs';
test('material replacement invalidates pending save; FPS settings persistence lets the same click continue', async () => {
  const state = { loaded: true, mode: 'media', revision: 1, working: false, fpsDirty: true, href: 'blob:old', ready: false, matchesFormat: true };
  const runs = [], saved = [];
  let api;
  const notify = detail => { if (materialChangeInvalidatesSave(detail)) { state.revision++; api.cancel(); } };
  api = createConversionSaveIntent({ snapshot: () => ({ ...state }), choose() {}, save: link => saved.push(link.href),
    run(stage) { runs.push(stage); state.working = true; return Promise.resolve(true); },
    stageComplete(stage) { if (stage === 'fps') state.fpsDirty = false; },
  });
  api.request(); notify({ changed: true, mutation: 'settings' });
  state.working = false; await Promise.resolve(); api.observe();
  assert.deepEqual(runs, ['fps','convert']); assert.equal(saved.length, 0);
  state.href = 'blob:new'; state.link = { href: state.href }; state.ready = true; state.working = false;
  await Promise.resolve(); api.observe(); assert.deepEqual(saved, ['blob:new']);
  assert.equal(materialChangeInvalidatesSave({ changed: false }), false);
  assert.equal(materialChangeInvalidatesSave({ changed: true }), true);
  assert.equal(materialChangeInvalidatesSave({ changed: true, mutation: 'materials' }), true);
  state.ready = false; api.request(); notify({ changed: true });
  assert.equal(api.pending, false);
});
