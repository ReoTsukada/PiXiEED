import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  jsonResponse,
  readJson,
  stringArray,
} from "../_shared/market-stripe.ts";

const BUCKET = "market-private";
const PREVIEW_URL_TTL_SECONDS = 60 * 60;
const MAX_ASSET_IDS = 120;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AssetRow = {
  id: string;
  preview_object_path: string | null;
};

async function previewUrl(admin: ReturnType<typeof createAdminClient>, path: string) {
  if (/^https:\/\//i.test(path)) return path;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, PREVIEW_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw error || new Error("preview URL could not be created");
  return data.signedUrl;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse(request, { error: "method not allowed" }, 405);
  try {
    const body = await readJson(request);
    const assetIds = Array.from(new Set(stringArray(body.asset_ids)
      .filter((id) => UUID_PATTERN.test(id)))).slice(0, MAX_ASSET_IDS);
    if (!assetIds.length) return jsonResponse(request, { previews: {}, expires_in: PREVIEW_URL_TTL_SECONDS });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("market_assets")
      .select("id,preview_object_path")
      .in("id", assetIds)
      .eq("status", "published");
    if (error) throw error;

    const previews = Object.fromEntries((await Promise.all(((data || []) as AssetRow[]).map(async (asset) => {
      if (!asset.preview_object_path) return [asset.id, ""] as const;
      try {
        return [asset.id, await previewUrl(admin, asset.preview_object_path)] as const;
      } catch (_error) {
        return [asset.id, ""] as const;
      }
    }))).filter(([, url]) => Boolean(url)));
    return jsonResponse(request, { previews, expires_in: PREVIEW_URL_TTL_SECONDS });
  } catch (error) {
    return jsonResponse(request, { error: errorMessage(error, "公開プレビューを準備できませんでした") }, 500);
  }
});
