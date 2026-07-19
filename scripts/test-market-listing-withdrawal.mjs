import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260719190000_market_listing_withdrawal.sql', 'utf8');
const account = fs.readFileSync('scripts/account-market-listings.js', 'utf8');
const catalog = fs.readFileSync('market/market.js', 'utf8');
const item = fs.readFileSync('market/item.js', 'utf8');
const checkout = fs.readFileSync('supabase/functions/market-create-checkout/index.ts', 'utf8');
const publicVisibility = fs.readFileSync('supabase/migrations/20260720103000_market_hide_sold_out_public_assets.sql', 'utf8');

assert.match(migration, /add column if not exists withdrawn_at timestamptz/);
assert.match(migration, /create or replace function public\.market_withdraw_my_listing_v1/);
assert.match(migration, /active checkout must finish or expire before withdrawal/);
assert.match(migration, /market_create_purchase_intent_v1_before_withdrawal/);
assert.match(migration, /market_grant_admin_asset_access_v1_before_withdrawal/);
assert.match(migration, /market_bind_stripe_checkout_v1_before_withdrawal/);
assert.match(migration, /'lineage_preserved', true/);
assert.match(migration, /'rewards_preserved', true/);
assert.doesNotMatch(migration, /set\s+status\s*=\s*'archived'/i);

assert.match(account, /client\.rpc\('market_withdraw_my_listing_v1'/);
assert.match(account, /購入済みの利用権、派生設定、報酬は維持されます/);
assert.match(catalog, /if \(asset\?\.withdrawn_at\) return true/);
assert.match(item, /if \(asset\?\.withdrawn_at\) return true/);
assert.match(checkout, /asset\.withdrawn_at/);
assert.match(publicVisibility, /asset\.withdrawn_at is null/);
assert.match(publicVisibility, /coalesce\(asset\.limited_sold_count, 0\) < asset\.limited_quantity/);
assert.match(publicVisibility, /market_public_catalog_v1/);
assert.match(publicVisibility, /market_public_asset_v1/);

console.log('market listing withdrawal checks passed');
