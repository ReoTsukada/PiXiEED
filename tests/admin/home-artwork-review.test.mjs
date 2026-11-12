import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewArtwork, parseReviewPage, reviewActionBody, loadReviewArtworks, submitReviewAction, reviewConfig } from '../../admin/home-artwork-review-api.mjs';
const postId = 'a0000000-0000-4000-8000-000000000001';
const imageId = 'b0000000-0000-4000-8000-000000000001';
const row = { postId, id: `map:${postId}`, title: '<img src=x>', authorName: '合成作者', imagePath: `${postId}/${imageId}.png`, imageBytes: 120, imageSha256: 'a'.repeat(64), publishedAt: '2026-11-10T10:00:00Z', eligible: true, reviewState: 'pending', snapshotToken: 'b'.repeat(64) };
const cfg = { url: 'https://review.example.test', publishableKey: 'synthetic-key' };
const session = { access_token: 'synthetic-access-token' };
const ok = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
test('review row uses only public allowlisted data and a fixed same-origin image bucket', () => {
  const parsed = parseReviewArtwork({ ...row, ownerId: 'private', email: 'private', location: { lat: 3 }, imageUrl: 'https://evil.test' }, reviewConfig(cfg));
  assert.equal(parsed.title, '<img src=x>');
  assert.equal(parsed.src, `${cfg.url}/storage/v1/object/public/post-public/${row.imagePath}`);
  for (const key of ['ownerId', 'email', 'location', 'imageUrl']) assert.equal(Object.hasOwn(parsed, key), false);
});
test('malformed identity, path, metadata and review are rejected', () => {
  for (const change of [{ postId: 'bad' }, { id: 'map:b0000000-0000-4000-8000-000000000001' }, { imagePath: '../x.png' }, { imagePath: `${postId}/${imageId}.png?private=yes` }, { imagePath: `${postId}/${imageId}.gif` }, { imagePath: `b0000000-0000-4000-8000-000000000001/${imageId}.png` }, { imageBytes: 262145 }, { imageBytes: 1.1 }, { imageSha256: 'A'.repeat(64) }, { snapshotToken: 'x' }, { reviewState: 'rejected' }, { publishedAt: 'invalid' }]) assert.equal(parseReviewArtwork({ ...row, ...change }, reviewConfig(cfg)), null, JSON.stringify(change));
});
test('empty author remains visible without identity fallback but cannot be approved', () => {
  for (const authorName of ['', '  ', '😀'.repeat(21)]) {
    const parsed = parseReviewArtwork({ ...row, authorName, email: 'secret' }, reviewConfig(cfg));
    assert.equal(parsed.authorName, '作者名未設定'); assert.equal(parsed.approvalEligible, false);
  }
  const page = parseReviewPage({ ok: true, artworks: [{ ...row, title: '😀'.repeat(31) }], nextCursor: null }, reviewConfig(cfg));
  assert.equal(page.artworks.length, 1); assert.equal(page.artworks[0].approvalEligible, false);
});
test('page fails closed on invalid envelope and skips only invalid/duplicate rows', () => {
  const config = reviewConfig(cfg);
  assert.deepEqual(parseReviewPage({ ok: true, artworks: [], nextCursor: null }, config), { artworks: [], nextCursor: null, skippedCount: 0 });
  for (const payload of [{ ok: false, artworks: [], nextCursor: null }, { ok: true, artworks: [row], nextCursor: 'invalid' }, { ok: true, artworks: [row] }]) assert.throws(() => parseReviewPage(payload, config));
  const page = parseReviewPage({ ok: true, artworks: [{ ...row, snapshotToken: 'bad' }, row, row], nextCursor: imageId }, config);
  assert.equal(page.artworks.length, 1); assert.equal(page.skippedCount, 2); assert.equal(page.nextCursor, imageId);
});
test('approve requires three exact true confirmations; hold strips unrelated values', () => {
  const values = { postId, action: 'approve', snapshotToken: row.snapshotToken, confirmedStillImage: true, confirmedRights: true, confirmedContent: true };
  assert.deepEqual(reviewActionBody(values), values);
  for (const key of ['confirmedStillImage', 'confirmedRights', 'confirmedContent']) for (const value of [false, undefined, 'true', 1]) assert.throws(() => reviewActionBody({ ...values, [key]: value }));
  assert.deepEqual(reviewActionBody({ ...values, action: 'hold', note: 'ignored' }), { postId, action: 'hold', snapshotToken: row.snapshotToken });
});
test('GET and POST use admin bearer and no-store, omit cookies and reject redirects', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return ok(options.method === 'GET' ? { ok: true, artworks: [row], nextCursor: postId } : { ok: true, postId, reviewState: 'held' }); };
  await loadReviewArtworks(session, { config: cfg, fetchImpl, after: imageId });
  await submitReviewAction(session, { postId, action: 'hold', snapshotToken: row.snapshotToken }, { config: cfg, fetchImpl });
  assert.equal(new URL(calls[0].url).pathname, '/functions/v1/home-artwork-review');
  assert.equal(new URL(calls[0].url).searchParams.get('limit'), '24'); assert.equal(new URL(calls[0].url).searchParams.get('after'), imageId);
  for (const { options } of calls) { assert.equal(options.headers.Authorization, 'Bearer synthetic-access-token'); assert.equal(options.cache, 'no-store'); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); }
});
test('401/403/409 propagate concrete status and invalid successful write is unknown', async () => {
  for (const status of [401, 403, 409]) await assert.rejects(loadReviewArtworks(session, { config: cfg, fetchImpl: async () => new Response('{}', { status }) }), error => error.status === status);
  await assert.rejects(submitReviewAction(session, { postId, action: 'hold', snapshotToken: row.snapshotToken }, { config: cfg, fetchImpl: async () => ok({ ok: true, postId: imageId, reviewState: 'held' }) }));
});
test('invalid queries, mismatched filter and oversized bodies fail closed', async () => {
  for (const query of [{ state: 'anything' }, { after: 'bad' }]) await assert.rejects(loadReviewArtworks(session, { config: cfg, ...query }));
  await assert.rejects(loadReviewArtworks(null, { config: cfg }));
  await assert.rejects(loadReviewArtworks(session, { config: cfg, fetchImpl: async () => ok({ ok: true, artworks: [{ ...row, reviewState: 'held' }], nextCursor: null }) }));
  await assert.rejects(loadReviewArtworks(session, { config: cfg, fetchImpl: async () => new Response(' '.repeat(65537)) }));
});

test('ineligible rows never retain image data and remain hold-only without current public metadata', () => {
  const parsed = parseReviewArtwork({ ...row, eligible: false, imageUrl: 'secret' }, reviewConfig(cfg));
  assert.equal(parsed.eligible, false); assert.equal(parsed.approvalEligible, false);
  for (const field of ['src', 'imageBytes', 'imageSha256', 'imagePath', 'publishedAt', 'imageUrl', 'href']) assert.equal(Object.hasOwn(parsed, field), false);
});
