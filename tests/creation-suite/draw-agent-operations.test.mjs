import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDrawAgentPixelChanges,
  assertDrawAgentPrecondition,
  normalizeDrawAgentOperation,
  prepareDrawAgentColorAdjustment,
} from '../../js/creation/draw-agent-operations.mjs';
import {
  addAnimationFrame,
  createAnimation,
  getAnimationCelDocument,
  writeAnimationCel,
} from '../../js/creation/animation-core.mjs?rev=20261116-normal-release-2';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs?rev=20261117-normal-apply-1';

function fixture() {
  let animation = createAnimation({ width: 3, height: 1, palette: ['#202020', '#808080', '#e0e0e0'] });
  const frame0 = animation.frames[0].id, layer0 = animation.layers[0].id;
  animation = writeAnimationCel(animation, frame0, layer0, { width: 3, height: 1, pixels: [1, 2, 3] });
  animation = addAnimationFrame(animation, { sourceFrameId: frame0, copy: false });
  const frame1 = animation.frames[1].id;
  animation = writeAnimationCel(animation, frame1, layer0, { width: 3, height: 1, pixels: [3, 2, 1] });
  return { animation, frame0, frame1, layer0 };
}

const colorSettings = { brightness: 24, contrast: 0, saturation: 100, curve: [0, 64, 128, 192, 255], paletteMode: 'exact' };
const bind = { projectBinding: { projectId: 'p1', openEpoch: 'o1' }, revision: 7 };

test('pixel batches apply exact palette indices and transparency without mutating the source', () => {
  const source = { width: 3, height: 1, palette: ['#000000', '#ffffff'], pixels: [-1, 0, 1] };
  const result = applyDrawAgentPixelChanges(source, [
    { x: 0, y: 0, colorIndex: 1 }, { x: 2, y: 0, colorIndex: null },
  ]);
  assert.deepEqual(result.document.pixels, [1, 0, -1]);
  assert.deepEqual(source.pixels, [-1, 0, 1]);
  assert.equal(result.changedCount, 2);
});

test('invalid pixel batches fail atomically, including duplicate and out-of-range cells', () => {
  const source = { width: 2, height: 1, palette: ['#000000'], pixels: [-1, 0] };
  assert.throws(() => applyDrawAgentPixelChanges(source, [
    { x: 0, y: 0, colorIndex: 0 }, { x: 2, y: 0, colorIndex: null },
  ]), RangeError);
  assert.throws(() => applyDrawAgentPixelChanges(source, [
    { x: 0, y: 0, colorIndex: 0 }, { x: 0, y: 0, colorIndex: null },
  ]), /duplicate/i);
  assert.deepEqual(source.pixels, [-1, 0]);
  assert.throws(() => normalizeDrawAgentOperation({ type: 'pixels.set', frameId: 'f1', layerId: 'l1', pixels: Array.from({ length: 513 }, (_, x) => ({ x: x % 2, y: 0, colorIndex: 0 })) }, {
    width: 2, height: 1, paletteLength: 1, frames: [{ id: 'f1' }], layers: [{ id: 'l1' }],
  }), /1-512/);
});

test('locked and music layers reject pixel and color mutations before preparation', () => {
  const context = { width: 2, height: 1, paletteLength: 1, frames: [{ id: 'f1' }], layers: [{ id: 'l1', locked: true }] };
  assert.throws(() => normalizeDrawAgentOperation({ type: 'pixel.set', frameId: 'f1', layerId: 'l1', x: 0, y: 0, colorIndex: 0 }, context), /locked/i);
  assert.throws(() => normalizeDrawAgentOperation({ type: 'color.adjust', scope: 'whole', frameId: 'f1', layerId: 'l1', settings: colorSettings }, context), /unlock/i);
  const music = { ...context, layers: [{ id: 'l1', role: 'music', locked: false }] };
  assert.throws(() => normalizeDrawAgentOperation({ type: 'pixel.set', frameId: 'f1', layerId: 'l1', x: 0, y: 0, colorIndex: 0 }, music), /music/i);
});

test('cel color adjustment changes only its cel; whole adjustment transforms the shared palette', async () => {
  const { animation, frame0, frame1, layer0 } = fixture();
  const adjustedCel = await prepareDrawAgentColorAdjustment(animation, {
    type: 'color.adjust', scope: 'cel', frameId: frame0, layerId: layer0, settings: colorSettings,
  });
  assert.notEqual(adjustedCel, animation);
  assert.deepEqual(getAnimationCelDocument(adjustedCel, frame1, layer0).pixels, getAnimationCelDocument(animation, frame1, layer0).pixels);
  assert.deepEqual(adjustedCel.palette.slice(0, animation.palette.length), animation.palette);
  const adjustedWhole = await prepareDrawAgentColorAdjustment(animation, {
    type: 'color.adjust', scope: 'whole', frameId: frame0, layerId: layer0, settings: colorSettings,
  });
  assert.notDeepEqual(adjustedWhole.palette, animation.palette);
  assert.deepEqual(getAnimationCelDocument(adjustedWhole, frame1, layer0).pixels, getAnimationCelDocument(animation, frame1, layer0).pixels);
});

test('revision and project binding are required and reopen epochs invalidate old calls', () => {
  assert.equal(assertDrawAgentPrecondition({ expectedRevision: 7, projectBinding: bind.projectBinding }, bind), true);
  assert.throws(() => assertDrawAgentPrecondition({ expectedRevision: 6, projectBinding: bind.projectBinding }, bind), error => error.code === 'DRAW_AGENT_STALE_REVISION');
  assert.throws(() => assertDrawAgentPrecondition({ expectedRevision: 7, projectBinding: { projectId: 'p1', openEpoch: 'o2' } }, bind), error => error.code === 'DRAW_AGENT_STALE_PROJECT');
});

test('timeline mutations use Draw history so undo and redo restore exact cel data', () => {
  const { animation, frame0, layer0 } = fixture();
  const initialCel = getAnimationCelDocument(animation, frame0, layer0);
  const session = createDrawAnimationSession(initialCel);
  const activeFrame = session.frameId, activeLayer = session.layerId;
  const changed = writeAnimationCel(session.animation, activeFrame, activeLayer, { width: 3, height: 1, pixels: [1, 1, 3] });
  session.apply(changed);
  assert.equal(session.canUndo, true);
  assert.deepEqual(getAnimationCelDocument(session.animation, activeFrame, activeLayer).pixels, [0, 0, 2]);
  session.undo();
  assert.deepEqual(getAnimationCelDocument(session.animation, activeFrame, activeLayer).pixels, [0, 1, 2]);
  assert.equal(session.canRedo, true);
  session.redo();
  assert.deepEqual(getAnimationCelDocument(session.animation, activeFrame, activeLayer).pixels, [0, 0, 2]);
});

test('frame.add defaults to the active frame and copying when omitted', () => {
  const normalized = normalizeDrawAgentOperation({ type: 'frame.add' }, {
    width: 1, height: 1, paletteLength: 1, frames: [{ id: 'f1' }], layers: [{ id: 'l1' }], active: { frameId: 'f1' },
  });
  assert.deepEqual(normalized, { type: 'frame.add', sourceFrameId: 'f1', copy: true });
});
