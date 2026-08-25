/**
 * AUDIO-200 workspace bridge.
 *
 * The editor may still receive frame coordinates from the canvas, but this
 * adapter accepts canonical Tick coordinates first and persists only the
 * Audio Project's PPQ timeline. Frames remain a compatibility projection for
 * old UI callers and are never authoritative once Tick fields are present.
 */

import {
  asAudioAutomationId,
  asAudioClipId,
  asAudioCommandId,
  asAudioContentHash,
  asAudioEffectId,
  asAudioMixerChannelId,
  asAudioMixerSendId,
  asAudioNoteId,
  asAudioProjectId,
  asAudioRevisionId,
  asAudioTrackId,
  AUDIO200_UI_SCHEMA_VERSION,
  type Audio200Diagnostic,
  type Audio200Result,
  type AudioAutomation,
  type AudioClip,
  type AudioClipSplitPayload,
  type AudioCommandPayload,
  type AudioCommandType,
  type AudioDrumKitId,
  type AudioEffect,
  type AudioEffectKind,
  audioFail,
  type AudioFreezeCommitPayload,
  type AudioFreezeState,
  type AudioJournalEntry,
  type AudioMarker,
  type AudioMasterState,
  type AudioMixer,
  type AudioMixerSend,
  audioOk,
  type AudioProject,
  type AudioRecordingCommitPayload,
  type AudioRevision,
  type AudioSynthPreset,
  type AudioTempo,
  type AudioTick,
  type AudioTrack,
  type AudioTrackKind,
  isAudioDrumKitId,
} from "./contracts.ts";
import {
  audioClockForProject,
  audioFrameToTick,
  audioInstrumentTrackId,
  audioTickToFrame,
  audioTickToSeconds,
} from "./timebase.ts";
import {
  appendAudioAssetRevision,
  createAudioAssetCatalog,
  validateAudioAssetCatalog,
} from "./assets.ts";
import type { AudioAssetCatalog } from "./contracts.ts";
import {
  applyAudioCommand,
  AUDIO200_DEFAULT_PPQ,
  type AudioCommandInput,
  createAudioCommand,
  createAudioProject,
} from "./state.ts";
import {
  type AudioJournalState,
  createAudioCheckpoint,
  createAudioJournal,
  dispatchAudioCommand,
  redoAudio,
  undoAudio,
} from "./journal.ts";

const MIN_FPS = 1;
const MAX_FPS = 240;
const MIN_BPM = 20;
const MAX_BPM = 300;
const MAX_INSTRUMENTS = 64;
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/** The frame-oriented shape used by the current Piano Roll UI. */
export interface AudioWorkspaceNoteInput {
  readonly id: string;
  readonly pitchMidi: number;
  /** Legacy canvas projection. Use startTick/durationTick for new edits. */
  readonly startFrame?: number;
  readonly durationFrames?: number;
  readonly startTick?: AudioTick;
  readonly durationTick?: AudioTick;
  readonly velocity: number;
  readonly instrument: string;
}

/** UI marker shape with a Tick-native path and a frame compatibility path. */
export interface AudioWorkspaceMarkerInput {
  readonly id: string;
  readonly frameId?: string;
  /** Zero-based UI frame. The marker panel displays this as F(frame + 1). */
  readonly frame?: number;
  readonly tick?: AudioTick;
  readonly label: string;
}

/**
 * Mixer values used by the current Workspace UI.  Gain is expressed in dB
 * and pan is a normalized stereo balance (-1 left, 0 center, +1 right).
 * The canonical Project stores both values as bounded fixed-point integers.
 */
export interface AudioWorkspaceMixerChannelInput {
  readonly trackId: string;
  readonly gainDb: number;
  readonly pan: number;
  readonly muted: boolean;
  readonly solo: boolean;
}

export interface AudioWorkspaceRoutingSendInput {
  readonly id: string;
  readonly sourceTrackId: string;
  readonly destinationTrackId: string;
  readonly amountDb: number;
  readonly preFader: boolean;
}

export interface AudioWorkspaceRoutingInput {
  readonly trackId: string;
  /** null routes to Master; omitted preserves the existing destination. */
  readonly outputTrackId?: string | null;
  /** When supplied, replaces the complete canonical Send list atomically. */
  readonly sends?: readonly AudioWorkspaceRoutingSendInput[];
}

/** Descriptive alias used by Mixer-focused callers. */
export type AudioWorkspaceMixerRoutingInput = AudioWorkspaceRoutingInput;

export interface AudioWorkspaceEffectInput {
  readonly id: string;
  readonly kind: AudioEffectKind;
  readonly enabled?: boolean;
  readonly parameters?: Readonly<Record<string, number>>;
}

export interface AudioWorkspaceEffectChainInput {
  readonly trackId: string;
  readonly effects: readonly AudioEffect[];
}

export interface AudioWorkspaceMasterInput {
  readonly gainDb?: number;
  readonly limiterEnabled?: boolean;
  readonly limiterCeilingDb?: number;
  readonly bypass?: boolean;
  readonly effectIds?: readonly string[];
  readonly effects?: readonly AudioEffect[];
}

export interface AudioWorkspaceSessionOptions {
  readonly projectId: string;
  readonly name: string;
  readonly createdAt: string;
  readonly framesPerSecond: number;
  readonly tempoBpm: number;
  readonly ppq?: number;
  readonly instrumentIds?: readonly string[];
  readonly notes?: readonly AudioWorkspaceNoteInput[];
  readonly assetCatalog?: AudioAssetCatalog;
}

export interface AudioWorkspaceSession {
  readonly schemaVersion: typeof AUDIO200_UI_SCHEMA_VERSION;
  readonly project: AudioProject;
  readonly journal: AudioJournalState;
  /** UI/animation clock; it is intentionally not Project authority. */
  readonly framesPerSecond: number;
  readonly ppq: number;
  readonly assetCatalog: AudioAssetCatalog;
}

export interface AudioWorkspaceMutation {
  readonly commandId: string;
  readonly idempotencyKey?: string;
  readonly issuedAt?: string;
}

export interface AudioWorkspaceClipInput {
  readonly id: string;
  readonly trackId: string;
  readonly revisionId: string;
  /** Compatibility projection; canonical Tick fields take precedence. */
  readonly startFrame: number;
  readonly durationFrames: number;
  /** Optional canonical placement used by Tick-native range edits. */
  readonly startTick?: AudioTick;
  readonly durationTick?: AudioTick;
  readonly sourceOffsetUs: number;
  readonly gainDb?: number;
  readonly fadeInFrames?: number;
  readonly fadeOutFrames?: number;
  readonly fadeInTick?: AudioTick;
  readonly fadeOutTick?: AudioTick;
  readonly loop?: boolean;
  /** 0.25 = half speed, 2 = double speed; omitted means original speed. */
  readonly playbackRate?: number;
}

/** A selected musical bar; Tick fields are the canonical range. */
export interface AudioWorkspaceTimelineBarInput {
  readonly startFrame?: number;
  readonly durationFrames?: number;
  readonly startTick?: AudioTick;
  readonly durationTick?: AudioTick;
}

function fail<T>(
  code: Audio200Diagnostic["code"],
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<T> {
  return audioFail(code, message, path, recoverable);
}

function boundedRate(
  value: number,
  min: number,
  max: number,
): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const result = Math.trunc(value);
  return result >= min && result <= max ? result : undefined;
}

function normalizeInstrument(value: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const token = trimmed.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 128);
  return SAFE_TOKEN.test(token) ? token : undefined;
}

function trackIdForInstrument(instrument: string): AudioTrack["trackId"] {
  return audioInstrumentTrackId(instrument);
}

function workspaceTrackForId(
  project: AudioProject,
  value: string,
): AudioTrack | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const exact = project.tracks.find((track) => track.trackId === value);
  if (exact !== undefined) return exact;
  const instrument = normalizeInstrument(value);
  if (instrument === undefined) return undefined;
  return project.tracks.find((track) =>
    track.trackId === trackIdForInstrument(instrument)
  );
}

function workspaceMixerValue(
  input: AudioWorkspaceMixerChannelInput,
): Audio200Result<{ readonly gainMilliDb: number; readonly panMilli: number }> {
  if (
    !Number.isFinite(input.gainDb) || input.gainDb < -120 ||
    input.gainDb > 24
  ) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Workspace mixer gain must be between -120 and +24 dB.",
      "mixer.gainDb",
    );
  }
  if (!Number.isFinite(input.pan) || input.pan < -1 || input.pan > 1) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Workspace mixer pan must be between -1 and +1.",
      "mixer.pan",
    );
  }
  if (typeof input.muted !== "boolean" || typeof input.solo !== "boolean") {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Workspace mixer mute/solo state must be boolean.",
      "mixer.state",
    );
  }
  return audioOk({
    gainMilliDb: Math.round(input.gainDb * 1_000),
    panMilli: Math.round(input.pan * 1_000),
  });
}

function channelIdForInstrument(
  instrument: string,
): AudioTrack["mixerChannelId"] {
  return asAudioMixerChannelId(
    `channel:instrument:${instrument.toLowerCase()}`,
  );
}

function workspaceNoteToCanonical(
  input: AudioWorkspaceNoteInput,
  framesPerSecond: number,
  tempoBpm: number,
  ppq: number,
): Audio200Result<import("./contracts.ts").AudioNote> {
  const instrument = normalizeInstrument(input.instrument);
  if (instrument === undefined) {
    return fail(
      "AUDIO_INVALID_NOTE",
      "Workspace note instrument is invalid.",
      "note.instrument",
    );
  }
  if (typeof input.id !== "string" || !SAFE_TOKEN.test(input.id)) {
    return fail(
      "AUDIO_INVALID_NOTE",
      "Workspace note ID is invalid.",
      "note.id",
    );
  }
  if (
    !Number.isSafeInteger(input.pitchMidi) || input.pitchMidi < 0 ||
    input.pitchMidi > 127
  ) {
    return fail(
      "AUDIO_INVALID_NOTE",
      "Workspace note pitch is outside MIDI range.",
      "note.pitchMidi",
    );
  }
  if (
    !Number.isFinite(input.velocity) || input.velocity < 0 || input.velocity > 1
  ) {
    return fail(
      "AUDIO_INVALID_NOTE",
      "Workspace note velocity is invalid.",
      "note.velocity",
    );
  }
  const clock = {
    framesPerSecond,
    tempoMilliBpm: tempoBpm * 1_000,
    ticksPerQuarter: ppq,
  };
  let startTick: AudioTick;
  let durationTick: AudioTick;
  try {
    const hasCanonicalTicks = Number.isSafeInteger(input.startTick) &&
      Number.isSafeInteger(input.durationTick) &&
      input.startTick !== undefined && input.durationTick !== undefined &&
      input.startTick >= 0 && input.durationTick >= 1;
    if (hasCanonicalTicks) {
      startTick = input.startTick as AudioTick;
      durationTick = input.durationTick as AudioTick;
    } else {
      const startFrame = input.startFrame;
      const durationFrames = input.durationFrames;
      if (
        typeof startFrame !== "number" ||
        !Number.isSafeInteger(startFrame) || startFrame < 0
      ) {
        return fail(
          "AUDIO_INVALID_NOTE",
          "Workspace note needs canonical ticks or a valid start frame.",
          "note.startTick",
        );
      }
      if (
        typeof durationFrames !== "number" ||
        !Number.isSafeInteger(durationFrames) || durationFrames < 1
      ) {
        return fail(
          "AUDIO_INVALID_NOTE",
          "Workspace note needs canonical ticks or a valid duration.",
          "note.durationTick",
        );
      }
      const endTick = audioFrameToTick(
        startFrame + durationFrames,
        clock,
      );
      startTick = audioFrameToTick(startFrame, clock);
      durationTick = Math.max(1, endTick - startTick) as AudioTick;
    }
  } catch {
    return fail(
      "AUDIO_OVERFLOW",
      "Workspace note frame range exceeds the canonical Audio tick range.",
      "note.timeline",
    );
  }
  return audioOk({
    noteId: asAudioNoteId(input.id),
    trackId: trackIdForInstrument(instrument),
    pitchMidi: input.pitchMidi,
    timeline: { startTick, durationTick },
    velocityMilli: Math.max(
      0,
      Math.min(1_000, Math.round(input.velocity * 1_000)),
    ),
  });
}

function workspaceClipToCanonical(
  input: AudioWorkspaceClipInput,
  session: Pick<AudioWorkspaceSession, "project" | "framesPerSecond" | "ppq">,
): Audio200Result<AudioClip> {
  if (typeof input.id !== "string" || !SAFE_TOKEN.test(input.id)) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Workspace Clip ID is invalid.",
      "clip.id",
    );
  }
  const track = workspaceTrackForId(session.project, input.trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Workspace Clip Track does not resolve.",
      "clip.trackId",
    );
  }
  let revisionId: ReturnType<typeof asAudioRevisionId>;
  try {
    revisionId = asAudioRevisionId(input.revisionId);
  } catch {
    return fail(
      "AUDIO_INVALID_REVISION",
      "Workspace Clip Revision ID is invalid.",
      "clip.revisionId",
    );
  }
  const revision = session.project.revisions.find((item) =>
    item.revisionId === revisionId
  );
  if (revision === undefined) {
    return fail(
      "AUDIO_REVISION_NOT_FOUND",
      "Workspace Clip Revision does not resolve.",
      "clip.revisionId",
    );
  }
  if (
    !Number.isSafeInteger(input.sourceOffsetUs) || input.sourceOffsetUs < 0 ||
    input.sourceOffsetUs >= revision.source.metadata.durationUs
  ) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Workspace Clip timing or source offset is invalid.",
      "clip.timeline",
    );
  }
  const gainDb = input.gainDb ?? 0;
  if (!Number.isFinite(gainDb) || gainDb < -120 || gainDb > 24) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Workspace Clip gain is outside -120..+24 dB.",
      "clip.gainDb",
    );
  }
  const playbackRate = input.playbackRate ?? 1;
  if (
    !Number.isFinite(playbackRate) || playbackRate < 0.25 || playbackRate > 4
  ) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Workspace Clip playback rate must be between 0.25 and 4.",
      "clip.playbackRate",
    );
  }
  const clock = audioClockForProject(
    session.project,
    session.framesPerSecond,
  );
  let startTick: AudioTick;
  let durationTick: AudioTick;
  let fadeInTick: AudioTick;
  let fadeOutTick: AudioTick;
  try {
    const hasCanonicalTimeline = Number.isSafeInteger(input.startTick) &&
      Number.isSafeInteger(input.durationTick) &&
      input.startTick !== undefined &&
      input.durationTick !== undefined && input.startTick >= 0 &&
      input.durationTick >= 1;
    if (hasCanonicalTimeline) {
      startTick = input.startTick as AudioTick;
      durationTick = input.durationTick as AudioTick;
    } else {
      if (
        !Number.isSafeInteger(input.startFrame) ||
        input.startFrame === undefined || input.startFrame < 0 ||
        !Number.isSafeInteger(input.durationFrames) ||
        input.durationFrames === undefined || input.durationFrames < 1
      ) {
        return fail(
          "AUDIO_INVALID_CLIP",
          "Workspace Clip needs canonical ticks or a valid frame projection.",
          "clip.timeline",
        );
      }
      startTick = audioFrameToTick(input.startFrame, clock);
      const endTick = audioFrameToTick(
        input.startFrame + input.durationFrames,
        clock,
      );
      durationTick = Math.max(1, endTick - startTick) as AudioTick;
    }
    const hasCanonicalFades = Number.isSafeInteger(input.fadeInTick) &&
      Number.isSafeInteger(input.fadeOutTick) &&
      input.fadeInTick !== undefined && input.fadeOutTick !== undefined &&
      input.fadeInTick >= 0 && input.fadeOutTick >= 0;
    if (hasCanonicalFades) {
      fadeInTick = input.fadeInTick as AudioTick;
      fadeOutTick = input.fadeOutTick as AudioTick;
    } else {
      const fadeInFrames = input.fadeInFrames ?? 0;
      const fadeOutFrames = input.fadeOutFrames ?? 0;
      if (
        !Number.isSafeInteger(fadeInFrames) || fadeInFrames < 0 ||
        !Number.isSafeInteger(fadeOutFrames) || fadeOutFrames < 0
      ) throw new RangeError("Invalid fade projection");
      fadeInTick = audioFrameToTick(fadeInFrames, clock);
      fadeOutTick = audioFrameToTick(fadeOutFrames, clock);
    }
    if (fadeInTick + fadeOutTick > durationTick) {
      return fail(
        "AUDIO_INVALID_CLIP",
        "Clip fade ranges exceed the Clip duration.",
        "clip.fade",
      );
    }
  } catch {
    return fail(
      "AUDIO_OVERFLOW",
      "Workspace Clip timing exceeds the canonical tick range.",
      "clip.timeline",
    );
  }
  return audioOk({
    clipId: asAudioClipId(input.id),
    trackId: track.trackId,
    revisionId,
    timeline: {
      startTick,
      durationTick,
    },
    sourceOffsetUs: input.sourceOffsetUs,
    gainMilliDb: Math.round(gainDb * 1_000),
    fadeInTick,
    fadeOutTick,
    loop: input.loop ?? false,
    ...(playbackRate === 1 ? {} : { playbackRate }),
  });
}

function canonicalClipToWorkspaceInput(
  session: AudioWorkspaceSession,
  clip: AudioClip,
  startFrameOverride?: number,
): Audio200Result<AudioWorkspaceClipInput> {
  const clock = audioClockForProject(
    session.project,
    session.framesPerSecond,
  );
  const startFrame = startFrameOverride ?? audioTickToFrame(
    clip.timeline.startTick,
    clock,
  );
  const startTick = startFrameOverride === undefined
    ? clip.timeline.startTick
    : audioFrameToTick(startFrame, clock);
  const durationFrames = Math.max(
    1,
    audioTickToFrame(clip.timeline.durationTick, clock),
  );
  const fadeInFrames = Math.max(
    0,
    audioTickToFrame(clip.fadeInTick, clock),
  );
  const fadeOutFrames = Math.max(
    0,
    audioTickToFrame(clip.fadeOutTick, clock),
  );
  return audioOk({
    id: clip.clipId,
    trackId: clip.trackId,
    revisionId: clip.revisionId,
    startFrame,
    durationFrames,
    startTick,
    durationTick: clip.timeline.durationTick,
    sourceOffsetUs: clip.sourceOffsetUs,
    gainDb: clip.gainMilliDb / 1_000,
    fadeInFrames,
    fadeOutFrames,
    fadeInTick: clip.fadeInTick,
    fadeOutTick: clip.fadeOutTick,
    loop: clip.loop,
    playbackRate: clip.playbackRate ?? 1,
  });
}

function commandMeta(
  session: AudioWorkspaceSession,
  mutation: AudioWorkspaceMutation,
): Audio200Result<
  Pick<AudioCommandInput, "commandId" | "idempotencyKey" | "issuedAt">
> {
  if (
    typeof mutation.commandId !== "string" ||
    !SAFE_TOKEN.test(mutation.commandId)
  ) {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Workspace mutation command ID is invalid.",
      "mutation.commandId",
    );
  }
  const idempotencyKey = mutation.idempotencyKey ?? mutation.commandId;
  if (
    typeof idempotencyKey !== "string" || idempotencyKey.length === 0 ||
    idempotencyKey.length > 256
  ) {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Workspace mutation idempotency key is invalid.",
      "mutation.idempotencyKey",
    );
  }
  const issuedAt = mutation.issuedAt ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(issuedAt))) {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Workspace mutation timestamp is invalid.",
      "mutation.issuedAt",
    );
  }
  try {
    return audioOk({
      commandId: asAudioCommandId(mutation.commandId),
      idempotencyKey,
      issuedAt,
    });
  } catch {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Workspace mutation command ID is invalid.",
      "mutation.commandId",
    );
  }
}

function withJournal(
  session: AudioWorkspaceSession,
  journal: AudioJournalState,
): AudioWorkspaceSession {
  return { ...session, project: journal.project, journal };
}

/** Keep the metadata-only Asset catalog aligned after Undo/Redo transitions. */
function reconcileWorkspaceAssetCatalog(
  session: AudioWorkspaceSession,
): AudioWorkspaceSession {
  let catalog = createAudioAssetCatalog();
  const sourceNames = new Map(
    session.assetCatalog.assets.map((asset) => [
      String(asset.assetId),
      asset.sourceName,
    ]),
  );
  // Undo leaves the original command in the Journal while the metadata-only
  // catalog is intentionally projected from the current Project.  Recover
  // recorded-take names from that immutable command so Redo/reload does not
  // degrade the source label to an Asset ID.
  for (const entry of session.journal.entries) {
    if (
      entry.command.type === "RECORDING_COMMIT" &&
      "recording" in entry.command.payload
    ) {
      const recording = entry.command.payload.recording;
      sourceNames.set(
        String(recording.revision.assetId),
        recording.sourceName,
      );
    }
  }
  for (const revision of session.project.revisions) {
    const appended = appendAudioAssetRevision(
      catalog,
      revision,
      sourceNames.get(String(revision.assetId)) ?? String(revision.assetId),
    );
    if (appended.ok) catalog = appended.value;
  }
  return { ...session, assetCatalog: catalog };
}

async function applyBootstrapCommand(
  project: AudioProject,
  type: AudioCommandType,
  payload: AudioCommandPayload,
  index: number,
): Promise<Audio200Result<AudioProject>> {
  const command = createAudioCommand({
    commandId: asAudioCommandId(`audio-workspace:bootstrap:${index}`),
    idempotencyKey: `audio-workspace:bootstrap:${index}`,
    projectId: project.projectId,
    baseProjectRevision: project.projectRevision,
    type,
    payload,
    issuedAt: "1970-01-01T00:00:00.000Z",
  });
  if (!command.ok) return command;
  return applyAudioCommand(project, command.value);
}

/** Build an in-memory canonical Project and an empty Journal baseline. */
export async function createAudioWorkspaceSession(
  options: AudioWorkspaceSessionOptions,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const fps = boundedRate(options.framesPerSecond, MIN_FPS, MAX_FPS);
  const bpm = boundedRate(options.tempoBpm, MIN_BPM, MAX_BPM);
  const ppq = boundedRate(options.ppq ?? AUDIO200_DEFAULT_PPQ, 24, 3_840);
  if (fps === undefined) {
    return fail(
      "AUDIO_UI_INVALID",
      "Workspace frame rate is outside 1–240 FPS.",
      "framesPerSecond",
    );
  }
  if (bpm === undefined) {
    return fail(
      "AUDIO_INVALID_NUMBER",
      "Workspace tempo is outside 20–300 BPM.",
      "tempoBpm",
    );
  }
  if (ppq === undefined) {
    return fail(
      "AUDIO_INVALID_NUMBER",
      "Workspace PPQ is outside the supported range.",
      "ppq",
    );
  }
  if (typeof options.name !== "string" || options.name.trim().length === 0) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Workspace Project name is required.",
      "name",
    );
  }
  if (!Number.isFinite(Date.parse(options.createdAt))) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Workspace Project timestamp is invalid.",
      "createdAt",
    );
  }
  let projectResult: Awaited<ReturnType<typeof createAudioProject>>;
  try {
    projectResult = await createAudioProject({
      projectId: asAudioProjectId(options.projectId),
      name: options.name,
      createdAt: options.createdAt,
      tempo: { milliBpm: bpm * 1_000 },
      timebase: { kind: "PPQ", ticksPerQuarter: ppq },
    });
  } catch {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Workspace Project ID is invalid.",
      "projectId",
    );
  }
  if (!projectResult.ok) return projectResult;

  const notes = options.notes ?? [];
  const assetCatalog = options.assetCatalog ?? createAudioAssetCatalog();
  const validAssetCatalog = validateAudioAssetCatalog(assetCatalog);
  if (!validAssetCatalog.ok) return validAssetCatalog;
  const instruments = new Set<string>();
  for (const value of options.instrumentIds ?? []) {
    const instrument = normalizeInstrument(value);
    if (instrument !== undefined) instruments.add(instrument);
  }
  for (const note of notes) {
    const instrument = normalizeInstrument(note.instrument);
    if (instrument !== undefined) instruments.add(instrument);
  }
  if (instruments.size > MAX_INSTRUMENTS) {
    return fail(
      "AUDIO_OVERFLOW",
      "Workspace instrument count exceeds the safe limit.",
      "instrumentIds",
    );
  }

  let sequence = 0;
  for (const instrument of instruments) {
    const track: AudioTrack = {
      trackId: trackIdForInstrument(instrument),
      kind: "INSTRUMENT",
      name: instrument,
      clipIds: [],
      noteIds: [],
      automationIds: [],
      effectIds: [],
      mixerChannelId: channelIdForInstrument(instrument),
      muted: false,
      solo: false,
    };
    projectResult = await applyBootstrapCommand(
      projectResult.value,
      "TRACK_ADD",
      { track },
      sequence++,
    );
    if (!projectResult.ok) return projectResult;
  }
  const noteIds = new Set<string>();
  for (const input of notes) {
    const note = workspaceNoteToCanonical(input, fps, bpm, ppq);
    if (!note.ok) return note;
    if (noteIds.has(note.value.noteId)) {
      return fail(
        "AUDIO_DUPLICATE_ID",
        "Workspace note IDs must be unique.",
        "notes",
      );
    }
    noteIds.add(note.value.noteId);
    if (!instruments.has(normalizeInstrument(input.instrument) ?? "")) {
      return fail(
        "AUDIO_INVALID_NOTE",
        "Workspace note instrument has no canonical Track.",
        "note.instrument",
      );
    }
    projectResult = await applyBootstrapCommand(
      projectResult.value,
      "NOTE_UPSERT",
      { note: note.value },
      sequence++,
    );
    if (!projectResult.ok) return projectResult;
  }
  const journal = await createAudioJournal(projectResult.value);
  if (!journal.ok) return journal;
  return audioOk({
    schemaVersion: AUDIO200_UI_SCHEMA_VERSION,
    project: projectResult.value,
    journal: journal.value,
    framesPerSecond: fps,
    ppq,
    assetCatalog: validAssetCatalog.value,
  });
}

async function dispatchWorkspaceCommand(
  session: AudioWorkspaceSession,
  mutation: AudioWorkspaceMutation,
  type: AudioCommandType,
  payload: AudioCommandPayload,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const meta = commandMeta(session, mutation);
  if (!meta.ok) return meta;
  const result = await dispatchAudioCommand(session.journal, {
    ...meta.value,
    projectId: session.project.projectId,
    baseProjectRevision: session.project.projectRevision,
    type,
    payload,
  });
  return result.ok
    ? audioOk(withJournal(session, result.value), result.diagnostics)
    : result;
}

export interface AudioWorkspaceTrackInput {
  readonly id: string;
  readonly kind?: AudioTrackKind;
  readonly name?: string;
}

export async function journalWorkspaceTrackAdd(
  session: AudioWorkspaceSession,
  input: AudioWorkspaceTrackInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  try {
    const trackId = asAudioTrackId(input.id);
    const mixerChannelId = asAudioMixerChannelId(
      String(trackId) + ":mixer",
    );
    if (session.project.tracks.some((track) => track.trackId === trackId)) {
      return fail(
        "AUDIO_DUPLICATE_ID",
        "Workspace Track ID already exists.",
        "track.id",
      );
    }
    const track: AudioTrack = {
      trackId,
      kind: input.kind ?? "AUDIO",
      name: input.name?.trim() || String(trackId),
      clipIds: [],
      noteIds: [],
      automationIds: [],
      effectIds: [],
      mixerChannelId,
      muted: false,
      solo: false,
    };
    return dispatchWorkspaceCommand(session, mutation, "TRACK_ADD", { track });
  } catch {
    return fail(
      "AUDIO_INVALID_ID",
      "Workspace Track ID is invalid.",
      "track.id",
    );
  }
}

export async function journalWorkspaceTrackRemove(
  session: AudioWorkspaceSession,
  trackId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const track = workspaceTrackForId(session.project, trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_INVALID_TRACK",
      "Workspace Track ID does not resolve to a canonical Track.",
      "trackId",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "TRACK_REMOVE", {
    trackId: track.trackId,
  });
}

/** Atomically upsert Effect records and bind their ordered chain to a Track. */
export async function journalWorkspaceEffectChain(
  session: AudioWorkspaceSession,
  input: AudioWorkspaceEffectChainInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const track = workspaceTrackForId(session.project, input.trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_INVALID_EFFECT",
      "Effect chain Track ID does not resolve to a canonical Track.",
      "effectChain.trackId",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "EFFECT_CHAIN_REPLACE", {
    effectChain: { trackId: track.trackId, effects: input.effects },
  });
}

/** Upsert one Effect and append it to the selected Track chain when needed. */
export async function journalWorkspaceEffectUpsert(
  session: AudioWorkspaceSession,
  trackId: string,
  input: AudioWorkspaceEffectInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const track = workspaceTrackForId(session.project, trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_INVALID_EFFECT",
      "Effect Track ID does not resolve to a canonical Track.",
      "effect.trackId",
    );
  }
  let effectId: ReturnType<typeof asAudioEffectId>;
  try {
    effectId = asAudioEffectId(input.id);
  } catch {
    return fail("AUDIO_INVALID_ID", "Effect ID is invalid.", "effect.id");
  }
  const parameters = Object.entries(input.parameters ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => ({ name, value }));
  const effect: AudioEffect = {
    effectId,
    kind: input.kind,
    enabled: input.enabled ?? true,
    parameters,
  };
  const effects = track.effectIds
    .map((id) => session.project.effects.find((item) => item.effectId === id))
    .filter((item): item is AudioEffect => item !== undefined)
    .filter((item) => item.effectId !== effectId);
  effects.push(effect);
  return journalWorkspaceEffectChain(
    session,
    { trackId: track.trackId, effects },
    mutation,
  );
}

/** Reorder an existing chain without changing its Effect records. */
export async function journalWorkspaceEffectReorder(
  session: AudioWorkspaceSession,
  trackId: string,
  effectIds: readonly string[],
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const track = workspaceTrackForId(session.project, trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_INVALID_EFFECT",
      "Effect Track ID does not resolve.",
      "trackId",
    );
  }
  const effects: AudioEffect[] = [];
  for (const id of effectIds) {
    const effect = session.project.effects.find((item) =>
      String(item.effectId) === id
    );
    if (effect === undefined || !track.effectIds.includes(effect.effectId)) {
      return fail(
        "AUDIO_INVALID_EFFECT",
        "Effect reorder references a missing chain Effect.",
        "effectIds",
      );
    }
    effects.push(effect);
  }
  if (
    new Set(effectIds).size !== effectIds.length ||
    effects.length !== track.effectIds.length
  ) {
    return fail(
      "AUDIO_INVALID_EFFECT",
      "Effect reorder must preserve the complete chain.",
      "effectIds",
    );
  }
  return journalWorkspaceEffectChain(session, {
    trackId: track.trackId,
    effects,
  }, mutation);
}

/** Journal the canonical Master gain/limiter/bypass and ordered FX chain. */
export async function journalWorkspaceMasterReplace(
  session: AudioWorkspaceSession,
  input: AudioWorkspaceMasterInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const current: AudioMasterState = session.project.master ?? {
    gainMilliDb: 0,
    limiterEnabled: false,
    limiterCeilingMilliDb: -1_000,
    bypass: false,
    effectIds: [],
  };
  const gainDb = input.gainDb ?? current.gainMilliDb / 1_000;
  const ceilingDb = input.limiterCeilingDb ??
    current.limiterCeilingMilliDb / 1_000;
  if (
    !Number.isFinite(gainDb) || gainDb < -120 || gainDb > 24 ||
    !Number.isFinite(ceilingDb) || ceilingDb < -120 || ceilingDb > 0
  ) {
    return fail(
      "AUDIO_INVALID_NUMBER",
      "Master gain and limiter ceiling must be bounded dB values.",
      "master",
    );
  }
  const effectIds = input.effectIds ?? current.effectIds.map(String);
  const effects = input.effects ?? [];
  const canonicalEffects: AudioEffect[] = [];
  for (const effect of effects) {
    try {
      canonicalEffects.push({
        ...effect,
        effectId: asAudioEffectId(String(effect.effectId)),
        parameters: [...effect.parameters].sort((left, right) =>
          left.name.localeCompare(right.name)
        ),
      });
    } catch {
      return fail(
        "AUDIO_INVALID_ID",
        "Master Effect ID is invalid.",
        "master.effects",
      );
    }
  }
  const knownIds = new Set(
    session.project.effects.map((effect) => String(effect.effectId)),
  );
  for (const effect of canonicalEffects) knownIds.add(String(effect.effectId));
  if (
    new Set(effectIds).size !== effectIds.length ||
    effectIds.some((effectId) => !knownIds.has(effectId))
  ) {
    return fail(
      "AUDIO_INVALID_EFFECT",
      "Master FX chain must reference canonical Effect records.",
      "master.effectIds",
    );
  }
  const master: AudioMasterState = {
    gainMilliDb: Math.round(gainDb * 1_000),
    limiterEnabled: input.limiterEnabled ?? current.limiterEnabled,
    limiterCeilingMilliDb: Math.round(ceilingDb * 1_000),
    bypass: input.bypass ?? current.bypass,
    effectIds: effectIds.map((effectId) => asAudioEffectId(effectId)),
  };
  return dispatchWorkspaceCommand(session, mutation, "MASTER_REPLACE", {
    master: { master, effects: canonicalEffects },
  });
}

export async function journalWorkspaceNoteUpsert(
  session: AudioWorkspaceSession,
  note: AudioWorkspaceNoteInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const canonical = workspaceNoteToCanonical(
    note,
    session.framesPerSecond,
    session.project.tempo.milliBpm / 1_000,
    session.ppq,
  );
  if (!canonical.ok) return canonical;
  const track = session.project.tracks.find((item) =>
    item.trackId === canonical.value.trackId
  );
  if (track === undefined) {
    return fail(
      "AUDIO_INVALID_NOTE",
      "Workspace note instrument has no canonical Track.",
      "note.instrument",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "NOTE_UPSERT", {
    note: canonical.value,
  });
}

export async function journalWorkspaceNoteRemove(
  session: AudioWorkspaceSession,
  noteId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  try {
    return dispatchWorkspaceCommand(session, mutation, "NOTE_REMOVE", {
      noteId: asAudioNoteId(noteId),
    });
  } catch {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Workspace note ID is invalid.",
      "noteId",
    );
  }
}

/** Journal one canonical Automation curve without exposing runtime AudioParams. */
export async function journalWorkspaceAutomationUpsert(
  session: AudioWorkspaceSession,
  automation: AudioAutomation,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  try {
    const canonical: AudioAutomation = {
      ...automation,
      automationId: asAudioAutomationId(String(automation.automationId)),
      target: { ...automation.target },
      points: automation.points.map((point) => ({ ...point })),
    };
    return dispatchWorkspaceCommand(session, mutation, "AUTOMATION_UPSERT", {
      automation: canonical,
    });
  } catch {
    return fail(
      "AUDIO_INVALID_AUTOMATION",
      "Workspace Automation ID or curve is invalid.",
      "automation",
    );
  }
}

export async function journalWorkspaceAutomationRemove(
  session: AudioWorkspaceSession,
  automationId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  try {
    return dispatchWorkspaceCommand(session, mutation, "AUTOMATION_REMOVE", {
      automationId: asAudioAutomationId(automationId),
    });
  } catch {
    return fail(
      "AUDIO_INVALID_AUTOMATION",
      "Workspace Automation ID is invalid.",
      "automationId",
    );
  }
}

/** Attach immutable source metadata through the Project Journal and catalog. */
export async function journalWorkspaceAssetRevision(
  session: AudioWorkspaceSession,
  revision: AudioRevision,
  sourceName: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const catalog = appendAudioAssetRevision(
    session.assetCatalog,
    revision,
    sourceName,
  );
  if (!catalog.ok) return catalog;
  const attached = await dispatchWorkspaceCommand(
    session,
    mutation,
    "REVISION_ATTACH",
    { revision },
  );
  if (!attached.ok) return attached;
  return audioOk(
    { ...attached.value, assetCatalog: catalog.value },
    attached.diagnostics,
  );
}

/**
 * Commit a recorded source, its metadata-only Asset catalog entry, and the
 * first Timeline Clip in one canonical Journal command. Recording progress
 * never enters the Journal; only this completed take does.
 */
export async function journalWorkspaceRecordingCommit(
  session: AudioWorkspaceSession,
  revision: AudioRevision,
  sourceName: string,
  clip: AudioWorkspaceClipInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const catalog = appendAudioAssetRevision(
    session.assetCatalog,
    revision,
    sourceName,
  );
  if (!catalog.ok) return catalog;
  // The revision and Clip are one atomic command, so validate the Clip
  // against a read-only projection that contains the not-yet-committed
  // revision.  The live Project is changed only by RECORDING_COMMIT below.
  const canonicalClip = workspaceClipToCanonical(clip, {
    ...session,
    project: {
      ...session.project,
      revisions: [...session.project.revisions, revision],
    },
  });
  if (!canonicalClip.ok) return canonicalClip;
  const recording: AudioRecordingCommitPayload = {
    revision,
    clip: canonicalClip.value,
    sourceName: sourceName.trim(),
  };
  const committed = await dispatchWorkspaceCommand(
    session,
    mutation,
    "RECORDING_COMMIT",
    { recording },
  );
  if (!committed.ok) return committed;
  return audioOk(
    { ...committed.value, assetCatalog: catalog.value },
    committed.diagnostics,
  );
}

/** Commit a non-destructive Bounce artifact and its first Timeline Clip. */
export async function journalWorkspaceBounceInPlace(
  session: AudioWorkspaceSession,
  revision: AudioRevision,
  sourceName: string,
  clip: AudioWorkspaceClipInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const catalog = appendAudioAssetRevision(
    session.assetCatalog,
    revision,
    sourceName,
  );
  if (!catalog.ok) return catalog;
  const canonicalClip = workspaceClipToCanonical(clip, {
    ...session,
    project: {
      ...session.project,
      revisions: [...session.project.revisions, revision],
    },
  });
  if (!canonicalClip.ok) return canonicalClip;
  const bounce = {
    revision,
    clip: canonicalClip.value,
    sourceName: sourceName.trim(),
  };
  const committed = await dispatchWorkspaceCommand(
    session,
    mutation,
    "BOUNCE_COMMIT",
    { bounce },
  );
  if (!committed.ok) return committed;
  return audioOk(
    { ...committed.value, assetCatalog: catalog.value },
    committed.diagnostics,
  );
}

/** Atomically attach a pre-mixer Freeze Revision/Clip and activate it. */
export async function journalWorkspaceFreezeCommit(
  session: AudioWorkspaceSession,
  revision: AudioRevision,
  sourceName: string,
  clip: AudioWorkspaceClipInput,
  sourceStateHash: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  let hash: ReturnType<typeof asAudioContentHash>;
  try {
    hash = asAudioContentHash(sourceStateHash);
  } catch {
    return fail(
      "AUDIO_FREEZE_INVALID",
      "Freeze source fingerprint must be a SHA-256 hash.",
      "freeze.sourceStateHash",
    );
  }
  const track = workspaceTrackForId(session.project, clip.trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_FREEZE_INVALID",
      "Freeze Track does not resolve to a canonical Track.",
      "freeze.trackId",
    );
  }
  const catalog = appendAudioAssetRevision(
    session.assetCatalog,
    revision,
    sourceName,
  );
  if (!catalog.ok) return catalog;
  const canonicalClip = workspaceClipToCanonical(clip, {
    ...session,
    project: {
      ...session.project,
      revisions: [...session.project.revisions, revision],
    },
  });
  if (!canonicalClip.ok) return canonicalClip;
  const freeze: AudioFreezeState = {
    trackId: track.trackId,
    frozenRevisionId: revision.revisionId,
    frozenClipId: canonicalClip.value.clipId,
    sourceStateHash: hash,
    sourceProjectRevision: session.project.projectRevision,
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };
  const payload: AudioFreezeCommitPayload = {
    freeze,
    revision,
    clip: canonicalClip.value,
    sourceName: sourceName.trim(),
  };
  const committed = await dispatchWorkspaceCommand(
    session,
    mutation,
    "FREEZE_COMMIT",
    { freeze: payload },
  );
  if (!committed.ok) return committed;
  return audioOk(
    { ...committed.value, assetCatalog: catalog.value },
    committed.diagnostics,
  );
}

/** Toggle the canonical active Freeze off without deleting its source bytes. */
export async function journalWorkspaceUnfreeze(
  session: AudioWorkspaceSession,
  trackId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  let canonicalTrackId: ReturnType<typeof asAudioTrackId>;
  try {
    const track = workspaceTrackForId(session.project, trackId);
    if (track === undefined) throw new Error("Track not found");
    canonicalTrackId = track.trackId;
  } catch {
    return fail(
      "AUDIO_FREEZE_INVALID",
      "Unfreeze Track does not resolve to a canonical Track.",
      "freeze.trackId",
    );
  }
  return dispatchWorkspaceCommand(
    session,
    mutation,
    "FREEZE_UNFREEZE",
    { freezeTrackId: canonicalTrackId },
  );
}

/** Reuse an existing inactive Freeze artifact without writing another OPFS file. */
export async function journalWorkspaceFreezeReactivate(
  session: AudioWorkspaceSession,
  trackId: string,
  sourceStateHash: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  let canonicalTrackId: ReturnType<typeof asAudioTrackId>;
  let hash: ReturnType<typeof asAudioContentHash>;
  try {
    const track = workspaceTrackForId(session.project, trackId);
    if (track === undefined) throw new Error("Track not found");
    canonicalTrackId = track.trackId;
    hash = asAudioContentHash(sourceStateHash);
  } catch {
    return fail(
      "AUDIO_FREEZE_STALE",
      "Freeze reactivation requires a canonical Track and source fingerprint.",
      "freeze.sourceStateHash",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "FREEZE_REACTIVATE", {
    freezeTrackId: canonicalTrackId,
    freezeSourceStateHash: hash,
  });
}

export async function journalWorkspaceClipAdd(
  session: AudioWorkspaceSession,
  clip: AudioWorkspaceClipInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const canonical = workspaceClipToCanonical(clip, session);
  if (!canonical.ok) return canonical;
  return dispatchWorkspaceCommand(session, mutation, "CLIP_ADD", {
    clip: canonical.value,
  });
}

export async function journalWorkspaceClipUpdate(
  session: AudioWorkspaceSession,
  clip: AudioWorkspaceClipInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const canonical = workspaceClipToCanonical(clip, session);
  if (!canonical.ok) return canonical;
  return dispatchWorkspaceCommand(session, mutation, "CLIP_UPDATE", {
    clip: canonical.value,
  });
}

/**
 * Split one Clip into two non-destructive Clips in a single Journal command.
 * The immutable Revision is shared; only timeline/source-offset metadata is
 * changed.  Fade envelopes stay anchored to the outside edges of the source
 * Clip, so a middle split does not introduce an unintended dip at the seam.
 */
export async function journalWorkspaceClipSplitAtTick(
  session: AudioWorkspaceSession,
  clipId: string,
  splitTick: AudioTick,
  leftClipId: string,
  rightClipId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  let sourceId: ReturnType<typeof asAudioClipId>;
  try {
    sourceId = asAudioClipId(clipId);
  } catch {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Source Clip ID is invalid.",
      "clipId",
    );
  }
  if (
    !Number.isSafeInteger(splitTick) || splitTick < 1 ||
    typeof leftClipId !== "string" || !SAFE_TOKEN.test(leftClipId) ||
    typeof rightClipId !== "string" || !SAFE_TOKEN.test(rightClipId) ||
    leftClipId === rightClipId || leftClipId === clipId ||
    rightClipId === clipId
  ) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Tick split requires bounded position and distinct replacement IDs.",
      "splitTick",
    );
  }
  const source = session.project.clips.find((clip) => clip.clipId === sourceId);
  if (source === undefined) {
    return fail("AUDIO_INVALID_CLIP", "Source Clip does not exist.", "clipId");
  }
  const sourceStart = source.timeline.startTick;
  const sourceEnd = sourceStart + source.timeline.durationTick;
  if (splitTick <= sourceStart || splitTick >= sourceEnd) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Tick split must be strictly inside the Clip timeline.",
      "splitTick",
    );
  }
  const leftDuration = (splitTick - sourceStart) as AudioTick;
  const rightDuration = (sourceEnd - splitTick) as AudioTick;
  const sourceOffsetDelta = Math.round(
    audioTickToSeconds(
      splitTick - sourceStart,
      audioClockForProject(
        session.project,
        session.framesPerSecond,
      ),
    ) * 1_000_000,
  );
  const rightSourceOffsetUs = source.sourceOffsetUs + sourceOffsetDelta;
  if (!Number.isSafeInteger(rightSourceOffsetUs)) {
    return fail(
      "AUDIO_OVERFLOW",
      "Split source offset exceeds the safe integer range.",
      "sourceOffsetUs",
    );
  }
  const leftClip: AudioClip = {
    ...source,
    clipId: asAudioClipId(leftClipId),
    timeline: { startTick: sourceStart, durationTick: leftDuration },
    fadeInTick: Math.min(source.fadeInTick, leftDuration) as AudioTick,
    fadeOutTick: 0 as AudioTick,
  };
  const rightClip: AudioClip = {
    ...source,
    clipId: asAudioClipId(rightClipId),
    timeline: { startTick: splitTick, durationTick: rightDuration },
    sourceOffsetUs: rightSourceOffsetUs,
    fadeInTick: 0 as AudioTick,
    fadeOutTick: Math.min(source.fadeOutTick, rightDuration) as AudioTick,
  };
  const payload: AudioClipSplitPayload = {
    sourceClipId: sourceId,
    leftClip,
    rightClip,
  };
  return dispatchWorkspaceCommand(session, mutation, "CLIP_SPLIT", {
    clipSplit: payload,
  });
}

export async function journalWorkspaceClipSplit(
  session: AudioWorkspaceSession,
  clipId: string,
  splitFrame: number,
  leftClipId: string,
  rightClipId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  let sourceId: ReturnType<typeof asAudioClipId>;
  try {
    sourceId = asAudioClipId(clipId);
  } catch {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Source Clip ID is invalid.",
      "clipId",
    );
  }
  if (
    typeof leftClipId !== "string" || !SAFE_TOKEN.test(leftClipId) ||
    typeof rightClipId !== "string" || !SAFE_TOKEN.test(rightClipId) ||
    leftClipId === rightClipId || leftClipId === clipId ||
    rightClipId === clipId
  ) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Split replacement Clip IDs must be distinct stable identifiers.",
      "clipIds",
    );
  }
  if (!Number.isSafeInteger(splitFrame) || splitFrame < 1) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Split frame must be a positive integer inside the Clip.",
      "splitFrame",
    );
  }
  const source = session.project.clips.find((clip) => clip.clipId === sourceId);
  if (source === undefined) {
    return fail("AUDIO_INVALID_CLIP", "Source Clip does not exist.", "clipId");
  }
  const input = canonicalClipToWorkspaceInput(session, source);
  if (!input.ok) return input;
  if (splitFrame >= input.value.durationFrames) {
    return fail(
      "AUDIO_INVALID_CLIP",
      "Split frame must be before the Clip end.",
      "splitFrame",
    );
  }
  const sourceOffsetDelta = Math.round(
    (splitFrame * 1_000_000) / session.framesPerSecond,
  );
  if (!Number.isSafeInteger(sourceOffsetDelta)) {
    return fail(
      "AUDIO_OVERFLOW",
      "Split source offset exceeds the safe integer range.",
      "sourceOffsetUs",
    );
  }
  const rightSourceOffsetUs = input.value.sourceOffsetUs + sourceOffsetDelta;
  if (!Number.isSafeInteger(rightSourceOffsetUs)) {
    return fail(
      "AUDIO_OVERFLOW",
      "Split source offset exceeds the safe integer range.",
      "sourceOffsetUs",
    );
  }
  const leftDuration = splitFrame;
  const rightDuration = input.value.durationFrames - splitFrame;
  // This is the legacy frame-split entry point. Drop the canonical Tick
  // projection before rebuilding the two frame-derived halves; the public
  // Tick-native split above is the exact path for new edits.
  const {
    startTick: _sourceStartTick,
    durationTick: _sourceDurationTick,
    fadeInTick: _sourceFadeInTick,
    fadeOutTick: _sourceFadeOutTick,
    ...frameInput
  } = input.value;
  void _sourceStartTick;
  void _sourceDurationTick;
  void _sourceFadeInTick;
  void _sourceFadeOutTick;
  const left = workspaceClipToCanonical({
    ...frameInput,
    id: leftClipId,
    durationFrames: leftDuration,
    fadeInFrames: Math.min(input.value.fadeInFrames ?? 0, leftDuration),
    fadeOutFrames: 0,
  }, session);
  if (!left.ok) return left;
  const right = workspaceClipToCanonical({
    ...frameInput,
    id: rightClipId,
    startFrame: input.value.startFrame + splitFrame,
    durationFrames: rightDuration,
    sourceOffsetUs: rightSourceOffsetUs,
    fadeInFrames: 0,
    fadeOutFrames: Math.min(input.value.fadeOutFrames ?? 0, rightDuration),
  }, session);
  if (!right.ok) return right;
  return dispatchWorkspaceCommand(session, mutation, "CLIP_SPLIT", {
    clipSplit: {
      sourceClipId: sourceId,
      leftClip: left.value,
      rightClip: right.value,
    },
  });
}

export async function journalWorkspaceClipRemove(
  session: AudioWorkspaceSession,
  clipId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  try {
    return dispatchWorkspaceCommand(session, mutation, "CLIP_REMOVE", {
      clipId: asAudioClipId(clipId),
    });
  } catch {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Workspace Clip ID is invalid.",
      "clipId",
    );
  }
}

/**
 * Clear one selected bar without rippling later content. The canonical
 * command applies the Tick range to notes, clips, automation, and markers;
 * boundary-crossing notes/clips are trimmed in place.
 */
export async function journalWorkspaceTimelineBarClear(
  session: AudioWorkspaceSession,
  input: AudioWorkspaceTimelineBarInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const clock = audioClockForProject(
    session.project,
    session.framesPerSecond,
  );
  let startTick: AudioTick;
  let durationTick: AudioTick;
  try {
    if (
      Number.isSafeInteger(input.startTick) &&
      Number.isSafeInteger(input.durationTick) &&
      input.startTick !== undefined && input.durationTick !== undefined &&
      input.startTick >= 0 && input.durationTick >= 1
    ) {
      startTick = input.startTick as AudioTick;
      durationTick = input.durationTick as AudioTick;
    } else if (
      Number.isSafeInteger(input.startFrame) &&
      input.startFrame !== undefined &&
      input.startFrame >= 0 && Number.isSafeInteger(input.durationFrames) &&
      input.durationFrames !== undefined && input.durationFrames >= 1
    ) {
      startTick = audioFrameToTick(input.startFrame, clock);
      const endTick = audioFrameToTick(
        input.startFrame + input.durationFrames,
        clock,
      );
      durationTick = Math.max(1, endTick - startTick) as AudioTick;
    } else {
      return fail(
        "AUDIO_INVALID_NUMBER",
        "Timeline bar range needs canonical ticks or a valid frame range.",
        "timelineBar",
      );
    }
  } catch {
    return fail(
      "AUDIO_OVERFLOW",
      "Timeline bar frame range exceeds the canonical Audio tick range.",
      "timelineBar",
    );
  }
  if (durationTick < 1) {
    return fail(
      "AUDIO_OVERFLOW",
      "Timeline bar frame range exceeds the canonical Audio tick range.",
      "timelineBar",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "TIMELINE_BAR_CLEAR", {
    timelineBar: {
      startTick,
      durationTick,
    },
  });
}

export async function journalWorkspaceClipDuplicate(
  session: AudioWorkspaceSession,
  clipId: string,
  newClipId: string,
  startFrame: number | undefined,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  let canonicalId: ReturnType<typeof asAudioClipId>;
  try {
    canonicalId = asAudioClipId(clipId);
  } catch {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Source Clip ID is invalid.",
      "clipId",
    );
  }
  const source = session.project.clips.find((clip) =>
    clip.clipId === canonicalId
  );
  if (source === undefined) {
    return fail("AUDIO_INVALID_CLIP", "Source Clip does not exist.", "clipId");
  }
  const input = canonicalClipToWorkspaceInput(session, source, startFrame);
  if (!input.ok) return input;
  return journalWorkspaceClipAdd(
    session,
    { ...input.value, id: newClipId },
    mutation,
  );
}

export async function journalWorkspaceTempo(
  session: AudioWorkspaceSession,
  tempoBpm: number,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const bpm = boundedRate(tempoBpm, MIN_BPM, MAX_BPM);
  if (bpm === undefined) {
    return fail(
      "AUDIO_INVALID_NUMBER",
      "Workspace tempo is outside 20–300 BPM.",
      "tempoBpm",
    );
  }
  const tempo: AudioTempo = { milliBpm: bpm * 1_000 };
  return dispatchWorkspaceCommand(session, mutation, "TEMPO_SET", { tempo });
}

/** Persist the Drum Roll sound profile without touching note geometry. */
export async function journalWorkspaceDrumKitSet(
  session: AudioWorkspaceSession,
  drumKitId: AudioDrumKitId,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  if (!isAudioDrumKitId(drumKitId)) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Workspace drum kit is not supported.",
      "drumKitId",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "DRUM_KIT_SET", {
    drumKitId,
  });
}

/** Persist the Inspector's deterministic, scalar voice controls. */
export async function journalWorkspaceSynthPresetReplace(
  session: AudioWorkspaceSession,
  synthPreset: AudioSynthPreset,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  if (
    !SAFE_TOKEN.test(synthPreset.presetId) ||
    !SAFE_TOKEN.test(synthPreset.instrumentId) ||
    !SAFE_TOKEN.test(synthPreset.baseVoiceId) ||
    synthPreset.name.trim().length === 0
  ) {
    return fail(
      "AUDIO_INVALID_ID",
      "Workspace synth preset identity is invalid.",
      "synthPreset",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "SYNTH_PRESET_REPLACE", {
    synthPreset,
  });
}

/** Remove one saved custom voice and fall back to the modeled instrument. */
export async function journalWorkspaceSynthPresetRemove(
  session: AudioWorkspaceSession,
  synthPresetId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  if (!SAFE_TOKEN.test(synthPresetId)) {
    return fail(
      "AUDIO_INVALID_ID",
      "Workspace synth preset ID is invalid.",
      "synthPresetId",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "SYNTH_PRESET_REMOVE", {
    synthPresetId,
  });
}

/** Journal one Tick-native UI marker with a frame compatibility projection. */
export async function journalWorkspaceMarkerUpsert(
  session: AudioWorkspaceSession,
  input: AudioWorkspaceMarkerInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const markerId = typeof input.id === "string" ? input.id.trim() : "";
  const frameId = typeof input.frameId === "string"
    ? input.frameId.trim()
    : `tick:${Math.max(0, Math.trunc(input.tick ?? input.frame ?? 0))}`;
  const label = typeof input.label === "string" ? input.label.trim() : "";
  if (!SAFE_TOKEN.test(markerId)) {
    return fail(
      "AUDIO_INVALID_ID",
      "Workspace marker ID is invalid.",
      "marker.id",
    );
  }
  if (!SAFE_TOKEN.test(frameId)) {
    return fail(
      "AUDIO_INVALID_ID",
      "Workspace marker frame ID is invalid.",
      "marker.frameId",
    );
  }
  if (!label || label.length > 256) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Workspace marker label is empty or too long.",
      "marker.label",
    );
  }
  let tick: AudioTick;
  try {
    if (
      Number.isSafeInteger(input.tick) && input.tick !== undefined &&
      input.tick >= 0
    ) {
      tick = input.tick;
    } else if (
      Number.isSafeInteger(input.frame) && input.frame !== undefined &&
      input.frame >= 0
    ) {
      tick = audioFrameToTick(
        input.frame,
        audioClockForProject(session.project, session.framesPerSecond),
      );
    } else {
      return fail(
        "AUDIO_INVALID_NUMBER",
        "Workspace marker needs a canonical tick or valid frame.",
        "marker.tick",
      );
    }
  } catch {
    return fail(
      "AUDIO_OVERFLOW",
      "Workspace marker frame exceeds the canonical Audio tick range.",
      "marker.tick",
    );
  }
  const marker: AudioMarker = { markerId, frameId, tick, label };
  return dispatchWorkspaceCommand(session, mutation, "MARKER_UPSERT", {
    marker,
  });
}

export async function journalWorkspaceMarkerRemove(
  session: AudioWorkspaceSession,
  markerId: string,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const normalized = typeof markerId === "string" ? markerId.trim() : "";
  if (!SAFE_TOKEN.test(normalized)) {
    return fail(
      "AUDIO_INVALID_ID",
      "Workspace marker ID is invalid.",
      "markerId",
    );
  }
  return dispatchWorkspaceCommand(session, mutation, "MARKER_REMOVE", {
    markerId: normalized,
  });
}

/**
 * Journal one mixer channel as a single canonical command.  The UI may use a
 * short track key (for example `bgm`) while the Project uses the stable
 * `instrument:bgm` Track ID; both forms resolve to the canonical Track here.
 */
export async function journalWorkspaceMixerChannel(
  session: AudioWorkspaceSession,
  input: AudioWorkspaceMixerChannelInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const track = workspaceTrackForId(session.project, input.trackId);
  if (track === undefined) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Workspace mixer Track ID does not resolve to a canonical Track.",
      "mixer.trackId",
    );
  }
  const values = workspaceMixerValue(input);
  if (!values.ok) return values;
  const channel = session.project.mixer.channels.find((item) =>
    item.channelId === track.mixerChannelId || item.trackId === track.trackId
  );
  if (channel === undefined) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Workspace Track does not resolve to a canonical Mixer channel.",
      "mixer.channelId",
    );
  }
  const mixer: AudioMixer = {
    ...session.project.mixer,
    channels: session.project.mixer.channels.map((item) =>
      item.channelId === channel.channelId
        ? {
          ...item,
          trackId: track.trackId,
          gainMilliDb: values.value.gainMilliDb,
          panMilli: values.value.panMilli,
          muted: input.muted,
          solo: input.solo,
        }
        : item
    ),
  };
  return dispatchWorkspaceCommand(session, mutation, "MIXER_REPLACE", {
    mixer,
  });
}

/** Atomically update a Track output and/or the complete Send list. */
export async function journalWorkspaceRouting(
  session: AudioWorkspaceSession,
  input: AudioWorkspaceRoutingInput,
  mutation: AudioWorkspaceMutation,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const sourceTrack = workspaceTrackForId(session.project, input.trackId);
  if (sourceTrack === undefined) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Workspace routing source Track ID does not resolve.",
      "routing.trackId",
    );
  }
  const channel = session.project.mixer.channels.find((item) =>
    item.trackId === sourceTrack.trackId
  );
  if (channel === undefined) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Workspace routing source has no canonical Mixer channel.",
      "routing.trackId",
    );
  }
  let outputTrackId = channel.outputTrackId;
  if (input.outputTrackId !== undefined) {
    if (input.outputTrackId === null) {
      outputTrackId = undefined;
    } else {
      const destination = workspaceTrackForId(
        session.project,
        input.outputTrackId,
      );
      if (
        destination === undefined ||
        !["BUS", "RETURN"].includes(destination.kind)
      ) {
        return fail(
          "AUDIO_INVALID_MIXER",
          "Routing output must target an existing Bus or Return Track.",
          "routing.outputTrackId",
        );
      }
      outputTrackId = destination.trackId;
    }
  }
  const updatedChannels = session.project.mixer.channels.map((item) => {
    if (item.channelId !== channel.channelId) return item;
    if (outputTrackId === undefined) {
      const { outputTrackId: _outputTrackId, ...withoutOutput } = item;
      return withoutOutput;
    }
    return { ...item, outputTrackId };
  });
  let sends = session.project.mixer.sends;
  if (input.sends !== undefined) {
    const canonical: AudioMixerSend[] = [];
    for (const send of input.sends) {
      const sendSource = workspaceTrackForId(
        session.project,
        send.sourceTrackId,
      );
      const destination = workspaceTrackForId(
        session.project,
        send.destinationTrackId,
      );
      if (
        sendSource === undefined || destination === undefined ||
        !["BUS", "RETURN"].includes(destination.kind) ||
        !Number.isFinite(send.amountDb) || send.amountDb < -120 ||
        send.amountDb > 24 ||
        typeof send.preFader !== "boolean"
      ) {
        return fail(
          "AUDIO_INVALID_MIXER",
          "Workspace Send fields are invalid.",
          "routing.sends",
        );
      }
      try {
        canonical.push({
          sendId: asAudioMixerSendId(send.id),
          sourceTrackId: sendSource.trackId,
          destinationTrackId: destination.trackId,
          amountMilliDb: Math.round(send.amountDb * 1_000),
          preFader: send.preFader,
        });
      } catch {
        return fail(
          "AUDIO_INVALID_ID",
          "Workspace Send ID is invalid.",
          "routing.sends.id",
        );
      }
    }
    sends = canonical;
  }
  const mixer: AudioMixer = {
    ...session.project.mixer,
    channels: updatedChannels,
    ...(sends === undefined ? {} : { sends }),
  };
  return dispatchWorkspaceCommand(session, mutation, "MIXER_REPLACE", {
    mixer,
  });
}

/** Alias retained for callers that name the operation after the Mixer. */
export const journalWorkspaceMixerRouting = journalWorkspaceRouting;

/** Update the UI frame clock without turning Draw/animation timing into a Project command. */
export function setWorkspaceFrameRate(
  session: AudioWorkspaceSession,
  framesPerSecond: number,
): Audio200Result<AudioWorkspaceSession> {
  const fps = boundedRate(framesPerSecond, MIN_FPS, MAX_FPS);
  if (fps === undefined) {
    return fail(
      "AUDIO_UI_INVALID",
      "Workspace frame rate is outside 1–240 FPS.",
      "framesPerSecond",
    );
  }
  return audioOk({ ...session, framesPerSecond: fps });
}

export async function undoWorkspaceAudio(
  session: AudioWorkspaceSession,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const result = await undoAudio(session.journal);
  return result.ok
    ? audioOk(
      reconcileWorkspaceAssetCatalog(withJournal(session, result.value)),
      result.diagnostics,
    )
    : result;
}

export async function redoWorkspaceAudio(
  session: AudioWorkspaceSession,
): Promise<Audio200Result<AudioWorkspaceSession>> {
  const result = await redoAudio(session.journal);
  return result.ok
    ? audioOk(
      reconcileWorkspaceAssetCatalog(withJournal(session, result.value)),
      result.diagnostics,
    )
    : result;
}

export async function checkpointWorkspaceAudio(
  session: AudioWorkspaceSession,
  checkpointId: string,
  createdAt: string,
): Promise<Audio200Result<import("./contracts.ts").AudioCheckpoint>> {
  try {
    return createAudioCheckpoint(
      session.journal,
      checkpointId as import("./contracts.ts").AudioCheckpoint["checkpointId"],
      createdAt,
    );
  } catch {
    return fail(
      "AUDIO_CHECKPOINT_INVALID",
      "Workspace checkpoint ID is invalid.",
      "checkpointId",
    );
  }
}

/** Return the journal entries that carry actual Project edits. */
export function workspaceJournalEntries(
  session: AudioWorkspaceSession,
): readonly AudioJournalEntry[] {
  return session.journal.entries;
}
