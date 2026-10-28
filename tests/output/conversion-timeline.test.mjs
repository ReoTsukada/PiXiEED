import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { animationPlan, frameAt, setFrameSeconds, moveFrame, loadTimelineFiles, validateTimeline, convertWithTimeline } from '../../js/creation/conversion-timeline.mjs';
import { encodeOutput } from '../../js/creation/output-encoders.mjs';
const frames = (delays = [80, 160, 240]) => delays.map((delayMs, i) => ({ width: 2, height: 1, data: Uint8ClampedArray.of(i * 80, 20, 40, 255, 40, 60, 80, 255), delayMs, name: `frame${i}` }));
for (const rate of [.25, .5, 1, 1.5, 2, 4]) {
  test(`GIF preview and exported input use the same quantized time at ${rate}x`, async () => {
    const input = frames(), original = structuredClone(input), source = { kind: 'image', frames: input, totalPlays: 2 };
    const plan = animationPlan(input, { playbackRate: rate, totalPlays: 2 });
    const result = await convertWithTimeline(source, 'gif', { playbackRate: rate, totalPlays: 2 }, null, null, (value, format) => ({ value, format }));
    assert.deepEqual(result.value.frames.map(f => f.delayMs), plan.frameDelaysMs);
    assert.equal(result.value.totalPlays, 2); assert.equal(result.format, 'gif');
    assert.deepEqual(input, original); assert.equal(plan.totalDurationMs, plan.durationMs * 2);
  });
}
test('nonuniform times retain their ratio; GIF rounding is explicit', () => {
  assert.deepEqual(animationPlan(frames(), { playbackRate: 2 }).frameDelaysMs, [40, 80, 120]);
  const plan = animationPlan(frames([21, 31]), { playbackRate: 4 });
  assert.deepEqual(plan.frameDelaysMs, [20, 20]); assert.equal(plan.adjusted, true);
});
test('APNG retains millisecond timing rather than the GIF floor', () => {
  assert.deepEqual(animationPlan(frames([20, 28]), { format: 'apng', playbackRate: 4 }).frameDelaysMs, [5, 7]);
});
for (const rate of [0, -.5, 4.1, NaN, Infinity]) test(`invalid playback rate ${rate} is rejected`, () => assert.throws(() => animationPlan(frames(), { playbackRate: rate })));
for (const count of [-1, .5, 65537, NaN]) test(`invalid GIF loop count ${count} is rejected`, () => assert.throws(() => animationPlan(frames(), { totalPlays: count })));
test('format timing bounds reject overflow rather than wrapping', () => {
  assert.throws(() => animationPlan(frames([655350]), { playbackRate: .25 }));
  assert.throws(() => animationPlan(frames([3_600_000]), { format: 'apng', playbackRate: .25 }));
});
test('finite and infinite playback share exact boundary decisions', () => {
  const plan = animationPlan(frames(), { totalPlays: 2 });
  assert.deepEqual(frameAt(plan, 0), { index: 0, done: false });
  assert.equal(frameAt(plan, 80).index, 1); assert.equal(frameAt(plan, 240).index, 2);
  assert.equal(frameAt(plan, 480).index, 0); assert.deepEqual(frameAt(plan, 960), { index: 2, done: true });
  assert.equal(frameAt(animationPlan(frames()), 48_000).done, false);
  assert.throws(() => frameAt(plan, -1)); assert.throws(() => frameAt(plan, NaN));
});
test('all-frame and per-frame seconds edit immutably', () => {
  const input = frames(); assert.deepEqual(setFrameSeconds(input, 2).map(f => f.delayMs), [2000, 2000, 2000]);
  assert.deepEqual(setFrameSeconds(input, .5, 1).map(f => f.delayMs), [80, 500, 240]);
  assert.deepEqual(input.map(f => f.delayMs), [80, 160, 240]);
  for (const value of [0, .01, 61, NaN]) assert.throws(() => setFrameSeconds(input, value));
  assert.throws(() => setFrameSeconds(input, 1, 5));
});
test('reordering retains pixel data and frame time without mutating input', () => {
  const input = frames(); const moved = moveFrame(input, 0, 1);
  assert.equal(moved[1], input[0]); assert.equal(moved[0], input[1]); assert.notEqual(moved, input);
  assert.deepEqual(moveFrame(input, 0, -1), input); assert.throws(() => moveFrame(input, 5, 1));
});
test('multi-image input supports the shared decoders and preserves file order', async () => {
  const files = [{ size: 10, name: 'b.qoi' }, { size: 12, name: 'a.tga' }]; let calls = 0;
  const result = await loadTimelineFiles(files, { load: async () => { calls++; return { kind: 'image', frames: frames([120]) }; } });
  assert.equal(calls, 2); assert.equal(result.sequence, true); assert.equal(result.totalPlays, 0);
  assert.deepEqual(result.frames.map(f => f.delayMs), [1000, 1000]);
});
test('single-file behavior including audio is preserved', async () => {
  const result = await loadTimelineFiles([{ size: 10 }], { load: async () => ({ kind: 'audio', frames: [], audio: { sampleRate: 8000 } }) });
  assert.equal(result.kind, 'audio'); assert.equal(result.sequence, false);
});
test('invalid multiple media and partial failures do not produce partial output', async () => {
  await assert.rejects(loadTimelineFiles([{ size: 10 }, { size: 10 }], { load: async () => ({ kind: 'audio' }) }));
  let n = 0; await assert.rejects(loadTimelineFiles([{ size: 10 }, { size: 10 }], { load: async () => { if (n++) throw new Error('broken'); return { kind: 'image', frames: frames([20]) }; } }), /broken/);
});
test('file and byte caps are checked before a decoder runs', async () => {
  let calls = 0; const options = { load: () => { calls++; } };
  for (const files of [[], Array.from({ length: 9 }, () => ({ size: 1 })), [{ size: 0 }], [{ size: 65 * 1024 * 1024 }], Array.from({ length: 3 }, () => ({ size: 64 * 1024 * 1024 }))]) await assert.rejects(loadTimelineFiles(files, options));
  assert.equal(calls, 0);
});
test('aborted imports and exports never invoke decoders or encoders', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(loadTimelineFiles([{ size: 10 }], { signal: controller.signal, load: () => { calls++; } }), { name: 'AbortError' });
  await assert.rejects(convertWithTimeline({ kind: 'image', frames: frames() }, 'gif', {}, controller.signal, null, () => { calls++; }), { name: 'AbortError' });
  assert.equal(calls, 0);
});
test('timeline safety rejects invalid geometry, bytes and frame count', () => {
  for (const value of [[], frames(Array(601).fill(20)), [{ width: 4097, height: 1, data: new Uint8Array(1) }], [{ width: 1, height: 1, data: new Float32Array(4) }]]) assert.throws(() => validateTimeline(value));
});
test('static and audio conversions are delegated unchanged', async () => {
  const source = { kind: 'audio' }, options = { bitDepth: 24 }; let received;
  await convertWithTimeline(source, 'aiff', options, null, null, (...args) => { received = args; });
  assert.equal(received[0], source); assert.equal(received[1], 'aiff'); assert.equal(received[2], options);
});
function gifDelays(bytes) {
  let p = 13; if (bytes[10] & 128) p += 3 * 2 ** ((bytes[10] & 7) + 1); const delays = [];
  const blocks = () => { while (bytes[p]) { const n = bytes[p++]; p += n; } p++; };
  while (p < bytes.length) {
    const tag = bytes[p++]; if (tag === 0x3b) break;
    if (tag === 0x21) { const label = bytes[p++]; if (label === 0xf9) delays.push((bytes[p + 2] | bytes[p + 3] << 8) * 10); blocks(); }
    else if (tag === 0x2c) { const flags = bytes[p + 8]; p += 9; if (flags & 128) p += 3 * 2 ** ((flags & 7) + 1); p++; blocks(); }
    else throw new Error('Invalid GIF block');
  }
  return delays;
}
test('the real GIF encoder writes the same per-frame delays as the preview plan', async () => {
  const plan = animationPlan(frames(), { playbackRate: 2, totalPlays: 2 });
  const blob = await encodeOutput({ format: 'gif', frames: plan.frames, totalPlays: plan.totalPlays });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(gifDelays(bytes), plan.frameDelaysMs);
});
test('search page is static, canonical, linked and listed in a dedicated sitemap', async () => {
  const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
  const [guide, index, map, robots, entry] = await Promise.all(['output/gif-speed/index.html', 'output/index.html', 'output/sitemap.xml', 'robots.txt', 'js/creation/conversion-entry.mjs'].map(read));
  assert.match(guide, /<title>GIFの再生速度/); assert.match(guide, /rel="canonical" href="https:\/\/pixieed.jp\/output\/gif-speed\/"/);
  assert.doesNotMatch(guide, /name="robots"[^>]*noindex/);
  assert.match(index, /href="\/output\/gif-speed\/"/); assert.match(map, /https:\/\/pixieed.jp\/output\/gif-speed\//); assert.match(robots, /Sitemap: https:\/\/pixieed.jp\/output\/sitemap.xml/);
  assert.match(entry, /if \(query\.has\('id'\) \|\| query\.has\('file'\)\)/); assert.match(entry, /else if \(query\.get\('mode'\) === 'convert'\)/); assert.match(entry, /output-page\.mjs\?rev=20261024-common-tool-start-1/);
});
