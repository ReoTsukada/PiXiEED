---
spec_id: CONTRACT-FP001-AUTHORIZATION-PROOF-001
title: FP-001 AuthorizationProofV1 and Identity Binding
status: ADOPTION_COMPLETE_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-09
---

# FP-001 AuthorizationProofV1

FP-001 establishes the shared authorization boundary for the future Registry, Search, SNS,
Commerce, Direct Work, Notification, and Tool Bridge adapters. It is an isolated contract and is
not connected to a current route, Supabase project, production RLS/RPC, Market data, PiXiSYNC data,
or browser session.

## Authority rule

`normalizeAuthorizationProof()` is structural validation only. A caller-supplied object containing
`source: "server"` is not trusted as authorization. Sensitive JavaScript Core boundaries must call
`resolveAuthorizationProof()` with a server-owned `authorizationEvaluator`; TypeScript Core
adapters use the same JSON contract through `resolveAuthorizationProofV1()`. The evaluator's
result is the only authority returned to a consuming Core; caller Proofs are scope-checked input
only and are never returned as authority. Expired caller or server Proofs fail closed.

## Proof binding

Every Proof binds:

- principalId, including explicit null for public access;
- resourceType and resourceId;
- action and capability;
- tenantId and correlationId where applicable;
- policyVersion, authorityId, proofId, issuedAt, and expiresAt;
- optional grantId.

The proof is denied when any requested binding differs. Adoption boundaries pin
`policyVersion: "authorization-policy-v1"`; expired or non-server proofs fail closed.
The factory used by isolated fixtures is an explicit server-adapter seam and must not be included in
client bundles.

## Compatibility

Existing WP-060 Account Permission output remains available as a legacy adapter input, but its
allow/deny result is not promoted to an AuthorizationProof until the server adapter supplies the
complete v1 binding. Existing identifiers, Auth IDs, RLS/RPC behavior, Market entitlements,
PiXiSYNC membership, public URLs, and current PiXiEEDraw remain unchanged.

## Adoption order

FP-002 Direct Work, FP-003 Commerce, and FP-004 Durable Event must consume this contract rather
than inventing local Boolean or permission Object variants. Registry, Asset, Package, Search,
Notification, Tool Bridge, SNS producer/recipient/Public URL, Market Product/Purchase/Provider,
Direct Work Request/Quote, and Admin Projection entry-boundary adoption is covered by isolated
FP-001 tests. The former WP-230 authority Booleans, WP-240 Moderation Boolean, WP-250
Admin/Moderation Booleans, WP-095 Event producer/commit trust, WP-098 route authorization, and
Notification enqueue/dispatch paths now resolve through the same Proof contract. P0-01 is closed
for the isolated Security Authority adoption scope.

## Residual audit

The final 2026-08-09 audit reports `securityAuthorityLegacyTrust: 0`. Public URL and Event
`serverAllow` names are now Proof-resolving wrappers, not Boolean/Object trust shortcuts. The
remaining scan results are classified: 2 derived WP-095 `trusted: true` markers, 1 Asset Registry
adapter-only `clientHashUntrusted` hint, and 5 non-authority policy/shadow-safety signals. The
remaining Ads/Consent/Region/Age signals are Policy decisions, not Authorization grants, and are
reserved for a separate typed PolicyProof/Decision contract. `serverReadOnly` remains paired with
immutable shadow flags. These classes do not reopen P0-01.
