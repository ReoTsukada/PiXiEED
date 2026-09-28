import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalDraftStore } from '../../js/creation/local-drafts.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { detectDifferenceCandidates, excludeDifferenceCandidate, mapClientPointToPixel, mergeDifferenceCandidates, resolveLocalDrawRevision, splitDifferenceCandidate, validateSpotDifferenceDraft, SPOT_DIFFERENCE_MAX_CANDIDATES } from '../../js/creation/spot-difference-core.mjs';

function paint(document, cells, color = 2) { for (const [x, y] of cells) document.pixels[y * document.width + x] = color; return document; }

test('細線・離れた点・透明から色への変更を1画素も落とさず候補化する', () => {
  const before = createDrawDocument(16); const after = createDrawDocument(16);
  paint(after, [[1, 1], [2, 1], [3, 1], [10, 2], [14, 13], [14, 14], [14, 15]]);
  const result = detectDifferenceCandidates(before, after);
  assert.deepEqual(result.candidates.map((group) => group.pixels), [[17, 18, 19], [42], [222, 238, 254]]);
  assert.equal(result.candidates.flatMap((group) => group.pixels).length, 7);
});

test('透明同士の隠れRGB差は無視し、透明化と半透明化は差として残す', () => {
  const before = createDrawDocument(16); const after = createDrawDocument(16);
  before.palette.push('#ff000000'); after.palette.push('#00ff0000');
  before.pixels[0] = before.palette.length - 1; after.pixels[0] = after.palette.length - 1;
  after.pixels[5] = 2;
  before.pixels[9] = 2; after.palette.push('#e7544580'); after.pixels[9] = after.palette.length - 1;
  assert.deepEqual(detectDifferenceCandidates(before, after).candidates.map((group) => group.pixels), [[5], [9]]);
});

test('候補の統合・分割・除外は画素集合を正確に保ち、空の正解は確定不可', () => {
  const groups = [{ id: 'a', pixels: [1, 2] }, { id: 'b', pixels: [8] }, { id: 'c', pixels: [15, 16] }];
  const merged = mergeDifferenceCandidates(groups, ['a', 'b'], 16, 16);
  assert.deepEqual(merged, [{ id: 'a', pixels: [1, 2, 8] }, { id: 'c', pixels: [15, 16] }]);
  const split = splitDifferenceCandidate(merged, 'a', [2], 16, 16);
  assert.deepEqual(split.flatMap((item) => item.pixels).sort((a, b) => a - b), [1, 2, 8, 15, 16]);
  const splitAgain = splitDifferenceCandidate(split, 'a', [1], 16, 16);
  assert.deepEqual(splitAgain.map((item) => item.id), ['a', 'a-split-02', 'a-split-01', 'c']);
  const excluded = excludeDifferenceCandidate(split, 'c', 16, 16);
  assert.deepEqual(excluded.flatMap((item) => item.pixels).sort((a, b) => a - b), [1, 2, 8]);
  assert.throws(() => mergeDifferenceCandidates(groups, ['a'], 16, 16), /2つ以上/);
  assert.throws(() => splitDifferenceCandidate(groups, 'a', [1, 2], 16, 16), /一部だけ/);
});

test('候補数が画面編集上限を超えたら画素を捨てず明示拒否する', () => {
  const before = createDrawDocument(32); const after = createDrawDocument(32); let added = 0;
  for (let y = 0; y < 32 && added <= SPOT_DIFFERENCE_MAX_CANDIDATES; y += 1) for (let x = 0; x < 32 && added <= SPOT_DIFFERENCE_MAX_CANDIDATES; x += 1) {
    if ((x + y) % 2 === 0) { after.pixels[y * 32 + x] = 2; added += 1; }
  }
  assert.ok(added > SPOT_DIFFERENCE_MAX_CANDIDATES);
  assert.throws(() => detectDifferenceCandidates(before, after), /候補が多すぎて安全に編集できません/);
});

test('表示倍率や端末DPRにかかわらずCSS座標から元画素を指す', () => {
  const expected = 7 * 16 + 5;
  for (const scale of [1, 2, 3, 0.5]) {
    const rect = { left: 20, top: 30, width: 16 * scale, height: 16 * scale };
    const point = { x: 20 + 5.25 * scale, y: 30 + 7.75 * scale };
    assert.equal(mapClientPointToPixel(point.x, point.y, rect, 16, 16), expected);
  }
  assert.equal(mapClientPointToPixel(19, 30, { left: 20, top: 30, width: 16, height: 16 }, 16, 16), null);
  assert.equal(mapClientPointToPixel(20 + 11.25 * 10, 30 + 6.5 * 10, { left: 20, top: 30, width: 320, height: 160 }, 32, 16), 203);
});

test('IndexedDB形式の保存/再開で両方の固定版を再検証し、元の絵を変えない', async () => {
  const records = new Map(); const adapter = { async get(id) { return records.get(id) || null; }, async put(record) { records.set(record.draftId, structuredClone(record)); } };
  let counter = 0; const store = createLocalDraftStore(adapter, { idFactory: () => `id-${++counter}` });
  const original = createDrawDocument(16); paint(original, [[1, 1], [2, 1]]);
  const changed = structuredClone(original); paint(changed, [[1, 1], [2, 1], [8, 8]]);
  const before = await store.save({ draftId: 'draw', kind: 'pixel_art', document: original });
  const after = await store.save({ draftId: 'draw', kind: 'pixel_art', document: changed });
  const makeRef = (revision) => ({ draftId: 'draw', assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme });
  const differences = detectDifferenceCandidates(original, changed);
  const model = { schemaVersion: 1, gameId: 'find-1', width: 16, height: 16, before: makeRef(before), after: makeRef(after), candidates: differences.candidates, confirmed: false, publication: 'draft', published: false };
  validateSpotDifferenceDraft(model);
  await store.save({ draftId: model.gameId, kind: 'spot_difference', document: model, source: { type: 'local_draft_copy', assetId: before.asset.assetId, revisionId: before.revisionId } });
  const restored = await store.load(model.gameId);
  assert.deepEqual(restored.document.candidates, [{ id: 'candidate-0001', pixels: [136] }]);
  assert.equal((await resolveLocalDrawRevision(adapter, 'draw', restored.document.before.revisionId)).documentHash, before.documentHash);
  assert.equal((await resolveLocalDrawRevision(adapter, 'draw', restored.document.after.revisionId)).documentHash, after.documentHash);
  assert.deepEqual(original.pixels, before.document.pixels);
});

test('公開・pending・ファイルhashの作品や公開状態の保存は禁止', () => {
  const ref = { draftId: 'draw', assetId: 'asset', revisionId: 'rev', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
  const valid = { schemaVersion: 1, gameId: 'x', width: 16, height: 16, before: ref, after: { ...ref, revisionId: 'rev2', contentHash: 'b'.repeat(64) }, candidates: [{ id: 'a', pixels: [1] }], confirmed: false, publication: 'draft', published: false };
  assert.equal(validateSpotDifferenceDraft(valid), valid);
  assert.throws(() => validateSpotDifferenceDraft({ ...valid, published: true }), /公開できません/);
  assert.throws(() => validateSpotDifferenceDraft({ ...valid, after: { ...valid.after, hashScheme: 'sha256-file-v1' } }), /固定版参照/);
});
