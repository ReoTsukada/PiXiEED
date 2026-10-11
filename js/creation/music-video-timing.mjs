export const MUSIC_VIDEO_PPQ = 480;
export const MUSIC_VIDEO_MIN_LOOPS = 1;
export const MUSIC_VIDEO_MAX_LOOPS = 8;

/** Build an immutable clock plan without changing either the song or Draw frames. */
export function createMusicVideoTimingPlan({ loopTicks, tempo, ticksPerQuarter = MUSIC_VIDEO_PPQ, loops = 1, frames } = {}) {
  if (!Number.isSafeInteger(loopTicks) || loopTicks < 1) throw new RangeError('音楽ループのtick数が不正です。');
  if (!Number.isInteger(tempo) || tempo < 60 || tempo > 180) throw new RangeError('BPMは60〜180で指定してください。');
  if (ticksPerQuarter !== MUSIC_VIDEO_PPQ) throw new RangeError(`PPQは${MUSIC_VIDEO_PPQ}にしてください。`);
  if (!Number.isInteger(loops) || loops < MUSIC_VIDEO_MIN_LOOPS || loops > MUSIC_VIDEO_MAX_LOOPS) throw new RangeError('再生回数は1〜8回で指定してください。');
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 128) throw new RangeError('動画フレームは1〜128枚で指定してください。');

  const frameDurations = frames.map((frame) => {
    if (!frame || !Number.isFinite(frame.durationMs) || frame.durationMs < 1 || frame.durationMs > 60_000) {
      throw new RangeError('各フレームの表示時間は1〜60000msで指定してください。');
    }
    return { ...(typeof frame.id === 'string' ? { id: frame.id } : {}), durationMs: frame.durationMs };
  });
  const visualDurationMs = frameDurations.reduce((total, frame) => total + frame.durationMs, 0);
  const musicDurationMs = loopTicks * 60_000 / tempo / MUSIC_VIDEO_PPQ * loops;
  if (!Number.isFinite(musicDurationMs) || musicDurationMs <= 0) throw new RangeError('音楽の動画時間が不正です。');

  return Object.freeze({
    loopTicks,
    tempo,
    ticksPerQuarter: MUSIC_VIDEO_PPQ,
    loops,
    musicDurationMs,
    visualDurationMs,
    frames: Object.freeze(frameDurations.map((frame) => Object.freeze(frame)))
  });
}

/** Sample the visual loop at music-clock time; the music endpoint is not wrapped. */
export function sampleMusicVideoFrame(plan, timeMs) {
  if (!plan || !Array.isArray(plan.frames) || !Number.isFinite(plan.musicDurationMs)
      || !Number.isFinite(plan.visualDurationMs) || plan.visualDurationMs <= 0) {
    throw new TypeError('動画タイミング計画が不正です。');
  }
  if (!Number.isFinite(timeMs) || timeMs < 0) throw new RangeError('動画の時刻は0以上の有限値で指定してください。');
  if (timeMs >= plan.musicDurationMs) {
    return { ended: true, frameIndex: null, frameId: null, musicTimeMs: timeMs, visualTimeMs: null };
  }

  const visualTimeMs = timeMs % plan.visualDurationMs;
  let frameStartMs = 0;
  for (let frameIndex = 0; frameIndex < plan.frames.length; frameIndex += 1) {
    const frame = plan.frames[frameIndex];
    const frameEndMs = frameStartMs + frame.durationMs;
    if (visualTimeMs < frameEndMs) {
      return { ended: false, frameIndex, frameId: frame.id ?? null, musicTimeMs: timeMs, visualTimeMs,
        frameTimeMs: visualTimeMs - frameStartMs };
    }
    frameStartMs = frameEndMs;
  }
  // Modulo and cumulative durations should make this unreachable except for malformed external plans.
  throw new TypeError('動画フレームの表示時間を選べません。');
}
