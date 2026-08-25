import assert from 'node:assert/strict';
import { createNotificationCore, NOTIFICATION_FLAGS } from '../core-shell/assets/core-notification-contracts.js';
import { AUTHORIZATION_PROOF_POLICY_VERSION, normalizeAuthorizationProof } from '../core-shell/assets/core-authorization-proof-contracts.js';

const issuedAt = '2099-08-09T00:00:00.000Z';
const expiresAt = '2099-08-09T00:05:00.000Z';
let proofSequence = 0;
const proof = ({ principalId = 'user-invitee-001', resourceType = 'NOTIFICATION_RECIPIENT', resourceId = principalId, action = 'notification.recipient.access', capability = action, tenantId = 'tenant-1', correlationId = 'correlation-notification-1', policyVersion = AUTHORIZATION_PROOF_POLICY_VERSION, decision = 'allow', issuedAt: issued = issuedAt, expiresAt: expires = expiresAt } = {}) => normalizeAuthorizationProof({
  schemaVersion: 1, proofType: 'AUTHORIZATION_PROOF', source: 'server', decision,
  authorityId: 'notification-server-authority', proofId: `notification-proof-${++proofSequence}`,
  principalId, resourceType, resourceId,
  action, capability, tenantId,
  correlationId, policyVersion, grantId: decision === 'allow' ? 'notification-grant' : null, issuedAt: issued, expiresAt: expires,
});

const enabledFlags = ({ flagId }) => ({ flagId, enabled: Object.values(NOTIFICATION_FLAGS).includes(flagId), decision: 'enabled', source: 'server' });
const authorizationEvaluator = (input) => proof({ ...input, decision: input.tenantId === 'tenant-1' ? 'allow' : 'deny' });
let sequence = 0;
const core = createNotificationCore({
  clock: () => issuedAt,
  idGenerator: (kind) => `${kind}-fp001-${++sequence}`,
  featureFlagEvaluator: enabledFlags,
  eventTrustEvaluator: ({ event }) => proof({ principalId: event.actorRef?.actorId ?? null, resourceType: 'EVENT', resourceId: event.eventId, action: 'notification.event.consume', capability: 'notification.event.consume', correlationId: event.correlationId }),
  authorizationEvaluator,
  recipientResolver: () => [{ recipientType: 'USER', recipientId: 'user-invitee-001', visibilityClass: 'RECIPIENT_ONLY', permissionDecision: proof() }],
});
const event = {
  eventId: 'event-notification-fp001', eventType: 'PROJECT_MEMBER_CHANGED', eventVersion: 1, occurredAt: issuedAt,
  producer: { producerId: 'project-registry-v1', producerVersion: '1.0.0', producerType: 'PROJECT_REGISTRY' },
  aggregateType: 'PROJECT', aggregateId: 'project-fp001', aggregateVersion: 1,
  actorRef: { actorId: 'user-owner', actorType: 'USER' },
  correlationId: 'correlation-event-notification-fp001', causationId: null, projectId: 'project-fp001', assetId: null, packageId: null,
  visibilityClass: 'PROJECT_MEMBERS', payload: { changeKind: 'INVITED', reasonCode: 'PROJECT_INVITATION' }, schemaVersion: 1, causationDepth: 0, causationChain: [],
};

const projected = core.projectEvent({ event });
assert.equal(projected.ok, true, JSON.stringify(projected));
assert.equal(projected.created, 1);

const validRecipientProof = proof();
const queried = core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001' }, permissionDecision: validRecipientProof });
assert.equal(queried.ok, true);
assert.equal(queried.total, 1);

const fakeResource = core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001' }, permissionDecision: proof({ resourceId: 'user-other' }) });
assert.equal(fakeResource.ok, false);

const fakeTenant = core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001' }, permissionDecision: proof({ tenantId: 'tenant-other' }) });
assert.equal(fakeTenant.ok, false);

const unknownPolicy = core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001' }, permissionDecision: proof({ policyVersion: 'unknown-policy-v99' }) });
assert.equal(unknownPolicy.ok, false);

const expired = core.queryInbox({ query: { recipientType: 'USER', recipientId: 'user-invitee-001' }, permissionDecision: proof({ issuedAt: '2000-01-01T00:00:00.000Z', expiresAt: '2000-01-01T00:05:00.000Z' }) });
assert.equal(expired.ok, false);

console.log('FP-001 Notification adoption: recipient Proof binding, tenant/policy/expiry and cross-recipient rejection passed');
