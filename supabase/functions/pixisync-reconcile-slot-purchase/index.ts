import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient,
  errorMessage,
  JsonRecord,
  jsonResponse,
  readJson,
  requireUser,
  stringValue,
  stripeRequest,
} from "../_shared/market-stripe.ts";

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" ? value as JsonRecord : {};
}

function parseSlotQuantity(value: unknown): number {
  const quantity = Number(value ?? 1);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) {
    throw new Error("Stripe決済の購入数を確認できません。");
  }
  return quantity;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);

  try {
    const { user } = await requireUser(request);
    const body = await readJson(request);
    const sessionId = stringValue(body.session_id);
    if (!/^cs_(?:test|live)_[A-Za-z0-9_]+$/.test(sessionId)) {
      return jsonResponse(request, { ok: false, error: "決済情報を確認できません。" }, 400);
    }

    const session = await stripeRequest(
      `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent.latest_charge`,
      { method: "GET" },
    );
    const metadata = recordValue(session.metadata);
    const quantity = parseSlotQuantity(metadata.pixieed_slot_quantity);
    const purchaseId = stringValue(metadata.pixieed_purchase_id) || stringValue(session.client_reference_id);
    if (
      metadata.pixieed_product_key !== "pixisync_project_slot"
      || stringValue(metadata.pixieed_user_id) !== user.id
      || session.mode !== "payment"
      || session.payment_status !== "paid"
      || Number(session.amount_total) !== quantity * 100
      || !purchaseId
    ) {
      throw new Error("Stripe決済内容が作成枠の購入と一致しません");
    }

    const paymentIntent = typeof session.payment_intent === "string"
      ? await stripeRequest(`/payment_intents/${encodeURIComponent(session.payment_intent)}?expand[]=latest_charge`, { method: "GET" })
      : recordValue(session.payment_intent);
    const paymentIntentId = stringValue(paymentIntent.id);
    const charge = recordValue(paymentIntent.latest_charge);
    const admin = createAdminClient();
    const { error } = await admin.rpc("pixisync_complete_slot_purchase_v1", {
      input_purchase_id: purchaseId,
      input_user_id: user.id,
      input_checkout_session_id: sessionId,
      input_payment_intent_id: paymentIntentId,
      input_charge_id: stringValue(charge.id),
      input_gross_amount_yen: Number(session.amount_total),
      input_event_id: "buyer-reconcile",
    });
    if (error) throw error;
    return jsonResponse(request, { ok: true, purchase_id: purchaseId });
  } catch (error) {
    return jsonResponse(request, {
      ok: false,
      error: errorMessage(error, "決済の確認を完了できませんでした"),
    }, 400);
  }
});
