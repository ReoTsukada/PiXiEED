/**
 * WP-250 reconstructed policy/economics shadow boundary.
 *
 * It covers consent-aware public ad eligibility, reserved lazy slots,
 * revenue/cost unit-economics projections, sponsored-search separation, and
 * versioned moderation/audit references. It never calls a provider or changes
 * canonical, commerce, or moderation state.
 */

import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  resolveAuthorizationProofV1,
  type AuthorizationProofResolver,
  type AuthorizationProofV1,
} from "./wp160-contracts.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const SAFE_CODE = /^[A-Z0-9][A-Z0-9._:-]{0,63}$/;
const SAFE_NAME = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const MAX_REFERENCES = 64;

export type Wp250DiagnosticCode =
  | "INVALID_ID"
  | "INVALID_CODE"
  | "INVALID_AMOUNT"
  | "INVALID_DIMENSION"
  | "SERVER_POLICY_REQUIRED"
  | "PRIVATE_SURFACE"
  | "CONSENT_REQUIRED"
  | "REGION_BLOCKED"
  | "AGE_POLICY_BLOCKED"
  | "PROVIDER_INELIGIBLE"
  | "VIEWPORT_NOT_NEAR"
  | "SLOT_RESERVATION_REQUIRED"
  | "BOUNDED_REFERENCE_REQUIRED"
  | "INVALID_STAGE"
  | "SPONSORED_LABEL_REQUIRED"
  | "MODERATION_AUTH_REQUIRED"
  | "AUDIT_REFERENCE_REQUIRED"
  | "AUTOMATIC_MUTATION_REJECTED"
  | "SHADOW_ONLY_REQUIRED"
  | "UNKNOWN_FLAG"
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "ROLLBACK_PRECONDITION_FAILED";

export interface Wp250Diagnostic {
  readonly code: Wp250DiagnosticCode;
  readonly severity: "INFO" | "WARNING" | "ERROR";
  readonly message: string;
  readonly path?: string;
  readonly recoverable: boolean;
}

export type Wp250Result<T> =
  | { readonly ok: true; readonly value: T; readonly diagnostics: readonly Wp250Diagnostic[] }
  | { readonly ok: false; readonly diagnostics: readonly Wp250Diagnostic[] };

function error(code: Wp250DiagnosticCode, message: string, path?: string): Wp250Diagnostic {
  return { code, severity: "ERROR", message, ...(path === undefined ? {} : { path }), recoverable: false };
}

function info(code: Wp250DiagnosticCode, message: string): Wp250Diagnostic {
  return { code, severity: "INFO", message, recoverable: true };
}

function success<T>(value: T, diagnostics: readonly Wp250Diagnostic[] = []): Wp250Result<T> {
  return { ok: true, value, diagnostics };
}

function failure<T>(diagnostics: readonly Wp250Diagnostic[]): Wp250Result<T> {
  return { ok: false, diagnostics };
}

function hasError(diagnostics: readonly Wp250Diagnostic[]): boolean {
  return diagnostics.some((item) => item.severity === "ERROR");
}

function validateId(value: string, path: string, diagnostics: Wp250Diagnostic[]): void {
  if (!SAFE_ID.test(value)) diagnostics.push(error("INVALID_ID", "Reference must be a stable identifier.", path));
}

function validateCode(value: string, path: string, diagnostics: Wp250Diagnostic[]): void {
  if (!SAFE_CODE.test(value)) diagnostics.push(error("INVALID_CODE", "Policy code must be bounded and stable.", path));
}

function validateName(value: string, path: string, diagnostics: Wp250Diagnostic[]): void {
  if (!SAFE_NAME.test(value)) diagnostics.push(error("INVALID_CODE", "Name must be a bounded lowercase identifier.", path));
}

export type Wp250PublicSurface = "DISCOVER" | "PUBLIC_SOCIAL" | "COMMUNITY" | "PUBLIC_CREATOR" | "PUBLIC_PROJECT" | "MARKET_BROWSE" | "PUBLIC_GAME" | "PUBLIC_LISTENING";
export type Wp250PrivateSurface = "DRAW2_EDITOR" | "GAME_EDITOR" | "AUDIO_EDITOR" | "DIRECT_WORK" | "CHECKOUT" | "ACCOUNT_SECURITY" | "PRIVATE_PROJECT" | "PRIVATE_INBOX" | "ADMIN";
export type Wp250Surface = Wp250PublicSurface | Wp250PrivateSurface;
export type Wp250ConsentState = "GRANTED" | "DENIED" | "NOT_REQUIRED" | "UNKNOWN";
export type Wp250PolicyState = "ALLOWED" | "BLOCKED" | "UNKNOWN";

export interface Wp250ConsentPolicyDecision {
  readonly adsAllowed: boolean;
  readonly analyticsAllowed: boolean;
  readonly essentialTelemetryAllowed: true;
  readonly reason: "PUBLIC_POLICY_ALLOWED" | "AD_CONSENT_REQUIRED" | "REGION_BLOCKED" | "AGE_POLICY_BLOCKED" | "POLICY_UNKNOWN";
  readonly legalDecisionDelegated: true;
}

export function resolveWp250ConsentPolicy(input: {
  readonly serverResolved: boolean;
  readonly region: Wp250PolicyState;
  readonly agePolicy: Wp250PolicyState;
  readonly adConsent: Wp250ConsentState;
  readonly analyticsConsent: Wp250ConsentState;
}): Wp250Result<Wp250ConsentPolicyDecision> {
  if (input.serverResolved !== true) return failure([error("SERVER_POLICY_REQUIRED", "Consent, region, and age policy require a server-resolved decision.")]);
  if (input.region === "BLOCKED") return success({ adsAllowed: false, analyticsAllowed: false, essentialTelemetryAllowed: true, reason: "REGION_BLOCKED", legalDecisionDelegated: true });
  if (input.agePolicy === "BLOCKED") return success({ adsAllowed: false, analyticsAllowed: false, essentialTelemetryAllowed: true, reason: "AGE_POLICY_BLOCKED", legalDecisionDelegated: true });
  if (input.region === "UNKNOWN" || input.agePolicy === "UNKNOWN") return success({ adsAllowed: false, analyticsAllowed: false, essentialTelemetryAllowed: true, reason: "POLICY_UNKNOWN", legalDecisionDelegated: true });
  const adsAllowed = input.adConsent === "GRANTED" || input.adConsent === "NOT_REQUIRED";
  const analyticsAllowed = input.analyticsConsent === "GRANTED" || input.analyticsConsent === "NOT_REQUIRED";
  return success({ adsAllowed, analyticsAllowed, essentialTelemetryAllowed: true, reason: adsAllowed ? "PUBLIC_POLICY_ALLOWED" : "AD_CONSENT_REQUIRED", legalDecisionDelegated: true });
}

export interface Wp250AdEligibility {
  readonly eligible: boolean;
  readonly surface: Wp250Surface;
  readonly reason: "PUBLIC_POLICY_ALLOWED" | "PRIVATE_SURFACE" | "SERVER_POLICY_REQUIRED" | "CONSENT_REQUIRED" | "REGION_BLOCKED" | "AGE_POLICY_BLOCKED" | "PROVIDER_INELIGIBLE" | "VIEWPORT_NOT_NEAR" | "SLOT_RESERVATION_REQUIRED";
  readonly sdkLoad: "NONE" | "DEFERRED_LAZY_ADAPTER";
  readonly providerRequest: "NOT_REQUESTED" | "ON_DEMAND_ONLY";
  readonly layout: "RESERVED" | "NO_SLOT";
  readonly providerSdkInEditorBundle: false;
}

export function resolveWp250AdEligibility(input: {
  readonly surface: Wp250Surface;
  readonly serverResolved: boolean;
  readonly policy: Wp250ConsentPolicyDecision;
  readonly providerEligibility: Wp250PolicyState;
  readonly viewportProximity: boolean;
  readonly slotReserved: boolean;
}): Wp250Result<Wp250AdEligibility> {
  const privateSurface = ["DRAW2_EDITOR", "GAME_EDITOR", "AUDIO_EDITOR", "DIRECT_WORK", "CHECKOUT", "ACCOUNT_SECURITY", "PRIVATE_PROJECT", "PRIVATE_INBOX", "ADMIN"].includes(input.surface);
  const base = { surface: input.surface, providerSdkInEditorBundle: false as const };
  if (input.serverResolved !== true) return success({ ...base, eligible: false, reason: "SERVER_POLICY_REQUIRED", sdkLoad: "NONE", providerRequest: "NOT_REQUESTED", layout: "NO_SLOT" });
  if (privateSurface) return success({ ...base, eligible: false, reason: "PRIVATE_SURFACE", sdkLoad: "NONE", providerRequest: "NOT_REQUESTED", layout: "NO_SLOT" });
  if (input.policy.reason === "REGION_BLOCKED") return success({ ...base, eligible: false, reason: "REGION_BLOCKED", sdkLoad: "NONE", providerRequest: "NOT_REQUESTED", layout: "NO_SLOT" });
  if (input.policy.reason === "AGE_POLICY_BLOCKED") return success({ ...base, eligible: false, reason: "AGE_POLICY_BLOCKED", sdkLoad: "NONE", providerRequest: "NOT_REQUESTED", layout: "NO_SLOT" });
  if (!input.policy.adsAllowed) return success({ ...base, eligible: false, reason: "CONSENT_REQUIRED", sdkLoad: "NONE", providerRequest: "NOT_REQUESTED", layout: "NO_SLOT" });
  if (input.providerEligibility !== "ALLOWED") return success({ ...base, eligible: false, reason: input.providerEligibility === "BLOCKED" ? "PROVIDER_INELIGIBLE" : "SERVER_POLICY_REQUIRED", sdkLoad: "NONE", providerRequest: "NOT_REQUESTED", layout: "NO_SLOT" });
  if (input.viewportProximity !== true) return success({ ...base, eligible: false, reason: "VIEWPORT_NOT_NEAR", sdkLoad: "DEFERRED_LAZY_ADAPTER", providerRequest: "NOT_REQUESTED", layout: "RESERVED" });
  if (input.slotReserved !== true) return success({ ...base, eligible: false, reason: "SLOT_RESERVATION_REQUIRED", sdkLoad: "NONE", providerRequest: "NOT_REQUESTED", layout: "NO_SLOT" });
  return success({ ...base, eligible: true, reason: "PUBLIC_POLICY_ALLOWED", sdkLoad: "DEFERRED_LAZY_ADAPTER", providerRequest: "ON_DEMAND_ONLY", layout: "RESERVED" });
}

export interface Wp250AdSlotPlan {
  readonly slotId: string;
  readonly surface: Wp250PublicSurface;
  readonly reservedInlinePx: number;
  readonly reservedBlockPx: number;
  readonly safeAreaAware: true;
  readonly collapsePolicy: "AFTER_PROVIDER_OUTCOME" | "KEEP_RESERVED_FALLBACK";
  readonly layoutShiftMitigation: "RESERVED_SLOT";
  readonly providerRequest: "NOT_INCLUDED";
}

export function createWp250AdSlotPlan(input: { readonly slotId: string; readonly surface: Wp250PublicSurface; readonly reservedInlinePx: number; readonly reservedBlockPx: number; readonly collapsePolicy: Wp250AdSlotPlan["collapsePolicy"] }): Wp250Result<Wp250AdSlotPlan> {
  const diagnostics: Wp250Diagnostic[] = [];
  validateId(input.slotId, "slotId", diagnostics);
  if (!Number.isSafeInteger(input.reservedInlinePx) || input.reservedInlinePx < 1 || input.reservedInlinePx > 10000) diagnostics.push(error("INVALID_DIMENSION", "Reserved inline size must be a bounded positive pixel value.", "reservedInlinePx"));
  if (!Number.isSafeInteger(input.reservedBlockPx) || input.reservedBlockPx < 1 || input.reservedBlockPx > 10000) diagnostics.push(error("INVALID_DIMENSION", "Reserved block size must be a bounded positive pixel value.", "reservedBlockPx"));
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ slotId: input.slotId, surface: input.surface, reservedInlinePx: input.reservedInlinePx, reservedBlockPx: input.reservedBlockPx, safeAreaAware: true, collapsePolicy: input.collapsePolicy, layoutShiftMitigation: "RESERVED_SLOT", providerRequest: "NOT_INCLUDED" });
}

export type Wp250RevenueStream = "ADS" | "MARKET_FEES" | "SUBSCRIPTIONS" | "DIRECT_WORK_FEES" | "BUILD_EXPORT_PAID_FEATURES";
export type Wp250CostStream = "REALTIME" | "DATABASE" | "STORAGE" | "EGRESS" | "BUILD_COMPUTE" | "PAYMENT_PROVIDER_FEES" | "MODERATION" | "EXTERNAL_PAID_SERVICES";
export type Wp250ProjectionScope = "USER" | "CREATOR" | "PROJECT" | "FEATURE";
export type Wp250AdRevenueStage = "GROSS_ESTIMATED" | "INVALID_TRAFFIC_ADJUSTED" | "PROVIDER_FINALIZED" | "WITHHELD" | "PAID";

export interface Wp250RevenueLine {
  readonly scopeType: Wp250ProjectionScope;
  readonly scopeId: string;
  readonly stream: Wp250RevenueStream;
  readonly amountMinorUnits: number;
  readonly adStage?: Wp250AdRevenueStage;
}

export interface Wp250CostLine {
  readonly scopeType: Wp250ProjectionScope;
  readonly scopeId: string;
  readonly stream: Wp250CostStream;
  readonly amountMinorUnits: number;
}

export interface Wp250RevenueCostProjection {
  readonly projectionId: string;
  readonly scopeType: Wp250ProjectionScope;
  readonly scopeId: string;
  readonly revenueMinorUnits: number;
  readonly costMinorUnits: number;
  readonly netMinorUnits: number;
  readonly revenueByStream: Readonly<Record<Wp250RevenueStream, number>>;
  readonly costByStream: Readonly<Record<Wp250CostStream, number>>;
  readonly adsByStage: Readonly<Record<Wp250AdRevenueStage, number>>;
  readonly shadowOnly: true;
  readonly ledgerMutation: false;
  readonly payoutMutation: false;
  readonly unitEconomicsAvailable: true;
}

function validateAmount(value: number, path: string, diagnostics: Wp250Diagnostic[]): void {
  if (!Number.isSafeInteger(value) || value < 0) diagnostics.push(error("INVALID_AMOUNT", "Projection values must be non-negative minor units.", path));
}

function validateReferences<T extends { readonly scopeId: string; readonly amountMinorUnits: number }>(items: readonly T[], path: string, diagnostics: Wp250Diagnostic[]): void {
  if (items.length > MAX_REFERENCES) diagnostics.push(error("BOUNDED_REFERENCE_REQUIRED", "Projection line count must remain bounded.", path));
  for (const [index, item] of items.entries()) {
    validateId(item.scopeId, `${path}[${index}].scopeId`, diagnostics);
    validateAmount(item.amountMinorUnits, `${path}[${index}].amountMinorUnits`, diagnostics);
  }
}

export function createWp250RevenueCostProjection(input: { readonly projectionId: string; readonly scopeType: Wp250ProjectionScope; readonly scopeId: string; readonly revenueLines: readonly Wp250RevenueLine[]; readonly costLines: readonly Wp250CostLine[]; readonly serverShadowOnly: boolean; readonly ledgerMutation: boolean; readonly payoutMutation: boolean }): Wp250Result<Wp250RevenueCostProjection> {
  const diagnostics: Wp250Diagnostic[] = [];
  validateId(input.projectionId, "projectionId", diagnostics);
  validateId(input.scopeId, "scopeId", diagnostics);
  validateReferences(input.revenueLines, "revenueLines", diagnostics);
  validateReferences(input.costLines, "costLines", diagnostics);
  for (const [index, line] of input.revenueLines.entries()) {
    if (line.stream === "ADS" && line.adStage === undefined) diagnostics.push(error("INVALID_STAGE", "Ad revenue must retain its uncertainty stage.", `revenueLines[${index}].adStage`));
    if (line.stream !== "ADS" && line.adStage !== undefined) diagnostics.push(error("INVALID_STAGE", "Ad revenue stage is only valid for Ads.", `revenueLines[${index}].adStage`));
  }
  if (input.serverShadowOnly !== true || input.ledgerMutation !== false || input.payoutMutation !== false) diagnostics.push(error("SHADOW_ONLY_REQUIRED", "Revenue/Cost projection cannot mutate Ledger or Payout.", "shadowOnly"));
  if (hasError(diagnostics)) return failure(diagnostics);
  const revenueByStream: Record<Wp250RevenueStream, number> = { ADS: 0, MARKET_FEES: 0, SUBSCRIPTIONS: 0, DIRECT_WORK_FEES: 0, BUILD_EXPORT_PAID_FEATURES: 0 };
  const costByStream: Record<Wp250CostStream, number> = { REALTIME: 0, DATABASE: 0, STORAGE: 0, EGRESS: 0, BUILD_COMPUTE: 0, PAYMENT_PROVIDER_FEES: 0, MODERATION: 0, EXTERNAL_PAID_SERVICES: 0 };
  const adsByStage: Record<Wp250AdRevenueStage, number> = { GROSS_ESTIMATED: 0, INVALID_TRAFFIC_ADJUSTED: 0, PROVIDER_FINALIZED: 0, WITHHELD: 0, PAID: 0 };
  for (const line of input.revenueLines) {
    revenueByStream[line.stream] += line.amountMinorUnits;
    if (line.stream === "ADS" && line.adStage !== undefined) adsByStage[line.adStage] += line.amountMinorUnits;
  }
  for (const line of input.costLines) costByStream[line.stream] += line.amountMinorUnits;
  const revenueMinorUnits = Object.values(revenueByStream).reduce((total, value) => total + value, 0);
  const costMinorUnits = Object.values(costByStream).reduce((total, value) => total + value, 0);
  return success({ projectionId: input.projectionId, scopeType: input.scopeType, scopeId: input.scopeId, revenueMinorUnits, costMinorUnits, netMinorUnits: revenueMinorUnits - costMinorUnits, revenueByStream, costByStream, adsByStage, shadowOnly: true, ledgerMutation: false, payoutMutation: false, unitEconomicsAvailable: true });
}

export interface Wp250SearchPresentation {
  readonly presentationId: string;
  readonly resourceId: string;
  readonly channel: "ORGANIC" | "SPONSORED";
  readonly label?: "Sponsored";
  readonly rankingChannel: "ORGANIC_RELEVANCE" | "SPONSORED_SEPARATE";
  readonly organicRelevanceMutated: false;
}

export function createWp250SearchPresentation(input: { readonly presentationId: string; readonly resourceId: string; readonly sponsored: boolean; readonly explicitSponsoredPolicy: boolean }): Wp250Result<Wp250SearchPresentation> {
  const diagnostics: Wp250Diagnostic[] = [];
  validateId(input.presentationId, "presentationId", diagnostics);
  validateId(input.resourceId, "resourceId", diagnostics);
  if (input.sponsored && input.explicitSponsoredPolicy !== true) diagnostics.push(error("SPONSORED_LABEL_REQUIRED", "Sponsored results require an explicit policy and label."));
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ presentationId: input.presentationId, resourceId: input.resourceId, channel: input.sponsored ? "SPONSORED" : "ORGANIC", ...(input.sponsored ? { label: "Sponsored" as const } : {}), rankingChannel: input.sponsored ? "SPONSORED_SEPARATE" : "ORGANIC_RELEVANCE", organicRelevanceMutated: false });
}

export interface Wp250AdminAuditReference {
  readonly auditId: string;
  readonly actorReference: string;
  readonly permission: string;
  readonly operation: string;
  readonly targetReference: string;
  readonly reasonCode: string;
  readonly authorizationProof: AuthorizationProofV1;
  readonly analyticsReplayable: false;
  readonly containsSensitiveBody: false;
}

export function createWp250AdminAuditReference(input: { readonly auditId: string; readonly actorReference: string; readonly permission: string; readonly operation: string; readonly targetReference: string; readonly reasonCode: string; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): Wp250Result<Wp250AdminAuditReference> {
  const diagnostics: Wp250Diagnostic[] = [];
  for (const [value, path] of [[input.auditId, "auditId"], [input.actorReference, "actorReference"], [input.targetReference, "targetReference"]] as const) validateId(value, path, diagnostics);
  for (const [value, path] of [[input.permission, "permission"], [input.operation, "operation"], [input.reasonCode, "reasonCode"]] as const) validateCode(value, path, diagnostics);
  let authorizationProof: AuthorizationProofV1 | null = null;
  try {
    authorizationProof = resolveAuthorizationProofV1(input.authorizationProof, { resourceType: "ADMIN_AUDIT", resourceId: input.auditId, action: "admin.audit.record", capability: input.permission, tenantId: input.authorizationProof?.tenantId ?? null, correlationId: input.authorizationProof?.correlationId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("AUDIT_REFERENCE_REQUIRED", "Admin audit reference requires a bound server AuthorizationProofV1.", "authorizationProof"));
  }
  if (hasError(diagnostics)) return failure(diagnostics);
  if (authorizationProof?.principalId === null) return failure([error("AUDIT_REFERENCE_REQUIRED", "Admin audit reference requires a canonical server actor Principal.", "authorizationProof.principalId")]);
  return success({ auditId: input.auditId, actorReference: authorizationProof?.principalId as string, permission: input.permission, operation: input.operation, targetReference: input.targetReference, reasonCode: input.reasonCode, authorizationProof: authorizationProof as AuthorizationProofV1, analyticsReplayable: false, containsSensitiveBody: false });
}

export type Wp250ModerationAction = "REPORT" | "REVIEW" | "HIDE" | "REMOVE" | "RESTRICT" | "SUSPEND" | "APPEAL";

export interface Wp250ModerationCase {
  readonly caseId: string;
  readonly caseVersion: 1;
  readonly targetReference: string;
  readonly action: Wp250ModerationAction;
  readonly reasonCode: string;
  readonly evidenceReferences: readonly string[];
  readonly authorizationProof: AuthorizationProofV1;
  readonly containsEvidenceBody: false;
}

export function createWp250ModerationCase(input: { readonly caseId: string; readonly targetReference: string; readonly action: Wp250ModerationAction; readonly reasonCode: string; readonly evidenceReferences: readonly string[]; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): Wp250Result<Wp250ModerationCase> {
  const diagnostics: Wp250Diagnostic[] = [];
  validateId(input.caseId, "caseId", diagnostics);
  validateId(input.targetReference, "targetReference", diagnostics);
  validateCode(input.reasonCode, "reasonCode", diagnostics);
  if (input.evidenceReferences.length > 16) diagnostics.push(error("BOUNDED_REFERENCE_REQUIRED", "Evidence references must remain bounded.", "evidenceReferences"));
  input.evidenceReferences.forEach((value, index) => validateId(value, `evidenceReferences[${index}]`, diagnostics));
  let authorizationProof: AuthorizationProofV1 | null = null;
  try {
    authorizationProof = resolveAuthorizationProofV1(input.authorizationProof, { resourceType: "MODERATION_CASE", resourceId: input.caseId, action: "moderation.case.create", capability: "moderation.case.create", tenantId: input.authorizationProof?.tenantId ?? null, correlationId: input.authorizationProof?.correlationId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("MODERATION_AUTH_REQUIRED", "Moderation case requires a bound server AuthorizationProofV1.", "authorizationProof"));
  }
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ caseId: input.caseId, caseVersion: 1, targetReference: input.targetReference, action: input.action, reasonCode: input.reasonCode, evidenceReferences: [...input.evidenceReferences], authorizationProof: authorizationProof as AuthorizationProofV1, containsEvidenceBody: false });
}

export interface Wp250ModerationDecision {
  readonly decisionId: string;
  readonly decisionVersion: 1;
  readonly caseId: string;
  readonly action: Wp250ModerationAction;
  readonly authorizationProof: AuthorizationProofV1;
  readonly auditRequired: true;
  readonly automaticCanonicalMutation: false;
  readonly execution: "AUTHORIZED_ADAPTER_REQUIRED";
}

export function createWp250ModerationDecision(input: { readonly decisionId: string; readonly moderationCase: Wp250ModerationCase; readonly action: Wp250ModerationAction; readonly authorizationProof?: AuthorizationProofV1; readonly authorizationProofResolver?: AuthorizationProofResolver }): Wp250Result<Wp250ModerationDecision> {
  const diagnostics: Wp250Diagnostic[] = [];
  validateId(input.decisionId, "decisionId", diagnostics);
  let authorizationProof: AuthorizationProofV1 | null = null;
  try {
    authorizationProof = resolveAuthorizationProofV1(input.authorizationProof, { resourceType: "MODERATION_DECISION", resourceId: input.decisionId, action: "moderation.decision.create", capability: "moderation.decision.create", tenantId: input.authorizationProof?.tenantId ?? null, correlationId: input.authorizationProof?.correlationId ?? null, policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION }, input.authorizationProofResolver as AuthorizationProofResolver);
  } catch {
    diagnostics.push(error("MODERATION_AUTH_REQUIRED", "Moderation decision requires a bound server AuthorizationProofV1.", "authorizationProof"));
  }
  if (input.action !== input.moderationCase.action && input.action !== "REVIEW") diagnostics.push(error("AUTOMATIC_MUTATION_REJECTED", "A moderation decision cannot silently change the case action.", "action"));
  if (hasError(diagnostics)) return failure(diagnostics);
  return success({ decisionId: input.decisionId, decisionVersion: 1, caseId: input.moderationCase.caseId, action: input.action, authorizationProof: authorizationProof as AuthorizationProofV1, auditRequired: true, automaticCanonicalMutation: false, execution: "AUTHORIZED_ADAPTER_REQUIRED" });
}

export type Wp250Flag = "wp250-policy-read" | "wp250-ad-lazy-read" | "wp250-economics-shadow-read" | "wp250-moderation-case-read" | "wp250-sponsored-separation-read";

export const DEFAULT_WP250_FEATURE_FLAGS: Readonly<Record<Wp250Flag, false>> = Object.freeze({
  "wp250-policy-read": false,
  "wp250-ad-lazy-read": false,
  "wp250-economics-shadow-read": false,
  "wp250-moderation-case-read": false,
  "wp250-sponsored-separation-read": false,
});

export function wp250FeatureEnabled(flags: Readonly<Record<string, boolean>>, flag: string, killSwitch: boolean): Wp250Result<true> {
  if (killSwitch) return failure([error("KILL_SWITCH_ACTIVE", "WP-250 is disabled by the kill switch.")]);
  if (!(flag in DEFAULT_WP250_FEATURE_FLAGS)) return failure([error("UNKNOWN_FLAG", "Unknown WP-250 flag fails closed.", "flag")]);
  if (flags[flag] !== true) return failure([error("FEATURE_DISABLED", "WP-250 feature is disabled by default.", "flag")]);
  return success(true);
}

export interface Wp250ProjectionSnapshot {
  readonly policyCount: number;
  readonly adSlotCount: number;
  readonly economicsCount: number;
  readonly auditCount: number;
  readonly moderationCaseCount: number;
}

export interface Wp250RollbackPlan {
  readonly planId: string;
  readonly fromSnapshot: Wp250ProjectionSnapshot;
  readonly restoreSnapshot: Wp250ProjectionSnapshot;
  readonly execution: "LOCAL_SHADOW_ONLY";
}

export function createWp250RollbackPlan(current: Wp250ProjectionSnapshot, restoreSnapshot: Wp250ProjectionSnapshot): Wp250RollbackPlan {
  return { planId: `wp250-rollback:${current.policyCount}:${restoreSnapshot.policyCount}`, fromSnapshot: { ...current }, restoreSnapshot: { ...restoreSnapshot }, execution: "LOCAL_SHADOW_ONLY" };
}

export function applyWp250RollbackPlan(plan: Wp250RollbackPlan, currentSnapshot: Wp250ProjectionSnapshot): Wp250Result<Wp250ProjectionSnapshot> {
  if (JSON.stringify(currentSnapshot) !== JSON.stringify(plan.fromSnapshot)) return failure([error("ROLLBACK_PRECONDITION_FAILED", "Rollback requires the last validated local shadow snapshot.")]);
  return success({ ...plan.restoreSnapshot }, [info("ROLLBACK_PRECONDITION_FAILED", "Local policy/economics projection restored; no external mutation executed.")]);
}

export function auditSafeWp250Summary(input: { readonly policyCount: number; readonly adSlotCount: number; readonly economicsCount: number; readonly auditCount: number; readonly moderationCaseCount: number }): Readonly<Record<string, number | boolean | string>> {
  return { domain: "WP250_POLICY_ECONOMICS", ...input, containsConsentCredential: false, containsCreativeContent: false, ledgerMutation: false, payoutMutation: false, providerCall: false };
}
