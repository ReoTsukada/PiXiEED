import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  resolveAuthorizationProofV1,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
} from "./wp160-contracts.ts";

/**
 * WP-240 isolated Admin / Analytics / Ads / Moderation / Revenue projection.
 *
 * The module accepts only bounded values and injected server decisions. It is
 * a read/shadow contract and never performs a route, storage, provider, or
 * financial mutation.
 */

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SAFE_NAME = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const SAFE_PROPERTY = /^[A-Za-z][A-Za-z0-9._:-]{0,95}$/;
const SAFE_REASON = /^[A-Z0-9][A-Z0-9._:-]{0,63}$/;
const MAX_PROPERTIES = 24;
const MAX_STRING_VALUE = 128;

export type Wp240DiagnosticCode =
  | "INVALID_ID"
  | "INVALID_NAME"
  | "INVALID_REASON"
  | "INVALID_AMOUNT"
  | "SERVER_AUTH_REQUIRED"
  | "ADMIN_CAPABILITY_REQUIRED"
  | "CLIENT_OVERRIDE_IGNORED"
  | "PRIVACY_FIELD_REJECTED"
  | "BOUNDED_PAYLOAD_REQUIRED"
  | "AD_SURFACE_FORBIDDEN"
  | "AD_FLAG_DISABLED"
  | "MODERATION_AUTH_REQUIRED"
  | "INVALID_MODERATION_STATE"
  | "SHADOW_ONLY_REQUIRED"
  | "UNKNOWN_FLAG"
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "ROLLBACK_PRECONDITION_FAILED";

export interface Wp240Diagnostic {
  readonly code: Wp240DiagnosticCode;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly message: string;
  readonly path?: string;
  readonly recoverable: boolean;
}

export type Wp240Result<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Wp240Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Wp240Diagnostic[] };

function error(code: Wp240DiagnosticCode, message: string, path?: string): Wp240Diagnostic {
  return { code, severity: "ERROR", message, ...(path === undefined ? {} : { path }), recoverable: false };
}

function info(code: Wp240DiagnosticCode, message: string): Wp240Diagnostic {
  return { code, severity: "INFO", message, recoverable: true };
}

function success<T>(value: T, diagnostics: readonly Wp240Diagnostic[] = []): Wp240Result<T> {
  return { ok: true, value, diagnostics };
}

function failure<T>(diagnostics: readonly Wp240Diagnostic[]): Wp240Result<T> {
  return { ok: false, diagnostics };
}

function hasError(diagnostics: readonly Wp240Diagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === "ERROR");
}

function validId(value: string): boolean { return SAFE_ID.test(value); }
function validName(value: string): boolean { return SAFE_NAME.test(value); }
function validReason(value: string): boolean { return SAFE_REASON.test(value); }

function validateId(value: string, path: string, diagnostics: Wp240Diagnostic[]): void {
  if (!validId(value)) diagnostics.push(error("INVALID_ID", "Reference must be a stable identifier.", path));
}

function validateName(value: string, path: string, diagnostics: Wp240Diagnostic[]): void {
  if (!validName(value)) diagnostics.push(error("INVALID_NAME", "Name must be a bounded lowercase identifier.", path));
}

function validatePropertyName(value: string, path: string, diagnostics: Wp240Diagnostic[]): void {
  if (!SAFE_PROPERTY.test(value)) diagnostics.push(error("INVALID_NAME", "Property name must be a bounded identifier.", path));
}

const PRIVACY_KEYS = new Set([
  "email", "phone", "address", "jwt", "token", "secret", "password", "authorization",
  "projectbody", "projectcontent", "privatecontent", "commissionbody", "commissioncontent",
  "rawbody", "rawmedia", "pixeldata", "audiodata", "pxd", "pixipackage", "payment",
  "purchase", "entitlement", "license", "royalty", "payout", "ledger", "prompt",
]);

function isPrivacyKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[_-]/g, "");
  return PRIVACY_KEYS.has(normalized);
}

function validateSafeProperties(properties: Readonly<Record<string, string | number | boolean>>, diagnostics: Wp240Diagnostic[]): void {
  const entries = Object.entries(properties);
  if (entries.length > MAX_PROPERTIES) diagnostics.push(error("BOUNDED_PAYLOAD_REQUIRED", "Analytics properties must remain bounded.", "properties"));
  for (const [key, value] of entries) {
    validatePropertyName(key, `properties.${key}`, diagnostics);
    if (isPrivacyKey(key)) diagnostics.push(error("PRIVACY_FIELD_REJECTED", "Private, financial, authentication, or creative content cannot enter Analytics.", `properties.${key}`));
    if (typeof value === "string" && (value.length > MAX_STRING_VALUE || /<\/?[a-z][^>]*>/i.test(value))) diagnostics.push(error("PRIVACY_FIELD_REJECTED", "Analytics string values must be short plain metadata.", `properties.${key}`));
    if (typeof value === "number" && !Number.isFinite(value)) diagnostics.push(error("BOUNDED_PAYLOAD_REQUIRED", "Analytics numbers must be finite.", `properties.${key}`));
  }
}

export type Wp240AdminCapability = "ADMIN_PROJECTION_READ" | "MODERATION_READ" | "ANALYTICS_READ" | "REVENUE_SHADOW_READ";
export type Wp240ProjectionKind = "CONTENT_HEALTH" | "MODERATION_QUEUE" | "ANALYTICS_SUMMARY" | "REVENUE_SHADOW";

export interface Wp240AdminProjection {
  readonly projectionId: string;
  readonly kind: Wp240ProjectionKind;
  readonly scopeReference: string;
  readonly source: "SERVER_PERMISSIONED_PROJECTION";
  readonly readOnly: true;
  readonly mutatesCanonicalState: false;
  readonly containsPrivateContent: false;
}

export function resolveWp240AdminProjection(input: {
  readonly projectionId: string;
  readonly kind: Wp240ProjectionKind;
  readonly scopeReference: string;
  readonly requiredCapability: Wp240AdminCapability;
  readonly authorizationProof?: AuthorizationProofV1;
  readonly authorizationProofResolver?: AuthorizationProofResolver;
  readonly clientRequestedCapability?: string;
}): Wp240Result<Wp240AdminProjection> {
  const diagnostics: Wp240Diagnostic[] = [];
  validateId(input.projectionId, "projectionId", diagnostics);
  validateId(input.scopeReference, "scopeReference", diagnostics);
  if (input.clientRequestedCapability !== undefined) diagnostics.push(info("CLIENT_OVERRIDE_IGNORED", "Client capability requests are diagnostic only."));
  try {
    resolveAuthorizationProofV1(input.authorizationProof, { resourceType: "ADMIN_PROJECTION", resourceId: input.projectionId, action: "admin.projection.read", capability: input.requiredCapability, tenantId: input.authorizationProof?.tenantId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("SERVER_AUTH_REQUIRED", "Admin projection requires a server AuthorizationProofV1 bound to the Projection and capability."));
  }
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ projectionId: input.projectionId, kind: input.kind, scopeReference: input.scopeReference, source: "SERVER_PERMISSIONED_PROJECTION", readOnly: true, mutatesCanonicalState: false, containsPrivateContent: false }, diagnostics);
}

export type Wp240AnalyticsSurface = "PUBLIC_DISCOVERY" | "PUBLIC_FEED" | "MARKET_LISTING" | "PUBLIC_RESOURCE" | "ACTIVE_STUDIO" | "CHECKOUT" | "ENTITLEMENT" | "COMMISSION" | "ACCOUNT_PRIVATE" | "PROJECT_PRIVATE";

export interface Wp240AnalyticsEvent {
  readonly eventId: string;
  readonly eventName: string;
  readonly surface: Wp240AnalyticsSurface;
  readonly actorReference?: string;
  readonly resourceReference?: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
  readonly privacySafe: true;
  readonly containsJwtEmailSecretProjectContentCommissionContent: false;
}

export function createWp240AnalyticsEvent(input: {
  readonly eventId: string;
  readonly eventName: string;
  readonly surface: Wp240AnalyticsSurface;
  readonly actorReference?: string;
  readonly resourceReference?: string;
  readonly properties?: Readonly<Record<string, string | number | boolean>>;
}): Wp240Result<Wp240AnalyticsEvent> {
  const diagnostics: Wp240Diagnostic[] = [];
  validateId(input.eventId, "eventId", diagnostics);
  validateName(input.eventName, "eventName", diagnostics);
  if (input.actorReference !== undefined) validateId(input.actorReference, "actorReference", diagnostics);
  if (input.resourceReference !== undefined) validateId(input.resourceReference, "resourceReference", diagnostics);
  const properties = input.properties ?? {};
  validateSafeProperties(properties, diagnostics);
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ eventId: input.eventId, eventName: input.eventName, surface: input.surface, ...(input.actorReference === undefined ? {} : { actorReference: input.actorReference }), ...(input.resourceReference === undefined ? {} : { resourceReference: input.resourceReference }), properties: { ...properties }, privacySafe: true, containsJwtEmailSecretProjectContentCommissionContent: false });
}

export interface Wp240AdDecision {
  readonly eligible: boolean;
  readonly surface: Wp240AnalyticsSurface;
  readonly reason: "PUBLIC_SURFACE" | "PRIVATE_CREATION_SURFACE" | "SERVER_PERMISSION_REQUIRED" | "AD_FLAG_DISABLED";
  readonly createsCommerceState: false;
}

export function resolveWp240AdPlacement(input: { readonly surface: Wp240AnalyticsSurface; readonly serverResolved: boolean; readonly adsEnabled: boolean }): Wp240Result<Wp240AdDecision> {
  const privateCreation = ["ACTIVE_STUDIO", "CHECKOUT", "ENTITLEMENT", "COMMISSION", "ACCOUNT_PRIVATE", "PROJECT_PRIVATE"].includes(input.surface);
  if (input.serverResolved !== true) return failure([error("SERVER_AUTH_REQUIRED", "Ad placement requires a server-resolved surface decision.")]);
  if (privateCreation) return success({ eligible: false, surface: input.surface, reason: "PRIVATE_CREATION_SURFACE", createsCommerceState: false });
  if (input.adsEnabled !== true) return success({ eligible: false, surface: input.surface, reason: "AD_FLAG_DISABLED", createsCommerceState: false });
  return success({ eligible: true, surface: input.surface, reason: "PUBLIC_SURFACE", createsCommerceState: false });
}

export type Wp240ModerationAction = "REPORT" | "HIDE" | "REMOVE" | "RESTRICT" | "SUSPEND" | "APPEAL";
export type Wp240ModerationTarget = "POST" | "COMMENT" | "PROJECT" | "MARKET_PRODUCT" | "COMMUNITY" | "COMMISSION";

export interface Wp240ModerationReference {
  readonly moderationId: string;
  readonly targetType: Wp240ModerationTarget;
  readonly targetReference: string;
  readonly action: Wp240ModerationAction;
  readonly reasonCode: string;
  readonly authorizationProof: AuthorizationProofV1;
  readonly containsBody: false;
  readonly mutatesTarget: false;
}

export function createWp240ModerationReference(input: { readonly moderationId: string; readonly targetType: Wp240ModerationTarget; readonly targetReference: string; readonly action: Wp240ModerationAction; readonly reasonCode: string; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): Wp240Result<Wp240ModerationReference> {
  const diagnostics: Wp240Diagnostic[] = [];
  validateId(input.moderationId, "moderationId", diagnostics);
  validateId(input.targetReference, "targetReference", diagnostics);
  if (!validReason(input.reasonCode)) diagnostics.push(error("INVALID_REASON", "Moderation reason must be a bounded policy code.", "reasonCode"));
  if (!Object.values<Wp240ModerationAction>(["REPORT", "HIDE", "REMOVE", "RESTRICT", "SUSPEND", "APPEAL"]).includes(input.action)) diagnostics.push(error("INVALID_MODERATION_STATE", "Moderation action is not supported.", "action"));
  let authorizationProof: AuthorizationProofV1 | null = null;
  try {
    authorizationProof = resolveAuthorizationProofV1(input.authorizationProof, { resourceType: "MODERATION_REFERENCE", resourceId: input.moderationId, action: "moderation.reference.create", capability: "moderation.reference.create", tenantId: input.authorizationProof?.tenantId ?? null, correlationId: input.authorizationProof?.correlationId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("MODERATION_AUTH_REQUIRED", "Moderation reference requires a bound server AuthorizationProofV1.", "authorizationProof"));
  }
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ moderationId: input.moderationId, targetType: input.targetType, targetReference: input.targetReference, action: input.action, reasonCode: input.reasonCode, authorizationProof: authorizationProof as AuthorizationProofV1, containsBody: false, mutatesTarget: false });
}

export interface Wp240RevenueShadowComparison {
  readonly comparisonId: string;
  readonly currency: string;
  readonly expectedMinorUnits: number;
  readonly observedMinorUnits: number;
  readonly deltaMinorUnits: number;
  readonly shadowOnly: true;
  readonly mutatesLedger: false;
  readonly mutatesPayout: false;
  readonly source: "READ_ONLY_COMPARISON";
}

export function createWp240RevenueShadowComparison(input: { readonly comparisonId: string; readonly currency: string; readonly expectedMinorUnits: number; readonly observedMinorUnits: number; readonly serverReadOnly: boolean; readonly ledgerMutation: boolean; readonly payoutMutation: boolean }): Wp240Result<Wp240RevenueShadowComparison> {
  const diagnostics: Wp240Diagnostic[] = [];
  validateId(input.comparisonId, "comparisonId", diagnostics);
  if (!/^[A-Z]{3}$/.test(input.currency)) diagnostics.push(error("INVALID_NAME", "Currency must be an ISO-like uppercase code.", "currency"));
  for (const [value, path] of [[input.expectedMinorUnits, "expectedMinorUnits"], [input.observedMinorUnits, "observedMinorUnits"]] as const) {
    if (!Number.isSafeInteger(value) || value < 0) diagnostics.push(error("INVALID_AMOUNT", "Revenue comparison values must be non-negative minor units.", path));
  }
  if (input.serverReadOnly !== true || input.ledgerMutation !== false || input.payoutMutation !== false) diagnostics.push(error("SHADOW_ONLY_REQUIRED", "Revenue comparison is read-only and cannot mutate Ledger or Payout.", "shadowOnly"));
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ comparisonId: input.comparisonId, currency: input.currency, expectedMinorUnits: input.expectedMinorUnits, observedMinorUnits: input.observedMinorUnits, deltaMinorUnits: input.observedMinorUnits - input.expectedMinorUnits, shadowOnly: true, mutatesLedger: false, mutatesPayout: false, source: "READ_ONLY_COMPARISON" });
}

export type Wp240Flag = "admin-projection-read" | "analytics-write" | "ads-public-read" | "moderation-reference-read" | "revenue-shadow-read";

export const DEFAULT_WP240_FEATURE_FLAGS: Readonly<Record<Wp240Flag, false>> = Object.freeze({
  "admin-projection-read": false,
  "analytics-write": false,
  "ads-public-read": false,
  "moderation-reference-read": false,
  "revenue-shadow-read": false,
});

export function wp240FeatureEnabled(flags: Readonly<Record<string, boolean>>, flag: string, killSwitch: boolean): Wp240Result<true> {
  if (killSwitch) return failure([error("KILL_SWITCH_ACTIVE", "WP-240 is disabled by the kill switch.")]);
  if (!(flag in DEFAULT_WP240_FEATURE_FLAGS)) return failure([error("UNKNOWN_FLAG", "Unknown WP-240 flag fails closed.", "flag")]);
  if (flags[flag] !== true) return failure([error("FEATURE_DISABLED", "WP-240 feature is disabled by default.", "flag")]);
  return success(true);
}

export interface Wp240ProjectionSnapshot {
  readonly adminCount: number;
  readonly analyticsCount: number;
  readonly moderationCount: number;
  readonly revenueComparisonCount: number;
}

export interface Wp240RollbackPlan {
  readonly planId: string;
  readonly fromSnapshot: Wp240ProjectionSnapshot;
  readonly restoreSnapshot: Wp240ProjectionSnapshot;
  readonly execution: "LOCAL_SHADOW_ONLY";
}

export function createWp240RollbackPlan(current: Wp240ProjectionSnapshot, restoreSnapshot: Wp240ProjectionSnapshot): Wp240RollbackPlan {
  return { planId: `wp240-rollback:${current.adminCount}:${restoreSnapshot.adminCount}`, fromSnapshot: { ...current }, restoreSnapshot: { ...restoreSnapshot }, execution: "LOCAL_SHADOW_ONLY" };
}

export function applyWp240RollbackPlan(plan: Wp240RollbackPlan, currentSnapshot: Wp240ProjectionSnapshot): Wp240Result<Wp240ProjectionSnapshot> {
  if (JSON.stringify(currentSnapshot) !== JSON.stringify(plan.fromSnapshot)) return failure([error("ROLLBACK_PRECONDITION_FAILED", "Rollback requires the last validated local shadow snapshot.")]);
  return success({ ...plan.restoreSnapshot }, [info("ROLLBACK_PRECONDITION_FAILED", "Local projection restored; no external mutation executed.")]);
}

export function auditSafeWp240Summary(input: { readonly adminCount: number; readonly analyticsCount: number; readonly moderationCount: number; readonly revenueComparisonCount: number }): Readonly<Record<string, number | boolean | string>> {
  return { domain: "WP240_ADMIN_ANALYTICS_ADS_REVENUE", ...input, containsSensitiveData: false, productionMutation: false, ledgerMutation: false, payoutMutation: false };
}
