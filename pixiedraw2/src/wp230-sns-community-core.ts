/**
 * WP-230 isolated SNS / Community / Creator / My Page projection.
 *
 * This module accepts bounded references and injected server decisions only.
 * It never performs a route, media, account, notification, or commerce call.
 */

import {
  canonicalJson,
  hashCanonical,
  AUTHORIZATION_PROOF_POLICY_VERSION,
  resolveAuthorizationProofV1,
  type AuthorizationProofResolver,
  type Brand,
  type AuthorizationProofV1,
  type ContentHash,
} from "./wp160-contracts.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_PATH = /^\/(?!\/|.*(?:javascript:|data:|vbscript:))[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]*$/i;
const FORBIDDEN_KEYS = new Set([
  "body",
  "rawBody",
  "privateBody",
  "rawMedia",
  "mediaBytes",
  "base64",
  "dataUrl",
  "jwt",
  "secret",
  "email",
  "phone",
  "payment",
  "entitlement",
  "license",
  "royalty",
  "ledger",
  "directWork",
  "rawImage",
  "imageBytes",
  "html",
  "rawHtml",
  "script",
  "productId",
  "purchaseId",
  "entitlementId",
  "licenseId",
  "payout",
  "price",
  "createProduct",
  "createPurchase",
  "createEntitlement",
  "rightsTransfer",
]);
const MAX_CAPTION = 1024;
const MAX_COMMENT = 2000;
const MAX_BIO = 600;

export type SnsPostId = Brand<string, "SnsPostId">;
export type SnsCommentId = Brand<string, "SnsCommentId">;
export type SnsFollowId = Brand<string, "SnsFollowId">;
export type SnsReactionId = Brand<string, "SnsReactionId">;
export type SnsMentionId = Brand<string, "SnsMentionId">;
export type SnsCommunityId = Brand<string, "SnsCommunityId">;
export type SnsMembershipId = Brand<string, "SnsMembershipId">;
export type SnsCreatorPageId = Brand<string, "SnsCreatorPageId">;
export type SnsProjectPageId = Brand<string, "SnsProjectPageId">;
export type SnsMyPageId = Brand<string, "SnsMyPageId">;
export type SnsMarketCardId = Brand<string, "SnsMarketCardId">;
export type SnsShareCommandId = Brand<string, "SnsShareCommandId">;
export type SnsEventId = Brand<string, "SnsEventId">;
export type SnsNotificationReferenceId = Brand<string, "SnsNotificationReferenceId">;

export type SnsDiagnosticCode =
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
  | "PERMISSION_DENIED"
  | "PRIVATE_RESOURCE"
  | "INVALID_TRANSITION"
  | "DUPLICATE_ID_CONFLICT"
  | "SELF_FOLLOW_REJECTED"
  | "POST_NOT_PUBLISHED"
  | "MARKET_REFERENCE_REQUIRED"
  | "CORE_CARD_REQUIRED"
  | "CONTENT_UNAVAILABLE"
  | "SEARCH_NOT_ELIGIBLE"
  | "COMMERCE_MUTATION_REJECTED"
  | "EVENT_NOT_TRUSTED"
  | "NOTIFICATION_RECIPIENT_REQUIRED"
  | "UNKNOWN_FLAG"
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "ROLLBACK_PRECONDITION_FAILED"
  | "UNSAFE_AUDIT_DATA";

export type SnsDiagnosticSeverity = "INFO" | "WARNING" | "ERROR";

export interface SnsDiagnostic {
  readonly code: SnsDiagnosticCode;
  readonly severity: SnsDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
  readonly recoverable: boolean;
}

export type SnsResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly SnsDiagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly SnsDiagnostic[] };

function info(code: SnsDiagnosticCode, message: string, metadata?: Readonly<Record<string, string | number | boolean>>): SnsDiagnostic {
  return { code, severity: "INFO", message, ...(metadata === undefined ? {} : { metadata }), recoverable: true };
}

function error(code: SnsDiagnosticCode, message: string, path?: string): SnsDiagnostic {
  return { code, severity: "ERROR", message, ...(path === undefined ? {} : { path }), recoverable: false };
}

function success<T>(value: T, diagnostics: readonly SnsDiagnostic[] = []): SnsResult<T> {
  return { ok: true, value, diagnostics };
}

function failure<T>(diagnostics: readonly SnsDiagnostic[]): SnsResult<T> {
  return { ok: false, diagnostics };
}

function stableId(value: string): boolean { return SAFE_ID.test(value); }
function validHash(value: string): boolean { return SHA256.test(value); }
function validPath(value: string): boolean { return SAFE_PATH.test(value); }
function hasError(diagnostics: readonly SnsDiagnostic[]): boolean { return diagnostics.some((item) => item.severity === "ERROR"); }

type SnsAuthorizationInput = {
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
};

function resolveSnsAuthorization(input: SnsAuthorizationInput, expected: {
  readonly principalId?: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  readonly capability: string;
  readonly tenantId?: string | null;
  readonly correlationId?: string | null;
}): AuthorizationProofV1 {
  if (typeof input.authorizationProofResolver !== "function") throw new Error("SNS operation requires a server-owned AuthorizationProof resolver.");
  return resolveAuthorizationProofV1(input.authorizationProof, {
    ...expected,
    // An omitted principal is intentionally not copied from the caller Proof.
    // The server resolver must choose the canonical actor/resource principal.
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
  }, input.authorizationProofResolver);
}

function requireSnsAuthorization(input: SnsAuthorizationInput, expected: Parameters<typeof resolveSnsAuthorization>[1], diagnostics: SnsDiagnostic[], path = "authorizationProof"): AuthorizationProofV1 | null {
  try {
    return resolveSnsAuthorization(input, expected);
  } catch {
    diagnostics.push(error("PERMISSION_DENIED", "SNS operation requires an AuthorizationProofV1 bound to the requested scope.", path));
    return null;
  }
}

function forbiddenKeys(value: unknown): string[] {
  if (value === null || typeof value !== "object") return [];
  return Object.keys(value).filter((key) => FORBIDDEN_KEYS.has(key));
}

function boundaryDiagnostics(value: unknown, diagnostics: SnsDiagnostic[], path = "input"): void {
  const keys = forbiddenKeys(value);
  if (keys.length === 0) return;
  const rawMedia = keys.some((key) => ["rawMedia", "mediaBytes", "base64", "dataUrl", "rawImage", "imageBytes"].includes(key));
  const commerce = keys.some((key) => ["productId", "purchaseId", "entitlementId", "licenseId", "payout", "price", "createProduct", "createPurchase", "createEntitlement", "rightsTransfer"].includes(key));
  diagnostics.push(error(rawMedia ? "RAW_MEDIA_REJECTED" : commerce ? "COMMERCE_MUTATION_REJECTED" : "FORBIDDEN_PRIVATE_DATA", "SNS boundary accepts bounded text and approved references only.", path));
}

function containsUnsafeMarkup(value: string): boolean {
  return /<\/?[a-z][^>]*>|javascript\s*:/i.test(value);
}

function validateId(value: string, path: string, diagnostics: SnsDiagnostic[]): void {
  if (!stableId(value)) diagnostics.push(error("INVALID_ID", "Reference must be a stable identifier.", path));
}

function validateHash(value: string, path: string, diagnostics: SnsDiagnostic[]): void {
  if (!validHash(value)) diagnostics.push(error("INVALID_HASH", "Reference must be a lowercase SHA-256 hash.", path));
}

function validateBoundedText(value: string, max: number, path: string, diagnostics: SnsDiagnostic[]): void {
  if (value.length === 0 || value.length > max) diagnostics.push(error("BOUNDED_TEXT_REQUIRED", "Text is required and must remain bounded.", path));
}

export type SnsVisibility = "PUBLIC" | "UNLISTED" | "PROJECT_MEMBERS" | "CREATOR_PRIVATE" | "PRIVATE";
export type SnsPostStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED" | "HIDDEN" | "QUARANTINED";
export type SnsPostKind = "CREATOR_NOTE" | "ASSET_SHARE" | "MARKET_CARD" | "PIXFiND_REFERENCE" | "PROJECT_UPDATE";
export type SnsReferenceKind = "PROJECT" | "ASSET" | "ASSET_REVISION" | "PACKAGE" | "MARKET_PRODUCT" | "PIXFiND_SOURCE";
export type SnsReactionType = "LIKE" | "LOVE" | "CELEBRATE" | "INTERESTED";
export type SnsCoreCardType = "MARKET_PRODUCT" | "MATERIAL" | "COMPLETED_WORK" | "PUBLIC_GAME" | "PUBLIC_PROJECT" | "CREATOR" | "COLLECTION" | "PUBLIC_RESOURCE";
export type SnsCardSnapshotMode = "LIVE" | "SNAPSHOT" | "OMITTED";

export interface SnsCardSnapshotPolicy {
  readonly price: SnsCardSnapshotMode;
  readonly availability: SnsCardSnapshotMode;
  readonly creator: SnsCardSnapshotMode;
  readonly preview: SnsCardSnapshotMode;
}

export interface SnsCoreCard {
  readonly cardId: Brand<string, "SnsCoreCardId">;
  readonly cardType: SnsCoreCardType;
  readonly resourceId: string;
  readonly cardVersion: 1;
  readonly publicPresentationReference: string;
  readonly snapshotPolicy: SnsCardSnapshotPolicy;
  readonly visibilityAtShare: "PUBLIC";
  readonly approvedAtShare: true;
  readonly status: "APPROVED";
}

export interface SnsReference {
  readonly kind: SnsReferenceKind;
  readonly referenceId: string;
  readonly revisionHash?: ContentHash;
  readonly contentHash?: ContentHash;
}

export interface SnsPost {
  readonly postId: SnsPostId;
  readonly shareCommandId: SnsShareCommandId;
  readonly creatorId: string;
  readonly sourceAccountId: string;
  readonly kind: SnsPostKind;
  readonly visibility: SnsVisibility;
  readonly status: SnsPostStatus;
  readonly caption: string;
  readonly captionHash: ContentHash;
  readonly references: readonly SnsReference[];
  readonly cards: readonly SnsCoreCard[];
  readonly publicPath?: string;
  readonly explicitShare: true;
  readonly recordVersion: number;
}

export interface SnsShareCommandInput {
  readonly postId: SnsPostId;
  readonly shareCommandId: SnsShareCommandId;
  readonly creatorId: string;
  readonly sourceAccountId: string;
  readonly kind: SnsPostKind;
  readonly visibility: SnsVisibility;
  readonly status: SnsPostStatus;
  readonly caption: string;
  readonly references: readonly SnsReference[];
  readonly cards?: readonly SnsCoreCard[];
  readonly publicPath?: string;
  readonly explicitShare: boolean;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}

function validateReferences(references: readonly SnsReference[], diagnostics: SnsDiagnostic[]): void {
  if (references.length > 8) diagnostics.push(error("INVALID_REFERENCE", "A Post reference set is bounded.", "references"));
  for (const [index, reference] of references.entries()) {
    validateId(reference.referenceId, `references[${index}].referenceId`, diagnostics);
    if (reference.revisionHash !== undefined) validateHash(reference.revisionHash, `references[${index}].revisionHash`, diagnostics);
    if (reference.contentHash !== undefined) validateHash(reference.contentHash, `references[${index}].contentHash`, diagnostics);
  }
}

function validSnapshotMode(value: SnsCardSnapshotMode): boolean {
  return ["LIVE", "SNAPSHOT", "OMITTED"].includes(value);
}

function validateCoreCards(cards: readonly SnsCoreCard[], diagnostics: SnsDiagnostic[]): void {
  if (cards.length > 8) diagnostics.push(error("INVALID_REFERENCE", "A Core Card set is bounded.", "cards"));
  for (const [index, card] of cards.entries()) {
    validateId(card.cardId, `cards[${index}].cardId`, diagnostics);
    validateId(card.resourceId, `cards[${index}].resourceId`, diagnostics);
    if (!validPath(card.publicPresentationReference)) diagnostics.push(error("INVALID_PATH", "Core Card presentation references must be safe same-origin paths.", `cards[${index}].publicPresentationReference`));
    if (card.cardVersion !== 1 || card.status !== "APPROVED" || card.approvedAtShare !== true || card.visibilityAtShare !== "PUBLIC") diagnostics.push(error("INVALID_REFERENCE", "Core Card must be an approved public v1 reference.", `cards[${index}]`));
    for (const [field, mode] of Object.entries(card.snapshotPolicy)) {
      if (!validSnapshotMode(mode as SnsCardSnapshotMode)) diagnostics.push(error("INVALID_REFERENCE", "Core Card snapshot policy must be explicit.", `cards[${index}].snapshotPolicy.${field}`));
    }
  }
}

export function createSnsCoreCard(input: {
  readonly cardId: Brand<string, "SnsCoreCardId">;
  readonly cardType: SnsCoreCardType;
  readonly resourceId: string;
  readonly publicPresentationReference: string;
  readonly snapshotPolicy: SnsCardSnapshotPolicy;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
  readonly approvedPublicResource: boolean;
  readonly currentVisibility: "PUBLIC";
}): SnsResult<SnsCoreCard> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.cardId, "cardId", diagnostics);
  validateId(input.resourceId, "resourceId", diagnostics);
  if (!Object.values<SnsCoreCardType>(["MARKET_PRODUCT", "MATERIAL", "COMPLETED_WORK", "PUBLIC_GAME", "PUBLIC_PROJECT", "CREATOR", "COLLECTION", "PUBLIC_RESOURCE"]).includes(input.cardType)) diagnostics.push(error("INVALID_REFERENCE", "Core Card type is not supported.", "cardType"));
  if (!validPath(input.publicPresentationReference)) diagnostics.push(error("INVALID_PATH", "Core Card requires a safe public presentation reference.", "publicPresentationReference"));
  if (input.currentVisibility !== "PUBLIC" || input.approvedPublicResource !== true) diagnostics.push(error("PERMISSION_DENIED", "Only an approved public resource may become a Core Card.", "approvedPublicResource"));
  requireSnsAuthorization(input, { resourceType: "SNS_CORE_CARD", resourceId: input.cardId, action: "sns.core-card.create", capability: "sns.core-card.create" }, diagnostics);
  for (const [field, mode] of Object.entries(input.snapshotPolicy)) {
    if (!validSnapshotMode(mode as SnsCardSnapshotMode)) diagnostics.push(error("INVALID_REFERENCE", "Snapshot policy must explicitly classify every display field.", `snapshotPolicy.${field}`));
  }
  boundaryDiagnostics(input, diagnostics);
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ cardId: input.cardId, cardType: input.cardType, resourceId: input.resourceId, cardVersion: 1, publicPresentationReference: input.publicPresentationReference, snapshotPolicy: { ...input.snapshotPolicy }, visibilityAtShare: "PUBLIC", approvedAtShare: true, status: "APPROVED" });
}

export async function createSnsPost(input: SnsShareCommandInput): Promise<SnsResult<SnsPost>> {
  const diagnostics: SnsDiagnostic[] = [];
  for (const [value, path] of [[input.postId, "postId"], [input.shareCommandId, "shareCommandId"], [input.creatorId, "creatorId"], [input.sourceAccountId, "sourceAccountId"]] as const) validateId(value, path, diagnostics);
  if (input.explicitShare !== true) diagnostics.push(error("SHARE_COMMAND_REQUIRED", "A Post requires an explicit Share Command.", "explicitShare"));
  requireSnsAuthorization(input, { principalId: input.creatorId, resourceType: "SNS_POST", resourceId: input.postId, action: "sns.post.create", capability: "sns.post.create" }, diagnostics);
  if (!Object.values<SnsVisibility>(["PUBLIC", "UNLISTED", "PROJECT_MEMBERS", "CREATOR_PRIVATE", "PRIVATE"]).includes(input.visibility)) diagnostics.push(error("INVALID_VISIBILITY", "Visibility is not supported.", "visibility"));
  if (!Object.values<SnsPostStatus>(["DRAFT", "PUBLISHED", "ARCHIVED", "HIDDEN", "QUARANTINED"]).includes(input.status)) diagnostics.push(error("INVALID_STATUS", "Post status is not supported.", "status"));
  validateBoundedText(input.caption, MAX_CAPTION, "caption", diagnostics);
  if (containsUnsafeMarkup(input.caption)) diagnostics.push(error("UNSAFE_MARKUP_REJECTED", "Post caption must be plain text.", "caption"));
  boundaryDiagnostics(input, diagnostics);
  validateReferences(input.references, diagnostics);
  const cards = input.cards ?? [];
  if (input.references.length > 0 && cards.length === 0) diagnostics.push(error("CORE_CARD_REQUIRED", "A resource share requires an approved Core Card.", "cards"));
  validateCoreCards(cards, diagnostics);
  if (input.publicPath !== undefined && !validPath(input.publicPath)) diagnostics.push(error("INVALID_PATH", "Only a safe same-origin path may be retained.", "publicPath"));
  if (hasError(diagnostics)) return failure(diagnostics);
  const captionHash = await hashCanonical({ caption: input.caption, references: input.references, cards, visibility: input.visibility });
  return success({
    postId: input.postId,
    shareCommandId: input.shareCommandId,
    creatorId: input.creatorId,
    sourceAccountId: input.sourceAccountId,
    kind: input.kind,
    visibility: input.visibility,
    status: input.status,
    caption: input.caption,
    captionHash,
    references: input.references.map((reference) => ({ ...reference })),
    cards: cards.map((card) => ({ ...card, snapshotPolicy: { ...card.snapshotPolicy } })),
    ...(input.publicPath === undefined ? {} : { publicPath: input.publicPath }),
    explicitShare: true,
    recordVersion: 1,
  });
}

export function reconcileSnsPost(existing: SnsPost | undefined, next: SnsPost): SnsResult<SnsPost> {
  if (existing === undefined) return success(next);
  if (existing.shareCommandId !== next.shareCommandId || existing.captionHash !== next.captionHash) return failure([error("DUPLICATE_ID_CONFLICT", "Share Command identity was reused with different content.", "shareCommandId")]);
  return success(existing, [info("DUPLICATE_ID_CONFLICT", "Identical Share Command is an idempotent no-op.", { idempotent: true })]);
}

const POST_TRANSITIONS: Readonly<Record<SnsPostStatus, readonly string[]>> = {
  DRAFT: ["PUBLISH", "ARCHIVE", "QUARANTINE"],
  PUBLISHED: ["ARCHIVE", "HIDE", "QUARANTINE"],
  ARCHIVED: [],
  HIDDEN: ["PUBLISH", "ARCHIVE", "QUARANTINE"],
  QUARANTINED: ["ARCHIVE"],
};

export function transitionSnsPost(post: SnsPost, event: "PUBLISH" | "ARCHIVE" | "HIDE" | "QUARANTINE"): SnsResult<SnsPost> {
  if (!POST_TRANSITIONS[post.status].includes(event)) return failure([error("INVALID_TRANSITION", "Post transition is not valid for its current status.", "event")]);
  const status: SnsPostStatus = event === "PUBLISH" ? "PUBLISHED" : event === "ARCHIVE" ? "ARCHIVED" : event === "HIDE" ? "HIDDEN" : "QUARANTINED";
  return success({ ...post, status, recordVersion: post.recordVersion + 1 });
}

export interface SnsComment {
  readonly commentId: SnsCommentId;
  readonly postId: SnsPostId;
  readonly actorAccountId: string;
  readonly parentCommentId?: SnsCommentId;
  readonly text: string;
  readonly textHash: ContentHash;
  readonly status: "VISIBLE" | "HIDDEN" | "DELETED";
  readonly recordVersion: number;
}

export interface SnsCommentInput {
  readonly commentId: SnsCommentId;
  readonly post: SnsPost;
  readonly actorAccountId: string;
  readonly parentCommentId?: SnsCommentId;
  readonly text: string;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}

export async function createSnsComment(input: SnsCommentInput): Promise<SnsResult<SnsComment>> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.commentId, "commentId", diagnostics);
  validateId(input.post.postId, "post.postId", diagnostics);
  validateId(input.actorAccountId, "actorAccountId", diagnostics);
  if (input.parentCommentId !== undefined) validateId(input.parentCommentId, "parentCommentId", diagnostics);
  if (input.post.status !== "PUBLISHED") diagnostics.push(error("POST_NOT_PUBLISHED", "Comments require a published Post.", "post.status"));
  requireSnsAuthorization(input, { principalId: input.actorAccountId, resourceType: "SNS_COMMENT", resourceId: input.commentId, action: "sns.comment.create", capability: "sns.comment.create" }, diagnostics);
  validateBoundedText(input.text, MAX_COMMENT, "text", diagnostics);
  if (containsUnsafeMarkup(input.text)) diagnostics.push(error("UNSAFE_MARKUP_REJECTED", "Comment text must be plain text.", "text"));
  boundaryDiagnostics(input, diagnostics);
  if (hasError(diagnostics)) return failure(diagnostics);
  const textHash = await hashCanonical({ text: input.text, postId: input.post.postId });
  return success({
    commentId: input.commentId,
    postId: input.post.postId,
    actorAccountId: input.actorAccountId,
    ...(input.parentCommentId === undefined ? {} : { parentCommentId: input.parentCommentId }),
    text: input.text,
    textHash,
    status: "VISIBLE",
    recordVersion: 1,
  });
}

export function transitionSnsComment(comment: SnsComment, event: "HIDE" | "DELETE" | "RESTORE"): SnsResult<SnsComment> {
  const allowed = comment.status === "VISIBLE" ? ["HIDE", "DELETE"] : comment.status === "HIDDEN" ? ["RESTORE", "DELETE"] : [];
  if (!allowed.includes(event)) return failure([error("INVALID_TRANSITION", "Comment transition is not valid for its current status.", "event")]);
  const status = event === "DELETE" ? "DELETED" : event === "HIDE" ? "HIDDEN" : "VISIBLE";
  return success({ ...comment, status, recordVersion: comment.recordVersion + 1 });
}

export interface SnsFollow {
  readonly followId: SnsFollowId;
  readonly followerAccountId: string;
  readonly creatorId: string;
  readonly status: "ACTIVE" | "REMOVED";
  readonly identityHash: ContentHash;
}

export async function createSnsFollow(input: { readonly followId: SnsFollowId; readonly followerAccountId: string; readonly creatorId: string; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): Promise<SnsResult<SnsFollow>> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.followId, "followId", diagnostics);
  validateId(input.followerAccountId, "followerAccountId", diagnostics);
  validateId(input.creatorId, "creatorId", diagnostics);
  if (input.followerAccountId === input.creatorId) diagnostics.push(error("SELF_FOLLOW_REJECTED", "An account cannot follow itself.", "creatorId"));
  requireSnsAuthorization(input, { principalId: input.followerAccountId, resourceType: "SNS_FOLLOW", resourceId: input.followId, action: "sns.follow.create", capability: "sns.follow.create" }, diagnostics);
  if (hasError(diagnostics)) return failure(diagnostics);
  const identityHash = await hashCanonical({ followerAccountId: input.followerAccountId, creatorId: input.creatorId });
  return success({ followId: input.followId, followerAccountId: input.followerAccountId, creatorId: input.creatorId, status: "ACTIVE", identityHash });
}

export function reconcileSnsFollow(existing: SnsFollow | undefined, next: SnsFollow): SnsResult<SnsFollow> {
  if (existing === undefined) return success(next);
  if (existing.followId !== next.followId || existing.identityHash !== next.identityHash) return failure([error("DUPLICATE_ID_CONFLICT", "Follow identity was reused with different parties.", "followId")]);
  return success(existing, [info("DUPLICATE_ID_CONFLICT", "Identical Follow is an idempotent no-op.", { idempotent: true })]);
}

export interface SnsReaction {
  readonly reactionId: SnsReactionId;
  readonly postId: SnsPostId;
  readonly actorAccountId: string;
  readonly type: SnsReactionType;
  readonly intentHash: ContentHash;
  readonly status: "ACTIVE" | "REMOVED";
}

export async function createSnsReaction(input: { readonly reactionId: SnsReactionId; readonly post: SnsPost; readonly actorAccountId: string; readonly type: SnsReactionType; readonly intentHash: ContentHash; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): Promise<SnsResult<SnsReaction>> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.reactionId, "reactionId", diagnostics);
  validateId(input.post.postId, "post.postId", diagnostics);
  validateId(input.actorAccountId, "actorAccountId", diagnostics);
  validateHash(input.intentHash, "intentHash", diagnostics);
  if (input.post.status !== "PUBLISHED") diagnostics.push(error("POST_NOT_PUBLISHED", "Reaction requires a published Post.", "post.status"));
  requireSnsAuthorization(input, { principalId: input.actorAccountId, resourceType: "SNS_REACTION", resourceId: input.reactionId, action: "sns.reaction.create", capability: "sns.reaction.create" }, diagnostics);
  if (!Object.values<SnsReactionType>(["LIKE", "LOVE", "CELEBRATE", "INTERESTED"]).includes(input.type)) diagnostics.push(error("INVALID_REFERENCE", "Reaction type is not supported.", "type"));
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ reactionId: input.reactionId, postId: input.post.postId, actorAccountId: input.actorAccountId, type: input.type, intentHash: input.intentHash, status: "ACTIVE" });
}

export function reconcileSnsReaction(existing: SnsReaction | undefined, next: SnsReaction): SnsResult<SnsReaction> {
  if (existing === undefined) return success(next);
  if (existing.reactionId !== next.reactionId || existing.intentHash !== next.intentHash) return failure([error("DUPLICATE_ID_CONFLICT", "Reaction identity was reused with different content.", "reactionId")]);
  return success(existing, [info("DUPLICATE_ID_CONFLICT", "Identical Reaction is an idempotent no-op.", { idempotent: true })]);
}

export interface SnsMention {
  readonly mentionId: SnsMentionId;
  readonly sourceKind: "POST" | "COMMENT";
  readonly sourceId: string;
  readonly targetCreatorId: string;
  readonly actorAccountId: string;
  readonly status: "ACTIVE" | "REMOVED";
}

export function createSnsMention(input: { readonly mentionId: SnsMentionId; readonly sourceKind: SnsMention["sourceKind"]; readonly sourceId: string; readonly targetCreatorId: string; readonly actorAccountId: string; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): SnsResult<SnsMention> {
  const diagnostics: SnsDiagnostic[] = [];
  for (const [value, path] of [[input.mentionId, "mentionId"], [input.sourceId, "sourceId"], [input.targetCreatorId, "targetCreatorId"], [input.actorAccountId, "actorAccountId"]] as const) validateId(value, path, diagnostics);
  requireSnsAuthorization(input, { principalId: input.actorAccountId, resourceType: "SNS_MENTION", resourceId: input.mentionId, action: "sns.mention.create", capability: "sns.mention.create" }, diagnostics);
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ mentionId: input.mentionId, sourceKind: input.sourceKind, sourceId: input.sourceId, targetCreatorId: input.targetCreatorId, actorAccountId: input.actorAccountId, status: "ACTIVE" });
}

export interface SnsCommunity {
  readonly communityId: SnsCommunityId;
  readonly ownerCreatorId: string;
  readonly name: string;
  readonly visibility: Extract<SnsVisibility, "PUBLIC" | "UNLISTED" | "PROJECT_MEMBERS" | "PRIVATE">;
  readonly status: "ACTIVE" | "ARCHIVED" | "QUARANTINED";
  readonly recordVersion: number;
}

export function createSnsCommunity(input: { readonly communityId: SnsCommunityId; readonly ownerCreatorId: string; readonly name: string; readonly visibility: SnsCommunity["visibility"]; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): SnsResult<SnsCommunity> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.communityId, "communityId", diagnostics);
  validateId(input.ownerCreatorId, "ownerCreatorId", diagnostics);
  validateBoundedText(input.name, 120, "name", diagnostics);
  requireSnsAuthorization(input, { principalId: input.ownerCreatorId, resourceType: "SNS_COMMUNITY", resourceId: input.communityId, action: "sns.community.create", capability: "sns.community.create" }, diagnostics);
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ communityId: input.communityId, ownerCreatorId: input.ownerCreatorId, name: input.name, visibility: input.visibility, status: "ACTIVE", recordVersion: 1 });
}

export interface SnsMembership {
  readonly membershipId: SnsMembershipId;
  readonly communityId: SnsCommunityId;
  readonly memberAccountId: string;
  readonly role: "OWNER" | "MODERATOR" | "MEMBER";
  readonly status: "ACTIVE" | "LEFT" | "BANNED";
}

export function createSnsMembership(input: { readonly membershipId: SnsMembershipId; readonly community: SnsCommunity; readonly memberAccountId: string; readonly role: SnsMembership["role"]; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): SnsResult<SnsMembership> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.membershipId, "membershipId", diagnostics);
  validateId(input.community.communityId, "community.communityId", diagnostics);
  validateId(input.memberAccountId, "memberAccountId", diagnostics);
  if (input.community.status !== "ACTIVE") diagnostics.push(error("INVALID_STATUS", "Membership requires an active Community.", "community.status"));
  requireSnsAuthorization(input, { principalId: input.memberAccountId, resourceType: "SNS_MEMBERSHIP", resourceId: input.membershipId, action: "sns.membership.create", capability: "sns.membership.create" }, diagnostics);
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ membershipId: input.membershipId, communityId: input.community.communityId, memberAccountId: input.memberAccountId, role: input.role, status: "ACTIVE" });
}

export interface SnsCreatorPage {
  readonly pageId: SnsCreatorPageId;
  readonly creatorId: string;
  readonly displayName: string;
  readonly bio?: string;
  readonly publicPath: string;
  readonly visibility: "PUBLIC" | "CREATOR_PRIVATE";
  readonly status: "ACTIVE" | "HIDDEN";
}

export function createSnsCreatorPage(input: { readonly pageId: SnsCreatorPageId; readonly creatorId: string; readonly displayName: string; readonly bio?: string; readonly publicPath: string; readonly visibility: SnsCreatorPage["visibility"]; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): SnsResult<SnsCreatorPage> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.pageId, "pageId", diagnostics);
  validateId(input.creatorId, "creatorId", diagnostics);
  validateBoundedText(input.displayName, 120, "displayName", diagnostics);
  if (input.bio !== undefined && input.bio.length > MAX_BIO) diagnostics.push(error("BOUNDED_TEXT_REQUIRED", "Creator bio must remain bounded.", "bio"));
  if (!validPath(input.publicPath)) diagnostics.push(error("INVALID_PATH", "Creator Page requires a safe public path candidate.", "publicPath"));
  requireSnsAuthorization(input, { principalId: input.creatorId, resourceType: "SNS_CREATOR_PAGE", resourceId: input.pageId, action: "sns.creator-page.create", capability: "sns.creator-page.create" }, diagnostics);
  if (forbiddenKeys(input).length > 0) diagnostics.push(error("FORBIDDEN_PRIVATE_DATA", "Legal or private profile fields cannot cross the Creator Page boundary.", "input"));
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ pageId: input.pageId, creatorId: input.creatorId, displayName: input.displayName, ...(input.bio === undefined ? {} : { bio: input.bio }), publicPath: input.publicPath, visibility: input.visibility, status: "ACTIVE" });
}

export interface SnsMyPage {
  readonly pageId: SnsMyPageId;
  readonly ownerAccountId: string;
  readonly creatorId?: string;
  readonly postIds: readonly SnsPostId[];
  readonly communityIds: readonly SnsCommunityId[];
  readonly visibility: "OWNER_ONLY";
  readonly hasPrivateData: false;
}

export interface SnsProjectPage {
  readonly pageId: SnsProjectPageId;
  readonly projectId: string;
  readonly ownerAccountId: string;
  readonly title: string;
  readonly summary?: string;
  readonly assetReferences: readonly string[];
  readonly publicPath: string;
  readonly visibility: SnsVisibility;
  readonly status: "ACTIVE" | "HIDDEN";
  readonly containsProjectBody: false;
}

export function createSnsProjectPage(input: { readonly pageId: SnsProjectPageId; readonly projectId: string; readonly ownerAccountId: string; readonly title: string; readonly summary?: string; readonly assetReferences: readonly string[]; readonly publicPath: string; readonly visibility: SnsVisibility; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): SnsResult<SnsProjectPage> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.pageId, "pageId", diagnostics);
  validateId(input.projectId, "projectId", diagnostics);
  validateId(input.ownerAccountId, "ownerAccountId", diagnostics);
  validateBoundedText(input.title, 160, "title", diagnostics);
  if (input.summary !== undefined && input.summary.length > MAX_CAPTION) diagnostics.push(error("BOUNDED_TEXT_REQUIRED", "Project summary must remain bounded.", "summary"));
  for (const [index, assetId] of input.assetReferences.entries()) validateId(assetId, `assetReferences[${index}]`, diagnostics);
  if (!validPath(input.publicPath)) diagnostics.push(error("INVALID_PATH", "Project Page requires a safe public path candidate.", "publicPath"));
  requireSnsAuthorization(input, { principalId: input.ownerAccountId, resourceType: "SNS_PROJECT_PAGE", resourceId: input.pageId, action: "sns.project-page.create", capability: "sns.project-page.create" }, diagnostics);
  if (forbiddenKeys(input).length > 0) diagnostics.push(error("FORBIDDEN_PRIVATE_DATA", "Project body and private fields cannot cross the Project Page boundary.", "input"));
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ pageId: input.pageId, projectId: input.projectId, ownerAccountId: input.ownerAccountId, title: input.title, ...(input.summary === undefined ? {} : { summary: input.summary }), assetReferences: [...input.assetReferences], publicPath: input.publicPath, visibility: input.visibility, status: "ACTIVE", containsProjectBody: false });
}

export function createSnsMyPage(input: { readonly pageId: SnsMyPageId; readonly ownerAccountId: string; readonly creatorId?: string; readonly postIds: readonly SnsPostId[]; readonly communityIds: readonly SnsCommunityId[]; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): SnsResult<SnsMyPage> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.pageId, "pageId", diagnostics);
  validateId(input.ownerAccountId, "ownerAccountId", diagnostics);
  if (input.creatorId !== undefined) validateId(input.creatorId, "creatorId", diagnostics);
  for (const [index, postId] of input.postIds.entries()) validateId(postId, `postIds[${index}]`, diagnostics);
  for (const [index, communityId] of input.communityIds.entries()) validateId(communityId, `communityIds[${index}]`, diagnostics);
  requireSnsAuthorization(input, { principalId: input.ownerAccountId, resourceType: "SNS_MY_PAGE", resourceId: input.pageId, action: "sns.my-page.create", capability: "sns.my-page.create" }, diagnostics);
  if (forbiddenKeys(input).length > 0) diagnostics.push(error("FORBIDDEN_PRIVATE_DATA", "Private account data cannot cross the My Page projection boundary.", "input"));
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ pageId: input.pageId, ownerAccountId: input.ownerAccountId, ...(input.creatorId === undefined ? {} : { creatorId: input.creatorId }), postIds: [...input.postIds], communityIds: [...input.communityIds], visibility: "OWNER_ONLY", hasPrivateData: false });
}

export interface SnsMarketCardReference {
  readonly cardId: SnsMarketCardId;
  readonly postId: SnsPostId;
  readonly marketProductId: string;
  readonly packageId: string;
  readonly packageContentHash: ContentHash;
  readonly preservedPath: string;
  readonly coreCard: SnsCoreCard;
  readonly createsProduct: false;
  readonly createsPurchase: false;
  readonly createsEntitlement: false;
  readonly createsLicense: false;
  readonly status: "REFERENCE_ONLY" | "HIDDEN";
}

export function createSnsMarketCardReference(input: { readonly cardId: SnsMarketCardId; readonly post: SnsPost; readonly marketProductId: string; readonly packageId: string; readonly packageContentHash: ContentHash; readonly preservedPath: string; readonly existingLockedProduct: boolean; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): SnsResult<SnsMarketCardReference> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.cardId, "cardId", diagnostics);
  validateId(input.post.postId, "post.postId", diagnostics);
  validateId(input.marketProductId, "marketProductId", diagnostics);
  validateId(input.packageId, "packageId", diagnostics);
  validateHash(input.packageContentHash, "packageContentHash", diagnostics);
  if (!validPath(input.preservedPath)) diagnostics.push(error("INVALID_PATH", "Market Card requires a safe preserved path.", "preservedPath"));
  if (input.post.status !== "PUBLISHED") diagnostics.push(error("POST_NOT_PUBLISHED", "Market Card requires a published Post.", "post.status"));
  if (input.existingLockedProduct !== true) diagnostics.push(error("MARKET_REFERENCE_REQUIRED", "Market Card requires an existing locked Product/Package reference.", "existingLockedProduct"));
  requireSnsAuthorization(input, { principalId: input.post.creatorId, resourceType: "SNS_MARKET_CARD", resourceId: input.cardId, action: "sns.market-card.create", capability: "sns.market-card.create" }, diagnostics);
  boundaryDiagnostics(input, diagnostics);
  if (hasError(diagnostics)) return failure(diagnostics);
  const coreCard = {
    cardId: input.cardId as unknown as Brand<string, "SnsCoreCardId">,
    cardType: "MARKET_PRODUCT" as const,
    resourceId: input.marketProductId,
    cardVersion: 1 as const,
    publicPresentationReference: input.preservedPath,
    snapshotPolicy: { price: "LIVE", availability: "LIVE", creator: "LIVE", preview: "LIVE" } as const,
    visibilityAtShare: "PUBLIC" as const,
    approvedAtShare: true as const,
    status: "APPROVED" as const,
  } satisfies SnsCoreCard;
  return success({ cardId: input.cardId, postId: input.post.postId, marketProductId: input.marketProductId, packageId: input.packageId, packageContentHash: input.packageContentHash, preservedPath: input.preservedPath, coreCard, createsProduct: false, createsPurchase: false, createsEntitlement: false, createsLicense: false, status: "REFERENCE_ONLY" });
}

export interface SnsPermissionResult {
  readonly ok: boolean;
  readonly decision: "ALLOW" | "DENY";
  readonly visibility: SnsVisibility;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly diagnostics: readonly SnsDiagnostic[];
}

export function resolveSnsRead(input: { readonly visibility: SnsVisibility; readonly resourceId: string; readonly resourceStatus: "ACTIVE" | "PUBLISHED" | "HIDDEN" | "ARCHIVED" | "QUARANTINED"; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver; readonly requesterAccountId?: string }): SnsPermissionResult {
  const diagnostics: SnsDiagnostic[] = [];
  const authorizationProof = requireSnsAuthorization(input, { principalId: input.requesterAccountId ?? null, resourceType: "SNS_READ", resourceId: input.resourceId, action: "sns.read", capability: "sns.read" }, diagnostics);
  if (input.visibility !== "PUBLIC" && input.requesterAccountId === undefined) diagnostics.push(error("PRIVATE_RESOURCE", "Scoped SNS resources require an authenticated requester."));
  if (["HIDDEN", "ARCHIVED", "QUARANTINED"].includes(input.resourceStatus)) diagnostics.push(error("PRIVATE_RESOURCE", "Resource is not publicly readable."));
  if (hasError(diagnostics) || authorizationProof === null) return { ok: false, decision: "DENY", visibility: input.visibility, diagnostics };
  return { ok: true, decision: "ALLOW", visibility: input.visibility, authorizationProof, diagnostics: [] };
}

export interface SnsCoreCardResolution {
  readonly status: "AVAILABLE" | "CONTENT_UNAVAILABLE";
  readonly card?: SnsCoreCard;
  readonly placeholder?: "CONTENT_UNAVAILABLE";
  readonly authorizationProof?: AuthorizationProofV1;
  readonly diagnostics: readonly SnsDiagnostic[];
}

export function resolveSnsCoreCard(input: {
  readonly card: SnsCoreCard;
  readonly currentVisibility: SnsVisibility;
  readonly currentStatus: "ACTIVE" | "PUBLISHED" | "PRIVATE" | "DELETED" | "TRASHED" | "QUARANTINED" | "UNPUBLISHED";
  readonly currentModeration: "APPROVED" | "HIDDEN" | "REMOVED" | "RESTRICTED";
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}): SnsCoreCardResolution {
  const unavailable = (message: string): SnsCoreCardResolution => ({ status: "CONTENT_UNAVAILABLE", placeholder: "CONTENT_UNAVAILABLE", diagnostics: [error("CONTENT_UNAVAILABLE", message)] });
  let authorizationProof: AuthorizationProofV1;
  try {
    authorizationProof = resolveSnsAuthorization(input, { principalId: null, resourceType: "SNS_CORE_CARD", resourceId: input.card.cardId, action: "sns.core-card.read", capability: "sns.core-card.read" });
  } catch {
    return unavailable("The current public visibility or permission projection no longer allows this Core Card.");
  }
  if (input.currentVisibility !== "PUBLIC" || !["ACTIVE", "PUBLISHED"].includes(input.currentStatus) || input.currentModeration !== "APPROVED") return unavailable("The current public visibility or permission projection no longer allows this Core Card.");
  return { status: "AVAILABLE", card: input.card, authorizationProof, diagnostics: [] };
}

export interface SnsSearchEligibility {
  readonly indexable: boolean;
  readonly reason: "PUBLIC_PUBLISHED_APPROVED" | "NOT_PUBLISHED" | "NOT_PUBLIC" | "MODERATION_NOT_APPROVED" | "PERMISSION_DENIED";
  readonly cardId?: Brand<string, "SnsCoreCardId">;
  readonly resourceId?: string;
  readonly authorizationProof?: AuthorizationProofV1;
}

export function resolveSnsSearchEligibility(input: {
  readonly card: SnsCoreCard;
  readonly explicitPublished: boolean;
  readonly currentVisibility: SnsVisibility;
  readonly currentStatus: "ACTIVE" | "PUBLISHED" | "DRAFT" | "UNPUBLISHED" | "DELETED" | "QUARANTINED";
  readonly currentModeration: "APPROVED" | "HIDDEN" | "REMOVED" | "RESTRICTED";
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
}): SnsSearchEligibility {
  if (input.explicitPublished !== true || !["ACTIVE", "PUBLISHED"].includes(input.currentStatus)) return { indexable: false, reason: "NOT_PUBLISHED" };
  if (input.currentVisibility !== "PUBLIC") return { indexable: false, reason: "NOT_PUBLIC" };
  if (input.currentModeration !== "APPROVED") return { indexable: false, reason: "MODERATION_NOT_APPROVED" };
  try {
    const authorizationProof = resolveSnsAuthorization(input, { principalId: null, resourceType: "SNS_SEARCH_INDEX", resourceId: input.card.resourceId, action: "sns.search.index", capability: "sns.search.index" });
    return { indexable: true, reason: "PUBLIC_PUBLISHED_APPROVED", cardId: input.card.cardId, resourceId: input.card.resourceId, authorizationProof };
  } catch {
    return { indexable: false, reason: "PERMISSION_DENIED" };
  }
}

export interface SnsTrustedEvent {
  readonly eventId: SnsEventId;
  readonly eventType: "POST_PUBLISHED" | "COMMENT_CREATED" | "FOLLOW_CHANGED" | "REACTION_CHANGED" | "MENTION_CREATED" | "COMMUNITY_CHANGED" | "MARKET_CARD_REFERENCED";
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly actorReference: string;
  readonly objectReference: string;
  readonly visibility: SnsVisibility;
  readonly presentationKey: string;
  readonly payloadHash: ContentHash;
  readonly producerProof: AuthorizationProofV1;
}

export async function createSnsTrustedEvent(input: { readonly eventId: SnsEventId; readonly eventType: SnsTrustedEvent["eventType"]; readonly aggregateId: string; readonly aggregateVersion: number; readonly actorReference: string; readonly objectReference: string; readonly visibility: SnsVisibility; readonly presentationKey: string; readonly producerProof: AuthorizationProofV1; readonly authorizationProofResolver: AuthorizationProofResolver; readonly safeMetadata?: Readonly<Record<string, string | number | boolean>> }): Promise<SnsResult<SnsTrustedEvent>> {
  const diagnostics: SnsDiagnostic[] = [];
  for (const [value, path] of [[input.eventId, "eventId"], [input.aggregateId, "aggregateId"], [input.actorReference, "actorReference"], [input.objectReference, "objectReference"], [input.presentationKey, "presentationKey"]] as const) validateId(value, path, diagnostics);
  if (!Number.isSafeInteger(input.aggregateVersion) || input.aggregateVersion < 1) diagnostics.push(error("INVALID_REFERENCE", "Event aggregate version must be positive.", "aggregateVersion"));
  try {
    const producerProof = resolveAuthorizationProofV1(input.producerProof, { principalId: input.actorReference, resourceType: "SNS_EVENT", resourceId: input.aggregateId, action: "sns.event.create", capability: "sns.event.create", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver);
    input = { ...input, producerProof };
  } catch {
    diagnostics.push(error("EVENT_NOT_TRUSTED", "Only a server AuthorizationProofV1 bound to this Event may create it.", "producerProof"));
  }
  if (forbiddenKeys(input).length > 0) diagnostics.push(error("FORBIDDEN_PRIVATE_DATA", "Event payload accepts safe references only.", "input"));
  if (input.safeMetadata !== undefined && JSON.stringify(input.safeMetadata).length > 4096) diagnostics.push(error("INVALID_REFERENCE", "Event metadata must remain bounded.", "safeMetadata"));
  if (hasError(diagnostics)) return failure(diagnostics);
  const payloadHash = await hashCanonical({ eventType: input.eventType, aggregateId: input.aggregateId, aggregateVersion: input.aggregateVersion, actorReference: input.actorReference, objectReference: input.objectReference, visibility: input.visibility, presentationKey: input.presentationKey, safeMetadata: input.safeMetadata ?? {} });
  return success({ eventId: input.eventId, eventType: input.eventType, aggregateId: input.aggregateId, aggregateVersion: input.aggregateVersion, actorReference: input.actorReference, objectReference: input.objectReference, visibility: input.visibility, presentationKey: input.presentationKey, payloadHash, producerProof: input.producerProof });
}

export interface SnsNotificationReference {
  readonly referenceId: SnsNotificationReferenceId;
  readonly sourceEventId: SnsEventId;
  readonly recipientAccountId: string;
  readonly objectReference: string;
  readonly presentationKey: string;
  readonly visibility: SnsVisibility;
  readonly recipientProof: AuthorizationProofV1;
  readonly containsBody: false;
  readonly deliveryFailureRollsBackCanonicalState: false;
}

export function createSnsNotificationReference(input: { readonly referenceId: SnsNotificationReferenceId; readonly event: SnsTrustedEvent; readonly recipientAccountId: string; readonly recipientProof: AuthorizationProofV1; readonly authorizationProofResolver: AuthorizationProofResolver }): SnsResult<SnsNotificationReference> {
  const diagnostics: SnsDiagnostic[] = [];
  validateId(input.referenceId, "referenceId", diagnostics);
  validateId(input.recipientAccountId, "recipientAccountId", diagnostics);
  try {
    const recipientProof = resolveAuthorizationProofV1(input.recipientProof, { principalId: input.recipientAccountId, resourceType: "SNS_RECIPIENT", resourceId: input.recipientAccountId, action: "sns.notification.resolve", capability: "sns.notification.resolve", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver);
    input = { ...input, recipientProof };
  } catch {
    diagnostics.push(error("NOTIFICATION_RECIPIENT_REQUIRED", "Notification recipient must be bound by a server AuthorizationProofV1.", "recipientProof"));
  }
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ referenceId: input.referenceId, sourceEventId: input.event.eventId, recipientAccountId: input.recipientAccountId, objectReference: input.event.objectReference, presentationKey: input.event.presentationKey, visibility: input.event.visibility, recipientProof: input.recipientProof, containsBody: false, deliveryFailureRollsBackCanonicalState: false });
}

export interface SnsPublicUrlCandidate {
  readonly resourceType: "POST" | "CREATOR_PAGE" | "PROJECT_PAGE" | "COMMUNITY" | "MARKET_CARD";
  readonly resourceId: string;
  readonly path: string;
  readonly authorizationProof: AuthorizationProofV1;
  readonly redirectExecuted: false;
}

export function createSnsPublicUrlCandidate(input: { readonly resourceType: SnsPublicUrlCandidate["resourceType"]; readonly resourceId: string; readonly path: string; readonly visibility: SnsVisibility; readonly resourceStatus: "PUBLISHED" | "ACTIVE"; readonly authorizationProof: AuthorizationProofV1; readonly authorizationProofResolver: AuthorizationProofResolver }): SnsResult<SnsPublicUrlCandidate> {
  const diagnostics: SnsDiagnostic[] = [];
  let resolvedProof: AuthorizationProofV1 | null = null;
  validateId(input.resourceId, "resourceId", diagnostics);
  if (!validPath(input.path)) diagnostics.push(error("INVALID_PATH", "Public URL candidate must be a safe same-origin path.", "path"));
  if (input.visibility !== "PUBLIC") diagnostics.push(error("PRIVATE_RESOURCE", "Only PUBLIC resources receive public URL candidates.", "visibility"));
  try {
    resolvedProof = resolveAuthorizationProofV1(input.authorizationProof, { resourceType: "SNS_PUBLIC_URL", resourceId: input.resourceId, action: "sns.public-url.resolve", capability: "sns.public-url.resolve", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver);
  } catch {
    diagnostics.push(error("PERMISSION_DENIED", "Public URL requires a bound server AuthorizationProofV1.", "authorizationProof"));
  }
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ resourceType: input.resourceType, resourceId: input.resourceId, path: input.path, authorizationProof: resolvedProof as AuthorizationProofV1, redirectExecuted: false });
}

export type Wp230Flag =
  | "sns-read"
  | "sns-write"
  | "community-read"
  | "community-write"
  | "creator-page-read"
  | "creator-page-write"
  | "my-page-read"
  | "market-card-share"
  | "sns-notification-projection"
  | "sns-moderation";

export const DEFAULT_WP230_FEATURE_FLAGS: Readonly<Record<Wp230Flag, false>> = Object.freeze({
  "sns-read": false,
  "sns-write": false,
  "community-read": false,
  "community-write": false,
  "creator-page-read": false,
  "creator-page-write": false,
  "my-page-read": false,
  "market-card-share": false,
  "sns-notification-projection": false,
  "sns-moderation": false,
});

export function snsFeatureEnabled(flags: Readonly<Record<string, boolean>>, flag: string, killSwitch: boolean): SnsResult<true> {
  if (killSwitch) return failure([error("KILL_SWITCH_ACTIVE", "WP-230 is disabled by the kill switch.")]);
  if (!(flag in DEFAULT_WP230_FEATURE_FLAGS)) return failure([error("UNKNOWN_FLAG", "Unknown SNS flag fails closed.", "flag")]);
  if (flags[flag] !== true) return failure([error("FEATURE_DISABLED", "SNS feature is disabled by default.", "flag")]);
  return success(true);
}

export interface SnsProjectionSnapshot {
  readonly postCount: number;
  readonly commentCount: number;
  readonly followCount: number;
  readonly reactionCount: number;
  readonly mentionCount: number;
  readonly communityCount: number;
  readonly marketCardCount: number;
}

export interface SnsRollbackPlan {
  readonly planId: string;
  readonly fromSnapshotHash: ContentHash;
  readonly restoreSnapshotHash: ContentHash;
  readonly restoreSnapshot: SnsProjectionSnapshot;
  readonly execution: "LOCAL_SHADOW_ONLY";
}

export async function createSnsRollbackPlan(current: SnsProjectionSnapshot, restoreSnapshot: SnsProjectionSnapshot): Promise<SnsRollbackPlan> {
  const fromSnapshotHash = await hashCanonical(current);
  const restoreSnapshotHash = await hashCanonical(restoreSnapshot);
  return { planId: `wp230-rollback:${restoreSnapshotHash.slice(0, 16)}`, fromSnapshotHash, restoreSnapshotHash, restoreSnapshot, execution: "LOCAL_SHADOW_ONLY" };
}

export function applySnsRollbackPlan(plan: SnsRollbackPlan, currentSnapshotHash: string): SnsResult<SnsProjectionSnapshot> {
  if (currentSnapshotHash !== plan.fromSnapshotHash) return failure([error("ROLLBACK_PRECONDITION_FAILED", "Rollback requires the last validated SNS snapshot.", "currentSnapshotHash")]);
  return success(plan.restoreSnapshot, [info("ROLLBACK_PRECONDITION_FAILED", "Shadow SNS projection restored; no external mutation executed.", { externalMutation: false })]);
}

export function auditSafeSnsSummary(input: { readonly postCount: number; readonly commentCount: number; readonly marketCardCount: number }): Readonly<Record<string, number | boolean | string>> {
  return { domain: "SNS_CORE", postCount: input.postCount, commentCount: input.commentCount, marketCardCount: input.marketCardCount, hasSensitiveFields: false, rawMediaBytes: 0, productionMutation: false };
}

export function canonicalSns(value: unknown): string { return canonicalJson(value); }
export function asSnsContentHash(value: string): ContentHash {
  if (!validHash(value)) throw new Error("SnsContentHash must be a lowercase SHA-256 hash.");
  return value as ContentHash;
}
