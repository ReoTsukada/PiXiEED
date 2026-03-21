import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "npm:stripe@17.7.0";

const DEFAULT_RETURN_URL = "https://pixieed.jp/pixiedraw/";
const DEFAULT_ALLOWED_HOSTS = ["pixieed.jp", "www.pixieed.jp", "localhost", "127.0.0.1"];
const PRODUCTS: Record<string, {
  priceEnv: string;
  source: string;
  appendSessionParams: boolean;
}> = {
  browser_ad_free: {
    priceEnv: "PIXIEED_STRIPE_BROWSER_ADFREE_PRICE_ID",
    source: "pixieed_browser_adfree",
    appendSessionParams: true,
  },
  support_tip: {
    priceEnv: "PIXIEED_STRIPE_SUPPORT_TIP_PRICE_ID",
    source: "pixieed_support_tip",
    appendSessionParams: false,
  },
};

function readAllowedHosts(): string[] {
  const raw = (Deno.env.get("PIXIEED_STRIPE_ALLOWED_HOSTS") || "").trim();
  if (!raw) {
    return DEFAULT_ALLOWED_HOSTS;
  }
  return raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isAllowedUrl(input: string): boolean {
  try {
    const url = new URL(input);
    const protocol = url.protocol.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    const allowedHosts = readAllowedHosts();
    if (!allowedHosts.includes(hostname)) {
      return false;
    }
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return protocol === "http:" || protocol === "https:";
    }
    return protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function sanitizeReturnUrl(input: string): string {
  const fallback = (Deno.env.get("PIXIEED_STRIPE_DEFAULT_RETURN_URL") || DEFAULT_RETURN_URL).trim() || DEFAULT_RETURN_URL;
  const target = isAllowedUrl(input) ? input : fallback;
  const url = new URL(target);
  url.searchParams.delete("stripe_checkout_session_id");
  url.searchParams.delete("stripe_checkout_status");
  return url.toString();
}

function buildSuccessUrl(input: string, appendSessionParams: boolean): string {
  const url = new URL(sanitizeReturnUrl(input));
  url.searchParams.set("stripe_checkout_status", "success");
  if (appendSessionParams) {
    url.searchParams.set("stripe_checkout_session_id", "{CHECKOUT_SESSION_ID}");
  }
  return url.toString();
}

function buildCancelUrl(input: string): string {
  const url = new URL(sanitizeReturnUrl(input));
  url.searchParams.set("stripe_checkout_status", "cancelled");
  return url.toString();
}

function readEmail(raw: string): string {
  const value = String(raw || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : "";
}

function readPayload(request: Request, url: URL): {
  returnUrl: string;
  cancelUrl: string;
  email: string;
  productKey: string;
} {
  const fallback = {
    returnUrl: url.searchParams.get("return_url") || "",
    cancelUrl: url.searchParams.get("cancel_url") || "",
    email: url.searchParams.get("email") || "",
    productKey: url.searchParams.get("product") || "browser_ad_free",
  };
  return fallback;
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

serve(async (request) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const url = new URL(request.url);
  let payload = readPayload(request, url);
  if (request.method === "POST") {
    try {
      const body = await request.json();
      payload = {
        returnUrl: typeof body?.returnUrl === "string" ? body.returnUrl : payload.returnUrl,
        cancelUrl: typeof body?.cancelUrl === "string" ? body.cancelUrl : payload.cancelUrl,
        email: typeof body?.email === "string" ? body.email : payload.email,
        productKey: typeof body?.productKey === "string" ? body.productKey : payload.productKey,
      };
    } catch (_error) {
      return json({ ok: false, error: "invalid json" }, 400);
    }
  }

  const productKey = String(payload.productKey || "browser_ad_free").trim() || "browser_ad_free";
  const product = PRODUCTS[productKey];
  if (!product) {
    return json({ ok: false, error: "unsupported product" }, 400);
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const priceId = Deno.env.get(product.priceEnv) || "";
  if (!stripeSecretKey || !priceId) {
    return json({ ok: false, error: "stripe env missing" }, 500);
  }

  const stripe = new Stripe(stripeSecretKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });

  const successUrl = buildSuccessUrl(payload.returnUrl, product.appendSessionParams);
  const cancelUrl = buildCancelUrl(payload.cancelUrl || payload.returnUrl);
  const email = readEmail(payload.email);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      payment_method_types: ["card", "paypay"],
      customer_email: email || undefined,
      billing_address_collection: "auto",
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        product_key: productKey,
        checkout_source: product.source,
        login_email: email || "",
      },
    });

    if (!session.url) {
      return json({ ok: false, error: "checkout url missing" }, 500);
    }

    if (request.method === "POST") {
      return json({
        ok: true,
        url: session.url,
        sessionId: session.id,
      });
    }

    return Response.redirect(session.url, 303);
  } catch (error) {
    return json({ ok: false, error: String(error?.message || error || "stripe checkout failed") }, 500);
  }
});
