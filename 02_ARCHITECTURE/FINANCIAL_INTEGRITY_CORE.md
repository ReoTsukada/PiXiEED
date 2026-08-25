# FP-003 Financial Integrity Core

FP-003 is the isolated financial-boundary remediation for Commerce, Royalty, and Direct Work
Ledger projections. It does not connect a provider, route, database, Storage, Supabase, or
production state. FP-004 owns durable Event, Inbox, Outbox, replay, and crash-recovery semantics.

## Canonical derivation

```text
Verified Provider Event identity
        ↓
Server AuthorizationProofV1
        ↓
Server-owned FinancialAuthorityResolutionV1
        ↓
Canonical Purchase / Direct Work Payment binding
        ↓
Product / License / Fee Schedule binding
        ↓
Canonical Money (existing WP-220 Money contract)
        ↓
Deterministic royalty allocation
        ↓
Market Royalty Ledger / Direct Work Ledger projection
```

`amountMinor`, `currency`, recipient, allocation basis points, entry type, and direction are not
financial authority when supplied by an outer caller. The FP-003 resolver returns the server-owned
gross amount and Fee Schedule; the Core validates the identity bindings and derives all downstream
values with integer arithmetic. BigInt is used for basis-point multiplication and deterministic
remainder distribution; no floating-point money calculation is used.

## Shared type boundary

FP-003 aliases and validates the existing `Money` type and currency policies owned by
`wp220-direct-work-core.ts`. It does not create a second incompatible Money type. Existing
`AuthorizationProofV1` from FP-001 remains the only authorization root.

Market financial settlement binds Product, Purchase, locked Package, License, and the exact
Provider Event before materializing one immutable-hash Royalty Ledger entry per server-resolved
recipient. Direct Work settlement binds Request, Payment, reconciled Payment Event, and Payment
Money before invoking the hardened Direct Work Ledger factory. Refunds derive `REVERSAL` and
`DEBIT`; paid events derive `SALE` and `CREDIT`.

The former WP-210 `reconcileCommerce` shape is now `LEGACY_ADAPTER_ONLY` because it accepts a
caller-supplied Royalty object. It cannot be used as a financial authority path. The new FP-003
materializers are the isolated safe path.

## Collaborative Commerce finalization

Collaborative Work revenue is not a single-creator Product rule. Every Product Revision binds the
same Work-level locked `ContributorSnapshotV1`; Product Lead is a sales-management role and is not
the Revenue Owner. A Product may contain only part of the Work or be created by any Contributor,
but the Contributor Snapshot does not shrink because an Asset, Audio, Game, or source component was
excluded.

```text
Gross Sale
 → Payment Provider Fee
 → PiXiEED Fee
 → External Asset / Sprite Fee
 → Parent / Derivative Royalty
 → Other canonical deductions
 → Net Contributor Pool
 → equal split across the locked Contributor Snapshot
```

The deduction kinds and order are versioned. Equal allocation uses the locked `allocationOrder`;
remainder minor units are assigned from that stable order. Product Lead, Product Owner, Asset
count, editing time, participation order, and included-Asset ownership cannot change the split.
`ProductFingerprintV1` rejects an exact duplicate of the Collaborative Work, included Revision set,
delivery format, sale type, License Snapshot, and source-inclusion shape, while materially different
products remain allowed.

## Safety boundary

- Provider identity is a small verified-event contract without monetary payload fields.
- The resolver is a server-owned adapter seam and must return the exact source, event, proof scope,
  gross Money, Fee Schedule, and recipient bindings requested by the server boundary.
- Unknown currency, non-integer/negative/unsafe money, invalid Fee Schedule, duplicate recipient,
  cross-record identity, changed Provider Event fingerprint, and caller financial hints fail closed.
- Duplicate Provider Event input is only a local reconciliation no-op in the existing projection;
  durable deduplication and replay ordering remain FP-004.
- No financial result is persisted, uploaded, paid out, or published by this package.

## Verification status

The isolated FP-003 fixture covers valid Market and Direct Work derivation plus caller amount,
currency, recipient, rate, entry-type, direction, cross-record, Provider Event, unsupported,
negative, unsafe, Fee Schedule, and duplicate-event cases. The Collaborative Commerce fixtures
cover locked shared Snapshots, partial Product variants, Product Lead neutrality, exact duplicate
blocking, canonical deduction ordering, equal Net Pool allocation, deterministic remainder, late
Contributor rejection, and currency mismatch. Real provider, database, RLS, ledger, royalty,
payout, production, and device behavior remain untested.
