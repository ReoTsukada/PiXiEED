import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseConfig } from '../../data/site-config.js?rev=20261004-puzzle-share-1';
import { createSupabaseGlobeStore } from '../../js/globe/post-supabase.mjs';
import { lookupCell } from '../../js/globe/geometry.mjs';

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; }
});

const postFixture = (puzzle = undefined) => {
  const cell = lookupCell(139.69, 35.68);
  return {
    title: '試験投稿', caption: '',
    image: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', size: 3, width: 8, height: 8, colorCount: 2 },
    pin: { cellId: cell.id, latitude: 35.68, longitude: 139.69 },
    ...(puzzle ? { puzzle } : {})
  };
};

test('puzzle publication gate blocks old API fallback and accepts only a matching server mode', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const originalFlag = supabaseConfig.puzzlePublicationEnabled;
  const session = new Map([['PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'test-token', expires_at: Math.floor(Date.now() / 1000) + 3600 })]]);
  globalThis.localStorage = {
    getItem: (key) => session.get(key) ?? null,
    setItem: (key, value) => session.set(key, value),
    removeItem: (key) => session.delete(key)
  };
  const calls = [];
  let createResponse = { postId: '11111111-1111-4111-8111-111111111111', status: 'pending' };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname.startsWith('/rest/v1/')) return response([]);
    if (url.pathname === '/functions/v1/create-post') return response(createResponse, 201);
    throw new Error(`Unexpected request: ${url.href}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
    supabaseConfig.puzzlePublicationEnabled = originalFlag;
  });

  for (const flag of [false, undefined]) {
    supabaseConfig.puzzlePublicationEnabled = flag;
    const store = createSupabaseGlobeStore();
    await store.ready;
    const requestsBefore = calls.length;
    let callbackCalled = false;
    await assert.rejects(
      async () => {
        await store.add(postFixture({ mode: 'spot_difference' }));
        callbackCalled = true;
      },
      /パズル投稿は準備中です/
    );
    assert.equal(callbackCalled, false);
    assert.equal(calls.length, requestsBefore, 'gate must run before auth and create-post requests');
  }

  supabaseConfig.puzzlePublicationEnabled = false;
  const regularStore = createSupabaseGlobeStore();
  await regularStore.ready;
  const regular = await regularStore.add(postFixture());
  assert.equal(regular.status, 'pending');
  assert.equal(calls.at(-1).url.pathname, '/functions/v1/create-post');
  assert.equal('puzzle' in JSON.parse(calls.at(-1).init.body), false);

  supabaseConfig.puzzlePublicationEnabled = true;
  const puzzleStore = createSupabaseGlobeStore();
  await puzzleStore.ready;
  createResponse = { postId: '22222222-2222-4222-8222-222222222222', status: 'pending', puzzleMode: 'spot_difference' };
  const accepted = await puzzleStore.add(postFixture({ mode: 'spot_difference' }));
  assert.equal(accepted.puzzleMode, 'spot_difference');

  for (const serverResponse of [
    { postId: '33333333-3333-4333-8333-333333333333', status: 'pending' },
    { postId: '44444444-4444-4444-8444-444444444444', status: 'pending', puzzleMode: 'hidden_object' }
  ]) {
    createResponse = serverResponse;
    let callbackCalled = false;
    await assert.rejects(async () => {
      await puzzleStore.add(postFixture({ mode: 'spot_difference' }));
      callbackCalled = true;
    }, /パズル投稿の公開設定を確認できませんでした/);
    assert.equal(callbackCalled, false);
  }
});
