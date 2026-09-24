import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThreeTonePalette } from '../../js/pixel-studio/three-tone-palette.mjs';

function color(r, g, b, weight = 1) {
  return { key: (r << 16) | (g << 8) | b, r, g, b, weight };
}

function region(id, candidates, weight = candidates.reduce((sum, item) => sum + item.weight, 0), extra = {}) {
  return { id, cells: [], weight, candidates, representative: candidates[0], paletteIndices: [], ...extra };
}

test('allocates up to three actual sampled luminance tones per base-color group', () => {
  const skin = region('person:skin', [color(80, 45, 30, 4), color(160, 100, 70, 10), color(230, 180, 140, 3)], 17,
    { baseGroupId: 'skin' });
  const hair = region('person:hair', [color(20, 10, 8, 8), color(70, 35, 20, 12), color(130, 75, 45, 5)], 25,
    { baseGroupId: 'hair' });
  const result = buildThreeTonePalette(new Map([[skin.id, skin], [hair.id, hair]]), 6);

  assert.equal(result.palette.length, 6);
  assert.equal(hair.paletteIndices.length, 3);
  assert.equal(skin.paletteIndices.length, 3);
  for (const group of [skin, hair]) {
    const selected = group.paletteIndices.map((index) => result.palette[index]);
    assert.ok(selected.every((rgb) => group.candidates.some((candidate) => candidate.r === rgb[0] && candidate.g === rgb[1] && candidate.b === rgb[2])),
      'all palette colors are actual source samples');
    const luma = selected.map(([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b).sort((a, b) => a - b);
    assert.ok(luma[0] < luma[1] && luma[1] < luma[2], 'selected tones progress from shadow through base to highlight');
  }
  assert.ok(hair.paletteIndices.length <= 3 && skin.paletteIndices.length <= 3);
});

test('flat-color and low-luminance-spread groups collapse to one real base swatch', () => {
  const flat = region(7, [color(101, 101, 101, 9)], 9);
  const slightNoise = region(8, [color(101, 101, 101, 4), color(108, 108, 108, 5)], 9);
  const result = buildThreeTonePalette(new Map([[7, flat], [8, slightNoise]]), 24);

  assert.deepEqual(flat.paletteIndices, [0]);
  assert.deepEqual(slightNoise.paletteIndices, [1]);
  assert.deepEqual(result.palette, [[101, 101, 101], [108, 108, 108]]);
  assert.ok(result.palette.every((rgb) => [flat, slightNoise].some((group) => group.candidates.some((item) => item.r === rgb[0] && item.g === rgb[1] && item.b === rgb[2]))));
});

test('keeps a useful low-spread line tone while ignoring line candidates below the contrast threshold', () => {
  const line = color(108, 108, 108, 1);
  line.lineWeight = 20;
  const subtle = color(102, 102, 102, 1);
  subtle.lineWeight = 20;
  const protectedLine = region('protected-line', [color(100, 100, 100, 9), line], 10);
  const lowContrast = region('low-contrast-line', [color(100, 100, 100, 9), subtle], 10);
  const result = buildThreeTonePalette(new Map([
    [protectedLine.id, protectedLine], [lowContrast.id, lowContrast]
  ]), 24);

  assert.deepEqual(protectedLine.paletteIndices.map((index) => result.palette[index]), [
    [100, 100, 100], [108, 108, 108]
  ]);
  assert.deepEqual(lowContrast.paletteIndices.map((index) => result.palette[index]), [[100, 100, 100]]);
});

test('line tones replace the same-side quantile, retain the opposite tone, and stay within three colors', () => {
  const shadowLine = color(85, 85, 85, 1);
  shadowLine.lineWeight = 50;
  const shadowRegion = region('shadow-line', [
    color(20, 20, 20, 35), color(100, 100, 100, 30), color(230, 230, 230, 35), shadowLine
  ], 101);
  const highlightLine = color(140, 140, 140, 1);
  highlightLine.lineWeight = 50;
  const highlightRegion = region('highlight-line', [
    color(20, 20, 20, 35), color(100, 100, 100, 30), color(230, 230, 230, 35), highlightLine
  ], 101);
  const result = buildThreeTonePalette(new Map([
    [shadowRegion.id, shadowRegion], [highlightRegion.id, highlightRegion]
  ]), 24);
  const selected = (item) => item.paletteIndices.map((index) => result.palette[index]);

  assert.deepEqual(selected(shadowRegion), [[100, 100, 100], [85, 85, 85], [230, 230, 230]]);
  assert.deepEqual(selected(highlightRegion), [[100, 100, 100], [20, 20, 20], [140, 140, 140]]);
  assert.ok(shadowRegion.paletteIndices.length <= 3);
  assert.ok(highlightRegion.paletteIndices.length <= 3);
  for (const item of [shadowRegion, highlightRegion]) {
    assert.ok(selected(item).every((rgb) => item.candidates.some((candidate) =>
      candidate.r === rgb[0] && candidate.g === rgb[1] && candidate.b === rgb[2])));
  }
});

test('regions without line weights retain the existing quantile palette', () => {
  const group = region('quantile-regression', [
    color(20, 20, 20, 35), color(100, 100, 100, 30), color(230, 230, 230, 35)
  ], 100);
  const result = buildThreeTonePalette(new Map([[group.id, group]]), 24);

  assert.deepEqual(group.paletteIndices.map((index) => result.palette[index]), [
    [100, 100, 100], [20, 20, 20], [230, 230, 230]
  ]);
});

test('reserves base swatches for largest groups before allocating any shade tones', () => {
  const large = region('large', [color(20, 20, 20, 20), color(120, 120, 120, 20), color(240, 240, 240, 20)], 60);
  const medium = region('medium', [color(30, 30, 30, 10), color(130, 130, 130, 10), color(230, 230, 230, 10)], 30);
  const small = region('small', [color(40, 40, 40, 2), color(140, 140, 140, 2), color(220, 220, 220, 2)], 6);
  const result = buildThreeTonePalette(new Map([[small.id, small], [medium.id, medium], [large.id, large]]), 2);

  assert.equal(result.palette.length, 2);
  assert.equal(large.paletteIndices.length, 1);
  assert.equal(medium.paletteIndices.length, 1);
  assert.deepEqual(small.paletteIndices, []);
  assert.equal(result.regionList.length, 3);
});

test('deduplicates exact RGB swatches while keeping each owning material group', () => {
  const first = region('a', [color(40, 40, 40, 2), color(140, 140, 140, 4), color(230, 230, 230, 2)], 8,
    { baseGroupId: 'a' });
  const second = region('b', [color(40, 40, 40, 2), color(120, 120, 120, 4), color(210, 210, 210, 2)], 8,
    { baseGroupId: 'b' });
  const result = buildThreeTonePalette(new Map([['a', first], ['b', second]]), 6);
  const shared = result.palette.findIndex((rgb) => rgb.join(',') === '40,40,40');

  assert.ok(shared >= 0);
  assert.deepEqual([...result.owners[shared]].sort(), ['a', 'b']);
  assert.ok(first.paletteIndices.includes(shared));
  assert.ok(second.paletteIndices.includes(shared));
  assert.ok(first.paletteIndices.length <= 3 && second.paletteIndices.length <= 3);
});

test('enforces the 24-color budget across many groups and prioritizes shades by weight and spread', () => {
  const groups = Array.from({ length: 10 }, (_, index) => {
    const base = index * 10;
    const weight = 10 - index;
    const candidates = [color(base, 0, index, weight), color(base + 70, 0, index, weight), color(base + 140, 0, index, weight)];
    return region(`material-${index}`, candidates, weight * 3, { baseGroupId: `material-${index}` });
  });
  const result = buildThreeTonePalette(new Map(groups.map((item) => [item.id, item])), 24);

  assert.equal(result.palette.length, 24);
  assert.ok(groups.every((item) => item.paletteIndices.length <= 3));
  assert.deepEqual(groups.slice(0, 7).map((item) => item.paletteIndices.length), Array(7).fill(3));
  assert.deepEqual(groups.slice(7).map((item) => item.paletteIndices.length), Array(3).fill(1));
});

test('crowded 48-color scenes reserve a complete ramp for the largest face material', () => {
  const face = region('face', [
    color(70, 35, 20, 6), color(150, 90, 55, 18), color(230, 170, 120, 6)
  ], 30, { baseGroupId: 'person-face' });
  const speckles = Array.from({ length: 100 }, (_, index) => {
    const r = index, g = (index * 3 + 1) % 256, b = (index * 7 + 2) % 256;
    return region(`speckle-${index}`, [color(r, g, b, 1)], 1, { baseGroupId: `speckle-${index}` });
  });
  const all = [face, ...speckles];
  const result = buildThreeTonePalette(new Map(all.map((item) => [item.id, item])), 48);

  assert.equal(face.paletteIndices.length, 3, 'the largest face group keeps base, shadow, and highlight');
  assert.ok(speckles.every((item) => item.paletteIndices.length <= 1));
  assert.ok(all.every((item) => item.paletteIndices.length <= 3));
  assert.ok(result.palette.length <= 48);
  assert.ok(face.paletteIndices.every((index) => result.palette[index].length === 3));
});

test('priorityWeight protects a small feature region without changing its sampled quantile colors', () => {
  const makeFace = (extra = {}) => region('face-detail', [
    color(72, 34, 24, 1), color(146, 88, 58, 1), color(224, 165, 118, 1)
  ], 3, { baseGroupId: 'face-detail', ...extra });
  const baselineFace = makeFace();
  const baseline = buildThreeTonePalette(new Map([[baselineFace.id, baselineFace]]), 48);

  const face = makeFace({ priorityWeight: 1200 });
  const backgrounds = Array.from({ length: 40 }, (_, index) => {
    const base = (index * 29) % 200;
    return region(`background-${index}`, [
      color(base, 12, 20 + index, 25),
      color(base + 22, 35, 52 + index, 25),
      color(base + 44, 58, 84 + index, 25)
    ], 75, { baseGroupId: `background-${index}` });
  });
  const all = [face, ...backgrounds];
  const result = buildThreeTonePalette(new Map(all.map((item) => [item.id, item])), 48);

  assert.equal(face.paletteIndices.length, 3, 'the protected small region receives a primary slot and full ramp');
  const selected = face.paletteIndices.map((index) => result.palette[index]);
  assert.deepEqual(selected, baselineFace.paletteIndices.map((index) => baseline.palette[index]),
    'priority changes allocation order only; quantile selection remains based on actual candidate weights');
  assert.ok(selected.every((rgb) => face.candidates.some((candidate) => rgb[0] === candidate.r && rgb[1] === candidate.g && rgb[2] === candidate.b)),
    'priority adds no synthetic colors');
  assert.ok(result.palette.length <= 48);
});

test('invalid priorityWeight falls back to the measured region weight', () => {
  const regular = region('regular', [color(30, 30, 30, 8)], 8);
  const invalidPriority = region('invalid-priority', [color(220, 220, 220, 2)], 2, { priorityWeight: Infinity });
  const result = buildThreeTonePalette(new Map([[invalidPriority.id, invalidPriority], [regular.id, regular]]), 1);
  assert.deepEqual(regular.paletteIndices, [0]);
  assert.deepEqual(invalidPriority.paletteIndices, []);
  assert.deepEqual(result.palette, [[30, 30, 30]]);
});

test('tone allocation is deterministic across map insertion order', () => {
  const makeGroups = () => [
    region('b', [color(30, 20, 10, 2), color(90, 60, 30, 7), color(180, 120, 60, 3)], 12, { baseGroupId: 'b' }),
    region('a', [color(40, 15, 10, 3), color(110, 45, 20, 8), color(210, 100, 45, 2)], 13, { baseGroupId: 'a' })
  ];
  const left = new Map(makeGroups().map((item) => [item.id, item]));
  const right = new Map(makeGroups().reverse().map((item) => [item.id, item]));
  const leftResult = buildThreeTonePalette(left, 5);
  const rightResult = buildThreeTonePalette(right, 5);
  assert.deepEqual(leftResult.palette, rightResult.palette);
  const indicesById = (groups) => [...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([id, item]) => [id, item.paletteIndices]);
  assert.deepEqual(indicesById(left), indicesById(right));
});

test('rejects malformed region input and invalid palette limits', () => {
  assert.throws(() => buildThreeTonePalette([], 24), TypeError);
  assert.throws(() => buildThreeTonePalette(new Map(), 0), RangeError);
  assert.throws(() => buildThreeTonePalette(new Map([['empty', region('empty', [], 1)]]), 24), TypeError);
});
