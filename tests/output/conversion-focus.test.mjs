import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeferredFocusGuard } from '../../js/creation/conversion-stage.mjs';

function fixture() {
  const listeners = new Map(), frames = [];
  const body = {}, documentElement = {}, owner = {}, outside = {};
  const doc = {
    body, documentElement, activeElement: owner,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
    interact(type, target = outside) { this.activeElement = target; listeners.get(type)?.({ target }); },
  };
  const win = { requestAnimationFrame(fn) { frames.push(fn); } };
  const guard = createDeferredFocusGuard({ doc, win });
  return { guard, doc, owner, outside, body, listeners, pending: () => frames.length,
    flush() { frames.splice(0).forEach(fn => fn()); } };
}

test('latest async operation owns deferred focus; an older completion cannot steal it', () => {
  const f = fixture(), focused = [];
  const a = f.guard.begin(f.owner), b = f.guard.begin(f.owner);
  f.guard.schedule(a, () => focused.push('A'));
  f.guard.schedule(b, () => focused.push('B'));
  f.flush();
  assert.deepEqual(focused, ['B']);
});

test('outside pointer, key, or focus during an await cancels the pending restore', () => {
  for (const type of ['pointerdown', 'keydown', 'focusin']) {
    const f = fixture(), focused = [], ticket = f.guard.begin(f.owner);
    f.guard.schedule(ticket, () => focused.push(true));
    f.doc.interact(type, f.outside); f.flush();
    assert.deepEqual(focused, [], type);
  }
});

test('native removal or disable may blur to body and still restore owned focus', () => {
  const f = fixture(), focused = [], ticket = f.guard.begin(f.owner);
  f.guard.schedule(ticket, () => focused.push(true));
  f.doc.activeElement = f.doc.body; f.flush();
  assert.deepEqual(focused, [true]);
});

test('explicit focus elsewhere, failed operation, and destroy suppress queued restoration', () => {
  const f = fixture(), focused = [];
  const ticket = f.guard.begin(f.owner);
  f.guard.schedule(ticket, () => focused.push('failed-operation-should-not-schedule'), false);
  f.flush(); assert.deepEqual(focused, []);
  const next = f.guard.begin(f.owner);
  f.guard.schedule(next, () => focused.push('focus'));
  f.doc.interact('focusin', f.outside); f.flush();
  const final = f.guard.begin(f.owner);
  f.guard.schedule(final, () => focused.push('destroyed'));
  f.guard.destroy(); f.flush();
  assert.deepEqual(focused, []);
  assert.equal(f.listeners.size, 0);
});
