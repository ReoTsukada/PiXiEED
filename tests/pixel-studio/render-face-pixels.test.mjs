import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectRenderer } from '../../js/pixel-studio/object-renderer.mjs';
import { createGlobalPalette } from '../../js/pixel-studio/global-palette.mjs';
import { rasterizeFaceGuides } from '../../js/pixel-studio/face-features.mjs';

const SIZE = 64;

function makeGuideFace() {
  const points = Array.from({ length: 478 }, () => null);
  const oval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  for (let i = 0; i < oval.length; i++) {
    const angle = i <= 8 ? -Math.PI / 2 + Math.PI / 2 * i / 8
      : i <= 18 ? Math.PI / 2 * (i - 8) / 10
        : i <= 28 ? Math.PI / 2 + Math.PI / 2 * (i - 18) / 10
          : Math.PI + Math.PI / 2 * (i - 28) / 8;
    points[oval[i]] = { x: .5 + .08 * Math.cos(angle), y: .5 + .3 * Math.sin(angle) };
  }
  points[234] = { x: .42, y: .5 }; points[454] = { x: .58, y: .5 };
  points[33] = { x: .455, y: .39 }; points[133] = { x: .48, y: .39 };
  points[263] = { x: .52, y: .39 }; points[362] = { x: .545, y: .39 };
  points[46] = { x: .455, y: .35 }; points[107] = { x: .48, y: .35 };
  points[276] = { x: .52, y: .35 }; points[336] = { x: .545, y: .35 };
  points[168] = { x: .5, y: .38 }; points[6] = { x: .5, y: .42 }; points[197] = { x: .5, y: .45 };
  points[195] = { x: .5, y: .47 }; points[5] = { x: .5, y: .49 }; points[4] = { x: .5, y: .51 };
  points[1] = { x: .5, y: .53 }; points[19] = { x: .5, y: .55 }; points[94] = { x: .5, y: .57 };
  points[2] = { x: .5, y: .59 }; points[98] = { x: .485, y: .58 }; points[97] = { x: .49, y: .585 };
  points[326] = { x: .51, y: .585 }; points[327] = { x: .515, y: .58 };
  points[61] = { x: .47, y: .67 }; points[291] = { x: .53, y: .67 };
  points[13] = { x: .5, y: .66 }; points[14] = { x: .5, y: .68 };
  points[123] = { x: .45, y: .54 }; points[352] = { x: .55, y: .54 };
  return points;
}

function makeFrameAndGuides() {
  const frame = { width: SIZE, height: SIZE, data: new Uint8ClampedArray(SIZE * SIZE * 4) };
  const guide = rasterizeFaceGuides([makeGuideFace()], SIZE, SIZE);
  assert.ok(guide?.compact);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const offset = (y * SIZE + x) * 4;
    const face = Boolean(guide.skin[y * SIZE + x]);
    const color = face ? [205, 164, 137] : [48, 76, 112];
    frame.data.set([...color, 255], offset);
  }
  // A dark hair cap and source contrast at the guided eye, nose and mouth
  // landmarks. Feature points remain inside the rasterized skin polygon.
  for (let y = 14; y <= 15; y++) for (let x = 26; x <= 37; x++) {
    frame.data.set([34, 25, 24, 255], (y * SIZE + x) * 4);
  }
  const pointsByKind = new Map(guide.marks.map(mark => [mark.kind, mark.points]));
  const paintFeatureSamples = (kind, color) => {
    for (const point of pointsByKind.get(kind) ?? []) {
      const cx = Math.floor(point.x * SIZE), cy = Math.floor(point.y * SIZE);
      for (let y = Math.max(0, cy - 1); y <= Math.min(SIZE - 1, cy + 1); y++) {
        for (let x = Math.max(0, cx - 1); x <= Math.min(SIZE - 1, cx + 1); x++) {
          frame.data.set([...color, 255], (y * SIZE + x) * 4);
        }
      }
    }
  };
  paintFeatureSamples('eye', [24, 20, 18]);
  paintFeatureSamples('nose', [162, 124, 105]);
  paintFeatureSamples('mouth', [36, 24, 25]);
  return { frame, guide };
}

function rendererOptions(paletteSession) {
  return { size: SIZE, colors: 24, shading: 'three-tone', dither: 'ordered', simplifySurfaces: true, paletteSession };
}

function assertRgbaMatchesPalette(result) {
  for (let cell = 0; cell < result.indices.length; cell++) {
    const paletteColor = result.palette[result.indices[cell]];
    const p = cell * 4;
    assert.deepEqual([...result.data.subarray(p, p + 3)], paletteColor, `cell ${cell} matches its palette entry`);
    assert.equal(result.data[p + 3], 255, `cell ${cell} has opaque alpha`);
  }
}

test('integrates compact face guides with the 64px global 24-color ordered renderer', () => {
  const { frame, guide } = makeFrameAndGuides();
  const paletteSession = createGlobalPalette({ toneLevels: 8 });
  const guidedRenderer = createObjectRenderer(rendererOptions(paletteSession));
  const controlRenderer = createObjectRenderer(rendererOptions(paletteSession));
  const guidedOptions = { protectedCells: guide.protectedCells, faceGuides: guide };
  const baselineOptions = { protectedCells: guide.protectedCells };

  // Warm both renderers to the same locked palette and temporal starting state.
  const guidedWarmup = guidedRenderer.render(frame, null, baselineOptions);
  const controlWarmup = controlRenderer.render(frame, null, baselineOptions);
  assert.deepEqual(guidedWarmup.palette, controlWarmup.palette);

  const withGuides = guidedRenderer.render(frame, null, guidedOptions);
  const withoutGuides = controlRenderer.render(frame, null, baselineOptions);
  assert.deepEqual(withGuides.labels, withoutGuides.labels, 'face enhancement does not alter object labels');
  assert.deepEqual(withGuides.palette, withoutGuides.palette, 'face enhancement does not add palette colors');
  assert.ok(withGuides.stats.faceSkinCells > 0);
  assert.ok(withGuides.stats.faceFeatureCells > 0);
  assert.ok(withGuides.stats.faceSkinColors <= 3);
  assert.ok(withGuides.indices.some((index, cell) => index !== withoutGuides.indices[cell]),
    'face guides change at least one feature or skin tone cell');
  assertRgbaMatchesPalette(withGuides);

  assert.equal(withGuides.stats.dither, 'selective-canvas-2x2');
  assert.equal(withGuides.stats.ditherLevels, 5);
  assert.equal(withGuides.stats.ditheredCells + withGuides.stats.solidCells, withGuides.indices.length);
  assert.equal(withGuides.stats.ditherCoveragePercent,
    100 * withGuides.stats.ditheredCells / withGuides.indices.length);

  const repeated = guidedRenderer.render(frame, null, guidedOptions);
  assert.deepEqual(repeated.indices, withGuides.indices);
  assert.deepEqual(repeated.data, withGuides.data);
  assert.equal(repeated.stats.faceFeatureCells, withGuides.stats.faceFeatureCells);
  assertRgbaMatchesPalette(repeated);

  const guideRemoved = guidedRenderer.render(frame, null);
  const controlAfter = controlRenderer.render(frame, null);
  assert.deepEqual(guideRemoved.labels, controlAfter.labels);
  assert.deepEqual(guideRemoved.indices, controlAfter.indices,
    'removing guides restores the same no-guide render as a renderer with the same prior state');
  assert.deepEqual(guideRemoved.data, controlAfter.data, 'old eye, nose, or mouth pixels do not persist');
  assert.equal(guideRemoved.stats.faceFeatureCells, 0);
  assertRgbaMatchesPalette(guideRemoved);
});
