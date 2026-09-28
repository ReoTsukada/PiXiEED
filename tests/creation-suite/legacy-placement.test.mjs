import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCell } from '../../js/globe/geometry.mjs';
import { cellFromPlaceInput, createLegacyPlacementApi, readOwnerAuthCallback } from '../../js/creation/legacy-placement.mjs';

const ownerId = '123e4567-e89b-42d3-a456-426614174000';
const workId = '223e4567-e89b-42d3-a456-426614174000';
const config = { url: 'https://project.supabase.co', publishableKey: 'public-test-key' };
const storage = () => {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) || null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
};
const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const session = { access_token: 'verified-access', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 };

test('old account callback accepts bearer tokens only and coordinates become a coarse globe cell', () => {
  assert.deepEqual(readOwnerAuthCallback('#access_token=access&refresh_token=refresh&token_type=bearer&expires_in=3600').session.access_token, 'access');
  assert.equal(readOwnerAuthCallback('#access_token=access&refresh_token=refresh&token_type=other').session, undefined);
  assert.equal(readOwnerAuthCallback('#puzzle=old-slug'), null);
  const cell = cellFromPlaceInput('35.6895, 139.6917');
  assert.equal(cell.id, lookupCell(139.6917, 35.6895).id);
});

test('verified owner lists only their public showcase, then saves the chosen cell without exact coordinates', async () => {
  const calls = [];
  const api = createLegacyPlacementApi({ config, storage: storage(), fetchImpl: async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId, is_anonymous: false });
    if (url.pathname.endsWith('/social_posts')) return response([
      { id: workId, title: '以前の絵', status: 'published', post_kind: 'image', distribution_mode: 'showcase', media_object_path: 'posts/art.png', published_at: '2026-01-01T00:00:00Z' },
      { id: '323e4567-e89b-42d3-a456-426614174000', title: '画像がない絵', status: 'published', post_kind: 'image', distribution_mode: 'showcase', media_object_path: null, published_at: '2026-01-01T00:00:00Z' }
    ]);
    if (url.pathname.endsWith('/social_post_map_points') && options.method === 'POST') return response([{ social_post_id: workId }], 201);
    if (url.pathname.endsWith('/social_post_map_points')) return response([]);
    return response({}, 404);
  } });
  assert.deepEqual(await api.restore(session), { id: ownerId });
  assert.deepEqual((await api.listWorks()).map(({ id }) => id), [workId]);
  assert.equal((await api.listPlacements([workId])).size, 0);
  const cell = await api.place(workId, '35.6895, 139.6917');
  const listing = calls.find(({ url }) => url.pathname.endsWith('/social_posts'));
  assert.equal(listing.url.searchParams.get('creator_user_id'), `eq.${ownerId}`);
  assert.equal(listing.url.searchParams.get('media_object_path'), 'not.is.null');
  assert.equal(listing.options.headers.Authorization, 'Bearer verified-access');
  assert.equal(listing.options.headers.apikey, config.publishableKey);
  const save = calls.find(({ options }) => options.method === 'POST');
  const body = JSON.parse(save.options.body);
  assert.deepEqual(body, { social_post_id: workId, globe_cell_id: cell.id, projection_version: cell.version, globe_band: cell.band, globe_column: cell.column });
  assert.equal('latitude' in body, false);
  assert.equal('longitude' in body, false);
});

test('owner lists only their own new posts and rejects unknown or malformed rows', async () => {
  const calls = [];
  const rows = [
    { id: workId, author_id: ownerId, title: '審査中の絵', status: 'pending', post_kind: 'pixel_art', image_path: 'private/secret.png', moderation_note: 'internal' },
    { id: '323e4567-e89b-42d3-a456-426614174000', author_id: ownerId, title: '公開したカメラ作品', status: 'published', post_kind: 'pixel_camera' },
    { id: '423e4567-e89b-42d3-a456-426614174000', author_id: ownerId, title: '非公開の絵', status: 'rejected', post_kind: 'pixel_art' },
    { id: '523e4567-e89b-42d3-a456-426614174000', author_id: ownerId, title: '隠した絵', status: 'hidden', post_kind: 'pixel_art' },
    { id: '623e4567-e89b-42d3-a456-426614174000', author_id: workId, title: '他人の作品', status: 'pending', post_kind: 'pixel_art' },
    { id: 'broken-id', author_id: ownerId, title: '壊れたID', status: 'pending', post_kind: 'pixel_art' },
    { id: '723e4567-e89b-42d3-a456-426614174000', author_id: ownerId, title: '未知状態', status: 'approved', post_kind: 'pixel_art' },
    { id: '823e4567-e89b-42d3-a456-426614174000', author_id: ownerId, title: '   ', status: 'pending', post_kind: 'pixel_art' },
    { id: '923e4567-e89b-42d3-a456-426614174000', author_id: ownerId, title: '状態なし', post_kind: 'pixel_art' },
    { id: 'a23e4567-e89b-42d3-a456-426614174000', title: '投稿者なし', status: 'pending', post_kind: 'pixel_art' },
    { id: 'b23e4567-e89b-42d3-a456-426614174000', author_id: ownerId, title: '未知の方法', status: 'pending', post_kind: 'pixel_video' },
    { id: 'c23e4567-e89b-42d3-a456-426614174000', author_id: ownerId, title: '方法なし', status: 'pending' }
  ];
  const api = createLegacyPlacementApi({ config, storage: storage(), fetchImpl: async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId, is_anonymous: false });
    if (url.pathname.endsWith('/user_posts')) return response(rows);
    return response([]);
  } });
  await api.restore(session);
  const posts = await api.listUserPosts();
  const request = calls.find(({ url }) => url.pathname.endsWith('/user_posts'));
  assert.equal(request.url.searchParams.get('author_id'), `eq.${ownerId}`);
  assert.equal(request.url.searchParams.get('select'), 'id,author_id,title,status,post_kind');
  assert.equal(request.url.searchParams.get('order'), 'created_at.desc');
  assert.equal(request.options.headers.Authorization, 'Bearer verified-access');
  assert.deepEqual(posts.map(({ id, postKind, status }) => ({ id, postKind, status })), [
    { id: workId, postKind: 'pixel_art', status: 'pending' },
    { id: '323e4567-e89b-42d3-a456-426614174000', postKind: 'pixel_camera', status: 'published' },
    { id: '423e4567-e89b-42d3-a456-426614174000', postKind: 'pixel_art', status: 'rejected' },
    { id: '523e4567-e89b-42d3-a456-426614174000', postKind: 'pixel_art', status: 'hidden' }
  ]);
  assert.deepEqual(Object.keys(posts[0]).sort(), ['id', 'postKind', 'status', 'title']);
  assert.equal(JSON.stringify(posts).includes('private/secret.png'), false);
  assert.equal(JSON.stringify(posts).includes('internal'), false);
});

test('new post listing falls back when post_kind is not deployed and treats old rows as hand-authored', async () => {
  const calls = [];
  const oldRow = { id: workId, author_id: ownerId, title: '以前の投稿', status: 'published' };
  const api = createLegacyPlacementApi({ config, storage: storage(), fetchImpl: async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId, is_anonymous: false });
    if (url.pathname.endsWith('/user_posts')) return url.searchParams.get('select').includes('post_kind') ? response({ message: 'column missing' }, 400) : response([oldRow]);
    return response([]);
  } });
  await api.restore(session);
  assert.deepEqual(await api.listUserPosts(), [{ id: workId, title: '以前の投稿', postKind: 'pixel_art', status: 'published' }]);
  const requests = calls.filter(({ url }) => url.pathname.endsWith('/user_posts'));
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url.searchParams.get('select'), 'id,author_id,title,status,post_kind');
  assert.equal(requests[1].url.searchParams.get('select'), 'id,author_id,title,status');
  assert.equal(requests[0].url.searchParams.get('author_id'), `eq.${ownerId}`);
  assert.equal(requests[1].url.searchParams.get('author_id'), `eq.${ownerId}`);
});

test('anonymous or unverified sessions cannot place a legacy work', async () => {
  const api = createLegacyPlacementApi({ config, storage: storage(), fetchImpl: async () => response({ id: ownerId, is_anonymous: true }) });
  assert.equal(await api.restore(session), null);
  await assert.rejects(api.place(workId, '35.6895, 139.6917'), /旧アカウント/);
});

test('owner access token is available only after verified restoration and refresh preserves that owner', async () => {
  const calls = [];
  const local = storage();
  const expired = { ...session, expires_at: Math.floor(Date.now() / 1000) - 60 };
  local.setItem('PiXiEED:legacy-owner-session:v1', JSON.stringify(expired));
  const api = createLegacyPlacementApi({ config, storage: local, fetchImpl: async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/token')) return response({ ...session, access_token: 'refreshed-owner-jwt' });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId, is_anonymous: false });
    return response({}, 404);
  } });
  assert.equal(api.hasSavedSession(), true);
  assert.deepEqual(await api.restore(), { id: ownerId });
  assert.equal(await api.getAccessToken(), 'refreshed-owner-jwt');
  const userCalls = calls.filter(({ url }) => url.pathname.endsWith('/auth/v1/user'));
  assert.ok(userCalls.length >= 1);
  assert.ok(userCalls.every(({ options }) => options.headers.Authorization === 'Bearer refreshed-owner-jwt'));
});

test('an owner key with an anonymous or unverifiable session remains a hard failure', async () => {
  const local = storage();
  local.setItem('PiXiEED:legacy-owner-session:v1', JSON.stringify(session));
  const api = createLegacyPlacementApi({ config, storage: local, fetchImpl: async (input) => {
    if (String(input).includes('/auth/v1/user')) return response({ id: ownerId, is_anonymous: true });
    return response({}, 401);
  } });
  assert.equal(api.hasSavedSession(), true);
  assert.equal(await api.restore(), null);
  await assert.rejects(api.getAccessToken(), /旧アカウント/);
});

test('refresh cannot switch the verified owner identity', async () => {
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const local = storage();
  const almostExpired = { ...session, expires_at: Math.floor(now / 1000) + 60 };
  const calls = [];
  let userLookups = 0;
  const api = createLegacyPlacementApi({ config, storage: local, fetchImpl: async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/token')) return response({ ...session, access_token: 'switched-user-jwt' });
    if (url.pathname.endsWith('/auth/v1/user')) {
      userLookups += 1;
      return response({ id: userLookups === 1 ? ownerId : workId, is_anonymous: false });
    }
    return response({}, 404);
  } });
  try {
    await api.restore(almostExpired);
    now += 40_000;
    await assert.rejects(api.getAccessToken(), /ログイン状態が変わりました/);
    assert.ok(calls.some(({ url }) => url.pathname.endsWith('/auth/v1/token')));
    assert.equal(api.user, null);
  } finally { Date.now = originalNow; }
});

test('explicit sign out removes the retained owner session', async () => {
  const local = storage();
  local.setItem('PiXiEED:legacy-owner-session:v1', JSON.stringify(session));
  const api = createLegacyPlacementApi({ config, storage: local, fetchImpl: async () => response({ id: ownerId, is_anonymous: false }) });
  assert.deepEqual(await api.restore(), { id: ownerId });
  assert.equal(api.hasSavedSession(), true);
  api.signOut();
  assert.equal(api.hasSavedSession(), false);
  assert.equal(local.getItem('PiXiEED:legacy-owner-session:v1'), null);
});

test('email login never creates a new account and uses the profile callback', async () => {
  const calls = [];
  const api = createLegacyPlacementApi({ config, storage: storage(), fetchImpl: async (input, options) => { calls.push({ url: new URL(String(input)), options }); return response({}); } });
  await api.sendEmailLink('owner@example.com', 'https://pixieed.jp/profile/?view=posts');
  assert.equal(calls[0].options.headers.apikey, config.publishableKey);
  assert.equal('Authorization' in calls[0].options.headers, false);
  assert.equal(calls[0].url.searchParams.get('redirect_to'), 'https://pixieed.jp/profile/?view=posts');
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'owner@example.com', create_user: false });
  assert.match(api.oauthUrl('https://pixieed.jp/profile/?view=posts'), /provider=google/);
});

test('refresh requests use the publishable key only, then use the refreshed user JWT for user lookup', async () => {
  const calls = [];
  const expired = { ...session, expires_at: Math.floor(Date.now() / 1000) - 60 };
  const api = createLegacyPlacementApi({ config, storage: storage(), fetchImpl: async (input, options = {}) => {
    const url = new URL(String(input)); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/token')) return response({ ...session, access_token: 'refreshed-user-jwt' });
    if (url.pathname.endsWith('/auth/v1/user')) return response({ id: ownerId, is_anonymous: false });
    return response([]);
  } });
  await api.restore(expired);
  await api.listUserPosts();
  const refreshCall = calls.find(({ url }) => url.pathname.endsWith('/auth/v1/token'));
  assert.equal(refreshCall.options.headers.apikey, config.publishableKey);
  assert.equal('Authorization' in refreshCall.options.headers, false);
  const userCall = calls.find(({ url }) => url.pathname.endsWith('/auth/v1/user'));
  assert.equal(userCall.options.headers.Authorization, 'Bearer refreshed-user-jwt');
  const ownerPostsCall = calls.find(({ url }) => url.pathname.endsWith('/user_posts'));
  assert.equal(ownerPostsCall.url.searchParams.get('author_id'), `eq.${ownerId}`);
  assert.equal(ownerPostsCall.options.headers.Authorization, 'Bearer refreshed-user-jwt');
});
