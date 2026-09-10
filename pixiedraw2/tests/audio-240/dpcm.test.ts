import {
  createDpcmSampleLibrary,
  decodeDpcmSample,
  dpcmSampleReferenceFromRange,
  DPCM_MAX_SAMPLE_FRAMES,
  isDpcmSampleReference,
  quantizeDpcmSample,
  removeDpcmSampleReference,
  upsertDpcmSampleReference,
} from "../../src/audio/audio-240/dpcm.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("AUDIO-240 DPCM quantization is bounded and packed", () => {
  const sample = quantizeDpcmSample(" jump ", new Float32Array(DPCM_MAX_SAMPLE_FRAMES + 8).fill(1), 16_000, true);
  assert(sample.sampleId === "jump", "DPCM sample ID was not normalized.");
  assert(sample.frameCount === DPCM_MAX_SAMPLE_FRAMES, "DPCM PCM was not truncated to the safe bound.");
  assert(sample.packedBits.length === 512 && sample.loop, "DPCM sample was not packed correctly.");
});

Deno.test("AUDIO-240 DPCM encoder and decoder share the bounded delta shape", () => {
  const sample = quantizeDpcmSample("shape", new Float32Array([1, -1, -1]), 16_000);
  const decoded = decodeDpcmSample(sample);
  assert(decoded instanceof Float32Array, "DPCM decoder did not return Float32Array.");
  assert(decoded.length === 3 && sample.packedBits.length === 1, "DPCM encoded shape is incorrect.");
  assert(
    Math.abs(decoded[0]! - 0.08) < 0.00001 &&
      Math.abs(decoded[1]!) < 0.00001 &&
      Math.abs(decoded[2]! + 0.08) < 0.00001,
    "DPCM decoder did not reproduce the shared one-bit delta steps.",
  );
});

Deno.test("AUDIO-240 DPCM references fail closed", () => {
  const valid = { sampleId: "jump", sourceRevisionId: "rev:1", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false };
  assert(isDpcmSampleReference(valid), "Valid DPCM reference was rejected.");
  assert(!isDpcmSampleReference({ ...valid, rateHz: "16000" }), "String DPCM rates were accepted.");
  assert(!isDpcmSampleReference({ ...valid, extra: true }), "Unknown DPCM payload keys were accepted.");
  assert(!isDpcmSampleReference({ ...valid, startFrame: -1 }), "Negative DPCM starts were accepted.");
  assert(!isDpcmSampleReference({ ...valid, startFrame: Number.MAX_SAFE_INTEGER + 1 }), "Unsafe DPCM starts were accepted.");
  assert(!isDpcmSampleReference({ ...valid, frameCount: DPCM_MAX_SAMPLE_FRAMES + 1 }), "Oversized DPCM references were accepted.");
});

Deno.test("AUDIO-240 DPCM library updates references immutably", () => {
  const sample = { sampleId: "jump", sourceRevisionId: "rev:1", startFrame: 0, frameCount: 128, rateHz: 16_000, loop: false } as const;
  const first = createDpcmSampleLibrary();
  const second = upsertDpcmSampleReference(first, sample);
  const third = upsertDpcmSampleReference(second, { ...sample, frameCount: 256 });
  const fourth = removeDpcmSampleReference(third, "jump");
  if (first.samples.length !== 0 || second.samples.length !== 1 || third.samples[0]?.frameCount !== 256 || fourth.samples.length !== 0) throw new Error("DPCM library mutation contract failed.");
});

Deno.test("AUDIO-240 DPCM range references stay bounded and metadata-only", () => {
  const reference = dpcmSampleReferenceFromRange({ sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 32, endFrame: 32 + DPCM_MAX_SAMPLE_FRAMES + 1, rateHz: 16_000 });
  assert(reference === undefined, "Oversized DPCM range should not be persisted as a reference.");
  assert(
    dpcmSampleReferenceFromRange({ sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 10, endFrame: 9, rateHz: 16_000 }) === undefined,
    "Reversed DPCM ranges were accepted.",
  );
  assert(
    dpcmSampleReferenceFromRange({ sampleId: "jump", sourceRevisionId: "rev:2", startFrame: "32", endFrame: 256, rateHz: 16_000 } as never) === undefined,
    "String DPCM range endpoints were accepted.",
  );
  assert(
    dpcmSampleReferenceFromRange({ sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 32, endFrame: 256, rateHz: 16_000, unknown: true } as never) === undefined,
    "Unknown DPCM range keys were accepted.",
  );
  const valid = dpcmSampleReferenceFromRange({ sampleId: "jump", sourceRevisionId: "rev:2", startFrame: 32, endFrame: 256, rateHz: 16_000, loop: true });
  assert(valid?.startFrame === 32 && valid.frameCount === 224 && valid.loop, "Valid DPCM range reference was not created.");
});

Deno.test("AUDIO-240 DPCM decoder rejects malformed lengths and rates", () => {
  const sample = quantizeDpcmSample("shape", new Float32Array([1, -1, -1]), 16_000);
  assert(decodeDpcmSample({ ...sample, rateHz: "16000" }) === undefined, "String DPCM rates reached the decoder.");
  assert(decodeDpcmSample({ ...sample, packedBits: new Uint8Array(0) }) === undefined, "Truncated DPCM bits reached the decoder.");
  assert(decodeDpcmSample({ ...sample, frameCount: DPCM_MAX_SAMPLE_FRAMES + 1, packedBits: new Uint8Array(513) }) === undefined, "Oversized DPCM frames reached the decoder.");
  assert(decodeDpcmSample({ ...sample, unknown: true }) === undefined, "Unknown DPCM decoder keys were accepted.");
});

Deno.test("AUDIO-240 DPCM PCM length stays bounded for hostile array-like input", () => {
  const nanLength = quantizeDpcmSample("nan", { length: Number.NaN } as never, 16_000);
  const fractionalLength = quantizeDpcmSample("fractional", { length: 3.75, 0: 1, 1: -1, 2: -1 } as never, 16_000);
  const hugeLength = quantizeDpcmSample("huge", { length: Number.MAX_VALUE, 0: 1 } as never, 16_000);
  assert(nanLength.frameCount === 0, "NaN PCM length was not rejected safely.");
  assert(fractionalLength.frameCount === 3, "Fractional PCM length was not bounded safely.");
  assert(hugeLength.frameCount === DPCM_MAX_SAMPLE_FRAMES, "Huge PCM length escaped the safe bound.");
});
