import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalPalette } from '../../js/pixel-studio/global-palette.mjs';
import { fitTone, grayLight } from '../../js/pixel-studio/global-tones.mjs';
import { buildSurfaceTones } from '../../js/pixel-studio/surface-tones.mjs';

function capture(rgb) {
  return createGlobalPalette({ toneLevels: 8 }).capture(new Uint8Array([...rgb, ...rgb, ...rgb]));
}

function mapEntries(map) {
  return [...map.entries()].map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]);
}

test('adds at most two source-hue tones per ramp without changing the captured palette', () => {
  const snapshot = capture([180, 75, 42]);
  const originalPalette = snapshot.palette.map((rgb) => [...rgb]);
  const originalSnapshot = structuredClone(snapshot);
  const result = buildSurfaceTones(snapshot);

  assert.deepEqual(result.palette.slice(0, result.baseSize), originalPalette);
  assert.deepEqual(snapshot, originalSnapshot, 'the captured snapshot remains untouched');
  assert.equal(result.baseSize, originalPalette.length);
  assert.equal(result.limit, 48);
  assert.ok(result.palette.length <= 48);
  for (const ramp of snapshot.ramps) {
    const indices = result.extrasByRamp.get(ramp.key);
    assert.ok(Array.isArray(indices));
    assert.ok(indices.length <= 2);
    for (const index of indices) {
      assert.ok(index >= result.baseSize);
      assert.ok(Math.abs(grayLight(...result.palette[index]) - result.targets.get(index)) <= 1);
      assert.deepEqual(result.palette[index], fitTone(ramp.base, result.targets.get(index)));
      assert.ok(Math.abs(grayLight(...result.palette[index]) - grayLight(...result.palette[ramp.mainIndex])) >= 7);
    }
  }
});

test('keeps originals and deterministically deduplicates tones shared across ramps', () => {
  const snapshot = capture([196, 72, 38]);
  const second = structuredClone(snapshot.ramps[0]);
  second.key = 'shared-source-tone';
  snapshot.ramps.push(second);
  const before = structuredClone(snapshot);

  const first = buildSurfaceTones(snapshot);
  const again = buildSurfaceTones(snapshot);
  assert.deepEqual(snapshot, before);
  assert.deepEqual(first.palette, again.palette);
  assert.deepEqual(mapEntries(first.extrasByRamp), mapEntries(again.extrasByRamp));
  assert.deepEqual(mapEntries(first.targets), mapEntries(again.targets));

  const [left, right] = snapshot.ramps.map((ramp) => first.extrasByRamp.get(ramp.key));
  assert.deepEqual(left, right, 'identical source ramps share the same generated palette indices');
  assert.equal(new Set(first.palette.map((rgb) => rgb.join(','))).size, first.palette.length);
});

test('bounds a full 12-ramp capture to 48 colors and keeps each addition local to its ramp', () => {
  const sourceColors = [
    [245, 35, 28], [245, 112, 25], [218, 190, 32], [100, 190, 54],
    [20, 170, 115], [28, 170, 200], [40, 100, 230], [95, 55, 215],
    [180, 45, 190], [220, 75, 130], [150, 92, 45], [205, 160, 130]
  ];
  const palette = sourceColors.map((rgb) => fitTone(rgb, 128));
  palette.push([88, 88, 88], [192, 192, 192]);
  for (let i = 0; i < 10; i++) palette.push([i, i + 1, i + 2]);
  const ramps = sourceColors.map((base, index) => ({
    key: `ramp-${index}`,
    base: [...base],
    indices: [12, index, 13],
    mainIndex: index
  }));
  const result = buildSurfaceTones({ palette, ramps, revision: 7 });

  assert.equal(result.baseSize, 24);
  assert.ok(result.palette.length <= 48);
  assert.equal(result.extrasByRamp.size, 12);
  for (const ramp of ramps) assert.ok(result.extrasByRamp.get(ramp.key).length <= 2);
  assert.equal(new Set(result.palette.map((rgb) => rgb.join(','))).size, result.palette.length);
});

test('places extra tones at the midpoint of existing neighbors around the main tone', () => {
  const base = [210, 82, 36];
  const palette = [
    [24, 24, 24], fitTone(base, 88), fitTone(base, 168),
    fitTone(base, 192), [240, 240, 240]
  ];
  const snapshot = { palette, ramps: [{ key: 'wide-gap', base, mainIndex: 2, indices: [0, 1, 2, 3, 4] }] };
  const result = buildSurfaceTones(snapshot);
  const extras = result.extrasByRamp.get('wide-gap');
  assert.equal(extras.length, 2);
  assert.deepEqual(extras.map((index) => result.targets.get(index)), [128, 180]);
  assert.ok(extras.every((index) => Math.abs(grayLight(...result.palette[index]) - result.targets.get(index)) <= 1));
});

test('does not add shared endpoint colors or colors outside the allowed target range', () => {
  const base = [220, 100, 30];
  const palette = [[24, 24, 24], fitTone(base, 56), fitTone(base, 88), fitTone(base, 240)];
  const snapshot = { palette, ramps: [{ key: 'edge', base, mainIndex: 1, indices: [0, 1, 2, 3] }] };
  const result = buildSurfaceTones(snapshot);
  for (const index of result.extrasByRamp.get('edge')) {
    assert.ok(result.targets.get(index) >= 40 && result.targets.get(index) <= 224);
    assert.notEqual(result.palette[index].join(','), palette[0].join(','));
    assert.notEqual(result.palette[index].join(','), palette[3].join(','));
  }
});

test('rejects malformed snapshots and ramps', () => {
  assert.throws(() => buildSurfaceTones(null), TypeError);
  assert.throws(() => buildSurfaceTones({ palette: [[1, 2, 3]], ramps: [] }), RangeError);
  assert.throws(() => buildSurfaceTones({ palette: [[1, 2, 3], [4, 5, 6]], ramps: [
    { key: 'bad', base: [1, 2, 3], mainIndex: 2, indices: [0] }
  ] }), RangeError);
  assert.throws(() => buildSurfaceTones({ palette: [[1, 2, 3], [4, 5, 6]], ramps: [
    { key: 'bad', base: [1, 2, 3], mainIndex: 1, indices: [0] }
  ] }), RangeError);
});
