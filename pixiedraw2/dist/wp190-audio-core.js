// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var SHA256 = /^[a-f0-9]{64}$/;
function asSha256(value, label = "Hash") {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}
var DEFAULT_WP160_FEATURE_FLAGS = Object.freeze({
  "game-core-read": false,
  "game-core-write": false,
  "runtime-preview": false,
  "runtime-execution": false,
  "game-build": false,
  "game-build-cache": false,
  "game-publish": false
});

// src/wp190-audio-core.ts
var WP190_SCHEMA_VERSION = 1;
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var RAW_AUDIO_KEYS = /* @__PURE__ */ new Set([
  "bytes",
  "data",
  "base64",
  "arrayBuffer",
  "pcm",
  "samples",
  "blob"
]);
function brandedId(value, label) {
  if (!SAFE_ID.test(value.trim())) throw new Error(`${label} must be a stable non-empty identifier.`);
  return value;
}
function asAudioProjectId(value) {
  return brandedId(value, "AudioProjectId");
}
function asAudioAssetId(value) {
  return brandedId(value, "AudioAssetId");
}
function asAudioRevisionId(value) {
  return brandedId(value, "AudioRevisionId");
}
function asAudioTrackId(value) {
  return brandedId(value, "AudioTrackId");
}
function asAudioEventId(value) {
  return brandedId(value, "AudioEventId");
}
function asAudioOperationId(value) {
  return brandedId(value, "AudioOperationId");
}
function asAudioLicenseSnapshotId(value) {
  return brandedId(value, "AudioLicenseSnapshotId");
}
function asAudioPackageId(value) {
  return brandedId(value, "AudioPackageId");
}
var SUPPORTED_SOURCE_FORMATS = [
  "WAV",
  "OGG",
  "MP3",
  "FLAC",
  "MIDI"
];
var SUPPORTED_EXPORT_FORMATS = [
  "WAV",
  "OGG"
];
function ok(value) {
  return {
    ok: true,
    value
  };
}
function fail(code, message, path, recoverable = false) {
  return {
    ok: false,
    diagnostics: [
      {
        code,
        severity: "ERROR",
        message,
        ...path === void 0 ? {} : {
          path
        },
        recoverable
      }
    ]
  };
}
function diagnostic(code, message, path, recoverable = false) {
  return {
    code,
    severity: "ERROR",
    message,
    ...path === void 0 ? {} : {
      path
    },
    recoverable
  };
}
function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Audio canonical data requires finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  if (typeof value === "object") {
    const record = value;
    return `{${Object.keys(record).filter((key) => record[key] !== void 0).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  }
  throw new Error("Audio canonical data contains an unsupported value.");
}
function stableId(value) {
  let hash = 2166136261;
  const text = canonical(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wp190_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function hasRawAudioPayload(value) {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => hasRawAudioPayload(item));
  const record = value;
  return Object.entries(record).some(([key, item]) => RAW_AUDIO_KEYS.has(key) || hasRawAudioPayload(item));
}
var DEFAULT_WP190_FEATURE_FLAGS = Object.freeze({
  "audio-core-read": false,
  "audio-core-write": false,
  "audio-preview": false,
  "audio-export": false,
  "audio-sync": false,
  "audio-publish": false
});
function canUseAudioFeature(flags, feature, killSwitch = false) {
  return killSwitch !== true && flags[feature] === true;
}
function sourceFormatValid(revision) {
  const errors = [];
  if (!SUPPORTED_SOURCE_FORMATS.includes(revision.format)) errors.push(diagnostic("AUDIO_FORMAT_UNSUPPORTED", `Audio format ${revision.format} is not supported.`, "format"));
  if (!Number.isSafeInteger(revision.byteLength) || revision.byteLength < 1) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio byteLength must be a positive safe integer.", "byteLength"));
  if (!Number.isFinite(revision.durationMs) || revision.durationMs <= 0) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio durationMs must be positive.", "durationMs"));
  if (!Number.isSafeInteger(revision.sampleRateHz) || revision.sampleRateHz < 8e3 || revision.sampleRateHz > 384e3) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio sampleRateHz is outside the supported safe range.", "sampleRateHz"));
  if (revision.channels !== 1 && revision.channels !== 2) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio channels must be mono or stereo.", "channels"));
  if (!/^[a-z]+\/[a-z0-9.+-]+$/i.test(revision.mimeType)) errors.push(diagnostic("AUDIO_REVISION_INVALID", "Audio MIME type is invalid.", "mimeType"));
  if (!/^[a-f0-9]{64}$/.test(revision.contentHash)) errors.push(diagnostic("AUDIO_HASH_INVALID", "Audio contentHash must be a lowercase SHA-256 hash.", "contentHash"));
  if (revision.storage.contentHash !== revision.contentHash || revision.storage.byteLength !== revision.byteLength) errors.push(diagnostic("AUDIO_STORAGE_INVALID", "Storage locator must repeat the verified content hash and byte length.", "storage"));
  if (!revision.storage.path || revision.storage.path.includes("..") || revision.storage.path.startsWith("/")) errors.push(diagnostic("AUDIO_STORAGE_INVALID", "Audio storage path must be a bounded relative locator.", "storage.path"));
  if (revision.format === "WAV" && revision.mimeType !== "audio/wav") errors.push(diagnostic("AUDIO_MIME_MISMATCH", "WAV revision requires audio/wav MIME type.", "mimeType"));
  if (revision.format === "OGG" && revision.mimeType !== "audio/ogg") errors.push(diagnostic("AUDIO_MIME_MISMATCH", "OGG revision requires audio/ogg MIME type.", "mimeType"));
  return errors;
}
function createAudioRevision(input) {
  if (hasRawAudioPayload(input)) return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Audio Core accepts metadata and locators, not raw Audio bytes.");
  const errors = sourceFormatValid(input);
  if (errors.length > 0) return {
    ok: false,
    diagnostics: errors
  };
  try {
    asSha256(input.contentHash, "Audio contentHash");
  } catch (cause) {
    return fail("AUDIO_HASH_INVALID", cause instanceof Error ? cause.message : "Audio hash is invalid.", "contentHash");
  }
  return ok({
    ...input,
    schemaVersion: WP190_SCHEMA_VERSION,
    verified: true
  });
}
function createAudioProject(input, revisions) {
  if (hasRawAudioPayload(input)) return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Audio Project cannot contain raw Audio bytes.");
  if (!input.name.trim() || !Number.isFinite(input.tempoBpm) || input.tempoBpm <= 0 || input.tempoBpm > 999) return fail("AUDIO_PROJECT_INVALID", "Audio Project requires a valid name and tempo.");
  const revisionMap = new Map(revisions.map((revision) => [
    revision.revisionId,
    revision
  ]));
  const trackIds = /* @__PURE__ */ new Set();
  const errors = [];
  for (const track of input.tracks) {
    if (trackIds.has(track.trackId)) errors.push(diagnostic("AUDIO_DUPLICATE_ID", "Audio track IDs must be unique.", "tracks"));
    trackIds.add(track.trackId);
    if (!track.name.trim() || !revisionMap.has(track.revisionId) || !Number.isFinite(track.gainDb)) errors.push(diagnostic("AUDIO_TRACK_INVALID", "Audio track name, revision, and gain are required.", "tracks"));
  }
  if (errors.length > 0) return {
    ok: false,
    diagnostics: errors
  };
  return ok({
    ...input,
    schemaVersion: WP190_SCHEMA_VERSION,
    revisionIds: [
      ...new Set(input.tracks.map((track) => track.revisionId))
    ]
  });
}
function bindAudioEvent(project, input, revisions, licenses = []) {
  if (hasRawAudioPayload(input)) return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Audio event bindings cannot contain raw samples.");
  const track = project.tracks.find((candidate) => candidate.trackId === input.trackId);
  const revision = revisions.find((candidate) => candidate.revisionId === input.revisionId);
  if (track === void 0 || revision === void 0 || !project.revisionIds.includes(input.revisionId) || !input.eventKey.trim() || !Number.isFinite(input.gainDb)) return fail("AUDIO_BINDING_INVALID", "Binding must reference a Project track and verified Audio Revision.", "binding");
  if (input.mode === "PINNED" && !licenses.some((license) => license.revisionId === revision.revisionId && license.sourceHash === revision.contentHash)) return fail("AUDIO_LICENSE_MISSING", "PINNED Audio binding requires a matching License Snapshot.", "licenseSnapshotId");
  if (input.licenseSnapshotId !== void 0 && !licenses.some((license) => license.snapshotId === input.licenseSnapshotId && license.revisionId === revision.revisionId)) return fail("AUDIO_LICENSE_MISSING", "Audio License Snapshot does not match the bound revision.", "licenseSnapshotId");
  return ok({
    ...input,
    projectId: project.projectId,
    kind: track.kind
  });
}
function useRequiresPinned(use) {
  return use === "EXPORT" || use === "RUNTIME" || use === "MARKET_PREPARATION";
}
function validateAudioPackageCompatibility(request) {
  if (hasRawAudioPayload(request)) return fail("AUDIO_RAW_PAYLOAD_REJECTED", "Package compatibility accepts references, not raw Audio bytes.");
  const diagnostics = [];
  const revisions = new Map(request.revisions.map((revision) => [
    revision.revisionId,
    revision
  ]));
  const resolved = [];
  for (const dependency of request.dependencies) {
    const revision = revisions.get(dependency.revisionId);
    if (revision === void 0) {
      if (dependency.required) diagnostics.push(diagnostic("AUDIO_DEPENDENCY_MISSING", "Required Audio Revision is missing from the compatibility input.", "dependencies"));
      continue;
    }
    if (revision.assetId !== dependency.assetId || revision.contentHash !== dependency.contentHash || revision.byteLength !== dependency.byteLength) diagnostics.push(diagnostic("AUDIO_DEPENDENCY_HASH_MISMATCH", "Audio dependency metadata does not match the verified Revision.", "dependencies"));
    if (useRequiresPinned(request.use) && dependency.mode !== "PINNED") diagnostics.push(diagnostic("AUDIO_DEPENDENCY_NOT_PINNED", `${request.use} requires PINNED Audio dependencies.`, "dependencies"));
    if (dependency.license === void 0) diagnostics.push(diagnostic("AUDIO_LICENSE_MISSING", "Audio dependency requires a License Snapshot.", "dependencies", true));
    else if (!dependency.license.allowedUses.includes(request.use) || dependency.license.sourceHash !== revision.contentHash) diagnostics.push(diagnostic("AUDIO_LICENSE_USE_DENIED", "Audio License Snapshot does not authorize this use or hash.", "dependencies.license"));
    if (!SUPPORTED_SOURCE_FORMATS.includes(revision.format)) diagnostics.push(diagnostic("AUDIO_FORMAT_UNSUPPORTED", "Package references an unsupported Audio source format.", "dependencies"));
    resolved.push(revision.revisionId);
  }
  for (const binding of request.bindings) if (!resolved.includes(binding.revisionId)) diagnostics.push(diagnostic("AUDIO_BINDING_INVALID", "Package binding references an unlocked Audio Revision.", "bindings"));
  const dependencyLockHash = stableId({
    packageId: request.packageId,
    packageVersion: request.packageVersion,
    use: request.use,
    dependencies: request.dependencies.map((dependency) => ({
      assetId: dependency.assetId,
      revisionId: dependency.revisionId,
      contentHash: dependency.contentHash,
      mode: dependency.mode
    }))
  });
  return ok({
    packageId: request.packageId,
    packageVersion: request.packageVersion,
    use: request.use,
    compatible: diagnostics.length === 0,
    resolvedRevisionIds: [
      ...new Set(resolved)
    ],
    dependencyLockHash,
    diagnostics
  });
}
function planAudioPreview(project, bindings, flags, killSwitch = false) {
  if (!canUseAudioFeature(flags, "audio-preview", killSwitch)) return fail("AUDIO_FEATURE_FLAG_OFF", "Audio preview is unavailable while the feature flag is OFF.", "audio-preview", true);
  const projectBindings = bindings.filter((binding) => binding.projectId === project.projectId);
  if (projectBindings.length === 0) return fail("AUDIO_EVENT_INVALID", "Audio preview requires at least one Project event binding.", "bindings");
  const planId = asAudioOperationId(stableId({
    type: "preview",
    projectId: project.projectId,
    events: projectBindings.map((binding) => binding.eventId).sort()
  }));
  return ok({
    planId,
    projectId: project.projectId,
    revisionIds: [
      ...new Set(projectBindings.map((binding) => binding.revisionId))
    ],
    transportClass: "LOCAL_ONLY",
    replaceAt: "SAFE_PLAYHEAD_BOUNDARY",
    audioEventIds: projectBindings.map((binding) => binding.eventId)
  });
}
function planAudioExport(project, compatibility, format, flags, killSwitch = false) {
  if (!canUseAudioFeature(flags, "audio-export", killSwitch)) return fail("AUDIO_FEATURE_FLAG_OFF", "Audio export is unavailable while the feature flag is OFF.", "audio-export", true);
  if (!SUPPORTED_EXPORT_FORMATS.includes(format)) return fail("AUDIO_EXPORT_UNSUPPORTED", `Audio export format ${format} is unsupported.`, "format");
  if (!compatibility.compatible || compatibility.use !== "EXPORT") return fail("AUDIO_PACKAGE_INVALID", "Audio export requires a compatible EXPORT package result.", "compatibility");
  return ok({
    planId: asAudioOperationId(stableId({
      type: "export",
      projectId: project.projectId,
      format,
      revisions: compatibility.resolvedRevisionIds
    })),
    projectId: project.projectId,
    format,
    revisionIds: compatibility.resolvedRevisionIds,
    transportClass: "ASYNC_ON_DEMAND",
    requiresPinnedDependencies: true
  });
}
function createAudioOperation(input) {
  if (hasRawAudioPayload(input) || !input.idempotencyKey.trim() || Object.keys(input.referencePayload).length === 0) return fail("AUDIO_OPERATION_PAYLOAD_INVALID", "Audio operations require an idempotency key and bounded reference payload.");
  const operationId = asAudioOperationId(stableId({
    ...input,
    referencePayload: Object.fromEntries(Object.entries(input.referencePayload).sort(([left], [right]) => left.localeCompare(right)))
  }));
  return ok({
    ...input,
    operationId,
    schemaVersion: WP190_SCHEMA_VERSION
  });
}
function cancelAudioOperation(operationId) {
  return operationId.trim().length > 0 ? ok({
    operationId,
    cancelled: true
  }) : fail("AUDIO_CANCELLED", "Audio operation ID is required to cancel an operation.");
}
function validateAudioMetadata(value) {
  return hasRawAudioPayload(value) ? fail("AUDIO_RAW_PAYLOAD_REJECTED", "Audio metadata cannot contain bytes, samples, blobs, or base64 payloads.") : ok(true);
}

// src/wp190-audio-adapter.ts
var WP190_ADAPTER_BOUNDARY = Object.freeze({
  preview: "INJECTED_LOCAL_PREVIEW",
  export: "INJECTED_ASYNC_EXPORT",
  storage: "HASH_AND_LOCATOR_ONLY",
  transport: "REVISION_REFERENCE_ONLY"
});
export {
  DEFAULT_WP190_FEATURE_FLAGS,
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_SOURCE_FORMATS,
  WP190_ADAPTER_BOUNDARY,
  WP190_SCHEMA_VERSION,
  asAudioAssetId,
  asAudioEventId,
  asAudioLicenseSnapshotId,
  asAudioOperationId,
  asAudioPackageId,
  asAudioProjectId,
  asAudioRevisionId,
  asAudioTrackId,
  bindAudioEvent,
  canUseAudioFeature,
  cancelAudioOperation,
  createAudioOperation,
  createAudioProject,
  createAudioRevision,
  planAudioExport,
  planAudioPreview,
  validateAudioMetadata,
  validateAudioPackageCompatibility
};
