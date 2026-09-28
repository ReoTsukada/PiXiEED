import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canDerive, canonicalize, createDerivedAsset, hashCanonical, toShareManifest, validateAsset
} from '../../js/creation/asset-contract.mjs';
import { createLocalDraftStore, createMemoryDraftAdapter } from '../../js/creation/local-drafts.mjs';

const publishedAsset = {
  schemaVersion: 1, assetId: 'asset-a', revisionId: 'rev-a', contentHash: 'a'.repeat(64),
  hashScheme: 'sha256-canonical-v1', kind: 'pixel_art', source: { type: 'hand_drawn', assetId: null, revisionId: null },
  owner: { type: 'account', id: 'owner-a' }, visibility: 'published', reusePermission: 'owner_only',
  preview: { mimeType: 'image/png', width: 16, height: 16, locator: 'public-image-42' }
};

test('canonical document hash is stable and distinct from a legacy file-byte hash', async () => {
  assert.equal(canonicalize({ z: 1, a: [true, 'x'] }), canonicalize({ a: [true, 'x'], z: 1 }));
  assert.equal(await hashCanonical({ z: 1, a: 2 }), await hashCanonical({ a: 2, z: 1 }));
  assert.throws(() => validateAsset({ ...publishedAsset, hashScheme: 'sha256-file-v1', kind: 'song' }), /reserved/);
  assert.throws(() => validateAsset({ ...publishedAsset, contentHash: null, hashScheme: 'sha256-canonical-v1' }), /unverified/);
  assert.throws(() => canonicalize({ value: undefined }), /plain JSON|data properties/);
  assert.throws(() => canonicalize({ value: () => 1 }), /plain JSON|data properties/);
  assert.throws(() => canonicalize({ [Symbol('hidden')]: 1 }), /symbol keys/);
  assert.throws(() => canonicalize([, 1]), /holes/);
});

test('unknown permissions fail closed and owner_only assets cannot be derived by another owner', () => {
  assert.equal(canDerive({ ...publishedAsset, reusePermission: 'future_permission' }, 'owner-a'), false);
  assert.equal(canDerive(publishedAsset, 'owner-b'), false);
  assert.equal(canDerive(publishedAsset, 'owner-a'), true);
  assert.equal(canDerive({ ...publishedAsset, reusePermission: 'derivative_allowed' }, 'owner-b'), false);
  assert.equal(canDerive({ ...publishedAsset, reusePermission: 'derivative_allowed' }, 'owner-a'), true);
  assert.equal(canDerive({ ...publishedAsset, reusePermission: 'playable' }, 'owner-a'), false);
  assert.throws(() => createDerivedAsset(publishedAsset, { actorId: 'owner-b', schemaVersion: 1 }), /not permitted/);
});

test('shared preview rejects private location and review locators', () => {
  assert.throws(() => toShareManifest({ ...publishedAsset, preview: { ...publishedAsset.preview, locator: 'lat=35.6,lng=139.7' } }), /safe to share/);
  assert.throws(() => toShareManifest({ ...publishedAsset, visibility: 'pending' }), /safe to share/);
  assert.equal(toShareManifest(publishedAsset).revisionId, 'rev-a');
});

test('local drafts resume the saved revision without changing prior revisions', async () => {
  let nextId = 0;
  const store = createLocalDraftStore(createMemoryDraftAdapter(), { idFactory: () => `local-${++nextId}` });
  const first = await store.save({ kind: 'pixel_art', document: { pixels: [1, 2, 3] } });
  const resumed = await store.load('local-1');
  assert.equal(resumed.revisionId, first.revisionId);
  const second = await store.save({ draftId: 'local-1', kind: 'pixel_art', document: { pixels: [3, 2, 1] } });
  assert.notEqual(second.revisionId, first.revisionId);
  assert.notEqual(second.documentHash, first.documentHash);
  assert.deepEqual((await store.load('local-1')).document, { pixels: [3, 2, 1] });
  assert.deepEqual(first.document, { pixels: [1, 2, 3] });
});

test('storage failures and unknown stored versions are rejected', async () => {
  const failing = createLocalDraftStore({ get: async () => null, put: async () => { throw new Error('quota'); } }, { idFactory: () => 'id' });
  await assert.rejects(failing.save({ kind: 'pixel_art', document: { pixels: [] } }), /quota/);
  const corrupt = createLocalDraftStore({ get: async () => ({ schemaVersion: 9 }), put: async () => {} });
  await assert.rejects(corrupt.load('old'), /unsupported/);
});

test('load and append re-hash every saved document and verify record asset identity', async () => {
  let stored;
  const adapter = {
    async get() { return stored ? structuredClone(stored) : null; },
    async put(record) { stored = structuredClone(record); }
  };
  let nextId = 0;
  const store = createLocalDraftStore(adapter, { idFactory: () => `draft-${++nextId}` });
  await store.save({ draftId: 'draft-record', kind: 'pixel_art', document: { pixels: [1, 2] } });
  stored.revisions[0].document.pixels[0] = 9;
  await assert.rejects(store.load('draft-record'), /document hash/);
  await assert.rejects(store.save({ draftId: 'draft-record', kind: 'pixel_art', document: { pixels: [3] } }), /document hash/);
  stored.revisions[0].document.pixels[0] = 1;
  stored.revisions[0].asset.assetId = 'different-asset';
  await assert.rejects(store.load('draft-record'), /immutable revision/);
});
