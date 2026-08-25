# ADR-20260809 — Reconstruct WP-210 Market/Rights/Commerce scope

Status: accepted for isolated implementation; production application not authorized  
Date: 2026-08-09

## Context

The repository had an approved roadmap row and queue entry for WP-210, but no dedicated
`09_ROADMAP/WORK_PACKAGES/WP-210.md`, task prompt, or Context mapping. The current worktree also
contains unrelated dirty implementation changes that must be preserved.

## Sources used

- `09_ROADMAP/CORE_SITE_INTEGRATION_PROGRAM.md` WP-210 row.
- `00_START_HERE/IMPLEMENTATION_QUEUE.yaml` WP-210 required outputs and dependencies.
- `CURRENT_SYSTEM_PRESERVATION_GATE.md`, `02_ARCHITECTURE/ACCOUNT_PERMISSION_CORE.md`,
  `PACKAGE_REGISTRY_CORE.md`, `ASSET_GRAPH.md`, `INTEGRATED_PACKAGE_FORMAT.md`, and
  `LEGACY_DATA_COMPATIBILITY.md`.
- `docs/inventory/market-current-baseline.md`, `market-data-contracts.md`,
  `docs/inventory/fixtures/market-purchase.synthetic.json`, and the repository-only Supabase
  schema inventory.
- `docs/decisions/DECISIONS.md`, `docs/contracts/WP-094-PACKAGE-REGISTRY.md`,
  `docs/contracts/WP-200-GAME-RUNTIME-BRIDGE.md`, and the approved WP-200 Context.

## Decisions

1. Reconstruct the package as a contract and local/shadow adapter only. No production RPC, Edge
   Function, Stripe, Storage, Auth, RLS, migration, or route is changed.
2. The Market classification vocabulary is exactly `MATERIAL | COMPLETED_WORK`. Package kind,
   publication method, rights/license, and financial/entitlement records remain separate.
3. The adapter reuses WP-160 typed ID/hash/canonical JSON conventions. It adds domain-specific
   diagnostic codes under the WP-010 diagnostic shape (`code`, `severity`, `message`, `path`,
   metadata) rather than inventing a transport or error envelope.
4. Existing server-authoritative RPC/Edge boundaries remain the only owners of financial and
   entitlement mutation. The provider adapter emits opaque commands and never stores secrets,
   JWTs, emails, raw webhook payloads, project bodies, or commission bodies.
5. A legacy conflict is `QUARANTINED`, not auto-merged. Historical amounts and IDs are retained;
   no recalculation, ID reuse, silent URL replacement, or entitlement resurrection is allowed.
6. Reconciliation is deterministic and idempotent. Purchase entitlement is independent from
   subscription access, and a purchased locked package survives source tombstone/deletion.

## Consequences

The new Market adapter can be tested and bundled without touching the current site. It does not
prove real checkout, live data reconciliation, RLS/Storage behavior, real legacy user import,
or release performance. Those remain explicit UNTESTED gates for a separately authorized phase.
