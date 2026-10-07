import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { addAnimationFrame, addAnimationLayer } from '../../js/creation/animation-core.mjs';

const blank = () => ({ schemaVersion: 1, width: 2, height: 2, palette: ['#101010', '#ff7777'], pixels: Array(4).fill(-1) });

test('session handoff preserves undo and redo selections for every animation snapshot', () => {
  const source = createDrawAnimationSession(blank());
  const firstFrame = source.frameId, firstLayer = source.layerId;
  let doc = source.document(); doc.pixels[0] = 1; source.commitDocument(doc);

  const withFrame = addAnimationFrame(source.animation, { copy: false });
  const secondFrame = withFrame.frames[1].id;
  source.apply(withFrame, { frameId: secondFrame, layerId: firstLayer });
  const withLayer = addAnimationLayer(source.animation);
  const secondLayer = withLayer.layers[1].id;
  source.apply(withLayer, { frameId: secondFrame, layerId: secondLayer });
  doc = source.document(); doc.pixels[1] = 0; source.commitDocument(doc);

  const snapshot = source.snapshot();
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.timeline.past), true);
  const restored = createDrawAnimationSession(blank());
  restored.restore(snapshot);
  assert.equal(restored.frameId, secondFrame);
  assert.equal(restored.layerId, secondLayer);
  assert.equal(restored.document().pixels[1], 0);

  restored.undo();
  assert.equal(restored.frameId, secondFrame);
  assert.equal(restored.layerId, secondLayer);
  assert.equal(restored.document().pixels[1], -1);
  restored.undo();
  assert.equal(restored.frameId, secondFrame);
  assert.equal(restored.layerId, firstLayer);
  restored.undo();
  assert.equal(restored.frameId, firstFrame);
  assert.equal(restored.layerId, firstLayer);
  restored.redo();
  assert.equal(restored.frameId, secondFrame);
  assert.equal(restored.layerId, firstLayer);
  restored.redo();
  assert.equal(restored.frameId, secondFrame);
  assert.equal(restored.layerId, secondLayer);
  restored.redo();
  assert.equal(restored.document().pixels[1], 0);
});

test('invalid handoff restore leaves live session and undo/redo timeline untouched', () => {
  const session = createDrawAnimationSession(blank());
  const doc = session.document(); doc.pixels[0] = 1; session.commitDocument(doc);
  session.undo();
  const before = session.snapshot();
  const invalid = {
    timeline: before.timeline,
    selections: { ...before.selections, current: { frameId: 'missing-frame', layerId: before.selections.current.layerId } }
  };
  assert.throws(() => session.restore(invalid), /選択状態/);
  assert.equal(session.animation, before.timeline.current);
  assert.equal(session.canUndo, before.timeline.past.length > 0);
  assert.equal(session.canRedo, before.timeline.future.length > 0);
  assert.equal(session.frameId, before.selections.current.frameId);
  assert.equal(session.document().pixels[0], -1);
});
