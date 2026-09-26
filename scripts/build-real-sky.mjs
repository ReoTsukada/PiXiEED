/**
 * Build assets/sky/real-sky-v1.bin from the d3-celestial data files
 * (https://github.com/ofrohn/d3-celestial, BSD-3-Clause, © Olaf Frohn; stars from the Hipparcos catalogue).
 *
 *   npm pack d3-celestial && tar xzf d3-celestial-*.tgz
 *   node scripts/build-real-sky.mjs package/data
 *
 * Layout (little endian):
 *   "SKY1" u32 starCount, then per star: u16 ra (0..65535 = 0..360°), i16 dec (±90° = ±32767),
 *   u8 magnitude ((mag + 2) * 25), u8 colour index ((bv + 0.5) * 80).
 *   u32 levelCount, per level: u32 ringCount, per ring: u32 pointCount, points as u16 ra, i16 dec.
 * Milky Way rings are simplified to about 0.25 degrees.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/build-real-sky.mjs <d3-celestial data dir>'); process.exit(1); }
const LIMIT = 7.2;
const stars = JSON.parse(readFileSync(resolve(dir, 'stars.8.json'), 'utf8')).features
  .filter((f) => f.properties.mag <= LIMIT)
  .sort((a, b) => a.properties.mag - b.properties.mag);
const mw = JSON.parse(readFileSync(resolve(dir, 'mw.json'), 'utf8')).features;

const encodeRa = (lon) => Math.round((((lon % 360) + 360) % 360) / 360 * 65535);
const encodeDec = (lat) => Math.round(Math.max(-90, Math.min(90, lat)) / 90 * 32767);
const chunks = [];
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); chunks.push(b); };

chunks.push(Buffer.from('SKY1'));
u32(stars.length);
const starBuf = Buffer.alloc(stars.length * 6);
stars.forEach((f, i) => {
  const [lon, lat] = f.geometry.coordinates;
  const bv = Number.parseFloat(f.properties.bv);
  starBuf.writeUInt16LE(encodeRa(lon), i * 6);
  starBuf.writeInt16LE(encodeDec(lat), i * 6 + 2);
  starBuf.writeUInt8(Math.max(0, Math.min(255, Math.round((f.properties.mag + 2) * 25))), i * 6 + 4);
  starBuf.writeUInt8(Math.max(0, Math.min(255, Math.round(((Number.isFinite(bv) ? bv : 0.6) + 0.5) * 80))), i * 6 + 5);
});
chunks.push(starBuf);

function simplify(ring, step = 0.25) {
  const out = [ring[0]];
  for (const point of ring.slice(1)) {
    const last = out[out.length - 1];
    let dx = Math.abs(point[0] - last[0]); if (dx > 180) dx = 360 - dx;
    if (Math.hypot(dx * Math.cos(point[1] * Math.PI / 180), point[1] - last[1]) >= step) out.push(point);
  }
  return out.length >= 3 ? out : null;
}
u32(mw.length);
let points = 0;
for (const feature of mw) {
  const rings = feature.geometry.coordinates.flat().map((ring) => simplify(ring)).filter(Boolean);
  u32(rings.length);
  for (const ring of rings) {
    u32(ring.length); points += ring.length;
    const b = Buffer.alloc(ring.length * 4);
    ring.forEach(([lon, lat], i) => { b.writeUInt16LE(encodeRa(lon), i * 4); b.writeInt16LE(encodeDec(lat), i * 4 + 2); });
    chunks.push(b);
  }
}
const out = Buffer.concat(chunks);
writeFileSync(resolve('assets/sky/real-sky-v1.bin'), out);
console.log(`${stars.length} stars (mag <= ${LIMIT}), ${points} Milky Way points, ${out.length} bytes`);
