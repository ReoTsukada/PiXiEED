import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient,
  errorMessage,
  JsonRecord,
  jsonResponse,
  readJson,
  requireMarketUser,
  stringValue,
  stripeRequest,
} from "../_shared/market-stripe.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);

  try {
    const { user } = await requireMarketUser(request);
    const assetId = stringValue((await readJson(request)).asset_id);
    if (!UUID_PATTERN.test(assetId)) return jsonResponse(request, { ok: false, error: "商品を特定できません。" }, 400);

    const admin = createAdminClient();
    const { data: purchase, error: purchaseError } = await admin
      .from("market_purchases")
      .select("id,asset_id,buyer_user_id,status,payment_provider,gross_amount_yen,provider_checkout_session_id")
      .eq("asset_id", assetId)
      .eq("buyer_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (purchaseError) throw purchaseError;
    if (!purchase) return jsonResponse(request, { ok: false, error: "照合できる購入手続きがありません。" }, 404);
    if (purchase.status === "paid") {
      const { error: materializeError } = await admin.rpc("market_materialize_paid_purchase_v1", {
        input_purchase_id: purchase.id,
      });
      if (materializeError) throw materializeError;
      return jsonResponse(request, { ok: true, reconciled: false, repaired: true, purchase_id: purchase.id });
    }
    if (purchase.status !== "pending" || purchase.payment_provider !== "stripe") {
      return jsonResponse(request, { ok: false, error: "この購入手続きは照合できない状態です。" }, 409);
    }

    const checkoutSessionId = stringValue(purchase.provider_checkout_session_id);
    if (!checkoutSessionId) return jsonResponse(request, { ok: false, error: "Stripe購入手続きの情報が見つかりません。" }, 409);

    const session = await stripeRequest(
      `/checkout/sessions/${encodeURIComponent(checkoutSessionId)}?expand[]=payment_intent.latest_charge.balance_transaction`,
      { method: "GET" },
    );
    const metadata = recordValue(session.metadata);
    const paymentIntent = recordValue(session.payment_intent);
    const charge = recordValue(paymentIntent.latest_charge);
    const balanceTransaction = recordValue(charge.balance_transaction);
    const sessionPurchaseId = stringValue(metadata.pixieed_purchase_id) || stringValue(session.client_reference_id);
    const grossAmount = Number(session.amount_total);
    const processorFee = Number(balanceTransaction.fee);

    if (
      session.mode !== "payment"
      || session.payment_status !== "paid"
      || sessionPurchaseId !== purchase.id
      || stringValue(metadata.pixieed_asset_id) !== assetId
      || stringValue(metadata.pixieed_buyer_user_id) !== user.id
      || grossAmount !== Number(purchase.gross_amount_yen)
    ) {
      return jsonResponse(request, { ok: false, error: "Stripeの決済内容がPiXiEEDの購入内容と一致しません。" }, 409);
    }

    const paymentIntentId = stringValue(paymentIntent.id);
    const chargeId = stringValue(charge.id);
    if (!paymentIntentId || !chargeId || !Number.isInteger(processorFee) || processorFee < 0) {
      return jsonResponse(request, { ok: false, error: "Stripeの決済手数料を確認できません。少し待ってから再試行してください。" }, 409);
    }

    const { error: completeError } = await admin.rpc("market_complete_stripe_purchase_v1", {
      input_purchase_id: purchase.id,
      input_checkout_session_id: checkoutSessionId,
      input_payment_intent_id: paymentIntentId,
      input_charge_id: chargeId,
      input_gross_amount_yen: grossAmount,
      input_processor_fee_yen: processorFee,
      input_event_id: `reconcile:${checkoutSessionId}`,
    });
    if (completeError) throw completeError;
    return jsonResponse(request, { ok: true, reconciled: true, purchase_id: purchase.id });
  } catch (error) {
    return jsonResponse(request, { ok: false, error: errorMessage(error, "購入済み決済を照合できませんでした") }, 400);
  }
});
