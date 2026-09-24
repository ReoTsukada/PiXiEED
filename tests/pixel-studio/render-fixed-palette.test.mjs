import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixedPalette } from '../../js/pixel-studio/fixed-palette.mjs';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';

function makeFrame(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [r, g, b, a = 255] = colorAt(x, y), p = (y * width + x) * 4;
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
  }
  return { width, height, data };
}
function mask(width, height, labelAt) {
  const labels = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) labels[y * width + x] = labelAt(x, y);
  return { width, height, labels };
}
function opts(paletteSession, dither = 'ordered') {
  return { size: 32, colors: 48, shading: 'three-tone', paletteSession, dither };
}
function pixel(result, x, y) {
  return [...result.data.subarray((y * result.width + x) * 4, (y * result.width + x) * 4 + 4)];
}
function chromaticA(x, y) { return [35 + (x * 2) % 180, 18 + (y * 2) % 110, 12 + ((x + y) % 32)]; }
function chromaticB(x, y) { return [8 + ((x + y) % 32), 35 + (x * 2) % 110, 70 + (y * 2) % 180]; }

test('renderer reset keeps a captured palette; clearing it allows a new palette revision', () => {
  const fixed = createFixedPalette({ colorLimit: 48 });
  const renderer = createObjectRenderer(opts(fixed));
  const a = makeFrame(64, 64, chromaticA), b = makeFrame(64, 64, chromaticB);
  const first = renderer.render(a);
  const snapshotA = fixed.get();
  assert.equal(first.stats.paletteRevision, snapshotA.revision);
  assert.equal(snapshotA.revision, 1);

  renderer.reset();
  const stillLocked = renderer.render(b);
  assert.deepEqual(stillLocked.palette, snapshotA.palette);
  assert.equal(stillLocked.stats.paletteRevision, snapshotA.revision);

  fixed.clear();
  renderer.reset();
  const recaptured = renderer.render(b);
  assert.equal(recaptured.stats.paletteRevision, snapshotA.revision + 1);
  assert.notDeepEqual(recaptured.palette, snapshotA.palette);
});

test('changing segmentation IDs does not recapture or mutate the fixed palette', () => {
  const fixed = createFixedPalette({ colorLimit: 48 });
  const renderer = createObjectRenderer(opts(fixed));
  const frame = makeFrame(64, 64, (x, y) => x < 32 ? [35 + (y % 80), 60, 90] : [180, 80 + (y % 70), 40]);
  const first = renderer.render(frame, mask(64, 64, (x) => x < 32 ? 11 : 22));
  const locked = fixed.get();
  const second = renderer.render(frame, mask(64, 64, (x) => x < 32 ? 111 : 222));
  assert.deepEqual(second.palette, locked.palette);
  assert.deepEqual(second.data, first.data, 'renaming object IDs must not change a fixed color ramp or dither phase');
  assert.equal(first.stats.paletteRevision, locked.revision);
  assert.equal(second.stats.paletteRevision, locked.revision);
  assert.equal(fixed.get().revision, locked.revision);
});

test('captured grayscale palette dithers repeatably, protects details, and preserves input bytes', () => {
  const fixed = createFixedPalette({ colorLimit: 48 });
  const frame = makeFrame(64, 64, (x, y) => {
    const value = Math.min(255, x * 2);
    return x === 32 || x === 33 ? [15, 15, 15] : [value, value, value];
  });
  const original = new Uint8ClampedArray(frame.data);
  const protectedCells = new Uint8Array(32 * 32);
  for (let y = 0; y < 32; y++) protectedCells[y * 32 + 16] = 1;
  const ditherRenderer = createObjectRenderer(opts(fixed));
  const first = ditherRenderer.render(frame, null, { protectedCells });
  const locked = fixed.get();
  const second = ditherRenderer.render(frame, null, { protectedCells });
  assert.ok(locked.palette.length >= 3);
  assert.ok(locked.palette.every(([r, g, b]) => r === g && g === b), 'captured palette remains grayscale');
  assert.deepEqual(second.data, first.data, 'same frame and locked palette produce identical dither');
  assert.ok(first.stats.ditheredCells > 0);
  assert.ok(first.data.every((value, i) => i % 4 !== 3 || value === 255));

  const nearestRenderer = createObjectRenderer(opts(fixed, 'none'));
  const nearest = nearestRenderer.render(frame, null, { protectedCells });
  for (let y = 0; y < 32; y++) {
    assert.deepEqual(pixel(first, 16, y), pixel(nearest, 16, y), 'protected vertical detail bypasses ordered dithering');
  }
  assert.deepEqual(frame.data, original, 'rendering does not mutate source pixels');
});

test('moved shape on a frozen palette does not leave temporal ghost colors', () => {
  const fixed = createFixedPalette({ colorLimit: 48 });
  const movingRenderer = createObjectRenderer(opts(fixed));
  const frameFor = (left) => makeFrame(64, 64, (x, y) => {
    if (x >= left && x < left + 12 && y >= 24 && y < 40) return [235, 30, 20];
    return [110, 110, 110];
  });
  const maskFor = (left) => mask(64, 64, (x, y) => x >= left && x < left + 12 && y >= 24 && y < 40 ? 7 : 0);
  movingRenderer.render(frameFor(8), maskFor(8));
  assert.ok(fixed.get());

  const movedFrame = frameFor(42), movedMask = maskFor(42);
  const moved = movingRenderer.render(movedFrame, movedMask);
  const referenceRenderer = createObjectRenderer(opts(fixed));
  const reference = referenceRenderer.render(movedFrame, movedMask);
  assert.deepEqual(moved.palette, fixed.get().palette);
  assert.deepEqual(moved.data, reference.data, 'the moved result matches a fresh render with the same locked palette');
  assert.deepEqual(pixel(moved, 6, 16), pixel(reference, 6, 16), 'old object location uses current-frame background, not held foreground');
});
