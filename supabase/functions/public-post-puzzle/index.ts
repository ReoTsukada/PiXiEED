import { createClient } from "npm:@supabase/supabase-js@2.106.2";
import { keyAwareFetch } from "../_shared/key-aware-fetch.ts";
import { buildPublicPuzzleResponse } from "../_shared/public-puzzle.mjs";
import { isUuid } from "../_shared/post-publication.ts";

const MAX_IMAGE_BYTES = 512 * 1024;
const env = (name: string) => Deno.env.get(name)?.trim() || "";
const supabaseUrl = env("SUPABASE_URL");
function defaultSecretKey() {
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "") as Record<string, unknown>;
    const value = values.default || Object.values(values).find((entry) => typeof entry === "string");
    return typeof value === "string" ? value.trim() : "";
  } catch { return ""; }
}
const secretKey = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY") || defaultSecretKey();

function response(body: unknown, status: number, origin = "*") {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type",
    "Vary": "Origin",
  } });
}

type PublicReaderDependencies = {
  createClient?: typeof createClient;
  projectUrl?: string;
  serviceKey?: string;
};

/** Anonymous GET handler; the RPC is the sole database read authority. */
export async function publicPostPuzzleHandler(request: Request, deps: PublicReaderDependencies = {}) {
  const originHeader = request.headers.get("origin") || "*";
  if (request.method === "OPTIONS") return response({}, 204, originHeader);
  if (request.method !== "GET") return response({ ok: false, error: "method_not_allowed" }, 405, originHeader);
  const url = new URL(request.url);
  const ids = url.searchParams.getAll("postId");
  if (ids.length !== 1 || [...url.searchParams.keys()].some((key) => key !== "postId") || !isUuid(ids[0])) {
    return response({ ok: false, error: "post_id_invalid" }, 400, originHeader);
  }
  const projectUrl = deps.projectUrl ?? supabaseUrl;
  const serviceKey = deps.serviceKey ?? secretKey;
  if (!projectUrl || !serviceKey) return response({ ok: false, error: "function_not_configured" }, 503, originHeader);
  const makeClient = deps.createClient || createClient;
  try {
    const admin = makeClient(projectUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: keyAwareFetch(serviceKey) },
    });
    const { data, error } = await admin.rpc("pixieed_read_public_puzzle", { p_post_id: ids[0] });
    if (error) return response({ ok: false, error: "public_puzzle_unavailable" }, 503, originHeader);
    const snapshot = Array.isArray(data) ? data[0] : data;
    if (!snapshot) return response({ ok: false, error: "puzzle_not_found" }, 404, originHeader);
    if (snapshot.requestedPostId?.toLowerCase() !== ids[0].toLowerCase() ||
        snapshot.point?.postId?.toLowerCase() !== ids[0].toLowerCase() ||
        snapshot.puzzle?.postId?.toLowerCase() !== ids[0].toLowerCase()) {
      return response({ ok: false, error: "public_puzzle_unavailable" }, 503, originHeader);
    }
    const storage = admin.storage.from("post-public");
    const download = async (path: unknown) => {
      if (typeof path !== "string") throw new Error("image_path_invalid");
      const result = await storage.download(path);
      if (result.error || !result.data) throw new Error("image_unavailable");
      if (result.data.size <= 0 || result.data.size > MAX_IMAGE_BYTES) throw new Error("image_size_invalid");
      return new Uint8Array(await result.data.arrayBuffer());
    };
    const originalBytes = await download(snapshot.point.imagePath);
    const changedBytes = snapshot.puzzle.mode === "spot_difference"
      ? await download(snapshot.puzzle.changedImage?.path)
      : undefined;
    const result = await buildPublicPuzzleResponse({ ...snapshot, originalBytes, ...(changedBytes ? { changedBytes } : {}) }, projectUrl);
    return response(result, 200, originHeader);
  } catch (error) {
    const code = error instanceof Error ? error.message : "public_puzzle_unavailable";
    const status = code === "public_puzzle_parent_not_published" || code === "public_puzzle_not_approved"
      ? 404 : 503;
    return response({ ok: false, error: status === 404 ? "puzzle_not_found" : "public_puzzle_unavailable" }, status, originHeader);
  }
}

if (import.meta.main) Deno.serve((request) => publicPostPuzzleHandler(request));
