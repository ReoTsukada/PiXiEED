import test from 'node:test';
import assert from 'node:assert/strict';
import { createPuzzleSharePage, drawOriginalPuzzleOgp, PuzzleSharePageError } from '../../js/creation/puzzle-share-page.mjs';

const POST_ID = '123e4567-e89b-42d3-a456-426614174000';
const PROJECT = 'https://project.supabase.co';
const originalUrl = `${PROJECT}/storage/v1/object/public/post-public/${POST_ID}/original.png`;
const changedUrl = `${PROJECT}/storage/v1/object/public/post-public/${POST_ID}/changed.png`;
const shareOptions = { postId: POST_ID, supabaseUrl: PROJECT };

function response(mode = 'spot_difference', overrides = {}) {
  return {
    ok: true,
    puzzle: {
      postId: POST_ID,
      title: '灯台のまち',
      author: '作者名',
      mode,
      originalImage: { url: originalUrl, width: 128, height: 128 },
      ...(mode === 'spot_difference' ? { changedImage: { url: changedUrl, width: 128, height: 128 } } : {}),
      definition: { candidates: [{ id: 'answer-secret', pixels: [44] }], targets: [{ name: 'answer-secret' }] },
      ...overrides,
    },
  };
}

test('builds per-ID crawler HTML with only the original image and a player link', () => {
  const html = createPuzzleSharePage(response(), shareOptions);
  assert.match(html, /<meta property="og:image" content="https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/post-public/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/post-public/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pixieed\.jp\/play\/spot-difference\/puzzles\/123e4567-e89b-42d3-a456-426614174000\/"\/>/);
  assert.match(html, /href="https:\/\/pixieed\.jp\/play\/spot-difference\/\?postPuzzle=123e4567-e89b-42d3-a456-426614174000"/);
  assert.match(html, /window\.location\.replace\("https:\/\/pixieed\.jp\/play\/spot-difference\/\?postPuzzle=123e4567-e89b-42d3-a456-426614174000"\)/);
  assert.equal(html.includes(changedUrl), false);
  assert.equal(html.includes('answer-secret'), false);
});

test('Hidden Object pages use their public author/title and original image only', () => {
  const html = createPuzzleSharePage(response('hidden_object'), shareOptions);
  assert.match(html, /もの探し/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pixieed\.jp\/play\/hidden-object\/puzzles\//);
  assert.match(html, /href="https:\/\/pixieed\.jp\/play\/hidden-object\/\?postPuzzle=/);
  assert.match(html, /<meta name="author" content="作者名"\/>/);
  assert.match(html, /og:image" content="https:\/\/project\.supabase\.co\/storage\/v1\/object\/public\/post-public/);
  assert.equal(html.includes(changedUrl), false);
  assert.equal(html.includes('answer-secret'), false);
});

test('escapes title and public author as HTML attribute and text content', () => {
  const payload = response('spot_difference', { title: `A&B "<script>'`, author: `C&D "<img>'` });
  const html = createPuzzleSharePage(payload, shareOptions);
  assert.match(html, /A&amp;B &quot;&lt;script&gt;&#39;/);
  assert.match(html, /C&amp;D &quot;&lt;img&gt;&#39;/);
  assert.doesNotMatch(html, /<script>'/);
});

test('rejects invalid ID, unavailable or mismatched snapshot, and unsupported metadata', () => {
  assert.throws(() => createPuzzleSharePage(response(), { ...shareOptions, postId: 'not-a-uuid' }), PuzzleSharePageError);
  assert.throws(() => createPuzzleSharePage({ ok: false, error: 'puzzle_not_found' }, shareOptions), /share_puzzle_unavailable/);
  assert.throws(() => createPuzzleSharePage(response('spot_difference', { postId: '223e4567-e89b-42d3-a456-426614174000' }), shareOptions), /share_post_id_mismatch/);
  assert.throws(() => createPuzzleSharePage(response('jigsaw'), shareOptions), /share_mode_invalid/);
  assert.throws(() => createPuzzleSharePage(response('spot_difference', { title: '' }), shareOptions), /share_title_invalid/);
  assert.throws(() => createPuzzleSharePage(response('spot_difference', { author: '' }), shareOptions), /share_author_invalid/);
});

test('rejects cross-project, non-HTTPS, non-public-bucket, query, and other-post image URLs', () => {
  const invalidUrls = [
    'https://attacker.example/image.png',
    originalUrl.replace('https:', 'http:'),
    originalUrl.replace('/post-public/', '/private-bucket/'),
    `${originalUrl}?token=secret`,
    `${PROJECT}/storage/v1/object/public/post-public/223e4567-e89b-42d3-a456-426614174000/original.png`,
    `${PROJECT}/storage/v1/object/public/post-public/${POST_ID}/../other.png`,
    `${PROJECT}/storage/v1/object/public/post-public/${POST_ID}/./original.png`,
    `${PROJECT}/storage/v1/object/public/post-public/%2e%2e/${POST_ID}/original.png`,
    `https://user:secret@project.supabase.co/storage/v1/object/public/post-public/${POST_ID}/original.png`,
  ];
  for (const url of invalidUrls) {
    assert.throws(() => createPuzzleSharePage(response('hidden_object', {
      originalImage: { url, width: 128, height: 128 },
    }), shareOptions), /share_image_url_invalid/);
  }
});

test('rejects an invalid image size and malformed public project URL', () => {
  assert.throws(() => createPuzzleSharePage(response('hidden_object', {
    originalImage: { url: originalUrl, width: 127, height: 128 },
  }), shareOptions), /share_image_dimensions_invalid/);
  assert.throws(() => createPuzzleSharePage(response(), { postId: POST_ID, supabaseUrl: 'http://project.supabase.co' }), /share_config_invalid/);
  assert.throws(() => createPuzzleSharePage(response(), { postId: POST_ID, supabaseUrl: 'https://project.supabase.co/../normalized' }), /share_config_invalid/);
  assert.throws(() => createPuzzleSharePage(response(), { postId: POST_ID, supabaseUrl: 'https://user:secret@project.supabase.co' }), /share_config_invalid/);
});

test('landscape OGP drawing uses only the original image and an integer nearest-neighbor scale', () => {
  const calls = [];
  const context = {
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    imageSmoothingEnabled: true,
    fillStyle: '',
  };
  const source = { naturalWidth: 128, naturalHeight: 64 };
  const geometry = drawOriginalPuzzleOgp(context, source);
  assert.deepEqual(geometry, { x: 64, y: 72, width: 1152, height: 576, scale: 9 });
  assert.equal(context.imageSmoothingEnabled, false);
  assert.deepEqual(calls[0], ['fillRect', 0, 0, 1280, 720]);
  assert.deepEqual(calls[1], ['drawImage', source, 0, 0, 128, 64, 64, 72, 1152, 576]);
});
