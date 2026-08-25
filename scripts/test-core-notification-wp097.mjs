import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  NOTIFICATION_FLAGS,
  NOTIFICATION_INBOX_STATES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_RESERVED_TYPES,
  NOTIFICATION_TYPE_NAMES,
  createNotificationCore,
  normalizeNotificationPreferences,
  normalizeNotificationRecord,
  validateNotificationDeliveryAttempt,
  validateNotificationPreferences,
  validateNotificationRecord,
} from '../core-shell/assets/core-notification-contracts.js';

const fixture = JSON.parse(readFileSync(new URL('../core-shell/fixtures/notification-v1.valid.json', import.meta.url), 'utf8'));
const timestamps = Array.from({ length: 200 }, (_, index) => `2026-08-07T00:00:${String(Math.min(59, Math.floor(index / 4))).padStart(2, '0')}.${String((index % 4) * 250).padStart(3, '0')}Z`);
let timeIndex = 0;
const clock = () => timestamps[Math.min(timeIndex++, timestamps.length - 1)];
let idIndex = 0;
const idGenerator = (kind) => `${kind}-synthetic-${++idIndex}`;

const enabledFlags = new Set(Object.values(NOTIFICATION_FLAGS));
const flags = ({ flagId }) => enabledFlags.has(flagId)
  ? { enabled: true, decision: 'enabled', source: 'server', flagId }
  : { enabled: false, decision: 'unknown', source: 'server', code: 'FEATURE_FLAG_UNKNOWN', flagId };
const allow = (recipientId = null) => ({ ok: true, decision: 'allow', source: 'server', ...(recipientId ? { recipientType: 'USER', recipientId } : {}) });

const eventRecipients = Object.create(null);
const resolver = ({ event }) => eventRecipients[event.eventId] || [{ recipientType: 'USER', recipientId: 'user-invitee-001', visibilityClass: 'RECIPIENT_ONLY', permissionDecision: allow('user-invitee-001') }];
const preference = ({ event, notificationType }) => {
  const base = {
    category: notificationType.startsWith('ACCOUNT') || notificationType.startsWith('SECURITY') ? 'ACCOUNT_SECURITY' : notificationType.startsWith('PROJECT') ? 'PROJECT' : notificationType.startsWith('ASSET') ? 'ASSET' : notificationType.startsWith('PACKAGE') ? 'PACKAGE' : 'TOOL',
    inAppEnabled: true, pushEnabled: false, emailEnabled: false, digestEnabled: false,
    mutedProjectIds: [], mutedResourceIds: [], mutedActorIds: [], quietHours: null, locale: 'ja-JP', timezone: 'Asia/Tokyo',
  };
  if (event.eventId === 'event-muted-asset') return { preference: { ...base, inAppEnabled: false, mutedProjectIds: ['project-muted'] }, suppressed: true, suppressionReason: 'USER_MUTED_PROJECT' };
  if (event.eventId === 'event-security-required') return { preference: { ...base, inAppEnabled: false, pushEnabled: false, emailEnabled: false }, suppressed: true, suppressionReason: 'USER_MUTED_SECURITY' };
  if (event.eventId === 'event-private-invite') return { preference: { ...base, pushEnabled: true }, quietHoursActive: false };
  if (event.eventId === 'event-quiet-invite') return { preference: { ...base, pushEnabled: true, quietHours: { enabled: true, startMinute: 0, endMinute: 60, timezone: 'UTC' } }, quietHoursActive: true };
  return { preference: base };
};
const rateLimit = ({ event, notificationType }) => {
  if (event.eventId === 'event-storm-suppressed') return { allowed: false, action: 'SUPPRESS', scope: 'recipient/type/resource' };
  if (event.eventId === 'event-security-required') return { allowed: false, action: 'DELAY', scope: 'recipient/type/resource' };
  if (notificationType === 'PACKAGE_READY') return { allowed: true };
  return { allowed: true };
};

const producerByAggregate = {
  ACCOUNT: { producerId: 'account-permission-v1', producerVersion: '1.0.0', producerType: 'ACCOUNT_PERMISSION_CORE' },
  PROJECT: { producerId: 'project-registry-v1', producerVersion: '1.0.0', producerType: 'PROJECT_REGISTRY' },
  ASSET: { producerId: 'asset-registry-v1', producerVersion: '1.0.0', producerType: 'ASSET_REGISTRY' },
  PACKAGE: { producerId: 'package-registry-v1', producerVersion: '1.0.0', producerType: 'PACKAGE_REGISTRY' },
  TOOL: { producerId: 'tool-bridge-v1', producerVersion: '1.0.0', producerType: 'TOOL_BRIDGE' },
};
const makeEvent = ({ eventId, eventType, aggregateType = 'PROJECT', aggregateId = 'project-draw2-001', projectId = 'project-draw2-001', visibilityClass = 'PROJECT_MEMBERS', payload = {}, actorId = 'user-owner-001' }) => ({
  eventId, eventType, eventVersion: 1, occurredAt: timestamps[Math.min(timeIndex, timestamps.length - 1)], producer: producerByAggregate[aggregateType], aggregateType, aggregateId, aggregateVersion: 1,
  actorRef: { actorId, actorType: 'USER' }, correlationId: `correlation-${eventId}`, causationId: null, projectId,
  assetId: aggregateType === 'ASSET' ? aggregateId : null, packageId: aggregateType === 'PACKAGE' ? aggregateId : null,
  visibilityClass, payload, schemaVersion: 1, causationDepth: 0, causationChain: [],
});
const addRecipient = (eventId, recipientId = 'user-invitee-001', visibilityClass = 'RECIPIENT_ONLY') => {
  eventRecipients[eventId] = [{ recipientType: 'USER', recipientId, visibilityClass, permissionDecision: allow(recipientId) }];
};

const deliveryCalls = { inApp: 0, push: 0 };
let failingNotificationId = null;
const deliveryAdapters = {
  IN_APP: ({ notification }) => {
    deliveryCalls.inApp += 1;
    if (notification.notificationId === failingNotificationId) return { ok: false, retryable: true, code: 'SYNTHETIC_TEMPORARY' };
    return { ok: true, delivered: true, providerReference: 'synthetic-in-app' };
  },
  WEB_PUSH: ({ notification }) => {
    deliveryCalls.push += 1;
    assert.equal('projectLabel' in notification.presentationMetadata, false, 'Private project name leaked to external delivery.');
    return { ok: true, delivered: true, providerReference: 'synthetic-web-push' };
  },
};

const core = createNotificationCore({
  clock, idGenerator, featureFlagEvaluator: flags, eventTrustEvaluator: () => allow(), recipientResolver: resolver,
  preferenceEvaluator: preference, rateLimitEvaluator: rateLimit, deliveryAdapters,
});

const failureFixtureNames = [];
const expectFailure = (name, result, code = null) => {
  assert.equal(result.ok, false, `${name} unexpectedly passed: ${JSON.stringify(result)}`);
  if (code) assert.equal(result.diagnostics[0].code, code, `${name}: ${JSON.stringify(result.diagnostics)}`);
  failureFixtureNames.push(name);
};
const expectInvalid = (name, result, code = null) => {
  assert.equal(result.valid, false, `${name} unexpectedly passed: ${JSON.stringify(result)}`);
  if (code) assert.equal(result.diagnostics[0].code, code, `${name}: ${JSON.stringify(result.diagnostics)}`);
  failureFixtureNames.push(name);
};

assert.equal(validateNotificationRecord(fixture.notification).valid, true);
assert.equal(validateNotificationPreferences(fixture.preferences).valid, true);
assert.equal(validateNotificationDeliveryAttempt(fixture.deliveryAttempt).valid, true);
assert.equal(normalizeNotificationPreferences(fixture.preferences).locale, 'ja-JP');
assert.deepEqual(NOTIFICATION_INBOX_STATES, ['UNREAD', 'READ', 'ARCHIVED']);
assert.equal(NOTIFICATION_PRIORITIES.length, 4);
assert.equal(NOTIFICATION_TYPE_NAMES.length, 14);
assert.equal(NOTIFICATION_RESERVED_TYPES.length, 11);

const invite = makeEvent({ eventId: 'event-project-invite-001', eventType: 'PROJECT_MEMBER_CHANGED', payload: { changeKind: 'INVITED', reasonCode: 'PROJECT_INVITATION', presentationMetadata: { projectLabel: 'Secret Project' } } });
addRecipient(invite.eventId);
const inviteResult = core.projectEvent({ event: invite });
assert.equal(inviteResult.ok, true, JSON.stringify(inviteResult));
assert.equal(inviteResult.created, 1);
assert.equal(inviteResult.notifications[0].notificationType, 'PROJECT_INVITED');
assert.equal(inviteResult.notifications[0].visibilityClass, 'RECIPIENT_ONLY');
assert.equal(inviteResult.notifications[0].priority, 'HIGH');
assert.equal(core.projectEvent({ event: invite }).deduplicated, 1, 'Duplicate Event created a second Notification.');

const privateInvite = makeEvent({ eventId: 'event-private-invite', eventType: 'PROJECT_MEMBER_CHANGED', visibilityClass: 'PROJECT_MEMBERS', payload: { changeKind: 'INVITED', presentationMetadata: { projectLabel: 'Private Project Name' } } });
addRecipient(privateInvite.eventId);
const privateResult = core.projectEvent({ event: privateInvite });
assert.equal(privateResult.ok, true);
assert.equal(privateResult.notifications[0].presentationMetadata.projectLabel, 'Private Project Name');
const privateAttempt = core.createDeliveryAttempt({ notificationId: privateResult.notifications[0].notificationId, channel: 'WEB_PUSH', permissionDecision: allow('user-invitee-001') });
assert.equal(privateAttempt.ok, true);
assert.equal(core.dispatchDeliveries({ batchSize: 1, permissionDecision: allow() }).delivered, 1);
assert.equal(deliveryCalls.push, 1);

const groupOne = makeEvent({ eventId: 'event-package-ready-001', eventType: 'PACKAGE_READY', aggregateType: 'PACKAGE', aggregateId: 'package-game-001', projectId: 'project-draw2-001', visibilityClass: 'PROJECT_MEMBERS', payload: { reasonCode: 'BUILD_COMPLETE' } });
const groupTwo = makeEvent({ eventId: 'event-package-ready-002', eventType: 'PACKAGE_READY', aggregateType: 'PACKAGE', aggregateId: 'package-game-001', projectId: 'project-draw2-001', visibilityClass: 'PROJECT_MEMBERS', payload: { reasonCode: 'BUILD_COMPLETE' } });
addRecipient(groupOne.eventId); addRecipient(groupTwo.eventId);
assert.equal(core.projectEvent({ event: groupOne }).created, 1);
assert.equal(core.projectEvent({ event: groupTwo }).grouped, 1, 'Non-critical semantic grouping did not occur.');
const groupNotification = core.projectEvent({ event: groupTwo }).notifications[0];
assert.equal(groupNotification.presentationMetadata.groupCount, 2, 'Grouped Notification count is not bounded and persistent.');

const muted = makeEvent({ eventId: 'event-muted-asset', eventType: 'ASSET_QUARANTINED', aggregateType: 'ASSET', aggregateId: 'asset-muted-001', projectId: 'project-muted', visibilityClass: 'PROJECT_MEMBERS' });
addRecipient(muted.eventId);
const mutedResult = core.projectEvent({ event: muted });
assert.equal(mutedResult.created, 1);
assert.equal(mutedResult.notifications[0].deliveryPolicy.inApp, false);
assert.equal(mutedResult.suppressed, 1);

const security = makeEvent({ eventId: 'event-security-required', eventType: 'ACCOUNT_STATE_CHANGED', aggregateType: 'ACCOUNT', aggregateId: 'account-001', projectId: null, visibilityClass: 'PRIVATE', payload: { securityActionRequired: true, notificationType: 'SECURITY_ACTION_REQUIRED' } });
addRecipient(security.eventId, 'user-owner-001', 'RECIPIENT_ONLY');
const securityResult = core.projectEvent({ event: security });
assert.equal(securityResult.ok, true);
assert.equal(securityResult.notifications[0].deliveryPolicy.mandatory, true);
assert.equal(securityResult.notifications[0].deliveryPolicy.inApp, true, 'Security preference muted a mandatory in-app notification.');
assert.equal(securityResult.delayed, 1);

const privatePermissionLeak = makeEvent({ eventId: 'event-private-visibility-leak', eventType: 'PROJECT_MEMBER_CHANGED', payload: { changeKind: 'INVITED' } });
eventRecipients[privatePermissionLeak.eventId] = [{ recipientType: 'USER', recipientId: 'user-invitee-001', visibilityClass: 'PUBLIC_SAFE', permissionDecision: allow('user-invitee-001') }];
expectFailure('private-visibility-broadening', core.projectEvent({ event: privatePermissionLeak }), 'NOTIFICATION_VISIBILITY_BROADENED');

const storm = makeEvent({ eventId: 'event-storm-suppressed', eventType: 'PROJECT_MEMBER_CHANGED', payload: { changeKind: 'INVITED' } });
addRecipient(storm.eventId);
const stormResult = core.projectEvent({ event: storm });
assert.equal(stormResult.ok, true); assert.equal(stormResult.suppressed, 1); assert.equal(stormResult.created, 0);

const quiet = makeEvent({ eventId: 'event-quiet-invite', eventType: 'PROJECT_MEMBER_CHANGED', payload: { changeKind: 'INVITED' } });
addRecipient(quiet.eventId);
const quietResult = core.projectEvent({ event: quiet });
const quietAttempt = core.createDeliveryAttempt({ notificationId: quietResult.notifications[0].notificationId, channel: 'WEB_PUSH', permissionDecision: allow('user-invitee-001') });
assert.equal(quietAttempt.ok, true); assert.equal(quietAttempt.delayed, true); assert.equal(quietAttempt.attempt.state, 'PENDING');
assert.equal(core.dispatchDeliveries({ batchSize: 10, permissionDecision: allow() }).delayed >= 1, true);

const inboxPage = core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001', pageSize: 1 }, permissionDecision: allow('user-invitee-001') });
assert.equal(inboxPage.ok, true); assert.equal(inboxPage.results.length, 1); assert.ok(inboxPage.nextCursor);
const inboxPageTwo = core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001', pageSize: 1, cursor: inboxPage.nextCursor }, permissionDecision: allow('user-invitee-001') });
assert.equal(inboxPageTwo.ok, true); assert.notEqual(inboxPage.results[0].notificationId, inboxPageTwo.results[0].notificationId);
assert.equal(core.markRead({ notificationId: inboxPage.results[0].notificationId, permissionDecision: allow('user-invitee-001') }).ok, true);
assert.equal(core.markRead({ notificationId: inboxPage.results[0].notificationId, permissionDecision: allow('user-invitee-001') }).idempotent, true);
assert.equal(core.markUnread({ notificationId: inboxPage.results[0].notificationId, permissionDecision: allow('user-invitee-001') }).ok, true);
assert.equal(core.archive({ notificationId: inboxPage.results[0].notificationId, permissionDecision: allow('user-invitee-001') }).ok, true);
assert.equal(core.restore({ notificationId: inboxPage.results[0].notificationId, permissionDecision: allow('user-invitee-001') }).ok, true);
assert.equal(core.markAllRead({ recipientType: 'USER', recipientId: 'user-invitee-001', watermark: '2026-08-07T00:01:00.000Z', permissionDecision: allow('user-invitee-001') }).ok, true);

const failing = makeEvent({ eventId: 'event-package-failed-001', eventType: 'PACKAGE_FAILED', aggregateType: 'PACKAGE', aggregateId: 'package-failed-001', projectId: 'project-draw2-001', payload: { reasonCode: 'BUILD_FAILED' } });
addRecipient(failing.eventId);
const failingResult = core.projectEvent({ event: failing });
failingNotificationId = failingResult.notifications[0].notificationId;
const failingAttempt = core.createDeliveryAttempt({ notificationId: failingNotificationId, channel: 'IN_APP', permissionDecision: allow('user-invitee-001') });
assert.equal(failingAttempt.attempt.state, 'PENDING');
assert.equal(core.dispatchDeliveries({ batchSize: 64, permissionDecision: allow() }).retried, 1);
assert.equal(core.dispatchDeliveries({ batchSize: 64, permissionDecision: allow() }).retried, 1);
assert.equal(core.dispatchDeliveries({ batchSize: 64, permissionDecision: allow() }).deadLettered, 1);
assert.equal(core.snapshot().notifications[failingNotificationId]?.notificationType, 'PACKAGE_FAILED');
assert.equal('message' in core.snapshot().deadLetters[0], false, 'Raw provider error leaked into DLQ.');

const replayBefore = deliveryCalls.inApp + deliveryCalls.push;
const replay = core.replayProjection({ events: [invite, privateInvite, groupOne, groupTwo, security] });
assert.equal(replay.ok, true); assert.equal(replay.externalSideEffects, 0); assert.equal(replay.externalResends, 0); assert.equal(deliveryCalls.inApp + deliveryCalls.push, replayBefore);

const allFlagsOff = createNotificationCore({ clock, idGenerator, featureFlagEvaluator: ({ flagId }) => ({ enabled: false, decision: 'disabled', source: 'server', flagId }), eventTrustEvaluator: () => allow(), recipientResolver: resolver });
expectFailure('feature-flag-off', allFlagsOff.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001' }, permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_FLAG_OFF');
expectFailure('unknown-flag', core.evaluateFlag({ flagId: 'notification-unknown', action: 'read' }), 'FEATURE_FLAG_UNKNOWN');
expectFailure('cross-user-inbox', core.queryInbox({ query: { recipientType: 'USER', recipientId: 'other-user-001' }, permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_CROSS_USER_ACCESS_DENIED');

const baseRecord = fixture.notification;
expectInvalid('unknown-notification-type', validateNotificationRecord({ ...baseRecord, notificationType: 'SOCIAL_MENTION' }));
expectInvalid('reserved-notification-type', validateNotificationRecord({ ...baseRecord, notificationType: 'MARKET_SALE' }));
expectInvalid('unsupported-record-version', validateNotificationRecord({ ...baseRecord, notificationVersion: 2 }), 'NOTIFICATION_RECORD_VERSION_UNSUPPORTED');
expectInvalid('notification-source-id-collision', validateNotificationRecord({ ...baseRecord, notificationId: baseRecord.sourceEventId }), 'NOTIFICATION_ID_COLLISION');
expectInvalid('priority-spoof', validateNotificationRecord({ ...baseRecord, priority: 'CRITICAL' }), 'NOTIFICATION_PRIORITY_SPOOFED');
expectInvalid('invalid-presentation-key', validateNotificationRecord({ ...baseRecord, presentationKey: 'notification.unknown' }), 'NOTIFICATION_PRESENTATION_KEY_INVALID');
expectInvalid('invalid-visibility', validateNotificationRecord({ ...baseRecord, visibilityClass: 'PUBLIC' }));
expectInvalid('private-project-name-pii', validateNotificationRecord({ ...baseRecord, presentationMetadata: { email: 'private@example.com' } }));
expectInvalid('raw-blob-metadata', validateNotificationRecord({ ...baseRecord, presentationMetadata: { rawBlob: 'forbidden' } }));
expectInvalid('data-url-metadata', validateNotificationRecord({ ...baseRecord, presentationMetadata: { preview: 'data:image/png;base64,AAAA' } }));
expectInvalid('jwt-metadata', validateNotificationRecord({ ...baseRecord, presentationMetadata: { jwt: 'abcdefgh.ijklmnop.qrstuvwx' } }));
expectInvalid('deep-metadata', validateNotificationRecord({ ...baseRecord, presentationMetadata: { a: { b: { c: { d: { e: true } } } } } }));
expectInvalid('oversized-metadata', validateNotificationRecord({ ...baseRecord, presentationMetadata: { long: 'x'.repeat(8193) } }));
expectInvalid('invalid-delivery-policy-mandatory', validateNotificationRecord({ ...baseRecord, deliveryPolicy: { ...baseRecord.deliveryPolicy, mandatory: true } }), 'NOTIFICATION_MANDATORY_POLICY_INVALID');
expectInvalid('invalid-schema-version', validateNotificationRecord({ ...baseRecord, schemaVersion: 2 }), 'NOTIFICATION_SCHEMA_VERSION_UNSUPPORTED');
expectInvalid('invalid-preference-locale', validateNotificationPreferences({ ...fixture.preferences, locale: 'ja_JP' }), 'NOTIFICATION_LOCALE_INVALID');
expectInvalid('invalid-preference-quiet-hours', validateNotificationPreferences({ ...fixture.preferences, quietHours: { enabled: true, startMinute: 1440, endMinute: 0, timezone: 'UTC' } }), 'NOTIFICATION_QUIET_HOURS_INVALID');
expectInvalid('invalid-delivery-channel', validateNotificationDeliveryAttempt({ ...fixture.deliveryAttempt, channel: 'SMS' }));
expectInvalid('invalid-delivery-state', validateNotificationDeliveryAttempt({ ...fixture.deliveryAttempt, state: 'RETRYING' }));
expectInvalid('invalid-delivery-attempt-number', validateNotificationDeliveryAttempt({ ...fixture.deliveryAttempt, attemptNumber: 0 }));
expectFailure('invalid-event-type', core.projectEvent({ event: { ...invite, eventId: 'event-unknown-type', eventType: 'UNKNOWN_EVENT' } }), 'NOTIFICATION_EVENT_INVALID');
expectFailure('unknown-event-version', core.projectEvent({ event: { ...invite, eventId: 'event-unknown-version', eventVersion: 2 } }), 'NOTIFICATION_EVENT_INVALID');
expectFailure('high-frequency-event', core.projectEvent({ event: { ...invite, eventId: 'event-pixisync-operation', eventType: 'PIXISYNC_OPERATION' } }), 'NOTIFICATION_HIGH_FREQUENCY_EVENT');
expectFailure('untrusted-event', (() => { const untrusted = createNotificationCore({ clock, idGenerator, featureFlagEvaluator: flags, eventTrustEvaluator: () => ({ ok: false, decision: 'deny', source: 'server' }), recipientResolver: resolver }); return untrusted.projectEvent({ event: invite }); })(), 'NOTIFICATION_EVENT_UNTRUSTED');
expectFailure('missing-recipient-resolver', (() => { const isolated = createNotificationCore({ clock, idGenerator, featureFlagEvaluator: flags, eventTrustEvaluator: () => allow() }); return isolated.projectEvent({ event: invite }); })(), 'NOTIFICATION_RECIPIENT_RESOLVER_MISSING');
expectFailure('invalid-recipient-source', (() => { const isolated = createNotificationCore({ clock, idGenerator, featureFlagEvaluator: flags, eventTrustEvaluator: () => allow(), recipientResolver: () => [{ recipientType: 'USER', recipientId: 'user-invitee-001', permissionDecision: { ok: false, decision: 'deny', source: 'client' } }] }); return isolated.projectEvent({ event: invite }); })(), 'NOTIFICATION_RECIPIENT_PERMISSION_DENIED');
expectFailure('invalid-cross-user-mark-read', core.markRead({ notificationId: inviteResult.notifications[0].notificationId, permissionDecision: allow('other-user-001') }), 'NOTIFICATION_CROSS_USER_ACCESS_DENIED');
expectFailure('mark-all-without-watermark', core.markAllRead({ recipientType: 'USER', recipientId: 'user-invitee-001', permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_WATERMARK_REQUIRED');
expectFailure('cursor-query-mismatch', core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001', cursor: 'notification:v1:invalid' }, permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_CURSOR_INVALID');
expectFailure('invalid-page-size', core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001', pageSize: 51 }, permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_QUERY_PAGE_SIZE_INVALID');
expectFailure('invalid-channel-operation', core.createDeliveryAttempt({ notificationId: inviteResult.notifications[0].notificationId, channel: 'SMS', permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_ENUM_UNSUPPORTED');
expectFailure('digest-flag-off', (() => { const old = enabledFlags.has(NOTIFICATION_FLAGS.digest); enabledFlags.delete(NOTIFICATION_FLAGS.digest); const result = core.createDeliveryAttempt({ notificationId: inviteResult.notifications[0].notificationId, channel: 'DIGEST', permissionDecision: allow('user-invitee-001') }); if (old) enabledFlags.add(NOTIFICATION_FLAGS.digest); return result; })(), 'NOTIFICATION_FLAG_OFF');
expectFailure('critical-rate-limit-suppress', (() => { const isolated = createNotificationCore({ clock, idGenerator, featureFlagEvaluator: flags, eventTrustEvaluator: () => allow(), recipientResolver: resolver, rateLimitEvaluator: () => ({ allowed: false, action: 'SUPPRESS' }) }); const critical = makeEvent({ eventId: 'event-critical-suppressed', eventType: 'ACCOUNT_STATE_CHANGED', aggregateType: 'ACCOUNT', aggregateId: 'account-critical-001', projectId: null, visibilityClass: 'PRIVATE', payload: { notificationType: 'SECURITY_ACTION_REQUIRED' } }); addRecipient(critical.eventId, 'user-owner-001', 'RECIPIENT_ONLY'); return isolated.projectEvent({ event: critical }); })(), 'NOTIFICATION_CRITICAL_RATE_LIMIT_POLICY_REQUIRED');
expectFailure('cancel-after-delivery', core.cancelDeliveryAttempt({ deliveryAttemptId: privateAttempt.attempt.deliveryAttemptId, permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_DELIVERY_ALREADY_TERMINAL');
expectFailure('invalid-query-state', core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001', states: ['UNKNOWN'] }, permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_ENUM_UNSUPPORTED');
expectFailure('invalid-recipient-type', core.queryInbox({ query: { recipientType: 'ADMIN', recipientId: 'user-invitee-001' }, permissionDecision: allow('user-invitee-001') }), 'NOTIFICATION_ENUM_UNSUPPORTED');

assert.ok(failureFixtureNames.length >= 40, `Failure fixture coverage is too small: ${failureFixtureNames.length}`);
assert.equal(core.snapshot().storageBoundary.excluded.includes('commission-private-body'), true);
assert.equal(core.snapshot().projectionQueue.length, 0);

console.log(JSON.stringify({
  workPackage: 'WP-097',
  status: 'pass',
  notificationTypes: NOTIFICATION_TYPE_NAMES.length,
  reservedTypes: NOTIFICATION_RESERVED_TYPES.length,
  flags: Object.values(NOTIFICATION_FLAGS).length,
  visibilityClasses: 5,
  inboxStates: NOTIFICATION_INBOX_STATES,
  channels: 5,
  recipientResolution: 'server-permission-core-only',
  duplicateEventIdempotency: true,
  semanticGrouping: true,
  privateDeliverySanitized: true,
  mandatorySecurity: true,
  stableCursor: true,
  quietHoursDelay: true,
  retryAndDeadLetter: true,
  replayExternalResends: 0,
  failureFixtures: failureFixtureNames.length,
  failureFixtureNames,
  currentRoutesConnected: false,
  marketSnsFinanceCommissionImplemented: false,
  highFrequencyEditorEventsAccepted: false,
}, null, 2));
