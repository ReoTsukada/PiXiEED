import { createEventGraph } from "../../src/audio/audio-210/core.ts";
import { asAudioAssetId, asAudioContentHash, asAudioProjectId, asAudioRevisionId, type AudioProject } from "../../src/audio/audio-200/contracts.ts";

const hash = asAudioContentHash("a".repeat(64));
const assetId = asAudioAssetId("asset");
const project = {
  schemaVersion: "AUDIO-200_V1", projectId: asAudioProjectId("bench-project"), name: "bench", createdAt: "2026-01-01T00:00:00Z", projectRevision: 1, stateHash: hash,
  tempo: { milliBpm: 120000 }, timebase: { kind: "PPQ", ticksPerQuarter: 480 }, revisions: [{ schemaVersion: "AUDIO-200_V1", assetId, revisionId: asAudioRevisionId("r1"), revisionNumber: 1, kind: "CLIP", referenceMode: "LIVE", source: { blobId: "blob" as never, locator: { placement: "MEMORY_PREVIEW", namespace: "audio", relativePath: "r1.wav", contentHash: hash, byteLength: 100 }, metadata: { codec: "WAV_PCM", mimeType: "audio/wav", sampleRateHz: 48000, channels: 1, bitDepth: 16, sampleFrames: 48000, durationUs: 1000000, byteLength: 100, contentHash: hash } }, metadataAuthority: "AUDIO-200_CANONICAL_METADATA_V1", createdAt: "2026-01-01T00:00:00Z", verified: true }],
  tracks: [], clips: [], notes: [], automations: [], mixer: { mixerId: "mixer" as never, channels: [], masterGainMilliDb: 0 }, effects: [], markers: [],
} as unknown as AudioProject;
const inputs = Array.from({ length: 24 }, (_, index) => ({ eventKey: `event-${index}`, assetId, revisionId: asAudioRevisionId("r1"), eventKind: "SFX" as const, trigger: "CUSTOM" as const, referenceMode: "LIVE" as const }));

Deno.bench("AUDIO-210 create 24-event graph", async () => {
  const result = await createEventGraph(project, inputs);
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
});
