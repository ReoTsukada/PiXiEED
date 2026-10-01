import test from 'node:test';
import assert from 'node:assert/strict';
import { createPxdProject, getPxdJson, setPxdJson } from '../../js/creation/pxd-codec.mjs';
import { createMemoryPxdAdapter, createPxdStore } from '../../js/creation/pxd-store.mjs';
import { createProjectSession } from '../../js/creation/project-session.mjs';

function setup() {
  let revision = 0;
  const store = createPxdStore({ adapter: createMemoryPxdAdapter(), idFactory: () => `mode-r${++revision}` });
  let tool = 'draw';
  const model = {
    draw: { color: '#112233', activeLayer: 'ink' },
    audio: { tempo: 100, activeTrack: 'lead' }
  };
  const pathFor = (mode) => `${mode}/state.json`;
  const session = createProjectSession({ store,
    capture(project) {
      const captured = setPxdJson(project, pathFor(tool), model[tool]);
      captured.manifest = { ...captured.manifest, lastMode: tool,
        editorState: { ...captured.manifest.editorState, [tool]: { selection: tool } } };
      return captured;
    },
    apply(project) {
      model[tool] = getPxdJson(project, pathFor(tool));
      model[`${tool}Editor`] = project.manifest.editorState?.[tool] ?? null;
    }
  });
  return { store, session, model, get tool() { return tool; }, set tool(value) { tool = value; } };
}

test('switches Draw and Audio adapters on one session and retains the saved project identity', async () => {
  const env = setup();
  const initial = await env.store.save(createPxdProject({ projectId: 'mode-project', revisionId: 'mode-start',
    manifest: { title: '同じ作品', editorState: { draw: { selection: 'ink' }, audio: { selection: 'lead' } } },
    entries: [
      { path: 'draw/state.json', bytes: new TextEncoder().encode('{"color":"#112233","activeLayer":"ink"}') },
      { path: 'audio/state.json', bytes: new TextEncoder().encode('{"tempo":100,"activeTrack":"lead"}') }
    ]
  }), { expectedRevisionId: null });
  await env.session.initialize(initial, { persisted: true, apply: true });

  env.model.draw = { color: '#abcdef', activeLayer: 'shade' };
  env.session.markDirty();
  const afterDrawSave = await env.session.save();
  assert.equal(afterDrawSave.projectId, initial.projectId);

  // A workspace mode adapter switch adopts the same saved project into the new editor.
  env.tool = 'audio';
  await env.session.adopt(afterDrawSave, { persisted: true, apply: true });
  assert.equal(env.session.currentProject.projectId, initial.projectId);
  assert.equal(env.session.currentProject.revisionId, afterDrawSave.revisionId);
  assert.deepEqual(env.model.audioEditor, { selection: 'lead' });

  env.model.audio = { tempo: 128, activeTrack: 'bass' };
  env.session.markDirty();
  const afterAudioSave = await env.session.save();
  assert.equal(afterAudioSave.projectId, initial.projectId);
  assert.deepEqual(getPxdJson(afterAudioSave, 'draw/state.json'), { color: '#abcdef', activeLayer: 'shade' });
  assert.deepEqual(getPxdJson(afterAudioSave, 'audio/state.json'), { tempo: 128, activeTrack: 'bass' });
  assert.deepEqual(afterAudioSave.manifest.editorState, { draw: { selection: 'draw' }, audio: { selection: 'audio' } });
});

test('switching back to Draw restores its independent editor state without replacing Audio data', async () => {
  const env = setup();
  const initial = await env.store.save(createPxdProject({ projectId: 'mode-return', revisionId: 'return-start',
    manifest: { editorState: { draw: { selection: 'left' }, audio: { selection: 'bass' } } },
    entries: [
      { path: 'draw/state.json', bytes: new TextEncoder().encode('{"color":"red"}') },
      { path: 'audio/state.json', bytes: new TextEncoder().encode('{"tempo":90}') }
    ]
  }), { expectedRevisionId: null });
  await env.session.initialize(initial, { persisted: true, apply: true });
  env.tool = 'audio';
  await env.session.adopt(initial, { persisted: true, apply: true });
  env.model.audio = { tempo: 140 };
  env.session.markDirty();
  const audioSaved = await env.session.save();

  env.tool = 'draw';
  await env.session.adopt(audioSaved, { persisted: true, apply: true });
  assert.deepEqual(env.model.drawEditor, { selection: 'left' });
  assert.deepEqual(getPxdJson(env.session.currentProject, 'audio/state.json'), { tempo: 140 });
  assert.equal(env.session.currentProject.projectId, initial.projectId);
});
