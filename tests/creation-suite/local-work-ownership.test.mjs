import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalWorkOwnership, createMemoryLocalWorkOwnershipAdapter, localWorkSessionFingerprint, getDefaultLocalWorkOwnership } from '../../js/creation/local-work-ownership.mjs';

const deviceId = '11111111-1111-4111-8111-111111111111';
const accountA = '22222222-2222-4222-8222-222222222222';
const accountB = '33333333-3333-4333-8333-333333333333';
const guestId = '44444444-4444-4444-8444-444444444444';
const key1 = '55555555-5555-4555-8555-555555555555';
const key2 = '66666666-6666-4666-8666-666666666666';
const requestKey = '77777777-7777-4777-8777-777777777777';
const fpA = 'a'.repeat(64), fpB = 'b'.repeat(64);
function storageOf(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
}
function setup({ adapter = createMemoryLocalWorkOwnershipAdapter(), fingerprint = fpA } = {}) {
  const storage = storageOf();
  let activeFingerprint = fingerprint;
  const api = createLocalWorkOwnership({ adapter, storage, getSessionFingerprint: () => activeFingerprint, randomUUID: () => deviceId });
  return { api, storage, setFingerprint(value) { activeFingerprint = value; } };
}
async function activate(api, accountId = accountA, fingerprint = fpA) {
  return api.activateAccount({ accountId, sessionFingerprint: fingerprint, verified: true });
}

function fakeLegacyIndexedDb() {
  const records = {
    'pixieed-pxd-v1': { projects: ['project-old'] },
    'pixieed-creation-drafts-v1': { drafts: ['draft-old'] },
    'pixieed-social-drafts-v1': { entries: ['draft:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bookmark:ignored'] }
  };
  const requests = [];
  return {
    requests,
    open(name, version) {
      requests.push({ name, version });
      const request = {};
      queueMicrotask(() => {
        if (!Object.hasOwn(records, name)) {
          request.result = { close() {} };
          request.transaction = { abort() { queueMicrotask(() => request.onerror?.()); } };
          request.onupgradeneeded?.();
          return;
        }
        const stores = records[name];
        request.result = {
          objectStoreNames: { contains: (store) => Object.hasOwn(stores, store) },
          transaction(storeName, mode) {
            assert.equal(mode, 'readonly');
            return {
              objectStore(nameArg) {
                assert.equal(nameArg, storeName);
                return {
                  openKeyCursor() {
                    const cursorRequest = {};
                    const keys = [...(stores[storeName] || [])];
                    let index = 0;
                    const advance = () => queueMicrotask(() => {
                      cursorRequest.result = index < keys.length ? { primaryKey: keys[index], continue() { index += 1; advance(); } } : null;
                      cursorRequest.onsuccess?.();
                    });
                    advance();
                    return cursorRequest;
                  },
                  get() { throw new Error('values must never be read'); },
                  getAll() { throw new Error('values must never be read'); }
                };
              },
              set oncomplete(fn) { queueMicrotask(fn); }, set onabort(_fn) {}, set onerror(_fn) {}
            };
          },
          close() {}
        };
        request.onsuccess?.();
      });
      return request;
    }
  };
}

test('new saves capture verified account or stable device ownership without touching work content', async () => {
  const { api, storage } = setup();
  const first = await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r1' });
  assert.deepEqual(first.owner, { kind: 'device', id: deviceId });
  assert.equal(first.provenance, 'saved');
  assert.deepEqual(Object.keys(first).sort(), ['id', 'namespace', 'owner', 'provenance', 'revisionId', 'visibility'].sort());
  await activate(api);
  const second = await api.recordSave({ namespace: 'feed-draft', id: key2, revisionId: 'r2' });
  assert.deepEqual(second.owner, { kind: 'account', id: accountA });
  const revised = await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r3' });
  assert.deepEqual(revised.owner, first.owner, 'subsequent saves preserve existing ownership');
  assert.equal(revised.revisionId, 'r3');
  assert.equal(storage.getItem('PiXiEED:local-work-device:v1'), deviceId);
});

test('new unverified session marker cannot attach work to a different account', async () => {
  const { api, setFingerprint } = setup();
  await activate(api, accountA, fpA);
  setFingerprint(fpB);
  const saved = await api.recordSave({ namespace: 'creation-draft', id: 'draft-x', revisionId: 'rev-x' });
  assert.deepEqual(saved.owner, { kind: 'device', id: deviceId });
  await assert.rejects(() => activate(api, accountB, fpA), /ログイン状態/);
});

test('first metadata record for previously existing raw work stays device-owned and legacy-unknown even when logged in', async () => {
  const { api } = setup();
  await activate(api);
  const inherited = await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r1', existingWork: true });
  assert.deepEqual(inherited.owner, { kind: 'device', id: deviceId });
  assert.equal(inherited.provenance, 'legacy-unknown');
  assert.deepEqual(await api.snapshotForLogin(), [], 'legacy provenance is excluded until explicit selection');

  const revised = await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r2', existingWork: true });
  assert.deepEqual(revised.owner, inherited.owner);
  assert.equal(revised.provenance, 'legacy-unknown');
  assert.equal(revised.revisionId, 'r2');

  await assert.rejects(api.recordSave({ namespace: 'pxd', id: key2, revisionId: 'r1', existingWork: 'yes' }), /ID/);
  const fresh = await api.recordSave({ namespace: 'pxd', id: key2, revisionId: 'r1' });
  assert.deepEqual(fresh.owner, { kind: 'account', id: accountA });
  assert.equal(fresh.provenance, 'saved');
});

test('legacy inventory reads keys only, does not create missing stores, and leaves unknown items unclaimed until explicit choice', async () => {
  const indexedDBRef = fakeLegacyIndexedDb();
  const storage = storageOf();
  const api = createLocalWorkOwnership({ indexedDBRef, storage, adapter: createMemoryLocalWorkOwnershipAdapter(), getSessionFingerprint: () => fpA, randomUUID: () => deviceId });
  const found = await api.discoverLegacy();
  assert.deepEqual(found.map(({ namespace, id }) => [namespace, id]), [
    ['pxd', 'project-old'], ['creation-draft', 'draft-old'], ['feed-draft', 'draft:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']
  ]);
  assert.ok(indexedDBRef.requests.every((request) => request.version === undefined));
  assert.deepEqual(await api.listOwnership(), []);
  await assert.rejects(api.bindDeviceLegacy({ keys: [found[0]], includeLegacy: false }));
  const bound = await api.bindDeviceLegacy({ keys: [found[0], found[2]], includeLegacy: true });
  assert.equal(bound.length, 2);
  assert.ok(bound.every((row) => row.owner.kind === 'device' && row.provenance === 'legacy-unknown'));
  const hidden = await api.snapshotForLogin({ includeLegacy: false });
  assert.deepEqual(hidden, []);
  const explicit = await api.snapshotForLogin({ includeLegacy: true });
  assert.equal(explicit.length, 2);
  await activate(api);
  await assert.rejects(api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot: explicit }), /明示的な選択/);
  assert.equal((await api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot: explicit, includeLegacy: true })).status, 'bound');
});

test('account binding is idempotent, revision checked, and cannot steal another account work', async () => {
  const { api } = setup();
  await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r1' });
  await activate(api, accountA);
  const snapshot = await api.snapshotForLogin();
  const result = await api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot });
  assert.equal(result.status, 'bound');
  assert.equal((await api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot })).status, 'already_bound');
  const before = await api.listOwnership();
  await assert.rejects(api.bindVerified({ accountId: accountB, sessionFingerprint: fpA, verified: true, requestKey: '88888888-8888-4888-8888-888888888888', snapshot }), /確認済みアカウント/);
  await activate(api, accountB);
  await assert.rejects(api.bindVerified({ accountId: accountB, sessionFingerprint: fpA, verified: true, requestKey: '88888888-8888-4888-8888-888888888888', snapshot }), /別のアカウント|別のタブ/);
  assert.deepEqual(await api.listOwnership(), before);
});

test('guest-owned work binds only with matching server claim and source revision', async () => {
  const adapter = createMemoryLocalWorkOwnershipAdapter();
  const { api } = setup({ adapter });
  await activate(api, guestId, fpA);
  await api.recordSave({ namespace: 'feed-draft', id: 'draft:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', revisionId: 'g1' });
  const source = (await api.listOwnership())[0];
  await activate(api, accountA, fpA);
  await assert.rejects(api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot: [source] }), /別のアカウント/);
  const claim = { requestKey, guestId, ownerId: accountA };
  assert.equal((await api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot: [source], serverClaim: claim })).status, 'bound');
  await assert.rejects(api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey: '88888888-8888-4888-8888-888888888888', snapshot: [{ ...source, revisionId: 'stale' }], serverClaim: { ...claim, requestKey: '88888888-8888-4888-8888-888888888888' } }), /別のタブ/);
});

test('multi-row bind fails atomically when one snapshot is stale', async () => {
  const { api } = setup();
  await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r1' });
  await api.recordSave({ namespace: 'pxd', id: key2, revisionId: 'r2' });
  await activate(api);
  const snapshot = await api.snapshotForLogin();
  const stale = [{ ...snapshot[0], revisionId: 'wrong' }, snapshot[1]];
  await assert.rejects(api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot: stale }), /別のタブ/);
  assert.ok((await api.listOwnership()).every((row) => row.owner.kind === 'device'));
});

test('shared session fingerprint prefers the verified owner snapshot and never returns its contents', async () => {
  const storage = storageOf({
    'PiXiEED:legacy-owner-session:v1': 'owner-token-snapshot',
    'PiXiEED:supabase-session:v1': 'guest-token-snapshot'
  });
  const ownerHash = await localWorkSessionFingerprint(storage);
  assert.match(ownerHash, /^[a-f0-9]{64}$/);
  assert.notEqual(ownerHash, 'owner-token-snapshot');
  assert.notEqual(ownerHash, await localWorkSessionFingerprint(storageOf({ 'PiXiEED:supabase-session:v1': 'guest-token-snapshot' })));
});

test('default helper reuses one registry per storage and IndexedDB pair', () => {
  const storage = storageOf();
  const indexedDBRef = { open() { throw new Error('not used'); } };
  const first = getDefaultLocalWorkOwnership({ storage, indexedDBRef });
  assert.equal(first, getDefaultLocalWorkOwnership({ storage, indexedDBRef }));
  assert.notEqual(first, getDefaultLocalWorkOwnership({ storage: storageOf(), indexedDBRef }));
});

test('default helper fingerprints the supplied storage pair when activating its account marker', async () => {
  const storage = storageOf({ 'PiXiEED:supabase-session:v1': 'custom-session' });
  const ownership = getDefaultLocalWorkOwnership({ storage, indexedDBRef: { open() { throw new Error('not used'); } } });
  const fingerprint = await localWorkSessionFingerprint(storage);
  await ownership.activateAccount({ accountId: accountA, sessionFingerprint: fingerprint, verified: true });
  assert.equal(JSON.parse(storage.getItem('PiXiEED:local-work-account:v1')).accountId, accountA);
});

test('empty device snapshot is a successful idempotent bind and duplicate item keys fail closed', async () => {
  const { api } = setup();
  await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r1' });
  await activate(api);
  const empty = await api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot: [] });
  assert.equal(empty.status, 'bound');
  assert.equal((await api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot: [] })).status, 'already_bound');
  const row = (await api.snapshotForLogin())[0];
  await assert.rejects(api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey: '88888888-8888-4888-8888-888888888888', snapshot: [row, row] }), /重複/);
});

test('registry metadata failure reports a warning without modifying raw work through this sidecar', async () => {
  const adapter = { async atomic() { throw new Error('synthetic quota error'); }, async all() { return []; } };
  const { api } = setup({ adapter });
  await assert.rejects(api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r1' }), /quota/);
  assert.deepEqual(await api.listOwnership(), []);
});

test('bind rechecks the raw auth snapshot inside the ownership transaction before committing', async () => {
  const storage = storageOf({ 'PiXiEED:supabase-session:v1': 'session-A' });
  const memory = createMemoryLocalWorkOwnershipAdapter();
  let changed = false;
  const adapter = {
    all: () => memory.all(),
    atomic: (keys, decide) => {
      if (!changed && keys.includes(`journal:${requestKey}`)) {
        changed = true;
        storage.setItem('PiXiEED:supabase-session:v1', 'session-B');
      }
      return memory.atomic(keys, decide);
    }
  };
  const api = createLocalWorkOwnership({ adapter, storage, getSessionFingerprint: () => fpA, randomUUID: () => deviceId });
  await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r1' });
  await api.activateAccount({ accountId: accountA, sessionFingerprint: fpA, verified: true });
  const snapshot = await api.snapshotForLogin();
  await assert.rejects(api.bindVerified({ accountId: accountA, sessionFingerprint: fpA, verified: true, requestKey, snapshot }), /別のタブ/);
  assert.equal((await api.listOwnership())[0].owner.kind, 'device');
});

test('new save falls back to device ownership if the auth snapshot changes before its metadata transaction', async () => {
  const storage = storageOf({ 'PiXiEED:supabase-session:v1': 'session-A' });
  const memory = createMemoryLocalWorkOwnershipAdapter();
  let changed = false;
  const adapter = {
    all: () => memory.all(),
    atomic: (keys, decide) => {
      if (!changed && keys.includes(`pxd:${key1}`)) {
        changed = true;
        storage.setItem('PiXiEED:supabase-session:v1', 'session-B');
      }
      return memory.atomic(keys, decide);
    }
  };
  const api = createLocalWorkOwnership({ adapter, storage, getSessionFingerprint: () => fpA, randomUUID: () => deviceId });
  await api.activateAccount({ accountId: accountA, sessionFingerprint: fpA, verified: true });
  const saved = await api.recordSave({ namespace: 'pxd', id: key1, revisionId: 'r1' });
  assert.deepEqual(saved.owner, { kind: 'device', id: deviceId });
});

test('account activation refuses to write its marker if the raw session changes while fingerprinting', async () => {
  const storage = storageOf({ 'PiXiEED:supabase-session:v1': 'session-A' });
  const api = createLocalWorkOwnership({
    adapter: createMemoryLocalWorkOwnershipAdapter(), storage,
    getSessionFingerprint: async () => { storage.setItem('PiXiEED:supabase-session:v1', 'session-B'); return fpA; }
  });
  await assert.rejects(api.activateAccount({ accountId: accountA, sessionFingerprint: fpA, verified: true }), /切り替わりました/);
  assert.equal(storage.getItem('PiXiEED:local-work-account:v1'), null);
});
