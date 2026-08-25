/*
 * WP-096 Search Index Core.
 *
 * This is an unloaded, framework-free reference projection. Search is derived state: it is never
 * an authorization authority or a canonical resource store. The default backend is in-memory and
 * every external concern (clock, feature flags, Event trust, authorization, and backend storage)
 * is injected. No DOM, Canvas, browser storage, network, Supabase, timer, payment, SNS, or editor
 * high-frequency operation is used here.
 */

import { AUTHORIZATION_PROOF_POLICY_VERSION, normalizeAuthorizationProof, resolveAuthorizationProofSync } from './core-authorization-proof-contracts.js';

import {
  EVENT_CATALOG,
  EVENT_TYPES,
  EVENT_VISIBILITY_CLASSES,
  validateEventEnvelope,
} from './core-event-activity-contracts.js';

export const SEARCH_CORE_SCHEMA_VERSION = 1;
export const SEARCH_DOCUMENT_VERSION = 1;
export const SEARCH_QUERY_VERSION = 1;

export const SEARCH_RESOURCE_CATALOG = Object.freeze({
  PROJECT: Object.freeze({ resourceType: 'PROJECT', supported: true, publicDiscovery: true }),
  ASSET: Object.freeze({ resourceType: 'ASSET', supported: true, publicDiscovery: true }),
  PACKAGE: Object.freeze({ resourceType: 'PACKAGE', supported: true, publicDiscovery: true }),
  CREATOR: Object.freeze({ resourceType: 'CREATOR', supported: true, publicDiscovery: true }),
  MARKET_PRODUCT: Object.freeze({ resourceType: 'MARKET_PRODUCT', supported: false, publicDiscovery: false }),
  GAME: Object.freeze({ resourceType: 'GAME', supported: false, publicDiscovery: false }),
  AUDIO: Object.freeze({ resourceType: 'AUDIO', supported: false, publicDiscovery: false }),
  DRAW_WORK: Object.freeze({ resourceType: 'DRAW_WORK', supported: false, publicDiscovery: false }),
  COLLECTION: Object.freeze({ resourceType: 'COLLECTION', supported: false, publicDiscovery: false }),
  SOCIAL_POST: Object.freeze({ resourceType: 'SOCIAL_POST', supported: false, publicDiscovery: false }),
  COMMUNITY: Object.freeze({ resourceType: 'COMMUNITY', supported: false, publicDiscovery: false }),
  BOARD_THREAD: Object.freeze({ resourceType: 'BOARD_THREAD', supported: false, publicDiscovery: false }),
  COMMISSION_REQUEST: Object.freeze({ resourceType: 'COMMISSION_REQUEST', supported: false, publicDiscovery: false }),
});
export const SEARCH_RESOURCE_TYPES = Object.freeze(
  Object.values(SEARCH_RESOURCE_CATALOG).filter((item) => item.supported).map((item) => item.resourceType),
);
export const SEARCH_RESERVED_RESOURCE_TYPES = Object.freeze(
  Object.values(SEARCH_RESOURCE_CATALOG).filter((item) => !item.supported).map((item) => item.resourceType),
);

export const SEARCH_VISIBILITY_CLASSES = EVENT_VISIBILITY_CLASSES;
export const SEARCH_VISIBILITY_SCOPES = Object.freeze([
  'PUBLIC_DISCOVERY',
  'MEMBER_SCOPED',
  'CREATOR_SCOPED',
  'OWNER_SCOPED',
]);
export const SEARCH_FLAGS = Object.freeze({
  read: 'search-index-read',
  write: 'search-index-write',
  events: 'search-index-events',
  publicDiscovery: 'search-public-discovery',
  memberScope: 'search-member-scope',
  rebuild: 'search-rebuild',
});

export const SEARCH_LIFECYCLE_STATES = Object.freeze([
  'ACTIVE', 'ARCHIVED', 'BUILDING', 'VERIFYING', 'READY', 'FAILED', 'TRASHED', 'QUARANTINED', 'MIGRATING',
]);

export const SEARCH_LIMITS = Object.freeze({
  id: 128,
  version: 64,
  title: 160,
  summary: 512,
  tags: 32,
  tag: 64,
  facets: 24,
  facetKey: 64,
  facetValue: 96,
  metadataDepth: 4,
  documentBytes: 16384,
  queryText: 256,
  queryTypes: 4,
  queryTags: 16,
  queryFacets: 16,
  queryLifecycleStates: 8,
  querySortFields: 3,
  pageSize: 50,
  cursor: 1024,
  queue: 256,
  batchSize: 64,
  rebuildEvents: 10000,
  retryAttempts: 3,
});

export const SEARCH_STORAGE_BOUNDARY = Object.freeze({
  canonicalAuthority: Object.freeze(['PROJECT_REGISTRY', 'ASSET_REGISTRY', 'PACKAGE_REGISTRY', 'ACCOUNT_PERMISSION', 'MARKET', 'CREATOR_SOCIAL']),
  searchDocument: 'bounded-derived-reference-projection',
  publicIndex: 'PUBLIC-only-discovery-documents',
  scopedIndex: 'server-filtered-member-creator-owner-documents',
  excluded: Object.freeze([
    'pixel-blob', 'audio-blob', 'pxd-bytes', 'pixipackage-bytes', 'game-build', 'base64', 'data-url',
    'jwt', 'secret', 'password', 'email', 'phone', 'address', 'payment', 'commission-private-body',
    'private-chat', 'raw-project-body', 'command-journal', 'pixisync-operation', 'license-body',
    'royalty-ledger', 'purchase-history', 'entitlement-body', 'unbounded-description',
  ]),
});

export const SEARCH_BACKEND_CONTRACT = Object.freeze({
  replaceable: true,
  requiredMethods: Object.freeze(['apply', 'query', 'clear', 'snapshot']),
  queryInput: 'typed-search-plan-not-raw-sql',
  indexes: Object.freeze(['SCOPED', 'PUBLIC_DISCOVERY']),
  atomicBatch: true,
  productionAdapter: 'not-selected-in-WP-096',
});

const DOCUMENT_KEYS = new Set([
  'searchDocumentId', 'documentVersion', 'resourceType', 'resourceId', 'sourceAggregateVersion', 'sourceEventId',
  'ownerReference', 'creatorReference', 'projectReference', 'visibilityClass', 'lifecycleState', 'title', 'summary',
  'tags', 'locale', 'facets', 'sortKeys', 'previewReference', 'createdAt', 'updatedAt', 'indexedAt', 'schemaVersion',
]);
const LOCALIZED_KEYS = new Set(['displayValue', 'normalizedSearchValue']);
const REFERENCE_KEYS = new Set(['referenceType', 'referenceId']);
const PREVIEW_KEYS = new Set(['kind', 'referenceId']);
const QUERY_KEYS = new Set([
  'queryVersion', 'text', 'resourceTypes', 'locale', 'visibilityScope', 'ownerReference', 'creatorReference',
  'projectReference', 'tags', 'facets', 'lifecycleStates', 'sort', 'cursor', 'pageSize',
]);
const SORT_KEYS = new Set(['field', 'direction']);
const SORT_FIELDS = new Set([
  'textRelevance', 'exactMatch', 'prefixMatch', 'freshness', 'creatorRelevance', 'resourceType',
  'localeRelevance', 'popularityReference', 'qualityReference', 'createdAt', 'updatedAt',
]);
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FORBIDDEN_KEY = /(?:pixel|audio|blob|pxd|pixipackage|gamebuild|base64|dataurl|jwt|token|secret|password|email|phone|address|payment|commission|royalty|payout|purchase|entitlement|licensebody|privatechat|projectbody|command|journal|pixisyncoperation)/iu;
const EVENT_PROJECTION_TYPES = Object.freeze({
  PROJECT_CREATED: 'PROJECT',
  PROJECT_METADATA_CHANGED: 'PROJECT',
  PROJECT_VISIBILITY_CHANGED: 'PROJECT',
  PROJECT_MEMBER_CHANGED: 'PROJECT',
  PROJECT_ARCHIVED: 'PROJECT',
  PROJECT_RESTORED: 'PROJECT',
  PROJECT_TRASHED: 'PROJECT',
  PROJECT_QUARANTINED: 'PROJECT',
  ASSET_CREATED: 'ASSET',
  ASSET_REVISION_CREATED: 'ASSET',
  ASSET_HEAD_CHANGED: 'ASSET',
  ASSET_DEPENDENCY_CHANGED: 'ASSET',
  ASSET_ARCHIVED: 'ASSET',
  ASSET_RESTORED: 'ASSET',
  ASSET_QUARANTINED: 'ASSET',
  PACKAGE_BUILD_STARTED: 'PACKAGE',
  PACKAGE_VERIFIED: 'PACKAGE',
  PACKAGE_READY: 'PACKAGE',
  PACKAGE_FAILED: 'PACKAGE',
  PACKAGE_QUARANTINED: 'PACKAGE',
  PACKAGE_ARCHIVED: 'PACKAGE',
});
const NON_INDEXING_EVENT_TYPES = new Set([
  'ACCOUNT_STATE_CHANGED', 'MEMBERSHIP_CHANGED', 'PERMISSION_CHANGED', 'TOOL_AVAILABLE', 'TOOL_UNAVAILABLE',
  'TOOL_COMPATIBILITY_CHANGED',
]);
const LIFECYCLE_BY_EVENT = Object.freeze({
  PROJECT_ARCHIVED: 'ARCHIVED',
  PROJECT_RESTORED: 'ACTIVE',
  PROJECT_TRASHED: 'TRASHED',
  PROJECT_QUARANTINED: 'QUARANTINED',
  ASSET_ARCHIVED: 'ARCHIVED',
  ASSET_RESTORED: 'ACTIVE',
  ASSET_QUARANTINED: 'QUARANTINED',
  PACKAGE_BUILD_STARTED: 'BUILDING',
  PACKAGE_VERIFIED: 'VERIFYING',
  PACKAGE_READY: 'READY',
  PACKAGE_FAILED: 'FAILED',
  PACKAGE_QUARANTINED: 'QUARANTINED',
  PACKAGE_ARCHIVED: 'ARCHIVED',
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

function text(value, field, maximum, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail('SEARCH_VALUE_INVALID', `${field} must be a bounded text value.`, field);
  }
  const result = value.normalize('NFC').trim();
  if (!allowEmpty && !result) fail('SEARCH_VALUE_INVALID', `${field} must not be empty.`, field);
  return result;
}

function typedId(value, field) {
  const result = text(value, field, SEARCH_LIMITS.id);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) fail('SEARCH_TYPED_ID_INVALID', `${field} is not a stable typed ID.`, field);
  return result;
}

function version(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail('SEARCH_VERSION_INVALID', `${field} must be a positive safe integer.`, field);
  return value;
}

function enumValue(value, field, values) {
  if (!values.includes(value)) fail('SEARCH_ENUM_UNSUPPORTED', `${field} is unsupported: ${String(value)}.`, field);
  return value;
}

function timestamp(value, field) {
  const result = text(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result) || !Number.isFinite(Date.parse(result))) fail('SEARCH_TIMESTAMP_INVALID', `${field} must be an ISO-8601 UTC timestamp.`, field);
  return result;
}

function assertKeys(value, keys, field) {
  if (!isObject(value)) fail('SEARCH_OBJECT_INVALID', `${field} must be an object.`, field);
  for (const key of Object.keys(value)) {
    if (PROTOTYPE_KEYS.has(key)) fail('SEARCH_PROTOTYPE_POLLUTION', `${field}.${key} is forbidden.`, `${field}.${key}`);
    if (!keys.has(key)) fail('SEARCH_UNKNOWN_FIELD', `${field}.${key} is not part of the Search contract.`, `${field}.${key}`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') fail('SEARCH_VALUE_INVALID', 'Search value is not serializable.');
  return JSON.stringify(value);
}

function normalizeSearchText(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('und')
    .replace(/\s+/gu, ' ')
    .trim();
}

function safeText(value, field, maximum, options = {}) {
  const result = text(value, field, maximum, options);
  if (/^data:/iu.test(result) || /^https?:\/\//iu.test(result) || /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u.test(result) || /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(result)) {
    fail('SEARCH_PRIVATE_DATA_FORBIDDEN', `${field} contains a URL, token-like value, or PII.`, field);
  }
  return result;
}

function normalizeLocale(value, field = 'locale') {
  const result = text(value, field, 35);
  if (result === 'und') return result;
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(result)) fail('SEARCH_LOCALE_INVALID', `${field} must be a BCP-47-compatible locale.`, field);
  return result;
}

function normalizeReference(value, field, { nullable = true } = {}) {
  if (value === null || value === undefined) {
    if (nullable) return null;
    fail('SEARCH_REFERENCE_REQUIRED', `${field} is required.`, field);
  }
  assertKeys(value, REFERENCE_KEYS, field);
  const referenceType = safeText(value.referenceType, `${field}.referenceType`, 48);
  if (FORBIDDEN_KEY.test(referenceType)) fail('SEARCH_PRIVATE_DATA_FORBIDDEN', `${field}.referenceType is not searchable.`, `${field}.referenceType`);
  return { referenceType, referenceId: typedId(value.referenceId, `${field}.referenceId`) };
}

function normalizeLocalized(value, field, maximum) {
  if (typeof value === 'string') {
    const displayValue = safeText(value, field, maximum, { allowEmpty: true });
    return { displayValue, normalizedSearchValue: normalizeSearchText(displayValue) };
  }
  assertKeys(value, LOCALIZED_KEYS, field);
  const displayValue = safeText(value.displayValue, `${field}.displayValue`, maximum, { allowEmpty: true });
  return { displayValue, normalizedSearchValue: normalizeSearchText(displayValue) };
}

function normalizeTag(value, field) {
  if (isObject(value)) {
    assertKeys(value, LOCALIZED_KEYS, field);
    return normalizeTag(value.displayValue, field);
  }
  const result = safeText(value, field, SEARCH_LIMITS.tag);
  return { displayValue: result, normalizedSearchValue: normalizeSearchText(result) };
}

function normalizeFacets(value, field = 'facets') {
  if (!isObject(value)) fail('SEARCH_FACET_INVALID', `${field} must be an object.`, field);
  const entries = Object.entries(value);
  if (entries.length > SEARCH_LIMITS.facets) fail('SEARCH_FACET_LIMIT', `${field} contains too many facets.`, field);
  const result = {};
  for (const [key, raw] of entries) {
    const facetKey = safeText(key, `${field}.key`, SEARCH_LIMITS.facetKey);
    if (FORBIDDEN_KEY.test(facetKey)) fail('SEARCH_PRIVATE_DATA_FORBIDDEN', `${field}.${facetKey} is not a safe facet.`, `${field}.${facetKey}`);
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length > 8) fail('SEARCH_FACET_LIMIT', `${field}.${facetKey} contains too many values.`, `${field}.${facetKey}`);
    result[facetKey] = values.map((item, index) => {
      if (typeof item === 'number' && Number.isFinite(item)) return item;
      if (typeof item !== 'string') fail('SEARCH_FACET_VALUE_INVALID', `${field}.${facetKey}[${index}] must be a bounded scalar.`, `${field}.${facetKey}[${index}]`);
      return safeText(item, `${field}.${facetKey}[${index}]`, SEARCH_LIMITS.facetValue);
    });
  }
  return result;
}

function normalizeSortKeys(value, field = 'sortKeys') {
  if (!isObject(value)) fail('SEARCH_SORT_KEY_INVALID', `${field} must be an object.`, field);
  const result = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!SORT_FIELDS.has(key)) fail('SEARCH_SORT_FIELD_UNSUPPORTED', `${field}.${key} is not a registered sort field.`, `${field}.${key}`);
    if (typeof raw !== 'number' || !Number.isFinite(raw)) fail('SEARCH_SORT_KEY_INVALID', `${field}.${key} must be finite numeric metadata.`, `${field}.${key}`);
    result[key] = raw;
  }
  return result;
}

function normalizePreview(value, field = 'previewReference') {
  if (value === null || value === undefined) return null;
  assertKeys(value, PREVIEW_KEYS, field);
  return {
    kind: enumValue(value.kind, `${field}.kind`, ['THUMBNAIL', 'PREVIEW']),
    referenceId: typedId(value.referenceId, `${field}.referenceId`),
  };
}

function lifecycle(value, field = 'lifecycleState') {
  return enumValue(value, field, SEARCH_LIFECYCLE_STATES);
}

export function normalizeSearchDocument(input) {
  assertKeys(input, DOCUMENT_KEYS, 'searchDocument');
  const resourceType = enumValue(input.resourceType, 'searchDocument.resourceType', SEARCH_RESOURCE_TYPES);
  const resourceId = typedId(input.resourceId, 'searchDocument.resourceId');
  const searchDocumentId = typedId(input.searchDocumentId, 'searchDocument.searchDocumentId');
  if (searchDocumentId === resourceId) fail('SEARCH_DOCUMENT_ID_COLLISION', 'Search Document ID must remain distinct from Resource ID.', 'searchDocument.searchDocumentId');
  const result = {
    searchDocumentId,
    documentVersion: version(input.documentVersion, 'searchDocument.documentVersion'),
    resourceType,
    resourceId,
    sourceAggregateVersion: version(input.sourceAggregateVersion, 'searchDocument.sourceAggregateVersion'),
    sourceEventId: typedId(input.sourceEventId, 'searchDocument.sourceEventId'),
    ownerReference: normalizeReference(input.ownerReference, 'searchDocument.ownerReference', { nullable: false }),
    creatorReference: normalizeReference(input.creatorReference, 'searchDocument.creatorReference', { nullable: false }),
    projectReference: normalizeReference(input.projectReference, 'searchDocument.projectReference'),
    visibilityClass: enumValue(input.visibilityClass, 'searchDocument.visibilityClass', SEARCH_VISIBILITY_CLASSES),
    lifecycleState: lifecycle(input.lifecycleState),
    title: normalizeLocalized(input.title, 'searchDocument.title', SEARCH_LIMITS.title),
    summary: normalizeLocalized(input.summary, 'searchDocument.summary', SEARCH_LIMITS.summary),
    tags: Array.isArray(input.tags) ? input.tags.map((item, index) => normalizeTag(item, `searchDocument.tags[${index}]`)) : fail('SEARCH_TAG_INVALID', 'searchDocument.tags must be an array.', 'searchDocument.tags'),
    locale: normalizeLocale(input.locale),
    facets: normalizeFacets(input.facets),
    sortKeys: normalizeSortKeys(input.sortKeys),
    previewReference: normalizePreview(input.previewReference),
    createdAt: timestamp(input.createdAt, 'searchDocument.createdAt'),
    updatedAt: timestamp(input.updatedAt, 'searchDocument.updatedAt'),
    indexedAt: timestamp(input.indexedAt, 'searchDocument.indexedAt'),
    schemaVersion: input.schemaVersion === undefined ? SEARCH_CORE_SCHEMA_VERSION : input.schemaVersion,
  };
  if (result.documentVersion !== SEARCH_DOCUMENT_VERSION) fail('SEARCH_DOCUMENT_VERSION_UNSUPPORTED', 'Search Document version is unsupported.', 'searchDocument.documentVersion');
  if (result.schemaVersion !== SEARCH_CORE_SCHEMA_VERSION) fail('SEARCH_SCHEMA_UNSUPPORTED', 'Search schema version is unsupported.', 'searchDocument.schemaVersion');
  if (result.tags.length > SEARCH_LIMITS.tags) fail('SEARCH_TAG_LIMIT', 'Search Document has too many tags.', 'searchDocument.tags');
  if (stableJson(result).length > SEARCH_LIMITS.documentBytes) fail('SEARCH_DOCUMENT_TOO_LARGE', 'Search Document exceeds the bounded document size.', 'searchDocument');
  return result;
}

function diagnostic(code, message, field = null, metadata = {}) {
  return { code, severity: 'error', message, field, metadata: clone(metadata) };
}

export function validateSearchDocument(document) {
  try {
    return { valid: true, value: clone(normalizeSearchDocument(document)), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [diagnostic(error.code || 'SEARCH_DOCUMENT_INVALID', error.message, error.field || null, error.metadata || {})] };
  }
}

function normalizeReferenceFilter(value, field) {
  return normalizeReference(value, field);
}

function normalizeQueryFacetFilters(value) {
  if (value === null || value === undefined) return {};
  if (!isObject(value)) fail('SEARCH_QUERY_FACET_INVALID', 'query.facets must be an object.', 'query.facets');
  const entries = Object.entries(value);
  if (entries.length > SEARCH_LIMITS.queryFacets) fail('SEARCH_QUERY_FILTER_EXPLOSION', 'Query has too many facet filters.', 'query.facets');
  const result = {};
  for (const [key, raw] of entries) {
    const facetKey = safeText(key, 'query.facets.key', SEARCH_LIMITS.facetKey);
    if (FORBIDDEN_KEY.test(facetKey)) fail('SEARCH_QUERY_PRIVATE_FILTER', 'Private or financial fields cannot be queried.', `query.facets.${facetKey}`);
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length > 8) fail('SEARCH_QUERY_FILTER_EXPLOSION', 'A facet filter has too many values.', `query.facets.${facetKey}`);
    result[facetKey] = values.map((item, index) => {
      if (typeof item !== 'string' && typeof item !== 'number') fail('SEARCH_QUERY_FACET_INVALID', 'Facet filter values must be scalar.', `query.facets.${facetKey}[${index}]`);
      return safeText(String(item), `query.facets.${facetKey}[${index}]`, SEARCH_LIMITS.facetValue);
    });
  }
  return result;
}

function normalizeSort(value) {
  if (value === null || value === undefined) return [{ field: 'textRelevance', direction: 'desc' }, { field: 'updatedAt', direction: 'desc' }];
  if (!Array.isArray(value) || value.length > SEARCH_LIMITS.querySortFields) fail('SEARCH_QUERY_SORT_LIMIT', 'Query sort must be a bounded array.', 'query.sort');
  return value.map((item, index) => {
    assertKeys(item, SORT_KEYS, `query.sort[${index}]`);
    return { field: enumValue(item.field, `query.sort[${index}].field`, [...SORT_FIELDS]), direction: enumValue(item.direction || 'desc', `query.sort[${index}].direction`, ['asc', 'desc']) };
  });
}

export function normalizeSearchQuery(input = {}) {
  assertKeys(input, QUERY_KEYS, 'query');
  const result = {
    queryVersion: input.queryVersion === undefined ? SEARCH_QUERY_VERSION : input.queryVersion,
    text: input.text === undefined ? '' : safeText(input.text, 'query.text', SEARCH_LIMITS.queryText, { allowEmpty: true }),
    resourceTypes: input.resourceTypes === undefined ? [...SEARCH_RESOURCE_TYPES] : input.resourceTypes,
    locale: input.locale === null || input.locale === undefined ? null : normalizeLocale(input.locale, 'query.locale'),
    visibilityScope: enumValue(input.visibilityScope || 'PUBLIC_DISCOVERY', 'query.visibilityScope', SEARCH_VISIBILITY_SCOPES),
    ownerReference: normalizeReferenceFilter(input.ownerReference, 'query.ownerReference'),
    creatorReference: normalizeReferenceFilter(input.creatorReference, 'query.creatorReference'),
    projectReference: normalizeReferenceFilter(input.projectReference, 'query.projectReference'),
    tags: input.tags === undefined ? [] : input.tags,
    facets: normalizeQueryFacetFilters(input.facets),
    lifecycleStates: input.lifecycleStates === undefined ? [] : input.lifecycleStates,
    sort: normalizeSort(input.sort),
    cursor: input.cursor === null || input.cursor === undefined ? null : safeText(input.cursor, 'query.cursor', SEARCH_LIMITS.cursor),
    pageSize: input.pageSize === undefined ? 20 : input.pageSize,
  };
  if (result.queryVersion !== SEARCH_QUERY_VERSION) fail('SEARCH_QUERY_VERSION_UNSUPPORTED', 'Search Query version is unsupported.', 'query.queryVersion');
  if (!Array.isArray(result.resourceTypes) || result.resourceTypes.length > SEARCH_LIMITS.queryTypes || result.resourceTypes.length === 0) fail('SEARCH_QUERY_RESOURCE_TYPE_LIMIT', 'Query resourceTypes must be a bounded non-empty array.', 'query.resourceTypes');
  result.resourceTypes = result.resourceTypes.map((item, index) => enumValue(item, `query.resourceTypes[${index}]`, SEARCH_RESOURCE_TYPES));
  if (!Array.isArray(result.tags) || result.tags.length > SEARCH_LIMITS.queryTags) fail('SEARCH_QUERY_FILTER_EXPLOSION', 'Query has too many tag filters.', 'query.tags');
  result.tags = result.tags.map((item, index) => normalizeSearchText(safeText(item, `query.tags[${index}]`, SEARCH_LIMITS.tag)));
  if (!Array.isArray(result.lifecycleStates) || result.lifecycleStates.length > SEARCH_LIMITS.queryLifecycleStates) fail('SEARCH_QUERY_FILTER_EXPLOSION', 'Query has too many lifecycle filters.', 'query.lifecycleStates');
  result.lifecycleStates = result.lifecycleStates.map((item, index) => lifecycle(item, `query.lifecycleStates[${index}]`));
  if (!Number.isSafeInteger(result.pageSize) || result.pageSize < 1 || result.pageSize > SEARCH_LIMITS.pageSize) fail('SEARCH_QUERY_PAGE_SIZE_INVALID', 'Query pageSize exceeds the hard limit.', 'query.pageSize');
  if (/[?*]/u.test(result.text)) fail('SEARCH_QUERY_WILDCARD_FORBIDDEN', 'Wildcard query syntax is not accepted by the typed Search Query.', 'query.text');
  return result;
}

export function validateSearchQuery(query) {
  try {
    return { valid: true, value: clone(normalizeSearchQuery(query)), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [diagnostic(error.code || 'SEARCH_QUERY_INVALID', error.message, error.field || null, error.metadata || {})] };
  }
}

function queryFingerprint(query) {
  const { cursor, pageSize, ...stableQuery } = query;
  return stableJson(stableQuery);
}

function makeCursor(plan, tuple) {
  return `search:v1:${encodeURIComponent(stableJson({ fingerprint: plan.fingerprint, tuple }))}`;
}

function parseCursor(cursor, plan) {
  if (cursor === null) return null;
  if (!cursor.startsWith('search:v1:')) fail('SEARCH_CURSOR_INVALID', 'Search cursor has an unsupported format.', 'query.cursor');
  let decoded;
  try {
    decoded = JSON.parse(decodeURIComponent(cursor.slice('search:v1:'.length)));
  } catch {
    fail('SEARCH_CURSOR_INVALID', 'Search cursor cannot be decoded.', 'query.cursor');
  }
  if (!decoded || decoded.fingerprint !== plan.fingerprint || !Array.isArray(decoded.tuple)) fail('SEARCH_CURSOR_INVALID', 'Search cursor does not match the typed query.', 'query.cursor');
  return decoded.tuple;
}

function refMatches(documentReference, filter) {
  if (filter === null) return true;
  return Boolean(documentReference) && documentReference.referenceType === filter.referenceType && documentReference.referenceId === filter.referenceId;
}

function facetMatches(document, filters) {
  for (const [key, values] of Object.entries(filters)) {
    const documentValues = document.facets[key] || [];
    if (!values.some((value) => documentValues.some((item) => String(item).toLocaleLowerCase('und') === String(value).toLocaleLowerCase('und')))) return false;
  }
  return true;
}

function scoreDocument(document, query) {
  const terms = normalizeSearchText(query.text).split(/\s+/u).filter(Boolean);
  if (!terms.length) return { textRelevance: 0, exactMatch: 0, prefixMatch: 0 };
  const haystack = [document.title.normalizedSearchValue, document.summary.normalizedSearchValue, ...document.tags.map((item) => item.normalizedSearchValue)].join(' ');
  const exact = normalizeSearchText(query.text);
  const exactMatch = haystack.includes(exact) ? 1 : 0;
  const prefixMatch = terms.every((term) => haystack.split(/\s+/u).some((token) => token.startsWith(term))) ? 1 : 0;
  const matched = terms.filter((term) => haystack.includes(term)).length;
  return { textRelevance: matched / terms.length, exactMatch, prefixMatch };
}

function queryMatches(document, query) {
  if (!query.resourceTypes.includes(document.resourceType)) return false;
  if (query.locale && document.locale !== query.locale && !document.locale.startsWith(`${query.locale}-`)) return false;
  if (query.lifecycleStates.length && !query.lifecycleStates.includes(document.lifecycleState)) return false;
  if (!refMatches(document.ownerReference, query.ownerReference)) return false;
  if (!refMatches(document.creatorReference, query.creatorReference)) return false;
  if (!refMatches(document.projectReference, query.projectReference)) return false;
  if (query.tags.length && !query.tags.every((tag) => document.tags.some((item) => item.normalizedSearchValue === tag))) return false;
  if (!facetMatches(document, query.facets)) return false;
  const terms = normalizeSearchText(query.text).split(/\s+/u).filter(Boolean);
  if (terms.length) {
    const haystack = [document.title.normalizedSearchValue, document.summary.normalizedSearchValue, ...document.tags.map((item) => item.normalizedSearchValue)].join(' ');
    if (!terms.some((term) => haystack.includes(term))) return false;
  }
  return true;
}

function sortValue(document, plan, field) {
  const score = scoreDocument(document, plan.query);
  if (field === 'freshness') return Date.parse(document.updatedAt);
  if (field === 'creatorRelevance') return document.creatorReference ? 1 : 0;
  if (field === 'resourceType') return document.resourceType;
  if (field === 'localeRelevance') return plan.query.locale && document.locale.startsWith(plan.query.locale) ? 1 : 0;
  if (field === 'createdAt' || field === 'updatedAt') return document[field];
  return document.sortKeys[field] ?? score[field] ?? 0;
}

function comparePrimitive(left, right) {
  if (left === right) return 0;
  if (left === null || left === undefined) return -1;
  if (right === null || right === undefined) return 1;
  return left < right ? -1 : 1;
}

function compareDocuments(left, right, plan) {
  for (const sort of plan.query.sort) {
    const result = comparePrimitive(sortValue(left, plan, sort.field), sortValue(right, plan, sort.field));
    if (result !== 0) return sort.direction === 'asc' ? result : -result;
  }
  return comparePrimitive(`${left.resourceType}:${left.resourceId}`, `${right.resourceType}:${right.resourceId}`);
}

function documentTuple(document, plan) {
  return [...plan.query.sort.map((sort) => sortValue(document, plan, sort.field)), `${document.resourceType}:${document.resourceId}`];
}

function compareTuple(left, right, plan) {
  for (let index = 0; index < plan.query.sort.length; index += 1) {
    const result = comparePrimitive(left[index], right[index]);
    if (result !== 0) return plan.query.sort[index].direction === 'asc' ? result : -result;
  }
  return comparePrimitive(left[plan.query.sort.length], right[plan.query.sort.length]);
}

export function createInMemorySearchBackend() {
  let indexes = { SCOPED: new Map(), PUBLIC_DISCOVERY: new Map() };

  const apply = ({ operations } = {}) => {
    if (!Array.isArray(operations) || operations.length > SEARCH_LIMITS.batchSize * 4) return { ok: false, code: 'SEARCH_BACKEND_BATCH_INVALID', retryable: false };
    const next = { SCOPED: new Map(indexes.SCOPED), PUBLIC_DISCOVERY: new Map(indexes.PUBLIC_DISCOVERY) };
    try {
      for (const operation of operations) {
        if (!isObject(operation) || !['UPSERT', 'REMOVE'].includes(operation.operation) || !['SCOPED', 'PUBLIC_DISCOVERY'].includes(operation.indexName)) fail('SEARCH_BACKEND_OPERATION_INVALID', 'Backend operation is not a typed Search operation.');
        const key = typedId(operation.searchDocumentId, 'operation.searchDocumentId');
        if (operation.operation === 'UPSERT') next[operation.indexName].set(key, clone(normalizeSearchDocument(operation.document)));
        else next[operation.indexName].delete(key);
      }
      indexes = next;
      return { ok: true, applied: operations.length };
    } catch (error) {
      return { ok: false, code: error.code || 'SEARCH_BACKEND_APPLY_FAILED', message: error.message, retryable: false };
    }
  };

  const query = ({ indexName, plan } = {}) => {
    if (!indexes[indexName]) return { ok: false, code: 'SEARCH_BACKEND_INDEX_UNKNOWN', retryable: false };
    const cursorTuple = parseCursor(plan.query.cursor, plan);
    const rows = [...indexes[indexName].values()]
      .filter((document) => queryMatches(document, plan.query))
      .sort((left, right) => compareDocuments(left, right, plan));
    const after = cursorTuple ? rows.findIndex((document) => compareTuple(documentTuple(document, plan), cursorTuple, plan) > 0) : 0;
    const start = cursorTuple && after < 0 ? rows.length : after;
    const page = rows.slice(start, start + plan.query.pageSize);
    const nextCursor = start + page.length < rows.length && page.length ? makeCursor(plan, documentTuple(page[page.length - 1], plan)) : null;
    return { ok: true, results: clone(page), total: rows.length, nextCursor };
  };

  const clear = ({ indexName = null, resourceType = null } = {}) => {
    const operations = [];
    for (const target of indexName ? [indexName] : ['SCOPED', 'PUBLIC_DISCOVERY']) {
      if (!indexes[target]) return { ok: false, code: 'SEARCH_BACKEND_INDEX_UNKNOWN', retryable: false };
      for (const document of indexes[target].values()) if (!resourceType || document.resourceType === resourceType) operations.push({ operation: 'REMOVE', indexName: target, searchDocumentId: document.searchDocumentId });
    }
    return apply({ operations });
  };

  return Object.freeze({
    apply,
    query,
    clear,
    snapshot: () => ({
      indexes: {
        SCOPED: clone([...indexes.SCOPED.values()]),
        PUBLIC_DISCOVERY: clone([...indexes.PUBLIC_DISCOVERY.values()]),
      },
    }),
  });
}

function resourceKey(resourceType, resourceId) {
  return `${resourceType}:${resourceId}`;
}

function isDiscoveryVisible(document) {
  return document.visibilityClass === 'PUBLIC' && !['TRASHED', 'QUARANTINED'].includes(document.lifecycleState);
}

function isScopedVisible(document) {
  return !['TRASHED', 'QUARANTINED'].includes(document.lifecycleState);
}

function flagError(flagId) {
  return { ok: false, diagnostics: [diagnostic('SEARCH_FLAG_OFF', `Search flag ${flagId} is disabled.`, flagId)] };
}

export function createSearchIndexCore({
  clock = null,
  idGenerator = null,
  featureFlagEvaluator = null,
  eventTrustEvaluator = null,
  authorizationEvaluator = null,
  canonicalLookup = null,
  backendAdapter = null,
} = {}) {
  const backend = backendAdapter || createInMemorySearchBackend();
  for (const method of SEARCH_BACKEND_CONTRACT.requiredMethods) if (typeof backend[method] !== 'function') throw new Error(`Search backend method ${method} is required.`);
  const state = {
    documents: Object.create(null),
    aggregateVersions: Object.create(null),
    appliedEvents: Object.create(null),
    eventLedger: [],
    gaps: Object.create(null),
    tombstones: Object.create(null),
    queue: [],
    queuedEvents: Object.create(null),
    attempts: Object.create(null),
    deadLetters: [],
    telemetry: [],
  };

  const now = () => {
    if (typeof clock !== 'function') fail('SEARCH_CLOCK_ADAPTER_MISSING', 'A host clock adapter is required.');
    return timestamp(clock(), 'search.createdAt');
  };
  const nextId = (kind) => {
    if (typeof idGenerator !== 'function') fail('SEARCH_ID_ADAPTER_MISSING', 'A host ID adapter is required.');
    return typedId(idGenerator(kind), `${kind}Id`);
  };
  const flag = (flagId, action) => {
    if (typeof featureFlagEvaluator !== 'function') fail('SEARCH_FLAG_EVALUATOR_MISSING', 'Search Feature Flag evaluation must be injected.');
    const result = featureFlagEvaluator({ flagId, action, source: 'server' });
    if (!result || result.enabled !== true || result.decision !== 'enabled') fail('SEARCH_FLAG_OFF', `Search flag ${flagId} is disabled.`, flagId);
  };
  const trustedEvent = (event) => {
    if (typeof eventTrustEvaluator !== 'function') fail('SEARCH_EVENT_TRUST_ADAPTER_MISSING', 'Search accepts only Events trusted by the WP-095 Event Core.');
    const decision = eventTrustEvaluator({ event: clone(event), source: 'server' });
    if (!decision || decision.ok !== true || decision.decision !== 'allow' || decision.source !== 'server') fail('SEARCH_EVENT_UNTRUSTED', 'Event trust was not granted by the server Event boundary.');
  };
  const resolveSearchAuthorization = ({ permissionDecision, principalId = null, resourceType, resourceId, action, capability = action, correlationId = undefined, code = 'SEARCH_PERMISSION_DENIED' } = {}) => {
    if (typeof authorizationEvaluator !== 'function') fail('SEARCH_AUTHORIZATION_ADAPTER_MISSING', 'Search authorization requires a server-owned Authorization evaluator.');
    try {
      const proof = resolveAuthorizationProofSync({
        expected: { principalId, resourceType, resourceId, action, capability, tenantId: permissionDecision?.tenantId ?? null, correlationId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
        callerProof: permissionDecision,
        authorizationEvaluator: (input) => authorizationEvaluator({ principalId: input.principalId, resourceType: input.resourceType, resourceId: input.resourceId, action: input.action, capability: input.capability, correlationId: input.correlationId, source: 'server' }),
      });
      if (proof.decision !== 'allow') fail(code, 'Search server authorization denied the operation.');
      return proof;
    } catch (error) {
      fail(error.code || code, error.message);
    }
  };
  const validateEvent = (event) => {
    const valid = validateEventEnvelope(event);
    if (!valid.valid) fail('SEARCH_EVENT_INVALID', 'Event does not satisfy the WP-095 Event Envelope.', null, { diagnostics: valid.diagnostics });
    trustedEvent(valid.value);
    return valid.value;
  };

  const projectionType = (eventType) => EVENT_PROJECTION_TYPES[eventType] || null;
  const deriveSearchDocument = (event, existing) => {
    const expectedType = projectionType(event.eventType);
    if (!expectedType) return null;
    const supplied = event.payload && isObject(event.payload.projection) ? event.payload.projection : {};
    const suppliedType = supplied.resourceType || expectedType;
    const suppliedId = supplied.resourceId || event.aggregateId;
    if (suppliedType !== expectedType) fail('SEARCH_PROJECTION_RESOURCE_MISMATCH', 'Event projection Resource Type does not match the Event Catalog.', 'event.payload.projection.resourceType');
    if (suppliedId !== event.aggregateId) fail('SEARCH_PROJECTION_RESOURCE_MISMATCH', 'Event projection Resource ID does not match the aggregate ID.', 'event.payload.projection.resourceId');
    if (!existing && Object.keys(supplied).length === 0) fail('SEARCH_PROJECTION_SOURCE_MISSING', 'A first Search projection requires a bounded canonical reference snapshot.', 'event.payload.projection');
    const fallbackDocument = existing || {
      searchDocumentId: `search-doc:${expectedType.toLocaleLowerCase('und')}:${event.aggregateId}`,
      documentVersion: SEARCH_DOCUMENT_VERSION,
      resourceType: expectedType,
      resourceId: event.aggregateId,
      sourceAggregateVersion: event.aggregateVersion,
      sourceEventId: event.eventId,
      ownerReference: supplied.ownerReference,
      creatorReference: supplied.creatorReference,
      projectReference: supplied.projectReference,
      visibilityClass: supplied.visibilityClass || event.visibilityClass,
      lifecycleState: supplied.lifecycleState || 'ACTIVE',
      title: supplied.title,
      summary: supplied.summary,
      tags: supplied.tags || [],
      locale: supplied.locale || 'und',
      facets: supplied.facets || {},
      sortKeys: supplied.sortKeys || {},
      previewReference: supplied.previewReference || null,
      createdAt: supplied.createdAt || event.occurredAt,
      updatedAt: supplied.updatedAt || event.occurredAt,
      indexedAt: now(),
      schemaVersion: SEARCH_CORE_SCHEMA_VERSION,
    };
    const next = {
      ...fallbackDocument,
      ...supplied,
      searchDocumentId: supplied.searchDocumentId || fallbackDocument.searchDocumentId,
      documentVersion: supplied.documentVersion || fallbackDocument.documentVersion,
      resourceType: expectedType,
      resourceId: event.aggregateId,
      sourceAggregateVersion: event.aggregateVersion,
      sourceEventId: event.eventId,
      visibilityClass: supplied.visibilityClass || fallbackDocument.visibilityClass || event.visibilityClass,
      lifecycleState: supplied.lifecycleState || LIFECYCLE_BY_EVENT[event.eventType] || fallbackDocument.lifecycleState,
      updatedAt: supplied.updatedAt || event.occurredAt,
      indexedAt: now(),
      schemaVersion: SEARCH_CORE_SCHEMA_VERSION,
    };
    return normalizeSearchDocument(next);
  };

  const backendOperationsFor = (document, previous) => {
    const operations = [];
    const previousId = previous?.searchDocumentId || document?.searchDocumentId;
    if (previousId) {
      operations.push({ operation: 'REMOVE', indexName: 'SCOPED', searchDocumentId: previousId });
      operations.push({ operation: 'REMOVE', indexName: 'PUBLIC_DISCOVERY', searchDocumentId: previousId });
    }
    if (!document) return operations;
    if (isScopedVisible(document)) operations.push({ operation: 'UPSERT', indexName: 'SCOPED', searchDocumentId: document.searchDocumentId, document });
    if (isDiscoveryVisible(document)) operations.push({ operation: 'UPSERT', indexName: 'PUBLIC_DISCOVERY', searchDocumentId: document.searchDocumentId, document });
    return operations;
  };

  const applyBackend = (operations, eventId) => {
    const result = backend.apply({ operations: clone(operations), batchId: eventId, source: 'search-projection' });
    if (!result || result.ok !== true) fail(result?.code || 'SEARCH_BACKEND_APPLY_FAILED', result?.message || 'Search backend projection failed.', null, { retryable: result?.retryable === true });
  };

  const markEvent = (event, result = {}) => {
    state.appliedEvents[event.eventId] = { resourceType: projectionType(event.eventType), aggregateVersion: event.aggregateVersion, result: result.status || 'processed' };
    state.eventLedger.push({ eventId: event.eventId, eventType: event.eventType, aggregateType: event.aggregateType, aggregateId: event.aggregateId, aggregateVersion: event.aggregateVersion, projectedAt: now() });
  };

  const applyEventInternal = ({ event: inputEvent, fromRebuild = false } = {}) => {
    try {
      if (!fromRebuild) flag(SEARCH_FLAGS.events, 'write');
      const event = validateEvent(inputEvent);
      if (state.appliedEvents[event.eventId]) return { ok: true, processed: false, idempotentReplay: true, eventId: event.eventId };
      if (NON_INDEXING_EVENT_TYPES.has(event.eventType)) {
        markEvent(event, { status: 'ignored-non-search-event' });
        return { ok: true, processed: true, ignored: true, eventId: event.eventId };
      }
      const expectedType = projectionType(event.eventType);
      const key = resourceKey(expectedType, event.aggregateId);
      const currentVersion = state.aggregateVersions[key] || 0;
      if (event.aggregateVersion <= currentVersion) return { ok: true, processed: false, stale: true, eventId: event.eventId, diagnostics: [diagnostic('SEARCH_STALE_AGGREGATE_VERSION', 'Search ignored an older Event and did not roll back the projection.', 'event.aggregateVersion')] };
      if (event.aggregateVersion > currentVersion + 1) {
        state.gaps[key] = { resourceType: expectedType, resourceId: event.aggregateId, expectedVersion: currentVersion + 1, receivedVersion: event.aggregateVersion, eventId: event.eventId };
        return { ok: false, processed: false, gap: true, eventId: event.eventId, diagnostics: [diagnostic('SEARCH_VERSION_GAP', 'Search detected a missing Aggregate Version and retained the Event for resume.', 'event.aggregateVersion', { expected: currentVersion + 1, received: event.aggregateVersion })] };
      }
      const previous = state.documents[key] || null;
      const next = deriveSearchDocument(event, previous);
      const tombstone = state.tombstones[key];
      if (tombstone && event.aggregateVersion <= tombstone.sourceAggregateVersion) return { ok: true, processed: false, stale: true, tombstone: true, eventId: event.eventId, diagnostics: [diagnostic('SEARCH_TOMBSTONE_STALE_EVENT', 'An older Event cannot resurrect a Search Tombstone.', 'event.aggregateVersion')] };
      const removeOnly = !next || ['TRASHED', 'QUARANTINED'].includes(next.lifecycleState);
      applyBackend(backendOperationsFor(removeOnly ? null : next, previous), event.eventId);
      state.aggregateVersions[key] = event.aggregateVersion;
      delete state.gaps[key];
      if (removeOnly) {
        delete state.documents[key];
        state.tombstones[key] = { resourceType: expectedType, resourceId: event.aggregateId, sourceAggregateVersion: event.aggregateVersion, sourceEventId: event.eventId, indexedAt: now() };
      } else {
        state.documents[key] = next;
        delete state.tombstones[key];
      }
      markEvent(event, { status: removeOnly ? 'tombstoned' : 'projected' });
      return { ok: true, processed: true, projected: !removeOnly, tombstoned: removeOnly, eventId: event.eventId, document: next ? clone(next) : null };
    } catch (error) {
      return { ok: false, processed: false, retryable: error.metadata?.retryable === true, diagnostics: [diagnostic(error.code || 'SEARCH_PROJECTION_FAILED', error.message, error.field || null, error.metadata || {})] };
    }
  };

  const projectEvent = ({ event } = {}) => applyEventInternal({ event });

  const enqueueProjection = ({ event } = {}) => {
    try {
      flag(SEARCH_FLAGS.events, 'write');
      const normalized = validateEvent(event);
      if (state.appliedEvents[normalized.eventId] || state.queuedEvents[normalized.eventId]) return { ok: true, queued: false, idempotentReplay: true, eventId: normalized.eventId };
      if (state.queue.length >= SEARCH_LIMITS.queue) fail('SEARCH_QUEUE_FULL', 'Search projection queue is bounded and full.');
      const row = { eventId: normalized.eventId, event: normalized, attempts: 0, status: 'PENDING', enqueuedAt: now() };
      state.queue.push(row);
      state.queuedEvents[normalized.eventId] = true;
      return { ok: true, queued: true, eventId: normalized.eventId };
    } catch (error) {
      return { ok: false, queued: false, diagnostics: [diagnostic(error.code || 'SEARCH_QUEUE_FAILED', error.message, error.field || null, error.metadata || {})] };
    }
  };

  const processQueue = ({ batchSize = SEARCH_LIMITS.batchSize } = {}) => {
    try {
      flag(SEARCH_FLAGS.events, 'dispatch');
      if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > SEARCH_LIMITS.batchSize) fail('SEARCH_BATCH_SIZE_INVALID', 'Search batchSize is outside the bounded range.', 'batchSize');
      let processed = 0;
      let retried = 0;
      let deadLettered = 0;
      let gaps = 0;
      for (const row of state.queue.filter((item) => item.status === 'PENDING').slice(0, batchSize)) {
        row.attempts += 1;
        state.attempts[row.eventId] = row.attempts;
        const result = applyEventInternal({ event: row.event });
        if (result.ok) {
          row.status = result.stale ? 'STALE' : 'PROCESSED';
          processed += 1;
        } else if (result.gap) {
          row.status = 'WAITING_GAP';
          gaps += 1;
        } else if (result.retryable && row.attempts < SEARCH_LIMITS.retryAttempts) {
          retried += 1;
        } else {
          row.status = 'DEAD_LETTER';
          state.deadLetters.push({ deadLetterId: nextId('search-dead-letter'), eventId: row.eventId, attempts: row.attempts, code: result.diagnostics?.[0]?.code || 'SEARCH_PROJECTION_FAILED', createdAt: now() });
          deadLettered += 1;
        }
      }
      return { ok: true, processed, retried, gaps, deadLettered, pending: state.queue.filter((item) => item.status === 'PENDING').length };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'SEARCH_QUEUE_PROCESS_FAILED', error.message, error.field || null)] };
    }
  };

  const buildPlan = (query) => ({
    schemaVersion: SEARCH_CORE_SCHEMA_VERSION,
    query: clone(query),
    terms: normalizeSearchText(query.text).split(/\s+/u).filter(Boolean),
    textMode: 'literal-token',
    fingerprint: queryFingerprint(query),
    rawSql: undefined,
  });

  const querySearch = ({ query = {}, authorizationContext = null, authorizationPrincipalId = null } = {}) => {
    try {
      flag(SEARCH_FLAGS.read, 'read');
      const normalized = normalizeSearchQuery(query);
      let indexName = 'PUBLIC_DISCOVERY';
      if (normalized.visibilityScope !== 'PUBLIC_DISCOVERY') {
        flag(SEARCH_FLAGS.memberScope, 'read');
        if (typeof authorizationEvaluator !== 'function') fail('SEARCH_AUTHORIZATION_ADAPTER_MISSING', 'Scoped Search requires a server authorization evaluator.');
        indexName = 'SCOPED';
      } else {
        flag(SEARCH_FLAGS.publicDiscovery, 'read');
      }
      const plan = buildPlan(normalized);
      const backendResult = backend.query({ indexName, plan, source: 'server' });
      if (!backendResult || backendResult.ok !== true) fail(backendResult?.code || 'SEARCH_BACKEND_QUERY_FAILED', backendResult?.message || 'Search backend query failed.', null, { retryable: backendResult?.retryable === true });
      const authorized = [];
      for (const document of backendResult.results) {
        if (normalized.visibilityScope !== 'PUBLIC_DISCOVERY') {
          try {
            resolveSearchAuthorization({ permissionDecision: null, principalId: authorizationPrincipalId, resourceType: document.resourceType, resourceId: document.resourceId, action: 'search.query', capability: 'search.query', correlationId: authorizationContext?.correlationId });
          } catch {
            continue;
          }
        }
        authorized.push(document);
      }
      state.telemetry.push({ metric: 'search.result_count', value: authorized.length, recordedAt: now(), scope: normalized.visibilityScope, locale: normalized.locale || 'und' });
      return { ok: true, results: clone(authorized), total: authorized.length, nextCursor: authorized.length < backendResult.results.length ? null : backendResult.nextCursor, eventualConsistency: true, canonicalAuthority: false };
    } catch (error) {
      return { ok: false, results: [], diagnostics: [diagnostic(error.code || 'SEARCH_QUERY_FAILED', error.message, error.field || null, error.metadata || {})] };
    }
  };

  const indexCanonicalResourceInternal = ({ document, permissionDecision, actorId = null, requireWrite = true } = {}) => {
    try {
      if (requireWrite) flag(SEARCH_FLAGS.write, 'write');
      const normalized = normalizeSearchDocument(document);
      const authorization = resolveSearchAuthorization({ permissionDecision, principalId: actorId, resourceType: normalized.resourceType, resourceId: normalized.resourceId, action: 'search.index', capability: 'search.index', correlationId: normalized.sourceEventId, code: 'SEARCH_PERMISSION_DENIED' });
      const key = resourceKey(normalized.resourceType, normalized.resourceId);
      const previous = state.documents[key] || null;
      applyBackend(backendOperationsFor(normalized, previous), normalized.sourceEventId);
      state.documents[key] = normalized;
      state.aggregateVersions[key] = normalized.sourceAggregateVersion;
      delete state.tombstones[key];
      return { ok: true, indexed: true, document: clone(normalized), authorizationProof: clone(authorization), canonicalAuthority: false };
    } catch (error) {
      return { ok: false, indexed: false, diagnostics: [diagnostic(error.code || 'SEARCH_CANONICAL_INDEX_FAILED', error.message, error.field || null, error.metadata || {})] };
    }
  };

  const indexCanonicalResource = ({ document, permissionDecision, actorId = null } = {}) => indexCanonicalResourceInternal({ document, permissionDecision, actorId, requireWrite: true });

  const lookupResource = ({ resourceType: inputType, resourceId: inputId, permissionDecision, actorId = null, canonicalFallback = null } = {}) => {
    try {
      const resourceType = enumValue(inputType, 'resourceType', SEARCH_RESOURCE_TYPES);
      const resourceId = typedId(inputId, 'resourceId');
      const authorization = resolveSearchAuthorization({ permissionDecision, principalId: actorId, resourceType, resourceId, action: 'search.lookup', capability: 'search.lookup', code: 'SEARCH_LOOKUP_PERMISSION_DENIED' });
      const key = resourceKey(resourceType, resourceId);
      if (typeof featureFlagEvaluator === 'function') {
        const decision = featureFlagEvaluator({ flagId: SEARCH_FLAGS.read, action: 'exact-lookup', source: 'server' });
        if (decision?.enabled === true && decision?.decision === 'enabled') {
          const document = state.documents[key];
          if (document && isScopedVisible(document)) return { ok: true, found: true, source: 'search-index', document: clone(document), canonicalAuthority: false };
        }
      }
      if (typeof canonicalFallback === 'function') {
        const fallback = canonicalFallback({ resourceType, resourceId, permissionDecision: clone(authorization), authorizationProof: clone(authorization), source: 'server' });
        if (fallback?.ok === true && fallback.document) return { ok: true, found: true, source: 'canonical-fallback', document: clone(normalizeSearchDocument(fallback.document)), canonicalAuthority: true };
      }
      return { ok: false, found: false, diagnostics: [diagnostic('SEARCH_RESOURCE_NOT_FOUND', 'Resource was not found or is not visible to this authorized lookup.', null, { resourceType })] };
    } catch (error) {
      return { ok: false, found: false, diagnostics: [diagnostic(error.code || 'SEARCH_LOOKUP_FAILED', error.message, error.field || null, error.metadata || {})] };
    }
  };

  const clearProjectionState = (resourceType = null) => {
    const operations = [];
    for (const document of Object.values(state.documents)) {
      if (!resourceType || document.resourceType === resourceType) operations.push(...backendOperationsFor(null, document));
    }
    applyBackend(operations, nextId('rebuild'));
    for (const key of Object.keys(state.documents)) if (!resourceType || state.documents[key].resourceType === resourceType) delete state.documents[key];
    for (const key of Object.keys(state.aggregateVersions)) if (!resourceType || key.startsWith(`${resourceType}:`)) delete state.aggregateVersions[key];
    for (const key of Object.keys(state.tombstones)) if (!resourceType || key.startsWith(`${resourceType}:`)) delete state.tombstones[key];
    for (const key of Object.keys(state.gaps)) if (!resourceType || key.startsWith(`${resourceType}:`)) delete state.gaps[key];
    const retainedLedger = [];
    for (const item of state.eventLedger) {
      const isTarget = !resourceType || projectionType(item.eventType) === resourceType;
      if (isTarget) delete state.appliedEvents[item.eventId];
      else retainedLedger.push(item);
    }
    state.eventLedger.splice(0, state.eventLedger.length, ...retainedLedger);
  };

  const rebuildIndex = ({ events = [], resourceType = null, resumeCursor = null, batchSize = SEARCH_LIMITS.batchSize } = {}) => {
    try {
      flag(SEARCH_FLAGS.rebuild, 'rebuild');
      if (!Array.isArray(events) || events.length > SEARCH_LIMITS.rebuildEvents) fail('SEARCH_REBUILD_INPUT_INVALID', 'Rebuild requires a bounded canonical Event/Snapshot input.');
      if (resourceType !== null) enumValue(resourceType, 'resourceType', SEARCH_RESOURCE_TYPES);
      if (!resumeCursor) clearProjectionState(resourceType);
      let start = 0;
      if (resumeCursor !== null) {
        if (!resumeCursor.startsWith('rebuild:v1:')) fail('SEARCH_REBUILD_CURSOR_INVALID', 'Rebuild cursor is unsupported.', 'resumeCursor');
        const parsed = Number(resumeCursor.slice(resumeCursor.lastIndexOf(':') + 1));
        if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > events.length) fail('SEARCH_REBUILD_CURSOR_INVALID', 'Rebuild cursor is invalid.', 'resumeCursor');
        start = parsed;
      }
      const relevant = events.filter((event) => resourceType === null || projectionType(event.eventType) === resourceType);
      let processed = 0;
      let lastIndex = start;
      for (let index = start; index < relevant.length && processed < Math.min(batchSize, SEARCH_LIMITS.batchSize); index += 1) {
        const result = applyEventInternal({ event: relevant[index], fromRebuild: true });
        if (!result.ok && result.gap) return { ok: false, complete: false, gap: true, processed, resumeCursor: `rebuild:v1:${resourceType || 'ALL'}:${index}`, diagnostics: result.diagnostics };
        if (!result.ok) return { ok: false, complete: false, processed, resumeCursor: `rebuild:v1:${resourceType || 'ALL'}:${index}`, diagnostics: result.diagnostics };
        processed += 1;
        lastIndex = index + 1;
      }
      const complete = lastIndex >= relevant.length;
      return { ok: true, complete, processed, resumeCursor: complete ? null : `rebuild:v1:${resourceType || 'ALL'}:${lastIndex}`, externalSideEffects: 0, canonicalAuthority: false };
    } catch (error) {
      return { ok: false, complete: false, diagnostics: [diagnostic(error.code || 'SEARCH_REBUILD_FAILED', error.message, error.field || null, error.metadata || {})] };
    }
  };

  const rebuildResourceType = ({ resourceType, events, resumeCursor = null, batchSize } = {}) => rebuildIndex({ resourceType, events, resumeCursor, batchSize });

  const reindexResource = ({ resourceType, resourceId, sourceSnapshot, permissionDecision, actorId = null } = {}) => {
    try {
      flag(SEARCH_FLAGS.rebuild, 'rebuild');
      resolveSearchAuthorization({ permissionDecision, principalId: actorId, resourceType, resourceId, action: 'search.reindex', capability: 'search.reindex', code: 'SEARCH_REINDEX_PERMISSION_DENIED' });
      if (sourceSnapshot?.resourceType !== resourceType || sourceSnapshot?.resourceId !== resourceId) fail('SEARCH_REINDEX_RESOURCE_MISMATCH', 'Canonical Snapshot does not match the requested resource.', 'sourceSnapshot');
      const result = indexCanonicalResourceInternal({ document: sourceSnapshot, permissionDecision, actorId, requireWrite: false });
      return result.ok ? { ...result, externalSideEffects: 0, rebuild: true } : result;
    } catch (error) {
      return { ok: false, indexed: false, diagnostics: [diagnostic(error.code || 'SEARCH_REINDEX_FAILED', error.message, error.field || null, error.metadata || {})] };
    }
  };

  const recordTelemetry = ({ metric, value, locale = 'und', scope = 'PUBLIC_DISCOVERY' } = {}) => {
    try {
      const safeMetric = safeText(metric, 'telemetry.metric', 96);
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('SEARCH_TELEMETRY_INVALID', 'Telemetry value must be finite.');
      enumValue(scope, 'telemetry.scope', SEARCH_VISIBILITY_SCOPES);
      const record = { metric: safeMetric, value, locale: normalizeLocale(locale, 'telemetry.locale'), scope, recordedAt: now() };
      state.telemetry.push(record);
      return { ok: true, telemetry: clone(record) };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'SEARCH_TELEMETRY_FAILED', error.message, error.field || null)] };
    }
  };

  const snapshot = () => clone({
    schemaVersion: SEARCH_CORE_SCHEMA_VERSION,
    resourceCatalog: SEARCH_RESOURCE_CATALOG,
    flags: SEARCH_FLAGS,
    limits: SEARCH_LIMITS,
    documents: state.documents,
    aggregateVersions: state.aggregateVersions,
    appliedEvents: state.appliedEvents,
    eventLedger: state.eventLedger,
    gaps: state.gaps,
    tombstones: state.tombstones,
    queue: state.queue.map((row) => ({ eventId: row.eventId, attempts: row.attempts, status: row.status, enqueuedAt: row.enqueuedAt })),
    deadLetters: state.deadLetters,
    telemetry: state.telemetry,
    storageBoundary: SEARCH_STORAGE_BOUNDARY,
    backendContract: SEARCH_BACKEND_CONTRACT,
  });

  return Object.freeze({
    projectEvent,
    enqueueProjection,
    processQueue,
    querySearch,
    lookupResource,
    indexCanonicalResource,
    rebuildIndex,
    rebuildResourceType,
    reindexResource,
    recordTelemetry,
    snapshot,
  });
}

export const SEARCH_INDEX_CONTRACT = Object.freeze({
  schemaVersion: SEARCH_CORE_SCHEMA_VERSION,
  documentVersion: SEARCH_DOCUMENT_VERSION,
  queryVersion: SEARCH_QUERY_VERSION,
  resourceCatalog: SEARCH_RESOURCE_CATALOG,
  resourceTypes: SEARCH_RESOURCE_TYPES,
  reservedResourceTypes: SEARCH_RESERVED_RESOURCE_TYPES,
  visibilityClasses: SEARCH_VISIBILITY_CLASSES,
  visibilityScopes: SEARCH_VISIBILITY_SCOPES,
  flags: SEARCH_FLAGS,
  limits: SEARCH_LIMITS,
  storageBoundary: SEARCH_STORAGE_BOUNDARY,
  backend: SEARCH_BACKEND_CONTRACT,
  eventTypes: Object.freeze(Object.keys(EVENT_CATALOG)),
  eventProjectionTypes: EVENT_PROJECTION_TYPES,
  highFrequencyEvents: Object.freeze(['POINTER_MOVE', 'BRUSH_SAMPLE', 'PIXEL_CHANGED', 'TILE_MUTATED', 'AUDIO_SAMPLE', 'ANIMATION_FRAME_TICK', 'PIXISYNC_OPERATION']),
  acceptedEventCatalogSize: EVENT_TYPES.length,
});
