import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPalette, encodeGif, gifScale, medianCut, collectColors } from '../../js/pixel-lens/gif.mjs';

const frame = (w, h, fill) => { const data = new Uint8ClampedArray(w * h * 4); for (let p = 0; p < w * h; p++) { const [r, g, b] = fill(p % w, (p / w) | 0); data.set([r, g, b, 255], p * 4); } return { width: w, height: h, data }; };

test('looks with 256 colours or fewer keep their exact palette', () => {
  const f = frame(8, 8, (x, y) => ((x + y) & 1 ? [224, 248, 208] : [32, 56, 16]));
  assert.deepEqual(new Set(buildPalette([f])), new Set([0xe0f8d0, 0x203810]));
});

test('full colour is reduced to at most 256 colours by median cut', () => {
  const f = frame(64, 64, (x, y) => [x * 4, y * 4, (x * y) & 255]);
  const palette = medianCut(collectColors([f]), 256);
  assert.ok(palette.length <= 256 && palette.length > 200);
});

test('GIF has the header, looping block, one image per frame and the trailer', () => {
  const frames = [0, 1, 2].map((t) => frame(10, 6, (x) => (x + t) % 3 === 0 ? [255, 0, 0] : [0, 0, 255]));
  const bytes = encodeGif(frames, { scale: 3 });
  assert.equal(String.fromCharCode(...bytes.slice(0, 6)), 'GIF89a');
  assert.equal(bytes[6] | (bytes[7] << 8), 30);
  assert.equal(bytes[8] | (bytes[9] << 8), 18);
  assert.ok(String.fromCharCode(...bytes).includes('NETSCAPE2.0'));
  assert.equal([...bytes].filter((b, i) => b === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4).length, 3);
  assert.equal(bytes[bytes.length - 1], 0x3b);
});

test('GIF scale keeps dots sharp at about 512px', () => {
  assert.equal(gifScale(256, 192), 2);
  assert.equal(gifScale(64, 64), 8);
  assert.equal(gifScale(600, 400), 1);
});
