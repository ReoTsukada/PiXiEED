import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { keyAwareFetch } from "../_shared/key-aware-fetch.ts";
import { isUuid, rpcRecord } from "../_shared/post-publication.ts";

const env = (name: string) => Deno.env.get(name)?.trim() || "";
const projectUrl = env("SUPABASE_URL");
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

async function readPostId(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 2048) return null;
  try {
    if (!request.body) return null;
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) {
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
    if (keys.length !== 1 || keys[0] !== "postId") return null;
    return isUuid(body.postId) ? body.postId : null;
  } catch {
    return null;
  }
}

type DeleteDependencies = {
  createClient?: typeof createClient;
  projectUrl?: string;
  publishableKey?: string;
  serviceKey?: string;
};

/** Deletes only a post owned by the verified bearer identity. Storage paths never leave this function. */
export async function deletePostHandler(
  request: Request,
  deps: DeleteDependencies = {},
) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return json(request, { ok: false, error: "method_not_allowed" }, 405);
  }

  const postId = await readPostId(request);
  if (!postId) {
    return json(request, { ok: false, error: "post_id_invalid" }, 400);
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
    if (auth.error || !auth.data.user) {
      return json(
        request,
        { ok: false, error: "authentication_required" },
        401,
      );
    }
    // Anonymous Auth users are valid owners too; identity always comes from getUser, never request JSON.
    const verifiedAuthorId = auth.data.user.id;
    if (!isUuid(verifiedAuthorId)) {
      return json(
        request,
        { ok: false, error: "authentication_required" },
        401,
      );
    }

    const admin = makeClient(url, secret, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: { fetch: keyAwareFetch(secret) },
    });
    const result = await admin.rpc("pixieed_delete_own_post", {
      p_post_id: postId,
      p_verified_author_id: verifiedAuthorId,
    });
    if (result.error) {
      const message = String(result.error.message || "");
      const status = message.includes("post_not_found")
        ? 404
        : message.includes("post_delete_identity_invalid")
        ? 401
        : 503;
      return json(request, {
        ok: false,
        error: status === 404
          ? "post_not_found"
          : status === 401
          ? "authentication_required"
          : "post_delete_failed",
      }, status);
    }
    const deleted = rpcRecord(result.data);
    if (
      !deleted ||
      String(deleted.postId || "").toLowerCase() !== postId.toLowerCase() ||
      deleted.deleted !== true || !Array.isArray(deleted.storage)
    ) {
      return json(
        request,
        { ok: false, error: "post_delete_outcome_unknown" },
        503,
      );
    }

    const grouped = new Map<string, string[]>();
    for (const item of deleted.storage) {
      if (!item || typeof item !== "object") {
        return json(request, {
          ok: false,
          error: "post_delete_outcome_unknown",
        }, 503);
      }
      const bucket = (item as Record<string, unknown>).bucket;
      const path = (item as Record<string, unknown>).path;
      if (
        (bucket !== "post-public" && bucket !== "post-quarantine") ||
        typeof path !== "string" ||
        !path || path.startsWith("/") || path.includes("..") ||
        path.includes("\\") || /[?#]/.test(path)
      ) {
        return json(request, {
          ok: false,
          error: "post_delete_outcome_unknown",
        }, 503);
      }
      const paths = grouped.get(bucket) || [];
      if (!paths.includes(path)) paths.push(path);
      grouped.set(bucket, paths);
    }
    for (const [bucket, paths] of grouped) {
      let removed;
      try {
        removed = await admin.storage.from(bucket).remove(paths);
      } catch {
        return json(request, {
          ok: false,
          error: "storage_cleanup_failed",
          deleted: true,
        }, 503);
      }
      if (removed.error) {
        return json(request, {
          ok: false,
          error: "storage_cleanup_failed",
          deleted: true,
        }, 503);
      }
    }
    let completed;
    try {
      completed = await admin.rpc("pixieed_complete_own_post_delete", {
        p_post_id: postId,
        p_verified_author_id: verifiedAuthorId,
      });
    } catch {
      return json(request, {
        ok: false,
        error: "storage_cleanup_failed",
        deleted: true,
      }, 503);
    }
    const completion = !completed.error ? rpcRecord(completed.data) : null;
    if (
      String(completion?.postId || "").toLowerCase() !== postId.toLowerCase() ||
      completion?.deleted !== true || completion.cleanupCompleted !== true
    ) {
      return json(request, {
        ok: false,
        error: "storage_cleanup_failed",
        deleted: true,
      }, 503);
    }
    return json(request, { ok: true, deleted: true });
  } catch {
    return json(request, { ok: false, error: "post_delete_failed" }, 503);
  }
}

if (import.meta.main) Deno.serve((request) => deletePostHandler(request));
