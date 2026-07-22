import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260722031627_market_paid_purchase_ledger_repair.sql', 'utf8');
const reconcile = fs.readFileSync('supabase/functions/market-reconcile-purchase/index.ts', 'utf8');
const item = fs.readFileSync('market/item.js', 'utf8');

assert.match(migration, /if v_purchase\.status = 'paid' then[\s\S]*market_materialize_paid_purchase_v1\(v_purchase\.id\)/i);
assert.match(migration, /not exists \([\s\S]*market_royalty_ledger ledger[\s\S]*ledger\.purchase_id = purchase\.id/i);
assert.match(migration, /join public\.market_assets asset[\s\S]*asset\.status = 'published'/i);
assert.match(migration, /grant execute on function public\.market_complete_stripe_purchase_v1[\s\S]*to service_role/i);
assert.match(reconcile, /purchase\.status === "paid"[\s\S]*market_materialize_paid_purchase_v1/i);
assert.match(item, /existingPurchase\?\.status === 'paid'[\s\S]*reconcilePaidPurchase\(\)/i);

console.log('market paid ledger repair checks passed');
