import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
} from "../src/wp160-contracts.ts";
import {
  createSnsCommunity,
  createSnsCoreCard,
  createSnsPost,
  createSnsFollow,
  resolveSnsRead,
} from "../src/wp230-sns-community-core.ts";
import { createWp240ModerationReference } from "../src/wp240-admin-analytics-ads-core.ts";
import {
  createWp250AdminAuditReference,
  createWp250ModerationCase,
  createWp250ModerationDecision,
} from "../src/wp250-policy-economics-core.ts";

function assert(condition: unknown, message = "Assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

const issuedAt = new Date(Date.now() - 60_000).toISOString();
const future = new Date(Date.now() + 4 * 60_000).toISOString();

function proof(expected: Partial<AuthorizationProofV1> = {}, overrides: Partial<AuthorizationProofV1> = {}): AuthorizationProofV1 {
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "caller-authority",
    proofId: "caller-proof",
    principalId: expected.principalId ?? null,
    resourceType: expected.resourceType ?? "TEST_RESOURCE",
    resourceId: expected.resourceId ?? "resource-1",
    action: expected.action ?? "test.read",
    capability: expected.capability ?? expected.action ?? "test.read",
    tenantId: expected.tenantId ?? "tenant-1",
    correlationId: expected.correlationId ?? "correlation-residual",
    policyVersion: expected.policyVersion ?? AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant-1",
    issuedAt,
    expiresAt: future,
    ...overrides,
  };
}

const resolver: AuthorizationProofResolver = ({ expected }) => proof({ ...expected, principalId: expected.resourceType === "ADMIN_AUDIT" ? "admin-1" : expected.principalId ?? null, authorityId: "server-authority", proofId: `server-${expected.resourceId}` });
const deniedResolver: AuthorizationProofResolver = ({ expected }) => proof({ ...expected, authorityId: "server-authority", proofId: "server-deny" }, { decision: "deny" });
const expectDenied = (result: { readonly ok: boolean }, label: string) => assert(!result.ok, `${label} unexpectedly passed`);

Deno.test("FP-001 residual SNS authorities reject legacy Boolean/fake scope and accept bound Proof", async () => {
  const postProof = proof({ principalId: "creator-1", resourceType: "SNS_POST", resourceId: "post-residual-1", action: "sns.post.create", capability: "sns.post.create" });
  const post = await createSnsPost({
    postId: "post-residual-1" as never,
    shareCommandId: "share-residual-1" as never,
    creatorId: "creator-1",
    sourceAccountId: "account-1",
    kind: "CREATOR_NOTE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "Residual authority fixture",
    references: [],
    explicitShare: true,
    authorizationProof: postProof,
    authorizationProofResolver: resolver,
  });
  assert(post.ok, "bound SNS Post Proof should pass");

  const fakePost = await createSnsPost({
    postId: "post-residual-2" as never,
    shareCommandId: "share-residual-2" as never,
    creatorId: "creator-1",
    sourceAccountId: "account-1",
    kind: "CREATOR_NOTE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "Fake scope",
    references: [],
    explicitShare: true,
    authorizationProof: { ...postProof, resourceId: "other-post" },
    authorizationProofResolver: resolver,
  });
  expectDenied(fakePost, "SNS fake Post resource");

  const card = createSnsCoreCard({
    cardId: "card-residual-1" as never,
    cardType: "PUBLIC_PROJECT",
    resourceId: "project-residual-1",
    publicPresentationReference: "/projects/project-residual-1",
    snapshotPolicy: { price: "OMITTED", availability: "LIVE", creator: "LIVE", preview: "LIVE" },
    authorizationProof: proof({ resourceType: "SNS_CORE_CARD", resourceId: "card-residual-1", action: "sns.core-card.create", capability: "sns.core-card.create" }),
    authorizationProofResolver: resolver,
    approvedPublicResource: true,
    currentVisibility: "PUBLIC",
  });
  assert(card.ok, "bound Core Card Proof should pass");

  const community = createSnsCommunity({
    communityId: "community-residual-1" as never,
    ownerCreatorId: "creator-1",
    name: "Residual Community",
    visibility: "PUBLIC",
    authorizationProof: proof({ principalId: "creator-1", resourceType: "SNS_COMMUNITY", resourceId: "community-residual-1", action: "sns.community.create", capability: "sns.community.create" }),
    authorizationProofResolver: resolver,
  });
  assert(community.ok, "bound Community Proof should pass");

  const follow = await createSnsFollow({ followId: "follow-residual-1" as never, followerAccountId: "account-1", creatorId: "creator-1", authorizationProof: proof({ principalId: "account-1", resourceType: "SNS_FOLLOW", resourceId: "follow-residual-1", action: "sns.follow.create", capability: "sns.follow.create" }), authorizationProofResolver: resolver });
  assert(follow.ok, "bound Follow Proof should pass");

  const read = resolveSnsRead({ visibility: "PUBLIC", resourceId: "post-residual-1", resourceStatus: "PUBLISHED", authorizationProof: proof({ resourceType: "SNS_READ", resourceId: "other-post", action: "sns.read", capability: "sns.read" }), authorizationProofResolver: resolver });
  assert(!read.ok, "SNS read must reject Proof reuse across resources");
  assert(!resolveSnsRead({ visibility: "PUBLIC", resourceId: "post-residual-1", resourceStatus: "PUBLISHED", authorizationProof: { ...postProof, policyVersion: "unknown-policy-v99", resourceType: "SNS_READ", action: "sns.read", capability: "sns.read" }, authorizationProofResolver: resolver }).ok, "SNS read must reject unknown policy");

  assert(!createSnsCoreCard({ cardId: "card-residual-fake" as never, cardType: "PUBLIC_PROJECT", resourceId: "project-residual-1", publicPresentationReference: "/projects/project-residual-1", snapshotPolicy: { price: "OMITTED", availability: "LIVE", creator: "LIVE", preview: "LIVE" }, authorizationProofResolver: resolver, approvedPublicResource: true, currentVisibility: "PUBLIC" }).ok, "legacy Boolean omission must fail closed");
  assert(post.value.captionHash.length === 64, "SNS caption hash must remain bounded");
});

Deno.test("FP-001 residual Admin/Moderation authorities reject fake caller Proofs", () => {
  const moderation = createWp240ModerationReference({
    moderationId: "moderation-residual-1",
    targetType: "POST",
    targetReference: "post-residual-1",
    action: "REPORT",
    reasonCode: "SPAM",
    authorizationProof: proof({ principalId: "moderator-1", resourceType: "MODERATION_REFERENCE", resourceId: "moderation-residual-1", action: "moderation.reference.create", capability: "moderation.reference.create" }),
    authorizationProofResolver: resolver,
  });
  assert(moderation.ok, "bound WP-240 Moderation Proof should pass");
  expectDenied(createWp240ModerationReference({ moderationId: "moderation-residual-2", targetType: "POST", targetReference: "post-residual-1", action: "HIDE", reasonCode: "POLICY", authorizationProof: { ...moderation.value.authorizationProof, resourceId: "other-moderation" }, authorizationProofResolver: deniedResolver }), "WP-240 fake Moderation Proof");

  const audit = createWp250AdminAuditReference({
    auditId: "audit-residual-1",
    actorReference: "admin-1",
    permission: "ADMIN_PROJECTION_READ",
    operation: "VIEW_PROJECTION",
    targetReference: "projection-1",
    reasonCode: "REVIEW",
    authorizationProof: proof({ principalId: "admin-1", resourceType: "ADMIN_AUDIT", resourceId: "audit-residual-1", action: "admin.audit.record", capability: "ADMIN_PROJECTION_READ" }),
    authorizationProofResolver: resolver,
  });
  assert(audit.ok, "bound Admin audit Proof should pass");

  const moderationCase = createWp250ModerationCase({
    caseId: "case-residual-1",
    targetReference: "post-residual-1",
    action: "REMOVE",
    reasonCode: "POLICY",
    evidenceReferences: ["evidence-residual-1"],
    authorizationProof: proof({ principalId: "reporter-1", resourceType: "MODERATION_CASE", resourceId: "case-residual-1", action: "moderation.case.create", capability: "moderation.case.create" }),
    authorizationProofResolver: resolver,
  });
  assert(moderationCase.ok, "bound Moderation Case Proof should pass");
  assert(!createWp250ModerationDecision({ decisionId: "decision-residual-1", moderationCase: moderationCase.value, action: "REMOVE", authorizationProof: { ...moderationCase.value.authorizationProof, resourceId: "other-decision" }, authorizationProofResolver: resolver }).ok, "Moderation Decision must reject Proof reuse");
  const decision = createWp250ModerationDecision({ decisionId: "decision-residual-2", moderationCase: moderationCase.value, action: "REMOVE", authorizationProof: proof({ principalId: "moderator-1", resourceType: "MODERATION_DECISION", resourceId: "decision-residual-2", action: "moderation.decision.create", capability: "moderation.decision.create" }), authorizationProofResolver: resolver });
  assert(decision.ok, "bound Moderation Decision Proof should pass");
});
