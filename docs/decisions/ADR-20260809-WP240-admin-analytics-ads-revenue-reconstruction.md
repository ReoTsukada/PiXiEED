# ADR-20260809-WP240 Admin / Analytics / Ads / Revenue Reconstruction

## Decision

WP-240 is implemented as an unloaded pure projection boundary. Admin access is granted only by an
injected server capability decision. Analytics accepts bounded privacy-safe metadata. Ads are
eligible only on public discovery/feed/resource/Market listing surfaces and are excluded from Active
Studio, Checkout, Entitlement, Commission, Account-private, and Project-private surfaces.
Moderation is a typed reference without body or target mutation. Revenue is a read-only shadow
comparison and cannot mutate Ledger or Payout.

## Provenance

The scope is reconstructed from the queue/roadmap row, the Feature Flag/Observability/Rollback,
Account Permission, Event, Search, Notification, and Existing Platform Preservation contracts,
existing owner/admin RPC entry points, and existing advertising policy files. No dedicated WP-240
specification existed. Existing scripts and migrations are evidence only and were not imported into
the new Core.

## Consequences

The boundary can be tested and lazily loaded without changing current Admin, Market, Ads, Account,
Revenue, or moderation behavior. Real server authorization, provider delivery, moderation workflow,
financial reconciliation, and production performance remain release gates. All flags default OFF;
unknown and killed states fail closed; local rollback has no external side effect.

