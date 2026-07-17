import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  jsonResponse,
  readJson,
  requireMarketDevUser,
  stringArray,
  stringValue,
  type JsonRecord,
} from "../_shared/market-stripe.ts";

const BUCKET = "market-private";
const FILE_URL_TTL_SECONDS = 60;
const PREVIEW_URL_TTL_SECONDS = 300;
const MAX_DELIVERIES_PER_HOUR = 30;
const ALLOWED_FORMATS = new Set([
  "pixiedraw-project",
  "png",
  "webp",
  "gif",
  "apng",
  "sprite-sheet-png",
]);
const PIXIEEDRAW_OPEN_FORMAT_PRIORITY = [
  "pixiedraw-project",
  "png",
  "webp",
  "gif",
  "apng",
  "sprite-sheet-png",
];

type AssetRow = {
  id: string;
  parent_asset_id: string | null;
  series_id: string;
  creator_display_name: string;
  title: string;
  description: string;
  sale_price_yen: number;
  asset_format: string;
  included_formats: string[] | null;
  tags: string[] | null;
  favorite_count: number;
  derivative_count: number;
  preview_object_path: string | null;
  provenance_manifest: JsonRecord | null;
};

type PackageFile = {
  original_path: string;
  name: string;
  size: number;
  mime_type: string;
  format: string;
  sha256: string;
  storage_path: string;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function safeFormats(value: unknown): string[] {
  return Array.from(new Set(stringArray(value).filter((format) => ALLOWED_FORMATS.has(format))));
}

function packageFiles(asset: AssetRow): PackageFile[] {
  const manifest = asRecord(asset.provenance_manifest);
  const storagePaths = stringArray(manifest.storage_file_paths);
  const allowedStoragePaths = new Set(storagePaths);
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  return files.flatMap((entry, index) => {
    const file = asRecord(entry);
    const storagePath = stringValue(file.storage_path) || storagePaths[index] || "";
    const format = stringValue(file.format);
    const originalPath = stringValue(file.original_path);
    if (!storagePath || !allowedStoragePaths.has(storagePath) || !ALLOWED_FORMATS.has(format) || !originalPath) return [];
    return [{
      original_path: originalPath,
      name: stringValue(file.name) || originalPath.split("/").pop() || "asset.bin",
      size: Math.max(0, Number(file.size) || 0),
      mime_type: stringValue(file.mime_type) || "application/octet-stream",
      format,
      sha256: stringValue(file.sha256),
      storage_path: storagePath,
    }];
  });
}

async function signPath(admin: ReturnType<typeof createAdminClient>, path: string, ttl: number) {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, ttl);
  if (error || !data?.signedUrl) throw error || new Error("signed URL could not be created");
  return data.signedUrl;
}

async function loadLibrary(request: Request, userId: string) {
  const admin = createAdminClient();
  const { data: purchases, error: purchaseError } = await admin
    .from("market_purchases")
    .select("id,asset_id,purchase_kind,status,paid_at,created_at")
    .eq("buyer_user_id", userId)
    .eq("status", "paid")
    .order("created_at", { ascending: false });
  if (purchaseError) throw purchaseError;
  if (!purchases?.length) return jsonResponse(request, { items: [] });

  const assetIds = Array.from(new Set(purchases.map((purchase) => String(purchase.asset_id))));
  const { data: assets, error: assetError } = await admin
    .from("market_assets")
    .select("id,parent_asset_id,series_id,creator_display_name,title,description,sale_price_yen,asset_format,included_formats,tags,favorite_count,derivative_count,preview_object_path,provenance_manifest")
    .in("id", assetIds);
  if (assetError) throw assetError;

  const assetRows = (assets || []) as AssetRow[];
  const seriesIds = Array.from(new Set(assetRows.map((asset) => asset.series_id)));
  const { data: seriesRows, error: seriesError } = seriesIds.length
    ? await admin.from("market_asset_series")
      .select("id,derivative_sales_allowed,inherited_terms,prohibited_uses,selected_option_ids")
      .in("id", seriesIds)
    : { data: [], error: null };
  if (seriesError) throw seriesError;

  const purchaseIds = purchases.map((purchase) => String(purchase.id));
  const { data: rights, error: rightError } = await admin
    .from("market_derivative_licenses")
    .select("purchase_id,status,used_by_asset_id")
    .in("purchase_id", purchaseIds);
  if (rightError) throw rightError;

  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));
  const seriesById = new Map((seriesRows || []).map((series) => [String(series.id), series]));
  const rightByPurchase = new Map((rights || []).map((right) => [String(right.purchase_id), right]));
  const items = await Promise.all(purchases.flatMap((purchase) => {
    const asset = assetById.get(String(purchase.asset_id));
    if (!asset) return [];
    return [async () => {
      let previewUrl = "";
      if (asset.preview_object_path) {
        try {
          previewUrl = await signPath(admin, asset.preview_object_path, PREVIEW_URL_TTL_SECONDS);
        } catch (_error) {
          previewUrl = "";
        }
      }
      const includedFormats = safeFormats(asset.included_formats);
      return {
        id: purchase.id,
        purchase_kind: purchase.purchase_kind,
        paid_at: purchase.paid_at,
        created_at: purchase.created_at,
        asset: {
          id: asset.id,
          parent_asset_id: asset.parent_asset_id,
          creator_display_name: asset.creator_display_name,
          title: asset.title,
          description: asset.description,
          sale_price_yen: asset.sale_price_yen,
          asset_format: asset.asset_format,
          included_formats: includedFormats.length ? includedFormats : [asset.asset_format],
          tags: Array.isArray(asset.tags) ? asset.tags.slice(0, 8) : [],
          favorite_count: Math.max(0, Number(asset.favorite_count) || 0),
          derivative_count: Math.max(0, Number(asset.derivative_count) || 0),
          preview_url: previewUrl,
          series: seriesById.get(asset.series_id) || null,
        },
        derivative_listing_right: rightByPurchase.get(String(purchase.id)) || null,
      };
    }];
  }).map((load) => load()));
  return jsonResponse(request, { items, preview_expires_in: PREVIEW_URL_TTL_SECONDS });
}

async function authorizeDelivery(request: Request, userId: string, body: JsonRecord) {
  const admin = createAdminClient();
  const assetId = stringValue(body.asset_id);
  const kind = stringValue(body.kind) === "pixieedraw-open" ? "pixieedraw-open" : "zip";
  let requestedFormats = kind === "pixieedraw-open" ? [] : safeFormats(body.formats);
  if (!assetId || (kind === "zip" && !requestedFormats.length)) return jsonResponse(request, { error: "出力形式を選択してください。" }, 400);

  const { data: purchase, error: purchaseError } = await admin
    .from("market_purchases")
    .select("id,asset_id,paid_at,created_at")
    .eq("buyer_user_id", userId)
    .eq("asset_id", assetId)
    .eq("status", "paid")
    .maybeSingle();
  if (purchaseError) throw purchaseError;
  if (!purchase) return jsonResponse(request, { error: "この商品の有効な購入権を確認できませんでした。" }, 403);

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await admin
    .from("market_download_events")
    .select("id", { count: "exact", head: true })
    .eq("buyer_user_id", userId)
    .eq("asset_id", assetId)
    .gte("created_at", oneHourAgo);
  if (countError) throw countError;
  if ((count || 0) >= MAX_DELIVERIES_PER_HOUR) {
    return jsonResponse(request, { error: "短時間に出力が集中しています。時間をおいて再試行してください。購入権は失われません。" }, 429);
  }

  const { data: assetData, error: assetError } = await admin
    .from("market_assets")
    .select("id,parent_asset_id,series_id,creator_display_name,title,description,sale_price_yen,asset_format,included_formats,tags,favorite_count,derivative_count,preview_object_path,provenance_manifest")
    .eq("id", assetId)
    .single();
  if (assetError) throw assetError;
  const asset = assetData as AssetRow;
  const includedFormats = safeFormats(asset.included_formats);
  const effectiveFormats = includedFormats.length ? includedFormats : [asset.asset_format];
  const availableFiles = packageFiles(asset);
  if (kind === "pixieedraw-open") {
    const openFormat = PIXIEEDRAW_OPEN_FORMAT_PRIORITY.find((format) => (
      effectiveFormats.includes(format) && availableFiles.some((file) => file.format === format)
    ));
    if (!openFormat) return jsonResponse(request, { error: "PiXiEEDrawで開ける収録ファイルを準備できませんでした。" }, 409);
    requestedFormats = [openFormat];
  }
  if (requestedFormats.some((format) => !effectiveFormats.includes(format))) {
    return jsonResponse(request, { error: "購入内容に含まれない形式が選択されています。" }, 400);
  }

  const files = availableFiles.filter((file) => requestedFormats.includes(file.format));
  if (!files.length) return jsonResponse(request, { error: "選択した形式のファイルを準備できませんでした。" }, 409);
  if (kind === "pixieedraw-open" && files.length > 1) files.splice(1);

  const { data: series, error: seriesError } = await admin
    .from("market_asset_series")
    .select("derivative_sales_allowed,inherited_terms,prohibited_uses,selected_option_ids")
    .eq("id", asset.series_id)
    .single();
  if (seriesError) throw seriesError;

  const traceId = crypto.randomUUID();
  const { error: auditError } = await admin.from("market_download_events").insert({
    purchase_id: purchase.id,
    asset_id: assetId,
    buyer_user_id: userId,
    delivery_kind: kind,
    selected_formats: requestedFormats,
    delivered_file_count: files.length,
    trace_id: traceId,
  });
  if (auditError) throw auditError;

  const signedFiles = await Promise.all(files.map(async (file) => ({
    original_path: file.original_path,
    name: file.name,
    size: file.size,
    mime_type: file.mime_type,
    format: file.format,
    sha256: file.sha256,
    url: await signPath(admin, file.storage_path, FILE_URL_TTL_SECONDS),
  })));

  return jsonResponse(request, {
    asset: { id: asset.id, title: asset.title },
    purchase: { id: purchase.id, paid_at: purchase.paid_at || purchase.created_at },
    kind,
    formats: requestedFormats,
    files: signedFiles,
    license: {
      derivative_sales_allowed: series.derivative_sales_allowed === true,
      inherited_terms: asRecord(series.inherited_terms),
      prohibited_uses: Array.isArray(series.prohibited_uses) ? series.prohibited_uses : [],
      selected_option_ids: stringArray(series.selected_option_ids),
      ai_training_allowed: false,
      redistribution_allowed: false,
    },
    trace_id: traceId,
    expires_in: FILE_URL_TTL_SECONDS,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse(request, { error: "method not allowed" }, 405);
  try {
    const { user } = await requireMarketDevUser(request);
    const body = await readJson(request);
    if (stringValue(body.action) === "library") return await loadLibrary(request, user.id);
    if (stringValue(body.action) === "authorize") return await authorizeDelivery(request, user.id, body);
    return jsonResponse(request, { error: "unknown action" }, 400);
  } catch (error) {
    const message = errorMessage(error, "購入済み素材を準備できませんでした");
    const status = /DEV access/i.test(message) ? 403 : /login|required|confirmed/i.test(message) ? 401 : 500;
    return jsonResponse(request, { error: message }, status);
  }
});
