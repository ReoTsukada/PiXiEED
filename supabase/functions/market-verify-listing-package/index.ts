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
import {
  validateMarketPackage,
  type DownloadedMarketPackageFile,
} from "../_shared/market-package-verifier.ts";

const BUCKET = "market-private";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function scopedPath(ownerId: string, assetId: string, value: string, suffix: string): boolean {
  return value.startsWith(`${ownerId}/${assetId}/${suffix}`) &&
    !value.split("/").some((part) => part === ".." || part === "." || part === "");
}

function verifiedRoot(ownerId: string, assetId: string, packageHash: string): string {
  return `${ownerId}/${assetId}/verified/${packageHash}`;
}

function safeFileName(value: string, index: number): string {
  const base = value.split("/").pop() || `file-${index + 1}`;
  const safe = base.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/gu, "") || `file-${index + 1}`;
  return `${String(index + 1).padStart(3, "0")}-${safe}`;
}

async function downloadObject(
  admin: ReturnType<typeof createAdminClient>,
  path: string,
): Promise<DownloadedMarketPackageFile> {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw error || new Error(`Storage object is missing: ${path}`);
  return {
    path,
    bytes: new Uint8Array(await data.arrayBuffer()),
    mimeType: data.type || "application/octet-stream",
  };
}

async function downloadObjectsSequentially(
  admin: ReturnType<typeof createAdminClient>,
  paths: readonly string[],
): Promise<DownloadedMarketPackageFile[]> {
  const downloaded: DownloadedMarketPackageFile[] = [];
  for (const path of paths) {
    downloaded.push(await downloadObject(admin, path));
  }
  return downloaded;
}

async function uploadImmutable(
  admin: ReturnType<typeof createAdminClient>,
  path: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<void> {
  const stableBytes = new Uint8Array(bytes);
  const { error } = await admin.storage.from(BUCKET).upload(
    path,
    new Blob([stableBytes.buffer as ArrayBuffer], { type: mimeType || "application/octet-stream" }),
    { upsert: false, contentType: mimeType || "application/octet-stream" },
  );
  if (error) throw error;
}

function serverVerification(result: Extract<Awaited<ReturnType<typeof validateMarketPackage>>, { ok: true }>) {
  return {
    schema: "pixieed-market-server-verification/v1",
    status: "clean",
    package_hash: result.sourceHash,
    checked_at: new Date().toISOString(),
    file_count: result.fileCount,
    total_bytes: result.totalBytes,
    composition: result.composition,
    structural_verification_only: true,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse(request, { error: "method not allowed" }, 405);

  try {
    const { user } = await requireMarketUser(request);
    const body = await readJson(request);
    const assetId = stringValue(body.asset_id);
    const manifestPath = stringValue(body.manifest_object_path);
    const fileObjectPaths = stringArray(body.file_object_paths);
    const previewObjectPath = stringValue(body.preview_object_path);
    const samplePreviewPaths = stringArray(body.sample_preview_paths);
    if (!UUID_PATTERN.test(assetId)) return jsonResponse(request, { error: "asset_id is invalid" }, 400);
    if (!scopedPath(user.id, assetId, manifestPath, "")) return jsonResponse(request, { error: "manifest path is outside the seller scope" }, 400);
    if (!fileObjectPaths.length || fileObjectPaths.some((path) => !scopedPath(user.id, assetId, path, "files/"))) {
      return jsonResponse(request, { error: "package file path is outside the seller scope" }, 400);
    }
    if (previewObjectPath && !scopedPath(user.id, assetId, previewObjectPath, "previews/")) {
      return jsonResponse(request, { error: "thumbnail path is outside the seller scope" }, 400);
    }
    if (samplePreviewPaths.some((path) => !scopedPath(user.id, assetId, path, "previews/"))) {
      return jsonResponse(request, { error: "sample preview path is outside the seller scope" }, 400);
    }

    const admin = createAdminClient();
    const { data: asset, error: assetError } = await admin
      .from("market_assets")
      .select("id,creator_user_id,status,source_sha256,package_hash,included_formats,provenance_manifest")
      .eq("id", assetId)
      .eq("creator_user_id", user.id)
      .eq("status", "draft")
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return jsonResponse(request, { error: "editable draft not found" }, 404);

    const { data: manifestBlob, error: manifestError } = await admin.storage.from(BUCKET).download(manifestPath);
    if (manifestError || !manifestBlob) return jsonResponse(request, { error: "uploaded package manifest not found" }, 422);
    let manifest: unknown;
    try {
      manifest = JSON.parse(await manifestBlob.text());
    } catch (_error) {
      return jsonResponse(request, { error: "uploaded package manifest is invalid JSON" }, 422);
    }

    // Keep the verifier's peak memory bounded by the package limit instead of
    // creating one pending Storage body per manifest entry at once.
    const downloadedFiles = await downloadObjectsSequentially(admin, fileObjectPaths);
    const result = await validateMarketPackage({
      manifest,
      ownerId: user.id,
      assetId,
      sourceSha256: stringValue(asset.source_sha256),
      includedFormats: Array.isArray(asset.included_formats) ? asset.included_formats : [],
      fileObjectPaths,
      downloadedFiles,
    });
    if (!result.ok) {
      return jsonResponse(request, { error: result.message, code: result.code, path: result.path || null }, 422);
    }

    const currentManifest = asset.provenance_manifest && typeof asset.provenance_manifest === "object"
      ? asset.provenance_manifest as JsonRecord
      : {};
    const verification = serverVerification(result);
    const rawManifest = manifest && typeof manifest === "object" ? manifest as JsonRecord : {};
    const rawFiles = Array.isArray(rawManifest.files) ? rawManifest.files : [];
    const downloadedByPath = new Map(downloadedFiles.map((file) => [file.path, file]));
    const immutableRoot = verifiedRoot(user.id, assetId, result.sourceHash);
    const immutableFilePaths = rawFiles.map((entry, index) => {
      const file = entry && typeof entry === "object" ? entry as JsonRecord : {};
      return `${immutableRoot}/files/${safeFileName(stringValue(file.name) || stringValue(file.original_path), index)}`;
    });
    const verifiedFiles = rawFiles.map((entry, index) => {
      const file = entry && typeof entry === "object" ? entry as JsonRecord : {};
      const downloaded = downloadedByPath.get(stringValue(file.storage_path));
      return {
        ...file,
        storage_path: immutableFilePaths[index],
        mime_type: downloaded?.mimeType || stringValue(file.mime_type) || "application/octet-stream",
      };
    });
    const existingVerifiedPaths = stringArray(currentManifest.storage_file_paths);
    const canReuseImmutablePackage = asset.package_hash === result.sourceHash &&
      stringValue(currentManifest.server_verification && typeof currentManifest.server_verification === "object"
        ? (currentManifest.server_verification as JsonRecord).status
        : "") === "clean" && existingVerifiedPaths.length === immutableFilePaths.length;
    if (!canReuseImmutablePackage) {
      for (let index = 0; index < downloadedFiles.length; index += 1) {
        const downloaded = downloadedFiles[index];
        await uploadImmutable(admin, immutableFilePaths[index], downloaded.bytes, downloaded.mimeType);
      }
    }

    let verifiedThumbnailPath = "";
    if (previewObjectPath) {
      const thumbnail = await downloadObject(admin, previewObjectPath);
      verifiedThumbnailPath = `${immutableRoot}/previews/thumbnail${previewObjectPath.includes(".") ? `.${previewObjectPath.split(".").pop()}` : ""}`;
      if (!canReuseImmutablePackage) await uploadImmutable(admin, verifiedThumbnailPath, thumbnail.bytes, thumbnail.mimeType);
    }
    const verifiedSamplePaths: string[] = [];
    for (let index = 0; index < samplePreviewPaths.length; index += 1) {
      const sample = await downloadObject(admin, samplePreviewPaths[index]);
      const extension = samplePreviewPaths[index].includes(".") ? `.${samplePreviewPaths[index].split(".").pop()}` : "";
      const verifiedPath = `${immutableRoot}/previews/sample-${String(index + 1).padStart(2, "0")}${extension}`;
      verifiedSamplePaths.push(verifiedPath);
      if (!canReuseImmutablePackage) await uploadImmutable(admin, verifiedPath, sample.bytes, sample.mimeType);
    }
    const verifiedManifestPath = `${immutableRoot}/manifest.json`;
    const verifiedManifest = {
      ...currentManifest,
      ...rawManifest,
      files: verifiedFiles,
      preview_storage: { thumbnail: verifiedThumbnailPath || null, samples: verifiedSamplePaths },
      server_verification: verification,
      storage_manifest_path: verifiedManifestPath,
      storage_file_paths: immutableFilePaths,
      storage_sample_preview_paths: verifiedSamplePaths,
    };
    if (!canReuseImmutablePackage) {
      await uploadImmutable(
        admin,
        verifiedManifestPath,
        new TextEncoder().encode(JSON.stringify(verifiedManifest, null, 2)),
        "application/json",
      );
    }
    const mergedManifest = {
      ...verifiedManifest,
    };
    const { error: updateError } = await admin
      .from("market_assets")
      .update({
        file_scan_status: "clean",
        package_hash: result.sourceHash,
        package_verified_at: verification.checked_at,
        package_verified_by: user.id,
        provenance_manifest: mergedManifest,
        updated_at: verification.checked_at,
      })
      .eq("id", assetId)
      .eq("creator_user_id", user.id)
      .eq("status", "draft");
    if (updateError) throw updateError;

    const { error: auditError } = await admin.from("market_audit_log").insert({
      actor_user_id: user.id,
      action: "listing_package_server_verified",
      target_type: "market_asset",
      target_id: assetId,
      details: verification,
    });
    if (auditError) throw auditError;

    return jsonResponse(request, {
      ok: true,
      asset_id: assetId,
      package_hash: result.sourceHash,
      file_count: result.fileCount,
      total_bytes: result.totalBytes,
      composition: result.composition,
      manifest_object_path: verifiedManifestPath,
      file_object_paths: immutableFilePaths,
      preview_object_path: verifiedThumbnailPath || null,
      sample_preview_paths: verifiedSamplePaths,
    });
  } catch (error) {
    const message = errorMessage(error, "販売パッケージを検証できませんでした");
    const status = /login|required|confirmed/i.test(message) ? 401 : 500;
    return jsonResponse(request, { error: message }, status);
  }
});
