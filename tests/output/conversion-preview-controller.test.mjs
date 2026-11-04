import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyConversionPreview, createConversionPreviewController } from '../../js/creation/conversion-preview-controller.mjs';

const result = (href, filename) => ({ href, filename });

test('preview is optional and eligibility requires a ready media result and stage', () => {
  const controller = createConversionPreviewController();
  assert.equal(controller.update({ media: true, ready: true, stageAvailable: false, result: result('blob:a', 'a.png') }).eligible, false);
  assert.equal(controller.update({ media: true, ready: false, stageAvailable: true, result: result('blob:a', 'a.png') }).eligible, false);
  const state = controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:a', 'a.png') });
  assert.equal(state.eligible, true);
  assert.equal(state.inspectResult, false);
  assert.equal(state.load, false);
});

test('source/result selection preserves the source as default and loads only on explicit inspection', () => {
  const controller = createConversionPreviewController();
  controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:a', 'a.png') });
  const selected = controller.selectInspect(true);
  assert.equal(selected.identity.startsWith(`${JSON.stringify(['blob:a','img'])}#`), true);
  assert.equal(selected.href, 'blob:a'); assert.equal(selected.filename, 'a.png'); assert.equal(selected.type, 'img');
  assert.equal(selected.eligible, true); assert.equal(selected.inspectResult, true); assert.equal(selected.failed, false); assert.equal(selected.load, true);
  assert.equal(controller.selectInspect(false).inspectResult, false);
  assert.equal(controller.selectInspect(true).load, false);
});

test('format classification covers audio, audio-webm, video and unsupported fallback', () => {
  for (const ext of ['wav','mp3','ogg','opus','flac','aiff','m4a']) assert.equal(classifyConversionPreview(`x.${ext}`), 'audio');
  assert.equal(classifyConversionPreview('x.webm', true), 'audio');
  assert.equal(classifyConversionPreview('x.webm', false), 'video');
  assert.equal(classifyConversionPreview('x.mp4'), 'video');
  assert.equal(classifyConversionPreview('x.png'), 'img');
  assert.equal(classifyConversionPreview('x.zip'), null);
});

test('stale error identity cannot fail a newer result and same identity retains failure without reload', () => {
  const controller = createConversionPreviewController();
  controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:old', 'old.png') });
  const old = controller.selectInspect(true).identity;
  assert.equal(controller.fail(old).failed, true);
  const same = controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:old', 'old.png') });
  assert.equal(same.failed, true);
  assert.equal(same.load, false);
  const next = controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:new', 'new.png') });
  assert.equal(next.failed, false);
  assert.equal(next.load, true);
  assert.equal(controller.fail(old).failed, false);
});

test('new filename/kind identity clears failure and retry is explicit', () => {
  const controller = createConversionPreviewController();
  controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:same', 'a.png') });
  const old = controller.selectInspect(true).identity;
  controller.fail(old);
  const updated = controller.update({ media: true, ready: true, stageAvailable: true, audioHint: true, result: result('blob:same', 'a.webm') });
  assert.equal(updated.failed, false);
  assert.equal(updated.type, 'audio');
  assert.equal(updated.load, true);
  controller.fail(updated.identity);
  assert.equal(controller.update({ media: true, ready: true, stageAvailable: true, audioHint: true, result: result('blob:same', 'a.webm') }).load, false);
  assert.equal(controller.selectInspect(true).load, true);
});

test('failure never changes save readiness or invokes a save callback', () => {
  let saves = 0;
  const controller = createConversionPreviewController({ save() { saves++; } });
  const state = controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:a', 'a.png') });
  controller.fail(state.identity);
  assert.equal(controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:a', 'a.png') }).eligible, true);
  assert.equal(saves, 0);
});

test('a retry gets a new attempt token and late errors from the old attempt are ignored', () => {
  const controller = createConversionPreviewController();
  controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:same', 'same.png') });
  const first = controller.selectInspect(true);
  controller.fail(first.identity);
  const retry = controller.selectInspect(true);
  assert.equal(retry.load, true);
  assert.notEqual(retry.identity, first.identity);
  const stale = controller.fail(first.identity);
  assert.equal(stale.identity, retry.identity);
  assert.equal(stale.failed, false);
  assert.equal(controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:same', 'same.png') }).identity, retry.identity);
});

test('switching source view and back preserves a healthy loaded attempt and its playback resource', () => {
  const controller = createConversionPreviewController();
  controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:same', 'same.png') });
  const first = controller.selectInspect(true);
  controller.selectInspect(false);
  const second = controller.selectInspect(true);
  assert.equal(second.identity, first.identity);
  assert.equal(second.load, false);
  assert.equal(controller.fail(first.identity).failed, true);
});

test('switching away from a failed preview explicitly retries with a new attempt token', () => {
  const controller = createConversionPreviewController();
  controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:same', 'same.png') });
  const first = controller.selectInspect(true);
  controller.fail(first.identity);
  controller.selectInspect(false);
  const retry = controller.selectInspect(true);
  assert.notEqual(retry.identity, first.identity);
  assert.equal(retry.load, true);
  assert.equal(controller.fail(first.identity).identity, retry.identity);
  assert.equal(controller.fail(first.identity).failed, false);
});

test('renaming the same URL and preview type updates the label without reloading or clearing failure', () => {
  const controller = createConversionPreviewController();
  controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:same', 'first.png') });
  const first = controller.selectInspect(true);
  controller.fail(first.identity);
  const renamed = controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:same', 'renamed.png') });
  assert.equal(renamed.filename, 'renamed.png');
  assert.equal(renamed.identity, first.identity);
  assert.equal(renamed.load, false);
  assert.equal(renamed.failed, true);
  const changedType = controller.update({ media: true, ready: true, stageAvailable: true, result: result('blob:same', 'renamed.webm') });
  assert.equal(changedType.type, 'video');
  assert.equal(changedType.identity === first.identity, false);
  assert.equal(changedType.failed, false);
  assert.equal(changedType.load, true);
});
