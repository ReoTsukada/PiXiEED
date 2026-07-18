import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260719100000_market_lineage_pageview_rewards.sql', 'utf8');
const derivativeMigration = fs.readFileSync('supabase/migrations/20260719090000_market_derivative_only_enforcement.sql', 'utf8');
const tracker = fs.readFileSync('market/pageview-rewards.js', 'utf8');
const item = fs.readFileSync('market/item.js', 'utf8');
const itemHtml = fs.readFileSync('market/item.html', 'utf8');
const accountHtml = fs.readFileSync('account/index.html', 'utf8');
const budgetUi = fs.readFileSync('scripts/account-pageview-reward-budget.js', 'utf8');
const rewardUi = fs.readFileSync('scripts/account-pageview-rewards.js', 'utf8');
const marketDoc = fs.readFileSync('docs/inheritance-material-market-system.md', 'utf8');
const terms = fs.readFileSync('terms/index.html', 'utf8');
const privacy = fs.readFileSync('privacy/index.html', 'utf8');

assert.match(migration, /create table if not exists public\.market_pageview_events/i);
assert.match(migration, /unique \(asset_id, view_day, viewer_key_hash\)/i);
assert.match(migration, /dwell_seconds between 10 and 3600/i);
assert.match(migration, /auth\.uid\(\) = v_asset\.creator_user_id/i);
assert.match(migration, /daily-view-limit/i);
assert.match(migration, /market_admin_calculate_pageview_rewards_v1/i);
assert.match(migration, /if not public\.market_current_user_is_admin\(\)/i);
assert.match(migration, /with recursive[\s\S]*ancestors as[\s\S]*descendants as/i);
assert.match(migration, /count\(distinct generation_index\)/i);
assert.match(migration, /works_in_generation/i);
assert.match(migration, /generations\.generation_count::numeric[\s\S]*peers\.works_in_generation::numeric/i);
assert.match(migration, /the reward month can be finalized only after it ends/i);
assert.match(migration, /status = 'finalized'/i);
assert.match(migration, /market_my_pageview_rewards_v1/i);
assert.match(migration, /grant execute on function public\.market_record_valid_pageview_v1[\s\S]*to anon, authenticated/i);
assert.match(derivativeMigration, /the original package cannot be reposted unchanged/i);

assert.match(tracker, /REQUIRED_VISIBLE_SECONDS = 10/);
assert.match(tracker, /document\.visibilityState !== 'visible'/);
assert.match(tracker, /document\.hasFocus\(\)/);
assert.match(tracker, /asset\.local_test === true/);
assert.match(tracker, /market_record_valid_pageview_v1/);
assert.match(item, /PiXiEEDMarketPageviewRewards\?\.track/);
assert.match(itemHtml, /pageview-rewards\.js/);

assert.match(accountHtml, /id="accountPageviewRewards"[^>]*hidden/);
assert.match(accountHtml, /id="pageviewRewardSettlementMonth"/);
assert.match(accountHtml, /id="pageviewRewardCalculate"/);
assert.match(accountHtml, /id="pageviewRewardFinalize"/);
assert.match(budgetUi, /market_admin_calculate_pageview_rewards_v1/);
assert.match(rewardUi, /market_my_pageview_rewards_v1/);

assert.match(marketDoc, /`A → B`は2等分/);
assert.match(marketDoc, /C世代の1枠を3等分/);
assert.match(marketDoc, /画像類似度などから自動推測せず/);
assert.match(terms, /改変・素材再販売OK/);
assert.match(privacy, /匿名閲覧識別子/);
assert.match(privacy, /最終改定日：2026年7月19日/);

function splitByGeneration(total, generations) {
  const generationShare = total / generations.length;
  return generations.flatMap((works) => works.map((work) => [work, generationShare / works.length]));
}
assert.deepEqual(splitByGeneration(120, [['A'], ['B']]), [['A', 60], ['B', 60]]);
assert.deepEqual(splitByGeneration(120, [['A'], ['B'], ['C'], ['D']]), [['A', 30], ['B', 30], ['C', 30], ['D', 30]]);
assert.deepEqual(splitByGeneration(120, [['A'], ['B'], ['C', 'C2', 'C3'], ['D']]), [
  ['A', 30], ['B', 30], ['C', 10], ['C2', 10], ['C3', 10], ['D', 30]
]);

console.log('Market lineage page-view reward guards passed.');
