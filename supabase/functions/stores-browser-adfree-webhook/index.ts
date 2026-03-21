import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

const PAID_STATUSES = new Set(["paid", "completed", "confirmed", "fulfilled"]);
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

function getByPath(source: unknown, path: string): unknown {
  const parts = path.split(".");
  let cursor: unknown = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== "object" || !(part in cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function pickString(source: unknown, paths: string[]): string {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function normalizeOrderId(value: string): string {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function collectItemNames(source: unknown): string[] {
  const candidates = [
    getByPath(source, "order.items"),
    getByPath(source, "order.line_items"),
    getByPath(source, "items"),
    getByPath(source, "line_items"),
    getByPath(source, "data.items"),
    getByPath(source, "data.line_items"),
  ];
  const names: string[] = [];
  candidates.forEach((candidate) => {
    if (!Array.isArray(candidate)) {
      return;
    }
    candidate.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const name = [
        "name",
        "title",
        "product_name",
        "item_name",
        "variant_name",
      ]
        .map((key) => {
          const raw = (entry as Record<string, unknown>)[key];
          return typeof raw === "string" ? raw.trim() : "";
        })
        .find(Boolean);
      if (name) {
        names.push(name);
      }
    });
  });
  return Array.from(new Set(names));
}

function inferPaid(payload: unknown, status: string): boolean {
  if (PAID_STATUSES.has(status)) {
    return true;
  }
  const paidAt = pickString(payload, [
    "order.paid_at",
    "order.paidAt",
    "paid_at",
    "paidAt",
    "data.paid_at",
    "data.paidAt",
  ]);
  return Boolean(paidAt);
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

serve(async (request) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("PIXIEED_STORES_WEBHOOK_SECRET") || "";
  const url = new URL(request.url);
  const providedSecret = request.headers.get("x-pixieed-webhook-secret")
    || url.searchParams.get("secret")
    || "";
  if (expectedSecret && providedSecret !== expectedSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "supabase env missing" }, 500);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (_error) {
    return json({ ok: false, error: "invalid json" }, 400);
  }

  const productKey = url.searchParams.get("product") || "browser_ad_free";
  const orderId = normalizeOrderId(pickString(payload, [
    "order.id",
    "order.order_number",
    "order.number",
    "data.id",
    "data.order_number",
    "data.number",
    "order_id",
    "orderNumber",
    "id",
    "number",
  ]));
  const buyerEmail = normalizeEmail(pickString(payload, [
    "order.email",
    "order.customer.email",
    "customer.email",
    "buyer.email",
    "data.email",
    "data.customer.email",
    "email",
  ]));
  const rawStatus = pickString(payload, [
    "order.payment_status",
    "order.financial_status",
    "order.status",
    "payment_status",
    "financial_status",
    "status",
    "state",
    "data.status",
  ]);
  const normalizedStatus = String(rawStatus || "").trim().toLowerCase();
  const itemNames = collectItemNames(payload);
  const productMatch = (Deno.env.get("PIXIEED_BROWSER_ADFREE_PRODUCT_MATCH") || "広告非表示").trim();

  if (!orderId || !buyerEmail) {
    return json({ ok: false, error: "order id or buyer email missing" }, 422);
  }

  if (productMatch && itemNames.length && !itemNames.some((name) => name.includes(productMatch))) {
    return json({ ok: true, ignored: true, reason: "product mismatch", orderId });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const isPaid = inferPaid(payload, normalizedStatus);
  const { data: existingPurchase, error: existingError } = await supabase
    .from("browser_adfree_purchase_orders")
    .select("id, code, payment_status")
    .eq("provider", "stores")
    .eq("provider_order_id", orderId)
    .eq("product_key", productKey)
    .maybeSingle();
  if (existingError) {
    return json({ ok: false, error: existingError.message }, 500);
  }

  const metadata = {
    item_names: itemNames,
    source: "stores_browser_adfree_webhook",
  };

  if (!isPaid) {
    const { error } = await supabase
      .from("browser_adfree_purchase_orders")
      .upsert({
        provider: "stores",
        provider_order_id: orderId,
        product_key: productKey,
        buyer_email: buyerEmail,
        payment_status: normalizedStatus || "pending",
        raw_payload: payload,
        metadata,
      }, {
        onConflict: "provider,provider_order_id,product_key",
      });
    if (error) {
      return json({ ok: false, error: error.message }, 500);
    }
    return json({ ok: true, ignored: true, reason: "not paid", orderId });
  }

  let code = typeof existingPurchase?.code === "string" ? existingPurchase.code : "";
  if (!code) {
    try {
      code = await generateUniqueCode(supabase);
    } catch (error) {
      return json({ ok: false, error: String(error) }, 500);
    }
    const durationDays = Math.max(1, Math.min(3650, Number(Deno.env.get("PIXIEED_BROWSER_ADFREE_DURATION_DAYS") || "31")));
    const { error: codeError } = await supabase
      .from("user_entitlement_codes")
      .insert({
        code,
        entitlement_key: "browser_ad_free",
        duration_days: durationDays,
        max_redemptions: 1,
        redemption_count: 0,
        active: true,
        metadata: {
          buyer_email: buyerEmail,
          provider: "stores",
          provider_order_id: orderId,
          product_key: productKey,
          item_names: itemNames,
        },
      });
    if (codeError) {
      return json({ ok: false, error: codeError.message }, 500);
    }
  }

  const { error: purchaseError } = await supabase
    .from("browser_adfree_purchase_orders")
    .upsert({
      provider: "stores",
      provider_order_id: orderId,
      product_key: productKey,
      buyer_email: buyerEmail,
      payment_status: normalizedStatus || "paid",
      code,
      issued_at: new Date().toISOString(),
      raw_payload: payload,
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
  });
});
