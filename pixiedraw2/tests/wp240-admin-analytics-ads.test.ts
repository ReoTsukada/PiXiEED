import {
  applyWp240RollbackPlan,
  auditSafeWp240Summary,
  createWp240AnalyticsEvent,
  createWp240ModerationReference,
  createWp240RevenueShadowComparison,
  createWp240RollbackPlan,
  DEFAULT_WP240_FEATURE_FLAGS,
  resolveWp240AdPlacement,
  resolveWp240AdminProjection,
  wp240FeatureEnabled,
} from "../src/wp240-admin-analytics-ads-core.ts";
import type { AuthorizationProofResolver, AuthorizationProofV1 } from "../src/wp160-contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const AUTH_ISSUED_AT = new Date(Date.now() - 60_000).toISOString();
const AUTH_EXPIRES_AT = new Date(Date.now() + 4 * 60_000).toISOString();
function authFor(resourceType: string, resourceId: string, action: string, capability = action, principalId: string | null = "admin-1") {
  const createProof = (expected: { readonly principalId?: string | null; readonly resourceType?: string; readonly resourceId?: string; readonly action?: string; readonly capability?: string; readonly tenantId?: string | null; readonly correlationId?: string | null; readonly policyVersion?: string }): AuthorizationProofV1 => ({
    schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "server-authority-fp003z-test", proofId: `proof:${expected.resourceId ?? resourceId}`,
    principalId: expected.principalId ?? principalId, resourceType: expected.resourceType ?? resourceType, resourceId: expected.resourceId ?? resourceId,
    action: expected.action ?? action, capability: expected.capability ?? capability, tenantId: expected.tenantId ?? "tenant-test", correlationId: expected.correlationId ?? "correlation-fp003z-test", policyVersion: expected.policyVersion ?? "authorization-policy-v1", grantId: "grant-fp003z-test", issuedAt: AUTH_ISSUED_AT, expiresAt: AUTH_EXPIRES_AT,
  });
  const expected = { principalId, resourceType, resourceId, action, capability, tenantId: "tenant-test", correlationId: "correlation-fp003z-test", policyVersion: "authorization-policy-v1" };
  const authorizationProofResolver: AuthorizationProofResolver = ({ expected: resolved }) => createProof(resolved);
  return { authorizationProof: createProof(expected), authorizationProofResolver };
}

Deno.test("WP-240 Admin projection is server permissioned and read-only", () => {
  const allowed = resolveWp240AdminProjection({
    projectionId: "projection-1",
    kind: "CONTENT_HEALTH",
    scopeReference: "site-1",
    requiredCapability: "ADMIN_PROJECTION_READ",
    ...authFor("ADMIN_PROJECTION", "projection-1", "admin.projection.read", "ADMIN_PROJECTION_READ"),
    clientRequestedCapability: "ADMIN_PROJECTION_READ",
  });
  assert(allowed.ok && allowed.value.readOnly && !allowed.value.mutatesCanonicalState && allowed.diagnostics.some((item) => item.code === "CLIENT_OVERRIDE_IGNORED"), "Admin projection must require server permission and ignore client authority");
  const deniedAuth = authFor("ADMIN_PROJECTION", "projection-2", "admin.projection.read", "ADMIN_PROJECTION_READ");
  const denied = resolveWp240AdminProjection({ projectionId: "projection-2", kind: "CONTENT_HEALTH", scopeReference: "site-1", requiredCapability: "ADMIN_PROJECTION_READ", ...deniedAuth, authorizationProof: { ...deniedAuth.authorizationProof, decision: "deny" } });
  assert(!denied.ok && denied.diagnostics.some((item) => item.code === "SERVER_AUTH_REQUIRED"), "missing server authorization must fail closed");
});

Deno.test("WP-240 Analytics rejects privacy and creative content", () => {
  const safe = createWp240AnalyticsEvent({ eventId: "event-1", eventName: "public.feed.view", surface: "PUBLIC_FEED", resourceReference: "post-1", properties: { durationMs: 42, tool: "pencil" } });
  assert(safe.ok && safe.value.privacySafe, "safe analytics metadata must pass");
  const unsafe = createWp240AnalyticsEvent({ eventId: "event-2", eventName: "project.open", surface: "ACTIVE_STUDIO", properties: { email: "private@example.invalid" } as never });
  assert(!unsafe.ok && unsafe.diagnostics.some((item) => item.code === "PRIVACY_FIELD_REJECTED"), "Email/private analytics data must fail closed");
  const html = createWp240AnalyticsEvent({ eventId: "event-3", eventName: "public.feed.view", surface: "PUBLIC_FEED", properties: { label: "<script>" } });
  assert(!html.ok, "raw markup must not enter Analytics");
});

Deno.test("WP-240 Ads are allowed only on public surfaces", () => {
  const publicFeed = resolveWp240AdPlacement({ surface: "PUBLIC_FEED", serverResolved: true, adsEnabled: true });
  assert(publicFeed.ok && publicFeed.value.eligible && publicFeed.value.createsCommerceState === false, "public feed may host an ad without commerce mutation");
  for (const surface of ["ACTIVE_STUDIO", "CHECKOUT", "ENTITLEMENT", "COMMISSION"] as const) {
    const privateSurface = resolveWp240AdPlacement({ surface, serverResolved: true, adsEnabled: true });
    assert(privateSurface.ok && !privateSurface.value.eligible && privateSurface.value.reason === "PRIVATE_CREATION_SURFACE", `${surface} must not host ads`);
  }
  const disabled = resolveWp240AdPlacement({ surface: "MARKET_LISTING", serverResolved: true, adsEnabled: false });
  assert(disabled.ok && !disabled.value.eligible && disabled.value.reason === "AD_FLAG_DISABLED", "disabled ad flag must preserve the current no-ad result");
});

Deno.test("WP-240 Moderation is a reference, not content or target mutation", () => {
  const report = createWp240ModerationReference({ moderationId: "moderation-1", targetType: "POST", targetReference: "post-1", action: "REPORT", reasonCode: "SPAM", ...authFor("MODERATION_REFERENCE", "moderation-1", "moderation.reference.create") });
  assert(report.ok && report.value.containsBody === false && report.value.mutatesTarget === false, "Moderation must contain only a typed target reference");
  const deniedModerationAuth = authFor("MODERATION_REFERENCE", "moderation-2", "moderation.reference.create");
  const unauthorized = createWp240ModerationReference({ moderationId: "moderation-2", targetType: "PROJECT", targetReference: "project-1", action: "HIDE", reasonCode: "POLICY", ...deniedModerationAuth, authorizationProof: { ...deniedModerationAuth.authorizationProof, decision: "deny" } });
  assert(!unauthorized.ok && unauthorized.diagnostics.some((item) => item.code === "MODERATION_AUTH_REQUIRED"), "moderation without server actor must fail closed");
});

Deno.test("WP-240 Revenue is shadow-only and never changes Ledger/Payout", () => {
  const comparison = createWp240RevenueShadowComparison({ comparisonId: "revenue-1", currency: "JPY", expectedMinorUnits: 1000, observedMinorUnits: 1200, serverReadOnly: true, ledgerMutation: false, payoutMutation: false });
  assert(comparison.ok && comparison.value.deltaMinorUnits === 200 && comparison.value.shadowOnly && !comparison.value.mutatesLedger && !comparison.value.mutatesPayout, "revenue comparison must remain shadow-only");
  const mutation = createWp240RevenueShadowComparison({ comparisonId: "revenue-2", currency: "JPY", expectedMinorUnits: 1, observedMinorUnits: 2, serverReadOnly: true, ledgerMutation: true, payoutMutation: false });
  assert(!mutation.ok && mutation.diagnostics.some((item) => item.code === "SHADOW_ONLY_REQUIRED"), "Ledger mutation must fail closed");
});

Deno.test("WP-240 flags fail closed and rollback is local shadow-only", () => {
  const disabled = wp240FeatureEnabled(DEFAULT_WP240_FEATURE_FLAGS, "analytics-write", false);
  assert(!disabled.ok && disabled.diagnostics.some((item) => item.code === "FEATURE_DISABLED"), "WP-240 flags must default off");
  const unknown = wp240FeatureEnabled({}, "unknown", false);
  assert(!unknown.ok && unknown.diagnostics.some((item) => item.code === "UNKNOWN_FLAG"), "unknown flags must fail closed");
  const killed = wp240FeatureEnabled({ "analytics-write": true }, "analytics-write", true);
  assert(!killed.ok && killed.diagnostics.some((item) => item.code === "KILL_SWITCH_ACTIVE"), "kill switch must win");
  const current = { adminCount: 2, analyticsCount: 3, moderationCount: 1, revenueComparisonCount: 4 } as const;
  const plan = createWp240RollbackPlan(current, { ...current, analyticsCount: 0 });
  const applied = applyWp240RollbackPlan(plan, current);
  assert(applied.ok && applied.value.analyticsCount === 0, "valid rollback must restore local projection");
  assert(!applyWp240RollbackPlan(plan, { ...current, adminCount: 9 }).ok, "stale rollback must fail");
  const summary = auditSafeWp240Summary(current);
  assert(summary.containsSensitiveData === false && summary.productionMutation === false && summary.ledgerMutation === false, "audit summary must be privacy-safe");
});
