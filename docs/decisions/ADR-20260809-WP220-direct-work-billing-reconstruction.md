# ADR-20260809 — Reconstruct WP-220 Direct Work and Billing scope

Status: accepted for isolated implementation; production application not authorized  
Date: 2026-08-09

## Context

The approved queue and roadmap named WP-220, but the repository had no dedicated WP-220 work-
package file, Context, Prompt, or production Direct Work/Commission specification. Repository
search found the generic Core workflow and permission boundary, but no existing Direct Work
database, route, payment, or entitlement implementation to replace.

## Sources used

- `00_START_HERE/IMPLEMENTATION_QUEUE.yaml` WP-220 title, dependencies, and required outputs.
- `09_ROADMAP/CORE_SITE_INTEGRATION_PROGRAM.md` WP-220 compatibility requirement.
- `02_ARCHITECTURE/PIXIEED_CORE_SYSTEM.md` Direct Work workflow and billing separation.
- `02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md` Commission requester/creator/milestone authority.
- `02_ARCHITECTURE/LEGACY_DATA_COMPATIBILITY.md`, `COST_AWARE_REALTIME_POLICY.md`,
  `NOTIFICATION_CORE.md`, `PACKAGE_REGISTRY_CORE.md`, and `ASSET_GRAPH.md`.
- `docs/decisions/DECISIONS.md` Direct Work/DM/Product separation and financial preservation.
- `docs/contracts/WP-060-ACCOUNT-PERMISSION-ADAPTER.md`,
  `docs/contracts/WP-210-MARKET-RIGHTS-COMMERCE.md`, and the approved WP-210 Context.
- Repository search result: no existing Direct Work production schema/route/fixture was found;
  existing payout quote functions are Market payout contracts and remain outside WP-220.

## Decisions

1. Reconstruct WP-220 as a pure, lazy, local/shadow Direct Work Core. Do not add a production
   table, RPC, Edge Function, route, provider call, or migration.
2. Use the approved state sequence Request → Quote → Agreement → Milestones → Delivery →
   Acceptance → Rights/License → Payment/Ledger. Acceptance, rights, and payment are separate
   records and transitions.
3. Reuse WP-160 typed ID/hash/canonical JSON conventions. Money is integer minor-unit plus
   currency and explicit rounding policy. Currency registry and future rounding expansion remain
   versioned boundaries.
4. Treat the Provider as an opaque command/event source. Only a verified server adapter may
   produce a canonical payment event. Client price, royalty, payout, owner, license, and
   entitlement claims are rejected.
5. Keep Ledger append-only. Refund/dispute/correction creates reversal or adjustment evidence;
   no old entry mutation and no payout failure rollback of work/rights state.
6. General DM, Market Product/Purchase/Entitlement, Subscription, and Notification are separate
   authorities. A Direct Work request never becomes a Market Product automatically.

## Consequences

WP-220 can prove state, money, security, idempotency, and recovery behavior without touching
production. It does not prove real checkout, webhook signatures, live RLS, real user data,
payout execution, or release performance; those remain separate gates.
