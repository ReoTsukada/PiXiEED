import type { AudioClip } from "../../audio/audio-200/contracts.ts";

export interface AudioTrackInterval {
  readonly clip: AudioClip;
  readonly startTick: number;
  readonly endTick: number;
}

interface TrackIndex {
  readonly intervals: readonly AudioTrackInterval[];
  readonly prefixMaxEnd: readonly number[];
}

export interface AudioTrackIntervalIndex {
  readonly trackCount: number;
  readonly clipCount: number;
  readonly query: (trackId: string, startTick: number, durationTick: number) => readonly AudioClip[];
  readonly queryMany: (trackIds: readonly string[], startTick: number, durationTick: number) => readonly AudioClip[];
}

function lowerBound(values: readonly AudioTrackInterval[], tick: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]!.startTick < tick) low = middle + 1;
    else high = middle;
  }
  return low;
}

function queryTrack(index: TrackIndex | undefined, startTick: number, durationTick: number): readonly AudioClip[] {
  if (index === undefined || !Number.isFinite(startTick) || !Number.isFinite(durationTick) || durationTick <= 0) return [];
  const endTick = startTick + durationTick;
  const result: AudioClip[] = [];
  let cursor = lowerBound(index.intervals, startTick);
  while (cursor > 0 && index.prefixMaxEnd[cursor - 1]! > startTick) cursor -= 1;
  for (; cursor < index.intervals.length; cursor += 1) {
    const interval = index.intervals[cursor]!;
    if (interval.startTick >= endTick) break;
    if (interval.endTick > startTick) result.push(interval.clip);
  }
  return result;
}

export function createAudioTrackIntervalIndex(clips: readonly AudioClip[]): AudioTrackIntervalIndex {
  const grouped = new Map<string, AudioTrackInterval[]>();
  for (const clip of clips) {
    const startTick = Number(clip.timeline.startTick);
    const endTick = startTick + Number(clip.timeline.durationTick);
    const key = String(clip.trackId);
    const list = grouped.get(key) ?? [];
    list.push({ clip, startTick, endTick });
    grouped.set(key, list);
  }
  const tracks = new Map<string, TrackIndex>();
  for (const [trackId, intervals] of grouped) {
    intervals.sort((a, b) => a.startTick - b.startTick || String(a.clip.clipId).localeCompare(String(b.clip.clipId)));
    const prefixMaxEnd: number[] = [];
    let maxEnd = -Infinity;
    for (const interval of intervals) {
      maxEnd = Math.max(maxEnd, interval.endTick);
      prefixMaxEnd.push(maxEnd);
    }
    tracks.set(trackId, { intervals, prefixMaxEnd });
  }
  return {
    trackCount: tracks.size,
    clipCount: clips.length,
    query: (trackId, startTick, durationTick) => queryTrack(tracks.get(trackId), startTick, durationTick),
    queryMany: (trackIds, startTick, durationTick) => {
      const clipsById = new Map<string, AudioClip>();
      for (const trackId of trackIds) {
        for (const clip of queryTrack(tracks.get(trackId), startTick, durationTick)) clipsById.set(String(clip.clipId), clip);
      }
      return [...clipsById.values()];
    },
  };
}
