import { createProject } from "../../src/draw2-core.ts";
import {
  exportPxdProject,
} from "../../src/draw2-export.ts";
import {
  asSha256,
  canonicalJson,
} from "../../src/game/game-300/core.ts";
import {
  createGoldenProject,
  type GoldenAssetInput,
} from "../../src/studio/golden-project.ts";
import {
  createStudioReleaseCandidate,
  type StudioAssetRegistryEntry,
  type StudioReleaseCandidate,
} from "../../src/studio/package-publish.ts";
import {
  materializeStudioReleaseArtifact,
  STUDIO_ARTIFACT_PATHS,
  verifyStudioReleaseArtifactBundle,
  type StudioMaterializationSource,
} from "../../src/studio/artifact-materializer.ts";

const DRAW_HASH = "a".repeat(64);
const AUDIO_HASH = "b".repeat(64);
const PROJECT_ID = "studio:artifact";
const OWNER_ID = "owner:artifact";
const DRAW_ASSET_ID = `${PROJECT_ID}:draw:main`;

function asset(kind: GoldenAssetInput["kind"]): GoldenAssetInput {
  return {
    projectId: PROJECT_ID,
    ownerId: OWNER_ID,
    kind,
    assetId: kind === "DRAW" ? DRAW_ASSET_ID : "audio:theme",
    revisionId: kind === "DRAW" ? "draw-revision-0" : "audio:theme:r1",
    contentHash: kind === "DRAW" ? DRAW_HASH : AUDIO_HASH,
    licenseId: kind === "DRAW" ? "license:draw" : "license:audio",
    permission: "READ",
    reviewStatus: "APPROVED",
    label: kind === "DRAW" ? "Hero" : "Theme",
  };
}

function fixtureWav(): Uint8Array {
  const bytes = new Uint8Array(48);
  const encoder = new TextEncoder();
  bytes.set(encoder.encode("RIFF"), 0);
  bytes.set(encoder.encode("WAVE"), 8);
  bytes.set(encoder.encode("fmt "), 12);
  bytes.set(encoder.encode("data"), 36);
  return bytes;
}

async function fixture(): Promise<{
  candidate: StudioReleaseCandidate;
  sources: readonly StudioMaterializationSource[];
}> {
  const drawState = createProject({
    projectId: PROJECT_ID,
    name: "Artifact Draw",
    width: 2,
    height: 2,
    tileSize: 32,
    palette: [0, 0xffffffff],
  });
  const pxd = await exportPxdProject(drawState);
  const golden = await createGoldenProject({
    projectId: PROJECT_ID,
    ownerId: OWNER_ID,
    name: "Artifact Project",
    draw: asset("DRAW"),
    audio: asset("AUDIO"),
  }, "PINNED");
  if (!golden.ok) throw new Error(JSON.stringify(golden.diagnostics));
  const assetRegistry: StudioAssetRegistryEntry[] = golden.value.manifest.assetLocks
    .map((entry) => ({
      kind: entry.kind,
      assetId: entry.assetId,
      revisionId: entry.revisionId,
      contentHash: entry.contentHash,
      ownerId: entry.ownerId,
      licenseId: entry.licenseId,
      byteLength: entry.kind === "DRAW" ? pxd.bytes.byteLength : 48,
      mimeType: entry.kind === "DRAW"
        ? "application/vnd.pixieed.pxd"
        : "audio/wav",
      sourcePackage: entry.kind === "DRAW" ? "PXD" : "AUDIO",
    }));
  const candidate = await createStudioReleaseCandidate({
    packageId: "studio:artifact",
    packageVersion: "1.0.0",
    project: golden.value.project,
    integration: golden.value.manifest,
    caller: golden.value.caller,
    assetRegistry,
  });
  if (!candidate.ok || candidate.value === undefined) {
    throw new Error(JSON.stringify(candidate.diagnostics));
  }
  return {
    candidate: candidate.value,
    sources: [
      {
        kind: "PXD",
        bytes: pxd.bytes,
        mimeType: "application/vnd.pixieed.pxd",
        sourceReference: {
          assetId: DRAW_ASSET_ID,
          revisionId: "draw-revision-0",
          contentHash: asSha256(DRAW_HASH),
        },
      },
      {
        kind: "AUDIO",
        bytes: fixtureWav(),
        mimeType: "audio/wav",
        sourceProjectId: PROJECT_ID,
        sourceStateHash: asSha256(AUDIO_HASH),
        sourceProjectRevision: 1,
      },
      {
        kind: "GAME",
        bytes: new TextEncoder().encode(canonicalJson(golden.value.project)),
        mimeType: "application/json",
        project: golden.value.project,
      },
    ],
  };
}

Deno.test("STUDIO-030 materializes three artifacts and a deterministic ZIP", async () => {
  const input = await fixture();
  const first = await materializeStudioReleaseArtifact(input);
  const second = await materializeStudioReleaseArtifact(input);
  if (!first.ok || first.value === undefined || !second.ok || second.value === undefined) {
    throw new Error(JSON.stringify({ first, second }));
  }
  if (
    first.value.zip.contentHash !== second.value.zip.contentHash ||
    first.value.manifest.reproducibleBuildIdentity !==
      second.value.manifest.reproducibleBuildIdentity
  ) {
    throw new Error("Same source Revision must produce the same ZIP identity.");
  }
  if (
    first.value.artifacts.map((artifact) => artifact.kind).join(",") !==
      "PXD,AUDIO,GAME"
  ) {
    throw new Error("PXD, AUDIO, and GAME artifacts are required.");
  }
  for (const artifact of first.value.artifacts) {
    if (
      artifact.path !== STUDIO_ARTIFACT_PATHS[artifact.kind] ||
      artifact.byteLength !== artifact.bytes.byteLength ||
      artifact.contentHash.length !== 64
    ) {
      throw new Error(`Artifact record is inconsistent: ${artifact.kind}`);
    }
  }
  const verified = await verifyStudioReleaseArtifactBundle(first.value);
  if (!verified.ok) throw new Error(JSON.stringify(verified.diagnostics));
});

Deno.test("STUDIO-030 rejects wrong source identity and candidate tampering", async () => {
  const input = await fixture();
  const wrongAudio = input.sources.map((source) =>
    source.kind === "AUDIO"
      ? { ...source, sourceStateHash: asSha256("c".repeat(64)) }
      : source
  );
  const sourceRejected = await materializeStudioReleaseArtifact({
    ...input,
    sources: wrongAudio,
  });
  if (
    sourceRejected.ok ||
    !sourceRejected.diagnostics.some((item) => item.code === "HASH_MISMATCH")
  ) {
    throw new Error("AUDIO source identity must be checked against the lock.");
  }

  const tamperedCandidate: StudioReleaseCandidate = {
    ...input.candidate,
    manifest: {
      ...input.candidate.manifest,
      packageHash: asSha256("d".repeat(64)),
    },
  };
  const candidateRejected = await materializeStudioReleaseArtifact({
    ...input,
    candidate: tamperedCandidate,
  });
  if (
    candidateRejected.ok ||
    !candidateRejected.diagnostics.some((item) => item.code === "HASH_MISMATCH")
  ) {
    throw new Error("Tampered Release Candidate must fail closed.");
  }
});

Deno.test("STUDIO-030 detects changed artifact bytes, length, and path", async () => {
  const input = await fixture();
  const materialized = await materializeStudioReleaseArtifact(input);
  if (!materialized.ok || materialized.value === undefined) {
    throw new Error(JSON.stringify(materialized.diagnostics));
  }
  const audio = materialized.value.artifacts.find((artifact) => artifact.kind === "AUDIO");
  if (audio === undefined) throw new Error("AUDIO artifact is missing.");
  const tampered = {
    ...materialized.value,
    artifacts: materialized.value.artifacts.map((artifact) =>
      artifact.kind === "AUDIO"
        ? {
          ...artifact,
          bytes: new Uint8Array([...artifact.bytes, 7]),
          byteLength: artifact.byteLength,
          path: "../audio/master.wav",
        }
        : artifact
    ),
  };
  const rejected = await verifyStudioReleaseArtifactBundle(tampered);
  if (
    rejected.ok ||
    !rejected.diagnostics.some((item) => item.code === "HASH_MISMATCH") ||
    !rejected.diagnostics.some((item) => item.code === "INVALID_CLAIM")
  ) {
    throw new Error("Changed bytes, length, and path must be detected.");
  }
  void audio;
});
