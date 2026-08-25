---
spec_id: CONTRACT-FP003Z-SERVER-AUTHORITY-ROOT-001
title: FP-003Z Server Authority Root and Persisted Revision Integrity
status: COMPLETE_ISOLATED_PENDING_EXTERNAL_AUDIT
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-10
---

# FP-003Z Server Authority Root and Persisted Revision Integrity

## Scope and gate

FP-003Z is an isolated correction package for the FP-003Y Provider-substitution and persisted
stale-chain findings. FP-004 Durable Event/Inbox/Outbox and WP-900 Release Readiness remain
NO-GO. This contract has no Production Database, Supabase, Provider, route, migration, deploy,
publish, commit, or push behavior.

## Authority graph

```text
Browser / Caller
  └─ Command + opaque IDs + expected revisions
       ↓
Server Composition Root
  └─ fixed CanonicalRegistryAdapter
       ├─ current Identity / Principal
       ├─ current Request-rooted Direct Work chain
       ├─ current Contributor / License authority
       ├─ verified Provider Event identity
       └─ current Financial Authority
              ↓
       deterministic Money / Royalty / Ledger derivation
```

`origin: SERVER_REGISTRY`, revision, and canonical hash are facts returned by the Registry and are
verified together; a caller-created reference is never a trust root. The release root exports one
fixed service instance. The test-only in-memory Registry is injected only into a test composition
module and is not a Browser or release dependency.

## Persisted Direct Work chain

The authoritative path rehydrates current records for Request, Quote, Agreement, Milestone,
Delivery, Acceptance, Rights, and Payment. It verifies each typed ID, expected revision, canonical
hash, Registry head, Request-rooted parent identity, snapshot version, Provider Event binding,
Financial Authority binding, and Payment status. Process-local seals remain supplementary copied
object defenses and are not persisted authority.

The Ledger boundary accepts `{ paymentId, expectedRevision, sourceEventId, ledgerEntryId }`; the
Registry re-resolves the current Payment and derives amount, entry type, direction, and immutable
hash. The retired object/reference compatibility function always denies.

## Browser and build boundary

`src/server/` is outside every Browser bundle entry. The Browser contract contains only
`FP003Z_SCHEMA_VERSION`, ID/expected-revision command references, and diagnostics/results. Existing
Market, Direct Work, Financial, SNS, Admin, and Policy bundle tasks remain Browser-safe contract
entries. The generated artifacts are rebuilt from those entries and audited for old source paths,
Server Authority names, and unexpected implementation size.

## Residual classification

Security Authority caller-controlled trust is zero in the targeted boundary. Remaining Boolean or
resolution words are classified rather than blindly removed:

- `DERIVED_STATE`: a value computed from already verified canonical state;
- `LEGACY_ADAPTER_ONLY`: an explicitly denied old compatibility shape;
- `POLICY_ONLY` / `SHADOW_ONLY`: consent, region, age, Ads, analytics, or comparison policy;
- `NON_AUTHORITY`: presentation or local state.

## Rollback and preservation

Rollback is isolated: remove the FP-003Z Server entries and restore the prior isolated contract
entries. No current route, production state, PXD, PiXiSYNC, Market record, Provider, Database,
Storage, or purchased data is changed. External audit must independently recheck the real server
adapter boundary before FP-004 may begin.
