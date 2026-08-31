import {
  createGoldenProject,
  type GoldenAssetInput,
} from "../../src/studio/golden-project.ts";
import {
  createStudioBuildRequest,
  createStudioPublishIntent,
  createStudioReleaseCandidate,
  type StudioAssetRegistryEntry,
  type StudioReleaseCandidate,
  verifyStudioReleaseCandidate,
} from "../../src/studio/package-publish.ts";
import { asSha256 } from "../../src/game/game-300/core.ts";
import {
  createBuildPlan,
  createBuildRecord,
} from "../../src/wp160-build-pipeline.ts";
import type { BuildConfiguration } from "../../src/wp160-contracts.ts";

const DRAW_HASH = "a".repeat(64);
const AUDIO_HASH = "b".repeat(64);

function asset(kind: GoldenAssetInput["kind"]): GoldenAssetInput {
  return {
    projectId: "studio:package",
    ownerId: "owner:local",
    kind,
    assetId: kind === "DRAW" ? "draw:hero" : "audio:theme",
    revisionId: kind === "DRAW" ? "draw:hero:r1" : "audio:theme:r1",
    contentHash: kind === "DRAW" ? DRAW_HASH : AUDIO_HASH,
    licenseId: kind === "DRAW" ? "license:draw" : "license:audio",
    permission: "READ",
    reviewStatus: "APPROVED",
    label: kind === "DRAW" ? "Hero" : "Theme",
  };
}

async function fixture(mode: "LIVE" | "PINNED" = "PINNED") {
  const golden = await createGoldenProject({
    projectId: "studio:package",
    ownerId: "owner:local",
    name: "Package Project",
    draw: asset("DRAW"),
    audio: asset("AUDIO"),
  }, mode);
  if (!golden.ok) throw new Error(JSON.stringify(golden.diagnostics));
  const value = golden.value;
  const assetRegistry: StudioAssetRegistryEntry[] = value.manifest.assetLocks
    .map((entry) => ({
      kind: entry.kind,
      assetId: entry.assetId,
      revisionId: entry.revisionId,
      contentHash: entry.contentHash,
      ownerId: entry.ownerId,
      licenseId: entry.licenseId,
      byteLength: entry.kind === "DRAW" ? 1_024 : 2_048,
      mimeType: entry.kind === "DRAW" ? "image/png" : "audio/ogg",
      sourcePackage: entry.kind === "DRAW" ? "PXD" : "AUDIO",
    }));
  return {
    input: {
      packageId: "studio:package",
      packageVersion: "1.0.0",
      project: value.project,
      integration: value.manifest,
      caller: value.caller,
      assetRegistry,
    },
    assetRegistry,
  };
}

Deno.test("STUDIO-020 creates deterministic PXD, Audio, and Game packages", async () => {
  const one = await fixture();
  const two = await fixture();
  const first = await createStudioReleaseCandidate(one.input);
  const reversed = await createStudioReleaseCandidate({
    ...two.input,
    assetRegistry: two.assetRegistry.slice().reverse(),
  });
  if (
    !first.ok || first.value === undefined || !reversed.ok ||
    reversed.value === undefined
  ) {
    throw new Error(JSON.stringify({ first, reversed }));
  }
  if (
    first.value.manifest.packageHash !== reversed.value.manifest.packageHash ||
    first.value.manifest.reproducibleBuildIdentity !==
      reversed.value.manifest.reproducibleBuildIdentity
  ) {
    throw new Error(
      "Equivalent metadata must produce the same package identity.",
    );
  }
  if (
    first.value.manifest.packages.map((item) => item.kind).join(",") !==
      "PXD,AUDIO,GAME"
  ) {
    throw new Error("All three Studio packages must be present.");
  }
  if (!Object.values(first.value.verification).every((item) => item === true)) {
    throw new Error("Every Package verification flag must be true.");
  }
  const verified = await verifyStudioReleaseCandidate(first.value);
  if (!verified.ok) throw new Error(JSON.stringify(verified.diagnostics));
  const intent = await createStudioPublishIntent(first.value, "owner:local");
  if (!intent.ok || intent.value === undefined || !intent.value.explicit) {
    throw new Error("Verified package must create an explicit Publish Intent.");
  }
  const buildRequest = await createStudioBuildRequest(first.value, {
    requestId: "studio-build:1",
    target: "GENERIC_WEB_PACKAGE",
    configuration: {
      version: "1.0.0" as BuildConfiguration["version"],
      optimization: "RELEASE",
      compression: "BROTLI",
      capabilityProfile: "desktop",
      toolchainVersion: "studio-local",
    },
    runtime: {
      runtimeId: "pixie-runtime",
      runtimeVersion: "0.1.0",
      supportedManifestVersion: 1,
    },
  });
  if (!buildRequest.ok || buildRequest.value === undefined) {
    throw new Error(JSON.stringify(buildRequest.diagnostics));
  }
  const record = await createBuildRecord(buildRequest.value);
  if (record.lifecycle !== "PLANNED") {
    throw new Error(JSON.stringify(record.diagnostics));
  }
  const planA = await createBuildPlan(buildRequest.value);
  const planB = await createBuildPlan(buildRequest.value);
  if (
    planA.cacheKey !== planB.cacheKey ||
    planA.manifestHash !== planB.manifestHash
  ) {
    throw new Error("Studio Build plan must be reproducible.");
  }
});

Deno.test("STUDIO-020 rejects LIVE assets, missing rights, and raw media payloads", async () => {
  const live = await fixture("LIVE");
  const liveResult = await createStudioReleaseCandidate(live.input);
  if (
    liveResult.ok ||
    !liveResult.diagnostics.some((item) => item.code === "MODE_MISMATCH")
  ) {
    throw new Error("LIVE assets must not enter a publish package.");
  }

  const noLicense = await fixture();
  const withoutLicense = await createStudioReleaseCandidate({
    ...noLicense.input,
    integration: { ...noLicense.input.integration, licenses: [] },
  });
  if (
    withoutLicense.ok ||
    !withoutLicense.diagnostics.some((item) => item.code === "LICENSE_MISSING")
  ) {
    throw new Error("Missing package rights must fail closed.");
  }

  const raw = await fixture();
  const rawEntry = {
    ...raw.assetRegistry[0]!,
    bytes: new Uint8Array([1, 2, 3]),
  };
  const rawResult = await createStudioReleaseCandidate({
    ...raw.input,
    assetRegistry: [
      rawEntry,
      ...raw.assetRegistry.slice(1),
    ] as unknown as readonly StudioAssetRegistryEntry[],
  });
  if (
    rawResult.ok ||
    !rawResult.diagnostics.some((item) => item.path.includes("bytes"))
  ) {
    throw new Error("Raw media bytes must never enter a Studio Package.");
  }
});

Deno.test("STUDIO-020 rejects tampered integration hashes and tampered candidates", async () => {
  const source = await fixture();
  const tampered = await createStudioReleaseCandidate({
    ...source.input,
    integration: {
      ...source.input.integration,
      packageHash: asSha256("c".repeat(64)),
    },
  });
  if (
    tampered.ok ||
    !tampered.diagnostics.some((item) => item.code === "HASH_MISMATCH")
  ) {
    throw new Error("Tampered integration manifest must fail closed.");
  }

  const valid = await createStudioReleaseCandidate(source.input);
  if (!valid.ok || valid.value === undefined) {
    throw new Error(JSON.stringify(valid.diagnostics));
  }
  const candidate: StudioReleaseCandidate = {
    ...valid.value,
    manifest: {
      ...valid.value.manifest,
      packageHash: asSha256("d".repeat(64)),
    },
  };
  const rejected = await createStudioPublishIntent(candidate, "owner:local");
  if (
    rejected.ok ||
    !rejected.diagnostics.some((item) => item.code === "HASH_MISMATCH")
  ) {
    throw new Error("Tampered candidate must not create a Publish Intent.");
  }
});
