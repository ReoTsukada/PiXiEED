import { joinAudioTick, splitAudioTick, virtualChunkCount, virtualViewport } from "../../src/audio/audio-240/virtual-timeline.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertThrows(action: () => void): void {
  let thrown = false;
  try { action(); } catch { thrown = true; }
  if (!thrown) throw new Error("Expected action to throw.");
}

Deno.test("AUDIO-240 virtual timeline splits and joins long ticks", () => {
  const spec = { chunkTicks: 1_000 };
  const position = splitAudioTick(2_345, spec);
  assertEquals(position, { chunk: 2, offsetTick: 345 });
  assertEquals(joinAudioTick(position, spec), 2_345);
  assertEquals(virtualChunkCount(2_345, spec), 3);
});

Deno.test("AUDIO-240 virtual timeline rejects unsafe positions", () => {
  assertThrows(() => splitAudioTick(Number.MAX_SAFE_INTEGER + 1));
  assertThrows(() => joinAudioTick({ chunk: 1, offsetTick: 1_000_000_000 as never }));
});

Deno.test("AUDIO-240 virtual timeline preserves the safe integer boundary", () => {
  const position = splitAudioTick(Number.MAX_SAFE_INTEGER);
  assertEquals(joinAudioTick(position), Number.MAX_SAFE_INTEGER);
});

Deno.test("AUDIO-240 virtual timeline describes a bounded viewport", () => {
  assertEquals(virtualViewport(900, 2_100, { chunkTicks: 1_000 }), {
    start: { chunk: 0, offsetTick: 900 },
    end: { chunk: 2, offsetTick: 100 },
  });
  assertThrows(() => virtualViewport(2, 1));
});
