import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseGlobeStore } from '../../js/globe/post-supabase.mjs';
import { lookupCell } from '../../js/globe/geometry.mjs';

const postId = '3a0f26f8-8309-4fe3-9b9c-03f977e8b952';
const cell = lookupCell(139.69, 35.68);
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return body; } });
const fixture = () => ({
  title: 'すぐ見える投稿', caption: 'caption',
  image: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', size: 3, width: 8, height: 8, colorCount: 2 },
  pin: { cellId: cell.id, latitude: cell.center.latitude, longitude: cell.center.longitude, source: 'cell' }
});
const canonicalRow = {
  post_id: postId, title: '公開済みタイトル', caption: '公開済み本文', public_image_path: 'public/canonical.png',
  published_at: '2026-10-05T12:00:00Z', globe_cell_id: cell.id, post_kind: 'pixel_art', puzzle_mode: null
};

function installBrowserStubs(t, { createStatus = 'published', readFailure = false } = {}) {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const storage = new Map([['PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'saved-access', expires_at: Math.floor(Date.now() / 1000) + 3600 })]]);
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  };
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === '/functions/v1/create-post') return response({ postId, status: createStatus }, 201);
    if (url.pathname.endsWith('/post_map_points')) {
      if (url.searchParams.has('post_id')) {
        if (readFailure) return response({ message: 'temporary failure' }, 503);
        return response([canonicalRow]);
      }
      return response([]);
    }
    if (url.pathname.endsWith('/social_post_map_points')) return response([]);
    throw new Error(`Unexpected request: ${url.href}`);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });
  return calls;
}

test('published response appears immediately and is replaced by the canonical public row', async (t) => {
  const calls = installBrowserStubs(t);
  const store = createSupabaseGlobeStore();
  await store.ready;
  let notifications = 0;
  store.subscribe(() => { notifications += 1; });

  const created = await store.add(fixture());
  assert.equal(created.status, 'published');
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].title, '公開済みタイトル');
  assert.match(store.list()[0].image.dataUrl, /canonical\.png$/);
  assert.equal(store.list()[0].id, postId);
  assert.ok(notifications >= 1);
  assert.ok(calls.some(({ url }) => url.pathname.endsWith('/post_map_points') && url.searchParams.get('post_id') === `in.(${postId})`));
});

test('a temporary canonical read failure keeps the submitted image visible', async (t) => {
  installBrowserStubs(t, { readFailure: true });
  const store = createSupabaseGlobeStore();
  await store.ready;
  const submitted = fixture();
  const created = await store.add(submitted);

  assert.equal(created.status, 'published');
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].image.dataUrl, submitted.image.dataUrl);
  assert.equal(store.list()[0].pin.cellId, cell.id);
});

test('replayed published responses upsert by ID instead of duplicating a map post', async (t) => {
  installBrowserStubs(t);
  const store = createSupabaseGlobeStore();
  await store.ready;
  await store.add(fixture());
  await store.add(fixture());

  assert.equal(store.list().filter((post) => post.id === postId).length, 1);
});

test('a published post added during initial loading survives the ready merge', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousStorage = globalThis.localStorage;
  const storage = new Map([['PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'saved-access', expires_at: Math.floor(Date.now() / 1000) + 3600 })]]);
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  };
  let releaseInitial;
  const initialResponse = new Promise((resolve) => { releaseInitial = resolve; });
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/functions/v1/create-post') return response({ postId, status: 'published' }, 201);
    if (url.pathname.endsWith('/post_map_points')) {
      if (url.searchParams.has('post_id')) return response([canonicalRow]);
      return initialResponse;
    }
    if (url.pathname.endsWith('/social_post_map_points')) return response([]);
    throw new Error(`Unexpected request: ${url.href}`);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  });

  const store = createSupabaseGlobeStore();
  await store.add(fixture());
  assert.equal(store.list().some((post) => post.id === postId), true);
  releaseInitial(response([]));
  await store.ready;

  assert.equal(store.list().filter((post) => post.id === postId).length, 1);
  assert.equal(store.list()[0].title, '公開済みタイトル');
});

test('pending, hidden, and rejected responses never enter the public map cache', async (t) => {
  for (const status of ['pending', 'hidden', 'rejected']) {
    const calls = installBrowserStubs(t, { createStatus: status });
    const store = createSupabaseGlobeStore();
    await store.ready;
    const created = await store.add(fixture());
    assert.equal(created.status, status);
    assert.equal(store.list().some((post) => post.id === postId), false, `${status} must stay out of the public cache`);
    assert.equal(calls.some(({ url }) => url.searchParams.has('post_id') && url.pathname.endsWith('/post_map_points')), false);
  }
});
