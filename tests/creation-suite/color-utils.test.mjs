import test from 'node:test';
import assert from 'node:assert/strict';
import { hexToHsl, hslToHex } from '../../js/creation/color-utils.mjs';

test('shared color utilities round-trip representative vivid and neutral colors', () => {
  for (const color of ['#ff0000', '#34a9d3', '#ffffff', '#000000', '#777777']) {
    const { h, s, l } = hexToHsl(color);
    const roundTrip = hslToHex(h, s, l);
    for (const offset of [1, 3, 5]) {
      assert.ok(Math.abs(Number.parseInt(roundTrip.slice(offset, offset + 2), 16) - Number.parseInt(color.slice(offset, offset + 2), 16)) <= 3);
    }
  }
});

test('neutral colors retain the caller hue so saturation can be raised without losing hue', () => {
  assert.deepEqual(hexToHsl('#777777', 214), { h: 214, s: 0, l: 47 });
  assert.equal(hslToHex(hexToHsl('#777777', 214).h, 70, 47), '#246dcc');
});

test('HSL conversion normalizes hue and clamps saturation and lightness', () => {
  assert.equal(hslToHex(-60, 120, -10), '#000000');
  assert.equal(hslToHex(420, 120, 110), '#ffffff');
});

test('shared color utilities reject unsupported values', () => {
  assert.throws(() => hexToHsl('red'), /色を読み取れません/);
  assert.throws(() => hslToHex(NaN, 50, 50), /色の調整値/);
});
