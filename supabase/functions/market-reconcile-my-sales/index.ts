import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient, errorMessage, JsonRecord, jsonResponse, requireMarketUser,
  stringValue, stripeRequest,
} from "../_shared/market-stripe.ts";

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);

  try {
    const { user } = await requireMarketUser(request);
    const admin = createAdminClient();
    const { data: purchases, error: purchaseError } = await admin
      .from("market_purchases")
      .select("id,asset_id,buyer_user_id,status,payment_provider,gross_amount_yen,provider_checkout_session_id,asset:market_assets!inner(creator_user_id)")
      .eq("asset.creator_user_id", user.id)
      .eq("status", "pending")
      .eq("payment_provider", "stripe")
      .not("provider_checkout_session_id", "is", null)
      .order("created_at", { ascending: true })
      .limit(30);
    if (purchaseError) throw purchaseError;

    let reconciled = 0;
    for (const rawPurchase of purchases || []) {
      const purchase = recordValue(rawPurchase);
      const purchaseId = stringValue(purchase.id);
      const assetId = stringValue(purchase.asset_id);
      const buyerUserId = stringValue(purchase.buyer_user_id);
      const checkoutSessionId = stringValue(purchase.provider_checkout_session_id);
      const grossAmount = Number(purchase.gross_amount_yen);
      if (!purchaseId || !assetId || !buyerUserId || !checkoutSessionId || !Number.isInteger(grossAmount)) continue;

      const session = await stripeRequest(
        `/checkout/sessions/${encodeURIComponent(checkoutSessionId)}?expand[]=payment_intent.latest_charge.balance_transaction`,
        { method: "GET" },
      );
      const metadata = recordValue(session.metadata);
      const paymentIntent = recordValue(session.payment_intent);
      const charge = recordValue(paymentIntent.latest_charge);
      const balanceTransaction = recordValue(charge.balance_transaction);
      const processorFee = Number(balanceTransaction.fee);
      const sessionPurchaseId = stringValue(metadata.pixieed_purchase_id) || stringValue(session.client_reference_id);

      if (
        session.mode !== "payment"
        || session.payment_status !== "paid"
        || sessionPurchaseId !== purchaseId
        || stringValue(metadata.pixieed_asset_id) !== assetId
        || stringValue(metadata.pixieed_buyer_user_id) !== buyerUserId
        || Number(session.amount_total) !== grossAmount
        || !stringValue(paymentIntent.id)
        || !stringValue(charge.id)
        || !Number.isInteger(processorFee)
        || processorFee < 0
      ) continue;

      const { error: completeError } = await admin.rpc("market_complete_stripe_purchase_v1", {
        input_purchase_id: purchaseId,
        input_checkout_session_id: checkoutSessionId,
        input_payment_intent_id: stringValue(paymentIntent.id),
        input_charge_id: stringValue(charge.id),
        input_gross_amount_yen: grossAmount,
        input_processor_fee_yen: processorFee,
        input_event_id: `seller-reconcile:${checkoutSessionId}`,
      });
      if (completeError) throw completeError;
      reconciled += 1;
    }
    return jsonResponse(request, { ok: true, checked: (purchases || []).length, reconciled });
  } catch (error) {
    return jsonResponse(request, { ok: false, error: errorMessage(error, "販売済み決済を照合できませんでした") }, 400);
  }
});
