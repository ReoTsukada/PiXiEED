import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260728063843_reward_point_pool.sql', 'utf8');
const dashboard = fs.readFileSync('scripts/account-dashboard.js', 'utf8');
const account = fs.readFileSync('account/index.html', 'utf8');

assert.match(migration, /creator_play_reward_allocations/);
assert.match(migration, /v_total_views::numeric \* 2 \+ v_total_plays::numeric \* 3/);
assert.match(migration, /r\.view_count::numeric \* 2/);
assert.match(migration, /count\(\*\)::numeric \* 3/);
assert.match(migration, /provisional_microyen/);
assert.match(migration, /provisional_points/);
assert.match(dashboard, /暫定額は、管理者が設定した当月予算を全ポイントで山分け/);
assert.match(account, /ポイント報酬/);
console.log('Market reward point-pool guards passed.');
