# Current System Preservation Gate

```yaml
document_id: PIXIEED-CURRENT-SYSTEM-PRESERVATION-001
status: CANONICAL
version: 1.0.0
verified_at: 2026-08-06
```

## Non-negotiable rule

New PiXiEED implementation must not make the current Market, PiXiSYNC, published works,
purchased assets, seller data, public URLs, or existing project data unusable.

The new system is introduced additively and behind compatibility adapters, feature flags,
shadow validation, staged rollout, and rollback controls.

## Protected current systems

### Market

The following current behavior must remain usable until an explicitly approved replacement has
passed all compatibility and reconciliation gates:

- product listing and product detail pages;
- seller/creator pages;
- search, filtering, and discovery;
- Stripe checkout and payment result handling;
- purchase records and download entitlement;
- existing downloadable files and project data;
- seller sales records;
- royalty and derivative relationships;
- payout/withdrawal related records;
- product prices, licenses, ownership, and transaction history;
- existing public URLs and inbound links;
- already purchased users' ability to access their purchases.

No implementation task may silently reinterpret, overwrite, delete, or orphan existing market data.

### PiXiSYNC

The following current behavior must remain usable:

- existing project opening;
- current checkpoint retrieval;
- confirmed revision ordering;
- region/raster operation synchronization;
- reconnect and sleep/wake recovery;
- offline queue handling;
- two-client convergence;
- current RPC, Realtime, table, policy, and migration contracts;
- clients running an older compatible build during staged rollout;
- recovery from a failed new client or failed migration;
- no loss of confirmed edits.

No new synchronization design may replace the current path before compatibility and convergence are proven.

### Other preserved boundaries

- existing PiXiEED URLs;
- existing account/authentication continuity;
- published works and media;
- existing sales, purchase, license, royalty, payout, and entitlement records;
- current project formats and autosave recovery;
- current production database and object-storage references;
- current working PiXiEEDraw during PiXiEEDraw2 development.

## Mandatory implementation strategy

```text
current production path remains active
→ baseline and contract tests are recorded
→ new implementation runs in isolated/local mode
→ compatibility adapter is added
→ shadow/read-only comparison runs
→ synthetic and copied non-private fixtures are verified
→ staged canary is prepared
→ rollback is proven
→ owner approval is requested
→ only then may production cutover be considered
```

## Database rules

- Prefer additive migrations.
- Never rename/drop production columns, tables, RPCs, policies, buckets, or event contracts in the
  same release that introduces a replacement.
- Use compatibility views, adapters, dual-read, or controlled dual-write only when reconciliation
  is defined and tested.
- Every migration requires dry-run evidence and rollback/reconciliation instructions.
- Production migration application always requires owner approval.
- Financial and entitlement records require reconciliation counts and invariant checks.
- Do not use real private user content as general test fixtures.

## URL and API rules

- Preserve existing public URLs or provide tested redirects.
- Preserve existing API/RPC behavior for compatible clients during staged rollout.
- Do not silently change response meanings, IDs, revision semantics, or authorization behavior.
- Version new incompatible contracts.
- Record compatibility windows and deprecation plans.
- Deprecation does not permit removal until usage evidence and owner approval exist.

## Feature flags and rollback

Every replacement path must have:

- a default-off feature flag;
- scope targeting suitable for local/internal/canary use;
- a kill switch that restores the current path;
- no irreversible data transformation merely from enabling the flag;
- observable health and error metrics;
- a documented rollback command or procedure.

A rollback must restore service without losing writes accepted while the new path was active.
When that cannot be guaranteed, cutover is blocked.

## Required baseline evidence

WP-000 must create current-system evidence for Market and PiXiSYNC:

```text
docs/inventory/market-current-baseline.md
docs/inventory/market-data-contracts.md
docs/inventory/pixisync-current-baseline.md
docs/inventory/pixisync-data-contracts.md
docs/inventory/current-public-routes.md
docs/inventory/current-production-boundaries.md
```

The evidence must be based on repository code, migrations, tests, configuration, and safe inspection.
Unknown production behavior must be marked unknown, not guessed.

## Required compatibility tests

### Market

- existing product fixture remains readable;
- existing purchase fixture retains entitlement;
- product price/license/ownership is unchanged;
- seller and royalty relationships remain connected;
- existing download reference remains resolvable;
- checkout changes do not alter historical records;
- reconciliation counts match before and after migration;
- public URLs resolve or redirect as documented.

### PiXiSYNC

- existing checkpoint fixture opens;
- an older compatible client and new client can coexist during staged testing;
- duplicate, reordered, delayed, and missing operations are handled safely;
- sleep/wake and reconnect resume from confirmed revision;
- two clients converge to the same output hash;
- confirmed writes are not lost during rollback;
- unsupported schema/version fails explicitly instead of corrupting data.

## Global release gate

Every Work Package must answer:

```yaml
current_market_impact:
current_pixisync_impact:
existing_url_impact:
existing_data_impact:
compatibility_tests:
feature_flag:
rollback:
production_action_required:
owner_approval_required:
```

A Work Package cannot be marked complete when it knowingly breaks the current Market or PiXiSYNC,
unless the break exists only in an isolated experiment and cannot affect current users.

## Stop conditions

Codex must stop and request approval before:

- disabling or replacing the current Market in production;
- disabling or replacing PiXiSYNC in production;
- applying a production migration;
- changing transaction, entitlement, royalty, payout, license, or ownership meaning;
- deleting or moving production data without a proven reversible process;
- changing existing public URLs destructively;
- removing compatibility for the currently deployed client;
- enabling a production cutover flag.

## Completion principle

"New implementation works" is insufficient.

The acceptable result is:

> The new implementation works, the current implementation remains available, existing data remains
> valid, compatibility is tested, and rollback is proven.
