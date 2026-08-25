---
spec_id: CONTRACT-FP002-DIRECT-WORK-AGGREGATE-INTEGRITY-001
title: FP-002 Direct Work Aggregate Integrity
status: COMPLETE_ISOLATED
classification: PRIVATE_INTERNAL_ONLY
version: 1.0.0
updated: 2026-08-09
---

# FP-002 Direct Work Aggregate Integrity

FP-002 closes the Direct Work cross-record integrity finding in the isolated Core. It does not
connect Direct Work to current routes, Supabase, providers, Market data, PiXiSYNC data, or
production state.

## Contract

`Request` is the only Aggregate root. Each downstream record carries a typed
`DirectWorkAggregateIdentity` with `DIRECT_WORK_GRAPH_V1`, the root Request ID, and the complete
parent-chain IDs. Factories derive child identities from actual parent records and reject a record
whose chain does not match the root.

The checked path is:

```text
Request → Quote → Agreement → Milestone → Delivery → Acceptance → Rights → Payment
```

## Invariants

1. A Quote can only be created from a sealed submitted Request and stores that Request's requester,
   creator, scope, and record-version snapshot.
2. Quote acceptance is limited to the Request-rooted requester and stores the accepted Terms hash.
3. Agreement creation requires the accepted Quote, the same Request snapshot, and an exact Terms
   match. Post-approval Terms replacement fails closed.
4. Milestone and Delivery identities must extend the same Agreement/Milestone chain.
5. Acceptance verifies Request, Milestone, and Delivery seals and all chain IDs before changing
   status.
6. Rights verifies the same Request-rooted Acceptance and retains Milestone/Delivery identity.
7. Payment verifies the same Request, Quote, and Agreement, including Quote Terms; it never accepts
   caller-provided financial authority.
8. Factory output is frozen and internally sealed. A copied or modified object is not accepted as a
   canonical record.

## Attack coverage

The FP-002 fixture covers valid graph construction and rejection of:

- Quote from Request B joined to Request A;
- Delivery from another Milestone/Request joined to Request A;
- caller-created or modified Milestone;
- Agreement Terms replacement after Quote acceptance;
- copied Quote with changed Terms and copied acceptance snapshot;
- Rights from another Request Acceptance;
- Payment with another Request Quote;
- Payment with another Request Agreement.

## Compatibility and safety

FP-001 `AuthorizationProofV1` and its injected server resolver remain the only authorization
contract. FP-003 owns money/Royalty/Ledger transaction integrity and FP-004 owns durable event
semantics; neither is implemented by this package. WP-220's current Direct Work lazy route remains
isolated and default-off. Existing routes, PXD, PiXiSYNC, Market, projects, purchases, rights,
licenses, royalties, and production data are unchanged.
