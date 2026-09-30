/** Compact, sample-free instrument models for the pixel music editor. */
const voice = (id, name, waveform, attack, decay, sustain, release, options = {}) => Object.freeze({
  id, name, waveform, attack, decay, sustain, release,
  duty: options.duty ?? 0.5,
  partials: Object.freeze(options.partials ?? []),
  filter: options.filter ?? null,
  noiseColor: options.noiseColor ?? 'white',
  transient: options.transient ?? 0
});

const partial = (waveform, ratio, gain, detune = 0) => Object.freeze({ waveform, ratio, gain, detune });
const low = (frequency) => Object.freeze({ type: 'lowpass', frequency, q: 0.7 });
const band = (frequency, q = 1) => Object.freeze({ type: 'bandpass', frequency, q });
const high = (frequency) => Object.freeze({ type: 'highpass', frequency, q: 0.7 });

export const AUDIO_INSTRUMENTS = Object.freeze([
  // The original four IDs stay stable so existing songs and defaults continue to play.
  voice('square', '矩形波', 'pulse', 0.002, 0.028, 0.62, 0.018, { duty: 0.25 }),
  voice('triangle', '三角波', 'triangle', 0.004, 0.042, 0.58, 0.026),
  voice('sawtooth', 'のこぎり波', 'sawtooth', 0.002, 0.024, 0.48, 0.018),
  voice('noise', 'ノイズ', 'noise', 0.001, 0.012, 0.32, 0.008),
  // Keyboard family: decay, inharmonic partials and filtered attacks separate the models.
  voice('piano', 'ピアノ', 'sine', 0.004, 0.76, 0.24, 0.42, { partials: [partial('sine', 2, 0.20), partial('triangle', 3, 0.08)], filter: low(5800), transient: 0.08 }),
  voice('piano-soft', 'ソフトピアノ', 'sine', 0.007, 0.98, 0.30, 0.52, { partials: [partial('sine', 2, 0.12), partial('triangle', 4, 0.04)], filter: low(3900), transient: 0.04 }),
  voice('electric-piano', 'エレクトリックピアノ', 'sine', 0.006, 0.52, 0.58, 0.24, { partials: [partial('pulse', 2, 0.20, 4)], filter: low(3800), transient: 0.035 }),
  voice('organ', 'オルガン', 'pulse', 0.014, 0.09, 0.84, 0.18, { partials: [partial('sine', 2, 0.36), partial('sine', 3, 0.18)], filter: low(5500) }),
  voice('clavinet', 'クラビネット', 'pulse', 0.001, 0.17, 0.16, 0.08, { duty: 0.25, partials: [partial('sawtooth', 2, 0.12)], filter: band(2200, 1.1), transient: 0.2 }),
  voice('celesta', 'チェレスタ', 'sine', 0.003, 1.0, 0.12, 0.62, { partials: [partial('sine', 2.71, 0.14), partial('sine', 4.12, 0.05)], filter: low(7200), transient: 0.06 }),
  // Plucked, bowed and mallet instruments.
  voice('guitar', 'アコースティックギター', 'triangle', 0.002, 0.42, 0.17, 0.18, { partials: [partial('sine', 2, 0.12)], filter: low(3200), transient: 0.18 }),
  voice('electric-guitar', 'エレキギター', 'sawtooth', 0.002, 0.56, 0.28, 0.22, { partials: [partial('triangle', 2, 0.18, 3)], filter: low(4600), transient: 0.12 }),
  voice('bass', 'ベース', 'triangle', 0.004, 0.28, 0.52, 0.18, { partials: [partial('sawtooth', 1, 0.22, -7)], filter: low(1250), transient: 0.04 }),
  voice('strings', 'ストリングス', 'sawtooth', 0.075, 0.26, 0.78, 0.52, { partials: [partial('triangle', 1, 0.36, -6)], filter: low(3100) }),
  voice('violin', 'バイオリン', 'sawtooth', 0.048, 0.18, 0.78, 0.36, { partials: [partial('triangle', 2, 0.20, 5)], filter: low(4200) }),
  voice('cello', 'チェロ', 'triangle', 0.082, 0.28, 0.76, 0.42, { partials: [partial('sawtooth', 2, 0.16, -4)], filter: low(2200) }),
  voice('harp', 'ハープ', 'sine', 0.002, 0.54, 0.12, 0.34, { partials: [partial('sine', 2, 0.20), partial('triangle', 3, 0.08)], filter: low(6200), transient: 0.12 }),
  voice('marimba', 'マリンバ', 'triangle', 0.002, 0.26, 0.08, 0.12, { partials: [partial('sine', 3.9, 0.14), partial('sine', 9.2, 0.035)], filter: low(5200), transient: 0.1 }),
  voice('kalimba', 'カリンバ', 'sine', 0.002, 0.46, 0.10, 0.18, { partials: [partial('sine', 2.76, 0.20), partial('triangle', 5.4, 0.04)], filter: low(4800), transient: 0.08 }),
  voice('vibraphone', 'ビブラフォン', 'sine', 0.006, 0.90, 0.52, 0.52, { partials: [partial('sine', 3.0, 0.18)], filter: low(5600) }),
  voice('xylophone', 'シロフォン', 'triangle', 0.001, 0.22, 0.06, 0.10, { partials: [partial('sine', 3.1, 0.17), partial('sine', 6.2, 0.05)], filter: low(6700), transient: 0.12 }),
  voice('tubular-bells', 'チューブラーベル', 'sine', 0.002, 1.8, 0.30, 0.78, { partials: [partial('sine', 2.76, 0.18), partial('sine', 5.4, 0.07)], filter: low(6500), transient: 0.08 }),
  voice('steel-drum', 'スティールドラム', 'sine', 0.003, 0.72, 0.16, 0.30, { partials: [partial('sine', 2.4, 0.24), partial('sine', 4.5, 0.08)], filter: low(6200), transient: 0.08 }),
  // Breath and brass: slower attack, stronger upper partials and band shaping.
  voice('flute', 'フルート', 'sine', 0.028, 0.18, 0.74, 0.18, { partials: [partial('sine', 2, 0.08)], filter: low(5200), transient: 0.06 }),
  voice('clarinet', 'クラリネット', 'pulse', 0.024, 0.17, 0.70, 0.13, { duty: 0.25, partials: [partial('sine', 3, 0.12)], filter: low(3400), transient: 0.035 }),
  voice('saxophone', 'サクソフォン', 'sawtooth', 0.024, 0.18, 0.74, 0.17, { partials: [partial('pulse', 2, 0.12, 4)], filter: band(1650, 0.75), transient: 0.08 }),
  voice('trumpet', 'トランペット', 'sawtooth', 0.018, 0.15, 0.70, 0.12, { partials: [partial('pulse', 2, 0.22, 3)], filter: low(4600), transient: 0.08 }),
  voice('brass', 'ブラス', 'pulse', 0.028, 0.21, 0.76, 0.19, { partials: [partial('sawtooth', 2, 0.20, -4)], filter: low(3900), transient: 0.06 }),
  // Synth voices, percussion noise and distinct Game Boy / NES channel models.
  voice('synth-lead', 'シンセリード', 'sawtooth', 0.008, 0.26, 0.62, 0.18, { partials: [partial('pulse', 1, 0.20, 7)], filter: low(5200) }),
  voice('synth-pad', 'シンセパッド', 'triangle', 0.12, 0.52, 0.72, 0.68, { partials: [partial('sawtooth', 1, 0.18, -9)], filter: low(2900) }),
  voice('tambourine', 'タンバリン', 'noise', 0.001, 0.15, 0.035, 0.08, { filter: high(5400), transient: 0.5 }),
  voice('shaker', 'シェイカー', 'noise', 0.001, 0.095, 0.025, 0.048, { filter: high(3800), noiseColor: 'pink', transient: 0.3 }),
  voice('gb-pulse-1', 'GB Pulse 1', 'pulse', 0.001, 0.12, 0.56, 0.024, { duty: 0.25, filter: low(8500) }),
  voice('gb-pulse-2', 'GB Pulse 2', 'pulse', 0.001, 0.15, 0.50, 0.028, { filter: low(7400) }),
  voice('gb-wave', 'GB Wave', 'triangle', 0.001, 0.22, 0.52, 0.042, { filter: low(6800) }),
  voice('gb-noise', 'GB Noise', 'noise', 0.001, 0.09, 0.18, 0.022, { filter: high(3800) }),
  voice('nes-pulse-1', 'NES Pulse 1', 'pulse', 0.001, 0.135, 0.54, 0.025, { duty: 0.125, filter: low(8100) }),
  voice('nes-pulse-2', 'NES Pulse 2', 'pulse', 0.001, 0.155, 0.50, 0.028, { duty: 0.25, filter: low(7200) }),
  voice('nes-triangle', 'NES Triangle', 'triangle', 0.001, 0.26, 0.78, 0.032, { filter: low(5600) }),
  voice('nes-noise', 'NES Noise', 'noise', 0.001, 0.105, 0.20, 0.024, { filter: high(2600) }),
  // Additional compact presets for image-seeded pixel music.
  voice('woodblock', 'ウッドブロック', 'triangle', 0.001, 0.09, 0.03, 0.045, { partials: [partial('sine', 3.2, 0.16)], filter: band(1700, 1.4), transient: 0.18 }),
  voice('synth-bell', 'シンセベル', 'sine', 0.002, 0.8, 0.12, 0.42, { partials: [partial('sine', 2.76, 0.24), partial('sine', 5.4, 0.08)], filter: low(7200), transient: 0.05 }),
  voice('soft-bell', 'ソフトベル', 'triangle', 0.012, 0.68, 0.18, 0.48, { partials: [partial('sine', 2.01, 0.14), partial('sine', 3.9, 0.04)], filter: low(4400) }),
  voice('pluck-synth', 'プラックシンセ', 'pulse', 0.001, 0.24, 0.10, 0.12, { duty: 0.18, partials: [partial('triangle', 2, 0.13)], filter: low(3500), transient: 0.08 }),
  voice('warm-pad', 'ウォームパッド', 'triangle', 0.16, 0.42, 0.78, 0.54, { partials: [partial('sine', 1.005, 0.28, -5)], filter: low(2100) }),
  voice('reed-organ', 'リードオルガン', 'pulse', 0.025, 0.12, 0.72, 0.16, { duty: 0.3, partials: [partial('sine', 2, 0.16)], filter: band(1900, 0.8) }),
  voice('digital-chime', 'デジタルチャイム', 'sine', 0.001, 0.48, 0.08, 0.30, { partials: [partial('pulse', 2.5, 0.10), partial('sine', 4.75, 0.04)], filter: low(8000), transient: 0.10 }),
  voice('low-drum', 'ロウドラム', 'noise', 0.001, 0.14, 0.025, 0.05, { filter: low(220), noiseColor: 'pink', transient: 0.34 })
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
  ['その他', 40, AUDIO_INSTRUMENTS.length]
].map(([name, first, end]) => Object.freeze({ name, instruments: Object.freeze(AUDIO_INSTRUMENTS.slice(first, end)) })));

const instrumentById = new Map(AUDIO_INSTRUMENTS.map((instrument) => [instrument.id, instrument]));
export function getAudioInstrument(id) {
  return instrumentById.get(id) ?? null;
}
