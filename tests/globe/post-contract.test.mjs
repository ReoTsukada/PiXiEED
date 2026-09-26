import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCell } from '../../js/globe/geometry.mjs';
import { buildGlobePostPayload } from '../../js/globe/post-supabase.mjs';

test('globe posting sends the stable cell identity and no exact coordinates', () => {
  const cell = lookupCell(139.69, 35.68);
  const payload = buildGlobePostPayload({
    title: '東京の絵', caption: 'セルだけを公開',
    image: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', size: 3, width: 8, height: 8, colorCount: 2 },
    pin: { cellId: cell.id, latitude: 35.68, longitude: 139.69 }
  });
  assert.deepEqual(payload.location.globeCell, { id: cell.id, version: cell.version, band: cell.band, column: cell.column });
  assert.equal('latitude' in payload.location, false);
  assert.equal('longitude' in payload.location, false);
  assert.equal(payload.image.base64, 'AQID');
});

test('invalid globe cell ids fail closed before transmission', () => {
  assert.throws(() => buildGlobePostPayload({ title: 'x', caption: '', image: {}, pin: { cellId: 'globe:wrong:0:0' } }), /another grid version|Invalid globe cell id/);
});
