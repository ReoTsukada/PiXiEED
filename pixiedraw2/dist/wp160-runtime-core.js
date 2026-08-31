// src/wp160-contracts.ts
var AUTHORIZATION_PROOF_ALLOWED_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var AUTHORIZATION_PROOF_MAX_LIFETIME_MS = 24 * 60 * 60 * 1e3;
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
var SHA256 = /^[a-f0-9]{64}$/;
function brandedId(value, label) {
  if (!SAFE_ID.test(value)) throw new Error(`${label} must be a non-empty stable identifier.`);
  return value;
}
function asGameProjectId(value) {
  return brandedId(value, "GameProjectId");
}
function asGamePreviewId(value) {
  return brandedId(value, "GamePreviewId");
}
function asPackageId(value) {
  return brandedId(value, "PackageId");
}
function asAssetId(value) {
  return brandedId(value, "AssetId");
}
function asAssetRevisionId(value) {
  return brandedId(value, "AssetRevisionId");
}
function asSha256(value, label = "Hash") {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 hash.`);
  return value;
}
function asDependencySnapshotHash(value) {
  if (!SHA256.test(value)) throw new Error("DependencySnapshotHash must be a lowercase SHA-256 hash.");
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
function canExecuteRuntime(flags, killSwitch) {
  return killSwitch !== true && flags["runtime-execution"] === true;
}
function jsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON does not accept non-finite numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      const item = value[key];
      if (item !== void 0) result[key] = jsonValue(item);
    }
    return result;
  }
  throw new Error("Canonical JSON accepts only JSON-compatible values.");
}
function canonicalJson(value) {
  return JSON.stringify(jsonValue(value));
}
async function sha256Hex(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function sortDependencyEntries(entries) {
  return [
    ...entries
  ].sort((left, right) => left.assetId.localeCompare(right.assetId) || left.revisionId.localeCompare(right.revisionId));
}
async function calculateDependencySnapshotHash(packageId, packageVersion, entries) {
  const canonicalEntries = sortDependencyEntries(entries);
  return asDependencySnapshotHash(await sha256Hex(canonicalJson({
    packageId,
    packageVersion,
    entries: canonicalEntries
  })));
}

// src/wp160-game-runtime-core.ts
function diagnostic(code, message, recoverable, severity = "ERROR") {
  return {
    code,
    severity,
    message,
    recoverable
  };
}
function assertPositiveBytes(entry) {
  if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) throw new Error("Dependency byteLength must be a non-negative safe integer.");
}
async function createDependencySnapshot(packageId, packageVersion, entries, locked) {
  if (!packageVersion) throw new Error("Invalid dependency snapshot.");
  for (const entry of entries) assertPositiveBytes(entry);
  const id = asPackageId(packageId);
  const snapshotHash = await calculateDependencySnapshotHash(id, packageVersion, entries);
  return {
    packageId: id,
    packageVersion,
    entries: [
      ...entries
    ].sort((a, b) => a.assetId.localeCompare(b.assetId) || a.revisionId.localeCompare(b.revisionId)),
    snapshotHash,
    locked
  };
}
function dependencyEntry(session, assetId) {
  return session.dependencies.entries.find((entry) => entry.assetId === assetId);
}
function actionNames(inputMap, events) {
  const names = /* @__PURE__ */ new Set();
  for (const event of events) {
    for (const binding of inputMap.bindings) if (binding.source === event.source && binding.code === event.code && event.phase === "DOWN") names.add(binding.action);
  }
  return [
    ...names
  ].sort();
}
function nextActionStates(previous, actions) {
  const next = {
    ...previous
  };
  for (const action of actions) next[action] = true;
  for (const action of Object.keys(next)) if (!actions.includes(action)) next[action] = false;
  return next;
}
function sampleAnimation(clip, elapsedMs) {
  if (clip.frames.length === 0) return void 0;
  for (const frame of clip.frames) if (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0) throw new Error("Animation frame durations must be positive.");
  const duration = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  const position = clip.loop ? (Math.max(0, elapsedMs) % duration + duration) % duration : Math.min(Math.max(0, elapsedMs), duration - Number.EPSILON);
  let cursor = 0;
  for (const frame of clip.frames) {
    cursor += frame.durationMs;
    if (position < cursor) return frame.frameId;
  }
  return clip.frames[clip.frames.length - 1]?.frameId;
}
function sameLock(left, right) {
  return left.assetId === right.assetId && left.revisionId === right.revisionId && left.contentHash === right.contentHash && left.mode === right.mode;
}
async function createRuntimePreview(options) {
  const runtime = options.runtime;
  const diagnostics = [];
  if (runtime.runtimeVersion !== options.supportedRuntimeVersion) diagnostics.push(diagnostic("UNSUPPORTED_RUNTIME_VERSION", `Runtime ${runtime.runtimeVersion} is not supported by this preview.`, false));
  if (runtime.runtimeId.length === 0 || options.dependencies.entries.length === 0) diagnostics.push(diagnostic("PACKAGE_INVALID", "Package manifest or dependency lock is invalid.", false));
  const calculatedHash = await calculateDependencySnapshotHash(options.dependencies.packageId, options.dependencies.packageVersion, options.dependencies.entries);
  if (calculatedHash !== options.dependencies.snapshotHash) diagnostics.push(diagnostic("DEPENDENCY_LOCK_MISMATCH", "Dependency Snapshot hash does not match its canonical entries.", false));
  if (options.capabilities.graphics === "NONE") diagnostics.push(diagnostic("RENDERER_UNAVAILABLE", "No supported renderer capability is available.", true, "WARNING"));
  if (!options.capabilities.audio) diagnostics.push(diagnostic("AUDIO_UNAVAILABLE", "Audio capability is unavailable; audio presentation is disabled.", true, "WARNING"));
  const requestedRenderer = options.renderer ?? options.capabilities.graphics;
  const renderer = requestedRenderer === "WEBGPU" && (options.capabilities.graphics !== "WEBGPU" || !options.capabilities.webGpuBenefitMeasured) ? options.capabilities.graphics === "CANVAS2D" ? "CANVAS2D" : "NONE" : requestedRenderer === "CANVAS2D" && options.capabilities.graphics === "NONE" ? "NONE" : requestedRenderer;
  if (requestedRenderer === "WEBGPU" && renderer !== "WEBGPU") diagnostics.push(diagnostic("RENDERER_UNAVAILABLE", "WebGPU was not selected without capability detection and measured benefit; fallback renderer retained.", true, "WARNING"));
  return {
    previewId: asGamePreviewId(options.previewId),
    projectId: asGameProjectId(options.projectId),
    projectRevisionId: options.projectRevisionId,
    packageId: asPackageId(options.packageId),
    packageVersion: options.packageVersion,
    runtime,
    dependencies: options.dependencies,
    capabilities: options.capabilities,
    inputMap: options.inputMap ?? {
      bindings: []
    },
    world: {
      schemaVersion: 1,
      tick: 0,
      elapsedMs: 0,
      actionStates: {},
      values: {}
    },
    presentation: {
      renderer,
      audio: options.capabilities.audio ? "AVAILABLE" : "UNAVAILABLE"
    },
    loadedAssets: {},
    diagnostics,
    running: diagnostics.some((item) => !item.recoverable) === false
  };
}
async function loadRuntimeAssets(session, requests, resolver) {
  const loaded = {
    ...session.loadedAssets
  };
  const diagnostics = [
    ...session.diagnostics
  ];
  for (const request of requests) {
    const entry = dependencyEntry(session, request.assetId);
    if (entry === void 0) {
      diagnostics.push(diagnostic(request.required ? "MISSING_REQUIRED_ASSET" : "OPTIONAL_ASSET_MISSING", `Asset ${request.assetId} is not declared by the locked dependency snapshot.`, !request.required));
      continue;
    }
    const payload = await resolver.resolve(request);
    if (payload === void 0) {
      diagnostics.push(diagnostic(request.required ? "MISSING_REQUIRED_ASSET" : "OPTIONAL_ASSET_MISSING", `Asset ${request.assetId} could not be resolved.`, !request.required));
      continue;
    }
    if (payload.quarantined === true) {
      diagnostics.push(diagnostic("ASSET_QUARANTINED", `Asset ${request.assetId} is quarantined and cannot be loaded.`, false));
      continue;
    }
    if (payload.revisionId !== entry.revisionId || payload.contentHash !== entry.contentHash) {
      diagnostics.push(diagnostic("HASH_MISMATCH", `Asset ${request.assetId} does not match the locked Revision or Hash.`, false));
      continue;
    }
    loaded[request.assetId] = payload;
  }
  const failedRequired = diagnostics.some((item) => item.code === "MISSING_REQUIRED_ASSET" || item.code === "HASH_MISMATCH" || item.code === "ASSET_QUARANTINED");
  return {
    ...session,
    loadedAssets: loaded,
    diagnostics,
    running: session.running && !failedRequired
  };
}
function startRuntimePreview(session) {
  return {
    ...session,
    running: session.running
  };
}
function stopRuntimePreview(session) {
  return {
    ...session,
    running: false
  };
}
function stepRuntime(session, deltaMs, input, animation) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error("Runtime delta must be a non-negative finite number.");
  if (!session.running) return {
    session,
    actions: [],
    presentationChanged: false
  };
  const actions = actionNames(session.inputMap, input);
  const world = {
    schemaVersion: 1,
    tick: session.world.tick + 1,
    elapsedMs: session.world.elapsedMs + deltaMs,
    actionStates: nextActionStates(session.world.actionStates, actions),
    values: session.world.values
  };
  const frameId = animation === void 0 ? session.presentation.frameId : sampleAnimation(animation, world.elapsedMs);
  const presentationChanged = frameId !== session.presentation.frameId;
  const presentation = frameId === void 0 ? {
    ...session.presentation
  } : {
    ...session.presentation,
    frameId
  };
  return {
    session: {
      ...session,
      world,
      presentation
    },
    actions,
    presentationChanged
  };
}
function safeHotReload(session, nextDependencies) {
  const diagnostics = [];
  if (nextDependencies.packageId !== session.packageId || nextDependencies.packageVersion !== session.packageVersion) {
    diagnostics.push(diagnostic("HOT_RELOAD_REJECTED", "Hot reload cannot change the Package identity or version.", true));
    return {
      accepted: false,
      session,
      diagnostics
    };
  }
  const oldEntries = session.dependencies.entries;
  const nextEntries = nextDependencies.entries;
  const incompatible = oldEntries.some((oldEntry) => {
    const nextEntry = nextEntries.find((candidate) => candidate.assetId === oldEntry.assetId);
    return nextEntry !== void 0 && oldEntry.mode === "PINNED" && !sameLock(oldEntry, nextEntry);
  });
  if (incompatible || !nextDependencies.locked) {
    diagnostics.push(diagnostic("HOT_RELOAD_REJECTED", "Pinned dependencies or an unlocked snapshot cannot be replaced during preview.", true));
    return {
      accepted: false,
      session,
      diagnostics
    };
  }
  const retained = {};
  for (const entry of nextEntries) {
    const loaded = session.loadedAssets[entry.assetId];
    if (loaded !== void 0 && loaded.revisionId === entry.revisionId && loaded.contentHash === entry.contentHash) retained[entry.assetId] = loaded;
  }
  return {
    accepted: true,
    session: {
      ...session,
      dependencies: nextDependencies,
      loadedAssets: retained
    },
    diagnostics
  };
}
function serializeRuntimeState(session) {
  return canonicalJson({
    projectId: session.projectId,
    projectRevisionId: session.projectRevisionId,
    world: session.world
  });
}
export {
  asAssetId,
  asAssetRevisionId,
  asSha256,
  canExecuteRuntime,
  createDependencySnapshot,
  createRuntimePreview,
  loadRuntimeAssets,
  safeHotReload,
  sampleAnimation,
  serializeRuntimeState,
  startRuntimePreview,
  stepRuntime,
  stopRuntimePreview
};
