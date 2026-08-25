---
adr_id: ADR-20260807-WP060-SECURITY-SUPPLEMENT
title: WP-060 Auth, Legacy, Entitlement, and Secret Boundary Supplement
status: ACCEPTED
date: 2026-08-07
---

# ADR-20260807-WP060 — Security Boundary Supplement

## Review result

WP-060 remains complete. The supplement adds failure-path evidence and small contract clarifications;
it does not re-run or replace WP-060 and does not change production Auth, RLS, RPC, Market,
PiXiSYNC, purchase, entitlement, or financial data.

## Decisions

- JWT envelope checks require verified signature, issuer, audience, `sub`, `session_id`, non-expired
  `exp`, an allowed user-session role, and a valid `aal`; `aal2` may be required for sensitive work.
- JWT validity is not current permission. Project membership, Asset permission, Entitlement,
  Commission access, and Admin staff records are rechecked from the current server projection.
- Browser source contains no `service_role`/secret key. Service-role use remains limited to server
  Edge Function boundaries and is never shared with a user-session client.
- Legacy conflicts are `QUARANTINED`; no email/display-name auto-merge, last-write-wins mapping,
  ownership transfer, or entitlement movement occurs. Only an explicit administrator can resolve it.
- Subscription access and paid Market Entitlement are separate grants. Revoking a Subscription
  does not revoke a paid purchase; refund/dispute is a separate server-owned transition.
- Admin capabilities remain explicit and separable: Market Review, Finance, Support, Copyright,
  Security, payout/royalty, entitlement grant, ownership transfer, and account suspension are not a
  single universal browser role.

## Evidence

`scripts/test-core-account-permission-supplement-wp060.mjs` covers expired/invalid JWT envelope
cases, stale-JWT/current-DB revocation, service-role browser exclusion, metadata tampering, Legacy
quarantine, entitlement separation, ID substitution, and scoped Admin capability failures.
