import { createClient } from "npm:@supabase/supabase-js@2.46.1";

export type JsonRecord = Record<string, unknown>;

export const MARKET_LISTING_ENABLED = true;
const MARKET_DEV_EMAIL_SHA256 = "a72a00cf6492cb03cb9425327c8368ea4e1ed079388a270260e43cba004fc1df";

const ALLOWED_ORIGINS = new Set([
  "https://pixieed.jp",
  "https://www.pixieed.jp",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://pixieed.jp",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
}

export function jsonResponse(request: Request, data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(request),
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return String(error || fallback);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim() || "";
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function createAdminClient() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createUserClient(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    throw new Error("login required");
  }
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(request: Request) {
  const client = createUserClient(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous) throw new Error("confirmed login required");
  return { client, user: data.user };
}

async function sha256Text(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requireMarketDevUser(request: Request) {
  const auth = await requireUser(request);
  if (!auth.user.email || !auth.user.email_confirmed_at) {
    throw new Error("confirmed login required");
  }
  const emailHash = await sha256Text(auth.user.email);
  if (emailHash !== MARKET_DEV_EMAIL_SHA256) {
    throw new Error("market DEV access required");
  }
  return auth;
}

export async function readJson(request: Request): Promise<JsonRecord> {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value as JsonRecord : {};
  } catch (_error) {
    return {};
  }
}

export function siteUrl(): string {
  const configured = Deno.env.get("SITE_URL")?.trim() || "https://pixieed.jp";
  return configured.replace(/\/+$/, "");
}

export async function stripeRequest(
  path: string,
  options: {
    method?: "GET" | "POST";
    params?: URLSearchParams;
    idempotencyKey?: string;
  } = {},
): Promise<JsonRecord> {
  const method = options.method || "POST";
  const headers = new Headers({
    authorization: `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`,
    "stripe-version": "2025-06-30.basil",
  });
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
  if (method === "POST") headers.set("content-type", "application/x-www-form-urlencoded");

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers,
    body: method === "POST" ? (options.params || new URLSearchParams()) : undefined,
  });
  const data = await response.json().catch(() => ({})) as JsonRecord;
  if (!response.ok) {
    const stripeError = data.error && typeof data.error === "object"
      ? String((data.error as JsonRecord).message || "Stripe request failed")
      : "Stripe request failed";
    throw new Error(stripeError);
  }
  return data;
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function booleanValue(value: unknown): boolean {
  return value === true;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export async function syncStripeAccount(admin: ReturnType<typeof createAdminClient>, account: JsonRecord) {
  const metadata = account.metadata && typeof account.metadata === "object" ? account.metadata as JsonRecord : {};
  const userId = stringValue(metadata.pixieed_user_id);
  const accountId = stringValue(account.id);
  if (!userId || !accountId) throw new Error("Stripe account is missing PiXiEED ownership metadata");
  const requirements = account.requirements && typeof account.requirements === "object"
    ? account.requirements as JsonRecord
    : {};
  const due = Array.from(new Set([
    ...stringArray(requirements.currently_due),
    ...stringArray(requirements.past_due),
  ]));
  const { data, error } = await admin.rpc("market_sync_stripe_account_v1", {
    input_user_id: userId,
    input_account_id: accountId,
    input_details_submitted: booleanValue(account.details_submitted),
    input_charges_enabled: booleanValue(account.charges_enabled),
    input_payouts_enabled: booleanValue(account.payouts_enabled),
    input_requirements_due: due,
    input_disabled_reason: stringValue(requirements.disabled_reason),
  });
  if (error) throw error;
  return { userId, accountId, onboardingStatus: String(data || "pending"), requirementsDue: due };
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length || left.length === 0) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export async function verifyStripeWebhook(rawBody: string, signatureHeader: string): Promise<void> {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2) || "";
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  const timestampNumber = Number(timestamp);
  if (!Number.isInteger(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > 300) {
    throw new Error("Stripe webhook timestamp is invalid");
  }
  if (!signatures.length) throw new Error("Stripe webhook signature is missing");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredEnv("STRIPE_WEBHOOK_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  ));
  const valid = signatures.some((signature) => constantTimeEqual(expected, hexToBytes(signature)));
  if (!valid) throw new Error("Stripe webhook signature is invalid");
}
