import { createAudio230Geometry } from "../../src/audio/audio-230/geometry.ts";
import { projectAudio230Timeline, projectAudio230Waveform } from "../../src/audio/audio-230/projection.ts";
import { createAudio230Workspace } from "../../src/audio/audio-230/workspace.ts";

const geometry = createAudio230Geometry({ width: 1440, height: 900, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, textScale: 1, keyboardInset: 0 });
if (!geometry.ok) throw new Error(geometry.diagnostics[0]?.message);
const items = Array.from({ length: 2_000 }, (_, index) => ({ id: `item-${index}`, startTick: index * 8, durationTick: 24, kind: "CLIP" as const }));
const samples = Array.from({ length: 100_000 }, (_, index) => Math.sin(index / 10));

Deno.bench("AUDIO-230 workspace geometry and panel boundary", () => {
  const result = createAudio230Workspace(geometry.value, "TIMELINE");
  if (!result.ok) throw new Error(result.diagnostics[0]?.message);
});
Deno.bench("AUDIO-230 bounded timeline projection", () => {
  const result = projectAudio230Timeline(items, 0, 12_000, 900, 512);
  if (!result.ok || result.value.items.length > 512) throw new Error("timeline bound failed");
});
Deno.bench("AUDIO-230 bounded waveform projection", () => {
  const result = projectAudio230Waveform(samples, 512, 50_000);
  if (!result.ok || result.value.bins.length > 512) throw new Error("waveform bound failed");
});
