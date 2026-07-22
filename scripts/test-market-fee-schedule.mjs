import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260722021012_market_progressive_platform_fee.sql', 'utf8');
const about = fs.readFileSync('market/about.html', 'utf8');

const bands = [
  [1000, 0.10], [2000, 0.09], [3000, 0.08], [5000, 0.07], [8000, 0.06],
  [12000, 0.05], [20000, 0.04], [30000, 0.03], [50000, 0.02], [Infinity, 0.01],
];

function progressiveFeeYen(amount) {
  let previous = 0;
  let fee = 0;
  for (const [limit, rate] of bands) {
    fee += Math.max(0, Math.min(amount, limit) - previous) * rate;
    previous = limit;
    if (amount <= limit) break;
  }
  return Math.floor(fee);
}

assert.equal(progressiveFeeYen(500), 50);
assert.equal(progressiveFeeYen(1000), 100);
assert.equal(progressiveFeeYen(3000), 270);
assert.equal(progressiveFeeYen(8000), 590);
assert.equal(progressiveFeeYen(15000), 910);
assert.equal(progressiveFeeYen(30000), 1410);
assert.equal(progressiveFeeYen(50000), 1810);
assert.equal(progressiveFeeYen(100000), 2310);

for (let amount = 500; amount < 100000; amount += 1) {
  assert.ok(progressiveFeeYen(amount + 1) >= progressiveFeeYen(amount), `fee fell at ¥${amount}`);
}

assert.match(migration, /create or replace function public\.market_platform_fee_yen/i);
assert.match(migration, /least\(input_gross_amount_yen, 1000\).*0\.10/is);
assert.match(migration, /least\(input_gross_amount_yen, 50000\).*0\.02/is);
assert.match(migration, /greatest\(input_gross_amount_yen - 50000, 0\).*0\.01/is);
assert.match(about, /販売額の 0\.5%/);
assert.match(about, /残りのPiXiEED手数料の使い道/);
assert.match(about, /継承ロイヤリティ/);
assert.match(about, /表示報酬[\s\S]*表示ロイヤリティ/);
assert.match(about, /前面で10秒以上表示/);
assert.match(about, /継承ロイヤリティと合算して同じStripe出金残高へ加わります/);
assert.match(about, /価格が境界を1円超えても、手数料総額が下がることはありません/);

console.log('market progressive fee schedule checks passed');
