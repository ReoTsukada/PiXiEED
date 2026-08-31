import {
  attachAudioRevision,
  createAudioProject,
} from "../../src/audio/audio-200/state.ts";
import {
  asAudioAssetId,
  asAudioContentHash,
  asAudioRevisionId,
  type AudioProject,
  type AudioRevision,
} from "../../src/audio/audio-200/contracts.ts";
import { createEventGraph } from "../../src/audio/audio-210/core.ts";
import { createAudioPackage } from "../../src/audio/audio-220/core.ts";
import { createAudio230Geometry } from "../../src/audio/audio-230/geometry.ts";
import { createAudio230Workspace } from "../../src/audio/audio-230/workspace.ts";
import {
  type Audio240EvidenceInput,
  evaluateAudio240Gate,
} from "../../src/audio/audio-240/index.ts";

const assert: (value: unknown, message?: string) => asserts value = (
  value,
  message = "assertion failed",
): asserts value => {
  if (!value) throw new Error(message);
};
const H = asAudioContentHash("a".repeat(64));
const NOW = Date.parse("2026-08-13T00:00:00.000Z");

async function fixture(
  mode: "PINNED" | "LIVE" = "PINNED",
): Promise<{ evidence: Audio240EvidenceInput; project: AudioProject }> {
  const created = await createAudioProject({
    projectId: "audio-240-project" as never,
    name: "Gate fixture",
    createdAt: "2026-08-12T00:00:00.000Z",
  });
  assert(created.ok);
  const revision: AudioRevision = {
    schemaVersion: "AUDIO-200_V1",
    assetId: asAudioAssetId("asset-1"),
    revisionId: asAudioRevisionId("revision-1"),
    revisionNumber: 1,
    kind: "CLIP",
    referenceMode: "PINNED",
    source: {
      blobId: "blob-1" as never,
      locator: {
        placement: "OPFS",
        namespace: "audio",
        relativePath: "revision-1.wav",
        contentHash: H,
        byteLength: 96,
      },
      metadata: {
        codec: "WAV_PCM",
        mimeType: "audio/wav",
        sampleRateHz: 48_000,
        channels: 1,
        bitDepth: 16,
        sampleFrames: 48_000,
        durationUs: 1_000_000,
        byteLength: 96,
        contentHash: H,
      },
    },
    metadataAuthority: "AUDIO-200_CANONICAL_METADATA_V1",
    createdAt: "2026-08-12T00:00:00.000Z",
    verified: true,
  };
  const attached = await attachAudioRevision(created.value, revision);
  assert(attached.ok);
  const graph = await createEventGraph(attached.value, [{
    eventKey: "start",
    assetId: revision.assetId,
    revisionId: revision.revisionId,
    eventKind: "BGM",
    trigger: "PROJECT_START",
    referenceMode: mode,
  }]);
  assert(graph.ok);
  const geometry = createAudio230Geometry({
    width: 1440,
    height: 900,
    safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
    textScale: 1,
    keyboardInset: 0,
  });
  assert(geometry.ok);
  const workspace = createAudio230Workspace(geometry.value);
  assert(workspace.ok);
  const license = {
    snapshotId: "license-1",
    licenseId: "CC0-1.0",
    kind: "CC0" as const,
    version: "1.0",
    subjectId: "asset-1",
    holderId: "creator-1",
    attributionRequired: false,
    derivativeAllowed: true,
    commercialUseAllowed: true,
    sourceUri: "https://example.test/cc0",
    snapshotHash: H,
  };
  const provenance = {
    origin: "CREATED" as const,
    creatorId: "creator-1",
    sourceRevisionId: revision.revisionId,
    sourceHash: H,
    snapshotHash: H,
  };
  const packageResult = mode === "PINNED"
    ? await createAudioPackage(
      attached.value,
      graph.value,
      "THIN",
      "audio-240-package",
      { resolveLicense: () => license, resolveProvenance: () => provenance },
    )
    : null;
  if (packageResult) assert(packageResult.ok);
  return {
    project: attached.value,
    evidence: {
      schemaVersion: "AUDIO-240_V1",
      stamp: {
        capturedAt: "2026-08-13T00:00:00.000Z",
        validUntil: "2026-08-14T00:00:00.000Z",
        sourceId: "audio-240-test-fixture",
        sourceHash: H,
      },
      project: attached.value,
      graph: graph.value,
      package: packageResult?.value ?? null,
      workspace: workspace.value,
      crossTool: {
        drawLiveAccepted: true,
        drawPinnedAccepted: true,
        gameLiveAccepted: true,
        gamePinnedAccepted: true,
        safeRollbackVerified: true,
      },
      environment: { browser: "PASS", device: "PASS", production: "PASS" },
    },
  };
}

Deno.test("AUDIO-240 returns deterministic PASS only for coherent complete evidence", async () => {
  const first = await fixture();
  const second = await fixture();
  const a = await evaluateAudio240Gate(first.evidence, {
    nowMs: NOW,
    maxAgeMs: 86_400_000,
  });
  const b = await evaluateAudio240Gate(second.evidence, {
    nowMs: NOW,
    maxAgeMs: 86_400_000,
  });
  assert(a.ok && b.ok);
  assert(
    a.value.decision === "PASS" && a.value.ready &&
      a.value.publishAllowed === false,
  );
  assert(
    JSON.stringify(a.value) === JSON.stringify(b.value),
    "Gate result is not deterministic.",
  );
});

Deno.test("AUDIO-240 fails closed for missing environment/package and stale evidence", async () => {
  const base = await fixture();
  const missing = await evaluateAudio240Gate({
    ...base.evidence,
    package: null,
    environment: {
      browser: "UNTESTED",
      device: "UNTESTED",
      production: "UNTESTED",
    },
  }, { nowMs: NOW, maxAgeMs: 86_400_000 });
  assert(
    missing.ok && missing.value.decision === "UNTESTED" &&
      !missing.value.ready &&
      missing.value.diagnostics.some((item) =>
        item.code === "AUDIO240_ENVIRONMENT_UNTESTED"
      ),
  );
  const stale = await evaluateAudio240Gate(base.evidence, {
    nowMs: NOW + 86_400_001,
    maxAgeMs: 86_400_000,
  });
  assert(!stale.ok && stale.diagnostics[0]?.code === "AUDIO240_STALE_EVIDENCE");
});

Deno.test("AUDIO-240 rejects contradictory project/hash evidence and preserves LIVE semantics", async () => {
  const base = await fixture();
  const tamperedProject = {
    ...base.project,
    stateHash: asAudioContentHash("b".repeat(64)),
  };
  const tampered = await evaluateAudio240Gate({
    ...base.evidence,
    project: tamperedProject,
  }, { nowMs: NOW, maxAgeMs: 86_400_000 });
  assert(
    tampered.ok && tampered.value.decision === "BLOCKED" &&
      tampered.value.diagnostics.some((item) =>
        item.code === "AUDIO240_HASH_MISMATCH"
      ),
  );
  const live = await fixture("LIVE");
  assert(live.evidence.graph.bindings[0]?.referenceMode === "LIVE");
  const liveResult = await evaluateAudio240Gate(live.evidence, {
    nowMs: NOW,
    maxAgeMs: 86_400_000,
  });
  assert(
    liveResult.ok && liveResult.value.referenceModes.live === 1 &&
      liveResult.value.referenceModes.pinned === 0 &&
      liveResult.value.packageHash === null,
  );
});

Deno.test("AUDIO-240 rejects page scroll and incomplete cross-tool evidence", async () => {
  const base = await fixture();
  const scroll = {
    ...base.evidence.workspace,
    geometry: {
      ...base.evidence.workspace.geometry,
      pageScroll: { horizontal: true as true, vertical: false as false },
    },
  };
  const result = await evaluateAudio240Gate({
    ...base.evidence,
    workspace: scroll as never,
    crossTool: { ...base.evidence.crossTool, safeRollbackVerified: false },
  }, { nowMs: NOW, maxAgeMs: 86_400_000 });
  assert(
    result.ok && result.value.decision === "BLOCKED" &&
      result.value.diagnostics.some((item) =>
        item.code === "AUDIO240_PAGE_SCROLL"
      ),
  );
});
