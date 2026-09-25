import test from 'node:test';
import assert from 'node:assert/strict';
import { createSurfaceTextureStabilizer, simplifySurfaceTexture } from '../../js/pixel-studio/surface-texture.mjs';

function makeSurface(width = 15, height = 15, color = [104, 112, 98]) {
  const count = width * height;
  const rgb = new Uint8Array(count * 3);
  for (let cell = 0; cell < count; cell++) rgb.set(color, cell * 3);
  return { rgb, objects: new Uint32Array(count).fill(1), width, height };
}

function setPixel(input, x, y, color) {
  input.rgb.set(color, (y * input.width + x) * 3);
}

function pixel(rgb, width, x, y) {
  const offset = (y * width + x) * 3;
  return [...rgb.subarray(offset, offset + 3)];
}

function luminance(color) {
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

function variance(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

test('leaves uniform planes unchanged and marks only owner-local interior samples', () => {
  const input = makeSurface(12, 9, [121, 128, 116]);
  const result = simplifySurfaceTexture(input);
  assert.deepEqual(result.rgb, input.rgb);
  assert.equal(result.changedCells, 0);
  assert.equal(result.surfaceCells[4 * 12 + 5], 1);
  assert.equal(result.surfaceCells[0], 0, 'image margins are never surface interior');
});

test('reduces weak granular variation using existing source RGB samples', () => {
  const input = makeSurface(25, 25, [110, 118, 102]);
  for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
    let seed = (x * 73856093) ^ (y * 19349663);
    seed = (seed ^ (seed >>> 13)) * 1274126177;
    const noise = ((seed >>> 0) % 41) - 20;
    setPixel(input, x, y, [110 + noise, 118 + noise, 102 + noise]);
  }
  const original = new Uint8Array(input.rgb);
  const result = simplifySurfaceTexture(input);
  const sourceColors = new Set();
  const before = [], after = [];
  for (let cell = 0; cell < input.width * input.height; cell++) {
    const offset = cell * 3;
    sourceColors.add(`${original[offset]},${original[offset + 1]},${original[offset + 2]}`);
    before.push(luminance(original.subarray(offset, offset + 3)));
    after.push(luminance(result.rgb.subarray(offset, offset + 3)));
  }
  assert.ok(result.changedCells > 0, 'the granular plane receives some simplification');
  assert.ok(variance(after) < variance(before) * 0.75,
    `grain variance falls substantially (${variance(before).toFixed(1)} to ${variance(after).toFixed(1)})`);
  for (let cell = 0; cell < input.width * input.height; cell++) {
    const offset = cell * 3;
    assert.ok(sourceColors.has(`${result.rgb[offset]},${result.rgb[offset + 1]},${result.rgb[offset + 2]}`),
      'the result uses an actual input color');
  }
  assert.deepEqual(input.rgb, original, 'the source is not mutated');
  assert.notEqual(result.rgb, input.rgb, 'the output is an independent copy');
});

test('retains a smooth lighting ramp and strong same-owner or cross-owner edges', () => {
  const ramp = makeSurface(21, 13, [70, 78, 64]);
  for (let y = 0; y < ramp.height; y++) for (let x = 0; x < ramp.width; x++) {
    const value = 50 + x * 6;
    setPixel(ramp, x, y, [value, value + 8, value - 6]);
  }
  assert.deepEqual(simplifySurfaceTexture(ramp).rgb, ramp.rgb, 'the steady brightness gradient is preserved');

  const hardEdge = makeSurface(15, 13, [96, 105, 91]);
  for (let y = 0; y < hardEdge.height; y++) for (let x = 8; x < hardEdge.width; x++) {
    setPixel(hardEdge, x, y, [164, 166, 155]);
  }
  assert.deepEqual(simplifySurfaceTexture(hardEdge).rgb, hardEdge.rgb,
    'a clear material boundary is not averaged across');

  const ownerEdge = makeSurface(15, 13, [96, 105, 91]);
  for (let y = 0; y < ownerEdge.height; y++) for (let x = 8; x < ownerEdge.width; x++) {
    ownerEdge.objects[y * ownerEdge.width + x] = 2;
    setPixel(ownerEdge, x, y, [164, 166, 155]);
  }
  assert.deepEqual(simplifySurfaceTexture(ownerEdge).rgb, ownerEdge.rgb,
    'different object owners remain independent');
});

test('rejects hue mixtures, preserves a weak hard step, and still reduces noise bias', () => {
  const hueEdge = makeSurface(15, 13, [120, 90, 90]);
  for (let y = 0; y < hueEdge.height; y++) for (let x = 8; x < hueEdge.width; x++) {
    setPixel(hueEdge, x, y, [90, 120, 90]);
  }
  assert.deepEqual(simplifySurfaceTexture(hueEdge).rgb, hueEdge.rgb,
    'nearby luminance cannot merge a strongly different hue');

  const weakHardStep = makeSurface(17, 13, [100, 100, 100]);
  for (let y = 0; y < weakHardStep.height; y++) for (let x = 8; x < weakHardStep.width; x++) {
    setPixel(weakHardStep, x, y, [120, 120, 120]);
  }
  assert.deepEqual(simplifySurfaceTexture(weakHardStep).rgb, weakHardStep.rgb,
    'a stable 20-level brightness step remains visible');

  const noisy = makeSurface(33, 25, [110, 118, 102]);
  for (let y = 0; y < noisy.height; y++) for (let x = 0; x < noisy.width; x++) {
    let seed = (x * 73856093) ^ (y * 19349663);
    seed = (seed ^ (seed >>> 13)) * 1274126177;
    const noise = ((seed >>> 0) % 41) - 20;
    setPixel(noisy, x, y, [110 + noise, 118 + noise, 102 + noise]);
  }
  const original = new Uint8Array(noisy.rgb);
  const result = simplifySurfaceTexture(noisy);
  const before = [], after = [];
  for (let cell = 0; cell < noisy.width * noisy.height; cell++) {
    const offset = cell * 3;
    before.push(luminance(original.subarray(offset, offset + 3)));
    after.push(luminance(result.rgb.subarray(offset, offset + 3)));
  }
  assert.ok(variance(after) < variance(before) * 0.65,
    `noise variance falls despite random local direction (${variance(before).toFixed(1)} to ${variance(after).toFixed(1)})`);
});

test('preserves two-pixel lines, protected details, and bright light cells', () => {
  const input = makeSurface(17, 15);
  for (let x = 1; x < input.width - 1; x++) {
    setPixel(input, x, 7, [49, 52, 46]);
    setPixel(input, x, 8, [49, 52, 46]);
  }
  const protectedCells = new Uint8Array(input.width * input.height);
  protectedCells[5 * input.width + 5] = 1;
  setPixel(input, 5, 5, [18, 25, 22]);
  setPixel(input, 12, 4, [245, 238, 220]);
  const source = new Uint8Array(input.rgb);
  const result = simplifySurfaceTexture({ ...input, protectedCells });
  assert.deepEqual(pixel(result.rgb, input.width, 8, 7), [49, 52, 46]);
  assert.deepEqual(pixel(result.rgb, input.width, 8, 8), [49, 52, 46]);
  assert.deepEqual(pixel(result.rgb, input.width, 5, 5), [18, 25, 22]);
  assert.deepEqual(pixel(result.rgb, input.width, 12, 4), [245, 238, 220]);
  assert.deepEqual(input.rgb, source);
});

test('is deterministic and validates bounded typed inputs', () => {
  const input = makeSurface(9, 11);
  setPixel(input, 4, 5, [120, 128, 114]);
  assert.deepEqual(simplifySurfaceTexture(input), simplifySurfaceTexture(input));
  assert.throws(() => simplifySurfaceTexture({ ...input, rgb: new Uint8Array(3) }), /RGB triplet/);
  assert.throws(() => simplifySurfaceTexture({ ...input, objects: new Uint8Array(99) }), /object ID/);
  assert.throws(() => simplifySurfaceTexture({ ...input, protectedCells: new Uint8Array(1) }), /match width/);
  const invalidMask = new Uint8Array(input.width * input.height);
  invalidMask[0] = 2;
  assert.throws(() => simplifySurfaceTexture({ ...input, protectedCells: invalidMask }), /0 or 1/);
  assert.throws(() => simplifySurfaceTexture({ ...input, width: 513, height: 512 }), RangeError);
});

test('stabilizer holds same-frame texture decisions through small jitter and cumulative motion', () => {
  const input = makeSurface(15, 15, [105, 113, 97]);
  for (let y = 0; y < input.height; y++) for (let x = 0; x < input.width; x++) {
    const noise = ((x * 19 + y * 23) % 9) - 4;
    setPixel(input, x, y, [105 + noise, 113 + noise, 97 + noise]);
  }
  const stabilizer = createSurfaceTextureStabilizer();
  const first = stabilizer.render(input);
  const same = stabilizer.render(input);
  assert.ok(same.heldCells > 0);
  assert.deepEqual(same.rgb, first.rgb);
  assert.deepEqual(same.surfaceCells, first.surfaceCells);

  const jitter = { ...input, rgb: new Uint8Array(input.rgb) };
  for (let cell = 0; cell < input.width * input.height; cell++) {
    const offset = cell * 3;
    jitter.rgb[offset] += 1;
    jitter.rgb[offset + 1] += 1;
    jitter.rgb[offset + 2] += 1;
  }
  const jittered = stabilizer.render(jitter);
  for (let y = 2; y < input.height - 2; y++) for (let x = 2; x < input.width - 2; x++) {
    assert.deepEqual(pixel(jittered.rgb, input.width, x, y), pixel(first.rgb, input.width, x, y),
      'small source jitter does not reselect an interior local sample');
  }

  const flat = makeSurface(11, 11, [100, 100, 100]);
  const cumulative = createSurfaceTextureStabilizer();
  cumulative.render(flat);
  const plus2 = makeSurface(11, 11, [102, 102, 102]);
  assert.deepEqual(pixel(cumulative.render(plus2).rgb, 11, 5, 5), [100, 100, 100], 'a two-level change is held');
  const plus4 = makeSurface(11, 11, [104, 104, 104]);
  assert.deepEqual(pixel(cumulative.render(plus4).rgb, 11, 5, 5), [100, 100, 100], 'the anchor remains fixed at the first frame');
  const plus5 = makeSurface(11, 11, [105, 105, 105]);
  const released = cumulative.render(plus5);
  assert.equal(released.heldCells, 0, 'cumulative drift beyond four levels releases the hold');
  assert.deepEqual(released.rgb, plus5.rgb);
});

test('stabilizer releases around moving weak steps, owners, new details, lights, reset, and geometry changes', () => {
  const stabilizer = createSurfaceTextureStabilizer();
  const base = makeSurface(17, 15, [100, 100, 100]);
  stabilizer.render(base);

  const movedStep = makeSurface(17, 15, [100, 100, 100]);
  for (let y = 4; y <= 5; y++) for (let x = 7; x <= 10; x++) setPixel(movedStep, x, y, [120, 120, 120]);
  const stepProtection = new Uint8Array(movedStep.width * movedStep.height);
  for (let y = 4; y <= 5; y++) for (let x = 7; x <= 10; x++) stepProtection[y * movedStep.width + x] = 1;
  const moved = stabilizer.render({ ...movedStep, protectedCells: stepProtection });
  for (let y = 4; y <= 5; y++) for (let x = 7; x <= 10; x++) {
    assert.deepEqual(pixel(moved.rgb, movedStep.width, x, y), [120, 120, 120], 'new protected content appears immediately');
  }

  const ownerChange = makeSurface(17, 15, [100, 100, 100]);
  stabilizer.render(ownerChange);
  const changedOwners = new Uint32Array(ownerChange.objects);
  changedOwners[7 * ownerChange.width + 8] = 2;
  const ownerFrame = { ...ownerChange, objects: changedOwners };
  const afterOwner = stabilizer.render(ownerFrame);
  assert.equal(afterOwner.surfaceCells[7 * ownerChange.width + 8], 0, 'a changed owner cannot retain the old surface mask');

  const light = makeSurface(17, 15, [100, 100, 100]);
  stabilizer.render(light);
  setPixel(light, 8, 7, [248, 242, 220]);
  const lightMask = new Uint8Array(light.width * light.height);
  lightMask[7 * light.width + 8] = 1;
  const lit = stabilizer.render({ ...light, protectedCells: lightMask });
  assert.deepEqual(pixel(lit.rgb, light.width, 8, 7), [248, 242, 220], 'a newly protected light is never held back');

  stabilizer.reset();
  assert.equal(stabilizer.render(light).heldCells, 0);
  const resized = makeSurface(13, 15, [100, 100, 100]);
  assert.equal(stabilizer.render(resized).heldCells, 0, 'geometry changes establish a fresh anchor');
});
