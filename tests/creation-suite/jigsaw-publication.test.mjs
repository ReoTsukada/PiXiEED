import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createMemoryDraftAdapter, createLocalDraftStore } from '../../js/creation/local-drafts.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { createJigsawLayout, createJigsawWorkspace } from '../../js/creation/jigsaw-workspace.mjs';
import { prepareJigsawUpload, preparePublicJigsaw, validateJigsawDefinition } from '../../js/creation/jigsaw-publication.mjs';
import { supabaseConfig } from '../../data/site-config.js';

const GAME_ID = '123e4567-e89b-42d3-a456-426614174000';
const POST_ID = '123e4567-e89b-42d3-a456-426614174001';
const PNG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const BASE64 = Buffer.from(PNG).toString('base64');

async function fixture({ sourceType = 'draw', width = 24, height = 24 } = {}) {
  const adapter = createMemoryDraftAdapter(); const store = createLocalDraftStore(adapter);
  const sourceDoc = createDrawDocument(Math.max(width, height) > 256 ? 512 : 16);
  sourceDoc.width = width; sourceDoc.height = height; sourceDoc.pixels = Array(width * height).fill(-1);
  sourceDoc.pixels.fill(-1); sourceDoc.pixels[0] = 0;
  const sourceRevision = await store.save({ draftId: 'source', kind: 'pixel_art', document: sourceDoc });
  const source = sourceType === 'draw'
    ? { draftId: 'source', assetId: sourceRevision.asset.assetId, revisionId: sourceRevision.revisionId, contentHash: sourceRevision.documentHash, hashScheme: sourceRevision.hashScheme }
    : sourceType === 'public'
      ? { type: 'public', postId: 'showcase:fixture', title: 'fixture', url: `${supabaseConfig.url}/storage/v1/object/public/post-public/public/fixture.png`, fingerprint: 'a'.repeat(64), width, height }
      : { type: sourceType, dataUrl: 'data:image/png;base64,AAAA', fingerprint: 'a'.repeat(64), width, height };
  const pieceSize = Math.max(3, Math.min(8, Math.floor(Math.max(width, height) / 2)));
  const layout = createJigsawLayout({ width, height, pieceSize, seed: 'stable-seed_1' });
  const game = createJigsawWorkspace({ gameId: GAME_ID, source, layout, seed: 'stable-seed_1' });
  await store.save({ draftId: GAME_ID, kind: 'jigsaw', ownerId: 'local-owner', document: game, source: { type: 'jigsaw_game', assetId: source.assetId || null, revisionId: source.revisionId || null } });
  const encodeImage = async () => new Blob([PNG], { type: 'image/png' });
  const inspectImage = async (_blob, options) => {
    assert.deepEqual(options, { keepScale: true });
    return { dataUrl: `data:image/png;base64,${BASE64}`, mimeType: 'image/png', size: PNG.length, width, height, colorCount: 1 };
  };
  return { adapter, store, game, encodeImage, inspectImage };
}

test('eligible immutable local Draw source yields only source pixels and deterministic layout definition', async () => {
  const value = await fixture({ width: 16, height: 16 });
  const result = await prepareJigsawUpload({ draftId: GAME_ID, store: value.store, adapter: value.adapter, encodeImage: value.encodeImage, inspectImage: value.inspectImage });
  assert.deepEqual(result.puzzle.definition, { schemaVersion: 1, width: 16, height: 16, confirmed: true, layoutVersion: 1, pieceSize: 8, seed: 'stable-seed_1' });
  assert.equal(result.image.width, 16); assert.equal(result.image.height, 16);
  assert.deepEqual(Object.keys(result.puzzle), ['mode', 'definition', 'source']);
  assert.equal(result.puzzle.mode, 'jigsaw');
  assert.equal(Object.hasOwn(result.puzzle, 'groups'), false);
});

test('file and public source games fail before any image encoding', async () => {
  for (const sourceType of ['file', 'public']) {
    const value = await fixture({ sourceType }); let encoded = false;
    await assert.rejects(prepareJigsawUpload({ draftId: GAME_ID, store: value.store, adapter: value.adapter, encodeImage: async () => { encoded = true; return value.encodeImage(); }, inspectImage: value.inspectImage }), /元画像は投稿できません/);
    assert.equal(encoded, false);
  }
});

test('fixed Draw larger than the public dimensions fails closed before encoding', async () => {
  const value = await fixture({ width: 512, height: 512 }); let encoded = false;
  await assert.rejects(prepareJigsawUpload({ draftId: GAME_ID, store: value.store, adapter: value.adapter, encodeImage: async () => { encoded = true; return value.encodeImage(); }, inspectImage: value.inspectImage }), /縦横8〜256px/);
  assert.equal(encoded, false);
});

test('public response requires exact post ID, mode, URL and supported definition', () => {
  const project = 'https://project.example';
  const response = { ok: true, puzzle: { postId: POST_ID, mode: 'jigsaw', title: 'おためし', originalImage: { url: `${project}/storage/v1/object/public/post-public/${POST_ID}/original.png`, width: 24, height: 24 }, definition: { schemaVersion: 1, width: 24, height: 24, confirmed: true, layoutVersion: 1, pieceSize: 8, seed: 'seed' } } };
  assert.equal(preparePublicJigsaw(response, POST_ID, project).id, POST_ID);
  const polluted = { ...response, puzzle: { ...response.puzzle, definition: { ...response.puzzle.definition, privateAnswer: 'discard me' } } };
  assert.throws(() => preparePublicJigsaw(polluted, POST_ID, project), /定義/);
  assert.throws(() => preparePublicJigsaw({ ...response, puzzle: { ...response.puzzle, mode: 'hidden_object' } }, POST_ID, project), /公開ジグソー/);
  assert.throws(() => preparePublicJigsaw({ ...response, puzzle: { ...response.puzzle, originalImage: { ...response.puzzle.originalImage, url: 'https://evil.example/x.png' } } }, POST_ID, project), /画像参照/);
});

test('jigsaw page exposes an explicit post action and separate local/public restore routes', async () => {
  const [markup, source] = await Promise.all([
    readFile(new URL('../../jigsaw/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../../js/creation/jigsaw-page.mjs', import.meta.url), 'utf8')
  ]);
  assert.match(markup, /id="jigsaw-publish"[^>]*>投稿する<\/button>/);
  assert.match(source, /resolveJigsawRouteId\('localJigsaw'\)/);
  assert.match(source, /resolveJigsawRouteId\('postPuzzle'\)/);
  assert.match(source, /functions\/v1\/public-post-puzzle/);
  assert.match(source, /credentials: 'omit'/);
  assert.match(source, /if \(publishBusy \|\| !game\) return/);
  assert.doesNotMatch(source,/^import .*openPuzzleHandoff/m);
  assert.match(source,/await import\('\.\/puzzle-handoff\.mjs\?rev=20261021-jigsaw-public-1'\)/);
});

test('definition rejects noncanonical seeds, out-of-range sizes and excessive pieces', () => {
  const base = { schemaVersion: 1, width: 24, height: 24, confirmed: true, layoutVersion: 1, pieceSize: 3, seed: 'seed' };
  assert.equal(validateJigsawDefinition(base), base);
  assert.throws(() => validateJigsawDefinition({ ...base, seed: 'séed' }), /定義/);
  assert.throws(() => validateJigsawDefinition({ ...base, pieceSize: 2 }), /定義/);
  assert.throws(() => validateJigsawDefinition({ ...base, pieceSize: 3, width: 256, height: 256 }), /ピース数上限/);
});
