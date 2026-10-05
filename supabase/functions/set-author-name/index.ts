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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

async function readName(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 4096) return null;
  try {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const keys = Object.keys(body);
    if (
      keys.length !== 1 || keys[0] !== "name" || typeof body.name !== "string"
    ) return null;
    const name = body.name.normalize("NFC").trim();
    const length = Array.from(name).length;
    if (length < 1 || length > 40 || /\p{Cc}/u.test(name)) return null;
    return name;
  } catch {
    return null;
  }
}

type SetAuthorNameDependencies = {
  createClient?: typeof createClient;
  projectUrl?: string;
  publishableKey?: string;
  serviceKey?: string;
};

/** Saves a user's public display label; Auth identity comes only from getUser(token). */
export async function setAuthorNameHandler(
  request: Request,
  deps: SetAuthorNameDependencies = {},
) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, { ok: false, error: "method_not_allowed" }, 405);
  }

  const name = await readName(request);
  if (name === null) {
    return json(request, { ok: false, error: "author_name_invalid" }, 400);
  }
  const token =
    (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1]
      ?.trim() || "";
  if (!token) {
    return json(request, { ok: false, error: "authentication_required" }, 401);
  }

  const url = deps.projectUrl ?? projectUrl;
  const publicKey = deps.publishableKey ?? publishableKey;
  const secret = deps.serviceKey ?? serviceKey;
  if (!url || !publicKey || !secret) {
    return json(request, { ok: false, error: "function_not_configured" }, 503);
  }
  const makeClient = deps.createClient || createClient;
  try {
    const userClient = makeClient(url, publicKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { fetch: keyAwareFetch(publicKey) },
    });
    const auth = await userClient.auth.getUser(token);
    if (auth.error || !auth.data.user || !isUuid(auth.data.user.id)) {
      return json(
        request,
        { ok: false, error: "authentication_required" },
        401,
      );
    }
    const userId = auth.data.user.id;
    const admin = makeClient(url, secret, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { fetch: keyAwareFetch(secret) },
    });
    const result = await admin.rpc("pixieed_set_post_author_name", {
      p_author_id: userId,
      p_name: name,
    });
    const saved = !result.error ? rpcRecord(result.data) : null;
    if (saved?.ok !== true || saved.name !== name) {
      return json(
        request,
        { ok: false, error: "author_name_update_failed" },
        503,
      );
    }
    return json(request, { ok: true, name });
  } catch {
    return json(
      request,
      { ok: false, error: "author_name_update_failed" },
      503,
    );
  }
}

if (import.meta.main) Deno.serve((request) => setAuthorNameHandler(request));
