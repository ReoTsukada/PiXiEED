import {
  createWp250AdSlotPlan,
  createWp250AdminAuditReference,
  createWp250ModerationCase,
  createWp250ModerationDecision,
  createWp250RevenueCostProjection,
  createWp250SearchPresentation,
  resolveWp250AdEligibility,
  resolveWp250ConsentPolicy,
} from "../src/wp250-policy-economics-core.ts";
import { AUTHORIZATION_PROOF_POLICY_VERSION, type AuthorizationProofV1 } from "../src/wp160-contracts.ts";

const issuedAt = new Date(Date.now() - 60_000).toISOString();
const expiresAt = new Date(Date.now() + 60_000).toISOString();
function proof(resourceType: string, resourceId: string, action: string, capability: string, principalId = "admin-benchmark"): AuthorizationProofV1 {
  return { schemaVersion: 1, proofType: "AUTHORIZATION_PROOF", source: "server", decision: "allow", authorityId: "wp250-benchmark", proofId: `proof:${resourceType}:${resourceId}`, principalId, resourceType, resourceId, action, capability, tenantId: "tenant-wp250-benchmark", correlationId: "wp250-benchmark", policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION, grantId: "grant:wp250-benchmark", issuedAt, expiresAt };
}

const iterations = 10000;
const started = performance.now();
let successful = 0;
for (let index = 0; index < iterations; index += 1) {
  const policy = resolveWp250ConsentPolicy({
    serverResolved: true,
    region: "ALLOWED",
    agePolicy: "ALLOWED",
    adConsent: "GRANTED",
    analyticsConsent: index % 2 === 0 ? "GRANTED" : "DENIED",
  });
  const ad = policy.ok
    ? resolveWp250AdEligibility({
      surface: index % 3 === 0 ? "PUBLIC_SOCIAL" : "PUBLIC_GAME",
      serverResolved: true,
      policy: policy.value,
      providerEligibility: "ALLOWED",
      viewportProximity: true,
      slotReserved: true,
    })
    : { ok: false as const, diagnostics: [] };
  const slot = createWp250AdSlotPlan({ slotId: `slot-${index}`, surface: "PUBLIC_SOCIAL", reservedInlinePx: 320, reservedBlockPx: 180, collapsePolicy: "AFTER_PROVIDER_OUTCOME" });
  const economics = createWp250RevenueCostProjection({
    projectionId: `projection-${index}`,
    scopeType: "FEATURE",
    scopeId: "feature-public-discovery",
    revenueLines: [{ scopeType: "FEATURE", scopeId: "feature-public-discovery", stream: "ADS", amountMinorUnits: index, adStage: "GROSS_ESTIMATED" }],
    costLines: [{ scopeType: "FEATURE", scopeId: "feature-public-discovery", stream: "DATABASE", amountMinorUnits: index % 5 }],
    serverShadowOnly: true,
    ledgerMutation: false,
    payoutMutation: false,
  });
  const search = createWp250SearchPresentation({ presentationId: `result-${index}`, resourceId: `resource-${index}`, sponsored: index % 2 === 0, explicitSponsoredPolicy: true });
  const audit = createWp250AdminAuditReference({ auditId: `audit-${index}`, actorReference: "admin-reference", permission: "ADMIN_PROJECTION_READ", operation: "VIEW_PROJECTION", targetReference: `projection-${index}`, reasonCode: "REVIEW", authorizationProof: proof("ADMIN_AUDIT", `audit-${index}`, "admin.audit.record", "ADMIN_PROJECTION_READ") , authorizationProofResolver: ({ expected }) => proof(expected.resourceType ?? "ADMIN_AUDIT", expected.resourceId ?? `audit-${index}`, expected.action ?? "admin.audit.record", expected.capability ?? "ADMIN_PROJECTION_READ") });
  const moderationCase = createWp250ModerationCase({ caseId: `case-${index}`, targetReference: `post-${index}`, action: "REVIEW", reasonCode: "POLICY", evidenceReferences: [`evidence-${index}`], authorizationProof: proof("MODERATION_CASE", `case-${index}`, "moderation.case.create", "moderation.case.create"), authorizationProofResolver: ({ expected }) => proof(expected.resourceType ?? "MODERATION_CASE", expected.resourceId ?? `case-${index}`, expected.action ?? "moderation.case.create", expected.capability ?? "moderation.case.create") });
  const moderation = moderationCase.ok
    ? createWp250ModerationDecision({ decisionId: `decision-${index}`, moderationCase: moderationCase.value, action: "REVIEW", authorizationProof: proof("MODERATION_DECISION", `decision-${index}`, "moderation.decision.create", "moderation.decision.create"), authorizationProofResolver: ({ expected }) => proof(expected.resourceType ?? "MODERATION_DECISION", expected.resourceId ?? `decision-${index}`, expected.action ?? "moderation.decision.create", expected.capability ?? "moderation.decision.create") })
    : { ok: false as const, diagnostics: [] };
  if (policy.ok && ad.ok && slot.ok && economics.ok && search.ok && audit.ok && moderation.ok) successful += 1;
}
const elapsedMs = performance.now() - started;
console.log(JSON.stringify({
  schemaVersion: 1,
  benchmarkId: "WP250_POLICY_ECONOMICS_SYNTHETIC",
  status: "MEASURED_LOCAL_SYNTHETIC",
  iterations,
  successful,
  elapsedMs: Number(elapsedMs.toFixed(3)),
  operationsPerSecond: Number((successful / Math.max(elapsedMs / 1000, 0.001)).toFixed(2)),
  notes: [
    "Pure consent, public-ad, layout-reservation, unit-economics, search, audit, and moderation projections; no provider, database, storage, financial, production, or user data was accessed.",
    "This is not a production policy, provider, moderation, revenue, browser, device, or performance PASS.",
  ],
}, null, 2));
