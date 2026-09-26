import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { WORLD_LAND_MASK } from '../../assets/maps/world-land-mask-v1.mjs';
import { DEFAULT_GRID } from '../../js/globe/geometry.mjs';
import { decodeRasterData, validateRasterData } from '../../js/globe/renderer.mjs';

function unpack(mask) {
  const values = new Uint8Array(mask.width * mask.height);
  let offset = 0;
  for (const [value, length] of mask.runs) {
    values.fill(value, offset, offset + length);
    offset += length;
  }
  return values;
}

test('world land mask is deterministic and complete', () => {
  assert.equal(WORLD_LAND_MASK.version, 'world-land-mask-v1');
  assert.deepEqual([WORLD_LAND_MASK.width, WORLD_LAND_MASK.height, WORLD_LAND_MASK.cellDegrees], [720, 360, 0.5]);
  const values = unpack(WORLD_LAND_MASK);
  assert.equal(values.length, 259200);
  assert.equal(WORLD_LAND_MASK.runs.reduce((sum, run) => sum + run[1], 0), values.length);
  assert.match(WORLD_LAND_MASK.checksum, /^fnv1a32-[0-9a-f]{8}$/);
  assert.ok(values.some((value) => value === 255));
  assert.ok(values.some((value) => value === 0));
});

test('generated cell raster matches the authoritative grid and checksum', () => {
  const source = JSON.parse(readFileSync(new URL('../../assets/maps/globe-land-mask-v1.json', import.meta.url), 'utf8'));
  const decoded = decodeRasterData(source, DEFAULT_GRID);
  const validated = validateRasterData(source, DEFAULT_GRID);
  assert.equal(source.version, 'globe-land-mask-v1');
  assert.equal(source.cellCount, DEFAULT_GRID.bands.reduce((sum, band) => sum + band.longitudeCount, 0));
  assert.equal(decoded.countryIndices.length, source.cellCount);
  assert.equal(decoded.prefectureIndices.length, source.cellCount);
  const countryBytes = Buffer.from(decoded.countryIndices.buffer, decoded.countryIndices.byteOffset, decoded.countryIndices.byteLength);
  const prefectureBytes = Buffer.from(decoded.prefectureIndices.buffer, decoded.prefectureIndices.byteOffset, decoded.prefectureIndices.byteLength);
  const checksum = createHash('sha256').update(countryBytes).update(prefectureBytes).digest('hex');
  assert.equal(source.checksum, `sha256:${checksum}`);
  assert.equal(validated.countryIndices.byteLength, countryBytes.byteLength);
  assert.ok(decoded.countryIndices.some((value) => value > 0));
  assert.ok(decoded.prefectureIndices.some((value) => value > 0));
});
