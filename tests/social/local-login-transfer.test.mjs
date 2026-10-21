import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalLoginTransfer } from '../../js/social/local-login-transfer.mjs';
import { createLocalWorkOwnership, createMemoryLocalWorkOwnershipAdapter } from '../../js/creation/local-work-ownership.mjs';

const deviceId = '11111111-1111-4111-8111-111111111111';
const ownerA = '22222222-2222-4222-8222-222222222222';
const ownerB = '33333333-3333-4333-8333-333333333333';
const requestA = '44444444-4444-4444-8444-444444444444';
const requestB = '55555555-5555-4555-8555-555555555555';
const workA = '66666666-6666-4666-8666-666666666666';
const fp = 'a'.repeat(64);
const INTENT = 'PiXiEED:local-work-login:v1';
const DEVICE = 'PiXiEED:local-work-device:v1';
const ACTIVE = 'PiXiEED:local-work-account:v1';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { map, getItem(key) { return map.has(key) ? map.get(key) : null; }, setItem(key, value) { map.set(key, String(value)); }, removeItem(key) { map.delete(key); } };
}
function idbOf(records = {}) {
  const opened = [];
  return {
    opened,
    open(name, version) {
      opened.push({name, version});
      const request = {};
      queueMicrotask(() => {
        const stores = records[name];
        if (!stores) {
          request.result = {close() {}};
          request.transaction = {abort() { queueMicrotask(() => request.onerror?.()); }};
          request.onupgradeneeded?.();
          return;
        }
        request.result = {
          objectStoreNames: {contains: (store) => Object.hasOwn(stores, store)},
          transaction(storeName, mode) {
            assert.equal(mode, 'readonly');
            return {
              objectStore(nameArg) {
                assert.equal(nameArg, storeName);
                return { openKeyCursor() {
                  const cursorRequest = {};
                  const keys = [...stores[storeName]];
                  let i = 0;
                  const step = () => queueMicrotask(() => {
                    cursorRequest.result = i < keys.length ? {primaryKey: keys[i], continue() { i += 1; step(); }} : null;
                    cursorRequest.onsuccess?.();
                  });
                  step();
                  return cursorRequest;
                }, get() { throw new Error('legacy values must not be read'); }, getAll() { throw new Error('legacy values must not be read'); }};
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
function makeHarness({records = {}, adapter = createMemoryLocalWorkOwnershipAdapter(), userId = ownerA, authSession = true} = {}) {
  const storage = memoryStorage({'PiXiEED:supabase-session:v1': 'synthetic-session'});
  const indexedDBRef = idbOf(records);
  const ownership = createLocalWorkOwnership({adapter, indexedDBRef, storage, getSessionFingerprint: () => fp, randomUUID: () => deviceId});
  let currentUser = userId;
  const auth = { async getSession() {
    return authSession && currentUser ? {access_token: 'synthetic-access-token', user: {id: currentUser, is_anonymous: false, email_confirmed_at: '2026-01-01T00:00:00Z'}} : null;
  }};
  const transfer = createLocalLoginTransfer({auth, storage, indexedDBRef, ownership, fingerprint: async () => fp, randomUUID: () => requestA, now: () => 123});
  return {storage, indexedDBRef, ownership, transfer, setUser(value) { currentUser = value; }};
}

const legacyRecords = {
  'pixieed-pxd-v1': {projects: ['legacy-project']},
  'pixieed-creation-drafts-v1': {drafts: []},
  'pixieed-social-drafts-v1': {entries: []}
};

test('fresh device-owned work binds locally without changing its saved work payload', async () => {
  const harness = makeHarness();
  const payload = {projectId: workA, pixels: [1, 2, 3], revisionId: 'rev-1', audio: new Uint8Array([9, 8])};
  const before = structuredClone(payload);
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-1'});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  const result = await harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared});
  assert.deepEqual(result, {status: 'bound', ownerId: ownerA, count: 1, legacyUnclaimedCount: 0});
  assert.deepEqual(payload, before);
  assert.deepEqual((await harness.ownership.listOwnership())[0].owner, {kind: 'account', id: ownerA});
  assert.equal(harness.transfer.pending?.phase, 'completed');
});

test('unknown legacy keys remain unclaimed unless explicitly selected', async () => {
  const harness = makeHarness({records: legacyRecords});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  assert.equal(prepared.items.length, 0);
  assert.equal(prepared.legacyUnclaimedCount, 1);
  assert.deepEqual(await harness.ownership.listOwnership(), []);
  assert.equal((await harness.transfer.listSummary()).legacyUnknown, 1);
  harness.transfer.cancel();
  const optedIn = await harness.transfer.prepareLocal({requestNonce: requestB, includeLegacy: true});
  assert.equal(optedIn.items.length, 1);
  assert.equal(optedIn.items[0].provenance, 'legacy-unknown');
  assert.equal(optedIn.items[0].owner.kind, 'device');
});

test('work owned by another registered account is not reassigned by preparing a device login', async () => {
  const harness = makeHarness();
  await harness.ownership.activateAccount({accountId: ownerB, sessionFingerprint: fp, verified: true});
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-1'});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  assert.deepEqual(prepared.items, []);
  await harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared});
  assert.deepEqual((await harness.ownership.listOwnership())[0].owner, {kind: 'account', id: ownerB});
});

test('cancel leaves work ownership intact and removes only its matching pending intent', async () => {
  const harness = makeHarness();
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-1'});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  assert.deepEqual(harness.transfer.cancel(), {cancelled: true});
  assert.equal(harness.storage.getItem(INTENT), null);
  assert.deepEqual((await harness.ownership.listOwnership())[0].owner, {kind: 'device', id: deviceId});
  assert.equal(prepared.phase, 'prepared');
});

test('changed verified owner fails closed and keeps the prepared intent and device ownership', async () => {
  const harness = makeHarness();
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-1'});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  harness.setUser(ownerB);
  await assert.rejects(harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared}), /本人確認/);
  assert.ok(harness.transfer.pending);
  assert.deepEqual((await harness.ownership.listOwnership())[0].owner, {kind: 'device', id: deviceId});
});

test('atomic registry failure preserves work and intent for idempotent retry after acknowledgement loss', async () => {
  const memory = createMemoryLocalWorkOwnershipAdapter();
  let failAfterCommit = true;
  const adapter = {
    all: () => memory.all(),
    async atomic(keys, decide) {
      const result = await memory.atomic(keys, decide);
      if (failAfterCommit && keys.includes(`journal:${requestB}`)) {
        failAfterCommit = false;
        throw new Error('synthetic acknowledgement lost');
      }
      return result;
    }
  };
  const harness = makeHarness({adapter});
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-1'});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  await assert.rejects(harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared}), /acknowledgement lost/);
  assert.ok(harness.transfer.pending);
  assert.deepEqual((await harness.ownership.listOwnership())[0].owner, {kind: 'account', id: ownerA}, 'registry commit can succeed before its acknowledgement is lost');
  const replay = await harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared});
  assert.equal(replay.status, 'bound');
  assert.equal((await harness.ownership.listOwnership())[0].owner.id, ownerA);
});

test('stale snapshot or pre-commit failure never partially reassigns local work', async () => {
  const memory = createMemoryLocalWorkOwnershipAdapter();
  let fail = false;
  const adapter = {all: () => memory.all(), atomic: (keys, decide) => {
    if (fail && keys.includes(`journal:${requestB}`)) throw new Error('synthetic transaction failure');
    return memory.atomic(keys, decide);
  }};
  const harness = makeHarness({adapter});
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-1'});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  fail = true;
  await assert.rejects(harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared}), /transaction failure/);
  assert.deepEqual((await harness.ownership.listOwnership())[0].owner, {kind: 'device', id: deviceId});
  fail = false;
  await assert.rejects(harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: {...prepared, items: []}}), /切り替わりました/);
  assert.deepEqual((await harness.ownership.listOwnership())[0].owner, {kind: 'device', id: deviceId});
});

test('successful intent is retained as completed, can replay, and is consumed before a new request', async () => {
  const harness = makeHarness();
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-1'});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  await harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared});
  assert.equal(harness.transfer.pending?.phase, 'completed');
  const repeated = await harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared});
  assert.equal(repeated.status, 'bound');
  const next = await harness.transfer.prepareLocal({requestNonce: '77777777-7777-4777-8777-777777777777'});
  assert.equal(next.requestNonce, '77777777-7777-4777-8777-777777777777');
  assert.equal(next.items.length, 0);
});

test('stale revisions refresh only when the selected device-owned ID set is unchanged', async () => {
  const harness = makeHarness();
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-1'});
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  await harness.ownership.recordSave({namespace: 'pxd', id: workA, revisionId: 'rev-2'});
  const result = await harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared});
  assert.equal(result.count, 1);
  const row = (await harness.ownership.listOwnership())[0];
  assert.equal(row.revisionId, 'rev-2');
  assert.deepEqual(row.owner, {kind: 'account', id: ownerA});
});

test('completed intent can be explicitly cancelled', async () => {
  const harness = makeHarness();
  const prepared = await harness.transfer.prepareLocal({requestNonce: requestA});
  await harness.transfer.completeLocal({verifiedOwnerId: ownerA, requestKey: requestB, snapshot: prepared});
  assert.equal(harness.transfer.pending?.phase, 'completed');
  assert.deepEqual(harness.transfer.cancel(), {cancelled: true});
  assert.equal(harness.transfer.pending, null);
});
