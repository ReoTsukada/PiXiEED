import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260718120000_market_pageview_reward_budgets.sql', 'utf8');
const accountHtml = fs.readFileSync('account/index.html', 'utf8');
const accountUi = fs.readFileSync('scripts/account-pageview-reward-budget.js', 'utf8');
const accountCss = fs.readFileSync('account/account.css', 'utf8');
const marketDoc = fs.readFileSync('docs/inheritance-material-market-system.md', 'utf8');

assert.match(migration, /create table if not exists public\.market_pageview_reward_budgets/i);
assert.match(migration, /primary key \(reward_year, reward_month\)/i);
assert.match(migration, /amount_yen bigint[\s\S]*between 0 and 1000000000/i);
assert.match(migration, /market_admin_get_pageview_reward_year_v1/i);
assert.match(migration, /market_admin_set_pageview_reward_year_v1/i);
assert.match(migration, /market_current_user_is_admin\(\)/i);
assert.match(migration, /count\(\*\) from jsonb_object_keys\(input_monthly_amounts\)[\s\S]*<> 12/i);
assert.match(migration, /for v_month in 1\.\.12 loop/i);
assert.match(migration, /pageview_reward_budget_year_updated/i);
assert.match(migration, /revoke all on public\.market_pageview_reward_budgets from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.market_admin_get_pageview_reward_year_v1\(integer\)[\s\S]*to authenticated/i);
assert.match(migration, /grant execute on function public\.market_admin_set_pageview_reward_year_v1\(integer, jsonb\)[\s\S]*to authenticated/i);

assert.match(accountHtml, /id="accountAdminTools"[\s\S]*data-market-admin-only/);
assert.match(accountHtml, /id="pageviewRewardBudgetForm"/);
assert.match(accountHtml, /id="pageviewRewardYear"[^>]*min="2025"[^>]*max="2100"/);
assert.match(accountHtml, /id="pageviewRewardAnnualTotal"/);
assert.match(accountHtml, /閲覧集計・分配・送金は実行しません/);
assert.match(accountHtml, /account-pageview-reward-budget\.js/);

assert.match(accountUi, /for \(let month = 1; month <= 12; month \+= 1\)/);
assert.match(accountUi, /rpc\('market_current_user_is_admin'\)/);
assert.match(accountUi, /rpc\('market_admin_get_pageview_reward_year_v1'/);
assert.match(accountUi, /rpc\('market_admin_set_pageview_reward_year_v1'/);
assert.match(accountUi, /この操作だけでは分配・送金されません/);
assert.match(accountUi, /hasUnsavedChanges/);
assert.match(accountCss, /\.account-reward-budget__months[\s\S]*grid-template-columns: repeat\(3/);
assert.match(accountCss, /@media \(max-width: 680px\)[\s\S]*\.account-reward-budget__months[\s\S]*repeat\(2/);
assert.match(marketDoc, /## ページビュー報酬原資/);
assert.match(marketDoc, /閲覧集計、無効閲覧の除外、作者別配分、残高計上、Stripe送金とは分離/);

console.log('Market page-view reward budget guard passed.');
