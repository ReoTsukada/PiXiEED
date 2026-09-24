import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalPalette } from '../../js/pixel-studio/global-palette.mjs';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';

const WIDTH = 64, HEIGHT = 48, CELLS = WIDTH * HEIGHT;

function makeFrame(colorAt) {
  const data = new Uint8ClampedArray(CELLS * 4);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const p = (y * WIDTH + x) * 4, [r, g, b] = colorAt(x, y);
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
  }
  return { width: WIDTH, height: HEIGHT, data };
}

const swatches = [[30, 58, 126], [198, 54, 38], [186, 132, 32], [44, 142, 78], [154, 74, 146], [35, 143, 156]];
function staticColor(x, y, exposure = 1) {
  const source = swatches[Math.min(swatches.length - 1, Math.floor(x / (WIDTH / swatches.length)))];
  const shade = 0.62 + 0.38 * y / (HEIGHT - 1);
  return source.map(value => Math.max(0, Math.min(255, Math.round(value * shade * exposure))));
}
function staticFrame(exposure = 1) { return makeFrame((x, y) => staticColor(x, y, exposure)); }
const staticObjects = { width: WIDTH, height: HEIGHT,
  labels: Uint32Array.from({ length: CELLS }, (_, i) => Math.floor((i % WIDTH) / (WIDTH / swatches.length)) + 1) };

function noiseFrame(amplitude, frameIndex) {
  return makeFrame((x, y) => {
    const pixel = y * WIDTH + x;
    return staticColor(x, y).map((value, channel) => value + ((pixel * 37 + frameIndex * 19 + channel * 11) % (2 * amplitude + 1) - amplitude));
  });
}
function turnover(a, b) {
  let changed = 0;
  for (let p = 0; p < a.data.length; p += 4) {
    if (a.data[p] !== b.data[p] || a.data[p + 1] !== b.data[p + 1] || a.data[p + 2] !== b.data[p + 2]) changed++;
  }
  return changed / CELLS;
}
function renderer(session = createGlobalPalette({ toneLevels: 4 })) {
  return createObjectRenderer({ size: WIDTH, colors: 96, shading: 'three-tone', paletteSession: session, dither: 'ordered' });
}

test('global-tone anchors hold static output under independent RGB jitter through plus or minus two', () => {
  for (const toneLevels of [4, 8]) {
    for (const amplitude of [1, 2]) {
      const session = createGlobalPalette({ toneLevels });
      const draw = renderer(session);
      let previous = draw.render(staticFrame(), staticObjects);
      for (let frameIndex = 1; frameIndex <= 24; frameIndex++) {
        const current = draw.render(noiseFrame(amplitude, frameIndex), staticObjects);
        assert.equal(turnover(previous, current), 0, `${toneLevels}-tone ±${amplitude} noise changed static output on frame ${frameIndex}`);
        previous = current;
      }
    }
  }
});

test('cumulative exposure drift releases the anchor and a clear change converges to a fresh render', () => {
  for (const toneLevels of [4, 8]) {
    const session = createGlobalPalette({ toneLevels });
    const draw = renderer(session);
    const first = draw.render(staticFrame(1), staticObjects);
    let last = first;
    for (let frameIndex = 1; frameIndex <= 80; frameIndex++) {
      last = draw.render(staticFrame(1 + frameIndex * 0.0025), staticObjects);
    }
    assert.ok(turnover(first, last) > 0.01, `${toneLevels}-tone slow exposure must not leave all pixels frozen at the initial tone`);
    const finalExposure = staticFrame(1.8);
    draw.render(finalExposure, staticObjects);
    last = draw.render(finalExposure, staticObjects);
    const fresh = renderer(session).render(finalExposure, staticObjects);
    assert.equal(turnover(last, fresh), 0, `${toneLevels}-tone output should follow a fresh render after a clear exposure change`);
  }
});

test('a moving weak-color edge matches a fresh render without retaining the old edge', () => {
  const width = 20, height = 12, cells = width * height;
  const frame = left => {
    const data = new Uint8ClampedArray(cells * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4, gray = x < left ? 124 : 132;
      data[p] = data[p + 1] = data[p + 2] = gray; data[p + 3] = 255;
    }
    return { width, height, data };
  };
  const mask = { width, height, labels: new Uint32Array(cells).fill(5) };
  const session = createGlobalPalette({ toneLevels: 4 });
  const draw = createObjectRenderer({ size: width, colors: 96, shading: 'three-tone', paletteSession: session, dither: 'ordered' });
  const initial = draw.render(frame(7), mask);
  const moved = draw.render(frame(12), mask);
  const fresh = createObjectRenderer({ size: width, colors: 96, shading: 'three-tone', paletteSession: session, dither: 'ordered' }).render(frame(12), mask);
  const changed = moved.data.some((value, index) => value !== initial.data[index]);
  assert.ok(changed, 'the controlled edge fixture must exercise changing output');
  assert.equal(turnover(moved, fresh), 0, `the moved edge left ${Math.round(turnover(moved, fresh) * cells)} pixels different from a fresh render`);
});

test('late and renamed split masks preserve the locked palette and return current hard labels', () => {
  const session = createGlobalPalette({ toneLevels: 4 });
  const draw = renderer(session);
  const source = staticFrame();
  const before = draw.render(source);
  const firstLabels = Uint32Array.from({ length: CELLS }, (_, i) => {
    const x = i % WIDTH, y = Math.floor(i / WIDTH);
    return x >= 12 && x < 52 && y >= 6 && y < 42 ? 701 : 0;
  });
  const firstMask = draw.render(source, { width: WIDTH, height: HEIGHT, labels: firstLabels });
  assert.deepEqual(firstMask.palette, before.palette, 'AI mask arrival must not recapture the locked palette');
  assert.deepEqual(firstMask.labels, firstLabels, 'AI hard labels must remain authoritative');
  const renamedSplitLabels = Uint32Array.from({ length: CELLS }, (_, i) => {
    const x = i % WIDTH, y = Math.floor(i / WIDTH);
    return x >= 12 && x < 32 && y >= 6 && y < 42 ? 9901
      : x >= 32 && x < 52 && y >= 6 && y < 42 ? 9902 : 0;
  });
  const renamedSplit = draw.render(source, { width: WIDTH, height: HEIGHT, labels: renamedSplitLabels });
  assert.deepEqual(renamedSplit.palette, before.palette, 'mask renumbering/splitting must retain the session palette');
  assert.deepEqual(renamedSplit.labels, renamedSplitLabels, 'new split labels must appear without stale IDs');
});
