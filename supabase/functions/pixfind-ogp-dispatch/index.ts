import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const PUZZLE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,119}$/i;
const REPOSITORY = "ReoTsukada/PiXiEED";
const EVENT_TYPE = "pixfind-ogp-published";
const allowedOrigins = new Set([
  "https://pixieed.jp",
  "https://www.pixieed.jp",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

type PuzzleRow = {
  id: string;
  client_id: string | null;
  creator_user_id: string | null;
};

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://pixieed.jp",
    "access-control-allow-headers": "authorization, x-client-info, x-client-id, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim() || "";
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function adminClient() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requestUserId(request: Request): Promise<string | null> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")?.trim() || "";
  if (!token || token === anonKey) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  return error || !data.user || data.user.is_anonymous ? null : data.user.id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse(request, { error: "method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({})) as { puzzle_id?: unknown };
    const puzzleId = typeof body.puzzle_id === "string" ? body.puzzle_id.trim() : "";
    if (!PUZZLE_ID_PATTERN.test(puzzleId)) return jsonResponse(request, { error: "invalid puzzle id" }, 400);

    const { data, error } = await adminClient()
      .from("pixfind_puzzles")
      .select("id,client_id,creator_user_id")
      .eq("id", puzzleId)
      .maybeSingle<PuzzleRow>();
    if (error) throw error;
    if (!data) return jsonResponse(request, { error: "puzzle not found" }, 404);

    const clientId = request.headers.get("x-client-id")?.trim() || "";
    const userId = await requestUserId(request);
    const isClientOwner = Boolean(clientId && data.client_id && clientId === data.client_id);
    const isAccountOwner = Boolean(userId && data.creator_user_id && userId === data.creator_user_id);
    if (!isClientOwner && !isAccountOwner) return jsonResponse(request, { error: "not allowed" }, 403);

    const dispatchResponse = await fetch(`https://api.github.com/repos/${REPOSITORY}/dispatches`, {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${requiredEnv("GITHUB_PIXFIND_OGP_DISPATCH_TOKEN")}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: EVENT_TYPE, client_payload: { puzzle_id: puzzleId } }),
    });
    if (!dispatchResponse.ok) {
      throw new Error(`GitHub dispatch failed: ${dispatchResponse.status} ${await dispatchResponse.text()}`);
    }
    return jsonResponse(request, { queued: true, puzzle_id: puzzleId });
  } catch (error) {
    console.error("pixfind OGP dispatch failed", error);
    return jsonResponse(request, { error: error instanceof Error ? error.message : "dispatch failed" }, 502);
  }
});
