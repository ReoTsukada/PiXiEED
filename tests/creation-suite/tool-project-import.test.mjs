import test from 'node:test';
import assert from 'node:assert/strict';
import { importToolProject } from '../../js/creation/tool-project-import.mjs';
import { createPxdProject, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { writePxdDrawDocument, readPxdAudioState } from '../../js/creation/pxd-draw-audio.mjs';
import { readPxdImage } from '../../js/creation/pxd-project.mjs';
import { createAnimationFromDraw, addAnimationFrame } from '../../js/creation/animation-core.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
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
