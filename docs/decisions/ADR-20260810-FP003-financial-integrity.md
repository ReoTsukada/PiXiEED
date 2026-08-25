---
adr_id: ADR-20260810-FP003-FINANCIAL-INTEGRITY
title: Server-derived Commerce, Royalty, and Ledger financial state
status: ACCEPTED_COMPLETE_ISOLATED
date: 2026-08-10
---

# Decision

Use a pure FP-003 materializer that accepts only a verified Provider Event identity, the shared
FP-001 `AuthorizationProofV1`, and a server-owned Financial Authority resolver. The resolver owns
the canonical gross Money, Fee Schedule, recipient accounts, and settlement state. FP-003 derives
royalty amounts and Ledger entry type/direction deterministically from that result.

Reuse WP-220's existing `Money` and currency policy contract. Reuse WP-210's Product, Purchase,
License, and locked Package references. Market output is an extension of the existing
`RoyaltyLedgerEntry`; Direct Work output is produced by the hardened WP-220 Ledger factory.

For Collaborative Commerce, bind every Product Revision to the same locked Work-level Contributor
Snapshot. Apply the versioned deduction order before dividing the Net Contributor Pool equally by
stable Contributor allocation order. Product Lead is management metadata only. Use
`ProductFingerprintV1` as the exact duplicate guard; distinct delivery shape or included Revision
set remains a separate Product.

# Rejected alternatives

- Trusting `amountMinor`, `currency`, recipient, royalty rate, entry type, or direction from a
  caller object: this preserves the P0-03/P0-04 finding.
- Creating a new incompatible Money or Authorization type: this would split the canonical trust
  root and recreate the FP-001/FP-002 integration problem.
- Making FP-003 own Outbox/Inbox, durable replay, or provider idempotency: those are FP-004 and
  require a separate transaction boundary.
- Keeping the old WP-210 `reconcileCommerce` caller-supplied Royalty argument authoritative: the
  path is now explicitly denied as `LEGACY_ADAPTER_ONLY`.
- Using floating-point percentage calculations: integer minor units and deterministic BigInt
  remainder allocation are reproducible across runtimes.

# Consequences

Valid isolated Market and Direct Work projections can be compared deterministically. A provider,
server, or persistence adapter must supply the Financial Authority result and cannot smuggle
financial state through a UI or caller payload. Real provider verification, database transaction
atomicity, durable replay, payout, RLS, and production compatibility remain untested and are not
claimed complete.
