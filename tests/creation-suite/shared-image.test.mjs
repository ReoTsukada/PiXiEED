import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, decodePxd, encodePxd, getPxdJson, setPxdBytes, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { createDrawDocument, documentRgba } from '../../js/creation/draw-core.mjs';
import { evaluateSharedCanvasPolicy } from '../../js/creation/shared-canvas-policy.mjs';
import { countSharedImageColors, prepareSharedCanvasImage } from '../../js/creation/shared-image.mjs';
import { imageToDrawDocument, putPxdDrawDocument, putPxdImage, putPxdSharedImage, readPxdDrawDocument, readPxdImage, readPxdSharedImage, pxdToolUrl } from '../../js/creation/pxd-project.mjs';

function image(width, height, colorCount = 1) {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const color = index % colorCount; rgba.set([color & 255, (color * 7) & 255, (color * 13) & 255, 255], index * 4);
  }
  return { width, height, rgba };
}

test('shared canvas policy has common free and pass boundaries and rejects legacy overage without unlock', () => {
  assert.deepEqual(evaluateSharedCanvasPolicy({ width: 128, height: 128, colorCount: 16 }), {
    supported: true, premiumContent: false, locked: false, reason: null, maxDimension: 128, maxColors: 16
  });
  const premium = evaluateSharedCanvasPolicy({ width: 144, height: 256, colorCount: 32 });
  assert.equal(premium.supported, true); assert.equal(premium.premiumContent, true); assert.equal(premium.locked, true); assert.equal(premium.reason, 'premium-required');
  const unlocked = evaluateSharedCanvasPolicy({ width: 144, height: 256, colorCount: 32 }, { passActive: true });
  assert.equal(unlocked.supported, true); assert.equal(unlocked.locked, false); assert.equal(unlocked.maxColors, 32);
  const legacy = evaluateSharedCanvasPolicy({ width: 512, height: 512, colorCount: 128 }, { passActive: true });
  assert.equal(legacy.supported, false); assert.equal(legacy.premiumContent, false); assert.equal(legacy.locked, false); assert.equal(legacy.reason, 'canvas-over-256px');
  assert.equal(evaluateSharedCanvasPolicy({ width: 128, height: 128, colorCount: 33 }, { passActive: true }).supported, false);
});

test('RGBA color counting includes alpha and supports bounded threshold checks', () => {
  const sample = { width: 3, height: 1, rgba: new Uint8Array([1, 2, 3, 0, 1, 2, 3, 1, 1, 2, 3, 0]) };
  assert.equal(countSharedImageColors(sample), 2); assert.equal(countSharedImageColors(sample, 1), 2);
  assert.throws(() => countSharedImageColors({ width: 1, height: 1, rgba: new Uint8Array(3) }), /寸法またはRGBA/);
});

test('photo preparation preserves aspect ratio, quantizes only the requested copy, and is deterministic', () => {
  const source = image(144, 256, 40); const before = new Uint8Array(source.rgba);
  const regular = prepareSharedCanvasImage(source);
  assert.equal(regular.image.width, 72); assert.equal(regular.image.height, 128); assert.equal(regular.colorCount, 16); assert.equal(regular.changed, true);
  assert.equal(regular.image.width / regular.image.height, source.width / source.height);
  const extended = prepareSharedCanvasImage(source, { passActive: true });
  assert.equal(extended.image.width, 144); assert.equal(extended.image.height, 256); assert.equal(extended.colorCount, 32);
  assert.deepEqual(prepareSharedCanvasImage(source, { passActive: true }).image.rgba, extended.image.rgba);
  const exactCanvas = prepareSharedCanvasImage(image(32, 20, 8), { passActive: true, width: 48, height: 40 });
  assert.equal(exactCanvas.image.width, 48); assert.equal(exactCanvas.image.height, 40);
  assert.equal(prepareSharedCanvasImage(image(32, 20, 8), { width: 48, height: 40 }).image.width, 48);
  assert.throws(() => prepareSharedCanvasImage(source, { width: 129, height: 128 }), /各辺128pxまで/);
  const rectangle = { width: 2, height: 1, rgba: new Uint8Array([220, 20, 30, 255, 20, 40, 220, 255]) };
  const contained = prepareSharedCanvasImage(rectangle, { passActive: true, width: 4, height: 4, fit: 'contain' }).image;
  assert.equal(contained.width, 4); assert.equal(contained.height, 4);
  assert.deepEqual([...contained.rgba.slice(0, 16)], Array(16).fill(0));
  assert.deepEqual([...contained.rgba.slice(48, 64)], Array(16).fill(0));
  assert.deepEqual([...contained.rgba.slice(16, 32)], [220, 20, 30, 255, 220, 20, 30, 255, 20, 40, 220, 255, 20, 40, 220, 255]);
  assert.deepEqual([...contained.rgba.slice(32, 48)], [...contained.rgba.slice(16, 32)]);
  assert.equal(contained.rgba.filter((value, index) => index % 4 === 3 && value > 0).length, 8);
  assert.equal(countSharedImageColors(contained), 3, 'transparent margins count toward the RGBA budget');
  const many = { width: 20, height: 1, rgba: new Uint8Array(20 * 4) };
  for (let x = 0; x < 20; x += 1) many.rgba.set([x * 10, 50, 100, 255], x * 4);
  const constrained = prepareSharedCanvasImage(many, { passActive: true, width: 20, height: 10, maxColors: 16, fit: 'contain' }).image;
  assert.ok(countSharedImageColors(constrained) <= 16);
  for (let y = 0; y < 10; y += 1) if (y !== 4) {
    for (let x = 0; x < 20; x += 1) {
      const offset = (y * 20 + x) * 4;
      assert.deepEqual([...constrained.rgba.slice(offset, offset + 4)], [0, 0, 0, 0]);
    }
  }
  assert.deepEqual(source.rgba, before);
  const alreadyFits = prepareSharedCanvasImage(image(64, 32, 8));
  assert.equal(alreadyFits.changed, false); assert.notEqual(alreadyFits.image.rgba, image(64, 32, 8).rgba);
  assert.deepEqual(alreadyFits.image.rgba, image(64, 32, 8).rgba);
});

test('schema-1 main images remain readable, then schema-2 shared writes preserve unknown parts without a color list', async () => {
  const original = image(16, 16, 4);
  let project = await putPxdImage(createPxdProject(), original);
  project = setPxdJson(project, 'future/state.json', { keep: { version: 9 } });
  project = setPxdBytes(project, 'future/opaque.bin', new Uint8Array([0, 13, 255]));
  assert.deepEqual((await readPxdSharedImage(project)).rgba, original.rgba);
  const shared = await putPxdSharedImage(project, original);
  const meta = getPxdJson(shared, 'images/main/meta.json');
  assert.equal(meta.schemaVersion, 2); assert.equal(meta.colorCount, 4); assert.equal(Object.hasOwn(meta, 'colors'), false);
  assert.deepEqual(shared.manifest.sharedCanvas, { schemaVersion: 1, imageRole: 'main', width: 16, height: 16, colorCount: 4 });
  assert.deepEqual(getPxdJson(shared, 'future/state.json'), { keep: { version: 9 } });
  assert.deepEqual(shared.entries.find(({ path }) => path === 'future/opaque.bin').bytes, new Uint8Array([0, 13, 255]));
  const reopened = await decodePxd(await encodePxd(shared));
  assert.deepEqual((await readPxdSharedImage(reopened)).rgba, original.rgba);
  assert.deepEqual((await readPxdImage(reopened)).rgba, original.rgba);
});

test('512px full-color schema-2 metadata stays compact and returned color IDs remain bounded', async () => {
  const width = 512; const height = 512; const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) rgba.set([index & 255, (index >>> 8) & 255, (index >>> 16) & 255, 255], index * 4);
  const project = await putPxdSharedImage(createPxdProject(), { width, height, rgba });
  const meta = getPxdJson(project, 'images/main/meta.json');
  assert.ok(new TextEncoder().encode(JSON.stringify(meta)).length < 4096); assert.equal(meta.colorCount, width * height);
  assert.equal(Object.hasOwn(meta, 'colors'), false);
  const loaded = await readPxdImage(project);
  assert.deepEqual(loaded.rgba, rgba); assert.equal(loaded.colorIds.length, 32); assert.equal(loaded.colorCount, width * height);
  assert.deepEqual((await readPxdSharedImage(project)).rgba, rgba);
  const falseLow = setPxdJson(project, 'images/main/meta.json', { ...meta, colorCount: 1 });
  await assert.rejects(readPxdImage(falseLow), /色数と画素/);
  const falseHigh = setPxdJson(project, 'images/main/meta.json', { ...meta, colorCount: width * height + 1 });
  await assert.rejects(readPxdImage(falseHigh), /色数と画素/);
});

test('schema-2 rejects wrong color counts and inconsistent shared markers', async () => {
  const source = image(16, 16, 3); const project = await putPxdSharedImage(createPxdProject(), source);
  const brokenMeta = setPxdJson(project, 'images/main/meta.json', { ...getPxdJson(project, 'images/main/meta.json'), colorCount: 4 });
  await assert.rejects(readPxdImage(brokenMeta), /色数と画素/);
  const brokenMarker = structuredClone(project); brokenMarker.manifest.sharedCanvas.width = 32;
  await assert.rejects(readPxdSharedImage(brokenMarker), /共通画像情報/);
});

test('new main Draw writes only shared RGBA and reads an indexed projection instead of stale legacy JSON', async () => {
  const document = createDrawDocument(16); document.pixels.fill(2);
  let project = await putPxdDrawDocument(createPxdProject(), document, 'main');
  assert.equal(project.entries.some(({ path }) => path === 'draw/state.json'), false);
  assert.deepEqual(project.entries.filter(({ path }) => path.endsWith('/pixels.rgba')).map(({ path }) => path), ['images/main/pixels.rgba']);
  const expected = documentRgba(document);
  assert.deepEqual((await readPxdSharedImage(project)).rgba, expected);
  const stale = createDrawDocument(16); stale.pixels.fill(4);
  project = setPxdJson(project, 'draw/state.json', stale);
  const projection = await readPxdDrawDocument(project, 'main');
  assert.deepEqual(documentRgba(projection), expected);
  assert.deepEqual(documentRgba(imageToDrawDocument(await readPxdSharedImage(project))), expected);
});

test('shared main Draw round-trips arbitrary supported rectangle dimensions', async () => {
  const document = { ...createDrawDocument(16), width: 144, height: 256, pixels: Array(144 * 256).fill(3) };
  const project = await putPxdDrawDocument(createPxdProject(), document, 'main');
  const image = await readPxdSharedImage(project);
  assert.equal(image.width, 144); assert.equal(image.height, 256);
  assert.deepEqual(documentRgba(await readPxdDrawDocument(project, 'main')), documentRgba(document));
});

test('legacy puzzle image roles retain indexed payloads and either spot side invalidates confirmation', async () => {
  const original = createDrawDocument(16); original.pixels[0] = 2;
  let project = await putPxdDrawDocument(createPxdProject(), original, 'spot-before');
  project = setPxdJson(project, 'puzzles/spot_difference.json', { confirmed: true, publication: 'draft', published: false, answer: { x: 0 } });
  const changed = structuredClone(original); changed.pixels[1] = 3;
  const edited = await putPxdDrawDocument(project, changed, 'spot-before');
  assert.equal(getPxdJson(edited, 'images/spot-before/meta.json').schemaVersion, 1);
  assert.equal(edited.entries.some(({ path }) => path === 'images/spot-before/draw.json'), true);
  const puzzle = getPxdJson(edited, 'puzzles/spot_difference.json');
  assert.equal(puzzle.confirmed, false); assert.equal(puzzle.sourceChanged, true); assert.deepEqual(puzzle.answer, { x: 0 });
});

test('PXD tool routing includes the camera entry', () => {
  const project = createPxdProject({ projectId: 'camera-project', revisionId: 'camera-r1' });
  assert.equal(pxdToolUrl('camera', project), '/pixel-camera.html?pxd=camera-project&pxdRevision=camera-r1');
});
