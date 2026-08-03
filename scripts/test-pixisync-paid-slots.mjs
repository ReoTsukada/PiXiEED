import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const [migration, correction, cleanup, checkout, reconcile, webhook, sharedWebhook, marketWebhook, config, html, runtime, minimalUi, legal, terms] = await Promise.all([
  read('supabase/migrations/20260803062126_pixisync_paid_project_slots.sql'),
  read('supabase/migrations/20260803064221_pixisync_localize_room_and_restore_single_base_slot.sql'),
  read('supabase/functions/pixisync-cleanup-localized-room/index.ts'),
  read('supabase/functions/pixisync-create-slot-checkout/index.ts'),
  read('supabase/functions/pixisync-reconcile-slot-purchase/index.ts'),
  read('supabase/functions/pixisync-stripe-webhook/index.ts'),
  read('supabase/functions/_shared/pixisync-slot-webhook.ts'),
  read('supabase/functions/market-stripe-webhook/index.ts'),
  read('supabase/config.toml'),
  read('pixiedraw/index.html'),
  read('pixiedraw/assets/js/modules/pixisync-runtime-adapter-utils.js'),
  read('pixiedraw/assets/js/modules/pixisync-minimal-ui-utils.js'),
  read('legal/index.html'),
  read('terms/index.html'),
]);

for (const contract of [
  /create table collab_v1\.project_slot_entitlements/,
  /create table collab_v1\.project_slot_purchases/,
  /unit_amount_yen integer not null default 100 check \(unit_amount_yen = 100\)/,
  /status in \('pending', 'paid', 'cancelled', 'refunded', 'disputed'\)/,
  /having count\(\*\) > 1/,
  /purchase\.status = 'paid'/,
  /v_allowed_slots := v_included_slots \+ v_purchased_slots/,
  /if v_existing_open >= v_allowed_slots/,
  /hashtextextended\(input_user_id::text, 20260804\)/,
  /create function public\.pixisync_get_project_slot_status\(\)/,
  /grant execute on function public\.pixisync_get_project_slot_status\(\) to authenticated/,
  /grant execute on function public\.pixisync_complete_slot_purchase_v1[\s\S]*?to service_role/,
]) assert.match(migration, contract);
assert.doesNotMatch(migration, /delete from collab_v1\.rooms|update collab_v1\.rooms[\s\S]*?status\s*=/i);

for (const contract of [
  /set included_slots = 1/,
  /check \(included_slots = 1\)/,
  /greatest\(0, v_open - \(1 \+ v_purchased\)\)/,
  /create function public\.pixisync_begin_room_localization/,
  /create function public\.pixisync_ack_room_localized/,
  /create function public\.pixisync_list_owned_open_rooms/,
  /create function public\.pixisync_list_ready_localized_room_cleanups/,
]) assert.match(correction, contract);
assert.doesNotMatch(correction, /included_slots\s*=\s*(?:count|max)/i);
assert.match(cleanup, /collectObjectPaths/);
assert.match(cleanup, /pixisync_finalize_localized_room_cleanup_v1/);

for (const contract of [
  /requireUser\(request\)/,
  /payment_method_types\[0\]", "card"/,
  /unit_amount\]", String\(SLOT_PRICE_YEN\)/,
  /const SLOT_PRICE_YEN = 100/,
  /const MAX_SLOT_QUANTITY = 20/,
  /line_items\[0\]\[quantity\]", String\(quantity\)/,
  /metadata\[pixieed_slot_quantity\]", String\(quantity\)/,
  /metadata\[pixieed_product_key\]", "pixisync_project_slot"/,
  /pixisync_bind_slot_checkout_v1/,
  /existing\.status === "complete" && existing\.payment_status === "paid"/,
  /buyer-retry-reconcile/,
  /success_url.*pixisync_slot_purchase=success/,
]) assert.match(checkout, contract);

for (const contract of [
  /requireUser\(request\)/,
  /session\.payment_status !== "paid"/,
  /parseSlotQuantity\(metadata\.pixieed_slot_quantity\)/,
  /Number\(session\.amount_total\) !== quantity \* 100/,
  /pixisync_complete_slot_purchase_v1/,
  /pixieed_slot_quantity/,
]) assert.match(reconcile, contract);

for (const contract of [
  /verifyStripeWebhook\([\s\S]*?rawBody/,
  /STRIPE_PIXISYNC_WEBHOOK_SECRET/,
  /pixisync_claim_slot_payment_event_v1/,
  /checkout\.session\.completed/,
  /charge\.refunded/,
  /charge\.dispute\.created/,
  /pixisync_reverse_slot_purchase_v1/,
  /pixisync_restore_slot_purchase_v1/,
]) assert.match(webhook, contract);

for (const contract of [
  /metadata\.pixieed_product_key !== "pixisync_project_slot"/,
  /pixisync_claim_slot_payment_event_v1/,
  /pixisync_complete_slot_purchase_v1/,
  /pixisync_reverse_slot_purchase_v1/,
]) assert.match(sharedWebhook, contract);
assert.match(marketWebhook, /handlePixisyncSlotStripeEvent\(request, event\)/);
assert.match(marketWebhook, /if \(pixisyncResponse\) return pixisyncResponse/);

for (const name of [
  'pixisync-create-slot-checkout',
  'pixisync-reconcile-slot-purchase',
  'pixisync-stripe-webhook',
  'pixisync-cleanup-localized-room',
]) assert.match(config, new RegExp(`\\[functions\\.${name}\\]`));
for (const name of [
  'pixisync-create-slot-checkout',
  'pixisync-reconcile-slot-purchase',
  'pixisync-stripe-webhook',
  'pixisync-cleanup-localized-room',
]) assert.match(config, new RegExp(`\\[functions\\.${name}\\]\\nverify_jwt = false`));

for (const id of [
  'pixisyncSlotCard',
  'pixisyncSlotSummary',
  'pixisyncBuySlot',
  'pixisyncSlotPurchaseDialog',
  'pixisyncSlotQuantity',
  'pixisyncSlotTotal',
  'pixisyncSlotPurchaseConfirm',
]) assert.match(html, new RegExp(`id="${id}"`));
assert.match(html, /1枠追加・100円/);
assert.match(html, /Stripeで100円を支払う/);
assert.match(html, /style\.css\?v=20260803-pixisync-start-confirm-safe1/);
assert.match(html, /href="\.\.\/terms\/"/);
assert.match(html, /href="\.\.\/legal\/"/);
assert.match(legal, /PiXiSYNC シェアプロジェクト作成枠：1枠100円（税込・買い切り）/);
assert.match(legal, /原則として直ちにログイン中のアカウントへ付与/);
assert.match(terms, /購入1回につき、購入者のアカウントが同時に作成・保持できる/);
assert.match(terms, /既存のシェアプロジェクトを自動削除せず/);

assert.match(runtime, /getProjectSlotStatus/);
assert.match(runtime, /createProjectSlotCheckout/);
assert.match(runtime, /reconcileProjectSlotPurchase/);
assert.match(runtime, /checkoutUrl\.hostname !== 'checkout\.stripe\.com'/);
assert.match(minimalUi, /consumeSlotPurchaseReturn/);
assert.match(minimalUi, /購入が完了し、作成枠を1枠追加しました/);

console.log('PiXiSYNC paid project slot tests passed');
