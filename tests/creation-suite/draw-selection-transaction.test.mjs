import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createDrawDocument, createDrawHistory } from '../../js/creation/draw-core.mjs';
import { createDrawAnimationSession } from '../../js/creation/draw-animation-session.mjs';
import { ensureAnimationNormalLayer, getAnimationCelDocument } from '../../js/creation/animation-core.mjs';
import { captureDrawSelection, clearDrawSelection, drawSelectionMaskBounds, getDrawSelectionOtherColors } from '../../js/creation/draw-selection-operations.mjs';
import { createDrawSelectionTransform } from '../../js/creation/draw-selection-session.mjs';

const source = readFileSync(new URL('../../js/creation/draw-page.mjs', import.meta.url), 'utf8');
function extract(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `production function boundary missing: ${start}`);
  return source.slice(first, last);
}
// Execute the production transaction and history adapter. Only browser effects
// and policy decisions are injected; the transaction logic is never duplicated.
const controller = [
  extract('function clearSelection(', 'function placeSelection('),
  extract('function selectionOwnerMatches(', 'function startSelectionTransform('),
  extract('function cancelSelectionTransform(', 'function selectionPanelState('),
  extract('function commitSelectionDocument(', 'function runSelectionAction('),
  extract('function recordedHistory(', '\nhistory = recordedHistory(history);')
].join('\n');

function fixture({ unchanged = false } = {}) {
  const art = createDrawDocument(16); art.pixels[0] = 2;
  const session = createDrawAnimationSession(art), artId = session.layerId;
  const timeline = ensureAnimationNormalLayer(session.animation), normalId = timeline.layers.find(layer => layer.role === 'normal').id;
  session.apply(timeline, { frameId: session.frameId, layerId: normalId });
  const bounds = { x: 5, y: 8, width: 2, height: 1 }, seeded = session.document();
  seeded.pixels[8 * 16 + 5] = 16; seeded.pixels[8 * 16 + 6] = 0;
  session.commitDocument(seeded);
  const clip = captureDrawSelection(session.document(), bounds);
  if (!unchanged) session.commitDocument(clearDrawSelection(session.document(), clip, bounds));
  // Keep only the transaction under test in each history.
  session.load(session.animation, { frameId: session.frameId, layerId: normalId });
  const documentData = session.document(), rawHistory = createDrawHistory(documentData);
  const transform = unchanged
    ? createDrawSelectionTransform(documentData, bounds, { owner: { animation: session.animation, frameId: session.frameId, layerId: normalId } })
    : createDrawSelectionTransform(documentData, bounds, { clipboard: clip, owner: { animation: session.animation, frameId: session.frameId, layerId: normalId } });
  if (!unchanged) transform.update({ y: bounds.y - 4 });
  const preview = transform.project({ enforceLimits: false }).document;
  const controls = { canEdit: true, guard: 'accept', prepareError: null };
  const calls = { canEdit: 0, prepare: 0, guard: 0, paint: 0, focus: 0, panelSync: 0, dirty: 0, renders: 0, cancelled: [], toasts: [] };
  const prepareDocument = session.prepareDocument;
  session.prepareDocument = next => {
    calls.prepare++;
    if (controls.prepareError) throw new Error(controls.prepareError);
    return prepareDocument(next);
  };
  const operationLease = { tag: 'previous operation' }, selectionLease = { tag: 'floating selection' };
  const context = vm.createContext({
    animationSession: session, documentData, history: rawHistory,
    getAnimationCelDocument, getDrawSelectionOtherColors, drawSelectionMaskBounds,
    selectionTransform: transform, selectionPreview: preview, selection: transform.rect,
    selectionDrag: null, selectionError: '', selectionRenderRequest: 41,
    selectionRewardLease: selectionLease, drawOperationLease: operationLease,
    preparedSelectionCommit: null, lastHistoryCommitRejected: false,
    selectionViewStates: new WeakMap(), saved: true, musicLayer: false, lastArtLayerId: artId,
    editingNormalLayer: () => true,
    canEdit() { calls.canEdit++; return controls.canEdit; },
    guardDrawTransition(_animation, { lease }) {
      calls.guard++;
      assert.equal(lease, selectionLease, 'the selection transaction uses its captured lease');
      if (controls.guard === 'throw') throw new Error('commit guard failed');
      return controls.guard !== 'reject';
    },
    drawRewardPolicy: { capture() { throw new Error('the transaction must keep its captured lease'); } },
    timelapse: { reset() {}, record() { throw new Error('normal edits cannot enter ordinary artwork timelapse'); } },
    pxdBridge: { markDirty() { calls.dirty++; } }, animationControls: { refresh() {} },
    selectionPanel: { sync() { calls.panelSync++; } }, selectionControls: { render() { calls.renders++; } },
    cancelAnimationFrame(id) { calls.cancelled.push(id); }, renderPalette() {}, showCurrentColor() {},
    paint() { calls.paint++; }, placeSelection() {}, canvas: { focus() { calls.focus++; } },
    toast(message) { calls.toasts.push(message); }
  });
  vm.runInContext(controller + '\nhistory = recordedHistory(history);', context);
  const before = { animation: session.animation, document: structuredClone(documentData), transform,
    preview, selection: context.selection, operationLease, selectionLease };
  return { context, controls, calls, session, rawHistory, before,
    confirm() { return vm.runInContext('confirmAndDeselect()', context); } };
}

function assertPendingRetained(f) {
  const { context, before, session, rawHistory, calls } = f;
  assert.equal(context.selectionTransform, before.transform, 'the floating selection stays available for retry or cancellation');
  assert.equal(context.selectionPreview, before.preview, 'the valid preview buffer remains available');
  assert.equal(context.selection, before.selection, 'failed confirmation does not deselect');
  assert.deepEqual(context.documentData, before.document, 'committed Cut pixels do not change');
  assert.equal(session.animation, before.animation);
  assert.equal(session.canUndo, false); assert.equal(rawHistory.canUndo, false);
  assert.equal(context.drawOperationLease, before.operationLease);
  assert.equal(context.selectionRewardLease, before.selectionLease);
  assert.equal(context.preparedSelectionCommit, null);
  assert.equal(context.selectionRenderRequest, 41, 'failed confirmation leaves its render request intact');
  assert.equal(context.saved, true); assert.equal(calls.dirty, 0);
  assert.deepEqual(calls.cancelled, []); assert.equal(calls.focus, 0); assert.equal(calls.renders, 0);
}

test('canEdit=false returns before preparation and retains the pending normal Paste', () => {
  const f = fixture(); f.controls.canEdit = false;
  assert.equal(f.confirm(), false);
  assertPendingRetained(f);
  assert.equal(f.calls.prepare, 0); assert.equal(f.calls.guard, 0);
  assert.equal(f.context.lastHistoryCommitRejected, false);
});

test('history rejection keeps pending normal Paste and a later accepted retry commits it once', () => {
  const f = fixture(); f.controls.guard = 'reject';
  assert.equal(f.confirm(), false);
  assert.equal(f.context.lastHistoryCommitRejected, true, 'the real history adapter distinguishes a rejection from a no-op');
  assertPendingRetained(f);
  assert.equal(f.calls.guard, 1);
  f.controls.guard = 'accept';
  assert.equal(f.confirm(), true);
  assert.equal(f.context.lastHistoryCommitRejected, false);
  assert.equal(f.context.selectionTransform, null); assert.equal(f.context.selectionPreview, null); assert.equal(f.context.selection, null);
  assert.equal(f.context.selectionRewardLease, null); assert.equal(f.context.preparedSelectionCommit, null);
  assert.equal(f.context.drawOperationLease, f.before.operationLease);
  assert.deepEqual(f.session.document().pixels, f.before.preview.pixels);
  assert.equal(f.context.saved, false); assert.equal(f.calls.dirty, 1); assert.equal(f.calls.focus, 1);
  assert.deepEqual(f.calls.cancelled, [41]);
  assert.deepEqual(f.session.undo().pixels, f.before.document.pixels);
  assert.equal(f.session.canUndo, false, 'the rejected attempt adds no undo entry');
});

test('an unchanged transform confirms with history=false and lastHistoryCommitRejected=false', () => {
  const f = fixture({ unchanged: true });
  // A previous rejected attempt must not contaminate a later legitimate no-op.
  f.context.lastHistoryCommitRejected = true;
  assert.equal(f.confirm(), true);
  assert.equal(f.context.lastHistoryCommitRejected, false);
  assert.equal(f.session.animation, f.before.animation, 'no-op confirmation does not create an animation revision');
  assert.deepEqual(f.context.documentData, f.before.document);
  assert.equal(f.session.canUndo, false); assert.equal(f.rawHistory.canUndo, false);
  assert.equal(f.context.saved, true); assert.equal(f.calls.dirty, 0);
  assert.equal(f.context.selectionTransform, null); assert.equal(f.context.selectionPreview, null); assert.equal(f.context.selection, null);
  assert.equal(f.context.selectionRewardLease, null); assert.equal(f.context.preparedSelectionCommit, null);
  assert.equal(f.context.drawOperationLease, f.before.operationLease);
  assert.deepEqual(f.calls.cancelled, [41]); assert.equal(f.calls.focus, 1);
});

for (const stage of ['projection', 'prepare', 'commit guard']) test(`${stage} exception retains floating normal pixels and releases temporary commit state`, () => {
  const f = fixture();
  if (stage === 'projection') f.context.selectionTransform.update({ x: 5000 });
  else if (stage === 'prepare') f.controls.prepareError = 'prepare failed';
  else f.controls.guard = 'throw';
  assert.equal(f.confirm(), false);
  assertPendingRetained(f);
  assert.ok(f.context.selectionError, 'the real controller exposes the failure instead of reporting success');
  assert.equal(f.calls.toasts.at(-1), f.context.selectionError);
  assert.equal(f.calls.panelSync, 1);
  if (stage === 'projection') assert.equal(f.calls.prepare, 0);
  else if (stage === 'prepare') assert.equal(f.calls.guard, 0);
  else assert.equal(f.calls.guard, 1);
});
