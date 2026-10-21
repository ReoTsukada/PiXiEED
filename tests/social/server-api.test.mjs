import test from 'node:test';
import assert from 'node:assert/strict';
import { createSocialApi, SocialApiError } from '../../js/social/api.mjs';
import { createSocialServerActions } from '../../js/social/server-actions.mjs';

const config = { url: 'https://project.example.test', publishableKey: 'public-key', publicMapTable: 'post_map_points', publicStorageBucket: 'post-public' };
const id = '3a0f26f8-8309-4fe3-9b9c-03f977e8b952';
const ref = `sns:${id}`;
const iso = '2026-09-02T00:00:00.000Z';
const serverPost = { id, kind: 'text', title: 'Text', body: 'Body', authorName: 'Author', createdAt: iso, updatedAt: iso, visibility: 'public', version: 1 };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const socialResult = (data) => json({ ok: true, ...data });
const oldRowsFetch = async (input) => {
  const url = new URL(input);
  if (url.pathname.endsWith('/post_map_points')) return json([]);
  if (url.pathname.endsWith('/social_posts')) return json([]);
  if (url.pathname.endsWith('/social_post_map_points')) return json([]);
  throw new Error(`Unexpected ${url.pathname}`);
};

function serverModule(serverFetch) {
  const data = new Map();
  const memoryStorage = { getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key) };
  return { createSocialServerActions: (options) => createSocialServerActions({ ...options, storage:options.storage || memoryStorage, fetchImpl: serverFetch, ownerApiFactory: () => ({ hasSavedSession: () => false }) }) };
}

test('public server posts merge with legacy list, map to SNS refs and expose only the audio endpoint', async () => {
  const requests = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/social-feed')) {
      const body = JSON.parse(options.body);
      requests.push(body);
      const post = { ...serverPost, id: body.postId || id };
      if (body.action === 'get') return socialResult({ post });
      return socialResult({ posts: [serverPost, { ...serverPost, id: '68e6216a-7597-4cb4-8979-8a6c021737cb', kind: 'music', audio: { mime: 'audio/wav', bytes: 100 } }] });
    }
    return oldRowsFetch(input, options);
  };
  const api = createSocialApi({ config, fetchImpl });
  const posts = await api.list({ limit: 7 });
  assert.deepEqual(new Set(posts.map((post) => post.id)), new Set([ref, 'sns:68e6216a-7597-4cb4-8979-8a6c021737cb']));
  assert.equal(posts[1].caption, 'Body');
  assert.equal(posts[1].likeable, false);
  assert.equal(posts.find((post) => post.kind === 'music').audio.src, `https://project.example.test/functions/v1/social-feed?action=audio&postId=68e6216a-7597-4cb4-8979-8a6c021737cb`);
  assert.deepEqual(requests[0], { action: 'list', limit: 7 });
  assert.equal((await api.get(ref)).id, ref);
  assert.deepEqual(requests[1], { action: 'get', postId: id });
});

test('missing server function reports capability warning while legacy list remains usable', async () => {
  const api = createSocialApi({
    config,
    fetchImpl: async (input, options = {}) => new URL(input).pathname.endsWith('/social-feed') ? json({ ok: false, error: 'function_not_found' }, 404) : oldRowsFetch(input, options)
  });
  assert.deepEqual(await api.list(), []);
  assert.match(api.getReadWarnings().join(' '), /まだ利用できません/);
});

test('authenticated detail reuses existing verified session; disabled comments make no request', async () => {
  const token = 'saved-token';
  const storage = { getItem: (key) => key === 'PiXiEED:supabase-session:v1' ? JSON.stringify({ access_token: token, refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 }) : null, setItem() {}, removeItem() {} };
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/social-feed')) {
      const payload = JSON.parse(options.body);
      calls.push({ payload, auth: options.headers.Authorization });
      if (payload.action === 'list') return json({ ok: false, error: 'function_not_found' }, 404);
      if (payload.action === 'get') return socialResult({ post: { ...serverPost, owned: true, visibility: 'private' } });
      if (payload.action === 'comments') return socialResult({ comments: [{ id: '68e6216a-7597-4cb4-8979-8a6c021737cb', target: ref, body: 'Mine', authorName: 'Author', createdAt: iso, updatedAt: iso, version: 1, owned: true }] });
    }
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d' });
    return oldRowsFetch(input, options);
  };
  const api = createSocialApi({ config, fetchImpl, storage, loadServerActions: async () => serverModule(fetchImpl) });
  await api.list();
  const warningBefore = api.getReadWarnings();
  const post = await api.get(ref, { authenticated: true });
  assert.equal(post.owned, true);
  await assert.rejects(api.comments(ref, { authenticated: true }), e => e.code === 'comments_disabled');
  assert.deepEqual(api.getReadWarnings(), warningBefore);
  assert.deepEqual(calls.map((call) => call.payload.action), ['list', 'get']);
  assert.equal(calls[1].auth, 'Bearer saved-token');
});

test('disabled comments leave preceding feed capability warning intact', async () => {
  const api = createSocialApi({ config, timeoutMs: 5, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/social-feed')) {
      const payload = JSON.parse(options.body);
      if (payload.action === 'list') return json({ ok: false, error: 'function_not_found' }, 404);
      return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    }
    return oldRowsFetch(input, options);
  } });
  await api.list();
  const before = api.getReadWarnings();
  await assert.rejects(api.comments(ref), (error) => error.code === 'comments_disabled');
  assert.deepEqual(api.getReadWarnings(), before);
});

test('private music exposes audio only to owned rows and owned audio is fetched with verified owner bearer', async () => {
  const musicId = '68e6216a-7597-4cb4-8979-8a6c021737cb';
  const rows = [
    { ...serverPost, id: musicId, kind: 'music', visibility: 'private', audio: { mime: 'audio/wav', bytes: 4 } },
    { ...serverPost, id: '68e6216a-7597-4cb4-8979-8a6c021738cb', kind: 'music', visibility: 'private', owned: true, audio: { mime: 'audio/wav', bytes: 4 } }
  ];
  const api = createSocialApi({ config, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/social-feed')) return socialResult({ posts: rows });
    return oldRowsFetch(input, options);
  } });
  const posts = await api.list();
  assert.equal(posts[0].audio, undefined);
  assert.ok(posts[1].audio.src.endsWith(`action=audio&postId=${rows[1].id}`));

  let audioRequest;
  const ownerApiFactory = () => ({ hasSavedSession: () => true, restore: async () => ({ id: 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d' }), getAccessToken: async () => 'verified-owner-token', user: { id: 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d' } });
  const actions = createSocialServerActions({ config, ownerApiFactory, fetchImpl: async (input, options) => {
    audioRequest = { url: new URL(input), headers: options.headers };
    return new Response(new Uint8Array([1, 2, 3, 4]), { status: 200, headers: { 'content-type': 'audio/wav' } });
  } });
  const blob = await actions.getAudio(rows[1].id);
  assert.equal(blob.type, 'audio/wav');
  assert.equal(audioRequest.headers.Authorization, 'Bearer verified-owner-token');
  assert.equal(audioRequest.url.searchParams.get('postId'), rows[1].id);
});

test('text and music submit call the server once, preserve request key and normalize returned visibility/version', async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/social-feed')) {
      calls.push({ headers: options.headers, body: options.body });
      return socialResult({ post: { ...serverPost, visibility: 'private', version: 2 } });
    }
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d', is_anonymous: true });
    if (url.pathname.endsWith('/auth/v1/signup')) return json({ access_token: 'session-token', refresh_token: 'refresh-token' });
    return oldRowsFetch(input, options);
  };
  const api = createSocialApi({ config, fetchImpl, loadServerActions: async () => serverModule(fetchImpl) });
  const post = await api.submit({ kind: 'text', title: 'Text', caption: 'Body', visibility: 'private', authorName: 'Author', requestKey: id });
  assert.equal(post.id, ref);
  assert.equal(post.visibility, 'private');
  assert.equal(post.version, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body), { action: 'create', kind: 'text', title: 'Text', visibility: 'private', authorName: 'Author', requestKey: id, body: 'Body' });
  assert.equal(calls[0].headers.Authorization, 'Bearer session-token');
});

test('audio submit uses multipart with original Blob and stable payload request key', async () => {
  let captured;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/social-feed')) { captured = options; return socialResult({ post: { ...serverPost, kind: 'music', audio: { mime: 'audio/wav', bytes: 4 } } }); }
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d', is_anonymous: true });
    if (url.pathname.endsWith('/auth/v1/signup')) return json({ access_token: 'session-token', refresh_token: 'refresh-token' });
    return oldRowsFetch(input, options);
  };
  const api = createSocialApi({ config, fetchImpl, loadServerActions: async () => serverModule(fetchImpl) });
  await api.submit({ kind: 'music', title: 'Track', caption: 'Caption', visibility: 'public', requestKey: id, audio: { blob: new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }), filename: 'original.wav' } });
  assert.equal(captured.body instanceof FormData, true);
  assert.deepEqual(JSON.parse(captured.body.get('payload')), { action: 'create', kind: 'music', title: 'Track', visibility: 'public', requestKey: id, body: 'Caption' });
  assert.equal(captured.body.get('audio').name, 'original.wav');
  assert.equal(captured.headers['Content-Type'], undefined);
});

test('server-actions mine requires a verified saved owner session and never creates anonymous auth', async () => {
  const calls = [];
  const actions = createSocialServerActions({
    config,
    storage: { getItem: () => null, setItem() {}, removeItem() {} },
    ownerApiFactory: () => ({ hasSavedSession: () => false }),
    fetchImpl: async (input) => { calls.push(String(input)); return json({ ok: true, posts: [] }); }
  });
  await assert.rejects(actions.mine(), /ログインしてください/);
  assert.deepEqual(calls, []);
});

test('saved anonymous session can access its own posts and audio without creating another identity', async () => {
  const userId = 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d';
  const audioId = '68e6216a-7597-4cb4-8979-8a6c021737cb';
  const storage = { getItem: (key) => key === 'PiXiEED:supabase-session:v1' ? JSON.stringify({ access_token: 'anon-token', refresh_token: 'anon-refresh', user_id: userId, expires_at: Math.floor(Date.now() / 1000) + 3600 }) : null, setItem() {}, removeItem() {} };
  const calls = [];
  const actions = createSocialServerActions({ config, storage, ownerApiFactory: () => ({ hasSavedSession: () => false }), fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: userId, is_anonymous: true });
    if (url.pathname.endsWith('/social-feed') && options.method === 'POST') return socialResult({ posts: [{ ...serverPost, id: audioId, kind: 'music', visibility: 'private', owned: true, audio: { mime: 'audio/wav', bytes: 4 } }] });
    if (url.searchParams.get('action') === 'audio') return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'audio/wav' } });
    if (url.pathname.endsWith('/auth/v1/signup')) throw new Error('must not create another identity');
    return json({});
  } });
  const mine = await actions.mine();
  assert.equal(mine.posts[0].visibility, 'private');
  const audio = await actions.getAudio(audioId);
  assert.equal(audio.type, 'audio/wav');
  assert.ok(calls.filter((call) => call.url.pathname.endsWith('/social-feed') || call.url.searchParams.get('action') === 'audio').every((call) => call.options.headers.Authorization === 'Bearer anon-token'));
  assert.equal(calls.some((call) => call.url.pathname.endsWith('/auth/v1/signup')), false);
});

test('expired saved session fails closed without signing up or substituting another identity', async () => {
  const storage = { getItem: (key) => key === 'PiXiEED:supabase-session:v1' ? JSON.stringify({ access_token: 'expired', refresh_token: 'invalid-refresh', expires_at: 1 }) : null, setItem() {}, removeItem() {} };
  const calls = [];
  const actions = createSocialServerActions({ config, storage, ownerApiFactory: () => ({ hasSavedSession: () => false }), fetchImpl: async (input) => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.pathname.endsWith('/auth/v1/token')) return json({ error: 'invalid_grant' }, 400);
    if (url.pathname.endsWith('/auth/v1/signup')) throw new Error('must not sign up on a read');
    return json({});
  } });
  await assert.rejects(actions.mine(), /ログインしてください/);
  assert.deepEqual(calls, ['/auth/v1/token']);
});

test('auth verification timeout is bounded, and known 404/400/413 errors stay actionable', async () => {
  const session = { access_token: 'saved', refresh_token: 'refresh', expires_at: Math.floor(Date.now() / 1000) + 3600 };
  const storage = { getItem: (key) => key === 'PiXiEED:supabase-session:v1' ? JSON.stringify(session) : null, setItem() {}, removeItem() {} };
  const timeoutActions = createSocialServerActions({ config, storage, timeoutMs: 5, ownerApiFactory: () => ({ hasSavedSession: () => false }), fetchImpl: async (input, options = {}) => {
    if (String(input).includes('/auth/v1/user')) return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    return json({});
  } });
  await assert.rejects(timeoutActions.submit({ kind: 'text' }), (error) => error.code === 'timeout');

  for (const [status, code, expected] of [[404, 'post_not_found', 'not_found'], [413, 'request_too_large', 'size_limit'], [400, 'audio_format_unsupported', 'invalid_input']]) {
    const actions = createSocialServerActions({ config, storage, ownerApiFactory: () => ({ hasSavedSession: () => false }), fetchImpl: async (input) => {
      if (String(input).includes('/auth/v1/user')) return json({ id: 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d' });
      return json({ ok: false, error: code }, status);
    } });
    await assert.rejects(actions.remove(id), (error) => error.code === expected);
  }
});

test('mutation network timeout is safe and does not retry automatically', async () => {
  let feedCalls = 0;
  const actions = createSocialServerActions({
    config, timeoutMs: 5,
    storage: { getItem: (key) => key.includes('supabase-session') ? JSON.stringify({ access_token: 'session-token' }) : null, setItem() {}, removeItem() {} },
    ownerApiFactory: () => ({ hasSavedSession: () => false }),
    fetchImpl: async (input, options = {}) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/auth/v1/user')) return json({ id: 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d', is_anonymous: true });
      if (url.pathname.endsWith('/social-feed')) { feedCalls += 1; return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); }
      return json({});
    }
  });
  await assert.rejects(actions.submit({ kind: 'text', requestKey: id }), (error) => error.code === 'timeout');
  assert.equal(feedCalls, 1);
});

test('saved anonymous refresh failures never sign up or replace the stored session', async () => {
  for (const status of [400, 429, 503]) {
    const original = JSON.stringify({ access_token: 'expired-access', refresh_token: 'existing-refresh', user_id: 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d', expires_at: 1 });
    let stored = original;
    const calls = [];
    const storage = {
      getItem: (key) => key === 'PiXiEED:supabase-session:v1' ? stored : null,
      setItem: (key, value) => { if (key === 'PiXiEED:supabase-session:v1') stored = value; },
      removeItem: (key) => { if (key === 'PiXiEED:supabase-session:v1') stored = null; }
    };
    const actions = createSocialServerActions({ config, storage, ownerApiFactory: () => ({ hasSavedSession: () => false }), fetchImpl: async (input) => {
      const url = new URL(input);
      calls.push(url.pathname);
      if (url.pathname.endsWith('/auth/v1/token')) return json({ error: 'refresh_unavailable' }, status);
      if (url.pathname.endsWith('/auth/v1/signup')) throw new Error('must not create a replacement identity');
      return json({});
    } });
    await assert.rejects(actions.submit({ kind: 'text', requestKey: id }), (error) => error.code === 'authentication_required');
    assert.deepEqual(calls, ['/auth/v1/token']);
    assert.equal(stored, original);
  }
});

test('valid saved anonymous token is reused for retry without changing its stored credentials', async () => {
  const userId = 'ce94c2ad-9160-4a8b-86e4-4e8ca42dfb1d';
  const original = JSON.stringify({ access_token: 'same-access', refresh_token: 'same-refresh', user_id: userId, expires_at: Math.floor(Date.now() / 1000) + 3600 });
  let stored = original;
  const calls = [];
  const storage = {
    getItem: (key) => key === 'PiXiEED:supabase-session:v1' ? stored : null,
    setItem: (key, value) => { if (key === 'PiXiEED:supabase-session:v1') stored = value; },
    removeItem: (key) => { if (key === 'PiXiEED:supabase-session:v1') stored = null; }
  };
  const actions = createSocialServerActions({ config, storage, ownerApiFactory: () => ({ hasSavedSession: () => false }), fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, headers: options.headers });
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: userId, is_anonymous: true });
    if (url.pathname.endsWith('/auth/v1/signup') || url.pathname.endsWith('/auth/v1/token')) throw new Error('must reuse the valid session');
    assert.equal(JSON.parse(options.body).requestKey, id);
    return socialResult({ post: serverPost });
  } });
  await actions.submit({ kind: 'text', requestKey: id });
  const feed = calls.find((call) => call.path.endsWith('/social-feed'));
  assert.equal(feed.headers.Authorization, 'Bearer same-access');
  assert.equal(calls.some((call) => call.path.endsWith('/auth/v1/signup')), false);
  assert.equal(calls.some((call) => call.path.endsWith('/auth/v1/token')), false);
  assert.equal(stored, original);
});

test('corrupt saved session fails closed rather than signing up and replacing it', async () => {
  const original = '{broken';
  let stored = original;
  const storage = { getItem: (key) => key === 'PiXiEED:supabase-session:v1' ? stored : null, setItem(_key, value) { stored = value; }, removeItem() { stored = null; } };
  let signupCalls = 0;
  const actions = createSocialServerActions({ config, storage, ownerApiFactory: () => ({ hasSavedSession: () => false }), fetchImpl: async (input) => {
    if (String(input).includes('/auth/v1/signup')) signupCalls += 1;
    return json({});
  } });
  await assert.rejects(actions.submit({ kind: 'text', requestKey: id }), /保存済みログイン情報/);
  assert.equal(signupCalls, 0);
  assert.equal(stored, original);
});

test('concurrent guest writes share a single first-use signup across API instances', async()=>{
 const data=new Map();const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 let signup=0;const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const fetchImpl=async(input,options={})=>{
  const path=new URL(input).pathname;
  if(path.endsWith('/signup')){signup++;await new Promise(r=>setTimeout(r,2));return json({access_token:'synthetic-guest',refresh_token:'synthetic-refresh',expires_at:4102444800,user:{id:userId,is_anonymous:true}});}
  if(path.endsWith('/user'))return json({id:userId,is_anonymous:true});
  return json({ok:true,post:serverPost});
 };
 const opts={config,storage,fetchImpl,ownerApiFactory:()=>({hasSavedSession:()=>false})};
 const first=createSocialServerActions(opts),second=createSocialServerActions(opts);
 await Promise.all([first.submit({requestKey:'10000000-0000-4000-8000-000000000001',kind:'text',body:'one'}),second.submit({requestKey:'10000000-0000-4000-8000-000000000002',kind:'text',body:'two'})]);
 assert.equal(signup,1);assert.equal(JSON.parse(data.get('PiXiEED:supabase-session:v1')).user_id,userId);
});
