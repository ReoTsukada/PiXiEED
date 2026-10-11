import test from 'node:test';
import assert from 'node:assert/strict';
import { importToolProject } from '../../js/creation/tool-project-import.mjs';
import { createPxdProject, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { writePxdDrawDocument, readPxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { readPxdImage } from '../../js/creation/pxd-project.mjs';
import { createAnimation, createAnimationFromDraw, addAnimationFrame, writeAnimationCel, composeAnimationFrame } from '../../js/creation/animation-core.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
import { createAudioSong } from '../../js/creation/audio-core.mjs';
import { prepareAudioAnimationImport, validateAudioAnimationBinding } from '../../js/creation/audio-animation.mjs';
import { writePxdAudioState, readPxdAudioLink } from '../../js/creation/pxd-draw-audio.mjs';
const document = { schemaVersion: 1, width: 16, height: 16, palette: ['#ef6251'], pixels: Array(256).fill(-1) }; document.pixels[4] = 0;
async function drawing() {
  let project = await writePxdDrawDocument(createPxdProject({ manifest: { toolProject: { tool: 'draw', schemaVersion: 1 }, lastMode: 'draw' } }), document);
  return writePxdAnimation(project, addAnimationFrame(createAnimationFromDraw(document)));
}
test('an empty Music destination can import a drawing and all frames as a new independent project', async () => {
  const source = await drawing(), before = structuredClone(source);
  const imported = await importToolProject(source, 'audio');
  assert.notEqual(imported.projectId, source.projectId); assert.equal(imported.manifest.toolProject.tool, 'audio');
  assert.equal((await readPxdAnimation(imported, 'audio')).frames.length, 2);
  assert.equal(readPxdAudioState(imported).tempo, 120);
  assert.deepEqual((await readPxdImage(imported, 'audio')).rgba, (await readPxdImage(source, 'main')).rgba);
  assert.deepEqual(source, before);
});
test('puzzle import uses the chosen picture rather than an unrelated puzzle in a legacy bundle', async () => {
  const source = setPxdJson(await drawing(), 'puzzles/jigsaw.json', { obsolete: true });
  const imported = await importToolProject(source, 'jigsaw');
  assert.equal(imported.entries.some(({ path }) => path === 'puzzles/jigsaw.json'), false);
  assert.equal(source.entries.some(({ path }) => path === 'puzzles/jigsaw.json'), true);
  assert.deepEqual((await readPxdImage(imported)).rgba, (await readPxdImage(source)).rgba);
});


test('music import starts on the frame selected in Draw without changing the source selection', async () => {
  const source = await drawing();
  const animation = await readPxdAnimation(source, 'main');
  const frameId = animation.frames[1].id;
  source.manifest.editorState = { draw: { frameId, layerId: animation.layers[0].id } };
  const before = structuredClone(source);
  const imported = await importToolProject(source, 'audio');
  assert.equal(imported.manifest.editorState.audio.frameId, frameId);
  assert.equal(imported.manifest.editorState.audio.layerId, undefined);
  assert.deepEqual(source, before);
});

test('standalone Audio import preserves compressed shared-animation frame timing', async () => {
  const width = 32; const height = 16;
  const palette = ['#ef6251'];
  let animation = createAnimation({ width, height, palette });
  const first = animation.frames[0]; const layer = animation.layers[0];
  const cel = { width, height, palette, pixels: new Uint8Array(width * height) };
  cel.pixels[4 * width + 7] = 1;
  animation = writeAnimationCel(animation, first.id, layer.id, cel);
  animation = addAnimationFrame(animation);
  const timing = { rulesVersion:'loop-ratio-v1', ticksPerFrame:1920 };
  const seed = prepareAudioAnimationImport(createAudioSong({ songId:'compressed-import', loopTicks:3840 }), animation, {
    colorToSlot:{ 'rgba-ef6251ff':'square' }, timing
  });
  const composed = composeAnimationFrame(animation, animation.frames[0].id);
  const drawDocument = { schemaVersion:1, width, height, palette, pixels:Array.from(composed.pixels) };
  let source = await writePxdDrawDocument(createPxdProject({ manifest:{ toolProject:{ tool:'draw', schemaVersion:1 }, lastMode:'draw' } }), drawDocument);
  source = await writePxdAnimation(source, animation, { role:'main' });
  source = await writePxdAudioState(source, seed.song, { link:seed.link, animation });
  source = await writePxdAnimation(source, animation, { role:'audio' });

  const imported = await importToolProject(source, 'audio');
  const importedSong = readPxdAudioState(imported);
  const importedLink = readPxdAudioLink(imported);
  const importedAnimation = await readPxdAnimation(imported, 'audio');
  assert.deepEqual(importedLink.timing, {
    ...timing, frameOffsets:[0, 1920]
  });
  validateAudioAnimationBinding(importedSong, importedAnimation, importedLink);
  assert.equal(importedSong.loopTicks, 3840);
  assert.equal(importedLink.sequenceTicks, 3840);
  assert.deepEqual(source.manifest.toolProject, { tool:'draw', schemaVersion:1 });
});
