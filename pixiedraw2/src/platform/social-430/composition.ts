/**
 * SOCIAL-430 isolated Social / Community / Creator composition boundary.
 *
 * This module is deliberately a pure, in-memory reference implementation.
 * A Social430ServerCapability is constructed once inside the server-only
 * composition root; caller-facing handlers receive only bounded references
 * and caller proofs, never an authority object or current-state authority.
 * It has no DOM, route, network, provider, database, Storage, or production
 * mutation dependency. The older WP-230 reference remains the compatibility
 * source for the original SNS vocabulary; this package adds the tenant,
 * lifecycle, replay, and read-time safety gates required by SOCIAL-430.
 */

import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofV1,
  type Brand,
  canonicalJson,
  type ContentHash,
  hashCanonical,
  requireAuthorizationProofV1,
} from "../../wp160-contracts.ts";

/**
 * Structural server capability consumed by the internal composition
 * functions.  The capability has no public constructor or exported factory;
 * the server-only composition entry binds one private implementation before
 * exposing any caller-facing handler.
 */
interface Social430ServerCapability {
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
  ): AuthorizationProofV1;
  resolveResource(
    lookup: Social430ResourceLookup,
  ): Social430CanonicalResourceState | null;
  resolveMarketReference(
    lookup: Social430MarketLookup,
  ): Social430CanonicalMarketState | null;
  resolveMembership(
    lookup: Social430MembershipLookup,
  ): Social430MembershipDecision | null;
  resolveEvent(eventId: Social430EventId): Social430TrustedEvent | null;
  recordCanonicalEvent(event: Social430TrustedEvent): void;
}

export const SOCIAL430_SCHEMA_VERSION =
  "SOCIAL430_SOCIAL_COMPOSITION_V1" as const;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SAFE_HASH = /^[a-f0-9]{64}$/;
const SAFE_PATH =
  /^\/(?!\/|.*(?:javascript:|data:|vbscript:))[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*$/i;
const MAX_CAPTION = 1_024;
const MAX_COMMENT = 2_000;
const MAX_EVENT_METADATA = 4_096;
const MAX_REFERENCES = 8;
const MAX_CARDS = 8;
const MAX_PAGE_REFERENCES = 32;
const MAX_SAFE_METADATA_KEYS = 32;

const FORBIDDEN_KEYS = new Map<string, Social430DiagnosticCode>([
  ["body", "FORBIDDEN_PRIVATE_DATA"],
  ["rawbody", "FORBIDDEN_PRIVATE_DATA"],
  ["privatebody", "FORBIDDEN_PRIVATE_DATA"],
  ["private", "FORBIDDEN_PRIVATE_DATA"],
  ["privateproject", "FORBIDDEN_PRIVATE_DATA"],
  ["privatework", "FORBIDDEN_PRIVATE_DATA"],
  ["projectbody", "FORBIDDEN_PRIVATE_DATA"],
  ["rawproject", "FORBIDDEN_PRIVATE_DATA"],
  ["rawasset", "FORBIDDEN_PRIVATE_DATA"],
  ["dm", "FORBIDDEN_PRIVATE_DATA"],
  ["directwork", "DIRECT_WORK_MUTATION_REJECTED"],
  ["agreement", "DIRECT_WORK_MUTATION_REJECTED"],
  ["delivery", "DIRECT_WORK_MUTATION_REJECTED"],
  ["acceptance", "DIRECT_WORK_MUTATION_REJECTED"],
  ["agreementid", "DIRECT_WORK_MUTATION_REJECTED"],
  ["deliveryid", "DIRECT_WORK_MUTATION_REJECTED"],
  ["acceptanceid", "DIRECT_WORK_MUTATION_REJECTED"],
  ["workagreement", "DIRECT_WORK_MUTATION_REJECTED"],
  ["rights", "DIRECT_WORK_MUTATION_REJECTED"],
  ["rightsid", "DIRECT_WORK_MUTATION_REJECTED"],
  ["payment", "COMMERCE_MUTATION_REJECTED"],
  ["ledger", "COMMERCE_MUTATION_REJECTED"],
  ["royalty", "COMMERCE_MUTATION_REJECTED"],
  ["payout", "COMMERCE_MUTATION_REJECTED"],
  ["entitlement", "COMMERCE_MUTATION_REJECTED"],
  ["license", "COMMERCE_MUTATION_REJECTED"],
  ["purchase", "COMMERCE_MUTATION_REJECTED"],
  ["product", "COMMERCE_MUTATION_REJECTED"],
  ["productid", "COMMERCE_MUTATION_REJECTED"],
  ["purchaseid", "COMMERCE_MUTATION_REJECTED"],
  ["entitlementid", "COMMERCE_MUTATION_REJECTED"],
  ["licenseid", "COMMERCE_MUTATION_REJECTED"],
  ["rightsTransfer".toLowerCase(), "COMMERCE_MUTATION_REJECTED"],
  ["rawmedia", "RAW_MEDIA_REJECTED"],
  ["mediabytes", "RAW_MEDIA_REJECTED"],
  ["rawimage", "RAW_MEDIA_REJECTED"],
  ["imagebytes", "RAW_MEDIA_REJECTED"],
  ["rawaudio", "RAW_MEDIA_REJECTED"],
  ["rawvideo", "RAW_MEDIA_REJECTED"],
  ["media", "RAW_MEDIA_REJECTED"],
  ["audio", "RAW_MEDIA_REJECTED"],
  ["video", "RAW_MEDIA_REJECTED"],
  ["base64", "RAW_MEDIA_REJECTED"],
  ["dataurl", "RAW_MEDIA_REJECTED"],
  ["html", "UNSAFE_MARKUP_REJECTED"],
  ["rawhtml", "UNSAFE_MARKUP_REJECTED"],
  ["script", "UNSAFE_MARKUP_REJECTED"],
  ["jwt", "FORBIDDEN_PRIVATE_DATA"],
  ["secret", "FORBIDDEN_PRIVATE_DATA"],
  ["email", "FORBIDDEN_PRIVATE_DATA"],
  ["emailaddress", "FORBIDDEN_PRIVATE_DATA"],
  ["phone", "FORBIDDEN_PRIVATE_DATA"],
  ["phonenumber", "FORBIDDEN_PRIVATE_DATA"],
  ["accesstoken", "FORBIDDEN_PRIVATE_DATA"],
  ["refreshtoken", "FORBIDDEN_PRIVATE_DATA"],
  ["token", "FORBIDDEN_PRIVATE_DATA"],
  ["authorizationproofresolver", "PERMISSION_DENIED"],
  ["resourceresolver", "PERMISSION_DENIED"],
  ["event", "EVENT_NOT_TRUSTED"],
  ["eventobject", "EVENT_NOT_TRUSTED"],
  ["lifecycleevent", "EVENT_NOT_TRUSTED"],
  ["trustedevent", "EVENT_NOT_TRUSTED"],
  ["currentvisibility", "PERMISSION_DENIED"],
  ["currentstatus", "PERMISSION_DENIED"],
  ["currentlifecycle", "PERMISSION_DENIED"],
  ["currentmoderation", "PERMISSION_DENIED"],
  ["existinglockedproduct", "PERMISSION_DENIED"],
  ["trustedproducer", "PERMISSION_DENIED"],
]);

export type Social430DiagnosticCode =
  | "INVALID_ID"
  | "INVALID_HASH"
  | "INVALID_PATH"
  | "FORBIDDEN_PRIVATE_DATA"
  | "RAW_MEDIA_REJECTED"
  | "UNSAFE_MARKUP_REJECTED"
  | "BOUNDED_TEXT_REQUIRED"
  | "SHARE_COMMAND_REQUIRED"
  | "CREATOR_AUTHORITY_REQUIRED"
  | "INVALID_VISIBILITY"
  | "INVALID_STATUS"
  | "INVALID_REFERENCE"
  | "CROSS_TENANT_REFERENCE"
  | "PERMISSION_DENIED"
  | "PRIVATE_RESOURCE"
  | "BLOCKED_USER"
  | "OFFLINE"
  | "EMPTY_RESULT"
  | "INVALID_TRANSITION"
  | "DUPLICATE_ID_CONFLICT"
  | "SELF_FOLLOW_REJECTED"
  | "POST_NOT_PUBLISHED"
  | "MARKET_REFERENCE_REQUIRED"
  | "CORE_CARD_REQUIRED"
  | "CONTENT_UNAVAILABLE"
  | "SEARCH_NOT_ELIGIBLE"
  | "COMMERCE_MUTATION_REJECTED"
  | "DIRECT_WORK_MUTATION_REJECTED"
  | "EVENT_NOT_TRUSTED"
  | "LIFECYCLE_TRANSITION_NOT_AUTHORIZED"
  | "EVENT_VERSION_GAP"
  | "STALE_EVENT_REJECTED"
  | "REPLAY_SIDE_EFFECT_REJECTED"
  | "DUPLICATE_EVENT_CONFLICT"
  | "NOTIFICATION_RECIPIENT_REQUIRED"
  | "UNKNOWN_FLAG"
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "ROLLBACK_PRECONDITION_FAILED"
  | "UNSAFE_AUDIT_DATA";

export interface Social430Diagnostic {
  readonly code: Social430DiagnosticCode;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  /** Constant text only; caller/private payloads are never copied here. */
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  readonly recoverable: boolean;
}

export type Social430Result<T> =
  | {
    readonly ok: true;
    readonly value: T;
    readonly diagnostics: readonly Social430Diagnostic[];
  }
  | {
    readonly ok: false;
    readonly diagnostics: readonly Social430Diagnostic[];
  };

export interface Social430CanonicalResourceState {
  readonly tenantId: string;
  readonly resourceId: string;
  readonly resourceType: string;
  readonly cardType?: Social430CoreCardType;
  readonly publicPresentationReference?: string;
  readonly visibility: Social430Visibility;
  readonly lifecycle:
    | "ACTIVE"
    | "PUBLISHED"
    | "PRIVATE"
    | "DELETED"
    | "TRASHED"
    | "QUARANTINED"
    | "UNPUBLISHED"
    | "HIDDEN"
    | "ARCHIVED";
  readonly moderation: Social430Moderation;
  readonly recordVersion: number;
  readonly revisionHash?: ContentHash;
  readonly contentHash?: ContentHash;
  readonly ownerPrincipalId?: string;
}

export interface Social430CanonicalMarketState {
  readonly tenantId: string;
  readonly marketProductId: string;
  readonly packageId: string;
  readonly packageContentHash: ContentHash;
  readonly preservedPath: string;
  readonly locked: boolean;
  readonly visibility: Social430Visibility;
  readonly lifecycle: "ACTIVE" | "PUBLISHED" | "HIDDEN" | "ARCHIVED";
  readonly moderation: Social430Moderation;
  readonly recordVersion: number;
}

export interface Social430ResourceLookup {
  readonly tenantId: string;
  readonly resourceId: string;
  readonly resourceType?: string;
  readonly cardType?: Social430CoreCardType;
}

export interface Social430MarketLookup {
  readonly tenantId: string;
  readonly marketProductId: string;
  readonly packageId: string;
}

export interface Social430MembershipLookup {
  readonly tenantId: string;
  readonly resourceId: string;
  readonly principalId: string;
}

export interface Social430MembershipDecision {
  readonly allowed: boolean;
  readonly role: "OWNER" | "MODERATOR" | "MEMBER";
}

function success<T>(
  value: T,
  diagnostics: readonly Social430Diagnostic[] = [],
): Social430Result<T> {
  return { ok: true, value, diagnostics };
}

function failure<T>(
  diagnostics: readonly Social430Diagnostic[],
): Social430Result<T> {
  return { ok: false, diagnostics };
}

function info(
  code: Social430DiagnosticCode,
  message: string,
  metadata?: Readonly<Record<string, string | number | boolean>>,
): Social430Diagnostic {
  return {
    code,
    severity: "INFO",
    message,
    ...(metadata === undefined ? {} : { metadata }),
    recoverable: true,
  };
}

function error(
  code: Social430DiagnosticCode,
  message: string,
  path?: string,
): Social430Diagnostic {
  return {
    code,
    severity: "ERROR",
    message,
    ...(path === undefined ? {} : { path }),
    recoverable: false,
  };
}

function hasError(diagnostics: readonly Social430Diagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === "ERROR");
}

function validId(value: string): boolean {
  return SAFE_ID.test(value);
}

function validHash(value: string): boolean {
  return SAFE_HASH.test(value);
}

function validPath(value: string): boolean {
  return SAFE_PATH.test(value);
}

function validateId(
  value: string,
  path: string,
  diagnostics: Social430Diagnostic[],
): void {
  if (!validId(value)) {
    diagnostics.push(
      error("INVALID_ID", "Reference must be a stable identifier.", path),
    );
  }
}

function validateHash(
  value: string,
  path: string,
  diagnostics: Social430Diagnostic[],
): void {
  if (!validHash(value)) {
    diagnostics.push(
      error(
        "INVALID_HASH",
        "Reference must be a lowercase SHA-256 hash.",
        path,
      ),
    );
  }
}

function validateBoundedText(
  value: string,
  max: number,
  path: string,
  diagnostics: Social430Diagnostic[],
): void {
  if (value.length === 0 || value.length > max) {
    diagnostics.push(
      error("BOUNDED_TEXT_REQUIRED", "Text is required and bounded.", path),
    );
  }
  if (/<\/?[a-z][^>]*>|javascript\s*:/i.test(value)) {
    diagnostics.push(
      error("UNSAFE_MARKUP_REJECTED", "Text must remain plain text.", path),
    );
  }
  if (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
    /(?<![A-Za-z0-9])\+?\d(?:[\d().\-\s]{7,}\d)(?![A-Za-z0-9])/.test(value) ||
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(
      value,
    )
  ) {
    diagnostics.push(
      error(
        "FORBIDDEN_PRIVATE_DATA",
        "Email, phone, and token-like data cannot cross the Social boundary.",
        path,
      ),
    );
  }
}

function keyName(key: string): string {
  return key.replace(/[A-Z]/g, (match) => match.toLowerCase());
}

/** Deeply rejects content and authority fields, including nested substituted input. */
function boundaryDiagnostics(
  value: unknown,
  diagnostics: Social430Diagnostic[],
  path = "input",
  depth = 0,
  seen = new WeakSet<object>(),
): void {
  if (value === null || typeof value !== "object") return;
  if (depth > 8) {
    diagnostics.push(
      error(
        "UNSAFE_AUDIT_DATA",
        "Input nesting exceeds the bounded Social boundary.",
        path,
      ),
    );
    return;
  }
  if (seen.has(value)) {
    diagnostics.push(
      error(
        "UNSAFE_AUDIT_DATA",
        "Cyclic input is not accepted at the Social boundary.",
        path,
      ),
    );
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > 32) {
      diagnostics.push(
        error("UNSAFE_AUDIT_DATA", "Input arrays are bounded.", path),
      );
    }
    value.forEach((item, index) =>
      boundaryDiagnostics(
        item,
        diagnostics,
        `${path}[${index}]`,
        depth + 1,
        seen,
      )
    );
    seen.delete(value);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = keyName(key);
    const blocked = FORBIDDEN_KEYS.get(normalized);
    if (blocked !== undefined) {
      diagnostics.push(
        error(
          blocked,
          "Social accepts bounded references and safe metadata only.",
          `${path}.${key}`,
        ),
      );
    }
    boundaryDiagnostics(child, diagnostics, `${path}.${key}`, depth + 1, seen);
  }
  seen.delete(value);
}

export interface Social430AuthorizationInput {
  readonly tenantId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly principalId?: string | null;
  readonly correlationId?: string | null;
  readonly authorizationProof?: AuthorizationProofV1 | undefined;
}

function requireAuthorization(
  authority: Social430ServerCapability,
  input: Social430AuthorizationInput,
  diagnostics: Social430Diagnostic[],
  path = "authorizationProof",
): AuthorizationProofV1 | null {
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.resourceType, "resourceType", diagnostics);
  validateId(input.resourceId, "resourceId", diagnostics);
  try {
    return authority.authorize({
      principalId: input.principalId ?? null,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      action: input.action,
      capability: input.capability,
      tenantId: input.tenantId,
      ...(input.correlationId === undefined
        ? {}
        : { correlationId: input.correlationId }),
    }, input.authorizationProof);
  } catch {
    diagnostics.push(
      error(
        "PERMISSION_DENIED",
        "Server authorization is not bound to the requested tenant and resource.",
        path,
      ),
    );
    return null;
  }
}

export type Social430Visibility =
  | "PUBLIC"
  | "UNLISTED"
  | "PROJECT_MEMBERS"
  | "CREATOR_PRIVATE"
  | "PRIVATE";
export type Social430PostStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "ARCHIVED"
  | "HIDDEN"
  | "QUARANTINED";
export type Social430PostKind =
  | "CREATOR_NOTE"
  | "ASSET_SHARE"
  | "MARKET_CARD"
  | "PIXFiND_REFERENCE"
  | "PROJECT_UPDATE";
export type Social430ReferenceKind =
  | "PROJECT"
  | "ASSET"
  | "ASSET_REVISION"
  | "PACKAGE"
  | "MARKET_PRODUCT"
  | "PIXFiND_SOURCE";
export type Social430CoreCardType =
  | "MARKET_PRODUCT"
  | "MATERIAL"
  | "COMPLETED_WORK"
  | "PUBLIC_GAME"
  | "PUBLIC_PROJECT"
  | "CREATOR"
  | "COLLECTION"
  | "PUBLIC_RESOURCE";
export type Social430CardSnapshotMode = "LIVE" | "SNAPSHOT" | "OMITTED";
export type Social430Moderation =
  | "APPROVED"
  | "PENDING"
  | "HIDDEN"
  | "REMOVED"
  | "RESTRICTED";

export interface Social430Reference {
  readonly tenantId: string;
  readonly kind: Social430ReferenceKind;
  readonly referenceId: string;
  readonly recordVersion: number;
  readonly revisionHash?: ContentHash;
  readonly contentHash?: ContentHash;
}

export interface Social430CardSnapshotPolicy {
  readonly price: Social430CardSnapshotMode;
  readonly availability: Social430CardSnapshotMode;
  readonly creator: Social430CardSnapshotMode;
  readonly preview: Social430CardSnapshotMode;
}

export type Social430CoreCardId = Brand<string, "Social430CoreCardId">;
export type Social430PostId = Brand<string, "Social430PostId">;
export type Social430ShareCommandId = Brand<string, "Social430ShareCommandId">;
export type Social430CommentId = Brand<string, "Social430CommentId">;
export type Social430EventId = Brand<string, "Social430EventId">;
export type Social430CommunityId = Brand<string, "Social430CommunityId">;
export type Social430MembershipId = Brand<string, "Social430MembershipId">;
export type Social430CreatorPageId = Brand<string, "Social430CreatorPageId">;
export type Social430ProjectPageId = Brand<string, "Social430ProjectPageId">;
export type Social430MyPageId = Brand<string, "Social430MyPageId">;

export interface Social430CoreCard {
  readonly cardId: Social430CoreCardId;
  readonly tenantId: string;
  readonly cardType: Social430CoreCardType;
  readonly resourceId: string;
  readonly resourceRecordVersion: number;
  readonly resourceRevisionHash?: ContentHash;
  readonly resourceContentHash?: ContentHash;
  readonly cardVersion: 1;
  readonly publicPresentationReference: string;
  readonly snapshotPolicy: Social430CardSnapshotPolicy;
  readonly visibilityAtShare: "PUBLIC";
  readonly moderationAtShare: "APPROVED";
  readonly approvedAtShare: true;
  readonly status: "APPROVED";
}

function validateVisibility(
  visibility: string,
  path: string,
  diagnostics: Social430Diagnostic[],
): visibility is Social430Visibility {
  if (
    !(<Social430Visibility[]> [
      "PUBLIC",
      "UNLISTED",
      "PROJECT_MEMBERS",
      "CREATOR_PRIVATE",
      "PRIVATE",
    ]).includes(visibility as Social430Visibility)
  ) {
    diagnostics.push(
      error("INVALID_VISIBILITY", "Visibility is not supported.", path),
    );
    return false;
  }
  return true;
}

function validateTenant(
  expected: string,
  actual: string,
  path: string,
  diagnostics: Social430Diagnostic[],
): void {
  validateId(actual, path, diagnostics);
  if (expected !== actual) {
    diagnostics.push(
      error(
        "CROSS_TENANT_REFERENCE",
        "Cross-tenant Social references are rejected.",
        path,
      ),
    );
  }
}

function resolveCurrentPost(
  authority: Social430ServerCapability,
  tenantId: string,
  post: Social430Post,
  diagnostics: Social430Diagnostic[],
): Social430CanonicalResourceState | null {
  const current = authority.resolveResource({
    tenantId,
    resourceId: post.postId,
    resourceType: "POST",
  });
  if (
    current === null ||
    current.tenantId !== post.tenantId ||
    current.resourceId !== post.postId ||
    current.visibility !== post.visibility ||
    current.recordVersion !== post.recordVersion ||
    current.lifecycle !== post.status ||
    current.moderation !== "APPROVED"
  ) {
    diagnostics.push(
      error(
        "CONTENT_UNAVAILABLE",
        "The Post must match the current canonical server projection.",
        "post.postId",
      ),
    );
    return null;
  }
  for (const reference of post.references) {
    const referenceState = authority.resolveResource({
      tenantId,
      resourceId: reference.referenceId,
      resourceType: reference.kind,
    });
    if (
      referenceState === null ||
      reference.recordVersion !== referenceState.recordVersion ||
      referenceState.contentHash === undefined ||
      reference.contentHash !== referenceState.contentHash ||
      (referenceState.revisionHash !== undefined &&
        reference.revisionHash !== referenceState.revisionHash)
    ) {
      diagnostics.push(
        error(
          "CONTENT_UNAVAILABLE",
          "The Post contains a reference outside the current canonical identity.",
          "post.references",
        ),
      );
      return null;
    }
  }
  for (const card of post.cards) {
    const cardState = authority.resolveResource({
      tenantId,
      resourceId: card.resourceId,
      resourceType: card.cardType,
      cardType: card.cardType,
    });
    if (
      cardState === null ||
      card.resourceRecordVersion !== cardState.recordVersion ||
      cardState.contentHash === undefined ||
      card.resourceContentHash !== cardState.contentHash ||
      (cardState.revisionHash !== undefined &&
        card.resourceRevisionHash !== cardState.revisionHash) ||
      card.publicPresentationReference !== cardState.publicPresentationReference
    ) {
      diagnostics.push(
        error(
          "CONTENT_UNAVAILABLE",
          "The Post contains a Card outside the current canonical identity.",
          "post.cards",
        ),
      );
      return null;
    }
  }
  return current;
}

function validateReferences(
  references: readonly Social430Reference[],
  tenantId: string,
  diagnostics: Social430Diagnostic[],
): void {
  if (references.length > MAX_REFERENCES) {
    diagnostics.push(
      error("INVALID_REFERENCE", "Reference set is bounded.", "references"),
    );
  }
  for (const [index, reference] of references.entries()) {
    validateTenant(
      tenantId,
      reference.tenantId,
      `references[${index}].tenantId`,
      diagnostics,
    );
    validateId(
      reference.referenceId,
      `references[${index}].referenceId`,
      diagnostics,
    );
    if (
      !Number.isSafeInteger(reference.recordVersion) ||
      reference.recordVersion < 1
    ) {
      diagnostics.push(
        error(
          "INVALID_REFERENCE",
          "Reference must bind a positive canonical record version.",
          `references[${index}].recordVersion`,
        ),
      );
    }
    if (reference.revisionHash !== undefined) {
      validateHash(
        reference.revisionHash,
        `references[${index}].revisionHash`,
        diagnostics,
      );
    }
    if (reference.contentHash !== undefined) {
      validateHash(
        reference.contentHash,
        `references[${index}].contentHash`,
        diagnostics,
      );
    }
  }
}

function validateCards(
  cards: readonly Social430CoreCard[],
  tenantId: string,
  diagnostics: Social430Diagnostic[],
): void {
  if (cards.length > MAX_CARDS) {
    diagnostics.push(
      error("INVALID_REFERENCE", "Core Card set is bounded.", "cards"),
    );
  }
  for (const [index, card] of cards.entries()) {
    validateTenant(
      tenantId,
      card.tenantId,
      `cards[${index}].tenantId`,
      diagnostics,
    );
    validateId(card.cardId, `cards[${index}].cardId`, diagnostics);
    validateId(card.resourceId, `cards[${index}].resourceId`, diagnostics);
    if (
      !Number.isSafeInteger(card.resourceRecordVersion) ||
      card.resourceRecordVersion < 1
    ) {
      diagnostics.push(
        error(
          "INVALID_REFERENCE",
          "Card must bind a positive canonical resource version.",
          `cards[${index}].resourceRecordVersion`,
        ),
      );
    }
    if (!validPath(card.publicPresentationReference)) {
      diagnostics.push(
        error(
          "INVALID_PATH",
          "Card path must be a safe same-origin path.",
          `cards[${index}].publicPresentationReference`,
        ),
      );
    }
    if (
      card.cardVersion !== 1 || card.status !== "APPROVED" ||
      card.approvedAtShare !== true || card.visibilityAtShare !== "PUBLIC" ||
      card.moderationAtShare !== "APPROVED"
    ) {
      diagnostics.push(
        error(
          "INVALID_REFERENCE",
          "Card must be an approved public v1 reference.",
          `cards[${index}]`,
        ),
      );
    }
    for (const [field, mode] of Object.entries(card.snapshotPolicy)) {
      if (
        !(<Social430CardSnapshotMode[]> ["LIVE", "SNAPSHOT", "OMITTED"])
          .includes(mode as Social430CardSnapshotMode)
      ) {
        diagnostics.push(
          error(
            "INVALID_REFERENCE",
            "Card snapshot policy must classify every display field.",
            `cards[${index}].snapshotPolicy.${field}`,
          ),
        );
      }
    }
  }
}

export function createSocial430CoreCard(input: {
  readonly cardId: Social430CoreCardId;
  readonly tenantId: string;
  readonly cardType: Social430CoreCardType;
  readonly resourceId: string;
  readonly snapshotPolicy: Social430CardSnapshotPolicy;
  readonly authorizationProof?: AuthorizationProofV1;
}, authority: Social430ServerCapability): Social430Result<Social430CoreCard> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.cardId, "cardId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.resourceId, "resourceId", diagnostics);
  if (
    !Object.values<Social430CoreCardType>([
      "MARKET_PRODUCT",
      "MATERIAL",
      "COMPLETED_WORK",
      "PUBLIC_GAME",
      "PUBLIC_PROJECT",
      "CREATOR",
      "COLLECTION",
      "PUBLIC_RESOURCE",
    ]).includes(input.cardType)
  ) {
    diagnostics.push(
      error("INVALID_REFERENCE", "Card type is not supported.", "cardType"),
    );
  }
  const current = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.resourceId,
    resourceType: input.cardType,
    cardType: input.cardType,
  });
  if (
    current === null ||
    current.cardType !== input.cardType ||
    current.visibility !== "PUBLIC" ||
    !["ACTIVE", "PUBLISHED"].includes(current.lifecycle) ||
    current.moderation !== "APPROVED" ||
    current.publicPresentationReference === undefined ||
    !validPath(current.publicPresentationReference)
  ) {
    diagnostics.push(
      error(
        "PERMISSION_DENIED",
        "Only the current approved public resource may become a Card.",
        "resourceId",
      ),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_CORE_CARD",
    resourceId: input.cardId,
    action: "social430.card.create",
    capability: "social430.card.create",
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  for (const [field, mode] of Object.entries(input.snapshotPolicy)) {
    if (
      !(<Social430CardSnapshotMode[]> ["LIVE", "SNAPSHOT", "OMITTED"]).includes(
        mode as Social430CardSnapshotMode,
      )
    ) {
      diagnostics.push(
        error(
          "INVALID_REFERENCE",
          "Card snapshot policy is invalid.",
          `snapshotPolicy.${field}`,
        ),
      );
    }
  }
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({
    cardId: input.cardId,
    tenantId: input.tenantId,
    cardType: input.cardType,
    resourceId: input.resourceId,
    resourceRecordVersion: current!.recordVersion,
    ...(current!.revisionHash === undefined
      ? {}
      : { resourceRevisionHash: current!.revisionHash }),
    ...(current!.contentHash === undefined
      ? {}
      : { resourceContentHash: current!.contentHash }),
    cardVersion: 1,
    publicPresentationReference: current!.publicPresentationReference!,
    snapshotPolicy: { ...input.snapshotPolicy },
    visibilityAtShare: "PUBLIC",
    moderationAtShare: "APPROVED",
    approvedAtShare: true,
    status: "APPROVED",
  });
}

export interface Social430ShareCommandInput {
  readonly postId: Social430PostId;
  readonly shareCommandId: Social430ShareCommandId;
  readonly tenantId: string;
  readonly creatorId: string;
  readonly sourceAccountId: string;
  readonly kind: Social430PostKind;
  readonly visibility: Social430Visibility;
  readonly status: Social430PostStatus;
  readonly caption: string;
  readonly references: readonly Social430Reference[];
  readonly cards?: readonly Social430CoreCard[];
  readonly publicPath?: string;
  readonly explicitShare: boolean;
  readonly authorizationProof?: AuthorizationProofV1;
}

export interface Social430Post {
  readonly postId: Social430PostId;
  readonly shareCommandId: Social430ShareCommandId;
  readonly tenantId: string;
  readonly creatorId: string;
  readonly sourceAccountId: string;
  readonly kind: Social430PostKind;
  readonly visibility: Social430Visibility;
  readonly status: Social430PostStatus;
  readonly caption: string;
  readonly captionHash: ContentHash;
  readonly references: readonly Social430Reference[];
  readonly cards: readonly Social430CoreCard[];
  readonly publicPath?: string;
  readonly explicitShare: true;
  readonly recordVersion: number;
}

export async function createSocial430Post(
  input: Social430ShareCommandInput,
  authority: Social430ServerCapability,
): Promise<Social430Result<Social430Post>> {
  const diagnostics: Social430Diagnostic[] = [];
  for (
    const [value, path] of [
      [input.postId, "postId"],
      [input.shareCommandId, "shareCommandId"],
      [input.tenantId, "tenantId"],
      [input.creatorId, "creatorId"],
      [input.sourceAccountId, "sourceAccountId"],
    ] as const
  ) validateId(value, path, diagnostics);
  if (input.explicitShare !== true) {
    diagnostics.push(
      error(
        "SHARE_COMMAND_REQUIRED",
        "Post creation requires an explicit Share Command.",
        "explicitShare",
      ),
    );
  }
  validateVisibility(input.visibility, "visibility", diagnostics);
  if (input.visibility !== "PUBLIC" && input.visibility !== "UNLISTED") {
    const scopeResourceId = input.references[0]?.referenceId ?? input.postId;
    const membership = authority.resolveMembership({
      tenantId: input.tenantId,
      resourceId: scopeResourceId,
      principalId: input.creatorId,
    });
    if (
      membership === null ||
      membership.allowed !== true
    ) {
      diagnostics.push(
        error(
          "PERMISSION_DENIED",
          "Scoped Post publication requires a canonical membership/owner decision.",
          "visibility",
        ),
      );
    }
  }
  if (
    !(<Social430PostStatus[]> [
      "DRAFT",
      "PUBLISHED",
      "ARCHIVED",
      "HIDDEN",
      "QUARANTINED",
    ]).includes(input.status)
  ) {
    diagnostics.push(
      error("INVALID_STATUS", "Post status is not supported.", "status"),
    );
  }
  validateBoundedText(input.caption, MAX_CAPTION, "caption", diagnostics);
  validateReferences(input.references, input.tenantId, diagnostics);
  const cards = input.cards ?? [];
  validateCards(cards, input.tenantId, diagnostics);
  if (input.references.length > 0 && cards.length === 0) {
    diagnostics.push(
      error(
        "CORE_CARD_REQUIRED",
        "Resource sharing requires an approved Core Card.",
        "cards",
      ),
    );
  }
  if (
    cards.some((card) =>
      !input.references.some((reference) =>
        reference.referenceId === card.resourceId
      )
    )
  ) {
    diagnostics.push(
      error(
        "INVALID_REFERENCE",
        "Every Card must bind to a Post source reference.",
        "cards",
      ),
    );
  }
  if (
    input.kind === "MARKET_CARD" &&
    !input.references.some((reference) => reference.kind === "MARKET_PRODUCT")
  ) {
    diagnostics.push(
      error(
        "MARKET_REFERENCE_REQUIRED",
        "Market Card posts require an existing Product reference.",
        "references",
      ),
    );
  }
  for (const [index, reference] of input.references.entries()) {
    const current = authority.resolveResource({
      tenantId: input.tenantId,
      resourceId: reference.referenceId,
      resourceType: reference.kind,
    });
    if (
      current === null ||
      current.visibility !== "PUBLIC" ||
      !["ACTIVE", "PUBLISHED"].includes(current.lifecycle) ||
      current.moderation !== "APPROVED" ||
      reference.recordVersion !== current.recordVersion ||
      current.contentHash === undefined ||
      reference.contentHash !== current.contentHash ||
      (current.revisionHash !== undefined &&
        reference.revisionHash !== current.revisionHash)
    ) {
      diagnostics.push(
        error(
          "CONTENT_UNAVAILABLE",
          "Post references require a current approved public resource.",
          `references[${index}]`,
        ),
      );
    }
  }
  for (const [index, card] of cards.entries()) {
    const current = authority.resolveResource({
      tenantId: input.tenantId,
      resourceId: card.resourceId,
      resourceType: card.cardType,
      cardType: card.cardType,
    });
    if (
      current === null ||
      current.cardType !== card.cardType ||
      current.visibility !== "PUBLIC" ||
      !["ACTIVE", "PUBLISHED"].includes(current.lifecycle) ||
      current.moderation !== "APPROVED" ||
      current.publicPresentationReference === undefined ||
      card.publicPresentationReference !==
        current.publicPresentationReference ||
      card.resourceRecordVersion !== current.recordVersion ||
      (current.revisionHash !== undefined &&
        card.resourceRevisionHash !== current.revisionHash) ||
      current.contentHash === undefined ||
      card.resourceContentHash !== current.contentHash
    ) {
      diagnostics.push(
        error(
          "CONTENT_UNAVAILABLE",
          "Card must match the current server resource projection.",
          `cards[${index}]`,
        ),
      );
    }
  }
  if (input.publicPath !== undefined && !validPath(input.publicPath)) {
    diagnostics.push(
      error(
        "INVALID_PATH",
        "Post path must be a safe same-origin path.",
        "publicPath",
      ),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_POST",
    resourceId: input.postId,
    action: "social430.post.create",
    capability: "social430.post.create",
    principalId: input.creatorId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  const captionHash = await hashCanonical({
    tenantId: input.tenantId,
    caption: input.caption,
    references: input.references,
    cards,
    visibility: input.visibility,
  });
  return success({
    postId: input.postId,
    shareCommandId: input.shareCommandId,
    tenantId: input.tenantId,
    creatorId: input.creatorId,
    sourceAccountId: input.sourceAccountId,
    kind: input.kind,
    visibility: input.visibility,
    status: input.status,
    caption: input.caption,
    captionHash,
    references: input.references.map((reference) => ({ ...reference })),
    cards: cards.map((card) => ({
      ...card,
      snapshotPolicy: { ...card.snapshotPolicy },
    })),
    ...(input.publicPath === undefined ? {} : { publicPath: input.publicPath }),
    explicitShare: true,
    recordVersion: 1,
  });
}

export function reconcileSocial430Post(
  existing: Social430Post | undefined,
  next: Social430Post,
): Social430Result<Social430Post> {
  if (existing === undefined) return success(next);
  if (existing.tenantId !== next.tenantId) {
    return failure([
      error(
        "CROSS_TENANT_REFERENCE",
        "Post identity cannot cross tenants.",
        "tenantId",
      ),
    ]);
  }
  if (
    existing.postId !== next.postId ||
    existing.shareCommandId !== next.shareCommandId ||
    existing.captionHash !== next.captionHash
  ) {
    return failure([
      error(
        "DUPLICATE_ID_CONFLICT",
        "Share identity was reused with different content.",
        "shareCommandId",
      ),
    ]);
  }
  if (next.recordVersion < existing.recordVersion) {
    return failure([
      error(
        "STALE_EVENT_REJECTED",
        "A stale Post revision cannot replace the current revision.",
        "recordVersion",
      ),
    ]);
  }
  return success(existing, [
    info(
      "DUPLICATE_ID_CONFLICT",
      "Identical Share Command is an idempotent no-op.",
      { idempotent: true },
    ),
  ]);
}

const POST_TRANSITIONS: Readonly<
  Record<Social430PostStatus, readonly string[]>
> = {
  DRAFT: ["PUBLISH", "ARCHIVE", "QUARANTINE"],
  PUBLISHED: ["ARCHIVE", "HIDE", "QUARANTINE"],
  ARCHIVED: [],
  HIDDEN: ["PUBLISH", "ARCHIVE", "QUARANTINE"],
  QUARANTINED: ["ARCHIVE"],
};

export function transitionSocial430Post(
  post: Social430Post,
  event: "PUBLISH" | "ARCHIVE" | "HIDE" | "QUARANTINE",
): Social430Result<Social430Post> {
  if (!POST_TRANSITIONS[post.status].includes(event)) {
    return failure([
      error(
        "INVALID_TRANSITION",
        "Post transition is not valid for its current status.",
        "event",
      ),
    ]);
  }
  const status: Social430PostStatus = event === "PUBLISH"
    ? "PUBLISHED"
    : event === "ARCHIVE"
    ? "ARCHIVED"
    : event === "HIDE"
    ? "HIDDEN"
    : "QUARANTINED";
  return success({ ...post, status, recordVersion: post.recordVersion + 1 });
}

export interface Social430Comment {
  readonly commentId: Social430CommentId;
  readonly tenantId: string;
  readonly postId: Social430PostId;
  readonly actorAccountId: string;
  readonly text: string;
  readonly textHash: ContentHash;
  readonly status: "VISIBLE" | "HIDDEN" | "DELETED";
  readonly recordVersion: number;
}

export async function createSocial430Comment(
  input: {
    readonly commentId: Social430CommentId;
    readonly tenantId: string;
    readonly post: Social430Post;
    readonly actorAccountId: string;
    readonly text: string;
    readonly authorizationProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Promise<Social430Result<Social430Comment>> {
  const diagnostics: Social430Diagnostic[] = [];
  validateTenant(
    input.tenantId,
    input.post.tenantId,
    "post.tenantId",
    diagnostics,
  );
  validateId(input.commentId, "commentId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.post.postId, "post.postId", diagnostics);
  validateId(input.actorAccountId, "actorAccountId", diagnostics);
  resolveCurrentPost(authority, input.tenantId, input.post, diagnostics);
  if (input.post.status !== "PUBLISHED") {
    diagnostics.push(
      error(
        "POST_NOT_PUBLISHED",
        "Comment requires a published Post.",
        "post.status",
      ),
    );
  }
  validateBoundedText(input.text, MAX_COMMENT, "text", diagnostics);
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_COMMENT",
    resourceId: input.commentId,
    action: "social430.comment.create",
    capability: "social430.comment.create",
    principalId: input.actorAccountId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    commentId: input.commentId,
    tenantId: input.tenantId,
    postId: input.post.postId,
    actorAccountId: input.actorAccountId,
    text: input.text,
    textHash: await hashCanonical({
      tenantId: input.tenantId,
      postId: input.post.postId,
      text: input.text,
    }),
    status: "VISIBLE",
    recordVersion: 1,
  });
}

export interface Social430Follow {
  readonly followId: Brand<string, "Social430FollowId">;
  readonly tenantId: string;
  readonly followerAccountId: string;
  readonly creatorId: string;
  readonly status: "ACTIVE" | "REMOVED";
  readonly identityHash: ContentHash;
}

export async function createSocial430Follow(
  input: {
    readonly followId: Brand<string, "Social430FollowId">;
    readonly tenantId: string;
    readonly followerAccountId: string;
    readonly creatorId: string;
    readonly authorizationProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Promise<Social430Result<Social430Follow>> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.followId, "followId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.followerAccountId, "followerAccountId", diagnostics);
  validateId(input.creatorId, "creatorId", diagnostics);
  const creator = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.creatorId,
    resourceType: "CREATOR",
  });
  if (
    creator === null ||
    !["ACTIVE", "PUBLISHED"].includes(creator.lifecycle) ||
    creator.moderation !== "APPROVED"
  ) {
    diagnostics.push(
      error(
        "CONTENT_UNAVAILABLE",
        "Follow target must match the current Creator projection.",
        "creatorId",
      ),
    );
  }
  if (input.followerAccountId === input.creatorId) {
    diagnostics.push(
      error(
        "SELF_FOLLOW_REJECTED",
        "An account cannot follow itself.",
        "creatorId",
      ),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_FOLLOW",
    resourceId: input.followId,
    action: "social430.follow.create",
    capability: "social430.follow.create",
    principalId: input.followerAccountId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    followId: input.followId,
    tenantId: input.tenantId,
    followerAccountId: input.followerAccountId,
    creatorId: input.creatorId,
    status: "ACTIVE",
    identityHash: await hashCanonical({
      tenantId: input.tenantId,
      followerAccountId: input.followerAccountId,
      creatorId: input.creatorId,
    }),
  });
}

export function reconcileSocial430Follow(
  existing: Social430Follow | undefined,
  next: Social430Follow,
): Social430Result<Social430Follow> {
  if (existing === undefined) return success(next);
  if (existing.tenantId !== next.tenantId) {
    return failure([
      error(
        "CROSS_TENANT_REFERENCE",
        "Follow identity cannot cross tenants.",
        "tenantId",
      ),
    ]);
  }
  if (
    existing.followId !== next.followId ||
    existing.identityHash !== next.identityHash
  ) {
    return failure([
      error(
        "DUPLICATE_ID_CONFLICT",
        "Follow identity was reused with different parties.",
        "followId",
      ),
    ]);
  }
  return success(existing, [
    info("DUPLICATE_ID_CONFLICT", "Identical Follow is an idempotent no-op.", {
      idempotent: true,
    }),
  ]);
}

export interface Social430Reaction {
  readonly reactionId: Brand<string, "Social430ReactionId">;
  readonly tenantId: string;
  readonly postId: Social430PostId;
  readonly actorAccountId: string;
  readonly type: "LIKE" | "LOVE" | "CELEBRATE" | "INTERESTED";
  readonly intentHash: ContentHash;
  readonly status: "ACTIVE" | "REMOVED";
}

export async function createSocial430Reaction(
  input: {
    readonly reactionId: Brand<string, "Social430ReactionId">;
    readonly tenantId: string;
    readonly post: Social430Post;
    readonly actorAccountId: string;
    readonly type: Social430Reaction["type"];
    readonly intentHash: ContentHash;
    readonly authorizationProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Promise<Social430Result<Social430Reaction>> {
  const diagnostics: Social430Diagnostic[] = [];
  validateTenant(
    input.tenantId,
    input.post.tenantId,
    "post.tenantId",
    diagnostics,
  );
  validateId(input.reactionId, "reactionId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.post.postId, "post.postId", diagnostics);
  validateId(input.actorAccountId, "actorAccountId", diagnostics);
  validateHash(input.intentHash, "intentHash", diagnostics);
  resolveCurrentPost(authority, input.tenantId, input.post, diagnostics);
  if (input.post.status !== "PUBLISHED") {
    diagnostics.push(
      error(
        "POST_NOT_PUBLISHED",
        "Reaction requires a published Post.",
        "post.status",
      ),
    );
  }
  if (
    !(<Social430Reaction["type"][]> ["LIKE", "LOVE", "CELEBRATE", "INTERESTED"])
      .includes(input.type)
  ) {
    diagnostics.push(
      error("INVALID_REFERENCE", "Reaction type is not supported.", "type"),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_REACTION",
    resourceId: input.reactionId,
    action: "social430.reaction.create",
    capability: "social430.reaction.create",
    principalId: input.actorAccountId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    reactionId: input.reactionId,
    tenantId: input.tenantId,
    postId: input.post.postId,
    actorAccountId: input.actorAccountId,
    type: input.type,
    intentHash: input.intentHash,
    status: "ACTIVE",
  });
}

export function reconcileSocial430Reaction(
  existing: Social430Reaction | undefined,
  next: Social430Reaction,
): Social430Result<Social430Reaction> {
  if (existing === undefined) return success(next);
  if (existing.tenantId !== next.tenantId) {
    return failure([
      error(
        "CROSS_TENANT_REFERENCE",
        "Reaction identity cannot cross tenants.",
        "tenantId",
      ),
    ]);
  }
  if (
    existing.reactionId !== next.reactionId ||
    existing.intentHash !== next.intentHash
  ) {
    return failure([
      error(
        "DUPLICATE_ID_CONFLICT",
        "Reaction identity was reused with different content.",
        "reactionId",
      ),
    ]);
  }
  return success(existing, [
    info(
      "DUPLICATE_ID_CONFLICT",
      "Identical Reaction is an idempotent no-op.",
      { idempotent: true },
    ),
  ]);
}

export interface Social430Mention {
  readonly mentionId: Brand<string, "Social430MentionId">;
  readonly tenantId: string;
  readonly sourceKind: "POST" | "COMMENT";
  readonly sourceId: string;
  readonly targetCreatorId: string;
  readonly actorAccountId: string;
  readonly status: "ACTIVE" | "REMOVED";
}

export function createSocial430Mention(input: {
  readonly mentionId: Brand<string, "Social430MentionId">;
  readonly tenantId: string;
  readonly sourceKind: Social430Mention["sourceKind"];
  readonly sourceId: string;
  readonly targetCreatorId: string;
  readonly actorAccountId: string;
  readonly authorizationProof?: AuthorizationProofV1;
}, authority: Social430ServerCapability): Social430Result<Social430Mention> {
  const diagnostics: Social430Diagnostic[] = [];
  for (
    const [value, path] of [
      [input.mentionId, "mentionId"],
      [input.tenantId, "tenantId"],
      [input.sourceId, "sourceId"],
      [input.targetCreatorId, "targetCreatorId"],
      [input.actorAccountId, "actorAccountId"],
    ] as const
  ) validateId(value, path, diagnostics);
  if (
    !(<Social430Mention["sourceKind"][]> ["POST", "COMMENT"]).includes(
      input.sourceKind,
    )
  ) {
    diagnostics.push(
      error(
        "INVALID_REFERENCE",
        "Mention source kind is not supported.",
        "sourceKind",
      ),
    );
  }
  const source = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.sourceId,
    resourceType: input.sourceKind,
  });
  const target = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.targetCreatorId,
    resourceType: "CREATOR",
  });
  if (
    source === null ||
    target === null ||
    !["ACTIVE", "PUBLISHED"].includes(source.lifecycle) ||
    source.moderation !== "APPROVED" ||
    !["ACTIVE", "PUBLISHED"].includes(target.lifecycle) ||
    target.moderation !== "APPROVED"
  ) {
    diagnostics.push(
      error(
        "CONTENT_UNAVAILABLE",
        "Mention source and target must match canonical server projections.",
        "sourceId",
      ),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_MENTION",
    resourceId: input.mentionId,
    action: "social430.mention.create",
    capability: "social430.mention.create",
    principalId: input.actorAccountId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    mentionId: input.mentionId,
    tenantId: input.tenantId,
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    targetCreatorId: input.targetCreatorId,
    actorAccountId: input.actorAccountId,
    status: "ACTIVE",
  });
}

export type Social430CommunityVisibility = Extract<
  Social430Visibility,
  "PUBLIC" | "UNLISTED" | "PROJECT_MEMBERS" | "PRIVATE"
>;

export interface Social430Community {
  readonly communityId: Social430CommunityId;
  readonly tenantId: string;
  readonly ownerCreatorId: string;
  readonly name: string;
  readonly visibility: Social430CommunityVisibility;
  readonly status: "ACTIVE" | "ARCHIVED" | "QUARANTINED";
  readonly recordVersion: 1;
}

export function createSocial430Community(input: {
  readonly communityId: Social430CommunityId;
  readonly tenantId: string;
  readonly ownerCreatorId: string;
  readonly name: string;
  readonly visibility: Social430CommunityVisibility;
  readonly authorizationProof?: AuthorizationProofV1;
}, authority: Social430ServerCapability): Social430Result<Social430Community> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.communityId, "communityId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.ownerCreatorId, "ownerCreatorId", diagnostics);
  validateBoundedText(input.name, 120, "name", diagnostics);
  validateVisibility(input.visibility, "visibility", diagnostics);
  if ((input.visibility as Social430Visibility) === "CREATOR_PRIVATE") {
    diagnostics.push(
      error(
        "INVALID_VISIBILITY",
        "Community visibility cannot use a Creator-only scope.",
        "visibility",
      ),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_COMMUNITY",
    resourceId: input.communityId,
    action: "social430.community.create",
    capability: "social430.community.create",
    principalId: input.ownerCreatorId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    communityId: input.communityId,
    tenantId: input.tenantId,
    ownerCreatorId: input.ownerCreatorId,
    name: input.name,
    visibility: input.visibility,
    status: "ACTIVE",
    recordVersion: 1,
  });
}

export interface Social430Membership {
  readonly membershipId: Social430MembershipId;
  readonly tenantId: string;
  readonly communityId: Social430CommunityId;
  readonly memberAccountId: string;
  readonly role: "OWNER" | "MODERATOR" | "MEMBER";
  readonly status: "ACTIVE" | "LEFT" | "BANNED";
}

export function createSocial430Membership(input: {
  readonly membershipId: Social430MembershipId;
  readonly tenantId: string;
  readonly communityId: Social430CommunityId;
  readonly memberAccountId: string;
  readonly role: Social430Membership["role"];
  readonly authorizationProof?: AuthorizationProofV1;
}, authority: Social430ServerCapability): Social430Result<Social430Membership> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.membershipId, "membershipId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.communityId, "communityId", diagnostics);
  validateId(input.memberAccountId, "memberAccountId", diagnostics);
  const community = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.communityId,
    resourceType: "COMMUNITY",
  });
  const membership = authority.resolveMembership({
    tenantId: input.tenantId,
    resourceId: input.communityId,
    principalId: input.memberAccountId,
  });
  if (
    community === null ||
    !["ACTIVE", "PUBLISHED"].includes(community.lifecycle) ||
    community.moderation !== "APPROVED" ||
    membership === null ||
    membership.allowed !== true
  ) {
    diagnostics.push(
      error(
        "INVALID_STATUS",
        "Membership requires the current active Community projection.",
        "communityId",
      ),
    );
  }
  if (
    !(<Social430Membership["role"][]> [
      "OWNER",
      "MODERATOR",
      "MEMBER",
    ]).includes(input.role)
  ) {
    diagnostics.push(
      error("INVALID_REFERENCE", "Membership role is not supported.", "role"),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_MEMBERSHIP",
    resourceId: input.membershipId,
    action: "social430.membership.create",
    capability: "social430.membership.create",
    principalId: input.memberAccountId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    membershipId: input.membershipId,
    tenantId: input.tenantId,
    communityId: input.communityId,
    memberAccountId: input.memberAccountId,
    role: membership!.role,
    status: "ACTIVE",
  });
}

export interface Social430CreatorPage {
  readonly pageId: Social430CreatorPageId;
  readonly tenantId: string;
  readonly creatorId: string;
  readonly displayName: string;
  readonly bio?: string;
  readonly publicPath: string;
  readonly visibility: "PUBLIC" | "CREATOR_PRIVATE";
  readonly status: "ACTIVE" | "HIDDEN";
}

export function createSocial430CreatorPage(
  input: {
    readonly pageId: Social430CreatorPageId;
    readonly tenantId: string;
    readonly creatorId: string;
    readonly displayName: string;
    readonly bio?: string;
    readonly publicPath: string;
    readonly visibility: Social430CreatorPage["visibility"];
    readonly authorizationProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Social430Result<Social430CreatorPage> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.pageId, "pageId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.creatorId, "creatorId", diagnostics);
  validateBoundedText(input.displayName, 120, "displayName", diagnostics);
  if (!(["PUBLIC", "CREATOR_PRIVATE"] as const).includes(input.visibility)) {
    diagnostics.push(
      error(
        "INVALID_VISIBILITY",
        "Creator Page visibility is not supported.",
        "visibility",
      ),
    );
  }
  if (input.bio !== undefined) {
    validateBoundedText(input.bio, 600, "bio", diagnostics);
  }
  if (!validPath(input.publicPath)) {
    diagnostics.push(
      error(
        "INVALID_PATH",
        "Creator Page requires a safe public path candidate.",
        "publicPath",
      ),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_CREATOR_PAGE",
    resourceId: input.pageId,
    action: "social430.creator-page.create",
    capability: "social430.creator-page.create",
    principalId: input.creatorId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    pageId: input.pageId,
    tenantId: input.tenantId,
    creatorId: input.creatorId,
    displayName: input.displayName,
    ...(input.bio === undefined ? {} : { bio: input.bio }),
    publicPath: input.publicPath,
    visibility: input.visibility,
    status: "ACTIVE",
  });
}

export interface Social430ProjectPage {
  readonly pageId: Social430ProjectPageId;
  readonly tenantId: string;
  readonly projectId: string;
  readonly ownerAccountId: string;
  readonly title: string;
  readonly summary?: string;
  readonly assetReferences: readonly string[];
  readonly publicPath: string;
  readonly visibility: Social430Visibility;
  readonly status: "ACTIVE" | "HIDDEN";
  readonly containsProjectBody: false;
}

export function createSocial430ProjectPage(
  input: {
    readonly pageId: Social430ProjectPageId;
    readonly tenantId: string;
    readonly projectId: string;
    readonly ownerAccountId: string;
    readonly title: string;
    readonly summary?: string;
    readonly assetReferences: readonly string[];
    readonly publicPath: string;
    readonly visibility: Social430Visibility;
    readonly authorizationProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Social430Result<Social430ProjectPage> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.pageId, "pageId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.projectId, "projectId", diagnostics);
  validateId(input.ownerAccountId, "ownerAccountId", diagnostics);
  validateBoundedText(input.title, 160, "title", diagnostics);
  validateVisibility(input.visibility, "visibility", diagnostics);
  if (input.summary !== undefined) {
    validateBoundedText(input.summary, MAX_CAPTION, "summary", diagnostics);
  }
  if (input.assetReferences.length > MAX_PAGE_REFERENCES) {
    diagnostics.push(
      error(
        "INVALID_REFERENCE",
        "Project Page references are bounded.",
        "assetReferences",
      ),
    );
  }
  for (const [index, assetId] of input.assetReferences.entries()) {
    validateId(assetId, `assetReferences[${index}]`, diagnostics);
  }
  if (!validPath(input.publicPath)) {
    diagnostics.push(
      error(
        "INVALID_PATH",
        "Project Page requires a safe public path candidate.",
        "publicPath",
      ),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_PROJECT_PAGE",
    resourceId: input.pageId,
    action: "social430.project-page.create",
    capability: "social430.project-page.create",
    principalId: input.ownerAccountId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    pageId: input.pageId,
    tenantId: input.tenantId,
    projectId: input.projectId,
    ownerAccountId: input.ownerAccountId,
    title: input.title,
    ...(input.summary === undefined ? {} : { summary: input.summary }),
    assetReferences: [...input.assetReferences],
    publicPath: input.publicPath,
    visibility: input.visibility,
    status: "ACTIVE",
    containsProjectBody: false,
  });
}

export interface Social430MyPage {
  readonly pageId: Social430MyPageId;
  readonly tenantId: string;
  readonly ownerAccountId: string;
  readonly creatorId?: string;
  readonly postIds: readonly Social430PostId[];
  readonly communityIds: readonly Social430CommunityId[];
  readonly visibility: "OWNER_ONLY";
  readonly hasPrivateData: false;
}

export function createSocial430MyPage(input: {
  readonly pageId: Social430MyPageId;
  readonly tenantId: string;
  readonly ownerAccountId: string;
  readonly creatorId?: string;
  readonly postIds: readonly Social430PostId[];
  readonly communityIds: readonly Social430CommunityId[];
  readonly authorizationProof?: AuthorizationProofV1;
}, authority: Social430ServerCapability): Social430Result<Social430MyPage> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.pageId, "pageId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.ownerAccountId, "ownerAccountId", diagnostics);
  if (input.creatorId !== undefined) {
    validateId(input.creatorId, "creatorId", diagnostics);
  }
  if (input.postIds.length > MAX_PAGE_REFERENCES) {
    diagnostics.push(
      error(
        "INVALID_REFERENCE",
        "My Page post references are bounded.",
        "postIds",
      ),
    );
  }
  if (input.communityIds.length > MAX_PAGE_REFERENCES) {
    diagnostics.push(
      error(
        "INVALID_REFERENCE",
        "My Page community references are bounded.",
        "communityIds",
      ),
    );
  }
  for (const [index, postId] of input.postIds.entries()) {
    validateId(postId, `postIds[${index}]`, diagnostics);
  }
  for (const [index, communityId] of input.communityIds.entries()) {
    validateId(communityId, `communityIds[${index}]`, diagnostics);
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_MY_PAGE",
    resourceId: input.pageId,
    action: "social430.my-page.create",
    capability: "social430.my-page.create",
    principalId: input.ownerAccountId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    pageId: input.pageId,
    tenantId: input.tenantId,
    ownerAccountId: input.ownerAccountId,
    ...(input.creatorId === undefined ? {} : { creatorId: input.creatorId }),
    postIds: [...input.postIds],
    communityIds: [...input.communityIds],
    visibility: "OWNER_ONLY",
    hasPrivateData: false,
  });
}

export interface Social430MarketCardReference {
  readonly cardId: Brand<string, "Social430MarketCardId">;
  readonly tenantId: string;
  readonly postId: Social430PostId;
  readonly marketProductId: string;
  readonly packageId: string;
  readonly packageContentHash: ContentHash;
  readonly preservedPath: string;
  readonly coreCard: Social430CoreCard;
  readonly createsProduct: false;
  readonly createsPurchase: false;
  readonly createsEntitlement: false;
  readonly createsLicense: false;
  readonly createsRoyalty: false;
  readonly createsPayout: false;
  readonly createsLedger: false;
  readonly status: "REFERENCE_ONLY" | "HIDDEN";
}

export function createSocial430MarketCardReference(
  input: {
    readonly cardId: Brand<string, "Social430MarketCardId">;
    readonly tenantId: string;
    readonly post: Social430Post;
    readonly marketProductId: string;
    readonly packageId: string;
    readonly authorizationProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Social430Result<Social430MarketCardReference> {
  const diagnostics: Social430Diagnostic[] = [];
  validateTenant(
    input.tenantId,
    input.post.tenantId,
    "post.tenantId",
    diagnostics,
  );
  validateId(input.cardId, "cardId", diagnostics);
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.post.postId, "post.postId", diagnostics);
  validateId(input.marketProductId, "marketProductId", diagnostics);
  validateId(input.packageId, "packageId", diagnostics);
  resolveCurrentPost(authority, input.tenantId, input.post, diagnostics);
  if (input.post.status !== "PUBLISHED") {
    diagnostics.push(
      error(
        "POST_NOT_PUBLISHED",
        "Market Card requires a published Post.",
        "post.status",
      ),
    );
  }
  if (input.post.kind !== "MARKET_CARD") {
    diagnostics.push(
      error(
        "INVALID_REFERENCE",
        "Only a Market Card Post may carry a Market Card.",
        "post.kind",
      ),
    );
  }
  if (
    !input.post.references.some((reference) =>
      reference.tenantId === input.tenantId &&
      reference.kind === "MARKET_PRODUCT" &&
      reference.referenceId === input.marketProductId
    )
  ) {
    diagnostics.push(
      error(
        "MARKET_REFERENCE_REQUIRED",
        "Market Card must bind to the Post's existing Product reference.",
        "post.references",
      ),
    );
  }
  const market = authority.resolveMarketReference({
    tenantId: input.tenantId,
    marketProductId: input.marketProductId,
    packageId: input.packageId,
  });
  if (
    market === null ||
    market.locked !== true ||
    market.visibility !== "PUBLIC" ||
    !["ACTIVE", "PUBLISHED"].includes(market.lifecycle) ||
    market.moderation !== "APPROVED" ||
    !validPath(market.preservedPath)
  ) {
    diagnostics.push(
      error(
        "MARKET_REFERENCE_REQUIRED",
        "Market Card requires the current locked public Product/Package reference.",
        "marketProductId",
      ),
    );
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_MARKET_CARD",
    resourceId: input.cardId,
    action: "social430.market-card.create",
    capability: "social430.market-card.create",
    principalId: input.post.creatorId,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  const coreCard: Social430CoreCard = {
    cardId: input.cardId as unknown as Social430CoreCardId,
    tenantId: input.tenantId,
    cardType: "MARKET_PRODUCT",
    resourceId: input.marketProductId,
    resourceRecordVersion: market!.recordVersion,
    resourceContentHash: market!.packageContentHash,
    cardVersion: 1,
    publicPresentationReference: market!.preservedPath,
    snapshotPolicy: {
      price: "LIVE",
      availability: "LIVE",
      creator: "LIVE",
      preview: "LIVE",
    },
    visibilityAtShare: "PUBLIC",
    moderationAtShare: "APPROVED",
    approvedAtShare: true,
    status: "APPROVED",
  };
  return success({
    cardId: input.cardId,
    tenantId: input.tenantId,
    postId: input.post.postId,
    marketProductId: input.marketProductId,
    packageId: input.packageId,
    packageContentHash: market!.packageContentHash,
    preservedPath: market!.preservedPath,
    coreCard,
    createsProduct: false,
    createsPurchase: false,
    createsEntitlement: false,
    createsLicense: false,
    createsRoyalty: false,
    createsPayout: false,
    createsLedger: false,
    status: "REFERENCE_ONLY",
  });
}

export interface Social430PermissionResult {
  readonly ok: boolean;
  readonly decision: "ALLOW" | "DENY";
  readonly visibility: Social430Visibility;
  readonly diagnostics: readonly Social430Diagnostic[];
}

export function resolveSocial430Read(input: {
  readonly tenantId: string;
  readonly resourceId: string;
  readonly requesterAccountId?: string;
  readonly blocked?: boolean;
  readonly offline?: boolean;
  readonly authorizationProof?: AuthorizationProofV1;
}, authority: Social430ServerCapability): Social430PermissionResult {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.resourceId, "resourceId", diagnostics);
  const current = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.resourceId,
  });
  if (current === null) {
    diagnostics.push(
      error(
        "PERMISSION_DENIED",
        "The server could not resolve the canonical resource.",
        "resourceId",
      ),
    );
  }
  if (input.offline === true) {
    diagnostics.push(
      error("OFFLINE", "Social read is unavailable offline.", "offline"),
    );
  }
  if (input.blocked === true) {
    diagnostics.push(
      error(
        "BLOCKED_USER",
        "Blocked participant cannot read this Social scope.",
        "blocked",
      ),
    );
  }
  if (
    current !== null && current.visibility !== "PUBLIC" &&
    input.requesterAccountId === undefined
  ) {
    diagnostics.push(
      error(
        "PRIVATE_RESOURCE",
        "Scoped resources require an authenticated requester.",
      ),
    );
  }
  if (
    current !== null &&
    current.visibility !== "PUBLIC" &&
    input.requesterAccountId !== undefined
  ) {
    const ownerAllowed = current.visibility === "CREATOR_PRIVATE" &&
      current.ownerPrincipalId === input.requesterAccountId;
    const membership = current.visibility !== "CREATOR_PRIVATE"
      ? authority.resolveMembership({
        tenantId: input.tenantId,
        resourceId: input.resourceId,
        principalId: input.requesterAccountId,
      })
      : null;
    const memberAllowed = membership?.allowed === true;
    if (!ownerAllowed && !memberAllowed) {
      diagnostics.push(
        error(
          "PERMISSION_DENIED",
          "Scoped read requires the canonical owner or membership decision.",
          "requesterAccountId",
        ),
      );
    }
  }
  if (
    current !== null &&
    ["HIDDEN", "ARCHIVED", "QUARANTINED", "DELETED", "TRASHED", "UNPUBLISHED"]
      .includes(current.lifecycle)
  ) {
    diagnostics.push(
      error(
        "PRIVATE_RESOURCE",
        "Resource is not currently readable.",
        "resourceId",
      ),
    );
  }
  if (current !== null && current.moderation !== "APPROVED") {
    diagnostics.push(
      error(
        "CONTENT_UNAVAILABLE",
        "Resource moderation is not currently approved.",
        "resourceId",
      ),
    );
  }
  boundaryDiagnostics(input, diagnostics);
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_READ",
    resourceId: input.resourceId,
    action: "social430.read",
    capability: "social430.read",
    principalId: input.requesterAccountId ?? null,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  if (proof === null || hasError(diagnostics)) {
    return {
      ok: false,
      decision: "DENY",
      visibility: current?.visibility ?? "PRIVATE",
      diagnostics,
    };
  }
  return {
    ok: true,
    decision: "ALLOW",
    visibility: current!.visibility,
    diagnostics: [],
  };
}

export type Social430ContentStatus =
  | "ACTIVE"
  | "PUBLISHED"
  | "PRIVATE"
  | "DELETED"
  | "TRASHED"
  | "QUARANTINED"
  | "UNPUBLISHED"
  | "HIDDEN"
  | "ARCHIVED";

export interface Social430CardResolution {
  readonly status: "AVAILABLE" | "CONTENT_UNAVAILABLE";
  /** Intentionally omitted for unavailable content; no stale URL/reference is returned. */
  readonly card?: Social430CoreCard;
  readonly placeholder?: "CONTENT_UNAVAILABLE";
  readonly diagnostics: readonly Social430Diagnostic[];
}

export function resolveSocial430CoreCard(input: {
  readonly card: Social430CoreCard;
  readonly tenantId: string;
  readonly authorizationProof?: AuthorizationProofV1;
}, authority: Social430ServerCapability): Social430CardResolution {
  const unavailable = (): Social430CardResolution => ({
    status: "CONTENT_UNAVAILABLE",
    placeholder: "CONTENT_UNAVAILABLE",
    diagnostics: [
      error(
        "CONTENT_UNAVAILABLE",
        "Current visibility, lifecycle, moderation, or permission no longer allows this Card.",
      ),
    ],
  });
  const current = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.card.resourceId,
    resourceType: input.card.cardType,
    cardType: input.card.cardType,
  });
  if (
    input.tenantId !== input.card.tenantId ||
    current === null ||
    current.cardType !== input.card.cardType ||
    current.visibility !== "PUBLIC" ||
    !["ACTIVE", "PUBLISHED"].includes(current.lifecycle) ||
    current.moderation !== "APPROVED" ||
    current.publicPresentationReference !==
      input.card.publicPresentationReference ||
    input.card.resourceRecordVersion !== current.recordVersion ||
    current.contentHash === undefined ||
    input.card.resourceContentHash !== current.contentHash ||
    (current.revisionHash !== undefined &&
      input.card.resourceRevisionHash !== current.revisionHash)
  ) return unavailable();
  const diagnostics: Social430Diagnostic[] = [];
  boundaryDiagnostics(input, diagnostics);
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_CORE_CARD",
    resourceId: input.card.cardId,
    action: "social430.card.read",
    capability: "social430.card.read",
    principalId: null,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  if (proof === null || hasError(diagnostics)) return unavailable();
  return { status: "AVAILABLE", card: input.card, diagnostics: [] };
}

export interface Social430SearchEligibility {
  readonly indexable: boolean;
  readonly reason:
    | "PUBLIC_PUBLISHED_APPROVED"
    | "NOT_PUBLISHED"
    | "NOT_PUBLIC"
    | "MODERATION_NOT_APPROVED"
    | "PERMISSION_DENIED"
    | "CROSS_TENANT";
  readonly cardId?: Social430CoreCardId;
  readonly resourceId?: string;
}

export function resolveSocial430SearchEligibility(input: {
  readonly card: Social430CoreCard;
  readonly tenantId: string;
  readonly authorizationProof?: AuthorizationProofV1;
}, authority: Social430ServerCapability): Social430SearchEligibility {
  if (input.tenantId !== input.card.tenantId) {
    return { indexable: false, reason: "CROSS_TENANT" };
  }
  const current = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.card.resourceId,
    resourceType: input.card.cardType,
    cardType: input.card.cardType,
  });
  if (current === null) {
    return { indexable: false, reason: "PERMISSION_DENIED" };
  }
  if (
    !["ACTIVE", "PUBLISHED"].includes(current.lifecycle)
  ) return { indexable: false, reason: "NOT_PUBLISHED" };
  if (current.visibility !== "PUBLIC") {
    return { indexable: false, reason: "NOT_PUBLIC" };
  }
  if (
    current.moderation !== "APPROVED" ||
    current.publicPresentationReference !==
      input.card.publicPresentationReference ||
    input.card.resourceRecordVersion !== current.recordVersion ||
    current.contentHash === undefined ||
    input.card.resourceContentHash !== current.contentHash ||
    (current.revisionHash !== undefined &&
      input.card.resourceRevisionHash !== current.revisionHash)
  ) {
    return { indexable: false, reason: "MODERATION_NOT_APPROVED" };
  }
  const diagnostics: Social430Diagnostic[] = [];
  boundaryDiagnostics(input, diagnostics);
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_SEARCH",
    resourceId: input.card.resourceId,
    action: "social430.search.index",
    capability: "social430.search.index",
    principalId: null,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  if (proof === null || hasError(diagnostics)) {
    return { indexable: false, reason: "PERMISSION_DENIED" };
  }
  return {
    indexable: true,
    reason: "PUBLIC_PUBLISHED_APPROVED",
    cardId: input.card.cardId,
    resourceId: input.card.resourceId,
  };
}

export type Social430EventType =
  | "POST_PUBLISHED"
  | "COMMENT_CREATED"
  | "FOLLOW_CHANGED"
  | "REACTION_CHANGED"
  | "MENTION_CREATED"
  | "COMMUNITY_CHANGED"
  | "MARKET_CARD_REFERENCED"
  | "VISIBILITY_REVOKED";

const SOCIAL430_EVENT_TYPES: readonly Social430EventType[] = [
  "POST_PUBLISHED",
  "COMMENT_CREATED",
  "FOLLOW_CHANGED",
  "REACTION_CHANGED",
  "MENTION_CREATED",
  "COMMUNITY_CHANGED",
  "MARKET_CARD_REFERENCED",
  "VISIBILITY_REVOKED",
];

export interface Social430TrustedEvent {
  readonly eventId: Social430EventId;
  readonly tenantId: string;
  readonly eventType: Social430EventType;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly actorReference: string;
  readonly objectReference: string;
  readonly visibility: Social430Visibility;
  readonly presentationKey: string;
  readonly safeMetadata: Readonly<Record<string, string | number | boolean>>;
  readonly payloadHash: ContentHash;
  readonly producerProof: AuthorizationProofV1;
}

export async function createSocial430TrustedEvent(
  input: {
    readonly eventId: Social430EventId;
    readonly tenantId: string;
    readonly eventType: Social430EventType;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly actorReference: string;
    readonly objectReference: string;
    readonly visibility: Social430Visibility;
    readonly presentationKey: string;
    readonly safeMetadata?: Readonly<Record<string, string | number | boolean>>;
    readonly producerProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Promise<Social430Result<Social430TrustedEvent>> {
  const diagnostics: Social430Diagnostic[] = [];
  for (
    const [value, path] of [
      [input.eventId, "eventId"],
      [input.tenantId, "tenantId"],
      [input.aggregateId, "aggregateId"],
      [input.actorReference, "actorReference"],
      [input.objectReference, "objectReference"],
      [input.presentationKey, "presentationKey"],
    ] as const
  ) validateId(value, path, diagnostics);
  validateVisibility(input.visibility, "visibility", diagnostics);
  if (!SOCIAL430_EVENT_TYPES.includes(input.eventType)) {
    diagnostics.push(
      error("INVALID_REFERENCE", "Event type is not supported.", "eventType"),
    );
  }
  const current = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.aggregateId,
  });
  if (
    current === null ||
    current.visibility !== input.visibility
  ) {
    diagnostics.push(
      error(
        "STALE_EVENT_REJECTED",
        "Event state must match the current server aggregate revision.",
        "aggregateVersion",
      ),
    );
  }
  if (
    !Number.isSafeInteger(input.aggregateVersion) || input.aggregateVersion < 1
  ) {
    diagnostics.push(
      error(
        "INVALID_REFERENCE",
        "Event aggregate version must be positive.",
        "aggregateVersion",
      ),
    );
  }
  const safeMetadata = input.safeMetadata ?? {};
  if (
    Object.keys(safeMetadata).length > MAX_SAFE_METADATA_KEYS ||
    JSON.stringify(safeMetadata).length > MAX_EVENT_METADATA
  ) {
    diagnostics.push(
      error("INVALID_REFERENCE", "Event metadata is bounded.", "safeMetadata"),
    );
  }
  for (const value of Object.values(safeMetadata)) {
    if (!["string", "number", "boolean"].includes(typeof value)) {
      diagnostics.push(
        error(
          "FORBIDDEN_PRIVATE_DATA",
          "Event metadata accepts scalar values only.",
          "safeMetadata",
        ),
      );
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      diagnostics.push(
        error(
          "INVALID_REFERENCE",
          "Event metadata numbers must be finite.",
          "safeMetadata",
        ),
      );
    }
  }
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_EVENT",
    resourceId: input.aggregateId,
    action: "social430.event.create",
    capability: "social430.event.create",
    principalId: input.actorReference,
    authorizationProof: input.producerProof,
  }, diagnostics);
  boundaryDiagnostics({ ...input, safeMetadata }, diagnostics);
  if (proof === null) {
    diagnostics.push(
      error(
        "EVENT_NOT_TRUSTED",
        "Only a tenant-bound server producer may create a trusted Event.",
        "producerProof",
      ),
    );
  }
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  const payloadHash = await hashCanonical({
    tenantId: input.tenantId,
    eventType: input.eventType,
    aggregateId: input.aggregateId,
    aggregateVersion: input.aggregateVersion,
    actorReference: input.actorReference,
    objectReference: input.objectReference,
    visibility: input.visibility,
    presentationKey: input.presentationKey,
    safeMetadata,
  });
  const event: Social430TrustedEvent = {
    eventId: input.eventId,
    tenantId: input.tenantId,
    eventType: input.eventType,
    aggregateId: input.aggregateId,
    aggregateVersion: input.aggregateVersion,
    actorReference: input.actorReference,
    objectReference: input.objectReference,
    visibility: input.visibility,
    presentationKey: input.presentationKey,
    safeMetadata: { ...safeMetadata },
    payloadHash,
    producerProof: proof,
  };
  authority.recordCanonicalEvent(event);
  return success(event);
}

export type Social430ProjectionStatus =
  | "ACCEPTED"
  | "IDEMPOTENT"
  | "STALE"
  | "GAP"
  | "CONFLICT";

/** @internal Bound only by the server-only event adapter; not a public API. */
export class Social430EventProjectionLedger {
  readonly #authority: Social430ServerCapability;
  readonly #events = new Map<string, Social430TrustedEvent>();
  readonly #heads = new Map<string, number>();
  readonly #revokedAggregates = new Set<string>();
  #sideEffectCount = 0;

  constructor(authority: Social430ServerCapability) {
    this.#authority = authority;
  }

  async accept(
    eventId: Social430EventId,
  ): Promise<Social430Result<Social430ProjectionStatus>> {
    if (typeof eventId !== "string" || !validId(eventId)) {
      return failure([
        error(
          "EVENT_NOT_TRUSTED",
          "Projection accepts only a canonical Event identity.",
          "eventId",
        ),
      ]);
    }
    const event = this.#authority.resolveEvent(eventId);
    if (event === null) {
      return failure([
        error(
          "EVENT_NOT_TRUSTED",
          "The server Event/Outbox resolver did not return this Event.",
          "eventId",
        ),
      ]);
    }
    try {
      const expected = {
        principalId: event.actorReference,
        resourceType: "SOCIAL430_EVENT",
        resourceId: event.aggregateId,
        action: "social430.event.create",
        capability: "social430.event.create",
        tenantId: event.tenantId,
        policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
      } as const;
      this.#authority.authorize(expected, event.producerProof);
      requireAuthorizationProofV1(event.producerProof, expected);
    } catch {
      return failure([
        error(
          "EVENT_NOT_TRUSTED",
          "Projection accepts only a tenant-bound server producer proof.",
          "producerProof",
        ),
      ]);
    }
    const canonicalPayloadHash = await hashCanonical({
      tenantId: event.tenantId,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion,
      actorReference: event.actorReference,
      objectReference: event.objectReference,
      visibility: event.visibility,
      presentationKey: event.presentationKey,
      safeMetadata: event.safeMetadata,
    });
    if (canonicalPayloadHash !== event.payloadHash) {
      return failure([
        error(
          "EVENT_NOT_TRUSTED",
          "Canonical Event payload integrity does not match the server hash.",
          "payloadHash",
        ),
      ]);
    }
    const current = this.#authority.resolveResource({
      tenantId: event.tenantId,
      resourceId: event.aggregateId,
    });
    if (current === null) {
      return failure([
        error(
          "EVENT_NOT_TRUSTED",
          "The aggregate was not resolved by the canonical server state.",
          "aggregateId",
        ),
      ]);
    }
    const existing = this.#events.get(event.eventId);
    if (existing !== undefined) {
      if (
        existing.tenantId === event.tenantId &&
        existing.payloadHash === event.payloadHash
      ) {
        return success("IDEMPOTENT", [
          info(
            "DUPLICATE_ID_CONFLICT",
            "Duplicate Event is an idempotent no-op.",
            { idempotent: true, sideEffects: 0 },
          ),
        ]);
      }
      return failure([
        error(
          "DUPLICATE_EVENT_CONFLICT",
          "Event identity was reused with a different tenant or payload.",
          "eventId",
        ),
      ]);
    }
    const aggregateKey = `${event.tenantId}\u0000${event.aggregateId}`;
    if (this.#revokedAggregates.has(aggregateKey)) {
      return failure([
        error(
          "CONTENT_UNAVAILABLE",
          "A visibility-revoked aggregate cannot be re-published by a stale Event.",
          "aggregateId",
        ),
      ]);
    }
    if (event.aggregateVersion > current.recordVersion) {
      return failure([
        error(
          "EVENT_VERSION_GAP",
          "Event revision is ahead of the canonical aggregate state.",
          "aggregateVersion",
        ),
      ]);
    }
    if (event.aggregateVersion < current.recordVersion) {
      return failure([
        error(
          "STALE_EVENT_REJECTED",
          "Event revision is behind the canonical aggregate state.",
          "aggregateVersion",
        ),
      ]);
    }
    const head = this.#heads.get(aggregateKey) ?? 0;
    if (event.aggregateVersion <= head) {
      return failure([
        error(
          "STALE_EVENT_REJECTED",
          "A stale Event cannot rewind an aggregate projection.",
          "aggregateVersion",
        ),
      ]);
    }
    if (event.aggregateVersion > head + 1) {
      return failure([
        error(
          "EVENT_VERSION_GAP",
          "An Event version gap must be retained for explicit resume.",
          "aggregateVersion",
        ),
      ]);
    }
    this.#events.set(event.eventId, event);
    this.#heads.set(aggregateKey, event.aggregateVersion);
    if (event.eventType === "VISIBILITY_REVOKED") {
      this.#revokedAggregates.add(aggregateKey);
    }
    return success("ACCEPTED");
  }

  async revokeVisibility(input: {
    readonly tenantId: string;
    readonly aggregateId: string;
    readonly lifecycleEventId: Social430EventId;
    readonly authorizationProof?: AuthorizationProofV1;
  }): Promise<Social430Result<true>> {
    const diagnostics: Social430Diagnostic[] = [];
    validateId(input.tenantId, "tenantId", diagnostics);
    validateId(input.aggregateId, "aggregateId", diagnostics);
    validateId(input.lifecycleEventId, "lifecycleEventId", diagnostics);
    const current = this.#authority.resolveResource({
      tenantId: input.tenantId,
      resourceId: input.aggregateId,
    });
    if (current === null) {
      diagnostics.push(
        error(
          "PERMISSION_DENIED",
          "Visibility revoke requires a canonical aggregate state.",
          "aggregateId",
        ),
      );
    }
    const lifecycleEvent = this.#authority.resolveEvent(input.lifecycleEventId);
    if (
      lifecycleEvent === null ||
      lifecycleEvent.tenantId !== input.tenantId ||
      lifecycleEvent.aggregateId !== input.aggregateId ||
      lifecycleEvent.objectReference !== input.aggregateId ||
      lifecycleEvent.eventType !== "VISIBILITY_REVOKED" ||
      (current !== null && lifecycleEvent.visibility !== current.visibility) ||
      (current !== null &&
        lifecycleEvent.aggregateVersion !== current.recordVersion)
    ) {
      diagnostics.push(
        error(
          "LIFECYCLE_TRANSITION_NOT_AUTHORIZED",
          "Visibility revoke requires a current server-resolved lifecycle Event.",
          "lifecycleEventId",
        ),
      );
    }
    if (lifecycleEvent !== null) {
      try {
        const expected = {
          principalId: lifecycleEvent.actorReference,
          resourceType: "SOCIAL430_EVENT",
          resourceId: lifecycleEvent.aggregateId,
          action: "social430.event.create",
          capability: "social430.event.create",
          tenantId: lifecycleEvent.tenantId,
          policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
        } as const;
        this.#authority.authorize(expected, lifecycleEvent.producerProof);
        requireAuthorizationProofV1(lifecycleEvent.producerProof, expected);
        const canonicalPayloadHash = await hashCanonical({
          tenantId: lifecycleEvent.tenantId,
          eventType: lifecycleEvent.eventType,
          aggregateId: lifecycleEvent.aggregateId,
          aggregateVersion: lifecycleEvent.aggregateVersion,
          actorReference: lifecycleEvent.actorReference,
          objectReference: lifecycleEvent.objectReference,
          visibility: lifecycleEvent.visibility,
          presentationKey: lifecycleEvent.presentationKey,
          safeMetadata: lifecycleEvent.safeMetadata,
        });
        if (canonicalPayloadHash !== lifecycleEvent.payloadHash) {
          throw new Error("lifecycle event payload integrity mismatch");
        }
      } catch {
        diagnostics.push(
          error(
            "EVENT_NOT_TRUSTED",
            "Visibility revoke requires an integrity-checked server lifecycle Event.",
            "lifecycleEventId",
          ),
        );
      }
    }
    const proof = requireAuthorization(this.#authority, {
      tenantId: input.tenantId,
      resourceType: "SOCIAL430_VISIBILITY_REVOKE",
      resourceId: input.aggregateId,
      action: "social430.visibility.revoke",
      capability: "social430.visibility.revoke",
      principalId: null,
      authorizationProof: input.authorizationProof,
    }, diagnostics);
    boundaryDiagnostics(input, diagnostics);
    if (proof === null) {
      diagnostics.push(
        error(
          "PERMISSION_DENIED",
          "Visibility revoke requires server authorization.",
          "authorizationProof",
        ),
      );
    }
    if (hasError(diagnostics)) return failure(diagnostics);
    this.#revokedAggregates.add(`${input.tenantId}\u0000${input.aggregateId}`);
    return success(true, [
      info(
        "CONTENT_UNAVAILABLE",
        "Visibility revoke is projection-only; no external side effect executed.",
        { aggregateId: input.aggregateId, sideEffects: 0 },
      ),
    ]);
  }

  replay(): Social430Result<
    { readonly eventCount: number; readonly sideEffects: number }
  > {
    this.#sideEffectCount = 0;
    return success({
      eventCount: this.#events.size,
      sideEffects: this.#sideEffectCount,
    }, [
      info(
        "REPLAY_SIDE_EFFECT_REJECTED",
        "Replay rebuilds references only and cannot send, publish, or mutate commerce.",
        { sideEffects: 0 },
      ),
    ]);
  }

  snapshot(): Readonly<
    {
      readonly eventCount: number;
      readonly aggregateHeads: Readonly<Record<string, number>>;
      readonly revokedAggregateCount: number;
      readonly sideEffects: number;
    }
  > {
    return {
      eventCount: this.#events.size,
      aggregateHeads: Object.fromEntries(this.#heads),
      revokedAggregateCount: this.#revokedAggregates.size,
      sideEffects: this.#sideEffectCount,
    };
  }
}

export interface Social430NotificationReference {
  readonly referenceId: Brand<string, "Social430NotificationReferenceId">;
  readonly tenantId: string;
  readonly sourceEventId: Social430EventId;
  readonly recipientAccountId: string;
  readonly objectReference: string;
  readonly presentationKey: string;
  readonly visibility: Social430Visibility;
  readonly containsBody: false;
  readonly deliveryFailureRollsBackCanonicalState: false;
}

export function createSocial430NotificationReference(
  input: {
    readonly referenceId: Brand<string, "Social430NotificationReferenceId">;
    readonly sourceEventId: Social430EventId;
    readonly recipientTenantId: string;
    readonly recipientAccountId: string;
    readonly recipientProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Social430Result<Social430NotificationReference> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.referenceId, "referenceId", diagnostics);
  validateId(input.sourceEventId, "sourceEventId", diagnostics);
  const event = authority.resolveEvent(input.sourceEventId);
  if (event === null) {
    diagnostics.push(
      error(
        "EVENT_NOT_TRUSTED",
        "Notification references require a canonical server Event.",
        "sourceEventId",
      ),
    );
  }
  validateTenant(
    event?.tenantId ?? input.recipientTenantId,
    input.recipientTenantId,
    "recipientTenantId",
    diagnostics,
  );
  validateId(input.recipientAccountId, "recipientAccountId", diagnostics);
  const proof = requireAuthorization(authority, {
    tenantId: input.recipientTenantId,
    resourceType: "SOCIAL430_RECIPIENT",
    resourceId: input.recipientAccountId,
    action: "social430.notification.resolve",
    capability: "social430.notification.resolve",
    principalId: input.recipientAccountId,
    authorizationProof: input.recipientProof,
  }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    referenceId: input.referenceId,
    tenantId: input.recipientTenantId,
    sourceEventId: event!.eventId,
    recipientAccountId: input.recipientAccountId,
    objectReference: event!.objectReference,
    presentationKey: event!.presentationKey,
    visibility: event!.visibility,
    containsBody: false,
    deliveryFailureRollsBackCanonicalState: false,
  });
}

export interface Social430PublicUrlCandidate {
  readonly tenantId: string;
  readonly resourceType:
    | "POST"
    | "CREATOR_PAGE"
    | "PROJECT_PAGE"
    | "COMMUNITY"
    | "MARKET_CARD";
  readonly resourceId: string;
  readonly path: string;
  readonly redirectExecuted: false;
}

export function createSocial430PublicUrlCandidate(
  input: {
    readonly tenantId: string;
    readonly resourceType: Social430PublicUrlCandidate["resourceType"];
    readonly resourceId: string;
    readonly authorizationProof?: AuthorizationProofV1;
  },
  authority: Social430ServerCapability,
): Social430Result<Social430PublicUrlCandidate> {
  const diagnostics: Social430Diagnostic[] = [];
  validateId(input.tenantId, "tenantId", diagnostics);
  validateId(input.resourceId, "resourceId", diagnostics);
  const current = authority.resolveResource({
    tenantId: input.tenantId,
    resourceId: input.resourceId,
  });
  if (
    current === null ||
    current.visibility !== "PUBLIC" ||
    !["PUBLISHED", "ACTIVE"].includes(current.lifecycle) ||
    current.moderation !== "APPROVED" ||
    current.publicPresentationReference === undefined ||
    !validPath(current.publicPresentationReference)
  ) {
    diagnostics.push(
      error(
        "PRIVATE_RESOURCE",
        "Only the current active public resource receives a URL candidate.",
        "resourceId",
      ),
    );
  }
  boundaryDiagnostics(input, diagnostics);
  const proof = requireAuthorization(authority, {
    tenantId: input.tenantId,
    resourceType: "SOCIAL430_PUBLIC_URL",
    resourceId: input.resourceId,
    action: "social430.public-url.resolve",
    capability: "social430.public-url.resolve",
    principalId: null,
    authorizationProof: input.authorizationProof,
  }, diagnostics);
  if (proof === null || hasError(diagnostics)) return failure(diagnostics);
  return success({
    tenantId: input.tenantId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    path: current!.publicPresentationReference!,
    redirectExecuted: false,
  });
}

export type Social430Flag =
  | "social-read"
  | "social-write"
  | "community-read"
  | "community-write"
  | "creator-page-read"
  | "my-page-read"
  | "market-card-share"
  | "social-search-projection"
  | "social-notification-projection"
  | "social-moderation";

export const DEFAULT_SOCIAL430_FEATURE_FLAGS: Readonly<
  Record<Social430Flag, false>
> = Object.freeze({
  "social-read": false,
  "social-write": false,
  "community-read": false,
  "community-write": false,
  "creator-page-read": false,
  "my-page-read": false,
  "market-card-share": false,
  "social-search-projection": false,
  "social-notification-projection": false,
  "social-moderation": false,
});

export function social430FeatureEnabled(
  flags: Readonly<Record<string, boolean | undefined>>,
  flag: string,
  killSwitch: boolean,
): Social430Result<true> {
  if (killSwitch) {
    return failure([
      error(
        "KILL_SWITCH_ACTIVE",
        "SOCIAL-430 is disabled by the local kill switch.",
      ),
    ]);
  }
  if (!(flag in DEFAULT_SOCIAL430_FEATURE_FLAGS)) {
    return failure([
      error("UNKNOWN_FLAG", "Unknown Social flag fails closed.", "flag"),
    ]);
  }
  if (flags[flag] !== true) {
    return failure([
      error("FEATURE_DISABLED", "Social feature is default-off.", "flag"),
    ]);
  }
  return success(true);
}

export type Social430PresentationState =
  | "LOADING"
  | "EMPTY"
  | "READY"
  | "ERROR"
  | "OFFLINE"
  | "PERMISSION_DENIED"
  | "BLOCKED";

export function resolveSocial430PresentationState(
  input: {
    readonly loading: boolean;
    readonly items: number;
    readonly offline?: boolean;
    readonly permissionDenied?: boolean;
    readonly blocked?: boolean;
    readonly error?: boolean;
  },
): Social430PresentationState {
  if (input.offline === true) return "OFFLINE";
  if (input.blocked === true) return "BLOCKED";
  if (input.permissionDenied === true) return "PERMISSION_DENIED";
  if (input.error === true) return "ERROR";
  if (input.loading === true) return "LOADING";
  return input.items === 0 ? "EMPTY" : "READY";
}

export interface Social430ProjectionSnapshot {
  readonly postCount: number;
  readonly commentCount: number;
  readonly followCount: number;
  readonly reactionCount: number;
  readonly mentionCount: number;
  readonly marketCardCount: number;
  readonly eventCount: number;
}

export interface Social430RollbackPlan {
  readonly planId: string;
  readonly fromSnapshotHash: ContentHash;
  readonly restoreSnapshotHash: ContentHash;
  readonly restoreSnapshot: Social430ProjectionSnapshot;
  readonly execution: "LOCAL_SHADOW_ONLY";
}

export async function createSocial430RollbackPlan(
  current: Social430ProjectionSnapshot,
  restoreSnapshot: Social430ProjectionSnapshot,
): Promise<Social430RollbackPlan> {
  const fromSnapshotHash = await hashCanonical(current);
  const restoreSnapshotHash = await hashCanonical(restoreSnapshot);
  return {
    planId: `social430-rollback:${restoreSnapshotHash.slice(0, 16)}`,
    fromSnapshotHash,
    restoreSnapshotHash,
    restoreSnapshot,
    execution: "LOCAL_SHADOW_ONLY",
  };
}

export function applySocial430RollbackPlan(
  plan: Social430RollbackPlan,
  currentSnapshotHash: string,
): Social430Result<Social430ProjectionSnapshot> {
  if (currentSnapshotHash !== plan.fromSnapshotHash) {
    return failure([
      error(
        "ROLLBACK_PRECONDITION_FAILED",
        "Rollback requires the last validated local shadow snapshot.",
        "currentSnapshotHash",
      ),
    ]);
  }
  return success(plan.restoreSnapshot, [
    info(
      "ROLLBACK_PRECONDITION_FAILED",
      "Local shadow projection restored; no external mutation executed.",
      { externalMutation: false },
    ),
  ]);
}

export function auditSafeSocial430Payload(
  input: {
    readonly postCount: number;
    readonly commentCount: number;
    readonly eventCount: number;
  },
): Readonly<Record<string, number | boolean | string>> {
  return {
    domain: "SOCIAL430",
    postCount: input.postCount,
    commentCount: input.commentCount,
    eventCount: input.eventCount,
    hasSensitiveFields: false,
    rawMediaBytes: 0,
    bodyBytes: 0,
    productionMutation: false,
  };
}

export function canonicalSocial430(value: unknown): string {
  return canonicalJson(value);
}

export function asSocial430ContentHash(value: string): ContentHash {
  if (!validHash(value)) {
    throw new Error("Social430ContentHash must be a lowercase SHA-256 hash.");
  }
  return value as ContentHash;
}
