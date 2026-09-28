import { AUDIO_PIXEL_TICKS, collectAudioEvents } from './audio-core.mjs?rev=20260928-dot-music-1';

/** Keep imported premium work visible and intact while pausing edits and playback. */
export function evaluateAudioPassPolicy(song, { passActive = false, extraInstrumentIds = [] } = {}) {
  const wideCanvas = song.loopTicks / AUDIO_PIXEL_TICKS > 16;
  const extraInstruments = new Set(extraInstrumentIds);
  const usesExtraInstrument = collectAudioEvents(song).some(({ instrument }) => extraInstruments.has(instrument));
  const premiumContent = wideCanvas || usesExtraInstrument;
  return Object.freeze({
    wideCanvas,
    usesExtraInstrument,
    premiumContent,
    locked: premiumContent && !passActive
  });
}
