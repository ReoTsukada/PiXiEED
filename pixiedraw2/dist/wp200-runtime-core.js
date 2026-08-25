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
async function hashCanonical(value) {
  return asSha256(await sha256Hex(canonicalJson(value)), "ContentHash");
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

// src/wp200-game-runtime-core.ts
function diagnostic2(code, message, recoverable, severity = "ERROR") {
  return {
    code,
    severity,
    message,
    recoverable
  };
}
function safeText(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u.test(value)) throw new Error(`${label} must be a stable identifier.`);
}
function referenceKey(reference) {
  return `${reference.kind}:${reference.assetId}:${reference.revisionId}:${reference.contentHash}`;
}
function collectReferences(project) {
  const references = [];
  for (const scene of project.scenes) {
    for (const entity of scene.entities) {
      for (const component of entity.components) {
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") references.push(component.asset);
      }
    }
  }
  return references.sort((left, right) => referenceKey(left).localeCompare(referenceKey(right)));
}
function dependencyMatchesReference(reference, dependencies) {
  return dependencies.entries.some((entry) => entry.assetId === reference.assetId && entry.revisionId === reference.revisionId && entry.contentHash === reference.contentHash && entry.byteLength === reference.byteLength && entry.mimeType === reference.mimeType && entry.mode === reference.mode);
}
function validateReference(reference, diagnostics) {
  if (![
    "DRAW",
    "AUDIO"
  ].includes(reference.kind)) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Asset reference kind is unsupported.", false));
  if (reference.provenance !== (reference.kind === "DRAW" ? "DRAW2" : "PIXIAUDIO")) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Asset reference provenance does not match its kind.", false));
  if (!Number.isSafeInteger(reference.byteLength) || reference.byteLength < 0) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Asset reference byteLength is invalid.", false));
  if (!reference.mimeType || reference.mimeType.includes("/") === false) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Asset reference MIME type is invalid.", false));
  if (reference.mode === "LIVE" && reference.kind === "AUDIO") diagnostics.push(diagnostic2("PACKAGE_INVALID", "Audio LIVE references are preview-only and must not enter a locked Build.", true, "WARNING"));
}
function validateGameProject(project) {
  const diagnostics = [];
  if (project.schemaVersion !== 1) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Unknown Game Project schema version.", false));
  try {
    asGameProjectId(project.projectId);
    safeText(project.revisionId, "GameProjectRevisionId");
    safeText(project.packageVersion, "PackageVersion");
  } catch (error) {
    diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", error instanceof Error ? error.message : "Game Project identity is invalid.", false));
  }
  if (!project.name.trim()) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", "Game Project name is required.", false));
  if (project.scenes.length === 0) diagnostics.push(diagnostic2("PACKAGE_INVALID", "Game Project requires at least one Scene.", false));
  if (!project.dependencies.locked) diagnostics.push(diagnostic2("DEPENDENCY_LOCK_MISMATCH", "Game Project requires a locked Dependency Snapshot for Runtime/Build use.", false));
  const sceneIds = /* @__PURE__ */ new Set();
  const entityIds = /* @__PURE__ */ new Set();
  const componentIds = /* @__PURE__ */ new Set();
  const actionIds = /* @__PURE__ */ new Set();
  for (const action of project.inputMap.actions) {
    try {
      safeText(action.actionId, "GameActionId");
    } catch (error) {
      diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", error instanceof Error ? error.message : "Action ID is invalid.", false));
    }
    if (actionIds.has(action.actionId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Duplicate Game Action ${action.actionId}.`, false));
    actionIds.add(action.actionId);
    if (!action.bindings.length) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", `Game Action ${action.actionId} has no binding.`, true, "WARNING"));
  }
  for (const scene of project.scenes) {
    try {
      safeText(scene.sceneId, "GameSceneId");
    } catch (error) {
      diagnostics.push(diagnostic2("PACKAGE_INVALID", error instanceof Error ? error.message : "Scene ID is invalid.", false));
    }
    if (sceneIds.has(scene.sceneId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Duplicate Game Scene ${scene.sceneId}.`, false));
    sceneIds.add(scene.sceneId);
    const sceneEntityIds = new Set(scene.entities.map((entity) => entity.entityId));
    for (const rootId of scene.rootEntityIds) if (!sceneEntityIds.has(rootId)) diagnostics.push(diagnostic2("MISSING_REQUIRED_ASSET", `Scene root Entity ${rootId} is missing.`, false));
    for (const entity of scene.entities) {
      try {
        safeText(entity.entityId, "GameEntityId");
      } catch (error) {
        diagnostics.push(diagnostic2("PACKAGE_INVALID", error instanceof Error ? error.message : "Entity ID is invalid.", false));
      }
      if (entityIds.has(entity.entityId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Duplicate Game Entity ${entity.entityId}.`, false));
      entityIds.add(entity.entityId);
      if (entity.parentEntityId !== void 0 && !sceneEntityIds.has(entity.parentEntityId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Entity parent ${entity.parentEntityId} is missing.`, false));
      for (const component of entity.components) {
        try {
          safeText(component.componentId, "GameComponentId");
        } catch (error) {
          diagnostics.push(diagnostic2("PACKAGE_INVALID", error instanceof Error ? error.message : "Component ID is invalid.", false));
        }
        if (componentIds.has(component.componentId)) diagnostics.push(diagnostic2("PACKAGE_INVALID", `Duplicate Game Component ${component.componentId}.`, false));
        componentIds.add(component.componentId);
        if (component.type === "SPRITE" || component.type === "ANIMATION" || component.type === "AUDIO_SOURCE") {
          validateReference(component.asset, diagnostics);
          if (!dependencyMatchesReference(component.asset, project.dependencies)) diagnostics.push(diagnostic2("DEPENDENCY_LOCK_MISMATCH", `Game Asset ${component.asset.assetId} is not present in the locked Dependency Snapshot.`, false));
        }
        if (component.type === "CONTROL" && !actionIds.has(component.actionId)) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", `Control references unknown Action ${component.actionId}.`, false));
        if (component.type === "AUDIO_SOURCE" && (component.volume < 0 || component.volume > 1)) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", `Audio volume for ${component.componentId} must be between 0 and 1.`, false));
      }
    }
    for (const entity of scene.entities) {
      const seenParents = /* @__PURE__ */ new Set();
      let parentId = entity.parentEntityId;
      while (parentId !== void 0) {
        if (seenParents.has(parentId) || parentId === entity.entityId) {
          diagnostics.push(diagnostic2("PACKAGE_INVALID", `Entity parent cycle includes ${entity.entityId}.`, false));
          break;
        }
        seenParents.add(parentId);
        parentId = scene.entities.find((candidate) => candidate.entityId === parentId)?.parentEntityId;
      }
    }
  }
  for (const behavior of project.behaviors) {
    try {
      safeText(behavior.behaviorId, "GameBehaviorId");
    } catch (error) {
      diagnostics.push(diagnostic2("PACKAGE_INVALID", error instanceof Error ? error.message : "Behavior ID is invalid.", false));
    }
    for (const rule of behavior.rules) {
      if (!actionIds.has(rule.actionId)) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", `Behavior references unknown Action ${rule.actionId}.`, false));
      for (const operation of rule.operations) if (!operation.key.trim()) diagnostics.push(diagnostic2("BUILD_INVALID_REQUEST", "Behavior operation key is required.", false));
    }
  }
  for (const reference of collectReferences(project)) {
    if (reference.mode === "PINNED" && !dependencyMatchesReference(reference, project.dependencies)) diagnostics.push(diagnostic2("DEPENDENCY_LOCK_MISMATCH", `Pinned Asset ${reference.assetId} is not locked.`, false));
  }
  return {
    valid: diagnostics.every((item) => item.severity !== "ERROR"),
    diagnostics
  };
}
function gameInputActionMapToRuntime(inputMap) {
  return {
    bindings: inputMap.actions.flatMap((action) => action.bindings).sort((left, right) => `${left.action}:${left.source}:${left.code}`.localeCompare(`${right.action}:${right.source}:${right.code}`))
  };
}
function gameAssetRequests(project) {
  const unique = /* @__PURE__ */ new Map();
  for (const reference of collectReferences(project)) unique.set(String(reference.assetId), {
    assetId: reference.assetId,
    required: true,
    mode: reference.mode
  });
  return [
    ...unique.values()
  ].sort((left, right) => left.assetId.localeCompare(right.assetId));
}
function featureEnabled(flags, feature, killSwitch) {
  return killSwitch !== true && flags[feature] === true;
}
function appendFlagDiagnostic(diagnostics, feature) {
  diagnostics.push(diagnostic2("UNSUPPORTED_CAPABILITY", `Feature flag ${feature} is OFF; isolated Game/Runtime operation is unavailable.`, true, "WARNING"));
}
async function createGameRuntimePreview(options) {
  const validation = validateGameProject(options.project);
  const diagnostics = [
    ...validation.diagnostics
  ];
  if (!featureEnabled(options.flags, "game-core-read", options.killSwitch)) appendFlagDiagnostic(diagnostics, "game-core-read");
  if (!featureEnabled(options.flags, "runtime-preview", options.killSwitch)) appendFlagDiagnostic(diagnostics, "runtime-preview");
  const runtimeBase = {
    previewId: options.previewId,
    projectId: options.project.projectId,
    projectRevisionId: options.project.revisionId,
    packageId: options.project.packageId,
    packageVersion: options.project.packageVersion,
    runtime: options.runtime,
    supportedRuntimeVersion: options.supportedRuntimeVersion,
    dependencies: options.project.dependencies,
    capabilities: options.capabilities,
    inputMap: options.inputMap ?? gameInputActionMapToRuntime(options.project.inputMap)
  };
  const runtime = options.renderer === void 0 ? await createRuntimePreview(runtimeBase) : await createRuntimePreview({
    ...runtimeBase,
    renderer: options.renderer
  });
  const allDiagnostics = [
    ...diagnostics,
    ...runtime.diagnostics
  ];
  const running = runtime.running && validation.valid && featureEnabled(options.flags, "game-core-read", options.killSwitch) && featureEnabled(options.flags, "runtime-preview", options.killSwitch);
  return {
    project: options.project,
    runtime: {
      ...runtime,
      running,
      diagnostics: allDiagnostics
    },
    sceneId: options.project.scenes[0]?.sceneId ?? "",
    runtimeValues: {},
    recovery: validation.valid && running ? "VALID" : "BLOCKED",
    diagnostics: allDiagnostics
  };
}
function applyBehaviorValues(project, previous, actions) {
  const next = {
    ...previous
  };
  const active = new Set(actions);
  const activeActionIds = new Set(project.inputMap.actions.filter((action) => action.bindings.some((binding) => active.has(binding.action))).map((action) => action.actionId));
  for (const behavior of project.behaviors) {
    for (const rule of behavior.rules) {
      if (!activeActionIds.has(rule.actionId)) continue;
      for (const operation of rule.operations) {
        if (operation.operation === "SET_VALUE") next[operation.key] = operation.value;
        const currentValue = next[operation.key];
        if (operation.operation === "ADD_VALUE" && typeof operation.value === "number" && typeof currentValue === "number") next[operation.key] = currentValue + operation.value;
        if (operation.operation === "ADD_VALUE" && typeof operation.value === "number" && next[operation.key] === void 0) next[operation.key] = operation.value;
      }
    }
  }
  return next;
}
function stepGameRuntime(session, deltaMs, input) {
  const stepped = stepRuntime(session.runtime, deltaMs, input);
  const runtimeValues = applyBehaviorValues(session.project, session.runtimeValues, stepped.actions);
  const nextRuntime = {
    ...stepped.session,
    world: {
      ...stepped.session.world,
      values: runtimeValues
    }
  };
  return {
    session: {
      ...session,
      runtime: nextRuntime,
      runtimeValues,
      diagnostics: nextRuntime.diagnostics
    },
    actions: stepped.actions,
    presentationChanged: stepped.presentationChanged
  };
}
async function loadGameRuntimeAssets(session, resolver) {
  const runtime = await loadRuntimeAssets(session.runtime, gameAssetRequests(session.project), resolver);
  const blocked = runtime.diagnostics.some((item) => !item.recoverable && [
    "MISSING_REQUIRED_ASSET",
    "HASH_MISMATCH",
    "ASSET_QUARANTINED"
  ].includes(item.code));
  return {
    ...session,
    runtime: {
      ...runtime,
      running: runtime.running && !blocked
    },
    recovery: blocked ? "BLOCKED" : session.recovery,
    diagnostics: runtime.diagnostics
  };
}
function stopGameRuntime(session) {
  return {
    ...session,
    runtime: {
      ...session.runtime,
      running: false
    }
  };
}
function safeGameHotReload(session, nextProject) {
  const validation = validateGameProject(nextProject);
  if (!validation.valid || nextProject.projectId !== session.project.projectId || nextProject.packageId !== session.project.packageId || nextProject.packageVersion !== session.project.packageVersion) {
    const diagnostics = [
      ...validation.diagnostics,
      diagnostic2("HOT_RELOAD_REJECTED", "Game Project identity, Package, or schema is incompatible with the active Runtime session.", true)
    ];
    return {
      accepted: false,
      session: {
        ...session,
        recovery: "RECOVERED",
        diagnostics
      },
      diagnostics
    };
  }
  const result = safeHotReload(session.runtime, nextProject.dependencies);
  if (!result.accepted) return {
    accepted: false,
    session: {
      ...session,
      diagnostics: [
        ...session.diagnostics,
        ...result.diagnostics
      ],
      recovery: "RECOVERED"
    },
    diagnostics: result.diagnostics
  };
  const sceneExists = nextProject.scenes.some((scene) => scene.sceneId === session.sceneId);
  if (!sceneExists) {
    const diagnostics = [
      diagnostic2("HOT_RELOAD_REJECTED", "The active Scene no longer exists in the incoming revision.", true)
    ];
    return {
      accepted: false,
      session: {
        ...session,
        diagnostics: [
          ...session.diagnostics,
          ...diagnostics
        ],
        recovery: "RECOVERED"
      },
      diagnostics
    };
  }
  return {
    accepted: true,
    session: {
      ...session,
      project: nextProject,
      runtime: {
        ...result.session,
        projectRevisionId: nextProject.revisionId
      },
      recovery: "VALID",
      diagnostics: result.diagnostics
    },
    diagnostics: result.diagnostics
  };
}
async function serializeGameRuntimeSaveState(session) {
  const body = {
    schemaVersion: 1,
    projectId: session.project.projectId,
    projectRevisionId: session.project.revisionId,
    sceneId: session.sceneId,
    tick: session.runtime.world.tick,
    values: session.runtimeValues
  };
  return {
    ...body,
    checksum: await hashCanonical(body)
  };
}
async function restoreGameRuntimeSaveState(session, save) {
  const expected = await hashCanonical({
    schemaVersion: save.schemaVersion,
    projectId: save.projectId,
    projectRevisionId: save.projectRevisionId,
    sceneId: save.sceneId,
    tick: save.tick,
    values: save.values
  });
  const diagnostics = [];
  if (save.schemaVersion !== 1 || save.checksum !== expected) diagnostics.push(diagnostic2("LOAD_FAILED", "Runtime Save State schema or checksum is invalid.", true));
  if (save.projectId !== session.project.projectId || save.sceneId !== session.sceneId) diagnostics.push(diagnostic2("LOAD_FAILED", "Runtime Save State belongs to another Game Project or Scene.", true));
  if (diagnostics.length) return {
    session: {
      ...session,
      recovery: "RECOVERED",
      diagnostics: [
        ...session.diagnostics,
        ...diagnostics
      ]
    },
    restored: false,
    diagnostics
  };
  const runtime = {
    ...session.runtime,
    world: {
      ...session.runtime.world,
      tick: save.tick,
      values: save.values
    }
  };
  return {
    session: {
      ...session,
      runtime,
      runtimeValues: save.values,
      recovery: "VALID",
      diagnostics: runtime.diagnostics
    },
    restored: true,
    diagnostics: []
  };
}
async function gameRuntimeStateFingerprint(session) {
  return asSha256(await hashCanonical({
    projectId: session.project.projectId,
    projectRevisionId: session.project.revisionId,
    runtime: serializeRuntimeState(session.runtime),
    sceneId: session.sceneId,
    values: session.runtimeValues
  }));
}
export {
  createGameRuntimePreview,
  gameAssetRequests,
  gameInputActionMapToRuntime,
  gameRuntimeStateFingerprint,
  loadGameRuntimeAssets,
  restoreGameRuntimeSaveState,
  safeGameHotReload,
  serializeGameRuntimeSaveState,
  stepGameRuntime,
  stopGameRuntime
};
