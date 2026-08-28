/**
 * GAME-350 iGAME Player and external-build admission boundary.
 *
 * The PiXiEED Player is an execution-only surface. It receives a fixed
 * product revision and may read referenced Draw/Audio assets, but it never
 * receives editor authority. External builds are a separate admission path:
 * a server-owned AuthorizationProof is required for every target such as an
 * Android APK/AAB. This module does not perform checkout or create binaries.
 */

import {
  requireAuthorizationProofV1,
  type AuthorizationProofV1,
} from "../../wp160-contracts.ts";

export const IGAME_PLAYER_SCHEMA_VERSION = 1 as const;
export const IGAME_EXTERNAL_BUILD_SCHEMA_VERSION = 1 as const;

export type IGamePlayerSourceAuthority = "REGISTRY" | "LOCAL_PREVIEW";
export type IGamePlayerAccessSource =
  | "LOCAL_PREVIEW"
  | "SERVER_AUTHORITY";
export type IGamePlayerAccessDecision =
  | "AUTHORIZED"
  | "DENIED"
  | "UNAVAILABLE";

export interface IGamePlayerManifestInput {
  readonly productId: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly ownerId: string;
  readonly tenantId: string;
  readonly title: string;
  readonly runtimeProfileId: string;
  readonly runtimeVersion: string;
  readonly sourceAuthority?: IGamePlayerSourceAuthority;
}

export interface IGamePlayerManifest extends IGamePlayerManifestInput {
  readonly schemaVersion: typeof IGAME_PLAYER_SCHEMA_VERSION;
  readonly sourceAuthority: IGamePlayerSourceAuthority;
  /** Player execution cannot edit Game, Draw, Audio, or the Project. */
  readonly editAuthority: "NONE";
  /** Referenced Draw/Audio assets are readable but source-write denied. */
  readonly assetAuthority: "READ_ONLY";
}

export type IGamePlayerAccessCode =
  | "PLAYER_AUTHORIZED"
  | "INVALID_MANIFEST"
  | "SERVER_AUTH_REQUIRED"
  | "AUTHORIZATION_INVALID"
  | "LOCAL_PREVIEW_ONLY";

export interface IGamePlayerAccessResult {
  readonly decision: IGamePlayerAccessDecision;
  readonly code: IGamePlayerAccessCode;
  readonly message: string;
  readonly manifest: IGamePlayerManifest;
  readonly proof?: AuthorizationProofV1;
}

export interface IGamePlayerSession {
  readonly mode: "PLAYER";
  readonly productId: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly ownerId: string;
  readonly tenantId: string;
  readonly editAuthority: "NONE";
  readonly assetAuthority: "READ_ONLY";
  readonly canWriteProject: false;
  readonly canEditGame: false;
  readonly canEditDraw: false;
  readonly canEditAudio: false;
}

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;

function stableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID.test(value);
}

function nonEmptyText(value: unknown, maxLength = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maxLength;
}

function manifestShape(value: unknown): value is IGamePlayerManifest {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const manifest = value as Record<string, unknown>;
  return manifest.schemaVersion === IGAME_PLAYER_SCHEMA_VERSION &&
    stableId(manifest.productId) && stableId(manifest.projectId) &&
    stableId(manifest.revisionId) && stableId(manifest.ownerId) &&
    stableId(manifest.tenantId) && nonEmptyText(manifest.title) &&
    stableId(manifest.runtimeProfileId) &&
    stableId(manifest.runtimeVersion) &&
    (manifest.sourceAuthority === "REGISTRY" ||
      manifest.sourceAuthority === "LOCAL_PREVIEW") &&
    manifest.editAuthority === "NONE" &&
    manifest.assetAuthority === "READ_ONLY";
}

export function createIGamePlayerManifest(
  input: IGamePlayerManifestInput,
): IGamePlayerManifest {
  if (
    !stableId(input.productId) || !stableId(input.projectId) ||
    !stableId(input.revisionId) || !stableId(input.ownerId) ||
    !stableId(input.tenantId) || !nonEmptyText(input.title) ||
    !stableId(input.runtimeProfileId) || !stableId(input.runtimeVersion)
  ) {
    throw new Error("iGAME Player manifest contains an unstable identity.");
  }
  const sourceAuthority = input.sourceAuthority ?? "REGISTRY";
  return Object.freeze({
    schemaVersion: IGAME_PLAYER_SCHEMA_VERSION,
    productId: input.productId,
    projectId: input.projectId,
    revisionId: input.revisionId,
    ownerId: input.ownerId,
    tenantId: input.tenantId,
    title: input.title.trim(),
    runtimeProfileId: input.runtimeProfileId,
    runtimeVersion: input.runtimeVersion,
    sourceAuthority,
    editAuthority: "NONE" as const,
    assetAuthority: "READ_ONLY" as const,
  });
}

function accessResult(
  decision: IGamePlayerAccessDecision,
  code: IGamePlayerAccessCode,
  message: string,
  manifest: IGamePlayerManifest,
  proof?: AuthorizationProofV1,
): IGamePlayerAccessResult {
  return proof === undefined
    ? { decision, code, message, manifest }
    : { decision, code, message, manifest, proof };
}

/**
 * Resolve access for the internal Player. A local preview is intentionally
 * limited to a LOCAL_PREVIEW manifest. A Registry product requires a
 * server-issued proof bound to the exact product and tenant.
 */
export function resolveIGamePlayerAccess(input: {
  readonly manifest: IGamePlayerManifest;
  readonly source: IGamePlayerAccessSource;
  readonly principalId?: string;
  readonly proof?: unknown;
}): IGamePlayerAccessResult {
  if (!manifestShape(input.manifest)) {
    return accessResult(
      "UNAVAILABLE",
      "INVALID_MANIFEST",
      "iGAME Playerの情報が不正なため、安全に停止しました。",
      input.manifest,
    );
  }
  if (input.source === "LOCAL_PREVIEW") {
    if (input.manifest.sourceAuthority !== "LOCAL_PREVIEW") {
      return accessResult(
        "DENIED",
        "LOCAL_PREVIEW_ONLY",
        "Registry商品は、Registry認証を確認してから再生します。",
        input.manifest,
      );
    }
    return accessResult(
      "AUTHORIZED",
      "PLAYER_AUTHORIZED",
      "ローカルiGAME Playerの再生を許可しました。編集権限はありません。",
      input.manifest,
    );
  }
  if (input.manifest.sourceAuthority !== "REGISTRY") {
    return accessResult(
      "DENIED",
      "SERVER_AUTH_REQUIRED",
      "この商品はローカルプレビューのため、Registry商品として開けません。",
      input.manifest,
    );
  }
  if (!stableId(input.principalId) || input.proof === undefined) {
    return accessResult(
      "DENIED",
      "SERVER_AUTH_REQUIRED",
      "Registry認証とプレイ権限が必要です。",
      input.manifest,
    );
  }
  try {
    const proof = requireAuthorizationProofV1(input.proof, {
      principalId: input.principalId,
      resourceType: "igame-product",
      resourceId: input.manifest.productId,
      action: "play",
      capability: "game.play",
      tenantId: input.manifest.tenantId,
    });
    return accessResult(
      "AUTHORIZED",
      "PLAYER_AUTHORIZED",
      "Registry認証を確認しました。編集権限はありません。",
      input.manifest,
      proof,
    );
  } catch {
    return accessResult(
      "DENIED",
      "AUTHORIZATION_INVALID",
      "Registry認証が不正、期限切れ、または対象外です。",
      input.manifest,
    );
  }
}

export function createIGamePlayerSession(
  access: IGamePlayerAccessResult,
): IGamePlayerSession {
  if (access.decision !== "AUTHORIZED") {
    throw new Error("An authorized iGAME Player access result is required.");
  }
  return {
    mode: "PLAYER",
    productId: access.manifest.productId,
    projectId: access.manifest.projectId,
    revisionId: access.manifest.revisionId,
    ownerId: access.manifest.ownerId,
    tenantId: access.manifest.tenantId,
    editAuthority: "NONE",
    assetAuthority: "READ_ONLY",
    canWriteProject: false,
    canEditGame: false,
    canEditDraw: false,
    canEditAudio: false,
  };
}

export const IGAME_EXTERNAL_BUILD_TARGETS = Object.freeze([
  "ANDROID_APK",
  "ANDROID_AAB",
  "IOS_IPA",
  "DESKTOP_PACKAGE",
  "WEB_PACKAGE",
] as const);

export type IGameExternalBuildTarget =
  (typeof IGAME_EXTERNAL_BUILD_TARGETS)[number];

export function isIGameExternalBuildTarget(
  value: unknown,
): value is IGameExternalBuildTarget {
  return (IGAME_EXTERNAL_BUILD_TARGETS as readonly unknown[]).includes(value);
}

export interface IGameExternalBuildSource {
  readonly productId: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly ownerId: string;
  readonly tenantId: string;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly sourceSnapshotHash: string;
}

export interface IGameExternalBuildRequest {
  readonly manifest: IGamePlayerManifest;
  readonly source: IGameExternalBuildSource;
  readonly target: IGameExternalBuildTarget;
  readonly principalId: string;
  readonly proof: unknown;
  readonly featureEnabled: boolean;
  readonly killSwitch: boolean;
}

export type IGameExternalBuildDecision = "ADMITTED" | "DENIED" | "UNAVAILABLE";
export type IGameExternalBuildCode =
  | "EXTERNAL_BUILD_ADMITTED"
  | "FEATURE_DISABLED"
  | "KILL_SWITCH_ACTIVE"
  | "REGISTRY_REQUIRED"
  | "SOURCE_IDENTITY_MISMATCH"
  | "ENTITLEMENT_REQUIRED"
  | "EXTERNAL_BUILD_AUTHORIZATION_INVALID"
  | "UNSUPPORTED_EXTERNAL_TARGET";

export interface IGameExternalBuildAdmission {
  readonly schemaVersion: typeof IGAME_EXTERNAL_BUILD_SCHEMA_VERSION;
  readonly decision: IGameExternalBuildDecision;
  readonly code: IGameExternalBuildCode;
  readonly message: string;
  readonly target: IGameExternalBuildTarget;
  readonly productId: string;
  readonly projectId: string;
  readonly revisionId: string;
  /** Admission is not an APK/AAB; a server Build worker must materialize it. */
  readonly requiresServerBuild: true;
  readonly artifactMaterialized: false;
  readonly grantId?: string;
}

export function igameExternalBuildResourceId(
  manifest: IGamePlayerManifest,
  target: IGameExternalBuildTarget,
): string {
  return [
    "igame-build",
    manifest.tenantId,
    manifest.ownerId,
    manifest.productId,
    manifest.projectId,
    manifest.revisionId,
    target,
  ].join(":");
}

function externalBuildResult(
  request: IGameExternalBuildRequest,
  decision: IGameExternalBuildDecision,
  code: IGameExternalBuildCode,
  message: string,
  grantId?: string,
): IGameExternalBuildAdmission {
  return grantId === undefined
    ? {
      schemaVersion: IGAME_EXTERNAL_BUILD_SCHEMA_VERSION,
      decision,
      code,
      message,
      target: request.target,
      productId: request.manifest.productId,
      projectId: request.manifest.projectId,
      revisionId: request.manifest.revisionId,
      requiresServerBuild: true,
      artifactMaterialized: false,
    }
    : {
      schemaVersion: IGAME_EXTERNAL_BUILD_SCHEMA_VERSION,
      decision,
      code,
      message,
      target: request.target,
      productId: request.manifest.productId,
      projectId: request.manifest.projectId,
      revisionId: request.manifest.revisionId,
      requiresServerBuild: true,
      artifactMaterialized: false,
      grantId,
    };
}

function sourceMatchesManifest(
  manifest: IGamePlayerManifest,
  source: IGameExternalBuildSource,
): boolean {
  return source.productId === manifest.productId &&
    source.projectId === manifest.projectId &&
    source.revisionId === manifest.revisionId &&
    source.ownerId === manifest.ownerId &&
    source.tenantId === manifest.tenantId &&
    stableId(source.packageId) && stableId(source.packageVersion) &&
    nonEmptyText(source.sourceSnapshotHash, 128);
}

/**
 * Admit an external build only after a server-owned paid entitlement proof.
 * The client cannot turn this admission into an APK/AAB; the server Build
 * worker must repeat the same identity and entitlement checks before output.
 */
export function admitIGameExternalBuild(
  request: IGameExternalBuildRequest,
): IGameExternalBuildAdmission {
  if (!isIGameExternalBuildTarget(request.target)) {
    return externalBuildResult(
      request,
      "DENIED",
      "UNSUPPORTED_EXTERNAL_TARGET",
      "指定された外部ビルド対象には対応していません。",
    );
  }
  if (request.killSwitch) {
    return externalBuildResult(
      request,
      "UNAVAILABLE",
      "KILL_SWITCH_ACTIVE",
      "停止スイッチが有効なため、外部ビルドを安全に停止しました。",
    );
  }
  if (!request.featureEnabled) {
    return externalBuildResult(
      request,
      "UNAVAILABLE",
      "FEATURE_DISABLED",
      "この環境では外部ビルド機能が無効です。",
    );
  }
  if (request.manifest.sourceAuthority !== "REGISTRY") {
    return externalBuildResult(
      request,
      "DENIED",
      "REGISTRY_REQUIRED",
      "PiXiEEDから外部ビルドへ出せるのは、Registry確認済みのRevisionだけです。",
    );
  }
  if (!sourceMatchesManifest(request.manifest, request.source)) {
    return externalBuildResult(
      request,
      "DENIED",
      "SOURCE_IDENTITY_MISMATCH",
      "商品・プロジェクト・Owner・Tenant・Revisionの情報が一致しません。",
    );
  }
  try {
    const proof = requireAuthorizationProofV1(request.proof, {
      principalId: request.principalId,
      resourceType: "igame-external-build",
      resourceId: igameExternalBuildResourceId(
        request.manifest,
        request.target,
      ),
      action: "build",
      capability: "game.build.external",
      tenantId: request.manifest.tenantId,
    });
    if (proof.grantId === null) {
      return externalBuildResult(
        request,
        "DENIED",
        "ENTITLEMENT_REQUIRED",
        "APK/AABなどの外部ビルドには、課金済みの外部ビルド権限が必要です。",
      );
    }
    return externalBuildResult(
      request,
      "ADMITTED",
      "EXTERNAL_BUILD_ADMITTED",
      "課金済みの外部ビルド権限を確認しました。サーバーBuildが必要です。",
      proof.grantId,
    );
  } catch {
    return externalBuildResult(
      request,
      "DENIED",
      "EXTERNAL_BUILD_AUTHORIZATION_INVALID",
      "外部ビルド権限が不正、期限切れ、未課金、または対象外です。",
    );
  }
}
