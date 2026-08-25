---
spec_id: CONTRACT-FP003-FINANCIAL-INTEGRITY-001
title: FP-003 Commerce Royalty Ledger Financial Integrity
status: COMPLETE_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-10
---

# FP-003 Financial Integrity Contract

## Scope

This contract closes the isolated financial derivation portion of the Sol MAX findings. It covers
Market Purchase royalty projections and Direct Work Ledger projections. Cross-layer authority
adoption is defined by `FP-003X-CROSS-LAYER-AUTHORITY.md`; the raw resolver seam in this file is
fixture/internal only and is not a release entry surface. It does not implement Durable
Event/Inbox/Outbox, provider transport, persistence, payout, production migration, or cutover.

## Authority order

```text
AuthorizationProofV1
  → VerifiedProviderEventV1
  → FinancialAuthorityResolutionV1
  → Purchase / Payment binding
  → FeeScheduleAuthorityV1
  → Canonical Money
  → Royalty allocation
  → Ledger projection
```

The resolver is the only boundary allowed to provide gross Money, Fee Schedule, and recipient
allocations. Caller financial hints are rejected, not merged with the server result.

## Invariants

1. FP-001 `AuthorizationProofV1` is required and bound to `FINANCIAL_ALLOCATION`, source ID,
   `finance.royalty.allocate`, and the canonical policy version.
2. Provider Event ID, payload fingerprint, source kind, source ID, environment, and settlement
   state must match the server Financial Authority result exactly.
3. Market authority binds exactly Product and Purchase; Direct Work authority binds exactly Request
   and Payment. Cross-domain and cross-record joins fail closed.
4. Gross Money uses the existing WP-220 `Money`/currency policy contract. Amount arithmetic is
   integer-only and safe; unsupported or unsafe values fail closed.
5. Platform and royalty basis points are server-resolved, unique, positive for royalty recipients,
   and bounded by 10,000. Remainders are distributed deterministically by fractional remainder,
   then recipient ID.
6. Market entries are derived per recipient with immutable hash and locked Product/Purchase/
   Provider Event references.
7. Direct Work `PAID` derives `SALE/CREDIT/payment.amount`; `REFUNDED` derives `REVERSAL/DEBIT/
   payment.amount` and requires an original-entry reference. Caller overrides are rejected unless
   they exactly match a derived value; the default safe path derives them internally.
8. The old WP-210 caller-supplied Royalty reconciliation is denied as `LEGACY_ADAPTER_ONLY`.
9. Duplicate events remain local projection no-ops only. Durable deduplication, replay, and crash
   recovery belong to FP-004.
10. Every Product Revision from one Collaborative Work binds the same locked Contributor Snapshot.
    Product Lead is not Revenue Owner, and partial Product extraction does not remove Contributors.
11. Collaborative revenue applies canonical deductions in the fixed order Provider Fee, PiXiEED
    Fee, External Asset/Sprite Fee, Parent/Derivative Royalty, then Other Canonical deductions.
    The remaining Net Contributor Pool is split equally across the Snapshot, using stable
    `allocationOrder` for remainder minor units. Contributor count, asset count, editing time,
    participation order, and Product Lead do not affect the split.
12. `ProductFingerprintV1` is the duplicate guard over Collaborative Work, included Asset Revision
    set, delivery format, sale type, canonical License semantic hash, and source inclusion. Snapshot
    IDs are references rather than duplicate authority. Exact duplicates fail; different Product
    shapes remain eligible.

## Compatibility

Current Market/RPC/provider, Direct Work routes, PXD, PiXiSYNC, account, finance, database,
Storage, purchased data, and production systems are unchanged. Existing Money and FP-001 proof
contracts are reused. No parallel authority or Money system is introduced.
