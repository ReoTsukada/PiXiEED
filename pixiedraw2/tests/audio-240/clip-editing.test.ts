import type { AudioClip } from "../../src/audio/audio-200/contracts.ts";
import {
  createAudioCrossfadePair,
  splitAudioClipAtTick,
  withAudioClipFades,
  withAudioClipPlaybackRate,
} from "../../src/audio/audio-240/clip-editing.ts";

const clip = (
  id: string,
  startTick: number,
  durationTick: number,
): AudioClip => ({
  clipId: id as never,
  trackId: "track:audio" as never,
  revisionId: "revision:audio" as never,
  timeline: {
    startTick: startTick as never,
    durationTick: durationTick as never,
  },
  sourceOffsetUs: 0,
  gainMilliDb: 0,
  fadeInTick: 0 as never,
  fadeOutTick: 0 as never,
  loop: false,
});

Deno.test("Audio waveform clip editing stays Tick-native", () => {
  const source = clip("clip:source", 0, 1_920);
  const split = splitAudioClipAtTick(source, 960, {
    framesPerSecond: 24,
    tempoMilliBpm: 120_000,
    ticksPerQuarter: 480,
  });
  if (
    split.leftClip.timeline.durationTick !== 960 ||
    split.rightClip.timeline.startTick !== 960 ||
    split.rightClip.sourceOffsetUs !== 1_000_000
  ) throw new Error("Clip split did not preserve Tick/source alignment");
  const faded = withAudioClipFades(source, {
    fadeInTick: 1_200,
    fadeOutTick: 1_200,
  });
  if (faded.fadeInTick + faded.fadeOutTick > faded.timeline.durationTick) {
    throw new Error("Clip fade bounds exceeded the clip duration");
  }
  const next = clip("clip:next", 1_920, 1_920);
  const crossfade = createAudioCrossfadePair(source, next, 480);
  if (
    crossfade.outgoing.fadeOutTick !== 480 ||
    crossfade.incoming.fadeInTick !== 480 ||
    crossfade.incoming.timeline.startTick !== 1_440
  ) throw new Error("Crossfade did not create the expected Tick overlap");
  const stretched = withAudioClipPlaybackRate(source, 0.5);
  if (stretched.playbackRate !== 0.5) {
    throw new Error(
      "Clip playback rate was not stored as a non-destructive edit",
    );
  }
  const restored = withAudioClipPlaybackRate(stretched, 1);
  if (restored.playbackRate !== undefined) {
    throw new Error("Original playback rate should omit the optional field");
  }
});
