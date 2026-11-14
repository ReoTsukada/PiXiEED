import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PIXEL_ART_LIMITS,
  PIXEL_SYMBOLS,
  decodePixelArt,
  encodePixelArt,
  normalizePixelArt,
  pixelArtToRgba,
  toDrawDocument
} from '../../js/mcp/pixel-art-contract.mjs';

function base64url(text) {
  return Buffer.from(text, 'utf8').toString('base64url');
}

test('normalizes input into an independent copy and roundtrips a Japanese title', () => {
  const source = { title: '春の絵 🌸', width: 3, height: 2, palette: ['#ff0000', '#00aBcD'], rows: ['0.1', '110'] };
  const normalized = normalizePixelArt(source);
  assert.deepEqual(normalized, { ...source, palette: ['#FF0000', '#00ABCD'], rows: [...source.rows] });
  normalized.palette[0] = '#000000';
  normalized.rows[0] = '...';
  assert.deepEqual(source.palette, ['#ff0000', '#00aBcD']);
  assert.deepEqual(source.rows, ['0.1', '110']);
  assert.deepEqual(decodePixelArt(encodePixelArt(source)), normalizePixelArt(source));
});

test('supports 32 colors, 64 by 64 boundaries, transparent pixels, and exact conversions', () => {
  const palette = Array.from({ length: 32 }, (_, index) => `#${index.toString(16).padStart(6, '0')}`);
  const row = PIXEL_SYMBOLS;
  const input = { width: 64, height: 64, palette, rows: [row + '.'.repeat(32), ...Array(63).fill('.'.repeat(64))] };
  const normalized = normalizePixelArt(input);
  assert.equal(normalized.palette.length, PIXEL_ART_LIMITS.maxPalette);
  assert.equal(normalized.width, 64);
  assert.equal(normalized.height, 64);
  assert.deepEqual(decodePixelArt(encodePixelArt(input)), normalized);

  const doc = toDrawDocument({ width: 3, height: 1, palette: ['#112233', '#AABBCC'], rows: ['0.1'] });
  assert.deepEqual(doc, { schemaVersion: 1, width: 3, height: 1, palette: ['#112233', '#AABBCC'], pixels: [0, -1, 1] });
  const rgba = pixelArtToRgba({ width: 3, height: 1, palette: ['#112233', '#AABBCC'], rows: ['0.1'] });
  assert.ok(rgba.data instanceof Uint8ClampedArray);
  assert.deepEqual([...rgba.data], [17, 34, 51, 255, 0, 0, 0, 0, 170, 187, 204, 255]);
});

test('applies the default title and rejects invalid dimensions, shape, colors, rows, and transparent art', () => {
  assert.equal(normalizePixelArt({ width: 1, height: 1, palette: ['#000000'], rows: ['0'] }).title, 'AIで作ったドット絵');
  const invalid = [
    { width: 0, height: 1, palette: ['#000000'], rows: ['0'] },
    { width: 65, height: 1, palette: ['#000000'], rows: ['0'] },
    { width: 1, height: 1, palette: [], rows: ['0'] },
    { width: 1, height: 1, palette: ['#000000'], rows: ['1'] },
    { width: 1, height: 1, palette: ['#000000'], rows: ['?'] },
    { width: 1, height: 1, palette: ['#000000'], rows: ['.'] },
    { width: 2, height: 1, palette: ['#000000'], rows: ['0'] },
    { width: 1, height: 1, palette: ['#000000'], rows: ['00'] }
  ];
  for (const input of invalid) assert.throws(() => normalizePixelArt(input));
});

test('rejects unknown keys and invalid title characters or length', () => {
  assert.throws(() => normalizePixelArt({ width: 1, height: 1, palette: ['#000000'], rows: ['0'], extra: true }), /未対応/);
  assert.throws(() => normalizePixelArt({ title: 'bad\nname', width: 1, height: 1, palette: ['#000000'], rows: ['0'] }), /作品名/);
  assert.throws(() => normalizePixelArt({ title: 'あ'.repeat(81), width: 1, height: 1, palette: ['#000000'], rows: ['0'] }), /作品名/);
});

test('strictly rejects malformed base64url, invalid UTF-8, unsupported versions, and oversized tokens', () => {
  assert.throws(() => decodePixelArt('a'), /保存データ/);
  assert.throws(() => decodePixelArt('***'), /保存データ/);
  assert.throws(() => decodePixelArt('_w'), /保存データ/);
  assert.throws(() => decodePixelArt('A'.repeat(PIXEL_ART_LIMITS.maxTokenLength + 1)), /10000文字/);
  assert.throws(() => decodePixelArt(base64url(JSON.stringify({ v: 2, width: 1, height: 1, palette: ['#000000'], rows: ['0'] }))), /バージョン/);
});
