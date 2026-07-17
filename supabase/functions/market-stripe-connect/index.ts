import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  createAdminClient,
  errorMessage,
  jsonResponse,
  MARKET_LISTING_ENABLED,
  readJson,
  requireMarketDevUser,
  siteUrl,
  stringValue,
  stripeRequest,
  syncStripeAccount,
} from "../_shared/market-stripe.ts";

serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
  if (request.method !== "POST") return jsonResponse(request, { ok: false, error: "method not allowed" }, 405);
  if (!MARKET_LISTING_ENABLED) {
    return jsonResponse(request, { ok: false, error: "出品・販売者登録は現在準備中です。" }, 503);
  }

  try {
    const { user } = await requireMarketDevUser(request);
    const body = await readJson(request);
    const action = stringValue(body.action) || "onboard";
    const admin = createAdminClient();
    const { data: profile, error: profileError } = await admin
      .from("market_seller_profiles")
      .select("terms_accepted_at,contact_registered_at,mfa_confirmed_at,seller_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.terms_accepted_at || !profile?.contact_registered_at || !profile?.mfa_confirmed_at) {
      return jsonResponse(request, { ok: false, error: "先に販売者情報と二段階認証を完了してください。" }, 409);
    }
    if (profile.seller_status === "disabled") {
      return jsonResponse(request, { ok: false, error: "この販売者アカウントは利用できません。" }, 403);
    }

    const { data: payout, error: payoutError } = await admin
      .from("market_seller_payout_accounts")
      .select("provider_account_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (payoutError) throw payoutError;

    let accountId = String(payout?.provider_account_id || "");
    if (!accountId) {
      const params = new URLSearchParams();
      params.set("country", "JP");
      if (user.email) params.set("email", user.email);
      params.set("business_type", "individual");
      params.set("controller[fees][payer]", "application");
      params.set("controller[losses][payments]", "application");
      params.set("controller[requirement_collection]", "stripe");
      params.set("controller[stripe_dashboard][type]", "express");
      params.set("capabilities[transfers][requested]", "true");
      params.set("metadata[pixieed_user_id]", user.id);
      const account = await stripeRequest("/accounts", {
        params,
        idempotencyKey: `market-connect-account-${user.id}`,
      });
      accountId = stringValue(account.id);
      if (!accountId) throw new Error("Stripe販売者アカウントを作成できませんでした");
      await syncStripeAccount(admin, account);
    }

    const account = await stripeRequest(`/accounts/${encodeURIComponent(accountId)}`, { method: "GET" });
    const status = await syncStripeAccount(admin, account);
    if (action === "status" || status.onboardingStatus === "verified") {
      return jsonResponse(request, { ok: true, ...status });
    }

    const base = siteUrl();
    const linkParams = new URLSearchParams();
    linkParams.set("account", accountId);
    linkParams.set("type", "account_onboarding");
    linkParams.set("collection_options[fields]", "eventually_due");
    linkParams.set("refresh_url", `${base}/market/seller.html?stripe=refresh`);
    linkParams.set("return_url", `${base}/market/seller.html?stripe=return`);
    const accountLink = await stripeRequest("/account_links", { params: linkParams });
    const url = stringValue(accountLink.url);
    if (!url) throw new Error("Stripeの登録画面を開始できませんでした");
    return jsonResponse(request, { ok: true, url, ...status });
  } catch (error) {
    return jsonResponse(request, { ok: false, error: errorMessage(error, "Stripe販売者登録を開始できませんでした") }, 400);
  }
});
