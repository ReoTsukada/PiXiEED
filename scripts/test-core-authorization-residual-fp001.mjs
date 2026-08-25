#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createEventActivityCore,
} from '../core-shell/assets/core-event-activity-contracts.js';
import { createNotificationCore } from '../core-shell/assets/core-notification-contracts.js';
import { createPublicUrlRoutingCore, PUBLIC_URL_FLAG_NAMES } from '../core-shell/assets/core-public-url-routing-contracts.js';

const issuedAt = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 4 * 60_000).toISOString();
const policy = 'authorization-policy-v1';
const clone = (value) => structuredClone(value);

function proof(expected = {}, overrides = {}) {
  return {
    schemaVersion: 1,
    proofType: 'AUTHORIZATION_PROOF',
    source: 'server',
    decision: 'allow',
    authorityId: 'caller-authority',
    proofId: 'caller-proof',
    principalId: expected.principalId ?? null,
    resourceType: expected.resourceType || 'TEST_RESOURCE',
    resourceId: expected.resourceId || 'resource-1',
    action: expected.action || 'test.read',
    capability: expected.capability || expected.action || 'test.read',
    tenantId: expected.tenantId ?? 'tenant-1',
    correlationId: expected.correlationId ?? 'correlation-fp001-residual',
    policyVersion: expected.policyVersion || policy,
    grantId: 'grant-1',
    issuedAt,
    expiresAt: future,
    ...overrides,
  };
}

const serverEvaluator = (input) => proof(input, { authorityId: 'server-authority', proofId: `server-${input.resourceId}` });
const allFlags = ({ flagId, action }) => ({ flagId, action, enabled: true, decision: 'enabled', source: 'server' });
const expectDenied = (name, result) => {
  assert.equal(result.ok, false, `${name} unexpectedly passed: ${JSON.stringify(result)}`);
};

// WP-098 Public URL private route: a caller-created allow object cannot authorize it.
const publicCore = createPublicUrlRoutingCore({
  featureFlagEvaluator: allFlags,
  authorizationEvaluator: serverEvaluator,
});
const accountRoute = publicCore.snapshot().currentRoutes.find((route) => route.path === '/account/');
const accountProof = proof({ resourceType: 'PUBLIC_ROUTE', resourceId: accountRoute.routeId, action: 'public-url.route.read', capability: 'public-url.route.read' });
assert.equal(publicCore.resolve({ url: '/account/', permissionDecision: accountProof }).ok, true);
expectDenied('public-route-resource-reuse', publicCore.resolve({ url: '/account/', permissionDecision: { ...accountProof, resourceId: 'other-route' } }));
expectDenied('public-route-unknown-policy', publicCore.resolve({ url: '/account/', permissionDecision: { ...accountProof, policyVersion: 'unknown-policy-v99' } }));

// WP-095 Event: producer registration and fact commit both require a bound Proof.
const eventFixture = JSON.parse(readFileSync(new URL('../core-shell/fixtures/event-activity-v1.valid.json', import.meta.url), 'utf8'));
const producer = { producerId: 'asset-registry-v1', producerVersion: '1.0.0', producerType: 'ASSET_REGISTRY' };
const eventEvaluator = (input) => input.resourceId === 'client-producer' ? proof(input, { decision: 'deny', authorityId: 'server-authority', proofId: 'server-deny' }) : serverEvaluator(input);
const eventCore = createEventActivityCore({
  clock: () => issuedAt,
  idGenerator: (kind) => `${kind}-residual-1`,
  featureFlagEvaluator: allFlags,
  authorizationEvaluator: eventEvaluator,
  trustedProducers: [{ producer, authorizationProof: proof({ resourceType: 'EVENT_PRODUCER', resourceId: producer.producerId, action: 'event.producer.register', capability: 'event.producer.register' }) }],
  transactionAdapter: () => ({ ok: true, committed: true }),
});
const event = { ...clone(eventFixture), eventId: 'event-residual-1', aggregateVersion: 1, causationId: null, causationDepth: 0, causationChain: [] };
const eventProof = proof({ resourceType: 'EVENT', resourceId: event.eventId, action: 'event.commit', capability: 'event.write', principalId: event.actorRef.actorId, correlationId: event.correlationId });
assert.equal(eventCore.commitFact({ event, permissionDecision: eventProof }).ok, true);
expectDenied('event-resource-reuse', eventCore.commitFact({ event: { ...event, eventId: 'event-residual-2', aggregateVersion: 1 }, permissionDecision: { ...eventProof, resourceId: 'other-event' } }));
expectDenied('event-fake-registration-proof', eventCore.registerProducer({ producer: { producerId: 'client-producer', producerVersion: '1.0.0', producerType: 'CORE_SYSTEM' }, permissionDecision: { ...eventProof, resourceType: 'EVENT_PRODUCER', resourceId: 'client-producer', action: 'event.producer.register', capability: 'event.producer.register' } }));

// WP-097 Notification enqueue and dispatch require operation Proofs in addition to recipient Proofs.
const notificationEvent = { ...clone(event), eventId: 'notification-event-1', eventType: 'PROJECT_MEMBER_CHANGED', aggregateType: 'PROJECT', aggregateId: 'project-notification-1', projectId: 'project-notification-1', assetId: null, packageId: null, payload: { changeKind: 'INVITED', reasonCode: 'MEMBER_INVITED' } };
const recipientProof = proof({ resourceType: 'NOTIFICATION_RECIPIENT', resourceId: 'user-notification-1', action: 'notification.recipient.access', capability: 'notification.recipient.access' });
const notificationCore = createNotificationCore({
  clock: () => issuedAt,
  idGenerator: (kind) => `${kind}-residual-1`,
  featureFlagEvaluator: allFlags,
  eventTrustEvaluator: () => proof({ principalId: notificationEvent.actorRef.actorId, resourceType: 'EVENT', resourceId: notificationEvent.eventId, action: 'notification.event.consume', capability: 'notification.event.consume', correlationId: notificationEvent.correlationId }),
  authorizationEvaluator: serverEvaluator,
  recipientResolver: () => [{ recipientType: 'USER', recipientId: 'user-notification-1', permissionDecision: recipientProof }],
});
const enqueueProof = proof({ principalId: notificationEvent.actorRef.actorId, resourceType: 'NOTIFICATION_EVENT', resourceId: notificationEvent.eventId, action: 'notification.enqueue', capability: 'notification.enqueue', correlationId: notificationEvent.correlationId });
assert.equal(notificationCore.enqueueProjection({ event: notificationEvent, permissionDecision: enqueueProof }).ok, true);
expectDenied('notification-enqueue-resource-reuse', notificationCore.enqueueProjection({ event: { ...notificationEvent, eventId: 'notification-event-2' }, permissionDecision: { ...enqueueProof, resourceId: 'other-event' } }));
assert.equal(notificationCore.processProjectionQueue({ batchSize: 1 }).ok, true);
const dispatchProof = proof({ resourceType: 'NOTIFICATION_DELIVERY_BATCH', resourceId: 'notification-delivery-batch', action: 'notification.dispatch', capability: 'notification.dispatch' });
assert.equal(notificationCore.dispatchDeliveries({ permissionDecision: dispatchProof }).ok, true);
expectDenied('notification-dispatch-unknown-policy', notificationCore.dispatchDeliveries({ permissionDecision: { ...dispatchProof, policyVersion: 'unknown-policy-v99' } }));

console.log('FP-001 residual authority: Public URL, Event producer/commit, Notification enqueue/dispatch proof-binding checks passed');
