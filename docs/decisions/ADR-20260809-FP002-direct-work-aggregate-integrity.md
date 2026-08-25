---
adr_id: ADR-20260809-FP002-DIRECT-WORK-AGGREGATE-INTEGRITY
title: Request-rooted Direct Work Identity Graph
status: ACCEPTED_COMPLETE_ISOLATED
date: 2026-08-09
---

# Decision

Use one Request-rooted `DirectWorkAggregateIdentity` with version `DIRECT_WORK_GRAPH_V1` for
Request, Quote, Agreement, Milestone, Delivery, Acceptance, Rights, and Payment. Every child is
created from the actual sealed parent record and carries the full parent chain.

Use Quote acceptance as the immutable Terms boundary. Agreement Terms must equal the accepted Quote
Terms; Payment must reference that same Quote and Agreement. A copied or modified in-memory record
is rejected by the Core's frozen snapshot Seal before it can be used as a parent.

# Rejected alternatives

- Checking only `requestId`: it permits a mismatched Quote, Agreement, Milestone, or Delivery chain.
- Trusting each child record's caller-supplied `requestId`/`quoteId`: it permits cross-record joins.
- Recomputing Agreement Terms from caller input: it permits Terms replacement after Quote approval.
- Adding payment/Ledger or Durable Event behavior to this package: it would mix FP-003 and FP-004
  responsibilities and obscure the finding boundary.
- Rebuilding `AuthorizationProofV1`: FP-001 is the shared authorization root.

# Consequences

Direct Work has a clear local integrity boundary and explicit failure identity for cross-record
attacks. Server persistence and rehydration must re-enter through a validated adapter because the
WeakMap Seal is intentionally session-local. Durable replay, provider identity, and transaction
boundaries remain later remediation packages. No production mutation is authorized.
