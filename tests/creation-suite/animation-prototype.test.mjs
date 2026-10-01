import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLayer,
  createAnimationDocument,
  duplicateFrame,
  editCelPixel,
  getCelReference,
  getPixelMemoryBytes,
  renderComposite,
  setLayerVisible,
  writeCel
} from './fixtures/animation-prototype.mjs';

function blank(width, height) { return new Uint8Array(width * height); }

test('static background across 100 frames is stored once and duplicate cels share it', () => {
  const doc = createAnimationDocument({ width: 256, height: 256, palette: ['#112233'] });
  const pixels = new Uint8Array(256 * 256).fill(1);
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: pixels });
  for (let i = 0; i < 99; i += 1) {
    const frameId = duplicateFrame(doc, doc.frames[doc.frames.length - 1].id);
    assert.equal(getCelReference(doc, { layerId: 'layer-1', frameId }).imageId, 'image-1');
  }
  assert.equal(getPixelMemoryBytes(doc), pixels.byteLength);
  assert.equal(doc.frames.length, 100);
});

test('small objects are cropped and keep their independent canvas offsets', () => {
  const doc = createAnimationDocument({ width: 16, height: 12, palette: ['#111111', '#eeeeee'] });
  const pixels = blank(doc.width, doc.height);
  pixels[3 * doc.width + 5] = 1;
  pixels[4 * doc.width + 6] = 2;
  const ref = writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: pixels });
  assert.deepEqual(ref, { imageId: 'image-1', x: 5, y: 3 });
  assert.deepEqual(getCelReference(doc, { layerId: 'layer-1', frameId: 'frame-1' }), { ...ref, width: 2, height: 2 });
  assert.equal(getPixelMemoryBytes(doc), 4);

  const otherLayer = addLayer(doc);
  const otherPixels = blank(doc.width, doc.height);
  otherPixels[8 * doc.width + 11] = 1;
  otherPixels[9 * doc.width + 12] = 2;
  const otherRef = writeCel(doc, { layerId: otherLayer, frameId: 'frame-1', bytes: otherPixels });
  assert.equal(otherRef.imageId, ref.imageId);
  assert.deepEqual({ x: otherRef.x, y: otherRef.y }, { x: 11, y: 8 });
  assert.equal(getPixelMemoryBytes(doc), 4);
});

test('editing a duplicate frame uses copy-on-write and leaves its source unchanged', () => {
  const doc = createAnimationDocument({ width: 8, height: 8, palette: ['#112233', '#445566'] });
  const pixels = blank(8, 8);
  pixels[2 * 8 + 2] = 1;
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: pixels });
  const second = duplicateFrame(doc, 'frame-1');
  assert.equal(getCelReference(doc, { layerId: 'layer-1', frameId: second }).imageId, 'image-1');

  editCelPixel(doc, { layerId: 'layer-1', frameId: second, x: 2, y: 2, value: 2 });
  editCelPixel(doc, { layerId: 'layer-1', frameId: second, x: 3, y: 2, value: 1 });
  assert.equal(getCelReference(doc, { layerId: 'layer-1', frameId: 'frame-1' }).imageId, 'image-1');
  assert.deepEqual([...renderComposite(doc, 'frame-1')].slice(18, 20), [1, 0]);
  assert.deepEqual([...renderComposite(doc, second)].slice(18, 20), [2, 1]);
  assert.deepEqual(doc.frames.map(({ id }) => id), ['frame-1', second]);
  assert.equal(doc.layers[0].id, 'layer-1');
});

test('hidden layers do not contribute to the composite', () => {
  const doc = createAnimationDocument({ width: 2, height: 1, palette: ['#111111', '#eeeeee'] });
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: [1, 0] });
  const upper = addLayer(doc);
  writeCel(doc, { layerId: upper, frameId: 'frame-1', bytes: [0, 2] });
  assert.deepEqual([...renderComposite(doc, 'frame-1')], [1, 2]);
  setLayerVisible(doc, upper, false);
  assert.deepEqual([...renderComposite(doc, 'frame-1')], [1, 0]);
});

test('zero encodes transparency and palette index plus one encodes color', () => {
  const doc = createAnimationDocument({ width: 3, height: 1, palette: ['#010203', '#040506'] });
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: [0, 1, 2] });
  assert.deepEqual([...renderComposite(doc, 'frame-1')], [0, 1, 2]);
  assert.equal(getPixelMemoryBytes(doc), 2);
});

test('invalid indices are rejected before Uint8Array conversion can wrap them', () => {
  const doc = createAnimationDocument({ width: 2, height: 1, palette: ['#010203'] });
  assert.throws(() => writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: [0, 257] }), /palette index/);
  assert.equal(getPixelMemoryBytes(doc), 0);
  assert.equal(getCelReference(doc, { layerId: 'layer-1', frameId: 'frame-1' }), null);
});

test('over-budget write is rejected atomically', () => {
  const doc = createAnimationDocument({ width: 4, height: 4, palette: ['#010203'], pixelBudgetBytes: 2 });
  const pixels = blank(4, 4);
  pixels[0] = 1;
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: pixels });
  const beforeRef = getCelReference(doc, { layerId: 'layer-1', frameId: 'frame-1' });
  const beforeBytes = getPixelMemoryBytes(doc);
  const replacement = blank(4, 4);
  replacement[12] = 1;
  replacement[14] = 1;
  replacement[15] = 1;
  assert.throws(() => writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: replacement }), /budget/);
  assert.deepEqual(getCelReference(doc, { layerId: 'layer-1', frameId: 'frame-1' }), beforeRef);
  assert.equal(getPixelMemoryBytes(doc), beforeBytes);
  assert.deepEqual([...renderComposite(doc, 'frame-1')], [...pixels]);
});

test('palette rejects translucent colors and documents start without legacy frames', () => {
  assert.throws(() => createAnimationDocument({ palette: ['#00000080'] }), /opaque/);
  const doc = createAnimationDocument();
  assert.deepEqual(doc.frames.map(({ id }) => id), ['frame-1']);
  assert.equal(getCelReference(doc, { layerId: 'layer-1', frameId: 'frame-1' }), null);
});

test('transparent upper pixels expose the lower layer and input/output buffers do not change stored cels', () => {
  const doc = createAnimationDocument({ width: 3, height: 1, palette: ['#111111', '#eeeeee'] });
  const source = new Uint8Array([1, 1, 1]);
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: source });
  source.fill(2);
  const upper = addLayer(doc);
  writeCel(doc, { layerId: upper, frameId: 'frame-1', bytes: [0, 2, 0] });
  const rendered = renderComposite(doc, 'frame-1');
  assert.deepEqual([...rendered], [1, 2, 1]);
  rendered.fill(0);
  assert.deepEqual([...renderComposite(doc, 'frame-1')], [1, 2, 1]);
});

test('erasing a referenced cel preserves the duplicate and releases its image only after the final reference', () => {
  const doc = createAnimationDocument({ width: 2, height: 1, palette: ['#010203'] });
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: [1, 1] });
  const duplicate = duplicateFrame(doc, 'frame-1');
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: [0, 0] });
  assert.deepEqual([...renderComposite(doc, duplicate)], [1, 1]);
  assert.equal(getPixelMemoryBytes(doc), 2);
  writeCel(doc, { layerId: 'layer-1', frameId: duplicate, bytes: [0, 0] });
  assert.equal(getPixelMemoryBytes(doc), 0);
});

test('a copy-on-write budget rejection keeps both source and duplicate unchanged', () => {
  const doc = createAnimationDocument({ width: 2, height: 1, palette: ['#010203', '#040506'], pixelBudgetBytes: 2 });
  writeCel(doc, { layerId: 'layer-1', frameId: 'frame-1', bytes: [1, 1] });
  const duplicate = duplicateFrame(doc, 'frame-1');
  assert.throws(() => editCelPixel(doc, { layerId: 'layer-1', frameId: duplicate, x: 0, y: 0, value: 2 }), /budget/);
  assert.deepEqual([...renderComposite(doc, 'frame-1')], [1, 1]);
  assert.deepEqual([...renderComposite(doc, duplicate)], [1, 1]);
  assert.equal(getPixelMemoryBytes(doc), 2);
});
