/** Tick-native, non-destructive waveform clip editing primitives. */

import type {
  AudioClip,
  AudioClipSplitPayload,
  AudioTick,
} from "../audio-200/contracts.ts";
import {
  type AudioClockSpec,
  audioTickToSeconds,
} from "../audio-200/timebase.ts";

function boundedTick(value: number): AudioTick {
  return Math.max(
    0,
    Math.round(Number.isFinite(value) ? value : 0),
  ) as AudioTick;
}

function clipEnd(clip: AudioClip): number {
  return clip.timeline.startTick + clip.timeline.durationTick;
}

function fadeLimited(
  durationTick: number,
  fadeInTick: number,
  fadeOutTick: number,
): Pick<AudioClip, "fadeInTick" | "fadeOutTick"> {
  const duration = Math.max(1, Math.trunc(durationTick));
  let fadeIn = Math.max(0, Math.trunc(fadeInTick));
  let fadeOut = Math.max(0, Math.trunc(fadeOutTick));
  if (fadeIn + fadeOut > duration) {
    const available = Math.max(0, duration - fadeIn);
    fadeOut = Math.min(fadeOut, available);
    if (fadeIn + fadeOut > duration) fadeIn = duration - fadeOut;
  }
  return {
    fadeInTick: boundedTick(fadeIn),
    fadeOutTick: boundedTick(fadeOut),
  };
}

/** Set a non-destructive clip speed without rewriting source audio bytes. */
export function withAudioClipPlaybackRate(
  clip: AudioClip,
  playbackRate: number,
): AudioClip {
  const bounded = Math.min(
    4,
    Math.max(0.25, Number.isFinite(playbackRate) ? playbackRate : 1),
  );
  return bounded === 1
    ? (() => {
      const { playbackRate: _ignored, ...withoutRate } = clip;
      void _ignored;
      return withoutRate;
    })()
    : { ...clip, playbackRate: bounded };
}

/** Apply a fade without changing source bytes or clip placement. */
export function withAudioClipFades(
  clip: AudioClip,
  fades: {
    readonly fadeInTick?: number;
    readonly fadeOutTick?: number;
  },
): AudioClip {
  const bounded = fadeLimited(
    clip.timeline.durationTick,
    fades.fadeInTick ?? clip.fadeInTick,
    fades.fadeOutTick ?? clip.fadeOutTick,
  );
  return { ...clip, ...bounded };
}

/** Split a clip at an exact musical Tick and preserve source alignment. */
export function splitAudioClipAtTick(
  clip: AudioClip,
  splitTick: number,
  clock: AudioClockSpec,
): AudioClipSplitPayload {
  const start = clip.timeline.startTick;
  const end = clipEnd(clip);
  const split = Math.round(splitTick);
  if (!Number.isSafeInteger(split) || split <= start || split >= end) {
    throw new RangeError("Clip split Tick must be inside the Clip timeline.");
  }
  const leftDuration = (split - start) as AudioTick;
  const rightDuration = (end - split) as AudioTick;
  const sourceOffsetDelta = Math.round(
    audioTickToSeconds(split - start, clock) * 1_000_000,
  );
  const left = {
    ...clip,
    clipId: `${String(clip.clipId)}:left` as AudioClip["clipId"],
    timeline: { startTick: start, durationTick: leftDuration },
    fadeInTick: Math.min(clip.fadeInTick, leftDuration) as AudioTick,
    fadeOutTick: 0 as AudioTick,
  };
  const right = {
    ...clip,
    clipId: `${String(clip.clipId)}:right` as AudioClip["clipId"],
    timeline: { startTick: split as AudioTick, durationTick: rightDuration },
    sourceOffsetUs: clip.sourceOffsetUs + sourceOffsetDelta,
    fadeInTick: 0 as AudioTick,
    fadeOutTick: Math.min(clip.fadeOutTick, rightDuration) as AudioTick,
  };
  return {
    sourceClipId: clip.clipId,
    leftClip: left,
    rightClip: right,
  };
}

/**
 * Create an overlap crossfade between adjacent clips. The incoming clip is
 * extended leftward while retaining its source offset and final endpoint;
 * the outgoing/incoming envelopes then meet at the exact Tick seam.
 */
export function createAudioCrossfadePair(
  outgoing: AudioClip,
  incoming: AudioClip,
  crossfadeTick: number,
): { readonly outgoing: AudioClip; readonly incoming: AudioClip } {
  if (outgoing.trackId !== incoming.trackId) {
    throw new Error("Crossfade clips must belong to the same Track.");
  }
  const outgoingEnd = clipEnd(outgoing);
  const incomingEnd = clipEnd(incoming);
  if (incoming.timeline.startTick < outgoing.timeline.startTick) {
    throw new RangeError("Crossfade clips must be ordered on the timeline.");
  }
  const requested = Math.max(
    1,
    Math.round(Number.isFinite(crossfadeTick) ? crossfadeTick : 1),
  );
  const overlap = Math.min(
    requested,
    outgoing.timeline.durationTick,
    incoming.timeline.durationTick,
  );
  const incomingStart = Math.max(
    outgoing.timeline.startTick,
    outgoingEnd - overlap,
  ) as AudioTick;
  const incomingDuration = Math.max(
    1,
    incomingEnd - incomingStart,
  ) as AudioTick;
  return {
    outgoing: withAudioClipFades(outgoing, {
      fadeOutTick: Math.max(outgoing.fadeOutTick, overlap),
    }),
    incoming: withAudioClipFades(
      {
        ...incoming,
        timeline: {
          startTick: incomingStart,
          durationTick: incomingDuration,
        },
      },
      { fadeInTick: Math.max(incoming.fadeInTick, overlap) },
    ),
  };
}
