import test from 'node:test';
import assert from 'node:assert/strict';
import { createLensSourcePalette } from '../../js/pixel-studio/lens-source-palette.mjs';

function frame(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    data.set([...pixel(x, y), 255], p);
  }
  return { width, height, data, labels: new Uint32Array(width * height).fill(1),
    segmented: true, stats: { quality: 'segmented' } };
}

const rgb = (result, x, y) => Array.from(result.data.slice((y * result.width + x) * 4, (y * result.width + x) * 4 + 3));

test('PiXiEELENS source palette keeps separated material colours and a hard object border', () => {
  const source = frame(64, 32, (x) => x < 32 ? [216, 78, 53] : [35, 98, 202]);
  for (let y = 0; y < source.height; y++) for (let x = 32; x < source.width; x++) source.labels[y * source.width + x] = 2;
  const before = new Uint8ClampedArray(source.data);
  const result = createLensSourcePalette().render(source);
  assert.ok(result.palette.length <= 24);
  assert.ok(rgb(result, 16, 16)[0] > rgb(result, 16, 16)[2], 'red material stays red');
  assert.ok(rgb(result, 48, 16)[2] > rgb(result, 48, 16)[0], 'blue material stays blue');
  assert.notDeepEqual(rgb(result, 31, 16), rgb(result, 32, 16), 'object border remains a one-cell step');
  assert.deepEqual(source.data, before, 'source pixels are not modified');
  assert.equal(result.stats.shading, 'lens-source-palette');
});

test('camera-session palette stays fixed until reset while frames continue to update', () => {
  const colors = createLensSourcePalette();
  const first = colors.render(frame(32, 16, (x) => x < 16 ? [220, 75, 50] : [45, 90, 190]));
  const second = colors.render(frame(32, 16, (x) => x < 16 ? [35, 170, 80] : [220, 200, 40]));
  assert.equal(first.stats.paletteLocked, true);
  assert.deepEqual(second.palette, first.palette);
  assert.equal(second.stats.paletteRevision, first.stats.paletteRevision);
  colors.reset();
  const third = colors.render(frame(32, 16, (x) => x < 16 ? [35, 170, 80] : [220, 200, 40]));
  assert.notDeepEqual(third.palette, first.palette);
});

test('Bayer dither is absent on flat areas and reserved for smooth gradients', () => {
  const flat = createLensSourcePalette().render(frame(64, 32, () => [130, 130, 130]));
  const ramp = createLensSourcePalette().render(frame(64, 32, (x) => {
    const value = 55 + x * 2;
    return [value, value, value];
  }));
  assert.equal(flat.stats.ditheredCells, 0);
  assert.ok(ramp.stats.ditheredCells > 0);
  assert.ok(ramp.stats.ditheredCells < 64 * 32, 'edges and canvas rim are excluded');
});
