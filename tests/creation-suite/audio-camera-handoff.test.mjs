import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import {
  AUDIO_CAMERA_REQUEST_KEY, AUDIO_CAMERA_RETURN_KEY, AUDIO_CAMERA_HANDOFF_TTL_MS,
  audioCameraCancelUrl, beginAudioCamera, completeAudioCamera, readAudioCameraDraft, readAudioCameraRequest, takeAudioCameraReturn
} from '../../js/creation/audio-camera-handoff.mjs';
import { validateDrawDocument } from '../../js/creation/draw-core.mjs';

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function fixture(width = 16) {
  const storage = new MemoryStorage();
  const song = createAudioSong({ songId: `song-${width}`, loopTicks: width * 120 });
  const now = 1_800_000_000_000;
  const url = beginAudioCamera({ song, storage, now });
  const audioRequest = new URL(url, 'https://pixieed.jp').searchParams.get('audioRequest');
  return { storage, song, now, url, audioRequest, request: readAudioCameraRequest({ search: new URL(url, 'https://pixieed.jp').search, storage, now }) };
}

function frameFor(width, height = 16) {
  const palette = [[20, 40, 60], [80, 100, 120], [140, 160, 180], [200, 220, 240]];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const color = palette[index % palette.length];
    data.set([...color, 255], index * 4);
  }
  return { width, height, data, palette };
}

test('legacy Audio camera requests remain opaque, session-only, validated, and fixed to 16-high canvas widths', () => {
  for (const width of [16, 32, 64, 128]) {
    const { storage, song, now, url, request } = fixture(width);
    assert.match(url, /^\/pixel-camera\.html\?to=audio&audioRequest=[0-9a-f-]{36}$/i);
    assert.equal(url.includes('image'), false);
    assert.equal(request.width, width);
    assert.equal(request.height, 16);
    assert.deepEqual(request.song, song);
    assert.equal(readAudioCameraRequest({ search: `${new URL(url, 'https://pixieed.jp').search}&extra=1`, storage, now }), null);
    assert.equal(readAudioCameraRequest({ search: `${new URL(url, 'https://pixieed.jp').search}&audioRequest=${request.requestId}`, storage, now }), null);
    assert.equal(readAudioCameraRequest({ search: new URL(url, 'https://pixieed.jp').search, storage, now: now + AUDIO_CAMERA_HANDOFF_TTL_MS }), null);
    storage.setItem(AUDIO_CAMERA_REQUEST_KEY, '{bad json');
    assert.equal(readAudioCameraRequest({ search: new URL(url, 'https://pixieed.jp').search, storage, now }), null);
  }
});

test('shared-image handoff preserves a rectangular canvas and the exact local PXD revision pointer', () => {
  const storage = new MemoryStorage();
  const song = createAudioSong({ songId: 'shared-rectangle', loopTicks: 16 * 120 });
  const pxd = { projectId: 'project_123', revisionId: 'revision_456' };
  const now = 1_800_000_000_000;
  const url = beginAudioCamera({ song, pxd, width: 23, height: 37, storage, now });
  const request = readAudioCameraRequest({ search: new URL(url, 'https://pixieed.jp').search, storage, now });
  assert.deepEqual({ width: request.width, height: request.height, pxd: request.pxd }, { width: 23, height: 37, pxd });
  const returnedUrl = completeAudioCamera(request, frameFor(23, 37), { storage, now });
  const returned = takeAudioCameraReturn({ search: new URL(returnedUrl, 'https://pixieed.jp').search, storage, now });
  assert.deepEqual(returned.pxd, pxd);
  assert.equal(returned.document.width, 23);
  assert.equal(returned.document.height, 37);
  assert.equal(returned.document.pixels.length, 23 * 37);
});

test('rectangular handoff rejects invalid sizes, mismatched frames, and altered return pointers', () => {
  const storage = new MemoryStorage();
  const song = createAudioSong({ songId: 'shared-invalid-size' });
  const now = 1_800_000_000_000;
  for (const dimensions of [{ width: 0, height: 12 }, { width: 257, height: 12 }, { width: 12 }, { height: 12 }]) {
    assert.throws(() => beginAudioCamera({ song, ...dimensions, storage, now }), /寸法|1〜256px/);
  }
  const pxd = { projectId: 'project_abc', revisionId: 'revision_def' };
  const url = beginAudioCamera({ song, pxd, width: 19, height: 21, storage, now });
  const request = readAudioCameraRequest({ search: new URL(url, 'https://pixieed.jp').search, storage, now });
  assert.throws(() => completeAudioCamera(request, frameFor(19, 20), { storage, now }), /寸法/);
  const returnedUrl = completeAudioCamera(request, frameFor(19, 21), { storage, now });
  const search = new URL(returnedUrl, 'https://pixieed.jp').search;
  const alteredPointer = search.replace('revision_def', 'revision_other');
  assert.equal(takeAudioCameraReturn({ search: alteredPointer, storage, now }), null);
  assert.ok(storage.getItem(AUDIO_CAMERA_REQUEST_KEY), 'a mismatched pointer cannot consume the pending request');
  const cancelUrl = audioCameraCancelUrl({ search: new URL(url, 'https://pixieed.jp').search, storage, now });
  const restored = readAudioCameraDraft({ search: new URL(cancelUrl, 'https://pixieed.jp').search, storage, now });
  assert.deepEqual(restored.pxd, pxd);
  assert.equal(restored.width, 19);
  assert.equal(restored.height, 21);
});

test('captured photo returns to its matching song as a Draw-compatible indexed document', () => {
  const { storage, song, now, request } = fixture(32);
  const frame = frameFor(32);
  assert.equal(completeAudioCamera(request, frame, { storage, now }), `/audio/?camera=${request.requestId}`);
  const transferred = takeAudioCameraReturn({ search: `?camera=${request.requestId}`, storage, now });
  assert.deepEqual(transferred.song, song);
  assert.equal(transferred.document.width, 32);
  assert.equal(transferred.document.height, 16);
  assert.deepEqual(transferred.document.palette, ['#14283c', '#506478', '#8ca0b4', '#c8dcf0']);
  assert.deepEqual(transferred.document.pixels.slice(0, 8), [0, 1, 2, 3, 0, 1, 2, 3]);
  assert.equal(transferred.document.schemaVersion, 1);
  assert.equal(transferred.document.pixels.length, transferred.document.width * transferred.document.height);
  assert.ok(transferred.document.palette.length <= 4);
  assert.equal(storage.getItem(AUDIO_CAMERA_REQUEST_KEY), null);
  assert.equal(storage.getItem(AUDIO_CAMERA_RETURN_KEY), null);
});

test('16x16 return follows the existing Draw document validator', () => {
  const { storage, now, request } = fixture(16);
  completeAudioCamera(request, frameFor(16), { storage, now });
  const result = takeAudioCameraReturn({ search: `?camera=${request.requestId}`, storage, now });
  assert.equal(validateDrawDocument(result.document), result.document);
});

test('photo-derived palette may contain fewer than four colours without losing the transfer', () => {
  const { storage, now, request } = fixture(16);
  const color = [72, 96, 120];
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([...color, 255], offset);
  completeAudioCamera(request, { width: 16, height: 16, data, palette: [color] }, { storage, now });
  const result = takeAudioCameraReturn({ search: `?camera=${request.requestId}`, storage, now });
  assert.deepEqual(result.document.palette, ['#486078']);
  assert.ok(result.document.pixels.every((pixel) => pixel === 0));
});

test('failed frame validation and another request ID cannot consume or overwrite the saved draft', () => {
  const { storage, now, request } = fixture(16);
  assert.throws(() => completeAudioCamera(request, frameFor(32), { storage, now }), /寸法/);
  assert.equal(storage.getItem(AUDIO_CAMERA_RETURN_KEY), null);
  assert.equal(takeAudioCameraReturn({ search: '?camera=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', storage, now }), null);
  assert.ok(storage.getItem(AUDIO_CAMERA_REQUEST_KEY));
});

test('cancel return restores the original song and consumes only its own pending request', () => {
  const { storage, song, now, request } = fixture(64);
  const restored = readAudioCameraDraft({ search: `?camera=${request.requestId}&cancelled=1`, storage, now });
  assert.deepEqual(restored.song, song);
  assert.equal(restored.width, 64);
  assert.equal(restored.height, 16);
  assert.equal(storage.getItem(AUDIO_CAMERA_REQUEST_KEY), null);
  assert.equal(readAudioCameraDraft({ search: `?camera=${request.requestId}`, storage, now }), null);
});

test('expired camera request restores the song draft by matching ID but rejects the expired image return', () => {
  const storage = new MemoryStorage();
  const now = 1_800_000_000_000;
  const song = createAudioSong({ songId: 'song-with-notes' });
  song.tracks[0].clips[0].notes.push({ noteId: 'note-1', pitch: 84, startTick: 0, durationTicks: 120, velocity: 100 });
  const url = beginAudioCamera({ song, storage, now });
  const search = new URL(url, 'https://pixieed.jp').search;
  const request = readAudioCameraRequest({ search, storage, now });
  completeAudioCamera(request, frameFor(16), { storage, now });

  const expiredAt = now + AUDIO_CAMERA_HANDOFF_TTL_MS + 1;
  const cancelUrl = audioCameraCancelUrl({ search, storage, now: expiredAt });
  assert.equal(cancelUrl, `/audio/?camera=${request.requestId}&cancelled=1`);
  assert.equal(takeAudioCameraReturn({ search: `?camera=${request.requestId}`, storage, now: expiredAt }), null);
  const restored = readAudioCameraDraft({ search: new URL(cancelUrl, 'https://pixieed.jp').search, storage, now: expiredAt });
  assert.deepEqual(restored.song.tracks[0].clips[0].notes, song.tracks[0].clips[0].notes);
  assert.equal(storage.getItem(AUDIO_CAMERA_REQUEST_KEY), null);
  assert.equal(storage.getItem(AUDIO_CAMERA_RETURN_KEY), null);
});

test('cancel URL rejects foreign, malformed, and duplicate request IDs', () => {
  const { storage, now, url, request } = fixture(16);
  const search = new URL(url, 'https://pixieed.jp').search;
  assert.equal(audioCameraCancelUrl({ search: `${search}&audioRequest=${request.requestId}`, storage, now }), '/audio/');
  assert.equal(audioCameraCancelUrl({ search: '?to=audio&audioRequest=bad', storage, now }), '/audio/');
  assert.equal(audioCameraCancelUrl({ search: '?to=audio&audioRequest=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', storage, now }), '/audio/');
});

test('invalid canvas sizes and mismatched audio songs fail closed', () => {
  const storage = new MemoryStorage();
  const now = 1_800_000_000_000;
  const invalid = createAudioSong({ songId: 'bad-width', loopTicks: 5760 });
  assert.throws(() => beginAudioCamera({ song: invalid, storage, now }), /16\/32\/64\/128px/);
  const { storage: activeStorage, now: activeNow, request } = fixture(16);
  assert.throws(() => completeAudioCamera({ ...request, song: createAudioSong({ songId: 'other' }) }, frameFor(16), { storage: activeStorage, now: activeNow }), /期限が切れました/);
});
