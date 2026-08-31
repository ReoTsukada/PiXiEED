/**
 * SOCIAL-430 server-only composition entry.
 *
 * This module is deliberately not re-exported by contracts.ts. The server
 * composition root installs canonical resolvers into a private capability and
 * returns handlers whose signatures contain no authority object. A
 * browser/client caller must never construct or receive that capability.  The
 * returned handlers are the only values a server route may hand to a caller;
 * every handler has a single command input and closes over this module's
 * server capability.  This file is intentionally absent from contracts.ts.
 */

import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
  resolveAuthorizationProofV1,
} from "../../wp160-contracts.ts";
import {
  createSocial430Comment as createCommentInternal,
  createSocial430Community as createCommunityInternal,
  createSocial430CoreCard as createCoreCardInternal,
  createSocial430CreatorPage as createCreatorPageInternal,
  createSocial430Follow as createFollowInternal,
  createSocial430MarketCardReference as createMarketCardInternal,
  createSocial430Membership as createMembershipInternal,
  createSocial430Mention as createMentionInternal,
  createSocial430MyPage as createMyPageInternal,
  createSocial430NotificationReference as createNotificationInternal,
  createSocial430Post as createPostInternal,
  createSocial430ProjectPage as createProjectPageInternal,
  createSocial430PublicUrlCandidate as createPublicUrlInternal,
  createSocial430Reaction as createReactionInternal,
  createSocial430TrustedEvent as createTrustedEventInternal,
  resolveSocial430CoreCard as resolveCoreCardInternal,
  resolveSocial430Read as resolveReadInternal,
  resolveSocial430SearchEligibility as resolveSearchInternal,
  Social430EventProjectionLedger,
} from "./composition.ts";
import type {
  Social430CanonicalMarketState,
  Social430CanonicalResourceState,
  Social430EventId,
  Social430MarketLookup,
  Social430MembershipDecision,
  Social430MembershipLookup,
  Social430ResourceLookup,
  Social430TrustedEvent,
} from "./composition.ts";

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

/** Configuration is accepted only at the server composition boundary. */
interface Social430ServerCompositionConfig {
  readonly authorizationResolver: AuthorizationProofResolver;
  readonly resolveResource: (
    lookup: Social430ResourceLookup,
  ) => Social430CanonicalResourceState | null;
  readonly resolveMarketReference?: (
    lookup: Social430MarketLookup,
  ) => Social430CanonicalMarketState | null;
  readonly resolveMembership?: (
    lookup: Social430MembershipLookup,
  ) => Social430MembershipDecision | null;
  readonly resolveEvent?: (
    eventId: Social430EventId,
  ) => Social430TrustedEvent | null;
}

/** Private capability closure; never exported or passed through a command. */
class Social430ServerCapability {
  readonly #authorizationResolver: AuthorizationProofResolver;
  readonly #resolveResource:
    Social430ServerCompositionConfig["resolveResource"];
  readonly #resolveMarketReference:
    | NonNullable<Social430ServerCompositionConfig["resolveMarketReference"]>
    | undefined;
  readonly #resolveMembership:
    | NonNullable<Social430ServerCompositionConfig["resolveMembership"]>
    | undefined;
  readonly #resolveEvent:
    | NonNullable<Social430ServerCompositionConfig["resolveEvent"]>
    | undefined;
  readonly #canonicalEvents = new Map<string, Social430TrustedEvent>();

  constructor(config: Social430ServerCompositionConfig) {
    if (typeof config.authorizationResolver !== "function") {
      throw new Error(
        "SOCIAL-430 requires a server-owned authorization resolver.",
      );
    }
    if (typeof config.resolveResource !== "function") {
      throw new Error("SOCIAL-430 requires a server-owned resource resolver.");
    }
    this.#authorizationResolver = config.authorizationResolver;
    this.#resolveResource = config.resolveResource;
    this.#resolveMarketReference = config.resolveMarketReference;
    this.#resolveMembership = config.resolveMembership;
    this.#resolveEvent = config.resolveEvent;
  }

  authorize(
    expected: {
      readonly principalId?: string | null;
      readonly resourceType: string;
      readonly resourceId: string;
      readonly action: string;
      readonly capability: string;
      readonly tenantId?: string | null;
      readonly correlationId?: string | null;
    },
    callerProof: AuthorizationProofV1 | undefined,
  ): AuthorizationProofV1 {
    return resolveAuthorizationProofV1(
      callerProof,
      { ...expected, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION },
      this.#authorizationResolver,
    );
  }

  resolveResource(
    lookup: Social430ResourceLookup,
  ): Social430CanonicalResourceState | null {
    try {
      const resolved = this.#resolveResource({ ...lookup });
      if (
        resolved === null ||
        resolved.tenantId !== lookup.tenantId ||
        resolved.resourceId !== lookup.resourceId ||
        (lookup.resourceType !== undefined &&
          resolved.resourceType !== lookup.resourceType) ||
        (lookup.cardType !== undefined && resolved.cardType !== lookup.cardType)
      ) return null;
      if (
        !Number.isSafeInteger(resolved.recordVersion) ||
        resolved.recordVersion < 1 ||
        (resolved.revisionHash !== undefined &&
          !SHA256.test(resolved.revisionHash)) ||
        (resolved.contentHash !== undefined &&
          !SHA256.test(resolved.contentHash))
      ) return null;
      return { ...resolved };
    } catch {
      return null;
    }
  }

  resolveMarketReference(
    lookup: Social430MarketLookup,
  ): Social430CanonicalMarketState | null {
    if (this.#resolveMarketReference === undefined) return null;
    try {
      const resolved = this.#resolveMarketReference({ ...lookup });
      if (
        resolved === null ||
        resolved.tenantId !== lookup.tenantId ||
        resolved.marketProductId !== lookup.marketProductId ||
        resolved.packageId !== lookup.packageId ||
        !Number.isSafeInteger(resolved.recordVersion) ||
        resolved.recordVersion < 1 ||
        !SHA256.test(resolved.packageContentHash)
      ) return null;
      return { ...resolved };
    } catch {
      return null;
    }
  }

  resolveMembership(
    lookup: Social430MembershipLookup,
  ): Social430MembershipDecision | null {
    if (this.#resolveMembership === undefined) return null;
    try {
      const resolved = this.#resolveMembership({ ...lookup });
      return resolved === null ? null : { ...resolved };
    } catch {
      return null;
    }
  }

  resolveEvent(eventId: Social430EventId): Social430TrustedEvent | null {
    try {
      const resolved = this.#resolveEvent?.(eventId) ??
        this.#canonicalEvents.get(eventId) ?? null;
      if (
        resolved === null ||
        resolved.eventId !== eventId ||
        !SAFE_ID.test(resolved.eventId) ||
        !SAFE_ID.test(resolved.tenantId) ||
        !SAFE_ID.test(resolved.aggregateId) ||
        !SHA256.test(resolved.payloadHash) ||
        !Number.isSafeInteger(resolved.aggregateVersion) ||
        resolved.aggregateVersion < 1
      ) return null;
      return { ...resolved };
    } catch {
      return null;
    }
  }

  recordCanonicalEvent(event: Social430TrustedEvent): void {
    this.#canonicalEvents.set(event.eventId, { ...event });
  }
}

function createSocial430ServerCapability(
  config: Social430ServerCompositionConfig,
): Social430ServerCapability {
  return new Social430ServerCapability(config);
}

type BoundHandler<F extends (...args: any[]) => any> = (
  input: Parameters<F>[0],
) => ReturnType<F>;

export interface Social430ServerComposition {
  readonly createSocial430CoreCard: BoundHandler<typeof createCoreCardInternal>;
  readonly createSocial430Post: BoundHandler<typeof createPostInternal>;
  readonly createSocial430Comment: BoundHandler<typeof createCommentInternal>;
  readonly createSocial430Follow: BoundHandler<typeof createFollowInternal>;
  readonly createSocial430Reaction: BoundHandler<typeof createReactionInternal>;
  readonly createSocial430Mention: BoundHandler<typeof createMentionInternal>;
  readonly createSocial430Community: BoundHandler<
    typeof createCommunityInternal
  >;
  readonly createSocial430Membership: BoundHandler<
    typeof createMembershipInternal
  >;
  readonly createSocial430CreatorPage: BoundHandler<
    typeof createCreatorPageInternal
  >;
  readonly createSocial430ProjectPage: BoundHandler<
    typeof createProjectPageInternal
  >;
  readonly createSocial430MyPage: BoundHandler<typeof createMyPageInternal>;
  readonly createSocial430MarketCardReference: BoundHandler<
    typeof createMarketCardInternal
  >;
  readonly resolveSocial430Read: BoundHandler<typeof resolveReadInternal>;
  readonly resolveSocial430CoreCard: BoundHandler<
    typeof resolveCoreCardInternal
  >;
  readonly resolveSocial430SearchEligibility: BoundHandler<
    typeof resolveSearchInternal
  >;
  readonly createSocial430TrustedEvent: BoundHandler<
    typeof createTrustedEventInternal
  >;
  readonly createSocial430NotificationReference: BoundHandler<
    typeof createNotificationInternal
  >;
  readonly createSocial430PublicUrlCandidate: BoundHandler<
    typeof createPublicUrlInternal
  >;
  readonly createSocial430EventProjectionLedger: () =>
    Social430EventProjectionLedger;
}

/** @internal Server composition/test-fixture entry; not a public command API. */
export function createSocial430ServerComposition(
  config: Social430ServerCompositionConfig,
): Social430ServerComposition {
  const capability = createSocial430ServerCapability(config);
  const handlers: Social430ServerComposition = {
    createSocial430CoreCard: (input) =>
      createCoreCardInternal(input, capability),
    createSocial430Post: (input) => createPostInternal(input, capability),
    createSocial430Comment: (input) => createCommentInternal(input, capability),
    createSocial430Follow: (input) => createFollowInternal(input, capability),
    createSocial430Reaction: (input) =>
      createReactionInternal(input, capability),
    createSocial430Mention: (input) => createMentionInternal(input, capability),
    createSocial430Community: (input) =>
      createCommunityInternal(input, capability),
    createSocial430Membership: (input) =>
      createMembershipInternal(input, capability),
    createSocial430CreatorPage: (input) =>
      createCreatorPageInternal(input, capability),
    createSocial430ProjectPage: (input) =>
      createProjectPageInternal(input, capability),
    createSocial430MyPage: (input) => createMyPageInternal(input, capability),
    createSocial430MarketCardReference: (input) =>
      createMarketCardInternal(input, capability),
    resolveSocial430Read: (input) => resolveReadInternal(input, capability),
    resolveSocial430CoreCard: (input) =>
      resolveCoreCardInternal(input, capability),
    resolveSocial430SearchEligibility: (input) =>
      resolveSearchInternal(input, capability),
    createSocial430TrustedEvent: (input) =>
      createTrustedEventInternal(input, capability),
    createSocial430NotificationReference: (input) =>
      createNotificationInternal(input, capability),
    createSocial430PublicUrlCandidate: (input) =>
      createPublicUrlInternal(input, capability),
    createSocial430EventProjectionLedger: () =>
      new Social430EventProjectionLedger(capability),
  };
  return Object.freeze(handlers);
}
