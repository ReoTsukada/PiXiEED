# MARKET-410 Isolated Market Composition Contract

Status: `IMPLEMENTED_ISOLATED` / `IN_MEMORY`
Schema: `MARKET410_COMPOSITION_V1`

MARKET-410 is an additive composition boundary for a synthetic server
Registry. It composes the existing WP-210 Market rights contract and FP-003
financial-integrity contract without replacing either contract, changing the
current Market route, or introducing a provider/database adapter.

## Reused authority contracts

| Concern | Canonical contract | MARKET-410 use |
| --- | --- | --- |
| Product, Package, Purchase, lifecycle, Entitlement, License | WP-210 | `createProductProjection`, `createPurchaseRecord`, `materializePurchaseRights`, and WP-210 record types |
| AuthorizationProof | WP-160 contract used by WP-210/FP-003 | Caller proof is checked, then a synthetic Registry proof is re-resolved |
| Provider Event, Money, Fee Schedule, royalty allocation, Ledger | FP-003 | `materializeMarketFinancialSettlement` and FP-003 authority/allocation types |
| Contributor Snapshot and ProductFingerprint | FP-003 collaborative contract | `deriveCollaborativeRevenueAllocation` and `guardDuplicateProductFingerprint` |

The composition layer adds only a bounded in-memory idempotency and causal
envelope around those canonical functions. It does not copy their financial
rules into a second implementation.

## Authority boundary

`InMemoryMarket410Registry` captures locked Product/Package and Purchase
revisions, server-resolved Provider Event identity, Financial Authority,
Contributor Snapshot, ProductFingerprint, entitlement/license binding, and
Ledger recipient authority. Nested authority records are frozen when captured.

The operation request accepts opaque IDs/revisions, a verified-event-shaped
identity, causal purchase events, and an AuthorizationProof. It has no
financial authority fields. If `callerFinancialInput` is supplied, the
composition rejects it. Amount, currency, fee schedule, recipients, royalty
allocations, entitlement, license, and Ledger values are resolved from the
Registry and passed to WP-210/FP-003.

Product, Package, Purchase, License, and Provider Event identity must remain
bound to the same locked revision and tenant/environment. Permission,
tenant, environment, proof, and revision mismatches fail closed.

## Causal settlement and replay

The paid path is ordered as:

`PRODUCT -> PACKAGE_LOCK -> PURCHASE -> CHECKOUT_BOUND -> PAID -> ENTITLEMENT -> LICENSE -> LEDGER`

Missing or out-of-order lifecycle events are held and do not produce rights.
The refund/reversal path is represented only after the paid state and follows
the corresponding revoke/reversal sequence. A Provider Event with the same
identity and payload fingerprint is a local no-op after application. The same
identity with a different fingerprint is a conflict, and the Provider Event ID
is quarantined in memory. Every later attempt for that ID, including a replay
of the original payload, fails closed with `PROVIDER_EVENT_CONFLICT`; it cannot
apply, no-op, or create a Ledger identity. Replays that occur before a
conflict do not create a second entitlement, license, or Ledger identity.

## Collaboration

The Registry supplies one locked Contributor Snapshot for the Collaborative
Work across all Product revisions and rejects construction when the same
`collaborativeWorkId` is paired with a different `snapshotHash`, using the
stable `MARKET410_CONTRIBUTOR_SNAPSHOT_CONFLICT_ERROR` boundary error. Product
revisions may still use different ProductFingerprint shapes when that Work
Snapshot hash is the same. FP-003 performs equal-after-canonical-deductions
allocation in minor units with deterministic remainder order. The
ProductFingerprint guard rejects duplicate sale shapes; caller overrides for
the Product Lead, snapshot, fingerprint, or deductions are never authority.

## Flags, diagnostics, and non-intrusion

Both feature flags default off, unknown flags are off, and the kill switch
wins. Diagnostics are constant safe codes/messages and the audit summary
contains only counts, statuses, schema identity, and mutation=false. JWTs,
emails, payment details, project bodies, raw files, and blobs are not emitted.

This package is isolated under `pixiedraw2/src/platform/market-410`, its
focused tests, its bounded benchmark generator, and the MARKET-410 contract
and evidence documents. Current Market routes/UI, Supabase, Stripe, Storage,
production data, and WP-210/FP-003 source remain untouched. Removing the
isolated files is the rollback boundary; no production rollback is implied.

## Qualification boundary

The included evidence is synthetic, deterministic, bounded, and independently
reviewed by Terra High for this isolated local slice. Real provider
webhooks/SDKs, Stripe or other payment execution, Supabase/database/RLS/
Storage persistence, durable cross-process idempotency and crash recovery,
current Market route integration, browser/device/accessibility behavior, and
deployment/cutover remain `UNTESTED`. This contract makes no
production-integration claim.
