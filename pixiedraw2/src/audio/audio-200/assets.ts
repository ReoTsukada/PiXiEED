/** Metadata-only Audio Asset Authority for Phase 2-A1. */

import {
  asAudioAssetId,
  asAudioRevisionId,
  AUDIO200_ASSET_SCHEMA_VERSION,
  type Audio200Diagnostic,
  type Audio200Result,
  type AudioAssetCatalog,
  type AudioAssetId,
  type AudioAssetRecord,
  audioFail,
  audioOk,
  type AudioProject,
  type AudioRevision,
  type AudioRevisionId,
  hasRawAudioPayload,
} from "./contracts.ts";

const MAX_SOURCE_NAME = 256;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

function fail<T>(
  code: Audio200Diagnostic["code"],
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<T> {
  return audioFail(code, message, path, recoverable);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function validSourceName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= MAX_SOURCE_NAME;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function createAudioAssetCatalog(): AudioAssetCatalog {
  return { schemaVersion: AUDIO200_ASSET_SCHEMA_VERSION, assets: [] };
}

export function createAudioAssetRecord(
  revision: AudioRevision,
  sourceName: string,
): Audio200Result<AudioAssetRecord> {
  if (hasRawAudioPayload(revision)) {
    return fail(
      "AUDIO_RAW_PAYLOAD_REJECTED",
      "Asset metadata cannot contain raw audio payload fields.",
      "revision",
    );
  }
  if (!validSourceName(sourceName)) {
    return fail(
      "AUDIO_INVALID_ASSET",
      "Asset source name must be a bounded non-empty string.",
      "sourceName",
    );
  }
  if (
    revision === null || typeof revision !== "object" ||
    !validId(revision.assetId) || !validId(revision.revisionId) ||
    !Number.isSafeInteger(revision.revisionNumber) ||
    revision.revisionNumber < 1 || !validTimestamp(revision.createdAt)
  ) {
    return fail(
      "AUDIO_INVALID_REVISION",
      "Asset record requires a canonical verified revision.",
      "revision",
    );
  }
  return audioOk({
    schemaVersion: AUDIO200_ASSET_SCHEMA_VERSION,
    assetId: revision.assetId,
    sourceName: sourceName.trim(),
    kind: revision.kind,
    revisionIds: [revision.revisionId],
    latestRevisionId: revision.revisionId,
    createdAt: revision.createdAt,
  });
}

export function validateAudioAssetCatalog(
  value: unknown,
): Audio200Result<AudioAssetCatalog> {
  if (
    value === null || typeof value !== "object" || Array.isArray(value) ||
    hasRawAudioPayload(value)
  ) {
    return fail(
      "AUDIO_RAW_PAYLOAD_REJECTED",
      "Asset catalog is metadata-only and must be an object.",
      "catalog",
    );
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== AUDIO200_ASSET_SCHEMA_VERSION) {
    return fail(
      "AUDIO_UNSUPPORTED_SCHEMA",
      "Asset catalog schema is unsupported.",
      "catalog.schemaVersion",
    );
  }
  if (!Array.isArray(candidate.assets)) {
    return fail(
      "AUDIO_INVALID_ASSET",
      "Asset catalog assets must be an array.",
      "catalog.assets",
    );
  }
  const assets = candidate.assets as readonly unknown[];
  const assetIds = assets.map((asset) =>
    (asset as Record<string, unknown> | null)?.assetId
  );
  if (assetIds.some((id) => !validId(id)) || !unique(assetIds as string[])) {
    return fail(
      "AUDIO_DUPLICATE_ID",
      "Asset IDs must be stable and unique.",
      "catalog.assets",
    );
  }
  for (const [index, asset] of assets.entries()) {
    if (asset === null || typeof asset !== "object") {
      return fail(
        "AUDIO_INVALID_ASSET",
        "Asset record must be an object.",
        `catalog.assets[${index}]`,
      );
    }
    const item = asset as Record<string, unknown>;
    const revisions = item.revisionIds;
    if (
      item.schemaVersion !== AUDIO200_ASSET_SCHEMA_VERSION ||
      !validId(item.assetId) || !validSourceName(item.sourceName) ||
      (item.kind !== "CLIP" && item.kind !== "SONG") ||
      !Array.isArray(revisions) || revisions.length === 0 ||
      revisions.some((id) => !validId(id)) ||
      !unique(revisions as string[]) || !validId(item.latestRevisionId) ||
      !(revisions as readonly unknown[]).includes(item.latestRevisionId) ||
      !validTimestamp(item.createdAt)
    ) {
      return fail(
        "AUDIO_INVALID_ASSET",
        "Asset record fields or revision references are invalid.",
        `catalog.assets[${index}]`,
      );
    }
  }
  return audioOk(value as AudioAssetCatalog);
}

/** Bind catalog references back to the canonical Project revisions. */
export function validateAudioAssetCatalogAgainstProject(
  catalog: AudioAssetCatalog,
  project: AudioProject,
): Audio200Result<true> {
  const valid = validateAudioAssetCatalog(catalog);
  if (!valid.ok) return valid;
  const revisions = new Map(
    project.revisions.map((revision) => [revision.revisionId, revision]),
  );
  for (const asset of catalog.assets) {
    for (const revisionId of asset.revisionIds) {
      const revision = revisions.get(revisionId);
      if (
        revision === undefined || revision.assetId !== asset.assetId ||
        revision.kind !== asset.kind
      ) {
        return fail(
          "AUDIO_METADATA_MISMATCH",
          "Asset catalog revision references do not bind to the canonical Project.",
          `catalog.assets.${asset.assetId}.revisionIds`,
        );
      }
    }
  }
  return audioOk(true);
}

export function appendAudioAssetRevision(
  catalog: AudioAssetCatalog,
  revision: AudioRevision,
  sourceName?: string,
): Audio200Result<AudioAssetCatalog> {
  const valid = validateAudioAssetCatalog(catalog);
  if (!valid.ok) return valid;
  if (
    revision === null || typeof revision !== "object" ||
    !validId(revision.assetId) || !validId(revision.revisionId) ||
    !Number.isSafeInteger(revision.revisionNumber) ||
    revision.revisionNumber < 1
  ) {
    return fail(
      "AUDIO_INVALID_REVISION",
      "Asset revision is not canonical.",
      "revision",
    );
  }
  const existing = catalog.assets.find((asset) =>
    asset.assetId === revision.assetId
  );
  if (existing === undefined) {
    if (sourceName === undefined) {
      return fail(
        "AUDIO_INVALID_ASSET",
        "A new Asset requires its source name.",
        "sourceName",
      );
    }
    const created = createAudioAssetRecord(revision, sourceName);
    if (!created.ok) return created;
    return audioOk({
      ...catalog,
      assets: [...catalog.assets, created.value],
    });
  }
  if (existing.kind !== revision.kind) {
    return fail(
      "AUDIO_INVALID_ASSET",
      "An Asset cannot change its canonical kind.",
      "revision.kind",
    );
  }
  if (existing.revisionIds.includes(revision.revisionId)) {
    return fail(
      "AUDIO_DUPLICATE_ID",
      "Revision ID is already registered for this Asset.",
      "revision.revisionId",
    );
  }
  const latestRevisionNumber = existing.revisionIds.length;
  if (revision.revisionNumber <= latestRevisionNumber) {
    return fail(
      "AUDIO_INVALID_REVISION",
      "Revision numbers must increase monotonically within an Asset.",
      "revision.revisionNumber",
    );
  }
  return audioOk({
    ...catalog,
    assets: catalog.assets.map((asset) =>
      asset.assetId === revision.assetId
        ? {
          ...asset,
          revisionIds: [...asset.revisionIds, revision.revisionId],
          latestRevisionId: revision.revisionId,
        }
        : asset
    ),
  });
}

export function assetReferenceCount(
  project: AudioProject,
  assetId: AudioAssetId,
): number {
  const revisionIds = new Set(
    project.revisions.filter((revision) => revision.assetId === assetId).map(
      (revision) => revision.revisionId,
    ),
  );
  return project.clips.filter((clip) => revisionIds.has(clip.revisionId))
    .length;
}

export function revisionReferenceCount(
  project: AudioProject,
  revisionId: AudioRevisionId,
): number {
  return project.clips.filter((clip) => clip.revisionId === revisionId).length;
}

export function audioAssetRecordForId(
  catalog: AudioAssetCatalog,
  assetId: AudioAssetId,
): AudioAssetRecord | undefined {
  return catalog.assets.find((asset) => asset.assetId === assetId);
}

export function audioAssetId(value: string): AudioAssetId {
  return asAudioAssetId(value);
}

export function audioRevisionId(value: string): AudioRevisionId {
  return asAudioRevisionId(value);
}
