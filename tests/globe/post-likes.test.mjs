import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCell } from '../../js/globe/geometry.mjs';
import { createSupabaseGlobeStore, listMyPublishedLikes, loadPublishedMapPostsByIds } from '../../js/globe/post-supabase.mjs';

const postId = '3a0f26f8-8309-4fe3-9b9c-03f977e8b952';
const userId = '68e6216a-7597-4cb4-8979-8a6c021737cb';
const cell = lookupCell(139.69, 35.68);
const ok = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return value; } });
const mapRow = { post_id: postId, title: '公開投稿', caption: '', public_image_path: 'public/test.png', published_at: '2026-09-01T00:00:00Z', globe_cell_id: cell.id, post_kind: 'pixel_art' };

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
}

test('viewing and own-like reads do not create an account without a saved session', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = memoryStorage();
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname.endsWith('/post_map_points')) return ok([mapRow]);
    if (url.pathname.endsWith('/social_post_map_points')) return ok([]);
    throw new Error(`unexpected request ${url.pathname}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; globalThis.localStorage = previousStorage; });

  const store = createSupabaseGlobeStore();
  await store.ready;
  assert.equal(store.list()[0].likeable, true);
  assert.deepEqual(await listMyPublishedLikes(), []);
  assert.deepEqual(calls.map(({ url }) => url.pathname).filter((path) => path.endsWith('/signup')), []);
});

test('viewer status reads only the requested post for a verified saved session', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = memoryStorage();
  globalThis.localStorage.setItem('PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'saved-access', refresh_token: 'saved-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return ok({ id: userId });
    if (url.pathname.endsWith('/post_likes')) return ok([{ post_id: postId }]);
    throw new Error(`unexpected request ${url.pathname}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; globalThis.localStorage = previousStorage; });

  const store = createSupabaseGlobeStore();
  await store.ready;
  assert.equal(await store.hasLiked(postId), true);
  const query = calls.find(({ url }) => url.pathname.endsWith('/post_likes'));
  assert.equal(query.url.searchParams.get('post_id'), `eq.${postId}`);
  assert.equal(query.url.searchParams.get('user_id'), `eq.${userId}`);
  assert.equal(query.options.headers.Authorization, 'Bearer saved-access');
  assert.equal(calls.some(({ url }) => url.pathname.endsWith('/signup')), false);
});

test('profile like reads reject REST failures instead of returning a false empty list', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = memoryStorage();
  globalThis.localStorage.setItem('PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'saved-access', refresh_token: 'saved-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user')) return ok({ id: userId });
    if (url.pathname.endsWith('/post_likes')) return ok({ message: 'temporarily unavailable' }, 503);
    throw new Error(`unexpected request ${url.pathname}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; globalThis.localStorage = previousStorage; });
  await assert.rejects(listMyPublishedLikes(), /いいね状態を読み込めませんでした/);
});

test('profile reads every page of own likes in stable post ID order', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const ids = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  const pages = [];
  globalThis.localStorage = memoryStorage();
  globalThis.localStorage.setItem('PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'saved-access', refresh_token: 'saved-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }));
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user')) return ok({ id: userId });
    if (url.pathname.endsWith('/post_likes')) {
      pages.push(url);
      const after = url.searchParams.get('post_id')?.slice(3) || '';
      return ok(ids.filter((id) => id > after).slice(0, 200).map((id) => ({ post_id: id })));
    }
    throw new Error(`unexpected request ${url.pathname}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; globalThis.localStorage = previousStorage; });
  assert.deepEqual(await listMyPublishedLikes(), ids);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].searchParams.get('order'), 'post_id.asc');
  assert.equal(pages[1].searchParams.get('post_id'), `gt.${ids[199]}`);
  assert.ok(pages.every((url) => url.searchParams.get('user_id') === `eq.${userId}`));
});

test('likes require a visible user post UUID and use the authenticated REST request', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = memoryStorage();
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname.endsWith('/post_map_points')) return ok([mapRow]);
    if (url.pathname.endsWith('/social_post_map_points')) return ok([]);
    if (url.pathname.endsWith('/signup')) return ok({ access_token: 'guest-access', refresh_token: 'guest-refresh', expires_in: 3600, user: { id: userId, is_anonymous: true } });
    if (url.pathname.endsWith('/post_likes') && options.method === 'POST') return ok(null, 201);
    throw new Error(`unexpected request ${url.pathname}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; globalThis.localStorage = previousStorage; });

  const store = createSupabaseGlobeStore();
  await store.ready;
  for (const invalidId of ['not-a-uuid', 'showcase:00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']) {
    await assert.rejects(store.setLike(invalidId, true), /いいねできません/);
  }
  assert.equal(calls.some(({ options }) => options.method === 'POST'), false);

  await store.setLike(postId, true);
  const signup = calls.find(({ url }) => url.pathname.endsWith('/signup'));
  const write = calls.find(({ url, options }) => url.pathname.endsWith('/post_likes') && options.method === 'POST');
  assert.ok(signup, 'explicit like action may create a guest session');
  assert.equal(write.options.headers.Authorization, 'Bearer guest-access');
  assert.deepEqual(JSON.parse(write.options.body), { post_id: postId, user_id: userId });
});

test('published map lookup validates UUIDs and returns only public map rows', async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => { calls.push(new URL(input)); return ok([mapRow]); };
  t.after(() => { globalThis.fetch = previousFetch; });
  const posts = await loadPublishedMapPostsByIds(['invalid', postId]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, postId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].searchParams.get('post_id'), `in.(${postId})`);
  assert.equal(calls[0].searchParams.get('published_at'), 'not.is.null');
});

test('published map lookup chunks all valid IDs, filters unexpected rows, and supports older map schemas', async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  const ids = [postId, '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004'];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url);
    // This fixture represents a map schema that has neither optional column.
    // Reject every request that still selects the absent post_kind column,
    // including the intermediate retry that has already dropped puzzle_mode.
    const selected = url.searchParams.get('select') || '';
    if (selected.split(',').includes('post_kind')) return ok({ message: 'post_kind column missing' }, 400);
    const requested = url.searchParams.get('post_id').slice(4, -1).split(',');
    const rows = requested.map((id) => ({ ...mapRow, post_id: id }));
    if (calls.length === 3) rows.push({ ...mapRow, post_id: '00000000-0000-4000-8000-000000000099' });
    return ok(rows);
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const posts = await loadPublishedMapPostsByIds([...ids, ...Array.from({ length: 105 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1000).padStart(12, '0')}`), 'invalid']);
  assert.equal(calls.length, 9); // each of the three chunks retries both optional-column fallbacks
  const selects = calls.map((url) => (url.searchParams.get('select') || '').split(','));
  for (let offset = 0; offset < selects.length; offset += 3) {
    assert.ok(selects[offset].includes('post_kind') && selects[offset].includes('puzzle_mode'));
    assert.ok(selects[offset + 1].includes('post_kind') && !selects[offset + 1].includes('puzzle_mode'));
    assert.ok(!selects[offset + 2].includes('post_kind') && !selects[offset + 2].includes('puzzle_mode'));
  }
  assert.equal(posts.some((post) => post.id === '00000000-0000-4000-8000-000000000099'), false);
  assert.equal(posts.length, ids.length + 105);
});

test('published map lookup keeps post_kind when only puzzle_mode is unavailable', async (t) => {
  const previousFetch = globalThis.fetch; const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input); calls.push(url);
    if (calls.length === 1) return ok({ message: 'puzzle_mode column missing' }, 400);
    return ok([mapRow]);
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const posts = await loadPublishedMapPostsByIds([postId]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].postKind, 'pixel_art');
  assert.equal(posts[0].puzzleMode, null);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].searchParams.get('select').includes('post_kind'), true);
  assert.equal(calls[1].searchParams.get('select').includes('puzzle_mode'), false);
});

test('a linked public post beyond the initial list can be loaded once without changing the list limit', async (t) => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url);
    if (url.pathname.endsWith('/post_map_points')) return ok(url.searchParams.has('post_id') ? [mapRow] : []);
    if (url.pathname.endsWith('/social_post_map_points')) return ok([]);
    throw new Error(`unexpected request ${url.pathname}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  const store = createSupabaseGlobeStore();
  await store.ready;
  assert.equal(store.list().length, 0);
  assert.equal(await store.ensurePublishedById(postId), true);
  assert.deepEqual(store.list().map((post) => post.id), [postId]);
  assert.equal(await store.ensurePublishedById(postId), true);
  assert.equal(calls.filter((url) => url.searchParams.has('post_id')).length, 1);
  assert.equal(await store.ensurePublishedById('not-a-uuid'), false);
});
