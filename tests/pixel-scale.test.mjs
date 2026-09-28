import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPixelScale, downscalePixels, normalizePixels, reductionScale, scaleNotice, wholePixelFit } from '../js/pixel-scale.mjs';

/** A width×height image with a colour per pixel from `color(x, y)`. */
function image(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set(color(x, y), (y * width + x) * 4);
  return { width, height, data };
}
const checker = (x, y) => ((x + y) % 2 ? [255, 255, 255, 255] : [20, 40, 60, 255]);
const art = (x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 71) % 256, (x * y) % 256, 255];
function enlarge(source, scale) {
  return image(source.width * scale, source.height * scale, (x, y) => {
    const i = (Math.floor(y / scale) * source.width + Math.floor(x / scale)) * 4;
    return source.data.slice(i, i + 4);
  });
}

test('a 1x image stays at scale 1', () => {
  assert.equal(detectPixelScale(image(16, 16, checker)), 1);
  assert.equal(detectPixelScale(image(32, 24, art)), 1);
});

test('enlarged pixel art reports its block size', () => {
  const dots = image(16, 12, art);
  for (const scale of [2, 3, 4, 8, 10]) assert.equal(detectPixelScale(enlarge(dots, scale)), scale, `x${scale}`);
});

test('shrinking an enlarged image gives back the original dots', () => {
  const dots = image(20, 14, art);
  const result = normalizePixels(enlarge(dots, 6));
  assert.equal(result.scale, 6); assert.equal(result.width, 20); assert.equal(result.height, 14);
  assert.equal(result.sourceWidth, 120); assert.equal(result.sourceHeight, 84);
  assert.deepEqual([...result.data], [...dots.data]);
});

test('one uneven cell keeps the image at full size', () => {
  const big = enlarge(image(16, 16, art), 4);
  // Paint one pixel inside a block a different colour: blocks are no longer uniform.
  big.data.set([1, 2, 3, 255], (5 * big.width + 6) * 4);
  assert.equal(detectPixelScale(big), 1);
});

test('blocks off the grid (a cropped edge) are not treated as enlarged', () => {
  const big = enlarge(image(16, 16, art), 4);
  const cropped = image(big.width - 1, big.height - 1, (x, y) => big.data.slice(((y + 1) * big.width + x + 1) * 4, ((y + 1) * big.width + x + 1) * 4 + 4));
  assert.equal(detectPixelScale(cropped), 1);
});

test('mixed block sizes settle on their common divisor', () => {
  // 2px and 4px wide stripes on an 8px grid: every change sits on a multiple of 2.
  const stripes = image(16, 16, (x) => (x < 4 ? [0, 0, 0, 255] : x < 6 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
  assert.equal(detectPixelScale(stripes), 2);
});

test('fully transparent pixels match whatever their hidden colour', () => {
  const dots = image(8, 8, (x, y) => (x < 4 ? [0, 0, 0, 0] : art(x, y)));
  const big = enlarge(dots, 3);
  for (let i = 0; i < big.data.length; i += 4) if (big.data[i + 3] === 0) big.data[i] = (i / 4) % 256;
  assert.equal(detectPixelScale(big), 3);
});

test('a flat image is not collapsed below the minimum dot count', () => {
  const flat = image(64, 64, () => [200, 200, 200, 255]);
  assert.equal(detectPixelScale(flat), 64);
  assert.equal(reductionScale(flat, { minDots: 8 }), 8);
  assert.equal(normalizePixels(flat, { minDots: 8 }).width, 8);
  assert.equal(reductionScale(image(12, 12, () => [1, 1, 1, 255]), { minDots: 8 }), 1);
});

test('downscale at 1 returns the same pixels', () => {
  const dots = image(4, 4, art);
  assert.equal(downscalePixels(dots, 1).data, dots.data);
});

test('notice only when something shrank', () => {
  assert.equal(scaleNotice({ scale: 1, width: 16, height: 16 }), '');
  assert.match(scaleNotice({ scale: 4, width: 32, height: 24 }), /4倍.*32×24px/);
});

test('whole-pixel fit uses whole device pixels per dot', () => {
  assert.deepEqual(wholePixelFit(32, 32, 300, 500, { devicePixelRatio: 1 }), { width: 288, height: 288, perDot: 9 });
  const retina = wholePixelFit(32, 16, 300, 500, { devicePixelRatio: 3 });
  assert.equal(retina.perDot, 28); assert.equal(retina.width * 3, 32 * 28);
  const tooBig = wholePixelFit(1000, 500, 300, 300, { devicePixelRatio: 1 });
  assert.equal(tooBig.perDot, 0); assert.equal(tooBig.width, 300);
});
