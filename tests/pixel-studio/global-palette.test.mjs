import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalPalette } from '../../js/pixel-studio/global-palette.mjs';
import { recognitionSurfaceKey } from '../../js/pixel-studio/global-palette.mjs';
import { recognitionMaterialKey } from '../../js/pixel-studio/fixed-palette.mjs';
import { fitTone, grayLight, grayLevels } from '../../js/pixel-studio/global-tones.mjs';

function rgbPixels(colors) {
  return new Uint8Array(colors.flat());
}

test('captures monotonic revisions, clears, and returns defensive snapshots', () => {
  const palette = createGlobalPalette();
  assert.equal(palette.get(), null);
  const first = palette.capture(rgbPixels([[220, 40, 30], [220, 40, 30]]));
  assert.equal(first.revision, 1);
  first.levels[0] = 200;
  first.levelIndices[0][0] = 200;
  first.palette[0][0] = 255;
  first.ramps[0].indices[0] = 99;
  first.hueGroups[0].indices[0] = 99;
  assert.deepEqual(palette.get().levels, grayLevels(4));
  assert.equal(palette.get().levelIndices[0][0], 0);
  assert.notEqual(palette.get().hueGroups[0].indices[0], 99);
  assert.notEqual(palette.get().palette[0][0], 255);
  assert.notEqual(palette.get().ramps[0].indices[0], 99);
  palette.clear();
  assert.equal(palette.get(), null);
  assert.equal(palette.capture(rgbPixels([[20, 30, 40]])).revision, 2);
});

test('rejects invalid options and captures without changing revision on bad input', () => {
  assert.throws(() => createGlobalPalette({ toneLevels: 5 }), RangeError);
  assert.throws(() => createGlobalPalette({ saturation: 0 }), RangeError);
  const palette = createGlobalPalette();
  assert.throws(() => palette.capture(new Uint8Array([1, 2])), RangeError);
  assert.throws(() => palette.capture(rgbPixels([[10, 20, 30]]), null, [-1]), RangeError);
  assert.equal(palette.get(), null);
  assert.equal(palette.capture(rgbPixels([[10, 20, 30]])).revision, 1);
});

test('keeps the global palette within 24 colors and all entries on a global gray level', () => {
  const colors = [];
  for (let i = 0; i < 240; i++) {
    colors.push([(i * 73) % 256, (i * 151) % 256, (i * 199) % 256]);
  }
  for (const toneLevels of [4, 8]) {
    const snapshot = createGlobalPalette({ toneLevels }).capture(rgbPixels(colors));
    assert.equal(snapshot.paletteLimit, 24);
    assert.ok(snapshot.palette.length <= 24);
    assert.equal(snapshot.levelIndices[0].length, 1);
    assert.equal(snapshot.levelIndices.at(-1).length, 1);
    assert.ok(snapshot.ramps.every((ramp) => ramp.mainIndex >= 0 && ramp.mainIndex < snapshot.palette.length));
    assert.deepEqual(snapshot.levelIndices.flat().sort((a, b) => a - b),
      [...new Set(snapshot.levelIndices.flat())].sort((a, b) => a - b));
    for (const color of snapshot.palette) {
      const light = grayLight(...color);
      assert.ok(snapshot.levels.some((level) => Math.abs(light - level) <= 1), `${color} has gray ${light}`);
    }
    for (const ramp of snapshot.ramps) {
      assert.deepEqual(ramp.indices, [...new Set(ramp.indices)].sort((a, b) => a - b));
      assert.ok(ramp.indices.every((index) => index >= 0 && index < snapshot.palette.length));
      assert.ok(ramp.indices.includes(snapshot.levelIndices[0][0]));
      assert.ok(ramp.indices.includes(snapshot.levelIndices.at(-1)[0]));
      assert.ok(ramp.indices.includes(ramp.mainIndex));
    }
  }
});

test('retains a small dark connected sample next to a much larger orange region', () => {
  const width = 30, height = 12;
  const colors = Array.from({ length: width * height }, () => [225, 105, 28]);
  colors[5 * width + 5] = [22, 28, 42];
  colors[5 * width + 6] = [22, 28, 42];
  const snapshot = createGlobalPalette().capture(rgbPixels(colors), null, null, { width, height });
  assert.ok(snapshot.ramps.some((ramp) => ramp.base[0] < 35 && ramp.base[1] < 45 && ramp.base[2] < 60));
  assert.ok(snapshot.ramps.some((ramp) => ramp.base[0] > 180 && ramp.base[1] > 70));
});

test('palette RGB is deterministic and independent of object-label numbering', () => {
  const rgb = rgbPixels([[210, 95, 20], [210, 95, 20], [18, 26, 38], [18, 26, 38]]);
  const geometry = { width: 2, height: 2 };
  const left = createGlobalPalette().capture(rgb, new Uint8Array([1, 1, 2, 2]), null, geometry);
  const right = createGlobalPalette().capture(rgb, new Uint8Array([99, 99, 7, 7]), null, geometry);
  assert.deepEqual(left.palette, right.palette);
});

test('saturation is used for recognition while saturated source hue remains in the ramp', () => {
  const snapshot = createGlobalPalette({ saturation: 2.5 }).capture(rgbPixels([[230, 28, 18]]));
  const ramp = snapshot.ramps[0];
  const coloredTones = ramp.indices.filter((index) => !snapshot.levelIndices[0].includes(index) &&
    !snapshot.levelIndices.at(-1).includes(index)).map((index) => snapshot.palette[index]);
  const brightest = coloredTones.sort((a, b) => grayLight(...b) - grayLight(...a))[0];
  assert.ok(brightest[0] > brightest[1] * 1.05);
  assert.ok(brightest[0] > brightest[2] * 1.05);
  assert.deepEqual(ramp.base, [230, 28, 18]);
});

test('fine surface keys split nearby warm hues while keeping red wrap deterministic', () => {
  const brown = [179, 95, 89];
  const skinWarm = [179, 128, 89];
  assert.equal(recognitionMaterialKey(...brown), recognitionMaterialKey(...skinWarm));
  assert.notEqual(recognitionSurfaceKey(...brown), recognitionSurfaceKey(...skinWarm));
  assert.equal(recognitionSurfaceKey(255, 0, 5), recognitionSurfaceKey(255, 5, 0));
  assert.equal(recognitionSurfaceKey(120, 119, 118), 0);
});

test('object equality splits connected regions, numeric relabeling is stable, and bases are source samples', () => {
  const rgb = rgbPixels([[100, 40, 30], [110, 45, 35]]);
  const geometry = { width: 2, height: 1 };
  const first = createGlobalPalette().capture(rgb, new Uint16Array([11, 11]), null, geometry);
  const renumbered = createGlobalPalette().capture(rgb, new Uint16Array([700, 700]), null, geometry);
  const split = createGlobalPalette().capture(rgb, new Uint16Array([11, 12]), null, geometry);
  assert.deepEqual(first.palette, renumbered.palette);
  assert.deepEqual(first.ramps[0].base, [100, 40, 30]);
  assert.equal(split.ramps.length, 2);
});

test('separated identical samples may have separate ramps but never duplicate palette RGB entries', () => {
  const colors = [[179, 95, 89], [35, 150, 80], [179, 95, 89]];
  const snapshot = createGlobalPalette().capture(rgbPixels(colors), null, null, { width: 3, height: 1 });
  const unique = new Set(snapshot.palette.map((color) => color.join(',')));
  assert.equal(unique.size, snapshot.palette.length);
});

test('fits source shades without chroma boosting, keeps neutrals neutral, and uses a neutral shared shadow', () => {
  const base = [132, 96, 78];
  const snapshot = createGlobalPalette().capture(rgbPixels([base]));
  const ramp = snapshot.ramps.find((entry) => entry.base.join(',') === base.join(','));
  const mainLevel = snapshot.levelIndices.findIndex((indices) => indices.includes(ramp.mainIndex));
  assert.ok(mainLevel > 0 && mainLevel < snapshot.levels.length - 1);
  assert.equal(snapshot.mainColorChromaScale, 1);
  assert.deepEqual(snapshot.palette[ramp.mainIndex], fitTone(base, snapshot.levels[mainLevel]));
  assert.ok(Math.abs(grayLight(...snapshot.palette[ramp.mainIndex]) - snapshot.levels[mainLevel]) <= 1);
  assert.equal(snapshot.sharedShadow, 'neutral');
  assert.deepEqual(snapshot.palette[0], fitTone([43, 43, 43], snapshot.levels[0]));
  assert.ok(Math.max(...snapshot.palette[0]) - Math.min(...snapshot.palette[0]) <= 1);

  const neutral = createGlobalPalette().capture(rgbPixels([[132, 132, 132]]));
  const neutralRamp = neutral.ramps[0];
  for (const index of neutral.levelIndices.slice(1, -1).flat()) {
    assert.ok(Math.max(...neutral.palette[index]) - Math.min(...neutral.palette[index]) <= 1);
  }

  const nearNeutralBase = [132, 132, 120];
  const nearNeutral = createGlobalPalette({ toneLevels: 8 }).capture(rgbPixels([nearNeutralBase]));
  const nearNeutralRamp = nearNeutral.ramps[0];
  const mainLevelIndex = nearNeutral.levelIndices.findIndex((indices) => indices.includes(nearNeutralRamp.mainIndex));
  assert.ok(mainLevelIndex > 0 && mainLevelIndex < nearNeutral.levels.length - 1);
  assert.deepEqual(nearNeutral.palette[nearNeutralRamp.mainIndex], fitTone(nearNeutralBase, nearNeutral.levels[mainLevelIndex]));
});

test('keeps adjacent warm hues with different saturation distinct at one shared gray target', () => {
  const vividOrange = [200, 100, 50];
  const mutedWarm = [170, 130, 95];
  const snapshot = createGlobalPalette().capture(rgbPixels([
    ...Array.from({ length: 40 }, () => vividOrange),
    ...Array.from({ length: 40 }, () => mutedWarm)
  ]));
  const vividRamp = snapshot.ramps.find((ramp) => ramp.base.join(',') === vividOrange.join(','));
  const mutedRamp = snapshot.ramps.find((ramp) => ramp.base.join(',') === mutedWarm.join(','));
  assert.ok(vividRamp && mutedRamp);
  assert.notEqual(vividRamp.materialKey, mutedRamp.materialKey);
  const vividLevel = snapshot.levelIndices.findIndex((indices) => indices.includes(vividRamp.mainIndex));
  const mutedLevel = snapshot.levelIndices.findIndex((indices) => indices.includes(mutedRamp.mainIndex));
  assert.equal(vividLevel, mutedLevel);
  assert.ok(vividLevel > 0 && vividLevel < snapshot.levels.length - 1);
  const vividMain = snapshot.palette[vividRamp.mainIndex];
  const mutedMain = snapshot.palette[mutedRamp.mainIndex];
  assert.notDeepEqual(vividMain, mutedMain);
  assert.ok(Math.abs(grayLight(...vividMain) - grayLight(...mutedMain)) <= 1);
});

test('keeps a substantial warm skin main color beside orange clothing despite many tiny magenta accents', () => {
  const width = 64, height = 48;
  const colors = Array.from({ length: width * height }, () => [45, 90, 150]);
  const patch = (x0, y0, patchWidth, patchHeight, color) => {
    for (let y = y0; y < y0 + patchHeight; y++) {
      for (let x = x0; x < x0 + patchWidth; x++) colors[y * width + x] = color;
    }
  };
  const skin = [215, 182, 153];
  const orange = [210, 94, 25];
  patch(2, 2, 18, 20, [230, 222, 212]); // large face highlight
  patch(2, 23, 18, 18, skin); // substantial warm midtone face area
  patch(22, 2, 42, 40, orange);
  patch(2, 43, 9, 5, [25, 22, 30]); // dark hair
  const accents = [
    [205, 44, 150], [185, 45, 180], [235, 60, 165], [170, 48, 200],
    [220, 50, 195], [195, 55, 215], [240, 72, 190], [180, 38, 145], [225, 45, 175]
  ];
  accents.forEach((color, i) => patch(14 + i * 5, 44, 2, 2, color));

  const snapshot = createGlobalPalette().capture(rgbPixels(colors), null, null, { width, height });
  const hasBase = (target) => snapshot.ramps.some((ramp) => ramp.base.every((value, i) => value === target[i]));
  assert.ok(hasBase(skin), `expected warm skin sample in ${JSON.stringify(snapshot.ramps.map((ramp) => ramp.base))}`);
  assert.ok(hasBase(orange), 'orange clothing main color should remain represented');
  assert.ok(hasBase([25, 22, 30]), 'dark hair sample should remain represented');
  assert.ok(snapshot.ramps.length <= 12);
  const skinRamp = snapshot.ramps.find((ramp) => ramp.base.every((value, i) => value === skin[i]));
  const orangeRamp = snapshot.ramps.find((ramp) => ramp.base.every((value, i) => value === orange[i]));
  assert.ok(skinRamp && orangeRamp);
  assert.notEqual(skinRamp.mainIndex, orangeRamp.mainIndex);
  const skinMain = snapshot.palette[skinRamp.mainIndex];
  assert.ok(skinMain[0] < skinMain[1] * 1.6 && skinMain[1] > skinMain[2]);
});

test('keeps opposing hues out of each other’s ramps and assigns mainIndex by compatible gray proximity', () => {
  const red = [220, 30, 20], blue = [20, 40, 220];
  const snapshot = createGlobalPalette({ toneLevels: 8 }).capture(rgbPixels([
    ...Array.from({ length: 8 }, () => red),
    ...Array.from({ length: 8 }, () => blue)
  ]));
  const redRamp = snapshot.ramps.find((ramp) => ramp.base[0] > ramp.base[2] * 2);
  const blueRamp = snapshot.ramps.find((ramp) => ramp.base[2] > ramp.base[0] * 2);
  assert.ok(redRamp && blueRamp);
  const middleIndices = (ramp) => ramp.indices.filter((index) =>
    !snapshot.levelIndices[0].includes(index) && !snapshot.levelIndices.at(-1).includes(index));
  const redKeys = middleIndices(redRamp).map((index) => recognitionSurfaceKey(...snapshot.palette[index]));
  const blueKeys = middleIndices(blueRamp).map((index) => recognitionSurfaceKey(...snapshot.palette[index]));
  const hueBin = (key) => key === 0 ? null : Math.floor((key - 1) / 2);
  const closeHue = (a, b) => {
    const distance = Math.abs(a - b);
    return Math.min(distance, 24 - distance) <= 1;
  };
  assert.ok(redKeys.every((key) => key === 0 || closeHue(hueBin(key), hueBin(recognitionSurfaceKey(...red)))));
  assert.ok(blueKeys.every((key) => key === 0 || closeHue(hueBin(key), hueBin(recognitionSurfaceKey(...blue)))));
  assert.ok(!redKeys.some((key) => key !== 0 && closeHue(hueBin(key), hueBin(recognitionSurfaceKey(...blue)))));
  assert.ok(!blueKeys.some((key) => key !== 0 && closeHue(hueBin(key), hueBin(recognitionSurfaceKey(...red)))));

  for (const ramp of snapshot.ramps) {
    assert.ok(ramp.indices.includes(ramp.mainIndex));
    const candidates = middleIndices(ramp);
    const gray = grayLight(...ramp.base);
    const nearest = candidates.reduce((best, index) => {
      const distance = Math.abs(grayLight(...snapshot.palette[index]) - gray);
      return distance < best.distance || (distance === best.distance && index < best.index)
        ? { index, distance } : best;
    }, { index: Infinity, distance: Infinity });
    assert.equal(ramp.mainIndex, nearest.index);
  }
});

test('prioritizes a dominant source hue near its gray level and label renumbering cannot reorder levels', () => {
  const width = 40, height = 20;
  const green = [65, 160, 80], orange = [220, 90, 25], blue = [25, 45, 210];
  const colors = Array.from({ length: width * height }, () => green);
  for (let y = 0; y < height; y++) {
    for (let x = 25; x < width; x++) colors[y * width + x] = orange;
  }
  for (let i = 0; i < 8; i++) colors[i] = blue;
  const rgb = rgbPixels(colors);
  const labelsA = new Uint16Array(width * height), labelsB = new Uint16Array(width * height);
  for (let i = 0; i < labelsA.length; i++) {
    labelsA[i] = colors[i] === green ? 1 : colors[i] === orange ? 2 : 3;
    labelsB[i] = labelsA[i] * 37 + 200;
  }
  const geometry = { width, height };
  const first = createGlobalPalette({ toneLevels: 8 }).capture(rgb, labelsA, null, geometry);
  const renumbered = createGlobalPalette({ toneLevels: 8 }).capture(rgb, labelsB, null, geometry);
  assert.deepEqual(first.palette, renumbered.palette);
  assert.deepEqual(first.levelIndices, renumbered.levelIndices);
  assert.deepEqual(first.ramps.map((ramp) => [ramp.base, ramp.mainIndex]),
    renumbered.ramps.map((ramp) => [ramp.base, ramp.mainIndex]));
  const greenRamp = first.ramps.find((ramp) => ramp.base[1] > ramp.base[0] * 1.5 && ramp.base[1] > ramp.base[2]);
  assert.ok(greenRamp);
  const sourceGray = grayLight(...greenRamp.base);
  const nearestLevel = first.levels.slice(1, -1).reduce((best, level, index) =>
    Math.abs(level - sourceGray) < Math.abs(best.level - sourceGray) ? { level, index: index + 1 } : best,
  { level: first.levels[1], index: 1 });
  const selected = first.levelIndices[nearestLevel.index].map((index) => first.palette[index]);
  assert.ok(selected.some((color) => color[1] > color[0] * 1.5 && color[1] > color[2]));
});

test('neutral source samples do not add cool shadow tones', () => {
  const colors = [
    ...Array.from({ length: 120 }, () => [150, 150, 150]),
    ...Array.from({ length: 20 }, () => [100, 100, 100])
  ];
  const snapshot = createGlobalPalette({ toneLevels: 8 }).capture(rgbPixels(colors));
  const grayRamp = snapshot.ramps.find((ramp) => ramp.materialKey === 0);
  assert.ok(grayRamp);
  const main = snapshot.palette[grayRamp.mainIndex];
  assert.ok(Math.max(...main) - Math.min(...main) <= 1);
  for (const index of snapshot.levelIndices.slice(1, -1).flat()) {
    const color = snapshot.palette[index];
    assert.ok(Math.max(...color) - Math.min(...color) <= 1, `neutral sample gained color cast: ${color}`);
  }
  assert.equal(snapshot.sharedShadow, 'neutral');
  assert.deepEqual(snapshot.palette[0], fitTone([43, 43, 43], snapshot.levels[0]));
});

function dispersedSkinFixture() {
  const width = 64, height = 64, count = width * height;
  const colors = Array.from({ length: count }, (_, i) => {
    const value = 142 + i % 84;
    return [value, value - 2, value - 5];
  });
  const slots = Array.from({ length: count }, (_, i) => (i * 2053) % count);
  let offset = 0;
  const paint = (amount, colorAt) => {
    for (let i = 0; i < amount; i++) colors[slots[offset++]] = colorAt(i);
  };
  paint(1024, () => [225, 105, 45]);
  const skin = [[185, 160, 125], [196, 168, 138], [192, 164, 131], [200, 170, 140]];
  paint(147, i => skin[i % skin.length]);
  paint(256, () => [30, 65, 150]);
  paint(1, () => [236, 50, 190]);
  paint(1, () => [165, 145, 50]);
  return { width, height, rgb: rgbPixels(colors), skinBase: [185, 160, 125] };
}

test('reserves a distributed supported skin key ahead of isolated accents without widening palette limits', () => {
  const fixture = dispersedSkinFixture();
  const skinKey = recognitionSurfaceKey(...fixture.skinBase);
  const session = createGlobalPalette({ toneLevels: 8 });
  const captured = session.capture(fixture.rgb);
  const skinRamps = captured.ramps.filter(ramp => ramp.materialKey === skinKey);
  assert.ok(skinRamps.length > 0, `supported skin key ${skinKey} survives prototype selection`);
  const skinMain = captured.palette[skinRamps[0].mainIndex];
  assert.ok(skinMain[0] > skinMain[1] && skinMain[1] > skinMain[2], `skin hue/chroma survives: ${skinMain}`);
  assert.ok(Math.hypot(...skinMain.map((value, i) => value - fixture.skinBase[i])) < 25,
    `skin main stays near its source color: ${skinMain}`);

  const extremes = new Set([captured.levelIndices[0][0], captured.levelIndices.at(-1)[0]]);
  const skinMiddleIndices = new Set(skinRamps.flatMap(ramp => ramp.indices).filter(index => !extremes.has(index)));
  assert.ok(skinMiddleIndices.size <= 3, `exact skin key stays within three middle colors: ${skinMiddleIndices.size}`);
  assert.equal(captured.paletteLimit, 24);
  assert.ok(captured.palette.length <= 24);
  assert.equal(captured.levelIndices[0].length, 1);
  assert.equal(captured.levelIndices.at(-1).length, 1);
  assert.deepEqual(captured.levels, grayLevels(8));
  for (const color of captured.palette) {
    assert.ok(captured.levels.some(level => Math.abs(grayLight(...color) - level) <= 1), `${color} remains on an 8-level gray target`);
  }
  assert.ok(captured.ramps.some(ramp => ramp.base[0] > ramp.base[2] * 2 && ramp.base[2] < 65),
    'the diversity fill keeps a supported dark chromatic accent');

  const frozen = session.get();
  captured.palette[0][0] = 255;
  captured.ramps[0].base[0] = 0;
  assert.deepEqual(session.get(), frozen, 'the selected source palette remains frozen after capture returns');
});
