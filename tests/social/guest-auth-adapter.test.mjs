import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestAuthAdapter } from '../../js/social/guest-auth-adapter.mjs';
import { createGuestAccountController } from '../../js/social/guest-account.mjs';

const guestId = '11111111-1111-4111-8111-111111111111';
const accountId = '22222222-2222-4222-8222-222222222222';
const cfg = { url: 'https://auth.example.test', publishableKey: 'public-key' };
const guestKey = 'PiXiEED:supabase-session:v1';
const accountKey = 'PiXiEED:legacy-owner-session:v1';
const json = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => value });
function storageOf(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
}
function initialGuest() { return { access_token: 'guest-token', refresh_token: 'guest-refresh', user_id: guestId }; }

test('adapter construction and existing-login email send are lazy and never create users', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const calls = [];
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (url, options = {}) => { calls.push({ url: new URL(url), options }); return json({}); } });
  assert.deepEqual(calls, []);
  await auth.sendExistingLoginCode('a@example.test');
  const call = calls[0];
  assert.equal(call.url.pathname, '/auth/v1/otp');
  assert.deepEqual(JSON.parse(call.options.body), { email: 'a@example.test', create_user: false });
  assert.equal(call.url.search, '');
  assert.equal(storage.getItem(accountKey), null);
});

test('same-ID registration verifies email-change code before setting password and stores only verified account', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user') && options.method === 'PUT') {
      if (options.headers.Authorization === 'Bearer guest-token') return json({ id: guestId });
      assert.deepEqual(JSON.parse(options.body), { password: 'new-secret' });
      return json({ id: guestId });
    }
    if (url.pathname.endsWith('/auth/v1/verify')) {
      assert.deepEqual(JSON.parse(options.body), { email: 'a@example.test', token: '123456', type: 'email_change' });
      return json({ access_token: 'verified-token', refresh_token: 'verified-refresh' });
    }
    if (url.pathname.endsWith('/auth/v1/user')) {
      const token = options.headers.Authorization;
      return token === 'Bearer guest-token' ? json({ id: guestId, is_anonymous: true }) : json({ id: guestId, is_anonymous: false, email_confirmed_at: 'now' });
    }
    throw new Error('unexpected request');
  };
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl });
  assert.deepEqual(await auth.beginEmailRegistration('a@example.test'), { status: 'verification_required', userId: guestId });
  assert.deepEqual(JSON.parse(calls[1].options.body), { email: 'a@example.test' });
  assert.equal(storage.getItem(accountKey), null);
  assert.equal((await auth.verifyEmailRegistration({ email: 'a@example.test', code: '123456', password: 'new-secret' })).status, 'promoted');
  assert.equal(JSON.parse(storage.getItem(accountKey)).user_id, guestId);
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
  assert.equal(calls.some(({ url }) => url.toString().includes('123456') || url.toString().includes('guest-token')), false);
});

test('email collision or wrong verified identity cannot overwrite guest or account session', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()), [accountKey]: JSON.stringify({ access_token: 'prior', refresh_token: 'prior-r', user_id: accountId }) });
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user') && options.method === 'PUT') return json({ message: 'email already registered' }, 422);
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: guestId, is_anonymous: true });
    return json({ message: 'email already registered' }, 422);
  } });
  await assert.rejects(auth.beginEmailRegistration('existing@example.test'));
  await assert.rejects(auth.verifyEmailRegistration({ email: 'existing@example.test', code: 'code', password: 'new-secret' }));
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
  assert.equal(JSON.parse(storage.getItem(accountKey)).access_token, 'prior');
});

test('existing OTP login persists only a server-verified registered user', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const calls = [];
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/verify')) return json({ access_token: 'owner-token', refresh_token: 'owner-refresh', user: { id: accountId } });
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: accountId, is_anonymous: false, email_confirmed_at: 'now' });
    throw new Error('unexpected request');
  } });
  const session = await auth.verifyExistingLoginCode({ email: 'a@example.test', code: '654321' });
  assert.equal(session.user.id, accountId);
  assert.equal(JSON.parse(storage.getItem(accountKey)).access_token, 'owner-token');
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
  assert.equal(calls[0].url.search, '');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls.some(({ url }) => url.toString().includes('654321') || url.toString().includes('owner-token')), false);
});

test('corrupt guest and changed guest storage fail closed without replacing identity', async () => {
  const storage = storageOf({ [guestKey]: '{broken' });
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async () => { throw new Error('must not call without a valid refresh token'); } });
  await assert.rejects(auth.getSession(), /読み取れません/);
  await assert.rejects(auth.refreshGuest());
  const valid = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const raceAuth = createGuestAuthAdapter({ storage: valid, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/token')) {
      valid.setItem(guestKey, JSON.stringify({ ...initialGuest(), access_token: 'other-tab' }));
      return json({ access_token: 'rotated', refresh_token: 'rotated-refresh' });
    }
    return json({ id: guestId, is_anonymous: true });
  } });
  await assert.rejects(raceAuth.refreshGuest(), /切り替わりました/);
  assert.equal(JSON.parse(valid.getItem(guestKey)).access_token, 'other-tab');
});

test('guest refresh retains the same ID, and rejects a refreshed different identity', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/token')) return json({ access_token: 'rotated', refresh_token: 'rotated-refresh' });
    return json({ id: guestId, is_anonymous: true });
  } });
  const refreshed = await auth.refreshGuest();
  assert.equal(refreshed.user.id, guestId);
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'rotated');
  const badStorage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const badAuth = createGuestAuthAdapter({ storage: badStorage, config: cfg, fetchImpl: async (input) => new URL(input).pathname.endsWith('/auth/v1/token') ? json({ access_token: 'other', refresh_token: 'other-r' }) : json({ id: accountId, is_anonymous: true }) });
  await assert.rejects(badAuth.refreshGuest(), /確認できません/);
  assert.equal(JSON.parse(badStorage.getItem(guestKey)).access_token, 'guest-token');
});

test('OAuth session can be verified as a registered claim target without replacing guest ownership', async () => {
  const oauthKey = 'sb-auth-auth-token';
  const storage = storageOf({
    [guestKey]: JSON.stringify(initialGuest()),
    [oauthKey]: JSON.stringify({ access_token: 'oauth-token', refresh_token: 'oauth-refresh', user: { id: accountId } })
  });
  const calls = [];
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input, options = {}) => {
    calls.push({ url: new URL(input), options });
    return json({ id: accountId, is_anonymous: false, email_confirmed_at: 'now' });
  } });
  const session = await auth.getSession();
  assert.equal(session.user.id, accountId);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer oauth-token');
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
});

test('controller and REST adapter promote one guest ID through email verification without requiring password', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user') && options.method === 'PUT') return json({ id: guestId });
    if (url.pathname.endsWith('/auth/v1/verify')) return json({ access_token: 'verified-token', refresh_token: 'verified-refresh' });
    if (url.pathname.endsWith('/auth/v1/user')) {
      const isInitialGuest = options.headers.Authorization === 'Bearer guest-token';
      return json({ id: guestId, is_anonymous: isInitialGuest, ...(isInitialGuest ? {} : { email_confirmed_at: 'now' }) });
    }
    throw new Error(`unexpected ${url.pathname}`);
  };
  const auth = createGuestAuthAdapter({ fetchImpl, storage, config: cfg });
  const controller = createGuestAccountController({ fetchImpl, storage, config: cfg, auth, locks: { request: (_n, _o, operation) => operation() } });
  assert.equal((await controller.promoteCurrent({ email: 'a@example.test' })).status, 'verification_required');
  const emailPut = calls.find(({ url, options }) => url.pathname.endsWith('/auth/v1/user') && options.method === 'PUT');
  assert.deepEqual(JSON.parse(emailPut.options.body), { email: 'a@example.test' });
  assert.equal((await controller.verifyEmailRegistration({ email: 'a@example.test', code: '123456' })).status, 'promoted');
  const puts = calls.filter(({ url, options }) => url.pathname.endsWith('/auth/v1/user') && options.method === 'PUT');
  assert.equal(puts.length, 1, 'no password PUT when owner UI omits a password');
  assert.equal(JSON.parse(storage.getItem(accountKey)).user_id, guestId);
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
});

test('verified guest session survives a password update network failure', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/verify')) return json({ access_token: 'verified-token', refresh_token: 'verified-refresh' });
    if (url.pathname.endsWith('/auth/v1/user') && options.method === 'PUT') throw new Error('network down');
    if (url.pathname.endsWith('/auth/v1/user')) return options.headers.Authorization === 'Bearer guest-token'
      ? json({ id: guestId, is_anonymous: true })
      : json({ id: guestId, is_anonymous: false, email_confirmed_at: 'now' });
    throw new Error('unexpected request');
  } });
  await assert.rejects(auth.verifyEmailRegistration({ email: 'a@example.test', code: '123456', password: 'secret' }), /接続できません/);
  assert.equal(JSON.parse(storage.getItem(accountKey)).access_token, 'verified-token');
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
});

test('guest refresh keeps rotated token pending and recovers without a second rotation after getUser failure', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  let refreshCalls = 0, userCalls = 0;
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/token')) { refreshCalls += 1; return json({ access_token: 'rotated', refresh_token: 'rotated-r' }); }
    userCalls += 1;
    if (userCalls === 1) throw new Error('offline after refresh');
    return json({ id: guestId, is_anonymous: true });
  } });
  await assert.rejects(auth.refreshGuest(), /接続できません/);
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
  assert.equal(JSON.parse(storage.getItem('PiXiEED:auth-session-recovery:v1')).session.access_token, 'rotated');
  assert.equal((await auth.refreshGuest()).access_token, 'rotated');
  assert.equal(refreshCalls, 1);
  assert.equal(storage.getItem('PiXiEED:auth-session-recovery:v1'), null);
});

test('email verification session survives getUser failure and recovers without resubmitting OTP', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  let verifyCalls = 0, userCalls = 0;
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/verify')) { verifyCalls += 1; return json({ access_token: 'email-verified', refresh_token: 'email-verified-r' }); }
    if (url.pathname.endsWith('/auth/v1/user')) {
      userCalls += 1;
      if (userCalls === 1) throw new Error('temporary user lookup failure');
      return options.headers.Authorization === 'Bearer guest-token'
        ? json({ id: guestId, is_anonymous: true })
        : json({ id: guestId, is_anonymous: false, email_confirmed_at: 'now' });
    }
    throw new Error('unexpected request');
  } });
  const input = { email: 'a@example.test', code: '123456' };
  await assert.rejects(auth.verifyEmailRegistration(input), /接続できません/);
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
  assert.equal(JSON.parse(storage.getItem('PiXiEED:auth-session-recovery:v1')).session.access_token, 'email-verified');
  assert.equal((await auth.verifyEmailRegistration(input)).status, 'promoted');
  assert.equal(verifyCalls, 1);
  assert.equal(JSON.parse(storage.getItem(accountKey)).access_token, 'email-verified');
  assert.equal(storage.getItem('PiXiEED:auth-session-recovery:v1'), null);
});

test('registered refresh keeps recovered credentials pending through getUser failure', async () => {
  const storage = storageOf({ [accountKey]: JSON.stringify({ access_token: 'expired', refresh_token: 'old-r', user_id: accountId }) });
  let refreshCalls = 0, userCalls = 0;
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user') && options.headers.Authorization === 'Bearer expired') return json({}, 401);
    if (url.pathname.endsWith('/auth/v1/token')) { refreshCalls += 1; return json({ access_token: 'fresh', refresh_token: 'fresh-r' }); }
    userCalls += 1;
    if (userCalls === 1) throw new Error('temporary lookup failure');
    return json({ id: accountId, is_anonymous: false, email_confirmed_at: 'now' });
  } });
  await assert.rejects(auth.getSession(), /接続できません/);
  assert.equal(JSON.parse(storage.getItem(accountKey)).access_token, 'expired');
  assert.equal((await auth.getSession()).access_token, 'fresh');
  assert.equal(refreshCalls, 1);
});

test('registered expired session refreshes only to the same confirmed ID and fails closed on corrupt state', async () => {
  const storage = storageOf({ [accountKey]: JSON.stringify({ access_token: 'expired', refresh_token: 'r1', user_id: accountId }), [guestKey]: JSON.stringify(initialGuest()) });
  const auth = createGuestAuthAdapter({ storage, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user') && options.headers.Authorization === 'Bearer expired') return json({}, 401);
    if (url.pathname.endsWith('/auth/v1/token')) return json({ access_token: 'fresh', refresh_token: 'r2' });
    if (url.pathname.endsWith('/auth/v1/user')) return json({ id: accountId, is_anonymous: false, email_confirmed_at: 'now' });
    throw new Error('unexpected request');
  } });
  assert.equal((await auth.getSession()).access_token, 'fresh');
  assert.equal(JSON.parse(storage.getItem(accountKey)).refresh_token, 'r2');
  assert.equal(JSON.parse(storage.getItem(guestKey)).access_token, 'guest-token');
  const corrupt = storageOf({ [accountKey]: '{bad-json', [guestKey]: JSON.stringify(initialGuest()) });
  const failClosed = createGuestAuthAdapter({ storage: corrupt, config: cfg, fetchImpl: async () => { throw new Error('must not call'); } });
  await assert.rejects(failClosed.getSession(), /読み取れません/);
  const mismatchStorage = storageOf({ [accountKey]: JSON.stringify({ access_token: 'expired', refresh_token: 'r1', user_id: accountId }), [guestKey]: JSON.stringify(initialGuest()) });
  const mismatchAuth = createGuestAuthAdapter({ storage: mismatchStorage, config: cfg, fetchImpl: async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user') && options.headers.Authorization === 'Bearer expired') return json({}, 401);
    if (url.pathname.endsWith('/auth/v1/token')) return json({ access_token: 'fresh', refresh_token: 'r2' });
    return json({ id: guestId, is_anonymous: false, email_confirmed_at: 'now' });
  } });
  await assert.rejects(mismatchAuth.getSession(), /更新できません/);
  assert.equal(JSON.parse(mismatchStorage.getItem(accountKey)).access_token, 'expired');
  assert.equal(JSON.parse(mismatchStorage.getItem(guestKey)).access_token, 'guest-token');
});

test('Auth fetch is bounded and rejects invalid email or OTP before networking', async () => {
  let calls = 0;
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const auth = createGuestAuthAdapter({ storage, config: cfg, timeoutMs: 5, fetchImpl: async (_input, options = {}) => {
    calls += 1;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  await assert.rejects(auth.sendExistingLoginCode('bad-email'), /メールアドレス/);
  await assert.rejects(auth.verifyExistingLoginCode({ email: 'a@example.test', code: 'bad' }), /確認コード/);
  assert.equal(calls, 0);
  await assert.rejects(auth.sendExistingLoginCode('a@example.test'), /接続できません/);
  assert.equal(calls, 1);
});

test('unknown or changed registered identity cannot be used as a claim destination', async () => {
  const storage = storageOf({ [guestKey]: JSON.stringify(initialGuest()) });
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user')) return options.headers.Authorization === 'Bearer guest-token' ? json({ id: guestId, is_anonymous: true }) : json({ id: accountId });
    throw new Error('claim must not run');
  };
  const auth = { getSession: async () => ({ access_token: 'target', user: { id: accountId, email_confirmed_at: 'now' } }) };
  const controller = createGuestAccountController({ fetchImpl, storage, config: cfg, auth, locks: { request: (_n, _o, operation) => operation() } });
  await assert.rejects(controller.claimForCurrentAccount(), /アカウントにログイン/);
});

test('local-only drawing can explicitly begin same-ID registration without signup during browsing',async()=>{
 const storage=storageOf(),calls=[];const savedArtwork={id:'synthetic-local-work',visibility:'private',pixels:new Uint8Array([1,2,3,4])};
 const before=structuredClone(savedArtwork);
 const fetchImpl=async(input,options={})=>{
  const path=new URL(input).pathname;calls.push(path);
  if(path.endsWith('/signup'))return json({access_token:'new-guest',refresh_token:'new-refresh',user:{id:guestId,is_anonymous:true}});
  if(path.endsWith('/user')&&options.method==='PUT'){assert.deepEqual(JSON.parse(options.body),{email:'a@example.test'});return json({id:guestId});}
  if(path.endsWith('/user'))return json({id:guestId,is_anonymous:true});
  throw Error('unexpected');
 };
 const auth=createGuestAuthAdapter({storage,config:cfg,fetchImpl});
 assert.equal(await auth.getSession(),null);assert.deepEqual(calls,[]);
 const {createGuestAccountController}=await import('../../js/social/guest-account.mjs');
 const controller=createGuestAccountController({storage,config:cfg,fetchImpl,auth});
 const result=await controller.promoteCurrent({email:'a@example.test'});
 assert.equal(result.userId,guestId);assert.equal(calls.filter(p=>p.endsWith('/signup')).length,1);
 assert.deepEqual(savedArtwork,before);assert.equal(JSON.parse(storage.getItem(guestKey)).user_id,guestId);
});

test('explicit registration refuses corrupt or saved account state instead of replacing it',async()=>{
 const raw='{broken';const storage=storageOf({[guestKey]:raw});let network=0;
 const auth=createGuestAuthAdapter({storage,config:cfg,fetchImpl:async()=>{network++;throw Error('unexpected');}});
 await assert.rejects(auth.ensureGuestSession());assert.equal(storage.getItem(guestKey),raw);assert.equal(network,0);
});
