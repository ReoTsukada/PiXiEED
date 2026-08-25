import { asAudioAssetId, asAudioContentHash, asAudioProjectId, asAudioRevisionId, type AudioProject } from "../../src/audio/audio-200/contracts.ts";
import { beginPreview, cancelPreview, commitPreview, createEventBinding, createEventGraph, planPlayback, validateDecodeResult } from "../../src/audio/audio-210/core.ts";
import type { AudioDecodeRequest } from "../../src/audio/audio-210/contracts.ts";

function assert(value: unknown, message = "assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`);
}

const H1 = asAudioContentHash("1".repeat(64));
const H2 = asAudioContentHash("2".repeat(64));
const projectId = asAudioProjectId("audio-project");
const assetId = asAudioAssetId("clip-1");

function revision(revisionId: string, revisionNumber: number, contentHash: typeof H1) {
  return {
    schemaVersion: "AUDIO-200_V1" as const, assetId, revisionId: asAudioRevisionId(revisionId), revisionNumber,
    kind: "CLIP" as const, referenceMode: "LIVE" as const,
    source: {
      blobId: `blob-${revisionId}` as never,
      locator: { placement: "MEMORY_PREVIEW" as const, namespace: "audio" as const, relativePath: `${revisionId}.wav`, contentHash, byteLength: 100 },
      metadata: { codec: "WAV_PCM" as const, mimeType: "audio/wav" as const, sampleRateHz: 48_000, channels: 1 as const, bitDepth: 16 as const, sampleFrames: 48_000, durationUs: 1_000_000, byteLength: 100, contentHash },
    }, metadataAuthority: "AUDIO-200_CANONICAL_METADATA_V1" as const, createdAt: "2026-01-01T00:00:00Z", verified: true as const,
  };
}

const project = {
  schemaVersion: "AUDIO-200_V1" as const, projectId, name: "fixture", createdAt: "2026-01-01T00:00:00Z", projectRevision: 1, stateHash: H1,
  tempo: { milliBpm: 120000 }, timebase: { kind: "PPQ" as const, ticksPerQuarter: 480 }, revisions: [revision("r1", 1, H1)],
  tracks: [], clips: [], notes: [], automations: [], mixer: { mixerId: "mixer" as never, channels: [], masterGainMilliDb: 0 }, effects: [], markers: [],
} as unknown as AudioProject;

const input = { eventKey: "bgm", assetId, revisionId: asAudioRevisionId("r1"), eventKind: "BGM" as const, trigger: "PROJECT_START" as const, referenceMode: "LIVE" as const };

Deno.test("AUDIO-210 binds event identity to canonical project and revision", async () => {
  const result = await createEventBinding(project, input);
  assert(result.ok);
  assertEquals(result.value.identity.projectId, projectId);
  assertEquals(result.value.contentHash, H1);
  const wrong = await createEventBinding(project, input, { projectId: "wrong-project" });
  assertEquals(wrong.ok, false);
  if (!wrong.ok) assertEquals(wrong.diagnostics[0]?.code, "AUDIO210_EVENT_IDENTITY_MISMATCH");
});

Deno.test("AUDIO-210 rejects duplicate events and wrong projects", async () => {
  const duplicate = await createEventGraph(project, [input, input]);
  assertEquals(duplicate.ok, false);
  if (!duplicate.ok) assertEquals(duplicate.diagnostics[0]?.code, "AUDIO210_DUPLICATE_EVENT");
  const graph = await createEventGraph(project, [input]);
  assert(graph.ok);
  const wrong = await beginPreview({ ...project, projectId: asAudioProjectId("other") }, graph.value, "preview");
  assertEquals(wrong.ok, false);
  if (!wrong.ok) assertEquals(wrong.diagnostics[0]?.code, "AUDIO210_WRONG_PROJECT");
});

Deno.test("AUDIO-210 preview cancel and stale commit are fail-closed", async () => {
  const graph = await createEventGraph(project, [input]);
  assert(graph.ok);
  const preview = await beginPreview(project, graph.value, "preview");
  assert(preview.ok);
  const cancelled = await cancelPreview(preview.value);
  assert(cancelled.ok);
  const committed = await commitPreview(project, graph.value, preview.value);
  assert(committed.ok);
  assertEquals(committed.value.preview.status, "COMMITTED");
  assertEquals(committed.value.graph.graphRevision, 2);
  const rejected = await commitPreview(project, graph.value, cancelled.value);
  assertEquals(rejected.ok, false);
  if (!rejected.ok) assertEquals(rejected.diagnostics[0]?.code, "AUDIO210_PREVIEW_CANCELLED");
  const stale = await commitPreview({ ...project, projectRevision: 2 }, graph.value, preview.value);
  assertEquals(stale.ok, false);
  if (!stale.ok) assertEquals(stale.diagnostics[0]?.code, "AUDIO210_STALE_PREVIEW");
});

Deno.test("AUDIO-210 LIVE defers hot swap and PINNED stays fixed", async () => {
  const liveGraph = await createEventGraph(project, [input]);
  assert(liveGraph.ok);
  const liveProject = { ...project, revisions: [revision("r1", 1, H1), revision("r2", 2, H2)] } as unknown as AudioProject;
  const live = await planPlayback(liveProject, liveGraph.value, { eventId: liveGraph.value.bindings[0]!.identity.eventId, currentPlayback: { isPlaying: true, revisionId: asAudioRevisionId("r1"), loop: true } });
  assert(live.ok);
  assertEquals(live.value.revisionId, asAudioRevisionId("r2"));
  assertEquals(live.value.deferred, true);
  const pinnedGraph = await createEventGraph(project, [{ ...input, referenceMode: "PINNED" }]);
  assert(pinnedGraph.ok);
  const pinned = await planPlayback(liveProject, pinnedGraph.value, { eventId: pinnedGraph.value.bindings[0]!.identity.eventId });
  assert(pinned.ok);
  assertEquals(pinned.value.revisionId, asAudioRevisionId("r1"));
});

Deno.test("AUDIO-210 rejects unsupported or forged decoder results", () => {
  const request = { projectId, eventId: "audio-project:bgm" as never, assetId, revisionId: asAudioRevisionId("r1"), contentHash: H1, byteLength: 100, codec: "WAV_PCM" as const, mimeType: "audio/wav" as const, sampleRateHz: 48_000, channels: 1 as const, durationUs: 1_000_000, locator: { placement: "MEMORY_PREVIEW" as const, namespace: "audio" as const, relativePath: "r1.wav", contentHash: H1, byteLength: 100 } } satisfies AudioDecodeRequest;
  assertEquals(validateDecodeResult({ ...request, codec: "MP3" as never }, { status: "DECODED", codec: "MP3" as never, sampleRateHz: 48_000, channels: 1, durationUs: 1_000_000, byteLength: 100, contentHash: H1 }).ok, false);
  assertEquals(validateDecodeResult(request, { status: "DECODED", codec: "WAV_PCM", sampleRateHz: 44_100, channels: 1, durationUs: 1_000_000, byteLength: 100, contentHash: H1 }).ok, false);
});
