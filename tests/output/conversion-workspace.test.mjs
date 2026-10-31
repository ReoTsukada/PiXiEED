import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspacePanel } from '../../js/creation/conversion-workspace.mjs';
function fixture(wide = false) {
  const listeners = new Map(), mediaListeners = new Map(), attrs = new Map();
  let focus = 0, pushes = 0, backs = 0, modal = false;
  const panel = { open: false, show() { this.open = true; modal = false; }, showModal() { this.open = true; modal = true; }, close() { this.open = false; modal = false; } };
  const open = { getAttribute: key => attrs.get(key), setAttribute: (key, value) => attrs.set(key, value), addEventListener() {}, removeEventListener() {}, focus() { focus++; } };
  const desktop = { matches: wide, addEventListener: (key, value) => mediaListeners.set(key, value), removeEventListener: key => mediaListeners.delete(key) };
  const stack = [{ preserved: 1 }]; let index = 0;
  const win = { history: { get state() { return stack[index]; }, pushState(value) { stack.splice(++index); stack[index] = value; pushes++; }, replaceState(value) { stack[index] = value; }, back() { backs++; } }, addEventListener: (key, value) => listeners.set(key, value), removeEventListener: key => listeners.delete(key) };
  const api = createWorkspacePanel({ panel, open, desktop, win });
  return { api, panel, win, attrs, get modal() { return modal; }, get focus() { return focus; }, get pushes() { return pushes; }, get backs() { return backs; }, pop() { index = Math.max(0, index - 1); listeners.get('popstate')?.(); }, forward() { index = Math.min(index + 1, stack.length - 1); listeners.get('popstate')?.(); }, resize(wide) { desktop.matches = wide; mediaListeners.get('change')?.(); } };
}
test('mobile close waits for history, coalesces repeated close, restores focus and preserves state', () => {
  const f = fixture(); f.api.update(true); f.api.show(); f.api.show();
  assert.equal(f.pushes, 1); assert.equal(f.modal, true); assert.equal(f.win.history.state.preserved, 1);
  f.api.dismiss(); f.api.dismiss(); assert.equal(f.backs, 1); assert.equal(f.panel.open, true);
  f.pop(); assert.equal(f.panel.open, false); assert.equal(f.focus, 1); assert.equal(f.attrs.get('aria-expanded'), 'false');
  assert.deepEqual(f.win.history.state, { preserved: 1 });
});
test('open during pending close reopens once after pop, without navigating away', () => {
  const f = fixture(); f.api.update(true); f.api.show(); f.api.dismiss(); f.api.show(); f.api.show(); f.pop();
  assert.equal(f.panel.open, true); assert.equal(f.modal, true); assert.equal(f.pushes, 2); assert.equal(f.backs, 1);
});
test('browser Back and Forward own mobile sheet without replacing conversion state', () => {
  const f = fixture(); f.api.update(true); f.api.show(); f.pop();
  assert.equal(f.panel.open, false); f.forward(); assert.equal(f.panel.open, true); assert.equal(f.modal, true);
});
test('desktop settings are nonmodal and do not add history; orientation clears stale mobile marker', () => {
  const f = fixture(true); f.api.update(true); assert.equal(f.panel.open, true); assert.equal(f.modal, false); assert.equal(f.pushes, 0);
  f.api.dismiss(); assert.equal(f.panel.open, true); f.resize(false); assert.equal(f.panel.open, false);
  f.api.show(); assert.equal(f.modal, true); f.resize(true); assert.equal(f.modal, false); assert.equal(f.win.history.state.pixieedConversionSettings, undefined);
  f.resize(false); assert.equal(f.panel.open, false); f.api.show(); f.api.dismiss(); f.pop(); assert.equal(f.panel.open, false);
});
test('switching media/text releases dialog and retains unrelated history; destroy ignores late pop', () => {
  const f = fixture(); f.api.update(true); f.api.show(); f.api.update(false);
  assert.equal(f.panel.open, false); assert.equal(f.win.history.state.preserved, 1); assert.equal(f.win.history.state.pixieedConversionSettings, undefined);
  f.api.show(); assert.equal(f.modal, true); f.api.dismiss(); f.api.destroy(); f.pop();
  f.api.show(); assert.equal(f.pushes, 2);
});

import { createConversionSaveIntent } from '../../js/creation/conversion-workspace.mjs';
function saveFixture(extra = {}) {
  const state = { mode: 'media', revision: 1, loaded: true, live: false, working: false,
    href: '', link: null, ready: false, matchesFormat: true, fpsDirty: false, sizeDirty: false, ...extra };
  const calls = [], saves = []; let chosen = 0, rejected = 0;
  const api = createConversionSaveIntent({ snapshot: () => ({ ...state }),
    run(stage) { calls.push(stage); state.working = true; return true; },
    save(link) { saves.push(link); }, choose() { chosen++; }, blocked() { rejected++; },
    stageComplete(stage) { if (stage === 'fps') state.fpsDirty = false; if (stage === 'size') state.sizeDirty = false; state.ready = !state.fpsDirty && !state.sizeDirty; },
  });
  return { state, calls, saves, api, get chosen() { return chosen; }, get rejected() { return rejected; }, finish(href = 'blob:current', ready = true) {
    state.working = false; state.href = href; state.link = { href }; state.ready = ready; api.observe();
  } };
}
test('one save click converts and downloads once; observing or re-rendering adds no mandatory click', () => {
  const f = saveFixture(); f.api.request(); f.api.request(); assert.deepEqual(f.calls, ['convert']);
  f.finish(); assert.equal(f.saves.length, 1); assert.equal(f.api.pending, false);
  f.api.observe(); assert.equal(f.saves.length, 1);
  f.api.request(); assert.equal(f.saves.length, 2); assert.deepEqual(f.calls, ['convert']); // Explicit re-save only.
});
test('a single save intent carries FPS and size stages to the final file', () => {
  const f = saveFixture({ fpsDirty: true, sizeDirty: true }); f.api.request(); assert.deepEqual(f.calls, ['fps']);
  f.finish('blob:fps', false); assert.deepEqual(f.calls, ['fps', 'size']); assert.equal(f.saves.length, 0);
  f.finish('blob:sized', false); assert.equal(f.saves.length, 1); assert.equal(f.saves[0].href, 'blob:sized');
});
test('settings revision or mode changes invalidate a pending save and never download stale bytes', () => {
  for (const change of [s => s.revision++, s => { s.mode = 'input'; }]) {
    const f = saveFixture(); f.api.request(); change(f.state); f.finish(); assert.equal(f.saves.length, 0); assert.equal(f.api.pending, false);
  }
});
test('failure and cancel retain the old result without saving it; retry is explicit', () => {
  for (const cancelled of [false, true]) {
    const f = saveFixture({ href: 'blob:previous', link: { href: 'blob:previous' } }); f.api.request();
    if (cancelled) f.api.cancel(); f.finish('blob:previous', false);
    assert.equal(f.saves.length, 0); assert.equal(f.api.pending, false); f.api.request(); f.finish('blob:retried'); assert.equal(f.saves[0].href, 'blob:retried');
  }
});
test('automatic live preview never downloads without an explicit save request', () => {
  const f = saveFixture({ live: true }); f.finish(); assert.equal(f.saves.length, 0); f.api.request(); assert.equal(f.saves.length, 1); assert.deepEqual(f.calls, []);
});
test('save pressed while realtime preview is queued waits for that revision then downloads', () => {
  const f = saveFixture({ live: true, working: true }); f.api.request(); assert.deepEqual(f.calls, ['live']);
  f.api.observe(); assert.equal(f.saves.length, 0); f.finish(); assert.equal(f.saves.length, 1); assert.equal(f.api.pending, false);
});
test('paused live preview refreshes and saves with the same click; text input uses its existing engine', () => {
  for (const extra of [{ live: true, mode: 'output' }, { mode: 'input' }]) {
    const f = saveFixture(extra); f.api.request(); assert.deepEqual(f.calls, [extra.live ? 'live' : 'convert']); f.finish(); assert.equal(f.saves.length, 1);
  }
});
test('wrong-format completion is blocked, and no source opens selection without creating work', () => {
  const f = saveFixture(); f.api.request(); f.state.matchesFormat = false; f.finish(); assert.equal(f.rejected, 1); assert.equal(f.saves.length, 0);
  const empty = saveFixture({ loaded: false }); empty.api.request(); assert.equal(empty.chosen, 1); assert.deepEqual(empty.calls, []);
});
test('validation refusal or a no-op engine cannot leave a pending save lock', () => {
  for (const result of [false, undefined]) {
    const api = createConversionSaveIntent({ snapshot: () => ({ loaded: true, working: false, mode: 'media', revision: 1, href: '' }), run: () => result, save() { throw Error('unexpected save'); }, choose() {} });
    api.request(); assert.equal(api.pending, false);
  }
});

test('native asynchronous FPS persistence can finish without a Blob and the same save continues to generation', async () => {
  const state = { mode: 'media', revision: 1, loaded: true, working: false, ready: false, href: 'blob:old', link: { href: 'blob:old' }, matchesFormat: true, fpsDirty: true };
  const tasks = [], saved = []; let scheduled = 0;
  const api = createConversionSaveIntent({ snapshot: () => ({ ...state }), choose() {}, save: link => saved.push(link.href), settled: () => scheduled++,
    stageComplete(stage) { if (stage === 'fps') state.fpsDirty = false; },
    run(stage) { state.working = true; return new Promise(resolve => tasks.push({ stage, resolve })); },
  });
  api.request(); assert.equal(tasks[0].stage, 'fps'); api.observe(); assert.equal(saved.length, 0);
  state.working = false; tasks[0].resolve(true); await Promise.resolve(); api.observe(); assert.equal(tasks[1].stage, 'convert'); assert.equal(saved.length, 0);
  state.working = false; state.href = 'blob:new'; state.link = { href: state.href }; state.ready = true; api.observe(); // The task is not settled yet.
  assert.equal(saved.length, 0); tasks[1].resolve(true); await Promise.resolve(); api.observe();
  assert.deepEqual(saved, ['blob:new']); assert.equal(scheduled, 2); assert.equal(api.pending, false);
});
test('async action failure or cancellation cannot save or continue a chain', async () => {
  for (const result of [false, true]) {
    let finish; const state = { mode: 'media', revision: 1, loaded: true, working: true, ready: false, href: '' }; const saved = [];
    const api = createConversionSaveIntent({ snapshot: () => ({ ...state, working: false }), run: () => new Promise(resolve => { finish = resolve; }), save: link => saved.push(link), choose() {} });
    api.request(); if (result) api.cancel(); state.href = 'blob:late'; state.link = { href: state.href }; state.ready = true;
    finish(result); await Promise.resolve(); api.observe(); assert.equal(saved.length, 0); assert.equal(api.pending, false);
  }
});
test('async rejected action releases save UI and reports an error without starting a download', async () => {
  let rejectTask, failed = 0, settled = 0; const saved = [];
  const api = createConversionSaveIntent({ snapshot: () => ({ loaded: true, mode: 'media', revision: 1, working: false, href: '' }),
    run: () => new Promise((resolve, reject) => { rejectTask = reject; }), save: link => saved.push(link), choose() {}, blocked() { failed++; }, settled() { settled++; },
  });
  api.request(); rejectTask(Error('failed')); await Promise.resolve(); api.observe();
  assert.deepEqual([failed, settled, saved.length, api.pending], [1, 1, 0, false]);
});
