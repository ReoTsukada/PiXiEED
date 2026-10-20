import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeOutput } from '../../js/creation/output-encoders.mjs';

const frame = { width: 16, height: 12, delayMs: 80, data: Uint8Array.from(Array.from({ length: 192 }, () => [240, 60, 30, 255]).flat()) };
test('one-frame and animated GIF conversion preserve requested pixel dimensions', async () => {
  for (const frames of [[frame], [frame, { ...frame, delayMs: 160 }]]) {
    const blob = await encodeOutput({ format: 'gif', frames });
    const bytes = new DataView(await blob.arrayBuffer());
    assert.equal(blob.type, 'image/gif');
    assert.equal(bytes.getUint16(6, true), 16);
    assert.equal(bytes.getUint16(8, true), 12);
  }
});
test('GIF partial alpha requires explicit background compositing and never changes source pixels', async () => {
  const semi = { ...frame, data: frame.data.slice() }; semi.data[3] = 128;
  await assert.rejects(encodeOutput({ format: 'gif', frames: [semi] }), /半透明/);
  const blob = await encodeOutput({ format: 'gif', frames: [semi], gifBackground: '#ffffff' });
  assert.equal(blob.type, 'image/gif');
  assert.equal(semi.data[3], 128);
});
test('WebP uses the requested MIME and quality and rejects silent PNG fallback', async () => {
  await assert.rejects(encodeOutput({ format: 'webp', frames: [frame] }, {
    encodeRaster: async () => new Blob(['not WebP'], { type: 'image/png' })
  }), /代替出力/);
  const bytes = Uint8Array.from([82, 73, 70, 70, 12, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 0, 0, 0, 0]);
  let received;
  const blob = await encodeOutput({ format: 'webp', frames: [frame], quality: 0.75 }, {
    encodeRaster: async (value, mime, quality) => { received = { value, mime, quality }; return new Blob([bytes], { type: mime }); }
  });
  assert.equal(blob.type, 'image/webp');
  assert.equal(received.mime, 'image/webp'); assert.equal(received.quality, 0.75);
  assert.equal(received.value, frame);
  await assert.rejects(encodeOutput({ format: 'webp', frames: [frame], quality: 2 }), /50〜100%/);
});
