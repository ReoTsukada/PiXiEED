# ADR-20260810 — Core-First Resequencing

Status: ACCEPTED FOR ISOLATED PLANNING
Date: 2026-08-10
Decision scope: Repository architecture and qualification order only

## Decision

Complete and qualify the canonical Core before implementing or integrating new tool-product
providers. The completion order is:

```text
FP-004 durable transaction/event
  -> FP-005 privacy/storage/input hardening
  -> FP-007 schema/dependency/build reproducibility
  -> CORE100 composition/adapters
  -> CORE110 conformance/failure injection
  -> CORE120 qualification
  -> Draw2 phase FP-006 hot path/recovery/device UX
```

FP-006 is deliberately moved after CORE120. Draw2 performance and device behavior require a
qualified persistence, event, storage, schema, and adapter boundary; they cannot be used to prove
that those boundaries are durable or production-safe.

## Context

The audit found that the new Core is currently isolated/reference:

- [`core-shell/`](../../core-shell) is a `noindex` design-system preview with unavailable/Coming
  Later route chunks;
- [`pixiedraw2/`](../../pixiedraw2) is explicitly local-only and does not replace the current
  [`pixiedraw/`](../../pixiedraw);
- the new production-side Core adapters are not loaded by the current production page;
- WP-210 through WP-250 are pure projections/contracts without provider integration;
- WP-095 provides in-memory/synthetic durability boundary evidence, not durable persistence;
- FP-004 through FP-007 have no dedicated implementation package or completion contract.

The current production system remains the existing PixiEEDraw, Market, Social, PiXiSYNC, Admin,
Ads, Stripe, and Supabase paths documented in
[`docs/inventory/current-production-boundaries.md`](../inventory/current-production-boundaries.md).

## Rationale

1. A durable transaction/event boundary is the common dependency for finance, notification,
   search, Market, Social, Direct Work, and future tool products.
2. Privacy/storage/input rules must be established before durable records or provider payloads are
   accepted.
3. Reproducible schema and build inputs are needed before composition and qualification results can
   be trusted.
4. Provider adapters must not become a second authority layer. Core must decide validity,
   authorization inputs, identity, idempotency, and failure semantics.
5. A production-equivalent environment is necessary for evidence, but it must remain isolated from
   production until a separate cutover decision.

## Boundary definitions

| Layer | Decision boundary |
| --- | --- |
| Core | Canonical contracts, durable state/event rules, validation, authorization revalidation, projections, failure semantics |
| Tool product | User-facing workflow and product-specific commands; no direct provider authority |
| Provider adapter | External transport and provider serialization; no invented authorization or success |
| Production-equivalent | Isolated provider-shaped verification environment with synthetic data and no production secrets |
| Cutover | Later, separately authorized migration/deployment/cache/rollback operation |

## Consequences

### Positive

- Tool products receive one canonical event, storage, authorization, and rollback boundary.
- Finance, Notification, and Search cannot each invent incompatible idempotency or replay behavior.
- Current production remains a safe fallback while Core evidence is collected.
- The distinction between source implementation, isolated verification, and production integration
  becomes machine-auditable.

### Costs and risks

- New product provider work is intentionally delayed until CORE120.
- Existing synthetic tests and work-package metadata need alignment with the new completion layers.
- A provider-equivalent test harness and durable adapter require additional implementation effort.
- A passing isolated suite still cannot qualify real devices, live data, or a production deployment.

## Rejected alternatives

### Integrate each product directly from its current isolated projection

Rejected. It would duplicate authority, event identity, privacy, and retry behavior across Market,
Social, Finance, Notification, and Search.

### Count WP-095 in-memory Outbox as FP-004

Rejected. It does not survive process loss or prove durable commit, lease, Inbox, provider identity,
or crash recovery.

### Move FP-006 back before Core completion

Rejected. Draw2 hot-path/device evidence cannot validate durable event/storage/schema behavior and
would make product implementation a substitute for Core qualification.

### Replace current production routes during Core work

Rejected. Current routes and data remain the production fallback until a separately approved staged
rollout with cache identity, migration, shadow comparison, and rollback evidence.

## Required follow-up records

- [`02_ARCHITECTURE/CORE_COMPLETION_BLUEPRINT.md`](../../02_ARCHITECTURE/CORE_COMPLETION_BLUEPRINT.md)
- [`docs/contracts/FP-004-DURABLE-EVENT.md`](../contracts/FP-004-DURABLE-EVENT.md)
- FP-005 privacy/storage/input contract
- FP-007 schema/dependency/build reproducibility contract
- CORE100/110/120 acceptance and evidence inventories
- updated WP-900 readiness matrix after Core qualification

## Non-authorization

This ADR authorizes only the isolated planning and documentation order. It does not authorize
product implementation, database migration, provider configuration, deployment, publication,
commit, push, or production cutover.
