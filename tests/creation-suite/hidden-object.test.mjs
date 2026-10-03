import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDraftAdapter, createLocalDraftStore } from '../../js/creation/local-drafts.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { HIDDEN_OBJECT_MAX_MASK_PIXELS, HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH, HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH, buildHiddenObjectHitBoxes, confirmHiddenObjectTargets, createHiddenObjectDraft, mapClientPointToPixel, resolveLocalDrawRevision, targetAtClientPoint, validateHiddenObjectDraft } from '../../js/creation/hidden-object-core.mjs';

function boxPixels(width, x, y, size = 5) { const pixels = []; for (let row = 0; row < size; row += 1) for (let column = 0; column < size; column += 1) pixels.push((y + row) * width + x + column); return pixels; }
function sourceRef(revision) { return { draftId: 'draw', assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme }; }
function makeDraft(source, targets, width = 16, height = 16) { return createHiddenObjectDraft({ gameId: 'game-1', source, width, height, targets }); }

test('作者が名付けたマスクだけが確定正解になり、空/重複/画面外は保存検証でも拒否', () => {
  const source = { draftId: 'draw', assetId: 'asset', revisionId: 'rev', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
  assert.throws(() => makeDraft(source, [{ id: 'flower', name: '花', pixels: [] }]), /空のマスク/);
  assert.throws(() => makeDraft(source, [{ id: 'one', name: '花', pixels: [0, 1] }, { id: 'two', name: '葉', pixels: [1, 2] }]), /重なっています/);
  assert.throws(() => makeDraft(source, [{ id: 'one', name: '花', pixels: [256] }]), /範囲外/);
  assert.throws(() => makeDraft(source, [{ id: 'one', name: '花', pixels: [0] }, { id: 'two', name: '花', pixels: [20] }]), /名前はそれぞれ重複/);
  const noTargets = makeDraft(source, []);
  assert.throws(() => confirmHiddenObjectTargets(noTargets), /1〜128個/);
});

test('1画素の対象にも24 CSS pxの固定当たり余白を付け、隣対象との混線を拒否', () => {
  const one = [{ id: 'dot', name: '点', pixels: [5 * 16 + 5] }];
  const single = buildHiddenObjectHitBoxes(one, 16, 16, HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH);
  assert.equal(single[0].maxX - single[0].minX + 1, 2);
  assert.equal((single[0].maxX - single[0].minX + 1) * HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH / 16 >= 24, true);
  const farOne = [{ id: 'dot', name: '点', pixels: [20 * 64 + 20] }];
  assert.throws(() => buildHiddenObjectHitBoxes([...farOne, { id: 'near', name: '近い点', pixels: [20 * 64 + 25] }], 64, 64, HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH), /押せる範囲が重なっています/);
  assert.throws(() => buildHiddenObjectHitBoxes([{ id: 'tiny', name: '点', pixels: [0] }], 512, 16, 3), /画像が小さく/);
});

test('固定したsource-pixel当たり範囲は拡大縮小・DPRで対象がずれない', () => {
  const source = { draftId: 'draw', assetId: 'asset', revisionId: 'rev', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
  const draft = confirmHiddenObjectTargets(makeDraft(source, [{ id: 'flower', name: '花', pixels: boxPixels(16, 5, 5) }]), 1000);
  assert.equal(draft.hitTestLayout.cssCanvasWidth, HIDDEN_OBJECT_MIN_PLAY_IMAGE_CSS_WIDTH);
  const expected = draft.targets[0];
  for (const cssWidth of [216, 320, 512]) {
    const scale = cssWidth / 16; const rect = { left: 13, top: 21, width: cssWidth, height: cssWidth };
    const clientX = rect.left + (expected.pixels[0] % 16 + 0.25) * scale; const clientY = rect.top + (Math.floor(expected.pixels[0] / 16) + 0.25) * scale;
    assert.equal(targetAtClientPoint(draft, clientX, clientY, rect)?.id, expected.id);
  }
  assert.equal(targetAtClientPoint(draft, 12, 21, { left: 13, top: 21, width: 216, height: 216 }), null);
  assert.equal(mapClientPointToPixel(13 + 5.5 * 27, 21 + 5.5 * 27, { left: 13, top: 21, width: 432, height: 432 }, 16, 16), 85);
});

test('保存/再開で固定した自分の画像版を復元し、確定対象だけを非公開下書きに保存', async () => {
  let nextId = 0; const adapter = createMemoryDraftAdapter(); const store = createLocalDraftStore(adapter, { idFactory: () => `rev-${++nextId}` });
  const image = createDrawDocument(16); image.pixels[0] = 2;
  const first = await store.save({ draftId: 'draw', kind: 'pixel_art', document: image });
  const changed = structuredClone(image); changed.pixels[1] = 3;
  await store.save({ draftId: 'draw', kind: 'pixel_art', document: changed });
  const draft = confirmHiddenObjectTargets(makeDraft(sourceRef(first), [{ id: 'flower', name: '花', pixels: boxPixels(16, 5, 5) }]));
  draft.prompt = '花を見つけよう';
  assert.equal(draft.published, false);
  assert.equal(draft.publication, 'draft');
  const saved = await store.save({ draftId: draft.gameId, kind: 'hidden_object', document: draft, source: { type: 'local_draft_copy', assetId: first.asset.assetId, revisionId: first.revisionId } });
  const restored = await store.load(saved.document.gameId);
  assert.deepEqual(restored.document.targets, draft.targets);
  assert.equal(restored.document.prompt, draft.prompt);
  assert.equal(restored.document.confirmed, true);
  const fixed = await resolveLocalDrawRevision(adapter, restored.document.source.draftId, restored.document.source.revisionId);
  assert.equal(fixed.documentHash, first.documentHash);
  assert.notEqual(fixed.revisionId, (await store.load('draw')).revisionId);
  assert.equal(restored.asset.visibility, 'draft');
  const originalRecord = await adapter.get('draw'); const tampered = structuredClone(originalRecord); tampered.revisions[0].asset.visibility = 'published'; await adapter.put(tampered);
  await assert.rejects(() => resolveLocalDrawRevision(adapter, 'draw', first.revisionId), /自分の端末に保存した/);
  tampered.revisions[0].asset.visibility = 'draft'; tampered.revisions[0].document.pixels[2] = 4; await adapter.put(tampered);
  await assert.rejects(() => resolveLocalDrawRevision(adapter, 'draw', first.revisionId), /hashと編集データが一致しません/);
  await adapter.put(originalRecord);
});

test('共有文言の追加は正解範囲を変えず、長すぎる文言や制御文字を拒否', () => {
  const source = { draftId: 'draw', assetId: 'asset', revisionId: 'rev', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
  const draft = makeDraft(source, [{ id: 'flower', name: '花', pixels: boxPixels(16, 5, 5) }]);
  const plain = confirmHiddenObjectTargets(draft), captioned = confirmHiddenObjectTargets({ ...draft, prompt: 'りんごがあるよ、鍵が6こ' });
  assert.deepEqual(captioned.hitBoxes, plain.hitBoxes);
  for (const prompt of [null, 5, 'あ'.repeat(181), 'a\u0000b']) assert.throws(() => validateHiddenObjectDraft({ ...draft, prompt }), /180文字/);
});

test('512px下の保存量に上限を設け、tamperされたhitboxや公開状態を拒否', () => {
  const source = { draftId: 'draw', assetId: 'asset', revisionId: 'rev', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
  const pixels = Array.from({ length: HIDDEN_OBJECT_MAX_MASK_PIXELS + 1 }, (_, index) => index);
  assert.throws(() => makeDraft(source, [{ id: 'large', name: '大きな対象', pixels }], 512, 512), /保存上限/);
  const confirmed = confirmHiddenObjectTargets(makeDraft(source, [{ id: 'flower', name: '花', pixels: boxPixels(16, 5, 5) }]));
  assert.throws(() => validateHiddenObjectDraft({ ...confirmed, hitBoxes: [{ ...confirmed.hitBoxes[0], minX: 0 }] }), /一致しません/);
  assert.throws(() => validateHiddenObjectDraft({ ...confirmed, published: true }), /公開できません/);
});

test('短い試遊画面では24pxの正解範囲を確保し、旧216px基準の下書きも読める', () => {
  const source = { draftId: 'draw', assetId: 'asset', revisionId: 'rev', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
  const base = makeDraft(source, [{ id: 'star', name: '星', pixels: [5 * 16 + 5] }]);
  const current = confirmHiddenObjectTargets(base);
  const box = current.hitBoxes[0];
  assert.ok((box.maxX - box.minX + 1) * 140 / 16 >= 24);
  assert.ok((box.maxY - box.minY + 1) * 140 / 16 >= 24);
  const legacy = validateHiddenObjectDraft({ ...base, confirmed: true, hitBoxes: buildHiddenObjectHitBoxes(base.targets, 16, 16, HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH), hitTestLayout: { cssCanvasWidth: HIDDEN_OBJECT_MIN_CANVAS_CSS_WIDTH, minTargetCssPx: 24 } });
  assert.equal(legacy.hitTestLayout.cssCanvasWidth, 216);
  assert.ok(current.hitBoxes[0].maxX - current.hitBoxes[0].minX > legacy.hitBoxes[0].maxX - legacy.hitBoxes[0].minX);
});
