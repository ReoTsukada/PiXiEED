import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { keyAwareFetch } from "../_shared/key-aware-fetch.ts";


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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export async function homeArtworksHandler(request: Request, deps: Record<string, any> = {}) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "GET") return json(request, { ok: false, artworks: [] }, 405);
  const url = deps.projectUrl ?? projectUrl, secret = deps.serviceKey ?? serviceKey;
  if (!url || !secret) return json(request, { ok: false, artworks: [] }, 503);
  try {
    const client = (deps.createClient || createClient)(url, secret, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: keyAwareFetch(secret) } });
    const result = await client.rpc("pixieed_home_artworks");
    if (result.error || !Array.isArray(result.data)) return json(request, { ok: false, artworks: [] }, 503);
    return json(request, { ok: true, artworks: result.data });
  } catch { return json(request, { ok: false, artworks: [] }, 503); }
}
if (import.meta.main) Deno.serve((request) => homeArtworksHandler(request));
