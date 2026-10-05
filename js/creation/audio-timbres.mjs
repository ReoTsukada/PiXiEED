/** Compact, sample-free instrument models for the pixel music editor. */
const voice = (id, name, waveform, attack, decay, sustain, release, options = {}) => Object.freeze({
  id, name, waveform, attack, decay, sustain, release,
  duty: options.duty ?? 0.5,
  partials: Object.freeze((options.partials ?? []).map((item) => Object.freeze({ ...item, ...(item.filter ? { filter: Object.freeze({ ...item.filter }) } : {}) }))),
  harmonics: Object.freeze((options.harmonics ?? []).map((item) => Object.freeze({ ...item }))),
  filter: options.filter ? Object.freeze({ ...options.filter }) : null,
  vibrato: options.vibrato ? Object.freeze({ ...options.vibrato }) : null,
  tremolo: options.tremolo ? Object.freeze({ ...options.tremolo }) : null,
  steps: options.steps ?? null,
  noiseMode: options.noiseMode ?? null,
  noiseColor: options.noiseColor ?? 'white',
  drum: options.drum ? Object.freeze({ ...options.drum }) : null,
  pitchSweep: options.pitchSweep ? Object.freeze({ ...options.pitchSweep }) : null,
  transient: typeof options.transient === 'object' ? Object.freeze({ ...options.transient, bursts: Object.freeze([...options.transient.bursts]) }) : (options.transient ?? 0)
});

const partial = (waveform, ratio, gain, detune = 0, decay = 1) => Object.freeze({ waveform, ratio, gain, detune, decay });
// Weak stiff-string stretch preserves increasing mode frequencies; fitted gains are approximate.
const pianoMode = (mode) => mode * Math.sqrt((1 + 0.00012 * mode * mode) / 1.00012);
const harmonic = (ratio, gain) => Object.freeze({ ratio, gain });
const low = (frequency) => Object.freeze({ type: 'lowpass', frequency, q: 0.7 });
const band = (frequency, q = 1) => Object.freeze({ type: 'bandpass', frequency, q });
const high = (frequency) => Object.freeze({ type: 'highpass', frequency, q: 0.7 });
const movingLow = (frequency, attackFrequency, decay, tracking = 0) => Object.freeze({ type: 'lowpass', frequency, q: 0.7, attackFrequency, decay, tracking });
const vibrato = (rate, depth, delay = 0) => Object.freeze({ rate, depth, delay });
const tremolo = (rate, depth) => Object.freeze({ rate, depth });

// Spectral shapes are compact approximations informed by measured examples in docs/audio-sound-quality.md.
export const AUDIO_INSTRUMENTS = Object.freeze([
  // The original four IDs stay stable so existing songs and defaults continue to play.
  voice('square', '矩形波', 'pulse', 0.002, 0.028, 0.62, 0.018, { duty: 0.25 }),
  voice('triangle', '三角波', 'triangle', 0.004, 0.042, 0.58, 0.026),
  voice('sawtooth', 'のこぎり波', 'sawtooth', 0.002, 0.024, 0.48, 0.018),
  voice('noise', 'ノイズ', 'noise', 0.001, 0.012, 0.32, 0.008),
  // Keyboard family: decay, inharmonic partials and filtered attacks separate the models.
  voice('piano', 'ピアノ', 'sine', 0.004, 1.5, 0.015, 0.42, { partials: [partial('sine', pianoMode(2), 0.23, 0, 0.72), partial('sine', pianoMode(3), 0.106, 0, 0.62), partial('sine', pianoMode(4), 0.088, 0, 0.52), partial('sine', pianoMode(5), 0.043, 0, 0.42), partial('sine', pianoMode(6), 0.074, 0, 0.34), partial('sine', pianoMode(7), 0.065, 0, 0.26)], filter: movingLow(5200, 7600, 0.18), transient: 0.055 }),
  voice('piano-soft', 'ソフトピアノ', 'sine', 0.007, 1.8, 0.01, 0.52, { partials: [partial('sine', pianoMode(2), 0.11, 0, 0.62), partial('sine', pianoMode(4), 0.035, 0, 0.38), partial('sine', pianoMode(6), 0.012, 0, 0.24)], filter: movingLow(3400, 5000, 0.24), transient: 0.025 }),
  voice('electric-piano', 'エレクトリックピアノ', 'sine', 0.006, 0.52, 0.58, 0.24, { partials: [partial('pulse', 2, 0.16, 4, 0.72), partial('sine', 3, 0.045, 0, 0.48)], filter: movingLow(3400, 5200, 0.16), tremolo: tremolo(5.2, 0.07), transient: 0.025 }),
  voice('organ', 'オルガン', 'custom', 0.012, 0.08, 0.86, 0.16, { harmonics: [harmonic(2, 0.34), harmonic(3, 0.18), harmonic(4, 0.09), harmonic(5, 0.055), harmonic(6, 0.032)], filter: low(5400) }),
  voice('clavinet', 'クラビネット', 'pulse', 0.001, 0.15, 0.10, 0.065, { duty: 0.24, partials: [partial('sawtooth', 2, 0.09, 0, 0.35)], filter: movingLow(2100, 4300, 0.055), transient: 0.12 }),
  voice('celesta', 'チェレスタ', 'sine', 0.003, 0.84, 0.08, 0.58, { partials: [partial('sine', 2.71, 0.12, 0, 0.66), partial('sine', 4.12, 0.035, 0, 0.42)], filter: low(6800), transient: 0.035 }),
  // Plucked, bowed and mallet instruments.
  voice('guitar', 'アコースティックギター', 'triangle', 0.002, 0.40, 0.06, 0.16, { partials: [partial('sine', 2, 0.20, 0, 0.42), partial('sine', 3, 0.10, 0, 0.26), partial('sine', 4, 0.055, 0, 0.18), partial('sine', 5, 0.03, 0, 0.12)], filter: movingLow(2700, 5700, 0.14), transient: 0.09 }),
  voice('electric-guitar', 'エレキギター', 'sawtooth', 0.002, 0.48, 0.18, 0.20, { partials: [partial('triangle', 2, 0.13, 3, 0.62), partial('sine', 3, 0.035, -2, 0.42)], filter: movingLow(3900, 6500, 0.2), transient: 0.075 }),
  voice('bass', 'ベース', 'triangle', 0.004, 0.25, 0.45, 0.15, { partials: [partial('sine', 2, 0.20, 0, 0.8), partial('sine', 3, 0.07, 0, 0.55), partial('sine', 4, 0.025, 0, 0.35)], filter: movingLow(1150, 1800, 0.16, 0.9), transient: 0.025 }),
  voice('strings', 'ストリングス', 'custom', 0.09, 0.22, 0.76, 0.48, { harmonics: [harmonic(2, 0.36), harmonic(3, 0.18), harmonic(4, 0.09), harmonic(5, 0.045), harmonic(6, 0.022)], filter: low(3100), vibrato: vibrato(5.1, 0.003, 0.28), tremolo: tremolo(4.2, 0.025) }),
  voice('violin', 'バイオリン', 'custom', 0.055, 0.16, 0.78, 0.34, { harmonics: [harmonic(2, 0.89), harmonic(3, 0.71), harmonic(8, 0.43), harmonic(10, 0.18), harmonic(14, 0.23)], filter: low(4200), vibrato: vibrato(5.6, 0.004, 0.20) }),
  voice('cello', 'チェロ', 'custom', 0.085, 0.25, 0.74, 0.40, { harmonics: [harmonic(2, 0.28), harmonic(3, 0.15), harmonic(4, 0.065), harmonic(5, 0.025)], filter: movingLow(2100, 2900, 0.24, 0.35), vibrato: vibrato(4.7, 0.0025, 0.32) }),
  voice('harp', 'ハープ', 'sine', 0.002, 0.50, 0.07, 0.30, { partials: [partial('sine', 2, 0.24, 0, 0.52), partial('sine', 3, 0.12, 0, 0.34), partial('sine', 4, 0.055, 0, 0.22), partial('sine', 5, 0.025, 0, 0.15)], filter: low(5800), transient: 0.07 }),
  voice('marimba', 'マリンバ', 'sine', 0.002, 0.24, 0.025, 0.11, { partials: [partial('sine', 3, 0.015, 0, 0.34), partial('sine', 4, 0.008, 0, 0.28), partial('sine', 10, 0.004, 0, 0.18)], filter: low(4900), transient: 0.045 }),
  voice('kalimba', 'カリンバ', 'sine', 0.002, 0.42, 0.07, 0.16, { partials: [partial('sine', 2.76, 0.17, 0, 0.6), partial('sine', 5.4, 0.035, 0, 0.34)], filter: low(4500), transient: 0.055 }),
  voice('vibraphone', 'ビブラフォン', 'sine', 0.006, 1.2, 0.38, 0.48, { partials: [partial('sine', 2.74, 0.30, 0, 0.95), partial('sine', 2.97, 0.24, 0, 0.90), partial('sine', 10.05, 0.11, 0, 0.82)], filter: low(5300), tremolo: tremolo(5.1, 0.08) }),
  voice('xylophone', 'シロフォン', 'triangle', 0.001, 0.20, 0.035, 0.09, { partials: [partial('sine', 3.1, 0.14, 0, 0.38), partial('sine', 6.2, 0.04, 0, 0.22)], filter: low(6200), transient: 0.075 }),
  voice('tubular-bells', 'チューブラーベル', 'sine', 0.002, 1.65, 0.22, 0.72, { partials: [partial('sine', 2.76, 0.16, 0, 0.92), partial('sine', 5.4, 0.055, 0, 0.72)], filter: low(6200), transient: 0.05 }),
  voice('steel-drum', 'スティールドラム', 'sine', 0.003, 0.68, 0.12, 0.28, { partials: [partial('sine', 2.4, 0.20, 0, 0.72), partial('sine', 4.5, 0.06, 0, 0.45)], filter: low(5800), transient: 0.05 }),
  // Breath and brass: slower attack, stronger upper partials and band shaping.
  voice('flute', 'フルート', 'custom', 0.035, 0.16, 0.74, 0.16, { harmonics: [harmonic(2, 0.07), harmonic(3, 0.018)], partials: [partial('noise', 1, 0.035)], filter: movingLow(4800, 6100, 0.12, 0.35), noiseColor: 'pink', transient: 0.025 }),
  voice('clarinet', 'クラリネット', 'custom', 0.025, 0.15, 0.70, 0.12, { harmonics: [harmonic(3, 0.30), harmonic(5, 0.12), harmonic(7, 0.055), harmonic(9, 0.025), harmonic(11, 0.012)], filter: low(3400), transient: 0.025 }),
  voice('saxophone', 'サクソフォン', 'custom', 0.025, 0.16, 0.73, 0.16, { harmonics: [harmonic(2, 0.42), harmonic(3, 0.30), harmonic(4, 0.18), harmonic(5, 0.09), harmonic(6, 0.045)], filter: Object.freeze({ type: 'bandpass', frequency: 1750, q: 0.8, attackFrequency: 1150, decay: 0.20, tracking: 0.25 }), vibrato: vibrato(5.0, 0.002, 0.18), transient: 0.045 }),
  voice('trumpet', 'トランペット', 'custom', 0.02, 0.14, 0.69, 0.11, { harmonics: [harmonic(2, 0.46), harmonic(3, 0.31), harmonic(4, 0.21), harmonic(5, 0.13), harmonic(6, 0.075)], filter: movingLow(3900, 5900, 0.12, 0.2), vibrato: vibrato(5.3, 0.0015, 0.24), transient: 0.045 }),
  voice('brass', 'ブラス', 'custom', 0.03, 0.19, 0.74, 0.18, { harmonics: [harmonic(2, 0.38), harmonic(3, 0.24), harmonic(4, 0.14), harmonic(5, 0.07)], filter: movingLow(3400, 5100, 0.17, 0.15), transient: 0.035 }),
  // Synth voices, percussion noise and distinct Game Boy / NES channel models.
  voice('synth-lead', 'シンセリード', 'custom', 0.008, 0.24, 0.61, 0.16, { harmonics: [harmonic(2, 0.36), harmonic(3, 0.18), harmonic(4, 0.08)], filter: movingLow(4600, 6800, 0.16), vibrato: vibrato(5.2, 0.001, 0.4) }),
  voice('synth-pad', 'シンセパッド', 'custom', 0.14, 0.50, 0.70, 0.62, { harmonics: [harmonic(2, 0.22), harmonic(3, 0.08), harmonic(4, 0.03)], filter: low(2800), vibrato: vibrato(0.35, 0.0015, 0.5), tremolo: tremolo(0.25, 0.035) }),
  voice('tambourine', 'タンバリン', 'noise', 0.001, 0.12, 0.02, 0.06, { filter: high(5200), transient: 0.28 }),
  voice('shaker', 'シェイカー', 'noise', 0.001, 0.08, 0.018, 0.04, { filter: high(3600), noiseColor: 'pink', transient: 0.18 }),
  voice('gb-pulse-1', 'GB Pulse 1', 'pulse', 0.001, 0.10, 0.52, 0.022, { duty: 0.25, filter: low(8500) }),
  voice('gb-pulse-2', 'GB Pulse 2', 'pulse', 0.001, 0.13, 0.47, 0.026, { duty: 0.125, filter: low(7400) }),
  voice('gb-wave', 'GB Wave', 'triangle', 0.001, 0.20, 0.48, 0.038, { steps: 32, filter: low(6800) }),
  voice('gb-noise', 'GB Noise', 'noise', 0.001, 0.075, 0.14, 0.02, { noiseMode: 'gb', filter: high(3600) }),
  voice('nes-pulse-1', 'NES Pulse 1', 'pulse', 0.001, 0.12, 0.50, 0.023, { duty: 0.125, filter: low(8100) }),
  voice('nes-pulse-2', 'NES Pulse 2', 'pulse', 0.001, 0.14, 0.46, 0.026, { duty: 0.25, filter: low(7200) }),
  voice('nes-triangle', 'NES Triangle', 'triangle', 0.001, 0.24, 0.72, 0.03, { steps: 16, filter: low(5600) }),
  voice('nes-noise', 'NES Noise', 'noise', 0.001, 0.09, 0.16, 0.022, { noiseMode: 'nes', filter: high(2600) }),
  // Additional compact presets for image-seeded pixel music.
  voice('woodblock', 'ウッドブロック', 'triangle', 0.001, 0.075, 0.018, 0.04, { partials: [partial('sine', 3.2, 0.12, 0, 0.32)], filter: band(1500, 1.4), transient: 0.11 }),
  voice('synth-bell', 'シンセベル', 'sine', 0.002, 0.74, 0.09, 0.38, { partials: [partial('sine', 2.76, 0.21, 0, 0.86), partial('sine', 5.4, 0.065, 0, 0.64)], filter: low(6800), transient: 0.035 }),
  voice('soft-bell', 'ソフトベル', 'triangle', 0.012, 0.64, 0.13, 0.44, { partials: [partial('sine', 2.01, 0.12, 0, 0.78), partial('sine', 3.9, 0.03, 0, 0.55)], filter: low(4200) }),
  voice('pluck-synth', 'プラックシンセ', 'pulse', 0.001, 0.22, 0.06, 0.10, { duty: 0.18, partials: [partial('triangle', 2, 0.11, 0, 0.48)], filter: movingLow(3000, 5200, 0.09), transient: 0.055 }),
  voice('warm-pad', 'ウォームパッド', 'custom', 0.16, 0.42, 0.76, 0.52, { harmonics: [harmonic(2, 0.18), harmonic(3, 0.06), harmonic(4, 0.02)], filter: low(2100), vibrato: vibrato(0.28, 0.001, 0.6), tremolo: tremolo(0.2, 0.025) }),
  voice('reed-organ', 'リードオルガン', 'custom', 0.028, 0.12, 0.70, 0.15, { duty: 0.3, harmonics: [harmonic(2, 0.24), harmonic(3, 0.11), harmonic(4, 0.045)], filter: band(1850, 0.85), vibrato: vibrato(4.6, 0.001) }),
  voice('digital-chime', 'デジタルチャイム', 'sine', 0.001, 0.44, 0.055, 0.27, { partials: [partial('pulse', 2.5, 0.09, 0, 0.7), partial('sine', 4.75, 0.035, 0, 0.48)], filter: low(7600), transient: 0.065 }),
  voice('low-drum', 'ロウドラム', 'sine', 0.001, 0.13, 0.015, 0.045, { partials: [partial('noise', 1, 0.28, 0, 0.45)], filter: movingLow(180, 420, 0.045), noiseColor: 'pink', transient: 0.12 }),
  // Fixed-pitch one-shots: every occupied column is a fresh hit. Existing 48 slots stay stable.
  voice('drum-kick', 'キック', 'sine', 0.001, 0.19, 0.004, 0.06, { drum: { frequency: 52, duration: 0.42 }, pitchSweep: { fromRatio: 3.8, seconds: 0.055 }, partials: [partial('sine', 2, 0.09, 0, 0.22)], transient: 0.12 }),
  voice('drum-snare', 'スネア', 'sine', 0.001, 0.16, 0.006, 0.055, { drum: { frequency: 185, duration: 0.32 }, pitchSweep: { fromRatio: 1.35, seconds: 0.022 }, partials: [{ ...partial('noise', 1, 0.85, 0, 0.9), filter: band(2400, 0.65) }, partial('sine', 1.63, 0.24, 0, 0.48)], transient: 0.07 }),
  voice('drum-hat-closed', 'クローズハイハット', 'noise', 0.001, 0.055, 0.002, 0.02, { drum: { frequency: 450, duration: 0.11, chokeGroup: 'hi-hat' }, partials: [partial('sine', 7.1, 0.24, 0, 0.9), partial('sine', 10.43, 0.22, 0, 0.85), partial('sine', 13.17, 0.18, 0, 0.8), partial('sine', 17.31, 0.14, 0, 0.75)], filter: high(6200) }),
  voice('drum-hat-open', 'オープンハイハット', 'noise', 0.001, 0.4, 0.01, 0.12, { drum: { frequency: 450, duration: 0.55, chokeGroup: 'hi-hat' }, partials: [partial('sine', 7.1, 0.24, 0, 0.95), partial('sine', 10.43, 0.22, 0, 0.9), partial('sine', 13.17, 0.18, 0, 0.85), partial('sine', 17.31, 0.14, 0, 0.8)], filter: high(5400) }),
  voice('drum-tom-low', 'ロータム', 'sine', 0.001, 0.24, 0.004, 0.07, { drum: { frequency: 100, duration: 0.4 }, pitchSweep: { fromRatio: 1.7, seconds: 0.045 }, partials: [partial('sine', 1.59, 0.25, 0, 0.8), partial('sine', 2.14, 0.1, 0, 0.55), { ...partial('noise', 1, 0.1, 0, 0.2), filter: band(1500, 0.7) }], transient: 0.035 }),
  voice('drum-tom-high', 'ハイタム', 'sine', 0.001, 0.18, 0.004, 0.055, { drum: { frequency: 160, duration: 0.31 }, pitchSweep: { fromRatio: 1.65, seconds: 0.038 }, partials: [partial('sine', 1.59, 0.25, 0, 0.8), partial('sine', 2.14, 0.1, 0, 0.55), { ...partial('noise', 1, 0.1, 0, 0.2), filter: band(2100, 0.7) }], transient: 0.035 }),
  voice('drum-clap', 'クラップ', 'noise', 0.001, 0.09, 0.005, 0.045, { drum: { frequency: 900, duration: 0.18 }, filter: band(1600, 0.65), transient: { gain: 0.9, bursts: [0, 0.012, 0.024], duration: 0.016 } }),
  voice('drum-crash', 'クラッシュ', 'noise', 0.001, 0.8, 0.005, 0.22, { drum: { frequency: 600, duration: 1.15 }, partials: [partial('sine', 4.13, 0.25, 0, 1), partial('sine', 5.39, 0.23, 0, 0.95), partial('sine', 7.31, 0.2, 0, 0.9), partial('sine', 10.87, 0.17, 0, 0.85), partial('sine', 13.9, 0.14, 0, 0.8), partial('sine', 18.17, 0.12, 0, 0.7)], filter: high(3000) })
]);

/** Only the four original voices are free; every later preset shares the site pass. */
export const AUDIO_BASIC_INSTRUMENT_IDS = Object.freeze(AUDIO_INSTRUMENTS.slice(0, 4).map(({ id }) => id));
export const AUDIO_EXTRA_INSTRUMENT_IDS = Object.freeze(AUDIO_INSTRUMENTS.slice(4).map(({ id }) => id));

/** The compact editor keeps the iAUDIO-inspired shelf scannable without loading samples. */
export const AUDIO_INSTRUMENT_GROUPS = Object.freeze([
  ['基本4音色', 0, 4],
  ['鍵盤', 4, 10],
  ['弦・打弦', 10, 23],
  ['管・金管', 23, 28],
  ['シンセ', 28, 30],
  ['打楽器', 30, 32],
  ['Game Boy', 32, 36],
  ['Famicom', 36, 40],
  ['その他', 40, 48],
  ['ドラム', 48, AUDIO_INSTRUMENTS.length]
].map(([name, first, end]) => Object.freeze({ name, instruments: Object.freeze(AUDIO_INSTRUMENTS.slice(first, end)) })));

const instrumentById = new Map(AUDIO_INSTRUMENTS.map((instrument) => [instrument.id, instrument]));
export function getAudioInstrument(id) {
  return instrumentById.get(id) ?? null;
}
