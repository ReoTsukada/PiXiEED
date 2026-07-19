import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync('account/index.html', 'utf8');
const css = fs.readFileSync('account/account.css', 'utf8');
const dashboard = fs.readFileSync('scripts/account-dashboard.js', 'utf8');
const collections = fs.readFileSync('scripts/account-collections.js', 'utf8');
const listings = fs.readFileSync('scripts/account-market-listings.js', 'utf8');
const pixfindPosts = fs.readFileSync('scripts/account-pixfind-posts.js', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260719170000_market_reward_dashboard.sql', 'utf8');
const listingsMigration = fs.readFileSync('supabase/migrations/20260719180000_market_my_listings.sql', 'utf8');

for (const tab of ['library', 'rewards', 'settings']) {
  assert.match(html, new RegExp(`data-account-tab-target="${tab}"`));
}
assert.doesNotMatch(html, /data-account-tab-target="overview"/);
assert.match(html, /id="accountRewardDashboard"[\s\S]*id="accountSummarySales"[\s\S]*id="accountRewardChart"/);
for (const section of ['accountProjects', 'accountPurchases', 'accountListings', 'accountPixfind']) {
  assert.match(html, new RegExp(`id="${section}"[^>]*data-account-tab="library"[^>]*data-account-collection`));
  assert.doesNotMatch(html, new RegExp(`class="[^"]*account-panel--wide[^"]*" id="${section}"`));
}
assert.equal((html.match(/data-account-collection-toggle/g) || []).length, 4);
assert.match(html, /id="accountRewardChart"/);
assert.match(html, /id="accountRewardChartTable"/);
assert.match(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
assert.match(css, /\.account-grid \{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /@media \(max-width: 980px\)[\s\S]*\.account-grid \{ grid-template-columns: minmax\(0, 1fr\)/);
assert.match(css, /account-summary-grid[\s\S]*grid-auto-rows:\s*1fr/);
assert.match(css, /@media \(max-width: 460px\)[\s\S]*account-summary-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);

assert.match(dashboard, /market_my_reward_dashboard_v1/);
assert.match(dashboard, /devicePixelRatio/);
assert.match(dashboard, /ResizeObserver/);
assert.match(dashboard, /requestAnimationFrame/);
assert.match(dashboard, /pointermove/);
assert.match(dashboard, /activeSeries/);
assert.match(dashboard, /new Set\(\['library', 'rewards', 'settings'\]\)/);
assert.match(collections, /PREVIEW_LIMIT = 4/);
assert.match(collections, /expanded \? '表示を減らす' : '全て見る'/);
assert.match(collections, /navigator\.clipboard/);
assert.match(collections, /document\.execCommand\('copy'\)/);
assert.match(listings, /client\.rpc\('market_my_listings_v1'\)/);
assert.match(listings, /published \? 'リンクをコピー' : '公開後に共有'/);
assert.match(pixfindPosts, /PiXiEEDAccountShare\.copyLink\(puzzleUrl\)/);
assert.match(css, /account-collection-grid\.is-collapsed > :nth-child\(n \+ 5\)/);
assert.match(css, /\.account-collection \{[\s\S]*min-height:\s*520px !important/);
assert.match(css, /\.account-collection \{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0/);
assert.match(css, /\.account-grid \{[\s\S]*justify-items:\s*stretch/);
assert.match(css, /\.account-collection-grid,[\s\S]*repeat\(auto-fill, minmax\(min\(220px, 100%\), 1fr\)\)/);
assert.match(css, /\.account-collection-grid,[\s\S]*overflow:\s*visible/);
assert.doesNotMatch(css, /@media \(max-width: 680px\)[\s\S]*account-market-grid \{ grid-template-columns: repeat\(2/);
assert.match(listingsMigration, /where own\.creator_user_id = v_user_id/);
assert.match(listingsMigration, /asset\.preview_object_path ~ '\^https:\/\/'/);
assert.match(listingsMigration, /grant execute on function public\.market_my_listings_v1\(\) to authenticated/);

assert.match(migration, /ledger\.lineage_depth = 0/);
assert.match(migration, /ledger\.lineage_depth > 0/);
assert.match(migration, /max\(allocation\.source_view_count\)/);
assert.match(migration, /run\.status = 'finalized'/);
assert.match(migration, /ledger\.status <> 'reversed'/);
assert.match(migration, /grant execute on function public\.market_my_reward_dashboard_v1\(integer\)[\s\S]*to authenticated/);

console.log('Account reward dashboard guards passed.');
