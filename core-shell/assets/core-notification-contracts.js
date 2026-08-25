/*
 * WP-097 Notification Core.
 *
 * Notification is a durable, permission-filtered projection of a trusted Event. It is not an
 * Event, Activity, Audit, Telemetry, Search document, finance record, or delivery provider.
 * This is a framework-free, unloaded reference contract. It has no DOM, Canvas, browser storage,
 * network, Supabase, timer, provider SDK, email library, or current-route dependency.
 */

import { AUTHORIZATION_PROOF_POLICY_VERSION, resolveAuthorizationProofSync } from './core-authorization-proof-contracts.js';

import { validateEventEnvelope } from './core-event-activity-contracts.js';

export const NOTIFICATION_CORE_SCHEMA_VERSION = 1;
export const NOTIFICATION_RECORD_VERSION = 1;
export const NOTIFICATION_DELIVERY_ATTEMPT_VERSION = 1;

export const NOTIFICATION_TYPES = Object.freeze({
  ACCOUNT_STATE_CHANGED: Object.freeze({ category: 'ACCOUNT_SECURITY', defaultPriority: 'HIGH', groupable: false, mandatory: false, presentationKey: 'notification.account.stateChanged' }),
  SECURITY_ACTION_REQUIRED: Object.freeze({ category: 'ACCOUNT_SECURITY', defaultPriority: 'CRITICAL', groupable: false, mandatory: true, presentationKey: 'notification.security.actionRequired' }),
  PROJECT_INVITED: Object.freeze({ category: 'PROJECT', defaultPriority: 'HIGH', groupable: false, mandatory: false, presentationKey: 'notification.project.invited' }),
  PROJECT_MEMBER_CHANGED: Object.freeze({ category: 'PROJECT', defaultPriority: 'NORMAL', groupable: true, mandatory: false, presentationKey: 'notification.project.memberChanged' }),
  PROJECT_ACCESS_CHANGED: Object.freeze({ category: 'PROJECT', defaultPriority: 'HIGH', groupable: false, mandatory: false, presentationKey: 'notification.project.accessChanged' }),
  PROJECT_MIGRATION_REQUIRES_REVIEW: Object.freeze({ category: 'PROJECT', defaultPriority: 'HIGH', groupable: false, mandatory: false, presentationKey: 'notification.project.migrationRequiresReview' }),
  ASSET_REVIEW_AVAILABLE: Object.freeze({ category: 'ASSET', defaultPriority: 'NORMAL', groupable: true, mandatory: false, presentationKey: 'notification.asset.reviewAvailable' }),
  ASSET_REFERENCE_BROKEN: Object.freeze({ category: 'ASSET', defaultPriority: 'HIGH', groupable: false, mandatory: false, presentationKey: 'notification.asset.referenceBroken' }),
  ASSET_QUARANTINED: Object.freeze({ category: 'ASSET', defaultPriority: 'CRITICAL', groupable: false, mandatory: false, presentationKey: 'notification.asset.quarantined' }),
  PACKAGE_READY: Object.freeze({ category: 'PACKAGE', defaultPriority: 'NORMAL', groupable: true, mandatory: false, presentationKey: 'notification.package.ready' }),
  PACKAGE_FAILED: Object.freeze({ category: 'PACKAGE', defaultPriority: 'HIGH', groupable: false, mandatory: false, presentationKey: 'notification.package.failed' }),
  PACKAGE_QUARANTINED: Object.freeze({ category: 'PACKAGE', defaultPriority: 'CRITICAL', groupable: false, mandatory: false, presentationKey: 'notification.package.quarantined' }),
  TOOL_OPERATION_REQUIRES_REVIEW: Object.freeze({ category: 'TOOL', defaultPriority: 'HIGH', groupable: false, mandatory: false, presentationKey: 'notification.tool.operationRequiresReview' }),
  TOOL_COMPATIBILITY_WARNING: Object.freeze({ category: 'TOOL', defaultPriority: 'HIGH', groupable: true, mandatory: false, presentationKey: 'notification.tool.compatibilityWarning' }),
});

export const NOTIFICATION_TYPE_NAMES = Object.freeze(Object.keys(NOTIFICATION_TYPES));
export const NOTIFICATION_RESERVED_TYPES = Object.freeze([
  'MARKET_SALE', 'MARKET_PURCHASE', 'MARKET_REFUND', 'COMMISSION_CREATED', 'COMMISSION_UPDATED',
  'COMMISSION_ACTION_REQUIRED', 'SOCIAL_MENTION', 'SOCIAL_FOLLOW', 'COMMUNITY_REPLY',
  'MODERATION_ACTION', 'SUBSCRIPTION_STATE',
]);

export const NOTIFICATION_RECIPIENT_TYPES = Object.freeze(['USER', 'TEAM', 'ACCOUNT']);
export const NOTIFICATION_VISIBILITY_CLASSES = Object.freeze(['PRIVATE', 'RECIPIENT_ONLY', 'PROJECT_MEMBERS', 'CREATOR_PRIVATE', 'PUBLIC_SAFE']);
export const NOTIFICATION_PRIORITIES = Object.freeze(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
export const NOTIFICATION_INBOX_STATES = Object.freeze(['UNREAD', 'READ', 'ARCHIVED']);
export const NOTIFICATION_CHANNELS = Object.freeze(['IN_APP', 'WEB_PUSH', 'MOBILE_PUSH', 'EMAIL', 'DIGEST']);
export const NOTIFICATION_DELIVERY_STATES = Object.freeze(['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED', 'CANCELLED']);
export const NOTIFICATION_RATE_LIMIT_ACTIONS = Object.freeze(['SUPPRESS', 'DELAY', 'GROUP']);

export const NOTIFICATION_FLAGS = Object.freeze({
  read: 'notification-core-read',
  write: 'notification-core-write',
  eventProjection: 'notification-event-projection',
  externalDelivery: 'notification-external-delivery',
  digest: 'notification-digest',
  legacyAdapter: 'notification-legacy-adapter',
});
export const NOTIFICATION_FLAG_NAMES = Object.freeze(Object.values(NOTIFICATION_FLAGS));

export const NOTIFICATION_LIMITS = Object.freeze({
  id: 128,
  version: 64,
  presentationKey: 160,
  metadataBytes: 8192,
  metadataDepth: 4,
  metadataKeys: 32,
  metadataArrayItems: 32,
  pageSize: 50,
  cursor: 1024,
  batchSize: 64,
  queue: 256,
  retryAttempts: 3,
  recipientsPerEvent: 64,
  groupingWindowMs: 15 * 60 * 1000,
});

export const NOTIFICATION_STORAGE_BOUNDARY = Object.freeze({
  notification: 'durable-recipient-scoped-projection-reference-record',
  inbox: 'read-state-and-archive-state-on-notification-record',
  delivery: 'bounded-channel-attempt-record-separate-from-notification',
  provider: 'exchangeable-channel-adapter-with-canonical-diagnostic-only',
  excluded: Object.freeze([
    'event-payload-body', 'activity-record', 'audit-record', 'telemetry-record', 'search-document',
    'raw-pixel-buffer', 'audio-bytes', 'pxd-bytes', 'pixipackage-bytes', 'game-build', 'blob',
    'base64', 'data-url', 'jwt', 'session-token', 'secret', 'password', 'email', 'address',
    'phone', 'payment-card', 'commission-private-body', 'royalty-ledger', 'purchase-history',
    'entitlement-body', 'private-project-body', 'provider-raw-exception', 'unbounded-json',
    'high-frequency-editor-operation',
  ]),
});

export const NOTIFICATION_BACKEND_CONTRACT = Object.freeze({
  replaceable: true,
  requiredMethods: Object.freeze(['apply', 'query', 'clear', 'snapshot']),
  operationInput: 'typed-notification-and-delivery-operations-not-raw-sql',
  atomicBatch: true,
  productionAdapter: 'not-selected-in-WP-097',
});

const NOTIFICATION_EVENT_SIGNALS = Object.freeze({
  ACCOUNT_STATE_CHANGED: Object.freeze(['ACCOUNT_STATE_CHANGED', 'SECURITY_ACTION_REQUIRED']),
  MEMBERSHIP_CHANGED: Object.freeze(['ACCOUNT_STATE_CHANGED']),
  PERMISSION_CHANGED: Object.freeze(['PROJECT_ACCESS_CHANGED', 'SECURITY_ACTION_REQUIRED']),
  PROJECT_MEMBER_CHANGED: Object.freeze(['PROJECT_INVITED', 'PROJECT_MEMBER_CHANGED', 'PROJECT_MIGRATION_REQUIRES_REVIEW']),
  PROJECT_METADATA_CHANGED: Object.freeze(['PROJECT_MIGRATION_REQUIRES_REVIEW']),
  ASSET_REVISION_CREATED: Object.freeze(['ASSET_REVIEW_AVAILABLE']),
  ASSET_DEPENDENCY_CHANGED: Object.freeze(['ASSET_REFERENCE_BROKEN', 'ASSET_REVIEW_AVAILABLE']),
  ASSET_QUARANTINED: Object.freeze(['ASSET_QUARANTINED']),
  PACKAGE_READY: Object.freeze(['PACKAGE_READY']),
  PACKAGE_FAILED: Object.freeze(['PACKAGE_FAILED']),
  PACKAGE_QUARANTINED: Object.freeze(['PACKAGE_QUARANTINED']),
  TOOL_AVAILABLE: Object.freeze(['TOOL_OPERATION_REQUIRES_REVIEW']),
  TOOL_COMPATIBILITY_CHANGED: Object.freeze(['TOOL_COMPATIBILITY_WARNING']),
});

const DEFAULT_EVENT_NOTIFICATION_TYPE = Object.freeze({
  ACCOUNT_STATE_CHANGED: 'ACCOUNT_STATE_CHANGED',
  PROJECT_MEMBER_CHANGED: 'PROJECT_MEMBER_CHANGED',
  ASSET_QUARANTINED: 'ASSET_QUARANTINED',
  PACKAGE_READY: 'PACKAGE_READY',
  PACKAGE_FAILED: 'PACKAGE_FAILED',
  PACKAGE_QUARANTINED: 'PACKAGE_QUARANTINED',
  TOOL_COMPATIBILITY_CHANGED: 'TOOL_COMPATIBILITY_WARNING',
});

const PREFERENCE_CATEGORIES = new Set(['ACCOUNT_SECURITY', 'PROJECT', 'ASSET', 'PACKAGE', 'TOOL', 'MARKETING_FUTURE']);
const REFERENCE_KEYS = new Set(['referenceType', 'referenceId']);
const RECIPIENT_KEYS = new Set(['recipientType', 'recipientId', 'visibilityClass', 'permissionDecision', 'source']);
const NOTIFICATION_KEYS = new Set([
  'notificationId', 'notificationVersion', 'recipientType', 'recipientId', 'notificationType', 'sourceEventId',
  'sourceEventVersion', 'actorReference', 'objectReference', 'projectReference', 'resourceReference',
  'visibilityClass', 'priority', 'presentationKey', 'presentationMetadata', 'groupingKey', 'deduplicationKey',
  'deliveryPolicy', 'createdAt', 'readAt', 'archivedAt', 'schemaVersion',
]);
const DELIVERY_KEYS = new Set([
  'deliveryAttemptId', 'notificationId', 'channel', 'providerReference', 'state', 'attemptNumber',
  'retryable', 'diagnosticCode', 'createdAt', 'completedAt',
]);
const PREFERENCE_KEYS = new Set([
  'category', 'inAppEnabled', 'pushEnabled', 'emailEnabled', 'digestEnabled', 'mutedProjectIds',
  'mutedResourceIds', 'mutedActorIds', 'quietHours', 'locale', 'timezone',
]);
const QUIET_HOURS_KEYS = new Set(['enabled', 'startMinute', 'endMinute', 'timezone']);
const DELIVERY_POLICY_KEYS = new Set(['inApp', 'webPush', 'mobilePush', 'email', 'digest', 'quietHours', 'rateLimited', 'mandatory', 'suppressedReason']);
const QUERY_KEYS = new Set([
  'recipientType', 'recipientId', 'unread', 'states', 'notificationTypes', 'priorities', 'projectReference',
  'createdAfter', 'createdBefore', 'cursor', 'pageSize',
]);
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const FORBIDDEN_KEY = /(?:jwt|token|secret|password|email|address|phone|payment|card|commission|royalty|payout|purchase|entitlement|blob|pixel|audio|pxd|pixipackage|gamebuild|base64|dataurl|session|authorization|raw|privatebody|projectbody|activity|audit|telemetry|searchdocument|pixisync|operation)/iu;
const HIGH_FREQUENCY_EVENT_TYPES = new Set(['POINTER_MOVE', 'BRUSH_SAMPLE', 'PIXEL_CHANGED', 'TILE_MUTATED', 'AUDIO_SAMPLE', 'ANIMATION_FRAME_TICK', 'PIXISYNC_OPERATION']);
const MANDATORY_TYPES = new Set(Object.entries(NOTIFICATION_TYPES).filter(([, policy]) => policy.mandatory).map(([type]) => type));

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

function text(value, field, maximum = NOTIFICATION_LIMITS.id, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)) fail('NOTIFICATION_VALUE_INVALID', `${field} must be bounded text.`, field);
  const result = value.normalize('NFC').trim();
  if (!allowEmpty && !result) fail('NOTIFICATION_VALUE_INVALID', `${field} must not be empty.`, field);
  return result;
}

function typedId(value, field) {
  const result = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) fail('NOTIFICATION_TYPED_ID_INVALID', `${field} is not a stable Typed ID.`, field);
  return result;
}

function version(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) fail('NOTIFICATION_VERSION_INVALID', `${field} must be a positive safe integer.`, field);
  return value;
}

function enumValue(value, field, values) {
  if (!values.includes(value)) fail('NOTIFICATION_ENUM_UNSUPPORTED', `${field} is unsupported: ${String(value)}.`, field);
  return value;
}

function assertKeys(value, keys, field) {
  if (!isObject(value)) fail('NOTIFICATION_OBJECT_INVALID', `${field} must be an object.`, field);
  for (const key of Object.keys(value)) {
    if (PROTOTYPE_KEYS.has(key)) fail('NOTIFICATION_PROTOTYPE_POLLUTION', `${field}.${key} is forbidden.`, `${field}.${key}`);
    if (!keys.has(key)) fail('NOTIFICATION_UNKNOWN_FIELD', `${field}.${key} is not part of the contract.`, `${field}.${key}`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') fail('NOTIFICATION_METADATA_TYPE_INVALID', 'Metadata contains a non-serializable value.');
  return JSON.stringify(value);
}

function compactKey(prefix, value) {
  const input = String(value);
  let first = 2166136261;
  let second = 2654435761;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ (code + index), 2246822519);
  }
  return `${prefix}:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function boundedMetadata(value, field = 'presentationMetadata', depth = 0) {
  if (depth > NOTIFICATION_LIMITS.metadataDepth) fail('NOTIFICATION_METADATA_TOO_DEEP', `${field} exceeds the metadata depth limit.`, field);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) fail('NOTIFICATION_METADATA_TYPE_INVALID', `${field} contains a non-finite number.`, field);
    return value;
  }
  if (typeof value === 'string') {
    const result = text(value, field, 1024, { allowEmpty: true });
    if (/^data:/iu.test(result) || /^https?:\/\//iu.test(result) || /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u.test(result) || /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(result)) fail('NOTIFICATION_PRIVATE_METADATA_FORBIDDEN', `${field} contains a URL, token-like value, or PII.`, field);
    return result;
  }
  if (Array.isArray(value)) {
    if (value.length > NOTIFICATION_LIMITS.metadataArrayItems) fail('NOTIFICATION_METADATA_TOO_LARGE', `${field} contains too many items.`, field);
    return value.map((item, index) => boundedMetadata(item, `${field}[${index}]`, depth + 1));
  }
  if (!isObject(value)) fail('NOTIFICATION_METADATA_TYPE_INVALID', `${field} contains an unsupported value.`, field);
  const keys = Object.keys(value);
  if (keys.length > NOTIFICATION_LIMITS.metadataKeys) fail('NOTIFICATION_METADATA_TOO_LARGE', `${field} contains too many keys.`, field);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (PROTOTYPE_KEYS.has(key) || FORBIDDEN_KEY.test(key)) fail('NOTIFICATION_PRIVATE_METADATA_FORBIDDEN', `${field}.${key} is outside the Notification boundary.`, `${field}.${key}`);
    result[text(key, `${field}.key`, 96)] = boundedMetadata(item, `${field}.${key}`, depth + 1);
  }
  if (stableJson(result).length > NOTIFICATION_LIMITS.metadataBytes) fail('NOTIFICATION_METADATA_TOO_LARGE', `${field} exceeds the metadata byte limit.`, field);
  return result;
}

function timestamp(value, field) {
  const result = text(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result) || !Number.isFinite(Date.parse(result))) fail('NOTIFICATION_TIMESTAMP_INVALID', `${field} must be an ISO-8601 UTC timestamp.`, field);
  return result;
}

function optionalTimestamp(value, field) {
  return value === null || value === undefined ? null : timestamp(value, field);
}

function normalizeReference(value, field, { required = false, expectedType = null } = {}) {
  if (value === null || value === undefined) {
    if (required) fail('NOTIFICATION_REFERENCE_REQUIRED', `${field} is required.`, field);
    return null;
  }
  assertKeys(value, REFERENCE_KEYS, field);
  const result = { referenceType: text(value.referenceType, `${field}.referenceType`, 48).toUpperCase(), referenceId: typedId(value.referenceId, `${field}.referenceId`) };
  if (expectedType && result.referenceType !== expectedType) fail('NOTIFICATION_REFERENCE_TYPE_INVALID', `${field} must reference ${expectedType}.`, field);
  return result;
}

function normalizeActor(value, field) {
  return normalizeReference(value, field, { required: false });
}

function normalizeDeliveryPolicy(value) {
  assertKeys(value, DELIVERY_POLICY_KEYS, 'notification.deliveryPolicy');
  const result = {
    inApp: value.inApp === true,
    webPush: value.webPush === true,
    mobilePush: value.mobilePush === true,
    email: value.email === true,
    digest: value.digest === true,
    quietHours: value.quietHours === true,
    rateLimited: value.rateLimited === true,
    mandatory: value.mandatory === true,
    suppressedReason: value.suppressedReason === null || value.suppressedReason === undefined ? null : text(value.suppressedReason, 'notification.deliveryPolicy.suppressedReason', 96),
  };
  return result;
}

export function normalizeNotificationRecord(input) {
  assertKeys(input, NOTIFICATION_KEYS, 'notification');
  if (input.schemaVersion !== NOTIFICATION_CORE_SCHEMA_VERSION) fail('NOTIFICATION_SCHEMA_VERSION_UNSUPPORTED', 'Notification schema version is unsupported.', 'notification.schemaVersion');
  const policy = NOTIFICATION_TYPES[input.notificationType];
  if (!policy) fail('NOTIFICATION_TYPE_UNSUPPORTED', 'Notification Type is unsupported or reserved.', 'notification.notificationType');
  if (input.notificationVersion !== NOTIFICATION_RECORD_VERSION) fail('NOTIFICATION_RECORD_VERSION_UNSUPPORTED', 'Notification Record version is unsupported.', 'notification.notificationVersion');
  if (input.notificationId === input.sourceEventId) fail('NOTIFICATION_ID_COLLISION', 'Notification ID and source Event ID must remain separate.', 'notification.notificationId');
  if (input.priority !== policy.defaultPriority) fail('NOTIFICATION_PRIORITY_SPOOFED', 'Notification priority is server policy and cannot be client-supplied.', 'notification.priority');
  if (input.presentationKey !== policy.presentationKey) fail('NOTIFICATION_PRESENTATION_KEY_INVALID', 'Presentation Key does not match the registered Notification Type.', 'notification.presentationKey');
  const deliveryPolicy = normalizeDeliveryPolicy(input.deliveryPolicy);
  if (deliveryPolicy.mandatory !== policy.mandatory) fail('NOTIFICATION_MANDATORY_POLICY_INVALID', 'Mandatory delivery policy is server-controlled.', 'notification.deliveryPolicy.mandatory');
  return {
    notificationId: typedId(input.notificationId, 'notification.notificationId'),
    notificationVersion: version(input.notificationVersion, 'notification.notificationVersion'),
    recipientType: enumValue(input.recipientType, 'notification.recipientType', [...NOTIFICATION_RECIPIENT_TYPES]),
    recipientId: typedId(input.recipientId, 'notification.recipientId'),
    notificationType: input.notificationType,
    sourceEventId: typedId(input.sourceEventId, 'notification.sourceEventId'),
    sourceEventVersion: version(input.sourceEventVersion, 'notification.sourceEventVersion'),
    actorReference: normalizeActor(input.actorReference, 'notification.actorReference'),
    objectReference: normalizeReference(input.objectReference, 'notification.objectReference', { required: true }),
    projectReference: normalizeReference(input.projectReference, 'notification.projectReference', { expectedType: 'PROJECT' }),
    resourceReference: normalizeReference(input.resourceReference, 'notification.resourceReference'),
    visibilityClass: enumValue(input.visibilityClass, 'notification.visibilityClass', [...NOTIFICATION_VISIBILITY_CLASSES]),
    priority: enumValue(input.priority, 'notification.priority', [...NOTIFICATION_PRIORITIES]),
    presentationKey: text(input.presentationKey, 'notification.presentationKey', NOTIFICATION_LIMITS.presentationKey),
    presentationMetadata: boundedMetadata(input.presentationMetadata || {}, 'notification.presentationMetadata'),
    groupingKey: text(input.groupingKey, 'notification.groupingKey', NOTIFICATION_LIMITS.id),
    deduplicationKey: text(input.deduplicationKey, 'notification.deduplicationKey', NOTIFICATION_LIMITS.id),
    deliveryPolicy,
    createdAt: timestamp(input.createdAt, 'notification.createdAt'),
    readAt: optionalTimestamp(input.readAt, 'notification.readAt'),
    archivedAt: optionalTimestamp(input.archivedAt, 'notification.archivedAt'),
    schemaVersion: input.schemaVersion,
  };
}

export function validateNotificationRecord(record) {
  try {
    return { valid: true, value: clone(normalizeNotificationRecord(record)), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [{ code: error.code || 'NOTIFICATION_INVALID', severity: 'error', message: error.message, field: error.field || null, metadata: clone(error.metadata || {}) }] };
  }
}

function normalizeQuietHours(value) {
  if (value === null || value === undefined) return null;
  assertKeys(value, QUIET_HOURS_KEYS, 'preferences.quietHours');
  if (typeof value.enabled !== 'boolean') fail('NOTIFICATION_PREFERENCE_INVALID', 'quietHours.enabled must be boolean.', 'preferences.quietHours.enabled');
  if (!Number.isInteger(value.startMinute) || value.startMinute < 0 || value.startMinute > 1439) fail('NOTIFICATION_QUIET_HOURS_INVALID', 'quietHours.startMinute is outside 0..1439.', 'preferences.quietHours.startMinute');
  if (!Number.isInteger(value.endMinute) || value.endMinute < 0 || value.endMinute > 1439) fail('NOTIFICATION_QUIET_HOURS_INVALID', 'quietHours.endMinute is outside 0..1439.', 'preferences.quietHours.endMinute');
  return { enabled: value.enabled, startMinute: value.startMinute, endMinute: value.endMinute, timezone: text(value.timezone, 'preferences.quietHours.timezone', 64) };
}

function normalizeIdList(value, field) {
  if (!Array.isArray(value) || value.length > 64) fail('NOTIFICATION_PREFERENCE_LIST_INVALID', `${field} must be a bounded ID list.`, field);
  return [...new Set(value.map((item, index) => typedId(item, `${field}[${index}]`)))];
}

function locale(value, field) {
  const result = text(value, field, 35);
  if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(result)) fail('NOTIFICATION_LOCALE_INVALID', `${field} must be a BCP-47-like locale.`, field);
  return result;
}

export function normalizeNotificationPreferences(input = {}) {
  assertKeys(input, PREFERENCE_KEYS, 'preferences');
  const category = enumValue(input.category || 'PROJECT', 'preferences.category', [...PREFERENCE_CATEGORIES]);
  for (const field of ['inAppEnabled', 'pushEnabled', 'emailEnabled', 'digestEnabled']) if (typeof input[field] !== 'boolean') fail('NOTIFICATION_PREFERENCE_INVALID', `${field} must be boolean.`, `preferences.${field}`);
  return {
    category,
    inAppEnabled: input.inAppEnabled,
    pushEnabled: input.pushEnabled,
    emailEnabled: input.emailEnabled,
    digestEnabled: input.digestEnabled,
    mutedProjectIds: normalizeIdList(input.mutedProjectIds || [], 'preferences.mutedProjectIds'),
    mutedResourceIds: normalizeIdList(input.mutedResourceIds || [], 'preferences.mutedResourceIds'),
    mutedActorIds: normalizeIdList(input.mutedActorIds || [], 'preferences.mutedActorIds'),
    quietHours: normalizeQuietHours(input.quietHours),
    locale: locale(input.locale || 'en-US', 'preferences.locale'),
    timezone: text(input.timezone || 'UTC', 'preferences.timezone', 64),
  };
}

export function validateNotificationPreferences(preferences) {
  try {
    return { valid: true, value: clone(normalizeNotificationPreferences(preferences)), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [{ code: error.code || 'NOTIFICATION_PREFERENCES_INVALID', severity: 'error', message: error.message, field: error.field || null, metadata: clone(error.metadata || {}) }] };
  }
}

export function normalizeNotificationDeliveryAttempt(input) {
  assertKeys(input, DELIVERY_KEYS, 'deliveryAttempt');
  if (input.schemaVersion !== undefined && input.schemaVersion !== NOTIFICATION_DELIVERY_ATTEMPT_VERSION) fail('NOTIFICATION_DELIVERY_VERSION_UNSUPPORTED', 'Delivery Attempt version is unsupported.', 'deliveryAttempt.schemaVersion');
  return {
    deliveryAttemptId: typedId(input.deliveryAttemptId, 'deliveryAttempt.deliveryAttemptId'),
    notificationId: typedId(input.notificationId, 'deliveryAttempt.notificationId'),
    channel: enumValue(input.channel, 'deliveryAttempt.channel', [...NOTIFICATION_CHANNELS]),
    providerReference: input.providerReference === null || input.providerReference === undefined ? null : typedId(input.providerReference, 'deliveryAttempt.providerReference'),
    state: enumValue(input.state, 'deliveryAttempt.state', [...NOTIFICATION_DELIVERY_STATES]),
    attemptNumber: Number.isSafeInteger(input.attemptNumber) && input.attemptNumber >= 1 ? input.attemptNumber : fail('NOTIFICATION_DELIVERY_ATTEMPT_INVALID', 'Delivery attemptNumber must be positive.', 'deliveryAttempt.attemptNumber'),
    retryable: input.retryable === true,
    diagnosticCode: input.diagnosticCode === null || input.diagnosticCode === undefined ? null : text(input.diagnosticCode, 'deliveryAttempt.diagnosticCode', 96),
    createdAt: timestamp(input.createdAt, 'deliveryAttempt.createdAt'),
    completedAt: optionalTimestamp(input.completedAt, 'deliveryAttempt.completedAt'),
  };
}

export function validateNotificationDeliveryAttempt(attempt) {
  try {
    return { valid: true, value: clone(normalizeNotificationDeliveryAttempt(attempt)), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [{ code: error.code || 'NOTIFICATION_DELIVERY_INVALID', severity: 'error', message: error.message, field: error.field || null, metadata: clone(error.metadata || {}) }] };
  }
}

function normalizeQuery(input = {}) {
  assertKeys(input, QUERY_KEYS, 'query');
  const result = {
    recipientType: enumValue(input.recipientType, 'query.recipientType', [...NOTIFICATION_RECIPIENT_TYPES]),
    recipientId: typedId(input.recipientId, 'query.recipientId'),
    unread: input.unread === true,
    states: input.states === undefined ? [] : input.states,
    notificationTypes: input.notificationTypes === undefined ? [] : input.notificationTypes,
    priorities: input.priorities === undefined ? [] : input.priorities,
    projectReference: normalizeReference(input.projectReference, 'query.projectReference', { expectedType: 'PROJECT' }),
    createdAfter: input.createdAfter === undefined || input.createdAfter === null ? null : timestamp(input.createdAfter, 'query.createdAfter'),
    createdBefore: input.createdBefore === undefined || input.createdBefore === null ? null : timestamp(input.createdBefore, 'query.createdBefore'),
    cursor: input.cursor === undefined || input.cursor === null ? null : text(input.cursor, 'query.cursor', NOTIFICATION_LIMITS.cursor),
    pageSize: input.pageSize === undefined ? 20 : input.pageSize,
  };
  if (!Array.isArray(result.states) || result.states.length > NOTIFICATION_INBOX_STATES.length) fail('NOTIFICATION_QUERY_FILTER_INVALID', 'query.states must be a bounded state list.', 'query.states');
  result.states = result.states.map((item, index) => enumValue(item, `query.states[${index}]`, [...NOTIFICATION_INBOX_STATES]));
  if (!Array.isArray(result.notificationTypes) || result.notificationTypes.length > 16) fail('NOTIFICATION_QUERY_FILTER_INVALID', 'query.notificationTypes must be bounded.', 'query.notificationTypes');
  result.notificationTypes = result.notificationTypes.map((item, index) => enumValue(item, `query.notificationTypes[${index}]`, NOTIFICATION_TYPE_NAMES));
  if (!Array.isArray(result.priorities) || result.priorities.length > NOTIFICATION_PRIORITIES.length) fail('NOTIFICATION_QUERY_FILTER_INVALID', 'query.priorities must be bounded.', 'query.priorities');
  result.priorities = result.priorities.map((item, index) => enumValue(item, `query.priorities[${index}]`, [...NOTIFICATION_PRIORITIES]));
  if (!Number.isSafeInteger(result.pageSize) || result.pageSize < 1 || result.pageSize > NOTIFICATION_LIMITS.pageSize) fail('NOTIFICATION_QUERY_PAGE_SIZE_INVALID', 'query.pageSize is outside the hard limit.', 'query.pageSize');
  if (result.createdAfter && result.createdBefore && result.createdAfter > result.createdBefore) fail('NOTIFICATION_QUERY_RANGE_INVALID', 'query.createdAfter must precede query.createdBefore.', 'query.createdAfter');
  return result;
}

function queryFingerprint(query) {
  const { cursor, pageSize, ...stableQuery } = query;
  return encodeURIComponent(stableJson(stableQuery)).slice(0, 512);
}

function makeCursor(query, row) {
  return `notification:v1:${encodeURIComponent(`${queryFingerprint(query)}|${row.createdAt}|${row.notificationId}`)}`;
}

function parseCursor(cursor, query) {
  if (!cursor) return null;
  if (!cursor.startsWith('notification:v1:')) fail('NOTIFICATION_CURSOR_INVALID', 'Notification cursor has an unsupported format.', 'query.cursor');
  try {
    const decoded = decodeURIComponent(cursor.slice('notification:v1:'.length)).split('|');
    if (decoded.length !== 3 || decoded[0] !== queryFingerprint(query)) fail('NOTIFICATION_CURSOR_INVALID', 'Notification cursor does not match the query.', 'query.cursor');
    return { createdAt: timestamp(decoded[1], 'query.cursor.createdAt'), notificationId: typedId(decoded[2], 'query.cursor.notificationId') };
  } catch (error) {
    if (error.code === 'NOTIFICATION_CURSOR_INVALID') throw error;
    fail('NOTIFICATION_CURSOR_INVALID', 'Notification cursor cannot be decoded.', 'query.cursor');
  }
}

function diagnostic(code, message, field = null, metadata = {}) {
  return { code, severity: 'error', message, field, metadata: clone(metadata) };
}

function operationFailure(error, fallbackCode) {
  return { ok: false, diagnostics: [diagnostic(error.code || fallbackCode, error.message || 'Notification operation failed.', error.field || null, error.metadata || {})] };
}

function sourceVisibility(eventVisibility) {
  if (eventVisibility === 'PUBLIC') return 'PUBLIC_SAFE';
  if (eventVisibility === 'PROJECT_MEMBERS') return 'PROJECT_MEMBERS';
  if (eventVisibility === 'CREATOR_PRIVATE') return 'CREATOR_PRIVATE';
  if (eventVisibility === 'UNLISTED') return 'RECIPIENT_ONLY';
  return 'RECIPIENT_ONLY';
}

function eventNotificationType(event) {
  const allowed = NOTIFICATION_EVENT_SIGNALS[event.eventType] || [];
  const supplied = isObject(event.payload) && typeof event.payload.notificationType === 'string' ? event.payload.notificationType : null;
  if (supplied !== null) {
    if (!allowed.includes(supplied) || !NOTIFICATION_TYPES[supplied]) fail('NOTIFICATION_SIGNAL_INVALID', 'Event notification signal is not allowed for this Event Type.', 'event.payload.notificationType');
    return supplied;
  }
  if (event.eventType === 'PROJECT_MEMBER_CHANGED' && event.payload?.changeKind === 'INVITED') return 'PROJECT_INVITED';
  return DEFAULT_EVENT_NOTIFICATION_TYPE[event.eventType] || null;
}

function referenceForEvent(event) {
  return { referenceType: event.aggregateType, referenceId: event.aggregateId };
}

function safeProviderResult(result) {
  if (!isObject(result)) return { ok: false, retryable: false, code: 'NOTIFICATION_ADAPTER_INVALID' };
  return {
    ok: result.ok === true,
    delivered: result.delivered === true,
    retryable: result.retryable === true,
    code: typeof result.code === 'string' && /^[A-Z0-9_.:-]{1,96}$/u.test(result.code) ? result.code : result.ok === true ? null : 'NOTIFICATION_ADAPTER_FAILED',
    providerReference: result.providerReference === null || result.providerReference === undefined ? null : typedId(result.providerReference, 'providerReference'),
  };
}

export function createDefaultNotificationFlagEvaluator() {
  return ({ flagId } = {}) => NOTIFICATION_FLAG_NAMES.includes(flagId)
    ? { enabled: false, decision: 'disabled', source: 'server', flagId }
    : { enabled: false, decision: 'unknown', source: 'server', code: 'FEATURE_FLAG_UNKNOWN', flagId: flagId || null };
}

export function createInMemoryNotificationBackend() {
  let notifications = new Map();
  let deliveries = new Map();

  const apply = ({ operations } = {}) => {
    if (!Array.isArray(operations) || operations.length > NOTIFICATION_LIMITS.batchSize) return { ok: false, code: 'NOTIFICATION_BACKEND_BATCH_INVALID', retryable: false };
    const nextNotifications = new Map(notifications);
    const nextDeliveries = new Map(deliveries);
    try {
      for (const operation of operations) {
        if (!isObject(operation)) fail('NOTIFICATION_BACKEND_OPERATION_INVALID', 'Backend operation must be an object.');
        if (operation.operation === 'UPSERT_NOTIFICATION') nextNotifications.set(typedId(operation.notification.notificationId, 'operation.notification.notificationId'), normalizeNotificationRecord(operation.notification));
        else if (operation.operation === 'UPSERT_DELIVERY') nextDeliveries.set(typedId(operation.deliveryAttempt.deliveryAttemptId, 'operation.deliveryAttempt.deliveryAttemptId'), normalizeNotificationDeliveryAttempt(operation.deliveryAttempt));
        else if (operation.operation === 'REMOVE_DELIVERY') nextDeliveries.delete(typedId(operation.deliveryAttemptId, 'operation.deliveryAttemptId'));
        else fail('NOTIFICATION_BACKEND_OPERATION_INVALID', 'Backend operation is not a typed Notification operation.');
      }
      notifications = nextNotifications;
      deliveries = nextDeliveries;
      return { ok: true, applied: operations.length };
    } catch (error) {
      return { ok: false, code: error.code || 'NOTIFICATION_BACKEND_APPLY_FAILED', retryable: false };
    }
  };

  const query = ({ recipientType, recipientId } = {}) => ({
    ok: true,
    notifications: [...notifications.values()].filter((item) => item.recipientType === recipientType && item.recipientId === recipientId).map(clone),
  });
  const clear = () => { notifications = new Map(); deliveries = new Map(); return { ok: true }; };
  const snapshot = () => ({ notifications: [...notifications.values()].map(clone), deliveries: [...deliveries.values()].map(clone) });
  return Object.freeze({ apply, query, clear, snapshot });
}

export function createNotificationCore({
  clock = null,
  idGenerator = null,
  featureFlagEvaluator = null,
  eventTrustEvaluator = null,
  recipientResolver = null,
  authorizationEvaluator = null,
  preferenceEvaluator = null,
  rateLimitEvaluator = null,
  backendAdapter = null,
  deliveryAdapters = {},
  groupWindowMs = NOTIFICATION_LIMITS.groupingWindowMs,
} = {}) {
  const backend = backendAdapter || createInMemoryNotificationBackend();
  for (const method of NOTIFICATION_BACKEND_CONTRACT.requiredMethods) if (typeof backend[method] !== 'function') throw new Error(`Notification backend method ${method} is required.`);
  if (!Number.isSafeInteger(groupWindowMs) || groupWindowMs < 0 || groupWindowMs > 24 * 60 * 60 * 1000) throw new Error('Notification groupWindowMs is outside the hard limit.');

  const state = {
    notifications: Object.create(null),
    notificationOrder: [],
    sourceKeys: Object.create(null),
    groupingKeys: Object.create(null),
    deliveries: Object.create(null),
    deliveryOrder: [],
    deliveryByNotificationChannel: Object.create(null),
    projectionQueue: [],
    queuedEventIds: Object.create(null),
    projectionAttempts: Object.create(null),
    deadLetters: [],
    sourceEventVersions: Object.create(null),
  };

  const now = () => {
    if (typeof clock !== 'function') fail('NOTIFICATION_CLOCK_ADAPTER_MISSING', 'A host clock adapter is required.');
    const value = clock();
    return timestamp(value instanceof Date ? value.toISOString() : value, 'notification.createdAt');
  };
  const nextId = (kind) => {
    if (typeof idGenerator !== 'function') fail('NOTIFICATION_ID_ADAPTER_MISSING', 'A host ID adapter is required.');
    return typedId(idGenerator(kind), `${kind}Id`);
  };
  const evaluateFlag = ({ flagId, action = 'read' } = {}) => {
    try {
      if (!NOTIFICATION_FLAG_NAMES.includes(flagId)) fail('FEATURE_FLAG_UNKNOWN', 'Unknown Notification Feature Flag fails closed.', 'flagId');
      if (typeof featureFlagEvaluator !== 'function') fail('NOTIFICATION_FLAG_EVALUATOR_MISSING', 'Notification Feature Flag evaluation must be injected.');
      const result = featureFlagEvaluator({ flagId, action, source: 'server' });
      if (!result || result.enabled !== true || result.decision !== 'enabled') fail(result?.code === 'FEATURE_FLAG_KILL_SWITCH' || result?.decision === 'kill-switched' ? 'NOTIFICATION_KILL_SWITCH' : 'NOTIFICATION_FLAG_OFF', 'Notification Feature Flag denied this operation.', 'flagId', { flagId, action, decision: result?.decision || 'unknown' });
      return { ok: true, flag: clone(result) };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_FLAG_OFF');
    }
  };
  const requireFlag = (flagId, action) => {
    const result = evaluateFlag({ flagId, action });
    if (result.ok !== true) fail(result.diagnostics[0].code, result.diagnostics[0].message, result.diagnostics[0].field, result.diagnostics[0].metadata);
    return result.flag;
  };
  const trustedEvent = (event) => {
    if (typeof eventTrustEvaluator !== 'function') fail('NOTIFICATION_EVENT_TRUST_ADAPTER_MISSING', 'Notification accepts only Events trusted by the WP-095 Event Core.');
    if (typeof authorizationEvaluator !== 'function') fail('NOTIFICATION_AUTHZ_EVALUATOR_REQUIRED', 'Notification Event trust requires a server-owned Authorization evaluator.');
    const decision = eventTrustEvaluator({ event: clone(event), source: 'server', consumer: 'notification-core' });
    resolveAuthorizationProofSync({
      expected: { principalId: event.actorRef?.actorId ?? null, resourceType: 'EVENT', resourceId: event.eventId, action: 'notification.event.consume', capability: 'notification.event.consume', tenantId: decision?.tenantId ?? null, correlationId: event.correlationId ?? decision?.correlationId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
      callerProof: decision,
      authorizationEvaluator: (input) => authorizationEvaluator({ ...input, source: 'server', consumer: 'notification-core' }),
    });
  };
  const validateTrustedEvent = (input) => {
    if (HIGH_FREQUENCY_EVENT_TYPES.has(input?.eventType)) fail('NOTIFICATION_HIGH_FREQUENCY_EVENT', 'High-frequency editor operations cannot create Notifications.');
    const valid = validateEventEnvelope(input);
    if (!valid.valid) fail('NOTIFICATION_EVENT_INVALID', 'Event does not satisfy the WP-095 Event Envelope.', null, { diagnostics: valid.diagnostics });
    trustedEvent(valid.value);
    return valid.value;
  };
  const persist = (operations) => {
    const result = backend.apply({ operations: clone(operations), source: 'notification-core' });
    if (!result || result.ok !== true) fail(result?.code || 'NOTIFICATION_BACKEND_APPLY_FAILED', 'Notification backend did not commit the bounded operation batch.', null, { retryable: result?.retryable === true });
  };
  const sourceKey = (recipientType, recipientId, notificationType, eventId) => compactKey('notification', `${recipientType}:${recipientId}:${notificationType}:${eventId}`);
  const groupingKey = ({ recipientType, recipientId, notificationType, actorReference, objectReference, projectReference }) => compactKey('group', [
    recipientType, recipientId, notificationType, actorReference?.referenceType || '-', actorReference?.referenceId || '-',
    objectReference?.referenceType || '-', objectReference?.referenceId || '-', projectReference?.referenceId || '-',
  ].join(':'));
  const currentState = (notification) => notification.archivedAt ? 'ARCHIVED' : notification.readAt ? 'READ' : 'UNREAD';
  const resolveRecipientAuthorization = ({ permissionDecision, recipientId, action = 'notification.recipient.access' } = {}) => {
    if (typeof authorizationEvaluator !== 'function') fail('NOTIFICATION_AUTHZ_EVALUATOR_REQUIRED', 'Notification recipient operations require a server-owned Authorization evaluator.');
    const principalId = permissionDecision?.principalId ?? null;
    return resolveAuthorizationProofSync({
      expected: { principalId, resourceType: 'NOTIFICATION_RECIPIENT', resourceId: recipientId, action, capability: action, tenantId: permissionDecision?.tenantId ?? null, correlationId: permissionDecision?.correlationId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
      callerProof: permissionDecision,
      authorizationEvaluator: (input) => authorizationEvaluator({ principalId: input.principalId, resourceType: input.resourceType, resourceId: input.resourceId, action: input.action, capability: input.capability, tenantId: input.tenantId, correlationId: input.correlationId, source: 'server' }),
    });
  };
  const resolveOperationAuthorization = ({ permissionDecision, resourceType, resourceId, action, capability = action, principalId = null, tenantId = permissionDecision?.tenantId ?? null, correlationId = permissionDecision?.correlationId ?? null } = {}) => {
    if (typeof authorizationEvaluator !== 'function') fail('NOTIFICATION_AUTHZ_EVALUATOR_REQUIRED', 'Notification operations require a server-owned Authorization evaluator.');
    const proof = resolveAuthorizationProofSync({
      expected: { principalId: permissionDecision?.principalId ?? principalId, resourceType, resourceId, action, capability, tenantId, correlationId, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
      callerProof: permissionDecision,
      authorizationEvaluator: (input) => authorizationEvaluator({ ...input, source: 'server' }),
    });
    if (proof.decision !== 'allow') fail('NOTIFICATION_PERMISSION_DENIED', 'Notification operation authorization was denied by the server.');
    return proof;
  };
  const assertRecipientScopeBound = (decision, recipientType, recipientId) => {
    const proof = resolveRecipientAuthorization({ permissionDecision: decision, recipientId });
    if (proof.decision !== 'allow') fail('NOTIFICATION_PERMISSION_DENIED', 'Notification recipient authorization was denied by the server.');
    if (proof.resourceId !== recipientId) fail('NOTIFICATION_CROSS_USER_ACCESS_DENIED', 'AuthorizationProof recipient does not match the Notification recipient.');
    return proof;
  };
  const findGroup = (key, createdAt) => {
    const existingId = state.groupingKeys[key];
    if (!existingId) return null;
    const existing = state.notifications[existingId];
    if (!existing) return null;
    const lastOccurredAt = existing.presentationMetadata.lastOccurredAt || existing.createdAt;
    if (Date.parse(createdAt) - Date.parse(lastOccurredAt) < 0 || Date.parse(createdAt) - Date.parse(lastOccurredAt) > groupWindowMs) return null;
    return existing;
  };
  const normalizedPreferenceDecision = ({ event, notificationType, recipient }) => {
    const raw = typeof preferenceEvaluator === 'function'
      ? preferenceEvaluator({ event: clone(event), notificationType, recipient: clone(recipient), source: 'server' })
      : { preference: { category: NOTIFICATION_TYPES[notificationType].category, inAppEnabled: true, pushEnabled: false, emailEnabled: false, digestEnabled: false, mutedProjectIds: [], mutedResourceIds: [], mutedActorIds: [], quietHours: null, locale: 'en-US', timezone: 'UTC' } };
    const preferenceInput = isObject(raw?.preference) ? raw.preference : raw;
    const validated = validateNotificationPreferences(preferenceInput);
    if (!validated.valid) fail('NOTIFICATION_PREFERENCE_INVALID', 'Preference evaluator returned an invalid contract.', null, { diagnostics: validated.diagnostics });
    const preference = validated.value;
    const projectId = event.projectId;
    const resourceId = event.aggregateId;
    const actorId = event.actorRef?.actorId || null;
    const muted = (projectId && preference.mutedProjectIds.includes(projectId)) || preference.mutedResourceIds.includes(resourceId) || (actorId && preference.mutedActorIds.includes(actorId));
    return {
      preference,
      muted: muted || raw?.muted === true,
      suppressed: raw?.suppressed === true,
      quietHoursActive: raw?.quietHoursActive === true,
      suppressionReason: raw?.suppressionReason || (muted ? 'PREFERENCE_MUTED' : null),
    };
  };
  const normalizeRecipient = (item, index, eventVisibility) => {
    assertKeys(item, RECIPIENT_KEYS, `recipientResolver[${index}]`);
    const recipientType = enumValue(item.recipientType, `recipientResolver[${index}].recipientType`, [...NOTIFICATION_RECIPIENT_TYPES]);
    const recipientId = typedId(item.recipientId, `recipientResolver[${index}].recipientId`);
    const permissionDecision = resolveRecipientAuthorization({ permissionDecision: item.permissionDecision, recipientId });
    if (permissionDecision.decision !== 'allow') fail('NOTIFICATION_PERMISSION_DENIED', 'Notification recipient authorization was denied by the server.', `recipientResolver[${index}].permissionDecision`);
    if (permissionDecision.resourceId !== recipientId) fail('NOTIFICATION_CROSS_USER_ACCESS_DENIED', 'Recipient Proof does not match the resolved recipient.', `recipientResolver[${index}].permissionDecision`);
    const visibility = item.visibilityClass || sourceVisibility(eventVisibility);
    enumValue(visibility, `recipientResolver[${index}].visibilityClass`, [...NOTIFICATION_VISIBILITY_CLASSES]);
    if (eventVisibility !== 'PUBLIC' && visibility === 'PUBLIC_SAFE') fail('NOTIFICATION_VISIBILITY_BROADENED', 'A Notification cannot broaden a private Event to PUBLIC_SAFE.');
    return { recipientType, recipientId, visibilityClass: visibility, permissionDecision: clone(permissionDecision), source: item.source || 'permission-core' };
  };
  const resolveRecipients = (event, notificationType) => {
    if (typeof recipientResolver !== 'function') fail('NOTIFICATION_RECIPIENT_RESOLVER_MISSING', 'Recipient resolution must be injected from the server permission boundary.');
    const raw = recipientResolver({ event: clone(event), notificationType, source: 'server' });
    if (!Array.isArray(raw) || raw.length > NOTIFICATION_LIMITS.recipientsPerEvent) fail('NOTIFICATION_RECIPIENT_LIST_INVALID', 'Recipient resolver must return a bounded server-resolved list.');
    const recipients = raw.map((item, index) => normalizeRecipient(item, index, event.visibilityClass));
    const seen = new Set();
    return recipients.filter((item) => {
      const key = `${item.recipientType}:${item.recipientId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const buildNotification = ({ event, notificationType, recipient, preferenceResult, rateResult, createdAt }) => {
    const policy = NOTIFICATION_TYPES[notificationType];
    const mandatory = policy.mandatory === true;
    const preference = preferenceResult.preference;
    const quietHours = preferenceResult.quietHoursActive === true;
    const suppressedByPreference = !mandatory && (preferenceResult.muted || preferenceResult.suppressed);
    const metadataInput = isObject(event.payload?.presentationMetadata) ? event.payload.presentationMetadata : {};
    const presentationMetadata = boundedMetadata({
      ...metadataInput,
      locale: preference.locale,
      reasonCode: typeof event.payload?.reasonCode === 'string' ? event.payload.reasonCode : null,
    }, 'notification.presentationMetadata');
    const resourceReference = referenceForEvent(event);
    const objectReference = referenceForEvent(event);
    const projectReference = event.projectId ? { referenceType: 'PROJECT', referenceId: event.projectId } : null;
    const deliveryPolicy = {
      inApp: mandatory || (!suppressedByPreference && preference.inAppEnabled),
      webPush: mandatory || (!suppressedByPreference && preference.pushEnabled),
      mobilePush: mandatory || (!suppressedByPreference && preference.pushEnabled),
      email: mandatory || (!suppressedByPreference && preference.emailEnabled),
      digest: !mandatory && !suppressedByPreference && preference.digestEnabled,
      quietHours,
      rateLimited: rateResult?.action === 'DELAY',
      mandatory,
      suppressedReason: suppressedByPreference ? (preferenceResult.suppressionReason || 'PREFERENCE_SUPPRESSED') : null,
    };
    return normalizeNotificationRecord({
      notificationId: nextId('notification'),
      notificationVersion: NOTIFICATION_RECORD_VERSION,
      recipientType: recipient.recipientType,
      recipientId: recipient.recipientId,
      notificationType,
      sourceEventId: event.eventId,
      sourceEventVersion: event.eventVersion,
      actorReference: event.actorRef ? { referenceType: event.actorRef.actorType, referenceId: event.actorRef.actorId } : null,
      objectReference,
      projectReference,
      resourceReference,
      visibilityClass: recipient.visibilityClass,
      priority: policy.defaultPriority,
      presentationKey: policy.presentationKey,
      presentationMetadata,
      groupingKey: groupingKey({ recipientType: recipient.recipientType, recipientId: recipient.recipientId, notificationType, actorReference: event.actorRef ? { referenceType: event.actorRef.actorType, referenceId: event.actorRef.actorId } : null, objectReference, projectReference }),
      deduplicationKey: sourceKey(recipient.recipientType, recipient.recipientId, notificationType, event.eventId),
      deliveryPolicy,
      createdAt,
      readAt: null,
      archivedAt: null,
      schemaVersion: NOTIFICATION_CORE_SCHEMA_VERSION,
    });
  };
  const applyNotification = (notification, { grouped = false } = {}) => {
    persist([{ operation: 'UPSERT_NOTIFICATION', notification }]);
    const old = state.notifications[notification.notificationId];
    if (!old) state.notificationOrder.push(notification.notificationId);
    state.notifications[notification.notificationId] = clone(notification);
    state.sourceKeys[notification.deduplicationKey] = notification.notificationId;
    state.groupingKeys[notification.groupingKey] = notification.notificationId;
    return { notification: clone(notification), grouped };
  };
  const applyGroupedNotification = (existing, incoming, event) => {
    if (existing.priority === 'CRITICAL' || !NOTIFICATION_TYPES[existing.notificationType].groupable) return null;
    const nextMetadata = boundedMetadata({
      ...existing.presentationMetadata,
      groupCount: Math.min(99, Number(existing.presentationMetadata.groupCount || 1) + 1),
      lastSourceEventId: event.eventId,
      lastOccurredAt: incoming.createdAt,
    }, 'notification.presentationMetadata');
    const updated = normalizeNotificationRecord({ ...existing, notificationVersion: existing.notificationVersion, presentationMetadata: nextMetadata });
    applyNotification(updated, { grouped: true });
    state.sourceKeys[incoming.deduplicationKey] = updated.notificationId;
    return updated;
  };

  const projectEvent = ({ event: inputEvent, replay = false } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.write, replay ? 'replay-write' : 'projection-write');
      requireFlag(NOTIFICATION_FLAGS.eventProjection, replay ? 'replay' : 'project');
      const event = validateTrustedEvent(inputEvent);
      const notificationType = eventNotificationType(event);
      state.sourceEventVersions[event.eventId] = event.eventVersion;
      if (!notificationType) return { ok: true, projected: false, ignored: true, reason: 'EVENT_NOT_ELIGIBLE', notifications: [], externalSideEffects: 0 };
      const recipients = resolveRecipients(event, notificationType);
      const createdAt = now();
      const result = { ok: true, projected: true, created: 0, grouped: 0, deduplicated: 0, suppressed: 0, delayed: 0, notifications: [], externalSideEffects: 0 };
      for (const recipient of recipients) {
        const dedupKey = sourceKey(recipient.recipientType, recipient.recipientId, notificationType, event.eventId);
        if (state.sourceKeys[dedupKey]) {
          result.deduplicated += 1;
          result.notifications.push(clone(state.notifications[state.sourceKeys[dedupKey]]));
          continue;
        }
        const policy = NOTIFICATION_TYPES[notificationType];
        const preferenceResult = normalizedPreferenceDecision({ event, notificationType, recipient });
        const rateResult = typeof rateLimitEvaluator === 'function'
          ? rateLimitEvaluator({ event: clone(event), notificationType, recipient: clone(recipient), priority: policy.defaultPriority, source: 'server' })
          : { allowed: true };
        if (!isObject(rateResult) || (rateResult.allowed !== true && !NOTIFICATION_RATE_LIMIT_ACTIONS.includes(rateResult.action))) fail('NOTIFICATION_RATE_LIMIT_INVALID', 'Rate-limit evaluator returned an invalid typed result.');
        if (rateResult.allowed !== true && policy.defaultPriority === 'CRITICAL' && rateResult.action !== 'DELAY') fail('NOTIFICATION_CRITICAL_RATE_LIMIT_POLICY_REQUIRED', 'CRITICAL Notification cannot be silently suppressed or grouped.');
        if (rateResult.allowed !== true && rateResult.action === 'SUPPRESS' && policy.defaultPriority !== 'CRITICAL') {
          result.suppressed += 1;
          continue;
        }
        const notification = buildNotification({ event, notificationType, recipient, preferenceResult, rateResult, createdAt });
        const grouped = policy.groupable && policy.defaultPriority !== 'CRITICAL' ? findGroup(notification.groupingKey, createdAt) : null;
        if (grouped) {
          const updated = applyGroupedNotification(grouped, notification, event);
          if (updated) {
            result.grouped += 1;
            result.notifications.push(clone(updated));
            continue;
          }
        }
        const applied = applyNotification(notification);
        result.created += 1;
        if (rateResult.action === 'DELAY') result.delayed += 1;
        if (!notification.deliveryPolicy.inApp && !notification.deliveryPolicy.webPush && !notification.deliveryPolicy.mobilePush && !notification.deliveryPolicy.email && !notification.deliveryPolicy.digest) result.suppressed += 1;
        result.notifications.push(applied.notification);
      }
      return result;
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_PROJECTION_FAILED');
    }
  };

  const enqueueProjection = ({ event: inputEvent, permissionDecision } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.write, 'enqueue');
      requireFlag(NOTIFICATION_FLAGS.eventProjection, 'enqueue');
      const event = validateTrustedEvent(inputEvent);
      resolveOperationAuthorization({ permissionDecision, resourceType: 'NOTIFICATION_EVENT', resourceId: event.eventId, action: 'notification.enqueue', capability: 'notification.enqueue', principalId: event.actorRef?.actorId ?? null, correlationId: event.correlationId ?? permissionDecision?.correlationId ?? null });
      if (state.queuedEventIds[event.eventId]) return { ok: true, queued: false, idempotent: true, eventId: event.eventId };
      if (state.projectionQueue.length >= NOTIFICATION_LIMITS.queue) fail('NOTIFICATION_QUEUE_FULL', 'Notification projection queue is full.');
      state.projectionQueue.push({ eventId: event.eventId, event });
      state.queuedEventIds[event.eventId] = true;
      return { ok: true, queued: true, eventId: event.eventId };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_ENQUEUE_FAILED');
    }
  };

  const processProjectionQueue = ({ batchSize = NOTIFICATION_LIMITS.batchSize } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.write, 'queue-process');
      requireFlag(NOTIFICATION_FLAGS.eventProjection, 'queue-process');
      const limit = Math.min(version(batchSize, 'batchSize'), NOTIFICATION_LIMITS.batchSize);
      let processed = 0; let retried = 0; let deadLettered = 0;
      for (let index = 0; index < limit && state.projectionQueue.length; index += 1) {
        const row = state.projectionQueue[0];
        const result = projectEvent({ event: row.event });
        if (result.ok === true) {
          state.projectionQueue.shift();
          delete state.queuedEventIds[row.eventId];
          processed += 1;
          continue;
        }
        const attempts = (state.projectionAttempts[row.eventId] || 0) + 1;
        state.projectionAttempts[row.eventId] = attempts;
        if (result.retryable === true && attempts < NOTIFICATION_LIMITS.retryAttempts) retried += 1;
        else {
          state.projectionQueue.shift();
          delete state.queuedEventIds[row.eventId];
          state.deadLetters.push({ deadLetterId: nextId('notification-dead-letter'), eventId: row.eventId, attempts, code: result.diagnostics?.[0]?.code || 'NOTIFICATION_PROJECTION_FAILED', createdAt: now() });
          deadLettered += 1;
        }
      }
      return { ok: true, processed, retried, deadLettered, pending: state.projectionQueue.length };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_QUEUE_PROCESS_FAILED');
    }
  };

  const queryInbox = ({ query = {}, permissionDecision } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.read, 'inbox-query');
      const normalized = normalizeQuery(query);
      assertRecipientScopeBound(permissionDecision, normalized.recipientType, normalized.recipientId);
      const cursor = parseCursor(normalized.cursor, normalized);
      let rows = state.notificationOrder.map((id) => state.notifications[id]).filter(Boolean).filter((notification) => {
        if (notification.recipientType !== normalized.recipientType || notification.recipientId !== normalized.recipientId) return false;
        const stateName = currentState(notification);
        if (normalized.unread && stateName !== 'UNREAD') return false;
        if (normalized.states.length && !normalized.states.includes(stateName)) return false;
        if (normalized.notificationTypes.length && !normalized.notificationTypes.includes(notification.notificationType)) return false;
        if (normalized.priorities.length && !normalized.priorities.includes(notification.priority)) return false;
        if (normalized.projectReference && notification.projectReference?.referenceId !== normalized.projectReference.referenceId) return false;
        if (normalized.createdAfter && notification.createdAt <= normalized.createdAfter) return false;
        if (normalized.createdBefore && notification.createdAt >= normalized.createdBefore) return false;
        return true;
      }).sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.notificationId.localeCompare(left.notificationId));
      if (cursor) rows = rows.filter((row) => row.createdAt < cursor.createdAt || (row.createdAt === cursor.createdAt && row.notificationId < cursor.notificationId));
      const page = rows.slice(0, normalized.pageSize).map(clone);
      const nextCursor = page.length === normalized.pageSize && rows.length > page.length ? makeCursor(normalized, page[page.length - 1]) : null;
      return { ok: true, results: page, nextCursor, total: rows.length };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_INBOX_QUERY_FAILED');
    }
  };

  const mutateNotification = ({ notificationId, permissionDecision, mutation }) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.write, 'inbox-mutation');
      const id = typedId(notificationId, 'notificationId');
      const current = state.notifications[id];
      if (!current) fail('NOTIFICATION_UNKNOWN_ID', 'Notification was not found.', 'notificationId');
      assertRecipientScopeBound(permissionDecision, current.recipientType, current.recipientId);
      const updated = normalizeNotificationRecord(mutation(clone(current)));
      if (stableJson(updated) === stableJson(current)) return { ok: true, changed: false, notification: clone(current), idempotent: true };
      applyNotification(updated);
      return { ok: true, changed: true, notification: clone(updated) };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_INBOX_MUTATION_FAILED');
    }
  };

  const markRead = ({ notificationId, permissionDecision } = {}) => mutateNotification({ notificationId, permissionDecision, mutation: (item) => ({ ...item, readAt: item.readAt || now() }) });
  const markUnread = ({ notificationId, permissionDecision } = {}) => mutateNotification({ notificationId, permissionDecision, mutation: (item) => ({ ...item, readAt: null }) });
  const archive = ({ notificationId, permissionDecision } = {}) => mutateNotification({ notificationId, permissionDecision, mutation: (item) => ({ ...item, archivedAt: item.archivedAt || now() }) });
  const restore = ({ notificationId, permissionDecision } = {}) => mutateNotification({ notificationId, permissionDecision, mutation: (item) => ({ ...item, archivedAt: null }) });

  const markAllRead = ({ recipientType, recipientId, watermark = null, cursor = null, permissionDecision } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.write, 'mark-all-read');
      recipientType = enumValue(recipientType, 'recipientType', [...NOTIFICATION_RECIPIENT_TYPES]);
      recipientId = typedId(recipientId, 'recipientId');
    assertRecipientScopeBound(permissionDecision, recipientType, recipientId);
      if (watermark === null && cursor === null) fail('NOTIFICATION_WATERMARK_REQUIRED', 'Mark All Read requires a timestamp watermark or stable cursor.');
      const boundary = watermark === null ? parseCursor(cursor, { recipientType, recipientId, unread: false, states: [], notificationTypes: [], priorities: [], projectReference: null, createdAfter: null, createdBefore: null, cursor: null, pageSize: 20 }) : timestamp(watermark, 'watermark');
      let changed = 0;
      for (const id of state.notificationOrder) {
        const item = state.notifications[id];
        if (!item || item.recipientType !== recipientType || item.recipientId !== recipientId || item.archivedAt || item.readAt) continue;
        const within = typeof boundary === 'string' ? item.createdAt <= boundary : (item.createdAt < boundary.createdAt || (item.createdAt === boundary.createdAt && item.notificationId <= boundary.notificationId));
        if (!within) continue;
        const updated = normalizeNotificationRecord({ ...item, readAt: now() });
        applyNotification(updated);
        changed += 1;
      }
      return { ok: true, changed, watermark: typeof boundary === 'string' ? boundary : null, cursor: typeof boundary === 'string' ? null : cursor };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_MARK_ALL_READ_FAILED');
    }
  };

  const createDeliveryAttempt = ({ notificationId, channel, permissionDecision } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.write, 'delivery-create');
      const id = typedId(notificationId, 'notificationId');
      const notification = state.notifications[id];
      if (!notification) fail('NOTIFICATION_UNKNOWN_ID', 'Notification was not found.', 'notificationId');
      assertRecipientScopeBound(permissionDecision, notification.recipientType, notification.recipientId);
      channel = enumValue(channel, 'channel', [...NOTIFICATION_CHANNELS]);
      if (channel === 'DIGEST') requireFlag(NOTIFICATION_FLAGS.digest, 'digest-create');
      const key = `${id}:${channel}`;
      if (state.deliveryByNotificationChannel[key]) return { ok: true, attempt: clone(state.deliveries[state.deliveryByNotificationChannel[key]]), idempotent: true };
      const enabled = notification.deliveryPolicy[channel === 'IN_APP' ? 'inApp' : channel === 'WEB_PUSH' ? 'webPush' : channel === 'MOBILE_PUSH' ? 'mobilePush' : channel === 'EMAIL' ? 'email' : 'digest'];
      const external = channel !== 'IN_APP';
      const flagOff = external && channel !== 'DIGEST' && evaluateFlag({ flagId: NOTIFICATION_FLAGS.externalDelivery, action: 'delivery-create' }).ok !== true;
      const suppressedReason = enabled !== true ? 'NOTIFICATION_PREFERENCE_SUPPRESSED' : flagOff ? 'NOTIFICATION_EXTERNAL_DELIVERY_OFF' : null;
      const quietDelay = notification.deliveryPolicy.quietHours === true && external;
      const attempt = normalizeNotificationDeliveryAttempt({
        deliveryAttemptId: nextId('delivery-attempt'), notificationId: id, channel,
        providerReference: null, state: suppressedReason ? 'SUPPRESSED' : 'PENDING', attemptNumber: 1,
        retryable: false, diagnosticCode: suppressedReason || (quietDelay ? 'NOTIFICATION_QUIET_HOURS_DELAYED' : null), createdAt: now(), completedAt: suppressedReason ? now() : null,
      });
      persist([{ operation: 'UPSERT_DELIVERY', deliveryAttempt: attempt }]);
      state.deliveries[attempt.deliveryAttemptId] = attempt;
      state.deliveryOrder.push(attempt.deliveryAttemptId);
      state.deliveryByNotificationChannel[key] = attempt.deliveryAttemptId;
      return { ok: true, attempt: clone(attempt), delayed: quietDelay };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_DELIVERY_CREATE_FAILED');
    }
  };

  const deliveryEnvelope = (notification, channel) => {
    const safeMetadata = channel === 'IN_APP' ? clone(notification.presentationMetadata) : Object.fromEntries(Object.entries(notification.presentationMetadata).filter(([key]) => ['locale', 'reasonCode', 'groupCount', 'lastOccurredAt'].includes(key)));
    return { notificationId: notification.notificationId, notificationType: notification.notificationType, presentationKey: notification.presentationKey, locale: safeMetadata.locale || 'en-US', visibilityClass: notification.visibilityClass, objectReference: clone(notification.objectReference), projectReference: clone(notification.projectReference), resourceReference: clone(notification.resourceReference), presentationMetadata: safeMetadata };
  };

  const dispatchDeliveries = ({ batchSize = NOTIFICATION_LIMITS.batchSize, permissionDecision } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.read, 'delivery-dispatch');
      resolveOperationAuthorization({ permissionDecision, resourceType: 'NOTIFICATION_DELIVERY_BATCH', resourceId: 'notification-delivery-batch', action: 'notification.dispatch', capability: 'notification.dispatch' });
      const limit = Math.min(version(batchSize, 'batchSize'), NOTIFICATION_LIMITS.batchSize);
      let sent = 0; let delivered = 0; let failed = 0; let retried = 0; let suppressed = 0; let delayed = 0; let deadLettered = 0;
      const pending = state.deliveryOrder.map((id) => state.deliveries[id]).filter((attempt) => attempt?.state === 'PENDING').slice(0, limit);
      for (const current of pending) {
        const notification = state.notifications[current.notificationId];
        if (!notification) continue;
        const external = current.channel !== 'IN_APP';
        if (notification.deliveryPolicy.quietHours && external) { delayed += 1; continue; }
        if (current.channel === 'DIGEST') {
          const digestFlag = evaluateFlag({ flagId: NOTIFICATION_FLAGS.digest, action: 'dispatch' });
          if (digestFlag.ok !== true) { delayed += 1; continue; }
        } else if (external) {
          const deliveryFlag = evaluateFlag({ flagId: NOTIFICATION_FLAGS.externalDelivery, action: 'dispatch' });
          if (deliveryFlag.ok !== true) {
            const updated = normalizeNotificationDeliveryAttempt({ ...current, state: 'SUPPRESSED', retryable: false, diagnosticCode: deliveryFlag.diagnostics[0].code, completedAt: now() });
            persist([{ operation: 'UPSERT_DELIVERY', deliveryAttempt: updated }]);
            state.deliveries[current.deliveryAttemptId] = updated;
            suppressed += 1;
            continue;
          }
        }
        const adapter = current.channel === 'IN_APP' ? (deliveryAdapters.IN_APP || (() => ({ ok: true, delivered: true }))) : deliveryAdapters[current.channel];
        if (typeof adapter !== 'function') {
          const updated = normalizeNotificationDeliveryAttempt({ ...current, state: 'SUPPRESSED', retryable: false, diagnosticCode: 'NOTIFICATION_ADAPTER_NOT_CONFIGURED', completedAt: now() });
          persist([{ operation: 'UPSERT_DELIVERY', deliveryAttempt: updated }]);
          state.deliveries[current.deliveryAttemptId] = updated;
          suppressed += 1;
          continue;
        }
        let result;
        try { result = safeProviderResult(adapter({ attempt: clone(current), notification: deliveryEnvelope(notification, current.channel), source: 'server' })); } catch (error) { result = { ok: false, delivered: false, retryable: false, code: /^[A-Z0-9_.:-]{1,96}$/u.test(error?.code || '') ? error.code : 'NOTIFICATION_ADAPTER_EXCEPTION', providerReference: null }; }
        if (result.ok === true) {
          const updated = normalizeNotificationDeliveryAttempt({ ...current, state: result.delivered ? 'DELIVERED' : 'SENT', providerReference: result.providerReference, retryable: false, diagnosticCode: null, completedAt: now() });
          persist([{ operation: 'UPSERT_DELIVERY', deliveryAttempt: updated }]);
          state.deliveries[current.deliveryAttemptId] = updated;
          sent += 1; if (result.delivered) delivered += 1;
          continue;
        }
        if (result.retryable && current.attemptNumber < NOTIFICATION_LIMITS.retryAttempts) {
          const updated = normalizeNotificationDeliveryAttempt({ ...current, attemptNumber: current.attemptNumber + 1, retryable: true, diagnosticCode: result.code, completedAt: null });
          persist([{ operation: 'UPSERT_DELIVERY', deliveryAttempt: updated }]);
          state.deliveries[current.deliveryAttemptId] = updated;
          retried += 1;
          continue;
        }
        const updated = normalizeNotificationDeliveryAttempt({ ...current, state: 'FAILED', retryable: false, diagnosticCode: result.code, completedAt: now() });
        persist([{ operation: 'UPSERT_DELIVERY', deliveryAttempt: updated }]);
        state.deliveries[current.deliveryAttemptId] = updated;
        state.deadLetters.push({ deadLetterId: nextId('delivery-dead-letter'), deliveryAttemptId: current.deliveryAttemptId, notificationId: current.notificationId, channel: current.channel, attemptNumber: current.attemptNumber, diagnosticCode: result.code, createdAt: now() });
        failed += 1; deadLettered += 1;
      }
      return { ok: true, sent, delivered, failed, retried, suppressed, delayed, deadLettered, pending: state.deliveryOrder.filter((id) => state.deliveries[id]?.state === 'PENDING').length };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_DELIVERY_DISPATCH_FAILED');
    }
  };

  const cancelDeliveryAttempt = ({ deliveryAttemptId, permissionDecision } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.write, 'delivery-cancel');
      const id = typedId(deliveryAttemptId, 'deliveryAttemptId');
      const current = state.deliveries[id];
      if (!current) fail('NOTIFICATION_DELIVERY_UNKNOWN_ID', 'Delivery Attempt was not found.', 'deliveryAttemptId');
      const notification = state.notifications[current.notificationId];
      assertRecipientScopeBound(permissionDecision, notification.recipientType, notification.recipientId);
      if (current.state !== 'PENDING') fail('NOTIFICATION_DELIVERY_ALREADY_TERMINAL', 'Only a pending Delivery Attempt can be cancelled.');
      const updated = normalizeNotificationDeliveryAttempt({ ...current, state: 'CANCELLED', retryable: false, diagnosticCode: 'NOTIFICATION_DELIVERY_CANCELLED', completedAt: now() });
      persist([{ operation: 'UPSERT_DELIVERY', deliveryAttempt: updated }]);
      state.deliveries[id] = updated;
      return { ok: true, attempt: clone(updated) };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_DELIVERY_CANCEL_FAILED');
    }
  };

  const replayProjection = ({ events = [], eventIds = null } = {}) => {
    try {
      requireFlag(NOTIFICATION_FLAGS.read, 'replay');
      requireFlag(NOTIFICATION_FLAGS.eventProjection, 'replay');
      if (!Array.isArray(events) || events.length > 10000) fail('NOTIFICATION_REPLAY_INPUT_INVALID', 'Replay events must be bounded.');
      const selected = eventIds === null ? events : eventIds.map((id, index) => events.find((event) => event.eventId === typedId(id, `eventIds[${index}]`))).filter(Boolean);
      const projected = [];
      for (const event of selected) projected.push(projectEvent({ event, replay: true }));
      return { ok: true, replayed: projected.length, results: projected, externalSideEffects: 0, externalResends: 0 };
    } catch (error) {
      return operationFailure(error, 'NOTIFICATION_REPLAY_FAILED');
    }
  };

  const snapshot = () => clone({
    schemaVersion: NOTIFICATION_CORE_SCHEMA_VERSION,
    notificationRecordVersion: NOTIFICATION_RECORD_VERSION,
    notifications: state.notifications,
    notificationOrder: state.notificationOrder,
    deliveries: state.deliveries,
    deliveryOrder: state.deliveryOrder,
    projectionQueue: state.projectionQueue.map((row) => row.eventId),
    deadLetters: state.deadLetters,
    flags: NOTIFICATION_FLAGS,
    limits: NOTIFICATION_LIMITS,
    storageBoundary: NOTIFICATION_STORAGE_BOUNDARY,
    backend: backend.snapshot(),
  });

  return Object.freeze({
    evaluateFlag,
    projectEvent,
    enqueueProjection,
    processProjectionQueue,
    queryInbox,
    markRead,
    markUnread,
    markAllRead,
    archive,
    restore,
    createDeliveryAttempt,
    dispatchDeliveries,
    cancelDeliveryAttempt,
    replayProjection,
    snapshot,
  });
}

export const NOTIFICATION_CONTRACT = Object.freeze({
  schemaVersion: NOTIFICATION_CORE_SCHEMA_VERSION,
  recordVersion: NOTIFICATION_RECORD_VERSION,
  deliveryAttemptVersion: NOTIFICATION_DELIVERY_ATTEMPT_VERSION,
  notificationTypes: NOTIFICATION_TYPE_NAMES,
  reservedTypes: NOTIFICATION_RESERVED_TYPES,
  recipientTypes: NOTIFICATION_RECIPIENT_TYPES,
  visibilityClasses: NOTIFICATION_VISIBILITY_CLASSES,
  priorities: NOTIFICATION_PRIORITIES,
  inboxStates: NOTIFICATION_INBOX_STATES,
  channels: NOTIFICATION_CHANNELS,
  deliveryStates: NOTIFICATION_DELIVERY_STATES,
  flags: NOTIFICATION_FLAGS,
  limits: NOTIFICATION_LIMITS,
  storageBoundary: NOTIFICATION_STORAGE_BOUNDARY,
});
