import test from 'node:test';
import assert from 'node:assert/strict';
import { isLegacyPuzzleShareId, isPuzzleShareId, legacyPuzzleImageUrl } from '../../js/creation/puzzle-share-identity.mjs';
import { legacyPuzzleSharePayload } from '../../js/creation/legacy-puzzle-share.mjs';

const PROJECT = 'https://project.supabase.co';
const SPOT_ID = 'pixfind-45be2f57-5271-4389-8cdf-85d56714a52b';
const SPOT_SD_ID = 'pixfind-sd-0fb05bfd-47e6-47eb-95b7-a3021aa12d70';
const HIDDEN_ID = 'pixfind-ho-a90bc7c5-e055-447c-b67f-d0b9fa61e3fa';
const modernId = '123e4567-e89b-42d3-a456-426614174000';
const row = (id = SPOT_ID, extra = {}) => ({ id, label: '灯台', author_name: '作者名', mode: 'spot_difference',
  original_url: `${PROJECT}/storage/v1/object/public/pixfind-puzzles/puzzles/${id}/original.png`,
  diff_url: `${PROJECT}/storage/v1/object/public/pixfind-puzzles/puzzles/${id}/diff.png`, ...extra });
const posts = (id) => [{ status: 'published', post_kind: 'pixfind', distribution_mode: 'pixfind', pixfind_puzzle_id: id }];

test('legacy identity is mode-specific and cannot collide with modern UUID IDs', () => {
  assert.equal(isLegacyPuzzleShareId('spot_difference', SPOT_ID), true);
  assert.equal(isLegacyPuzzleShareId('spot-difference', SPOT_SD_ID), true);
  assert.equal(isLegacyPuzzleShareId('hidden_object', HIDDEN_ID), true);
  assert.equal(isLegacyPuzzleShareId('hidden_object', SPOT_ID), false);
  assert.equal(isLegacyPuzzleShareId('spot_difference', HIDDEN_ID), false);
  assert.equal(isPuzzleShareId('spot_difference', modernId), true);
  assert.equal(isPuzzleShareId('spot_difference', SPOT_ID), true);
  assert.equal(isPuzzleShareId('other', modernId), false);
  for (const bad of ['pixfind-123e4567-e89b-42d3-a456-426614174000x', 'pixfind-ho-123e4567-e89b-02d3-a456-426614174000', 'pixfind-sd-123e4567-e89b-42d3-a456-426614174000']) {
    assert.equal(isLegacyPuzzleShareId('hidden_object', bad), false);
  }
});

test('legacy image allowlist requires exact project, bucket, puzzle path, and plain PNG filename', () => {
  const valid = `${PROJECT}/storage/v1/object/public/pixieed-contest/puzzles/${SPOT_ID}/original.png`;
  assert.equal(legacyPuzzleImageUrl(valid, { puzzleId: SPOT_ID, supabaseUrl: PROJECT }), valid);
  for (const value of [
    valid.replace('project.supabase.co', 'evil.example'),
    valid.replace('/pixieed-contest/', '/private/'),
    valid.replace(`/${SPOT_ID}/`, '/other-puzzle/'),
    valid.replace('/original.png', '/../secret.png'),
    valid.replace('/original.png', '/%2e%2e/secret.png'),
    `${valid}?next=https://evil.example`,
    valid.replace('https:', 'http:'),
    valid.replace('/pixieed-contest/', '/pixfind-puzzles/').replace('/original.png', '/nested/original.png'),
  ]) assert.equal(legacyPuzzleImageUrl(value, { puzzleId: SPOT_ID, supabaseUrl: PROJECT }), null, value);
});

test('legacy adapter requires matching published social post and emits only the public share fields', () => {
  const puzzle = row(SPOT_ID, { targets: ['flower', { label: '鍵', marker: { x: 12, secretMask: [5] } }] });
  const hidden = { ...puzzle, id: HIDDEN_ID, mode: 'hidden-object', game_mode: 'hidden_object', play_mode: undefined,
    original_url: `${PROJECT}/storage/v1/object/public/pixfind-puzzles/puzzles/${HIDDEN_ID}/original.png`,
    diff_url: undefined };
  const result = legacyPuzzleSharePayload(posts(HIDDEN_ID), hidden, { original: { width: 64, height: 32 }, supabaseUrl: PROJECT });
  assert.deepEqual(result, { ok: true, puzzle: {
    postId: HIDDEN_ID, source: 'legacy', mode: 'hidden_object', title: '灯台', author: '作者名',
    originalImage: { url: hidden.original_url, width: 64, height: 32 },
    definition: { targets: [{ name: 'flower' }, { name: '鍵' }] },
  } });
  assert.doesNotMatch(JSON.stringify(result), /marker|secretMask/);
  assert.equal(legacyPuzzleSharePayload([], puzzle, { original: { width: 64, height: 32 }, changed: { width: 64, height: 32 }, supabaseUrl: PROJECT }), null);
  assert.equal(legacyPuzzleSharePayload([{ ...posts(SPOT_ID)[0], status: 'pending' }], puzzle, { original: { width: 64, height: 32 }, changed: { width: 64, height: 32 }, supabaseUrl: PROJECT }), null);
  assert.equal(legacyPuzzleSharePayload([{ ...posts(SPOT_ID)[0], pixfind_puzzle_id: modernId }], puzzle, { original: { width: 64, height: 32 }, changed: { width: 64, height: 32 }, supabaseUrl: PROJECT }), null);
});

test('legacy adapter validates mode, image pair, dimensions, title, and author fail closed', () => {
  const base = row();
  const args = { original: { width: 64, height: 32 }, changed: { width: 64, height: 32 }, supabaseUrl: PROJECT };
  assert.ok(legacyPuzzleSharePayload(posts(SPOT_ID), base, args));
  assert.equal(legacyPuzzleSharePayload(posts(SPOT_ID), { ...base, game_mode: 'hidden_object' }, args), null);
  assert.equal(legacyPuzzleSharePayload(posts(SPOT_ID), { ...base, original_url: `${PROJECT}/other.png` }, args), null);
  assert.equal(legacyPuzzleSharePayload(posts(SPOT_ID), base, { ...args, changed: { width: 63, height: 32 } }), null);
  assert.equal(legacyPuzzleSharePayload(posts(SPOT_ID), { ...base, label: 'x'.repeat(61) }, args), null);
  assert.equal(legacyPuzzleSharePayload(posts(SPOT_ID), { ...base, author_name: '' }, args), null);
});
