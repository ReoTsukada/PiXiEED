/** Canonical, host-neutral Audio Project state and command application. */

import { hashCanonical } from "../../wp160-contracts.ts";
import {
  asAudioContentHash,
  AUDIO200_SCHEMA_VERSION,
  type Audio200Diagnostic,
  type Audio200Result,
  type AudioAutomation,
  type AudioBounceCommitPayload,
  type AudioClip,
  type AudioCommand,
  type AudioCommandPayload,
  type AudioCommandType,
  type AudioEffect,
  audioFail,
  type AudioFreezeCommitPayload,
  type AudioFreezeState,
  type AudioMarker,
  type AudioMasterPayload,
  type AudioMasterState,
  type AudioMixer,
  type AudioNote,
  audioOk,
  type AudioProject,
  type AudioRevision,
  type AudioSynthPreset,
  type AudioTempo,
  type AudioTick,
  type AudioTimelineBarClearPayload,
  type AudioTrack,
  canonicalAudioMaterial,
  hasRawAudioPayload,
  isAudioChipMachineId,
  isAudioDrumKitId,
  isSafeInteger,
} from "./contracts.ts";
import { buildAudioRoutingGraph } from "../audio-310/routing.ts";

export const AUDIO200_MAX_TICK = 9_000_000_000;
export const AUDIO200_MAX_PROJECT_REVISION = 1_000_000_000;
export const AUDIO200_DEFAULT_PPQ = 480;
export const AUDIO200_DEFAULT_TEMPO_MILLIBPM = 120_000;

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;
const MAX_TEXT = 256;
const COMMAND_TYPES: readonly AudioCommandType[] = [
  "TRACK_ADD",
  "TRACK_REMOVE",
  "REVISION_ATTACH",
  "CLIP_ADD",
  "CLIP_UPDATE",
  "CLIP_SPLIT",
  "CLIP_REMOVE",
  "NOTE_REMOVE",
  "NOTE_UPSERT",
  "AUTOMATION_UPSERT",
  "AUTOMATION_REMOVE",
  "MIXER_REPLACE",
  "EFFECT_UPSERT",
  "EFFECT_CHAIN_REPLACE",
  "MASTER_REPLACE",
  "DRUM_KIT_SET",
  "CHIP_MACHINE_SET",
  "SYNTH_PRESET_REPLACE",
  "SYNTH_PRESET_REMOVE",
  "TEMPO_SET",
  "MARKER_UPSERT",
  "MARKER_REMOVE",
  "RECORDING_COMMIT",
  "BOUNCE_COMMIT",
  "FREEZE_COMMIT",
  "FREEZE_UNFREEZE",
  "FREEZE_REACTIVATE",
  "TIMELINE_BAR_CLEAR",
];

function fail(
  code: Audio200Diagnostic["code"],
  message: string,
  path: string,
  recoverable = false,
): Audio200Result<never> {
  return audioFail(code, message, path, recoverable);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && SAFE_ID.test(value);
}

function text(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return isSafeInteger(value) && value >= min && value <= max;
}

function boundedNumber(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return finite(value) && value >= min && value <= max;
}

function unique(
  values: readonly unknown[],
  path: string,
): Audio200Diagnostic | null {
  const seen = new Set<unknown>();
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) {
      return {
        code: "AUDIO_DUPLICATE_ID",
        message: "Duplicate canonical identifier is not allowed.",
        path: `${path}[${index}]`,
        recoverable: false,
      };
    }
    seen.add(value);
  }
  return null;
}

function ids(
  values: readonly { readonly [key: string]: unknown }[],
  key: string,
  path: string,
): Audio200Diagnostic | null {
  const valuesById = values.map((value) => value[key]);
  if (valuesById.some((value) => !validId(value))) {
    return {
      code: "AUDIO_INVALID_ID",
      message: "Canonical identifiers must be bounded stable identifiers.",
      path,
      recoverable: false,
    };
  }
  return unique(valuesById, path);
}

function validTimeRange(
  range: unknown,
  path: string,
): Audio200Diagnostic | null {
  if (range === null || typeof range !== "object") {
    return {
      code: "AUDIO_INVALID_NUMBER",
      message: "Timeline range must be an object.",
      path,
      recoverable: false,
    };
  }
  const candidate = range as Record<string, unknown>;
  if (
    !boundedInteger(candidate.startTick, 0, AUDIO200_MAX_TICK) ||
    !boundedInteger(candidate.durationTick, 1, AUDIO200_MAX_TICK)
  ) {
    return {
      code: "AUDIO_INVALID_NUMBER",
      message: "Timeline ticks must be bounded safe integers.",
      path,
      recoverable: false,
    };
  }
  if (candidate.startTick + candidate.durationTick > AUDIO200_MAX_TICK) {
    return {
      code: "AUDIO_OVERFLOW",
      message: "Timeline end exceeds the safe AUDIO-200 tick range.",
      path,
      recoverable: false,
    };
  }
  return null;
}

function validateRevision(
  revision: unknown,
  path: string,
): Audio200Diagnostic | null {
  if (revision === null || typeof revision !== "object") {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision must be an object.",
      path,
      recoverable: false,
    };
  }
  const value = revision as Record<string, unknown>;
  const source = value.source as Record<string, unknown> | null;
  const locator = source?.locator as Record<string, unknown> | null;
  const metadata = source?.metadata as Record<string, unknown> | null;
  if (
    value.schemaVersion !== "AUDIO-200_V1" ||
    value.metadataAuthority !== "AUDIO-200_CANONICAL_METADATA_V1" ||
    value.verified !== true
  ) {
    return {
      code: "AUDIO_UNSUPPORTED_SCHEMA",
      message: "Revision schema or metadata authority is not canonical.",
      path,
      recoverable: false,
    };
  }
  if (![value.assetId, value.revisionId, source?.blobId].every(validId)) {
    return {
      code: "AUDIO_INVALID_ID",
      message: "Revision identifiers are invalid.",
      path,
      recoverable: false,
    };
  }
  if (!boundedInteger(value.revisionNumber, 1, AUDIO200_MAX_PROJECT_REVISION)) {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision number is invalid.",
      path,
      recoverable: false,
    };
  }
  if (value.kind !== "CLIP" && value.kind !== "SONG") {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision kind is invalid.",
      path,
      recoverable: false,
    };
  }
  if (
    !["LIVE", "PINNED", "REVIEW", "FORKED"].includes(
      value.referenceMode as string,
    )
  ) {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision reference mode is invalid.",
      path,
      recoverable: false,
    };
  }
  if (
    locator === null || locator.namespace !== "audio" ||
    typeof locator.relativePath !== "string" ||
    locator.relativePath.includes("..") ||
    locator.relativePath.startsWith("/") ||
    locator.relativePath.includes("\\") || locator.relativePath.includes("://")
  ) {
    return {
      code: "AUDIO_PATH_TRAVERSAL",
      message: "Revision source locator is not a safe relative audio path.",
      path: `${path}.source.locator.relativePath`,
      recoverable: false,
    };
  }
  if (
    metadata === null ||
    !["WAV_PCM", "WAV_IEEE_FLOAT"].includes(metadata.codec as string) ||
    metadata.mimeType !== "audio/wav"
  ) {
    return {
      code: "AUDIO_UNSUPPORTED_CODEC",
      message: "Revision source codec is outside the AUDIO-200 reference set.",
      path: `${path}.source.metadata.codec`,
      recoverable: false,
    };
  }
  if (
    !boundedInteger(metadata.sampleRateHz, 8_000, 384_000) ||
    ![1, 2].includes(metadata.channels as number) ||
    ![8, 16, 24, 32].includes(metadata.bitDepth as number) ||
    !boundedInteger(metadata.sampleFrames, 1, Number.MAX_SAFE_INTEGER) ||
    !boundedInteger(metadata.durationUs, 1, Number.MAX_SAFE_INTEGER) ||
    !boundedInteger(metadata.byteLength, 1, 64 * 1024 * 1024) ||
    typeof metadata.contentHash !== "string"
  ) {
    return {
      code: "AUDIO_INVALID_SOURCE",
      message: "Revision source metadata is invalid.",
      path: `${path}.source.metadata`,
      recoverable: false,
    };
  }
  if (
    Math.floor((metadata.sampleFrames * 1_000_000) / metadata.sampleRateHz) !==
      metadata.durationUs
  ) {
    return {
      code: "AUDIO_METADATA_MISMATCH",
      message:
        "Revision duration is not derived from sample frames and sample rate.",
      path: `${path}.source.metadata.durationUs`,
      recoverable: false,
    };
  }
  try {
    asAudioContentHash(metadata.contentHash);
  } catch {
    return {
      code: "AUDIO_INVALID_SOURCE",
      message: "Revision source hash is not SHA-256.",
      path: `${path}.source.metadata.contentHash`,
      recoverable: false,
    };
  }
  if (
    locator.contentHash !== metadata.contentHash ||
    locator.byteLength !== metadata.byteLength
  ) {
    return {
      code: "AUDIO_METADATA_MISMATCH",
      message: "Source locator and metadata hash/byte length disagree.",
      path: `${path}.source`,
      recoverable: false,
    };
  }
  if (
    value.createdAt === undefined || typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  ) {
    return {
      code: "AUDIO_INVALID_REVISION",
      message: "Revision timestamp is invalid.",
      path: `${path}.createdAt`,
      recoverable: false,
    };
  }
  return null;
}

function validateTrack(
  track: unknown,
  path: string,
): Audio200Diagnostic | null {
  if (track === null || typeof track !== "object") {
    return {
      code: "AUDIO_INVALID_TRACK",
      message: "Track must be an object.",
      path,
      recoverable: false,
    };
  }
  const value = track as Record<string, unknown>;
  if (
    !validId(value.trackId) || !text(value.name) ||
    !validId(value.mixerChannelId)
  ) {
    return {
      code: "AUDIO_INVALID_TRACK",
      message: "Track identity, name, or mixer channel is invalid.",
      path,
      recoverable: false,
    };
  }
  if (
    !["AUDIO", "INSTRUMENT", "BUS", "RETURN"].includes(value.kind as string) ||
    typeof value.muted !== "boolean" || typeof value.solo !== "boolean"
  ) {
    return {
      code: "AUDIO_INVALID_TRACK",
      message: "Track kind or state is invalid.",
      path,
      recoverable: false,
    };
  }
  for (
    const [key, item] of [
      ["clipIds", value.clipIds],
      ["noteIds", value.noteIds],
      ["automationIds", value.automationIds],
      ["effectIds", value.effectIds],
    ] as const
  ) {
    if (
      !Array.isArray(item) || item.some((id) => !validId(id)) ||
      unique(item, `${path}.${key}`) !== null
    ) {
      return {
        code: "AUDIO_INVALID_TRACK",
        message: "Track child identifiers are invalid or duplicated.",
        path: `${path}.${key}`,
        recoverable: false,
      };
    }
  }
  return null;
}

const AUDIO_SYNTH_WAVEFORMS = [
  "pulse",
  "triangle",
  "sawtooth",
  "sine",
  "noise",
] as const;
const AUDIO_SYNTH_FILTER_TYPES = ["lowpass", "highpass", "bandpass"] as const;
const AUDIO_SYNTH_NOISE_COLORS = ["white", "pink"] as const;

function validateSynthPreset(
  preset: unknown,
  path: string,
): Audio200Diagnostic | null {
  if (preset === null || typeof preset !== "object") {
    return {
      code: "AUDIO_INVALID_PROJECT",
      message: "Synth preset must be an object.",
      path,
      recoverable: false,
    };
  }
  const value = preset as Record<string, unknown>;
  if (
    !validId(value.presetId) || !validId(value.instrumentId) ||
    !validId(value.baseVoiceId) || !text(value.name, 128) ||
    !AUDIO_SYNTH_WAVEFORMS.includes(
      value.waveform as typeof AUDIO_SYNTH_WAVEFORMS[number],
    ) ||
    !AUDIO_SYNTH_FILTER_TYPES.includes(
      value.filterType as typeof AUDIO_SYNTH_FILTER_TYPES[number],
    ) ||
    !AUDIO_SYNTH_NOISE_COLORS.includes(
      value.noiseColor as typeof AUDIO_SYNTH_NOISE_COLORS[number],
    )
  ) {
    return {
      code: "AUDIO_INVALID_PROJECT",
      message: "Synth preset identity or enum fields are invalid.",
      path,
      recoverable: false,
    };
  }
  const boundedFields: readonly [string, unknown, number, number][] = [
    ["dutyCycle", value.dutyCycle, 0.01, 0.99],
    ["attackMs", value.attackMs, 0, 5_000],
    ["decayMs", value.decayMs, 1, 10_000],
    ["sustain", value.sustain, 0, 1],
    ["releaseMs", value.releaseMs, 1, 10_000],
    ["filterFrequencyHz", value.filterFrequencyHz, 20, 20_000],
    ["filterQ", value.filterQ, 0.1, 18],
    ["transientLevel", value.transientLevel, 0, 1],
    ["transientMs", value.transientMs, 0, 1_000],
    ["pitchStartRatio", value.pitchStartRatio, 1, 16],
    ["pitchSweepMs", value.pitchSweepMs, 0, 1_000],
    ["vibratoDepthCents", value.vibratoDepthCents, 0, 40],
    ["vibratoRateHz", value.vibratoRateHz, 0.5, 16],
  ];
  if (
    boundedFields.some(([, field, min, max]) => !boundedNumber(field, min, max))
  ) {
    return {
      code: "AUDIO_INVALID_NUMBER",
      message: "Synth preset parameters are outside their safe ranges.",
      path,
      recoverable: false,
    };
  }
  return null;
}

function validateProjectShape(project: unknown): Audio200Result<true> {
  if (
    project === null || typeof project !== "object" || Array.isArray(project)
  ) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Project must be a canonical object.",
      "project",
    );
  }
  if (hasRawAudioPayload(project)) {
    return fail(
      "AUDIO_RAW_PAYLOAD_REJECTED",
      "Canonical Project metadata cannot contain raw audio payload fields.",
      "project",
    );
  }
  const value = project as Record<string, unknown>;
  if (
    value.schemaVersion !== "AUDIO-200_V1" || !validId(value.projectId) ||
    !text(value.name) || value.projectRevision === undefined ||
    !boundedInteger(value.projectRevision, 0, AUDIO200_MAX_PROJECT_REVISION)
  ) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Project identity, schema, name, or revision is invalid.",
      "project",
    );
  }
  if (
    value.createdAt === undefined || typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  ) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Project timestamp is invalid.",
      "project.createdAt",
    );
  }
  if (
    value.tempo === null || typeof value.tempo !== "object" ||
    !boundedInteger(
      (value.tempo as Record<string, unknown>).milliBpm,
      20_000,
      300_000,
    )
  ) {
    return fail(
      "AUDIO_INVALID_NUMBER",
      "Tempo must be a bounded fixed-point BPM value.",
      "project.tempo",
    );
  }
  if (
    value.timebase === null || typeof value.timebase !== "object" ||
    (value.timebase as Record<string, unknown>).kind !== "PPQ" ||
    !boundedInteger(
      (value.timebase as Record<string, unknown>).ticksPerQuarter,
      24,
      3_840,
    )
  ) {
    return fail(
      "AUDIO_INVALID_NUMBER",
      "Timebase must use a bounded PPQ value.",
      "project.timebase",
    );
  }
  if (value.drumKitId !== undefined && !isAudioDrumKitId(value.drumKitId)) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Drum kit identifier is not supported.",
      "project.drumKitId",
    );
  }
  if (
    value.chipMachineId !== undefined &&
    !isAudioChipMachineId(value.chipMachineId)
  ) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Chip machine identifier is not supported.",
      "project.chipMachineId",
    );
  }
  if (value.synthPresets !== undefined && !Array.isArray(value.synthPresets)) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Project synthPresets must be an array when present.",
      "project.synthPresets",
    );
  }
  const synthPresets = (value.synthPresets ?? []) as readonly unknown[];
  const synthPresetIds = synthPresets.map((item) =>
    (item as Record<string, unknown> | null)?.presetId
  );
  if (
    synthPresetIds.some((id) => !validId(id)) ||
    unique(synthPresetIds, "project.synthPresets") !== null
  ) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Synth preset identifiers are invalid or duplicated.",
      "project.synthPresets",
    );
  }
  for (const [index, preset] of synthPresets.entries()) {
    const diagnostic = validateSynthPreset(
      preset,
      `project.synthPresets[${index}]`,
    );
    if (diagnostic !== null) return { ok: false, diagnostics: [diagnostic] };
  }
  if (typeof value.stateHash !== "string") {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Project state hash is required.",
      "project.stateHash",
    );
  }
  try {
    asAudioContentHash(value.stateHash);
  } catch {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Project state hash must be SHA-256.",
      "project.stateHash",
    );
  }
  for (
    const key of [
      "revisions",
      "tracks",
      "clips",
      "notes",
      "automations",
      "effects",
      "markers",
    ] as const
  ) {
    if (!Array.isArray(value[key])) {
      return fail(
        "AUDIO_INVALID_PROJECT",
        `${key} must be an array.`,
        `project.${key}`,
      );
    }
  }
  if (value.freezeStates !== undefined && !Array.isArray(value.freezeStates)) {
    return fail(
      "AUDIO_FREEZE_INVALID",
      "Project freezeStates must be an array when present.",
      "project.freezeStates",
    );
  }
  const freezeStates = (value.freezeStates ?? []) as readonly unknown[];
  const freezeIds = freezeStates.map((item) => {
    const freeze = item as Record<string, unknown> | null;
    return `${freeze?.trackId ?? ""}:${freeze?.frozenRevisionId ?? ""}:${
      freeze?.frozenClipId ?? ""
    }`;
  });
  if (
    freezeIds.some((id) => id.length <= 2) ||
    unique(freezeIds, "project.freezeStates") !== null
  ) {
    return fail(
      "AUDIO_FREEZE_INVALID",
      "Freeze state identity is invalid or duplicated.",
      "project.freezeStates",
    );
  }
  for (const [index, item] of freezeStates.entries()) {
    const freeze = item as Record<string, unknown> | null;
    let hashValid = false;
    if (typeof freeze?.sourceStateHash === "string") {
      try {
        asAudioContentHash(freeze.sourceStateHash);
        hashValid = true;
      } catch {
        hashValid = false;
      }
    }
    if (
      freeze === null || typeof freeze !== "object" ||
      !validId(freeze.trackId) || !validId(freeze.frozenRevisionId) ||
      !validId(freeze.frozenClipId) || !hashValid ||
      !boundedInteger(
        freeze.sourceProjectRevision,
        0,
        AUDIO200_MAX_PROJECT_REVISION,
      ) ||
      !["ACTIVE", "INACTIVE", "STALE"].includes(freeze.status as string) ||
      typeof freeze.createdAt !== "string" ||
      !Number.isFinite(Date.parse(freeze.createdAt))
    ) {
      return fail(
        "AUDIO_FREEZE_INVALID",
        "Freeze state fields are invalid.",
        `project.freezeStates[${index}]`,
      );
    }
  }
  const revisions = value.revisions as readonly unknown[];
  const tracks = value.tracks as readonly unknown[];
  const clips = value.clips as readonly unknown[];
  const notes = value.notes as readonly unknown[];
  const automations = value.automations as readonly unknown[];
  const effects = value.effects as readonly unknown[];
  const duplicateGroups: readonly [string, readonly unknown[], string][] = [[
    "revisionId",
    revisions.map((item) => (item as Record<string, unknown>)?.revisionId),
    "project.revisions",
  ], [
    "trackId",
    tracks.map((item) => (item as Record<string, unknown>)?.trackId),
    "project.tracks",
  ], [
    "clipId",
    clips.map((item) => (item as Record<string, unknown>)?.clipId),
    "project.clips",
  ], [
    "noteId",
    notes.map((item) => (item as Record<string, unknown>)?.noteId),
    "project.notes",
  ], [
    "automationId",
    automations.map((item) => (item as Record<string, unknown>)?.automationId),
    "project.automations",
  ], [
    "effectId",
    effects.map((item) => (item as Record<string, unknown>)?.effectId),
    "project.effects",
  ]];
  for (const [key, group, path] of duplicateGroups) {
    if (group.some((item) => !validId(item))) {
      return fail("AUDIO_INVALID_ID", `${key} is invalid.`, path);
    }
    const duplicate = unique(group, path);
    if (duplicate !== null) return { ok: false, diagnostics: [duplicate] };
  }
  for (const [index, revision] of revisions.entries()) {
    const diagnostic = validateRevision(
      revision,
      `project.revisions[${index}]`,
    );
    if (diagnostic !== null) return { ok: false, diagnostics: [diagnostic] };
  }
  for (const [index, track] of tracks.entries()) {
    const diagnostic = validateTrack(track, `project.tracks[${index}]`);
    if (diagnostic !== null) return { ok: false, diagnostics: [diagnostic] };
  }
  for (const [index, clip] of clips.entries()) {
    const valueClip = clip as Record<string, unknown> | null;
    const diagnostic = valueClip === null || typeof valueClip !== "object" ||
        !validId(valueClip.clipId) || !validId(valueClip.trackId) ||
        !validId(valueClip.revisionId) ||
        validTimeRange(
            valueClip.timeline,
            `project.clips[${index}].timeline`,
          ) !== null ||
        !boundedInteger(valueClip.sourceOffsetUs, 0, Number.MAX_SAFE_INTEGER) ||
        !boundedInteger(valueClip.gainMilliDb, -120_000, 24_000) ||
        !boundedInteger(valueClip.fadeInTick, 0, AUDIO200_MAX_TICK) ||
        !boundedInteger(valueClip.fadeOutTick, 0, AUDIO200_MAX_TICK) ||
        typeof valueClip.loop !== "boolean" ||
        (valueClip.playbackRate !== undefined &&
          !boundedNumber(valueClip.playbackRate, 0.25, 4))
      ? {
        code: "AUDIO_INVALID_CLIP" as const,
        message: "Clip fields or timeline are invalid.",
        path: `project.clips[${index}]`,
        recoverable: false,
      }
      : null;
    if (diagnostic !== null) return { ok: false, diagnostics: [diagnostic] };
  }
  for (const [index, note] of notes.entries()) {
    const valueNote = note as Record<string, unknown> | null;
    const diagnostic = valueNote === null || typeof valueNote !== "object" ||
        !validId(valueNote.noteId) || !validId(valueNote.trackId) ||
        !boundedInteger(valueNote.pitchMidi, 0, 127) ||
        validTimeRange(
            valueNote.timeline,
            `project.notes[${index}].timeline`,
          ) !== null ||
        !boundedInteger(valueNote.velocityMilli, 0, 1_000)
      ? {
        code: "AUDIO_INVALID_NOTE" as const,
        message: "Note fields or timeline are invalid.",
        path: `project.notes[${index}]`,
        recoverable: false,
      }
      : null;
    if (diagnostic !== null) return { ok: false, diagnostics: [diagnostic] };
  }
  for (const [index, automation] of automations.entries()) {
    const valueAutomation = automation as Record<string, unknown> | null;
    const target = valueAutomation?.target as Record<string, unknown> | null;
    const points = valueAutomation?.points;
    const diagnostic =
      valueAutomation === null || typeof valueAutomation !== "object" ||
        !validId(valueAutomation.automationId) || target === null ||
        ![
          "TRACK_GAIN",
          "TRACK_PAN",
          "MIXER_CHANNEL_GAIN",
          "MIXER_CHANNEL_PAN",
          "CLIP_GAIN",
          "FILTER_CUTOFF",
          "SYNTH_PARAMETER",
          "EFFECT_PARAMETER",
        ].includes(target.kind as string) || !validId(target.targetId) ||
        (target.parameterName !== undefined &&
          !text(target.parameterName, 128)) ||
        !Array.isArray(points) || points.length === 0 ||
        points.some((point) => {
          const item = point as Record<string, unknown> | null;
          return item === null || typeof item !== "object" ||
            !boundedInteger(item.tick, 0, AUDIO200_MAX_TICK) ||
            !boundedNumber(item.value, -1_000_000, 1_000_000);
        })
        ? {
          code: "AUDIO_INVALID_AUTOMATION" as const,
          message: "Automation target or points are invalid.",
          path: `project.automations[${index}]`,
          recoverable: false,
        }
        : null;
    if (diagnostic !== null) return { ok: false, diagnostics: [diagnostic] };
  }
  const mixer = value.mixer as Record<string, unknown> | null;
  if (
    mixer === null || !validId(mixer.mixerId) ||
    !boundedInteger(mixer.masterGainMilliDb, -120_000, 24_000) ||
    !Array.isArray(mixer.channels)
  ) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Mixer fields are invalid.",
      "project.mixer",
    );
  }
  const channels = mixer.channels as readonly unknown[];
  const channelIds = channels.map((channel) =>
    (channel as Record<string, unknown>)?.channelId
  );
  const channelTrackIds = channels.map((channel) =>
    (channel as Record<string, unknown>)?.trackId
  );
  if (
    channelIds.some((id) => !validId(id)) ||
    unique(channelIds, "project.mixer.channels") !== null ||
    unique(channelTrackIds, "project.mixer.channels.trackId") !== null
  ) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Mixer channel identifiers are invalid or duplicated.",
      "project.mixer.channels",
    );
  }
  for (const [index, channel] of channels.entries()) {
    const item = channel as Record<string, unknown>;
    if (
      !validId(item.trackId) ||
      (item.outputTrackId !== undefined && !validId(item.outputTrackId)) ||
      !boundedInteger(item.panMilli, -1_000, 1_000) ||
      !boundedInteger(item.gainMilliDb, -120_000, 24_000) ||
      typeof item.muted !== "boolean" || typeof item.solo !== "boolean"
    ) {
      return fail(
        "AUDIO_INVALID_MIXER",
        "Mixer channel fields are invalid.",
        `project.mixer.channels[${index}]`,
      );
    }
  }
  if (mixer.sends !== undefined && !Array.isArray(mixer.sends)) {
    return fail(
      "AUDIO_INVALID_MIXER",
      "Mixer sends must be an array when present.",
      "project.mixer.sends",
    );
  }
  for (
    const [index, send] of ((mixer.sends ?? []) as readonly unknown[]).entries()
  ) {
    const item = send as Record<string, unknown> | null;
    if (
      item === null || typeof item !== "object" ||
      !validId(item.sendId) || !validId(item.sourceTrackId) ||
      !validId(item.destinationTrackId) ||
      !boundedInteger(item.amountMilliDb, -120_000, 24_000) ||
      typeof item.preFader !== "boolean"
    ) {
      return fail(
        "AUDIO_INVALID_MIXER",
        "Mixer Send fields are invalid.",
        `project.mixer.sends[${index}]`,
      );
    }
  }
  for (const [index, effect] of effects.entries()) {
    const item = effect as Record<string, unknown>;
    if (
      !validId(item.effectId) ||
      !["GAIN", "EQ", "COMPRESSOR", "REVERB", "DELAY", "CUSTOM"].includes(
        item.kind as string,
      ) || typeof item.enabled !== "boolean" ||
      !Array.isArray(item.parameters) ||
      (item.parameters as readonly unknown[]).some((parameter) => {
        const valueParameter = parameter as Record<string, unknown>;
        return !text(valueParameter.name, 128) ||
          !boundedNumber(valueParameter.value, -1_000_000, 1_000_000);
      })
    ) {
      return fail(
        "AUDIO_INVALID_EFFECT",
        "Effect fields or parameters are invalid.",
        `project.effects[${index}]`,
      );
    }
  }
  if (value.master !== undefined) {
    const master = value.master as Record<string, unknown> | null;
    const effectIds = master?.effectIds;
    if (
      master === null || typeof master !== "object" ||
      !boundedInteger(master.gainMilliDb, -120_000, 24_000) ||
      typeof master.limiterEnabled !== "boolean" ||
      !boundedInteger(master.limiterCeilingMilliDb, -120_000, 0) ||
      typeof master.bypass !== "boolean" || !Array.isArray(effectIds) ||
      effectIds.some((effectId) => !validId(effectId)) ||
      unique(effectIds, "project.master.effectIds") !== null
    ) {
      return fail(
        "AUDIO_INVALID_PROJECT",
        "Master state or FX chain references are invalid.",
        "project.master",
      );
    }
  }
  const markers = value.markers as readonly unknown[];
  const markerIds = markers.map((marker) =>
    (marker as Record<string, unknown>)?.markerId
  );
  if (
    markerIds.some((id) => !validId(id)) ||
    unique(markerIds, "project.markers") !== null
  ) {
    return fail(
      "AUDIO_INVALID_PROJECT",
      "Marker identifiers are invalid or duplicated.",
      "project.markers",
    );
  }
  for (const [index, marker] of markers.entries()) {
    const item = marker as Record<string, unknown>;
    if (
      !validId(item.frameId) ||
      validTimeRange(
          { startTick: item.tick, durationTick: 1 },
          `project.markers[${index}].tick`,
        ) !== null ||
      !text(item.label, 256)
    ) {
      return fail(
        "AUDIO_INVALID_PROJECT",
        "Marker fields are invalid.",
        `project.markers[${index}]`,
      );
    }
  }
  return audioOk(true);
}

export async function hashAudioProjectState(
  project: AudioProject,
): Promise<Audio200Result<ReturnType<typeof asAudioContentHash>>> {
  const { stateHash: _stateHash, ...material } = project;
  return audioOk(asAudioContentHash(await hashCanonical(material)));
}

export async function validateAudioProject(
  project: AudioProject,
  verifyHash = true,
): Promise<Audio200Result<true>> {
  const shape = validateProjectShape(project);
  if (!shape.ok) return shape;
  if (verifyHash) {
    const hash = await hashAudioProjectState(project);
    if (!hash.ok || hash.value !== project.stateHash) {
      return fail(
        "AUDIO_METADATA_MISMATCH",
        "Project state hash does not match canonical metadata.",
        "project.stateHash",
      );
    }
  }
  const revisionsById = new Set(
    project.revisions.map((revision) => revision.revisionId),
  );
  const tracksById = new Set(project.tracks.map((track) => track.trackId));
  const effectIds = new Set(project.effects.map((effect) => effect.effectId));
  const channelsById = new Set(
    project.mixer.channels.map((channel) => channel.channelId),
  );
  const channelsByChannelId = new Map(
    project.mixer.channels.map((channel) => [channel.channelId, channel]),
  );
  const revisionsByRevision = new Map(
    project.revisions.map((revision) => [revision.revisionId, revision]),
  );
  const clipsById = new Map(project.clips.map((clip) => [clip.clipId, clip]));
  const notesById = new Map(project.notes.map((note) => [note.noteId, note]));
  const automationsById = new Map(
    project.automations.map((
      automation,
    ) => [automation.automationId, automation]),
  );
  const effectsById = new Map(
    project.effects.map((effect) => [effect.effectId, effect]),
  );
  if (project.master !== undefined) {
    for (const effectId of project.master.effectIds) {
      if (!effectsById.has(effectId)) {
        return fail(
          "AUDIO_INVALID_EFFECT",
          "Master references a missing canonical Effect.",
          `master.effectIds.${String(effectId)}`,
        );
      }
    }
  }
  for (const [index, freeze] of (project.freezeStates ?? []).entries()) {
    const track = project.tracks.find((item) =>
      item.trackId === freeze.trackId
    );
    const clip = project.clips.find((item) =>
      item.clipId === freeze.frozenClipId
    );
    const revision = project.revisions.find((item) =>
      item.revisionId === freeze.frozenRevisionId
    );
    if (
      track === undefined || clip === undefined || revision === undefined ||
      clip.trackId !== freeze.trackId ||
      clip.revisionId !== freeze.frozenRevisionId ||
      !track.clipIds.includes(freeze.frozenClipId)
    ) {
      return fail(
        "AUDIO_FREEZE_INVALID",
        "Freeze state does not bind to a canonical Track, Clip, and Revision.",
        `freezeStates.${index}`,
      );
    }
  }
  for (const clip of project.clips) {
    const revision = revisionsByRevision.get(clip.revisionId);
    if (!tracksById.has(clip.trackId) || revision === undefined) {
      return fail(
        "AUDIO_REVISION_NOT_FOUND",
        "Clip references a missing Track or Revision.",
        `clips.${clip.clipId}`,
      );
    }
    if (clip.sourceOffsetUs >= revision.source.metadata.durationUs) {
      return fail(
        "AUDIO_INVALID_CLIP",
        "Clip source offset is outside the canonical source duration.",
        `clips.${clip.clipId}.sourceOffsetUs`,
      );
    }
    if (clip.timeline.durationTick < clip.fadeInTick + clip.fadeOutTick) {
      return fail(
        "AUDIO_OVERFLOW",
        "Clip fade range exceeds the clip timeline.",
        `clips.${clip.clipId}`,
      );
    }
  }
  for (const note of project.notes) {
    if (!tracksById.has(note.trackId)) {
      return fail(
        "AUDIO_INVALID_NOTE",
        "Note references a missing Track.",
        `notes.${note.noteId}`,
      );
    }
  }
  for (const automation of project.automations) {
    const targetId = automation.target.targetId;
    const targetKind = automation.target.kind;
    const targetExists = (targetKind === "TRACK_GAIN" ||
        targetKind === "TRACK_PAN" ||
        targetKind === "FILTER_CUTOFF" ||
        targetKind === "SYNTH_PARAMETER")
      ? tracksById.has(targetId as never)
      : (targetKind === "MIXER_CHANNEL_GAIN" ||
          targetKind === "MIXER_CHANNEL_PAN")
      ? channelsById.has(targetId as never)
      : targetKind === "CLIP_GAIN"
      ? clipsById.has(targetId as never)
      : targetKind === "EFFECT_PARAMETER"
      ? effectIds.has(targetId as never)
      : false;
    const parameterNameValid = targetKind === "EFFECT_PARAMETER" ||
        targetKind === "SYNTH_PARAMETER"
      ? typeof automation.target.parameterName === "string" &&
        automation.target.parameterName.trim().length > 0
      : true;
    if (!targetExists || !parameterNameValid) {
      return fail(
        "AUDIO_INVALID_AUTOMATION",
        "Automation references a missing target.",
        `automations.${automation.automationId}`,
      );
    }
  }
  for (const channel of project.mixer.channels) {
    if (!tracksById.has(channel.trackId)) {
      return fail(
        "AUDIO_INVALID_MIXER",
        "Mixer channel references a missing Track.",
        `mixer.channels.${channel.channelId}`,
      );
    }
  }
  for (const track of project.tracks) {
    if (!channelsById.has(track.mixerChannelId)) {
      return fail(
        "AUDIO_INVALID_TRACK",
        "Track references a missing Mixer channel.",
        `tracks.${track.trackId}`,
      );
    }
    const channel = channelsByChannelId.get(track.mixerChannelId);
    if (channel?.trackId !== track.trackId) {
      return fail(
        "AUDIO_INVALID_TRACK",
        "Track and Mixer channel graph bindings are inconsistent.",
        `tracks.${track.trackId}.mixerChannelId`,
      );
    }
    if (
      track.clipIds.some((id) =>
        clipsById.get(id)?.trackId !== track.trackId
      ) || track.noteIds.some((id) =>
        notesById.get(id)?.trackId !== track.trackId
      ) || track.automationIds.some((id) =>
        automationsById.has(id) === false
      ) || track.effectIds.some((id) =>
        effectsById.has(id) === false
      )
    ) {
      return fail(
        "AUDIO_INVALID_TRACK",
        "Track child references are not consistent with canonical entities.",
        `tracks.${track.trackId}`,
      );
    }
  }
  const routing = buildAudioRoutingGraph(project.mixer, project.tracks);
  if (!routing.ok) return routing;
  return audioOk(true);
}

export interface AudioProjectCreateInput {
  readonly projectId: AudioProject["projectId"];
  readonly name: string;
  readonly createdAt: string;
  readonly tempo?: AudioTempo;
  readonly timebase?: AudioProject["timebase"];
  readonly mixerId?: AudioProject["mixer"]["mixerId"];
}

export async function createAudioProject(
  input: AudioProjectCreateInput,
): Promise<Audio200Result<AudioProject>> {
  const draft = {
    schemaVersion: "AUDIO-200_V1" as const,
    projectId: input.projectId,
    name: input.name,
    createdAt: input.createdAt,
    projectRevision: 0,
    stateHash: "0".repeat(64) as AudioProject["stateHash"],
    tempo: input.tempo ?? { milliBpm: AUDIO200_DEFAULT_TEMPO_MILLIBPM },
    timebase: input.timebase ??
      { kind: "PPQ" as const, ticksPerQuarter: AUDIO200_DEFAULT_PPQ },
    drumKitId: "BASIC" as const,
    chipMachineId: "NONE" as const,
    synthPresets: [],
    revisions: [],
    tracks: [],
    clips: [],
    notes: [],
    automations: [],
    mixer: {
      mixerId: input.mixerId ??
        `${input.projectId}:mixer` as AudioProject["mixer"]["mixerId"],
      channels: [],
      masterGainMilliDb: 0,
    },
    effects: [],
    markers: [],
    master: {
      gainMilliDb: 0,
      limiterEnabled: false,
      limiterCeilingMilliDb: -1_000,
      bypass: false,
      effectIds: [],
    },
  } satisfies AudioProject;
  const shape = await validateAudioProject(draft, false);
  if (!shape.ok) return shape;
  const hash = await hashAudioProjectState(draft);
  if (!hash.ok) return hash;
  return audioOk({ ...draft, stateHash: hash.value });
}

export async function attachAudioRevision(
  project: AudioProject,
  revision: AudioRevision,
): Promise<Audio200Result<AudioProject>> {
  const current = await validateAudioProject(project);
  if (!current.ok) return current;
  if (
    project.revisions.some((item) => item.revisionId === revision.revisionId)
  ) {
    return fail(
      "AUDIO_DUPLICATE_ID",
      "Revision ID already exists in this Project.",
      "revision.revisionId",
    );
  }
  const next = {
    ...project,
    projectRevision: project.projectRevision + 1,
    revisions: [...project.revisions, revision],
  };
  const valid = await validateAudioProject(next, false);
  if (!valid.ok) return valid;
  const hash = await hashAudioProjectState(next);
  if (!hash.ok) return hash;
  return audioOk({ ...next, stateHash: hash.value });
}

export interface AudioCommandInput {
  readonly commandId: AudioCommand["commandId"];
  readonly idempotencyKey: string;
  readonly projectId: AudioProject["projectId"];
  readonly baseProjectRevision: number;
  readonly type: AudioCommandType;
  readonly payload: AudioCommandPayload;
  readonly issuedAt: string;
}

export function createAudioCommand(
  input: AudioCommandInput,
): Audio200Result<AudioCommand> {
  if (
    !validId(input.commandId) || !text(input.idempotencyKey, 256) ||
    !validId(input.projectId) ||
    !boundedInteger(
      input.baseProjectRevision,
      0,
      AUDIO200_MAX_PROJECT_REVISION,
    ) || !COMMAND_TYPES.includes(input.type) ||
    typeof input.payload !== "object" || hasRawAudioPayload(input.payload) ||
    !text(input.issuedAt, 64) || !Number.isFinite(Date.parse(input.issuedAt))
  ) {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Command identity, revision, payload, or timestamp is invalid.",
      "command",
    );
  }
  return audioOk({ schemaVersion: "AUDIO-200_V1", ...input });
}

function entityFromPayload<T>(
  payload: AudioCommandPayload,
  key: string,
): T | null {
  const value = payload as Record<string, unknown>;
  return (value[key] as T | undefined) ?? null;
}

function replaceById<T>(
  values: readonly T[],
  key: string,
  value: T,
): readonly T[] {
  const identifier = (value as unknown as Record<string, unknown>)[key];
  const index = values.findIndex((item) =>
    (item as unknown as Record<string, unknown>)[key] === identifier
  );
  if (index < 0) return [...values, value];
  return values.map((item, itemIndex) => itemIndex === index ? value : item);
}

function markActiveFreezesStale(
  project: AudioProject,
): readonly AudioFreezeState[] | undefined {
  if (project.freezeStates === undefined) return undefined;
  return project.freezeStates.map((freeze) =>
    freeze.status === "ACTIVE"
      ? { ...freeze, status: "STALE" as const }
      : freeze
  );
}

export async function applyAudioCommand(
  project: AudioProject,
  command: AudioCommand,
): Promise<Audio200Result<AudioProject>> {
  const current = await validateAudioProject(project);
  if (!current.ok) return current;
  if (command.projectId !== project.projectId) {
    return fail(
      "AUDIO_COMMAND_INVALID",
      "Command Project ID does not match the current Project.",
      "command.projectId",
    );
  }
  if (command.baseProjectRevision !== project.projectRevision) {
    return fail(
      "AUDIO_STALE_PROJECT_REVISION",
      "Command was based on a stale Project revision.",
      "command.baseProjectRevision",
    );
  }
  const payload = command.payload;
  let next: AudioProject = {
    ...project,
    projectRevision: project.projectRevision + 1,
  };
  switch (command.type) {
    case "TRACK_ADD": {
      const track = entityFromPayload<AudioTrack>(payload, "track");
      if (
        track === null ||
        project.tracks.some((item) => item.trackId === track.trackId)
      ) {
        return fail(
          "AUDIO_DUPLICATE_ID",
          "Track ID already exists or payload is invalid.",
          "command.payload.track",
        );
      }
      next = {
        ...next,
        tracks: [...project.tracks, track],
        mixer: {
          ...project.mixer,
          channels: [...project.mixer.channels, {
            channelId: track.mixerChannelId,
            trackId: track.trackId,
            panMilli: 0,
            gainMilliDb: 0,
            muted: false,
            solo: false,
          }],
        },
      };
      break;
    }
    case "TRACK_REMOVE": {
      const trackId = entityFromPayload<AudioTrack["trackId"]>(
        payload,
        "trackId",
      );
      const removed = trackId === null
        ? undefined
        : project.tracks.find((track) => track.trackId === trackId);
      if (removed === undefined) {
        return fail(
          "AUDIO_INVALID_TRACK",
          "Track removal requires an existing canonical Track.",
          "command.payload.trackId",
        );
      }
      const removedClipIds = new Set(
        project.clips.filter((clip) => clip.trackId === trackId).map((clip) =>
          String(clip.clipId)
        ),
      );
      const removedNoteIds = new Set(
        project.notes.filter((note) => note.trackId === trackId).map((note) =>
          String(note.noteId)
        ),
      );
      const removedAutomationIds = new Set(removed.automationIds.map(String));
      const removedEffectIds = new Set(removed.effectIds.map(String));
      const removedChannelIds = new Set([String(removed.mixerChannelId)]);
      const channels = project.mixer.channels
        .filter((channel) => channel.trackId !== trackId)
        .map((channel) => {
          if (String(channel.outputTrackId) !== String(trackId)) return channel;
          const { outputTrackId: _outputTrackId, ...withoutOutput } = channel;
          return withoutOutput;
        });
      const sends = (project.mixer.sends ?? []).filter((send) =>
        send.sourceTrackId !== trackId && send.destinationTrackId !== trackId
      );
      next = {
        ...next,
        tracks: project.tracks.filter((track) => track.trackId !== trackId),
        clips: project.clips.filter((clip) =>
          !removedClipIds.has(String(clip.clipId))
        ),
        notes: project.notes.filter((note) =>
          !removedNoteIds.has(String(note.noteId))
        ),
        automations: project.automations.filter((automation) =>
          !removedAutomationIds.has(String(automation.automationId)) &&
          !removedClipIds.has(automation.target.targetId) &&
          !removedChannelIds.has(automation.target.targetId) &&
          !removedEffectIds.has(automation.target.targetId) &&
          automation.target.targetId !== String(trackId)
        ),
        effects: project.effects.filter((effect) =>
          !removedEffectIds.has(String(effect.effectId))
        ),
        mixer: {
          ...project.mixer,
          channels,
          ...(sends.length > 0 || project.mixer.sends !== undefined
            ? { sends }
            : {}),
        },
        ...(project.freezeStates === undefined ? {} : {
          freezeStates: project.freezeStates.filter((freeze) =>
            freeze.trackId !== trackId
          ),
        }),
      };
      break;
    }
    case "REVISION_ATTACH": {
      const revision = entityFromPayload<AudioRevision>(payload, "revision");
      if (
        revision === null ||
        project.revisions.some((item) =>
          item.revisionId === revision.revisionId
        )
      ) {
        return fail(
          "AUDIO_DUPLICATE_ID",
          "Revision ID already exists or payload is invalid.",
          "command.payload.revision",
        );
      }
      next = { ...next, revisions: [...project.revisions, revision] };
      break;
    }
    case "RECORDING_COMMIT": {
      const recording = entityFromPayload<
        import("./contracts.ts").AudioRecordingCommitPayload
      >(payload, "recording");
      if (
        recording === null ||
        project.revisions.some((item) =>
          item.revisionId === recording.revision.revisionId
        ) ||
        project.clips.some((item) => item.clipId === recording.clip.clipId)
      ) {
        return fail(
          "AUDIO_DUPLICATE_ID",
          "Recording commit revision or Clip ID already exists.",
          "command.payload.recording",
        );
      }
      if (
        recording.clip.revisionId !== recording.revision.revisionId ||
        !project.tracks.some((track) =>
          track.trackId === recording.clip.trackId
        )
      ) {
        return fail(
          "AUDIO_INVALID_CLIP",
          "Recording commit must bind the new Clip to its Revision and Track.",
          "command.payload.recording.clip",
        );
      }
      next = {
        ...next,
        revisions: [...project.revisions, recording.revision],
        clips: [...project.clips, recording.clip],
        tracks: project.tracks.map((track) =>
          track.trackId === recording.clip.trackId
            ? { ...track, clipIds: [...track.clipIds, recording.clip.clipId] }
            : track
        ),
      };
      break;
    }
    case "BOUNCE_COMMIT": {
      const bounce = entityFromPayload<AudioBounceCommitPayload>(
        payload,
        "bounce",
      );
      if (
        bounce === null ||
        project.revisions.some((item) =>
          item.revisionId === bounce.revision.revisionId
        ) ||
        project.clips.some((item) => item.clipId === bounce.clip.clipId) ||
        bounce.clip.revisionId !== bounce.revision.revisionId ||
        !project.tracks.some((track) =>
          track.trackId === bounce.clip.trackId
        ) ||
        !text(bounce.sourceName, 256)
      ) {
        return fail(
          "AUDIO_BOUNCE_INVALID",
          "Bounce must bind a new Revision and Clip to an existing Track.",
          "command.payload.bounce",
        );
      }
      next = {
        ...next,
        revisions: [...project.revisions, bounce.revision],
        clips: [...project.clips, bounce.clip],
        tracks: project.tracks.map((track) =>
          track.trackId === bounce.clip.trackId
            ? { ...track, clipIds: [...track.clipIds, bounce.clip.clipId] }
            : track
        ),
      };
      break;
    }
    case "FREEZE_COMMIT": {
      const commit = entityFromPayload<AudioFreezeCommitPayload>(
        payload,
        "freeze",
      );
      const freeze = commit?.freeze;
      if (
        commit === null || freeze === undefined ||
        project.revisions.some((item) =>
          item.revisionId === commit.revision.revisionId
        ) ||
        project.clips.some((item) => item.clipId === commit.clip.clipId) ||
        commit.clip.revisionId !== commit.revision.revisionId ||
        commit.clip.trackId !== freeze.trackId ||
        commit.clip.clipId !== freeze.frozenClipId ||
        commit.revision.revisionId !== freeze.frozenRevisionId ||
        freeze.sourceProjectRevision !== project.projectRevision ||
        !project.tracks.some((track) => track.trackId === freeze.trackId) ||
        !text(commit.sourceName, 256)
      ) {
        return fail(
          "AUDIO_FREEZE_INVALID",
          "Freeze must bind a new Revision and Clip to the source Track.",
          "command.payload.freeze",
        );
      }
      const freezeStates = (project.freezeStates ?? []).map((item) =>
        item.trackId === freeze.trackId && item.status === "ACTIVE"
          ? { ...item, status: "STALE" as const }
          : item
      );
      next = {
        ...next,
        revisions: [...project.revisions, commit.revision],
        clips: [...project.clips, commit.clip],
        tracks: project.tracks.map((track) =>
          track.trackId === freeze.trackId
            ? { ...track, clipIds: [...track.clipIds, commit.clip.clipId] }
            : track
        ),
        freezeStates: [...freezeStates, freeze],
      };
      break;
    }
    case "FREEZE_UNFREEZE": {
      const trackId = entityFromPayload<AudioTrack["trackId"]>(
        payload,
        "freezeTrackId",
      );
      if (
        trackId === null || !validId(trackId) ||
        !project.tracks.some((track) => track.trackId === trackId) ||
        !(project.freezeStates ?? []).some((item) =>
          item.trackId === trackId && item.status === "ACTIVE"
        )
      ) {
        return fail(
          "AUDIO_FREEZE_INVALID",
          "Unfreeze requires an active Freeze on an existing Track.",
          "command.payload.freezeTrackId",
        );
      }
      next = {
        ...next,
        freezeStates: (project.freezeStates ?? []).map((item) =>
          item.trackId === trackId && item.status === "ACTIVE"
            ? { ...item, status: "INACTIVE" as const }
            : item
        ),
      };
      break;
    }
    case "FREEZE_REACTIVATE": {
      const trackId = entityFromPayload<AudioTrack["trackId"]>(
        payload,
        "freezeTrackId",
      );
      const sourceHash = entityFromPayload<string>(
        payload,
        "freezeSourceStateHash",
      );
      const matching = (project.freezeStates ?? []).find((freeze) =>
        freeze.trackId === trackId && freeze.sourceStateHash === sourceHash &&
        (freeze.status === "INACTIVE" || freeze.status === "STALE")
      );
      if (
        trackId === null || !validId(trackId) ||
        sourceHash === null || !validId(sourceHash) ||
        matching === undefined
      ) {
        return fail(
          "AUDIO_FREEZE_STALE",
          "Freeze reactivation requires a matching inactive source fingerprint.",
          "command.payload.freezeSourceStateHash",
        );
      }
      next = {
        ...next,
        freezeStates: (project.freezeStates ?? []).map((freeze) =>
          freeze.trackId === trackId
            ? freeze === matching
              ? { ...freeze, status: "ACTIVE" as const }
              : freeze.status === "ACTIVE"
              ? { ...freeze, status: "STALE" as const }
              : freeze
            : freeze
        ),
      };
      break;
    }
    case "CLIP_ADD": {
      const clip = entityFromPayload<AudioClip>(payload, "clip");
      if (
        clip === null ||
        project.clips.some((item) => item.clipId === clip.clipId)
      ) {
        return fail(
          "AUDIO_DUPLICATE_ID",
          "Clip ID already exists or payload is invalid.",
          "command.payload.clip",
        );
      }
      next = {
        ...next,
        clips: [...project.clips, clip],
        tracks: project.tracks.map((track) =>
          track.trackId === clip.trackId
            ? { ...track, clipIds: [...track.clipIds, clip.clipId] }
            : track
        ),
      };
      break;
    }
    case "CLIP_UPDATE": {
      const clip = entityFromPayload<AudioClip>(payload, "clip");
      const previous = clip === null
        ? undefined
        : project.clips.find((item) => item.clipId === clip.clipId);
      if (clip === null || previous === undefined) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Clip update requires an existing Clip.",
          "command.payload.clip",
        );
      }
      if (
        previous.trackId !== clip.trackId ||
        previous.revisionId !== clip.revisionId
      ) {
        return fail(
          "AUDIO_INVALID_CLIP",
          "Clip move/trim cannot rebind its Track or Asset Revision.",
          "command.payload.clip",
        );
      }
      next = {
        ...next,
        clips: project.clips.map((item) =>
          item.clipId === clip.clipId ? clip : item
        ),
      };
      break;
    }
    case "CLIP_SPLIT": {
      const split = entityFromPayload<{
        readonly sourceClipId: AudioClip["clipId"];
        readonly leftClip: AudioClip;
        readonly rightClip: AudioClip;
      }>(payload, "clipSplit");
      const source = split === null
        ? undefined
        : project.clips.find((clip) => clip.clipId === split.sourceClipId);
      const left = split?.leftClip;
      const right = split?.rightClip;
      if (
        split === null || source === undefined || left === undefined ||
        right === undefined
      ) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Clip split requires an existing source and two replacement Clips.",
          "command.payload.clipSplit",
        );
      }
      if (
        left.clipId === right.clipId ||
        left.clipId === source.clipId ||
        right.clipId === source.clipId ||
        project.clips.some((clip) =>
          clip.clipId !== source.clipId &&
          (clip.clipId === left.clipId || clip.clipId === right.clipId)
        )
      ) {
        return fail(
          "AUDIO_DUPLICATE_ID",
          "Clip split replacement IDs must be new and unique.",
          "command.payload.clipSplit",
        );
      }
      const leftEnd = left.timeline.startTick + left.timeline.durationTick;
      const sourceEnd = source.timeline.startTick +
        source.timeline.durationTick;
      const rightEnd = right.timeline.startTick + right.timeline.durationTick;
      if (
        left.trackId !== source.trackId || right.trackId !== source.trackId ||
        left.revisionId !== source.revisionId ||
        right.revisionId !== source.revisionId ||
        right.timeline.startTick !== leftEnd ||
        left.timeline.startTick !== source.timeline.startTick ||
        rightEnd !== sourceEnd ||
        left.sourceOffsetUs !== source.sourceOffsetUs ||
        right.timeline.durationTick < 1 || left.timeline.durationTick < 1 ||
        right.sourceOffsetUs < left.sourceOffsetUs
      ) {
        return fail(
          "AUDIO_INVALID_CLIP",
          "Clip split replacements must be contiguous and keep the Track/Revision binding.",
          "command.payload.clipSplit",
        );
      }
      const replacement = project.clips.flatMap((clip) =>
        clip.clipId === source.clipId ? [left, right] : [clip]
      );
      next = {
        ...next,
        clips: replacement,
        tracks: project.tracks.map((track) =>
          track.trackId !== source.trackId ? track : {
            ...track,
            clipIds: track.clipIds.flatMap((id) =>
              id === source.clipId ? [left.clipId, right.clipId] : [id]
            ),
          }
        ),
      };
      break;
    }
    case "CLIP_REMOVE": {
      const clipId = entityFromPayload<AudioClip["clipId"]>(payload, "clipId");
      if (clipId === null || !validId(clipId)) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Clip ID payload is invalid.",
          "command.payload.clipId",
        );
      }
      if (!project.clips.some((clip) => clip.clipId === clipId)) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Clip ID does not exist in the current Project.",
          "command.payload.clipId",
        );
      }
      next = {
        ...next,
        clips: project.clips.filter((clip) => clip.clipId !== clipId),
        tracks: project.tracks.map((track) =>
          track.clipIds.includes(clipId)
            ? { ...track, clipIds: track.clipIds.filter((id) => id !== clipId) }
            : track
        ),
      };
      break;
    }
    case "TIMELINE_BAR_CLEAR": {
      const range = entityFromPayload<AudioTimelineBarClearPayload>(
        payload,
        "timelineBar",
      );
      const startTick = range?.startTick;
      const durationTick = range?.durationTick;
      const endTick = typeof startTick === "number" &&
          typeof durationTick === "number"
        ? startTick + durationTick
        : NaN;
      if (
        !boundedInteger(startTick, 0, AUDIO200_MAX_TICK) ||
        !boundedInteger(durationTick, 1, AUDIO200_MAX_TICK) ||
        !Number.isSafeInteger(endTick) || endTick > AUDIO200_MAX_TICK
      ) {
        return fail(
          "AUDIO_INVALID_NUMBER",
          "Timeline bar range must be bounded non-negative ticks.",
          "command.payload.timelineBar",
        );
      }
      // Bar clearing is deliberately non-ripple: absolute Audio/Draw timing
      // remains stable. Every canonical lane is edited in the same Tick
      // range; boundary-crossing notes/clips are trimmed so range Move does
      // not leave a duplicate tail behind.
      const noteEdits = project.notes.flatMap((note) => {
        const noteStart = note.timeline.startTick;
        const noteEnd = noteStart + note.timeline.durationTick;
        if (noteEnd <= startTick || noteStart >= endTick) return [note];
        if (noteStart < startTick) {
          const leftDuration = startTick - noteStart;
          return leftDuration > 0
            ? [{
              ...note,
              timeline: {
                startTick: noteStart,
                durationTick: leftDuration as AudioTick,
              },
            }]
            : [];
        }
        if (noteEnd > endTick) {
          return [{
            ...note,
            timeline: {
              startTick: endTick as AudioTick,
              durationTick: (noteEnd - endTick) as AudioTick,
            },
          }];
        }
        return [];
      });
      const removedNoteIds = new Set(
        project.notes.filter((note) =>
          !noteEdits.some((item) => item.noteId === note.noteId)
        ).map((note) => note.noteId),
      );
      const clipEdits = project.clips.flatMap((clip) => {
        const clipStart = clip.timeline.startTick;
        const clipEnd = clipStart + clip.timeline.durationTick;
        if (clipEnd <= startTick || clipStart >= endTick) return [clip];
        if (clipStart < startTick) {
          const leftDuration = startTick - clipStart;
          return leftDuration > 0
            ? [{
              ...clip,
              timeline: {
                startTick: clipStart,
                durationTick: leftDuration as AudioTick,
              },
              fadeOutTick: Math.min(
                clip.fadeOutTick,
                leftDuration,
              ) as AudioTick,
            }]
            : [];
        }
        if (clipEnd > endTick) {
          const rightDuration = clipEnd - endTick;
          const tickDelta = endTick - clipStart;
          const sourceOffsetDeltaUs = Math.round(
            (60_000_000_000 * tickDelta) /
              (Math.max(1, project.tempo.milliBpm) *
                Math.max(1, project.timebase.ticksPerQuarter)),
          );
          return [{
            ...clip,
            timeline: {
              startTick: endTick as AudioTick,
              durationTick: rightDuration as AudioTick,
            },
            sourceOffsetUs: clip.sourceOffsetUs + sourceOffsetDeltaUs,
            fadeInTick: 0 as AudioTick,
            fadeOutTick: Math.min(clip.fadeOutTick, rightDuration) as AudioTick,
          }];
        }
        return [];
      });
      const removedClipIds = new Set(
        project.clips.filter((clip) =>
          !clipEdits.some((item) => item.clipId === clip.clipId)
        ).map((clip) => clip.clipId),
      );
      const nextAutomations = project.automations.map((automation) => ({
        ...automation,
        points: automation.points.filter((point) =>
          point.tick < startTick || point.tick >= endTick
        ),
      })).filter((automation) => automation.points.length > 0);
      const removedAutomationIds = new Set(
        project.automations.filter((automation) =>
          !nextAutomations.some((item) =>
            item.automationId === automation.automationId
          )
        ).map((automation) => automation.automationId),
      );
      const nextMarkers = project.markers.filter((marker) =>
        marker.tick < startTick || marker.tick >= endTick
      );
      const removedMarkerIds = new Set(
        project.markers.filter((marker) =>
          !nextMarkers.some((item) => item.markerId === marker.markerId)
        ).map((marker) => marker.markerId),
      );
      const hasTrimmedNotes = project.notes.some((note) => {
        const nextNote = noteEdits.find((item) => item.noteId === note.noteId);
        return nextNote !== undefined && (
          nextNote.timeline.startTick !== note.timeline.startTick ||
          nextNote.timeline.durationTick !== note.timeline.durationTick
        );
      });
      const hasTrimmedClips = project.clips.some((clip) => {
        const nextClip = clipEdits.find((item) => item.clipId === clip.clipId);
        return nextClip !== undefined && (
          nextClip.timeline.startTick !== clip.timeline.startTick ||
          nextClip.timeline.durationTick !== clip.timeline.durationTick ||
          nextClip.sourceOffsetUs !== clip.sourceOffsetUs
        );
      });
      if (
        removedNoteIds.size === 0 && removedClipIds.size === 0 &&
        removedAutomationIds.size === 0 && removedMarkerIds.size === 0 &&
        !hasTrimmedNotes && !hasTrimmedClips
      ) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Selected timeline bar has no removable content.",
          "command.payload.timelineBar",
          true,
        );
      }
      next = {
        ...next,
        clips: clipEdits,
        notes: noteEdits,
        automations: nextAutomations,
        markers: nextMarkers,
        tracks: project.tracks.map((track) => ({
          ...track,
          clipIds: track.clipIds.filter((id) => !removedClipIds.has(id)),
          noteIds: track.noteIds.filter((id) => !removedNoteIds.has(id)),
          automationIds: track.automationIds.filter((id) =>
            !removedAutomationIds.has(id)
          ),
        })),
      };
      if (project.freezeStates !== undefined) {
        next = {
          ...next,
          freezeStates: project.freezeStates.filter((freeze) =>
            !removedClipIds.has(freeze.frozenClipId)
          ),
        };
      }
      break;
    }
    case "NOTE_UPSERT": {
      const note = entityFromPayload<AudioNote>(payload, "note");
      if (note === null) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Note payload is invalid.",
          "command.payload.note",
        );
      }
      next = {
        ...next,
        notes: replaceById(project.notes, "noteId", note),
        tracks: project.tracks.map((track) =>
          track.trackId === note.trackId && !track.noteIds.includes(note.noteId)
            ? { ...track, noteIds: [...track.noteIds, note.noteId] }
            : track
        ),
      };
      break;
    }
    case "NOTE_REMOVE": {
      const noteId = entityFromPayload<AudioNote["noteId"]>(payload, "noteId");
      if (noteId === null || !validId(noteId)) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Note ID payload is invalid.",
          "command.payload.noteId",
        );
      }
      if (!project.notes.some((note) => note.noteId === noteId)) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Note ID does not exist in the current Project.",
          "command.payload.noteId",
        );
      }
      next = {
        ...next,
        notes: project.notes.filter((note) => note.noteId !== noteId),
        tracks: project.tracks.map((track) =>
          track.noteIds.includes(noteId)
            ? { ...track, noteIds: track.noteIds.filter((id) => id !== noteId) }
            : track
        ),
      };
      break;
    }
    case "AUTOMATION_UPSERT": {
      const automation = entityFromPayload<AudioAutomation>(
        payload,
        "automation",
      );
      if (automation === null) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Automation payload is invalid.",
          "command.payload.automation",
        );
      }
      const targetTrackId = (automation.target.kind === "TRACK_GAIN" ||
          automation.target.kind === "TRACK_PAN" ||
          automation.target.kind === "FILTER_CUTOFF" ||
          automation.target.kind === "SYNTH_PARAMETER")
        ? automation.target.targetId
        : (automation.target.kind === "MIXER_CHANNEL_GAIN" ||
            automation.target.kind === "MIXER_CHANNEL_PAN")
        ? project.mixer.channels.find((channel) =>
          String(channel.channelId) === automation.target.targetId
        )?.trackId
        : automation.target.kind === "CLIP_GAIN"
        ? project.clips.find((clip) =>
          String(clip.clipId) === automation.target.targetId
        )?.trackId
        : project.tracks.find((track) =>
          track.effectIds.some((effectId) =>
            String(effectId) === automation.target.targetId
          )
        )?.trackId;
      next = {
        ...next,
        automations: replaceById(
          project.automations,
          "automationId",
          automation,
        ),
        tracks: project.tracks.map((track) => ({
          ...track,
          automationIds: track.automationIds.filter((id) =>
            id !== automation.automationId
          ).concat(
            targetTrackId !== undefined && track.trackId === targetTrackId
              ? [automation.automationId]
              : [],
          ),
        })),
      };
      break;
    }
    case "AUTOMATION_REMOVE": {
      const automationId = entityFromPayload<
        AudioAutomation["automationId"]
      >(payload, "automationId");
      if (
        automationId === null ||
        !project.automations.some((item) => item.automationId === automationId)
      ) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Automation ID does not exist in the current Project.",
          "command.payload.automationId",
        );
      }
      next = {
        ...next,
        automations: project.automations.filter((item) =>
          item.automationId !== automationId
        ),
        tracks: project.tracks.map((track) => ({
          ...track,
          automationIds: track.automationIds.filter((id) =>
            id !== automationId
          ),
        })),
      };
      break;
    }
    case "MIXER_REPLACE": {
      const mixer = entityFromPayload<AudioMixer>(payload, "mixer");
      if (mixer === null) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Mixer payload is invalid.",
          "command.payload.mixer",
        );
      }
      next = { ...next, mixer };
      break;
    }
    case "EFFECT_UPSERT": {
      const effect = entityFromPayload<AudioEffect>(payload, "effect");
      if (effect === null) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Effect payload is invalid.",
          "command.payload.effect",
        );
      }
      next = {
        ...next,
        effects: replaceById(project.effects, "effectId", effect),
      };
      break;
    }
    case "EFFECT_CHAIN_REPLACE": {
      const chain = entityFromPayload<
        import("./contracts.ts").AudioEffectChainPayload
      >(payload, "effectChain");
      const track = chain === null
        ? undefined
        : project.tracks.find((item) => item.trackId === chain.trackId);
      const effectIds =
        chain?.effects.map((effect) => String(effect.effectId)) ?? [];
      if (
        chain === null || track === undefined ||
        !Array.isArray(chain.effects) ||
        effectIds.some((id) => !validId(id)) ||
        new Set(effectIds).size !== effectIds.length
      ) {
        return fail(
          "AUDIO_INVALID_EFFECT",
          "Effect chain must bind an existing Track and unique Effect records.",
          "command.payload.effectChain",
        );
      }
      next = {
        ...next,
        effects: chain.effects.reduce<readonly AudioEffect[]>(
          (effects, effect) => replaceById(effects, "effectId", effect),
          project.effects,
        ),
        tracks: project.tracks.map((item) =>
          item.trackId === track.trackId
            ? {
              ...item,
              effectIds: chain.effects.map((effect) => effect.effectId),
            }
            : item
        ),
      };
      break;
    }
    case "MASTER_REPLACE": {
      const payloadMaster = entityFromPayload<AudioMasterPayload>(
        payload,
        "master",
      );
      if (payloadMaster === null || payloadMaster.master === undefined) {
        return fail(
          "AUDIO_INVALID_PROJECT",
          "Master payload is invalid.",
          "command.payload.master",
        );
      }
      const effects = (payloadMaster.effects ?? []).reduce<
        readonly AudioEffect[]
      >(
        (items, effect) => replaceById(items, "effectId", effect),
        project.effects,
      );
      next = {
        ...next,
        effects,
        master: payloadMaster.master,
      };
      break;
    }
    case "DRUM_KIT_SET": {
      const drumKitId = entityFromPayload<
        import("./contracts.ts").AudioDrumKitId
      >(payload, "drumKitId");
      if (drumKitId === null || !isAudioDrumKitId(drumKitId)) {
        return fail(
          "AUDIO_INVALID_PROJECT",
          "Drum kit identifier is not supported.",
          "command.payload.drumKitId",
        );
      }
      next = { ...next, drumKitId };
      break;
    }
    case "CHIP_MACHINE_SET": {
      const chipMachineId = entityFromPayload<
        import("./contracts.ts").AudioChipMachineId
      >(payload, "chipMachineId");
      if (
        chipMachineId === null || !isAudioChipMachineId(chipMachineId)
      ) {
        return fail(
          "AUDIO_INVALID_PROJECT",
          "Chip machine identifier is not supported.",
          "command.payload.chipMachineId",
        );
      }
      next = { ...next, chipMachineId };
      break;
    }
    case "SYNTH_PRESET_REPLACE": {
      const synthPreset = entityFromPayload<AudioSynthPreset>(
        payload,
        "synthPreset",
      );
      const diagnostic = synthPreset === null
        ? {
          code: "AUDIO_INVALID_PROJECT" as const,
          message: "Synth preset payload is invalid.",
          path: "command.payload.synthPreset",
          recoverable: false,
        }
        : validateSynthPreset(synthPreset, "command.payload.synthPreset");
      if (diagnostic !== null) return { ok: false, diagnostics: [diagnostic] };
      next = {
        ...next,
        synthPresets: replaceById(
          project.synthPresets ?? [],
          "presetId",
          synthPreset!,
        ),
      };
      break;
    }
    case "SYNTH_PRESET_REMOVE": {
      const synthPresetId = entityFromPayload<string>(payload, "synthPresetId");
      if (
        synthPresetId === null || !validId(synthPresetId) ||
        !(project.synthPresets ?? []).some((preset) =>
          preset.presetId === synthPresetId
        )
      ) {
        return fail(
          "AUDIO_INVALID_PROJECT",
          "Synth preset ID is invalid or does not exist.",
          "command.payload.synthPresetId",
        );
      }
      next = {
        ...next,
        synthPresets: (project.synthPresets ?? []).filter((preset) =>
          preset.presetId !== synthPresetId
        ),
      };
      break;
    }
    case "TEMPO_SET": {
      const tempo = entityFromPayload<AudioTempo>(payload, "tempo");
      if (tempo === null) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Tempo payload is invalid.",
          "command.payload.tempo",
        );
      }
      next = { ...next, tempo };
      break;
    }
    case "MARKER_UPSERT": {
      const marker = entityFromPayload<AudioMarker>(payload, "marker");
      if (marker === null) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Marker payload is invalid.",
          "command.payload.marker",
        );
      }
      next = {
        ...next,
        markers: replaceById(project.markers, "markerId", marker),
      };
      break;
    }
    case "MARKER_REMOVE": {
      const markerId = entityFromPayload<string>(payload, "markerId");
      if (
        markerId === null || !validId(markerId) ||
        !project.markers.some((marker) => marker.markerId === markerId)
      ) {
        return fail(
          "AUDIO_COMMAND_INVALID",
          "Marker ID is invalid or does not exist.",
          "command.payload.markerId",
        );
      }
      next = {
        ...next,
        markers: project.markers.filter((marker) =>
          marker.markerId !== markerId
        ),
      };
      break;
    }
  }
  if (
    project.freezeStates !== undefined &&
    command.type !== "FREEZE_COMMIT" &&
    command.type !== "FREEZE_UNFREEZE" &&
    command.type !== "FREEZE_REACTIVATE"
  ) {
    const staleFreezeStates = markActiveFreezesStale(next);
    if (staleFreezeStates !== undefined) {
      next = { ...next, freezeStates: staleFreezeStates };
    }
  }
  const valid = await validateAudioProject(next, false);
  if (!valid.ok) return valid;
  const hash = await hashAudioProjectState(next);
  if (!hash.ok) return hash;
  return audioOk({ ...next, stateHash: hash.value });
}

export function projectMaterial(project: AudioProject): string {
  const { stateHash: _stateHash, ...material } = project;
  return canonicalAudioMaterial(material);
}

export function audioTick(value: number): AudioTick {
  if (!boundedInteger(value, 0, AUDIO200_MAX_TICK)) {
    throw new Error("AudioTick is outside the AUDIO-200 bounded range.");
  }
  return value as AudioTick;
}
