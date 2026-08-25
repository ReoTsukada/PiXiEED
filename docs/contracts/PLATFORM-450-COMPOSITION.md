# PLATFORM-450 isolated composition contract

Status: `IN_PROGRESS` / `PENDING_SOL_REVIEW`

## Boundary

The public contract accepts exactly `commandId`, `flow`, `resourceReference`,
and `requestedAction`. Server-only authority, predecessor dependency state,
consumer adapters, flags, kill switch, and clock are bound in a composition
closure. The public contract exports no server resolver or Provider
configuration.

The closure re-resolves the exact principal, tenant, resource, action,
capability, policy version, current revision, and provider identity. The
required capability map is fixed for all five flows:

- `PUBLIC_WORK_SOCIAL`
- `MARKET_PURCHASE_CHAIN`
- `DIRECT_WORK_CHAIN`
- `TOOL_ASSET_RUNTIME`
- `OPS_PROJECTION`

Predecessor contract/evidence paths and SHA-256 identities for SITE-400,
MARKET-410, WORK-420, SOCIAL-430, and OPS-440 are compared before commit.
Missing, stale, or mismatched manifests fail closed. No predecessor route,
consumer, Provider, database, Storage, or production adapter is imported.

## Pipeline and flow invariants

Every accepted command advances through:

`VALIDATED → AUTHORIZED → COMMITTED → EVENT_RECORDED → OUTBOX_READY → INBOX_APPLIED`

The fingerprint is canonical SHA-256. A repeated command ID with the same
fingerprint is idempotent; a changed fingerprint is a conflict. Commit/event/
outbox success is never reported as canonical projection success when the
consumer projection fails.

`PUBLIC_WORK_SOCIAL` is public-only, moderation-required, and limited to bounded
Search/Notification references. `MARKET_PURCHASE_CHAIN` is synthetic; payment,
rights, and Provider mutation flags remain false. `DIRECT_WORK_CHAIN` keeps
Social and Market separate and leaves payment/rights mutation false.
`TOOL_ASSET_RUNTIME` exposes only exact asset/package/revision references.
`OPS_PROJECTION` has no private ads or SDK access, allowlisted scalar analytics,
and shadow-only revenue.

Consumer state is keyed by consumer and aggregate. Duplicates are no-ops, stale
events reject, gaps remain pending, retries stop at three before DLQ, and replay
has zero side effects. A replay adapter result with non-zero side effects is
rejected without changing head, shadow, or inbox state.

Rollback stores projection, flag, and consumer shadows only. It validates
snapshot version/hash/current source and never deletes accepted commit, event,
outbox, or inbox identities; compensation is always false in this isolated
reference.

## Privacy and qualification boundary

The recursive scanner rejects unknown/private fields, cycles, depth/count
overflow, JWT/email/secret/private project/commission/DM/payment/purchase/
entitlement/license/royalty/ledger/raw pixel/audio/build data, and never puts
rejected values in diagnostics.

Flags default fail-closed for `OFF`, `UNKNOWN`, and kill switch. Current site
route/bundle connection remains `SITE_CONNECTION_PENDING`; production,
browser/device, Provider, native, Store, deploy, and cutover qualification are
`UNTESTED` or deferred. Existing SITE-400, MARKET-410, WORK-420, SOCIAL-430, and
OPS-440 artifacts are reused by hash and were not modified.
