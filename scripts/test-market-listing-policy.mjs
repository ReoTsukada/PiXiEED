import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const contractSource = fs.readFileSync('market/listing-contracts.js', 'utf8');
const module = { exports: {} };
vm.runInNewContext(contractSource, { module, globalThis: {} });
const contract = module.exports;

assert.equal(contract.normalizePrice(0), 0);
assert.equal(contract.normalizePrice(499), 500);
assert.equal(contract.normalizePrice(501), 600);

const showcase = contract.buildListingPolicy({
  mode: contract.MODES.SHOWCASE,
  priceYen: 500,
  usePreset: contract.USE_PRESETS.USE_IN_WORK,
  limited: true,
  ownerAccountId: 'owner-1',
  participants: [{ accountId: 'pixel-editor', explicit: false, accepted: false }]
});
assert.equal(showcase.acquisitionEnabled, false);
assert.equal(showcase.priceYen, 0);
assert.equal(showcase.limited.enabled, false);
assert.equal(JSON.stringify(showcase.participants.map((participant) => participant.accountId)), JSON.stringify(['owner-1']));
assert.equal(JSON.stringify(contract.validateListingPolicy(showcase)), JSON.stringify([]));

const derived = contract.buildListingPolicy({
  mode: contract.MODES.ACQUIRE,
  priceYen: 1200,
  usePreset: contract.USE_PRESETS.MODIFY_AND_DERIVE,
  limited: true,
  limitedQuantity: 10,
  ownerAccountId: 'owner-1',
  participants: [
    { accountId: 'creator-2', displayName: '共同制作者', explicit: true, accepted: true, revenueShareBps: 2500 },
    { accountId: 'unknown-editor', explicit: false, accepted: true }
  ]
});
assert.equal(derived.derivativeSalesAllowed, true);
assert.equal(derived.limited.enabled, true);
assert.equal(JSON.stringify(derived.participants.map((participant) => participant.accountId)), JSON.stringify(['owner-1', 'creator-2']));
assert.equal(JSON.stringify(contract.validateListingPolicy(derived)), JSON.stringify([]));

const sellHtml = fs.readFileSync('market/sell.html', 'utf8');
const sellJs = fs.readFileSync('market/sell.js', 'utf8');
const itemJs = fs.readFileSync('market/item.js', 'utf8');
const marketJs = fs.readFileSync('market/market.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260910102735_simplify_market_listing_policy.sql', 'utf8');

for (const id of [
  'listingSimplePolicy', 'listingAcquisitionShowcase', 'listingAcquisitionEnabled',
  'listingAcquisitionFields', 'listingPrice', 'listingUsePreset',
  'listingSimpleLimitedEnabled', 'listingSimpleLimitedQuantity', 'listingParticipantList',
  'listingPolicySummary'
]) assert.match(sellHtml, new RegExp(`id="${id}"`));
assert.match(sellHtml, /listing-contracts\.js/);
assert.match(sellHtml, /id="listingOptionsSection"[^>]*hidden/);
assert.match(sellJs, /listing_policy: listingPolicy/);
assert.match(sellJs, /normalizedListingPrice/);
assert.match(itemJs, /acquisition_enabled !== false/);
assert.match(marketJs, /閲覧のみ・取得不可/);
assert.match(migration, /add column if not exists acquisition_enabled boolean/i);
assert.match(migration, /market_reject_showcase_acquisition_v1/);
assert.match(migration, /free_acquisition_available', asset\.acquisition_enabled and asset\.sale_price_yen = 0/);

console.log('market listing policy contract: PASS');
