import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFacePixels } from '../../js/pixel-studio/face-pixels.mjs';
import { fitTone } from '../../js/pixel-studio/global-tones.mjs';

const WIDTH = 64;
const HEIGHT = 64;
const PALETTE = [
  [24, 24, 24],
  [92, 63, 55],
  [150, 105, 85],
  [205, 164, 137],
  [230, 200, 170],
  [248, 248, 248]
];

function makeFaceInput() {
  const frame = { width: WIDTH, height: HEIGHT, data: new Uint8ClampedArray(WIDTH * HEIGHT * 4) };
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
  const objects = new Uint32Array(WIDTH * HEIGHT).fill(1);
  const indices = new Uint8Array(WIDTH * HEIGHT).fill(3);
  const skin = new Uint8Array(WIDTH * HEIGHT);
  const setPixel = (x, y, color, object = 1, index = 3, isSkin = true) => {
    const cell = y * WIDTH + x, p = cell * 4, q = cell * 3;
    frame.data.set([...color, 255], p);
    rgb.set(color, q);
    objects[cell] = object;
    indices[cell] = index;
    skin[cell] = isSkin ? 1 : 0;
  };

  // Ten-cell-wide face, with dark hair, three source-contrast features, and a
  // non-skin occluder. Coordinates are output-grid pixels.
  for (let y = 20; y <= 43; y++) for (let x = 27; x <= 36; x++) setPixel(x, y, [205, 164, 137]);
  for (let y = 18; y <= 19; y++) for (let x = 27; x <= 36; x++) setPixel(x, y, [35, 25, 22], 2, 1, false);

  const center = (x, y) => ({ x: (x + 0.5) / WIDTH, y: (y + 0.5) / HEIGHT });
  const feature = (kind, x, y, color) => {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      setPixel(x + ox, y + oy, color);
    }
    return { kind, cells: [y * WIDTH + x], points: [center(x, y)] };
  };
  const marks = [
    feature('eye', 29, 27, [24, 20, 18]),
    feature('eye', 34, 27, [24, 20, 18]),
    feature('nose', 32, 33, [162, 124, 105]),
    feature('mouth', 32, 39, [36, 24, 25])
  ];
  // A mask/accessory hole must remain outside face post-processing.
  setPixel(31, 34, [22, 45, 70], 9, 2, false);

  const guide = {
    compact: true,
    width: WIDTH,
    height: HEIGHT,
    skin,
    samples: [center(32, 23)],
    marks
  };
  return { frame, rgb, objects, indices, palette: PALETTE.map(color => [...color]), width: WIDTH, height: HEIGHT, guide };
}

test('renders source-contrasted eye, nose and mouth details on a ten-pixel face using palette colors only', () => {
  const input = makeFaceInput();
  const result = renderFacePixels(input);
  assert.ok(result.skinCells > 0);
  assert.equal(result.featureCells, 4);
  assert.ok(result.skinColors <= 3);
  assert.ok(result.indices.every(index => Number.isInteger(index) && index >= 0 && index < input.palette.length));
  assert.ok(result.state);

  const colorAt = (x, y) => input.palette[result.indices[y * WIDTH + x]];
  const luminance = color => 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
  const eye = colorAt(29, 27), nose = colorAt(32, 33), mouth = colorAt(32, 39);
  const skinMain = colorAt(32, 23);
  assert.ok(luminance(eye) < luminance(skinMain) - 24, 'eye source contrast remains visible');
  assert.ok(luminance(mouth) < luminance(skinMain) - 24, 'mouth source contrast remains visible');
  assert.ok(luminance(nose) < luminance(skinMain) - 8, 'nose receives a softer skin shade');
  assert.ok(luminance(nose) > luminance(eye), 'nose remains softer than the eye details');
});

test('does not alter hair, occluders, non-face pixels, face rim, or its inputs', () => {
  const input = makeFaceInput();
  const originals = {
    frame: new Uint8ClampedArray(input.frame.data),
    rgb: new Uint8Array(input.rgb),
    objects: new Uint32Array(input.objects),
    indices: new Uint8Array(input.indices),
    skin: new Uint8Array(input.guide.skin)
  };
  const result = renderFacePixels(input);
  for (const [x, y] of [[30, 18], [30, 19], [10, 10], [31, 34], [27, 30]]) {
    const cell = y * WIDTH + x;
    assert.equal(result.indices[cell], input.indices[cell], `pixel ${x},${y} is outside the editable face interior`);
  }
  assert.deepEqual(input.frame.data, originals.frame);
  assert.deepEqual(input.rgb, originals.rgb);
  assert.deepEqual(input.objects, originals.objects);
  assert.deepEqual(input.indices, originals.indices);
  assert.deepEqual(input.guide.skin, originals.skin);
  assert.notEqual(result.indices, input.indices, 'face rendering returns a separate index buffer');
});

test('does not recolor a skin-like face-oval cell owned by another object', () => {
  const input = makeFaceInput();
  const cell = 34 * WIDTH + 31;
  input.objects[cell] = 9;
  input.guide.skin[cell] = 1;
  const originalIndex = input.indices[cell];
  const result = renderFacePixels(input);
  assert.equal(result.indices[cell], originalIndex, 'skin color does not cross an object boundary');
  assert.ok(result.touched);
  assert.equal(result.touched[cell], 0);
  assert.ok(result.skinCells > 0, 'the detected face owner is still processed');
});

test('returns a no-op when no valid skin sample can identify the face owner', () => {
  const input = makeFaceInput();
  input.guide.skin.fill(0);
  const result = renderFacePixels(input);
  assert.equal(result.indices, input.indices);
  assert.equal(result.state, null);
  assert.equal(result.skinCells, 0);
  assert.equal(result.featureCells, 0);
});

test('four gray-level palette never emits a negative index for missing intermediate shadow swatches', () => {
  const input = makeFaceInput();
  input.palette = [[24, 24, 24], [88, 88, 88], [168, 168, 168], [240, 240, 240]];
  input.indices.fill(2);
  const darkerSkin = fitTone([205, 164, 137], 112);
  for (let y = 30; y < 36; y++) for (let x = 30; x < 35; x++) {
    const cell = y * WIDTH + x;
    const pixel = cell * 4;
    input.frame.data.set([...darkerSkin, 255], pixel);
    input.rgb.set(darkerSkin, cell * 3);
  }
  const result = renderFacePixels(input);
  assert.ok(result.indices.every(index => index >= 0 && index < input.palette.length));
});

test('repeated rendering with the returned state is deterministic', () => {
  const input = makeFaceInput();
  const first = renderFacePixels(input);
  const second = renderFacePixels({ ...input, previous: first.state });
  assert.deepEqual(second.indices, first.indices);
  assert.deepEqual(second.state, first.state);
  assert.equal(second.skinColors, first.skinColors);
  assert.equal(second.featureCells, first.featureCells);
});

test('rejects guide and buffer dimensions that do not match the output grid', () => {
  const input = makeFaceInput();
  assert.throws(() => renderFacePixels({ ...input, guide: { ...input.guide, width: WIDTH - 1 } }), /match the output grid/);
  assert.throws(() => renderFacePixels({ ...input, indices: new Uint8Array(WIDTH * HEIGHT - 1) }), /match the output grid/);
  assert.throws(() => renderFacePixels({ ...input, objects: new Uint32Array(WIDTH * HEIGHT - 1) }), /match the output grid/);
});


test('flat lighting removes broad skin shadow without erasing contrasted landmarks', () => {
  const input = makeFaceInput();
  input.palette[2] = [170, 129, 102];
  const darkerSkin = [164, 123, 96];
  for (let y = 29; y <= 37; y++) for (let x = 28; x <= 30; x++) {
    input.rgb.set(darkerSkin, (y * WIDTH + x) * 3);
  }
  const shaded = renderFacePixels(input);
  const flat = renderFacePixels({ ...input, flattenShadows: true });
  const cheek = 34 * WIDTH + 29;
  assert.notEqual(shaded.indices[cheek], flat.indices[cheek], 'a broad skin shadow is removed');
  assert.equal(flat.indices[cheek], flat.state.ramp[1], 'cheek uses the main skin color');
  assert.equal(flat.featureCells, 4);
  for (const mark of input.guide.marks) for (const cell of mark.cells) {
    assert.equal(flat.indices[cell], shaded.indices[cell], 'landmark contrast is unchanged');
  }
  assert.equal(flat.indices[18 * WIDTH + 30], input.indices[18 * WIDTH + 30], 'hair is untouched');
});
