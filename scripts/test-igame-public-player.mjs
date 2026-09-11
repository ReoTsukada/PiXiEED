import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const playerHtml = read('pixiedraw2/igame-player.html');
const routeHtml = read('igame/index.html');
const playerBundle = read('pixiedraw2/dist/igame-player.js');
const bootstrap = read('supabase/functions/igame-player-bootstrap/index.ts');
const verifier = read('supabase/functions/_shared/market-package-verifier.ts');
const marketVerify = read('supabase/functions/market-verify-listing-package/index.ts');
const sell = read('market/sell.js');
const draw2Entry = read('pixiedraw2/src/draw2-entry.ts');
const migration = read('supabase/migrations/20260911004130_igame_player_market_contract.sql');
const config = read('supabase/config.toml');

assert.match(routeHtml, /pixiedraw2\/igame-player\.html/u);
assert.match(routeHtml, /target\.search = window\.location\.search/u);
assert.match(playerHtml, /pixieed-account-supabase-client\.js/u);
assert.match(playerHtml, /dist\/igame-player\.js\?v=20260911-igame-public-player-v1/u);
assert.match(playerBundle, /igame-player-bootstrap/u);
assert.match(playerBundle, /credentials: "omit"/u);
assert.match(bootstrap, /market_asset_entitlements/u);
assert.match(bootstrap, /game\.play/u);
assert.match(bootstrap, /storage_file_paths/u);
assert.match(bootstrap, /createSignedUrl/u);
assert.match(bootstrap, /serverVerifiedGameModule/u);
assert.match(verifier, /gameProjectIds/u);
assert.match(marketVerify, /IGAME_PRODUCT_MISMATCH/u);
assert.match(marketVerify, /game_project_ids/u);
assert.match(sell, /igame_product/u);
assert.match(draw2Entry, /igameProduct/u);
assert.match(migration, /pixieed-igame-product\/v1/u);
assert.match(migration, /market_assets_igame_product_contract_check/u);
assert.match(config, /\[functions\.igame-player-bootstrap\]/u);
assert.match(config, /\[functions\.igame-player-bootstrap\][\s\S]*?verify_jwt = true/u);

console.log(JSON.stringify({
  workPackage: 'IGAME-PUBLIC-PLAYER',
  status: 'pass',
  route: '/igame/?product=:productId',
  bootstrap: 'market entitlement + immutable revision + signed PXD URL',
  runtime: 'PXD hash verification + bounded browser runtime',
}, null, 2));
