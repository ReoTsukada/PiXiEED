function readDelay(frame) {
  const value = Number(frame?.delayMs);
  return Number.isFinite(value) && value > 0 ? value : 500;
}

/**
 * Shared animation timeline policy. GIF has a 20ms representable floor; APNG and video
 * retain the positive source timing. Playback speed affects wall-clock frame duration.
 */
export function getOutputTiming(frames, { format = 'apng', playbackRate = 1 } = {}) {
  if (!Array.isArray(frames) || !frames.length) return { sourceDelaysMs: [], frameDelaysMs: [], sourceDurationMs: 0, durationMs: 0 };
  if (!Number.isFinite(playbackRate) || playbackRate < 0.25 || playbackRate > 4) throw new RangeError('再生速度は0.25〜4倍で指定してください。');
  const sourceDelaysMs = frames.map(readDelay);
  const minimumMs = format === 'gif' ? 20 : 1;
  const frameDelaysMs = format === 'video'
    ? sourceDelaysMs
    : sourceDelaysMs.map((delay) => {
      const scaled = Math.round(delay / playbackRate);
      return format === 'gif' ? Math.max(minimumMs, Math.round(scaled / 10) * 10) : Math.max(minimumMs, scaled);
    });
  const previewDelaysMs = format === 'video' ? sourceDelaysMs.map((delay) => delay / playbackRate) : frameDelaysMs;
  const sourceDurationMs = sourceDelaysMs.reduce((sum, delay) => sum + delay, 0);
  const durationMs = format === 'video'
    ? sourceDurationMs / playbackRate
    : frameDelaysMs.reduce((sum, delay) => sum + delay, 0);
  return { sourceDelaysMs, frameDelaysMs, previewDelaysMs, sourceDurationMs, durationMs };
}
