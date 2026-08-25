# ADR-20260807-WP095 — Canonical Event and Activity Core

- Status: Accepted for WP-095
- Date: 2026-08-07
- Scope: Event Catalog, Envelope, Producer Trust, Transactional Outbox, Delivery, Ordering,
  Causation, Retry/DLQ, Replay, Activity Projection, Visibility, and responsibility boundaries

## Decision

Add an unloaded pure Event and Activity Core at
`core-shell/assets/core-event-activity-contracts.js`. It records only trusted post-commit facts and
keeps Activity, Audit, Telemetry, Market, SNS, Search, Notification, and Finance as separate consumers
or future Work Packages.

## Rationale

PiXiEED is a Global Creator Platform. Draw2, Audio, Game/Runtime, Package, Market, SNS, and future
projections need a shared state-change signal, but high-frequency editor operations and private data
must not become a global bus payload. Transactional Outbox prevents state/event loss, while at-least-once
delivery and idempotent consumers prevent duplicates from causing repeated side effects.

## Rules recorded

1. `Command → Authorization → State Commit → Trusted Event`; Event is never a request intent.
2. State and Outbox are one injected transaction boundary. Dispatcher failure never erases a committed
   Outbox row.
3. Aggregate Version is authoritative for per-aggregate ordering. Stale events do not roll back state;
   gaps are reported and retained for recovery.
4. Correlation/Causation are bounded and cycle-checked. Unknown causes and excessive depth fail closed.
5. Consumer delivery is at-least-once. Each Consumer owns an Event ID idempotency ledger.
6. Replay is projection-only and passes `sideEffectAllowed:false`.
7. Activity cannot widen visibility. SNS sharing and Market publishing require explicit future commands;
   Package READY does not create a Product, Price, Purchase, Entitlement, License, Royalty, or Payout.
8. All six Event flags default OFF. No current route, PXD, PiXiSYNC, Market, SNS, data, migration,
   upload, deploy, publish, commit, or push is included.

## Non-application

No Event Core module is imported by current public routes. No production Database/Storage adapter,
financial ledger, SNS post, Notification, Search index, or external webhook is implemented here.
