import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.46.1";
import Stripe from "npm:stripe@17.7.0";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "invoice.paid",
  "invoice.payment_failed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);
const PAID_STATUSES = new Set(["paid", "completed", "confirmed", "fulfilled"]);
const ENTITLEMENT_BY_PRODUCT: Record<string, string> = {
  browser_ad_free: "browser_ad_free",
  pixiedraw_ad_free: "pixiedraw_ad_free",
  pixieed_support_monthly: "browser_ad_free",
};
const DEFAULT_PURCHASE_HELP_URL = "https://pixieed.jp/pixiedraw/";
type SupabaseAdminClient = any;
type PurchaseCodeEmailRow = {
  id: string;
  provider_order_id: string;
  product_key: string;
  buyer_email: string;
  payment_status: string;
  code: string;
  metadata: Record<string, unknown> | null;
};

type RecoveredStripePurchase = {
  sessionId: string;
  buyerEmail: string;
  productKey: string;
  paymentStatus: string;
  paymentIntentId: string;
  subscriptionId: string;
  createdAt: string;
  rawSession: unknown;
};

function getLinkedEntitlementKeys(productKey: string, primaryEntitlementKey: string): string[] {
  if (String(productKey || "").trim().toLowerCase() !== "pixieed_support_monthly") {
    return [];
  }
  const primary = String(primaryEntitlementKey || "").trim().toLowerCase();
  if (primary === "browser_ad_free") {
    return ["pixiedraw_ad_free"];
  }
  if (primary === "pixiedraw_ad_free") {
    return ["browser_ad_free"];
  }
  return [];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error || fallback);
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

async function generateUniqueCode(supabase: SupabaseAdminClient): Promise<string> {
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

function getPurchaseEmailProductLabel(productKey: string): string {
  if (productKey === "pixiedraw_ad_free") {
    return "PiXiEEDraw継続サポート";
  }
  if (productKey === "pixieed_support_monthly") {
    return "PiXiEED継続サポート";
  }
  return "PiXiEEDサポーター特典";
}

function getProductKeyByPriceId(priceId: string): string {
  const normalized = String(priceId || "").trim();
  if (!normalized) {
    return "";
  }
  const entries: Array<[string, string]> = [
    ["browser_ad_free", Deno.env.get("PIXIEED_STRIPE_BROWSER_ADFREE_PRICE_ID") || ""],
    ["pixiedraw_ad_free", Deno.env.get("PIXIEED_STRIPE_PIXIEDRAW_ADFREE_PRICE_ID") || ""],
    ["pixieed_support_monthly", Deno.env.get("PIXIEED_STRIPE_PIXIEED_SUPPORT_MONTHLY_PRICE_ID") || ""],
  ];
  const matched = entries.find(([, envPriceId]) => envPriceId && envPriceId === normalized);
  return matched?.[0] || "";
}

function getDurationDaysForProduct(productKey: string): number {
  const durationEnv = productKey === "pixiedraw_ad_free"
    ? "PIXIEED_STRIPE_PIXIEDRAW_ADFREE_DURATION_DAYS"
    : "PIXIEED_BROWSER_ADFREE_DURATION_DAYS";
  return Math.max(1, Math.min(3650, Number(Deno.env.get(durationEnv) || "31")));
}

function readStripeSecretKey(): string {
  return Deno.env.get("STRIPE_SECRET_KEY")
    || Deno.env.get("PIXIEED_STRIPE_SECRET_KEY")
    || Deno.env.get("STRIPE_API_KEY")
    || "";
}

async function sendPurchaseCodeEmail({
  buyerEmail,
  orderId,
  productKey,
  code,
}: {
  buyerEmail: string;
  orderId: string;
  productKey: string;
  code: string;
}): Promise<{ sent: boolean; provider?: string; reason?: string }> {
  const apiKey = Deno.env.get("PIXIEED_RESEND_API_KEY") || Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("PIXIEED_PURCHASE_EMAIL_FROM") || Deno.env.get("PIXIEED_SUPPORT_EMAIL_FROM") || "";
  if (!apiKey || !from) {
    return { sent: false, reason: "email env missing" };
  }
  const replyTo = Deno.env.get("PIXIEED_PURCHASE_EMAIL_REPLY_TO") || "";
  const helpUrl = Deno.env.get("PIXIEED_PURCHASE_HELP_URL") || DEFAULT_PURCHASE_HELP_URL;
  const productLabel = getPurchaseEmailProductLabel(productKey);
  const text = [
    "PiXiEEDのサポートありがとうございます。",
    "",
    `対象: ${productLabel}`,
    `シリアルコード: ${code}`,
    `購入番号: ${orderId}`,
    "",
    "PiXiEEDrawのホームまたは設定にある「購入番号 / シリアルコード」欄へ、シリアルコードを入力してください。",
    "シリアルコードは1回だけ使用できます。購入時と違うメールアドレスのアカウントでも、ログイン後に入力できます。",
    "",
    `PiXiEEDraw: ${helpUrl}`,
    "",
    "このメールに心当たりがない場合は、このメールを破棄してください。",
  ].join("\n");
  const body: Record<string, unknown> = {
    from,
    to: [buyerEmail],
    subject: "PiXiEED サポーター特典のシリアルコード",
    text,
  };
  if (replyTo) {
    body.reply_to = replyTo;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    throw new Error(`purchase code email failed (${response.status}) ${responseText}`.trim());
  }
  return { sent: true, provider: "resend" };
}

async function sendMissingPurchaseCodeEmails(
  supabase: SupabaseAdminClient,
  options: { dryRun: boolean; force: boolean; limit: number },
) {
  const { data: rows, error } = await supabase
    .from("browser_adfree_purchase_orders")
    .select("id, provider_order_id, product_key, buyer_email, payment_status, code, metadata")
    .order("created_at", { ascending: true })
    .limit(options.limit);
  if (error) {
    throw error;
  }

  const eligibleProducts = new Set(["browser_ad_free", "pixiedraw_ad_free", "pixieed_support_monthly"]);
  const candidates = (Array.isArray(rows) ? rows : [])
    .map((row) => row as PurchaseCodeEmailRow)
    .filter((row) => {
      const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
      const productKey = String(row.product_key || "").trim();
      const paymentStatus = String(row.payment_status || "").trim().toLowerCase();
      const buyerEmail = normalizeEmail(row.buyer_email || "");
      return eligibleProducts.has(productKey)
        && PAID_STATUSES.has(paymentStatus)
        && buyerEmail
        && String(row.code || "").trim()
        && (options.force || !metadata.serial_code_email_sent_at);
    });

  const productCounts = candidates.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.product_key || "unknown");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      scanned: Array.isArray(rows) ? rows.length : 0,
      eligible: candidates.length,
      sent: 0,
      failed: 0,
      productCounts,
      errors: [],
    };
  }

  let sent = 0;
  let failed = 0;
  const errors: Array<{ id: string; message: string }> = [];
  for (const row of candidates) {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    try {
      const emailResult = await sendPurchaseCodeEmail({
        buyerEmail: normalizeEmail(row.buyer_email || ""),
        orderId: String(row.provider_order_id || ""),
        productKey: String(row.product_key || ""),
        code: String(row.code || "").trim(),
      });
      if (!emailResult.sent) {
        throw new Error(emailResult.reason || "email not sent");
      }
      sent += 1;
      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("browser_adfree_purchase_orders")
        .update({
          metadata: {
            ...metadata,
            serial_code_email_sent_at: nowIso,
            serial_code_email_provider: emailResult.provider || "unknown",
          },
          updated_at: nowIso,
        })
        .eq("id", row.id);
      if (updateError) {
        throw updateError;
      }
    } catch (error) {
      failed += 1;
      const message = errorMessage(error, "purchase code email failed");
      errors.push({ id: row.id, message });
      await supabase
        .from("browser_adfree_purchase_orders")
        .update({
          metadata: {
            ...metadata,
            serial_code_email_error: message,
            serial_code_email_error_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }

  return {
    ok: failed === 0,
    dryRun: false,
    scanned: Array.isArray(rows) ? rows.length : 0,
    eligible: candidates.length,
    sent,
    failed,
    productCounts,
    errors: errors.slice(0, 10),
  };
}

async function resolveCheckoutSessionProductKey(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<string> {
  const metadataProduct = pickProductKey(session);
  if (ENTITLEMENT_BY_PRODUCT[metadataProduct] && session.metadata?.product_key) {
    return metadataProduct;
  }
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
  for (const item of lineItems.data) {
    const priceId = typeof item.price?.id === "string" ? item.price.id : "";
    const productKey = getProductKeyByPriceId(priceId);
    if (productKey) {
      return productKey;
    }
  }
  return "";
}

async function recoverPaidStripeCheckoutPurchases(
  supabase: SupabaseAdminClient,
  stripe: Stripe,
  options: { dryRun: boolean; sendEmails: boolean; limit: number },
) {
  const sessions = await stripe.checkout.sessions.list({ limit: options.limit });
  const recovered: RecoveredStripePurchase[] = [];
  const skipped: Record<string, number> = {};
  for (const session of sessions.data) {
    const paymentStatus = pickPaymentStatus("checkout.session.completed", session);
    if (!PAID_STATUSES.has(paymentStatus)) {
      skipped.notPaid = (skipped.notPaid || 0) + 1;
      continue;
    }
    const productKey = await resolveCheckoutSessionProductKey(stripe, session);
    const entitlementKey = ENTITLEMENT_BY_PRODUCT[productKey];
    if (!productKey || !entitlementKey) {
      skipped.unsupportedProduct = (skipped.unsupportedProduct || 0) + 1;
      continue;
    }
    const sessionId = normalizeOrderId(session.id || "");
    const buyerEmail = pickBuyerEmail(session);
    if (!sessionId || !buyerEmail) {
      skipped.missingIdentity = (skipped.missingIdentity || 0) + 1;
      continue;
    }
    const { data: existingPurchase, error: existingError } = await supabase
      .from("browser_adfree_purchase_orders")
      .select("id, code, metadata")
      .eq("provider", "stripe")
      .eq("provider_order_id", sessionId)
      .eq("product_key", productKey)
      .maybeSingle();
    if (existingError) {
      throw existingError;
    }
    const existingMetadata = existingPurchase?.metadata && typeof existingPurchase.metadata === "object"
      ? existingPurchase.metadata as Record<string, unknown>
      : {};
    if (existingPurchase?.code && existingMetadata.serial_code_email_sent_at) {
      skipped.alreadyEmailed = (skipped.alreadyEmailed || 0) + 1;
      continue;
    }
    recovered.push({
      sessionId,
      buyerEmail,
      productKey,
      paymentStatus,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : "",
      subscriptionId: typeof session.subscription === "string" ? session.subscription : "",
      createdAt: new Date(Number(session.created || 0) * 1000).toISOString(),
      rawSession: session,
    });
  }

  const productCounts = recovered.reduce<Record<string, number>>((acc, row) => {
    acc[row.productKey] = (acc[row.productKey] || 0) + 1;
    return acc;
  }, {});

  if (options.dryRun) {
    return {
      ok: true,
      dryRun: true,
      scanned: sessions.data.length,
      recoverable: recovered.length,
      created: 0,
      emailed: 0,
      failed: 0,
      skipped,
      productCounts,
    };
  }

  let created = 0;
  let emailed = 0;
  let failed = 0;
  const errors: Array<{ sessionId: string; message: string }> = [];
  for (const purchase of recovered) {
    try {
      const { data: existingPurchase, error: existingError } = await supabase
        .from("browser_adfree_purchase_orders")
        .select("id, code, metadata")
        .eq("provider", "stripe")
        .eq("provider_order_id", purchase.sessionId)
        .eq("product_key", purchase.productKey)
        .maybeSingle();
      if (existingError) {
        throw existingError;
      }
      let code = typeof existingPurchase?.code === "string" ? existingPurchase.code : "";
      if (!code) {
        code = await generateUniqueCode(supabase);
        const entitlementKey = ENTITLEMENT_BY_PRODUCT[purchase.productKey];
        const { error: codeError } = await supabase
          .from("user_entitlement_codes")
          .insert({
            code,
            entitlement_key: entitlementKey,
            duration_days: getDurationDaysForProduct(purchase.productKey),
            max_redemptions: 1,
            redemption_count: 0,
            active: true,
            metadata: {
              buyer_email: purchase.buyerEmail,
              provider: "stripe",
              provider_order_id: purchase.sessionId,
              product_key: purchase.productKey,
              payment_intent_id: purchase.paymentIntentId,
              subscription_id: purchase.subscriptionId,
              recovered_from_stripe_at: new Date().toISOString(),
            },
          });
        if (codeError) {
          throw codeError;
        }
      }
      const metadata = {
        ...(existingPurchase?.metadata && typeof existingPurchase.metadata === "object"
          ? existingPurchase.metadata as Record<string, unknown>
          : {}),
        source: "stripe_recovery",
        recovered_from_stripe_at: new Date().toISOString(),
        payment_intent_id: purchase.paymentIntentId,
        subscription_id: purchase.subscriptionId,
      };
      const { data: savedPurchase, error: purchaseError } = await supabase
        .from("browser_adfree_purchase_orders")
        .upsert({
          provider: "stripe",
          provider_order_id: purchase.sessionId,
          product_key: purchase.productKey,
          buyer_email: purchase.buyerEmail,
          payment_status: purchase.paymentStatus,
          code,
          issued_at: purchase.createdAt,
          raw_payload: purchase.rawSession,
          metadata,
        }, {
          onConflict: "provider,provider_order_id,product_key",
        })
        .select("id, metadata")
        .maybeSingle();
      if (purchaseError) {
        throw purchaseError;
      }
      created += existingPurchase?.id ? 0 : 1;
      const savedMetadata: Record<string, unknown> = savedPurchase?.metadata && typeof savedPurchase.metadata === "object"
        ? savedPurchase.metadata as Record<string, unknown>
        : metadata;
      if (options.sendEmails && !savedMetadata.serial_code_email_sent_at) {
        const emailResult = await sendPurchaseCodeEmail({
          buyerEmail: purchase.buyerEmail,
          orderId: purchase.sessionId,
          productKey: purchase.productKey,
          code,
        });
        if (!emailResult.sent) {
          throw new Error(emailResult.reason || "email not sent");
        }
        emailed += 1;
        const nowIso = new Date().toISOString();
        const { error: updateError } = await supabase
          .from("browser_adfree_purchase_orders")
          .update({
            metadata: {
              ...savedMetadata,
              serial_code_email_sent_at: nowIso,
              serial_code_email_provider: emailResult.provider || "unknown",
            },
            updated_at: nowIso,
          })
          .eq("id", savedPurchase.id);
        if (updateError) {
          throw updateError;
        }
      }
    } catch (error) {
      failed += 1;
      errors.push({ sessionId: purchase.sessionId, message: errorMessage(error, "recovery failed") });
    }
  }

  return {
    ok: failed === 0,
    dryRun: false,
    scanned: sessions.data.length,
    recoverable: recovered.length,
    created,
    emailed,
    failed,
    skipped,
    productCounts,
    errors: errors.slice(0, 10),
  };
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
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const directId = "object" in payload && payload.object === "subscription"
    ? (payload as Stripe.Subscription).id
    : "";
  if (typeof directId === "string" && directId.trim()) {
    return directId.trim();
  }
  const raw = "subscription" in payload ? payload.subscription : "";
  if (typeof raw === "string") {
    return raw.trim();
  }
  const expandedId = raw && typeof raw === "object" && "id" in raw ? raw.id : "";
  return typeof expandedId === "string" ? expandedId.trim() : "";
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
  supabase: SupabaseAdminClient,
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

async function grantPurchaseEntitlementByEmail(
  supabase: SupabaseAdminClient,
  {
    code,
    buyerEmail,
    entitlementKey,
    expiresAt,
    orderId,
    subscriptionId,
  }: {
    code: string;
    buyerEmail: string;
    entitlementKey: string;
    expiresAt?: string;
    orderId?: string;
    subscriptionId?: string;
  },
): Promise<{ ok: boolean; userId: string; reason: string; expiresAt: string }> {
  if (!code || !buyerEmail || !entitlementKey) {
    return { ok: false, userId: "", reason: "missing_input", expiresAt: "" };
  }
  const { data, error } = await supabase.rpc("pixieed_grant_purchase_entitlement_by_email", {
    input_code: code,
    input_buyer_email: buyerEmail,
    input_entitlement_key: entitlementKey,
    input_expires_at: expiresAt || null,
    input_order_id: orderId || null,
    input_subscription_id: subscriptionId || null,
  });
  if (error) {
    throw error;
  }
  return {
    ok: data?.ok === true,
    userId: typeof data?.user_id === "string" ? data.user_id : "",
    reason: typeof data?.reason === "string" ? data.reason : "",
    expiresAt: typeof data?.expires_at === "string" ? data.expires_at : "",
  };
}

async function syncEntitlementWindowByCode(
  supabase: SupabaseAdminClient,
  code: string,
  entitlementKey: string,
  expiresAt: string,
  options: {
    revoke?: boolean;
    buyerEmail?: string;
    orderId?: string;
    subscriptionId?: string;
    productKey?: string;
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

  const linkedEntitlementKeys = getLinkedEntitlementKeys(options.productKey || "", entitlementKey);
  for (const linkedEntitlementKey of linkedEntitlementKeys) {
    const linkedMetadataPatch = {
      ...codeMetadataPatch,
      entitlement_key: linkedEntitlementKey,
      linked_primary_entitlement_key: entitlementKey,
      supplemental_for_product_key: options.productKey || "",
      last_synced_from_subscription_at: nowIso,
    };
    const { data: linkedEntitlementRow, error: linkedEntitlementLookupError } = await supabase
      .from("user_entitlements")
      .select("metadata")
      .eq("user_id", codeRow.redeemed_by)
      .eq("entitlement_key", linkedEntitlementKey)
      .maybeSingle();
    if (linkedEntitlementLookupError) {
      throw linkedEntitlementLookupError;
    }
    if (options.revoke && !linkedEntitlementRow) {
      continue;
    }
    const linkedEntitlementMetadata = {
      ...(linkedEntitlementRow?.metadata && typeof linkedEntitlementRow.metadata === "object"
        ? linkedEntitlementRow.metadata
        : {}),
      ...linkedMetadataPatch,
    };
    const linkedEntitlementPayload: Record<string, unknown> = {
      user_id: codeRow.redeemed_by,
      entitlement_key: linkedEntitlementKey,
      source: "purchase_subscription_sync",
      redeemed_code: code,
      metadata: linkedEntitlementMetadata,
      updated_at: nowIso,
    };
    if (options.revoke) {
      linkedEntitlementPayload.status = "revoked";
      linkedEntitlementPayload.revoked_at = nowIso;
      linkedEntitlementPayload.expires_at = nowIso;
    } else {
      linkedEntitlementPayload.status = "active";
      linkedEntitlementPayload.revoked_at = null;
      linkedEntitlementPayload.granted_at = nowIso;
      if (expiresAt) {
        linkedEntitlementPayload.expires_at = expiresAt;
      }
    }
    const { error: linkedEntitlementUpsertError } = await supabase
      .from("user_entitlements")
      .upsert(linkedEntitlementPayload, {
        onConflict: "user_id,entitlement_key",
      });
    if (linkedEntitlementUpsertError) {
      throw linkedEntitlementUpsertError;
    }
  }
}

serve(async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const backfillToken = Deno.env.get("PIXIEED_PURCHASE_CODE_BACKFILL_TOKEN") || "";
  const providedBackfillToken = request.headers.get("x-pixieed-backfill-token") || "";
  if (providedBackfillToken) {
    if (!backfillToken || providedBackfillToken !== backfillToken) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ ok: false, error: "supabase env missing" }, 500);
    }
    const bodyJson = await request.json().catch(() => ({}));
    if (bodyJson?.task !== "send_purchase_code_emails" && bodyJson?.task !== "recover_stripe_purchase_codes") {
      return json({ ok: false, error: "unknown maintenance task" }, 400);
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    try {
      if (bodyJson?.task === "recover_stripe_purchase_codes") {
        const stripeSecretKey = readStripeSecretKey();
        if (!stripeSecretKey) {
          return json({ ok: false, error: "stripe env missing" }, 500);
        }
        const stripe = new Stripe(stripeSecretKey, {
          httpClient: Stripe.createFetchHttpClient(),
        });
        const result = await recoverPaidStripeCheckoutPurchases(supabase, stripe, {
          dryRun: bodyJson?.dryRun !== false,
          sendEmails: bodyJson?.sendEmails === true,
          limit: Math.max(1, Math.min(100, Number(bodyJson?.limit || 100))),
        });
        return json(result, result.ok ? 200 : 207);
      }
      const result = await sendMissingPurchaseCodeEmails(supabase, {
        dryRun: bodyJson?.dryRun !== false,
        force: bodyJson?.force === true,
        limit: Math.max(1, Math.min(1000, Number(bodyJson?.limit || 500))),
      });
      return json(result, result.ok ? 200 : 207);
    } catch (error) {
      return json({ ok: false, error: errorMessage(error, "maintenance task failed") }, 500);
    }
  }

  const stripeSecretKey = readStripeSecretKey();
  const stripeWebhookSecret = Deno.env.get("PIXIEED_STRIPE_WEBHOOK_SECRET") || "";
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
    return json({ ok: false, error: errorMessage(error, "invalid signature") }, 401);
  }

  if (!HANDLED_EVENT_TYPES.has(event.type)) {
    return json({ ok: true, ignored: true, eventType: event.type });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const isPaymentFailed = event.type === "invoice.payment_failed";
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
        revoke: isPaymentFailed,
        buyerEmail: purchase.buyer_email,
        orderId: purchase.provider_order_id,
        subscriptionId,
        productKey: purchase.product_key,
      });
    } catch (error) {
      return json({ ok: false, error: errorMessage(error, "invoice sync failed") }, 500);
    }
    const purchaseMetadata = {
      ...(purchase.metadata && typeof purchase.metadata === "object" ? purchase.metadata : {}),
      subscription_id: subscriptionId,
      current_period_end: expiresAt,
      ...(isPaymentFailed
        ? { last_invoice_payment_failed_at: new Date().toISOString() }
        : { last_invoice_paid_at: new Date().toISOString() }),
    };
    const purchaseUpdate: Record<string, unknown> = {
      payment_status: isPaymentFailed ? "failed" : "paid",
      metadata: purchaseMetadata,
      updated_at: new Date().toISOString(),
    };
    if (!isPaymentFailed && !purchase.claimed_by) {
      try {
        const autoGrant = await grantPurchaseEntitlementByEmail(supabase, {
          code: purchase.code,
          buyerEmail: purchase.buyer_email,
          entitlementKey,
          expiresAt,
          orderId: purchase.provider_order_id,
          subscriptionId,
        });
        if (autoGrant.ok && autoGrant.userId) {
          purchaseUpdate.claimed_by = autoGrant.userId;
          purchaseUpdate.claimed_at = new Date().toISOString();
          purchaseMetadata.auto_entitlement_granted_at = new Date().toISOString();
          purchaseMetadata.auto_entitlement_user_id = autoGrant.userId;
        } else if (autoGrant.reason) {
          purchaseMetadata.auto_entitlement_grant_skipped = autoGrant.reason;
        }
      } catch (error) {
        purchaseMetadata.auto_entitlement_grant_error = errorMessage(error, "auto entitlement grant failed");
      }
    }
    const { error: purchaseUpdateError } = await supabase
      .from("browser_adfree_purchase_orders")
      .update(purchaseUpdate)
      .eq("id", purchase.id);
    if (purchaseUpdateError) {
      return json({ ok: false, error: purchaseUpdateError.message }, 500);
    }
    return json({ ok: true, subscriptionId, eventType: event.type, synced: true, revoked: isPaymentFailed });
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
          productKey: purchase.product_key,
        });
      } else if (currentPeriodEnd) {
        await syncEntitlementWindowByCode(supabase, purchase.code, entitlementKey, currentPeriodEnd, {
          buyerEmail: purchase.buyer_email,
          orderId: purchase.provider_order_id,
          subscriptionId,
          productKey: purchase.product_key,
        });
      }
    } catch (error) {
      return json({ ok: false, error: errorMessage(error, "subscription sync failed") }, 500);
    }
    const purchaseMetadata = {
      ...(purchase.metadata && typeof purchase.metadata === "object" ? purchase.metadata : {}),
      subscription_id: subscriptionId,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: cancelAtPeriodEnd,
      subscription_status: subscriptionStatus,
      last_subscription_event_at: new Date().toISOString(),
    };
    const purchaseUpdate: Record<string, unknown> = {
      payment_status: shouldRevokeNow ? "cancelled" : purchase.payment_status,
      metadata: purchaseMetadata,
      updated_at: new Date().toISOString(),
    };
    if (!shouldRevokeNow && currentPeriodEnd && !purchase.claimed_by) {
      try {
        const autoGrant = await grantPurchaseEntitlementByEmail(supabase, {
          code: purchase.code,
          buyerEmail: purchase.buyer_email,
          entitlementKey,
          expiresAt: currentPeriodEnd,
          orderId: purchase.provider_order_id,
          subscriptionId,
        });
        if (autoGrant.ok && autoGrant.userId) {
          purchaseUpdate.claimed_by = autoGrant.userId;
          purchaseUpdate.claimed_at = new Date().toISOString();
          purchaseMetadata.auto_entitlement_granted_at = new Date().toISOString();
          purchaseMetadata.auto_entitlement_user_id = autoGrant.userId;
        } else if (autoGrant.reason) {
          purchaseMetadata.auto_entitlement_grant_skipped = autoGrant.reason;
        }
      } catch (error) {
        purchaseMetadata.auto_entitlement_grant_error = errorMessage(error, "auto entitlement grant failed");
      }
    }
    const { error: purchaseUpdateError } = await supabase
      .from("browser_adfree_purchase_orders")
      .update(purchaseUpdate)
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
    .select("id, code, payment_status, metadata")
    .eq("provider", "stripe")
    .eq("provider_order_id", orderId)
    .eq("product_key", productKey)
    .maybeSingle();
  if (existingError) {
    return json({ ok: false, error: existingError.message }, 500);
  }

  const existingPurchaseMetadata = existingPurchase?.metadata && typeof existingPurchase.metadata === "object"
    ? existingPurchase.metadata
    : {};
  const metadata = {
    ...existingPurchaseMetadata,
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
      return json({ ok: false, error: errorMessage(error, "code generation failed") }, 500);
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

  const { data: savedPurchase, error: purchaseError } = await supabase
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
    })
    .select("id, metadata")
    .maybeSingle();
  if (purchaseError) {
    return json({ ok: false, error: purchaseError.message }, 500);
  }

  const savedMetadata = savedPurchase?.metadata && typeof savedPurchase.metadata === "object"
    ? savedPurchase.metadata
    : metadata;
  const nextSavedMetadata: Record<string, unknown> = { ...(savedMetadata as Record<string, unknown>) };
  const purchasePostUpdate: Record<string, unknown> = {};
  let autoEntitlementGranted = false;
  let autoEntitlementGrantReason = "";
  let autoEntitlementGrantError = "";
  try {
    const autoGrant = await grantPurchaseEntitlementByEmail(supabase, {
      code,
      buyerEmail,
      entitlementKey,
      orderId,
      subscriptionId,
    });
    autoEntitlementGranted = Boolean(autoGrant.ok && autoGrant.userId);
    autoEntitlementGrantReason = autoGrant.reason || "";
    if (autoEntitlementGranted) {
      const nowIso = new Date().toISOString();
      purchasePostUpdate.claimed_by = autoGrant.userId;
      purchasePostUpdate.claimed_at = nowIso;
      nextSavedMetadata.auto_entitlement_granted_at = nowIso;
      nextSavedMetadata.auto_entitlement_user_id = autoGrant.userId;
    } else if (autoEntitlementGrantReason) {
      nextSavedMetadata.auto_entitlement_grant_skipped = autoEntitlementGrantReason;
    }
  } catch (error) {
    autoEntitlementGrantError = errorMessage(error, "auto entitlement grant failed");
    nextSavedMetadata.auto_entitlement_grant_error = autoEntitlementGrantError;
  }

  let purchaseCodeEmailSent = Boolean((savedMetadata as Record<string, unknown>).serial_code_email_sent_at);
  let purchaseCodeEmailError = "";
  if (!purchaseCodeEmailSent) {
    try {
      const emailResult = await sendPurchaseCodeEmail({ buyerEmail, orderId, productKey, code });
      if (emailResult.sent && savedPurchase?.id) {
        purchaseCodeEmailSent = true;
        const nowIso = new Date().toISOString();
        nextSavedMetadata.serial_code_email_sent_at = nowIso;
        nextSavedMetadata.serial_code_email_provider = emailResult.provider || "unknown";
      }
    } catch (error) {
      purchaseCodeEmailError = errorMessage(error, "purchase code email failed");
      nextSavedMetadata.serial_code_email_error = purchaseCodeEmailError;
    }
  }
  if (savedPurchase?.id) {
    const { error: postUpdateError } = await supabase
      .from("browser_adfree_purchase_orders")
      .update({
        ...purchasePostUpdate,
        metadata: nextSavedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", savedPurchase.id);
    if (postUpdateError && !purchaseCodeEmailError) {
      purchaseCodeEmailError = postUpdateError.message;
    }
  }

  return json({
    ok: true,
    orderId,
    codeIssued: true,
    code,
    eventType: event.type,
    autoEntitlementGranted,
    autoEntitlementGrantReason,
    autoEntitlementGrantError,
    purchaseCodeEmailSent,
    purchaseCodeEmailError,
  });
});
