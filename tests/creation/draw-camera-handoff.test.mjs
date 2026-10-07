import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimationFromDraw, addAnimationFrame, addAnimationLayer, writeAnimationCel, getAnimationCelDocument, getAnimationUsedColorIndices } from '../../js/creation/animation-core.mjs';
import { chooseCameraPalette } from '../../js/creation/draw-camera-core.mjs';
import { beginDrawCamera, readDrawCameraRequest, completeDrawCamera, drawCameraCancelUrl, takeDrawCameraReturn, consumeDrawCameraRequest, encodeDrawCameraAnimation, decodeDrawCameraAnimation, DRAW_CAMERA_HANDOFF_PREFIX, DRAW_CAMERA_HANDOFF_TTL } from '../../js/creation/draw-camera-handoff.mjs';

function memoryStorage() {
  const values = new Map();
  return { values, getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
}
function sampleAnimation() {
  const doc = { schemaVersion: 1, width: 4, height: 3, palette: ['#000000', '#ffffff'], pixels: [0, -1, 1, -1, -1, 1, -1, 0, 0, 1, -1, -1] };
  let animation = createAnimationFromDraw(doc);
  const first = animation.frames[0].id, layer = animation.layers[0].id;
  animation = addAnimationFrame(animation, first, { copy: true });
  animation = addAnimationLayer(animation, { name: 'Overlay' });
  const overlay = animation.layers[1].id;
  animation = writeAnimationCel(animation, animation.frames[1].id, overlay, { width: 4, height: 3, pixels: Uint8Array.from([0, 0, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0]) });
  return { animation, first, layer, overlay };
}
const mask = Uint8Array.from([0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0]);
const allowed = (animation, frameId, layerId, targetMask) => chooseCameraPalette(getAnimationCelDocument(animation, frameId, layerId), targetMask, getAnimationUsedColorIndices(animation, { excludeFrameId: frameId, excludeLayerId: layerId }));

test('animation snapshot preserves every frame/layer cel and shared tile payloads through byte arrays', () => {
  const { animation } = sampleAnimation(), snapshot = encodeDrawCameraAnimation(animation), restored = decodeDrawCameraAnimation(JSON.parse(JSON.stringify(snapshot)));
  assert.deepEqual(restored.frames, animation.frames);
  assert.deepEqual(restored.layers, animation.layers);
  for (const frame of animation.frames) for (const layer of animation.layers) {
    assert.deepEqual(getAnimationCelDocument(restored, frame.id, layer.id).pixels, getAnimationCelDocument(animation, frame.id, layer.id).pixels);
  }
});

test('begin/read/capture/return roundtrip preserves full animation, selected target, and metadata exactly once', () => {
  const { animation, first, layer } = sampleAnimation(), storage = memoryStorage(), now = 1_800_000_000_000;
  const returnView = { zoom: 3, panX: -4, panY: 9, selection: { x: 0, y: 0, width: 4, height: 3, mask: [...mask] } };
  const project = { projectId: 'p-1', sourceRevision: 7 }, history = { marker: 'opaque JSON' };
  const paletteIndices = allowed(animation, first, layer, mask);
  const url = beginDrawCamera({ animation, frameId: first, layerId: layer, mask, allowedIndices: paletteIndices, view: returnView, project, history, storage, now });
  assert.match(url, /^\/pixel-camera\.html\?to=draw&drawRequest=[\da-f-]+$/);
  const request = readDrawCameraRequest({ search: url.split('?')[1], storage, now });
  assert.deepEqual([...request.mask], [...mask]); assert.equal(request.animation.frames.length, 2); assert.equal(request.animation.layers.length, 2);
  assert.deepEqual([...request.cells], Array.from(mask, (value, index) => value ? index : -1).filter(index => index >= 0)); assert.deepEqual(request.allowedIndices, paletteIndices);
  assert.deepEqual(request.view, returnView); assert.deepEqual(request.project, project); assert.deepEqual(request.history, history);
  const finishUrl = completeDrawCamera(request, Int16Array.from([paletteIndices[1], paletteIndices[0], paletteIndices[1], paletteIndices[0]]), { storage, now: now + 10 });
  const restored = takeDrawCameraReturn({ search: finishUrl.split('?')[1], storage, now: now + 20 });
  assert.deepEqual([...restored.indices], [1, 0, 1, 0]); assert.equal(restored.frameId, first); assert.equal(restored.layerId, layer);
  assert.deepEqual(restored.view, returnView); assert.deepEqual(restored.project, project); assert.deepEqual(restored.history, history);
  assert.equal(storage.values.size, 0);
  assert.equal(takeDrawCameraReturn({ search: finishUrl.split('?')[1], storage, now: now + 30 }), null);
});

test('cancel and expiry recover the original animation without a capture and consume only a valid UUID record', () => {
  const { animation, first, layer } = sampleAnimation(), storage = memoryStorage(), now = 1000;
  const paletteIndices = allowed(animation, first, layer, null);
  const url = beginDrawCamera({ animation, frameId: first, layerId: layer, mask: null, allowedIndices: paletteIndices, storage, now });
  const request = readDrawCameraRequest({ search: url.split('?')[1], storage, now });
  const cancelUrl = drawCameraCancelUrl(request);
  const cancelled = takeDrawCameraReturn({ search: cancelUrl.split('?')[1], storage, now: now + 1 });
  assert.equal(cancelled.cancelled, true); assert.equal(cancelled.indices, null);
  const second = beginDrawCamera({ animation, frameId: first, layerId: layer, mask: null, allowedIndices: paletteIndices, storage, now });
  const id = new URL(`https://local.invalid${second}`).searchParams.get('drawRequest');
  const expired = takeDrawCameraReturn({ search: `drawCamera=${id}`, storage, now: now + DRAW_CAMERA_HANDOFF_TTL });
  assert.equal(expired.expired, true); assert.equal(expired.indices, null); assert.equal(expired.animation.frames.length, 2);
  assert.equal(storage.values.size, 0);
});

test('recovery URL restores without a result and can be acknowledged only after restoration', () => {
  const { animation, first, layer } = sampleAnimation(), storage = memoryStorage(), now = 3000;
  const paletteIndices = allowed(animation, first, layer, mask);
  const url = beginDrawCamera({ animation, frameId: first, layerId: layer, mask, allowedIndices: paletteIndices, storage, now });
  const id = new URL(`https://local.invalid${url}`).searchParams.get('drawRequest');
  const recovered = takeDrawCameraReturn({ search: `drawCamera=${id}`, storage, now: now + 5, consume: false });
  assert.equal(recovered.cancelled, true); assert.equal(recovered.indices, null); assert.equal(recovered.requestId, id);
  assert.ok(storage.getItem(`${DRAW_CAMERA_HANDOFF_PREFIX}${id}`));
  assert.equal(consumeDrawCameraRequest(recovered, { storage }), true);
  assert.equal(storage.getItem(`${DRAW_CAMERA_HANDOFF_PREFIX}${id}`), null);
});

test('bad queries, mismatched IDs, tampered snapshots, and invalid capture values never consume the source record', () => {
  const { animation, first, layer } = sampleAnimation(), storage = memoryStorage(), now = 5000;
  const url = beginDrawCamera({ animation, frameId: first, layerId: layer, mask, allowedIndices: [0, 1], storage, now });
  const id = new URL(`https://local.invalid${url}`).searchParams.get('drawRequest'), key = `${DRAW_CAMERA_HANDOFF_PREFIX}${id}`;
  const request = readDrawCameraRequest({ search: url.split('?')[1], storage, now });
  assert.equal(readDrawCameraRequest({ search: `to=other&drawRequest=${id}`, storage, now }), null);
  assert.equal(takeDrawCameraReturn({ search: `drawCamera=${id}&drawCamera=${id}`, storage, now }), null);
  assert.throws(() => completeDrawCamera({ ...request, id: '00000000-0000-4000-8000-000000000000' }, Int16Array.from([0, 0, 0, 0]), { storage, now }));
  assert.throws(() => completeDrawCamera({ ...request, allowedIndices: [0] }, Int16Array.from([0, 0, 0, 0]), { storage, now }));
  assert.throws(() => completeDrawCamera(request, Int16Array.from([-1, 0, 0, 0]), { storage, now }));
  let record = JSON.parse(storage.getItem(key)); record.target.layerId = 'tampered'; storage.setItem(key, JSON.stringify(record));
  assert.equal(takeDrawCameraReturn({ search: `drawCamera=${id}`, storage, now }), null);
  assert.ok(storage.getItem(key), 'an invalid record is not consumed');
});

test('target must be unlocked and allowed palette must equal the artwork-budget chooser result', () => {
  const { animation, first } = sampleAnimation(), locked = addAnimationLayer(animation, { name: 'Locked', locked: true }), lockedId = locked.layers.at(-1).id;
  const lockedAllowed = allowed(locked, first, lockedId, null);
  assert.throws(() => beginDrawCamera({ animation: locked, frameId: first, layerId: lockedId, mask: null, allowedIndices: lockedAllowed, storage: memoryStorage(), now: 1 }));
  const layer = animation.layers[0].id, expected = allowed(animation, first, layer, null);
  assert.throws(() => beginDrawCamera({ animation, frameId: first, layerId: layer, mask: null, allowedIndices: expected.slice(1), storage: memoryStorage(), now: 1 }));
});

test('storage readback mismatch cleans up a new request and rolls back a failed result write', () => {
  const { animation, first, layer } = sampleAnimation(), values = new Map(); let corruptNextRead = false;
  const storage = { getItem(key) { if (corruptNextRead) { corruptNextRead = false; return 'tampered-readback'; } return values.get(key) ?? null; }, setItem(key, value) { values.set(key, String(value)); }, removeItem(key) { values.delete(key); } };
  const expected = allowed(animation, first, layer, mask);
  corruptNextRead = true;
  assert.throws(() => beginDrawCamera({ animation, frameId: first, layerId: layer, mask, allowedIndices: expected, storage, now: 10 }));
  assert.equal(values.size, 0);
  const url = beginDrawCamera({ animation, frameId: first, layerId: layer, mask, allowedIndices: expected, storage, now: 10 });
  const request = readDrawCameraRequest({ search: url.split('?')[1], storage, now: 10 }), key = `${DRAW_CAMERA_HANDOFF_PREFIX}${request.id}`, prior = storage.getItem(key);
  corruptNextRead = true;
  assert.throws(() => completeDrawCamera(request, Int16Array.from(expected.slice(0, 1).concat(expected.slice(0, 1), expected.slice(0, 1), expected.slice(0, 1))), { storage, now: 11 }));
  assert.equal(values.get(key), prior, 'the original recoverable snapshot remains stored');
});

test('storage quota errors abort begin before a navigation URL is returned', () => {
  const { animation, first, layer } = sampleAnimation();
  const storage = { getItem() { return null; }, setItem() { throw new DOMException('quota', 'QuotaExceededError'); } };
  assert.throws(() => beginDrawCamera({ animation, frameId: first, layerId: layer, mask: null, allowedIndices: [0], storage, now: 1 }));
});
