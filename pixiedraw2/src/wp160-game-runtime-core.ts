/** Isolated WP-160 Draw-to-play Runtime foundation. No UI or persistence authority lives here. */

import {
  type AssetId,
  type AssetReferenceMode,
  type AssetRevisionId,
  type DependencyLockEntry,
  type DependencySnapshot,
  type GamePreviewId,
  type GameProjectId,
  type PackageId,
  type RuntimeCapabilityProfile,
  type RuntimeDiagnostic,
  type RuntimeVersionContract,
  asGamePreviewId,
  asGameProjectId,
  asPackageId,
  calculateDependencySnapshotHash,
  canonicalJson,
  type ContentHash,
} from "./wp160-contracts.ts";

export type InputSource = "POINTER" | "TOUCH" | "KEYBOARD" | "MOUSE" | "GAMEPAD";
export type InputEvent = {
  readonly source: InputSource;
  readonly code: string;
  readonly phase: "DOWN" | "UP" | "AXIS";
  readonly value?: number;
};

export interface InputBinding {
  readonly action: string;
  readonly source: InputSource;
  readonly code: string;
}

export interface InputActionMap {
  readonly bindings: readonly InputBinding[];
}

export interface AnimationFrame {
  readonly frameId: string;
  readonly durationMs: number;
}

export interface AnimationClip {
  readonly id: string;
  readonly frames: readonly AnimationFrame[];
  readonly loop: boolean;
}

export interface RuntimeAssetPayload {
  readonly assetId: AssetId;
  readonly revisionId: AssetRevisionId;
  readonly contentHash: ContentHash;
  readonly byteLength: number;
  readonly mimeType: string;
  readonly quarantined?: boolean;
}

export interface RuntimeAssetRequest {
  readonly assetId: AssetId;
  readonly required: boolean;
  readonly mode: AssetReferenceMode;
}

export interface RuntimeAssetResolver {
  resolve(request: RuntimeAssetRequest): Promise<RuntimeAssetPayload | undefined>;
}

export interface RuntimeWorldState {
  readonly schemaVersion: 1;
  readonly tick: number;
  readonly elapsedMs: number;
  readonly actionStates: Readonly<Record<string, boolean>>;
  readonly values: Readonly<Record<string, number | string | boolean>>;
}

export interface RuntimePresentationState {
  readonly frameId?: string;
  readonly renderer: "CANVAS2D" | "WEBGPU" | "NONE";
  readonly audio: "AVAILABLE" | "UNAVAILABLE";
}

export interface RuntimePreviewSession {
  readonly previewId: GamePreviewId;
  readonly projectId: GameProjectId;
  readonly projectRevisionId: string;
  readonly packageId: PackageId;
  readonly packageVersion: string;
  readonly runtime: RuntimeVersionContract;
  readonly dependencies: DependencySnapshot;
  readonly capabilities: RuntimeCapabilityProfile;
  readonly inputMap: InputActionMap;
  readonly world: RuntimeWorldState;
  readonly presentation: RuntimePresentationState;
  readonly loadedAssets: Readonly<Record<string, RuntimeAssetPayload>>;
  readonly diagnostics: readonly RuntimeDiagnostic[];
  readonly running: boolean;
}

export interface CreateRuntimePreviewOptions {
  readonly previewId: string;
  readonly projectId: string;
  readonly projectRevisionId: string;
  readonly packageId: string;
  readonly packageVersion: string;
  readonly runtime: RuntimeVersionContract;
  readonly supportedRuntimeVersion: string;
  readonly dependencies: DependencySnapshot;
  readonly capabilities: RuntimeCapabilityProfile;
  readonly inputMap?: InputActionMap;
  readonly renderer?: "CANVAS2D" | "WEBGPU" | "NONE";
}

export interface PreviewStepResult {
  readonly session: RuntimePreviewSession;
  readonly actions: readonly string[];
  readonly presentationChanged: boolean;
}

export interface HotReloadResult {
  readonly accepted: boolean;
  readonly session: RuntimePreviewSession;
  readonly diagnostics: readonly RuntimeDiagnostic[];
}

function diagnostic(code: RuntimeDiagnostic["code"], message: string, recoverable: boolean, severity: RuntimeDiagnostic["severity"] = "ERROR"): RuntimeDiagnostic {
  return { code, severity, message, recoverable };
}

function assertPositiveBytes(entry: DependencyLockEntry): void {
  if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0) throw new Error("Dependency byteLength must be a non-negative safe integer.");
}

export async function createDependencySnapshot(
  packageId: string,
  packageVersion: string,
  entries: readonly DependencyLockEntry[],
  locked: boolean,
): Promise<DependencySnapshot> {
  if (!packageVersion) throw new Error("Invalid dependency snapshot.");
  for (const entry of entries) assertPositiveBytes(entry);
  const id = asPackageId(packageId);
  const snapshotHash = await calculateDependencySnapshotHash(id, packageVersion, entries);
  return { packageId: id, packageVersion, entries: [...entries].sort((a, b) => a.assetId.localeCompare(b.assetId) || a.revisionId.localeCompare(b.revisionId)), snapshotHash, locked };
}

function dependencyEntry(session: RuntimePreviewSession, assetId: AssetId): DependencyLockEntry | undefined {
  return session.dependencies.entries.find((entry) => entry.assetId === assetId);
}

function actionNames(inputMap: InputActionMap, events: readonly InputEvent[]): readonly string[] {
  const names = new Set<string>();
  for (const event of events) {
    for (const binding of inputMap.bindings) if (binding.source === event.source && binding.code === event.code && event.phase === "DOWN") names.add(binding.action);
  }
  return [...names].sort();
}

function nextActionStates(previous: Readonly<Record<string, boolean>>, actions: readonly string[]): Readonly<Record<string, boolean>> {
  const next = { ...previous };
  for (const action of actions) next[action] = true;
  for (const action of Object.keys(next)) if (!actions.includes(action)) next[action] = false;
  return next;
}

export function sampleAnimation(clip: AnimationClip, elapsedMs: number): string | undefined {
  if (clip.frames.length === 0) return undefined;
  for (const frame of clip.frames) if (!Number.isFinite(frame.durationMs) || frame.durationMs <= 0) throw new Error("Animation frame durations must be positive.");
  const duration = clip.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  const position = clip.loop ? ((Math.max(0, elapsedMs) % duration) + duration) % duration : Math.min(Math.max(0, elapsedMs), duration - Number.EPSILON);
  let cursor = 0;
  for (const frame of clip.frames) {
    cursor += frame.durationMs;
    if (position < cursor) return frame.frameId;
  }
  return clip.frames[clip.frames.length - 1]?.frameId;
}

function sameLock(left: DependencyLockEntry, right: DependencyLockEntry): boolean {
  return left.assetId === right.assetId && left.revisionId === right.revisionId && left.contentHash === right.contentHash && left.mode === right.mode;
}

export async function createRuntimePreview(options: CreateRuntimePreviewOptions): Promise<RuntimePreviewSession> {
  const runtime = options.runtime;
  const diagnostics: RuntimeDiagnostic[] = [];
  if (runtime.runtimeVersion !== options.supportedRuntimeVersion) diagnostics.push(diagnostic("UNSUPPORTED_RUNTIME_VERSION", `Runtime ${runtime.runtimeVersion} is not supported by this preview.`, false));
  if (runtime.runtimeId.length === 0 || options.dependencies.entries.length === 0) diagnostics.push(diagnostic("PACKAGE_INVALID", "Package manifest or dependency lock is invalid.", false));
  const calculatedHash = await calculateDependencySnapshotHash(options.dependencies.packageId, options.dependencies.packageVersion, options.dependencies.entries);
  if (calculatedHash !== options.dependencies.snapshotHash) diagnostics.push(diagnostic("DEPENDENCY_LOCK_MISMATCH", "Dependency Snapshot hash does not match its canonical entries.", false));
  if (options.capabilities.graphics === "NONE") diagnostics.push(diagnostic("RENDERER_UNAVAILABLE", "No supported renderer capability is available.", true, "WARNING"));
  if (!options.capabilities.audio) diagnostics.push(diagnostic("AUDIO_UNAVAILABLE", "Audio capability is unavailable; audio presentation is disabled.", true, "WARNING"));
  const requestedRenderer = options.renderer ?? options.capabilities.graphics;
  const renderer = requestedRenderer === "WEBGPU" && (options.capabilities.graphics !== "WEBGPU" || !options.capabilities.webGpuBenefitMeasured)
    ? (options.capabilities.graphics === "CANVAS2D" ? "CANVAS2D" : "NONE")
    : requestedRenderer === "CANVAS2D" && options.capabilities.graphics === "NONE" ? "NONE" : requestedRenderer;
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
    inputMap: options.inputMap ?? { bindings: [] },
    world: { schemaVersion: 1, tick: 0, elapsedMs: 0, actionStates: {}, values: {} },
    presentation: { renderer, audio: options.capabilities.audio ? "AVAILABLE" : "UNAVAILABLE" },
    loadedAssets: {},
    diagnostics,
    running: diagnostics.some((item) => !item.recoverable) === false,
  };
}

export async function loadRuntimeAssets(session: RuntimePreviewSession, requests: readonly RuntimeAssetRequest[], resolver: RuntimeAssetResolver): Promise<RuntimePreviewSession> {
  const loaded = { ...session.loadedAssets };
  const diagnostics = [...session.diagnostics];
  const uniqueRequests = new Map<string, RuntimeAssetRequest>();
  for (const request of requests) {
    const key = String(request.assetId);
    const existing = uniqueRequests.get(key);
    uniqueRequests.set(key, existing === undefined ? request : { ...existing, required: existing.required || request.required });
  }
  for (const request of uniqueRequests.values()) {
    const entry = dependencyEntry(session, request.assetId);
    if (entry === undefined) {
      diagnostics.push(diagnostic(request.required ? "MISSING_REQUIRED_ASSET" : "OPTIONAL_ASSET_MISSING", `Asset ${request.assetId} is not declared by the locked dependency snapshot.`, !request.required));
      continue;
    }
    const existing = loaded[request.assetId];
    if (existing !== undefined && existing.revisionId === entry.revisionId && existing.contentHash === entry.contentHash) continue;
    const payload = await resolver.resolve(request);
    if (payload === undefined) {
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
  return { ...session, loadedAssets: loaded, diagnostics, running: session.running && !failedRequired };
}

export function startRuntimePreview(session: RuntimePreviewSession): RuntimePreviewSession {
  return { ...session, running: session.running };
}

export function stopRuntimePreview(session: RuntimePreviewSession): RuntimePreviewSession {
  return { ...session, running: false };
}

export function stepRuntime(session: RuntimePreviewSession, deltaMs: number, input: readonly InputEvent[], animation?: AnimationClip): PreviewStepResult {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error("Runtime delta must be a non-negative finite number.");
  if (!session.running) return { session, actions: [], presentationChanged: false };
  const actions = actionNames(session.inputMap, input);
  const world: RuntimeWorldState = {
    schemaVersion: 1,
    tick: session.world.tick + 1,
    elapsedMs: session.world.elapsedMs + deltaMs,
    actionStates: nextActionStates(session.world.actionStates, actions),
    values: session.world.values,
  };
  const frameId = animation === undefined ? session.presentation.frameId : sampleAnimation(animation, world.elapsedMs);
  const presentationChanged = frameId !== session.presentation.frameId;
  const presentation = frameId === undefined ? { ...session.presentation } : { ...session.presentation, frameId };
  return { session: { ...session, world, presentation }, actions, presentationChanged };
}

export function safeHotReload(session: RuntimePreviewSession, nextDependencies: DependencySnapshot): HotReloadResult {
  const diagnostics: RuntimeDiagnostic[] = [];
  if (nextDependencies.packageId !== session.packageId || nextDependencies.packageVersion !== session.packageVersion) {
    diagnostics.push(diagnostic("HOT_RELOAD_REJECTED", "Hot reload cannot change the Package identity or version.", true));
    return { accepted: false, session, diagnostics };
  }
  const oldEntries = session.dependencies.entries;
  const nextEntries = nextDependencies.entries;
  const incompatible = oldEntries.some((oldEntry) => {
    const nextEntry = nextEntries.find((candidate) => candidate.assetId === oldEntry.assetId);
    return nextEntry !== undefined && oldEntry.mode === "PINNED" && !sameLock(oldEntry, nextEntry);
  });
  if (incompatible || !nextDependencies.locked) {
    diagnostics.push(diagnostic("HOT_RELOAD_REJECTED", "Pinned dependencies or an unlocked snapshot cannot be replaced during preview.", true));
    return { accepted: false, session, diagnostics };
  }
  const retained: Record<string, RuntimeAssetPayload> = {};
  for (const entry of nextEntries) {
    const loaded = session.loadedAssets[entry.assetId];
    if (loaded !== undefined && loaded.revisionId === entry.revisionId && loaded.contentHash === entry.contentHash) retained[entry.assetId] = loaded;
  }
  return { accepted: true, session: { ...session, dependencies: nextDependencies, loadedAssets: retained }, diagnostics };
}

export function serializeRuntimeState(session: RuntimePreviewSession): string {
  return canonicalJson({ projectId: session.projectId, projectRevisionId: session.projectRevisionId, world: session.world });
}
