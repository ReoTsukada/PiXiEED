import { AUDIO_PIXEL_TICKS, collectAudioEvents } from './audio-core.mjs?rev=20260930-audio-timebase-1';
import { AUDIO_EXTRA_INSTRUMENT_IDS } from './audio-timbres.mjs?rev=20260930-four-voices-1';
import { evaluateSharedCanvasPolicy } from './shared-canvas-policy.mjs?rev=20261001-free-tools-1';

/** Compatibility metadata; instruments and supported canvas sizes are available without a pass. */
export function evaluateAudioPassPolicy(song, { passActive = false, extraInstrumentPassActive = passActive, extraInstrumentIds = AUDIO_EXTRA_INSTRUMENT_IDS, sharedImage = null } = {}) {
  const wideCanvas = song.loopTicks / AUDIO_PIXEL_TICKS > 16;
  const extraInstruments = new Set(extraInstrumentIds);
  const usesExtraInstrument = collectAudioEvents(song).some(({ instrument }) => extraInstruments.has(instrument));
  let shared = null;
  if (sharedImage) {
    let colorCount = sharedImage.colorCount;
    if (!Number.isSafeInteger(colorCount) || colorCount < 1) {
      const colors = new Set();
      for (let offset = 0; offset < sharedImage.rgba.length; offset += 4) {
        colors.add(`${sharedImage.rgba[offset]}:${sharedImage.rgba[offset + 1]}:${sharedImage.rgba[offset + 2]}:${sharedImage.rgba[offset + 3]}`);
      }
      colorCount = colors.size;
    }
    shared = evaluateSharedCanvasPolicy({ width: sharedImage.width, height: sharedImage.height, colorCount }, { passActive });
  }
  const premiumContent = false;
  const locked = false;
  return Object.freeze({
    wideCanvas,
    usesExtraInstrument,
    premiumContent,
    locked
  });
}
