/*
 * WP-093 Versioned Tool Bridge API.
 *
 * This is an unloaded, transport-independent Core contract. It carries identity, capability,
 * compatibility, reference, cancellation, and bounded metadata only. It does not load DOM,
 * Canvas, Audio, browser storage, network, time, random, Supabase, or any Tool global state.
 */

import { AUTHORIZATION_PROOF_POLICY_VERSION, normalizeAuthorizationProof, resolveAuthorizationProofSync } from './core-authorization-proof-contracts.js';

export const TOOL_BRIDGE_SCHEMA_VERSION = 1;
export const BRIDGE_API_VERSIONS = Object.freeze(['1']);
export const BRIDGE_RECORD_VERSION_START = 1;

export const TOOL_DISPLAY_KINDS = Object.freeze([
  'DRAW',
  'DRAW2',
  'AUDIO',
  'GAME',
  'RUNTIME',
  'PIXFIND',
  'CAMERA_IMAGE',
  'MARKET_PACKAGE',
  'SOCIAL_CARD',
  'OTHER_REGISTERED',
]);

export const TOOL_AVAILABILITY_STATES = Object.freeze([
  'AVAILABLE',
  'UNAVAILABLE',
  'COMING_LATER',
  'RETIRED',
  'QUARANTINED',
]);

export const CORE_TOOL_IDS = Object.freeze([
  'pixiedraw',
  'pixiedraw2',
  'pixieaudio',
  'pixigame',
  'pixiruntime',
  'pixfind',
  'camera-image',
  'market-package',
  'social-card',
]);

export const TOOL_BRIDGE_CAPABILITIES = Object.freeze([
  'project.open',
  'project.create',
  'project.close',
  'project.import',
  'project.export',
  'project.validate-compatibility',
  'project.resolve-legacy',
  'project.copy',
  'project.prepare-migration',
  'project.get-capabilities',
  'asset.read',
  'asset.create',
  'asset.revision.create',
  'asset.live-reference',
  'asset.review-reference',
  'asset.fork',
  'asset.reference.attach',
  'asset.reference.detach',
  'asset.revision.resolve',
  'asset.compatibility.read',
  'preview.render',
  'preview.play',
  'package.create',
  'market.prepare',
  'game.consume-raster',
  'game.consume-audio',
  'audio.consume-raster',
  'legacy.pxd.read',
  'legacy.pixisync.read',
]);

export const BRIDGE_OPERATIONS = Object.freeze([
  'project.open',
  'project.create',
  'project.close',
  'project.import',
  'project.export',
  'project.validate-compatibility',
  'project.resolve-legacy',
  'project.copy',
  'project.prepare-migration',
  'project.get-capabilities',
  'asset.reference.import',
  'asset.reference.attach',
  'asset.reference.detach',
  'asset.revision.resolve',
  'asset.update.subscribe',
  'asset.review.request',
  'asset.review.accept',
  'asset.fork',
  'asset.revision.create',
  'asset.compatibility.read',
  'preview.render',
  'preview.play',
  'package.create',
  'market.prepare',
]);

export const BRIDGE_REFERENCE_POLICIES = Object.freeze(['LIVE', 'PINNED', 'REVIEW', 'FORKED']);
export const BRIDGE_COMPATIBILITY_STATES = Object.freeze([
  'SUPPORTED',
  'SUPPORTED_WITH_ADAPTER',
  'READ_ONLY',
  'COPY_REQUIRED',
  'REVIEW_REQUIRED',
  'UNSUPPORTED',
  'QUARANTINED',
]);
export const BRIDGE_EVENT_TYPES = Object.freeze([
  'INVALIDATE',
  'UPDATE_AVAILABLE',
  'REVISION_CHANGED',
]);
export const BRIDGE_STATUSES = Object.freeze([
  'ACCEPTED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'CONFLICT',
  'UNAVAILABLE',
]);
export const BRIDGE_RETRYABILITY = Object.freeze(['RETRYABLE', 'NOT_RETRYABLE', 'AFTER_REAUTH', 'AFTER_COMPATIBILITY']);

export const TOOL_BRIDGE_FLAGS = Object.freeze({
  read: 'tool-bridge-read',
  write: 'tool-bridge-write',
  liveEvents: 'tool-bridge-live-events',
  legacy: 'tool-bridge-legacy',
  package: 'tool-bridge-package',
  preview: 'tool-bridge-preview',
});

export const TOOL_BRIDGE_LIMITS = Object.freeze({
  id: 128,
  version: 64,
  capabilityCount: 128,
  referenceCount: 32,
  metadataBytes: 32768,
  metadataDepth: 6,
  eventChainDepth: 16,
  visitedToolCount: 16,
  subscriptionCount: 256,
  requestCount: 1024,
});

export const TOOL_BRIDGE_STORAGE_BOUNDARY = Object.freeze({
  bridge: 'identity-capability-reference-and-bounded-metadata-only',
  allowedReferences: Object.freeze(['projectId', 'assetId', 'revisionId', 'contentHash', 'packageId', 'storageHandleRef']),
  excludedFromBridge: Object.freeze([
    'raw-pixel-buffer',
    'audio-buffer',
    'wav-mp3-bytes',
    'pxd-body',
    'pixipackage-body',
    'game-build-bytes',
    'base64',
    'data-url',
    'unbounded-json',
    'full-editor-state',
  ]),
});

const TOOL_DESCRIPTOR_KEYS = new Set([
  'toolId', 'displayKind', 'bridgeApiVersion', 'toolVersion', 'supportedProjectKinds',
  'supportedAssetKinds', 'supportedImportFormats', 'supportedExportFormats', 'capabilities',
  'featureRequirements', 'minimumCoreVersion', 'maximumTestedCoreVersion', 'availabilityState',
  'legacyAdapterIds',
]);
const CAPABILITY_KEYS = new Set(['capabilityId', 'version', 'limits']);
const FORMAT_KEYS = new Set(['formatId', 'versions', 'requiredAdapter', 'readOnly', 'copyRequired', 'reviewRequired']);
const REFERENCE_KEYS = new Set(['projectId', 'assetId', 'revisionId', 'contentHash', 'packageId', 'storageHandleRef']);
const REQUEST_KEYS = new Set([
  'requestId', 'bridgeApiVersion', 'toolId', 'actorContextRef', 'projectId', 'assetRefs', 'operation',
  'capabilityVersion', 'correlationId', 'causationId', 'idempotencyKey', 'expectedVersion',
  'payloadMetadata', 'authorization', 'createdAt',
]);
const RESULT_KEYS = new Set([
  'requestId', 'status', 'resultReference', 'diagnostic', 'retryability', 'compatibilityWarnings',
  'updatedProjectReferences', 'updatedAssetReferences', 'correlationId', 'idempotentReplay',
]);
const EVENT_KEYS = new Set([
  'eventId', 'bridgeApiVersion', 'originToolId', 'targetToolId', 'eventType', 'projectId', 'assetId',
  'revisionId', 'correlationId', 'causationId', 'eventChainDepth', 'causationChain', 'visitedToolIds',
  'payloadMetadata',
]);

const OPERATION_CAPABILITIES = Object.freeze({
  'project.open': 'project.open',
  'project.create': 'project.create',
  'project.close': 'project.close',
  'project.import': 'project.import',
  'project.export': 'project.export',
  'project.validate-compatibility': 'project.validate-compatibility',
  'project.resolve-legacy': 'project.resolve-legacy',
  'project.copy': 'project.copy',
  'project.prepare-migration': 'project.prepare-migration',
  'project.get-capabilities': 'project.get-capabilities',
  'asset.reference.import': 'asset.read',
  'asset.reference.attach': 'asset.reference.attach',
  'asset.reference.detach': 'asset.reference.detach',
  'asset.revision.resolve': 'asset.revision.resolve',
  'asset.update.subscribe': 'asset.live-reference',
  'asset.review.request': 'asset.review-reference',
  'asset.review.accept': 'asset.review-reference',
  'asset.fork': 'asset.fork',
  'asset.revision.create': 'asset.revision.create',
  'asset.compatibility.read': 'asset.compatibility.read',
  'preview.render': 'preview.render',
  'preview.play': 'preview.play',
  'package.create': 'package.create',
  'market.prepare': 'market.prepare',
});

const WRITE_OPERATIONS = new Set([
  'project.create', 'project.close', 'project.import', 'project.export', 'project.copy',
  'project.prepare-migration', 'asset.reference.import', 'asset.reference.attach',
  'asset.reference.detach', 'asset.review.request', 'asset.review.accept', 'asset.fork',
  'asset.revision.create', 'package.create', 'market.prepare',
]);
const FLAG_BY_OPERATION = Object.freeze({
  'project.resolve-legacy': TOOL_BRIDGE_FLAGS.legacy,
  'asset.update.subscribe': TOOL_BRIDGE_FLAGS.liveEvents,
  'asset.review.request': TOOL_BRIDGE_FLAGS.liveEvents,
  'asset.review.accept': TOOL_BRIDGE_FLAGS.liveEvents,
  'preview.render': TOOL_BRIDGE_FLAGS.preview,
  'preview.play': TOOL_BRIDGE_FLAGS.preview,
  'package.create': TOOL_BRIDGE_FLAGS.package,
  'market.prepare': TOOL_BRIDGE_FLAGS.package,
});

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

function text(value, field, max = TOOL_BRIDGE_LIMITS.id) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('BRIDGE_VALUE_INVALID', `${field} must be a bounded stable string.`, field);
  }
  return value.trim();
}

function nullableText(value, field, max = TOOL_BRIDGE_LIMITS.id) {
  return value === null || value === undefined ? null : text(value, field, max);
}

function typedId(value, field) {
  const normalized = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(normalized)) fail('BRIDGE_TYPED_ID_INVALID', `${field} is not a valid typed ID.`, field);
  return normalized;
}

function version(value, field) {
  const normalized = text(value, field, TOOL_BRIDGE_LIMITS.version);
  if (!/^[0-9]+(?:\.[0-9]+){0,3}(?:[-+][A-Za-z0-9.-]+)?$/u.test(normalized)) fail('BRIDGE_VERSION_INVALID', `${field} is not a supported version string.`, field);
  return normalized;
}

function normalizeFormatVersion(value, field) {
  const normalized = text(value, field, TOOL_BRIDGE_LIMITS.version);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/u.test(normalized)) fail('BRIDGE_FORMAT_VERSION_INVALID', `${field} is not a supported format version.`, field);
  return normalized;
}

function enumValue(value, field, values) {
  if (!values.includes(value)) fail('BRIDGE_ENUM_UNSUPPORTED', `${field} is unsupported: ${String(value)}.`, field);
  return value;
}

function assertKeys(value, keys, field) {
  if (!isObject(value)) fail('BRIDGE_OBJECT_INVALID', `${field} must be an object.`, field);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail('BRIDGE_UNKNOWN_FIELD', `${field}.${key} is not part of the contract.`, `${field}.${key}`);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function assertBoundedMetadata(value, field = 'payloadMetadata', depth = 0) {
  if (depth > TOOL_BRIDGE_LIMITS.metadataDepth) fail('BRIDGE_METADATA_TOO_DEEP', `${field} exceeds the metadata depth limit.`, field);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return clone(value);
  if (typeof value === 'string') {
    if (value.length > 1024 || /^data:/iu.test(value)) fail('BRIDGE_BLOB_PAYLOAD_FORBIDDEN', `${field} cannot contain Blob/Base64/Data URL content.`, field);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 128) fail('BRIDGE_METADATA_TOO_LARGE', `${field} array exceeds the metadata limit.`, field);
    return value.map((item, index) => assertBoundedMetadata(item, `${field}[${index}]`, depth + 1));
  }
  if (!isObject(value)) fail('BRIDGE_METADATA_TYPE_INVALID', `${field} contains an unsupported value.`, field);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/blob|base64|dataurl|data-url|raw|bytes|buffer|pixel|audio|wav|mp3|pxdbody|packagebody/iu.test(key)) fail('BRIDGE_BLOB_PAYLOAD_FORBIDDEN', `${field}.${key} is not allowed in a Bridge payload.`, `${field}.${key}`);
    result[text(key, `${field}.key`, 96)] = assertBoundedMetadata(item, `${field}.${key}`, depth + 1);
  }
  const serialized = stableJson(result);
  if (serialized.length > TOOL_BRIDGE_LIMITS.metadataBytes) fail('BRIDGE_METADATA_TOO_LARGE', `${field} exceeds the metadata byte limit.`, field);
  return result;
}

function normalizeCapability(value, field = 'capability') {
  const input = typeof value === 'string' ? { capabilityId: value, version: '1', limits: {} } : value;
  assertKeys(input, CAPABILITY_KEYS, field);
  const capabilityId = text(input.capabilityId, `${field}.capabilityId`, 96);
  if (!TOOL_BRIDGE_CAPABILITIES.includes(capabilityId)) fail('BRIDGE_CAPABILITY_UNKNOWN', `Capability is not registered in the Core contract: ${capabilityId}.`, `${field}.capabilityId`);
  const limits = assertBoundedMetadata(input.limits || {}, `${field}.limits`);
  return { capabilityId, version: version(input.version || '1', `${field}.version`), limits };
}

function normalizeFormat(value, field) {
  const input = typeof value === 'string' ? { formatId: value, versions: ['1'] } : value;
  assertKeys(input, FORMAT_KEYS, field);
  const versions = Array.isArray(input.versions) && input.versions.length ? [...new Set(input.versions.map((item, index) => normalizeFormatVersion(item, `${field}.versions[${index}]`)))] : fail('BRIDGE_FORMAT_VERSION_INVALID', `${field}.versions must contain a version.`, `${field}.versions`);
  return {
    formatId: text(input.formatId, `${field}.formatId`, 96),
    versions,
    requiredAdapter: nullableText(input.requiredAdapter, `${field}.requiredAdapter`, 96),
    readOnly: input.readOnly === true,
    copyRequired: input.copyRequired === true,
    reviewRequired: input.reviewRequired === true,
  };
}

function normalizeToolDescriptor(descriptor) {
  assertKeys(descriptor, TOOL_DESCRIPTOR_KEYS, 'toolDescriptor');
  const capabilities = Array.isArray(descriptor.capabilities) ? descriptor.capabilities.map((item, index) => normalizeCapability(item, `toolDescriptor.capabilities[${index}]`)) : fail('BRIDGE_CAPABILITIES_INVALID', 'Tool capabilities must be an array.', 'toolDescriptor.capabilities');
  const capabilityIds = new Set();
  for (const capability of capabilities) {
    if (capabilityIds.has(capability.capabilityId)) fail('BRIDGE_CAPABILITY_DUPLICATE', 'Tool capability IDs must be unique.', 'toolDescriptor.capabilities');
    capabilityIds.add(capability.capabilityId);
  }
  const normalizeStringArray = (value, field) => {
    if (!Array.isArray(value)) fail('BRIDGE_DESCRIPTOR_ARRAY_INVALID', `${field} must be an array.`, field);
    return [...new Set(value.map((item, index) => text(item, `${field}[${index}]`, 96)))];
  };
  const normalizeFormats = (value, field) => {
    if (!Array.isArray(value)) fail('BRIDGE_DESCRIPTOR_ARRAY_INVALID', `${field} must be an array.`, field);
    return value.map((item, index) => normalizeFormat(item, `${field}[${index}]`));
  };
  const bridgeApiVersion = version(descriptor.bridgeApiVersion, 'toolDescriptor.bridgeApiVersion');
  if (!BRIDGE_API_VERSIONS.includes(bridgeApiVersion)) fail('BRIDGE_VERSION_UNSUPPORTED', 'Tool descriptor uses an unsupported Bridge API version.', 'toolDescriptor.bridgeApiVersion');
  const normalized = {
    toolId: typedId(descriptor.toolId, 'toolDescriptor.toolId'),
    displayKind: enumValue(descriptor.displayKind, 'toolDescriptor.displayKind', TOOL_DISPLAY_KINDS),
    bridgeApiVersion,
    toolVersion: version(descriptor.toolVersion, 'toolDescriptor.toolVersion'),
    supportedProjectKinds: normalizeStringArray(descriptor.supportedProjectKinds, 'toolDescriptor.supportedProjectKinds'),
    supportedAssetKinds: normalizeStringArray(descriptor.supportedAssetKinds, 'toolDescriptor.supportedAssetKinds'),
    supportedImportFormats: normalizeFormats(descriptor.supportedImportFormats, 'toolDescriptor.supportedImportFormats'),
    supportedExportFormats: normalizeFormats(descriptor.supportedExportFormats, 'toolDescriptor.supportedExportFormats'),
    capabilities: capabilities.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId)),
    featureRequirements: normalizeStringArray(descriptor.featureRequirements || [], 'toolDescriptor.featureRequirements'),
    minimumCoreVersion: version(descriptor.minimumCoreVersion, 'toolDescriptor.minimumCoreVersion'),
    maximumTestedCoreVersion: version(descriptor.maximumTestedCoreVersion, 'toolDescriptor.maximumTestedCoreVersion'),
    availabilityState: enumValue(descriptor.availabilityState, 'toolDescriptor.availabilityState', TOOL_AVAILABILITY_STATES),
    legacyAdapterIds: normalizeStringArray(descriptor.legacyAdapterIds || [], 'toolDescriptor.legacyAdapterIds'),
  };
  if (normalized.availabilityState === 'QUARANTINED') return normalized;
  return normalized;
}

function normalizeAuthorization(value, field = 'authorization') {
  try {
    return normalizeAuthorizationProof(value);
  } catch (error) {
    fail(error.code || 'BRIDGE_PERMISSION_DENIED', `${field} must be an AuthorizationProofV1: ${error.message}`, field);
  }
}

function normalizeReference(value, field = 'reference') {
  assertKeys(value, REFERENCE_KEYS, field);
  const result = {
    projectId: value.projectId === undefined ? null : nullableText(value.projectId, `${field}.projectId`),
    assetId: value.assetId === undefined ? null : nullableText(value.assetId, `${field}.assetId`),
    revisionId: value.revisionId === undefined ? null : nullableText(value.revisionId, `${field}.revisionId`),
    contentHash: value.contentHash === undefined ? null : nullableText(value.contentHash, `${field}.contentHash`, 128),
    packageId: value.packageId === undefined ? null : nullableText(value.packageId, `${field}.packageId`),
    storageHandleRef: value.storageHandleRef === undefined ? null : nullableText(value.storageHandleRef, `${field}.storageHandleRef`, 256),
  };
  if (!Object.values(result).some((item) => item !== null)) fail('BRIDGE_REFERENCE_EMPTY', `${field} must contain an identity reference.`, field);
  for (const key of ['projectId', 'assetId', 'revisionId', 'packageId']) if (result[key] !== null) result[key] = typedId(result[key], `${field}.${key}`);
  if (result.storageHandleRef !== null && !/^handle:[A-Za-z0-9._:-]{1,240}$/u.test(result.storageHandleRef)) fail('BRIDGE_STORAGE_HANDLE_INVALID', `${field}.storageHandleRef must be an opaque Handle reference.`, `${field}.storageHandleRef`);
  if (result.contentHash !== null && !/^[a-f0-9]{64}$/iu.test(result.contentHash)) fail('BRIDGE_CONTENT_HASH_INVALID', `${field}.contentHash must be a SHA-256 hex reference.`, `${field}.contentHash`);
  return result;
}

function normalizeRequest(request) {
  assertKeys(request, REQUEST_KEYS, 'request');
  const operation = enumValue(request.operation, 'request.operation', BRIDGE_OPERATIONS);
  const assetRefs = request.assetRefs === undefined ? [] : (Array.isArray(request.assetRefs) ? request.assetRefs.map((item, index) => normalizeReference(item, `request.assetRefs[${index}]`)) : fail('BRIDGE_REFERENCES_INVALID', 'request.assetRefs must be an array.', 'request.assetRefs'));
  if (assetRefs.length > TOOL_BRIDGE_LIMITS.referenceCount) fail('BRIDGE_REFERENCES_TOO_MANY', 'request.assetRefs exceeds the limit.', 'request.assetRefs');
  const expectedVersion = request.expectedVersion === null || request.expectedVersion === undefined ? null : request.expectedVersion;
  if (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)) fail('BRIDGE_EXPECTED_VERSION_INVALID', 'request.expectedVersion must be a positive safe integer.', 'request.expectedVersion');
  const normalized = {
    requestId: typedId(request.requestId, 'request.requestId'),
    bridgeApiVersion: version(request.bridgeApiVersion, 'request.bridgeApiVersion'),
    toolId: typedId(request.toolId, 'request.toolId'),
    actorContextRef: nullableText(request.actorContextRef, 'request.actorContextRef', 256),
    projectId: request.projectId === null || request.projectId === undefined ? null : typedId(request.projectId, 'request.projectId'),
    assetRefs,
    operation,
    capabilityVersion: version(request.capabilityVersion || '1', 'request.capabilityVersion'),
    correlationId: typedId(request.correlationId, 'request.correlationId'),
    causationId: nullableText(request.causationId, 'request.causationId'),
    idempotencyKey: typedId(request.idempotencyKey, 'request.idempotencyKey'),
    expectedVersion,
    payloadMetadata: assertBoundedMetadata(request.payloadMetadata || {}, 'request.payloadMetadata'),
    authorization: normalizeAuthorization(request.authorization),
    createdAt: text(request.createdAt, 'request.createdAt', 128),
  };
  if (!BRIDGE_API_VERSIONS.includes(normalized.bridgeApiVersion)) fail('BRIDGE_VERSION_UNSUPPORTED', 'Request uses an unsupported Bridge API version.', 'request.bridgeApiVersion');
  return normalized;
}

function normalizeDiagnostic(value) {
  if (value === null || value === undefined) return null;
  assertKeys(value, new Set(['code', 'severity', 'message', 'field', 'metadata']), 'diagnostic');
  return {
    code: text(value.code, 'diagnostic.code', 96),
    severity: enumValue(value.severity || 'error', 'diagnostic.severity', ['info', 'warning', 'error']),
    message: text(value.message, 'diagnostic.message', 512),
    field: nullableText(value.field, 'diagnostic.field', 128),
    metadata: assertBoundedMetadata(value.metadata || {}, 'diagnostic.metadata'),
  };
}

function normalizeResult(value) {
  assertKeys(value, RESULT_KEYS, 'result');
  const refs = (input, field) => (input === undefined ? [] : (Array.isArray(input) ? input.map((item, index) => normalizeReference(item, `${field}[${index}]`)) : fail('BRIDGE_REFERENCES_INVALID', `${field} must be an array.`, field)));
  const result = {
    requestId: typedId(value.requestId, 'result.requestId'),
    status: enumValue(value.status, 'result.status', BRIDGE_STATUSES),
    resultReference: value.resultReference === null || value.resultReference === undefined ? null : normalizeReference(value.resultReference, 'result.resultReference'),
    diagnostic: normalizeDiagnostic(value.diagnostic),
    retryability: enumValue(value.retryability || 'NOT_RETRYABLE', 'result.retryability', BRIDGE_RETRYABILITY),
    compatibilityWarnings: value.compatibilityWarnings === undefined ? [] : (Array.isArray(value.compatibilityWarnings) ? value.compatibilityWarnings.map((item, index) => text(item, `result.compatibilityWarnings[${index}]`, 512)) : fail('BRIDGE_WARNINGS_INVALID', 'result.compatibilityWarnings must be an array.', 'result.compatibilityWarnings')),
    updatedProjectReferences: refs(value.updatedProjectReferences, 'result.updatedProjectReferences'),
    updatedAssetReferences: refs(value.updatedAssetReferences, 'result.updatedAssetReferences'),
    correlationId: typedId(value.correlationId, 'result.correlationId'),
    idempotentReplay: value.idempotentReplay === true,
  };
  if (result.status === 'COMPLETED' && result.diagnostic?.severity === 'error') fail('BRIDGE_RESULT_CONFLICT', 'A completed result cannot contain an error diagnostic.', 'result');
  return result;
}

function normalizeEvent(event) {
  assertKeys(event, EVENT_KEYS, 'event');
  const chain = Array.isArray(event.causationChain) ? event.causationChain.map((item, index) => typedId(item, `event.causationChain[${index}]`)) : fail('BRIDGE_CAUSATION_CHAIN_INVALID', 'event.causationChain must be an array.', 'event.causationChain');
  const visited = Array.isArray(event.visitedToolIds) ? event.visitedToolIds.map((item, index) => typedId(item, `event.visitedToolIds[${index}]`)) : fail('BRIDGE_EVENT_VISIT_INVALID', 'event.visitedToolIds must be an array.', 'event.visitedToolIds');
  if (chain.length > TOOL_BRIDGE_LIMITS.eventChainDepth) fail('BRIDGE_EVENT_CHAIN_TOO_DEEP', 'Event causation chain exceeds the limit.', 'event.causationChain');
  if (new Set(chain).size !== chain.length) fail('BRIDGE_CAUSATION_CHAIN_CYCLE', 'Event causation chain contains a duplicate.', 'event.causationChain');
  if (new Set(visited).size !== visited.length) fail('BRIDGE_EVENT_VISIT_CYCLE', 'Event visited Tool chain contains a duplicate.', 'event.visitedToolIds');
  if (visited.length > TOOL_BRIDGE_LIMITS.visitedToolCount) fail('BRIDGE_EVENT_VISIT_TOO_DEEP', 'Event visited Tool chain exceeds the limit.', 'event.visitedToolIds');
  const causationId = nullableText(event.causationId, 'event.causationId');
  if (causationId !== null && chain[chain.length - 1] !== causationId) fail('BRIDGE_CAUSATION_CHAIN_INVALID', 'The final causation chain ID must equal causationId.', 'event.causationChain');
  const eventChainDepth = event.eventChainDepth === undefined ? chain.length : event.eventChainDepth;
  if (!Number.isSafeInteger(eventChainDepth) || eventChainDepth < 0 || eventChainDepth > TOOL_BRIDGE_LIMITS.eventChainDepth) fail('BRIDGE_EVENT_CHAIN_TOO_DEEP', 'event.eventChainDepth is outside the allowed range.', 'event.eventChainDepth');
  return {
    eventId: typedId(event.eventId, 'event.eventId'),
    bridgeApiVersion: version(event.bridgeApiVersion, 'event.bridgeApiVersion'),
    originToolId: typedId(event.originToolId, 'event.originToolId'),
    targetToolId: event.targetToolId === null || event.targetToolId === undefined ? null : typedId(event.targetToolId, 'event.targetToolId'),
    eventType: enumValue(event.eventType, 'event.eventType', BRIDGE_EVENT_TYPES),
    projectId: event.projectId === null || event.projectId === undefined ? null : typedId(event.projectId, 'event.projectId'),
    assetId: event.assetId === null || event.assetId === undefined ? null : typedId(event.assetId, 'event.assetId'),
    revisionId: event.revisionId === null || event.revisionId === undefined ? null : typedId(event.revisionId, 'event.revisionId'),
    correlationId: typedId(event.correlationId, 'event.correlationId'),
    causationId,
    eventChainDepth,
    causationChain: chain,
    visitedToolIds: visited,
    payloadMetadata: assertBoundedMetadata(event.payloadMetadata || {}, 'event.payloadMetadata'),
  };
}

function semverParts(value) {
  return value.split(/[.+-]/u).slice(0, 3).map((item) => Number.parseInt(item, 10));
}

function compareVersions(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  for (let index = 0; index < 3; index += 1) if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) - (b[index] || 0);
  return 0;
}

function formatMatch(formats, formatId, formatVersion) {
  return formats.find((item) => item.formatId === formatId) || null;
}

function capabilityFor(descriptor, capabilityId) {
  return descriptor.capabilities.find((item) => item.capabilityId === capabilityId) || null;
}

function defaultReferenceResult(request, overrides = {}) {
  const defaultReference = request.projectId ? { projectId: request.projectId } : (request.assetRefs[0] || null);
  return {
    requestId: request.requestId,
    status: 'COMPLETED',
    resultReference: defaultReference,
    diagnostic: null,
    retryability: 'NOT_RETRYABLE',
    compatibilityWarnings: [],
    updatedProjectReferences: request.projectId ? [{ projectId: request.projectId }] : [],
    updatedAssetReferences: request.assetRefs,
    correlationId: request.correlationId,
    idempotentReplay: false,
    ...overrides,
  };
}

export function validateToolDescriptor(descriptor) {
  try {
    return { valid: true, value: normalizeToolDescriptor(descriptor), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [{ code: error.code || 'BRIDGE_DESCRIPTOR_INVALID', severity: 'error', message: error.message, field: error.field || null }] };
  }
}

export function validateBridgeRequest(request) {
  try {
    return { valid: true, value: normalizeRequest(request), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [{ code: error.code || 'BRIDGE_REQUEST_INVALID', severity: 'error', message: error.message, field: error.field || null }] };
  }
}

export function validateBridgeEvent(event) {
  try {
    return { valid: true, value: normalizeEvent(event), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [{ code: error.code || 'BRIDGE_EVENT_INVALID', severity: 'error', message: error.message, field: error.field || null }] };
  }
}

export function createBridgeRequest({
  requestId,
  bridgeApiVersion = '1',
  toolId,
  actorContextRef = null,
  projectId = null,
  assetRefs = [],
  operation,
  capabilityVersion = '1',
  correlationId,
  causationId = null,
  idempotencyKey,
  expectedVersion = null,
  payloadMetadata = {},
  authorization,
  createdAt,
} = {}) {
  return normalizeRequest({ requestId, bridgeApiVersion, toolId, actorContextRef, projectId, assetRefs, operation, capabilityVersion, correlationId, causationId, idempotencyKey, expectedVersion, payloadMetadata, authorization, createdAt });
}

export function createBridgeEvent({
  eventId,
  bridgeApiVersion = '1',
  originToolId,
  targetToolId = null,
  eventType,
  projectId = null,
  assetId = null,
  revisionId = null,
  correlationId,
  causationId = null,
  eventChainDepth = 0,
  causationChain = [],
  visitedToolIds = [],
  payloadMetadata = {},
} = {}) {
  return normalizeEvent({ eventId, bridgeApiVersion, originToolId, targetToolId, eventType, projectId, assetId, revisionId, correlationId, causationId, eventChainDepth, causationChain, visitedToolIds, payloadMetadata });
}

export function createToolBridge({
  clock = null,
  idGenerator = null,
  transport = null,
  permissionEvaluator = null,
  featureFlagEvaluator = null,
  handlers = {},
  supportedCoreVersion = '1.0.0',
} = {}) {
  const state = {
    tools: Object.create(null),
    requests: Object.create(null),
    idempotency: Object.create(null),
    subscriptions: Object.create(null),
    events: Object.create(null),
    eventDeliveries: [],
  };
  const now = () => {
    if (typeof clock !== 'function') fail('BRIDGE_CLOCK_ADAPTER_MISSING', 'A host clock adapter is required for Bridge operations.');
    return text(clock(), 'createdAt', 128);
  };
  const nextId = (kind) => {
    if (typeof idGenerator !== 'function') fail('BRIDGE_ID_ADAPTER_MISSING', 'A host ID adapter is required for Bridge operations.');
    return typedId(idGenerator(kind), `${kind}Id`);
  };
  const getTool = (toolId) => state.tools[toolId] || null;
  const requireTool = (toolId) => getTool(toolId) || fail('BRIDGE_TOOL_UNKNOWN', `Tool is not registered: ${toolId}.`, 'toolId');
  const requireRegistrationDecision = (decision, descriptor) => {
    if (typeof permissionEvaluator !== 'function') fail('BRIDGE_AUTHZ_EVALUATOR_REQUIRED', 'Tool registration requires a server-owned Authorization evaluator.', 'registrationDecision');
    const resolved = resolveAuthorizationProofSync({
      expected: { principalId: decision?.principalId ?? null, resourceType: 'TOOL', resourceId: descriptor.toolId, action: 'tool.register', capability: 'tool.register', tenantId: decision?.tenantId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
      callerProof: decision,
      authorizationEvaluator: (input) => permissionEvaluator({ principalId: input.principalId, actorId: input.principalId, resourceType: input.resourceType, resourceId: input.resourceId, action: input.action, capability: input.capability, tenantId: input.tenantId, source: 'server' }),
    });
    if (resolved.decision !== 'allow') fail('BRIDGE_TOOL_REGISTRATION_UNTRUSTED', 'Tool registration was denied by the server AuthorizationProof.', 'registrationDecision');
  };
  const evaluateFlag = ({ flagId, action, request = null, toolId = null }) => {
    if (typeof featureFlagEvaluator !== 'function') fail('BRIDGE_FLAG_EVALUATOR_MISSING', 'Bridge Feature Flag evaluation must be injected by the host.');
    const result = featureFlagEvaluator({ flagId, action, request: request ? clone(request) : null, toolId });
    if (!result || result.enabled !== true || result.decision !== 'enabled') fail(result?.code === 'FEATURE_FLAG_KILL_SWITCH' ? 'BRIDGE_KILL_SWITCH' : 'BRIDGE_FLAG_OFF', 'Bridge Feature Flag denied this operation.', null, { flagId, action, decision: result?.decision || 'unknown' });
    return clone(result);
  };
  const evaluatePermission = (request) => {
    const requiredCapability = OPERATION_CAPABILITIES[request.operation];
    if (typeof permissionEvaluator !== 'function') fail('BRIDGE_AUTHZ_EVALUATOR_REQUIRED', 'Bridge requests require a server-owned Authorization evaluator.', 'authorization');
    try {
      const resolved = resolveAuthorizationProofSync({
        expected: { principalId: request.authorization.principalId, resourceType: 'TOOL', resourceId: request.toolId, action: request.operation, capability: requiredCapability, tenantId: request.authorization.tenantId, correlationId: request.correlationId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
        callerProof: request.authorization,
        authorizationEvaluator: (input) => permissionEvaluator({
          principalId: input.principalId,
          actorId: input.principalId,
          projectId: request.projectId,
          assetRefs: clone(request.assetRefs),
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          operation: input.action,
          capability: input.capability,
          tenantId: input.tenantId,
          correlationId: input.correlationId,
          source: 'server',
        }),
      });
      if (resolved.decision !== 'allow') fail('BRIDGE_PERMISSION_DENIED', 'The server AuthorizationProof denied the Bridge request.', 'authorization');
    } catch (error) {
      fail(error.code || 'BRIDGE_PERMISSION_DENIED', error.message, 'authorization');
    }
  };
  const requiredFlag = (request) => {
    const action = WRITE_OPERATIONS.has(request.operation) ? 'write' : 'read';
    const flagId = FLAG_BY_OPERATION[request.operation] || (action === 'write' ? TOOL_BRIDGE_FLAGS.write : TOOL_BRIDGE_FLAGS.read);
    return { flagId, action };
  };
  const verifyCapability = (request, descriptor) => {
    const capabilityId = OPERATION_CAPABILITIES[request.operation];
    const capability = capabilityFor(descriptor, capabilityId);
    if (!capability) fail('BRIDGE_CAPABILITY_UNAVAILABLE', `Tool does not provide capability: ${capabilityId}.`, 'operation');
    if (compareVersions(request.capabilityVersion, capability.version) > 0) fail('BRIDGE_CAPABILITY_VERSION_UNSUPPORTED', 'Requested Capability Version exceeds the Tool capability version.', 'capabilityVersion');
    return capability;
  };
  const gateRequest = (request) => {
    const descriptor = requireTool(request.toolId);
    if (descriptor.availabilityState !== 'AVAILABLE') fail('BRIDGE_TOOL_UNAVAILABLE', 'Tool is not available for Bridge execution.', 'toolId', { availabilityState: descriptor.availabilityState });
    if (descriptor.bridgeApiVersion !== request.bridgeApiVersion) fail('BRIDGE_VERSION_MISMATCH', 'Tool and Request Bridge API versions do not match.', 'bridgeApiVersion');
    verifyCapability(request, descriptor);
    const flag = requiredFlag(request);
    evaluateFlag({ flagId: flag.flagId, action: flag.action, request, toolId: request.toolId });
    evaluatePermission(request);
    return descriptor;
  };
  const resultForFailure = (request, error, status = 'REJECTED') => ({
    requestId: request.requestId,
    status,
    resultReference: null,
    diagnostic: {
      code: error.code || 'BRIDGE_REQUEST_FAILED',
      severity: 'error',
      message: error.code ? 'Bridge request was rejected by the Core contract.' : 'Bridge request failed in an isolated handler.',
      field: error.field || null,
      metadata: error.metadata || {},
    },
    retryability: error.code === 'BRIDGE_FLAG_OFF' || error.code === 'BRIDGE_KILL_SWITCH' ? 'NOT_RETRYABLE' : 'AFTER_COMPATIBILITY',
    compatibilityWarnings: [],
    updatedProjectReferences: [],
    updatedAssetReferences: [],
    correlationId: request.correlationId,
    idempotentReplay: false,
  });
  const requestFingerprint = (request) => stableJson({ ...request, requestId: null, correlationId: null, causationId: null, createdAt: null });

  function registerTool(descriptor, { registrationDecision } = {}) {
    const normalized = normalizeToolDescriptor(descriptor);
    requireRegistrationDecision(registrationDecision, normalized);
    if (state.tools[normalized.toolId]) fail('BRIDGE_TOOL_DUPLICATE', 'Tool ID is already registered.', 'toolDescriptor.toolId');
    if (compareVersions(supportedCoreVersion, normalized.minimumCoreVersion) < 0 || compareVersions(supportedCoreVersion, normalized.maximumTestedCoreVersion) > 0) fail('BRIDGE_CORE_VERSION_CONFLICT', 'Tool Core Version range does not include the supported Core version.', 'toolDescriptor.minimumCoreVersion');
    state.tools[normalized.toolId] = normalized;
    return clone(normalized);
  }

  function negotiateCapabilities({ toolId, toolVersion = null, requestedCapabilities = [], advertisedCapabilities = null, authorization } = {}) {
    const descriptor = requireTool(typedId(toolId, 'toolId'));
    const auth = normalizeAuthorization(authorization);
    if (toolVersion !== null && compareVersions(version(toolVersion, 'toolVersion'), descriptor.toolVersion) !== 0) fail('BRIDGE_TOOL_VERSION_UNSUPPORTED', 'Tool Version is not the registered tested Tool Version.', 'toolVersion');
    evaluateFlag({ flagId: TOOL_BRIDGE_FLAGS.read, action: 'read', toolId: descriptor.toolId });
    const resolved = resolveAuthorizationProofSync({
      expected: { principalId: auth.principalId, resourceType: 'TOOL', resourceId: descriptor.toolId, action: 'project.get-capabilities', capability: 'project.get-capabilities', tenantId: auth.tenantId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
      callerProof: auth,
      authorizationEvaluator: (input) => permissionEvaluator?.({ principalId: input.principalId, actorId: input.principalId, resourceType: input.resourceType, resourceId: input.resourceId, operation: input.action, capability: input.capability, tenantId: input.tenantId, source: 'server' }),
    });
    if (resolved.decision !== 'allow') fail('BRIDGE_PERMISSION_DENIED', 'Capability negotiation was denied by server authorization.');
    if (!Array.isArray(requestedCapabilities) || requestedCapabilities.length > TOOL_BRIDGE_LIMITS.capabilityCount) fail('BRIDGE_CAPABILITIES_INVALID', 'requestedCapabilities must be a bounded array.', 'requestedCapabilities');
    if (advertisedCapabilities !== null) {
      const advertised = advertisedCapabilities.map((item, index) => normalizeCapability(item, `advertisedCapabilities[${index}]`));
      const registeredIds = descriptor.capabilities.map((item) => `${item.capabilityId}:${item.version}`).sort();
      const advertisedIds = advertised.map((item) => `${item.capabilityId}:${item.version}`).sort();
      if (stableJson(registeredIds) !== stableJson(advertisedIds)) fail('BRIDGE_CAPABILITY_SPOOF', 'Tool-advertised capabilities do not match the trusted registration.', 'advertisedCapabilities');
    }
    const selected = (requestedCapabilities.length ? requestedCapabilities : descriptor.capabilities.map((item) => item.capabilityId)).map((item, index) => {
      const requested = normalizeCapability(item, `requestedCapabilities[${index}]`);
      const registered = capabilityFor(descriptor, requested.capabilityId);
      if (!registered) fail('BRIDGE_CAPABILITY_UNKNOWN', `Capability is not registered for the Tool: ${requested.capabilityId}.`, `requestedCapabilities[${index}]`);
      if (compareVersions(requested.version, registered.version) > 0) fail('BRIDGE_CAPABILITY_VERSION_UNSUPPORTED', 'Requested capability version is unsupported.', `requestedCapabilities[${index}].version`);
      return { capabilityId: registered.capabilityId, version: registered.version, limits: clone(registered.limits), granted: true };
    });
    return { toolId: descriptor.toolId, bridgeApiVersion: descriptor.bridgeApiVersion, toolVersion: descriptor.toolVersion, capabilities: selected };
  }

  function validateCompatibility({ toolId, toolVersion = null, projectKind = null, assetKind = null, formatId, formatVersion, direction = 'import', legacyState = null } = {}) {
    const descriptor = requireTool(typedId(toolId, 'toolId'));
    const normalizedFormatId = text(formatId, 'formatId', 96);
    const normalizedFormatVersion = normalizeFormatVersion(formatVersion, 'formatVersion');
    const warnings = [];
    if (legacyState === 'QUARANTINED') return { state: 'QUARANTINED', toolId: descriptor.toolId, toolVersion: toolVersion || descriptor.toolVersion, formatId: normalizedFormatId, formatVersion: normalizedFormatVersion, requiredAdapter: null, unsupportedFeatures: ['legacy mapping quarantine'], warnings: ['Legacy mapping is quarantined and requires explicit resolution.'], dataLossRisk: 'unknown', copyRequired: true };
    if (toolVersion !== null && compareVersions(version(toolVersion, 'toolVersion'), descriptor.toolVersion) !== 0) warnings.push('Requested Tool Version differs from the registered tested Tool Version.');
    if (projectKind !== null && !descriptor.supportedProjectKinds.includes(projectKind)) return { state: 'UNSUPPORTED', toolId: descriptor.toolId, toolVersion: toolVersion || descriptor.toolVersion, formatId: normalizedFormatId, formatVersion: normalizedFormatVersion, requiredAdapter: null, unsupportedFeatures: [`projectKind:${projectKind}`], warnings, dataLossRisk: 'high', copyRequired: false };
    if (assetKind !== null && !descriptor.supportedAssetKinds.includes(assetKind)) return { state: 'UNSUPPORTED', toolId: descriptor.toolId, toolVersion: toolVersion || descriptor.toolVersion, formatId: normalizedFormatId, formatVersion: normalizedFormatVersion, requiredAdapter: null, unsupportedFeatures: [`assetKind:${assetKind}`], warnings, dataLossRisk: 'high', copyRequired: false };
    const formats = direction === 'export' ? descriptor.supportedExportFormats : descriptor.supportedImportFormats;
    const match = formatMatch(formats, normalizedFormatId, normalizedFormatVersion);
    const otherDirection = direction === 'export' ? descriptor.supportedImportFormats : descriptor.supportedExportFormats;
    if (!match) {
      const other = formatMatch(otherDirection, normalizedFormatId, normalizedFormatVersion);
      return { state: other ? 'READ_ONLY' : 'UNSUPPORTED', toolId: descriptor.toolId, toolVersion: toolVersion || descriptor.toolVersion, formatId: normalizedFormatId, formatVersion: normalizedFormatVersion, requiredAdapter: null, unsupportedFeatures: other ? [`direction:${direction}`] : [`format:${normalizedFormatId}@${normalizedFormatVersion}`], warnings, dataLossRisk: other ? 'low' : 'high', copyRequired: false };
    }
    if (!match.versions.includes(normalizedFormatVersion)) return { state: match.requiredAdapter ? 'SUPPORTED_WITH_ADAPTER' : 'UNSUPPORTED', toolId: descriptor.toolId, toolVersion: toolVersion || descriptor.toolVersion, formatId: normalizedFormatId, formatVersion: normalizedFormatVersion, requiredAdapter: match.requiredAdapter, unsupportedFeatures: [`formatVersion:${normalizedFormatVersion}`], warnings: [...warnings, 'Format Version is outside the registered exact match.'], dataLossRisk: match.requiredAdapter ? 'medium' : 'high', copyRequired: true };
    let stateName = 'SUPPORTED';
    if (match.reviewRequired) stateName = 'REVIEW_REQUIRED';
    else if (match.requiredAdapter) stateName = 'SUPPORTED_WITH_ADAPTER';
    else if (match.copyRequired) stateName = 'COPY_REQUIRED';
    return { state: stateName, toolId: descriptor.toolId, toolVersion: toolVersion || descriptor.toolVersion, formatId: normalizedFormatId, formatVersion: normalizedFormatVersion, requiredAdapter: match.requiredAdapter, unsupportedFeatures: [], warnings, dataLossRisk: match.requiredAdapter || match.copyRequired ? 'medium' : 'none', copyRequired: match.copyRequired || Boolean(match.requiredAdapter) };
  }

  function beginRequest(request) {
    let normalized;
    try {
      normalized = normalizeRequest(request);
      gateRequest(normalized);
      const fingerprint = requestFingerprint(normalized);
      const previousByIdempotency = state.idempotency[normalized.idempotencyKey];
      if (previousByIdempotency) {
        if (previousByIdempotency.fingerprint !== fingerprint) {
          const conflict = resultForFailure(normalized, Object.assign(new Error('Idempotency key was reused with different request data.'), { code: 'BRIDGE_IDEMPOTENCY_CONFLICT', field: 'idempotencyKey' }), 'CONFLICT');
          return conflict;
        }
        return { ...clone(previousByIdempotency.result), requestId: normalized.requestId, idempotentReplay: true };
      }
      if (state.requests[normalized.requestId]) return resultForFailure(normalized, Object.assign(new Error('Request ID is already registered.'), { code: 'BRIDGE_REQUEST_DUPLICATE', field: 'requestId' }), 'CONFLICT');
      if (Object.keys(state.requests).length >= TOOL_BRIDGE_LIMITS.requestCount) return resultForFailure(normalized, Object.assign(new Error('Bridge request limit reached.'), { code: 'BRIDGE_REQUEST_LIMIT' }), 'UNAVAILABLE');
      const accepted = defaultReferenceResult(normalized, { status: 'ACCEPTED', retryability: 'RETRYABLE', resultReference: { projectId: normalized.projectId }, updatedProjectReferences: [], updatedAssetReferences: normalized.assetRefs });
      state.requests[normalized.requestId] = { request: normalized, fingerprint, status: 'PENDING', result: accepted };
      state.idempotency[normalized.idempotencyKey] = { fingerprint, result: accepted };
      return clone(accepted);
    } catch (error) {
      if (!normalized) {
        const fallback = { requestId: request?.requestId || 'invalid-request', correlationId: request?.correlationId || 'invalid-correlation' };
        return resultForFailure(fallback, error);
      }
      return resultForFailure(normalized, error);
    }
  }

  function completeRequest(requestId, outcome = {}) {
    const id = typedId(requestId, 'requestId');
    const record = state.requests[id];
    if (!record) return { ok: false, diagnostics: [{ code: 'BRIDGE_REQUEST_UNKNOWN', severity: 'error', message: 'Request ID is not pending.' }] };
    if (record.status !== 'PENDING') return { ok: false, diagnostics: [{ code: 'BRIDGE_REQUEST_ALREADY_FINAL', severity: 'error', message: 'Request is already complete or cancelled.' }], result: clone(record.result) };
    const result = normalizeResult({ ...defaultReferenceResult(record.request), ...outcome, requestId: id, correlationId: record.request.correlationId });
    record.status = result.status === 'CANCELLED' ? 'CANCELLED' : 'COMPLETED';
    record.result = result;
    state.idempotency[record.request.idempotencyKey].result = result;
    return { ok: true, result: clone(result) };
  }

  function cancelRequest(requestId, { reason = 'cancelled-by-host' } = {}) {
    const id = typedId(requestId, 'requestId');
    const record = state.requests[id];
    if (!record) return { ok: false, diagnostics: [{ code: 'BRIDGE_REQUEST_UNKNOWN', severity: 'error', message: 'Request ID is not pending.' }] };
    if (record.status !== 'PENDING') return { ok: false, diagnostics: [{ code: 'BRIDGE_CANCEL_TOO_LATE', severity: 'error', message: 'Cancellation arrived after the request was finalized.' }], result: clone(record.result) };
    const result = resultForFailure(record.request, Object.assign(new Error('Request was cancelled before completion.'), { code: 'BRIDGE_CANCELLED', field: 'reason', metadata: { reason: text(reason, 'reason', 256) } }), 'CANCELLED');
    result.retryability = 'RETRYABLE';
    record.status = 'CANCELLED';
    record.result = result;
    state.idempotency[record.request.idempotencyKey].result = result;
    return { ok: true, result: clone(result) };
  }

  function executeRequest(request) {
    const accepted = beginRequest(request);
    if (accepted.idempotentReplay || accepted.status !== 'ACCEPTED') return accepted;
    const normalized = state.requests[accepted.requestId]?.request;
    const handler = handlers[normalized.operation];
    if (typeof handler !== 'function') return completeRequest(normalized.requestId, { status: 'UNAVAILABLE', retryability: 'AFTER_COMPATIBILITY', diagnostic: { code: 'BRIDGE_OPERATION_UNAVAILABLE', severity: 'error', message: 'No Tool handler is registered for this operation.', field: 'operation', metadata: {} } }).result;
    try {
      const outcome = handler({ request: clone(normalized), operation: normalized.operation, tool: clone(getTool(normalized.toolId)) });
      return completeRequest(normalized.requestId, outcome || {}).result;
    } catch (error) {
      return completeRequest(normalized.requestId, resultForFailure(normalized, Object.assign(new Error('Bridge handler failed.'), { code: error.code || 'BRIDGE_HANDLER_FAILURE' }))).result;
    }
  }

  function subscribeAssetUpdates({ subscriptionId = null, toolId, assetId, callback, authorization } = {}) {
    const descriptor = requireTool(typedId(toolId, 'toolId'));
    const auth = normalizeAuthorization(authorization);
    const resolved = resolveAuthorizationProofSync({
      expected: { principalId: auth.principalId, resourceType: 'ASSET', resourceId: assetId, action: 'asset.update.subscribe', capability: 'asset.update.subscribe', tenantId: auth.tenantId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
      callerProof: auth,
      authorizationEvaluator: (input) => permissionEvaluator?.({ principalId: input.principalId, actorId: input.principalId, toolId: descriptor.toolId, resourceType: input.resourceType, resourceId: input.resourceId, operation: input.action, capability: input.capability, tenantId: input.tenantId, source: 'server' }),
    });
    if (resolved.decision !== 'allow') fail('BRIDGE_PERMISSION_DENIED', 'Asset subscription was denied by server authorization.');
    evaluateFlag({ flagId: TOOL_BRIDGE_FLAGS.liveEvents, action: 'read', toolId: descriptor.toolId });
    if (typeof callback !== 'function') fail('BRIDGE_SUBSCRIPTION_CALLBACK_INVALID', 'An in-memory callback adapter is required for synthetic subscriptions.', 'callback');
    const id = subscriptionId ? typedId(subscriptionId, 'subscriptionId') : nextId('subscription');
    const normalizedAssetId = typedId(assetId, 'assetId');
    if (state.subscriptions[id]) fail('BRIDGE_SUBSCRIPTION_DUPLICATE', 'Subscription ID is already registered.', 'subscriptionId');
    state.subscriptions[id] = { subscriptionId: id, toolId: descriptor.toolId, assetId: normalizedAssetId, callback, actorId: auth.principalId };
    return { subscriptionId: id, toolId: descriptor.toolId, assetId: normalizedAssetId, active: true };
  }

  function unsubscribeAssetUpdates(subscriptionId) {
    const id = typedId(subscriptionId, 'subscriptionId');
    if (!state.subscriptions[id]) return { ok: false, diagnostics: [{ code: 'BRIDGE_SUBSCRIPTION_UNKNOWN', severity: 'error', message: 'Subscription is not registered.' }] };
    delete state.subscriptions[id];
    return { ok: true, subscriptionId: id };
  }

  function emitEvent(event) {
    let normalized;
    try {
      normalized = normalizeEvent(event);
      if (!BRIDGE_API_VERSIONS.includes(normalized.bridgeApiVersion)) fail('BRIDGE_VERSION_UNSUPPORTED', 'Event uses an unsupported Bridge API version.', 'event.bridgeApiVersion');
      requireTool(normalized.originToolId);
      if (normalized.targetToolId !== null) requireTool(normalized.targetToolId);
      if (normalized.visitedToolIds.includes(normalized.originToolId)) fail('BRIDGE_EVENT_CYCLE', 'Origin Tool already exists in the event chain.', 'event.visitedToolIds');
      if (normalized.targetToolId !== null && normalized.visitedToolIds.includes(normalized.targetToolId)) fail('BRIDGE_EVENT_CYCLE', 'Target Tool already exists in the event chain.', 'event.targetToolId');
      if (normalized.causationId !== null && !state.events[normalized.causationId]) fail('BRIDGE_CAUSATION_UNKNOWN', 'Event causation ID is not known to this Bridge instance.', 'event.causationId');
      if (state.events[normalized.eventId]) fail('BRIDGE_EVENT_DUPLICATE', 'Event ID has already been delivered.', 'event.eventId');
      const eventFlag = evaluateFlag({ flagId: TOOL_BRIDGE_FLAGS.liveEvents, action: 'write', toolId: normalized.originToolId });
      state.events[normalized.eventId] = normalized;
      const recipients = Object.values(state.subscriptions).filter((subscription) => subscription.assetId === normalized.assetId && (normalized.targetToolId === null || subscription.toolId === normalized.targetToolId) && subscription.toolId !== normalized.originToolId);
      for (const subscription of recipients) {
        subscription.callback(clone(normalized));
        state.eventDeliveries.push({ eventId: normalized.eventId, subscriptionId: subscription.subscriptionId });
      }
      if (transport && typeof transport.send === 'function') transport.send({ kind: 'tool-bridge-event', event: clone(normalized) });
      return { ok: true, event: clone(normalized), delivered: recipients.length, flag: eventFlag };
    } catch (error) {
      return { ok: false, event: null, delivered: 0, diagnostics: [{ code: error.code || 'BRIDGE_EVENT_REJECTED', severity: 'error', message: error.message, field: error.field || null }] };
    }
  }

  function snapshot() {
    return clone({
      schemaVersion: TOOL_BRIDGE_SCHEMA_VERSION,
      tools: state.tools,
      requests: Object.fromEntries(Object.entries(state.requests).map(([key, value]) => [key, { request: value.request, status: value.status, result: value.result }])),
      subscriptions: Object.fromEntries(Object.entries(state.subscriptions).map(([key, value]) => [key, { subscriptionId: value.subscriptionId, toolId: value.toolId, assetId: value.assetId, actorId: value.actorId }])),
      events: state.events,
      eventDeliveries: state.eventDeliveries,
      storageBoundary: TOOL_BRIDGE_STORAGE_BOUNDARY,
      flags: TOOL_BRIDGE_FLAGS,
    });
  }

  return Object.freeze({
    registerTool,
    getTool: (toolId) => clone(getTool(typedId(toolId, 'toolId'))),
    negotiateCapabilities,
    validateCompatibility,
    beginRequest,
    completeRequest,
    cancelRequest,
    executeRequest,
    subscribeAssetUpdates,
    unsubscribeAssetUpdates,
    emitEvent,
    snapshot,
  });
}

export const TOOL_BRIDGE_CONTRACT = Object.freeze({
  schemaVersion: TOOL_BRIDGE_SCHEMA_VERSION,
  bridgeApiVersions: BRIDGE_API_VERSIONS,
  operations: BRIDGE_OPERATIONS,
  capabilities: TOOL_BRIDGE_CAPABILITIES,
  compatibilityStates: BRIDGE_COMPATIBILITY_STATES,
  referencePolicies: BRIDGE_REFERENCE_POLICIES,
  events: BRIDGE_EVENT_TYPES,
  flags: TOOL_BRIDGE_FLAGS,
  storageBoundary: TOOL_BRIDGE_STORAGE_BOUNDARY,
});
