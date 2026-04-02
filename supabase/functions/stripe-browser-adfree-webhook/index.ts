import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.46.1";
import Stripe from "npm:stripe@17.7.0";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
]);
const PAID_STATUSES = new Set(["paid", "completed", "confirmed", "fulfilled"]);
const ENTITLEMENT_BY_PRODUCT: Record<string, string> = {
  browser_ad_free: "browser_ad_free",
  pixiedraw_ad_free: "pixiedraw_ad_free",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeOrderId(value: string): string {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function generateCodeBody(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let output = "";
  for (let i = 0; i < length; i += 1) {
    output += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return output;
}

async function generateUniqueCode(supabase: ReturnType<typeof createClient>): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `PXA${generateCodeBody(12)}`;
    const { data, error } = await supabase
      .from("user_entitlement_codes")
      .select("code")
      .eq("code", candidate)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (!data?.code) {
      return candidate;
    }
  }
  throw new Error("code generation failed");
}

function pickProductKey(session: Stripe.Checkout.Session): string {
  const metadata = session.metadata || {};
  const productKey = typeof metadata.product_key === "string" ? metadata.product_key.trim() : "";
  return productKey || "browser_ad_free";
}

function pickBuyerEmail(session: Stripe.Checkout.Session): string {
  return normalizeEmail(
    session.customer_details?.email
      || session.customer_email
      || session.metadata?.login_email
      || "",
  );
}

function pickPaymentStatus(eventType: string, session: Stripe.Checkout.Session): string {
  if (eventType === "checkout.session.async_payment_failed") {
    return "failed";
  }
  return String(session.payment_status || session.status || "").trim().toLowerCase();
}

function isPaidEvent(eventType: string, paymentStatus: string): boolean {
  if (eventType === "checkout.session.async_payment_succeeded") {
    return true;
  }
  return PAID_STATUSES.has(paymentStatus);
}

serve(async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const stripeWebhookSecret = Deno.env.get("PIXIEED_STRIPE_WEBHOOK_SECRET") || "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "env missing" }, 500);
  }

  const signature = request.headers.get("stripe-signature") || "";
  if (!signature) {
    return json({ ok: false, error: "signature missing" }, 401);
  }

  const stripe = new Stripe(stripeSecretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  const cryptoProvider = Stripe.createSubtleCryptoProvider();

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      stripeWebhookSecret,
      undefined,
      cryptoProvider,
    );
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error || "invalid signature") }, 401);
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return json({ ok: true, ignored: true, eventType: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const productKey = pickProductKey(session);
  const entitlementKey = ENTITLEMENT_BY_PRODUCT[productKey];
  if (!entitlementKey) {
    return json({ ok: true, ignored: true, reason: "product mismatch", eventType: event.type });
  }

  const orderId = normalizeOrderId(session.id || "");
  const buyerEmail = pickBuyerEmail(session);
  const paymentStatus = pickPaymentStatus(event.type, session);
  if (!orderId || !buyerEmail) {
    return json({ ok: false, error: "session id or buyer email missing" }, 422);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: existingPurchase, error: existingError } = await supabase
    .from("browser_adfree_purchase_orders")
    .select("id, code, payment_status")
    .eq("provider", "stripe")
    .eq("provider_order_id", orderId)
    .eq("product_key", productKey)
    .maybeSingle();
  if (existingError) {
    return json({ ok: false, error: existingError.message }, 500);
  }

  const metadata = {
    source: "stripe_browser_adfree_webhook",
    event_type: event.type,
    payment_link_id: typeof session.payment_link === "string" ? session.payment_link : "",
    payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : "",
    checkout_source: session.metadata?.checkout_source || "",
  };

  if (!isPaidEvent(event.type, paymentStatus)) {
    const { error } = await supabase
      .from("browser_adfree_purchase_orders")
      .upsert({
        provider: "stripe",
        provider_order_id: orderId,
        product_key: productKey,
        buyer_email: buyerEmail,
        payment_status: paymentStatus || "pending",
        raw_payload: event,
        metadata,
      }, {
        onConflict: "provider,provider_order_id,product_key",
      });
    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }
    return json({ ok: true, ignored: true, reason: "not paid", orderId, eventType: event.type });
  }

  let code = typeof existingPurchase?.code === "string" ? existingPurchase.code : "";
  if (!code) {
    try {
      code = await generateUniqueCode(supabase);
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error || "code generation failed") }, 500);
    }
    const durationEnv = productKey === "pixiedraw_ad_free"
      ? "PIXIEED_STRIPE_PIXIEDRAW_ADFREE_DURATION_DAYS"
      : "PIXIEED_BROWSER_ADFREE_DURATION_DAYS";
    const durationDays = Math.max(1, Math.min(3650, Number(Deno.env.get(durationEnv) || "31")));
    const { error: codeError } = await supabase
      .from("user_entitlement_codes")
      .insert({
        code,
        entitlement_key: entitlementKey,
        duration_days: durationDays,
        max_redemptions: 1,
        redemption_count: 0,
        active: true,
        metadata: {
          buyer_email: buyerEmail,
          provider: "stripe",
          provider_order_id: orderId,
          product_key: productKey,
          payment_link_id: metadata.payment_link_id,
          payment_intent_id: metadata.payment_intent_id,
        },
      });
    if (codeError) {
      return json({ ok: false, error: codeError.message }, 500);
    }
  }

  const { error: purchaseError } = await supabase
    .from("browser_adfree_purchase_orders")
    .upsert({
      provider: "stripe",
      provider_order_id: orderId,
      product_key: productKey,
      buyer_email: buyerEmail,
      payment_status: paymentStatus || "paid",
      code,
      issued_at: new Date().toISOString(),
      raw_payload: event,
      metadata,
    }, {
      onConflict: "provider,provider_order_id,product_key",
    });
  if (purchaseError) {
    return json({ ok: false, error: purchaseError.message }, 500);
  }

  return json({
    ok: true,
    orderId,
    codeIssued: true,
    code,
    eventType: event.type,
  });
});
