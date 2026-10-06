import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { addAnimationFrame, addAnimationLayer, setLayerProperties, composeAnimationFrame } from '../../js/creation/animation-core.mjs';
const blank = () => ({ schemaVersion: 1, width: 16, height: 16, palette: ['#101010', '#ff7777'], pixels: Array(256).fill(-1) });
test('frame copies edit independently and undo restores frame identity and pixels', () => {
  const s = createDrawAnimationSession(blank()); let doc = s.document(); doc.pixels[3] = 1; s.commitDocument(doc);
  const first = s.frameId, a = addAnimationFrame(s.animation); doc = s.apply(a, { frameId: a.frames[1].id, layerId: s.layerId }); doc.pixels[3] = 0; s.commitDocument(doc);
  assert.equal(composeAnimationFrame(s.animation, first).pixels[3], 1);
  assert.equal(s.undo().pixels[3], 1); assert.equal(s.undo().pixels[3], 1); assert.equal(s.frameId, first);
  assert.equal(s.redo().pixels[3], 1); assert.equal(s.redo().pixels[3], 0);
});
test('active cel dirty preview respects upper/lower layer occlusion and hidden active layer', () => {
  const s = createDrawAnimationSession(blank()); let doc = s.document(); doc.pixels[0] = 1; s.commitDocument(doc);
  let a = addAnimationLayer(s.animation); const top = a.layers[1].id; doc = s.apply(a, { frameId: s.frameId, layerId: top }); doc.pixels[1] = 0; s.commitDocument(doc);
  doc = s.select(s.frameId, a.layers[0].id); doc.pixels[1] = 1;
  assert.deepEqual(Array.from(s.composite(doc).pixels.slice(0, 2)), [1, 0]);
  doc = s.apply(setLayerProperties(s.animation, top, { visible: false }), { frameId: s.frameId, layerId: top });
  assert.deepEqual(Array.from(s.composite(doc).pixels.slice(0, 2)), [1, -1]);
});
test('palette editing preserves every frame index and blank frame contains no marks', () => {
  const s = createDrawAnimationSession(blank()); let doc = s.document(); doc.pixels[0] = 1; s.commitDocument(doc);
  const a = addAnimationFrame(s.animation, { copy: false }); doc = s.apply(a, { frameId: a.frames[1].id, layerId: s.layerId });
  assert.ok(doc.pixels.every((p) => p === -1)); doc.palette[1] = '#abcdef'; s.commitDocument(doc);
  assert.equal(composeAnimationFrame(s.animation, s.animation.frames[0].id).palette[1], '#abcdef');
  assert.equal(composeAnimationFrame(s.animation, s.animation.frames[0].id).pixels[0], 1);
});

test('prepared selection commit is detached and validates before byte conversion or either history mutation', () => {
  const s = createDrawAnimationSession(blank()), before = s.animation, next = s.document(); next.palette.push('#abcdef'); next.pixels[0] = 2;
  const commit = s.prepareDocument(next);
  assert.equal(s.animation, before); assert.equal(s.canUndo, false);
  next.palette[2] = '#010101'; next.pixels[0] = -1; commit();
  assert.equal(s.document().pixels[0], 2); assert.equal(s.animation.palette[2], '#abcdef');
  s.undo(); assert.equal(s.animation, before);
  for (const value of [-2, 255, 256]) { const bad = s.document(); bad.pixels[0] = value; assert.throws(() => s.prepareDocument(bad)); assert.equal(s.animation, before); }
  const pending = s.prepareDocument(s.document()); s.apply(addAnimationFrame(s.animation)); assert.throws(pending, /対象/);
});
