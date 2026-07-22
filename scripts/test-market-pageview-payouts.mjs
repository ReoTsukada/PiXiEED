import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260722030849_market_pageview_reward_payouts.sql', 'utf8');
const seller = fs.readFileSync('market/seller.js', 'utf8');
const about = fs.readFileSync('market/about.html', 'utf8');
const docs = fs.readFileSync('docs/inheritance-material-market-system.md', 'utf8');

assert.match(migration, /add column if not exists paid_microyen bigint not null default 0/i);
assert.match(migration, /create table if not exists public\.market_pageview_reward_payout_items/i);
assert.match(migration, /foreign key \(reward_year, reward_month, source_asset_id, recipient_asset_id\)/i);
assert.match(migration, /join public\.market_pageview_reward_runs run[\s\S]*run\.status = 'finalized'/i);
assert.match(migration, /insert into public\.market_pageview_reward_payout_items/i);
assert.match(migration, /update public\.market_pageview_reward_allocations allocation[\s\S]*paid_microyen = allocation\.paid_microyen \+ items\.amount_microyen/i);
assert.match(migration, /revoke all on function public\.market_prepare_requested_stripe_payout_v1\(uuid\) from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.market_prepare_requested_stripe_payout_v1\(uuid\) to service_role/i);
assert.match(seller, /market_quote_stripe_payout_v1/);
assert.match(seller, /販売・継承・表示報酬/);
assert.match(about, /継承ロイヤリティと合算して同じStripe出金残高へ加わります/);
assert.match(docs, /月次確定済み表示報酬の合計が5,000円以上/);

console.log('market pageview payout wiring checks passed');
