import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';
import { createGlobalPalette } from '../../js/pixel-studio/global-palette.mjs';

const width = 256, height = 192, size = 32, scale = 8;
const dot = { x: 19, y: 14 };
const cell = dot.y * size + dot.x;
const offset = cell * 4;
function scene({ hit = false, fullCell = false, shine = false, move = false } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const cx = (move ? dot.x + 3 : dot.x) * scale;
  const cy = dot.y * scale;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let rgb = y < 38 ? [84, 78, 60] : [124, 132, 116];
    if (x === 59 && y > 72 && y < 152) rgb = [28, 33, 24]; // real continuous subpixel line
    if (hit && (fullCell ? x >= cx && x < cx + scale && y >= cy && y < cy + scale : x === cx + 3 && y === cy + 3)) {
      rgb = shine ? [255, 248, 224] : [30, 34, 29];
    }
    data.set([...rgb, 255], (y * width + x) * 4);
  }
  return { width, height, data };
}
function draw(paletteSession, simplifySurfaces = true) {
  return createObjectRenderer({ size, colors: 24, shading: 'three-tone', dither: 'ordered',
    simplifySurfaces, simplifyLighting: false, paletteSession });
}
function session() { return createGlobalPalette({ toneLevels: 8, saturation: 1.25 }); }
function rgb(result, position = offset) { return [...result.data.subarray(position, position + 3)]; }

test('production reduction removes a minority dark sample from a flat plane without inventing a blended color', () => {
  const palette = session();
  const input = scene({ hit: true });
  const unfiltered = draw(palette, false).render(input);
  const filtered = draw(palette).render(input);
  assert.notDeepEqual(rgb(unfiltered), rgb(unfiltered, offset + 4), 'fixture exposes the former stray dark output pixel');
  assert.deepEqual(rgb(filtered), rgb(filtered, offset + 4), 'the plane stays a solid color');
  assert.ok(filtered.stats.removedSurfaceSpeckCells >= 1);
  assert.deepEqual(filtered.palette, unfiltered.palette, 'uses the same locked palette');
  for (let i = 0; i < filtered.indices.length; i++) {
    assert.deepEqual(rgb(filtered, i * 4), filtered.palette[filtered.indices[i]]);
    assert.equal(filtered.data[i * 4 + 3], 255);
  }
  assert.equal(filtered.width, 32); assert.equal(filtered.height, 24);
  assert.ok(filtered.stats.straightLineCells > 0, 'the supported thin line is still recognized');
});

test('keeps protected eyes, tiny bright lights, true full-cell details and other object IDs', () => {
  for (const kind of ['eye', 'light', 'full-cell', 'object']) {
    const input = scene({ hit: true, shine: kind === 'light', fullCell: kind === 'full-cell' || kind === 'object' });
    const protectedCells = new Uint8Array(32 * 24);
    if (kind === 'eye') protectedCells[cell] = 1;
    let segmentation = null;
    if (kind === 'object') {
      const labels = new Uint32Array(32 * 24).fill(1);
      labels[cell] = 7;
      segmentation = { width: 32, height: 24, labels };
    }
    const palette = session();
    const before = draw(palette, false).render(input, segmentation, { protectedCells });
    const after = draw(palette).render(input, segmentation, { protectedCells });
    assert.deepEqual(rgb(after), rgb(before), kind);
    assert.deepEqual(after.labels, before.labels, kind);
    assert.notDeepEqual(rgb(after), rgb(after, offset + 4), `${kind} is visibly distinct`);
  }
});

test('a moving minority hit does not flicker or leave its previous pixel behind', () => {
  const palette = session(), renderer = draw(palette);
  const baseline = renderer.render(scene());
  for (const options of [{ hit: true }, { hit: true, move: true }, {}, { hit: true }]) {
    const result = renderer.render(scene(options));
    assert.equal(Buffer.compare(Buffer.from(result.data), Buffer.from(baseline.data)), 0, 'only unsupported source specks vary between frames');
    assert.deepEqual(result.palette, baseline.palette);
  }
});
