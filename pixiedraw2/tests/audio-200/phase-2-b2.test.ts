import {
  asAudioAssetId,
  asAudioRevisionId,
  asSourceBlobId,
  buildAudioWaveformPeakCacheFromChunkReader,
  canonicalizeSourceBlob,
  createAudioPcmChunkReader,
  createMemoryAudioAssetByteStore,
} from "../../src/audio/audio-200/index.ts";
import type { AudioRevision } from "../../src/audio/audio-200/contracts.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function wavFixture(sampleFrames: number): Uint8Array {
  const bytes = new Uint8Array(44 + sampleFrames * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      bytes[offset + index] = value.charCodeAt(index);
    }
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8_000, true);
  view.setUint32(28, 16_000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, sampleFrames * 2, true);
  for (let index = 0; index < sampleFrames; index += 1) {
    view.setInt16(44 + index * 2, (index % 256) * 128 - 16_384, true);
  }
  return bytes;
}

async function fixture(): Promise<{
  readonly bytes: Uint8Array;
  readonly revision: AudioRevision;
}> {
  const bytes = wavFixture(8_000);
  const revision = await canonicalizeSourceBlob({
    blobId: asSourceBlobId("stream-source"),
    assetId: asAudioAssetId("stream-asset"),
    revisionId: asAudioRevisionId("stream-revision"),
    revisionNumber: 1,
    kind: "SONG",
    referenceMode: "PINNED",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath: "sources/stream-asset/stream-revision.wav",
    },
    bytes,
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  assert(revision.ok, JSON.stringify(revision.diagnostics));
  return { bytes, revision: revision.value };
}

Deno.test("Phase 2-B2 byte ranges are bounded and preserve immutable source bytes", async () => {
  const source = await fixture();
  const store = createMemoryAudioAssetByteStore();
  assert(
    (await store.put(source.revision, source.bytes)).ok,
    "Source put failed.",
  );
  const range = await store.getRange(source.revision, 44, 8);
  assert(range.ok && range.value !== null, "Source range was unavailable.");
  assert(
    range.value[0] === source.bytes[44] && range.value.length === 8,
    "Range bytes were not projected exactly.",
  );
  const invalid = await store.getRange(source.revision, 0, 4 * 1024 * 1024 + 1);
  assert(!invalid.ok, "An oversized range was accepted.");
});

Deno.test("Phase 2-B2 chunk reader keeps read-ahead/LRU bounded and releases on clear", async () => {
  const source = await fixture();
  const store = createMemoryAudioAssetByteStore();
  assert(
    (await store.put(source.revision, source.bytes)).ok,
    "Source put failed.",
  );
  const created = await createAudioPcmChunkReader(store, source.revision, {
    shortAudioMaxBytes: 1,
    shortAudioMaxSeconds: 0.01,
    chunkSeconds: 0.01,
    readAheadChunks: 2,
    maxCachedChunks: 2,
    maxRangeBytes: 1_024,
  });
  assert(created.ok, JSON.stringify(created.diagnostics));
  const reader = created.value;
  assert(
    reader.plan.mode === "CHUNKED",
    "Long source did not select chunked mode.",
  );
  assert(
    reader.plan.chunkFrames === 80,
    "Chunk frame size did not follow the read-ahead plan.",
  );
  const first = await reader.readChunk(0);
  assert(first.ok && first.value !== null, "First PCM chunk was not decoded.");
  assert(
    first.value.samples[0]![0] !== undefined &&
      first.value.samples[0]![0]! < -0.4,
    "PCM normalization was not applied.",
  );
  await reader.prefetchAround(10);
  const bounded = reader.snapshot();
  assert(bounded.cachedChunkCount <= 2, "Chunk cache exceeded its LRU bound.");
  assert(
    bounded.cachedSampleCount <= 2 * reader.plan.chunkFrames,
    "PCM cache grew beyond the bounded window.",
  );
  const later = await reader.readChunk(50);
  assert(
    later.ok && later.value !== null,
    "A later chunk was not seek-readable.",
  );
  const waveform = await buildAudioWaveformPeakCacheFromChunkReader(
    reader,
    source.revision,
    { baseBucketSize: 256, levels: 4 },
  );
  assert(
    waveform.ok && waveform.value.levels.length === 4,
    "Chunk-based waveform cache did not complete.",
  );
  assert(
    reader.snapshot().cachedChunkCount <= 2,
    "Waveform generation exceeded the bounded PCM cache.",
  );
  reader.clear();
  const cleared = reader.snapshot();
  assert(
    cleared.cachedChunkCount === 0 && cleared.inFlightChunkIndices.length === 0,
    "Clear did not release chunk state.",
  );
});
