import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
} from "../src/wp160-contracts.ts";
import {
  createSnsNotificationReference,
  createSnsPublicUrlCandidate,
  createSnsTrustedEvent,
} from "../src/wp230-sns-community-core.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown, message = "Values are not equal"): void {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}

const FUTURE_ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const FUTURE_EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString();

function proof(overrides: Partial<AuthorizationProofV1> = {}): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "caller-authority",
    proofId: "caller-proof",
    principalId: "creator-1",
    resourceType: "SNS_EVENT",
    resourceId: "post-1",
    action: "sns.event.create",
    capability: "sns.event.create",
    tenantId: "tenant-1",
    correlationId: "correlation-sns-1",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant-1",
    issuedAt: FUTURE_ISSUED_AT,
    expiresAt: FUTURE_EXPIRES_AT,
    ...overrides,
  };
}

const serverResolver: AuthorizationProofResolver = ({ expected }) => proof({
  authorityId: "server-authority",
  proofId: "server-proof",
  principalId: expected.principalId ?? "creator-1",
  resourceType: expected.resourceType ?? "SNS_EVENT",
  resourceId: expected.resourceId ?? "post-1",
  action: expected.action ?? "sns.event.create",
  capability: expected.capability ?? "sns.event.create",
  tenantId: expected.tenantId ?? "tenant-1",
  correlationId: expected.correlationId ?? "correlation-server",
  policyVersion: expected.policyVersion ?? AUTHORIZATION_PROOF_POLICY_VERSION,
});

const eventInput = {
  eventId: "event-1" as never,
  eventType: "POST_PUBLISHED" as const,
  aggregateId: "post-1",
  aggregateVersion: 1,
  actorReference: "creator-1",
  objectReference: "post-1",
  visibility: "PUBLIC" as const,
  presentationKey: "sns.post.published",
  producerProof: proof(),
  authorizationProofResolver: serverResolver,
};

Deno.test("FP-001 SNS producer proof is server-resolved and bound", async () => {
  const accepted = await createSnsTrustedEvent(eventInput);
  assert(accepted.ok);
  assertEquals(accepted.value.producerProof.authorityId, "server-authority");
  assertEquals(accepted.value.producerProof.proofId, "server-proof");

  const forgedResource = await createSnsTrustedEvent({
    ...eventInput,
    producerProof: proof({ resourceId: "other-post" }),
  });
  assert(!forgedResource.ok);
  assert(forgedResource.diagnostics.some((item) => item.code === "EVENT_NOT_TRUSTED"));

  const forgedPolicy = await createSnsTrustedEvent({
    ...eventInput,
    producerProof: proof({ policyVersion: "unknown-policy-v99" }),
  });
  assert(!forgedPolicy.ok);

  const expired = await createSnsTrustedEvent({
    ...eventInput,
    producerProof: proof({ issuedAt: "2000-01-01T00:00:00.000Z", expiresAt: "2000-01-01T00:05:00.000Z" }),
  });
  assert(!expired.ok);

  const callerForged = await createSnsTrustedEvent({
    ...eventInput,
    producerProof: proof({ authorityId: "caller-forged", proofId: "caller-forged-proof" }),
  });
  assert(callerForged.ok);
  assertEquals(callerForged.value.producerProof.authorityId, "server-authority");
});

Deno.test("FP-001 SNS recipient and public URL proofs reject scope reuse", async () => {
  const event = await createSnsTrustedEvent(eventInput);
  assert(event.ok);

  const acceptedRecipient = createSnsNotificationReference({
    referenceId: "notification-1" as never,
    event: event.value,
    recipientAccountId: "account-2",
    recipientProof: proof({ principalId: "account-2", resourceType: "SNS_RECIPIENT", resourceId: "account-2", action: "sns.notification.resolve", capability: "sns.notification.resolve" }),
    authorizationProofResolver: serverResolver,
  });
  assert(acceptedRecipient.ok);
  assertEquals(acceptedRecipient.value.recipientProof.authorityId, "server-authority");

  const reusedRecipient = createSnsNotificationReference({
    referenceId: "notification-2" as never,
    event: event.value,
    recipientAccountId: "account-2",
    recipientProof: proof({ principalId: "account-2", resourceType: "SNS_RECIPIENT", resourceId: "account-3", action: "sns.notification.resolve", capability: "sns.notification.resolve" }),
    authorizationProofResolver: serverResolver,
  });
  assert(!reusedRecipient.ok);

  const acceptedUrl = createSnsPublicUrlCandidate({
    resourceType: "POST",
    resourceId: "post-1",
    path: "/sns/post-1",
    visibility: "PUBLIC",
    resourceStatus: "PUBLISHED",
    authorizationProof: proof({ principalId: null, resourceType: "SNS_PUBLIC_URL", resourceId: "post-1", action: "sns.public-url.resolve", capability: "sns.public-url.resolve" }),
    authorizationProofResolver: serverResolver,
  });
  assert(acceptedUrl.ok);
  assertEquals(acceptedUrl.value.authorizationProof.authorityId, "server-authority");
});
