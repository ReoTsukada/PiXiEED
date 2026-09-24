import test from 'node:test';
import assert from 'node:assert/strict';
import { simplifySurfaceSamples } from '../../js/pixel-studio/surface-samples.mjs';

function makeSurface(width = 9, height = 9, color = [100, 80, 60]) {
  const rgb = new Uint8Array(width * height * 3);
  for (let cell = 0; cell < width * height; cell++) rgb.set(color, cell * 3);
  return { rgb, objects: new Uint32Array(width * height).fill(1), width, height };
}

function setPixel(surface, x, y, color) {
  surface.rgb.set(color, (y * surface.width + x) * 3);
}

function pixel(surface, x, y) {
  const p = (y * surface.width + x) * 3;
  return [...surface.rgb.subarray(p, p + 3)];
}

test('replaces an isolated weak light speck with an existing neighboring sample', () => {
  const input = makeSurface();
  setPixel(input, 4, 4, [108, 88, 68]);
  const source = new Uint8Array(input.rgb);
  const result = simplifySurfaceSamples(input);
  assert.equal(result.simplifiedCells, 1);
  assert.deepEqual(pixel({ ...input, rgb: result.rgb }, 4, 4), [100, 80, 60]);
  assert.ok([...source].some((_, i) => i % 3 === 0 && source[i] === result.rgb[i]), 'output reuses source RGB values');
  assert.deepEqual(input.rgb, source, 'the source buffer is not modified');
  assert.notEqual(result.rgb, input.rgb, 'the output owns a defensive copy');
});

test('keeps strong within-object light boundaries and one-pixel line support', () => {
  const edge = makeSurface();
  for (let y = 0; y < edge.height; y++) for (let x = 5; x < edge.width; x++) setPixel(edge, x, y, [132, 108, 84]);
  const edgeResult = simplifySurfaceSamples(edge);
  assert.equal(edgeResult.simplifiedCells, 0);
  assert.deepEqual(edgeResult.rgb, edge.rgb);

  const line = makeSurface(13, 9);
  for (let x = 1; x < line.width - 1; x++) setPixel(line, x, 4, [94, 74, 54]);
  const lineResult = simplifySurfaceSamples(line);
  for (let x = 2; x < line.width - 2; x++) {
    const p = (4 * line.width + x) * 3;
    assert.deepEqual([...lineResult.rgb.subarray(p, p + 3)], [94, 74, 54], `line cell x=${x} stays intact`);
  }

  const weakLine = makeSurface(11, 9);
  setPixel(weakLine, 4, 4, [88, 68, 48]);
  setPixel(weakLine, 6, 4, [88, 68, 48]);
  const weakLineResult = simplifySurfaceSamples(weakLine);
  const center = (4 * weakLine.width + 5) * 3;
  assert.deepEqual([...weakLineResult.rgb.subarray(center, center + 3)], [100, 80, 60],
    'opposing near-center samples retain a weak one-pixel line');
});

test('leaves curves, protected neighborhoods, and mixed object boundaries untouched', () => {
  const curve = makeSurface(11, 11);
  for (let step = 2; step <= 8; step++) setPixel(curve, step, 2 + Math.floor((step - 2) / 2), [94, 74, 54]);
  const curveResult = simplifySurfaceSamples(curve);
  assert.deepEqual(curveResult.rgb, curve.rgb);

  const protectedInput = makeSurface();
  setPixel(protectedInput, 4, 4, [108, 88, 68]);
  const protectedCells = new Uint8Array(81);
  protectedCells[3 * 9 + 4] = 1;
  const protectedResult = simplifySurfaceSamples({ ...protectedInput, protectedCells });
  assert.deepEqual(pixel({ ...protectedInput, rgb: protectedResult.rgb }, 4, 4), [108, 88, 68]);

  const boundary = makeSurface();
  setPixel(boundary, 4, 4, [108, 88, 68]);
  boundary.objects[4 * 9 + 5] = 2;
  const boundaryResult = simplifySurfaceSamples(boundary);
  assert.deepEqual(boundaryResult.rgb, boundary.rgb);
});

test('does not combine colors across multiple owners and rejects malformed or oversized buffers', () => {
  const input = makeSurface();
  setPixel(input, 4, 4, [108, 88, 68]);
  input.objects[4 * 9 + 5] = 2;
  assert.deepEqual(simplifySurfaceSamples(input).rgb, input.rgb);
  assert.throws(() => simplifySurfaceSamples({ ...input, rgb: new Uint8Array(3) }), /RGB triplet/);
  assert.throws(() => simplifySurfaceSamples({ ...input, width: 0 }), RangeError);
  assert.throws(() => simplifySurfaceSamples({ ...input, width: 513, height: 512,
    rgb: new Uint8Array(513 * 512 * 3), objects: new Uint32Array(513 * 512) }), RangeError);
  const protectedCells = new Uint8Array(81);
  protectedCells[0] = 2;
  assert.throws(() => simplifySurfaceSamples({ ...input, protectedCells }), /must be 0 or 1/);
});
