import {
  createAudioAssetizationInput,
  type AudioAssetPackageSelectionInput,
} from "../../src/game/game-350/audio-asset-package.ts";
import { detectAudioAssetization } from "../../src/game/game-350/assetization.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function selection(overrides: Partial<AudioAssetPackageSelectionInput> = {}): AudioAssetPackageSelectionInput {
  return {
    projectId: "audio-project",
    projectRevision: "revision:7",
    projectStateHash: "sha256:state",
    label: "Selection",
    kind: "SE",
    trackIds: ["track:mixed"],
    startTick: 0,
    durationTick: 240,
    ...overrides,
  };
}

Deno.test("audio asset package preserves BGM and SE ranges on one Track", () => {
  const bgm = createAudioAssetizationInput(selection({ kind: "BGM", label: "Theme", durationTick: 1920 }));
  const se = createAudioAssetizationInput(selection({ kind: "SE", label: "Jump", startTick: 2400 }));
  assert(bgm.ok && se.ok, "valid selections should create inputs");
  const result = detectAudioAssetization({
    ...bgm.value,
    ranges: [...bgm.value.ranges, ...se.value.ranges],
  });
  assert(result.status === "DETERMINISTIC", "mixed explicit roles should be deterministic");
  assert(result.proposals.length === 2, "same Track ranges must stay independent");
  assert(result.proposals[0]?.role === "BGM" && result.proposals[0]?.loop, "BGM must loop");
  assert(result.proposals[1]?.role === "SE" && !result.proposals[1]?.loop, "SE must not loop");
  assert(result.proposals[0]?.trackIds[0] === result.proposals[1]?.trackIds[0], "Track identity must be preserved");
  assert(result.proposals[0]?.rangeId !== result.proposals[1]?.rangeId, "ranges need independent IDs");
});

Deno.test("audio asset package maps VOICE explicitly", () => {
  const generated = createAudioAssetizationInput(selection({ kind: "VOICE", label: "Narration" }));
  assert(generated.ok, "VOICE selection should be accepted");
  const result = detectAudioAssetization(generated.value);
  assert(result.status === "DETERMINISTIC", "VOICE role should be explicit and deterministic");
  assert(result.proposals[0]?.role === "VOICE", "VOICE must map to VOICE role");
  assert(result.proposals[0]?.loop === false, "VOICE must not loop");
});

Deno.test("audio asset package rejects empty IDs, empty tracks, negative ticks, and zero duration", () => {
  const result = createAudioAssetizationInput(selection({
    projectId: " ",
    projectRevision: " ",
    projectStateHash: " ",
    label: " ",
    trackIds: ["track:ok", " "],
    startTick: -1,
    durationTick: 0,
  }));
  assert(!result.ok, "invalid selection must return a failed Result");
  assert(result.errors.length >= 7, "all invalid fields should be reported");
});

Deno.test("audio asset package generates a stable rangeId", () => {
  const first = createAudioAssetizationInput(selection());
  const second = createAudioAssetizationInput(selection({ label: "Renamed selection" }));
  assert(first.ok && second.ok, "same valid selection should be accepted");
  assert(first.value.ranges[0]?.rangeId === second.value.ranges[0]?.rangeId, "rangeId must not change when only the display name changes");
  assert(first.value.ranges[0]?.rangeId.startsWith("audio-range:"), "generated rangeId must be namespaced");
});
