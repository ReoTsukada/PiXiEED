# Market current baseline — WP-000

調査日: 2026-08-06

対象 commit: `76e01b24c7f4f4ae3b75c0727f1e3612a133d970`

この文書は、現行ソース・migration・Edge Function・テストを読み取って作成した保存用ベースラインである。実際の購入、Storage object、Stripe dashboard、ユーザー行の件数は取得していない。`supabase migration list` は読み取り専用で実行し、migration の適用はしていない。

## Entry points

| Area | Current source | Boundary |
| --- | --- | --- |
| Catalog/listing | `market/index.html`, `market/market.js`, `market/info.js` | Public page; data access is gated through Supabase client/RPC paths. |
| Product detail | `market/item.html`, `market/item.js`, UUID pages under `market/items/` | Public catalog and authenticated purchase boundary. |
| Sell/listing | `market/sell.html`, `market/sell.js`, `market/listing-package-utils.js` | Dev/seller gate, IndexedDB draft/transfer state, private Storage upload boundary. |
| Seller console | `market/seller.html`, `market/seller.js`, `market/access-gate.js` | Authenticated and role-gated UI. |
| Review | `market/review.html`, `market/review.js` | Reviewer/admin boundary; signed preview access is used. |
| Account delivery | `scripts/account-market-purchases.js`, `scripts/market-purchase-delivery.js` | Authenticated purchase history and local import delivery. |
| Server functions | `supabase/functions/market-*`, `supabase/functions/pixfind-ogp-dispatch` | Edge Function boundary; configured function names are inventoried in `supabase-schema-inventory.json`. |

## Current flows

### Listing and product

The sell page accepts current project packages and legacy-compatible extensions through `market/listing-package-utils.js`. Draft/transfer state uses browser IndexedDB (`pixieed-market-listing-drafts` and `pixieed-market-project-transfers`). Listing metadata and asset lineage are persisted by Market RPCs into the `market_asset_series`, `market_assets`, `market_asset_formats`, and related tables. The private source/preview files are referenced through the `market-private` Storage bucket; the bucket is not treated as a public delivery surface.

The catalog/detail pages use current Market RPCs and catalog functions. The complete RPC declaration and client-call inventory, including historical `create or replace` declarations, is in [`supabase-schema-inventory.json`](supabase-schema-inventory.json).

### Purchase and delivery

The source path is:

```text
product detail/account UI
  -> purchase intent / checkout binding RPC
  -> market-create-checkout Edge Function
  -> Stripe Checkout
  -> market-stripe-webhook Edge Function
  -> complete/reverse/cancel/restore purchase RPC
  -> market_purchases + entitlement/royalty records
  -> market-download Edge Function
  -> signed URL from market-private
  -> local delivery/import database
```

Observed purchase-related server names include `market_create_purchase_intent_v1`, `market_bind_stripe_checkout_v1`, `market_complete_stripe_purchase_v1`, `market_reverse_stripe_purchase_v1`, `market_cancel_stripe_checkout_v1`, `market_restore_stripe_purchase_v1`, and `market_materialize_paid_purchase_v1`. These names are source-backed; no live invocation was performed during WP-000.

The browser delivery contract is identified by `pixieed-market-delivery/v1` in `scripts/account-market-purchases.js` and `scripts/market-purchase-delivery.js`. The purchase import database is `pixieed-market-import-v1` with store `imports`.

### Entitlement, license, royalty, and payout

The local schema contains the following current contract areas:

- ownership/purchase: `market_purchases`, `user_entitlements`, `user_entitlement_codes`;
- licensing/lineage: `market_derivative_licenses`, `market_asset_series`, `market_assets`;
- creator accounting: `market_royalty_ledger`, `creator_reward_contents`, `creator_play_reward_allocations`;
- payout: `market_seller_payout_accounts`, `market_payout_batches`, `market_payout_items`, `market_payout_requests`;
- payment audit: `market_payment_events`, `market_download_events`, `market_audit_log`;
- seller/catalog control: `market_seller_profiles`, `market_listing_reviews`, `market_staff_roles`, `market_license_options`.

Payout server paths call the current `market_*_stripe_payout_v1` RPCs and the shared Stripe boundary in `supabase/functions/_shared/market-stripe.ts`. The source records Stripe API version `2025-06-30.basil`; credentials and dashboard configuration are intentionally not recorded here.

## Gates and rollback controls

- `scripts/pixieed-market-access.js` and `market/access-gate.js` expose pending/denied UI states.
- Database-side gates include `market_current_user_is_dev`, `market_current_user_is_reviewer`, `market_current_user_is_admin`, `market_current_user_can_sell`, and `market_listing_is_enabled`.
- The current PiXiEEDraw legacy shared-project flag is unrelated to Market and is documented in the PiXiSYNC baseline.
- No production feature switch was changed by WP-000. A future Market cutover must preserve the existing RPC/Edge/Storage contract until an isolated compatibility test passes.

## Evidence and gaps

Passed source/baseline checks include Market JavaScript syntax checks, `scripts/test-market-seo-pages.mjs`, and the recorded 77-script pure baseline. Fourteen pure baseline failures remain and are recorded as pre-existing contract/test drift in `.codex/PIXIEED_TEST_RESULTS.md`; WP-000 does not silently repair them.

Not verified: live catalog row counts, live purchase/entitlement reconciliation, Storage object counts, Stripe webhook dashboard destinations, payment amounts in production, or a browser checkout with a real account. Those are explicit follow-up evidence items, not assumptions.
