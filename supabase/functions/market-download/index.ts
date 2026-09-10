import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  jsonResponse,
  readJson,
  requireMarketUser,
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
  "aac",
  "aiff",
  "flac",
  "m4a",
  "mid",
  "midi",
  "mp3",
  "oga",
  "ogg",
  "opus",
  "wav",
  "weba",
  "novel-json",
  "visual-project",
  "text",
  "markdown",
  "html",
  "csv",
  "rtf",
  "json",
  "mp4",
  "webm",
  "mov",
  "m4v",
  "ogv",
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
  active_revision_id?: string | null;
};

type EntitlementRow = {
  id: string;
  asset_id: string;
  purchase_id: string | null;
  revision_id: string | null;
  acquisition_kind: string;
  status: string;
  content_hash: string | null;
  license_snapshot: JsonRecord | null;
  granted_at: string;
};

type RevisionRow = {
  id: string;
  asset_id: string;
  revision_number: number;
  content_hash: string | null;
  source_sha256: string | null;
  package_hash: string | null;
  manifest: JsonRecord | null;
  storage_file_paths: string[] | null;
  status: string;
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

function packageFiles(asset: AssetRow, snapshot: JsonRecord | null = null): PackageFile[] {
  const manifest = snapshot && Array.isArray(snapshot.files)
    ? snapshot
    : asRecord(asset.provenance_manifest);
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
    .in("status", ["paid", "granted"])
    .order("created_at", { ascending: false });
  if (purchaseError) throw purchaseError;
  if (!purchases?.length) return jsonResponse(request, { items: [] });

  const { data: entitlementRows, error: entitlementError } = await admin
    .from("market_asset_entitlements")
    .select("id,asset_id,purchase_id,revision_id,acquisition_kind,status,content_hash,license_snapshot,granted_at")
    .eq("user_id", userId)
    .eq("status", "active");
  if (entitlementError) throw entitlementError;

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
    .select("id,purchase_id,source_asset_id,status,used_by_asset_id,used_at")
    .in("purchase_id", purchaseIds);
  if (rightError) throw rightError;

  const assetById = new Map(assetRows.map((asset) => [asset.id, asset]));
  const seriesById = new Map((seriesRows || []).map((series) => [String(series.id), series]));
  const rightByPurchase = new Map((rights || []).map((right) => [String(right.purchase_id), right]));
  const entitlementByPurchase = new Map(
    ((entitlementRows || []) as EntitlementRow[])
      .filter((entitlement) => entitlement.purchase_id)
      .map((entitlement) => [String(entitlement.purchase_id), entitlement]),
  );
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
        status: purchase.status,
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
        entitlement: entitlementByPurchase.get(String(purchase.id)) || null,
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

  let { data: entitlement, error: entitlementError } = await admin
    .from("market_asset_entitlements")
    .select("id,asset_id,purchase_id,revision_id,acquisition_kind,status,content_hash,license_snapshot,granted_at")
    .eq("user_id", userId)
    .eq("asset_id", assetId)
    .eq("status", "active")
    .maybeSingle();
  if (entitlementError) throw entitlementError;

  // Entitlement is the canonical access decision. A purchase is loaded only
  // as the immutable audit/payment record attached to that entitlement.
  let purchase: {
    id: string;
    asset_id: string;
    status: string;
    paid_at: string | null;
    created_at: string;
    package_rights_snapshot: JsonRecord | null;
    package_snapshot_hash: string | null;
  } | null = null;
  if (entitlement?.purchase_id) {
    const { data, error } = await admin
      .from("market_purchases")
      .select("id,asset_id,status,paid_at,created_at,package_rights_snapshot,package_snapshot_hash")
      .eq("id", entitlement.purchase_id)
      .eq("buyer_user_id", userId)
      .eq("asset_id", assetId)
      .in("status", ["paid", "granted"])
      .maybeSingle();
    if (error) throw error;
    purchase = data;
  }
  if (!entitlement) {
    const { data: candidatePurchase, error: candidatePurchaseError } = await admin
      .from("market_purchases")
      .select("id,asset_id,status,paid_at,created_at,package_rights_snapshot,package_snapshot_hash")
      .eq("buyer_user_id", userId)
      .eq("asset_id", assetId)
      .in("status", ["paid", "granted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (candidatePurchaseError) throw candidatePurchaseError;
    if (!candidatePurchase) return jsonResponse(request, { error: "この商品の有効な購入権を確認できませんでした。" }, 403);
    const { error: materializeError } = await admin.rpc("market_materialize_entitlement_v1", {
      input_purchase_id: candidatePurchase.id,
    });
    if (materializeError) {
      return jsonResponse(request, { error: "購入権の正本を作成できませんでした。再試行してください。" }, 409);
    }
    const refreshed = await admin
      .from("market_asset_entitlements")
      .select("id,asset_id,purchase_id,revision_id,acquisition_kind,status,content_hash,license_snapshot,granted_at")
      .eq("user_id", userId)
      .eq("asset_id", assetId)
      .eq("status", "active")
      .maybeSingle();
    entitlement = refreshed.data as EntitlementRow | null;
    entitlementError = refreshed.error;
    if (entitlementError) throw entitlementError;
    purchase = candidatePurchase;
  }
  if (!entitlement || !purchase || purchase.status === "refunded") {
    return jsonResponse(request, { error: "この商品の有効な購入権を確認できませんでした。" }, 403);
  }
  if (!entitlement?.revision_id || !entitlement.content_hash) {
    return jsonResponse(request, { error: "購入権に検証済みPackage Revisionが紐づいていません。" }, 409);
  }

  const { data: revisionData, error: revisionError } = await admin
    .from("market_asset_revisions")
    .select("id,asset_id,revision_number,content_hash,source_sha256,package_hash,manifest,storage_file_paths,status")
    .eq("id", entitlement.revision_id)
    .eq("asset_id", assetId)
    .eq("status", "active")
    .single();
  if (revisionError) throw revisionError;
  const revision = revisionData as RevisionRow;
  if (!revision.content_hash || revision.content_hash !== entitlement.content_hash) {
    return jsonResponse(request, { error: "Package RevisionのHashが購入権と一致しません。" }, 409);
  }

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
  const rightsSnapshot = asRecord(purchase.package_rights_snapshot);
  const hasRightsSnapshot = stringValue(rightsSnapshot.schema) === "pixieed-market-purchase-rights/v1";
  const includedFormats = hasRightsSnapshot
    ? safeFormats(rightsSnapshot.included_formats)
    : safeFormats(asset.included_formats);
  const effectiveFormats = includedFormats.length ? includedFormats : [asset.asset_format];
  const revisionManifest = asRecord(revision.manifest);
  const packageManifest = Object.keys(revisionManifest).length
    ? revisionManifest
    : hasRightsSnapshot ? rightsSnapshot : null;
  const availableFiles = packageFiles(asset, packageManifest);
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
  const snapshotLicense = asRecord(rightsSnapshot.license);
  const entitlementLicense = asRecord((entitlement as EntitlementRow).license_snapshot);
  const entitlementLicenseTerms = asRecord(entitlementLicense.license);
  const license = Object.keys(entitlementLicense).length
    ? { ...entitlementLicenseTerms, ...entitlementLicense }
    : Object.keys(snapshotLicense).length ? snapshotLicense : asRecord(series);
  const licenseId = stringValue(license.license_id) || `market-license:${entitlement.id}`;
  const licenseRights = stringArray(license.rights);
  const inGameUse = license.in_game_use === true;
  const sourceFormat = kind === "pixieedraw-open"
    ? requestedFormats[0] || "pixiedraw-project"
    : asset.asset_format;
  // The revision hash identifies the immutable Market package metadata.  A
  // PXD source also needs the signed bytes hash so Draw2 can verify the file
  // it imports without confusing it with the package fingerprint.
  const sourcePackageHash = sourceFormat === "pixiedraw-project"
    ? files.find((file) => file.format === sourceFormat)?.sha256?.toLowerCase()
    : undefined;

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
    asset: {
      id: asset.id,
      title: asset.title,
      asset_format: asset.asset_format,
      included_formats: effectiveFormats,
    },
    source: {
      assetId: asset.id,
      revisionId: revision.id,
      contentHash: revision.content_hash,
      label: asset.title,
      format: sourceFormat,
      layout: "FULL_CANVAS",
      ...(sourcePackageHash ? { packageHash: sourcePackageHash } : {}),
    },
    purchase: {
      id: purchase.id,
      status: purchase.status,
      paid_at: purchase.paid_at || purchase.created_at,
    },
    entitlement: {
      id: entitlement.id,
      acquisition_kind: entitlement.acquisition_kind,
      source_revision_id: revision.id,
      revision_number: revision.revision_number,
      content_hash: revision.content_hash,
    },
    revision: {
      id: revision.id,
      number: revision.revision_number,
      content_hash: revision.content_hash,
      source_sha256: revision.source_sha256,
      package_hash: revision.package_hash,
    },
    kind,
    formats: requestedFormats,
    files: signedFiles,
    license: {
      license_id: licenseId,
      status: "ACTIVE",
      in_game_use: inGameUse,
      rights: licenseRights,
      derivative_sales_allowed: license.derivative_sales_allowed === true,
      inherited_terms: asRecord(license.inherited_terms),
      prohibited_uses: Array.isArray(license.prohibited_uses) ? license.prohibited_uses : [],
      selected_option_ids: stringArray(license.selected_option_ids),
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
    const { user } = await requireMarketUser(request);
    const body = await readJson(request);
    if (stringValue(body.action) === "library") return await loadLibrary(request, user.id);
    if (stringValue(body.action) === "authorize") return await authorizeDelivery(request, user.id, body);
    return jsonResponse(request, { error: "unknown action" }, 400);
  } catch (error) {
    const message = errorMessage(error, "購入済み素材を準備できませんでした");
    const status = /login|required|confirmed/i.test(message) ? 401 : 500;
    return jsonResponse(request, { error: message }, status);
  }
});
