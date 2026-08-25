import {
  createPianoRollNote,
  type PianoRollInstrumentId,
  type PianoRollNote,
} from "./piano-roll.ts";
import type {
  AudioAutomation,
  AudioClip,
  AudioMarker,
  AudioNote,
  AudioProject,
  AudioTick,
} from "../audio-200/contracts.ts";
import {
  audioClockForProject,
  audioTickToSeconds,
} from "../audio-200/timebase.ts";

export interface AudioBarRange {
  readonly startBar: number;
  /** Exclusive bar index. */
  readonly endBar: number;
}

export interface AudioPianoRollRangeClipboard {
  readonly durationFrames: number;
  readonly notes: readonly PianoRollNote[];
}

export interface AudioTickRange {
  readonly startTick: AudioTick;
  readonly durationTick: AudioTick;
}

export interface AudioProjectRangeClipboard {
  readonly durationTick: AudioTick;
  readonly notes: readonly AudioNote[];
  readonly clips: readonly AudioClip[];
  readonly automations: readonly AudioAutomation[];
  readonly markers: readonly AudioMarker[];
}

function rangeEnd(range: AudioTickRange): number {
  return range.startTick + range.durationTick;
}

function overlap(
  start: number,
  end: number,
  range: AudioTickRange,
): { readonly start: number; readonly end: number } | undefined {
  const clippedStart = Math.max(start, range.startTick);
  const clippedEnd = Math.min(end, rangeEnd(range));
  return clippedEnd <= clippedStart
    ? undefined
    : { start: clippedStart, end: clippedEnd };
}

function rebasedRange(start: number, end: number, base: number): {
  readonly startTick: AudioTick;
  readonly durationTick: AudioTick;
} {
  return {
    startTick: Math.max(0, start - base) as AudioTick,
    durationTick: Math.max(1, end - start) as AudioTick,
  };
}

/** Copy every canonical Audio lane in one Tick range. */
export function copyAudioProjectRange(
  project: AudioProject,
  range: AudioTickRange,
): AudioProjectRangeClipboard {
  const base = Math.max(0, range.startTick);
  const end = rangeEnd(range);
  const clock = audioClockForProject(project, 1);
  const notes = project.notes.flatMap((note) => {
    const hit = overlap(
      note.timeline.startTick,
      note.timeline.startTick + note.timeline.durationTick,
      range,
    );
    if (hit === undefined) return [];
    return [{
      ...note,
      timeline: rebasedRange(hit.start, hit.end, base),
    }];
  });
  const clips = project.clips.flatMap((clip) => {
    const originalStart = clip.timeline.startTick;
    const originalEnd = originalStart + clip.timeline.durationTick;
    const hit = overlap(originalStart, originalEnd, range);
    if (hit === undefined) return [];
    const sourceOffsetDeltaUs = Math.round(
      audioTickToSeconds(hit.start - originalStart, clock) * 1_000_000,
    );
    const timeline = rebasedRange(hit.start, hit.end, base);
    const fadeInTick = Math.min(
      clip.fadeInTick,
      Math.max(0, originalEnd - hit.start),
    ) as AudioTick;
    const fadeOutTick = Math.min(
      clip.fadeOutTick,
      Math.max(0, hit.end - originalStart),
    ) as AudioTick;
    return [{
      ...clip,
      timeline,
      sourceOffsetUs: clip.sourceOffsetUs + sourceOffsetDeltaUs,
      fadeInTick,
      fadeOutTick: Math.min(
        fadeOutTick,
        Math.max(0, timeline.durationTick - fadeInTick),
      ) as AudioTick,
    }];
  });
  const automations = project.automations.flatMap((automation) => {
    const points = automation.points
      .filter((point) => point.tick >= base && point.tick < end)
      .map((point) => ({
        ...point,
        tick: (point.tick - base) as AudioTick,
      }));
    return points.length === 0 ? [] : [{ ...automation, points }];
  });
  const markers = project.markers
    .filter((marker) => marker.tick >= base && marker.tick < end)
    .map((marker) => ({ ...marker, tick: (marker.tick - base) as AudioTick }));
  return {
    durationTick: Math.max(1, range.durationTick) as AudioTick,
    notes,
    clips,
    automations,
    markers,
  };
}

export interface AudioProjectRangeIdFactory {
  readonly noteId: (source: AudioNote, index: number) => AudioNote["noteId"];
  readonly clipId: (source: AudioClip, index: number) => AudioClip["clipId"];
  readonly automationId: (
    source: AudioAutomation,
    index: number,
  ) => AudioAutomation["automationId"];
  readonly markerId: (source: AudioMarker, index: number) => AudioMarker["markerId"];
}

export interface AudioProjectRangePaste {
  readonly notes: readonly AudioNote[];
  readonly clips: readonly AudioClip[];
  readonly automations: readonly AudioAutomation[];
  readonly markers: readonly AudioMarker[];
}

/** Paste the complete clipboard into every matching canonical Track/lane. */
export function pasteAudioProjectRange(
  clipboard: AudioProjectRangeClipboard,
  destinationTick: number,
  ids: AudioProjectRangeIdFactory,
): AudioProjectRangePaste {
  const destination = Math.max(
    0,
    Number.isFinite(destinationTick) ? Math.round(destinationTick) : 0,
  );
  return {
    notes: clipboard.notes.map((note, index) => ({
      ...note,
      noteId: ids.noteId(note, index),
      timeline: {
        startTick: (destination + note.timeline.startTick) as AudioTick,
        durationTick: note.timeline.durationTick,
      },
    })),
    clips: clipboard.clips.map((clip, index) => ({
      ...clip,
      clipId: ids.clipId(clip, index),
      timeline: {
        startTick: (destination + clip.timeline.startTick) as AudioTick,
        durationTick: clip.timeline.durationTick,
      },
    })),
    automations: clipboard.automations.map((automation, index) => ({
      ...automation,
      automationId: ids.automationId(automation, index),
      points: automation.points.map((point) => ({
        ...point,
        tick: (destination + point.tick) as AudioTick,
      })),
    })),
    markers: clipboard.markers.map((marker, index) => ({
      ...marker,
      markerId: ids.markerId(marker, index),
      tick: (destination + marker.tick) as AudioTick,
    })),
  };
}

/** Move destination helper used by the DAW's ripple-free range actions. */
export function moveAudioProjectRange(
  range: AudioTickRange,
  destinationTick: number,
): { readonly source: AudioTickRange; readonly destination: AudioTick } {
  return {
    source: {
      startTick: Math.max(0, range.startTick) as AudioTick,
      durationTick: Math.max(1, range.durationTick) as AudioTick,
    },
    destination: Math.max(0, Math.round(destinationTick)) as AudioTick,
  };
}

/** Keep a bar selection ordered, bounded, and at least one bar wide. */
export function normalizeAudioBarRange(
  startBar: number,
  endBar: number,
  totalBars: number,
): AudioBarRange {
  const safeTotalBars = Math.max(
    1,
    Number.isFinite(totalBars) ? Math.trunc(totalBars) : 1,
  );
  const first = Math.max(
    0,
    Math.min(
      safeTotalBars - 1,
      Number.isFinite(startBar) ? Math.trunc(startBar) : 0,
    ),
  );
  const requestedEnd = Number.isFinite(endBar) ? Math.trunc(endBar) : first + 1;
  const last = Math.max(first + 1, requestedEnd);
  return {
    startBar: first,
    endBar: Math.min(safeTotalBars, last),
  };
}

/**
 * Copy notes that touch a frame range. Notes are rebased to frame zero and
 * clipped at the range edges, so a pasted phrase never leaks outside the
 * selected bars.
 */
export function copyAudioPianoRollRange(
  notes: readonly PianoRollNote[],
  startFrame: number,
  durationFrames: number,
): AudioPianoRollRangeClipboard {
  const start = Math.max(0, Number.isFinite(startFrame) ? Math.trunc(startFrame) : 0);
  const duration = Math.max(
    1,
    Number.isFinite(durationFrames) ? Math.trunc(durationFrames) : 1,
  );
  const end = start + duration;
  const copied: PianoRollNote[] = [];
  for (const note of notes) {
    const noteStart = Math.max(0, Math.trunc(note.startFrame));
    const noteEnd = noteStart + Math.max(1, Math.trunc(note.durationFrames));
    if (noteEnd <= start || noteStart >= end) continue;
    const clippedStart = Math.max(start, noteStart);
    const clippedEnd = Math.min(end, noteEnd);
    copied.push({
      ...note,
      startFrame: clippedStart - start,
      durationFrames: Math.max(1, clippedEnd - clippedStart),
    });
  }
  copied.sort((left, right) =>
    left.startFrame - right.startFrame ||
    left.pitchMidi - right.pitchMidi ||
    left.instrument.localeCompare(right.instrument)
  );
  return { durationFrames: duration, notes: copied };
}

/** Paste a clipboard at a destination frame and bound notes to the timeline. */
export function pasteAudioPianoRollRange(
  clipboard: AudioPianoRollRangeClipboard,
  destinationFrame: number,
  frameCount: number,
  idFactory: (
    note: PianoRollNote,
    index: number,
  ) => string,
): readonly PianoRollNote[] {
  const destination = Math.max(
    0,
    Number.isFinite(destinationFrame) ? Math.trunc(destinationFrame) : 0,
  );
  const safeFrameCount = Math.max(
    1,
    Number.isFinite(frameCount) ? Math.trunc(frameCount) : 1,
  );
  const pasted: PianoRollNote[] = [];
  for (const [index, source] of clipboard.notes.entries()) {
    const candidate = createPianoRollNote({
      id: idFactory(source, index),
      pitchMidi: source.pitchMidi,
      startFrame: destination + source.startFrame,
      durationFrames: source.durationFrames,
      velocity: source.velocity,
      instrument: source.instrument as PianoRollInstrumentId,
      frameCount: safeFrameCount,
    });
    if (candidate !== undefined) pasted.push(candidate);
  }
  return pasted;
}
