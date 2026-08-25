/*
 * WP-095 Event and Activity Core.
 *
 * This is an unloaded, framework-free reference contract. It records trusted facts after an
 * injected state transaction, keeps an in-memory transactional outbox, and creates bounded
 * human-facing Activity projections. It does not load DOM, Canvas, browser storage, network,
 * Supabase, timers, financial ledgers, SNS, Search, or Notification implementations.
 */

import { AUTHORIZATION_PROOF_POLICY_VERSION, resolveAuthorizationProofSync } from './core-authorization-proof-contracts.js';

export const EVENT_CORE_SCHEMA_VERSION = 1;
export const EVENT_ENVELOPE_VERSION = 1;

export const EVENT_AGGREGATE_TYPES = Object.freeze([
  'ACCOUNT', 'PROJECT', 'ASSET', 'PACKAGE', 'TOOL', 'PRODUCT', 'PURCHASE', 'ENTITLEMENT', 'LICENSE', 'COMMUNITY',
]);
export const EVENT_VISIBILITY_CLASSES = Object.freeze(['PRIVATE', 'PROJECT_MEMBERS', 'CREATOR_PRIVATE', 'UNLISTED', 'PUBLIC']);
export const EVENT_PRODUCER_TYPES = Object.freeze([
  'ACCOUNT_PERMISSION_CORE', 'PROJECT_REGISTRY', 'ASSET_REGISTRY', 'PACKAGE_REGISTRY', 'TOOL_BRIDGE',
  'CORE_SYSTEM', 'LEGACY_ADAPTER',
]);
export const EVENT_DELIVERY_STATUSES = Object.freeze(['PENDING', 'DISPATCHED', 'DEAD_LETTER']);
export const EVENT_FAILURE_CLASSES = Object.freeze(['RETRYABLE', 'NON_RETRYABLE', 'POISON']);

export const EVENT_CATALOG = Object.freeze({
  ACCOUNT_STATE_CHANGED: { eventVersion: 1, aggregateType: 'ACCOUNT', activityType: 'ACCOUNT_STATE_CHANGED', presentationKey: 'activity.account.stateChanged' },
  MEMBERSHIP_CHANGED: { eventVersion: 1, aggregateType: 'ACCOUNT', activityType: 'MEMBERSHIP_CHANGED', presentationKey: 'activity.account.membershipChanged' },
  PERMISSION_CHANGED: { eventVersion: 1, aggregateType: 'ACCOUNT', activityType: 'PERMISSION_CHANGED', presentationKey: 'activity.account.permissionChanged' },
  PROJECT_CREATED: { eventVersion: 1, aggregateType: 'PROJECT', activityType: 'PROJECT_CREATED', presentationKey: 'activity.project.created' },
  PROJECT_METADATA_CHANGED: { eventVersion: 1, aggregateType: 'PROJECT', activityType: 'PROJECT_METADATA_CHANGED', presentationKey: 'activity.project.metadataChanged' },
  PROJECT_VISIBILITY_CHANGED: { eventVersion: 1, aggregateType: 'PROJECT', activityType: 'PROJECT_VISIBILITY_CHANGED', presentationKey: 'activity.project.visibilityChanged' },
  PROJECT_MEMBER_CHANGED: { eventVersion: 1, aggregateType: 'PROJECT', activityType: 'PROJECT_MEMBER_CHANGED', presentationKey: 'activity.project.memberChanged' },
  PROJECT_ARCHIVED: { eventVersion: 1, aggregateType: 'PROJECT', activityType: 'PROJECT_ARCHIVED', presentationKey: 'activity.project.archived' },
  PROJECT_RESTORED: { eventVersion: 1, aggregateType: 'PROJECT', activityType: 'PROJECT_RESTORED', presentationKey: 'activity.project.restored' },
  PROJECT_TRASHED: { eventVersion: 1, aggregateType: 'PROJECT', activityType: 'PROJECT_TRASHED', presentationKey: 'activity.project.trashed' },
  PROJECT_QUARANTINED: { eventVersion: 1, aggregateType: 'PROJECT', activityType: 'PROJECT_QUARANTINED', presentationKey: 'activity.project.quarantined' },
  ASSET_CREATED: { eventVersion: 1, aggregateType: 'ASSET', activityType: 'ASSET_CREATED', presentationKey: 'activity.asset.created' },
  ASSET_REVISION_CREATED: { eventVersion: 1, aggregateType: 'ASSET', activityType: 'ASSET_REVISION_CREATED', presentationKey: 'activity.asset.revisionCreated' },
  ASSET_HEAD_CHANGED: { eventVersion: 1, aggregateType: 'ASSET', activityType: 'ASSET_HEAD_CHANGED', presentationKey: 'activity.asset.headChanged' },
  ASSET_DEPENDENCY_CHANGED: { eventVersion: 1, aggregateType: 'ASSET', activityType: 'ASSET_DEPENDENCY_CHANGED', presentationKey: 'activity.asset.dependencyChanged' },
  ASSET_ARCHIVED: { eventVersion: 1, aggregateType: 'ASSET', activityType: 'ASSET_ARCHIVED', presentationKey: 'activity.asset.archived' },
  ASSET_RESTORED: { eventVersion: 1, aggregateType: 'ASSET', activityType: 'ASSET_RESTORED', presentationKey: 'activity.asset.restored' },
  ASSET_QUARANTINED: { eventVersion: 1, aggregateType: 'ASSET', activityType: 'ASSET_QUARANTINED', presentationKey: 'activity.asset.quarantined' },
  TOOL_AVAILABLE: { eventVersion: 1, aggregateType: 'TOOL', activityType: 'TOOL_AVAILABLE', presentationKey: 'activity.tool.available' },
  TOOL_UNAVAILABLE: { eventVersion: 1, aggregateType: 'TOOL', activityType: 'TOOL_UNAVAILABLE', presentationKey: 'activity.tool.unavailable' },
  TOOL_COMPATIBILITY_CHANGED: { eventVersion: 1, aggregateType: 'TOOL', activityType: 'TOOL_COMPATIBILITY_CHANGED', presentationKey: 'activity.tool.compatibilityChanged' },
  PACKAGE_BUILD_STARTED: { eventVersion: 1, aggregateType: 'PACKAGE', activityType: 'PACKAGE_BUILD_STARTED', presentationKey: 'activity.package.buildStarted' },
  PACKAGE_VERIFIED: { eventVersion: 1, aggregateType: 'PACKAGE', activityType: 'PACKAGE_VERIFIED', presentationKey: 'activity.package.verified' },
  PACKAGE_READY: { eventVersion: 1, aggregateType: 'PACKAGE', activityType: 'PACKAGE_READY', presentationKey: 'activity.package.ready' },
  PACKAGE_FAILED: { eventVersion: 1, aggregateType: 'PACKAGE', activityType: 'PACKAGE_FAILED', presentationKey: 'activity.package.failed' },
  PACKAGE_QUARANTINED: { eventVersion: 1, aggregateType: 'PACKAGE', activityType: 'PACKAGE_QUARANTINED', presentationKey: 'activity.package.quarantined' },
  PACKAGE_ARCHIVED: { eventVersion: 1, aggregateType: 'PACKAGE', activityType: 'PACKAGE_ARCHIVED', presentationKey: 'activity.package.archived' },
});
export const EVENT_TYPES = Object.freeze(Object.keys(EVENT_CATALOG));

export const EVENT_CORE_FLAGS = Object.freeze({
  read: 'event-core-read',
  write: 'event-core-write',
  dispatch: 'event-outbox-dispatch',
  activity: 'activity-projection',
  replay: 'event-replay',
  legacy: 'event-legacy-adapter',
});

export const EVENT_CORE_LIMITS = Object.freeze({
  id: 128,
  version: 64,
  payloadBytes: 32768,
  payloadDepth: 6,
  payloadArrayItems: 128,
  payloadObjectKeys: 64,
  causationDepth: 16,
  causationChain: 16,
  batchSize: 128,
  retryAttempts: 3,
  consumerCount: 256,
  outboxCount: 4096,
});

export const EVENT_STORAGE_BOUNDARY = Object.freeze({
  event: 'canonical-fact-envelope-and-bounded-reference-payload',
  outbox: 'transactional-state-commit-and-pending-event-reference',
  activity: 'human-facing-localized-projection-not-canonical-fact',
  audit: 'security-operational-attempt-record-separate-from-domain-event',
  telemetry: 'bounded-quality-performance-record-separate-from-domain-event',
  excluded: Object.freeze([
    'raw-pixel-buffer', 'audio-bytes', 'pxd-bytes', 'pixipackage-bytes', 'game-build', 'base64', 'data-url',
    'jwt', 'session-token', 'secret', 'password', 'email', 'address', 'payment-card', 'commission-private-message',
    'project-body', 'royalty-ledger', 'unbounded-json', 'high-frequency-editor-operation',
  ]),
});

const ENVELOPE_KEYS = new Set([
  'eventId', 'eventType', 'eventVersion', 'occurredAt', 'producer', 'aggregateType', 'aggregateId',
  'aggregateVersion', 'actorRef', 'correlationId', 'causationId', 'projectId', 'assetId', 'packageId',
  'visibilityClass', 'payload', 'schemaVersion', 'causationDepth', 'causationChain',
]);
const PRODUCER_KEYS = new Set(['producerId', 'producerVersion', 'producerType']);
const ACTOR_KEYS = new Set(['actorId', 'actorType']);
const ACTIVITY_KEYS = new Set([
  'activityId', 'sourceEventId', 'activityType', 'actorReference', 'objectReference', 'projectReference',
  'occurredAt', 'visibility', 'presentationKey', 'metadata',
]);
const FORBIDDEN_PAYLOAD_KEYS = /(^|_)(?:jwt|token|secret|password|email|address|payment|card|commission|royalty|payout|purchase|entitlement|blob|pixel|audio|pxd|packagebody|raw|base64|dataurl|session|authorization|projectcontent|privatecontent)(_|$)/iu;
const PROTOTYPE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const HIGH_FREQUENCY_EVENT_TYPES = new Set(['POINTER_MOVE', 'BRUSH_SAMPLE', 'PIXEL_CHANGED', 'TILE_MUTATED', 'AUDIO_SAMPLE', 'ANIMATION_FRAME_TICK', 'PIXISYNC_OPERATION']);

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

function text(value, field, max = EVENT_CORE_LIMITS.id) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail('EVENT_VALUE_INVALID', `${field} must be a bounded stable string.`, field);
  return value.trim();
}

function typedId(value, field) {
  const result = text(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(result)) fail('EVENT_TYPED_ID_INVALID', `${field} is not a typed ID.`, field);
  return result;
}

function version(value, field = 'version') {
  if (!Number.isSafeInteger(value) || value < 1) fail('EVENT_VERSION_INVALID', `${field} must be a positive safe integer.`, field);
  return value;
}

function textVersion(value, field) {
  const result = text(value, field, EVENT_CORE_LIMITS.version);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/u.test(result)) fail('EVENT_VERSION_INVALID', `${field} is not a valid version.`, field);
  return result;
}

function enumValue(value, field, values) {
  if (!values.includes(value)) fail('EVENT_ENUM_UNSUPPORTED', `${field} is unsupported: ${String(value)}.`, field);
  return value;
}

function assertKeys(value, keys, field) {
  if (!isObject(value)) fail('EVENT_OBJECT_INVALID', `${field} must be an object.`, field);
  for (const key of Object.keys(value)) {
    if (PROTOTYPE_KEYS.has(key)) fail('EVENT_PROTOTYPE_POLLUTION', `${field}.${key} is forbidden.`, `${field}.${key}`);
    if (!keys.has(key)) fail('EVENT_UNKNOWN_FIELD', `${field}.${key} is not part of the Event contract.`, `${field}.${key}`);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') fail('EVENT_PAYLOAD_TYPE_INVALID', 'Event payload contains a non-serializable value.');
  return JSON.stringify(value);
}

function payload(value, field = 'payload', depth = 0) {
  if (depth > EVENT_CORE_LIMITS.payloadDepth) fail('EVENT_PAYLOAD_TOO_DEEP', `${field} exceeds the payload depth limit.`, field);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) fail('EVENT_PAYLOAD_TYPE_INVALID', `${field} contains a non-finite number.`, field);
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 2048 || /^data:/iu.test(value) || /^https?:\/\//iu.test(value) || /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/u.test(value) || /[^\s@]+@[^\s@]+\.[^\s@]+/u.test(value)) fail('EVENT_PRIVATE_PAYLOAD_FORBIDDEN', `${field} contains a URL, token-like value, or PII.`, field);
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > EVENT_CORE_LIMITS.payloadArrayItems) fail('EVENT_PAYLOAD_TOO_LARGE', `${field} contains too many items.`, field);
    return value.map((item, index) => payload(item, `${field}[${index}]`, depth + 1));
  }
  if (!isObject(value)) fail('EVENT_PAYLOAD_TYPE_INVALID', `${field} contains an unsupported value.`, field);
  if (Object.keys(value).length > EVENT_CORE_LIMITS.payloadObjectKeys) fail('EVENT_PAYLOAD_TOO_LARGE', `${field} contains too many keys.`, field);
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (PROTOTYPE_KEYS.has(key) || FORBIDDEN_PAYLOAD_KEYS.test(key)) fail('EVENT_PRIVATE_PAYLOAD_FORBIDDEN', `${field}.${key} is outside the Event boundary.`, `${field}.${key}`);
    result[text(key, `${field}.key`, 96)] = payload(item, `${field}.${key}`, depth + 1);
  }
  if (stableJson(result).length > EVENT_CORE_LIMITS.payloadBytes) fail('EVENT_PAYLOAD_TOO_LARGE', `${field} exceeds the payload byte limit.`, field);
  return result;
}

function timestamp(value, field = 'occurredAt') {
  const result = text(value, field, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result) || !Number.isFinite(Date.parse(result))) fail('EVENT_TIMESTAMP_INVALID', `${field} must be an ISO-8601 UTC timestamp.`, field);
  return result;
}

function normalizeActor(value, field = 'actorRef') {
  if (value === null || value === undefined) return null;
  assertKeys(value, ACTOR_KEYS, field);
  return { actorId: typedId(value.actorId, `${field}.actorId`), actorType: text(value.actorType || 'USER', `${field}.actorType`, 32) };
}

function normalizeProducer(value, field = 'producer') {
  assertKeys(value, PRODUCER_KEYS, field);
  return {
    producerId: typedId(value.producerId, `${field}.producerId`),
    producerVersion: textVersion(value.producerVersion, `${field}.producerVersion`),
    producerType: enumValue(value.producerType, `${field}.producerType`, EVENT_PRODUCER_TYPES),
  };
}

function normalizeEnvelope(input) {
  assertKeys(input, ENVELOPE_KEYS, 'event');
  if (HIGH_FREQUENCY_EVENT_TYPES.has(input.eventType)) fail('EVENT_HIGH_FREQUENCY_FORBIDDEN', 'High-frequency editor operations cannot enter the Platform Event Core.', 'event.eventType');
  const eventType = enumValue(input.eventType, 'event.eventType', EVENT_TYPES);
  const catalog = EVENT_CATALOG[eventType];
  const result = {
    eventId: typedId(input.eventId, 'event.eventId'),
    eventType,
    eventVersion: version(input.eventVersion, 'event.eventVersion'),
    occurredAt: timestamp(input.occurredAt),
    producer: normalizeProducer(input.producer),
    aggregateType: enumValue(input.aggregateType, 'event.aggregateType', EVENT_AGGREGATE_TYPES),
    aggregateId: typedId(input.aggregateId, 'event.aggregateId'),
    aggregateVersion: version(input.aggregateVersion, 'event.aggregateVersion'),
    actorRef: normalizeActor(input.actorRef),
    correlationId: input.correlationId === null || input.correlationId === undefined ? null : typedId(input.correlationId, 'event.correlationId'),
    causationId: input.causationId === null || input.causationId === undefined ? null : typedId(input.causationId, 'event.causationId'),
    projectId: input.projectId === null || input.projectId === undefined ? null : typedId(input.projectId, 'event.projectId'),
    assetId: input.assetId === null || input.assetId === undefined ? null : typedId(input.assetId, 'event.assetId'),
    packageId: input.packageId === null || input.packageId === undefined ? null : typedId(input.packageId, 'event.packageId'),
    visibilityClass: enumValue(input.visibilityClass, 'event.visibilityClass', EVENT_VISIBILITY_CLASSES),
    payload: payload(input.payload || {}, 'event.payload'),
    schemaVersion: input.schemaVersion === undefined ? EVENT_CORE_SCHEMA_VERSION : input.schemaVersion,
    causationDepth: input.causationDepth === undefined ? 0 : input.causationDepth,
    causationChain: input.causationChain === undefined ? [] : input.causationChain,
  };
  if (result.schemaVersion !== EVENT_CORE_SCHEMA_VERSION) fail('EVENT_SCHEMA_UNSUPPORTED', 'Event schema version is unsupported.', 'event.schemaVersion');
  if (result.eventVersion !== catalog.eventVersion) fail('EVENT_VERSION_UNSUPPORTED', 'Event version is not registered for this Event Type.', 'event.eventVersion');
  if (!Number.isSafeInteger(result.causationDepth) || result.causationDepth < 0 || result.causationDepth > EVENT_CORE_LIMITS.causationDepth) fail('EVENT_CAUSATION_DEPTH_INVALID', 'Causation depth is outside the safety limit.', 'event.causationDepth');
  if (!Array.isArray(result.causationChain) || result.causationChain.length > EVENT_CORE_LIMITS.causationChain) fail('EVENT_CAUSATION_CHAIN_INVALID', 'Causation chain is outside the safety limit.', 'event.causationChain');
  result.causationChain = result.causationChain.map((item, index) => typedId(item, `event.causationChain[${index}]`));
  if (new Set(result.causationChain).size !== result.causationChain.length) fail('EVENT_CAUSATION_CYCLE', 'Causation chain contains a duplicate Event ID.', 'event.causationChain');
  if (result.aggregateType !== catalog.aggregateType) fail('EVENT_AGGREGATE_INVALID', 'Event Type does not match its registered Aggregate Type.', 'event.aggregateType');
  return result;
}

function diagnostic(code, message, field = null, metadata = {}) {
  return { code, severity: 'error', message, field, metadata: clone(metadata) };
}

export function validateEventEnvelope(event) {
  try {
    return { valid: true, value: clone(normalizeEnvelope(event)), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [diagnostic(error.code || 'EVENT_INVALID', error.message, error.field || null)] };
  }
}

function normalizeActivity(value) {
  assertKeys(value, ACTIVITY_KEYS, 'activity');
  const objectReference = isObject(value.objectReference) ? payload(value.objectReference, 'activity.objectReference') : fail('ACTIVITY_OBJECT_INVALID', 'Activity objectReference is required.', 'activity.objectReference');
  return {
    activityId: typedId(value.activityId, 'activity.activityId'),
    sourceEventId: typedId(value.sourceEventId, 'activity.sourceEventId'),
    activityType: text(value.activityType, 'activity.activityType', 96),
    actorReference: value.actorReference === null ? null : normalizeActor(value.actorReference, 'activity.actorReference'),
    objectReference,
    projectReference: value.projectReference === null ? null : typedId(value.projectReference, 'activity.projectReference'),
    occurredAt: timestamp(value.occurredAt, 'activity.occurredAt'),
    visibility: enumValue(value.visibility, 'activity.visibility', EVENT_VISIBILITY_CLASSES),
    presentationKey: text(value.presentationKey, 'activity.presentationKey', 160),
    metadata: payload(value.metadata || {}, 'activity.metadata'),
  };
}

export function validateActivityProjection(activity) {
  try {
    return { valid: true, value: clone(normalizeActivity(activity)), diagnostics: [] };
  } catch (error) {
    return { valid: false, value: null, diagnostics: [diagnostic(error.code || 'ACTIVITY_INVALID', error.message, error.field || null)] };
  }
}

function serverAllow(value, expected, authorizationEvaluator) {
  if (typeof authorizationEvaluator !== 'function') fail('EVENT_AUTHZ_EVALUATOR_MISSING', 'Event operation requires a server-owned Authorization evaluator.');
  const proof = resolveAuthorizationProofSync({
    expected: {
      ...expected,
      principalId: expected.principalId ?? value?.principalId ?? null,
      tenantId: expected.tenantId ?? value?.tenantId ?? null,
      correlationId: expected.correlationId ?? value?.correlationId ?? null,
      policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    },
    callerProof: value,
    authorizationEvaluator: (input) => authorizationEvaluator({ ...input, source: 'server' }),
  });
  if (proof.decision !== 'allow') fail('EVENT_PERMISSION_DENIED', 'Event AuthorizationProof did not grant the requested operation.');
  return proof;
}

function visibilityRank(value) {
  return { PRIVATE: 0, CREATOR_PRIVATE: 1, PROJECT_MEMBERS: 2, UNLISTED: 3, PUBLIC: 4 }[value];
}

export function createEventActivityCore({
  clock = null,
  idGenerator = null,
  featureFlagEvaluator = null,
  trustedProducers = [],
  authorizationEvaluator = null,
  transactionAdapter = null,
  publisher = null,
  backoffAdapter = null,
  visibilityEvaluator = null,
} = {}) {
  const state = {
    producers: Object.create(null),
    events: Object.create(null),
    eventOrder: [],
    aggregates: Object.create(null),
    outbox: [],
    deadLetters: [],
    consumers: Object.create(null),
    deliveryLedger: Object.create(null),
    activities: Object.create(null),
    audit: [],
    telemetry: [],
  };

  const now = () => {
    if (typeof clock !== 'function') fail('EVENT_CLOCK_ADAPTER_MISSING', 'A host clock adapter is required.');
    return timestamp(clock(), 'createdAt');
  };
  const nextId = kind => {
    if (typeof idGenerator !== 'function') fail('EVENT_ID_ADAPTER_MISSING', 'A host ID adapter is required.');
    return typedId(idGenerator(kind), `${kind}Id`);
  };
  const flag = (flagId, action) => {
    if (typeof featureFlagEvaluator !== 'function') fail('EVENT_FLAG_EVALUATOR_MISSING', 'Event Feature Flag evaluation must be injected.');
    const result = featureFlagEvaluator({ flagId, action });
    if (!result || result.enabled !== true || result.decision !== 'enabled') fail(result?.code === 'FEATURE_FLAG_KILL_SWITCH' ? 'EVENT_KILL_SWITCH' : 'EVENT_FLAG_OFF', 'Event Feature Flag denied this operation.', null, { flagId, action, decision: result?.decision || 'unknown' });
    return clone(result);
  };
  const registerInitialProducers = () => {
    for (const entry of trustedProducers) {
      if (!isObject(entry) || !isObject(entry.producer)) fail('EVENT_PRODUCER_PROOF_REQUIRED', 'Initial producer registration requires a producer and AuthorizationProof.');
      const producer = entry.producer;
      const normalized = normalizeProducer(producer);
      if (state.producers[normalized.producerId]) fail('EVENT_PRODUCER_DUPLICATE', 'Trusted Producer is duplicated.', 'producer.producerId');
      const authorizationProof = serverAllow(entry.authorizationProof, {
        resourceType: 'EVENT_PRODUCER',
        resourceId: normalized.producerId,
        action: 'event.producer.register',
        capability: 'event.producer.register',
      }, authorizationEvaluator);
      state.producers[normalized.producerId] = { ...normalized, trusted: true, authorizationProof: clone(authorizationProof) };
    }
  };
  registerInitialProducers();

  const assertTrustedProducer = producer => {
    const registered = state.producers[producer.producerId];
    if (!registered || registered.trusted !== true || registered.producerVersion !== producer.producerVersion || registered.producerType !== producer.producerType) fail('EVENT_PRODUCER_UNAUTHORIZED', 'Producer is not a trusted registered Core Producer.', 'event.producer');
  };
  const prepare = input => {
    const event = normalizeEnvelope(input);
    assertTrustedProducer(event.producer);
    return event;
  };
  const resolveCausation = event => {
    if (!event.causationId) {
      if (event.causationDepth !== 0 || event.causationChain.length) fail('EVENT_CAUSATION_INVALID', 'Root Event cannot carry a causation chain.');
      return { ...event, causationDepth: 0, causationChain: [] };
    }
    const cause = state.events[event.causationId];
    if (!cause) fail('EVENT_CAUSATION_UNKNOWN', 'Causation Event is not present in the canonical Event Log.', 'event.causationId');
    const chain = [cause.eventId, ...cause.causationChain];
    if (chain.includes(event.eventId)) fail('EVENT_CAUSATION_CYCLE', 'Causation chain contains the new Event ID.', 'event.causationId');
    const depth = cause.causationDepth + 1;
    if (depth > EVENT_CORE_LIMITS.causationDepth) fail('EVENT_CAUSATION_DEPTH_EXCEEDED', 'Causation depth exceeds the safety limit.', 'event.causationId');
    return { ...event, causationDepth: depth, causationChain: chain.slice(0, EVENT_CORE_LIMITS.causationChain) };
  };
  const aggregateKey = event => `${event.aggregateType}:${event.aggregateId}`;
  const boundedStateChange = value => payload(value || {}, 'stateChange');

  const commitFact = ({ event: inputEvent, stateChange = {}, permissionDecision } = {}) => {
    try {
      flag(EVENT_CORE_FLAGS.write, 'write');
      const event = resolveCausation(prepare(inputEvent));
      serverAllow(permissionDecision, {
        resourceType: 'EVENT',
        resourceId: event.eventId,
        action: 'event.commit',
        capability: 'event.write',
        principalId: event.actorRef?.actorId ?? null,
        correlationId: event.correlationId,
      }, authorizationEvaluator);
      if (state.events[event.eventId]) fail('EVENT_DUPLICATE', 'Event ID has already been committed.', 'event.eventId');
      const key = aggregateKey(event);
      const previousVersion = state.aggregates[key] || 0;
      if (event.aggregateVersion <= previousVersion) fail('EVENT_STALE_AGGREGATE_VERSION', 'Aggregate Version is stale.', 'event.aggregateVersion');
      if (event.aggregateVersion > previousVersion + 1) fail('EVENT_AGGREGATE_VERSION_GAP', 'Aggregate Version has a gap at commit time.', 'event.aggregateVersion');
      const outboxRow = {
        outboxId: nextId('outbox'),
        eventId: event.eventId,
        status: 'PENDING',
        attempts: 0,
        createdAt: now(),
        nextAttemptAt: null,
        lastError: null,
      };
      const safeStateChange = boundedStateChange(stateChange);
      if (typeof transactionAdapter === 'function') {
        const transaction = transactionAdapter({ stateChange: clone(safeStateChange), outboxRow: clone(outboxRow), event: clone(event), source: 'server' });
        if (!transaction || transaction.ok !== true || transaction.committed !== true) fail(transaction?.code || 'EVENT_STATE_COMMIT_FAILED', 'State and Outbox transaction did not commit atomically.');
      }
      state.events[event.eventId] = event;
      state.eventOrder.push(event.eventId);
      state.aggregates[key] = event.aggregateVersion;
      state.outbox.push({ ...outboxRow, event: clone(event) });
      return { ok: true, event: clone(event), outbox: clone(outboxRow), committed: true };
    } catch (error) {
      return { ok: false, committed: false, diagnostics: [diagnostic(error.code || 'EVENT_COMMIT_FAILED', error.message, error.field || null, error.metadata || {})] };
    }
  };

  const registerProducer = ({ producer, permissionDecision } = {}) => {
    try {
      flag(EVENT_CORE_FLAGS.write, 'write');
      const normalized = normalizeProducer(producer);
      const authorizationProof = serverAllow(permissionDecision, {
        resourceType: 'EVENT_PRODUCER',
        resourceId: normalized.producerId,
        action: 'event.producer.register',
        capability: 'event.producer.register',
      }, authorizationEvaluator);
      if (state.producers[normalized.producerId]) fail('EVENT_PRODUCER_DUPLICATE', 'Producer is already registered.', 'producer.producerId');
      state.producers[normalized.producerId] = { ...normalized, trusted: true, authorizationProof: clone(authorizationProof) };
      return { ok: true, producer: clone(state.producers[normalized.producerId]) };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'EVENT_PRODUCER_REGISTRATION_FAILED', error.message, error.field || null)] };
    }
  };

  const registerConsumer = ({ consumerId, handler, permissionDecision } = {}) => {
    try {
      flag(EVENT_CORE_FLAGS.write, 'write');
      const id = typedId(consumerId, 'consumerId');
      serverAllow(permissionDecision, {
        resourceType: 'EVENT_CONSUMER',
        resourceId: id,
        action: 'event.consumer.register',
        capability: 'event.consumer.register',
      }, authorizationEvaluator);
      if (typeof handler !== 'function') fail('EVENT_CONSUMER_HANDLER_INVALID', 'Consumer handler must be injected.', 'consumer.handler');
      if (Object.keys(state.consumers).length >= EVENT_CORE_LIMITS.consumerCount) fail('EVENT_CONSUMER_LIMIT', 'Consumer limit exceeded.');
      if (state.consumers[id]) fail('EVENT_CONSUMER_DUPLICATE', 'Consumer is already registered.', 'consumerId');
      state.consumers[id] = { consumerId: id, handler, aggregateVersions: Object.create(null), processed: Object.create(null), attempts: Object.create(null) };
      state.deliveryLedger[id] = [];
      return { ok: true, consumerId: id };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'EVENT_CONSUMER_REGISTRATION_FAILED', error.message, error.field || null)] };
    }
  };

  const consume = ({ consumerId, event, replay = false } = {}) => {
    try {
      flag(EVENT_CORE_FLAGS.read, 'read');
      const consumer = state.consumers[typedId(consumerId, 'consumerId')];
      if (!consumer) fail('EVENT_CONSUMER_UNKNOWN', 'Consumer is not registered.', 'consumerId');
      const normalized = prepare(event);
      const key = aggregateKey(normalized);
      if (consumer.processed[normalized.eventId]) return { ok: true, idempotentReplay: true, processed: false, eventId: normalized.eventId };
      const last = consumer.aggregateVersions[key] || 0;
      if (normalized.aggregateVersion <= last) return { ok: false, processed: false, diagnostics: [diagnostic('EVENT_STALE_AGGREGATE_VERSION', 'Consumer ignored an older Aggregate Version.', 'event.aggregateVersion')] };
      if (normalized.aggregateVersion > last + 1) return { ok: false, gap: true, processed: false, diagnostics: [diagnostic('EVENT_VERSION_GAP', 'Consumer detected a missing Aggregate Version.', 'event.aggregateVersion', { expected: last + 1, received: normalized.aggregateVersion })] };
      const attemptKey = normalized.eventId;
      consumer.attempts[attemptKey] = (consumer.attempts[attemptKey] || 0) + 1;
      const result = consumer.handler({ event: clone(normalized), replay, sideEffectAllowed: replay !== true, source: 'event-core' });
      if (!result || result.ok !== true) {
        const retryable = result?.retryable === true;
        if (retryable && consumer.attempts[attemptKey] < EVENT_CORE_LIMITS.retryAttempts) return { ok: false, retryable: true, processed: false, diagnostics: [diagnostic('EVENT_CONSUMER_RETRYABLE', 'Consumer requested a bounded retry.')] };
        return { ok: false, deadLetter: true, processed: false, diagnostics: [diagnostic('EVENT_CONSUMER_POISON', 'Consumer rejected the Event as non-retryable or exhausted retries.')] };
      }
      consumer.processed[normalized.eventId] = true;
      consumer.aggregateVersions[key] = normalized.aggregateVersion;
      state.deliveryLedger[consumer.consumerId].push({ eventId: normalized.eventId, replay, processedAt: now() });
      return { ok: true, processed: true, idempotentReplay: false, eventId: normalized.eventId };
    } catch (error) {
      return { ok: false, processed: false, diagnostics: [diagnostic(error.code || 'EVENT_CONSUME_FAILED', error.message, error.field || null)] };
    }
  };

  const dispatchOutbox = ({ batchSize = EVENT_CORE_LIMITS.batchSize } = {}) => {
    try {
      flag(EVENT_CORE_FLAGS.dispatch, 'dispatch');
      if (typeof publisher !== 'function') fail('EVENT_PUBLISHER_ADAPTER_MISSING', 'Outbox Publisher adapter must be injected.');
      const limit = Math.min(version(batchSize, 'batchSize'), EVENT_CORE_LIMITS.batchSize);
      const rows = state.outbox.filter(row => row.status === 'PENDING').slice(0, limit);
      let dispatched = 0;
      let retried = 0;
      let deadLettered = 0;
      for (const row of rows) {
        row.attempts += 1;
        let result;
        try {
          result = publisher({ event: clone(row.event), outboxId: row.outboxId, attempt: row.attempts, source: 'server' });
        } catch (error) {
          result = { ok: false, retryable: false, code: error.code || 'EVENT_PUBLISH_FAILED', message: error.message };
        }
        if (result?.ok === true) {
          row.status = 'DISPATCHED';
          row.lastError = null;
          dispatched += 1;
          continue;
        }
        const errorCode = result?.code || 'EVENT_PUBLISH_FAILED';
        row.lastError = { code: errorCode, message: 'Outbox delivery failed.' };
        if (result?.retryable === true && row.attempts < EVENT_CORE_LIMITS.retryAttempts) {
          row.nextAttemptAt = typeof backoffAdapter === 'function' ? backoffAdapter({ attempt: row.attempts, outboxId: row.outboxId }) : null;
          retried += 1;
        } else {
          row.status = 'DEAD_LETTER';
          state.deadLetters.push({ deadLetterId: nextId('dead-letter'), outboxId: row.outboxId, eventId: row.eventId, attempts: row.attempts, failureClass: result?.retryable === true ? 'POISON' : 'NON_RETRYABLE', code: errorCode, createdAt: now() });
          deadLettered += 1;
        }
      }
      return { ok: true, dispatched, retried, deadLettered, pending: state.outbox.filter(row => row.status === 'PENDING').length };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'EVENT_DISPATCH_FAILED', error.message, error.field || null)] };
    }
  };

  const createActivity = ({ eventId, requestedVisibility = null } = {}) => {
    try {
      flag(EVENT_CORE_FLAGS.activity, 'write');
      const id = typedId(eventId, 'eventId');
      const event = state.events[id];
      if (!event) fail('EVENT_UNKNOWN_ID', 'Activity source Event was not found.', 'eventId');
      const visibility = requestedVisibility || event.visibilityClass;
      enumValue(visibility, 'requestedVisibility', EVENT_VISIBILITY_CLASSES);
      if (visibilityRank(visibility) > visibilityRank(event.visibilityClass)) fail('EVENT_PRIVATE_ACTIVITY_FORBIDDEN', 'Activity cannot broaden Event visibility.', 'requestedVisibility');
      if (typeof visibilityEvaluator === 'function') {
        const decision = visibilityEvaluator({ event: clone(event), requestedVisibility: visibility, source: 'server' });
        if (!decision || decision.ok !== true || decision.decision !== 'allow' || decision.source !== 'server') fail('EVENT_ACTIVITY_PERMISSION_DENIED', 'Activity visibility was denied by the server evaluator.');
      }
      const key = `${id}:${visibility}`;
      if (state.activities[key]) return { ok: true, activity: clone(state.activities[key]), idempotentReplay: true };
      const catalog = EVENT_CATALOG[event.eventType];
      const activity = {
        activityId: nextId('activity'),
        sourceEventId: event.eventId,
        activityType: catalog.activityType,
        actorReference: clone(event.actorRef),
        objectReference: { aggregateType: event.aggregateType, aggregateId: event.aggregateId, projectId: event.projectId, assetId: event.assetId, packageId: event.packageId },
        projectReference: event.projectId,
        occurredAt: event.occurredAt,
        visibility,
        presentationKey: catalog.presentationKey,
        metadata: payload({ reasonCode: event.payload.reasonCode || null }, 'activity.metadata'),
      };
      const valid = validateActivityProjection(activity);
      if (!valid.valid) fail('ACTIVITY_INVALID', 'Generated Activity failed validation.', null, { diagnostics: valid.diagnostics });
      state.activities[key] = activity;
      return { ok: true, activity: clone(activity), idempotentReplay: false };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'ACTIVITY_PROJECTION_FAILED', error.message, error.field || null)] };
    }
  };

  const replayProjection = ({ consumerId, eventIds = null } = {}) => {
    try {
      flag(EVENT_CORE_FLAGS.replay, 'replay');
      const consumer = state.consumers[typedId(consumerId, 'consumerId')];
      if (!consumer) fail('EVENT_CONSUMER_UNKNOWN', 'Consumer is not registered.', 'consumerId');
      const ids = eventIds === null ? state.eventOrder : eventIds.map((id, index) => typedId(id, `eventIds[${index}]`));
      const replayed = [];
      for (const id of ids) {
        const event = state.events[id];
        if (!event) fail('EVENT_UNKNOWN_ID', 'Replay Event was not found.', 'eventIds');
        const result = consumer.handler({ event: clone(event), replay: true, sideEffectAllowed: false, source: 'event-replay' });
        if (!result || result.ok !== true) fail('EVENT_REPLAY_FAILED', 'Projection replay failed without applying external side effects.', 'eventIds');
        replayed.push(id);
      }
      return { ok: true, replayed, externalSideEffects: 0 };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'EVENT_REPLAY_FAILED', error.message, error.field || null)] };
    }
  };

  const recordAudit = ({ auditId, action, actorRef = null, eventId = null, result, metadata = {} } = {}) => {
    try {
      const record = { auditId: typedId(auditId || nextId('audit'), 'auditId'), action: text(action, 'audit.action', 96), actorRef: normalizeActor(actorRef, 'audit.actorRef'), eventId: eventId === null ? null : typedId(eventId, 'audit.eventId'), result: text(result, 'audit.result', 32), metadata: payload(metadata, 'audit.metadata'), recordedAt: now() };
      state.audit.push(record);
      return { ok: true, audit: clone(record) };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'EVENT_AUDIT_FAILED', error.message, error.field || null)] };
    }
  };

  const recordTelemetry = ({ telemetryId, metric, value, metadata = {} } = {}) => {
    try {
      if (typeof value !== 'number' || !Number.isFinite(value)) fail('EVENT_TELEMETRY_INVALID', 'Telemetry value must be finite.');
      const record = { telemetryId: typedId(telemetryId || nextId('telemetry'), 'telemetryId'), metric: text(metric, 'telemetry.metric', 96), value, metadata: payload(metadata, 'telemetry.metadata'), recordedAt: now() };
      state.telemetry.push(record);
      return { ok: true, telemetry: clone(record) };
    } catch (error) {
      return { ok: false, diagnostics: [diagnostic(error.code || 'EVENT_TELEMETRY_FAILED', error.message, error.field || null)] };
    }
  };

  const snapshot = () => clone({
    schemaVersion: EVENT_CORE_SCHEMA_VERSION,
    catalog: EVENT_CATALOG,
    producers: state.producers,
    events: state.events,
    eventOrder: state.eventOrder,
    aggregates: state.aggregates,
    outbox: state.outbox,
    deadLetters: state.deadLetters,
    deliveryLedger: state.deliveryLedger,
    activities: state.activities,
    audit: state.audit,
    telemetry: state.telemetry,
    flags: EVENT_CORE_FLAGS,
    limits: EVENT_CORE_LIMITS,
    storageBoundary: EVENT_STORAGE_BOUNDARY,
  });

  return Object.freeze({
    commitFact,
    registerProducer,
    registerConsumer,
    consume,
    dispatchOutbox,
    createActivity,
    replayProjection,
    recordAudit,
    recordTelemetry,
    snapshot,
  });
}

export const EVENT_ACTIVITY_CONTRACT = Object.freeze({
  schemaVersion: EVENT_CORE_SCHEMA_VERSION,
  envelopeVersion: EVENT_ENVELOPE_VERSION,
  eventTypes: EVENT_TYPES,
  catalog: EVENT_CATALOG,
  aggregateTypes: EVENT_AGGREGATE_TYPES,
  visibilityClasses: EVENT_VISIBILITY_CLASSES,
  producerTypes: EVENT_PRODUCER_TYPES,
  flags: EVENT_CORE_FLAGS,
  limits: EVENT_CORE_LIMITS,
  storageBoundary: EVENT_STORAGE_BOUNDARY,
});
