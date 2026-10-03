import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDraftAdapter, createLocalDraftStore } from '../../js/creation/local-drafts.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { encodePng } from '../../js/creation/draw-core.mjs';
import { confirmDifferenceCandidates } from '../../js/creation/spot-difference-core.mjs';
import { confirmHiddenObjectTargets, createHiddenObjectDraft } from '../../js/creation/hidden-object-core.mjs';
import { inspectPixelPng } from '../../supabase/functions/_shared/pixel-png.mjs';
import { admitPuzzleUpload } from '../../supabase/functions/_shared/puzzle-admission.mjs';
import { preparePuzzleUpload } from '../../js/creation/puzzle-upload.mjs';

function imageAdapters() {
  return {
    encodeImage: async (document) => new Blob([encodePng(document)], { type: 'image/png' }),
    inspectImage: async (blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const info = await inspectPixelPng(bytes);
      return { dataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`, mimeType: 'image/png', size: bytes.length, ...info, hasTransparency: true };
    },
  };
}

function ref(draftId, revision) {
  return { draftId, assetId: revision.asset.assetId, revisionId: revision.revisionId, contentHash: revision.documentHash, hashScheme: revision.hashScheme };
}

async function fixture(mode, { confirmed = true, ownerId = 'local-owner' } = {}) {
  const drawAdapter = createMemoryDraftAdapter(); const puzzleAdapter = createMemoryDraftAdapter();
  let id = 0; const ids = () => `id-${++id}`;
  const drawStore = createLocalDraftStore(drawAdapter, { idFactory: ids });
  const beforeDoc = createDrawDocument(16); const afterDoc = createDrawDocument(16);
  afterDoc.pixels[4] = 2;
  const before = await drawStore.save({ draftId: 'draw-source', kind: 'pixel_art', document: beforeDoc });
  const after = await drawStore.save({ draftId: 'draw-source', kind: 'pixel_art', document: afterDoc });
  const draftId = mode === 'spot_difference' ? 'spot-id' : 'hidden-id';
  const document = mode === 'spot_difference'
    ? confirmDifferenceCandidates({ schemaVersion: 1, gameId: draftId, width: 16, height: 16, before: ref('draw-source', before), after: ref('draw-source', after), candidates: [{ id: 'change', pixels: [4] }], confirmed: false, publication: 'draft', published: false })
    : confirmHiddenObjectTargets(createHiddenObjectDraft({ gameId: draftId, source: ref('draw-source', before), width: 16, height: 16, targets: [{ id: 'star', name: '星', pixels: Array.from({ length: 25 }, (_, i) => (5 + Math.floor(i / 5)) * 16 + 5 + i % 5) }], confirmed: false }));
  if (!confirmed) document.confirmed = false;
  const store = createLocalDraftStore(puzzleAdapter, { idFactory: ids });
  await store.save({ draftId, kind: mode, ownerId, document, source: { type: 'local_draft_copy', assetId: before.asset.assetId, revisionId: before.revisionId } });
  return { drawAdapter, puzzleAdapter, store, draftId, before, after, document };
}

async function prepare(f, mode) {
  return preparePuzzleUpload({ mode, draftId: f.draftId, store: f.store, adapter: f.drawAdapter, ...imageAdapters() });
}

for (const mode of ['spot_difference', 'hidden_object']) test(`${mode} prepares the admission contract from immutable local revisions`, async () => {
  const f = await fixture(mode);
  const beforeRecord = await f.drawAdapter.get('draw-source');
  const puzzleRecord = await f.puzzleAdapter.get(f.draftId);
  const result = await prepare(f, mode);
  const originalBytes = Uint8Array.from(atob(result.image.base64), (c) => c.charCodeAt(0));
  const admitted = await admitPuzzleUpload(result.puzzle, originalBytes, { mimeType: result.image.mimeType, size: result.image.size, width: result.image.width, height: result.image.height, colorCount: result.image.colorCount });
  assert.equal(admitted.mode, mode);
  assert.deepEqual(Object.keys(result), ['image', 'puzzle']);
  assert.deepEqual(Object.keys(result.image).sort(), ['base64', 'colorCount', 'height', 'mimeType', 'size', 'width']);
  assert.deepEqual(Object.keys(result.puzzle).sort(), mode === 'spot_difference' ? ['changedImage', 'definition', 'mode', 'source'] : ['definition', 'mode', 'source']);
  assert.deepEqual(result.puzzle.source.original, ref('draw-source', f.before));
  assert.deepEqual(result.puzzle.source.changed, mode === 'spot_difference' ? ref('draw-source', f.after) : undefined);
  assert.deepEqual(admitted.source, result.puzzle.source);
  assert.deepEqual(await f.drawAdapter.get('draw-source'), beforeRecord);
  assert.deepEqual(await f.puzzleAdapter.get(f.draftId), puzzleRecord);
});

test('rejects unconfirmed or foreign-owner local puzzle drafts', async () => {
  await assert.rejects(prepare(await fixture('spot_difference', { confirmed: false }), 'spot_difference'));
  await assert.rejects(prepare(await fixture('hidden_object', { ownerId: 'other-owner' }), 'hidden_object'));
});

test('Hidden custom share wording survives local save, upload preparation and server admission', async () => {
  const f = await fixture('hidden_object'); f.document.prompt = 'りんごがあるよ、鍵が6こ';
  await f.store.save({ draftId: f.draftId, kind: 'hidden_object', document: f.document });
  const result = await prepare(f, 'hidden_object');
  assert.equal(result.puzzle.definition.prompt, f.document.prompt);
  const admitted = await admitPuzzleUpload(result.puzzle, Buffer.from(result.image.base64, 'base64'), result.image);
  assert.equal(admitted.definition.prompt, f.document.prompt);
});

test('rejects mismatched saved Draw refs and dimension drift', async () => {
  const f = await fixture('spot_difference');
  const wrongRef = structuredClone(f.document);
  wrongRef.before.contentHash = '0'.repeat(64);
  await f.store.save({ draftId: f.draftId, kind: 'spot_difference', document: wrongRef });
  await assert.rejects(prepare(f, 'spot_difference'), /固定版参照が一致/);

  const wrongSize = structuredClone(f.document);
  wrongSize.width = 32;
  await f.store.save({ draftId: f.draftId, kind: 'spot_difference', document: wrongSize });
  await assert.rejects(prepare(f, 'spot_difference'), /画像寸法と下書き定義が一致/);
});
