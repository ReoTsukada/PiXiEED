import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clearToolOutputReturnId, readToolOutput, sanitizeOutputFilename, saveToolOutputFilename, saveToolOutputVariant, saveToolOutputItems, saveToolOutputMedia, sendToolOutput, sendToolOutputAfterSaving, stageToolOutput } from '../../js/creation/output-handoff.mjs';
import { shareOutputFile } from '../../js/creation/output-share.mjs';
import { resizeRgbaNearest } from '../../js/creation/output-render.mjs';
import { createPixelLensOutputOptions, preparePixelLensOutputRestore } from '../../js/pixel-lens/output-handoff.mjs';

class FakeTransaction {
  error = null;
  objectStore(name) { return new FakeObjectStore(this, this.database.stores.get(name)); }
  constructor(database) { this.database = database; }
  completeSoon() { queueMicrotask(() => this.oncomplete?.()); }
  failSoon(error) { queueMicrotask(() => { this.error = error; this.onabort?.(); }); }
}

class FakeObjectStore {
  constructor(transaction, rows) { this.transaction = transaction; this.rows = rows; }
  add(value) {
    const request = {};
    queueMicrotask(() => {
      if (this.rows.has(value.id)) { this.transaction.failSoon(new Error('duplicate key')); return; }
      this.rows.set(value.id, value); request.result = value.id; request.onsuccess?.(); this.transaction.completeSoon();
    });
    return request;
  }
  get(id) {
    const request = {};
    queueMicrotask(() => { request.result = this.rows.get(id); request.onsuccess?.(); this.transaction.completeSoon(); });
    return request;
  }
  put(value) {
    const request = {};
    queueMicrotask(() => { this.rows.set(value.id, value); request.result = value.id; request.onsuccess?.(); this.transaction.completeSoon(); });
    return request;
  }
  openCursor() {
    const request = {}; const entries = [...this.rows.entries()]; let index = 0;
    const step = () => queueMicrotask(() => {
      if (index >= entries.length) { request.result = null; request.onsuccess?.(); this.transaction.completeSoon(); return; }
      const [id, value] = entries[index];
      request.result = { value, delete: () => this.rows.delete(id), continue: () => { index++; step(); } };
      request.onsuccess?.();
    });
    step(); return request;
  }
}

class FakeDatabase {
  constructor(state) {
    this.stores = state;
    this.objectStoreNames = { contains: (name) => this.stores.has(name) };
  }
  createObjectStore(name) { this.stores.set(name, new Map()); }
  transaction() { return new FakeTransaction(this); }
  close() {}
}

class FakeIndexedDB {
  state = new Map();
  open() {
    const request = {};
    queueMicrotask(() => {
      const database = new FakeDatabase(this.state);
      request.result = database;
      if (!this.state.has('outputs')) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
}

const validId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function dependencies({ indexedDBRef = new FakeIndexedDB(), now = () => 1_000, id = validId } = {}) {
  const assigned = [];
  return {
    assigned,
    indexedDBRef,
    now,
    cryptoRef: { randomUUID: () => id },
    locationRef: { origin: 'https://pixieed.test', pathname: '/output-fixture.html', search: '', hash: '', assign: (url) => assigned.push(url) }
  };
}
function file(filename = 'my-art.png', type = 'image/png', contents = 'pixels') {
  return { blob: new Blob([contents], { type }), filename, returnUrl: '/draw/?pxd=local-id&pxdRevision=revision-id', metadata: { width: 16, height: 8 } };
}

test('filename settings preserve the original extension and remove path characters', () => {
  assert.equal(sanitizeOutputFilename('../My: art.png', 'png'), 'My- art.png');
  assert.equal(sanitizeOutputFilename('   ', 'gif'), 'pixieed-output.gif');
});

test('output data stays in IndexedDB and the route carries only an opaque id', async () => {
  const deps = dependencies();
  const staged = await stageToolOutput(file(), { ...deps, now: deps.now });
  assert.equal(staged.url, 'https://pixieed.test/output/work/?id=' + validId);
  assert.doesNotMatch(staged.url, /pixels|data:image|base64/);
  const first = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const duplicateTab = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(await first.blob.text(), 'pixels');
  assert.equal(await duplicateTab.blob.text(), 'pixels');
  assert.equal(first.returnUrl, '/draw/?pxd=local-id&pxdRevision=revision-id');
});

test('multiple output items and original RGBA sources persist independently without replacing the source file', async () => {
  const deps = dependencies();
  const frame = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128]) };
  await stageToolOutput({ ...file(), mediaSources: [{ id: 'art', label: '元の画像', kind: 'rgba-frames', frames: [frame] }] }, deps);
  const before = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const image = before.outputs[0];
  const jpeg = { id: 'jpeg', sourceId: 'art', mime: 'image/jpeg', extension: 'jpeg', filename: 'art-matte.jpeg', blob: new Blob(['jpeg bytes'], { type: 'image/jpeg' }), metadata: { width: 2, height: 1 } };
  const svg = { id: 'svg', sourceId: 'art', mime: 'image/svg+xml', extension: 'svg', filename: 'art.svg', blob: new Blob(['<svg/>'], { type: 'image/svg+xml' }), metadata: { width: 2, height: 1 } };
  await saveToolOutputItems(validId, [image, jpeg, svg], { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const reloaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(reloaded.outputs.length, 3);
  assert.deepEqual(reloaded.outputs.map((item) => item.extension), ['png', 'jpeg', 'svg']);
  assert.equal(reloaded.outputs[1].sourceId, 'art');
  assert.equal(reloaded.mediaSources[0].mediaSource.frames[0].data[7], 128);
  assert.equal(await reloaded.sourceBlob.text(), 'pixels');
});

test('explicit original pixel-size choice survives output-item persistence and reload', async () => {
  const deps = dependencies();
  await stageToolOutput(file(), deps);
  const loaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const original = { ...loaded.outputs[0], metadata: { width: 8, height: 8, outputWidth: 64, outputHeight: 64, pixelOriginChoice: 'original' } };
  const derivative = { ...loaded.outputs[0], id: 'pixel-derivative', filename: 'my-art-pixel.png', blob: new Blob(['pixel derivative'], { type: 'image/png' }), metadata: { width: 8, height: 8, outputWidth: 8, outputHeight: 8 } };
  await saveToolOutputItems(validId, [original, derivative], { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const reloaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(reloaded.outputs[0].metadata.pixelOriginChoice, 'original');
  assert.equal(reloaded.outputs[1].filename, 'my-art-pixel.png');
  assert.equal(await reloaded.sourceBlob.text(), 'pixels');
  const invalidChoice = { ...reloaded.outputs[0], metadata: { ...reloaded.outputs[0].metadata, pixelOriginChoice: 'pixel' } };
  await saveToolOutputItems(validId, [invalidChoice, reloaded.outputs[1]], { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const sanitized = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(sanitized.outputs[0].metadata.pixelOriginChoice, undefined, 'only the explicit original choice is accepted');
});

test('imported image frames, audio PCM and timeline settings survive reload without exposing payload in the URL', async () => {
  const deps = dependencies();
  const frames = [
    { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]), delayMs: 1000 / 24, name: 'first.png' },
    { width: 1, height: 1, data: new Uint8Array([0, 0, 255, 255]), delayMs: 800, name: 'second.jpg' }
  ];
  const channels = [new Float32Array([0, 0.25, -0.25, 0])];
  const staged = await stageToolOutput({
    ...file(), returnUrl: '/output/', mediaSettings: { playbackRate: 1.5, loopCount: 2 },
    mediaSources: [
      { id: 'local-images', label: '画像 (2コマ)', kind: 'rgba-frames', mediaSource: { kind: 'rgba-frames', width: 1, height: 1, frames, loopCount: 0 } },
      { id: 'local-audio', label: 'voice.wav', kind: 'audio-buffer', sampleRate: 8000, channels }
    ]
  }, deps);
  assert.equal(staged.url, `https://pixieed.test/output/work/?id=${validId}`);
  assert.doesNotMatch(staged.url, /first|second|voice|255|base64/);
  let loaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const staleRevision = loaded.revision;
  assert.equal(loaded.mediaSettings.playbackRate, 1.5);
  assert.equal(loaded.mediaSettings.totalPlays, 2, 'legacy loopCount settings migrate to normalized total plays');
  assert.equal(loaded.mediaSources[0].mediaSource.totalPlays, 0);
  assert.equal(loaded.mediaSources[0].mediaSource.frames[0].delayMs, 1000 / 24, 'fractional frame delays survive local persistence exactly');
  assert.equal(loaded.mediaSources[0].mediaSource.frames[1].name, 'second.jpg');
  assert.deepEqual([...loaded.mediaSources[1].channels[0]], [0, 0.25, -0.25, 0]);
  const savedMedia = await saveToolOutputMedia(validId, loaded.mediaSources, { playbackRate: 2, totalPlays: 3, musicTotalPlays: 2, musicSourceId: 'local-audio' }, { indexedDBRef: deps.indexedDBRef, now: deps.now, expectedRevision: staleRevision });
  assert.equal(savedMedia.revision, staleRevision + 1);
  await assert.rejects(saveToolOutputItems(validId, loaded.outputs, { indexedDBRef: deps.indexedDBRef, now: deps.now, expectedRevision: staleRevision }), /別のタブ/);
  loaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(loaded.mediaSettings.playbackRate, 2);
  assert.equal(loaded.mediaSettings.totalPlays, 3);
  assert.equal(loaded.mediaSettings.musicTotalPlays, 2);
  assert.equal(loaded.mediaSettings.musicSourceId, 'local-audio');
  assert.equal(loaded.mediaSources[0].mediaSource.frames[0].delayMs, 1000 / 24);
  assert.equal(loaded.outputs.length, 1, 'stale tab did not overwrite the latest output list');
  await assert.rejects(saveToolOutputMedia(validId, [loaded.mediaSources[1]], {}, { indexedDBRef: deps.indexedDBRef, now: deps.now }), /使っている素材/);
  loaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(loaded.mediaSources.length, 2, 'failed edit leaves the previous asset record intact');
});

test('video source Blobs and finite music-play settings survive local storage, while unsafe video records are rejected', async () => {
  const deps = dependencies();
  const video = new Blob(['local video bytes'], { type: 'video/webm' });
  await stageToolOutput({
    ...file(),
    mediaSettings: { musicTotalPlays: 4 },
    mediaSources: [{ id: 'local-video', label: 'clip.webm', kind: 'video-source', blob: video, mime: 'video/webm', width: 320, height: 180, durationSeconds: 2.5 }]
  }, deps);
  const loaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(loaded.mediaSettings.musicTotalPlays, 4);
  assert.equal(loaded.mediaSources[0].kind, 'video-source');
  assert.equal(loaded.mediaSources[0].blob.size, video.size);
  assert.equal(loaded.mediaSources[0].durationSeconds, 2.5);
  await assert.rejects(saveToolOutputMedia(validId, [{ ...loaded.mediaSources[0], durationSeconds: 120.1 }], {}, { indexedDBRef: deps.indexedDBRef, now: deps.now }), /動画素材/);
  const afterFailure = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(afterFailure.mediaSources[0].durationSeconds, 2.5, 'failed video edits preserve the stored source');
});

test('video staging limits aggregate source payloads instead of accepting eight maximum-size videos', async () => {
  const deps = dependencies();
  const sources = Array.from({ length: 3 }, (_, index) => ({
    id: `video-${index}`, label: `clip-${index}.webm`, kind: 'video-source',
    blob: { size: 64 * 1024 * 1024, type: 'video/webm', slice() {} },
    mime: 'video/webm', width: 320, height: 180, durationSeconds: 2
  }));
  await assert.rejects(stageToolOutput({ ...file(), mediaSources: sources }, deps), /素材の合計は128MB/);
});

test('output item validation rejects a mismatched extension without changing the saved set', async () => {
  const deps = dependencies(); await stageToolOutput(file(), deps);
  await assert.rejects(saveToolOutputItems(validId, [{ id: 'bad', sourceId: '', mime: 'image/png', extension: 'jpeg', filename: 'bad.jpeg', blob: new Blob(['png'], { type: 'image/png' }) }], { indexedDBRef: deps.indexedDBRef, now: deps.now }), /形式/);
  const loaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(loaded.outputs.length, 1); assert.equal(loaded.outputs[0].filename, 'my-art.png');
});

test('PXD project backups download directly from the editor and never navigate to the output page', async () => {
  for (const path of ['../../js/creation/pxd-ui.mjs', '../../js/creation/project-workspace.mjs']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /output-handoff\.mjs|sendToolOutput/);
    assert.match(source, /async function sendPxdBackup\(bytes, name\) \{\s*await download\(bytes, name\);\s*return false;/);
    assert.match(source, /const staged = await sendPxdBackup\(/);
    assert.match(source, /URL\.createObjectURL\(blob\).*?link\.download = name; link\.click\(\)/s, 'the project tool creates a local browser download');
  }
  const outputPage = readFileSync(new URL('../../js/creation/output-page.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(outputPage, /application\/octet-stream|pxd: 'application/);
  assert.match(outputPage, /source\?\.kind === 'legacy-file' && source\.extension === 'pxd'\) return \[\]/, 'older staged PXD records cannot enter media conversion');
  const workspace = readFileSync(new URL('../../js/creation/project-workspace.mjs', import.meta.url), 'utf8');
  const pxdUi = readFileSync(new URL('../../js/creation/pxd-ui.mjs', import.meta.url), 'utf8');
  assert.match(workspace, /const saveButton = button\('保存し直す'.*?await save\(\)/s);
  assert.match(pxdUi, /const saveButton = button\('プロジェクトを保存'.*?await save\(\)/s);
  for (const [path, pattern] of [
    ['../../js/creation/audio-page.mjs', /project-workspace\.mjs\?rev=20261006-header-controls-1/],
    ['../../js/creation/draw-page.mjs', /project-workspace\.mjs\?rev=20261007-draw-handoff-1/],
    ['../../js/creation/draw-page.mjs', /pxd-ui\.mjs\?rev=20261006-header-controls-1/],
    ['../../js/creation/hidden-object-page.mjs', /pxd-ui\.mjs\?rev=20261006-header-controls-1/],
    ['../../js/creation/jigsaw-page.mjs', /pxd-ui\.mjs\?rev=20261006-header-controls-1/],
    ['../../js/creation/spot-difference-page.mjs', /pxd-ui\.mjs\?rev=20261006-header-controls-1/],
    ['../../js/pixel-lens/app.mjs', /pxd-ui\.mjs\?rev=20261006-header-controls-1/]
  ]) assert.match(readFileSync(new URL(path, import.meta.url), 'utf8'), pattern, `${path} loads the direct-save PXD module revision`);
  const { OUTPUT_MIME_EXTENSIONS } = await import('../../js/creation/output-handoff.mjs');
  assert.equal(OUTPUT_MIME_EXTENSIONS['application/octet-stream'], undefined, 'PXD is not a generic shared output type');
  const deps = dependencies();
  await assert.rejects(stageToolOutput({ ...file('pixieed-project.pxd', 'application/octet-stream', 'PXD backup'), returnUrl: '/draw/' }, deps), /このファイル形式にはまだ対応していません/);
});

test('camera output return links carry only the opaque output id for local restoration', async () => {
  const deps = dependencies();
  const staged = await sendToolOutput({ ...file('capture.png'), source: 'ピクセルカメラ', returnOutputId: true }, deps);
  assert.equal(staged.ok, true);
  assert.equal(deps.assigned.length, 1);
  assert.match(deps.assigned[0], /^https:\/\/pixieed\.test\/output\/work\/\?id=/);
  assert.doesNotMatch(deps.assigned[0], /pixels|base64|data:image/);
  const restored = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(restored.returnUrl, `/draw/?pxd=local-id&pxdRevision=revision-id&outputId=${validId}`);
  assert.equal(await restored.sourceBlob.text(), 'pixels');
});

test('returnOutputId updates only the matching allowed browser history entry for cold restoration', async () => {
  const deps = dependencies();
  deps.locationRef.pathname = '/pixel-camera.html';
  deps.locationRef.search = '?from=globe';
  const historyCalls = [];
  deps.historyRef = { state: { camera: 'preserve' }, replaceState: (...args) => historyCalls.push(args) };
  const staged = await sendToolOutput({ ...file('capture.png'), returnUrl: '/pixel-camera.html?from=globe', returnOutputId: true }, deps);
  assert.equal(staged.ok, true);
  assert.deepEqual(historyCalls, [[{ camera: 'preserve' }, '', `/pixel-camera.html?from=globe&outputId=${validId}`]]);

  const nonMatching = dependencies({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });
  nonMatching.historyRef = { state: null, replaceState() { assert.fail('must not mutate a different editor history entry'); } };
  await sendToolOutput({ ...file('capture.png'), returnUrl: '/pixel-camera.html?from=globe', returnOutputId: true }, nonMatching);
});

test('explicit retake clears only outputId while preserving other query parameters and hash', () => {
  const calls = [];
  const locationRef = { origin: 'https://pixieed.test', pathname: '/pixel-camera.html', search: '?from=globe&outputId=old-id&mode=edit', hash: '#capture' };
  const historyRef = { state: { camera: 'preserve' }, replaceState: (...args) => calls.push(args) };
  assert.equal(clearToolOutputReturnId(locationRef, historyRef), true);
  assert.deepEqual(calls, [[{ camera: 'preserve' }, '', '/pixel-camera.html?from=globe&mode=edit#capture']]);

  locationRef.search = '?from=globe&mode=edit';
  assert.equal(clearToolOutputReturnId(locationRef, historyRef), false);
  assert.equal(calls.length, 1, 'an ordinary camera start leaves history untouched');
});

test('overlapping output gestures stage one record and issue one navigation', async () => {
  const deps = dependencies();
  let nextId = 0;
  deps.cryptoRef.randomUUID = () => `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${nextId++}`;
  const first = sendToolOutput(file('first.png'), deps);
  const duplicate = sendToolOutput(file('second.png'), deps);
  assert.equal(first, duplicate, 'the in-flight page handoff is shared');
  const [a, b] = await Promise.all([first, duplicate]);
  assert.equal(a.ok, true);
  assert.equal(b.id, a.id);
  assert.equal(deps.assigned.length, 1);
  assert.equal(deps.indexedDBRef.state.get('outputs').size, 1);
});

test('PiXiEELENS GIF output uses its real options builder and restores all animation frames locally', async () => {
  const deps = dependencies();
  const gifFrames = [
    { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) },
    { width: 2, height: 1, data: new Uint8ClampedArray([0, 0, 255, 255, 255, 255, 0, 255]) }
  ];
  gifFrames.fps = 20;
  const options = createPixelLensOutputOptions({
    blob: new Blob(['gif bytes'], { type: 'image/gif' }), filename: 'lens.gif', returnUrl: '/pixel-camera.html?from=globe',
    frame: gifFrames.at(-1), gifFrames, outputScale: 3,
    settings: { ratio: '3:4', size: 128, colorDepth: '16', paletteMode: 'source', gradientMode: 'dither',
      ditherPattern: 'net8', surfaceSimplify: 55, zoom: 2, miniature: true, facing: 'user',
      camera: { brightness: 4, contrast: -8 }, customLook: 'look_01' }
  });
  assert.equal(options.returnOutputId, true);
  assert.equal(options.source, 'ドット絵カメラ');
  assert.equal(options.mediaSource.kind, 'gif-frames');
  const staged = await sendToolOutput(options, deps);
  assert.equal(staged.ok, true);
  assert.equal(deps.assigned.length, 1);
  assert.match(deps.assigned[0], /^https:\/\/pixieed\.test\/output\/work\/\?id=/);
  assert.doesNotMatch(deps.assigned[0], /gif bytes|data:image|base64/);
  const entry = await readToolOutput(staged.id, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const restored = preparePixelLensOutputRestore(entry);
  assert.equal(restored.kind, 'gif');
  assert.equal(restored.filename, 'lens.gif');
  assert.equal(restored.delayMs, 50);
  assert.equal(restored.frames.length, 2);
  assert.deepEqual([...restored.frames[0].data], [...gifFrames[0].data]);
  assert.deepEqual([...restored.frames[1].data], [...gifFrames[1].data]);
  assert.equal(restored.settings.ratio, '3:4');
  assert.equal(restored.settings.size, 128);
  assert.equal(restored.settings.colorDepth, '16');
  assert.equal(restored.settings.camera.contrast, -8);
  assert.equal(restored.settings.customLook, 'look_01');
  assert.equal(entry.returnUrl, `/pixel-camera.html?from=globe&outputId=${staged.id}`);
});

test('invalid PiXiEELENS GIF return data leaves an existing capture untouched', () => {
  const previousCapture = { id: 'unrelated-capture', width: 12, height: 8 };
  let currentCapture = previousCapture;
  const brokenEntry = {
    source: 'ドット絵カメラ', mime: 'image/gif', sourceFilename: 'lens.gif',
    sourceBlob: new Blob(['gif'], { type: 'image/gif' }),
    metadata: { width: 2, height: 1, defaultScale: 1 },
    mediaSource: { kind: 'gif-frames', width: 2, height: 1, loopCount: 0,
      frames: [{ width: 2, height: 1, data: new Uint8Array([1, 2]), delayMs: 50 }, { width: 2, height: 1, data: new Uint8Array(8), delayMs: 50 }] }
  };
  assert.throws(() => { currentCapture = preparePixelLensOutputRestore(brokenEntry); }, /GIF/);
  assert.equal(currentCapture, previousCapture);
  assert.throws(() => preparePixelLensOutputRestore({ ...brokenEntry, source: '別のツール' }), /撮影データ/);
});

test('PiXiEELENS PNG return keeps its original file and validated capture dimensions', async () => {
  const deps = dependencies();
  const frame = { width: 16, height: 8, data: new Uint8ClampedArray(16 * 8 * 4) };
  const options = createPixelLensOutputOptions({
    blob: new Blob(['png bytes'], { type: 'image/png' }), filename: 'lens.png', returnUrl: '/pixel-camera.html', frame, outputScale: 4,
    settings: { ratio: '16:9', size: 256, colorDepth: 'gray', paletteMode: 'gameboy', facing: 'environment', camera: { brightness: 12 } }
  });
  const staged = await sendToolOutput(options, deps);
  const entry = await readToolOutput(staged.id, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const restored = preparePixelLensOutputRestore(entry);
  assert.equal(restored.kind, 'png');
  assert.equal(restored.blob, entry.sourceBlob);
  assert.equal(restored.width, 16);
  assert.equal(restored.height, 8);
  assert.equal(restored.scale, 4);
  assert.equal(restored.settings.colorDepth, 'gray');
  assert.equal(restored.settings.camera.brightness, 12);
});

test('expired entries fail clearly and are not consumed by a read', async () => {
  const deps = dependencies(); let now = 1_000;
  await stageToolOutput(file(), { ...deps, now: () => now, ttlMs: 60_000 });
  now = 61_001;
  await assert.rejects(readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: () => now }), /期限切れ/);
  assert.equal(deps.indexedDBRef.state.get('outputs').has(validId), true);
});

test('missing entries fail without affecting the editing page', async () => {
  await assert.rejects(readToolOutput(validId, { indexedDBRef: new FakeIndexedDB() }), /見つかりません/);
});

test('unsupported types and unsafe return paths are rejected before storage', async () => {
  const deps = dependencies();
  await assert.rejects(stageToolOutput(file('art.jpg', 'image/jpeg'), deps), /まだ対応していません/);
  await assert.rejects(stageToolOutput(file('backup.jpg', 'application/octet-stream'), deps), /まだ対応していません/);
  await assert.rejects(stageToolOutput({ ...file(), returnUrl: '//other.example/' }, deps), /戻り先/);
  assert.equal(deps.indexedDBRef.state.has('outputs'), false);
});

test('storage failure returns control so the caller can use its original save action', async () => {
  const deps = dependencies({ indexedDBRef: null });
  const result = await sendToolOutput(file(), deps);
  assert.equal(result.ok, false);
  assert.equal(deps.assigned.length, 0);
});

test('large files are accepted without a fixed application size cap', async () => {
  const deps = dependencies();
  const large = file('large-art.png', 'image/png', 'x'.repeat(2 * 1024 * 1024));
  const staged = await stageToolOutput(large, deps);
  const read = await readToolOutput(staged.id, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(read.blob.size, 2 * 1024 * 1024);
});

test('GIF with oversized optional frame data still reaches the shared page unchanged', async () => {
  const deps = dependencies();
  const mediaSource = { kind: 'gif-frames', frames: Array.from({ length: 601 }, () => ({ width: 1, height: 1, data: new Uint8Array([0, 0, 0, 255]), delayMs: 20 })), loopCount: 0 };
  const staged = await stageToolOutput({ ...file('large-animation.gif', 'image/gif'), mediaSource }, deps);
  const loaded = await readToolOutput(staged.id, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(await loaded.blob.text(), 'pixels');
  assert.equal(loaded.mediaSource, null);
});

test('rendered variants and names survive reload while the original remains recoverable', async () => {
  const deps = dependencies();
  await stageToolOutput(file(), deps);
  const rendered = new Blob(['new-pixels'], { type: 'image/png' });
  await saveToolOutputVariant(validId, rendered, { width: 2, height: 1, scale: 3 }, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  await saveToolOutputFilename(validId, 'edited-art.png', { indexedDBRef: deps.indexedDBRef, now: deps.now });
  const loaded = await readToolOutput(validId, { indexedDBRef: deps.indexedDBRef, now: deps.now });
  assert.equal(await loaded.blob.text(), 'new-pixels');
  assert.equal(await loaded.sourceBlob.text(), 'pixels');
  assert.equal(loaded.filename, 'edited-art.png');
  assert.equal(loaded.metadata.scale, 3);
});

test('native share starts synchronously and a user cancellation preserves the output', async () => {
  let called = false;
  const resultPromise = shareOutputFile({ name: 'art.png' }, { navigatorRef: { canShare: () => true, share() { called = true; return Promise.reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })); } } });
  assert.equal(called, true, 'share is invoked before control leaves the click handler');
  assert.equal((await resultPromise).status, 'cancelled');
});

test('native share failures keep ordinary save available', async () => {
  const result = await shareOutputFile({ name: 'art.png' }, { navigatorRef: { canShare: () => true, share: () => Promise.reject(new Error('blocked')) } });
  assert.equal(result.status, 'failed');
  assert.equal((await shareOutputFile({ name: 'art.png' }, { navigatorRef: {} })).status, 'unavailable');
});

test('output handoff waits for pending editor autosave and uses the updated return URL', async () => {
  const calls = [];
  const indexedDBRef = new FakeIndexedDB();
  const outputLocation = { origin: 'https://example.test', assigned: '', assign(url) { this.assigned = url; } };
  const workspace = {
    dirty: true,
    currentProject: { projectId: 'project', revisionId: 'old' },
    async assertCanSave() { calls.push('authorize'); },
    async save() {
      calls.push('save'); this.dirty = false;
      this.currentProject = { projectId: 'project', revisionId: 'new' };
    }
  };
  const result = await sendToolOutputAfterSaving({
    blob: new Blob(['pixels'], { type: 'image/png' }), filename: 'art.png',
    returnUrl: () => `/draw/?pxd=project&pxdRevision=${workspace.currentProject.revisionId}`
  }, workspace, () => true, {
    indexedDBRef, cryptoRef: { randomUUID: () => validId }, locationRef: outputLocation,
    now: () => 1000, ttlMs: 60_000
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['authorize', 'save']);
  assert.match(outputLocation.assigned, /^https:\/\/example\.test\/output\/work\/\?id=/);
  const record = await readToolOutput(result.id, { indexedDBRef, now: () => 1000 });
  assert.equal(record.returnUrl, '/draw/?pxd=project&pxdRevision=new');
});

test('output handoff stays on the editor and reports save failure so the caller can use its direct-save fallback', async () => {
  const outputLocation = { origin: 'https://example.test', assigned: '', assign(url) { this.assigned = url; } };
  const result = await sendToolOutputAfterSaving({
    blob: new Blob(['pixels'], { type: 'image/png' }), filename: 'art.png', returnUrl: '/draw/'
  }, {
    dirty: true,
    async assertCanSave() {},
    async save() { throw new Error('quota'); }
  }, () => true, {
    indexedDBRef: new FakeIndexedDB(), cryptoRef: { randomUUID: () => validId }, locationRef: outputLocation,
    now: () => 1000, ttlMs: 60_000
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'project_save_failed');
  assert.equal(outputLocation.assigned, '');
});

test('nearest-neighbor exact resizing retains source alpha and does not mutate the source', () => {
  const frame = { width: 2, height: 1, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0]) };
  const resized = resizeRgbaNearest(frame, 4, 2);
  assert.deepEqual([resized.width, resized.height], [4, 2]);
  assert.deepEqual([...resized.data.slice(0, 8)], [255, 0, 0, 255, 255, 0, 0, 255]);
  assert.deepEqual([...resized.data.slice(-4)], [0, 255, 0, 0]);
  assert.equal(frame.data.length, 8);
  assert.throws(() => resizeRgbaNearest(frame, 9000, 1), /上限/);
});
