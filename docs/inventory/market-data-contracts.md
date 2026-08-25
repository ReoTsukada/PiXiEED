# Market data contracts — WP-000

調査日: 2026-08-06 / local migration source: 158 SQL files

This document summarizes names that were found in source. The exhaustive line-level declaration and call inventory is [`supabase-schema-inventory.json`](supabase-schema-inventory.json). No table or RPC name below is inferred from a plan.

## Tables

| Contract | Tables observed |
| --- | --- |
| Root/derivative product | `market_asset_series`, `market_assets`, `market_asset_formats`, `market_derivative_licenses` |
| Purchase/ownership | `market_purchases`, `user_entitlements`, `user_entitlement_codes` |
| Seller/review | `market_seller_profiles`, `market_seller_payout_accounts`, `market_listing_reviews`, `market_staff_roles` |
| Payment/payout | `market_payment_events`, `market_payout_batches`, `market_payout_items`, `market_payout_requests`, `market_audit_log` |
| Royalty/reward | `market_royalty_ledger`, `creator_reward_contents`, `creator_play_events`, `creator_play_reward_allocations`, `market_pageview_reward_budgets`, `market_pageview_events`, `market_pageview_reward_runs`, `market_pageview_reward_allocations`, `market_pageview_reward_payout_items` |
| Delivery/discovery | `market_download_events`, `market_asset_favorites`, `market_user_notifications`, `market_want_posts` |
| Access/control | `site_ad_free_grants`, `site_ad_free_grant_audit`, `site_owner_access`, `site_owner_admin_passcode` |

All declarations, schemas, and source lines are machine-readable in `tables.declarations` and `tables.unique_names`.

## RPC and Edge contracts

The current purchase lifecycle has these observed server boundaries:

| Stage | Observed contract |
| --- | --- |
| Listing/create | `market_create_root_asset_v*`, `market_create_derivative_draft_v*`, `market_attach_listing_files`, `market_attach_listing_package` |
| Catalog | `market_public_catalog_v1`, `market_public_asset_v1`, `market_public_seo_catalog_v1`, `market_my_listings_v1` |
| Checkout | `market_create_purchase_intent_v1`, `market_bind_stripe_checkout_v1`, `market_cancel_stripe_checkout_v1` |
| Webhook/reconciliation | `market_claim_payment_event_v1`, `market_finish_payment_event_v1`, `market_complete_stripe_purchase_v1`, `market_reverse_stripe_purchase_v1`, `market_restore_stripe_purchase_v1` |
| Delivery/entitlement | `market_materialize_paid_purchase_v1`, `market_prevent_purchase_after_admin_grant`, `pixieed_grant_purchase_entitlement_by_email`, `pixieed_upsert_purchase_entitlement` |
| Royalty/payout | `market_create_royalty_ledger`, `market_next_stripe_payout_batch_v1`, `market_finalize_stripe_payout_batch_v1`, `market_request_stripe_payout_v1`, `market_prepare_requested_stripe_payout_v1`, `market_complete_requested_stripe_payout_v1` |
| Reward/discovery | `market_record_valid_pageview_v1`, `market_admin_calculate_pageview_rewards_v1`, `market_my_pageview_rewards_v1`, `market_my_reward_dashboard_v1` |

The exhaustive set of 302 client `.rpc()` references and all migration function declaration sites is in `supabase-schema-inventory.json`.

## RLS, Storage, and event contracts

- RLS enable statements, policy names, and source lines are recorded under `row_level_security` and `policies` in the machine-readable inventory.
- Market private uploads/previews use the `market-private` bucket. The bucket is private in the migration that introduces Market private uploads; delivery is via signed URLs from Edge Functions.
- Stripe is reached through the Edge Functions and `supabase/functions/_shared/market-stripe.ts`; the inventory records the source API version but no secret or dashboard value.
- Browser-side delivery uses the `pixieed-market-delivery/v1` contract and writes/imports through `pixieed-market-import-v1`.
- Realtime table additions are inventoried globally. Market notification publication includes `public.market_user_notifications`; it is not the same contract as checkout or delivery.

## Compatibility and unknowns

The current source has historical `create or replace` declarations. A migration or RPC replacement must compare signatures and security behavior, not only a short name. Live RLS behavior, live Storage objects, Stripe event replay state, and production row counts remain unknown in this repository-only baseline.
