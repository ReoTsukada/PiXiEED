import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.46.1";
import Stripe from "npm:stripe@17.7.0";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "customer.subscription.updated",
  "customer.subscription.deleted",
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

function isoFromUnix(value: unknown): string {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  return new Date(seconds * 1000).toISOString();
}

function pickSubscriptionId(payload: Stripe.Checkout.Session | Stripe.Invoice | Stripe.Subscription): string {
  const raw = payload && typeof payload === "object" ? (
    "subscription" in payload ? payload.subscription : ""
  ) : "";
  return typeof raw === "string" ? raw.trim() : "";
}

function pickInvoicePeriodEnd(invoice: Stripe.Invoice): string {
  const lines = Array.isArray(invoice.lines?.data) ? invoice.lines.data : [];
  for (const line of lines) {
    const end = isoFromUnix(line?.period?.end);
    if (end) {
      return end;
    }
  }
  return isoFromUnix((invoice as unknown as { period_end?: number }).period_end);
}

function pickSubscriptionPeriodEnd(subscription: Stripe.Subscription): string {
  return isoFromUnix((subscription as unknown as { current_period_end?: number }).current_period_end);
}

async function findPurchaseBySubscriptionId(
  supabase: ReturnType<typeof createClient>,
  subscriptionId: string,
  productKey?: string,
) {
  if (!subscriptionId) {
    return { data: null, error: null };
  }
  let query = supabase
    .from("browser_adfree_purchase_orders")
    .select("id, provider_order_id, product_key, buyer_email, payment_status, code, claimed_by, metadata")
    .contains("metadata", { subscription_id: subscriptionId })
    .order("issued_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (productKey) {
    query = query.eq("product_key", productKey);
  }
  return await query.maybeSingle();
}

async function syncEntitlementWindowByCode(
  supabase: ReturnType<typeof createClient>,
  code: string,
  entitlementKey: string,
  expiresAt: string,
  options: {
    revoke?: boolean;
    buyerEmail?: string;
    orderId?: string;
    subscriptionId?: string;
  } = {},
) {
  if (!code || !entitlementKey) {
    return;
  }
  const nowIso = new Date().toISOString();
  const codeMetadataPatch = {
    buyer_email: options.buyerEmail || "",
    provider_order_id: options.orderId || "",
    subscription_id: options.subscriptionId || "",
    entitlement_key: entitlementKey,
    synced_at: nowIso,
  };
  const { data: codeRow, error: codeLookupError } = await supabase
    .from("user_entitlement_codes")
    .select("code, redeemed_by, metadata")
    .eq("code", code)
    .maybeSingle();
  if (codeLookupError) {
    throw codeLookupError;
  }
  const nextCodeMetadata = {
    ...(codeRow?.metadata && typeof codeRow.metadata === "object" ? codeRow.metadata : {}),
    ...codeMetadataPatch,
  };
  const codeUpdate: Record<string, unknown> = {
    metadata: nextCodeMetadata,
    updated_at: nowIso,
  };
  if (options.revoke) {
    codeUpdate.active = false;
    codeUpdate.expires_at = nowIso;
  } else if (expiresAt) {
    codeUpdate.active = true;
    codeUpdate.expires_at = expiresAt;
  }
  const { error: codeUpdateError } = await supabase
    .from("user_entitlement_codes")
    .update(codeUpdate)
    .eq("code", code);
  if (codeUpdateError) {
    throw codeUpdateError;
  }

  if (!codeRow?.redeemed_by) {
    return;
  }

  const { data: entitlementRow, error: entitlementLookupError } = await supabase
    .from("user_entitlements")
    .select("metadata")
    .eq("user_id", codeRow.redeemed_by)
    .eq("entitlement_key", entitlementKey)
    .maybeSingle();
  if (entitlementLookupError) {
    throw entitlementLookupError;
  }
  const nextEntitlementMetadata = {
    ...(entitlementRow?.metadata && typeof entitlementRow.metadata === "object" ? entitlementRow.metadata : {}),
    ...codeMetadataPatch,
    last_synced_from_subscription_at: nowIso,
  };
  const entitlementUpdate: Record<string, unknown> = {
    metadata: nextEntitlementMetadata,
    updated_at: nowIso,
  };
  if (options.revoke) {
    entitlementUpdate.status = "revoked";
    entitlementUpdate.revoked_at = nowIso;
    entitlementUpdate.expires_at = nowIso;
  } else {
    entitlementUpdate.status = "active";
    entitlementUpdate.revoked_at = null;
    if (expiresAt) {
      entitlementUpdate.expires_at = expiresAt;
    }
  }
  const { error: entitlementUpdateError } = await supabase
    .from("user_entitlements")
    .update(entitlementUpdate)
    .eq("user_id", codeRow.redeemed_by)
    .eq("entitlement_key", entitlementKey);
  if (entitlementUpdateError) {
    throw entitlementUpdateError;
  }
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
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = pickSubscriptionId(invoice);
    if (!subscriptionId) {
      return json({ ok: true, ignored: true, reason: "subscription missing", eventType: event.type });
    }
    const { data: purchase, error: purchaseError } = await findPurchaseBySubscriptionId(supabase, subscriptionId);
    if (purchaseError) {
      return json({ ok: false, error: purchaseError.message }, 500);
    }
    if (!purchase?.code) {
      return json({ ok: true, ignored: true, reason: "purchase missing", eventType: event.type, subscriptionId });
    }
    const entitlementKey = ENTITLEMENT_BY_PRODUCT[purchase.product_key];
    if (!entitlementKey) {
      return json({ ok: true, ignored: true, reason: "product mismatch", eventType: event.type, subscriptionId });
    }
    const expiresAt = pickInvoicePeriodEnd(invoice);
    try {
      await syncEntitlementWindowByCode(supabase, purchase.code, entitlementKey, expiresAt, {
        buyerEmail: purchase.buyer_email,
        orderId: purchase.provider_order_id,
        subscriptionId,
      });
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error || "invoice sync failed") }, 500);
    }
    const purchaseMetadata = {
      ...(purchase.metadata && typeof purchase.metadata === "object" ? purchase.metadata : {}),
      subscription_id: subscriptionId,
      current_period_end: expiresAt,
      last_invoice_paid_at: new Date().toISOString(),
    };
    const { error: purchaseUpdateError } = await supabase
      .from("browser_adfree_purchase_orders")
      .update({
        payment_status: "paid",
        metadata: purchaseMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchase.id);
    if (purchaseUpdateError) {
      return json({ ok: false, error: purchaseUpdateError.message }, 500);
    }
    return json({ ok: true, subscriptionId, eventType: event.type, synced: true });
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const subscriptionId = pickSubscriptionId(subscription);
    if (!subscriptionId) {
      return json({ ok: true, ignored: true, reason: "subscription missing", eventType: event.type });
    }
    const { data: purchase, error: purchaseError } = await findPurchaseBySubscriptionId(supabase, subscriptionId);
    if (purchaseError) {
      return json({ ok: false, error: purchaseError.message }, 500);
    }
    if (!purchase?.code) {
      return json({ ok: true, ignored: true, reason: "purchase missing", eventType: event.type, subscriptionId });
    }
    const entitlementKey = ENTITLEMENT_BY_PRODUCT[purchase.product_key];
    if (!entitlementKey) {
      return json({ ok: true, ignored: true, reason: "product mismatch", eventType: event.type, subscriptionId });
    }
    const subscriptionStatus = String(subscription.status || "").trim().toLowerCase();
    const cancelAtPeriodEnd = Boolean((subscription as unknown as { cancel_at_period_end?: boolean }).cancel_at_period_end);
    const currentPeriodEnd = pickSubscriptionPeriodEnd(subscription);
    const shouldRevokeNow = event.type === "customer.subscription.deleted"
      || ["canceled", "unpaid", "incomplete_expired"].includes(subscriptionStatus);
    try {
      if (shouldRevokeNow) {
        await syncEntitlementWindowByCode(supabase, purchase.code, entitlementKey, currentPeriodEnd, {
          revoke: true,
          buyerEmail: purchase.buyer_email,
          orderId: purchase.provider_order_id,
          subscriptionId,
        });
      } else if (currentPeriodEnd) {
        await syncEntitlementWindowByCode(supabase, purchase.code, entitlementKey, currentPeriodEnd, {
          buyerEmail: purchase.buyer_email,
          orderId: purchase.provider_order_id,
          subscriptionId,
        });
      }
    } catch (error) {
      return json({ ok: false, error: String(error?.message || error || "subscription sync failed") }, 500);
    }
    const purchaseMetadata = {
      ...(purchase.metadata && typeof purchase.metadata === "object" ? purchase.metadata : {}),
      subscription_id: subscriptionId,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      subscription_status: subscriptionStatus,
      last_subscription_event_at: new Date().toISOString(),
    };
    const { error: purchaseUpdateError } = await supabase
      .from("browser_adfree_purchase_orders")
      .update({
        payment_status: shouldRevokeNow ? "cancelled" : purchase.payment_status,
        metadata: purchaseMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", purchase.id);
    if (purchaseUpdateError) {
      return json({ ok: false, error: purchaseUpdateError.message }, 500);
    }
    return json({ ok: true, subscriptionId, eventType: event.type, revoked: shouldRevokeNow });
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
  const subscriptionId = pickSubscriptionId(session);

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
    subscription_id: subscriptionId,
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
          subscription_id: subscriptionId,
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
