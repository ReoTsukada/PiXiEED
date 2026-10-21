import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { fetchSocialAudioRange } from "../_shared/social-audio-range.mjs";
import { keyAwareFetch } from "../_shared/key-aware-fetch.ts";
import {
  cleanSocialText,
  cursorDate,
  isSocialUuid,
  parseSocialTarget,
  publicSocialPost,
} from "../_shared/social-contract.mjs";
import {
  inspectSocialWav,
  readSocialRequestBody,
  SocialWavError,
} from "../_shared/social-wav.mjs";

const env = (name: string) => Deno.env.get(name)?.trim() || "";
const projectUrl = env("SUPABASE_URL");
function keyFrom(name: string) {
  try {
    const data = JSON.parse(Deno.env.get(name) || "") as Record<
      string,
      unknown
    >;
    const value = data.default ||
      Object.values(data).find((item) => typeof item === "string");
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}
const publishableKey = env("SUPABASE_PUBLISHABLE_KEY") ||
  env("SUPABASE_ANON_KEY") || keyFrom("SUPABASE_PUBLISHABLE_KEYS");
const serviceKey = env("SUPABASE_SECRET_KEY") ||
  env("SUPABASE_SERVICE_ROLE_KEY") || keyFrom("SUPABASE_SECRET_KEYS");
const DEFAULT_ORIGINS = new Set([
  "https://pixieed.jp",
  "https://www.pixieed.jp",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
  "http://127.0.0.1:4242",
  "http://localhost:4242",
  "https://127.0.0.1:4243",
  "https://localhost:4243",
]);
type Client = any;
type Deps = {
  createClient?: (...args: any[]) => any;
  projectUrl?: string;
  publishableKey?: string;
  serviceKey?: string;
  fetch?: typeof fetch;
};

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin") || "";
  const configured = env("PUBLIC_SITE_ORIGIN").split(",").map((item) =>
    item.trim()
  ).filter(Boolean);
  return !origin ||
    (configured.length
      ? configured.includes(origin)
      : DEFAULT_ORIGINS.has(origin));
}
function corsHeaders(
  request: Request,
  contentType = "application/json; charset=utf-8",
): HeadersInit {
  const origin = request.headers.get("origin") || "";
  const configured = env("PUBLIC_SITE_ORIGIN").split(",").map((item) =>
    item.trim()
  ).filter(Boolean);
  return {
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, range",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Expose-Headers":
      "Accept-Ranges, Content-Range, Content-Length",
    "Access-Control-Allow-Origin": origin
      ? (allowedOrigin(request) ? origin : "null")
      : (configured[0] || "null"),
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}
const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });
const failure = (request: Request, error: string, status = 400) =>
  json(request, { ok: false, error }, status);
function canonicalHash(value: unknown) {
  return crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  ).then((digest) =>
    Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}
function bearer(request: Request) {
  return (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)
    ?.[1]?.trim() || "";
}
function supa(deps: Deps, key: string) {
  const factory = deps.createClient || createClient;
  return factory(deps.projectUrl ?? projectUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: keyAwareFetch(key, deps.fetch) },
  });
}
async function authUser(
  request: Request,
  deps: Deps,
  required: boolean,
): Promise<{ id: string; isAnonymous: boolean | null; client: Client } | null> {
  const token = bearer(request);
  if (!token) {
    if (required) throw new HttpError("authentication_required", 401);
    return null;
  }
  const url = deps.projectUrl ?? projectUrl;
  const key = deps.publishableKey ?? publishableKey;
  if (!url || !key) {
    if (required) throw new HttpError("function_not_configured", 503);
    return null;
  }
  try {
    const userClient = supa(deps, key);
    const result = await userClient.auth.getUser(token);
    if (
      result.error || !result.data.user || !isSocialUuid(result.data.user.id)
    ) {
      if (required) throw new HttpError("authentication_required", 401);
      return null;
    }
    return { id: result.data.user.id, isAnonymous: typeof result.data.user.is_anonymous === "boolean" ? result.data.user.is_anonymous : null, client: userClient };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (required) throw new HttpError("authentication_required", 401);
    return null;
  }
}
function adminClient(deps: Deps): Client {
  const url = deps.projectUrl ?? projectUrl;
  const key = deps.serviceKey ?? serviceKey;
  if (!url || !key) throw new HttpError("function_not_configured", 503);
  return supa(deps, key);
}
class HttpError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}
function dbError(
  request: Request,
  error: unknown,
  fallback: string,
  fallbackStatus = 503,
) {
  const message = typeof error === "object" && error
    ? String((error as { message?: unknown }).message || "")
    : "";
  const map: Array<[string, string, number]> = [
    ["sns_idempotency_conflict", "idempotency_conflict", 409],
    ["sns_post_rate_limited", "rate_limited", 429],
    ["sns_claim_conflict", "claim_conflict", 409],
    ["sns_claim_pending", "claim_pending", 409],
    ["sns_claim_identity", "claim_identity_invalid", 403],
    ["sns_guest_claimed", "guest_already_claimed", 409],
    ["sns_report_rate_limited", "rate_limited", 429],
    ["sns_target_not_public", "target_not_found", 404],
    ["sns_music_capacity", "music_capacity_reached", 413],
    ["sns_input_invalid", "post_invalid", 400],
    ["sns_audio_invalid", "audio_invalid", 400],
    ["sns_comment_invalid", "comment_invalid", 400],
    ["sns_report_invalid", "report_invalid", 400],
  ];
  for (const [needle, code, status] of map) {
    if (message.includes(needle)) return failure(request, code, status);
  }
  return failure(request, fallback, fallbackStatus);
}
function parseLimit(value: unknown, defaultValue = 20): number | null {
  if (value === undefined) return defaultValue;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
}
function validPayloadObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
async function targetIsPublic(
  admin: Client,
  target: { type: string; id: string },
) {
  if (target.type === "sns") {
    const { data, error } = await admin.from("sns_posts").select("id").eq(
      "id",
      target.id,
    ).eq("state", "ready").eq("visibility", "public").maybeSingle();
    return !error && !!data;
  }
  if (target.type === "map") {
    const { data, error } = await admin.from("post_map_points").select(
      "post_id,user_posts!inner(status)",
    ).eq("post_id", target.id).not("published_at", "is", null).eq(
      "user_posts.status",
      "published",
    ).maybeSingle();
    return !error && !!data;
  }
  if (target.type === "showcase") {
    const { data, error } = await admin.from("social_posts").select("id").eq(
      "id",
      target.id,
    ).eq("status", "published").eq("post_kind", "image").eq(
      "distribution_mode",
      "showcase",
    ).not("media_object_path", "is", null).maybeSingle();
    return !error && !!data;
  }
  return false;
}
function rowData(result: { data: unknown; error?: unknown }) {
  return !result.error && result.data && typeof result.data === "object"
    ? result.data as Record<string, unknown>
    : null;
}
async function getPost(admin: Client, id: string) {
  return admin.from("sns_posts").select("*").eq("id", id).maybeSingle();
}

/** A tombstone is already hidden. Persist cleanup intent before touching storage. */
async function cleanupDeletedAudio(
  admin: Client,
  ownerId: string,
  postId: string,
) {
  let marked;
  try {
    marked = await admin.from("sns_posts").update({
      cleanup_pending: true,
      updated_at: new Date().toISOString(),
    }).eq("id", postId).eq("owner_id", ownerId).eq("state", "deleted")
      .select("id,media_owner_id").maybeSingle();
  } catch {
    return { pending: true, confirmed: false };
  }
  if (marked.error || !marked.data) return { pending: true, confirmed: false };

  let removed;
  try {
    removed = await admin.storage.from("sns-audio").remove([
      `${marked.data.media_owner_id || ownerId}/${postId}.wav`,
    ]);
  } catch {
    return { pending: true, confirmed: false };
  }
  if (removed.error) return { pending: true, confirmed: false };

  let cleared;
  try {
    cleared = await admin.from("sns_posts").update({
      cleanup_pending: false,
      updated_at: new Date().toISOString(),
    }).eq("id", postId).eq("owner_id", ownerId).eq("state", "deleted")
      .eq("cleanup_pending", true).select("id").maybeSingle();
  } catch {
    return { pending: true, confirmed: false };
  }
  if (cleared.error || !cleared.data) {
    return { pending: true, confirmed: false };
  }
  return { pending: false, confirmed: true };
}

async function handleAudio(request: Request, deps: Deps) {
  const postId = new URL(request.url).searchParams.get("postId") || "";
  if (!isSocialUuid(postId)) return failure(request, "post_id_invalid");
  const admin = adminClient(deps);
  const owner = await authUser(request, deps, false);
  const { data, error } = await getPost(admin, postId);
  const post = rowData({ data, error });
  if (
    !post || post.state !== "ready" ||
    (post.visibility !== "public" && post.owner_id !== owner?.id) ||
    post.kind !== "music"
  ) return failure(request, "post_not_found", 404);
  const result = await fetchSocialAudioRange({
    projectUrl: deps.projectUrl ?? projectUrl, serviceKey: deps.serviceKey ?? serviceKey,
    path: `${post.media_owner_id || post.owner_id}/${post.id}.wav`, expectedBytes: Number(post.audio_bytes),
    rangeHeader: request.headers.get("range"), fetchImpl: deps.fetch ?? fetch, signal: request.signal,
  });
  if (result.status === 503) return failure(request, "audio_unavailable", 503);
  const headers = new Headers(corsHeaders(request, "audio/wav"));
  result.headers.forEach((value, key) => headers.set(key, value));
  return new Response(result.body, {status: result.status, headers});
}

async function processAction(
  request: Request,
  payload: Record<string, unknown>,
  audio: Uint8Array | null,
  deps: Deps,
) {
  const action = payload.action;
  if (typeof action !== "string") return failure(request, "action_invalid");
  if (["comments", "comment-create", "comment-edit", "comment-delete"].includes(action)) {
    return failure(request, "comments_disabled", 410);
  }
  const admin = adminClient(deps);
  if (action === "claim-guest") {
    const owner = await authUser(request, deps, true);
    if (owner!.isAnonymous !== false) return failure(request, "registered_account_required", 403);
    if (!isSocialUuid(payload.requestKey) || typeof payload.guestAccessToken !== "string" ||
        !payload.guestAccessToken || payload.guestAccessToken.length > 8192) return failure(request, "claim_invalid");
    const guestRequest = new Request(request.url, {headers:{Authorization:`Bearer ${payload.guestAccessToken}`}});
    const guest = await authUser(guestRequest, deps, true);
    if (guest!.isAnonymous !== true || guest!.id === owner!.id) return failure(request, "guest_session_required", 403);
    const result = await admin.rpc("pixieed_sns_claim_guest", {
      p_guest_id: guest!.id, p_owner_id: owner!.id, p_request_key: payload.requestKey,
    });
    if (result.error) return dbError(request, result.error, "claim_failed");
    const claim = rowData(result);
    if (!claim || claim.guestId !== guest!.id || claim.ownerId !== owner!.id || claim.requestKey !== payload.requestKey) {
      return failure(request, "claim_outcome_unknown", 503);
    }
    return json(request, {ok:true, claim});
  }
  if (action === "list") {
    const limit = parseLimit(payload.limit);
    const before = cursorDate(payload.before);
    if (limit === null || before === null) {
      return failure(request, "pagination_invalid");
    }
    let query = admin.from("sns_posts").select("*").eq("state", "ready").eq(
      "visibility",
      "public",
    ).order("created_at", { ascending: false }).order("id", {
      ascending: false,
    }).limit(limit);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) return failure(request, "feed_unavailable", 503);
    const posts = (data || []).map((row: Record<string, unknown>) =>
      publicSocialPost(row)
    );
    return json(request, {
      ok: true,
      posts,
      ...(posts.length === limit
        ? { cursor: posts[posts.length - 1].createdAt }
        : {}),
    });
  }
  if (action === "get") {
    if (!isSocialUuid(payload.postId)) {
      return failure(request, "post_id_invalid");
    }
    const owner = await authUser(request, deps, false);
    const { data, error } = await getPost(admin, payload.postId as string);
    if (error) return failure(request, "post_unavailable", 503);
    const row = rowData({ data, error });
    if (
      !row || row.state !== "ready" ||
      (row.visibility !== "public" && row.owner_id !== owner?.id)
    ) return json(request, { ok: true, post: null });
    return json(request, { ok: true, post: publicSocialPost(row, owner?.id) });
  }
  if (action === "mine") {
    const owner = await authUser(request, deps, true);
    const { data, error } = await admin.from("sns_posts").select("*").eq(
      "owner_id",
      owner!.id,
    ).in("state", ["ready", "pending"]).order("created_at", {
      ascending: false,
    }).limit(50);
    if (error) return failure(request, "posts_unavailable", 503);
    return json(request, {
      ok: true,
      posts: (data || []).filter((row: Record<string, unknown>) =>
        row.state === "ready"
      ).map((row: Record<string, unknown>) => publicSocialPost(row, owner!.id)),
    });
  }
  if (action === "create") {
    const owner = await authUser(request, deps, true);
    if (
      !isSocialUuid(payload.requestKey) ||
      !["text", "music"].includes(String(payload.kind)) ||
      !["public", "private"].includes(String(payload.visibility))
    ) return failure(request, "post_invalid");
    const kind = payload.kind as "text" | "music";
    const body = cleanSocialText(payload.body ?? "", 180, {
      required: kind === "text",
      multiline: true,
    });
    const authorName = cleanSocialText(payload.authorName ?? "Guest", 40, {
      required: true,
    });
    const fallbackTitle = kind === "text"
      ? (body || "").split("\n")[0].slice(0, 60)
      : cleanSocialText(payload.musicTitle ?? "", 60);
    const title = cleanSocialText(payload.title ?? fallbackTitle ?? "", 60, {
      required: true,
    });
    if (body === null || authorName === null || title === null) {
      return failure(request, "text_length_invalid");
    }
    if ((kind === "music") !== (audio instanceof Uint8Array)) {
      return failure(request, "audio_required");
    }
    let facts: { bytes: number; duration: number; sha256: string } | null =
      null;
    if (audio) {
      try {
        facts = await inspectSocialWav(audio);
      } catch (error) {
        return failure(
          request,
          error instanceof SocialWavError ? error.code : "audio_wav_invalid",
        );
      }
    }
    const digest = await canonicalHash([
      kind,
      title,
      body,
      authorName,
      payload.visibility,
      facts?.sha256 || null,
    ]);
    const reservation = await admin.rpc("pixieed_sns_reserve_post", {
      p_owner_id: owner!.id,
      p_request_key: payload.requestKey,
      p_request_hash: digest,
      p_kind: kind,
      p_title: title,
      p_body: body,
      p_author_name: authorName,
      p_visibility: payload.visibility,
      p_audio_bytes: facts?.bytes ?? null,
      p_audio_duration: facts?.duration ?? null,
      p_audio_sha256: facts?.sha256 ?? null,
    });
    if (reservation.error) {
      return dbError(request, reservation.error, "post_create_failed");
    }
    const reserved = rowData(reservation);
    const postId = reserved?.postId;
    if (!isSocialUuid(postId)) {
      return failure(request, "post_create_outcome_unknown", 503);
    }
    if (reserved?.state === "deleted") {
      return failure(request, "post_deleted", 409);
    }
    if (kind === "music" && reserved?.state !== "ready") {
      const path = `${owner!.id}/${postId}.wav`;
      const upload = await admin.storage.from("sns-audio").upload(
        path,
        audio!,
        { contentType: "audio/wav", upsert: false },
      );
      if (upload.error) {
        const duplicate = /already exists|duplicate|object exists/i.test(
          String(upload.error.message || ""),
        );
        if (!duplicate) return failure(request, "audio_upload_failed", 503);
        const existing = await admin.storage.from("sns-audio").download(path);
        if (existing.error || !existing.data) {
          return failure(request, "audio_upload_failed", 503);
        }
        const existingFacts = await inspectSocialWav(
          new Uint8Array(await existing.data.arrayBuffer()),
        );
        if (existingFacts.sha256 !== facts?.sha256) {
          return failure(request, "audio_upload_conflict", 409);
        }
      }
      let finish;
      try {
        finish = await admin.rpc("pixieed_sns_finish_audio", {
          p_owner_id: owner!.id,
          p_post_id: postId,
        });
      } catch {
        finish = { data: null, error: true };
      }
      if (finish.error || finish.data !== true) {
        const actual = await getPost(admin, postId as string);
        const actualRow = rowData(actual);
        if (actual.error || !actualRow || actualRow.owner_id !== owner!.id) {
          return failure(request, "post_finalize_outcome_unknown", 503);
        }
        if (actualRow.state === "deleted") {
          const cleanup = await cleanupDeletedAudio(
            admin,
            owner!.id,
            postId as string,
          );
          return json(request, {
            ok: false,
            error: cleanup.confirmed
              ? "post_deleted"
              : "storage_cleanup_failed",
            deleted: true,
            cleanupPending: cleanup.pending,
          }, cleanup.confirmed ? 409 : 503);
        }
        if (actualRow.state !== "ready") {
          return failure(request, "post_finalize_failed", 503);
        }
      }
    }
    const { data, error } = await getPost(admin, postId as string);
    const row = rowData({ data, error });
    if (!row || row.state !== "ready") {
      return failure(request, "post_create_outcome_unknown", 503);
    }
    return json(
      request,
      { ok: true, post: publicSocialPost(row, owner!.id) },
      reserved?.replayed ? 200 : 201,
    );
  }
  if (action === "edit") {
    const owner = await authUser(request, deps, true);
    if (
      !isSocialUuid(payload.postId) || !Number.isInteger(payload.version) ||
      Number(payload.version) < 1 ||
      !["public", "private"].includes(String(payload.visibility))
    ) return failure(request, "post_invalid");
    const title = cleanSocialText(payload.title, 60, { required: true });
    const body = cleanSocialText(payload.body ?? "", 180, { multiline: true });
    if (title === null || body === null) {
      return failure(request, "text_length_invalid");
    }
    const { data, error } = await admin.from("sns_posts").update({
      title,
      body,
      visibility: payload.visibility,
      version: Number(payload.version) + 1,
      updated_at: new Date().toISOString(),
    }).eq("id", payload.postId).eq("owner_id", owner!.id).eq("state", "ready")
      .eq("version", payload.version).select("*").maybeSingle();
    if (error) {
      return failure(
        request,
        /sns_input_invalid|check constraint/i.test(String(error.message || ""))
          ? "post_invalid"
          : "post_edit_failed",
        /sns_input_invalid|check constraint/i.test(String(error.message || ""))
          ? 400
          : 503,
      );
    }
    if (!data) return failure(request, "version_conflict", 409);
    return json(request, { ok: true, post: publicSocialPost(data, owner!.id) });
  }
  if (action === "delete") {
    const owner = await authUser(request, deps, true);
    if (!isSocialUuid(payload.postId)) {
      return failure(request, "post_id_invalid");
    }
    const current = await admin.from("sns_posts").select("*").eq(
      "id",
      payload.postId,
    ).eq("owner_id", owner!.id).maybeSingle();
    if (current.error) return failure(request, "post_delete_failed", 503);
    if (!current.data) return failure(request, "post_not_found", 404);
    let row = current.data;
    if (row.state !== "deleted") {
      const changed = await admin.from("sns_posts").update({
        state: "deleted",
        visibility: "private",
        title: "削除した投稿", body: "削除済み", author_name: "削除済み",
        version: row.version + 1,
        updated_at: new Date().toISOString(),
        cleanup_pending: row.kind === "music",
      }).eq("id", row.id).eq("owner_id", owner!.id).eq("state", row.state).eq(
        "version",
        row.version,
      ).select("*").maybeSingle();
      if (changed.error) return failure(request, "post_delete_failed", 503);
      if (!changed.data) return failure(request, "version_conflict", 409);
      row = changed.data;
    }
    if (row.kind === "music") {
      const cleanup = await cleanupDeletedAudio(admin, owner!.id, row.id);
      return json(request, {
        ok: true,
        deleted: true,
        cleanupPending: cleanup.pending,
      });
    }
    return json(request, { ok: true, deleted: true, cleanupPending: false });
  }
  if (action === "report") {
    const owner = await authUser(request, deps, true);
    const target = parseSocialTarget(payload.target, { report: true });
    const reason = payload.reason;
    const details = cleanSocialText(payload.details ?? "", 500);
    if (
      !target || target.type === "comment" ||
      !["copyright", "harmful", "spam", "other"].includes(String(reason)) ||
      details === null
    ) return failure(request, "report_invalid");
    if (!await targetIsPublic(admin, target)) {
      return failure(request, "target_not_found", 404);
    }
    const { data, error } = await admin.rpc("pixieed_sns_report", {
      p_reporter_id: owner!.id,
      p_target: `${target.type}:${target.id}`,
      p_reason: reason,
      p_details: details,
    });
    if (error) return dbError(request, error, "report_failed");
    if (data !== true) return failure(request, "report_failed", 503);
    return json(request, { ok: true, reported: true });
  }
  return failure(request, "action_invalid");
}

export async function socialFeedHandler(request: Request, deps: Deps = {}) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (!allowedOrigin(request)) {
    return failure(request, "origin_not_allowed", 403);
  }
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("action") !== "audio") {
      return failure(request, "action_invalid");
    }
    try {
      return await handleAudio(request, deps);
    } catch (error) {
      return error instanceof HttpError
        ? failure(request, error.code, error.status)
        : failure(request, "audio_unavailable", 503);
    }
  }
  if (request.method !== "POST") {
    return failure(request, "method_not_allowed", 405);
  }
  try {
    const { payload, audio } = await readSocialRequestBody(request);
    if (!validPayloadObject(payload)) {
      return failure(request, "request_json_invalid");
    }
    return await processAction(request, payload, audio, deps);
  } catch (error) {
    if (error instanceof HttpError) {
      return failure(request, error.code, error.status);
    }
    if (error instanceof SocialWavError) {
      return failure(
        request,
        error.code,
        error.code === "request_too_large" ? 413 : 400,
      );
    }
    return failure(request, "request_failed", 503);
  }
}

if (import.meta.main) Deno.serve((request) => socialFeedHandler(request));
