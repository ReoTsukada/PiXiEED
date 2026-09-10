import { AUDIO200_MAX_TICK, type AudioClip, type AudioProject, type AudioTick } from "../audio-200/contracts.ts";
import { createAudioTrackIntervalIndex, type AudioTrackIntervalIndex } from "../../game/game-350/audio-track-interval-index.ts";

export type GameAudioRangeSnap = "BEAT" | "FREE";
export interface GameAudioRangeSelection {
  readonly trackIds: readonly string[];
  readonly startTick: AudioTick;
  readonly durationTick: AudioTick;
  readonly snap: GameAudioRangeSnap;
}

export interface GameAudioPlaybackSegment {
  readonly clipId: string;
  readonly trackId: string;
  readonly offsetTick: number;
  readonly durationTick: number;
}

export interface GameAudioScheduledSegment extends GameAudioPlaybackSegment {
  /** Seconds from the selected range start to this segment. */
  readonly rangeOffsetSeconds: number;
  /** Seconds from the beginning of the source Clip. */
  readonly startSeconds: number;
  /** Seconds to play from the intersected clip range. */
  readonly durationSeconds: number;
}

/** Convert a Tick-native plan into a stable, gap-preserving playback schedule. */
export function scheduleGameAudioPlayback(
  project: AudioProject,
  selection: GameAudioRangeSelection,
): readonly GameAudioScheduledSegment[] {
  const ticksPerQuarter = Number(project.timebase?.ticksPerQuarter);
  const bpm = Number(project.tempo?.milliBpm) / 1000;
  if (!Number.isFinite(ticksPerQuarter) || ticksPerQuarter <= 0 || !Number.isFinite(bpm) || bpm <= 0) return [];
  const clips = new Map(project.clips.map((clip) => [String(clip.clipId), clip]));
  return gameAudioPlaybackPlan(project, selection).map((segment) => ({
    ...segment,
    rangeOffsetSeconds: Math.max(0, (
      Number(clips.get(segment.clipId)?.timeline.startTick ?? selection.startTick) +
      Number(segment.offsetTick) - Number(selection.startTick)
    ) / ticksPerQuarter) * 60 / bpm,
    startSeconds: (Number(segment.offsetTick) / ticksPerQuarter) * 60 / bpm,
    durationSeconds: (Number(segment.durationTick) / ticksPerQuarter) * 60 / bpm,
  })).sort((left, right) => left.rangeOffsetSeconds - right.rangeOffsetSeconds || left.trackId.localeCompare(right.trackId) || left.clipId.localeCompare(right.clipId));
}

/** Build a bounded, deterministic plan for every selected track in a range. */
export function gameAudioPlaybackPlan(
  project: AudioProject,
  selection: GameAudioRangeSelection,
): readonly GameAudioPlaybackSegment[] {
  const start = Number(selection.startTick);
  const end = start + Number(selection.durationTick);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return [];
  const tracks = new Set(selection.trackIds);
  return project.clips
    .filter((clip) => tracks.has(String(clip.trackId)))
    .map((clip) => {
      const clipStart = Number(clip.timeline.startTick);
      const clipEnd = clipStart + Number(clip.timeline.durationTick);
      const segmentStart = Math.max(start, clipStart);
      const segmentEnd = Math.min(end, clipEnd);
      return segmentEnd > segmentStart
        ? { clipId: String(clip.clipId), trackId: String(clip.trackId), offsetTick: segmentStart - clipStart, durationTick: segmentEnd - segmentStart }
        : undefined;
    })
    .filter((segment): segment is GameAudioPlaybackSegment => segment !== undefined)
    .sort((left, right) => left.trackId.localeCompare(right.trackId) || left.offsetTick - right.offsetTick || left.clipId.localeCompare(right.clipId));
}

/** One clip intersection scheduled inside a Game range preview. */
export interface GameAudioRangePlaybackClip {
  readonly clip: AudioClip;
  readonly trackId: string;
  /** Absolute Tick where this intersection starts in the source timeline. */
  readonly startTick: AudioTick;
  /** Absolute exclusive Tick where this intersection ends. */
  readonly endTick: AudioTick;
  /** Offset from the selected range start to this intersection. */
  readonly rangeOffsetTick: AudioTick;
  /** Offset from the clip start to this intersection. */
  readonly clipOffsetTick: AudioTick;
  readonly durationTick: AudioTick;
}

/**
 * Tick-native playback plan for iGAME range audition.
 *
 * The selected range remains the plan duration, including gaps. Each selected
 * track contributes every clip intersecting the half-open range; the browser
 * WebAudio adapter can later schedule these entries without changing the
 * POST_MIX source contract.
 */
export interface GameAudioRangePlaybackPlan {
  readonly renderMode: "POST_MIX";
  readonly trackIds: readonly string[];
  readonly startTick: AudioTick;
  readonly endTick: AudioTick;
  readonly durationTick: AudioTick;
  readonly clips: readonly GameAudioRangePlaybackClip[];
}

export function createGameAudioRangeSelectionIndex(project: AudioProject): AudioTrackIntervalIndex {
  return createAudioTrackIntervalIndex(project.clips);
}

export function normalizeGameAudioRangeSelection(input: {
  readonly trackIds: readonly string[];
  readonly startTick: number;
  readonly endTick: number;
  readonly snap: GameAudioRangeSnap;
  readonly ticksPerBeat?: number;
}): GameAudioRangeSelection {
  const beat = input.ticksPerBeat ?? 480;
  const snapTick = (tick: number): number => input.snap === "FREE" ? Math.round(tick) : Math.round(tick / beat) * beat;
  const rawStart = Math.min(input.startTick, input.endTick);
  const rawEnd = Math.max(input.startTick, input.endTick);
  const startTick = Math.min(
    AUDIO200_MAX_TICK - 1,
    Math.max(0, snapTick(rawStart)),
  );
  const endTick = Math.min(
    AUDIO200_MAX_TICK,
    Math.max(startTick + 1, snapTick(rawEnd)),
  );
  const trackIds = [...new Set(input.trackIds.map(String).map((id) => id.trim()))]
    .filter((id) => id.length > 0);
  if (trackIds.length === 0 || !Number.isSafeInteger(startTick) || !Number.isSafeInteger(endTick)) throw new RangeError("Audio range selection is invalid");
  return { trackIds, startTick: startTick as AudioTick, durationTick: (endTick - startTick) as AudioTick, snap: input.snap };
}

export function selectAudioClipWhole(clip: AudioClip, snap: GameAudioRangeSnap = "FREE"): GameAudioRangeSelection {
  return normalizeGameAudioRangeSelection({ trackIds: [String(clip.trackId)], startTick: Number(clip.timeline.startTick), endTick: Number(clip.timeline.startTick) + Number(clip.timeline.durationTick), snap });
}

export function clipsInGameAudioRange(index: AudioTrackIntervalIndex, selection: GameAudioRangeSelection): readonly AudioClip[] {
  return index.queryMany(selection.trackIds, Number(selection.startTick), Number(selection.durationTick));
}

function validatedSelection(selection: GameAudioRangeSelection): {
  readonly trackIds: readonly string[];
  readonly startTick: number;
  readonly endTick: number;
  readonly durationTick: number;
} {
  const rawTrackIds = selection.trackIds as readonly unknown[];
  const trackIds = [...new Set(
    rawTrackIds
      .filter((id): id is string => typeof id === "string")
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  )];
  const startTick = Number(selection.startTick);
  const durationTick = Number(selection.durationTick);
  const endTick = startTick + durationTick;
  if (
    trackIds.length === 0 ||
    (selection.snap !== "BEAT" && selection.snap !== "FREE") ||
    !Number.isSafeInteger(startTick) || startTick < 0 || startTick > AUDIO200_MAX_TICK ||
    !Number.isSafeInteger(durationTick) || durationTick <= 0 ||
    !Number.isSafeInteger(endTick) || endTick > AUDIO200_MAX_TICK
  ) throw new RangeError("Audio range playback selection is invalid");
  return { trackIds, startTick, endTick, durationTick };
}

/**
 * Select and describe the complete iGAME range audition without touching
 * timers, AudioContext, media nodes, or the canonical Audio project.
 */
export function planGameAudioRangePlayback(
  project: AudioProject,
  selection: GameAudioRangeSelection,
): GameAudioRangePlaybackPlan {
  const valid = validatedSelection(selection);
  const index = createGameAudioRangeSelectionIndex(project);
  const trackOrder = new Map(valid.trackIds.map((trackId, index) => [trackId, index]));
  const clips = index.queryMany(valid.trackIds, valid.startTick, valid.durationTick)
    .flatMap((clip): GameAudioRangePlaybackClip[] => {
      const clipStartTick = Number(clip.timeline.startTick);
      const clipDurationTick = Number(clip.timeline.durationTick);
      const clipEndTick = clipStartTick + clipDurationTick;
      if (
        !Number.isSafeInteger(clipStartTick) || clipStartTick < 0 ||
        !Number.isSafeInteger(clipDurationTick) || clipDurationTick <= 0 ||
        !Number.isSafeInteger(clipEndTick) || clipEndTick <= clipStartTick
      ) return [];
      const startTick = Math.max(valid.startTick, clipStartTick);
      const endTick = Math.min(valid.endTick, clipEndTick);
      if (endTick <= startTick) return [];
      return [{
        clip,
        trackId: String(clip.trackId),
        startTick: startTick as AudioTick,
        endTick: endTick as AudioTick,
        rangeOffsetTick: (startTick - valid.startTick) as AudioTick,
        clipOffsetTick: (startTick - clipStartTick) as AudioTick,
        durationTick: (endTick - startTick) as AudioTick,
      }];
    })
    .sort((left, right) =>
      Number(left.startTick) - Number(right.startTick) ||
      (trackOrder.get(left.trackId) ?? Number.MAX_SAFE_INTEGER) -
        (trackOrder.get(right.trackId) ?? Number.MAX_SAFE_INTEGER) ||
      String(left.clip.clipId).localeCompare(String(right.clip.clipId))
    );
  return {
    renderMode: "POST_MIX",
    trackIds: valid.trackIds,
    startTick: valid.startTick as AudioTick,
    endTick: valid.endTick as AudioTick,
    durationTick: valid.durationTick as AudioTick,
    clips,
  };
}

export function audioRangeSelectionFromTrackDrag(input: {
  readonly trackId: string;
  readonly startTick: number;
  readonly endTick: number;
  readonly snap: GameAudioRangeSnap;
  readonly shiftTrackIds?: readonly string[];
}): GameAudioRangeSelection {
  return normalizeGameAudioRangeSelection({ trackIds: [input.trackId, ...(input.shiftTrackIds ?? [])], startTick: input.startTick, endTick: input.endTick, snap: input.snap });
}
