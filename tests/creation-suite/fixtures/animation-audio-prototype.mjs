/**
 * Isolated frame-to-audio timing sketch. This has no production imports and
 * does not modify the animation document or the production Audio schema.
 */
import { renderComposite } from './animation-prototype.mjs';

export const PROTOTYPE_PPQ = 480;
export const PROTOTYPE_TICKS_PER_CELL = 120;
export const PROTOTYPE_MAX_DIMENSION = 256;
export const PROTOTYPE_MAX_COLORS = 32;
export const PROTOTYPE_MAX_FRAMES = 128;
const FRAME_WIDTHS = new Set([16, 32, 64, 128, 256]);

function assertDimension(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > PROTOTYPE_MAX_DIMENSION) {
    throw new RangeError(`${label} must be between 1 and 256`);
  }
}

function assertAnimationDocument(document) {
  if (!document || typeof document !== 'object') throw new TypeError('Animation document is required');
  assertDimension(document.width, 'Width');
  assertDimension(document.height, 'Height');
  if (!FRAME_WIDTHS.has(document.width)) throw new RangeError('Frame width must be 16, 32, 64, 128, or 256');
  if (!Array.isArray(document.palette) || document.palette.length < 1 || document.palette.length > PROTOTYPE_MAX_COLORS
      || document.palette.some((color) => typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))) {
    throw new TypeError('Palette must contain between 1 and 32 opaque hex colors');
  }
  if (new Set(document.palette.map((color) => color.toLowerCase())).size !== document.palette.length) {
    throw new TypeError('Palette colors must be unique');
  }
  if (!Array.isArray(document.frames) || document.frames.length < 1 || document.frames.length > PROTOTYPE_MAX_FRAMES
      || document.frames.some((frame) => !frame || typeof frame.id !== 'string' || !frame.id)
      || new Set(document.frames.map((frame) => frame.id)).size !== document.frames.length) {
    throw new RangeError('Animation must contain between 1 and 128 uniquely named frames');
  }
  if (!Array.isArray(document.layers) || !(document.images instanceof Map)) throw new TypeError('Animation layers or image store are missing');

  // Validate stored palette indexes before renderComposite or any typed-array
  // conversion can wrap malformed values such as 257 into a valid color.
  for (const image of document.images.values()) {
    if (!image || !Number.isInteger(image.width) || !Number.isInteger(image.height)
        || image.width < 1 || image.height < 1 || !image.bytes || typeof image.bytes.length !== 'number'
        || image.bytes.length !== image.width * image.height) throw new TypeError('Animation image byte count is invalid');
    for (let index = 0; index < image.bytes.length; index += 1) {
      const value = image.bytes[index];
      if (!Number.isInteger(value) || value < 0 || value > document.palette.length) {
        throw new RangeError('Animation image contains an invalid palette byte');
      }
    }
  }
  for (const layer of document.layers) {
    if (!layer || typeof layer.id !== 'string' || !(layer.cels instanceof Map)) throw new TypeError('Animation layer is invalid');
    for (const frame of document.frames) {
      const ref = layer.cels.get(frame.id);
      if (ref === null || ref === undefined) continue;
      const image = document.images.get(ref.imageId);
      if (!image || !Number.isInteger(ref.x) || !Number.isInteger(ref.y) || ref.x < 0 || ref.y < 0
          || ref.x + image.width > document.width || ref.y + image.height > document.height) {
        throw new TypeError('Animation cel reference is invalid');
      }
    }
  }
}

function rowPitchMap(height, supplied) {
  const pitches = supplied === undefined
    ? Array.from({ length: height }, (_, row) => Math.round(96 - (96 - 36) * row / Math.max(1, height - 1)))
    : supplied;
  if (!Array.isArray(pitches) || pitches.length !== height
      || pitches.some((pitch) => !Number.isInteger(pitch) || pitch < 0 || pitch > 127)) {
    throw new TypeError('Row pitches must contain one MIDI pitch per row');
  }
  return pitches;
}

/** Build a chronological note list; source duration metadata never sets audio time. */
export function buildAnimationAudioPrototype(document, {
  bpm = 120,
  rowPitches,
  instrumentByColor = {}
} = {}) {
  assertAnimationDocument(document);
  if (!Number.isInteger(bpm) || bpm < 60 || bpm > 180) throw new RangeError('BPM must be an integer from 60 to 180');
  if (!instrumentByColor || typeof instrumentByColor !== 'object' || Array.isArray(instrumentByColor)) {
    throw new TypeError('Color-to-instrument mapping must be an object');
  }
  const pitches = rowPitchMap(document.height, rowPitches);
  const width = document.width;
  const frameTicks = width * PROTOTYPE_TICKS_PER_CELL;
  const loopTicks = document.frames.length * frameTicks;
  const secondsPerTick = 60 / bpm / PROTOTYPE_PPQ;
  const activeLayers = document.layers.filter((layer) => layer.visible !== false);

  const events = [];
  const openRuns = Array(document.height).fill(null);
  const flush = (row) => {
    if (openRuns[row]) events.push(openRuns[row]);
    openRuns[row] = null;
  };
  const frameOrder = [];
  const compositeDocument = { ...document, layers: activeLayers };
  for (let frameIndex = 0; frameIndex < document.frames.length; frameIndex += 1) {
    const frame = document.frames[frameIndex];
    const sequenceCellStart = frameIndex * width;
    frameOrder.push({ frameId: frame.id, frameIndex, sequenceCellStart, startTick: sequenceCellStart * PROTOTYPE_TICKS_PER_CELL });
    // Keep only this frame's composite alive while feeding the per-row runs.
    const pixels = renderComposite(compositeDocument, frame.id);
    for (let row = 0; row < document.height; row += 1) {
      for (let x = 0; x < width; x += 1) {
        const paletteByte = pixels[row * width + x];
        const colorIndex = paletteByte - 1;
        const color = paletteByte === 0 ? null : document.palette[colorIndex];
        const instrument = color && Object.hasOwn(instrumentByColor, color) ? instrumentByColor[color] : null;
        const sequenceCell = sequenceCellStart + x;
        if (!color || !instrument) { flush(row); continue; }
        const startTick = sequenceCell * PROTOTYPE_TICKS_PER_CELL;
        const run = openRuns[row];
        if (run && run.sequenceCell + run.cellCount === sequenceCell
            && run.pitch === pitches[row] && run.row === row
            && run.color === color && run.instrument === instrument) {
          run.cellCount += 1;
          run.durationTicks += PROTOTYPE_TICKS_PER_CELL;
          run.endFrameIndex = frameIndex;
        } else {
          flush(row);
          openRuns[row] = {
            startTick,
            durationTicks: PROTOTYPE_TICKS_PER_CELL,
            sequenceCell,
            cellCount: 1,
            row,
            pitch: pitches[row],
            color,
            instrument,
            startFrameIndex: frameIndex,
            endFrameIndex: frameIndex
          };
        }
      }
    }
  }
  for (let row = 0; row < document.height; row += 1) flush(row);
  events.sort((left, right) => left.startTick - right.startTick || left.row - right.row);

  return {
    bpm,
    ticksPerQuarter: PROTOTYPE_PPQ,
    ticksPerCell: PROTOTYPE_TICKS_PER_CELL,
    frameTicks,
    loopTicks,
    secondsPerCell: PROTOTYPE_TICKS_PER_CELL * secondsPerTick,
    durationSeconds: loopTicks * secondsPerTick,
    frameOrder,
    events
  };
}
