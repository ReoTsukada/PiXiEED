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
const PACKAGE_URL_TTL_SECONDS = 60;
const PLAYER_TENANT_ID = "pixieed-market";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const STABLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;

type AssetRow = {
  id: string;
  creator_user_id: string;
  title: string;
  status: string;
  asset_format: string;
  package_hash: string | null;
  active_revision_id: string | null;
  verification_status: string;
  file_scan_status: string;
  provenance_manifest: JsonRecord | null;
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

type EntitlementRow = {
  id: string;
  asset_id: string;
  revision_id: string | null;
  status: string;
  license_snapshot: JsonRecord | null;
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
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function igameProductFrom(asset: AssetRow): JsonRecord | null {
  const value = asRecord(asset.provenance_manifest).igame_product;
  const product = asRecord(value);
  if (product.schema !== "pixieed-igame-product/v1") return null;
  const projectId = stringValue(product.project_id);
  const runtimeProfileId = stringValue(product.runtime_profile_id);
  const runtimeVersion = stringValue(product.runtime_version);
  const visibility = stringValue(product.visibility);
  if (!STABLE_ID_PATTERN.test(projectId) || !STABLE_ID_PATTERN.test(runtimeProfileId) ||
    !STABLE_ID_PATTERN.test(runtimeVersion) || !["PUBLIC", "UNLISTED"].includes(visibility)) {
    return null;
  }
  return product;
}

function serverVerifiedGameModule(asset: AssetRow, product: JsonRecord): boolean {
  const verification = asRecord(asRecord(asset.provenance_manifest).server_verification);
  const projectIds = Array.isArray(verification.game_project_ids)
    ? verification.game_project_ids.filter((value): value is string => typeof value === "string")
    : [];
  return verification.status === "clean" &&
    projectIds.includes(stringValue(product.project_id));
}

function packageFiles(asset: AssetRow, revision: RevisionRow): PackageFile[] {
  const manifest = asRecord(revision.manifest);
  const allowedPaths = new Set(
    (revision.storage_file_paths || []).filter((path): path is string => typeof path === "string"),
  );
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  return files.flatMap((entry) => {
    const file = asRecord(entry);
    const storagePath = stringValue(file.storage_path);
    const format = stringValue(file.format);
    const sha256 = stringValue(file.sha256).toLowerCase();
    const originalPath = stringValue(file.original_path);
    if (!storagePath || !allowedPaths.has(storagePath) || !originalPath ||
      format !== "pixiedraw-project" || !SHA256_PATTERN.test(sha256)) return [];
    return [{
      original_path: originalPath,
      name: stringValue(file.name) || originalPath.split("/").pop() || "project.pxd",
      size: Math.max(0, Number(file.size) || 0),
      mime_type: stringValue(file.mime_type) || "application/vnd.pixieed.pxd",
      format,
      sha256,
      storage_path: storagePath,
    }];
  });
}

function licenseAllowsGame(value: unknown): boolean {
  const snapshot = asRecord(value);
  const nested = asRecord(snapshot.license);
  return nested.in_game_use === true || snapshot.in_game_use === true;
}

async function signedPackage(
  admin: ReturnType<typeof createAdminClient>,
  path: string,
): Promise<string> {
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(
    path,
    PACKAGE_URL_TTL_SECONDS,
  );
  if (error || !data?.signedUrl) throw error || new Error("Game package URL could not be created");
  return data.signedUrl;
}

function playerProof(input: {
  readonly principalId: string;
  readonly productId: string;
  readonly revisionId: string;
  readonly grantId: string;
}) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + PACKAGE_URL_TTL_SECONDS * 1000);
  return {
    schemaVersion: 1,
    proofType: "AUTHORIZATION_PROOF",
    source: "server",
    decision: "allow",
    authorityId: "pixieed-market-player",
    proofId: crypto.randomUUID(),
    principalId: input.principalId,
    resourceType: "igame-product",
    resourceId: input.productId,
    action: "play",
    capability: "game.play",
    tenantId: PLAYER_TENANT_ID,
    correlationId: `${input.productId}:${input.revisionId}`,
    policyVersion: "authorization-policy-v1",
    grantId: input.grantId,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  } as const;
}

async function bootstrap(request: Request, userId: string) {
  const body = await readJson(request);
  const productId = stringValue(body.product_id);
  const requestedRevisionId = stringValue(body.revision_id);
  if (!UUID_PATTERN.test(productId)) return jsonResponse(request, { error: "iGAME商品IDが不正です。" }, 400);
  if (requestedRevisionId && !UUID_PATTERN.test(requestedRevisionId)) {
    return jsonResponse(request, { error: "iGAME Revision IDが不正です。" }, 400);
  }

  const admin = createAdminClient();
  const { data: assetData, error: assetError } = await admin
    .from("market_assets")
    .select("id,creator_user_id,title,status,asset_format,package_hash,active_revision_id,verification_status,file_scan_status,provenance_manifest")
    .eq("id", productId)
    .eq("status", "published")
    .maybeSingle();
  if (assetError) throw assetError;
  const asset = assetData as AssetRow | null;
  if (!asset || asset.asset_format !== "pixiedraw-project") {
    return jsonResponse(request, { error: "公開iGAME商品が見つかりません。" }, 404);
  }
  const igameProduct = igameProductFrom(asset);
  if (!igameProduct || !serverVerifiedGameModule(asset, igameProduct) ||
    asset.verification_status !== "verified" || asset.file_scan_status !== "clean") {
    return jsonResponse(request, { error: "このGameは公開再生の準備が完了していません。" }, 409);
  }

  const revisionQuery = admin
    .from("market_asset_revisions")
    .select("id,asset_id,revision_number,content_hash,source_sha256,package_hash,manifest,storage_file_paths,status")
    .eq("asset_id", asset.id);
  const { data: revisionData, error: revisionError } = requestedRevisionId
    ? await revisionQuery.eq("id", requestedRevisionId).eq("status", "active").maybeSingle()
    : await revisionQuery.eq("id", asset.active_revision_id || "").eq("status", "active").maybeSingle();
  if (revisionError) throw revisionError;
  const revision = revisionData as RevisionRow | null;
  if (!revision || !revision.package_hash || !SHA256_PATTERN.test(revision.package_hash)) {
    return jsonResponse(request, { error: "公開Revisionが見つかりません。" }, 404);
  }

  const isOwner = asset.creator_user_id === userId;
  const { data: entitlementData, error: entitlementError } = await admin
    .from("market_asset_entitlements")
    .select("id,asset_id,revision_id,status,license_snapshot")
    .eq("user_id", userId)
    .eq("asset_id", asset.id)
    .eq("status", "active")
    .maybeSingle();
  if (entitlementError) throw entitlementError;
  const entitlement = entitlementData as EntitlementRow | null;
  if (!isOwner && (!entitlement || (entitlement.revision_id && entitlement.revision_id !== revision.id))) {
    return jsonResponse(request, { error: "このGameを再生する権利がありません。Marketで取得してください。" }, 403);
  }
  if (!isOwner && !licenseAllowsGame(entitlement?.license_snapshot)) {
    return jsonResponse(request, { error: "この購入権にはゲーム利用権がありません。" }, 403);
  }

  const files = packageFiles(asset, revision);
  const projectFile = files[0];
  if (!projectFile || !projectFile.size || !SHA256_PATTERN.test(projectFile.sha256)) {
    return jsonResponse(request, { error: "公開Game Packageが見つかりません。" }, 409);
  }
  const packageUrl = await signedPackage(admin, projectFile.storage_path);
  const grantId = entitlement?.id || `owner:${asset.id}`;
  const manifest = {
    schemaVersion: 1,
    productId: asset.id,
    projectId: stringValue(igameProduct.project_id),
    revisionId: revision.id,
    ownerId: asset.creator_user_id,
    tenantId: PLAYER_TENANT_ID,
    title: asset.title,
    runtimeProfileId: stringValue(igameProduct.runtime_profile_id),
    runtimeVersion: stringValue(igameProduct.runtime_version),
    sourceAuthority: "REGISTRY",
    editAuthority: "NONE",
    assetAuthority: "READ_ONLY",
  } as const;
  return jsonResponse(request, {
    schema: "pixieed-igame-player-bootstrap/v1",
    product: { id: asset.id, title: asset.title },
    revision: {
      id: revision.id,
      number: revision.revision_number,
      content_hash: revision.content_hash,
      package_hash: revision.package_hash,
    },
    manifest,
    package: {
      url: packageUrl,
      sha256: projectFile.sha256,
      mime_type: projectFile.mime_type,
      expires_in: PACKAGE_URL_TTL_SECONDS,
    },
    proof: playerProof({
      principalId: userId,
      productId: asset.id,
      revisionId: revision.id,
      grantId,
    }),
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse(request, { error: "method not allowed" }, 405);
  try {
    const { user } = await requireMarketUser(request);
    return await bootstrap(request, user.id);
  } catch (error) {
    const message = errorMessage(error, "iGAMEを準備できませんでした");
    const status = /login|required|confirmed/i.test(message) ? 401 : 500;
    return jsonResponse(request, { error: message }, status);
  }
});
