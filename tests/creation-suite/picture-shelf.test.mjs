import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLocalDraftStore, createMemoryDraftAdapter } from '../../js/creation/local-drafts.mjs';
import { createDrawDocument } from '../../js/creation/draw-core.mjs';
import { PICTURE_TOOLS, bringPicture, listBringable, listOwnVersions, pictureDraftId, savePicture } from '../../js/creation/picture-shelf.mjs';

function memoryStorage() { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) }; }
const drawing = (colour) => { const document = createDrawDocument(16); document.pixels[5] = colour; return document; };
let counter = 0; const newId = () => `id-${++counter}`;

async function setup() {
  const adapter = createMemoryDraftAdapter(); const storage = memoryStorage();
  const store = createLocalDraftStore(adapter, { idFactory: newId });
  return { adapter, storage, store };
}

test('each tool keeps its own picture; editing one never changes another', async () => {
  const { adapter, storage, store } = await setup();
  await savePicture('draw', drawing(2), { adapter, store, storage, newId });
  const [entry] = await listBringable('spot-difference', { adapter, storage });
  assert.equal(entry.tool, 'draw');
  const brought = await bringPicture('spot-difference', entry, { adapter, store, storage, newId });
  assert.notEqual(brought.draftId, pictureDraftId('draw', { storage }), 'the picture is copied into the tool\'s own draft');
  assert.equal(brought.revision.asset.source.type, 'local_draft_copy');
  assert.equal(brought.revision.asset.source.revisionId, entry.revision.revisionId);

  await savePicture('draw', drawing(3), { adapter, store, storage, newId });
  const spot = await listOwnVersions('spot-difference', { adapter, storage });
  assert.equal(spot.versions.length, 1);
  assert.equal(spot.versions[0].document.pixels[5], 2, 'later edits in かんたんドット do not reach 間違い探し');
  const draw = await listOwnVersions('draw', { adapter, storage });
  assert.equal(draw.versions.length, 2, 'bringing only reads the other tool\'s picture');
});

test('every tool can bring every other tool\'s newest picture, and an identical one is not offered again', async () => {
  const { adapter, storage, store } = await setup();
  await savePicture('hidden-object', drawing(4), { adapter, store, storage, newId });
  await savePicture('jigsaw', drawing(5), { adapter, store, storage, newId });
  const forDraw = await listBringable('draw', { adapter, storage });
  assert.deepEqual(forDraw.map((e) => e.tool).sort(), ['hidden-object', 'jigsaw']);
  const [first] = forDraw;
  await bringPicture('draw', first, { adapter, store, storage, newId });
  const again = await listBringable('draw', { adapter, storage });
  assert.ok(!again.some((e) => e.revision.documentHash === first.revision.documentHash), 'what the tool already has is not offered again');
  const forAudio = await listBringable('audio', { adapter, storage });
  assert.deepEqual(forAudio.map((e) => e.tool).sort(), ['draw', 'jigsaw'], 'a tool without a picture of its own sees every tool\'s picture, identical ones once');
});

test('bringing twice makes two versions, so 間違い探し can compare them', async () => {
  const { adapter, storage, store } = await setup();
  await savePicture('draw', drawing(2), { adapter, store, storage, newId });
  await bringPicture('spot-difference', (await listBringable('spot-difference', { adapter, storage }))[0], { adapter, store, storage, newId });
  await savePicture('draw', drawing(6), { adapter, store, storage, newId });
  await bringPicture('spot-difference', (await listBringable('spot-difference', { adapter, storage }))[0], { adapter, store, storage, newId });
  const { versions } = await listOwnVersions('spot-difference', { adapter, storage });
  assert.deepEqual(versions.map((v) => v.document.pixels[5]), [2, 6]);
});

test('the tools read their own pictures, not かんたんドット\'s', () => {
  assert.deepEqual(Object.keys(PICTURE_TOOLS).sort(), ['draw', 'hidden-object', 'jigsaw', 'spot-difference']);
  for (const [file, tool] of [['spot-difference-page.mjs', 'spot-difference'], ['hidden-object-page.mjs', 'hidden-object'], ['jigsaw-page.mjs', 'jigsaw']]) {
    const source = readFileSync(new URL(`../../js/creation/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /simple-draw\.last-draft/, `${file} no longer reads the Draw picture directly`);
    assert.match(source, /mountPictureShelf\(/, `${file} offers the shelf`); assert.match(source, new RegExp(`tool: '${tool}'`));
  }
  for (const page of ['draw', 'audio', 'jigsaw', 'spot-difference', 'hidden-object']) {
    assert.match(readFileSync(new URL(`../../${page}/index.html`, import.meta.url), 'utf8'), /id="[a-z-]+-shelf"/, `${page} has a shelf`);
  }
});
