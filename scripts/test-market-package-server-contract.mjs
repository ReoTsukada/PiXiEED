import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sell = read('market/sell.js');
const verifier = read('supabase/functions/market-verify-listing-package/index.ts');
const sharedVerifier = read('supabase/functions/_shared/market-package-verifier.ts');
const download = read('supabase/functions/market-download/index.ts');
const migration = read('supabase/migrations/20260824214340_market_package_server_verification.sql');
const capacityMigration = read('supabase/migrations/20260825090000_market_format_capacity.sql');
const singlePriceMigration = read('supabase/migrations/20260721120000_market_single_price_listings.sql');
const baseFormatRegistry = read('supabase/migrations/20260717110000_market_seller_and_asset_verification.sql');
const audioFormatRegistry = read('supabase/migrations/20260824202450_market_audio_product_composition.sql');

assert.match(sell, /market-verify-listing-package/);
assert.ok(sell.indexOf('market-verify-listing-package') < sell.indexOf('market_attach_listing_package'), 'attach must follow server verification');
assert.match(sell, /input_manifest_object_path: verification\.manifest_object_path/);
assert.match(verifier, /verifiedRoot\(/);
assert.match(verifier, /downloadObjectsSequentially\(/);
assert.doesNotMatch(verifier, /Promise\.all\(fileObjectPaths\.map/);
assert.match(verifier, /upsert: false/);
assert.match(verifier, /storage_file_paths: immutableFilePaths/);
assert.match(verifier, /package_verified_by: user\.id/);
assert.match(migration, /add column if not exists package_hash/);
assert.match(migration, /market_capture_package_rights_snapshot/);
assert.match(migration, /server verified package required/);
assert.match(migration, /name not like '%\/verified\/%'/);
assert.match(download, /package_rights_snapshot/);
assert.match(download, /pixieed-market-purchase-rights\/v1/);
assert.match(download, /packageFiles\(asset, hasRightsSnapshot \? rightsSnapshot : null\)/);

const uiFormatSource = sell.match(/const FORMAT_ORDER = \[([\s\S]*?)\];/);
const verifierFormatSource = sharedVerifier.match(/MARKET_PACKAGE_FORMATS = Object\.freeze\(\[([\s\S]*?)\]\)/);
assert.ok(uiFormatSource && verifierFormatSource, 'UI and verifier format registries must remain statically discoverable');
const quotedFormatIds = (source) => Array.from(source.matchAll(/["']([^"']+)["']/g), (match) => match[1]);
const uiFormats = quotedFormatIds(uiFormatSource[1]);
const verifierFormats = quotedFormatIds(verifierFormatSource[1]);
assert.ok(uiFormats.length >= 18, 'the UI format registry must cover the current 18-format contract');
assert.deepEqual([...uiFormats].sort(), [...verifierFormats].sort(), 'UI and Edge verifier format registries must match');
for (const format of uiFormats) {
  const escaped = format.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(`${baseFormatRegistry}\n${audioFormatRegistry}`, new RegExp(`['"]${escaped}['"]`), `${format} must exist in the SQL format registry`);
}

assert.match(capacityMigration, /create or replace function public\.market_create_root_asset_v3/);
assert.match(capacityMigration, /create or replace function public\.market_create_derivative_draft_v4/);
assert.doesNotMatch(capacityMigration, /cardinality\(input_asset_formats\)\s*>\s*6/);
assert.doesNotMatch(capacityMigration, /one to six detected asset formats/);
assert.match(capacityMigration, /formats\.active[\s\S]*allows_external_upload/);
assert.match(singlePriceMigration, /market_create_root_asset_v7\(/);
assert.match(singlePriceMigration, /market_create_derivative_draft_v4\(/);

console.log('market package server contract: OK');
