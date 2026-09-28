import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { createLocalDraftStore, createMemoryDraftAdapter } from '../../js/creation/local-drafts.mjs';
import {
  createJigsawGame, isJigsawComplete, placeJigsawPiece, reassembleRgbaImage,
  removeJigsawPiece, resolveLocalDrawRevision, sliceDrawDocument, sliceRgbaImage,
  validateJigsawGame, validateJigsawSource, isSafeJigsawPublicUrl, isSafeJigsawPixfindOriginalUrl, collectPagedRows,
  chunkJigsawPuzzleIds, firstPublishedPixfindReferences
} from '../../js/creation/jigsaw-core.mjs';

function imageFixture(width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = index * 17 & 255;
    rgba[index * 4 + 1] = index * 29 & 255;
    rgba[index * 4 + 2] = index * 43 & 255;
    rgba[index * 4 + 3] = index % 7 === 0 ? 0 : index % 3 === 0 ? 96 : 255;
  }
  return { width, height, rgba };
}

async function savedDraw(adapter, store, draftId = 'draw-fixture') {
  const document = createDrawDocument(16);
  document.pixels[0] = 2; document.pixels[15] = 3; document.pixels[255] = 4;
  return store.save({ draftId, kind: 'pixel_art', ownerId: 'local-owner', document, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
}

test('non-square, uneven, and transparent pixel fixtures cut and reassemble byte-for-byte', () => {
  const cases = [
    [16, 32, 4], [64, 64, 2], [64, 64, 3], [64, 64, 4], [128, 256, 3], [128, 256, 4]
  ];
  for (const [width, height, gridSize] of cases) {
    const image = imageFixture(width, height);
    const pieces = sliceRgbaImage(image, gridSize);
    assert.equal(pieces.length, gridSize * gridSize);
    const restored = reassembleRgbaImage({ width, height, gridSize, pieces: [...pieces].reverse() });
    assert.deepEqual(restored, image.rgba, `${width}×${height}, ${gridSize}×${gridSize}`);
  }
});

test('piece boundaries use integer partitioning and retain transparent source bytes without mutation', () => {
  const image = imageFixture(16, 32); const before = new Uint8ClampedArray(image.rgba);
  const pieces = sliceRgbaImage(image, 3);
  assert.deepEqual(pieces.map(({ x, y, width, height }) => [x, y, width, height]), [
    [0, 0, 5, 10], [5, 0, 5, 10], [10, 0, 6, 10],
    [0, 10, 5, 11], [5, 10, 5, 11], [10, 10, 6, 11],
    [0, 21, 5, 11], [5, 21, 5, 11], [10, 21, 6, 11]
  ]);
  assert.ok(pieces.some((piece) => piece.rgba.some((value, index) => index % 4 === 3 && value === 0)));
  assert.deepEqual(image.rgba, before);
});

test('jigsaw keeps stable piece and answer cell IDs across display sizing and rejects wrong completion', () => {
  const document = createDrawDocument(16); document.pixels[0] = 2;
  const source = {
    revisionId: 'revision-fixed', documentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1',
    asset: { schemaVersion: 1, assetId: 'asset-fixed', revisionId: 'revision-fixed', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1', kind: 'pixel_art', source: { type: 'hand_drawn', assetId: null, revisionId: null }, owner: { type: 'local', id: 'local-owner' }, visibility: 'draft', reusePermission: 'owner_only' },
    document
  };
  const game = {
    schemaVersion: 1, gameId: 'game-fixed', gridSize: 2,
    source: { draftId: 'draw-fixed', assetId: source.asset.assetId, revisionId: source.revisionId, contentHash: source.documentHash, hashScheme: source.hashScheme },
    pieces: Array.from({ length: 4 }, (_, index) => ({ pieceId: `piece-${String(index + 1).padStart(2, '0')}`, correctCell: index })),
    pieceOrder: ['piece-03', 'piece-01', 'piece-04', 'piece-02'], placements: []
  };
  validateJigsawGame(game);
  const wrong = placeJigsawPiece(game, 'piece-01', 1);
  assert.equal(isJigsawComplete(wrong), false);
  const removed = removeJigsawPiece(wrong, 1);
  assert.equal(removed.pieceId, 'piece-01');
  let solved = placeJigsawPiece(removed.game, removed.pieceId, 0);
  for (let cell = 1; cell < 4; cell += 1) solved = placeJigsawPiece(solved, `piece-${String(cell + 1).padStart(2, '0')}`, cell);
  assert.equal(isJigsawComplete(solved), true);
  assert.deepEqual(game.pieces.map((piece) => [piece.pieceId, piece.correctCell]), [[ 'piece-01', 0 ], [ 'piece-02', 1 ], [ 'piece-03', 2 ], [ 'piece-04', 3 ]]);
  assert.equal(Object.hasOwn(game, 'pixels'), false);
  assert.equal(Object.hasOwn(game, 'palette'), false);
});

test('fixed source revision resumes by ID after the drawing receives a newer revision', async () => {
  const adapter = createMemoryDraftAdapter(); let id = 0;
  const store = createLocalDraftStore(adapter, { idFactory: () => `id-${++id}` });
  const sourceRevision1 = await savedDraw(adapter, store);
  const exactSource = await resolveLocalDrawRevision(adapter, 'draw-fixture', sourceRevision1.revisionId);
  const game = await createJigsawGame({ adapter, gameId: 'jigsaw-game-1', sourceDraftId: 'draw-fixture', sourceRevision: exactSource, gridSize: 3 });
  assert.deepEqual(game.source, { draftId: 'draw-fixture', assetId: sourceRevision1.asset.assetId, revisionId: sourceRevision1.revisionId, contentHash: sourceRevision1.documentHash, hashScheme: 'sha256-canonical-v1' });
  assert.equal(Object.hasOwn(game, 'pixels'), false);
  const placed = placeJigsawPiece(game, game.pieceOrder[0], 0);
  await store.save({ draftId: game.gameId, kind: 'jigsaw', ownerId: 'local-owner', document: placed, source: { type: 'jigsaw_game', assetId: game.source.assetId, revisionId: game.source.revisionId } });

  const newerDocument = createDrawDocument(16); newerDocument.pixels[1] = 5;
  const sourceRevision2 = await store.save({ draftId: 'draw-fixture', kind: 'pixel_art', ownerId: 'local-owner', document: newerDocument, source: { type: 'hand_drawn', assetId: null, revisionId: null } });
  assert.notEqual(sourceRevision2.revisionId, sourceRevision1.revisionId);
  const reopenedGameRevision = await store.load(game.gameId);
  const resumedSource = await resolveLocalDrawRevision(adapter, reopenedGameRevision.document.source.draftId, reopenedGameRevision.document.source.revisionId);
  assert.equal(resumedSource.revisionId, sourceRevision1.revisionId);
  assert.deepEqual(resumedSource.document, sourceRevision1.document);
  assert.deepEqual(reopenedGameRevision.document.placements, placed.placements);
  assert.equal(sourceRevision1.documentHash, game.source.contentHash);
});

test('source resolution rejects missing revision, altered canonical bytes, non-draft owner, and non-hand-drawn kinds', async () => {
  const adapter = createMemoryDraftAdapter(); let id = 0;
  const store = createLocalDraftStore(adapter, { idFactory: () => `rev-${++id}` });
  const source = await savedDraw(adapter, store, 'source-gates');
  await assert.rejects(resolveLocalDrawRevision(adapter, 'source-gates', 'missing'), /指定された保存版が見つかりません/);
  const original = await adapter.get('source-gates');
  const altered = structuredClone(original);
  altered.revisions[0].document.pixels[10] = 1;
  await adapter.put(altered);
  await assert.rejects(resolveLocalDrawRevision(adapter, 'source-gates', source.revisionId), /hashと編集データが一致しません/);
  await adapter.put(original);
  const nonOwner = structuredClone(original); nonOwner.revisions[0].asset.owner = { type: 'account', id: 'someone' };
  await adapter.put(nonOwner);
  await assert.rejects(resolveLocalDrawRevision(adapter, 'source-gates', source.revisionId), /自分の手描き/);
  const wrongKind = structuredClone(original); wrongKind.revisions[0].asset.kind = 'pixel_camera';
  await adapter.put(wrongKind);
  await assert.rejects(resolveLocalDrawRevision(adapter, 'source-gates', source.revisionId), /自分の手描き/);
});

test('jigsaw sources keep old Draw saves readable and reject public bytes, URL tampering, and file data tampering', () => {
  const legacy = { draftId: 'draw-old', assetId: 'asset-old', revisionId: 'revision-old', contentHash: 'a'.repeat(64), hashScheme: 'sha256-canonical-v1' };
  assert.equal(validateJigsawSource(legacy), legacy);
  const publicSource = { type: 'public', postId: 'map:post_123', title: '公開作品', url: 'https://kyyiuakrqomzlikfaire.supabase.co/storage/v1/object/public/post-public/posts/a.png', fingerprint: 'b'.repeat(64), width: 32, height: 32 };
  assert.equal(validateJigsawSource(publicSource), publicSource);
  assert.equal(Object.hasOwn(publicSource, 'dataUrl'), false);
  assert.equal(isSafeJigsawPublicUrl(publicSource.url, 'https://kyyiuakrqomzlikfaire.supabase.co'), true);
  assert.equal(isSafeJigsawPublicUrl(publicSource.url.replace('post-public', 'private'), 'https://kyyiuakrqomzlikfaire.supabase.co'), false);
  assert.throws(() => validateJigsawSource({ ...publicSource, url: 'https://evil.example/image.png' }), /参照が壊れています/);
  assert.throws(() => validateJigsawSource({ ...publicSource, dataUrl: 'data:image/png;base64,AAAA' }), /参照が壊れています/);
  const ownFile = { type: 'file', dataUrl: 'data:image/jpeg;base64,AAAA', fingerprint: 'c'.repeat(64), width: 16, height: 16 };
  assert.equal(validateJigsawSource(ownFile), ownFile);
  assert.throws(() => validateJigsawSource({ ...ownFile, fingerprint: 'invalid' }), /保存データが壊れています/);
});

test('legacy PiXFiND jigsaw sources require a matching original image object path', () => {
  const base = 'https://kyyiuakrqomzlikfaire.supabase.co';
  const puzzleId = 'abc_123';
  const originalUrl = `${base}/storage/v1/object/public/pixfind-puzzles/puzzles/${puzzleId}/original.png`;
  const publicPuzzle = {
    type: 'public', postId: `pixfind:post_123:${puzzleId}`, puzzleId,
    title: '公開PiXFiND作品', url: originalUrl, fingerprint: 'd'.repeat(64), width: 64, height: 64
  };
  assert.equal(isSafeJigsawPixfindOriginalUrl(originalUrl, base, puzzleId), true);
  assert.equal(isSafeJigsawPixfindOriginalUrl(originalUrl.replace('pixfind-puzzles', 'pixieed-contest'), base, puzzleId), true);
  assert.equal(isSafeJigsawPixfindOriginalUrl(originalUrl.replace('/original.png', '/diff.png'), base, puzzleId), false);
  assert.equal(isSafeJigsawPixfindOriginalUrl(originalUrl.replace(`/${puzzleId}/`, '/other/'), base, puzzleId), false);
  assert.equal(isSafeJigsawPixfindOriginalUrl(`${base}/storage/v1/object/public/pixfind-puzzles/puzzles/ignored/../${puzzleId}/original.png`, base, puzzleId), false);
  assert.equal(isSafeJigsawPixfindOriginalUrl(originalUrl.replace('kyyiuakrqomzlikfaire', 'evil'), base, puzzleId), false);
  assert.equal(validateJigsawSource(publicPuzzle), publicPuzzle);
  assert.throws(() => validateJigsawSource({ ...publicPuzzle, url: originalUrl.replace('/original.png', '/thumbnail.png') }), /公開作品の参照が壊れています/);
  assert.throws(() => validateJigsawSource({ ...publicPuzzle, url: `${base}/storage/v1/object/public/social-posts/puzzles/${puzzleId}/original.png` }), /公開作品の参照が壊れています/);
  assert.throws(() => validateJigsawSource({ ...publicPuzzle, postId: 'pixfind:post_123:other' }), /公開作品の参照が壊れています/);
  assert.throws(() => validateJigsawSource({ ...publicPuzzle, dataUrl: 'data:image/png;base64,AAAA' }), /公開作品の参照が壊れています/);
});

test('PiXFiND puzzle IDs are fetched in bounded batches and duplicate public refs use the newest first row', () => {
  const ids = Array.from({ length: 123 }, (_, index) => `puzzle_${index}`);
  const batches = chunkJigsawPuzzleIds(ids);
  assert.deepEqual(batches.map((batch) => batch.length), [50, 50, 23]);
  assert.deepEqual(batches.flat(), ids);
  assert.deepEqual(chunkJigsawPuzzleIds([]), []);
  assert.throws(() => chunkJigsawPuzzleIds(['bad/id']), /IDの分割設定が不正/);

  const posts = [
    { id: 'newer-post', status: 'published', post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: 'shared-puzzle' },
    { id: 'older-post', status: 'published', post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: 'shared-puzzle' },
    { id: 'pending-post', status: 'pending', post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: 'private-puzzle' },
    { id: 'showcase-post', status: 'published', post_kind: 'image', distribution_mode: 'showcase', pixfind_puzzle_id: 'other-puzzle' }
  ];
  const references = firstPublishedPixfindReferences(posts);
  assert.deepEqual([...references.keys()], ['shared-puzzle']);
  assert.equal(references.get('shared-puzzle').id, 'newer-post');
});

test('PiXFiND public source listing is intersected with published social_posts and rechecked on save and resume', async () => {
  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('../../js/creation/jigsaw-page.mjs', import.meta.url), 'utf8');
  assert.match(script, /post_kind: 'eq\.pixfind', distribution_mode: 'eq\.pixfind'/);
  assert.match(script, /status: 'eq\.published'/);
  assert.match(script, /pixfind_puzzle_id: `eq\.\$\{referencedPuzzleId\}`/);
  assert.match(script, /select: 'id,original_url'/);
  assert.match(script, /await assertListedPublicSource\(game\.source\.postId, game\.source\.url, game\.source\.puzzleId\)/);
  assert.match(script, /await assertListedPublicSource\(savedGame\.source\.postId, savedGame\.source\.url, savedGame\.source\.puzzleId/);
  assert.match(script, /isSafeJigsawPixfindOriginalUrl\(puzzle\.original_url, supabaseConfig\.url, puzzleId\)/);
  assert.match(script, /chunkJigsawPuzzleIds\(puzzleIds\)/);
  assert.match(script, /firstPublishedPixfindReferences\(pixfindPosts\)/);
  assert.doesNotMatch(script, /thumbnail_url|diff_url/);
});

test('public source pagination reads every page without an implicit result cap', async () => {
  const calls = []; const allRows = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const rows = await collectPagedRows(async (offset, limit) => { calls.push([offset, limit]); return allRows.slice(offset, offset + limit); }, { pageSize: 500 });
  assert.equal(rows.length, 1203);
  assert.deepEqual(calls, [[0, 500], [500, 500], [1000, 500]]);
});

test('slicing rejects too-small images, malformed RGBA, and unsupported grid sizes', () => {
  assert.throws(() => sliceRgbaImage(imageFixture(2, 2), 3), /サイズが不正/);
  assert.throws(() => sliceRgbaImage({ width: 16, height: 16, rgba: new Uint8Array(3) }, 2), /サイズが不正/);
  assert.throws(() => sliceRgbaImage(imageFixture(16, 16), 5), /2×2、3×3、4×4/);
});

test('piece labels keep answers hidden and preserve direct placement and accessible alternatives', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../../jigsaw/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../css/creation-jigsaw.css', import.meta.url), 'utf8');
  const script = await readFile(new URL('../../js/creation/jigsaw-page.mjs', import.meta.url), 'utf8');
  assert.match(page, /PiXiEEDの公開作品/);
  assert.match(page, /role="group" aria-label="パズル盤面"/);
  assert.match(script, /選択中。置き先を選ぶ/);
  assert.match(script, /正しい場所|置き場所が違います/);
  assert.doesNotMatch(script, /正解は\$\{row\}行\$\{column\}列目/);
  assert.match(script, /game\.pieceOrder\.indexOf\(pieceId\)/);
  assert.doesNotMatch(script, /piece\.correctCell \+ 1/);
  assert.match(script, /beginPieceDrag\(event, button, button\.dataset\.pieceId/);
  assert.match(script, /removeJigsawPiece\(game, drag\.origin\.cell\)/);
  assert.match(script, /suppressClickUntil/);
  assert.match(css, /height:100dvh/);
  assert.match(css, /touch-action:pan-x/);
  assert.match(script, /collectPagedRows/);
  assert.match(script, /social_posts/);
  assert.match(script, /imageSmoothingEnabled = false/);
  assert.match(css, /orientation:landscape/);
});
