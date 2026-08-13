/** FP-007 Track 3: repeat-build equality and truthful qualification status. */

import { canonicalJson, isSha256, sha256Hex } from "./build-manifest.ts";
import { compareCodePointStrings } from "./stable-order.ts";
import type {
  ArtifactCompression,
  ArtifactManifest,
} from "./artifact-manifest.ts";

export const FP007_REPEAT_BUILD_DOCUMENT =
  "PIXIEED-FP007-REPEAT-BUILD-001" as const;

export interface RepeatBuildArtifact {
  readonly path: string;
  readonly bytes: number;
  readonly size: number;
  readonly sha256: string;
  readonly compression: ArtifactCompression;
}

export interface RepeatBuildSnapshotInput {
  readonly inputHash: string;
  readonly buildManifestHash: string;
  readonly manifestCanonicalJson: string;
  readonly toolchainHash: string;
  readonly artifactManifestHash: string;
  readonly artifacts: readonly RepeatBuildArtifact[];
}

export interface RepeatBuildSnapshot extends RepeatBuildSnapshotInput {
  readonly documentId: typeof FP007_REPEAT_BUILD_DOCUMENT;
  readonly snapshotHash: string;
}

export type RepeatDifferenceCode =
  | "INPUT_HASH_CHANGED"
  | "BUILD_MANIFEST_HASH_CHANGED"
  | "MANIFEST_BYTES_CHANGED"
  | "TOOLCHAIN_CHANGED"
  | "ARTIFACT_MANIFEST_HASH_CHANGED"
  | "ARTIFACT_SET_CHANGED"
  | "ARTIFACT_BYTES_CHANGED"
  | "ARTIFACT_SIZE_CHANGED"
  | "ARTIFACT_HASH_CHANGED"
  | "ARTIFACT_COMPRESSION_CHANGED";

export interface RepeatDifference {
  readonly code: RepeatDifferenceCode;
  readonly path?: string;
  readonly message: string;
}

export interface RepeatComparison {
  readonly equal: boolean;
  readonly status: "PASS" | "FAIL";
  readonly differences: readonly RepeatDifference[];
}

export type RepeatQualificationScope =
  | "ISOLATED_FIXTURE"
  | "REAL_CLEAN_CHECKOUT"
  | "REAL_DIRTY_WORKTREE"
  | "UNKNOWN";
export interface RepeatQualification {
  readonly status: "PASS" | "FAIL" | "BLOCKED" | "UNTESTED";
  readonly evidenceLevel: "ISOLATED_REFERENCE" | "REAL_REPOSITORY";
  readonly scope: RepeatQualificationScope;
  readonly comparison: RepeatComparison;
  readonly reason: string;
}

function validHash(value: unknown): value is string {
  return isSha256(value);
}

function artifactKey(artifact: RepeatBuildArtifact): string {
  return `${artifact.path}|${artifact.compression}`;
}

function artifactPayload(
  artifact: RepeatBuildArtifact,
): Record<string, unknown> {
  return {
    path: artifact.path,
    bytes: artifact.bytes,
    size: artifact.size,
    sha256: artifact.sha256,
    compression: artifact.compression,
  };
}

function snapshotPayload(
  snapshot: RepeatBuildSnapshotInput,
): Record<string, unknown> {
  return {
    documentId: FP007_REPEAT_BUILD_DOCUMENT,
    inputHash: snapshot.inputHash,
    buildManifestHash: snapshot.buildManifestHash,
    manifestCanonicalJson: snapshot.manifestCanonicalJson,
    toolchainHash: snapshot.toolchainHash,
    artifactManifestHash: snapshot.artifactManifestHash,
    artifacts: [...snapshot.artifacts].sort((left, right) =>
      compareCodePointStrings(artifactKey(left), artifactKey(right))
    ).map(artifactPayload),
  };
}

export async function createRepeatBuildSnapshot(
  input: RepeatBuildSnapshotInput,
): Promise<RepeatBuildSnapshot> {
  const payload = snapshotPayload(input);
  return {
    ...input,
    documentId: FP007_REPEAT_BUILD_DOCUMENT,
    snapshotHash: await sha256Hex(canonicalJson(payload)),
  };
}

export function snapshotFromArtifactManifest(
  input: Omit<RepeatBuildSnapshotInput, "artifacts"> & {
    readonly artifactManifest: ArtifactManifest;
  },
): RepeatBuildSnapshotInput {
  return {
    inputHash: input.inputHash,
    buildManifestHash: input.buildManifestHash,
    manifestCanonicalJson: input.manifestCanonicalJson,
    toolchainHash: input.toolchainHash,
    artifactManifestHash: input.artifactManifestHash,
    artifacts: input.artifactManifest.artifacts.map((artifact) => ({
      path: artifact.path,
      bytes: artifact.bytes,
      size: artifact.size,
      sha256: artifact.sha256,
      compression: artifact.compression,
    })),
  };
}

export function compareRepeatBuilds(
  first: RepeatBuildSnapshot,
  second: RepeatBuildSnapshot,
): RepeatComparison {
  const differences: RepeatDifference[] = [];
  if (first.inputHash !== second.inputHash) {
    differences.push({
      code: "INPUT_HASH_CHANGED",
      message: "Build input hash changed between runs.",
    });
  }
  if (first.buildManifestHash !== second.buildManifestHash) {
    differences.push({
      code: "BUILD_MANIFEST_HASH_CHANGED",
      message: "Build manifest hash changed between runs.",
    });
  }
  if (first.manifestCanonicalJson !== second.manifestCanonicalJson) {
    differences.push({
      code: "MANIFEST_BYTES_CHANGED",
      message: "Canonical build manifest bytes changed between runs.",
    });
  }
  if (first.toolchainHash !== second.toolchainHash) {
    differences.push({
      code: "TOOLCHAIN_CHANGED",
      message: "Toolchain hash changed between runs.",
    });
  }
  if (first.artifactManifestHash !== second.artifactManifestHash) {
    differences.push({
      code: "ARTIFACT_MANIFEST_HASH_CHANGED",
      message: "Artifact manifest hash changed between runs.",
    });
  }
  const firstMap = new Map(
    first.artifacts.map((artifact) => [artifactKey(artifact), artifact]),
  );
  const secondMap = new Map(
    second.artifacts.map((artifact) => [artifactKey(artifact), artifact]),
  );
  for (const key of new Set([...firstMap.keys(), ...secondMap.keys()])) {
    const left = firstMap.get(key);
    const right = secondMap.get(key);
    if (left === undefined || right === undefined) {
      differences.push({
        code: "ARTIFACT_SET_CHANGED",
        path: key,
        message: "Artifact set changed between runs.",
      });
      continue;
    }
    if (left.bytes !== right.bytes) {
      differences.push({
        code: "ARTIFACT_BYTES_CHANGED",
        path: left.path,
        message: "Artifact bytes changed between runs.",
      });
    }
    if (left.size !== right.size) {
      differences.push({
        code: "ARTIFACT_SIZE_CHANGED",
        path: left.path,
        message: "Artifact size changed between runs.",
      });
    }
    if (left.sha256 !== right.sha256) {
      differences.push({
        code: "ARTIFACT_HASH_CHANGED",
        path: left.path,
        message: "Artifact hash changed between runs.",
      });
    }
    if (left.compression !== right.compression) {
      differences.push({
        code: "ARTIFACT_COMPRESSION_CHANGED",
        path: left.path,
        message: "Artifact compression changed between runs.",
      });
    }
  }
  return {
    equal: differences.length === 0,
    status: differences.length === 0 ? "PASS" : "FAIL",
    differences,
  };
}

export function qualifyRepeatBuild(
  first: RepeatBuildSnapshot,
  second: RepeatBuildSnapshot,
  scope: RepeatQualificationScope,
): RepeatQualification {
  const comparison = compareRepeatBuilds(first, second);
  if (!comparison.equal) {
    return {
      status: "FAIL",
      evidenceLevel: scope === "ISOLATED_FIXTURE"
        ? "ISOLATED_REFERENCE"
        : "REAL_REPOSITORY",
      scope,
      comparison,
      reason: "Repeat-build inputs or outputs differ.",
    };
  }
  if (scope === "ISOLATED_FIXTURE") {
    return {
      status: "PASS",
      evidenceLevel: "ISOLATED_REFERENCE",
      scope,
      comparison,
      reason:
        "Identical isolated fixture inputs produced identical bytes, hashes, manifest, sizes, and toolchain identity.",
    };
  }
  if (scope === "REAL_CLEAN_CHECKOUT") {
    return {
      status: "PASS",
      evidenceLevel: "REAL_REPOSITORY",
      scope,
      comparison,
      reason:
        "A real clean-checkout repeat build matched all deterministic identity fields.",
    };
  }
  if (scope === "REAL_DIRTY_WORKTREE") {
    return {
      status: "BLOCKED",
      evidenceLevel: "REAL_REPOSITORY",
      scope,
      comparison,
      reason:
        "The worktree is dirty; matching local output cannot qualify a clean-checkout build.",
    };
  }
  return {
    status: "UNTESTED",
    evidenceLevel: "REAL_REPOSITORY",
    scope,
    comparison,
    reason: "The repeat-build environment was not identified.",
  };
}
