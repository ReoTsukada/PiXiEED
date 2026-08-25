---
spec_id: CONTRACT-FP003Y-SERVER-AUTHORITY-REVISION-CHAIN-001
title: FP-003Y Server Authority and Revision Chain Finalization
status: SUPERSEDED_BY_FP003Z_PENDING_EXTERNAL_AUDIT
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-10
---

# FP-003Y Server Authority and Revision Chain Finalization

> Historical FP-003Y composition documentation. The Provider-capturing release path described
> below was superseded by FP-003Z's fixed `CanonicalRegistryAdapter` Server Authority Root.
> Current boundary and verification authority is [FP-003Z](FP-003Z-SERVER-AUTHORITY-ROOT.md).

## Scope

FP-003Y is the final isolated hardening package for the FP-003X integration boundary. It closes
the factory-level Provider substitution path, rejects stale Direct Work child chains, and keeps
financial, License, and Contributor Snapshot authority on Server Registry references. FP-004
Durable Event/Inbox/Outbox is not started.

## Composition Root

The release surface exposes `fp003y-client-contract.ts`, which contains only versioned command,
reference, diagnostic, and result shapes. `fp003y-server-authority-runtime.ts` owns the
composition root and captures the Provider internally. Its default adapter is fail-closed until a
real server Registry adapter is supplied inside that server-only module. Browser entries do not
import the Provider, Financial Authority resolver, or service implementation.

`createInternalFp003XService(provider)` remains an internal synthetic composition primitive for
isolated tests and server assembly. It is not exported by any Browser bundle or client-facing
entry. A command cannot pass a Provider, resolver, completed Financial Authority, License
semantic hash, or Contributor Snapshot as authority.

## Principal and registry authority

Command Principal fields are claims or request context only. Product owner, Purchase buyer,
Direct Work requester, moderation actor, and Admin Audit actor are resolved by the server
boundary. A caller Proof Principal is never copied into an omitted expectation. Admin Audit
output uses the canonical server Proof Principal; Policy-only `serverResolved` and shadow-only
flags remain outside AuthorizationProof.

Canonical records require Server Registry provenance, resource type/ID, non-empty revision, and a
matching canonical hash. `origin: SERVER_REGISTRY` is an assertion checked together with the
captured server adapter and hash; it is not a standalone trust root.

## Direct Work current-head chain

The isolated Direct Work Core registers current record heads and checks the current Request,
Quote, Agreement, Milestone, Delivery, Acceptance, and Payment revision before every child or
state transition. The aggregate root, parent IDs, Request/parent record versions, status, terms,
and aggregate identity are checked together. WeakMap seals remain a process-local copied-object
defense only; the server rehydration path uses a Server Registry Payment reference and canonical
hash.

The required failure identities are `STALE_AGGREGATE`, `STALE_PARENT`, `STALE_PAYMENT`, and
`RECORD_INTEGRITY_VIOLATION`. A stale Payment cannot create a Ledger entry. A rehydrated Payment
can create one only after its Server Registry reference and hash are verified.

## Financial, License, and collaboration authority

Payment settlement re-resolves the current Payment, Request-rooted graph, Provider Event identity,
and Financial Authority before materialization. Money validation uses safe integer bounds;
deduction totals use checked BigInt accumulation and reject overflow, negative/invalid/mixed
currency deductions, and deductions larger than Gross. Silent clamping is forbidden.

The server Work/License authority envelope supplies the locked Contributor Snapshot and the
semantic License hash used by Product Fingerprint duplicate detection. Caller-supplied authority
objects or snapshot/hash substitutions are ignored or rejected at the service boundary.

## Verification boundary

FP-003Y targeted verification includes the Browser/server static audit, actual Browser bundles,
caller Principal substitution, Server Registry Payment rehydration, stale chain attacks,
deduction overflow, residual Authority audit, and the inherited FP-001 residual boundary fixture.
It does not claim physical device, production Provider, database transaction, Durable Event,
crash-recovery, migration, deployment, or production compatibility evidence.

## Preservation and rollback

Current PiXiEED, PiXiEEDraw, PXD, PiXiSYNC, Market, Direct Work routes, existing Project/Asset/
Package data, Database, Storage, Provider integrations, and production state are unchanged.
Rollback is limited to removing the isolated FP-003Y server/client entries and restoring the
pre-FP-003Y isolated adapter; no current route or data rollback is required.
