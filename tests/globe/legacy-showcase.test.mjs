import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCell } from '../../js/globe/geometry.mjs';
import { projectLegacyShowcase } from '../../js/globe/legacy-showcase.mjs';
import { createSupabaseGlobeStore } from '../../js/globe/post-supabase.mjs';

const id = '123e4567-e89b-42d3-a456-426614174000';
const cell = lookupCell(139.69, 35.68);
const point = { social_post_id: id, globe_cell_id: cell.id };
const post = {
  id, status: 'published', post_kind: 'image', distribution_mode: 'showcase',
  title: '昔の街角', caption: '元の作品', creator_display_name: '作者',
  media_object_path: `posts/${id}/image.png`, published_at: '2026-05-01T00:00:00Z',
  creator_user_id: 'private-owner', exact_latitude: 35.681234,
};
const projectUrl = 'https://example.supabase.co';

test('owner-placed old artwork keeps its original public image and credit, with only the chosen cell', () => {
  const projected = projectLegacyShowcase(point, post, projectUrl);
  assert.equal(projected.id, `showcase:${id}`);
  assert.equal(projected.image.dataUrl, `${projectUrl}/storage/v1/object/public/social-posts/posts/${id}/image.png`);
  assert.equal(projected.title, post.title);
  assert.equal(projected.author.name, '作者');
  assert.equal(projected.pin.cellId, cell.id);
  assert.equal(projected.createdAt, Date.parse(post.published_at));
  assert.equal(JSON.stringify(projected).includes('private-owner'), false);
  assert.equal(JSON.stringify(projected).includes('35.681234'), false);
});

test('unplaced, unpublished, paid, mismatched, malformed-path, and invalid-cell rows stay off the globe', () => {
  const invalid = [
    [null, post],
    [point, { ...post, status: 'hidden' }],
    [point, { ...post, post_kind: 'market', distribution_mode: 'paid' }],
    [{ ...point, social_post_id: '223e4567-e89b-42d3-a456-426614174000' }, post],
    [point, { ...post, media_object_path: '../private/image.png' }],
    [point, { ...post, media_object_path: 'posts/image.png?token=secret' }],
    [{ ...point, globe_cell_id: 'globe:wrong:0:0' }, post],
  ];
  for (const [placement, work] of invalid) assert.equal(projectLegacyShowcase(placement, work, projectUrl), null);
});

test('globe joins only author-placed public showcase images with current map posts', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); requests.push({ url, options });
    const rows = url.pathname.endsWith('/post_map_points') ? [{
      post_id: 'new-map-post', title: '新しい投稿', caption: '', public_image_path: 'public/new.png',
      published_at: '2026-06-01T00:00:00Z', globe_cell_id: cell.id, post_kind: 'pixel_art'
    }] : url.pathname.endsWith('/social_post_map_points') ? [point] : url.pathname.endsWith('/social_posts') ? [post] : [];
    return { ok: true, status: 200, json: async () => rows };
  };
  try {
    const store = createSupabaseGlobeStore();
    await store.ready;
    assert.deepEqual(store.list().map(({ id }) => id), ['new-map-post', `showcase:${id}`]);
    const socialRequest = requests.find(({ url }) => url.pathname.endsWith('/social_posts'));
    assert.equal(socialRequest.url.searchParams.get('status'), 'eq.published');
    assert.equal(socialRequest.url.searchParams.get('post_kind'), 'eq.image');
    assert.equal(socialRequest.url.searchParams.get('distribution_mode'), 'eq.showcase');
    assert.equal(socialRequest.url.searchParams.get('select').includes('creator_user_id'), false);
    for (const { options } of requests) {
      assert.ok(options.headers.apikey);
      assert.equal('Authorization' in options.headers, false);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('globe posting keeps the real session JWT in Authorization', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  const values = new Map([['PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'real-user-jwt', expires_at: Math.floor(Date.now() / 1000) + 3600 })]]);
  const calls = [];
  globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  globalThis.fetch = async (input, options = {}) => {
    calls.push({ url: new URL(String(input)), options });
    return { ok: true, status: 200, json: async () => ({ postId: 'posted-id', status: 'pending' }) };
  };
  try {
    const store = createSupabaseGlobeStore(); await store.ready;
    await store.add({ title: '投稿', caption: '', postKind: 'pixel_art', image: { mimeType: 'image/png', size: 1, width: 1, height: 1, colorCount: 1, dataUrl: 'data:image/png;base64,AA==' }, pin: { cellId: cell.id } });
    const postCall = calls.find(({ url }) => url.pathname.endsWith('/functions/v1/create-post'));
    assert.equal(postCall.options.headers.apikey, 'sb_publishable_gnc61sD2hZvGHhEW8bQMoA_lrL07SN4');
    assert.equal(postCall.options.headers.Authorization, 'Bearer real-user-jwt');
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('a verified existing owner session is used for new globe posts and returned as the author', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  const ownerId = '323e4567-e89b-42d3-a456-426614174000';
  const values = new Map([['PiXiEED:legacy-owner-session:v1', JSON.stringify({ access_token: 'existing-owner-jwt', refresh_token: 'owner-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 })]]);
  const calls = [];
  globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: ownerId, is_anonymous: false }) };
    if (url.pathname.endsWith('/functions/v1/create-post')) return { ok: true, status: 201, json: async () => ({ postId: 'owner-post', status: 'pending' }) };
    return { ok: true, status: 200, json: async () => [] };
  };
  try {
    const store = createSupabaseGlobeStore(); await store.ready;
    const result = await store.add({ title: 'Owner投稿', caption: '', postKind: 'pixel_art', author: { id: 'anonymous', name: 'ゲスト' }, image: { mimeType: 'image/png', size: 1, width: 1, height: 1, colorCount: 1, dataUrl: 'data:image/png;base64,AA==' }, pin: { cellId: cell.id } });
    const signup = calls.find(({ url }) => url.pathname.endsWith('/auth/v1/signup'));
    const postCall = calls.find(({ url }) => url.pathname.endsWith('/functions/v1/create-post'));
    assert.equal(signup, undefined);
    assert.equal(postCall.options.headers.Authorization, 'Bearer existing-owner-jwt');
    assert.deepEqual(result.author, { id: ownerId, name: '' });
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('an invalid saved owner session stops posting without guest signup fallback', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  const values = new Map([['PiXiEED:legacy-owner-session:v1', JSON.stringify({ access_token: 'anonymous-owner-jwt', refresh_token: 'owner-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 })]]);
  const calls = [];
  globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: '423e4567-e89b-42d3-a456-426614174000', is_anonymous: true }) };
    return { ok: false, status: 401, json: async () => ({ message: 'expired' }) };
  };
  try {
    const store = createSupabaseGlobeStore(); await store.ready;
    const post = { title: '投稿', caption: '', image: { mimeType: 'image/png', size: 1, width: 1, height: 1, colorCount: 1, dataUrl: 'data:image/png;base64,AA==' }, pin: { cellId: cell.id } };
    await assert.rejects(store.add(post), /もう一度ログイン/);
    await assert.rejects(store.add(post), /もう一度ログイン/);
    assert.ok(values.has('PiXiEED:legacy-owner-session:v1'));
    assert.equal(calls.some(({ url }) => url.pathname.endsWith('/auth/v1/signup')), false);
    assert.equal(calls.some(({ url }) => url.pathname.endsWith('/functions/v1/create-post')), false);
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('refresh identity mismatch remains fail-closed on every add retry', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage; const originalNow = Date.now;
  const ownerId = '323e4567-e89b-42d3-a456-426614174000';
  const otherId = '423e4567-e89b-42d3-a456-426614174000';
  const baseNow = originalNow(); let nowReads = 0;
  Date.now = () => { nowReads += 1; return baseNow + (nowReads === 1 ? 0 : 40_000); };
  const values = new Map([['PiXiEED:legacy-owner-session:v1', JSON.stringify({ access_token: 'owner-jwt', refresh_token: 'owner-refresh', expires_at: Math.floor(baseNow / 1000) + 60, user_id: ownerId })]]);
  const calls = [];
  globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/token')) return { ok: true, status: 200, json: async () => ({ access_token: 'switched-owner-jwt', refresh_token: 'owner-refresh-2', expires_at: Math.floor(baseNow / 1000) + 3600 }) };
    if (url.pathname.endsWith('/auth/v1/user')) {
      const id = options.headers.Authorization === 'Bearer owner-jwt' ? ownerId : otherId;
      return { ok: true, status: 200, json: async () => ({ id, is_anonymous: false }) };
    }
    return { ok: true, status: 200, json: async () => [] };
  };
  try {
    const store = createSupabaseGlobeStore(); await store.ready;
    const post = { title: '投稿', caption: '', image: { mimeType: 'image/png', size: 1, width: 1, height: 1, colorCount: 1, dataUrl: 'data:image/png;base64,AA==' }, pin: { cellId: cell.id } };
    await assert.rejects(store.add(post), /もう一度ログイン/);
    await assert.rejects(store.add(post), /もう一度ログイン/);
    assert.ok(values.has('PiXiEED:legacy-owner-session:v1'));
    assert.equal(JSON.parse(values.get('PiXiEED:legacy-owner-session:v1')).user_id, ownerId);
    assert.equal(calls.some(({ url }) => url.pathname.endsWith('/auth/v1/signup')), false);
    assert.equal(calls.some(({ url }) => url.pathname.endsWith('/functions/v1/create-post')), false);
  } finally { Date.now = originalNow; globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('without an owner session globe posting retains anonymous signup', async () => {
  const originalFetch = globalThis.fetch; const originalStorage = globalThis.localStorage;
  const values = new Map();
  const calls = [];
  globalThis.localStorage = { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/signup')) return { ok: true, status: 200, json: async () => ({ access_token: 'guest-jwt', refresh_token: 'guest-refresh' }) };
    if (url.pathname.endsWith('/functions/v1/create-post')) return { ok: true, status: 201, json: async () => ({ postId: 'guest-post', status: 'pending' }) };
    return { ok: true, status: 200, json: async () => [] };
  };
  try {
    const store = createSupabaseGlobeStore(); await store.ready;
    const result = await store.add({ title: 'ゲスト投稿', caption: '', author: { id: 'anonymous', name: 'ゲスト' }, image: { mimeType: 'image/png', size: 1, width: 1, height: 1, colorCount: 1, dataUrl: 'data:image/png;base64,AA==' }, pin: { cellId: cell.id } });
    const postCall = calls.find(({ url }) => url.pathname.endsWith('/functions/v1/create-post'));
    assert.equal(calls.filter(({ url }) => url.pathname.endsWith('/auth/v1/signup')).length, 1);
    assert.equal(postCall.options.headers.Authorization, 'Bearer guest-jwt');
    assert.deepEqual(result.author, { id: 'anonymous', name: 'ゲスト' });
  } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
});

test('unavailable legacy placement table does not hide current map posts', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/social_post_map_points')) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => [{
      post_id: 'current-post', public_image_path: 'public/image.png', published_at: '2026-06-01T00:00:00Z', globe_cell_id: cell.id
    }] };
  };
  try {
    const store = createSupabaseGlobeStore();
    await store.ready;
    assert.deepEqual(store.list().map(({ id }) => id), ['current-post']);
  } finally { globalThis.fetch = originalFetch; }
});
