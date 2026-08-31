import { deepStrictEqual, equal, ok } from "node:assert/strict";
import {
  asSha256,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofExpectation,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
} from "../../src/wp160-contracts.ts";
import {
  applySocial430RollbackPlan,
  asSocial430ContentHash,
  auditSafeSocial430Payload,
  createSocial430RollbackPlan,
  DEFAULT_SOCIAL430_FEATURE_FLAGS,
  reconcileSocial430Follow,
  reconcileSocial430Post,
  reconcileSocial430Reaction,
  resolveSocial430PresentationState,
  type Social430CoreCard,
  social430FeatureEnabled,
  type Social430Post,
  transitionSocial430Post,
} from "../../src/platform/social-430/composition.ts";
import {
  createSocial430ServerComposition,
  type Social430ServerComposition,
} from "../../src/platform/social-430/event-adapter.ts";

const TENANT = "tenant:social430";
const OTHER_TENANT = "tenant:other";
const CREATOR = "creator:social430";
const ACCOUNT = "account:social430";
const HASH_A = asSha256("a".repeat(64));
const HASH_B = asSha256("b".repeat(64));

// Repository-bound preflight case/reason-code anchors.  These are fixed
// synthetic invalid-input cases; they do not execute a provider or accept
// caller-supplied authority.  Keep the identifiers stable for the static
// preflight result artifact.
const SOCIAL430_PREFLIGHT_CASES = [
  ["AUTHORITY-ROOT-001", "CALLER_INJECTION_REJECTED"],
  ["RESOLVER-IDENTITY-001", "CANONICAL_IDENTITY_MISMATCH"],
  ["CALLER-STATE-001", "CALLER_STATE_NOT_AUTHORITY"],
  ["EVENT-ID-001", "CANONICAL_EVENT_ID_REQUIRED"],
  ["REPLAY-REVOKE-001", "LIFECYCLE_TRANSITION_NOT_AUTHORIZED"],
] as const;

const SOCIAL430_SERVER_ONLY_PATH =
  /platform\/social-430\/(?:event-adapter|authority-internal|server-composition-root)\.ts/u;

type ResourceStateOverrides = Partial<{
  visibility:
    | "PUBLIC"
    | "UNLISTED"
    | "PROJECT_MEMBERS"
    | "CREATOR_PRIVATE"
    | "PRIVATE";
  lifecycle:
    | "ACTIVE"
    | "PUBLISHED"
    | "PRIVATE"
    | "DELETED"
    | "TRASHED"
    | "QUARANTINED"
    | "UNPUBLISHED"
    | "HIDDEN"
    | "ARCHIVED";
  moderation: "APPROVED" | "PENDING" | "HIDDEN" | "REMOVED" | "RESTRICTED";
}>;

function resourcePath(resourceId: string): string {
  if (resourceId === "product:existing") return "/market/items/existing";
  if (resourceId === "asset:social430") return "/work/asset-social430";
  return `/${resourceId.replaceAll(":", "/")}`;
}

function authorityFor(
  overrides: Readonly<Record<string, ResourceStateOverrides>> = {},
  marketLocked = true,
  recordVersion = 1,
) {
  return createSocial430ServerComposition({
    authorizationResolver: ({ expected }) => proof(expected),
    resolveResource: ({ tenantId, resourceId, resourceType, cardType }) => {
      if (tenantId !== TENANT) return null;
      const current = overrides[resourceId] ?? {};
      return {
        tenantId,
        resourceId,
        resourceType: resourceType ?? cardType ?? "SOCIAL430_RESOURCE",
        ...(cardType === undefined ? {} : { cardType }),
        publicPresentationReference: resourcePath(resourceId),
        visibility: current.visibility ?? "PUBLIC",
        lifecycle: current.lifecycle ?? "PUBLISHED",
        moderation: current.moderation ?? "APPROVED",
        recordVersion,
        revisionHash: HASH_A,
        contentHash: resourceId === "product:existing" ? HASH_B : HASH_A,
      };
    },
    resolveMarketReference: ({ tenantId, marketProductId, packageId }) =>
      tenantId === TENANT && marketProductId === "product:existing" &&
        packageId === "package:existing"
        ? {
          tenantId,
          marketProductId,
          packageId,
          packageContentHash: HASH_B,
          preservedPath: "/market/items/existing",
          locked: marketLocked,
          visibility: "PUBLIC",
          lifecycle: "PUBLISHED",
          moderation: "APPROVED",
          recordVersion: 1,
        }
        : null,
    resolveMembership: ({ tenantId }) =>
      tenantId === TENANT ? { allowed: true, role: "MEMBER" } : null,
  });
}

const AUTHORITY = authorityFor();

Deno.test("SOCIAL-430 public contract boundary and preflight anchors", async () => {
  const publicSource = await Deno.readTextFile(
    new URL("../../src/platform/social-430/contracts.ts", import.meta.url),
  );
  const rootSource = await Deno.readTextFile(
    new URL(
      "../../src/platform/social-430/server-composition-root.ts",
      import.meta.url,
    ),
  );
  ok(!publicSource.includes("event-adapter.ts"));
  ok(!publicSource.includes("authority-internal.ts"));
  ok(
    !/export\s+(?:async\s+)?(?:function|class)\s+(?:createSocial430Server|Social430ServerCapability|Social430AuthorityAdapter)/u
      .test(publicSource),
  );
  ok(
    !/export\s*\{[^}]*\b(?:createSocial430ServerComposition|createSocial430Authority)\b[^}]*\}/su
      .test(publicSource),
  );
  ok(!/^\s*export\b/mu.test(rootSource));
  const rootModule = await import(
    new URL(
      "../../src/platform/social-430/server-composition-root.ts",
      import.meta.url,
    )
      .href
  );
  deepStrictEqual(Object.keys(rootModule), []);

  const denoConfig = JSON.parse(
    await Deno.readTextFile(new URL("../../deno.json", import.meta.url)),
  ) as { readonly tasks?: Readonly<Record<string, unknown>> };
  const browserBuildSources = new Set<string>();
  for (const command of Object.values(denoConfig.tasks ?? {})) {
    if (
      typeof command !== "string" ||
      !command.includes("deno bundle --platform browser")
    ) continue;
    const source = command.match(/\b(src\/[^\s]+\.ts)\b/u)?.[1];
    if (source !== undefined) browserBuildSources.add(source);
  }
  ok(browserBuildSources.size > 0);
  for (const sourcePath of browserBuildSources) {
    const source = await Deno.readTextFile(
      new URL(`../../${sourcePath}`, import.meta.url),
    );
    ok(!SOCIAL430_SERVER_ONLY_PATH.test(source), sourcePath);
  }
  equal(SOCIAL430_PREFLIGHT_CASES.length, 5);
  for (const [caseId, reasonCode] of SOCIAL430_PREFLIGHT_CASES) {
    ok(caseId.endsWith("-001"));
    ok(reasonCode.length > 0);
  }
});

const createSocial430CoreCard = (
  input: Parameters<Social430ServerComposition["createSocial430CoreCard"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430CoreCard(input);
const createSocial430Post = (
  input: Parameters<Social430ServerComposition["createSocial430Post"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430Post(input);
const createSocial430Comment = (
  input: Parameters<Social430ServerComposition["createSocial430Comment"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430Comment(input);
const createSocial430Follow = (
  input: Parameters<Social430ServerComposition["createSocial430Follow"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430Follow(input);
const createSocial430Reaction = (
  input: Parameters<Social430ServerComposition["createSocial430Reaction"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430Reaction(input);
const createSocial430Mention = (
  input: Parameters<Social430ServerComposition["createSocial430Mention"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430Mention(input);
const createSocial430Community = (
  input: Parameters<Social430ServerComposition["createSocial430Community"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430Community(input);
const createSocial430Membership = (
  input: Parameters<Social430ServerComposition["createSocial430Membership"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430Membership(input);
const createSocial430CreatorPage = (
  input: Parameters<
    Social430ServerComposition["createSocial430CreatorPage"]
  >[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430CreatorPage(input);
const createSocial430ProjectPage = (
  input: Parameters<
    Social430ServerComposition["createSocial430ProjectPage"]
  >[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430ProjectPage(input);
const createSocial430MyPage = (
  input: Parameters<Social430ServerComposition["createSocial430MyPage"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430MyPage(input);
const createSocial430MarketCardReference = (
  input: Parameters<
    Social430ServerComposition["createSocial430MarketCardReference"]
  >[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430MarketCardReference(input);
const resolveSocial430Read = (
  input: Parameters<Social430ServerComposition["resolveSocial430Read"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.resolveSocial430Read(input);
const resolveSocial430CoreCard = (
  input: Parameters<Social430ServerComposition["resolveSocial430CoreCard"]>[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.resolveSocial430CoreCard(input);
const resolveSocial430SearchEligibility = (
  input: Parameters<
    Social430ServerComposition["resolveSocial430SearchEligibility"]
  >[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.resolveSocial430SearchEligibility(input);
const createSocial430TrustedEvent = (
  input: Parameters<
    Social430ServerComposition["createSocial430TrustedEvent"]
  >[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430TrustedEvent(input);
const createSocial430NotificationReference = (
  input: Parameters<
    Social430ServerComposition["createSocial430NotificationReference"]
  >[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430NotificationReference(input);
const createSocial430PublicUrlCandidate = (
  input: Parameters<
    Social430ServerComposition["createSocial430PublicUrlCandidate"]
  >[0],
  composition: Social430ServerComposition = AUTHORITY,
) => composition.createSocial430PublicUrlCandidate(input);

function proof(
  expected: AuthorizationProofExpectation,
  overrides: Partial<AuthorizationProofV1> = {},
): AuthorizationProofV1 {
  const now = Date.now();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "social430-test-server",
    proofId: `proof:${expected.resourceType ?? "social"}:${
      expected.resourceId ?? "resource"
    }`,
    principalId: expected.principalId ?? null,
    resourceType: expected.resourceType ?? "SOCIAL430_TEST",
    resourceId: expected.resourceId ?? "resource:social430",
    action: expected.action ?? "social430.test",
    capability: expected.capability ?? expected.action ?? "social430.test",
    tenantId: expected.tenantId ?? TENANT,
    correlationId: expected.correlationId ?? "correlation:social430",
    policyVersion: expected.policyVersion ?? AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId: "grant:social430:test",
    issuedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 300_000).toISOString(),
    ...overrides,
  };
}

function auth(
  expected: AuthorizationProofExpectation,
  overrides: Partial<AuthorizationProofV1> = {},
) {
  return { authorizationProof: proof(expected, overrides) };
}

function cardFixture(
  overrides: Partial<Parameters<typeof createSocial430CoreCard>[0]> = {},
): Social430CoreCard {
  const base: Parameters<typeof createSocial430CoreCard>[0] = {
    cardId: "card:social430" as never,
    tenantId: TENANT,
    cardType: "COMPLETED_WORK",
    resourceId: "asset:social430",
    snapshotPolicy: {
      price: "OMITTED",
      availability: "LIVE",
      creator: "LIVE",
      preview: "LIVE",
    },
    ...overrides,
  };
  const result = createSocial430CoreCard({
    ...base,
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_CORE_CARD",
      resourceId: base.cardId as string,
      action: "social430.card.create",
      capability: "social430.card.create",
      tenantId: base.tenantId,
    }),
  }, AUTHORITY);
  ok(result.ok, "synthetic Core Card must be valid");
  return result.value;
}

async function postFixture(
  overrides: Partial<Parameters<typeof createSocial430Post>[0]> = {},
): Promise<Social430Post> {
  const base: Parameters<typeof createSocial430Post>[0] = {
    postId: "post:social430" as never,
    shareCommandId: "share:social430" as never,
    tenantId: TENANT,
    creatorId: CREATOR,
    sourceAccountId: ACCOUNT,
    kind: "ASSET_SHARE",
    visibility: "PUBLIC",
    status: "PUBLISHED",
    caption: "Synthetic public work",
    references: [{
      tenantId: TENANT,
      kind: "ASSET",
      referenceId: "asset:social430",
      recordVersion: 1,
      revisionHash: HASH_A,
      contentHash: HASH_A,
    }],
    cards: [cardFixture()],
    publicPath: "/post/post-social430",
    explicitShare: true,
    ...overrides,
  };
  const result = await createSocial430Post({
    ...base,
    ...auth({
      principalId: base.creatorId,
      resourceType: "SOCIAL430_POST",
      resourceId: base.postId as string,
      action: "social430.post.create",
      capability: "social430.post.create",
      tenantId: base.tenantId,
    }),
  }, AUTHORITY);
  ok(result.ok, "synthetic Social Post must be valid");
  return result.value;
}

Deno.test("SOCIAL-430 explicit Share, Core Card, lifecycle, and idempotency", async () => {
  const post = await postFixture();
  equal(post.explicitShare, true);
  equal(post.status, "PUBLISHED");
  equal(post.cards.length, 1);
  const hidden = transitionSocial430Post(post, "HIDE");
  ok(hidden.ok && hidden.value.status === "HIDDEN");
  const restored = transitionSocial430Post(hidden.value, "PUBLISH");
  ok(restored.ok && restored.value.status === "PUBLISHED");
  const duplicate = reconcileSocial430Post(post, post);
  ok(
    duplicate.ok &&
      duplicate.diagnostics.some((item) => item.metadata?.idempotent === true),
  );
  const conflicting = await postFixture({
    shareCommandId: post.shareCommandId,
    caption: "different",
  });
  ok(!reconcileSocial430Post(post, conflicting).ok);
  const automatic = await createSocial430Post({
    ...post,
    postId: "post:automatic" as never,
    shareCommandId: "share:automatic" as never,
    explicitShare: false,
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_POST",
      resourceId: "post:automatic",
      action: "social430.post.create",
      capability: "social430.post.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    !automatic.ok &&
      automatic.diagnostics.some((item) =>
        item.code === "SHARE_COMMAND_REQUIRED"
      ),
  );
  const missingCard = await createSocial430Post({
    ...post,
    postId: "post:no-card" as never,
    shareCommandId: "share:no-card" as never,
    cards: [],
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_POST",
      resourceId: "post:no-card",
      action: "social430.post.create",
      capability: "social430.post.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    !missingCard.ok &&
      missingCard.diagnostics.some((item) =>
        item.code === "CORE_CARD_REQUIRED"
      ),
  );
});

Deno.test("SOCIAL-430 tenant and authorization attacks fail closed", async () => {
  const post = await postFixture();
  const crossTenantReference = await createSocial430Post({
    ...post,
    postId: "post:cross-tenant" as never,
    shareCommandId: "share:cross-tenant" as never,
    references: [{
      tenantId: OTHER_TENANT,
      kind: "ASSET",
      referenceId: "asset:other",
      recordVersion: 1,
      revisionHash: HASH_A,
      contentHash: HASH_A,
    }],
    cards: [],
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_POST",
      resourceId: "post:cross-tenant",
      action: "social430.post.create",
      capability: "social430.post.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    !crossTenantReference.ok &&
      crossTenantReference.diagnostics.some((item) =>
        item.code === "CROSS_TENANT_REFERENCE"
      ),
  );
  const fake = await createSocial430Post({
    ...post,
    postId: "post:fake-auth" as never,
    shareCommandId: "share:fake-auth" as never,
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_POST",
      resourceId: "post:fake-auth",
      action: "social430.post.create",
      capability: "social430.post.create",
      tenantId: OTHER_TENANT,
    }),
  }, AUTHORITY);
  ok(
    !fake.ok &&
      fake.diagnostics.some((item) => item.code === "PERMISSION_DENIED"),
  );
  const expiredProof = proof({
    principalId: CREATOR,
    resourceType: "SOCIAL430_POST",
    resourceId: "post:expired",
    action: "social430.post.create",
    capability: "social430.post.create",
    tenantId: TENANT,
  }, {
    issuedAt: new Date(Date.now() - 120_000).toISOString(),
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
  });
  const expired = await createSocial430Post({
    ...post,
    postId: "post:expired" as never,
    shareCommandId: "share:expired" as never,
    authorizationProof: expiredProof,
  }, AUTHORITY);
  ok(
    !expired.ok &&
      expired.diagnostics.some((item) => item.code === "PERMISSION_DENIED"),
  );
});

Deno.test("SOCIAL-430 server authority rejects fake resolver and private-victim Card attacks", async () => {
  const post = await postFixture();
  const privateAuthority = authorityFor({
    "asset:social430": {
      visibility: "PRIVATE",
      lifecycle: "PRIVATE",
      moderation: "PENDING",
    },
  });
  const forged = await createSocial430Post({
    ...post,
    postId: "post:private-victim" as never,
    shareCommandId: "share:private-victim" as never,
    cards: post.cards.map((card) => ({
      ...card,
      visibilityAtShare: "PUBLIC",
      moderationAtShare: "APPROVED",
      approvedAtShare: true,
      status: "APPROVED",
    })),
    authorizationProofResolver: () =>
      proof({
        principalId: CREATOR,
        resourceType: "SOCIAL430_POST",
        resourceId: "post:private-victim",
        action: "social430.post.create",
        capability: "social430.post.create",
        tenantId: TENANT,
      }),
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_POST",
      resourceId: "post:private-victim",
      action: "social430.post.create",
      capability: "social430.post.create",
      tenantId: TENANT,
    }),
  } as never, privateAuthority);
  ok(
    !forged.ok &&
      forged.diagnostics.some((item) =>
        item.code === "CONTENT_UNAVAILABLE" ||
        item.code === "PERMISSION_DENIED"
      ),
  );

  const postCard = post.cards[0]!;
  const staleCard = resolveSocial430CoreCard({
    card: postCard,
    tenantId: TENANT,
    currentVisibility: "PUBLIC",
    currentStatus: "PUBLISHED",
    currentModeration: "APPROVED",
    authorizationProofResolver: () => proof({}),
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_CORE_CARD",
      resourceId: postCard.cardId,
      action: "social430.card.read",
      capability: "social430.card.read",
      tenantId: TENANT,
    }),
  } as never, privateAuthority);
  equal(staleCard.status, "CONTENT_UNAVAILABLE");

  const staleSearch = resolveSocial430SearchEligibility({
    card: postCard,
    tenantId: TENANT,
    currentVisibility: "PUBLIC",
    currentStatus: "PUBLISHED",
    currentModeration: "APPROVED",
    authorizationProofResolver: () => proof({}),
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_SEARCH",
      resourceId: postCard.resourceId,
      action: "social430.search.index",
      capability: "social430.search.index",
      tenantId: TENANT,
    }),
  } as never, privateAuthority);
  ok(!staleSearch.indexable);
});

Deno.test("SOCIAL-430 read-time visibility, moderation, and stale Card redaction", async () => {
  const card = cardFixture();
  const available = resolveSocial430CoreCard({
    card,
    tenantId: TENANT,
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_CORE_CARD",
      resourceId: card.cardId,
      action: "social430.card.read",
      capability: "social430.card.read",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    available.status === "AVAILABLE" &&
      available.card?.publicPresentationReference ===
        card.publicPresentationReference,
  );
  for (
    const state of [
      "PRIVATE",
      "DELETED",
      "TRASHED",
      "QUARANTINED",
      "UNPUBLISHED",
    ] as const
  ) {
    const stateAuthority = authorityFor({
      [card.resourceId]: {
        visibility: state === "PRIVATE" ? "CREATOR_PRIVATE" : "PUBLIC",
        lifecycle: state,
        moderation: state === "QUARANTINED" ? "RESTRICTED" : "APPROVED",
      },
    });
    const resolved = resolveSocial430CoreCard({
      card,
      tenantId: TENANT,
      ...auth({
        principalId: null,
        resourceType: "SOCIAL430_CORE_CARD",
        resourceId: card.cardId,
        action: "social430.card.read",
        capability: "social430.card.read",
        tenantId: TENANT,
      }),
    }, stateAuthority);
    equal(resolved.status, "CONTENT_UNAVAILABLE");
    equal(resolved.card, undefined);
  }
  const privateRead = resolveSocial430Read(
    {
      tenantId: TENANT,
      resourceId: "post:private",
      ...auth({
        principalId: null,
        resourceType: "SOCIAL430_READ",
        resourceId: "post:private",
        action: "social430.read",
        capability: "social430.read",
        tenantId: TENANT,
      }),
    },
    authorityFor({
      "post:private": { visibility: "CREATOR_PRIVATE", lifecycle: "PUBLISHED" },
    }),
  );
  ok(
    !privateRead.ok &&
      privateRead.diagnostics.some((item) => item.code === "PRIVATE_RESOURCE"),
  );
  const blocked = resolveSocial430Read({
    tenantId: TENANT,
    resourceId: "post:blocked",
    blocked: true,
    requesterAccountId: ACCOUNT,
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_READ",
      resourceId: "post:blocked",
      action: "social430.read",
      capability: "social430.read",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    !blocked.ok &&
      blocked.diagnostics.some((item) => item.code === "BLOCKED_USER"),
  );

  const substitutedResourceType = createSocial430ServerComposition({
    authorizationResolver: ({ expected }) => proof(expected),
    resolveResource: ({ tenantId, resourceId, cardType }) => ({
      tenantId,
      resourceId,
      // The lookup requests the Card's canonical type.  Returning PROJECT
      // is a substituted input and must be rejected before state is used.
      resourceType: "PROJECT",
      ...(cardType === undefined ? {} : { cardType }),
      publicPresentationReference: card.publicPresentationReference,
      visibility: "PUBLIC" as const,
      lifecycle: "PUBLISHED" as const,
      moderation: "APPROVED" as const,
      recordVersion: 1,
      revisionHash: HASH_A,
      contentHash: HASH_A,
    }),
  });
  const substitutedTypeResult = resolveSocial430CoreCard({
    card,
    tenantId: TENANT,
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_CORE_CARD",
      resourceId: card.cardId,
      action: "social430.card.read",
      capability: "social430.card.read",
      tenantId: TENANT,
    }),
  }, substitutedResourceType);
  equal(substitutedTypeResult.status, "CONTENT_UNAVAILABLE");
});

Deno.test("SOCIAL-430 Community, Creator, Project, and My Page stay tenant-bound", () => {
  const communityResult = createSocial430Community({
    communityId: "community:social430" as never,
    tenantId: TENANT,
    ownerCreatorId: CREATOR,
    name: "Synthetic Community",
    visibility: "PUBLIC",
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_COMMUNITY",
      resourceId: "community:social430",
      action: "social430.community.create",
      capability: "social430.community.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(communityResult.ok && communityResult.value.status === "ACTIVE");
  const community = communityResult.ok ? communityResult.value : null;
  if (community === null) return;

  const membership = createSocial430Membership({
    membershipId: "membership:social430" as never,
    tenantId: TENANT,
    communityId: community.communityId,
    memberAccountId: ACCOUNT,
    role: "MEMBER",
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_MEMBERSHIP",
      resourceId: "membership:social430",
      action: "social430.membership.create",
      capability: "social430.membership.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(membership.ok && membership.value.communityId === community.communityId);

  const creatorPage = createSocial430CreatorPage({
    pageId: "creator-page:social430" as never,
    tenantId: TENANT,
    creatorId: CREATOR,
    displayName: "Synthetic Creator",
    bio: "Bounded public profile",
    publicPath: "/creator/synthetic",
    visibility: "PUBLIC",
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_CREATOR_PAGE",
      resourceId: "creator-page:social430",
      action: "social430.creator-page.create",
      capability: "social430.creator-page.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(creatorPage.ok && creatorPage.value.status === "ACTIVE");

  const projectPage = createSocial430ProjectPage({
    pageId: "project-page:social430" as never,
    tenantId: TENANT,
    projectId: "project:social430",
    ownerAccountId: ACCOUNT,
    title: "Synthetic Project",
    summary: "Reference-only project summary",
    assetReferences: ["asset:social430"],
    publicPath: "/project/synthetic",
    visibility: "PUBLIC",
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_PROJECT_PAGE",
      resourceId: "project-page:social430",
      action: "social430.project-page.create",
      capability: "social430.project-page.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(projectPage.ok && projectPage.value.containsProjectBody === false);

  const myPage = createSocial430MyPage({
    pageId: "my-page:social430" as never,
    tenantId: TENANT,
    ownerAccountId: ACCOUNT,
    creatorId: CREATOR,
    postIds: ["post:social430" as never],
    communityIds: [community.communityId],
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_MY_PAGE",
      resourceId: "my-page:social430",
      action: "social430.my-page.create",
      capability: "social430.my-page.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    myPage.ok &&
      myPage.value.visibility === "OWNER_ONLY" &&
      myPage.value.hasPrivateData === false,
  );

  const crossTenantMembership = createSocial430Membership({
    membershipId: "membership:cross-tenant" as never,
    tenantId: OTHER_TENANT,
    communityId: community.communityId,
    memberAccountId: ACCOUNT,
    role: "MEMBER",
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_MEMBERSHIP",
      resourceId: "membership:cross-tenant",
      action: "social430.membership.create",
      capability: "social430.membership.create",
      tenantId: OTHER_TENANT,
    }),
  }, AUTHORITY);
  ok(
    !crossTenantMembership.ok &&
      crossTenantMembership.diagnostics.some((item) =>
        item.code === "CROSS_TENANT_REFERENCE" ||
        item.code === "INVALID_STATUS"
      ),
  );
});

Deno.test("SOCIAL-430 Comment, Follow, Reaction, Mention remain separate", async () => {
  const post = await postFixture();
  const comment = await createSocial430Comment({
    commentId: "comment:social430" as never,
    tenantId: TENANT,
    post,
    actorAccountId: ACCOUNT,
    text: "Nice work",
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_COMMENT",
      resourceId: "comment:social430",
      action: "social430.comment.create",
      capability: "social430.comment.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(comment.ok && comment.value.postId === post.postId);
  const markup = await createSocial430Comment({
    commentId: "comment:html" as never,
    tenantId: TENANT,
    post,
    actorAccountId: ACCOUNT,
    text: "<script>bad</script>",
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_COMMENT",
      resourceId: "comment:html",
      action: "social430.comment.create",
      capability: "social430.comment.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    !markup.ok &&
      markup.diagnostics.some((item) => item.code === "UNSAFE_MARKUP_REJECTED"),
  );
  const follow = await createSocial430Follow({
    followId: "follow:social430" as never,
    tenantId: TENANT,
    followerAccountId: ACCOUNT,
    creatorId: CREATOR,
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_FOLLOW",
      resourceId: "follow:social430",
      action: "social430.follow.create",
      capability: "social430.follow.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(follow.ok);
  ok(reconcileSocial430Follow(follow.value, follow.value).ok);
  const self = await createSocial430Follow({
    followId: "follow:self" as never,
    tenantId: TENANT,
    followerAccountId: CREATOR,
    creatorId: CREATOR,
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_FOLLOW",
      resourceId: "follow:self",
      action: "social430.follow.create",
      capability: "social430.follow.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    !self.ok &&
      self.diagnostics.some((item) => item.code === "SELF_FOLLOW_REJECTED"),
  );
  const reaction = await createSocial430Reaction({
    reactionId: "reaction:social430" as never,
    tenantId: TENANT,
    post,
    actorAccountId: ACCOUNT,
    type: "LIKE",
    intentHash: HASH_A,
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_REACTION",
      resourceId: "reaction:social430",
      action: "social430.reaction.create",
      capability: "social430.reaction.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    reaction.ok &&
      reconcileSocial430Reaction(reaction.value, reaction.value).ok,
  );
  const mention = createSocial430Mention({
    mentionId: "mention:social430" as never,
    tenantId: TENANT,
    sourceKind: "POST",
    sourceId: post.postId,
    targetCreatorId: "creator:target",
    actorAccountId: ACCOUNT,
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_MENTION",
      resourceId: "mention:social430",
      action: "social430.mention.create",
      capability: "social430.mention.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(mention.ok && mention.value.status === "ACTIVE");
});

Deno.test("SOCIAL-430 Market Card is reference-only and never commerce state", async () => {
  const post = await postFixture({
    postId: "post:market" as never,
    shareCommandId: "share:market" as never,
    kind: "MARKET_CARD",
    references: [{
      tenantId: TENANT,
      kind: "MARKET_PRODUCT",
      referenceId: "product:existing",
      recordVersion: 1,
      revisionHash: HASH_A,
      contentHash: HASH_B,
    }],
    cards: [
      cardFixture({
        cardId: "card:market" as never,
        resourceId: "product:existing",
        cardType: "MARKET_PRODUCT",
      }),
    ],
  });
  const card = createSocial430MarketCardReference({
    cardId: "market-card:social430" as never,
    tenantId: TENANT,
    post,
    marketProductId: "product:existing",
    packageId: "package:existing",
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_MARKET_CARD",
      resourceId: "market-card:social430",
      action: "social430.market-card.create",
      capability: "social430.market-card.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(card.ok);
  equal(card.value.createsProduct, false);
  equal(card.value.createsPurchase, false);
  equal(card.value.createsEntitlement, false);
  equal(card.value.createsLicense, false);
  equal(card.value.createsRoyalty, false);
  equal(card.value.createsPayout, false);
  equal(card.value.createsLedger, false);
  const forgedMarket = createSocial430MarketCardReference({
    cardId: "market-card:forged" as never,
    tenantId: TENANT,
    post,
    marketProductId: "product:existing",
    packageId: "package:existing",
    existingLockedProduct: true,
    packageContentHash: HASH_A,
    preservedPath: "/forged-market-path",
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_MARKET_CARD",
      resourceId: "market-card:forged",
      action: "social430.market-card.create",
      capability: "social430.market-card.create",
      tenantId: TENANT,
    }),
  } as never, AUTHORITY);
  ok(
    !forgedMarket.ok &&
      forgedMarket.diagnostics.some((item) =>
        item.code === "PERMISSION_DENIED"
      ),
  );
  const unverified = createSocial430MarketCardReference({
    cardId: "market-card:unverified" as never,
    tenantId: TENANT,
    post,
    marketProductId: "product:existing",
    packageId: "package:existing",
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_MARKET_CARD",
      resourceId: "market-card:unverified",
      action: "social430.market-card.create",
      capability: "social430.market-card.create",
      tenantId: TENANT,
    }),
  }, authorityFor({}, false));
  ok(
    !unverified.ok &&
      unverified.diagnostics.some((item) =>
        item.code === "MARKET_REFERENCE_REQUIRED"
      ),
  );
});

Deno.test("SOCIAL-430 Event / Notification projection rejects stale, gap, replay, and fake recipient", async () => {
  const eventAuth = auth({
    principalId: CREATOR,
    resourceType: "SOCIAL430_EVENT",
    resourceId: "post:social430",
    action: "social430.event.create",
    capability: "social430.event.create",
    tenantId: TENANT,
  });
  const eventInput = {
    eventId: "event:social430" as never,
    tenantId: TENANT,
    eventType: "POST_PUBLISHED" as const,
    aggregateId: "post:social430",
    aggregateVersion: 1,
    actorReference: CREATOR,
    objectReference: "post:social430",
    visibility: "PUBLIC" as const,
    presentationKey: "social.post.published",
    safeMetadata: { kind: "ASSET_SHARE" },
    producerProof: eventAuth.authorizationProof,
  };
  const event = await createSocial430TrustedEvent(eventInput, AUTHORITY);
  ok(event.ok);
  const ledger = AUTHORITY.createSocial430EventProjectionLedger();
  const accepted = await ledger.accept(event.value.eventId);
  ok(accepted.ok && accepted.value === "ACCEPTED");
  const duplicate = await ledger.accept(event.value.eventId);
  ok(duplicate.ok && duplicate.value === "IDEMPOTENT");
  const fakeEvent = await ledger.accept({
    ...event.value,
    eventId: "event:fake-proof" as never,
    producerProof: { ...event.value.producerProof, tenantId: OTHER_TENANT },
  } as never);
  ok(
    !fakeEvent.ok &&
      fakeEvent.diagnostics.some((item) => item.code === "EVENT_NOT_TRUSTED"),
  );
  const tamperedComposition = createSocial430ServerComposition({
    authorizationResolver: ({ expected }) => proof(expected),
    resolveResource: ({ tenantId, resourceId }) => ({
      tenantId,
      resourceId,
      resourceType: "POST",
      publicPresentationReference: "/post/post-social430",
      visibility: "PUBLIC" as const,
      lifecycle: "PUBLISHED" as const,
      moderation: "APPROVED" as const,
      recordVersion: 1,
    }),
    resolveEvent: (eventId) =>
      eventId === event.value.eventId
        ? { ...event.value, payloadHash: HASH_B }
        : null,
  });
  const tamperedLedger = tamperedComposition
    .createSocial430EventProjectionLedger();
  const tampered = await tamperedLedger.accept(event.value.eventId);
  ok(
    !tampered.ok &&
      tampered.diagnostics.some((item) => item.code === "EVENT_NOT_TRUSTED"),
  );
  const substitutedIdComposition = createSocial430ServerComposition({
    authorizationResolver: ({ expected }) => proof(expected),
    resolveResource: ({ tenantId, resourceId }) => ({
      tenantId,
      resourceId,
      resourceType: "POST",
      publicPresentationReference: "/post/post-social430",
      visibility: "PUBLIC" as const,
      lifecycle: "PUBLISHED" as const,
      moderation: "APPROVED" as const,
      recordVersion: 1,
    }),
    resolveEvent: () => ({
      ...event.value,
      eventId: "event:substituted" as never,
    }),
  });
  const substitutedIdLedger = substitutedIdComposition
    .createSocial430EventProjectionLedger();
  const substitutedId = await substitutedIdLedger.accept(event.value.eventId);
  ok(
    !substitutedId.ok &&
      substitutedId.diagnostics.some((item) =>
        item.code === "EVENT_NOT_TRUSTED"
      ),
  );
  const gap = await createSocial430TrustedEvent({
    ...eventInput,
    eventId: "event:gap" as never,
    aggregateVersion: 3,
  }, AUTHORITY);
  ok(gap.ok && !(await ledger.accept(gap.value.eventId)).ok);
  const stale = await createSocial430TrustedEvent({
    ...eventInput,
    eventId: "event:stale" as never,
    aggregateVersion: 1,
  }, AUTHORITY);
  ok(stale.ok && !(await ledger.accept(stale.value.eventId)).ok);
  const lifecycleEvent = await createSocial430TrustedEvent({
    ...eventInput,
    eventId: "event:visibility-revoked" as never,
    eventType: "VISIBILITY_REVOKED",
    aggregateVersion: 2,
  }, AUTHORITY);
  ok(lifecycleEvent.ok);
  const forgedLifecycle = await ledger.revokeVisibility({
    tenantId: TENANT,
    aggregateId: "post:social430",
    lifecycleEventId: lifecycleEvent.value.eventId,
    lifecycleEvent: { ...lifecycleEvent.value },
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_VISIBILITY_REVOKE",
      resourceId: "post:social430",
      action: "social430.visibility.revoke",
      capability: "social430.visibility.revoke",
      tenantId: TENANT,
    }),
  } as never);
  ok(
    !forgedLifecycle.ok &&
      forgedLifecycle.diagnostics.some((item) =>
        item.code === "EVENT_NOT_TRUSTED"
      ),
  );
  const unauthorizedRevoke = await ledger.revokeVisibility({
    tenantId: TENANT,
    aggregateId: "post:social430",
    lifecycleEventId: lifecycleEvent.value.eventId,
  });
  ok(
    !unauthorizedRevoke.ok &&
      unauthorizedRevoke.diagnostics.some((item) =>
        item.code === "PERMISSION_DENIED"
      ),
  );
  const revoked = await ledger.revokeVisibility({
    tenantId: TENANT,
    aggregateId: "post:social430",
    lifecycleEventId: lifecycleEvent.value.eventId,
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_VISIBILITY_REVOKE",
      resourceId: "post:social430",
      action: "social430.visibility.revoke",
      capability: "social430.visibility.revoke",
      tenantId: TENANT,
    }),
  });
  ok(
    !revoked.ok &&
      revoked.diagnostics.some((item) =>
        item.code === "LIFECYCLE_TRANSITION_NOT_AUTHORIZED"
      ),
  );
  // A lifecycle Event may authorize revoke only after the canonical aggregate
  // has committed the same record version.  Keep this success path separate
  // from the ahead-version rejection above so the fixed boundary test does
  // not accidentally bless a stale or future transition.
  const committedAuthority = authorityFor({}, true, 2);
  const committedLifecycleEvent = await createSocial430TrustedEvent({
    ...eventInput,
    eventId: "event:visibility-revoked-committed" as never,
    eventType: "VISIBILITY_REVOKED",
    aggregateVersion: 2,
  }, committedAuthority);
  ok(committedLifecycleEvent.ok);
  const committedLedger = committedAuthority
    .createSocial430EventProjectionLedger();
  const committedRevoke = await committedLedger.revokeVisibility({
    tenantId: TENANT,
    aggregateId: "post:social430",
    lifecycleEventId: committedLifecycleEvent.value.eventId,
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_VISIBILITY_REVOKE",
      resourceId: "post:social430",
      action: "social430.visibility.revoke",
      capability: "social430.visibility.revoke",
      tenantId: TENANT,
    }),
  });
  ok(committedRevoke.ok);
  const republish = await createSocial430TrustedEvent({
    ...eventInput,
    eventId: "event:republish-after-revoke" as never,
    aggregateVersion: 2,
  }, committedAuthority);
  ok(
    republish.ok &&
      !(await committedLedger.accept(republish.value.eventId)).ok &&
      (await committedLedger.accept(republish.value.eventId)).diagnostics.some(
        (item) => item.code === "CONTENT_UNAVAILABLE",
      ),
  );
  const replay = ledger.replay();
  ok(replay.ok && replay.value.sideEffects === 0);
  const recipientAuth = auth({
    principalId: ACCOUNT,
    resourceType: "SOCIAL430_RECIPIENT",
    resourceId: ACCOUNT,
    action: "social430.notification.resolve",
    capability: "social430.notification.resolve",
    tenantId: TENANT,
  });
  const notification = createSocial430NotificationReference({
    referenceId: "notification:social430" as never,
    sourceEventId: event.value.eventId,
    recipientTenantId: TENANT,
    recipientAccountId: ACCOUNT,
    recipientProof: recipientAuth.authorizationProof,
  }, AUTHORITY);
  ok(
    notification.ok && notification.value.containsBody === false &&
      notification.value.deliveryFailureRollsBackCanonicalState === false,
  );
  const fakeRecipient = createSocial430NotificationReference({
    referenceId: "notification:fake" as never,
    sourceEventId: event.value.eventId,
    recipientTenantId: OTHER_TENANT,
    recipientAccountId: ACCOUNT,
    ...(() => {
      const fakeAuth = auth({
        principalId: ACCOUNT,
        resourceType: "SOCIAL430_RECIPIENT",
        resourceId: ACCOUNT,
        action: "social430.notification.resolve",
        capability: "social430.notification.resolve",
        tenantId: OTHER_TENANT,
      });
      return {
        recipientProof: fakeAuth.authorizationProof,
      };
    })(),
  }, AUTHORITY);
  ok(
    !fakeRecipient.ok &&
      fakeRecipient.diagnostics.some((item) =>
        item.code === "CROSS_TENANT_REFERENCE"
      ),
  );
});

Deno.test("SOCIAL-430 Search, URL, flags, presentation, rollback, and audit are bounded", async () => {
  const card = cardFixture();
  const search = resolveSocial430SearchEligibility({
    card,
    tenantId: TENANT,
    ...auth({
      principalId: null,
      resourceType: "SOCIAL430_SEARCH",
      resourceId: card.resourceId,
      action: "social430.search.index",
      capability: "social430.search.index",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(search.indexable && search.reason === "PUBLIC_PUBLISHED_APPROVED");
  const unlisted = resolveSocial430SearchEligibility(
    {
      card,
      tenantId: TENANT,
      ...auth({
        principalId: null,
        resourceType: "SOCIAL430_SEARCH",
        resourceId: card.resourceId,
        action: "social430.search.index",
        capability: "social430.search.index",
        tenantId: TENANT,
      }),
    },
    authorityFor({
      [card.resourceId]: { visibility: "UNLISTED", lifecycle: "PUBLISHED" },
    }),
  );
  ok(!unlisted.indexable && unlisted.reason === "NOT_PUBLIC");
  const unsafeUrl = createSocial430PublicUrlCandidate(
    {
      tenantId: TENANT,
      resourceType: "POST",
      resourceId: "post:social430",
      ...auth({
        principalId: null,
        resourceType: "SOCIAL430_PUBLIC_URL",
        resourceId: "post:social430",
        action: "social430.public-url.resolve",
        capability: "social430.public-url.resolve",
        tenantId: TENANT,
      }),
    },
    authorityFor({
      "post:social430": {
        visibility: "PRIVATE",
        lifecycle: "PUBLISHED",
        moderation: "APPROVED",
      },
    }),
  );
  ok(!unsafeUrl.ok);
  ok(
    !social430FeatureEnabled(
      DEFAULT_SOCIAL430_FEATURE_FLAGS,
      "social-write",
      false,
    ).ok,
  );
  ok(!social430FeatureEnabled({}, "unknown", false).ok);
  ok(
    !social430FeatureEnabled({ "social-write": true }, "social-write", true).ok,
  );
  equal(
    resolveSocial430PresentationState({ loading: true, items: 0 }),
    "LOADING",
  );
  equal(
    resolveSocial430PresentationState({ loading: false, items: 0 }),
    "EMPTY",
  );
  equal(
    resolveSocial430PresentationState({ loading: false, items: 1 }),
    "READY",
  );
  equal(
    resolveSocial430PresentationState({
      loading: false,
      items: 1,
      offline: true,
    }),
    "OFFLINE",
  );
  const current = {
    postCount: 2,
    commentCount: 1,
    followCount: 1,
    reactionCount: 2,
    mentionCount: 1,
    marketCardCount: 1,
    eventCount: 1,
  } as const;
  const restore = { ...current, postCount: 1 };
  const plan = await createSocial430RollbackPlan(current, restore);
  const applied = applySocial430RollbackPlan(plan, plan.fromSnapshotHash);
  ok(applied.ok && applied.value.postCount === 1);
  ok(!applySocial430RollbackPlan(plan, HASH_A).ok);
  deepStrictEqual(
    auditSafeSocial430Payload({ postCount: 1, commentCount: 2, eventCount: 3 }),
    {
      domain: "SOCIAL430",
      postCount: 1,
      commentCount: 2,
      eventCount: 3,
      hasSensitiveFields: false,
      rawMediaBytes: 0,
      bodyBytes: 0,
      productionMutation: false,
    },
  );
  equal(asSocial430ContentHash(HASH_A), HASH_A);
});

Deno.test("SOCIAL-430 deep privacy and direct-work attack inputs are rejected", async () => {
  const post = await postFixture();
  const nestedPrivate = await createSocial430Post({
    ...post,
    postId: "post:nested-private" as never,
    shareCommandId: "share:nested-private" as never,
    metadata: { nested: { email: "private@example.invalid" } },
    ...auth({
      principalId: CREATOR,
      resourceType: "SOCIAL430_POST",
      resourceId: "post:nested-private",
      action: "social430.post.create",
      capability: "social430.post.create",
      tenantId: TENANT,
    }),
  } as never, AUTHORITY);
  ok(
    !nestedPrivate.ok &&
      nestedPrivate.diagnostics.some((item) =>
        item.code === "FORBIDDEN_PRIVATE_DATA"
      ),
  );
  const directWork = await createSocial430Comment({
    commentId: "comment:direct-work" as never,
    tenantId: TENANT,
    post,
    actorAccountId: ACCOUNT,
    text: "not a transaction",
    agreement: { payment: "should never cross" },
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_COMMENT",
      resourceId: "comment:direct-work",
      action: "social430.comment.create",
      capability: "social430.comment.create",
      tenantId: TENANT,
    }),
  } as never, AUTHORITY);
  ok(
    !directWork.ok &&
      directWork.diagnostics.some((item) =>
        item.code === "DIRECT_WORK_MUTATION_REJECTED" ||
        item.code === "COMMERCE_MUTATION_REJECTED"
      ),
  );
  const piiText = await createSocial430Comment({
    commentId: "comment:pii" as never,
    tenantId: TENANT,
    post,
    actorAccountId: ACCOUNT,
    text: "contact private@example.invalid",
    ...auth({
      principalId: ACCOUNT,
      resourceType: "SOCIAL430_COMMENT",
      resourceId: "comment:pii",
      action: "social430.comment.create",
      capability: "social430.comment.create",
      tenantId: TENANT,
    }),
  }, AUTHORITY);
  ok(
    !piiText.ok &&
      piiText.diagnostics.some((item) =>
        item.code === "FORBIDDEN_PRIVATE_DATA"
      ),
  );
});
