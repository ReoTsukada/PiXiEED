import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestAccountController } from '../../js/social/guest-account.mjs';

const guestId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const requestKey = '33333333-3333-4333-8333-333333333333';
const config = { url: 'https://project.supabase.co', publishableKey: 'public-key' };
function storageOf(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key), values };
}
function response(status, payload) { return { ok: status >= 200 && status < 300, status, json: async () => payload }; }
function setup({ claim, guestSession = true, owner = ownerId, targetToken = 'target-token', guestIsRegistered = false } = {}) {
  const storage = storageOf(guestSession ? { 'PiXiEED:supabase-session:v1': JSON.stringify({ access_token: 'guest-token', refresh_token: 'guest-refresh', user_id: guestId }) } : {});
  const calls = [];
  let activeOwner = owner;
  let activeTargetToken = targetToken;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) {
      const token = options.headers.Authorization.slice(7);
      if (token === 'guest-token') return response(200, { id: guestId, is_anonymous: !guestIsRegistered, ...(guestIsRegistered ? { email_confirmed_at: 'now' } : {}) });
      return response(200, { id: ownerId, is_anonymous: false });
    }
    return claim ? claim({ url, options, calls }) : response(200, { ok: true, claim: { requestKey, guestId, ownerId } });
  };
const auth = {
    getSession: async () => ({ access_token: activeTargetToken, user: { id: activeOwner, is_anonymous: false, email_confirmed_at: 'now' } }),
    beginEmailRegistration: async ({ email }) => ({ status: 'verification_required', userId: guestId, email }),
    verifyEmailRegistration: async ({ email, code, password }) => ({ status: 'promoted', user: { id: guestId, email, code, password } }),
    sendExistingLoginCode: async () => ({ status: 'code_sent' }),
    verifyExistingLoginCode: async () => ({ user: { id: ownerId } })
  };
  const api = createGuestAccountController({ fetchImpl, storage, config, auth, randomUUID: () => requestKey, locks: { request: (_name, _opts, cb) => cb() } });
  return { api, storage, calls, auth, setOwner: (id) => { activeOwner = id; }, setTargetToken: (token) => { activeTargetToken = token; } };
}

test('constructing controller performs no signup or Auth operation', () => {
  const { api, calls } = setup();
  assert.equal(api.pending, null);
  assert.deepEqual(calls, []);
});

test('claim request sends guest token only in body and never trusts supplied guest IDs', async () => {
  const { api, calls } = setup();
  const result = await api.claimForCurrentAccount();
  assert.equal(result.status, 'claimed');
  const request = calls.find(({ url }) => url.pathname.endsWith('/functions/v1/social-feed'));
  assert.equal(request.url.search, '');
  assert.equal(request.options.headers.Authorization, 'Bearer target-token');
  const body = JSON.parse(request.options.body);
  assert.deepEqual(Object.keys(body).sort(), ['action', 'guestAccessToken', 'requestKey'].sort());
  assert.equal(body.guestAccessToken, 'guest-token');
  assert.equal(body.guestId, undefined);
  assert.equal(request.url.toString().includes('guest-token'), false);
});

test('failed or malformed claim preserves guest session and pending idempotency key for retry', async () => {
  let fail = true;
  const ctx = setup({ claim: async () => fail ? response(503, { ok: false }) : response(200, { ok: true, claim: { requestKey, guestId, ownerId } }) });
  await assert.rejects(ctx.api.claimForCurrentAccount(), /引き継ぎを確認/);
  assert.equal(JSON.parse(ctx.storage.getItem('PiXiEED:supabase-session:v1')).access_token, 'guest-token');
  assert.equal(ctx.api.pending.requestKey, requestKey);
  fail = false;
  assert.equal((await ctx.api.claimForCurrentAccount()).status, 'claimed');
  assert.equal(ctx.storage.getItem('PiXiEED:guest-account-claim:v1'), null);
});

test('pending claim cannot silently switch to a different target session', async () => {
  let ctx = setup({ claim: async () => response(503, {}) });
  await assert.rejects(ctx.api.claimForCurrentAccount());
  ctx.setOwner('44444444-4444-4444-8444-444444444444');
  await assert.rejects(ctx.api.claimForCurrentAccount(), /別のアカウント/);
});

test('missing guest session and same account do not call transfer endpoint', async () => {
  const noGuest = setup({ guestSession: false });
  await assert.rejects(noGuest.api.claimForCurrentAccount(), /ゲストの投稿セッション/);
  const same = setup({ guestIsRegistered: true }); same.setOwner(guestId);
  assert.equal((await same.api.claimForCurrentAccount()).status, 'already_same_account');
  assert.equal(same.calls.some(({ url }) => url.pathname.endsWith('/functions/v1/social-feed')), false);
});

test('same-ID promotion requests email verification before accepting password', async () => {
  const ctx = setup();
  ctx.auth.getSession = async () => ({ user: { id: guestId, is_anonymous: true } });
  let passed = null;
  ctx.auth.beginEmailRegistration = async (email) => { passed = email; return { status: 'verification_required', userId: guestId }; };
  assert.deepEqual(await ctx.api.promoteCurrent({ email: ' person@example.test ' }), { status: 'verification_required', userId: guestId });
  assert.equal(passed, ' person@example.test ');
  assert.deepEqual(await ctx.api.verifyEmailRegistration({ email: 'person@example.test', code: '123456', password: 'local-only-test' }), { status: 'promoted', user: { id: guestId, email: 'person@example.test', code: '123456', password: 'local-only-test' } });
});

test('wrong source identity or changed guest session fails closed', async () => {
  const ctx = setup({});
  ctx.calls; // user endpoint fixtures provide only the anonymous guest identity
  const tampered = JSON.parse(ctx.storage.getItem('PiXiEED:supabase-session:v1'));
  tampered.user_id = ownerId;
  ctx.storage.setItem('PiXiEED:supabase-session:v1', JSON.stringify(tampered));
  await assert.rejects(ctx.api.claimForCurrentAccount(), /ゲストセッション/);
});

test('claim acknowledgment with mismatched IDs leaves source session and pending record intact', async () => {
  const ctx = setup({ claim: async () => response(200, { ok: true, claim: { requestKey, guestId: ownerId, ownerId } }) });
  await assert.rejects(ctx.api.claimForCurrentAccount(), /引き継ぎを確認/);
  assert.equal(ctx.api.pending.requestKey, requestKey);
  assert.equal(JSON.parse(ctx.storage.getItem('PiXiEED:supabase-session:v1')).access_token, 'guest-token');
});

test('session change while claim is in flight does not clear the guest or retry metadata', async () => {
  const ctx = setup({ claim: async () => {
    const changed = JSON.parse(ctx.storage.getItem('PiXiEED:supabase-session:v1'));
    changed.access_token = 'other-tab-token';
    ctx.storage.setItem('PiXiEED:supabase-session:v1', JSON.stringify(changed));
    return response(200, { ok: true, claim: { requestKey, guestId, ownerId } });
  } });
  await assert.rejects(ctx.api.claimForCurrentAccount(), /ログイン状態を更新/);
  assert.equal(ctx.api.pending.requestKey, requestKey);
  assert.equal(JSON.parse(ctx.storage.getItem('PiXiEED:supabase-session:v1')).access_token, 'other-tab-token');
});

test('existing-account claim refreshes an expired guest proof without creating another identity',async()=>{
 const ctx=setup();let refreshed=0;
 const guestKey='PiXiEED:supabase-session:v1';
 const expired=JSON.parse(ctx.storage.getItem(guestKey));
 expired.access_token='expired-guest';ctx.storage.setItem(guestKey,JSON.stringify(expired));
 const originalFetch=async(input,opts={})=>{
  if(String(input).endsWith('/auth/v1/user'))return response(opts.headers.Authorization==='Bearer expired-guest'?401:200,{id:guestId,is_anonymous:true});
  return response(200,{ok:true,claim:{requestKey,guestId,ownerId}});
 };
 const auth={getSession:async()=>({access_token:'target-token',user:{id:ownerId,is_anonymous:false,email_confirmed_at:'now'}}),refreshGuest:async()=>{refreshed++;ctx.storage.setItem(guestKey,JSON.stringify({...expired,access_token:'fresh-guest'}));return{user:{id:guestId,is_anonymous:true}};}};
 const api=createGuestAccountController({storage:ctx.storage,config,auth,fetchImpl:originalFetch,randomUUID:()=>requestKey});
 assert.equal((await api.claimForCurrentAccount()).status,'claimed');assert.equal(refreshed,1);
});


test('expected target and guest are checked inside lock before transfer dispatch',async()=>{
 const target=setup();await assert.rejects(target.api.claimForCurrentAccount({expectedTargetId:guestId}),/引き継ぎ先/);
 assert.equal(target.calls.length,0);
 const source=setup();await assert.rejects(source.api.claimForCurrentAccount({expectedGuestId:ownerId}),/引き継ぎ元/);
 assert.equal(source.calls.some(c=>c.url.pathname.includes('/functions/')),false);
});
test('cancellation check immediately before dispatch preserves pending proof without a transfer',async()=>{
 const ctx=setup();await assert.rejects(ctx.api.claimForCurrentAccount({beforeDispatch(){throw Error('cancelled before dispatch');}}),/cancelled/);
 assert.ok(ctx.api.pending);assert.equal(ctx.calls.some(c=>c.url.pathname.includes('/functions/')),false);
 const aborted=new AbortController();aborted.abort();await assert.rejects(ctx.api.claimForCurrentAccount({signal:aborted.signal}),/中止/);
});
test('confirmed server claim uses same key after local binding failed or acknowledgement was lost',async()=>{
 const ctx=setup();await ctx.api.claimForCurrentAccount();
 assert.equal(ctx.api.pending,null);
 assert.equal(JSON.parse(ctx.storage.getItem('PiXiEED:guest-account-confirmed:v1')).requestKey,requestKey);
 await ctx.api.claimForCurrentAccount();
 const keys=ctx.calls.filter(c=>c.url.pathname.includes('/functions/')).map(c=>JSON.parse(c.options.body).requestKey);
 assert.deepEqual(keys,[requestKey,requestKey]);
});
