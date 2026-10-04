import test from 'node:test';
import assert from 'node:assert/strict';
import { createPuzzleSharePage, drawOriginalPuzzleOgp, drawSpotDifferencePuzzleOgp, spotDifferenceOgpLayout, hiddenObjectOgpText, hiddenObjectOgpLayout, drawHiddenObjectPuzzleOgp, PuzzleSharePageError } from '../../js/creation/puzzle-share-page.mjs';

const POST_ID = '123e4567-e89b-42d3-a456-426614174000';
const PROJECT = 'https://project.supabase.co';
const originalUrl = `${PROJECT}/storage/v1/object/public/post-public/${POST_ID}/original.png`;
const changedUrl = `${PROJECT}/storage/v1/object/public/post-public/${POST_ID}/changed.png`;
const LEGACY_ID = 'pixfind-45be2f57-5271-4389-8cdf-85d56714a52b';
const LEGACY_IMAGE = `${PROJECT}/storage/v1/object/public/pixfind-puzzles/puzzles/${LEGACY_ID}/original.png`;
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

test('builds per-ID spot-difference crawler HTML with the generated pair image and a player link', () => {
  const html = createPuzzleSharePage(response(), shareOptions);
  assert.match(html, /<meta property="og:image" content="https:\/\/pixieed\.jp\/play\/spot-difference\/puzzles\/123e4567-e89b-42d3-a456-426614174000\/ogp\.png"\/>/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/pixieed\.jp\/play\/spot-difference\/puzzles\/123e4567-e89b-42d3-a456-426614174000\/ogp\.png"\/>/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.match(html, /og:image:height" content="630"/);
  assert.match(html, /og:image:alt" content="まちがい探しの元画像と変更後の画像"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pixieed\.jp\/play\/spot-difference\/puzzles\/123e4567-e89b-42d3-a456-426614174000\/"\/>/);
  assert.match(html, /href="https:\/\/pixieed\.jp\/play\/spot-difference\/\?postPuzzle=123e4567-e89b-42d3-a456-426614174000"/);
  assert.match(html, /window\.location\.replace\("https:\/\/pixieed\.jp\/play\/spot-difference\/\?postPuzzle=123e4567-e89b-42d3-a456-426614174000"\)/);
  assert.equal(html.includes(changedUrl), false);
  assert.equal(html.includes('answer-secret'), false);
});

test('uses one validated internal OGP path for both crawler image tags', () => {
  const path = `/play/spot-difference/puzzles/${POST_ID}/ogp-0123456789abcdef.png`;
  const html = createPuzzleSharePage(response(), { ...shareOptions, ogpImagePath: path });
  assert.match(html, new RegExp(`<meta property="og:image" content="https://pixieed\\.jp${path.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}"/>`));
  assert.match(html, new RegExp(`<meta name="twitter:image" content="https://pixieed\\.jp${path.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}"/>`));
  for (const invalid of [
    'https://attacker.example/ogp.png',
    `/play/spot-difference/puzzles/${POST_ID}/../ogp.png`,
    `/play/spot-difference/puzzles/${POST_ID}/other.png`,
  ]) assert.throws(() => createPuzzleSharePage(response(), { ...shareOptions, ogpImagePath: invalid }), /share_ogp_path_invalid/);
});

test('spot-difference validates the changed public image URL and matching dimensions', () => {
  assert.throws(() => createPuzzleSharePage(response('spot_difference', {
    changedImage: { url: 'https://attacker.example/changed.png', width: 128, height: 128 },
  }), shareOptions), /share_image_url_invalid/);
  for (const changedImage of [
    { url: changedUrl, width: 256, height: 128 },
    { url: changedUrl, width: 128, height: 127 },
    { url: changedUrl, width: 128.5, height: 128 },
  ]) assert.throws(() => createPuzzleSharePage(response('spot_difference', { changedImage }), shareOptions), /share_image_dimensions_mismatch/);
});

test('Hidden Object pages use a generated picture/instructions image without serializing masks or target names into HTML', () => {
  const html = createPuzzleSharePage(response('hidden_object'), shareOptions);
  assert.match(html, /もの探し/);
  assert.match(html, /<link rel="canonical" href="https:\/\/pixieed\.jp\/play\/hidden-object\/puzzles\//);
  assert.match(html, /href="https:\/\/pixieed\.jp\/play\/hidden-object\/\?postPuzzle=/);
  assert.match(html, /<meta name="author" content="作者名"\/>/);
  assert.match(html, /og:image" content="https:\/\/pixieed\.jp\/play\/hidden-object\/puzzles\/.*\/ogp\.png/);
  assert.match(html, /og:image:width" content="1200"/);
  assert.equal(html.includes(changedUrl), false);
  assert.equal(html.includes('answer-secret'), false);
});

test('Hidden share wording uses author text or target names only, never object positions', () => {
  const definition = { prompt: 'りんごがあるよ、鍵が6こ', targets: [{ name: 'りんご', pixels: [123], id: 'private-mask' }] };
  assert.deepEqual(hiddenObjectOgpText(definition), { prompt: definition.prompt, names: ['りんご'] });
  assert.deepEqual(hiddenObjectOgpText({ ...definition, prompt: '  ' }), { prompt: '', names: ['りんご'] });
  for (const prompt of [123, 'あ'.repeat(181), 'a\u0000b']) assert.throws(() => hiddenObjectOgpText({ ...definition, prompt }), /share_prompt_invalid/);
  assert.throws(() => hiddenObjectOgpText({ targets: [] }), /share_targets_invalid/);
  const calls = [], ctx = { fillRect() {}, drawImage(...args) { calls.push(args); }, fillText(...args) { calls.push(args); }, measureText(value) { return { width: value.length * 32 }; } };
  const image = { width: 128, height: 128 }, layout = drawHiddenObjectPuzzleOgp(ctx, image, hiddenObjectOgpText(definition));
  assert.equal(layout.scale, 4); assert.deepEqual(calls[0], [image, 0, 0, 128, 128, 140, 59, 512, 512]);
  assert.ok(layout.textLines.join('').includes('鍵が6こ'));
  assert.equal(hiddenObjectOgpLayout(512, 512).scale, 1);
  assert.doesNotMatch(JSON.stringify(calls), /private-mask|pixels/);
  const long = drawHiddenObjectPuzzleOgp(ctx, image, { prompt: 'あ'.repeat(180), names: [] });
  assert.equal(long.textLines.join(''), 'あ'.repeat(180)); assert.ok(long.textLines.length * (long.fontSize + 8) <= long.text.height);
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

test('legacy share pages retain the full legacy ID in canonical URLs and the play CTA', () => {
  const payload = { ok: true, puzzle: {
    postId: LEGACY_ID, source: 'legacy', mode: 'spot_difference', title: '旧版の問題', author: '作者名',
    originalImage: { url: LEGACY_IMAGE, width: 64, height: 32 },
    changedImage: { url: LEGACY_IMAGE.replace('original.png', 'diff.png'), width: 64, height: 32 },
  } };
  const html = createPuzzleSharePage(payload, { postId: LEGACY_ID, supabaseUrl: PROJECT });
  assert.match(html, new RegExp(`canonical" href="https://pixieed\\.jp/play/spot-difference/puzzles/${LEGACY_ID}/`));
  assert.match(html, new RegExp(`href="https://pixieed\\.jp/play/spot-difference/\\?puzzle=${LEGACY_ID}"`));
  assert.doesNotMatch(html, /postPuzzle=/);
  assert.throws(() => createPuzzleSharePage({ ...payload, puzzle: { ...payload.puzzle, source: 'modern' } }, { postId: LEGACY_ID, supabaseUrl: PROJECT }), /share_post_id_invalid/);
});

test('rejects an invalid image size and malformed public project URL', () => {
  assert.throws(() => createPuzzleSharePage(response('hidden_object', {
    originalImage: { url: originalUrl, width: 513, height: 128 },
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

test('spot-difference layout and canvas drawing place equal images side by side without stretching', () => {
  const layout = spotDifferenceOgpLayout(128, 128);
  assert.deepEqual(layout, {
    width: 1200, height: 630, padding: 12, gap: 16, scale: 4,
    original: { x: 80, y: 59, width: 512, height: 512 },
    changed: { x: 608, y: 59, width: 512, height: 512 },
  });
  const calls = [];
  const context = { fillRect: (...args) => calls.push(['fillRect', ...args]), drawImage: (...args) => calls.push(['drawImage', ...args]), fillStyle: '', imageSmoothingEnabled: true };
  const original = { naturalWidth: 128, naturalHeight: 128 };
  const changed = { naturalWidth: 128, naturalHeight: 128 };
  assert.deepEqual(drawSpotDifferencePuzzleOgp(context, original, changed), layout);
  assert.equal(context.fillStyle, '#f7f8f6');
  assert.equal(context.imageSmoothingEnabled, false);
  assert.deepEqual(calls, [
    ['fillRect', 0, 0, 1200, 630],
    ['drawImage', original, 0, 0, 128, 128, 80, 59, 512, 512],
    ['drawImage', changed, 0, 0, 128, 128, 608, 59, 512, 512],
  ]);
  assert.throws(() => spotDifferenceOgpLayout(128, 128, { width: 40 }), /share_ogp_image_too_large/);
});
