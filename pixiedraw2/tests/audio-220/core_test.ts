import { asAudioAssetId, asAudioContentHash, asAudioProjectId, asAudioRevisionId, type AudioProject } from "../../src/audio/audio-200/contracts.ts";
import { createEventGraph } from "../../src/audio/audio-210/core.ts";
import { asAudio220PackageId, type Audio220Authority, type Audio220PackageEnvelope } from "../../src/audio/audio-220/contracts.ts";
import { createAudioPackage, exportAudioPackage, importAudioPackage, validateAudioPackage } from "../../src/audio/audio-220/core.ts";

function assert(value: unknown, message = "assertion failed"): asserts value { if (!value) throw new Error(message); }
function assertEquals<T>(actual: T, expected: T): void { if (actual !== expected) throw new Error(`expected ${String(expected)}, got ${String(actual)}`); }
const H1 = asAudioContentHash("1".repeat(64));
const H2 = asAudioContentHash("2".repeat(64));
const projectId = asAudioProjectId("audio-package-project");
const assetId = asAudioAssetId("asset-1");
const revisionId = asAudioRevisionId("revision-1");
const revision = {
  schemaVersion: "AUDIO-200_V1" as const, assetId, revisionId, revisionNumber: 1, kind: "CLIP" as const, referenceMode: "PINNED" as const,
  source: { blobId: "blob-1" as never, locator: { placement: "OPFS" as const, namespace: "audio" as const, relativePath: "audio/revision-1.wav", contentHash: H1, byteLength: 128 }, metadata: { codec: "WAV_PCM" as const, mimeType: "audio/wav" as const, sampleRateHz: 48_000, channels: 1 as const, bitDepth: 16 as const, sampleFrames: 48_000, durationUs: 1_000_000, byteLength: 128, contentHash: H1 } },
  metadataAuthority: "AUDIO-200_CANONICAL_METADATA_V1" as const, createdAt: "2026-01-01T00:00:00Z", verified: true as const,
};
const project = { schemaVersion: "AUDIO-200_V1" as const, projectId, name: "fixture", createdAt: "2026-01-01T00:00:00Z", projectRevision: 1, stateHash: H2, tempo: { milliBpm: 120000 }, timebase: { kind: "PPQ" as const, ticksPerQuarter: 480 }, revisions: [revision], tracks: [], clips: [], notes: [], automations: [], mixer: { mixerId: "mixer" as never, channels: [], masterGainMilliDb: 0 }, effects: [], markers: [] } as unknown as AudioProject;
const license = { snapshotId: "license-snapshot-1", licenseId: "CC0-1.0", kind: "CC0" as const, version: "1.0", subjectId: "asset-1", holderId: "creator-1", attributionRequired: false, derivativeAllowed: true, commercialUseAllowed: true, sourceUri: "https://example.test/licenses/cc0", snapshotHash: H2 };
const provenance = { origin: "CREATED" as const, creatorId: "creator-1", sourceRevisionId: revisionId, sourceHash: H1, snapshotHash: H2 };
const authority: Audio220Authority = { resolveLicense: () => license, resolveProvenance: () => provenance };

async function fixture(): Promise<Audio220PackageEnvelope> {
  const graph = await createEventGraph(project, [{ eventKey: "cue", assetId, revisionId, eventKind: "SFX", trigger: "CUSTOM", referenceMode: "PINNED" }]);
  assert(graph.ok);
  const result = await createAudioPackage(project, graph.value, "PORTABLE", "audio-package-1", authority);
  assert(result.ok);
  return result.value;
}

Deno.test("AUDIO-220 creates deterministic locked package and round-trips without raw bytes", async () => {
  const first = await fixture();
  const second = await fixture();
  assertEquals(first.packageHash, second.packageHash);
  const exported = await exportAudioPackage(first);
  assert(exported.ok);
  const imported = await importAudioPackage(exported.value);
  assert(imported.ok);
  assertEquals(imported.value.manifest.dependencies[0]!.mode, "PINNED");
  assertEquals(imported.value.manifest.materialization, "PORTABLE");
});

Deno.test("AUDIO-220 fails closed for tamper, path traversal, duplicate, and cycle", async () => {
  const base = await fixture();
  const tampered = { ...base, manifest: { ...base.manifest, graphHash: H1 } };
  const tamperResult = await validateAudioPackage(tampered);
  assertEquals(tamperResult.ok, false);
  if (!tamperResult.ok) assertEquals(tamperResult.diagnostics[0]!.code, "AUDIO220_MANIFEST_TAMPERED");
  const unsafe = { ...base, manifest: { ...base.manifest, dependencies: [{ ...base.manifest.dependencies[0]!, locator: { ...base.manifest.dependencies[0]!.locator, relativePath: "../escape.wav" } }] } };
  const unsafeResult = await validateAudioPackage(unsafe);
  assertEquals(unsafeResult.ok, false);
  if (!unsafeResult.ok) assertEquals(unsafeResult.diagnostics[0]!.code, "AUDIO220_PATH_TRAVERSAL");
  const duplicate = { ...base, manifest: { ...base.manifest, dependencies: [base.manifest.dependencies[0]!, base.manifest.dependencies[0]!] } };
  const duplicateResult = await validateAudioPackage(duplicate);
  assertEquals(duplicateResult.ok, false);
  if (!duplicateResult.ok) assertEquals(duplicateResult.diagnostics[0]!.code, "AUDIO220_DUPLICATE_DEPENDENCY");
  const cycle = { ...base, manifest: { ...base.manifest, dependencies: [{ ...base.manifest.dependencies[0]!, dependsOn: [base.manifest.dependencies[0]!.dependencyId] }] } };
  const cycleResult = await validateAudioPackage(cycle);
  assertEquals(cycleResult.ok, false);
  if (!cycleResult.ok) assertEquals(cycleResult.diagnostics[0]!.code, "AUDIO220_DEPENDENCY_CYCLE");
});

Deno.test("AUDIO-220 rejects missing/ambiguous license, unlocked revision, and raw payload", async () => {
  const graph = await createEventGraph(project, [{ eventKey: "cue", assetId, revisionId, eventKind: "SFX", trigger: "CUSTOM", referenceMode: "LIVE" }]);
  assert(graph.ok);
  const unlocked = await createAudioPackage(project, graph.value, "THIN", asAudio220PackageId("audio-package-live"), authority);
  assertEquals(unlocked.ok, false);
  if (!unlocked.ok) assertEquals(unlocked.diagnostics[0]!.code, "AUDIO220_UNLOCKED_REVISION");
  const pinnedGraph = await createEventGraph(project, [{ eventKey: "cue", assetId, revisionId, eventKind: "SFX", trigger: "CUSTOM", referenceMode: "PINNED" }]);
  assert(pinnedGraph.ok);
  const missing = await createAudioPackage(project, pinnedGraph.value, "THIN", "audio-package-missing", { resolveLicense: () => null, resolveProvenance: () => provenance });
  assertEquals(missing.ok, false);
  if (!missing.ok) assertEquals(missing.diagnostics[0]!.code, "AUDIO220_MISSING_DEPENDENCY");
  const unsupported = await createAudioPackage(project, pinnedGraph.value, "THIN", "audio-package-unsupported", { resolveLicense: () => ({ ...license, kind: "UNKNOWN" as never }), resolveProvenance: () => provenance });
  assertEquals(unsupported.ok, false);
  if (!unsupported.ok) assertEquals(unsupported.diagnostics[0]!.code, "AUDIO220_UNSUPPORTED_LICENSE");
  const exported = await exportAudioPackage(await fixture());
  assert(exported.ok);
  const raw = await importAudioPackage(exported.value.replace("\"packageHash\"", "\"blob\":\"raw\",\"packageHash\""));
  assertEquals(raw.ok, false);
  if (!raw.ok) assertEquals(raw.diagnostics[0]!.code, "AUDIO220_RAW_PAYLOAD_REJECTED");
});
