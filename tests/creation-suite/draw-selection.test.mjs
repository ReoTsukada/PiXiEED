import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawHistory } from '../../js/creation/draw-core.mjs';
import { captureDrawSelection, cloneDrawSelection, createDrawSelectionClipboard, clearDrawSelection, projectDrawSelection, sampleDrawSelection, drawSelectionHandle, resizeDrawSelectionFromHandle } from '../../js/creation/draw-selection-operations.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { addAnimationFrame, addAnimationLayer, getAnimationCelDocument, getAnimationUsedColorIndices } from '../../js/creation/animation-core.mjs';
import { createPxdProject, encodePxd, decodePxd } from '../../js/creation/pxd-codec.mjs';
import { readPxdAnimation, writePxdAnimation } from '../../js/creation/pxd-animation.mjs';
const doc = (pixels = [0, -1, 1, 2], palette = ['#ff0000', '#00ff00', '#0000ff']) => ({ schemaVersion: 1, width: pixels.length, height: 1, palette, pixels });
const bounds = { x: 0, y: 0, width: 2, height: 1 };

test('opaque palette slot zero is copied; transparency has its own byte and original relative position', () => {
  const clip = captureDrawSelection(doc(), bounds);
  assert.deepEqual([...clip.indices], [1, 0]); assert.deepEqual(clip.palette, ['#ff0000']);
  assert.equal(captureDrawSelection(doc([-1, -1]), bounds), null);
});
test('clipboard privately owns all buffers and survives source edits, palette order changes, and reader mutation', () => {
  const source = doc(), clipboard = createDrawSelectionClipboard(), clip = captureDrawSelection(source, bounds);
  clipboard.set(clip); source.palette[0] = '#123456'; source.pixels[0] = 2; clip.indices.fill(0); clip.palette[0] = '#ffffff';
  const read = clipboard.read(); read.indices.fill(0);
  assert.deepEqual([...clipboard.read().indices], [1, 0]); assert.deepEqual(clipboard.read().palette, ['#ff0000']);
  assert.equal(clipboard.set(null), false); assert.equal(clipboard.hasValue, true);
  const target = doc([-1, -1, 1, 1], ['#0000ff', '#00ff00', '#ff0000']);
  assert.deepEqual(projectDrawSelection(target, clipboard.read(), { x: 2, y: 0, width: 2, height: 1 }).document.pixels, [-1, -1, 2, 1]);
});
test('equal colors in different slots match exactly and do not append or replace unrelated palette slots', () => {
  const clip = captureDrawSelection(doc(), bounds), target = doc([-1, -1], ['#00ff00', '#FF0000ff', '#ff0000']);
  const next = projectDrawSelection(target, clip, { x: 0, y: 0, width: 2, height: 1 }).document;
  assert.equal(next.palette.length, 3); assert.equal(next.palette[next.pixels[0]].toLowerCase().slice(0, 7), '#ff0000');
  assert.equal(next.pixels[1], -1);
});
test('move, paste, and cut skip transparent holes with safe overlapping source and destination snapshots', () => {
  const source = doc(), clip = captureDrawSelection(source, bounds);
  assert.deepEqual(clearDrawSelection(source, clip, bounds).pixels, [-1, -1, 1, 2]);
  const move = projectDrawSelection(source, clip, { x: 1, y: 0, width: 2, height: 1 }, { sourceBounds: bounds }).document;
  assert.deepEqual(move.pixels, [-1, 0, 1, 2]); assert.deepEqual(source.pixels, [0, -1, 1, 2]);
  const paste = projectDrawSelection(source, clip, { x: 2, y: 0, width: 2, height: 1 }).document;
  assert.deepEqual(paste.pixels, [0, -1, 0, 2]);
});
test('palette capacity overflow rejects atomically, even after some colors could be added', () => {
  const source = doc([0, 1], ['#f00001', '#f00002']), clip = captureDrawSelection(source, bounds);
  const target = doc([-1, -1], Array.from({ length: 31 }, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`)), before = structuredClone(target);
  assert.throws(() => projectDrawSelection(target, clip, { x: 0, y: 0, width: 2, height: 1 }), /パレット/);
  assert.deepEqual(target, before);
});
test('actual usage across other frames/layers includes transparency and cannot exceed 32 colors', () => {
  const clip = captureDrawSelection(doc([0], ['#f00001']), { x: 0, y: 0, width: 1, height: 1 });
  const target = doc([-1, -1], ['#000000']), before = structuredClone(target);
  const otherColors = Array.from({ length: 31 }, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`);
  assert.throws(() => projectDrawSelection(target, clip, { x: 0, y: 0, width: 1, height: 1 }, { otherColors }), /使用色/);
  assert.deepEqual(target, before);
});
test('clipping budgets only in-bounds sampled colors; wholly outside confirm cannot delete the source', () => {
  const source = doc([0, 1], ['#f00001', '#f00002']), clip = captureDrawSelection(source, bounds);
  const target = doc([-1], Array.from({ length: 31 }, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`));
  const next = projectDrawSelection(target, clip, { x: -1, y: 0, width: 2, height: 1 }).document;
  assert.equal(next.palette.length, 32); assert.equal(next.palette.at(-1), '#f00002');
  const session = createDrawSelectionTransform(source, bounds); session.update({ x: 5 });
  assert.throws(() => session.project(), /キャンバス内/); assert.deepEqual(session.project({ enforceLimits: false }).document.pixels, source.pixels);
});
test('nearest resize previews always use the immutable original, so down/up restores it before confirm', () => {
  const source = doc([0, 1, 2, -1]), session = createDrawSelectionTransform(source, { x: 0, y: 0, width: 4, height: 1 });
  session.update({ width: 1 }); session.project(); session.update({ width: 4 });
  assert.deepEqual(session.project().document.pixels, source.pixels);
  const clip = captureDrawSelection(source, { x: 0, y: 0, width: 4, height: 1 });
  assert.deepEqual([...sampleDrawSelection(clip, { width: 8, height: 1 })], [1, 1, 2, 2, 3, 3, 0, 0]);
});
test('four quarter turns and two flips preserve exact pixels, holes, dimensions and integer pivot', () => {
  for (let width = 1; width <= 7; width++) for (let height = 1; height <= 7; height++) {
    const source = { ...doc(), width: 16, height: 16, pixels: Array(256).fill(-1) }, rect = { x: 4, y: 4, width, height };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) source.pixels[(4 + y) * 16 + 4 + x] = (x + y) % 4 - 1;
    const session = createDrawSelectionTransform(source, rect); if (!session) continue;
    for (let i = 0; i < 4; i++) { session.rotate(1); session.project(); }
    assert.deepEqual(session.rect, rect); assert.deepEqual(session.project().document.pixels, source.pixels);
    for (const axis of ['x', 'y']) { session.flip(axis); session.project(); session.flip(axis); assert.deepEqual(session.project().document.pixels, source.pixels); }
  }
});
test('a 90-degree rotation has the expected exact orientation', () => {
  const source = { ...doc([0, 1, 2, -1, 1, 0]), width: 3, height: 2 }, clip = captureDrawSelection(source, { x: 0, y: 0, width: 3, height: 2 });
  assert.deepEqual([...sampleDrawSelection(clip, { width: 2, height: 3, turns: 1 })], [0, 1, 2, 2, 1, 3]);
});
test('clipboard validation rejects unknown versions, bad bounds, buffers, indices, masks, and alpha', () => {
  const good = captureDrawSelection(doc(), bounds);
  for (const changed of [{ version: 2 }, { format: 'unknown' }, { width: 257 }, { width: NaN }, { indices: new Uint8Array([2, 0]) }, { indices: [-1, 0] }, { indices: new Uint8Array(1) }, { palette: ['#ff000080'] }, { palette: ['#ff000000'] }, { palette: ['#zzz'] }, { mask: new Uint8Array([1]) }, { mask: new Uint8Array([1, 2]) }, { origin: { x: .5, y: 0 } }]) assert.throws(() => cloneDrawSelection({ ...good, ...changed }));
  assert.throws(() => captureDrawSelection(doc([0], ['#12345680']), { x: 0, y: 0, width: 1, height: 1 }), /半透明/);
  assert.equal(captureDrawSelection(doc([0], ['#12345600']), { x: 0, y: 0, width: 1, height: 1 }), null);
});
test('reserved zero supports 255 opaque clipboard entries without wrapping and rejects 256', () => {
  const good = captureDrawSelection(doc(), bounds), palette = Array.from({ length: 255 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`);
  assert.equal(cloneDrawSelection({ ...good, palette, indices: new Uint8Array([255, 0]) }).indices[0], 255);
  assert.throws(() => cloneDrawSelection({ ...good, palette: [...palette, '#ffffff'] }));
});
test('optional selection mask is independent of transparency and excludes unselected opaque cells', () => {
  const clip = { ...captureDrawSelection(doc([0, 1]), bounds), mask: new Uint8Array([0, 1]) };
  assert.deepEqual([...sampleDrawSelection(clip, { width: 2, height: 1 })], [0, 2]);
  assert.deepEqual(clearDrawSelection(doc([0, 1]), clip, bounds).pixels, [0, -1]);
});
test('handles precede interior move, while tiny selection centers remain movable; opposite corner and ratio stay fixed', () => {
  assert.equal(drawSelectionHandle({ x: 2, y: 3 }, { x: 2, y: 3, width: 4, height: 2 }, .5, .5), 'nw');
  assert.equal(drawSelectionHandle({ x: 2.5, y: 3.5 }, { x: 2, y: 3, width: 1, height: 1 }, 1, 1), null);
  assert.deepEqual(resizeDrawSelectionFromHandle({ x: 2, y: 3, width: 4, height: 2 }, 'nw', -4, -2), { x: -2, y: 1, width: 8, height: 4 });
  assert.deepEqual(resizeDrawSelectionFromHandle({ x: 2, y: 3, width: 4, height: 2 }, 'se', 2, 3, false), { x: 2, y: 3, width: 6, height: 5 });
});
test('Cut and Paste are separate history operations; cancelled Paste leaves Cut, Undo restores it', () => {
  const source = doc(), history = createDrawHistory(source), clip = captureDrawSelection(source, bounds);
  assert.equal(history.commit(clearDrawSelection(source, clip, bounds)), true);
  const cut = [...source.pixels], pending = createDrawSelectionTransform(source, { ...bounds, x: 2 }, { clipboard: clip });
  pending.project(); assert.deepEqual(source.pixels, cut);
  assert.equal(history.undo(), true); assert.deepEqual(source.pixels, [0, -1, 1, 2]);
  history.redo(); history.commit(pending.project().document); history.undo(); assert.deepEqual(source.pixels, cut); history.undo(); assert.deepEqual(source.pixels, [0, -1, 1, 2]);
});
test('palette + pixels commit in one animation Undo, preserving all other cels and exact PXD roundtrip', async () => {
  const original = doc([-1, -1], ['#000000']), session = createDrawAnimationSession(original);
  session.apply(addAnimationLayer(addAnimationFrame(session.animation, { copy: false }), { name: 'other' }));
  const before = session.animation, active = session.document(), clip = captureDrawSelection(doc([0], ['#abcdef']), { x: 0, y: 0, width: 1, height: 1 });
  const otherColors = Array.from(getAnimationUsedColorIndices(before, { excludeFrameId: session.frameId, excludeLayerId: session.layerId }), index => index < 0 ? '#00000000' : before.palette[index]);
  const next = projectDrawSelection(active, clip, { x: 0, y: 0, width: 1, height: 1 }, { otherColors }).document;
  session.commitDocument(next); const after = session.animation;
  session.undo(); assert.deepEqual(session.animation.palette, before.palette); assert.deepEqual(session.document().pixels, active.pixels);
  session.redo(); assert.deepEqual(session.animation.palette, after.palette); assert.deepEqual(session.document().pixels, next.pixels);
  const reopened = await readPxdAnimation(await decodePxd(await encodePxd(await writePxdAnimation(createPxdProject(), after))));
  assert.deepEqual(reopened.palette, after.palette);
  for (const frame of after.frames) for (const layer of after.layers) assert.deepEqual(getAnimationCelDocument(reopened, frame.id, layer.id).pixels, getAnimationCelDocument(after, frame.id, layer.id).pixels);
});
