import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraPostPixels } from '../../js/pixel-lens/camera-post.mjs';

test('camera handoff keeps a crisp pixel grid within map image limits', () => {
  const width = 1024; const height = 512;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    data[i] = x < 512 ? 10 : 240;
    data[i + 3] = 255;
  }
  const post = cameraPostPixels({ width, height, data });
  assert.equal(post.width, 256);
  assert.equal(post.height, 128);
  assert.equal(post.data[(10 * 256 + 20) * 4], 10);
  assert.equal(post.data[(10 * 256 + 200) * 4], 240);
});

test('full-colour camera frames stay within the 128-colour map palette limit', () => {
  const width = 128; const height = 128;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = i & 255; data[i * 4 + 1] = (i >> 6) & 255;
    data[i * 4 + 2] = (i >> 3) & 255; data[i * 4 + 3] = 255;
  }
  const post = cameraPostPixels({ width, height, data });
  const colors = new Set();
  for (let i = 0; i < post.data.length; i += 4) colors.add(`${post.data[i]},${post.data[i + 1]},${post.data[i + 2]}`);
  assert.ok(colors.size <= 128);
});

test('a 256px camera image keeps its dimensions and existing small palette', () => {
  const width = 256; const height = 144;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = i % 2 ? 23 : 201;
    data[i * 4 + 3] = 255;
  }
  const post = cameraPostPixels({ width, height, data });
  assert.equal(post.width, width);
  assert.equal(post.height, height);
  assert.equal(post.data[0], 201);
  assert.equal(post.data[4], 23);
});

test('camera output accepts one-pixel sides and keeps odd aspect ratios within 256px', () => {
  for (const [width, height] of [[1, 1], [256, 1], [1, 256], [257, 17], [17, 257]]) {
    const data = new Uint8ClampedArray(width * height * 4);
    data.fill(255);
    const post = cameraPostPixels({ width, height, data });
    assert.ok(post.width >= 1 && post.height >= 1);
    assert.ok(Math.max(post.width, post.height) <= 256);
    if (width <= 256 && height <= 256) assert.deepEqual([post.width, post.height], [width, height]);
  }
});
