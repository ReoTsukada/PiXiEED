---
adr_id: ADR-20260807-WP070-FEATURE-FLAG-ROLLBACK-ADAPTER
title: Isolated Default-off Feature Flag and Rollback Adapter
status: ACCEPTED
date: 2026-08-07
---

# ADR-20260807-WP070 — Isolated Default-off Feature Flag and Rollback Adapter

## Context

The site-wide Core needs staged adoption across PiXiEEDraw2, PiXiSYNC, PXD/PiXiPackage, Market,
Commission, Subscription, and Account. A client-only boolean would be unsafe: it could appear to
authorize a path, split read/write behavior, or make rollback delete or reinterpret durable data.

## Decision

Use an isolated adapter with:

- default-off and domain-separated flags;
- independent read/write rollout;
- deterministic server-principal cohorts;
- server-only rollout/override/kill-switch actors;
- mandatory Identity, account, server/RLS, and resource permission gates;
- fallback to the current path when off or rolled back;
- deny on authentication/authorization failure;
- append-only structured audit and shadow mismatch events;
- global, domain, and flag rollback scopes without data deletion.

No production feature is enabled and no Supabase migration is added in WP-070.

## Consequences

- A UI can render a disabled or fallback state without becoming an authorization source.
- Rollback can stop new-path writes while preserving current Journal, PiXiSYNC, Market, and
  entitlement boundaries for reconciliation.
- Audit events require explicit correlation and actor data, making test fixtures deterministic and
  avoiding hidden wall-clock/random dependencies.
- Later server wiring must re-evaluate current Database permissions even if a JWT or client flag is
  stale; this adapter does not make JWT claims the source of current membership or entitlement.
