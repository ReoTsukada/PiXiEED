import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { normalizeGlobeCell } from "../_shared/globe-cell.ts";

const SIGNED_URL_TTL = 5 * 60;
const MAX_PENDING = 50;
const VALID_GRIDS = new Set([64, 128, 256, 512]);

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

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);

function getBearerToken(request: Request) {
  const value = request.headers.get("authorization") || "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() : "";
}

function adminUserIds() {
  return new Set(
    env("SUPABASE_ADMIN_USER_IDS").split(",").map((value) => value.trim())
      .filter(Boolean),
  );
}

async function requireAdmin(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return {
      user: null,
      error: "authentication_required" as const,
      status: 401,
    };
  }
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return {
      user: null,
      error: "function_not_configured" as const,
      status: 503,
    };
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data.user) {
    return {
      user: null,
      error: "authentication_required" as const,
      status: 401,
    };
  }

  const hasAdminRole = data.user.app_metadata?.role === "admin";
  const isAllowlisted = adminUserIds().has(data.user.id);
  if (data.user.is_anonymous || (!hasAdminRole && !isAllowlisted)) {
    return { user: null, error: "admin_access_required" as const, status: 403 };
  }
  return { user: data.user, error: null, status: 200 };
}

function normalizeMapCell(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const grid = Number(value.grid);
  const x = Number(value.x);
  const y = Number(value.y);
  const prefectureCode = String(value.prefectureCode || "");
  if (
    !VALID_GRIDS.has(grid) || !Number.isInteger(x) || x < 0 || x >= grid ||
    !Number.isInteger(y) || y < 0 || y >= grid ||
    !/^(0[1-9]|[1-4][0-9])$/.test(prefectureCode)
  ) return null;
  return { grid, x, y, prefectureCode };
}

function publicImagePath(postId: string, mime: string) {
  return `${postId}/${mime === "image/webp" ? "image.webp" : "image.png"}`;
}

function locationPayload(location: Record<string, unknown> | null) {
  if (!location) return null;
  const cell = location.cell_grid
    ? {
      grid: Number(location.cell_grid),
      x: Number(location.cell_x),
      y: Number(location.cell_y),
      prefectureCode: String(location.prefecture_code || ""),
    }
    : null;
  const globeCell = normalizeGlobeCell({
    id: location.globe_cell_id,
    version: location.projection_version,
    band: location.globe_band,
    column: location.globe_column,
  });
  return {
    source: location.source,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracyM: location.accuracy_m,
    mapCell: cell && normalizeMapCell(cell),
    globeCell,
  };
}

async function listPending(admin: any) {
  const { data: posts, error } = await admin
    .from("user_posts")
    .select(
      "id,title,caption,image_path,image_mime,image_bytes,image_width,image_height,color_count,status,created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(MAX_PENDING);
  if (error) throw new Error("pending_posts_read_failed");

  const ids = (posts || []).map((post: any) => post.id);
  const locations = ids.length
    ? await admin.from("post_locations_private").select(
      "post_id,latitude,longitude,accuracy_m,source,cell_grid,cell_x,cell_y,prefecture_code,projection_version,globe_cell_id,globe_band,globe_column",
    ).in("post_id", ids)
    : { data: [], error: null };
  if (locations.error) throw new Error("private_locations_read_failed");
  const locationByPost = new Map(
    (locations.data || []).map((location: any) => [location.post_id, location]),
  );
  const storage = admin.storage.from("post-quarantine");
  const result = [];
  for (const post of posts || []) {
    const signed = await storage.createSignedUrl(
      post.image_path,
      SIGNED_URL_TTL,
    );
    if (signed.error || !signed.data?.signedUrl) continue;
    result.push({
      postId: post.id,
      title: post.title,
      caption: post.caption,
      imageUrl: signed.data.signedUrl,
      imageMime: post.image_mime,
      imageBytes: post.image_bytes,
      imageWidth: post.image_width,
      imageHeight: post.image_height,
      colorCount: post.color_count,
      status: post.status,
      createdAt: post.created_at,
      location: locationPayload(
        (locationByPost.get(post.id) || null) as Record<string, unknown> | null,
      ),
    });
  }
  return result;
}

async function moderatePost(admin: any, body: Record<string, unknown>) {
  const postId = String(body.postId || "");
  const action = String(body.action || "");
  if (!isUuid(postId)) throw new Error("post_id_invalid");
  if (!["approve", "reject"].includes(action)) {
    throw new Error("action_invalid");
  }

  const { data: post, error: postError } = await admin
    .from("user_posts")
    .select("id,title,caption,image_path,image_mime,status")
    .eq("id", postId)
    .maybeSingle();
  if (postError) throw new Error("post_read_failed");
  if (!post) throw new Error("post_not_found");
  if (post.status === "published" && action === "reject") {
    throw new Error("post_already_published");
  }

  const note = String(body.note || "").trim().slice(0, 500);
  if (action === "reject") {
    const rejected = await admin.from("user_posts").update({
      status: "rejected",
      moderation_note: note || "管理者確認で公開しない投稿です。",
      published_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);
    if (rejected.error) throw new Error("post_reject_failed");
    return { postId, status: "rejected" };
  }

  const { data: location, error: locationError } = await admin
    .from("post_locations_private")
    .select(
      "latitude,longitude,accuracy_m,source,cell_grid,cell_x,cell_y,prefecture_code,projection_version,globe_cell_id,globe_band,globe_column",
    )
    .eq("post_id", postId)
    .maybeSingle();
  if (locationError) throw new Error("private_location_read_failed");
  const requestedCell = normalizeMapCell(body.mapCell);
  const storedLocation = locationPayload(location || null);
  const cell = requestedCell || storedLocation?.mapCell || null;
  const globeCell = storedLocation?.globeCell || null;
  if (!cell && !globeCell) throw new Error("public_map_cell_required");

  const quarantine = admin.storage.from("post-quarantine");
  const publicStorage = admin.storage.from("post-public");
  const downloaded = await quarantine.download(post.image_path);
  if (downloaded.error || !downloaded.data) {
    throw new Error("quarantine_image_read_failed");
  }
  const publicPath = publicImagePath(postId, post.image_mime);
  const uploaded = await publicStorage.upload(publicPath, downloaded.data, {
    cacheControl: "31536000",
    contentType: post.image_mime,
    upsert: true,
  });
  if (uploaded.error) throw new Error("public_image_write_failed");

  const publishedAt = new Date().toISOString();
  const publicLocation = globeCell
    ? {
      map_space: "globe",
      projection_version: globeCell.version,
      cell_grid: null,
      cell_x: null,
      cell_y: null,
      prefecture_code: null,
      globe_cell_id: globeCell.id,
      globe_band: globeCell.band,
      globe_column: globeCell.column,
    }
    : {
      map_space: "japan",
      projection_version: "japan-cell-v1",
      cell_grid: cell!.grid,
      cell_x: cell!.x,
      cell_y: cell!.y,
      prefecture_code: cell!.prefectureCode,
      globe_cell_id: null,
      globe_band: null,
      globe_column: null,
    };
  const publicPoint = await admin.from("post_map_points").upsert({
    post_id: postId,
    ...publicLocation,
    title: post.title,
    caption: post.caption,
    public_image_path: publicPath,
    published_at: publishedAt,
  }, { onConflict: "post_id" });
  if (publicPoint.error) throw new Error("public_map_point_write_failed");

  const published = await admin.from("user_posts").update({
    status: "published",
    moderation_note: note,
    published_at: publishedAt,
    updated_at: publishedAt,
  }).eq("id", postId);
  if (published.error) throw new Error("post_publish_failed");
  return { postId, status: "published", mapCell: cell, globeCell };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return fail(request, "method_not_allowed", 405);
  }

  const auth = await requireAdmin(request);
  if (auth.error) return fail(request, auth.error, auth.status);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(request, "invalid_json");
  }

  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  try {
    if (body.action === "list") {
      return json(request, { ok: true, posts: await listPending(admin) });
    }
    return json(request, { ok: true, result: await moderatePost(admin, body) });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : "moderation_failed";
    const status = message === "post_not_found"
      ? 404
      : message === "post_already_published"
      ? 409
      : message === "public_map_cell_required"
      ? 422
      : 400;
    return fail(request, message, status);
  }
});
