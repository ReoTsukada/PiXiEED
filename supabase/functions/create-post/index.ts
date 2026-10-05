import { publishOrdinaryPost } from "../_shared/auto-publish-post.ts";
import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { normalizeGlobeCell } from "../_shared/globe-cell.ts";
import { verifyPixelPngClaim, PixelPngError } from "../_shared/pixel-png.mjs";
import { keyAwareFetch } from "../_shared/key-aware-fetch.ts";
import { admitPuzzleUpload, PuzzleAdmissionError } from "../_shared/puzzle-admission.mjs";
import { isUuid, requestDigest, rpcRecord } from "../_shared/post-publication.ts";

const MAX_BYTES = 512 * 1024;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_COLORS = 128;
const ALLOWED_MIME = new Set(["image/png"]);

const env = (name: string) => Deno.env.get(name)?.trim() || "";
const supabaseUrl = env("SUPABASE_URL");

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
const secretKey = env("SUPABASE_SECRET_KEY") ||
  env("SUPABASE_SERVICE_ROLE_KEY") ||
  defaultKeyDictionaryValue("SUPABASE_SECRET_KEYS");
const LOCAL_ORIGINS = new Set([
  "https://pixieed.jp",
  "https://www.pixieed.jp",
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

function allowedOrigins() {
  return env("PUBLIC_SITE_ORIGIN").split(",").map((origin) => origin.trim())
    .filter(Boolean);
}

const corsHeaders = (request: Request): HeadersInit => {
  const requestOrigin = request.headers.get("origin") || "";
  const configuredOrigins = allowedOrigins();
  const originIsAllowed = !requestOrigin ||
    (configuredOrigins.length
      ? configuredOrigins.includes(requestOrigin)
      : LOCAL_ORIGINS.has(requestOrigin));
  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": requestOrigin
      ? (originIsAllowed ? requestOrigin : "null")
      : (configuredOrigins[0] || "null"),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
  };
};

const json = (request: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders(request) });

const fail = (request: Request, message: string, status = 400) =>
  json(request, { ok: false, error: message }, status);

async function readBoundedJson(request: Request): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

function decodeBase64(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    return null;
  }
  if (value.length > Math.ceil(MAX_BYTES / 3) * 4 + 8) return null;
  try {
    const binary = atob(value);
    if (binary.length === 0 || binary.length > MAX_BYTES) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer as ArrayBuffer,
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function normalizeLocation(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const location = input as Record<string, unknown>;
  const globeCell = normalizeGlobeCell(location.globeCell);
  if (globeCell) {
    return {
      latitude: null,
      longitude: null,
      accuracy_m: null,
      source: "map-cell",
      map_space: "globe",
      cell_grid: null,
      cell_x: null,
      cell_y: null,
      prefecture_code: null,
      captured_at: null,
      projection_version: globeCell.version,
      globe_cell_id: globeCell.id,
      globe_band: globeCell.band,
      globe_column: globeCell.column,
    };
  }
  const cell = location.mapCell && typeof location.mapCell === "object"
    ? location.mapCell as Record<string, unknown>
    : null;
  const grid = cell ? Number(cell.grid) : Number.NaN;
  const cellX = cell ? Number(cell.x) : Number.NaN;
  const cellY = cell ? Number(cell.y) : Number.NaN;
  const prefectureCode = cell ? String(cell.prefectureCode || "") : "";
  const hasCell = Number.isInteger(grid) &&
    [64, 128, 256, 512].includes(grid) &&
    Number.isInteger(cellX) && cellX >= 0 && cellX < grid &&
    Number.isInteger(cellY) && cellY >= 0 && cellY < grid &&
    /^(0[1-9]|[1-4][0-9])$/.test(prefectureCode);
  if (!hasCell) return null;
  return {
    latitude: null,
    longitude: null,
    accuracy_m: null,
    source: "map-cell",
    map_space: "japan",
    cell_grid: grid,
    cell_x: cellX,
    cell_y: cellY,
    prefecture_code: prefectureCode,
    captured_at: null,
    projection_version: null,
    globe_cell_id: null,
    globe_band: null,
    globe_column: null,
  };
}

export async function createPostHandler(request: Request, deps: {
  createClient?: typeof createClient;
  projectUrl?: string;
  publishableKey?: string;
  serviceKey?: string;
} = {}) {
  const makeClient = deps.createClient || createClient;
  const projectUrl = deps.projectUrl ?? supabaseUrl;
  const publicKey = deps.publishableKey ?? publishableKey;
  const privateKey = deps.serviceKey ?? secretKey;
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return fail(request, "method_not_allowed", 405);
  }
  if (!projectUrl || !publicKey || !privateKey) {
    return fail(request, "function_not_configured", 503);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return fail(request, "authentication_required", 401);
  }

  const body = await readBoundedJson(request);
  if (!body) return fail(request, "invalid_json_or_body_too_large", 413);

  const userClient = makeClient(projectUrl, publicKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: authorization }, fetch: keyAwareFetch(publicKey) },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return fail(request, "authentication_required", 401);
  }

  const title = String(body.title || "").trim();
  const caption = String(body.caption || "").trim();
  const postKind = body.postKind === "pixel_camera" ? "pixel_camera" :
    (body.postKind === "pixel_art" || body.postKind == null) ? "pixel_art" : null;
  if (!postKind) return fail(request, "post_kind_invalid");
  if (!title || title.length > 60 || caption.length > 180) {
    return fail(request, "text_length_invalid");
  }

  const image = body.image && typeof body.image === "object"
    ? body.image as Record<string, unknown>
    : null;
  const mime = String(image?.mimeType || "");
  if (!image || !ALLOWED_MIME.has(mime)) {
    return fail(request, "image_type_invalid");
  }
  if (!Number.isInteger(image.colorCount) || Number(image.colorCount) < 1 ||
      Number(image.colorCount) > MAX_COLORS) {
    return fail(request, "image_colors_invalid");
  }
  const bytes = decodeBase64(image.base64);
  if (!bytes) return fail(request, "image_size_invalid");
  let dimensions: { width: number; height: number; colorCount: number };
  try { dimensions = await verifyPixelPngClaim(bytes, image); }
  catch (error) { return fail(request, error instanceof PixelPngError ? error.code : "image_decode_invalid"); }

  const location = normalizeLocation(body.location);
  if (!location) return fail(request, "location_required");

  const contentHash = await sha256(bytes);
  const admin = makeClient(projectUrl, privateKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { fetch: keyAwareFetch(privateKey) },
  });
  const requestKey = body.requestKey == null || body.requestKey === "" ? null : body.requestKey;
  if (requestKey !== null && !isUuid(requestKey)) return fail(request, "request_key_invalid");
  let admittedPuzzle: Awaited<ReturnType<typeof admitPuzzleUpload>> | null = null;
  if (body.puzzle != null) {
    try { admittedPuzzle = await admitPuzzleUpload(body.puzzle, bytes, image); }
    catch (error) {
      const code = error instanceof PuzzleAdmissionError ? error.code : "puzzle_invalid";
      return fail(request, code);
    }
  }
  const puzzleHash = admittedPuzzle ? await requestDigest({
    mode: admittedPuzzle.mode,
    source: admittedPuzzle.source,
    definition: admittedPuzzle.definition,
    changedHash: admittedPuzzle.changed ? await sha256(admittedPuzzle.changed.bytes) : null,
  }) : null;
  const digest = requestKey ? await requestDigest({
    title, caption, postKind, location, imageHash: contentHash, puzzleHash,
  }) : null;
  const finishCreate = async (record: Record<string, unknown>, statusCode: number) => {
    let completed = record;
    if (!admittedPuzzle) {
      try {
        completed = { ...record, ...await publishOrdinaryPost(admin, String(record.postId || ""), userData.user.id) };
      } catch {
        // Keep the saved post and request key available for a retry; never claim pending as published.
        return fail(request, "post_publication_failed", 503);
      }
    }
    if (!["pending", "published"].includes(String(completed.status))) return fail(request, "post_not_public", 409);
    return json(request, { ...completed, ok: true,
      message: completed.status === "published" ? "投稿を地図に公開しました。" : "投稿を受け付けました。確認後に地図へ表示します。",
    }, statusCode);
  };
  if (requestKey && digest) {
    const lookup = await admin.rpc("pixieed_lookup_post_request", {
      p_author_id: userData.user.id, p_request_key: requestKey, p_request_digest: digest,
    });
    if (lookup.error) {
      if (String(lookup.error.message || "").includes("request_digest_mismatch")) {
        return fail(request, "request_key_digest_mismatch", 409);
      }
      return fail(request, "request_lookup_failed", 500);
    }
    const prior = rpcRecord(lookup.data);
    if (prior) return await finishCreate({ postId: prior.postId, status: prior.status, replayed: true }, 200);
  }
  const postId = crypto.randomUUID();
  const imagePath = `${userData.user.id}/${postId}.png`;
  const changedPath = admittedPuzzle?.changed ? `${userData.user.id}/${postId}-changed.png` : null;
  const upload = await admin.storage.from("post-quarantine").upload(
    imagePath,
    new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }),
    { cacheControl: "31536000", contentType: mime, upsert: false },
  );
  if (upload.error) return fail(request, "image_upload_failed", 500);

  if (admittedPuzzle?.changed && changedPath) {
    const changedUpload = await admin.storage.from("post-quarantine").upload(changedPath,
      new Blob([admittedPuzzle.changed.bytes.slice().buffer as ArrayBuffer], { type: "image/png" }),
      { cacheControl: "31536000", contentType: "image/png", upsert: false });
    if (changedUpload.error) {
      await admin.storage.from("post-quarantine").remove([imagePath]);
      return fail(request, "puzzle_image_upload_failed", 500);
    }
  }
  const pPost = {
    id: postId,
    author_id: userData.user.id,
    title,
    caption,
    post_kind: postKind,
    image_path: imagePath,
    image_mime: mime,
    image_bytes: bytes.byteLength,
    image_width: dimensions.width,
    image_height: dimensions.height,
    color_count: dimensions.colorCount,
    content_hash: contentHash,
    status: "pending",
    ...(requestKey ? { request_key: requestKey, request_digest: digest } : {}),
  };
  const pPuzzle = admittedPuzzle ? {
    mode: admittedPuzzle.mode,
    schema_version: 1,
    source_metadata: admittedPuzzle.source,
    definition: admittedPuzzle.definition,
    definition_hash: await requestDigest(admittedPuzzle.definition),
    ...(admittedPuzzle.changed ? {
      changed_image_path: changedPath,
      changed_image_claim: {
        mimeType: "image/png", size: admittedPuzzle.changed.bytes.byteLength,
        width: admittedPuzzle.changed.width, height: admittedPuzzle.changed.height,
        colorCount: admittedPuzzle.changed.colorCount,
      },
    } : {}),
  } : null;
  const attemptPaths = changedPath ? [imagePath, changedPath] : [imagePath];
  const removeAttemptAssets = async () => {
    const removed = await admin.storage.from("post-quarantine").remove(attemptPaths);
    return !removed.error;
  };
  let created;
  try {
    created = await admin.rpc("pixieed_create_post", {
      p_post: pPost, p_location: location, p_puzzle: pPuzzle,
    });
  } catch { created = { data: null, error: true }; }
  const createdRecord = !created.error ? rpcRecord(created.data) : null;
  if (!createdRecord) {
    // Resolve ambiguous RPC outcomes before deleting assets: the transaction may have committed.
    let confirmed: Record<string, unknown> | null = null;
    if (requestKey && digest) {
      const reread = await admin.rpc("pixieed_lookup_post_request", {
        p_author_id: userData.user.id, p_request_key: requestKey, p_request_digest: digest,
      });
      if (!reread.error) confirmed = rpcRecord(reread.data);
      else if (String(reread.error.message || "").includes("request_digest_mismatch")) {
        await removeAttemptAssets();
        return fail(request, "request_digest_mismatch", 409);
      }
    }
    if (confirmed) {
      const replayPostId = String(confirmed.postId || "");
      if (replayPostId.toLowerCase() !== postId.toLowerCase()) {
        const cleaned = await removeAttemptAssets();
        return await finishCreate({ postId: replayPostId, status: confirmed.status, replayed: true,
          ...(cleaned ? {} : { cleanup: "pending" }) }, 200);
      }
      return await finishCreate({ postId: replayPostId, status: confirmed.status, replayed: true }, 200);
    }
    const check = await admin.from("user_posts").select("id,status").eq("id", postId).maybeSingle();
    if (check.error) return fail(request, "post_save_outcome_unknown", 503);
    if (check.data) return await finishCreate({ postId, status: check.data.status, replayed: false }, 201);
    await removeAttemptAssets();
    return fail(request, "post_save_failed", 500);
  }

  const committedPostId = String(createdRecord.postId || "");
  if (!isUuid(committedPostId)) {
    const check = await admin.from("user_posts").select("id,status").eq("id", postId).maybeSingle();
    if (check.error) return fail(request, "post_save_outcome_unknown", 503);
    if (!check.data) { await removeAttemptAssets(); return fail(request, "post_save_failed", 500); }
  }
  const responsePostId = isUuid(committedPostId) ? committedPostId : postId;
  let cleanupPending = false;
  if (responsePostId.toLowerCase() !== postId.toLowerCase()) cleanupPending = !(await removeAttemptAssets());

  return await finishCreate({
    postId: responsePostId,
    status: createdRecord.status || "pending",
    replayed: Boolean(createdRecord.replayed) || responsePostId.toLowerCase() !== postId.toLowerCase(),
    ...(cleanupPending ? { cleanup: "pending" } : {}),
  }, createdRecord.replayed || responsePostId.toLowerCase() !== postId.toLowerCase() ? 200 : 201);
}

if (import.meta.main) Deno.serve(async (request) => {
  try { return await createPostHandler(request); }
  catch { return fail(request, "post_processing_failed", 500); }
});
