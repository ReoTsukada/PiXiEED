import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createGuestGoogleBridge } from '../../js/social/guest-google-bridge.mjs';
import { createGuestAccountController } from '../../js/social/guest-account.mjs';
import { createLocalLoginTransfer } from '../../js/social/local-login-transfer.mjs';
import { createLocalWorkOwnership, createMemoryLocalWorkOwnershipAdapter } from '../../js/creation/local-work-ownership.mjs';

const guestId = '3a0f26f8-8309-4fe3-9b9c-03f977e8b952';
const otherGuestId = '68e6216a-7597-4cb4-8979-8a6c021737cb';
const ownerId = '9e413279-6db1-4ec6-9de5-c157bb09000b';
const project = { url: 'https://project.example.test', publishableKey: 'public-test-key' };
function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key), values };
}
function windowStub(href = 'https://pixieed.test/profile/?view=posts') {
  return { location: { href, origin: 'https://pixieed.test', assigned: '', assign(url) { this.assigned = url; } }, history: { state: {}, replaceState(_state, _title, url) { this.replaced = String(url); this.locationHref = String(url); } }, dispatchEvent() {} };
}
const userResponse = (id, isAnonymous) => new Response(JSON.stringify({ id, is_anonymous: isAnonymous, email_confirmed_at: isAnonymous ? null : '2026-01-01T00:00:00Z' }), { status: 200 });
function fixture({ withGuest = true, sourceId = guestId, claim } = {}) {
  const storage = memoryStorage(withGuest ? { 'PiXiEED:supabase-session:v1': JSON.stringify({ access_token: 'guest-access', refresh_token: 'guest-refresh', user_id: sourceId }) } : {});
  const sessionStorage = memoryStorage();
  const windowRef = windowStub();
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) return url.search ? userResponse(ownerId, false) : options.headers.Authorization === 'Bearer guest-access' ? userResponse(sourceId, true) : userResponse(ownerId, false);
    if (url.pathname.endsWith('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'owner-access', refresh_token: 'owner-refresh' }), { status: 200 });
    throw new Error(`Unexpected URL ${url}`);
  };
  const api = { async restore(session) { if (session) storage.setItem('PiXiEED:legacy-owner-session:v1', JSON.stringify({ ...session, user_id: ownerId })); return { id: ownerId }; } };
  const auth = { async getSession() { return { access_token: 'owner-access', user: { id: ownerId, is_anonymous: false, email_confirmed_at: '2026-01-01T00:00:00Z' } }; } };
  const claims = [];
  const accountController = { async claimForCurrentAccount(options = {}) { claims.push('claim'); options.beforeDispatch?.(); return claim ? claim() : { status: 'claimed', userId: ownerId, guestId: sourceId, requestKey: '4a5a8f31-33a5-48f2-a1a0-2cbe28a9c95f' }; } };
  const bridge = createGuestGoogleBridge({ windowRef, storage, sessionStorage, api, auth, accountController, fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000 });
  return { bridge, storage, sessionStorage, windowRef, calls, claims, api, auth, fetchImpl, accountController };
}

test('explicit Google PKCE click records nonsecret intent and keeps verifier out of URL', async () => {
  const f = fixture(); let prepared;
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: {}, auth: {}, accountController: {}, fetchImpl: async (url, options) => { f.calls.push({ url: new URL(url), options }); return userResponse(guestId, true); }, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async (value) => { prepared = value; return { revision: 2 }; } });
  const result = await bridge.beginGoogleLogin();
  const url = new URL(f.windowRef.location.assigned);
  assert.equal(url.searchParams.get('provider'), 'google');
  assert.equal(url.searchParams.get('code_challenge_method'), 's256');
  assert.ok(url.searchParams.get('code_challenge'));
  assert.equal(url.searchParams.has('code_verifier'), false);
  const intent = bridge.readPendingIntent();
  assert.equal(intent.sourceGuestId, guestId);
  assert.equal(intent.requestNonce, result.requestNonce);
  assert.deepEqual(prepared, { sourceGuestId: guestId, deviceId: intent.deviceId, requestNonce: result.requestNonce, includeLegacy: false });
  assert.equal(JSON.stringify(intent).includes('access_token'), false);
});

test('valid PKCE callback verifies target and source before one guest claim and local completion', async () => {
  const f = fixture(); const completed = [];
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({ metadata: 'safe' }), completeLocal: async (value) => { completed.push(value); return { status: 'bound', ownerId: value.verifiedOwnerId }; } });
  await bridge.beginGoogleLogin();
  const requestKey = bridge.readPendingIntent().requestNonce;
  f.windowRef.location.href = 'https://pixieed.test/profile/?view=posts&code=one-time-code';
  const result = await bridge.handleCallback({ callbackCode: 'one-time-code' });
  assert.equal(result.status, 'verified'); assert.equal(result.guestClaimed, true);
  assert.deepEqual(f.claims, ['claim']);
  assert.deepEqual(completed, [{ verifiedOwnerId: ownerId, requestKey, snapshot: { metadata: 'safe' }, guestClaimed: true }]);
  assert.equal(bridge.readPendingIntent(), null);
  assert.equal(f.sessionStorage.getItem('PiXiEED:google-pkce-verifier:v1'), null);
  assert.ok(f.calls.some(({ url }) => url.pathname.endsWith('/auth/v1/token')));
  assert.ok(!String(f.windowRef.history.replaced).includes('code='));
  assert.ok(f.calls.every(({ url }) => !url.href.includes('one-time-code')));
  assert.ok(f.calls.some(({ url, options }) => url.pathname.endsWith('/auth/v1/token') && JSON.parse(options.body).auth_code === 'one-time-code'));
});

test('implicit callback without explicit login intent restores login only and never claims', async () => {
  const f = fixture();
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000 });
  const result = await bridge.handleCallback({ legacyCallback: { session: { access_token: 'owner-access', refresh_token: 'owner-refresh' } } });
  assert.equal(result.status, 'login_only');
  assert.equal(f.claims.length, 0);
});

test('guest source mismatch fails closed without claiming or binding local work', async () => {
  const f = fixture(); const completed = [];
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, completeLocal: async (value) => { completed.push(value); return { status: 'bound', ownerId: value.verifiedOwnerId }; } });
  await bridge.beginGoogleLogin();
  f.storage.setItem('PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'guest-access', refresh_token: 'guest-refresh', user_id: otherGuestId }));
  await assert.rejects(bridge.handleCallback({ callbackCode: 'callback-code' }), /ゲストアカウントを確認できません/);
  assert.equal(f.claims.length, 0); assert.equal(completed.length, 0);
});

test('claim retry retains the same local request key and can be explicitly resumed', async () => {
  const f = fixture(); let attempts = 0; const completed = [];
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: { async claimForCurrentAccount(options = {}) { options.beforeDispatch?.(); attempts++; if (attempts === 1) throw new Error('temporary failure'); return { status: 'claimed', userId: ownerId, guestId, requestKey: '4a5a8f31-33a5-48f2-a1a0-2cbe28a9c95f' }; } }, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, completeLocal: async (value) => { completed.push(value); return { status: 'bound', ownerId: value.verifiedOwnerId }; } });
  await bridge.beginGoogleLogin();
  const requestKey = bridge.readPendingIntent().requestNonce;
  await assert.rejects(bridge.handleCallback({ callbackCode: 'callback-code' }), /temporary failure/);
  assert.equal(bridge.readPendingIntent().targetId, ownerId);
  const resumed = await bridge.resumePendingLogin();
  assert.equal(resumed.status, 'verified'); assert.equal(completed[0].requestKey, requestKey); assert.equal(attempts, 2);
});

test('no source guest still binds local works after target verification without a server claim', async () => {
  const f = fixture({ withGuest: false }); const completed = [];
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({ localOnly: true }), completeLocal: async (value) => { completed.push(value); return { status: 'bound', ownerId: value.verifiedOwnerId }; } });
  await bridge.beginGoogleLogin();
  const requestKey = bridge.readPendingIntent().requestNonce;
  const result = await bridge.handleCallback({ callbackCode: 'callback-code' });
  assert.equal(result.status, 'verified'); assert.equal(result.guestClaimed, false); assert.equal(f.claims.length, 0);
  assert.deepEqual(completed[0], { verifiedOwnerId: ownerId, requestKey, snapshot: { localOnly: true }, guestClaimed: false });
});

test('callback cancellation and expiry clear intent without claim', async () => {
  const f = fixture();
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000 });
  await bridge.beginGoogleLogin();
  const cancelled = await bridge.handleCallback({ callbackError: true });
  assert.equal(cancelled.status, 'cancelled'); assert.equal(bridge.readPendingIntent(), null); assert.equal(f.claims.length, 0);
  await bridge.beginGoogleLogin();
  const expiredBridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_900_000_000_000 });
  const expired = await expiredBridge.handleCallback({ callbackCode: 'callback-code' });
  assert.equal(expired.status, 'ignored'); assert.equal(bridge.readPendingIntent(), null); assert.equal(f.claims.length, 0);
});

test('unverified or anonymous OAuth target is rejected before legacy API persistence', async () => {
  const f = fixture(); let restored = false; const completed = [];
  const api = { async restore() { restored = true; return { id: ownerId }; } };
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/auth/v1/user')) return options.headers.Authorization === 'Bearer guest-access' ? userResponse(guestId, true) : userResponse(ownerId, true);
    if (url.pathname.endsWith('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'owner-access', refresh_token: 'owner-refresh' }), { status: 200 });
    throw new Error(`Unexpected URL ${url}`);
  };
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api, auth: f.auth, accountController: f.accountController, fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({}), completeLocal: async (value) => { completed.push(value); return { status: 'bound', ownerId: value.verifiedOwnerId }; } });
  await bridge.beginGoogleLogin();
  await assert.rejects(bridge.handleCallback({ callbackCode: 'callback-code' }), /確認済みの登録アカウント/);
  assert.equal(restored, false); assert.equal(f.claims.length, 0); assert.equal(completed.length, 0);
});

test('duplicate callback after completion can restore login but cannot claim twice', async () => {
  const f = fixture();
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({}), completeLocal: async ({ verifiedOwnerId }) => ({ status: 'bound', ownerId: verifiedOwnerId }) });
  await bridge.beginGoogleLogin();
  const first = await bridge.handleCallback({ callbackCode: 'callback-code' });
  const second = await bridge.handleCallback({ legacyCallback: { session: { access_token: 'owner-access', refresh_token: 'owner-refresh' } } });
  assert.equal(first.status, 'verified'); assert.equal(second.status, 'login_only');
  assert.deepEqual(f.claims, ['claim']);
});

test('implicit attacker session with a pending guest intent is rejected without mutation; legitimate PKCE can continue', async () => {
  const f = fixture(); let completed = 0; let restores = 0;
  const api = { async restore(session) { restores++; if (session) f.storage.setItem('PiXiEED:legacy-owner-session:v1', JSON.stringify({ ...session, user_id: ownerId })); return { id: ownerId }; } };
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({}), completeLocal: async ({ verifiedOwnerId }) => { completed++; return { status: 'bound', ownerId: verifiedOwnerId }; } });
  await bridge.beginGoogleLogin();
  const requestKey = bridge.readPendingIntent().requestNonce;
  const rejected = await bridge.handleCallback({ legacyCallback: { session: { access_token: 'attacker-access', refresh_token: 'attacker-refresh' } } });
  assert.equal(rejected.status, 'rejected'); assert.equal(restores, 0); assert.equal(f.claims.length, 0); assert.equal(completed, 0);
  assert.equal(bridge.readPendingIntent().requestNonce, requestKey);
  const accepted = await bridge.handleCallback({ callbackCode: 'legitimate-code' });
  assert.equal(accepted.status, 'verified'); assert.equal(restores, 1); assert.equal(f.claims.length, 1); assert.equal(completed, 1);
});


test('cancellation during target restore prevents a later server claim and local binding', async () => {
  const f = fixture(); let releaseRestore; let restores = 0; let completed = 0;
  const api = { async restore(session) {
    if (session) {
      restores++;
      await new Promise((resolve) => { releaseRestore = resolve; });
      return { id: ownerId };
    }
    return { id: ownerId };
  } };
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({}), completeLocal: async ({ verifiedOwnerId }) => { completed++; return { status: 'bound', ownerId: verifiedOwnerId }; }, cancelLocal: () => {} });
  await bridge.beginGoogleLogin();
  const callback = bridge.handleCallback({ callbackCode: 'callback-code' });
  while (!releaseRestore) await new Promise((resolve) => setImmediate(resolve));
  bridge.cancelPendingLogin();
  releaseRestore();
  await assert.rejects(callback, /準備状態が変わりました/);
  assert.equal(restores, 1); assert.equal(f.claims.length, 0); assert.equal(completed, 0); assert.equal(bridge.readPendingIntent(), null);
});

test('cancellation after claim dispatch cannot erase an uncertain server outcome', async () => {
  const f = fixture(); let releaseClaim; let dispatched; let completed = 0;
  const dispatchGate = new Promise((resolve) => { dispatched = resolve; });
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth,
    accountController: { async claimForCurrentAccount(options = {}) { options.beforeDispatch?.(); dispatched(); await new Promise((resolve) => { releaseClaim = resolve; }); return { status: 'claimed', userId: ownerId, guestId }; } },
    fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000,
    prepareLocal: async () => ({}), completeLocal: async ({ verifiedOwnerId }) => { completed++; return { status: 'bound', ownerId: verifiedOwnerId }; } });
  await bridge.beginGoogleLogin();
  const callback = bridge.handleCallback({ callbackCode: 'callback-code' });
  await dispatchGate;
  assert.throws(() => bridge.cancelPendingLogin(), /進行中です/);
  assert.equal(bridge.readPendingIntent().phase, 'claiming');
  releaseClaim();
  const outcome = await callback;
  assert.equal(outcome.status, 'verified'); assert.equal(completed, 1); assert.equal(bridge.readPendingIntent(), null);
});


test('prepared cancellation invokes the local coordinator before clearing bridge intent', async () => {
  const f = fixture(); const order = [];
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({ revision: 3 }), cancelLocal: () => order.push(bridge.readPendingIntent()?.requestNonce ? 'local-cancelled' : 'missing-intent') });
  await bridge.beginGoogleLogin();
  bridge.cancelPendingLogin();
  assert.deepEqual(order, ['local-cancelled']);
  assert.equal(bridge.readPendingIntent(), null);
});

test('claim receipt request key is independent from the local intent nonce', async () => {
  const f = fixture();
  const bridge = createGuestGoogleBridge({ windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth: f.auth, accountController: f.accountController, fetchImpl: f.fetchImpl, config: project, cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({}), completeLocal: async ({ verifiedOwnerId }) => ({ status: 'bound', ownerId: verifiedOwnerId }) });
  await bridge.beginGoogleLogin();
  const localNonce = bridge.readPendingIntent().requestNonce;
  const result = await bridge.handleCallback({ callbackCode: 'callback-code' });
  assert.equal(result.status, 'verified');
  assert.notEqual(localNonce, '4a5a8f31-33a5-48f2-a1a0-2cbe28a9c95f');
});


test('real account controller and local coordinator retry a partial claim with the same server key', async () => {
  const deviceId = '11111111-1111-4111-8111-111111111111';
  const localAccountA = '77777777-7777-4777-8777-777777777777';
  const sourceWork = '66666666-6666-4666-8666-666666666666';
  const deviceWork = '88888888-8888-4888-8888-888888888888';
  const serverKey = '44444444-4444-4444-8444-444444444444';
  const fp = 'a'.repeat(64);
  const storage = memoryStorage({
    'PiXiEED:supabase-session:v1': JSON.stringify({ access_token: 'expired-guest', refresh_token: 'guest-refresh', user_id: guestId })
  });
  const sessionStorage = memoryStorage();
  const idb = { open() {
    const request = { result: { close() {} }, transaction: { abort() { queueMicrotask(() => request.onerror?.()); } } };
    queueMicrotask(() => request.onupgradeneeded?.());
    return request;
  } };
  const ownership = createLocalWorkOwnership({
    adapter: createMemoryLocalWorkOwnershipAdapter(), indexedDBRef: idb, storage,
    getSessionFingerprint: async () => fp, randomUUID: () => deviceId
  });
  await ownership.activateAccount({ accountId: localAccountA, sessionFingerprint: fp, verified: true });
  await ownership.recordSave({ namespace: 'pxd', id: sourceWork, revisionId: 'old-account-work' });
  ownership.clearActiveAccount();
  await ownership.recordSave({ namespace: 'pxd', id: deviceWork, revisionId: 'device-work' });

  let guestRefreshes = 0;
  const auth = {
    async getSession() { return { access_token: 'owner-access', user: { id: ownerId, is_anonymous: false, email_confirmed_at: '2026-01-01T00:00:00Z' } }; },
    async refreshGuest() {
      guestRefreshes++;
      storage.setItem('PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'fresh-guest', refresh_token: 'fresh-refresh', user_id: guestId }));
      return { user: { id: guestId, is_anonymous: true } };
    }
  };
  const calls = [];
  let claimAttempts = 0;
  const mockFetch = async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) {
      const token = options.headers?.Authorization?.slice(7);
      if (token === 'expired-guest') return new Response('{}', { status: 401 });
      if (token === 'fresh-guest') return userResponse(guestId, true);
      if (token === 'owner-access') return userResponse(ownerId, false);
      return new Response('{}', { status: 401 });
    }
    if (url.pathname.endsWith('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'owner-access', refresh_token: 'owner-refresh' }), { status: 200 });
    if (url.pathname.endsWith('/functions/v1/social-feed')) {
      claimAttempts++;
      const body = JSON.parse(options.body);
      if (claimAttempts === 1) return new Response(JSON.stringify({ ok: false }), { status: 503 });
      return new Response(JSON.stringify({ ok: true, claim: { requestKey: body.requestKey, guestId, ownerId } }), { status: 200 });
    }
    throw new Error(`Unexpected synthetic request: ${url.pathname}`);
  };
  const accountController = createGuestAccountController({
    fetchImpl: mockFetch, storage, config: project, auth,
    randomUUID: () => serverKey, locks: { request: (_name, _options, run) => run() }
  });
  const local = createLocalLoginTransfer({
    auth, storage, indexedDBRef: idb, ownership, fingerprint: async () => fp,
    randomUUID: () => '99999999-9999-4999-8999-999999999999'
  });
  const windowRef = windowStub();
  const api = {
    async restore(session) {
      if (session) storage.setItem('PiXiEED:legacy-owner-session:v1', JSON.stringify({ ...session, user_id: ownerId }));
      return { id: ownerId };
    }
  };
  const bridge = createGuestGoogleBridge({
    windowRef, storage, sessionStorage, api, auth, accountController, fetchImpl: mockFetch, config: project,
    cryptoRef: webcrypto, now: () => 1_800_000_000_000,
    prepareLocal: ({ requestNonce, includeLegacy, sourceGuestId: sourceId }) => local.prepareLocal({ requestNonce, includeLegacy, sourceGuestId: sourceId }),
    completeLocal: (value) => local.completeLocal(value), cancelLocal: () => local.cancel()
  });

  await bridge.beginGoogleLogin();
  const intent = bridge.readPendingIntent();
  assert.equal(intent.sourceGuestId, guestId);
  assert.equal(guestRefreshes, 1);
  assert.deepEqual(intent.snapshot.items.map(({ id }) => id), [deviceWork]);
  assert.equal(intent.snapshot.items.some(({ id }) => id === sourceWork), false, 'old account A work is excluded from device-owned selection');

  await assert.rejects(bridge.handleCallback({ callbackCode: 'synthetic-code' }), /引き継ぎを確認できません/);
  const pendingServerKey = accountController.pending.requestKey;
  assert.equal(pendingServerKey, serverKey);
  assert.equal(bridge.readPendingIntent().phase, 'claiming');
  assert.equal(JSON.parse(storage.getItem('PiXiEED:supabase-session:v1')).access_token, 'fresh-guest');

  const resumed = await bridge.resumePendingLogin();
  assert.equal(resumed.status, 'verified');
  assert.equal(claimAttempts, 2);
  const requests = calls.filter(({ url }) => url.pathname.endsWith('/functions/v1/social-feed'));
  assert.deepEqual(requests.map(({ options }) => JSON.parse(options.body).requestKey), [serverKey, serverKey]);
  assert.equal(local.pending.phase, 'completed');
  const owners = await ownership.listOwnership();
  assert.deepEqual(owners.find(({ id }) => id === sourceWork).owner, { kind: 'account', id: localAccountA });
  assert.deepEqual(owners.find(({ id }) => id === deviceWork).owner, { kind: 'account', id: ownerId });
});

test('a verified promoted source account is local-only and never becomes guest proof for a different target', async () => {
  const f = fixture();
  f.storage.setItem('PiXiEED:supabase-session:v1', JSON.stringify({ access_token: 'promoted-source', refresh_token: 'source-refresh', user_id: guestId }));
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input); calls.push({ url, options });
    if (url.pathname.endsWith('/auth/v1/user')) {
      const token = options.headers.Authorization.slice(7);
      if (token === 'promoted-source') return userResponse(guestId, false);
      if (token === 'owner-access') return userResponse(ownerId, false);
    }
    if (url.pathname.endsWith('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'owner-access', refresh_token: 'owner-refresh' }), { status: 200 });
    throw new Error(`Unexpected URL ${url.pathname}`);
  };
  const auth = { async getSession() { return { access_token: 'owner-access', user: { id: ownerId, is_anonymous: false, email_confirmed_at: '2026-01-01T00:00:00Z' } }; } };
  const accountController = createGuestAccountController({ fetchImpl, storage: f.storage, config: project, auth, locks: { request: (_n, _o, run) => run() } });
  const bridge = createGuestGoogleBridge({
    windowRef: f.windowRef, storage: f.storage, sessionStorage: f.sessionStorage, api: f.api, auth, accountController, fetchImpl, config: project,
    cryptoRef: webcrypto, now: () => 1_800_000_000_000, prepareLocal: async () => ({ items: [] }),
    completeLocal: async ({ verifiedOwnerId }) => ({ status: 'bound', ownerId: verifiedOwnerId })
  });
  await bridge.beginGoogleLogin();
  assert.equal(bridge.readPendingIntent().sourceGuestId, '');
  const result = await bridge.handleCallback({ callbackCode: 'synthetic-code' });
  assert.equal(result.status, 'verified');
  assert.equal(calls.some(({ url }) => url.pathname.endsWith('/functions/v1/social-feed')), false);
});
