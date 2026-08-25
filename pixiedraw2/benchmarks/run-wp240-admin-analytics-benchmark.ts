import {
  createWp240AnalyticsEvent,
  createWp240ModerationReference,
  createWp240RevenueShadowComparison,
  resolveWp240AdPlacement,
  resolveWp240AdminProjection,
} from "../src/wp240-admin-analytics-ads-core.ts";
import { AUTHORIZATION_PROOF_POLICY_VERSION, type AuthorizationProofV1 } from "../src/wp160-contracts.ts";

const issuedAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 60_000).toISOString();
function proof(resourceType: string, resourceId: string, action: string, capability: string, principalId = "admin-benchmark"): AuthorizationProofV1 {
  return { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "wp240-benchmark", proofId: `proof:${resourceType}:${resourceId}`, principalId, resourceType, resourceId, action, capability, tenantId: "tenant-wp240-benchmark", correlationId: "wp240-benchmark", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION, grantId: "grant:wp240-benchmark", issuedAt, expiresAt };
}

const iterations = 10000;
const started = performance.now();
let successful = 0;
for (let index = 0; index < iterations; index += 1) {
  const admin = resolveWp240AdminProjection({ projectionId: `projection-${index}`, kind: "CONTENT_HEALTH", scopeReference: "site-1", requiredCapability: "ADMIN_PROJECTION_READ", authorizationProof: proof("ADMIN_PROJECTION", `projection-${index}`, "admin.projection.read", "ADMIN_PROJECTION_READ"), authorizationProofResolver: ({ expected }) => proof(expected.resourceType ?? "ADMIN_PROJECTION", expected.resourceId ?? `projection-${index}`, expected.action ?? "admin.projection.read", expected.capability ?? "ADMIN_PROJECTION_READ") });
  const analytics = createWp240AnalyticsEvent({ eventId: `event-${index}`, eventName: "public.feed.view", surface: "PUBLIC_FEED", properties: { durationMs: index % 100, viewport: "wide" } });
  const ad = resolveWp240AdPlacement({ surface: "PUBLIC_FEED", serverResolved: true, adsEnabled: true });
  const moderation = createWp240ModerationReference({ moderationId: `moderation-${index}`, targetType: "POST", targetReference: `post-${index}`, action: "REPORT", reasonCode: "SPAM", authorizationProof: proof("MODERATION_REFERENCE", `moderation-${index}`, "moderation.reference.create", "moderation.reference.create"), authorizationProofResolver: ({ expected }) => proof(expected.resourceType ?? "MODERATION_REFERENCE", expected.resourceId ?? `moderation-${index}`, expected.action ?? "moderation.reference.create", expected.capability ?? "moderation.reference.create") });
  const revenue = createWp240RevenueShadowComparison({ comparisonId: `revenue-${index}`, currency: "JPY", expectedMinorUnits: index, observedMinorUnits: index + 1, serverReadOnly: true, ledgerMutation: false, payoutMutation: false });
  if (admin.ok && analytics.ok && ad.ok && moderation.ok && revenue.ok) successful += 1;
}
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({ schemaVersion: 1, benchmarkId: "WP240_ADMIN_ANALYTICS_ADS_SYNTHETIC", status: "MEASURED_LOCAL_SYNTHETIC", iterations, successful, elapsedMs: Number(elapsedMs.toFixed(3)), operationsPerSecond: Number((successful / Math.max(elapsedMs / 1000, 0.001)).toFixed(2)), notes: ["Pure permission, privacy, ad-placement, moderation-reference, and shadow-revenue projections; no current route, provider, database, storage, financial, or production data was accessed.", "This is not a production Admin, Analytics, Ads, Moderation, Revenue, browser, device, or performance PASS."] }, null, 2));
