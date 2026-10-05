import { AUDIO_INSTRUMENTS } from './audio-timbres.mjs?rev=20261005-audio-drums-1';

// Existing sound IDs remain the authority. Similar presets share a recognizable silhouette.
export const AUDIO_INSTRUMENT_ICON_FAMILIES = Object.freeze({
  "square": "square",
  "triangle": "triangle",
  "sawtooth": "sawtooth",
  "noise": "noise",
  "piano": "piano",
  "piano-soft": "piano",
  "electric-piano": "piano",
  "clavinet": "piano",
  "organ": "organ",
  "reed-organ": "organ",
  "celesta": "bell",
  "tubular-bells": "bell",
  "synth-bell": "bell",
  "soft-bell": "bell",
  "digital-chime": "bell",
  "guitar": "guitar",
  "electric-guitar": "guitar",
  "bass": "bass",
  "strings": "strings",
  "violin": "strings",
  "cello": "strings",
  "harp": "harp",
  "marimba": "mallet",
  "vibraphone": "mallet",
  "xylophone": "mallet",
  "kalimba": "kalimba",
  "steel-drum": "steel-drum",
  "flute": "flute",
  "clarinet": "clarinet",
  "saxophone": "saxophone",
  "trumpet": "brass",
  "brass": "brass",
  "synth-lead": "synth",
  "synth-pad": "synth",
  "pluck-synth": "synth",
  "warm-pad": "synth",
  "tambourine": "tambourine",
  "shaker": "shaker",
  "gb-pulse-1": "gameboy",
  "gb-pulse-2": "gameboy",
  "gb-wave": "gameboy",
  "gb-noise": "gameboy",
  "nes-pulse-1": "famicom",
  "nes-pulse-2": "famicom",
  "nes-triangle": "famicom",
  "nes-noise": "famicom",
  "woodblock": "woodblock",
  "low-drum": "drum",
  "drum-kick": "drum",
  "drum-snare": "drum",
  "drum-hat-closed": "drum",
  "drum-hat-open": "drum",
  "drum-tom-low": "drum",
  "drum-tom-high": "drum",
  "drum-clap": "drum",
  "drum-crash": "drum"
});

export function getAudioInstrumentIcon(instrumentId) {
  const family = Object.hasOwn(AUDIO_INSTRUMENT_ICON_FAMILIES, instrumentId)
    ? AUDIO_INSTRUMENT_ICON_FAMILIES[instrumentId] : 'synth';
  return {
    name: AUDIO_INSTRUMENTS.find(({ id }) => id === instrumentId)?.name || '音色',
    url: `/assets/icons/instruments/${family}.svg`
  };
}

/** Choose black or white for at least 4.5:1 contrast on an opaque sRGB color chip. */
export function audioInstrumentIconFilter(color) {
  const hex = String(color || '').match(/^#([\da-f]{6})$/i)?.[1];
  if (!hex) return 'brightness(0) invert(1)';
  const luminance = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance > 0.179 ? 'brightness(0) saturate(100%)' : 'brightness(0) invert(1)';
}
