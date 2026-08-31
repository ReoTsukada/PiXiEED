import { evaluateAudio240Gate } from "../../src/audio/audio-240/gate.ts";
import type { Audio240EvidenceInput } from "../../src/audio/audio-240/contracts.ts";

// The benchmark intentionally measures the pure gate only. Evidence is a sanitized fixture;
// browser, device, native audio, and production performance remain UNTESTED.
const H = "a".repeat(64) as never;
const emptyProject = { schemaVersion: "AUDIO-200_V1", projectId: "bench-project", name: "bench", createdAt: "2026-08-12T00:00:00.000Z", projectRevision: 0, stateHash: H, tempo: { milliBpm: 120000 }, timebase: { kind: "PPQ", ticksPerQuarter: 480 }, revisions: [], tracks: [], clips: [], notes: [], automations: [], mixer: { mixerId: "mixer", channels: [], masterGainMilliDb: 0 }, effects: [], markers: [] } as never;
const geometry = { mode: "DESKTOP", viewport: { width: 1440, height: 900, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, textScale: 1, keyboardInset: 0 }, content: { x: 0, y: 0, width: 1440, height: 900 }, regions: { CANVAS: { x: 300, y: 0, width: 824, height: 756 }, PROJECT_TRACKS: { x: 0, y: 0, width: 300, height: 756 }, INSPECTOR_MIXER: { x: 1124, y: 0, width: 316, height: 756 }, TIMELINE: { x: 300, y: 756, width: 824, height: 144 }, OUTPUT_DIAGNOSTIC: { x: 0, y: 756, width: 300, height: 144 } }, pageScroll: { horizontal: false, vertical: false }, internalScrollOwners: ["PROJECT_TRACKS", "TIMELINE", "INSPECTOR_MIXER", "OUTPUT_DIAGNOSTIC"] } as never;
const evidence: Audio240EvidenceInput = { schemaVersion: "AUDIO-240_V1", stamp: { capturedAt: "2026-08-13T00:00:00.000Z", validUntil: "2026-08-14T00:00:00.000Z", sourceId: "benchmark", sourceHash: H }, project: emptyProject, graph: { schemaVersion: "AUDIO-210_V1", projectId: "bench-project" as never, projectRevision: 0, graphRevision: 1, stateHash: H, bindings: [] }, package: null, workspace: { schemaVersion: "AUDIO-230_V1", mode: "DESKTOP", geometry, panels: [], a11y: {} as never, counters: { projectionCalls: 0, projectedItems: 0, waveformBinsRead: 0, waveformBinsProjected: 0, panelsMounted: 0, hiddenHeavyWork: 0, longTaskMs: 0 } }, crossTool: { drawLiveAccepted: true, drawPinnedAccepted: true, gameLiveAccepted: true, gamePinnedAccepted: true, safeRollbackVerified: true }, environment: { browser: "UNTESTED", device: "UNTESTED", production: "UNTESTED" } };

Deno.bench("AUDIO-240 gate evaluation / sanitized empty project", async () => {
  await evaluateAudio240Gate(evidence, { nowMs: Date.parse("2026-08-13T00:00:00.000Z"), maxAgeMs: 86_400_000 });
});
