import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  createProjectCommand,
  createProjectRegistry,
} from '../core-shell/assets/core-project-registry-contracts.js';
import {
  createAssetCommand,
  createAssetRegistry,
} from '../core-shell/assets/core-asset-registry-contracts.js';
import {
  createPackageRegistry,
} from '../core-shell/assets/core-package-registry-contracts.js';
import {
  createSearchIndexCore,
} from '../core-shell/assets/core-search-index-contracts.js';
import {
  createBridgeRequest,
  createToolBridge,
} from '../core-shell/assets/core-tool-bridge-contracts.js';
import { AUTHORIZATION_PROOF_POLICY_VERSION, normalizeAuthorizationProof } from '../core-shell/assets/core-authorization-proof-contracts.js';

const futureIssuedAt = '2099-08-09T00:00:00.000Z';
const futureExpiresAt = '2099-08-09T00:05:00.000Z';
let proofSequence = 0;

function proof({ principalId = 'user-owner', resourceType, resourceId, action, capability = action, correlationId = null, tenantId = 'tenant-1', decision = 'allow' }) {
  return normalizeAuthorizationProof({
    schemaVersion: 1,
    proofType: 'AUTHORIZATION_PROOF',
    source: 'server',
    decision,
    authorityId: 'fp001-test-authority',
    proofId: `fp001-proof-${++proofSequence}`,
    principalId,
    resourceType,
    resourceId,
    action,
    capability,
    tenantId,
    correlationId,
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: decision === 'allow' ? 'grant-fp001' : null,
    issuedAt: futureIssuedAt,
    expiresAt: futureExpiresAt,
  });
}

function serverEvaluator(input) {
  const allowed = input.principalId === 'user-owner' && input.tenantId === 'tenant-1';
  return proof({ ...input, decision: allowed ? 'allow' : 'deny', correlationId: input.correlationId ?? null });
}

const enabledFlags = ({ flagId, action }) => ({ flagId, action, enabled: true, decision: 'enabled', serverAuthorized: true, source: 'server' });
const clock = () => futureIssuedAt;
let idSequence = 0;
const idGenerator = (prefix) => `${prefix}-fp001-${++idSequence}`;
const adapters = { clock, idGenerator, network: { request: () => { throw new Error('network must remain outside isolated Core'); } } };

function expectDenied(name, callback) {
  try {
    const result = callback();
    assert.equal(result?.ok, false, name);
  } catch (error) {
    assert.match(`${error.code || ''} ${error.message || ''}`, name);
  }
}

// 1. Project Registry: creation and update require a Proof bound to the target Project and action.
const projectRegistry = createProjectRegistry({
  adapters,
  featureFlagEvaluator: enabledFlags,
  permissionEvaluator: serverEvaluator,
});
const projectPayload = {
  projectId: 'project-fp001', projectKind: 'DRAW2', toolId: 'pixiedraw2', formatId: 'pxd', formatVersion: 'archive-v2',
  ownerType: 'USER', ownerId: 'user-owner', name: 'FP001 Project', visibility: 'PRIVATE', rootAssetId: 'asset-fp001',
};
const projectCreateProof = proof({ resourceType: 'PROJECT', resourceId: 'project-fp001', action: 'create', correlationId: 'correlation-project-create' });
assert.equal(projectRegistry.executeProjectCommand(createProjectCommand({ commandType: 'CREATE_PROJECT', actorId: 'user-owner', correlationId: 'correlation-project-create', idempotencyKey: 'idempotency-project-create', payload: projectPayload, permissionDecision: projectCreateProof, adapters })).ok, true);
const fakeProjectProof = { ...projectCreateProof, resourceId: 'project-other' };
const fakeProjectCommand = createProjectCommand({ commandType: 'RENAME_PROJECT', projectId: 'project-fp001', actorId: 'user-owner', correlationId: 'correlation-project-update', idempotencyKey: 'idempotency-project-update', payload: { name: 'spoof' }, permissionDecision: { ...fakeProjectProof, action: 'update', capability: 'update', correlationId: 'correlation-project-update' }, adapters });
expectDenied(/bound|mismatch/, () => projectRegistry.executeProjectCommand(fakeProjectCommand));
const projectUpdate = (permissionDecision, suffix) => createProjectCommand({ commandType: 'RENAME_PROJECT', projectId: 'project-fp001', actorId: 'user-owner', correlationId: `correlation-project-${suffix}`, idempotencyKey: `idempotency-project-${suffix}`, payload: { name: `spoof-${suffix}` }, permissionDecision, adapters });
expectDenied(/bound|mismatch|denied|expired/, () => projectRegistry.executeProjectCommand(projectUpdate({ ...projectCreateProof, principalId: 'user-other', action: 'update', capability: 'update', correlationId: 'correlation-project-principal' }, 'principal')));
expectDenied(/bound|mismatch|denied|expired/, () => projectRegistry.executeProjectCommand(projectUpdate({ ...projectCreateProof, tenantId: 'tenant-other', action: 'update', capability: 'update', correlationId: 'correlation-project-tenant' }, 'tenant')));
expectDenied(/bound|mismatch|denied|expired/, () => projectRegistry.executeProjectCommand(projectUpdate({ ...projectCreateProof, policyVersion: 'unknown-policy-v99', action: 'update', capability: 'update', correlationId: 'correlation-project-policy' }, 'policy')));
expectDenied(/bound|mismatch|denied|expired/, () => projectRegistry.executeProjectCommand(projectUpdate({ ...projectCreateProof, issuedAt: '2000-01-01T00:00:00.000Z', expiresAt: '2000-01-01T00:05:00.000Z', action: 'update', capability: 'update', correlationId: 'correlation-project-expired' }, 'expired')));
expectDenied(/capability|bound|mismatch|denied/, () => projectRegistry.executeProjectCommand(projectUpdate({ ...projectCreateProof, action: 'wrong', capability: 'wrong', correlationId: 'correlation-project-capability' }, 'capability')));

// 2. Asset Registry: an owner-shaped caller cannot reuse a Proof from another Asset.
const assetRegistry = createAssetRegistry({
  adapters,
  featureFlagEvaluator: enabledFlags,
  permissionEvaluator: serverEvaluator,
  blobVerifier: ({ contentHash, byteLength, contentType }) => ({ ok: true, computedHash: contentHash, computedByteLength: byteLength, detectedContentType: contentType }),
});
const assetCreateProof = proof({ resourceType: 'ASSET', resourceId: 'asset-fp001', action: 'create', correlationId: 'correlation-asset-create' });
assert.equal(assetRegistry.executeCommand(createAssetCommand({ commandType: 'CREATE_ASSET', assetId: 'asset-fp001', actorId: 'user-owner', correlationId: 'correlation-asset-create', idempotencyKey: 'idempotency-asset-create', payload: { assetId: 'asset-fp001', assetKind: 'RASTER_IMAGE', ownerType: 'USER', ownerId: 'user-owner', sourceProjectId: 'project-fp001', visibility: 'PRIVATE', metadata: {} }, permissionDecision: assetCreateProof, adapters })).ok, true);
const fakeAssetCommand = createAssetCommand({ commandType: 'CREATE_REVISION', assetId: 'asset-fp001', actorId: 'user-owner', correlationId: 'correlation-asset-revision', idempotencyKey: 'idempotency-asset-revision', payload: { revisionId: 'revision-fp001', parentRevisionId: null, contentHash: 'a'.repeat(64), contentType: 'image/png', byteLength: 4, storageLocator: { provider: 'opfs', bucket: null, objectKey: 'asset-fp001/revision.bin' }, toolId: 'pixiedraw2', formatId: 'png', formatVersion: '1', dependencySnapshotId: null }, permissionDecision: { ...assetCreateProof, resourceId: 'asset-other', action: 'revision', capability: 'revision', correlationId: 'correlation-asset-revision' }, adapters });
assert.equal(assetRegistry.executeCommand(fakeAssetCommand).ok, false);

// 3. Package Registry: materialization accepts only an evaluator-bound Package Proof.
const packageFixture = JSON.parse(readFileSync(new URL('../core-shell/fixtures/package-registry-v1.valid.json', import.meta.url), 'utf8'));
const canonicalize = (value) => Array.isArray(value) ? value.map(canonicalize) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])) : value;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const packageManifestHash = (manifest) => hash(JSON.stringify(canonicalize(manifest)));
const packageProof = proof({ resourceType: 'PACKAGE', resourceId: packageFixture.packageId, action: 'materialize', correlationId: packageFixture.correlationId });
const packageCommand = { ...packageFixture, actorId: 'user-owner', permissionDecision: packageProof };
const packageRegistry = createPackageRegistry({
  clock, idGenerator, featureFlagEvaluator: enabledFlags,
  permissionEvaluator: (input) => serverEvaluator({ ...input, resourceId: input.packageId, action: input.action, capability: input.capability ?? input.action }),
  graphResolver: () => structuredClone(packageFixture.dependencySnapshot),
  blobVerifier: ({ asset }) => ({ verified: true, contentHash: asset.contentHash, byteLength: asset.byteLength, contentType: asset.contentType }),
  manifestHasher: packageManifestHash,
  packageAssembler: (input) => {
    const manifest = structuredClone(input.manifest);
    manifest.hash = null;
    manifest.size = null;
    const manifestHash = packageManifestHash(manifest);
    const contentHash = hash(JSON.stringify({ manifestHash, mode: input.mode, entries: input.entries.map((entry) => [entry.assetId, entry.revisionId, entry.contentHash]) }));
    return { contentHash, byteLength: 2048, uncompressedByteLength: 32768, fileCount: input.entries.length + 5, storageLocator: { provider: 'object-storage', bucket: 'packages', objectKey: `sha256/${contentHash}` }, manifestHash, verified: true, deduplicatedContentHashes: input.deduplicatedContentHashes };
  },
  packageDependencyResolver: ({ packageId, packageVersion }) => ({ ok: true, packageId, packageVersion, contentHash: 'a'.repeat(64), dependencies: [] }),
});
assert.equal(packageRegistry.materializePackage({ command: packageCommand, permissionDecision: packageProof }).ok, true);
const fakePackageRead = packageRegistry.getPackage({ packageId: packageFixture.packageId, packageVersion: packageFixture.packageVersion, actorId: 'user-owner', permissionDecision: { ...packageProof, resourceId: 'package-other', action: 'read', capability: 'read' } });
assert.equal(fakePackageRead.ok, false);

// 4. Search exact lookup/fallback: fallback receives the resolved Proof, never a synthesized allow.
const searchFixture = JSON.parse(readFileSync(new URL('../core-shell/fixtures/search-index-v1.valid.json', import.meta.url), 'utf8'));
const search = createSearchIndexCore({
  clock, idGenerator, featureFlagEvaluator: enabledFlags,
  authorizationEvaluator: (input) => serverEvaluator({ ...input, tenantId: 'tenant-1', correlationId: input.correlationId ?? null }),
});
const lookupProof = proof({ resourceType: 'PROJECT', resourceId: searchFixture.document.resourceId, action: 'search.lookup', capability: 'search.lookup' });
let fallbackProof = null;
const lookup = search.lookupResource({ resourceType: 'PROJECT', resourceId: searchFixture.document.resourceId, actorId: 'user-owner', permissionDecision: lookupProof, canonicalFallback: (input) => { fallbackProof = input.permissionDecision; return { ok: true, document: searchFixture.document }; } });
assert.equal(lookup.ok, true);
assert.equal(fallbackProof.proofType, 'AUTHORIZATION_PROOF');
assert.equal(fallbackProof.resourceId, searchFixture.document.resourceId);
const forgedLookupProof = { ...lookupProof, authorityId: 'caller-forged-authority', proofId: 'caller-forged-proof' };
let authoritativeFallbackProof = null;
assert.equal(search.lookupResource({ resourceType: 'PROJECT', resourceId: searchFixture.document.resourceId, actorId: 'user-owner', permissionDecision: forgedLookupProof, canonicalFallback: (input) => { authoritativeFallbackProof = input.permissionDecision; return { ok: true, document: searchFixture.document }; } }).ok, true);
assert.equal(authoritativeFallbackProof.authorityId, 'fp001-test-authority');
assert.equal(search.lookupResource({ resourceType: 'PROJECT', resourceId: searchFixture.document.resourceId, actorId: 'user-owner', permissionDecision: { ...lookupProof, resourceId: 'project-other' }, canonicalFallback: () => ({ ok: true, document: searchFixture.document }) }).ok, false);
assert.equal(search.lookupResource({ resourceType: 'PROJECT', resourceId: searchFixture.document.resourceId, actorId: 'user-owner', permissionDecision: { ...lookupProof, tenantId: 'tenant-other' }, canonicalFallback: () => ({ ok: true, document: searchFixture.document }) }).ok, false);

// 5. Tool Bridge: registration, capability negotiation, and request gating all use the same Proof root.
const toolFixture = JSON.parse(readFileSync(new URL('../core-shell/fixtures/tool-bridge-v1.valid.json', import.meta.url), 'utf8'));
const bridge = createToolBridge({
  clock: () => '2099-08-09T00:00:00.000Z', idGenerator, featureFlagEvaluator: enabledFlags,
  permissionEvaluator: (input) => serverEvaluator({ principalId: input.principalId ?? input.actorId ?? 'user-owner', resourceType: input.resourceType, resourceId: input.resourceId, action: input.action || input.operation, capability: input.capability || input.operation, tenantId: input.tenantId ?? 'tenant-1', correlationId: input.correlationId ?? null }),
});
for (const descriptor of toolFixture.descriptors) bridge.registerTool(descriptor, { registrationDecision: proof({ resourceType: 'TOOL', resourceId: descriptor.toolId, action: 'tool.register', capability: 'tool.register' }) });
const bridgeProof = proof({ resourceType: 'TOOL', resourceId: 'pixiedraw2', action: 'project.open', capability: 'project.open', correlationId: 'correlation-fp001' });
const bridgeRequest = createBridgeRequest({ ...toolFixture.request, requestId: 'request-fp001', correlationId: 'correlation-fp001', idempotencyKey: 'idempotency-fp001', createdAt: '2099-08-09T00:00:00.000Z', authorization: bridgeProof });
assert.equal(bridge.beginRequest(bridgeRequest).status, 'ACCEPTED');
assert.notEqual(bridge.beginRequest({ ...bridgeRequest, requestId: 'request-fp001-fake', idempotencyKey: 'idempotency-fp001-fake', authorization: { ...bridgeProof, resourceId: 'pixigame' } }).status, 'ACCEPTED');

console.log('FP-001 Adoption: Registry/Search/Tool Bridge proof-binding checks passed');
