import test from 'node:test';
import assert from 'node:assert/strict';
import { createMyPostsApi } from '../../js/globe/my-posts.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const guest = '22222222-2222-4222-8222-222222222222';
const postId = '33333333-3333-4333-8333-333333333333';
const otherId = '44444444-4444-4444-8444-444444444444';
const OWNER = 'PiXiEED:legacy-owner-session:v1';
const DEVICE = 'PiXiEED:supabase-session:v1';
const config = { url: 'https://example.supabase.co', publishableKey: 'public-test', publicStorageBucket: 'post-public' };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const saved = (id, token = id) => JSON.stringify({ access_token: token, refresh_token: `${token}-refresh`, expires_at: Math.floor(Date.now() / 1000) + 3600, user_id: id });
const row = (id = postId, author = guest, extras = {}) => ({ id, author_id: author, title: '横長の絵', caption: '説明', status: 'published', post_kind: 'pixel_art', created_at: '2026-10-06T00:00:00Z', image_width: 192, image_height: 96, image_path: `${author}/${id}.png`, deleted_at: null, ...extras });
function fixture({ entries = [[DEVICE, saved(guest)]], posts = [row()], handler } = {}) {
  const values = new Map(entries);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    const override = await handler?.(url, init, values);
    if (override) return override;
    const token = init.headers?.Authorization?.replace('Bearer ', '');
    if (url.pathname === '/auth/v1/user') return response({ id: token, is_anonymous: token === guest });
    if (url.pathname.endsWith('/user_posts')) return response(posts.filter((post) => post.author_id === url.searchParams.get('author_id')?.slice(3)));
    if (url.pathname.endsWith('/post_map_points')) return response(posts.filter((post) => post.status === 'published').map((post) => ({ post_id: post.id, public_image_path: `${post.id}/public.png`, published_at: post.created_at })));
    if (url.pathname.startsWith('/storage/v1/object/sign/')) return response({ signedURL: `${url.pathname.replace('/storage/v1', '')}?token=fixture` });
    if (url.pathname.endsWith('/post_author_profiles')) return response([]);
    if (url.pathname.endsWith('/set-author-name')) return response({ ok: true, name: JSON.parse(init.body).name });
    if (url.pathname.endsWith('/delete-post')) return response({ ok: true, deleted: true });
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  return { api: createMyPostsApi({ fetchImpl, storage, config }), calls, values };
}

test('signed-out profile does not create an account or make network requests', async () => {
  const { api, calls } = fixture({ entries: [] });
  assert.equal(await api.restore(), null);
  assert.deepEqual(await api.listPosts(), []);
  assert.equal(calls.length, 0);
});

test('saved guest can list rectangular thumbnails and delete its own post', async () => {
  const { api, calls } = fixture();
  assert.equal((await api.restore()).isAnonymous, true);
  const posts = await api.listPosts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].image.width, 192);
  assert.equal(posts[0].image.height, 96);
  assert.match(posts[0].image.dataUrl, /object\/public\/post-public/);
  assert.equal(posts[0].sessionScope, 'device');
  assert.deepEqual(await api.remove(postId), { ok: true, deleted: true });
  const deletion = calls.find(({ url }) => url.pathname.endsWith('/delete-post'));
  assert.equal(deletion.init.headers.Authorization, `Bearer ${guest}`);
  assert.deepEqual(JSON.parse(deletion.init.body), { postId });
});

test('account and this-device posts retain separate verified ownership tokens', async () => {
  const { api, calls } = fixture({ entries: [[OWNER, saved(owner)], [DEVICE, saved(guest)]], posts: [row(), row(otherId, owner)] });
  const posts = await api.listPosts();
  assert.equal(posts.length, 2);
  assert.equal(api.user.id, owner);
  assert.equal(posts.find((post) => post.id === otherId).sessionScope, 'account');
  await api.remove(postId);
  await api.remove(otherId);
  assert.deepEqual(calls.filter(({ url }) => url.pathname.endsWith('/delete-post')).map(({ init }) => init.headers.Authorization), [`Bearer ${guest}`, `Bearer ${owner}`]);
});

test('foreign, deleted and malformed records never appear or authorize deletion', async () => {
  const { api, calls } = fixture({ handler: (url) => url.pathname.endsWith('/user_posts') ? response([row(), row(otherId, owner), row(otherId, guest, { deleted_at: '2026-10-06', delete_cleanup_completed_at: '2026-10-06' }), row('invalid')]) : null });
  assert.deepEqual((await api.listPosts()).map((post) => post.id), [postId]);
  await assert.rejects(api.remove(otherId), /所有者/);
  assert.equal(calls.some(({ url }) => url.pathname.endsWith('/delete-post')), false);
});

test('nonpublic thumbnail is signed briefly, and a foreign signed URL is rejected', async () => {
  const { api, calls } = fixture({ posts: [row(postId, guest, { status: 'pending' })] });
  const [post] = await api.listPosts();
  assert.match(post.image.dataUrl, /object\/sign\/post-quarantine/);
  assert.equal(JSON.parse(calls.find(({ url }) => url.pathname.startsWith('/storage/v1/object/sign/')).init.body).expiresIn, 300);
  const malicious = fixture({ posts: [row(postId, guest, { status: 'pending' })], handler: (url) => url.pathname.startsWith('/storage/v1/object/sign/') ? response({ signedURL: 'https://other.example/image?token=fake' }) : null });
  assert.equal((await malicious.api.listPosts())[0].image.dataUrl, '');
});

test('logout during auth verification never resurrects a session or deletes', async () => {
  const { api, values, calls } = fixture({ handler: (url, init, storage) => {
    if (url.pathname === '/auth/v1/user') { storage.delete(DEVICE); return response({ id: guest, is_anonymous: true }); }
  } });
  await assert.rejects(api.restore(), /ログイン状態/);
  assert.equal(values.has(DEVICE), false);
  assert.equal(calls.some(({ url }) => url.pathname.endsWith('/delete-post')), false);
});

test('deletion rechecks the saved identity and denies an account switch', async () => {
  const { api, values, calls } = fixture();
  await api.listPosts();
  values.set(DEVICE, saved(owner));
  await assert.rejects(api.remove(postId), /ログイン状態/);
  assert.equal(calls.some(({ url }) => url.pathname.endsWith('/delete-post')), false);
});

test('cleanup failure retains ownership for an idempotent retry', async () => {
  let attempts = 0;
  const { api } = fixture({ handler: (url) => {
    if (url.pathname.endsWith('/delete-post') && ++attempts === 1) return response({ deleted: true, error: 'storage_cleanup_failed' }, 503);
  } });
  await api.listPosts();
  await assert.rejects(api.remove(postId), /公開は停止/);
  assert.deepEqual(await api.remove(postId), { ok: true, deleted: true });
  assert.equal(attempts, 2);
});

test('auth claimed-id mismatch fails closed', async () => {
  const { api } = fixture({ handler: (url) => url.pathname === '/auth/v1/user' ? response({ id: owner, is_anonymous: false }) : null });
  await assert.rejects(api.listPosts(), /ログイン状態/);
});


test('unfinished deletion remains retryable after reload and never requests its private image', async () => {
  const pending = row(postId, guest, { status: 'hidden', deleted_at: '2026-10-06T00:00:00Z', delete_cleanup_completed_at: null });
  const { api, calls } = fixture({ posts: [pending] });
  const [post] = await api.listPosts();
  assert.equal(post.deletionPending, true);
  assert.equal(post.image.dataUrl, '');
  assert.equal(calls.some(({ url }) => url.pathname.includes('/storage/')), false);
  assert.deepEqual(await api.remove(postId), { ok: true, deleted: true });
});


test('author names are explicit, Unicode bounded, and saved with the selected owner token', async () => {
  const { api, calls } = fixture({ entries: [[OWNER, saved(owner)], [DEVICE, saved(guest)]] });
  const profiles = await api.listAuthorProfiles();
  assert.deepEqual(profiles.map((profile) => profile.name), ['', '']);
  const name = '🎨'.repeat(40);
  assert.deepEqual(await api.saveAuthorName('device', name), { ok: true, name });
  const request = calls.find(({ url }) => url.pathname.endsWith('/set-author-name'));
  assert.equal(request.init.headers.Authorization, `Bearer ${guest}`);
  assert.deepEqual(JSON.parse(request.init.body), { name });
  await assert.rejects(api.saveAuthorName('device', name + '🎨'), /1〜40文字/);
  await assert.rejects(api.saveAuthorName('device', '改行\n名前'), /改行/);
});

test('author-name form cannot save into an account switched since it was loaded', async () => {
  const { api, values, calls } = fixture();
  await api.listAuthorProfiles();
  values.set(DEVICE, saved(owner));
  await assert.rejects(api.saveAuthorName('device', '作者'), /ログイン状態/);
  assert.equal(calls.some(({ url }) => url.pathname.endsWith('/set-author-name')), false);
});
