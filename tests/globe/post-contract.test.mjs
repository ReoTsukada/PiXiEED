import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupCell } from '../../js/globe/geometry.mjs';
import { buildGlobePostPayload } from '../../js/globe/post-supabase.mjs';
import { fitPixelImage, PIXEL_LIMITS } from '../../js/globe/post-image.mjs';

test('hand-authored posts allow up to 512px per side and 128 colours', () => {
  assert.equal(PIXEL_LIMITS.maxSize, 512);
  assert.equal(PIXEL_LIMITS.maxColors, 128);
});

test('portrait and landscape posts fit the viewer without losing their aspect ratio', () => {
  assert.deepEqual(fitPixelImage(16, 32, 176, 176), { width: 80, height: 160 });
  assert.deepEqual(fitPixelImage(512, 256, 176, 176), { width: 176, height: 88 });
  assert.deepEqual(fitPixelImage(256, 512, 176, 176), { width: 88, height: 176 });
  assert.throws(() => fitPixelImage(0, 16, 176, 176), /サイズ/);
});

test('globe posting sends the stable cell identity and no exact coordinates', () => {
  const cell = lookupCell(139.69, 35.68);
  const payload = buildGlobePostPayload({
    title: '東京の絵', caption: 'セルだけを公開',
    postKind: 'pixel_camera',
    image: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', size: 3, width: 8, height: 8, colorCount: 2 },
    pin: { cellId: cell.id, latitude: 35.68, longitude: 139.69 }
  });
  assert.deepEqual(payload.location.globeCell, { id: cell.id, version: cell.version, band: cell.band, column: cell.column });
  assert.equal('latitude' in payload.location, false);
  assert.equal('longitude' in payload.location, false);
  assert.equal(payload.image.base64, 'AQID');
  assert.equal(payload.postKind, 'pixel_camera');
});

test('older works remain hand-authored when the source field is absent', () => {
  const cell = lookupCell(139.69, 35.68);
  const payload = buildGlobePostPayload({ title: '絵', caption: '', image: {}, pin: { cellId: cell.id } });
  assert.equal(payload.postKind, 'pixel_art');
});

test('invalid globe cell ids fail closed before transmission', () => {
  assert.throws(() => buildGlobePostPayload({ title: 'x', caption: '', image: {}, pin: { cellId: 'globe:wrong:0:0' } }), /another grid version|Invalid globe cell id/);
});
