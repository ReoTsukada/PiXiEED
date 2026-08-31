/**
 * AUDIO-270 Freeze / Bounce.
 *
 * Freeze is a thin orchestration boundary around the AUDIO-260 Offline
 * Renderer.  It never mutates the canonical Project and it never exposes a
 * second render path: the caller commits the returned metadata through the
 * AUDIO-200 Workspace Journal only after the immutable WAV is in the byte
 * store.
 */

import {
  asAudioAssetId,
  asAudioClipId,
  asAudioContentHash,
  asAudioRevisionId,
  asAudioTrackId,
  asSourceBlobId,
  type Audio200Result,
  type AudioAssetByteStore,
  type AudioClip,
  type AudioContentHash,
  audioFail,
  type AudioFreezeStatus,
  audioOk,
  type AudioProject,
  type AudioRevision,
  type AudioTrack,
} from "../audio-200/index.ts";
import {
  canonicalizeSourceBlob,
  type SourceBlobCandidate,
} from "../audio-200/metadata-authority.ts";
import {
  type AudioOfflineRenderOptions,
  type AudioRenderBitDepth,
  type AudioRenderCancellation,
  type AudioRenderProgress,
  renderOfflineAudio,
} from "../audio-260/render.ts";
import {
  audioClockForProject,
  audioSecondsToTick,
  audioTickToSeconds,
} from "../audio-200/timebase.ts";
import { hashCanonical } from "../../wp160-contracts.ts";

const DEFAULT_SAMPLE_RATE_HZ = 48_000;
const DEFAULT_FRAME_RATE = 60;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface AudioFreezeRenderOptions {
  readonly project: AudioProject;
  readonly store: AudioAssetByteStore;
  readonly trackId: string;
  readonly sourceName?: string;
  readonly framesPerSecond?: number;
  readonly sampleRateHz?: number;
  readonly bitDepth?: AudioRenderBitDepth;
  readonly blockFrames?: number;
  readonly maxOutputBytes?: number;
  readonly cancellation?: AudioRenderCancellation;
  readonly onProgress?: (progress: AudioRenderProgress) => void | Promise<void>;
}

export interface AudioFreezeArtifact {
  readonly trackId: string;
  readonly sourceStateHash: AudioContentHash;
  readonly revision: AudioRevision;
  readonly clip: AudioClip;
  readonly durationSeconds: number;
  /** Null when an existing verified artifact is reused. */
  readonly bytes: Uint8Array | null;
  readonly reused: boolean;
  readonly existingStatus: AudioFreezeStatus | null;
}

export interface AudioBounceOptions extends AudioFreezeRenderOptions {
  readonly clipId?: string;
  readonly startSeconds?: number;
  readonly durationSeconds?: number;
}

export interface AudioBounceArtifact {
  readonly trackId: string;
  readonly sourceStateHash: AudioContentHash;
  readonly revision: AudioRevision;
  readonly clip: AudioClip;
  readonly durationSeconds: number;
  readonly bytes: Uint8Array;
}

function fail<T>(
  code:
    | "AUDIO_FREEZE_INVALID"
    | "AUDIO_FREEZE_STALE"
    | "AUDIO_FREEZE_CANCELLED"
    | "AUDIO_BOUNCE_INVALID"
    | "AUDIO_SOURCE_UNAVAILABLE",
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<T> {
  return audioFail(code, message, path, recoverable);
}

function trackForId(
  project: AudioProject,
  value: string,
): AudioTrack | undefined {
  return project.tracks.find((track) => String(track.trackId) === value);
}

function ticksToSeconds(ticks: number, project: AudioProject): number {
  return audioTickToSeconds(ticks, audioClockForProject(project, 1));
}

function secondsToTicks(seconds: number, project: AudioProject): number {
  return Math.max(
    1,
    Number(audioSecondsToTick(seconds, audioClockForProject(project, 1))),
  );
}

function clipRange(clip: AudioClip, project: AudioProject): {
  readonly start: number;
  readonly duration: number;
} {
  return {
    start: ticksToSeconds(clip.timeline.startTick, project),
    duration: ticksToSeconds(clip.timeline.durationTick, project),
  };
}

function trackDurationSeconds(
  track: AudioTrack,
  project: AudioProject,
): number {
  const clipById = new Map(
    project.clips.map((clip) => [String(clip.clipId), clip]),
  );
  const noteById = new Map(
    project.notes.map((note) => [String(note.noteId), note]),
  );
  let duration = 0;
  for (const id of track.clipIds) {
    const clip = clipById.get(String(id));
    if (clip === undefined) continue;
    const range = clipRange(clip, project);
    duration = Math.max(duration, range.start + range.duration);
  }
  for (const id of track.noteIds) {
    const note = noteById.get(String(id));
    if (note === undefined) continue;
    const range = clipRange({
      clipId: "note-range" as AudioClip["clipId"],
      trackId: track.trackId,
      revisionId: "note-range" as AudioClip["revisionId"],
      timeline: note.timeline,
      sourceOffsetUs: 0,
      gainMilliDb: 0,
      fadeInTick: 0 as AudioClip["fadeInTick"],
      fadeOutTick: 0 as AudioClip["fadeOutTick"],
      loop: false,
    }, project);
    duration = Math.max(duration, range.start + range.duration);
  }
  return duration;
}

function fingerprintMaterial(
  project: AudioProject,
  track: AudioTrack,
): unknown {
  const frozenClipIds = new Set(
    (project.freezeStates ?? [])
      .filter((freeze) => freeze.trackId === track.trackId)
      .map((freeze) => String(freeze.frozenClipId)),
  );
  const clips = project.clips.filter((clip) =>
    clip.trackId === track.trackId && !frozenClipIds.has(String(clip.clipId))
  );
  const notes = project.notes.filter((note) => note.trackId === track.trackId);
  const automations = project.automations.filter((automation) =>
    track.automationIds.includes(automation.automationId) ||
    automation.target.targetId === String(track.trackId)
  );
  const effects = project.effects.filter((effect) =>
    track.effectIds.includes(effect.effectId)
  );
  const channel = project.mixer.channels.find((item) =>
    item.trackId === track.trackId
  );
  return {
    projectId: project.projectId,
    tempo: project.tempo,
    timebase: project.timebase,
    track: {
      ...track,
      clipIds: clips.map((clip) => clip.clipId),
    },
    clips,
    notes,
    automations,
    effects,
    channel,
    routing: project.mixer,
    masterGainMilliDb: project.mixer.masterGainMilliDb,
  };
}

async function sourceStateHash(
  project: AudioProject,
  track: AudioTrack,
): Promise<AudioContentHash> {
  return asAudioContentHash(
    await hashCanonical(fingerprintMaterial(project, track)),
  );
}

function token(value: string): string {
  const normalized = value.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(
    /^-+|-+$/g,
    "",
  );
  return (SAFE_TOKEN.test(normalized) ? normalized : "audio").slice(0, 96);
}

function canonicalClip(
  project: AudioProject,
  track: AudioTrack,
  clipId: string,
  startSeconds: number,
  durationSeconds: number,
  framesPerSecond: number,
): AudioClip {
  const startTick = secondsToTicks(startSeconds, project);
  const durationTick = secondsToTicks(durationSeconds, project);
  const _ = framesPerSecond;
  return {
    clipId: asAudioClipId(clipId),
    trackId: track.trackId,
    revisionId: asAudioRevisionId("pending-revision"),
    timeline: {
      startTick: startTick as AudioClip["timeline"]["startTick"],
      durationTick: durationTick as AudioClip["timeline"]["durationTick"],
    },
    sourceOffsetUs: 0,
    gainMilliDb: 0,
    fadeInTick: 0 as AudioClip["fadeInTick"],
    fadeOutTick: 0 as AudioClip["fadeOutTick"],
    loop: false,
  };
}

function durationForBounce(
  options: AudioBounceOptions,
  track: AudioTrack,
  project: AudioProject,
): { readonly startSeconds: number; readonly durationSeconds: number } {
  const clip = options.clipId === undefined
    ? undefined
    : project.clips.find((item) =>
      String(item.clipId) === options.clipId && item.trackId === track.trackId
    );
  if (options.clipId !== undefined && clip === undefined) {
    throw new Error("Bounce Clip does not resolve to the selected Track.");
  }
  if (clip !== undefined) {
    const range = clipRange(clip, project);
    return { startSeconds: range.start, durationSeconds: range.duration };
  }
  const startSeconds = Math.max(0, options.startSeconds ?? 0);
  const total = options.durationSeconds ?? trackDurationSeconds(track, project);
  return { startSeconds, durationSeconds: Math.max(0, total - startSeconds) };
}

async function renderArtifact(
  options: AudioFreezeRenderOptions,
  track: AudioTrack,
  sourceHash: AudioContentHash,
  startSeconds: number,
  durationSeconds: number,
  clipIdPrefix: string,
): Promise<
  Audio200Result<{
    readonly revision: AudioRevision;
    readonly clip: AudioClip;
    readonly bytes: Uint8Array;
    readonly durationSeconds: number;
  }>
> {
  if (durationSeconds <= 0) {
    return fail(
      "AUDIO_FREEZE_INVALID",
      "Freeze/Bounce requires a Track with a positive render duration.",
      "track.duration",
    );
  }
  const freezeStates = (options.project.freezeStates ?? []).map((freeze) =>
    freeze.status === "ACTIVE" && freeze.trackId === track.trackId &&
      freeze.sourceStateHash !== sourceHash
      ? { ...freeze, status: "STALE" as const }
      : freeze
  );
  const renderProject = freezeStates.length === 0 &&
      options.project.freezeStates === undefined
    ? options.project
    : { ...options.project, freezeStates };
  const renderOptions: AudioOfflineRenderOptions = {
    project: renderProject,
    store: options.store,
    target: { kind: "STEM", trackId: String(track.trackId) },
    sampleRateHz: options.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ,
    bitDepth: options.bitDepth ?? 16,
    startSeconds,
    durationSeconds,
    maxOutputBytes: options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    includeTrackMixer: false,
    includeMasterMixer: false,
    respectMuteSolo: false,
    ...(options.blockFrames === undefined
      ? {}
      : { blockFrames: options.blockFrames }),
    ...(options.cancellation === undefined
      ? {}
      : { cancellation: options.cancellation }),
    ...(options.onProgress === undefined
      ? {}
      : { onProgress: options.onProgress }),
  };
  const rendered = await renderOfflineAudio(renderOptions);
  if (!rendered.ok) {
    if (
      rendered.diagnostics.some((item) =>
        item.code === "AUDIO_RENDER_CANCELLED"
      )
    ) {
      return fail(
        "AUDIO_FREEZE_CANCELLED",
        "Freeze/Bounce render was cancelled.",
        "render.cancellation",
        true,
      );
    }
    return rendered as Audio200Result<never>;
  }
  if (rendered.value.bytes === null) {
    return fail(
      "AUDIO_SOURCE_UNAVAILABLE",
      "Freeze/Bounce render did not produce an in-memory WAV artifact.",
      "render.bytes",
      true,
    );
  }
  const projectToken = token(String(options.project.projectId));
  const trackToken = token(String(track.trackId));
  const hashToken = String(sourceHash).slice(0, 32);
  const artifactToken = token(`${projectToken}-${trackToken}-${hashToken}`);
  const artifactKind = clipIdPrefix.startsWith("clip:bounce")
    ? "bounce"
    : "freeze";
  const assetId = asAudioAssetId(`asset:${artifactKind}:${artifactToken}`);
  const revisionId = asAudioRevisionId(
    `revision:${artifactKind}:${artifactToken}`,
  );
  const blobId = asSourceBlobId(`blob:${artifactKind}:${artifactToken}`);
  const now = new Date().toISOString();
  const candidate: SourceBlobCandidate = {
    blobId,
    assetId,
    revisionId,
    revisionNumber: 1,
    kind: "CLIP",
    referenceMode: "PINNED",
    locator: {
      placement: "OPFS",
      namespace: "audio",
      relativePath:
        `${artifactKind}s/${projectToken}/${trackToken}/${revisionId}.wav`,
    },
    bytes: rendered.value.bytes,
    createdAt: now,
  };
  const canonical = await canonicalizeSourceBlob(candidate);
  if (!canonical.ok) return canonical;
  const clip = canonicalClip(
    options.project,
    track,
    `${clipIdPrefix}:${artifactToken}`,
    startSeconds,
    rendered.value.durationSeconds,
    options.framesPerSecond ?? DEFAULT_FRAME_RATE,
  );
  const boundClip = { ...clip, revisionId: canonical.value.revisionId };
  const stored = await options.store.put(canonical.value, rendered.value.bytes);
  if (!stored.ok) return stored as Audio200Result<never>;
  return audioOk({
    revision: canonical.value,
    clip: boundClip,
    bytes: rendered.value.bytes,
    durationSeconds: rendered.value.durationSeconds,
  });
}

/** Render one Track to a pre-mixer WAV and return a reusable Freeze artifact. */
export async function freezeTrack(
  options: AudioFreezeRenderOptions,
): Promise<Audio200Result<AudioFreezeArtifact>> {
  const track = trackForId(options.project, options.trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_FREEZE_INVALID",
      "Freeze Track does not resolve to a canonical Project Track.",
      "trackId",
    );
  }
  const hash = await sourceStateHash(options.project, track);
  const existing = (options.project.freezeStates ?? []).find((freeze) =>
    freeze.trackId === track.trackId && freeze.sourceStateHash === hash &&
    (freeze.status === "ACTIVE" || freeze.status === "INACTIVE" ||
      freeze.status === "STALE")
  );
  if (existing !== undefined) {
    const revision = options.project.revisions.find((item) =>
      item.revisionId === existing.frozenRevisionId
    );
    const clip = options.project.clips.find((item) =>
      item.clipId === existing.frozenClipId
    );
    if (revision !== undefined && clip !== undefined) {
      const present = await options.store.has(revision);
      if (present.ok && present.value) {
        return audioOk({
          trackId: String(track.trackId),
          sourceStateHash: hash,
          revision,
          clip,
          durationSeconds: ticksToSeconds(
            clip.timeline.durationTick,
            options.project,
          ),
          bytes: null,
          reused: true,
          existingStatus: existing.status,
        });
      }
    }
  }
  const duration = trackDurationSeconds(track, options.project);
  const rendered = await renderArtifact(
    options,
    track,
    hash,
    0,
    duration,
    "clip:freeze",
  );
  if (!rendered.ok) return rendered;
  return audioOk({
    trackId: String(track.trackId),
    sourceStateHash: hash,
    revision: rendered.value.revision,
    clip: rendered.value.clip,
    durationSeconds: rendered.value.durationSeconds,
    bytes: rendered.value.bytes,
    reused: false,
    existingStatus: null,
  });
}

/** Render a selected Track range to a new non-destructive Audio Clip. */
export async function bounceInPlace(
  options: AudioBounceOptions,
): Promise<Audio200Result<AudioBounceArtifact>> {
  const track = trackForId(options.project, options.trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_BOUNCE_INVALID",
      "Bounce Track does not resolve to a canonical Project Track.",
      "trackId",
    );
  }
  let range: {
    readonly startSeconds: number;
    readonly durationSeconds: number;
  };
  try {
    range = durationForBounce(options, track, options.project);
  } catch (error) {
    return fail(
      "AUDIO_BOUNCE_INVALID",
      error instanceof Error ? error.message : "Bounce range is invalid.",
      "range",
    );
  }
  if (range.durationSeconds <= 0) {
    return fail(
      "AUDIO_BOUNCE_INVALID",
      "Bounce requires a positive Track range.",
      "range.durationSeconds",
    );
  }
  const hash = await sourceStateHash(options.project, track);
  const rendered = await renderArtifact(
    options,
    track,
    hash,
    range.startSeconds,
    range.durationSeconds,
    `clip:bounce:${options.project.projectRevision}:${
      Math.round(
        range.startSeconds * 1_000,
      )
    }:${Math.round(range.durationSeconds * 1_000)}`,
  );
  if (!rendered.ok) return rendered;
  return audioOk({
    trackId: String(track.trackId),
    sourceStateHash: hash,
    revision: rendered.value.revision,
    clip: rendered.value.clip,
    durationSeconds: rendered.value.durationSeconds,
    bytes: rendered.value.bytes,
  });
}
