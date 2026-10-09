import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, createAnimationFromDraw, getAnimationCelDocument, setAnimationFrameDuration, setLayerProperties, writeAnimationCel } from '../../js/creation/animation-core.mjs';
import { createPxdProject, decodePxd, encodePxd, getPxdJson, setPxdBytes, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';

const document = (width, height, pixels, palette = ['#123456', '#abcdef']) => ({ width, height, pixels, palette });

test('PXD roundtrip restores sparse cels and preserves unrelated entries, manifest and opaque bytes', async () => {
  const original = createPxdProject({ projectId: 'project-roundtrip', revisionId: 'revision-1', manifest: { unknown: { retain: true } }, entries: [{ path: 'future/component.bin', bytes: new Uint8Array([4, 5, 6]) }], opaquePayloads: [{ bytes: new Uint8Array([9, 8]) }] });
  let animation = createAnimation({ width: 33, height: 2, palette: ['#123456', '#abcdef'] });
  animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, document(33, 2, Array.from({ length: 66 }, (_, i) => i === 0 || i === 65 ? i === 0 ? 1 : 2 : 0)));
  let project = await writePxdAnimation(original, animation, { posterFrameId: animation.frames[0].id });
  project = await writePxdAnimation(project, animation, { role: 'audio', posterFrameId: animation.frames[0].id });
  const bytes = await encodePxd(project); const decoded = await decodePxd(bytes);
  const restored = await readPxdAnimation(decoded);
  assert.deepEqual(getAnimationCelDocument(restored, animation.frames[0].id, animation.layers[0].id).pixels, Array.from({ length: 66 }, (_, i) => i === 0 ? 0 : i === 65 ? 1 : -1));
  assert.deepEqual(await readPxdAnimation(decoded, 'audio').then((value) => value.frames.map(({ id }) => id)), animation.frames.map(({ id }) => id));
  assert.deepEqual(decoded.manifest.unknown, { retain: true });
  assert.deepEqual(decoded.entries.find(({ path }) => path === 'future/component.bin').bytes, new Uint8Array([4, 5, 6]));
  assert.deepEqual(decoded.opaquePayloads[0].bytes, new Uint8Array([9, 8]));
});

test('legacy Draw conversion serializes exact poster pixels while keeping PXD image entries separate', async () => {
  const legacy = createAnimationFromDraw({ schemaVersion: 1, width: 2, height: 1, palette: ['#112233'], pixels: [-1, 0] });
  const project = await writePxdAnimation(createPxdProject(), legacy);
  assert.equal(project.entries.some(({ path }) => path === 'draw/state.json'), false);
  const restored = await readPxdAnimation(project);
  assert.deepEqual(getAnimationCelDocument(restored, restored.frames[0].id, restored.layers[0].id).pixels, [-1, 0]);
});

test('fractional frame delays for exact FPS values survive PXD save and reload', async () => {
  const original = createAnimation({ width: 1, height: 1 });
  const delayMs = 1000 / 24;
  const animation = setAnimationFrameDuration(original, original.frames[0].id, delayMs);
  const restored = await readPxdAnimation(await writePxdAnimation(createPxdProject(), animation));
  assert.equal(restored.frames[0].durationMs, delayMs);
});

test('a changed payload hash, incomplete pair, or unknown animation version is rejected without modifying the PXD', async () => {
  let animation = createAnimation({ width: 2, height: 2 });
  animation = writeAnimationCel(animation, animation.frames[0].id, animation.layers[0].id, document(2, 2, [1, 0, 0, 0]));
  const project = await writePxdAnimation(createPxdProject(), animation);
  const path = 'animations/main/cels.bin'; const entry = project.entries.find((item) => item.path === path);
  const corrupted = setPxdBytes(project, path, new Uint8Array([255]));
  await assert.rejects(() => readPxdAnimation(corrupted), /画素検査|範囲/);
  assert.deepEqual(entry.bytes, new Uint8Array([1, 0, 0, 0]));
  const incomplete = { ...project, entries: project.entries.filter((item) => item.path !== path) };
  await assert.rejects(() => readPxdAnimation(incomplete), /保存部品/);
  const state = getPxdJson(project, 'animations/main/state.json');
  const future = setPxdJson(project, 'animations/main/state.json', { ...state, schemaVersion: 99 });
  await assert.rejects(() => readPxdAnimation(future), (error) => error.code === 'PXD_ANIMATION_VERSION');
  assert.equal(project.entries.find((item) => item.path === 'animations/main/state.json').bytes.length > 0, true);
});

test('writes reject metadata budget overflow atomically and preserve other roles', async () => {
  const prior = await writePxdAnimation(createPxdProject(), createAnimation({ width: 1, height: 1 }));
  let audioRuntime = createAnimation({ width: 1, height: 1 });
  audioRuntime = setLayerProperties(audioRuntime, audioRuntime.layers[0].id, { name: 'a'.repeat(32 * 1024) });
  const audio = await writePxdAnimation(prior, audioRuntime, { role: 'audio' });
  const tiny = createAnimation({ width: 1, height: 1 });
  const tooLarge = setLayerProperties(tiny, tiny.layers[0].id, { name: 'x'.repeat(1024 * 1024 - 10000) });
  await assert.rejects(() => writePxdAnimation(audio, tooLarge), /情報.*(上限|超え)/);
  assert.deepEqual(prior.entries.map(({ path }) => path), ['animations/main/state.json', 'animations/main/cels.bin']);
  assert.ok(audio.entries.some(({ path }) => path === 'animations/audio/state.json'));
});

test('main and audio pixel pools share one 32 MiB budget', async () => {
  const audioRuntime = createAnimation({ width: 1, height: 1 });
  const audioProject = await writePxdAnimation(createPxdProject(), audioRuntime, { role: 'audio' });
  const poolEntry = audioProject.entries.find(({ path }) => path === 'animations/audio/cels.bin');
  poolEntry.bytes = new Uint8Array(32 * 1024 * 1024);
  const main = createAnimation({ width: 1, height: 1 });
  const withPixels = writeAnimationCel(main, main.frames[0].id, main.layers[0].id, document(1, 1, [1]));
  await assert.rejects(() => writePxdAnimation(audioProject, withPixels), /画素プール合計/);
  assert.equal(poolEntry.bytes.byteLength, 32 * 1024 * 1024);
  assert.equal(audioProject.entries.some(({ path }) => path === 'animations/main/state.json'), false);
});
