import { hashCanonical } from "../../wp160-contracts.ts";
import {
  AUDIO200_SUPPORTED_CODECS,
  type AudioProject,
  type AudioRevision,
} from "../audio-200/index.ts";
import {
  AUDIO210_EXPORT_SCHEMA_VERSION,
  AUDIO210_PLAYBACK_SCHEMA_VERSION,
  AUDIO210_PREVIEW_SCHEMA_VERSION,
  AUDIO210_SCHEMA_VERSION,
  audio210Fail,
  audio210Ok,
  asAudioEventId,
  asAudioPreviewId,
  type Audio210Result,
  type AudioDecodeAdapterResult,
  type AudioDecodeRequest,
  type AudioEventBinding,
  type AudioEventBindingInput,
  type AudioEventCallerClaims,
  type AudioEventGraph,
  type AudioPlaybackPlan,
  type AudioPlaybackRequest,
  type AudioPreviewCommit,
  type AudioPreviewState,
} from "./contracts.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

function invalid(message: string, path?: string) {
  return audio210Fail<never>("AUDIO210_INVALID_INPUT", message, path);
}

function revisionFor(project: AudioProject, assetId: string, revisionId: string): AudioRevision | null {
  return project.revisions.find((revision) => revision.assetId === assetId && revision.revisionId === revisionId) ?? null;
}

function latestRevision(project: AudioProject, assetId: string): AudioRevision | null {
  return project.revisions
    .filter((revision) => revision.assetId === assetId)
    .sort((left, right) => right.revisionNumber - left.revisionNumber)[0] ?? null;
}

function validateCallerClaims(claims: AudioEventCallerClaims | undefined, binding: AudioEventBinding) {
  if (claims === undefined) return audio210Ok(true);
  const checks: Array<[keyof AudioEventCallerClaims, string]> = [
    ["eventId", binding.identity.eventId], ["projectId", binding.identity.projectId],
    ["assetId", binding.assetId], ["revisionId", binding.revisionId], ["contentHash", binding.contentHash],
  ];
  const mismatch = checks.find(([key, expected]) => claims[key] !== undefined && claims[key] !== expected);
  return mismatch
    ? audio210Fail<never>("AUDIO210_EVENT_IDENTITY_MISMATCH", `Caller claim ${mismatch[0]} does not match canonical event identity.`, String(mismatch[0]))
    : audio210Ok(true);
}

export async function createEventBinding(
  project: AudioProject,
  input: AudioEventBindingInput,
  callerClaims?: AudioEventCallerClaims,
): Promise<Audio210Result<AudioEventBinding>> {
  if (project === null || typeof project !== "object" || !SAFE_ID.test(project.projectId)) return invalid("AUDIO-200 project is required.", "project");
  if (!SAFE_ID.test(input.eventKey) || input.eventKey.length > 128) return invalid("eventKey must be a bounded stable identifier.", "eventKey");
  if (!Number.isSafeInteger(project.projectRevision) || project.projectRevision < 0) return invalid("projectRevision must be a non-negative safe integer.", "project.projectRevision");
  const revision = revisionFor(project, input.assetId, input.revisionId);
  if (revision === null) return audio210Fail("AUDIO210_ASSET_REVISION_MISMATCH", "Asset revision is not a member of the canonical project.", "revisionId");
  if (!AUDIO200_SUPPORTED_CODECS.includes(revision.source.metadata.codec)) return audio210Fail("AUDIO210_UNSUPPORTED_CODEC", "The canonical revision codec is unsupported.", "revision.source.metadata.codec");
  const gain = input.gainMilliDb ?? 0;
  const offset = input.startOffsetUs ?? 0;
  if (!Number.isSafeInteger(gain) || gain < -120000 || gain > 120000) return invalid("gainMilliDb is outside the safe range.", "gainMilliDb");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset >= revision.source.metadata.durationUs) return invalid("startOffsetUs is outside the revision duration.", "startOffsetUs");
  const eventId = asAudioEventId(`${project.projectId}:${input.eventKey}`);
  const identity = { eventId, eventKey: input.eventKey, projectId: project.projectId };
  const unsigned = {
    schemaVersion: AUDIO210_SCHEMA_VERSION, identity, projectRevision: project.projectRevision,
    assetId: revision.assetId, revisionId: revision.revisionId, revisionNumber: revision.revisionNumber,
    contentHash: revision.source.metadata.contentHash, assetKind: revision.kind, eventKind: input.eventKind,
    trigger: input.trigger, referenceMode: input.referenceMode, gainMilliDb: gain, loop: input.loop ?? false,
    startOffsetUs: offset,
  } as const;
  const bindingHash = await hashCanonical(unsigned);
  const binding = { ...unsigned, bindingHash };
  const claims = validateCallerClaims(callerClaims, binding);
  return claims.ok ? audio210Ok(binding) : claims;
}

export async function createEventGraph(
  project: AudioProject,
  inputs: readonly AudioEventBindingInput[],
  callerClaims?: readonly (AudioEventCallerClaims | undefined)[],
): Promise<Audio210Result<AudioEventGraph>> {
  const keys = new Set<string>();
  const bindings: AudioEventBinding[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    if (keys.has(inputs[index]!.eventKey)) return audio210Fail("AUDIO210_DUPLICATE_EVENT", "eventKey must be unique within an event graph.", `inputs[${index}].eventKey`);
    keys.add(inputs[index]!.eventKey);
    const result = await createEventBinding(project, inputs[index]!, callerClaims?.[index]);
    if (!result.ok) return result;
    bindings.push(result.value);
  }
  const stateHash = await hashCanonical({ projectId: project.projectId, projectRevision: project.projectRevision, bindings });
  return audio210Ok({ schemaVersion: AUDIO210_SCHEMA_VERSION, projectId: project.projectId, projectRevision: project.projectRevision, graphRevision: 1, stateHash, bindings });
}

export async function beginPreview(project: AudioProject, graph: AudioEventGraph, previewId: string): Promise<Audio210Result<AudioPreviewState>> {
  if (graph.projectId !== project.projectId) return audio210Fail("AUDIO210_WRONG_PROJECT", "Graph is bound to another project.", "graph.projectId");
  if (graph.projectRevision !== project.projectRevision) return audio210Fail("AUDIO210_STALE_PROJECT_REVISION", "Graph was created from a stale project revision.", "graph.projectRevision");
  if (!SAFE_ID.test(previewId)) return invalid("previewId must be a bounded stable identifier.", "previewId");
  const previewHash = await hashCanonical({ projectId: project.projectId, baseProjectRevision: project.projectRevision, baseGraphHash: graph.stateHash, draftBindings: graph.bindings });
  return audio210Ok({ schemaVersion: AUDIO210_PREVIEW_SCHEMA_VERSION, mode: "PREVIEW", previewId: asAudioPreviewId(previewId), projectId: project.projectId, baseProjectRevision: project.projectRevision, baseGraphHash: graph.stateHash, status: "ACTIVE", draftBindings: graph.bindings, previewHash });
}

export async function cancelPreview(preview: AudioPreviewState): Promise<Audio210Result<AudioPreviewState>> {
  if (preview.status !== "ACTIVE") return audio210Fail(preview.status === "CANCELLED" ? "AUDIO210_PREVIEW_CANCELLED" : "AUDIO210_PREVIEW_COMMITTED", "Preview is no longer active.", "preview.status");
  return audio210Ok({ ...preview, status: "CANCELLED" });
}

export async function commitPreview(project: AudioProject, graph: AudioEventGraph, preview: AudioPreviewState): Promise<Audio210Result<AudioPreviewCommit>> {
  if (preview.status !== "ACTIVE") return audio210Fail(preview.status === "CANCELLED" ? "AUDIO210_PREVIEW_CANCELLED" : "AUDIO210_PREVIEW_COMMITTED", "Only an active preview can be committed.", "preview.status");
  if (preview.projectId !== project.projectId || graph.projectId !== project.projectId) return audio210Fail("AUDIO210_WRONG_PROJECT", "Preview and graph are not bound to the current project.", "projectId");
  if (preview.baseProjectRevision !== project.projectRevision || preview.baseGraphHash !== graph.stateHash) return audio210Fail("AUDIO210_STALE_PREVIEW", "Preview base no longer matches the canonical graph.", "preview.baseGraphHash");
  const next = { ...graph, graphRevision: graph.graphRevision + 1, bindings: preview.draftBindings };
  const stateHash = await hashCanonical({ projectId: next.projectId, projectRevision: next.projectRevision, bindings: next.bindings });
  const committed = { ...next, stateHash };
  return audio210Ok({ preview: { ...preview, status: "COMMITTED" }, graph: committed, currentProjectRevision: project.projectRevision, currentGraphHash: committed.stateHash });
}

export async function planPlayback(project: AudioProject, graph: AudioEventGraph, request: AudioPlaybackRequest): Promise<Audio210Result<AudioPlaybackPlan>> {
  if (graph.projectId !== project.projectId) return audio210Fail("AUDIO210_WRONG_PROJECT", "Playback graph is bound to another project.", "graph.projectId");
  if (graph.projectRevision !== project.projectRevision) return audio210Fail("AUDIO210_STALE_PROJECT_REVISION", "Playback graph was created from a stale project revision.", "graph.projectRevision");
  const binding = graph.bindings.find((item) => item.identity.eventId === request.eventId);
  if (!binding) return audio210Fail("AUDIO210_EVENT_NOT_FOUND", "Playback event is absent from the graph.", "eventId");
  const revision = binding.referenceMode === "LIVE" ? latestRevision(project, binding.assetId) : revisionFor(project, binding.assetId, binding.revisionId);
  if (!revision) return audio210Fail("AUDIO210_REVISION_NOT_FOUND", "Playback revision is absent from the canonical project.", "revisionId");
  const changed = revision.revisionId !== binding.revisionId;
  const playing = request.currentPlayback?.isPlaying === true;
  const deferred = changed && playing && request.boundaryReached !== true;
  if (changed && binding.referenceMode === "PINNED") return audio210Fail("AUDIO210_ASSET_REVISION_MISMATCH", "PINNED event cannot follow another revision.", "revisionId");
  return audio210Ok({ schemaVersion: AUDIO210_PLAYBACK_SCHEMA_VERSION, projectId: project.projectId, eventId: binding.identity.eventId, assetId: revision.assetId, revisionId: revision.revisionId, revisionNumber: revision.revisionNumber, contentHash: revision.source.metadata.contentHash, referenceMode: binding.referenceMode, gainMilliDb: binding.gainMilliDb, loop: binding.loop, startOffsetUs: binding.startOffsetUs, safeBoundary: deferred ? "LOOP_BOUNDARY" : (playing ? "START" : "STOPPED"), deferred });
}

export function validateDecodeResult(request: AudioDecodeRequest, result: AudioDecodeAdapterResult): Audio210Result<true> {
  if (!AUDIO200_SUPPORTED_CODECS.includes(request.codec)) return audio210Fail("AUDIO210_UNSUPPORTED_CODEC", "Decode request codec is unsupported.", "codec");
  if (result.status === "UNSUPPORTED") return audio210Fail("AUDIO210_UNSUPPORTED_CODEC", result.reason, "decode");
  if (result.status !== "DECODED") return audio210Fail(result.status === "OFFLINE" ? "AUDIO210_OFFLINE" : "AUDIO210_DECODE_FAILED", result.reason, "decode");
  if (result.codec !== request.codec || result.sampleRateHz !== request.sampleRateHz || result.channels !== request.channels || result.durationUs !== request.durationUs || result.byteLength !== request.byteLength || result.contentHash !== request.contentHash) return audio210Fail("AUDIO210_ADAPTER_INVALID", "Decoder result does not match canonical source metadata.", "decode");
  return audio210Ok(true);
}

export async function createExportPlan(project: AudioProject, graph: AudioEventGraph): Promise<Audio210Result<import("./contracts.ts").AudioExportPlan>> {
  if (graph.projectId !== project.projectId) return audio210Fail("AUDIO210_WRONG_PROJECT", "Export graph is bound to another project.", "graph.projectId");
  if (graph.bindings.some((binding) => binding.referenceMode !== "PINNED")) return audio210Fail("AUDIO210_EXPORT_REQUIRES_PINNED", "Export requires every event to be PINNED.", "bindings");
  const dependencyHashes = graph.bindings.map((binding) => binding.contentHash);
  const exportHash = await hashCanonical({ projectId: graph.projectId, graphRevision: graph.graphRevision, dependencyHashes, bindings: graph.bindings });
  return audio210Ok({ schemaVersion: AUDIO210_EXPORT_SCHEMA_VERSION, projectId: graph.projectId, graphRevision: graph.graphRevision, dependencyHashes, bindings: graph.bindings, exportHash });
}
