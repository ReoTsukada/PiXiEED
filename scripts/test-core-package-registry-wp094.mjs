#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PACKAGE_EVENT_TYPES,
  PACKAGE_FLAGS,
  PACKAGE_KINDS,
  PACKAGE_LIFECYCLE_STATES,
  PACKAGE_MATERIALIZATION_MODES,
  PACKAGE_REFERENCE_POLICIES,
  PACKAGE_REGISTRY_CONTRACT,
  PACKAGE_STORAGE_BOUNDARY,
  PACKAGE_STREAMING_CONTRACT,
  createPackageRegistry,
  validatePackageCommand,
  validatePackageRecord,
} from '../core-shell/assets/core-package-registry-contracts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = path.join(root, 'core-shell/assets/core-package-registry-contracts.js');
const moduleSource = fs.readFileSync(modulePath, 'utf8');
const fixtureDocument = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/fixtures/package-registry-v1.valid.json'), 'utf8'));
const fixture = fixtureDocument;
const schema = JSON.parse(fs.readFileSync(path.join(root, 'core-shell/schemas/package-registry-v1.schema.json'), 'utf8'));

const HASH = value => crypto.createHash('sha256').update(value).digest('hex');
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
};
const clone = value => structuredClone(value);
const hashForManifest = value => HASH(JSON.stringify(canonicalize(value)));
const allow = capability => ({ ok: true, decision: 'allow', source: 'server', capability, correlationId: 'correlation-package-1' });
const enabled = ({ flagId, action }) => ({ flagId, action, enabled: true, decision: 'enabled', serverAuthorized: true });
const failureFixtureNames = [];

assert.equal(PACKAGE_REGISTRY_CONTRACT.schemaVersion, 1);
assert.deepEqual(PACKAGE_KINDS, [
  'PROJECT_PACKAGE', 'MATERIAL_PACKAGE', 'FINISHED_PRODUCT_PACKAGE', 'GAME_PACKAGE', 'AUDIO_PACKAGE',
  'DRAW_PACKAGE', 'BACKUP_PACKAGE', 'EXPORT_PACKAGE', 'TEMPLATE_PACKAGE',
]);
assert.deepEqual(PACKAGE_MATERIALIZATION_MODES, ['THIN', 'PORTABLE']);
assert.deepEqual(PACKAGE_LIFECYCLE_STATES, ['BUILDING', 'VERIFYING', 'READY', 'FAILED', 'QUARANTINED', 'ARCHIVED']);
assert.deepEqual(PACKAGE_REFERENCE_POLICIES, ['LIVE', 'PINNED', 'REVIEW', 'FORKED']);
assert.deepEqual(PACKAGE_EVENT_TYPES, [
  'PACKAGE_BUILD_STARTED', 'PACKAGE_MATERIALIZED', 'PACKAGE_VERIFIED', 'PACKAGE_FAILED',
  'PACKAGE_QUARANTINED', 'PACKAGE_ARCHIVED',
]);
assert.deepEqual(PACKAGE_FLAGS, {
  read: 'package-registry-read',
  write: 'package-registry-write',
  materialize: 'package-materialize',
  portable: 'package-portable',
  legacyPxd: 'package-legacy-pxd',
  storageUpload: 'package-storage-upload',
});
assert.equal(PACKAGE_STREAMING_CONTRACT.mainThreadWholePackageBuffer, false);
assert.ok(PACKAGE_STORAGE_BOUNDARY.excludedFromRegistry.includes('raw-pixel-blob'));
assert.equal(schema.$defs.command.properties.schemaVersion.const, 1);
assert.equal(schema.$defs.manifest.properties.schemaVersion.const, 1);
assert.equal(schema.$defs.packageRecord.properties.schemaVersion.const, 1);
assert.equal(schema.$defs.packageRecord.additionalProperties, false);
assert.ok(schema.$defs.command.required.includes('permissionDecision'));
assert.equal(validatePackageCommand(fixture).valid, true);
assert.equal(validatePackageCommand({ ...fixture, packageKind: 'UNKNOWN_KIND' }).valid, false);
assert.equal(validatePackageCommand({ ...fixture, unexpectedRawBlob: 'not-allowed' }).diagnostics[0].code, 'PACKAGE_UNKNOWN_FIELD');
assert.equal(validatePackageCommand({ ...fixture, metadata: { rawBytes: 'not-allowed' } }).diagnostics[0].code, 'PACKAGE_FORBIDDEN_DATA');
assert.equal(validatePackageCommand({ ...fixture, metadata: { preview: 'data:image/png;base64,AAAA' } }).diagnostics[0].code, 'PACKAGE_BLOB_PAYLOAD_FORBIDDEN');
assert.equal(validatePackageCommand({ ...fixture, metadata: { external: 'https://example.invalid/private' } }).valid, true, 'external URL values are metadata until a Locator boundary');
for (const forbiddenKey of ['price', 'purchase', 'entitlement', 'royalty', 'payout', 'commission']) {
  assert.equal(validatePackageCommand({ ...fixture, metadata: { [forbiddenKey]: 'not-allowed' } }).diagnostics[0].code, 'PACKAGE_FORBIDDEN_DATA');
}
assert.equal(validatePackageCommand({ ...fixture, permissionDecision: { ok: true, decision: 'allow', source: 'client' } }).diagnostics[0].code, 'PACKAGE_PERMISSION_SOURCE_INVALID');
assert.doesNotMatch(moduleSource, /\b(?:document|window|indexedDB|localStorage|fetch|BroadcastChannel)\b/u, 'Package Registry must not access browser or network globals');
for (const forbiddenToken of ['HTMLCanvasElement', 'OffscreenCanvas', 'CanvasRenderingContext2D', 'ArrayBuffer', 'Uint8Array']) {
  assert.equal(moduleSource.includes(forbiddenToken), false, `Package Registry must not depend on ${forbiddenToken}`);
}

const createHarness = ({ flagDecision = enabled, permissionDecision = allow('package.materialize'), graphOverride = null, verifierMode = 'valid', assemblyMode = 'valid', dependencyMode = 'valid' } = {}) => {
  let sequence = 0;
  let graph = clone(graphOverride || fixture.dependencySnapshot);
  const assemblerCalls = [];
  const verifierCalls = [];
  const featureFlagEvaluator = input => flagDecision(input);
  const registry = createPackageRegistry({
    clock: () => '2026-08-07T00:00:00.000Z',
    idGenerator: prefix => `${prefix}-${++sequence}`,
    featureFlagEvaluator,
    permissionEvaluator: ({ action }) => typeof permissionDecision === 'function' ? permissionDecision(action) : permissionDecision,
    graphResolver: () => clone(graph),
    blobVerifier: ({ asset }) => {
      verifierCalls.push(clone(asset));
      if (verifierMode === 'hash-mismatch') return { verified: true, contentHash: 'f'.repeat(64), byteLength: asset.byteLength, contentType: asset.contentType };
      if (verifierMode === 'size-mismatch') return { verified: true, contentHash: asset.contentHash, byteLength: asset.byteLength + 1, contentType: asset.contentType };
      if (verifierMode === 'mime-mismatch') return { verified: true, contentHash: asset.contentHash, byteLength: asset.byteLength, contentType: 'text/html' };
      if (verifierMode === 'missing') return { verified: false, code: 'PACKAGE_BLOB_MISSING' };
      return { verified: true, contentHash: asset.contentHash, byteLength: asset.byteLength, contentType: asset.contentType };
    },
    manifestHasher: hashForManifest,
    packageAssembler: input => {
      assemblerCalls.push(clone(input));
      if (assemblyMode === 'raw-body') return { rawBytes: 'forbidden', contentHash: 'e'.repeat(64), manifestHash: 'e'.repeat(64), byteLength: 1, uncompressedByteLength: 1, fileCount: 1, storageLocator: { provider: 'object-storage', bucket: 'packages', objectKey: 'invalid' }, verified: true };
      if (assemblyMode === 'crash') throw Object.assign(new Error('synthetic assembler crash'), { code: 'PACKAGE_ASSEMBLY_CRASH' });
      if (assemblyMode === 'upload-failure') throw Object.assign(new Error('synthetic storage upload failure'), { code: 'PACKAGE_STORAGE_UPLOAD_FAILED' });
      const canonicalManifest = clone(input.manifest);
      canonicalManifest.hash = null;
      canonicalManifest.size = null;
      const manifestHash = hashForManifest(canonicalManifest);
      const contentHash = HASH(JSON.stringify({ manifestHash, mode: input.mode, assets: input.entries.map(entry => [entry.assetId, entry.revisionId, entry.contentHash]) }));
      return {
        contentHash,
        byteLength: 2048,
        uncompressedByteLength: assemblyMode === 'decompression-bomb' ? 1024 * 1024 * 1024 + 1 : 32768,
        fileCount: assemblyMode === 'file-count' ? 10001 : input.entries.length + 5,
        storageLocator: { provider: 'object-storage', bucket: 'packages', objectKey: assemblyMode === 'unsafe-locator' ? '../escape' : (assemblyMode === 'external-url' ? 'https://example.invalid/package.zip' : `sha256/${contentHash.slice(0, 2)}/${contentHash}`) },
        manifestHash: assemblyMode === 'tamper-manifest' ? 'f'.repeat(64) : manifestHash,
        verified: true,
        deduplicatedContentHashes: input.deduplicatedContentHashes,
      };
    },
    packageDependencyResolver: ({ packageId, packageVersion }) => dependencyMode === 'missing' ? { ok: false, code: 'PACKAGE_DEPENDENCY_MISSING' } : ({ ok: true, packageId, packageVersion, contentHash: 'a'.repeat(64), dependencies: [] }),
  });
  return {
    registry,
    assemblerCalls,
    verifierCalls,
    setGraph: nextGraph => { graph = clone(nextGraph); },
  };
};

const off = createHarness({ flagDecision: input => ({ ...input, enabled: false, decision: 'fallback', code: 'DEFAULT_OFF' }) });
const offResult = off.registry.materializePackage({ command: fixture, permissionDecision: fixture.permissionDecision });
assert.equal(offResult.ok, false);
assert.equal(offResult.diagnostics[0].code, 'PACKAGE_FLAG_OFF');
assert.deepEqual(off.registry.snapshot().packages, {});
assert.deepEqual(off.registry.snapshot().attempts, {});

const happy = createHarness();
const first = happy.registry.materializePackage({ command: fixture, permissionDecision: fixture.permissionDecision });
assert.equal(first.ok, true, JSON.stringify(first));
assert.equal(first.package.lifecycleState, 'READY');
assert.equal(first.package.materializationMode, 'PORTABLE');
assert.equal(first.package.packageKind, 'GAME_PACKAGE');
assert.equal(first.package.manifest.includedAssetRevisions.length, 7);
assert.ok(first.package.manifest.includedAssetRevisions.some(entry => entry.assetKind === 'RASTER_IMAGE'));
assert.ok(first.package.manifest.includedAssetRevisions.some(entry => entry.assetKind === 'AUDIO'));
assert.ok(first.package.manifest.includedAssetRevisions.some(entry => entry.assetKind === 'SOUND_EFFECT'));
assert.ok(first.package.manifest.includedAssetRevisions.some(entry => entry.assetKind === 'SCRIPT' && entry.sandboxRequired));
assert.equal(first.package.manifest.dependencyLock.length, 7);
assert.equal(first.package.manifest.dependencyGraphSnapshot.edges.every(edge => edge.lockPolicy === 'PINNED'), true);
assert.equal(validatePackageRecord(first.package).valid, true);
assert.equal(validatePackageRecord({ ...clone(first.package), blob: 'forbidden' }).diagnostics[0].code, 'PACKAGE_UNKNOWN_FIELD');
assert.equal(happy.assemblerCalls.length, 1);
assert.equal(Object.prototype.hasOwnProperty.call(happy.assemblerCalls[0], 'rawBytes'), false);
assert.equal(Object.prototype.hasOwnProperty.call(happy.assemblerCalls[0], 'packageBytes'), false);
assert.equal(first.package.manifest.streaming.mainThreadWholePackageBuffer, false);
assert.equal(happy.registry.snapshot().events.filter(event => event.eventType === 'PACKAGE_BUILD_STARTED').length, 1);
assert.equal(happy.registry.snapshot().events.filter(event => event.eventType === 'PACKAGE_MATERIALIZED').length, 1);
assert.equal(happy.registry.snapshot().events.filter(event => event.eventType === 'PACKAGE_VERIFIED').length, 1);
assert.equal(happy.registry.snapshot().events.every(event => JSON.stringify(event).includes('base64') === false), true);
assert.equal(happy.registry.snapshot().events.every(event => JSON.stringify(event).includes('package-body') === false), true);

const replay = happy.registry.materializePackage({ command: fixture, permissionDecision: fixture.permissionDecision });
assert.equal(replay.ok, true);
assert.equal(replay.idempotentReplay, true);
assert.equal(happy.assemblerCalls.length, 1);
failureFixtureNames.push('duplicate-materialize');
const duplicateMaterialize = happy.registry.materializePackage({ command: { ...clone(fixture), idempotencyKey: 'idempotency-duplicate-materialize' }, permissionDecision: fixture.permissionDecision });
assert.equal(duplicateMaterialize.diagnostics[0].code, 'PACKAGE_DUPLICATE');
const conflict = happy.registry.materializePackage({ command: { ...fixture, metadata: { changed: true } }, permissionDecision: fixture.permissionDecision });
assert.equal(conflict.ok, false);
assert.equal(conflict.diagnostics[0].code, 'PACKAGE_IDEMPOTENCY_CONFLICT');

const thinCommand = {
  ...clone(fixture),
  packageId: 'package-project-thin',
  packageKind: 'PROJECT_PACKAGE',
  packageVersion: '1.0.0',
  materializationMode: 'THIN',
  correlationId: 'correlation-package-thin',
  idempotencyKey: 'idempotency-package-thin',
};
const thin = happy.registry.materializePackage({ command: thinCommand, permissionDecision: fixture.permissionDecision });
assert.equal(thin.ok, true, JSON.stringify(thin));
assert.equal(thin.package.materializationMode, 'THIN');
assert.equal(thin.package.manifest.materializationMode, 'THIN');

const updatedGraph = clone(fixture.dependencySnapshot);
updatedGraph.assets[0].revisionId = 'revision-character-draw-2';
updatedGraph.assets[0].contentHash = '8888888888888888888888888888888888888888888888888888888888888888';
updatedGraph.assets[0].storageHandleRef = 'handle:character-draw-2';
const updatedCommand = {
  ...clone(fixture),
  packageVersion: '1.1.0',
  correlationId: 'correlation-package-2',
  idempotencyKey: 'idempotency-package-2',
};
happy.setGraph(updatedGraph);
const updated = happy.registry.materializePackage({ command: updatedCommand, permissionDecision: fixture.permissionDecision });
assert.equal(updated.ok, true, JSON.stringify(updated));
assert.notEqual(updated.package.contentHash, first.package.contentHash);
assert.equal(happy.registry.getPackage({ packageId: first.package.packageId, packageVersion: first.package.packageVersion, actorId: fixture.actorId, permissionDecision: fixture.permissionDecision }).package.contentHash, first.package.contentHash);
assert.ok(updated.materialization.deduplicatedContentHashes.length >= 6);
assert.equal(happy.registry.toMarketReference({ packageId: updated.package.packageId, packageVersion: updated.package.packageVersion, actorId: fixture.actorId, permissionDecision: fixture.permissionDecision }).ok, true);
const marketReference = happy.registry.toMarketReference({ packageId: updated.package.packageId, packageVersion: updated.package.packageVersion, actorId: fixture.actorId, permissionDecision: fixture.permissionDecision }).marketReference;
for (const forbidden of ['price', 'purchase', 'entitlement', 'royalty', 'payout', 'commission']) assert.equal(Object.prototype.hasOwnProperty.call(marketReference, forbidden), false);
assert.equal(happy.registry.getPackage({ packageId: updated.package.packageId, packageVersion: updated.package.packageVersion, actorId: fixture.actorId, permissionDecision: { ok: true, decision: 'allow', source: 'client' } }).diagnostics[0].code, 'PACKAGE_PERMISSION_DENIED');

const archived = happy.registry.archivePackage({ packageId: first.package.packageId, packageVersion: first.package.packageVersion, actorId: fixture.actorId, expectedRecordVersion: 1, permissionDecision: fixture.permissionDecision, correlationId: 'correlation-archive', createdAt: fixture.createdAt });
assert.equal(archived.ok, true);
assert.equal(archived.package.lifecycleState, 'ARCHIVED');
assert.ok(happy.registry.snapshot().events.some(event => event.eventType === 'PACKAGE_ARCHIVED'));

const assertFailure = ({ name, command = fixture, graph = fixture.dependencySnapshot, verifierMode = 'valid', assemblyMode = 'valid', dependencyMode = 'valid', permission = allow('package.materialize'), cancellationAdapter = undefined, flagDecision = enabled, expectedCode, expectedAttemptStatus = 'FAILED' }) => {
  failureFixtureNames.push(name);
  const harness = createHarness({ graphOverride: graph, verifierMode, assemblyMode, dependencyMode, permissionDecision: permission, flagDecision });
  const result = harness.registry.materializePackage({ command: { ...clone(command), packageId: `package-${name}`, idempotencyKey: `idempotency-${name}`, correlationId: `correlation-${name}` }, permissionDecision: permission, cancellationAdapter });
  assert.equal(result.ok, false, `${name} unexpectedly succeeded`);
  assert.equal(result.diagnostics[0].code, expectedCode, `${name}: ${JSON.stringify(result)}`);
  const attempts = Object.values(harness.registry.snapshot().attempts);
  if (attempts.length) assert.equal(attempts[0].status, expectedAttemptStatus, name);
  assert.deepEqual(harness.registry.snapshot().packages, {}, `${name} committed a failed Package`);
  return { result, harness };
};

assertFailure({
  name: 'permission-denied',
  permission: () => ({ ok: false, decision: 'deny', source: 'server', capability: 'package.materialize' }),
  expectedCode: 'PACKAGE_PERMISSION_DENIED',
});
const cycleGraph = clone(fixture.dependencySnapshot);
cycleGraph.edges.push({ ...cycleGraph.edges[0], edgeId: 'edge-cycle', consumerAssetId: cycleGraph.edges[0].providerAssetId, providerAssetId: cycleGraph.rootAsset.assetId, providerRevisionId: cycleGraph.rootAsset.revisionId });
assertFailure({ name: 'dependency-cycle', graph: cycleGraph, expectedCode: 'PACKAGE_DEPENDENCY_CYCLE' });
const missingAssetGraph = clone(fixture.dependencySnapshot);
missingAssetGraph.assets.shift();
assertFailure({ name: 'missing-required-asset', graph: missingAssetGraph, expectedCode: 'PACKAGE_DEPENDENCY_ASSET_UNKNOWN' });
const missingRevisionGraph = clone(fixture.dependencySnapshot);
missingRevisionGraph.assets[0].revisionId = null;
assertFailure({ name: 'missing-required-revision', graph: missingRevisionGraph, expectedCode: 'PACKAGE_VALUE_INVALID' });
const unauthorizedAssetGraph = clone(fixture.dependencySnapshot);
unauthorizedAssetGraph.assets[0].assetAccess = false;
assertFailure({ name: 'unauthorized-asset', graph: unauthorizedAssetGraph, expectedCode: 'PACKAGE_ASSET_PERMISSION_DENIED' });
const unauthorizedPortableGraph = clone(fixture.dependencySnapshot);
unauthorizedPortableGraph.assets[0].portableAllowed = false;
assertFailure({ name: 'portable-unauthorized', graph: unauthorizedPortableGraph, expectedCode: 'PACKAGE_PORTABLE_PERMISSION_REQUIRED' });
assertFailure({ name: 'blob-hash-mismatch', verifierMode: 'hash-mismatch', expectedCode: 'PACKAGE_HASH_MISMATCH' });
assertFailure({ name: 'blob-size-mismatch', verifierMode: 'size-mismatch', expectedCode: 'PACKAGE_SIZE_MISMATCH' });
assertFailure({ name: 'blob-mime-mismatch', verifierMode: 'mime-mismatch', expectedCode: 'PACKAGE_MIME_MISMATCH' });
assertFailure({ name: 'blob-missing', verifierMode: 'missing', expectedCode: 'PACKAGE_BLOB_MISSING' });
assertFailure({ name: 'manifest-tamper', assemblyMode: 'tamper-manifest', expectedCode: 'PACKAGE_MANIFEST_TAMPERED', expectedAttemptStatus: 'QUARANTINED' });
assertFailure({ name: 'unsafe-locator', assemblyMode: 'unsafe-locator', expectedCode: 'PACKAGE_PATH_UNSAFE' });
assertFailure({ name: 'external-url-locator', assemblyMode: 'external-url', expectedCode: 'PACKAGE_PATH_UNSAFE' });
assertFailure({ name: 'excessive-file-count', assemblyMode: 'file-count', expectedCode: 'PACKAGE_FILE_COUNT_EXCEEDED' });
assertFailure({ name: 'decompression-bomb', assemblyMode: 'decompression-bomb', expectedCode: 'PACKAGE_UNCOMPRESSED_SIZE_EXCEEDED' });
assertFailure({ name: 'raw-assembly', assemblyMode: 'raw-body', expectedCode: 'PACKAGE_ASSEMBLY_BLOB_FORBIDDEN' });
assertFailure({ name: 'cancelled', cancellationAdapter: ({ phase }) => phase === 'before-commit', expectedCode: 'PACKAGE_CANCELLED' });
assertFailure({ name: 'crash-before-commit', assemblyMode: 'crash', expectedCode: 'PACKAGE_ASSEMBLY_CRASH' });
assertFailure({ name: 'storage-upload-failure', assemblyMode: 'upload-failure', expectedCode: 'PACKAGE_STORAGE_UPLOAD_FAILED' });
const activeContentGraph = clone(fixture.dependencySnapshot);
activeContentGraph.rootAsset.contentType = 'text/html';
assertFailure({ name: 'active-content', graph: activeContentGraph, expectedCode: 'PACKAGE_ACTIVE_CONTENT_FORBIDDEN', expectedAttemptStatus: 'QUARANTINED' });
const nestedUnauthorized = {
  ...clone(fixture),
  packageDependencies: [{ packageId: 'package-private-dependency', packageVersion: '1.0.0', contentHash: 'a'.repeat(64), required: true, accessGranted: false, dependencies: [] }],
};
assertFailure({ name: 'nested-unauthorized', command: nestedUnauthorized, expectedCode: 'PACKAGE_DEPENDENCY_UNAUTHORIZED' });
const nestedDependency = { packageId: 'package-nested-0', packageVersion: '1.0.0', contentHash: 'a'.repeat(64), required: true, accessGranted: true, dependencies: [] };
let nestedCursor = nestedDependency;
for (let index = 1; index <= 10; index += 1) {
  nestedCursor.dependencies = [{ packageId: `package-nested-${index}`, packageVersion: '1.0.0', contentHash: 'a'.repeat(64), required: true, accessGranted: true, dependencies: [] }];
  nestedCursor = nestedCursor.dependencies[0];
}
assertFailure({ name: 'nested-recursion', command: { ...clone(fixture), packageDependencies: [nestedDependency] }, expectedCode: 'PACKAGE_NESTED_RECURSION' });
assertFailure({ name: 'thin-dependency-missing', command: { ...clone(fixture), materializationMode: 'THIN', packageDependencies: [{ packageId: 'package-required-missing', packageVersion: '1.0.0', contentHash: 'a'.repeat(64), required: true, accessGranted: true, dependencies: [] }] }, dependencyMode: 'missing', expectedCode: 'PACKAGE_DEPENDENCY_MISSING' });
const trashedGraph = clone(fixture.dependencySnapshot);
trashedGraph.assets[0].assetState = 'TRASHED';
assertFailure({ name: 'trashed-dependency', graph: trashedGraph, expectedCode: 'PACKAGE_DEPENDENCY_TRASHED' });
const quarantinedGraph = clone(fixture.dependencySnapshot);
quarantinedGraph.assets[0].assetState = 'QUARANTINED';
assertFailure({ name: 'quarantined-dependency', graph: quarantinedGraph, expectedCode: 'PACKAGE_DEPENDENCY_QUARANTINED' });
assertFailure({ name: 'upload-off', flagDecision: input => input.flagId === PACKAGE_FLAGS.storageUpload ? { ...input, enabled: false, decision: 'fallback', code: 'UPLOAD_OFF' } : enabled(input), expectedCode: 'PACKAGE_FLAG_OFF' });
assertFailure({ name: 'kill-switch', flagDecision: input => ({ ...input, enabled: false, decision: 'fallback', code: 'FEATURE_FLAG_KILL_SWITCH' }), expectedCode: 'PACKAGE_KILL_SWITCH' });
assertFailure({ name: 'legacy-pxd-flag-off', command: { ...clone(fixture), legacyPxd: true }, flagDecision: input => input.flagId === PACKAGE_FLAGS.legacyPxd ? { ...input, enabled: false, decision: 'fallback' } : enabled(input), expectedCode: 'PACKAGE_FLAG_OFF' });

const archivedReadDenied = happy.registry.getPackage({ packageId: first.package.packageId, packageVersion: first.package.packageVersion, actorId: fixture.actorId, permissionDecision: null });
assert.equal(archivedReadDenied.diagnostics[0].code, 'PACKAGE_PERMISSION_DENIED');
const readOn = happy.registry.getPackage({ packageId: updated.package.packageId, packageVersion: updated.package.packageVersion, actorId: fixture.actorId, permissionDecision: fixture.permissionDecision });
assert.equal(readOn.ok, true, 'Read remains available while the separate upload flag is tested OFF');

console.log(JSON.stringify({
  workPackage: 'WP-094',
  packageKinds: PACKAGE_KINDS.length,
  materializationModes: PACKAGE_MATERIALIZATION_MODES.length,
  lifecycleStates: PACKAGE_LIFECYCLE_STATES.length,
  referencePolicies: PACKAGE_REFERENCE_POLICIES.length,
  eventTypes: PACKAGE_EVENT_TYPES.length,
  assetFixtureEntries: fixture.dependencySnapshot.assets.length + 1,
  successfulPackages: Object.values(happy.registry.snapshot().packages).length,
  failureFixtures: failureFixtureNames.length,
  failureFixtureNames,
  events: happy.registry.snapshot().events.length,
  streamingWorkerReady: PACKAGE_STREAMING_CONTRACT.workerReady,
  rawBlobPayloadsTransferred: 0,
  status: 'pass',
}, null, 2));
