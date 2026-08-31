import {
  billingExternalBuildResourceId,
  createBillingOverview,
  createExternalBuildBillingSnapshot,
  evaluateExternalBuildAccess,
  type BillingEvent,
  type BillingScope,
  type BillingStateSnapshot,
  transitionBillingSnapshot,
} from "../src/wp260-billing-framework.ts";
import {
  AUTHORIZATION_PROOF_POLICY_VERSION,
  type AuthorizationProofV1,
} from "../src/wp160-contracts.ts";

const scope: BillingScope = {
  projectId: "project-260",
  revisionId: "revision-260",
  ownerId: "owner-260",
  tenantId: "tenant-260",
};

function snapshot(): BillingStateSnapshot {
  const result = createExternalBuildBillingSnapshot(scope);
  if (!result.ok) throw new Error("snapshot fixture failed");
  return result.value;
}

function eventBase(sequence: number, eventId: string): Pick<BillingEvent, "eventId" | "sequence" | "scope"> {
  return { eventId, sequence, scope };
}

function transition(current: BillingStateSnapshot, event: BillingEvent): BillingStateSnapshot {
  const result = transitionBillingSnapshot(current, event);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message ?? "transition failed");
  return result.value;
}

function proof(grantId: string, target: "ANDROID_AAB" | "ANDROID_APK" = "ANDROID_AAB"): AuthorizationProofV1 {
  const issuedAt = new Date(Date.now() - 1_000).toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "authority-260",
    proofId: `proof-${grantId}`,
    principalId: scope.ownerId,
    resourceType: "igame-external-build",
    resourceId: billingExternalBuildResourceId(scope, target),
    action: "build",
    capability: "game.build.external",
    tenantId: scope.tenantId,
    correlationId: "correlation-260",
    policyVersion: AUTHORIZATION_PROOF_POLICY_VERSION,
    grantId,
    issuedAt,
    expiresAt,
  };
}

Deno.test("WP-260 keeps internal use included and external build locked by default", () => {
  const overview = createBillingOverview(snapshot(), "NOT_CONNECTED");
  if (overview.internalUse !== "INCLUDED" || overview.inProductPlay !== "INCLUDED") throw new Error("internal use must stay included");
  if (overview.externalBuild.access !== "LOCKED" || overview.externalBuild.provider !== "NOT_CONNECTED") throw new Error("external build must fail closed");
});

Deno.test("WP-260 accepts ordered server payment confirmation and exact grant scope", () => {
  let current = snapshot();
  current = transition(current, { ...eventBase(1, "event-checkout"), kind: "CHECKOUT_STARTED", checkoutId: "checkout-260" });
  current = transition(current, {
    ...eventBase(2, "event-paid"),
    kind: "PAYMENT_CONFIRMED",
    entitlementId: "entitlement-260",
    grantId: "grant-260",
    expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
  });
  const decision = evaluateExternalBuildAccess({
    snapshot: current,
    scope,
    target: "ANDROID_AAB",
    proof: proof("grant-260"),
    provider: "CONNECTED",
  });
  if (!decision.allowed || decision.code !== "ALLOWED") throw new Error("matching entitlement should allow build admission");
});

Deno.test("WP-260 rejects duplicate, out-of-order, cross-scope, and unentitled operations", () => {
  const initial = snapshot();
  const checkout: BillingEvent = { ...eventBase(1, "event-duplicate"), kind: "CHECKOUT_STARTED", checkoutId: "checkout-260" };
  const once = transitionBillingSnapshot(initial, checkout);
  if (!once.ok) throw new Error("first checkout should succeed");
  const duplicate = transitionBillingSnapshot(once.value, checkout);
  if (duplicate.ok || duplicate.diagnostics[0]?.code !== "DUPLICATE_EVENT") throw new Error("duplicate checkout event must fail");
  const outOfOrder = transitionBillingSnapshot(initial, { ...eventBase(2, "event-gap"), kind: "CHECKOUT_STARTED", checkoutId: "checkout-gap" });
  if (outOfOrder.ok || outOfOrder.diagnostics[0]?.code !== "EVENT_OUT_OF_ORDER") throw new Error("sequence gap must fail");
  const crossScope = transitionBillingSnapshot(initial, { ...eventBase(1, "event-other-scope"), scope: { ...scope, tenantId: "tenant-other" }, kind: "CHECKOUT_STARTED", checkoutId: "checkout-other" });
  if (crossScope.ok || crossScope.diagnostics[0]?.code !== "SCOPE_MISMATCH") throw new Error("cross-tenant event must fail");
  const denied = evaluateExternalBuildAccess({ snapshot: initial, scope, target: "ANDROID_AAB", proof: null, provider: "CONNECTED" });
  if (denied.allowed || denied.code !== "SERVER_ENTITLEMENT_REQUIRED") throw new Error("unentitled build must fail closed");
});

Deno.test("WP-260 rejects expired or mismatched grants and keeps PXD/internal play separate", () => {
  let current = snapshot();
  current = transition(current, { ...eventBase(1, "event-checkout-2"), kind: "CHECKOUT_STARTED", checkoutId: "checkout-261" });
  current = transition(current, {
    ...eventBase(2, "event-paid-2"),
    kind: "PAYMENT_CONFIRMED",
    entitlementId: "entitlement-261",
    grantId: "grant-261",
    expiresAt: new Date(Date.now() - 60 * 1_000).toISOString(),
  });
  const expired = evaluateExternalBuildAccess({ snapshot: current, scope, target: "ANDROID_AAB", proof: proof("grant-261"), provider: "CONNECTED" });
  if (expired.allowed || expired.code !== "ENTITLEMENT_EXPIRED") throw new Error("expired entitlement must fail");
  const mismatch = evaluateExternalBuildAccess({ snapshot: { ...current, expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString() }, scope, target: "ANDROID_AAB", proof: proof("grant-other"), provider: "CONNECTED" });
  if (mismatch.allowed || mismatch.code !== "GRANT_MISMATCH") throw new Error("grant mismatch must fail");
  if (createBillingOverview(current, "CONNECTED").inProductPlay !== "INCLUDED") throw new Error("internal play must not depend on external entitlement");
});
