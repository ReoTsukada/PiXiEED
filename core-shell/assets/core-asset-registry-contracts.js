/*
 * WP-092 Asset Registry Core.
 *
 * This is an unloaded, framework-free Core contract. It owns Asset identity, immutable
 * AssetRevision metadata, verified content-addressed Blob references, provenance, dependencies,
 * and reference policies. It does not load DOM/Canvas/editor/network globals and it is not wired
 * into the current PiXiEEDraw, PXD, PiXiSYNC, Market, or SNS paths.
 */

import { AUTHORIZATION_PROOF_POLICY_VERSION, normalizeAuthorizationProof, resolveAuthorizationProofSync } from './core-authorization-proof-contracts.js';

export const ASSET_REGISTRY_SCHEMA_VERSION = 1;
export const ASSET_RECORD_VERSION_START = 1;
export const ASSET_REVISION_RECORD_VERSION_START = 1;

export const ASSET_KINDS = Object.freeze([
  'RASTER_IMAGE',
  'ANIMATION',
  'PALETTE',
  'TILE_SET',
  'SPRITE_SHEET',
  'AUDIO',
  'MUSIC_PROJECT',
  'SOUND_EFFECT',
  'GAME_SCENE',
  'GAME_COMPONENT',
  'GAME_UI',
  'SCRIPT',
  'VISUAL_GRAPH',
  'EVENT_SHEET',
  'VIDEO_TIMELINE',
  'PACKAGE',
  'THUMBNAIL_PREVIEW',
]);

export const ASSET_VISIBILITIES = Object.freeze(['PRIVATE', 'UNLISTED', 'PUBLIC_PREVIEW']);
export const ASSET_LIFECYCLE_STATES = Object.freeze(['ACTIVE', 'ARCHIVED', 'TRASHED', 'QUARANTINED']);
export const ASSET_OWNER_TYPES = Object.freeze(['USER', 'TEAM']);
export const ASSET_REFERENCE_POLICIES = Object.freeze(['LIVE', 'PINNED', 'REVIEW', 'FORKED']);
export const ASSET_PROVENANCE_KINDS = Object.freeze(['ORIGINAL', 'DERIVED_FROM', 'FORKED_FROM', 'IMPORTED_FROM', 'GENERATED_FROM']);
export const ASSET_VERIFICATION_STATES = Object.freeze(['VERIFIED', 'MISSING', 'QUARANTINED']);

export const ASSET_RELATION_TYPES = Object.freeze([
  'DEPENDS_ON',
  'DERIVED_FROM',
  'USES_PALETTE',
  'USES_ANIMATION',
  'EXPORTS_TO',
  'RUNTIME_BINDS',
  'CONTAINS',
  'REPLACES',
  'VERSION_OF',
  'LICENSED_FROM_REFERENCE',
]);
export const CYCLE_ALLOWED_RELATIONS = Object.freeze(['RUNTIME_BINDS']);

export const ASSET_COMMAND_TYPES = Object.freeze([
  'CREATE_ASSET',
  'CREATE_REVISION',
  'SET_HEAD_REVISION',
  'ADD_DEPENDENCY',
  'REMOVE_DEPENDENCY',
  'CHANGE_REFERENCE_POLICY',
  'ARCHIVE_ASSET',
  'RESTORE_ASSET',
  'TRASH_ASSET',
  'QUARANTINE_ASSET',
  'FORK_ASSET',
]);

export const ASSET_EVENT_TYPES = Object.freeze([
  'ASSET_CREATED',
  'ASSET_REVISION_CREATED',
  'ASSET_HEAD_CHANGED',
  'ASSET_DEPENDENCY_CHANGED',
  'ASSET_ARCHIVED',
  'ASSET_RESTORED',
  'ASSET_TRASHED',
  'ASSET_QUARANTINED',
  'ASSET_MISSING',
  'ASSET_COMPATIBILITY_CHANGED',
  'ASSET_LIVE_REFERENCE_UPDATED',
  'ASSET_UPDATE_AVAILABLE',
]);

export const ASSET_REGISTRY_FLAGS = Object.freeze({
  read: 'asset-registry-read',
  write: 'asset-registry-write',
  revisionWrite: 'asset-revision-write',
  dependencyLive: 'asset-dependency-live',
  legacyAdapter: 'asset-legacy-adapter',
  storageUpload: 'asset-storage-upload',
});

export const ASSET_REGISTRY_LIMITS = Object.freeze({
  typedId: 128,
  name: 120,
  description: 1024,
  tag: 64,
  tags: 24,
  customKeys: 24,
  customKey: 64,
  customValue: 256,
  metadataBytes: 32768,
  hash: 64,
  mime: 128,
  formatId: 64,
  formatVersion: 32,
  storageObjectKey: 512,
  bucket: 128,
  legacyBindings: 16,
  dependencies: 256,
  pageSize: 100,
});

export const ASSET_STORAGE_BOUNDARY = Object.freeze({
  registry: 'server-database-asset-and-revision-metadata',
  indexedDb: 'asset-index-revision-index-pending-upload-offline-queue-metadata-mirror',
  opfs: 'local-blob-tile-chunk-audio-waveform-preview-cache-revision-payload',
  objectStorage: 'immutable-blob-pxd-package-export-audio-game-preview-thumbnail',
  excludedFromRegistry: Object.freeze([
    'blob-bytes',
    'base64',
    'data-url',
    'full-editor-state',
    'journal',
    'checkpoint',
    'post-content',
    'purchase-entitlement',
    'license-body',
    'royalty-payment-payout',
    'commission-body',
  ]),
});

export const REGISTERED_ASSET_TOOLS = Object.freeze([
  'pixiedraw',
  'pixiedraw2',
  'pixieaudio',
  'pixigame',
  'pixfind',
  'camera-image',
  'registered-tool',
]);
export const REGISTERED_ASSET_FORMATS = Object.freeze([
  'pxd',
  'pixipackage',
  'png',
  'gif',
  'webp',
  'pixiaudio-project',
  'wav',
  'ogg',
  'pixigame-project',
  'image-project',
  'video-timeline',
  'registered-asset',
]);

export const LEGACY_ASSET_KIND_ALIASES = Object.freeze({
  'pixel.sprite': 'RASTER_IMAGE',
  'pixel.palette': 'PALETTE',
  'animation.clip': 'ANIMATION',
  'tile.tileset': 'TILE_SET',
  'audio.clip': 'AUDIO',
  'audio.song': 'MUSIC_PROJECT',
  'game.scene': 'GAME_SCENE',
  'game.behavior': 'GAME_COMPONENT',
  'ui.document': 'GAME_UI',
  'extension.package': 'PACKAGE',
  'export.profile': 'PACKAGE',
  'build.artifact': 'PACKAGE',
});

const ASSET_RECORD_KEYS = new Set([
  'assetId', 'assetKind', 'ownerType', 'ownerId', 'sourceProjectId', 'createdBy', 'visibility',
  'lifecycleState', 'headRevisionId', 'provenance', 'legacyBindings', 'metadata', 'schemaVersion',
  'recordVersion', 'createdAt', 'updatedAt',
]);
const REVISION_KEYS = new Set([
  'revisionId', 'assetId', 'parentRevisionId', 'contentHash', 'contentType', 'byteLength',
  'storageLocator', 'toolId', 'formatId', 'formatVersion', 'dependencySnapshotId', 'createdBy',
  'createdAt', 'verificationState', 'recordVersion', 'immutable',
]);
const DEPENDENCY_KEYS = new Set([
  'edgeId', 'consumerAssetId', 'providerAssetId', 'providerRevisionId', 'resolvedRevisionId',
  'candidateRevisionId', 'derivedAssetId', 'relationType', 'referencePolicy', 'required',
  'compatibilityConstraint', 'recordVersion', 'createdAt', 'updatedAt',
]);
const COMMAND_KEYS = new Set([
  'commandId', 'commandType', 'schemaVersion', 'assetId', 'actorId', 'correlationId',
  'expectedRecordVersion', 'idempotencyKey', 'permissionDecision', 'createdAt', 'payload',
]);
const METADATA_KEYS = new Set(['description', 'tags', 'custom', 'locale']);
const STORAGE_KEYS = new Set(['provider', 'bucket', 'objectKey']);
const PROVENANCE_KEYS = new Set(['kind', 'sourceAssetId', 'sourceRevisionId', 'sourceProjectId', 'sourceSystemId']);
const DEPENDENCY_CONSTRAINT_KEYS = new Set(['toolIds', 'assetKinds', 'formatIds', 'minFormatVersion', 'maxFormatVersion']);
const PERMISSION_KEYS = new Set(['ok', 'decision', 'source', 'capability', 'correlationId']);
const FORBIDDEN_KEY_PARTS = [
  'blob', 'base64', 'dataurl', 'pixeldata', 'audiodata', 'journal', 'checkpoint', 'editorstate',
  'operationpayload', 'jwt', 'secret', 'email', 'commissionbody', 'postbody', 'purchase',
  'entitlement', 'royalty', 'payment', 'payout', 'licensebody',
];
const LIFECYCLE_TRANSITIONS = Object.freeze({
  ACTIVE: Object.freeze(['ARCHIVED', 'TRASHED', 'QUARANTINED']),
  ARCHIVED: Object.freeze(['ACTIVE', 'TRASHED', 'QUARANTINED']),
  TRASHED: Object.freeze(['ACTIVE', 'QUARANTINED']),
  QUARANTINED: Object.freeze([]),
});

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function diagnostic(code, message, path = null, metadata = {}) {
  return { code, severity: 'error', message, path, metadata: clone(metadata) };
}

function failure(code, message, path = null, metadata = {}) {
  return { ok: false, diagnostics: [diagnostic(code, message, path, metadata)] };
}

function success(result, diagnostics = []) {
  return { ok: true, result: clone(result), diagnostics: clone(diagnostics) };
}

function text(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) throw new Error(`${field} must be a non-empty string <= ${maxLength} characters.`);
  return value.normalize('NFC').trim();
}

function typedId(value, field, maxLength = ASSET_REGISTRY_LIMITS.typedId) {
  const normalized = text(value, field, maxLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(normalized)) throw new Error(`${field} is not a valid stable typed ID.`);
  return normalized;
}

function enumValue(value, field, values) {
  if (!values.includes(value)) throw new Error(`${field} is unsupported: ${String(value)}.`);
  return value;
}

function integer(value, field, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${field} must be a safe integer >= ${minimum}.`);
  return value;
}

function timestamp(value, field) {
  const normalized = text(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(normalized) || !Number.isFinite(Date.parse(normalized))) throw new Error(`${field} must be an ISO-8601 UTC timestamp.`);
  return normalized;
}

function keyIsForbidden(key) {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/gu, '');
  return FORBIDDEN_KEY_PARTS.some(part => normalized.includes(part));
}

function assertSafeValue(value, path, depth = 0) {
  if (depth > 4) throw new Error(`${path} is too deeply nested.`);
  if (typeof value === 'string') {
    if (value.length > ASSET_REGISTRY_LIMITS.customValue) throw new Error(`${path} is too large.`);
    if (/^data:/iu.test(value)) throw new Error(`${path} cannot contain a Data URL.`);
    return;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return;
  if (Array.isArray(value)) {
    if (value.length > ASSET_REGISTRY_LIMITS.tags) throw new Error(`${path} contains too many values.`);
    value.forEach((child, index) => assertSafeValue(child, `${path}[${index}]`, depth + 1));
    return;
  }
  if (!isObject(value)) throw new Error(`${path} must be JSON-compatible metadata.`);
  for (const [key, child] of Object.entries(value)) {
    if (keyIsForbidden(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`${path}.${key} is not allowed.`);
    assertSafeValue(child, `${path}.${key}`, depth + 1);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > ASSET_REGISTRY_LIMITS.metadataBytes) throw new Error(`${path} exceeds the metadata size limit.`);
}

function normalizeMetadata(value = {}) {
  if (!isObject(value)) throw new Error('metadata must be an object.');
  for (const key of Object.keys(value)) if (!METADATA_KEYS.has(key)) throw new Error(`metadata.${key} is unsupported.`);
  assertSafeValue(value, 'metadata');
  const normalized = {};
  if (value.description !== undefined) normalized.description = text(value.description, 'metadata.description', ASSET_REGISTRY_LIMITS.description);
  if (value.locale !== undefined) normalized.locale = text(value.locale, 'metadata.locale', 32);
  if (value.tags !== undefined) {
    if (!Array.isArray(value.tags) || value.tags.length > ASSET_REGISTRY_LIMITS.tags) throw new Error('metadata.tags has an invalid size.');
    normalized.tags = [...new Set(value.tags.map(tag => text(tag, 'metadata.tags[]', ASSET_REGISTRY_LIMITS.tag)))].sort();
  }
  if (value.custom !== undefined) {
    if (!isObject(value.custom) || Object.keys(value.custom).length > ASSET_REGISTRY_LIMITS.customKeys) throw new Error('metadata.custom has an invalid size.');
    normalized.custom = {};
    for (const [key, child] of Object.entries(value.custom)) {
      text(key, 'metadata.custom key', ASSET_REGISTRY_LIMITS.customKey);
      if (!/^[A-Za-z0-9_.:-]+$/u.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error(`metadata.custom.${key} key is unsafe.`);
      if (!['string', 'number', 'boolean'].includes(typeof child) || (typeof child === 'string' && child.length > ASSET_REGISTRY_LIMITS.customValue)) throw new Error(`metadata.custom.${key} value is invalid.`);
      normalized.custom[key] = child;
    }
  }
  return normalized;
}

function normalizeStorageLocator(value) {
  if (!isObject(value)) throw new Error('storageLocator must be an object.');
  for (const key of Object.keys(value)) if (!STORAGE_KEYS.has(key)) throw new Error(`storageLocator.${key} is unsupported.`);
  const provider = enumValue(value.provider, 'storageLocator.provider', ['object-storage', 'opfs']);
  const objectKey = text(value.objectKey, 'storageLocator.objectKey', ASSET_REGISTRY_LIMITS.storageObjectKey);
  if (objectKey.startsWith('/') || objectKey.includes('..') || /^(?:[a-z]+:|\\\\)/iu.test(objectKey) || /[\u0000-\u001f]/u.test(objectKey)) throw new Error('storageLocator.objectKey contains an unsafe path.');
  const bucket = value.bucket === undefined || value.bucket === null ? null : text(value.bucket, 'storageLocator.bucket', ASSET_REGISTRY_LIMITS.bucket);
  if (provider === 'object-storage' && !bucket) throw new Error('object-storage locator requires a bucket.');
  if (provider === 'opfs' && bucket !== null) throw new Error('opfs locator must not contain an Object Storage bucket.');
  return { provider, bucket, objectKey };
}

function normalizeProvenance(value = { kind: 'ORIGINAL' }) {
  if (!isObject(value)) throw new Error('provenance must be an object.');
  for (const key of Object.keys(value)) if (!PROVENANCE_KEYS.has(key)) throw new Error(`provenance.${key} is unsupported.`);
  const kind = enumValue(value.kind || 'ORIGINAL', 'provenance.kind', ASSET_PROVENANCE_KINDS);
  const result = {
    kind,
    sourceAssetId: value.sourceAssetId === null || value.sourceAssetId === undefined ? null : typedId(value.sourceAssetId, 'provenance.sourceAssetId'),
    sourceRevisionId: value.sourceRevisionId === null || value.sourceRevisionId === undefined ? null : typedId(value.sourceRevisionId, 'provenance.sourceRevisionId'),
    sourceProjectId: value.sourceProjectId === null || value.sourceProjectId === undefined ? null : typedId(value.sourceProjectId, 'provenance.sourceProjectId'),
    sourceSystemId: value.sourceSystemId === null || value.sourceSystemId === undefined ? null : text(value.sourceSystemId, 'provenance.sourceSystemId', 64),
  };
  if (kind === 'ORIGINAL' && (result.sourceAssetId || result.sourceRevisionId || result.sourceProjectId || result.sourceSystemId)) throw new Error('ORIGINAL provenance cannot point to a source.');
  if (['DERIVED_FROM', 'FORKED_FROM', 'GENERATED_FROM'].includes(kind) && (!result.sourceAssetId || !result.sourceRevisionId)) throw new Error(`${kind} provenance requires source Asset and Revision.`);
  if (kind === 'IMPORTED_FROM' && !result.sourceSystemId) throw new Error('IMPORTED_FROM provenance requires sourceSystemId.');
  return result;
}

function normalizeLegacyBinding(value, index = 0) {
  if (!isObject(value)) throw new Error(`legacyBindings[${index}] must be an object.`);
  const keys = new Set(['legacySystemId', 'legacyAssetId', 'legacyFormatVersion', 'adapterVersion', 'verificationHash', 'mappingState']);
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new Error(`legacyBindings[${index}].${key} is unsupported.`);
  return {
    legacySystemId: text(value.legacySystemId, `legacyBindings[${index}].legacySystemId`, 64),
    legacyAssetId: typedId(value.legacyAssetId, `legacyBindings[${index}].legacyAssetId`),
    legacyFormatVersion: text(value.legacyFormatVersion, `legacyBindings[${index}].legacyFormatVersion`, 64),
    adapterVersion: text(value.adapterVersion, `legacyBindings[${index}].adapterVersion`, 64),
    verificationHash: text(value.verificationHash, `legacyBindings[${index}].verificationHash`, 256),
    mappingState: enumValue(value.mappingState, `legacyBindings[${index}].mappingState`, ['MAPPED', 'QUARANTINED']),
  };
}

function normalizeAssetRecord(record) {
  if (!isObject(record)) throw new Error('Asset record must be an object.');
  for (const key of Object.keys(record)) if (!ASSET_RECORD_KEYS.has(key)) throw new Error(`Unknown Asset Registry field: ${key}.`);
  const bindings = Array.isArray(record.legacyBindings) ? record.legacyBindings.map(normalizeLegacyBinding) : [];
  if (bindings.length > ASSET_REGISTRY_LIMITS.legacyBindings) throw new Error('legacyBindings exceeds the Asset Registry limit.');
  const normalized = {
    assetId: typedId(record.assetId, 'assetId'),
    assetKind: enumValue(record.assetKind, 'assetKind', ASSET_KINDS),
    ownerType: enumValue(record.ownerType, 'ownerType', ASSET_OWNER_TYPES),
    ownerId: typedId(record.ownerId, 'ownerId'),
    sourceProjectId: record.sourceProjectId === null || record.sourceProjectId === undefined ? null : typedId(record.sourceProjectId, 'sourceProjectId'),
    createdBy: typedId(record.createdBy, 'createdBy'),
    visibility: enumValue(record.visibility, 'visibility', ASSET_VISIBILITIES),
    lifecycleState: enumValue(record.lifecycleState, 'lifecycleState', ASSET_LIFECYCLE_STATES),
    headRevisionId: record.headRevisionId === null || record.headRevisionId === undefined ? null : typedId(record.headRevisionId, 'headRevisionId'),
    provenance: normalizeProvenance(record.provenance || { kind: 'ORIGINAL' }),
    legacyBindings: bindings,
    metadata: normalizeMetadata(record.metadata || {}),
    schemaVersion: integer(record.schemaVersion, 'schemaVersion', 1),
    recordVersion: integer(record.recordVersion, 'recordVersion', 1),
    createdAt: timestamp(record.createdAt, 'createdAt'),
    updatedAt: timestamp(record.updatedAt, 'updatedAt'),
  };
  if (normalized.schemaVersion !== ASSET_REGISTRY_SCHEMA_VERSION) throw new Error(`Unsupported Asset Registry schema version: ${normalized.schemaVersion}.`);
  if (normalized.updatedAt < normalized.createdAt) throw new Error('updatedAt cannot be before createdAt.');
  return normalized;
}

function normalizeRevisionRecord(record) {
  if (!isObject(record)) throw new Error('AssetRevision record must be an object.');
  for (const key of Object.keys(record)) if (!REVISION_KEYS.has(key)) throw new Error(`Unknown AssetRevision field: ${key}.`);
  const contentHash = text(record.contentHash, 'contentHash', ASSET_REGISTRY_LIMITS.hash).toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(contentHash)) throw new Error('contentHash must be a SHA-256 hex digest.');
  const contentType = text(record.contentType, 'contentType', ASSET_REGISTRY_LIMITS.mime).toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/u.test(contentType)) throw new Error('contentType must be a valid MIME type.');
  const normalized = {
    revisionId: typedId(record.revisionId, 'revisionId'),
    assetId: typedId(record.assetId, 'assetId'),
    parentRevisionId: record.parentRevisionId === null || record.parentRevisionId === undefined ? null : typedId(record.parentRevisionId, 'parentRevisionId'),
    contentHash,
    contentType,
    byteLength: integer(record.byteLength, 'byteLength', 0),
    storageLocator: normalizeStorageLocator(record.storageLocator),
    toolId: enumValue(record.toolId, 'toolId', REGISTERED_ASSET_TOOLS),
    formatId: enumValue(record.formatId, 'formatId', REGISTERED_ASSET_FORMATS),
    formatVersion: text(record.formatVersion, 'formatVersion', ASSET_REGISTRY_LIMITS.formatVersion),
    dependencySnapshotId: record.dependencySnapshotId === null || record.dependencySnapshotId === undefined ? null : typedId(record.dependencySnapshotId, 'dependencySnapshotId'),
    createdBy: typedId(record.createdBy, 'createdBy'),
    createdAt: timestamp(record.createdAt, 'createdAt'),
    verificationState: enumValue(record.verificationState, 'verificationState', ASSET_VERIFICATION_STATES),
    recordVersion: integer(record.recordVersion, 'recordVersion', 1),
    immutable: record.immutable,
  };
  if (normalized.immutable !== true) throw new Error('AssetRevision must be immutable.');
  if (normalized.verificationState !== 'VERIFIED') throw new Error('New AssetRevision must be VERIFIED.');
  return normalized;
}

function normalizeCompatibilityConstraint(value = {}) {
  if (!isObject(value)) throw new Error('compatibilityConstraint must be an object.');
  for (const key of Object.keys(value)) if (!DEPENDENCY_CONSTRAINT_KEYS.has(key)) throw new Error(`compatibilityConstraint.${key} is unsupported.`);
  const normalized = {};
  for (const [key, values] of Object.entries(value)) {
    if (['toolIds', 'assetKinds', 'formatIds'].includes(key)) {
      if (!Array.isArray(values) || values.length > 16) throw new Error(`compatibilityConstraint.${key} must be a bounded array.`);
      normalized[key] = [...new Set(values.map(item => text(item, `${key}[]`, 64)))].sort();
    } else normalized[key] = text(values, `compatibilityConstraint.${key}`, 32);
  }
  return normalized;
}

function normalizeDependencyRecord(record) {
  if (!isObject(record)) throw new Error('Dependency record must be an object.');
  for (const key of Object.keys(record)) if (!DEPENDENCY_KEYS.has(key)) throw new Error(`Unknown Dependency field: ${key}.`);
  const policy = enumValue(record.referencePolicy, 'referencePolicy', ASSET_REFERENCE_POLICIES);
  const normalized = {
    edgeId: typedId(record.edgeId, 'edgeId'),
    consumerAssetId: typedId(record.consumerAssetId, 'consumerAssetId'),
    providerAssetId: typedId(record.providerAssetId, 'providerAssetId'),
    providerRevisionId: record.providerRevisionId === null || record.providerRevisionId === undefined ? null : typedId(record.providerRevisionId, 'providerRevisionId'),
    resolvedRevisionId: record.resolvedRevisionId === null || record.resolvedRevisionId === undefined ? null : typedId(record.resolvedRevisionId, 'resolvedRevisionId'),
    candidateRevisionId: record.candidateRevisionId === null || record.candidateRevisionId === undefined ? null : typedId(record.candidateRevisionId, 'candidateRevisionId'),
    derivedAssetId: record.derivedAssetId === null || record.derivedAssetId === undefined ? null : typedId(record.derivedAssetId, 'derivedAssetId'),
    relationType: enumValue(record.relationType, 'relationType', ASSET_RELATION_TYPES),
    referencePolicy: policy,
    required: record.required,
    compatibilityConstraint: normalizeCompatibilityConstraint(record.compatibilityConstraint || {}),
    recordVersion: integer(record.recordVersion, 'recordVersion', 1),
    createdAt: timestamp(record.createdAt, 'createdAt'),
    updatedAt: timestamp(record.updatedAt, 'updatedAt'),
  };
  if (typeof normalized.required !== 'boolean') throw new Error('Dependency.required must be boolean.');
  if (policy === 'LIVE' && normalized.providerRevisionId !== null) throw new Error('LIVE dependency cannot pin providerRevisionId.');
  if (policy === 'PINNED' && !normalized.providerRevisionId) throw new Error('PINNED dependency requires providerRevisionId.');
  if (policy === 'REVIEW' && !normalized.candidateRevisionId) throw new Error('REVIEW dependency requires candidateRevisionId.');
  if (policy === 'FORKED' && (!normalized.providerRevisionId || !normalized.derivedAssetId)) throw new Error('FORKED dependency requires providerRevisionId and derivedAssetId.');
  if (policy !== 'REVIEW' && normalized.candidateRevisionId !== null) throw new Error('Only REVIEW dependency may contain candidateRevisionId.');
  if (policy !== 'FORKED' && normalized.derivedAssetId !== null) throw new Error('Only FORKED dependency may contain derivedAssetId.');
  return normalized;
}

function normalizePermissionDecision(value) {
  return normalizeAuthorizationProof(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function normalizeCommand(command) {
  if (!isObject(command)) throw new Error('Command must be an object.');
  for (const key of Object.keys(command)) if (!COMMAND_KEYS.has(key)) throw new Error(`Unknown command field: ${key}.`);
  if (command.schemaVersion !== ASSET_REGISTRY_SCHEMA_VERSION) throw new Error(`Unsupported Asset command schema version: ${String(command.schemaVersion)}.`);
  return {
    commandId: typedId(command.commandId, 'commandId'),
    commandType: enumValue(command.commandType, 'commandType', ASSET_COMMAND_TYPES),
    schemaVersion: command.schemaVersion,
    assetId: command.assetId === null || command.assetId === undefined ? null : typedId(command.assetId, 'assetId'),
    actorId: typedId(command.actorId, 'actorId'),
    correlationId: typedId(command.correlationId, 'correlationId'),
    expectedRecordVersion: command.expectedRecordVersion === null || command.expectedRecordVersion === undefined ? null : integer(command.expectedRecordVersion, 'expectedRecordVersion', 1),
    idempotencyKey: text(command.idempotencyKey, 'idempotencyKey', 160),
    permissionDecision: normalizePermissionDecision(command.permissionDecision),
    createdAt: timestamp(command.createdAt, 'createdAt'),
    payload: clone(command.payload || {}),
  };
}

export function validateAssetRecord(record) {
  try { return { valid: true, value: freezeDeep(normalizeAssetRecord(record)), diagnostics: [] }; }
  catch (error) { return { valid: false, value: null, diagnostics: [diagnostic('ASSET_RECORD_INVALID', error.message)] }; }
}

export function validateAssetRevisionRecord(record) {
  try { return { valid: true, value: freezeDeep(normalizeRevisionRecord(record)), diagnostics: [] }; }
  catch (error) { return { valid: false, value: null, diagnostics: [diagnostic('ASSET_REVISION_INVALID', error.message)] }; }
}

export function validateAssetDependencyRecord(record) {
  try { return { valid: true, value: freezeDeep(normalizeDependencyRecord(record)), diagnostics: [] }; }
  catch (error) { return { valid: false, value: null, diagnostics: [diagnostic('ASSET_DEPENDENCY_INVALID', error.message)] }; }
}

export function validateAssetCommand(command) {
  try {
    const normalized = normalizeCommand(command);
    assertSafeValue(normalized.payload, 'payload');
    return { valid: true, value: normalized, diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [diagnostic('ASSET_COMMAND_INVALID', error.message)] };
  }
}

export function createAssetCommand({
  commandType,
  assetId = null,
  actorId,
  correlationId,
  expectedRecordVersion = null,
  idempotencyKey,
  permissionDecision,
  payload = {},
  adapters = {},
} = {}) {
  if (typeof adapters.idGenerator !== 'function') throw new Error('Injected idGenerator is required.');
  if (typeof adapters.clock !== 'function') throw new Error('Injected clock is required.');
  return {
    commandId: adapters.idGenerator('asset-command'),
    commandType,
    schemaVersion: ASSET_REGISTRY_SCHEMA_VERSION,
    assetId,
    actorId,
    correlationId: correlationId || adapters.idGenerator('asset-correlation'),
    expectedRecordVersion,
    idempotencyKey: idempotencyKey || adapters.idGenerator('asset-idempotency'),
    permissionDecision,
    createdAt: adapters.clock(),
    payload: clone(payload),
  };
}

function legacyKey(binding) {
  return `${binding.legacySystemId}:${binding.legacyAssetId}`;
}

function eventPayload({ assetId, revisionId = null, oldRevisionId = null, newRevisionId = null, providerAssetId = null, providerRevisionId = null, edgeId = null, contentHash = null, referencePolicy = null, reason = null, downstreamCount = null } = {}) {
  const payload = { assetId, revisionId, oldRevisionId, newRevisionId, providerAssetId, providerRevisionId, edgeId, contentHash, referencePolicy, reason, downstreamCount };
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== undefined));
}

export function createAssetRegistry({
  adapters = {},
  featureFlagEvaluator = null,
  permissionEvaluator = null,
  retentionEvaluator = null,
} = {}) {
  const state = {
    assets: Object.create(null),
    revisions: Object.create(null),
    blobs: Object.create(null),
    dependencies: Object.create(null),
    legacy: Object.create(null),
    missing: Object.create(null),
    events: [],
    commands: Object.create(null),
    idempotency: Object.create(null),
  };
  const clock = adapters.clock;
  const networkAdapter = adapters.network || null;

  function now() {
    if (typeof clock !== 'function') throw new Error('Trusted clock adapter is required.');
    return timestamp(clock(), 'clock.now');
  }

  function flagDecision(flagId, action, actorId = null) {
    if (typeof featureFlagEvaluator !== 'function') return { enabled: false, decision: 'fallback', serverAuthorized: false, code: 'ASSET_FLAG_EVALUATOR_MISSING' };
    const result = featureFlagEvaluator({ flagId, action, principalId: actorId, principalSource: 'server', serverAuthorized: true, clientRequested: false });
    return isObject(result) ? clone(result) : { enabled: false, decision: 'unknown', serverAuthorized: false, code: 'ASSET_FLAG_DECISION_INVALID' };
  }

  function requireFlag(flagId, action, actorId = null) {
    const decision = flagDecision(flagId, action, actorId);
    if (decision.serverAuthorized === true && decision.enabled === true && decision.decision === 'enabled') return null;
    const rollback = decision.code?.includes('ROLLBACK') || decision.code?.includes('KILL_SWITCH');
    return failure(rollback ? 'ASSET_REGISTRY_ROLLBACK_ACTIVE' : (action === 'read' ? 'ASSET_REGISTRY_READ_FLAG_OFF' : 'ASSET_REGISTRY_WRITE_FLAG_OFF'), rollback ? 'Asset Registry is on the preserved path because a kill switch or rollback is active.' : `Asset Registry is unavailable while ${flagId} is default-off.`, null, { flagId, action, decision: decision.decision || 'unknown' });
  }

  function requirePermission(command, asset, capability) {
    const decision = normalizePermissionDecision(command.permissionDecision);
    if (decision.capability !== capability) return failure('ASSET_PERMISSION_CAPABILITY_MISMATCH', 'AuthorizationProof capability does not match the Asset action.', 'permissionDecision.capability');
    if (typeof permissionEvaluator !== 'function') return failure('ASSET_AUTHZ_EVALUATOR_REQUIRED', 'Asset Registry writes require a server-owned Authorization evaluator.');
    try {
      const resolved = resolveAuthorizationProofSync({
        expected: { principalId: command.actorId, resourceType: 'ASSET', resourceId: asset?.assetId || command.assetId || command.payload?.assetId, action: capability, capability, tenantId: decision.tenantId, correlationId: command.correlationId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
        callerProof: command.permissionDecision,
        authorizationEvaluator: (input) => permissionEvaluator({ asset: asset ? clone(asset) : null, principalId: input.principalId, actorId: input.principalId, action: input.action, capability: input.capability, resourceType: input.resourceType, resourceId: input.resourceId, tenantId: input.tenantId, correlationId: input.correlationId, source: 'server' }),
      });
      if (resolved.decision !== 'allow') return failure('ASSET_PERMISSION_DENIED', 'The server AuthorizationProof denied the Asset command.');
    } catch (error) {
      return failure(error.code || 'ASSET_PERMISSION_DENIED', error.message, 'permissionDecision');
    }
    return null;
  }

  function expectedVersion(asset, command) {
    if (command.expectedRecordVersion !== null && command.expectedRecordVersion !== asset.recordVersion) return failure('ASSET_RECORD_VERSION_CONFLICT', 'Asset recordVersion is stale; no mutation was applied.', 'expectedRecordVersion', { currentRecordVersion: asset.recordVersion });
    return null;
  }

  function appendEvent(type, command, assetId, details = {}) {
    const event = freezeDeep({
      eventType: type,
      eventVersion: 1,
      eventId: command.commandId,
      commandId: command.commandId,
      correlationId: command.correlationId,
      assetId,
      actorId: command.actorId,
      at: now(),
      payload: eventPayload({ assetId, ...details }),
    });
    state.events.push(event);
    return event;
  }

  function saveLegacyBindings(asset) {
    for (const binding of asset.legacyBindings) state.legacy[legacyKey(binding)] = { assetId: asset.assetId, ownerId: asset.ownerId, verificationHash: binding.verificationHash };
  }

  function checkLegacyBindings(asset, bindings) {
    const normalized = bindings.map(normalizeLegacyBinding);
    const seen = new Set();
    for (const binding of normalized) {
      const key = legacyKey(binding);
      if (seen.has(key)) return { conflict: 'ASSET_LEGACY_MAPPING_MULTIPLE', binding };
      seen.add(key);
      const existing = state.legacy[key];
      if (existing && (existing.assetId !== asset.assetId || existing.ownerId !== asset.ownerId)) return { conflict: 'ASSET_LEGACY_MAPPING_CONFLICT', binding, existing };
    }
    return { bindings: normalized };
  }

  function verifyBlob(input) {
    if (typeof adapters.blobVerifier !== 'function') throw Object.assign(new Error('A trusted blobVerifier adapter is required; client hash is not sufficient.'), { code: 'ASSET_BLOB_VERIFIER_UNAVAILABLE' });
    const result = adapters.blobVerifier({ ...clone(input), source: 'server', clientHashUntrusted: true });
    if (!isObject(result) || result.ok !== true) throw Object.assign(new Error('Blob verification failed.'), { code: 'ASSET_BLOB_VERIFY_FAILED' });
    const computedHash = String(result.computedHash || '').toLowerCase();
    if (computedHash !== input.contentHash) throw Object.assign(new Error('Computed Blob hash does not match requested contentHash.'), { code: 'ASSET_BLOB_HASH_MISMATCH' });
    if (result.computedByteLength !== input.byteLength) throw Object.assign(new Error('Computed Blob size does not match requested byteLength.'), { code: 'ASSET_BLOB_SIZE_MISMATCH' });
    if (result.detectedContentType && String(result.detectedContentType).toLowerCase() !== input.contentType) throw Object.assign(new Error('Detected MIME type does not match requested contentType.'), { code: 'ASSET_BLOB_MIME_MISMATCH' });
    return { computedHash, computedByteLength: result.computedByteLength, detectedContentType: result.detectedContentType || input.contentType };
  }

  function registerVerifiedBlob(input, verification) {
    const current = state.blobs[input.contentHash];
    if (current) {
      if (current.byteLength !== input.byteLength || current.contentType !== input.contentType) throw Object.assign(new Error('Existing content hash metadata conflicts.'), { code: 'ASSET_BLOB_METADATA_CONFLICT' });
      return { blob: clone(current), reused: true };
    }
    const blob = {
      contentHash: input.contentHash,
      byteLength: input.byteLength,
      contentType: input.contentType,
      storageLocator: input.storageLocator,
      verificationState: 'VERIFIED',
      verifiedByteLength: verification.computedByteLength,
    };
    state.blobs[input.contentHash] = blob;
    return { blob: clone(blob), reused: false };
  }

  function verifyAssetRevisionInput(payload, revisionId, assetId, createdBy) {
    const contentHash = text(payload.contentHash, 'payload.contentHash', ASSET_REGISTRY_LIMITS.hash).toLowerCase();
    if (!/^[0-9a-f]{64}$/u.test(contentHash)) throw Object.assign(new Error('contentHash must be a SHA-256 hex digest.'), { code: 'ASSET_HASH_INVALID' });
    const contentType = text(payload.contentType, 'payload.contentType', ASSET_REGISTRY_LIMITS.mime).toLowerCase();
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/u.test(contentType)) throw Object.assign(new Error('contentType must be a valid MIME type.'), { code: 'ASSET_MIME_INVALID' });
    const byteLength = integer(payload.byteLength, 'payload.byteLength', 0);
    const storageLocator = normalizeStorageLocator(payload.storageLocator);
    const verification = verifyBlob({ contentHash, byteLength, contentType, storageLocator });
    const blob = registerVerifiedBlob({ contentHash, byteLength, contentType, storageLocator }, verification);
    const revision = normalizeRevisionRecord({
      revisionId,
      assetId,
      parentRevisionId: payload.parentRevisionId ?? null,
      contentHash,
      contentType,
      byteLength,
      storageLocator,
      toolId: payload.toolId,
      formatId: payload.formatId,
      formatVersion: payload.formatVersion,
      dependencySnapshotId: payload.dependencySnapshotId ?? null,
      createdBy,
      createdAt: now(),
      verificationState: 'VERIFIED',
      recordVersion: ASSET_REVISION_RECORD_VERSION_START,
      immutable: true,
    });
    return { revision, blob };
  }

  function ensureRevisionBelongs(assetId, revisionId, field = 'revisionId') {
    const revision = state.revisions[revisionId];
    if (!revision) throw Object.assign(new Error(`${field} was not found.`), { code: 'ASSET_REVISION_NOT_FOUND' });
    if (revision.assetId !== assetId) throw Object.assign(new Error(`${field} belongs to a different Asset.`), { code: 'ASSET_REVISION_ASSET_MISMATCH' });
    if (revision.verificationState !== 'VERIFIED') throw Object.assign(new Error(`${field} is not verified.`), { code: 'ASSET_REVISION_NOT_VERIFIED' });
    return revision;
  }

  function wouldCreateForbiddenCycle(consumerAssetId, providerAssetId, relationType) {
    if (CYCLE_ALLOWED_RELATIONS.includes(relationType)) return false;
    const visited = new Set();
    function walk(assetId) {
      if (assetId === consumerAssetId) return true;
      if (visited.has(assetId)) return false;
      visited.add(assetId);
      return Object.values(state.dependencies).some(edge => edge.consumerAssetId === assetId && walk(edge.providerAssetId));
    }
    return walk(providerAssetId);
  }

  function activeDependents(assetId) {
    return Object.values(state.dependencies).filter(edge => {
      if (edge.providerAssetId !== assetId) return false;
      const consumer = state.assets[edge.consumerAssetId];
      return consumer && !['TRASHED', 'QUARANTINED'].includes(consumer.lifecycleState);
    });
  }

  function transitionLifecycle(asset, nextState) {
    enumValue(nextState, 'lifecycleState', ASSET_LIFECYCLE_STATES);
    if (asset.lifecycleState === nextState) return;
    if (!LIFECYCLE_TRANSITIONS[asset.lifecycleState]?.includes(nextState)) throw Object.assign(new Error(`Invalid Asset lifecycle transition ${asset.lifecycleState} -> ${nextState}.`), { code: 'ASSET_LIFECYCLE_INVALID' });
  }

  function commitAsset(asset, command, eventType, details = {}) {
    const validation = normalizeAssetRecord(asset);
    state.assets[validation.assetId] = validation;
    const event = appendEvent(eventType, command, validation.assetId, details);
    if (validation.legacyBindings.length) saveLegacyBindings(validation);
    return success({ asset: validation, event, idempotentReplay: false });
  }

  function validatePayloadKeys(payload, allowed, commandType) {
    if (!isObject(payload)) throw new Error(`${commandType} payload must be an object.`);
    for (const key of Object.keys(payload)) if (!allowed.has(key)) throw new Error(`${commandType} payload.${key} is unsupported.`);
  }

  function createAssetRecord(payload, command) {
    const assetId = payload.assetId || adapters.idGenerator?.('asset');
    if (!assetId) throw new Error('CREATE_ASSET requires assetId or injected idGenerator.');
    const createdAt = now();
    return normalizeAssetRecord({
      assetId,
      assetKind: payload.assetKind,
      ownerType: payload.ownerType,
      ownerId: payload.ownerId,
      sourceProjectId: payload.sourceProjectId ?? null,
      createdBy: command.actorId,
      visibility: payload.visibility || 'PRIVATE',
      lifecycleState: 'ACTIVE',
      headRevisionId: null,
      provenance: payload.provenance || { kind: 'ORIGINAL' },
      legacyBindings: payload.legacyBindings || [],
      metadata: payload.metadata || {},
      schemaVersion: ASSET_REGISTRY_SCHEMA_VERSION,
      recordVersion: ASSET_RECORD_VERSION_START,
      createdAt,
      updatedAt: createdAt,
    });
  }

  function snapshotState() { return clone(state); }
  function restoreState(snapshot) {
    for (const key of Object.keys(state)) {
      if (Array.isArray(state[key])) state[key] = snapshot[key];
      else state[key] = snapshot[key];
    }
  }

  function storeCommand(command, fingerprint, result) {
    const saved = clone(result);
    state.commands[command.commandId] = { fingerprint, result: saved };
    state.idempotency[`${command.actorId}:${command.idempotencyKey}`] = { fingerprint, result: saved };
    return saved;
  }

  function replayOrConflict(command) {
    const fingerprint = stableStringify(command);
    const prior = state.commands[command.commandId] || state.idempotency[`${command.actorId}:${command.idempotencyKey}`];
    if (!prior) return { fingerprint };
    if (prior.fingerprint !== fingerprint) return { fingerprint, conflict: failure('ASSET_IDEMPOTENCY_KEY_REUSE', 'Command or idempotency key was reused with a different payload.') };
    if (!prior.result.ok) return { fingerprint, replay: clone(prior.result) };
    return { fingerprint, replay: success({ ...prior.result.result, idempotentReplay: true }, prior.result.diagnostics || []) };
  }

  function executeCreateAsset(command) {
    validatePayloadKeys(command.payload, new Set(['assetId', 'assetKind', 'ownerType', 'ownerId', 'sourceProjectId', 'visibility', 'provenance', 'legacyBindings', 'metadata']), command.commandType);
    const asset = createAssetRecord(command.payload, command);
    if (state.assets[asset.assetId]) return failure('ASSET_ID_DUPLICATE', 'Asset ID already exists and is never reused.', 'assetId');
    const permission = requirePermission(command, asset, 'create');
    if (permission) return permission;
    const legacy = checkLegacyBindings(asset, asset.legacyBindings);
    if (legacy.conflict) {
      const quarantined = normalizeAssetRecord({ ...asset, lifecycleState: 'QUARANTINED', legacyBindings: asset.legacyBindings.map(binding => ({ ...binding, mappingState: 'QUARANTINED' })) });
      state.assets[quarantined.assetId] = quarantined;
      const event = appendEvent('ASSET_QUARANTINED', command, quarantined.assetId, { reason: legacy.conflict });
      const result = failure(legacy.conflict, 'Legacy Asset mapping was quarantined; source identity was preserved.', 'payload.legacyBindings', { assetId: quarantined.assetId, lifecycleState: 'QUARANTINED', eventId: event.eventId });
      result._preserveMutation = true;
      return result;
    }
    return commitAsset(asset, command, 'ASSET_CREATED');
  }

  function executeCreateRevision(command) {
    const asset = state.assets[command.assetId];
    if (!asset) return failure('ASSET_UNKNOWN_ID', 'Asset ID was not found.', 'assetId', { httpStatus: 404 });
    const expected = expectedVersion(asset, command);
    if (expected) return expected;
    const permission = requirePermission(command, asset, 'revision');
    if (permission) return permission;
    if (asset.lifecycleState !== 'ACTIVE') return failure('ASSET_REVISION_LIFECYCLE_BLOCKED', 'Revision creation requires an ACTIVE Asset.');
    validatePayloadKeys(command.payload, new Set(['revisionId', 'parentRevisionId', 'contentHash', 'contentType', 'byteLength', 'storageLocator', 'toolId', 'formatId', 'formatVersion', 'dependencySnapshotId']), command.commandType);
    const revisionId = command.payload.revisionId || adapters.idGenerator?.('asset-revision');
    if (!revisionId) throw new Error('CREATE_REVISION requires revisionId or injected idGenerator.');
    if (state.revisions[revisionId]) return failure('ASSET_REVISION_DUPLICATE', 'Revision ID already exists.', 'payload.revisionId');
    if (command.payload.parentRevisionId !== null && command.payload.parentRevisionId !== undefined) ensureRevisionBelongs(asset.assetId, command.payload.parentRevisionId, 'parentRevisionId');
    const existingContent = Object.values(state.revisions).find(revision => revision.assetId === asset.assetId && revision.contentHash === String(command.payload.contentHash || '').toLowerCase());
    if (existingContent) return failure('ASSET_REVISION_CONTENT_DUPLICATE', 'Identical content already has a revision for this Asset.', 'payload.contentHash', { existingRevisionId: existingContent.revisionId });
    const verified = verifyAssetRevisionInput(command.payload, revisionId, asset.assetId, command.actorId);
    state.revisions[revisionId] = verified.revision;
    const nextAsset = { ...asset, recordVersion: asset.recordVersion + 1, updatedAt: now() };
    state.assets[asset.assetId] = normalizeAssetRecord(nextAsset);
    const event = appendEvent('ASSET_REVISION_CREATED', command, asset.assetId, { revisionId, contentHash: verified.revision.contentHash });
    return success({ asset: state.assets[asset.assetId], revision: verified.revision, blob: { contentHash: verified.blob.blob.contentHash, reused: verified.blob.reused }, event, idempotentReplay: false });
  }

  function updateLiveReferences(providerAssetId, oldRevisionId, newRevisionId, command) {
    const events = [];
    for (const edge of Object.values(state.dependencies)) {
      if (edge.providerAssetId !== providerAssetId) continue;
      if (edge.referencePolicy === 'LIVE') {
        edge.resolvedRevisionId = newRevisionId;
        edge.recordVersion += 1;
        edge.updatedAt = now();
        events.push(appendEvent('ASSET_LIVE_REFERENCE_UPDATED', command, edge.consumerAssetId, { edgeId: edge.edgeId, providerAssetId, oldRevisionId, newRevisionId, providerRevisionId: newRevisionId, referencePolicy: 'LIVE' }));
      } else if (edge.referencePolicy === 'REVIEW') {
        edge.candidateRevisionId = newRevisionId;
        edge.recordVersion += 1;
        edge.updatedAt = now();
        events.push(appendEvent('ASSET_UPDATE_AVAILABLE', command, edge.consumerAssetId, { edgeId: edge.edgeId, providerAssetId, oldRevisionId, newRevisionId, providerRevisionId: newRevisionId, referencePolicy: 'REVIEW' }));
      }
    }
    return events;
  }

  function executeSetHead(command) {
    const asset = state.assets[command.assetId];
    if (!asset) return failure('ASSET_UNKNOWN_ID', 'Asset ID was not found.', 'assetId', { httpStatus: 404 });
    const expected = expectedVersion(asset, command);
    if (expected) return expected;
    const permission = requirePermission(command, asset, 'head');
    if (permission) return permission;
    validatePayloadKeys(command.payload, new Set(['revisionId']), command.commandType);
    const revision = ensureRevisionBelongs(asset.assetId, command.payload.revisionId);
    if (asset.headRevisionId === revision.revisionId) return success({ asset, revision, liveEvents: [], idempotentReplay: false });
    const liveEvents = updateLiveReferences(asset.assetId, asset.headRevisionId, revision.revisionId, command);
    const next = normalizeAssetRecord({ ...asset, headRevisionId: revision.revisionId, recordVersion: asset.recordVersion + 1, updatedAt: now() });
    state.assets[asset.assetId] = next;
    const event = appendEvent('ASSET_HEAD_CHANGED', command, asset.assetId, { oldRevisionId: asset.headRevisionId, newRevisionId: revision.revisionId, downstreamCount: liveEvents.length });
    return success({ asset: next, revision, liveEvents, event, idempotentReplay: false });
  }

  function executeAddDependency(command) {
    const consumer = state.assets[command.assetId];
    if (!consumer) return failure('ASSET_UNKNOWN_ID', 'Consumer Asset ID was not found.', 'assetId', { httpStatus: 404 });
    const expected = expectedVersion(consumer, command);
    if (expected) return expected;
    const permission = requirePermission(command, consumer, 'dependency');
    if (permission) return permission;
    validatePayloadKeys(command.payload, new Set(['edgeId', 'providerAssetId', 'providerRevisionId', 'candidateRevisionId', 'derivedAssetId', 'relationType', 'referencePolicy', 'required', 'compatibilityConstraint']), command.commandType);
    const provider = state.assets[command.payload.providerAssetId];
    if (!provider) return failure('ASSET_DEPENDENCY_PROVIDER_UNKNOWN', 'Provider Asset does not exist.', 'payload.providerAssetId');
    const edgeId = command.payload.edgeId || adapters.idGenerator?.('asset-edge');
    if (!edgeId) throw new Error('ADD_DEPENDENCY requires edgeId or injected idGenerator.');
    if (state.dependencies[edgeId]) return failure('ASSET_DEPENDENCY_DUPLICATE', 'Dependency edge already exists.', 'payload.edgeId');
    if (wouldCreateForbiddenCycle(consumer.assetId, provider.assetId, command.payload.relationType)) return failure('ASSET_DEPENDENCY_CYCLE', 'This dependency would create a forbidden cycle.', 'payload.providerAssetId');
    let providerRevisionId = command.payload.providerRevisionId ?? null;
    let resolvedRevisionId = null;
    let candidateRevisionId = command.payload.candidateRevisionId ?? null;
    let derivedAssetId = command.payload.derivedAssetId ?? null;
    if (command.payload.referencePolicy === 'LIVE') {
      if (!provider.headRevisionId) return failure('ASSET_LIVE_HEAD_MISSING', 'LIVE dependency requires a provider HEAD Revision.');
      resolvedRevisionId = provider.headRevisionId;
    } else if (command.payload.referencePolicy === 'PINNED') {
      ensureRevisionBelongs(provider.assetId, providerRevisionId, 'providerRevisionId');
      resolvedRevisionId = providerRevisionId;
    } else if (command.payload.referencePolicy === 'REVIEW') {
      const candidate = candidateRevisionId || provider.headRevisionId;
      ensureRevisionBelongs(provider.assetId, candidate, 'candidateRevisionId');
      candidateRevisionId = candidate;
      resolvedRevisionId = provider.headRevisionId;
    } else if (command.payload.referencePolicy === 'FORKED') {
      ensureRevisionBelongs(provider.assetId, providerRevisionId, 'providerRevisionId');
      if (!derivedAssetId || !state.assets[derivedAssetId]) return failure('ASSET_FORK_DERIVED_UNKNOWN', 'FORKED dependency requires an existing derived Asset.');
      resolvedRevisionId = providerRevisionId;
    }
    const edge = normalizeDependencyRecord({
      edgeId,
      consumerAssetId: consumer.assetId,
      providerAssetId: provider.assetId,
      providerRevisionId,
      resolvedRevisionId,
      candidateRevisionId,
      derivedAssetId,
      relationType: command.payload.relationType,
      referencePolicy: command.payload.referencePolicy,
      required: command.payload.required,
      compatibilityConstraint: command.payload.compatibilityConstraint || {},
      recordVersion: 1,
      createdAt: now(),
      updatedAt: now(),
    });
    state.dependencies[edge.edgeId] = edge;
    state.assets[consumer.assetId] = normalizeAssetRecord({ ...consumer, recordVersion: consumer.recordVersion + 1, updatedAt: now() });
    const event = appendEvent('ASSET_DEPENDENCY_CHANGED', command, consumer.assetId, { edgeId: edge.edgeId, providerAssetId: edge.providerAssetId, providerRevisionId: edge.resolvedRevisionId, referencePolicy: edge.referencePolicy });
    return success({ asset: state.assets[consumer.assetId], dependency: edge, event, idempotentReplay: false });
  }

  function executeRemoveDependency(command) {
    const consumer = state.assets[command.assetId];
    if (!consumer) return failure('ASSET_UNKNOWN_ID', 'Consumer Asset ID was not found.', 'assetId', { httpStatus: 404 });
    const expected = expectedVersion(consumer, command);
    if (expected) return expected;
    const permission = requirePermission(command, consumer, 'dependency');
    if (permission) return permission;
    validatePayloadKeys(command.payload, new Set(['edgeId']), command.commandType);
    const edge = state.dependencies[command.payload.edgeId];
    if (!edge || edge.consumerAssetId !== consumer.assetId) return failure('ASSET_DEPENDENCY_UNKNOWN', 'Dependency edge was not found for this consumer.', 'payload.edgeId');
    delete state.dependencies[edge.edgeId];
    state.assets[consumer.assetId] = normalizeAssetRecord({ ...consumer, recordVersion: consumer.recordVersion + 1, updatedAt: now() });
    const event = appendEvent('ASSET_DEPENDENCY_CHANGED', command, consumer.assetId, { edgeId: edge.edgeId, providerAssetId: edge.providerAssetId, reason: 'removed' });
    return success({ asset: state.assets[consumer.assetId], dependency: edge, event, idempotentReplay: false });
  }

  function executeChangeReferencePolicy(command) {
    const consumer = state.assets[command.assetId];
    if (!consumer) return failure('ASSET_UNKNOWN_ID', 'Consumer Asset ID was not found.', 'assetId', { httpStatus: 404 });
    const expected = expectedVersion(consumer, command);
    if (expected) return expected;
    const permission = requirePermission(command, consumer, 'dependency');
    if (permission) return permission;
    validatePayloadKeys(command.payload, new Set(['edgeId', 'referencePolicy', 'providerRevisionId', 'candidateRevisionId', 'derivedAssetId']), command.commandType);
    const edge = state.dependencies[command.payload.edgeId];
    if (!edge || edge.consumerAssetId !== consumer.assetId) return failure('ASSET_DEPENDENCY_UNKNOWN', 'Dependency edge was not found for this consumer.', 'payload.edgeId');
    const provider = state.assets[edge.providerAssetId];
    const policy = enumValue(command.payload.referencePolicy, 'payload.referencePolicy', ASSET_REFERENCE_POLICIES);
    const next = { ...edge, referencePolicy: policy, providerRevisionId: command.payload.providerRevisionId ?? null, candidateRevisionId: command.payload.candidateRevisionId ?? null, derivedAssetId: command.payload.derivedAssetId ?? null, updatedAt: now(), recordVersion: edge.recordVersion + 1 };
    if (policy === 'LIVE') {
      if (!provider.headRevisionId) return failure('ASSET_LIVE_HEAD_MISSING', 'LIVE dependency requires a provider HEAD Revision.');
      next.providerRevisionId = null;
      next.candidateRevisionId = null;
      next.derivedAssetId = null;
      next.resolvedRevisionId = provider.headRevisionId;
    } else if (policy === 'PINNED') {
      ensureRevisionBelongs(provider.assetId, next.providerRevisionId, 'providerRevisionId');
      next.resolvedRevisionId = next.providerRevisionId;
      next.candidateRevisionId = null;
      next.derivedAssetId = null;
    } else if (policy === 'REVIEW') {
      const candidate = next.candidateRevisionId || provider.headRevisionId;
      ensureRevisionBelongs(provider.assetId, candidate, 'candidateRevisionId');
      next.candidateRevisionId = candidate;
      next.resolvedRevisionId = edge.resolvedRevisionId;
      next.providerRevisionId = null;
      next.derivedAssetId = null;
    } else {
      ensureRevisionBelongs(provider.assetId, next.providerRevisionId, 'providerRevisionId');
      if (!next.derivedAssetId || !state.assets[next.derivedAssetId]) return failure('ASSET_FORK_DERIVED_UNKNOWN', 'FORKED dependency requires an existing derived Asset.');
      next.resolvedRevisionId = next.providerRevisionId;
      next.candidateRevisionId = null;
    }
    state.dependencies[edge.edgeId] = normalizeDependencyRecord(next);
    state.assets[consumer.assetId] = normalizeAssetRecord({ ...consumer, recordVersion: consumer.recordVersion + 1, updatedAt: now() });
    const event = appendEvent('ASSET_COMPATIBILITY_CHANGED', command, consumer.assetId, { edgeId: edge.edgeId, providerAssetId: edge.providerAssetId, providerRevisionId: state.dependencies[edge.edgeId].resolvedRevisionId, referencePolicy: policy });
    return success({ asset: state.assets[consumer.assetId], dependency: state.dependencies[edge.edgeId], event, idempotentReplay: false });
  }

  function executeLifecycle(command, nextState, capability, eventType) {
    const asset = state.assets[command.assetId];
    if (!asset) return failure('ASSET_UNKNOWN_ID', 'Asset ID was not found.', 'assetId', { httpStatus: 404 });
    const expected = expectedVersion(asset, command);
    if (expected) return expected;
    const permission = requirePermission(command, asset, capability);
    if (permission) return permission;
    validatePayloadKeys(command.payload, new Set(), command.commandType);
    if (nextState === 'TRASHED') {
      const dependents = activeDependents(asset.assetId);
      const retention = typeof retentionEvaluator === 'function' ? retentionEvaluator({ asset: clone(asset), dependents: clone(dependents), source: 'server' }) : { blocking: false, reasons: [] };
      if (dependents.length || retention?.blocking === true) return failure('ASSET_TRASH_DEPENDENCY_BLOCKED', 'Asset has active dependents or a retention lock; no trash mutation was applied.', 'assetId', { dependentEdgeIds: dependents.map(edge => edge.edgeId), reasons: retention?.reasons || [] });
    }
    transitionLifecycle(asset, nextState);
    const next = normalizeAssetRecord({ ...asset, lifecycleState: nextState, recordVersion: asset.recordVersion + 1, updatedAt: now() });
    state.assets[asset.assetId] = next;
    const event = appendEvent(eventType, command, asset.assetId, { reason: command.commandType });
    return success({ asset: next, event, idempotentReplay: false });
  }

  function executeFork(command) {
    const source = state.assets[command.assetId];
    if (!source) return failure('ASSET_UNKNOWN_ID', 'Source Asset ID was not found.', 'assetId', { httpStatus: 404 });
    const permission = requirePermission(command, source, 'fork');
    if (permission) return permission;
    validatePayloadKeys(command.payload, new Set(['newAssetId', 'newRevisionId', 'name', 'ownerType', 'ownerId', 'visibility', 'contentHash', 'contentType', 'byteLength', 'storageLocator', 'toolId', 'formatId', 'formatVersion', 'sourceRevisionId', 'metadata']), command.commandType);
    if (command.payload.ownerId && command.payload.ownerId !== source.ownerId) return failure('ASSET_OWNER_SUBSTITUTION', 'Fork ownership cannot be changed by the Asset Registry command.', 'payload.ownerId');
    if (command.payload.ownerType && command.payload.ownerType !== source.ownerType) return failure('ASSET_OWNER_SUBSTITUTION', 'Fork owner type must remain compatible with the source Asset.', 'payload.ownerType');
    const sourceRevision = ensureRevisionBelongs(source.assetId, command.payload.sourceRevisionId || source.headRevisionId, 'sourceRevisionId');
    const newAssetId = typedId(command.payload.newAssetId, 'payload.newAssetId');
    if (state.assets[newAssetId]) return failure('ASSET_ID_DUPLICATE', 'Fork target Asset ID already exists.', 'payload.newAssetId');
    const newRevisionId = typedId(command.payload.newRevisionId, 'payload.newRevisionId');
    if (state.revisions[newRevisionId]) return failure('ASSET_REVISION_DUPLICATE', 'Fork target Revision ID already exists.', 'payload.newRevisionId');
    const at = now();
    const forkedAsset = normalizeAssetRecord({
      assetId: newAssetId,
      assetKind: source.assetKind,
      ownerType: command.payload.ownerType || source.ownerType,
      ownerId: command.payload.ownerId || source.ownerId,
      sourceProjectId: source.sourceProjectId,
      createdBy: command.actorId,
      visibility: command.payload.visibility || 'PRIVATE',
      lifecycleState: 'ACTIVE',
      headRevisionId: newRevisionId,
      provenance: { kind: 'FORKED_FROM', sourceAssetId: source.assetId, sourceRevisionId: sourceRevision.revisionId, sourceProjectId: source.sourceProjectId },
      legacyBindings: [],
      metadata: { ...(command.payload.metadata || {}), ...(command.payload.name ? { custom: { forkName: text(command.payload.name, 'payload.name', ASSET_REGISTRY_LIMITS.name) } } : {}) },
      schemaVersion: ASSET_REGISTRY_SCHEMA_VERSION,
      recordVersion: ASSET_RECORD_VERSION_START + 1,
      createdAt: at,
      updatedAt: at,
    });
    const verified = verifyAssetRevisionInput(command.payload, newRevisionId, forkedAsset.assetId, command.actorId);
    const forkRevision = { ...verified.revision, parentRevisionId: null };
    state.assets[forkedAsset.assetId] = forkedAsset;
    state.revisions[forkRevision.revisionId] = forkRevision;
    const edgeId = adapters.idGenerator?.('asset-fork-edge');
    const forkEdge = normalizeDependencyRecord({
      edgeId,
      consumerAssetId: forkedAsset.assetId,
      providerAssetId: source.assetId,
      providerRevisionId: sourceRevision.revisionId,
      resolvedRevisionId: sourceRevision.revisionId,
      candidateRevisionId: null,
      derivedAssetId: forkedAsset.assetId,
      relationType: 'DERIVED_FROM',
      referencePolicy: 'FORKED',
      required: true,
      compatibilityConstraint: {},
      recordVersion: 1,
      createdAt: at,
      updatedAt: at,
    });
    state.dependencies[forkEdge.edgeId] = forkEdge;
    const assetEvent = appendEvent('ASSET_CREATED', command, forkedAsset.assetId, { revisionId: forkRevision.revisionId, reason: 'FORKED_FROM' });
    const revisionEvent = appendEvent('ASSET_REVISION_CREATED', command, forkedAsset.assetId, { revisionId: forkRevision.revisionId, contentHash: forkRevision.contentHash });
    return success({ asset: forkedAsset, revision: forkRevision, dependency: forkEdge, events: [assetEvent, revisionEvent], blob: { contentHash: verified.blob.blob.contentHash, reused: verified.blob.reused }, idempotentReplay: false });
  }

  function executeCommand(command) {
    const validation = validateAssetCommand(command);
    if (!validation.valid) return { ok: false, diagnostics: validation.diagnostics };
    const normalized = validation.value;
    const replay = replayOrConflict(normalized);
    if (replay.conflict) return replay.conflict;
    if (replay.replay) return replay.replay;
    const flags = [ASSET_REGISTRY_FLAGS.write];
    if (normalized.commandType === 'CREATE_REVISION' || normalized.commandType === 'FORK_ASSET') flags.push(ASSET_REGISTRY_FLAGS.revisionWrite, ASSET_REGISTRY_FLAGS.storageUpload);
    if (normalized.commandType === 'SET_HEAD_REVISION') flags.push(ASSET_REGISTRY_FLAGS.revisionWrite, ASSET_REGISTRY_FLAGS.dependencyLive);
    if (normalized.commandType === 'ADD_DEPENDENCY' || normalized.commandType === 'CHANGE_REFERENCE_POLICY') {
      if (normalized.payload.referencePolicy === 'LIVE' || normalized.commandType === 'CHANGE_REFERENCE_POLICY' && normalized.payload.referencePolicy === 'LIVE') flags.push(ASSET_REGISTRY_FLAGS.dependencyLive);
    }
    if (normalized.commandType === 'CREATE_ASSET' && Array.isArray(normalized.payload.legacyBindings) && normalized.payload.legacyBindings.length) flags.push(ASSET_REGISTRY_FLAGS.legacyAdapter);
    for (const flagId of flags) {
      const denied = requireFlag(flagId, 'write', normalized.actorId);
      if (denied) return storeCommand(normalized, replay.fingerprint, denied);
    }
    const backup = snapshotState();
    let result;
    try {
      if (normalized.commandType === 'CREATE_ASSET') result = executeCreateAsset(normalized);
      else if (normalized.commandType === 'CREATE_REVISION') result = executeCreateRevision(normalized);
      else if (normalized.commandType === 'SET_HEAD_REVISION') result = executeSetHead(normalized);
      else if (normalized.commandType === 'ADD_DEPENDENCY') result = executeAddDependency(normalized);
      else if (normalized.commandType === 'REMOVE_DEPENDENCY') result = executeRemoveDependency(normalized);
      else if (normalized.commandType === 'CHANGE_REFERENCE_POLICY') result = executeChangeReferencePolicy(normalized);
      else if (normalized.commandType === 'ARCHIVE_ASSET') result = executeLifecycle(normalized, 'ARCHIVED', 'lifecycle', 'ASSET_ARCHIVED');
      else if (normalized.commandType === 'RESTORE_ASSET') result = executeLifecycle(normalized, 'ACTIVE', 'lifecycle', 'ASSET_RESTORED');
      else if (normalized.commandType === 'TRASH_ASSET') result = executeLifecycle(normalized, 'TRASHED', 'lifecycle', 'ASSET_TRASHED');
      else if (normalized.commandType === 'QUARANTINE_ASSET') result = executeLifecycle(normalized, 'QUARANTINED', 'quarantine', 'ASSET_QUARANTINED');
      else if (normalized.commandType === 'FORK_ASSET') result = executeFork(normalized);
      else result = failure('ASSET_COMMAND_UNSUPPORTED', `Unsupported Asset command: ${normalized.commandType}.`);
    } catch (error) {
      restoreState(backup);
      result = failure(error.code || 'ASSET_COMMAND_INVALID', error.message, error.field || null);
    }
    const preserveMutation = result?._preserveMutation === true;
    if (result && Object.prototype.hasOwnProperty.call(result, '_preserveMutation')) delete result._preserveMutation;
    if (!result.ok && !preserveMutation) restoreState(backup);
    return storeCommand(normalized, replay.fingerprint, result);
  }

  function getAsset({ assetId, actorId = null, surface = 'preview', identityKnown = actorId !== null } = {}) {
    const readFlag = requireFlag(ASSET_REGISTRY_FLAGS.read, 'read', actorId);
    if (readFlag) return readFlag;
    let id;
    try { id = typedId(assetId, 'assetId'); } catch (error) { return failure('ASSET_ID_INVALID', error.message, 'assetId'); }
    const asset = state.assets[id];
    if (!asset) return failure('ASSET_NOT_FOUND', 'Asset existence is not disclosed.', null, { httpStatus: 404, expose: false });
    const owner = actorId !== null && actorId === asset.ownerId;
    const previewAllowed = asset.visibility === 'PUBLIC_PREVIEW' && surface === 'preview';
    if (!owner && !previewAllowed) {
      if (!identityKnown) return failure('ASSET_NOT_FOUND', 'Asset existence is not disclosed.', null, { httpStatus: 404, expose: false });
      return failure('ASSET_SOURCE_FORBIDDEN', 'Source Asset access requires server permission.', null, { httpStatus: 403, expose: true });
    }
    const revision = asset.headRevisionId ? state.revisions[asset.headRevisionId] : null;
    const safeRevision = revision ? (owner && surface === 'source' ? clone(revision) : { revisionId: revision.revisionId, assetId: revision.assetId, contentHash: revision.contentHash, contentType: revision.contentType, byteLength: revision.byteLength, verificationState: revision.verificationState }) : null;
    return success({ asset: clone(asset), revision: safeRevision, sourceAccessible: owner && surface === 'source', previewOnly: !owner });
  }

  function getRevision({ assetId, revisionId, actorId = null, surface = 'preview', identityKnown = actorId !== null } = {}) {
    const assetResult = getAsset({ assetId, actorId, surface, identityKnown });
    if (!assetResult.ok) return assetResult;
    try {
      const revision = ensureRevisionBelongs(assetId, revisionId);
      return success({ revision: assetResult.result.sourceAccessible ? clone(revision) : { revisionId: revision.revisionId, assetId: revision.assetId, contentHash: revision.contentHash, contentType: revision.contentType, byteLength: revision.byteLength, verificationState: revision.verificationState }, sourceAccessible: assetResult.result.sourceAccessible });
    } catch (error) { return failure(error.code || 'ASSET_REVISION_NOT_FOUND', error.message, 'revisionId'); }
  }

  function listAssets({ actorId = null, cursor = null, pageSize = 25, assetKind = null, lifecycleStates = ['ACTIVE', 'ARCHIVED'], identityKnown = actorId !== null } = {}) {
    const readFlag = requireFlag(ASSET_REGISTRY_FLAGS.read, 'read', actorId);
    if (readFlag) return readFlag;
    try {
      pageSize = integer(pageSize, 'pageSize', 1);
      if (pageSize > ASSET_REGISTRY_LIMITS.pageSize) throw new Error('pageSize exceeds the server limit.');
      if (assetKind !== null) enumValue(assetKind, 'assetKind', ASSET_KINDS);
      const after = cursor === null ? null : parseCursor(cursor);
      const rows = Object.values(state.assets).filter(asset => lifecycleStates.includes(asset.lifecycleState)).filter(asset => assetKind === null || asset.assetKind === assetKind).filter(asset => asset.visibility === 'PUBLIC_PREVIEW' || (actorId !== null && asset.ownerId === actorId) || identityKnown && asset.ownerId === actorId).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.assetId.localeCompare(b.assetId));
      const filtered = after ? rows.filter(asset => asset.updatedAt > after.updatedAt || asset.updatedAt === after.updatedAt && asset.assetId > after.assetId) : rows;
      const page = filtered.slice(0, pageSize).map(clone);
      const last = page[page.length - 1];
      return success({ assets: page, nextCursor: filtered.length > pageSize ? createCursor(last) : null, serverFiltered: true, pageSize });
    } catch (error) { return failure('ASSET_LIST_INVALID', error.message); }
  }

  function resolveLegacyAsset({ legacySystemId, legacyAssetId, legacyKind, canonicalAssetId = null } = {}) {
    const flag = requireFlag(ASSET_REGISTRY_FLAGS.legacyAdapter, 'read', null);
    if (flag) return flag;
    try {
      const canonicalKind = LEGACY_ASSET_KIND_ALIASES[text(legacyKind, 'legacyKind', 64)];
      if (!canonicalKind) return failure('ASSET_LEGACY_KIND_UNKNOWN', 'Legacy Asset kind has no registered canonical mapping.', 'legacyKind');
      return success({
        canonicalAssetId: canonicalAssetId === null ? null : typedId(canonicalAssetId, 'canonicalAssetId'),
        assetKind: canonicalKind,
        legacyBinding: normalizeLegacyBinding({ legacySystemId, legacyAssetId, legacyFormatVersion: 'legacy', adapterVersion: 'synthetic-wp092', verificationHash: 'synthetic', mappingState: 'MAPPED' }),
        sourceMutation: 'none',
      });
    } catch (error) { return failure('ASSET_LEGACY_FIXTURE_INVALID', error.message); }
  }

  function reportMissingRevision({ assetId, revisionId, actorId, correlationId, reason = 'storage-missing' } = {}) {
    const flag = requireFlag(ASSET_REGISTRY_FLAGS.write, 'write', actorId);
    if (flag) return flag;
    try {
      const revision = ensureRevisionBelongs(assetId, revisionId);
      const command = { commandId: `missing-${revisionId}`, correlationId: typedId(correlationId, 'correlationId'), actorId: typedId(actorId, 'actorId') };
      state.missing[revisionId] = { assetId, revisionId, reason: text(reason, 'reason', 256), at: now() };
      const event = appendEvent('ASSET_MISSING', command, assetId, { revisionId: revision.revisionId, reason: state.missing[revisionId].reason });
      return success({ revisionId, event, revisionImmutable: true });
    } catch (error) { return failure(error.code || 'ASSET_MISSING_INVALID', error.message); }
  }

  function reportCompatibilityChange({ assetId, actorId, correlationId, reason, revisionId = null } = {}) {
    const flag = requireFlag(ASSET_REGISTRY_FLAGS.write, 'write', actorId);
    if (flag) return flag;
    try {
      const asset = state.assets[typedId(assetId, 'assetId')];
      if (!asset) return failure('ASSET_UNKNOWN_ID', 'Asset ID was not found.', 'assetId');
      if (asset.ownerId !== actorId) return failure('ASSET_PERMISSION_DENIED', 'Only the Asset owner may report compatibility changes.');
      const command = { commandId: `compat-${asset.assetId}-${asset.recordVersion}`, correlationId: typedId(correlationId, 'correlationId'), actorId: typedId(actorId, 'actorId') };
      const event = appendEvent('ASSET_COMPATIBILITY_CHANGED', command, asset.assetId, { revisionId: revisionId === null ? null : typedId(revisionId, 'revisionId'), reason: text(reason, 'reason', 256) });
      return success({ assetId: asset.assetId, event });
    } catch (error) { return failure('ASSET_COMPATIBILITY_INVALID', error.message); }
  }

  function snapshot() {
    return clone({ ...state, networkAdapterInjected: Boolean(networkAdapter), flags: ASSET_REGISTRY_FLAGS });
  }

  return Object.freeze({
    executeCommand,
    getAsset,
    getRevision,
    listAssets,
    resolveLegacyAsset,
    reportMissingRevision,
    reportCompatibilityChange,
    snapshot,
    validateAssetRecord,
    validateAssetRevisionRecord,
    validateAssetDependencyRecord,
    validateAssetCommand,
    adapters: Object.freeze({ clock: typeof clock === 'function', idGenerator: typeof adapters.idGenerator === 'function', random: typeof adapters.random === 'function', network: Boolean(networkAdapter), blobVerifier: typeof adapters.blobVerifier === 'function' }),
  });
}

function createCursor(asset) {
  return `v1:${encodeURIComponent(asset.updatedAt)}:${encodeURIComponent(asset.assetId)}`;
}

function parseCursor(cursor) {
  const parts = String(cursor).split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Asset cursor is invalid.');
  const updatedAt = decodeURIComponent(parts[1]);
  const assetId = typedId(decodeURIComponent(parts[2]), 'cursor.assetId');
  timestamp(updatedAt, 'cursor.updatedAt');
  return { updatedAt, assetId };
}

export const ASSET_REGISTRY_CONTRACT = Object.freeze({
  schemaVersion: ASSET_REGISTRY_SCHEMA_VERSION,
  assetKinds: ASSET_KINDS,
  visibilities: ASSET_VISIBILITIES,
  lifecycleStates: ASSET_LIFECYCLE_STATES,
  referencePolicies: ASSET_REFERENCE_POLICIES,
  provenanceKinds: ASSET_PROVENANCE_KINDS,
  relationTypes: ASSET_RELATION_TYPES,
  cycleAllowedRelations: CYCLE_ALLOWED_RELATIONS,
  commands: ASSET_COMMAND_TYPES,
  events: ASSET_EVENT_TYPES,
  flags: ASSET_REGISTRY_FLAGS,
  storage: ASSET_STORAGE_BOUNDARY,
  limits: ASSET_REGISTRY_LIMITS,
});
