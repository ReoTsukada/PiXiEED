import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVideoOutputSize, verifyEncodedVideoSize } from '../../js/creation/video-output-size.mjs';

test('explicit video dimensions preserve original size, scale, aspect and odd WebM dimensions', () => {
  assert.equal(validateVideoOutputSize(null), null);
  for (const dimensions of [{ width: 32, height: 16 }, { width: 64, height: 32 }, { width: 33, height: 19 }, { width: 4096, height: 4096 }]) {
    assert.deepEqual(validateVideoOutputSize(dimensions, { mimeType: 'video/webm;codecs=vp9' }), dimensions);
    assert.ok(Object.isFrozen(validateVideoOutputSize(dimensions)));
  }
});

test('invalid dimensions never round, enlarge, or crop silently', () => {
  for (const dimensions of [{ width: 0, height: 2 }, { width: -1, height: 2 }, { width: 1.5, height: 2 }, { width: 2, height: NaN }, { width: 4097, height: 2 }, { width: 2, height: Infinity }, {}]) {
    assert.throws(() => validateVideoOutputSize(dimensions), RangeError);
  }
  assert.throws(() => validateVideoOutputSize({ width: 33, height: 18 }, { mimeType: 'video/mp4;codecs=avc1' }), /偶数/);
  assert.throws(() => validateVideoOutputSize({ width: 32, height: 19 }, { mimeType: 'video/mp4' }), /偶数/);
  assert.deepEqual(validateVideoOutputSize({ width: 32, height: 18 }, { mimeType: 'video/mp4' }), { width: 32, height: 18 });
});

function probeHarness() {
  const video = new EventTarget(); let src = ''; let plays = 0; let timerCallback; let clears = 0; let loads = 0;
  Object.defineProperty(video, 'src', { get: () => src, set: (value) => { src = value; } });
  video.removeAttribute = (name) => { if (name === 'src') src = ''; };
  video.load = () => { loads += 1; }; video.pause = () => {};
  video.play = () => { plays += 1; throw new Error('must not play'); };
  const created = []; const revoked = [];
  const options = {
    documentRef: { createElement: (name) => { assert.equal(name, 'video'); return video; } },
    URLImpl: { createObjectURL: (blob) => { created.push(blob); return 'blob:local-test'; }, revokeObjectURL: (url) => revoked.push(url) },
    setTimeoutImpl: (callback) => { timerCallback = callback; return 9; }, clearTimeoutImpl: (id) => { assert.equal(id, 9); clears += 1; }
  };
  return { video, options, created, revoked, timeout: () => timerCallback(), state: () => ({ src, plays, clears, loads }) };
}
const blob = new Blob(['encoded bytes'], { type: 'video/webm' });

test('local metadata verification returns actual exact dimensions without playing or retaining Blob URLs', async () => {
  const h = probeHarness();
  const result = verifyEncodedVideoSize(blob, { width: 33, height: 19 }, h.options);
  assert.equal(h.video.preload, 'metadata'); assert.equal(h.state().src, 'blob:local-test');
  h.video.videoWidth = 33; h.video.videoHeight = 19; h.video.dispatchEvent(new Event('loadedmetadata'));
  assert.deepEqual(await result, { width: 33, height: 19 });
  assert.deepEqual(h.revoked, ['blob:local-test']); assert.equal(h.state().src, '');
  assert.equal(h.state().plays, 0); assert.equal(h.state().clears, 1);
});

test('codec padded or cropped dimensions reject before output is accepted', async () => {
  const h = probeHarness(); const result = verifyEncodedVideoSize(blob, { width: 33, height: 19 }, h.options);
  h.video.videoWidth = 34; h.video.videoHeight = 20; h.video.dispatchEvent(new Event('loadedmetadata'));
  await assert.rejects(result, /34×20.*33×19/);
  assert.equal(h.revoked.length, 1); assert.equal(h.state().src, '');
});

test('probe decode failure and timeout release media and URL and do not accept a result', async () => {
  for (const action of ['error', 'timeout']) {
    const h = probeHarness(); const result = verifyEncodedVideoSize(blob, { width: 32, height: 16 }, h.options);
    if (action === 'error') h.video.dispatchEvent(new Event('error')); else h.timeout();
    await assert.rejects(result, action === 'error' ? /デコード/ : /時間内/);
    assert.equal(h.revoked.length, 1); assert.equal(h.state().src, ''); assert.equal(h.state().plays, 0);
  }
});

test('abort before or during metadata verification cannot publish stale output', async () => {
  const before = probeHarness(); const first = new AbortController(); first.abort();
  await assert.rejects(verifyEncodedVideoSize(blob, { width: 32, height: 16 }, { ...before.options, signal: first.signal }), { name: 'AbortError' });
  assert.equal(before.created.length, 0);
  const h = probeHarness(); const controller = new AbortController();
  const result = verifyEncodedVideoSize(blob, { width: 32, height: 16 }, { ...h.options, signal: controller.signal });
  controller.abort();
  h.video.videoWidth = 32; h.video.videoHeight = 16; h.video.dispatchEvent(new Event('loadedmetadata'));
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(h.revoked.length, 1); assert.equal(h.state().src, '');
});

test('unavailable local metadata decoder rejects explicitly without saving', async () => {
  await assert.rejects(verifyEncodedVideoSize(blob, { width: 32, height: 16 }, { documentRef: null }), /確認できません/);
});
