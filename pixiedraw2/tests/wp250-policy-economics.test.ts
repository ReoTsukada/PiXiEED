import {
  applyWp250RollbackPlan,
  auditSafeWp250Summary,
  createWp250AdSlotPlan,
  createWp250AdminAuditReference,
  createWp250ModerationCase,
  createWp250ModerationDecision,
  createWp250RevenueCostProjection,
  createWp250RollbackPlan,
  createWp250SearchPresentation,
  DEFAULT_WP250_FEATURE_FLAGS,
  resolveWp250AdEligibility,
  resolveWp250ConsentPolicy,
  wp250FeatureEnabled,
} from "../src/wp250-policy-economics-core.ts";
import type { AuthorizationProofResolver, AuthorizationProofV1 } from "../src/wp160-contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const AUTH_ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const AUTH_EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString();
function authFor(resourceType: string, resourceId: string, action: string, capability = action, principalId: string | null = "moderator-1") {
  const createProof = (expected: { readonly principalId?: string | null; readonly resourceType?: string; readonly resourceId?: string; readonly action?: string; readonly capability?: string; readonly tenantId?: string | null; readonly correlationId?: string | null; readonly policyVersion?: string }): AuthorizationProofV1 => ({
    schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "server-authority-fp003z-test", proofId: `proof:${expected.resourceId ?? resourceId}`,
    principalId: expected.principalId ?? principalId, resourceType: expected.resourceType ?? resourceType, resourceId: expected.resourceId ?? resourceId,
    action: expected.action ?? action, capability: expected.capability ?? capability, tenantId: expected.tenantId ?? "tenant-test", correlationId: expected.correlationId ?? "correlation-fp003z-test", policyVersion: expected.policyVersion ?? "authorization-policy-v1", grantId: "grant-fp003z-test", issuedAt: AUTH_ISSUED_AT, expiresAt: AUTH_EXPIRES_AT,
  });
  const expected = { principalId, resourceType, resourceId, action, capability, tenantId: "tenant-test", correlationId: "correlation-fp003z-test", policyVersion: "authorization-policy-v1" };
  const authorizationProofResolver: AuthorizationProofResolver = ({ expected: resolved }) => createProof(resolved);
  return { authorizationProof: createProof(expected), authorizationProofResolver };
}

function allowedPolicy() {
  const policy = resolveWp250ConsentPolicy({ serverResolved: true, region: "ALLOWED", agePolicy: "ALLOWED", adConsent: "GRANTED", analyticsConsent: "DENIED" });
  assert(policy.ok && policy.value.adsAllowed && !policy.value.analyticsAllowed && policy.value.essentialTelemetryAllowed, "policy fixture must separate Ad consent, Analytics consent, and essential telemetry");
  return policy.value;
}

Deno.test("WP-250 consent, region, and age policy stay separate from essential telemetry", () => {
  const policy = allowedPolicy();
  assert(policy.legalDecisionDelegated, "legal decision must remain delegated to policy authority");
  const blocked = resolveWp250ConsentPolicy({ serverResolved: true, region: "BLOCKED", agePolicy: "ALLOWED", adConsent: "GRANTED", analyticsConsent: "GRANTED" });
  assert(blocked.ok && !blocked.value.adsAllowed && !blocked.value.analyticsAllowed && blocked.value.reason === "REGION_BLOCKED", "blocked region must disable both optional projections");
  const unknown = resolveWp250ConsentPolicy({ serverResolved: false, region: "UNKNOWN", agePolicy: "UNKNOWN", adConsent: "GRANTED", analyticsConsent: "GRANTED" });
  assert(!unknown.ok && unknown.diagnostics.some((item) => item.code === "SERVER_POLICY_REQUIRED"), "client-only policy must fail closed");
});

Deno.test("WP-250 Public Ads require lazy policy, viewport proximity, and reserved layout", () => {
  const policy = allowedPolicy();
  const far = resolveWp250AdEligibility({ surface: "PUBLIC_SOCIAL", serverResolved: true, policy, providerEligibility: "ALLOWED", viewportProximity: false, slotReserved: true });
  assert(far.ok && !far.value.eligible && far.value.reason === "VIEWPORT_NOT_NEAR" && far.value.sdkLoad === "DEFERRED_LAZY_ADAPTER", "offscreen Ads must not request a provider");
  const near = resolveWp250AdEligibility({ surface: "PUBLIC_SOCIAL", serverResolved: true, policy, providerEligibility: "ALLOWED", viewportProximity: true, slotReserved: true });
  assert(near.ok && near.value.eligible && near.value.providerRequest === "ON_DEMAND_ONLY" && near.value.providerSdkInEditorBundle === false, "near public Ads must remain on-demand and outside Editor bundle");
  const privateSurface = resolveWp250AdEligibility({ surface: "DRAW2_EDITOR", serverResolved: true, policy, providerEligibility: "ALLOWED", viewportProximity: true, slotReserved: true });
  assert(privateSurface.ok && !privateSurface.value.eligible && privateSurface.value.reason === "PRIVATE_SURFACE", "Editor must not receive Ads");
  const slot = createWp250AdSlotPlan({ slotId: "public-social-top", surface: "PUBLIC_SOCIAL", reservedInlinePx: 320, reservedBlockPx: 180, collapsePolicy: "AFTER_PROVIDER_OUTCOME" });
  assert(slot.ok && slot.value.layoutShiftMitigation === "RESERVED_SLOT" && slot.value.safeAreaAware && slot.value.providerRequest === "NOT_INCLUDED", "Ad slot must reserve layout without embedding provider");
});

Deno.test("WP-250 Mobile/public policy prevents workspace and safe-area collisions", () => {
  const policy = allowedPolicy();
  const mobilePublic = resolveWp250AdEligibility({ surface: "PUBLIC_GAME", serverResolved: true, policy, providerEligibility: "ALLOWED", viewportProximity: true, slotReserved: true });
  assert(mobilePublic.ok && mobilePublic.value.layout === "RESERVED", "public mobile surface may use a reserved slot");
  const editor = resolveWp250AdEligibility({ surface: "GAME_EDITOR", serverResolved: true, policy, providerEligibility: "ALLOWED", viewportProximity: true, slotReserved: true });
  assert(editor.ok && !editor.value.eligible && editor.value.layout === "NO_SLOT", "Game editor must remain Canvas/control safe");
});

Deno.test("WP-250 Revenue/Cost projection supports streams, stages, and unit economics without Ledger", () => {
  const projection = createWp250RevenueCostProjection({
    projectionId: "economics-1",
    scopeType: "FEATURE",
    scopeId: "feature-market-discovery",
    revenueLines: [
      { scopeType: "FEATURE", scopeId: "feature-market-discovery", stream: "ADS", amountMinorUnits: 1000, adStage: "GROSS_ESTIMATED" },
      { scopeType: "FEATURE", scopeId: "feature-market-discovery", stream: "ADS", amountMinorUnits: 800, adStage: "INVALID_TRAFFIC_ADJUSTED" },
      { scopeType: "FEATURE", scopeId: "feature-market-discovery", stream: "MARKET_FEES", amountMinorUnits: 500 },
      { scopeType: "FEATURE", scopeId: "feature-market-discovery", stream: "DIRECT_WORK_FEES", amountMinorUnits: 300 },
    ],
    costLines: [
      { scopeType: "FEATURE", scopeId: "feature-market-discovery", stream: "DATABASE", amountMinorUnits: 400 },
      { scopeType: "FEATURE", scopeId: "feature-market-discovery", stream: "EGRESS", amountMinorUnits: 100 },
      { scopeType: "FEATURE", scopeId: "feature-market-discovery", stream: "MODERATION", amountMinorUnits: 200 },
    ],
    serverShadowOnly: true,
    ledgerMutation: false,
    payoutMutation: false,
  });
  assert(projection.ok && projection.value.revenueMinorUnits === 2600 && projection.value.costMinorUnits === 700 && projection.value.netMinorUnits === 1900, "projection totals must be deterministic");
  assert(projection.value.adsByStage.GROSS_ESTIMATED === 1000 && projection.value.adsByStage.INVALID_TRAFFIC_ADJUSTED === 800 && projection.value.unitEconomicsAvailable && !projection.value.ledgerMutation && !projection.value.payoutMutation, "Ad stages and shadow boundary must remain explicit");
  const mutation = createWp250RevenueCostProjection({ projectionId: "economics-2", scopeType: "USER", scopeId: "user-1", revenueLines: [], costLines: [], serverShadowOnly: true, ledgerMutation: true, payoutMutation: false });
  assert(!mutation.ok && mutation.diagnostics.some((item) => item.code === "SHADOW_ONLY_REQUIRED"), "Ledger mutation must fail closed");
});

Deno.test("WP-250 Sponsored and Organic Search remain separate", () => {
  const organic = createWp250SearchPresentation({ presentationId: "result-1", resourceId: "resource-1", sponsored: false, explicitSponsoredPolicy: false });
  assert(organic.ok && organic.value.channel === "ORGANIC" && organic.value.rankingChannel === "ORGANIC_RELEVANCE" && organic.value.organicRelevanceMutated === false, "Organic Search must use organic relevance only");
  const sponsored = createWp250SearchPresentation({ presentationId: "result-2", resourceId: "resource-2", sponsored: true, explicitSponsoredPolicy: true });
  assert(sponsored.ok && sponsored.value.channel === "SPONSORED" && sponsored.value.label === "Sponsored" && sponsored.value.rankingChannel === "SPONSORED_SEPARATE", "Sponsored result must be explicitly labeled and separated");
  const unlabeled = createWp250SearchPresentation({ presentationId: "result-3", resourceId: "resource-3", sponsored: true, explicitSponsoredPolicy: false });
  assert(!unlabeled.ok && unlabeled.diagnostics.some((item) => item.code === "SPONSORED_LABEL_REQUIRED"), "unlabeled paid placement must fail closed");
});

Deno.test("WP-250 Admin Audit is separate from Analytics and non-replayable", () => {
  const audit = createWp250AdminAuditReference({ auditId: "audit-1", actorReference: "admin-1", permission: "ADMIN_PROJECTION_READ", operation: "VIEW_PROJECTION", targetReference: "projection-1", reasonCode: "REVIEW", ...authFor("ADMIN_AUDIT", "audit-1", "admin.audit.record", "ADMIN_PROJECTION_READ", "admin-1") });
  assert(audit.ok && audit.value.analyticsReplayable === false && audit.value.containsSensitiveBody === false, "Admin Audit must be a safe non-Analytics reference");
  const deniedAuditAuth = authFor("ADMIN_AUDIT", "audit-2", "admin.audit.record", "ADMIN_PROJECTION_READ", "admin-2");
  const denied = createWp250AdminAuditReference({ auditId: "audit-2", actorReference: "admin-2", permission: "ADMIN_PROJECTION_READ", operation: "VIEW_PROJECTION", targetReference: "projection-1", reasonCode: "REVIEW", ...deniedAuditAuth, authorizationProof: { ...deniedAuditAuth.authorizationProof, decision: "deny" } });
  assert(!denied.ok && denied.diagnostics.some((item) => item.code === "AUDIT_REFERENCE_REQUIRED"), "Admin Audit requires server actor");
});

Deno.test("WP-250 Moderation Case and Decision are versioned without automatic destructive mutation", () => {
  const moderationCase = createWp250ModerationCase({ caseId: "case-1", targetReference: "post-1", action: "REMOVE", reasonCode: "POLICY", evidenceReferences: ["evidence-1"], ...authFor("MODERATION_CASE", "case-1", "moderation.case.create", "moderation.case.create", "reporter-1") });
  assert(moderationCase.ok && moderationCase.value.caseVersion === 1 && moderationCase.value.containsEvidenceBody === false, "Moderation Case must preserve typed references only");
  const decision = createWp250ModerationDecision({ decisionId: "decision-1", moderationCase: moderationCase.value, action: "REMOVE", ...authFor("MODERATION_DECISION", "decision-1", "moderation.decision.create") });
  assert(decision.ok && decision.value.decisionVersion === 1 && decision.value.automaticCanonicalMutation === false && decision.value.auditRequired, "Moderation Decision must defer mutation to an authorized adapter");
  const deniedDecisionAuth = authFor("MODERATION_DECISION", "decision-2", "moderation.decision.create");
  const unauthorized = createWp250ModerationDecision({ decisionId: "decision-2", moderationCase: moderationCase.value, action: "REMOVE", ...deniedDecisionAuth, authorizationProof: { ...deniedDecisionAuth.authorizationProof, decision: "deny" } });
  assert(!unauthorized.ok && unauthorized.diagnostics.some((item) => item.code === "MODERATION_AUTH_REQUIRED"), "unresolved moderator must fail closed");
});

Deno.test("WP-250 flags and rollback remain default-off and local shadow-only", () => {
  const disabled = wp250FeatureEnabled(DEFAULT_WP250_FEATURE_FLAGS, "wp250-economics-shadow-read", false);
  assert(!disabled.ok && disabled.diagnostics.some((item) => item.code === "FEATURE_DISABLED"), "WP-250 flags must default off");
  const unknown = wp250FeatureEnabled({}, "unknown", false);
  assert(!unknown.ok && unknown.diagnostics.some((item) => item.code === "UNKNOWN_FLAG"), "unknown WP-250 flag must fail closed");
  const killed = wp250FeatureEnabled({ "wp250-policy-read": true }, "wp250-policy-read", true);
  assert(!killed.ok && killed.diagnostics.some((item) => item.code === "KILL_SWITCH_ACTIVE"), "kill switch must win");
  const current = { policyCount: 2, adSlotCount: 3, economicsCount: 1, auditCount: 4, moderationCaseCount: 2 } as const;
  const plan = createWp250RollbackPlan(current, { ...current, economicsCount: 0 });
  const applied = applyWp250RollbackPlan(plan, current);
  assert(applied.ok && applied.value.economicsCount === 0, "valid rollback must restore local shadow state");
  assert(!applyWp250RollbackPlan(plan, { ...current, policyCount: 9 }).ok, "stale rollback must fail closed");
  const summary = auditSafeWp250Summary(current);
  assert(summary.containsConsentCredential === false && summary.containsCreativeContent === false && summary.ledgerMutation === false && summary.providerCall === false, "audit summary must be safe");
});
