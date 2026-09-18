import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_BYTES = 512 * 1024;
const MIN_PIXELS = 8;
const MAX_PIXELS = 128;
const ALLOWED_MIME = new Set(["image/png", "image/webp"]);

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

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.slice(start, start + length));

function readPngDimensions(bytes: Uint8Array) {
  if (bytes.length < 24 || ascii(bytes, 0, 8) !== "\x89PNG\r\n\x1a\n") {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function readWebpDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 30 || ascii(bytes, 0, 4) !== "RIFF" ||
    ascii(bytes, 8, 4) !== "WEBP"
  ) return null;
  const type = ascii(bytes, 12, 4);
  if (type === "VP8X" && bytes.length >= 30) {
    const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
    const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    return { width, height };
  }
  if (
    type === "VP8 " && bytes.length >= 30 && bytes[23] === 0x9d &&
    bytes[24] === 0x01 && bytes[25] === 0x2a
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  // VP8L stores dimensions as packed 14-bit values. The signature byte is
  // deliberately checked so an arbitrary RIFF file cannot pass as an image.
  if (type === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const width = 1 + ((bytes[21] | (bytes[22] << 8)) & 0x3fff);
    const height = 1 +
      (((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10)) &
        0x3fff);
    return { width, height };
  }
  return null;
}

function readImageDimensions(bytes: Uint8Array, mime: string) {
  return mime === "image/png"
    ? readPngDimensions(bytes)
    : readWebpDimensions(bytes);
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
  const device = location.device && typeof location.device === "object"
    ? location.device as Record<string, unknown>
    : null;
  const cell = location.mapCell && typeof location.mapCell === "object"
    ? location.mapCell as Record<string, unknown>
    : null;
  const latitude = device ? Number(device.latitude) : Number.NaN;
  const longitude = device ? Number(device.longitude) : Number.NaN;
  const accuracy = device ? Number(device.accuracy) : Number.NaN;
  const hasDevice = Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
    (!Number.isFinite(accuracy) || (accuracy >= 0 && accuracy <= 50000));
  const grid = cell ? Number(cell.grid) : Number.NaN;
  const cellX = cell ? Number(cell.x) : Number.NaN;
  const cellY = cell ? Number(cell.y) : Number.NaN;
  const prefectureCode = cell ? String(cell.prefectureCode || "") : "";
  const hasCell = Number.isInteger(grid) &&
    [64, 128, 256, 512].includes(grid) &&
    Number.isInteger(cellX) && cellX >= 0 && cellX < grid &&
    Number.isInteger(cellY) && cellY >= 0 && cellY < grid &&
    /^(0[1-9]|[1-4][0-9])$/.test(prefectureCode);
  if (!hasDevice && !hasCell) return null;
  return {
    latitude: hasDevice ? latitude : null,
    longitude: hasDevice ? longitude : null,
    accuracy_m: hasDevice && Number.isFinite(accuracy) ? accuracy : null,
    source: hasDevice ? "device" : "map-cell",
    map_space: "japan",
    cell_grid: hasCell ? grid : null,
    cell_x: hasCell ? cellX : null,
    cell_y: hasCell ? cellY : null,
    prefecture_code: hasCell ? prefectureCode : null,
    captured_at: hasDevice ? new Date().toISOString() : null,
  };
}

function extensionFor(mime: string) {
  return mime === "image/webp" ? "webp" : "png";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return fail(request, "method_not_allowed", 405);
  }
  if (!supabaseUrl || !publishableKey || !secretKey) {
    return fail(request, "function_not_configured", 503);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return fail(request, "authentication_required", 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return fail(request, "invalid_json");
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return fail(request, "authentication_required", 401);
  }

  const title = String(body.title || "").trim();
  const caption = String(body.caption || "").trim();
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
  const bytes = decodeBase64(image.base64);
  if (!bytes) return fail(request, "image_size_invalid");
  const dimensions = readImageDimensions(bytes, mime);
  if (
    !dimensions || dimensions.width < MIN_PIXELS ||
    dimensions.height < MIN_PIXELS ||
    dimensions.width > MAX_PIXELS || dimensions.height > MAX_PIXELS
  ) {
    return fail(request, "image_pixels_invalid");
  }

  const location = normalizeLocation(body.location);
  if (!location) return fail(request, "location_required");

  const contentHash = await sha256(bytes);
  const admin = createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data: duplicate, error: duplicateError } = await admin
    .from("user_posts")
    .select("id,status")
    .eq("content_hash", contentHash)
    .maybeSingle();
  if (duplicateError) return fail(request, "duplicate_check_failed", 500);
  if (duplicate) return fail(request, "image_already_submitted", 409);

  const postId = crypto.randomUUID();
  const imagePath = `${userData.user.id}/${postId}.${extensionFor(mime)}`;
  const upload = await admin.storage.from("post-quarantine").upload(
    imagePath,
    new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime }),
    { cacheControl: "31536000", contentType: mime, upsert: false },
  );
  if (upload.error) return fail(request, "image_upload_failed", 500);

  const postInsert = await admin.from("user_posts").insert({
    id: postId,
    author_id: userData.user.id,
    title,
    caption,
    image_path: imagePath,
    image_mime: mime,
    image_bytes: bytes.byteLength,
    image_width: dimensions.width,
    image_height: dimensions.height,
    color_count: Number.isInteger(image.colorCount)
      ? Number(image.colorCount)
      : null,
    content_hash: contentHash,
    status: "pending",
  });
  if (postInsert.error) {
    await admin.storage.from("post-quarantine").remove([imagePath]);
    return fail(request, "post_save_failed", 500);
  }

  const locationInsert = await admin.from("post_locations_private").insert({
    post_id: postId,
    ...location,
  });
  if (locationInsert.error) {
    await admin.from("user_posts").delete().eq("id", postId);
    await admin.storage.from("post-quarantine").remove([imagePath]);
    return fail(request, "location_save_failed", 500);
  }

  return json(request, {
    ok: true,
    postId,
    status: "pending",
    message: "投稿を受け付けました。確認後に地図へ表示します。",
  }, 201);
});
