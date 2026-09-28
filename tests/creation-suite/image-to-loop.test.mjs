import test from 'node:test';
import assert from 'node:assert/strict';
import { hashCanonical } from '../../js/creation/asset-contract.mjs';
import { DRAW_PALETTE, createDrawDocument } from '../../js/creation/draw-core.mjs';
import { imageToLoop, IMAGE_TO_LOOP_MAX_NOTES, IMAGE_TO_LOOP_MAX_VELOCITY, IMAGE_TO_LOOP_PPQ, IMAGE_TO_LOOP_RULES_VERSION } from '../../js/creation/image-to-loop.mjs';

const localAsset = async (document, overrides = {}) => ({
  schemaVersion: 1, assetId: 'asset-local-01', revisionId: 'revision-01', contentHash: await hashCanonical(document),
  hashScheme: 'sha256-canonical-v1', kind: 'pixel_art',
  source: { type: 'hand_drawn', assetId: null, revisionId: null },
  owner: { type: 'local', id: 'local-owner' }, visibility: 'draft', reusePermission: 'owner_only',
  ...overrides
});
const makeDoc = (palette, pixels) => ({ schemaVersion: 1, width: 16, height: 16, palette, pixels });
const localSeed = async (document, overrides = {}, actorId = 'local-owner') => imageToLoop({ asset: await localAsset(document, overrides), document, actorId });

test('transparent pixels yield a valid silent loop with fixed revision and hash scheme reference', async () => {
  const source = makeDoc(['#ff0000'], Array(256).fill(-1));
  const seed = await localSeed(source);
  assert.equal(seed.rulesVersion, IMAGE_TO_LOOP_RULES_VERSION);
  assert.equal(seed.ticksPerQuarter, IMAGE_TO_LOOP_PPQ);
  assert.equal(seed.loopTicks, 1920);
  assert.deepEqual(seed.source, { assetId: 'asset-local-01', revisionId: 'revision-01', contentHash: await hashCanonical(source), hashScheme: 'sha256-canonical-v1' });
  assert.equal(seed.tracks.reduce((sum, track) => sum + track.notes.length, 0), 0);
});

test('single-color and grayscale inputs map deterministically to bounded chip notes', async () => {
  const solidDoc = makeDoc(['#d02020'], Array(256).fill(0));
  const solid = await localSeed(solidDoc);
  const notes = solid.tracks.flatMap((track) => track.notes);
  assert.equal(notes.length, 1);
  assert.equal(solid.tracks.find((track) => track.notes.length).instrument, 'square');
  assert.deepEqual(solid.suggestedColors, { square: '#d02020' });
  assert.deepEqual(notes[0], { noteId: 'seed-note-01', startTick: 0, durationTicks: 480, pitch: 48, velocity: 112 });
  assert.deepEqual(solid, await localSeed(solidDoc));

  const gray = await localSeed(makeDoc(['#777777'], Array(256).fill(0)));
  assert.equal(gray.tracks.find((track) => track.notes.length).instrument, 'triangle');
  assert.deepEqual(gray.tracks.flatMap((track) => track.notes)[0], { noteId: 'seed-note-01', startTick: 720, durationTicks: 480, pitch: 52, velocity: 112 });
});

test('late-slot notes are shortened so their end never exceeds the loop boundary', async () => {
  const seed = await localSeed(makeDoc(['#ff0040'], Array(256).fill(0)));
  const note = seed.tracks.flatMap((track) => track.notes)[0];
  assert.equal(note.startTick, 1680);
  assert.equal(note.durationTicks, 240);
  assert.ok(note.startTick + note.durationTicks <= seed.loopTicks);
});

test('equal-area colors use canonical RGBA order and stable integer Tick positions', async () => {
  const pixels = Array(256).fill(-1);
  pixels[0] = 1; pixels[1] = 0;
  const doc = makeDoc(['#0000ff', '#ff0000'], pixels);
  const seed = await localSeed(doc);
  assert.deepEqual(seed, await localSeed(doc));
  const allNotes = seed.tracks.flatMap((track) => track.notes);
  assert.equal(allNotes.length, 2);
  assert.deepEqual(seed.tracks.find((track) => track.instrument === 'sawtooth').notes[0], { noteId: 'seed-note-01', startTick: 1200, durationTicks: 240, pitch: 55, velocity: 80 });
  assert.deepEqual(seed.tracks.find((track) => track.instrument === 'square').notes[0], { noteId: 'seed-note-02', startTick: 0, durationTicks: 240, pitch: 48, velocity: 80 });
  assert.ok(allNotes.every((note) => Number.isInteger(note.startTick) && Number.isInteger(note.durationTicks) && note.startTick >= 0 && note.startTick < seed.loopTicks));
  assert.ok(allNotes.every((note) => note.velocity <= IMAGE_TO_LOOP_MAX_VELOCITY));
});

test('fully transparent swatches add no area while partially transparent pixels count as visible area', async () => {
  const pixels = Array(256).fill(-1);
  pixels[0] = 0; pixels[1] = 1;
  const seed = await localSeed(makeDoc(['#ff000000', '#0000ff80'], pixels));
  const notes = seed.tracks.flatMap((track) => track.notes);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].velocity, 112);
  assert.equal(notes[0].durationTicks, 480);
  assert.equal(seed.tracks.find((track) => track.notes.length).instrument, 'sawtooth');
});

test('128-color artwork is capped at 32 notes, four instruments, and fixed velocity limits', async () => {
  const palette = Array.from({ length: 128 }, (_, index) => `#${index.toString(16).padStart(2, '0')}20${(255 - index).toString(16).padStart(2, '0')}`);
  const pixels = Array.from({ length: 256 }, (_, index) => index % palette.length);
  const seed = await localSeed(makeDoc(palette, pixels));
  const notes = seed.tracks.flatMap((track) => track.notes);
  assert.equal(seed.tracks.length, 4);
  assert.equal(notes.length, IMAGE_TO_LOOP_MAX_NOTES);
  assert.ok(notes.every((note) => note.velocity >= 48 && note.velocity <= IMAGE_TO_LOOP_MAX_VELOCITY));
  assert.ok(notes.every((note) => note.durationTicks >= 120 && note.durationTicks <= 480));
  assert.ok(notes.every((note) => [0, 2, 4, 7, 9].includes(note.pitch % 12)));
});

test('only this device local draft can seed music; public works remain unavailable regardless of reuse permission', async () => {
  const doc = makeDoc(DRAW_PALETTE, Array(256).fill(0));
  await assert.rejects(localSeed(doc, {}, 'another-maker'), /自分の端末に保存した画像だけ/);
  const published = await localAsset(doc, { visibility: 'published', owner: { type: 'account', id: 'owner-1' }, reusePermission: 'derivative_allowed' });
  await assert.rejects(imageToLoop({ asset: published, document: doc, actorId: 'visitor' }), /自分の端末に保存した画像だけ/);
  await assert.rejects(imageToLoop({ asset: { ...published, reusePermission: 'playable' }, document: doc, actorId: 'visitor' }), /自分の端末に保存した画像だけ/);
  await assert.rejects(imageToLoop({ asset: { ...published, reusePermission: 'future' }, document: doc, actorId: 'visitor' }), /Unknown asset/);
});

test('a fixed local camera handoff seed retains camera provenance without copying image pixels', async () => {
  const doc = makeDoc(['#315a88'], Array(256).fill(0));
  const cameraAsset = await localAsset(doc, { kind: 'pixel_camera', source: { type: 'pixel_camera', assetId: null, revisionId: null } });
  const seed = await imageToLoop({ asset: cameraAsset, document: doc, actorId: 'local-owner' });
  assert.equal(seed.source.assetId, cameraAsset.assetId);
  assert.equal(Object.hasOwn(seed, 'pixels'), false);
  await assert.rejects(imageToLoop({ asset: { ...cameraAsset, owner: { type: 'account', id: 'someone-else' }, visibility: 'published', reusePermission: 'derivative_allowed' }, document: doc, actorId: 'local-owner' }), /自分の端末に保存した画像だけ/);
});

test('invalid image documents and unverified or non-image assets fail closed', async () => {
  const badDoc = { ...createDrawDocument(), pixels: [0] };
  await assert.rejects(localSeed(badDoc), /画素データが壊れています/);
  const validDoc = createDrawDocument();
  await assert.rejects(localSeed(validDoc, { contentHash: null }), /Only legacy file hashes/);
  await assert.rejects(localSeed(validDoc, { kind: 'song' }), /画像作品だけ/);
  await assert.rejects(localSeed(validDoc, { visibility: 'pending' }), /自分の端末に保存した画像だけ/);
});

test('canonical hash must match the supplied fixed document; file-byte hashes are deferred', async () => {
  const fixedDocument = makeDoc(['#ff0000'], [0, ...Array(255).fill(-1)]);
  const differentDocument = makeDoc(['#0000ff'], [0, ...Array(255).fill(-1)]);
  const fixedAsset = await localAsset(fixedDocument);
  await assert.rejects(imageToLoop({ asset: fixedAsset, document: differentDocument, actorId: 'local-owner' }), /固定版hashと画像編集データが一致しません/);

  const fileHashAsset = await localAsset(fixedDocument, { hashScheme: 'sha256-file-v1', contentHash: 'b'.repeat(64) });
  await assert.rejects(imageToLoop({ asset: fileHashAsset, document: fixedDocument, actorId: 'local-owner' }), /画像ファイルhashでは文書の固定版を検証できません/);
});

test('song seed retains source metadata and at most four visible color hints without copying pixels or the full palette', async () => {
  const source = makeDoc(['#e75445', '#4c82c3'], [0, ...Array(255).fill(-1)]);
  const originalPixels = [...source.pixels]; const originalPalette = [...source.palette];
  const seed = await localSeed(source);
  assert.deepEqual(source.pixels, originalPixels);
  assert.deepEqual(source.palette, originalPalette);
  assert.equal(Object.hasOwn(seed, 'pixels'), false);
  assert.equal(Object.hasOwn(seed, 'palette'), false);
  assert.deepEqual(seed.suggestedColors, { square: '#e75445' });
  assert.equal(Object.keys(seed.suggestedColors).length <= 4, true);
  assert.equal(seed.source.contentHash, await hashCanonical(source));
});
