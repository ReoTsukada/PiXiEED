import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { keyAwareFetch } from "../_shared/key-aware-fetch.ts";
import { isUuid, rpcRecord } from "../_shared/post-publication.ts";

const env = (name: string) => Deno.env.get(name)?.trim() || "";
function defaultKeyDictionaryValue(name: string) {
  try {
    const values = JSON.parse(Deno.env.get(name) || "") as Record<
      string,
      unknown
    >;
    const value = values.default ||
      Object.values(values).find((entry) => typeof entry === "string");
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}
const projectUrl = env("SUPABASE_URL");
const publishableKey = env("SUPABASE_PUBLISHABLE_KEY") ||
  env("SUPABASE_ANON_KEY") ||
  defaultKeyDictionaryValue("SUPABASE_PUBLISHABLE_KEYS");
const serviceKey = env("SUPABASE_SECRET_KEY") ||
  env("SUPABASE_SERVICE_ROLE_KEY") ||
  defaultKeyDictionaryValue("SUPABASE_SECRET_KEYS");
const LOCAL_ORIGINS = new Set([
  "https://pixieed.jp",
  "https://www.pixieed.jp",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "";
  const configured = env("PUBLIC_SITE_ORIGIN").split(",").map((item) =>
    item.trim()
  ).filter(Boolean);
  const allowed = !origin ||
    (configured.length
      ? configured.includes(origin)
      : LOCAL_ORIGINS.has(origin));
  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin
      ? (allowed ? origin : "null")
      : (configured[0] || "null"),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

export async function homeArtworkPreferenceHandler(request: Request, deps: Record<string, any> = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!["GET", "POST"].includes(request.method)) return json(request, { ok: false }, 405);
  let body: any = {};
  if (request.method === "POST") {
    try {
      const reader = request.body?.getReader();
      if (!reader) throw new Error();
      let size = 0; const chunks: Uint8Array[] = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024) { await reader.cancel(); throw new Error(); } chunks.push(value); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!body || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'consentVersion,enabled,revision' || typeof body.enabled !== 'boolean' || body.consentVersion !== 'home-artwork-v1' || !Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error();
    } catch { return json(request, { ok: false, error: "invalid_preference" }, 400); }
  }
  const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return json(request, { ok: false }, 401);
  const url = deps.projectUrl ?? projectUrl, pub = deps.publishableKey ?? publishableKey, secret = deps.serviceKey ?? serviceKey;
  if (!url || !pub || !secret) return json(request, { ok: false }, 503);
  const makeClient = deps.createClient || createClient;
  try {
    const options = (key: string) => ({ auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: keyAwareFetch(key) } });
    const auth = await makeClient(url, pub, options(pub)).auth.getUser(token);
    if (auth.error || !isUuid(auth.data.user?.id)) return json(request, { ok: false }, 401);
    const result = await makeClient(url, secret, options(secret)).rpc("pixieed_home_artwork_preference", { p_owner_id: auth.data.user.id, p_enabled: request.method === "POST" ? body.enabled : null, p_revision: request.method === "POST" ? body.revision : null });
    if (result.error) return json(request, { ok: false, error: "reload_preference" }, 409);
    const preference = rpcRecord(result.data);
    if (!preference || typeof preference.enabled !== 'boolean') return json(request, { ok: false }, 503);
    return json(request, { ok: true, preference });
  } catch { return json(request, { ok: false }, 503); }
}
if (import.meta.main) Deno.serve((request) => homeArtworkPreferenceHandler(request));
