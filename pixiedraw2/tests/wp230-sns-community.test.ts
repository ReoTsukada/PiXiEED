import {
  applySnsRollbackPlan,
  asSnsContentHash,
  auditSafeSnsSummary,
  createSnsComment,
  createSnsCommunity,
  createSnsCoreCard,
  createSnsCreatorPage,
  createSnsFollow,
  createSnsMarketCardReference,
  createSnsMention,
  createSnsMembership,
  createSnsMyPage,
  createSnsNotificationReference,
  createSnsPost,
  createSnsProjectPage,
  createSnsReaction,
  createSnsPublicUrlCandidate,
  createSnsRollbackPlan,
  createSnsTrustedEvent,
  DEFAULT_WP230_FEATURE_FLAGS,
  reconcileSnsFollow,
  reconcileSnsPost,
  reconcileSnsReaction,
  resolveSnsCoreCard,
  resolveSnsRead,
  resolveSnsSearchEligibility,
  snsFeatureEnabled,
  transitionSnsPost,
  type SnsPost,
} from "../src/wp230-sns-community-core.ts";
import { asSha256 } from "../src/wp160-contracts.ts";
import type { AuthorizationProofResolver, AuthorizationProofV1 } from "../src/wp160-contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const HASH_A = asSha256("a".repeat(64));
const HASH_B = asSha256("b".repeat(64));

const AUTH_ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const AUTH_EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString();

function authFor(resourceType: string, resourceId: string, principalId: string | null, action: string) {
  const createProof = (expected: { readonly principalId?: string | null; readonly resourceType?: string; readonly resourceId?: string; readonly action?: string; readonly capability?: string; readonly tenantId?: string | null; readonly correlationId?: string | null; readonly policyVersion?: string }): AuthorizationProofV1 => ({
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "server-authority-fp003z-test",
    proofId: `proof:${expected.resourceId ?? resourceId}`,
    principalId: expected.principalId ?? null,
    resourceType: expected.resourceType ?? resourceType,
    resourceId: expected.resourceId ?? resourceId,
    action: expected.action ?? action,
    capability: expected.capability ?? expected.action ?? action,
    tenantId: expected.tenantId ?? "tenant-test",
    correlationId: expected.correlationId ?? "correlation-fp003z-test",
    policyVersion: expected.policyVersion ?? "authorization-policy-v1",
    grantId: "grant-fp003z-test",
    issuedAt: AUTH_ISSUED_AT,
    expiresAt: AUTH_EXPIRES_AT,
  });
  const expected = { principalId, resourceType, resourceId, action, capability: action, tenantId: "tenant-test", correlationId: "correlation-fp003z-test", policyVersion: "authorization-policy-v1" };
  const authorizationProofResolver: AuthorizationProofResolver = ({ expected: resolved }) => createProof(resolved);
  return { authorizationProof: createProof(expected), authorizationProofResolver };
}

function cardFixture(overrides: Partial<Parameters<typeof createSnsCoreCard>[0]> = {}) {
  const base: Parameters<typeof createSnsCoreCard>[0] = {
    cardId: "card-synthetic-1" as never,
    cardType: "COMPLETED_WORK",
    resourceId: "asset-1",
    publicPresentationReference: "/work/asset-1",
    snapshotPolicy: { price: "OMITTED", availability: "LIVE", creator: "LIVE", preview: "LIVE" },
    approvedPublicResource: true,
    currentVisibility: "PUBLIC",
    ...overrides,
  };
  const result = createSnsCoreCard({ ...base, ...authFor("SNS_CORE_CARD", base.cardId as string, null, "sns.core-card.create") });
  assert(result.ok, "synthetic Core Card must be valid");
  return result.value;
}

async function postFixture(overrides: Partial<Parameters<typeof createSnsPost>[0]> = {}): Promise<SnsPost> {
  const base: Parameters<typeof createSnsPost>[0] = {
    postId: "post-synthetic-1" as never,
    shareCommandId: "share-synthetic-1" as never,
    creatorId: "creator-1",
    sourceAccountId: "account-1",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "Shared Asset",
    references: [{ kind: "ASSET_REVISION", referenceId: "revision-1", revisionHash: HASH_A }],
    cards: [cardFixture()],
    publicPath: "/post/post-synthetic-1",
    explicitShare: true,
    ...overrides,
  };
  const result = await createSnsPost({ ...base, ...authFor("SNS_POST", base.postId as string, base.creatorId, "sns.post.create") });
  assert(result.ok, "synthetic Post must be valid");
  return result.value;
}

Deno.test("WP-230 explicit Share creates a Post, preserves lifecycle, and separates Comment", async () => {
  const post = await postFixture();
  assert(post.explicitShare && post.status === "PUBLISHED" && post.references[0]?.revisionHash === HASH_A, "Post must use an explicit share and Core reference");
  const hidden = transitionSnsPost(post, "HIDE");
  assert(hidden.ok && hidden.value.status === "HIDDEN", "Post hide must be explicit");
  const comment = await createSnsComment({ commentId: "comment-1" as never, post, actorAccountId: "account-2", text: "Nice!", ...authFor("SNS_COMMENT", "comment-1", "account-2", "sns.comment.create") });
  assert(comment.ok && comment.value.postId === post.postId && comment.value.status === "VISIBLE", "Comment must remain Post-scoped and separate");
  const automatic = await createSnsPost({
    postId: "post-automatic" as never,
    shareCommandId: "share-automatic" as never,
    creatorId: "creator-1",
    sourceAccountId: "account-1",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "Automatic",
    references: [{ kind: "ASSET_REVISION", referenceId: "revision-1", revisionHash: HASH_A }],
    explicitShare: false,
    ...authFor("SNS_POST", "post-automatic", "creator-1", "sns.post.create"),
  });
  assert(!automatic.ok && automatic.diagnostics.some((item) => item.code === "SHARE_COMMAND_REQUIRED"), "automatic Event-to-Post publication must fail closed");
});

Deno.test("WP-230 visibility, URL, and permission fail closed", async () => {
  const privatePost = await postFixture({ postId: "private-post" as never, visibility: "CREATOR_PRIVATE" });
  const denied = resolveSnsRead({ visibility: privatePost.visibility, resourceId: privatePost.postId, resourceStatus: "PUBLISHED", ...authFor("SNS_READ", privatePost.postId, null, "sns.read") });
  assert(!denied.ok && denied.decision === "DENY", "client or denied permission cannot read private Post");
  const allowed = resolveSnsRead({ visibility: "PUBLIC", resourceId: "public-post", resourceStatus: "PUBLISHED", ...authFor("SNS_READ", "public-post", null, "sns.read") });
  assert(allowed.ok, "server-approved public read must pass");
  const unsafe = createSnsPublicUrlCandidate({ resourceType: "POST", resourceId: privatePost.postId, path: "javascript:bad", visibility: "PUBLIC", resourceStatus: "PUBLISHED", ...authFor("SNS_PUBLIC_URL", privatePost.postId, null, "sns.public-url.resolve") });
  assert(!unsafe.ok, "unsafe URL candidate must fail closed");
});

Deno.test("WP-230 Follow, Reaction, and Mention are idempotent and conflict-safe", async () => {
  const post = await postFixture();
  const follow = await createSnsFollow({ followId: "follow-1" as never, followerAccountId: "account-2", creatorId: "creator-1", ...authFor("SNS_FOLLOW", "follow-1", "account-2", "sns.follow.create") });
  assert(follow.ok, "valid Follow must pass");
  const duplicateFollow = reconcileSnsFollow(follow.value, follow.value);
  assert(duplicateFollow.ok && duplicateFollow.diagnostics.some((item) => item.metadata?.idempotent === true), "duplicate Follow must be a no-op");
  const conflictingFollow = await createSnsFollow({ followId: "follow-1" as never, followerAccountId: "account-3", creatorId: "creator-1", ...authFor("SNS_FOLLOW", "follow-1", "account-3", "sns.follow.create") });
  assert(conflictingFollow.ok && !reconcileSnsFollow(follow.value, conflictingFollow.value).ok, "conflicting Follow identity must fail");
  const reaction = await createSnsReaction({ reactionId: "reaction-1" as never, post, actorAccountId: "account-2", type: "LIKE", intentHash: HASH_A, ...authFor("SNS_REACTION", "reaction-1", "account-2", "sns.reaction.create") });
  assert(reaction.ok, "valid Reaction must pass");
  assert(reconcileSnsReaction(reaction.value, reaction.value).ok, "duplicate Reaction must be idempotent");
  const mention = createSnsMention({ mentionId: "mention-1" as never, sourceKind: "POST", sourceId: post.postId, targetCreatorId: "creator-2", actorAccountId: "account-1", ...authFor("SNS_MENTION", "mention-1", "account-1", "sns.mention.create") });
  assert(mention.ok && mention.value.status === "ACTIVE", "Mention must reference a resolved Creator");
  const selfFollow = await createSnsFollow({ followId: "follow-self" as never, followerAccountId: "creator-1", creatorId: "creator-1", ...authFor("SNS_FOLLOW", "follow-self", "creator-1", "sns.follow.create") });
  assert(!selfFollow.ok && selfFollow.diagnostics.some((item) => item.code === "SELF_FOLLOW_REJECTED"), "self Follow must fail closed");
});

Deno.test("WP-230 Community, Creator Page, and My Page keep scoped identities", async () => {
  const community = createSnsCommunity({ communityId: "community-1" as never, ownerCreatorId: "creator-1", name: "Pixel Community", visibility: "PUBLIC", ...authFor("SNS_COMMUNITY", "community-1", "creator-1", "sns.community.create") });
  assert(community.ok, "Community must be valid");
  const membership = createSnsMembership({ membershipId: "membership-1" as never, community: community.value, memberAccountId: "account-2", role: "MEMBER", ...authFor("SNS_MEMBERSHIP", "membership-1", "account-2", "sns.membership.create") });
  assert(membership.ok && membership.value.communityId === community.value.communityId, "Membership must be Community-scoped");
  const creatorPage = createSnsCreatorPage({ pageId: "creator-page-1" as never, creatorId: "creator-1", displayName: "Creator", bio: "Pixel maker", publicPath: "/creator/creator-1", visibility: "PUBLIC", ...authFor("SNS_CREATOR_PAGE", "creator-page-1", "creator-1", "sns.creator-page.create") });
  assert(creatorPage.ok, "Creator Page must be valid");
  const projectPage = createSnsProjectPage({ pageId: "project-page-1" as never, projectId: "project-1", ownerAccountId: "account-1", title: "Pixel Project", summary: "A bounded project summary", assetReferences: ["asset-1"], publicPath: "/project/project-1", visibility: "PUBLIC", ...authFor("SNS_PROJECT_PAGE", "project-page-1", "account-1", "sns.project-page.create") });
  assert(projectPage.ok && projectPage.value.containsProjectBody === false, "Project Page must reference a Project without copying its body");
  const myPage = createSnsMyPage({ pageId: "my-page-1" as never, ownerAccountId: "account-1", creatorId: "creator-1", postIds: ["post-1" as never], communityIds: ["community-1" as never], ...authFor("SNS_MY_PAGE", "my-page-1", "account-1", "sns.my-page.create") });
  assert(myPage.ok && myPage.value.hasPrivateData === false && myPage.value.visibility === "OWNER_ONLY", "My Page must be owner-scoped without private body data");
  const forbidden = createSnsCreatorPage({ pageId: "creator-page-2" as never, creatorId: "creator-1", displayName: "Creator", publicPath: "/creator/creator-1", visibility: "PUBLIC", ...authFor("SNS_CREATOR_PAGE", "creator-page-2", "creator-1", "sns.creator-page.create"), email: "private@example.invalid" } as never);
  assert(!forbidden.ok && forbidden.diagnostics.some((item) => item.code === "FORBIDDEN_PRIVATE_DATA"), "private profile fields must be rejected");
});

Deno.test("WP-230 Market Card references existing commerce without creating commerce", async () => {
  const post = await postFixture({ postId: "market-post" as never, kind: "MARKET_CARD" });
  const card = createSnsMarketCardReference({ cardId: "card-1" as never, post, marketProductId: "product-existing-1", packageId: "package-existing-1", packageContentHash: HASH_B, preservedPath: "/market/items/product-existing-1", existingLockedProduct: true, ...authFor("SNS_MARKET_CARD", "card-1", post.creatorId, "sns.market-card.create") });
  assert(card.ok && card.value.createsProduct === false && card.value.createsPurchase === false && card.value.createsLicense === false && card.value.coreCard.snapshotPolicy.price === "LIVE", "Market Card must be reference-only with explicit live/snapshot policy");
  const unverified = createSnsMarketCardReference({ cardId: "card-2" as never, post, marketProductId: "product-existing-1", packageId: "package-existing-1", packageContentHash: HASH_B, preservedPath: "/market/items/product-existing-1", existingLockedProduct: false, ...authFor("SNS_MARKET_CARD", "card-2", post.creatorId, "sns.market-card.create") });
  assert(!unverified.ok && unverified.diagnostics.some((item) => item.code === "MARKET_REFERENCE_REQUIRED"), "unverified Market Product must fail closed");
});

Deno.test("WP-230 Event and Notification adapters are trusted, bounded, and non-rollback", async () => {
  const event = await createSnsTrustedEvent({ eventId: "event-1" as never, eventType: "POST_PUBLISHED", aggregateId: "post-1", aggregateVersion: 1, actorReference: "creator-1", objectReference: "post-1", visibility: "PUBLIC", presentationKey: "sns.post.published", producerProof: authFor("SNS_EVENT", "post-1", "creator-1", "sns.event.create").authorizationProof, authorizationProofResolver: authFor("SNS_EVENT", "post-1", "creator-1", "sns.event.create").authorizationProofResolver, safeMetadata: { kind: "ASSET_SHARE" } });
  assert(event.ok, "trusted Event must pass");
  const notificationAuth = authFor("SNS_RECIPIENT", "account-2", "account-2", "sns.notification.resolve");
  const notification = createSnsNotificationReference({ referenceId: "notification-ref-1" as never, event: event.value, recipientAccountId: "account-2", recipientProof: notificationAuth.authorizationProof, authorizationProofResolver: notificationAuth.authorizationProofResolver });
  assert(notification.ok && notification.value.containsBody === false && notification.value.deliveryFailureRollsBackCanonicalState === false, "Notification must contain safe references only");
  const fakeProducer = authFor("SNS_EVENT", "post-1", "creator-1", "sns.event.create");
  const untrusted = await createSnsTrustedEvent({ eventId: "event-2" as never, eventType: "POST_PUBLISHED", aggregateId: "post-1", aggregateVersion: 1, actorReference: "creator-1", objectReference: "post-1", visibility: "PUBLIC", presentationKey: "sns.post.published", producerProof: { ...fakeProducer.authorizationProof, decision: "deny" }, authorizationProofResolver: fakeProducer.authorizationProofResolver });
  assert(!untrusted.ok && untrusted.diagnostics.some((item) => item.code === "EVENT_NOT_TRUSTED"), "untrusted Event producer must fail closed");
});

Deno.test("WP-230 flags, rollback, and audit summary fail closed", async () => {
  const disabled = snsFeatureEnabled(DEFAULT_WP230_FEATURE_FLAGS, "sns-write", false);
  assert(!disabled.ok && disabled.diagnostics.some((item) => item.code === "FEATURE_DISABLED"), "SNS flags must default off");
  const unknown = snsFeatureEnabled({}, "unknown-sns-flag", false);
  assert(!unknown.ok && unknown.diagnostics.some((item) => item.code === "UNKNOWN_FLAG"), "unknown SNS flag must fail closed");
  const kill = snsFeatureEnabled({ "sns-write": true }, "sns-write", true);
  assert(!kill.ok && kill.diagnostics.some((item) => item.code === "KILL_SWITCH_ACTIVE"), "kill switch must win");
  const current = { postCount: 2, commentCount: 3, followCount: 1, reactionCount: 4, mentionCount: 1, communityCount: 1, marketCardCount: 1 } as const;
  const restore = { ...current, postCount: 1 };
  const plan = await createSnsRollbackPlan(current, restore);
  const applied = applySnsRollbackPlan(plan, plan.fromSnapshotHash);
  assert(applied.ok && applied.value.postCount === 1, "valid rollback must restore local shadow state");
  assert(!applySnsRollbackPlan(plan, HASH_A).ok, "rollback with mismatched snapshot must fail");
  const summary = auditSafeSnsSummary({ postCount: current.postCount, commentCount: current.commentCount, marketCardCount: current.marketCardCount });
  assert(summary.hasSensitiveFields === false && summary.productionMutation === false, "audit summary must exclude sensitive data and mutation");
  assert(asSnsContentHash(HASH_A) === HASH_A, "content hash adapter must preserve SHA-256 identity");
});

Deno.test("WP-230 content finalization rejects raw media, enforces Core Cards, and preserves idempotent Share", async () => {
  const rawMedia = await createSnsPost({
    postId: "raw-media-post" as never,
    shareCommandId: "raw-media-share" as never,
    creatorId: "creator-1",
    sourceAccountId: "account-1",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "raw",
    references: [],
    explicitShare: true,
    ...authFor("SNS_POST", "final-share", "creator-1", "sns.post.create"),
    rawMedia: "not-accepted" as never,
  } as never);
  assert(!rawMedia.ok && rawMedia.diagnostics.some((item) => item.code === "RAW_MEDIA_REJECTED"), "raw media must be rejected");
  const missingCard = await createSnsPost({
    postId: "missing-card-post" as never,
    shareCommandId: "missing-card-share" as never,
    creatorId: "creator-1",
    sourceAccountId: "account-1",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "missing card",
    references: [{ kind: "ASSET", referenceId: "asset-1" }],
    explicitShare: true,
    ...authFor("SNS_POST", "missing-card-post", "creator-1", "sns.post.create"),
  });
  assert(!missingCard.ok && missingCard.diagnostics.some((item) => item.code === "CORE_CARD_REQUIRED"), "resource share must require a Core Card");
  const post = await postFixture({ shareCommandId: "final-share" as never });
  const duplicate = reconcileSnsPost(post, post);
  assert(duplicate.ok && duplicate.diagnostics.some((item) => item.metadata?.idempotent === true), "duplicate Share must be idempotent");
  const conflicting = await postFixture({ shareCommandId: "final-share" as never, caption: "changed" });
  assert(!reconcileSnsPost(post, conflicting).ok, "same Share ID with different content must fail");
  const deniedPostAuth = authFor("SNS_POST", "unauthorized-share", "creator-1", "sns.post.create");
  const unauthorized = await createSnsPost({ ...({
    postId: "unauthorized-share" as never,
    shareCommandId: "unauthorized-command" as never,
    creatorId: "creator-1",
    sourceAccountId: "account-1",
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "unauthorized",
    references: [],
    explicitShare: true,
    ...deniedPostAuth,
    authorizationProof: { ...deniedPostAuth.authorizationProof, decision: "deny" },
  }), cards: [] });
  assert(!unauthorized.ok && unauthorized.diagnostics.some((item) => item.code === "PERMISSION_DENIED"), "unauthorized Share must fail");
});

Deno.test("WP-230 content finalization hides stale cards and gates Search", () => {
  const card = cardFixture({ cardId: "final-card" as never });
  for (const currentStatus of ["PRIVATE", "DELETED", "TRASHED", "QUARANTINED", "UNPUBLISHED"] as const) {
    const cardAuth = authFor("SNS_CORE_CARD", card.cardId, null, "sns.core-card.read");
    const resolved = resolveSnsCoreCard({ card, currentVisibility: currentStatus === "PRIVATE" ? "CREATOR_PRIVATE" : "PUBLIC", currentStatus, currentModeration: currentStatus === "QUARANTINED" ? "RESTRICTED" : "APPROVED", ...cardAuth });
    assert(resolved.status === "CONTENT_UNAVAILABLE" && resolved.card === undefined && resolved.placeholder === "CONTENT_UNAVAILABLE", `${currentStatus} card must fail closed without stale presentation data`);
  }
  const allowedAuth = authFor("SNS_CORE_CARD", card.cardId, null, "sns.core-card.read");
  const allowed = resolveSnsCoreCard({ card, currentVisibility: "PUBLIC", currentStatus: "PUBLISHED", currentModeration: "APPROVED", ...allowedAuth });
  assert(allowed.status === "AVAILABLE" && allowed.card?.publicPresentationReference === "/work/asset-1", "current public card must resolve");
  const searchableAuth = authFor("SNS_SEARCH_INDEX", card.resourceId, null, "sns.search.index");
  const searchable = resolveSnsSearchEligibility({ card, explicitPublished: true, currentVisibility: "PUBLIC", currentStatus: "PUBLISHED", currentModeration: "APPROVED", ...searchableAuth });
  assert(searchable.indexable && searchable.reason === "PUBLIC_PUBLISHED_APPROVED", "only public published approved cards are searchable");
  const privateSearch = resolveSnsSearchEligibility({ card, explicitPublished: true, currentVisibility: "PRIVATE", currentStatus: "PUBLISHED", currentModeration: "APPROVED" });
  assert(!privateSearch.indexable && privateSearch.reason === "NOT_PUBLIC", "private cards must not enter Search");
});

Deno.test("WP-230 content finalization keeps comments plain text and rejects commerce mutation", async () => {
  const post = await postFixture();
  const html = await createSnsComment({ commentId: "html-comment" as never, post, actorAccountId: "account-2", text: "<script>alert(1)</script>", ...authFor("SNS_COMMENT", "html-comment", "account-2", "sns.comment.create") });
  assert(!html.ok && html.diagnostics.some((item) => item.code === "UNSAFE_MARKUP_REJECTED"), "raw HTML/script must be rejected from comments");
  const commerce = await createSnsPost({ ...({
    postId: "commerce-post" as never,
    shareCommandId: "commerce-share" as never,
    creatorId: "creator-1",
    sourceAccountId: "account-1",
    kind: "MARKET_CARD",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "reference only",
    references: [],
    explicitShare: true,
    ...authFor("SNS_POST", "commerce-post", "creator-1", "sns.post.create"),
  }), cards: [], purchaseId: "purchase-mutation" } as never);
  assert(!commerce.ok && commerce.diagnostics.some((item) => item.code === "COMMERCE_MUTATION_REJECTED"), "Purchase/Entitlement mutation must remain outside Social");
});
