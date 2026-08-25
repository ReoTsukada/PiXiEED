import {
  asAudioAssetId,
  asAudioEventId,
  asAudioLicenseSnapshotId,
  asAudioPackageId,
  asAudioProjectId,
  asAudioRevisionId,
  asAudioTrackId,
  bindAudioEvent,
  cancelAudioOperation,
  canUseAudioFeature,
  createAudioOperation,
  createAudioProject,
  createAudioRevision,
  DEFAULT_WP190_FEATURE_FLAGS,
  planAudioExport,
  planAudioPreview,
  validateAudioMetadata,
  validateAudioPackageCompatibility,
  type AudioLicenseSnapshot,
  type AudioProject,
  type AudioRevision,
} from "../src/wp190-audio-core.ts";
import { asSha256 } from "../src/wp160-contracts.ts";

const hashA = asSha256("a".repeat(64));
const hashB = asSha256("b".repeat(64));
const assetId = asAudioAssetId("audio-asset-bgm");
const revisionId = asAudioRevisionId("audio-revision-1");
const projectId = asAudioProjectId("audio-project-fixture");
const trackId = asAudioTrackId("track-bgm");
const eventId = asAudioEventId("event-scene-start");

function revision(overrides: Partial<AudioRevision> = {}): AudioRevision {
  const result = createAudioRevision({
    assetId,
    revisionId,
    revisionNumber: 1,
    kind: "SONG",
    format: "WAV",
    mimeType: "audio/wav",
    durationMs: 12_000,
    sampleRateHz: 44_100,
    channels: 2,
    byteLength: 44_100,
    contentHash: hashA,
    storage: { placement: "OPFS", path: "audio/audio-asset-bgm/revision-1.wav", contentHash: hashA, byteLength: 44_100 },
    createdAt: "2026-08-09T00:00:00.000Z",
    ...overrides,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}

function project(source: AudioRevision): AudioProject {
  const result = createAudioProject({
    projectId,
    name: "WP-190 Fixture Song",
    tempoBpm: 120,
    timeSignature: [4, 4],
    tracks: [{ trackId, kind: "BGM", name: "Main Theme", revisionId: source.revisionId, gainDb: -3, muted: false, loop: true }],
    createdAt: "2026-08-09T00:00:00.000Z",
  }, [source]);
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.value;
}

function license(source: AudioRevision, allowedUses: readonly ("PREVIEW" | "EXPORT" | "RUNTIME" | "MARKET_PREPARATION")[] = ["PREVIEW", "EXPORT"]): AudioLicenseSnapshot {
  return { snapshotId: asAudioLicenseSnapshotId("license-audio-1"), assetId: source.assetId, revisionId: source.revisionId, licenseKind: "OWNER", allowedUses, sourceHash: source.contentHash };
}

Deno.test("WP-190 creates immutable Audio Revision and Project mapping without bytes", () => {
  const source = revision();
  const current = project(source);
  if (current.schemaVersion !== 1 || current.revisionIds[0] !== revisionId || current.tracks[0]?.kind !== "BGM") throw new Error("Audio Project mapping is not canonical.");
  if (source.verified !== true || source.storage.placement !== "OPFS") throw new Error("Audio Revision verification boundary is missing.");
});

Deno.test("WP-190 rejects unsupported format, raw payload, and unsafe locator", () => {
  const unsupported = createAudioRevision({ ...revision(), format: "AAC", mimeType: "audio/aac" });
  if (unsupported.ok || !unsupported.diagnostics.some((item) => item.code === "AUDIO_FORMAT_UNSUPPORTED")) throw new Error("Unsupported Audio format was accepted.");
  const raw = validateAudioMetadata({ title: "bad", samples: [0, 1, 2] });
  if (raw.ok || raw.diagnostics[0]?.code !== "AUDIO_RAW_PAYLOAD_REJECTED") throw new Error("Raw Audio payload crossed the Core boundary.");
  const unsafe = createAudioRevision({ ...revision(), storage: { ...revision().storage, path: "../private.wav" } });
  if (unsafe.ok || !unsafe.diagnostics.some((item) => item.code === "AUDIO_STORAGE_INVALID")) throw new Error("Unsafe Audio locator was accepted.");
});

Deno.test("WP-190 binds BGM event and requires matching License for PINNED", () => {
  const source = revision();
  const current = project(source);
  const denied = bindAudioEvent(current, { eventId, trackId, revisionId, trigger: "SCENE_START", eventKey: "scene.start", mode: "PINNED", gainDb: 0 }, [source]);
  if (denied.ok || denied.diagnostics[0]?.code !== "AUDIO_LICENSE_MISSING") throw new Error("PINNED Audio binding accepted without License Snapshot.");
  const bound = bindAudioEvent(current, { eventId, trackId, revisionId, trigger: "SCENE_START", eventKey: "scene.start", mode: "PINNED", gainDb: 0, licenseSnapshotId: asAudioLicenseSnapshotId("license-audio-1") }, [source], [license(source)]);
  if (!bound.ok || bound.value.kind !== "BGM" || bound.value.projectId !== projectId) throw new Error("BGM event binding failed.");
});

Deno.test("WP-190 package compatibility distinguishes Preview LIVE and Export PINNED", () => {
  const source = revision();
  const current = project(source);
  const bound = bindAudioEvent(current, { eventId, trackId, revisionId, trigger: "SCENE_START", eventKey: "scene.start", mode: "PINNED", gainDb: 0, licenseSnapshotId: asAudioLicenseSnapshotId("license-audio-1") }, [source], [license(source)]);
  if (!bound.ok) throw new Error("Fixture binding failed.");
  const livePreview = validateAudioPackageCompatibility({ packageId: asAudioPackageId("package-preview"), packageVersion: "1.0.0", use: "PREVIEW", dependencies: [{ assetId, revisionId, contentHash: hashA, byteLength: 44_100, required: true, mode: "LIVE", license: license(source) }], revisions: [source], bindings: [bound.value] });
  if (!livePreview.ok || !livePreview.value.compatible) throw new Error("LIVE Preview package should be compatible.");
  const liveExport = validateAudioPackageCompatibility({ packageId: asAudioPackageId("package-export"), packageVersion: "1.0.0", use: "EXPORT", dependencies: [{ assetId, revisionId, contentHash: hashA, byteLength: 44_100, required: true, mode: "LIVE", license: license(source) }], revisions: [source], bindings: [bound.value] });
  if (!liveExport.ok || liveExport.value.compatible || !liveExport.value.diagnostics.some((item) => item.code === "AUDIO_DEPENDENCY_NOT_PINNED")) throw new Error("Export accepted LIVE Audio dependency.");
  const pinnedExport = validateAudioPackageCompatibility({ packageId: asAudioPackageId("package-export"), packageVersion: "1.0.0", use: "EXPORT", dependencies: [{ assetId, revisionId, contentHash: hashA, byteLength: 44_100, required: true, mode: "PINNED", license: license(source) }], revisions: [source], bindings: [bound.value] });
  if (!pinnedExport.ok || !pinnedExport.value.compatible) throw new Error("PINNED Export package should be compatible.");
});

Deno.test("WP-190 Preview/Export are flag-gated and use safe boundaries", () => {
  const source = revision();
  const current = project(source);
  const bound = bindAudioEvent(current, { eventId, trackId, revisionId, trigger: "SCENE_START", eventKey: "scene.start", mode: "LIVE", gainDb: 0 }, [source]);
  if (!bound.ok) throw new Error("Fixture binding failed.");
  const off = planAudioPreview(current, [bound.value], DEFAULT_WP190_FEATURE_FLAGS);
  if (off.ok || off.diagnostics[0]?.code !== "AUDIO_FEATURE_FLAG_OFF") throw new Error("Audio Preview default-off flag failed.");
  const flags = { ...DEFAULT_WP190_FEATURE_FLAGS, "audio-preview": true, "audio-export": true };
  const preview = planAudioPreview(current, [bound.value], flags);
  if (!preview.ok || preview.value.transportClass !== "LOCAL_ONLY" || preview.value.replaceAt !== "SAFE_PLAYHEAD_BOUNDARY") throw new Error("Audio Preview boundary failed.");
  const compatibility = validateAudioPackageCompatibility({ packageId: asAudioPackageId("package-export"), packageVersion: "1.0.0", use: "EXPORT", dependencies: [{ assetId, revisionId, contentHash: hashA, byteLength: 44_100, required: true, mode: "PINNED", license: license(source) }], revisions: [source], bindings: [bound.value] });
  if (!compatibility.ok || !compatibility.value.compatible) throw new Error("Export compatibility fixture failed.");
  const exportPlan = planAudioExport(current, compatibility.value, "OGG", flags);
  if (!exportPlan.ok || exportPlan.value.transportClass !== "ASYNC_ON_DEMAND" || exportPlan.value.requiresPinnedDependencies !== true) throw new Error("Audio Export boundary failed.");
  if (canUseAudioFeature({ "audio-preview": true }, "audio-preview", true)) throw new Error("Audio kill switch did not win.");
});

Deno.test("WP-190 operations are deterministic, idempotency-keyed, and cancellable", () => {
  const input = { idempotencyKey: "audio-op-1", type: "revision.created" as const, revisionId, transportClass: "PLATFORM_EVENT" as const, referencePayload: { assetId, contentHash: hashA, byteLength: 44_100 } };
  const first = createAudioOperation(input);
  const second = createAudioOperation(input);
  if (!first.ok || !second.ok || first.value.operationId !== second.value.operationId) throw new Error("Audio operation identity is not deterministic.");
  const cancelled = cancelAudioOperation(first.value.operationId);
  if (!cancelled.ok || !cancelled.value.cancelled) throw new Error("Audio cancellation boundary failed.");
});

Deno.test("WP-190 rejects duplicate Project track IDs and stale dependency hashes", () => {
  const source = revision();
  const duplicate = createAudioProject({ projectId, name: "Duplicate", tempoBpm: 120, timeSignature: [4, 4], tracks: [{ trackId, kind: "BGM", name: "A", revisionId, gainDb: 0, muted: false, loop: true }, { trackId, kind: "SFX", name: "B", revisionId, gainDb: 0, muted: false, loop: false }], createdAt: "2026-08-09T00:00:00.000Z" }, [source]);
  if (duplicate.ok || !duplicate.diagnostics.some((item) => item.code === "AUDIO_DUPLICATE_ID")) throw new Error("Duplicate Audio track ID was accepted.");
  const stale = validateAudioPackageCompatibility({ packageId: asAudioPackageId("package-stale"), packageVersion: "1.0.0", use: "PREVIEW", dependencies: [{ assetId, revisionId, contentHash: hashB, byteLength: 44_100, required: true, mode: "LIVE", license: license(source) }], revisions: [source], bindings: [] });
  if (!stale.ok || stale.value.compatible || !stale.value.diagnostics.some((item) => item.code === "AUDIO_DEPENDENCY_HASH_MISMATCH")) throw new Error("Stale Audio dependency hash was accepted.");
});
