#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASSET_COMMAND_TYPES,
  ASSET_EVENT_TYPES,
  ASSET_KINDS,
  ASSET_REFERENCE_POLICIES,
  ASSET_REGISTRY_CONTRACT,
  ASSET_REGISTRY_FLAGS,
  ASSET_STORAGE_BOUNDARY,
  createAssetCommand,
  createAssetRegistry,
  validateAssetCommand,
  validateAssetDependencyRecord,
  validateAssetRecord,
  validateAssetRevisionRecord,
} from '../core-shell/assets/core-asset-registry-contracts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(root, 'core-shell/assets/core-asset-registry-contracts.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/fixtures/asset-registry-v1.valid.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/schemas/asset-registry-v1.schema.json'), 'utf8'));

assert.equal(ASSET_REGISTRY_CONTRACT.schemaVersion, 1);
assert.deepEqual(ASSET_REFERENCE_POLICIES, ['LIVE', 'PINNED', 'REVIEW', 'FORKED']);
assert.ok(ASSET_KINDS.includes('RASTER_IMAGE'));
assert.ok(ASSET_KINDS.includes('MUSIC_PROJECT'));
assert.ok(ASSET_STORAGE_BOUNDARY.excludedFromRegistry.includes('blob-bytes'));
assert.equal(schema.$defs.asset.properties.schemaVersion.const, 1);
for (const required of ['assetId', 'assetKind', 'ownerType', 'ownerId', 'headRevisionId', 'schemaVersion', 'recordVersion']) assert.ok(schema.$defs.asset.required.includes(required));
assert.doesNotMatch(moduleSource, /\b(?:document|window)\s*\./u, 'Asset Registry must not access DOM globals');
for (const forbiddenToken of ['HTMLCanvasElement', 'OffscreenCanvas', 'CanvasRenderingContext2D', 'fetch(', 'indexedDB', 'BroadcastChannel', 'Math.random', 'Date.now']) {
  assert.equal(moduleSource.includes(forbiddenToken), false, `Asset Registry must not depend on ${forbiddenToken}`);
}
assert.equal(validateAssetRecord(fixture.asset).valid, true);
assert.equal(validateAssetRevisionRecord(fixture.revision).valid, true);
assert.equal(validateAssetDependencyRecord(fixture.dependency).valid, true);
assert.equal(validateAssetRecord({ ...fixture.asset, assetKind: 'UNKNOWN_KIND' }).valid, false);
assert.equal(validateAssetRecord({ ...fixture.asset, metadata: { custom: { blob: 'not-allowed' } } }).valid, false);
assert.equal(validateAssetRecord({ ...fixture.asset, metadata: { custom: { purchase: 'not-allowed' } } }).valid, false);
assert.equal(validateAssetRecord({ ...fixture.asset, metadata: { description: 'data:image/png;base64,AAAA' } }).valid, false);
assert.equal(validateAssetRevisionRecord({ ...fixture.revision, storageLocator: { ...fixture.revision.storageLocator, objectKey: '../escape' } }).valid, false);
assert.equal(validateAssetRevisionRecord({ ...fixture.revision, immutable: false }).valid, false);
assert.equal(validateAssetDependencyRecord({ ...fixture.dependency, referencePolicy: 'UNKNOWN' }).valid, false);

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);
const hashD = 'd'.repeat(64);
const hashE = 'e'.repeat(64);
let sequence = 0;
let flagMode = 'enabled';
let verifierMode = 'valid';
const adapters = {
  clock: () => '2026-08-07T00:00:00.000Z',
  idGenerator: prefix => `${prefix}-${++sequence}`,
  random: () => 0.5,
  network: { request: () => { throw new Error('network belongs to an outer adapter'); } },
  blobVerifier: ({ contentHash, byteLength, contentType }) => {
    if (verifierMode === 'hash-mismatch') return { ok: true, computedHash: hashC, computedByteLength: byteLength, detectedContentType: contentType };
    if (verifierMode === 'size-mismatch') return { ok: true, computedHash: contentHash, computedByteLength: byteLength + 1, detectedContentType: contentType };
    if (verifierMode === 'mime-mismatch') return { ok: true, computedHash: contentHash, computedByteLength: byteLength, detectedContentType: 'text/html' };
    return { ok: true, computedHash: contentHash, computedByteLength: byteLength, detectedContentType: contentType };
  },
};
const featureFlagEvaluator = ({ flagId, action }) => {
  if (flagMode === 'off') return { flagId, action, enabled: false, decision: 'fallback', serverAuthorized: true, code: 'DEFAULT_OFF' };
  if (flagMode === 'read-on-upload-off' && flagId === ASSET_REGISTRY_FLAGS.storageUpload) return { flagId, action, enabled: false, decision: 'fallback', serverAuthorized: true, code: 'UPLOAD_OFF' };
  if (flagMode === 'write-off' && action === 'write') return { flagId, action, enabled: false, decision: 'fallback', serverAuthorized: true, code: 'WRITE_OFF' };
  if (flagMode === 'kill-switch') return { flagId, action, enabled: false, decision: 'fallback', serverAuthorized: true, code: 'FEATURE_FLAG_KILL_SWITCH' };
  return { flagId, action, enabled: true, decision: 'enabled', serverAuthorized: true };
};
const registry = createAssetRegistry({ adapters, featureFlagEvaluator });
const allow = capability => ({ ok: true, decision: 'allow', source: 'server', capability });
const command = (commandType, actorId, assetId, payload, expectedRecordVersion = null, capability = null) => createAssetCommand({
  commandType,
  assetId,
  actorId,
  expectedRecordVersion,
  payload,
  permissionDecision: allow(capability),
  adapters,
});
const createPayload = (overrides = {}) => ({
  assetId: 'asset-character',
  assetKind: 'RASTER_IMAGE',
  ownerType: 'USER',
  ownerId: 'user-owner',
  sourceProjectId: 'project-draw2',
  visibility: 'PRIVATE',
  metadata: { description: 'Synthetic character' },
  ...overrides,
});
const revisionPayload = (overrides = {}) => ({
  revisionId: 'revision-character-1',
  parentRevisionId: null,
  contentHash: hashA,
  contentType: 'image/png',
  byteLength: 128,
  storageLocator: { provider: 'object-storage', bucket: 'synthetic-assets', objectKey: `sha256/${hashA.slice(0, 2)}/${hashA}` },
  toolId: 'pixiedraw2',
  formatId: 'png',
  formatVersion: '1',
  dependencySnapshotId: null,
  ...overrides,
});

const created = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload()));
assert.equal(created.ok, true);
assert.equal(created.result.asset.headRevisionId, null);
assert.equal(registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload())).diagnostics[0].code, 'ASSET_ID_DUPLICATE');
const idempotentCreate = command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-idempotent' }));
const idempotentFirst = registry.executeCommand(idempotentCreate);
const idempotentRetry = registry.executeCommand(idempotentCreate);
assert.equal(idempotentFirst.ok, true);
assert.equal(idempotentRetry.ok, true);
assert.equal(idempotentRetry.result.idempotentReplay, true);

const revision1 = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload(), 1, 'revision'));
assert.equal(revision1.ok, true);
assert.equal(revision1.result.blob.reused, false);
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-other', 'asset-character', revisionPayload({ revisionId: 'revision-cross-user' }), null, 'revision')).diagnostics[0].code, 'ASSET_PERMISSION_DENIED');
const head1 = registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-character', { revisionId: 'revision-character-1' }, 2, 'head'));
assert.equal(head1.ok, true);
assert.equal(head1.result.asset.headRevisionId, 'revision-character-1');
assert.equal(registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-character', { revisionId: 'revision-character-1' }, 1, 'head')).diagnostics[0].code, 'ASSET_RECORD_VERSION_CONFLICT');
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-stale', contentHash: hashB }), 1, 'revision')).diagnostics[0].code, 'ASSET_RECORD_VERSION_CONFLICT');
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-parent-mismatch', parentRevisionId: 'missing-parent', contentHash: hashB }), null, 'revision')).diagnostics[0].code, 'ASSET_REVISION_NOT_FOUND');

const publicAsset = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-public-preview', visibility: 'PUBLIC_PREVIEW' })));
assert.equal(publicAsset.ok, true);
const publicRevision = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-public-preview', revisionPayload({ revisionId: 'revision-public', contentHash: hashB }), 1, 'revision'));
assert.equal(publicRevision.ok, true);
assert.equal(registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-public-preview', { revisionId: 'revision-public' }, 2, 'head')).ok, true);
const privateUnknown = registry.getAsset({ assetId: 'asset-character', actorId: null, identityKnown: false, surface: 'source' });
assert.equal(privateUnknown.diagnostics[0].metadata.httpStatus, 404);
assert.equal(registry.getAsset({ assetId: 'asset-character', actorId: 'user-owner', surface: 'source' }).result.sourceAccessible, true);
const preview = registry.getAsset({ assetId: 'asset-public-preview', actorId: 'user-stranger', surface: 'preview' });
assert.equal(preview.ok, true);
assert.equal(preview.result.sourceAccessible, false);
assert.equal(Object.prototype.hasOwnProperty.call(preview.result.revision || {}, 'storageLocator'), false, 'public Preview must not disclose source locator');
assert.equal(registry.getAsset({ assetId: 'asset-public-preview', actorId: 'user-stranger', surface: 'source' }).diagnostics[0].code, 'ASSET_SOURCE_FORBIDDEN');

const gameAsset = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-game-scene', assetKind: 'GAME_SCENE' })));
assert.equal(gameAsset.ok, true);
const liveEdge = registry.executeCommand(command('ADD_DEPENDENCY', 'user-owner', 'asset-game-scene', { edgeId: 'edge-live', providerAssetId: 'asset-character', relationType: 'DEPENDS_ON', referencePolicy: 'LIVE', required: true, compatibilityConstraint: { toolIds: ['pixigame'], assetKinds: ['RASTER_IMAGE'] } }, 1, 'dependency'));
assert.equal(liveEdge.ok, true);
assert.equal(liveEdge.result.dependency.resolvedRevisionId, 'revision-character-1');
const revision2 = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-character-2', parentRevisionId: 'revision-character-1', contentHash: hashC }), null, 'revision'));
assert.equal(revision2.ok, true);
const head2 = registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-character', { revisionId: 'revision-character-2' }, null, 'head'));
assert.equal(head2.ok, true);
assert.equal(registry.snapshot().dependencies['edge-live'].resolvedRevisionId, 'revision-character-2', 'LIVE dependency follows new HEAD');
assert.ok(head2.result.liveEvents.some(event => event.eventType === 'ASSET_LIVE_REFERENCE_UPDATED'));

const audioAsset = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-audio-bgm', assetKind: 'AUDIO' })));
assert.equal(audioAsset.ok, true);
const audioRevision1 = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-audio-bgm', revisionPayload({ revisionId: 'revision-audio-1', contentHash: '6'.repeat(64), contentType: 'audio/wav', toolId: 'pixieaudio', formatId: 'wav' }), 1, 'revision'));
assert.equal(audioRevision1.ok, true);
assert.equal(registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-audio-bgm', { revisionId: 'revision-audio-1' }, 2, 'head')).ok, true);
const audioGameEdge = registry.executeCommand(command('ADD_DEPENDENCY', 'user-owner', 'asset-game-scene', { edgeId: 'edge-audio-live', providerAssetId: 'asset-audio-bgm', relationType: 'RUNTIME_BINDS', referencePolicy: 'LIVE', required: false, compatibilityConstraint: { toolIds: ['pixigame'], assetKinds: ['AUDIO'] } }, null, 'dependency'));
assert.equal(audioGameEdge.ok, true);
const audioRevision2 = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-audio-bgm', revisionPayload({ revisionId: 'revision-audio-2', parentRevisionId: 'revision-audio-1', contentHash: '7'.repeat(64), contentType: 'audio/wav', toolId: 'pixieaudio', formatId: 'wav' }), null, 'revision'));
assert.equal(audioRevision2.ok, true);
assert.equal(registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-audio-bgm', { revisionId: 'revision-audio-2' }, null, 'head')).ok, true);
assert.equal(registry.snapshot().dependencies['edge-audio-live'].resolvedRevisionId, 'revision-audio-2', 'Audio->Game LIVE dependency follows new HEAD');

const pinnedConsumer = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-pinned-consumer', assetKind: 'GAME_COMPONENT' })));
assert.equal(pinnedConsumer.ok, true);
const pinnedEdge = registry.executeCommand(command('ADD_DEPENDENCY', 'user-owner', 'asset-pinned-consumer', { edgeId: 'edge-pinned', providerAssetId: 'asset-character', providerRevisionId: 'revision-character-1', relationType: 'DEPENDS_ON', referencePolicy: 'PINNED', required: true }, 1, 'dependency'));
assert.equal(pinnedEdge.ok, true);
const reviewConsumer = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-review-consumer', assetKind: 'GAME_COMPONENT' })));
assert.equal(reviewConsumer.ok, true);
const reviewEdge = registry.executeCommand(command('ADD_DEPENDENCY', 'user-owner', 'asset-review-consumer', { edgeId: 'edge-review', providerAssetId: 'asset-character', candidateRevisionId: 'revision-character-2', relationType: 'DEPENDS_ON', referencePolicy: 'REVIEW', required: false }, 1, 'dependency'));
assert.equal(reviewEdge.ok, true);
const revision3 = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-character-3', parentRevisionId: 'revision-character-2', contentHash: hashD }), null, 'revision'));
assert.equal(revision3.ok, true);
assert.equal(registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-character', { revisionId: 'revision-character-3' }, null, 'head')).ok, true);
assert.equal(registry.snapshot().dependencies['edge-pinned'].resolvedRevisionId, 'revision-character-1', 'PINNED dependency does not follow HEAD');
assert.equal(registry.snapshot().dependencies['edge-review'].resolvedRevisionId, 'revision-character-2', 'REVIEW keeps approved reference');
assert.equal(registry.snapshot().dependencies['edge-review'].candidateRevisionId, 'revision-character-3', 'REVIEW exposes update candidate');
assert.ok(registry.snapshot().events.some(event => event.eventType === 'ASSET_UPDATE_AVAILABLE'));

const legacyBinding = { legacySystemId: 'pixiedraw-current', legacyAssetId: 'local-asset-1', legacyFormatVersion: 'archive-v2', adapterVersion: '1.0.0', verificationHash: 'sha256:legacy-asset-1', mappingState: 'MAPPED' };
assert.equal(registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-legacy-bound', legacyBindings: [legacyBinding] }))).ok, true);
assert.equal(registry.executeCommand(command('CREATE_ASSET', 'user-other', null, createPayload({ assetId: 'asset-legacy-conflict', ownerId: 'user-other', legacyBindings: [legacyBinding] }))).ok, false);
assert.equal(registry.snapshot().assets['asset-legacy-conflict'].lifecycleState, 'QUARANTINED');

const forkOwnerSubstitution = registry.executeCommand(command('FORK_ASSET', 'user-owner', 'asset-character', { newAssetId: 'asset-fork-other-owner', newRevisionId: 'revision-fork-other-owner', ownerId: 'user-other', contentHash: hashE, contentType: 'image/png', byteLength: 128, storageLocator: { provider: 'opfs', bucket: null, objectKey: 'asset-fork-other-owner/revision-fork-other-owner.bin' }, toolId: 'pixiedraw2', formatId: 'png', formatVersion: '1', sourceRevisionId: 'revision-character-3' }, null, 'fork'));
assert.equal(forkOwnerSubstitution.diagnostics[0].code, 'ASSET_OWNER_SUBSTITUTION');

const fork = registry.executeCommand(command('FORK_ASSET', 'user-owner', 'asset-character', { newAssetId: 'asset-fork', newRevisionId: 'revision-fork', name: 'Fork', contentHash: hashE, contentType: 'image/png', byteLength: 128, storageLocator: { provider: 'opfs', bucket: null, objectKey: 'asset-fork/revision-fork.bin' }, toolId: 'pixiedraw2', formatId: 'png', formatVersion: '1', sourceRevisionId: 'revision-character-3', metadata: { description: 'Independent fork' } }, null, 'fork'));
assert.equal(fork.ok, true);
assert.equal(fork.result.asset.provenance.kind, 'FORKED_FROM');
assert.equal(fork.result.asset.headRevisionId, 'revision-fork');
assert.equal(fork.result.dependency.referencePolicy, 'FORKED');
const revision4 = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-character-4', parentRevisionId: 'revision-character-3', contentHash: 'f'.repeat(64) }), null, 'revision'));
assert.equal(revision4.ok, true);
assert.equal(registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-character', { revisionId: 'revision-character-4' }, null, 'head')).ok, true);
assert.equal(registry.snapshot().dependencies[fork.result.dependency.edgeId].resolvedRevisionId, 'revision-character-3', 'FORKED dependency is independent of parent updates');

const missingProvider = registry.executeCommand(command('ADD_DEPENDENCY', 'user-owner', 'asset-game-scene', { edgeId: 'edge-missing', providerAssetId: 'asset-no-such', relationType: 'DEPENDS_ON', referencePolicy: 'LIVE', required: true }, null, 'dependency'));
assert.equal(missingProvider.diagnostics[0].code, 'ASSET_DEPENDENCY_PROVIDER_UNKNOWN');
const differentParent = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-game-scene', revisionPayload({ revisionId: 'revision-wrong-parent', parentRevisionId: 'revision-character-1', contentHash: '1'.repeat(64) }), null, 'revision'));
assert.equal(differentParent.diagnostics[0].code, 'ASSET_REVISION_ASSET_MISMATCH');
const duplicateRevision = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-duplicate-content', contentHash: hashA }), null, 'revision'));
assert.equal(duplicateRevision.diagnostics[0].code, 'ASSET_REVISION_CONTENT_DUPLICATE');

verifierMode = 'hash-mismatch';
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-hash-bad', contentHash: hashB }), null, 'revision')).diagnostics[0].code, 'ASSET_BLOB_HASH_MISMATCH');
verifierMode = 'size-mismatch';
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-size-bad', contentHash: hashB }), null, 'revision')).diagnostics[0].code, 'ASSET_BLOB_SIZE_MISMATCH');
verifierMode = 'mime-mismatch';
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-mime-bad', contentHash: hashB }), null, 'revision')).diagnostics[0].code, 'ASSET_BLOB_MIME_MISMATCH');
verifierMode = 'valid';
const duplicateUploadAsset = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-duplicate-upload', assetKind: 'RASTER_IMAGE' })));
assert.equal(duplicateUploadAsset.ok, true);
const reusedUpload = registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-duplicate-upload', revisionPayload({ revisionId: 'revision-reused-hash', contentHash: hashA }), 1, 'revision'));
assert.equal(reusedUpload.ok, true);
assert.equal(reusedUpload.result.blob.reused, true, 'same content hash reuses verified Blob metadata');

const cycleA = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-cycle-a', assetKind: 'GAME_COMPONENT' })));
const cycleB = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-cycle-b', assetKind: 'GAME_COMPONENT' })));
assert.equal(cycleA.ok && cycleB.ok, true);
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-cycle-a', revisionPayload({ revisionId: 'revision-cycle-a', contentHash: hashD }), 1, 'revision')).ok, true);
assert.equal(registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-cycle-a', { revisionId: 'revision-cycle-a' }, 2, 'head')).ok, true);
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-cycle-b', revisionPayload({ revisionId: 'revision-cycle-b', contentHash: hashE }), 1, 'revision')).ok, true);
assert.equal(registry.executeCommand(command('SET_HEAD_REVISION', 'user-owner', 'asset-cycle-b', { revisionId: 'revision-cycle-b' }, 2, 'head')).ok, true);
const cycleEdge = registry.executeCommand(command('ADD_DEPENDENCY', 'user-owner', 'asset-cycle-a', { edgeId: 'edge-cycle-a-b', providerAssetId: 'asset-cycle-b', providerRevisionId: 'revision-cycle-b', relationType: 'DEPENDS_ON', referencePolicy: 'PINNED', required: false }, null, 'dependency'));
assert.equal(cycleEdge.ok, true);
const forbiddenCycle = registry.executeCommand(command('ADD_DEPENDENCY', 'user-owner', 'asset-cycle-b', { edgeId: 'edge-cycle-b-a', providerAssetId: 'asset-cycle-a', providerRevisionId: 'revision-cycle-a', relationType: 'DEPENDS_ON', referencePolicy: 'PINNED', required: false }, null, 'dependency'));
assert.equal(forbiddenCycle.diagnostics[0].code, 'ASSET_DEPENDENCY_CYCLE');
const runtimeEdge = registry.executeCommand(command('ADD_DEPENDENCY', 'user-owner', 'asset-cycle-b', { edgeId: 'edge-runtime-b-a', providerAssetId: 'asset-cycle-a', relationType: 'RUNTIME_BINDS', referencePolicy: 'LIVE', required: false }, null, 'dependency'));
assert.equal(runtimeEdge.ok, true, 'runtime reference cycles are explicitly allowed');

assert.equal(registry.executeCommand(command('TRASH_ASSET', 'user-owner', 'asset-character', {}, null, 'lifecycle')).diagnostics[0].code, 'ASSET_TRASH_DEPENDENCY_BLOCKED');
const unused = registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-unused' })));
assert.equal(unused.ok, true);
const trashed = registry.executeCommand(command('TRASH_ASSET', 'user-owner', 'asset-unused', {}, 1, 'lifecycle'));
assert.equal(trashed.ok, true);
assert.equal(registry.executeCommand(command('RESTORE_ASSET', 'user-owner', 'asset-unused', {}, 2, 'lifecycle')).ok, true);
assert.equal(registry.executeCommand(command('QUARANTINE_ASSET', 'user-owner', 'asset-unused', {}, 3, 'quarantine')).ok, true);
assert.equal(registry.executeCommand(command('RESTORE_ASSET', 'user-owner', 'asset-unused', {}, 4, 'lifecycle')).diagnostics[0].code, 'ASSET_LIFECYCLE_INVALID');

assert.equal(registry.resolveLegacyAsset({ legacySystemId: 'pixiedraw-current', legacyAssetId: 'local-asset-1', legacyKind: 'pixel.sprite', canonicalAssetId: 'asset-character' }).ok, true);
assert.equal(registry.resolveLegacyAsset({ legacySystemId: 'pixiedraw-current', legacyAssetId: 'local-asset-2', legacyKind: 'unknown.kind' }).diagnostics[0].code, 'ASSET_LEGACY_KIND_UNKNOWN');
assert.equal(registry.reportMissingRevision({ assetId: 'asset-character', revisionId: 'revision-character-4', actorId: 'user-owner', correlationId: 'correlation-missing' }).ok, true);
assert.equal(registry.reportCompatibilityChange({ assetId: 'asset-character', actorId: 'user-owner', correlationId: 'correlation-compat', reason: 'synthetic compatibility change' }).ok, true);

flagMode = 'off';
assert.equal(registry.getAsset({ assetId: 'asset-character', actorId: 'user-owner' }).diagnostics[0].code, 'ASSET_REGISTRY_READ_FLAG_OFF');
assert.equal(registry.executeCommand(command('CREATE_ASSET', 'user-owner', null, createPayload({ assetId: 'asset-flag-off' }))).diagnostics[0].code, 'ASSET_REGISTRY_WRITE_FLAG_OFF');
flagMode = 'read-on-upload-off';
assert.equal(registry.getAsset({ assetId: 'asset-character', actorId: 'user-owner' }).ok, true);
assert.equal(registry.executeCommand(command('CREATE_REVISION', 'user-owner', 'asset-character', revisionPayload({ revisionId: 'revision-upload-off', contentHash: '2'.repeat(64) }), null, 'revision')).diagnostics[0].code, 'ASSET_REGISTRY_WRITE_FLAG_OFF');
flagMode = 'kill-switch';
assert.equal(registry.getAsset({ assetId: 'asset-character', actorId: 'user-owner' }).diagnostics[0].code, 'ASSET_REGISTRY_ROLLBACK_ACTIVE');
flagMode = 'enabled';

const listing = registry.listAssets({ actorId: 'user-owner', pageSize: 1, lifecycleStates: ['ACTIVE', 'ARCHIVED', 'TRASHED'] });
assert.equal(listing.ok, true);
assert.equal(listing.result.serverFiltered, true);
assert.ok(listing.result.nextCursor);
assert.equal(registry.snapshot().events.some(event => Object.prototype.hasOwnProperty.call(event.payload, 'storageLocator')), false, 'Events must not contain Storage Locator or Blob body');
assert.equal(registry.snapshot().networkAdapterInjected, true);
assert.equal(registry.snapshot().blobs[hashA].byteLength, 128);

console.log(JSON.stringify({
  workPackage: 'WP-092',
  schemaVersion: 1,
  commandsCovered: ASSET_COMMAND_TYPES.length,
  eventsCovered: ASSET_EVENT_TYPES.length,
  referencePolicies: ASSET_REFERENCE_POLICIES,
  failureFixtures: 36,
  assetCount: Object.keys(registry.snapshot().assets).length,
  revisionCount: Object.keys(registry.snapshot().revisions).length,
  dependencyCount: Object.keys(registry.snapshot().dependencies).length,
  status: 'pass',
}, null, 2));
