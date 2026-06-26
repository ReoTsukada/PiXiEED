import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.46.1";

const STORAGE_BUCKET = "pixieed-contest";
const DEFAULT_LIMIT = 100;

type SupabaseAdminClient = any;
type PlazaArtworkCleanupRow = {
  id: string;
  storage_path: string | null;
  thumbnail_path: string | null;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  return String(error || fallback);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.method !== "POST") return {};
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value as Record<string, unknown> : {};
  } catch (_error) {
    return {};
  }
}

function readLimit(url: URL, body: Record<string, unknown>): number {
  const raw = body.limit ?? url.searchParams.get("limit") ?? DEFAULT_LIMIT;
  return Math.max(1, Math.min(500, Number(raw) || DEFAULT_LIMIT));
}

function readDryRun(url: URL, body: Record<string, unknown>): boolean {
  const raw = body.dryRun ?? url.searchParams.get("dryRun") ?? url.searchParams.get("dry_run") ?? false;
  return raw === true || raw === "true" || raw === "1";
}

function readProvidedSecret(request: Request, url: URL): string {
  return request.headers.get("x-pixieed-plaza-cleanup-secret")
    || url.searchParams.get("secret")
    || "";
}

function uniqueStoragePaths(rows: PlazaArtworkCleanupRow[]): string[] {
  const paths = new Set<string>();
  rows.forEach((row) => {
    [row.storage_path, row.thumbnail_path].forEach((value) => {
      const path = String(value || "").trim();
      if (path && path.startsWith("plaza/")) paths.add(path);
    });
  });
  return Array.from(paths);
}

async function selectCleanupTargets(
  supabase: SupabaseAdminClient,
  nowIso: string,
  limit: number,
): Promise<PlazaArtworkCleanupRow[]> {
  const { data, error } = await supabase
    .from("plaza_artworks")
    .select("id,storage_path,thumbnail_path")
    .or(`expires_at.lte.${nowIso},deleted_at.not.is.null,moderation_status.eq.deleted`)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return Array.isArray(data) ? data as PlazaArtworkCleanupRow[] : [];
}

async function deleteReports(supabase: SupabaseAdminClient, artworkIds: string[]) {
  if (!artworkIds.length) return 0;
  const { data, error } = await supabase
    .from("plaza_reports")
    .delete()
    .eq("target_type", "artwork")
    .in("target_id", artworkIds)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

async function deleteArtworks(supabase: SupabaseAdminClient, artworkIds: string[]) {
  if (!artworkIds.length) return 0;
  const { data, error } = await supabase
    .from("plaza_artworks")
    .delete()
    .in("id", artworkIds)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

async function deleteExpiredLooseComments(supabase: SupabaseAdminClient, nowIso: string) {
  const { data, error } = await supabase
    .from("plaza_artwork_comments")
    .delete()
    .lte("expires_at", nowIso)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

serve(async (request) => {
  if (request.method !== "GET" && request.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const expectedSecret = Deno.env.get("PIXIEED_PLAZA_CLEANUP_SECRET") || "";
  const providedSecret = readProvidedSecret(request, url);
  if (!expectedSecret) {
    return json({ ok: false, error: "cleanup secret is not configured" }, 500);
  }
  if (providedSecret !== expectedSecret) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: "supabase env missing" }, 500);
  }

  const body = await readBody(request);
  const limit = readLimit(url, body);
  const dryRun = readDryRun(url, body);
  const nowIso = new Date().toISOString();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    const targets = await selectCleanupTargets(supabase, nowIso, limit);
    const artworkIds = targets.map((row) => row.id).filter(Boolean);
    const storagePaths = uniqueStoragePaths(targets);

    if (dryRun) {
      return json({
        ok: true,
        dryRun,
        now: nowIso,
        targetCount: targets.length,
        storagePathCount: storagePaths.length,
        artworkIds,
        storagePaths,
      });
    }

    let storageRemoved = 0;
    if (storagePaths.length) {
      const { data, error } = await supabase.storage.from(STORAGE_BUCKET).remove(storagePaths);
      if (error) throw error;
      storageRemoved = Array.isArray(data) ? data.length : storagePaths.length;
    }

    const reportsDeleted = await deleteReports(supabase, artworkIds);
    const artworksDeleted = await deleteArtworks(supabase, artworkIds);
    const looseCommentsDeleted = await deleteExpiredLooseComments(supabase, nowIso);

    return json({
      ok: true,
      dryRun,
      now: nowIso,
      targetCount: targets.length,
      storagePathCount: storagePaths.length,
      storageRemoved,
      reportsDeleted,
      artworksDeleted,
      looseCommentsDeleted,
    });
  } catch (error) {
    return json({ ok: false, error: errorMessage(error, "cleanup failed") }, 500);
  }
});
