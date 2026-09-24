import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalPalette } from '../../js/pixel-studio/global-palette.mjs';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';
import { grayLight, grayLevels } from '../../js/pixel-studio/global-tones.mjs';

function frame(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4, [r, g, b] = colorAt(x, y);
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
  }
  return { width, height, data };
}

function segmentation(width, height, idAt) {
  return { width, height, labels: Uint32Array.from({ length: width * height }, (_, i) => idAt(i % width, Math.floor(i / width))) };
}

function renderer(paletteSession, dither = 'none') {
  return createObjectRenderer({ size: 64, colors: 85, shading: 'three-tone', paletteSession, dither });
}

function rgbAt(result, x, y) {
  const p = (y * result.width + x) * 4;
  return [...result.data.subarray(p, p + 4)];
}

test('global renderer stays on the four gray levels and bounds each local material ramp', () => {
  const input = frame(48, 32, (x, y) => x < 24 ? [222, 94 + y, 27] : [32 + y, 86, 162]);
  const objects = segmentation(48, 32, (x) => x < 24 ? 17 : 29);
  const session = createGlobalPalette({ toneLevels: 4 });
  const result = renderer(session).render(input, objects);
  const levels = grayLevels(4);
  for (let p = 0; p < result.data.length; p += 4) {
    assert.equal(result.data[p + 3], 255);
    assert.ok(levels.some((level) => Math.abs(grayLight(result.data[p], result.data[p + 1], result.data[p + 2]) - level) <= 1));
  }
  assert.ok(result.stats.maxMaterialColors <= 3, `maximum local colors: ${result.stats.maxMaterialColors}`);
  for (let i = 0; i < result.labels.length; i++) {
    assert.equal(result.labels[i], objects.labels[i], 'render keeps the source hard object labels');
  }
});

test('an eight-level ramp can retain both deep shadow and bright highlight tones', () => {
  const input = frame(32, 16, (x) => x < 16 ? [4, 4, 4] : [252, 252, 252]);
  const session = createGlobalPalette({ toneLevels: 8 });
  const result = renderer(session).render(input, segmentation(32, 16, () => 1));
  const grays = new Set();
  for (let p = 0; p < result.data.length; p += 4) grays.add(Math.round(grayLight(result.data[p], result.data[p + 1], result.data[p + 2])));
  assert.ok([...grays].some((gray) => gray < 40), `expected a shadow tone, got ${[...grays]}`);
  assert.ok([...grays].some((gray) => gray > 220), `expected a highlight tone, got ${[...grays]}`);
});

test('a dark brown cloth patch keeps a dark tone inside a brighter connected cloth field', () => {
  const input = frame(40, 32, (x, y) => {
    if (x >= 18 && x < 22 && y >= 14 && y < 18) return [54, 30, 20];
    return [174 + (x % 3), 83 + (y % 3), 39];
  });
  const session = createGlobalPalette();
  const result = renderer(session).render(input, segmentation(40, 32, () => 1));
  const patch = rgbAt(result, 19, 15), cloth = rgbAt(result, 10, 10);
  assert.ok(grayLight(...patch.slice(0, 3)) + 20 < grayLight(...cloth.slice(0, 3)), `patch ${patch}, cloth ${cloth}`);
  assert.ok(patch[0] < cloth[0] && patch[1] < cloth[1]);
});

test('palette and rendered pixels are deterministic when object IDs are renumbered', () => {
  const input = frame(32, 24, (x, y) => x < 16 ? [204, 88 + y, 22] : [24, 31 + y, 45]);
  const left = renderer(createGlobalPalette()).render(input, segmentation(32, 24, (x) => x < 16 ? 3 : 8));
  const right = renderer(createGlobalPalette()).render(input, segmentation(32, 24, (x) => x < 16 ? 300 : 40));
  assert.deepEqual(right.palette, left.palette);
  assert.deepEqual(right.data, left.data);
});

test('adding a coarse AI mask to an unchanged warm gradient preserves its captured appearance', () => {
  const input = frame(32, 24, (x, y) => {
    const band = Math.floor(x / 8), base = [104, 140, 178, 216][band];
    const red = base + (y % 3);
    return [red, Math.round(red * 0.48), Math.round(red * 0.16)];
  });
  const session = createGlobalPalette();
  const draw = renderer(session);
  const before = draw.render(input);
  const capturedPalette = session.get().palette;
  const coarseMask = segmentation(32, 24, (x) => Math.floor(x / 8) + 11);
  const after = draw.render(input, coarseMask);

  assert.deepEqual(after.palette, capturedPalette, 'AI mask arrival must not recapture the frozen global palette');
  let unchanged = 0;
  for (let p = 0; p < before.data.length; p += 4) {
    if (before.data[p] === after.data[p] && before.data[p + 1] === after.data[p + 1] && before.data[p + 2] === after.data[p + 2]) unchanged++;
  }
  assert.ok(unchanged / (before.width * before.height) >= 0.95,
    `unchanged static cells: ${unchanged}/${before.width * before.height}`);
});

test('clearing and recapturing a global palette uses only the new revision swatches', () => {
  const session = createGlobalPalette();
  const draw = renderer(session);
  const firstFrame = frame(24, 16, () => [210, 54, 22]);
  const first = draw.render(firstFrame);
  const firstRevision = first.stats.paletteRevision;
  session.clear();
  draw.reset();
  const secondFrame = frame(24, 16, () => [22, 64, 214]);
  const second = draw.render(secondFrame);
  assert.equal(second.stats.paletteRevision, firstRevision + 1);
  assert.deepEqual(second.palette, session.get().palette);
  const swatches = new Set(second.palette.map((rgb) => rgb.join(',')));
  for (let p = 0; p < second.data.length; p += 4) {
    assert.ok(swatches.has(second.data.subarray(p, p + 3).join(',')), 'rendered pixels index the newly captured palette');
  }
  assert.notDeepEqual(second.palette, first.palette);
});

test('moving a shape on the same captured palette matches a fresh render without ghosts', () => {
  const session = createGlobalPalette();
  const moving = renderer(session);
  const scene = (left) => ({
    frame: frame(40, 32, (x, y) => x >= left && x < left + 8 && y >= 10 && y < 22 ? [230, 36, 20] : [108, 108, 108]),
    mask: segmentation(40, 32, (x, y) => x >= left && x < left + 8 && y >= 10 && y < 22 ? 5 : 0)
  });
  const first = scene(4), moved = scene(28);
  moving.render(first.frame, first.mask);
  const actual = moving.render(moved.frame, moved.mask);
  const expected = renderer(session).render(moved.frame, moved.mask);
  assert.deepEqual(actual.palette, expected.palette);
  assert.deepEqual(actual.data, expected.data);
  assert.deepEqual(rgbAt(actual, 8, 8), rgbAt(expected, 8, 8));
});
