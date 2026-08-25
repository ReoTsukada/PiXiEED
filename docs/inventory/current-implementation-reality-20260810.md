# Current Implementation Reality Inventory

As of: 2026-08-10
Purpose: Evidence-backed inventory for Core-first planning
Classification: Read-only audit result

## 1. Truth labels

| Label | Meaning |
| --- | --- |
| `IMPLEMENTED_ISOLATED` | Implemented in an isolated/reference boundary; not a production runtime claim. |
| `CONTRACT_ONLY` | Contract/schema/fixture or projection exists; required durable/runtime/provider work is absent. |
| `PRODUCTION_INTEGRATED` | Current production source loads or invokes the path. Live deployment state is a separate question. |
| `UNTESTED` | Required evidence has not been run or is not available. |

## 2. Core and Draw2 reality

| Area | Evidence path | Classification | Reality |
| --- | --- | --- | --- |
| Core Shell | [`core-shell/index.html`](../../core-shell/index.html), [`core-shell/assets/core-shell.js`](../../core-shell/assets/core-shell.js) | `IMPLEMENTED_ISOLATED` | `noindex` preview, default-off routes, unavailable/Coming Later tool states; not current navigation or production shell |
| Shell contracts | [`core-shell/assets/`](../../core-shell/assets) | `IMPLEMENTED_ISOLATED` / `CONTRACT_ONLY` | Registry, bridge, event, search, notification, permission, and route contracts exist; provider/durable boundaries are not production-backed |
| Draw2 entry | [`pixiedraw2/index.html`](../../pixiedraw2/index.html), [`pixiedraw2/src/draw2-entry.ts`](../../pixiedraw2/src/draw2-entry.ts) | `IMPLEMENTED_ISOLATED` | Local-only workspace; does not replace current PixiEEDraw or change current Project data |
| Draw2 generated artifacts | [`pixiedraw2/dist/`](../../pixiedraw2/dist) | `IMPLEMENTED_ISOLATED` | Generated isolated browser artifacts; artifact reproducibility and production qualification remain open |
| Draw2 device/performance | [`docs/contracts/WP-110-FINALIZATION-GATE.md`](../contracts/WP-110-FINALIZATION-GATE.md) | `UNTESTED` | Physical mobile, stylus, Safari/Firefox, long-duration memory, full compositor, large real data, and production compatibility are not qualified |
| Core adapters in production tree | [`pixiedraw/assets/js/modules/core-command-engine-utils.js`](../../pixiedraw/assets/js/modules/core-command-engine-utils.js) and related `core-*.js` files | `IMPLEMENTED_ISOLATED` | Source adapters exist, but current [`pixiedraw/index.html`](../../pixiedraw/index.html) does not load the new adapter set as the authoritative path |
| FP-004 | [`docs/contracts/FP-004-DURABLE-EVENT.md`](../contracts/FP-004-DURABLE-EVENT.md) | `CONTRACT_ONLY` | New contract is the completion target; no durable implementation is claimed |
| FP-005 | No dedicated FP-005 implementation/contract package found | `CONTRACT_ONLY` | Storage/privacy/input hardening is a required future layer |
| FP-006 | No completed Core qualification for Draw2 hot path/device UX | `UNTESTED` | Moved to the Draw2 phase after CORE120 |
| FP-007 | No dedicated FP-007 implementation/contract package found | `CONTRACT_ONLY` | Reproducible schema/dependency/build layer is a required future layer |

## 3. WP-095 and server authority boundary

[`02_ARCHITECTURE/EVENT_ACTIVITY_CORE.md`](../../02_ARCHITECTURE/EVENT_ACTIVITY_CORE.md) defines the
right concepts: post-commit trusted facts, bounded envelopes, producer trust, state-plus-Outbox
boundary, at-least-once delivery, ordering/gaps, retry/DLQ, and projection-only replay.

The implementation at [`core-shell/assets/core-event-activity-contracts.js`](../../core-shell/assets/core-event-activity-contracts.js)
is isolated and uses an in-memory/synthetic adapter. It is not durable and is not evidence for
FP-004. WP-096 Search and WP-097 Notification are likewise isolated projections with no production
provider durability claim.

FP-003Z and FP-003AA provide isolated server-authority/context contracts:

- [`docs/contracts/FP-003Z-SERVER-AUTHORITY-ROOT.md`](../contracts/FP-003Z-SERVER-AUTHORITY-ROOT.md)
- [`docs/contracts/FP-003AA-AUTHENTICATED-SERVER-CONTEXT.md`](../contracts/FP-003AA-AUTHENTICATED-SERVER-CONTEXT.md)

They do not prove production Auth, DB, RLS, Storage, deployment, or migration behavior.

## 4. Product-area reality

| Product area | New Core evidence | Existing production evidence | Classification |
| --- | --- | --- | --- |
| Market | [`pixiedraw2/src/wp210-market-rights-core.ts`](../../pixiedraw2/src/wp210-market-rights-core.ts), [`docs/contracts/WP-210-MARKET-RIGHTS-COMMERCE.md`](../contracts/WP-210-MARKET-RIGHTS-COMMERCE.md) | [`market/`](../../market), [`supabase/functions/market-create-checkout`](../../supabase/functions/market-create-checkout), [`supabase/functions/market-download`](../../supabase/functions/market-download) | New path `CONTRACT_ONLY`; existing path `PRODUCTION_INTEGRATED` at source level |
| Direct Work | [`pixiedraw2/src/wp220-direct-work-core.ts`](../../pixiedraw2/src/wp220-direct-work-core.ts), [`docs/contracts/WP-220-DIRECT-WORK-BILLING.md`](../contracts/WP-220-DIRECT-WORK-BILLING.md) | No new Core production route/provider integration identified | `CONTRACT_ONLY` / `UNTESTED` |
| Social | [`pixiedraw2/src/wp230-sns-core.ts`](../../pixiedraw2/src/wp230-sns-core.ts), [`docs/contracts/WP-230-SNS-COMMUNITY-CREATOR.md`](../contracts/WP-230-SNS-COMMUNITY-CREATOR.md) | [`scripts/social-posts.js`](../../scripts/social-posts.js), [`scripts/home-social-feed.js`](../../scripts/home-social-feed.js), [`supabase/migrations/20260803120000_social_home_feed_and_likes.sql`](../../supabase/migrations/20260803120000_social_home_feed_and_likes.sql) | New path `CONTRACT_ONLY`; existing source path `PRODUCTION_INTEGRATED`; applied/deployed state `UNTESTED` |
| Admin / Analytics / Ads | [`pixiedraw2/src/wp240-admin-analytics-ads-core.ts`](../../pixiedraw2/src/wp240-admin-analytics-ads-core.ts), [`docs/contracts/WP-240-ADMIN-ANALYTICS-ADS-REVENUE.md`](../contracts/WP-240-ADMIN-ANALYTICS-ADS-REVENUE.md) | [`account/admin.html`](../../account/admin.html), [`scripts/account-ad-permissions.js`](../../scripts/account-ad-permissions.js), [`scripts/ads-lazy.js`](../../scripts/ads-lazy.js) | New path `CONTRACT_ONLY`; existing source path `PRODUCTION_INTEGRATED`; live authorization/ad behavior `UNTESTED` |
| Economics | [`pixiedraw2/src/wp250-policy-economics-core.ts`](../../pixiedraw2/src/wp250-policy-economics-core.ts), [`docs/contracts/WP-250-POLICY-ECONOMICS.md`](../contracts/WP-250-POLICY-ECONOMICS.md) | Existing Market reward/royalty/payout functions | New path `CONTRACT_ONLY`; existing finance path separate; ledger/provider qualification `UNTESTED` |
| PiXiSYNC | [`pixiedraw2/src/`](../../pixiedraw2/src), [`pixiedraw/assets/js/modules/`](../../pixiedraw/assets/js/modules) | [`docs/inventory/pixisync-current-baseline.md`](pixisync-current-baseline.md), current production modules/RPCs | New convergence adapter `IMPLEMENTED_ISOLATED`; current transport `PRODUCTION_INTEGRATED` at source level |

The existing production classification is source/runtime integration only. It does not assert
that the current source, database migrations, deployed HTML cache identity, Storage rows, Stripe
webhooks, or live provider state have been verified in this inventory.

## 5. Missing FP-004 through FP-007 artifacts

No dedicated files matching `FP-004` through `FP-007` were found under the contract, architecture,
source, or test inventories at audit time. The implementation state records FP-004 as next/GO but
not started in [`.codex/PIXIEED_IMPLEMENTATION_STATE.yaml`](../../.codex/PIXIEED_IMPLEMENTATION_STATE.yaml).

| Required package | Missing artifacts | Dependency consequence |
| --- | --- | --- |
| FP-004 | Durable transaction adapter, durable Inbox/Outbox schema, provider identity, lease/fencing, consumer idempotency, crash/failure suite | No trustworthy state/event foundation for Finance, Notification, Search, Market, Social, or Direct Work |
| FP-005 | Storage/privacy/input implementation, adversarial payload suite, tenant/RLS/Storage-shaped tests | Durable records and provider payloads cannot be safely accepted |
| FP-007 | Schema registry, compatibility policy, pinned dependency graph, reproducible build manifest, artifact provenance | Source/dist and provider-equivalent results cannot be reproduced or audited |
| CORE100/110/120 | Composition root, adapter conformance, failure injection, qualification evidence | Isolated packages cannot become one qualified Core |

## 6. Verification evidence and limits

Read-only checks performed during the audit:

- `deno task --config pixiedraw2/deno.json check`: passed;
- `deno task --config pixiedraw2/deno.json test`: 18/18 passed;
- WP-020 through WP-070 targeted Core adapter checks: passed;
- JavaScript syntax checks for the inspected Core files: passed;
- `git diff --check`: passed;
- selected WP-110/120/130/140/170/180/190 static checks: passed;
- several WP-080/091-097 harnesses failed because their expected authorization/evaluator shape is
  older than the current contract;
- several WP-100/150/160/200-250 harnesses failed because they expect an old `current_work_package`
  value while the implementation state is now `FP-003AA`.

No browser/device/provider/live-data qualification was performed for this inventory. Historical
test records are evidence of those earlier runs only and are not promoted to current qualification.

## 7. Required next actions

1. Implement and test FP-004 using the contract in [`docs/contracts/FP-004-DURABLE-EVENT.md`](../contracts/FP-004-DURABLE-EVENT.md).
2. Define FP-005 and FP-007 contracts before implementing their provider-equivalent adapters.
3. Build CORE100 composition without changing current production script loading.
4. Align stale harnesses with current AuthorizationProof/evaluator and implementation-state rules.
5. Execute CORE110 failure injection against isolated and production-equivalent adapters.
6. Record CORE120 qualification and only then begin Draw2 FP-006 work.
7. Treat any provider migration, deployment, publication, commit, push, or cutover as a separate
   explicitly authorized task.
