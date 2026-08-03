import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient,
  errorMessage,
  jsonResponse,
  requireUser,
  siteUrl,
  stringValue,
  stripeRequest,
} from "../_shared/market-stripe.ts";

const SLOT_PRICE_YEN = 100;

function firstRow(value: unknown): Record<string, unknown> {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object" ? row as Record<string, unknown> : {};
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);

  try {
    const { user } = await requireUser(request);
    const admin = createAdminClient();
    const createIntent = async () => {
      const { data, error } = await admin.rpc("pixisync_create_slot_purchase_intent_v1", {
        input_user_id: user.id,
      });
      if (error) throw error;
      return firstRow(data);
    };

    let intent = await createIntent();
    let purchaseId = stringValue(intent.purchase_id);
    if (!purchaseId) throw new Error("購入内容を準備できませんでした");

    const existingSessionId = stringValue(intent.checkout_session_id);
    if (existingSessionId) {
      const existing = await stripeRequest(
        `/checkout/sessions/${encodeURIComponent(existingSessionId)}?expand[]=payment_intent.latest_charge`,
        { method: "GET" },
      );
      if (existing.status === "open" && stringValue(existing.url)) {
        return jsonResponse(request, { ok: true, url: existing.url, purchase_id: purchaseId });
      }
      if (existing.status === "complete" && existing.payment_status === "paid") {
        const paymentIntent = typeof existing.payment_intent === "string"
          ? await stripeRequest(
            `/payment_intents/${encodeURIComponent(existing.payment_intent)}?expand[]=latest_charge`,
            { method: "GET" },
          )
          : recordValue(existing.payment_intent);
        const { error: completeError } = await admin.rpc("pixisync_complete_slot_purchase_v1", {
          input_purchase_id: purchaseId,
          input_user_id: user.id,
          input_checkout_session_id: existingSessionId,
          input_payment_intent_id: stringValue(paymentIntent.id),
          input_charge_id: stringValue(recordValue(paymentIntent.latest_charge).id),
          input_gross_amount_yen: Number(existing.amount_total),
          input_event_id: "buyer-retry-reconcile",
        });
        if (completeError) throw completeError;
        intent = await createIntent();
        purchaseId = stringValue(intent.purchase_id);
        if (!purchaseId) throw new Error("次の購入内容を準備できませんでした");
      } else {
        const { error: cancelError } = await admin.rpc("pixisync_cancel_slot_checkout_v1", {
          input_checkout_session_id: existingSessionId,
          input_event_id: "",
        });
        if (cancelError) throw cancelError;
        intent = await createIntent();
        purchaseId = stringValue(intent.purchase_id);
        if (!purchaseId) throw new Error("購入内容を再準備できませんでした");
      }
    }

    const expiresAt = Math.max(
      Math.floor(Date.now() / 1000) + 1800,
      Math.floor(new Date(stringValue(intent.expires_at)).getTime() / 1000),
    );
    const base = siteUrl();
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("payment_method_types[0]", "card");
    params.set("client_reference_id", purchaseId);
    params.set("success_url", `${base}/pixiedraw/?pixisync_slot_purchase=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${base}/pixiedraw/?pixisync_slot_purchase=cancelled`);
    params.set("expires_at", String(expiresAt));
    params.set("locale", "ja");
    if (user.email) params.set("customer_email", user.email);
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", "jpy");
    params.set("line_items[0][price_data][unit_amount]", String(SLOT_PRICE_YEN));
    params.set("line_items[0][price_data][product_data][name]", "PiXiSYNC シェアプロジェクト作成枠");
    params.set("line_items[0][price_data][product_data][description]", "買い切りでシェアプロジェクトの同時作成枠を1枠追加します。");
    params.set("metadata[pixieed_product_key]", "pixisync_project_slot");
    params.set("metadata[pixieed_purchase_id]", purchaseId);
    params.set("metadata[pixieed_user_id]", user.id);
    params.set("metadata[pixieed_slot_quantity]", "1");
    params.set("payment_intent_data[metadata][pixieed_product_key]", "pixisync_project_slot");
    params.set("payment_intent_data[metadata][pixieed_purchase_id]", purchaseId);
    params.set("payment_intent_data[metadata][pixieed_user_id]", user.id);

    const session = await stripeRequest("/checkout/sessions", {
      params,
      idempotencyKey: `pixisync-slot-checkout-${purchaseId}`,
    });
    const sessionId = stringValue(session.id);
    const checkoutUrl = stringValue(session.url);
    if (!sessionId || !checkoutUrl) throw new Error("Stripe購入画面を作成できませんでした");

    const { error: bindError } = await admin.rpc("pixisync_bind_slot_checkout_v1", {
      input_purchase_id: purchaseId,
      input_user_id: user.id,
      input_checkout_session_id: sessionId,
      input_expires_at: new Date(expiresAt * 1000).toISOString(),
    });
    if (bindError) throw bindError;
    return jsonResponse(request, { ok: true, url: checkoutUrl, purchase_id: purchaseId });
  } catch (error) {
    return jsonResponse(request, {
      ok: false,
      error: errorMessage(error, "購入手続きを開始できませんでした"),
    }, 400);
  }
});
