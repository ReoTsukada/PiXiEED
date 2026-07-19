import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = 'supabase/migrations/20260717110000_market_seller_and_asset_verification.sql';
const migration = fs.readFileSync(migrationPath, 'utf8');
const mfaMigration = fs.readFileSync('supabase/migrations/20260717133000_market_free_seller_registration_mfa.sql', 'utf8');
const paidPurchaseMigration = fs.readFileSync('supabase/migrations/20260717143000_market_paid_purchase_entitlements.sql', 'utf8');
const purchaseIntentMigration = fs.readFileSync('supabase/migrations/20260717144000_market_purchase_intents.sql', 'utf8');
const stripeMigration = fs.readFileSync('supabase/migrations/20260717150000_market_stripe_connect_payments.sql', 'utf8');
const checkoutFunction = fs.readFileSync('supabase/functions/market-create-checkout/index.ts', 'utf8');
const webhookFunction = fs.readFileSync('supabase/functions/market-stripe-webhook/index.ts', 'utf8');
const marketUi = fs.readFileSync('market/market.js', 'utf8');
const marketIndexHtml = fs.readFileSync('market/index.html', 'utf8');
const itemUi = fs.readFileSync('market/item.js', 'utf8');
const itemHtml = fs.readFileSync('market/item.html', 'utf8');
const helpHtml = fs.readFileSync('market/help.html', 'utf8');
const helpTips = fs.readFileSync('market/help-tips.js', 'utf8');
const marketCss = fs.readFileSync('market/market.css', 'utf8');
const marketDoc = fs.readFileSync('docs/inheritance-material-market-system.md', 'utf8');
const accountPurchases = fs.readFileSync('scripts/account-market-purchases.js', 'utf8');
const secureDeliveryMigration = fs.readFileSync('supabase/migrations/20260717152000_market_secure_purchase_delivery.sql', 'utf8');
const secureDeliveryFunction = fs.readFileSync('supabase/functions/market-download/index.ts', 'utf8');
const purchaseDelivery = fs.readFileSync('scripts/market-purchase-delivery.js', 'utf8');
const productionImport = fs.readFileSync('pixiedraw/assets/js/modules/open-import-workflow-utils.js', 'utf8');
const devImport = fs.readFileSync('PiXiEEDrawDEV/assets/js/modules/open-import-workflow-utils.js', 'utf8');
const productionImageUtils = fs.readFileSync('pixiedraw/assets/js/modules/image-utils.js', 'utf8');
const devImageUtils = fs.readFileSync('PiXiEEDrawDEV/assets/js/modules/image-utils.js', 'utf8');
const termsHtml = fs.readFileSync('terms/index.html', 'utf8');
const socialMigration = fs.readFileSync('supabase/migrations/20260717153000_market_social_discovery.sql', 'utf8');
const limitedMigration = fs.readFileSync('supabase/migrations/20260717154000_market_limited_sales.sql', 'utf8');
const minimumPriceMigration = fs.readFileSync('supabase/migrations/20260717160000_market_minimum_paid_listing.sql', 'utf8');
const adminGrantMigration = fs.readFileSync('supabase/migrations/20260718090000_market_admin_complimentary_access.sql', 'utf8');
const accountAdminToolsUi = fs.readFileSync('scripts/account-market-admin-tools.js', 'utf8');
const marketAccessUi = fs.readFileSync('scripts/pixieed-market-access.js', 'utf8');
const marketAccessGateUi = fs.readFileSync('market/access-gate.js', 'utf8');
const reviewHtml = fs.readFileSync('market/review.html', 'utf8');
const reviewUi = fs.readFileSync('market/review.js', 'utf8');
const stripeConnectFunction = fs.readFileSync('supabase/functions/market-stripe-connect/index.ts', 'utf8');
const sharedMarketFunction = fs.readFileSync('supabase/functions/_shared/market-stripe.ts', 'utf8');
const accountHtml = fs.readFileSync('account/index.html', 'utf8');
const sharedNav = fs.readFileSync('scripts/shared-bottom-nav.js', 'utf8');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
const favoritesUi = fs.readFileSync('market/favorites.js', 'utf8');
const discoveryUi = fs.readFileSync('market/discovery-utils.js', 'utf8');
const mediaProtection = fs.readFileSync('market/media-protection.js', 'utf8');
const sellUi = fs.readFileSync('market/sell.js', 'utf8');
const sellHtml = fs.readFileSync('market/sell.html', 'utf8');
const listingDeclarationMigration = fs.readFileSync('supabase/migrations/20260718110000_market_listing_legal_ai_declaration.sql', 'utf8');
const privacyHtml = fs.readFileSync('privacy/index.html', 'utf8');
const derivativeEnforcementMigration = fs.readFileSync('supabase/migrations/20260719090000_market_derivative_only_enforcement.sql', 'utf8');
const publicLaunchMigration = fs.readFileSync('supabase/migrations/20260719200000_market_public_launch_custom_options.sql', 'utf8');

const requiredFormats = [
  'pixiedraw-project',
  'png',
  'webp',
  'gif',
  'apng',
  'sprite-sheet-png',
];

requiredFormats.forEach((format) => {
  assert.match(migration, new RegExp(`'${format.replaceAll('-', '\\-')}'`));
});

assert.match(migration, /create table if not exists public\.market_seller_profiles/i);
assert.match(migration, /identity_status = 'verified'/i);
assert.match(migration, /terms_accepted_at is not null/i);
assert.match(migration, /email_confirmed_at is not null/i);
assert.match(migration, /market_current_user_can_sell\(\)/i);
assert.match(migration, /verified seller account required/i);
assert.match(migration, /revoke all on function public\.market_create_root_asset\(/i);
assert.match(migration, /revoke all on function public\.market_create_derivative_draft\(/i);
assert.match(migration, /create or replace function public\.market_create_root_asset_v2\(/i);
assert.match(migration, /create or replace function public\.market_create_derivative_draft_v2\(/i);
assert.match(migration, /create or replace function public\.market_review_listing\(/i);
assert.match(migration, /file_scan_status <> 'clean'/i);
assert.match(migration, /create table if not exists public\.market_audit_log/i);

['PiXiEED形式', '外部形式', '出品審査済み', '販売者確認済み'].forEach((label) => {
  assert.ok(marketUi.includes(label), `market UI is missing verification label: ${label}`);
  assert.ok(marketDoc.includes(label), `market document is missing verification label: ${label}`);
});

assert.match(mfaMigration, /market_current_session_has_mfa\(\)/i);
assert.match(mfaMigration, /'aal2'/i);
assert.match(mfaMigration, /market_submit_seller_registration/i);
assert.match(mfaMigration, /phone_verified', false/i);
assert.match(paidPurchaseMigration, /market_materialize_paid_purchase_v1/i);
assert.match(paidPurchaseMigration, /market_derivative_licenses_purchase_unique/i);
assert.match(paidPurchaseMigration, /v_series\.derivative_sales_allowed/i);
assert.match(paidPurchaseMigration, /perform public\.market_create_royalty_ledger/i);
assert.match(paidPurchaseMigration, /revoke all on function public\.market_materialize_paid_purchase_v1\(uuid\)[\s\S]*from public, anon, authenticated/i);
assert.match(paidPurchaseMigration, /grant execute on function public\.market_materialize_paid_purchase_v1\(uuid\)[\s\S]*to service_role/i);
assert.doesNotMatch(accountPurchases, /派生販売ライセンス/);
assert.match(accountPurchases, /派生出品可能/);
assert.match(purchaseIntentMigration, /market_create_purchase_intent_v1/i);
assert.match(purchaseIntentMigration, /status = 'pending'/i);
assert.match(purchaseIntentMigration, /v_asset\.sale_price_yen/i);
assert.match(purchaseIntentMigration, /creators cannot purchase their own asset/i);
assert.match(purchaseIntentMigration, /market_purchases\.payment_provider is null/i);
assert.match(purchaseIntentMigration, /market_purchases\.provider_payment_id is null/i);
assert.match(purchaseIntentMigration, /revoke all on function public\.market_create_purchase_intent_v1\(uuid\)[\s\S]*from public, anon, authenticated/i);
assert.match(purchaseIntentMigration, /grant execute on function public\.market_create_purchase_intent_v1\(uuid\)[\s\S]*to authenticated/i);
assert.doesNotMatch(purchaseIntentMigration, /status\s*=\s*'paid'/i);
assert.match(itemUi, /functions\.invoke\('market-create-checkout'/);
assert.doesNotMatch(itemUi, /\.rpc\('market_create_purchase_intent_v1'/);
assert.doesNotMatch(itemUi, /status\s*:\s*['"]paid['"]/i);
assert.match(checkoutFunction, /market_create_purchase_intent_v1/);
assert.match(checkoutFunction, /market_bind_stripe_checkout_v1/);
assert.match(checkoutFunction, /\["paid", "granted", "disputed"\]/);
assert.doesNotMatch(checkoutFunction, /market_complete_free_purchase_v1/);
assert.match(checkoutFunction, /grossAmount < 500/);
assert.match(webhookFunction, /verifyStripeWebhook/);
assert.match(webhookFunction, /market_complete_stripe_purchase_v1/);
assert.match(stripeMigration, /grant execute on function public\.market_complete_stripe_purchase_v1[\s\S]*to service_role/i);
assert.match(stripeMigration, /market_assets_stripe_charge_range/i);
assert.match(itemHtml, /id="itemPurchaseStatus"/);
const itemHtmlIds = new Set(Array.from(itemHtml.matchAll(/id="([^"]+)"/g), (match) => match[1]));
const itemElementRefs = Array.from(itemUi.matchAll(/\$\('([^']+)'\)/g), (match) => match[1]);
assert.deepEqual(Array.from(new Set(itemElementRefs.filter((id) => !itemHtmlIds.has(id)))), []);

for (const pagePath of ['market/index.html', 'market/item.html', 'market/about.html', 'market/help.html']) {
  const page = fs.readFileSync(pagePath, 'utf8');
  assert.doesNotMatch(page, /data-pixieed-market-access="pending"/);
  assert.doesNotMatch(page, /dev-gate\.js/);
}

for (const pagePath of ['market/sell.html', 'market/seller.html']) {
  const page = fs.readFileSync(pagePath, 'utf8');
  assert.match(page, /data-pixieed-market-access="pending"/);
  assert.doesNotMatch(page, /data-pixieed-market-write="locked"/);
  assert.match(page, /pixieed-market-access\.js/);
  assert.match(page, /access-gate\.js/);
  assert.match(page, /noindex,nofollow/);
}

assert.match(reviewHtml, /data-pixieed-market-access="pending"/);
assert.doesNotMatch(reviewHtml, /data-pixieed-market-write="locked"/);
assert.match(reviewHtml, /pixieed-market-access\.js/);
assert.match(reviewHtml, /access-gate\.js/);
assert.match(reviewHtml, /noindex,nofollow/);
assert.match(reviewUi, /rpc\('market_current_user_is_admin'\)/);
assert.doesNotMatch(reviewUi, /rpc\('market_current_user_is_reviewer'\)/);

for (const pagePath of ['market/index.html', 'market/item.html', 'market/sell.html', 'market/seller.html', 'market/review.html', 'market/about.html', 'market/help.html']) {
  const page = fs.readFileSync(pagePath, 'utf8');
  if (!page.includes('aria-describedby=')) continue;
  const pageIds = new Set(Array.from(page.matchAll(/id="([^"]+)"/g), (match) => match[1]));
  const describedByIds = Array.from(page.matchAll(/aria-describedby="([^"]+)"/g), (match) => match[1]);
  assert.ok(describedByIds.length > 0, `${pagePath} must include contextual help`);
  assert.deepEqual(
    Array.from(new Set(describedByIds.filter((id) => !pageIds.has(id)))),
    [],
    `${pagePath} contains an unresolved contextual-help description`,
  );
  assert.match(page, /aria-expanded="false"/);
  assert.match(page, /help-tips\.js/);
}

['buyer', 'seller', 'derivative', 'payment', 'faq'].forEach((section) => {
  assert.match(helpHtml, new RegExp(`href="#${section}"`));
  assert.match(helpHtml, new RegExp(`id="${section}"`));
});
assert.match(helpHtml, /market-payment-mock/);
assert.match(helpHtml, /購入者|素材を購入する人/);
assert.match(helpHtml, /元素材を販売する人/);
assert.match(helpHtml, /派生作品を販売する人/);
assert.match(helpTips, /event\.preventDefault\(\)/);
assert.match(helpTips, /event\.key !== 'Escape'/);
assert.match(marketCss, /\.market-help-tip:hover/);
assert.match(marketCss, /\.market-help-tip:focus-within/);
assert.match(marketCss, /\.market-help-tip\.is-open/);

assert.match(secureDeliveryMigration, /create table if not exists public\.market_download_events/i);
assert.match(secureDeliveryMigration, /buyer_user_id = auth\.uid\(\)/i);
assert.match(secureDeliveryMigration, /revoke insert, update, delete[\s\S]*from public, anon, authenticated/i);
assert.match(secureDeliveryFunction, /\.in\("status", \["paid", "granted"\]\)/);
assert.match(secureDeliveryFunction, /FILE_URL_TTL_SECONDS = 60/);
assert.match(secureDeliveryFunction, /MAX_DELIVERIES_PER_HOUR/);
assert.match(secureDeliveryFunction, /createSignedUrl/);
assert.match(secureDeliveryFunction, /storage_file_paths/);
assert.match(secureDeliveryFunction, /storagePaths\[index\]/);
assert.match(secureDeliveryFunction, /ai_training_allowed: false/);
assert.match(secureDeliveryFunction, /PIXIEEDRAW_OPEN_FORMAT_PRIORITY/);
assert.match(secureDeliveryFunction, /availableFiles\.some/);
assert.match(accountPurchases, /functions\.invoke\('market-download'/);
assert.match(accountPurchases, /選択形式をZIPで出力/);
assert.match(accountPurchases, /PiXiEEDrawで開く/);
assert.match(accountPurchases, /const drawButton = createButton\('PiXiEEDrawで開く'/);
assert.match(accountPurchases, /派生作品を出品/);
assert.match(accountPurchases, /source_asset_id=.*derivative_license_id=/);
assert.match(secureDeliveryFunction, /\.select\("id,purchase_id,source_asset_id,status,used_by_asset_id,used_at"\)/);
assert.match(accountPurchases, /SHA-256/);
assert.match(accountPurchases, /管理者取得/);
assert.match(purchaseDelivery, /indexedDB\.open\(TRANSFER_DB/);
assert.match(purchaseDelivery, /buildZipBlob/);
assert.match(productionImport, /maybeImportMarketPurchase/);
assert.match(devImport, /maybeImportMarketPurchase/);
assert.match(productionImport, /openDocumentAsNewProject\(file, \{ source: 'market-purchase' \}\)/);
assert.match(devImport, /openDocumentAsNewProject\(file, \{ source: 'market-purchase' \}\)/);
assert.match(productionImageUtils, /image\/apng/);
assert.match(devImageUtils, /image\/apng/);
assert.match(termsHtml, /購入素材にも第5-2項が適用/);
assert.match(termsHtml, /短時間の出力制限は購入回数や恒久的な再出力回数の上限を意味しません/);
assert.equal(fs.existsSync('market/local-test-products.js'), false);
assert.doesNotMatch(marketIndexHtml, /local-test-products\.js/);
assert.doesNotMatch(itemHtml, /local-test-products\.js/);
assert.doesNotMatch(marketUi, /PiXiEEDMarketLocalTestProducts|local_test/);
assert.doesNotMatch(itemUi, /DEVテスト商品|local_test/);
assert.match(marketUi, /popular-derivatives/);
assert.match(marketUi, /creator_display_name/);
assert.match(marketUi, /derivative_sales_allowed/);
assert.match(itemUi, /itemFavorite/);
assert.match(socialMigration, /create table if not exists public\.market_asset_favorites/i);
assert.match(socialMigration, /market_asset_favorites_read_own/i);
assert.match(socialMigration, /user_id = \(select auth\.uid\(\)\)/i);
assert.match(socialMigration, /creator_display_name/i);
assert.match(socialMigration, /market_set_listing_tags/i);
assert.match(socialMigration, /market_assets_popular_derivative_idx/i);
assert.match(favoritesUi, /market_asset_favorites/);
assert.match(favoritesUi, /PiXiEEDMarketFavorites/);
assert.match(favoritesUi, /button\.innerHTML = `<span aria-hidden="true">/);
assert.doesNotMatch(favoritesUi, /button\.innerHTML[^\n]*<b>/);
assert.match(marketCss, /\.market-favorite-button\s*\{[\s\S]*?background:\s*transparent;/);
assert.match(marketCss, /\.market-favorite-button\s*\{[\s\S]*?border:\s*0;/);
assert.match(discoveryUi, /function filterAndSortAssets/);
assert.match(discoveryUi, /popular-derivatives/);
assert.match(sellUi, /market_set_listing_tags/);
assert.match(sellUi, /tags\.length > MAX_TAGS/);
assert.doesNotMatch(marketUi, /market-card__tags/);
assert.doesNotMatch(itemUi, /itemTags/);
assert.doesNotMatch(accountPurchases, /market-card__tags/);
assert.match(mediaProtection, /contextmenu/);
assert.match(mediaProtection, /dragstart/);
assert.match(mediaProtection, /controlsList\.add\('nodownload'/);
assert.doesNotMatch(`${sellUi}\n${secureDeliveryFunction}\n${accountPurchases}`, /pixieedraw-project/);
assert.match(marketUi, /PiXiEEDraw作品/);
assert.match(marketUi, /market-card__soldout/);
assert.match(itemUi, /label: 'SOLD OUT'/);
assert.match(sellUi, /market_set_listing_limited_sale/);
assert.match(sellUi, /purchasePrice < 500/);
assert.match(sellUi, /purchasePrice < 1000/);
assert.match(limitedMigration, /limited_quantity integer/i);
assert.match(limitedMigration, /limited sale price must be at least 1000 yen/i);
assert.match(limitedMigration, /market_assets_limited_minimum_price/i);
assert.match(limitedMigration, /for update;/i);
assert.match(limitedMigration, /provider_checkout_session_id is not null/i);
assert.match(limitedMigration, /limited asset is sold out/i);
assert.match(limitedMigration, /market_purchases_refresh_limited_sold_count/i);
assert.match(minimumPriceMigration, /market listing price must be at least 500 yen/i);
assert.match(minimumPriceMigration, /market purchase amount must be at least 500 yen/i);
assert.match(minimumPriceMigration, /market_assets_published_minimum_price/i);
assert.match(minimumPriceMigration, /drop function if exists public\.market_complete_free_purchase_v1\(uuid, uuid\)/i);
assert.match(publicLaunchMigration, /market_listing_is_enabled\(\)[\s\S]*select true/i);
assert.match(publicLaunchMigration, /market_current_user_can_sell\(\)[\s\S]*market_current_user_has_confirmed_identity/i);
assert.match(publicLaunchMigration, /drop trigger if exists market_assets_dev_write_gate/i);
assert.match(adminGrantMigration, /market_grant_admin_asset_access_v1/i);
assert.match(adminGrantMigration, /market_current_user_is_admin\(\)/i);
assert.match(adminGrantMigration, /status in \('pending', 'paid', 'granted'/i);
assert.match(adminGrantMigration, /status = 'granted'[\s\S]*payment_provider <> 'admin_grant'/i);
assert.match(adminGrantMigration, /gross_amount_yen[\s\S]*0/i);
assert.match(adminGrantMigration, /counts_as_sale', false/i);
assert.match(adminGrantMigration, /limited_inventory_consumed', false/i);
assert.match(adminGrantMigration, /royalty_ledger_created', false/i);
assert.match(adminGrantMigration, /market_purchases_one_admin_grant_per_buyer_asset/i);
assert.match(adminGrantMigration, /provider_checkout_session_id is not null/i);
assert.match(adminGrantMigration, /market_prevent_purchase_after_admin_grant/i);
assert.doesNotMatch(adminGrantMigration, /perform public\.market_create_royalty_ledger/i);
assert.doesNotMatch(limitedMigration, /status in \([^)]*granted/i);
assert.match(itemUi, /rpc\('market_grant_admin_asset_access_v1'/);
assert.match(itemUi, /管理者として無料取得/);
assert.match(marketAccessUi, /email_confirmed_at/);
assert.doesNotMatch(marketAccessUi, /DEV_EMAIL|emailHash/);
assert.match(marketAccessGateUi, /ログインして利用してください/);
assert.match(sharedMarketFunction, /requireMarketUser/);
assert.match(sharedMarketFunction, /email_confirmed_at/);
assert.doesNotMatch(sharedMarketFunction, /MARKET_DEV_EMAIL_SHA256|emailHash/);
assert.match(checkoutFunction, /requireMarketUser/);
assert.match(secureDeliveryFunction, /requireMarketUser/);
assert.match(stripeConnectFunction, /requireMarketUser/);
assert.match(sharedMarketFunction, /MARKET_LISTING_ENABLED = true/);
assert.match(stripeConnectFunction, /if \(!MARKET_LISTING_ENABLED\)/);
assert.match(publicLaunchMigration, /market_private_upload_own[\s\S]*market_current_user_can_sell\(\)/i);
assert.doesNotMatch(publicLaunchMigration, /market DEV access required/i);
assert.match(publicLaunchMigration, /invalid admin market grant/i);
assert.match(marketIndexHtml, /id="marketSellButton"[^>]*href="sell\.html"/);
assert.match(accountHtml, /id="accountAdminTools"[\s\S]*data-market-admin-only/);
assert.match(accountHtml, /data-market-admin-only[\s\S]*href="\.\.\/market\/review\.html"/);
assert.match(accountHtml, /id="accountSeller"[\s\S]*href="\.\.\/market\/seller\.html"[\s\S]*href="\.\.\/market\/sell\.html"/);
assert.doesNotMatch(accountHtml, /id="account(?:Purchases|Listings|Seller)"[^>]*data-market-dev-only/);
assert.match(accountAdminToolsUi, /rpc\('market_current_user_is_admin'\)/);
assert.match(accountAdminToolsUi, /applyAdminAccess\(!error && isAdmin === true\)/);
assert.doesNotMatch(accountHtml, /マーケットDEV|DEV商品・検索/);
assert.match(sellHtml, /id="listingTermsConfirmed"[^>]*required/);
assert.match(sellHtml, /id="listingPrivacyConfirmed"[^>]*required/);
assert.match(sellHtml, /name="listingAiUsage" value="not-used" required/);
assert.match(sellHtml, /name="listingAiUsage" value="used" required/);
assert.match(sellHtml, /id="listingOptionsSection"/);
assert.match(sellHtml, /id="listingRightsLabel"[^>]*>PiXiEEDの購入素材を元にしていない大元作品/);
assert.match(sellUi, /market_create_root_asset_v6/);
assert.match(sellUi, /input_custom_options/);
assert.match(publicLaunchMigration, /create or replace function public\.market_create_root_asset_v6/i);
assert.match(publicLaunchMigration, /price_yen[\s\S]*between 100 and 10000000/i);
assert.match(sellUi, /market_create_derivative_draft_v4/);
assert.match(sellUi, /market_derivative_listing_context_v1/);
assert.match(sellUi, /\$\('listingOptionsSection'\)\.disabled = true/);
assert.match(accountPurchases, /派生作品を出品/);
assert.match(derivativeEnforcementMigration, /market_root_source_conflicts_with_existing_asset/i);
assert.match(derivativeEnforcementMigration, /existing PiXiEED asset must be listed through its derivative right/i);
assert.match(derivativeEnforcementMigration, /an unused derivative listing right is required/i);
assert.match(derivativeEnforcementMigration, /revoke all on function public\.market_create_root_asset_v4/i);
assert.match(derivativeEnforcementMigration, /revoke all on function public\.market_create_derivative_draft_v2/i);
assert.match(sellUi, /form\.reportValidity\(\)/);
assert.match(sellUi, /input_terms_confirmed/);
assert.match(sellUi, /input_privacy_confirmed/);
assert.match(listingDeclarationMigration, /input_ai_usage_status not in \('used', 'not-used'\)/i);
assert.match(listingDeclarationMigration, /terms and privacy confirmation required/i);
assert.match(listingDeclarationMigration, /legal document version is outdated/i);
assert.match(listingDeclarationMigration, /revoke all on function public\.market_create_root_asset_v3/i);
assert.match(listingDeclarationMigration, /'ai_usage_status', asset\.ai_usage_status/i);
assert.match(reviewUi, /AI使用申告/);
assert.match(reviewUi, /legal_confirmed_at/);
assert.match(termsHtml, /マーケット出品・AI使用申告/);
assert.match(termsHtml, /最終改定日：2026年7月19日/);
assert.match(privacyHtml, /AI使用申告/);
assert.match(privacyHtml, /最終改定日：2026年7月19日/);
assert.match(sharedNav, /key: 'market'[\s\S]*path: 'market\/index\.html'/);
assert.match(sitemap, /pixieed\.jp\/market\//);
assert.match(marketIndexHtml, /href="sell\.html"/);
assert.doesNotMatch(marketIndexHtml, /出品準備中/);
assert.match(marketUi, /PiXiEEDMarketAccess/);
assert.match(marketUi, /rpc\('market_public_catalog_v1'/);
assert.doesNotMatch(marketUi, /from\('market_assets'\)/);
assert.match(itemUi, /rpc\('market_public_asset_v1'/);
assert.doesNotMatch(itemUi, /from\('market_assets'\)/);
assert.match(itemUi, /ログインして購入/);

console.log('Market verification guard passed.');
