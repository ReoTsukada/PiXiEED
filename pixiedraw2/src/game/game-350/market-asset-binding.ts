/**
 * Pure Market -> iGAME binding boundary.
 *
 * This module deliberately does not download, merge, mutate, or persist a
 * Project.  A Game source is promoted only from server-authoritative metadata
 * plus an explicit secure-delivery proof.  Raw bytes and URLs are not part of
 * any accepted input or output contract.
 */

import type {
  GameAssetDefaults,
  GameAssetEntry,
  GamePlaygroundAssetLayout,
  GamePlaygroundDrawReference,
  GamePlaygroundReferenceMode,
} from "./playground.ts";
import type {
  GameMarketAccess,
  GameMarketCatalogRecord,
  GameMarketEntitlementStatus,
} from "./game-market-catalog.ts";

export type MarketBindingDiagnosticCode =
  | "INVALID_CATALOG"
  | "INVALID_ACCESS"
  | "INVALID_METADATA"
  | "INVALID_LICENSE"
  | "INVALID_DELIVERY"
  | "UNSUPPORTED_FORMAT"
  | "ENTITLEMENT_REQUIRED"
  | "SECURE_DELIVERY_REQUIRED"
  | "REVISION_MISMATCH"
  | "HASH_MISMATCH"
  | "LICENSE_MISMATCH"
  | "INVALID_TRANSITION"
  | "PROJECT_REQUIRED";

export interface MarketBindingDiagnostic {
  readonly code: MarketBindingDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

export type MarketBindingResult<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly MarketBindingDiagnostic[] };

export interface MarketAssetLicenseMetadata {
  readonly licenseId: string;
  readonly rights: readonly string[];
  readonly status: "ACTIVE";
  /** Server-authoritative permission for use as an iGAME source. */
  readonly inGameUse: true;
}

/** Metadata copied from an authoritative Draw/asset registry reference only. */
export interface MarketGameSourceMetadata {
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  /** Signed bytes hash for a directly imported source file, when available. */
  readonly packageHash?: string;
  readonly label: string;
  readonly layout: GamePlaygroundAssetLayout;
  readonly format: string;
  readonly mode?: GamePlaygroundReferenceMode;
  readonly projectId?: string;
  readonly assetDefinitionId?: string;
}

/** Proof of secure delivery. It intentionally has no bytes, blob, or URL. */
export interface SecureMarketDeliveryMetadata {
  readonly deliveryId: string;
  readonly status: "SECURE_DELIVERED";
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  /** Signed bytes hash for a directly imported source file, when available. */
  readonly packageHash?: string;
  readonly format: string;
  readonly licenseId: string;
}

export interface MarketAssetBindingInput {
  readonly catalog: GameMarketCatalogRecord;
  readonly access: GameMarketAccess;
  readonly entitlementStatus?: GameMarketEntitlementStatus | string;
  readonly source: MarketGameSourceMetadata;
  readonly license: MarketAssetLicenseMetadata;
  readonly delivery: SecureMarketDeliveryMetadata;
  readonly supportedFormats: readonly string[];
  readonly defaults?: GameAssetDefaults;
}

export interface MarketAssetBindingCandidate {
  readonly assetId: string;
  readonly format: string;
  readonly licenseId: string;
  readonly rights: readonly string[];
  readonly deliveryId: string;
  readonly entry: GameAssetEntry;
}

export type MarketBindingFlowState =
  | "ACCESS_REQUIRED"
  | "AUTH_REQUIRED"
  | "UNAVAILABLE"
  | "PURCHASE_PENDING"
  | "ENTITLEMENT_PENDING"
  | "DELIVERY_PENDING"
  | "READY"
  | "BINDING_PENDING"
  | "BOUND"
  | "FAILED";

export interface MarketAssetBindingFlow {
  readonly state: MarketBindingFlowState;
  readonly access: GameMarketAccess;
  readonly candidate?: MarketAssetBindingCandidate;
  readonly intent?: PendingGameAssetBindingIntent;
  readonly failure?: MarketBindingDiagnostic;
}

export type MarketAssetBindingEvent =
  | { readonly type: "PURCHASE_STARTED" }
  | { readonly type: "PURCHASE_CONFIRMED" }
  | { readonly type: "ENTITLEMENT_CONFIRMED"; readonly status: "PAID" | "GRANTED" }
  /** Candidate must already have been produced by createMarketAssetBindingCandidate. */
  | { readonly type: "SECURE_DELIVERY_CONFIRMED"; readonly candidate: MarketAssetBindingCandidate }
  | { readonly type: "BINDING_REQUESTED"; readonly intent: PendingGameAssetBindingIntent }
  | { readonly type: "BINDING_CONFIRMED" }
  | { readonly type: "FAILED"; readonly diagnostic: MarketBindingDiagnostic };

/** A request to the Project owner; it is never a merged Project snapshot. */
export interface PendingGameAssetBindingIntent {
  readonly intentId: string;
  readonly targetProjectId: string;
  readonly assetId: string;
  readonly revisionId: string;
  readonly contentHash: string;
  readonly licenseId: string;
  readonly deliveryId: string;
  readonly status: "PENDING";
}

const HASH = /^[a-f0-9]{64}$/u;
const NON_EMPTY = /\S/u;

function diagnostic(
  code: MarketBindingDiagnosticCode,
  path: string,
  message: string,
): MarketBindingDiagnostic {
  return { code, path, message };
}

function success<T>(value: T): MarketBindingResult<T> {
  return { ok: true, value, diagnostics: [] };
}

function failure<T>(...diagnostics: MarketBindingDiagnostic[]): MarketBindingResult<T> {
  return { ok: false, diagnostics };
}

function text(value: unknown): value is string {
  return typeof value === "string" && NON_EMPTY.test(value.trim());
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasForbiddenPayload(value: unknown): boolean {
  if (!record(value)) return false;
  return ["bytes", "blob", "url", "downloadUrl", "payload", "content"]
    .some((key) => key in value);
}

function validUniqueStrings(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 &&
    value.every((item) => text(item)) && new Set(value).size === value.length;
}

function validCatalog(value: GameMarketCatalogRecord): boolean {
  return text(value.id) && text(value.title) && text(value.kind) &&
    validUniqueStrings(value.formats) && validUniqueStrings(value.rights) &&
    record(value.price) && Number.isSafeInteger(value.price.amountMinor) && value.price.amountMinor >= 0;
}

function validAccess(value: GameMarketAccess): boolean {
  return value === "FREE" || value === "PURCHASED" || value === "AVAILABLE" ||
    value === "AUTH_REQUIRED" || value === "UNAVAILABLE";
}

function entitled(status: string | undefined): boolean {
  return status === "PAID" || status === "GRANTED";
}

function sameIntentCandidate(
  intent: PendingGameAssetBindingIntent,
  candidate: MarketAssetBindingCandidate,
): boolean {
  return intent.assetId === candidate.assetId &&
    intent.revisionId === candidate.entry.source.revisionId &&
    intent.contentHash === candidate.entry.source.contentHash &&
    intent.licenseId === candidate.licenseId &&
    intent.deliveryId === candidate.deliveryId;
}

function validateInput(input: unknown): readonly MarketBindingDiagnostic[] {
  const errors: MarketBindingDiagnostic[] = [];
  if (!record(input)) return [diagnostic("INVALID_METADATA", "input", "Binding input must be an object.")];
  const item = input as unknown as MarketAssetBindingInput;
  if (!record(item.catalog) || !record(item.source) || !record(item.license) || !record(item.delivery)) {
    return [diagnostic("INVALID_METADATA", "input", "Catalog, source, license, and delivery metadata are required.")];
  }
  if (hasForbiddenPayload(item.source) || hasForbiddenPayload(item.delivery)) {
    errors.push(diagnostic("INVALID_METADATA", "source", "Raw bytes and URLs cannot be promoted to a Game source."));
  }
  if (!validCatalog(item.catalog)) errors.push(diagnostic("INVALID_CATALOG", "catalog", "Catalog metadata is invalid."));
  if (!validAccess(item.access)) errors.push(diagnostic("INVALID_ACCESS", "access", "Market access is invalid."));
  if (!validUniqueStrings(item.supportedFormats)) errors.push(diagnostic("UNSUPPORTED_FORMAT", "supportedFormats", "Supported formats are required."));
  if (!text(item.source.assetId) || !text(item.source.revisionId) || !HASH.test(item.source.contentHash) || !text(item.source.label) || !text(item.source.format)) {
    errors.push(diagnostic("INVALID_METADATA", "source", "Only complete, hashed source metadata is accepted."));
  }
  if (!text(item.license.licenseId) || !validUniqueStrings(item.license.rights) || item.license.status !== "ACTIVE" || item.license.inGameUse !== true) {
    errors.push(diagnostic("INVALID_LICENSE", "license", "An active in-game license and rights are required."));
  }
  if (item.source.packageHash !== undefined && !HASH.test(item.source.packageHash)) {
    errors.push(diagnostic("INVALID_METADATA", "source.packageHash", "Source package bytes hash is invalid."));
  }
  if (item.delivery.packageHash !== undefined && !HASH.test(item.delivery.packageHash)) {
    errors.push(diagnostic("INVALID_DELIVERY", "delivery.packageHash", "Delivered package bytes hash is invalid."));
  }
  if ((item.source.packageHash ?? undefined) !== (item.delivery.packageHash ?? undefined)) {
    errors.push(diagnostic("HASH_MISMATCH", "packageHash", "Source and delivery package bytes hashes must match."));
  }
  if (!text(item.delivery.deliveryId) || item.delivery.status !== "SECURE_DELIVERED" || !text(item.delivery.assetId) || !text(item.delivery.revisionId) || !HASH.test(item.delivery.contentHash) || !text(item.delivery.format) || !text(item.delivery.licenseId)) {
    errors.push(diagnostic("INVALID_DELIVERY", "delivery", "Secure delivery metadata is incomplete."));
  }
  if (!item.catalog.formats.includes(item.source.format) || !item.supportedFormats.includes(item.source.format)) {
    errors.push(diagnostic("UNSUPPORTED_FORMAT", "source.format", "The source format is not supported by the catalog and iGAME."));
  }
  if (item.access === "AVAILABLE" || item.access === "AUTH_REQUIRED" || item.access === "UNAVAILABLE") {
    errors.push(diagnostic("ENTITLEMENT_REQUIRED", "access", "Unpurchased or unavailable assets cannot become binding candidates."));
  }
  if (item.access === "PURCHASED" && !entitled(item.entitlementStatus)) {
    errors.push(diagnostic("ENTITLEMENT_REQUIRED", "entitlementStatus", "Purchased access requires a paid or granted entitlement."));
  }
  if (item.access === "FREE" && item.catalog.price.amountMinor !== 0) {
    errors.push(diagnostic("INVALID_ACCESS", "catalog.price.amountMinor", "FREE access requires a zero-priced catalog record."));
  }
  if (item.access === "PURCHASED" && item.catalog.price.amountMinor === 0) {
    errors.push(diagnostic("INVALID_ACCESS", "access", "A zero-priced asset must use FREE access."));
  }
  if (item.source.assetId !== item.catalog.id || item.delivery.assetId !== item.source.assetId) {
    errors.push(diagnostic("INVALID_METADATA", "assetId", "Catalog, source, and delivery asset IDs must match."));
  }
  if (item.delivery.revisionId !== item.source.revisionId) errors.push(diagnostic("REVISION_MISMATCH", "delivery.revisionId", "Delivery revision does not match source metadata."));
  if (item.delivery.contentHash !== item.source.contentHash) errors.push(diagnostic("HASH_MISMATCH", "delivery.contentHash", "Delivery hash does not match source metadata."));
  if (item.delivery.format !== item.source.format) errors.push(diagnostic("UNSUPPORTED_FORMAT", "delivery.format", "Delivery format does not match source metadata."));
  if (item.delivery.licenseId !== item.license.licenseId) errors.push(diagnostic("LICENSE_MISMATCH", "delivery.licenseId", "Delivery license does not match the active license."));
  return errors;
}

/** Convert only entitled/free, securely delivered metadata into a Game entry. */
export function createMarketAssetBindingCandidate(
  input: MarketAssetBindingInput,
): MarketBindingResult<MarketAssetBindingCandidate> {
  const errors = validateInput(input);
  if (errors.length > 0) return failure(...errors);
  const source: GamePlaygroundDrawReference = {
    assetId: input.source.assetId,
    revisionId: input.source.revisionId,
    contentHash: input.source.contentHash,
    label: input.source.label,
    mode: "PINNED",
    ...(input.source.projectId === undefined ? {} : { projectId: input.source.projectId }),
    ...(input.source.assetDefinitionId === undefined ? {} : { assetDefinitionId: input.source.assetDefinitionId }),
    licenseId: input.license.licenseId,
    rights: [...input.license.rights],
    sourceKind: "MARKET",
    layout: input.source.layout,
  };
  const defaults: GameAssetDefaults = input.defaults ?? { movable: true, collision: false, gravity: false };
  return success({
    assetId: input.source.assetId,
    format: input.source.format,
    licenseId: input.license.licenseId,
    rights: [...input.license.rights],
    deliveryId: input.delivery.deliveryId,
    entry: { assetId: input.source.assetId, name: input.source.label, source, defaults },
  });
}

/** Create an immutable-looking request envelope; it does not touch the Project. */
export function createPendingGameAssetBindingIntent(
  candidate: MarketAssetBindingCandidate,
  targetProjectId: string,
  intentId: string,
): MarketBindingResult<PendingGameAssetBindingIntent> {
  if (!text(targetProjectId)) return failure(diagnostic("PROJECT_REQUIRED", "targetProjectId", "A target Project ID is required."));
  if (!text(intentId)) return failure(diagnostic("INVALID_METADATA", "intentId", "An intent ID is required."));
  return success({
    intentId: intentId.trim(),
    targetProjectId: targetProjectId.trim(),
    assetId: candidate.assetId,
    revisionId: candidate.entry.source.revisionId,
    contentHash: candidate.entry.source.contentHash,
    licenseId: candidate.licenseId,
    deliveryId: candidate.deliveryId,
    status: "PENDING",
  });
}

/** Start the pure purchase -> entitlement -> delivery -> binding flow. */
export function createMarketAssetBindingFlow(
  access: GameMarketAccess,
  candidate?: MarketAssetBindingCandidate,
  entitlementStatus?: GameMarketEntitlementStatus | string,
): MarketAssetBindingFlow {
  if (access === "AUTH_REQUIRED") return { state: "AUTH_REQUIRED", access };
  if (access === "UNAVAILABLE") return { state: "UNAVAILABLE", access };
  if (access === "AVAILABLE") return { state: "ACCESS_REQUIRED", access };
  if (access === "PURCHASED" && !entitled(entitlementStatus)) {
    return { state: "ENTITLEMENT_PENDING", access };
  }
  return { state: candidate === undefined ? "DELIVERY_PENDING" : "READY", access, ...(candidate === undefined ? {} : { candidate }) };
}

/**
 * Advance the flow without side effects. Invalid transitions fail closed and
 * retain no partially promoted Game source.
 */
export function advanceMarketAssetBindingFlow(
  flow: MarketAssetBindingFlow,
  event: MarketAssetBindingEvent,
): MarketBindingResult<MarketAssetBindingFlow> {
  const invalid = (): MarketBindingResult<MarketAssetBindingFlow> => failure(
    diagnostic("INVALID_TRANSITION", "event", `Cannot apply ${event.type} while in ${flow.state}.`),
  );
  if (event.type === "FAILED") return success({ ...flow, state: "FAILED", failure: event.diagnostic });
  if (event.type === "PURCHASE_STARTED" && flow.state === "ACCESS_REQUIRED" && flow.access === "AVAILABLE") return success({ ...flow, state: "PURCHASE_PENDING" });
  if (event.type === "PURCHASE_CONFIRMED" && flow.state === "PURCHASE_PENDING") return success({ ...flow, state: "ENTITLEMENT_PENDING" });
  if (event.type === "ENTITLEMENT_CONFIRMED" && flow.state === "ENTITLEMENT_PENDING") return success({ ...flow, state: "DELIVERY_PENDING" });
  if (event.type === "SECURE_DELIVERY_CONFIRMED" && flow.state === "DELIVERY_PENDING") return success({ ...flow, state: "READY", candidate: event.candidate });
  if (event.type === "BINDING_REQUESTED" && flow.state === "READY" && flow.candidate !== undefined && sameIntentCandidate(event.intent, flow.candidate)) return success({ ...flow, state: "BINDING_PENDING", intent: event.intent });
  if (event.type === "BINDING_CONFIRMED" && flow.state === "BINDING_PENDING" && flow.intent !== undefined) return success({ ...flow, state: "BOUND" });
  return invalid();
}
