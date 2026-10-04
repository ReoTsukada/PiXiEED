import test from 'node:test';
import assert from 'node:assert/strict';
import { linkLegacyPuzzleOgpCandidates } from '../../scripts/lib/legacy-puzzle-ogp.mjs';

const spotId = 'pixfind-sd-22222222-2222-4222-8222-222222222222';
const hiddenId = 'pixfind-ho-33333333-3333-4333-8333-333333333333';
const post = (id, puzzleId, status = 'published') => ({
  id, status, post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: puzzleId,
});
const puzzle = (id, mode) => ({ id, mode });

test('legacy OGP candidates require exact published joins and infer only ID-compatible game modes', () => {
  const posts = [post('post-spot', spotId), post('post-hidden', hiddenId), post('post-draft', 'pixfind-sd-44444444-4444-4444-8444-444444444444', 'draft')];
  const puzzles = [puzzle(spotId, 'spot_difference'), puzzle(hiddenId, 'hidden_object')];
  const candidates = linkLegacyPuzzleOgpCandidates(posts, puzzles);
  assert.deepEqual(candidates.map(({ game, row }) => [game, row.id]), [
    ['spot-difference', spotId], ['hidden-object', hiddenId],
  ]);
  assert.deepEqual(linkLegacyPuzzleOgpCandidates([post('post-missing', 'pixfind-sd-55555555-5555-4555-8555-555555555555')], puzzles), []);
  assert.deepEqual(linkLegacyPuzzleOgpCandidates([post('post-draft', spotId, 'draft')], puzzles), []);
});

test('legacy OGP candidate selection fails closed for duplicate IDs, incompatible modes, and reached limits', () => {
  assert.throws(() => linkLegacyPuzzleOgpCandidates([post('post-a', spotId), post('post-b', spotId)], [puzzle(spotId, 'spot_difference')]), /linked more than once/);
  assert.throws(() => linkLegacyPuzzleOgpCandidates([post('same', spotId), post('same', hiddenId)], [puzzle(spotId, 'spot_difference'), puzzle(hiddenId, 'hidden_object')]), /invalid or duplicated/);
  assert.deepEqual(linkLegacyPuzzleOgpCandidates([post('post-a', spotId)], [puzzle(spotId, 'hidden_object')]), []);
  assert.throws(() => linkLegacyPuzzleOgpCandidates([post('post-a', spotId)], [puzzle(spotId, 'spot_difference')], { postLimit: 1 }), /post limit/);
  assert.throws(() => linkLegacyPuzzleOgpCandidates([post('post-a', spotId)], [puzzle(spotId, 'spot_difference')], { puzzleLimit: 1 }), /puzzle limit/);
  assert.throws(() => linkLegacyPuzzleOgpCandidates([post('../unsafe', spotId)], [puzzle(spotId, 'spot_difference')]), /invalid or duplicated/);
});
