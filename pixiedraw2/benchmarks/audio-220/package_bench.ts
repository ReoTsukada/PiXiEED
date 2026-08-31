import { asAudioContentHash, asAudioAssetId, asAudioProjectId, asAudioRevisionId, type AudioProject } from "../../src/audio/audio-200/contracts.ts";
import { createEventGraph } from "../../src/audio/audio-210/core.ts";
import { createAudioPackage } from "../../src/audio/audio-220/core.ts";
import type { Audio220Authority } from "../../src/audio/audio-220/contracts.ts";

const hash = asAudioContentHash("a".repeat(64));
const projectId = asAudioProjectId("bench-audio-project");
const assetId = asAudioAssetId("bench-asset");
const revisionId = asAudioRevisionId("bench-revision");
const revision = { schemaVersion: "AUDIO-200_V1", assetId, revisionId, revisionNumber: 1, kind: "CLIP", referenceMode: "PINNED", source: { blobId: "blob" as never, locator: { placement: "OPFS", namespace: "audio", relativePath: "audio/bench.wav", contentHash: hash, byteLength: 128 }, metadata: { codec: "WAV_PCM", mimeType: "audio/wav", sampleRateHz: 48_000, channels: 1, bitDepth: 16, sampleFrames: 48_000, durationUs: 1_000_000, byteLength: 128, contentHash: hash } }, metadataAuthority: "AUDIO-200_CANONICAL_METADATA_V1", createdAt: "2026-01-01T00:00:00Z", verified: true } as const;
const project = { schemaVersion: "AUDIO-200_V1", projectId, name: "bench", createdAt: "2026-01-01T00:00:00Z", projectRevision: 1, stateHash: hash, tempo: { milliBpm: 120000 }, timebase: { kind: "PPQ", ticksPerQuarter: 480 }, revisions: [revision], tracks: [], clips: [], notes: [], automations: [], mixer: { mixerId: "mixer" as never, channels: [], masterGainMilliDb: 0 }, effects: [], markers: [] } as unknown as AudioProject;
const authority: Audio220Authority = { resolveLicense: () => ({ snapshotId: "bench-license", licenseId: "CC0-1.0", kind: "CC0", version: "1.0", subjectId: "bench-asset", holderId: "bench", attributionRequired: false, derivativeAllowed: true, commercialUseAllowed: true, sourceUri: "https://example.test/cc0", snapshotHash: hash }), resolveProvenance: () => ({ origin: "CREATED", creatorId: "bench", sourceRevisionId: revisionId, sourceHash: hash, snapshotHash: hash }) };
const graphPromise = createEventGraph(project, [{ eventKey: "bench", assetId, revisionId, eventKind: "SFX", trigger: "CUSTOM", referenceMode: "PINNED" }]);

Deno.bench("AUDIO-220 deterministic package creation", async () => {
  const graph = await graphPromise;
  if (!graph.ok) throw new Error(graph.diagnostics[0]?.message);
  const result = await createAudioPackage(project, graph.value, "PORTABLE", "bench-package", authority);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
});

