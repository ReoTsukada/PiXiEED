---
spec_id: CONTRACT-FP003X-CROSS-LAYER-AUTHORITY-001
title: FP-003X Cross-Layer Authority Hardening
status: COMPLETE_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-10
---

# FP-003X Cross-Layer Authority Hardening

## Scope

FP-003X closes the isolated integration boundary findings from the FP-001〜FP-003 external
audit. It does not start FP-004 Durable Event/Inbox/Outbox, change current routes, connect a
provider, apply a database migration, or alter production data.

## Authority boundary

Domain commands contain references and intent. The server constructs one immutable
`Fp003XService` with a captured `Fp003XServerAuthorityProvider`. Per-command resolver or
authority replacement is not part of the release surface.

```text
Server Identity / Registry
  → AuthorizationProofV1
  → Canonical Record Ref + current revision/hash
  → Request-rooted Aggregate
  → Verified Provider Event
  → Financial Authority
  → Canonical Money / Royalty / Ledger
```

`AuthorizationProofV1.principalId` is checked against the canonical Product owner, Purchase
buyer, or Direct Work requester. It is never used to choose the expected Principal.

## Canonical records

`CanonicalRecordRefV1` binds resource type, resource ID, current revision, canonical hash, and
`origin: SERVER_REGISTRY`. Hash equality alone is not authority; the record must be returned by
the captured Server Registry provider and then hash-checked.

Process-local `WeakMap` seals remain integrity helpers only. Financial materialization additionally
requires a sealed Payment and the complete Request → Quote → Agreement → Payment graph.

## Aggregate and financial rules

- stale Request revisions fail as `STALE_AGGREGATE`;
- unsealed or copied Payment records cannot create Ledger entries;
- an old Payment revision cannot be materialized as the current settlement;
- Financial Authority is resolved by the Server provider, not by a command field;
- Collaborative Contributor Snapshot is resolved by Work Registry and remains fixed per Product
  Revision;
- License semantic hash, not generated License Snapshot ID, participates in Product Fingerprint;
- Asset Revision sets are sorted and duplicate revisions are rejected;
- `sourceIncluded` is runtime-validated as boolean;
- future-issued Proofs, expired Proofs, and lifetime violations fail closed.

## Deferred responsibility

Durable Inbox/Outbox, replay, crash recovery, provider delivery, database transaction boundaries,
payout, migration, deploy, publish, and production cutover remain FP-004 or later work.

## Compatibility and rollback

Current PiXiEEDraw, PXD, PiXiSYNC, Market, Direct Work routes, Product/Purchase records, provider
contracts, Database, Storage, and production data are unchanged. The FP-003X service is isolated
and default-unloaded. Rollback is removal of the FP-003X entry from the isolated lazy bundle and
reversion to the pre-FP-003X isolated adapters; no current route or data rollback is required.
