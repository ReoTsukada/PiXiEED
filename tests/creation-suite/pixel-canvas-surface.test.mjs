import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelCanvasSurface } from '../../js/creation/pixel-canvas-surface.mjs';

test('shared pixel surface paints adjacent cells as opaque color without a grid gap', () => {
  const calls = [];
  const context = {
    createImageData(width, height) { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; },
    putImageData(image, x, y, dirtyX, dirtyY, dirtyWidth, dirtyHeight) {
      calls.push({ data: [...image.data], rect: [dirtyX, dirtyY, dirtyWidth, dirtyHeight] });
    }
  };
  const canvas = { width: 2, height: 2, getContext() { return context; } };
  const surface = createPixelCanvasSurface(canvas, { alpha: false, emptyColor: '#ffffff' });
  surface.paint([0, 1, -1, 0], ['#ff0000', '#0000ff']);
  assert.deepEqual(calls[0].data, [255, 0, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255, 255, 0, 0, 255]);
  assert.deepEqual(calls[0].rect, [0, 0, 2, 2]);
  surface.paint([0, 1, 1, 0], ['#ff0000', '#0000ff'], [2]);
  assert.deepEqual(calls[1].rect, [0, 1, 1, 1]);
  assert.deepEqual(calls[1].data.slice(8, 12), [0, 0, 255, 255]);
});
