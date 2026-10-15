import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCameraTarget, planCameraReplacement } from '../../js/creation/draw-camera-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { addAnimationFrame, addAnimationLayer, composeAnimationFrame } from '../../js/creation/animation-core.mjs';

const document = (palette = ['#101010', '#eeeeee']) => ({ schemaVersion: 1, width: 16, height: 16, palette, pixels: Array(256).fill(-1) });
const samples = (...colors) => Uint8ClampedArray.from(colors.flat());
const target = (doc, cells = [0, 2, 17], allowed) => {
  const mask = new Uint8Array(256); cells.forEach(index => { mask[index] = 1; });
  return prepareCameraTarget(doc, mask, allowed);
};

test('camera appends only used opaque colors, deduplicates normalized hex, and preserves palette order and selection holes', () => {
  const doc = document(['#ABCDEFff', '#101010', '#abcdefff']); doc.pixels[1] = 1;
  const before = structuredClone(doc);
  const plan = planCameraReplacement(target(doc), samples([171, 205, 239, 255], [12, 34, 56, 255], [12, 34, 56, 255]));
  assert.deepEqual(plan.document.palette, [...doc.palette, '#0c2238']);
  assert.deepEqual(plan.additions, ['#0c2238']);
  assert.deepEqual([0, 1, 2, 17].map(i => plan.document.pixels[i]), [0, 1, 3, 3]);
  assert.deepEqual(doc, before);
  const repeat = planCameraReplacement(target(plan.document), samples([12, 34, 56, 255], [12, 34, 56, 255], [171, 205, 239, 255]));
  assert.deepEqual(repeat.additions, []); assert.deepEqual(repeat.document.palette, plan.document.palette);
});

test('camera transparency occupies no palette slot and partial alpha stays exact in detached plans', () => {
  const doc = document(), snapshot = target(doc), before = structuredClone(doc);
  const result = planCameraReplacement(snapshot, samples([1, 2, 3, 0], [12, 34, 56, 255], [9, 8, 7, 0]));
  assert.deepEqual(result.additions, ['#0c2238']);
  assert.deepEqual([0, 2, 17].map(i => result.document.pixels[i]), [-1, 2, -1]);
  const alpha = planCameraReplacement(snapshot, samples([12, 34, 56, 255], [1, 2, 3, 128], [9, 8, 7, 255]));
  assert.ok(alpha.document.palette.includes('#01020380'));
  assert.deepEqual(doc, before); assert.deepEqual(snapshot.document, before);
});

test('fixed palette selects only allowed existing entries and keeps transparent pixels', () => {
  const doc = document(['#000000', '#ff0000', '#ffffff']);
  const plan = planCameraReplacement(target(doc, [0, 2, 17], [0, 2]), samples([254, 10, 10, 255], [250, 250, 250, 255], [10, 10, 10, 0]), { paletteFixed: true });
  assert.deepEqual(plan.additions, []); assert.deepEqual(plan.document.palette, doc.palette);
  assert.deepEqual([0, 2, 17].map(i => plan.document.pixels[i]), [0, 2, -1]);
});

test('unused registered entries do not consume the visible camera color allowance', () => {
  const palette = Array.from({ length: 64 }, (_, i) => `#${i.toString(16).padStart(2, '0')}0000`);
  const doc = document(palette), snapshot = target(doc), before = structuredClone(doc);
  assert.equal(planCameraReplacement(snapshot, samples([31, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 255])).document.palette.length, 64);
  assert.equal(planCameraReplacement(snapshot, samples([31, 0, 0, 255], [12, 34, 56, 255], [0, 0, 0, 0]), {maxColors:32}).document.palette.length, 65);
  assert.deepEqual(snapshot.document, before); assert.deepEqual(doc, before);
});

test('camera pixel and palette append commit as one animation Undo across layers and frames', () => {
  const session = createDrawAnimationSession(document());
  let doc = session.document(); doc.pixels[5] = 1; session.commitDocument(doc);
  const firstFrame = session.frameId, firstLayer = session.layerId;
  let animation = addAnimationFrame(session.animation, { copy: true });
  doc = session.apply(animation, { frameId: animation.frames[1].id, layerId: firstLayer });
  animation = addAnimationLayer(session.animation);
  doc = session.apply(animation, { frameId: session.frameId, layerId: animation.layers.at(-1).id });
  const before = session.animation, historySize = session.snapshot().timeline.past.length;
  const plan = planCameraReplacement(target(doc), samples([12, 34, 56, 255], [12, 34, 56, 255], [0, 0, 0, 0]));
  session.commitDocument(plan.document);
  assert.equal(session.snapshot().timeline.past.length, historySize + 1);
  assert.equal(composeAnimationFrame(session.animation, firstFrame).pixels[5], 1);
  assert.equal(composeAnimationFrame(session.animation, session.frameId).pixels[5], 1);
  assert.equal(session.document().pixels[0], 2); assert.deepEqual(session.animation.palette, [...before.palette, '#0c2238']);
  const after = session.animation;
  session.undo(); assert.equal(session.animation, before);
  session.redo(); assert.equal(session.animation, after);
});

test('incorrect sample length is rejected before any palette append', () => {
  const snapshot = target(document());
  assert.throws(() => planCameraReplacement(snapshot, samples([12, 34, 56, 255])), /画素数/);
  assert.equal(snapshot.palette.length, 2);
});


test('camera free32/reward64 counts used RGBA across other cels and never mutates on 33/65 overflow', () => {
 const palette=Array.from({length:64},(_,i)=>`#${i.toString(16).padStart(2,'0')}2233`);
 const doc=document(palette); for(let i=0;i<64;i++)doc.pixels[i]=i;
 const snapshot=target(doc,[100]), before=structuredClone(doc);
 assert.throws(()=>planCameraReplacement(snapshot,samples([1,34,51,255]),{maxColors:32}),{code:'camera-palette-overflow'});
 assert.equal(planCameraReplacement(snapshot,samples([1,34,51,255]),{maxColors:64}).document.palette.length,64);
 assert.throws(()=>planCameraReplacement(snapshot,samples([200,100,50,255]),{maxColors:64}),{code:'camera-palette-overflow'});
 assert.deepEqual(doc,before);
 const free=document(palette);free.pixels[0]=0;
 assert.doesNotThrow(()=>planCameraReplacement(target(free,[1]),samples([1,34,51,255]),{maxColors:32}));
});
