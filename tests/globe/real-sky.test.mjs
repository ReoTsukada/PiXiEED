import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRealSky, starColor } from '../../js/globe/real-sky.mjs';

const file = readFileSync(new URL('../../assets/sky/real-sky-v1.bin', import.meta.url));
const sky = parseRealSky(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

test('the real sky file holds the catalogue stars and the Milky Way, and stays small', () => {
  assert.ok(file.byteLength < 200 * 1024);
  assert.ok(sky.count > 15000);
  assert.equal(sky.milkyWay.length, 5);
});

test('bright stars sit where they are in the sky', () => {
  const nearest = (ra, dec) => {
    let best = -1; let bestD = Infinity;
    for (let i = 0; i < sky.count; i += 1) { const d = Math.hypot((sky.ra[i] - ra) * Math.cos(dec * Math.PI / 180), sky.dec[i] - dec); if (d < bestD) { bestD = d; best = i; } }
    return { mag: sky.mag[best], d: bestD };
  };
  // Sirius (RA 101.29, Dec -16.72, mag -1.46) and Vega (RA 279.23, Dec 38.78, mag 0.03).
  const sirius = nearest(101.29, -16.72); assert.ok(sirius.d < 0.05 && sirius.mag < -1.2);
  const vega = nearest(279.23, 38.78); assert.ok(vega.d < 0.05 && vega.mag < 0.3);
});

test('star colours follow B-V: blue-white for hot stars, amber for cool ones', () => {
  const hot = starColor(-0.2); const cool = starColor(1.6);
  assert.ok(hot[2] > hot[0]);
  assert.ok(cool[0] > cool[2]);
});
