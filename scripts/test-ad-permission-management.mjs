import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260718100000_site_ad_free_grants.sql', 'utf8');
const accountHtml = fs.readFileSync('account/index.html', 'utf8');
const accountUi = fs.readFileSync('scripts/account-ad-permissions.js', 'utf8');
const adControl = fs.readFileSync('scripts/ad-account-control.js', 'utf8');
const lazyAds = fs.readFileSync('scripts/ads-lazy.js', 'utf8');
const legacyAds = fs.readFileSync('scripts.js', 'utf8');
const detailsAds = fs.readFileSync('scripts/shared-tab-bar.js', 'utf8');
const productionDraw = fs.readFileSync('pixiedraw/index.html', 'utf8');
const devDraw = fs.readFileSync('PiXiEEDrawDEV/index.html', 'utf8');

assert.match(migration, /create table if not exists public\.site_ad_free_grants/i);
assert.match(migration, /alter table public\.site_ad_free_grants enable row level security/i);
assert.match(migration, /revoke all on public\.site_ad_free_grants from public, anon, authenticated/i);
assert.match(migration, /site_current_user_ad_free\(\)/i);
assert.match(migration, /site_admin_list_ad_free_grants\(\)/i);
assert.match(migration, /site_admin_set_ad_free_by_email[\s\S]*input_enabled boolean/i);
assert.match(migration, /market_current_user_is_admin\(\)/i);
assert.match(migration, /admin self grant is not allowed/i);
assert.match(migration, /site_ad_free_grant_audit/i);
assert.doesNotMatch(migration, /insert into public\.market_staff_roles/i);

assert.match(accountHtml, /id="adFreeGrantForm"/);
assert.match(accountHtml, /id="adFreeGrantList"/);
assert.match(accountHtml, /広告非表示だけを付与/);
assert.match(accountHtml, /account-ad-permissions\.js/);
assert.match(accountUi, /rpc\('site_admin_list_ad_free_grants'\)/);
assert.match(accountUi, /rpc\('site_admin_set_ad_free_by_email'/);
assert.match(accountUi, /rpc\('market_current_user_is_admin'\)/);
assert.match(accountUi, /window\.confirm/);

assert.match(adControl, /rest\/v1\/rpc\/site_current_user_ad_free/);
assert.doesNotMatch(adControl, /rgaydm03|3917bf57/i);
for (const loader of [lazyAds, legacyAds, detailsAds, productionDraw, devDraw]) {
  assert.match(loader, /PiXiEEDAdAccountControl\.loadAdsense/);
}

console.log('Ad permission management guard passed.');
