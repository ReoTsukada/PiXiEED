import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveRegionMergeTracker } from '../../js/pixel-lens/live-region-merge.mjs';

const palette = [[24, 32, 48], [48, 82, 128], [232, 225, 205], [74, 76, 80]];
function frame(width, height, pixel) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set([...pixel(x, y), 255], (y * width + x) * 4);
  return { width, height, data };
}
function quantized(source) {
  const data = new Uint8ClampedArray(source.data.length);
  for (let i = 0; i < data.length; i += 4) {
    let best = palette[0]; let distance = Infinity;
    for (const color of palette) { const d = (source.data[i] - color[0]) ** 2 + (source.data[i + 1] - color[1]) ** 2 + (source.data[i + 2] - color[2]) ** 2; if (d < distance) { best = color; distance = d; } }
    data.set([...best, source.data[i + 3]], i);
  }
  return { width: source.width, height: source.height, data };
}
function shift(source, dx, dy, fill = [24, 32, 48]) {
  return frame(source.width, source.height, (x, y) => {
    const sx = x - dx; const sy = y - dy;
    if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) return fill;
    const i = (sy * source.width + sx) * 4; return [...source.data.subarray(i, i + 3)];
  });
}
function brighten(source, amount) {
  const data = new Uint8ClampedArray(source.data.length);
  for (let i = 0; i < data.length; i += 4) { data[i] = source.data[i] + amount; data[i + 1] = source.data[i + 1] + amount; data[i + 2] = source.data[i + 2] + amount; data[i + 3] = source.data[i + 3]; }
  return { width: source.width, height: source.height, data };
}
function city(width = 64, height = 48, { flat = false, offset = 0 } = {}) {
  return frame(width, height, (x, y) => {
    const sceneX = x + offset;
    if (sceneX >= 46 || y >= 39) return [26 + (sceneX % 4), 31 + (y % 3), 45 + (sceneX % 3)];
    if (sceneX >= 36 && y >= 29) return [52, 55, 78]; // a nearby roof edge
    if (flat) return [48 + Math.floor(y / 12), 82 + Math.floor(y / 12), 128 + Math.floor(y / 12)];
    const light = Math.floor(y / 5);
    const texture = ((sceneX * 7 + y * 11) % 13 === 0) ? 12 : 0;
    if (sceneX === 12 && y === 12) return [236, 228, 208]; // star
    if (sceneX === 23 && y === 19) return [225, 222, 210];
    return [42 + light + texture, 76 + light + texture, 122 + light + texture];
  });
}
const rgbAt = (img, x, y) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];

test('disabled updates stay raw while tracking seed and mask, then surface follows cumulative low-texture motion', () => {
  const width = 128; const height = 64;
  // Low-texture blue surface ends at a dark vertical roof; a second blue patch sits far away.
  const base = frame(width, height, (x, y) => {
    if (x >= 62) return [25, 31, 46];
    const shade = Math.floor(y / 24);
    if (x >= 52 && y > 30) return [51, 55, 77];
    return [48 + shade, 82 + shade, 128 + shade];
  });
  for (let y = 12; y < 52; y += 1) for (let x = 91; x < 114; x += 1) base.data.set([48, 82, 128, 255], (y * width + x) * 4);
  const initialRendered = quantized(base);
  const tracker = createLiveRegionMergeTracker({ source: base, rendered: initialRendered, palette, seed: { x: 38, y: 20 }, sourceIndex: 1, strength: 60 });
  const targetColor = palette[3]; let lastSeed = { x: 38, y: 20 }; let cumulative = null;
  for (let step = 1; step <= 34; step += 1) {
    const current = frame(width, height, (x, y) => {
      const worldX = x + step;
      if (worldX >= 62) return [25, 31, 46];
      if (worldX >= 52 && y > 30) return [51, 55, 77];
      const shade = Math.floor(y / 24); return [48 + shade, 82 + shade, 128 + shade];
    });
    for (let y = 12; y < 52; y += 1) for (let x = 91 - step; x < 114 - step; x += 1) if (x >= 0) current.data.set([48, 82, 128, 255], (y * width + x) * 4);
    const raw = quantized(current); const before = new Uint8ClampedArray(raw.data);
    cumulative = tracker.update({ source: current, rendered: raw, palette, targetColor, enabled: step > 4, mode: 'surface', strength: 60 });
    assert.equal(cumulative.status, 'tracking', `frame ${step}`);
    assert.ok(cumulative.seed.x <= lastSeed.x, `seed should follow leftward camera drift at frame ${step}`);
    assert.ok(cumulative.mask[cumulative.seed.y * width + cumulative.seed.x]);
    if (step <= 4) assert.deepEqual(cumulative.data, before, 'disabled target selection returns raw live pixels');
    lastSeed = cumulative.seed;
  }
  assert.ok(lastSeed.x <= 14, `cumulative camera motion follows the moving surface to its edge; seed=${lastSeed.x}`);
  assert.ok(cumulative.changedPixels > 0);
});

test('a low-texture unclipped surface keeps its original relative seed position over cumulative motion', () => {
  const width = 128; const height = 96;
  const plate = (left) => frame(width, height, (x, y) => x >= left && x < left + 30 && y >= 28 && y < 52 ? [48, 82, 128] : [24, 32, 48]);
  const initial = plate(34); const initialRendered = quantized(initial);
  const tracker = createLiveRegionMergeTracker({ source: initial, rendered: initialRendered, palette, seed: { x: 49, y: 40 }, sourceIndex: 1, strength: 55 });
  let result;
  for (let step = 1; step <= 20; step += 1) {
    const source = plate(34 + step); const rendered = quantized(source);
    result = tracker.update({ source, rendered, palette, targetColor: palette[3], enabled: true, strength: 55 });
    assert.equal(result.status, 'tracking', `frame ${step}`);
    assert.ok(result.mask[result.seed.y * width + result.seed.x], `seed remains in the connected plate at frame ${step}`);
  }
  assert.ok(Math.abs(result.seed.x - 69) <= 2, `seed stays near its original relative position after translation; x=${result.seed.x}`);
});

test('textured region follows a small translation, protects star/building edges, and keeps inputs immutable', () => {
  const initial = city(); const rendered = quantized(initial); const sourceCopy = new Uint8ClampedArray(initial.data); const renderedCopy = new Uint8ClampedArray(rendered.data);
  const tracker = createLiveRegionMergeTracker({ source: initial, rendered, palette, seed: { x: 18, y: 18 }, sourceIndex: 1, strength: 55 });
  const moved = shift(initial, -2, 1); const movedRendered = quantized(moved); const before = new Uint8ClampedArray(movedRendered.data);
  const result = tracker.update({ source: moved, rendered: movedRendered, palette, targetColor: palette[3], enabled: true, mode: 'surface', strength: 55 });
  assert.equal(result.status, 'tracking'); assert.ok(Math.abs(result.seed.x - 16) <= 1); assert.ok(Math.abs(result.seed.y - 19) <= 2, `tracked seed y=${result.seed.y}`);
  assert.deepEqual(rgbAt({ ...movedRendered, data: result.data }, 12, 13), rgbAt({ ...movedRendered, data: before }, 12, 13), 'star remains untouched');
  assert.deepEqual(rgbAt({ ...movedRendered, data: result.data }, 55, 36), rgbAt({ ...movedRendered, data: before }, 55, 36), 'roof/building edge remains outside');
  assert.ok(result.changedPixels > 0); assert.deepEqual(initial.data, sourceCopy); assert.deepEqual(rendered.data, renderedCopy); assert.deepEqual(moved.data, shift(initial, -2, 1).data);
});

test('small exposure change tracks but accumulated brightness drift eventually loses the original seed', () => {
  const initial = city(); const rendered = quantized(initial);
  const tracker = createLiveRegionMergeTracker({ source: initial, rendered, palette, seed: { x: 18, y: 18 }, sourceIndex: 1 });
  const mild = brighten(initial, 6); const mildResult = tracker.update({ source: mild, rendered: quantized(mild), palette, targetColor: palette[3], enabled: true });
  assert.equal(mildResult.status, 'tracking');
  let terminal; let terminalRaw;
  for (let step = 1; step <= 30; step += 1) {
    const frameNow = brighten(initial, step * 5);
    terminalRaw = quantized(frameNow);
    terminal = tracker.update({ source: frameNow, rendered: terminalRaw, palette, targetColor: palette[3], enabled: true });
    if (terminal.status !== 'tracking') break;
  }
  assert.ok(terminal.status === 'lost' || terminal.status === 'scene-changed', 'drifting references cannot walk into another scene');
  assert.equal(terminal.changedPixels, 0); assert.deepEqual(terminal.data, terminalRaw.data);
});

test('occlusion loses tracking and returns the current raw frame', () => {
  const initial = city(); const tracker = createLiveRegionMergeTracker({ source: initial, rendered: quantized(initial), palette, seed: { x: 18, y: 18 }, sourceIndex: 1 });
  const occluded = frame(initial.width, initial.height, (x, y) => x >= 10 && x <= 26 && y >= 10 && y <= 27 ? [220, 40, 30] : rgbAt(initial, x, y));
  const raw = quantized(occluded); const result = tracker.update({ source: occluded, rendered: raw, palette, targetColor: palette[3], enabled: true });
  assert.equal(result.status, 'lost'); assert.deepEqual(result.data, raw.data); assert.equal(result.changedPixels, 0);
});

test('a spatial hard cut with the same mean RGB closes as scene-changed', () => {
  const width = 64; const height = 48;
  const first = frame(width, height, (x) => x < width / 2 ? [30, 50, 90] : [180, 150, 110]);
  const swapped = frame(width, height, (x) => x < width / 2 ? [180, 150, 110] : [30, 50, 90]);
  const tracker = createLiveRegionMergeTracker({ source: first, rendered: quantized(first), palette, seed: { x: 12, y: 20 }, sourceIndex: 1 });
  const raw = quantized(swapped); const result = tracker.update({ source: swapped, rendered: raw, palette, targetColor: palette[3], enabled: true });
  assert.equal(result.status, 'scene-changed'); assert.deepEqual(result.data, raw.data);
});

test('strength changes on the same source re-segment without failing shape checks; target follows RGB after palette reorder', () => {
  const initial = frame(32, 24, (_x, y) => y < 12 ? [48, 82, 128] : [64, 98, 144]); const rendered = quantized(initial);
  const tracker = createLiveRegionMergeTracker({ source: initial, rendered, palette, seed: { x: 16, y: 8 }, sourceIndex: 1, strength: 15 });
  const targetColor = palette[3];
  const low = tracker.update({ source: initial, rendered, palette, targetColor, enabled: true, strength: 15 });
  const reordered = [...palette].reverse(); const reorderedRendered = frame(32, 24, (x, y) => rgbAt(rendered, x, y));
  // Keep the rendered baseline intact while the current palette order changes.
  const high = tracker.update({ source: initial, rendered: reorderedRendered, palette: reordered, targetColor, enabled: true, strength: 100 });
  assert.equal(high.status, 'tracking'); assert.ok(high.selectedPixels >= low.selectedPixels, 'strength may expand the same-frame surface');
  assert.equal(high.targetIndex, reordered.findIndex((color) => color.join(',') === targetColor.join(',')));
  for (let i = 0; i < high.data.length; i += 4) assert.ok(reordered.some((color) => color[0] === high.data[i] && color[1] === high.data[i + 1] && color[2] === high.data[i + 2]));
});

test('frame-size change returns raw data with scene-changed', () => {
  const initial = city(); const tracker = createLiveRegionMergeTracker({ source: initial, rendered: quantized(initial), palette, seed: { x: 18, y: 18 }, sourceIndex: 1 });
  const resized = frame(80, 60, () => [60, 80, 120]); const raw = quantized(resized);
  const result = tracker.update({ source: resized, rendered: raw, palette, targetColor: palette[3], enabled: true });
  assert.equal(result.status, 'scene-changed'); assert.deepEqual(result.data, raw.data); assert.equal(result.mask.length, 80 * 60);
});

test('disabled tracking survives a vanished target and reselects a new current-palette target', () => {
  const initialPalette = [...palette, [255, 0, 255]];
  const initial = frame(24, 18, () => [48, 82, 128]); const rendered = quantized(initial);
  const tracker = createLiveRegionMergeTracker({ source: initial, rendered, palette: initialPalette, seed: { x: 12, y: 9 }, sourceIndex: 1 });
  const selected = tracker.update({ source: initial, rendered, palette: initialPalette, targetColor: [255, 0, 255], enabled: true });
  assert.equal(selected.status, 'tracking'); assert.ok(selected.changedPixels > 0);
  const disabled = tracker.update({ source: initial, rendered, palette, targetColor: null, enabled: false });
  assert.equal(disabled.status, 'tracking'); assert.equal(disabled.changedPixels, 0); assert.deepEqual(disabled.data, rendered.data);
  const newTarget = tracker.update({ source: initial, rendered, palette, targetColor: palette[2], enabled: true });
  assert.equal(newTarget.status, 'tracking'); assert.equal(newTarget.targetIndex, 2); assert.ok(newTarget.changedPixels > 0);
  assert.deepEqual(rgbAt({ ...rendered, data: newTarget.data }, 12, 9), palette[2]);
});

test('128 and 256 frames expose total segmentation-inclusive processing time under the fixed work cap', () => {
  for (const size of [128, 256]) {
    const source = frame(size, size, () => [48, 82, 128]); const rendered = quantized(source);
    const tracker = createLiveRegionMergeTracker({ source, rendered, palette, seed: { x: size / 2, y: size / 2 }, sourceIndex: 1 });
    const result = tracker.update({ source, rendered, palette, targetColor: palette[3], enabled: true });
    assert.equal(result.status, 'tracking', `${size} square frame`);
    assert.ok(Number.isFinite(result.processingMs) && result.processingMs > 0 && result.processingMs <= 60, `${size} total ms=${result.processingMs}`);
  }
});
