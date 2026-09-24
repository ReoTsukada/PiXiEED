import test from 'node:test';
import assert from 'node:assert/strict';
import { createGlobalPalette } from '../../js/pixel-studio/global-palette.mjs';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';
import { grayLight } from '../../js/pixel-studio/global-tones.mjs';

function makeFrame(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    data.set([...colorAt(x, y), 255], offset);
  }
  return { width, height, data };
}

function makeSegmentation(width, height, ownerAt) {
  return { width, height, labels: Uint32Array.from({ length: width * height }, (_, cell) =>
    ownerAt(cell % width, Math.floor(cell / width))) };
}

function lockPalette(frame, segmentation = null) {
  const rgb = new Uint8Array(frame.width * frame.height * 3);
  for (let cell = 0; cell < frame.width * frame.height; cell++) {
    rgb.set(frame.data.subarray(cell * 4, cell * 4 + 3), cell * 3);
  }
  const session = createGlobalPalette({ toneLevels: 8 });
  session.capture(rgb, segmentation?.labels ?? null, null, { width: frame.width, height: frame.height });
  return session;
}

function renderer(session, size, simplifyLighting) {
  return createObjectRenderer({ size, colors: 24, shading: 'three-tone', dither: 'ordered',
    simplifySurfaces: true, simplifyLighting, paletteSession: session });
}

function lightAt(result, x, y) {
  const offset = (y * result.width + x) * 4;
  return grayLight(result.data[offset], result.data[offset + 1], result.data[offset + 2]);
}

function assertPaletteOutput(result) {
  assert.ok(result.palette.length <= 24, `palette size ${result.palette.length}`);
  assert.equal(result.data.length, result.width * result.height * 4);
  for (let cell = 0; cell < result.indices.length; cell++) {
    const offset = cell * 4, color = result.palette[result.indices[cell]];
    assert.deepEqual([...result.data.subarray(offset, offset + 3)], color, `pixel ${cell} comes from the fixed palette`);
    assert.equal(result.data[offset + 3], 255, `pixel ${cell} remains opaque`);
  }
}

function nightScene(width = 64, height = 48, coreX = 32) {
  const coreY = Math.floor(height / 2);
  const frame = makeFrame(width, height, (x, y) => {
    const distance = Math.max(Math.abs(x - coreX) - 1, Math.abs(y - coreY) - 1);
    if (distance <= 0) return [255, 232, 184];
    if (distance === 1) return [230, 178, 108];
    if (distance === 2) return [166, 128, 78];
    if (distance === 3) return [101, 77, 48];
    return [50, 39, 25];
  });
  const segmentation = makeSegmentation(width, height, (x, y) =>
    Math.abs(x - coreX) <= 1 && Math.abs(y - coreY) <= 1 ? 2 : 1);
  return { frame, segmentation, coreX, coreY };
}

test('suppresses a night-light halo while retaining the compact light source and stable output', () => {
  const { frame, segmentation, coreX, coreY } = nightScene();
  const session = lockPalette(frame, segmentation);
  const control = renderer(session, 64, false).render(frame, segmentation);
  const draw = renderer(session, 64, true);
  const simplified = draw.render(frame, segmentation);
  const repeated = draw.render(frame, segmentation);

  assert.ok(simplified.stats.suppressedHaloCells > 0, 'the broad, soft halo is recognized');
  assert.ok(lightAt(simplified, coreX, coreY) >= 210, 'the bright source core survives');
  assert.ok(lightAt(simplified, coreX, coreY) > lightAt(simplified, coreX + 4, coreY) + 55,
    'the source remains visibly brighter than its immediate outer glow');
  assert.ok(lightAt(simplified, coreX + 4, coreY) < lightAt(control, coreX + 4, coreY),
    'the rendered halo cell is dimmer than the legacy path');
  assert.deepEqual(repeated.data, simplified.data, 'a static frame does not pulse between renders');
  assert.deepEqual(repeated.labels, simplified.labels, 'lighting cleanup leaves segmentation labels unchanged');
  assertPaletteOutput(simplified);
});

function brightInteriorScene() {
  const width = 64, height = 48;
  const shadowCenter = { x: 27, y: 22 };
  const frame = makeFrame(width, height, (x, y) => {
    if (x >= 46 && x < 58 && y >= 4 && y < 16) return [244, 242, 236];
    if (x >= 47 && x < 56 && y >= 32 && y < 43) return [9, 8, 10];
    if (x >= 5 && x < 21 && y >= 29 && y < 45) {
      if ((y === 34 && (x === 9 || x === 10 || x === 15 || x === 16))) return [31, 22, 21];
      return [207, 163, 139];
    }
    const distanceSquared = (x - shadowCenter.x) ** 2 + (y - shadowCenter.y) ** 2;
    const factor = 1 - 0.13 * Math.exp(-distanceSquared / (2 * 4.2 ** 2));
    return [222, 202, 180].map((channel) => Math.round(channel * factor));
  });
  const segmentation = makeSegmentation(width, height, (x, y) => {
    if (x >= 46 && x < 58 && y >= 4 && y < 16) return 2;
    if (x >= 47 && x < 56 && y >= 32 && y < 43) return 3;
    if (x >= 5 && x < 21 && y >= 29 && y < 45) return 4;
    return 1;
  });
  const protectedCells = new Uint8Array(width * height);
  for (const x of [9, 10, 15, 16]) protectedCells[34 * width + x] = 1;
  return { frame, segmentation, protectedCells, shadowCenter };
}

test('lifts weak shadows on bright surfaces without altering dark/white objects, hard labels, or protected eye lines', () => {
  const { frame, segmentation, protectedCells, shadowCenter } = brightInteriorScene();
  const session = lockPalette(frame, segmentation);
  const legacy = renderer(session, 64, false).render(frame, segmentation, { protectedCells });
  const simplified = renderer(session, 64, true).render(frame, segmentation, { protectedCells });

  assert.ok(simplified.stats.flattenedShadowCells > 0, 'a broad, shallow room shadow is detected');
  assert.ok(lightAt(simplified, shadowCenter.x, shadowCenter.y) > lightAt(legacy, shadowCenter.x, shadowCenter.y),
    'the rendered bright-surface shadow is softened');
  assert.deepEqual(simplified.labels, segmentation.labels, 'hard object IDs remain untouched');
  for (let y = 4; y < 16; y++) for (let x = 46; x < 58; x++) {
    assert.deepEqual(simplified.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3),
      legacy.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3), 'bright white object stays unchanged');
  }
  for (let y = 32; y < 43; y++) for (let x = 47; x < 56; x++) {
    assert.deepEqual(simplified.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3),
      legacy.data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 3), 'black object stays unchanged');
  }
  for (let cell = 0; cell < protectedCells.length; cell++) if (protectedCells[cell]) {
    assert.deepEqual(simplified.data.subarray(cell * 4, cell * 4 + 3), legacy.data.subarray(cell * 4, cell * 4 + 3),
      'protected eye-line pixels keep their legacy appearance');
  }
  assertPaletteOutput(simplified);
});

test('a moving source leaves no illumination residue compared with a fresh renderer sharing its palette', () => {
  const first = nightScene(64, 48, 18), moved = nightScene(64, 48, 45);
  const session = lockPalette(first.frame, first.segmentation);
  const live = renderer(session, 64, true);
  live.render(first.frame, first.segmentation);
  const actual = live.render(moved.frame, moved.segmentation);
  const expected = renderer(session, 64, true).render(moved.frame, moved.segmentation);

  assert.deepEqual(actual.palette, expected.palette);
  assert.deepEqual(actual.data, expected.data, 'the old glow does not remain after the source moves');
  assertPaletteOutput(actual);
});

test('preserves source aspect ratio at both 64px and 128px render sizes', () => {
  for (const [size, width, height] of [[64, 96, 64], [128, 192, 128]]) {
    const frame = makeFrame(width, height, (x, y) => {
      const band = Math.floor(x / (width / 3));
      return band === 0 ? [36, 42, 50] : band === 1 ? [200, 172, 145] : [18, 17, 19];
    });
    const segmentation = makeSegmentation(width, height, (x) =>
      x < width / 3 ? 1 : x < width * 2 / 3 ? 2 : 3);
    const result = renderer(lockPalette(frame, segmentation), size, true).render(frame, segmentation);
    assert.equal(result.width, size);
    assert.equal(result.height, Math.round(size * height / width));
    assert.ok(Math.abs(result.width / result.height - width / height) < 0.02);
    assertPaletteOutput(result);
  }
});

function meanLight(result, cells) {
  return cells.reduce((sum, [x, y]) => sum + lightAt(result, x, y), 0) / Math.max(1, cells.length);
}

function wideShadowScene(withMask) {
  const width = 128, height = 96;
  const shadowCenter = { x: 54, y: 44 };
  const frame = makeFrame(width, height, (x, y) => {
    if (x >= 83 && x < 99 && y >= 25 && y < 71) return [25, 30, 35];
    const distanceSquared = (x - shadowCenter.x) ** 2 + (y - shadowCenter.y) ** 2;
    const falloff = Math.round(50 * Math.exp(-distanceSquared / 400));
    return [218 - falloff, 206 - falloff, 181 - falloff];
  });
  const segmentation = withMask
    ? makeSegmentation(width, height, (x, y) => x >= 83 && x < 99 && y >= 25 && y < 71 ? 7 : 0)
    : null;
  const cells = [];
  for (let y = 25; y < 64; y++) for (let x = 44; x < 65; x++) {
    if ((x - shadowCenter.x) ** 2 + (y - shadowCenter.y) ** 2 <= 4 ** 2) cells.push([x, y]);
  }
  const referenceCells = [];
  for (let y = 16; y < 73; y++) for (let x = 25; x < 82; x++) {
    const radius = Math.hypot(x - shadowCenter.x, y - shadowCenter.y);
    if (radius >= 20 && radius <= 27) referenceCells.push([x, y]);
  }
  return { frame, segmentation, shadowCenter, cells, referenceCells };
}

test('reduces a wide bright-surface shadow by half and brings its center near the surrounding wall with or without a mask', () => {
  for (const withMask of [false, true]) {
    const { frame, segmentation, cells, referenceCells } = wideShadowScene(withMask);
    const session = lockPalette(frame, segmentation);
    const legacy = renderer(session, 128, false).render(frame, segmentation);
    const simplified = renderer(session, 128, true).render(frame, segmentation);
    const legacyContrast = meanLight(legacy, referenceCells) - meanLight(legacy, cells);
    const simplifiedContrast = meanLight(simplified, referenceCells) - meanLight(simplified, cells);

    assert.ok(legacyContrast > 8, `fixture has visible original shading (${legacyContrast.toFixed(1)})`);
    assert.ok(simplifiedContrast <= legacyContrast * 0.5,
      `shadow contrast is reduced by at least half (${legacyContrast.toFixed(1)} → ${simplifiedContrast.toFixed(1)})`);
    assert.ok(Math.abs(simplifiedContrast) <= 8,
      `shadow center approaches the surrounding wall (${simplifiedContrast.toFixed(1)} luminance difference)`);
    const captured = renderer(createGlobalPalette({ toneLevels: 8, saturation: 1.25 }), 128, true).render(frame, segmentation);
    const wallLights = [];
    for (let y = 6; y <= 82; y++) for (let x = 16; x <= 92; x++) {
      if (Math.hypot(x - 54, y - 44) <= 38 && frame.data[(y * 128 + x) * 4] > 150) wallLights.push(lightAt(captured, x, y));
    }
    assert.ok(Math.max(...wallLights) - Math.min(...wallLights) <= 8,
      'flattening must not leave a dark donut at the former shadow edge');
    assert.ok(simplified.stats.flattenedShadowCells > 0, 'the renderer reports cleaned shadow cells');
    assertPaletteOutput(simplified);
  }
});

function nightPointSource() {
  const width = 128, height = 96, center = { x: 64, y: 36 };
  const frame = makeFrame(width, height, (x, y) => {
    const radius = Math.hypot(x - center.x, y - center.y);
    if (radius <= 2) return [255, 246, 220];
    const glow = Math.round(130 * Math.exp(-(radius ** 2) / 55));
    return [10 + glow, 12 + glow, 18 + glow];
  });
  const core = [];
  const halo = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const radius = Math.hypot(x - center.x, y - center.y);
    if (radius <= 2) core.push([x, y]);
    if (radius >= 5 && radius <= 10) halo.push([x, y]);
  }
  return { frame, center, core, halo };
}

test('keeps a compact night point source while dimming its five-to-ten-pixel halo', () => {
  const { frame, core, halo } = nightPointSource();
  const session = lockPalette(frame);
  const legacy = renderer(session, 128, false).render(frame);
  const simplified = renderer(session, 128, true).render(frame);
  const coreLight = meanLight(simplified, core);
  const legacyHaloLight = meanLight(legacy, halo);
  const simplifiedHaloLight = meanLight(simplified, halo);

  assert.ok(coreLight >= 210, `compact source stays bright (${coreLight.toFixed(1)})`);
  assert.ok(simplifiedHaloLight < legacyHaloLight * 0.75,
    `surrounding glow is visibly reduced (${legacyHaloLight.toFixed(1)} → ${simplifiedHaloLight.toFixed(1)})`);
  assert.ok(simplified.stats.suppressedHaloCells > 0);
  assertPaletteOutput(simplified);
});
