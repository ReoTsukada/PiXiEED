import test from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_RATIOS, OUTPUT_SIZES, resolveAspect, centerCrop, frameGeometry, fitFrame } from '../../js/pixel-studio/framing.mjs';

test('frame choices and aspect fallback use the preview viewport', () => {
  assert.deepEqual(FRAME_RATIOS.map(({ value }) => value), ['screen', '1:1', '3:4', '9:16', '4:3', '16:9']);
  assert.deepEqual(OUTPUT_SIZES, [64, 128, 256, 512]);
  assert.equal(resolveAspect('screen', 1200, 800), 1.5);
  assert.equal(resolveAspect('unknown', 1200, 800), 1.5);
  assert.equal(resolveAspect('9:16', 1200, 800), 9 / 16);
});

test('center crop is contained, centered, and preserves the requested ratio', () => {
  assert.deepEqual(centerCrop(1600, 900, 1), { sx: 350, sy: 0, sw: 900, sh: 900 });
  assert.deepEqual(centerCrop(900, 1600, 16 / 9), { sx: 0, sy: 546.875, sw: 900, sh: 506.25 });
  for (const [width, height, aspect] of [[1601, 901, 1], [901, 1601, 16 / 9], [1001, 1001, 4 / 3]]) {
    const crop = centerCrop(width, height, aspect);
    assert.ok(crop.sx >= 0 && crop.sy >= 0 && crop.sw > 0 && crop.sh > 0);
    assert.ok(crop.sx + crop.sw <= width + Number.EPSILON * width);
    assert.ok(crop.sy + crop.sh <= height + Number.EPSILON * height);
    assert.ok(Math.abs(crop.sw / crop.sh - aspect) < 1e-12);
    if (crop.sw < width) assert.ok(Math.abs(crop.sx - (width - crop.sw) / 2) < 1e-12);
    if (crop.sh < height) assert.ok(Math.abs(crop.sy - (height - crop.sh) / 2) < 1e-12);
  }
});

test('output geometry uses the selected long edge in both orientations', () => {
  assert.deepEqual(frameGeometry(3 / 4, 256), { width: 192, height: 256 });
  assert.deepEqual(frameGeometry(16 / 9, 512), { width: 512, height: 288 });
  assert.deepEqual(frameGeometry(0.001, 64), { width: 1, height: 64 });
});

test('fitFrame contains and centers the frame with fractional CSS dimensions', () => {
  const fit = fitFrame(16, 9, 701, 503);
  assert.ok(fit.width <= 701 && fit.height <= 503);
  assert.ok(Math.abs(fit.width / fit.height - 16 / 9) < 1e-12);
  assert.ok(Math.abs(fit.left - (701 - fit.width) / 2) < 1e-12);
  assert.ok(Math.abs(fit.top - (503 - fit.height) / 2) < 1e-12);
  assert.ok(!Number.isInteger(fit.width) || !Number.isInteger(fit.height));
});

test('rounded output geometry drives source crop, sampled frame, and display without stretching', () => {
  const requestedAspect = 0.4319;
  const output = frameGeometry(requestedAspect, 256);
  const pixelAspect = output.width / output.height;
  assert.notEqual(pixelAspect, requestedAspect, 'fixture exercises short-edge rounding');

  const crop = centerCrop(1920, 1080, pixelAspect);
  assert.ok(Math.abs(crop.sw / crop.sh - pixelAspect) < 1e-12);
  const samplesPerPixel = Math.max(1, Math.floor(640 / 256));
  const inputWidth = output.width * samplesPerPixel;
  const inputHeight = output.height * samplesPerPixel;
  assert.equal(inputWidth / inputHeight, pixelAspect);

  const fit = fitFrame(inputWidth, inputHeight, 320, 740);
  assert.ok(Math.abs(fit.width / fit.height - inputWidth / inputHeight) < 1e-12);
  assert.ok(fit.width <= 320 && fit.height <= 740);
});

test('a captured frame keeps equal axis scale when the viewport changes orientation', () => {
  for (const [width, height] of [[111, 256], [256, 149], [192, 256]]) {
    for (const [viewportWidth, viewportHeight] of [[320, 568], [505, 962], [740, 390], [1200, 700]]) {
      const fit = fitFrame(width, height, viewportWidth, viewportHeight);
      assert.ok(Math.abs(fit.width / width - fit.height / height) < 1e-12, 'both axes use one scale');
      assert.ok(fit.width <= viewportWidth && fit.height <= viewportHeight, 'the whole captured frame stays visible');
      assert.ok(Math.abs(fit.left * 2 + fit.width - viewportWidth) < 1e-12);
      assert.ok(Math.abs(fit.top * 2 + fit.height - viewportHeight) < 1e-12);
    }
  }
});

test('geometry helpers reject non-finite and non-positive dimensions', () => {
  for (const call of [
    () => resolveAspect('screen', 0, 100), () => resolveAspect('screen', 100, Infinity),
    () => centerCrop(-1, 100, 1), () => centerCrop(100, 100, NaN),
    () => frameGeometry(1, 0), () => frameGeometry(1, 64.5), () => frameGeometry(Infinity, 64),
    () => fitFrame(1, 1, 0, 10), () => fitFrame(1, 1, 10, NaN)
  ]) assert.throws(call, RangeError);
});
