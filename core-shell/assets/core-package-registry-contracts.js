/*
 * WP-094 Package Registry Core.
 *
 * This is an unloaded, framework-free reference contract. It materializes references to immutable
 * Project/Asset/Revision data into a verified Thin or Portable Package record. It never receives
 * raw media, package bodies, Base64, Data URLs, browser storage objects, network clients, or Tool
 * global state. Project/Asset/Permission/Storage behavior is injected by adapters.
 */

import { AUTHORIZATION_PROOF_POLICY_VERSION, normalizeAuthorizationProof, resolveAuthorizationProofSync } from './core-authorization-proof-contracts.js';

export const PACKAGE_REGISTRY_SCHEMA_VERSION = 1;
export const PACKAGE_RECORD_VERSION_START = 1;

export const PACKAGE_KINDS = Object.freeze([
  'PROJECT_PACKAGE',
  'MATERIAL_PACKAGE',
  'FINISHED_PRODUCT_PACKAGE',
  'GAME_PACKAGE',
  'AUDIO_PACKAGE',
  'DRAW_PACKAGE',
  'BACKUP_PACKAGE',
  'EXPORT_PACKAGE',
  'TEMPLATE_PACKAGE',
]);
export const PACKAGE_MATERIALIZATION_MODES = Object.freeze(['THIN', 'PORTABLE']);
export const PACKAGE_LIFECYCLE_STATES = Object.freeze(['BUILDING', 'VERIFYING', 'READY', 'FAILED', 'QUARANTINED', 'ARCHIVED']);
export const PACKAGE_OWNER_TYPES = Object.freeze(['USER', 'TEAM']);
export const PACKAGE_REFERENCE_POLICIES = Object.freeze(['LIVE', 'PINNED', 'REVIEW', 'FORKED']);
export const PACKAGE_EVENT_TYPES = Object.freeze([
  'PACKAGE_BUILD_STARTED',
  'PACKAGE_MATERIALIZED',
  'PACKAGE_VERIFIED',
  'PACKAGE_FAILED',
  'PACKAGE_QUARANTINED',
  'PACKAGE_ARCHIVED',
]);
export const PACKAGE_FLAGS = Object.freeze({
  read: 'package-registry-read',
  write: 'package-registry-write',
  materialize: 'package-materialize',
  portable: 'package-portable',
  legacyPxd: 'package-legacy-pxd',
  storageUpload: 'package-storage-upload',
});
export const PACKAGE_STREAMING_CONTRACT = Object.freeze({
  read: true,
  write: true,
  chunkHash: true,
  incrementalVerification: true,
  workerReady: true,
  mainThreadWholePackageBuffer: false,
});
export const PACKAGE_LIMITS = Object.freeze({
  id: 128,
  version: 64,
  hash: 64,
  metadataBytes: 32768,
  assetEntries: 1024,
  dependencyEdges: 2048,
  packageDependencies: 64,
  packageRecursionDepth: 8,
  fileCount: 10000,
  uncompressedBytes: 1024 * 1024 * 1024,
  compressedBytes: 1024 * 1024 * 1024,
  path: 512,
});

export const PACKAGE_STORAGE_BOUNDARY = Object.freeze({
  registry: 'package-metadata-manifest-dependency-lock-hash-storage-reference',
  opfs: 'local-temporary-streaming-cache-and-offline-package-bytes',
  objectStorage: 'immutable-package-artifact-and-portable-archive',
  excludedFromRegistry: Object.freeze([
    'raw-pixel-blob',
    'audio-bytes',
    'game-build-bytes',
    'package-body',
    'base64',
    'data-url',
    'jwt',
    'secret',
    'payment',
    'royalty-ledger',
    'commission-body',
  ]),
});

const PACKAGE_RECORD_KEYS = new Set([
  'packageId', 'packageKind', 'packageVersion', 'schemaVersion', 'ownerType', 'ownerId',
  'sourceProjectId', 'rootAssetId', 'manifestVersion', 'lifecycleState', 'createdBy', 'createdAt',
  'contentHash', 'byteLength', 'storageLocator', 'dependencySnapshotHash', 'recordVersion',
  'materializationMode', 'manifestHash', 'manifest', 'compatibility', 'licenseReference',
  'provenanceReference',
]);
const MANIFEST_KEYS = new Set([
  'packageId', 'packageVersion', 'schemaVersion', 'manifestVersion', 'packageKind', 'materializationMode',
  'sourceProjectId', 'rootAssetId', 'toolReferences', 'includedAssetRevisions', 'dependencyGraphSnapshot',
  'dependencyLock', 'requiredPackageDependencies', 'optionalDependencies', 'compatibility', 'hash', 'size',
  'licenseReference', 'provenanceReference', 'createdAt', 'security', 'streaming',
]);
const ASSET_ENTRY_KEYS = new Set([
  'assetId', 'revisionId', 'assetKind', 'contentHash', 'contentType', 'byteLength', 'toolId', 'formatId',
  'formatVersion', 'storageHandleRef', 'required', 'sourcePolicy', 'lockPolicy', 'portableAllowed',
  'sandboxRequired', 'deduplicated', 'assetState', 'assetAccess',
]);
const EDGE_KEYS = new Set([
  'edgeId', 'consumerAssetId', 'providerAssetId', 'providerRevisionId', 'relationType', 'referencePolicy',
  'required', 'compatibilityConstraint', 'lockPolicy',
]);
const LOCK_ENTRY_KEYS = new Set(['assetId', 'revisionId', 'contentHash', 'byteLength', 'required', 'sourcePolicy', 'lockPolicy', 'compatibility']);
const PACKAGE_DEPENDENCY_KEYS = new Set(['packageId', 'packageVersion', 'contentHash', 'required', 'accessGranted', 'dependencies']);
const PERMISSION_KEYS = new Set(['ok', 'decision', 'source', 'capability', 'correlationId']);
const COMMAND_KEYS = new Set([
  'packageId', 'packageKind', 'packageVersion', 'schemaVersion', 'ownerType', 'ownerId', 'sourceProjectId',
  'rootAssetId', 'manifestVersion', 'materializationMode', 'actorId', 'correlationId', 'idempotencyKey',
  'expectedRecordVersion', 'createdAt', 'expectedContentHash', 'expectedManifestHash', 'compatibility',
  'licenseReference', 'provenanceReference', 'metadata', 'dependencySnapshot', 'packageDependencies',
  'legacyPxd', 'permissionDecision',
]);
const FORBIDDEN_METADATA_KEYS = /jwt|secret|password|token|payment|price|purchase|entitlement|royalty|payout|commission|base64|dataurl|data-url|raw|bytes|buffer|body/iu;

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function fail(code, message, field = null, metadata = {}) {
  throw Object.assign(new Error(message), { code, field, metadata });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, field, max = PACKAGE_LIMITS.id) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail('PACKAGE_VALUE_INVALID', `${field} must be a bounded stable string.`, field);
  return value.trim();
}

function typedId(value, field) {
  const result = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) fail('PACKAGE_TYPED_ID_INVALID', `${field} is not a typed ID.`, field);
  return result;
}

function packageVersion(value, field = 'packageVersion') {
  const result = text(value, field, PACKAGE_LIMITS.version);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/u.test(result)) fail('PACKAGE_VERSION_INVALID', `${field} is not a valid Package Version.`, field);
  return result;
}

function hash(value, field) {
  const result = text(value, field, PACKAGE_LIMITS.hash);
  if (!/^[a-f0-9]{64}$/iu.test(result)) fail('PACKAGE_HASH_INVALID', `${field} must be a SHA-256 hex reference.`, field);
  return result.toLowerCase();
}

function enumValue(value, field, values) {
  if (!values.includes(value)) fail('PACKAGE_ENUM_UNSUPPORTED', `${field} is unsupported: ${String(value)}.`, field);
  return value;
}

function assertKeys(value, keys, field) {
  if (!isObject(value)) fail('PACKAGE_OBJECT_INVALID', `${field} must be an object.`, field);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail('PACKAGE_UNKNOWN_FIELD', `${field}.${key} is not part of the Package contract.`, `${field}.${key}`);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function boundedMetadata(value, field = 'metadata', depth = 0) {
  if (depth > 6) fail('PACKAGE_METADATA_TOO_DEEP', `${field} is too deeply nested.`, field);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return clone(value);
  if (typeof value === 'string') {
    if (value.length > 1024 || /^data:/iu.test(value)) fail('PACKAGE_BLOB_PAYLOAD_FORBIDDEN', `${field} cannot contain raw or Data URL data.`, field);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) fail('PACKAGE_METADATA_TOO_LARGE', `${field} contains too many values.`, field);
    return value.map((item, index) => boundedMetadata(item, `${field}[${index}]`, depth + 1));
  }
  if (!isObject(value)) fail('PACKAGE_METADATA_TYPE_INVALID', `${field} contains an unsupported value.`, field);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_METADATA_KEYS.test(key)) fail('PACKAGE_FORBIDDEN_DATA', `${field}.${key} is outside the Package Registry boundary.`, `${field}.${key}`);
    result[text(key, `${field}.key`, 96)] = boundedMetadata(item, `${field}.${key}`, depth + 1);
  }
  if (stableJson(result).length > PACKAGE_LIMITS.metadataBytes) fail('PACKAGE_METADATA_TOO_LARGE', `${field} exceeds the metadata byte limit.`, field);
  return result;
}

function normalizeLocator(value, field = 'storageLocator') {
  if (value === null || value === undefined) return null;
  assertKeys(value, new Set(['provider', 'bucket', 'objectKey']), field);
  const provider = enumValue(value.provider, `${field}.provider`, ['object-storage', 'opfs']);
  const bucket = value.bucket === null || value.bucket === undefined ? null : text(value.bucket, `${field}.bucket`, 128);
  const objectKey = text(value.objectKey, `${field}.objectKey`, PACKAGE_LIMITS.path);
  if (objectKey.startsWith('/') || objectKey.includes('..') || /[\u0000-\u001f\u007f]/u.test(objectKey) || /^[a-z]+:\/\//iu.test(objectKey)) fail('PACKAGE_PATH_UNSAFE', `${field}.objectKey is not a canonical relative path.`, `${field}.objectKey`);
  return { provider, bucket, objectKey };
}

function normalizeReference(value, field) {
  if (!isObject(value)) fail('PACKAGE_REFERENCE_INVALID', `${field} must be a reference object.`, field);
  for (const key of Object.keys(value)) if (!['licenseId', 'provenanceId', 'projectId', 'assetId', 'revisionId', 'packageId', 'packageVersion', 'contentHash'].includes(key)) fail('PACKAGE_REFERENCE_FIELD_INVALID', `${field}.${key} is not a reference field.`, `${field}.${key}`);
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = key === 'contentHash' ? hash(item, `${field}.${key}`) : (key === 'packageVersion' ? packageVersion(item, `${field}.${key}`) : typedId(item, `${field}.${key}`));
  if (!Object.keys(result).length) fail('PACKAGE_REFERENCE_EMPTY', `${field} must contain a reference ID.`, field);
  return result;
}

function normalizeAssetEntry(value, field) {
  assertKeys(value, ASSET_ENTRY_KEYS, field);
  const entry = {
    assetId: typedId(value.assetId, `${field}.assetId`),
    revisionId: typedId(value.revisionId, `${field}.revisionId`),
    assetKind: text(value.assetKind, `${field}.assetKind`, 96),
    contentHash: hash(value.contentHash, `${field}.contentHash`),
    contentType: text(value.contentType, `${field}.contentType`, 128),
    byteLength: value.byteLength,
    toolId: text(value.toolId, `${field}.toolId`, 96),
    formatId: text(value.formatId, `${field}.formatId`, 96),
    formatVersion: packageVersion(value.formatVersion, `${field}.formatVersion`),
    storageHandleRef: text(value.storageHandleRef, `${field}.storageHandleRef`, 256),
    required: value.required !== false,
    sourcePolicy: enumValue(value.sourcePolicy || 'PINNED', `${field}.sourcePolicy`, PACKAGE_REFERENCE_POLICIES),
    lockPolicy: enumValue(value.lockPolicy || 'PINNED', `${field}.lockPolicy`, ['PINNED']),
    portableAllowed: value.portableAllowed === true,
    sandboxRequired: value.sandboxRequired === true,
    deduplicated: value.deduplicated === true,
    assetState: value.assetState || 'ACTIVE',
    assetAccess: value.assetAccess !== false,
  };
  if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0 || entry.byteLength > PACKAGE_LIMITS.uncompressedBytes) fail('PACKAGE_BYTE_LENGTH_INVALID', `${field}.byteLength is invalid.`, `${field}.byteLength`);
  if (/^image\/svg\+xml$/iu.test(entry.contentType) || /^text\/html$/iu.test(entry.contentType)) fail('PACKAGE_ACTIVE_CONTENT_FORBIDDEN', `${field}.contentType contains active package content.`, `${field}.contentType`);
  if (entry.assetKind === 'SCRIPT' && !entry.sandboxRequired) fail('PACKAGE_SCRIPT_SANDBOX_REQUIRED', `${field} Script entries require an explicit sandbox boundary.`, field);
  if (entry.assetAccess !== true) fail('PACKAGE_ASSET_PERMISSION_DENIED', `${field} Asset permission was not granted by the resolver.`, `${field}.assetAccess`);
  if (!['ACTIVE', 'ARCHIVED', 'TRASHED', 'QUARANTINED'].includes(entry.assetState)) fail('PACKAGE_ASSET_STATE_INVALID', `${field}.assetState is unsupported.`, `${field}.assetState`);
  if (entry.assetState === 'TRASHED') fail('PACKAGE_DEPENDENCY_TRASHED', `${field} points to a Trashed Asset.`, `${field}.assetState`);
  if (entry.assetState === 'QUARANTINED') fail('PACKAGE_DEPENDENCY_QUARANTINED', `${field} points to a Quarantined Asset.`, `${field}.assetState`);
  if (!/^handle:[A-Za-z0-9._:-]{1,240}$/u.test(entry.storageHandleRef)) fail('PACKAGE_STORAGE_HANDLE_INVALID', `${field}.storageHandleRef must be an opaque Handle reference.`, `${field}.storageHandleRef`);
  return entry;
}

function normalizeEdge(value, field) {
  assertKeys(value, EDGE_KEYS, field);
  return {
    edgeId: typedId(value.edgeId, `${field}.edgeId`),
    consumerAssetId: typedId(value.consumerAssetId, `${field}.consumerAssetId`),
    providerAssetId: typedId(value.providerAssetId, `${field}.providerAssetId`),
    providerRevisionId: typedId(value.providerRevisionId, `${field}.providerRevisionId`),
    relationType: text(value.relationType, `${field}.relationType`, 96),
    referencePolicy: enumValue(value.referencePolicy, `${field}.referencePolicy`, PACKAGE_REFERENCE_POLICIES),
    required: value.required !== false,
    compatibilityConstraint: boundedMetadata(value.compatibilityConstraint || {}, `${field}.compatibilityConstraint`),
    lockPolicy: value.lockPolicy === undefined ? null : enumValue(value.lockPolicy, `${field}.lockPolicy`, ['PINNED']),
  };
}

function normalizePackageDependency(value, field, depth = 0) {
  if (depth > PACKAGE_LIMITS.packageRecursionDepth) fail('PACKAGE_NESTED_RECURSION', 'Nested Package dependency recursion exceeds the safety limit.', field);
  assertKeys(value, PACKAGE_DEPENDENCY_KEYS, field);
  const dependencies = value.dependencies === undefined ? [] : (Array.isArray(value.dependencies) ? value.dependencies.map((item, index) => normalizePackageDependency(item, `${field}.dependencies[${index}]`, depth + 1)) : fail('PACKAGE_DEPENDENCY_INVALID', `${field}.dependencies must be an array.`, `${field}.dependencies`));
  return {
    packageId: typedId(value.packageId, `${field}.packageId`),
    packageVersion: packageVersion(value.packageVersion, `${field}.packageVersion`),
    contentHash: value.contentHash === null || value.contentHash === undefined ? null : hash(value.contentHash, `${field}.contentHash`),
    required: value.required !== false,
    accessGranted: value.accessGranted === true,
    dependencies,
  };
}

function normalizePermissionDecision(value, field = 'permissionDecision') {
  try {
    return normalizeAuthorizationProof(value);
  } catch (error) {
    fail(error.code || 'PACKAGE_PERMISSION_INVALID', `${field} must be an AuthorizationProofV1: ${error.message}`, field);
  }
}

function normalizeCompatibility(value) {
  return boundedMetadata(value || {}, 'compatibility');
}

function normalizeStreaming(value, field = 'streaming') {
  assertKeys(value, new Set(Object.keys(PACKAGE_STREAMING_CONTRACT)), field);
  const result = {};
  for (const key of Object.keys(PACKAGE_STREAMING_CONTRACT)) {
    if (typeof value[key] !== 'boolean') fail('PACKAGE_STREAMING_CONTRACT_INVALID', `${field}.${key} must be boolean.`, `${field}.${key}`);
    result[key] = value[key];
  }
  return result;
}

function normalizeCommand(command) {
  assertKeys(command, COMMAND_KEYS, 'command');
  const input = {
    packageId: typedId(command.packageId, 'packageId'),
    packageKind: enumValue(command.packageKind, 'packageKind', PACKAGE_KINDS),
    packageVersion: packageVersion(command.packageVersion),
    schemaVersion: command.schemaVersion === undefined ? PACKAGE_REGISTRY_SCHEMA_VERSION : command.schemaVersion,
    ownerType: enumValue(command.ownerType, 'ownerType', PACKAGE_OWNER_TYPES),
    ownerId: typedId(command.ownerId, 'ownerId'),
    sourceProjectId: typedId(command.sourceProjectId, 'sourceProjectId'),
    rootAssetId: typedId(command.rootAssetId, 'rootAssetId'),
    manifestVersion: packageVersion(command.manifestVersion || '1', 'manifestVersion'),
    materializationMode: enumValue(command.materializationMode, 'materializationMode', PACKAGE_MATERIALIZATION_MODES),
    actorId: typedId(command.actorId, 'actorId'),
    correlationId: typedId(command.correlationId, 'correlationId'),
    idempotencyKey: typedId(command.idempotencyKey, 'idempotencyKey'),
    expectedRecordVersion: command.expectedRecordVersion === null || command.expectedRecordVersion === undefined ? null : command.expectedRecordVersion,
    createdAt: text(command.createdAt, 'createdAt', 128),
    expectedContentHash: command.expectedContentHash === null || command.expectedContentHash === undefined ? null : hash(command.expectedContentHash, 'expectedContentHash'),
    expectedManifestHash: command.expectedManifestHash === null || command.expectedManifestHash === undefined ? null : hash(command.expectedManifestHash, 'expectedManifestHash'),
    compatibility: normalizeCompatibility(command.compatibility),
    licenseReference: command.licenseReference ? normalizeReference(command.licenseReference, 'licenseReference') : null,
    provenanceReference: command.provenanceReference ? normalizeReference(command.provenanceReference, 'provenanceReference') : null,
    metadata: boundedMetadata(command.metadata || {}, 'metadata'),
    dependencySnapshot: command.dependencySnapshot,
    packageDependencies: command.packageDependencies === undefined ? [] : (Array.isArray(command.packageDependencies) ? command.packageDependencies.map((item, index) => normalizePackageDependency(item, `packageDependencies[${index}]`)) : fail('PACKAGE_DEPENDENCY_INVALID', 'packageDependencies must be an array.', 'packageDependencies')),
    legacyPxd: command.legacyPxd === true,
    permissionDecision: command.permissionDecision ? normalizePermissionDecision(command.permissionDecision) : null,
  };
  if (input.schemaVersion !== PACKAGE_REGISTRY_SCHEMA_VERSION) fail('PACKAGE_SCHEMA_UNSUPPORTED', 'Package Registry schema version is unsupported.', 'schemaVersion');
  if (input.expectedRecordVersion !== null && (!Number.isSafeInteger(input.expectedRecordVersion) || input.expectedRecordVersion < 1)) fail('PACKAGE_RECORD_VERSION_INVALID', 'expectedRecordVersion must be a positive safe integer.', 'expectedRecordVersion');
  if (input.packageDependencies.length > PACKAGE_LIMITS.packageDependencies) fail('PACKAGE_DEPENDENCY_TOO_MANY', 'Package dependency count exceeds the limit.', 'packageDependencies');
  return input;
}

function normalizeLockEntry(value, field) {
  assertKeys(value, LOCK_ENTRY_KEYS, field);
  return {
    assetId: typedId(value.assetId, `${field}.assetId`),
    revisionId: typedId(value.revisionId, `${field}.revisionId`),
    contentHash: hash(value.contentHash, `${field}.contentHash`),
    byteLength: value.byteLength,
    required: value.required === true,
    sourcePolicy: enumValue(value.sourcePolicy, `${field}.sourcePolicy`, PACKAGE_REFERENCE_POLICIES),
    lockPolicy: enumValue(value.lockPolicy, `${field}.lockPolicy`, ['PINNED']),
    compatibility: boundedMetadata(value.compatibility || {}, `${field}.compatibility`),
  };
}

function validateManifest(manifest) {
  assertKeys(manifest, MANIFEST_KEYS, 'package.manifest');
  const result = {
    packageId: typedId(manifest.packageId, 'package.manifest.packageId'),
    packageVersion: packageVersion(manifest.packageVersion, 'package.manifest.packageVersion'),
    schemaVersion: manifest.schemaVersion,
    manifestVersion: packageVersion(manifest.manifestVersion, 'package.manifest.manifestVersion'),
    packageKind: enumValue(manifest.packageKind, 'package.manifest.packageKind', PACKAGE_KINDS),
    materializationMode: enumValue(manifest.materializationMode, 'package.manifest.materializationMode', PACKAGE_MATERIALIZATION_MODES),
    sourceProjectId: typedId(manifest.sourceProjectId, 'package.manifest.sourceProjectId'),
    rootAssetId: typedId(manifest.rootAssetId, 'package.manifest.rootAssetId'),
    toolReferences: Array.isArray(manifest.toolReferences) ? manifest.toolReferences.map((item, index) => text(item, `package.manifest.toolReferences[${index}]`, 160)) : fail('PACKAGE_MANIFEST_INVALID', 'Manifest toolReferences must be an array.', 'package.manifest.toolReferences'),
    includedAssetRevisions: Array.isArray(manifest.includedAssetRevisions) ? manifest.includedAssetRevisions.map((item, index) => normalizeAssetEntry(item, `package.manifest.includedAssetRevisions[${index}]`)) : fail('PACKAGE_MANIFEST_INVALID', 'Manifest includedAssetRevisions must be an array.', 'package.manifest.includedAssetRevisions'),
    dependencyGraphSnapshot: manifest.dependencyGraphSnapshot,
    dependencyLock: Array.isArray(manifest.dependencyLock) ? manifest.dependencyLock.map((item, index) => normalizeLockEntry(item, `package.manifest.dependencyLock[${index}]`)) : fail('PACKAGE_MANIFEST_INVALID', 'Manifest dependencyLock must be an array.', 'package.manifest.dependencyLock'),
    requiredPackageDependencies: Array.isArray(manifest.requiredPackageDependencies) ? manifest.requiredPackageDependencies.map((item, index) => normalizePackageDependency(item, `package.manifest.requiredPackageDependencies[${index}]`)) : fail('PACKAGE_MANIFEST_INVALID', 'Manifest requiredPackageDependencies must be an array.', 'package.manifest.requiredPackageDependencies'),
    optionalDependencies: Array.isArray(manifest.optionalDependencies) ? manifest.optionalDependencies.map((item, index) => boundedMetadata(item, `package.manifest.optionalDependencies[${index}]`)) : fail('PACKAGE_MANIFEST_INVALID', 'Manifest optionalDependencies must be an array.', 'package.manifest.optionalDependencies'),
    compatibility: normalizeCompatibility(manifest.compatibility),
    hash: hash(manifest.hash, 'package.manifest.hash'),
    size: manifest.size,
    licenseReference: manifest.licenseReference ? normalizeReference(manifest.licenseReference, 'package.manifest.licenseReference') : null,
    provenanceReference: manifest.provenanceReference ? normalizeReference(manifest.provenanceReference, 'package.manifest.provenanceReference') : null,
    createdAt: text(manifest.createdAt, 'package.manifest.createdAt', 128),
    security: boundedMetadata(manifest.security || {}, 'package.manifest.security'),
    streaming: normalizeStreaming(manifest.streaming, 'package.manifest.streaming'),
  };
  if (result.schemaVersion !== PACKAGE_REGISTRY_SCHEMA_VERSION) fail('PACKAGE_SCHEMA_UNSUPPORTED', 'Manifest schema version is unsupported.', 'package.manifest.schemaVersion');
  if (!isObject(result.dependencyGraphSnapshot)) fail('PACKAGE_MANIFEST_INVALID', 'Manifest dependency graph snapshot is required.', 'package.manifest.dependencyGraphSnapshot');
  assertKeys(result.dependencyGraphSnapshot, new Set(['projectId', 'rootAssetId', 'edges']), 'package.manifest.dependencyGraphSnapshot');
  typedId(result.dependencyGraphSnapshot.projectId, 'package.manifest.dependencyGraphSnapshot.projectId');
  typedId(result.dependencyGraphSnapshot.rootAssetId, 'package.manifest.dependencyGraphSnapshot.rootAssetId');
  if (!Array.isArray(result.dependencyGraphSnapshot.edges)) fail('PACKAGE_MANIFEST_INVALID', 'Manifest dependency graph edges must be an array.', 'package.manifest.dependencyGraphSnapshot.edges');
  result.dependencyGraphSnapshot.edges = result.dependencyGraphSnapshot.edges.map((item, index) => normalizeEdge(item, `package.manifest.dependencyGraphSnapshot.edges[${index}]`));
  if (!Number.isSafeInteger(result.size) || result.size < 0 || result.size > PACKAGE_LIMITS.uncompressedBytes) fail('PACKAGE_MANIFEST_SIZE_INVALID', 'Manifest size is invalid.', 'package.manifest.size');
  return result;
}

function validateGraph(graph) {
  if (!isObject(graph)) fail('PACKAGE_GRAPH_INVALID', 'Dependency Graph Snapshot must be an object.', 'dependencySnapshot');
  const keys = new Set(['project', 'rootAsset', 'assets', 'edges', 'packageDependencies']);
  assertKeys(graph, keys, 'dependencySnapshot');
  if (!isObject(graph.project)) fail('PACKAGE_PROJECT_SNAPSHOT_INVALID', 'Graph Project snapshot is required.', 'dependencySnapshot.project');
  const project = { projectId: typedId(graph.project.projectId, 'dependencySnapshot.project.projectId'), recordVersion: graph.project.recordVersion || 1 };
  if (!isObject(graph.rootAsset)) fail('PACKAGE_ROOT_ASSET_MISSING', 'Graph root Asset snapshot is required.', 'dependencySnapshot.rootAsset');
  const rootAsset = normalizeAssetEntry({ ...graph.rootAsset, required: true, lockPolicy: 'PINNED', sourcePolicy: graph.rootAsset.sourcePolicy || 'PINNED' }, 'dependencySnapshot.rootAsset');
  const assets = Array.isArray(graph.assets) ? graph.assets.map((item, index) => normalizeAssetEntry(item, `dependencySnapshot.assets[${index}]`)) : fail('PACKAGE_GRAPH_ASSETS_INVALID', 'Graph assets must be an array.', 'dependencySnapshot.assets');
  const allAssets = [rootAsset, ...assets];
  if (allAssets.length > PACKAGE_LIMITS.assetEntries) fail('PACKAGE_ASSET_COUNT_EXCEEDED', 'Package Asset entry count exceeds the limit.', 'dependencySnapshot.assets');
  const assetIds = new Set();
  for (const asset of allAssets) {
    if (assetIds.has(asset.assetId)) fail('PACKAGE_ASSET_DUPLICATE', 'Dependency Graph contains a duplicate Asset ID.', 'dependencySnapshot.assets');
    assetIds.add(asset.assetId);
  }
  const edges = Array.isArray(graph.edges) ? graph.edges.map((item, index) => normalizeEdge(item, `dependencySnapshot.edges[${index}]`)) : fail('PACKAGE_GRAPH_EDGES_INVALID', 'Graph edges must be an array.', 'dependencySnapshot.edges');
  if (edges.length > PACKAGE_LIMITS.dependencyEdges) fail('PACKAGE_EDGE_COUNT_EXCEEDED', 'Dependency edge count exceeds the limit.', 'dependencySnapshot.edges');
  for (const edge of edges) {
    if (!assetIds.has(edge.consumerAssetId) || !assetIds.has(edge.providerAssetId)) fail('PACKAGE_DEPENDENCY_ASSET_UNKNOWN', 'Dependency edge points to an Asset outside the snapshot.', `dependencySnapshot.edges.${edge.edgeId}`);
  }
  const packageDependencies = graph.packageDependencies === undefined ? [] : (Array.isArray(graph.packageDependencies) ? graph.packageDependencies.map((item, index) => normalizePackageDependency(item, `dependencySnapshot.packageDependencies[${index}]`)) : fail('PACKAGE_DEPENDENCY_INVALID', 'Graph packageDependencies must be an array.', 'dependencySnapshot.packageDependencies'));
  return { project, rootAsset, assets, allAssets, edges, packageDependencies };
}

function detectCycle(edges) {
  const adjacency = Object.create(null);
  for (const edge of edges) (adjacency[edge.consumerAssetId] ||= []).push(edge.providerAssetId);
  const visiting = new Set();
  const visited = new Set();
  const visit = (assetId) => {
    if (visiting.has(assetId)) return true;
    if (visited.has(assetId)) return false;
    visiting.add(assetId);
    for (const providerId of adjacency[assetId] || []) if (visit(providerId)) return true;
    visiting.delete(assetId);
    visited.add(assetId);
    return false;
  };
  return Object.keys(adjacency).some(visit);
}

function validateLocatorPath(value, field) {
  return normalizeLocator(value, field);
}

function createAttemptResult(command, code, message, metadata = {}) {
  return {
    ok: false,
    packageId: command.packageId,
    packageVersion: command.packageVersion,
    diagnostics: [{ code, severity: 'error', message, metadata }],
    committed: false,
  };
}

export function validatePackageCommand(command) {
  try {
    return { valid: true, value: normalizeCommand(command), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [{ code: error.code || 'PACKAGE_COMMAND_INVALID', severity: 'error', message: error.message, field: error.field || null }] };
  }
}

export function validatePackageRecord(record) {
  try {
    assertKeys(record, PACKAGE_RECORD_KEYS, 'package');
    typedId(record.packageId, 'package.packageId');
    packageVersion(record.packageVersion, 'package.packageVersion');
    typedId(record.ownerId, 'package.ownerId');
    typedId(record.sourceProjectId, 'package.sourceProjectId');
    typedId(record.rootAssetId, 'package.rootAssetId');
    packageVersion(record.manifestVersion, 'package.manifestVersion');
    typedId(record.createdBy, 'package.createdBy');
    if (record.schemaVersion !== PACKAGE_REGISTRY_SCHEMA_VERSION) fail('PACKAGE_SCHEMA_UNSUPPORTED', 'Package schema version is unsupported.', 'package.schemaVersion');
    enumValue(record.ownerType, 'package.ownerType', PACKAGE_OWNER_TYPES);
    enumValue(record.packageKind, 'package.packageKind', PACKAGE_KINDS);
    enumValue(record.materializationMode, 'package.materializationMode', PACKAGE_MATERIALIZATION_MODES);
    enumValue(record.lifecycleState, 'package.lifecycleState', PACKAGE_LIFECYCLE_STATES);
    hash(record.contentHash, 'package.contentHash');
    hash(record.manifestHash, 'package.manifestHash');
    if (!Number.isSafeInteger(record.byteLength) || record.byteLength < 0) fail('PACKAGE_BYTE_LENGTH_INVALID', 'Package byteLength is invalid.', 'package.byteLength');
    normalizeLocator(record.storageLocator, 'package.storageLocator');
    const manifest = validateManifest(record.manifest);
    if (manifest.packageId !== record.packageId || manifest.packageVersion !== record.packageVersion) fail('PACKAGE_MANIFEST_RECORD_MISMATCH', 'Package Manifest identity does not match the Registry record.', 'package.manifest');
    if (manifest.packageKind !== record.packageKind || manifest.sourceProjectId !== record.sourceProjectId || manifest.rootAssetId !== record.rootAssetId) fail('PACKAGE_MANIFEST_RECORD_MISMATCH', 'Package Manifest source does not match the Registry record.', 'package.manifest');
    if (manifest.hash !== record.manifestHash) fail('PACKAGE_MANIFEST_RECORD_MISMATCH', 'Package Manifest Hash does not match the Registry record.', 'package.manifest.hash');
    return { valid: true, value: clone(record), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [{ code: error.code || 'PACKAGE_RECORD_INVALID', severity: 'error', message: error.message, field: error.field || null }] };
  }
}

export function createPackageRegistry({
  clock = null,
  idGenerator = null,
  featureFlagEvaluator = null,
  permissionEvaluator = null,
  graphResolver = null,
  blobVerifier = null,
  manifestHasher = null,
  packageAssembler = null,
  packageDependencyResolver = null,
} = {}) {
  const state = {
    packages: Object.create(null),
    attempts: Object.create(null),
    idempotency: Object.create(null),
    blobs: Object.create(null),
    events: [],
  };
  const now = () => {
    if (typeof clock !== 'function') fail('PACKAGE_CLOCK_ADAPTER_MISSING', 'A host clock adapter is required.');
    return text(clock(), 'createdAt', 128);
  };
  const nextId = (kind) => {
    if (typeof idGenerator !== 'function') fail('PACKAGE_ID_ADAPTER_MISSING', 'A host ID adapter is required.');
    return typedId(idGenerator(kind), `${kind}Id`);
  };
  const flag = (flagId, action, command = null) => {
    if (typeof featureFlagEvaluator !== 'function') fail('PACKAGE_FLAG_EVALUATOR_MISSING', 'Package Feature Flag evaluation must be injected.');
    const result = featureFlagEvaluator({ flagId, action, command: command ? clone(command) : null });
    if (!result || result.enabled !== true || result.decision !== 'enabled') fail(result?.code === 'FEATURE_FLAG_KILL_SWITCH' ? 'PACKAGE_KILL_SWITCH' : 'PACKAGE_FLAG_OFF', 'Package Feature Flag denied this operation.', null, { flagId, action, decision: result?.decision || 'unknown' });
    return clone(result);
  };
  const permission = (command, action, graph = null) => {
    if (typeof permissionEvaluator !== 'function') fail('PACKAGE_AUTHZ_EVALUATOR_REQUIRED', 'Package operations require a server-owned Authorization evaluator.');
    const expected = { principalId: command.actorId, resourceType: 'PACKAGE', resourceId: command.packageId, action, capability: action, tenantId: command.permissionDecision?.tenantId, correlationId: command.correlationId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION };
    const resolved = resolveAuthorizationProofSync({
      expected,
      callerProof: command.permissionDecision,
      authorizationEvaluator: (input) => permissionEvaluator({ principalId: input.principalId, actorId: input.principalId, ownerId: command.ownerId, action: input.action, capability: input.capability, packageId: input.resourceId, resourceType: input.resourceType, resourceId: input.resourceId, sourceProjectId: command.sourceProjectId, rootAssetId: command.rootAssetId, graph: graph ? clone(graph) : null, tenantId: input.tenantId, correlationId: input.correlationId, source: 'server' }),
    });
    if (resolved.decision !== 'allow') fail('PACKAGE_PERMISSION_DENIED', 'The server AuthorizationProof denied the Package operation.');
  };
  const emit = (eventType, command, metadata = {}) => {
    const event = {
      eventId: nextId('package-event'),
      eventType,
      packageId: command.packageId,
      packageVersion: command.packageVersion,
      correlationId: command.correlationId,
      at: now(),
      metadata: boundedMetadata(metadata, 'event.metadata'),
    };
    state.events.push(event);
    return clone(event);
  };
  const attemptKey = (command) => `${command.packageId}@${command.packageVersion}`;
  const requestFingerprint = (command) => stableJson({ ...command, idempotencyKey: null, correlationId: null, createdAt: null, expectedContentHash: null, expectedManifestHash: null });
  const cancellationRequested = (adapter, phase) => {
    if (!adapter) return false;
    if (adapter.cancelled === true) return true;
    if (typeof adapter === 'function') return adapter({ phase }) === true;
    if (typeof adapter.isCancelled === 'function') return adapter.isCancelled({ phase }) === true;
    return false;
  };
  const checkpoint = (adapter, phase, command) => {
    if (cancellationRequested(adapter, phase)) fail('PACKAGE_CANCELLED', 'Package materialization was cancelled before commit.', phase, { packageId: command.packageId, packageVersion: command.packageVersion });
  };
  const requirePackageDependencySafety = (dependencies, chain = [], depth = 0) => {
    if (depth > PACKAGE_LIMITS.packageRecursionDepth) fail('PACKAGE_NESTED_RECURSION', 'Nested Package recursion exceeds the safety limit.');
    for (const dependency of dependencies) {
      const key = `${dependency.packageId}@${dependency.packageVersion}`;
      if (chain.includes(key)) fail('PACKAGE_NESTED_RECURSION', 'Nested Package dependency recursion is forbidden.', 'packageDependencies');
      if (dependency.required && dependency.accessGranted !== true) fail('PACKAGE_DEPENDENCY_UNAUTHORIZED', 'Required Package dependency is unauthorized.', 'packageDependencies');
      if (typeof packageDependencyResolver === 'function') {
        const resolved = packageDependencyResolver({ packageId: dependency.packageId, packageVersion: dependency.packageVersion, source: 'server' });
        if (!resolved || resolved.ok !== true) fail('PACKAGE_DEPENDENCY_MISSING', 'Required Package dependency could not be resolved.', 'packageDependencies');
        if (dependency.contentHash !== null && resolved.contentHash && dependency.contentHash !== resolved.contentHash) fail('PACKAGE_HASH_MISMATCH', 'Nested Package content Hash does not match.', 'packageDependencies');
        const nested = Array.isArray(resolved.dependencies) ? resolved.dependencies.map((item) => normalizePackageDependency(item, 'resolvedPackageDependency')) : [];
        requirePackageDependencySafety(nested, [...chain, key], depth + 1);
      } else if (dependency.dependencies.length) requirePackageDependencySafety(dependency.dependencies, [...chain, key], depth + 1);
    }
  };
  const buildManifest = (command, graph, entries, dependencyLock, optionalDependencies, packageDependencySnapshot) => {
    const toolReferences = [...new Set(entries.map((entry) => `${entry.toolId}@${entry.formatVersion}`))].sort();
    const manifest = {
      packageId: command.packageId,
      packageVersion: command.packageVersion,
      schemaVersion: PACKAGE_REGISTRY_SCHEMA_VERSION,
      manifestVersion: command.manifestVersion,
      packageKind: command.packageKind,
      materializationMode: command.materializationMode,
      sourceProjectId: command.sourceProjectId,
      rootAssetId: command.rootAssetId,
      toolReferences,
      includedAssetRevisions: entries,
      dependencyGraphSnapshot: {
        projectId: graph.project.projectId,
        rootAssetId: graph.rootAsset.assetId,
        edges: graph.edges.map((edge) => ({ ...edge, providerRevisionId: edge.providerRevisionId, lockPolicy: 'PINNED' })),
      },
      dependencyLock: dependencyLock,
      requiredPackageDependencies: packageDependencySnapshot.filter((item) => item.required),
      optionalDependencies,
      compatibility: command.compatibility,
      hash: null,
      size: null,
      licenseReference: command.licenseReference,
      provenanceReference: command.provenanceReference,
      createdAt: command.createdAt,
      security: {
        executableAssetsSandboxed: true,
        activeContentRejected: true,
        sourceProjectMutation: false,
      },
      streaming: PACKAGE_STREAMING_CONTRACT,
    };
    return manifest;
  };
  const validateAssemblyResult = (result, manifest, command) => {
    if (!isObject(result)) fail('PACKAGE_ASSEMBLY_RESULT_INVALID', 'Package assembler must return metadata only.');
    const allowed = new Set(['contentHash', 'byteLength', 'uncompressedByteLength', 'fileCount', 'storageLocator', 'manifestHash', 'verified', 'deduplicatedContentHashes']);
    for (const key of Object.keys(result)) if (!allowed.has(key)) fail('PACKAGE_ASSEMBLY_BLOB_FORBIDDEN', `Package assembler returned forbidden field: ${key}.`, key);
    const contentHash = hash(result.contentHash, 'assembly.contentHash');
    const manifestHash = hash(result.manifestHash, 'assembly.manifestHash');
    const byteLength = result.byteLength;
    const uncompressedByteLength = result.uncompressedByteLength;
    const fileCount = result.fileCount;
    if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > PACKAGE_LIMITS.compressedBytes) fail('PACKAGE_BYTE_LENGTH_INVALID', 'Assembled Package size is invalid.');
    if (!Number.isSafeInteger(uncompressedByteLength) || uncompressedByteLength < 0 || uncompressedByteLength > PACKAGE_LIMITS.uncompressedBytes) fail('PACKAGE_UNCOMPRESSED_SIZE_EXCEEDED', 'Uncompressed Package size exceeds the safety limit.');
    if (!Number.isSafeInteger(fileCount) || fileCount < 0 || fileCount > PACKAGE_LIMITS.fileCount) fail('PACKAGE_FILE_COUNT_EXCEEDED', 'Package file count exceeds the safety limit.');
    if (result.verified !== true) fail('PACKAGE_VERIFICATION_FAILED', 'Package assembler did not provide verified output.');
    if (command.expectedContentHash !== null && command.expectedContentHash !== contentHash) fail('PACKAGE_HASH_MISMATCH', 'Assembled Package Hash does not match the expected Hash.', 'expectedContentHash');
    if (command.expectedManifestHash !== null && command.expectedManifestHash !== manifestHash) fail('PACKAGE_MANIFEST_TAMPERED', 'Assembled Manifest Hash does not match the expected Hash.', 'expectedManifestHash');
    const locator = normalizeLocator(result.storageLocator, 'assembly.storageLocator');
    if (!locator) fail('PACKAGE_STORAGE_LOCATOR_MISSING', 'Verified Package output requires a Storage Locator.');
    const deduplicatedContentHashes = Array.isArray(result.deduplicatedContentHashes) ? result.deduplicatedContentHashes.map((item, index) => hash(item, `assembly.deduplicatedContentHashes[${index}]`)) : [];
    return { contentHash, manifestHash, byteLength, uncompressedByteLength, fileCount, locator, deduplicatedContentHashes };
  };

  function materializePackage(input = {}) {
    let command = null;
    let attempt = null;
    try {
      command = normalizeCommand(input.command || input);
      const key = attemptKey(command);
      const existingIdempotency = state.idempotency[command.idempotencyKey];
      const fingerprint = requestFingerprint(command);
      if (existingIdempotency) {
        if (existingIdempotency.fingerprint !== fingerprint) return createAttemptResult(command, 'PACKAGE_IDEMPOTENCY_CONFLICT', 'Idempotency key was reused with different Package data.');
        return { ...clone(existingIdempotency.result), idempotentReplay: true };
      }
      if (state.packages[key]) return createAttemptResult(command, 'PACKAGE_DUPLICATE', 'Package ID and Version already exist.');
      if (state.attempts[key]?.status === 'BUILDING' || state.attempts[key]?.status === 'VERIFYING') return createAttemptResult(command, 'PACKAGE_MATERIALIZE_DUPLICATE', 'A Package materialization is already in progress.');
      if (typeof command.dependencySnapshot === 'undefined') fail('PACKAGE_GRAPH_MISSING', 'A Project/Asset Graph Snapshot is required.');
      flag(PACKAGE_FLAGS.write, 'write', command);
      flag(PACKAGE_FLAGS.materialize, 'write', command);
      if (command.materializationMode === 'PORTABLE') flag(PACKAGE_FLAGS.portable, 'write', command);
      if (command.materializationMode === 'PORTABLE') flag(PACKAGE_FLAGS.storageUpload, 'write', command);
      if (command.legacyPxd) flag(PACKAGE_FLAGS.legacyPxd, 'read', command);
      permission({ ...command, permissionDecision: input.permissionDecision || command.permissionDecision }, 'materialize');
      attempt = { key, packageId: command.packageId, packageVersion: command.packageVersion, status: 'BUILDING', startedAt: now(), correlationId: command.correlationId };
      state.attempts[key] = attempt;
      emit('PACKAGE_BUILD_STARTED', command, { materializationMode: command.materializationMode, packageKind: command.packageKind });
      checkpoint(input.cancellationAdapter, 'graph-snapshot', command);
      if (typeof graphResolver !== 'function') fail('PACKAGE_GRAPH_RESOLVER_MISSING', 'Project/Asset Graph resolution must be injected.');
      const graph = validateGraph(graphResolver({ command: clone(command), actorId: command.actorId, source: 'server' }));
      if (graph.project.projectId !== command.sourceProjectId) fail('PACKAGE_PROJECT_MISMATCH', 'Graph Project does not match sourceProjectId.', 'sourceProjectId');
      if (graph.rootAsset.assetId !== command.rootAssetId) fail('PACKAGE_ROOT_ASSET_MISMATCH', 'Graph root Asset does not match rootAssetId.', 'rootAssetId');
      if (detectCycle(graph.edges)) fail('PACKAGE_DEPENDENCY_CYCLE', 'Package dependency closure contains a circular dependency.');
      requirePackageDependencySafety([...graph.packageDependencies, ...command.packageDependencies]);
      const allAssets = graph.allAssets;
      const requiredAssets = allAssets.filter((asset) => asset.required);
      for (const asset of requiredAssets) {
        if (!asset.assetId || !asset.revisionId) fail('PACKAGE_MISSING_REQUIRED_ASSET', 'Required Asset or Revision is missing.');
        if (asset.portableAllowed !== true && command.materializationMode === 'PORTABLE') fail('PACKAGE_PORTABLE_PERMISSION_REQUIRED', 'A required Asset cannot be embedded in a Portable Package.', 'dependencySnapshot.assets');
      }
      for (const asset of allAssets) {
        if (asset.sourcePolicy === 'LIVE') asset.sourcePolicy = 'LIVE';
        if (asset.lockPolicy !== 'PINNED') fail('PACKAGE_DEPENDENCY_LOCK_INVALID', 'Package Asset entries must resolve to PINNED lock entries.');
        if (typeof blobVerifier !== 'function') fail('PACKAGE_BLOB_VERIFIER_MISSING', 'Blob verification must be injected before Materialization.');
        const verified = blobVerifier({ asset: clone(asset), mode: command.materializationMode, source: 'server' });
        if (!verified || verified.verified !== true) fail(verified?.code || 'PACKAGE_BLOB_MISSING', 'Required Blob/Revision could not be verified.', 'dependencySnapshot.assets');
        if (verified.contentHash !== asset.contentHash) fail('PACKAGE_HASH_MISMATCH', 'Verified Asset Hash does not match the Graph Snapshot.', 'contentHash');
        if (verified.byteLength !== asset.byteLength) fail('PACKAGE_SIZE_MISMATCH', 'Verified Asset size does not match the Graph Snapshot.', 'byteLength');
        if (verified.contentType && verified.contentType !== asset.contentType) fail('PACKAGE_MIME_MISMATCH', 'Verified Asset MIME does not match the Graph Snapshot.', 'contentType');
      }
      checkpoint(input.cancellationAdapter, 'dependency-resolution', command);
      const existingHashes = new Set(Object.keys(state.blobs));
      const entries = allAssets.map((asset) => ({ ...asset, deduplicated: existingHashes.has(asset.contentHash) }));
      const dependencyLock = entries.filter((entry) => entry.required).map((entry) => ({
        assetId: entry.assetId,
        revisionId: entry.revisionId,
        contentHash: entry.contentHash,
        byteLength: entry.byteLength,
        required: true,
        sourcePolicy: entry.sourcePolicy,
        lockPolicy: 'PINNED',
        compatibility: {},
      }));
      const optionalDependencies = entries.filter((entry) => !entry.required).map((entry) => ({
        assetId: entry.assetId,
        revisionId: entry.revisionId,
        contentHash: entry.contentHash,
        required: false,
        materialization: command.materializationMode === 'PORTABLE' && entry.portableAllowed ? 'EMBEDDED_OPTIONAL' : 'THIN_REFERENCE',
      }));
      const packageDependencySnapshot = [...graph.packageDependencies, ...command.packageDependencies].map((item) => ({ ...item, dependencies: [] }));
      const manifest = buildManifest(command, graph, entries, dependencyLock, optionalDependencies, packageDependencySnapshot);
      if (typeof manifestHasher !== 'function') fail('PACKAGE_MANIFEST_HASHER_MISSING', 'Manifest hashing must be injected.');
      const canonicalManifest = clone(manifest);
      canonicalManifest.hash = null;
      canonicalManifest.size = null;
      const manifestHash = hash(manifestHasher(canonicalManifest), 'manifestHash');
      manifest.hash = manifestHash;
      manifest.size = null;
      attempt.status = 'VERIFYING';
      checkpoint(input.cancellationAdapter, 'manifest-created', command);
      if (typeof packageAssembler !== 'function') fail('PACKAGE_ASSEMBLER_MISSING', 'Package assembly must be injected.');
      const assembly = packageAssembler({
        mode: command.materializationMode,
        manifest: clone(manifest),
        entries: clone(entries),
        dependencyLock: clone(dependencyLock),
        stream: PACKAGE_STREAMING_CONTRACT,
        deduplicatedContentHashes: entries.filter((entry) => entry.deduplicated).map((entry) => entry.contentHash),
        source: 'server',
      });
      checkpoint(input.cancellationAdapter, 'assembly-complete', command);
      const artifact = validateAssemblyResult(assembly, manifest, command);
      if (artifact.manifestHash !== manifestHash) fail('PACKAGE_MANIFEST_TAMPERED', 'Assembler Manifest Hash does not match the canonical Manifest.', 'manifestHash');
      manifest.size = artifact.uncompressedByteLength;
      manifest.hash = artifact.manifestHash;
      checkpoint(input.cancellationAdapter, 'before-commit', command);
      const record = {
        packageId: command.packageId,
        packageKind: command.packageKind,
        packageVersion: command.packageVersion,
        schemaVersion: PACKAGE_REGISTRY_SCHEMA_VERSION,
        ownerType: command.ownerType,
        ownerId: command.ownerId,
        sourceProjectId: command.sourceProjectId,
        rootAssetId: command.rootAssetId,
        manifestVersion: command.manifestVersion,
        lifecycleState: 'READY',
        createdBy: command.actorId,
        createdAt: command.createdAt,
        contentHash: artifact.contentHash,
        byteLength: artifact.byteLength,
        storageLocator: artifact.locator,
        dependencySnapshotHash: manifestHash,
        recordVersion: PACKAGE_RECORD_VERSION_START,
        materializationMode: command.materializationMode,
        manifestHash: artifact.manifestHash,
        manifest,
        compatibility: command.compatibility,
        licenseReference: command.licenseReference,
        provenanceReference: command.provenanceReference,
      };
      const recordValidation = validatePackageRecord(record);
      if (!recordValidation.valid) fail('PACKAGE_RECORD_INVALID', 'Verified Package record failed its final validation.', null, { diagnostics: recordValidation.diagnostics });
      state.packages[key] = record;
      for (const entry of entries) {
        state.blobs[entry.contentHash] ||= { contentHash: entry.contentHash, byteLength: entry.byteLength, contentType: entry.contentType, packageCount: 0 };
        state.blobs[entry.contentHash].packageCount += 1;
      }
      state.idempotency[command.idempotencyKey] = { fingerprint, result: { ok: true, package: record, idempotentReplay: false } };
      attempt.status = 'READY';
      attempt.finishedAt = now();
      emit('PACKAGE_MATERIALIZED', command, { materializationMode: command.materializationMode, contentHash: artifact.contentHash, manifestHash: artifact.manifestHash, byteLength: artifact.byteLength });
      emit('PACKAGE_VERIFIED', command, { contentHash: artifact.contentHash, manifestHash: artifact.manifestHash });
      return { ok: true, package: clone(record), materialization: { contentHash: artifact.contentHash, manifestHash: artifact.manifestHash, byteLength: artifact.byteLength, deduplicatedContentHashes: artifact.deduplicatedContentHashes }, idempotentReplay: false };
    } catch (error) {
      if (attempt) {
        attempt.status = error.code === 'PACKAGE_CANCELLED' ? 'FAILED' : (error.code === 'PACKAGE_MANIFEST_TAMPERED' || error.code === 'PACKAGE_ACTIVE_CONTENT_FORBIDDEN' ? 'QUARANTINED' : 'FAILED');
        attempt.finishedAt = (() => { try { return now(); } catch { return null; } })();
        attempt.diagnostic = { code: error.code || 'PACKAGE_MATERIALIZE_FAILED', severity: 'error', message: 'Package materialization did not commit.', metadata: error.metadata || {} };
        if (command) emit(attempt.status === 'QUARANTINED' ? 'PACKAGE_QUARANTINED' : 'PACKAGE_FAILED', command, { code: error.code || 'PACKAGE_MATERIALIZE_FAILED' });
      }
      if (!command) return { ok: false, diagnostics: [{ code: error.code || 'PACKAGE_COMMAND_INVALID', severity: 'error', message: error.message }] };
      return createAttemptResult(command, error.code || 'PACKAGE_MATERIALIZE_FAILED', error.message, error.metadata || {});
    }
  }

  function getPackage({ packageId, packageVersion, actorId, permissionDecision } = {}) {
    try {
      flag(PACKAGE_FLAGS.read, 'read', { packageId, packageVersion });
      const key = `${typedId(packageId, 'packageId')}@${packageVersionValue(packageVersion)}`;
      const record = state.packages[key];
      if (!record) return { ok: false, diagnostics: [{ code: 'PACKAGE_UNKNOWN_ID', severity: 'error', message: 'Package was not found.', metadata: { httpStatus: 404 } }] };
      if (typeof permissionEvaluator !== 'function') return { ok: false, diagnostics: [{ code: 'PACKAGE_AUTHZ_EVALUATOR_REQUIRED', severity: 'error', message: 'Package read requires a server-owned Authorization evaluator.', metadata: { httpStatus: 403 } }] };
      const resolved = resolveAuthorizationProofSync({
        expected: { principalId: typedId(actorId, 'actorId'), resourceType: 'PACKAGE', resourceId: record.packageId, action: 'read', capability: 'read', tenantId: permissionDecision?.tenantId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
        callerProof: permissionDecision,
        authorizationEvaluator: (input) => permissionEvaluator({ principalId: input.principalId, actorId: input.principalId, ownerId: record.ownerId, action: input.action, capability: input.capability, resourceType: input.resourceType, resourceId: input.resourceId, packageId: input.resourceId, packageVersion: record.packageVersion, tenantId: input.tenantId, correlationId: input.correlationId, source: 'server' }),
      });
      if (resolved.decision !== 'allow') return { ok: false, diagnostics: [{ code: 'PACKAGE_PERMISSION_DENIED', severity: 'error', message: 'Package read was denied.', metadata: { httpStatus: 403 } }] };
      return { ok: true, package: clone(record) };
    } catch (error) {
      return { ok: false, diagnostics: [{ code: error.code || 'PACKAGE_READ_FAILED', severity: 'error', message: error.message }] };
    }
  }

  function archivePackage({ packageId, packageVersion, actorId, expectedRecordVersion, permissionDecision, correlationId, idempotencyKey, createdAt } = {}) {
    try {
      flag(PACKAGE_FLAGS.write, 'write', { packageId, packageVersion });
      const id = typedId(packageId, 'packageId');
      const ver = packageVersionValue(packageVersion);
      const key = `${id}@${ver}`;
      const record = state.packages[key];
      if (!record) return { ok: false, diagnostics: [{ code: 'PACKAGE_UNKNOWN_ID', severity: 'error', message: 'Package was not found.' }] };
      if (typeof permissionEvaluator !== 'function') return { ok: false, diagnostics: [{ code: 'PACKAGE_AUTHZ_EVALUATOR_REQUIRED', severity: 'error', message: 'Package archive requires a server-owned Authorization evaluator.' }] };
      const resolved = resolveAuthorizationProofSync({
        expected: { principalId: typedId(actorId, 'actorId'), resourceType: 'PACKAGE', resourceId: id, action: 'archive', capability: 'archive', tenantId: permissionDecision?.tenantId, correlationId: correlationId || undefined, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
        callerProof: permissionDecision,
        authorizationEvaluator: (input) => permissionEvaluator({ principalId: input.principalId, actorId: input.principalId, ownerId: record.ownerId, action: input.action, capability: input.capability, resourceType: input.resourceType, resourceId: input.resourceId, packageId: input.resourceId, packageVersion: ver, tenantId: input.tenantId, correlationId: input.correlationId, source: 'server' }),
      });
      if (resolved.decision !== 'allow') return { ok: false, diagnostics: [{ code: 'PACKAGE_PERMISSION_DENIED', severity: 'error', message: 'Package archive was denied.' }] };
      if (expectedRecordVersion !== record.recordVersion) return { ok: false, diagnostics: [{ code: 'PACKAGE_RECORD_VERSION_CONFLICT', severity: 'error', message: 'Package record version is stale.' }] };
      if (record.lifecycleState !== 'READY') return { ok: false, diagnostics: [{ code: 'PACKAGE_LIFECYCLE_INVALID', severity: 'error', message: 'Only READY Packages may be archived.' }] };
      record.lifecycleState = 'ARCHIVED';
      record.recordVersion += 1;
      state.events.push({ eventId: nextId('package-event'), eventType: 'PACKAGE_ARCHIVED', packageId: id, packageVersion: ver, correlationId: typedId(correlationId, 'correlationId'), at: text(createdAt || now(), 'createdAt', 128), metadata: {} });
      return { ok: true, package: clone(record) };
    } catch (error) {
      return { ok: false, diagnostics: [{ code: error.code || 'PACKAGE_ARCHIVE_FAILED', severity: 'error', message: error.message }] };
    }
  }

  function toMarketReference({ packageId, packageVersion, actorId, permissionDecision } = {}) {
    const result = getPackage({ packageId, packageVersion, actorId, permissionDecision });
    if (!result.ok) return result;
    const record = result.package;
    return { ok: true, marketReference: { packageId: record.packageId, packageVersion: record.packageVersion, packageKind: record.packageKind, manifest: clone(record.manifest), contentHash: record.contentHash, byteLength: record.byteLength, compatibility: clone(record.compatibility), licenseReference: clone(record.licenseReference), provenanceReference: clone(record.provenanceReference) } };
  }

  function snapshot() {
    return clone({ schemaVersion: PACKAGE_REGISTRY_SCHEMA_VERSION, packages: state.packages, attempts: state.attempts, blobs: state.blobs, events: state.events, flags: PACKAGE_FLAGS, storageBoundary: PACKAGE_STORAGE_BOUNDARY, streaming: PACKAGE_STREAMING_CONTRACT });
  }

  return Object.freeze({ materializePackage, getPackage, archivePackage, toMarketReference, snapshot });
}

function packageVersionValue(value) {
  return packageVersion(value, 'packageVersion');
}

export const PACKAGE_REGISTRY_CONTRACT = Object.freeze({
  schemaVersion: PACKAGE_REGISTRY_SCHEMA_VERSION,
  kinds: PACKAGE_KINDS,
  materializationModes: PACKAGE_MATERIALIZATION_MODES,
  lifecycleStates: PACKAGE_LIFECYCLE_STATES,
  referencePolicies: PACKAGE_REFERENCE_POLICIES,
  events: PACKAGE_EVENT_TYPES,
  flags: PACKAGE_FLAGS,
  streaming: PACKAGE_STREAMING_CONTRACT,
  storageBoundary: PACKAGE_STORAGE_BOUNDARY,
});
