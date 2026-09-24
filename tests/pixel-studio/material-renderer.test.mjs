import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';
import { classifyMaterials } from '../../js/pixel-studio/material-groups.mjs';

function makeFrame(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = (y * width + x) * 4;
    const [r, g, b, a = 255] = colorAt(x, y);
    data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = a;
  }
  return { width, height, data };
}

function makeSegmentation(width, height, idAt) {
  const labels = new Uint32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    labels[y * width + x] = idAt(x, y);
  }
  return { width, height, labels };
}

function rgbSet(data) {
  const set = new Set();
  for (let p = 0; p < data.length; p += 4) set.add(`${data[p]},${data[p + 1]},${data[p + 2]}`);
  return set;
}

test('three-tone limits warm skin and dark neutral hair gradients to three sampled colors per material', () => {
  const frame = makeFrame(16, 16, (x, y) => {
    if (x < 8) return [160 + y * 4, 70 + y * 3, 45 + y, 255];
    const gray = 10 + y * 3;
    return [gray, gray, gray, 255];
  });
  const segmentation = makeSegmentation(16, 16, (x) => x < 8 ? 11 : 12);
  const original = new Uint8ClampedArray(frame.data);
  const originalLabels = new Uint32Array(segmentation.labels);

  const result = createObjectRenderer({ size: 4, colors: 24, shading: 'three-tone' }).render(frame, segmentation);

  assert.equal(result.stats.shading, 'three-tone');
  assert.equal(result.stats.materialCount, 2, 'warm and dark-neutral ramps stay separate');
  assert.ok(result.stats.maxMaterialColors <= 3);
  assert.ok(result.stats.maxMaterialColors >= 2, 'each gradient can retain more than its base tone');
  assert.deepEqual(frame.data, original, 'rendering never mutates the source');
  assert.deepEqual(segmentation.labels, originalLabels, 'rendering never mutates source labels');
  const inputColors = rgbSet(frame.data);
  for (let p = 0; p < result.data.length; p += 4) {
    assert.equal(result.data[p + 3], 255);
    assert.ok(inputColors.has(`${result.data[p]},${result.data[p + 1]},${result.data[p + 2]}`), 'tone swatches are source samples');
  }
});

test('adjacent red and blue object masks keep hard boundaries and emit no antialiased colors', () => {
  const frame = makeFrame(8, 4, (x, y) => x < 4 ? [240, 24, 32, (x + y) % 2 ? 96 : 255] : [20, 56, 232, (x + y) % 2 ? 0 : 192]);
  const segmentation = makeSegmentation(8, 4, (x) => x < 4 ? 1 : 2);
  const result = createObjectRenderer({ size: 8, colors: 24, shading: 'three-tone' }).render(frame, segmentation);

  assert.deepEqual(rgbSet(result.data), new Set(['240,24,32', '20,56,232']));
  for (let y = 0; y < result.height; y++) {
    assert.equal(result.labels[y * result.width + 3], 1);
    assert.equal(result.labels[y * result.width + 4], 2);
  }
  for (let p = 3; p < result.data.length; p += 4) assert.equal(result.data[p], 255, 'output is opaque with no alpha fringe');
});

test('a one-pixel object remains represented when the source is reduced', () => {
  const frame = makeFrame(8, 4, (x) => x === 3 ? [32, 244, 72, 255] : [224, 224, 224, 255]);
  const segmentation = makeSegmentation(8, 4, (x) => x === 3 ? 99 : 0);
  const result = createObjectRenderer({ size: 4, colors: 24, shading: 'three-tone' }).render(frame, segmentation);

  assert.ok(result.labels.includes(99));
  assert.ok(rgbSet(result.data).has('32,244,72'));
});

test('small stationary RGB noise keeps the previous three-tone palette', () => {
  const segmentation = makeSegmentation(16, 16, () => 7);
  const renderer = createObjectRenderer({ size: 4, colors: 24, shading: 'three-tone' });
  const first = makeFrame(16, 16, () => [186, 112, 78, 255]);
  const noisy = makeFrame(16, 16, () => [188, 110, 80, 255]);
  const before = renderer.render(first, segmentation);
  const after = renderer.render(noisy, segmentation);

  assert.deepEqual(after.data, before.data);
  assert.ok(after.stats.paletteHeldEntries > 0);
});

test('near-equal-luminance color texture is stable under independent RGB noise of two levels', () => {
  const shades = [
    [[150, 90, 60], [152, 88, 60], [148, 92, 60]],
    [[180, 108, 72], [182, 106, 72], [178, 110, 72]],
    [[210, 126, 84], [212, 124, 84], [208, 128, 84]]
  ];
  const makeTexture = (noisy) => makeFrame(48, 48, (x, y) => {
    const gx = Math.floor(x / 3), gy = Math.floor(y / 3);
    const tone = (gx + gy) % shades.length;
    const sample = shades[tone][(gx * 2 + gy) % 3];
    const noise = noisy ? [((gx + gy) % 3 - 1) * 2, ((gx * 2 + gy) % 3 - 1) * 2, ((gx + gy * 2) % 3 - 1) * 2] : [0, 0, 0];
    return [sample[0] + noise[0], sample[1] + noise[1], sample[2] + noise[2], 255];
  });
  const segmentation = makeSegmentation(48, 48, () => 23);
  const renderer = createObjectRenderer({ size: 16, colors: 24, shading: 'three-tone' });
  const before = renderer.render(makeTexture(false), segmentation);
  const after = renderer.render(makeTexture(true), segmentation);

  assert.deepEqual(after.data, before.data, 'palette and cell assignments do not flicker with sensor noise');
  assert.ok(after.stats.paletteSize <= 24);
  assert.ok(after.stats.maxMaterialColors <= 3);
});

test('three-tone output follows a gradual large color drift without exceeding three colors', () => {
  const segmentation = makeSegmentation(16, 16, () => 31);
  const renderer = createObjectRenderer({ size: 8, colors: 24, shading: 'three-tone' });
  const start = [200, 100, 50], target = [80, 152, 96];
  let result = null;

  for (let step = 0; step <= 120; step++) {
    const t = step / 120;
    const color = start.map((channel, index) => Math.round(channel + (target[index] - channel) * t));
    result = renderer.render(makeFrame(16, 16, () => [...color, 255]), segmentation);
    assert.ok(result.stats.maxMaterialColors <= 3);
    assert.ok(result.stats.paletteSize <= 24);
    if (step > 0) assert.equal(result.stats.sceneCut, false, 'small per-frame changes are not a scene cut');
  }

  const finalColors = rgbSet(result.data);
  assert.equal(finalColors.size, 1);
  const finalRgb = [...finalColors][0].split(',').map(Number);
  assert.ok(Math.max(...finalRgb.map((channel, index) => Math.abs(channel - target[index]))) <= 6,
    'after cumulative drift, output approaches the current source within the material hold threshold');
  assert.notDeepEqual(finalRgb, start, 'the original palette is not held indefinitely');
});

test('a scene cut releases the previous three-tone palette immediately', () => {
  const segmentation = makeSegmentation(16, 16, () => 3);
  const renderer = createObjectRenderer({ size: 4, colors: 24, shading: 'three-tone' });
  renderer.render(makeFrame(16, 16, () => [220, 24, 32, 255]), segmentation);
  const cut = renderer.render(makeFrame(16, 16, () => [20, 48, 232, 255]), segmentation);

  assert.equal(cut.stats.sceneCut, true);
  assert.deepEqual(rgbSet(cut.data), new Set(['20,48,232']));
});

test('a crowded global palette stays capped and each material receives at most three colors', () => {
  const width = 32, height = 2;
  const frame = makeFrame(width, height, (x) => [32 + x * 6, 200 - x * 4, 24 + x * 3, 255]);
  const segmentation = makeSegmentation(width, height, (x) => x + 1);
  const result = createObjectRenderer({ size: width, colors: 24, shading: 'three-tone' }).render(frame, segmentation);

  assert.equal(result.stats.regionCount, width);
  assert.ok(result.stats.paletteSize <= 24);
  assert.ok(result.stats.overBudgetRegionCount > 0, 'fixture exceeds the global palette budget');
  assert.ok(result.stats.maxMaterialColors <= 3);
  for (let p = 0; p < result.data.length; p += 4) assert.equal(result.data[p + 3], 255);
});

function classify(rgb, previous = null) {
  return classifyMaterials(new Uint8Array(rgb), new Uint32Array([7]), previous);
}

test('material hysteresis holds stationary noise against its anchored RGB reference', () => {
  const initialRgb = new Uint8Array([190, 112, 72]);
  const initial = classify(initialRgb);
  const previous = {
    objects: new Uint32Array([7]),
    labels: initial.materials,
    sourceRgb: initialRgb,
    materialReferenceRgb: initial.referenceRgb
  };
  const noiseRgb = new Uint8Array([193, 110, 75]);
  const noisy = classify(noiseRgb, previous);

  assert.equal(noisy.held, 1);
  assert.deepEqual(noisy.materials, initial.materials);
  assert.deepEqual(noisy.referenceRgb, initial.referenceRgb, 'held noise does not walk the reference');
  assert.deepEqual(noisy.materials, classify(initialRgb).materials,
    'held noise preserves the material identity produced by the public classifier');
});

test('slow color drift eventually releases a held material family at the anchor threshold', () => {
  let sourceRgb = new Uint8Array([200, 100, 50]);
  let result = classify(sourceRgb);
  let previous = {
    objects: new Uint32Array([7]),
    labels: result.materials,
    sourceRgb,
    materialReferenceRgb: result.referenceRgb
  };
  const initialLabel = result.materials[0];

  for (let green = 101; green <= 200; green++) {
    sourceRgb = new Uint8Array([200, green, 50]);
    result = classify(sourceRgb, previous);
    previous = {
      objects: new Uint32Array([7]),
      labels: result.materials,
      sourceRgb,
      materialReferenceRgb: result.referenceRgb
    };
  }

  assert.notEqual(result.materials[0], initialLabel, 'a sustained hue-family change must not remain frozen');
  assert.deepEqual(result.materials, classify(new Uint8Array([200, 200, 50])).materials,
    'released drift uses the public classifier result for the current source color');
  assert.notDeepEqual(result.referenceRgb, new Uint8Array([200, 100, 50]), 'the material reference advances after accumulated drift');
  assert.ok(Math.max(...result.referenceRgb.map((channel, index) => Math.abs(channel - sourceRgb[index]))) <= 6,
    'reference remains within the declared hold threshold of the current source');
});
