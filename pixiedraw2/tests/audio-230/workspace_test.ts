import { createAudio230Geometry } from "../../src/audio/audio-230/geometry.ts";
import { validateAudio230DeviceClaim } from "../../src/audio/audio-230/device.ts";
import { projectAudio230Canvas, projectAudio230Timeline, projectAudio230Waveform } from "../../src/audio/audio-230/projection.ts";
import { createAudio230Workspace, restoreAudio230Focus } from "../../src/audio/audio-230/workspace.ts";

const assert: (value: unknown, message?: string) => asserts value = (value, message = "assertion failed"): asserts value => { if (!value) throw new Error(message); };
const viewport = (width: number, height = 844) => ({ width, height, safeArea: { top: 24, right: 0, bottom: 20, left: 0 }, textScale: 1, keyboardInset: 0 });

Deno.test("AUDIO-230 creates bounded desktop/tablet/mobile geometry without page scroll", () => {
  for (const [width, mode] of [[1440, "DESKTOP"], [900, "TABLET"], [390, "MOBILE"]] as const) {
    const result = createAudio230Geometry(viewport(width));
    assert(result.ok);
    assert(result.value.mode === mode);
    assert(result.value.pageScroll.vertical === false && result.value.pageScroll.horizontal === false);
    assert(result.value.content.width > 0 && result.value.content.height > 0);
  }
});

Deno.test("AUDIO-230 fails closed for unsafe geometry and safe-area claims", () => {
  const invalid = createAudio230Geometry({ ...viewport(390), safeArea: { top: 999, right: 0, bottom: 0, left: 0 } });
  assert(!invalid.ok);
  const tooSmall = createAudio230Geometry({ ...viewport(390, 200), keyboardInset: 190 });
  assert(!tooSmall.ok);
});

Deno.test("AUDIO-230 uses lazy panels and keeps hidden heavy work disabled", () => {
  const geometry = createAudio230Geometry(viewport(390));
  assert(geometry.ok);
  const workspace = createAudio230Workspace(geometry.value, null);
  assert(workspace.ok);
  const hidden = workspace.value.panels.find((panel) => panel.panel === "PROJECT_TRACKS");
  assert(hidden?.visibility === "LAZY");
  assert(hidden.workAllowed === false && hidden.decodeAllowed === false && hidden.networkAllowed === false);
  assert(workspace.value.counters.hiddenHeavyWork === 0);
});

Deno.test("AUDIO-230 bounds timeline and waveform projections", () => {
  const timeline = projectAudio230Timeline(Array.from({ length: 700 }, (_, index) => ({ id: `clip-${index}`, startTick: index * 10, durationTick: 20, kind: "CLIP" as const })), 0, 5000, 1000, 512);
  assert(timeline.ok);
  assert(timeline.value.items.length <= 512 && timeline.value.truncated);
  const waveform = projectAudio230Waveform(Array.from({ length: 10_000 }, (_, index) => Math.sin(index)), 128, 1_000);
  assert(waveform.ok);
  assert(waveform.value.bins.length <= 128 && waveform.value.sourceBinsRead === 1_000 && waveform.value.truncated);
  const canvas = projectAudio230Canvas(0, 0, 900, 240, [{ id: "clip", startTick: 10, durationTick: 100, kind: "CLIP" }], [0, 0.5, -0.25], 0, 480);
  assert(canvas.ok && canvas.value.timeline.items.length === 1 && canvas.value.waveform.bins.length === 3);
  assert(!projectAudio230Canvas(0, 0, 0, 240, [], [], 0, 480).ok);
  assert(!projectAudio230Timeline([], 0, 0, 100).ok);
});

Deno.test("AUDIO-230 treats device values as opaque claims and rejects unsafe claims", () => {
  const safe = validateAudio230DeviceClaim({ kind: "OUTPUT", id: "headphones-1", label: "Headphones", state: "AVAILABLE", channels: 2, sampleRateHz: 48_000 });
  assert(safe.ok && safe.value.trust === "CLAIM_ONLY");
  assert(!validateAudio230DeviceClaim({ kind: "OUTPUT", id: "\nunsafe", state: "AVAILABLE" }).ok);
  assert(!validateAudio230DeviceClaim({ kind: "OUTPUT", id: "speaker", state: "AVAILABLE", sampleRateHz: 1 }).ok);
});

Deno.test("AUDIO-230 focus restoration is explicit and fail-closed", () => {
  const restored = restoreAudio230Focus("timeline", ["canvas", "timeline"]);
  assert(restored.ok && restored.value === "timeline");
  assert(!restoreAudio230Focus("inspector", ["canvas", "timeline"]).ok);
});
