---
adr_id: ADR-20260809-FP001-AUTHORIZATION-PROOF
title: Shared AuthorizationProofV1 boundary
status: ACCEPTED_ADOPTION_COMPLETE_ISOLATED
date: 2026-08-09
---

# Decision

Use one adapter-neutral `AuthorizationProofV1` across the future Registry, Search, SNS, Commerce,
Direct Work, Notification, and Tool Bridge boundaries. The Proof is bound to the principal,
resource, action, capability, tenant, correlation, policy version, and expiry.

The consuming Core must obtain the authoritative Proof through an injected server-owned evaluator.
It must not grant access from a caller-supplied `{ source: "server", ok: true, decision: "allow" }`
object. Structural validation and server authority resolution are separate operations.

# Rejected alternatives

- A Boolean `serverResolved` or `trustedProducer` flag: it does not bind identity or resource.
- A per-Core permission Object: it causes drift and confused-deputy risk.
- Browser JWT/profile metadata as authorization: the browser is not the authority.
- A new live transport or database migration in FP-001: current production contracts remain protected.

# Adoption status

The isolated adoption pass now uses the contract at Project, Asset, Package, Search, Tool Bridge,
Notification recipient/enqueue/dispatch/Event consume, Public URL, WP-095 Event producer/commit,
all remaining SNS authority paths, Market Product/Purchase/Provider, Direct Work Request/Quote,
WP-240 Moderation, WP-250 Admin/Moderation, and Admin Projection boundaries. The resolver enforces
the canonical policy version, expiry, and scope, and returns only server-resolved authority.
Attack fixtures cover fake caller Proofs, principal/tenant/resource/action/capability mismatch,
policy mismatch, expiry, and scope reuse.

The final residual audit reports `securityAuthorityLegacyTrust: 0`. Two derived Event producer
markers, one Asset Registry adapter-only hint, and five non-authority Policy/Shadow signals remain
classified and are not authorization grants. Ads/Consent/Region/Age remain a separate PolicyProof
follow-up; FP-001 does not create a second authorization system.

# Consequence

FP-001 remains an isolated contract/adoption checkpoint. Server RLS/RPC wiring, replay protection,
and production-equivalent Proof remain later evidence requirements. No production migration, data
write, route switch, deploy, publish, commit, or push is part of this ADR.
