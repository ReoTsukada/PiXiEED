import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawTimelapse, selectDrawTimelapseFrames } from '../../js/creation/draw-timelapse.mjs';

const makeDocument = () => ({ width: 3, height: 2, palette: ['#ff0000', '#0000ff'], pixels: Array(6).fill(-1) });
const copyForHandoff = (events) => events.map((event) => ({
  ...event,
  data: Array.from(event.data),
  ...(event.indices ? { indices: Array.from(event.indices) } : {})
}));
const hydrate = (events) => events.map((event) => ({
  ...event,
  data: Uint8Array.from(event.data),
  ...(event.indices ? { indices: Uint32Array.from(event.indices) } : {})
}));

test('timelapse events round-trip with owned buffers and continue recording', () => {
  const source = createDrawTimelapse(); const doc = makeDocument(); source.reset(doc);
  doc.pixels[1] = 0; source.record(doc, { indices: [1] });
  doc.pixels[4] = 1; source.record(doc, { indices: [4] });
  doc.palette[0] = '#00ff00'; source.record(doc, { paletteChanged: true });

  const handoff = copyForHandoff(source.snapshot());
  const restored = createDrawTimelapse(); restored.restore(hydrate(handoff));
  assert.equal(restored.frameCount, source.frameCount);
  assert.equal(restored.storedBytes, source.storedBytes);
  assert.deepEqual(selectDrawTimelapseFrames(restored.snapshot()), selectDrawTimelapseFrames(source.snapshot()));

  const after = { ...doc, pixels: [...doc.pixels] }; after.pixels[0] = 1;
  restored.record(after, { indices: [0] });
  assert.equal(restored.frameCount, source.frameCount + 1);
  assert.deepEqual(selectDrawTimelapseFrames(restored.snapshot()).at(-1).data,
    selectDrawTimelapseFrames([...source.snapshot(), ...restored.snapshot().slice(source.frameCount)]).at(-1).data);
});

test('invalid timelapse handoffs are rejected atomically', () => {
  const recorder = createDrawTimelapse(); const doc = makeDocument(); recorder.reset(doc);
  doc.pixels[0] = 1; recorder.record(doc, { indices: [0] });
  const before = recorder.snapshot(); const bytes = recorder.storedBytes;
  const malformed = copyForHandoff(before);
  malformed[1].indices[0] = doc.pixels.length;
  assert.throws(() => recorder.restore(hydrate(malformed)));
  assert.equal(recorder.frameCount, before.length);
  assert.equal(recorder.storedBytes, bytes);
  assert.deepEqual(recorder.snapshot(), before);

  const noKeyframe = hydrate(copyForHandoff(before)); noKeyframe[0].type = 'delta';
  assert.throws(() => recorder.restore(noKeyframe));
  assert.deepEqual(recorder.snapshot(), before);
});

test('restore enforces frame and byte limits plus exact event buffer shape', () => {
  const doc = makeDocument(); const source = createDrawTimelapse({ maxBytes: 512, maxFrames: 3 }); source.reset(doc);
  doc.pixels[0] = 0; source.record(doc, { indices: [0] });
  doc.pixels[1] = 1; source.record(doc, { indices: [1] });
  const valid = source.snapshot();
  const tooMany = createDrawTimelapse({ maxBytes: 512, maxFrames: 2 });
  assert.throws(() => tooMany.restore(valid), /event sequence/);
  const tooSmall = createDrawTimelapse({ maxBytes: 23, maxFrames: 2 });
  assert.throws(() => tooSmall.restore([valid[0]]), /memory limit/);
  const badLength = valid.map((event) => ({ ...event, data: new Uint8Array(event.data.length - 1) }));
  assert.throws(() => createDrawTimelapse().restore(badLength));
  const badDimensions = valid.map((event) => ({ ...event })); badDimensions[1].width += 1;
  assert.throws(() => createDrawTimelapse().restore(badDimensions));
});
