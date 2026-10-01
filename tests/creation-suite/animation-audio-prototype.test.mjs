import test from 'node:test';
import assert from 'node:assert/strict';
import { addLayer, createAnimationDocument, duplicateFrame, setLayerVisible, writeCel } from './fixtures/animation-prototype.mjs';
import { buildAnimationAudioPrototype, PROTOTYPE_TICKS_PER_CELL } from './fixtures/animation-audio-prototype.mjs';

const COLOR_A = '#112233';
const COLOR_B = '#aabbcc';
const MAPPING = { [COLOR_A]: 'square', [COLOR_B]: 'piano' };

function blank(width, height = 1) { return new Uint8Array(width * height); }

function addBlankFrames(document, count) {
  while (document.frames.length < count) duplicateFrame(document, document.frames.at(-1).id);
  return document;
}

function writeRow(document, frameIndex, values) {
  const pixels = blank(document.width, document.height);
  for (const [x, value] of Object.entries(values)) pixels[Number(x)] = value;
  writeCel(document, { layerId: 'layer-1', frameId: document.frames[frameIndex].id, bytes: pixels });
}

test('16 columns across 32 ordered frames make 64 seconds at 120 BPM', () => {
  const document = addBlankFrames(createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A] }), 32);
  const result = buildAnimationAudioPrototype(document, { bpm: 120, instrumentByColor: MAPPING });
  assert.equal(result.durationSeconds, 64);
  assert.equal(result.frameTicks, 16 * PROTOTYPE_TICKS_PER_CELL);
  assert.equal(result.loopTicks, 32 * 16 * PROTOTYPE_TICKS_PER_CELL);
  assert.deepEqual(result.frameOrder.slice(0, 2).map(({ frameIndex, startTick }) => [frameIndex, startTick]), [[0, 0], [1, 16 * 120]]);
});

test('64 columns across 8 ordered frames also make 64 seconds', () => {
  const document = addBlankFrames(createAnimationDocument({ width: 64, height: 1, palette: [COLOR_A] }), 8);
  const result = buildAnimationAudioPrototype(document, { bpm: 120 });
  assert.equal(result.durationSeconds, 64);
  assert.equal(result.loopTicks, 8 * 64 * PROTOTYPE_TICKS_PER_CELL);
});

test('cell timing stays fixed when frame width and source animation duration change', () => {
  const narrow = createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A] });
  const wide = createAnimationDocument({ width: 64, height: 1, palette: [COLOR_A] });
  narrow.durationMs = 500; wide.durationMs = 60_000;
  narrow.frames[0].durationMs = 900;
  wide.frames[0].durationMs = 15;
  const shortResult = buildAnimationAudioPrototype(narrow, { bpm: 120 });
  const longResult = buildAnimationAudioPrototype(wide, { bpm: 120 });
  assert.equal(shortResult.secondsPerCell, 0.125);
  assert.equal(longResult.secondsPerCell, 0.125);
  assert.equal(longResult.durationSeconds / shortResult.durationSeconds, 4);
});

test('same row, color, and instrument sustain across a frame boundary', () => {
  const document = addBlankFrames(createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A] }), 2);
  writeRow(document, 0, { 15: 1 });
  writeRow(document, 1, { 0: 1 });
  const result = buildAnimationAudioPrototype(document, { instrumentByColor: MAPPING });
  assert.deepEqual(result.events, [{
    startTick: 15 * 120, durationTicks: 240, sequenceCell: 15, cellCount: 2,
    row: 0, pitch: 96, color: COLOR_A, instrument: 'square', startFrameIndex: 0, endFrameIndex: 1
  }]);
});

test('color or instrument changes split adjacent cells, including at frame boundaries', () => {
  const document = addBlankFrames(createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A, COLOR_B] }), 2);
  writeRow(document, 0, { 15: 1 });
  writeRow(document, 1, { 0: 2 });

  const distinctInstruments = buildAnimationAudioPrototype(document, { instrumentByColor: MAPPING });
  assert.deepEqual(distinctInstruments.events.map(({ startTick, durationTicks, color, instrument }) => [startTick, durationTicks, color, instrument]), [
    [15 * 120, 120, COLOR_A, 'square'],
    [16 * 120, 120, COLOR_B, 'piano']
  ]);

  const sharedInstrument = buildAnimationAudioPrototype(document, {
    instrumentByColor: { [COLOR_A]: 'square', [COLOR_B]: 'square' }
  });
  assert.deepEqual(sharedInstrument.events.map(({ startTick, durationTicks, color }) => [startTick, durationTicks, color]), [
    [15 * 120, 120, COLOR_A],
    [16 * 120, 120, COLOR_B]
  ]);
});

test('blank, silent, and changed-color cells split long tones', () => {
  const document = addBlankFrames(createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A, COLOR_B] }), 2);
  writeRow(document, 0, { 14: 1, 15: 1 });
  // The first cell continues the run, the next changes color, the next maps
  // to silence, then a blank cell separates the final note.
  writeRow(document, 1, { 0: 1, 1: 2, 3: 1 });
  const result = buildAnimationAudioPrototype(document, {
    instrumentByColor: { [COLOR_A]: 'square', [COLOR_B]: null }
  });
  assert.deepEqual(result.events.map(({ startTick, durationTicks, color }) => [startTick, durationTicks, color]), [
    [14 * 120, 360, COLOR_A],
    [19 * 120, 120, COLOR_A]
  ]);
});

test('loop end and start remain separate even when their colors match', () => {
  const document = createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A] });
  writeRow(document, 0, { 0: 1, 15: 1 });
  const result = buildAnimationAudioPrototype(document, { instrumentByColor: MAPPING });
  assert.deepEqual(result.events.map(({ startTick, durationTicks }) => [startTick, durationTicks]), [[0, 120], [15 * 120, 120]]);
});

test('hidden layers do not sound; visible layer colors keep their own instrument mapping', () => {
  const document = createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A, COLOR_B] });
  const upperLayerId = addLayer(document, { visible: false });
  writeCel(document, { layerId: 'layer-1', frameId: 'frame-1', bytes: [1, ...blank(15)] });
  writeCel(document, { layerId: upperLayerId, frameId: 'frame-1', bytes: [2, ...blank(15)] });
  const hidden = buildAnimationAudioPrototype(document, { instrumentByColor: MAPPING });
  assert.deepEqual(hidden.events.map(({ color, instrument }) => [color, instrument]), [[COLOR_A, 'square']]);
  setLayerVisible(document, upperLayerId, true);
  const visible = buildAnimationAudioPrototype(document, { instrumentByColor: MAPPING });
  assert.deepEqual(visible.events.map(({ color, instrument }) => [color, instrument]), [[COLOR_B, 'piano']]);
});

test('dimensions, frame count, palette size, and palette bytes are checked before conversion', () => {
  assert.throws(() => createAnimationDocument({ width: 15, height: 1, palette: [COLOR_A] })
    && buildAnimationAudioPrototype(createAnimationDocument({ width: 15, height: 1, palette: [COLOR_A] })), /16, 32, 64, 128, or 256/);
  const tooManyFrames = addBlankFrames(createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A] }), 128);
  duplicateFrame(tooManyFrames, tooManyFrames.frames.at(-1).id);
  assert.throws(() => buildAnimationAudioPrototype(tooManyFrames), /1 and 128/);
  const tooManyColors = Array.from({ length: 33 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`);
  assert.throws(() => buildAnimationAudioPrototype({ width: 16, height: 1, palette: tooManyColors, frames: [{ id: 'f1' }], layers: [], images: new Map() }), /32/);

  const malformed = createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A] });
  writeCel(malformed, { layerId: 'layer-1', frameId: 'frame-1', bytes: [1, ...blank(15)] });
  malformed.images.get('image-1').bytes = [257];
  assert.throws(() => buildAnimationAudioPrototype(malformed), /invalid palette byte/);
});

test('BPM and row pitch inputs are validated', () => {
  const document = createAnimationDocument({ width: 16, height: 1, palette: [COLOR_A] });
  assert.throws(() => buildAnimationAudioPrototype(document, { bpm: 181 }), /BPM must be an integer from 60 to 180/);
  assert.throws(() => buildAnimationAudioPrototype(document, { rowPitches: [128] }), /MIDI pitch/);
});
