import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { beginAudioCamera, readAudioCameraRequest, audioCameraCancelUrl, completeAudioCamera, takeAudioCameraReturn } from '../../js/creation/audio-camera-handoff.mjs';
import { documentRgba } from '../../js/creation/draw-core.mjs';
import { preparePxdAudioImageImport } from '../../js/creation/pxd-draw-audio.mjs';
const storage = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }; };
test('one-shot camera preserves fixed PXD context without putting it in the camera request URL', () => {
  const local = storage(); const now = 123456; const pointer = { projectId: 'project-original', revisionId: 'revision-fixed' };
  const url = beginAudioCamera({ song: createAudioSong(), pxd: pointer, storage: local, now }); assert.equal(new URL(url, 'https://example.com').searchParams.size, 2);
  const request = readAudioCameraRequest({ search: new URL(url, 'https://example.com').search, storage: local, now }); assert.deepEqual(request.pxd, pointer);
  const cancel = new URL(audioCameraCancelUrl({ search: new URL(url, 'https://example.com').search, storage: local, now: now + 1000000 }), 'https://example.com'); assert.equal(cancel.searchParams.get('pxd'), pointer.projectId); assert.equal(cancel.searchParams.get('pxdRevision'), pointer.revisionId);
  const frame = { width: 16, height: 16, palette: [[10, 20, 30]], data: Uint8Array.from({ length: 1024 }, (_, index) => [10, 20, 30, 255][index % 4]) };
  const returned = completeAudioCamera(request, frame, { storage: local, now }); const query = new URL(returned, 'https://example.com').search;
  assert.equal(new URL(returned, 'https://example.com').searchParams.get('pxdRevision'), pointer.revisionId); assert.deepEqual(takeAudioCameraReturn({ search: query, storage: local, now }).pxd, pointer);
});
test('PXD camera pointers cannot introduce external URLs or extra rights', () => {
  assert.throws(() => beginAudioCamera({ song: createAudioSong(), pxd: { projectId: 'https://evil', revisionId: 'r1' }, storage: storage() }));
  assert.throws(() => beginAudioCamera({ song: createAudioSong(), pxd: { projectId: 'p1', revisionId: 'r1', premium: true }, storage: storage() }));
});
test('camera preserves colors beyond the four audible assignments for later color selection', () => {
  const local = storage(); const now = 123456; const song = createAudioSong();
  const url = beginAudioCamera({ song, storage: local, now });
  const request = readAudioCameraRequest({ search: new URL(url, 'https://example.com').search, storage: local, now });
  const palette = Array.from({ length: 16 }, (_, i) => [i * 15, 75, 180]);
  const data = new Uint8Array(1024);
  for (let i = 0; i < 256; i += 1) data.set([...palette[i % palette.length], 255], i * 4);
  const returned = completeAudioCamera(request, { width: 16, height: 16, palette, data }, { storage: local, now });
  const captured = takeAudioCameraReturn({ search: new URL(returned, 'https://example.com').search, storage: local, now });
  assert.equal(captured.document.palette.length, 16);
  assert.deepEqual(documentRgba(captured.document), data);
  const plan = preparePxdAudioImageImport(song, { width: 16, height: 16, rgba: data });
  assert.deepEqual(plan.image.rgba, data);
  assert.equal(Object.values(plan.link.colorToSlot).filter((slot) => slot !== null).length, 4);
  assert.equal(Object.values(plan.link.colorToSlot).filter((slot) => slot === null).length, 12);
  const second = beginAudioCamera({ song, storage: local, now });
  const nextRequest = readAudioCameraRequest({ search: new URL(second, 'https://example.com').search, storage: local, now });
  assert.throws(() => completeAudioCamera(nextRequest, { width: 16, height: 16, palette: Array.from({ length: 129 }, (_, i) => [i, 0, 0]), data }, { storage: local, now }), /色パレット/);
});
