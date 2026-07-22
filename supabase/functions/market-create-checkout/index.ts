import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient,
  errorMessage,
  jsonResponse,
  readJson,
  requireMarketUser,
  siteUrl,
  stringValue,
  stripeRequest,
} from "../_shared/market-stripe.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);

  try {
    const { client, user } = await requireMarketUser(request);
    const body = await readJson(request);
    const assetId = stringValue(body.asset_id);
    if (!UUID_PATTERN.test(assetId)) return jsonResponse(request, { ok: false, error: "商品を特定できません。" }, 400);

    const admin = createAdminClient();
    const { data: ownedPurchase, error: ownedError } = await admin
      .from("market_purchases")
      .select("id,status")
      .eq("buyer_user_id", user.id)
      .eq("asset_id", assetId)
      .in("status", ["paid", "granted", "disputed"])
      .maybeSingle();
    if (ownedError) throw ownedError;
    if (ownedPurchase) {
      const message = ownedPurchase.status === "granted"
        ? "この商品は管理者として取得済みです。"
        : "この商品は購入済みです。";
      return jsonResponse(request, { ok: false, error: message }, 409);
    }

    const { data: intent, error: intentError } = await client.rpc("market_create_purchase_intent_v1", {
      input_asset_id: assetId,
    });
    if (intentError) throw intentError;
    const purchaseId = stringValue(intent?.purchase_id);
    const grossAmount = Number(intent?.gross_amount_yen);
    if (!UUID_PATTERN.test(purchaseId) || !Number.isInteger(grossAmount) || grossAmount < 0) {
      throw new Error("購入内容を準備できませんでした");
    }
    if (grossAmount < 500 || grossAmount > 99999999) {
      throw new Error("購入できる金額は500円以上99,999,999円以下です");
    }

    const { data: purchase, error: purchaseError } = await admin
      .from("market_purchases")
      .select("id,buyer_user_id,status,gross_amount_yen,provider_checkout_session_id,expires_at,asset:market_assets!market_purchases_asset_id_fkey(id,title,status,creator_user_id,withdrawn_at)")
      .eq("id", purchaseId)
      .single();
    if (purchaseError) throw purchaseError;
    if (purchase.buyer_user_id !== user.id || purchase.status !== "pending" || Number(purchase.gross_amount_yen) !== grossAmount) {
      throw new Error("購入内容を確認できませんでした");
    }

    const existingSessionId = String(purchase.provider_checkout_session_id || "");
    if (existingSessionId) {
      const existing = await stripeRequest(`/checkout/sessions/${encodeURIComponent(existingSessionId)}`, { method: "GET" });
      if (existing.status === "open" && stringValue(existing.url)) {
        return jsonResponse(request, { ok: true, url: existing.url, purchase_id: purchaseId });
      }
      throw new Error("前回の購入手続きは終了しています。少し待ってからもう一度お試しください。");
    }

    const asset = Array.isArray(purchase.asset) ? purchase.asset[0] : purchase.asset;
    if (!asset || asset.status !== "published" || asset.withdrawn_at) throw new Error("この商品は売り切れました");
    const expiresAt = Math.max(Math.floor(Date.now() / 1000) + 1800, Math.floor(new Date(purchase.expires_at).getTime() / 1000));
    const base = siteUrl();
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("client_reference_id", purchaseId);
    params.set("success_url", `${base}/market/items/${encodeURIComponent(assetId)}/?purchase=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${base}/market/items/${encodeURIComponent(assetId)}/?purchase=cancelled`);
    params.set("expires_at", String(expiresAt));
    params.set("locale", "ja");
    if (user.email) params.set("customer_email", user.email);
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", "jpy");
    params.set("line_items[0][price_data][unit_amount]", String(grossAmount));
    params.set("line_items[0][price_data][product_data][name]", String(asset.title || "PiXiEEDマーケット素材").slice(0, 120));
    params.set("metadata[pixieed_purchase_id]", purchaseId);
    params.set("metadata[pixieed_buyer_user_id]", user.id);
    params.set("metadata[pixieed_asset_id]", assetId);
    params.set("payment_intent_data[metadata][pixieed_purchase_id]", purchaseId);
    params.set("payment_intent_data[metadata][pixieed_buyer_user_id]", user.id);
    params.set("payment_intent_data[metadata][pixieed_asset_id]", assetId);

    const session = await stripeRequest("/checkout/sessions", {
      params,
      idempotencyKey: `market-checkout-${purchaseId}-${expiresAt}`,
    });
    const sessionId = stringValue(session.id);
    const checkoutUrl = stringValue(session.url);
    if (!sessionId || !checkoutUrl) throw new Error("Stripe購入画面を作成できませんでした");

    const { error: bindError } = await admin.rpc("market_bind_stripe_checkout_v1", {
      input_purchase_id: purchaseId,
      input_buyer_user_id: user.id,
      input_checkout_session_id: sessionId,
      input_expires_at: new Date(expiresAt * 1000).toISOString(),
    });
    if (bindError) throw bindError;
    return jsonResponse(request, { ok: true, url: checkoutUrl, purchase_id: purchaseId });
  } catch (error) {
    return jsonResponse(request, { ok: false, error: errorMessage(error, "購入手続きを開始できませんでした") }, 400);
  }
});
