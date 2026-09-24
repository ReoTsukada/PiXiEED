import test from 'node:test';
import assert from 'node:assert/strict';
import { refineThinLineSamples } from '../../js/pixel-studio/thin-lines.mjs';

function makeFrame(width = 24, height = 16, background = [200, 200, 200]) {
  const rgb = new Uint8Array(width * height * 3);
  const coverageRgb = new Float32Array(width * height * 3);
  const objects = new Uint32Array(width * height).fill(1);
  for (let cell = 0; cell < width * height; cell++) {
    rgb.set(background, cell * 3);
    coverageRgb.set(background, cell * 3);
  }
  return { rgb, coverageRgb, objects, width, height };
}

function paintRidge(frame, points, color = [30, 40, 50], coverage = 1) {
  for (const [x, y] of points) for (const row of [y, y + 1]) {
    const p = (row * frame.width + x) * 3;
    frame.rgb.set(color, p);
    for (let channel = 0; channel < 3; channel++) {
      frame.coverageRgb[p + channel] = 200 + (color[channel] - 200) * coverage;
    }
  }
}

function paintThinLine(frame, points, color = [30, 40, 50], coverage = 1) {
  for (const [x, y] of points) {
    const p = (y * frame.width + x) * 3;
    frame.rgb.set(color, p);
    for (let channel = 0; channel < 3; channel++) frame.coverageRgb[p + channel] = 200 + (color[channel] - 200) * coverage;
  }
}

function horizontalPoints(x0 = 5, x1 = 15, y = 6) {
  return Array.from({ length: x1 - x0 + 1 }, (_, offset) => [x0 + offset, y]);
}

function thresholdLine({ background = 100, line = 90, points = horizontalPoints() } = {}) {
  const frame = makeFrame(24, 16, [background, background, background]);
  paintThinLine(frame, points, [line, line, line], 1);
  return frame;
}

test('regularizes a two-pixel straight ridge into a one-pixel line without a surrounding halo', () => {
  const frame = makeFrame();
  const ridge = horizontalPoints();
  paintRidge(frame, ridge);
  const result = refineThinLineSamples(frame);
  assert.equal(result.lineCount, 1);
  assert.equal(result.regularizedCells, ridge.length);
  assert.equal(result.lineCells.reduce((sum, value) => sum + value, 0), ridge.length);
  for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
    const p = (y * frame.width + x) * 3;
    const changed = result.rgb[p] !== frame.rgb[p] || result.rgb[p + 1] !== frame.rgb[p + 1] || result.rgb[p + 2] !== frame.rgb[p + 2];
    if (changed) assert.ok(x >= 5 && x <= 15 && y >= 6 && y <= 7, `unexpected halo at ${x},${y}`);
  }
});

for (const coverage of [0.25, 0.5]) {
  test(`one-pixel subpixel coverage ${coverage} selects the matching RGB and paints no halo`, () => {
    const frame = makeFrame();
    paintThinLine(frame, horizontalPoints(), [30, 40, 50], coverage);
    const result = refineThinLineSamples(frame);
    assert.equal(result.lineCount, 1);
    const pathCell = 6 * frame.width + 10;
    const p = pathCell * 3;
    const expected = [30, 40, 50].map((channel) => Math.round(200 + (channel - 200) * coverage));
    assert.deepEqual([...result.rgb.slice(p, p + 3)], expected);
    assert.equal(result.softenedLines, 1);
    for (let cell = 0; cell < frame.width * frame.height; cell++) {
      if (result.lineCells[cell]) continue;
      const q = cell * 3;
      assert.deepEqual([...result.rgb.slice(q, q + 3)], [...frame.rgb.slice(q, q + 3)], `halo at cell ${cell}`);
    }
  });
}

for (const coverage of [0.25, 0.5]) {
  test(`two-pixel ridge coverage ${coverage} aggregates across its footprint`, () => {
    const frame = makeFrame();
    paintRidge(frame, horizontalPoints(), [30, 40, 50], coverage);
    const result = refineThinLineSamples(frame);
    const totalCoverage = Math.min(1, coverage * 2);
    const p = (7 * frame.width + 10) * 3;
    const expected = [30, 40, 50].map((channel) => Math.round(200 + (channel - 200) * totalCoverage));
    assert.equal(result.lineCount, 1);
    assert.deepEqual([...result.rgb.slice(p, p + 3)], expected);
    assert.equal(result.softenedLines, totalCoverage < 1 ? 1 : 0);
  });
}

test('keeps a stepped diagonal ridge as a single eight-connected path', () => {
  const frame = makeFrame();
  const points = Array.from({ length: 11 }, (_, offset) => [5 + offset, 4 + Math.floor(offset * 0.4)]);
  paintRidge(frame, points);
  const result = refineThinLineSamples(frame);
  const cells = [];
  for (let cell = 0; cell < result.lineCells.length; cell++) if (result.lineCells[cell]) cells.push(cell);
  assert.equal(result.lineCount, 1);
  assert.equal(cells.length, 11);
  for (let i = 1; i < cells.length; i++) {
    const dx = Math.abs(cells[i] % frame.width - cells[i - 1] % frame.width);
    const dy = Math.abs(Math.floor(cells[i] / frame.width) - Math.floor(cells[i - 1] / frame.width));
    assert.ok(dx <= 1 && dy <= 1 && dx + dy > 0, 'successive output pixels form a digital staircase');
  }
});

test('leaves a material/object boundary and one-sided step edge unchanged', () => {
  const boundary = makeFrame();
  paintRidge(boundary, horizontalPoints());
  for (let y = 0; y < boundary.height; y++) for (let x = 12; x < boundary.width; x++) {
    boundary.objects[y * boundary.width + x] = 2;
  }
  const boundaryResult = refineThinLineSamples(boundary);
  assert.ok(boundaryResult.lineCount >= 1);
  const changedOwners = new Set();
  for (let cell = 0; cell < boundaryResult.lineCells.length; cell++) {
    if (boundaryResult.lineCells[cell]) changedOwners.add(boundary.objects[cell]);
  }
  assert.equal(changedOwners.size, 1, 'the regularized path stays within one object ID');
  for (let cell = 0; cell < boundary.objects.length; cell++) {
    if (boundary.objects[cell] !== 2) continue;
    const p = cell * 3;
    assert.deepEqual([...boundaryResult.rgb.slice(p, p + 3)], [...boundary.rgb.slice(p, p + 3)], 'the adjacent object remains unchanged');
  }

  const edge = makeFrame();
  for (let y = 8; y < edge.height; y++) for (let x = 0; x < edge.width; x++) edge.rgb.set([40, 40, 40], (y * edge.width + x) * 3);
  const edgeResult = refineThinLineSamples(edge);
  assert.equal(edgeResult.lineCount, 0);
  assert.deepEqual(edgeResult.rgb, edge.rgb);
});

test('does not alter a protected facial detail or a curved ridge', () => {
  const protectedFrame = makeFrame();
  paintRidge(protectedFrame, horizontalPoints());
  const protectedCells = new Uint8Array(protectedFrame.width * protectedFrame.height);
  for (let x = 5; x <= 15; x++) {
    protectedCells[6 * protectedFrame.width + x] = 1;
    protectedCells[7 * protectedFrame.width + x] = 1;
  }
  const protectedResult = refineThinLineSamples({ ...protectedFrame, protectedCells });
  assert.equal(protectedResult.lineCount, 0, 'a fully protected stroke is not rewritten');
  assert.deepEqual(protectedResult.rgb, protectedFrame.rgb);

  const curve = makeFrame();
  const curvePoints = Array.from({ length: 11 }, (_, offset) => {
    const x = 5 + offset;
    const y = offset < 3 ? 4 : offset < 8 ? 4 + (offset - 2) : 9 - (offset - 7);
    return [x, y];
  });
  paintRidge(curve, curvePoints);
  const curveResult = refineThinLineSamples(curve);
  assert.equal(curveResult.lineCount, 0);
  assert.deepEqual(curveResult.rgb, curve.rgb);
});

test('leaves caller arrays unchanged and rejects malformed buffers', () => {
  const frame = makeFrame();
  paintRidge(frame, horizontalPoints());
  const snapshots = [frame.rgb.slice(), frame.coverageRgb.slice(), frame.objects.slice()];
  refineThinLineSamples(frame);
  assert.deepEqual(frame.rgb, snapshots[0]);
  assert.deepEqual(frame.coverageRgb, snapshots[1]);
  assert.deepEqual(frame.objects, snapshots[2]);
  assert.throws(() => refineThinLineSamples({ ...frame, width: 0 }), RangeError);
  assert.throws(() => refineThinLineSamples({ ...frame, objects: new Uint8Array(frame.objects) }), /RGB and objects/);
  assert.throws(() => refineThinLineSamples({ ...frame, protectedCells: new Uint8Array(1) }), /protected cells/);
});

test('holds a quantized line weight across 0.375, then releases after meaningful coverage change', () => {
  const points = horizontalPoints();
  const firstFrame = makeFrame();
  paintThinLine(firstFrame, points, [30, 40, 50], 0.37);
  const first = refineThinLineSamples(firstFrame);
  assert.equal(first.state.lines.size, 1);
  const p = (6 * firstFrame.width + 10) * 3;
  const low = [...first.rgb.slice(p, p + 3)];

  const nearFrame = makeFrame();
  paintThinLine(nearFrame, points, [30, 40, 50], 0.38);
  const held = refineThinLineSamples({ ...nearFrame, previous: first.state });
  assert.deepEqual([...held.rgb.slice(p, p + 3)], low, 'small coverage change holds the previous quantized tone');

  const changedFrame = makeFrame();
  paintThinLine(changedFrame, points, [30, 40, 50], 0.48);
  const released = refineThinLineSamples({ ...changedFrame, previous: held.state });
  assert.deepEqual([...released.rgb.slice(p, p + 3)], [115, 120, 125], 'larger change selects the next quarter step');
});

test('anchors a threshold-10 stroke against independent plus/minus-two RGB noise', () => {
  const baselineFrame = thresholdLine();
  const baseline = refineThinLineSamples(baselineFrame);
  assert.equal(baseline.lineCount, 1);

  const noisyFrame = thresholdLine({ background: 98, line: 92 });
  const unanchored = refineThinLineSamples(noisyFrame);
  assert.equal(unanchored.lineCount, 0, 'the unanchored noisy contrast falls below detection threshold');

  const anchored = refineThinLineSamples({ ...noisyFrame, previous: baseline.state });
  assert.deepEqual(anchored.lineCells, baseline.lineCells, 'line candidate geometry stays byte-identical');
  for (let cell = 0; cell < baseline.lineCells.length; cell++) if (baseline.lineCells[cell]) {
    const p = cell * 3;
    assert.deepEqual([...anchored.rgb.slice(p, p + 3)], [...baseline.rgb.slice(p, p + 3)], `line RGB at ${cell}`);
  }
});

test('releases line anchors after cumulative source change or a moved line', () => {
  const baseline = refineThinLineSamples(thresholdLine());
  const changedFrame = thresholdLine({ background: 100, line: 95 });
  const changed = refineThinLineSamples({ ...changedFrame, previous: baseline.state });
  assert.equal(changed.lineCount, 0, 'more than four source levels of accumulated change releases the old stroke');
  assert.equal(changed.lineCells.reduce((sum, value) => sum + value, 0), 0);

  const movedFrame = thresholdLine({ points: horizontalPoints(6, 16) });
  const moved = refineThinLineSamples({ ...movedFrame, previous: baseline.state });
  assert.equal(moved.lineCount, 1);
  assert.equal(moved.lineCells[6 * movedFrame.width + 5], 0, 'old endpoint is not carried as a ghost');
  assert.equal(moved.lineCells[6 * movedFrame.width + 16], 1, 'new endpoint is recognized immediately');
});
