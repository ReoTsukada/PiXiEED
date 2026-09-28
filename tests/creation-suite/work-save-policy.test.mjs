import test from 'node:test';
import assert from 'node:assert/strict';
import { assertOwnPublicSources, assertOwnWorkProject, getPxdPublicSources, WORK_SAVE_FORBIDDEN } from '../../js/creation/work-save-policy.mjs';
import { verifyPublicWorkOwnership } from '../../js/globe/post-supabase.mjs';

const ownerId = '123e4567-e89b-42d3-a456-426614174000';
const otherId = '223e4567-e89b-42d3-a456-426614174000';
const mapUrl = 'https://kyyiuakrqomzlikfaire.supabase.co/storage/v1/object/public/post-public/posts/art.png';
const publicSource = { type: 'public', postId: `map:${otherId}`, title: '公開作品', url: mapUrl, fingerprint: 'a'.repeat(64), width: 32, height: 32 };

function project(payloads) {
  return {
    format: 'PXD', version: 3, projectId: 'project-1', revisionId: 'revision-1', manifest: {},
    entries: payloads.map(([path, payload]) => ({ path, bytes: new TextEncoder().encode(typeof payload === 'string' ? payload : JSON.stringify(payload)) }))
  };
}

const jigsaw = (source, originalRefs = { source }) => ({
  schemaVersion: 1, tool: 'jigsaw', document: { source }, portable: { originalRefs }
});

test('local PXD passes without starting auth lookup', async () => {
  let calls = 0;
  const local = project([['puzzles/jigsaw.json', jigsaw({ type: 'file', fingerprint: 'b'.repeat(64), width: 16, height: 16 })]]);
  assert.deepEqual(getPxdPublicSources(local), []);
  assert.equal(await assertOwnWorkProject(local, { verifyPublicSource: async () => { calls += 1; return true; } }), local);
  assert.equal(calls, 0);
});

test('public work by another person blocks save and exposes the friendly denial', async () => {
  const foreign = project([['puzzles/jigsaw.json', jigsaw(publicSource)]]);
  await assert.rejects(assertOwnWorkProject(foreign, { verifyPublicSource: async () => false }), (error) => {
    assert.equal(error.code, WORK_SAVE_FORBIDDEN);
    assert.match(error.message, /他の人の投稿作品は遊ぶ専用です/);
    return true;
  });
});

test('owned public source passes and duplicate refs are verified once', async () => {
  const local = { type: 'file', fingerprint: 'c'.repeat(64), width: 16, height: 16 };
  const mixed = project([['puzzles/jigsaw.json', jigsaw(publicSource)], ['puzzles/hidden_object.json', {
    schemaVersion: 1, tool: 'hidden_object', document: { source: local }, portable: { originalRefs: { source: publicSource } }
  }]]);
  let calls = 0;
  assert.deepEqual(getPxdPublicSources(mixed), [publicSource, publicSource, publicSource]);
  assert.equal(await assertOwnWorkProject(mixed, { verifyPublicSource: async () => { calls += 1; return true; } }), mixed);
  assert.equal(calls, 1);
});

test('hybrid work is denied when any public before/after reference is foreign', async () => {
  const mixed = project([['puzzles/spot_difference.json', {
    schemaVersion: 1, tool: 'spot_difference', document: { before: { type: 'file' }, after: { type: 'file' } },
    portable: { originalRefs: { before: { type: 'file' }, after: publicSource } }
  }]]);
  assert.deepEqual(getPxdPublicSources(mixed), [publicSource]);
  await assert.rejects(assertOwnWorkProject(mixed, { verifyPublicSource: async () => false }), { code: WORK_SAVE_FORBIDDEN });
});

test('malformed known puzzle JSON and malformed public refs fail closed', async () => {
  for (const path of ['puzzles/jigsaw.json', 'puzzles/spot_difference.json', 'puzzles/hidden_object.json']) {
    const missing = project([[path, { document: {}, portable: { originalRefs: {} } }]]);
    await assert.rejects(assertOwnWorkProject(missing, { verifyPublicSource: async () => true }), { code: WORK_SAVE_FORBIDDEN });
  }
  for (const payload of ['{', jigsaw({ type: 'public', postId: 'forged', url: 'https://evil.example/a.png' })]) {
    const candidate = project([['puzzles/jigsaw.json', payload]]);
    await assert.rejects(assertOwnWorkProject(candidate, { verifyPublicSource: async () => true }), { code: WORK_SAVE_FORBIDDEN });
  }
  await assert.rejects(assertOwnPublicSources([{ type: 'public', postId: 'map:x' }], { verifyPublicSource: async () => true }), { code: WORK_SAVE_FORBIDDEN });
  await assert.rejects(assertOwnPublicSources([publicSource], { verifyPublicSource: async () => { throw new Error('offline'); } }), { code: WORK_SAVE_FORBIDDEN });
});

test('public ownership lookup is authenticated, read only, and checks server owner and exact image', async (t) => {
  const store = new Map([['PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'test-access', expires_at: Math.floor(Date.now() / 1000) + 3600 })]]);
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldFetch = globalThis.fetch;
  const calls = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  } });
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId });
    if (url.pathname.endsWith('/user_posts')) return response([{ id: otherId, author_id: ownerId, status: 'published' }]);
    if (url.pathname.endsWith('/post_map_points')) return response([{ post_id: otherId, published_at: '2026-09-01T00:00:00Z', public_image_path: 'posts/art.png' }]);
    return response([], 404);
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
    else delete globalThis.localStorage;
  });

  assert.equal(await verifyPublicWorkOwnership(publicSource), true);
  assert.equal(await verifyPublicWorkOwnership({ ...publicSource, author_id: otherId }), true);
  assert.equal(calls.some(({ options }) => options.method && options.method !== 'GET'), false);
  assert.equal(calls.filter(({ url }) => url.pathname.endsWith('/auth/v1/user')).length, 4);
  assert.ok(calls.filter(({ url }) => !url.pathname.endsWith('/auth/v1/user')).every(({ options }) => options.headers.Authorization === 'Bearer test-access'));

  calls.length = 0;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId });
    if (url.pathname.endsWith('/user_posts')) return response([{ id: otherId, author_id: otherId, status: 'published' }]);
    throw new Error('must stop after forged author mismatch');
  };
  assert.equal(await verifyPublicWorkOwnership(publicSource), false);
  assert.equal(calls.some(({ url }) => url.pathname.endsWith('/post_map_points')), false);

  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId });
    if (url.pathname.endsWith('/user_posts')) return response([{ id: otherId, author_id: ownerId, status: 'published' }]);
    if (url.pathname.endsWith('/post_map_points')) return response([{ post_id: otherId, published_at: '2026-09-01T00:00:00Z', public_image_path: 'posts/art.png' }]);
    return response([], 404);
  };
  assert.equal(await verifyPublicWorkOwnership({ ...publicSource, url: mapUrl.replace('posts/art.png', 'posts/forged.png') }), false);

  calls.length = 0;
  const socialId = '323e4567-e89b-42d3-a456-426614174000';
  const showcaseUrl = 'https://kyyiuakrqomzlikfaire.supabase.co/storage/v1/object/public/social-posts/posts/art.png';
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId });
    if (url.pathname.endsWith('/social_posts')) return response([{
      id: socialId, creator_user_id: ownerId, status: 'published', post_kind: 'image',
      distribution_mode: 'showcase', media_object_path: 'posts/art.png'
    }]);
    return response([], 404);
  };
  assert.equal(await verifyPublicWorkOwnership({ ...publicSource, postId: `showcase:${socialId}`, url: showcaseUrl }), true);
  assert.ok(calls.some(({ url }) => url.pathname.endsWith('/social_posts') && url.searchParams.get('select').includes('creator_user_id')));

  calls.length = 0;
  const puzzleId = 'puzzle_123';
  const puzzleUrl = `https://kyyiuakrqomzlikfaire.supabase.co/storage/v1/object/public/pixfind-puzzles/puzzles/${puzzleId}/original.png`;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId });
    if (url.pathname.endsWith('/social_posts')) return response([{
      id: socialId, creator_user_id: ownerId, status: 'published', post_kind: 'pixfind',
      distribution_mode: 'pixfind', pixfind_puzzle_id: puzzleId
    }]);
    if (url.pathname.endsWith('/pixfind_puzzles')) return response([{ id: puzzleId, original_url: puzzleUrl }]);
    return response([], 404);
  };
  assert.equal(await verifyPublicWorkOwnership({ ...publicSource, postId: `pixfind:${socialId}:${puzzleId}`, puzzleId, url: puzzleUrl }), true);
  assert.ok(calls.some(({ url }) => url.pathname.endsWith('/pixfind_puzzles') && url.searchParams.get('original_url') === null));

  let releaseAuth;
  let authStartedResolve;
  const authStarted = new Promise((resolve) => { authStartedResolve = resolve; });
  const authResponse = new Promise((resolve) => { releaseAuth = resolve; });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/v1/user')) { authStartedResolve(); return authResponse; }
    return response([], 404);
  };
  const pendingOwnership = verifyPublicWorkOwnership(publicSource);
  await authStarted;
  store.delete('PiXiEED:supabase-session:v1');
  releaseAuth(response({ id: ownerId }));
  assert.equal(await pendingOwnership, false);
  assert.equal(store.has('PiXiEED:supabase-session:v1'), false);
});

test('expired legacy owner refresh persists only while the original account session remains active', async (t) => {
  const ownerSessionKey = 'PiXiEED:legacy-owner-session:v1';
  const store = new Map([[ownerSessionKey, JSON.stringify({
    access_token: 'expired-owner-access', refresh_token: 'old-owner-refresh',
    expires_at: Math.floor(Date.now() / 1000) - 60, user_id: ownerId
  })]]);
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldFetch = globalThis.fetch;
  const calls = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key)
  } });
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/token')) return response({
      access_token: 'refreshed-owner-access', refresh_token: 'rotated-owner-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId, is_anonymous: false });
    if (url.pathname.endsWith('/user_posts')) return response([{ id: otherId, author_id: ownerId, status: 'published' }]);
    if (url.pathname.endsWith('/post_map_points')) return response([{ post_id: otherId, published_at: '2026-09-01T00:00:00Z', public_image_path: 'posts/art.png' }]);
    return response([], 404);
  };
  t.after(() => {
    globalThis.fetch = oldFetch;
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage);
    else delete globalThis.localStorage;
  });

  assert.equal(await verifyPublicWorkOwnership(publicSource), true);
  assert.equal(calls.filter(({ url }) => url.pathname.endsWith('/auth/v1/token')).length, 1);
  assert.equal(JSON.parse(store.get(ownerSessionKey)).access_token, 'refreshed-owner-access');
  assert.equal(JSON.parse(store.get(ownerSessionKey)).refresh_token, 'rotated-owner-refresh');

  store.set(ownerSessionKey, JSON.stringify({
    access_token: 'logout-race-access', refresh_token: 'logout-race-refresh',
    expires_at: Math.floor(Date.now() / 1000) - 60, user_id: ownerId
  }));
  let releaseAuth;
  let authStartedResolve;
  const authStarted = new Promise((resolve) => { authStartedResolve = resolve; });
  const authResponse = new Promise((resolve) => { releaseAuth = resolve; });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/auth/v1/token')) return response({
      access_token: 'logout-race-refreshed', refresh_token: 'logout-race-rotated',
      expires_at: Math.floor(Date.now() / 1000) + 3600
    });
    if (url.pathname.endsWith('/auth/v1/user')) { authStartedResolve(); return authResponse; }
    throw new Error('ownership DB lookup must not run after logout');
  };
  const pending = verifyPublicWorkOwnership(publicSource);
  await authStarted;
  store.delete(ownerSessionKey);
  releaseAuth(response({ id: ownerId, is_anonymous: false }));
  assert.equal(await pending, false);
  assert.equal(store.has(ownerSessionKey), false);
});

function response(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
