import {
  asAudioCommandId,
  asAudioMixerChannelId,
  asAudioProjectId,
  asAudioTrackId,
  createAudioJournal,
  createAudioProject,
  dispatchAudioCommand,
} from "../../src/audio/audio-200/index.ts";

const iterations = 1_000;
const created = await createAudioProject({ projectId: asAudioProjectId("benchmark-project"), name: "AUDIO-200 benchmark", createdAt: "2026-08-13T00:00:00.000Z" });
if (!created.ok) throw new Error(JSON.stringify(created.diagnostics));
const started = performance.now();
let journal = await createAudioJournal(created.value);
if (!journal.ok) throw new Error(JSON.stringify(journal.diagnostics));
for (let index = 0; index < iterations; index += 1) {
  const track = { trackId: asAudioTrackId(`track-${index}`), kind: "AUDIO" as const, name: `Track ${index}`, clipIds: [], noteIds: [], automationIds: [], effectIds: [], mixerChannelId: asAudioMixerChannelId(`channel-${index}`), muted: false, solo: false };
  const result = await dispatchAudioCommand(journal.value, { commandId: asAudioCommandId(`benchmark-command-${index}`), idempotencyKey: `benchmark-key-${index}`, projectId: journal.value.project.projectId, baseProjectRevision: journal.value.project.projectRevision, type: "TRACK_ADD", payload: { track }, issuedAt: "2026-08-13T00:00:00.000Z" });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  journal = result;
}
const elapsedMs = Number((performance.now() - started).toFixed(3));
console.log(JSON.stringify({
  schemaVersion: "AUDIO-200_BENCHMARK_V1",
  benchmarkId: "AUDIO200_CANONICAL_TRACK_JOURNAL_SYNTHETIC",
  status: "MEASURED_LOCAL_SYNTHETIC",
  iterations,
  elapsedMs,
  operationsPerSecond: Number((iterations / Math.max(elapsedMs / 1_000, Number.EPSILON)).toFixed(2)),
  finalProjectRevision: journal.value.project.projectRevision,
  journalEntries: journal.value.entries.length,
  notes: ["Pure in-memory canonical metadata and SHA-256 state/journal hashing.", "No AudioContext, device, Storage, network, production data, or raw audio decode was measured."],
}, null, 2));
