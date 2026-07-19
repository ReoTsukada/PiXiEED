import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260719200000_market_public_launch_custom_options.sql', 'utf8');
const access = fs.readFileSync('scripts/pixieed-market-access.js', 'utf8');
const sharedStripe = fs.readFileSync('supabase/functions/_shared/market-stripe.ts', 'utf8');
const sell = fs.readFileSync('market/sell.js', 'utf8');
const sellHtml = fs.readFileSync('market/sell.html', 'utf8');
const indexHtml = fs.readFileSync('market/index.html', 'utf8');
const itemHtml = fs.readFileSync('market/item.html', 'utf8');

assert.match(migration, /market_listing_is_enabled\(\)[\s\S]*select true/i);
assert.match(migration, /market_current_user_has_confirmed_identity\(\)/i);
assert.match(migration, /drop trigger if exists market_assets_dev_write_gate/i);
assert.doesNotMatch(migration, /market DEV access required/i);
assert.match(access, /email_confirmed_at/);
assert.doesNotMatch(access, /DEV_EMAIL|emailHash/);
assert.match(sharedStripe, /requireMarketUser/);
assert.doesNotMatch(sharedStripe, /requireMarketDevUser|MARKET_DEV_EMAIL/);

assert.equal(fs.existsSync('market/local-test-products.js'), false);
assert.equal(fs.existsSync('market/dev-gate.js'), false);
assert.equal(fs.existsSync('scripts/pixieed-dev-access.js'), false);
assert.doesNotMatch(indexHtml, /local-test-products/);
assert.doesNotMatch(itemHtml, /local-test-products/);

assert.match(sellHtml, /id="listingPreviewSection"[\s\S]*id="listingChangeSummaryField"/);
assert.match(sellHtml, /id="listingTagInput"/);
assert.match(sell, /MAX_TAGS = 5/);
assert.match(sell, /market-tag-chip/);
assert.match(sellHtml, /id="listingCustomOptionPrice"[\s\S]*value="100"/);
assert.match(sell, /input_custom_options/);
assert.match(migration, /create or replace function public\.market_create_root_asset_v6/i);
assert.match(migration, /between 100 and 10000000/i);
assert.match(sellHtml, /id="listingPrice" type="text"[\s\S]*list="listingPricePresets"/);
assert.match(sellHtml, /id="listingLimitedQuantity" type="text"[\s\S]*list="listingQuantityPresets"/);

console.log('market public launch checks passed');
