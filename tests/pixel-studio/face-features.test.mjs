import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizeFaceFeatures, rasterizeFaceGuides } from '../../js/pixel-studio/face-features.mjs';

function makeFace() {
  const points = Array.from({ length: 478 }, () => null);
  points[234] = { x: 0.2, y: 0.5 };
  points[454] = { x: 0.8, y: 0.5 };
  // Right eye + brow, left eye + brow, and lips lie in separate fixture zones.
  points[33] = { x: 0.28, y: 0.3 };
  points[7] = { x: 0.32, y: 0.3 };
  points[46] = { x: 0.28, y: 0.24 };
  points[53] = { x: 0.32, y: 0.24 };
  points[263] = { x: 0.68, y: 0.3 };
  points[249] = { x: 0.72, y: 0.3 };
  points[276] = { x: 0.68, y: 0.24 };
  points[283] = { x: 0.72, y: 0.24 };
  points[61] = { x: 0.46, y: 0.68 };
  points[146] = { x: 0.49, y: 0.68 };
  points[375] = { x: 0.52, y: 0.68 };
  points[291] = { x: 0.55, y: 0.68 };
  return points;
}

function makeGuideFace({ rotated = false } = {}) {
  const points = Array.from({ length: 478 }, () => null);
  const oval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
  const coordinates = [[.5,.2],[.59,.22],[.66,.28],[.69,.36],[.7,.44],[.69,.53],[.66,.62],[.62,.71],[.57,.77],[.5,.79],[.43,.77],[.38,.71],[.34,.62],[.31,.53],[.3,.44],[.31,.36],[.34,.28],[.41,.22]];
  for (let i = 0; i < oval.length; i += 1) points[oval[i]] = { x: coordinates[i % coordinates.length][0], y: coordinates[i % coordinates.length][1] };
  points[234] = { x: .42, y: .5 };
  points[454] = { x: .58, y: .5 };
  points[33] = { x: .455, y: .39 }; points[133] = { x: .48, y: .39 };
  points[263] = { x: .52, y: .39 }; points[362] = { x: .545, y: .39 };
  points[46] = { x: .455, y: .375 }; points[107] = { x: .48, y: .375 };
  points[276] = { x: .52, y: .375 }; points[336] = { x: .545, y: .375 };
  points[168] = { x: .5, y: .38 }; points[6] = { x: .5, y: .42 }; points[197] = { x: .5, y: .45 };
  points[195] = { x: .5, y: .47 }; points[5] = { x: .5, y: .49 }; points[4] = { x: .5, y: .51 };
  points[1] = { x: .5, y: .53 }; points[19] = { x: .5, y: .55 }; points[94] = { x: .5, y: .57 };
  points[2] = { x: .5, y: .59 }; points[98] = { x: .485, y: .58 }; points[97] = { x: .49, y: .585 };
  points[326] = { x: .51, y: .585 }; points[327] = { x: .515, y: .58 };
  points[61] = { x: .47, y: .67 }; points[291] = { x: .53, y: .67 };
  points[13] = { x: .5, y: .66 }; points[14] = { x: .5, y: .68 };
  points[123] = { x: .36, y: .54 }; points[352] = { x: .64, y: .54 };
  if (rotated) {
    for (const point of points) {
      if (point) {
        const dx = point.x - .5; const dy = point.y - .5;
        point.x = .5 + (dx * .8) - (dy * .6);
        point.y = .5 + (dx * .6) + (dy * .8);
      }
    }
  }
  return points;
}

test('protects eye, eyebrow, and lip landmarks as a thin binary pixel mask', () => {
  const width = 100;
  const height = 100;
  const mask = rasterizeFaceFeatures([makeFace()], width, height);
  assert.equal(mask.length, width * height);
  assert.ok(mask instanceof Uint8Array);
  assert.ok(mask[(30 * width) + 28], 'eye contour gets protected');
  assert.ok(mask[(24 * width) + 28], 'eyebrow gets protected');
  assert.ok(mask[(68 * width) + 46], 'lip contour gets protected');
  assert.equal(mask[(50 * width) + 50], 0, 'central face skin stays available to rendering');
  assert.equal(mask[0], 0, 'outside detail landmarks stays unprotected');
});

test('returns an empty mask when no usable face is present', () => {
  for (const faces of [undefined, null, [], [{}], [[]]]) {
    const mask = rasterizeFaceFeatures(faces, 12, 8);
    assert.equal(mask.length, 96);
    assert.equal(mask.some(Boolean), false);
  }
});

test('clips feature strokes at output edges and ignores malformed landmark outliers', () => {
  const face = makeFace();
  face[33] = { x: -0.25, y: -0.25 };
  face[7] = { x: 1.25, y: 1.25 };
  const mask = rasterizeFaceFeatures([face], 16, 16);
  assert.equal(mask.length, 256);
  assert.ok(mask.some(Boolean), 'other valid facial details remain protected');
});

test('rejects non-positive or non-integer output dimensions', () => {
  for (const [width, height] of [[0, 10], [10, 0], [-1, 10], [2.5, 10], [10, NaN], [513, 1], [1, 513]]) {
    assert.throws(() => rasterizeFaceFeatures([], width, height), RangeError);
  }
});

test('bounds raster work for extreme but finite face-width landmarks', () => {
  const face = makeFace();
  face[234] = { x: -1, y: 0.5 };
  face[454] = { x: 2, y: 0.5 };
  const mask = rasterizeFaceFeatures([face], 512, 512);
  assert.ok(mask.reduce((sum, value) => sum + value, 0) < 10000);
});

test('returns compact semantic eye, nose and mouth guides for a ten-pixel face', () => {
  const guide = rasterizeFaceGuides([makeGuideFace()], 64, 64);
  assert.ok(guide);
  assert.equal(guide.compact, true);
  assert.ok(guide.faceWidth >= 10 && guide.faceWidth <= 11);
  for (const kind of ['eye', 'nose', 'mouth']) {
    const mark = guide.marks.find((candidate) => candidate.kind === kind);
    assert.ok(mark?.cells.length, `${kind} has raster cells`);
    assert.ok(mark.cells.every((cell) => Number.isInteger(cell) && cell >= 0 && cell < 4096));
  }
  const eye = guide.marks.find((mark) => mark.kind === 'eye');
  const nose = guide.marks.find((mark) => mark.kind === 'nose');
  const mouth = guide.marks.find((mark) => mark.kind === 'mouth');
  assert.ok(!eye.cells.some((cell) => nose.cells.includes(cell)), 'eye and nose guides remain distinct');
  assert.ok(!nose.cells.some((cell) => mouth.cells.includes(cell)), 'nose and mouth guides remain distinct');
  assert.ok(guide.protectedCells.reduce((sum, value) => sum + value, 0) < 80, 'compact protection does not flood facial skin');
  assert.ok(mouth.cells.length <= 4, 'compact mouth uses one thin corner-to-corner line');
  assert.ok(eye.cells.length <= 2, 'very small face uses one cell per eye');
  assert.ok(eye.cells.length + nose.cells.length + mouth.cells.length <= 8, 'tiny-face feature protection stays sparse');
  assert.ok(!guide.marks.some((mark) => mark.kind === 'brow'), 'brows in the eye neighborhood are omitted');
  assert.equal(nose.cells.length, 1, 'compact nose protection keeps a single nose-base cell');
  assert.equal(nose.points.length, 3, 'nose color samples retain both alar points and the center');
  const forehead = guide.samples[0];
  assert.deepEqual(forehead, { x: (0.5 + 0.5) / 2, y: (0.2 + 0.38) / 2 });
  assert.ok(guide.skin.some(Boolean), 'skin polygon is available independently');
  assert.equal(guide.skin[0], 0, 'skin polygon does not include the background corner');
});

test('maps normalized landmarks with floor-and-clamp pixel coordinates', () => {
  const face = makeGuideFace();
  face[33] = { x: 0.25, y: 0.25 };
  face[133] = { x: 0.3, y: 0.25 };
  const guide = rasterizeFaceGuides([face], 64, 64);
  const eye = guide.marks.find((mark) => mark.kind === 'eye');
  assert.ok(eye.cells.includes((16 * 64) + 17), 'x/y coordinates use floor(value * extent) and compact eye centers');
});

test('compact guides follow rotated landmarks and retain their semantic labels', () => {
  const guide = rasterizeFaceGuides([makeGuideFace({ rotated: true })], 64, 64);
  assert.ok(guide?.compact);
  assert.deepEqual(guide.marks.map((mark) => mark.kind).sort(), ['eye', 'mouth', 'nose']);
  assert.ok(guide.marks.every((mark) => mark.cells.length > 0));
});

test('falls back with null for missing, degenerate, tiny, or out-of-bounds guides', () => {
  assert.equal(rasterizeFaceGuides([], 64, 64), null);
  const tiny = makeGuideFace(); tiny[454].x = tiny[234].x + .05;
  assert.equal(rasterizeFaceGuides([tiny], 64, 64), null);
  const invalid = makeGuideFace(); invalid[2] = { x: 1.5, y: .5 };
  assert.equal(rasterizeFaceGuides([invalid], 64, 64), null);
  const missing = makeGuideFace(); missing[168] = null;
  assert.equal(rasterizeFaceGuides([missing], 64, 64), null);
  const degenerate = makeGuideFace();
  for (const index of [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]) degenerate[index] = { x: .5, y: .5 };
  assert.equal(rasterizeFaceGuides([degenerate], 64, 64), null);
  assert.throws(() => rasterizeFaceGuides([], 513, 2), RangeError);
});

test('larger faces keep the legacy detail mask and add a nose guide', () => {
  const face = makeGuideFace();
  face[454].x = .9;
  face[234].x = .1;
  face[46] = { x: .455, y: .36 };
  face[107] = { x: .48, y: .36 };
  const guide = rasterizeFaceGuides([face], 64, 64);
  assert.ok(guide);
  assert.equal(guide.compact, false);
  assert.ok(guide.marks.find((mark) => mark.kind === 'nose').cells.length > 1);
  assert.ok(guide.marks.some((mark) => mark.kind === 'brow'), 'larger faces retain non-overlapping brow cells');
  assert.ok(guide.protectedCells.some(Boolean));
});
