# ADR: MARKET-410 isolated composition boundary

- Status: Accepted for bounded implementation
- Date: 2026-08-16
- Scope: `MARKET-410`

## Decision

Add a small in-memory composition layer under
`pixiedraw2/src/platform/market-410/**`. The layer captures a synthetic server
Registry and composes the existing WP-210 and FP-003 contracts directly. It
resolves canonical Product/Package/Purchase, Provider Event, Financial
Authority, Contributor Snapshot, ProductFingerprint, Entitlement, License,
and Ledger authority from the Registry; caller financial hints are rejected
and never promoted to authority.

The layer owns only bounded local sequencing and Provider Event replay
handling: out-of-order events are held, same-identity/same-payload events are
no-ops, and same-identity/different-payload events are conflicts that
quarantine the Provider Event ID in memory. Once quarantined, every later
attempt for that ID, including the original payload, fails closed with
`PROVIDER_EVENT_CONFLICT` and cannot apply, no-op, or materialize a Ledger.
Rights are materialized only after the canonical paid lifecycle reaches
FP-003/WP-210.

The Registry also locks one Contributor Snapshot hash per
`collaborativeWorkId` across all Product revisions. Construction fails closed
with the stable `MARKET410_CONTRIBUTOR_SNAPSHOT_CONFLICT_ERROR` when a second
hash is supplied; different ProductFingerprint shapes remain allowed when
the locked Snapshot hash is unchanged.

## Reuse and authority rationale

WP-210 remains the source of truth for Market rights projection, purchase
lifecycle reconciliation, and entitlement/license materialization. FP-003
remains the source of truth for server financial authority, canonical Money,
fee schedule, collaborative deduction allocation, duplicate ProductFingerprint
guarding, and Ledger derivation. MARKET-410 does not duplicate or replace
those algorithms; it supplies the isolated Registry resolver and verifies
cross-contract bindings around them.

## Non-intrusion and rollback

No current Market route/UI, production provider client, Supabase/Stripe/
Storage path, production data, WP-210 source, queue, registry, state file, or
generated context is edited. The feature flags are default-off and the kill
switch fails closed. Rollback means removing or excluding the bounded
MARKET-410 files; no production migration, cutover, or data rollback is part
of this decision.

## Known limitations

The implementation is `IMPLEMENTED_ISOLATED` / `IN_MEMORY` only. Production
 provider verification, real payment execution, database/RLS/Storage
 persistence, durable cross-process replay/crash recovery, current route
 integration, browser/device/accessibility checks, and deployment/cutover
 remain `UNTESTED`. Terra High independently reviewed the bounded local slice;
 that review does not qualify production integration. WORK-420 is not started
 by this ADR.
