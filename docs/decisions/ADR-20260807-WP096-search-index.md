# ADR-20260807-WP096 — Canonical Search Index Core

- Status: Accepted for WP-096
- Date: 2026-08-07
- Scope: Search Document, Resource Catalog, Event Projection, Visibility, Query, Rebuild, Cursor,
  Multilingual normalization, Backend Adapter, Retry/DLQ, and Feature Flags

## Decision

Implement an unloaded pure `core-search-index-contracts.js` that consumes only trusted WP-095 Event
Envelopes and bounded canonical reference snapshots. Search is a replaceable derived projection, not
the source of truth or an authorization boundary. The reference backend is in-memory only.

## Rationale

The Global Creator Platform needs one future search boundary across Project, Asset, Package, Creator,
and later Market/Social domains. A vendor-specific or production-connected search service at this
stage would make privacy, rebuild, migration, and rollback harder to prove. A typed adapter lets
PostgreSQL FTS/trigram, a dedicated engine, hosted search, or local search be benchmarked later.

## Rules recorded

1. Canonical Registry/Market/Creator state remains authoritative; Search failure or loss cannot make
   canonical writes fail and must be recoverable by Full/Type/Single Resource Rebuild.
2. Public Discovery contains only active Public resources. Private, Member, Creator-private, Unlisted,
   Trashed, and Quarantined records are not exposed through global discovery. Scoped queries require
   a server authorization evaluator, and Exact ID Lookup rechecks authorization or uses a canonical
   fallback. Search results never grant Read access.
3. Search documents contain bounded display/search text and opaque preview references only. Raw media,
   project bodies, operations, journals, private conversations, JWT/PII, payment, entitlement, license,
   royalty, and commission bodies are rejected.
4. Event projection is idempotent by Event ID and ordered by Aggregate Version. Stale Events do not
   roll back; gaps are retained for resume; Tombstones prevent old Events from resurrecting hidden data.
5. Query uses a Typed Search Plan, hard limits, stable cursors, literal token matching, and registered
   sort/facet fields. No arbitrary SQL, regex, wildcard expansion, or client-selected index field is used.
6. All six Search flags default OFF. No current Route, Draw, PXD, PiXiSYNC, Market, SNS, Project,
   Asset, Package, database, storage, migration, deploy, publish, commit, or push is part of WP-096.

## Non-application

No Production Search Backend, Database Migration, public Search Route, Market Search, SNS Search,
Recommendation, Advertisement Ranking, notification, or financial projection is implemented.
